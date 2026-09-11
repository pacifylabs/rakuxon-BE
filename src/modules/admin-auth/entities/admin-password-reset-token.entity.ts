import { ForeignKey } from 'typeorm';
import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/** Same shape as `PasswordResetToken`, scoped to `admins` instead of `users`. */
@Entity('admin_password_reset_tokens')
@ForeignKey('admins', ['adminId'], ['id'], {
  name: 'admin_password_reset_tokens_adminId_fkey',
  onDelete: 'CASCADE',
})
@Index('admin_password_reset_tokens_admin_idx', ['adminId'])
export class AdminPasswordResetToken {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  adminId!: string;

  @Column({ type: 'text', unique: true })
  tokenHash!: string;

  @Column({ type: 'timestamptz' })
  expiresAt!: Date;

  @Column({ type: 'timestamptz', nullable: true })
  consumedAt!: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}
