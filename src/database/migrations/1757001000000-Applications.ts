import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * One course per application — a student applying to three courses creates
 * three rows, matching how offers/decisions are made independently per
 * course. `status` stops at `submitted` deliberately: the counselor/
 * institution review pipeline (`under_review`, offers, rejection) is a
 * separate, later piece of work and extends this enum without migrating
 * existing rows.
 */
export class Applications1757001000000 implements MigrationInterface {
  name = 'Applications1757001000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "application_status_enum" AS ENUM ('draft', 'submitted');
    `);

    await queryRunner.query(`
      CREATE TABLE "applications" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "tenantId" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
        "studentId" uuid NOT NULL REFERENCES "students"("id") ON DELETE CASCADE,
        "courseId" uuid NOT NULL REFERENCES "courses"("id") ON DELETE CASCADE,
        "institutionId" uuid NOT NULL REFERENCES "institutions"("id") ON DELETE CASCADE,
        "status" "application_status_enum" NOT NULL DEFAULT 'draft',
        "submittedAt" timestamptz,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX "applications_student_idx" ON "applications" ("studentId");
      CREATE INDEX "applications_tenant_idx" ON "applications" ("tenantId");
    `);

    /*
     * A real join table, not jsonb like the catalogue's nested detail: unlike
     * that data, this linkage is queried and joined by the future review
     * tooling, which is exactly the case catalogue's own migration comment
     * says earns a table.
     */
    await queryRunner.query(`
      CREATE TABLE "application_documents" (
        "applicationId" uuid NOT NULL REFERENCES "applications"("id") ON DELETE CASCADE,
        "documentId" uuid NOT NULL REFERENCES "documents"("id") ON DELETE CASCADE,
        "attachedAt" timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY ("applicationId", "documentId")
      );
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP TABLE IF EXISTS "application_documents";
      DROP TABLE IF EXISTS "applications";
      DROP TYPE IF EXISTS "application_status_enum";
    `);
  }
}
