#!/bin/sh
# Local Postgres: same schemas and roles as prod. Runs once, on an empty data volume
# (docker-entrypoint-initdb.d). To re-run: `docker compose down -v && docker compose up -d db`.
set -eu

CORE_PASSWORD=core_svc_local psql -v ON_ERROR_STOP=1 \
  --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  -f /infra/db/core.sql
