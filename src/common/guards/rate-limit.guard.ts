import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import {
  RATE_LIMIT_METADATA,
  RateLimitMetadata,
  SKIP_RATE_LIMIT_METADATA,
} from '../decorators/rate-limit.decorator.js';

type RateLimitEntry = {
  count: number;
  resetAt: number;
};

@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly storage = new Map<string, RateLimitEntry>();

  constructor(
    private readonly reflector: Reflector,
    private readonly configService: ConfigService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    if (context.getType<'http' | 'ws' | 'rpc'>() !== 'http') {
      return true;
    }

    const skip = this.reflector.getAllAndOverride<boolean>(
      SKIP_RATE_LIMIT_METADATA,
      [context.getHandler(), context.getClass()],
    );
    if (skip) {
      return true;
    }

    const http = context.switchToHttp();
    const request = http.getRequest<{
      ip?: string;
      method?: string;
      route?: {
        path?: string;
      };
      path?: string;
    }>();
    const response = http.getResponse<{
      setHeader: (name: string, value: string) => void;
    }>();

    if (request.method === 'OPTIONS' || request.path === '/api/health') {
      return true;
    }

    const defaults =
      this.configService.get<RateLimitMetadata>('app.rateLimit') ??
      ({
        limit: 120,
        ttlMs: 60000,
      } as RateLimitMetadata);
    const metadata =
      this.reflector.getAllAndOverride<RateLimitMetadata>(RATE_LIMIT_METADATA, [
        context.getHandler(),
        context.getClass(),
      ]) ?? defaults;

    const now = Date.now();
    const key = [
      request.ip ?? 'unknown',
      request.method ?? 'UNKNOWN',
      request.route?.path ?? request.path ?? 'unknown',
    ].join(':');

    const current = this.storage.get(key);
    if (!current || current.resetAt <= now) {
      this.storage.set(key, {
        count: 1,
        resetAt: now + metadata.ttlMs,
      });
      this.applyHeaders(
        response,
        metadata.limit,
        metadata.limit - 1,
        now + metadata.ttlMs,
      );
      this.pruneExpired(now);
      return true;
    }

    if (current.count >= metadata.limit) {
      this.applyHeaders(response, metadata.limit, 0, current.resetAt);
      throw new HttpException(
        'Rate limit exceeded',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    current.count += 1;
    this.storage.set(key, current);
    this.applyHeaders(
      response,
      metadata.limit,
      Math.max(0, metadata.limit - current.count),
      current.resetAt,
    );
    this.pruneExpired(now);
    return true;
  }

  private applyHeaders(
    response: { setHeader: (name: string, value: string) => void },
    limit: number,
    remaining: number,
    resetAt: number,
  ) {
    response.setHeader('X-RateLimit-Limit', String(limit));
    response.setHeader('X-RateLimit-Remaining', String(remaining));
    response.setHeader('X-RateLimit-Reset', new Date(resetAt).toISOString());
  }

  private pruneExpired(now: number) {
    if (this.storage.size < 500) {
      return;
    }

    for (const [key, value] of this.storage.entries()) {
      if (value.resetAt <= now) {
        this.storage.delete(key);
      }
    }
  }
}
