#!/usr/bin/env bash
# Create/refresh schema `core` and role `core_svc` in Neon, then verify isolation.
#
# Input (git-ignored, created by hand): infra/gcp/.env.neon-admin
#   NEON_ADMIN_URL='postgresql://neondb_owner:...@ep-xxx.eu-central-1.aws.neon.tech/neondb?sslmode=require'
# Output (git-ignored, chmod 600): infra/gcp/.env.neon-core
#   CORE_DATABASE_URL         pooled string, for the service at runtime
#   CORE_DATABASE_URL_DIRECT  direct string, for migrations
#
# Nothing secret is printed. Re-running keeps the existing core_svc password.
# psql runs from the same Docker image as the local database (same major version).
set -euo pipefail

DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "${DIR}/../.." && pwd)"
ADMIN_FILE="${DIR}/.env.neon-admin"
CORE_FILE="${DIR}/.env.neon-core"
PG_IMAGE="postgres:18-alpine"

[ -f "${ADMIN_FILE}" ] || { echo "Missing ${ADMIN_FILE}" >&2; exit 1; }
# shellcheck disable=SC1090
source "${ADMIN_FILE}"
: "${NEON_ADMIN_URL:?NEON_ADMIN_URL is empty}"

if [ -f "${CORE_FILE}" ]; then
  CORE_PASSWORD="$(python3 - "${CORE_FILE}" <<'PY'
import re, sys, urllib.parse as u
m = re.search(r"^CORE_DATABASE_URL='([^']+)'", open(sys.argv[1]).read(), re.M)
print(u.unquote(u.urlparse(m.group(1)).password))
PY
)"
fi
CORE_PASSWORD="${CORE_PASSWORD:-$(openssl rand -hex 24)}"
export CORE_PASSWORD

# Split the URL into libpq variables so no password appears in a command line.
eval "$(NEON_ADMIN_URL="${NEON_ADMIN_URL}" python3 - <<'PY'
import os, shlex, urllib.parse as u
p = u.urlparse(os.environ["NEON_ADMIN_URL"])
q = dict(u.parse_qsl(p.query))
env = {
  "ADM_HOST": p.hostname, "ADM_PORT": str(p.port or 5432),
  "ADM_USER": u.unquote(p.username), "ADM_PASS": u.unquote(p.password),
  "ADM_DB": p.path.lstrip("/"), "ADM_SSL": q.get("sslmode", "require"),
}
for k, v in env.items():
    print(f"{k}={shlex.quote(v)}")
PY
)"

# Always talk to Neon through the direct host (no "-pooler"): DDL and role changes.
DIRECT_HOST="${ADM_HOST/-pooler/}"
POOLED_HOST="${DIRECT_HOST/./-pooler.}"

psql_docker() {
  # $1 = user, $2 = password; remaining args go to psql
  local user="$1" pass="$2"; shift 2
  PGHOST="${DIRECT_HOST}" PGPORT="${ADM_PORT}" PGUSER="${user}" PGPASSWORD="${pass}" \
  PGDATABASE="${ADM_DB}" PGSSLMODE="${ADM_SSL}" CORE_PASSWORD="${CORE_PASSWORD}" \
  docker run --rm -i \
    -e PGHOST -e PGPORT -e PGUSER -e PGPASSWORD -e PGDATABASE -e PGSSLMODE -e CORE_PASSWORD \
    -v "${ROOT}/infra/db:/infra/db:ro" "${PG_IMAGE}" psql -v ON_ERROR_STOP=1 "$@"
}

echo "1/3 server version:"
psql_docker "${ADM_USER}" "${ADM_PASS}" -Atc "select version()" | cut -c1-40

echo "2/3 applying core.sql as ${ADM_USER}"
psql_docker "${ADM_USER}" "${ADM_PASS}" -q -f /infra/db/core.sql

echo "3/3 verifying isolation as core_svc"
psql_docker core_svc "${CORE_PASSWORD}" -q -f /infra/db/verify-core.sql

ENC_PASS="$(python3 -c 'import os,urllib.parse as u;print(u.quote(os.environ["CORE_PASSWORD"],safe=""))')"
umask 077
cat > "${CORE_FILE}" <<EOF
CORE_DATABASE_URL='postgresql://core_svc:${ENC_PASS}@${POOLED_HOST}:${ADM_PORT}/${ADM_DB}?sslmode=${ADM_SSL}'
CORE_DATABASE_URL_DIRECT='postgresql://core_svc:${ENC_PASS}@${DIRECT_HOST}:${ADM_PORT}/${ADM_DB}?sslmode=${ADM_SSL}'
EOF
echo "OK. Connection strings saved to infra/gcp/.env.neon-core (git-ignored, mode 600)."
