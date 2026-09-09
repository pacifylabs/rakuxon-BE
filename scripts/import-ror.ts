import 'dotenv/config';

import { DataSource } from 'typeorm';

import { PublishStatus } from '../src/contract/enums';
import { buildDataSourceOptions } from '../src/database/data-source';
import { Institution } from '../src/modules/catalogue/entities/institution.entity';

/**
 * Imports institutions from the Research Organization Registry.
 *
 * ROR is CC0, versioned, documented, needs no key, and is maintained by the
 * organisations themselves — so unlike a competitor's internal endpoint it is
 * safe to depend on and safe to republish. It also carries acronyms, which is
 * what makes "UoM" and "UofT" find anything.
 *
 *   pnpm catalogue:import:ror GB CA IE
 *   pnpm catalogue:import:ror --all
 *   pnpm catalogue:import:ror GB --include-schools
 *
 * Everything lands as `draft`. Publishing is a deliberate act — ROR lists
 * every education organisation, grammar schools included, and a catalogue is
 * only useful once someone has decided what belongs in it.
 */

const ROR_ENDPOINT = 'https://api.ror.org/v2/organizations';

/** The destinations the site covers, from the country menu. */
const DEFAULT_COUNTRIES = [
  'GB', 'CA', 'IE', 'US', 'NZ', 'AU', 'CH', 'AE', 'FR', 'NL',
  'GD', 'ES', 'PL', 'DE', 'IT', 'MU', 'MY', 'HU', 'CY', 'MT',
] as const;

/**
 * Higher education, roughly, in the languages these countries use.
 *
 * ROR's `education` type covers primary and secondary schools too, and a
 * study-abroad catalogue listing a grammar school is noise a human then has to
 * clear.
 *
 * The first version matched English only, and quietly dropped most of the
 * non-English world: Universidad, Hochschule, Uniwersytet, Politecnico and
 * Egyetem all failed it, which is why Germany returned fifteen institutions
 * and Spain fifty-nine. Names are compared with accents stripped, so
 * "Université" and "Universite" behave the same.
 *
 * A bare "school" is still excluded — it matches far more secondary schools
 * than it does schools of medicine.
 */
const HIGHER_ED = new RegExp(
  [
    'universit', // English, French, Dutch, Italian, Malay, German (Universität)
    'universidad', // Spanish
    'universidade', // Portuguese
    'uniwersytet', // Polish
    'hochschule', // German, incl. Fachhochschule
    'college',
    'institut', // English, French, German, Spanish
    'politec|politehnic|politechnik', // Italian, Spanish, Polish
    'polytechnic',
    'egyetem|foiskola', // Hungarian
    'academi|akadem|accademia', // English, Polish, German, Italian
    'conservatoire|conservatorio',
    'ecole|escuela|escola|scuola', // French, Spanish, Portuguese, Italian
    'hogeschool', // Dutch
    'kolej', // Malay
    'school of',
  ].join('|'),
  'i',
);

/** Accents stripped, so one spelling of a word matches the other. */
const fold = (value: string) => value.normalize('NFD').replace(/[̀-ͯ]/g, '');

interface RorName {
  value?: string;
  types?: string[];
}

interface RorOrganization {
  id?: string;
  names?: RorName[];
  links?: { type?: string; value?: string }[];
  locations?: {
    geonames_details?: { country_code?: string; country_name?: string; name?: string };
  }[];
}

const MAX_ATTEMPTS = 4;

/** Countries per request. Large enough to matter, small enough that a failed
    batch is cheap to retry. */
const BATCH_SIZE = 5;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Postgres errors that mean "the connection went away", not "the data is wrong".
 *
 * A hosted database drops idle pooled connections, and Neon suspends a compute
 * that has been quiet. Over an import that runs for minutes this is expected,
 * not exceptional — the first version retried the HTTP fetch but left the
 * writes bare, so two batches died on `Connection terminated unexpectedly` and
 * `read ETIMEDOUT` after doing most of their work.
 */
const TRANSIENT_DB = /connection terminated|ETIMEDOUT|ECONNRESET|EPIPE|Connection lost|server closed/i;

/**
 * Runs a write, reconnecting if the pool has dropped underneath it.
 *
 * Retrying alone is not enough: once the DataSource is destroyed every
 * subsequent query fails the same way, so it has to be re-initialised before
 * the retry can succeed.
 */
async function withReconnect<T>(
  dataSource: DataSource,
  work: () => Promise<T>,
  attempt = 1,
): Promise<T> {
  try {
    return await work();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!TRANSIENT_DB.test(message) || attempt >= MAX_ATTEMPTS) throw error;

    await sleep(1000 * 2 ** (attempt - 1));
    if (!dataSource.isInitialized) await dataSource.initialize();

    return withReconnect(dataSource, work, attempt + 1);
  }
}

/** "Université de Montréal" must reach universite-de-montreal, not universit-de-montral. */
function slugify(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function displayName(org: RorOrganization): string | undefined {
  return (
    org.names?.find((name) => name.types?.includes('ror_display'))?.value ?? org.names?.[0]?.value
  );
}

/** Acronyms and alternates. Without these, nobody finds "UoM". */
function aliases(org: RorOrganization, primary: string): string[] {
  const found = (org.names ?? [])
    .filter((name) => name.types?.some((type) => type === 'acronym' || type === 'alias'))
    .map((name) => name.value)
    .filter((value): value is string => Boolean(value) && value !== primary);

  return [...new Set(found)];
}

/**
 * One page, retried.
 *
 * A single transient "fetch failed" used to abort the entire run — twelve
 * countries in, on page four of Poland, taking the remaining eight with it.
 * An import that walks thousands of pages over a public API will meet a
 * dropped connection; treating that as fatal is the bug, not the network.
 */
async function fetchPage(
  countryCodes: readonly string[],
  page: number,
  attempt = 1,
): Promise<{ items: RorOrganization[]; total: number }> {
  /*
   * One request per batch of countries rather than per country.
   *
   * `filter` combines terms with AND, so it cannot express "GB or IE".
   * `query.advanced` takes Elasticsearch syntax and can, which turns twenty
   * paginated streams into four — and, because the existing-rows index is
   * loaded once per stream, twenty full-table reads into four as well.
   */
  const countries = countryCodes.join(' OR ');
  const advanced = `types:education AND locations.geonames_details.country_code:(${countries})`;
  const url = `${ROR_ENDPOINT}?query.advanced=${encodeURIComponent(advanced)}&page=${page}`;

  try {
    const response = await fetch(url, { headers: { accept: 'application/json' } });

    /* 429 and 5xx are worth retrying; a 400 means the query is wrong and will
       stay wrong however many times it is sent. */
    if (response.status === 429 || response.status >= 500) {
      throw new Error(`ROR responded ${response.status}`);
    }
    if (!response.ok) {
      throw Object.assign(new Error(`ROR responded ${response.status}`), { fatal: true });
    }

    const payload = (await response.json()) as {
      items?: RorOrganization[];
      number_of_results?: number;
    };

    return { items: payload.items ?? [], total: payload.number_of_results ?? 0 };
  } catch (error) {
    if ((error as { fatal?: boolean }).fatal || attempt >= MAX_ATTEMPTS) throw error;

    /* Exponential backoff: 1s, 2s, 4s. */
    await sleep(1000 * 2 ** (attempt - 1));
    return fetchPage(countryCodes, page, attempt + 1);
  }
}

async function importCountries(
  dataSource: DataSource,
  countryCodes: readonly string[],
  includeSchools: boolean,
): Promise<{ seen: number; written: number }> {
  const repo = dataSource.getRepository(Institution);
  const retrievedAt = new Date();

  /*
   * Both indexes are loaded once per country rather than queried per row.
   *
   * The first version issued a findOne for the slug and another for the
   * sourceUrl on every institution — two round trips each, which against a
   * hosted database is most of the runtime. One query up front is the same
   * information.
   */
  const existing = await withReconnect(dataSource, () =>
    repo.find({ select: { id: true, slug: true, sourceUrl: true } }),
  );
  const bySource = new Map(
    existing.filter((row) => row.sourceUrl).map((row) => [row.sourceUrl as string, row.id]),
  );
  const slugOwner = new Map(existing.map((row) => [row.slug, row.sourceUrl ?? '']));

  /*
   * ROR's pagination is not stable: the same organisation comes back on more
   * than one page — 106 items for one batch contained only 95 distinct ids.
   * Without this the counter double-counts and the run reports more imported
   * than the table holds, which is exactly the discrepancy that prompted the
   * check.
   */
  const processed = new Set<string>();
  let page = 1;
  let seen = 0;
  let written = 0;
  let total = Infinity;

  while (seen < total) {
    const { items, total: reported } = await fetchPage(countryCodes, page);
    total = reported;
    if (items.length === 0) break;

    for (const org of items) {
      seen += 1;
      const name = displayName(org);
      const location = org.locations?.[0]?.geonames_details;
      if (!name || !org.id || !location?.country_code) continue;
      if (processed.has(org.id)) continue;
      if (!includeSchools && !HIGHER_ED.test(fold(name))) continue;
      processed.add(org.id);

      /*
       * Slug collisions are real: "Trinity College" exists in several
       * countries. The country code disambiguates without making every slug
       * ugly, and the ROR id is the last resort.
       */
      const base = slugify(name);
      let slug = base;
      const takenBySomeoneElse = (candidate: string) => {
        const owner = slugOwner.get(candidate);
        return owner !== undefined && owner !== org.id;
      };

      if (takenBySomeoneElse(slug)) {
        slug = `${base}-${location.country_code.toLowerCase()}`;
        if (takenBySomeoneElse(slug)) slug = `${base}-${slugify(org.id.slice(-8))}`;
      }

      const values = {
        slug,
        name,
        aka: aliases(org, name),
        country: location.country_name ?? location.country_code,
        countryCode: location.country_code.toUpperCase(),
        city: location.name ?? null,
        website: org.links?.find((link) => link.type === 'website')?.value ?? null,
        status: PublishStatus.Draft,
        source: 'ROR',
        sourceUrl: org.id,
        retrievedAt,
      };

      /*
       * Upsert on sourceUrl, not slug: a name can be corrected upstream, and
       * matching on the derived slug would then create a second row for the
       * same institution rather than updating the one that exists.
       */
      const known = bySource.get(org.id);
      if (known) {
        await withReconnect(dataSource, () => repo.update(known, values));
      } else {
        const inserted = await withReconnect(dataSource, () => repo.insert(values));
        bySource.set(org.id, (inserted.identifiers[0] as { id: string }).id);
      }
      slugOwner.set(slug, org.id);
      written += 1;
    }

    page += 1;
    /* Courtesy to a free public service that asks for no key. */
    await sleep(120);
  }

  return { seen, written };
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const includeSchools = args.includes('--include-schools');
  const codes = args.filter((arg) => /^[A-Za-z]{2}$/.test(arg)).map((arg) => arg.toUpperCase());
  const countries = codes.length > 0 ? codes : [...DEFAULT_COUNTRIES];

  const dataSource = new DataSource(buildDataSourceOptions());
  await dataSource.initialize();

  try {
    let grandTotal = 0;

    const failed: string[] = [];

    /* Batched, but not all at once: a single failure should cost one batch to
       re-run, not the whole world. */
    for (let index = 0; index < countries.length; index += BATCH_SIZE) {
      const batch = countries.slice(index, index + BATCH_SIZE);
      process.stdout.write(`${batch.join('+')} ... `);

      try {
        const { seen, written } = await importCountries(dataSource, batch, includeSchools);
        grandTotal += written;
        process.stdout.write(`${written} kept of ${seen} listed\n`);
      } catch (error) {
        /* One batch failing must not cost the others. The import is
           idempotent, so a re-run picks up exactly what was missed. */
        failed.push(...batch);
        process.stdout.write(
          `failed (${error instanceof Error ? error.message : String(error)})\n`,
        );
      }
    }

    if (failed.length > 0) {
      process.stdout.write(
        `\n${failed.length} country(ies) failed. Re-run just those:\n` +
          `  pnpm catalogue:import:ror ${failed.join(' ')}\n`,
      );
    }

    process.stdout.write(
      `\n${grandTotal} institutions imported as drafts. Publish with:\n` +
        `  UPDATE institutions SET status='published' WHERE "countryCode"='GB';\n`,
    );
  } finally {
    await dataSource.destroy();
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
