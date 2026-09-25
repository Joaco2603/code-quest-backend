import {
  Category,
  Course,
  CourseStatus,
  SkillLevel,
  Technology,
} from '../../../catalog/entities/catalog.entities.js';
import { Questionnaire } from '../../../questions/questionnaires/entities/questionnaire.entity.js';
import { Question } from '../../../questions/questionnaires/entities/question.entity.js';
import { AnswerOption } from '../../../questions/questionnaires/entities/answer-option.entity.js';
import { EvaluationConfig } from '../../../assessments/entities/index.js';
import { QuestionType } from '../../../questions/questionnaires/enums/question-type.enum.js';
import type { SourceCourse } from '../course-source.js';
import { importInitialContent, planImportContent } from '../initial-content.js';

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

function sourceCourse(overrides: Partial<SourceCourse> = {}): SourceCourse {
  return {
    key: 'devtalles:https://cursos.devtalles.com/courses/nestjs',
    url: 'https://cursos.devtalles.com/courses/nestjs',
    title: 'NestJS',
    description: 'Backend',
    instructor: 'Instructor',
    category: 'Backend',
    enrichment: {
      imageUrl: 'https://cdn.example.com/nestjs.jpg',
      durationMinutes: 480,
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
      if (
        sql.startsWith('INSERT INTO content_imports(source_key, course_id)')
      ) {
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
        const saved = { ...(row as unknown as Course) };
        if (saved.id == null) assignId(saved);
        const index = courses.findIndex((c) => c.id === saved.id);
        if (index >= 0) courses[index] = saved as Course;
        else courses.push(saved as Course);
        courseSaves.push(saved as Course);
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
    findOne: async (entity: unknown, opts: { where: { id: number } }) => {
      if (entity !== Course) return null;
      return courses.find((c) => c.id === opts.where.id) ?? null;
    },
    findOneOrFail: async (entity: unknown, opts: { where: { id: number } }) => {
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
    manager,
    markers,
    courses,
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
    imageUrl: 'https://cdn.example.com/nestjs.jpg',
    durationMinutes: 480,
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

const nestMarker = {
  source_key: 'devtalles:https://cursos.devtalles.com/courses/nestjs',
  course_id: 99,
};

function existingCourse(overrides: Partial<Course> = {}): Course {
  return {
    id: 99,
    title: 'NestJS',
    description: 'Backend',
    instructor: 'Instructor',
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
    ...overrides,
  } as Course;
}

function completeCourse(overrides: Partial<Course> = {}): Course {
  return existingCourse({
    imageUrl: 'https://cdn.example.com/nestjs.jpg',
    durationMinutes: 480,
    level: SkillLevel.Intermediate,
    categories: [{ id: 7, name: 'Backend' } as Category],
    technologies: [{ id: 8, name: 'NestJS' } as Technology],
    ...overrides,
  });
}

it('leaves marker courses untouched unless --fill-missing is given', async () => {
  const mock = createDbMock({
    markers: [{ ...nestMarker }],
    courses: [existingCourse()],
  });
  const result = await importInitialContent(mock.db, [sourceCourse()]);
  expect(result.imported).toBe(0);
  expect(result.skipped).toBe(1);
  expect(result.filled).toEqual([]);
  expect(result.published).toEqual([]);
  expect(mock.courseSaves).toHaveLength(0);
  expect(mock.courses[0].durationMinutes).toBeNull();
});

it('fills only empty fields and preserves edits, status and prerequisites', async () => {
  const prerequisites = [{ id: 5, status: CourseStatus.Published }] as Course[];
  const mock = createDbMock({
    markers: [{ ...nestMarker }],
    courses: [
      existingCourse({
        imageUrl: 'https://admin.example/cover.png',
        categories: [{ id: 7, name: 'Backend' } as Category],
        technologies: [{ id: 8, name: 'NestJS' } as Technology],
        prerequisites,
      }),
    ],
  });
  const result = await importInitialContent(mock.db, [sourceCourse()], {
    fillMissing: true,
  });
  expect(result.filled).toEqual([
    {
      courseId: 99,
      // instructor/description keep the seeded (admin) values; only the
      // empty duration and level are completed.
      fields: ['durationMinutes', 'level'],
    },
  ]);
  expect(result.filled[0].fields).not.toContain('imageUrl');
  expect(result.filled[0].fields).not.toContain('description');
  expect(result.filled[0].fields).not.toContain('categoryIds');
  expect(result.filled[0].fields).not.toContain('technologyIds');
  const course = mock.courses[0];
  expect(course.imageUrl).toBe('https://admin.example/cover.png');
  expect(course.durationMinutes).toBe(480);
  expect(course.level).toBe(SkillLevel.Intermediate);
  expect(course.status).toBe(CourseStatus.Draft);
  expect(course.prerequisites).toBe(prerequisites);
});

it('assigns file technologies only when the course has none', async () => {
  const empty = createDbMock({
    markers: [{ ...nestMarker }],
    courses: [existingCourse()],
  });
  await importInitialContent(empty.db, [sourceCourse()], { fillMissing: true });
  expect(empty.courses[0].technologies.map((t) => t.name)).toEqual([
    'NestJS',
    'PHP',
  ]);

  const kept = createDbMock({
    markers: [{ ...nestMarker }],
    courses: [
      existingCourse({
        technologies: [{ id: 21, name: 'Go' } as Technology],
      }),
    ],
  });
  const result = await importInitialContent(kept.db, [sourceCourse()], {
    fillMissing: true,
  });
  expect(kept.courses[0].technologies.map((t) => t.name)).toEqual(['Go']);
  expect(result.filled[0].fields).not.toContain('technologyIds');
});

it('resolves by provenance after an admin URL change', async () => {
  const mock = createDbMock({
    markers: [{ ...nestMarker }],
    courses: [
      existingCourse({
        url: 'https://cursos.devtalles.com/courses/nestjs-v2',
      }),
    ],
  });
  const result = await importInitialContent(mock.db, [sourceCourse()], {
    fillMissing: true,
  });
  expect(result.imported).toBe(0);
  expect(mock.courses).toHaveLength(1);
  expect(mock.courses[0].durationMinutes).toBe(480);
  expect(mock.courses[0].url).toBe(
    'https://cursos.devtalles.com/courses/nestjs-v2',
  );
});

it('keeps URL matches as link-only even with --fill-missing', async () => {
  const mock = createDbMock({ courses: [existingCourse()] });
  const result = await importInitialContent(mock.db, [sourceCourse()], {
    fillMissing: true,
  });
  expect(result.skipped).toBe(1);
  expect(result.filled).toEqual([]);
  expect(mock.courses[0].durationMinutes).toBeNull();
  expect(mock.courseSaves).toHaveLength(0);
  expect(mock.markers.filter((m) => m.course_id != null)).toHaveLength(1);
});

it('aborts on ambiguous URL matches before writing', async () => {
  const mock = createDbMock({
    courses: [existingCourse({ id: 1 }), existingCourse({ id: 2 })],
  });
  await expect(importInitialContent(mock.db, [sourceCourse()])).rejects.toThrow(
    'Multiple existing courses',
  );
  expect(mock.markers).toHaveLength(0);
});

it('publishes complete drafts and reports incomplete ones with reasons', async () => {
  const mock = createDbMock({
    markers: [
      { ...nestMarker },
      {
        source_key: 'devtalles:https://cursos.devtalles.com/courses/react',
        course_id: 100,
      },
    ],
    courses: [
      completeCourse(),
      existingCourse({
        id: 100,
        title: 'React',
        url: 'https://cursos.devtalles.com/courses/react',
        durationMinutes: 300,
        level: SkillLevel.Beginner,
        categories: [{ id: 7, name: 'Backend' } as Category],
        technologies: [{ id: 9, name: 'React' } as Technology],
      }),
    ],
  });
  const result = await importInitialContent(
    mock.db,
    [
      sourceCourse(),
      sourceCourse({
        key: 'devtalles:https://cursos.devtalles.com/courses/react',
        url: 'https://cursos.devtalles.com/courses/react',
        title: 'React',
      }),
    ],
    {
      publishReady: true,
    },
  );
  expect(result.published).toEqual([99]);
  expect(result.publishSkipped).toEqual([
    { courseId: 100, reasons: expect.arrayContaining(['imageUrl']) },
  ]);
  expect(mock.courses.find((c) => c.id === 99)?.status).toBe(
    CourseStatus.Published,
  );
  expect(mock.courses.find((c) => c.id === 100)?.status).toBe(
    CourseStatus.Draft,
  );
});

it('keeps archived courses and publishes prerequisite chains in order', async () => {
  const mock = createDbMock({
    markers: [
      {
        source_key: 'devtalles:https://cursos.devtalles.com/courses/a',
        course_id: 1,
      },
      {
        source_key: 'devtalles:https://cursos.devtalles.com/courses/b',
        course_id: 2,
      },
      {
        source_key: 'devtalles:https://cursos.devtalles.com/courses/c',
        course_id: 3,
      },
    ],
    courses: [
      completeCourse({ id: 1, title: 'A', url: 'https://a.example' }),
      completeCourse({
        id: 2,
        title: 'B',
        url: 'https://b.example',
        prerequisites: [{ id: 1, status: CourseStatus.Draft }] as Course[],
      }),
      completeCourse({
        id: 3,
        title: 'C',
        url: 'https://c.example',
        status: CourseStatus.Archived,
      }),
    ],
  });
  const sources = ['a', 'b', 'c'].map((slug) =>
    sourceCourse({
      key: `devtalles:https://cursos.devtalles.com/courses/${slug}`,
      url: `https://cursos.devtalles.com/courses/${slug}`,
      title: slug.toUpperCase(),
    }),
  );
  const result = await importInitialContent(mock.db, sources, {
    publishReady: true,
  });
  expect(result.published).toEqual([1, 2]);
  expect(result.publishSkipped).toEqual([
    { courseId: 3, reasons: ['archived'] },
  ]);
  expect(mock.courses.find((c) => c.id === 3)?.status).toBe(
    CourseStatus.Archived,
  );
});

it('does not publish newly URL-linked courses', async () => {
  const mock = createDbMock({ courses: [completeCourse()] });
  const result = await importInitialContent(mock.db, [sourceCourse()], {
    publishReady: true,
  });
  expect(result.skipped).toBe(1);
  expect(result.published).toEqual([]);
  expect(mock.courses[0].status).toBe(CourseStatus.Draft);
});

it('plans without writing anything', async () => {
  const mock = createDbMock({
    markers: [{ ...nestMarker }],
    courses: [existingCourse()],
  });
  const before = {
    markers: mock.markers.length,
    saves: mock.courseSaves.length,
    technologies: mock.technologies.length,
  };
  const { entries } = await planImportContent(
    mock.manager as never,
    [
      sourceCourse(),
      sourceCourse({
        key: 'devtalles:https://cursos.devtalles.com/courses/new',
        url: 'https://cursos.devtalles.com/courses/new',
        title: 'New',
      }),
    ],
    { fillMissing: true, publishReady: true },
  );
  expect(mock.markers).toHaveLength(before.markers);
  expect(mock.courseSaves).toHaveLength(before.saves);
  expect(mock.technologies).toHaveLength(before.technologies);
  expect(entries).toHaveLength(2);
  expect(entries[0]).toMatchObject({
    action: 'skip-marker',
    fillFields: expect.arrayContaining(['imageUrl', 'technologyIds']),
    publish: 'blocked',
  });
  expect(entries[0].publishReasons).toContain('imageUrl');
  expect(entries[1]).toMatchObject({
    action: 'create',
    publish: 'would-publish',
  });
});
