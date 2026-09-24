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
import { QuestionsModule } from '../dist/questions/questions.module.js';
import { QuestionsService } from '../dist/questions/questionnaires/questions.service.js';
import type { QuestionnaireResponseDto } from '../dist/questions/questionnaires/dtos/questionnaire-response.dto.js';
import { User } from '../dist/user/entities/user.entity.js';
import { JwtStrategy } from '../dist/auth/strategies/jwt.strategy.js';
import { AdaptiveQuestionnaire1789600005000 } from '../dist/database/migrations/1789600005000-AdaptiveQuestionnaire.js';

const url = process.env.TEST_DATABASE_URL;
if (!url || !new URL(url).pathname.endsWith('_test'))
  throw new Error('Use a dedicated TEST_DATABASE_URL ending in _test');
const schema = `adaptive_test_${randomUUID().replaceAll('-', '')}`;
const secret = 'adaptive-questionnaire-test-secret-at-least-32-characters';
let bootstrap: DataSource;
let db: DataSource;
let app: INestApplication;
let questionnaire: QuestionnaireResponseDto;
let token: string;
let otherToken: string;
let id: number;
const api = () => request(app.getHttpServer());
const auth = () => ({ Authorization: `Bearer ${token}` });
const answer = (questionId: number, extra: object) =>
  api()
    .put(`/api/assessments/${id}/answers`)
    .set(auth())
    .send({ questionId, ...extra });
const applicable = async () =>
  (
    await api()
      .get(`/api/assessments/${id}/questionnaire`)
      .set(auth())
      .expect(200)
  ).body as QuestionnaireResponseDto;
const technology = () => questionnaire.questions[3];
async function baseAnswers() {
  for (const q of questionnaire.questions.slice(0, 3))
    await answer(q.id, { answerOptionId: q.options[0].id }).expect(200);
}

beforeAll(async () => {
  bootstrap = await new DataSource({ type: 'postgres', url }).initialize();
  await bootstrap.query(`CREATE SCHEMA "${schema}"`);
  const options = {
    ...databaseOptions({ JWT_SECRET: secret }),
    url,
    schema,
    extra: { options: `-c search_path=${schema},public` },
    migrationsRun: false,
  };
  const migrationDb = await new DataSource(options).initialize();
  try {
    // Install the prior schema and preserve a legacy questionnaire through up/down/up.
    const migrations = [...migrationDb.migrations];
    migrationDb.migrations.splice(
      0,
      migrationDb.migrations.length,
      ...migrations.filter(
        (m) => m.name !== 'AdaptiveQuestionnaire1789600005000',
      ),
    );
    await migrationDb.runMigrations();
    await migrationDb.query(
      `INSERT INTO questionnaires(title) VALUES ('Legacy')`,
    );
    await migrationDb.query(
      `INSERT INTO questions(questionnaire_id,question,type,sort_order) SELECT id,'Legacy question','text',1 FROM questionnaires WHERE title='Legacy'`,
    );
    migrationDb.migrations.splice(
      0,
      migrationDb.migrations.length,
      ...migrations,
    );
    await migrationDb.runMigrations();
    await migrationDb.undoLastMigration();
    await migrationDb.runMigrations();
    expect(
      await migrationDb.query(
        `SELECT question FROM questions WHERE question='Legacy question'`,
      ),
    ).toHaveLength(1);
  } finally {
    await migrationDb.destroy();
  }
  const module = await Test.createTestingModule({
    imports: [
      TypeOrmModule.forRoot(options),
      TypeOrmModule.forFeature([User]),
      QuestionsModule,
    ],
    providers: [
      JwtStrategy,
      {
        provide: ConfigService,
        useValue: new ConfigService({ JWT_SECRET: secret }),
      },
    ],
  }).compile();
  app = module.createNestApplication({ logger: false });
  setupApp(app, { allowedOrigins: [] });
  await app.init();
  db = app.get(DataSource);
  const [{ id: questionnaireId }] = (await db.query(
    `SELECT id FROM questionnaires WHERE title='Tu próxima ruta de aprendizaje'`,
  )) as { id: number }[];
  questionnaire = await app
    .get(QuestionsService)
    .getActiveQuestionnaire(questionnaireId);
  const jwt = new JwtService({ secret });
  const tokens: string[] = [];
  for (const email of ['student@example.test', 'other@example.test']) {
    const [{ id: userId }] = (await db.query(
      `INSERT INTO users (email,first_name,"mustChangePassword") VALUES ($1,'Test',false) RETURNING id`,
      [email],
    )) as { id: string }[];
    tokens.push(
      jwt.sign({
        sub: userId,
        purpose: 'access',
        is_two_factor_enabled: false,
        is_two_factor_validated: true,
      }),
    );
  }
  [token, otherToken] = tokens;
}, 30000);
beforeEach(async () => {
  await db.query('TRUNCATE assessments CASCADE');
  id = (
    await api()
      .post('/api/assessments')
      .set(auth())
      .send({ questionnaireId: questionnaire.id })
      .expect(201)
  ).body.id;
});
afterAll(async () => {
  await app?.close();
  if (bootstrap?.isInitialized) {
    await bootstrap.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await bootstrap.destroy();
  }
});

it('exposes four initial questions, keeps old questionnaires and rejects unauthenticated access', async () => {
  await api().get(`/api/assessments/${id}/questionnaire`).expect(401);
  const initial = (
    await api()
      .get(`/api/questionnaires/active/${questionnaire.id}`)
      .set(auth())
      .expect(200)
  ).body.data;
  expect(initial).not.toHaveProperty('code');
  expect(initial.questions).toHaveLength(4);
  expect(initial.questions[3].rules).toEqual({
    required: false,
    maxSelections: 3,
  });
  expect((await applicable()).questions).toHaveLength(4);
  const legacy = (
    await api().get('/api/questionnaires/active').set(auth()).expect(200)
  ).body.data.find((q: { title: string }) => q.title === 'Legacy');
  expect(
    (
      await api()
        .get(`/api/questionnaires/active/${legacy.id}`)
        .set(auth())
        .expect(200)
    ).body.data.questions[0].rules.required,
  ).toBe(true);
});
it('completes with only the three required base answers and preserves optional goal details', async () => {
  await baseAnswers();
  const goal = questionnaire.questions[0];
  await answer(goal.id, {
    answerOptionId: goal.options[0].id,
    value: '  Crear mi portfolio  ',
  }).expect(200);
  await answer(goal.id, {
    answerOptionId: goal.options[0].id,
    value: 'x'.repeat(1001),
  }).expect(400);
  const completed = (
    await api().post(`/api/assessments/${id}/complete`).set(auth()).expect(201)
  ).body;
  expect(completed.completedAt).toBeTruthy();
  expect(completed.answers).toHaveLength(3);
  expect(
    completed.answers.find(
      (a: { questionId: number }) => a.questionId === goal.id,
    ).value,
  ).toBe('Crear mi portfolio');
  await answer(goal.id, { answerOptionId: goal.options[0].id }).expect(409);
  await api()
    .delete(`/api/assessments/${id}/answers/${goal.id}`)
    .set(auth())
    .expect(409);
});
it('requires only selected levels, enforces three technologies and preserves unknown explicitly', async () => {
  await baseAnswers();
  await answer(technology().id, {
    answerOptionIds: technology()
      .options.slice(0, 4)
      .map((o) => o.id),
  }).expect(400);
  expect((await applicable()).questions).toHaveLength(4);
  const selected = technology()
    .options.slice(0, 3)
    .map((o) => o.id);
  await answer(technology().id, { answerOptionIds: selected }).expect(200);
  const visible = await applicable();
  expect(visible.questions).toHaveLength(7);
  await api().post(`/api/assessments/${id}/complete`).set(auth()).expect(400);
  const hidden = questionnaire.questions.find(
    (q) =>
      q.rules?.showWhen && !selected.includes(q.rules.showWhen.answerOptionId),
  )!;
  await answer(hidden.id, { answerOptionId: hidden.options[0].id }).expect(400);
  for (const q of visible.questions.slice(4)) {
    const unknown = q.options.find((o) => o.value === 'unknown')!;
    await answer(q.id, { answerOptionId: unknown.id }).expect(200);
  }
  await api().post(`/api/assessments/${id}/complete`).set(auth()).expect(201);
});
it('removes obsolete skill answers after changing or clearing technologies', async () => {
  const tech = technology();
  await answer(tech.id, {
    answerOptionIds: [tech.options[0].id, tech.options[1].id],
  }).expect(200);
  const levels = (await applicable()).questions.slice(4);
  for (const q of levels)
    await answer(q.id, { answerOptionId: q.options[1].id }).expect(200);
  const changed = (
    await answer(tech.id, { answerOptionIds: [tech.options[1].id] }).expect(200)
  ).body;
  expect(
    changed.answers.map((a: { questionId: number }) => a.questionId),
  ).not.toContain(levels[0].id);
  expect((await applicable()).questions).toHaveLength(5);
  const cleared = (
    await api()
      .delete(`/api/assessments/${id}/answers/${tech.id}`)
      .set(auth())
      .expect(200)
  ).body;
  expect(cleared.answers).toEqual([]);
  expect((await applicable()).questions).toHaveLength(4);
  await baseAnswers();
  await api().post(`/api/assessments/${id}/complete`).set(auth()).expect(201);
});
it('protects ownership on new read and delete routes', async () => {
  await api()
    .get(`/api/assessments/${id}/questionnaire`)
    .set('Authorization', `Bearer ${otherToken}`)
    .expect(404);
  await api()
    .delete(`/api/assessments/${id}/answers/${technology().id}`)
    .set('Authorization', `Bearer ${otherToken}`)
    .expect(404);
});
it('rolls back an answer replacement when persistence fails', async () => {
  const tech = technology();
  await answer(tech.id, { answerOptionIds: [tech.options[0].id] }).expect(200);
  const level = (await applicable()).questions[4];
  await answer(level.id, { answerOptionId: level.options[1].id }).expect(200);
  await db.query(
    `ALTER TABLE user_answers ADD CONSTRAINT test_reject_option CHECK (answer_option_id <> ${tech.options[1].id})`,
  );
  try {
    await answer(tech.id, { answerOptionIds: [tech.options[1].id] }).expect(
      500,
    );
    const stored = (
      await api().get(`/api/assessments/${id}`).set(auth()).expect(200)
    ).body.answers;
    expect(
      stored.map((a: { answerOptionId: number }) => a.answerOptionId),
    ).toEqual([tech.options[0].id, level.options[1].id]);
  } finally {
    await db.query(
      'ALTER TABLE user_answers DROP CONSTRAINT test_reject_option',
    );
  }
});
it('refuses migration rollback when the new questionnaire has attempts', async () => {
  const runner = db.createQueryRunner();
  try {
    await expect(
      new AdaptiveQuestionnaire1789600005000().down(runner),
    ).rejects.toThrow('existing assessments');
  } finally {
    await runner.release();
  }
});

it('prevents removing a condition parent or referenced option', async () => {
  const service = app.get(QuestionsService);
  await expect(service.deactivateQuestion(technology().id)).rejects.toThrow(
    'conditional question',
  );
  await expect(
    service.deleteOption(technology().options[0].id),
  ).rejects.toThrow('conditional question');
  expect((await applicable()).questions).toHaveLength(4);
});

it('serializes completing an attempt against a concurrent change of technologies', async () => {
  await baseAnswers();
  const [completion, selection] = await Promise.all([
    api().post(`/api/assessments/${id}/complete`).set(auth()),
    answer(technology().id, { answerOptionIds: [technology().options[0].id] }),
  ]);
  expect([
    [201, 409],
    [400, 200],
  ]).toContainEqual([completion.status, selection.status]);
  const stored = (
    await api().get(`/api/assessments/${id}`).set(auth()).expect(200)
  ).body;
  if (stored.completedAt) expect(stored.answers).toHaveLength(3);
});
