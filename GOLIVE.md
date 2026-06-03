# Go live: Cueva on cuevapp.com

A concrete runbook for the **simple-managed** path: **Neon** (Postgres+pgvector) ·
**Render** (API + cron) · **Cloudflare Pages or Vercel** (web/PWA) · **Auth0** (identity).
See `DEPLOY.md` for the architecture; this is the click-by-click for cuevapp.com.

## Domains you'll create
| Hostname | Points to | Set up at |
|----------|-----------|-----------|
| `cuevapp.com`, `www.cuevapp.com` | the web app / PWA | Cloudflare Pages / Vercel |
| `api.cuevapp.com` | the API container | Render |

TLS is auto-issued by both hosts once DNS is verified.

---

## 0. Before you start
- **Rotate** the TMDB token and Anthropic key used in dev (they were exposed) — generate fresh ones; you'll paste these into Render as secrets, never into git.
- Push this repo to GitHub (Render + Cloudflare/Vercel deploy from it).

## 1. Database — Neon
1. Create a Neon project → a database named `cueva`.
2. SQL editor (or `psql`): `CREATE EXTENSION IF NOT EXISTS vector;` then run the contents of `schema.sql` (it also creates `pgcrypto` + tables + the HNSW index).
3. Copy the **pooled** connection string (`...-pooler.neon.tech/cueva?sslmode=require`) — that's `DATABASE_URL`.

## 2. API — Render (uses render.yaml)
1. Render → **New → Blueprint** → pick this repo. It reads `render.yaml` (the `cueva-api` web service + `cueva-update` cron).
2. Fill the secret env vars (marked `sync:false`): `DATABASE_URL` (Neon), `TMDB_API_TOKEN`, `ANTHROPIC_API_KEY`, `AUTH_ISSUER` (from step 4).
3. After first deploy, add the custom domain **api.cuevapp.com** to the `cueva-api` service → Render gives you a DNS target (a `CNAME`). Add it at your registrar.
4. Verify: `https://api.cuevapp.com/healthz` → `{"status":"ok"}`.
5. **Initial catalog load** (one-time): in the Render `cueva-api` shell, run
   `python -m cueva.cli backfill --mode batch --limit 3000` (posters included). Or run the
   `cueva-update` cron once manually from the dashboard for a smaller first load.

## 3. Auth0 — identity
1. Create a tenant. **Applications → Create → Single Page Application** ("Cueva Web"):
   - Allowed **Callback URLs**: `https://cuevapp.com`
   - Allowed **Logout URLs**: `https://cuevapp.com`
   - Allowed **Web Origins**: `https://cuevapp.com`
   - Note the **Domain** and **Client ID**.
2. **APIs → Create** ("Cueva API") → Identifier (audience) = `https://api.cuevapp.com` (RS256).
3. Wire it to the backend (Render `cueva-api` env): `AUTH_ISSUER=https://YOUR_TENANT.us.auth0.com/`,
   `AUTH_AUDIENCE=https://api.cuevapp.com`, and confirm `AUTH_DEV_MODE=false`.
   (The web app gets the same values via build env in step 4.)

## 4. Web / PWA — Cloudflare Pages (or Vercel)
1. New project from this repo. **Root directory:** `web`. **Build:** `npm run build`. **Output:** `dist`.
2. Build-time environment variables (these bake into the bundle — fill `web/.env.production`'s values):
   ```
   VITE_API_URL=https://api.cuevapp.com
   VITE_USE_MOCK=false
   VITE_AUTH0_DOMAIN=YOUR_TENANT.us.auth0.com
   VITE_AUTH0_CLIENT_ID=YOUR_SPA_CLIENT_ID
   VITE_AUTH0_AUDIENCE=https://api.cuevapp.com
   VITE_DONATE_URL=https://buymeacoffee.com/cuevaapp
   ```
   Setting the Auth0 vars flips the app to the **Auth0 login shell** automatically.
3. SPA routing: Cloudflare Pages handles it; on Vercel add a rewrite of all paths → `/index.html`
   (or a `vercel.json` with `{"rewrites":[{"source":"/(.*)","destination":"/index.html"}]}`).
4. Add custom domains **cuevapp.com** + **www.cuevapp.com**; set the registrar DNS records the host shows
   (apex `A`/`ALIAS` or `CNAME`-flattening, and `www` `CNAME`).

## 5. Schedule the refresh (Tue/Thu 3am Pacific) — cron-job.org
The API exposes `POST /internal/refresh-catalog` (gated by the `CRON_TRIGGER_TOKEN` secret),
which launches `cueva.cli update` in the background. We drive it from **cron-job.org**, whose
schedules are timezone-aware (`America/Los_Angeles`), so it stays exactly 3am Pacific across DST.

1. Set a long random **`CRON_TRIGGER_TOKEN`** on the Render `cueva-api` service (it's already an
   env var in `render.yaml`). Without it the endpoint returns 404 (disabled).
2. Create the trigger — either run `scripts/create_cronjob.sh`
   (`CRONJOB_API_KEY=… API_URL=https://api.cuevapp.com CRON_TRIGGER_TOKEN=… ./scripts/create_cronjob.sh`),
   or in the cron-job.org dashboard:
   - **URL:** `https://api.cuevapp.com/internal/refresh-catalog`  · **Method:** POST
   - **Header:** `X-Cron-Token: <your CRON_TRIGGER_TOKEN>`
   - **Schedule:** every **Tue** and **Thu** at **03:00**, **Timezone: America/Los_Angeles**
3. Test: run the job once from cron-job.org → expect HTTP **202** `{"status":"started"}`, and the
   catalog gains any new releases a minute later. (A wrong/absent token returns 403/404.)

## 6. Pre-launch checks
- `https://api.cuevapp.com/healthz` ok; `/docs` reachable.
- On a phone: open `https://cuevapp.com` → **Add to Home Screen** (PWA installs with the Cueva icon) →
  sign up via Auth0 → onboard → recommendations show posters → "Get tickets" → "Buy me a coffee".
- Confirm `AUTH_DEV_MODE=false` (a `Bearer dev:...` token must be rejected) and CORS only allows cuevapp.com.
- Secrets live in Render's secret env (and Neon/Auth0 dashboards) — not in git.

## Costs to start
Neon free tier · Render starter (API) · Cloudflare Pages free · Auth0 free (~7.5k users) · Anthropic only
for *new* films on the Tue/Thu job. Effectively a few dollars/month to launch.
