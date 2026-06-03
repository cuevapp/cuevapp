"""Request/response models for the API. These are the DTOs the apps speak;
the internal Fingerprint model is reused directly so there's one definition of
the 7 axes everywhere.
"""
from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

from ..models import AXES, Fingerprint

LABELS = {
    "action": "Action", "comedy": "Comedy", "romance": "Romance", "scifi": "Sci-Fi",
    "adventure": "Adventure", "drama": "Drama", "horror": "Horror",
}


class AxisScore(BaseModel):
    axis: str
    label: str
    value: float


def top_axes(fp: Fingerprint, n: int = 3) -> list[AxisScore]:
    ranked = sorted(AXES, key=lambda a: getattr(fp, a), reverse=True)[:n]
    return [AxisScore(axis=a, label=LABELS[a], value=getattr(fp, a)) for a in ranked]


# ---- requests ----
class OnboardRequest(BaseModel):
    liked_tmdb_ids: list[int] = Field(min_length=1)
    region: str = "US"


class FineTuneRequest(BaseModel):
    fingerprint: Fingerprint


class RecommendRequest(BaseModel):
    fingerprint: Fingerprint
    k: int = Field(10, ge=1, le=50)
    only_available: bool = True
    exclude_tmdb_ids: list[int] = Field(default_factory=list)
    in_theaters_only: bool = False
    providers: list[str] = Field(default_factory=list)
    offset: int = Field(0, ge=0, le=200)


# ---- responses ----
class MovieMatch(BaseModel):
    tmdb_id: int
    title: str
    year: int | None
    poster_path: str | None = None   # TMDB poster path; client builds the image URL
    match: float          # cosine similarity, 0..1
    match_pct: int        # rounded for display
    in_theaters: bool
    providers: list[str]


class OnboardResponse(BaseModel):
    user_id: str
    fingerprint: Fingerprint
    top_axes: list[AxisScore]


class RecommendResponse(BaseModel):
    fingerprint: Fingerprint
    results: list[MovieMatch]


class UserResponse(BaseModel):
    user_id: str
    fingerprint: Fingerprint            # effective: base nudged by feedback
    base_fingerprint: Fingerprint       # the deliberate onboarding/fine-tuned taste
    liked_tmdb_ids: list[int]
    region: str
    top_axes: list[AxisScore]
    updated_at: datetime


class FeedbackRequest(BaseModel):
    tmdb_id: int
    signal: Literal["love", "dislike", "seen", "hide"]


class FeedbackItem(BaseModel):
    tmdb_id: int
    signal: str


class FeedbackResponse(BaseModel):
    fingerprint: Fingerprint            # effective, recomputed after this signal
    base_fingerprint: Fingerprint
    top_axes: list[AxisScore]
    feedback_count: int


class CatalogItem(BaseModel):
    tmdb_id: int
    title: str
    year: int | None
    poster_path: str | None = None
    dominant_axis: str
    fingerprint: Fingerprint
