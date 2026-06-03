import React, { useState, useMemo } from "react";
import {
  RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, ResponsiveContainer,
} from "recharts";
import { Clapperboard, Sparkles, SlidersHorizontal, Heart, Ticket, MonitorPlay, Plus, Check } from "lucide-react";

/* ---------- design tokens ---------- */
const FONTS = `
@import url('https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,600;1,9..144,500&family=Hanken+Grotesk:wght@400;500;600;700&display=swap');
`;

const COLORS = {
  bg: "#0c0a09",
  panel: "#16130f",
  line: "#2a241d",
  text: "#f3ead9",
  muted: "#9c9081",
  you: "#f5a623",     // your fingerprint — warm projector amber
  movie: "#4fd1c5",   // the movie — cool screen cyan
};

/* ---------- the 7 fingerprint axes ---------- */
const AXES = [
  { key: "action", label: "Action" },
  { key: "comedy", label: "Comedy" },
  { key: "romance", label: "Romance" },
  { key: "scifi", label: "Sci-Fi" },
  { key: "adventure", label: "Adventure" },
  { key: "drama", label: "Drama" },
  { key: "horror", label: "Horror" },
];

/* ---------- seed catalog (illustrative hand-tuned fingerprints, 0–10) ---------- */
const MOVIES = [
  { id: 1, title: "Mad Max: Fury Road", year: 2015, where: "Max", fp: { action: 10, comedy: 1, romance: 2, scifi: 7, adventure: 8, drama: 4, horror: 2 } },
  { id: 2, title: "Dune: Part Two", year: 2024, where: "Theaters", fp: { action: 6, comedy: 1, romance: 4, scifi: 10, adventure: 8, drama: 7, horror: 2 } },
  { id: 3, title: "The Notebook", year: 2004, where: "Netflix", fp: { action: 1, comedy: 2, romance: 10, scifi: 0, adventure: 2, drama: 8, horror: 0 } },
  { id: 4, title: "Get Out", year: 2017, where: "Peacock", fp: { action: 3, comedy: 3, romance: 1, scifi: 3, adventure: 1, drama: 6, horror: 8 } },
  { id: 5, title: "Guardians of the Galaxy", year: 2014, where: "Disney+", fp: { action: 8, comedy: 8, romance: 3, scifi: 8, adventure: 9, drama: 4, horror: 1 } },
  { id: 6, title: "Hereditary", year: 2018, where: "Max", fp: { action: 1, comedy: 0, romance: 1, scifi: 1, adventure: 1, drama: 7, horror: 10 } },
  { id: 7, title: "La La Land", year: 2016, where: "Prime", fp: { action: 1, comedy: 5, romance: 8, scifi: 0, adventure: 2, drama: 7, horror: 0 } },
  { id: 8, title: "Jurassic Park", year: 1993, where: "Peacock", fp: { action: 8, comedy: 3, romance: 2, scifi: 8, adventure: 9, drama: 4, horror: 4 } },
  { id: 9, title: "Superbad", year: 2007, where: "Netflix", fp: { action: 1, comedy: 10, romance: 4, scifi: 0, adventure: 3, drama: 2, horror: 0 } },
  { id: 10, title: "Interstellar", year: 2014, where: "Paramount+", fp: { action: 4, comedy: 1, romance: 3, scifi: 10, adventure: 7, drama: 8, horror: 1 } },
  { id: 11, title: "Knives Out", year: 2019, where: "Theaters", fp: { action: 2, comedy: 6, romance: 2, scifi: 0, adventure: 3, drama: 6, horror: 1 } },
  { id: 12, title: "Alien", year: 1979, where: "Hulu", fp: { action: 6, comedy: 0, romance: 1, scifi: 9, adventure: 5, drama: 3, horror: 9 } },
  { id: 13, title: "Pride & Prejudice", year: 2005, where: "Netflix", fp: { action: 0, comedy: 3, romance: 9, scifi: 0, adventure: 2, drama: 7, horror: 0 } },
  { id: 14, title: "John Wick", year: 2014, where: "Prime", fp: { action: 10, comedy: 1, romance: 1, scifi: 1, adventure: 4, drama: 3, horror: 2 } },
  { id: 15, title: "Bridesmaids", year: 2011, where: "Peacock", fp: { action: 1, comedy: 9, romance: 4, scifi: 0, adventure: 2, drama: 3, horror: 0 } },
  { id: 16, title: "Inception", year: 2010, where: "Max", fp: { action: 7, comedy: 1, romance: 3, scifi: 9, adventure: 6, drama: 6, horror: 1 } },
];

/* love-to-derive starter picks */
const SEED_PICKS = [1, 3, 5, 6, 9, 10, 12, 7];

/* ---------- math: cosine similarity over the 7-vector ---------- */
function cosine(a, b) {
  let dot = 0, na = 0, nb = 0;
  for (const { key } of AXES) {
    dot += a[key] * b[key];
    na += a[key] * a[key];
    nb += b[key] * b[key];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

const EMPTY = AXES.reduce((o, a) => ({ ...o, [a.key]: 5 }), {});

/* ---------- small UI atoms ---------- */
function Badge({ where }) {
  const theaters = where === "Theaters";
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, fontWeight: 600,
      padding: "3px 9px", borderRadius: 999, letterSpacing: 0.3,
      background: theaters ? "rgba(245,166,35,0.14)" : "rgba(79,209,197,0.12)",
      color: theaters ? COLORS.you : COLORS.movie,
      border: `1px solid ${theaters ? "rgba(245,166,35,0.35)" : "rgba(79,209,197,0.3)"}`,
    }}>
      {theaters ? <Ticket size={12} /> : <MonitorPlay size={12} />}
      {theaters ? "In Theaters" : where}
    </span>
  );
}

function MiniRadar({ fp, you }) {
  const data = AXES.map((a) => ({ axis: a.label, you: you[a.key], movie: fp[a.key] }));
  return (
    <div style={{ width: 92, height: 92 }}>
      <ResponsiveContainer>
        <RadarChart data={data} outerRadius="78%">
          <PolarGrid stroke={COLORS.line} />
          <PolarAngleAxis dataKey="axis" tick={false} />
          <Radar dataKey="you" stroke={COLORS.you} fill={COLORS.you} fillOpacity={0.12} strokeWidth={1.2} />
          <Radar dataKey="movie" stroke={COLORS.movie} fill={COLORS.movie} fillOpacity={0.22} strokeWidth={1.4} />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ---------- app ---------- */
export default function Cueva() {
  const [fp, setFp] = useState(EMPTY);
  const [mode, setMode] = useState("tune"); // 'tune' | 'derive'
  const [loved, setLoved] = useState([]);

  const setAxis = (key, v) => setFp((p) => ({ ...p, [key]: v }));

  const toggleLove = (id) => {
    setLoved((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      if (next.length) {
        const avg = AXES.reduce((o, a) => {
          o[a.key] = Math.round(next.reduce((s, mid) => s + MOVIES.find((m) => m.id === mid).fp[a.key], 0) / next.length);
          return o;
        }, {});
        setFp(avg);
      }
      return next;
    });
  };

  const matches = useMemo(() => {
    return MOVIES
      .filter((m) => !(mode === "derive" && loved.includes(m.id)))
      .map((m) => ({ ...m, score: cosine(fp, m.fp) }))
      .sort((a, b) => b.score - a.score);
  }, [fp, mode, loved]);

  const bigRadar = AXES.map((a) => ({
    axis: a.label,
    you: fp[a.key],
    movie: matches[0] ? matches[0].fp[a.key] : 0,
  }));

  return (
    <div style={{ background: COLORS.bg, color: COLORS.text, fontFamily: "'Hanken Grotesk', sans-serif", minHeight: "100%", borderRadius: 16, overflow: "hidden" }}>
      <style>{FONTS}</style>
      <style>{`
        .cv-slider { -webkit-appearance:none; appearance:none; height:4px; border-radius:999px; background:${COLORS.line}; outline:none; }
        .cv-slider::-webkit-slider-thumb { -webkit-appearance:none; width:16px; height:16px; border-radius:50%; background:${COLORS.you}; cursor:pointer; box-shadow:0 0 0 4px rgba(245,166,35,0.18); }
        .cv-slider::-moz-range-thumb { width:16px; height:16px; border:none; border-radius:50%; background:${COLORS.you}; cursor:pointer; }
        .cv-row:hover { background:rgba(255,255,255,0.025); }
      `}</style>

      {/* atmospheric backdrop */}
      <div style={{ position: "relative", padding: "28px 26px 22px", borderBottom: `1px solid ${COLORS.line}`,
        background: "radial-gradient(120% 140% at 0% 0%, rgba(245,166,35,0.10), transparent 55%), radial-gradient(120% 140% at 100% 0%, rgba(79,209,197,0.08), transparent 55%)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
          <div style={{ width: 38, height: 38, borderRadius: 11, display: "grid", placeItems: "center",
            background: "linear-gradient(135deg, #f5a623, #d4791b)", boxShadow: "0 6px 22px rgba(245,166,35,0.35)" }}>
            <Clapperboard size={21} color="#1a1206" />
          </div>
          <div>
            <div style={{ fontFamily: "'Fraunces', serif", fontSize: 27, fontWeight: 600, letterSpacing: -0.5, lineHeight: 1 }}>Cueva</div>
            <div style={{ fontSize: 12.5, color: COLORS.muted, marginTop: 3 }}>Find your next film by matching its fingerprint to yours.</div>
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1.05fr)", gap: 0 }}>
        {/* ---- LEFT: your fingerprint ---- */}
        <div style={{ padding: "22px 24px", borderRight: `1px solid ${COLORS.line}` }}>
          <div style={{ display: "flex", gap: 6, marginBottom: 18, background: COLORS.panel, padding: 4, borderRadius: 11, border: `1px solid ${COLORS.line}` }}>
            <TabBtn active={mode === "tune"} onClick={() => setMode("tune")} icon={<SlidersHorizontal size={14} />} label="Tune it myself" />
            <TabBtn active={mode === "derive"} onClick={() => setMode("derive")} icon={<Heart size={14} />} label="Build from films I love" />
          </div>

          {/* the radar */}
          <div style={{ height: 268, marginBottom: 8 }}>
            <ResponsiveContainer>
              <RadarChart data={bigRadar} outerRadius="72%">
                <PolarGrid stroke={COLORS.line} />
                <PolarAngleAxis dataKey="axis" tick={{ fill: COLORS.muted, fontSize: 12, fontWeight: 600 }} />
                <PolarRadiusAxis domain={[0, 10]} tick={false} axisLine={false} />
                <Radar name="Top match" dataKey="movie" stroke={COLORS.movie} fill={COLORS.movie} fillOpacity={0.14} strokeWidth={1.5} strokeDasharray="4 3" />
                <Radar name="You" dataKey="you" stroke={COLORS.you} fill={COLORS.you} fillOpacity={0.26} strokeWidth={2} />
              </RadarChart>
            </ResponsiveContainer>
          </div>
          <Legend />

          {mode === "tune" ? (
            <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 13 }}>
              {AXES.map((a) => (
                <div key={a.key}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, marginBottom: 5 }}>
                    <span style={{ color: COLORS.text, fontWeight: 600 }}>{a.label}</span>
                    <span style={{ color: COLORS.you, fontWeight: 700 }}>{fp[a.key]}</span>
                  </div>
                  <input className="cv-slider" type="range" min={0} max={10} step={1} value={fp[a.key]}
                    onChange={(e) => setAxis(a.key, +e.target.value)} style={{ width: "100%" }} />
                </div>
              ))}
            </div>
          ) : (
            <div style={{ marginTop: 16 }}>
              <div style={{ fontSize: 12.5, color: COLORS.muted, marginBottom: 11 }}>
                Tap films you love — we average their fingerprints into yours.
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {SEED_PICKS.map((id) => {
                  const m = MOVIES.find((x) => x.id === id);
                  const on = loved.includes(id);
                  return (
                    <button key={id} onClick={() => toggleLove(id)} style={{
                      display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12.5, fontWeight: 600,
                      padding: "7px 12px", borderRadius: 999, cursor: "pointer", transition: "all .15s",
                      background: on ? "rgba(245,166,35,0.16)" : COLORS.panel,
                      color: on ? COLORS.you : COLORS.text,
                      border: `1px solid ${on ? "rgba(245,166,35,0.4)" : COLORS.line}`,
                    }}>
                      {on ? <Check size={13} /> : <Plus size={13} />}{m.title}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* ---- RIGHT: matches ---- */}
        <div style={{ padding: "22px 24px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
            <Sparkles size={16} color={COLORS.you} />
            <h2 style={{ fontFamily: "'Fraunces', serif", fontSize: 18, fontWeight: 600, margin: 0 }}>Your matches</h2>
            <span style={{ fontSize: 12, color: COLORS.muted, marginLeft: "auto" }}>ranked by fingerprint similarity</span>
          </div>

          <div style={{ display: "flex", flexDirection: "column" }}>
            {matches.slice(0, 8).map((m, i) => (
              <div key={m.id} className="cv-row" style={{
                display: "flex", alignItems: "center", gap: 14, padding: "12px 10px", borderRadius: 12,
                borderBottom: i < 7 ? `1px solid ${COLORS.line}` : "none", transition: "background .15s",
              }}>
                <div style={{ fontFamily: "'Fraunces', serif", fontSize: 19, color: COLORS.muted, width: 22, textAlign: "center" }}>{i + 1}</div>
                <MiniRadar fp={m.fp} you={fp} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 3 }}>{m.title} <span style={{ color: COLORS.muted, fontWeight: 400 }}>· {m.year}</span></div>
                  <Badge where={m.where} />
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontFamily: "'Fraunces', serif", fontSize: 23, fontWeight: 600, color: i === 0 ? COLORS.you : COLORS.text, lineHeight: 1 }}>
                    {Math.round(m.score * 100)}<span style={{ fontSize: 13, color: COLORS.muted }}>%</span>
                  </div>
                  <div style={{ fontSize: 10.5, color: COLORS.muted, letterSpacing: 0.4, textTransform: "uppercase", marginTop: 3 }}>match</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function TabBtn({ active, onClick, icon, label }) {
  return (
    <button onClick={onClick} style={{
      flex: 1, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7,
      fontSize: 12.5, fontWeight: 600, padding: "9px 10px", borderRadius: 8, cursor: "pointer",
      border: "none", transition: "all .15s",
      background: active ? "linear-gradient(135deg,#f5a623,#d4791b)" : "transparent",
      color: active ? "#1a1206" : COLORS.muted,
    }}>
      {icon}{label}
    </button>
  );
}

function Legend() {
  return (
    <div style={{ display: "flex", gap: 18, justifyContent: "center", fontSize: 12 }}>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 6, color: COLORS.muted }}>
        <span style={{ width: 11, height: 3, borderRadius: 2, background: COLORS.you }} /> You
      </span>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 6, color: COLORS.muted }}>
        <span style={{ width: 11, height: 3, borderRadius: 2, background: COLORS.movie }} /> Top match
      </span>
    </div>
  );
}
