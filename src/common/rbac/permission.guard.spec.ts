import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { ExecutionContext } from '@nestjs/common';

import { PermissionGuard } from './permission.guard';

function contextFor(permissions?: string[]): ExecutionContext {
  return {
    getHandler: () => () => undefined,
    getClass: () => class {},
    switchToHttp: () => ({ getRequest: () => (permissions ? { admin: { permissions } } : {}) }),
  } as unknown as ExecutionContext;
}

describe('PermissionGuard', () => {
  function guardRequiring(required?: string[]) {
    const reflector = new Reflector();
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(required);
    return new PermissionGuard(reflector);
  }

  it('allows a route with no permission requirement', () => {
    expect(guardRequiring(undefined).canActivate(contextFor(['tenants.view']))).toBe(true);
  });

  it('allows an admin holding the required permission', () => {
    const guard = guardRequiring(['tenants.approve']);
    expect(guard.canActivate(contextFor(['tenants.view', 'tenants.approve']))).toBe(true);
  });

  it('refuses an admin missing the required permission', () => {
    const guard = guardRequiring(['tenants.approve']);
    expect(() => guard.canActivate(contextFor(['tenants.view']))).toThrow(ForbiddenException);
  });

  it('requires every listed key, not just one', () => {
    const guard = guardRequiring(['tenants.view', 'tenants.approve']);
    expect(() => guard.canActivate(contextFor(['tenants.view']))).toThrow(ForbiddenException);
    expect(guard.canActivate(contextFor(['tenants.view', 'tenants.approve']))).toBe(true);
  });

  it('refuses an unauthenticated request rather than defaulting open', () => {
    const guard = guardRequiring(['tenants.view']);
    expect(() => guard.canActivate(contextFor(undefined))).toThrow(ForbiddenException);
  });

  it('treats an empty requirement list as no requirement', () => {
    expect(guardRequiring([]).canActivate(contextFor([]))).toBe(true);
  });
});
