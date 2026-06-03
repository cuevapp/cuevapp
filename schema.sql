-- Cueva catalog schema. Requires the pgvector extension.
-- Run once:  psql "$DATABASE_URL" -f schema.sql

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS films (
    tmdb_id       INTEGER PRIMARY KEY,
    title         TEXT NOT NULL,
    year          INTEGER,
    overview      TEXT,
    poster_path   TEXT,          -- TMDB poster path, e.g. /abc.jpg (NULL if none)

    -- the fingerprint as a 7-d vector (axis order = cueva.models.AXES)
    fingerprint   VECTOR(7) NOT NULL,

    -- denormalized axes for transparency, debugging and filtering
    action        SMALLINT,
    comedy        SMALLINT,
    romance       SMALLINT,
    scifi         SMALLINT,
    adventure     SMALLINT,
    drama         SMALLINT,
    horror        SMALLINT,

    rationale     TEXT,

    -- availability
    in_theaters   BOOLEAN NOT NULL DEFAULT FALSE,
    providers     TEXT[]  NOT NULL DEFAULT '{}',
    region        TEXT    NOT NULL DEFAULT 'US',

    -- provenance: lets us re-score safely and audit which model produced what
    model_version TEXT        NOT NULL,
    scored_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Approximate nearest-neighbour index for cosine similarity.
-- This is what makes "find similar fingerprints" an indexed query, not a table scan.
CREATE INDEX IF NOT EXISTS films_fingerprint_hnsw
    ON films USING hnsw (fingerprint vector_cosine_ops);

CREATE INDEX IF NOT EXISTS films_in_theaters_idx ON films (in_theaters);
CREATE INDEX IF NOT EXISTS films_model_version_idx ON films (model_version);


-- ---------------------------------------------------------------------------
-- Users: a saved fingerprint per person, produced at onboarding and tunable.
-- ---------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS pgcrypto;  -- for gen_random_uuid()

CREATE TABLE IF NOT EXISTS users (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    auth_subject   TEXT NOT NULL UNIQUE,   -- stable subject ('sub') from the identity provider
    fingerprint    VECTOR(7) NOT NULL,
    -- denormalized axes (source of truth for reads; vector mirrors them)
    action SMALLINT, comedy SMALLINT, romance SMALLINT, scifi SMALLINT,
    adventure SMALLINT, drama SMALLINT, horror SMALLINT,
    liked_tmdb_ids INTEGER[] NOT NULL DEFAULT '{}',
    region         TEXT NOT NULL DEFAULT 'US',
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);


-- ---------------------------------------------------------------------------
-- Feedback: one current signal per (user, film). The effective fingerprint is
-- recomputed from the onboarding base + these events, so it stays replayable.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS feedback_events (
    user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    tmdb_id    INTEGER NOT NULL,
    signal     TEXT NOT NULL CHECK (signal IN ('love','dislike','seen','hide')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, tmdb_id)   -- latest opinion per film; upsert to change it
);

CREATE INDEX IF NOT EXISTS feedback_user_idx ON feedback_events (user_id);


-- ---------------------------------------------------------------------------
-- Recommendation impressions: what we served, the predicted match, and how
-- mature the fingerprint was at serve time. Joined to feedback_events later to
-- measure realized love-rate (calibration + lift as the fingerprint trains).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS recommendation_events (
    id              BIGSERIAL PRIMARY KEY,
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    tmdb_id         INTEGER NOT NULL,
    predicted_match REAL NOT NULL,      -- cosine similarity at serve time (0..1)
    signal_count    INTEGER NOT NULL,   -- fingerprint maturity (feedback signals) at serve
    served_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS rec_events_user_film_idx ON recommendation_events (user_id, tmdb_id);
