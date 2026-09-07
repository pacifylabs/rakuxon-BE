import { DataSource } from 'typeorm';

import { RlsUnenforceableError, assertRlsEnforceable, readRoleCapabilities } from './rls-enforcement';

/** A DataSource whose pg_roles row says whatever the test needs. */
const withRole = (row: unknown) =>
  ({ query: jest.fn(async () => (row ? [row] : [])) }) as unknown as DataSource;

describe('assertRlsEnforceable', () => {
  it('accepts an ordinary role', async () => {
    await expect(
      assertRlsEnforceable(withRole({ role: 'rakuxon_app', rolsuper: false, rolbypassrls: false })),
    ).resolves.toBeUndefined();
  });

  it('refuses a superuser', async () => {
    // Postgres exempts superusers from row-level security with no warning of
    // any kind: every policy stays in place and stops applying.
    await expect(
      assertRlsEnforceable(withRole({ role: 'postgres', rolsuper: true, rolbypassrls: false })),
    ).rejects.toBeInstanceOf(RlsUnenforceableError);
  });

  it('refuses a BYPASSRLS role even when it is not a superuser', async () => {
    await expect(
      assertRlsEnforceable(withRole({ role: 'replica', rolsuper: false, rolbypassrls: true })),
    ).rejects.toBeInstanceOf(RlsUnenforceableError);
  });

  it('names the role and the reason, so the misconfiguration is actionable', async () => {
    await expect(
      assertRlsEnforceable(withRole({ role: 'postgres', rolsuper: true, rolbypassrls: true })),
    ).rejects.toThrow(/"postgres".*SUPERUSER, BYPASSRLS/s);
  });

  it('points at the fix rather than only the fault', async () => {
    await expect(
      assertRlsEnforceable(withRole({ role: 'postgres', rolsuper: true, rolbypassrls: false })),
    ).rejects.toThrow(/db:provision/);
  });

  it('fails loudly when the role cannot be read at all', async () => {
    // Silence here would be indistinguishable from "the check passed".
    await expect(readRoleCapabilities(withRole(null))).rejects.toThrow(/pg_roles/);
  });
});
