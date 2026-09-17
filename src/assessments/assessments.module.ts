import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module.js';
import { AssessmentsController } from './assessments.controller.js';
import { AssessmentsService } from './assessments.service.js';
import { Assessment } from './entities/assessment.entity.js';
import { UserResponse } from './entities/user-response.entity.js';
import { QUESTIONS_READER } from './questions-reader.js';
import { TypeormQuestionsReader } from './typeorm-questions-reader.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([Assessment, UserResponse]),
    AuthModule,
  ],
  controllers: [AssessmentsController],
  providers: [
    AssessmentsService,
    TypeormQuestionsReader,
    { provide: QUESTIONS_READER, useExisting: TypeormQuestionsReader },
  ],
  exports: [AssessmentsService, TypeOrmModule],
})
export class AssessmentsModule {}
