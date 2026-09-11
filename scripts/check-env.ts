import 'dotenv/config';

import { EnvValidationError, corsOrigins, validateEnv } from '../src/common/config/env.schema';
import type { Env } from '../src/common/config/env.schema';

/**
 * Preflight for a deployment's environment.
 *
 * Four deploys were spent discovering one misconfiguration per attempt,
 * because a boot only reports the first thing it trips over and every round
 * trip costs a build. This runs the real validator, then the checks that are
 * not validation errors — a value can be perfectly well-formed and still wrong
 * for production — and prints everything at once.
 *
 *   pnpm env:check                        # checks the current .env
 *   NODE_ENV=production ... pnpm env:check  # checks values before you paste them
 *
 * It never connects to anything, so it is safe to run against production
 * values.
 */

const RED = '\u001b[31m';
const YELLOW = '\u001b[33m';
const GREEN = '\u001b[32m';
const DIM = '\u001b[2m';
const RESET = '\u001b[0m';

const problems: string[] = [];
const warnings: string[] = [];

const looksLocal = (url?: string): boolean =>
  Boolean(url) && /localhost|127\.0\.0\.1|\[::1\]/.test(url as string);

/** Values shipped in .env.example, which must never reach a deployment. */
const SHIPPED_SECRETS = [
  'local-dev-access-secret',
  'local-dev-refresh-secret',
  'change-me',
  'and-this-one-also-different',
];

/*
 * Reads process.env directly rather than a parsed Env.
 *
 * The first version took the validated object, so a single schema error meant
 * none of these ran and the operator learned about them one deploy later —
 * exactly the failure this script exists to prevent, reproduced inside it.
 */
function auditForProduction(): void {
  const raw = process.env;
  const nodeEnv = raw.NODE_ENV ?? 'development';

  if (nodeEnv !== 'production') {
    warnings.push(
      `NODE_ENV is "${nodeEnv}". A deployed service should set it to "production".`,
    );
  }

  for (const name of [
    'JWT_ACCESS_SECRET',
    'JWT_REFRESH_SECRET',
    'ADMIN_JWT_ACCESS_SECRET',
    'ADMIN_JWT_REFRESH_SECRET',
  ] as const) {
    const value = raw[name] ?? '';
    if (SHIPPED_SECRETS.some((seed) => value.startsWith(seed))) {
      /* Fine locally — that is what .env.example is for. Fatal anywhere real,
         because the value is published in the repository. */
      const message =
        `${name} is a value from .env.example. It is public, so anyone can forge tokens. ` +
        'Generate one with: openssl rand -base64 48';
      (nodeEnv === 'production' ? problems : warnings).push(message);
    }
  }


  if (nodeEnv === 'production') {
    for (const name of [
      'DATABASE_URL',
      'REDIS_URL',
      'WEB_APP_URL',
      'PARTNER_APP_URL',
      'INSTITUTION_APP_URL',
      'ADMIN_APP_URL',
    ] as const) {
      if (looksLocal(raw[name])) {
        warnings.push(`${name} points at localhost, which resolves to the container itself.`);
      }
    }

    if (raw.DATABASE_SSL !== 'true') {
      warnings.push('DATABASE_SSL is not "true". Hosted Postgres almost always requires TLS.');
    }

    if (!raw.SMTP_HOST || !raw.SMTP_FROM) {
      /* Unlike Cloudinary or Google SSO, nothing else stands in for this in
         production: password reset and email verification links are only
         logged, never delivered, until both are set. */
      warnings.push(
        'SMTP_HOST/SMTP_FROM are not both set. Password reset and verification emails will ' +
          'be logged instead of sent.',
      );
    }
  }
}

function main(): void {
  let env: Env | undefined;

  try {
    env = validateEnv(process.env);
  } catch (error) {
    if (!(error instanceof EnvValidationError)) throw error;
    problems.push(...error.issues);
  }

  auditForProduction();

  for (const problem of problems) process.stdout.write(`${RED}  x ${problem}${RESET}\n`);
  for (const warning of warnings) process.stdout.write(`${YELLOW}  ! ${warning}${RESET}\n`);

  if (env && problems.length === 0) {
    process.stdout.write(`${GREEN}  ok Environment is valid.${RESET}\n`);
    process.stdout.write(`${DIM}     CORS will allow: ${corsOrigins(env).join(', ')}${RESET}\n`);
    process.stdout.write(
      `${DIM}     Reset links go to: ${env.PARTNER_APP_URL ?? env.WEB_APP_URL}${RESET}\n`,
    );
  }

  const tail = problems.length > 0 ? ' Fix the problems before deploying.' : '';
  process.stdout.write(
    `\n  ${problems.length} problem(s), ${warnings.length} warning(s).${tail}\n`,
  );

  process.exitCode = problems.length > 0 ? 1 : 0;
}

main();
