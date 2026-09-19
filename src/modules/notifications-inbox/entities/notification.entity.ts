import { Check, ForeignKey } from 'typeorm';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

/**
 * One in-app notification for a signed-in person — a student (`userId`) or
 * an admin (`adminId`), exactly one of the two set. Admins are a fully
 * separate identity system (their own table, their own tokens), so this
 * cannot be a single foreign key the way `RefreshToken` is.
 */
@Entity('notifications')
@ForeignKey('users', ['userId'], ['id'], { name: 'notifications_userId_fkey', onDelete: 'CASCADE' })
@ForeignKey('admins', ['adminId'], ['id'], { name: 'notifications_adminId_fkey', onDelete: 'CASCADE' })
@Check('notifications_recipient_check', '("userId" IS NOT NULL) <> ("adminId" IS NOT NULL)')
@Index('notifications_user_idx', ['userId'])
@Index('notifications_admin_idx', ['adminId'])
export class Notification {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', nullable: true })
  userId!: string | null;

  @Column({ type: 'uuid', nullable: true })
  adminId!: string | null;

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
