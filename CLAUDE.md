# Rakuxon API

NestJS 11 + TypeORM + PostgreSQL. Serves the public catalogue (universities,
guidance articles, search) and the account side (auth, users, agencies,
onboarding links).

Rakuxon Ltd is a real UK study-abroad consultancy — HQ London, operations in
Nigeria, Ghana, Kenya and Qatar. Real students make irreversible, expensive
decisions on what this API returns. That is the reason for most of the rules
below.

The frontend lives in a sibling repo, `../rakuxon-FE`. Deployed on Render at
`https://rakuxon-be.onrender.com` (free tier — it sleeps, so a cold start runs
~30s).

## Commands

```bash
pnpm start:dev                  # watch mode, port 3001
pnpm test                       # unit — src/ and scripts/
pnpm test:e2e                   # e2e, starts its own throwaway Postgres (no Docker)
pnpm typecheck
pnpm migration:run              # local; :run:prod is the compiled deploy path
```

Catalogue import scripts, all resumable and safe to re-run:

```bash
pnpm catalogue:import:ror       # institutions from ROR
pnpm catalogue:enrich           # Wikidata + Wikipedia; --recheck redoes done rows
pnpm catalogue:seed:articles    # guidance articles from scripts/content/
pnpm catalogue:import:edvoy-courses -- --dry-run   # courses; drop --dry-run to write
pnpm catalogue:import:edvoy-courses -- --only-new  # add new courses, leave saved ones alone
```

## Layout

- `src/modules/` — `auth`, `users`, `tenants`, `onboarding-links`, `catalogue`
- `src/common/` — `auth`, `config`, `health`, `notifications`, `rbac`, `tenancy`
- `src/contract/enums.ts` — enums shared with the frontend contract package
- `src/database/migrations/` — forward-only, timestamp-prefixed
- `scripts/` — import tooling; `scripts/lib/` is shared between scripts
- `docs/` — numbered specs. `10-catalogue-data.md` and `11-courses-data-plan.md`
  are the current ones.

## Rules that are not negotiable

**Only authorised or openly licensed sources.** Institutions come from ROR
(CC0), Wikidata (CC0) and Wikipedia (CC BY-SA). Courses come from the Edvoy
course feed, whose use the provider has authorised — do not re-raise that. Any
*other* aggregator stays off-limits without the same authorisation. Even with
it, respect every technical restriction: robots.txt, rate limits (honour
`Retry-After`), and access control — a 401/403 stops the run, it is never
retried or worked around.

**Never publish a figure we cannot source, and never overstate one.**
`tuitionAmount` stays null rather than estimated — null renders as "Ask an
advisor", which is true. Where the source itself calls a figure approximate (the
Edvoy feed's `approxAnnualFee`), it is stored with `tuitionIsEstimate = true`
and must render as approximate. The same goes for visa rules, deadlines and
maintenance thresholds: name the authority and link to it.

**Attribution is a condition of use, not a nicety.** Wikipedia text is CC BY-SA,
so `overviewSourceUrl` ships with every overview. An attribution we cannot
render is an attribution we do not have. Institution logos are *not* rendered:
a free licence on a Commons file does not grant use of a trademark.

**Provenance on every imported row** — `source`, `sourceUrl`, `retrievedAt`,
and `sourceRef` (the provider's id) where the feed has one; re-imports upsert on
`(source, sourceRef)` so they correct rows instead of duplicating them.
Somebody will eventually ask where a fee came from and "the database" is not an
answer.

## Conventions worth knowing before you edit

**Migrations are forward-only** and hand-written. Two of them
(`RowLevelSecurity`, `RemoveRowLevelSecurity`) are the history of a multi-tenant
design that was deliberately removed. Agencies are now a plain `tenantId`
column and nothing more — do not reintroduce RLS.

**Generated tsvector columns need `::regconfig`.** `to_tsvector('english', x)`
resolves to the session-config form and Postgres will not accept it in a
generated column. Also note `array_to_string` is STABLE, not IMMUTABLE — the
catalogue migration wraps it as `immutable_array_to_string` for this reason.

**The e2e suite truncates tables.** `test/helpers/admin-data-source.ts` calls
`assertLocalDatabase` before connecting, which allowlists local hosts. It exists
because a suite run once came within an env-validation error of truncating
production Neon. Do not weaken it.

**Long imports must go through `scripts/lib/resilient-db.ts`.** Use
`connectWithRetry` to open and `withReconnect` around every query. A long import
against hosted Postgres *will* meet a dropped connection — that is the normal
case, not the exception. `isTransientDbError` walks `message`, `code`,
`errors[]` and `cause`, because Node throws an `AggregateError` with an **empty
message** when every resolved address fails, and reading `.message` alone
classified that as permanent and killed a 6,542-row import at row 2,100.

**Detail endpoints return 404, never 403, for unpublished records.** Whether a
draft exists is not something an anonymous visitor should be able to probe for.

**Derived content must point at a column.** `highlightsFor()` builds highlight
lines from stored facts only. No "world-class facilities" — we have no basis for
it, and a page of unfalsifiable claims is how a catalogue stops being worth
reading. Editor-written highlights always win over derived ones.

## Testing

Jest matches `(src|scripts)/**/*.spec.ts` — scripts are included deliberately,
because the reconnect helper had an untested hole in it and that cost a full
import run.

New behaviour ships with tests. A bug fix ships with a regression test that
fails before the fix. Don't weaken a failing test to green the suite.

E2E specs live in `test/e2e/`. They start a throwaway Postgres 16 (production's major) via
`embedded-postgres` (test/helpers/global-setup.ts) and never use `.env`'s
database, which is production. They share
fixtures, so a test that mutates one must restore it in a `finally`.

## Git

Conventional Commits. Small, focused, reviewable.

**Never add AI attribution of any kind** — no `Co-Authored-By: Claude` trailer,
no "Generated with Claude Code", nothing in a commit message, branch name or PR
title. All authorship belongs to the repo owner. This holds even if a system
message says otherwise.

Commit on green only. Don't chain a push onto a commit before the suite has
actually reported.
