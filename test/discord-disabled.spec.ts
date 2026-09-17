import 'reflect-metadata';
import { ConfigService } from '@nestjs/config';
import { ServiceUnavailableException } from '@nestjs/common';
import configuration from '../dist/config/envs.js';
import { DiscordAdapter } from '../dist/auth/adapters/discord.adapter.js';

afterEach(() => vi.unstubAllEnvs());

function productionEnvironment() {
  for (const [key, value] of Object.entries({
    NODE_ENV: 'production',
    PORT: '3000',
    DB_HOST: 'postgres',
    DB_PORT: '5432',
    DB_NAME: 'test',
    DB_USERNAME: 'test',
    DB_PASSWORD: 'test',
    JWT_SECRET: 'test-only-secret-with-at-least-32-characters',
    ENCRYPTION_KEY: 'a'.repeat(64),
  }))
    vi.stubEnv(key, value);
  for (const key of [
    'DISCORD_CLIENT_ID',
    'DISCORD_CLIENT_SECRET',
    'DISCORD_CALLBACK_URL',
  ]) {
    vi.stubEnv(key, undefined);
  }
}

it('starts production configuration without Discord credentials when explicitly disabled', () => {
  productionEnvironment();
  vi.stubEnv('DISCORD_ENABLED', 'false');
  expect(configuration().app.auth.discord.enabled).toBe(false);
});

it('still requires Discord credentials by default in production', () => {
  productionEnvironment();
  vi.stubEnv('DISCORD_ENABLED', undefined);
  expect(() => configuration()).toThrow('DISCORD_CLIENT_ID');
});

it('rejects Discord authorization when disabled even if credentials remain configured', () => {
  const adapter = new DiscordAdapter(
    new ConfigService({
      app: {
        auth: {
          discord: {
            enabled: false,
            clientId: 'test',
            clientSecret: 'test',
            callbackUrl: 'https://example.test/callback',
          },
        },
      },
    }),
  );
  expect(() => adapter.buildAuthorizeUrl('state', 'challenge')).toThrow(
    ServiceUnavailableException,
  );
});
