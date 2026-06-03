"""Command-line entrypoint.

  python -m cueva.cli backfill --mode batch --limit 2000   # initial catalog (cheap)
  python -m cueva.cli update --limit 100                   # daily new-in-theaters (live)
  python -m cueva.cli match --like 27205,49026 -k 10       # derive taste -> recommend
"""
from __future__ import annotations

import argparse
import logging

from .pipeline import backfill, match_by_films


def main() -> None:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s | %(message)s",
    )
    parser = argparse.ArgumentParser(prog="cueva")
    sub = parser.add_subparsers(dest="cmd", required=True)

    b = sub.add_parser("backfill", help="score the catalog")
    b.add_argument("--limit", type=int, default=500)
    b.add_argument("--mode", choices=["batch", "live"], default="batch")

    u = sub.add_parser("update", help="score new in-theaters films now (live path)")
    u.add_argument("--limit", type=int, default=100)

    m = sub.add_parser("match", help="recommend from a set of films you love")
    m.add_argument("--like", required=True, help="comma-separated TMDB ids")
    m.add_argument("-k", type=int, default=10)

    sub.add_parser("analytics", help="measure whether the feedback loop improves matches")

    args = parser.parse_args()

    if args.cmd == "backfill":
        backfill(limit=args.limit, mode=args.mode)
    elif args.cmd == "update":
        backfill(limit=args.limit, mode="live")
    elif args.cmd == "match":
        liked = [int(x) for x in args.like.split(",") if x.strip()]
        for tmdb_id, title, year, in_theaters, providers, poster_path, match in match_by_films(liked, k=args.k):
            where = "In Theaters" if in_theaters else (", ".join(providers) or "—")
            print(f"{match * 100:5.1f}%  {title} ({year})  [{where}]")
    elif args.cmd == "analytics":
        from . import analytics, store
        analytics.report(store.connect())


if __name__ == "__main__":
    main()
