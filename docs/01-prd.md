# Backend PRD — Rakuxon API
**Repo:** `rakuxon-BE` · Companions in this `docs/` folder.

## 1. Purpose

The backend is the single system of record and API for the whole platform: tenants, users, students, documents, catalogue, applications, institutions, billing machinery, AI document checks, and realtime. It enforces multi-tenant isolation and exposes a typed contract the FE consumes.

## 2. Responsibilities (in scope this phase)

- **Identity & access:** self-hosted JWT auth, refresh rotation, RBAC, managed social/SSO adapter, tokenized student onboarding links.
- **Tenancy & isolation:** tenant resolution per request; Postgres RLS; tenant-scoped transaction helper; ORM guard; isolation test gate.
- **Students:** records, pipeline stages, assignment, bulk import, onboarding-link lifecycle.
- **Documents:** signed Cloudinary uploads, versioned review workflow, virus-scan hook, feeds AI pipeline.
- **Catalogue:** global institutions/programs, filtered search, per-student shortlists.
- **Applications:** lifecycle + audit trail, threaded messaging, offers.
- **Institution portal domain:** institution users, application inbox, request-info, offers.
- **AI Gateway:** routing + caching + per-tenant quota + usage metering + fallback; document-check pipeline.
- **Money machinery:** plans, subscriptions, usage metering, commission ledger; `PaymentProvider` stub.
- **Realtime & notifications:** websocket gateway; email with per-tenant templates.
- **Admin:** vetting (tenants + institutions), catalogue management, plans/limits/splits config.
- **Cross-cutting:** audit logging, privacy/data-lifecycle, observability, security.

## 3. Out of scope this phase

Stripe live wiring · advanced/early commissions · verification/tamper-evidence · university CRM integrations · custom-domain white-label · AI beyond document checks · value-added services.

## 4. Personas the API serves

`platform_admin`, `agency_admin`, `counselor`, `institution_user`, `student`. RBAC + data-scoping: counselors reach only assigned students; financials restricted to admins; students reach only their own scope.

## 5. Core entities

Tenant · User · Student · OnboardingLink · Document · Institution (global) · Program (global) · Shortlist · Application · Message · Offer · InstitutionUser · Plan · Subscription · UsageEvent · CommissionLedger · AuditLog.

## 6. Non-functional requirements

- **Security:** encryption in transit/at rest; signed short-lived document URLs; PII minimization; secrets backend-only.
- **Isolation:** provable via the CI gate; every tenant-scoped query runs in tenant context.
- **Performance:** catalogue search < 500ms P95; uploads never proxied through the API (direct-to-Cloudinary).
- **Reliability:** async work on BullMQ; AI fallback model; graceful degradation.
- **Compliance:** GDPR/local law — consent, export, deletion. Data-residency escape hatch (tenant→datastore resolver) noted for later.
- **Observability:** per-tenant usage metering accurate enough to bill on.

## 7. Success criteria for the phase

Every feature in `Feature-List` passes its acceptance criteria with tests written first; the isolation gate is green across all modules; a full 3-sided loop works (counselor applies → institution offers → student sees it); document upload → AI check → review works end to end; money machinery records usage and ledger entries with configurable numbers.
