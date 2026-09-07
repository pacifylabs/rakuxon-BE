import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * One issued refresh token.
 *
 * Stored as a hash, never the token itself: a database leak must not hand the
 * attacker usable sessions. `familyId` ties a rotation chain together so that
 * replaying a spent token can revoke every descendant at once — the standard
 * defence against a stolen refresh token being used alongside the real one.
 */
@Entity('refresh_tokens')
@Index('refresh_tokens_family_idx', ['familyId'])
export class RefreshToken {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  userId!: string;

  /** SHA-256 of the token. Unique so a replay is a constraint-level fact. */
  @Column({ type: 'text', unique: true })
  tokenHash!: string;

  @Column({ type: 'uuid' })
  familyId!: string;

  @Column({ type: 'timestamptz' })
  expiresAt!: Date;

  @Column({ type: 'timestamptz', nullable: true })
  revokedAt!: Date | null;

  /** Set when this token is rotated, so a chain can be walked. */
  @Column({ type: 'uuid', nullable: true })
  replacedByTokenId!: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}
