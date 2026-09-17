import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Testimonials, admin-authored instead of hardcoded in the frontend. A photo
 * requires consent at the database level, not just in the admin form — a
 * check constraint, not a UI-only guard, so no future write path can slip a
 * photo in under a name without consent recorded for it.
 */
export class Testimonials1757002500000 implements MigrationInterface {
  name = 'Testimonials1757002500000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "testimonials" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "quote" text NOT NULL,
        "authorName" text NOT NULL,
        "detail" text NOT NULL,
        "photoUrl" text,
        "consentGiven" boolean NOT NULL DEFAULT false,
        "placement" text[] NOT NULL DEFAULT '{}',
        "status" "publish_status_enum" NOT NULL DEFAULT 'draft',
        "displayOrder" integer NOT NULL DEFAULT 0,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "testimonials_photo_needs_consent" CHECK ("photoUrl" IS NULL OR "consentGiven" = true)
      );
      CREATE INDEX "testimonials_status_idx" ON "testimonials" ("status");
      CREATE INDEX "testimonials_placement_idx" ON "testimonials" USING GIN ("placement");
    `);

    await queryRunner.query(`
      INSERT INTO "permissions" ("key", "description") VALUES
        ('content.view', 'View admin-managed marketing content, such as testimonials'),
        ('content.manage', 'Create, edit and publish admin-managed marketing content, such as testimonials');
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM "permissions" WHERE "key" IN ('content.view', 'content.manage');
    `);
    await queryRunner.query(`DROP TABLE IF EXISTS "testimonials";`);
  }
}
