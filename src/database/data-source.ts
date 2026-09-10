import 'dotenv/config';

import { DataSource } from 'typeorm';
import type { DataSourceOptions } from 'typeorm';

import { validateEnv } from '../common/config/env.schema';

/**
 * TypeORM configuration.
 *
 * Synchronization is opt-in through DATABASE_SYNCHRONIZE. The migration CLI
 * always disables it so migrations execute against their expected schema.
 */
export function buildDataSourceOptions(
  env = validateEnv(process.env),
  /**
   * Migrations need DDL rights the runtime role deliberately does not have,
   * so the CLI connects as the owner. The application never does — see the
   * note on DATABASE_URL in env.schema.ts.
   */
): DataSourceOptions {
  return {
    type: 'postgres',
    url: env.DATABASE_URL,
    ssl: env.DATABASE_SSL ? { rejectUnauthorized: false } : false,
    synchronize: env.DATABASE_SYNCHRONIZE,
    logging: env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
    entities: [`${__dirname}/../modules/**/entities/*.entity.{ts,js}`],
    migrations: [`${__dirname}/migrations/*.{ts,js}`],
    migrationsTableName: 'migrations',
  };
}

/** Used by the TypeORM CLI for migrations. */
export default new DataSource({ ...buildDataSourceOptions(), synchronize: false });
