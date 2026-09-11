import { DataSource } from 'typeorm';

import { buildDataSourceOptions } from '../../src/database/data-source';
import { HOUSE_TENANT_ID } from '../../src/contract/constants';
import { isLocalDatabaseUrl } from './local-database';

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
    /* Never synchronises, even when the app under test does: migrations own the
       schema, and a synchronising owner connection would try to build tables
       before the migration that creates the functions they depend on. */
    shared = new DataSource({ ...options, synchronize: false });
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
function assertLocalDatabase(url: string): void {
  if (isLocalDatabaseUrl(url)) return;

  const host = (() => {
    try {
      return new URL(url).hostname;
    } catch {
      return '';
    }
  })();

  throw new Error(
    `Refusing to TRUNCATE: DATABASE_URL points at "${host || 'an unparseable host'}", ` +
      'which is not a local database. The test suite empties tables between files, so running ' +
      'it against a hosted database would destroy real data. The e2e suite starts its own ' +
      'throwaway Postgres (test/helpers/global-setup.ts); TEST_DATABASE_URL, if set, must be local.',
  );
}

/** Empties every table the suites write to, leaving the schema in place. */
export async function truncateAll(): Promise<void> {
  const admin = await adminDataSource();
  await admin.query(
    'TRUNCATE TABLE "password_reset_tokens", "sso_identities", "onboarding_links", ' +
      /* "students", "documents", "applications" and "application_documents"
         are FK-cascaded from "users"/"tenants" and would empty either way;
         listed explicitly so none is missed if that changes. Same story for
         "admin_refresh_tokens", "admin_password_reset_tokens" and
         "admin_permissions", cascaded from "admins" — "permissions" itself is
         NOT here: it's static catalogue data seeded once by migration, the
         same way an enum type is never truncated. */
      '"refresh_tokens", "users", "students", "documents", "applications", ' +
      '"application_documents", "tenants", "admins", "admin_refresh_tokens", ' +
      '"admin_password_reset_tokens", "admin_permissions" CASCADE',
  );

  /*
   * The house tenant is seed data, not a suite's fixture — a real deployment
   * never truncates it. It only exists via the migration that created it, and
   * TRUNCATE does not know that; re-seeding it here is what keeps direct
   * student registration working in every test file after the first one that
   * truncates.
   */
  await admin.query(
    `INSERT INTO "tenants" ("id", "name", "slug", "status")
     VALUES ($1, 'Rakuxon', 'rakuxon-direct', 'active')
     ON CONFLICT ("id") DO NOTHING`,
    [HOUSE_TENANT_ID],
  );
}
