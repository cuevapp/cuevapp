"""Cueva HTTP API.

Run locally:
    uvicorn cueva.api.app:app --reload

Auth: bearer JWT verified against the provider; user identified from the token
subject, so user routes are `/me/...` (no id in any URL -> no IDOR).

Fingerprint: a user's *base* (onboarding/fine-tuned) is stored; the *effective*
fingerprint is base + accumulated feedback, recomputed on read. Recommendations
use the effective vector and exclude anything the user has acted on.

CORS + rate limiting: see config / README.
"""
from __future__ import annotations

import hashlib
import hmac
import logging
import threading

from fastapi import Depends, FastAPI, Header, HTTPException, Query, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address

from ..config import get_settings
from ..models import AXES, Fingerprint
from . import auth, db, recommend, schemas

log = logging.getLogger("cueva.api")
settings = get_settings()

app = FastAPI(title="Cueva API", version="0.1.0")

# ---- CORS (tightened) ----
if "*" in settings.cors_origins_list:
    log.warning("CORS allows all origins ('*'). Set API_CORS_ORIGINS to your real origins before production.")
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=False,
    allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
    max_age=600,
)


# ---- rate limiting ----
def _rate_key(request: Request) -> str:
    authz = request.headers.get("authorization", "")
    if authz.lower().startswith("bearer "):
        return "user:" + hashlib.sha256(authz[7:].encode()).hexdigest()[:16]
    return "ip:" + get_remote_address(request)


limiter = Limiter(
    key_func=_rate_key,
    storage_uri=settings.rate_limit_storage_uri,
    enabled=settings.rate_limit_enabled,
)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

_bearer = HTTPBearer(auto_error=True)


def current_subject(creds: HTTPAuthorizationCredentials = Depends(_bearer)) -> auth.Claims:
    return auth.verify(creds.credentials)


# ---- helpers ----
def _fp_from_axes(values) -> Fingerprint:
    return Fingerprint(**dict(zip(AXES, values)))


def _match(r: dict) -> schemas.MovieMatch:
    return schemas.MovieMatch(
        tmdb_id=r["tmdb_id"], title=r["title"], year=r["year"],
        poster_path=r.get("poster_path"),
        match=r["match"], match_pct=round(r["match"] * 100),
        in_theaters=r["in_theaters"], providers=r["providers"],
    )


def _user_response(c, row: tuple) -> schemas.UserResponse:
    base = _fp_from_axes(row[1:8])
    fb = db.feedback_for(c, row[0])
    eff = recommend.effective_fingerprint(c, base, fb)
    return schemas.UserResponse(
        user_id=row[0], fingerprint=eff, base_fingerprint=base,
        liked_tmdb_ids=row[8], region=row[9],
        top_axes=schemas.top_axes(eff), updated_at=row[10],
    )


_NOT_ONBOARDED = "No Cueva profile yet — complete onboarding."


# ---- health ----
@app.get("/healthz")
def healthz() -> dict:
    return {"status": "ok"}


# ---- public catalog ----
@app.get("/catalog/onboarding", response_model=list[schemas.CatalogItem])
@limiter.limit(settings.rate_limit_public)
def onboarding_catalog(request: Request, limit: int = Query(28, ge=6, le=100)):
    with db.conn() as c:
        items = recommend.onboarding_catalog(c, limit)
    return [
        schemas.CatalogItem(
            tmdb_id=i["tmdb_id"], title=i["title"], year=i["year"],
            poster_path=i.get("poster_path"),
            dominant_axis=i["dominant_axis"], fingerprint=Fingerprint(**i["fingerprint"]),
        )
        for i in items
    ]


@app.get("/catalog/search", response_model=list[schemas.CatalogItem])
@limiter.limit(settings.rate_limit_public)
def catalog_search(request: Request, q: str = Query(..., min_length=1, max_length=80), limit: int = Query(24, ge=1, le=50)):
    with db.conn() as c:
        items = recommend.search_catalog(c, q, limit)
    return [
        schemas.CatalogItem(
            tmdb_id=i["tmdb_id"], title=i["title"], year=i["year"],
            poster_path=i.get("poster_path"), dominant_axis=i["dominant_axis"],
            fingerprint=Fingerprint(**i["fingerprint"]),
        )
        for i in items
    ]


@app.get("/films/{tmdb_id}/similar", response_model=list[schemas.MovieMatch])
@limiter.limit(settings.rate_limit_public)
def similar_films(request: Request, tmdb_id: int, k: int = Query(10, ge=1, le=50)):
    with db.conn() as c:
        results = recommend.similar_to_film(c, tmdb_id, k=k)
    if results is None:
        raise HTTPException(404, "Film not found or not scored.")
    return [_match(r) for r in results]


# ---- authenticated, user-scoped ----
@app.post("/onboard", response_model=schemas.OnboardResponse)
@limiter.limit(settings.rate_limit_write)
def onboard(request: Request, req: schemas.OnboardRequest, claims: auth.Claims = Depends(current_subject)):
    with db.conn() as c:
        fp = recommend.fingerprint_from_likes(c, req.liked_tmdb_ids)
        if fp is None:
            raise HTTPException(422, "None of those films have been scored yet.")
        row = db.upsert_user(c, claims.subject, fp, req.liked_tmdb_ids, req.region)
    return schemas.OnboardResponse(user_id=row[0], fingerprint=fp, top_axes=schemas.top_axes(fp))


@app.get("/me", response_model=schemas.UserResponse)
@limiter.limit(settings.rate_limit_read)
def me(request: Request, claims: auth.Claims = Depends(current_subject)):
    with db.conn() as c:
        row = db.get_user_by_subject(c, claims.subject)
        if row is None:
            raise HTTPException(404, _NOT_ONBOARDED)
        return _user_response(c, row)


@app.delete("/me", status_code=204)
@limiter.limit(settings.rate_limit_write)
def delete_me(request: Request, claims: auth.Claims = Depends(current_subject)):
    """Delete the authenticated user's account and all their data (profile, feedback,
    impressions). Idempotent. Required for App Store / Play Store account-deletion policy.
    Note: this removes the Cueva-side data; deleting the identity at the auth provider
    (Auth0) additionally requires the provider's Management API (see MOBILE.md)."""
    with db.conn() as c:
        db.delete_user(c, claims.subject)
    return Response(status_code=204)


@app.patch("/me/fingerprint", response_model=schemas.UserResponse)
@limiter.limit(settings.rate_limit_write)
def fine_tune(request: Request, req: schemas.FineTuneRequest, claims: auth.Claims = Depends(current_subject)):
    with db.conn() as c:
        row = db.update_fingerprint(c, claims.subject, req.fingerprint)
        if row is None:
            raise HTTPException(404, _NOT_ONBOARDED)
        return _user_response(c, row)


@app.get("/me/recommendations", response_model=schemas.RecommendResponse)
@limiter.limit(settings.rate_limit_read)
def my_recommendations(
    request: Request,
    claims: auth.Claims = Depends(current_subject),
    k: int = Query(10, ge=1, le=50),
    only_available: bool = True,
    in_theaters_only: bool = False,
    providers: list[str] = Query(default=[]),
    offset: int = Query(0, ge=0, le=200),
):
    with db.conn() as c:
        row = db.get_user_by_subject(c, claims.subject)
        if row is None:
            raise HTTPException(404, _NOT_ONBOARDED)
        base = _fp_from_axes(row[1:8])
        fb = db.feedback_for(c, row[0])
        eff = recommend.effective_fingerprint(c, base, fb)
        # don't recommend anything the user picked at onboarding or has acted on
        exclude = list({*row[8], *(tmdb_id for tmdb_id, _ in fb)})
        results = recommend.recommend(
            c, eff, k=k, only_available=only_available, exclude_ids=exclude or None,
            in_theaters_only=in_theaters_only, providers=providers or None, offset=offset,
        )
        if settings.analytics_enabled:
            try:  # impression logging must never break serving
                db.log_impressions(c, row[0], [(r["tmdb_id"], r["match"], len(fb)) for r in results])
            except Exception:
                log.exception("impression logging failed")
    return schemas.RecommendResponse(fingerprint=eff, results=[_match(r) for r in results])


@app.post("/recommend", response_model=schemas.RecommendResponse)
@limiter.limit(settings.rate_limit_read)
def recommend_adhoc(request: Request, req: schemas.RecommendRequest, claims: auth.Claims = Depends(current_subject)):
    with db.conn() as c:
        results = recommend.recommend(
            c, req.fingerprint, k=req.k, only_available=req.only_available,
            exclude_ids=req.exclude_tmdb_ids or None,
            in_theaters_only=req.in_theaters_only,
            providers=req.providers or None, offset=req.offset,
        )
    return schemas.RecommendResponse(fingerprint=req.fingerprint, results=[_match(r) for r in results])


# ---- feedback (sharpens the fingerprint over time) ----
def _feedback_response(c, row: tuple) -> schemas.FeedbackResponse:
    base = _fp_from_axes(row[1:8])
    fb = db.feedback_for(c, row[0])
    eff = recommend.effective_fingerprint(c, base, fb)
    return schemas.FeedbackResponse(
        fingerprint=eff, base_fingerprint=base,
        top_axes=schemas.top_axes(eff), feedback_count=len(fb),
    )


@app.post("/me/feedback", response_model=schemas.FeedbackResponse)
@limiter.limit(settings.rate_limit_write)
def add_feedback(request: Request, req: schemas.FeedbackRequest, claims: auth.Claims = Depends(current_subject)):
    with db.conn() as c:
        row = db.get_user_by_subject(c, claims.subject)
        if row is None:
            raise HTTPException(404, _NOT_ONBOARDED)
        db.record_feedback(c, row[0], req.tmdb_id, req.signal)
        return _feedback_response(c, row)


@app.delete("/me/feedback/{tmdb_id}", response_model=schemas.FeedbackResponse)
@limiter.limit(settings.rate_limit_write)
def remove_feedback(request: Request, tmdb_id: int, claims: auth.Claims = Depends(current_subject)):
    with db.conn() as c:
        row = db.get_user_by_subject(c, claims.subject)
        if row is None:
            raise HTTPException(404, _NOT_ONBOARDED)
        db.delete_feedback(c, row[0], tmdb_id)
        return _feedback_response(c, row)


@app.get("/me/feedback", response_model=list[schemas.FeedbackItem])
@limiter.limit(settings.rate_limit_read)
def list_feedback(request: Request, claims: auth.Claims = Depends(current_subject)):
    with db.conn() as c:
        row = db.get_user_by_subject(c, claims.subject)
        if row is None:
            raise HTTPException(404, _NOT_ONBOARDED)
        return [schemas.FeedbackItem(tmdb_id=t, signal=s) for t, s in db.feedback_for(c, row[0])]


# ---- scheduled catalog refresh (called by an external timezone-aware scheduler) ----
# An external scheduler (e.g. cron-job.org set to America/Los_Angeles, so it's DST-safe) POSTs
# here with the shared X-Cron-Token. We kick off `cueva.cli update` in a background thread and
# return immediately, so the scheduler's HTTP call doesn't wait on the (minute-ish) scoring run.
_refresh_lock = threading.Lock()


def _run_refresh(limit: int) -> None:
    try:
        from ..pipeline import backfill  # lazy import: pulls in scorer/tmdb only when refreshing
        backfill(limit=limit, mode="live")
    except Exception:
        log.exception("scheduled catalog refresh failed")
    finally:
        _refresh_lock.release()


@app.post("/internal/refresh-catalog", status_code=202)
def refresh_catalog(
    request: Request,
    x_cron_token: str = Header(default=""),
    limit: int = Query(150, ge=1, le=1000),
):
    if not settings.cron_trigger_token:
        raise HTTPException(404, "Not found")          # disabled unless CRON_TRIGGER_TOKEN is set
    if not hmac.compare_digest(x_cron_token, settings.cron_trigger_token):
        raise HTTPException(403, "Invalid cron token")
    if not _refresh_lock.acquire(blocking=False):
        return {"status": "already running"}           # dedupe overlapping triggers
    threading.Thread(target=_run_refresh, args=(limit,), daemon=True).start()
    return {"status": "started", "limit": limit}
