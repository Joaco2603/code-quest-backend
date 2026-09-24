import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PassportModule } from '@nestjs/passport';
import { AnswerOption } from './questionnaires/entities/answer-option.entity.js';
import { Question } from './questionnaires/entities/question.entity.js';
import { Questionnaire } from './questionnaires/entities/questionnaire.entity.js';
import { AnswerOptionsController } from './questionnaires/controllers/answer-options.controller.js';
import { QuestionnairesController } from './questionnaires/controllers/questionnaires.controller.js';
import { QuestionsController } from './questionnaires/controllers/questions.controller.js';
import { QuestionsService } from './questionnaires/questions.service.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([Questionnaire, Question, AnswerOption]),
    PassportModule.register({ defaultStrategy: 'jwt' }),
  ],
  controllers: [
    QuestionnairesController,
    QuestionsController,
    AnswerOptionsController,
  ],
  providers: [QuestionsService],
  exports: [QuestionsService, TypeOrmModule],
})
export class QuestionsModule {}
