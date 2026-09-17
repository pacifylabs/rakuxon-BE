import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * The preferred-intake dropdown's option list — admin-managed instead of
 * free text, so "2026-09" and "September 2026" stop being two different
 * answers to the same question. No permission migration: reuses
 * catalogue.view/catalogue.publish, the same trust tier as everything else
 * in the catalogue admin screens.
 */
export class IntakeTerms1757002700000 implements MigrationInterface {
  name = 'IntakeTerms1757002700000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "intake_terms" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "label" text NOT NULL,
        "sortOrder" integer NOT NULL DEFAULT 0,
        "active" boolean NOT NULL DEFAULT true,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now()
      );
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "intake_terms";`);
  }
}
