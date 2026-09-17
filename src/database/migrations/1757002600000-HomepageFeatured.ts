import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * What shows in the homepage's "Popular destinations" row and its
 * "Explore leading institutions" showcase — admin-controlled, replacing what
 * used to be a hardcoded country list and (for institutions) three fictional
 * sample-bank entries shown to visitors as if they were real.
 *
 * Both columns are a nullable display order rather than a boolean: null
 * means "not featured", a number sets its position, so the same column
 * answers "is it featured" and "where" without a second field.
 */
export class HomepageFeatured1757002600000 implements MigrationInterface {
  name = 'HomepageFeatured1757002600000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "countries" ADD COLUMN "homepageFeaturedOrder" integer;
      ALTER TABLE "institutions" ADD COLUMN "homepageFeaturedOrder" integer;
      CREATE INDEX "institutions_homepage_featured_idx" ON "institutions" ("homepageFeaturedOrder")
        WHERE "homepageFeaturedOrder" IS NOT NULL;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS "institutions_homepage_featured_idx";
      ALTER TABLE "institutions" DROP COLUMN IF EXISTS "homepageFeaturedOrder";
      ALTER TABLE "countries" DROP COLUMN IF EXISTS "homepageFeaturedOrder";
    `);
  }
}
