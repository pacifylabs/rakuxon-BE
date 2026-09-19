import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

/** Which surface(s) a template's copy renders through. Plain text, not a DB
    enum, for the same reason as `TestimonialPlacement` — a value, not a
    migration, if a third channel ever shows up. */
export type NotificationChannel = 'email' | 'in_app' | 'both';

/**
 * Admin-editable copy for one system message, keyed by the stable string
 * every call site already used as its in-app `type` (`document_approved`,
 * `case_assigned`, ...). A row missing or `enabled: false` is not an error —
 * `NotificationTemplatesService` falls back to the hardcoded `*.template.ts`
 * function and the inline copy at the call site, so deleting a row by
 * mistake degrades to today's behaviour rather than breaking the message.
 *
 * `body` holds one entry per paragraph; email renders every paragraph,
 * an in-app notification uses only the first — the same shape that let a
 * multi-paragraph email and a one-line inbox row coexist before this table
 * existed.
 */
@Entity('notification_templates')
export class NotificationTemplate {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'text', unique: true })
  key!: string;

  @Column({ type: 'text' })
  channel!: NotificationChannel;

  /** Email only — an in-app notification has no subject line. */
  @Column({ type: 'text', nullable: true })
  subject!: string | null;

  @Column({ type: 'text' })
  heading!: string;

  @Column({ type: 'text', array: true, default: '{}' })
  body!: string[];

  @Column({ type: 'text', nullable: true })
  ctaLabel!: string | null;

  /** A `{{token}}` template, e.g. `"{{reviewUrl}}"` — interpolated the same way as `body`. */
  @Column({ type: 'text', nullable: true })
  ctaUrl!: string | null;

  /** Email only — the small print under the button (an expiry note, a "didn't request this?" line). */
  @Column({ type: 'text', nullable: true })
  footnote!: string | null;

  @Column({ type: 'boolean', default: true })
  enabled!: boolean;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
