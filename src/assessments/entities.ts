import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryColumn,
  PrimaryGeneratedColumn,
} from 'typeorm';
import type { Relation } from 'typeorm';
import { User } from '../user/entities/user.entity.js';
import { Questionnaire } from '../questions/entities/questionnaire.entity.js';
import type {
  AnswerValue,
  EvaluationDefinition,
  EvaluationSnapshot,
  ProfileResult,
} from './contracts.js';

@Entity('evaluation_configs')
export class EvaluationConfig {
  @PrimaryColumn({ name: 'questionnaire_id', type: 'int' })
  questionnaireId: number;
  @ManyToOne(() => Questionnaire, { onDelete: 'RESTRICT', nullable: false })
  @JoinColumn({ name: 'questionnaire_id' })
  questionnaire: Relation<Questionnaire>;
  @Column('int') version: number;
  @Column('jsonb') definition: EvaluationDefinition;
}

@Entity('assessments')
@Index('IDX_assessments_user_id', ['userId', 'id'])
export class Assessment {
  @PrimaryGeneratedColumn() id: number;
  @Column({ name: 'user_id', type: 'uuid' }) userId: string;
  @ManyToOne(() => User, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'user_id' })
  user: Relation<User>;
  @Column({ name: 'questionnaire_id', type: 'int' }) questionnaireId: number;
  @ManyToOne(() => Questionnaire, { onDelete: 'RESTRICT', nullable: false })
  @JoinColumn({ name: 'questionnaire_id' })
  questionnaire: Relation<Questionnaire>;
  @Column({ name: 'completed_at', type: 'timestamptz' }) completedAt: Date;
  @Column('jsonb') snapshot: EvaluationSnapshot;
  @Column('jsonb') profile: ProfileResult;
  @OneToMany(() => UserResponse, (response) => response.assessment)
  responses: UserResponse[];
}

@Entity('user_responses')
@Index('UQ_user_responses_question', ['assessmentId', 'questionId'], {
  unique: true,
})
export class UserResponse {
  @PrimaryGeneratedColumn() id: number;
  @Column({ name: 'assessment_id', type: 'int' }) assessmentId: number;
  @ManyToOne(() => Assessment, (assessment) => assessment.responses, {
    onDelete: 'CASCADE',
    nullable: false,
  })
  @JoinColumn({ name: 'assessment_id' })
  assessment: Relation<Assessment>;
  // Historical ID is resolved against the snapshot, not mutable live questions.
  @Column({ name: 'question_id', type: 'int' }) questionId: number;
  @Column('jsonb') value: AnswerValue;
}

export const assessmentEntities = [EvaluationConfig, Assessment, UserResponse];
