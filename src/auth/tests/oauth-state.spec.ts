import {
  createOAuthState,
  createPkceChallenge,
  createPkceVerifier,
  DISCORD_OAUTH_STATE_COOKIE,
  oauthStatesMatch,
  parseOAuthSession,
  readCookie,
  sanitizeDiscordError,
  serializeOAuthSession,
} from '../helpers/oauth-state.js';

describe('oauth-state helpers', () => {
  it('creates unique opaque states', () => {
    const first = createOAuthState();
    const second = createOAuthState();

    expect(first).toHaveLength(64);
    expect(second).toHaveLength(64);
    expect(first).not.toBe(second);
  });

  it('compares OAuth states in constant time', () => {
    expect(oauthStatesMatch('abc', 'abc')).toBe(true);
    expect(oauthStatesMatch('abc', 'abd')).toBe(false);
    expect(oauthStatesMatch(undefined, 'abc')).toBe(false);
  });

  it('reads the Discord state cookie', () => {
    expect(
      readCookie(
        `${DISCORD_OAUTH_STATE_COOKIE}=oauth-state; other=1`,
        DISCORD_OAUTH_STATE_COOKIE,
      ),
    ).toBe('oauth-state');
    expect(readCookie(undefined, DISCORD_OAUTH_STATE_COOKIE)).toBeUndefined();
  });

  it('signs and verifies the OAuth session cookie', () => {
    const session = {
      state: 'state',
      verifier: createPkceVerifier(),
      intent: 'login' as const,
    };
    const cookie = serializeOAuthSession(session, 'secret');

    expect(parseOAuthSession(cookie, 'secret')).toEqual(session);
    expect(parseOAuthSession(`${cookie}tampered`, 'secret')).toBeNull();
    expect(parseOAuthSession(cookie, 'other-secret')).toBeNull();
  });

  it('creates an S256 PKCE challenge', () => {
    const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
    expect(createPkceChallenge(verifier)).toBe(
      'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
    );
  });

  it('sanitizes unknown OAuth errors', () => {
    expect(sanitizeDiscordError('access_denied')).toBe('access_denied');
    expect(sanitizeDiscordError('SQL injection')).toBe('login_failed');
  });
});

