import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

import { PublishStatus } from '../../../contract/enums';

/** Guidance content: country guides, visa explainers, how-to articles. */
@Entity('articles')
@Index('articles_tags_idx', { synchronize: false })
@Index('articles_search_idx', { synchronize: false })
@Index('articles_country_idx', ['countryCode'])
@Index('articles_status_idx', ['status'])
export class Article {
  /** Keep the migration's generated search column when entity sync is enabled. */
  @Column({
    type: 'tsvector',
    asExpression: `setweight(to_tsvector('english'::regconfig, coalesce("title", '')), 'A') || setweight(to_tsvector('english'::regconfig, coalesce("excerpt", '')), 'B') || setweight(to_tsvector('english'::regconfig, coalesce("body", '')), 'D')`,
    generatedType: 'STORED',
    select: false,
    insert: false,
    update: false,
    nullable: true,
  })
  searchVector!: string;

  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /** Route key: /resources/[slug]. */
  @Column({ type: 'citext', unique: true })
  slug!: string;

  @Column({ type: 'text' })
  title!: string;

  /** One or two sentences for cards and meta description. */
  @Column({ type: 'text', nullable: true })
  excerpt!: string | null;

  /** Markdown. Rendered server-side, so it must never contain raw HTML. */
  @Column({ type: 'text' })
  body!: string;

  @Column({ type: 'text', nullable: true })
  heroImageUrl!: string | null;

  /** Set where the article is about one destination, so it can be listed there. */
  @Column({ type: 'char', length: 2, nullable: true })
  countryCode!: string | null;

  @Column({ type: 'text', array: true, default: '{}' })
  tags!: string[];

  /** Stored rather than computed, so an editor can override a bad estimate. */
  @Column({ type: 'int', nullable: true })
  readMinutes!: number | null;

  @Column({ type: 'text', nullable: true })
  author!: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  publishedAt!: Date | null;

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
