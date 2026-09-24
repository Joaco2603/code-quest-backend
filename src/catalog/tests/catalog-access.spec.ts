import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { getRepositoryToken } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { CatalogModule } from '../../../dist/catalog/catalog.module.js';
import { CatalogService } from '../../../dist/catalog/catalog.service.js';
import { JwtStrategy } from '../../../dist/auth/strategies/jwt.strategy.js';
import { User } from '../../../dist/user/entities/user.entity.js';
import { setupApp } from '../../../dist/config/setup.js';

const secret = 'catalog-test-secret-at-least-32-characters';
const jwt = new JwtService({ secret });
const users = new Map([
  ['admin', { id: 'admin', role: 'admin', isActive: true }],
  ['student', { id: 'student', role: 'user', isActive: true }],
  ['inactive', { id: 'inactive', role: 'admin', isActive: false }],
]);
const catalog = {
  listCourses: vi
    .fn()
    .mockResolvedValue({ items: [], total: 0, limit: 20, offset: 0 }),
  createCourse: vi.fn().mockResolvedValue({ id: 1 }),
  saveTaxonomy: vi.fn().mockResolvedValue({ id: 1 }),
};
let app: INestApplication;
const token = (sub: string, extra = {}) =>
  jwt.sign({ sub, purpose: 'access', is_two_factor_validated: true, ...extra });
beforeAll(async () => {
  const module = await Test.createTestingModule({
    imports: [CatalogModule],
    providers: [
      JwtStrategy,
      {
        provide: ConfigService,
        useValue: new ConfigService({ JWT_SECRET: secret }),
      },
      {
        provide: getRepositoryToken(User),
        useValue: {
          findOne: async ({ where }: { where: { id: string } }) =>
            users.get(where.id),
        },
      },
    ],
  })
    .overrideProvider(CatalogService)
    .useValue(catalog)
    .compile();
  app = module.createNestApplication();
  setupApp(app);
  await app.init();
  await app.listen(0, '127.0.0.1');
});
afterAll(async () => {
  await app?.close();
});

it('keeps published catalog public and requires signed authentication for administration', async () => {
  await request(app.getHttpServer()).get('/api/courses').expect(200);
  await request(app.getHttpServer()).get('/api/admin/courses').expect(401);
  await request(app.getHttpServer())
    .get('/api/admin/courses')
    .set('Authorization', 'Bearer invalid')
    .expect(401);
  await request(app.getHttpServer())
    .get('/api/admin/courses')
    .set('Authorization', `Bearer ${token('admin')}`)
    .expect(200);
});
it.each([
  ['student', { rol: 'admin' }, 403],
  ['inactive', {}, 401],
  ['admin', { purpose: 'two_factor', is_two_factor_validated: false }, 403],
  ['admin', { purpose: 'recovery' }, 403],
  ['admin', { purpose: 'password_change' }, 403],
  ['admin', { mustChangePassword: true }, 403],
  ['admin', { isRecovery: true }, 403],
])('rejects %s session %j', async (sub, extra, status) => {
  await request(app.getHttpServer())
    .get('/api/admin/courses')
    .set('Authorization', `Bearer ${token(sub, extra)}`)
    .expect(status);
});
it('protects course and taxonomy writes using the current database role', async () => {
  for (const [path, body] of [
    ['/api/admin/courses', { title: 'A course' }],
    ['/api/categories', { name: 'Backend' }],
    ['/api/technologies', { name: 'TypeScript' }],
  ] as const) {
    await request(app.getHttpServer())
      .post(path)
      .set('Authorization', `Bearer ${token('student')}`)
      .send(body)
      .expect(403);
    await request(app.getHttpServer())
      .post(path)
      .set('Authorization', `Bearer ${token('admin')}`)
      .send(body)
      .expect(201);
  }
});
