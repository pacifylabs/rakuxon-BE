import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Room for the parts of a university page that are prose rather than facts.
 *
 * The registry gives a name and a location; Wikidata gives a one-line
 * description. Neither is an "overview" — the page needs a couple of paragraphs
 * that tell someone what the place is, and that lives on Wikipedia.
 *
 * `overviewSourceUrl` is not optional bookkeeping. Wikipedia text is CC BY-SA:
 * using it obliges us to attribute it, and an attribution we cannot render is
 * an attribution we do not have.
 */
export class InstitutionOverview1757000700000 implements MigrationInterface {
  name = 'InstitutionOverview1757000700000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "institutions"
        ADD COLUMN "overview" text,
        ADD COLUMN "overviewSourceUrl" text,
        ADD COLUMN "motto" text,
        ADD COLUMN "memberships" text[] NOT NULL DEFAULT '{}',
        ADD COLUMN "latitude" numeric(9,6),
        ADD COLUMN "longitude" numeric(9,6);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "institutions"
        DROP COLUMN "longitude",
        DROP COLUMN "latitude",
        DROP COLUMN "memberships",
        DROP COLUMN "motto",
        DROP COLUMN "overviewSourceUrl",
        DROP COLUMN "overview";
    `);
  }
}
