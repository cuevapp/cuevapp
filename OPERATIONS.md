# Cueva — Operations

Running notes for the live service (cuevapp.com / api.cuevapp.com). See `DEPLOY.md` and
`GOLIVE.md` for the original setup; this file covers ongoing operational behavior.

## Scheduled catalog refresh

New movies are pulled from TMDB and scored on a schedule via two cron-job.org jobs that
hit the Render-hosted API. The API endpoint is:

```
POST https://api.cuevapp.com/internal/refresh-catalog
  header: X-Cron-Token: <CRON_TRIGGER_TOKEN>
```

It validates the token, then kicks off `backfill(mode="live")` in a background thread and
returns immediately. Responses:

| Code | Meaning |
|------|---------|
| **202** `{"status":"started"}` | Accepted; refresh running in the background |
| **403** `{"detail":"Invalid cron token"}` | `X-Cron-Token` doesn't match the server's `CRON_TRIGGER_TOKEN` |
| **404** | `CRON_TRIGGER_TOKEN` isn't set on the server (endpoint disabled) |

### The two cron-job.org jobs

1. **Catalog refresh** — Tue & Thu **03:00** America/Los_Angeles → `POST /internal/refresh-catalog`
   with the `X-Cron-Token` header. Created by `scripts/create_cronjob.sh`.
2. **Warm-up** (jobId 7886410) — Tue & Thu **02:59** America/Los_Angeles → `GET https://api.cuevapp.com/openapi.json`.
   Created by `scripts/create_warmup_cronjob.sh`. **Why:** the Render service is on the free
   tier and spins down after ~15 min idle. At 3 AM it's asleep, and the refresh trigger could hit
   a cold-starting instance that returns a transient 5xx. The warm-up GET one minute earlier wakes
   the service so the 03:00 refresh lands on a warm instance. **Use `/openapi.json` (a 200), not
   `/` (404)** — cron-job.org flags any 4xx as a failure, so a root ping would perpetually show
   "failed" even when it's working.

> **DNS note:** `api.cuevapp.com` is **grey-clouded (DNS-only)** in Cloudflare — it CNAMEs straight
> to Render, bypassing the Cloudflare zone's Bot Fight Mode / WAF (which were 403-blocking the cron
> traffic). The web app (`cuevapp.com`) stays Cloudflare-proxied. Keep the `api` record DNS-only.

### Recreate / manage the jobs

```bash
# refresh job (needs the shared token)
CRONJOB_API_KEY=... API_URL=https://api.cuevapp.com CRON_TRIGGER_TOKEN=... ./scripts/create_cronjob.sh
# warm-up job (no token)
CRONJOB_API_KEY=... API_URL=https://api.cuevapp.com ./scripts/create_warmup_cronjob.sh
```

Dashboard equivalents:
- **Refresh:** POST `…/internal/refresh-catalog`, header `X-Cron-Token: <token>`, Tue/Thu 03:00 PT.
- **Warm-up:** GET `https://api.cuevapp.com/`, no auth, Tue/Thu 02:59 PT.

## Incident log

- **2026-06-18 (Thu) 03:00 PT — refresh "Failed (HTTP error)" (1.15 s).** Initially attributed to a
  **Render free-tier cold start**. **Fix:** added the **02:59 warm-up** job so the service is awake
  before the refresh.
- **2026-06-23 — both jobs "403 Forbidden".** Two distinct causes, untangled in order:
  1. **Cloudflare** (the zone's Bot Fight Mode / WAF) was 403-blocking cron-job.org's datacenter IPs.
     Turning off Bot Fight Mode fixed GETs; the API subdomain was then **grey-clouded (DNS-only)** to
     remove the Cloudflare layer from the API entirely. (Verified: warm-up `GET /openapi.json` → 200.)
  2. The refresh **still** 403'd because the job's **`X-Cron-Token` header was empty** — the app was
     correctly rejecting a blank token. Restored the header to the real `CRON_TRIGGER_TOKEN` and
     force-ran the job to verify **`POST /internal/refresh-catalog` → 202**. Also repointed the
     warm-up from `/` (404) to `/openapi.json` (200) so it stops false-failing.
  **Lesson:** a 403 with an empty `X-Cron-Token` looks identical to a Cloudflare 403 — check the
  job's stored header value (cron-job.org → job → Advanced → Headers) before assuming an edge block.

## Troubleshooting a failed refresh

1. **cron-job.org → the job → execution history → open the failed run** and read the **HTTP status code**:
   - **502 / 503** → Render cold start / restart (transient) → the warm-up job should prevent it; consider
     a paid Render tier if it recurs.
   - **403** → token mismatch → re-sync `CRON_TRIGGER_TOKEN` (Render Environment tab) with the
     `X-Cron-Token` header (cron-job.org → job → Advanced → Headers).
   - **500** → the refresh handler errored → check Render logs (e.g. a bad TMDB/Anthropic key).
2. **Probe the live endpoint** (non-destructive — no valid token = nothing runs):
   ```bash
   curl -s -X POST https://api.cuevapp.com/internal/refresh-catalog \
     -w "\n%{http_code}\n"                       # expect 403 (gate works, service up)
   ```
3. **Trigger a tiny real refresh** to confirm the happy path (needs the token; runs 1 film):
   ```bash
   curl -s -X POST "https://api.cuevapp.com/internal/refresh-catalog?limit=1" \
     -H "X-Cron-Token: <token>" -w "\n%{http_code}\n"   # expect 202
   ```

## Secrets / tokens

- **`CRON_TRIGGER_TOKEN`** — shared secret for the refresh endpoint. Lives on **Render** (Environment
  tab, `sync:false`) and in the cron-job.org `X-Cron-Token` header. It is **not** stored in the local
  `.env`. To rotate: set a new value on Render (it redeploys) **and** update the cron-job.org header to
  match.
- **cron-job.org API key** — full control over all cron jobs; used only to create/manage jobs via the
  scripts. Keep it out of the repo. Regenerate at console.cron-job.org → Settings → API if exposed.
