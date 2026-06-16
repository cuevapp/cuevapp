// Cueva API client — shared by the web app and React Native app.
// Authenticated calls carry the identity provider's JWT. The user is identified
// from the token (server-side), so user-scoped methods hit /me — no id in any URL.

export type Axis =
  | "action" | "comedy" | "romance" | "scifi" | "adventure" | "drama" | "horror";

export type Fingerprint = Record<Axis, number>;

export interface AxisScore { axis: Axis; label: string; value: number; }

export interface CatalogItem {
  tmdb_id: number;
  title: string;
  year: number | null;
  poster_path: string | null;   // TMDB poster path, e.g. "/abc.jpg"
  dominant_axis: Axis;
  fingerprint: Fingerprint;
}

export interface MovieMatch {
  tmdb_id: number;
  title: string;
  year: number | null;
  poster_path: string | null;   // TMDB poster path; build URL as https://image.tmdb.org/t/p/<size><path>
  match: number;       // 0..1 cosine similarity
  match_pct: number;   // rounded for display
  in_theaters: boolean;
  providers: string[];
}

export interface OnboardResponse {
  user_id: string;
  fingerprint: Fingerprint;
  top_axes: AxisScore[];
}

export interface RecommendResponse {
  fingerprint: Fingerprint;
  results: MovieMatch[];
}

export interface UserResponse {
  user_id: string;
  fingerprint: Fingerprint;        // effective (base + feedback)
  base_fingerprint: Fingerprint;   // deliberate onboarding/fine-tuned taste
  liked_tmdb_ids: number[];
  region: string;
  top_axes: AxisScore[];
  updated_at: string;
}

export type FeedbackSignal = "love" | "dislike" | "seen" | "hide";

export interface FeedbackResponse {
  fingerprint: Fingerprint;
  base_fingerprint: Fingerprint;
  top_axes: AxisScore[];
  feedback_count: number;
}

// getToken returns the current provider access token (or null when signed out).
// Plug in your auth SDK's token getter — e.g. Auth0/Clerk's getAccessTokenSilently.
export type TokenProvider = () => Promise<string | null> | string | null;

export interface CuevaClientOptions {
  getToken: TokenProvider;
  /** Exchange the IdP's refresh token for a NEW access token, updating wherever
   *  getToken reads from, and return it (or null if the refresh token is dead).
   *  e.g. Auth0 getAccessTokenSilently({ cacheMode: "off" }) / Clerk getToken({ skipCache: true }). */
  refreshToken?: () => Promise<string | null>;
  /** Called when the session is unrecoverable (refresh failed / still 401) — route to login. */
  onSessionExpired?: () => void;
  /** Refresh proactively when the access token is within this many seconds of expiry. */
  refreshSkewSeconds?: number;
}

export class CuevaClient {
  private getToken: TokenProvider;
  private refreshToken?: () => Promise<string | null>;
  private onSessionExpired?: () => void;
  private skewMs: number;
  private refreshing: Promise<string | null> | null = null; // single-flight guard

  constructor(private baseUrl: string, opts: CuevaClientOptions | TokenProvider = () => null) {
    const o: CuevaClientOptions = typeof opts === "function" ? { getToken: opts } : opts;
    this.getToken = o.getToken;
    this.refreshToken = o.refreshToken;
    this.onSessionExpired = o.onSessionExpired;
    this.skewMs = (o.refreshSkewSeconds ?? 30) * 1000;
  }

  private mkErr(status: number, msg: string): Error & { status?: number } {
    const e = new Error(`Cueva ${status}: ${msg}`) as Error & { status?: number };
    e.status = status;
    return e;
  }

  /** Read a JWT's exp (ms) without verifying — only to decide *proactive* refresh. */
  private expMs(token: string): number | null {
    const part = token.split(".")[1];
    if (!part) return null;
    try {
      const json = JSON.parse(atob(part.replace(/-/g, "+").replace(/_/g, "/")));
      return typeof json.exp === "number" ? json.exp * 1000 : null;
    } catch { return null; }
  }

  /** Single-flight: ten concurrent 401s share ONE refresh round trip, not ten. */
  private refresh(): Promise<string | null> {
    if (!this.refreshToken) return Promise.resolve(null);
    if (!this.refreshing) {
      this.refreshing = Promise.resolve()
        .then(() => this.refreshToken!())
        .catch(() => null)
        .finally(() => { this.refreshing = null; });
    }
    return this.refreshing;
  }

  /** The token to send: refresh first if we have none, or if it's about to expire. */
  private async authToken(): Promise<string | null> {
    let token = await this.getToken();
    if (!token && this.refreshToken) token = await this.refresh();
    if (token && this.refreshToken) {
      const exp = this.expMs(token);
      if (exp !== null && exp - Date.now() <= this.skewMs) token = (await this.refresh()) ?? token;
    }
    return token;
  }

  private async req<T>(path: string, init: RequestInit = {}, auth = true): Promise<T> {
    const send = (token: string | null) => {
      const headers: Record<string, string> = { "Content-Type": "application/json", ...(init.headers as any) };
      if (auth) {
        if (!token) throw this.mkErr(401, "not authenticated");
        headers.Authorization = `Bearer ${token}`;
      }
      return fetch(`${this.baseUrl}${path}`, { ...init, headers });
    };

    let res = await send(auth ? await this.authToken() : null);

    // Reactive safety net: a 401 means the token is stale/revoked. Refresh once and
    // retry the request a single time (never loop). If refresh fails or the retry is
    // still 401, the session is dead -> notify so the app can route to login.
    if (res.status === 401 && auth && this.refreshToken) {
      const fresh = await this.refresh();
      if (fresh) res = await send(fresh);
      if (res.status === 401) this.onSessionExpired?.();
    }

    if (!res.ok) {
      const detail = await res.json().catch(() => ({}));
      throw this.mkErr(res.status, (detail as any).detail ?? res.statusText);
    }
    if (res.status === 204) return undefined as T;   // no-content (e.g. account deletion)
    return res.json() as Promise<T>;
  }

  // ---- public (no auth) ----
  /** PICK screen — coverage-curated grid of films to react to. */
  onboardingCatalog(limit = 28): Promise<CatalogItem[]> {
    return this.req(`/catalog/onboarding?limit=${limit}`, {}, false);
  }

  /** PICK screen — title search over the catalog ("find a film you love"). */
  searchCatalog(q: string, limit = 24): Promise<CatalogItem[]> {
    return this.req(`/catalog/search?q=${encodeURIComponent(q)}&limit=${limit}`, {}, false);
  }

  /** HOME — "Because you loved <film>" (item-to-item similarity). */
  similarToFilm(tmdbId: number, k = 10): Promise<MovieMatch[]> {
    return this.req(`/films/${tmdbId}/similar?k=${k}`, {}, false);
  }

  // ---- feedback (sharpens the fingerprint over time) ----
  /** Record an opinion on a film; returns the freshly recomputed fingerprint. */
  sendFeedback(tmdbId: number, signal: FeedbackSignal): Promise<FeedbackResponse> {
    return this.req(`/me/feedback`, {
      method: "POST",
      body: JSON.stringify({ tmdb_id: tmdbId, signal }),
    });
  }

  /** Undo an opinion (e.g. an accidental tap). */
  removeFeedback(tmdbId: number): Promise<FeedbackResponse> {
    return this.req(`/me/feedback/${tmdbId}`, { method: "DELETE" });
  }

  /** All current feedback signals for the user. */
  feedback(): Promise<{ tmdb_id: number; signal: FeedbackSignal }[]> {
    return this.req(`/me/feedback`);
  }

  // ---- authenticated ----
  /** REVEAL — derive a fingerprint from liked films and save the profile. */
  onboard(likedTmdbIds: number[], region = "US"): Promise<OnboardResponse> {
    return this.req(`/onboard`, {
      method: "POST",
      body: JSON.stringify({ liked_tmdb_ids: likedTmdbIds, region }),
    });
  }

  /** HOME (returning user) — the saved profile + fingerprint. 404 if not onboarded. */
  /** Permanently delete the user's account + all their data (App Store / Play requirement). */
  deleteAccount(): Promise<void> {
    return this.req(`/me`, { method: "DELETE" });
  }

  me(): Promise<UserResponse> {
    return this.req(`/me`);
  }

  /** Launch check. Call once a token is available: returns the saved profile if the
   *  user has onboarded, or null (the API's 404) if they still need to. Route on it —
   *  null -> onboarding, otherwise -> home. Other errors (401, network) rethrow. */
  async meOrNull(): Promise<UserResponse | null> {
    try {
      return await this.me();
    } catch (e) {
      if ((e as { status?: number }).status === 404) return null;
      throw e;
    }
  }

  /** REVEAL — persist a fine-tuned fingerprint. */
  fineTune(fingerprint: Fingerprint): Promise<UserResponse> {
    return this.req(`/me/fingerprint`, {
      method: "PATCH",
      body: JSON.stringify({ fingerprint }),
    });
  }

  /** HOME — recommendation shelves for the signed-in user. */
  recommendations(
    opts: {
      k?: number;
      onlyAvailable?: boolean;
      inTheatersOnly?: boolean;
      providers?: string[];
      offset?: number;
    } = {},
  ): Promise<RecommendResponse> {
    const q = new URLSearchParams();
    q.set("k", String(opts.k ?? 10));
    q.set("only_available", String(opts.onlyAvailable ?? true));
    q.set("in_theaters_only", String(opts.inTheatersOnly ?? false));
    q.set("offset", String(opts.offset ?? 0));
    for (const p of opts.providers ?? []) q.append("providers", p);
    return this.req(`/me/recommendations?${q.toString()}`);
  }

  /** Stateless matches — mood-adjusted home feed or live slider preview. */
  recommend(
    fingerprint: Fingerprint,
    opts: {
      k?: number;
      onlyAvailable?: boolean;
      excludeTmdbIds?: number[];
      inTheatersOnly?: boolean;
      providers?: string[];
      offset?: number;
    } = {},
  ): Promise<RecommendResponse> {
    return this.req(`/recommend`, {
      method: "POST",
      body: JSON.stringify({
        fingerprint,
        k: opts.k ?? 10,
        only_available: opts.onlyAvailable ?? true,
        exclude_tmdb_ids: opts.excludeTmdbIds ?? [],
        in_theaters_only: opts.inTheatersOnly ?? false,
        providers: opts.providers ?? [],
        offset: opts.offset ?? 0,
      }),
    });
  }
}
