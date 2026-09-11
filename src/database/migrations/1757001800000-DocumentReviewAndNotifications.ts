import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Document review (reject, with a reason and an audit trail) and a minimal
 * in-app notifications inbox to tell a student it happened.
 */
export class DocumentReviewAndNotifications1757001800000 implements MigrationInterface {
  name = 'DocumentReviewAndNotifications1757001800000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    /* IF NOT EXISTS: Postgres cannot drop an enum value, so down() cannot
       remove 'rejected' — without this guard, the migrations round-trip
       test (down then up again) fails the second time this runs. */
    await queryRunner.query(`ALTER TYPE "document_status_enum" ADD VALUE IF NOT EXISTS 'rejected';`);

    await queryRunner.query(`
      ALTER TABLE "documents"
        ADD COLUMN "rejectionReason" text,
        ADD COLUMN "reviewedAt" timestamptz,
        ADD COLUMN "reviewedByAdminId" uuid;
    `);

    await queryRunner.query(`
      CREATE TABLE "notifications" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "userId" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "type" text NOT NULL,
        "title" text NOT NULL,
        "body" text NOT NULL,
        "link" text,
        "readAt" timestamptz,
        "createdAt" timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX "notifications_user_idx" ON "notifications" ("userId");
    `);

    await queryRunner.query(`
      INSERT INTO "permissions" ("key", "description") VALUES
        ('documents.review', 'Reject a student''s uploaded document, or upload one on their behalf');
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DELETE FROM "permissions" WHERE "key" = 'documents.review';`);
    await queryRunner.query(`DROP TABLE IF EXISTS "notifications";`);
    await queryRunner.query(`
      ALTER TABLE "documents"
        DROP COLUMN IF EXISTS "rejectionReason",
        DROP COLUMN IF EXISTS "reviewedAt",
        DROP COLUMN IF EXISTS "reviewedByAdminId";
    `);
    /* Postgres cannot drop an enum value; 'rejected' stays in
       document_status_enum on a rollback, same as any other enum-widening
       migration in this codebase. */
  }
}
