import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { IS_PUBLIC_KEY } from './public.decorator';
import { TokenService } from '../../modules/auth/token.service';
import type { AuthenticatedRequest } from './authenticated-request';

/**
 * Bearer-token authentication.
 *
 * Registered globally, so a route is protected unless it opts out with
 * @Public(). Defaulting to closed means forgetting a decorator produces a 401,
 * not an open endpoint.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokens: TokenService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const header = request.headers.authorization;

    if (!header?.startsWith('Bearer ')) {
      throw new UnauthorizedException('A bearer token is required.');
    }

    try {
      const claims = await this.tokens.verifyAccessToken(header.slice('Bearer '.length));
      request.user = {
        id: claims.sub,
        email: claims.email,
        role: claims.role,
        tenantId: claims.tid,
      };
      return true;
    } catch {
      throw new UnauthorizedException('That token is invalid or has expired.');
    }
  }
}
