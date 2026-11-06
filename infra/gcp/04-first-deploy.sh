#!/usr/bin/env bash
# One-time manual first deploy of core-service from the local machine.
# It also makes the service public (the pipeline account cannot change IAM).
# After this, deploys go through Cloud Build. Usage: 04-first-deploy.sh [git-sha]
set -euo pipefail
source "$(dirname "$0")/common.sh"

SHA="${1:-$(git rev-parse HEAD)}"
IMAGE="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO}/core-service:${SHA}"

gcloud auth configure-docker "${REGION}-docker.pkg.dev" --quiet
# Cloud Run runs linux/amd64; on Apple Silicon this must be explicit.
docker buildx build --platform linux/amd64 -f apps/core-service/Dockerfile \
  --target runtime -t "${IMAGE}" --load .
docker push "${IMAGE}"

gcloud run deploy core-service --image="${IMAGE}" --region="${REGION}" \
  --min-instances=0 --max-instances=3 --cpu=1 --memory=512Mi --cpu-boost \
  --service-account="${SA_CORE}" --allow-unauthenticated --port=8080 \
  --set-env-vars="NODE_ENV=production,LOG_LEVEL=info,APP_VERSION=${SHA}"
