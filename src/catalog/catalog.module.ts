import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { CatalogService } from './catalog.service.js';
import { CatalogAdminGuard } from './catalog-access.js';
import {
  AdminCoursesController,
  CategoriesController,
  CoursesController,
  LevelsController,
  TechnologiesController,
} from './catalog.controller.js';

@Module({
  imports: [PassportModule.register({ defaultStrategy: 'jwt' })],
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
