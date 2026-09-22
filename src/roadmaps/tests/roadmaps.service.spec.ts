import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { vi, type Mocked } from 'vitest';
import { CatalogService } from '../../catalog/catalog.service.js';
import { RoadmapCourse } from '../entities/roadmap-course.entity.js';
import { Roadmap } from '../entities/roadmap.entity.js';
import { RoadmapsService } from '../roadmaps.service.js';

describe('RoadmapsService', () => {
  let service: RoadmapsService;
  let catalog: Mocked<
    Pick<
      CatalogService,
      'validateRoadmapSelection' | 'getCoursesForExistingRoadmap'
    >
  >;

  const userId = '11111111-1111-4111-8111-111111111111';
  const otherUserId = '22222222-2222-4222-8222-222222222222';

  const roadmapRepo = {
    find: vi.fn(),
    findOne: vi.fn(),
    save: vi.fn(),
    remove: vi.fn(),
  };
  const membershipRepo = {
    save: vi.fn(),
  };

  const manager = {
    query: vi.fn(),
    create: vi.fn((_entity: unknown, data: unknown) => ({ ...data })),
    save: vi.fn(async (value: unknown) => {
      if (Array.isArray(value)) {
        return value;
      }
      return { ...(value as object), id: (value as { id?: number }).id ?? 1 };
    }),
    delete: vi.fn(),
    update: vi.fn(),
    getRepository: vi.fn(),
  };

  const dataSource = {
    transaction: vi.fn(
      async (work: (m: typeof manager) => Promise<unknown>) => work(manager),
    ),
  };

  const catalogCourse = (id: number) => ({
    id,
    title: `Course ${id}`,
    prerequisiteIds: [],
  });

  beforeEach(async () => {
    vi.clearAllMocks();
    manager.getRepository.mockReturnValue(roadmapRepo);

    catalog = {
      validateRoadmapSelection: vi.fn(async (ids: number[]) =>
        ids.map(catalogCourse),
      ),
      getCoursesForExistingRoadmap: vi.fn(async (ids: number[]) =>
        ids.map(catalogCourse),
      ),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RoadmapsService,
        { provide: CatalogService, useValue: catalog },
        { provide: DataSource, useValue: dataSource },
        { provide: getRepositoryToken(Roadmap), useValue: roadmapRepo },
        {
          provide: getRepositoryToken(RoadmapCourse),
          useValue: membershipRepo,
        },
      ],
    }).compile();

    service = module.get(RoadmapsService);
  });

  it('creates a roadmap with catalog-validated sort_order', async () => {
    const result = await service.create(userId, {
      title: 'Backend',
      courseIds: [10, 20],
    });

    expect(catalog.validateRoadmapSelection).toHaveBeenCalledWith([10, 20], []);
    expect(manager.query).toHaveBeenCalledWith(
      'SELECT pg_advisory_xact_lock(1789600000)',
    );
    expect(result.courses.map((item) => item.sortOrder)).toEqual([0, 1]);
    expect(result.courses.map((item) => item.courseId)).toEqual([10, 20]);
    expect(result.courses.every((item) => item.progress === 0)).toBe(true);
  });

  it('rejects non-unique courseIds', async () => {
    await expect(
      service.create(userId, { title: 'Dupes', courseIds: [1, 1] }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(catalog.validateRoadmapSelection).not.toHaveBeenCalled();
  });

  it('lists only the current user roadmaps', async () => {
    roadmapRepo.find.mockResolvedValue([
      {
        id: 1,
        title: 'Mine',
        userId,
        courses: [{ courseId: 3, progress: 0, sortOrder: 0, roadmapId: 1 }],
      },
    ]);

    const result = await service.findAll(userId);

    expect(roadmapRepo.find).toHaveBeenCalledWith({
      where: { userId },
      relations: { courses: true },
      order: { id: 'ASC' },
    });
    expect(result).toHaveLength(1);
    expect(result[0].userId).toBe(userId);
  });

  it('returns 404 when another user requests a roadmap', async () => {
    roadmapRepo.findOne.mockResolvedValue(null);

    await expect(service.findOne(otherUserId, 1)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('replaces courseIds and preserves progress for kept courses', async () => {
    roadmapRepo.findOne.mockResolvedValue({
      id: 5,
      title: 'Path',
      userId,
      courses: [
        { courseId: 1, progress: 40, sortOrder: 0, roadmapId: 5 },
        { courseId: 2, progress: 10, sortOrder: 1, roadmapId: 5 },
      ],
    });

    const result = await service.update(userId, 5, { courseIds: [2, 8] });

    expect(manager.delete).toHaveBeenCalledWith(RoadmapCourse, { roadmapId: 5 });
    expect(manager.update).toHaveBeenCalledWith(Roadmap, 5, { title: 'Path' });
    const savedRoadmap = manager.save.mock.calls.find(
      ([value]) => !Array.isArray(value) && (value as { title?: string }).title,
    );
    expect(savedRoadmap).toBeUndefined();
    expect(result.courses).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ courseId: 2, progress: 10, sortOrder: 0 }),
        expect.objectContaining({ courseId: 8, progress: 0, sortOrder: 1 }),
      ]),
    );
  });

  it('passes completedIds from remaining progress===100 courses on update', async () => {
    roadmapRepo.findOne.mockResolvedValue({
      id: 5,
      title: 'Path',
      userId,
      courses: [
        { courseId: 1, progress: 100, sortOrder: 0, roadmapId: 5 },
        { courseId: 2, progress: 50, sortOrder: 1, roadmapId: 5 },
      ],
    });

    await service.update(userId, 5, { courseIds: [1, 3] });

    expect(catalog.validateRoadmapSelection).toHaveBeenCalledWith([1, 3], [1]);
  });

  it('does not treat dropped completed courses as completedIds', async () => {
    roadmapRepo.findOne.mockResolvedValue({
      id: 5,
      title: 'Path',
      userId,
      courses: [
        { courseId: 1, progress: 100, sortOrder: 0, roadmapId: 5 },
        { courseId: 2, progress: 0, sortOrder: 1, roadmapId: 5 },
      ],
    });

    await service.update(userId, 5, { courseIds: [2, 3] });

    expect(catalog.validateRoadmapSelection).toHaveBeenCalledWith([2, 3], []);
  });

  it('rejects progress outside 0-100', async () => {
    await expect(
      service.updateProgress(userId, 5, 2, 101),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.updateProgress(userId, 5, 2, -1),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(roadmapRepo.findOne).not.toHaveBeenCalled();
  });

  it('updates progress for an owned membership', async () => {
    const existing = {
      id: 5,
      title: 'Path',
      userId,
      courses: [{ courseId: 2, progress: 0, sortOrder: 0, roadmapId: 5 }],
    };
    roadmapRepo.findOne.mockResolvedValue(existing);

    const result = await service.updateProgress(userId, 5, 2, 80);

    expect(membershipRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ courseId: 2, progress: 80 }),
    );
    expect(result.courses[0].progress).toBe(80);
  });

  it('404s progress updates for a course not on the roadmap', async () => {
    roadmapRepo.findOne.mockResolvedValue({
      id: 5,
      title: 'Path',
      userId,
      courses: [{ courseId: 2, progress: 0, sortOrder: 0, roadmapId: 5 }],
    });

    await expect(
      service.updateProgress(userId, 5, 99, 50),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('deletes only when the current user owns the roadmap', async () => {
    roadmapRepo.findOne.mockResolvedValue(null);
    await expect(service.remove(otherUserId, 5)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(roadmapRepo.remove).not.toHaveBeenCalled();

    const owned = { id: 5, title: 'Path', userId, courses: [] };
    roadmapRepo.findOne.mockResolvedValue(owned);
    await service.remove(userId, 5);
    expect(roadmapRepo.remove).toHaveBeenCalledWith(owned);
  });
});
