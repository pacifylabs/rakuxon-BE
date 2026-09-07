# Catalogue data model and sourcing

*Universities and courses: what we store, where it legitimately comes from, and how it gets in.*

---

## 1. Sourcing rule

**The catalogue is seeded from licensed, official and open sources only.**

> **We do not scrape Edvoy, ApplyBoard, or any competitor.** Edvoy is used purely
> as a **structural reference** — what fields a university or course page needs to
> be useful — and never as a data source. No Edvoy endpoint is fetched, no Edvoy
> response is stored, cached or derived from. This is not a style preference:
> their listings are a database protected by the UK/EU *sui generis* database
> right, their terms forbid extraction, and an early-stage platform built on a
> competitor's data has no defensible catalogue at all.

An earlier plan revision experimented with calling Edvoy's public endpoints for
course and university data. That approach is **withdrawn**. It also depended on
their internal Next.js build-id URLs (`/_next/data/production-XXXX/…`), which
break on each of their deploys — so it was fragile as well as wrong.

**Every ingested record carries its provenance.** Without this, a licence
question two years from now cannot be answered for any individual row:

```
sourceId       — which source it came from
sourceRecordId — the id in that source
sourceUrl      — where it can be re-checked
licence        — the licence in force at ingestion, verbatim
retrievedAt    — when
```

---

## 2. Data model

### `Institution` (global — no tenant)

| Field | Type | Notes |
|---|---|---|
| `id` | uuid | |
| `slug` | citext unique | route key: `/universities/[slug]` |
| `name` | text | official/legal name |
| `aka` | text[] | alternates + abbreviations; feeds search |
| `countryCode` | char(2) | ISO 3166-1 alpha-2 |
| `city`, `region` | text | |
| `location` | point | nullable; for map + distance |
| `type` | enum | `public · private · further_education · pathway` |
| `foundedYear` | int | nullable |
| `website`, `logoUrl`, `heroImageUrl` | text | logo only where licensed — see §5 |
| `about` | text | |
| `accreditation` | jsonb | recognising body, register id |
| `rankings` | jsonb | **licensed sources only**; each entry names its source + year |
| `intlStudentShare` | numeric | nullable |
| `identifiers` | jsonb | ROR, GRID, IPEDS UNITID, UKPRN, Wikidata Q-id |
| `status` | enum | `draft · published · suspended` |
| *provenance* | | §1 |

`identifiers` is what makes de-duplication possible. Matching universities across
sources by name alone fails on "University of York" (UK) vs "York University"
(Canada); ROR ids do not.

### `Program` (global — no tenant)

| Field | Type | Notes |
|---|---|---|
| `id` | uuid | |
| `institutionId` | uuid | |
| `slug` | citext unique | `/courses/[slug]` |
| `title` | text | |
| `level` | enum | `foundation · undergraduate · postgraduate_taught · postgraduate_research · pathway` |
| `disciplines` | text[] | controlled vocabulary — see §3 |
| `durationMonths` | int | |
| `studyMode` | enum | `full_time · part_time · online · hybrid` |
| `tuition` | jsonb | `{ amount, currency, per: 'year'|'course', international: bool }` |
| `entryRequirements` | jsonb | academic + English (IELTS/TOEFL/PTE bands) + prerequisites |
| `intakes` | jsonb[] | `{ month, year, applicationDeadline, status }` |
| `scholarships` | jsonb[] | name, amount/percentage, criteria |
| `campus` | text | which campus, where multi-site |
| `overview`, `modules`, `careers` | text | the page body |
| `status` | enum | `draft · published · suspended` |
| *provenance* | | §1 |

**Search columns** (materialised, refreshed on write):
`searchVector tsvector` (weighted: title A, institution name A, disciplines B,
city/country C) and a `pg_trgm` index on `title` + `name` for fuzzy typeahead.
Both are what §6 of `07-api-contract.md`'s search endpoint ranks on.

---

## 3. Controlled vocabularies

`disciplines`, `level` and `studyMode` are enumerated, not free text. Sources
disagree wildly — "CS", "Computer Science", "Computing", "Informatics" — and a
filter over free text silently returns the wrong count. Each source gets a
mapping table into our vocabulary, and unmapped values land in the review queue
(§4) rather than being invented.

---

## 4. Seed and import pipeline

BullMQ, staged, reviewable, and never writing straight into the live catalogue.

```
fetch → stage → normalise → match → merge → review → publish
```

1. **fetch** — one adapter per source behind a `CatalogueSource` interface.
   Rate-limited, resumable, records provenance. Adapters are the *only* code
   that talks to an external catalogue.
2. **stage** — raw payload into `catalogue_staging`, untouched. Keeping the raw
   response means a mapping bug is re-runnable without re-fetching.
3. **normalise** — into the §2 shape, mapping vocabularies (§3). Failures are
   recorded, not swallowed.
4. **match** — de-duplicate against existing rows: identifier match (ROR/UNITID/
   UKPRN) first, then country + fuzzy name via `pg_trgm`. Ambiguity → review.
5. **merge** — field-level, by source precedence: **official register > open
   dataset > licensed aggregator**, with a per-field "last good value" so a
   sparse source cannot blank a field a richer one filled. Never blind-overwrite.
6. **review** — an admin queue for conflicts, unmapped vocabulary and low-
   confidence matches. Publishing a university with wrong fees is worse than
   publishing nothing.
7. **publish** — `status: published`, search vectors refreshed.

**Gap-fill.** Where a university is not covered by an official register — common
outside the UK/US/AU — fill from open datasets (ROR, Wikidata, OpenAlex) at
lower precedence, flagged `low_confidence` in the admin UI so a human can see
what is thin. A gap-filled record is still marked with its source.

**Idempotent and re-runnable.** Re-importing a source updates rather than
duplicates, because matching (step 4) runs before merge (step 5).

---

## 5. Candidate sources — all licences TO VERIFY

> **Nothing below is cleared for use.** Each row needs its licence read and
> recorded before a single record is ingested. The "Licence" column is the
> *claim* to check, not a conclusion. Verified terms get written back here with
> a date and the person who checked.

### Official registers and government datasets

| Source | Coverage | Licence claim | Status |
|---|---|---|---|
| **IPEDS / NCES** | US institutions + programs | US federal, public domain | ☐ to verify |
| **College Scorecard API** | US, costs + outcomes | public domain, API key | ☐ to verify |
| **OfS Register** | England, registered providers | Open Government Licence | ☐ to verify |
| **UKRLP** | UK learning providers | OGL | ☐ to verify |
| **HESA** | UK institutional data | **licensed, paid** | ☐ to verify |
| **TEQSA register** | Australia | CC BY (check) | ☐ to verify |
| **HEA (Ireland)** | Ireland | check | ☐ to verify |
| **StatCan / provincial** | Canada | Statistics Canada OL | ☐ to verify |
| **Hochschulkompass (DAAD)** | Germany | check — likely restricted | ☐ to verify |
| **data.gov.\*** | various | varies per dataset | ☐ to verify |

### Open global identifiers and metadata

| Source | Coverage | Licence claim | Status |
|---|---|---|---|
| **ROR** | global institution ids | CC0 | ☐ to verify |
| **Wikidata** | global, broad + patchy | CC0 | ☐ to verify |
| **OpenAlex** | global institutions | CC0 | ☐ to verify |
| **GRID** | legacy, superseded by ROR | CC BY | ☐ to verify |

### Licensed aggregators (commercial)

QS · Times Higher Education · StudyPortals — **paid licences**. Rankings in
particular are almost never redistributable without one; `Institution.rankings`
stays empty until a licence exists, and each entry names its source and year.

### Direct from the institution

Partner universities supply their own course feed under the partnership
agreement — the highest-precedence source, and the one that scales with the
business rather than with a data budget. Rakuxon Ltd's existing **200+ partner
universities** are the natural first tranche.

**Per-source checklist before writing the adapter:** licence permits commercial
use · permits redistribution in a product · attribution requirements · rate
limits and caching terms · whether derived/aggregated data is covered · renewal
or expiry.

---

## 6. Images and logos

University logos are trademarks. Use them only under a partnership agreement or
explicit brand-guideline permission; otherwise render the country flag and a
typographic monogram (already built as `CountryFlag` + the card fallback).

**Do not use favicon-fetching services.** They resolve per visitor, which sends
every visitor's browsing to a third party and yields 100+ cross-origin requests
on a catalogue page. Campus photography comes from licensed stock or the
institution itself.

---

## 7. Definition of done for a source adapter

Licence recorded in §5 with a date · adapter behind `CatalogueSource` · fixture-
based tests (no live network in CI) · provenance on every row · vocabulary
mapping table · re-run produces no duplicates · a low-confidence record surfaces
in the review queue rather than publishing itself.
