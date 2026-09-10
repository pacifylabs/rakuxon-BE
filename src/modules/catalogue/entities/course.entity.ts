import { ForeignKey } from 'typeorm';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

import { PublishStatus, StudyLevel, StudyMode, TuitionPeriod } from '../../../contract/enums';
import { Institution } from './institution.entity';
import type { EnglishTest, Intake, RequirementGroup, Scholarship } from './shared.types';

/** A programme at an institution. Global, like its institution. */
@Entity('courses')
@ForeignKey('institutions', ['institutionId'], ['id'], { name: 'courses_institutionId_fkey', onDelete: 'CASCADE' })
@Index('courses_disciplines_idx', { synchronize: false })
@Index('courses_search_idx', { synchronize: false })
@Index('courses_title_trgm_idx', { synchronize: false })
@Index('courses_institution_idx', ['institutionId'])
@Index('courses_level_idx', ['level'])
@Index('courses_status_idx', ['status'])
export class Course {
  /** Keep the migration's generated search column when entity sync is enabled. */
  @Column({
    type: 'tsvector',
    asExpression: `setweight(to_tsvector('english'::regconfig, coalesce("title", '')), 'A') || setweight(to_tsvector('english'::regconfig, immutable_array_to_string("disciplines", ' ')), 'B') || setweight(to_tsvector('english'::regconfig, coalesce("overview", '')), 'D')`,
    generatedType: 'STORED',
    select: false,
    insert: false,
    update: false,
    nullable: true,
  })
  searchVector!: string;

  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /** Route key: /courses/[slug]. */
  @Column({ type: 'citext', unique: true })
  slug!: string;

  @Column({ type: 'uuid' })
  institutionId!: string;

  @ManyToOne(() => Institution, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'institutionId' })
  institution?: Institution;

  @Column({ type: 'text' })
  title!: string;

  @Column({ type: 'enum', enum: StudyLevel, enumName: 'study_level_enum' })
  level!: StudyLevel;

  /**
   * Controlled vocabulary, not free text.
   *
   * Sources disagree wildly — "CS", "Computer Science", "Computing",
   * "Informatics" — and a filter over free text silently returns the wrong
   * count. Unmapped values belong in a review queue, never invented.
   */
  @Column({ type: 'text', array: true, default: '{}' })
  disciplines!: string[];

  @Column({ type: 'int' })
  durationMonths!: number;

  @Column({ type: 'enum', enum: StudyMode, enumName: 'study_mode_enum', default: StudyMode.FullTime })
  studyMode!: StudyMode;

  /** Which campus, where the institution has more than one. */
  @Column({ type: 'text', nullable: true })
  campus!: string | null;

  @Column({ type: 'numeric', precision: 12, scale: 2, nullable: true })
  tuitionAmount!: string | null;

  @Column({ type: 'char', length: 3, nullable: true })
  tuitionCurrency!: string | null;

  @Column({ type: 'enum', enum: TuitionPeriod, enumName: 'tuition_period_enum', default: TuitionPeriod.Year })
  tuitionPeriod!: TuitionPeriod;

  /** True where the figure is the international rate rather than the home one. */
  @Column({ type: 'boolean', default: true })
  tuitionIsInternational!: boolean;

  @Column({ type: 'jsonb', default: () => "'[]'" })
  intakes!: Intake[];

  @Column({ type: 'jsonb', default: () => "'[]'" })
  entryRequirements!: RequirementGroup[];

  @Column({ type: 'jsonb', default: () => "'[]'" })
  englishTests!: EnglishTest[];

  @Column({ type: 'jsonb', default: () => "'[]'" })
  scholarships!: Scholarship[];

  @Column({ type: 'text' })
  overview!: string;

  @Column({ type: 'text', array: true, default: '{}' })
  highlights!: string[];

  @Column({ type: 'text', nullable: true })
  careers!: string | null;

  /** Weeks to a decision, where the institution commits to one. */
  @Column({ type: 'int', nullable: true })
  offerResponseWeeks!: number | null;

  @Column({ type: 'boolean', default: false })
  fastTrackOffer!: boolean;

  @Column({ type: 'enum', enum: PublishStatus, enumName: 'publish_status_enum', default: PublishStatus.Draft })
  status!: PublishStatus;

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
