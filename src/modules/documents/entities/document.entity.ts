import { ForeignKey } from 'typeorm';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

import { DocumentStatus, DocumentType } from '../../../contract/enums';

/**
 * A file on Cloudinary, never on this server — bytes are never proxied
 * through the API (docs/01-prd.md § 6).
 *
 * A row exists from the moment a signature is issued (`pending_upload`), not
 * only once the upload succeeds, so an abandoned upload is a visible stale
 * row rather than nothing at all.
 */
@Entity('documents')
@ForeignKey('tenants', ['tenantId'], ['id'], { name: 'documents_tenantId_fkey', onDelete: 'CASCADE' })
@ForeignKey('students', ['studentId'], ['id'], { name: 'documents_studentId_fkey', onDelete: 'CASCADE' })
@Index('documents_student_idx', ['studentId'])
@Index('documents_tenant_idx', ['tenantId'])
export class Document {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  tenantId!: string;

  @Column({ type: 'uuid' })
  studentId!: string;

  @Column({ type: 'enum', enum: DocumentType, enumName: 'document_type_enum' })
  type!: DocumentType;

  @Column({ type: 'enum', enum: DocumentStatus, enumName: 'document_status_enum', default: DocumentStatus.PendingUpload })
  status!: DocumentStatus;

  @Column({ type: 'text' })
  originalFilename!: string;

  /** Namespaced `tenants/{tenantId}/students/{studentId}/{uuid}` — never guessable. */
  @Column({ type: 'text', unique: true })
  cloudinaryPublicId!: string;

  @Column({ type: 'text', default: 'auto' })
  cloudinaryResourceType!: string;

  /** Null until `confirm` reports what Cloudinary actually stored. */
  @Column({ type: 'text', nullable: true })
  url!: string | null;

  @Column({ type: 'int', nullable: true })
  bytes!: number | null;

  @Column({ type: 'text', nullable: true })
  mimeType!: string | null;

  /** Set together with `status: rejected`. Null otherwise. */
  @Column({ type: 'text', nullable: true })
  rejectionReason!: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  reviewedAt!: Date | null;

  /**
   * No FK to `admins`: that table is a fully separate identity system (see
   * `AdminIdentityAndPermissions`'s own doc comment), and a cross-system FK
   * would be the one place that separation leaks back in for what is only
   * ever an audit label.
   */
  @Column({ type: 'uuid', nullable: true })
  reviewedByAdminId!: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
