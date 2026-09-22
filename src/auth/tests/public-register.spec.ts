import { PassportModule } from '@nestjs/passport';
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AuthController } from '../controllers/auth.controller.js';
import { AuthService } from '../services/auth.service.js';
import { setupApp } from '../../config/setup.js';
import { vi } from 'vitest';

describe('Public registration HTTP contract', () => {
  let app: INestApplication;
  const register = vi.fn();
  const payload = {
    email: 'NEW@example.com',
    password: 'Password123!',
    first_name: 'New',
    last_name: 'User',
  };
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [PassportModule.register({ defaultStrategy: 'jwt' })],
      controllers: [AuthController],
      providers: [{ provide: AuthService, useValue: { register } }],
    }).compile();
    app = module.createNestApplication();
    setupApp(app);
    await app.init();
    await app.listen(0, '127.0.0.1');
  });
  afterAll(async () => {
    await app?.close();
  });
  beforeEach(() => {
    register.mockReset();
  });
  it('accepts anonymous registration and omits secrets from the session', async () => {
    register.mockResolvedValue({
      accessToken: 'token',
      user: {
        id: 'id',
        email: 'new@example.com',
        first_name: 'New',
        last_name: 'User',
        role: 'user',
        password: 'hash',
        two_factor_secret: 'secret',
      },
    });
    const response = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send(payload)
      .expect(201);
    expect(register).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'new@example.com' }),
    );
    expect(response.body.data.accessToken).toBe('token');
    expect(response.body.data.user).not.toHaveProperty('password');
    expect(JSON.stringify(response.body)).not.toContain('secret');
  });
  it.each(['role', 'client_id', 'isActive', 'mustChangePassword'])(
    'rejects privileged field %s',
    async (field) => {
      await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({ ...payload, [field]: 'injected' })
        .expect(400);
      expect(register).not.toHaveBeenCalled();
    },
  );
  it.each(['first_name', 'last_name'])(
    'rejects blank %s after trimming',
    async (field) => {
      await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({ ...payload, [field]: '   ' })
        .expect(400);
      expect(register).not.toHaveBeenCalled();
    },
  );
  it('rejects weak passwords', async () => {
    await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ ...payload, password: 'short' })
      .expect(400);
    expect(register).not.toHaveBeenCalled();
  });
});
