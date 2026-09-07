import { createParamDecorator, ExecutionContext } from '@nestjs/common';

import type { AuthenticatedRequest, AuthenticatedUser } from './authenticated-request';

/** The authenticated user, as established by JwtAuthGuard. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedUser => {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!request.user) {
      /* Reaching here means the route escaped JwtAuthGuard — a wiring bug, not
         a client error, so it should be loud rather than a silent undefined. */
      throw new Error('CurrentUser used on a route that is not authenticated.');
    }
    return request.user;
  },
);
