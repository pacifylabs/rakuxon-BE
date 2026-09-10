# Rakuxon VPS deployment

Rakuxon runs as one Docker Compose project on `31.220.111.4`, with two source repositories. Frontend apps remain in the existing pnpm monorepo. Do not copy secrets into Git.

| Public address | Service |
| --- | --- |
| `https://rakuxon.com` | base-site |
| `https://app.rakuxon.com` | partner-app |
| `https://schools.rakuxon.com` | institution-portal |
| `https://admin.rakuxon.com` | admin |
| `/api/v1/*` on each origin | Nest API, internally `/v1/*` |

The existing edge Nginx terminates TLS and forwards to `rakuxon_gateway:8080`. Only the gateway joins the shared `web` network. API and frontends use a separate project network with no published host ports. Postgres and Redis live on an additional internal data network that frontend containers cannot join; only the API and migration job can reach them. Server-rendered catalogue requests use `API_INTERNAL_URL=http://api:3001`; browser requests use `NEXT_PUBLIC_API_BASE_URL=/api`. `/api/catalogue` remains a Next.js route.

## Server layout

- `/root/projects/rakuxon/backend`: this repository
- `/root/projects/rakuxon/frontend`: `pacifylabs/rakuxon-FE`
- `secrets/compose.env`: database initialization passwords, mode 0600
- `secrets/api.env`: restricted runtime database connection and JWT secrets
- `secrets/migration.env`: database owner connection, used only for migrations
- `release.env`: deployed backend/frontend commit IDs
- `previous-release.env`: preceding application release
- `backups/`: custom-format database dumps and previous application images

At the owner’s request, `DATABASE_SYNCHRONIZE=true` is temporarily enabled. The non-superuser application role owns the entity tables and has schema-creation privileges through `postgres/enable-sync.sql`. Automatic synchronization can alter or remove columns; every deployment takes a database backup, but application rollback cannot undo those schema changes. Set this flag to `false` and return to migration-only DDL before retaining valuable production data. Migrations run separately as the database owner and must succeed before deployment continues. The current application explicitly removed RLS in migration `1757000400000`; tenant filtering is application-level. Old RLS documentation is not the current contract.

## Deploy

CI runs type checks, tests, and builds. After successful CI on main, `.github/workflows/deploy.yml` sends the exact verified SHA over SSH. Both repos serialize deployments using the same server `flock`. Deployments build the affected services sequentially, archive old images, back up the database, migrate if needed, wait for container readiness, and check all four frontend/API routes. A failed activation restores previous application images. These are single-instance replacements with brief potential downtime, not a zero-downtime rollout.

GitHub configuration for **both** repositories:

- Secret `VPS_HOST`: `31.220.111.4`
- Secret `VPS_SSH_KEY`: dedicated deployment private key (not your personal key)
- Secret `VPS_KNOWN_HOSTS`: previously verified server host-key entry
- Repository variable `VPS_DEPLOY_ENABLED`: `true`, only after initial deployment and secrets are ready
- Environment `production`

The deployment public key must use an `authorized_keys` forced command invoking `ops/ssh-dispatch.sh`, with `restrict`. It accepts only `frontend <40-character SHA>` or `backend <40-character SHA>`. It grants no interactive SSH session or port forwarding. Repository maintainers still control privileged deployment code and must be trusted.

Manual deployment:

```bash
bash /root/projects/rakuxon/backend/ops/deploy.sh backend <verified-main-commit>
bash /root/projects/rakuxon/backend/ops/deploy.sh frontend <verified-main-commit>
```

The script refuses dirty server checkouts and commits outside origin/main. Do not edit code directly on the VPS. The workflows pull Git over the server's existing GitHub SSH access; no personal GitHub token is stored in the app containers.

## DNS and HTTPS cutover

Before cutover, confirm whether existing production data must be migrated. The new database is initially empty. Never point users at it instead of an existing database without an agreed data migration.

Cloudflare is authoritative for `rakuxon.com`. Set A records for `@`, `www`, `app`, `schools`, and `admin` to `31.220.111.4` (or CNAMEs to the apex for subdomains). Remove conflicting A/AAAA records for these names only. Preserve mail and other unrelated records. Issue a certificate after all five names resolve to this VPS; HTTP challenge routing is in `nginx/edge-http.conf`.

```bash
certbot certonly --webroot -w /var/www/certbot --cert-name rakuxon.com \
  -d rakuxon.com -d www.rakuxon.com -d app.rakuxon.com \
  -d schools.rakuxon.com -d admin.rakuxon.com
```

Then install `nginx/edge-https.conf` as `/root/docker/nginx/conf.d/rakuxon.conf`, validate with `docker exec nginx_proxy nginx -t`, and reload. On a validation failure restore the previous file before doing anything else. Confirm HTTPS certificate validity, all frontend routes, API health/database readiness, and authenticated tenant isolation. `www` redirects to the apex. Google SSO requires separately configured provider credentials and redirect URLs.

The gateway trusts real-IP headers from the verified VPS `web` subnet `172.18.0.0/16`. Update this if the network is recreated with a different range. Auth rate limits are keyed to the client IP supplied by the edge. The edge trusts Cloudflare’s published proxy ranges for `CF-Connecting-IP`; DNS records remain proxied. Refresh those ranges when Cloudflare changes them. API Swagger is not published through the gateway.

## Backups and rollback

```bash
bash /root/projects/rakuxon/backend/ops/backup.sh
bash /root/projects/rakuxon/backend/ops/rollback.sh
```

Backups run daily through `rakuxon-backup.timer`, retain 14 days and are verified using `pg_restore --list`. A restore should also be periodically rehearsed against a separate database. These are **local backups**; an off-server destination and notification channel must be configured for disaster recovery. Do not represent local copies as protection against losing the VPS.

Rollback archives preserve images despite the server's existing weekly `docker system prune -af`. Application rollback does not reverse database migrations; use backward-compatible migrations. Restoring a database backup is a separate operation requiring a maintenance window and an explicit decision about writes since that backup. Keep the secret files backed up securely too.

## Verification and operating limits

```bash
cd /root/projects/rakuxon/backend
# Production status; avoid `config` without --quiet because it expands secrets.
docker compose --env-file ../secrets/compose.env -f ops/compose.yml ps
bash ops/smoke.sh
# Separate ephemeral database; never uses the production data volume.
docker compose -f ops/compose.test.yml up --build --abort-on-container-exit --exit-code-from verify
docker compose -f ops/compose.test.yml down
```

Node 24 and pnpm 10.33.0 build both apps. Next.js standalone output includes monorepo dependencies and static assets. Containers run as unprivileged users where supported, with no-new-privileges, dropped capabilities for application services, bounded logs, and memory limits. The API health check parses the dependency body because `/v1/health` itself always returns HTTP 200.

**Application limitations:** Student accounts, profiles and applications are part of the base site. SMTP must be configured for email verification and password resets; production tokens are never logged. Cloudinary uploads remain unconfigured pending private document storage and provider-side upload verification. Catalogue imports, Google SSO, offsite backups and external alerting also require configuration. Container readiness does not prove these integrations work.

References: [Next.js standalone output](https://nextjs.org/docs/15/app/api-reference/config/next-config-js/output), [Compose readiness](https://docs.docker.com/reference/cli/docker/compose/up/).
