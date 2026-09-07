import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

import { DataSource } from 'typeorm';

import { adminDataSource } from '../helpers/admin-data-source';

/**
 * The part of the gate that protects work not yet written.
 *
 * The cross-tenant suite proves today's tables are isolated. These checks
 * fail when a *future* migration adds a tenant-scoped table and forgets a
 * policy, or when the identity escape hatch starts spreading — the two ways
 * this stage's guarantee decays quietly once nobody is looking at it.
 */
describe('policy coverage', () => {
  let admin: DataSource;

  beforeAll(async () => {
    admin = await adminDataSource();
    await admin.runMigrations();
  });

  it('protects every table that carries a tenant column', async () => {
    const unprotected = (await admin.query(`
      SELECT c.relname AS table
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public'
         AND c.relkind = 'r'
         AND EXISTS (
           SELECT 1 FROM information_schema.columns col
            WHERE col.table_schema = 'public'
              AND col.table_name = c.relname
              AND col.column_name = 'tenantId'
         )
         AND NOT (c.relrowsecurity AND c.relforcerowsecurity)
    `)) as Array<{ table: string }>;

    // A new table with a tenantId and no policy is readable by every agency.
    expect(unprotected.map((row) => row.table)).toEqual([]);
  });

  it('leaves no table in the schema without row-level security', async () => {
    const open = (await admin.query(`
      SELECT c.relname AS table
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public'
         AND c.relkind = 'r'
         AND c.relname <> 'migrations'
         AND NOT (c.relrowsecurity AND c.relforcerowsecurity)
    `)) as Array<{ table: string }>;

    // `migrations` is deliberately exempt: it holds no tenant data and the
    // runtime role has no grant on it at all.
    expect(open.map((row) => row.table)).toEqual([]);
  });

  it('gives every protected table at least one policy', async () => {
    const policyless = (await admin.query(`
      SELECT c.relname AS table
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public'
         AND c.relkind = 'r'
         AND c.relrowsecurity
         AND NOT EXISTS (SELECT 1 FROM pg_policy p WHERE p.polrelid = c.oid)
    `)) as Array<{ table: string }>;

    // RLS enabled with no policy denies everything, which is safe but breaks
    // the feature rather than isolating it.
    expect(policyless.map((row) => row.table)).toEqual([]);
  });

  it('keeps the identity escape hatch on the credential tables only', async () => {
    const escaping = (await admin.query(`
      SELECT DISTINCT c.relname AS table
        FROM pg_policy p
        JOIN pg_class c ON c.oid = p.polrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public'
         AND pg_get_expr(p.polqual, p.polrelid) LIKE '%in_identity_context%'
       ORDER BY 1
    `)) as Array<{ table: string }>;

    /*
     * Widening this list widens the one exemption the whole model grants, so
     * it is asserted rather than described. A business table appearing here
     * would mean the auth path can read another agency's records.
     */
    expect(escaping.map((row) => row.table)).toEqual([
      'onboarding_links',
      'password_reset_tokens',
      'refresh_tokens',
      'sso_identities',
      'tenants',
      'users',
    ]);
  });

  it('grants the runtime role no more than the four statements it needs', async () => {
    const excessive = (await admin.query(`
      SELECT table_name AS table, privilege_type AS privilege
        FROM information_schema.role_table_grants
       WHERE grantee = $1
         AND privilege_type NOT IN ('SELECT', 'INSERT', 'UPDATE', 'DELETE')
       ORDER BY 1, 2
    `, [process.env.DATABASE_APP_USER ?? 'rakuxon_app'])) as Array<{
      table: string;
      privilege: string;
    }>;

    // TRUNCATE and REFERENCES both sidestep row-level security.
    expect(excessive).toEqual([]);
  });

  it('calls the identity context only from the identity path', () => {
    /*
     * The one rule a policy cannot express. runInIdentityContext is the single
     * exemption from tenant scoping; it belongs to sign-in, token rotation and
     * invitation redemption, and nowhere else. A new module reaching for it is
     * a decision that should be argued for in review, not made by autocomplete.
     */
    const allowed = [
      'src/common/tenancy/tenant-context.ts',
      'src/modules/auth/auth.service.ts',
      'src/modules/onboarding-links/onboarding-links.service.ts',
    ];

    const callers = sourceFiles(join(__dirname, '../../src'))
      .filter((file) => readFileSync(file, 'utf8').includes('runInIdentityContext'))
      .map((file) => relative(join(__dirname, '../..'), file))
      .sort();

    expect(callers).toEqual(allowed);
  });
});

/** Every .ts file under a directory, tests excluded. */
function sourceFiles(root: string): string[] {
  return readdirSync(root).flatMap((entry) => {
    const path = join(root, entry);

    if (statSync(path).isDirectory()) return sourceFiles(path);
    if (!path.endsWith('.ts') || path.endsWith('.spec.ts')) return [];

    return [path];
  });
}
