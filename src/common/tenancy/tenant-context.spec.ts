import { DataSource, EntityManager } from 'typeorm';

import { TenantContext, TenantContextMissingError } from './tenant-context';

/**
 * The database proves the isolation; these cover the shape of the helper —
 * that it opens a transaction, binds the setting to it, and passes the tenant
 * as a parameter rather than splicing it into SQL.
 */
describe('TenantContext', () => {
  const TENANT = '11111111-1111-4111-8111-111111111111';

  let queries: Array<{ sql: string; parameters?: unknown[] }>;
  let manager: EntityManager;
  let dataSource: DataSource;

  beforeEach(() => {
    queries = [];
    manager = {
      query: jest.fn(async (sql: string, parameters?: unknown[]) => {
        queries.push({ sql, parameters });
        return [];
      }),
    } as unknown as EntityManager;

    dataSource = {
      transaction: jest.fn(async (work: (m: EntityManager) => Promise<unknown>) => work(manager)),
    } as unknown as DataSource;
  });

  const context = () => new TenantContext(dataSource);

  describe('runInTenantContext', () => {
    it('refuses an empty tenant rather than running unscoped', async () => {
      // Falling through with no tenant would return an empty result that reads
      // exactly like "this agency has no records".
      await expect(context().runInTenantContext('', async () => 'ran')).rejects.toBeInstanceOf(
        TenantContextMissingError,
      );

      expect(dataSource.transaction).not.toHaveBeenCalled();
    });

    it('names the operation in the error, so the fix is obvious', async () => {
      await expect(context().runInTenantContext('', async () => 'ran')).rejects.toThrow(
        /runInTenantContext/,
      );
    });

    it('runs the work inside a transaction', async () => {
      await context().runInTenantContext(TENANT, async () => undefined);
      expect(dataSource.transaction).toHaveBeenCalledTimes(1);
    });

    it('passes the tenant as a parameter, never as SQL text', async () => {
      await context().runInTenantContext(TENANT, async () => undefined);

      // The tenant arrives from a token. `SET LOCAL x = '...'` takes no
      // parameters, which is why set_config is used instead.
      expect(queries[0]?.sql).toContain('set_config');
      expect(queries[0]?.parameters).toEqual(['app.current_tenant', TENANT]);
      expect(queries[0]?.sql).not.toContain(TENANT);
    });

    it('scopes the setting to the transaction', async () => {
      await context().runInTenantContext(TENANT, async () => undefined);

      // The third argument to set_config is is_local. Without it the setting
      // outlives the request on a pooled connection.
      expect(queries[0]?.sql).toMatch(/set_config\(\$1, \$2, true\)/);
    });

    it('returns whatever the work returns', async () => {
      await expect(context().runInTenantContext(TENANT, async () => 'result')).resolves.toBe(
        'result',
      );
    });

    it('sets the tenant before the work runs', async () => {
      const order: string[] = [];
      (manager.query as jest.Mock).mockImplementation(async () => {
        order.push('set_config');
        return [];
      });

      await context().runInTenantContext(TENANT, async () => {
        order.push('work');
      });

      expect(order).toEqual(['set_config', 'work']);
    });
  });

  describe('runInIdentityContext', () => {
    it('sets the identity flag, transaction-local', async () => {
      await context().runInIdentityContext(async () => undefined);

      expect(queries[0]?.parameters).toEqual(['app.identity_context', 'on']);
      expect(queries[0]?.sql).toMatch(/set_config\(\$1, \$2, true\)/);
    });

    it('does not set a tenant, because there is not one yet', async () => {
      await context().runInIdentityContext(async () => undefined);

      const set = queries.map((entry) => entry.parameters?.[0]);
      expect(set).not.toContain('app.current_tenant');
    });
  });
});
