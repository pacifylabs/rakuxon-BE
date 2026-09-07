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

  WEB_APP_URL: z.string().url('WEB_APP_URL must be a valid URL'),
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
