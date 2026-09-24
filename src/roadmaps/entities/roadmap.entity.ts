import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Assessment } from '../../assessments/entities/assessment.entity.js';
import { User } from '../../user/entities/user.entity.js';
import { RoadmapCourse } from './roadmap-course.entity.js';

@Entity({ name: 'roadmaps' })
export class Roadmap {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 200 })
  title: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  rationale: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  model: string | null;

  @Column({ name: 'assessment_id', type: 'int', nullable: true })
  assessmentId: number | null;

  @ManyToOne(() => Assessment, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'assessment_id' })
  assessment: Assessment | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @Index()
  @Column({ type: 'uuid', name: 'user_id' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @OneToMany(() => RoadmapCourse, (item) => item.roadmap, {
    cascade: true,
  })
  courses: RoadmapCourse[];
}
