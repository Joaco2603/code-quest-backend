import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('technologies')
export class Technology {
  @PrimaryGeneratedColumn() id: number;
  @Column({ type: 'varchar', length: 100 }) name: string;
}
