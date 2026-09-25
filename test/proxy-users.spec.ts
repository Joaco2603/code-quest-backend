import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import { Controller, type INestApplication } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import { getRepositoryToken } from '@nestjs/typeorm';
import { JwtStrategy } from '../dist/auth/strategies/jwt.strategy.js';
import { User } from '../dist/user/entities/user.entity.js';
import request from 'supertest';
import { setupApp } from '../dist/config/setup.js';
import { parseTrustProxy } from '../dist/config/trust-proxy.js';
import { HealthController } from '../dist/health/health.controller.js';
import { UserController } from '../dist/user/user.controller.js';
import { UserService } from '../dist/user/user.service.js';
import { GlobalExceptionFilter } from '../dist/common/filters/global-exception.filter.js';
import { HttpLoggingInterceptor } from '../dist/common/interceptors/http-logging.interceptor.js';
import { StructuredLoggerService } from '../dist/common/logger/structured-logger.service.js';
import { AuditLogService } from '../dist/common/services/audit-log.service.js';

@Controller('network')
class NetworkProbe extends HealthController {}

const logger = { log: vi.fn(), warn: vi.fn(), error: vi.fn() };
const audit = { recordHttpEvent: vi.fn().mockResolvedValue(undefined) };
let app: INestApplication;
async function start(trustProxy: string) {
  const module = await Test.createTestingModule({
    imports: [PassportModule.register({ defaultStrategy: 'jwt' })],
    controllers: [HealthController, NetworkProbe, UserController],
    providers: [
      { provide: UserService, useValue: {} },
      JwtStrategy,
      { provide: getRepositoryToken(User), useValue: {} },
      {
        provide: ConfigService,
        useValue: new ConfigService({
          JWT_SECRET: 'proxy-tests-secret-at-least-32-characters',
        }),
      },
    ],
  }).compile();
  app = module.createNestApplication();
  setupApp(app, { trustProxy });
  app.useGlobalFilters(
    new GlobalExceptionFilter(
      logger as unknown as StructuredLoggerService,
      audit as unknown as AuditLogService,
    ),
  );
  app.useGlobalInterceptors(
    new HttpLoggingInterceptor(
      logger as unknown as StructuredLoggerService,
      audit as unknown as AuditLogService,
    ),
  );
  await app.listen(0, '127.0.0.1');
}
afterEach(async () => {
  await app?.close();
  vi.clearAllMocks();
});

it.each([
  'true',
  '1',
  '*',
  'loopback',
  '172.18.0.0/0',
  '::/0',
  '10.0.0.1/33',
  '::1/129',
  '10.0.0.1,',
  '10.0.0.1/24/2',
])('rejects unsafe or invalid TRUST_PROXY %s', (value) => {
  expect(() => parseTrustProxy(value)).toThrow('TRUST_PROXY');
});
it('accepts explicit IPv4/IPv6 addresses and CIDRs; defaults to no trust', () => {
  expect(parseTrustProxy(undefined)).toBe(false);
  expect(parseTrustProxy(' ')).toBe(false);
  expect(parseTrustProxy('false')).toBe(false);
  expect(parseTrustProxy('172.18.0.3, 10.1.0.0/24, ::1, fd00::/64')).toEqual([
    '172.18.0.3',
    '10.1.0.0/24',
    '::1',
    'fd00::/64',
  ]);
});
it('logs the resolved client and direct peer for success and 404, ignoring spoofed leftmost IP', async () => {
  await start('127.0.0.1');
  const forwarded = '198.51.100.99, 203.0.113.7';
  await request(app.getHttpServer())
    .get('/api/network')
    .set('X-Forwarded-For', forwarded)
    .expect(200);
  await request(app.getHttpServer())
    .get('/api/missing')
    .set('X-Forwarded-For', forwarded)
    .expect(404);
  for (const log of [logger.log, logger.warn]) {
    expect(log).toHaveBeenCalledWith(
      expect.objectContaining({
        ip: '203.0.113.7',
        peerIp: '127.0.0.1',
        forwardedFor: forwarded,
      }),
      expect.any(String),
    );
  }
  expect(audit.recordHttpEvent).toHaveBeenCalledWith(
    expect.objectContaining({ ip: '203.0.113.7' }),
  );
});
it.each(['', '172.18.0.3'])(
  'ignores forwarded client identity from an untrusted socket (%s)',
  async (trust) => {
    await start(trust);
    await request(app.getHttpServer())
      .get('/api/network')
      .set('X-Forwarded-For', '203.0.113.7')
      .expect(200);
    expect(logger.log).toHaveBeenCalledWith(
      expect.objectContaining({
        ip: '127.0.0.1',
        peerIp: '127.0.0.1',
        forwardedFor: '203.0.113.7',
      }),
      expect.any(String),
    );
  },
);
it('keeps health working without forwarded headers and bounds diagnostic headers', async () => {
  await start('127.0.0.1');
  await request(app.getHttpServer()).get('/api/network').expect(200);
  expect(logger.log.mock.calls[0][0]).toMatchObject({
    ip: '127.0.0.1',
    forwardedFor: undefined,
  });
  await request(app.getHttpServer())
    .get('/api/missing')
    .set('X-Forwarded-For', 'x'.repeat(3000))
    .expect(404);
  expect(logger.warn.mock.calls[0][0].forwardedFor).toHaveLength(2048);
});
it('registers plural user routes behind authentication and removes the singular route', async () => {
  await start('');
  await request(app.getHttpServer()).get('/api/users').expect(401);
  await request(app.getHttpServer())
    .get('/api/users/43566ec8-22af-41d3-933a-918b536fe99f')
    .expect(401);
  await request(app.getHttpServer()).get('/api/user').expect(404);
});

it('silences successful health probes but keeps auditing them', async () => {
  await start('');
  await request(app.getHttpServer()).get('/api/health').expect(200);
  expect(logger.log).not.toHaveBeenCalled();
  expect(audit.recordHttpEvent).toHaveBeenCalled();
});
