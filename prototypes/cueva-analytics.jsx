import React, { useMemo, useState } from "react";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, ResponsiveContainer, ReferenceLine, Cell,
} from "recharts";
import { Clapperboard, TrendingUp, Target, GitBranch, RefreshCw } from "lucide-react";

const FONTS = `@import url('https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,600;1,9..144,500&family=Hanken+Grotesk:wght@400;500;600;700&display=swap');`;
const C = { bg: "#0c0a09", panel: "#16130f", line: "#2a241d", text: "#f3ead9", muted: "#9c9081", base: "#9c8a6f", trained: "#4fd1c5", accent: "#f5a623" };

const AXES = ["action", "comedy", "romance", "scifi", "adventure", "drama", "horror"];
const W = { love: 0.25, dislike: -0.18, hide: -0.12, seen: 0 };
const CATALOG = {
  1: [10, 1, 2, 7, 8, 4, 2], 2: [6, 1, 4, 10, 8, 7, 2], 3: [1, 2, 10, 0, 2, 8, 0], 4: [3, 3, 1, 3, 1, 6, 8],
  5: [8, 8, 3, 8, 9, 4, 1], 6: [1, 0, 1, 1, 1, 7, 10], 7: [1, 5, 8, 0, 2, 7, 0], 8: [8, 3, 2, 8, 9, 4, 4],
  9: [1, 10, 4, 0, 3, 2, 0], 10: [4, 1, 3, 10, 7, 8, 1], 12: [6, 0, 1, 9, 5, 3, 9], 14: [10, 1, 1, 1, 4, 3, 2],
  21: [4, 0, 2, 5, 2, 5, 9], 22: [0, 3, 8, 7, 1, 8, 0], 24: [3, 4, 1, 0, 1, 2, 9], 28: [1, 1, 2, 0, 1, 10, 2],
};
const IDS = Object.keys(CATALOG).map(Number);

const clamp = (v) => Math.max(0, Math.min(10, v));
const cos = (a, b) => { let d = 0, na = 0, nb = 0; for (let i = 0; i < 7; i++) { d += a[i] * b[i]; na += a[i] ** 2; nb += b[i] ** 2; } return na && nb ? d / Math.sqrt(na * nb) : 0; };
function apply(base, feedback) {
  const e = base.map(Number);
  for (const [id, sig] of feedback) { const w = W[sig] || 0, f = CATALOG[id]; if (!w || !f) continue; for (let i = 0; i < 7; i++) e[i] += w * (f[i] - base[i]); }
  return e.map((x) => clamp(Math.round(x)));
}
function rankPct(target, vec, cands) {
  const order = [...cands].sort((a, b) => cos(vec, CATALOG[b]) - cos(vec, CATALOG[a]));
  const rank = order.indexOf(target) + 1, n = order.length;
  return { rank, pct: n <= 1 ? 1 : 1 - (rank - 1) / (n - 1) };
}
function mulberry32(a) { return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

function simulate(seed, nUsers) {
  const rnd = mulberry32(seed);
  const liftRows = [];
  const impressions = []; // {maturity, pred, loved}
  for (let u = 0; u < nUsers; u++) {
    // a true taste: 1–2 dominant axes
    const dom1 = Math.floor(rnd() * 7), dom2 = Math.floor(rnd() * 7);
    const truth = AXES.map((_, i) => (i === dom1 ? 8 + rnd() * 2 : i === dom2 ? 5 + rnd() * 3 : rnd() * 3));
    // onboarding base: only weakly informed (room for feedback to help)
    const base = truth.map((t) => clamp(Math.round(t * 0.35 + 5 * 0.65 + (rnd() - 0.5) * 2)));
    // the films they'd love = closest to their true taste
    const loved = [...IDS].sort((a, b) => cos(truth, CATALOG[b]) - cos(truth, CATALOG[a])).slice(0, 5);
    const feedback = loved.map((id) => [id, "love"]);

    // OFFLINE: leave-one-out lift
    if (loved.length >= 2) {
      const interacted = new Set(loved);
      for (const held of loved) {
        const others = feedback.filter(([id]) => id !== held);
        const trained = apply(base, others);
        const cands = IDS.filter((i) => i === held || !interacted.has(i));
        liftRows.push({ b: rankPct(held, base, cands).pct, t: rankPct(held, trained, cands).pct,
          b10: rankPct(held, base, cands).rank <= 5, t10: rankPct(held, trained, cands).rank <= 5 });
      }
    }
    // ONLINE: serve at growing maturity; realized love ~ alignment to TRUE taste
    for (let m = 0; m <= 6; m++) {
      const eff = apply(base, feedback.slice(0, m));
      const served = [...IDS].filter((i) => !loved.slice(0, m).includes(i))
        .sort((a, b) => cos(eff, CATALOG[b]) - cos(eff, CATALOG[a])).slice(0, 5);
      for (const id of served) {
        const pred = cos(eff, CATALOG[id]);
        const align = cos(truth, CATALOG[id]);
        const p = clamp((align - 0.55) / 0.4) / 1; // higher true-alignment -> more likely loved
        impressions.push({ maturity: m, pred, loved: rnd() < Math.max(0, Math.min(1, p)) });
      }
    }
  }
  const mean = (f, arr) => arr.reduce((s, r) => s + f(r), 0) / (arr.length || 1);
  const lift = {
    samples: liftRows.length,
    base: mean((r) => r.b, liftRows), trained: mean((r) => r.t, liftRows),
    recallBase: mean((r) => (r.b10 ? 1 : 0), liftRows), recallTrained: mean((r) => (r.t10 ? 1 : 0), liftRows),
  };
  const matBuckets = [0, 1, 2, 3, 4, 5, 6].map((m) => {
    const r = impressions.filter((x) => x.maturity === m);
    return { signals: m, rate: r.length ? Math.round(mean((x) => (x.loved ? 1 : 0), r) * 100) : null };
  });
  const calEdges = [[0.6, 0.72], [0.72, 0.82], [0.82, 0.9], [0.9, 0.96], [0.96, 1.01]];
  const cal = calEdges.map(([lo, hi]) => {
    const r = impressions.filter((x) => x.pred >= lo && x.pred < hi);
    return { band: `${Math.round(lo * 100)}–${Math.round(hi * 100 > 100 ? 100 : hi * 100)}`, rate: r.length ? Math.round(mean((x) => (x.loved ? 1 : 0), r) * 100) : null };
  });
  return { lift, matBuckets, cal, n: impressions.length };
}

function Card({ icon, title, sub, children }) {
  return (
    <div style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 14, padding: 16, marginTop: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>{icon}<h3 style={{ fontFamily: "'Fraunces',serif", fontSize: 16, fontWeight: 600, margin: 0 }}>{title}</h3></div>
      {sub && <div style={{ fontSize: 12, color: C.muted, marginBottom: 12 }}>{sub}</div>}
      {children}
    </div>
  );
}

export default function Analytics() {
  const [seed, setSeed] = useState(7);
  const { lift, matBuckets, cal, n } = useMemo(() => simulate(seed, 60), [seed]);
  const liftPts = Math.round((lift.trained - lift.base) * 100);
  const barData = [{ k: "Base only", v: Math.round(lift.base * 100), c: C.base }, { k: "+ feedback", v: Math.round(lift.trained * 100), c: C.trained }];

  return (
    <div style={{ background: C.bg, color: C.text, fontFamily: "'Hanken Grotesk',sans-serif", borderRadius: 18, overflow: "hidden", padding: "22px 20px 24px" }}>
      <style>{FONTS}</style>
      <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
        <div style={{ width: 34, height: 34, borderRadius: 10, display: "grid", placeItems: "center", background: "linear-gradient(135deg,#f5a623,#d4791b)" }}><Clapperboard size={19} color="#1a1206" /></div>
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: "'Fraunces',serif", fontSize: 21, fontWeight: 600 }}>Does feedback improve matches?</div>
          <div style={{ fontSize: 12.5, color: C.muted }}>Simulated cohort · {n.toLocaleString()} served impressions</div>
        </div>
        <button onClick={() => setSeed((s) => s + 1)} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12.5, fontWeight: 600, color: C.muted, background: C.panel, border: `1px solid ${C.line}`, borderRadius: 999, padding: "7px 13px", cursor: "pointer" }}><RefreshCw size={13} /> Resample</button>
      </div>

      <Card icon={<GitBranch size={15} color={C.trained} />} title="Offline lift (leave-one-out)" sub={`Where a held-out loved film ranks: untrained base vs base + the user's other feedback · ${lift.samples} held-out positives`}>
        <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
          <div style={{ flex: 1, height: 150 }}>
            <ResponsiveContainer>
              <BarChart data={barData} margin={{ top: 6, right: 6, left: -18, bottom: 0 }}>
                <CartesianGrid stroke={C.line} vertical={false} />
                <XAxis dataKey="k" tick={{ fill: C.muted, fontSize: 12 }} axisLine={{ stroke: C.line }} tickLine={false} />
                <YAxis domain={[0, 100]} tick={{ fill: C.muted, fontSize: 11 }} axisLine={false} tickLine={false} unit="%" />
                <Bar dataKey="v" radius={[6, 6, 0, 0]}>{barData.map((d, i) => <Cell key={i} fill={d.c} />)}</Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div style={{ textAlign: "center", paddingRight: 8 }}>
            <div style={{ fontFamily: "'Fraunces',serif", fontSize: 38, fontWeight: 600, color: liftPts >= 0 ? C.trained : "#e8888a", lineHeight: 1 }}>{liftPts >= 0 ? "+" : ""}{liftPts}</div>
            <div style={{ fontSize: 11.5, color: C.muted, marginTop: 4, maxWidth: 90 }}>percentile points of lift</div>
            <div style={{ fontSize: 11, color: C.muted, marginTop: 8 }}>recall@5 {Math.round(lift.recallBase * 100)}% → <span style={{ color: C.trained, fontWeight: 700 }}>{Math.round(lift.recallTrained * 100)}%</span></div>
          </div>
        </div>
      </Card>

      <Card icon={<TrendingUp size={15} color={C.accent} />} title="Love-rate as the fingerprint matures" sub="Share of served recommendations that get loved, by how many signals the fingerprint had at serve time">
        <div style={{ height: 160 }}>
          <ResponsiveContainer>
            <LineChart data={matBuckets} margin={{ top: 6, right: 12, left: -18, bottom: 0 }}>
              <CartesianGrid stroke={C.line} vertical={false} />
              <XAxis dataKey="signals" tick={{ fill: C.muted, fontSize: 11 }} axisLine={{ stroke: C.line }} tickLine={false} label={{ value: "feedback signals", position: "insideBottom", offset: -2, fill: C.muted, fontSize: 11 }} />
              <YAxis domain={[0, 100]} tick={{ fill: C.muted, fontSize: 11 }} axisLine={false} tickLine={false} unit="%" />
              <Line type="monotone" dataKey="rate" stroke={C.accent} strokeWidth={2.4} dot={{ r: 3, fill: C.accent }} connectNulls />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <Card icon={<Target size={15} color={C.trained} />} title="Calibration" sub="Do higher predicted-match recommendations actually get loved more? A rising line means match % is meaningful.">
        <div style={{ height: 160 }}>
          <ResponsiveContainer>
            <LineChart data={cal} margin={{ top: 6, right: 12, left: -18, bottom: 0 }}>
              <CartesianGrid stroke={C.line} vertical={false} />
              <XAxis dataKey="band" tick={{ fill: C.muted, fontSize: 10.5 }} axisLine={{ stroke: C.line }} tickLine={false} label={{ value: "predicted match %", position: "insideBottom", offset: -2, fill: C.muted, fontSize: 11 }} />
              <YAxis domain={[0, 100]} tick={{ fill: C.muted, fontSize: 11 }} axisLine={false} tickLine={false} unit="%" />
              <Line type="monotone" dataKey="rate" stroke={C.trained} strokeWidth={2.4} dot={{ r: 3, fill: C.trained }} connectNulls />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <div style={{ fontSize: 11.5, color: C.muted, marginTop: 14, lineHeight: 1.5 }}>
        Illustrative simulation of the real metrics. Offline lift is causal-ish (held-out positives); the online curves are observational — the production gold standard is an A/B test serving base-only vs trained fingerprints, which the impression log is built to support.
      </div>
    </div>
  );
}
