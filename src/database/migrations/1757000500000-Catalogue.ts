import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * The catalogue: institutions, courses and articles.
 *
 * Global tables — no tenantId. Every agency sees the same catalogue, which is
 * the network asset the platform is built on, and there is nothing here that
 * belongs to one agency rather than another.
 *
 * Nested detail (intakes, requirement groups, English bands, scholarships) is
 * jsonb rather than child tables. It is always read with its parent, never
 * queried across rows and never joined, so a table each would add migrations
 * and joins for nothing. The first one that needs its own index earns a table.
 */
export class Catalogue1757000500000 implements MigrationInterface {
  name = 'Catalogue1757000500000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    /* Fuzzy matching for the typeahead: "manchestr" has to find Manchester. */
    await queryRunner.query('CREATE EXTENSION IF NOT EXISTS "pg_trgm"');

    /*
     * array_to_string is marked STABLE, so a generated column cannot use it,
     * but only because its signature is `anyarray` — the volatility has to
     * cover element types whose output function reads a setting. Pinned to
     * text[] it is genuinely immutable, which is what this wrapper asserts.
     *
     * The alternative, array_to_tsvector, is immutable but stores lexemes
     * verbatim: "UoM" never matches a query normalised to "uom", so every
     * abbreviation silently fails to find anything.
     */
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION "immutable_array_to_string"(text[], text)
        RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT
        AS $fn$ SELECT array_to_string($1, $2) $fn$;
    `);

    await queryRunner.query(`
      CREATE TYPE "publish_status_enum" AS ENUM ('draft', 'published', 'suspended');
      CREATE TYPE "study_level_enum" AS ENUM ('foundation', 'undergraduate', 'postgraduate', 'research');
      CREATE TYPE "study_mode_enum" AS ENUM ('full_time', 'part_time', 'online', 'hybrid');
      CREATE TYPE "tuition_period_enum" AS ENUM ('year', 'course');
    `);

    await queryRunner.query(`
      CREATE TABLE "institutions" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "slug" citext NOT NULL UNIQUE,
        "name" text NOT NULL,
        "aka" text[] NOT NULL DEFAULT '{}',
        "country" text NOT NULL,
        "countryCode" char(2) NOT NULL,
        "city" text,
        "website" text,
        "about" text,
        "logoUrl" text,
        "heroImageUrl" text,
        "highlights" text[] NOT NULL DEFAULT '{}',
        "campuses" jsonb NOT NULL DEFAULT '[]',
        "requiredDocuments" jsonb NOT NULL DEFAULT '[]',
        "englishTests" jsonb NOT NULL DEFAULT '[]',
        "faqs" jsonb NOT NULL DEFAULT '[]',
        "qualityRatings" jsonb NOT NULL DEFAULT '[]',
        "employability" text,
        "tuitionFrom" numeric(12,2),
        "tuitionCurrency" char(3),
        "upcomingIntake" text,
        "fastTrackOffer" boolean NOT NULL DEFAULT false,
        "status" "publish_status_enum" NOT NULL DEFAULT 'draft',
        "source" text,
        "sourceUrl" text,
        "retrievedAt" timestamptz,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX "institutions_country_idx" ON "institutions" ("countryCode");
      CREATE INDEX "institutions_status_idx" ON "institutions" ("status");
    `);

    await queryRunner.query(`
      CREATE TABLE "courses" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "slug" citext NOT NULL UNIQUE,
        "institutionId" uuid NOT NULL REFERENCES "institutions"("id") ON DELETE CASCADE,
        "title" text NOT NULL,
        "level" "study_level_enum" NOT NULL,
        "disciplines" text[] NOT NULL DEFAULT '{}',
        "durationMonths" integer NOT NULL,
        "studyMode" "study_mode_enum" NOT NULL DEFAULT 'full_time',
        "campus" text,
        "tuitionAmount" numeric(12,2),
        "tuitionCurrency" char(3),
        "tuitionPeriod" "tuition_period_enum" NOT NULL DEFAULT 'year',
        "tuitionIsInternational" boolean NOT NULL DEFAULT true,
        "intakes" jsonb NOT NULL DEFAULT '[]',
        "entryRequirements" jsonb NOT NULL DEFAULT '[]',
        "englishTests" jsonb NOT NULL DEFAULT '[]',
        "scholarships" jsonb NOT NULL DEFAULT '[]',
        "overview" text NOT NULL,
        "highlights" text[] NOT NULL DEFAULT '{}',
        "careers" text,
        "offerResponseWeeks" integer,
        "fastTrackOffer" boolean NOT NULL DEFAULT false,
        "status" "publish_status_enum" NOT NULL DEFAULT 'draft',
        "source" text,
        "sourceUrl" text,
        "retrievedAt" timestamptz,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX "courses_institution_idx" ON "courses" ("institutionId");
      CREATE INDEX "courses_level_idx" ON "courses" ("level");
      CREATE INDEX "courses_status_idx" ON "courses" ("status");
      CREATE INDEX "courses_disciplines_idx" ON "courses" USING gin ("disciplines");
    `);

    await queryRunner.query(`
      CREATE TABLE "articles" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "slug" citext NOT NULL UNIQUE,
        "title" text NOT NULL,
        "excerpt" text,
        "body" text NOT NULL,
        "heroImageUrl" text,
        "countryCode" char(2),
        "tags" text[] NOT NULL DEFAULT '{}',
        "readMinutes" integer,
        "author" text,
        "publishedAt" timestamptz,
        "status" "publish_status_enum" NOT NULL DEFAULT 'draft',
        "source" text,
        "sourceUrl" text,
        "retrievedAt" timestamptz,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX "articles_country_idx" ON "articles" ("countryCode");
      CREATE INDEX "articles_status_idx" ON "articles" ("status");
      CREATE INDEX "articles_tags_idx" ON "articles" USING gin ("tags");
    `);

    /*
     * Search.
     *
     * Generated columns rather than triggers: Postgres keeps them in step on
     * every write, so there is no path where a row is saved and its search
     * text is stale.
     *
     * Two immutability traps, both of which Postgres rejects outright rather
     * than silently accepting:
     *   - `to_tsvector('english', x)` resolves to the single-argument form,
     *     which reads default_text_search_config — a session setting. Casting
     *     to regconfig picks the immutable two-argument form.
     *   - `array_to_string` is STABLE, so array fields go through the
     *     immutable_array_to_string wrapper defined above.
     *
     * Weighting puts a name or title above the city it sits in, so searching
     * "London" does not rank a London campus above a course actually called
     * London.
     */
    await queryRunner.query(`
      ALTER TABLE "institutions" ADD COLUMN "searchVector" tsvector
        GENERATED ALWAYS AS (
          setweight(to_tsvector('english'::regconfig, coalesce("name", '')), 'A') ||
          setweight(to_tsvector('english'::regconfig, immutable_array_to_string("aka", ' ')), 'A') ||
          setweight(to_tsvector('english'::regconfig, coalesce("city", '')), 'C') ||
          setweight(to_tsvector('english'::regconfig, coalesce("country", '')), 'C')
        ) STORED;
      CREATE INDEX "institutions_search_idx" ON "institutions" USING gin ("searchVector");
      /* gin_trgm_ops also serves the <% (word_similarity) operator, which is
         what a typeahead needs: plain similarity() compares whole strings, so
         "manchestr" against "University of Manchester" scores far below the
         threshold and returns nothing. */
      CREATE INDEX "institutions_name_trgm_idx" ON "institutions" USING gin ("name" gin_trgm_ops);
    `);

    await queryRunner.query(`
      ALTER TABLE "courses" ADD COLUMN "searchVector" tsvector
        GENERATED ALWAYS AS (
          setweight(to_tsvector('english'::regconfig, coalesce("title", '')), 'A') ||
          setweight(to_tsvector('english'::regconfig, immutable_array_to_string("disciplines", ' ')), 'B') ||
          setweight(to_tsvector('english'::regconfig, coalesce("overview", '')), 'D')
        ) STORED;
      CREATE INDEX "courses_search_idx" ON "courses" USING gin ("searchVector");
      CREATE INDEX "courses_title_trgm_idx" ON "courses" USING gin ("title" gin_trgm_ops);
    `);

    await queryRunner.query(`
      ALTER TABLE "articles" ADD COLUMN "searchVector" tsvector
        GENERATED ALWAYS AS (
          setweight(to_tsvector('english'::regconfig, coalesce("title", '')), 'A') ||
          setweight(to_tsvector('english'::regconfig, coalesce("excerpt", '')), 'B') ||
          setweight(to_tsvector('english'::regconfig, coalesce("body", '')), 'D')
        ) STORED;
      CREATE INDEX "articles_search_idx" ON "articles" USING gin ("searchVector");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP TABLE IF EXISTS "articles";
      DROP TABLE IF EXISTS "courses";
      DROP TABLE IF EXISTS "institutions";
      DROP FUNCTION IF EXISTS "immutable_array_to_string"(text[], text);
      DROP TYPE IF EXISTS "tuition_period_enum";
      DROP TYPE IF EXISTS "study_mode_enum";
      DROP TYPE IF EXISTS "study_level_enum";
      DROP TYPE IF EXISTS "publish_status_enum";
    `);
  }
}
