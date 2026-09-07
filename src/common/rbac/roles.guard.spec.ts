import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { ExecutionContext } from '@nestjs/common';

import { Role } from '../../contract/enums';
import { RolesGuard } from './roles.guard';

function contextFor(role?: Role): ExecutionContext {
  return {
    getHandler: () => () => undefined,
    getClass: () => class {},
    switchToHttp: () => ({ getRequest: () => (role ? { user: { role } } : {}) }),
  } as unknown as ExecutionContext;
}

describe('RolesGuard', () => {
  function guardRequiring(required?: Role[]) {
    const reflector = new Reflector();
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(required);
    return new RolesGuard(reflector);
  }

  it('allows a route with no role requirement', () => {
    expect(guardRequiring(undefined).canActivate(contextFor(Role.Counselor))).toBe(true);
  });

  it('allows a role that is listed', () => {
    const guard = guardRequiring([Role.AgencyAdmin, Role.Counselor]);
    expect(guard.canActivate(contextFor(Role.Counselor))).toBe(true);
  });

  it('refuses a counselor on an agency_admin route', () => {
    const guard = guardRequiring([Role.AgencyAdmin]);
    expect(() => guard.canActivate(contextFor(Role.Counselor))).toThrow(ForbiddenException);
  });

  it('refuses an unauthenticated request rather than defaulting open', () => {
    const guard = guardRequiring([Role.AgencyAdmin]);
    expect(() => guard.canActivate(contextFor(undefined))).toThrow(ForbiddenException);
  });

  it('treats an empty requirement list as no requirement', () => {
    expect(guardRequiring([]).canActivate(contextFor(Role.Student))).toBe(true);
  });
});
