import type { DataSource } from 'typeorm';

/** Refresh the existing full-access role without changing accounts or other roles. */
export async function seedSuperAdminPermissions(dataSource: DataSource): Promise<number> {
  return dataSource.transaction(async (manager) => {
    await manager.query('SELECT pg_advisory_xact_lock(1757003300)');
    const [role] = await manager.query<{ id: string }[]>(
      `SELECT id FROM admin_roles WHERE name = $1`, ['Super Admin'],
    );
    if (!role) throw new Error('Super Admin role is missing. Run admin:seed to bootstrap the account first.');
    await manager.query(
      `INSERT INTO admin_role_permissions ("roleId", "permissionId")
       SELECT $1, id FROM permissions ON CONFLICT DO NOTHING`, [role.id],
    );
    const [row] = await manager.query<{ count: string }[]>('SELECT count(*) FROM permissions');
    return Number(row.count);
  });
}
