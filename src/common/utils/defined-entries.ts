/**
 * Only the keys the request actually set, dropping class-transformer's
 * undefined fill-ins.
 *
 * `plainToInstance` sets every declared DTO field as an own property,
 * `undefined` where the request omitted it — so `{ ...entity, ...patch }`
 * would overwrite an already-saved value with `undefined` for every field a
 * given PATCH didn't touch. This is what makes a PATCH partial rather than
 * "whatever the client didn't mention gets wiped in memory" (TypeORM's
 * `save()` ignores `undefined` columns, so only the in-memory object and the
 * immediate response were ever wrong — the database itself is never actually
 * corrupted by skipping this, but the response would lie about what was
 * saved).
 */
export function definedEntries<T extends object>(source: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(source).filter(([, value]) => value !== undefined),
  ) as Partial<T>;
}
