import { Injectable, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Response } from 'express';

import type { AuthenticatedRequest } from '../auth/authenticated-request';

/**
 * Establishes which tenant a request belongs to, before any business logic.
 *
 * Two sources, in order: the verified access token, then the request subdomain.
 * A client-supplied field is never one of them — docs/07-api-contract.md is
 * explicit that tenant is derived server-side, and the global validation pipe
 * rejects a body carrying one.
 *
 * This runs before the auth guard, so it can only read the subdomain here; the
 * guard fills in the token's tenant afterwards. Where the two disagree the
 * token wins, because it is signed and the Host header is not.
 */
@Injectable()
export class TenantResolutionMiddleware implements NestMiddleware {
  use(request: AuthenticatedRequest, _response: Response, next: NextFunction): void {
    request.tenantId = this.slugFromHost(request.headers.host) ?? null;
    next();
  }

  /** `acme.rakuxon.com` -> `acme`. Ignores bare hosts and localhost. */
  private slugFromHost(host?: string): string | null {
    if (!host) return null;

    const hostname = host.split(':')[0] ?? '';
    const labels = hostname.split('.');

    if (labels.length < 3) return null;

    const [slug] = labels;
    if (!slug || ['www', 'api', 'app'].includes(slug)) return null;

    return slug;
  }
}
