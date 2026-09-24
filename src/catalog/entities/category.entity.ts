import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('categories')
export class Category {
  @PrimaryGeneratedColumn() id: number;
  @Column({ type: 'varchar', length: 100 }) name: string;
}
