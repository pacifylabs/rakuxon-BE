import { Injectable } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';

/**
 * Thrown when tenant-scoped work is attempted with no tenant established.
 *
 * Row-level security would already return an empty result here, which is safe
 * but indistinguishable from "this agency has no students". Failing instead
 * turns a silent wrong answer into an obvious bug.
 */
export class TenantContextMissingError extends Error {
  constructor(operation: string) {
    super(
      `${operation} needs a tenant, but none is set on this connection. ` +
        'Wrap the work in runInTenantContext(tenantId, ...) — row-level security ' +
        'hides every row until it is.',
    );
    this.name = 'TenantContextMissingError';
  }
}

/**
 * The two ways to reach the database.
 *
 * Both open a transaction, because the settings they rely on are set with
 * `SET LOCAL`: they are discarded at commit or rollback and therefore cannot
 * survive on a pooled connection into somebody else's request. A plain
 * repository call outside either context sets nothing, and the policies then
 * hide every row — which is the intended default.
 */
@Injectable()
export class TenantContext {
  constructor(private readonly dataSource: DataSource) {}

  /**
   * Runs `work` with the tenant established for the whole transaction.
   *
   * set_config with a bound parameter rather than `SET LOCAL x = '...'`: the
   * tenant id arrives from a token, and SET has no parameter form, so the
   * string version would be an injection point into a security setting.
   */
  async runInTenantContext<T>(
    tenantId: string,
    work: (manager: EntityManager) => Promise<T>,
  ): Promise<T> {
    if (!tenantId) throw new TenantContextMissingError('runInTenantContext');

    return this.dataSource.transaction(async (manager) => {
      await manager.query('SELECT set_config($1, $2, true)', ['app.current_tenant', tenantId]);
      return work(manager);
    });
  }

  /**
   * Runs `work` on the identity path: signing in, rotating a refresh token,
   * redeeming an invitation — the lookups that establish who someone is and
   * therefore cannot already know their tenant.
   *
   * This is the one escape from tenant scoping, and it is narrow by
   * construction rather than by discipline: only the credential tables have a
   * policy that honours it. No business table does, so this can never read
   * another agency's students, documents or applications.
   *
   * Reserved for `src/modules/auth` and the onboarding-link redemption; the
   * isolation suite fails the build if it is called anywhere else.
   */
  async runInIdentityContext<T>(work: (manager: EntityManager) => Promise<T>): Promise<T> {
    return this.dataSource.transaction(async (manager) => {
      await manager.query('SELECT set_config($1, $2, true)', ['app.identity_context', 'on']);
      return work(manager);
    });
  }
}
