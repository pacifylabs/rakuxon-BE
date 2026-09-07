# Backend PRD — Rakuxon API
**Repo:** `rakuxon-BE` · Companions in this `docs/` folder.

## 1. Purpose

The backend is the single system of record and API for the whole platform: tenants, users, students, documents, catalogue, applications, institutions, billing machinery, AI document checks, and realtime. It enforces multi-tenant isolation and exposes a typed contract the FE consumes.

## 2. Responsibilities (in scope this phase)

- **Identity & access:** self-hosted JWT auth, refresh rotation, RBAC, managed social/SSO adapter, tokenized student onboarding links.
- **Tenancy & operator-controlled scoping:** tenant resolution per request; Postgres RLS as the mechanism Rakuxon's toggles operate through; scope helper; isolation test gate run in both scope modes. **Student/document/application data is shared platform-wide behind a single switch** — see the risk callout in `09-tenant-isolation.md` §1 before building on it.
- **Entitlements & operator control:** `AgencyEntitlement` per tenant (feature flags, limits, data-access scope); Rakuxon super-admin view/manage over every agency; suspend/enable; audited changes.
- **Students:** records, pipeline stages, assignment, bulk import, onboarding-link lifecycle.
- **Documents:** signed Cloudinary uploads, versioned review workflow, virus-scan hook, feeds AI pipeline.
- **Catalogue:** global institutions/programs (shared by design and safe), ranked typeahead search, public detail pages, per-student shortlists.
- **Catalogue sourcing:** seed/import pipeline from licensed, official and open datasets, with per-record provenance. **Never from Edvoy or any competitor** — see `10-catalogue-data.md`.
- **Public intake:** contact/enquiry endpoint for the marketing site.
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

`platform_admin`, `agency_admin`, `counselor`, `institution_user`, `student`.

`platform_admin` is **Rakuxon the operator**: super-admin over every agency, with an audited operator context and control of each agency's entitlements. RBAC + data-scoping otherwise: counselors reach only assigned students; financials restricted to admins; students reach only their own scope; cross-agency student visibility follows the §4 switch in `09-tenant-isolation.md`.

## 5. Core entities

Tenant · **AgencyEntitlement** · User · Student · OnboardingLink · Document · Institution (global) · Program (global) · **CatalogueSource** · Shortlist · Application · Message · Offer · InstitutionUser · Plan · Subscription · UsageEvent · CommissionLedger · AuditLog · **ContactEnquiry**.

## 6. Non-functional requirements

- **Security:** encryption in transit/at rest; signed short-lived document URLs; PII minimization; secrets backend-only.
- **Scoping:** provable via the CI gate, run in **both** scope modes so the switch stays genuinely reversible; every tenant-scoped query runs through the scope helper. Sharing is read-only and narrow — writes never cross an agency boundary under any scope.
- **Data protection:** cross-agency reads and operator access are audited (GDPR Art. 5(2) accountability). Consent copy, agency DPA terms and under-16 handling are open items — `09-tenant-isolation.md` §1.
- **Performance:** catalogue search < 500ms P95; **typeahead < 150ms P95** (it runs on every keystroke after debounce); uploads never proxied through the API (direct-to-Cloudinary).
- **Reliability:** async work on BullMQ; AI fallback model; graceful degradation.
- **Compliance:** GDPR/UK GDPR + NDPA (Nigeria), DPA (Kenya/Ghana), PDPL (Qatar) — consent, export, deletion. Children's data: a material share of applicants are 16–18, so the ICO Age Appropriate Design Code applies. Data-residency escape hatch (tenant→datastore resolver) noted for later.
- **Licensing:** every catalogue record carries provenance and the licence in force at ingestion.
- **Observability:** per-tenant usage metering accurate enough to bill on.

## 7. Success criteria for the phase

Every feature in `Feature-List` passes its acceptance criteria with tests written first; the isolation gate is green across all modules; a full 3-sided loop works (counselor applies → institution offers → student sees it); document upload → AI check → review works end to end; money machinery records usage and ledger entries with configurable numbers.
