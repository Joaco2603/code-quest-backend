import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import type { Relation } from 'typeorm';
import { User } from '../../user/entities/user.entity.js';
import { Questionnaire } from '../../questions/questionnaires/entities/questionnaire.entity.js';
import type { EvaluationSnapshot, ProfileResult } from '../interfaces/index.js';
import { UserAnswer } from './user-answer.entity.js';

@Entity('self_assessments')
@Index('IDX_self_assessments_user_id', ['userId', 'id'])
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
  @OneToMany(() => UserAnswer, (answer) => answer.assessment)
  answers: UserAnswer[];
}
