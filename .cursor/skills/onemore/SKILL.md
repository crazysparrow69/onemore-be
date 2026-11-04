---
name: onemore
description: Core rules for the onemore backend (NestJS + Drizzle + Neon + Cloud Run, pnpm monorepo, workout and nutrition tracker). Use for EVERY request in this repository - planning, coding, review, debugging, infra, tests, migrations, questions. Defines the stack, hard rules, scope, and the planner/implementer workflow.
---

# onemore backend

Backend monorepo of a workout + nutrition tracker. Pet project, budget $0-2/month, goal: learn real-world practices.
The web app is a SEPARATE repo (React + Vite, Vercel). Never add frontend code here.

Chat language: Russian. Code, comments, identifiers, commit messages, docs: English.

## 0. Which role are you in?

- **Planner** (Plan mode, or the user asks to plan / design / analyze / review): follow section 6.
- **Implementer** (the user says "implement", gives a plan, or asks for a code change): follow section 7.
- Unclear -> if the task touches more than ~3 files or any hard rule from section 3, act as Planner first and ask the user to confirm.

## 1. Stack (decided, do not re-debate)

| Area | Choice |
|---|---|
| Runtime | Node 24 LTS, TypeScript strict, pnpm workspaces (no Turborepo, no Nx, no Nest CLI monorepo mode) |
| Framework | NestJS, one standalone Nest project per service; `nestjs-pino` JSON logs |
| DB | Neon Postgres, ONE database, schema + role per service. Driver `pg` via pooled string, pool 2-5 |
| ORM | Drizzle (`pgSchema('core')`, SQL migrations editable by hand). NOT Prisma |
| Validation / contracts | Zod only: `nestjs-zod` for bodies, env, AI output. Zod -> OpenAPI -> `oasdiff` in CI. NOT class-validator, NOT Joi |
| Auth | Neon Auth JWT, verified via JWKS with `jose`; `userId` = `sub` |
| Service-to-service | REST + Google ID token (`ServiceAuthGuard`). No gRPC, no TCP transport, no Redis/BullMQ, no gateway |
| Tests | Vitest (+ `unplugin-swc`), Testcontainers (Postgres, same major as Neon), Supertest |
| Lint | ESLint flat config + type-aware typescript-eslint (`no-floating-promises` on), Prettier |
| Hosting | Cloud Run `europe-west1`, Cloud Build on push to `main`, GitHub Actions on PR |

Do NOT add a dependency that is not in this table or the plan. If one seems necessary, stop and ask.

## 2. Services and scope

- `core-service` (schema `core`, exists): accounts, exercises, templates, schedule, sessions (workouts, sets), `internal`. Today it only serves `GET /health`.
- `nutrition-service` (schema `nutrition`): body, goals, weight, targets (Mifflin-St Jeor), food-log, food-suggestions, `internal`.
- `ai-service`: **v0.2, do not create or reference it in MVP code.**
- MVP = v0.1 = auth, exercises, workouts + calendar, nutrition diary. NOT in MVP: AI, charts, product database, barcode, social, mobile, GDPR export, Pub/Sub, Cloudinary. Do not build or scaffold these.

Details: [reference/architecture.md](reference/architecture.md). Scope, roadmap, open questions: [reference/scope-and-status.md](reference/scope-and-status.md).

## 3. Hard rules (violating any of these is a bug)

**Security / data**
1. Every repository query filters by owner `userId`; reads go through `AccessPolicy.canRead(viewer, owner, resource)`. `userId` comes only from the verified JWT, never from body, query, or params.
2. All services are public, so every route needs `UserJwtGuard`; `/internal/*` needs `ServiceAuthGuard`. Guards must have tests: no token -> 401, wrong account -> 403, wrong `aud` -> 403.
3. Never log tokens, passwords, connection strings, or diary/food contents (pino `redact`).
4. No secrets at image build time (no ARG/ENV). Secrets only from Secret Manager at runtime; locally `.env` (git-ignored) + committed `.env.example`.

**Boundaries**
5. A service never reads another service's tables. No cross-schema FK or JOIN. `user_id` is a plain indexed column without FK to `neon_auth`.
6. `apps/*` never import each other. No shared DB package. `domain` depends on nothing.
7. In MVP, core and nutrition do not call each other.
8. Address tables explicitly via `pgSchema(...)`; never rely on `search_path` (the pooler does not keep it).

**Database / migrations**
9. Migrations are backward compatible (expand -> contract). No down migrations. Contract step (drop/rename) is a separate PR after a successful deploy of expand. Never run migrations at service startup.
10. Weights stored in kg `numeric(7,3)`, lengths in cm, time in seconds, distance in meters; units are converted only on display.
11. Every day-scoped record stores `local_date` (user time zone) plus a UTC timestamp.
12. Sets use typed nullable columns (`weight_kg`, `reps`, `duration_s`, `distance_m`) + CHECK by exercise type. No JSONB for sets.
13. Template, plan, fact are three separate entities; a workout copies exercises from a template, never references the live template.
14. Exercises are never physically deleted (`archived_at`). Client generates ids (UUIDv7) so POST retries are idempotent.

**Runtime / cost** (these resources cost money just by existing)
15. Cloud Run flags always: `--region=europe-west1 --min-instances=0 --max-instances=<2-5> --cpu=1 --memory=512Mi --cpu-boost`, own service account per service. NEVER: `min-instances>=1`, `--no-cpu-throttling`, VPC connector, Cloud SQL, Load Balancer, GKE, Memorystore, Tier 2 regions.
16. No work after the response is sent (CPU is throttled). Async work only via Pub/Sub push (v0.2).
17. `GET /health` must not touch the DB (keeps Neon asleep) and returns `version` (git SHA). `GET /health/ready` may run `SELECT 1`; never call it on a schedule.
18. `GET` requests: parameters only in the query string, never a body.
19. Run `node dist/main.js` directly (not `pnpm start`) and call `enableShutdownHooks()`. Dockerfile: multi-stage, `pnpm deploy --filter <svc> --prod`, `USER node`.

**API**
20. Public API changes only backward compatibly. Deploy order: service first, then web. `openapi.json` is generated from Zod and committed.

Rule details and rationale: [reference/data-and-db.md](reference/data-and-db.md), [reference/delivery.md](reference/delivery.md).

## 4. Conventions

- Layers: `controller -> service -> repository`. One repository per entity (no generic `AbstractRepository`). Controllers contain no business logic and no DB calls.
- Env of every service is validated at startup by a Zod schema via `ConfigModule.forRoot({ isGlobal: true, validate })` (`@nestjs/config`). Every variable is required: NO `.default()` in env schemas, startup must fail on a missing or invalid value. Keys must match `.env.example`. Read config through `ConfigService`, never `process.env`.
- Drizzle `schemaFilter` excludes `neon_auth`; own migrations table per schema (`migrationsSchema`).
- Pure business logic (Mifflin-St Jeor, 1RM, unit conversion) lives in `packages/domain`, no framework imports, unit-tested.
- Error responses: one shared error shape from `packages/nest-common`.
- Keep files small and focused. Match the style of neighbouring code. No unrelated refactors.

## 5. Looking things up in the spec

The full spec is private and git-ignored: `specs/onemore-spec.md` (~1760 lines, Russian). **Never read it whole.**
Search is hidden from the Grep tool by `.gitignore`, so use the shell with `--no-ignore`:

```bash
rg --no-ignore -n "pnpm deploy" specs/onemore-spec.md
rg --no-ignore -n "^#{1,3} " specs/onemore-spec.md      # outline
```

Then `Read` with `offset`/`limit`. Section map is in [reference/scope-and-status.md](reference/scope-and-status.md).
Rule of thumb: this skill and its references are the distilled truth; open the spec only for a detail they lack. Later stages override earlier ones (5, 6 > 4 > 1, 3).
Items marked 🟡 ОТКРЫТО / 🧪 ТЕСТ in the spec are NOT decided: do not implement them as fact, ask.

## 6. Planner workflow

1. Restate the goal in 1-2 sentences and name the roadmap phase (reference/scope-and-status.md).
2. Read only the relevant spec sections and the existing code. Do not guess file contents.
3. Check the plan against section 3. If a requirement conflicts with a hard rule or with MVP scope, say so and propose an alternative instead of silently bending the rule.
4. Write the plan so a weaker model can execute it without design decisions. Save it to `.planning/<slug>.md` (git-ignored) so the implementer chat can read it, using this template:

```markdown
# <title>
Phase: <n> · Spec refs: <headings>
## Goal
## Out of scope (do NOT touch)
## Decisions already made (do not revisit)
## Steps (ordered, each = one small verifiable change)
1. <exact file path> - <what to add/change> - signatures/types/SQL if non-trivial
## Tests to write (names + what each asserts)
## Verify (exact commands that must pass)
## Risks / open questions for the user
```

5. Be concrete: exact paths, function signatures, table DDL, endpoint paths, status codes. Do not write full implementations, write contracts.
6. Stop after the plan. Do not implement unless asked.

## 7. Implementer workflow

1. If a plan exists (`.planning/*.md` or in chat), read it first and follow it literally. Scope = the files and steps in the plan.
2. If the plan is ambiguous, wrong, or conflicts with section 3: STOP and report. Do not improvise a design and do not weaken a hard rule.
3. Work in small steps. After each step run the narrowest check (typecheck / the relevant test). Fix before moving on.
4. Write the tests listed in the plan together with the code, not after. Guards, repositories (owner filter), migrations and domain formulas always get tests.
5. Never add dependencies, files, endpoints, or abstractions that the plan does not mention. No drive-by refactors.
6. Before saying "done": run the plan's Verify commands and report their real result. Root commands: `pnpm lint`, `pnpm format:check`, `pnpm typecheck`, `pnpm test`, `pnpm test:e2e`, `pnpm build`. Never claim success without running them.
7. Do not commit, push, or touch `specs/` or `.planning/` unless the user asks.
8. Final message: what changed (file list), what was verified (commands + result), anything deviating from the plan or left open. Keep it short.
