import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Password reset grants, and the provider identities behind SSO sign-in. */
export class PasswordResetAndSso1757000200000 implements MigrationInterface {
  name = 'PasswordResetAndSso1757000200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "password_reset_tokens" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "userId" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "tokenHash" text NOT NULL UNIQUE,
        "expiresAt" timestamptz NOT NULL,
        "consumedAt" timestamptz,
        "createdAt" timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX "password_reset_tokens_user_idx" ON "password_reset_tokens" ("userId");
    `);

    await queryRunner.query(`
      CREATE TABLE "sso_identities" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "userId" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "provider" text NOT NULL,
        "providerAccountId" text NOT NULL,
        "createdAt" timestamptz NOT NULL DEFAULT now()
      );
      -- One platform account per provider account, so a second sign-in links
      -- rather than silently creating a duplicate user.
      CREATE UNIQUE INDEX "sso_identities_provider_account_unique"
        ON "sso_identities" ("provider", "providerAccountId");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP TABLE IF EXISTS "sso_identities";
      DROP TABLE IF EXISTS "password_reset_tokens";
    `);
  }
}
