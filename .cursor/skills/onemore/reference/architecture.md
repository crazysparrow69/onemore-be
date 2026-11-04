# Architecture reference

Read when working on services, auth, API routes, repo layout, contracts. Spec stage: "5. Архитектура".

## Repositories
- **backend** (this repo, pnpm workspaces): `apps/*`, `packages/*`, `infra/`, `docs/`.
- **web** (separate repo): React + Vite PWA on Vercel. Imports NOTHING from backend. Types/Zod form schemas are duplicated by hand from `openapi.json`. Extraction to an npm package is planned after MVP (v0.2), not now.

## Routing (Vercel rewrites in the web repo, no gateway)
| Path prefix | Service |
|---|---|
| `/api/me`, `/api/exercises`, `/api/templates`, `/api/schedule`, `/api/workouts` | core-service |
| `/api/body`, `/api/goals`, `/api/weight`, `/api/nutrition` | nutrition-service |
| `/api/ai` (v0.2) | ai-service |

Paths are by domain, not by service. `/internal/*` is NOT in rewrites but is still internet-reachable, so it must verify the Google ID token in code.
No CORS needed (same domain). Calendar = two parallel requests from the web; if nutrition is down, calendar renders without calories. Onboarding: web writes profile to core, body+goal to nutrition; idempotent; "onboarding done" flag is set last.

## core-service modules
`accounts` (language, units, IANA time zone, onboarding flag, training profile) · `exercises` (system catalog from free-exercise-db + private ones, visibility) · `templates` · `schedule` (weekly rules + planned day) · `sessions` (workouts, sets, comments, "last time" hints) · `internal` (compact summaries for AI).

## nutrition-service modules
`body` (sex, birth date, height, activity) · `goals` (goal + weekly rate, with history) · `weight` (log) · `targets` (kcal/macros by Mifflin-St Jeor with a safe lower bound, history via `effective_from`) · `food-log` · `food-suggestions` (pg_trgm over own history) · `internal`.
Body + goal live here (not in a "profile") because new targets are written in the same transaction as weight/goal changes.

## Auth
- **User request:** `Authorization: Bearer <Neon JWT>`; guard from `packages/nest-common` verifies signature via JWKS (`jose`, keys cached in memory); `userId = sub`. JWT lives 15 min. Roles (if ever needed) are stored in our own table: JWT cannot carry custom claims.
- **Service to service (v0.2):** caller gets a Google ID token via `getIdTokenClient` (`aud` = receiver URL). Receiver `ServiceAuthGuard` (`google-auth-library` `verifyIdToken`) checks signature, `aud`, and that caller email is on the allow-list. User JWT is NOT used for these calls; `userId` is passed as a parameter.
- Locally `SERVICE_AUTH=none` (HTTP client sends no ID token). User JWT in dev is real Neon Auth; tests sign their own tokens via `packages/testing`.

## Contracts flow
`packages/contracts` (Zod: `public/`, `internal/`, `events/`, versioned) -> each service generates and commits `openapi.json` -> `oasdiff breaking` vs `main` in CI -> `packages/api-client` (openapi-typescript + openapi-fetch) for internal calls only.

## Key flows
- **Record workout (<= 5 s per set):** whole workout lives in the client draft (Zustand persist). One GET for "last time" hints (exercise ids in query). On finish: ONE `POST /api/workouts` with the aggregate (workout, exercises, sets), client-generated UUIDv7, single transaction.
- **AI (v0.2 only):** AI reads user context via `/internal/users/:id/training-summary` and `/nutrition-summary` (aggregates, no name/email, age instead of birth date). AI proposes, the data owner writes (food parse returns a draft; user confirms).

## Layout
```
apps/core-service|nutrition-service/
  src/modules/<module>/  src/db/schema/  src/db/migrations/  src/migrate.ts  src/main.ts
  seeds/  test/  drizzle.config.ts  Dockerfile  openapi.json  .env.example
packages/contracts  api-client  domain  nest-common  testing  config
infra/cloudbuild/service.yaml  infra/gcp/  infra/local/postgres-init/
docs/architecture (Mermaid)  docs/adr  docs/runbooks
.github/workflows/ci.yml  .github/dependabot.yml
docker-compose.yml  pnpm-workspace.yaml
```
`nest-common` = guards (UserJwt, ServiceAuth), CurrentUser, logger, health, env, errors, HTTP client, DB pool. Not published; consumed via workspace.
`docs/` holds committed architecture docs and ADRs (`0001-schema-per-service` ...); the private spec is NOT in `docs/`, it is in git-ignored `specs/`.

## Dependency rules (enforced in CI via dependency-cruiser or `no-restricted-imports`)
- `apps/*` never import each other.
- web never imports backend.
- A service never imports another service's DB schema (it is not in shared packages).
- `domain` imports nothing.

## Deliberately absent
gateway/BFF, auth-service, users/profile-service, exercises-service, notifications-service, `packages/database`. Do not add them.
