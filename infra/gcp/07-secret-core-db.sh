#!/usr/bin/env bash
# Store the core_svc pooled connection string in Secret Manager; only sa-core may read it.
# Input: infra/gcp/.env.neon-core (made by 06-neon-core.sh). Nothing secret is printed.
# Free tier = 6 active versions: when rotating, DESTROY the old version
#   (gcloud secrets versions destroy <N> --secret=core-database-url).
set -euo pipefail
source "$(dirname "$0")/common.sh"

SECRET="core-database-url"
set -a; source "$(dirname "$0")/.env.neon-core"; set +a

gcloud secrets describe "${SECRET}" >/dev/null 2>&1 \
  || gcloud secrets create "${SECRET}" --replication-policy=user-managed --locations="${REGION}"

printf '%s' "${CORE_DATABASE_URL}" | gcloud secrets versions add "${SECRET}" --data-file=-

gcloud secrets add-iam-policy-binding "${SECRET}" \
  --member="serviceAccount:${SA_CORE}" --role=roles/secretmanager.secretAccessor >/dev/null
# The migrate step in Cloud Build reads the same secret. Runtime stays on sa-core.
gcloud secrets add-iam-policy-binding "${SECRET}" \
  --member="serviceAccount:${SA_BUILD}" --role=roles/secretmanager.secretAccessor >/dev/null
