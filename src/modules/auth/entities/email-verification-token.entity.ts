import { ForeignKey } from 'typeorm';
import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * A single-use email verification grant.
 *
 * Hash-only, like every other token here, and short-lived: a verification
 * link sits in an inbox, which is a far more exposed place than an app's
 * memory.
 */
@Entity('email_verification_tokens')
@ForeignKey('users', ['userId'], ['id'], { name: 'email_verification_tokens_userId_fkey', onDelete: 'CASCADE' })
@Index('email_verification_tokens_user_idx', ['userId'])
export class EmailVerificationToken {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  userId!: string;

  @Column({ type: 'text', unique: true })
  tokenHash!: string;

  @Column({ type: 'timestamptz' })
  expiresAt!: Date;

  @Column({ type: 'timestamptz', nullable: true })
  consumedAt!: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}
