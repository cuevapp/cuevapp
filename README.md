# Cueva — Fingerprint Pipeline

Turns a raw film catalog into a searchable database of **movie fingerprints** (a
7-axis vector: Action, Comedy, Romance, Sci-Fi, Adventure, Drama, Horror) and
serves recommendations by nearest-neighbour search over those vectors.

```
TMDB  ──►  Claude scorer  ──►  Postgres + pgvector  ──►  match query
(catalog,   (calibrated         (VECTOR(7), HNSW         (cosine
 synopsis,   rubric prompt,      cosine index)            similarity)
 reviews,    temperature 0)
 availability)
```

## Layout

| File | Role |
|------|------|
| `cueva/prompts.py` | **The scoring prompt** — rubric + calibration anchors. Core IP. |
| `cueva/scorer.py`  | `LiveScorer` (concurrent) and `BatchScorer` (50%-off backfill). |
| `cueva/tmdb.py`    | Async catalog/synopsis/review/availability fetch. |
| `cueva/store.py`   | pgvector upsert + nearest-neighbour query. |
| `cueva/pipeline.py`| Resumable orchestration + derive-from-liked-films matching. |
| `cueva/cli.py`     | `backfill` / `update` / `match` commands. |
| `schema.sql`       | Postgres + pgvector DDL. |

## Setup

```bash
pip install -r requirements.txt
cp .env.example .env            # then fill in TMDB token, Anthropic key, DB URL
psql "$DATABASE_URL" -f schema.sql
```

## Run

```bash
# 1. Backfill the catalog on the Batch API (cheap, async, up to 10k/batch).
python -m cueva.cli backfill --mode batch --limit 2000

# 2. Daily: score whatever just hit theaters, live.
python -m cueva.cli update --limit 100

# 3. Recommend: derive a fingerprint from films a user loves, find neighbours.
#    (TMDB ids — e.g. 27205 Inception, 49026 The Dark Knight Rises)
python -m cueva.cli match --like 27205,49026 -k 10
```

## Design notes

- **Why a rubric + anchors.** An LLM scoring films cold drifts — "7 Action" drifts
  film to film. The rubric defines each score level and the three anchor films pin
  the scale, so the whole catalog is comparable. `temperature=0` makes it repeatable.
- **Why pgvector.** Fingerprints *are* vectors, so "most similar films" is one
  indexed `ORDER BY fingerprint <=> :v` query (cosine distance) — no app-side math.
- **Resumability.** Every row is stamped with `model_version`. The backfill skips
  films already scored under the current version, so re-runs resume for free.
  Re-scoring later = bump `CUEVA_MODEL_VERSION` and re-run.
- **Cost.** Backfill goes through the Message Batches API (~50% cheaper, finishes
  within 24h). The live path is only for the small daily trickle of new releases.
- **Provenance.** We keep the raw `overview` + `model_version` + `scored_at` on
  every row, so re-scoring against a new model is trivial and auditable.

## Known TODOs before production

- Theatrical detection currently flags TMDB *now-playing* only; add per-region
  theatrical-release-date handling for accuracy.
- The live path writes to Postgres synchronously inside async tasks — fine at
  trickle scale; move to an async driver (e.g. psycopg async) if it grows.
- Add a human-QA sampler + drift dashboard (watch for systematic Drama inflation).
- Wire a scheduler (cron / Cloud Scheduler) for the daily `update`.

## API (serving layer)

Bridges the apps to the catalog. Run it:

```bash
uvicorn cueva.api.app:app --reload     # http://127.0.0.1:8000  (docs at /docs)
```

| Endpoint | Onboarding screen | Does |
|----------|-------------------|------|
| `GET /catalog/onboarding?limit=` | Pick films you love | Coverage-curated film grid |
| `POST /onboard` | Reveal | Derive fingerprint from liked ids, create user |
| `PATCH /users/{id}/fingerprint` | Reveal (fine-tune) | Save adjusted fingerprint |
| `GET /users/{id}/recommendations?k=` | Matches | Ranked films for a saved user |
| `POST /recommend` | (tuning preview) | Stateless ranking for an ad-hoc fingerprint |
| `GET /users/{id}` | Home (returning user) | Saved profile + fingerprint |

Example:

```bash
# derive a fingerprint from liked TMDB ids -> returns user_id + fingerprint
curl -s -X POST localhost:8000/onboard \
  -H 'content-type: application/json' \
  -d '{"liked_tmdb_ids":[27205,49026,157336],"region":"US"}'

# then get that user's matches
curl -s "localhost:8000/users/<user_id>/recommendations?k=10"
```

The apps call this through the typed client in `clients/cueva.ts` — one method per
screen (`onboardingCatalog`, `onboard`, `fineTune`, `recommendations`). Recommendation
logic is shared with the CLI via `cueva.store.nearest`, so "similar" means the same
thing in the API and the batch jobs.

## Auth

Cueva delegates **identity** (login, passwords, social, recovery, MFA) to an
OIDC provider (Auth0, Clerk, Cognito, Supabase Auth) and owns only
**authorization**. The client logs in there, gets a signed JWT, and sends it as
`Authorization: Bearer <token>`. The API verifies the token (signature via the
provider's JWKS, plus issuer/audience/expiry) and identifies the user from the
token's `sub` claim.

Because identity comes from the token, user-scoped routes are `/me/...` — there
is **no user id in any URL to tamper with**, which removes the IDOR risk class
entirely. A Cueva `users` row is created on first onboarding (`POST /onboard`)
and linked to the provider subject via `users.auth_subject`.

Config (from your provider's dashboard):

```
AUTH_ISSUER=https://your-tenant.us.auth0.com/
AUTH_AUDIENCE=https://api.cueva.app
# AUTH_JWKS_URL=        # optional; derived from issuer if blank
# AUTH_DEV_MODE=false   # DEV ONLY: accept "dev:<subject>" tokens. NEVER true in prod.
```

Local development without a provider:

```bash
AUTH_DEV_MODE=true uvicorn cueva.api.app:app --reload
curl -s localhost:8000/me -H 'Authorization: Bearer dev:test-user-1'   # 404 until onboarded
```

The `clients/cueva.ts` client takes a `getToken` callback (wire it to your auth
SDK) and attaches the bearer token automatically; public catalog calls skip it.

## Hardening: CORS + rate limiting

**CORS** is locked to an explicit origin allowlist (`API_CORS_ORIGINS`), the
methods/headers the app actually uses, and `allow_credentials=false` (auth is via
bearer token, not cookies). The app logs a warning if origins is left as `*`.

**Rate limiting** (slowapi) keys per session for authenticated calls (a hash of
the bearer token) and per IP for public ones, with tiers:

| Tier | Default | Applies to |
|------|---------|------------|
| public | `60/minute` | `/catalog/onboarding`, `/films/{id}/similar` |
| read   | `120/minute` | `/me`, `/me/recommendations`, `/recommend` |
| write  | `20/minute` | `/onboard`, `/me/fingerprint` |

`/healthz` is exempt. Limits are tunable via `RATE_LIMIT_*` env vars and can be
turned off in tests with `RATE_LIMIT_ENABLED=false`. Storage defaults to
in-memory (fine for one instance); set `RATE_LIMIT_STORAGE_URI=redis://…` so
limits are shared once you run more than one API instance. Over-limit requests
get `429 Too Many Requests` with a `Retry-After` header.

## Feedback loop (sharpening the fingerprint)

A user's fingerprint has two layers:
- **base** — the deliberate taste from onboarding (and optional fine-tuning), stored on `users`.
- **effective** — `base` nudged by feedback, recomputed on read from the event log.

Feedback is one current signal per film in `feedback_events`:

| Signal | Effect on fingerprint | In recs again? |
|--------|-----------------------|----------------|
| `love` | strong pull toward the film (`+0.25`) | excluded |
| `dislike` | push away (`-0.18`) | excluded |
| `hide` | mild push away (`-0.12`) | excluded |
| `seen` | none (neutral) | excluded |

Each signal moves the vector a bounded step **measured from the base** toward/away
from the film's fingerprint, so the result is order-independent and fully
recomputable — you can retune `recommend.FEEDBACK_WEIGHTS` and recompute every
profile without corruption. Anything a user has acted on is excluded from future
recommendations.

Endpoints (authed): `POST /me/feedback {tmdb_id, signal}`,
`DELETE /me/feedback/{tmdb_id}`, `GET /me/feedback`. `GET /me` and
`/me/recommendations` return the effective fingerprint.

Future refinements: recency decay (recent feedback weighs more), diminishing
returns per axis, and implicit signals (plays/click-throughs) as weak positives.

## Auth: login & registration

Cueva owns **authorization, not identity**. The login and sign-up screens hand
credentials to an identity provider (Clerk / Auth0 / Cognito) or its hosted page;
the user authenticates *there*, and the app receives a JWT. Cueva never sees or
stores a password — `auth.py` only verifies the token's signature via JWKS. So the
full launch sequence is:

```
1. session token present?         (the IdP's JWT, kept by the client)
     no  -> show login / sign-up  -> IdP authenticates -> returns token
2. client.meOrNull()              (GET /me with the bearer token)
     null -> onboarding
     else -> home
```

The app shell prototype simulates the IdP with a local stand-in so the flow is
demoable without a backend: sign-up creates an account, log-in verifies it, and a
mock token is issued and persisted as the session. Profiles are stored per account,
so logging out and back in restores that user's fingerprint, and a different account
gets its own. The stand-in salts+hashes only so the demo can reject a wrong
password — real credential handling lives entirely in the identity provider.

## Robust sessions: token refresh & 401 handling

Access tokens are short-lived, so mid-session calls eventually 401. `CuevaClient`
keeps users signed in without re-prompting:

- **Retry on 401** — a 401 triggers a refresh, then the original request is retried
  **once** (never a loop). If the retry still 401s, the session is dead.
- **Single-flight refresh** — concurrent 401s share one refresh round trip via an
  in-flight promise guard, so ten failing calls cause one refresh, not ten.
- **Proactive refresh** — the client reads the JWT `exp` and refreshes when within
  `refreshSkewSeconds` of expiry, avoiding a guaranteed-fail request + retry.
- **onSessionExpired** — fires only when the refresh token is also dead; the app
  routes to login. Distinct from a 404 (which means "onboard"), which is why the
  thrown error carries `.status`.

```ts
const client = new CuevaClient(API_URL, {
  getToken: () => auth.getAccessToken(),            // current access token
  refreshToken: () => auth.getAccessTokenSilently({ cacheMode: "off" }), // mint a new one
  onSessionExpired: () => router.push("/login?expired=1"),
  refreshSkewSeconds: 30,
});
```

`refreshToken` must update wherever `getToken` reads from and return the new token.
The app-shell prototype simulates this end to end: access tokens expire (watch the
countdown in Profile → Session), an expired access token is refreshed silently from
the refresh token on the next call, and once the refresh token also expires the next
call signs you out with an "expired" notice on the login screen.

## Launch / bootstrap

On launch the client decides between onboarding and home with one call:

```ts
const profile = await client.meOrNull();   // GET /me; null on 404
if (!profile) showOnboarding();
else showHome(profile);
```

`meOrNull()` returns the saved profile when the user has onboarded, or `null`
when the API answers 404 ("no profile yet"). Call it after a token is available;
auth failures and network errors rethrow so they aren't mistaken for
"needs onboarding". The app shell prototype mirrors this against persisted local
state, showing a loading splash, then routing — and saving the durable slice
(liked films, base fingerprint, feedback) on every change so a reload skips
onboarding. Tonight's mood is session-only and intentionally not persisted.

## Measuring the feedback loop

Two complementary views answer "is feedback actually improving matches?":

**Offline lift (leave-one-out)** — the rigorous proxy you run before trusting the
loop. For each loved film, hide it, rebuild the fingerprint from the user's *other*
feedback, and check whether that trained fingerprint ranks the held-out film higher
than the onboarding base does. Reported as mean rank percentile (base vs trained),
recall@10, and MRR. A positive lift means accumulated feedback generalizes to
predict unseen positives rather than memorizing. Validated to *not* manufacture
lift: scattered, patternless loves produce ~zero lift.

**Online metrics** (from `recommendation_events`, joined to feedback):
- **calibration** — do higher predicted-match recs get loved more? (a rising curve
  means match % is meaningful)
- **maturity lift** — does love-rate of served recs rise as the fingerprint
  accumulates signals?

These are observational and confounded; the production gold standard is an A/B test
serving base-only vs trained fingerprints to random arms. The impression log is
built to feed exactly that test. Serving logs impressions best-effort (gated by
`ANALYTICS_ENABLED`) so analytics never breaks recommendations.

```
python -m cueva.cli analytics     # prints offline lift + online calibration/maturity
```
