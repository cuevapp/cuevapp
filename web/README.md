# Cueva web (Vite scaffold)

A thin Vite + React app that mounts the connected Cueva UI (`src/App.jsx`). Out of
the box it runs standalone against an in-browser mock. It can talk to your real
backend, and to a real identity provider (Auth0), each via env vars — no code edits.

## Run it (standalone, mock backend + mock login)

```bash
cd web
npm install
npm run dev        # http://localhost:5173
```

Everything works immediately. Data flows through the real `CuevaClient`; a mock
intercepts `fetch` and a mock IdP issues tokens.

## Point at a real backend

Run the backend (see top-level `SETUP.md`), add `http://localhost:5173` to its
`API_CORS_ORIGINS`, then in `web/.env`:

```
VITE_API_URL=http://localhost:8000
VITE_USE_MOCK=false
```

## Wire a real identity provider (Auth0)

The app is provider-agnostic: `AppCore` consumes a normalized `auth` object, and two
shells implement it — `MockAuthShell` (default) and `Auth0AuthShell`. Setting the
Auth0 env vars flips `USING_AUTH0`, which renders the Auth0 shell. That shell is the
whole integration:

```
getToken      = () => getAccessTokenSilently()                 // cached, auto-refreshed
refreshToken  = () => getAccessTokenSilently({ cacheMode:"off" })  // force a new one
onSessionExpired = () => loginWithRedirect()
```

### Auth0 dashboard (one-time)

1. **Create an Application** → type *Single Page Application*. Note the **Domain** and
   **Client ID**.
2. In its settings, set (for local dev):
   - Allowed Callback URLs: `http://localhost:5173`
   - Allowed Logout URLs: `http://localhost:5173`
   - Allowed Web Origins: `http://localhost:5173`
3. **Create an API** → set an **Identifier** (this is the `audience`, e.g.
   `https://api.cueva.app`). Leave RS256.

### Wire it up

`web/.env`:
```
VITE_API_URL=http://localhost:8000
VITE_USE_MOCK=false
VITE_AUTH0_DOMAIN=your-tenant.us.auth0.com
VITE_AUTH0_CLIENT_ID=xxxxxxxxxxxxxxxxxxxx
VITE_AUTH0_AUDIENCE=https://api.cueva.app
```

Backend `.env` (so it verifies the very tokens Auth0 mints):
```
AUTH_ISSUER=https://your-tenant.us.auth0.com/
AUTH_AUDIENCE=https://api.cueva.app
```

Now `npm run dev`: the login screen becomes a "Continue" button that redirects to
Auth0's hosted login (signup, password reset, social, MFA all handled there). After
sign-in you're returned with a JWT; `CuevaClient` sends it; the backend verifies it
via JWKS; `meOrNull()` routes you to onboarding or home. No password ever touches
this app or Cueva.

### Notes
- The manual session-demo card (expire access/session) is mock-only — Auth0 manages
  token lifetime itself. `CuevaClient`'s refresh/401 retry still runs as a safety net.
- **Clerk / Cognito** plug into the same `Auth0AuthShell` seam: swap the SDK and map
  its "get token" / "get fresh token" / "sign in" calls onto `getToken` /
  `refreshToken` / `onSessionExpired`. The backend keeps verifying issuer + audience
  via JWKS — point `AUTH_ISSUER`/`AUTH_AUDIENCE` at the new provider.
