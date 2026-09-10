import { getDefaultAutoSelectFamilyAttemptTimeout } from 'node:net';

import { CONNECT_ATTEMPT_TIMEOUT_MS, isTransientDbError } from './resilient-db';

/**
 * These exist because the helper had a hole exactly where it was supposed to
 * be strongest: it read `error.message` and nothing else.
 */
describe('isTransientDbError', () => {
  it('recognises a plain connection error', () => {
    expect(isTransientDbError(new Error('Connection terminated unexpectedly'))).toBe(true);
  });

  it('recognises an AggregateError whose own message is empty', () => {
    // Node throws this when every address a host resolves to refuses the
    // connection. Its message is '' and the causes are in `errors`, so testing
    // the message alone called a dropped connection permanent — which killed a
    // 6,542-row import at row 2,100.
    const aggregate = new AggregateError(
      [Object.assign(new Error(''), { code: 'ECONNREFUSED' })],
      '',
    );

    expect(aggregate.message).toBe('');
    expect(isTransientDbError(aggregate)).toBe(true);
  });

  it('reads a code even when the message says nothing', () => {
    expect(isTransientDbError(Object.assign(new Error(''), { code: 'ECONNRESET' }))).toBe(true);
  });

  it('follows the cause chain', () => {
    const outer = new Error('query failed', {
      cause: Object.assign(new Error(''), { code: 'ETIMEDOUT' }),
    });

    expect(isTransientDbError(outer)).toBe(true);
  });

  it('still refuses a genuine data error', () => {
    // Retrying a constraint violation five times still violates the
    // constraint; it just fails slower and hides the cause.
    expect(
      isTransientDbError(new Error('duplicate key value violates unique constraint')),
    ).toBe(false);
  });

  it('does not loop forever on an error that causes itself', () => {
    const looping: Error & { cause?: unknown } = new Error('nope');
    looping.cause = looping;

    expect(isTransientDbError(looping)).toBe(false);
  });
});

describe('connection attempts', () => {
  it('gives each address long enough for a slow but healthy link', () => {
    // Node's default of 250ms abandoned most IPv4 attempts to Neon from here,
    // where TCP handshakes measured 247–470ms, and the IPv6 fallback does not route.
    expect(getDefaultAutoSelectFamilyAttemptTimeout()).toBeGreaterThanOrEqual(CONNECT_ATTEMPT_TIMEOUT_MS);
  });
});
