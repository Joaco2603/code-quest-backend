import { CreateRoadmaps1789948803000 } from '../database/migrations/1789948803000-CreateRoadmaps.js';
import { AdaptiveQuestionnaire1789600005000 } from '../database/migrations/1789600005000-AdaptiveQuestionnaire.js';
import type { DataSourceOptions } from 'typeorm';
import { readEnvironment } from './envs.js';
import { catalogEntities } from '../catalog/entities/catalog.entities.js';
import { CreateContentImports1789948801000 } from '../database/migrations/1789948801000-CreateContentImports.js';
import { RenameUserResponsesToUserAnswers1789948802000 } from '../database/migrations/1789948802000-RenameUserResponsesToUserAnswers.js';
import { assessmentEntities } from '../assessments/entities/index.js';
import { CreateAssessments1789948800000 } from '../database/migrations/1789948800000-CreateAssessments.js';
import { CreateCatalog1789600000000 } from '../database/migrations/1789600000000-CreateCatalog.js';
import { User } from '../user/entities/user.entity.js';
import { AuditLog } from '../common/entities/audit-log.entity.js';
import { AnswerOption } from '../questions/questionnaires/entities/answer-option.entity.js';
import { Question } from '../questions/questionnaires/entities/question.entity.js';
import { Questionnaire } from '../questions/questionnaires/entities/questionnaire.entity.js';
import { CreateUsersAndAuditLogs1760000000000 } from '../database/migrations/1760000000000-CreateUsersAndAuditLogs.js';
import { CreateQuestions1789600001000 } from '../database/migrations/1789600001000-CreateQuestions.js';
import { CreateAssessments1789600002000 } from '../database/migrations/1789600002000-CreateAssessments.js';
import { RenameUserResponsesToUserAnswers1789600003000 } from '../database/migrations/1789600003000-RenameUserResponsesToUserAnswers.js';
import { RoadmapCourse } from '../roadmaps/entities/roadmap-course.entity.js';
import { Roadmap } from '../roadmaps/entities/roadmap.entity.js';
import { CreateRoadmaps1789600004000 } from '../database/migrations/1789600004000-CreateRoadmaps.js';

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
      ...assessmentEntities,
      User,
      AuditLog,
      AnswerOption,
      Question,
      Questionnaire,
      Roadmap,
      RoadmapCourse,
    ],
    migrations: [
      CreateUsersAndAuditLogs1760000000000,
      CreateCatalog1789600000000,
      CreateQuestions1789600001000,
      CreateAssessments1789600002000,
      RenameUserResponsesToUserAnswers1789600003000,
      CreateRoadmaps1789600004000,
      AdaptiveQuestionnaire1789600005000,
      CreateAssessments1789948800000,
      CreateContentImports1789948801000,
      RenameUserResponsesToUserAnswers1789948802000,
      CreateRoadmaps1789948803000,
    ],
  };
}
