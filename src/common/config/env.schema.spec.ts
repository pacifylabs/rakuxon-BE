import { EnvValidationError, validateEnv } from './env.schema';

const valid = {
  NODE_ENV: 'test',
  DATABASE_URL: 'postgresql://user:pass@localhost:5433/db',
  REDIS_URL: 'redis://localhost:6380',
  JWT_ACCESS_SECRET: 'a'.repeat(32),
  JWT_REFRESH_SECRET: 'b'.repeat(32),
  WEB_APP_URL: 'http://localhost:3000',
};

describe('validateEnv', () => {
  it('accepts a complete environment', () => {
    expect(() => validateEnv(valid)).not.toThrow();
  });

  it('applies documented defaults', () => {
    const env = validateEnv(valid);
    expect(env.PORT).toBe(3001);
    expect(env.JWT_ACCESS_TTL).toBe(900);
    expect(env.DATABASE_SSL).toBe(false);
  });

  it('coerces numeric strings, because process.env is all strings', () => {
    expect(validateEnv({ ...valid, PORT: '8080' }).PORT).toBe(8080);
  });

  it.each(['DATABASE_URL', 'REDIS_URL', 'JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET', 'WEB_APP_URL'])(
    'throws when %s is missing',
    (key) => {
      const { [key]: _removed, ...rest } = valid as Record<string, unknown>;
      expect(() => validateEnv(rest)).toThrow(EnvValidationError);
    },
  );

  it('names every problem at once rather than one per restart', () => {
    try {
      validateEnv({ NODE_ENV: 'test' });
      throw new Error('expected validateEnv to throw');
    } catch (error) {
      const issues = (error as EnvValidationError).issues;
      expect(issues.length).toBeGreaterThan(3);
      expect(issues.join('\n')).toContain('DATABASE_URL');
      expect(issues.join('\n')).toContain('REDIS_URL');
    }
  });

  it('rejects a short signing secret', () => {
    expect(() => validateEnv({ ...valid, JWT_ACCESS_SECRET: 'too-short' })).toThrow(
      /at least 32 characters/,
    );
  });

  it('rejects a shared access and refresh secret', () => {
    const shared = 'c'.repeat(32);
    expect(() =>
      validateEnv({ ...valid, JWT_ACCESS_SECRET: shared, JWT_REFRESH_SECRET: shared }),
    ).toThrow(/must differ/);
  });

  it('rejects a malformed database URL', () => {
    expect(() => validateEnv({ ...valid, DATABASE_URL: 'not-a-url' })).toThrow(EnvValidationError);
  });

  it('freezes the result, so nothing can mutate config at runtime', () => {
    const env = validateEnv(valid);
    expect(Object.isFrozen(env)).toBe(true);
  });
});
