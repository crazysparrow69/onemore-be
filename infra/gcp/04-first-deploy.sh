#!/usr/bin/env bash
# One-time manual first deploy of a service from the local machine.
# It also makes the service public (the pipeline account cannot change IAM).
# After this, deploys go through Cloud Build.
# Usage: 04-first-deploy.sh [service] [git-sha]
#   service: nutrition-service (core-service was deployed by hand once, before this script took an argument)
set -euo pipefail
source "$(dirname "$0")/common.sh"

SERVICE="${1:?service}"
SHA="${2:-$(git rev-parse HEAD)}"
# The service validates its whole environment at startup, so the first revision needs
# the same variables as the pipeline: the plain ones below and the database secret.
NEON_AUTH_URL="https://ep-shy-leaf-b9dtc17c.neonauth.c-7.eu-central-1.aws.neon.tech/neondb/auth"
case "${SERVICE}" in
  core-service)
    echo "core-service is already deployed; its deploys go through Cloud Build." >&2
    exit 1
    ;;
  nutrition-service)
    RUNTIME_SA="${SA_NUTRITION}"
    DB_SECRET="nutrition-database-url"
    ;;
  *) echo "Unknown service: ${SERVICE}" >&2; exit 1 ;;
esac
IMAGE="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO}/${SERVICE}:${SHA}"

gcloud auth configure-docker "${REGION}-docker.pkg.dev" --quiet
# Cloud Run runs linux/amd64; on Apple Silicon this must be explicit.
docker buildx build --platform linux/amd64 -f "apps/${SERVICE}/Dockerfile" \
  --target runtime -t "${IMAGE}" --load .
docker push "${IMAGE}"

gcloud run deploy "${SERVICE}" --image="${IMAGE}" --region="${REGION}" \
  --min-instances=0 --max-instances=3 --cpu=1 --memory=512Mi --cpu-boost \
  --service-account="${RUNTIME_SA}" --allow-unauthenticated --port=8080 \
  --set-env-vars="NODE_ENV=production,LOG_LEVEL=info,APP_VERSION=${SHA},NEON_AUTH_URL=${NEON_AUTH_URL}" \
  --set-secrets="DATABASE_URL=${DB_SECRET}:latest"
