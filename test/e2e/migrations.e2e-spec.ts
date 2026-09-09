import { DataSource } from 'typeorm';

import { buildDataSourceOptions } from '../../src/database/data-source';

/**
 * Stage 0 TDD step 3: the datasource connects, migrations run, and a migration
 * can be rolled back. Against a real Postgres — the point is the wiring.
 */
describe('database migrations', () => {
  let dataSource: DataSource;

  beforeAll(async () => {
    /* Owner connection: migrations are DDL, and the runtime role has none. */
    dataSource = new DataSource(buildDataSourceOptions());
    await dataSource.initialize();
  });

  afterAll(async () => {
    if (dataSource?.isInitialized) await dataSource.destroy();
  });

  it('connects to Postgres', async () => {
    const [row] = await dataSource.query<{ one: number }[]>('SELECT 1 AS one');
    expect(row.one).toBe(1);
  });

  it('runs pending migrations and records them', async () => {
    await dataSource.runMigrations();
    const applied = await dataSource.query<{ name: string }[]>('SELECT name FROM migrations');
    expect(applied.map((row) => row.name)).toContain('InitialExtensions1757000000000');
  });

  it('installs the extensions the schema depends on', async () => {
    const rows = await dataSource.query<{ extname: string }[]>(
      "SELECT extname FROM pg_extension WHERE extname IN ('pgcrypto', 'citext')",
    );
    expect(rows.map((row) => row.extname).sort()).toEqual(['citext', 'pgcrypto']);
  });

  it('can generate a uuid database-side, which every primary key relies on', async () => {
    const [row] = await dataSource.query<{ id: string }[]>('SELECT gen_random_uuid() AS id');
    expect(row.id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('rolls the most recent migration back and forward again', async () => {
    /*
     * Deliberately not naming a migration. The first version asserted that
     * undoing the last one threw, which was true only while the irreversible
     * RemoveRowLevelSecurity happened to be last — adding the catalogue after
     * it broke a test that was really asserting migration order.
     */
    const last = dataSource.migrations.at(-1);
    expect(last).toBeDefined();

    await expect(dataSource.undoLastMigration()).resolves.not.toThrow();
    await dataSource.runMigrations();

    const applied = await dataSource.query<{ name: string }[]>('SELECT name FROM migrations');
    expect(applied.map((row) => row.name)).toContain(last?.name);
  });

  it('states why the last migration cannot be undone, rather than failing obscurely', async () => {
    const removal = dataSource.migrations.find(
      (migration) => migration.name === 'RemoveRowLevelSecurity1757000400000',
    );

    await expect(removal?.down?.({} as never)).rejects.toThrow(
      /Re-enabling policies without the application role/,
    );
  });
});
