"""Orchestration: tie TMDB -> scorer -> store together into runnable jobs."""
from __future__ import annotations

import asyncio
import logging
from datetime import datetime

from . import store
from .config import Settings, get_settings
from .models import Fingerprint, FilmInput, FilmRecord
from .scorer import BatchScorer, LiveScorer
from .tmdb import TMDBClient

log = logging.getLogger("cueva.pipeline")

BATCH_CAP = 10_000  # Message Batches API hard limit per batch


async def gather_inputs(limit: int) -> list[FilmInput]:
    """Collect candidate films (now-playing first, then popular) and enrich them."""
    async with TMDBClient() as tmdb:
        theater_ids = await tmdb.now_playing_ids(pages=3)
        popular = await tmdb.popular_ids(pages=max(1, limit // 20 + 1))

        seen: set[int] = set()
        queue: list[tuple[int, bool]] = []
        for tid in list(theater_ids) + popular:
            if tid in seen:
                continue
            seen.add(tid)
            queue.append((tid, tid in theater_ids))
            if len(queue) >= limit:
                break

        enriched = await asyncio.gather(
            *(tmdb.build_input(tid, in_theaters) for tid, in_theaters in queue)
        )
    return [f for f in enriched if f is not None]


def _record(film: FilmInput, fp: Fingerprint, rationale: str, s: Settings) -> FilmRecord:
    return FilmRecord(
        tmdb_id=film.tmdb_id, title=film.title, year=film.year, overview=film.overview,
        poster_path=film.poster_path,
        fingerprint=fp, rationale=rationale, in_theaters=film.in_theaters,
        providers=film.providers, region=s.cueva_region,
        model_version=s.cueva_model_version, scored_at=datetime.utcnow(),
    )


def backfill(limit: int = 500, mode: str = "batch") -> None:
    """Score the catalog. Resumable: anything already scored under the current
    model_version is skipped, so you can re-run freely after an interruption."""
    s = get_settings()
    conn = store.connect()

    done = store.already_scored(conn, s.cueva_model_version)
    inputs = asyncio.run(gather_inputs(limit))
    todo = [f for f in inputs if f.tmdb_id not in done]
    log.info("candidates=%d already_scored=%d to_score=%d", len(inputs), len(done), len(todo))
    if not todo:
        return

    if mode == "batch":
        scorer = BatchScorer()
        by_id = {f.tmdb_id: f for f in todo}
        for start in range(0, len(todo), BATCH_CAP):
            chunk = todo[start : start + BATCH_CAP]
            batch_id = scorer.submit(chunk)
            scorer.wait(batch_id)
            for tmdb_id, (fp, rationale) in scorer.collect(batch_id).items():
                store.upsert(conn, _record(by_id[tmdb_id], fp, rationale, s))
    else:  # live
        scorer = LiveScorer()

        async def run() -> None:
            async def one(f: FilmInput) -> None:
                try:
                    fp, rationale = await scorer.score(f)
                    store.upsert(conn, _record(f, fp, rationale, s))  # sync write; fine at trickle scale
                except Exception as e:
                    log.warning("scoring failed for %s (%s): %s", f.tmdb_id, f.title, e)

            await asyncio.gather(*(one(f) for f in todo))

        asyncio.run(run())

    log.info("backfill complete (mode=%s)", mode)


def match_by_films(liked_tmdb_ids: list[int], k: int = 10):
    """Derive a user fingerprint by averaging the fingerprints of films they love,
    then return the nearest available films. This is the real onboarding path."""
    conn = store.connect()
    rows = store.fingerprints_for(conn, liked_tmdb_ids)
    if not rows:
        log.warning("none of those films are scored yet: %s", liked_tmdb_ids)
        return []
    user_vector = [sum(col) / len(rows) for col in zip(*rows)]
    return store.nearest(conn, user_vector, k=k)
