import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Uploaded documents, stored on Cloudinary, never on this server.
 *
 * `status` stops at `uploaded` — review, an AI check and a virus-scan hook
 * are the counselor/institution side's future work, not this table's job
 * yet. Adding those states later is an ALTER TYPE, not a migration touching
 * existing rows.
 */
export class Documents1757000900000 implements MigrationInterface {
  name = 'Documents1757000900000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "document_type_enum" AS ENUM (
        'academic_certificate', 'english_test', 'identity', 'medical',
        'secondary_marksheet', 'senior_secondary_marksheet'
      );
      CREATE TYPE "document_status_enum" AS ENUM ('pending_upload', 'uploaded', 'deleted');
    `);

    await queryRunner.query(`
      CREATE TABLE "documents" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "tenantId" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
        "studentId" uuid NOT NULL REFERENCES "students"("id") ON DELETE CASCADE,
        "type" "document_type_enum" NOT NULL,
        "status" "document_status_enum" NOT NULL DEFAULT 'pending_upload',
        "originalFilename" text NOT NULL,
        "cloudinaryPublicId" text NOT NULL UNIQUE,
        "cloudinaryResourceType" text NOT NULL DEFAULT 'auto',
        "url" text,
        "bytes" integer,
        "mimeType" text,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX "documents_student_idx" ON "documents" ("studentId");
      CREATE INDEX "documents_tenant_idx" ON "documents" ("tenantId");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP TABLE IF EXISTS "documents";
      DROP TYPE IF EXISTS "document_status_enum";
      DROP TYPE IF EXISTS "document_type_enum";
    `);
  }
}
