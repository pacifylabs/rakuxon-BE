import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * A throwaway Postgres for the e2e suite: no Docker, and never a shared or
 * hosted database.
 *
 * The suite TRUNCATEs between files, so it must only ever point at a database
 * that exists for the length of one run. This starts a real Postgres 18 — the
 * major version Neon runs — in a fresh temporary directory on a free port, and
 * global-teardown.ts deletes it afterwards.
 *
 * DATABASE_URL is set here unconditionally. The one in .env is production, and
 * one exported in a shell is whatever someone last debugged against; neither is
 * ever used by the tests.
 *
 * To run against an existing *local* Postgres instead, set TEST_DATABASE_URL;
 * the localhost guard in admin-data-source.ts still applies to it.
 */

const USER = 'rakuxon';
const PASSWORD = 'rakuxon';
const DATABASE = 'rakuxon';

/**
 * The part of embedded-postgres used here, typed locally. The package ships
 * its types only through `exports`, which this project's module resolution
 * cannot see, so TypeScript could not type it from its own declarations.
 */
interface EmbeddedPostgresInstance {
  initialise(): Promise<void>;
  start(): Promise<void>;
  stop(): Promise<void>;
  createDatabase(name: string): Promise<void>;
  getPgClient(): { connect(): Promise<void>; query(sql: string): Promise<unknown>; end(): Promise<void> };
}

type EmbeddedPostgresConstructor = new (options: {
  databaseDir: string;
  port: number;
  user: string;
  password: string;
  persistent: boolean;
  onLog: (message: string) => void;
}) => EmbeddedPostgresInstance;

type WithPostgres = typeof globalThis & { __rakuxonPostgres?: EmbeddedPostgresInstance };

/** Asks the OS for a free port rather than hoping a fixed one is free. */
function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      server.close(() =>
        typeof address === 'object' && address
          ? resolve(address.port)
          : reject(new Error('Could not obtain a free port for the test database.')),
      );
    });
  });
}

export default async function globalSetup(): Promise<void> {
  process.env.DATABASE_SSL = 'false';

  if (process.env.TEST_DATABASE_URL) {
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
    return;
  }

  /*
   * Loaded dynamically, through a variable. The package is an ES module only,
   * so a static import from this CommonJS file will not compile, and a literal
   * specifier makes TypeScript try (and fail) to resolve its types.
   *
   * Compiled to CommonJS, the import can hand back the class itself or a
   * wrapper holding it under `.default`, depending on interop settings — so
   * both shapes are accepted rather than one being assumed.
   */
  const specifier = 'embedded-postgres';
  const loaded = (await import(specifier)) as {
    default: EmbeddedPostgresConstructor | { default: EmbeddedPostgresConstructor };
  };
  const EmbeddedPostgres = typeof loaded.default === 'function' ? loaded.default : loaded.default.default;

  const port = await freePort();
  const postgres = new EmbeddedPostgres({
    /* Not created in advance: initdb wants to make the directory itself. */
    databaseDir: join(tmpdir(), `rakuxon-e2e-${process.pid}-${Date.now()}`),
    port,
    user: USER,
    password: PASSWORD,
    persistent: false,
    /* Server chatter is noise in a test run; errors still reach onError. */
    onLog: () => undefined,
  });

  await postgres.initialise();
  await postgres.start();
  await postgres.createDatabase(DATABASE);

  /* The migration history still includes the removed row-level-security
     design, whose migration grants to this role and stops if it is missing. */
  const client = postgres.getPgClient();
  await client.connect();
  await client.query('CREATE ROLE rakuxon_app');
  await client.end();

  process.env.DATABASE_URL = `postgresql://${USER}:${PASSWORD}@localhost:${port}/${DATABASE}`;
  (globalThis as WithPostgres).__rakuxonPostgres = postgres;
}
