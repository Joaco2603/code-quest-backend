export function parseAllowedOrigins(
  raw: string | undefined,
  env = process.env.NODE_ENV ?? 'development',
): string[] {
  const origins =
    raw
      ?.split(',')
      .map((value) => value.trim())
      .filter(Boolean) ??
    (env === 'production'
      ? []
      : ['http://localhost:8080', 'http://localhost:3000']);
  if (origins.includes('*'))
    throw new Error('ALLOWED_ORIGINS must list explicit origins');
  return origins;
}
export function readEnvironment(env: NodeJS.ProcessEnv = process.env) {
  const production = env.NODE_ENV === 'production';
  const number = (key: string, fallback: number, max: number) => {
    const value = Number(env[key] ?? fallback);
    if (!Number.isInteger(value) || value < 1 || value > max)
      throw new Error(`${key} must be an integer between 1 and ${max}`);
    return value;
  };
  const required = (key: string, fallback: string) => {
    const value = env[key];
    if (production && !value?.trim())
      throw new Error(`${key} is required in production`);
    return value ?? fallback;
  };
  const boolean = (key: string, fallback = false) => {
    if (env[key] === undefined) return fallback;
    if (!['true', 'false'].includes(env[key]!))
      throw new Error(`${key} must be true or false`);
    return env[key] === 'true';
  };
  if (boolean('DB_SYNCHRONIZE'))
    throw new Error('DB_SYNCHRONIZE is disabled; use migrations');
  return {
    app: {
      port: number('PORT', 3000, 65535),
      nodeEnv: env.NODE_ENV ?? 'development',
      allowedOrigins: parseAllowedOrigins(env.ALLOWED_ORIGINS, env.NODE_ENV),
    },
    database: {
      host: required('DB_HOST', 'localhost'),
      port: number('DB_PORT', 5432, 65535),
      name: required('DB_NAME', 'code_quest'),
      username: required('DB_USERNAME', 'postgres'),
      password: required('DB_PASSWORD', 'postgres'),
      ssl: boolean('DB_SSL', production),
      migrationsRun: boolean('DB_MIGRATIONS_RUN'),
      logging: boolean('DB_LOGGING'),
    },
  };
}
const getEnv = (
  key: string,
  fallback?: string,
  options?: { requiredInProd?: boolean },
): string | undefined => {
  const val = process.env[key] ?? fallback;
  if (
    options?.requiredInProd &&
    process.env.NODE_ENV === 'production' &&
    (val === undefined || val === '')
  ) {
    throw new Error(`${key} is required in production`);
  }
  return val;
};

const readAuthEnvironment = () => {
  const nodeEnv = process.env.NODE_ENV ?? 'development';

  // const databaseUrl = `postgresql://${dbUsername}:${dbPassword}@${dbHost}:${dbPort}/${dbName}`;
  const portRaw = getEnv('PORT', '3000', { requiredInProd: true })!;
  const dbPortRaw = getEnv('DB_PORT', '5432', { requiredInProd: true })!;
  const dbHost = getEnv('DB_HOST', 'localhost', { requiredInProd: true })!;
  const dbName = getEnv('DB_NAME', 'code_quest', { requiredInProd: true })!;
  const dbUsername = getEnv('DB_USERNAME', 'postgres', {
    requiredInProd: true,
  })!;
  const dbPassword = getEnv('DB_PASSWORD', 'postgres', {
    requiredInProd: true,
  })!;

  // Validate numeric envs
  const port = Number(portRaw);
  const dbPort = Number(dbPortRaw);
  const rateLimitTtlMs = Number(getEnv('RATE_LIMIT_TTL_MS', '60000')!);
  const rateLimitMax = Number(getEnv('RATE_LIMIT_MAX', '120')!);
  const auditBufferSize = Number(getEnv('AUDIT_BUFFER_SIZE', '50')!);
  const auditFlushIntervalMs = Number(
    getEnv('AUDIT_FLUSH_INTERVAL_MS', '2000')!,
  );
  const mfaBypassForTests =
    nodeEnv === 'test' && getEnv('MFA_BYPASS_FOR_TESTS', 'false') === 'true';
  const discordEnabledRaw = getEnv('DISCORD_ENABLED', 'true');
  if (!['true', 'false'].includes(discordEnabledRaw!)) {
    throw new Error('DISCORD_ENABLED must be true or false');
  }
  const discordEnabled = discordEnabledRaw === 'true';
  const discordClientId = getEnv('DISCORD_CLIENT_ID', undefined, {
    requiredInProd: discordEnabled,
  });
  const discordClientSecret = getEnv('DISCORD_CLIENT_SECRET', undefined, {
    requiredInProd: discordEnabled,
  });
  const discordCallbackUrl = getEnv(
    'DISCORD_CALLBACK_URL',
    nodeEnv === 'production'
      ? undefined
      : `http://localhost:${portRaw}/api/auth/discord/callback`,
    { requiredInProd: discordEnabled },
  );
  const frontendUrl = getEnv(
    'FRONTEND_URL',
    nodeEnv === 'production' ? undefined : 'http://localhost:8080',
  );
  const discordFrontendRedirectPath = getEnv(
    'DISCORD_FRONTEND_REDIRECT_PATH',
    '/auth/discord',
  );
  if (Number.isNaN(port)) {
    throw new Error('PORT must be a valid number');
  }

  if (Number.isNaN(dbPort)) {
    throw new Error('DB_PORT must be a valid number');
  }

  if (Number.isNaN(rateLimitTtlMs) || rateLimitTtlMs <= 0) {
    throw new Error('RATE_LIMIT_TTL_MS must be a valid positive number');
  }

  if (Number.isNaN(rateLimitMax) || rateLimitMax <= 0) {
    throw new Error('RATE_LIMIT_MAX must be a valid positive number');
  }

  if (Number.isNaN(auditBufferSize) || auditBufferSize <= 0) {
    throw new Error('AUDIT_BUFFER_SIZE must be a valid positive number');
  }

  if (Number.isNaN(auditFlushIntervalMs) || auditFlushIntervalMs <= 0) {
    throw new Error('AUDIT_FLUSH_INTERVAL_MS must be a valid positive number');
  }

  if (!dbPassword && nodeEnv === 'production') {
    throw new Error('DB_PASSWORD is required in production');
  }

  const encodedUser = encodeURIComponent(dbUsername);
  const encodedPassword = encodeURIComponent(dbPassword);
  const databaseUrl = `postgresql://${encodedUser}:${encodedPassword}@${dbHost}:${dbPort}/${dbName}`;

  const jwtSecret = getEnv('JWT_SECRET');
  if (!jwtSecret) {
    throw new Error('JWT_SECRET is required');
  }
  if (jwtSecret.length < 32) {
    throw new Error('JWT_SECRET must be at least 32 characters');
  }
  if (/change-me/i.test(jwtSecret.trim())) {
    throw new Error('JWT_SECRET must not use the placeholder value change-me');
  }

  const encryptionKey = getEnv('ENCRYPTION_KEY', undefined, {
    requiredInProd: true,
  });
  const encryptionIv = getEnv('ENCRYPTION_IV');

  return {
    app: {
      port,
      allowedOrigins: parseAllowedOrigins(process.env.ALLOWED_ORIGINS),
      nodeEnv,
      rateLimit: {
        ttlMs: rateLimitTtlMs,
        limit: rateLimitMax,
      },
      audit: {
        bufferSize: auditBufferSize,
        flushIntervalMs: auditFlushIntervalMs,
      },
      auth: {
        mfaBypassForTests,
        jwtSecret,
        discord: {
          enabled: discordEnabled,
          clientId: discordClientId,
          clientSecret: discordClientSecret,
          callbackUrl: discordCallbackUrl,
          frontendUrl,
          frontendRedirectPath: discordFrontendRedirectPath,
        },
      },
    },
    database: {
      host: dbHost,
      port: dbPort,
      name: dbName,
      username: dbUsername,
      password: dbPassword,
      url: databaseUrl,
    },
    ENCRYPTION_KEY: encryptionKey,
    ENCRYPTION_IV: encryptionIv,
    JWT_SECRET: jwtSecret,
  } as const;
};
export default function configuration() {
  const base = readEnvironment();
  const auth = readAuthEnvironment();
  return { ...auth, ...base, app: { ...auth.app, ...base.app } };
}
