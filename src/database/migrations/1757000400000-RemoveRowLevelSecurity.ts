import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Removes row-level security, moving tenant scoping into application code.
 *
 * Why, recorded here because the reasoning matters more than the diff:
 *
 * The policies were written when every tenant's data was private. That model
 * changed — students, documents and applications are shared platform-wide by
 * design — so the only rows RLS still protected were staff accounts,
 * invitations and billing, which a `where tenantId = ...` in a service covers
 * just as well. The remaining guarantee stopped justifying a second database
 * role, a boot assertion, session-variable plumbing on every query, and a
 * provisioning step in every new environment.
 *
 * What replaces it: services filter explicitly, and tests assert they do. That
 * is a weaker guarantee honestly stated, rather than a strong one that had
 * quietly been reduced to protecting very little.
 *
 * Forward-only, per docs/05-deploy-guide.md — the policies are dropped by a new
 * migration rather than by editing the one that created them, so any database
 * already carrying them converges on the same schema.
 */
export class RemoveRowLevelSecurity1757000400000 implements MigrationInterface {
  name = 'RemoveRowLevelSecurity1757000400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const table of TENANT_TABLES) {
      await queryRunner.query(`DROP POLICY IF EXISTS "${table}_tenant_isolation" ON "${table}"`);
    }
    for (const table of IDENTITY_ONLY_TABLES) {
      await queryRunner.query(`DROP POLICY IF EXISTS "${table}_identity_only" ON "${table}"`);
    }

    for (const table of [...TENANT_TABLES, ...IDENTITY_ONLY_TABLES]) {
      await queryRunner.query(`ALTER TABLE "${table}" NO FORCE ROW LEVEL SECURITY`);
      await queryRunner.query(`ALTER TABLE "${table}" DISABLE ROW LEVEL SECURITY`);
    }

    /* The helper schema goes with the policies that were its only callers. */
    await queryRunner.query('DROP FUNCTION IF EXISTS "rls"."in_identity_context"()');
    await queryRunner.query('DROP FUNCTION IF EXISTS "rls"."current_tenant"()');
    await queryRunner.query('DROP SCHEMA IF EXISTS "rls"');
  }

  public async down(): Promise<void> {
    /*
     * Deliberately not reversible.
     *
     * Re-enabling the policies without the application role, the boot
     * assertion and the context helpers would leave tables that deny every
     * row to a connection that sets no tenant — an outage presented as a
     * rollback. Restoring this model means restoring all of it, which is a
     * decision rather than a `migration:revert`.
     */
    throw new Error(
      'RemoveRowLevelSecurity is not reversible. Re-enabling policies without the application ' +
        'role and tenant-context helpers would deny every row to the API. Restore the full ' +
        'model deliberately if it is wanted again.',
    );
  }
}

const TENANT_TABLES = ['tenants', 'users', 'onboarding_links'] as const;
const IDENTITY_ONLY_TABLES = ['refresh_tokens', 'password_reset_tokens', 'sso_identities'] as const;
