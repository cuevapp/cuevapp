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
2. **Warm-up** (jobId 7886410) — Tue & Thu **02:59** America/Los_Angeles → plain `GET https://api.cuevapp.com/`.
   Created by `scripts/create_warmup_cronjob.sh`. **Why:** the Render service is on the free
   tier and spins down after ~15 min idle. At 3 AM it's asleep, and the refresh trigger could hit
   a cold-starting instance that returns a transient 5xx. The warm-up GET one minute earlier wakes
   the service so the 03:00 refresh lands on a warm instance. (The root returns 404 — expected and
   fine; cron-job.org counts it as a completed request, and the service still wakes.)

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

- **2026-06-18 (Thu) 03:00 PT — refresh "Failed (HTTP error)" (1.15 s).** Investigated: the API and
  token were both healthy (a manual `POST …?limit=1` with the cron-job.org token returned **202**, and
  the cron-job.org `X-Cron-Token` was confirmed to match Render's `CRON_TRIGGER_TOKEN`). Root cause was
  a **Render free-tier cold start** returning a transient 5xx while waking at 3 AM — not a config or
  data problem (a missed refresh is harmless; the next run catches up). **Fix:** added the **02:59
  warm-up** job so the service is awake before the refresh.

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
