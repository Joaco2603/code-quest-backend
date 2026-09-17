import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';
import type { CookieOptions } from 'express';

export const DISCORD_OAUTH_STATE_COOKIE = 'discord_oauth_state';

export const DISCORD_OAUTH_ERROR_CODES = [
  'access_denied',
  'invalid_state',
  'unverified_email',
  'login_failed',
  'inactive',
  'link_failed',
] as const;

export type DiscordOAuthErrorCode = (typeof DISCORD_OAUTH_ERROR_CODES)[number];

export type DiscordOAuthIntent = 'login' | 'link';

export type DiscordOAuthSession = {
  state: string;
  verifier: string;
  intent: DiscordOAuthIntent;
  userId?: string;
};

export function createOAuthState(): string {
  return randomBytes(32).toString('hex');
}

export function createPkceVerifier(): string {
  return randomBytes(32).toString('base64url');
}

export function createPkceChallenge(verifier: string): string {
  return createHash('sha256').update(verifier).digest('base64url');
}

export function oauthStatesMatch(
  expected: string | undefined,
  received: string | undefined,
): boolean {
  if (!expected || !received) {
    return false;
  }

  const left = Buffer.from(expected);
  const right = Buffer.from(received);
  if (left.length !== right.length) {
    return false;
  }

  return timingSafeEqual(left, right);
}

export function serializeOAuthSession(
  session: DiscordOAuthSession,
  secret: string,
): string {
  const payload = Buffer.from(JSON.stringify(session), 'utf8').toString(
    'base64url',
  );
  const signature = createHmac('sha256', secret)
    .update(payload)
    .digest('base64url');
  return `${payload}.${signature}`;
}

export function parseOAuthSession(
  cookie: string | undefined,
  secret: string,
): DiscordOAuthSession | null {
  if (!cookie || !secret) {
    return null;
  }

  const separator = cookie.lastIndexOf('.');
  if (separator <= 0) {
    return null;
  }

  const payload = cookie.slice(0, separator);
  const signature = cookie.slice(separator + 1);
  const expected = createHmac('sha256', secret)
    .update(payload)
    .digest('base64url');

  if (!oauthStatesMatch(signature, expected)) {
    return null;
  }

  try {
    const session = JSON.parse(
      Buffer.from(payload, 'base64url').toString('utf8'),
    ) as DiscordOAuthSession;

    if (
      !session.state ||
      !session.verifier ||
      (session.intent !== 'login' && session.intent !== 'link')
    ) {
      return null;
    }

    if (session.intent === 'link' && !session.userId) {
      return null;
    }

    return session;
  } catch {
    return null;
  }
}

export function sanitizeDiscordError(
  error: string | undefined,
): DiscordOAuthErrorCode {
  if (
    error &&
    (DISCORD_OAUTH_ERROR_CODES as readonly string[]).includes(error)
  ) {
    return error as DiscordOAuthErrorCode;
  }

  return 'login_failed';
}

export function readCookie(
  cookieHeader: string | undefined,
  name: string,
): string | undefined {
  if (!cookieHeader) {
    return undefined;
  }

  for (const part of cookieHeader.split(';')) {
    const separator = part.indexOf('=');
    if (separator === -1) {
      continue;
    }

    const key = part.slice(0, separator).trim();
    if (key === name) {
      return decodeURIComponent(part.slice(separator + 1).trim());
    }
  }

  return undefined;
}

export function discordOAuthCookieOptions(
  isProduction: boolean,
): CookieOptions {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProduction,
    path: '/api/auth',
    maxAge: 10 * 60 * 1000,
  };
}
