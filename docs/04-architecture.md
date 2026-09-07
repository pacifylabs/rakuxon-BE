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
│   │   │   ├── tenant-context.provider.ts
│   │   │   ├── tenant-resolution.middleware.ts
│   │   │   ├── run-in-tenant-context.ts
│   │   │   └── orm-tenant.guard.ts
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
│   │   ├── applications/         # lifecycle, messaging, offers
│   │   ├── institutions/         # institution portal domain
│   │   ├── billing/              # plans, subscriptions, metering, ledger
│   │   └── admin/
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
auth guard → tenant-resolution middleware → tenant-context provider
→ controller → service → runInTenantContext(tenantId, manager => repo work)
→ Postgres RLS filters rows → orm-tenant.guard catches missing context
→ async side-effects (documents, AI, notifications, metering) via BullMQ
```

## Global vs tenant-scoped

- **Global (no RLS):** `institutions`, `programs`.
- **Tenant-scoped (RLS forced):** everything else listed in `CONTEXT.md`.

## Interfaces (providers swapped by config)

`StorageProvider` (Cloudinary now) · `PaymentProvider` (stub now, Stripe later) · AI provider (routed) · notification channel (email + ws). No feature code imports a vendor SDK directly.
