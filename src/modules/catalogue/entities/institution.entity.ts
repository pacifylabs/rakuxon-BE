import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

import { PublishStatus } from '../../../contract/enums';
import type { Campus, EnglishTest, Faq, QualityRating, RequirementGroup } from './shared.types';

/**
 * A university. Global — no tenant: the catalogue is shared by every agency,
 * which is the network asset the platform is built on.
 */
@Entity('institutions')
@Index('institutions_country_idx', ['countryCode'])
@Index('institutions_status_idx', ['status'])
export class Institution {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /** Route key: /universities/[slug]. Stable — a change must 301, never 404. */
  @Column({ type: 'citext', unique: true })
  slug!: string;

  @Column({ type: 'text' })
  name!: string;

  /**
   * Alternates and abbreviations, e.g. ["UCL", "University College London"].
   *
   * Feeds search. Without it, someone typing the abbreviation everybody
   * actually uses finds nothing.
   */
  @Column({ type: 'text', array: true, default: '{}' })
  aka!: string[];

  @Column({ type: 'text' })
  country!: string;

  /** ISO 3166-1 alpha-2, uppercase. Drives the flag and the country filter. */
  @Column({ type: 'char', length: 2 })
  countryCode!: string;

  @Column({ type: 'text', nullable: true })
  city!: string | null;

  @Column({ type: 'text', nullable: true })
  website!: string | null;

  @Column({ type: 'text', nullable: true })
  about!: string | null;

  /**
   * Only where licensed. A university logo is a trademark, so this stays null
   * unless a partnership or brand guideline permits it — the country flag is
   * the fallback everywhere in the UI.
   */
  @Column({ type: 'text', nullable: true })
  logoUrl!: string | null;

  @Column({ type: 'text', nullable: true })
  heroImageUrl!: string | null;

  @Column({ type: 'text', array: true, default: '{}' })
  highlights!: string[];

  @Column({ type: 'jsonb', default: () => "'[]'" })
  campuses!: Campus[];

  @Column({ type: 'jsonb', default: () => "'[]'" })
  requiredDocuments!: RequirementGroup[];

  @Column({ type: 'jsonb', default: () => "'[]'" })
  englishTests!: EnglishTest[];

  @Column({ type: 'jsonb', default: () => "'[]'" })
  faqs!: Faq[];

  /** Each entry names its scheme and year, e.g. TEF Silver 2023. */
  @Column({ type: 'jsonb', default: () => "'[]'" })
  qualityRatings!: QualityRating[];

  @Column({ type: 'text', nullable: true })
  employability!: string | null;

  /** Year founded. A real anchor on a page that would otherwise be a name. */
  @Column({ type: 'int', nullable: true })
  foundedYear!: number | null;

  /** Total enrolment, where a source publishes one. */
  @Column({ type: 'int', nullable: true })
  studentCount!: number | null;

  @Column({ type: 'text', nullable: true })
  wikidataId!: string | null;

  /** A couple of paragraphs from Wikipedia. CC BY-SA, hence the source URL. */
  @Column({ type: 'text', nullable: true })
  overview!: string | null;

  /** Attribution. Required by the licence, so the text is unusable without it. */
  @Column({ type: 'text', nullable: true })
  overviewSourceUrl!: string | null;

  @Column({ type: 'text', nullable: true })
  motto!: string | null;

  /** Selective bodies only — Russell Group, not every standards consortium. */
  @Column({ type: 'text', array: true, default: '{}' })
  memberships!: string[];

  @Column({ type: 'numeric', precision: 9, scale: 6, nullable: true })
  latitude!: string | null;

  @Column({ type: 'numeric', precision: 9, scale: 6, nullable: true })
  longitude!: string | null;

  /** Null until enrichment has run, which is how a resumed run finds its work. */
  @Column({ type: 'timestamptz', nullable: true })
  enrichedAt!: Date | null;

  /**
   * Lowest published international tuition, for the "from" figure on a card.
   *
   * numeric, not float: money must not be stored in binary floating point.
   * Currency is stored beside it because a bare number is a guess.
   */
  @Column({ type: 'numeric', precision: 12, scale: 2, nullable: true })
  tuitionFrom!: string | null;

  @Column({ type: 'char', length: 3, nullable: true })
  tuitionCurrency!: string | null;

  /** Human label for the next intake, e.g. "Sep 2026". */
  @Column({ type: 'text', nullable: true })
  upcomingIntake!: string | null;

  /** A partner that returns decisions quickly. Our term, deliberately. */
  @Column({ type: 'boolean', default: false })
  fastTrackOffer!: boolean;

  @Column({ type: 'enum', enum: PublishStatus, default: PublishStatus.Draft })
  status!: PublishStatus;

  /**
   * Where this row came from, so a licensing question years from now is
   * answerable for one record rather than for a source in general.
   */
  @Column({ type: 'text', nullable: true })
  source!: string | null;

  @Column({ type: 'text', nullable: true })
  sourceUrl!: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  retrievedAt!: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
