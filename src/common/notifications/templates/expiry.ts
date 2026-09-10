/**
 * "in about an hour" / "in about a day" from a `Date`.
 *
 * The port only carries `expiresAt`, not the duration that produced it, and
 * an email is read in the recipient's timezone, not the server's — so an
 * absolute timestamp is either wrong-looking or needs a timezone this code
 * does not know. A relative, rounded phrase is honest either way.
 */
export function humanizeExpiry(expiresAt: Date, from: Date = new Date()): string {
  const minutes = Math.round((expiresAt.getTime() - from.getTime()) / 60_000);

  if (minutes <= 1) return 'in a minute';
  if (minutes < 60) return `in ${minutes} minutes`;

  const hours = Math.round(minutes / 60);
  if (hours < 24) return hours === 1 ? 'in about an hour' : `in about ${hours} hours`;

  const days = Math.round(hours / 24);
  return days === 1 ? 'in about a day' : `in about ${days} days`;
}
