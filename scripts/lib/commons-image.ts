/**
 * Commons files, and which of them a page may show as a banner.
 *
 * Wikidata's P18 ("image") is a campus photograph for most institutions and
 * the logo for a few hundred, because that is the only image the item has.
 * Stored as `heroImageUrl` it lands in the university page's banner, where a
 * logo is cropped into a wall of letterforms — and it is also the one image we
 * are not free to publish: the licence on the Commons file covers the artwork,
 * not the trademark in it.
 */

/**
 * Makes a Commons file reference usable from a browser.
 *
 * Wikidata returns these as http:// pointers to Special:FilePath, which serves
 * the original upload. Two problems, both fatal in a page: http on an https
 * site is blocked as mixed content before it is ever requested, and the
 * original is whatever resolution someone uploaded — occasionally several
 * megabytes for something rendered at 48px. Special:FilePath takes a width
 * parameter and resizes server-side, so ask for the size we actually use.
 */
export function commonsThumb(url: string, width = 320): string {
  const https = url.replace(/^http:\/\//, 'https://');
  if (!https.includes('/Special:FilePath/')) return https;
  return `${https}${https.includes('?') ? '&' : '?'}width=${width}`;
}

/** The decoded file name behind a Special:FilePath URL, or null for anything else. */
export function commonsFileName(url: string): string | null {
  const path = url.split('/Special:FilePath/')[1];
  if (!path) return null;

  const encoded = path.split('?')[0] ?? '';
  try {
    return decodeURIComponent(encoded) || null;
  } catch {
    /* A half-encoded name is still a name; it just stays as it arrived. */
    return encoded || null;
  }
}

const MARK_WORD = /logo|seal|crest|wordmark|emblem|insignia|monogram/i;
/** Phrased, not a single word, and never the caption of a photograph. */
const COAT_OF_ARMS = /coat[ _-]?of[ _-]?arms/i;

/**
 * Whether a file name describes an institutional mark rather than a place.
 *
 * A vector file is decisive on its own: nobody uploads a photograph as SVG, so
 * "ATSU logo.svg" and "Seal of X.svg" are marks whatever they are called.
 *
 * A mark word in a raster name is not decisive, because a photograph's file
 * name describes a scene and may mention one —
 * "Cranfield University entrance Main reception and logo.jpg" is a building.
 * Where the word falls separates the two: a mark is named for what it is
 * ("KCLogo", "Coat of arms of Keele"), so the word leads; a photograph's
 * mention of one trails a description. A short name is a mark either way,
 * since there is no description in it to trail.
 */
export function isInstitutionMark(fileName: string): boolean {
  if (/\.svgz?$/i.test(fileName)) return true;

  const withoutExtension = fileName.replace(/\.[a-z0-9]+$/i, '');
  if (COAT_OF_ARMS.test(withoutExtension)) return true;

  const words = withoutExtension.split(/[\s_\-()%]+/).filter(Boolean);
  const at = words.findIndex((word) => MARK_WORD.test(word));

  return at !== -1 && (at <= 2 || words.length <= 4);
}

/**
 * The banner image for an institution, sized for the page, or null.
 *
 * Null for a mark: a page with no banner still carries the name, the location
 * and the facts, which is a better page than one led by a cropped trademark.
 */
export function heroImageFrom(image: string | undefined, width = 1200): string | null {
  if (!image) return null;

  const name = commonsFileName(image);
  if (name && isInstitutionMark(name)) return null;

  return commonsThumb(image, width);
}
