"""Measuring whether the feedback loop improves matches.

Two complementary views:

1. OFFLINE LIFT (leave-one-out replay) — the rigorous, causal-ish proxy you run
   before trusting the loop. For each loved film, hide it, rebuild the fingerprint
   from the user's *other* feedback, and check whether that trained fingerprint
   ranks the held-out film higher than the onboarding base does. If it does, the
   accumulated feedback generalizes to predict unseen positives.

2. ONLINE METRICS (from logged impressions) — what you watch in production:
     * calibration   — do higher predicted-match recs actually get loved more?
     * maturity lift — does the love-rate of served recs rise as the fingerprint
                       accumulates signals?
   These are observational (confounded); the gold standard for causal proof is an
   A/B test (serve base-only vs trained to random arms). The impression log here is
   exactly what such a test would read from.
"""
from __future__ import annotations

import math
from statistics import mean

from . import store
from .api.recommend import FEEDBACK_WEIGHTS, apply_feedback_vec


# --------------------------- offline lift (pure) ---------------------------
def _cos(a, b) -> float:
    d = na = nb = 0.0
    for i in range(len(a)):
        d += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]
    return d / math.sqrt(na * nb) if na and nb else 0.0


def _rank_pct(target: int, vec, candidates: dict):
    order = sorted(candidates, key=lambda i: _cos(vec, candidates[i]), reverse=True)
    rank = order.index(target) + 1
    n = len(order)
    pct = 1.0 if n <= 1 else 1 - (rank - 1) / (n - 1)  # 1.0 = top of the list
    return rank, n, pct


def user_lift(base_vec: list, feedback: list[tuple], catalog: dict, liked_ids=()) -> list[dict]:
    """Leave-one-out over a user's loves. Needs >=2 loves (hold one, learn from the rest)."""
    loves = [t for t, s in feedback if s == "love"]
    if len(loves) < 2:
        return []
    interacted = {t for t, _ in feedback} | set(liked_ids)
    rows = []
    for held in loves:
        if held not in catalog:
            continue
        others = [(t, s) for t, s in feedback if t != held]
        trained = apply_feedback_vec(base_vec, others, catalog)
        # rank the held-out love against the recommendable pool (+ the held film)
        cands = {i: v for i, v in catalog.items() if i == held or i not in interacted}
        rb, n, pb = _rank_pct(held, base_vec, cands)
        rt, _, pt = _rank_pct(held, trained, cands)
        rows.append({"n": n, "rank_base": rb, "rank_trained": rt, "pct_base": pb, "pct_trained": pt})
    return rows


def aggregate(rows: list[dict]) -> dict:
    if not rows:
        return {"samples": 0}
    return {
        "samples": len(rows),
        "pct_base": mean(r["pct_base"] for r in rows),
        "pct_trained": mean(r["pct_trained"] for r in rows),
        "lift_pct": mean(r["pct_trained"] - r["pct_base"] for r in rows),
        "recall10_base": mean(1.0 if r["rank_base"] <= 10 else 0.0 for r in rows),
        "recall10_trained": mean(1.0 if r["rank_trained"] <= 10 else 0.0 for r in rows),
        "mrr_base": mean(1.0 / r["rank_base"] for r in rows),
        "mrr_trained": mean(1.0 / r["rank_trained"] for r in rows),
    }


def run_lift(conn) -> dict:
    """Run the LOO replay across every user with stored feedback."""
    from .models import AXES
    catalog = store.all_fingerprints(conn)
    cols = ", ".join(AXES)
    with conn.cursor() as cur:
        cur.execute(f"SELECT id::text, {cols}, liked_tmdb_ids FROM users")
        users = cur.fetchall()
    all_rows: list[dict] = []
    for u in users:
        uid, base_vec, liked = u[0], list(u[1:8]), u[8]
        with conn.cursor() as cur:
            cur.execute("SELECT tmdb_id, signal FROM feedback_events WHERE user_id = %s", (uid,))
            feedback = cur.fetchall()
        all_rows += user_lift(base_vec, feedback, catalog, liked or [])
    return aggregate(all_rows)


# --------------------------- online metrics ---------------------------
_JOIN = """
    SELECT re.signal_count, re.predicted_match, fe.signal
    FROM recommendation_events re
    JOIN feedback_events fe
      ON fe.user_id = re.user_id AND fe.tmdb_id = re.tmdb_id
     AND fe.created_at >= re.served_at
"""

POS, NEG = {"love"}, {"dislike", "hide"}  # 'seen' is neutral, excluded from love-rate


def _love_rate(signals) -> float | None:
    pos = sum(1 for s in signals if s in POS)
    rel = pos + sum(1 for s in signals if s in NEG)
    return pos / rel if rel else None


def online_metrics(conn) -> dict:
    with conn.cursor() as cur:
        cur.execute(_JOIN)
        rows = cur.fetchall()  # (signal_count, predicted_match, signal)

    # love-rate by fingerprint maturity at serve time
    buckets = [("0", lambda n: n == 0), ("1-2", lambda n: 1 <= n <= 2),
               ("3-5", lambda n: 3 <= n <= 5), ("6+", lambda n: n >= 6)]
    maturity = []
    for label, pred in buckets:
        sigs = [s for (n, _, s) in rows if pred(n)]
        maturity.append({"bucket": label, "n": len(sigs), "love_rate": _love_rate(sigs)})

    # calibration: predicted-match bucket -> realized love-rate
    cal_edges = [(0.0, 0.6), (0.6, 0.75), (0.75, 0.85), (0.85, 0.95), (0.95, 1.01)]
    calibration = []
    for lo, hi in cal_edges:
        sigs = [s for (_, m, s) in rows if lo <= m < hi]
        calibration.append({"bucket": f"{lo:.2f}-{hi:.2f}", "n": len(sigs), "love_rate": _love_rate(sigs)})

    return {"impressions_with_feedback": len(rows), "maturity": maturity, "calibration": calibration}


# --------------------------- report ---------------------------
def report(conn) -> None:
    lift = run_lift(conn)
    print("=== Offline feedback lift (leave-one-out) ===")
    if not lift.get("samples"):
        print("  no users with >=2 loves yet — need more feedback to evaluate.")
    else:
        print(f"  held-out positives evaluated : {lift['samples']}")
        print(f"  mean rank percentile  base   : {lift['pct_base']*100:5.1f}%")
        print(f"  mean rank percentile  trained: {lift['pct_trained']*100:5.1f}%")
        print(f"  >>> lift from feedback       : {lift['lift_pct']*100:+5.1f} pts")
        print(f"  recall@10   base / trained   : {lift['recall10_base']*100:4.0f}% / {lift['recall10_trained']*100:4.0f}%")
        print(f"  MRR         base / trained   : {lift['mrr_base']:.3f} / {lift['mrr_trained']:.3f}")

    m = online_metrics(conn)
    print(f"\n=== Online metrics ({m['impressions_with_feedback']} reacted impressions) ===")
    print("  love-rate by fingerprint maturity:")
    for b in m["maturity"]:
        lr = "  n/a" if b["love_rate"] is None else f"{b['love_rate']*100:4.0f}%"
        print(f"    signals {b['bucket']:>4}: {lr}  (n={b['n']})")
    print("  calibration (predicted match -> realized love-rate):")
    for b in m["calibration"]:
        lr = "  n/a" if b["love_rate"] is None else f"{b['love_rate']*100:4.0f}%"
        print(f"    {b['bucket']}: {lr}  (n={b['n']})")
