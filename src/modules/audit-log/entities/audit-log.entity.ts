import { Check, Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

export type AuditActorType = 'admin' | 'student' | 'system';

/**
 * One row per admin mutation (written automatically by `AuditLogInterceptor`)
 * or student action worth attributing (written explicitly by the service
 * that performs it). `actorName` is a snapshot, not a join: a later-renamed
 * or deleted admin/student must not corrupt what already happened.
 */
@Entity('audit_log')
@Check('audit_log_actorType_check', `"actorType" IN ('admin', 'student', 'system')`)
@Index('audit_log_resource_idx', ['resourceType', 'resourceId'])
@Index('audit_log_createdAt_idx', ['createdAt'])
export class AuditLog {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'text' })
  actorType!: AuditActorType;

  @Column({ type: 'uuid', nullable: true })
  actorId!: string | null;

  @Column({ type: 'text', nullable: true })
  actorName!: string | null;

  /** A stable, filterable label — the permission key for an admin action, or a short verb for a student one. */
  @Column({ type: 'text' })
  action!: string;

  /** Human-readable, for the timeline — the permission's own description, or a short sentence. */
  @Column({ type: 'text' })
  description!: string;

  @Column({ type: 'text', nullable: true })
  resourceType!: string | null;

  @Column({ type: 'uuid', nullable: true })
  resourceId!: string | null;

  @Column({ type: 'jsonb', default: '{}' })
  metadata!: Record<string, unknown>;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}
