"""Async TMDB client — pulls the film catalog, synopses, reviews and availability.

Auth uses a TMDB v4 read access token (Bearer). Get one at
https://developer.themoviedb.org/docs/getting-started
"""
from __future__ import annotations

import asyncio
import logging

import httpx
from tenacity import retry, stop_after_attempt, wait_exponential

from .config import get_settings
from .models import FilmInput

log = logging.getLogger("cueva.tmdb")
BASE = "https://api.themoviedb.org/3"


class TMDBClient:
    def __init__(self) -> None:
        s = get_settings()
        self.region = s.cueva_region
        self._sem = asyncio.Semaphore(s.tmdb_concurrency)
        self._http = httpx.AsyncClient(
            base_url=BASE,
            headers={
                "Authorization": f"Bearer {s.tmdb_api_token}",
                "accept": "application/json",
            },
            timeout=20.0,
        )

    async def __aenter__(self) -> "TMDBClient":
        return self

    async def __aexit__(self, *exc) -> None:
        await self._http.aclose()

    @retry(stop=stop_after_attempt(4), wait=wait_exponential(min=1, max=10))
    async def _get(self, path: str, **params) -> dict:
        async with self._sem:
            r = await self._http.get(path, params=params)
            r.raise_for_status()
            return r.json()

    # ---- catalog discovery ----
    async def now_playing_ids(self, pages: int = 3) -> set[int]:
        ids: set[int] = set()
        for page in range(1, pages + 1):
            data = await self._get("/movie/now_playing", region=self.region, page=page)
            ids.update(m["id"] for m in data.get("results", []))
        return ids

    async def popular_ids(self, pages: int = 10) -> list[int]:
        ids: list[int] = []
        for page in range(1, pages + 1):
            data = await self._get("/movie/popular", region=self.region, page=page)
            ids.extend(m["id"] for m in data.get("results", []))
        return ids

    # ---- per-film enrichment ----
    async def _reviews(self, tmdb_id: int) -> list[str]:
        try:
            data = await self._get(f"/movie/{tmdb_id}/reviews", page=1)
            return [r["content"] for r in data.get("results", [])[:3]]
        except Exception:
            return []

    async def _providers(self, tmdb_id: int) -> list[str]:
        try:
            data = await self._get(f"/movie/{tmdb_id}/watch/providers")
            region = data.get("results", {}).get(self.region, {})
            return [p["provider_name"] for p in (region.get("flatrate") or [])]
        except Exception:
            return []

    async def build_input(self, tmdb_id: int, in_theaters: bool = False) -> FilmInput | None:
        """Fetch details + reviews + providers and assemble a FilmInput.
        Returns None when there's no synopsis to score against."""
        try:
            d = await self._get(f"/movie/{tmdb_id}")
        except Exception as e:
            log.warning("details failed for %s: %s", tmdb_id, e)
            return None
        if not d.get("overview"):
            return None

        reviews, providers = await asyncio.gather(
            self._reviews(tmdb_id), self._providers(tmdb_id)
        )
        rd = d.get("release_date") or ""
        year = int(rd[:4]) if rd[:4].isdigit() else None
        return FilmInput(
            tmdb_id=tmdb_id,
            title=d.get("title", "Untitled"),
            year=year,
            overview=d.get("overview", ""),
            poster_path=d.get("poster_path"),
            reviews=reviews,
            in_theaters=in_theaters,
            providers=providers,
        )
