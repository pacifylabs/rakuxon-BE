import { ForeignKey } from 'typeorm';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * One admin's clock-in/out for one calendar day (server UTC) — the
 * attendance mechanism the client asked for. One row per admin per day: a
 * clock-in creates it, a clock-out fills in `clockOutAt` on the same row.
 */
@Entity('attendance_records')
@ForeignKey('admins', ['adminId'], ['id'], {
  name: 'attendance_records_adminId_fkey',
  onDelete: 'RESTRICT',
})
@Index('attendance_records_adminId_date_idx', ['adminId', 'date'], { unique: true })
export class AttendanceRecord {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  adminId!: string;

  /** The calendar day this record belongs to, as a date (not a timestamp) — server UTC. */
  @Column({ type: 'date' })
  date!: string;

  @Column({ type: 'timestamptz' })
  clockInAt!: Date;

  @Column({ type: 'timestamptz', nullable: true })
  clockOutAt!: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
