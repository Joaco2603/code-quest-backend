import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PassportModule } from '@nestjs/passport';
import { AnswerOption } from './entities/answer-option.entity.js';
import { Assessment } from './entities/assessment.entity.js';
import { Question } from './entities/question.entity.js';
import { Questionnaire } from './entities/questionnaire.entity.js';
import { UserResponse } from './entities/user-response.entity.js';
import { AnswerOptionsController } from './controllers/answer-options.controller.js';
import { AssessmentsController } from './controllers/assessments.controller.js';
import { QuestionnairesController } from './controllers/questionnaires.controller.js';
import { QuestionsController } from './controllers/questions.controller.js';
import { AssessmentsService } from './assessments.service.js';
import { QuestionsService } from './questions.service.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Questionnaire,
      Question,
      AnswerOption,
      Assessment,
      UserResponse,
    ]),
    PassportModule.register({ defaultStrategy: 'jwt' }),
  ],
  controllers: [
    QuestionnairesController,
    QuestionsController,
    AnswerOptionsController,
    AssessmentsController,
  ],
  providers: [QuestionsService, AssessmentsService],
  exports: [QuestionsService, AssessmentsService, TypeOrmModule],
})
export class QuestionsModule {}
