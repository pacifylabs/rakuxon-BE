/**
 * Test environment defaults.
 *
 * Points at the docker-compose services. Anything already exported wins, so CI
 * can override the connection without editing this file.
 */
const defaults: Record<string, string> = {
  NODE_ENV: 'test',
  DATABASE_URL: 'postgresql://rakuxon:rakuxon@localhost:5433/rakuxon',
  DATABASE_SSL: 'false',
  REDIS_URL: 'redis://localhost:6380',
  JWT_ACCESS_SECRET: 'test-access-secret-that-is-long-enough-32',
  JWT_REFRESH_SECRET: 'test-refresh-secret-that-is-different-32',
  WEB_APP_URL: 'http://localhost:3000',
};

for (const [key, value] of Object.entries(defaults)) {
  process.env[key] ??= value;
}
