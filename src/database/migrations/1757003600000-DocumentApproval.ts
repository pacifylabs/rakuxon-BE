import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * `approved` sits between `uploaded` and the submission gate: uploading was
 * always enough to attach a document to an application, but from this
 * migration on it is not enough to make that application submittable — see
 * `ApplicationsService.withGates()`. `documents.review` already gates the
 * reject action; approve reuses the same permission rather than adding one.
 */
export class DocumentApproval1757003600000 implements MigrationInterface {
  name = 'DocumentApproval1757003600000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    /* IF NOT EXISTS: Postgres cannot drop an enum value, so down() cannot
       remove this — without this guard, the migrations round-trip test
       (down then up again) fails the second time this runs. */
    await queryRunner.query(`
      ALTER TYPE "document_status_enum" ADD VALUE IF NOT EXISTS 'approved';
    `);
  }

  public async down(): Promise<void> {
    /* Postgres cannot drop an enum value; 'approved' stays in
       document_status_enum on a rollback, same as every other enum-widening
       migration in this codebase. */
  }
}
