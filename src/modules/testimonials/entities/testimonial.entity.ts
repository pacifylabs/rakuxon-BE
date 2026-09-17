import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

import { PublishStatus } from '../../../contract/enums';

/** Where a testimonial is allowed to appear. Plain text, not a DB enum: a
    third placement later is a value, not a migration. */
export type TestimonialPlacement = 'home' | 'students';

/**
 * A real person's quote about Rakuxon, shown on the marketing site.
 *
 * `photoUrl` requires `consentGiven` at the database level (see this
 * migration's check constraint) — a stock photo under a real name is
 * exactly the misrepresentation this table exists to prevent.
 */
@Entity('testimonials')
@Check('testimonials_photo_needs_consent', '"photoUrl" IS NULL OR "consentGiven" = true')
@Index('testimonials_placement_idx', { synchronize: false })
@Index('testimonials_status_idx', ['status'])
export class Testimonial {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'text' })
  quote!: string;

  @Column({ type: 'text' })
  authorName!: string;

  /** e.g. "Oxford University, UK" or "Nigeria → Canada". */
  @Column({ type: 'text' })
  detail!: string;

  @Column({ type: 'text', nullable: true })
  photoUrl!: string | null;

  @Column({ type: 'boolean', default: false })
  consentGiven!: boolean;

  @Column({ type: 'text', array: true, default: '{}' })
  placement!: TestimonialPlacement[];

  @Column({ type: 'enum', enum: PublishStatus, enumName: 'publish_status_enum', default: PublishStatus.Draft })
  status!: PublishStatus;

  @Column({ type: 'int', default: 0 })
  displayOrder!: number;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
