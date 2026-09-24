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

@Entity({ name: 'roadmaps' })
export class Roadmap {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 200 })
  title: string;

  @Index()
  @Column({ type: 'uuid', name: 'user_id' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ type: 'int', default: 0 })
  progress: number;

  @OneToMany(() => RoadmapCourse, (item) => item.roadmap, {
    cascade: true,
  })
  courses: RoadmapCourse[];
}
