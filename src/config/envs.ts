export const parseAllowedOrigins = (
    raw: string | undefined,
    nodeEnv = process.env.NODE_ENV ?? 'development',
  ): string[] => {
    if (!raw) {
      return nodeEnv === 'production'
        ? []
        : ['http://localhost:8080', 'http://localhost:3000'];
    }
  
    // if (raw.trim() === '*') {
    //   return nodeEnv === 'production' ? [] : ['*'];
    // }
    if (raw.trim() === '*') {
      return ['*'];
    }
  
    return raw
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean);
  };
  
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
  
  export default () => {
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
    const mfaBypassForTests = getEnv('MFA_BYPASS_FOR_TESTS', 'false') === 'true';
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
  
    // Encryption configuration
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
    } as const;
  };