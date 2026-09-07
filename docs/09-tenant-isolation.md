# Data scoping and tenant isolation

*Stage 2 built the mechanism. This document defines the **policy** it enforces.*

> **Model changed (plan revision).** The original model was per-agency isolation
> with a shared catalogue. It is now **operator-controlled scoping**: Rakuxon is
> the super-admin, decides what each agency can see and do, and student data is
> shared platform-wide behind a switch. The RLS plumbing is **not** removed — it
> is the mechanism Rakuxon's toggles operate through. Read §1 before building on
> this.

---

## 1. Risk callout — sharing student data across agencies

**Read this before implementing.** It is a decision, not an oversight, but it should be a decision made with the consequences in view.

Sharing student, document and application records across every agency on the platform means that a student who hands their passport scan, transcripts, bank statements and visa medicals to **one** agency has, in fact, handed them to **all** of them. Study-abroad applicants are routinely 16–18, so a meaningful share of that pool is **children's data**: UK GDPR Art. 8 and the ICO's Age Appropriate Design Code require high privacy *by default* for services children are likely to use, and the NDPA (Nigeria), Kenya's DPA and Qatar's PDPL — the jurisdictions Rakuxon actually operates in — all carry purpose-limitation and consent duties of their own. The lawful basis is the sharp end: consent under GDPR must be specific and informed, and "your data may be visible to other agencies on our platform" buried in terms of service is not consent a regulator will accept. Some of the documents are worse than ordinary personal data — visa medicals are health data and passports carry nationality, both Art. 9 special categories needing a stronger basis than the rest. Commercially the exposure runs the other way: an agency's pipeline **is** its book of business, so agency B seeing agency A's students is a poaching channel, and it is precisely why Edvoy and ApplyBoard silo agent data. The first agency to notice will leave and tell the others. And the blast radius changes shape: one phished counselor account stops being one agency's incident and becomes a reportable breach of every student on the platform, inside 72 hours.

**The safer alternative, for the record.** Student/document/application data stays private per agency — exactly what stage 2 already built and proved. Rakuxon still sees and controls everything through an explicit, audited operator context, and still toggles features, limits and access per agency. The operator loses **nothing** they asked for except agency-to-agency visibility, which is the single part carrying all of the risk above. If cross-agency visibility is wanted for a specific purpose later — say, a student consenting to a second opinion, or transferring between agencies — that is far better served by a **per-student, consent-backed, time-boxed share** than by making the whole pool public to every tenant.

**Proceeding as instructed** with platform-wide sharing, built behind the switch in §4 so the decision stays reversible. Three constraints reduce the damage without changing what was asked for:

1. **Sharing is read-only.** Writes stay agency-scoped under every scope (§4.3).
2. **Sharing is narrow.** Only `students`, `documents`, `applications`. Never staff accounts, invitations, credentials, billing or ledger (§4.2).
3. **Sharing is logged.** Every cross-agency read is audited (§4.5).

To verify before launch, not after: the privacy notice and consent copy actually shown to students, the DPA terms offered to agencies, and whether under-16s can register at all.

---

## 2. Roles over the data

| Actor | Sees | Mechanism |
|---|---|---|
| **Rakuxon (platform_admin)** | everything, always | `runInOperatorContext` — audited |
| **Agency** | its own data, plus shared-scope reads when the switch allows | `runInDataContext` |
| **Student** | only their own records | tenant context + row filter |
| **Institution user** | only applications routed to it | its own scope |

Rakuxon is the super-admin: it can view and manage any agency, toggle that agency's features and data access, and suspend or re-enable it. Those controls are **entitlements** (§3), and they are enforced through the same RLS plumbing rather than beside it.

---

## 3. Entitlements — what Rakuxon toggles per agency

A new first-class concept, `AgencyEntitlement`: one row per tenant holding what that agency may do and how much of it.

```
AgencyEntitlement
  tenantId          uuid, unique
  features          jsonb   — feature flags, e.g. { ai_document_checks: true,
                              bulk_import: false, catalogue_search: true }
  limits            jsonb   — e.g. { students: 500, ai_checks_per_month: 200 }
  dataAccess        enum    — 'own' | 'shared'   (per-agency override of §4)
  updatedByUserId   uuid    — who changed it
  updatedAt         timestamptz
```

- **Default deny for new features.** A flag absent from `features` is off, so shipping a feature does not silently enable it for everyone.
- **Suspension** stays on `Tenant.status` (`pending | active | suspended`) — it already exists and gates sign-in. Entitlements gate *features*; status gates *access*.
- **`dataAccess`** lets Rakuxon put a single agency back in its own lane without moving the platform switch — the per-agency half of §4.
- **Every change is audited**, with the admin's user id. This is the table most worth an audit trail: it is where one click widens who sees a minor's passport.
- Enforced by a `@RequiresEntitlement('ai_document_checks')` guard that runs after RBAC. A missing entitlement is **403**, distinct from 401.

Admin console gets: agency list → per-agency entitlement editor (feature toggles, limits, data access) → suspend/enable → audit trail of changes.

---

## 4. The access-scope switch

### 4.1 Where it lives

**One file. One type. One resolver.**

```
src/common/tenancy/access-scope.ts
```

```ts
export type AccessScope = 'agency' | 'platform';

/** Only these tables ever widen. Adding one is a deliberate, reviewed act. */
export const SHARED_SCOPE_TABLES = ['students', 'documents', 'applications'] as const;

/**
 * THE SWITCH.
 *
 * 'platform' — student data is readable across agencies (current decision)
 * 'agency'   — student data is private per agency (stage 2 behaviour)
 *
 * Platform default from STUDENT_DATA_SCOPE; an agency's own entitlement can
 * narrow it, never widen it.
 */
export function scopeFor(env: Env, entitlement?: AgencyEntitlement): AccessScope {
  if (entitlement?.dataAccess === 'own') return 'agency';
  return env.STUDENT_DATA_SCOPE;
}
```

Nothing else in the codebase reads `STUDENT_DATA_SCOPE`. Services call `runInDataContext(actor, work)`; the helper calls `scopeFor` and sets the session variables. Flipping the platform back to per-agency is a config change plus a redeploy — no service, controller, query or policy is touched.

### 4.2 What widens, and what never does

| Widens under `platform` | Never widens |
|---|---|
| `students` | `users` — an agency's staff accounts |
| `documents` | `onboarding_links` — its invitations |
| `applications` | `refresh_tokens`, `password_reset_tokens`, `sso_identities` |
| | `agency_entitlements`, billing, ledger, usage |
| | `audit_log` |

An agency seeing another agency's *students* is the decision that was made. An agency seeing another agency's *staff, invitations, credentials or revenue* is not, and no switch position enables it.

### 4.3 Reads widen; writes never do

Sharing is read-only, enforced in SQL rather than by convention — separate policies per command:

```sql
-- SELECT may widen.
CREATE POLICY students_read ON students FOR SELECT
  USING ( "tenantId" = rls.current_tenant()
          OR rls.in_operator_context()
          OR rls.in_shared_read() );

-- INSERT / UPDATE / DELETE never do.
CREATE POLICY students_write ON students FOR ALL
  USING      ( "tenantId" = rls.current_tenant() OR rls.in_operator_context() )
  WITH CHECK ( "tenantId" = rls.current_tenant() OR rls.in_operator_context() );
```

> **Why per-command and not one policy.** `WITH CHECK` does not apply to `DELETE`
> — only `USING` does. A single wide policy would therefore let one agency
> *delete* another's students while appearing to protect updates. The split is
> the difference between "shared" and "shared and destructible".

### 4.4 Session variables

| Variable | Set by | Meaning |
|---|---|---|
| `app.current_tenant` | always | the acting agency |
| `app.shared_read` | `runInDataContext`, only when scope is `platform` | widen SELECT on §4.2's three tables |
| `app.operator` | `runInOperatorContext` | Rakuxon super-admin, audited |
| `app.identity_context` | `runInIdentityContext` | pre-tenant lookups (unchanged) |

All `SET LOCAL`, so all die with their transaction and cannot leak onto a pooled connection.

### 4.5 Auditing

`runInOperatorContext` and any `shared_read` transaction that actually returns another tenant's rows emit an `audit_log` entry: actor, tenant acted upon, resource, timestamp. Without this, "who looked at this student's passport" has no answer — which is itself a GDPR problem (Art. 5(2) accountability).

### 4.6 The gate runs in both modes

`pnpm test:isolation` runs the whole suite **twice** — once with `STUDENT_DATA_SCOPE=agency`, once with `platform`:

- **`agency`** — the stage 2 guarantees, unchanged. Proves the switch is genuinely reversible instead of a path that quietly rots while the other one is live.
- **`platform`** — students/documents/applications are readable across agencies; **everything in §4.2's right-hand column is still not**; writes and deletes still fail across the boundary.

Both must be green. This is what makes "flip it later without a rewrite" a fact rather than an intention.

---

## 5. The thing that breaks everything

**The API must connect as a role that is neither `SUPERUSER` nor `BYPASSRLS`.**

Postgres exempts both from row-level security unconditionally and silently. There is no error, no warning, and no visible symptom — every policy stays in place, every query succeeds, and every scope rule in this document stops applying. A deployment pointing `DATABASE_URL` at the migration credentials has no scoping at all and looks completely healthy.

| Where | What |
|---|---|
| Boot | `assertRlsEnforceable()` in `main.ts` reads `pg_roles` and refuses to start |
| CI | the isolation suite asserts it before anything else |
| Provisioning | `pnpm db:provision` states `NOSUPERUSER NOBYPASSRLS` on every run |

## 6. Two roles

| Role | Connection | Used for |
|---|---|---|
| owner (`rakuxon`) | `DATABASE_ADMIN_URL` | migrations, provisioning, tests needing `TRUNCATE` |
| app (`rakuxon_app`) | `DATABASE_URL` | everything the API does |

The app role gets `SELECT, INSERT, UPDATE, DELETE` and nothing else. `TRUNCATE` is withheld deliberately: it ignores row-level security entirely. DDL is withheld so the API cannot drop a policy that constrains it.

## 7. The contexts

```ts
// Tenant-scoped work. Honours the §4 switch.
await tenancy.runInDataContext(actor, (manager) =>
  manager.getRepository(Student).find(),
);

// Rakuxon super-admin. Audited, platform_admin only.
await tenancy.runInOperatorContext(admin, (manager) => …);

// Pre-tenant lookups: sign-in, token rotation, invitation redemption.
await tenancy.runInIdentityContext((manager) => …);
```

`runInTenantContext(tenantId, …)` remains for work that names its tenant explicitly (background jobs, operator acting *as* an agency).

`runInIdentityContext` is narrow **by construction, not by discipline**: only the credential-bearing tables have a policy honouring it —

```
tenants · users · onboarding_links · refresh_tokens
password_reset_tokens · sso_identities
```

No business table does. The isolation suite asserts both that list and the set of files allowed to call it.

## 8. Adding a tenant-scoped table

1. Give it `tenantId uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE`.
2. In the migration: `ENABLE` **and** `FORCE ROW LEVEL SECURITY`, then policies with `USING` **and** `WITH CHECK`. `USING` alone lets a tenant write rows it cannot see.
3. Decide whether it belongs in `SHARED_SCOPE_TABLES`. **Default is no.** If yes, split the policy per command (§4.3).
4. Grant the four statements to the app role.
5. Reach it only through `runInDataContext`.
6. Add its cross-tenant case to `test/isolation/`, in both scope modes.

Steps 1–4 are checked automatically: `policy-coverage.isolation-spec.ts` fails if any table carrying a `tenantId` lacks RLS, if any table has RLS with no policy, if the app role holds a privilege beyond the four, or if `SHARED_SCOPE_TABLES` has grown without the list in that test being updated to match.

## 9. Local setup

```bash
pnpm db:up
pnpm db:provision   # creates rakuxon_app — before the first migration
pnpm migration:run  # runs as the owner, via DATABASE_ADMIN_URL
pnpm test:isolation # runs both scope modes
```

`db:provision` must run before `migration:run`: the RLS migration grants to the app role and fails loudly if it does not exist.

## 10. What the gate covers

Against a real Postgres on the real app role — a mock or an in-memory driver would report success while proving nothing.

- the connection cannot bypass RLS, `TRUNCATE`, or disable a policy
- **`agency` scope:** a tenant sees only its own rows, by `find`, by primary key, and through raw SQL
- **`platform` scope:** shared tables widen for reads; §4.2's right-hand column does not; writes and deletes still fail across the boundary
- with no context, a plain repository sees nothing rather than everything
- no session variable survives its transaction
- every tenant-scoped table is protected, and the identity escape hatch has not spread
- operator context is reachable only by `platform_admin`, and is audited

`passWithNoTests: false`, so deleting the suite fails CI rather than turning the gate green.
