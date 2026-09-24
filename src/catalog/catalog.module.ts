import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PassportModule } from '@nestjs/passport';
import { CatalogService } from './catalog.service.js';
import { catalogEntities } from './entities/catalog.entities.js';
import { CatalogAdminGuard } from './guards/catalog-admin.guard.js';
import {
  AdminCoursesController,
  CategoriesController,
  CoursesController,
  LevelsController,
  TechnologiesController,
} from './catalog.controller.js';

@Module({
  imports: [TypeOrmModule.forFeature(catalogEntities), PassportModule.register({ defaultStrategy: 'jwt' })],
  controllers: [
    CoursesController,
    AdminCoursesController,
    CategoriesController,
    TechnologiesController,
    LevelsController,
  ],
  providers: [CatalogService, CatalogAdminGuard],
  exports: [CatalogService, TypeOrmModule],
})
export class CatalogModule {}
