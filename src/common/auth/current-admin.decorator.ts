import { createParamDecorator, ExecutionContext } from '@nestjs/common';

import type { AuthenticatedAdmin, AuthenticatedAdminRequest } from './authenticated-admin-request';

/** The authenticated admin, as established by AdminJwtAuthGuard. */
export const CurrentAdmin = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedAdmin => {
    const request = context.switchToHttp().getRequest<AuthenticatedAdminRequest>();
    if (!request.admin) {
      /* Reaching here means the route escaped AdminJwtAuthGuard — a wiring
         bug, not a client error, so it should be loud rather than a silent
         undefined. */
      throw new Error('CurrentAdmin used on a route that is not authenticated.');
    }
    return request.admin;
  },
);
