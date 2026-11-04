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
```

Production-shaped start, after `pnpm build`:

```bash
NODE_ENV=production node apps/core-service/dist/main.js
```

`GET /health` returns `{ "status": "ok", "version": "<APP_VERSION>" }` and does not touch a database.

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
apps/core-service   account, exercises, workouts
packages/*          shared packages (added later)
```

## CI

[`.github/workflows/ci.yml`](.github/workflows/ci.yml) runs on every pull request to `main`:

- `lint`: ESLint and Prettier
- `typecheck`: `tsc --noEmit`
- `test`: unit and e2e (Vitest)
- `image`: builds the production image and smoke-tests `GET /health`
- `ci-ok`: aggregates the jobs above; this is the only check the `main` ruleset should require

All jobs run on every PR (no path filters), because a required check that never runs blocks the merge. Filtering by changed packages comes back when there is more than one service.

## Configuration

Every variable in `apps/core-service/.env.example` is required and has no default. The service validates them with Zod at startup and exits with `Invalid environment: ...` if any is missing or invalid.

- Local `pnpm dev`: `cp apps/core-service/.env.example apps/core-service/.env`. `@nestjs/config` loads that file; real environment variables take precedence over it.
- Docker Compose sets its own values and does not read `.env`.
- Deploys (Cloud Run) must provide every variable, including `APP_VERSION`.

Real secrets stay out of git.
