import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PassportModule } from '@nestjs/passport';
import { AnswerOption } from './entities/answer-option.entity.js';
import { Question } from './entities/question.entity.js';
import { Questionnaire } from './entities/questionnaire.entity.js';
import { AnswerOptionsController } from './controllers/answer-options.controller.js';
import { QuestionnairesController } from './controllers/questionnaires.controller.js';
import { QuestionsController } from './controllers/questions.controller.js';
import { QuestionsService } from './questions.service.js';

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
