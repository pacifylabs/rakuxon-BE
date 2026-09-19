import { ForeignKey } from 'typeorm';
import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

/**
 * One thread between exactly one student and one admin. A broadcast to many
 * students is many conversations, not one — every reply stays 1:1 and
 * private between that pair, the same way a support inbox works.
 *
 * `(studentId, adminId)` is unique: composing to a student who already has a
 * thread with that admin, or the student replying, both reuse the same row
 * rather than fragmenting into parallel threads.
 */
@Entity('conversations')
@ForeignKey('students', ['studentId'], ['id'], { name: 'conversations_studentId_fkey', onDelete: 'CASCADE' })
@ForeignKey('admins', ['adminId'], ['id'], { name: 'conversations_adminId_fkey', onDelete: 'CASCADE' })
@Index('conversations_student_idx', ['studentId'])
@Index('conversations_admin_idx', ['adminId'])
@Index('conversations_participants_idx', ['studentId', 'adminId'], { unique: true })
export class Conversation {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  studentId!: string;

  @Column({ type: 'uuid' })
  adminId!: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  /** Bumped on every new message — what a conversation list sorts by. */
  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
