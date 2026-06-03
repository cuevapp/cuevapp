"""Configuration, loaded from environment / .env.

Settings are constructed lazily via get_settings() so importing the package
never fails just because credentials aren't present (e.g. in CI / tests).
"""
from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # --- credentials ---
    tmdb_api_token: str            # TMDB v4 read access token (Bearer)
    anthropic_api_key: str
    database_url: str              # postgresql://user:pass@host:5432/cueva

    # --- scoring ---
    # Model used to score fingerprints. A mid-tier model is the sweet spot for
    # cost vs. quality at catalog scale; bump for re-scoring experiments.
    # Verify current model strings at https://docs.claude.com/en/docs/about-claude/models
    cueva_model: str = "claude-sonnet-4-6"
    # Tag stamped onto every scored row. BUMP THIS to force a re-score (e.g. when
    # you change the prompt, the model, or add an axis) — the pipeline treats any
    # row with a different model_version as "not yet scored".
    cueva_model_version: str = "fp-v1-sonnet46"
    cueva_max_tokens: int = 400    # the JSON fingerprint is tiny
    cueva_region: str = "US"       # ISO-3166-1; drives availability + which films

    # --- throughput ---
    tmdb_concurrency: int = 16
    anthropic_concurrency: int = 8  # for the live path only; batch path is server-side

    # --- API ---
    api_pool_min: int = 1
    api_pool_max: int = 10
    # CORS: explicit allowlist (comma-separated). Defaults to common dev origins;
    # set this to your real web/app origins in production. Avoid "*".
    api_cors_origins: str = "http://localhost:3000,http://localhost:8081"

    # --- rate limiting ---
    rate_limit_enabled: bool = True
    rate_limit_storage_uri: str = "memory://"  # use redis://host:6379 in prod (shared across instances)
    rate_limit_public: str = "60/minute"   # per-IP, unauthenticated catalog reads
    rate_limit_read: str = "120/minute"    # per-user reads (home / recommendations)
    rate_limit_write: str = "20/minute"    # per-user writes (onboard, fine-tune)

    # --- analytics ---
    analytics_enabled: bool = True  # log recommendation impressions for measuring lift

    # --- auth (OIDC / JWT via your identity provider: Auth0, Clerk, Cognito, …) ---
    auth_issuer: str = ""        # e.g. https://your-tenant.us.auth0.com/
    auth_audience: str = ""      # the API identifier configured at the provider
    auth_jwks_url: str = ""      # optional override; derived from issuer if blank
    auth_algorithms: str = "RS256"
    auth_dev_mode: bool = False  # DEV ONLY: accept "dev:<subject>" tokens. NEVER true in prod.

    # --- scheduled refresh trigger ---
    # Shared secret an external timezone-aware scheduler (e.g. cron-job.org) sends in the
    # X-Cron-Token header to kick off a catalog refresh. Empty = the trigger endpoint is disabled.
    cron_trigger_token: str = ""

    @property
    def jwks_url(self) -> str:
        if self.auth_jwks_url:
            return self.auth_jwks_url
        return self.auth_issuer.rstrip("/") + "/.well-known/jwks.json"

    @property
    def algorithms_list(self) -> list[str]:
        return [a.strip() for a in self.auth_algorithms.split(",") if a.strip()]

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.api_cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]
