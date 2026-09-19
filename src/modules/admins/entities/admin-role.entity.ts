import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('admin_roles')
export class AdminRole {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'citext', unique: true })
  name!: string;

  @Column({ type: 'text', default: '' })
  description!: string;

  /** Eligible for automatic case assignment on submit — see `ApplicationsService.autoAssign()`. */
  @Column({ type: 'boolean', default: false })
  isSuccessManagerPool!: boolean;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
