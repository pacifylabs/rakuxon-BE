import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

import { PublishStatus } from '../../../contract/enums';

/** Education or travel — the two halves of the business (docs/04b, /services). */
export type ServiceStrand = 'education' | 'travel';

export interface ServiceFaq {
  question: string;
  answer: string;
}

/**
 * One of Rakuxon's own service offerings — free consultancy, visa support,
 * travel and tourism, and so on. Admin-authored instead of hardcoded in the
 * frontend's `content/services.ts`, the same move already made for
 * testimonials.
 */
@Entity('services')
@Index('services_status_idx', ['status'])
export class Service {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'citext', unique: true })
  slug!: string;

  /** Looked up against a fixed icon set on the frontend, not a free-text name. */
  @Column({ type: 'text' })
  iconName!: string;

  @Column({ type: 'text' })
  title!: string;

  @Column({ type: 'text' })
  summary!: string;

  @Column({ type: 'text' })
  description!: string;

  @Column({ type: 'enum', enum: ['education', 'travel'], enumName: 'service_strand_enum' })
  strand!: ServiceStrand;

  @Column({ type: 'text' })
  metaTitle!: string;

  @Column({ type: 'text' })
  metaDescription!: string;

  @Column({ type: 'text', array: true, default: '{}' })
  whatsIncluded!: string[];

  @Column({ type: 'jsonb', default: () => "'[]'" })
  faqs!: ServiceFaq[];

  @Column({ type: 'text', array: true, nullable: true })
  relatedArticleSlugs!: string[] | null;

  @Column({ type: 'enum', enum: PublishStatus, enumName: 'publish_status_enum', default: PublishStatus.Draft })
  status!: PublishStatus;

  @Column({ type: 'int', default: 0 })
  displayOrder!: number;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
