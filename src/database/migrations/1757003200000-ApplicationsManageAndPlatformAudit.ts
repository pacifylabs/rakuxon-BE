import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * `applications.manage` gates the first mutating admin-application routes
 * (attaching/detaching a document on a student's behalf, and — once added —
 * assignment); `applications.view` alone stays read-only. `platform.audit`
 * gates the platform-wide activity log, separate from any one resource's own
 * scoped history (which reuses whatever permission already lets an admin
 * view that resource).
 */
export class ApplicationsManageAndPlatformAudit1757003200000 implements MigrationInterface {
  name = 'ApplicationsManageAndPlatformAudit1757003200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO "permissions" ("key", "description") VALUES
        ('applications.manage', 'Assign applications and manage them on a student''s behalf, including attaching documents'),
        ('platform.audit', 'View the platform-wide activity log across every admin and student action');
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM "permissions" WHERE "key" IN ('applications.manage', 'platform.audit');
    `);
  }
}
