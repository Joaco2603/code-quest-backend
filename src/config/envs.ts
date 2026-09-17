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
export default readEnvironment;
