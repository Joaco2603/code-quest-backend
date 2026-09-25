import { RoadmapsModule } from '../dist/roadmaps/roadmaps.module.js';
import { OpenAiRoadmapClient } from '../dist/roadmaps/openai-roadmap.client.js';
import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { databaseOptions } from '../dist/config/database.js';
import { setupApp } from '../dist/config/setup.js';
import { setupSwagger } from '../dist/config/swagger.js';
import { CatalogModule } from '../dist/catalog/catalog.module.js';
import { QuestionsModule } from '../dist/questions/questions.module.js';
import { AssessmentsModule } from '../dist/assessments/assessments.module.js';
import { AssessmentsService } from '../dist/assessments/assessments.service.js';
import { JwtStrategy } from '../dist/auth/strategies/jwt.strategy.js';
import { User } from '../dist/user/entities/user.entity.js';
import { Course } from '../dist/catalog/entities/catalog.entities.js';
import { importInitialContent } from '../dist/seed/content/initial-content.js';
import type { EvaluationSnapshot } from '../dist/assessments/interfaces/index.js';
import type { SourceCourse } from '../dist/seed/content/course-source.js';

const url = process.env.TEST_DATABASE_URL;
if (!url || !new URL(url).pathname.endsWith('_test'))
  throw new Error(
    'Set TEST_DATABASE_URL to a dedicated database ending in _test',
  );
const schema = `assessment_test_${randomUUID().replaceAll('-', '')}`;
const secret = 'assessment-test-secret-at-least-32-characters';
const jwt = new JwtService({ secret });
const ids = { admin: randomUUID(), student: randomUUID(), other: randomUUID() };
const token = (user: keyof typeof ids, extra = {}) =>
  jwt.sign({
    sub: ids[user],
    purpose: 'access',
    is_two_factor_validated: true,
    ...extra,
  });
const sources: SourceCourse[] = ['Backend', 'Desarrollo Web'].map(
  (category, i) => ({
    key: `devtalles:https://cursos.devtalles.com/courses/test-${i}`,
    title: `Course ${i}`,
    description: 'Source description',
    instructor: 'Instructor',
    category,
    url: `https://cursos.devtalles.com/courses/test-${i}`,
  }),
);
let bootstrap: DataSource;
let db: DataSource;
let app: INestApplication;
let questionnaireId: number;
const api = () => request(app.getHttpServer());
const auth = (user: keyof typeof ids = 'student') => `Bearer ${token(user)}`;
async function form(): Promise<EvaluationSnapshot> {
  return (
    await api()
      .get(`/api/questionnaires/${questionnaireId}/evaluation`)
      .set('Authorization', auth())
      .expect(200)
  ).body.data;
}
function submission(snapshot: EvaluationSnapshot) {
  return {
    questionnaireId,
    revision: snapshot.revision,
    answers: snapshot.definition.rules
      .filter((r) => r.required)
      .map((r) => ({
        questionId: r.questionId,
        value:
          r.kind === 'goal'
            ? 'Build APIs'
            : r.kind === 'none'
              ? 0
              : [r.options[0].optionId],
      })),
  };
}

beforeAll(async () => {
  bootstrap = await new DataSource({ type: 'postgres', url }).initialize();
  await bootstrap.query(`CREATE SCHEMA "${schema}"`);
  const defaults = databaseOptions({ NODE_ENV: 'test' });
  // Only the dedicated test URL is used; development environment credentials
  // are not read or merged into these connection options.
  const options = {
    type: 'postgres' as const,
    url,
    schema,
    extra: { options: `-c search_path=${schema},public` },
    entities: defaults.entities,
    migrations: defaults.migrations,
    synchronize: false,
  };
  const migrationDb = await new DataSource(options).initialize();
  try {
    await migrationDb.runMigrations();
    await migrationDb.undoLastMigration();
    await migrationDb.undoLastMigration();
    await migrationDb.runMigrations();
  } finally {
    await migrationDb.destroy();
  }
  const module = await Test.createTestingModule({
    imports: [
      TypeOrmModule.forRoot(options),
      TypeOrmModule.forFeature([User]),
      CatalogModule,
      QuestionsModule,
      AssessmentsModule,
      RoadmapsModule,
    ],
    providers: [
      JwtStrategy,
      {
        provide: ConfigService,
        useValue: new ConfigService({
          JWT_SECRET: secret,
          app: { port: 3000 },
        }),
      },
    ],
  })
    .overrideProvider(OpenAiRoadmapClient)
    .useValue({
      complete: async (_system: string, user: string) => {
        const input = JSON.parse(user);
        return {
          model: 'test-model',
          content: JSON.stringify({
            title: 'Ruta de prueba',
            rationale: 'Cursos para tus intereses',
            courseIds: [input.courses[0].id],
          }),
        };
      },
    })
    .compile();
  app = module.createNestApplication();
  setupApp(app);
  setupSwagger(app, app.get(ConfigService));
  await app.init();
  await app.listen(0, '127.0.0.1');
  db = app.get(DataSource);
}, 30000);
beforeEach(async () => {
  await db.query(
    'TRUNCATE users, questionnaires, categories, technologies, courses RESTART IDENTITY CASCADE',
  );
  for (const [name, id] of Object.entries(ids))
    await db.query(
      'INSERT INTO users(id, email, first_name, role, "mustChangePassword") VALUES ($1, $2, $3, $4, false)',
      [id, `${name}@example.test`, name, name === 'admin' ? 'admin' : 'user'],
    );
  questionnaireId = (await importInitialContent(db, sources)).questionnaireId;
});
afterAll(async () => {
  await app?.close();
  if (bootstrap?.isInitialized) {
    await bootstrap.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await bootstrap.destroy();
  }
});

it('persists evaluation, returns its owned profile and isolates two users', async () => {
  const snapshot = await form();
  const { body } = await api()
    .post('/api/assessments')
    .set('Authorization', auth())
    .send(submission(snapshot))
    .expect(201);
  const id = body.data.profile.assessmentId;
  expect(body.data.profile.readyForGeneration).toBe(true);
  expect(
    body.data.profile.skills.every((s: { level: unknown }) => s.level === null),
  ).toBe(true);
  const loaded = (
    await api()
      .get(`/api/assessments/${id}`)
      .set('Authorization', auth())
      .expect(200)
  ).body.data;
  expect(loaded).toEqual(body.data);
  expect(
    await app.get(AssessmentsService).getProfileForUser(ids.student, id),
  ).toEqual(body.data.profile);
  await api()
    .get(`/api/assessments/${id}`)
    .set('Authorization', auth('other'))
    .expect(404);
  await expect(
    app.get(AssessmentsService).getProfileForUser(ids.other, id),
  ).rejects.toThrow('not found');
  expect(
    (
      await api()
        .get('/api/assessments')
        .set('Authorization', auth('other'))
        .expect(200)
    ).body.meta.total,
  ).toBe(0);
  expect(
    (
      await api()
        .get('/api/assessments?limit=1&offset=0')
        .set('Authorization', auth())
        .expect(200)
    ).body.meta.total,
  ).toBe(1);
});
it('rejects forged owners, anonymous and temporary sessions, foreign options and partial answers', async () => {
  const body = submission(await form());
  await api().post('/api/assessments').send(body).expect(401);
  await api()
    .post('/api/assessments')
    .set(
      'Authorization',
      `Bearer ${token('student', { purpose: 'two_factor', is_two_factor_validated: false })}`,
    )
    .send(body)
    .expect(403);
  await api()
    .post('/api/assessments')
    .set('Authorization', auth())
    .send({ ...body, userId: ids.other })
    .expect(400);
  await api()
    .post('/api/assessments')
    .set('Authorization', auth())
    .send({ ...body, answers: [] })
    .expect(400);
  await api()
    .post('/api/assessments')
    .set('Authorization', auth())
    .send({ ...body, answers: [...body.answers, body.answers[0]] })
    .expect(400);
  body.answers[0].value = [999999];
  await api()
    .post('/api/assessments')
    .set('Authorization', auth())
    .send(body)
    .expect(400);
  expect(
    (await db.query('SELECT count(*)::int AS count FROM self_assessments'))[0]
      .count,
  ).toBe(0);
  expect(
    (
      await db.query(
        'SELECT count(*)::int AS count FROM self_assessment_answers',
      )
    )[0].count,
  ).toBe(0);
});
it('preserves historical snapshots while refusing submissions using stale forms', async () => {
  const snapshot = await form();
  const body = submission(snapshot);
  const result = (
    await api()
      .post('/api/assessments')
      .set('Authorization', auth())
      .send(body)
      .expect(201)
  ).body.data;
  await api()
    .patch(`/api/questions/${snapshot.questionnaire.questions[0].id}`)
    .set('Authorization', auth('admin'))
    .send({ question: 'Edited question' })
    .expect(200);
  await api()
    .post('/api/assessments')
    .set('Authorization', auth())
    .send(body)
    .expect(409);
  await api()
    .delete(
      `/api/answer-options/${snapshot.questionnaire.questions[0].options[0].id}`,
    )
    .set('Authorization', auth('admin'))
    .expect(200);
  expect(
    (
      await api()
        .get(`/api/assessments/${result.profile.assessmentId}`)
        .set('Authorization', auth())
        .expect(200)
    ).body.data,
  ).toEqual(result);
  await api()
    .get(`/api/questionnaires/${questionnaireId}/evaluation`)
    .set('Authorization', auth())
    .expect(409);
});
it('protects configuration and historical taxonomy references', async () => {
  const snapshot = await form();
  await api()
    .put(`/api/questionnaires/${questionnaireId}/evaluation`)
    .set('Authorization', auth())
    .send(snapshot.definition)
    .expect(403);
  const invalid = structuredClone(snapshot.definition);
  invalid.rules[0].options[0].value = 999999;
  await api()
    .put(`/api/questionnaires/${questionnaireId}/evaluation`)
    .set('Authorization', auth('admin'))
    .send(invalid)
    .expect(409);
  const result = await api()
    .put(`/api/questionnaires/${questionnaireId}/evaluation`)
    .set('Authorization', auth('admin'))
    .send(snapshot.definition)
    .expect(200);
  expect(result.body.data.profileVersion).toBe(2);
  const categoryId = snapshot.definition.rules[0].options[0].value;
  await api()
    .delete(`/api/categories/${categoryId}`)
    .set('Authorization', auth('admin'))
    .expect(409);
});
it('rolls back the assessment if answer persistence fails', async () => {
  await db.query(
    `ALTER TABLE self_assessment_answers ADD CONSTRAINT reject_answer_test CHECK (question_id < 0)`,
  );
  try {
    await api()
      .post('/api/assessments')
      .set('Authorization', auth())
      .send(submission(await form()))
      .expect(500);
    expect(
      (await db.query('SELECT count(*)::int AS count FROM self_assessments'))[0]
        .count,
    ).toBe(0);
  } finally {
    await db.query(
      'ALTER TABLE self_assessment_answers DROP CONSTRAINT reject_answer_test',
    );
  }
});
it('imports repeatedly without overwriting edited courses or publishing missing metadata', async () => {
  const [course] = await db.getRepository(Course).find();
  await db.getRepository(Course).update(course.id, {
    title: 'Admin edit',
    url: 'https://cursos.devtalles.com/courses/edited',
  });
  const imported = await importInitialContent(db, sources);
  expect(imported).toMatchObject({
    imported: 0,
    skipped: 2,
    filled: [],
    published: [],
    publishSkipped: [],
    questionnaireId,
    questionnaireCreated: false,
  });
  expect(
    (await db.getRepository(Course).findOneByOrFail({ id: course.id })).title,
  ).toBe('Admin edit');
  expect((await api().get('/api/courses').expect(200)).body.data).toEqual([]);
  await api()
    .post(`/api/admin/courses/${course.id}/publish`)
    .set('Authorization', auth('admin'))
    .expect(400);
});
it('documents evaluation endpoints and rejects invalid pagination', async () => {
  const doc = (await api().get('/api/docs-json').expect(200)).body;
  expect(doc.paths['/api/assessments'].post).toBeDefined();
  expect(doc.paths['/api/questionnaires/{id}/evaluation'].get).toBeDefined();
  await api()
    .get('/api/assessments?limit=101')
    .set('Authorization', auth())
    .expect(400);
  await api()
    .get('/api/assessments?offset=bad')
    .set('Authorization', auth())
    .expect(400);
});

it('returns a recoverable conflict for concurrent configuration edits', async () => {
  const snapshot = await form();
  const results = await Promise.all(
    [1, 2, 3].map(() =>
      api()
        .put(`/api/questionnaires/${questionnaireId}/evaluation`)
        .set('Authorization', auth('admin'))
        .send(snapshot.definition),
    ),
  );
  expect(results.some((r) => r.status === 200)).toBe(true);
  expect(results.every((r) => r.status === 200 || r.status === 409)).toBe(true);
  const saved = await form();
  expect(saved.profileVersion).toBe(
    1 + results.filter((r) => r.status === 200).length,
  );
});

it('honors controller-level admin roles for question and option mutations', async () => {
  const snapshot = await form();
  const question = snapshot.questionnaire.questions[0];
  await api()
    .patch(`/api/questions/${question.id}`)
    .set('Authorization', auth())
    .send({ question: 'Tampered' })
    .expect(403);
  await api()
    .delete(`/api/questions/${question.id}`)
    .set('Authorization', auth())
    .expect(403);
  await api()
    .post(`/api/questions/${question.id}/options`)
    .set('Authorization', auth())
    .send({ label: 'Injected' })
    .expect(403);
  await api()
    .patch(`/api/answer-options/${question.options[0].id}`)
    .set('Authorization', auth())
    .send({ label: 'Tampered' })
    .expect(403);
  await api()
    .delete(`/api/answer-options/${question.options[0].id}`)
    .set('Authorization', auth())
    .expect(403);
  await api()
    .patch(`/api/questions/${question.id}`)
    .set('Authorization', auth('admin'))
    .send({ question: 'Authorized edit' })
    .expect(200);
});

it('round-trips numeric zero, boolean false and declared skill levels through PostgreSQL', async () => {
  const snapshot = await form();
  for (const type of ['number', 'boolean']) {
    const question = (
      await api()
        .post(`/api/questionnaires/${questionnaireId}/questions`)
        .set('Authorization', auth('admin'))
        .send({
          question: `Extra ${type}`,
          type,
          sortOrder: 100 + snapshot.definition.rules.length,
        })
        .expect(201)
    ).body.data;
    snapshot.definition.rules.push({
      questionId: question.id,
      kind: 'none',
      required: true,
      options: [],
    });
  }
  await api()
    .put(`/api/questionnaires/${questionnaireId}/evaluation`)
    .set('Authorization', auth('admin'))
    .send(snapshot.definition)
    .expect(200);
  const current = await form();
  const body = submission(current) as {
    questionnaireId: number;
    revision: string;
    answers: Array<{ questionId: number; value: unknown }>;
  };
  for (const answer of body.answers) {
    const question = current.questionnaire.questions.find(
      (q) => q.id === answer.questionId,
    )!;
    if (question.type === 'number') answer.value = 0;
    if (question.type === 'boolean') answer.value = false;
  }
  const skill = current.definition.rules.find(
    (r) => r.kind === 'self_reported_skill',
  )!;
  body.answers.push({
    questionId: skill.questionId,
    value: skill.options.find((o) => o.value === 'intermediate')!.optionId,
  });
  const saved = (
    await api()
      .post('/api/assessments')
      .set('Authorization', auth())
      .send(body)
      .expect(201)
  ).body.data;
  const loaded = (
    await api()
      .get(`/api/assessments/${saved.profile.assessmentId}`)
      .set('Authorization', auth())
      .expect(200)
  ).body.data;
  expect(loaded).toEqual(saved);
  expect(loaded.answers.some((a: { value: unknown }) => a.value === 0)).toBe(
    true,
  );
  expect(
    loaded.answers.some((a: { value: unknown }) => a.value === false),
  ).toBe(true);
  expect(
    loaded.profile.skills.find(
      (s: { technologyId: number }) => s.technologyId === skill.technologyId,
    ),
  ).toMatchObject({ level: 'intermediate', source: 'self_reported' });
});

it('generates from the replacement assessment flow and preserves roadmap progress APIs', async () => {
  const snapshot = await form();
  const saved = await api()
    .post('/api/assessments')
    .set('Authorization', auth())
    .send(submission(snapshot))
    .expect(201);
  await db.query("UPDATE courses SET status = 'published', level = 'beginner'");
  const generated = await api()
    .post('/api/roadmaps/generate')
    .set('Authorization', auth())
    .send({ assessmentId: saved.body.data.profile.assessmentId })
    .expect(201);
  const roadmap = generated.body.data;
  expect(roadmap.courses).toHaveLength(1);
  await api()
    .get(`/api/roadmaps/${roadmap.id}`)
    .set('Authorization', auth())
    .expect(200);
  await api()
    .patch(
      `/api/roadmaps/${roadmap.id}/courses/${roadmap.courses[0].courseId}/progress`,
    )
    .set('Authorization', auth())
    .send({ progress: 50 })
    .expect(200);
  await api()
    .post('/api/roadmaps/generate')
    .set('Authorization', auth('other'))
    .send({ assessmentId: saved.body.data.profile.assessmentId })
    .expect(404);
  await api()
    .put(`/api/assessments/${saved.body.data.profile.assessmentId}/answers`)
    .set('Authorization', auth())
    .send({})
    .expect(404);
});
