import type { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { createTestApp } from '../helpers/create-test-app';
import { seedSuperAdminPermissions } from '../../src/database/super-admin-permissions';

describe('Super Admin permission seed', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  beforeAll(async () => {
    ({ app } = await createTestApp());
    dataSource = app.get(DataSource);
  });
  afterAll(async () => { await app?.close(); });

  it('grants every registered permission only to Super Admin and is repeatable', async () => {
    const roles = await dataSource.query<{ id: string; name: string }[]>(
      `INSERT INTO admin_roles (name) VALUES ('Super Admin'), ('Seed test limited') RETURNING id, name`,
    );
    try {
      const expected = await dataSource.query<{ key: string }[]>('SELECT key FROM permissions ORDER BY key');
      expect(await seedSuperAdminPermissions(dataSource)).toBe(expected.length);
      expect(await seedSuperAdminPermissions(dataSource)).toBe(expected.length);
      const grants = await dataSource.query<{ key: string }[]>(
        `SELECT p.key FROM permissions p JOIN admin_role_permissions rp ON rp."permissionId" = p.id
         WHERE rp."roleId" = $1 ORDER BY p.key`, [roles.find(r => r.name === 'Super Admin')!.id],
      );
      expect(grants).toEqual(expected);
      const limited = await dataSource.query(
        `SELECT * FROM admin_role_permissions WHERE "roleId" = $1`,
        [roles.find(r => r.name === 'Seed test limited')!.id],
      );
      expect(limited).toEqual([]);
    } finally {
      await dataSource.query('DELETE FROM admin_roles WHERE id = ANY($1)', [roles.map(r => r.id)]);
    }
  });
});
