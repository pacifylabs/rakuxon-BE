import { ForeignKey } from 'typeorm';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

import type { Address, EducationHistoryEntry } from './shared.types';
import { StudyLevel } from '../../../contract/enums';

/**
 * The applicant profile behind a `student` user.
 *
 * Split from `User` rather than folded into it: `User` is "who can sign in,"
 * this is "what admission processing needs," and every other role has none of
 * these fields. One row per student, `userId` unique.
 */
@Entity('students')
@ForeignKey('tenants', ['tenantId'], ['id'], { name: 'students_tenantId_fkey', onDelete: 'CASCADE' })
@ForeignKey('users', ['userId'], ['id'], { name: 'students_userId_fkey', onDelete: 'CASCADE' })
@ForeignKey('onboarding_links', ['sourceOnboardingLinkId'], ['id'], { name: 'students_sourceOnboardingLinkId_fkey', onDelete: 'SET NULL' })
@Index('students_tenant_idx', ['tenantId'])
export class Student {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  tenantId!: string;

  @Column({ type: 'uuid', unique: true })
  userId!: string;

  /** The invitation this student redeemed, if any — null for a direct signup. */
  @Column({ type: 'uuid', nullable: true })
  sourceOnboardingLinkId!: string | null;

  @Column({ type: 'date', nullable: true })
  dateOfBirth!: string | null;

  @Column({ type: 'text', nullable: true })
  nationality!: string | null;

  @Column({ type: 'text', nullable: true })
  phone!: string | null;

  @Column({ type: 'text', nullable: true })
  passportNumber!: string | null;

  @Column({ type: 'jsonb', default: () => "'{}'" })
  address!: Address;

  @Column({ type: 'jsonb', default: () => "'[]'" })
  educationHistory!: EducationHistoryEntry[];

  @Column({ type: 'enum', enum: StudyLevel, enumName: 'study_level_enum', nullable: true })
  intendedStudyLevel!: StudyLevel | null;

  @Column({ type: 'text', nullable: true })
  intendedCountry!: string | null;

  @Column({ type: 'text', nullable: true })
  preferredIntake!: string | null;

  /** Set once every MVP-required field is present; not cleared if one is later blanked. */
  @Column({ type: 'timestamptz', nullable: true })
  profileCompletedAt!: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
