/** Pure helper for `../enrich-wikidata.ts`'s location cross-check, split out
    so it can be unit tested without importing the driver script. */

export interface LocationCorrection {
  countryCode: string;
  country: string;
}

/**
 * Whether an institution's stored country disagrees with Wikidata's (P17,
 * resolved to an ISO 3166-1 alpha-2 code via P297) — the independent signal
 * `import-ror.ts`'s `locations[0]` bug did not have.
 *
 * Returns the correction to make, or `null` for "leave it alone": either the
 * two sources already agree, or Wikidata has no country claim for this
 * institution to check against (most institutions it does not cover at all,
 * and P17 is optional even among the ones it does) — a record with no
 * independent signal is left as ROR reported it rather than guessed at.
 */
export function checkLocation(
  current: { countryCode: string; country: string },
  wikidata: { countryCode: string | null; countryName: string | null },
): LocationCorrection | null {
  if (!wikidata.countryCode) return null;
  if (wikidata.countryCode === current.countryCode.toUpperCase()) return null;

  return { countryCode: wikidata.countryCode, country: wikidata.countryName ?? wikidata.countryCode };
}
