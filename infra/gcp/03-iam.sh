#!/usr/bin/env bash
# Service accounts: one runtime account per service, one for Cloud Build. Safe to re-run.
set -euo pipefail
source "$(dirname "$0")/common.sh"

ensure_sa() {
  gcloud iam service-accounts describe "$1@${PROJECT_ID}.iam.gserviceaccount.com" >/dev/null 2>&1 \
    || gcloud iam service-accounts create "$1" --display-name="$2"
}

ensure_sa sa-core "core-service runtime"
ensure_sa sa-cloudbuild "Cloud Build deployer"
sleep 8 # a new account is not visible to IAM immediately

# Runtime account has no roles for now; it will get only its own DB secret.

# Cloud Build deployer: push images, deploy revisions, write logs,
# and act as the runtime account (required to deploy a service that runs as it).
gcloud artifacts repositories add-iam-policy-binding "${REPO}" --location="${REGION}" \
  --member="serviceAccount:${SA_BUILD}" --role=roles/artifactregistry.writer --condition=None >/dev/null
gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
  --member="serviceAccount:${SA_BUILD}" --role=roles/run.developer --condition=None >/dev/null
gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
  --member="serviceAccount:${SA_BUILD}" --role=roles/logging.logWriter --condition=None >/dev/null
gcloud iam service-accounts add-iam-policy-binding "${SA_CORE}" \
  --member="serviceAccount:${SA_BUILD}" --role=roles/iam.serviceAccountUser >/dev/null
