import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * A second, fully separate identity system for platform operators: `admins`,
 * its own refresh/reset tokens, and a permission catalogue joined through
 * `admin_permissions`. Deliberately not a `role` on `users` — several admins
 * hold different, independently-assigned permission sets, which one enum
 * column per account cannot express.
 */
export class AdminIdentityAndPermissions1757001500000 implements MigrationInterface {
  name = 'AdminIdentityAndPermissions1757001500000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "admins" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "email" citext NOT NULL UNIQUE,
        "passwordHash" text NOT NULL,
        "firstName" text NOT NULL,
        "lastName" text NOT NULL,
        "status" "user_status_enum" NOT NULL DEFAULT 'active',
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now()
      );
    `);

    await queryRunner.query(`
      CREATE TABLE "admin_refresh_tokens" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "adminId" uuid NOT NULL REFERENCES "admins"("id") ON DELETE CASCADE,
        "tokenHash" text NOT NULL UNIQUE,
        "familyId" uuid NOT NULL,
        "expiresAt" timestamptz NOT NULL,
        "revokedAt" timestamptz,
        "replacedByTokenId" uuid,
        "createdAt" timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX "admin_refresh_tokens_family_idx" ON "admin_refresh_tokens" ("familyId");
    `);

    await queryRunner.query(`
      CREATE TABLE "admin_password_reset_tokens" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "adminId" uuid NOT NULL REFERENCES "admins"("id") ON DELETE CASCADE,
        "tokenHash" text NOT NULL UNIQUE,
        "expiresAt" timestamptz NOT NULL,
        "consumedAt" timestamptz,
        "createdAt" timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX "admin_password_reset_tokens_admin_idx" ON "admin_password_reset_tokens" ("adminId");
    `);

    await queryRunner.query(`
      CREATE TABLE "permissions" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "key" text NOT NULL UNIQUE,
        "description" text NOT NULL,
        "createdAt" timestamptz NOT NULL DEFAULT now()
      );
    `);

    await queryRunner.query(`
      CREATE TABLE "admin_permissions" (
        "adminId" uuid NOT NULL REFERENCES "admins"("id") ON DELETE CASCADE,
        "permissionId" uuid NOT NULL REFERENCES "permissions"("id") ON DELETE CASCADE,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY ("adminId", "permissionId")
      );
      CREATE INDEX "admin_permissions_admin_idx" ON "admin_permissions" ("adminId");
    `);

    /* The canonical set this first slice of admin features checks against.
       Static reference data, not per-environment secrets, so it belongs in a
       migration — new keys later are additive migrations, the same way an
       enum grows a value. */
    await queryRunner.query(`
      INSERT INTO "permissions" ("key", "description") VALUES
        ('tenants.view', 'View agency tenants and their vetting status'),
        ('tenants.approve', 'Approve a pending tenant, or reinstate a suspended one'),
        ('tenants.suspend', 'Suspend an active tenant'),
        ('catalogue.view', 'View the catalogue including unpublished records'),
        ('catalogue.publish', 'Publish a draft or suspended catalogue record, or revert one to draft'),
        ('catalogue.suspend', 'Suspend a published catalogue record'),
        ('applications.view', 'View applications across every tenant'),
        ('admins.manage', 'Create admins and manage their permissions');
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP TABLE IF EXISTS "admin_permissions";
      DROP TABLE IF EXISTS "permissions";
      DROP TABLE IF EXISTS "admin_password_reset_tokens";
      DROP TABLE IF EXISTS "admin_refresh_tokens";
      DROP TABLE IF EXISTS "admins";
    `);
  }
}
