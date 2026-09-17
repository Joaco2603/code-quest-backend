import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CatalogModule } from './catalog/catalog.module.js';
import { databaseOptions } from './config/database.js';
import { readEnvironment } from './config/envs.js';
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [readEnvironment] }),
    TypeOrmModule.forRootAsync({ useFactory: () => databaseOptions() }),
    CatalogModule,
  ],
})
export class AppModule {}
