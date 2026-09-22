import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module.js';
import { QuestionsModule } from '../questions/questions.module.js';
import { AssessmentsController } from './assessments.controller.js';
import { AssessmentsService } from './assessments.service.js';
import { Assessment } from './entities/assessment.entity.js';
import { UserResponse } from './entities/user-response.entity.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([Assessment, UserResponse]),
    AuthModule,
    QuestionsModule,
  ],
  controllers: [AssessmentsController],
  providers: [AssessmentsService],
  exports: [AssessmentsService, TypeOrmModule],
})
export class AssessmentsModule {}
