import { TenantResolutionMiddleware } from './tenant-resolution.middleware';
import type { AuthenticatedRequest } from '../auth/authenticated-request';

describe('TenantResolutionMiddleware', () => {
  const middleware = new TenantResolutionMiddleware();

  const run = (host?: string) => {
    const request = { headers: { host } } as unknown as AuthenticatedRequest;
    const next = jest.fn();
    middleware.use(request, {} as never, next);
    return { request, next };
  };

  it('reads the tenant slug from a subdomain', () => {
    expect(run('acme.rakuxon.com').request.tenantId).toBe('acme');
  });

  it('ignores the port', () => {
    expect(run('acme.rakuxon.com:3001').request.tenantId).toBe('acme');
  });

  it.each(['www', 'api', 'app'])('does not treat %s as a tenant', (label) => {
    expect(run(`${label}.rakuxon.com`).request.tenantId).toBeNull();
  });

  it('resolves nothing for the apex domain', () => {
    expect(run('rakuxon.com').request.tenantId).toBeNull();
  });

  it('resolves nothing for localhost', () => {
    expect(run('localhost:3001').request.tenantId).toBeNull();
  });

  it('resolves nothing when there is no host header at all', () => {
    expect(run(undefined).request.tenantId).toBeNull();
  });

  it('always continues the chain', () => {
    expect(run('acme.rakuxon.com').next).toHaveBeenCalledTimes(1);
    expect(run(undefined).next).toHaveBeenCalledTimes(1);
  });
});
