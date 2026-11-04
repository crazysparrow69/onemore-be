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
pnpm dev            # core-service with reload; reads apps/core-service/.env if present
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

## Layout

```
apps/core-service   account, exercises, workouts
packages/*          shared packages (added later)
```

Copy `apps/core-service/.env.example` to `.env` for local values. Real secrets stay out of git.
