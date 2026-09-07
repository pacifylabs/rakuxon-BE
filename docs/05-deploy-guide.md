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
5. Enable per-branch deploys so each `stage/*` branch gets a preview environment.

## Render (option B)

1. New **Web Service** from the repo; build `pnpm install && pnpm build`, start `pnpm migration:run && node dist/main.js`.
2. Add **Render Postgres** + **Render Redis**; wire their URLs into env.
3. Enable **auto-deploy** on your chosen branch; use **preview environments** for `stage/*` branches.

## Migrations

- Run TypeORM migrations on deploy (in the start command), never `synchronize: true` in production.
- **RLS policies are migrations** — they ship with the schema.

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
