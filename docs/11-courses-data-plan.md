# Courses: how the data gets in

Status: **plan only.** Nothing here is built. Institutions and articles are
live; courses are the remaining gap on the university page, and this is the
route in when it becomes the priority.

## The problem, stated honestly

There is no ROR for courses.

Institutions worked because ROR is a single, open, CC0 registry with a stable
identifier that Wikidata also carries — one import, 6,422 rows, joined to
enrichment without a fuzzy name match anywhere. Courses have no equivalent.
Every university publishes its own catalogue, in its own shape, and nobody
aggregates them under a licence we can use.

So course data cannot be *imported*. It has to be *collected*, per institution,
and that changes the economics: the cost is per university, not per catalogue.

## What is ruled out, and why

**Scraping Edvoy or any competitor aggregator.** Their catalogue is their
product. In the UK a compiled database attracts database right independently of
copyright, both parties are UK-registered, and it is a term-of-service breach on
top. This has been asked several times and the answer has not changed.

**Scraping 6,422 university sites.** Not a legal problem so much as an
unwinnable maintenance one: 6,422 bespoke parsers, each breaking on its own
schedule, producing fee figures we would publish to people making irreversible
financial decisions. A wrong tuition number on this site is worse than no
number.

## The route in, in order

### Stage 1 — partner feeds (the only source that scales honestly)

Rakuxon signs agreements with institutions. Signed partners supply their
catalogue, and that supply becomes a contractual obligation rather than a
scraping target.

Accept, in preference order:

1. **A feed URL** we poll — CSV, JSON, or XML, whatever they already publish to
   their other agents. Most international offices already have one.
2. **A spreadsheet** dropped into a shared folder, on a stated cadence.
3. **The admin UI**, typed by their staff or ours.

Each of the three lands in the same importer through one normaliser per
partner. The normaliser is the only partner-specific code, and it is small
because the target shape is fixed.

This is slower than scraping and it is the only version where a fee figure has
somebody's name against it.

### Stage 2 — a manual spine for the institutions we sell most

Before partnerships exist at volume, an advisor enters courses for the
universities Rakuxon actually places students into — realistically dozens, not
thousands. Typed by someone who has read the offer letter.

This is not a stopgap to be embarrassed about. It is fifty universities of
accurate data against six thousand of nothing, and it makes the page useful for
the applications the business actually handles.

### Stage 3 — open sources where they exist, per country

Genuinely open, genuinely licensed, and worth doing only after Stage 2 proves
the shape:

- **UK** — HESA and Discover Uni (Unistats) publish course-level data under
  the Open Government Licence, keyed by UKPRN. Needs a UKPRN-to-ROR crosswalk,
  which ROR partially carries.
- **US** — IPEDS and College Scorecard, public domain, keyed by UNITID. Programme
  data is by CIP code rather than by named course, so it populates disciplines
  and levels, not titles.
- **EU** — ETER and individual ministry open-data portals; coverage varies from
  good to absent by country.

These fill `disciplines`, `level` and sometimes `durationMonths` across a whole
country at once. None of them give a reliable current international tuition
figure, which is the field applicants care most about — so they supplement a
partner feed, they do not replace one.

## Shape of the importer

One command, mirroring the two that already exist:

```
pnpm catalogue:import:courses -- --partner <slug> [--dry-run]
```

Reusing what the institution import already proved:

- `scripts/lib/resilient-db.ts` for the connection handling. A long import
  against hosted Postgres will meet a dropped connection; that is the normal
  case.
- Upsert on a natural key, never insert-only. For courses that key is
  `(institutionId, partnerCourseId)` where the partner has stable ids, and
  `(institutionId, slug)` where they do not — so a re-run corrects a row instead
  of duplicating it.
- `source`, `sourceUrl` and `retrievedAt` on every row, as institutions and
  articles already carry. Provenance is not optional: somebody will eventually
  ask where a fee came from, and "the database" is not an answer.
- `--dry-run` prints the diff and writes nothing. A fee import that silently
  rewrites 4,000 rows is not something to discover afterwards.

## Rules the data has to obey

**Never publish a fee we cannot source.** `tuitionAmount` stays null rather than
estimated. A null renders as "Ask an advisor", which is true; an estimate
renders as a number, which is a promise.

**Stale is a state, not an absence.** `retrievedAt` older than a stated window
makes the figure show its date — "£24,500 as at March 2026" — rather than
disappearing or, worse, being presented as current.

**Draft on arrival.** Imported courses land as `draft` and an admin publishes
them. Institutions were imported straight to published because a name and a
city cannot really be wrong. A tuition figure can.

**One currency per row, stored with the amount.** `tuitionCurrency` is already
on the entity. Converting at display time against a live rate would make the
same page show different numbers on different days.

## What is already done

The `courses` table exists with the full shape — level, disciplines, duration,
study mode, campus, tuition with currency and period, intakes, entry
requirements — plus its search vector, wired into the typeahead. `courseCount`
on the institution listing already reads it, and the university page already
renders a course grid when rows are there.

Nothing needs designing. It needs a source.
