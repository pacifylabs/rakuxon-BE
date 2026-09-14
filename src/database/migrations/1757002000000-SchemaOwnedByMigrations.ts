import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * The duplicate course → institution key synchronization created, under the
 * name TypeORM generated for the relation. The key the schema keeps is
 * `courses_institutionId_fkey`, which the Catalogue migration declared inline.
 */
const SYNC_DUPLICATE_COURSE_FK = 'FK_477dfb3469de6ce682f3339eb8f';

/**
 * The generated search columns, exactly as TypeORM records them. These must
 * match each entity's `asExpression` character for character: TypeORM compares
 * the stored text, not the column Postgres actually holds.
 */
const SEARCH_VECTORS: readonly { table: string; expression: string }[] = [
  {
    table: 'institutions',
    expression: `setweight(to_tsvector('english'::regconfig, coalesce("name", '')), 'A') || setweight(to_tsvector('english'::regconfig, immutable_array_to_string("aka", ' ')), 'A') || setweight(to_tsvector('english'::regconfig, coalesce("city", '')), 'C') || setweight(to_tsvector('english'::regconfig, coalesce("country", '')), 'C')`,
  },
  {
    table: 'courses',
    expression: `setweight(to_tsvector('english'::regconfig, coalesce("title", '')), 'A') || setweight(to_tsvector('english'::regconfig, immutable_array_to_string("disciplines", ' ')), 'B') || setweight(to_tsvector('english'::regconfig, coalesce("overview", '')), 'D')`,
  },
  {
    table: 'articles',
    expression: `setweight(to_tsvector('english'::regconfig, coalesce("title", '')), 'A') || setweight(to_tsvector('english'::regconfig, coalesce("excerpt", '')), 'B') || setweight(to_tsvector('english'::regconfig, coalesce("body", '')), 'D')`,
  },
];

/**
 * Makes the migrations a complete description of the schema, so production can
 * run with synchronization off.
 *
 * A database built only from migrations differed from the entities in two
 * places, and synchronization had been papering over both at boot:
 *
 * - The course entity declared its institution key twice — once by name, once
 *   through the relation — so sync added a second, identical key. The entity
 *   now declares it once; this drops the copy from any database sync reached.
 * - The three generated search columns had no row in `typeorm_metadata`, so
 *   sync dropped and re-created each one, taking its GIN search index with it,
 *   which SyncIndexesService then rebuilt. Recording them stops the churn.
 *
 * Written to leave either kind of database in the same end state: one built
 * only from migrations, or one that synchronization has already touched.
 */
export class SchemaOwnedByMigrations1757002000000 implements MigrationInterface {
  name = 'SchemaOwnedByMigrations1757002000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "courses" DROP CONSTRAINT IF EXISTS "${SYNC_DUPLICATE_COURSE_FK}"`,
    );

    /* TypeORM's own definition, for a database it has never synchronized. */
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "typeorm_metadata" (
        "type" varchar NOT NULL,
        "database" varchar,
        "schema" varchar,
        "table" varchar,
        "name" varchar,
        "value" text
      )
    `);

    for (const { table, expression } of SEARCH_VECTORS) {
      await queryRunner.query(
        `DELETE FROM "typeorm_metadata"
         WHERE "type" = 'GENERATED_COLUMN' AND "schema" = 'public' AND "table" = $1 AND "name" = 'searchVector'`,
        [table],
      );
      await queryRunner.query(
        `INSERT INTO "typeorm_metadata" ("type", "database", "schema", "table", "name", "value")
         VALUES ('GENERATED_COLUMN', current_database(), 'public', $1, 'searchVector', $2)`,
        [table, expression],
      );
    }
  }

  /* The duplicate key is not restored: it never belonged in the schema. */
  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const { table } of SEARCH_VECTORS) {
      await queryRunner.query(
        `DELETE FROM "typeorm_metadata"
         WHERE "type" = 'GENERATED_COLUMN' AND "schema" = 'public' AND "table" = $1 AND "name" = 'searchVector'`,
        [table],
      );
    }
  }
}
