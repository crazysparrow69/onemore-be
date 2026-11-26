# onemore-be

Backend for a workout and nutrition tracker. pnpm workspace, NestJS services on Cloud Run.

The web app lives in a separate repository.

## Requirements

- Node.js 24 (see `.nvmrc`)
- pnpm 10.26.2 (`packageManager` in the root `package.json`)

## Commands

Run from the repository root:

```bash
pnpm install
pnpm dev            # core-service with reload; needs apps/core-service/.env (see Configuration)
pnpm lint
pnpm format:check
pnpm typecheck
pnpm test
pnpm test:e2e
pnpm build
pnpm openapi:generate   # rewrite apps/core-service/openapi.json from the Zod schemas
```

Production-shaped start, after `pnpm build`:

```bash
NODE_ENV=production node apps/core-service/dist/main.js
```

`GET /health` returns `{ "status": "ok", "version": "<APP_VERSION>" }` and does not touch a database.
`GET /health/ready` does the same after a `SELECT 1`, and answers 503 if the database is unreachable. It wakes Neon, so use it by hand or in smoke checks, never on a schedule.

## Exercise catalog

The system exercises come from a snapshot of [free-exercise-db](https://github.com/yuhonas/free-exercise-db) (commit `f00c92c`) in `apps/core-service/src/seeds/exercises/`:

- `free-exercise-db.json`: the upstream `dist/exercises.json`, unchanged
- `overrides.json`: our corrections by source id (`type`, `equipment`, `primaryMuscles`, `secondaryMuscles`, `skip`)

`pnpm migrate` builds the service and applies the pending migrations from `apps/core-service/src/db/migrations` to the database in `DATABASE_URL` (environment or `apps/core-service/.env`). It is the same script as the Cloud Build migrate step, never runs at service startup, and is safe to repeat.

`pnpm seed` builds the service and writes the catalog into `core.exercises` and `core.exercise_translations`. It reads `DATABASE_URL` from the environment or `apps/core-service/.env`, needs the migrations applied first, and runs in one transaction. Rows are upserted by `(source, source_id)` and only changed rows are written, so running it again creates no duplicates. Exercises removed from the seed are left as they are. It is not part of the deploy: run it by hand against the target database after the data changes, for example `DATABASE_URL=... node apps/core-service/dist/seed.js` after `pnpm build`.

The photos live in the web repository (`public/exercises/<source_id in lowercase>/<n>.webp`); the database stores only their keys.

## Git hooks

`pnpm install` turns the hooks on (husky). They run locally; CI still runs the same checks plus the image build.

- **pre-commit**: ESLint `--fix` and Prettier on staged `*.ts` in `apps/core-service`, then `pnpm typecheck`
- **commit-msg**: [Conventional Commits](https://www.conventionalcommits.org/), for example `feat(core-service): add health check`
- **pre-push**: `pnpm lint`, `pnpm format:check`, `pnpm typecheck`, `pnpm test`, `pnpm test:e2e`

`git commit --no-verify` and `git push --no-verify` skip the hooks. Use that only on purpose.

## Docker

Everyday work is the database in Compose and the service on the host:

```bash
docker compose up -d db
pnpm dev
```

Everything in containers (service runs with hot reload):

```bash
docker compose --profile full up --build
```

Production image (no secrets baked in; pass `APP_VERSION` at run time):

```bash
docker build -f apps/core-service/Dockerfile --target runtime -t onemore/core-service:local .
```

The production image uses `pnpm deploy --legacy` because pnpm 10 refuses to deploy a workspace package otherwise. When `packages/*` appear, set `inject-workspace-packages=true` and drop `--legacy`.

## Layout

```
apps/core-service   account, exercises, workouts, templates
packages/*          shared packages (added later)
```

## CI

[`.github/workflows/ci.yml`](.github/workflows/ci.yml) runs on every push to any branch and on every pull request to `main` (a PR from a branch of this repo gets both runs):

- `lint`: ESLint and Prettier
- `typecheck`: `tsc --noEmit`
- `test`: unit and e2e (Vitest)
- `contracts`: `openapi.json` is up to date, and `oasdiff breaking` finds no breaking API change against `main`
- `image`: builds the production image and smoke-tests `GET /health`
- `ci-ok`: aggregates the jobs above; this is the only check the `main` ruleset should require

All jobs run on every PR (no path filters), because a required check that never runs blocks the merge. Filtering by changed packages comes back when there is more than one service.

## API contract

`apps/core-service/openapi.json` describes the HTTP API and is generated from the Zod schemas (`nestjs-zod` + `@nestjs/swagger`). It is committed; the web repository copies types from it by hand for now.

- Changed a schema, a controller or a route? Run `pnpm openapi:generate` and commit `openapi.json` in the same commit. The `contracts` CI job (and `pnpm test:e2e`) fails on a stale file.
- Response bodies are Zod schemas too (`@ZodResponse` on the handler). The response is parsed by the schema, so a field that is not in it never reaches the client.
- Error responses use one body, `ErrorResponse`; declare them with `@ApiErrorResponses(...)`.
- The `contracts` job runs `oasdiff breaking` against `main` and fails on a breaking change (removed route or field, a new required field, a narrower type). Prefer a backward compatible change; the deploy order is service first, then web.
- A deliberate breaking change: copy the line the job prints into `apps/core-service/openapi-breaking-ignore.txt` in the same pull request, and remove it in the next one. The file is empty by default.
- Locally, `pnpm dev` serves Swagger UI at `/api/docs` (not in production).

## Configuration

Every variable in `apps/core-service/.env.example` is required and has no default. The service validates them with Zod at startup and exits with `Invalid environment: ...` if any is missing or invalid.

- Local `pnpm dev`: `cp apps/core-service/.env.example apps/core-service/.env`. `@nestjs/config` loads that file; real environment variables take precedence over it.
- Docker Compose sets its own values and does not read `.env`.
- `DATABASE_URL` is the pooled connection string of the `core_svc` role. Locally it is the Compose database (`docker compose up -d db`, the role and schema come from `infra/db/core.sql`). To re-run the init scripts: `docker compose down -v && docker compose up -d db`.
- Deploys (Cloud Run) must provide every variable, including `APP_VERSION`.
