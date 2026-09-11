import type { MigrationInterface, QueryRunner } from 'typeorm';

/** TOTP-based two-factor authentication for admin accounts, plus one-time backup codes. */
export class AdminTwoFactor1757001900000 implements MigrationInterface {
  name = 'AdminTwoFactor1757001900000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "admins"
        ADD COLUMN "totpSecret" text,
        ADD COLUMN "totpEnabled" boolean NOT NULL DEFAULT false,
        ADD COLUMN "totpBackupCodesHash" text[] NOT NULL DEFAULT '{}';
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "admins"
        DROP COLUMN IF EXISTS "totpSecret",
        DROP COLUMN IF EXISTS "totpEnabled",
        DROP COLUMN IF EXISTS "totpBackupCodesHash";
    `);
  }
}
