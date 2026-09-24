import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import type { DataSource, EntityManager } from 'typeorm';
import { AssessmentsService } from '../../assessments/assessments.service.js';
import { CatalogService } from '../../catalog/catalog.service.js';
import type { Roadmap } from '../entities/roadmap.entity.js';
import type { OpenAiRoadmapClient } from '../openai-roadmap.client.js';
import { RoadmapsService } from '../roadmaps.service.js';
import { course, profile } from './fixtures.js';

const typescript = course({
  id: 1,
  title: 'TypeScript',
  technologies: [{ id: 8, name: 'TypeScript' }],
});
const nest = course({
  id: 2,
  title: 'NestJS',
  prerequisiteIds: [1],
  categories: [{ id: 1, name: 'Backend' }],
  technologies: [{ id: 3, name: 'NestJS' }],
});
const catalog = [typescript, nest];
const learner = profile();

function setup(options?: {
  catalog?: typeof catalog;
  content?: string;
  validate?: (ids: number[]) => Promise<typeof catalog>;
}) {
  const saved: unknown[] = [];
  const assessments = {
    getProfileForUser: vi.fn().mockResolvedValue(learner),
  };
  const courses = options?.catalog ?? catalog;
  const catalogService = {
    getPublishedCatalog: vi.fn().mockResolvedValue(courses),
    validateRoadmapSelection:
      options?.validate ??
      vi.fn(async (ids: number[]) =>
        ids.map((id) => courses.find((item) => item.id === id)!),
      ),
    getCoursesForExistingRoadmap: vi.fn(async (ids: number[]) =>
      ids.map((id) => courses.find((item) => item.id === id)!),
    ),
  };
  const llm = {
    complete: vi.fn().mockResolvedValue({
      content:
        options?.content ??
        JSON.stringify({
          title: 'APIs',
          rationale: 'TypeScript y luego Nest.',
          courseIds: [1, 2],
        }),
      model: 'gpt-4.1-mini',
    }),
  };
  const dataSource = {
    transaction: async (work: (manager: EntityManager) => Promise<unknown>) => {
      const manager = {
        query: vi.fn().mockResolvedValue(undefined),
        create: (_entity: unknown, data: object) => data,
        save: vi.fn(async (value: object) => {
          saved.push(value);
          if (Array.isArray(value)) return value;
          return {
            id: 4,
            createdAt: new Date('2026-09-23T18:00:00.000Z'),
            ...value,
          };
        }),
      };
      return work(manager as unknown as EntityManager);
    },
  };
  const roadmaps = {
    find: vi.fn().mockResolvedValue([]),
    findOne: vi.fn().mockResolvedValue(null),
  };
  const service = new RoadmapsService(
    roadmaps as never,
    catalogService as unknown as CatalogService,
    assessments as unknown as AssessmentsService,
    dataSource as unknown as DataSource,
    llm as unknown as OpenAiRoadmapClient,
  );
  return { service, saved, llm, assessments, catalogService, roadmaps };
}

it('saves a validated roadmap for the authenticated user', async () => {
  const { service, saved, llm } = setup();
  const view = await service.generate('user-1', 8);
  expect(llm.complete).toHaveBeenCalledTimes(1);
  expect(view).toMatchObject({
    id: 4,
    title: 'APIs',
    assessmentId: 8,
    createdAt: '2026-09-23T18:00:00.000Z',
  });
  expect(view.courses.map((item) => item.courseId)).toEqual([1, 2]);
  expect(saved[0]).toMatchObject({
    userId: 'user-1',
    assessmentId: 8,
    model: 'gpt-4.1-mini',
  });
  expect(saved[1]).toEqual([
    { roadmapId: 4, courseId: 1, sortOrder: 0, progress: 0 },
    { roadmapId: 4, courseId: 2, sortOrder: 1, progress: 0 },
  ]);
});

it('does not call the model when no published course matches', async () => {
  const { service, llm } = setup({
    catalog: [
      course({
        id: 7,
        title: 'Figma',
        categories: [{ id: 4, name: 'Diseño' }],
      }),
    ],
  });
  await expect(service.generate('user-1', 8)).rejects.toBeInstanceOf(
    ConflictException,
  );
  expect(llm.complete).not.toHaveBeenCalled();
});

it('asks the client to retry when the catalog rejects the plan', async () => {
  const { service, saved } = setup({
    validate: async () => {
      throw new BadRequestException('Course 2 is not published');
    },
  });
  await expect(service.generate('user-1', 8)).rejects.toBeInstanceOf(
    ConflictException,
  );
  expect(saved).toEqual([]);
});

it('reports an unusable model response as a bad gateway', async () => {
  const { service } = setup({
    content: JSON.stringify({
      title: 'Nada',
      rationale: 'Sin cursos.',
      courseIds: [99],
    }),
  });
  await expect(service.generate('user-1', 8)).rejects.toBeInstanceOf(
    BadGatewayException,
  );
});

it('hides a roadmap that belongs to another user', async () => {
  const { service } = setup();
  await expect(service.findOne('user-1', 4)).rejects.toBeInstanceOf(
    NotFoundException,
  );
});

it('returns owned roadmaps with courses in saved order', async () => {
  const { service, roadmaps } = setup();
  roadmaps.find.mockResolvedValue([
    {
      id: 4,
      title: 'APIs',
      rationale: 'TypeScript y luego Nest.',
      assessmentId: 8,
      createdAt: new Date('2026-09-23T18:00:00.000Z'),
      courses: [
        { courseId: 2, progress: 0, sortOrder: 1 },
        { courseId: 1, progress: 40, sortOrder: 0 },
      ],
    } as Roadmap,
  ]);
  const [view] = await service.findAll('user-1');
  expect(view.courses.map((item) => [item.courseId, item.progress])).toEqual([
    [1, 40],
    [2, 0],
  ]);
});
