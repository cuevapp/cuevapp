"""Recommendation logic. Thin layer over cueva.store so the API and the CLI
share exactly one definition of 'similar'.
"""
from __future__ import annotations

from .. import store
from ..models import AXES, Fingerprint


def fingerprint_from_likes(c, liked_tmdb_ids: list[int]) -> Fingerprint | None:
    """Average the fingerprints of films the user loves -> their base fingerprint.
    Returns None if none of the films have been scored yet."""
    rows = store.fingerprints_for(c, liked_tmdb_ids)
    if not rows:
        return None
    averaged = [round(sum(col) / len(rows)) for col in zip(*rows)]
    return Fingerprint(**dict(zip(AXES, averaged)))


# Signed learning rates per signal. Tune by feel. `seen` is exclude-only (no nudge).
# Dislikes are noisier than loves (you can dislike a great film for off-genre reasons),
# so they carry less weight. Tunable / recompute-safe because steps are measured from base.
FEEDBACK_WEIGHTS = {"love": 0.25, "dislike": -0.18, "hide": -0.12, "seen": 0.0}


def apply_feedback_vec(base_vec: list, feedback: list[tuple], film_vecs: dict, weights: dict | None = None) -> list[int]:
    """Pure form of the update rule (no DB): each signal moves the vector a bounded
    step measured *from base* toward (love) or away from (dislike/hide) the film. Shared
    by the live API and the offline evaluator so 'effective fingerprint' means one thing."""
    weights = weights or FEEDBACK_WEIGHTS
    eff = [float(x) for x in base_vec]
    for tmdb_id, signal in feedback:
        w = weights.get(signal, 0.0)
        film = film_vecs.get(tmdb_id)
        if not w or film is None:
            continue
        for i in range(len(AXES)):
            eff[i] += w * (film[i] - base_vec[i])
    return [max(0, min(10, round(x))) for x in eff]


def effective_fingerprint(c, base: Fingerprint, feedback: list[tuple]) -> Fingerprint:
    """The fingerprint we recommend against: the onboarding base nudged by feedback.
    Order-independent and recomputable from base + events (see apply_feedback_vec)."""
    if not feedback:
        return base
    vecs = store.fingerprints_by_id(c, [tmdb_id for tmdb_id, _ in feedback])
    eff = apply_feedback_vec(base.to_vector(), feedback, vecs)
    return Fingerprint(**dict(zip(AXES, eff)))


def recommend(
    c,
    fp: Fingerprint,
    k: int = 10,
    only_available: bool = True,
    exclude_ids: list[int] | None = None,
    in_theaters_only: bool = False,
    providers: list[str] | None = None,
    offset: int = 0,
) -> list[dict]:
    rows = store.nearest(
        c, fp.to_vector(), k=k, only_available=only_available, exclude_ids=exclude_ids,
        in_theaters_only=in_theaters_only, providers=providers, offset=offset,
    )
    return [
        {
            "tmdb_id": r[0], "title": r[1], "year": r[2],
            "in_theaters": r[3], "providers": r[4], "poster_path": r[5], "match": float(r[6]),
        }
        for r in rows
    ]


def similar_to_film(c, tmdb_id: int, k: int = 10) -> list[dict] | None:
    """Item-to-item: films whose fingerprint resembles a given film's.
    Powers the 'Because you loved <film>' shelf. None if the film isn't scored."""
    vec = store.film_fingerprint(c, tmdb_id)
    if vec is None:
        return None
    rows = store.nearest(c, vec, k=k, exclude_ids=[tmdb_id])
    return [
        {
            "tmdb_id": r[0], "title": r[1], "year": r[2],
            "in_theaters": r[3], "providers": r[4], "poster_path": r[5], "match": float(r[6]),
        }
        for r in rows
    ]


def onboarding_catalog(c, limit: int = 28) -> list[dict]:
    """Films for the 'pick what you love' screen, balanced for genre COVERAGE
    rather than raw popularity: bucket by dominant axis, then round-robin so
    every taste profile finds something to react to."""
    cols = ", ".join(AXES)
    with c.cursor() as cur:
        cur.execute(f"SELECT tmdb_id, title, year, poster_path, {cols} FROM films;")
        rows = cur.fetchall()

    buckets: dict[str, list[dict]] = {a: [] for a in AXES}
    for tmdb_id, title, year, poster_path, *vals in rows:
        fp = dict(zip(AXES, vals))
        dominant = max(AXES, key=lambda a: fp[a])
        buckets[dominant].append(
            {"tmdb_id": tmdb_id, "title": title, "year": year, "poster_path": poster_path,
             "dominant_axis": dominant, "fingerprint": fp}
        )
    # within each bucket, strongest exemplar first
    for a in AXES:
        buckets[a].sort(key=lambda item: item["fingerprint"][a], reverse=True)

    out: list[dict] = []
    i = 0
    while len(out) < limit and any(buckets[a] for a in AXES):
        axis = AXES[i % len(AXES)]
        if buckets[axis]:
            out.append(buckets[axis].pop(0))
        i += 1
    return out[:limit]
