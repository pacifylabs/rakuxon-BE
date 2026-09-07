# Backend TDD Guide — Rakuxon API
**Stack:** Jest + Supertest + `@nestjs/testing`. Postgres via a disposable test database (or testcontainers).

## Why TDD here

This build has one catastrophic failure mode — a cross-tenant leak — and a lot of async, interface-driven plumbing. Writing tests first means the isolation guarantees and the interface contracts are *specified* before code exists, which is exactly what prevents back-and-forth. The test is the spec.

## The loop (every feature)

1. **Red** — write the smallest failing test that expresses the next acceptance criterion.
2. **Green** — write the least code to pass it.
3. **Refactor** — clean up with the test as a safety net.
4. Repeat to the next criterion. Commit on green.

## Test layers

| Layer | Tool | Tests what |
|---|---|---|
| **Unit** | Jest | services, guards, the AI router, the ledger math, helpers — dependencies mocked |
| **Integration** | Jest + Testing Module + real Postgres | repositories + RLS + `runInTenantContext` against a real DB |
| **E2E / HTTP** | Supertest against the Nest app | endpoints, auth, RBAC, full flows |
| **Isolation gate** | Jest + real Postgres, two tenants | the required CI gate — cross-tenant access must fail |

**Rule:** isolation and RLS behavior must be tested at the **integration/e2e** layer against a **real Postgres**, never mocked — RLS is a database feature, a mock can't prove it.

## The isolation gate (the most important tests)

Shape of the keystone test:

```
setup: create Tenant A and Tenant B, each with a student + a document
for each tenant-scoped repository/endpoint:
  acting as A:
    - reading B's row returns nothing (RLS) or 404/403 (API)
    - writing to B's row is rejected
    - a query with no tenant context throws (ORM guard)
assert: zero cross-tenant reads/writes succeed
```

Every new tenant-scoped module **adds its endpoints to this suite** as part of its definition of done. CI runs it on every push; **red = no merge**.

## What to mock vs. keep real

- **Mock:** Cloudinary SDK (assert signing params + folder path), BullMQ (assert jobs enqueued), AI provider (assert routing decisions + fallback), email transport, time where needed.
- **Keep real:** Postgres + RLS, TypeORM repositories, the Nest DI graph in e2e.

## Fixtures & helpers

- `createTenant()`, `createUser(role)`, `asTenant(tenantId)` request helper (sets auth + subdomain), `seedStudentWithDocument()`.
- A `withTestDb()` harness that spins a clean schema per test file (or wraps each test in a rolled-back transaction where isolation semantics allow).

## Conventions

- One behavior per test; name tests as the acceptance criterion (`rejects cross-tenant document read`).
- No test depends on another's state.
- Coverage is a signal, not a target — but the isolation gate and money/ledger math should be at/near 100%.
- Every bug fix starts with a failing test that reproduces it.

## Scripts (package.json)

```
test            # unit + integration (watch off)
test:watch      # TDD loop
test:e2e        # Supertest suites
test:isolation  # the required gate (real Postgres, two tenants)
test:cov        # coverage
```

CI runs `test`, `test:e2e`, and `test:isolation`; the last is a hard gate.
