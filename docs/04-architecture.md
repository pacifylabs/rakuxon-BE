# Backend Architecture & Folder Structure — Rakuxon API
**Repo:** `rakuxon-BE`

## Folder structure

```
rakuxon-BE/
├── docs/                         # these documents
├── src/
│   ├── main.ts
│   ├── app.module.ts
│   ├── common/
│   │   ├── tenancy/
│   │   │   ├── access-scope.ts          # ★ THE SWITCH (09 §4.1)
│   │   │   ├── tenant-context.ts        # runInData/Tenant/Operator/IdentityContext
│   │   │   ├── tenant-resolution.middleware.ts
│   │   │   ├── rls-enforcement.ts       # boot assertion: role cannot bypass RLS
│   │   │   └── tenancy.module.ts
│   │   ├── entitlements/                # AgencyEntitlement + @RequiresEntitlement
│   │   ├── auth/                 # JWT strategy, guards, SSO adapter
│   │   ├── rbac/                 # roles + @Roles() guard
│   │   ├── storage/
│   │   │   ├── storage-provider.interface.ts
│   │   │   ├── cloudinary.provider.ts
│   │   │   └── storage.module.ts
│   │   ├── ai/                   # gateway: interface, router, cache, quota, usage emit, fallback
│   │   ├── payments/             # PaymentProvider interface + stub
│   │   ├── notifications/        # email service + websocket gateway
│   │   ├── queue/                # BullMQ setup + base processors
│   │   ├── audit/                # audit-log service
│   │   └── config/               # env schema, feature flags
│   ├── modules/
│   │   ├── tenants/
│   │   ├── users/
│   │   ├── students/
│   │   ├── documents/
│   │   ├── catalogue/            # institutions, programs (GLOBAL), search, shortlists
│   │   │   ├── search/           # ranked typeahead + full search
│   │   │   └── sourcing/         # CatalogueSource adapters + import pipeline (10)
│   │   ├── applications/         # lifecycle, messaging, offers
│   │   ├── institutions/         # institution portal domain
│   │   ├── billing/              # plans, subscriptions, metering, ledger
│   │   ├── contact/             # public enquiry intake (marketing site)
│   │   └── admin/               # vetting, entitlements, catalogue review queue
│   ├── database/
│   │   ├── data-source.ts
│   │   ├── migrations/
│   │   └── rls/                  # RLS policy SQL applied via migration
│   └── contract/                 # DTOs/enums published as @rakuxon/contract (see 07)
├── test/
│   ├── isolation/                # the CI gate
│   ├── e2e/
│   └── helpers/                  # fixtures, withTestDb, asTenant
├── docker-compose.yml            # postgres + redis
├── .github/workflows/ci.yml
├── .env.example
└── package.json
```

## Module anatomy (repeat for every module)

```
modules/<name>/
├── <name>.module.ts
├── <name>.controller.ts
├── <name>.service.ts
├── dto/
├── entities/                # tenant_id + RLS unless global
└── <name>.spec.ts / e2e     # tests written FIRST
```

## Request pipeline

```
auth guard → @Roles → @RequiresEntitlement → tenant-resolution middleware
→ controller → service → runInDataContext(actor, manager => repo work)
→ access-scope.ts decides which session variables to set
→ Postgres RLS filters rows (reads may widen; writes never do)
→ audit-log entry for operator access and cross-agency reads
→ async side-effects (documents, AI, notifications, metering) via BullMQ
```

## Data scoping

- **Global (no RLS):** `institutions`, `programs` — the shared catalogue. Intended and safe.
- **Shared-scope (RLS forced, reads widen under the switch):** `students`, `documents`, `applications`.
- **Tenant-scoped (RLS forced, never widens):** `users`, `onboarding_links`, `agency_entitlements`, billing, ledger, usage, audit.
- **Credential (RLS forced, identity path only):** `refresh_tokens`, `password_reset_tokens`, `sso_identities`.

The switch, the table lists and the read/write asymmetry are defined in `09-tenant-isolation.md` §4. **Do not scatter scope decisions into services** — they call `runInDataContext` and the helper decides.

## Interfaces (providers swapped by config)

`StorageProvider` (Cloudinary now) · `PaymentProvider` (stub now, Stripe later) · AI provider (routed) · notification channel (email + ws) · **`CatalogueSource`** (one adapter per licensed/open dataset — the only code that fetches an external catalogue). No feature code imports a vendor SDK directly.
