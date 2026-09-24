import type { QuestionRulesDto } from '../dtos/question-rules.dto.js';
import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { QuestionType } from '../enums/question-type.enum.js';
import { Questionnaire } from './questionnaire.entity.js';
import { AnswerOption } from './answer-option.entity.js';
import type { Relation } from 'typeorm';

@Entity({ name: 'questions' })
@Index('IDX_questions_questionnaire_sort', ['questionnaire', 'sortOrder'])
@Index('IDX_questions_questionnaire_active', ['questionnaire', 'isActive'])
export class Question {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Questionnaire, (questionnaire) => questionnaire.questions, {
    onDelete: 'CASCADE',
    nullable: false,
  })
  @JoinColumn({ name: 'questionnaire_id' })
  questionnaire: Relation<Questionnaire>;

  @Column('text')
  question: string;

  @Column({ type: 'enum', enum: QuestionType, enumName: 'question_type' })
  type: QuestionType;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @Column({ name: 'sort_order', type: 'int' })
  sortOrder: number;

  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  rules: QuestionRulesDto;

  @OneToMany(() => AnswerOption, (option) => option.question)
  options: AnswerOption[];
}
