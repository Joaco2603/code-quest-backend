import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { ValidRoles } from '../../auth/interfaces/valid-roles.type.js';

@Entity({ name: 'users' })
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('text', {
    unique: true,
  })
  email: string;

  @Column('text', {
    unique: true,
    nullable: true,
  })
  discordId: string | null;

  @Column('text', {
    select: false,
    nullable: true,
  })
  password: string | null;

  @Column('text')
  first_name: string;

  @Column('text', { nullable: true })
  last_name: string | null;

  @Column('text', { nullable: true })
  address: string | null;

  @Column('bool', { default: true })
  isActive: boolean;

  @Column({ type: 'enum', enum: ValidRoles, default: ValidRoles.user })
  role: ValidRoles;

  @ManyToOne(() => User, (user) => user.users, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'client_id' })
  client: User | null;

  @OneToMany(() => User, (user) => user.client)
  users: User[];

  @Column({ type: 'varchar', nullable: true, select: false })
  two_factor_secret: string | null;

  @Column({ type: 'boolean', default: false })
  is_two_factor_enabled: boolean;

  @Column({ type: 'boolean', default: false })
  is_two_factor_pending: boolean;

  @Column({ type: 'boolean', default: true })
  mustChangePassword: boolean;
}
