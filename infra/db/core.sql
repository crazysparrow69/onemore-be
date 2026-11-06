-- Schema `core` and its owner role `core_svc`. Idempotent: safe to re-run.
-- The same file is used for local Postgres, Testcontainers and Neon.
--
-- Run as an administrator role with psql. The password comes from the
-- CORE_PASSWORD environment variable (never from the command line, never from git):
--   CORE_PASSWORD=... psql "$ADMIN_URL" -v ON_ERROR_STOP=1 -f infra/db/core.sql

\getenv core_password CORE_PASSWORD
\if :{?core_password}
\else
  \echo 'CORE_PASSWORD is not set'
  \quit 1
\endif

-- Role: can log in, nothing else.
SELECT format(
  'CREATE ROLE core_svc LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD %L',
  :'core_password'
)
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'core_svc') \gexec

ALTER ROLE core_svc WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD :'core_password';

-- Schema owned by the role. Drizzle keeps its migrations table here too (migrationsSchema).
CREATE SCHEMA IF NOT EXISTS core AUTHORIZATION core_svc;
ALTER SCHEMA core OWNER TO core_svc;

-- The role may connect, but cannot create objects in `public`.
SELECT format('GRANT CONNECT ON DATABASE %I TO core_svc', current_database()) \gexec
REVOKE ALL ON SCHEMA public FROM PUBLIC;
