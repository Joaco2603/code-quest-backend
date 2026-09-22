import type { DataSourceOptions } from 'typeorm';
import { readEnvironment } from './envs.js';
import { catalogEntities } from '../catalog/entities.js';
import { CreateCatalog1789600000000 } from '../database/migrations/1789600000000-CreateCatalog.js';
import { User } from '../user/entities/user.entity.js';
import { AuditLog } from '../common/entities/audit-log.entity.js';
import { AnswerOption } from '../questions/questionnaires/entities/answer-option.entity.js';
import { Question } from '../questions/questionnaires/entities/question.entity.js';
import { Questionnaire } from '../questions/questionnaires/entities/questionnaire.entity.js';
import { Assessment } from '../questions/assessments/entities/assessment.entity.js';
import { UserAnswer } from '../questions/assessments/entities/user-answer.entity.js';
import { CreateUsersAndAuditLogs1760000000000 } from '../database/migrations/1760000000000-CreateUsersAndAuditLogs.js';
import { CreateQuestions1789600001000 } from '../database/migrations/1789600001000-CreateQuestions.js';
import { CreateAssessments1789600002000 } from '../database/migrations/1789600002000-CreateAssessments.js';
import { RenameUserResponsesToUserAnswers1789600003000 } from '../database/migrations/1789600003000-RenameUserResponsesToUserAnswers.js';

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
      Assessment,
      UserAnswer,
    ],
    migrations: [
      CreateUsersAndAuditLogs1760000000000,
      CreateCatalog1789600000000,
      CreateQuestions1789600001000,
      CreateAssessments1789600002000,
      RenameUserResponsesToUserAnswers1789600003000,
    ],
  };
}
