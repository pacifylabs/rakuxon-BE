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
 * Higher education, roughly.
 *
 * ROR's `education` type covers primary and secondary schools too, and a
 * study-abroad catalogue listing a grammar school is noise a human then has to
 * clear. Deliberately excludes a bare "school", which matches far more
 * secondary schools than it does schools of medicine.
 */
const HIGHER_ED = /universit|college|institute|polytechnic|conservatoire|academy of|school of/i;

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

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

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

async function fetchPage(countryCode: string, page: number): Promise<{
  items: RorOrganization[];
  total: number;
}> {
  const filter = `types:education,locations.geonames_details.country_code:${countryCode}`;
  const url = `${ROR_ENDPOINT}?filter=${encodeURIComponent(filter)}&page=${page}`;

  const response = await fetch(url, { headers: { accept: 'application/json' } });
  if (!response.ok) throw new Error(`ROR responded ${response.status} for ${countryCode} p${page}`);

  const payload = (await response.json()) as {
    items?: RorOrganization[];
    number_of_results?: number;
  };

  return { items: payload.items ?? [], total: payload.number_of_results ?? 0 };
}

async function importCountry(
  dataSource: DataSource,
  countryCode: string,
  includeSchools: boolean,
): Promise<{ seen: number; written: number }> {
  const repo = dataSource.getRepository(Institution);
  const retrievedAt = new Date();
  let page = 1;
  let seen = 0;
  let written = 0;
  let total = Infinity;

  while (seen < total) {
    const { items, total: reported } = await fetchPage(countryCode, page);
    total = reported;
    if (items.length === 0) break;

    for (const org of items) {
      seen += 1;
      const name = displayName(org);
      const location = org.locations?.[0]?.geonames_details;
      if (!name || !org.id || !location?.country_code) continue;
      if (!includeSchools && !HIGHER_ED.test(name)) continue;

      /*
       * Slug collisions are real: "Trinity College" exists in several
       * countries. The country code disambiguates without making every slug
       * ugly, and the ROR id is the last resort.
       */
      const base = slugify(name);
      let slug = base;
      const clash = await repo.findOne({ where: { slug }, select: { id: true, sourceUrl: true } });
      if (clash && clash.sourceUrl !== org.id) {
        slug = `${base}-${location.country_code.toLowerCase()}`;
        const second = await repo.findOne({ where: { slug }, select: { sourceUrl: true } });
        if (second && second.sourceUrl !== org.id) slug = `${base}-${slugify(org.id.slice(-8))}`;
      }

      const values = {
        slug,
        name,
        aka: aliases(org, name),
        country: location.country_name ?? countryCode,
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
      const existing = await repo.findOne({ where: { sourceUrl: org.id } });
      await (existing ? repo.update(existing.id, values) : repo.insert(values));
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

    for (const countryCode of countries) {
      process.stdout.write(`${countryCode} ... `);
      const { seen, written } = await importCountry(dataSource, countryCode, includeSchools);
      grandTotal += written;
      process.stdout.write(`${written} kept of ${seen} listed\n`);
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
