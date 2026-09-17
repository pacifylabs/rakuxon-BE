import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { DataSource } from 'typeorm';
import { SchemaOwnedByMigrations1757002000000 } from '../../src/database/migrations/1757002000000-SchemaOwnedByMigrations';

import { adminDataSource, closeAdminDataSource } from '../helpers/admin-data-source';

/**
 * Production runs with schema synchronization off, so migrations are the only
 * thing that changes its schema.
 *
 * While synchronization was on, an entity change without a migration still
 * reached production — sync quietly patched the tables on boot. With it off,
 * the same change deploys cleanly and then fails at runtime on a column that
 * does not exist. This suite moves that failure into CI.
 */
describe('production schema', () => {
  let db: DataSource;

  beforeAll(async () => {
    db = await adminDataSource();
    await db.runMigrations();
  });

  afterAll(async () => {
    await closeAdminDataSource();
  });

  it('is fully described by the migrations: the entities need no further change', async () => {
    /*
     * What synchronization would run against a database built only from
     * migrations. Anything here is an entity change with no migration behind
     * it — write the migration rather than relaxing this assertion.
     */
    const { upQueries } = await db.driver.createSchemaBuilder().log();

    expect(upQueries.map((query) => query.query)).toEqual([]);
  });

  it('reaches the same state on a database that synchronization has already touched', async () => {
    /*
     * Production ran with synchronization on until SchemaOwnedByMigrations, so
     * its schema is not the one migrations alone produce: sync had added a
     * second course → institution key and its own metadata rows. Recreate that
     * history — undo the migration, add the duplicate key the old entity made
     * sync create, synchronize, migrate again — and require the same end state
     * as a clean build.
     */
    const migration = new SchemaOwnedByMigrations1757002000000();
    const runner = db.createQueryRunner();
    await runner.connect();
    await migration.down(runner);
    await db.query(
      `ALTER TABLE "courses" ADD CONSTRAINT "FK_477dfb3469de6ce682f3339eb8f"
       FOREIGN KEY ("institutionId") REFERENCES "institutions"("id") ON DELETE CASCADE`,
    );
    await db.synchronize();
    await migration.up(runner);
    await runner.release();

    const keys = await db.query<{ conname: string }[]>(
      `SELECT conname FROM pg_constraint WHERE conrelid = 'courses'::regclass AND contype = 'f'`,
    );
    expect(keys.map((key) => key.conname)).toEqual(['courses_institutionId_fkey']);

    const { upQueries } = await db.driver.createSchemaBuilder().log();
    expect(upQueries.map((query) => query.query)).toEqual([]);
  });

  it('cannot be switched back to synchronization by the server environment', () => {
    /*
     * Compose's `environment` overrides `env_file`, which is what makes the
     * repo, not a hand-edited .env.production, decide this. Read as text: the
     * value only matters on the api service, and the file has no parser here.
     */
    const compose = readFileSync(join(__dirname, '../../ops/compose.yml'), 'utf8');
    const api = compose.slice(compose.indexOf('\n  api:'), compose.indexOf('\n  site:'));

    expect(api).toMatch(/\n\s+environment:[\s\S]*\n\s+DATABASE_SYNCHRONIZE: "false"/);
  });
});
