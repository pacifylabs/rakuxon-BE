import { ForeignKey } from 'typeorm';
import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * One issued admin refresh token. Same shape and rotation model as
 * `RefreshToken` (`src/modules/auth/entities/refresh-token.entity.ts`), kept
 * as its own table rather than a shared one: admin sessions are a fully
 * separate identity system, isolated from the `users`-table auth path end to
 * end — a leak or bug in one token store must not touch the other.
 */
@Entity('admin_refresh_tokens')
@ForeignKey('admins', ['adminId'], ['id'], {
  name: 'admin_refresh_tokens_adminId_fkey',
  onDelete: 'CASCADE',
})
@Index('admin_refresh_tokens_family_idx', ['familyId'])
export class AdminRefreshToken {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  adminId!: string;

  @Column({ type: 'text', unique: true })
  tokenHash!: string;

  @Column({ type: 'uuid' })
  familyId!: string;

  @Column({ type: 'timestamptz' })
  expiresAt!: Date;

  @Column({ type: 'timestamptz', nullable: true })
  revokedAt!: Date | null;

  @Column({ type: 'uuid', nullable: true })
  replacedByTokenId!: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}
