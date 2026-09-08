import { DataSource } from 'typeorm';

import { buildDataSourceOptions } from '../../src/database/data-source';

/**
 * The owner connection.
 *
 * Tests need two things the application role deliberately cannot do: run
 * migrations, and TRUNCATE (which ignores row-level security altogether, and
 * would be a cross-tenant delete in the wrong hands). Both belong here rather
 * than being granted away.
 */
let shared: DataSource | undefined;

export async function adminDataSource(): Promise<DataSource> {
  if (!shared) {
    const options = buildDataSourceOptions();
    /* Checked before connecting, not before truncating: migrations run on this
       connection too, and a migration against production is as bad as a wipe. */
    assertLocalDatabase((options as { url?: string }).url ?? '');
    shared = new DataSource(options);
    await shared.initialize();
  }

  return shared;
}

export async function closeAdminDataSource(): Promise<void> {
  await shared?.destroy();
  shared = undefined;
}

/**
 * Hosts the destructive helpers are allowed to touch.
 *
 * A local `.env` pointed at a hosted database is not exotic — it is what
 * happens the first time someone debugs against staging. The suite TRUNCATEs
 * between files, so without this check that is a production wipe launched by
 * `pnpm test`. It was caught once by an unrelated validation error, which is
 * not a control.
 */
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', 'postgres', 'db']);

function assertLocalDatabase(url: string): void {
  const host = (() => {
    try {
      return new URL(url).hostname;
    } catch {
      return '';
    }
  })();

  if (LOCAL_HOSTS.has(host)) return;

  throw new Error(
    `Refusing to TRUNCATE: DATABASE_URL points at "${host || 'an unparseable host'}", ` +
      'which is not a local database. The test suite empties tables between files, so running ' +
      'it against a hosted database would destroy real data. Point .env at docker-compose ' +
      '(localhost:5433) before running tests.',
  );
}

/** Empties every table the suites write to, leaving the schema in place. */
export async function truncateAll(): Promise<void> {
  const admin = await adminDataSource();
  await admin.query(
    'TRUNCATE TABLE "password_reset_tokens", "sso_identities", "onboarding_links", ' +
      '"refresh_tokens", "users", "tenants" CASCADE',
  );
}
