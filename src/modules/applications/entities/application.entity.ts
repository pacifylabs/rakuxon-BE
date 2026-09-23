import { ForeignKey } from 'typeorm';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

import { ApplicationStatus } from '../../../contract/enums';

/**
 * One course, one application. A student applying to three courses creates
 * three rows — each course's admission decision is independent, and
 * bundling them would mean unbundling later once offers start landing.
 */
@Entity('applications')
@ForeignKey('tenants', ['tenantId'], ['id'], { name: 'applications_tenantId_fkey', onDelete: 'CASCADE' })
@ForeignKey('students', ['studentId'], ['id'], { name: 'applications_studentId_fkey', onDelete: 'CASCADE' })
@ForeignKey('courses', ['courseId'], ['id'], { name: 'applications_courseId_fkey', onDelete: 'CASCADE' })
@ForeignKey('institutions', ['institutionId'], ['id'], { name: 'applications_institutionId_fkey', onDelete: 'CASCADE' })
@ForeignKey('admins', ['assignedAdminId'], ['id'], { name: 'applications_assignedAdminId_fkey', onDelete: 'SET NULL' })
@Index('applications_student_idx', ['studentId'])
@Index('applications_tenant_idx', ['tenantId'])
@Index('applications_assignedAdminId_idx', ['assignedAdminId'])
export class Application {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  tenantId!: string;

  @Column({ type: 'uuid' })
  studentId!: string;

  @Column({ type: 'uuid' })
  courseId!: string;

  /** Denormalized from the course, so listing applications needs no join. */
  @Column({ type: 'uuid' })
  institutionId!: string;

  /**
   * A human-readable code (`R26-0001`) — searchable and readable in a way a
   * UUID isn't. Assigned once, at creation, from
   * `application_reference_counters`; never regenerated or reused.
   */
  @Column({ type: 'text', unique: true })
  referenceCode!: string;

  @Column({ type: 'enum', enum: ApplicationStatus, enumName: 'application_status_enum', default: ApplicationStatus.Draft })
  status!: ApplicationStatus;

  @Column({ type: 'timestamptz', nullable: true })
  submittedAt!: Date | null;

  /** The admin currently working this application — not who reviews it, just who owns it. */
  @Column({ type: 'uuid', nullable: true })
  assignedAdminId!: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
