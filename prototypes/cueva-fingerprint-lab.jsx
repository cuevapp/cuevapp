import React, { useState } from "react";
import {
  RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, ResponsiveContainer,
} from "recharts";
import { FlaskConical, Sparkles, Loader2, AlertCircle } from "lucide-react";

const FONTS = `@import url('https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,600;1,9..144,500&family=Hanken+Grotesk:wght@400;500;600;700&display=swap');`;

const C = { bg: "#0c0a09", panel: "#16130f", line: "#2a241d", text: "#f3ead9", muted: "#9c9081", you: "#f5a623", accent: "#4fd1c5" };

const AXES = ["action", "comedy", "romance", "scifi", "adventure", "drama", "horror"];
const LABELS = { action: "Action", comedy: "Comedy", romance: "Romance", scifi: "Sci-Fi", adventure: "Adventure", drama: "Drama", horror: "Horror" };

/* the production scoring prompt — rubric + calibration anchors + strict JSON */
const SYSTEM_PROMPT = `You are Cueva's film-fingerprint scorer. Score how strongly a film expresses each of 7 elements, independently, on a 0–10 integer scale. Elements are NOT mutually exclusive: a film can be high Action AND high Drama.

Anchors (apply to EVERY axis):
0 = absent. 3 = minor/background presence. 6 = a clear, significant component. 10 = a defining, dominant element of the film.

Per-axis guidance:
- Action: physical conflict, fights, chases, set-pieces, kinetic stakes.
- Comedy: intent to amuse — jokes, tone, comedic timing.
- Romance: love/attraction as a meaningful plot thread.
- Sci-Fi: speculative tech/science, futurism, the impossible-made-plausible.
- Adventure: journey, quest, exploration, escalating discovery.
- Drama: emotional depth, character interiority, serious human stakes.
- Horror: fear, dread, the monstrous, intent to disturb.

Calibration examples (study these before scoring):
"Mad Max: Fury Road": {"action":10,"comedy":1,"romance":2,"scifi":7,"adventure":8,"drama":4,"horror":2}
"The Notebook": {"action":1,"comedy":2,"romance":10,"scifi":0,"adventure":2,"drama":8,"horror":0}
"Get Out": {"action":3,"comedy":3,"romance":1,"scifi":3,"adventure":1,"drama":6,"horror":8}

Respond with ONLY a JSON object, no markdown, no prose, in exactly this shape:
{"scores":{"action":N,"comedy":N,"romance":N,"scifi":N,"adventure":N,"drama":N,"horror":N},"rationale":"one short sentence"}`;

const EXAMPLES = [
  { name: "Alien (1979)", text: "The crew of a commercial space freighter is awakened to investigate a distress signal on a desolate planet. After one of them is attacked by a parasitic organism, a lethal creature begins stalking and killing them one by one in the claustrophobic corridors of their ship." },
  { name: "La La Land (2016)", text: "An aspiring actress and a jazz pianist fall in love in modern Los Angeles while chasing their creative dreams. Told through song and dance, their relationship is tested as ambition and reality pull them in different directions." },
  { name: "Jurassic Park (1993)", text: "Scientists clone dinosaurs to populate an island theme park. When the security systems fail during a preview tour, the prehistoric predators escape, and a small group must survive and escape the island." },
];

export default function FingerprintLab() {
  const [text, setText] = useState(EXAMPLES[0].text);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  async function score() {
    setLoading(true); setError(null); setResult(null);
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1000,
          system: SYSTEM_PROMPT,
          messages: [{ role: "user", content: `Synopsis:\n${text}` }],
        }),
      });
      const data = await res.json();
      const raw = data.content.filter((b) => b.type === "text").map((b) => b.text).join("");
      const clean = raw.replace(/```json|```/g, "").trim();
      const json = JSON.parse(clean.slice(clean.indexOf("{"), clean.lastIndexOf("}") + 1));
      setResult(json);
    } catch (e) {
      setError("Couldn't parse a fingerprint from the response. Try again or adjust the synopsis.");
    } finally {
      setLoading(false);
    }
  }

  const radar = result ? AXES.map((k) => ({ axis: LABELS[k], v: result.scores[k] })) : [];

  return (
    <div style={{ background: C.bg, color: C.text, fontFamily: "'Hanken Grotesk',sans-serif", borderRadius: 16, overflow: "hidden", minHeight: "100%" }}>
      <style>{FONTS}</style>
      <style>{`.fl-area{background:${C.panel};color:${C.text};border:1px solid ${C.line};border-radius:12px;padding:13px;font-family:inherit;font-size:13.5px;line-height:1.55;width:100%;resize:vertical;outline:none}.fl-area:focus{border-color:${C.you}}`}</style>

      <div style={{ padding: "26px 26px 18px", borderBottom: `1px solid ${C.line}`, background: "radial-gradient(120% 140% at 100% 0%, rgba(79,209,197,0.10), transparent 55%)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
          <div style={{ width: 38, height: 38, borderRadius: 11, display: "grid", placeItems: "center", background: "linear-gradient(135deg,#4fd1c5,#2f9e93)" }}>
            <FlaskConical size={20} color="#06201d" />
          </div>
          <div>
            <div style={{ fontFamily: "'Fraunces',serif", fontSize: 24, fontWeight: 600 }}>Fingerprint Lab</div>
            <div style={{ fontSize: 12.5, color: C.muted, marginTop: 2 }}>The live LLM scoring pipeline — paste a synopsis, get a fingerprint.</div>
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr" }}>
        <div style={{ padding: "20px 22px", borderRight: `1px solid ${C.line}` }}>
          <div style={{ display: "flex", gap: 7, flexWrap: "wrap", marginBottom: 12 }}>
            {EXAMPLES.map((ex) => (
              <button key={ex.name} onClick={() => { setText(ex.text); setResult(null); setError(null); }} style={{
                fontSize: 11.5, fontWeight: 600, padding: "6px 11px", borderRadius: 999, cursor: "pointer",
                background: C.panel, color: C.muted, border: `1px solid ${C.line}`,
              }}>{ex.name}</button>
            ))}
          </div>
          <textarea className="fl-area" rows={9} value={text} onChange={(e) => setText(e.target.value)} placeholder="Paste a film synopsis…" />
          <button onClick={score} disabled={loading || !text.trim()} style={{
            marginTop: 12, width: "100%", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8,
            fontSize: 14, fontWeight: 700, padding: "12px", borderRadius: 11, cursor: loading ? "default" : "pointer",
            border: "none", color: "#1a1206", opacity: loading || !text.trim() ? 0.55 : 1,
            background: "linear-gradient(135deg,#f5a623,#d4791b)",
          }}>
            {loading ? <><Loader2 size={16} className="spin" /> Scoring…</> : <><Sparkles size={16} /> Generate fingerprint</>}
          </button>
          <style>{`.spin{animation:s 1s linear infinite}@keyframes s{to{transform:rotate(360deg)}}`}</style>
        </div>

        <div style={{ padding: "20px 22px", display: "flex", flexDirection: "column" }}>
          {!result && !error && !loading && (
            <div style={{ margin: "auto", textAlign: "center", color: C.muted, fontSize: 13 }}>
              <FlaskConical size={30} color={C.line} /><div style={{ marginTop: 10 }}>The fingerprint will appear here.</div>
            </div>
          )}
          {loading && <div style={{ margin: "auto", color: C.muted, display: "flex", alignItems: "center", gap: 8 }}><Loader2 size={16} className="spin" /> Reading the synopsis…</div>}
          {error && <div style={{ margin: "auto", color: "#e88", display: "flex", alignItems: "center", gap: 8, fontSize: 13, textAlign: "center" }}><AlertCircle size={16} /> {error}</div>}
          {result && (
            <>
              <div style={{ height: 240 }}>
                <ResponsiveContainer>
                  <RadarChart data={radar} outerRadius="72%">
                    <PolarGrid stroke={C.line} />
                    <PolarAngleAxis dataKey="axis" tick={{ fill: C.muted, fontSize: 11.5, fontWeight: 600 }} />
                    <PolarRadiusAxis domain={[0, 10]} tick={false} axisLine={false} />
                    <Radar dataKey="v" stroke={C.you} fill={C.you} fillOpacity={0.28} strokeWidth={2} />
                  </RadarChart>
                </ResponsiveContainer>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px 18px", marginTop: 6 }}>
                {AXES.map((k) => (
                  <div key={k} style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, borderBottom: `1px solid ${C.line}`, padding: "4px 0" }}>
                    <span style={{ color: C.muted }}>{LABELS[k]}</span>
                    <span style={{ color: C.you, fontWeight: 700 }}>{result.scores[k]}</span>
                  </div>
                ))}
              </div>
              {result.rationale && <div style={{ marginTop: 12, fontSize: 12.5, color: C.muted, fontStyle: "italic", lineHeight: 1.5 }}>“{result.rationale}”</div>}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
