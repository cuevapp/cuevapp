import React, { useState, useMemo } from "react";
import {
  RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, ResponsiveContainer,
} from "recharts";
import { Clapperboard, Heart, ThumbsDown, Eye, EyeOff, RotateCcw, TrendingUp, TrendingDown } from "lucide-react";

const FONTS = `@import url('https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,600;1,9..144,500&family=Hanken+Grotesk:wght@400;500;600;700&display=swap');`;
const C = { bg: "#0c0a09", panel: "#16130f", line: "#2a241d", text: "#f3ead9", muted: "#9c9081", base: "#f5a623", learned: "#4fd1c5" };

const AXES = [
  { key: "action", label: "Action" }, { key: "comedy", label: "Comedy" }, { key: "romance", label: "Romance" },
  { key: "scifi", label: "Sci-Fi" }, { key: "adventure", label: "Adventure" }, { key: "drama", label: "Drama" }, { key: "horror", label: "Horror" },
];
const GENRE_COLOR = { action: "#f5a623", comedy: "#f2c94c", romance: "#e64980", scifi: "#4fd1c5", adventure: "#51cf66", drama: "#9775fa", horror: "#e03131" };

/* same learning rates as the API (cueva.api.recommend.FEEDBACK_WEIGHTS) */
const W = { love: 0.25, dislike: -0.18, hide: -0.12, seen: 0 };

const CATALOG = [
  { id: 1, t: "Mad Max: Fury Road", y: 2015, w: "Max", fp: { action: 10, comedy: 1, romance: 2, scifi: 7, adventure: 8, drama: 4, horror: 2 } },
  { id: 2, t: "Dune: Part Two", y: 2024, w: "Theaters", fp: { action: 6, comedy: 1, romance: 4, scifi: 10, adventure: 8, drama: 7, horror: 2 } },
  { id: 4, t: "Get Out", y: 2017, w: "Peacock", fp: { action: 3, comedy: 3, romance: 1, scifi: 3, adventure: 1, drama: 6, horror: 8 } },
  { id: 5, t: "Guardians of the Galaxy", y: 2014, w: "Disney+", fp: { action: 8, comedy: 8, romance: 3, scifi: 8, adventure: 9, drama: 4, horror: 1 } },
  { id: 6, t: "Hereditary", y: 2018, w: "Max", fp: { action: 1, comedy: 0, romance: 1, scifi: 1, adventure: 1, drama: 7, horror: 10 } },
  { id: 8, t: "Jurassic Park", y: 1993, w: "Peacock", fp: { action: 8, comedy: 3, romance: 2, scifi: 8, adventure: 9, drama: 4, horror: 4 } },
  { id: 12, t: "Alien", y: 1979, w: "Hulu", fp: { action: 6, comedy: 0, romance: 1, scifi: 9, adventure: 5, drama: 3, horror: 9 } },
  { id: 16, t: "Inception", y: 2010, w: "Max", fp: { action: 7, comedy: 1, romance: 3, scifi: 9, adventure: 6, drama: 6, horror: 1 } },
  { id: 20, t: "Everything Everywhere", y: 2022, w: "Prime", fp: { action: 6, comedy: 8, romance: 4, scifi: 8, adventure: 6, drama: 7, horror: 1 } },
  { id: 21, t: "A Quiet Place", y: 2018, w: "Paramount+", fp: { action: 4, comedy: 0, romance: 2, scifi: 5, adventure: 2, drama: 5, horror: 9 } },
  { id: 22, t: "Her", y: 2013, w: "Netflix", fp: { action: 0, comedy: 3, romance: 8, scifi: 7, adventure: 1, drama: 8, horror: 0 } },
  { id: 24, t: "Scream", y: 1996, w: "Max", fp: { action: 3, comedy: 4, romance: 1, scifi: 0, adventure: 1, drama: 2, horror: 9 } },
  { id: 25, t: "The Martian", y: 2015, w: "Disney+", fp: { action: 3, comedy: 6, romance: 1, scifi: 9, adventure: 7, drama: 6, horror: 1 } },
  { id: 28, t: "Whiplash", y: 2014, w: "Prime", fp: { action: 1, comedy: 1, romance: 2, scifi: 0, adventure: 1, drama: 10, horror: 2 } },
];

const USER_BASE = { action: 4, comedy: 2, romance: 3, scifi: 9, adventure: 6, drama: 8, horror: 2 };
const LIKED = [16, 22]; // onboarding picks, excluded from the feed

const clamp = (v) => Math.max(0, Math.min(10, v));
function cosine(a, b) {
  let d = 0, na = 0, nb = 0;
  for (const { key } of AXES) { d += a[key] * b[key]; na += a[key] ** 2; nb += b[key] ** 2; }
  return na && nb ? d / (Math.sqrt(na) * Math.sqrt(nb)) : 0;
}
function effectiveOf(base, feedback) {
  const eff = { ...base };
  for (const [id, sig] of Object.entries(feedback)) {
    const w = W[sig] || 0; if (!w) continue;
    const film = CATALOG.find((m) => m.id === +id)?.fp; if (!film) continue;
    for (const { key } of AXES) eff[key] += w * (film[key] - base[key]);
  }
  for (const { key } of AXES) eff[key] = clamp(Math.round(eff[key]));
  return eff;
}
function gradientFor(fp) {
  const [a, b] = [...AXES].sort((x, y) => fp[y.key] - fp[x.key]);
  return `linear-gradient(150deg, ${GENRE_COLOR[a.key]}cc, ${GENRE_COLOR[b.key]}88 72%, #0c0a09 150%)`;
}

const ACTIONS = [
  { sig: "love", label: "Love", icon: Heart, color: "#e64980" },
  { sig: "dislike", label: "Not for me", icon: ThumbsDown, color: "#e8888a" },
  { sig: "seen", label: "Seen it", icon: Eye, color: C.muted },
  { sig: "hide", label: "Hide", icon: EyeOff, color: C.muted },
];

export default function FeedbackLoop() {
  const [feedback, setFeedback] = useState({}); // id -> signal

  const eff = useMemo(() => effectiveOf(USER_BASE, feedback), [feedback]);
  const count = Object.keys(feedback).length;

  const shift = useMemo(() => {
    let best = { axis: null, delta: 0 };
    for (const a of AXES) {
      const d = eff[a.key] - USER_BASE[a.key];
      if (Math.abs(d) > Math.abs(best.delta)) best = { axis: a, delta: d };
    }
    return best;
  }, [eff]);

  const feed = useMemo(() => {
    const acted = new Set(Object.keys(feedback).map(Number));
    const liked = new Set(LIKED);
    return CATALOG
      .filter((m) => !acted.has(m.id) && !liked.has(m.id))
      .map((m) => ({ ...m, score: cosine(eff, m.fp) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
  }, [eff, feedback]);

  const act = (id, sig) => setFeedback((f) => ({ ...f, [id]: sig }));
  const radar = AXES.map((a) => ({ axis: a.label, base: USER_BASE[a.key], eff: eff[a.key] }));

  return (
    <div style={{ background: C.bg, color: C.text, fontFamily: "'Hanken Grotesk',sans-serif", borderRadius: 18, overflow: "hidden", minHeight: 560 }}>
      <style>{FONTS}</style>
      <style>{`.fbtn{cursor:pointer;transition:all .14s;border:none}.fbtn:active{transform:scale(.92)}.card{animation:rise .35s ease both}@keyframes rise{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}`}</style>

      {/* header: base vs learned fingerprint */}
      <div style={{ position: "relative", padding: "22px 22px 16px", borderBottom: `1px solid ${C.line}`,
        background: "radial-gradient(110% 130% at 0% 0%, rgba(245,166,35,0.10), transparent 55%), radial-gradient(110% 130% at 100% 0%, rgba(79,209,197,0.12), transparent 55%)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 14 }}>
          <div style={{ width: 30, height: 30, borderRadius: 9, display: "grid", placeItems: "center", background: "linear-gradient(135deg,#f5a623,#d4791b)" }}>
            <Clapperboard size={17} color="#1a1206" />
          </div>
          <span style={{ fontFamily: "'Fraunces',serif", fontSize: 19, fontWeight: 600 }}>Cueva</span>
          {count > 0 && (
            <button onClick={() => setFeedback({})} className="fbtn" style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 6,
              fontSize: 12, fontWeight: 600, color: C.muted, background: "transparent", border: `1px solid ${C.line}`, borderRadius: 999, padding: "6px 12px" }}>
              <RotateCcw size={13} /> Reset
            </button>
          )}
        </div>

        <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
          <div style={{ width: 104, height: 104, flexShrink: 0 }}>
            <ResponsiveContainer>
              <RadarChart data={radar} outerRadius="78%">
                <PolarGrid stroke={C.line} />
                <PolarAngleAxis dataKey="axis" tick={false} />
                <PolarRadiusAxis domain={[0, 10]} tick={false} axisLine={false} />
                <Radar dataKey="base" stroke={C.base} fill={C.base} fillOpacity={0.18} strokeWidth={1.5} />
                {count > 0 && <Radar dataKey="eff" stroke={C.learned} fill={C.learned} fillOpacity={0.18} strokeWidth={2} isAnimationActive />}
              </RadarChart>
            </ResponsiveContainer>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: "'Fraunces',serif", fontSize: 20, fontWeight: 600, lineHeight: 1.15 }}>
              {count === 0 ? "Teach Cueva your taste" : "Your fingerprint is learning"}
            </div>
            <div style={{ fontSize: 12.5, color: C.muted, marginTop: 4 }}>
              {count === 0 ? "React to a few films — watch the cyan shape move." : `${count} signal${count > 1 ? "s" : ""} so far`}
            </div>
            {shift.axis && shift.delta !== 0 && (
              <div style={{ display: "inline-flex", alignItems: "center", gap: 6, marginTop: 9, fontSize: 12.5, fontWeight: 600,
                padding: "5px 11px", borderRadius: 999, background: `${GENRE_COLOR[shift.axis.key]}22`, color: GENRE_COLOR[shift.axis.key], border: `1px solid ${GENRE_COLOR[shift.axis.key]}55` }}>
                {shift.delta > 0 ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
                {shift.axis.label} {shift.delta > 0 ? "+" : ""}{shift.delta}
              </div>
            )}
          </div>
        </div>
        <div style={{ display: "flex", gap: 16, justifyContent: "center", fontSize: 11.5, color: C.muted, marginTop: 12 }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><span style={{ width: 11, height: 3, borderRadius: 2, background: C.base }} /> Base taste</span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><span style={{ width: 11, height: 3, borderRadius: 2, background: C.learned }} /> Learned from feedback</span>
        </div>
      </div>

      {/* feed of recommendations to react to */}
      <div style={{ padding: "8px 18px 22px" }}>
        <div style={{ fontSize: 12.5, color: C.muted, padding: "12px 4px 6px" }}>Tonight, ranked by your current fingerprint</div>
        {feed.map((m) => (
          <div key={m.id} className="card" style={{ display: "flex", gap: 13, alignItems: "center", padding: "11px 6px", borderBottom: `1px solid ${C.line}` }}>
            <div style={{ width: 52, height: 78, flexShrink: 0, borderRadius: 9, background: gradientFor(m.fp), position: "relative", overflow: "hidden" }}>
              <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, rgba(8,7,6,.7), transparent 60%)" }} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14.5, fontWeight: 700 }}>{m.t} <span style={{ color: C.muted, fontWeight: 400 }}>· {m.y}</span></div>
              <div style={{ fontSize: 12, color: C.base, fontWeight: 600, marginBottom: 8 }}>{Math.round(m.score * 100)}% match</div>
              <div style={{ display: "flex", gap: 7 }}>
                {ACTIONS.map(({ sig, label, icon: Icon, color }) => (
                  <button key={sig} className="fbtn" onClick={() => act(m.id, sig)} aria-label={label} title={label} style={{
                    display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11.5, fontWeight: 600,
                    padding: "6px 10px", borderRadius: 9, background: C.panel, color, border: `1px solid ${C.line}` }}>
                    <Icon size={14} /> {label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ))}
        {feed.length === 0 && (
          <div style={{ textAlign: "center", color: C.muted, fontSize: 13, padding: "30px 0" }}>
            You've reacted to everything on hand — your fingerprint is well-trained. Reset to try again.
          </div>
        )}
      </div>
    </div>
  );
}
