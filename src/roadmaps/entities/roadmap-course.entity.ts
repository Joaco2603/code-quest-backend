import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { Course } from '../../catalog/entities.js';
import { Roadmap } from './roadmap.entity.js';

@Entity({ name: 'roadmap_courses' })
@Unique(['roadmapId', 'courseId'])
@Unique(['roadmapId', 'sortOrder'])
export class RoadmapCourse {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'roadmap_id', type: 'int' })
  roadmapId: number;

  @Index()
  @Column({ name: 'course_id', type: 'int' })
  courseId: number;

  @Column({ name: 'completed', type: 'boolean', default: false })
  completed: boolean;

  @Column({ name: 'sort_order', type: 'int' })
  sortOrder: number;

  @ManyToOne(() => Roadmap, (roadmap) => roadmap.courses, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'roadmap_id' })
  roadmap: Roadmap;

  @ManyToOne(() => Course, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'course_id' })
  course: Course;
}
