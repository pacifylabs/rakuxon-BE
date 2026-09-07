import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Stage 1 schema: tenants, users, refresh tokens and onboarding links. */
export class IdentityAndTenancy1757000100000 implements MigrationInterface {
  name = 'IdentityAndTenancy1757000100000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "tenant_status_enum" AS ENUM ('pending', 'active', 'suspended');
      CREATE TYPE "user_status_enum" AS ENUM ('invited', 'active', 'suspended');
      CREATE TYPE "user_role_enum" AS ENUM (
        'platform_admin', 'agency_admin', 'counselor', 'institution_user', 'student'
      );
    `);

    await queryRunner.query(`
      CREATE TABLE "tenants" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "name" text NOT NULL,
        "slug" citext NOT NULL UNIQUE,
        "status" "tenant_status_enum" NOT NULL DEFAULT 'pending',
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now()
      );
    `);

    await queryRunner.query(`
      CREATE TABLE "users" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "tenantId" uuid REFERENCES "tenants"("id") ON DELETE CASCADE,
        "email" citext NOT NULL,
        "passwordHash" text,
        "fullName" text NOT NULL,
        "role" "user_role_enum" NOT NULL,
        "status" "user_status_enum" NOT NULL DEFAULT 'active',
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now()
      );
    `);

    /* Unique per tenant, not globally: the same person can be a counselor at
       one agency and a student at another, and a global index would leak that
       an account exists across tenant boundaries. NULLS NOT DISTINCT so the
       platform_admin rows (tenantId IS NULL) still collide on duplicate email. */
    await queryRunner.query(`
      CREATE UNIQUE INDEX "users_tenant_email_unique"
        ON "users" ("tenantId", "email") NULLS NOT DISTINCT;
    `);

    await queryRunner.query(`
      CREATE TABLE "refresh_tokens" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "userId" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "tokenHash" text NOT NULL UNIQUE,
        "familyId" uuid NOT NULL,
        "expiresAt" timestamptz NOT NULL,
        "revokedAt" timestamptz,
        "replacedByTokenId" uuid,
        "createdAt" timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX "refresh_tokens_family_idx" ON "refresh_tokens" ("familyId");
    `);

    await queryRunner.query(`
      CREATE TABLE "onboarding_links" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "tenantId" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
        "issuedByUserId" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "tokenHash" text NOT NULL UNIQUE,
        "inviteeEmail" citext NOT NULL,
        "expiresAt" timestamptz NOT NULL,
        "consumedAt" timestamptz,
        "revokedAt" timestamptz,
        "createdAt" timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX "onboarding_links_tenant_idx" ON "onboarding_links" ("tenantId");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP TABLE IF EXISTS "onboarding_links";
      DROP TABLE IF EXISTS "refresh_tokens";
      DROP TABLE IF EXISTS "users";
      DROP TABLE IF EXISTS "tenants";
      DROP TYPE IF EXISTS "user_role_enum";
      DROP TYPE IF EXISTS "user_status_enum";
      DROP TYPE IF EXISTS "tenant_status_enum";
    `);
  }
}
