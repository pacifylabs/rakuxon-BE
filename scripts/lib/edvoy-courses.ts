import { StudyLevel } from '../../src/contract/enums';

/**
 * Turns one row of the Edvoy course feed into our course shape.
 *
 * Pure — no network, no database — so every rule below is tested against the
 * payload as it actually arrives rather than against a fixture of what we hope
 * it looks like. The feed is external input and is treated as hostile: every
 * field is checked, and a row that cannot be mapped honestly is rejected with a
 * reason instead of being filled in with a guess.
 */

/** The fields we read. The feed carries more; nothing else is trusted. */
export interface EdvoyCourse {
  name?: unknown;
  refId?: unknown;
  slug?: unknown;
  edpRefId?: unknown;
  courseLevel?: unknown;
  courseSummary?: unknown;
  approxAnnualFee?: unknown;
  currency?: unknown;
  expressOffer?: unknown;
  subjects?: unknown;
  institution?: {
    name?: unknown;
    slug?: unknown;
    address?: { country?: unknown } | null;
  } | null;
}

export interface NormalisedCourse {
  /** The feed's own id, "institution|course". Upserts key on it. */
  sourceRef: string;
  institutionRef: string;
  institutionName: string;
  country: string | null;
  courseSlug: string;
  title: string;
  level: StudyLevel;
  disciplines: string[];
  overview: string | null;
  tuitionAmount: string | null;
  tuitionCurrency: string | null;
  fastTrackOffer: boolean;
}

export type Normalised =
  | { ok: true; course: NormalisedCourse }
  | { ok: false; reason: string };

/**
 * The feed's level labels, mapped. Anything else is rejected and counted, not
 * guessed at: filing a foundation year under "undergraduate" puts it in front
 * of people filtering for a degree.
 */
const LEVELS: Record<string, StudyLevel> = {
  undergraduate: StudyLevel.Undergraduate,
  postgraduate: StudyLevel.Postgraduate,
  foundation: StudyLevel.Foundation,
  pathway: StudyLevel.Foundation,
  /* A pre-masters course prepares for a master's the way a foundation year
     prepares for a degree; filed as Foundation at the owner's decision
     (2026-09-11). Language, pre-sessional English and short professional
     courses stay rejected: no study level describes them honestly. */
  premasters: StudyLevel.Foundation,
  research: StudyLevel.Research,
  doctorate: StudyLevel.Research,
  phd: StudyLevel.Research,
};

const text = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() ? value.trim() : null;

/** The feed's slugs are already kebab-case; this keeps them that way if not. */
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function normaliseEdvoyCourse(row: EdvoyCourse): Normalised {
  const sourceRef = text(row.refId);
  const institutionRef = text(row.edpRefId) ?? text(row.institution?.slug);
  const title = text(row.name);
  const courseSlug = text(row.slug);
  const institutionName = text(row.institution?.name);

  if (!sourceRef) return { ok: false, reason: 'missing refId' };
  if (!institutionRef || !institutionName) return { ok: false, reason: 'missing institution' };
  if (!title) return { ok: false, reason: 'missing name' };
  if (!courseSlug || !SLUG.test(courseSlug)) return { ok: false, reason: 'bad slug' };

  const levelLabel = text(row.courseLevel)?.toLowerCase() ?? '';
  const level = LEVELS[levelLabel];
  if (!level) return { ok: false, reason: `unmapped level "${levelLabel || '(none)'}"` };

  return {
    ok: true,
    course: {
      sourceRef,
      institutionRef,
      institutionName,
      country: text(row.institution?.address?.country),
      courseSlug,
      title,
      level,
      disciplines: disciplines(row.subjects),
      overview: text(row.courseSummary),
      ...tuition(row.approxAnnualFee, row.currency),
      fastTrackOffer: row.expressOffer === true,
    },
  };
}

function disciplines(subjects: unknown): string[] {
  if (!Array.isArray(subjects)) return [];

  return [
    ...new Set(
      subjects
        .map((subject) => text(subject)?.toLowerCase())
        .filter((subject): subject is string => Boolean(subject && SLUG.test(subject))),
    ),
  ];
}

/**
 * An amount only travels with its currency. "17500" on its own is not a fee —
 * it is a number that a page would render in whatever currency it defaulted to.
 */
function tuition(
  fee: unknown,
  currency: unknown,
): { tuitionAmount: string | null; tuitionCurrency: string | null } {
  const code = text(currency)?.toUpperCase() ?? null;
  const amount = typeof fee === 'number' ? fee : Number(text(fee) ?? Number.NaN);

  if (!code || !/^[A-Z]{3}$/.test(code)) return { tuitionAmount: null, tuitionCurrency: null };
  /* numeric(12,2) holds up to 9,999,999,999.99; anything near that is a data
     error, not a fee. */
  if (!Number.isFinite(amount) || amount <= 0 || amount >= 10_000_000) {
    return { tuitionAmount: null, tuitionCurrency: null };
  }

  return { tuitionAmount: amount.toFixed(2), tuitionCurrency: code };
}

/**
 * Institution names compared the way people write them, so "The University of
 * Derby" and "University of Derby" meet. Accents fold too: the feed and the
 * registry do not agree on whether München has an umlaut.
 */
export function institutionKey(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/^the /, '')
    .trim();
}

/** Words that say what kind of place it is, not which place. */
const GENERIC_WORDS = new Set(['university', 'universities', 'of', 'the', 'and', 'at', 'in', 'for']);

/**
 * The part of an institution key that names the place.
 *
 * Deliberately narrow. "University of Ulster" and "Ulster University", or
 * "Wittenborg University" and "Wittenborg - University of Applied Sciences",
 * are one place under two labels and both reduce to a single word. But
 * "technology", "city" and "science" stay: dropping them would make Queensland
 * University of Technology the University of Queensland, and Birmingham City
 * University the University of Birmingham. Measured against the feed: this
 * found 2 real duplicates and no false ones; looser token overlap found real
 * ones too, but also paired UNSW with a psychiatry institute.
 */
export function distinctiveName(key: string): string {
  return key
    .replace(/\bapplied sciences\b/g, ' ')
    .split(/\s+/)
    .filter((word) => word && !GENERIC_WORDS.has(word))
    .join(' ');
}

/**
 * The search the site itself sends, less paging and location. Verified against
 * the live feed on 2026-09-10, not assumed:
 *  - `sortNumber=0` makes the order stable. Without it, fetching the same page
 *    twice put only 32 of 100 rows in the same place, so a pass repeated some
 *    courses and missed others; with it, 100 of 100.
 *  - The other filters are neutral: 5,887 US courses with them, without them,
 *    and without categoryFilter="High".
 */
export const COURSE_SEARCH: Readonly<Record<string, string>> = {
  query: '""',
  courseLevel: 'undefined',
  academicScholarshipAvailable: 'false',
  earlyBirdScholarshipAvailable: 'false',
  attendanceTypes: 'undefined',
  subjects: 'undefined',
  intakes: 'undefined',
  intakeYears: 'undefined',
  intakeMonths: 'undefined',
  courseDurationTypes: 'undefined',
  institutionSlug: '""',
  expressOffer: 'false',
  budget: JSON.stringify({ min: 0, max: 214000 }),
  institution: 'undefined',
  sortNumber: '0',
  eligibilityCriteriaDetails: '{}',
  categoryFilter: '"High"',
  studiedMajor: 'undefined',
};

/**
 * The query string for one page of one country.
 *
 * Every value is encoded twice because that is what the site sends; a value
 * encoded once is a different question. `offset` is a page index — the server
 * skips offset × limit rows — so it is set from the page, not a row count.
 */
export function courseSearchQuery(country: string, page: number, limit: number): string {
  const params: Record<string, string> = {
    limit: String(limit),
    offset: String(page),
    locations: JSON.stringify([{ key: country, values: [] }]),
    ...COURSE_SEARCH,
  };

  return Object.entries(params)
    .map(([key, value]) => `${key}=${encodeURIComponent(encodeURIComponent(value))}`)
    .join('&');
}

/**
 * Where Edvoy names one of our countries differently. Measured across all 20
 * of our countries on 2026-09-10: this is the only one that differs.
 */
const EDVOY_COUNTRY_NAMES: Readonly<Record<string, string>> = { NL: 'Netherlands' };

export const edvoyCountryName = (code: string, ourName: string): string =>
  EDVOY_COUNTRY_NAMES[code] ?? ourName;

/**
 * Which of our countries a course's institution is in.
 *
 * The institution's own country wins where we recognise its name, so a course
 * cross-listed under a second country's search stays with its real campus.
 * Where the name is spelled differently from ours ("Netherlands"), the country
 * the course was fetched under is used instead.
 */
export function countryCodeFor(
  institutionCountry: string | null,
  fetchedUnder: string | undefined,
  codeByCountryName: ReadonlyMap<string, string>,
): string | undefined {
  return (
    (institutionCountry ? codeByCountryName.get(institutionCountry.toLowerCase()) : undefined) ??
    fetchedUnder
  );
}

/**
 * Hand-checked: an Edvoy institution, in one country, that is a record we
 * already hold under a name no rule can safely bridge. Keyed "edvoyId|CC" and
 * valued by our exact name in that country. Each was verified against our
 * table on 2026-09-10 — add to it only the same way, by looking.
 *
 * Keyed by country as well as id because campuses differ: BSBI's alias is its
 * Berlin record, and its Spanish and French campuses are not Berlin.
 */
export const INSTITUTION_ALIASES: Readonly<Record<string, string>> = {
  'university-of-nottingham-malaysia|MY': 'University of Nottingham Malaysia Campus',
  'georgian-college-of-applied-arts-and-technology|CA': 'Georgian College',
  'university-of-notre-dame|AU': 'The University of Notre Dame Australia',
  'ucam-catholic-university-of-murcia|ES': 'Universidad Católica de Murcia',
  'iqs-institut-quimic-de-sarria|ES': 'Institut Químic de Sarrià',
  'university-of-niagara-falls|CA': 'University of Niagara Falls Canada',
  'international-school-of-management-ism|DE': 'International School of Management',
  'berlin-school-of-business-and-innovation|DE': 'Berlin School of Business and Innovation GmbH',
  /* Renamed from University of Applied Sciences Europe in October 2020
     (Wikipedia, checked 2026-09-10). Its Dubai campus is not this record. */
  'university-of-europe-for-applied-sciences|DE': 'University of Applied Sciences Europe',
  /* OTA Hochschule (2002) -> SRH Hochschule Berlin (2007) -> SRH Berlin
     University of Applied Sciences (2019); our record carries the OTA name as
     an alias (Wikipedia, checked 2026-09-10). */
  'srh-berlin-university-of-applied-sciences|DE': 'SRH University Berlin',
};

export const institutionAlias = (ref: string, countryCode: string): string | undefined =>
  INSTITUTION_ALIASES[`${ref}|${countryCode}`];

export interface FeedInstitution {
  /** "edvoyId|CC": one per institution per country it teaches in. */
  key: string;
  ref: string;
  name: string;
  countryCode: string;
}

/**
 * Groups courses by institution *and* country.
 *
 * One Edvoy id can span countries — 21 of 335 did on 2026-09-10, covering
 * 3,922 courses. The University of Birmingham lists its Dubai campus under the
 * same id as Birmingham itself. Resolving an id once, in whichever country was
 * fetched first, would have moved all of Birmingham's courses to a new UAE
 * record (the UAE sorts before the UK) and all of Coventry's to Poland. Each
 * campus country is placed on its own instead, from the course's own address.
 *
 * A course whose country cannot be placed is returned in `unplaced`, keyed by
 * institution, rather than guessed at.
 */
export function groupByInstitutionAndCountry(
  courses: readonly NormalisedCourse[],
  fetchedUnder: ReadonlyMap<string, string>,
  codeByCountryName: ReadonlyMap<string, string>,
): {
  institutions: Map<string, FeedInstitution>;
  keyBySourceRef: Map<string, string>;
  unplaced: Map<string, string>;
} {
  const institutions = new Map<string, FeedInstitution>();
  const keyBySourceRef = new Map<string, string>();
  const unplaced = new Map<string, string>();

  for (const course of courses) {
    const countryCode = countryCodeFor(course.country, fetchedUnder.get(course.sourceRef), codeByCountryName);
    if (!countryCode) {
      unplaced.set(course.institutionRef, course.country ?? '(none)');
      continue;
    }

    const key = `${course.institutionRef}|${countryCode}`;
    keyBySourceRef.set(course.sourceRef, key);
    if (!institutions.has(key)) {
      institutions.set(key, { key, ref: course.institutionRef, name: course.institutionName, countryCode });
    }
  }

  return { institutions, keyBySourceRef, unplaced };
}

type IndexTarget = { id: string; slug: string; name: string };
type IndexHit = IndexTarget | 'ambiguous' | undefined;

/**
 * Our institutions, indexed for matching, per country.
 *
 * An institution's own name beats someone else's alias. "Franklin College" is
 * the name of a college in Indiana and also an alias of the University of
 * Georgia (its arts and sciences college); treating both as equal made a clean
 * match look ambiguous and dropped its courses. Two institutions with the same
 * *name* are still ambiguous and never resolved by picking one.
 */
export function indexInstitutions(
  rows: readonly { id: string; slug: string; name: string; aka: readonly string[]; countryCode: string }[],
): {
  exact: (countryCode: string, label: string) => IndexHit;
  byDistinctiveName: (countryCode: string, label: string) => IndexHit;
} {
  const byName = new Map<string, IndexTarget | 'ambiguous'>();
  const byAlias = new Map<string, IndexTarget | 'ambiguous'>();
  const byCore = new Map<string, IndexTarget | 'ambiguous'>();

  const add = (map: Map<string, IndexTarget | 'ambiguous'>, key: string, target: IndexTarget) => {
    const existing = map.get(key);
    map.set(key, existing && existing !== 'ambiguous' && existing.id !== target.id ? 'ambiguous' : target);
  };

  for (const row of rows) {
    const target = { id: row.id, slug: row.slug, name: row.name };
    add(byName, `${row.countryCode}|${institutionKey(row.name)}`, target);
    for (const alias of row.aka) add(byAlias, `${row.countryCode}|${institutionKey(alias)}`, target);
    for (const label of [row.name, ...row.aka]) {
      const core = distinctiveName(institutionKey(label));
      if (core) add(byCore, `${row.countryCode}|${core}`, target);
    }
  }

  return {
    exact: (countryCode, label) => {
      const key = `${countryCode}|${institutionKey(label)}`;
      return byName.get(key) ?? byAlias.get(key);
    },
    byDistinctiveName: (countryCode, label) => {
      const core = distinctiveName(institutionKey(label));
      return core ? byCore.get(`${countryCode}|${core}`) : undefined;
    },
  };
}

