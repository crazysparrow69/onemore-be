# Delivery reference (Docker, CI/CD, deploy, ops, cost)

Read when touching Dockerfile, compose, CI, Cloud Build, infra scripts, logging, secrets, anything that costs money. Spec stage: "6. DevOps План" and stage 1 sections.

## Dockerfile (one template per service, only the name differs)
Stages: `deps` (`pnpm fetch` by lockfile) -> `build` -> `prune` (`pnpm deploy --filter <svc> --prod`) -> `runtime` (clean `node:24-alpine`) + separate `development` target for compose.
`node dist/main.js` directly (SIGTERM must reach the app); `enableShutdownHooks()`; `USER node`; `NODE_ENV=production`; no secrets as ARG/ENV; `.dockerignore`: `node_modules .git tests .env*`. Image must be small (registry limit 0.5 GB total). Same image runs everywhere.

## Config and local dev
- Env validated by Zod at startup; `.env.example` for every service (all vars, comment, safe example); CI checks env-schema keys == `.env.example` keys.
- Pin versions: `.nvmrc`, `packageManager` in `package.json`.
- `docker compose up db` + `pnpm dev` (`pnpm -r --parallel dev`, `nest start --watch`). `docker compose --profile full up` = all services in containers (`target: development`). DB has a healthcheck. Only `prod` and `local` environments exist.

## CI on PR (GitHub Actions; only changed packages: `pnpm --filter "...[origin/main]"`)
`lint` (ESLint + Prettier --check) · `typecheck` (`tsc --noEmit`) · `unit` (Vitest) · `integration` (Testcontainers: repositories, guards 401/403, userId filter) · `migrations` · `contracts` (`openapi.json` fresh + `oasdiff breaking` vs main) · `image` (runtime stage builds) · `ci-ok` (aggregator, the ONLY required check). Also a boundary check (dependency-cruiser / `no-restricted-imports`).
No secrets on `pull_request`; never use `pull_request_target`. `main`: PR only, `ci-ok` required, squash merge, no force push.

## Deploy on push to `main` (Cloud Build; one parametrized `infra/cloudbuild/service.yaml`, one trigger per service)
Trigger `--included-files`: `apps/<svc>/`, every `packages/<pkg>/` it depends on, `pnpm-lock.yaml`.
1. Build image, tag `:<SHA>`, push to Artifact Registry (`europe-west1-docker.pkg.dev/...`). Container Registry is not used.
2. Migrations (services with a DB): `node dist/migrate.js`, direct connection string from Secret Manager. Failure = stop, old revision keeps serving.
3. `gcloud run deploy --no-traffic --tag candidate --revision-suffix <sha7>` with the flags from SKILL.md rule 15.
4. Smoke: `GET https://candidate---<svc>-....run.app/health` -> 200 and `version == SHA`.
5. `gcloud run services update-traffic --to-latest`.
Two fast merges to one service are not queue-protected: wait for the first deploy to finish.

## Rollback
Code: `gcloud run services update-traffic SERVICE --to-revisions=PREV=100` (< 1 min; list with `gcloud run revisions list --service SERVICE`). Web: Vercel Instant Rollback. DB: never rolled back, fix forward. Then immediately revert/fix in `main`. Before a risky migration: manual `pg_dump` (`docs/runbooks/restore.md`). Runbooks: `docs/runbooks/rollback.md`, `restore.md`.

## Secrets
Secret Manager only; mounted to Cloud Run by `:latest` reference; readable only by that service's own service account. Free tier = 6 active versions: on rotation DESTROY old versions. v0.1 needs just two DB connection strings. Vercel env: only public `VITE_*`. Per-service accounts: `sa-core`, `sa-nutrition` (own DB secret only). Cloud Build account: Artifact Registry write, Cloud Run deploy, actAs runtime accounts, DB secrets for migrations.

## Logs / health / monitoring
pino JSON to stdout with `severity` and `logging.googleapis.com/trace`; `service` and `version` in every line; Error Reporting from ERROR logs with stack; 4 email alerts (5xx rate, p95 latency, max-instances hit, AI provider 402); uptime check on `/health` (no DB). Log retention stays 30 days. Sentry is web-only (EU region).

## Cost guardrails
Billable-by-existence (forbidden): GKE, HTTPS Load Balancer (even for a custom domain), Cloud SQL, `min-instances>=1`, VPC connector, Memorystore, `--no-cpu-throttling`, Tier 2 regions. Egress from Europe is paid from the first byte: never serve heavy files from Cloud Run. Budget alerts only send email, they do not stop spending.

## Implementation order (spec section 7, phase 1-4 of DevOps)
1. Walking skeleton: monorepo, empty core-service with `/health`, Dockerfile, compose, `.env.example`, PR CI, Cloud Build trigger. Done when merge to `main` -> new revision in prod in <= 5 min. CI/CD is set up FIRST on an empty service (lesson from the previous project), not last.
2. Safe deploy + verified rollback (< 1 min).
3. DB: Drizzle, migration as Cloud Build step, Secret Manager.
4. Before friends: alerts, uptime, Sentry in web, runbooks, deliberately broken deploy gets no traffic.

## Deferred (do NOT build now)
Workload Identity Federation, Neon branches for migration rehearsal, Cloud Run Job for migrations, OpenTofu (gcloud scripts in `infra/gcp/` first), scheduled backups, Trivy/CodeQL/osv-scanner, staging, deploy queue.
