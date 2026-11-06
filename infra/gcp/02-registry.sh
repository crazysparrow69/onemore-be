#!/usr/bin/env bash
# Artifact Registry repository with a cleanup policy (free tier is 0.5 GB). Safe to re-run.
set -euo pipefail
source "$(dirname "$0")/common.sh"

gcloud artifacts repositories describe "${REPO}" --location="${REGION}" >/dev/null 2>&1 \
  || gcloud artifacts repositories create "${REPO}" \
    --repository-format=docker --location="${REGION}" \
    --description="onemore service images"

# A keep policy alone deletes nothing: the delete policy is required.
POLICY=$(mktemp)
cat > "${POLICY}" <<'EOF'
[
  {"name":"delete-old","action":{"type":"Delete"},"condition":{"tagState":"any","olderThan":"1d"}},
  {"name":"keep-3","action":{"type":"Keep"},"mostRecentVersions":{"keepCount":3}}
]
EOF
gcloud artifacts repositories set-cleanup-policies "${REPO}" \
  --location="${REGION}" --policy="${POLICY}" --no-dry-run
rm -f "${POLICY}"
