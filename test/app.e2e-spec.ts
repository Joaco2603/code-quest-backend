import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import type { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { CatalogModule } from '../dist/catalog/catalog.module.js';
import { CatalogService } from '../dist/catalog/catalog.service.js';
import { CatalogAdminGuard } from '../dist/catalog/guards/catalog-admin.guard.js';
import { catalogEntities } from '../dist/catalog/entities/catalog.entities.js';
import { CreateCatalog1789600000000 } from '../dist/database/migrations/1789600000000-CreateCatalog.js';
import { setupApp } from '../dist/config/setup.js';
import { setupSwagger } from '../dist/config/swagger.js';

const url = process.env.TEST_DATABASE_URL;
if (!url || !new URL(url).pathname.endsWith('_test')) {
  throw new Error(
    'Set TEST_DATABASE_URL to a dedicated database whose name ends with _test; development .env is never used',
  );
}
const schema = `catalog_test_${randomUUID().replaceAll('-', '')}`;
let bootstrapDb: DataSource;
let app: INestApplication;
let service: CatalogService;
let db: DataSource;
let allowAdmin = false;
let categoryId: number;
let technologyId: number;

const api = () => request(app.getHttpServer());
const complete = (extra: object = {}) => ({
  title: 'TypeScript basics',
  description: 'Learn the foundations of TypeScript',
  url: 'https://example.com/course',
  imageUrl: 'https://example.com/image.png',
  durationMinutes: 120,
  instructor: 'Instructor',
  level: 'beginner',
  categoryIds: [categoryId],
  technologyIds: [technologyId],
  ...extra,
});
async function create(body: object) {
  return (await api().post('/api/admin/courses').send(body).expect(201)).body
    .data;
}
async function publish(id: number) {
  return api().post(`/api/admin/courses/${id}/publish`).expect(200);
}

beforeAll(async () => {
  bootstrapDb = await new DataSource({ type: 'postgres', url }).initialize();
  await bootstrapDb.query(`CREATE SCHEMA "${schema}"`);
  const options = {
    type: 'postgres' as const,
    url,
    schema,
    extra: { options: `-c search_path=${schema}` },
    entities: catalogEntities,
    migrations: [CreateCatalog1789600000000],
    synchronize: false,
  };
  // Prove the migration can be applied, reverted and applied again on a clean schema.
  const migrationDb = await new DataSource(options).initialize();
  try {
    await migrationDb.runMigrations();
    await migrationDb.undoLastMigration();
    await migrationDb.runMigrations();
  } finally {
    await migrationDb.destroy();
  }
  const module = await Test.createTestingModule({
    imports: [TypeOrmModule.forRoot(options), CatalogModule],
  })
    .overrideGuard(CatalogAdminGuard)
    .useValue({ canActivate: () => allowAdmin })
    .compile();
  app = module.createNestApplication();
  setupApp(app, { allowedOrigins: ['http://localhost:3000'] });
  setupSwagger(app, new ConfigService({ app: { port: 3000 } }));
  await app.init();
  service = app.get(CatalogService);
  db = app.get(DataSource);
}, 30000);
beforeEach(async () => {
  allowAdmin = true;
  await db.query(
    'TRUNCATE course_prerequisites, course_categories, course_technologies, courses, categories, technologies RESTART IDENTITY CASCADE',
  );
  categoryId = (
    await api().post('/api/categories').send({ name: 'Backend' }).expect(201)
  ).body.data.id;
  technologyId = (
    await api()
      .post('/api/technologies')
      .send({ name: 'TypeScript' })
      .expect(201)
  ).body.data.id;
});
afterAll(async () => {
  await app?.close();
  if (bootstrapDb?.isInitialized) {
    await bootstrapDb.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await bootstrapDb.destroy();
  }
});

it('serves docs, fixed levels, CORS and security headers under /api', async () => {
  const response = await api()
    .get('/api/levels')
    .set('Origin', 'http://localhost:3000')
    .expect(200);
  expect(response.body).toEqual({
    data: ['beginner', 'intermediate', 'advanced'],
  });
  expect(response.headers['access-control-allow-origin']).toBe(
    'http://localhost:3000',
  );
  expect(response.headers['x-content-type-options']).toBe('nosniff');
  const doc = (await api().get('/api/docs-json').expect(200)).body;
  expect(doc.paths['/api/courses']).toBeDefined();
  expect(doc.servers[0].url).toBe('http://localhost:3000');
  await api().get('/api/docs/').expect(200);
  await api().get('/api/reference').expect(200);
});
it('documents nullable course fields with their actual JSON types', async () => {
  const doc = (await api().get('/api/docs-json').expect(200)).body;
  const fields = doc.components.schemas.CreateCourseDto.properties;
  for (const name of ['description', 'url', 'imageUrl', 'instructor']) {
    expect(fields[name]).toMatchObject({ type: 'string', nullable: true });
  }
  expect(fields.durationMinutes).toMatchObject({
    type: 'integer',
    nullable: true,
  });
});
it('rejects IDs outside the database range before querying PostgreSQL', async () => {
  for (const route of [
    'courses',
    'categories',
    'technologies',
    'admin/courses',
  ]) {
    await api().get(`/api/${route}/2147483648`).expect(400);
  }
  for (const field of ['categoryId', 'technologyId']) {
    await api().get(`/api/courses?${field}=2147483648`).expect(400);
  }
  for (const field of ['categoryIds', 'technologyIds', 'prerequisiteIds']) {
    await api()
      .post('/api/admin/courses')
      .send({ title: 'Draft', [field]: [2147483648] })
      .expect(400);
  }
});
it('blocks writes and admin reads without authentication, even with a forged role', async () => {
  allowAdmin = false;
  await api()
    .post('/api/categories')
    .set('X-Role', 'admin')
    .send({ name: 'Mobile' })
    .expect(403);
  await api()
    .post('/api/admin/courses')
    .send({ title: 'A', role: 'admin' })
    .expect(403);
  await api().get('/api/admin/courses').expect(403);
  await api().get('/api/courses').expect(200);
});
it('rejects unknown input, null title, invalid relations and string durations', async () => {
  await api()
    .post('/api/admin/courses')
    .send({ title: 'A', status: 'published' })
    .expect(400);
  await api()
    .post('/api/admin/courses')
    .send({ title: 'A', categoryIds: [999] })
    .expect(400);
  await api()
    .post('/api/admin/courses')
    .send({ title: 'A', durationMinutes: '60' })
    .expect(400);
  const course = await create({ title: 'A' });
  await api()
    .patch(`/api/admin/courses/${course.id}`)
    .send({ title: null })
    .expect(400);
  await api()
    .patch(`/api/admin/courses/${course.id}`)
    .send({ technologyIds: null })
    .expect(400);
});
it('supports taxonomy CRUD and rejects case-insensitive duplicate names', async () => {
  await api()
    .post('/api/technologies')
    .send({ name: ' typescript ' })
    .expect(409);
  await api()
    .patch(`/api/categories/${categoryId}`)
    .send({ name: ' Backend APIs ' })
    .expect(200);
  expect(
    (await api().get(`/api/categories/${categoryId}`).expect(200)).body.data
      .name,
  ).toBe('Backend APIs');
  await api().delete(`/api/categories/${categoryId}`).expect(204);
  await api().get(`/api/categories/${categoryId}`).expect(404);
});
it('keeps drafts private and requires complete data for publication', async () => {
  const course = await create({ title: 'Draft' });
  await api().get(`/api/courses/${course.id}`).expect(404);
  expect((await api().get('/api/courses').expect(200)).body.meta.total).toBe(
    0,
  );
  expect((await api().get('/api/courses').expect(200)).body.data).toEqual([]);
  await api().post(`/api/admin/courses/${course.id}/publish`).expect(400);
  await api()
    .patch(`/api/admin/courses/${course.id}`)
    .send(complete())
    .expect(200);
  await publish(course.id);
  await api().get(`/api/courses/${course.id}`).expect(200);
  await api()
    .patch(`/api/admin/courses/${course.id}`)
    .send({ description: null })
    .expect(400);
  expect(
    (await api().get(`/api/courses/${course.id}`).expect(200)).body.data
      .description,
  ).toBe(complete().description);
});
it('supports many categories/technologies and paginated filters without losing relations', async () => {
  const other = (
    await api().post('/api/categories').send({ name: 'Frontend' }).expect(201)
  ).body.data.id;
  const course = await create(
    complete({ title: '100% TypeScript', categoryIds: [categoryId, other] }),
  );
  await publish(course.id);
  const second = await create(
    complete({ title: 'Other course', level: 'advanced' }),
  );
  await publish(second.id);
  const result = (
    await api()
      .get(
        `/api/courses?categoryId=${other}&technologyId=${technologyId}&level=beginner&search=100%25&limit=1`,
      )
      .expect(200)
  ).body;
  expect(result.meta.total).toBe(1);
  expect(result.meta.limit).toBe(1);
  expect(result.meta.offset).toBe(0);
  expect(result.data[0].categories).toHaveLength(2);
  const page = (await api().get('/api/courses?limit=1&page=2').expect(200))
    .body;
  expect(page.meta.total).toBe(2);
  expect(page.meta.limit).toBe(1);
  expect(page.meta.offset).toBe(1);
  expect(page.data[0].id).toBe(second.id);
  const byOffset = (await api().get('/api/courses?offset=40').expect(200))
    .body;
  expect(byOffset.meta).toMatchObject({ total: 2, limit: 20, offset: 40 });
  expect(byOffset.data).toEqual([]);
  await api().get('/api/courses?status=draft').expect(400);
  await api().get('/api/courses?limit=101').expect(400);
});
it('prevents deleting taxonomy entries referenced by drafts or published courses', async () => {
  await create(complete());
  await api().delete(`/api/categories/${categoryId}`).expect(409);
  await api().delete(`/api/technologies/${technologyId}`).expect(409);
});
it('rejects direct, transitive and concurrent prerequisite cycles', async () => {
  const a = await create({ title: 'A' });
  const b = await create({ title: 'B', prerequisiteIds: [a.id] });
  const c = await create({ title: 'C', prerequisiteIds: [b.id] });
  await api()
    .patch(`/api/admin/courses/${a.id}`)
    .send({ prerequisiteIds: [a.id] })
    .expect(400);
  await api()
    .patch(`/api/admin/courses/${a.id}`)
    .send({ prerequisiteIds: [c.id] })
    .expect(409);
  const d = await create({ title: 'D' });
  const e = await create({ title: 'E' });
  const responses = await Promise.all([
    api()
      .patch(`/api/admin/courses/${d.id}`)
      .send({ prerequisiteIds: [e.id] }),
    api()
      .patch(`/api/admin/courses/${e.id}`)
      .send({ prerequisiteIds: [d.id] }),
  ]);
  expect(responses.map((r) => r.status).sort((a, b) => a - b)).toEqual([
    200, 409,
  ]);
});
it('requires published prerequisites and protects published dependents', async () => {
  const a = await create(complete());
  const b = await create(complete({ prerequisiteIds: [a.id] }));
  await api().post(`/api/admin/courses/${b.id}/publish`).expect(409);
  await publish(a.id);
  await publish(b.id);
  await api().post(`/api/admin/courses/${a.id}/archive`).expect(409);
  await api().post(`/api/admin/courses/${a.id}/draft`).expect(409);
  await api().post(`/api/admin/courses/${b.id}/archive`).expect(200);
  await api().post(`/api/admin/courses/${a.id}/archive`).expect(200);
  expect(await service.getPublishedCatalog()).toEqual([]);
  expect(
    (await service.getCoursesForExistingRoadmap([a.id, b.id])).map((c) => c.id),
  ).toEqual([a.id, b.id]);
});
it('archives without deleting, allows restoration to draft and supports admin status filters', async () => {
  const course = await create(complete());
  await publish(course.id);
  await api().post(`/api/admin/courses/${course.id}/archive`).expect(200);
  await api().get(`/api/courses/${course.id}`).expect(404);
  await api()
    .patch(`/api/admin/courses/${course.id}`)
    .send({ title: 'Changed' })
    .expect(409);
  expect(
    (await api().get('/api/admin/courses?status=archived').expect(200)).body
      .meta.total,
  ).toBe(1);
  expect(
    (await api().get('/api/admin/courses?status=archived').expect(200)).body
      .data,
  ).toHaveLength(1);
  await api().post(`/api/admin/courses/${course.id}/draft`).expect(200);
  await api()
    .patch(`/api/admin/courses/${course.id}`)
    .send({ description: null })
    .expect(200);
});
it('validates LLM IDs, uniqueness, prerequisite order and trusted completed courses', async () => {
  const a = await create(complete());
  await publish(a.id);
  const b = await create(complete({ prerequisiteIds: [a.id] }));
  await publish(b.id);
  await expect(service.validateRoadmapSelection([b.id])).rejects.toThrow(
    'prerequisites',
  );
  await expect(service.validateRoadmapSelection([b.id, a.id])).rejects.toThrow(
    'prerequisites',
  );
  await expect(service.validateRoadmapSelection([a.id, a.id])).rejects.toThrow(
    'unique',
  );
  await expect(service.validateRoadmapSelection([999])).rejects.toThrow(
    'not published',
  );
  expect(
    (await service.validateRoadmapSelection([a.id, b.id])).map((c) => c.id),
  ).toEqual([a.id, b.id]);
  expect((await service.validateRoadmapSelection([b.id], [a.id]))[0].id).toBe(
    b.id,
  );
});
it('exposes the unified {data,meta} catalog contract without nested wrapping', async () => {
  const course = await create(complete());
  await publish(course.id);
  const list = (await api().get('/api/courses?limit=20&page=1').expect(200))
    .body;
  expect(Object.keys(list).sort()).toEqual(['data', 'meta']);
  expect(Object.keys(list.meta).sort()).toEqual(['limit', 'offset', 'total']);
  expect(list.meta).toMatchObject({ total: 1, limit: 20, offset: 0 });
  expect(list.data).toHaveLength(1);
  expect(Object.keys(list.data[0]).sort()).toEqual(
    [
      'id',
      'title',
      'description',
      'url',
      'imageUrl',
      'durationMinutes',
      'instructor',
      'level',
      'status',
      'createdAt',
      'updatedAt',
      'categories',
      'technologies',
      'prerequisiteIds',
    ].sort(),
  );
  expect(list.data[0]).not.toHaveProperty('data');
  const single = (await api().get(`/api/courses/${course.id}`).expect(200))
    .body;
  expect(Object.keys(single)).toEqual(['data']);
  expect(single.data.id).toBe(course.id);
  const categories = (await api().get('/api/categories').expect(200)).body;
  expect(Object.keys(categories)).toEqual(['data']);
  expect(categories.data[0]).toEqual({ id: categoryId, name: 'Backend' });
  const empty = (await api().get('/api/courses?limit=20&page=99').expect(200))
    .body;
  expect(empty.data).toEqual([]);
  expect(empty.meta.total).toBe(1);
});
