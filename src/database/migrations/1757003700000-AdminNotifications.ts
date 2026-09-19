import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Widens `notifications` to reach an admin, not only a student — exactly
 * what the entity's own doc comment anticipated ("only students happen to be
 * the sole role receiving one today"). `userId` becomes optional, `adminId`
 * joins it as the other option, and a check constraint keeps exactly one set
 * rather than both or neither.
 */
export class AdminNotifications1757003700000 implements MigrationInterface {
  name = 'AdminNotifications1757003700000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "notifications"
        ALTER COLUMN "userId" DROP NOT NULL,
        ADD COLUMN "adminId" uuid REFERENCES "admins"("id") ON DELETE CASCADE,
        ADD CONSTRAINT "notifications_recipient_check"
          CHECK (("userId" IS NOT NULL) <> ("adminId" IS NOT NULL));
      CREATE INDEX "notifications_admin_idx" ON "notifications" ("adminId");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    /* An admin-only row has no userId to fall back to — deleted rather than
       left to violate the NOT NULL this restores, the same tradeoff as any
       other migration that narrows a widened shape back down. */
    await queryRunner.query(`
      DELETE FROM "notifications" WHERE "userId" IS NULL;
      DROP INDEX IF EXISTS "notifications_admin_idx";
      ALTER TABLE "notifications"
        DROP CONSTRAINT IF EXISTS "notifications_recipient_check",
        DROP COLUMN IF EXISTS "adminId",
        ALTER COLUMN "userId" SET NOT NULL;
    `);
  }
}
