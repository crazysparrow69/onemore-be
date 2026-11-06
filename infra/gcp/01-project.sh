#!/usr/bin/env bash
# Project, billing link, APIs, budget. Safe to re-run.
set -euo pipefail
source "$(dirname "$0")/common.sh"

gcloud projects describe "${PROJECT_ID}" >/dev/null 2>&1 \
  || gcloud projects create "${PROJECT_ID}" --name="${PROJECT_NAME}"

gcloud billing projects link "${PROJECT_ID}" --billing-account="${BILLING_ACCOUNT}"

gcloud services enable \
  run.googleapis.com \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com \
  secretmanager.googleapis.com \
  iam.googleapis.com \
  logging.googleapis.com \
  cloudresourcemanager.googleapis.com \
  billingbudgets.googleapis.com

# Budget alerts only send e-mail, they do not stop spending.
# Recipients: check "Email alerts to billing admins and users" in the console.
PROJECT_NUMBER=$(gcloud projects describe "${PROJECT_ID}" --format='value(projectNumber)')
if [ -z "$(gcloud billing budgets list --billing-account="${BILLING_ACCOUNT}" \
  --filter="displayName='${PROJECT_ID} 5 USD'" --format='value(name)')" ]; then
  gcloud billing budgets create --billing-account="${BILLING_ACCOUNT}" \
    --display-name="${PROJECT_ID} 5 USD" --budget-amount=5USD \
    --filter-projects="projects/${PROJECT_NUMBER}" \
    --threshold-rule=percent=0.5 --threshold-rule=percent=0.9 --threshold-rule=percent=1.0
fi
