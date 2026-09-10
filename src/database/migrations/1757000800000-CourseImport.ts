import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * What a bulk course import needs that hand-entered courses did not.
 *
 * `overview` and `durationMonths` were NOT NULL because every course so far was
 * typed by someone who had both. A feed carries neither for most rows, and the
 * choices were to invent a duration, write filler prose, or allow the gap. Only
 * the last one is true, and the page already renders "Ask an advisor" for it.
 *
 * `sourceRef` is the provider's own id for the row. Upserting on it is what
 * makes a re-run correct a course instead of duplicating it — matching on title
 * would merge two genuinely different "MSc Data Science" courses at one
 * university the day they split by campus.
 *
 * `tuitionIsEstimate` exists because the feed calls its figure an approximate
 * annual fee. Displaying it as a fee would be a promise the data does not make.
 */
export class CourseImport1757000800000 implements MigrationInterface {
  name = 'CourseImport1757000800000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "courses"
        ALTER COLUMN "overview" DROP NOT NULL,
        ALTER COLUMN "durationMonths" DROP NOT NULL,
        ADD COLUMN "sourceRef" text,
        ADD COLUMN "tuitionIsEstimate" boolean NOT NULL DEFAULT false;
    `);

    /* Not partial, deliberately. Postgres treats NULLs as distinct in a unique
       index, so hand-entered courses (no sourceRef) never collide with each
       other — and a plain index is one ON CONFLICT ("source", "sourceRef") can
       infer without repeating a predicate in every upsert. */
    await queryRunner.query(`
      CREATE UNIQUE INDEX "courses_source_ref_idx" ON "courses" ("source", "sourceRef");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    /* Re-imposing NOT NULL fails while imported rows lack the values, which is
       the correct outcome: reverting must not silently delete them. */
    await queryRunner.query(`
      DROP INDEX IF EXISTS "courses_source_ref_idx";
      ALTER TABLE "courses"
        DROP COLUMN "tuitionIsEstimate",
        DROP COLUMN "sourceRef",
        ALTER COLUMN "durationMonths" SET NOT NULL,
        ALTER COLUMN "overview" SET NOT NULL;
    `);
  }
}
