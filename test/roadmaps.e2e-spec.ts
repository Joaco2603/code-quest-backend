import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { CatalogService } from '../dist/catalog/catalog.service.js';
import { catalogEntities } from '../dist/catalog/entities/catalog.entities.js';
import { CreateCatalog1789600000000 } from '../dist/database/migrations/1789600000000-CreateCatalog.js';
import { ValidRoles } from '../dist/auth/interfaces/index.js';
import type { AuthUser } from '../dist/auth/interfaces/auth-user.type.js';
import { AddRoadmapScope1789600006000 } from '../dist/database/migrations/1789600006000-AddRoadmapScope.js';
import { AddRoadmapSource1789600007000 } from '../dist/database/migrations/1789600007000-AddRoadmapSource.js';
import { PersonalRoadmaps1789600008000 } from '../dist/database/migrations/1789600008000-PersonalRoadmaps.js';
import { CreateRoadmaps1789600004000 } from '../dist/database/migrations/1789600004000-CreateRoadmaps.js';
import { CreateUsersAndAuditLogs1760000000000 } from '../dist/database/migrations/1760000000000-CreateUsersAndAuditLogs.js';
import { RoadmapCourse } from '../dist/roadmaps/entities/roadmap-course.entity.js';
import { Roadmap } from '../dist/roadmaps/entities/roadmap.entity.js';
import { RoadmapsService } from '../dist/roadmaps/roadmaps.service.js';
import { User } from '../dist/user/entities/user.entity.js';

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
      entities: [...catalogEntities, User, Roadmap, RoadmapCourse],
      migrations: [
        CreateUsersAndAuditLogs1760000000000,
        CreateCatalog1789600000000,
        CreateRoadmaps1789600004000,
        AddRoadmapScope1789600006000,
        AddRoadmapSource1789600007000,
        PersonalRoadmaps1789600008000,
      ],
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

    const owner: AuthUser = {
      id: userId,
      email: 'owner@example.com',
      is_two_factor_enabled: false,
      is_two_factor_validated: true,
      role: ValidRoles.user,
    };
    const created = await service.create(owner, {
      title: 'Path',
      courseIds: [basics],
    });
    expect(created.scope).toBe('personal');
    await expect(
      service.update(owner, created.id, { courseIds: [advanced] }),
    ).rejects.toThrow(/missing or incorrectly ordered prerequisites/);

    await service.updateProgress(owner, created.id, basics, 100);
    const replaced = await service.update(owner, created.id, {
      courseIds: [basics, advanced],
    });
    expect(replaced.courses.map((item) => item.courseId)).toEqual([
      basics,
      advanced,
    ]);
    expect(replaced.courses[0].progress).toBe(100);

    const dropped = await service.update(owner, created.id, {
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
