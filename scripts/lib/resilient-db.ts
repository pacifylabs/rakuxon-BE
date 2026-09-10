import {
  getDefaultAutoSelectFamilyAttemptTimeout,
  setDefaultAutoSelectFamilyAttemptTimeout,
} from 'node:net';

import type { DataSource } from 'typeorm';

/**
 * Give each connection attempt time to finish before Node moves to the next
 * address.
 *
 * Node races address families and abandons an attempt after 250ms by default.
 * Measured from this office to Neon's us-east-2 pooler on 2026-09-10: plain TCP
 * handshakes took 247–470ms (median 298), so the default abandoned most IPv4
 * attempts and fell through to IPv6 addresses that do not route from this
 * network. A slow connection became a failed one. Two seconds keeps the family
 * race for machines where IPv6 does work, without cutting off a slow but
 * healthy IPv4 link. Never lowered: a larger value set via NODE_OPTIONS stands.
 */
export const CONNECT_ATTEMPT_TIMEOUT_MS = 2000;

if (getDefaultAutoSelectFamilyAttemptTimeout() < CONNECT_ATTEMPT_TIMEOUT_MS) {
  setDefaultAutoSelectFamilyAttemptTimeout(CONNECT_ATTEMPT_TIMEOUT_MS);
}

/**
 * Database writes that survive a dropped connection.
 *
 * Shared rather than copied. The ROR importer learned this the hard way and
 * grew its own copy; the Wikidata enrichment was written afterwards without
 * one and died at 240 rows of 6,542 on exactly the same class of error. A
 * long-running import against hosted Postgres will meet a dropped connection —
 * that is the normal case, not the exception — so the handling belongs
 * somewhere both scripts get it for free.
 */

/**
 * Errors that mean "the connection went away", not "the data is wrong".
 *
 * Deliberately not a catch-all: a constraint violation retried four times
 * still violates the constraint, it just fails slower and hides the cause.
 */
const TRANSIENT = new RegExp(
  [
    'connection terminated',
    'connection lost',
    'server closed',
    'ETIMEDOUT',
    'ECONNRESET',
    'ECONNREFUSED',
    'EPIPE',
    'EADDRNOTAVAIL', // ports exhausted locally — recovers on its own
    'EAI_AGAIN', // transient DNS
    'socket hang up',
    'terminating connection',
    'Client has encountered a connection error',
  ].join('|'),
  'i',
);

export const MAX_DB_ATTEMPTS = 5;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Everything an error carries that might name the failure.
 *
 * Reading `message` alone is not enough, and the gap is not theoretical: when
 * Node tries every address a host resolves to and they all fail, it throws an
 * AggregateError whose own message is the empty string and whose causes are in
 * `errors[]`. Testing the empty message returns false, so the one helper
 * written to survive a dropped connection classified a dropped connection as
 * permanent and killed a six-thousand-row import at row 2,100.
 */
function* describe(error: unknown, depth = 0): Generator<string> {
  if (depth > 4 || error === null || error === undefined) return;

  if (typeof error !== 'object') {
    yield String(error);
    return;
  }

  const candidate = error as { message?: unknown; code?: unknown; errors?: unknown; cause?: unknown };

  if (typeof candidate.message === 'string') yield candidate.message;
  /* ECONNRESET and friends live on `code`, not in the message. */
  if (typeof candidate.code === 'string') yield candidate.code;

  if (Array.isArray(candidate.errors)) {
    for (const nested of candidate.errors) yield* describe(nested, depth + 1);
  }
  if (candidate.cause) yield* describe(candidate.cause, depth + 1);
}

export function isTransientDbError(error: unknown): boolean {
  for (const text of describe(error)) {
    if (TRANSIENT.test(text)) return true;
  }
  return false;
}

/**
 * Runs a query, reconnecting if the pool has gone underneath it.
 *
 * Retrying alone is not enough: once a DataSource is torn down every
 * subsequent query fails identically, so the first drop would poison the whole
 * run however many times it was retried.
 */
export async function withReconnect<T>(
  dataSource: DataSource,
  work: () => Promise<T>,
  attempt = 1,
): Promise<T> {
  try {
    return await work();
  } catch (error) {
    if (!isTransientDbError(error) || attempt >= MAX_DB_ATTEMPTS) throw error;

    /* 1s, 2s, 4s, 8s — long enough for a suspended compute to wake. */
    await sleep(1000 * 2 ** (attempt - 1));
    if (!dataSource.isInitialized) await dataSource.initialize();

    return withReconnect(dataSource, work, attempt + 1);
  }
}

/**
 * The first connection, retried like every one after it.
 *
 * `withReconnect` protects each query but the initial `initialize()` sat
 * outside it, so a flaky first connect killed the run before it printed a
 * single line — the one failure mode where the retry logic is present and
 * unreachable.
 */
export async function connectWithRetry(dataSource: DataSource, attempt = 1): Promise<DataSource> {
  try {
    return await dataSource.initialize();
  } catch (error) {
    if (!isTransientDbError(error) || attempt >= MAX_DB_ATTEMPTS) throw error;

    await sleep(1000 * 2 ** (attempt - 1));
    return connectWithRetry(dataSource, attempt + 1);
  }
}
