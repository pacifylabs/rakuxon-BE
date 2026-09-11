# Rakuxon VPS deployment

Rakuxon follows the shared infrastructure convention used by Kudipot on `31.220.111.4`.

| Address | Service |
| --- | --- |
| https://rakuxon.com | base-site, including student accounts |
| https://app.rakuxon.com | partner-app |
| https://schools.rakuxon.com | institution-portal |
| https://admin.rakuxon.com | admin |
| `/api/v1/*` on each origin | Nest API |

## Configuration and database

- `/root/projects/rakuxon/backend/.env.production`: API and migration configuration, including the database URL and JWT secrets.
- `/root/projects/rakuxon/frontend/.env.production`: frontend runtime configuration.
- Both files are server-only, mode `0600`, ignored by Git and excluded from Docker builds. Only `.env.example` belongs in Git.
- `/root/projects/rakuxon/release.env`: deployed commit IDs only; no credentials.
- Shared container `postgres` hosts `rakuxon_db`, owned by the dedicated non-superuser `rakuxon_app`. No other application's database or credentials are used.
- API and migration containers join the existing `web` network to reach shared Postgres. Frontends remain on the project network. No application ports are published on the host.
- `REDIS_URL` points to shared Redis database 15. The current API does not use Redis; reserve that logical database for future Rakuxon usage and add application-specific key prefixes before adding caching or queues.

At the owner's request, `DATABASE_SYNCHRONIZE=true` remains enabled. The application database owner can alter its own schema. Synchronization can remove columns and data; switch to migration-only schema changes before retaining valuable production data. Application rollback does not reverse database changes.

## Deployment

CI checks types, tests and builds. Successful CI on `main` triggers the deployment workflow through a restricted SSH key. Both repositories use `VPS_HOST`, `VPS_SSH_KEY`, `VPS_KNOWN_HOSTS`, the `production` environment and `VPS_DEPLOY_ENABLED=true`.

`ops/deploy.sh` serializes deployments, refuses dirty checkouts, verifies the commit belongs to `origin/main`, builds images, archives previous images, backs up the database, runs migrations, waits for health checks and verifies all four origins. Failed activation restores the previous application images. Single-instance replacement may briefly interrupt service.

```bash
cd /root/projects/rakuxon/backend
docker compose --env-file ../release.env -f ops/compose.yml ps
bash ops/smoke.sh
bash ops/deploy.sh backend <verified-main-commit>
bash ops/deploy.sh frontend <verified-main-commit>
```

Migrations use the same `.env.production` and dedicated database owner as the API. The shared Postgres service is managed separately, like Kudipot; it must be running before migrations or startup. Never run e2e tests against production: those tests truncate data.

## HTTPS and backups

Cloudflare website records point to the VPS. The shared edge Nginx terminates TLS and forwards to `rakuxon_gateway:8080`; `www` redirects to the apex. The edge trusts Cloudflare's published proxy ranges for client addresses. `/api/catalogue` remains a Next.js route and Swagger is not published by the gateway.

The Let's Encrypt certificate covers all five names. Certbot renewal is scheduled, with a scoped Nginx validation/reload hook. Edge templates are in `ops/nginx/` and the active file is `/root/docker/nginx/conf.d/rakuxon.conf`.

`rakuxon-backup.timer` runs daily. `ops/backup.sh` dumps only `rakuxon_db` from shared Postgres, verifies the archive and retains 14 days. Backups and rollback images live in `/root/projects/rakuxon/backups`.

```bash
bash ops/backup.sh
bash ops/rollback.sh
```

Rollback restores application images, not schema or data. Backups are local; off-server backup storage remains to be configured. The retired dedicated database volume is retained as a cutover fallback, not used by the running API.

## Integrations

SMTP email delivery, private document uploads, catalogue imports and off-server backups require separate configuration. Never copy another project's service credentials into Rakuxon's environment as a shortcut.
