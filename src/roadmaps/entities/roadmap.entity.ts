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

  @Column({ type: 'varchar', length: 500 })
  rationale: string;

  @Column({ type: 'varchar', length: 64 })
  model: string;

  @Index()
  @Column({ type: 'uuid', name: 'user_id' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Index()
  @Column({ name: 'assessment_id', type: 'int' })
  assessmentId: number;

  @ManyToOne(() => Assessment, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'assessment_id' })
  assessment: Assessment;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @OneToMany(() => RoadmapCourse, (item) => item.roadmap)
  courses: RoadmapCourse[];
}
