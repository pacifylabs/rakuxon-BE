import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Facts a university page needs, and the indexes the listing reads.
 *
 * The registry import gives names, locations, acronyms and websites — enough
 * for a card, not enough for a page. These columns hold what Wikidata can add
 * on top, joined on the ROR id both sides already carry, so there is no fuzzy
 * name matching to get wrong.
 */
export class InstitutionEnrichment1757000600000 implements MigrationInterface {
  name = 'InstitutionEnrichment1757000600000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "institutions"
        ADD COLUMN "foundedYear" integer,
        ADD COLUMN "studentCount" integer,
        ADD COLUMN "wikidataId" text,
        ADD COLUMN "enrichedAt" timestamptz;
    `);

    /*
     * Covering index for the listing's actual query: filter by status and
     * country, order by name. Without the ordering column in the index,
     * Postgres sorts every match — 3,282 rows for the United States on a page
     * that shows twenty-four.
     */
    await queryRunner.query(`
      CREATE INDEX "institutions_browse_idx"
        ON "institutions" ("status", "countryCode", "name");
    `);

    /*
     * The country menu counts published rows grouped by country on every
     * request. This index answers it without touching the table.
     */
    await queryRunner.query(`
      CREATE INDEX "institutions_country_count_idx"
        ON "institutions" ("status", "countryCode");
    `);

    /* Enrichment resumes by finding what it has not done yet. */
    await queryRunner.query(`
      CREATE INDEX "institutions_enriched_idx"
        ON "institutions" ("enrichedAt") WHERE "enrichedAt" IS NULL;
    `);

    /* Upserts match on the source id, which had no index at all. */
    await queryRunner.query(`
      CREATE INDEX "institutions_source_url_idx" ON "institutions" ("sourceUrl");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS "institutions_source_url_idx";
      DROP INDEX IF EXISTS "institutions_enriched_idx";
      DROP INDEX IF EXISTS "institutions_country_count_idx";
      DROP INDEX IF EXISTS "institutions_browse_idx";
      ALTER TABLE "institutions"
        DROP COLUMN "enrichedAt",
        DROP COLUMN "wikidataId",
        DROP COLUMN "studentCount",
        DROP COLUMN "foundedYear";
    `);
  }
}
