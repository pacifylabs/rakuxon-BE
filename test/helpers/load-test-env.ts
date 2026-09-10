/**
 * Test environment defaults.
 *
 * Points at a dedicated local database — `rakuxon_test`, on the same
 * Postgres.app server dev already uses, owned by `rakuxon_app` — rather than
 * docker-compose's `postgres` service: that service binds host port 5433,
 * which on a shared dev machine can already be taken by an unrelated
 * project's container, and this way there is only ever one Postgres to run
 * locally. Kept in its own database, not the dev `rakuxon` one, since the
 * suite TRUNCATEs between files and would otherwise erase seeded dev data.
 * Anything already exported wins, so CI can still override the connection.
 */
const defaults: Record<string, string> = {
  NODE_ENV: 'test',
  DATABASE_URL: 'postgresql://rakuxon_app:rakuxon-app-local-dev@localhost:5432/rakuxon_test',
  DATABASE_SSL: 'false',
  REDIS_URL: 'redis://localhost:6380',
  JWT_ACCESS_SECRET: 'test-access-secret-that-is-long-enough-32',
  JWT_REFRESH_SECRET: 'test-refresh-secret-that-is-different-32',
  WEB_APP_URL: 'http://localhost:3000',
};

for (const [key, value] of Object.entries(defaults)) {
  process.env[key] ??= value;
}
