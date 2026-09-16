import { User } from '../../user/entities/user.entity.js';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity({ name: 'audit_logs' })
@Index('IDX_audit_logs_created_at', ['created_at'])
@Index('IDX_audit_logs_request_id', ['request_id'])
@Index('IDX_audit_logs_user_id', ['user_id'])
@Index('IDX_audit_logs_method_path', ['method', 'path'])
export class AuditLog {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @Column('varchar', { length: 64, nullable: true })
  request_id: string | null;

  @Column('uuid', { nullable: true })
  user_id: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'user_id' })
  user?: User | null;

  @Column('varchar', { length: 64, nullable: true })
  user_role: string | null;

  @Column('varchar', { length: 16 })
  method: string;

  @Column('text')
  path: string;

  @Column('smallint')
  status_code: number;

  @Column('varchar', { length: 32 })
  outcome: string;

  @Column('varchar', { length: 64 })
  event_type: string;

  @Column('varchar', { length: 64, nullable: true })
  ip: string | null;

  @Column('text', { nullable: true })
  user_agent: string | null;

  @Column('integer', { nullable: true })
  duration_ms: number | null;

  @Column('text', { nullable: true })
  message: string | null;

  @Column('jsonb', { nullable: true })
  metadata: Record<string, unknown> | null;

  @CreateDateColumn({ type: 'timestamp' })
  created_at: Date;
}
