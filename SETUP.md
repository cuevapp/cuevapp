# Setup & wiring

Cueva is two pieces: a **Python/FastAPI backend** (the fingerprint pipeline + API)
and a **TypeScript client + React UI** that talks to it. This is the source of
record for the design and contracts — wiring it into a real project takes the steps
below.

## 1. Backend

```bash
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

cp .env.example .env        # then fill in the values (see below)

# Postgres 15+ with the pgvector extension, then load the schema:
psql "$DATABASE_URL" -f schema.sql

# Score films into fingerprints (TMDB -> LLM -> pgvector). Start small:
python -m cueva.cli backfill --limit 200

# Run the API:
uvicorn cueva.api.app:app --reload      # http://localhost:8000

# Measure the feedback loop once feedback exists:
python -m cueva.cli analytics
```

**Env vars** (all in `.env.example`): `TMDB_API_TOKEN` and `ANTHROPIC_API_KEY` for
scoring; `DATABASE_URL` for Postgres; `AUTH_ISSUER` / `AUTH_AUDIENCE` from your
identity provider so the API can verify JWTs; `API_CORS_ORIGINS` set to your real
web/app origins; `RATE_LIMIT_STORAGE_URI=redis://…` in production (the default
`memory://` doesn't share limits across instances). `AUTH_DEV_MODE=true` accepts
`dev:<subject>` tokens for local testing only — never enable it in production.

## 2. Frontend (runnable)

The `web/` folder is a Vite app that mounts the connected UI and runs immediately
against an in-browser mock of the API:

```bash
cd web
npm install
npm run dev        # http://localhost:5173 — register, onboard, browse, rate, refresh
```

To point it at the real backend, set `VITE_API_URL` + `VITE_USE_MOCK=false` and swap
the mock identity provider for your SDK — see `web/README.md`. The standalone
artifact components in `prototypes/` are kept for reference; `npm run typecheck` at
the root still type-checks the canonical TypeScript client.

## 2b. Frontend internals

```bash
npm install
npm run typecheck      # type-checks clients/cueva.ts
```

There's no bundled dev server — the `prototypes/*.jsx` are single-file artifact
components. To run them, drop them into a React app (Vite or Next.js) as page
components; they already use `react`, `recharts`, and `lucide-react` (all in
`package.json`). `prototypes/README.md` maps each file; `prototypes/cueva-app.jsx`
is the full shell to start from.

## 3. Connect the client

`clients/cueva.ts` is the typed API client. Instantiate it with your identity
provider's token methods:

```ts
import { CuevaClient } from "./clients/cueva";

const client = new CuevaClient(import.meta.env.VITE_API_URL, {
  getToken: () => auth.getAccessToken(),
  refreshToken: () => auth.getAccessTokenSilently({ cacheMode: "off" }),
  onSessionExpired: () => router.push("/login?expired=1"),
  refreshSkewSeconds: 30,
});

const profile = await client.meOrNull();   // null -> onboarding, else -> home
```

## 4. Going live: what's simulated vs real

The prototypes compute locally so they run without a backend. To productionize:

- **Auth** — wire a real identity provider (Auth0 / Clerk / Cognito). The login
  screen calls the provider's SDK; the backend verifies the JWT via JWKS. Cueva
  never stores passwords. The prototype's local account store is a stand-in only.
- **Data** — replace the prototypes' local catalog + local fingerprint math with
  `CuevaClient` calls (`onboardingCatalog`, `onboard`, `recommendations`,
  `sendFeedback`, `fineTune`, `meOrNull`). The client mirrors the same contract.
- **Persistence** — the shell persists to the artifact storage API; in a real app,
  `meOrNull()` on launch decides onboarding vs home, and the IdP holds the session.
- **Sessions** — the prototype simulates token expiry/refresh; in production the
  client's refresh + 401 retry runs against real provider tokens.

See `README.md` for the full architecture (pipeline, auth model, feedback loop,
analytics, and session handling).
