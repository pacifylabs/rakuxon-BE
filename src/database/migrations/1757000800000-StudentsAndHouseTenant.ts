import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Students, and the one tenant a direct (non-agency) signup belongs to.
 *
 * A student's account is a `users` row like any other — tenant-scoped, same
 * `(tenantId, email)` uniqueness as agency staff. A student who registers
 * directly has no agency, so this migration seeds one fixed "house" tenant
 * that Rakuxon itself owns and every direct signup is scoped to. Kept
 * per-tenant rather than a global-unique email, matching this schema's
 * existing choice (see `IdentityAndTenancy1757000100000`): a global index
 * would let anyone who can issue an onboarding link probe whether an
 * arbitrary email already has a student account elsewhere on the platform.
 */
export class StudentsAndHouseTenant1757000800000 implements MigrationInterface {
  name = 'StudentsAndHouseTenant1757000800000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    /* Fixed, not generated: code references this id as a compile-time
       constant, so it must be known before the row exists. */
    await queryRunner.query(`
      INSERT INTO "tenants" ("id", "name", "slug", "status")
      VALUES ('00000000-0000-0000-0000-000000000001', 'Rakuxon', 'rakuxon-direct', 'active')
      ON CONFLICT ("id") DO NOTHING;
    `);

    await queryRunner.query(`
      CREATE TABLE "students" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "tenantId" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
        "userId" uuid NOT NULL UNIQUE REFERENCES "users"("id") ON DELETE CASCADE,
        "sourceOnboardingLinkId" uuid REFERENCES "onboarding_links"("id") ON DELETE SET NULL,
        "dateOfBirth" date,
        "nationality" text,
        "phone" text,
        "passportNumber" text,
        "address" jsonb NOT NULL DEFAULT '{}',
        "educationHistory" jsonb NOT NULL DEFAULT '[]',
        "intendedStudyLevel" "study_level_enum",
        "intendedCountry" text,
        "preferredIntake" text,
        "profileCompletedAt" timestamptz,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX "students_tenant_idx" ON "students" ("tenantId");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP TABLE IF EXISTS "students";
      DELETE FROM "tenants" WHERE "id" = '00000000-0000-0000-0000-000000000001';
    `);
  }
}
