import { validateEnv } from '../common/config/env.schema';

const valid = {
  NODE_ENV: 'test',
  DATABASE_URL: 'postgresql://user:pass@localhost:5433/db',
  REDIS_URL: 'redis://localhost:6380',
  JWT_ACCESS_SECRET: 'a'.repeat(32),
  JWT_REFRESH_SECRET: 'b'.repeat(32),
  WEB_APP_URL: 'http://localhost:3000',
};

let buildDataSourceOptions: typeof import('./data-source').buildDataSourceOptions;
const originalEnv = { ...process.env };

beforeAll(async () => {
  /*
   * data-source.ts builds the migration CLI's DataSource when imported, which
   * validates process.env. Give it a complete local environment first, rather
   * than depending on whatever .env happens to hold on this machine.
   */
  Object.assign(process.env, valid);
  ({ buildDataSourceOptions } = await import('./data-source'));
});

afterAll(() => {
  process.env = originalEnv;
});

describe('buildDataSourceOptions ssl', () => {
  it('verifies the server certificate when SSL is on', () => {
    // rejectUnauthorized: false encrypted the link but accepted any
    // certificate, so anything in the network path could pose as the database.
    const options = buildDataSourceOptions(validateEnv({ ...valid, DATABASE_SSL: 'true' }));

    expect(options).toMatchObject({ ssl: { rejectUnauthorized: true } });
  });

  it('leaves SSL off for a local database', () => {
    // docker-compose and the throwaway test Postgres speak plain TCP.
    const options = buildDataSourceOptions(validateEnv({ ...valid, DATABASE_SSL: 'false' }));

    expect(options).toMatchObject({ ssl: false });
  });

  it('defaults to SSL off when DATABASE_SSL is unset', () => {
    expect(buildDataSourceOptions(validateEnv(valid))).toMatchObject({ ssl: false });
  });
});
