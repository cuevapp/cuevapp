"""Typed data models. AXES is the single source of truth for axis order —
it must match the VECTOR(7) column order in schema.sql and the matching query.
"""
from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field

# The canonical 7-axis order. Change this in exactly ONE place if the taxonomy
# ever changes — but doing so means a full re-score (bump cueva_model_version).
AXES: tuple[str, ...] = (
    "action", "comedy", "romance", "scifi", "adventure", "drama", "horror",
)


class Fingerprint(BaseModel):
    action: int = Field(ge=0, le=10)
    comedy: int = Field(ge=0, le=10)
    romance: int = Field(ge=0, le=10)
    scifi: int = Field(ge=0, le=10)
    adventure: int = Field(ge=0, le=10)
    drama: int = Field(ge=0, le=10)
    horror: int = Field(ge=0, le=10)

    def to_vector(self) -> list[int]:
        """Return scores in canonical AXES order — the vector stored in pgvector."""
        return [getattr(self, axis) for axis in AXES]


class FilmInput(BaseModel):
    """Everything we feed the scorer for one film, plus availability metadata."""
    tmdb_id: int
    title: str
    year: int | None = None
    overview: str = ""
    poster_path: str | None = None
    reviews: list[str] = Field(default_factory=list)
    in_theaters: bool = False
    providers: list[str] = Field(default_factory=list)


class FilmRecord(BaseModel):
    """A fully scored film, ready to upsert into Postgres."""
    tmdb_id: int
    title: str
    year: int | None
    overview: str
    poster_path: str | None = None
    fingerprint: Fingerprint
    rationale: str = ""
    in_theaters: bool = False
    providers: list[str] = Field(default_factory=list)
    region: str
    model_version: str
    scored_at: datetime = Field(default_factory=datetime.utcnow)
