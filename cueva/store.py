"""Postgres + pgvector persistence.

Fingerprints live in a VECTOR(7) column so "find similar films" is a single
indexed nearest-neighbour query (cosine distance via the `<=>` operator) rather
than something we compute in app code. We pass vectors as text literals and cast
`::vector` in SQL, so no extra Python adapter is required.
"""
from __future__ import annotations

import logging

import psycopg

from .config import get_settings
from .models import AXES, FilmRecord

log = logging.getLogger("cueva.store")


def _vec(values: list[float]) -> str:
    """Render a Python list as a pgvector literal, e.g. [10,1,2,7,8,4,2]."""
    return "[" + ",".join(str(v) for v in values) + "]"


def connect() -> psycopg.Connection:
    return psycopg.connect(get_settings().database_url, autocommit=True)


def already_scored(conn: psycopg.Connection, model_version: str) -> set[int]:
    """DB-as-checkpoint: films scored under the current model_version are 'done',
    so a re-run resumes instead of re-paying for work already completed."""
    with conn.cursor() as cur:
        cur.execute("SELECT tmdb_id FROM films WHERE model_version = %s", (model_version,))
        return {row[0] for row in cur.fetchall()}


_UPSERT = """
INSERT INTO films (
    tmdb_id, title, year, overview, poster_path, fingerprint,
    action, comedy, romance, scifi, adventure, drama, horror,
    rationale, in_theaters, providers, region, model_version, scored_at
) VALUES (
    %(tmdb_id)s, %(title)s, %(year)s, %(overview)s, %(poster_path)s, %(fingerprint)s::vector,
    %(action)s, %(comedy)s, %(romance)s, %(scifi)s, %(adventure)s, %(drama)s, %(horror)s,
    %(rationale)s, %(in_theaters)s, %(providers)s, %(region)s, %(model_version)s, %(scored_at)s
)
ON CONFLICT (tmdb_id) DO UPDATE SET
    title = EXCLUDED.title, year = EXCLUDED.year, overview = EXCLUDED.overview,
    poster_path = EXCLUDED.poster_path,
    fingerprint = EXCLUDED.fingerprint, rationale = EXCLUDED.rationale,
    action = EXCLUDED.action, comedy = EXCLUDED.comedy, romance = EXCLUDED.romance,
    scifi = EXCLUDED.scifi, adventure = EXCLUDED.adventure, drama = EXCLUDED.drama,
    horror = EXCLUDED.horror, in_theaters = EXCLUDED.in_theaters,
    providers = EXCLUDED.providers, region = EXCLUDED.region,
    model_version = EXCLUDED.model_version, scored_at = EXCLUDED.scored_at;
"""


def upsert(conn: psycopg.Connection, rec: FilmRecord) -> None:
    fp = rec.fingerprint
    params = {
        "tmdb_id": rec.tmdb_id, "title": rec.title, "year": rec.year,
        "overview": rec.overview, "poster_path": rec.poster_path,
        "fingerprint": _vec(fp.to_vector()),
        "action": fp.action, "comedy": fp.comedy, "romance": fp.romance,
        "scifi": fp.scifi, "adventure": fp.adventure, "drama": fp.drama,
        "horror": fp.horror, "rationale": rec.rationale,
        "in_theaters": rec.in_theaters, "providers": rec.providers,
        "region": rec.region, "model_version": rec.model_version,
        "scored_at": rec.scored_at,
    }
    with conn.cursor() as cur:
        cur.execute(_UPSERT, params)


def nearest(
    conn: psycopg.Connection,
    vector: list[float],
    k: int = 10,
    only_available: bool = True,
    exclude_ids: list[int] | None = None,
    in_theaters_only: bool = False,
    providers: list[str] | None = None,
    offset: int = 0,
):
    """The payoff: rank films by fingerprint similarity to `vector`.
    match = 1 - cosine_distance, so 1.0 is a perfect shape match.

    Filters (compose to power the home-screen shelves):
      exclude_ids       drop films the user already picked/saw
      in_theaters_only  only what's playing in cinemas
      providers         only films streamable on these services (array overlap)
      offset            skip the N closest matches -> a 'discovery' shelf that
                        escapes the filter bubble while staying on-taste
    """
    clauses = []
    if in_theaters_only:
        clauses.append("in_theaters")
    elif only_available:
        clauses.append("(in_theaters OR array_length(providers, 1) > 0)")
    if providers:
        clauses.append("providers && %(providers)s::text[]")
    if exclude_ids:
        clauses.append("tmdb_id <> ALL(%(exclude)s)")
    where = ("WHERE " + " AND ".join(clauses)) if clauses else ""
    sql = f"""
        SELECT tmdb_id, title, year, in_theaters, providers, poster_path,
               1 - (fingerprint <=> %(v)s::vector) AS match
        FROM films
        {where}
        ORDER BY fingerprint <=> %(v)s::vector
        OFFSET %(offset)s
        LIMIT %(k)s;
    """
    params: dict = {"v": _vec(vector), "k": k, "offset": offset}
    if exclude_ids:
        params["exclude"] = exclude_ids
    if providers:
        params["providers"] = providers
    with conn.cursor() as cur:
        cur.execute(sql, params)
        return cur.fetchall()


def film_fingerprint(conn: psycopg.Connection, tmdb_id: int) -> list[int] | None:
    """A single film's vector — used for item-to-item ('Because you loved…')."""
    cols = ", ".join(AXES)
    with conn.cursor() as cur:
        cur.execute(f"SELECT {cols} FROM films WHERE tmdb_id = %s", (tmdb_id,))
        row = cur.fetchone()
        return list(row) if row else None


def fingerprints_for(conn: psycopg.Connection, tmdb_ids: list[int]) -> list[tuple]:
    """Raw axis values for a set of films (used to derive a user fingerprint)."""
    cols = ", ".join(AXES)
    with conn.cursor() as cur:
        cur.execute(f"SELECT {cols} FROM films WHERE tmdb_id = ANY(%s)", (tmdb_ids,))
        return cur.fetchall()


def fingerprints_by_id(conn: psycopg.Connection, tmdb_ids: list[int]) -> dict[int, list[int]]:
    """Map tmdb_id -> axis vector. Used to apply feedback pulls per film."""
    if not tmdb_ids:
        return {}
    cols = ", ".join(AXES)
    with conn.cursor() as cur:
        cur.execute(f"SELECT tmdb_id, {cols} FROM films WHERE tmdb_id = ANY(%s)", (tmdb_ids,))
        return {row[0]: list(row[1:]) for row in cur.fetchall()}


def all_fingerprints(conn: psycopg.Connection) -> dict[int, list[int]]:
    """Whole catalog as tmdb_id -> vector. Used by the offline evaluator to rank."""
    cols = ", ".join(AXES)
    with conn.cursor() as cur:
        cur.execute(f"SELECT tmdb_id, {cols} FROM films")
        return {row[0]: list(row[1:]) for row in cur.fetchall()}
