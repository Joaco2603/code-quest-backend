import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from '../../user/entities/user.entity.js';
import { RoadmapCourse } from './roadmap-course.entity.js';
import { RoadmapScope } from './roadmap-scope.enum.js';

@Entity({ name: 'roadmaps' })
export class Roadmap {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 200 })
  title: string;

  @Index()
  @Column({
    type: 'enum',
    enum: RoadmapScope,
    enumName: 'roadmap_scope',
    default: RoadmapScope.Personal,
  })
  scope: RoadmapScope;

  @Column({ type: 'varchar', length: 500, nullable: true })
  rationale: string | null;

  @Index('roadmaps_assessment_id_unique', { unique: true })
  @Column({ type: 'int', name: 'assessment_id', nullable: true })
  assessmentId: number | null;

  @Index()
  @Column({ type: 'uuid', name: 'user_id' })
  userId: string;

  @Column({ type: 'int', name: 'source_roadmap_id', nullable: true })
  sourceRoadmapId: number | null;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @ManyToOne(() => Roadmap, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'source_roadmap_id' })
  sourceRoadmap: Roadmap | null;

  @OneToMany(() => RoadmapCourse, (item) => item.roadmap, {
    cascade: true,
  })
  courses: RoadmapCourse[];
}
