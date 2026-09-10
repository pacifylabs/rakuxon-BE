import { ForeignKey } from 'typeorm';
import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * A tokenised invitation that scopes a student to their own record.
 *
 * Like refresh tokens, only the hash is stored. Consumption and revocation are
 * separate columns so an audit can tell "used" from "withdrawn".
 */
@Entity('onboarding_links')
@ForeignKey('tenants', ['tenantId'], ['id'], { name: 'onboarding_links_tenantId_fkey', onDelete: 'CASCADE' })
@ForeignKey('users', ['issuedByUserId'], ['id'], { name: 'onboarding_links_issuedByUserId_fkey', onDelete: 'CASCADE' })
@Index('onboarding_links_tenant_idx', ['tenantId'])
export class OnboardingLink {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  tenantId!: string;

  /** The counselor who issued it. */
  @Column({ type: 'uuid' })
  issuedByUserId!: string;

  @Column({ type: 'text', unique: true })
  tokenHash!: string;

  @Column({ type: 'citext' })
  inviteeEmail!: string;

  @Column({ type: 'timestamptz' })
  expiresAt!: Date;

  @Column({ type: 'timestamptz', nullable: true })
  consumedAt!: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  revokedAt!: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}
