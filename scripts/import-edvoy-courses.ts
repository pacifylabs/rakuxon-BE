import 'dotenv/config';

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { DataSource } from 'typeorm';

import { PublishStatus, TuitionPeriod } from '../src/contract/enums';
import { buildDataSourceOptions } from '../src/database/data-source';
import { Course } from '../src/modules/catalogue/entities/course.entity';
import { Institution } from '../src/modules/catalogue/entities/institution.entity';
import {
  courseSearchQuery,
  distinctiveName,
  edvoyCountryName,
  groupByInstitutionAndCountry,
  indexInstitutions,
  institutionAlias,
  institutionKey,
  normaliseEdvoyCourse,
} from './lib/edvoy-courses';
import type { EdvoyCourse, NormalisedCourse } from './lib/edvoy-courses';
import { paginate } from './lib/paginate';
import { connectWithRetry, withReconnect } from './lib/resilient-db';

/**
 * Imports the Edvoy course feed, under the provider's authorisation.
 *
 *   pnpm catalogue:import:edvoy-courses -- --dry-run      # fetch + report, write nothing
 *   pnpm catalogue:import:edvoy-courses                   # fetch + write
 *   pnpm catalogue:import:edvoy-courses -- --country=GB   # one of our countries only
 *   pnpm catalogue:import:edvoy-courses -- --refresh      # ignore the page cache
 *   pnpm catalogue:import:edvoy-courses -- --only-new     # insert new courses, leave saved ones alone
 *
 * Options: --page-size=100 (default), --delay-ms=1500 (default), and
 * --start-page=N to resume part-way through a country (needs --country).
 *
 * Fetched one of our countries at a time through the site's own location
 * filter, so each country's reported total is checked on its own and nothing is
 * fetched for countries we do not hold. Measured 2026-09-10: our 20 countries
 * cover 40,453 of the feed's ~40,460 courses. Every request is the site's own
 * search (scripts/lib/edvoy-courses.ts), including sortNumber=0, which makes the
 * order stable; `offset` is a page index (scripts/lib/paginate.ts).
 *
 * A guest on someone else's API, so it behaves like one: sequential requests,
 * a pause between them, an identifying user agent, Retry-After honoured, and a
 * 401/403 stops the run outright instead of being retried or worked around. If
 * the server caps the page size, the cap is adopted rather than fought.
 *
 * Fetched pages are cached locally, so a database failure on the write phase
 * re-runs without asking the provider for 40,000 rows a second time.
 */

const ENDPOINT = 'https://edvoy.com/api/courses/';
const USER_AGENT = 'RakuxonCatalogue/1.0 (https://rakuxon.com; enquiries@rakuxon.com)';
const SOURCE = 'edvoy';
/* A new directory, not the old one: those pages came from a different query
   (no location, no stable sort) and must not be mixed into these. */
const CACHE_DIR = join(__dirname, '.cache', 'edvoy-courses-by-country');
const MAX_ATTEMPTS = 5;
const WRITE_BATCH = 500;
/** Empty pages in a row before concluding the feed will not page further. */
const MAX_CONSECUTIVE_EMPTY = 3;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Never retried: an access decision is the provider's, not a transient. */
class FatalFeedError extends Error {}

class RetryableFeedError extends Error {
  constructor(
    message: string,
    readonly waitMs?: number,
  ) {
    super(message);
  }
}

interface Page {
  count: number;
  items: EdvoyCourse[];
}

interface Options {
  dryRun: boolean;
  refresh: boolean;
  pageSize: number;
  delayMs: number;
  startPage: number;
  /** One of our country codes, to fetch just that country. */
  country: string | null;
  /** Insert courses not yet saved; leave saved ones untouched. */
  onlyNew: boolean;
}

function parseOptions(argv: readonly string[]): Options {
  const numeric = (flag: string, fallback: number, min: number, max: number) => {
    const raw = argv.find((arg) => arg.startsWith(`--${flag}=`))?.split('=')[1];
    if (raw === undefined) return fallback;
    const value = Number(raw);
    if (!Number.isInteger(value) || value < min || value > max) {
      throw new FatalFeedError(`--${flag} must be an integer from ${min} to ${max}`);
    }
    return value;
  };

  const country = argv.find((arg) => arg.startsWith('--country='))?.split('=')[1]?.toUpperCase() ?? null;
  if (country !== null && !/^[A-Z]{2}$/.test(country)) {
    throw new FatalFeedError('--country must be a two-letter country code, e.g. --country=GB');
  }

  const startPage = numeric('start-page', 0, 0, 1_000_000);
  /* A page number only means something within one country's results. */
  if (startPage > 0 && country === null) {
    throw new FatalFeedError('--start-page needs --country: page numbers are per country.');
  }

  return {
    dryRun: argv.includes('--dry-run'),
    refresh: argv.includes('--refresh'),
    pageSize: numeric('page-size', 100, 1, 500),
    /* Floor of half a second: below that it stops being a courtesy. */
    delayMs: numeric('delay-ms', 1500, 500, 60_000),
    startPage,
    country,
    onlyNew: argv.includes('--only-new'),
  };
}

/**
 * One page of one country's results. `offset` goes out as the feed expects it,
 * a page index: the server skips offset × limit rows.
 */
async function requestPage(country: string, page: number, limit: number): Promise<Page> {
  const url = `${ENDPOINT}?${courseSearchQuery(country, page, limit)}`;
  const response = await fetch(url, {
    headers: { accept: 'application/json', 'user-agent': USER_AGENT },
    signal: AbortSignal.timeout(60_000),
  });

  if (response.status === 401 || response.status === 403) {
    throw new FatalFeedError(
      `Feed refused access (${response.status}). Stopping — this is not retried or worked around.`,
    );
  }
  if (response.status === 429 || response.status >= 500) {
    const retryAfter = Number(response.headers.get('retry-after'));
    throw new RetryableFeedError(
      `Feed responded ${response.status}`,
      Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : undefined,
    );
  }
  if (!response.ok) throw new FatalFeedError(`Feed responded ${response.status}`);

  const payload = (await response.json()) as {
    data?: { searchCourse?: { count?: unknown; items?: unknown } };
  };
  const count = payload.data?.searchCourse?.count;
  const items = payload.data?.searchCourse?.items;

  /* A changed shape is a stop, not a retry: guessing at a new schema is how
     40,000 rows get written wrong in one go. */
  if (typeof count !== 'number' || !Array.isArray(items)) {
    throw new FatalFeedError('Feed returned an unexpected shape; stopping.');
  }

  return { count, items: items as EdvoyCourse[] };
}

async function fetchPage(country: string, page: number, limit: number): Promise<Page> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await requestPage(country, page, limit);
    } catch (error) {
      if (error instanceof FatalFeedError || attempt >= MAX_ATTEMPTS) throw error;

      const wait =
        error instanceof RetryableFeedError && error.waitMs !== undefined
          ? error.waitMs
          : 5000 * 2 ** (attempt - 1);
      process.stdout.write(
        `    ${country} page ${page}: ${error instanceof Error ? error.message : String(error)}; retrying in ${Math.round(wait / 1000)}s\n`,
      );
      await sleep(wait);
    }
  }
}

/**
 * One page, from the local cache when we have it.
 *
 * Empty pages are never cached, and a cached empty page is never trusted:
 * freezing an empty response on disk turns a one-off into a permanent answer,
 * which is what the second run did when it replayed an empty page instead of
 * asking again.
 */
async function getPage(
  code: string,
  edvoyName: string,
  page: number,
  limit: number,
  options: Options,
): Promise<{ page: Page; fromNetwork: boolean }> {
  const file = join(CACHE_DIR, code, `page-${page}-limit-${limit}.json`);

  if (!options.refresh) {
    try {
      const cached = JSON.parse(await readFile(file, 'utf8')) as Page;
      if (cached.items.length > 0) return { page: cached, fromNetwork: false };
    } catch {
      /* Not cached yet — fall through to the network. */
    }
  }

  const fetched = await fetchPage(edvoyName, page, limit);
  if (fetched.items.length > 0) await writeFile(file, JSON.stringify(fetched));
  return { page: fetched, fromNetwork: true };
}

interface OurCountry {
  code: string;
  name: string;
}

interface CountryTally extends OurCountry {
  reported: number;
  fetched: number;
  stoppedEarly: boolean;
}

/** A feed row, tagged with the country it was fetched under. */
interface FetchedRow {
  row: EdvoyCourse;
  code: string;
}

/**
 * The countries we publish, spelled as we spell them — the same set the site's
 * country menus read, so courses are only fetched where we can show them.
 */
async function ourCountries(dataSource: DataSource, only: string | null): Promise<OurCountry[]> {
  const rows = (await withReconnect(dataSource, () =>
    dataSource.query(
      `SELECT "countryCode" AS code, min(country) AS name FROM institutions
        WHERE status = $1 GROUP BY "countryCode" ORDER BY min(country)`,
      [PublishStatus.Published],
    ),
  )) as OurCountry[];

  if (only === null) return rows;

  const match = rows.filter((row) => row.code === only);
  if (match.length === 0) throw new FatalFeedError(`${only} is not one of our countries.`);
  return match;
}

async function fetchAll(
  options: Options,
  countries: readonly OurCountry[],
): Promise<{ rows: FetchedRow[]; tallies: CountryTally[] }> {
  const rows: FetchedRow[] = [];
  const tallies: CountryTally[] = [];

  for (const country of countries) {
    const edvoyName = edvoyCountryName(country.code, country.name);
    process.stdout.write(`\n${country.code} ${country.name}\n`);
    await mkdir(join(CACHE_DIR, country.code), { recursive: true });

    const result = await paginate<EdvoyCourse>({
      pageSize: options.pageSize,
      startPage: options.startPage,
      maxConsecutiveEmpty: MAX_CONSECUTIVE_EMPTY,
      fetchPage: (page, limit) => getPage(country.code, edvoyName, page, limit, options),
      pause: () => sleep(options.delayMs),
      log: (line) => process.stdout.write(`  ${line}\n`),
    });

    for (const row of result.items) rows.push({ row, code: country.code });
    tallies.push({
      ...country,
      reported: result.reported,
      fetched: result.items.length,
      stoppedEarly: result.stoppedEarly,
    });
  }

  return { rows, tallies };
}

function slugify(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

interface ResolvedInstitution {
  id: string;
  slug: string;
  /** Ours, for the report; absent on rows created during this run. */
  name?: string;
}

/**
 * Finds each feed institution among ours, creating the ones we do not hold.
 *
 * Matched on normalised name within the same country — never across countries,
 * because "University of York" exists in England and in Canada. A name that
 * matches two of our institutions is ambiguous, and its courses are skipped
 * and reported rather than attached to whichever row came first.
 *
 * The country comes from the institution's own address where we recognise the
 * name, else from the country the course was fetched under (countryCodeFor).
 */
async function resolveInstitutions(
  dataSource: DataSource,
  courses: readonly NormalisedCourse[],
  fetchedUnder: ReadonlyMap<string, string>,
  dryRun: boolean,
) {
  const repo = dataSource.getRepository(Institution);
  const ours = await withReconnect(dataSource, () =>
    repo.find({ select: { id: true, slug: true, name: true, aka: true, country: true, countryCode: true } }),
  );

  const codeByCountry = new Map<string, string>();
  const nameByCode = new Map<string, string>();
  /* Name, then alias, then distinctive name: see indexInstitutions. */
  const index = indexInstitutions(ours);
  /* Report-only: looser word overlap is right often but wrong dangerously. */
  const tokensByCode = new Map<string, { name: string; tokens: Set<string> }[]>();
  const takenSlugs = new Set<string>();

  for (const row of ours) {
    codeByCountry.set(row.country.toLowerCase(), row.countryCode);
    nameByCode.set(row.countryCode, row.country);
    takenSlugs.add(row.slug.toLowerCase());

    const tokens = new Set(distinctiveName(institutionKey(row.name)).split(' ').filter(Boolean));
    const list = tokensByCode.get(row.countryCode) ?? [];
    list.push({ name: row.name, tokens });
    tokensByCode.set(row.countryCode, list);
  }

  /* One group per institution per country: see groupByInstitutionAndCountry. */
  const { institutions: feedInstitutions, keyBySourceRef, unplaced } = groupByInstitutionAndCountry(
    courses,
    fetchedUnder,
    codeByCountry,
  );

  const resolved = new Map<string, ResolvedInstitution>();
  const skipped = new Map<string, string>();
  for (const [ref, label] of unplaced) skipped.set(ref, `unknown country "${label}"`);
  let matched = 0;
  const toCreate: {
    key: string;
    ref: string;
    name: string;
    country: string;
    countryCode: string;
    slug: string;
    possibleDuplicates: string[];
  }[] = [];
  const matchedByRule: { feed: string; ours: string; countryCode: string; how: string }[] = [];

  for (const { key, ref, name, countryCode } of feedInstitutions.values()) {
    /* Hand-checked aliases first: they exist because no rule bridges them. */
    const alias = institutionAlias(ref, countryCode);
    if (alias !== undefined) {
      const target = index.exact(countryCode, alias);
      if (!target || target === 'ambiguous') {
        skipped.set(key, `alias "${alias}" does not name exactly one of our institutions in ${countryCode}`);
        continue;
      }
      resolved.set(key, target);
      matched += 1;
      matchedByRule.push({ feed: name, ours: alias, countryCode, how: 'alias' });
      continue;
    }

    const hit = index.exact(countryCode, name);
    if (hit === 'ambiguous') {
      skipped.set(key, `"${name}" matches more than one institution`);
      continue;
    }
    if (hit) {
      resolved.set(key, hit);
      matched += 1;
      continue;
    }

    const core = distinctiveName(institutionKey(name));
    const coreHit = index.byDistinctiveName(countryCode, name);
    if (coreHit === 'ambiguous') {
      skipped.set(key, `"${name}" matches more than one institution by distinctive name`);
      continue;
    }
    if (coreHit) {
      resolved.set(key, coreHit);
      matched += 1;
      matchedByRule.push({ feed: name, ours: coreHit.name ?? coreHit.slug, countryCode, how: 'distinctive name' });
      continue;
    }

    const tokens = new Set(core.split(' ').filter(Boolean));
    const isSubset = (x: Set<string>, y: Set<string>) => [...x].every((word) => y.has(word));
    const possibleDuplicates = (tokensByCode.get(countryCode) ?? [])
      .filter(
        (ours) =>
          tokens.size > 0 && ours.tokens.size > 0 && (isSubset(tokens, ours.tokens) || isSubset(ours.tokens, tokens)),
      )
      .map((ours) => ours.name)
      .slice(0, 3);

    let slug = slugify(ref) || slugify(name);
    if (takenSlugs.has(slug)) slug = `${slug}-${countryCode.toLowerCase()}`;
    for (let n = 2; takenSlugs.has(slug); n += 1) slug = `${slugify(ref)}-${n}`;
    takenSlugs.add(slug);

    /* Our spelling of the country, not the feed's, so our own rows agree. */
    toCreate.push({
      key,
      ref,
      name,
      country: nameByCode.get(countryCode) ?? countryCode,
      countryCode,
      slug,
      possibleDuplicates,
    });
  }

  if (!dryRun && toCreate.length > 0) {
    const stamped = new Date();
    for (let start = 0; start < toCreate.length; start += WRITE_BATCH) {
      const batch = toCreate.slice(start, start + WRITE_BATCH);
      const inserted = await withReconnect(dataSource, () =>
        repo
          .createQueryBuilder()
          .insert()
          .values(
            batch.map((entry) => ({
              slug: entry.slug,
              name: entry.name,
              country: entry.country,
              countryCode: entry.countryCode,
              status: PublishStatus.Published,
              source: SOURCE,
              /* Left null on purpose: the Wikidata enrichment reads sourceUrl
                 as a ROR id, and an Edvoy URL there would be sent as one. */
              sourceUrl: null,
              retrievedAt: stamped,
            })),
          )
          .returning(['id', 'slug'])
          .execute(),
      );

      /* Mapped back by slug, not position: Postgres does not promise that
         RETURNING rows come back in VALUES order. */
      const keyBySlug = new Map(batch.map((entry) => [entry.slug, entry.key]));
      for (const row of inserted.raw as { id: string; slug: string }[]) {
        const key = keyBySlug.get(row.slug);
        if (key) resolved.set(key, { id: row.id, slug: row.slug });
      }
    }
  }

  return {
    resolved,
    skipped,
    matched,
    created: toCreate.length,
    newInstitutions: toCreate.map(({ key, name, countryCode, possibleDuplicates }) => ({
      key,
      name,
      countryCode,
      possibleDuplicates,
    })),
    matchedByRule,
    keyBySourceRef,
  };
}

/** Columns a re-import may overwrite. Slug and status are not among them:
    links must stay stable, and an admin's suspension must survive a refresh. */
const UPDATABLE = [
  'institutionId',
  'title',
  'level',
  'disciplines',
  'overview',
  'tuitionAmount',
  'tuitionCurrency',
  'tuitionIsEstimate',
  'fastTrackOffer',
  'retrievedAt',
];

async function writeCourses(
  dataSource: DataSource,
  courses: readonly NormalisedCourse[],
  resolved: ReadonlyMap<string, ResolvedInstitution>,
  keyBySourceRef: ReadonlyMap<string, string>,
  onlyNew: boolean,
) {
  const existing = (await withReconnect(dataSource, () =>
    dataSource.query(`SELECT slug::text AS slug, source, "sourceRef" FROM courses`),
  )) as { slug: string; source: string | null; sourceRef: string | null }[];

  const slugByRef = new Map<string, string>();
  const takenSlugs = new Set<string>();
  for (const row of existing) {
    takenSlugs.add(row.slug.toLowerCase());
    if (row.source === SOURCE && row.sourceRef) slugByRef.set(row.sourceRef, row.slug);
  }

  const stamped = new Date();
  const rows = courses.flatMap((course) => {
    const key = keyBySourceRef.get(course.sourceRef);
    const institution = key ? resolved.get(key) : undefined;
    if (!institution) return [];

    let slug = slugByRef.get(course.sourceRef);
    if (!slug) {
      const base = `${institution.slug}-${course.courseSlug}`;
      slug = base;
      for (let n = 2; takenSlugs.has(slug.toLowerCase()); n += 1) slug = `${base}-${n}`;
      takenSlugs.add(slug.toLowerCase());
    }

    return [
      {
        slug,
        institutionId: institution.id,
        title: course.title,
        level: course.level,
        disciplines: course.disciplines,
        durationMonths: null,
        overview: course.overview,
        tuitionAmount: course.tuitionAmount,
        tuitionCurrency: course.tuitionCurrency,
        tuitionPeriod: TuitionPeriod.Year,
        tuitionIsInternational: true,
        tuitionIsEstimate: course.tuitionAmount !== null,
        fastTrackOffer: course.fastTrackOffer,
        status: PublishStatus.Published,
        source: SOURCE,
        sourceRef: course.sourceRef,
        sourceUrl: null,
        retrievedAt: stamped,
      },
    ];
  });

  /* --only-new leaves saved rows alone, so adding a few hundred courses does
     not mean re-sending forty thousand over a slow connection. */
  const toWrite = onlyNew ? rows.filter((row) => !slugByRef.has(row.sourceRef)) : rows;
  const updated = toWrite.filter((row) => slugByRef.has(row.sourceRef)).length;

  for (let start = 0; start < toWrite.length; start += WRITE_BATCH) {
    const batch = toWrite.slice(start, start + WRITE_BATCH);
    await withReconnect(dataSource, () =>
      dataSource
        .createQueryBuilder()
        .insert()
        .into(Course)
        .values(batch)
        .orUpdate(UPDATABLE, ['source', 'sourceRef'])
        .execute(),
    );

    /* Every batch: over a slow connection a long silence looks like a hang. */
    process.stdout.write(
      `  wrote ${Math.min(start + WRITE_BATCH, toWrite.length).toLocaleString('en-GB')}/${toWrite.length.toLocaleString('en-GB')}\n`,
    );
  }

  /* Reported, never deleted: a course dropping out of one fetch is not proof
     it has closed, and deleting takes its links with it. */
  const stale = (await withReconnect(dataSource, () =>
    dataSource.query(
      `SELECT count(*)::int AS n FROM courses WHERE source = $1 AND NOT ("sourceRef" = ANY($2::text[]))`,
      /* Against everything fetched, not only what was written: with
         --only-new the written set is a small slice. */
      [SOURCE, courses.map((course) => course.sourceRef)],
    ),
  )) as { n: number }[];

  return {
    written: toWrite.length,
    inserted: toWrite.length - updated,
    updated,
    kept: rows.length - toWrite.length,
    stale: stale[0]?.n ?? 0,
  };
}

async function main(): Promise<void> {
  const options = parseOptions(process.argv.slice(2));
  const dataSource = new DataSource(buildDataSourceOptions());

  /* Read the country list, then let the connection go: a full fetch takes a
     quarter of an hour, and an idle connection to hosted Postgres rarely
     survives that. It is opened again for the writes. */
  await connectWithRetry(dataSource);
  const countries = await ourCountries(dataSource, options.country).finally(() => dataSource.destroy());

  const { rows, tallies } = await fetchAll(options, countries);
  const reported = tallies.reduce((sum, tally) => sum + tally.reported, 0);

  const unique = new Map<string, NormalisedCourse>();
  const fetchedUnder = new Map<string, string>();
  const rejected = new Map<string, number>();
  for (const { row, code } of rows) {
    const result = normaliseEdvoyCourse(row);
    if (!result.ok) {
      rejected.set(result.reason, (rejected.get(result.reason) ?? 0) + 1);
      continue;
    }
    /* A course listed under two countries arrives twice; it is one course. */
    unique.set(result.course.sourceRef, result.course);
    fetchedUnder.set(result.course.sourceRef, code);
  }

  process.stdout.write('\nPer country, reported by the feed -> fetched:\n');
  for (const tally of tallies) {
    const short = options.startPage === 0 && tally.fetched < tally.reported;
    process.stdout.write(
      `  ${tally.code} ${tally.name.padEnd(22)} ${tally.reported.toLocaleString('en-GB').padStart(7)} -> ` +
        `${tally.fetched.toLocaleString('en-GB').padStart(7)}` +
        `${short ? `  SHORT: re-run with --country=${tally.code} --refresh` : ''}\n`,
    );
  }

  process.stdout.write(
    `\nFetched ${rows.length.toLocaleString('en-GB')} rows, ${unique.size.toLocaleString('en-GB')} unique of ${reported.toLocaleString('en-GB')} reported.\n`,
  );
  for (const [reason, n] of [...rejected].sort((a, b) => b[1] - a[1])) {
    process.stdout.write(`  rejected ${n.toLocaleString('en-GB')}: ${reason}\n`);
  }

  await connectWithRetry(dataSource);

  try {
    const courses = [...unique.values()];
    const { resolved, skipped, matched, created, newInstitutions, matchedByRule, keyBySourceRef } =
      await resolveInstitutions(
      dataSource,
      courses,
      fetchedUnder,
      options.dryRun,
    );

    process.stdout.write(
      `\nInstitutions: ${matched} matched to ours, ${created} ${options.dryRun ? 'would be' : ''} created, ${skipped.size} skipped.\n`,
    );
    for (const [ref, reason] of [...skipped].slice(0, 25)) {
      process.stdout.write(`  skipped ${ref}: ${reason}\n`);
    }
    if (skipped.size > 25) process.stdout.write(`  …and ${skipped.size - 25} more\n`);

    /* Listed so a dry run can be checked for near-duplicates of institutions we
       already hold under a slightly different name: creating one is easy,
       merging two later is not. */
    for (const entry of matchedByRule) {
      process.stdout.write(`  matched by ${entry.how}: ${entry.feed} -> ${entry.ours} (${entry.countryCode})\n`);
    }
    /* Every one, largest first: this list is what a person reviews before a
       real run creates institutions, and a truncated list cannot be reviewed. */
    const coursesByKey = new Map<string, number>();
    for (const key of keyBySourceRef.values()) coursesByKey.set(key, (coursesByKey.get(key) ?? 0) + 1);
    const byCourses = [...newInstitutions].sort(
      (a, b) => (coursesByKey.get(b.key) ?? 0) - (coursesByKey.get(a.key) ?? 0),
    );
    for (const entry of byCourses) {
      const hint = entry.possibleDuplicates.length > 0 ? `  [check: ${entry.possibleDuplicates.join(' | ')}]` : '';
      process.stdout.write(
        `  ${options.dryRun ? 'would create' : 'created'}: ${entry.name} ` +
          `(${entry.countryCode}, ${coursesByKey.get(entry.key) ?? 0} courses)${hint}\n`,
      );
    }

    const reachable = courses.filter((course) => {
      const key = keyBySourceRef.get(course.sourceRef);
      return key !== undefined && !skipped.has(key);
    }).length;

    if (options.dryRun) {
      process.stdout.write(`\nDry run: ${reachable.toLocaleString('en-GB')} courses would be written. Nothing was.\n`);
      return;
    }

    const result = await writeCourses(dataSource, courses, resolved, keyBySourceRef, options.onlyNew);
    process.stdout.write(
      `\nCourses: ${result.inserted.toLocaleString('en-GB')} inserted, ${result.updated.toLocaleString('en-GB')} updated` +
        (options.onlyNew ? `, ${result.kept.toLocaleString('en-GB')} already saved and left as they were` : '') +
        '.\n' +
        `${result.stale.toLocaleString('en-GB')} previously imported courses were not in this fetch (kept, not deleted).\n`,
    );
  } finally {
    await dataSource.destroy();
  }
}

main().catch((error: unknown) => {
  process.stderr.write(
    error instanceof Error
      ? `${error.name}: ${error.message || '(no message)'}\n${error.stack ?? ''}\n`
      : `Non-error thrown: ${JSON.stringify(error)}\n`,
  );
  process.exitCode = 1;
});
