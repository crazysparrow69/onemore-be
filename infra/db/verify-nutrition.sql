-- Isolation check for `nutrition_svc`. Run AS nutrition_svc (not as admin):
--   psql "$NUTRITION_URL" -v ON_ERROR_STOP=1 -f infra/db/verify-nutrition.sql
-- Fails (non-zero exit) if any expectation is broken. Changes nothing (ROLLBACK).

BEGIN;

DO $$
DECLARE
  s record;
BEGIN
  IF current_user <> 'nutrition_svc' THEN
    RAISE EXCEPTION 'run this as nutrition_svc, not as %', current_user;
  END IF;

  IF (SELECT rolsuper OR rolcreatedb OR rolcreaterole FROM pg_roles WHERE rolname = current_user) THEN
    RAISE EXCEPTION 'nutrition_svc must not be superuser / createdb / createrole';
  END IF;

  IF (SELECT nspowner::regrole::text FROM pg_namespace WHERE nspname = 'nutrition') <> 'nutrition_svc' THEN
    RAISE EXCEPTION 'schema nutrition must be owned by nutrition_svc';
  END IF;

  -- No CREATE on any schema except nutrition (public, other services, neon_auth, ...).
  FOR s IN
    SELECT nspname FROM pg_namespace
    WHERE nspname <> 'nutrition' AND nspname NOT LIKE 'pg\_%' AND nspname <> 'information_schema'
  LOOP
    IF has_schema_privilege(current_user, s.nspname, 'CREATE') THEN
      RAISE EXCEPTION 'nutrition_svc must not have CREATE on schema %', s.nspname;
    END IF;
  END LOOP;

  -- No access to the data of other services: the core schema stays closed.
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'core')
     AND has_schema_privilege(current_user, 'core', 'USAGE') THEN
    RAISE EXCEPTION 'nutrition_svc must not have USAGE on schema core';
  END IF;
END $$;

-- Positive: can create and use a table in nutrition.
CREATE TABLE nutrition.verify_probe (id integer PRIMARY KEY);
INSERT INTO nutrition.verify_probe VALUES (1);

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
\echo 'nutrition_svc isolation: OK'
