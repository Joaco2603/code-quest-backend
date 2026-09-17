import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { HealthController } from '../dist/health/health.controller.js';
import { HealthModule } from '../dist/health/health.module.js';

describe('HealthController', () => {
  it('returns ok with a timestamp and uptime, without touching the database', () => {
    const body = new HealthController().check();
    expect(body.status).toBe('ok');
    expect(Number.isNaN(Date.parse(body.timestamp))).toBe(false);
    expect(body.uptime).toBeGreaterThanOrEqual(0);
  });
});

describe('GET /api/health', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [HealthModule],
    }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('answers the liveness probe with 200 and { status: "ok" }', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/health')
      .expect(200);
    expect(response.body.status).toBe('ok');
  });
});
