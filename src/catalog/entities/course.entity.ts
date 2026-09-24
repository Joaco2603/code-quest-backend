import {
  Column,
  CreateDateColumn,
  Entity,
  JoinTable,
  ManyToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Category } from './category.entity.js';
import { CourseStatus } from './course-status.enum.js';
import { SkillLevel } from './skill-level.enum.js';
import { Technology } from './technology.entity.js';

@Entity('courses')
export class Course {
  @PrimaryGeneratedColumn() id: number;
  @Column({ type: 'varchar', length: 200 }) title: string;
  @Column({ type: 'text', nullable: true }) description: string | null;
  @Column({ type: 'varchar', length: 2048, nullable: true }) url: string | null;
  @Column({ type: 'varchar', name: 'image_url', length: 2048, nullable: true })
  imageUrl: string | null;
  @Column({ type: 'integer', name: 'duration_minutes', nullable: true })
  durationMinutes: number | null;
  @Column({ type: 'varchar', length: 150, nullable: true }) instructor:
    string | null;
  @Column({
    type: 'enum',
    enum: SkillLevel,
    enumName: 'skill_level',
    nullable: true,
  })
  level: SkillLevel | null;
  @Column({
    type: 'enum',
    enum: CourseStatus,
    enumName: 'course_status',
    default: CourseStatus.Draft,
  })
  status: CourseStatus;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
  @ManyToMany(() => Category)
  @JoinTable({
    name: 'course_categories',
    joinColumn: { name: 'course_id' },
    inverseJoinColumn: { name: 'category_id' },
  })
  categories: Category[];
  @ManyToMany(() => Technology)
  @JoinTable({
    name: 'course_technologies',
    joinColumn: { name: 'course_id' },
    inverseJoinColumn: { name: 'technology_id' },
  })
  technologies: Technology[];
  @ManyToMany(() => Course)
  @JoinTable({
    name: 'course_prerequisites',
    joinColumn: { name: 'course_id' },
    inverseJoinColumn: { name: 'prerequisite_id' },
  })
  prerequisites: Course[];
}
