import 'dotenv/config';

import { DataSource, IsNull } from 'typeorm';

import { buildDataSourceOptions } from '../src/database/data-source';
import { withReconnect } from './lib/resilient-db';
import { Institution } from '../src/modules/catalogue/entities/institution.entity';

/**
 * Fills in what the registry does not carry, from Wikidata.
 *
 * Joined on the ROR id, which both sides already hold (Wikidata property
 * P6782). That matters more than it sounds: matching institutions by name
 * across sources is where enrichment usually goes wrong — "University of York"
 * exists in England and in Canada — and an identifier join simply cannot make
 * that mistake.
 *
 *   pnpm catalogue:enrich            # everything not yet enriched
 *   pnpm catalogue:enrich --recheck  # including rows done before
 *
 * Wikidata is CC0. Everything written here is a fact about the institution,
 * and every row records when it was enriched so a stale value is visible.
 */

const SPARQL = 'https://query.wikidata.org/sparql';

/**
 * A courtesy the endpoint asks for by name: an anonymous agent gets throttled
 * hard, an identifiable one does not.
 */
const USER_AGENT = 'RakuxonCatalogue/1.0 (https://rakuxon.com; enquiries@rakuxon.com)';

/** Enough to be worth a round trip, small enough not to time the query out. */
const BATCH_SIZE = 60;
const MAX_ATTEMPTS = 4;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

interface Binding {
  ror?: { value: string };
  item?: { value: string };
  desc?: { value: string };
  inception?: { value: string };
  students?: { value: string };
  logo?: { value: string };
}

/** "https://ror.org/04xvc2q17" -> "04xvc2q17", which is what Wikidata stores. */
const rorId = (sourceUrl: string) => sourceUrl.replace(/^.*\/(?=[^/]+$)/, '');

function buildQuery(ids: readonly string[]): string {
  const values = ids.map((id) => `"${id}"`).join(' ');

  return `
    SELECT ?ror ?item ?desc ?inception ?students ?logo WHERE {
      VALUES ?ror { ${values} }
      ?item wdt:P6782 ?ror .
      OPTIONAL { ?item wdt:P571 ?inception }
      OPTIONAL { ?item wdt:P2196 ?students }
      OPTIONAL { ?item wdt:P154 ?logo }
      OPTIONAL { ?item schema:description ?desc FILTER(LANG(?desc) = "en") }
    }`;
}

async function runQuery(ids: readonly string[], attempt = 1): Promise<Binding[]> {
  try {
    const response = await fetch(`${SPARQL}?format=json&query=${encodeURIComponent(buildQuery(ids))}`, {
      headers: { accept: 'application/sparql-results+json', 'user-agent': USER_AGENT },
    });

    if (response.status === 429 || response.status >= 500) {
      throw new Error(`Wikidata responded ${response.status}`);
    }
    if (!response.ok) {
      throw Object.assign(new Error(`Wikidata responded ${response.status}`), { fatal: true });
    }

    const payload = (await response.json()) as { results?: { bindings?: Binding[] } };
    return payload.results?.bindings ?? [];
  } catch (error) {
    if ((error as { fatal?: boolean }).fatal || attempt >= MAX_ATTEMPTS) throw error;
    await sleep(2000 * attempt);
    return runQuery(ids, attempt + 1);
  }
}

interface Enrichment {
  about: string | null;
  foundedYear: number | null;
  studentCount: number | null;
  logoUrl: string | null;
  wikidataId: string | null;
}

/**
 * Folds the rows for one institution into one record.
 *
 * SPARQL returns a row per combination, so an institution with two recorded
 * founding dates comes back twice. Taking the earliest inception is the
 * defensible choice — the later value is usually a refounding or a merger,
 * and the question a page answers is "how old is this place".
 */
function fold(rows: readonly Binding[]): Enrichment {
  const year = (value?: string) => {
    if (!value) return null;
    /* Wikidata dates can be negative for BCE; a university is not, but a
       malformed value should be dropped rather than stored as year 0. */
    const parsed = Number(value.slice(0, value.indexOf('-', 1)));
    return Number.isFinite(parsed) && parsed > 800 && parsed <= new Date().getFullYear()
      ? parsed
      : null;
  };

  const years = rows.map((row) => year(row.inception?.value)).filter((n): n is number => n !== null);
  const students = rows
    .map((row) => Number(row.students?.value))
    .filter((n) => Number.isFinite(n) && n > 0);

  return {
    about: rows.find((row) => row.desc?.value)?.desc?.value ?? null,
    foundedYear: years.length > 0 ? Math.min(...years) : null,
    /* Largest reported enrolment: the smaller figures are usually one campus. */
    studentCount: students.length > 0 ? Math.max(...students) : null,
    logoUrl: rows.find((row) => row.logo?.value)?.logo?.value ?? null,
    wikidataId: rows[0]?.item?.value?.split('/').pop() ?? null,
  };
}

async function main(): Promise<void> {
  const recheck = process.argv.includes('--recheck');
  const dataSource = new DataSource(buildDataSourceOptions());
  await dataSource.initialize();
  const repo = dataSource.getRepository(Institution);

  try {
    const pending = await withReconnect(dataSource, () =>
      repo.find({
        where: recheck ? {} : { enrichedAt: IsNull() },
        select: { id: true, sourceUrl: true },
        order: { name: 'ASC' },
      }),
    );

    const withSource = pending.filter((row) => row.sourceUrl);
    process.stdout.write(`${withSource.length} institutions to enrich\n`);

    let matched = 0;

    for (let index = 0; index < withSource.length; index += BATCH_SIZE) {
      const batch = withSource.slice(index, index + BATCH_SIZE);
      const byRor = new Map(batch.map((row) => [rorId(row.sourceUrl as string), row.id]));

      let bindings: Binding[] = [];
      try {
        bindings = await runQuery([...byRor.keys()]);
      } catch (error) {
        /* A failed batch must not cost the rest; the run is resumable. */
        process.stdout.write(
          `  batch ${index / BATCH_SIZE + 1} failed (${error instanceof Error ? error.message : String(error)})\n`,
        );
        continue;
      }

      const grouped = new Map<string, Binding[]>();
      for (const row of bindings) {
        const key = row.ror?.value;
        if (!key) continue;
        grouped.set(key, [...(grouped.get(key) ?? []), row]);
      }

      const stamped = new Date();

      for (const [ror, id] of byRor) {
        const rows = grouped.get(ror);
        const values = rows ? fold(rows) : null;

        /*
         * Rows with no Wikidata match are stamped too. Otherwise every run
         * retries the same misses forever and never reaches new records.
         */
        await withReconnect(dataSource, () =>
          repo.update(id, { ...(values ?? {}), enrichedAt: stamped }),
        );

        if (values) matched += 1;
      }

      process.stdout.write(
        `  ${Math.min(index + BATCH_SIZE, withSource.length)}/${withSource.length} — ${matched} matched\n`,
      );

      /* The public endpoint is shared infrastructure; do not hammer it. */
      await sleep(1200);
    }

    process.stdout.write(`\nEnriched ${matched} of ${withSource.length}.\n`);
  } finally {
    await dataSource.destroy();
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
