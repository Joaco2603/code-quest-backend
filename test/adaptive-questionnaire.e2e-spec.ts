import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { databaseOptions } from '../dist/config/database.js';

const url = process.env.TEST_DATABASE_URL;
if (!url || !new URL(url).pathname.endsWith('_test')) {
  throw new Error('Use a dedicated TEST_DATABASE_URL ending in _test');
}
const schema = `integration_test_${randomUUID().replaceAll('-', '')}`;
let bootstrap: DataSource;
let db: DataSource;

beforeAll(async () => {
  bootstrap = await new DataSource({ type: 'postgres', url }).initialize();
  await bootstrap.query(`CREATE SCHEMA "${schema}"`);
  const defaults = databaseOptions({ NODE_ENV: 'test' });
  db = await new DataSource({
    type: 'postgres',
    url,
    schema,
    extra: { options: `-c search_path=${schema}` },
    entities: defaults.entities,
    migrations: defaults.migrations,
    synchronize: false,
  }).initialize();
});
afterAll(async () => {
  await db?.destroy();
  if (bootstrap?.isInitialized) {
    await bootstrap.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await bootstrap.destroy();
  }
});

it('upgrades the existing main schema dropping legacy attempts and keeping roadmaps', async () => {
  const all = [...db.migrations];
  db.migrations.splice(
    0,
    db.migrations.length,
    ...all.filter(
      (m) => Number((m.name ?? m.constructor.name).slice(-13)) < 1789948800000,
    ),
  );
  await db.runMigrations();
  const [user] = await db.query(
    `INSERT INTO users(email, first_name) VALUES ('legacy@example.test', 'Legacy') RETURNING id`,
  );
  const [questionnaire] = await db.query(
    `SELECT id FROM questionnaires ORDER BY id LIMIT 1`,
  );
  await db.query(
    `INSERT INTO assessments(user_id, questionnaire_id) VALUES ($1, $2)`,
    [user.id, questionnaire.id],
  );
  const [roadmap] = await db.query(
    `INSERT INTO roadmaps(user_id, title) VALUES ($1, 'Existing route') RETURNING id`,
    [user.id],
  );
  db.migrations.splice(0, db.migrations.length, ...all);
  await db.runMigrations();
  // Legacy attempts are dropped by design (MVP simplification); roadmaps stay.
  expect(await legacyTables()).toEqual([]);
  expect(
    (
      await db.query(
        'SELECT title, assessment_id FROM roadmaps WHERE id = $1',
        [roadmap.id],
      )
    )[0],
  ).toMatchObject({ title: 'Existing route', assessment_id: null });
  expect(await db.query('SELECT * FROM self_assessments')).toEqual([]);
  expect(
    (
      await db.query(`SELECT is_active FROM questionnaires WHERE title = $1`, [
        'Tu próxima ruta de aprendizaje',
      ])
    )[0],
  ).toMatchObject({ is_active: false });
  const added = all.filter(
    (m) => Number((m.name ?? m.constructor.name).slice(-13)) >= 1789948800000,
  );
  for (let i = 0; i < added.length; i++) await db.undoLastMigration();
  // Reverting recreates the empty legacy tables; dropped rows are gone.
  expect(await legacyTables()).toEqual(['assessments', 'user_answers']);
  expect(await db.query('SELECT * FROM assessments')).toEqual([]);
  expect(await db.query('SELECT * FROM user_answers')).toEqual([]);
  expect(
    await db.query('SELECT id FROM roadmaps WHERE id = $1', [roadmap.id]),
  ).toHaveLength(1);
  expect(
    (
      await db.query(`SELECT is_active FROM questionnaires WHERE title = $1`, [
        'Tu próxima ruta de aprendizaje',
      ])
    )[0],
  ).toMatchObject({ is_active: true });
  await db.runMigrations();
  expect(await legacyTables()).toEqual([]);
  expect(
    (
      await db.query(`SELECT is_active FROM questionnaires WHERE title = $1`, [
        'Tu próxima ruta de aprendizaje',
      ])
    )[0],
  ).toMatchObject({ is_active: false });
});

async function legacyTables(): Promise<string[]> {
  const rows = (await db.query(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema = current_schema()
       AND table_name IN ('assessments', 'user_answers')
     ORDER BY table_name`,
  )) as { table_name: string }[];
  return rows.map((row) => row.table_name);
}
