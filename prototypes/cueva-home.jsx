import React, { useState, useMemo } from "react";
import {
  RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, ResponsiveContainer,
} from "recharts";
import { Clapperboard, Ticket, MonitorPlay, Moon, Sparkles, Compass, Heart, Film } from "lucide-react";

/* ---------------- tokens ---------------- */
const FONTS = `@import url('https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,600;1,9..144,500&family=Hanken+Grotesk:wght@400;500;600;700&display=swap');`;
const C = { bg: "#0c0a09", panel: "#16130f", line: "#2a241d", text: "#f3ead9", muted: "#9c9081", you: "#f5a623", mood: "#4fd1c5" };

const AXES = [
  { key: "action", label: "Action" }, { key: "comedy", label: "Comedy" }, { key: "romance", label: "Romance" },
  { key: "scifi", label: "Sci-Fi" }, { key: "adventure", label: "Adventure" }, { key: "drama", label: "Drama" }, { key: "horror", label: "Horror" },
];
const GENRE_COLOR = { action: "#f5a623", comedy: "#f2c94c", romance: "#e64980", scifi: "#4fd1c5", adventure: "#51cf66", drama: "#9775fa", horror: "#e03131" };

/* ---------------- catalog ---------------- */
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

/* ---------------- the returning user (would come from GET /users/{id}) ---------------- */
const USER = {
  baseline: { action: 4, comedy: 2, romance: 3, scifi: 9, adventure: 6, drama: 8, horror: 2 },
  likedIds: [10, 27, 16],          // Interstellar, Blade Runner 2049, Inception
  services: ["Netflix", "Max", "Prime"],
};

/* tonight's mood: a temporary nudge layered on the saved baseline */
const MOODS = [
  { id: "scary", label: "Something scary", delta: { horror: 5, drama: 1 } },
  { id: "funny", label: "Easy laughs", delta: { comedy: 5, romance: 1 } },
  { id: "epic", label: "Big & epic", delta: { action: 4, adventure: 4 } },
  { id: "cry", label: "A good cry", delta: { drama: 4, romance: 3 } },
  { id: "trip", label: "Mind-bender", delta: { scifi: 4, drama: 1 } },
];

/* ---------------- helpers ---------------- */
function cosine(a, b) {
  let dot = 0, na = 0, nb = 0;
  for (const { key } of AXES) { dot += a[key] * b[key]; na += a[key] ** 2; nb += b[key] ** 2; }
  return na && nb ? dot / (Math.sqrt(na) * Math.sqrt(nb)) : 0;
}
const clamp = (v) => Math.max(0, Math.min(10, v));
function applyMood(base, mood) {
  if (!mood) return { ...base };
  return AXES.reduce((o, a) => ({ ...o, [a.key]: clamp(base[a.key] + (mood.delta[a.key] || 0)) }), {});
}
function topAxes(fp, n) { return [...AXES].sort((a, b) => fp[b.key] - fp[a.key]).slice(0, n); }
function gradientFor(fp) { const [a, b] = topAxes(fp, 2); return `linear-gradient(150deg, ${GENRE_COLOR[a.key]}cc, ${GENRE_COLOR[b.key]}88 72%, #0c0a09 140%)`; }
function rank(fp, { filter, exclude = [], offset = 0 } = {}) {
  return CATALOG
    .filter((m) => !exclude.includes(m.id))
    .filter((m) => (filter ? filter(m) : true))
    .map((m) => ({ ...m, score: cosine(fp, m.fp) }))
    .sort((a, b) => b.score - a.score)
    .slice(offset, offset + 12);
}

/* ---------------- cards & shelves ---------------- */
function Card({ m }) {
  const th = m.w === "Theaters";
  return (
    <div style={{ flexShrink: 0, width: 124 }}>
      <div style={{ position: "relative", aspectRatio: "2/3", borderRadius: 12, overflow: "hidden", background: gradientFor(m.fp),
        boxShadow: "0 6px 16px rgba(0,0,0,.4)", display: "flex", flexDirection: "column", justifyContent: "flex-end", padding: 9 }}>
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, rgba(8,7,6,.85), transparent 58%)" }} />
        <div style={{ position: "absolute", top: 8, right: 8, fontSize: 11, fontWeight: 700, padding: "2px 7px", borderRadius: 999,
          background: "rgba(12,10,9,.72)", color: C.you, backdropFilter: "blur(2px)" }}>{Math.round(m.score * 100)}%</div>
        <div style={{ position: "relative" }}>
          <div style={{ fontFamily: "'Fraunces',serif", fontSize: 13.5, fontWeight: 600, lineHeight: 1.15, textShadow: "0 1px 6px rgba(0,0,0,.6)" }}>{m.t}</div>
          <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 4, fontSize: 10.5, color: th ? C.you : C.mood, fontWeight: 600 }}>
            {th ? <Ticket size={11} /> : <MonitorPlay size={11} />}{th ? "Theaters" : m.w}
          </div>
        </div>
      </div>
    </div>
  );
}
function Shelf({ icon, title, subtitle, films }) {
  if (!films.length) return null;
  return (
    <section style={{ marginTop: 24 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "0 20px", marginBottom: 11 }}>
        {icon}
        <h3 style={{ fontFamily: "'Fraunces',serif", fontSize: 17, fontWeight: 600, margin: 0 }}>{title}</h3>
        {subtitle && <span style={{ fontSize: 12, color: C.muted, marginLeft: 2 }}>{subtitle}</span>}
      </div>
      <div style={{ display: "flex", gap: 11, overflowX: "auto", padding: "2px 20px 6px", scrollbarWidth: "thin" }}>
        {films.map((m) => <Card key={m.id} m={m} />)}
      </div>
    </section>
  );
}

/* ---------------- app ---------------- */
export default function Home() {
  const [moodId, setMoodId] = useState(null);
  const [avail, setAvail] = useState("all"); // all | theaters | streaming

  const mood = MOODS.find((m) => m.id === moodId) || null;
  const effective = useMemo(() => applyMood(USER.baseline, mood), [mood]);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  const availFilter =
    avail === "theaters" ? (m) => m.w === "Theaters"
    : avail === "streaming" ? (m) => USER.services.includes(m.w)
    : null;

  const top = rank(effective, { filter: availFilter, exclude: USER.likedIds });
  const theaters = rank(effective, { filter: (m) => m.w === "Theaters", exclude: USER.likedIds });
  const onServices = rank(effective, { filter: (m) => USER.services.includes(m.w), exclude: USER.likedIds });
  const anchor = CATALOG.find((m) => m.id === USER.likedIds[0]);
  const because = rank(anchor.fp, { exclude: USER.likedIds });
  const discovery = rank(effective, { exclude: USER.likedIds, offset: 8 }); // skip the obvious

  const baselineRadar = AXES.map((a) => ({ axis: a.label, base: USER.baseline[a.key], eff: effective[a.key] }));

  return (
    <div style={{ background: C.bg, color: C.text, fontFamily: "'Hanken Grotesk',sans-serif", borderRadius: 18, overflow: "hidden", minHeight: 560, paddingBottom: 24 }}>
      <style>{FONTS}</style>
      <style>{`.chip{cursor:pointer;transition:all .15s;white-space:nowrap}`}</style>

      {/* header */}
      <div style={{ position: "relative", padding: "22px 20px 18px",
        background: "radial-gradient(110% 130% at 0% 0%, rgba(245,166,35,0.12), transparent 55%), radial-gradient(110% 130% at 100% 0%, rgba(79,209,197,0.10), transparent 55%)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 16 }}>
          <div style={{ width: 30, height: 30, borderRadius: 9, display: "grid", placeItems: "center", background: "linear-gradient(135deg,#f5a623,#d4791b)" }}>
            <Clapperboard size={17} color="#1a1206" />
          </div>
          <span style={{ fontFamily: "'Fraunces',serif", fontSize: 19, fontWeight: 600 }}>Cueva</span>
        </div>

        <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
          <div style={{ width: 96, height: 96, flexShrink: 0 }}>
            <ResponsiveContainer>
              <RadarChart data={baselineRadar} outerRadius="78%">
                <PolarGrid stroke={C.line} />
                <PolarAngleAxis dataKey="axis" tick={false} />
                <PolarRadiusAxis domain={[0, 10]} tick={false} axisLine={false} />
                <Radar dataKey="base" stroke={C.you} fill={C.you} fillOpacity={0.22} strokeWidth={1.6} />
                {mood && <Radar dataKey="eff" stroke={C.mood} fill={C.mood} fillOpacity={0.12} strokeWidth={1.5} strokeDasharray="4 3" isAnimationActive />}
              </RadarChart>
            </ResponsiveContainer>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, color: C.muted }}>{greeting}</div>
            <div style={{ fontFamily: "'Fraunces',serif", fontSize: 21, fontWeight: 600, lineHeight: 1.15, margin: "1px 0 8px" }}>
              {mood ? <>Tonight, leaning <span style={{ color: C.mood }}>{topAxes(effective, 1)[0].label.toLowerCase()}</span></> : "What's on tonight?"}
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {topAxes(USER.baseline, 3).map((a) => (
                <span key={a.key} style={{ fontSize: 11, fontWeight: 600, padding: "3px 9px", borderRadius: 999,
                  background: `${GENRE_COLOR[a.key]}22`, color: GENRE_COLOR[a.key], border: `1px solid ${GENRE_COLOR[a.key]}44` }}>{a.label}</span>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* tonight's mood */}
      <div style={{ padding: "4px 20px 0" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12.5, color: C.muted, marginBottom: 9 }}>
          <Moon size={13} /> Tonight I'm feeling…
        </div>
        <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 4 }}>
          {MOODS.map((m) => {
            const on = moodId === m.id;
            return (
              <button key={m.id} className="chip" onClick={() => setMoodId(on ? null : m.id)} style={{
                fontSize: 13, fontWeight: 600, padding: "8px 14px", borderRadius: 999,
                background: on ? "rgba(79,209,197,0.16)" : C.panel, color: on ? C.mood : C.text,
                border: `1px solid ${on ? "rgba(79,209,197,0.45)" : C.line}` }}>{m.label}</button>
            );
          })}
        </div>
      </div>

      {/* availability filter (applies to the top shelf) */}
      <div style={{ display: "flex", gap: 6, padding: "16px 20px 0" }}>
        {[["all", "All"], ["theaters", "🎟 In theaters"], ["streaming", "📺 Your services"]].map(([id, label]) => {
          const on = avail === id;
          return (
            <button key={id} onClick={() => setAvail(id)} className="chip" style={{
              fontSize: 12.5, fontWeight: 600, padding: "7px 13px", borderRadius: 9,
              background: on ? "rgba(245,166,35,0.16)" : "transparent", color: on ? C.you : C.muted,
              border: `1px solid ${on ? "rgba(245,166,35,0.4)" : C.line}` }}>{label}</button>
          );
        })}
      </div>

      {/* shelves */}
      <Shelf icon={<Sparkles size={15} color={C.you} />} title="Tonight's top matches"
        subtitle={mood ? "mood-adjusted" : "from your fingerprint"} films={top} />
      <Shelf icon={<Ticket size={15} color={C.you} />} title="In theaters now" films={theaters} />
      <Shelf icon={<MonitorPlay size={15} color={C.mood} />} title="On your services"
        subtitle={USER.services.join(" · ")} films={onServices} />
      <Shelf icon={<Heart size={15} color={GENRE_COLOR.romance} />} title={`Because you loved ${anchor.t}`} films={because} />
      <Shelf icon={<Compass size={15} color={GENRE_COLOR.adventure} />} title="A little outside your usual"
        subtitle="for when you want to stretch" films={discovery} />
    </div>
  );
}
