import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import { PassportModule } from '@nestjs/passport';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { getRepositoryToken } from '@nestjs/typeorm';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { vi } from 'vitest';
import { AuthController } from '../../../dist/auth/controllers/auth.controller.js';
import { AuthModule } from '../../../dist/auth/auth.module.js';
import { AuthService } from '../../../dist/auth/services/auth.service.js';
import { JwtStrategy } from '../../../dist/auth/strategies/jwt.strategy.js';
import { User } from '../../../dist/user/entities/user.entity.js';
import { TwoFactorController } from '../../../dist/auth/controllers/two-factor.controller.js';

// Exercise the real Passport strategy and route guards over HTTP.
describe('MVP session boundary', () => {
  let app: INestApplication;
  const secret = 'test-only-mvp-session-secret-at-least-32-chars';
  const jwt = new JwtService({ secret });
  const account = {
    id: 'test-user',
    email: 'test@example.com',
    role: 'admin',
    isActive: true,
    is_two_factor_enabled: true,
    mustChangePassword: false,
  };
  const repository = { findOne: vi.fn() };
  const auth = { checkAuthStatus: vi.fn() };

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [PassportModule.register({ defaultStrategy: 'jwt' })],
      controllers: [AuthController],
      providers: [
        JwtStrategy,
        { provide: getRepositoryToken(User), useValue: repository },
        { provide: ConfigService, useValue: { get: () => secret } },
        { provide: AuthService, useValue: auth },
      ],
    }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
  });
  afterAll(async () => {
    await app?.close();
  });
  beforeEach(() => {
    vi.clearAllMocks();
    repository.findOne.mockResolvedValue({ ...account });
    auth.checkAuthStatus.mockResolvedValue({ user: account, token: 'renewed' });
  });

  it.each(['password_change', 'recovery', 'two_factor', undefined])(
    'rejects %s bearer tokens before renewal',
    async (purpose) => {
      const token = jwt.sign({ sub: account.id, purpose });
      await request(app.getHttpServer())
        .get('/api/auth/renovated')
        .set('Authorization', `Bearer ${token}`)
        .expect(403);
      expect(auth.checkAuthStatus).not.toHaveBeenCalled();
    },
  );
  it('accepts access sessions without MFA proof, even for enrolled admins', async () => {
    const token = jwt.sign({
      sub: account.id,
      purpose: 'access',
      is_two_factor_validated: false,
    });
    await request(app.getHttpServer())
      .get('/api/auth/renovated')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(auth.checkAuthStatus).toHaveBeenCalledOnce();
  });
  it('rejects access tokens while the account requires a password change', async () => {
    repository.findOne.mockResolvedValue({
      ...account,
      mustChangePassword: true,
    });
    const token = jwt.sign({ sub: account.id, purpose: 'access' });
    await request(app.getHttpServer())
      .get('/api/auth/renovated')
      .set('Authorization', `Bearer ${token}`)
      .expect(403);
    expect(auth.checkAuthStatus).not.toHaveBeenCalled();
  });
  it('rejects recovery-marked access tokens', async () => {
    const token = jwt.sign({
      sub: account.id,
      purpose: 'access',
      isRecovery: true,
    });
    await request(app.getHttpServer())
      .get('/api/auth/renovated')
      .set('Authorization', `Bearer ${token}`)
      .expect(403);
  });
  it.each(['/api/auth/2fa/verify', '/api/auth/forgot-password-2fa'])(
    'does not expose %s',
    async (path) => {
      await request(app.getHttpServer()).post(path).send({}).expect(404);
    },
  );
  it('does not register the MFA provisioning controller', () => {
    expect(Reflect.getMetadata('controllers', AuthModule)).not.toContain(
      TwoFactorController,
    );
  });
});
