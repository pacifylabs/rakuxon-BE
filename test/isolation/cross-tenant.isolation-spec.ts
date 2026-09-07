import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';

import { OnboardingLink } from '../../src/modules/onboarding-links/entities/onboarding-link.entity';
import { OnboardingLinksService } from '../../src/modules/onboarding-links/onboarding-links.service';
import { Tenant } from '../../src/modules/tenants/entities/tenant.entity';
import { TenantContext, TenantContextMissingError } from '../../src/common/tenancy/tenant-context';
import { User } from '../../src/modules/users/entities/user.entity';
import { createTestApp, uniqueSlug } from '../helpers/create-test-app';
import { readRoleCapabilities } from '../../src/common/tenancy/rls-enforcement';
import { truncateAll } from '../helpers/admin-data-source';
import { Role, TenantStatus } from '../../src/contract/enums';

/**
 * The gate.
 *
 * Everything here runs against a real Postgres on the real application role.
 * Row-level security is a database feature: a mock, an in-memory driver or a
 * superuser connection would all report success while proving nothing.
 */
describe('cross-tenant isolation', () => {
  let app: INestApplication;
  let tenancy: TenantContext;
  let dataSource: DataSource;

  /** Two agencies, each with an admin and an invitation. */
  let agencyA: { tenantId: string; userId: string; linkId: string };
  let agencyB: { tenantId: string; userId: string; linkId: string };

  beforeAll(async () => {
    ({ app } = await createTestApp());
    tenancy = app.get(TenantContext);
    dataSource = app.get(DataSource);

    await truncateAll();
    agencyA = await seedAgency('Agency A');
    agencyB = await seedAgency('Agency B');
  });

  afterAll(async () => {
    await truncateAll();
    await app?.close();
  });

  /* ------------------------------------------------- the premise, checked */

  describe('the connection the API uses', () => {
    it('cannot bypass row-level security', async () => {
      // Postgres exempts superusers and BYPASSRLS roles unconditionally and
      // silently. Every other test in this file is meaningless without this.
      const capabilities = await readRoleCapabilities(dataSource);

      expect(capabilities.isSuperuser).toBe(false);
      expect(capabilities.bypassesRls).toBe(false);
    });

    it('cannot TRUNCATE, which would ignore every policy', async () => {
      await expect(dataSource.query('TRUNCATE TABLE "users"')).rejects.toThrow(
        /permission denied/i,
      );
    });

    it('cannot alter a policy out of the way', async () => {
      await expect(
        dataSource.query('ALTER TABLE "users" DISABLE ROW LEVEL SECURITY'),
      ).rejects.toThrow(/must be owner|permission denied/i);
    });
  });

  /* ------------------------------------------------------------ the keystone */

  describe('a tenant reading inside its own context', () => {
    it('sees its own users and none of the other agency’s', async () => {
      const rows = await tenancy.runInTenantContext(agencyA.tenantId, (manager) =>
        manager.getRepository(User).find(),
      );

      expect(rows).toHaveLength(1);
      expect(rows[0]?.id).toBe(agencyA.userId);
    });

    it('cannot fetch the other agency’s user by its primary key', async () => {
      // The most direct attempt there is: a known id, asked for by id.
      const found = await tenancy.runInTenantContext(agencyA.tenantId, (manager) =>
        manager.getRepository(User).findOne({ where: { id: agencyB.userId } }),
      );

      expect(found).toBeNull();
    });

    it('cannot reach the other agency’s rows through raw SQL', async () => {
      // Repository methods could in principle add a where clause of their own;
      // this bypasses them entirely so the policy is what is being tested.
      const rows = (await tenancy.runInTenantContext(agencyA.tenantId, (manager) =>
        manager.query('SELECT id FROM users'),
      )) as Array<{ id: string }>;

      expect(rows.map((row) => row.id)).toEqual([agencyA.userId]);
    });

    it('sees only its own tenant row', async () => {
      const rows = await tenancy.runInTenantContext(agencyA.tenantId, (manager) =>
        manager.getRepository(Tenant).find(),
      );

      expect(rows.map((row) => row.id)).toEqual([agencyA.tenantId]);
    });

    it('sees only its own invitations', async () => {
      const rows = await tenancy.runInTenantContext(agencyA.tenantId, (manager) =>
        manager.getRepository(OnboardingLink).find(),
      );

      expect(rows.map((row) => row.id)).toEqual([agencyA.linkId]);
    });

    it('sees no credential rows at all', async () => {
      // refresh_tokens and friends carry no tenant column and are readable
      // only on the identity path, so a business query gets nothing.
      const rows = (await tenancy.runInTenantContext(agencyA.tenantId, (manager) =>
        manager.query('SELECT id FROM refresh_tokens'),
      )) as unknown[];

      expect(rows).toHaveLength(0);
    });
  });

  /* -------------------------------------------------------------- writes */

  describe('a tenant writing inside its own context', () => {
    it('cannot update the other agency’s user', async () => {
      await tenancy.runInTenantContext(agencyA.tenantId, (manager) =>
        manager.getRepository(User).update({ id: agencyB.userId }, { fullName: 'hijacked' }),
      );

      const [{ count }] = (await dataSource.query(
        `SELECT count(*)::int AS count FROM users WHERE "fullName" = 'hijacked'`,
      )) as Array<{ count: number }>;

      // Nothing matched, so nothing changed. The update reports success
      // because zero rows were visible to it — which is the correct shape.
      expect(count).toBe(0);
    });

    it('cannot delete the other agency’s invitation', async () => {
      await tenancy.runInTenantContext(agencyA.tenantId, (manager) =>
        manager.getRepository(OnboardingLink).delete({ id: agencyB.linkId }),
      );

      const stillThere = await tenancy.runInTenantContext(agencyB.tenantId, (manager) =>
        manager.getRepository(OnboardingLink).findOne({ where: { id: agencyB.linkId } }),
      );

      expect(stillThere).not.toBeNull();
    });

    it('cannot insert a row belonging to the other agency', async () => {
      // WITH CHECK, not just USING: without it a tenant could write rows it
      // would then be unable to see.
      await expect(
        tenancy.runInTenantContext(agencyA.tenantId, (manager) =>
          manager.getRepository(User).save(
            manager.getRepository(User).create({
              tenantId: agencyB.tenantId,
              email: `smuggled-${Date.now()}@iso.test`,
              fullName: 'Smuggled',
              role: Role.Counselor,
            }),
          ),
        ),
      ).rejects.toThrow(/row-level security/i);
    });
  });

  /* ------------------------------------------------------- absent context */

  describe('with no tenant established', () => {
    it('a plain repository sees nothing rather than everything', async () => {
      const rows = await dataSource.getRepository(User).find();
      expect(rows).toHaveLength(0);
    });

    it('runInTenantContext refuses an empty tenant instead of running unscoped', async () => {
      await expect(
        tenancy.runInTenantContext('', async () => 'should not run'),
      ).rejects.toBeInstanceOf(TenantContextMissingError);
    });

    it('an insert with no tenant is refused outright', async () => {
      await expect(
        dataSource.getRepository(OnboardingLink).save(
          dataSource.getRepository(OnboardingLink).create({
            tenantId: agencyA.tenantId,
            issuedByUserId: agencyA.userId,
            inviteeEmail: 'nobody@iso.test',
            tokenHash: `hash-${Date.now()}`,
            expiresAt: new Date(Date.now() + 86_400_000),
          }),
        ),
      ).rejects.toThrow(/row-level security/i);
    });
  });

  /* ------------------------------------------------------ context lifetime */

  describe('the context itself', () => {
    it('is set for the duration of the transaction', async () => {
      const [row] = (await tenancy.runInTenantContext(agencyA.tenantId, (manager) =>
        manager.query(`SELECT current_setting('app.current_tenant', true) AS tenant`),
      )) as Array<{ tenant: string }>;

      expect(row.tenant).toBe(agencyA.tenantId);
    });

    it('does not survive the transaction onto the pooled connection', async () => {
      // SET LOCAL, not SET. A leaked setting would hand the next request on
      // this connection someone else's tenant.
      await tenancy.runInTenantContext(agencyA.tenantId, async () => undefined);

      const [row] = (await dataSource.query(
        `SELECT coalesce(current_setting('app.current_tenant', true), '') AS tenant`,
      )) as Array<{ tenant: string }>;

      expect(row.tenant).toBe('');
    });

    it('does not leak the identity context either', async () => {
      await tenancy.runInIdentityContext(async () => undefined);

      const [row] = (await dataSource.query(
        `SELECT coalesce(current_setting('app.identity_context', true), '') AS flag`,
      )) as Array<{ flag: string }>;

      expect(row.flag).toBe('');
    });

    it('rejects a tenant id that is not a uuid rather than matching anything', async () => {
      await expect(
        tenancy.runInTenantContext('not-a-uuid', (manager) =>
          manager.getRepository(User).find(),
        ),
      ).rejects.toThrow(/invalid input syntax for type uuid/i);
    });
  });

  /* -------------------------------------------------- through the service */

  describe('through a real service, not just the helper', () => {
    it('scopes an issued invitation to the issuing agency', async () => {
      const links = app.get(OnboardingLinksService);

      const issued = await links.issue({
        tenantId: agencyA.tenantId,
        issuedByUserId: agencyA.userId,
        inviteeEmail: 'student@iso.test',
      });

      const visibleToB = await tenancy.runInTenantContext(agencyB.tenantId, (manager) =>
        manager.getRepository(OnboardingLink).findOne({ where: { id: issued.id } }),
      );

      expect(visibleToB).toBeNull();
    });

    it('does not revoke another agency’s invitation', async () => {
      const links = app.get(OnboardingLinksService);

      await links.revoke(agencyB.linkId, agencyA.tenantId);

      const target = await tenancy.runInTenantContext(agencyB.tenantId, (manager) =>
        manager.getRepository(OnboardingLink).findOne({ where: { id: agencyB.linkId } }),
      );

      expect(target?.revokedAt).toBeNull();
    });
  });

  /** Seeds one agency on the identity path, the way registration does. */
  async function seedAgency(name: string) {
    return tenancy.runInIdentityContext(async (manager) => {
      const tenant = await manager.getRepository(Tenant).save(
        manager.getRepository(Tenant).create({
          name,
          slug: uniqueSlug('iso'),
          status: TenantStatus.Active,
        }),
      );

      const user = await manager.getRepository(User).save(
        manager.getRepository(User).create({
          tenantId: tenant.id,
          email: `${uniqueSlug('admin')}@iso.test`,
          fullName: `${name} Admin`,
          role: Role.AgencyAdmin,
        }),
      );

      const link = await manager.getRepository(OnboardingLink).save(
        manager.getRepository(OnboardingLink).create({
          tenantId: tenant.id,
          issuedByUserId: user.id,
          inviteeEmail: `invitee-${uniqueSlug()}@iso.test`,
          tokenHash: `seed-${uniqueSlug()}`,
          expiresAt: new Date(Date.now() + 86_400_000),
        }),
      );

      return { tenantId: tenant.id, userId: user.id, linkId: link.id };
    });
  }
});
