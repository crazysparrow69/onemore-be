#!/usr/bin/env bash
# Cloud Build trigger for one service: push to main -> infra/cloudbuild/service.yaml.
# Needs the GitHub repository connected to Cloud Build first (manual, in the console).
# Usage: 05-trigger.sh <service> <runtime-sa-name> <connection-repo-resource>
#   e.g. 05-trigger.sh core-service sa-core \
#        projects/onemore-prod/locations/europe-west1/connections/github/repositories/crazysparrow69-onemore-be
set -euo pipefail
source "$(dirname "$0")/common.sh"

SERVICE="${1:?service}"
RUNTIME_SA="${2:?runtime sa name}"
REPO_RESOURCE="${3:?repository resource}"

# Rebuild only when the service, its shared packages, the lockfile or the pipeline change.
INCLUDED="apps/${SERVICE}/**,pnpm-lock.yaml,package.json,pnpm-workspace.yaml,infra/cloudbuild/**"
# When packages/* appear, add packages/<pkg>/** here for every package the service uses.

gcloud builds triggers delete "deploy-${SERVICE}" --region="${REGION}" --quiet >/dev/null 2>&1 || true
gcloud builds triggers create github \
  --name="deploy-${SERVICE}" \
  --region="${REGION}" \
  --repository="${REPO_RESOURCE}" \
  --branch-pattern='^main$' \
  --build-config=infra/cloudbuild/service.yaml \
  --included-files="${INCLUDED}" \
  --service-account="projects/${PROJECT_ID}/serviceAccounts/${SA_BUILD}" \
  --substitutions="_SERVICE=${SERVICE},_RUNTIME_SA=${RUNTIME_SA}"
