import type { DataSourceOptions } from 'typeorm';
import { readEnvironment } from './envs.js';
import { catalogEntities } from '../catalog/entities.js';
import { CreateCatalog1789600000000 } from '../database/migrations/1789600000000-CreateCatalog.js';

export function databaseOptions(
  env: NodeJS.ProcessEnv = process.env,
): DataSourceOptions {
  const { database } = readEnvironment(env);
  return {
    type: 'postgres',
    host: database.host,
    port: database.port,
    username: database.username,
    password: database.password,
    database: database.name,
    ssl: database.ssl ? { rejectUnauthorized: true } : false,
    synchronize: false,
    migrationsRun: database.migrationsRun,
    logging: database.logging,
    entities: catalogEntities,
    migrations: [CreateCatalog1789600000000],
  };
}
