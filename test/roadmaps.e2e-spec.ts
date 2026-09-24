import { databaseOptions } from '../dist/config/database.js';
import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { CatalogService } from '../dist/catalog/catalog.service.js';
import { RoadmapCourse } from '../dist/roadmaps/entities/roadmap-course.entity.js';
import { Roadmap } from '../dist/roadmaps/entities/roadmap.entity.js';
import { RoadmapsService } from '../dist/roadmaps/roadmaps.service.js';

const url = process.env.TEST_DATABASE_URL;
if (!url || !new URL(url).pathname.endsWith('_test')) {
  throw new Error(
    'Set TEST_DATABASE_URL to a dedicated database whose name ends with _test; development .env is never used',
  );
}

const schema = `catalog_test_${randomUUID().replaceAll('-', '')}`;

describe('roadmaps persistence', () => {
  let bootstrapDb: DataSource;
  let db: DataSource;
  let service: RoadmapsService;

  beforeAll(async () => {
    bootstrapDb = await new DataSource({ type: 'postgres', url }).initialize();
    await bootstrapDb.query(`CREATE SCHEMA "${schema}"`);
    const options = {
      type: 'postgres' as const,
      url,
      schema,
      extra: { options: `-c search_path=${schema}` },
      entities: databaseOptions({ NODE_ENV: 'test' }).entities,
      migrations: databaseOptions({ NODE_ENV: 'test' }).migrations,
      synchronize: false,
    };
    const migrationDb = await new DataSource(options).initialize();
    try {
      await migrationDb.runMigrations();
      await migrationDb.undoLastMigration();
      await migrationDb.runMigrations();
    } finally {
      await migrationDb.destroy();
    }
    db = await new DataSource(options).initialize();
    service = new RoadmapsService(
      db.getRepository(Roadmap),
      db.getRepository(RoadmapCourse),
      new CatalogService(db),
      db,
    );
  }, 30000);

  afterAll(async () => {
    await db?.destroy();
    if (bootstrapDb?.isInitialized) {
      await bootstrapDb.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await bootstrapDb.destroy();
    }
  });

  it('replaces an overlapping course list and cascades when the owner is deleted', async () => {
    const [{ id: userId }] = await db.query(
      `INSERT INTO users (email, first_name) VALUES ('owner@example.com', 'Owner') RETURNING id`,
    );
    const [{ id: basics }] = await db.query(
      `INSERT INTO courses (title, status) VALUES ('Basics', 'published') RETURNING id`,
    );
    const [{ id: advanced }] = await db.query(
      `INSERT INTO courses (title, status) VALUES ('Advanced', 'published') RETURNING id`,
    );
    await db.query(
      `INSERT INTO course_prerequisites (course_id, prerequisite_id) VALUES ($1, $2)`,
      [advanced, basics],
    );

    const created = await service.create(userId, {
      title: 'Path',
      courseIds: [basics],
    });
    await expect(
      service.update(userId, created.id, { courseIds: [advanced] }),
    ).rejects.toThrow(/missing or incorrectly ordered prerequisites/);

    await service.updateProgress(userId, created.id, basics, 100);
    const replaced = await service.update(userId, created.id, {
      courseIds: [basics, advanced],
    });
    expect(replaced.courses.map((item) => item.courseId)).toEqual([
      basics,
      advanced,
    ]);
    expect(replaced.courses[0].progress).toBe(100);

    const dropped = await service.update(userId, created.id, {
      courseIds: [advanced],
    });
    expect(dropped.courses.map((item) => item.courseId)).toEqual([advanced]);

    await db.query(`DELETE FROM users WHERE id = $1`, [userId]);
    const [{ roadmaps, memberships }] = await db.query(
      `SELECT
         (SELECT count(*)::int FROM roadmaps) AS roadmaps,
         (SELECT count(*)::int FROM roadmap_courses) AS memberships`,
    );
    expect(roadmaps).toBe(0);
    expect(memberships).toBe(0);
  });
});
