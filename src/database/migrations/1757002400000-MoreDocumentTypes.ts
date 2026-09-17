import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Four more document types clients asked for by name: a degree transcript
 * (distinct from the certificate itself), an up-to-date CV, a recommendation
 * letter, and a research proposal for MRes/Doctorate applicants.
 */
export class MoreDocumentTypes1757002400000 implements MigrationInterface {
  name = 'MoreDocumentTypes1757002400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    /* IF NOT EXISTS: Postgres cannot drop an enum value, so down() cannot
       remove these — without this guard, the migrations round-trip test
       (down then up again) fails the second time this runs. */
    await queryRunner.query(`
      ALTER TYPE "document_type_enum" ADD VALUE IF NOT EXISTS 'academic_transcript';
      ALTER TYPE "document_type_enum" ADD VALUE IF NOT EXISTS 'cv_resume';
      ALTER TYPE "document_type_enum" ADD VALUE IF NOT EXISTS 'recommendation_letter';
      ALTER TYPE "document_type_enum" ADD VALUE IF NOT EXISTS 'research_proposal';
    `);
  }

  public async down(): Promise<void> {
    /* Postgres cannot drop an enum value; the four new values stay in
       document_type_enum on a rollback, same as every other enum-widening
       migration in this codebase. */
  }
}
