#!/usr/bin/env bash
# Store the Cloudinary API secret in Secret Manager; only sa-core may read it.
# Input: CLOUDINARY_API_SECRET in the environment (never passed as an argument, never printed).
# Free tier = 6 active versions: when rotating, DESTROY the old version
#   (gcloud secrets versions destroy <N> --secret=cloudinary-api-secret).
set -euo pipefail
source "$(dirname "$0")/common.sh"

SECRET="cloudinary-api-secret"
: "${CLOUDINARY_API_SECRET:?CLOUDINARY_API_SECRET}"

gcloud secrets describe "${SECRET}" >/dev/null 2>&1 \
  || gcloud secrets create "${SECRET}" --replication-policy=user-managed --locations="${REGION}"

printf '%s' "${CLOUDINARY_API_SECRET}" | gcloud secrets versions add "${SECRET}" --data-file=-

gcloud secrets add-iam-policy-binding "${SECRET}" \
  --member="serviceAccount:${SA_CORE}" --role=roles/secretmanager.secretAccessor >/dev/null
