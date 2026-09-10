import { EnvValidationError, appUrlForRole, corsOrigins, smtpConfigured, validateEnv } from './env.schema';

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

  it('says so when an app URL is given a comma-separated list', () => {
    /*
     * A real deploy set WEB_APP_URL to "http://localhost:3000,site.vercel.app"
     * and got "must be a valid URL", which is true and unhelpful. These fields
     * are one canonical address each — they end up inside password-reset links,
     * where a list is meaningless — and the list belongs in CORS_ORIGINS.
     */
    expect(() =>
      validateEnv({ ...valid, WEB_APP_URL: 'http://localhost:3000,https://x.vercel.app' }),
    ).toThrow(/single URL.*CORS_ORIGINS/s);
  });

  it('rejects an origin with no scheme, which would never match a browser', () => {
    // A browser sends Origin: https://host. "host" alone silently matches
    // nothing, and surfaces as an unexplained CORS failure much later.
    expect(() => validateEnv({ ...valid, CORS_ORIGINS: 'rakuxon-path.vercel.app' })).toThrow(
      /scheme/i,
    );
  });

  it('rejects a scheme-less app URL with the same explanation', () => {
    expect(() => validateEnv({ ...valid, WEB_APP_URL: 'rakuxon-path.vercel.app' })).toThrow(
      /WEB_APP_URL/,
    );
  });

  it('accepts a proper list of origins', () => {
    expect(() =>
      validateEnv({
        ...valid,
        CORS_ORIGINS: 'https://a.vercel.app, https://b.vercel.app',
      }),
    ).not.toThrow();
  });

  it('leaves CORS_ORIGINS optional', () => {
    expect(() => validateEnv(valid)).not.toThrow();
  });

  it('freezes the result, so nothing can mutate config at runtime', () => {
    const env = validateEnv(valid);
    expect(Object.isFrozen(env)).toBe(true);
  });
});

describe('corsOrigins', () => {
  it('always includes the canonical web address', () => {
    expect(corsOrigins(validateEnv(valid))).toEqual(['http://localhost:3000']);
  });

  it('adds every configured origin', () => {
    const env = validateEnv({
      ...valid,
      CORS_ORIGINS: 'http://localhost:3002, http://localhost:3003',
    });
    // Five frontend apps means five origins; one allowed value blocks four.
    expect(corsOrigins(env)).toEqual([
      'http://localhost:3000',
      'http://localhost:3002',
      'http://localhost:3003',
    ]);
  });

  it('ignores blanks from a trailing comma', () => {
    const env = validateEnv({ ...valid, CORS_ORIGINS: 'http://localhost:3002,,' });
    expect(corsOrigins(env)).toEqual(['http://localhost:3000', 'http://localhost:3002']);
  });

  it('does not repeat the canonical address if it is listed again', () => {
    const env = validateEnv({ ...valid, CORS_ORIGINS: 'http://localhost:3000' });
    expect(corsOrigins(env)).toEqual(['http://localhost:3000']);
  });
});

describe('appUrlForRole', () => {
  const configured = validateEnv({
    ...valid,
    PARTNER_APP_URL: 'https://app.test',
    INSTITUTION_APP_URL: 'https://schools.test',
    ADMIN_APP_URL: 'https://admin.test',
  });

  it.each([
    ['agency_admin', 'https://app.test'],
    ['counselor', 'https://app.test'],
    ['institution_user', 'https://schools.test'],
    ['platform_admin', 'https://admin.test'],
  ])('sends %s to their own surface', (role, expected) => {
    expect(appUrlForRole(configured, role)).toBe(expected);
  });

  it('sends a student to the public site, where their link lives', () => {
    expect(appUrlForRole(configured, 'student')).toBe('http://localhost:3000');
  });

  it('falls back to the canonical address when an app URL is unset', () => {
    // Better a link to the wrong surface than no link at all.
    const bare = validateEnv(valid);
    expect(appUrlForRole(bare, 'agency_admin')).toBe('http://localhost:3000');
    expect(appUrlForRole(bare, 'platform_admin')).toBe('http://localhost:3000');
  });
});

describe('smtpConfigured', () => {
  it('is false when neither SMTP_HOST nor SMTP_FROM is set', () => {
    expect(smtpConfigured(validateEnv(valid))).toBe(false);
  });

  it('is false with a host but no From address — a transport with nowhere to say mail is from', () => {
    const env = validateEnv({ ...valid, SMTP_HOST: 'smtp.test' });
    expect(smtpConfigured(env)).toBe(false);
  });

  it('is false with a From address but no host', () => {
    const env = validateEnv({ ...valid, SMTP_FROM: 'Rakuxon <no-reply@rakuxon.com>' });
    expect(smtpConfigured(env)).toBe(false);
  });

  it('is true once both are set', () => {
    const env = validateEnv({
      ...valid,
      SMTP_HOST: 'smtp.test',
      SMTP_FROM: 'Rakuxon <no-reply@rakuxon.com>',
    });
    expect(smtpConfigured(env)).toBe(true);
  });
});
