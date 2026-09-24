import { ForeignKey } from 'typeorm';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

import { MediaAssetCategory } from '../../../contract/enums';

/**
 * One file in the shared media library — a social toolkit, a brand asset, a
 * design file, or anything else worth keeping in one place rather than
 * scattered across chat threads and personal drives. Admin-managed, no
 * publish workflow: unlike a testimonial or an article, nothing here is
 * shown on the public site, so there's no draft/published distinction to
 * track — a file is either in the library or it isn't.
 */
@Entity('media_assets')
@ForeignKey('admins', ['uploadedByAdminId'], ['id'], {
  name: 'media_assets_uploadedByAdminId_fkey',
  onDelete: 'SET NULL',
})
@Index('media_assets_category_idx', ['category'])
export class MediaAsset {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'text' })
  title!: string;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Column({
    type: 'enum',
    enum: MediaAssetCategory,
    enumName: 'media_asset_category_enum',
    default: MediaAssetCategory.Other,
  })
  category!: MediaAssetCategory;

  @Column({ type: 'text' })
  fileUrl!: string;

  /** The Cloudinary public id, so a delete here can also delete the file itself, not just the row. */
  @Column({ type: 'text' })
  cloudinaryPublicId!: string;

  @Column({ type: 'text', nullable: true })
  mimeType!: string | null;

  @Column({ type: 'int', nullable: true })
  bytes!: number | null;

  @Column({ type: 'uuid', nullable: true })
  uploadedByAdminId!: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
