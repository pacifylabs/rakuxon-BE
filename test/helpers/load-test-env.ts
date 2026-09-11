/**
 * Test environment defaults for everything except the database.
 *
 * DATABASE_URL and DATABASE_SSL are set by global-setup.ts: a provided local
 * database (CI's, or TEST_DATABASE_URL) is used as-is, and otherwise it starts
 * a throwaway Postgres. They are deliberately not defaulted here.
 * Anything else already exported wins, so CI can override it.
 */
const defaults: Record<string, string> = {
  NODE_ENV: 'test',
  REDIS_URL: 'redis://localhost:6380',
  JWT_ACCESS_SECRET: 'test-access-secret-that-is-long-enough-32',
  JWT_REFRESH_SECRET: 'test-refresh-secret-that-is-different-32',
  ADMIN_JWT_ACCESS_SECRET: 'test-admin-access-secret-that-is-long-32',
  ADMIN_JWT_REFRESH_SECRET: 'test-admin-refresh-secret-that-differs-32',
  WEB_APP_URL: 'http://localhost:3000',
};

for (const [key, value] of Object.entries(defaults)) {
  process.env[key] ??= value;
}
