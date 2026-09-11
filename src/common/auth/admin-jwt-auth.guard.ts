import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';

import { AdminTokenService } from '../../modules/admin-auth/admin-token.service';
import type { AuthenticatedAdminRequest } from './authenticated-admin-request';

/**
 * Bearer-token authentication for admin sessions.
 *
 * Not registered globally, unlike `JwtAuthGuard` — it is applied explicitly
 * with `@UseGuards(AdminJwtAuthGuard, PermissionGuard)` on each admin
 * controller. Every such controller (and every route on it) must also carry
 * `@Public()`: `JwtAuthGuard` runs first as a global guard and would 401 an
 * admin token on the spot, since it is signed with a different secret and
 * verifies against a different one — admin auth is a fully separate identity
 * system, not a bypass of the users-side guard.
 */
@Injectable()
export class AdminJwtAuthGuard implements CanActivate {
  constructor(private readonly tokens: AdminTokenService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedAdminRequest>();
    const header = request.headers.authorization;

    if (!header?.startsWith('Bearer ')) {
      throw new UnauthorizedException('A bearer token is required.');
    }

    try {
      const claims = await this.tokens.verifyAccessToken(header.slice('Bearer '.length));
      request.admin = {
        id: claims.sub,
        email: claims.email,
        permissions: claims.permissions,
      };
      return true;
    } catch {
      throw new UnauthorizedException('That token is invalid or has expired.');
    }
  }
}
