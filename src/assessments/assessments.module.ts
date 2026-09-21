import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import {
  AssessmentsController,
  EvaluationController,
} from './assessments.controller.js';
import { AssessmentsService } from './assessments.service.js';
import { CatalogAdminGuard } from '../catalog/catalog-access.js';

@Module({
  imports: [PassportModule.register({ defaultStrategy: 'jwt' })],
  controllers: [AssessmentsController, EvaluationController],
  providers: [AssessmentsService, CatalogAdminGuard],
  exports: [AssessmentsService],
})
export class AssessmentsModule {}
