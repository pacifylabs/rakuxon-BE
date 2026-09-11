import 'dotenv/config';

import { DataSource } from 'typeorm';

import { connectWithRetry } from './lib/resilient-db';
import { buildDataSourceOptions } from '../src/database/data-source';
import { Admin } from '../src/modules/admins/entities/admin.entity';
import { AdminPermission } from '../src/modules/admins/entities/admin-permission.entity';
import { Permission } from '../src/modules/admins/entities/permission.entity';
import { PasswordService } from '../src/modules/auth/password.service';
import { UserStatus } from '../src/contract/enums';

/**
 * Creates or refreshes the first admin account.
 *
 *   pnpm admin:seed
 *
 * There is no self-service admin registration anywhere in the app —
 * deliberately — so this script is the only way an admin account comes into
 * existence without another admin already being signed in.
 *
 * Idempotent on email: rerunning never touches an existing password, so this
 * is safe to run again after a deploy. What it *does* do on every run is
 * grant this admin every row currently in the permission catalogue — that is
 * what keeps it fully-privileged as later migrations add new permission
 * keys, without building an auto-granting "superadmin" flag into the app.
 */
async function main(): Promise<void> {
  const email = requireEnv('BOOTSTRAP_ADMIN_EMAIL');
  const password = requireEnv('BOOTSTRAP_ADMIN_PASSWORD');
  const firstName = requireEnv('BOOTSTRAP_ADMIN_FIRST_NAME');
  const lastName = requireEnv('BOOTSTRAP_ADMIN_LAST_NAME');

  const dataSource = new DataSource(buildDataSourceOptions());
  await connectWithRetry(dataSource);

  try {
    const admins = dataSource.getRepository(Admin);
    const permissions = dataSource.getRepository(Permission);

    let admin = await admins.findOne({ where: { email } });

    if (admin) {
      if (admin.status !== UserStatus.Active) {
        admin.status = UserStatus.Active;
        admin = await admins.save(admin);
      }
      process.stdout.write(`Admin already exists: ${email} (password left unchanged).\n`);
    } else {
      const passwordHash = await new PasswordService().hash(password);
      admin = await admins.save(
        admins.create({ email, firstName, lastName, passwordHash, status: UserStatus.Active }),
      );
      process.stdout.write(`Admin created: ${email}\n`);
    }

    const allPermissions = await permissions.find();
    if (allPermissions.length === 0) {
      process.stdout.write('No rows in permissions — run migrations first.\n');
      return;
    }

    await dataSource.query(
      `
        INSERT INTO "admin_permissions" ("adminId", "permissionId")
        SELECT $1, "id" FROM "permissions"
        ON CONFLICT DO NOTHING;
      `,
      [admin.id],
    );

    const granted = await dataSource.getRepository(AdminPermission).count({ where: { adminId: admin.id } });
    process.stdout.write(`${granted} of ${allPermissions.length} permissions granted.\n`);
  } finally {
    await dataSource.destroy();
  }
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `${name} is not set. Set BOOTSTRAP_ADMIN_EMAIL, BOOTSTRAP_ADMIN_PASSWORD, ` +
        'BOOTSTRAP_ADMIN_FIRST_NAME and BOOTSTRAP_ADMIN_LAST_NAME before running this script.',
    );
  }
  return value;
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
