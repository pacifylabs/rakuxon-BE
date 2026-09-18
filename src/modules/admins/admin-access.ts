import type { EntityManager } from 'typeorm';

/** Assigned roles replace legacy direct grants, so stale grants can never add access. */
export async function adminPermissionKeys(
  manager: EntityManager,
  adminId: string,
): Promise<string[]> {
  const rows: { key: string }[] = await manager.query(
    `
    SELECT p.key FROM permissions p
    JOIN admins a ON a.id = $1
    WHERE (a."roleId" IS NOT NULL AND EXISTS (
      SELECT 1 FROM admin_role_permissions rp WHERE rp."roleId" = a."roleId" AND rp."permissionId" = p.id
    )) OR (a."roleId" IS NULL AND EXISTS (
      SELECT 1 FROM admin_permissions ap WHERE ap."adminId" = a.id AND ap."permissionId" = p.id
    )) ORDER BY p.key`,
    [adminId],
  );
  return rows.map((row) => row.key);
}
