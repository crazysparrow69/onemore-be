-- Schema `nutrition` and its owner role `nutrition_svc`. Idempotent: safe to re-run.
-- The same file is used for local Postgres, Testcontainers and Neon.
--
-- Run as an administrator role with psql. The password comes from the
-- NUTRITION_PASSWORD environment variable (never from the command line, never from git):
--   NUTRITION_PASSWORD=... psql "$ADMIN_URL" -v ON_ERROR_STOP=1 -f infra/db/nutrition.sql

\getenv nutrition_password NUTRITION_PASSWORD
\if :{?nutrition_password}
\else
  \echo 'NUTRITION_PASSWORD is not set'
  \quit 1
\endif

-- Role: can log in, nothing else.
SELECT format(
  'CREATE ROLE nutrition_svc LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD %L',
  :'nutrition_password'
)
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'nutrition_svc') \gexec

-- Only the password is changed on re-runs: on Neon the admin role is not a superuser,
-- and Postgres forbids it to touch SUPERUSER even as NOSUPERUSER. The attributes above
-- are fixed by CREATE ROLE and checked by verify-nutrition.sql.
ALTER ROLE nutrition_svc WITH PASSWORD :'nutrition_password';

-- PostgreSQL 16+: the creator of a role may administer it but not SET ROLE to it,
-- and creating a schema for another owner needs SET. Grant it to the admin.
GRANT nutrition_svc TO CURRENT_USER WITH SET TRUE;

-- Schema owned by the role. Drizzle keeps its migrations table here too (migrationsSchema).
CREATE SCHEMA IF NOT EXISTS nutrition AUTHORIZATION nutrition_svc;
ALTER SCHEMA nutrition OWNER TO nutrition_svc;

-- The role may connect, but cannot create objects in `public`.
SELECT format('GRANT CONNECT ON DATABASE %I TO nutrition_svc', current_database()) \gexec
SELECT format('GRANT CREATE ON DATABASE %I TO nutrition_svc', current_database()) \gexec
REVOKE ALL ON SCHEMA public FROM PUBLIC;
