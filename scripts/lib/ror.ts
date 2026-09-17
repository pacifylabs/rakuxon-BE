/** Pure helpers for `../import-ror.ts`, split out so they can be unit tested
    without importing the driver script (which runs on import). */

export interface RorLocation {
  geonames_details?: { country_code?: string; country_name?: string; name?: string };
}

export interface RorLocatable {
  locations?: RorLocation[];
}

/**
 * Which of an organisation's locations to record.
 *
 * A ROR import batch searches for organisations with a location in one of
 * `countryCodes` — but an organisation can list more than one, and
 * unconditionally taking `locations[0]` recorded whichever happened to be
 * first, not the one that made it match the search. A branch campus or a
 * headquarters in a third country then became the institution's displayed
 * country. Prefer the first location that actually matches this batch's
 * countries; only fall back to index 0 for the (expected to be rare, since
 * the search already filtered on this) case where none does.
 */
export function primaryLocation(
  org: RorLocatable,
  countryCodes: readonly string[],
): RorLocation['geonames_details'] {
  const locations = org.locations ?? [];
  const wanted = new Set(countryCodes.map((code) => code.toUpperCase()));

  const matching = locations.find((entry) =>
    wanted.has((entry.geonames_details?.country_code ?? '').toUpperCase()),
  );

  return matching?.geonames_details ?? locations[0]?.geonames_details;
}
