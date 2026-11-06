-- Isolation check for `core_svc`. Run AS core_svc (not as admin):
--   psql "$CORE_URL" -v ON_ERROR_STOP=1 -f infra/db/verify-core.sql
-- Fails (non-zero exit) if any expectation is broken. Changes nothing (ROLLBACK).

BEGIN;

DO $$
DECLARE
  s record;
BEGIN
  IF current_user <> 'core_svc' THEN
    RAISE EXCEPTION 'run this as core_svc, not as %', current_user;
  END IF;

  IF (SELECT rolsuper OR rolcreatedb OR rolcreaterole FROM pg_roles WHERE rolname = current_user) THEN
    RAISE EXCEPTION 'core_svc must not be superuser / createdb / createrole';
  END IF;

  IF (SELECT nspowner::regrole::text FROM pg_namespace WHERE nspname = 'core') <> 'core_svc' THEN
    RAISE EXCEPTION 'schema core must be owned by core_svc';
  END IF;

  -- No CREATE on any schema except core (public, other services, neon_auth, ...).
  FOR s IN
    SELECT nspname FROM pg_namespace
    WHERE nspname <> 'core' AND nspname NOT LIKE 'pg\_%' AND nspname <> 'information_schema'
  LOOP
    IF has_schema_privilege(current_user, s.nspname, 'CREATE') THEN
      RAISE EXCEPTION 'core_svc must not have CREATE on schema %', s.nspname;
    END IF;
  END LOOP;
END $$;

-- Positive: can create and use a table in core.
CREATE TABLE core.verify_probe (id integer PRIMARY KEY);
INSERT INTO core.verify_probe VALUES (1);

-- Negative: creating in public must fail.
DO $$
BEGIN
  BEGIN
    EXECUTE 'CREATE TABLE public.verify_probe (id integer)';
    RAISE EXCEPTION 'creating a table in public must be denied';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL; -- expected
  END;
END $$;

ROLLBACK;
\echo 'core_svc isolation: OK'
