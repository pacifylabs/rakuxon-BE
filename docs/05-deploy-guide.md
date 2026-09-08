# Backend Deploy Guide — Railway / Render
**Repo:** `rakuxon-BE`

> The BE deploys independently of the FE. Both Railway and Render work; pick one. This covers both plus the managed Postgres + Redis they provide.

## Services needed

- **API** (NestJS, containerized or buildpack).
- **PostgreSQL 16+** (managed) — must support RLS (standard Postgres does).
- **Redis** (managed) — cache + BullMQ.

## Environment variables (set in the platform dashboard)

```
NODE_ENV=production
PORT=                      # platform provides; bind to it
DATABASE_URL=              # managed Postgres connection string (SSL)
REDIS_URL=                 # managed Redis
JWT_ACCESS_SECRET=
JWT_REFRESH_SECRET=
SSO_GOOGLE_CLIENT_ID=
SSO_GOOGLE_CLIENT_SECRET=
CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=     # backend only
CLOUDINARY_UPLOAD_FOLDER_ROOT=rakuxon
CLOUDINARY_SIGNED_URL_TTL=300
AI_PROVIDER_API_KEY=
AI_PRIMARY_MODEL=
AI_FALLBACK_MODEL=
CORS_ALLOWED_ORIGINS=      # the Vercel FE domains
```

## Railway (option A)

1. New project → deploy from the `rakuxon-BE` repo.
2. Add **PostgreSQL** and **Redis** plugins; Railway injects `DATABASE_URL` / `REDIS_URL`.
3. Set the env vars above.
4. Start command: run migrations then boot — `pnpm migration:run && node dist/main.js`.
   Migrations use `DATABASE_ADMIN_URL`; the process itself uses `DATABASE_URL`.
5. Enable per-branch deploys so each `stage/*` branch gets a preview environment.

## Render (option B)

1. New **Web Service** from the repo; build `pnpm install && pnpm build`, start `pnpm migration:run && node dist/main.js`.
2. Add **Render Postgres** + **Render Redis**; wire their URLs into env.
3. Enable **auto-deploy** on your chosen branch; use **preview environments** for `stage/*` branches.

## Migrations

- Run TypeORM migrations on deploy (in the start command), never `synchronize: true` in production.
- **RLS policies are migrations** — they ship with the schema.
### Check the environment before deploying

```bash
NODE_ENV=production DATABASE_URL=... JWT_ACCESS_SECRET=... pnpm env:check
```

Runs the real validator plus the checks that are not validation errors — a
value can be well-formed and still wrong for production — and prints every
problem at once. A boot reports only the first thing it trips over, and each
round trip costs a build. It connects to nothing, so it is safe to run against
production values.

### Managed Postgres: provisioning the application role

Managed providers hand you an owner that can bypass RLS. Neon's `neondb_owner`
holds `BYPASSRLS` directly, so pointing `DATABASE_URL` at it leaves every
policy in place and enforcing nothing — the API refuses to boot rather than
pretend otherwise.

Postgres does **not** inherit role attributes through membership, so the fix is
a role that simply never had them:

```bash
# 1. Create the application role. Owner connection, app credentials.
DATABASE_ADMIN_URL='<owner connection string>' \
DATABASE_APP_USER=rakuxon_app \
DATABASE_APP_PASSWORD='<a new strong password>' \
  pnpm db:provision

# 2. Migrate as the owner. This also grants the four statements to the app role.
DATABASE_ADMIN_URL='<owner connection string>' pnpm migration:run

# 3. Point the service at the app role, and keep the owner for migrations only.
```

`db:provision` cannot run `ALTER ROLE ... NOBYPASSRLS` on a managed provider —
that needs a true superuser — so it tolerates the failure and **verifies** the
attributes instead, refusing if the role can bypass RLS. Create the role with
this script rather than a provider console, which may attach a privileged role
by default. To check any role yourself:

```sql
SELECT rolname, rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user;
```

- **`DATABASE_URL` must not be an owner or superuser account.** Postgres exempts
  superusers and `BYPASSRLS` roles from row-level security silently, so those
  credentials leave every policy in place and enforcing nothing. Provision the
  app role once with `pnpm db:provision`, give migrations `DATABASE_ADMIN_URL`,
  and give the service `DATABASE_URL`. The API refuses to boot otherwise — see
  `docs/09-tenant-isolation.md`.

## Branch → environment mapping

- `main` → production.
- `stage/*` → preview/ephemeral environment per branch (verify a stage in isolation before merging).
- Merge to `main` only when that stage's gate (incl. **isolation gate**) is green in CI.

## Post-deploy checks

- `/health` green.
- A cross-tenant request is denied in the deployed env (smoke test the isolation guarantee).
- Cloudinary signing works against real credentials (sign-upload returns a signature).
- BullMQ workers process a job (enqueue a no-op).

## Scaling notes (later)

- Separate the web process from BullMQ workers when document/AI volume grows.
- Watch per-tenant metering for noisy neighbors; add per-tenant rate limits.


## CORS

The frontend is five separate apps on five origins, so the API takes a list.
`WEB_APP_URL` is the canonical address used for links in emails and is always
allowed; `CORS_ORIGINS` is a comma-separated list of the rest.

```
WEB_APP_URL=https://rakuxon.com
CORS_ORIGINS=https://app.rakuxon.com,https://apply.rakuxon.com,https://schools.rakuxon.com,https://admin.rakuxon.com
```

Allowing only `WEB_APP_URL` blocks every app but the marketing site, and the
symptom in the browser is an unhelpful "could not reach the server".
