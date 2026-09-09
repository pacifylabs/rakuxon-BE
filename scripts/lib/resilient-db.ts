import type { DataSource } from 'typeorm';

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

export function isTransientDbError(error: unknown): boolean {
  return TRANSIENT.test(error instanceof Error ? error.message : String(error));
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
