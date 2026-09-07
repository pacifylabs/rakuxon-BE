# Tenant isolation

*Stage 2. `CONTEXT.md` calls this gate sacred: red means no merge.*

## The one thing that breaks everything

**The API must connect as a role that is neither `SUPERUSER` nor `BYPASSRLS`.**

Postgres exempts both from row-level security unconditionally and silently.
There is no error, no warning, and no visible symptom — every policy stays in
place, every query succeeds, and every agency reads every other agency's rows.
A deployment that points `DATABASE_URL` at the migration credentials has no
tenancy at all and looks completely healthy.

Three things guard against it:

| Where | What |
|---|---|
| Boot | `assertRlsEnforceable()` in `main.ts` reads `pg_roles` and refuses to start |
| CI | the isolation suite asserts the same thing before anything else it checks |
| Provisioning | `pnpm db:provision` states `NOSUPERUSER NOBYPASSRLS` on every run |

## Two roles

| Role | Connection | Used for |
|---|---|---|
| owner (`rakuxon`) | `DATABASE_ADMIN_URL` | migrations, provisioning, tests that need `TRUNCATE` |
| app (`rakuxon_app`) | `DATABASE_URL` | everything the API does |

The app role is granted `SELECT, INSERT, UPDATE, DELETE` and nothing else.
`TRUNCATE` is withheld deliberately: it ignores row-level security entirely,
so granting it would hand every tenant a cross-tenant delete. DDL is withheld
so the API cannot drop a policy that constrains it.

## Two contexts

Both open a transaction and use `SET LOCAL`, so the setting dies at commit and
cannot survive on a pooled connection into somebody else's request.

```ts
// The normal path. Everything tenant-scoped goes through this.
await tenancy.runInTenantContext(user.tenantId, (manager) =>
  manager.getRepository(Student).find(),
);

// The narrow escape, for lookups that happen before a tenant is known.
await tenancy.runInIdentityContext((manager) =>
  manager.getRepository(User).findOne({ where: { email } }),
);
```

`runInIdentityContext` exists because signing in, rotating a refresh token and
redeeming an invitation cannot know a tenant in advance — establishing which
tenant someone belongs to is what they are for.

It is narrow **by construction, not by discipline**: only the credential-bearing
tables have a policy that honours it.

```
tenants · users · onboarding_links · refresh_tokens
password_reset_tokens · sso_identities
```

No business table does, and none should. Abusing the identity context can
never read another agency's students, documents or applications, because no
policy on those tables mentions it. The isolation suite asserts both the table
list and the set of files allowed to call it.

## Adding a tenant-scoped table

1. Give it a `tenantId uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE`.
2. In the migration: `ENABLE` **and** `FORCE ROW LEVEL SECURITY`, then a policy
   with both `USING` and `WITH CHECK` on `rls.current_tenant()`. `USING` alone
   lets a tenant write rows it cannot then see.
3. Grant the four statements to the app role.
4. Reach it only through `runInTenantContext`.
5. Add its cross-tenant case to `test/isolation/`.

Steps 1–3 are checked automatically: `policy-coverage.isolation-spec.ts` fails
if any table carrying a `tenantId` is missing RLS, if any table has RLS with no
policy, or if the app role holds a privilege beyond the four.

## Local setup

```bash
pnpm db:up
pnpm db:provision   # creates rakuxon_app — before the first migration
pnpm migration:run  # runs as the owner, via DATABASE_ADMIN_URL
pnpm test:isolation
```

`db:provision` must run before `migration:run`: the RLS migration grants to the
app role and fails loudly if it does not exist.

## What the gate covers

`pnpm test:isolation`, against a real Postgres on the real app role — a mock or
an in-memory driver would report success while proving nothing.

- the connection cannot bypass RLS, `TRUNCATE`, or disable a policy
- a tenant reading in its own context sees only its own rows — by `find`, by
  primary key, and through raw SQL
- a tenant cannot update, delete, or insert across the boundary
- with no context, a plain repository sees nothing rather than everything
- neither setting survives its transaction
- every tenant-scoped table is protected, and the escape hatch has not spread

The suite is configured with `passWithNoTests: false`, so deleting it fails CI
rather than turning the gate green.
