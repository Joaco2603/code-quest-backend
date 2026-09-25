import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DataSource } from 'typeorm';
import { catalogEntities } from '../dist/catalog/entities/catalog.entities.js';
import { SkillLevel } from '../dist/catalog/entities/skill-level.enum.js';
import { Course } from '../dist/catalog/entities/course.entity.js';
import { assessmentEntities } from '../dist/assessments/entities/index.js';
import { User } from '../dist/user/entities/user.entity.js';
import { AuditLog } from '../dist/common/entities/audit-log.entity.js';
import { AnswerOption } from '../dist/questions/questionnaires/entities/answer-option.entity.js';
import { Question } from '../dist/questions/questionnaires/entities/question.entity.js';
import { Questionnaire } from '../dist/questions/questionnaires/entities/questionnaire.entity.js';
import { Roadmap } from '../dist/roadmaps/entities/roadmap.entity.js';
import { RoadmapCourse } from '../dist/roadmaps/entities/roadmap-course.entity.js';
import { CreateUsersAndAuditLogs1760000000000 } from '../dist/database/migrations/1760000000000-CreateUsersAndAuditLogs.js';
import { CreateCatalog1789600000000 } from '../dist/database/migrations/1789600000000-CreateCatalog.js';
import { CreateQuestions1789600001000 } from '../dist/database/migrations/1789600001000-CreateQuestions.js';
import { CreateAssessments1789600002000 } from '../dist/database/migrations/1789600002000-CreateAssessments.js';
import { RenameUserResponsesToUserAnswers1789600003000 } from '../dist/database/migrations/1789600003000-RenameUserResponsesToUserAnswers.js';
import { CreateRoadmaps1789600004000 } from '../dist/database/migrations/1789600004000-CreateRoadmaps.js';
import { AdaptiveQuestionnaire1789600005000 } from '../dist/database/migrations/1789600005000-AdaptiveQuestionnaire.js';
import { CreateAssessments1789948800000 } from '../dist/database/migrations/1789948800000-CreateAssessments.js';
import { CreateContentImports1789948801000 } from '../dist/database/migrations/1789948801000-CreateContentImports.js';
import { RenameUserResponsesToUserAnswers1789948802000 } from '../dist/database/migrations/1789948802000-RenameUserResponsesToUserAnswers.js';
import { CreateRoadmaps1789948803000 } from '../dist/database/migrations/1789948803000-CreateRoadmaps.js';
import { DeactivateAdaptiveQuestionnaire1789948804000 } from '../dist/database/migrations/1789948804000-DeactivateAdaptiveQuestionnaire.js';
import { DropLegacyAssessments1789948805000 } from '../dist/database/migrations/1789948805000-DropLegacyAssessments.js';
import { parseCourseSource } from '../dist/seed/content/course-source.js';
import {
  importInitialContent,
  planImportContent,
} from '../dist/seed/content/initial-content.js';

const url = process.env.TEST_DATABASE_URL;
if (!url || !new URL(url).pathname.endsWith('_test')) {
  throw new Error(
    'Set TEST_DATABASE_URL to a dedicated database whose name ends with _test; development .env is never used',
  );
}

const schema = `catalog_test_${randomUUID().replaceAll('-', '')}`;
let bootstrapDb: DataSource;
let db: DataSource;

const realFile = JSON.parse(
  readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), '../COURSES.enriched.json'),
    'utf8',
  ),
);

const completeSource = (slug: string) => ({
  key: `devtalles:https://cursos.devtalles.com/courses/${slug}`,
  url: `https://cursos.devtalles.com/courses/${slug}`,
  title: `Course ${slug}`,
  description: `Description ${slug}`,
  instructor: 'Instructor',
  category: 'Backend',
  enrichment: {
    imageUrl: `https://cdn.example.com/${slug}.jpg`,
    durationMinutes: 120,
    level: SkillLevel.Beginner,
    technologyNames: ['NestJS'],
  },
});

beforeAll(async () => {
  bootstrapDb = await new DataSource({ type: 'postgres', url }).initialize();
  await bootstrapDb.query(`CREATE SCHEMA "${schema}"`);
  db = await new DataSource({
    type: 'postgres',
    url,
    schema,
    extra: { options: `-c search_path=${schema}` },
    entities: [
      ...catalogEntities,
      ...assessmentEntities,
      User,
      AuditLog,
      AnswerOption,
      Question,
      Questionnaire,
      Roadmap,
      RoadmapCourse,
    ],
    migrations: [
      CreateUsersAndAuditLogs1760000000000,
      CreateCatalog1789600000000,
      CreateQuestions1789600001000,
      CreateAssessments1789600002000,
      RenameUserResponsesToUserAnswers1789600003000,
      CreateRoadmaps1789600004000,
      AdaptiveQuestionnaire1789600005000,
      CreateAssessments1789948800000,
      CreateContentImports1789948801000,
      RenameUserResponsesToUserAnswers1789948802000,
      CreateRoadmaps1789948803000,
      DeactivateAdaptiveQuestionnaire1789948804000,
      DropLegacyAssessments1789948805000,
    ],
    synchronize: false,
  }).initialize();
  await db.runMigrations();
}, 60000);

beforeEach(async () => {
  await db.query(
    'TRUNCATE course_prerequisites, course_categories, course_technologies, courses, categories, technologies, content_imports, evaluation_taxonomy_refs, evaluation_configs, answer_options, questions, questionnaires RESTART IDENTITY CASCADE',
  );
});

afterAll(async () => {
  if (db?.isInitialized) await db.destroy();
  if (bootstrapDb?.isInitialized) {
    await bootstrapDb.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await bootstrapDb.destroy();
  }
});

it('imports the real file with media and reimports without duplicates', async () => {
  const { courses } = parseCourseSource(realFile);
  expect(courses).toHaveLength(74);
  const first = await importInitialContent(db, courses);
  expect(first.imported).toBe(74);
  expect(first.skipped).toBe(0);

  const sample = await db.getRepository(Course).findOne({
    where: { url: courses[0].url },
  });
  expect(sample?.imageUrl).toBe(courses[0].enrichment?.imageUrl);
  expect(sample?.durationMinutes).toBe(courses[0].enrichment?.durationMinutes);
  expect(sample?.status).toBe('draft');

  const second = await importInitialContent(db, courses);
  expect(second.imported).toBe(0);
  expect(second.skipped).toBe(74);
  expect(await db.getRepository(Course).count()).toBe(74);
}, 60000);

it('plans 71 publishable courses and blocks the 3 without technologies', async () => {
  const { courses } = parseCourseSource(realFile);
  await importInitialContent(db, courses);
  const { entries } = await planImportContent(db.manager, courses, {
    fillMissing: true,
    publishReady: true,
  });
  const wouldPublish = entries.filter((e) => e.publish === 'would-publish');
  const blocked = entries.filter((e) => e.publish === 'blocked');
  expect(wouldPublish).toHaveLength(71);
  expect(blocked).toHaveLength(3);
  for (const entry of blocked) {
    expect(entry.publishReasons).toContain('technologyIds');
  }
  expect(blocked.map((e) => e.title).sort()).toEqual(
    [
      'Patrones de Diseño: Soluciones prácticas y eficientes',
      'Principios: SOLID y Clean Code',
      'Programación para principiantes',
    ].sort(),
  );
}, 60000);

it('fills by provenance after a URL change and preserves admin edits', async () => {
  const { courses } = parseCourseSource(realFile);
  const target = courses[0];
  await importInitialContent(db, [target]);

  const repository = db.getRepository(Course);
  const created = (await repository.findOneByOrFail({ url: target.url })) as {
    id: number;
  };
  await repository.update(created.id, {
    url: `${target.url}-v2`,
    imageUrl: null,
    durationMinutes: null,
    level: null,
    description: 'Admin wording',
  });

  const result = await importInitialContent(db, [target], {
    fillMissing: true,
  });
  expect(result.imported).toBe(0);
  expect(result.filled).toEqual([
    {
      courseId: created.id,
      fields: expect.arrayContaining(['imageUrl', 'durationMinutes', 'level']),
    },
  ]);
  const filled = await repository.findOne({
    where: { id: created.id },
    relations: { categories: true, technologies: true },
  });
  expect(filled?.url).toBe(`${target.url}-v2`);
  expect(filled?.description).toBe('Admin wording');
  expect(filled?.imageUrl).toBe(target.enrichment?.imageUrl);
  expect(await repository.count()).toBe(1);
}, 60000);

it('rolls back the whole transaction on an ambiguous URL match', async () => {
  const repository = db.getRepository(Course);
  await repository.save(
    repository.create({ title: 'Dup A', url: 'https://dup.example/c' }),
  );
  await repository.save(
    repository.create({ title: 'Dup B', url: 'https://dup.example/c' }),
  );
  await expect(
    importInitialContent(db, [
      {
        ...completeSource('dup'),
        url: 'https://dup.example/c',
        key: 'devtalles:https://dup.example/c',
      },
    ]),
  ).rejects.toThrow('Multiple existing courses');
  expect(await repository.count()).toBe(2);
  expect(
    await db.query('SELECT count(*)::int AS n FROM content_imports'),
  ).toEqual([{ n: 0 }]);
}, 60000);

it('publishes chains in prerequisite order and keeps archived courses', async () => {
  const sources = [completeSource('chain-a'), completeSource('chain-b')];
  const created = await importInitialContent(db, sources);
  expect(created.imported).toBe(2);
  const repository = db.getRepository(Course);
  const a = await repository.findOneByOrFail({ url: sources[0].url });
  const b = await repository.findOneByOrFail({ url: sources[1].url });
  await db.query(
    'INSERT INTO course_prerequisites(course_id, prerequisite_id) VALUES ($1, $2)',
    [b.id, a.id],
  );
  await repository.update(a.id, { status: 'archived' } as Partial<Course>);

  const result = await importInitialContent(db, sources, {
    publishReady: true,
  });
  // A is archived (kept), so B stays blocked on its unpublished prerequisite.
  expect(result.published).toEqual([]);
  expect(result.publishSkipped).toEqual(
    expect.arrayContaining([
      { courseId: a.id, reasons: ['archived'] },
      {
        courseId: b.id,
        reasons: expect.arrayContaining(['unpublishedPrerequisites']),
      },
    ]),
  );

  await repository.update(a.id, { status: 'draft' } as Partial<Course>);
  const retry = await importInitialContent(db, sources, {
    publishReady: true,
  });
  expect(retry.published).toEqual([a.id, b.id]);
  expect((await repository.findOneByOrFail({ id: b.id })).status).toBe(
    'published',
  );
}, 60000);

it('leaves the database untouched in plan mode', async () => {
  const { courses } = parseCourseSource(realFile);
  await importInitialContent(db, courses.slice(0, 2));
  const count = async (table: string) =>
    (await db.query(`SELECT count(*)::int AS n FROM ${table}`))[0].n as number;
  const before = {
    courses: await count('courses'),
    markers: await count('content_imports'),
  };
  await planImportContent(db.manager, courses, {
    fillMissing: true,
    publishReady: true,
  });
  expect(await count('courses')).toBe(before.courses);
  expect(await count('content_imports')).toBe(before.markers);
}, 60000);
