import type { DataSource } from 'typeorm';

/**
 * Thrown at boot when the API's database role can bypass row-level security.
 *
 * Deliberately fatal. The failure it guards against is invisible at runtime:
 * every policy stays in place, every query succeeds, and every tenant reads
 * every other tenant's rows. A crash on line one is the only honest signal.
 */
export class RlsUnenforceableError extends Error {
  constructor(role: string, reasons: string[]) {
    super(
      `The database role "${role}" bypasses row-level security (${reasons.join(', ')}), ` +
        'so tenant isolation is not enforced. Point DATABASE_URL at the application role ' +
        'created by `pnpm db:provision`, and keep owner credentials for migrations only.',
    );
    this.name = 'RlsUnenforceableError';
  }
}

export interface RoleCapabilities {
  role: string;
  isSuperuser: boolean;
  bypassesRls: boolean;
}

/** Reads what the current connection is actually allowed to do. */
export async function readRoleCapabilities(dataSource: DataSource): Promise<RoleCapabilities> {
  const [row] = (await dataSource.query(
    'SELECT current_user AS role, rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user',
  )) as Array<{ role: string; rolsuper: boolean; rolbypassrls: boolean }>;

  if (!row) {
    throw new Error('Could not read the current database role from pg_roles.');
  }

  return { role: row.role, isSuperuser: row.rolsuper, bypassesRls: row.rolbypassrls };
}

/**
 * Refuses to continue unless policies will actually be applied.
 *
 * Postgres exempts superusers and BYPASSRLS roles from row-level security with
 * no warning of any kind, so this is checked rather than assumed.
 */
export async function assertRlsEnforceable(dataSource: DataSource): Promise<void> {
  const capabilities = await readRoleCapabilities(dataSource);
  const reasons: string[] = [];

  if (capabilities.isSuperuser) reasons.push('SUPERUSER');
  if (capabilities.bypassesRls) reasons.push('BYPASSRLS');

  if (reasons.length > 0) {
    throw new RlsUnenforceableError(capabilities.role, reasons);
  }
}
