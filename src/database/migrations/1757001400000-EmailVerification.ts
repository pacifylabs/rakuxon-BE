import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Email verification — a single-use grant, hash-only, same shape as
 * `password_reset_tokens`: a verification link sits in an inbox, which is
 * far more exposed than an app's memory.
 */
export class EmailVerification1757001400000 implements MigrationInterface {
  name = 'EmailVerification1757001400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users" ADD COLUMN "emailVerifiedAt" timestamptz;
    `);

    await queryRunner.query(`
      CREATE TABLE "email_verification_tokens" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "userId" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "tokenHash" text NOT NULL UNIQUE,
        "expiresAt" timestamptz NOT NULL,
        "consumedAt" timestamptz,
        "createdAt" timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX "email_verification_tokens_user_idx" ON "email_verification_tokens" ("userId");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE "email_verification_tokens";');
    await queryRunner.query('ALTER TABLE "users" DROP COLUMN "emailVerifiedAt";');
  }
}
