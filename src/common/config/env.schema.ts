import { z } from 'zod';

/**
 * The environment contract.
 *
 * Validated once at boot and never read raw again: a missing or malformed
 * value should stop the process on the first line of `main.ts`, not surface as
 * an undefined halfway through a request. Secrets are required with no
 * fallback, because a default secret is worse than a crash.
 */
export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3001),

  DATABASE_URL: z.string().url('DATABASE_URL must be a valid connection URL'),
  DATABASE_SSL: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),

  REDIS_URL: z.string().url('REDIS_URL must be a valid connection URL'),

  /* Deliberately no defaults: a shipped default secret is a vulnerability. */
  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 characters'),
  JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET must be at least 32 characters'),
  JWT_ACCESS_TTL: z.coerce.number().int().positive().default(900),
  JWT_REFRESH_TTL: z.coerce.number().int().positive().default(1_209_600),

  /** Where links in emails point. One canonical origin. */
  WEB_APP_URL: z.string().url('WEB_APP_URL must be a valid URL'),

  /**
   * Where each audience signs in.
   *
   * A password reset link has to land on the surface that person actually
   * uses. Sending an agency admin to the marketing site, which has no reset
   * screen, is a dead end. Each falls back to WEB_APP_URL.
   */
  PARTNER_APP_URL: z.string().url().optional(),
  INSTITUTION_APP_URL: z.string().url().optional(),
  ADMIN_APP_URL: z.string().url().optional(),

  /**
   * Origins allowed to call the API from a browser.
   *
   * A list, not a single value: the frontend is five separate apps on five
   * origins (docs/01-prd.md), so allowing only WEB_APP_URL blocks every one
   * of them but the marketing site. Defaults to WEB_APP_URL alone.
   */
  CORS_ORIGINS: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

export class EnvValidationError extends Error {
  readonly issues: string[];

  constructor(issues: string[]) {
    super(`Invalid environment:\n  - ${issues.join('\n  - ')}`);
    this.name = 'EnvValidationError';
    this.issues = issues;
  }
}

/** Parses and freezes the environment, or throws listing every problem at once. */
export function validateEnv(source: Record<string, unknown>): Env {
  const result = envSchema.safeParse(source);

  if (!result.success) {
    throw new EnvValidationError(
      result.error.issues.map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`),
    );
  }

  /* The access and refresh secrets must differ: sharing one means a refresh
     token is also a valid access token. */
  if (result.data.JWT_ACCESS_SECRET === result.data.JWT_REFRESH_SECRET) {
    throw new EnvValidationError([
      'JWT_REFRESH_SECRET: must differ from JWT_ACCESS_SECRET, or a refresh token doubles as an access token',
    ]);
  }

  return Object.freeze(result.data);
}

/**
 * The surface a given role signs in on.
 *
 * Falls back to WEB_APP_URL so a deployment that has not configured the app
 * URLs still produces a link, rather than none.
 */
export function appUrlForRole(env: Env, role: string): string {
  switch (role) {
    case 'agency_admin':
    case 'counselor':
      return env.PARTNER_APP_URL ?? env.WEB_APP_URL;
    case 'institution_user':
      return env.INSTITUTION_APP_URL ?? env.WEB_APP_URL;
    case 'platform_admin':
      return env.ADMIN_APP_URL ?? env.WEB_APP_URL;
    default:
      /* Students arrive through a tokenised link on the public site. */
      return env.WEB_APP_URL;
  }
}

/** The allowed browser origins, with WEB_APP_URL always included. */
export function corsOrigins(env: Env): string[] {
  const configured = (env.CORS_ORIGINS ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  return [...new Set([env.WEB_APP_URL, ...configured])];
}
