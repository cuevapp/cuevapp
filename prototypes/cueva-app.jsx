import React, { useState, useMemo, useEffect } from "react";
import {
  RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, ResponsiveContainer,
} from "recharts";
import {
  Clapperboard, Check, Sparkles, Ticket, MonitorPlay, ArrowRight, Heart, ThumbsDown, Eye, EyeOff,
  Home as HomeIcon, Compass, User, Moon, TrendingUp, TrendingDown, RotateCcw, SlidersHorizontal, Loader2,
  Mail, Lock, AlertCircle, LogOut, ShieldCheck,
} from "lucide-react";

/* ===================== tokens ===================== */
const FONTS = `@import url('https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,600;1,9..144,500&family=Hanken+Grotesk:wght@400;500;600;700&display=swap');`;
const C = { bg: "#0c0a09", panel: "#16130f", line: "#2a241d", text: "#f3ead9", muted: "#9c9081", base: "#f5a623", learned: "#4fd1c5" };

const AXES = [
  { key: "action", label: "Action" }, { key: "comedy", label: "Comedy" }, { key: "romance", label: "Romance" },
  { key: "scifi", label: "Sci-Fi" }, { key: "adventure", label: "Adventure" }, { key: "drama", label: "Drama" }, { key: "horror", label: "Horror" },
];
const GENRE_COLOR = { action: "#f5a623", comedy: "#f2c94c", romance: "#e64980", scifi: "#4fd1c5", adventure: "#51cf66", drama: "#9775fa", horror: "#e03131" };
const VIBE = { action: "the rush", comedy: "the laughs", romance: "the heart", scifi: "the wonder", adventure: "the journey", drama: "the depth", horror: "the dread" };
const W = { love: 0.25, dislike: -0.18, hide: -0.12, seen: 0 };
const MIN_PICKS = 5;
const SERVICES = ["Netflix", "Max", "Prime"];
const MOODS = [
  { id: "scary", label: "Something scary", delta: { horror: 5, drama: 1 } },
  { id: "funny", label: "Easy laughs", delta: { comedy: 5, romance: 1 } },
  { id: "epic", label: "Big & epic", delta: { action: 4, adventure: 4 } },
  { id: "cry", label: "A good cry", delta: { drama: 4, romance: 3 } },
  { id: "trip", label: "Mind-bender", delta: { scifi: 4, drama: 1 } },
];

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

/* ===================== helpers ===================== */
const clamp = (v) => Math.max(0, Math.min(10, v));
function cosine(a, b) {
  let d = 0, na = 0, nb = 0;
  for (const { key } of AXES) { d += a[key] * b[key]; na += a[key] ** 2; nb += b[key] ** 2; }
  return na && nb ? d / (Math.sqrt(na) * Math.sqrt(nb)) : 0;
}
function deriveBase(likedIds) {
  if (!likedIds.length) return AXES.reduce((o, a) => ({ ...o, [a.key]: 5 }), {});
  return AXES.reduce((o, a) => {
    o[a.key] = Math.round(likedIds.reduce((s, id) => s + CATALOG.find((m) => m.id === id).fp[a.key], 0) / likedIds.length);
    return o;
  }, {});
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
function applyMood(fp, mood) {
  if (!mood) return { ...fp };
  return AXES.reduce((o, a) => ({ ...o, [a.key]: clamp(fp[a.key] + (mood.delta[a.key] || 0)) }), {});
}
const topAxes = (fp, n) => [...AXES].sort((a, b) => fp[b.key] - fp[a.key]).slice(0, n);
function gradientFor(fp) { const [a, b] = topAxes(fp, 2); return `linear-gradient(150deg, ${GENRE_COLOR[a.key]}cc, ${GENRE_COLOR[b.key]}88 72%, #0c0a09 150%)`; }
function rank(vec, { filter, exclude = [], offset = 0 } = {}) {
  const ex = new Set(exclude);
  return CATALOG.filter((m) => !ex.has(m.id)).filter((m) => (filter ? filter(m) : true))
    .map((m) => ({ ...m, score: cosine(vec, m.fp) })).sort((a, b) => b.score - a.score).slice(offset, offset + 12);
}

/* ===================== atoms ===================== */
function Badge({ w, small }) {
  const th = w === "Theaters";
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: small ? 10.5 : 11, fontWeight: 600, color: th ? C.base : C.learned }}>
      {th ? <Ticket size={small ? 11 : 12} /> : <MonitorPlay size={small ? 11 : 12} />}{th ? "Theaters" : w}
    </span>
  );
}
function Poster({ fp, w, h, pct }) {
  return (
    <div style={{ width: w, height: h, flexShrink: 0, borderRadius: 11, background: gradientFor(fp), position: "relative", overflow: "hidden", boxShadow: "0 6px 16px rgba(0,0,0,.4)" }}>
      <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, rgba(8,7,6,.78), transparent 58%)" }} />
      {pct != null && (
        <div style={{ position: "absolute", top: 7, right: 7, fontSize: 10.5, fontWeight: 700, padding: "2px 6px", borderRadius: 999, background: "rgba(12,10,9,.72)", color: C.base }}>{pct}%</div>
      )}
    </div>
  );
}
function ShelfRow({ films, you }) {
  return (
    <div style={{ display: "flex", gap: 11, overflowX: "auto", padding: "2px 18px 6px" }}>
      {films.map((m) => (
        <div key={m.id} style={{ width: 116, flexShrink: 0 }}>
          <Poster fp={m.fp} w={116} h={170} pct={Math.round(cosine(you, m.fp) * 100)} />
          <div style={{ fontSize: 12.5, fontWeight: 700, marginTop: 6, lineHeight: 1.2 }}>{m.t}</div>
          <div style={{ marginTop: 3 }}><Badge w={m.w} small /></div>
        </div>
      ))}
    </div>
  );
}
function Shelf({ icon, title, subtitle, films, you }) {
  if (!films.length) return null;
  return (
    <section style={{ marginTop: 20 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "0 18px", marginBottom: 10 }}>
        {icon}<h3 style={{ fontFamily: "'Fraunces',serif", fontSize: 16.5, fontWeight: 600, margin: 0 }}>{title}</h3>
        {subtitle && <span style={{ fontSize: 11.5, color: C.muted }}>{subtitle}</span>}
      </div>
      <ShelfRow films={films.slice(0, 10)} you={you} />
    </section>
  );
}
function BigRadar({ base, eff, showEff, height = 240 }) {
  const data = AXES.map((a) => ({ axis: a.label, base: base[a.key], eff: eff[a.key] }));
  return (
    <div style={{ height }}>
      <ResponsiveContainer>
        <RadarChart data={data} outerRadius="72%">
          <PolarGrid stroke={C.line} />
          <PolarAngleAxis dataKey="axis" tick={{ fill: C.muted, fontSize: 11.5, fontWeight: 600 }} />
          <PolarRadiusAxis domain={[0, 10]} tick={false} axisLine={false} />
          <Radar dataKey="base" stroke={C.base} fill={C.base} fillOpacity={showEff ? 0.16 : 0.26} strokeWidth={1.8} />
          {showEff && <Radar dataKey="eff" stroke={C.learned} fill={C.learned} fillOpacity={0.18} strokeWidth={2} isAnimationActive />}
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
}
function CompactRadar({ base, eff, showEff, size = 100 }) {
  const data = AXES.map((a) => ({ axis: a.label, base: base[a.key], eff: eff[a.key] }));
  return (
    <div style={{ width: size, height: size, flexShrink: 0 }}>
      <ResponsiveContainer>
        <RadarChart data={data} outerRadius="80%">
          <PolarGrid stroke={C.line} />
          <PolarAngleAxis dataKey="axis" tick={false} />
          <PolarRadiusAxis domain={[0, 10]} tick={false} axisLine={false} />
          <Radar dataKey="base" stroke={C.base} fill={C.base} fillOpacity={0.18} strokeWidth={1.5} />
          {showEff && <Radar dataKey="eff" stroke={C.learned} fill={C.learned} fillOpacity={0.16} strokeWidth={1.6} isAnimationActive />}
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
}
function Pills({ fp }) {
  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
      {topAxes(fp, 3).map((a) => (
        <span key={a.key} style={{ fontSize: 11, fontWeight: 600, padding: "3px 9px", borderRadius: 999, background: `${GENRE_COLOR[a.key]}22`, color: GENRE_COLOR[a.key], border: `1px solid ${GENRE_COLOR[a.key]}44` }}>{a.label}</span>
      ))}
    </div>
  );
}
const Logo = () => (
  <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
    <div style={{ width: 30, height: 30, borderRadius: 9, display: "grid", placeItems: "center", background: "linear-gradient(135deg,#f5a623,#d4791b)" }}>
      <Clapperboard size={17} color="#1a1206" />
    </div>
    <span style={{ fontFamily: "'Fraunces',serif", fontSize: 19, fontWeight: 600 }}>Cueva</span>
  </div>
);

/* ===================== onboarding ===================== */
function Onboarding({ onDone }) {
  const [step, setStep] = useState("welcome");
  const [picked, setPicked] = useState([]);
  const base = useMemo(() => deriveBase(picked), [picked]);

  if (step === "welcome") {
    return (
      <div style={{ padding: "70px 30px", textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center" }}>
        <div style={{ width: 52, height: 52, borderRadius: 15, display: "grid", placeItems: "center", marginBottom: 22, background: "linear-gradient(135deg,#f5a623,#d4791b)", boxShadow: "0 10px 36px rgba(245,166,35,.4)" }}>
          <Clapperboard size={28} color="#1a1206" />
        </div>
        <h1 style={{ fontFamily: "'Fraunces',serif", fontSize: 36, fontWeight: 600, letterSpacing: -1, margin: 0, lineHeight: 1.05, maxWidth: 430 }}>
          Find your next film by <span style={{ fontStyle: "italic", color: C.base }}>feel</span>.
        </h1>
        <p style={{ color: C.muted, fontSize: 15, lineHeight: 1.6, maxWidth: 380, marginTop: 16 }}>
          Tell us a few movies you love. We'll read their fingerprint, draw yours, and learn as you go.
        </p>
        <button onClick={() => setStep("pick")} style={{ marginTop: 28, display: "inline-flex", alignItems: "center", gap: 9, fontSize: 15.5, fontWeight: 700, padding: "14px 28px", borderRadius: 13, border: "none", cursor: "pointer", color: "#1a1206", background: "linear-gradient(135deg,#f5a623,#d4791b)" }}>
          Build my fingerprint <ArrowRight size={18} />
        </button>
      </div>
    );
  }
  if (step === "pick") {
    const toggle = (id) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
    return (
      <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
        <div style={{ padding: "18px 20px 8px" }}>
          <h2 style={{ fontFamily: "'Fraunces',serif", fontSize: 24, fontWeight: 600, margin: "4px 0 2px" }}>Pick films you love</h2>
          <p style={{ color: C.muted, fontSize: 13, margin: 0 }}>Choose at least {MIN_PICKS}.</p>
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: "8px 20px 16px" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(104px,1fr))", gap: 11 }}>
            {CATALOG.map((m) => {
              const on = picked.includes(m.id);
              return (
                <div key={m.id} onClick={() => toggle(m.id)} style={{ cursor: "pointer" }}>
                  <div style={{ position: "relative", aspectRatio: "2/3", borderRadius: 12, overflow: "hidden", background: gradientFor(m.fp), border: `2px solid ${on ? C.base : "transparent"}`, boxShadow: on ? "0 8px 22px rgba(245,166,35,.32)" : "0 4px 14px rgba(0,0,0,.4)", display: "flex", flexDirection: "column", justifyContent: "flex-end", padding: 9 }}>
                    <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, rgba(8,7,6,.82), transparent 58%)" }} />
                    {on && <div style={{ position: "absolute", top: 8, right: 8, width: 22, height: 22, borderRadius: "50%", background: C.base, display: "grid", placeItems: "center" }}><Check size={13} color="#1a1206" strokeWidth={3} /></div>}
                    <div style={{ position: "relative", fontFamily: "'Fraunces',serif", fontSize: 13, fontWeight: 600, lineHeight: 1.15 }}>{m.t}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        <div style={{ padding: "12px 20px", display: "flex", alignItems: "center", gap: 13, borderTop: `1px solid ${C.line}`, background: C.bg }}>
          <CompactRadar base={base} eff={base} showEff={false} size={48} />
          <div style={{ flex: 1, fontSize: 13 }}>
            <div style={{ fontWeight: 700 }}>{picked.length} selected</div>
            <div style={{ color: C.muted, fontSize: 12 }}>{picked.length >= MIN_PICKS ? "Looking good" : `${MIN_PICKS - picked.length} more to go`}</div>
          </div>
          <button disabled={picked.length < MIN_PICKS} onClick={() => setStep("reveal")} style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 14.5, fontWeight: 700, padding: "12px 20px", borderRadius: 12, border: "none", cursor: picked.length < MIN_PICKS ? "default" : "pointer", color: "#1a1206", opacity: picked.length < MIN_PICKS ? 0.4 : 1, background: "linear-gradient(135deg,#f5a623,#d4791b)" }}>
            Continue <ArrowRight size={17} />
          </button>
        </div>
      </div>
    );
  }
  // reveal
  return (
    <div style={{ padding: "26px 24px", textAlign: "center", overflowY: "auto", height: "100%" }}>
      <div style={{ fontSize: 12, color: C.muted, letterSpacing: 1, textTransform: "uppercase" }}>Your movie fingerprint</div>
      <h2 style={{ fontFamily: "'Fraunces',serif", fontSize: 26, fontWeight: 600, margin: "6px 0 8px" }}>You're here for {VIBE[topAxes(base, 1)[0].key]}.</h2>
      <div style={{ display: "flex", justifyContent: "center", marginBottom: 6 }}><Pills fp={base} /></div>
      <BigRadar base={base} eff={base} showEff={false} height={260} />
      <button onClick={() => onDone(picked, base)} style={{ marginTop: 18, width: "100%", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 9, fontSize: 15.5, fontWeight: 700, padding: "14px", borderRadius: 13, border: "none", cursor: "pointer", color: "#1a1206", background: "linear-gradient(135deg,#f5a623,#d4791b)" }}>
        <Sparkles size={18} /> Enter Cueva
      </button>
    </div>
  );
}

/* ===================== tabs ===================== */
function HomeTab({ base, eff, feedback, liked, mood, setMood }) {
  const [avail, setAvail] = useState("all");
  const exclude = [...liked, ...Object.keys(feedback).map(Number)];
  const homeVec = applyMood(eff, mood);
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const availFilter = avail === "theaters" ? (m) => m.w === "Theaters" : avail === "streaming" ? (m) => SERVICES.includes(m.w) : null;
  const anchor = CATALOG.find((m) => m.id === liked[0]);
  const hasFeedback = Object.keys(feedback).length > 0;

  return (
    <div>
      <div style={{ padding: "20px 18px 14px", background: "radial-gradient(110% 130% at 0% 0%, rgba(245,166,35,0.10), transparent 55%), radial-gradient(110% 130% at 100% 0%, rgba(79,209,197,0.10), transparent 55%)" }}>
        <Logo />
        <div style={{ display: "flex", gap: 14, alignItems: "center", marginTop: 14 }}>
          <CompactRadar base={base} eff={eff} showEff={hasFeedback} size={92} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12.5, color: C.muted }}>{greeting}</div>
            <div style={{ fontFamily: "'Fraunces',serif", fontSize: 20, fontWeight: 600, lineHeight: 1.15, margin: "1px 0 8px" }}>
              {mood ? <>Tonight, leaning <span style={{ color: C.learned }}>{topAxes(homeVec, 1)[0].label.toLowerCase()}</span></> : "What's on tonight?"}
            </div>
            <Pills fp={base} />
          </div>
        </div>
      </div>

      <div style={{ padding: "4px 18px 0" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12.5, color: C.muted, marginBottom: 9 }}><Moon size={13} /> Tonight I'm feeling…</div>
        <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 4 }}>
          {MOODS.map((m) => {
            const on = mood?.id === m.id;
            return <button key={m.id} onClick={() => setMood(on ? null : m)} style={{ flexShrink: 0, fontSize: 13, fontWeight: 600, padding: "8px 14px", borderRadius: 999, cursor: "pointer", background: on ? "rgba(79,209,197,0.16)" : C.panel, color: on ? C.learned : C.text, border: `1px solid ${on ? "rgba(79,209,197,0.45)" : C.line}` }}>{m.label}</button>;
          })}
        </div>
      </div>

      <div style={{ display: "flex", gap: 6, padding: "14px 18px 0" }}>
        {[["all", "All"], ["theaters", "🎟 Theaters"], ["streaming", "📺 Your services"]].map(([id, label]) => {
          const on = avail === id;
          return <button key={id} onClick={() => setAvail(id)} style={{ fontSize: 12.5, fontWeight: 600, padding: "7px 13px", borderRadius: 9, cursor: "pointer", background: on ? "rgba(245,166,35,0.16)" : "transparent", color: on ? C.base : C.muted, border: `1px solid ${on ? "rgba(245,166,35,0.4)" : C.line}` }}>{label}</button>;
        })}
      </div>

      <Shelf icon={<Sparkles size={15} color={C.base} />} title="Tonight's top matches" subtitle={mood ? "mood-adjusted" : "for you"} films={rank(homeVec, { filter: availFilter, exclude })} you={homeVec} />
      <Shelf icon={<Ticket size={15} color={C.base} />} title="In theaters now" films={rank(homeVec, { filter: (m) => m.w === "Theaters", exclude })} you={homeVec} />
      <Shelf icon={<MonitorPlay size={15} color={C.learned} />} title="On your services" subtitle={SERVICES.join(" · ")} films={rank(homeVec, { filter: (m) => SERVICES.includes(m.w), exclude })} you={homeVec} />
      {anchor && <Shelf icon={<Heart size={15} color={GENRE_COLOR.romance} />} title={`Because you loved ${anchor.t}`} films={rank(anchor.fp, { exclude })} you={homeVec} />}
      <Shelf icon={<Compass size={15} color={GENRE_COLOR.adventure} />} title="A little outside your usual" subtitle="stretch" films={rank(homeVec, { exclude, offset: 8 })} you={homeVec} />
      <div style={{ height: 16 }} />
    </div>
  );
}

const ACTIONS = [
  { sig: "love", label: "Love", icon: Heart, color: "#e64980" },
  { sig: "dislike", label: "Not for me", icon: ThumbsDown, color: "#e8888a" },
  { sig: "seen", label: "Seen", icon: Eye, color: C.muted },
  { sig: "hide", label: "Hide", icon: EyeOff, color: C.muted },
];
function DiscoverTab({ base, eff, feedback, liked, onFeedback }) {
  const count = Object.keys(feedback).length;
  const exclude = [...liked, ...Object.keys(feedback).map(Number)];
  const feed = rank(eff, { exclude }).slice(0, 5);
  let shift = { axis: null, delta: 0 };
  for (const a of AXES) { const d = eff[a.key] - base[a.key]; if (Math.abs(d) > Math.abs(shift.delta)) shift = { axis: a, delta: d }; }

  return (
    <div>
      <div style={{ padding: "20px 18px 14px", borderBottom: `1px solid ${C.line}`, background: "radial-gradient(110% 130% at 100% 0%, rgba(79,209,197,0.12), transparent 55%)" }}>
        <Logo />
        <div style={{ display: "flex", gap: 14, alignItems: "center", marginTop: 14 }}>
          <CompactRadar base={base} eff={eff} showEff={count > 0} size={96} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: "'Fraunces',serif", fontSize: 19, fontWeight: 600, lineHeight: 1.15 }}>{count === 0 ? "Sharpen your taste" : "Your fingerprint is learning"}</div>
            <div style={{ fontSize: 12.5, color: C.muted, marginTop: 4 }}>{count === 0 ? "React to films — the cyan shape moves." : `${count} signal${count > 1 ? "s" : ""} so far`}</div>
            {shift.axis && shift.delta !== 0 && (
              <div style={{ display: "inline-flex", alignItems: "center", gap: 6, marginTop: 9, fontSize: 12.5, fontWeight: 600, padding: "5px 11px", borderRadius: 999, background: `${GENRE_COLOR[shift.axis.key]}22`, color: GENRE_COLOR[shift.axis.key], border: `1px solid ${GENRE_COLOR[shift.axis.key]}55` }}>
                {shift.delta > 0 ? <TrendingUp size={13} /> : <TrendingDown size={13} />}{shift.axis.label} {shift.delta > 0 ? "+" : ""}{shift.delta}
              </div>
            )}
          </div>
        </div>
      </div>
      <div style={{ padding: "8px 16px 20px" }}>
        <div style={{ fontSize: 12.5, color: C.muted, padding: "12px 4px 6px" }}>Ranked by your current fingerprint</div>
        {feed.map((m) => (
          <div key={m.id} style={{ display: "flex", gap: 13, alignItems: "center", padding: "11px 4px", borderBottom: `1px solid ${C.line}` }}>
            <Poster fp={m.fp} w={50} h={75} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14.5, fontWeight: 700 }}>{m.t} <span style={{ color: C.muted, fontWeight: 400 }}>· {m.y}</span></div>
              <div style={{ fontSize: 12, color: C.base, fontWeight: 600, marginBottom: 8 }}>{Math.round(m.score * 100)}% match</div>
              <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
                {ACTIONS.map(({ sig, label, icon: Icon, color }) => (
                  <button key={sig} onClick={() => onFeedback(m.id, sig)} aria-label={label} style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11.5, fontWeight: 600, padding: "6px 10px", borderRadius: 9, cursor: "pointer", background: C.panel, color, border: `1px solid ${C.line}` }}>
                    <Icon size={14} /> {label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ))}
        {!feed.length && <div style={{ textAlign: "center", color: C.muted, fontSize: 13, padding: "30px 0" }}>You've reacted to everything on hand.</div>}
      </div>
    </div>
  );
}

function SessionCard({ session, now, event, onApiCall, onExpireAccess, onExpireSession }) {
  const accLive = now < session.accessExp;
  const accSecs = Math.max(0, Math.ceil((session.accessExp - now) / 1000));
  const refLive = now < session.refreshExp;
  const refMins = Math.max(0, Math.ceil((session.refreshExp - now) / 60000));
  const btn = { fontSize: 11.5, fontWeight: 600, padding: "7px 11px", borderRadius: 9, cursor: "pointer", background: "#100d0a", color: C.text, border: `1px solid ${C.line}` };
  const row = (label, val, color) => (
    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, marginBottom: 6 }}>
      <span style={{ color: C.muted }}>{label}</span><span style={{ fontWeight: 700, color }}>{val}</span>
    </div>
  );
  return (
    <div style={{ marginTop: 22, background: C.panel, border: `1px solid ${C.line}`, borderRadius: 14, padding: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 13, fontWeight: 600, marginBottom: 12 }}><ShieldCheck size={14} color={C.learned} /> Session</div>
      {row("Access token", accLive ? `valid · ${accSecs}s` : "expired", accLive ? C.learned : "#e8888a")}
      {row("Refresh token", refLive ? `valid · ~${refMins}m` : "expired", refLive ? C.text : "#e8888a")}
      <div style={{ display: "flex", gap: 7, flexWrap: "wrap", marginTop: 6 }}>
        <button style={{ ...btn, color: C.learned }} onClick={onApiCall}>Simulate API call</button>
        <button style={btn} onClick={onExpireAccess}>Expire access</button>
        <button style={btn} onClick={onExpireSession}>Expire session</button>
      </div>
      {event && <div style={{ fontSize: 11.5, color: C.muted, marginTop: 11, lineHeight: 1.5 }}>{event}</div>}
    </div>
  );
}

function ProfileTab({ base, eff, feedback, liked, setBase, onReset, email, onLogout, session, now, sessionEvent, onApiCall, onExpireAccess, onExpireSession }) {
  const count = Object.keys(feedback).length;
  return (
    <div style={{ padding: "20px 18px 24px" }}>
      <div style={{ display: "flex", alignItems: "center" }}>
        <Logo />
        {email && <span style={{ marginLeft: "auto", fontSize: 12, color: C.muted, maxWidth: 170, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{email}</span>}
      </div>
      <div style={{ textAlign: "center", marginTop: 10 }}>
        <BigRadar base={base} eff={eff} showEff={count > 0} height={250} />
        <div style={{ display: "flex", gap: 18, justifyContent: "center", fontSize: 11.5, color: C.muted, marginTop: 2 }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><span style={{ width: 11, height: 3, borderRadius: 2, background: C.base }} /> Base taste</span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><span style={{ width: 11, height: 3, borderRadius: 2, background: C.learned }} /> Learned</span>
        </div>
        <div style={{ display: "flex", justifyContent: "center", marginTop: 12 }}><Pills fp={eff} /></div>
        <div style={{ fontSize: 12.5, color: C.muted, marginTop: 10 }}>{liked.length} films loved at onboarding · {count} feedback signal{count === 1 ? "" : "s"}</div>
      </div>

      <div style={{ marginTop: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 13, fontWeight: 600, marginBottom: 12 }}><SlidersHorizontal size={14} color={C.base} /> Fine-tune your base taste</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px 22px" }}>
          {AXES.map((a) => (
            <div key={a.key}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 4 }}>
                <span style={{ fontWeight: 600 }}>{a.label}</span><span style={{ color: C.base, fontWeight: 700 }}>{base[a.key]}</span>
              </div>
              <input type="range" min={0} max={10} value={base[a.key]} onChange={(e) => setBase({ ...base, [a.key]: +e.target.value })} style={{ width: "100%", accentColor: C.base }} />
            </div>
          ))}
        </div>
      </div>

      {session && <SessionCard session={session} now={now} event={sessionEvent} onApiCall={onApiCall} onExpireAccess={onExpireAccess} onExpireSession={onExpireSession} />}

      <div style={{ display: "flex", gap: 10, marginTop: 22 }}>
        <button onClick={onReset} style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 600, color: C.muted, background: "transparent", border: `1px solid ${C.line}`, borderRadius: 999, padding: "9px 16px", cursor: "pointer" }}>
          <RotateCcw size={14} /> Start over
        </button>
        <button onClick={onLogout} style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 600, color: C.muted, background: "transparent", border: `1px solid ${C.line}`, borderRadius: 999, padding: "9px 16px", cursor: "pointer" }}>
          <LogOut size={14} /> Log out
        </button>
      </div>
    </div>
  );
}

/* ===================== shell ===================== */
const TABS = [
  { id: "home", label: "Home", icon: HomeIcon },
  { id: "discover", label: "Discover", icon: Compass },
  { id: "profile", label: "Profile", icon: User },
];

const STORE_PREFIX = "cueva_user_";          // per-account profile
const SESSION_KEY = "cueva_session";         // who's currently signed in
const ACCOUNTS_KEY = "cueva_accounts";       // mock provider's user store
const storage = () => (typeof window !== "undefined" ? window.storage : null);
const profileKey = (email) => STORE_PREFIX + email.replace(/[^a-z0-9]/g, "_");

/* ---------------------------------------------------------------------------
 * Mock identity provider — SANDBOX ONLY.
 * In production Cueva owns authorization, NOT identity: this screen calls your
 * IdP's SDK (Clerk / Auth0 / Cognito), the user authenticates there, and the app
 * receives a JWT that CuevaClient sends as a bearer token. Cueva NEVER sees or
 * stores the password — it only verifies the token's signature via JWKS.
 * The stand-in below fakes that handoff so the flow is demoable without a backend.
 * It salts+hashes only so a wrong password is rejected in the demo; this is NOT
 * how to store credentials on a real server (use your IdP, or argon2/bcrypt).
 * ------------------------------------------------------------------------- */
async function sha256(s) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
function randHex(n) {
  const b = new Uint8Array(n); crypto.getRandomValues(b);
  return [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
}
async function readAccounts() { try { const r = await storage()?.get(ACCOUNTS_KEY); return r?.value ? JSON.parse(r.value) : {}; } catch { return {}; } }
async function writeAccounts(a) { try { await storage()?.set(ACCOUNTS_KEY, JSON.stringify(a)); } catch { /* ignore */ } }
const ACCESS_TTL_MS = 45000;            // demo: access token lives 45s
const REFRESH_TTL_MS = 60 * 60 * 1000;  // refresh token lives 1h
function mintSession(email) {
  const now = Date.now();
  return {
    email,
    token: `acc_${email}_${randHex(5)}`, accessExp: now + ACCESS_TTL_MS,   // short-lived access (the bearer)
    refreshToken: `ref_${email}_${randHex(8)}`, refreshExp: now + REFRESH_TTL_MS, // long-lived refresh
  };
}
// Exchange a still-valid refresh token for a new access token (no re-login).
function refreshAccess(session) {
  return { ...session, token: `acc_${session.email}_${randHex(5)}`, accessExp: Date.now() + ACCESS_TTL_MS };
}

async function signUp(email, password) {
  email = email.trim().toLowerCase();
  const accts = await readAccounts();
  if (accts[email]) throw new Error("An account with that email already exists.");
  const salt = randHex(8);
  accts[email] = { salt, hash: await sha256(salt + ":" + password) };
  await writeAccounts(accts);
  return mintSession(email);
}
async function logIn(email, password) {
  email = email.trim().toLowerCase();
  const rec = (await readAccounts())[email];
  if (!rec) throw new Error("No account found for that email.");
  if ((await sha256(rec.salt + ":" + password)) !== rec.hash) throw new Error("Incorrect password.");
  return mintSession(email);
}

const FIELD = { width: "100%", boxSizing: "border-box", background: "#100d0a", color: C.text, border: `1px solid ${C.line}`, borderRadius: 11, padding: "12px 12px 12px 38px", fontSize: 14.5, fontFamily: "'Hanken Grotesk',sans-serif", outline: "none" };

function Auth({ onAuthed, notice }) {
  const [mode, setMode] = useState("login");   // login | signup
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const valid = /\S+@\S+\.\S+/.test(email) && password.length >= 6;
  const submit = async () => {
    if (!valid || busy) return;
    setBusy(true); setErr("");
    try {
      const session = await (mode === "signup" ? signUp(email, password) : logIn(email, password));
      await onAuthed(session);
    } catch (e) { setErr(e.message || "Something went wrong."); setBusy(false); }
  };

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", padding: "30px 28px", overflowY: "auto" }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}.cv-spin{animation:spin 1s linear infinite}.cv-field:focus{border-color:${C.base}!important}`}</style>
      <div style={{ textAlign: "center", marginBottom: 22 }}>
        <div style={{ width: 50, height: 50, borderRadius: 15, display: "grid", placeItems: "center", margin: "0 auto 16px", background: "linear-gradient(135deg,#f5a623,#d4791b)", boxShadow: "0 10px 34px rgba(245,166,35,.38)" }}>
          <Clapperboard size={27} color="#1a1206" />
        </div>
        <h1 style={{ fontFamily: "'Fraunces',serif", fontSize: 27, fontWeight: 600, margin: 0 }}>{mode === "signup" ? "Create your account" : "Welcome back"}</h1>
        <p style={{ color: C.muted, fontSize: 13.5, marginTop: 6 }}>{mode === "signup" ? "Start building your movie fingerprint." : "Sign in to pick up where you left off."}</p>
      </div>

      <div style={{ display: "flex", background: C.panel, borderRadius: 11, padding: 4, marginBottom: 16, border: `1px solid ${C.line}` }}>
        {[["login", "Log in"], ["signup", "Sign up"]].map(([id, label]) => {
          const on = mode === id;
          return <button key={id} onClick={() => { setMode(id); setErr(""); }} style={{ flex: 1, fontSize: 13.5, fontWeight: 700, padding: "9px 0", borderRadius: 8, border: "none", cursor: "pointer", color: on ? "#1a1206" : C.muted, background: on ? C.base : "transparent" }}>{label}</button>;
        })}
      </div>

      {notice && (
        <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12.5, color: C.accent, background: "rgba(245,166,35,.1)", border: "1px solid rgba(245,166,35,.3)", borderRadius: 9, padding: "9px 11px", marginBottom: 12 }}>
          <AlertCircle size={15} /> {notice}
        </div>
      )}

      <div style={{ position: "relative", marginBottom: 11 }}>
        <Mail size={16} color={C.muted} style={{ position: "absolute", left: 13, top: 14 }} />
        <input className="cv-field" style={FIELD} type="email" placeholder="you@example.com" value={email} autoComplete="email"
          onChange={(e) => setEmail(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} />
      </div>
      <div style={{ position: "relative", marginBottom: 6 }}>
        <Lock size={16} color={C.muted} style={{ position: "absolute", left: 13, top: 14 }} />
        <input className="cv-field" style={FIELD} type="password" placeholder="Password" value={password} autoComplete={mode === "signup" ? "new-password" : "current-password"}
          onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} />
      </div>
      <div style={{ fontSize: 11.5, color: C.muted, minHeight: 16, marginBottom: 10 }}>
        {mode === "signup" && password.length > 0 && password.length < 6 ? "Password must be at least 6 characters." : ""}
      </div>

      {err && (
        <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12.5, color: "#e8888a", background: "rgba(232,136,138,.1)", border: "1px solid rgba(232,136,138,.3)", borderRadius: 9, padding: "9px 11px", marginBottom: 12 }}>
          <AlertCircle size={15} /> {err}
        </div>
      )}

      <button onClick={submit} disabled={!valid || busy} style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 9, width: "100%", fontSize: 15.5, fontWeight: 700, padding: "14px", borderRadius: 13, border: "none", cursor: valid && !busy ? "pointer" : "default", opacity: valid && !busy ? 1 : 0.45, color: "#1a1206", background: "linear-gradient(135deg,#f5a623,#d4791b)" }}>
        {busy ? <><Loader2 size={17} className="cv-spin" /> Working…</> : (mode === "signup" ? "Create account" : "Log in")}
      </button>

      <p style={{ fontSize: 11, color: C.muted, textAlign: "center", lineHeight: 1.5, marginTop: 16 }}>
        Sign-in is handled by your identity provider — Cueva verifies a token and never stores your password.
      </p>
    </div>
  );
}

const SHELL = { background: C.bg, color: C.text, fontFamily: "'Hanken Grotesk',sans-serif", borderRadius: 20, overflow: "hidden", height: 680, display: "flex", flexDirection: "column", maxWidth: 440, margin: "0 auto", border: `1px solid ${C.line}` };

export default function App() {
  const [phase, setPhase] = useState("loading"); // loading | auth | onboarding | app
  const [session, setSession] = useState(null);   // { email, token } from the IdP
  const [tab, setTab] = useState("home");
  const [liked, setLiked] = useState([]);
  const [base, setBase] = useState(deriveBase([]));
  const [feedback, setFeedback] = useState({});
  const [mood, setMood] = useState(null);
  const [now, setNow] = useState(Date.now());
  const [sessionEvent, setSessionEvent] = useState("");
  const [expiredNotice, setExpiredNotice] = useState(null);

  const eff = useMemo(() => effectiveOf(base, feedback), [base, feedback]);

  // ticking clock so the access-token countdown stays live
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);

  const resetProfileState = () => { setLiked([]); setBase(deriveBase([])); setFeedback({}); setMood(null); };

  // Load a signed-in user's saved profile and route. Mirrors client.meOrNull():
  // a profile -> straight to home, none -> onboarding.
  const routeForUser = async (email) => {
    try {
      const res = await storage()?.get(profileKey(email)); // throws if absent
      const saved = res && res.value ? JSON.parse(res.value) : null;
      if (saved && Array.isArray(saved.liked) && saved.liked.length) {
        setLiked(saved.liked); setBase(saved.base); setFeedback(saved.feedback || {});
        setPhase("app"); return;
      }
    } catch { /* no profile yet */ }
    resetProfileState(); setPhase("onboarding");
  };

  // Launch: is there a live session? Yes -> bootstrap that account. No -> login gate.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await storage()?.get(SESSION_KEY);
        const s = res && res.value ? JSON.parse(res.value) : null;
        if (!alive) return;
        if (s && s.email) { setSession(s); await routeForUser(s.email); }
        else setPhase("auth");
      } catch { if (alive) setPhase("auth"); }
    })();
    return () => { alive = false; };
  }, []);

  // Persist the durable slice per account. Mood is session-only, never saved.
  useEffect(() => {
    if (phase !== "app" || !session) return;
    storage()?.set(profileKey(session.email), JSON.stringify({ liked, base, feedback })).catch(() => {});
  }, [phase, session, liked, base, feedback]);

  const onAuthed = async (s) => {
    setExpiredNotice(null);
    setSessionEvent("");
    setSession(s);
    storage()?.set(SESSION_KEY, JSON.stringify(s)).catch(() => {});
    await routeForUser(s.email);
  };

  const persistSession = (next) => { setSession(next); storage()?.set(SESSION_KEY, JSON.stringify(next)).catch(() => {}); };

  // Session unrecoverable (refresh token also dead) -> drop to login with a notice.
  // This is what the client's onSessionExpired callback would trigger.
  const sessionExpired = async () => {
    try { await storage()?.delete(SESSION_KEY); } catch { /* ignore */ }
    setSession(null); resetProfileState(); setTab("home"); setSessionEvent("");
    setExpiredNotice("Your session expired — please sign in again.");
    setPhase("auth");
  };

  // Mirrors CuevaClient.req(): valid token -> go; expired access + valid refresh ->
  // refresh silently and retry; refresh dead -> session expired.
  const simulateApiCall = () => {
    if (!session) return;
    const t = Date.now();
    if (t < session.accessExp) {
      setSessionEvent("✓ API call succeeded — access token still valid.");
    } else if (t < session.refreshExp) {
      persistSession(refreshAccess(session));
      setSessionEvent("↻ access token had expired — refreshed silently via the refresh token and retried the request. No re-login.");
    } else {
      sessionExpired();
    }
  };
  const expireAccess = () => { persistSession({ ...session, accessExp: Date.now() }); setSessionEvent("Access token marked expired — your next API call will refresh it silently."); };
  const expireSession = () => { persistSession({ ...session, accessExp: Date.now(), refreshExp: Date.now() }); setSessionEvent("Whole session expired — your next API call will sign you out."); };

  const finishOnboarding = (picks, derived) => { setLiked(picks); setBase(derived); setTab("home"); setPhase("app"); };

  const logout = async () => {
    try { await storage()?.delete(SESSION_KEY); } catch { /* ignore */ }
    setSession(null); resetProfileState(); setTab("home"); setPhase("auth");
  };

  const reset = async () => {  // clear this account's fingerprint, stay signed in
    if (session) { try { await storage()?.delete(profileKey(session.email)); } catch { /* ignore */ } }
    resetProfileState(); setTab("home"); setPhase("onboarding");
  };

  if (phase === "loading") {
    return (
      <div style={SHELL}>
        <style>{FONTS}</style>
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}.cv-spin{animation:spin 1s linear infinite}`}</style>
        <div style={{ flex: 1, display: "grid", placeItems: "center" }}>
          <div style={{ textAlign: "center" }}>
            <div style={{ width: 48, height: 48, borderRadius: 14, display: "grid", placeItems: "center", margin: "0 auto 16px", background: "linear-gradient(135deg,#f5a623,#d4791b)", boxShadow: "0 10px 32px rgba(245,166,35,.35)" }}>
              <Clapperboard size={26} color="#1a1206" />
            </div>
            <Loader2 size={18} color={C.muted} className="cv-spin" />
            <div style={{ color: C.muted, fontSize: 13, marginTop: 10 }}>Loading…</div>
          </div>
        </div>
      </div>
    );
  }

  if (phase === "auth") {
    return (
      <div style={SHELL}>
        <style>{FONTS}</style>
        <Auth onAuthed={onAuthed} notice={expiredNotice} />
      </div>
    );
  }

  return (
    <div style={SHELL}>
      <style>{FONTS}</style>
      {phase === "onboarding" ? (
        <div style={{ flex: 1, overflow: "hidden" }}><Onboarding onDone={finishOnboarding} /></div>
      ) : (
        <>
          <div style={{ flex: 1, overflowY: "auto" }}>
            {tab === "home" && <HomeTab base={base} eff={eff} feedback={feedback} liked={liked} mood={mood} setMood={setMood} />}
            {tab === "discover" && <DiscoverTab base={base} eff={eff} feedback={feedback} liked={liked} onFeedback={(id, sig) => setFeedback((f) => ({ ...f, [id]: sig }))} />}
            {tab === "profile" && <ProfileTab base={base} eff={eff} feedback={feedback} liked={liked} setBase={setBase} onReset={reset} email={session?.email} onLogout={logout} session={session} now={now} sessionEvent={sessionEvent} onApiCall={simulateApiCall} onExpireAccess={expireAccess} onExpireSession={expireSession} />}
          </div>
          <div style={{ display: "flex", borderTop: `1px solid ${C.line}`, background: "#100d0a" }}>
            {TABS.map(({ id, label, icon: Icon }) => {
              const on = tab === id;
              return (
                <button key={id} onClick={() => setTab(id)} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 3, padding: "10px 0 12px", background: "transparent", border: "none", cursor: "pointer", color: on ? C.base : C.muted }}>
                  <Icon size={21} strokeWidth={on ? 2.4 : 1.8} />
                  <span style={{ fontSize: 11, fontWeight: on ? 700 : 500 }}>{label}</span>
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
