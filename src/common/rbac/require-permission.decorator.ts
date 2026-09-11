import { SetMetadata } from '@nestjs/common';

export const REQUIRE_PERMISSION_KEY = 'rbac:permissions';

/**
 * Restricts an admin route to sessions holding every listed permission key.
 * Enforced by PermissionGuard. The admin equivalent of `@Roles()` — kept as
 * its own decorator rather than reused, since it checks a list of keys
 * against `request.admin.permissions`, not a single role against
 * `request.user.role`.
 */
export const RequirePermission = (...keys: string[]) => SetMetadata(REQUIRE_PERMISSION_KEY, keys);
