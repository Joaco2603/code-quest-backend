import { ConfigService } from '@nestjs/config';
import { ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { DiscordAdapter } from '../adapters/discord.adapter.js';
import { namesFromDiscordProfile } from '../interfaces/discord-profile.type.js';
import { vi } from 'vitest';

describe('DiscordAdapter', () => {
  const configService = {
    get: vi.fn((key: string) => {
      const values: Record<string, string> = {
        'app.auth.discord.clientId': 'client-id',
        'app.auth.discord.clientSecret': 'client-secret',
        'app.auth.discord.callbackUrl':
          'http://localhost:3000/api/auth/discord/callback',
      };
      return values[key];
    }),
  };

  const adapter = new DiscordAdapter(
    configService as unknown as ConfigService,
  );

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('builds the Discord authorize URL with PKCE', () => {
    const url = new URL(
      adapter.buildAuthorizeUrl('oauth-state', 'pkce-challenge'),
    );

    expect(url.origin + url.pathname).toBe(
      'https://discord.com/oauth2/authorize',
    );
    expect(url.searchParams.get('client_id')).toBe('client-id');
    expect(url.searchParams.get('redirect_uri')).toBe(
      'http://localhost:3000/api/auth/discord/callback',
    );
    expect(url.searchParams.get('scope')).toBe('identify email');
    expect(url.searchParams.get('state')).toBe('oauth-state');
    expect(url.searchParams.get('code_challenge')).toBe('pkce-challenge');
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
  });

  it('exchanges a code and returns the Discord profile', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ access_token: 'discord-access' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 'discord-123',
          username: 'student',
          global_name: 'Student Dev',
          email: 'student@example.com',
          avatar: 'avatar-hash',
        }),
      });
    vi.stubGlobal('fetch', fetchMock);

    const profile = await adapter.authenticate('auth-code', 'pkce-verifier');

    expect(profile).toEqual({
      id: 'discord-123',
      username: 'student',
      global_name: 'Student Dev',
      email: 'student@example.com',
      avatar: 'avatar-hash',
      verified: undefined,
    });
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'https://discord.com/api/v10/oauth2/token',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('throws when Discord rejects the authorization code', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        json: async () => ({ error: 'invalid_grant' }),
      }),
    );

    await expect(adapter.authenticate('bad-code', 'pkce-verifier')).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('throws when Discord credentials are missing', () => {
    const emptyConfig = {
      get: vi.fn().mockReturnValue(undefined),
    };
    const unconfigured = new DiscordAdapter(
      emptyConfig as unknown as ConfigService,
    );

    expect(() => unconfigured.buildAuthorizeUrl('state', 'challenge')).toThrow(
      ServiceUnavailableException,
    );
  });
});

describe('namesFromDiscordProfile', () => {
  it('splits a global name into first and last name', () => {
    expect(
      namesFromDiscordProfile({
        username: 'handle',
        global_name: 'Ada Lovelace',
      }),
    ).toEqual({ first_name: 'ada', last_name: 'lovelace' });
  });

  it('falls back to the Discord username', () => {
    expect(
      namesFromDiscordProfile({
        username: 'restoker12',
        global_name: null,
      }),
    ).toEqual({ first_name: 'restoker12', last_name: null });
  });
});
