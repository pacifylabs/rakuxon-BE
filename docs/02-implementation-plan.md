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

> **Status: partial.** Register / login / refresh-with-rotation / logout / me, argon2id hashing, refresh-token families with replay detection, `@Roles` guard, subdomain tenant resolution and onboarding-link issue/consume/revoke are green (43 unit, 39 e2e). **Not yet done:** password reset, the SSO adapter, and per-user data scoping — scoping lands with the RLS work in stage 2, where it can be enforced at the database rather than only in a service.

---

## Stage 2 — Isolation hardening `branch: stage/2-isolation` (the linchpin)

**Build:** RLS policies, tenant-scoped transaction helper, ORM guard, the isolation gate.

**TDD steps**
1. Test (the keystone): create tenant A + tenant B; assert A cannot read B's rows via any repository method → implement RLS migration (`FORCE ROW LEVEL SECURITY`, policy on `app.current_tenant`).
2. Test: a tenant-scoped query outside `runInTenantContext` throws → implement ORM guard.
3. Test: `runInTenantContext(tenantId, fn)` sets `SET LOCAL app.current_tenant` and scopes the tx → implement helper.
4. Wire the cross-tenant suite into CI as a **required gate**.

**Gate:** isolation suite green and required; manual cross-tenant read fails at the DB.

> From here, every new module adds its endpoints to the isolation suite as part of its definition of done.

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

**Build:** pipeline stages, bulk import, assign/reassign, catalogue + search + shortlist, applications + messaging.

**TDD steps**
1. Test: stage transitions are audited; invalid transition rejected → implement pipeline.
2. Test: CSV import reports row errors without failing the batch → implement bulk import.
3. Test: reassign moves access rights with the student → implement.
4. Test: catalogue search filters (country/level/subject/fees/intake) return expected set; institutions/programs are global (visible across tenants) → implement search.
5. Test: create application (student→program) with required docs; status lifecycle + audit trail → implement.
6. Test: post message on application persists + scoped to tenant → implement (realtime added Stage 8).
7. Extend isolation suite for applications/messages/shortlists (and confirm catalogue is intentionally global).

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
