import { ForeignKey } from 'typeorm';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

/**
 * One in-app notification for a signed-in person.
 *
 * Keyed to `users.id`, not `students.id`: this is a `users`-table concept
 * the same way `RefreshToken` is, and nothing about the shape is
 * student-specific — only students happen to be the sole role receiving one
 * today.
 */
@Entity('notifications')
@ForeignKey('users', ['userId'], ['id'], { name: 'notifications_userId_fkey', onDelete: 'CASCADE' })
@Index('notifications_user_idx', ['userId'])
export class Notification {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  userId!: string;

  /** A free text column, not an enum — a second notification type later is a value, not a migration. */
  @Column({ type: 'text' })
  type!: string;

  @Column({ type: 'text' })
  title!: string;

  @Column({ type: 'text' })
  body!: string;

  /** Where "view" should navigate. Null when there is nowhere more specific than the inbox itself. */
  @Column({ type: 'text', nullable: true })
  link!: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  readAt!: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}
