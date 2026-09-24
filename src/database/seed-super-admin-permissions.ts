import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { buildDataSourceOptions } from './data-source';
import { seedSuperAdminPermissions } from './super-admin-permissions';

async function main(): Promise<void> {
  const dataSource = new DataSource({ ...buildDataSourceOptions(), synchronize: false });
  await dataSource.initialize();
  try {
    const count = await seedSuperAdminPermissions(dataSource);
    process.stdout.write(`Super Admin has all ${count} registered permissions.\n`);
  } finally {
    await dataSource.destroy();
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
