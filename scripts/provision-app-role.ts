import 'dotenv/config';

import { Client } from 'pg';

/**
 * Creates the role the API connects as.
 *
 * Roles are cluster-level rather than schema-level, so this is not a
 * migration — it runs once per database, before the first migration, and is
 * safe to re-run.
 *
 * The role is explicitly NOSUPERUSER NOBYPASSRLS. Postgres exempts both from
 * row-level security unconditionally, which would leave every policy in place
 * and enforcing nothing.
 */
async function main(): Promise<void> {
  const adminUrl = process.env.DATABASE_ADMIN_URL ?? process.env.DATABASE_URL;
  const role = process.env.DATABASE_APP_USER ?? 'rakuxon_app';
  const password = process.env.DATABASE_APP_PASSWORD;

  if (!adminUrl) throw new Error('Set DATABASE_ADMIN_URL (or DATABASE_URL) to an owner connection.');
  if (!password) throw new Error('Set DATABASE_APP_PASSWORD to the password the API will use.');
  if (!/^[a-z_][a-z0-9_]*$/.test(role)) {
    throw new Error(`DATABASE_APP_USER "${role}" must be a plain lowercase identifier.`);
  }

  const client = new Client({
    connectionString: adminUrl,
    ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
  });
  await client.connect();

  try {
    const { rows } = await client.query<{ rolname: string }>(
      'SELECT rolname FROM pg_roles WHERE rolname = $1',
      [role],
    );

    /* CREATE ROLE takes no parameters, so the password is escaped as a literal
       and the role name is constrained to an identifier above. */
    const literal = `'${password.replace(/'/g, "''")}'`;

    if (rows.length === 0) {
      await client.query(`CREATE ROLE "${role}" LOGIN PASSWORD ${literal}`);
    } else {
      await client.query(`ALTER ROLE "${role}" PASSWORD ${literal}`);
    }

    /* Stated every run, not only at creation: a role that picked up BYPASSRLS
       somewhere along the way would disable the entire isolation model. */
    await client.query(
      `ALTER ROLE "${role}" NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION`,
    );

    const database = (await client.query<{ current_database: string }>('SELECT current_database()'))
      .rows[0]?.current_database;
    await client.query(`GRANT CONNECT ON DATABASE "${database}" TO "${role}"`);

    process.stdout.write(`Provisioned "${role}" on "${database}" (NOSUPERUSER, NOBYPASSRLS).\n`);
  } finally {
    await client.end();
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
