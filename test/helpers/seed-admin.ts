import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource, In } from 'typeorm';

import { Admin } from '../../src/modules/admins/entities/admin.entity';
import { AdminPermission } from '../../src/modules/admins/entities/admin-permission.entity';
import { Permission } from '../../src/modules/admins/entities/permission.entity';
import { PasswordService } from '../../src/modules/auth/password.service';
import { UserStatus } from '../../src/contract/enums';

const PASSWORD = 'correct-horse-battery';

/**
 * Inserts an admin directly (mirroring how the bootstrap script and
 * `AdminsService.create` do it — there is no self-service admin
 * registration to call instead), grants the given permission keys, then logs
 * in for real through `POST /v1/admin-auth/login` so tests exercise the
 * actual token-issuing path rather than a hand-signed JWT.
 */
export async function seedAdminSession(
  app: INestApplication,
  permissionKeys: string[] = [],
): Promise<{ adminId: string; token: string; email: string }> {
  const dataSource = app.get(DataSource);
  const admins = dataSource.getRepository(Admin);
  const email = `admin-${Math.random().toString(36).slice(2, 10)}@example.com`;

  const admin = await admins.save(
    admins.create({
      email,
      firstName: 'Test',
      lastName: 'Admin',
      passwordHash: await new PasswordService().hash(PASSWORD),
      status: UserStatus.Active,
    }),
  );

  if (permissionKeys.length > 0) {
    const permissions = await dataSource.getRepository(Permission).find({ where: { key: In(permissionKeys) } });
    if (permissions.length !== permissionKeys.length) {
      const found = new Set(permissions.map((permission) => permission.key));
      const missing = permissionKeys.filter((key) => !found.has(key));
      throw new Error(`seedAdminSession: unknown permission key(s): ${missing.join(', ')}`);
    }

    const adminPermissions = dataSource.getRepository(AdminPermission);
    await adminPermissions.save(
      permissions.map((permission) => adminPermissions.create({ adminId: admin.id, permissionId: permission.id })),
    );
  }

  const login = await request(app.getHttpServer())
    .post('/v1/admin-auth/login')
    .send({ email, password: PASSWORD })
    .expect(200);

  return { adminId: admin.id, token: login.body.accessToken, email };
}
