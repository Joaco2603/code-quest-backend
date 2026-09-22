import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import type { Relation } from 'typeorm';
import type { Assessment } from './assessment.entity.js';

@Entity({ name: 'user_responses' })
export class UserResponse {
  @PrimaryGeneratedColumn()
  id: number;

  @Index()
  @Column({ name: 'assessment_id', type: 'int' })
  assessmentId: number;

  @ManyToOne('Assessment', 'responses', {
    onDelete: 'CASCADE',
    nullable: false,
  })
  @JoinColumn({ name: 'assessment_id' })
  assessment: Relation<Assessment>;

  @Index()
  @Column({ name: 'question_id', type: 'int' })
  questionId: number;

  @Column({ name: 'answer_option_id', type: 'int', nullable: true })
  answerOptionId: number | null;

  @Column({ type: 'varchar', nullable: true })
  value: string | null;
}
