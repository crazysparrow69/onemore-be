# Rollback

Project `onemore-prod`, region `europe-west1`. Examples use `core-service`; replace the name for other services.
A rollback takes seconds (measured: 6 s). It only moves traffic; nothing is rebuilt.

## 1. Roll back code

```bash
gcloud config configurations activate onemore

# Find the previous good revision (the one before the current)
gcloud run revisions list --service core-service --region europe-west1

# Send 100% of traffic to it
gcloud run services update-traffic core-service --region europe-west1 \
  --to-revisions=<PREVIOUS_REVISION>=100

# Verify: "version" must be the old commit SHA
curl -s https://core-service-txfjcwbsoq-ew.a.run.app/health
```

Traffic is now pinned to that revision. The next successful deploy on `main` moves it to the new
revision again (the pipeline runs `update-traffic --to-latest`).

**Right after a rollback, revert or fix the bad commit in `main`.** Otherwise the next merge
(any merge touching the service) deploys the broken code again.

## 2. Bad deploy that never got traffic

The pipeline runs a smoke test on the `candidate` revision before switching traffic. If the smoke
step fails, production is untouched: nothing to roll back. The broken revision stays with 0% traffic
and the `candidate` tag until the next successful deploy. Find the cause in the build log:

```bash
gcloud builds list --region europe-west1 --limit 5
gcloud builds log <BUILD_ID> --region europe-west1
```

## 3. Database

The database is never rolled back. Migrations are backward compatible (expand -> contract), so old
code works with the new schema. Fix forward with a new migration. Before a risky migration, take a
manual `pg_dump` (see `restore.md` once it exists).

## 4. Web

Vercel: Instant Rollback in the dashboard. Deploy order for contract changes: service first, then web.
