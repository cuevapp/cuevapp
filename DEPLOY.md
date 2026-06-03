# Cueva — Production Deployment Plan

How to take Cueva off `localhost` and serve it to phones, with the catalog
refreshed from TMDB **every Tuesday and Thursday at 3:00 AM Pacific**.

## Principle: the catalog is server-side; phones are thin clients

Phones never hold the movie list — they call the API, which reads the shared
Postgres+pgvector database. So "update the app with new movies" is a **server-side
data refresh**, not an app-store release. A scheduled job writes new films to the
DB; every device sees them on its next API call.

Two distinct release channels — don't conflate them:

| Change | Reaches users via | App-store release? |
|--------|-------------------|--------------------|
| New movies (catalog data) | scheduled job → DB → clients fetch | ❌ no |
| App code (UI / features)  | rebuild + ship client | ✅ yes |

```
                         ┌──────────────── cloud (one region) ─────────────────┐
 📱 / PWA  ──HTTPS──►  Web CDN (static build)
 📱 / PWA  ──HTTPS──►  API service (FastAPI)  ──►  Postgres + pgvector
                              ▲                          ▲
                         Auth0 (JWT/JWKS)        Scheduler ─► Update Job
                                                 (Tue/Thu 3am PT) runs `cueva.cli update`
                                                 TMDB ─► Claude ─► DB rows (+posters)
```

## Recommended stack (worked example: GCP — picked because its scheduler is timezone-aware, which the Tue/Thu 3am PT requirement needs)

| Concern | Service | Why |
|---------|---------|-----|
| API | **Cloud Run** (container) | scales to zero, HTTPS, simple deploys |
| Scheduled update | **Cloud Run Job** + **Cloud Scheduler** | Scheduler supports IANA timezones → DST-safe Pacific |
| Database | **Neon** or **Cloud SQL for Postgres** (pgvector) | managed Postgres with the `vector` extension |
| Rate-limit store | **Upstash Redis** / Memorystore | app already supports `RATE_LIMIT_STORAGE_URI=redis://` |
| Web hosting | **Cloudflare Pages / Firebase Hosting** | static `vite build` on a CDN |
| Auth | **Auth0** (prod tenant) | the client + backend already speak OIDC/JWKS |
| Secrets | **Secret Manager** | TMDB token, Anthropic key, DB URL |

It's just a container + Postgres, so it ports cleanly. Equivalents:

| | API | Scheduler (timezone-aware?) | Postgres+pgvector |
|--|-----|------------------------------|-------------------|
| AWS | ECS Fargate / App Runner | EventBridge Scheduler ✅ | RDS/Aurora Postgres |
| Fly.io | Fly Machines | scheduled machines (UTC) ⚠️ | Fly Postgres / Neon |
| Render | Web Service | Cron Jobs (UTC) ⚠️ | Render Postgres |
| Kubernetes | Deployment | CronJob `.spec.timeZone` ✅ (≥1.27) | any managed PG |
| GitHub Actions | (job runner only) | `schedule:` cron (UTC only) ⚠️ | — |

⚠️ = no native timezone → see the DST note in the scheduling section.

## 1. Containerize (no Dockerfile exists yet)

One image serves **both** the API and the update job — only the command differs.

```dockerfile
# Dockerfile
FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY cueva ./cueva
COPY schema.sql .
ENV PORT=8080
# API (default). The update job overrides this command (see step 4).
CMD ["sh", "-c", "uvicorn cueva.api.app:app --host 0.0.0.0 --port ${PORT}"]
```

## 2. Database

1. Provision managed Postgres with **pgvector** (Neon/Supabase/RDS/Cloud SQL all support it).
2. Load the schema once: `psql "$DATABASE_URL" -f schema.sql` (creates `vector`/`pgcrypto`
   extensions, tables, HNSW index — including the `poster_path` column).
3. **Initial catalog load** (one-time), cheaper via the Batch API:
   `python -m cueva.cli backfill --mode batch --limit 3000`
   New films get `poster_path` automatically. (If you ever import a dump without
   posters, run `backfill_posters.py` once.)
4. Enable automated backups / PITR on the managed DB.

## 3. API service

Deploy the image to Cloud Run (or equivalent). Production environment (see
`config.py`); put secrets in Secret Manager, not plaintext:

```
DATABASE_URL=postgresql://…              # managed DB (use the pooled/SSL URL)
TMDB_API_TOKEN=…                         # secret
ANTHROPIC_API_KEY=…                      # secret (only the update job strictly needs it)
AUTH_ISSUER=https://<tenant>.us.auth0.com/
AUTH_AUDIENCE=https://api.cueva.app
AUTH_DEV_MODE=false                      # ⚠️ MUST be false in prod (no dev: tokens)
API_CORS_ORIGINS=https://app.cueva.app   # your real web origin(s), never "*"
RATE_LIMIT_STORAGE_URI=redis://…         # shared limits across instances
CUEVA_REGION=US
CUEVA_MODEL=claude-sonnet-4-6
CUEVA_MODEL_VERSION=fp-v1-sonnet46       # bump only to force a full re-score
```

Put it behind HTTPS at e.g. `https://api.cueva.app`. Health check: `GET /healthz`.

## 4. The scheduled update job  ← the Tue/Thu 3am PT requirement

Same image, command overridden to run the CLI and exit:

```
python -m cueva.cli update --limit 150
```

`update` pulls now-playing + popular from TMDB, scores only films **not already
scored** under the current `model_version` (so only genuinely new releases cost
money, ~1¢ each), and writes rows **with posters**. Idempotent and safe to retry.

**Cloud Run Job + Cloud Scheduler:**

```bash
# define the job (runs the CLI, then exits)
gcloud run jobs create cueva-update \
  --image REGION-docker.pkg.dev/PROJECT/cueva/api:latest \
  --command python --args=-m,cueva.cli,update,--args=--limit,150 \
  --set-secrets DATABASE_URL=…,TMDB_API_TOKEN=…,ANTHROPIC_API_KEY=… \
  --max-retries 2 --task-timeout 1800

# schedule it: 03:00 Pacific, Tuesdays & Thursdays, DST-safe
gcloud scheduler jobs create http cueva-update-schedule \
  --schedule "0 3 * * 2,4" \
  --time-zone "America/Los_Angeles" \
  --uri "https://REGION-run.googleapis.com/apis/run.googleapis.com/v1/namespaces/PROJECT/jobs/cueva-update:run" \
  --http-method POST --oauth-service-account-email RUNNER@PROJECT.iam.gserviceaccount.com
```

### Getting "3am Pacific" right (DST)

Cron `0 3 * * 2,4` = **03:00, day-of-week 2 (Tue) and 4 (Thu)**. The timezone is
the catch:

- **Timezone-aware schedulers** (Cloud Scheduler `--time-zone`, AWS EventBridge
  Scheduler, k8s CronJob `.spec.timeZone`): set **`America/Los_Angeles`** and it
  fires at 3am Pacific year-round, auto-adjusting PST↔PDT. ✅ Use this.
- **UTC-only schedulers** (GitHub Actions, plain `cron`, Render/Fly cron): there's
  no real "PST" that also tracks DST. Pick one:
  - Fixed **PST** (UTC−8, what you literally asked): `0 11 * * 2,4` UTC → drifts to
    4am Pacific in summer.
  - Fixed **PDT** (UTC−7): `0 10 * * 2,4` UTC → drifts to 2am Pacific in winter.
  - DST-correct on a UTC scheduler = maintain two crons and switch at the DST
    boundaries (or just use a timezone-aware scheduler — recommended).

Equivalents on other platforms (all timezone-aware → America/Los_Angeles):
- **AWS EventBridge Scheduler:** `cron(0 3 ? * TUE,THU *)`, timezone America/Los_Angeles
- **Kubernetes CronJob:** `schedule: "0 3 * * 2,4"`, `timeZone: "America/Los_Angeles"`

Add failure alerting (e.g. Cloud Monitoring alert on job error / non-completion).

## 5. Web client → phones

The current `web/` app is a Vite/React **web** app. To put it "on phones":

- **Fastest:** ship it as an installable **PWA** (add a manifest + service worker)
  — no app stores, and catalog updates already flow through.
- **Native:** port the UI to **React Native** (or wrap the PWA). Either way it stays
  an API client, so server-side catalog updates need no client release.

Build & host the static bundle, pointed at prod:

```
# web/.env.production
VITE_API_URL=https://api.cueva.app
VITE_USE_MOCK=false
VITE_AUTH0_DOMAIN=<tenant>.us.auth0.com
VITE_AUTH0_CLIENT_ID=…
VITE_AUTH0_AUDIENCE=https://api.cueva.app
```

`npm run build` → deploy `web/dist` to the CDN. Setting the Auth0 vars flips the app
from the dev-token shell to the real **Auth0 shell** (already built in `App.jsx`); the
`DevAuthShell` is local-only and unused in prod.

## 6. Auth (production)

Create an Auth0 (or Clerk/Cognito) prod tenant: an SPA app (the web/PWA client) and
an API (the `audience`). Backend verifies issuer+audience via JWKS — set
`AUTH_ISSUER`/`AUTH_AUDIENCE` to match. No passwords ever touch Cueva.

## 7. Hardening (mostly already in the code)

- `AUTH_DEV_MODE=false` — disables `dev:` tokens. **Verify before launch.**
- CORS locked to the real web origin(s); never `*`.
- Rate limiting backed by **Redis** so limits are shared across API instances.
- `/me/...` routes carry no user id in the URL (no IDOR); auth identity comes from the JWT.
- TLS everywhere; secrets in a secret manager; least-privilege DB user.

## Rollout sequence

1. Build & push the image (Dockerfile above).
2. Provision DB → `psql -f schema.sql` → one-time `backfill --mode batch`.
3. Deploy API (Cloud Run) with prod env/secrets; verify `GET /healthz` and `/docs`.
4. Create the **Cloud Run Job** + **Cloud Scheduler** (`0 3 * * 2,4`,
   `America/Los_Angeles`); trigger once manually to confirm it writes new rows.
5. Stand up Auth0 prod; wire issuer/audience both sides.
6. Build the web/PWA client against prod env; deploy to CDN; add it to Auth0 callback URLs.
7. Smoke test end-to-end on a phone (sign up → onboard → recommendations → tickets/posters).
8. Turn on monitoring/alerts (API uptime, job success, DB backups).

## Ops notes

- **Cost:** API scales to zero when idle; the update job runs ~2×/week for a few
  minutes; Anthropic spend is only for *new* films (resumable). Main fixed cost is the
  managed Postgres.
- **Re-scoring the whole catalog** (e.g. new rubric/model): bump `CUEVA_MODEL_VERSION`
  and run a `backfill` — the next run treats everything as unscored.
- **Rollback:** API is a versioned container (roll back the revision); catalog writes
  are upserts, so a bad run can be corrected by re-running after a fix.
