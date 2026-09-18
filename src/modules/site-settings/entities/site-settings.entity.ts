import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

export interface SiteAddress {
  label: string;
  lines: string[];
}

export interface SiteSocial {
  label: string;
  href: string;
}

/**
 * Contact details, social links and footer copy — a single row, always live,
 * with no draft/publish lifecycle (unlike `Testimonial`/`Service`). Admin
 * edits go straight to what the public site shows.
 */
@Entity('site_settings')
export class SiteSettings {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'text' })
  contactEmail!: string;

  @Column({ type: 'text', array: true, default: '{}' })
  contactPhones!: string[];

  @Column({ type: 'jsonb', default: () => "'[]'" })
  contactAddresses!: SiteAddress[];

  @Column({ type: 'jsonb', default: () => "'[]'" })
  socials!: SiteSocial[];

  @Column({ type: 'text' })
  footerTagline!: string;

  @Column({ type: 'text' })
  footerBlurb!: string;

  @Column({ type: 'text' })
  logoUrl!: string;

  @Column({ type: 'text' })
  logoDarkUrl!: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
