import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

import { PublishStatus } from '../../../contract/enums';

export interface DestinationFact {
  label: string;
  value: string;
  hint?: string;
}

/**
 * A written destination guide — the fuller "why this country" page behind
 * one card on /destinations. Deliberately separate from `Country` (the
 * reference/catalogue list of every servable country): a country can serve
 * students with no guide at all, and this table only ever holds the small
 * set the client has written full copy for.
 */
@Entity('destinations')
@Index('destinations_status_idx', ['status'])
export class Destination {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'citext', unique: true })
  slug!: string;

  @Column({ type: 'text' })
  name!: string;

  @Column({ type: 'text' })
  shortName!: string;

  @Column({ type: 'text', nullable: true })
  cardImageUrl!: string | null;

  @Column({ type: 'text', default: '' })
  cardImageAlt!: string;

  @Column({ type: 'text', nullable: true })
  heroImageUrl!: string | null;

  @Column({ type: 'text', default: '' })
  heroImageAlt!: string;

  @Column({ type: 'text' })
  tagline!: string;

  @Column({ type: 'text' })
  intro!: string;

  @Column({ type: 'text' })
  whyHeading!: string;

  @Column({ type: 'text' })
  why!: string;

  @Column({ type: 'text', array: true, default: '{}' })
  whyPoints!: string[];

  @Column({ type: 'jsonb', default: '[]' })
  facts!: DestinationFact[];

  @Column({ type: 'text', array: true, default: '{}' })
  universities!: string[];

  @Column({ type: 'text', array: true, default: '{}' })
  helpPoints!: string[];

  @Column({ type: 'enum', enum: PublishStatus, enumName: 'publish_status_enum', default: PublishStatus.Draft })
  status!: PublishStatus;

  @Column({ type: 'int', default: 0 })
  displayOrder!: number;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
