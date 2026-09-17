import type { DataSourceOptions } from 'typeorm';
import { readEnvironment } from './envs.js';
import { catalogEntities } from '../catalog/entities.js';
import { CreateCatalog1789600000000 } from '../database/migrations/1789600000000-CreateCatalog.js';
import { User } from '../user/entities/user.entity.js';
import { AuditLog } from '../common/entities/audit-log.entity.js';
import { AnswerOption } from '../questions/entities/answer-option.entity.js';
import { Question } from '../questions/entities/question.entity.js';
import { Questionnaire } from '../questions/entities/questionnaire.entity.js';
import { CreateUsersAndAuditLogs1760000000000 } from '../database/migrations/1760000000000-CreateUsersAndAuditLogs.js';
import { CreateQuestions1789600001000 } from '../database/migrations/1789600001000-CreateQuestions.js';

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
    entities: [
      ...catalogEntities,
      User,
      AuditLog,
      AnswerOption,
      Question,
      Questionnaire,
    ],
    migrations: [
      CreateUsersAndAuditLogs1760000000000,
      CreateCatalog1789600000000,
      CreateQuestions1789600001000,
    ],
  };
}
