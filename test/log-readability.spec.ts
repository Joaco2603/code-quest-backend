import 'reflect-metadata';
import {
  BadRequestException,
  UnauthorizedException,
  ForbiddenException,
  NotFoundException,
  HttpException,
  type ArgumentsHost,
} from '@nestjs/common';
import { StructuredLoggerService } from '../dist/common/logger/structured-logger.service.js';
import { GlobalExceptionFilter } from '../dist/common/filters/global-exception.filter.js';
import { AuditLogService } from '../dist/common/services/audit-log.service.js';
import { JwtAuthGuard } from '../dist/auth/guards/jwt.guard.js';
import { requestContext } from '../dist/common/request-context/request-context.js';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});
it('emits a single JSON metadata object with info severity and a short message', () => {
  vi.stubEnv('LOG_FORMAT', 'json');
  const output = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
  new StructuredLoggerService().log({
    event: 'http.request.completed',
    method: 'GET',
    path: '/api/users',
    statusCode: 200,
  });
  const payload = JSON.parse(String(output.mock.calls[0][0]));
  expect(payload).toMatchObject({
    level: 'info',
    message: 'http.request.completed',
    method: 'GET',
    path: '/api/users',
    metadata: { statusCode: 200 },
  });
  expect(payload.metadata).not.toHaveProperty('path');
});
it('renders compact development output and escapes injected newlines', () => {
  vi.stubEnv('NODE_ENV', 'development');
  vi.stubEnv('LOG_FORMAT', '');
  const output = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
  requestContext.run({ requestId: 'test\ninjected' }, () => {
    new StructuredLoggerService().warn({
      event: 'http.exception',
      method: 'GET',
      path: '/api/users',
      statusCode: 401,
      durationMs: 2,
      reason: 'auth.token_missing',
    });
  });
  const line = String(output.mock.calls[0][0]);
  expect(line).toContain('WARN GET /api/users 401 2ms');
  expect(line).toContain('auth.token_missing');
  expect(line.trim().split('\n')).toHaveLength(1);
});
it.each([
  [new Error('No auth token'), 'auth.token_missing'],
  [
    Object.assign(new Error('jwt expired'), { name: 'TokenExpiredError' }),
    'auth.token_expired',
  ],
  [
    Object.assign(new Error('invalid signature'), {
      name: 'JsonWebTokenError',
    }),
    'auth.token_invalid',
  ],
])(
  'classifies JWT failure without changing public response or exposing token',
  (info, reason) => {
    requestContext.run({}, () => {
      expect(() => new JwtAuthGuard().handleRequest(null, false, info)).toThrow(
        'Invalid or expired token',
      );
      expect(requestContext.get()?.authFailureReason).toBe(reason);
    });
  },
);
it.each([
  new BadRequestException(),
  new UnauthorizedException(),
  new ForbiddenException(),
  new NotFoundException(),
  new HttpException('limit', 429),
  new Error('internal failure'),
])(
  'logs client rejections without stacks and keeps server stacks',
  async (error) => {
    const logger = { warn: vi.fn(), error: vi.fn() };
    const audit = { recordHttpEvent: vi.fn() };
    const response = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    const host = {
      getType: () => 'http',
      switchToHttp: () => ({
        getRequest: () => ({ method: 'GET', originalUrl: '/api/health' }),
        getResponse: () => response,
      }),
    } as unknown as ArgumentsHost;
    await requestContext.run({ startedAt: Date.now() - 10 }, () =>
      new GlobalExceptionFilter(
        logger as unknown as StructuredLoggerService,
        audit as unknown as AuditLogService,
      ).catch(error, host),
    );
    if (error instanceof HttpException) {
      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({ durationMs: expect.any(Number) }),
        'GlobalExceptionFilter',
      );
      expect(logger.error).not.toHaveBeenCalled();
    } else {
      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: 500 }),
        error.stack,
        'GlobalExceptionFilter',
      );
      expect(response.json).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'Internal server error' }),
      );
    }
  },
);

it('shows Argentina time and previous date in pretty output while JSON stays UTC', () => {
  vi.useFakeTimers();
  try {
    vi.setSystemTime(new Date('2026-09-25T02:06:08.913Z'));
    vi.stubEnv('LOG_FORMAT', 'pretty');
    vi.stubEnv('LOG_TIMEZONE', 'America/Argentina/Buenos_Aires');
    const output = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
    const logger = new StructuredLoggerService();
    logger.log('test');
    expect(String(output.mock.calls[0][0])).toContain(
      '2026-09-24 23:06:08,913 GMT-3',
    );
    vi.stubEnv('LOG_FORMAT', 'json');
    logger.log('test');
    expect(JSON.parse(String(output.mock.calls[1][0])).timestamp).toBe(
      '2026-09-25T02:06:08.913Z',
    );
  } finally {
    vi.useRealTimers();
  }
});
