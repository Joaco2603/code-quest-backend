import { Column, Entity, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import type { Relation } from 'typeorm';
import { Questionnaire } from '../../questions/entities/questionnaire.entity.js';
import type { EvaluationDefinition } from '../interfaces/index.js';

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
