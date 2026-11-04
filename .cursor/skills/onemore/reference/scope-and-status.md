# Scope, roadmap, status, spec map

Read when planning a task, deciding if something is in scope, or locating a spec section.

## Product
Diary of workouts and nutrition for gym-goers; AI (later) sees both and suggests changes. Users: me and friends first. Mobile-first web, installable PWA. 10-20 h/week, ~3 months to MVP.
MVP is done when: I log all workouts+nutrition for 4 weeks; >= 3 friends use it weekly; logging one set takes <= 5 s.

## MVP (v0.1) modules
- **Account/profile:** email + Google (Neon Auth), onboarding (sex, birth date, height, activity, experience, equipment, limitations, goal + rate), kg/lb, weight log with dates.
- **Exercises:** shared base from free-exercise-db; private exercises (name, description, type, primary/secondary muscles); types: weight x reps, bodyweight x reps, time, distance+time.
- **Workouts/calendar:** log from scratch or template; sets/weight/reps/comments; "last time" hint; rest timer (web); templates + weekly schedule; month calendar plan vs fact; draft kept locally (web).
- **Nutrition:** daily kcal/macros target (Mifflin-St Jeor + goal, safe floor); entries (name, amount, kcal, macros, meal); remaining for the day; autosuggest from own history. NO food database in MVP: manual entry only.

## Roadmap
v0.1 MVP -> v0.2 charts (est. 1RM, records, sets/muscle/week, weight trend) + weekly AI review + AI food-from-text; extract contracts into npm package; ai-service, Pub/Sub, Scheduler -> v0.3 AI coach (program generator, function-calling chat, food photo, Open Food Facts, Cloudinary) -> v0.4 friends/feed/coach read access -> v1.0 GDPR (consent, export, delete via `account.deleted` event), offline, i18n, landing, adaptive TDEE, CSV import. Later: React Native, trainer marketplace + billing-service.

## Not in MVP (do not build or scaffold)
AI, progress charts, food DB / barcode / photo recognition, social, trainers, mobile app, wearables/Apple Health, public custom exercises (needs moderation), Kubernetes.

## Open / undecided (ask the user, do not assume)
AI model and provider test; analytics (PostHog EU limits unchecked); Vercel Hobby is non-commercial only (paid trainer plans would need Pro or other hosting); Cloudinary stores in US (revisit before v1.0); Open Food Facts usage; cold start numbers (target <= 3 s Nest, <= 4 s with Neon wake) are still to be measured; `pnpm deploy` with workspace packages in Docker is still to be verified; Neon Free roles/schemas still to be verified. Spec tests marked ☐ are not done yet.

## Spec supersessions (spec is multi-stage; newest wins)
- Validation: stage 3 said class-validator + Joi; stage 4 decided Zod everywhere.
- Frontend hosting: stage 1 "undecided"; stage 4 decided Vercel Hobby.
- Auth between services: no gateway; every service public with its own JWT guard.
- Neon branches: stage 1 mentions them; stage 6 defers them.
- Contracts: no shared packages with web in MVP (duplicate by hand).

## Implementation phases (spec section 7)
1 Skeleton (monorepo, core `/health`, Docker, compose, PR CI, Cloud Build, web rewrites)
2 Safe deploy + DB (revision without traffic, smoke, rollback; Neon schema/role; Drizzle + first migration; first Testcontainers test; cold-start measurement)
3 Web base + auth + account (JWT guard + 401/403/userId tests; Zod contracts + `openapi.json` + CI check; account settings)
4 Exercises (study free-exercise-db; map types/muscles; ER diagram of core; idempotent import; catalog; private exercises)
5 Workouts (record from scratch; single POST; e2e "record workout"; last-time + rest timer; templates)
6 Nutrition (ER diagram; nutrition-service by core's pattern; body/goal/weight; targets + unit tests; diary; autosuggest; full onboarding)
7 Schedule + calendar
8 Launch prep for friends (alerts, uptime, Sentry, runbooks, warm-up, broken-deploy check, billing report)
9 Real-life MVP check
10 v0.2+

## Spec map (find with `rg --no-ignore -n "<text>" specs/onemore-spec.md`, then Read with offset/limit; line numbers approximate)
| Topic | Text to search | ~Line |
|---|---|---|
| Cloud Run, microservices, Neon, auth, AI, logs, CI/CD, costs, forbidden | `Бэкенд: Cloud Run` ... `Запрещено` | 215-610 |
| Idea, MVP, roadmap, data-model must-haves, open sources | `MVP: «я и друзья` / `Заложить в модель` | 635-750 |
| Previous project (sleepr) lessons | `Что было полезно` / `Подводные камни` | 947-1000 |
| Tech stack decisions | `Монорепо: pnpm workspaces` / `Сводка решений` | 1010-1190 |
| Architecture (services, auth, flows, data model, layout) | `Сервисы и ответственность` / `Ключевые потоки` | 1192-1500 |
| DevOps plan (Docker, CI, deploy, rollback, secrets) | `Деплой backend: push в main` | 1500-1688 |
| Development plan (phases 1-10) | `Каркас проекта` | 1690-1764 |
