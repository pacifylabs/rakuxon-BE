import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * The shared media library: social toolkits, brand assets, design files and
 * anything else worth keeping in one admin-managed place. No publish
 * workflow — nothing here is public-facing, so there's no draft/published
 * distinction to track.
 */
export class MediaAssets1757004300000 implements MigrationInterface {
  name = 'MediaAssets1757004300000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "media_asset_category_enum" AS ENUM ('social_toolkit', 'brand_asset', 'design', 'other');
    `);

    await queryRunner.query(`
      CREATE TABLE "media_assets" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "title" text NOT NULL,
        "description" text,
        "category" "media_asset_category_enum" NOT NULL DEFAULT 'other',
        "fileUrl" text NOT NULL,
        "cloudinaryPublicId" text NOT NULL,
        "mimeType" text,
        "bytes" integer,
        "uploadedByAdminId" uuid REFERENCES "admins"("id") ON DELETE SET NULL,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX "media_assets_category_idx" ON "media_assets" ("category");
    `);

    await queryRunner.query(`
      INSERT INTO "permissions" ("key", "description") VALUES
        ('media.view', 'View the shared media library'),
        ('media.manage', 'Upload, edit and delete files in the shared media library');
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM "permissions" WHERE "key" IN ('media.view', 'media.manage');
    `);
    await queryRunner.query(`DROP TABLE IF EXISTS "media_assets";`);
    await queryRunner.query(`DROP TYPE IF EXISTS "media_asset_category_enum";`);
  }
}
