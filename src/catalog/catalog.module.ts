import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CatalogService } from './catalog.service.js';
import { CatalogAdminGuard } from './catalog-access.js';
import {
  AdminCoursesController,
  CategoriesController,
  CoursesController,
  LevelsController,
  TechnologiesController,
} from './catalog.controller.js';
import { Category, Course, Technology } from './entities.js';

@Module({
  imports: [TypeOrmModule.forFeature([Course, Category, Technology])],
  controllers: [
    CoursesController,
    AdminCoursesController,
    CategoriesController,
    TechnologiesController,
    LevelsController,
  ],
  providers: [CatalogService, CatalogAdminGuard],
  exports: [CatalogService],
})
export class CatalogModule {}
