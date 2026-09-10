import { ForeignKey } from 'typeorm';
import { CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';

/** A document attached to a draft application. Composite key — no surrogate id needed. */
@Entity('application_documents')
@ForeignKey('applications', ['applicationId'], ['id'], { name: 'application_documents_applicationId_fkey', onDelete: 'CASCADE' })
@ForeignKey('documents', ['documentId'], ['id'], { name: 'application_documents_documentId_fkey', onDelete: 'CASCADE' })
export class ApplicationDocument {
  @PrimaryColumn({ type: 'uuid' })
  applicationId!: string;

  @PrimaryColumn({ type: 'uuid' })
  documentId!: string;

  @CreateDateColumn({ type: 'timestamptz' })
  attachedAt!: Date;
}
