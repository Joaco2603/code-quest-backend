import { DataSource } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { config } from 'dotenv';
import * as path from 'path';

config();

const configService = new ConfigService();
const isProd = configService.get('NODE_ENV') === 'production';
const synchronize = configService.get('DB_SYNCHRONIZE')
  ? configService.get('DB_SYNCHRONIZE') === 'true'
  : !isProd;
const migrationsRun = configService.get('DB_MIGRATIONS_RUN') === 'true';
const logging = configService.get('DB_LOGGING')
  ? configService.get('DB_LOGGING') === 'true'
  : !isProd;

const AppDataSource = new DataSource({
  type: 'postgres',
  host: configService.get('DB_HOST'),
  port: parseInt(configService.get('DB_PORT') ?? '5432', 10),
  username: configService.get('DB_USERNAME'),
  password: configService.get('DB_PASSWORD'),
  database: configService.get('DB_NAME'),
  synchronize,
  migrationsRun,
  logging,

  entities: isProd
    ? [path.join(__dirname, '..', '**', '*.entity.js')]
    : ['src/**/*.entity.ts'],

  migrations: isProd
    ? [path.join(__dirname, '..', 'database', 'migrations', '*.js')]
    : ['src/database/migrations/*.ts'],

  ssl: isProd ? { rejectUnauthorized: false } : false,
});

export default AppDataSource;