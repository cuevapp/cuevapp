"""Token verification.

Cueva does NOT manage passwords or sessions — it only verifies the signed JWT
that the identity provider issued to the client, then trusts the `sub` claim as
the user's stable identity. Verification checks signature (against the provider's
rotating public keys via JWKS), issuer, audience, and expiry.
"""
from __future__ import annotations

from dataclasses import dataclass

import jwt
from fastapi import HTTPException, status

from ..config import get_settings


@dataclass
class Claims:
    subject: str
    email: str | None = None


# PyJWKClient fetches and caches the provider's signing keys, and refreshes when
# it sees an unknown key id (handles key rotation transparently).
_jwk_client: jwt.PyJWKClient | None = None


def _client(jwks_url: str) -> jwt.PyJWKClient:
    global _jwk_client
    if _jwk_client is None:
        _jwk_client = jwt.PyJWKClient(jwks_url)
    return _jwk_client


def verify(token: str) -> Claims:
    s = get_settings()

    # DEV ONLY escape hatch so the API is usable before a provider is wired up.
    # Gated behind an explicit env flag; must never be enabled in production.
    if s.auth_dev_mode and token.startswith("dev:"):
        return Claims(subject=token[4:] or "dev-user", email="dev@cueva.local")

    if not s.auth_issuer or not s.auth_audience:
        raise HTTPException(
            status.HTTP_500_INTERNAL_SERVER_ERROR,
            "Auth is not configured (set AUTH_ISSUER and AUTH_AUDIENCE).",
        )

    try:
        signing_key = _client(s.jwks_url).get_signing_key_from_jwt(token)
        payload = jwt.decode(
            token,
            signing_key.key,
            algorithms=s.algorithms_list,
            audience=s.auth_audience,
            issuer=s.auth_issuer,
            options={"require": ["exp", "iss", "aud", "sub"]},
        )
    except jwt.PyJWTError as e:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, f"Invalid token: {e}")

    return Claims(subject=payload["sub"], email=payload.get("email"))
