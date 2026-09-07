# API Contract — Rakuxon
**Source of truth: `rakuxon-BE`. Consumed by: `rakuxon-FE`.**

> Two separate repos means the contract must be shared **explicitly**. The BE owns it; the FE consumes a versioned copy. This prevents the FE and BE drifting.

> **Decided (stage 1).** The OpenAPI route below is the one in use. `@nestjs/swagger`
> serves the document at `/docs` (UI) and `/docs-json` (raw), and the FE generates its
> client from it. The published-package option is not being pursued: one artefact, and
> it is produced by the running API so it cannot drift from it.
>
> Swagger is also the manual test surface — *Authorize* takes a bearer token and keeps
> it across reloads, so the whole auth flow can be exercised from the browser.

## Chosen mechanism (recommended)

**Publish a versioned package** `@rakuxon/contract` from the BE (`src/contract/`) to a private registry (GitHub Packages), containing shared **DTOs + enums** (no logic). The FE depends on it and re-exports through its own `packages/contract`.

- Breaking change → **major version bump**. FE adopts on its own schedule.
- Additive change → minor. Bugfix → patch.
- The BE's own controllers import the same DTOs, so the published types are guaranteed to match the running API.

## Alternative mechanism

BE exposes **OpenAPI** via `@nestjs/swagger`; FE CI generates a typed client into `packages/api-client`. Use this if you prefer generation over a published package. Pick **one** before the first authenticated screen.

## What lives in the contract

- **DTOs:** request/response shapes for every endpoint.
- **Enums:** `Role`, `PipelineStage`, `ApplicationStatus`, `DocumentType`, `OfferType`, `UsageMeter`, `LedgerState`, etc.
- **Nothing else** — no services, no DB entities, no secrets.

## Endpoint surface (high level, per module)

- **auth:** register, login, refresh, logout, reset, SSO callback.
- **tenants/admin:** vetting (tenants + institutions), plans/limits/splits config.
- **users:** invite, roles, assignment.
- **students:** CRUD, bulk import, pipeline transitions, onboarding-link issue/consume.
- **documents:** `sign-upload`, `confirm`, review (accept/reject), `:id/url` (signed view).
- **catalogue:** search institutions/programs (global), shortlist.
- **applications:** create, status, messaging, offers.
- **institutions:** inbox, request-info, issue-offer.
- **billing:** plans, subscription, usage (read), commission ledger (read).
- **realtime:** websocket channels for status + messages.

## Versioning discipline

- Version the HTTP API too (`/v1`).
- A contract change ships with: updated DTOs, a version bump, and (if breaking) a short migration note in the PR.
- FE pins a contract version; upgrading is a deliberate FE PR.

## Auth & tenancy in the contract

- Bearer JWT on authenticated endpoints.
- Tenant is derived server-side from the token/subdomain — **never** a request field the client sets.
- Student-app uses the onboarding-link token to establish a scoped session.
