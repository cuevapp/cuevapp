"""Seed a small, curated catalog of films with hand-set fingerprints.

Lets the full stack (onboarding catalog, recommendations, feedback) work
end-to-end without running the real TMDB -> Claude backfill. Idempotent: it
upserts by tmdb_id, so a later real backfill simply overwrites these rows.

    python seed_films.py
"""
from __future__ import annotations

from cueva import store
from cueva.config import get_settings
from cueva.models import AXES, Fingerprint, FilmRecord

# (tmdb_id, title, year, action, comedy, romance, scifi, adventure, drama, horror,
#  in_theaters, providers)
FILMS = [
    # --- action ---
    (155,    "The Dark Knight",            2008,  9, 2, 2, 3, 7, 8, 3, False, ["Max"]),
    (76341,  "Mad Max: Fury Road",         2015, 10, 2, 2, 6, 8, 4, 2, False, ["Max", "Hulu"]),
    (245891, "John Wick",                  2014, 10, 2, 1, 1, 5, 3, 2, False, ["Peacock"]),
    (562,    "Die Hard",                   1988,  9, 3, 2, 1, 6, 4, 1, False, ["Hulu"]),
    # --- comedy ---
    (8363,   "Superbad",                   2007,  1, 10, 4, 0, 2, 3, 0, False, ["Netflix"]),
    (55721,  "Bridesmaids",                2011,  1, 9, 5, 0, 2, 4, 0, False, ["Peacock"]),
    (18785,  "The Hangover",               2009,  2, 10, 2, 0, 4, 2, 0, False, ["Max"]),
    (12133,  "Step Brothers",              2008,  1, 9, 2, 0, 1, 2, 0, False, ["Netflix"]),
    # --- romance ---
    (313369, "La La Land",                 2016,  1, 5, 9, 0, 2, 7, 0, False, ["Hulu"]),
    (4348,   "Pride & Prejudice",          2005,  1, 4, 10, 0, 2, 7, 0, False, ["Netflix"]),
    (11036,  "The Notebook",               2004,  1, 2, 10, 0, 2, 8, 0, False, ["Max"]),
    (597,    "Titanic",                    1997,  4, 2, 9, 0, 6, 8, 1, False, ["Paramount+"]),
    # --- sci-fi ---
    (27205,  "Inception",                  2010,  8, 1, 3, 9, 7, 6, 2, False, ["Netflix"]),
    (157336, "Interstellar",               2014,  5, 2, 4, 10, 7, 8, 1, False, ["Paramount+"]),
    (603,    "The Matrix",                 1999,  9, 2, 3, 10, 6, 5, 2, False, ["Max"]),
    (335984, "Blade Runner 2049",          2017,  5, 1, 4, 10, 5, 8, 2, False, ["Netflix"]),
    (329865, "Arrival",                    2016,  2, 1, 5, 9, 3, 8, 1, False, ["Hulu"]),
    (438631, "Dune",                       2021,  6, 1, 4, 9, 8, 7, 2, True,  ["Max"]),
    # --- adventure ---
    (85,     "Raiders of the Lost Ark",    1981,  7, 4, 4, 2, 10, 3, 2, False, ["Paramount+"]),
    (22,     "Pirates of the Caribbean",   2003,  7, 6, 4, 2, 9, 3, 2, False, ["Disney+"]),
    (329,    "Jurassic Park",              1993,  6, 3, 2, 8, 9, 4, 4, False, ["Peacock"]),
    (120,    "LOTR: The Fellowship",       2001,  7, 2, 3, 4, 10, 7, 3, False, ["Max"]),
    # --- drama ---
    (13,     "Forrest Gump",               1994,  2, 5, 6, 0, 4, 10, 0, False, ["Paramount+"]),
    (278,    "The Shawshank Redemption",   1994,  2, 2, 2, 0, 3, 10, 1, False, ["Max"]),
    (244786, "Whiplash",                   2014,  2, 1, 2, 0, 1, 10, 2, False, ["Netflix"]),
    (334541, "Manchester by the Sea",      2016,  1, 2, 2, 0, 1, 10, 0, False, ["Prime Video"]),
    # --- horror ---
    (138843, "The Conjuring",              2013,  3, 1, 1, 0, 2, 4, 10, False, ["Max"]),
    (493922, "Hereditary",                 2018,  2, 1, 1, 0, 1, 7, 10, False, ["Max"]),
    (447332, "A Quiet Place",              2018,  4, 1, 3, 5, 3, 6, 9, False, ["Paramount+"]),
    (419430, "Get Out",                    2017,  3, 3, 2, 3, 2, 6, 9, False, ["Peacock"]),
    (348,    "Alien",                      1979,  5, 1, 1, 8, 4, 5, 9, False, ["Hulu"]),
    (9552,   "The Exorcist",               1973,  1, 1, 1, 0, 1, 6, 10, True,  ["Max"]),
]


def main() -> None:
    s = get_settings()
    conn = store.connect()
    n = 0
    for (tmdb_id, title, year, a, c, r, sf, ad, d, h, in_theaters, providers) in FILMS:
        fp = Fingerprint(**dict(zip(AXES, (a, c, r, sf, ad, d, h))))
        rec = FilmRecord(
            tmdb_id=tmdb_id,
            title=title,
            year=year,
            overview=f"{title} ({year}) — seeded sample row.",
            fingerprint=fp,
            rationale="Seeded with a hand-set fingerprint for local development.",
            in_theaters=in_theaters,
            providers=providers,
            region=s.cueva_region,
            model_version=s.cueva_model_version,
        )
        store.upsert(conn, rec)
        n += 1
    conn.close()
    print(f"Seeded/updated {n} films.")


if __name__ == "__main__":
    main()
