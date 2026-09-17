import { SetMetadata } from '@nestjs/common';

export const RATE_LIMIT_METADATA = 'rate_limit_metadata';
export const SKIP_RATE_LIMIT_METADATA = 'skip_rate_limit_metadata';

export type RateLimitMetadata = {
  limit: number;
  ttlMs: number;
};

export const RateLimit = (limit: number, ttlMs: number) =>
  SetMetadata(RATE_LIMIT_METADATA, { limit, ttlMs });

export const SkipRateLimit = () => SetMetadata(SKIP_RATE_LIMIT_METADATA, true);
