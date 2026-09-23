import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CatalogModule } from './catalog/catalog.module.js';
import { databaseOptions } from './config/database.js';
import configuration from './config/envs.js';
// import { createObserveModule } from '@nestjs/observe';
import { AuthModule } from './auth/auth.module.js';
import { UserModule } from './user/user.module.js';
import { CommonModule } from './common/common.module.js';
import { QuestionsModule } from './questions/questions.module.js';
import { RoadmapsModule } from './roadmaps/roadmaps.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [configuration] }),
    TypeOrmModule.forRootAsync({ useFactory: () => databaseOptions() }),
    // ObserveModule.forRoot({
    //   appKey: process.env.OBSERVE_APP_KEY,
    //   appSecret: process.env.OBSERVE_APP_SECRET,
    //   serviceId: 'code-quest',
    // }),
    CommonModule,
    UserModule,
    AuthModule,
    QuestionsModule,
    CatalogModule,
    RoadmapsModule,
  ],
})
export class AppModule {}
