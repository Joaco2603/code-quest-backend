import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { createObserveModule } from '@nestjs/observe';
import configuration from './config/envs.js';
import { AuthModule } from './auth/auth.module.js';
import { UserModule } from './user/user.module.js';
import { CommonModule } from './common/common.module.js';

const { ObserveModule, ObserveInstrument } = createObserveModule();
export { ObserveInstrument };

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
    }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const nodeEnv = configService.get<string>('app.nodeEnv');
        const isProd = nodeEnv === 'production';
        const synchronize = process.env.DB_SYNCHRONIZE
          ? process.env.DB_SYNCHRONIZE === 'true'
          : !isProd;
        const migrationsRun = process.env.DB_MIGRATIONS_RUN
          ? process.env.DB_MIGRATIONS_RUN === 'true'
          : !synchronize;

        return {
          type: 'postgres',
          url: configService.get<string>('database.url'),
          autoLoadEntities: true,
          synchronize,
          migrationsRun,
          migrations: ['dist/database/migrations/*.js'],
          logging: process.env.DB_LOGGING
            ? process.env.DB_LOGGING === 'true'
            : !isProd,
          ssl: isProd ? { rejectUnauthorized: false } : false,
        };
      },
    }),
    ObserveModule.forRoot({
      appKey: 'YOUR_APP_KEY',
      appSecret: 'YOUR_APP_SECRET',
      serviceId: 'code-quest',
    }),
    CommonModule,
    UserModule,
    AuthModule,
  ],
})
export class AppModule {}
