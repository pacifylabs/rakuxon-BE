import type { Request } from 'express';

import type { Role } from '../../contract/enums';

export interface AuthenticatedUser {
  id: string;
  email: string;
  role: Role;
  /** Null for platform_admin. Never taken from the request body. */
  tenantId: string | null;
}

export interface AuthenticatedRequest extends Request {
  user?: AuthenticatedUser;
  /** Set by TenantResolutionMiddleware from the token or the subdomain. */
  tenantId?: string | null;
}
