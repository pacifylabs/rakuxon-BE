import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { ROLES_KEY } from './roles.decorator';
import type { Role } from '../../contract/enums';
import type { AuthenticatedRequest } from '../auth/authenticated-request';

/**
 * Role check.
 *
 * Deliberately only answers "may this role reach this route". Whether a
 * counselor may see *this particular student* is data scoping, enforced in the
 * services and ultimately by row-level security — a role guard cannot know it,
 * and pretending otherwise is how authorisation bugs happen.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!required || required.length === 0) return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const role = request.user?.role;

    if (!role || !required.includes(role)) {
      throw new ForbiddenException('Your role does not have access to this resource.');
    }

    return true;
  }
}
