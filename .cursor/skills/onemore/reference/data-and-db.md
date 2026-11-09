# Data and database reference

Read when touching schema, migrations, repositories, Drizzle, local Postgres, seeds.

## Topology
- One Neon project, one database, **schema + role per service** (`core_svc` owns `core`, `nutrition_svc` owns `nutrition`; no rights on other schemas). Isolation is enforced by Postgres, not by code discipline.
- No cross-schema FK/JOIN. `user_id` = JWT `sub`, indexed, no FK to `neon_auth.user` (that schema does not exist locally).
- Pooled connection string at runtime (pool 2-5). Migrations use the DIRECT connection: derive it by removing `-pooler` from the pooled host (Neon convention, no extra secret).
- Locally: Docker Postgres, same major version as Neon. `infra/local/postgres-init/` creates the same schemas and roles as prod; Testcontainers uses the same SQL.
- Free-tier limits: 1 GB storage, 100 CU-hours/month. Never store images/files in the DB. Never add background pings or schedules that wake the DB.

## Drizzle
- `schemaFilter: ['public']`-style filtering so `neon_auth` is never managed; own `migrationsSchema` per service schema.
- `drizzle-kit generate` produces SQL; hand-edit when needed. `drizzle-kit` is dev-only and must not be in the prod image; prod migrations run via `migrate()` from `drizzle-orm` in `src/migrate.ts`.
- CI check: migrations apply to a clean DB; `drizzle-kit generate` produces no new files.
- Migration runner: `lock_timeout='5s'`, `statement_timeout='60s'`, `pg_advisory_lock`. Large-table indexes: `CREATE INDEX CONCURRENTLY` in a separate migration.
- Expand -> contract. Contract (drop column/table) in a separate PR after one successful deploy. Rollback never touches the DB; fix forward.

## Tables (MVP)
- **core:** `users` (id = Neon `sub`, unique email, role `user|admin` default `user`, language, time zone). `accounts` from migration `0000` is unused and is dropped in a later contract migration, not in the same change that created `users`. · `training_profiles` · `exercises` (owner_id, visibility private|link|public, type, primary/secondary muscles, `source`+`source_id` for idempotent import, `archived_at`) · `exercise_translations` · `templates`, `template_exercises` · `schedule_rules`, `planned_workouts` · `workout_sessions`, `session_exercises`, `sets`.
- **nutrition:** `body_profiles` · `goals`, `target_snapshots` (`effective_from`) · `weight_entries` · `food_entries` · `user_foods` (autosuggest history, `pg_trgm` index).
- **ai (v0.2):** `ai_jobs`, `ai_reviews`, `ai_usage`. Do not create yet.

## Modeling decisions (already fixed)
- Template / plan / fact are separate. Workout copies template exercises.
- Exercise types determine set shape: weight x reps, bodyweight x reps, time, distance+time. Typed nullable columns + CHECK per type (so records and 1RM are window-function queries).
- Metric storage, convert on display; `weight_kg numeric(7,3)` (3 decimals so 45 lb round-trips to 45).
- `local_date` + UTC timestamp on every daily record.
- Targets are history: past days show the target that was effective then.
- Weight and measurements are dated history, never profile fields.
- Visibility/owner on programs and exercises from day one; coach access (v0.4) must not require rewriting queries -> always via repository + `AccessPolicy.canRead`.
- Exercise seed: free-exercise-db (~800, public domain), upsert by `source_id`, re-running creates no duplicates. Images go to the web repo `public/exercises/` as WebP, NOT served from Cloud Run. wger code is AGPL: never copy it; its data is CC and needs per-record attribution.

## Repository pattern
One repository per entity. Every method takes `userId` (owner) and filters by it. No generic base repository. Integration tests (Testcontainers) must prove user A cannot read or modify user B's rows.

## Mifflin-St Jeor targets (in `packages/domain`)
Pure functions, no I/O. Inputs: sex, age, height, weight, activity, goal, weekly rate. Output kcal + macros, never below a safe minimum floor. Cover with table-driven unit tests.
