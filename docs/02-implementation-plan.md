# Backend Implementation Plan — Rakuxon API
**Repo:** `rakuxon-BE` · TDD throughout (Jest + Supertest) · Foundation-first.

> Each stage lists the **TDD steps** (write test → make it pass → refactor) and ends in a **gate**. Do not start a stage until the previous gate is green. Each stage maps to a branch (see `06-branch-strategy.md`).

---

## Stage 0 — Foundation `branch: stage/0-foundation`

**Build:** NestJS app, config module, TypeORM datasource, docker-compose (postgres + redis), CI.

**TDD steps**
1. Test: `/health` returns 200 with build info → implement health controller.
2. Test: config validation throws when a required env var is missing → implement env schema.
3. Test: TypeORM can connect + run/rollback an empty migration → wire datasource.

**Gate:** `docker-compose up` + health green; CI runs and passes an empty `test:isolation`.

> **Status: green.** Env validation, TypeORM datasource with migrations, `GET /v1/health`, docker-compose (Postgres 16 + Redis 7), OpenAPI at `/docs`, and CI running typecheck / test / e2e / isolation / build.

---

## Stage 1 — Identity, Access & Tenancy `branch: stage/1-auth-tenancy`

**Build:** auth (register/login/refresh/reset), RBAC, social/SSO adapter, tenant resolution, onboarding-link issuance.

**TDD steps**
1. Test: register → hashed password stored, no plaintext → implement registration.
2. Test: login returns access+refresh; refresh rotates; reuse of old refresh fails → implement JWT strategy.
3. Test: `@Roles('agency_admin')` route returns 403 for a counselor → implement RBAC guard.
4. Test: request without resolvable tenant is rejected pre-business-logic → implement tenant-resolution middleware.
5. Test: counselor can only fetch assigned students (data-scope, not just role) → implement scoping.
6. Test: SSO callback maps provider identity to a platform user → implement adapter (Google first).
7. Test: generate onboarding link → token unique, expiry set; expired/revoked token rejected → implement link service.

**Gate:** auth + RBAC + tenant resolution all green; SSO happy-path passes.

> **Status: green, with one deferral.** Register / login / refresh-with-rotation / logout / me, argon2id hashing, refresh-token families with replay detection, password reset, the SSO adapter (Google), `@Roles` guard, subdomain tenant resolution and onboarding-link issue/consume/revoke (51 unit, 55 e2e). **Deferred:** per-user data scoping moves to stage 2, where RLS enforces it at the database rather than a service remembering to. Email is a logging adapter behind `NotificationPort` until stage 8.

---

## Stage 2 — Isolation hardening `branch: stage/2-isolation` (the linchpin)

**Build:** RLS policies, tenant-scoped transaction helper, ORM guard, the isolation gate.

**TDD steps**
1. Test (the keystone): create tenant A + tenant B; assert A cannot read B's rows via any repository method → implement RLS migration (`FORCE ROW LEVEL SECURITY`, policy on `app.current_tenant`).
2. Test: a tenant-scoped query outside `runInTenantContext` throws → implement ORM guard.
3. Test: `runInTenantContext(tenantId, fn)` sets `SET LOCAL app.current_tenant` and scopes the tx → implement helper.
4. Wire the cross-tenant suite into CI as a **required gate**.

**Gate:** isolation suite green and required; manual cross-tenant read fails at the DB.

> **Status: green.** RLS with `FORCE ROW LEVEL SECURITY`, a two-role database
> split (the API connects as a non-superuser `rakuxon_app`; migrations use the
> owner), `runInTenantContext` / `runInIdentityContext`, a boot assertion that
> refuses to start on a role that can bypass RLS, and a 27-test gate proven by
> mutation. **Deviation:** the planned TypeORM-level "ORM guard" was not built —
> TypeORM has no clean query-level hook. Enforcement is the database
> (default-deny), the helper throwing on a missing tenant, and a structural test
> that fails if the identity escape hatch is called outside its three allowed
> files.

> From here, every new module adds its endpoints to the isolation suite as part of its definition of done.

---

## Stage 2b — Operator control & the access-scope switch `branch: stage/2b-operator-scope`

> **Plan revision.** The tenancy model became **operator-controlled scoping**:
> Rakuxon is super-admin, and student data is shared platform-wide behind one
> switch. Read the risk callout in `09-tenant-isolation.md` §1 first — it is a
> GDPR, children's-data and competitive exposure, accepted deliberately.

**Build:** `AgencyEntitlement` + admin controls, `runInOperatorContext`, `runInDataContext`, the `access-scope.ts` switch, per-command RLS policies, dual-mode gate.

**TDD steps**
1. Test: `access-scope.ts` resolves `platform` from config, and `agency` when the tenant's entitlement says `dataAccess: 'own'` — an entitlement can narrow, never widen → implement the switch.
2. Test (the keystone, run twice): under `agency` scope A cannot read B's students; under `platform` scope A **can** read B's students but still cannot read B's `users`, `onboarding_links`, entitlements or ledger → implement per-command policies.
3. Test: under `platform` scope, A cannot `UPDATE` or **`DELETE`** B's student. `WITH CHECK` does not apply to `DELETE`, so a single wide policy would leave deletion open — the split into `FOR SELECT` and `FOR ALL` policies is what closes it → implement.
4. Test: `runInOperatorContext` is reachable only by `platform_admin`, sees every tenant, and writes an `audit_log` row → implement.
5. Test: a cross-agency read that actually returns another tenant's rows is audited → implement.
6. Test: `@RequiresEntitlement('ai_document_checks')` returns 403 when the flag is absent; an absent flag is off, not on → implement the guard.
7. Test: a suspended tenant cannot sign in, independently of entitlements → assert existing behaviour still holds.
8. Wire the isolation gate to run **twice**, once per scope mode, both required.

**Gate:** the isolation suite green in **both** scope modes; entitlement guard green; operator access audited. A green `agency` mode is what makes the switch reversible rather than theoretical.

---

## Stage 2c — Catalogue foundation & search `branch: stage/2c-catalogue`

**Build:** `Institution` / `Program` entities per `10-catalogue-data.md` §2, ranked typeahead + search endpoints, public detail endpoints, `CatalogueSource` interface + first adapter, import pipeline.

> **Do not scrape Edvoy or any competitor.** Edvoy is a structural reference for
> page fields only. Sources are licensed/official/open, and every source's
> licence is verified and recorded in `10-catalogue-data.md` §5 **before** its
> adapter is written.

**TDD steps**
1. Test: `GET /v1/catalogue/suggest?q=comp` returns ranked matches across universities and courses, exact-prefix before fuzzy, ≤ the requested limit → implement `pg_trgm` + `tsvector` search.
2. Test: suggest is public, rate-limited, and returns nothing tenant-scoped → implement as `@Public()`.
3. Test: an empty or 1-character query returns an empty list rather than the whole catalogue → implement the floor.
4. Test: `GET /v1/catalogue/courses/:slug` returns overview, entry requirements, fees, intakes and location; an unknown slug is 404 → implement.
5. Test: a `CatalogueSource` adapter normalises a fixture payload into the §2 shape and records provenance (no live network in CI) → implement the interface + first adapter.
6. Test: re-importing the same fixture updates rather than duplicates (identifier match before merge) → implement matching.
7. Test: an unmapped discipline lands in the review queue instead of being invented → implement the vocabulary mapping.
8. Test: a sparse source cannot blank a field a richer source filled → implement field-level precedence merge.

**Gate:** typeahead returns ranked results under 150ms P95 against a seeded catalogue; import is idempotent; every seeded row carries provenance.

---

## Stage 2d — Public intake `branch: stage/2d-contact`

**Build:** `POST /v1/contact` for the marketing site.

**TDD steps**
1. Test: a valid enquiry is stored and a notification emitted → implement.
2. Test: the endpoint is public but rate-limited per IP → implement the throttle.
3. Test: a submission with a filled honeypot field is accepted with 202 and silently dropped → implement (telling a bot it failed teaches it to retry).

**Gate:** the marketing contact form reaches the API end to end.

---

## Stage 3 — Core student-document vertical slice `branch: stage/3-core-slice`

**Build:** Student + Document entities; onboarding-link consumption; **Cloudinary signed upload** (see `08-storage-and-ai.md`); review workflow.

**TDD steps**
1. Test: counselor creates student → belongs to tenant + assigned counselor → implement.
2. Test: consuming a valid link scopes access to that student only → implement consumption.
3. Test: `POST /documents/sign-upload` authorizes + returns a signature pinning `{tenant}/{student}/{type}` folder + `authenticated` type → implement signing (mock Cloudinary SDK).
4. Test: `POST /documents/confirm` records Document(publicId, version) and enqueues AI job → implement (assert job enqueued, BullMQ mocked).
5. Test: counselor accept/reject with reason keeps versions → implement review workflow.
6. Test: `GET /documents/:id/url` returns a signed short-lived URL only after authz → implement delivery.
7. Extend isolation suite for students + documents.

**Gate:** full slice green end to end (mocked Cloudinary/queue); isolation extended.

---

## Stage 4 — Workflow spine `branch: stage/4-spine`

**Build:** pipeline stages, bulk import, assign/reassign, shortlist, applications + messaging. *(Catalogue entities and search moved earlier, to stage 2c — the marketing site needs them before the workflow does.)*

**TDD steps**
1. Test: stage transitions are audited; invalid transition rejected → implement pipeline.
2. Test: CSV import reports row errors without failing the batch → implement bulk import.
3. Test: reassign moves access rights with the student → implement.
4. Test: authenticated catalogue filters (country/level/subject/fees/intake) return the expected set on top of stage 2c's search; shortlisting a program is tenant-scoped even though the catalogue is global → implement.
5. Test: create application (student→program) with required docs; status lifecycle + audit trail → implement.
6. Test: post message on application persists + scoped to tenant → implement (realtime added Stage 8).
7. Extend the isolation suite for applications/messages/shortlists, **in both scope modes** — applications are a shared-scope table, so `platform` mode must show reads widening while writes and deletes still fail across the boundary.

**Gate:** counselor takes a student lead → submitted application; all green.

---

## Stage 5 — Institution portal `branch: stage/5-institution`

**Build:** institution users, application inbox, request-info, offers, propagation, admin vetting/catalogue.

**TDD steps**
1. Test: institution user authenticates with `institution_user` role → implement.
2. Test: institution sees only applications routed to its programs → implement inbox scoping.
3. Test: issuing an offer updates application status + becomes visible to the student → implement offer + propagation.
4. Test: admin vetting approves/suspends tenants + institutions → implement vetting.
5. Extend isolation suite for institution-scoped access.

**Gate:** full 3-sided loop green.

---

## Stage 6 — AI Gateway + document checks `branch: stage/6-ai`

**Build:** AI Gateway (routing/cache/quota/usage/fallback), async document-check pipeline.

**TDD steps**
1. Test: gateway routes simple docs to cheap model, complex to escalation (assert model chosen) → implement router (provider mocked).
2. Test: per-tenant quota blocks/queues over-limit calls → implement quota.
3. Test: every call emits a `UsageEvent` → implement metering emit.
4. Test: provider failure falls back to secondary model, request still succeeds → implement fallback.
5. Test: document-check job flags missing/mismatch/expiry/low-quality → `ai_check_json` → implement pipeline.
6. Test: results surface in review payload → wire into documents.

**Gate:** upload → async check → flags in review → `UsageEvent` recorded; all green.

---

## Stage 7 — Money machinery `branch: stage/7-billing`

**Build:** plans, subscriptions, usage metering aggregation, commission ledger, PaymentProvider stub.

**TDD steps**
1. Test: plan limits enforced at runtime; price is config, editable → implement plans/subscriptions.
2. Test: `UsageEvent` aggregates per tenant/meter/period; AI limit enforced from aggregate → implement metering.
3. Test: enrollment writes ledger entry (gross/platform-cut/tenant-cut) using config split; states accrued→payable→paid → implement ledger.
4. Test: `PaymentProvider` interface is stubbed and injectable → implement stub.

**Gate:** enrollment → ledger entry; AI usage counts to a plan limit; numbers editable; all green.

---

## Stage 8 — White-label + realtime `branch: stage/8-whitelabel-realtime`

**Build:** subdomain→tenant branding resolution API; websocket gateway; email templates.

**TDD steps**
1. Test: branding endpoint returns the right tenant's tokens for a subdomain → implement.
2. Test: a status change emits a websocket event to the correct room/scope → implement gateway.
3. Test: key events trigger templated emails (email transport mocked) → implement notifications.

**Gate:** live status push works; per-tenant branding served; all green.

---

## Stage 9 — Hardening `branch: stage/9-hardening`

**Build:** privacy/data-lifecycle, audit logging coverage, observability, security pass.

**TDD steps**
1. Test: a user's data can be exported + deleted on request → implement lifecycle.
2. Test: sensitive actions (docs/offers/money/access) write immutable audit entries → implement audit coverage.
3. Test: rate limits + input validation on sensitive endpoints → implement.
4. Expand isolation suite to full module coverage.

**Gate:** privacy flows green; audit complete; isolation covers all modules; security pass done.

---

## Definition of Done (every feature)

Tests written first and green · isolation suite extended · tenant-scoped access via `runInTenantContext` · external deps behind interfaces · async on BullMQ · configurable numbers in config/admin.
