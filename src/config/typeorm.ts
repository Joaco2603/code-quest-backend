import { DataSource } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { config } from 'dotenv';
import * as path from 'path';
import { fileURLToPath } from 'node:url';

config();

const dirname = path.dirname(fileURLToPath(import.meta.url));
const configService = new ConfigService();
const isProd = configService.get('NODE_ENV') === 'production';
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
  synchronize: false,
  migrationsRun: false,
  logging,

  entities: [path.join(dirname, '..', '**', '*.entity.js')],
  migrations: [path.join(dirname, '..', 'database', 'migrations', '*.js')],

  ssl: isProd ? { rejectUnauthorized: false } : false,
});

export default AppDataSource;
