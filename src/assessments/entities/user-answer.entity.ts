import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import type { Relation } from 'typeorm';
import type { AnswerValue } from '../interfaces/index.js';
import { Assessment } from './assessment.entity.js';

@Entity('self_assessment_answers')
@Index('UQ_user_answers_question', ['assessmentId', 'questionId'], {
  unique: true,
})
export class UserAnswer {
  @PrimaryGeneratedColumn() id: number;
  @Column({ name: 'assessment_id', type: 'int' }) assessmentId: number;
  @ManyToOne(() => Assessment, (assessment) => assessment.answers, {
    onDelete: 'CASCADE',
    nullable: false,
  })
  @JoinColumn({ name: 'assessment_id' })
  assessment: Relation<Assessment>;
  // Historical ID is resolved against the snapshot, not mutable live questions.
  @Column({ name: 'question_id', type: 'int' }) questionId: number;
  @Column('jsonb') value: AnswerValue;
}
