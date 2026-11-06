#!/usr/bin/env bash
# Shared settings for the infra/gcp scripts. Source it, do not run it.
set -euo pipefail

export CLOUDSDK_CORE_DISABLE_PROMPTS=1

PROJECT_ID="onemore-prod"
PROJECT_NAME="onemore"
REGION="europe-west1"
BILLING_ACCOUNT="01A8DF-9718D0-55BE77"
ALERT_EMAIL="denissytnikmacho@gmail.com"
REPO="onemore"
GITHUB_OWNER="crazysparrow69"
GITHUB_REPO="onemore-be"

SA_CORE="sa-core@${PROJECT_ID}.iam.gserviceaccount.com"
SA_BUILD="sa-cloudbuild@${PROJECT_ID}.iam.gserviceaccount.com"

gcloud config set project "${PROJECT_ID}" >/dev/null
