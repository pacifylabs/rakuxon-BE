import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * "Success Manager" is not a new identity concept — it is any `AdminRole`
 * an admin flags with this column in the existing Roles & Permissions
 * screen. `ApplicationsService.autoAssign()` reads it to find the pool of
 * admins eligible for automatic case assignment on submit.
 */
export class SuccessManagerPool1757003900000 implements MigrationInterface {
  name = 'SuccessManagerPool1757003900000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "admin_roles" ADD COLUMN "isSuccessManagerPool" boolean NOT NULL DEFAULT false;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "admin_roles" DROP COLUMN IF EXISTS "isSuccessManagerPool";
    `);
  }
}
