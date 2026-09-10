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
const WIKIPEDIA_API = 'https://en.wikipedia.org/w/api.php';

/**
 * A courtesy the endpoint asks for by name: an anonymous agent gets throttled
 * hard, an identifiable one does not.
 */
const USER_AGENT = 'RakuxonCatalogue/1.0 (https://rakuxon.com; enquiries@rakuxon.com)';

/** Enough to be worth a round trip, small enough not to time the query out. */
const BATCH_SIZE = 60;
/** The Wikipedia API's own ceiling for intro extracts. */
const WIKIPEDIA_BATCH = 20;
const MAX_ATTEMPTS = 4;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

interface Binding {
  ror?: { value: string };
  item?: { value: string };
  desc?: { value: string };
  inception?: { value: string };
  students?: { value: string };
  logo?: { value: string };
  enwiki?: { value: string };
  image?: { value: string };
  coord?: { value: string };
  memberLabel?: { value: string };
  motto?: { value: string };
}

/**
 * Membership bodies a student has a reason to care about.
 *
 * P463 is a bag of everything an institution has ever joined — Bluetooth SIG,
 * ORCID, the Digital Preservation Coalition. Listing those as "highlights"
 * would be technically accurate and completely useless, and the two that
 * matter would be buried among them. An allowlist is the only honest filter:
 * these are the selective groups that actually tell you something.
 */
const NOTABLE_MEMBERSHIPS = new Set([
  'Russell Group',
  'Group of Eight',
  'U15 Group of Canadian Research Universities',
  'Ivy League',
  'Association of American Universities',
  'League of European Research Universities',
  'Coimbra Group',
  'Universitas 21',
  'Association of Pacific Rim Universities',
  'Association of Commonwealth Universities',
  'International Alliance of Research Universities',
  'Global U8 Consortium',
  'Association of Southeast Asian Institutions of Higher Learning',
  'Guild of European Research-Intensive Universities',
  'European Consortium of Innovative Universities',
]);

/** "https://ror.org/04xvc2q17" -> "04xvc2q17", which is what Wikidata stores. */
const rorId = (sourceUrl: string) => sourceUrl.replace(/^.*\/(?=[^/]+$)/, '');

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
const commonsThumb = (url: string, width = 320): string => {
  const https = url.replace(/^http:\/\//, 'https://');
  if (!https.includes('/Special:FilePath/')) return https;
  return `${https}${https.includes('?') ? '&' : '?'}width=${width}`;
};

function buildQuery(ids: readonly string[]): string {
  const values = ids.map((id) => `"${id}"`).join(' ');

  return `
    SELECT ?ror ?item ?desc ?inception ?students ?logo ?enwiki ?image ?coord ?memberLabel ?motto WHERE {
      VALUES ?ror { ${values} }
      ?item wdt:P6782 ?ror .
      OPTIONAL { ?item wdt:P571 ?inception }
      OPTIONAL { ?item wdt:P2196 ?students }
      OPTIONAL { ?item wdt:P154 ?logo }
      OPTIONAL { ?item wdt:P18 ?image }
      OPTIONAL { ?item wdt:P625 ?coord }
      OPTIONAL { ?item wdt:P463 ?member }
      OPTIONAL { ?item wdt:P1451 ?motto FILTER(LANG(?motto) = "en") }
      OPTIONAL { ?enwiki schema:about ?item ; schema:isPartOf <https://en.wikipedia.org/> }
      OPTIONAL { ?item schema:description ?desc FILTER(LANG(?desc) = "en") }
      SERVICE wikibase:label { bd:serviceParam wikibase:language "en" }
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
  heroImageUrl: string | null;
  motto: string | null;
  memberships: string[];
  latitude: string | null;
  longitude: string | null;
  /** Carried between the two passes, not a column. */
  wikipediaTitle: string | null;
}

/** "Point(-1.930555 52.450555)" -> longitude, latitude. Note the order. */
const parsePoint = (value?: string): { latitude: string; longitude: string } | null => {
  const match = /^Point\(\s*(-?[\d.]+)\s+(-?[\d.]+)\s*\)$/.exec(value ?? '');
  if (!match) return null;

  const longitude = Number(match[1]);
  const latitude = Number(match[2]);
  if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) return null;
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;

  return { latitude: latitude.toFixed(6), longitude: longitude.toFixed(6) };
};

/** Back the other way, for the attribution link. */
const articleUrl = (title: string) =>
  `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`;

/** "https://en.wikipedia.org/wiki/Keele_University" -> "Keele University". */
const wikipediaTitle = (url?: string): string | null => {
  if (!url) return null;
  const slug = url.split('/wiki/')[1];
  return slug ? decodeURIComponent(slug).replace(/_/g, ' ') : null;
};

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

  const logo = rows.find((row) => row.logo?.value)?.logo?.value;
  /* Wider than a logo: this one is displayed as a banner, not an icon. */
  const image = rows.find((row) => row.image?.value)?.image?.value;
  const point = parsePoint(rows.find((row) => row.coord?.value)?.coord?.value);

  const memberships = [
    ...new Set(
      rows
        .map((row) => row.memberLabel?.value)
        .filter((label): label is string => Boolean(label) && NOTABLE_MEMBERSHIPS.has(label)),
    ),
  ].sort();

  return {
    about: rows.find((row) => row.desc?.value)?.desc?.value ?? null,
    foundedYear: years.length > 0 ? Math.min(...years) : null,
    /* Largest reported enrolment: the smaller figures are usually one campus. */
    studentCount: students.length > 0 ? Math.max(...students) : null,
    logoUrl: logo ? commonsThumb(logo) : null,
    heroImageUrl: image ? commonsThumb(image, 1200) : null,
    motto: rows.find((row) => row.motto?.value)?.motto?.value ?? null,
    memberships,
    latitude: point?.latitude ?? null,
    longitude: point?.longitude ?? null,
    wikipediaTitle: wikipediaTitle(rows.find((row) => row.enwiki?.value)?.enwiki?.value),
    wikidataId: rows[0]?.item?.value?.split('/').pop() ?? null,
  };
}

/**
 * The overview paragraphs, from the article Wikidata pointed at.
 *
 * Wikidata's own description is one lowercase clause — enough for a subtitle,
 * not for a page. The Wikipedia intro is two or three real paragraphs, and the
 * API returns twenty at a time, which is the only reason this is affordable
 * across six thousand institutions.
 *
 * The text is CC BY-SA. Every row that gets an overview also gets the article
 * URL, because an attribution we cannot render is an attribution we do not have.
 */
async function fetchOverviews(titles: readonly string[]): Promise<Map<string, string>> {
  const found = new Map<string, string>();
  if (titles.length === 0) return found;

  const params = new URLSearchParams({
    action: 'query',
    format: 'json',
    prop: 'extracts',
    exintro: '1',
    explaintext: '1',
    /* The API's own ceiling for intro extracts. Asking for more silently
       truncates the batch, which would look like missing articles. */
    exlimit: '20',
    redirects: '1',
    titles: titles.join('|'),
  });

  const response = await fetch(`${WIKIPEDIA_API}?${params.toString()}`, {
    headers: { accept: 'application/json', 'user-agent': USER_AGENT },
  });
  if (!response.ok) throw new Error(`Wikipedia responded ${response.status}`);

  const payload = (await response.json()) as {
    query?: {
      pages?: Record<string, { title?: string; extract?: string; missing?: unknown }>;
      /* A redirect means the title we asked for is not the title we got back,
         so the result has to be mapped home or it looks like a miss. */
      normalized?: { from: string; to: string }[];
      redirects?: { from: string; to: string }[];
    };
  };

  const backToRequested = new Map<string, string>();
  for (const hop of [
    ...(payload.query?.normalized ?? []),
    ...(payload.query?.redirects ?? []),
  ]) {
    backToRequested.set(hop.to, backToRequested.get(hop.from) ?? hop.from);
  }

  for (const page of Object.values(payload.query?.pages ?? {})) {
    if (!page.title || !page.extract?.trim()) continue;
    const requested = backToRequested.get(page.title) ?? page.title;
    found.set(requested, page.extract.trim());
  }

  return found;
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
    let described = 0;

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
      const folded = new Map<string, Enrichment>();

      for (const [ror] of byRor) {
        const rows = grouped.get(ror);
        if (rows) folded.set(ror, fold(rows));
      }

      /*
       * One Wikipedia call per twenty articles, run before the writes so each
       * row is written once with everything it is going to get.
       */
      const titles = [...folded.values()]
        .map((values) => values.wikipediaTitle)
        .filter((title): title is string => Boolean(title));

      const overviews = new Map<string, string>();
      for (let start = 0; start < titles.length; start += WIKIPEDIA_BATCH) {
        try {
          const slice = titles.slice(start, start + WIKIPEDIA_BATCH);
          for (const [title, extract] of await fetchOverviews(slice)) {
            overviews.set(title, extract);
          }
          await sleep(200);
        } catch (error) {
          /* Losing the prose must not lose the facts alongside it. */
          process.stdout.write(
            `    overviews failed (${error instanceof Error ? error.message : String(error)})\n`,
          );
        }
      }

      for (const [ror, id] of byRor) {
        const values = folded.get(ror);
        /* wikipediaTitle is how the two passes talk to each other, not a
           column — it must not reach the update or TypeORM writes a field the
           table does not have. */
        const { wikipediaTitle: title, ...columns } = values ?? { wikipediaTitle: null };
        const overview = title ? (overviews.get(title) ?? null) : null;

        /*
         * Rows with no Wikidata match are stamped too. Otherwise every run
         * retries the same misses forever and never reaches new records.
         */
        await withReconnect(dataSource, () =>
          repo.update(id, {
            ...columns,
            overview,
            overviewSourceUrl: overview && title ? articleUrl(title) : null,
            enrichedAt: stamped,
          }),
        );

        if (values) matched += 1;
        if (overview) described += 1;
      }

      process.stdout.write(
        `  ${Math.min(index + BATCH_SIZE, withSource.length)}/${withSource.length} — ${matched} matched, ${described} with an overview\n`,
      );

      /* The public endpoint is shared infrastructure; do not hammer it. */
      await sleep(1200);
    }

    process.stdout.write(
      `\nEnriched ${matched} of ${withSource.length}; ${described} have an overview.\n`,
    );
  } finally {
    await dataSource.destroy();
  }
}

main().catch((error: unknown) => {
  /* Name and stack, not just the message: a rejection whose message is empty
     otherwise exits 1 having printed a blank line, which is indistinguishable
     from crashing for no reason. */
  process.stderr.write(
    error instanceof Error
      ? `${error.name}: ${error.message || '(no message)'}\n${error.stack ?? ''}\n`
      : `Non-error thrown: ${JSON.stringify(error)}\n`,
  );
  process.exitCode = 1;
});

process.on('unhandledRejection', (reason) => {
  process.stderr.write(`Unhandled rejection: ${String(reason)}\n`);
  process.exitCode = 1;
});
