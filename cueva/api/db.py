"""Pooled DB access for the API + user-profile persistence.

Users are keyed by `auth_subject` (the identity provider's stable `sub`), never
by a client-supplied id. A Cueva user row exists once a person has onboarded;
the row IS the profile, created/updated on onboarding.

Film reads/ranking reuse cueva.store (connection-agnostic); this module owns the
connection pool and the `users` table.
"""
from __future__ import annotations

from contextlib import contextmanager

from psycopg_pool import ConnectionPool

from ..config import get_settings
from ..models import AXES, Fingerprint

_pool: ConnectionPool | None = None


def pool() -> ConnectionPool:
    global _pool
    if _pool is None:
        s = get_settings()
        _pool = ConnectionPool(
            s.database_url,
            min_size=s.api_pool_min,
            max_size=s.api_pool_max,
            kwargs={"autocommit": True},
            open=True,
        )
    return _pool


@contextmanager
def conn():
    with pool().connection() as c:
        yield c


def _vec(values) -> str:
    return "[" + ",".join(str(v) for v in values) + "]"


_AXIS_COLS = ", ".join(AXES)
# canonical row shape returned everywhere: (id, *7 axes, liked_tmdb_ids, region, updated_at)
_RETURNING = f"id::text, {_AXIS_COLS}, liked_tmdb_ids, region, updated_at"


def upsert_user(c, auth_subject: str, fp: Fingerprint, liked_ids: list[int], region: str):
    """Create or update the profile for an authenticated subject (re-onboard safe)."""
    placeholders = ", ".join(["%s"] * len(AXES))
    set_axes = ", ".join(f"{a} = EXCLUDED.{a}" for a in AXES)
    sql = f"""
        INSERT INTO users (auth_subject, fingerprint, {_AXIS_COLS}, liked_tmdb_ids, region)
        VALUES (%s, %s::vector, {placeholders}, %s, %s)
        ON CONFLICT (auth_subject) DO UPDATE SET
            fingerprint = EXCLUDED.fingerprint, {set_axes},
            liked_tmdb_ids = EXCLUDED.liked_tmdb_ids, region = EXCLUDED.region,
            updated_at = now()
        RETURNING {_RETURNING};
    """
    params = [auth_subject, _vec(fp.to_vector()), *fp.to_vector(), liked_ids, region]
    with c.cursor() as cur:
        cur.execute(sql, params)
        return cur.fetchone()


def get_user_by_subject(c, auth_subject: str):
    with c.cursor() as cur:
        cur.execute(f"SELECT {_RETURNING} FROM users WHERE auth_subject = %s;", (auth_subject,))
        return cur.fetchone()


def update_fingerprint(c, auth_subject: str, fp: Fingerprint):
    """Persist a fine-tuned base fingerprint. Returns the row, or None if no profile."""
    set_axes = ", ".join(f"{a} = %s" for a in AXES)
    sql = f"""
        UPDATE users SET fingerprint = %s::vector, {set_axes}, updated_at = now()
        WHERE auth_subject = %s
        RETURNING {_RETURNING};
    """
    params = [_vec(fp.to_vector()), *fp.to_vector(), auth_subject]
    with c.cursor() as cur:
        cur.execute(sql, params)
        return cur.fetchone()


VALID_SIGNALS = ("love", "dislike", "seen", "hide")


def record_feedback(c, user_id: str, tmdb_id: int, signal: str) -> None:
    """Upsert the user's current opinion of a film (latest signal wins)."""
    with c.cursor() as cur:
        cur.execute(
            """INSERT INTO feedback_events (user_id, tmdb_id, signal)
               VALUES (%s, %s, %s)
               ON CONFLICT (user_id, tmdb_id)
               DO UPDATE SET signal = EXCLUDED.signal, created_at = now();""",
            (user_id, tmdb_id, signal),
        )


def delete_feedback(c, user_id: str, tmdb_id: int) -> int:
    with c.cursor() as cur:
        cur.execute(
            "DELETE FROM feedback_events WHERE user_id = %s AND tmdb_id = %s",
            (user_id, tmdb_id),
        )
        return cur.rowcount


def feedback_for(c, user_id: str) -> list[tuple]:
    """List of (tmdb_id, signal) for a user."""
    with c.cursor() as cur:
        cur.execute(
            "SELECT tmdb_id, signal FROM feedback_events WHERE user_id = %s", (user_id,)
        )
        return cur.fetchall()


def log_impressions(c, user_id: str, items: list[tuple]) -> None:
    """Record served recommendations for analytics. items: (tmdb_id, predicted_match,
    signal_count). Best-effort — callers should never let this break serving."""
    if not items:
        return
    with c.cursor() as cur:
        cur.executemany(
            """INSERT INTO recommendation_events (user_id, tmdb_id, predicted_match, signal_count)
               VALUES (%s, %s, %s, %s)""",
            [(user_id, t, m, sc) for (t, m, sc) in items],
        )
