import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { REQUIRE_PERMISSION_KEY } from './require-permission.decorator';
import type { AuthenticatedAdminRequest } from '../auth/authenticated-admin-request';

/**
 * Permission check for admin routes — requires every listed key, not just
 * one. Applied alongside AdminJwtAuthGuard, which populates
 * `request.admin.permissions`; this guard never queries the database itself,
 * since the permission list already travels inside the access token.
 */
@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string[] | undefined>(REQUIRE_PERMISSION_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!required || required.length === 0) return true;

    const request = context.switchToHttp().getRequest<AuthenticatedAdminRequest>();
    const held = new Set(request.admin?.permissions ?? []);

    const missing = required.filter((key) => !held.has(key));
    if (missing.length > 0) {
      throw new ForbiddenException(`Missing permission${missing.length > 1 ? 's' : ''}: ${missing.join(', ')}.`);
    }

    return true;
  }
}
