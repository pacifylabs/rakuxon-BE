import 'dotenv/config';

import { DataSource } from 'typeorm';
import type { DataSourceOptions } from 'typeorm';

import { validateEnv } from '../common/config/env.schema';

/**
 * TypeORM configuration.
 *
 * `synchronize` is off everywhere, including development: the schema carries
 * row-level security policies that TypeORM cannot express, so it has to be
 * migration-owned or the isolation guarantee silently disappears.
 */
export function buildDataSourceOptions(
  env = validateEnv(process.env),
  /**
   * Migrations need DDL rights the runtime role deliberately does not have,
   * so the CLI connects as the owner. The application never does — see the
   * note on DATABASE_URL in env.schema.ts.
   */
  options: { admin?: boolean } = {},
): DataSourceOptions {
  return {
    type: 'postgres',
    url: options.admin ? (env.DATABASE_ADMIN_URL ?? env.DATABASE_URL) : env.DATABASE_URL,
    ssl: env.DATABASE_SSL ? { rejectUnauthorized: false } : false,
    synchronize: false,
    logging: env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
    entities: [`${__dirname}/../modules/**/entities/*.entity.{ts,js}`],
    migrations: [`${__dirname}/migrations/*.{ts,js}`],
    migrationsTableName: 'migrations',
  };
}

/** Used by the TypeORM CLI for migrations. */
export default new DataSource(buildDataSourceOptions(undefined, { admin: true }));
