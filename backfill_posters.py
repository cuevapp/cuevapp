"""Backfill poster_path for films already in the catalog.

The main backfill skips already-scored rows, so it won't fill a newly-added
column on existing films. This script fetches *only* poster_path from TMDB (no
Anthropic calls, so it's free) and updates each row. Idempotent and resumable —
re-run anytime; it just rewrites the same paths.

    python backfill_posters.py
"""
from __future__ import annotations

import asyncio

import httpx
import psycopg

from cueva.config import get_settings


async def main() -> None:
    s = get_settings()
    conn = psycopg.connect(s.database_url, autocommit=True)
    ids = [r[0] for r in conn.execute("SELECT tmdb_id FROM films").fetchall()]
    print(f"fetching posters for {len(ids)} films…")

    sem = asyncio.Semaphore(s.tmdb_concurrency)
    results: dict[int, str | None] = {}

    async with httpx.AsyncClient(
        base_url="https://api.themoviedb.org/3",
        headers={"Authorization": f"Bearer {s.tmdb_api_token}", "accept": "application/json"},
        timeout=20.0,
    ) as c:
        async def one(tmdb_id: int) -> None:
            async with sem:
                try:
                    r = await c.get(f"/movie/{tmdb_id}")
                    r.raise_for_status()
                    results[tmdb_id] = r.json().get("poster_path")
                except Exception:
                    results[tmdb_id] = None

        await asyncio.gather(*(one(i) for i in ids))

    updated = 0
    with conn.cursor() as cur:
        for tmdb_id, poster_path in results.items():
            if poster_path:
                cur.execute(
                    "UPDATE films SET poster_path = %s WHERE tmdb_id = %s",
                    (poster_path, tmdb_id),
                )
                updated += 1
    conn.close()
    print(f"updated {updated}/{len(ids)} films with a poster_path "
          f"({len(ids) - updated} had none).")


if __name__ == "__main__":
    asyncio.run(main())
