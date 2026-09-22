import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Question } from './question.entity.js';
import type { Relation } from 'typeorm';

@Entity({ name: 'answer_options' })
@Index('IDX_answer_options_question', ['question'])
export class AnswerOption {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Question, (question) => question.options, {
    onDelete: 'CASCADE',
    nullable: false,
  })
  @JoinColumn({ name: 'question_id' })
  question: Relation<Question>;

  @Column('varchar')
  label: string;

  @Column('varchar', { nullable: true })
  value: string | null;

  @Column({ name: 'sort_order', type: 'int', default: 0 })
  sortOrder: number;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;
}
