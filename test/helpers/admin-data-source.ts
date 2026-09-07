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
    shared = new DataSource(buildDataSourceOptions(undefined, { admin: true }));
    await shared.initialize();
  }

  return shared;
}

export async function closeAdminDataSource(): Promise<void> {
  await shared?.destroy();
  shared = undefined;
}

/** Empties every table the suites write to, leaving the schema in place. */
export async function truncateAll(): Promise<void> {
  const admin = await adminDataSource();
  await admin.query(
    'TRUNCATE TABLE "password_reset_tokens", "sso_identities", "onboarding_links", ' +
      '"refresh_tokens", "users", "tenants" CASCADE',
  );
}
