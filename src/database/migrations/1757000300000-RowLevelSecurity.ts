import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * The isolation gate, in the database.
 *
 * Every guarantee here rests on one fact: the API connects as a role that is
 * neither a superuser nor BYPASSRLS. Postgres exempts both unconditionally, so
 * a policy written against a superuser connection is decoration. `main.ts`
 * asserts this at boot; `scripts/provision-app-role.ts` creates the role.
 *
 * Two contexts exist, both set with `SET LOCAL` so they die with the
 * transaction and cannot leak to the next request on a pooled connection:
 *
 *   app.current_tenant   — the normal path. Set by runInTenantContext().
 *   app.identity_context — the narrow escape, for the lookups that happen
 *                          *before* a tenant is known: signing in, rotating a
 *                          refresh token, redeeming an invitation.
 *
 * The escape is scoped by construction, not by convention. It appears only in
 * the policies for the credential-bearing tables listed in IDENTITY_TABLES.
 * Business tables added from stage 3 onward get the strict policy and no
 * escape, so abusing the identity context can never read another agency's
 * students, documents or applications.
 */
export class RowLevelSecurity1757000300000 implements MigrationInterface {
  name = 'RowLevelSecurity1757000300000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const appRole = process.env.DATABASE_APP_USER ?? 'rakuxon_app';

    /* Own schema, so the application role cannot CREATE OR REPLACE its way
       around a policy by shadowing the helpers. */
    await queryRunner.query(`
      CREATE SCHEMA IF NOT EXISTS "rls";
      REVOKE CREATE ON SCHEMA "rls" FROM PUBLIC;
      GRANT USAGE ON SCHEMA "rls" TO PUBLIC;
    `);

    /* nullif before the cast: an empty setting is "no tenant", and ''::uuid
       raises rather than returning NULL, which would turn a missing context
       into a 500 instead of an empty result. */
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION "rls"."current_tenant"() RETURNS uuid
        LANGUAGE sql STABLE
        AS $fn$
          SELECT nullif(current_setting('app.current_tenant', true), '')::uuid
        $fn$;

      CREATE OR REPLACE FUNCTION "rls"."in_identity_context"() RETURNS boolean
        LANGUAGE sql STABLE
        AS $fn$
          SELECT coalesce(current_setting('app.identity_context', true), '') = 'on'
        $fn$;
    `);

    for (const table of TENANT_TABLES) {
      await this.enableRls(queryRunner, table.name);
      await queryRunner.query(`
        CREATE POLICY "${table.name}_tenant_isolation" ON "${table.name}"
          USING (${table.tenantColumn} = "rls"."current_tenant"() OR "rls"."in_identity_context"())
          WITH CHECK (${table.tenantColumn} = "rls"."current_tenant"() OR "rls"."in_identity_context"());
      `);
    }

    for (const name of IDENTITY_ONLY_TABLES) {
      await this.enableRls(queryRunner, name);
      /* No tenant column to key off. These carry credentials and are only ever
         read on the identity path, so anything else sees nothing at all. */
      await queryRunner.query(`
        CREATE POLICY "${name}_identity_only" ON "${name}"
          USING ("rls"."in_identity_context"())
          WITH CHECK ("rls"."in_identity_context"());
      `);
    }

    await this.grantToAppRole(queryRunner, appRole);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const table of TENANT_TABLES) {
      await queryRunner.query(`DROP POLICY IF EXISTS "${table.name}_tenant_isolation" ON "${table.name}"`);
      await queryRunner.query(`ALTER TABLE "${table.name}" NO FORCE ROW LEVEL SECURITY`);
      await queryRunner.query(`ALTER TABLE "${table.name}" DISABLE ROW LEVEL SECURITY`);
    }

    for (const name of IDENTITY_ONLY_TABLES) {
      await queryRunner.query(`DROP POLICY IF EXISTS "${name}_identity_only" ON "${name}"`);
      await queryRunner.query(`ALTER TABLE "${name}" NO FORCE ROW LEVEL SECURITY`);
      await queryRunner.query(`ALTER TABLE "${name}" DISABLE ROW LEVEL SECURITY`);
    }

    await queryRunner.query(`
      DROP FUNCTION IF EXISTS "rls"."in_identity_context"();
      DROP FUNCTION IF EXISTS "rls"."current_tenant"();
      DROP SCHEMA IF EXISTS "rls";
    `);
  }

  /**
   * FORCE as well as ENABLE.
   *
   * ENABLE alone exempts the table owner, and the owner is the role that runs
   * migrations — so a deployment that ever pointed the API at the migration
   * credentials would lose every policy silently.
   */
  private async enableRls(queryRunner: QueryRunner, table: string): Promise<void> {
    await queryRunner.query(`ALTER TABLE "${table}" ENABLE ROW LEVEL SECURITY`);
    await queryRunner.query(`ALTER TABLE "${table}" FORCE ROW LEVEL SECURITY`);
  }

  /**
   * Exactly the four statements the API needs, and nothing else.
   *
   * TRUNCATE is deliberately withheld: it ignores row-level security entirely,
   * so granting it would hand every tenant a cross-tenant delete. Tests that
   * need to empty a table use the migration connection instead.
   */
  private async grantToAppRole(queryRunner: QueryRunner, appRole: string): Promise<void> {
    if (!/^[a-z_][a-z0-9_]*$/.test(appRole)) {
      throw new Error(
        `DATABASE_APP_USER "${appRole}" is not a plain identifier. This name is interpolated ` +
          'into DDL, where a bound parameter is not available, so it is restricted rather than escaped.',
      );
    }

    const [role] = (await queryRunner.query('SELECT rolname FROM pg_roles WHERE rolname = $1', [
      appRole,
    ])) as Array<{ rolname: string }>;

    if (!role) {
      throw new Error(
        `Database role "${appRole}" does not exist. Run \`pnpm db:provision\` before migrating: ` +
          'row-level security is unenforceable without a non-superuser application role.',
      );
    }

    const tables = [...TENANT_TABLES.map((table) => table.name), ...IDENTITY_ONLY_TABLES]
      .map((name) => `"${name}"`)
      .join(', ');

    await queryRunner.query(`GRANT USAGE ON SCHEMA public TO "${appRole}"`);
    await queryRunner.query(`GRANT SELECT, INSERT, UPDATE, DELETE ON ${tables} TO "${appRole}"`);
  }
}

/** Tables carrying a tenant column, isolated by it. */
const TENANT_TABLES: ReadonlyArray<{ name: string; tenantColumn: string }> = [
  { name: 'tenants', tenantColumn: '"id"' },
  { name: 'users', tenantColumn: '"tenantId"' },
  { name: 'onboarding_links', tenantColumn: '"tenantId"' },
];

/**
 * Credential tables with no tenant column, reachable only on the identity path.
 *
 * This list is asserted in the isolation suite. Growing it widens the escape
 * hatch, so it should not grow without a deliberate decision.
 */
const IDENTITY_ONLY_TABLES: readonly string[] = [
  'refresh_tokens',
  'password_reset_tokens',
  'sso_identities',
];
