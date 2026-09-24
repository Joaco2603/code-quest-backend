import {
  Category,
  Course,
  CourseStatus,
  SkillLevel,
  Technology,
} from '../../../catalog/entities.js';
import { Questionnaire } from '../../../questions/entities/questionnaire.entity.js';
import { Question } from '../../../questions/entities/question.entity.js';
import { AnswerOption } from '../../../questions/entities/answer-option.entity.js';
import { EvaluationConfig } from '../../../assessments/entities/index.js';
import { QuestionType } from '../../../questions/enums/question-type.enum.js';
import type { SourceCourse } from '../course-source.js';
import { importInitialContent } from '../initial-content.js';

const initialTechnologies = [
  'JavaScript',
  'TypeScript',
  'React',
  'Angular',
  'Vue',
  'NestJS',
  'Node.js',
  'Flutter',
  'Docker',
  'SQL',
  'Python',
];

function sourceCourse(
  overrides: Partial<SourceCourse> = {},
): SourceCourse {
  return {
    key: 'devtalles:https://cursos.devtalles.com/courses/nestjs',
    url: 'https://cursos.devtalles.com/courses/nestjs',
    title: 'NestJS',
    description: 'Backend',
    instructor: 'Instructor',
    category: 'Backend',
    enrichment: {
      imageUrl: null,
      durationMinutes: null,
      level: SkillLevel.Intermediate,
      technologyNames: ['NestJS', 'PHP'],
    },
    ...overrides,
  };
}

function createDbMock(seed?: {
  markers?: Array<{
    source_key: string;
    course_id?: number;
    questionnaire_id?: number;
  }>;
  courses?: Course[];
}) {
  let nextId = 1;
  const markers = [...(seed?.markers ?? [])];
  const courses = [...(seed?.courses ?? [])];
  const categories: Category[] = [];
  const technologies: Technology[] = [];
  const questionnaires: Questionnaire[] = [];
  const questions: Question[] = [];
  const options: AnswerOption[] = [];
  const courseSaves: Course[] = [];

  const assignId = <T extends { id?: number }>(row: T): T => {
    if (row.id == null) row.id = nextId++;
    return row;
  };

  const findByName = <T extends { name: string }>(list: T[], name: string) =>
    list.find(
      (item) => item.name.toLowerCase().trim() === name.toLowerCase().trim(),
    ) ?? null;

  const manager = {
    query: async (sql: string, params?: unknown[]) => {
      if (sql.includes('pg_advisory_xact_lock')) return [];
      if (sql.startsWith('SELECT course_id FROM content_imports')) {
        const key = params?.[0];
        return markers
          .filter((m) => m.source_key === key && m.course_id != null)
          .map((m) => ({ course_id: m.course_id }));
      }
      if (sql.startsWith('SELECT questionnaire_id FROM content_imports')) {
        const key = params?.[0];
        return markers
          .filter((m) => m.source_key === key && m.questionnaire_id != null)
          .map((m) => ({ questionnaire_id: m.questionnaire_id }));
      }
      if (sql.startsWith('INSERT INTO content_imports(source_key, course_id)')) {
        markers.push({
          source_key: params?.[0] as string,
          course_id: params?.[1] as number,
        });
        return [];
      }
      if (
        sql.startsWith(
          'INSERT INTO content_imports(source_key, questionnaire_id)',
        )
      ) {
        markers.push({
          source_key: params?.[0] as string,
          questionnaire_id: params?.[1] as number,
        });
        return [];
      }
      if (sql.startsWith('INSERT INTO evaluation_taxonomy_refs')) return [];
      throw new Error(`Unexpected query: ${sql}`);
    },
    getRepository: (entity: unknown) => ({
      createQueryBuilder: () => {
        let lookup = '';
        return {
          where: (_clause: string, params: { name: string }) => {
            lookup = params.name;
            return {
              getOne: async () => {
                if (entity === Category) return findByName(categories, lookup);
                if (entity === Technology)
                  return findByName(technologies, lookup);
                return null;
              },
            };
          },
        };
      },
    }),
    create: (_entity: unknown, data: Record<string, unknown>) => ({ ...data }),
    save: async (entity: unknown, data?: Record<string, unknown>) => {
      const row = data as Record<string, unknown>;
      if (entity === Category) {
        const existing = findByName(categories, row.name as string);
        if (existing) return existing;
        const saved = assignId({ name: row.name } as Category);
        categories.push(saved);
        return saved;
      }
      if (entity === Technology) {
        const existing = findByName(technologies, row.name as string);
        if (existing) return existing;
        const saved = assignId({ name: row.name } as Technology);
        technologies.push(saved);
        return saved;
      }
      if (entity === Course) {
        const saved = assignId({ ...(row as unknown as Course) });
        courses.push(saved);
        courseSaves.push(saved);
        return saved;
      }
      if (entity === Questionnaire) {
        const saved = assignId({
          ...(row as unknown as Questionnaire),
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
          questions: [],
        });
        questionnaires.push(saved);
        return saved;
      }
      if (entity === Question) {
        const saved = assignId({
          ...(row as unknown as Question),
          options: [],
        });
        questions.push(saved);
        const parent = questionnaires.find(
          (q) => q.id === (row.questionnaire as { id: number }).id,
        );
        parent?.questions.push(saved);
        return saved;
      }
      if (entity === AnswerOption) {
        const saved = assignId({ ...(row as unknown as AnswerOption) });
        options.push(saved);
        const parent = questions.find(
          (q) => q.id === (row.question as { id: number }).id,
        );
        parent?.options.push(saved);
        return saved;
      }
      if (entity === EvaluationConfig) {
        return { ...(row as unknown as EvaluationConfig) };
      }
      throw new Error(`Unexpected save entity`);
    },
    find: async (entity: unknown, opts: { where: { url: string } }) => {
      if (entity !== Course) return [];
      return courses.filter((c) => c.url === opts.where.url);
    },
    findOneOrFail: async (
      entity: unknown,
      opts: { where: { id: number } },
    ) => {
      if (entity !== Questionnaire) throw new Error('Unexpected findOneOrFail');
      const found = questionnaires.find((q) => q.id === opts.where.id);
      if (!found) throw new Error('Questionnaire not found');
      return found;
    },
  };

  return {
    db: {
      transaction: async <T>(fn: (m: typeof manager) => Promise<T>) =>
        fn(manager),
    } as never,
    courseSaves,
    technologies,
    questions,
    options,
  };
}

it('applies enrichment only when creating a course, not for existing URL or marker skip', async () => {
  const existing = {
    id: 99,
    title: 'Existing',
    description: null,
    instructor: null,
    url: 'https://cursos.devtalles.com/courses/nestjs',
    status: CourseStatus.Draft,
    imageUrl: null,
    durationMinutes: null,
    level: null,
    categories: [],
    technologies: [],
    prerequisites: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  } as Course;

  const withExisting = createDbMock({ courses: [existing] });
  const existingResult = await importInitialContent(withExisting.db, [
    sourceCourse(),
  ]);
  expect(existingResult.imported).toBe(0);
  expect(existingResult.skipped).toBe(1);
  expect(withExisting.courseSaves).toHaveLength(0);
  expect(existing.level).toBeNull();
  expect(existing.technologies).toEqual([]);

  const withMarker = createDbMock({
    markers: [
      {
        source_key: 'devtalles:https://cursos.devtalles.com/courses/nestjs',
        course_id: 99,
      },
    ],
  });
  const markerResult = await importInitialContent(withMarker.db, [
    sourceCourse(),
  ]);
  expect(markerResult.imported).toBe(0);
  expect(markerResult.skipped).toBe(1);
  expect(withMarker.courseSaves).toHaveLength(0);

  const created = createDbMock();
  const createResult = await importInitialContent(created.db, [sourceCourse()]);
  expect(createResult.imported).toBe(1);
  expect(created.courseSaves).toHaveLength(1);
  expect(created.courseSaves[0]).toMatchObject({
    level: SkillLevel.Intermediate,
    imageUrl: null,
    durationMinutes: null,
  });
  expect(created.courseSaves[0].technologies.map((t) => t.name)).toEqual([
    'NestJS',
    'PHP',
  ]);
});

it('keeps questionnaire technology options on initialTechnologies only', async () => {
  const { db, questions, options, technologies } = createDbMock();
  await importInitialContent(db, [
    sourceCourse({
      enrichment: {
        imageUrl: null,
        durationMinutes: null,
        level: SkillLevel.Beginner,
        technologyNames: ['NestJS', 'PHP', 'Go'],
      },
    }),
  ]);

  const techInterest = questions.find(
    (q) =>
      q.type === QuestionType.MULTIPLE_CHOICE &&
      q.question.includes('tecnologías'),
  );
  expect(techInterest).toBeTruthy();
  const labels = options
    .filter((o) => o.question.id === techInterest!.id)
    .map((o) => o.label);
  expect(labels).toEqual(initialTechnologies);
  expect(labels).not.toContain('PHP');
  expect(labels).not.toContain('Go');
  expect(technologies.map((t) => t.name)).toEqual(
    expect.arrayContaining(['NestJS', 'PHP', 'Go', ...initialTechnologies]),
  );
});
