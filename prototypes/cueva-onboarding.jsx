import React, { useState, useMemo } from "react";
import {
  RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, ResponsiveContainer,
} from "recharts";
import { Clapperboard, Check, Sparkles, Ticket, MonitorPlay, ArrowRight, SlidersHorizontal, RotateCcw } from "lucide-react";

/* ---------------- tokens ---------------- */
const FONTS = `@import url('https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,600;1,9..144,500&family=Hanken+Grotesk:wght@400;500;600;700&display=swap');`;
const C = { bg: "#0c0a09", panel: "#16130f", line: "#2a241d", text: "#f3ead9", muted: "#9c9081", you: "#f5a623", movie: "#4fd1c5" };

const AXES = [
  { key: "action", label: "Action" }, { key: "comedy", label: "Comedy" },
  { key: "romance", label: "Romance" }, { key: "scifi", label: "Sci-Fi" },
  { key: "adventure", label: "Adventure" }, { key: "drama", label: "Drama" },
  { key: "horror", label: "Horror" },
];
const GENRE_COLOR = {
  action: "#f5a623", comedy: "#f2c94c", romance: "#e64980", scifi: "#4fd1c5",
  adventure: "#51cf66", drama: "#9775fa", horror: "#e03131",
};
const VIBE = {
  action: "the rush", comedy: "the laughs", romance: "the heart", scifi: "the wonder",
  adventure: "the journey", drama: "the depth", horror: "the dread",
};
const MIN_PICKS = 5;

/* ---------------- catalog (illustrative fingerprints, 0–10) ---------------- */
const CATALOG = [
  { id: 1, t: "Mad Max: Fury Road", y: 2015, w: "Max", fp: { action: 10, comedy: 1, romance: 2, scifi: 7, adventure: 8, drama: 4, horror: 2 } },
  { id: 2, t: "Dune: Part Two", y: 2024, w: "Theaters", fp: { action: 6, comedy: 1, romance: 4, scifi: 10, adventure: 8, drama: 7, horror: 2 } },
  { id: 3, t: "The Notebook", y: 2004, w: "Netflix", fp: { action: 1, comedy: 2, romance: 10, scifi: 0, adventure: 2, drama: 8, horror: 0 } },
  { id: 4, t: "Get Out", y: 2017, w: "Peacock", fp: { action: 3, comedy: 3, romance: 1, scifi: 3, adventure: 1, drama: 6, horror: 8 } },
  { id: 5, t: "Guardians of the Galaxy", y: 2014, w: "Disney+", fp: { action: 8, comedy: 8, romance: 3, scifi: 8, adventure: 9, drama: 4, horror: 1 } },
  { id: 6, t: "Hereditary", y: 2018, w: "Max", fp: { action: 1, comedy: 0, romance: 1, scifi: 1, adventure: 1, drama: 7, horror: 10 } },
  { id: 7, t: "La La Land", y: 2016, w: "Prime", fp: { action: 1, comedy: 5, romance: 8, scifi: 0, adventure: 2, drama: 7, horror: 0 } },
  { id: 8, t: "Jurassic Park", y: 1993, w: "Peacock", fp: { action: 8, comedy: 3, romance: 2, scifi: 8, adventure: 9, drama: 4, horror: 4 } },
  { id: 9, t: "Superbad", y: 2007, w: "Netflix", fp: { action: 1, comedy: 10, romance: 4, scifi: 0, adventure: 3, drama: 2, horror: 0 } },
  { id: 10, t: "Interstellar", y: 2014, w: "Paramount+", fp: { action: 4, comedy: 1, romance: 3, scifi: 10, adventure: 7, drama: 8, horror: 1 } },
  { id: 11, t: "Knives Out", y: 2019, w: "Theaters", fp: { action: 2, comedy: 6, romance: 2, scifi: 0, adventure: 3, drama: 6, horror: 1 } },
  { id: 12, t: "Alien", y: 1979, w: "Hulu", fp: { action: 6, comedy: 0, romance: 1, scifi: 9, adventure: 5, drama: 3, horror: 9 } },
  { id: 13, t: "Pride & Prejudice", y: 2005, w: "Netflix", fp: { action: 0, comedy: 3, romance: 9, scifi: 0, adventure: 2, drama: 7, horror: 0 } },
  { id: 14, t: "John Wick", y: 2014, w: "Prime", fp: { action: 10, comedy: 1, romance: 1, scifi: 1, adventure: 4, drama: 3, horror: 2 } },
  { id: 15, t: "Bridesmaids", y: 2011, w: "Peacock", fp: { action: 1, comedy: 9, romance: 4, scifi: 0, adventure: 2, drama: 3, horror: 0 } },
  { id: 16, t: "Inception", y: 2010, w: "Max", fp: { action: 7, comedy: 1, romance: 3, scifi: 9, adventure: 6, drama: 6, horror: 1 } },
  { id: 17, t: "The Dark Knight", y: 2008, w: "Max", fp: { action: 8, comedy: 2, romance: 2, scifi: 2, adventure: 5, drama: 7, horror: 3 } },
  { id: 18, t: "Parasite", y: 2019, w: "Hulu", fp: { action: 3, comedy: 5, romance: 1, scifi: 0, adventure: 2, drama: 9, horror: 4 } },
  { id: 19, t: "LOTR: Fellowship", y: 2001, w: "Max", fp: { action: 7, comedy: 2, romance: 2, scifi: 2, adventure: 10, drama: 6, horror: 3 } },
  { id: 20, t: "Everything Everywhere", y: 2022, w: "Prime", fp: { action: 6, comedy: 8, romance: 4, scifi: 8, adventure: 6, drama: 7, horror: 1 } },
  { id: 21, t: "A Quiet Place", y: 2018, w: "Paramount+", fp: { action: 4, comedy: 0, romance: 2, scifi: 5, adventure: 2, drama: 5, horror: 9 } },
  { id: 22, t: "Her", y: 2013, w: "Netflix", fp: { action: 0, comedy: 3, romance: 8, scifi: 7, adventure: 1, drama: 8, horror: 0 } },
  { id: 23, t: "Gladiator", y: 2000, w: "Prime", fp: { action: 8, comedy: 1, romance: 2, scifi: 0, adventure: 6, drama: 7, horror: 2 } },
  { id: 24, t: "Scream", y: 1996, w: "Max", fp: { action: 3, comedy: 4, romance: 1, scifi: 0, adventure: 1, drama: 2, horror: 9 } },
  { id: 25, t: "The Martian", y: 2015, w: "Disney+", fp: { action: 3, comedy: 6, romance: 1, scifi: 9, adventure: 7, drama: 6, horror: 1 } },
  { id: 26, t: "Crazy Rich Asians", y: 2018, w: "Max", fp: { action: 1, comedy: 7, romance: 8, scifi: 0, adventure: 3, drama: 5, horror: 0 } },
  { id: 27, t: "Blade Runner 2049", y: 2017, w: "Netflix", fp: { action: 5, comedy: 1, romance: 3, scifi: 10, adventure: 5, drama: 8, horror: 2 } },
  { id: 28, t: "Whiplash", y: 2014, w: "Prime", fp: { action: 1, comedy: 1, romance: 2, scifi: 0, adventure: 1, drama: 10, horror: 2 } },
];

/* ---------------- helpers ---------------- */
function cosine(a, b) {
  let dot = 0, na = 0, nb = 0;
  for (const { key } of AXES) { dot += a[key] * b[key]; na += a[key] ** 2; nb += b[key] ** 2; }
  return na && nb ? dot / (Math.sqrt(na) * Math.sqrt(nb)) : 0;
}
function topAxes(fp, n = 2) {
  return [...AXES].sort((a, b) => fp[b.key] - fp[a.key]).slice(0, n);
}
function gradientFor(fp) {
  const [a, b] = topAxes(fp, 2);
  return `linear-gradient(145deg, ${GENRE_COLOR[a.key]}cc, ${GENRE_COLOR[b.key]}99 70%, #0c0a09 140%)`;
}

/* ---------------- atoms ---------------- */
function Badge({ w }) {
  const th = w === "Theaters";
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, fontWeight: 600, padding: "3px 9px", borderRadius: 999,
      background: th ? "rgba(245,166,35,0.14)" : "rgba(79,209,197,0.12)", color: th ? C.you : C.movie,
      border: `1px solid ${th ? "rgba(245,166,35,0.35)" : "rgba(79,209,197,0.3)"}` }}>
      {th ? <Ticket size={12} /> : <MonitorPlay size={12} />}{th ? "In Theaters" : w}
    </span>
  );
}
function MiniRadar({ fp, you, size = 84 }) {
  const data = AXES.map((a) => ({ axis: a.label, you: you[a.key], movie: fp[a.key] }));
  return (
    <div style={{ width: size, height: size }}>
      <ResponsiveContainer>
        <RadarChart data={data} outerRadius="78%">
          <PolarGrid stroke={C.line} />
          <PolarAngleAxis dataKey="axis" tick={false} />
          <Radar dataKey="you" stroke={C.you} fill={C.you} fillOpacity={0.1} strokeWidth={1} />
          <Radar dataKey="movie" stroke={C.movie} fill={C.movie} fillOpacity={0.22} strokeWidth={1.4} />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ---------------- app ---------------- */
export default function Onboarding() {
  const [step, setStep] = useState("welcome"); // welcome | pick | reveal | matches
  const [picked, setPicked] = useState([]);
  const [profile, setProfile] = useState(null); // tunable fingerprint
  const [tuneOpen, setTuneOpen] = useState(false);

  const derived = useMemo(() => {
    if (!picked.length) return AXES.reduce((o, a) => ({ ...o, [a.key]: 0 }), {});
    return AXES.reduce((o, a) => {
      o[a.key] = picked.reduce((s, id) => s + CATALOG.find((m) => m.id === id).fp[a.key], 0) / picked.length;
      return o;
    }, {});
  }, [picked]);

  const toggle = (id) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  const goReveal = () => {
    setProfile(AXES.reduce((o, a) => ({ ...o, [a.key]: Math.round(derived[a.key]) }), {}));
    setStep("reveal");
  };

  const matches = useMemo(() => {
    if (!profile) return [];
    return CATALOG.filter((m) => !picked.includes(m.id))
      .map((m) => ({ ...m, score: cosine(profile, m.fp) }))
      .sort((a, b) => b.score - a.score).slice(0, 6);
  }, [profile, picked]);

  const reset = () => { setPicked([]); setProfile(null); setTuneOpen(false); setStep("welcome"); };

  const stepIndex = { welcome: 0, pick: 1, reveal: 2, matches: 3 }[step];

  return (
    <div style={{ background: C.bg, color: C.text, fontFamily: "'Hanken Grotesk',sans-serif", borderRadius: 18, overflow: "hidden", minHeight: 560, position: "relative" }}>
      <style>{FONTS}</style>
      <style>{`
        @keyframes rise{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:none}}
        @keyframes pop{from{opacity:0;transform:scale(.92)}to{opacity:1;transform:none}}
        .screen{animation:rise .45s ease both}
        .cv-slider{-webkit-appearance:none;appearance:none;height:4px;border-radius:999px;background:${C.line};outline:none}
        .cv-slider::-webkit-slider-thumb{-webkit-appearance:none;width:15px;height:15px;border-radius:50%;background:${C.you};cursor:pointer;box-shadow:0 0 0 4px rgba(245,166,35,.18)}
        .cv-slider::-moz-range-thumb{width:15px;height:15px;border:none;border-radius:50%;background:${C.you};cursor:pointer}
        .pickcard{cursor:pointer;transition:transform .15s,box-shadow .2s}
        .pickcard:hover{transform:translateY(-3px)}
      `}</style>

      {/* atmosphere */}
      <div style={{ position: "absolute", inset: 0, pointerEvents: "none",
        background: "radial-gradient(90% 60% at 15% 0%, rgba(245,166,35,0.12), transparent 60%), radial-gradient(90% 60% at 100% 10%, rgba(79,209,197,0.10), transparent 55%)" }} />

      {/* progress */}
      {step !== "welcome" && (
        <div style={{ position: "relative", display: "flex", gap: 6, padding: "16px 22px 0" }}>
          {[0, 1, 2, 3].map((i) => (
            <div key={i} style={{ height: 3, flex: 1, borderRadius: 999, background: i <= stepIndex ? C.you : C.line, transition: "background .3s" }} />
          ))}
        </div>
      )}

      {/* ---------- WELCOME ---------- */}
      {step === "welcome" && (
        <div className="screen" style={{ position: "relative", padding: "64px 30px", textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center" }}>
          <div style={{ width: 52, height: 52, borderRadius: 15, display: "grid", placeItems: "center", marginBottom: 22,
            background: "linear-gradient(135deg,#f5a623,#d4791b)", boxShadow: "0 10px 36px rgba(245,166,35,.4)" }}>
            <Clapperboard size={28} color="#1a1206" />
          </div>
          <h1 style={{ fontFamily: "'Fraunces',serif", fontSize: 38, fontWeight: 600, letterSpacing: -1, margin: 0, lineHeight: 1.05, maxWidth: 440 }}>
            Find your next film by <span style={{ fontStyle: "italic", color: C.you }}>feel</span>.
          </h1>
          <p style={{ color: C.muted, fontSize: 15.5, lineHeight: 1.6, maxWidth: 400, marginTop: 16 }}>
            Tell us a handful of movies you love. We’ll read their fingerprint, draw yours, and match you to what’s on tonight.
          </p>
          <button onClick={() => setStep("pick")} style={{ marginTop: 30, display: "inline-flex", alignItems: "center", gap: 9, fontSize: 15.5, fontWeight: 700,
            padding: "14px 28px", borderRadius: 13, border: "none", cursor: "pointer", color: "#1a1206", background: "linear-gradient(135deg,#f5a623,#d4791b)" }}>
            Build my fingerprint <ArrowRight size={18} />
          </button>
        </div>
      )}

      {/* ---------- PICK ---------- */}
      {step === "pick" && (
        <div className="screen" style={{ position: "relative", padding: "18px 22px 120px" }}>
          <h2 style={{ fontFamily: "'Fraunces',serif", fontSize: 25, fontWeight: 600, margin: "10px 0 4px" }}>Pick films you love</h2>
          <p style={{ color: C.muted, fontSize: 13.5, margin: "0 0 18px" }}>The more honest, the better the match. Choose at least {MIN_PICKS}.</p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(118px, 1fr))", gap: 12 }}>
            {CATALOG.map((m, i) => {
              const on = picked.includes(m.id);
              const top = topAxes(m.fp, 1)[0];
              return (
                <div key={m.id} className="pickcard" onClick={() => toggle(m.id)} style={{ animation: `rise .4s ease both`, animationDelay: `${i * 22}ms` }}>
                  <div style={{ position: "relative", aspectRatio: "2/3", borderRadius: 13, overflow: "hidden", background: gradientFor(m.fp),
                    border: `2px solid ${on ? C.you : "transparent"}`, boxShadow: on ? "0 8px 26px rgba(245,166,35,.35)" : "0 6px 18px rgba(0,0,0,.4)",
                    display: "flex", flexDirection: "column", justifyContent: "flex-end", padding: 11 }}>
                    <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, rgba(8,7,6,.85), transparent 60%)" }} />
                    {on && (
                      <div style={{ position: "absolute", top: 9, right: 9, width: 24, height: 24, borderRadius: "50%", background: C.you,
                        display: "grid", placeItems: "center", animation: "pop .2s ease both" }}>
                        <Check size={15} color="#1a1206" strokeWidth={3} />
                      </div>
                    )}
                    <div style={{ position: "absolute", top: 10, left: 10, fontSize: 9.5, fontWeight: 700, letterSpacing: 0.6, textTransform: "uppercase",
                      color: "rgba(255,255,255,.85)", textShadow: "0 1px 4px rgba(0,0,0,.5)" }}>{top.label}</div>
                    <div style={{ position: "relative" }}>
                      <div style={{ fontFamily: "'Fraunces',serif", fontSize: 14.5, fontWeight: 600, lineHeight: 1.15, textShadow: "0 1px 6px rgba(0,0,0,.6)" }}>{m.t}</div>
                      <div style={{ fontSize: 11, color: "rgba(243,234,217,.7)", marginTop: 2 }}>{m.y}</div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* sticky footer: fingerprint forming + CTA */}
          <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, padding: "14px 22px", display: "flex", alignItems: "center", gap: 14,
            background: "linear-gradient(to top, rgba(12,10,9,.98) 70%, transparent)", borderTop: `1px solid ${C.line}` }}>
            <div style={{ width: 52, height: 52, flexShrink: 0, opacity: picked.length ? 1 : 0.35, transition: "opacity .3s" }}>
              <ResponsiveContainer>
                <RadarChart data={AXES.map((a) => ({ axis: a.label, v: derived[a.key] }))} outerRadius="80%">
                  <PolarGrid stroke={C.line} />
                  <PolarAngleAxis dataKey="axis" tick={false} />
                  <PolarRadiusAxis domain={[0, 10]} tick={false} axisLine={false} />
                  <Radar dataKey="v" stroke={C.you} fill={C.you} fillOpacity={0.35} strokeWidth={1.5} isAnimationActive />
                </RadarChart>
              </ResponsiveContainer>
            </div>
            <div style={{ flex: 1, fontSize: 13 }}>
              <div style={{ fontWeight: 700 }}>{picked.length} selected</div>
              <div style={{ color: C.muted, fontSize: 12 }}>{picked.length >= MIN_PICKS ? "Your fingerprint is taking shape" : `${MIN_PICKS - picked.length} more to go`}</div>
            </div>
            <button disabled={picked.length < MIN_PICKS} onClick={goReveal} style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 14.5, fontWeight: 700,
              padding: "12px 20px", borderRadius: 12, border: "none", cursor: picked.length < MIN_PICKS ? "default" : "pointer", color: "#1a1206",
              opacity: picked.length < MIN_PICKS ? 0.4 : 1, background: "linear-gradient(135deg,#f5a623,#d4791b)" }}>
              Continue <ArrowRight size={17} />
            </button>
          </div>
        </div>
      )}

      {/* ---------- REVEAL ---------- */}
      {step === "reveal" && profile && (
        <div className="screen" style={{ position: "relative", padding: "8px 24px 26px", textAlign: "center" }}>
          <div style={{ fontSize: 12.5, color: C.muted, letterSpacing: 1, textTransform: "uppercase", marginTop: 10 }}>Your movie fingerprint</div>
          <h2 style={{ fontFamily: "'Fraunces',serif", fontSize: 27, fontWeight: 600, margin: "6px 0 2px" }}>
            You’re here for {VIBE[topAxes(profile, 1)[0].key]}.
          </h2>
          <div style={{ display: "flex", gap: 8, justifyContent: "center", margin: "12px 0 4px", flexWrap: "wrap" }}>
            {topAxes(profile, 3).map((a) => (
              <span key={a.key} style={{ fontSize: 12.5, fontWeight: 600, padding: "5px 12px", borderRadius: 999,
                background: `${GENRE_COLOR[a.key]}22`, color: GENRE_COLOR[a.key], border: `1px solid ${GENRE_COLOR[a.key]}55` }}>{a.label}</span>
            ))}
          </div>
          <div style={{ height: 270 }}>
            <ResponsiveContainer>
              <RadarChart data={AXES.map((a) => ({ axis: a.label, v: profile[a.key] }))} outerRadius="72%">
                <PolarGrid stroke={C.line} />
                <PolarAngleAxis dataKey="axis" tick={{ fill: C.muted, fontSize: 12, fontWeight: 600 }} />
                <PolarRadiusAxis domain={[0, 10]} tick={false} axisLine={false} />
                <Radar dataKey="v" stroke={C.you} fill={C.you} fillOpacity={0.28} strokeWidth={2} />
              </RadarChart>
            </ResponsiveContainer>
          </div>

          <button onClick={() => setTuneOpen((o) => !o)} style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 12.5, fontWeight: 600,
            color: C.muted, background: "transparent", border: `1px solid ${C.line}`, borderRadius: 999, padding: "7px 14px", cursor: "pointer" }}>
            <SlidersHorizontal size={13} /> {tuneOpen ? "Hide fine-tuning" : "Fine-tune (optional)"}
          </button>
          {tuneOpen && (
            <div style={{ marginTop: 16, textAlign: "left", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px 22px", animation: "rise .3s ease both" }}>
              {AXES.map((a) => (
                <div key={a.key}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 4 }}>
                    <span style={{ fontWeight: 600 }}>{a.label}</span><span style={{ color: C.you, fontWeight: 700 }}>{profile[a.key]}</span>
                  </div>
                  <input className="cv-slider" type="range" min={0} max={10} value={profile[a.key]} style={{ width: "100%" }}
                    onChange={(e) => setProfile((p) => ({ ...p, [a.key]: +e.target.value }))} />
                </div>
              ))}
            </div>
          )}

          <button onClick={() => setStep("matches")} style={{ marginTop: 22, width: "100%", display: "inline-flex", alignItems: "center", justifyContent: "center",
            gap: 9, fontSize: 15.5, fontWeight: 700, padding: "14px", borderRadius: 13, border: "none", cursor: "pointer", color: "#1a1206",
            background: "linear-gradient(135deg,#f5a623,#d4791b)" }}>
            <Sparkles size={18} /> Show my matches
          </button>
        </div>
      )}

      {/* ---------- MATCHES ---------- */}
      {step === "matches" && profile && (
        <div className="screen" style={{ position: "relative", padding: "10px 22px 26px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "8px 0 16px" }}>
            <Sparkles size={17} color={C.you} />
            <h2 style={{ fontFamily: "'Fraunces',serif", fontSize: 22, fontWeight: 600, margin: 0 }}>Matched to your fingerprint</h2>
          </div>
          <div>
            {matches.map((m, i) => (
              <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 13, padding: "11px 6px", borderBottom: i < matches.length - 1 ? `1px solid ${C.line}` : "none",
                animation: "rise .4s ease both", animationDelay: `${i * 60}ms` }}>
                <div style={{ fontFamily: "'Fraunces',serif", fontSize: 18, color: C.muted, width: 18, textAlign: "center" }}>{i + 1}</div>
                <MiniRadar fp={m.fp} you={profile} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>{m.t} <span style={{ color: C.muted, fontWeight: 400 }}>· {m.y}</span></div>
                  <Badge w={m.w} />
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontFamily: "'Fraunces',serif", fontSize: 21, fontWeight: 600, color: i === 0 ? C.you : C.text, lineHeight: 1 }}>
                    {Math.round(m.score * 100)}<span style={{ fontSize: 12, color: C.muted }}>%</span>
                  </div>
                  <div style={{ fontSize: 10, color: C.muted, textTransform: "uppercase", letterSpacing: 0.4, marginTop: 2 }}>match</div>
                </div>
              </div>
            ))}
          </div>
          <button onClick={reset} style={{ marginTop: 20, display: "inline-flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 600,
            color: C.muted, background: "transparent", border: `1px solid ${C.line}`, borderRadius: 999, padding: "9px 16px", cursor: "pointer" }}>
            <RotateCcw size={14} /> Start over
          </button>
        </div>
      )}
    </div>
  );
}
