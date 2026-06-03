"""Fingerprint scoring against Claude.

Two paths share one prompt + one parser:
  * LiveScorer  - concurrent Messages API calls; for the daily "new in theaters"
                  trickle where you want results now.
  * BatchScorer - Message Batches API; for the initial catalog backfill. ~50%
                  cheaper, up to 10k requests/batch, finishes within 24h.
                  Docs: https://docs.claude.com/en/docs/build-with-claude/batch-processing
"""
from __future__ import annotations

import asyncio
import json
import logging
import time

from anthropic import Anthropic, AsyncAnthropic
from anthropic.types.message_create_params import MessageCreateParamsNonStreaming
from anthropic.types.messages.batch_create_params import Request
from tenacity import retry, stop_after_attempt, wait_exponential

from .config import Settings, get_settings
from .models import Fingerprint, FilmInput
from .prompts import SYSTEM_PROMPT, build_user_prompt

log = logging.getLogger("cueva.scorer")

Scored = tuple[Fingerprint, str]  # (fingerprint, rationale)


def _parse(text: str) -> Scored:
    """Strict-ish JSON extraction + schema validation. Raises on anything off."""
    cleaned = text.replace("```json", "").replace("```", "").strip()
    start, end = cleaned.find("{"), cleaned.rfind("}")
    if start == -1 or end == -1:
        raise ValueError("no JSON object in model response")
    obj = json.loads(cleaned[start : end + 1])
    return Fingerprint(**obj["scores"]), obj.get("rationale", "")


def _params(film: FilmInput, s: Settings) -> dict:
    return {
        "model": s.cueva_model,
        "max_tokens": s.cueva_max_tokens,
        "temperature": 0,  # determinism: same synopsis -> same fingerprint
        "system": SYSTEM_PROMPT,
        "messages": [{"role": "user", "content": build_user_prompt(film)}],
    }


class LiveScorer:
    """Concurrent, real-time scoring. Use for incremental updates."""

    def __init__(self) -> None:
        self.s = get_settings()
        self._client = AsyncAnthropic(api_key=self.s.anthropic_api_key)
        self._sem = asyncio.Semaphore(self.s.anthropic_concurrency)

    @retry(stop=stop_after_attempt(4), wait=wait_exponential(min=2, max=30))
    async def score(self, film: FilmInput) -> Scored:
        async with self._sem:
            msg = await self._client.messages.create(**_params(film, self.s))
        text = "".join(b.text for b in msg.content if b.type == "text")
        return _parse(text)


class BatchScorer:
    """Asynchronous bulk scoring at ~half the cost. Use for the backfill."""

    def __init__(self) -> None:
        self.s = get_settings()
        self._client = Anthropic(api_key=self.s.anthropic_api_key)

    def submit(self, films: list[FilmInput]) -> str:
        """Submit up to 10k films; custom_id is the tmdb_id so we can map back."""
        requests = [
            Request(
                custom_id=str(f.tmdb_id),
                params=MessageCreateParamsNonStreaming(**_params(f, self.s)),
            )
            for f in films
        ]
        batch = self._client.messages.batches.create(requests=requests)
        log.info("submitted batch %s (%d requests)", batch.id, len(requests))
        return batch.id

    def wait(self, batch_id: str, poll_seconds: int = 60) -> None:
        while True:
            b = self._client.messages.batches.retrieve(batch_id)
            if b.processing_status == "ended":
                log.info("batch %s ended: %s", batch_id, b.request_counts)
                return
            log.info("batch %s processing… %s", batch_id, b.request_counts)
            time.sleep(poll_seconds)

    def collect(self, batch_id: str) -> dict[int, Scored]:
        """Stream results; tmdb_id -> (Fingerprint, rationale) for successes only."""
        out: dict[int, Scored] = {}
        for r in self._client.messages.batches.results(batch_id):
            if r.result.type != "succeeded":
                log.warning("request %s did not succeed: %s", r.custom_id, r.result.type)
                continue
            text = "".join(b.text for b in r.result.message.content if b.type == "text")
            try:
                out[int(r.custom_id)] = _parse(text)
            except Exception as e:  # one bad film shouldn't sink the batch
                log.warning("unparseable result for %s: %s", r.custom_id, e)
        return out
