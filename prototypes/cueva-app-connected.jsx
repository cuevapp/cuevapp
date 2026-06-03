import React, { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, ResponsiveContainer } from "recharts";
import {
  Clapperboard, Check, Sparkles, Ticket, MonitorPlay, ArrowRight, Heart, ThumbsDown, Eye, EyeOff,
  Home as HomeIcon, Compass, User, Moon, TrendingUp, TrendingDown, SlidersHorizontal, Loader2,
  Mail, Lock, AlertCircle, LogOut, ShieldCheck, Cloud,
} from "lucide-react";

/* =======================================================================
 *  Cueva — connected app. The UI calls CuevaClient; CuevaClient makes real
 *  fetch() requests with real auth + refresh/401 handling. A mock backend
 *  (the BACKEND section) implements the API contract in-browser so this
 *  runs without a server. TO GO LIVE: set API_URL to your backend and
 *  delete installMockBackend() — the app and client are unchanged.
 * ===================================================================== */
const API_URL = "https://api.cueva.local"; // mock intercepts this; swap for your real URL

/* ===================== tokens ===================== */
const FONTS = `@import url('https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,600;1,9..144,500&family=Hanken+Grotesk:wght@400;500;600;700&display=swap');`;
const C = { bg: "#0c0a09", panel: "#16130f", line: "#2a241d", text: "#f3ead9", muted: "#9c9081", base: "#f5a623", learned: "#4fd1c5" };
const AXES = ["action", "comedy", "romance", "scifi", "adventure", "drama", "horror"];
const LABEL = { action: "Action", comedy: "Comedy", romance: "Romance", scifi: "Sci-Fi", adventure: "Adventure", drama: "Drama", horror: "Horror" };
const GENRE_COLOR = { action: "#f5a623", comedy: "#f2c94c", romance: "#e64980", scifi: "#4fd1c5", adventure: "#51cf66", drama: "#9775fa", horror: "#e03131" };
const SERVICES = ["Netflix", "Max", "Prime"];
const MIN_PICKS = 5;
const MOODS = [
  { id: "scary", label: "Something scary", delta: { horror: 5, drama: 1 } },
  { id: "funny", label: "Easy laughs", delta: { comedy: 5, romance: 1 } },
  { id: "epic", label: "Big & epic", delta: { action: 4, adventure: 4 } },
  { id: "cry", label: "A good cry", delta: { drama: 4, romance: 3 } },
  { id: "trip", label: "Mind-bender", delta: { scifi: 4, drama: 1 } },
];

/* =======================================================================
 *  CLIENT — JS port of clients/cueva.ts (identical logic).
 * ===================================================================== */
class CuevaClient {
  constructor(baseUrl, opts) {
    this.baseUrl = baseUrl;
    this.getToken = opts.getToken;
    this.refreshToken = opts.refreshToken;
    this.onSessionExpired = opts.onSessionExpired;
    this.skewMs = (opts.refreshSkewSeconds ?? 30) * 1000;
    this.refreshing = null;
  }
  _err(status, msg) { const e = new Error(`Cueva ${status}: ${msg}`); e.status = status; return e; }
  _expMs(token) {
    const part = (token || "").split(".")[1]; if (!part) return null;
    try { const j = JSON.parse(atob(part.replace(/-/g, "+").replace(/_/g, "/"))); return typeof j.exp === "number" ? j.exp * 1000 : null; } catch { return null; }
  }
  _refresh() {
    if (!this.refreshToken) return Promise.resolve(null);
    if (!this.refreshing) this.refreshing = Promise.resolve().then(() => this.refreshToken()).catch(() => null).finally(() => { this.refreshing = null; });
    return this.refreshing; // single-flight
  }
  async _authToken() {
    let t = await this.getToken();
    if (!t && this.refreshToken) t = await this._refresh();
    if (t && this.refreshToken) { const exp = this._expMs(t); if (exp !== null && exp - Date.now() <= this.skewMs) t = (await this._refresh()) ?? t; }
    return t;
  }
  async _req(path, init = {}, auth = true) {
    const send = (token) => {
      const headers = { "Content-Type": "application/json", ...(init.headers || {}) };
      if (auth) { if (!token) throw this._err(401, "not authenticated"); headers.Authorization = `Bearer ${token}`; }
      return fetch(`${this.baseUrl}${path}`, { ...init, headers });
    };
    let res = await send(auth ? await this._authToken() : null);
    if (res.status === 401 && auth && this.refreshToken) {       // refresh once, retry once
      const fresh = await this._refresh();
      if (fresh) res = await send(fresh);
      if (res.status === 401) this.onSessionExpired?.();
    }
    if (!res.ok) { const d = await res.json().catch(() => ({})); throw this._err(res.status, d.detail ?? res.statusText); }
    return res.json();
  }
  onboardingCatalog(limit = 28) { return this._req(`/catalog/onboarding?limit=${limit}`, {}, false); }
  similarToFilm(id, k = 10) { return this._req(`/films/${id}/similar?k=${k}`, {}, false); }
  onboard(likedIds, region = "US") { return this._req(`/onboard`, { method: "POST", body: JSON.stringify({ liked_tmdb_ids: likedIds, region }) }); }
  me() { return this._req(`/me`); }
  async meOrNull() { try { return await this.me(); } catch (e) { if (e.status === 404) return null; throw e; } }
  fineTune(fingerprint) { return this._req(`/me/fingerprint`, { method: "PATCH", body: JSON.stringify({ fingerprint }) }); }
  recommendations({ k = 10, only_available = true, in_theaters_only = false, providers = [], offset = 0 } = {}) {
    const q = new URLSearchParams({ k, only_available, in_theaters_only, offset });
    providers.forEach((p) => q.append("providers", p));
    return this._req(`/me/recommendations?${q}`);
  }
  recommend(body) { return this._req(`/recommend`, { method: "POST", body: JSON.stringify(body) }); }
  sendFeedback(tmdb_id, signal) { return this._req(`/me/feedback`, { method: "POST", body: JSON.stringify({ tmdb_id, signal }) }); }
}

/* =======================================================================
 *  BACKEND (mock) — implements the FastAPI contract + a mock identity
 *  provider, in-browser. Delete this whole section in production.
 * ===================================================================== */
const storage = () => (typeof window !== "undefined" ? window.storage : null);
const FEEDBACK_W = { love: 0.25, dislike: -0.18, hide: -0.12, seen: 0 };
const clamp = (v) => Math.max(0, Math.min(10, v));
const fp = (a, c, r, s, ad, d, h) => ({ action: a, comedy: c, romance: r, scifi: s, adventure: ad, drama: d, horror: h });
const CATALOG = [
  { id: 1, t: "Mad Max: Fury Road", y: 2015, w: ["Max"], fp: fp(10, 1, 2, 7, 8, 4, 2) },
  { id: 2, t: "Dune: Part Two", y: 2024, w: ["Theaters"], fp: fp(6, 1, 4, 10, 8, 7, 2) },
  { id: 3, t: "The Notebook", y: 2004, w: ["Netflix"], fp: fp(1, 2, 10, 0, 2, 8, 0) },
  { id: 4, t: "Get Out", y: 2017, w: ["Peacock"], fp: fp(3, 3, 1, 3, 1, 6, 8) },
  { id: 5, t: "Guardians of the Galaxy", y: 2014, w: ["Disney+"], fp: fp(8, 8, 3, 8, 9, 4, 1) },
  { id: 6, t: "Hereditary", y: 2018, w: ["Max"], fp: fp(1, 0, 1, 1, 1, 7, 10) },
  { id: 7, t: "La La Land", y: 2016, w: ["Prime"], fp: fp(1, 5, 8, 0, 2, 7, 0) },
  { id: 8, t: "Jurassic Park", y: 1993, w: ["Peacock"], fp: fp(8, 3, 2, 8, 9, 4, 4) },
  { id: 9, t: "Superbad", y: 2007, w: ["Netflix"], fp: fp(1, 10, 4, 0, 3, 2, 0) },
  { id: 10, t: "Interstellar", y: 2014, w: ["Paramount+"], fp: fp(4, 1, 3, 10, 7, 8, 1) },
  { id: 12, t: "Alien", y: 1979, w: ["Hulu"], fp: fp(6, 0, 1, 9, 5, 3, 9) },
  { id: 14, t: "John Wick", y: 2014, w: ["Prime"], fp: fp(10, 1, 1, 1, 4, 3, 2) },
  { id: 16, t: "Inception", y: 2010, w: ["Max"], fp: fp(7, 1, 3, 9, 6, 6, 1) },
  { id: 20, t: "Everything Everywhere", y: 2022, w: ["Prime"], fp: fp(6, 8, 4, 8, 6, 7, 1) },
  { id: 21, t: "A Quiet Place", y: 2018, w: ["Theaters"], fp: fp(4, 0, 2, 5, 2, 5, 9) },
  { id: 22, t: "Her", y: 2013, w: ["Netflix"], fp: fp(0, 3, 8, 7, 1, 8, 0) },
  { id: 25, t: "The Martian", y: 2015, w: ["Disney+"], fp: fp(3, 6, 1, 9, 7, 6, 1) },
  { id: 27, t: "Blade Runner 2049", y: 2017, w: ["Netflix"], fp: fp(5, 1, 3, 10, 5, 8, 2) },
  { id: 28, t: "Whiplash", y: 2014, w: ["Prime"], fp: fp(1, 1, 2, 0, 1, 10, 2) },
  { id: 24, t: "Scream", y: 1996, w: ["Max"], fp: fp(3, 4, 1, 0, 1, 2, 9) },
];
const CAT = Object.fromEntries(CATALOG.map((m) => [m.id, m]));
const cosine = (a, b) => { let d = 0, na = 0, nb = 0; for (const k of AXES) { d += a[k] * b[k]; na += a[k] ** 2; nb += b[k] ** 2; } return na && nb ? d / Math.sqrt(na * nb) : 0; };
const deriveBase = (ids) => AXES.reduce((o, a) => ({ ...o, [a]: ids.length ? Math.round(ids.reduce((s, id) => s + CAT[id].fp[a], 0) / ids.length) : 5 }), {});
function applyFeedback(base, feedback) {
  const e = { ...base };
  for (const [id, sig] of Object.entries(feedback)) { const w = FEEDBACK_W[sig] || 0, f = CAT[+id]?.fp; if (!w || !f) continue; for (const a of AXES) e[a] += w * (f[a] - base[a]); }
  for (const a of AXES) e[a] = clamp(Math.round(e[a]));
  return e;
}
const topAxesArr = (f, n) => [...AXES].sort((a, b) => f[b] - f[a]).slice(0, n).map((a) => ({ axis: a, label: LABEL[a], value: f[a] }));
const matchOf = (m, vecObj) => { const s = cosine(vecObj, m.fp); return { tmdb_id: m.id, title: m.t, year: m.y, match: s, match_pct: Math.round(s * 100), in_theaters: m.w.includes("Theaters"), providers: m.w }; };
function rankServer(vecObj, { k = 10, in_theaters_only = false, providers = [], exclude = [], offset = 0 }) {
  const ex = new Set(exclude);
  let pool = CATALOG.filter((m) => !ex.has(m.id));
  if (in_theaters_only) pool = pool.filter((m) => m.w.includes("Theaters"));
  else if (providers.length) pool = pool.filter((m) => m.w.some((p) => providers.includes(p)));
  return pool.map((m) => matchOf(m, vecObj)).sort((a, b) => b.match - a.match).slice(offset, offset + k);
}

// --- mock identity provider (JWTs with real exp so client refresh works) ---
const ACCESS_TTL = 45000, REFRESH_TTL = 3600000;
const b64u = (o) => btoa(JSON.stringify(o)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const mkJWT = (sub, ttl, typ) => `${b64u({ alg: "mock", typ })}.${b64u({ sub, exp: Math.floor((Date.now() + ttl) / 1000) })}.mock`;
const readJWT = (t) => { try { return JSON.parse(atob(((t || "").split(".")[1] || "").replace(/-/g, "+").replace(/_/g, "/"))); } catch { return null; } };
const validTok = (t) => { const p = readJWT(t); return p && p.exp * 1000 > Date.now() ? p : null; };
async function sha256(s) { const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)); return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join(""); }
const randHex = (n) => { const b = new Uint8Array(n); crypto.getRandomValues(b); return [...b].map((x) => x.toString(16).padStart(2, "0")).join(""); };
const DB = async () => { try { const r = await storage()?.get("cueva_mock_db"); return r?.value ? JSON.parse(r.value) : { accounts: {}, users: {} }; } catch { return { accounts: {}, users: {} }; } };
const saveDB = (db) => { try { storage()?.set("cueva_mock_db", JSON.stringify(db)); } catch (e) { /* ignore */ } };

export const idp = {
  async signUp(email, password) {
    email = email.trim().toLowerCase(); const db = await DB();
    if (db.accounts[email]) throw new Error("An account with that email already exists.");
    const salt = randHex(8); db.accounts[email] = { salt, hash: await sha256(salt + ":" + password) }; saveDB(db);
    return { email, accessToken: mkJWT(email, ACCESS_TTL, "access"), refreshToken: mkJWT(email, REFRESH_TTL, "refresh") };
  },
  async logIn(email, password) {
    email = email.trim().toLowerCase(); const rec = (await DB()).accounts[email];
    if (!rec) throw new Error("No account found for that email.");
    if ((await sha256(rec.salt + ":" + password)) !== rec.hash) throw new Error("Incorrect password.");
    return { email, accessToken: mkJWT(email, ACCESS_TTL, "access"), refreshToken: mkJWT(email, REFRESH_TTL, "refresh") };
  },
  refresh(refreshToken) { const p = validTok(refreshToken); return p ? { accessToken: mkJWT(p.sub, ACCESS_TTL, "access") } : null; },
};

let MOCK_INSTALLED = false;
function installMockBackend() {
  if (MOCK_INSTALLED) return; MOCK_INSTALLED = true;
  const realFetch = window.fetch.bind(window);
  const J = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
  window.fetch = async (url, init = {}) => {
    if (!String(url).startsWith(API_URL)) return realFetch(url, init);
    const u = new URL(url); const path = u.pathname; const method = (init.method || "GET").toUpperCase();
    const authH = (init.headers && (init.headers.Authorization || init.headers.authorization)) || "";
    const token = authH.replace(/^Bearer /, ""); const body = init.body ? JSON.parse(init.body) : {};

    // public
    if (path === "/catalog/onboarding" && method === "GET")
      return J(CATALOG.map((m) => ({ tmdb_id: m.id, title: m.t, year: m.y, dominant_axis: topAxesArr(m.fp, 1)[0].axis, fingerprint: m.fp })));
    if (/^\/films\/\d+\/similar$/.test(path) && method === "GET") {
      const id = +path.split("/")[2]; if (!CAT[id]) return J({ detail: "not found" }, 404);
      return J(rankServer(CAT[id].fp, { k: +u.searchParams.get("k") || 10, exclude: [id] }));
    }
    // authed — identity comes from the token (server-side)
    const sub = validTok(token)?.sub; if (!sub) return J({ detail: "invalid or expired token" }, 401);
    const db = await DB(); const user = db.users[sub];
    const eff = () => applyFeedback(user.base, user.feedback);
    const exclude = () => [...user.liked, ...Object.keys(user.feedback).map(Number)];
    const userResp = () => ({ user_id: sub, fingerprint: eff(), base_fingerprint: user.base, liked_tmdb_ids: user.liked, region: user.region, top_axes: topAxesArr(eff(), 3), updated_at: user.updated_at });

    if (path === "/onboard" && method === "POST") {
      const base = deriveBase(body.liked_tmdb_ids);
      db.users[sub] = { base, liked: body.liked_tmdb_ids, feedback: {}, region: body.region || "US", updated_at: new Date().toISOString() }; saveDB(db);
      return J({ user_id: sub, fingerprint: base, top_axes: topAxesArr(base, 3) });
    }
    if (!user) return J({ detail: "no profile" }, 404);
    if (path === "/me" && method === "GET") return J(userResp());
    if (path === "/me/fingerprint" && method === "PATCH") { user.base = body.fingerprint; user.updated_at = new Date().toISOString(); saveDB(db); return J(userResp()); }
    if (path === "/me/recommendations" && method === "GET") {
      const v = eff();
      return J({ fingerprint: v, results: rankServer(v, { k: +u.searchParams.get("k") || 10, in_theaters_only: u.searchParams.get("in_theaters_only") === "true", providers: u.searchParams.getAll("providers"), offset: +u.searchParams.get("offset") || 0, exclude: exclude() }) });
    }
    if (path === "/recommend" && method === "POST")
      return J({ fingerprint: body.fingerprint, results: rankServer(body.fingerprint, { k: body.k || 10, exclude: body.exclude_tmdb_ids || exclude() }) });
    if (path === "/me/feedback" && method === "POST") { user.feedback[body.tmdb_id] = body.signal; saveDB(db); return J({ fingerprint: eff(), base_fingerprint: user.base, top_axes: topAxesArr(eff(), 3), feedback_count: Object.keys(user.feedback).length }); }
    return J({ detail: "not found" }, 404);
  };
}
if (typeof window !== "undefined") installMockBackend();

/* ===================== UI atoms ===================== */
const gradientFor = (f) => { const [a, b] = topAxesArr(f, 2); return `linear-gradient(150deg, ${GENRE_COLOR[a.axis]}cc, ${GENRE_COLOR[b.axis]}88 72%, #0c0a09 150%)`; };
const Spinner = ({ label }) => (
  <div style={{ display: "grid", placeItems: "center", padding: 30, color: C.muted }}>
    <style>{`@keyframes spin{to{transform:rotate(360deg)}}.cv-spin{animation:spin 1s linear infinite}`}</style>
    <Loader2 size={20} className="cv-spin" /><div style={{ fontSize: 12.5, marginTop: 8 }}>{label}</div>
  </div>
);
function Poster({ f, w, h, pct }) {
  return (
    <div style={{ width: w, height: h, flexShrink: 0, borderRadius: 11, background: gradientFor(f), position: "relative", overflow: "hidden", boxShadow: "0 6px 16px rgba(0,0,0,.4)" }}>
      <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, rgba(8,7,6,.78), transparent 58%)" }} />
      {pct != null && <div style={{ position: "absolute", top: 7, right: 7, fontSize: 10.5, fontWeight: 700, padding: "2px 6px", borderRadius: 999, background: "rgba(12,10,9,.72)", color: C.base }}>{pct}%</div>}
    </div>
  );
}
const Badge = ({ w }) => { const th = w.includes("Theaters"); return <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, fontWeight: 600, color: th ? C.base : C.learned }}>{th ? <Ticket size={12} /> : <MonitorPlay size={12} />}{th ? "Theaters" : w[0]}</span>; };
function Shelf({ icon, title, subtitle, results }) {
  if (!results?.length) return null;
  return (
    <section style={{ marginTop: 20 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "0 18px", marginBottom: 10 }}>
        {icon}<h3 style={{ fontFamily: "'Fraunces',serif", fontSize: 16.5, fontWeight: 600, margin: 0 }}>{title}</h3>
        {subtitle && <span style={{ fontSize: 11.5, color: C.muted }}>{subtitle}</span>}
      </div>
      <div style={{ display: "flex", gap: 11, overflowX: "auto", padding: "2px 18px 6px" }}>
        {results.slice(0, 10).map((m) => (
          <div key={m.tmdb_id} style={{ width: 116, flexShrink: 0 }}>
            <Poster f={CAT[m.tmdb_id]?.fp || {}} w={116} h={170} pct={m.match_pct} />
            <div style={{ fontSize: 12.5, fontWeight: 700, marginTop: 6, lineHeight: 1.2 }}>{m.title}</div>
            <div style={{ marginTop: 3 }}><Badge w={m.providers} /></div>
          </div>
        ))}
      </div>
    </section>
  );
}
function BigRadar({ base, eff, showEff, height = 240 }) {
  const data = AXES.map((a) => ({ axis: LABEL[a], base: base[a], eff: eff?.[a] ?? base[a] }));
  return (
    <div style={{ height }}>
      <ResponsiveContainer>
        <RadarChart data={data} outerRadius="72%">
          <PolarGrid stroke={C.line} /><PolarAngleAxis dataKey="axis" tick={{ fill: C.muted, fontSize: 11.5, fontWeight: 600 }} /><PolarRadiusAxis domain={[0, 10]} tick={false} axisLine={false} />
          <Radar dataKey="base" stroke={C.base} fill={C.base} fillOpacity={showEff ? 0.16 : 0.26} strokeWidth={1.8} />
          {showEff && <Radar dataKey="eff" stroke={C.learned} fill={C.learned} fillOpacity={0.18} strokeWidth={2} />}
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
}
function CompactRadar({ base, eff, showEff, size = 96 }) {
  const data = AXES.map((a) => ({ axis: LABEL[a], base: base[a], eff: eff?.[a] ?? base[a] }));
  return (
    <div style={{ width: size, height: size, flexShrink: 0 }}>
      <ResponsiveContainer>
        <RadarChart data={data} outerRadius="80%">
          <PolarGrid stroke={C.line} /><PolarAngleAxis dataKey="axis" tick={false} /><PolarRadiusAxis domain={[0, 10]} tick={false} axisLine={false} />
          <Radar dataKey="base" stroke={C.base} fill={C.base} fillOpacity={0.18} strokeWidth={1.5} />
          {showEff && <Radar dataKey="eff" stroke={C.learned} fill={C.learned} fillOpacity={0.16} strokeWidth={1.6} />}
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
}
const Pills = ({ axes }) => (
  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
    {axes.map((a) => <span key={a.axis} style={{ fontSize: 11, fontWeight: 600, padding: "3px 9px", borderRadius: 999, background: `${GENRE_COLOR[a.axis]}22`, color: GENRE_COLOR[a.axis], border: `1px solid ${GENRE_COLOR[a.axis]}44` }}>{a.label}</span>)}
  </div>
);
const Logo = () => (
  <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
    <div style={{ width: 30, height: 30, borderRadius: 9, display: "grid", placeItems: "center", background: "linear-gradient(135deg,#f5a623,#d4791b)" }}><Clapperboard size={17} color="#1a1206" /></div>
    <span style={{ fontFamily: "'Fraunces',serif", fontSize: 19, fontWeight: 600 }}>Cueva</span>
  </div>
);
const FIELD = { width: "100%", boxSizing: "border-box", background: "#100d0a", color: C.text, border: `1px solid ${C.line}`, borderRadius: 11, padding: "12px 12px 12px 38px", fontSize: 14.5, fontFamily: "'Hanken Grotesk',sans-serif", outline: "none" };

/* ===================== screens ===================== */
function Auth({ onAuthed, notice }) {
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState(""); const [password, setPassword] = useState("");
  const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  const ok = /\S+@\S+\.\S+/.test(email) && password.length >= 6;
  const submit = async () => {
    if (!ok || busy) return; setBusy(true); setErr("");
    try { onAuthed(await (mode === "signup" ? idp.signUp : idp.logIn)(email, password)); }
    catch (e) { setErr(e.message); setBusy(false); }
  };
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", padding: "30px 28px", overflowY: "auto" }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}.cv-spin{animation:spin 1s linear infinite}.cv-field:focus{border-color:${C.base}!important}`}</style>
      <div style={{ textAlign: "center", marginBottom: 22 }}>
        <div style={{ width: 50, height: 50, borderRadius: 15, display: "grid", placeItems: "center", margin: "0 auto 16px", background: "linear-gradient(135deg,#f5a623,#d4791b)", boxShadow: "0 10px 34px rgba(245,166,35,.38)" }}><Clapperboard size={27} color="#1a1206" /></div>
        <h1 style={{ fontFamily: "'Fraunces',serif", fontSize: 27, fontWeight: 600, margin: 0 }}>{mode === "signup" ? "Create your account" : "Welcome back"}</h1>
        <p style={{ color: C.muted, fontSize: 13.5, marginTop: 6 }}>{mode === "signup" ? "Start building your movie fingerprint." : "Sign in to pick up where you left off."}</p>
      </div>
      <div style={{ display: "flex", background: C.panel, borderRadius: 11, padding: 4, marginBottom: 16, border: `1px solid ${C.line}` }}>
        {[["login", "Log in"], ["signup", "Sign up"]].map(([id, l]) => { const on = mode === id; return <button key={id} onClick={() => { setMode(id); setErr(""); }} style={{ flex: 1, fontSize: 13.5, fontWeight: 700, padding: "9px 0", borderRadius: 8, border: "none", cursor: "pointer", color: on ? "#1a1206" : C.muted, background: on ? C.base : "transparent" }}>{l}</button>; })}
      </div>
      {notice && <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12.5, color: C.base, background: "rgba(245,166,35,.1)", border: "1px solid rgba(245,166,35,.3)", borderRadius: 9, padding: "9px 11px", marginBottom: 12 }}><AlertCircle size={15} /> {notice}</div>}
      <div style={{ position: "relative", marginBottom: 11 }}><Mail size={16} color={C.muted} style={{ position: "absolute", left: 13, top: 14 }} /><input className="cv-field" style={FIELD} type="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} /></div>
      <div style={{ position: "relative", marginBottom: 6 }}><Lock size={16} color={C.muted} style={{ position: "absolute", left: 13, top: 14 }} /><input className="cv-field" style={FIELD} type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} /></div>
      <div style={{ fontSize: 11.5, color: C.muted, minHeight: 16, marginBottom: 10 }}>{mode === "signup" && password.length > 0 && password.length < 6 ? "Password must be at least 6 characters." : ""}</div>
      {err && <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12.5, color: "#e8888a", background: "rgba(232,136,138,.1)", border: "1px solid rgba(232,136,138,.3)", borderRadius: 9, padding: "9px 11px", marginBottom: 12 }}><AlertCircle size={15} /> {err}</div>}
      <button onClick={submit} disabled={!ok || busy} style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 9, width: "100%", fontSize: 15.5, fontWeight: 700, padding: "14px", borderRadius: 13, border: "none", cursor: ok && !busy ? "pointer" : "default", opacity: ok && !busy ? 1 : 0.45, color: "#1a1206", background: "linear-gradient(135deg,#f5a623,#d4791b)" }}>{busy ? <><Loader2 size={17} className="cv-spin" /> Working…</> : mode === "signup" ? "Create account" : "Log in"}</button>
      <p style={{ fontSize: 11, color: C.muted, textAlign: "center", lineHeight: 1.5, marginTop: 16 }}>Sign-in is handled by your identity provider — Cueva verifies a token and never stores your password.</p>
    </div>
  );
}

function Onboarding({ client, onDone }) {
  const [step, setStep] = useState("welcome");
  const [catalog, setCatalog] = useState(null); const [picked, setPicked] = useState([]); const [busy, setBusy] = useState(false);
  useEffect(() => { client.onboardingCatalog(28).then(setCatalog).catch(() => setCatalog([])); }, [client]);
  const base = useMemo(() => deriveBase(picked), [picked]);

  if (step === "welcome") return (
    <div style={{ padding: "70px 30px", textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center" }}>
      <div style={{ width: 52, height: 52, borderRadius: 15, display: "grid", placeItems: "center", marginBottom: 22, background: "linear-gradient(135deg,#f5a623,#d4791b)", boxShadow: "0 10px 36px rgba(245,166,35,.4)" }}><Clapperboard size={28} color="#1a1206" /></div>
      <h1 style={{ fontFamily: "'Fraunces',serif", fontSize: 34, fontWeight: 600, letterSpacing: -1, margin: 0, lineHeight: 1.05 }}>Find your next film by <span style={{ fontStyle: "italic", color: C.base }}>feel</span>.</h1>
      <p style={{ color: C.muted, fontSize: 15, lineHeight: 1.6, maxWidth: 380, marginTop: 16 }}>Tell us a few movies you love. We'll read their fingerprint, draw yours, and learn as you go.</p>
      <button onClick={() => setStep("pick")} style={{ marginTop: 28, display: "inline-flex", alignItems: "center", gap: 9, fontSize: 15.5, fontWeight: 700, padding: "14px 28px", borderRadius: 13, border: "none", cursor: "pointer", color: "#1a1206", background: "linear-gradient(135deg,#f5a623,#d4791b)" }}>Build my fingerprint <ArrowRight size={18} /></button>
    </div>
  );
  const toggle = (id) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const go = async () => { setBusy(true); try { onDone(await client.onboard(picked)); } catch { setBusy(false); } };
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{ padding: "18px 20px 8px" }}><h2 style={{ fontFamily: "'Fraunces',serif", fontSize: 24, fontWeight: 600, margin: "4px 0 2px" }}>Pick films you love</h2><p style={{ color: C.muted, fontSize: 13, margin: 0 }}>Choose at least {MIN_PICKS}.</p></div>
      <div style={{ flex: 1, overflowY: "auto", padding: "8px 20px 16px" }}>
        {!catalog ? <Spinner label="Loading catalog…" /> : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(104px,1fr))", gap: 11 }}>
            {catalog.map((m) => { const on = picked.includes(m.tmdb_id); return (
              <div key={m.tmdb_id} onClick={() => toggle(m.tmdb_id)} style={{ cursor: "pointer" }}>
                <div style={{ position: "relative", aspectRatio: "2/3", borderRadius: 12, overflow: "hidden", background: gradientFor(m.fingerprint), border: `2px solid ${on ? C.base : "transparent"}`, boxShadow: on ? "0 8px 22px rgba(245,166,35,.32)" : "0 4px 14px rgba(0,0,0,.4)", display: "flex", flexDirection: "column", justifyContent: "flex-end", padding: 9 }}>
                  <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, rgba(8,7,6,.82), transparent 58%)" }} />
                  {on && <div style={{ position: "absolute", top: 8, right: 8, width: 22, height: 22, borderRadius: "50%", background: C.base, display: "grid", placeItems: "center" }}><Check size={13} color="#1a1206" strokeWidth={3} /></div>}
                  <div style={{ position: "relative", fontFamily: "'Fraunces',serif", fontSize: 13, fontWeight: 600, lineHeight: 1.15 }}>{m.title}</div>
                </div>
              </div>); })}
          </div>
        )}
      </div>
      <div style={{ padding: "12px 20px", display: "flex", alignItems: "center", gap: 13, borderTop: `1px solid ${C.line}`, background: C.bg }}>
        <CompactRadar base={base} showEff={false} size={48} />
        <div style={{ flex: 1, fontSize: 13 }}><div style={{ fontWeight: 700 }}>{picked.length} selected</div><div style={{ color: C.muted, fontSize: 12 }}>{picked.length >= MIN_PICKS ? "Looking good" : `${MIN_PICKS - picked.length} more to go`}</div></div>
        <button disabled={picked.length < MIN_PICKS || busy} onClick={go} style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 14.5, fontWeight: 700, padding: "12px 20px", borderRadius: 12, border: "none", cursor: picked.length < MIN_PICKS ? "default" : "pointer", color: "#1a1206", opacity: picked.length < MIN_PICKS ? 0.4 : 1, background: "linear-gradient(135deg,#f5a623,#d4791b)" }}>{busy ? <Loader2 size={16} className="cv-spin" /> : <>Continue <ArrowRight size={17} /></>}</button>
      </div>
    </div>
  );
}

function HomeTab({ client, profile }) {
  const [avail, setAvail] = useState("all"); const [mood, setMood] = useState(null);
  const [shelves, setShelves] = useState(null); const [err, setErr] = useState("");
  useEffect(() => {
    let alive = true; setShelves(null); setErr("");
    (async () => {
      try {
        const filter = avail === "theaters" ? { in_theaters_only: true } : avail === "streaming" ? { providers: SERVICES } : {};
        const top = mood
          ? client.recommend({ fingerprint: AXES.reduce((o, a) => ({ ...o, [a]: clamp(profile.fingerprint[a] + (mood.delta[a] || 0)) }), {}), k: 10 })
          : client.recommendations({ k: 10, ...filter });
        const [topRes, theaters, services, loved] = await Promise.all([
          top,
          client.recommendations({ k: 8, in_theaters_only: true }),
          client.recommendations({ k: 8, providers: SERVICES }),
          profile.liked_tmdb_ids[0] != null ? client.similarToFilm(profile.liked_tmdb_ids[0], 8) : Promise.resolve([]),
        ]);
        if (alive) setShelves({ top: topRes.results, theaters: theaters.results, services: services.results, loved, anchor: CAT[profile.liked_tmdb_ids[0]] });
      } catch (e) { if (alive) setErr(e.message); }
    })();
    return () => { alive = false; };
  }, [client, profile, avail, mood]);

  const hasFb = profile.base_fingerprint && AXES.some((a) => profile.fingerprint[a] !== profile.base_fingerprint[a]);
  const hour = new Date().getHours(); const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  return (
    <div>
      <div style={{ padding: "20px 18px 14px", background: "radial-gradient(110% 130% at 0% 0%, rgba(245,166,35,0.10), transparent 55%), radial-gradient(110% 130% at 100% 0%, rgba(79,209,197,0.10), transparent 55%)" }}>
        <Logo />
        <div style={{ display: "flex", gap: 14, alignItems: "center", marginTop: 14 }}>
          <CompactRadar base={profile.base_fingerprint} eff={profile.fingerprint} showEff={hasFb} size={92} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12.5, color: C.muted }}>{greeting}</div>
            <div style={{ fontFamily: "'Fraunces',serif", fontSize: 20, fontWeight: 600, lineHeight: 1.15, margin: "1px 0 8px" }}>{mood ? "Tonight, adjusted for your mood" : "What's on tonight?"}</div>
            <Pills axes={profile.top_axes} />
          </div>
        </div>
      </div>
      <div style={{ padding: "4px 18px 0" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12.5, color: C.muted, marginBottom: 9 }}><Moon size={13} /> Tonight I'm feeling…</div>
        <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 4 }}>
          {MOODS.map((m) => { const on = mood?.id === m.id; return <button key={m.id} onClick={() => setMood(on ? null : m)} style={{ flexShrink: 0, fontSize: 13, fontWeight: 600, padding: "8px 14px", borderRadius: 999, cursor: "pointer", background: on ? "rgba(79,209,197,0.16)" : C.panel, color: on ? C.learned : C.text, border: `1px solid ${on ? "rgba(79,209,197,0.45)" : C.line}` }}>{m.label}</button>; })}
        </div>
      </div>
      <div style={{ display: "flex", gap: 6, padding: "14px 18px 0" }}>
        {[["all", "All"], ["theaters", "🎟 Theaters"], ["streaming", "📺 Your services"]].map(([id, l]) => { const on = avail === id; return <button key={id} onClick={() => setAvail(id)} style={{ fontSize: 12.5, fontWeight: 600, padding: "7px 13px", borderRadius: 9, cursor: "pointer", background: on ? "rgba(245,166,35,0.16)" : "transparent", color: on ? C.base : C.muted, border: `1px solid ${on ? "rgba(245,166,35,0.4)" : C.line}` }}>{l}</button>; })}
      </div>
      {err ? <div style={{ color: "#e8888a", fontSize: 13, padding: 24 }}>Couldn't load recommendations: {err}</div>
        : !shelves ? <Spinner label="Loading your shelves…" /> : (
          <>
            <Shelf icon={<Sparkles size={15} color={C.base} />} title="Tonight's top matches" subtitle={mood ? "mood-adjusted" : "for you"} results={shelves.top} />
            <Shelf icon={<Ticket size={15} color={C.base} />} title="In theaters now" results={shelves.theaters} />
            <Shelf icon={<MonitorPlay size={15} color={C.learned} />} title="On your services" subtitle={SERVICES.join(" · ")} results={shelves.services} />
            {shelves.anchor && <Shelf icon={<Heart size={15} color={GENRE_COLOR.romance} />} title={`Because you loved ${shelves.anchor.t}`} results={shelves.loved} />}
            <div style={{ height: 16 }} />
          </>
        )}
    </div>
  );
}

const ACTIONS = [
  { sig: "love", label: "Love", icon: Heart, color: "#e64980" },
  { sig: "dislike", label: "Not for me", icon: ThumbsDown, color: "#e8888a" },
  { sig: "seen", label: "Seen", icon: Eye, color: C.muted },
  { sig: "hide", label: "Hide", icon: EyeOff, color: C.muted },
];
function DiscoverTab({ client, profile, onProfileChange }) {
  const [feed, setFeed] = useState(null); const [fpState, setFpState] = useState(profile.fingerprint);
  const [count, setCount] = useState(0); const [busyId, setBusyId] = useState(null);
  const load = useCallback(() => { setFeed(null); client.recommendations({ k: 5 }).then((r) => { setFeed(r.results); setFpState(r.fingerprint); }).catch(() => setFeed([])); }, [client]);
  useEffect(() => { load(); }, [load]);
  const react = async (id, sig) => {
    setBusyId(id);
    try { const r = await client.sendFeedback(id, sig); setFpState(r.fingerprint); setCount(r.feedback_count); onProfileChange?.(); load(); }
    catch { setBusyId(null); }
  };
  let shift = { axis: null, delta: 0 };
  for (const a of AXES) { const d = fpState[a] - profile.base_fingerprint[a]; if (Math.abs(d) > Math.abs(shift.delta)) shift = { axis: a, delta: d }; }
  return (
    <div>
      <div style={{ padding: "20px 18px 14px", borderBottom: `1px solid ${C.line}`, background: "radial-gradient(110% 130% at 100% 0%, rgba(79,209,197,0.12), transparent 55%)" }}>
        <Logo />
        <div style={{ display: "flex", gap: 14, alignItems: "center", marginTop: 14 }}>
          <CompactRadar base={profile.base_fingerprint} eff={fpState} showEff={count > 0} size={96} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: "'Fraunces',serif", fontSize: 19, fontWeight: 600, lineHeight: 1.15 }}>{count === 0 ? "Sharpen your taste" : "Your fingerprint is learning"}</div>
            <div style={{ fontSize: 12.5, color: C.muted, marginTop: 4 }}>{count === 0 ? "React to films — saved to your profile." : `${count} signal${count > 1 ? "s" : ""} this session`}</div>
            {shift.axis && shift.delta !== 0 && <div style={{ display: "inline-flex", alignItems: "center", gap: 6, marginTop: 9, fontSize: 12.5, fontWeight: 600, padding: "5px 11px", borderRadius: 999, background: `${GENRE_COLOR[shift.axis]}22`, color: GENRE_COLOR[shift.axis], border: `1px solid ${GENRE_COLOR[shift.axis]}55` }}>{shift.delta > 0 ? <TrendingUp size={13} /> : <TrendingDown size={13} />}{LABEL[shift.axis]} {shift.delta > 0 ? "+" : ""}{shift.delta}</div>}
          </div>
        </div>
      </div>
      <div style={{ padding: "8px 16px 20px" }}>
        <div style={{ fontSize: 12.5, color: C.muted, padding: "12px 4px 6px" }}>Ranked by your current fingerprint</div>
        {!feed ? <Spinner label="Loading…" /> : feed.length === 0 ? <div style={{ textAlign: "center", color: C.muted, fontSize: 13, padding: "30px 0" }}>You've reacted to everything on hand.</div> : feed.map((m) => (
          <div key={m.tmdb_id} style={{ display: "flex", gap: 13, alignItems: "center", padding: "11px 4px", borderBottom: `1px solid ${C.line}`, opacity: busyId === m.tmdb_id ? 0.4 : 1 }}>
            <Poster f={CAT[m.tmdb_id]?.fp || {}} w={50} h={75} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14.5, fontWeight: 700 }}>{m.title} <span style={{ color: C.muted, fontWeight: 400 }}>· {m.year}</span></div>
              <div style={{ fontSize: 12, color: C.base, fontWeight: 600, marginBottom: 8 }}>{m.match_pct}% match</div>
              <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
                {ACTIONS.map(({ sig, label, icon: Icon, color }) => <button key={sig} disabled={busyId === m.tmdb_id} onClick={() => react(m.tmdb_id, sig)} style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11.5, fontWeight: 600, padding: "6px 10px", borderRadius: 9, cursor: "pointer", background: C.panel, color, border: `1px solid ${C.line}` }}><Icon size={14} /> {label}</button>)}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function SessionCard({ token, refreshToken, now, event, onApiCall, onExpireAccess, onExpireSession }) {
  const aExp = (readJWT(token)?.exp || 0) * 1000, rExp = (readJWT(refreshToken)?.exp || 0) * 1000;
  const aLive = now < aExp, rLive = now < rExp;
  const btn = { fontSize: 11.5, fontWeight: 600, padding: "7px 11px", borderRadius: 9, cursor: "pointer", background: "#100d0a", color: C.text, border: `1px solid ${C.line}` };
  const row = (l, v, c) => <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, marginBottom: 6 }}><span style={{ color: C.muted }}>{l}</span><span style={{ fontWeight: 700, color: c }}>{v}</span></div>;
  return (
    <div style={{ marginTop: 22, background: C.panel, border: `1px solid ${C.line}`, borderRadius: 14, padding: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 13, fontWeight: 600, marginBottom: 12 }}><ShieldCheck size={14} color={C.learned} /> Session (live JWT)</div>
      {row("Access token", aLive ? `valid · ${Math.max(0, Math.ceil((aExp - now) / 1000))}s` : "expired", aLive ? C.learned : "#e8888a")}
      {row("Refresh token", rLive ? `valid · ~${Math.max(0, Math.ceil((rExp - now) / 60000))}m` : "expired", rLive ? C.text : "#e8888a")}
      <div style={{ display: "flex", gap: 7, flexWrap: "wrap", marginTop: 6 }}>
        <button style={{ ...btn, color: C.learned }} onClick={onApiCall}>Call GET /me</button>
        <button style={btn} onClick={onExpireAccess}>Expire access</button>
        <button style={btn} onClick={onExpireSession}>Expire session</button>
      </div>
      {event && <div style={{ fontSize: 11.5, color: C.muted, marginTop: 11, lineHeight: 1.5 }}>{event}</div>}
    </div>
  );
}

function ProfileTab({ client, profile, onProfileChange, email, onLogout, session, now, sessionEvent, onApiCall, onExpireAccess, onExpireSession }) {
  const [base, setBase] = useState(profile.base_fingerprint);
  const saveTimer = useRef(null);
  useEffect(() => { setBase(profile.base_fingerprint); }, [profile.base_fingerprint]);
  const hasFb = AXES.some((a) => profile.fingerprint[a] !== profile.base_fingerprint[a]);
  const setAxis = (a, v) => {
    const next = { ...base, [a]: v }; setBase(next);
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => { client.fineTune(next).then(() => onProfileChange?.()).catch(() => {}); }, 400); // debounced PATCH
  };
  return (
    <div style={{ padding: "20px 18px 24px" }}>
      <div style={{ display: "flex", alignItems: "center" }}><Logo />{email && <span style={{ marginLeft: "auto", fontSize: 12, color: C.muted, maxWidth: 170, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{email}</span>}</div>
      <div style={{ textAlign: "center", marginTop: 10 }}>
        <BigRadar base={base} eff={profile.fingerprint} showEff={hasFb} height={250} />
        <div style={{ display: "flex", gap: 18, justifyContent: "center", fontSize: 11.5, color: C.muted, marginTop: 2 }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><span style={{ width: 11, height: 3, borderRadius: 2, background: C.base }} /> Base taste</span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><span style={{ width: 11, height: 3, borderRadius: 2, background: C.learned }} /> Learned</span>
        </div>
        <div style={{ display: "flex", justifyContent: "center", marginTop: 12 }}><Pills axes={profile.top_axes} /></div>
        <div style={{ fontSize: 12.5, color: C.muted, marginTop: 10 }}>{profile.liked_tmdb_ids.length} films loved at onboarding</div>
      </div>
      <div style={{ marginTop: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 13, fontWeight: 600, marginBottom: 12 }}><SlidersHorizontal size={14} color={C.base} /> Fine-tune your base taste</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px 22px" }}>
          {AXES.map((a) => (
            <div key={a}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 4 }}><span style={{ fontWeight: 600 }}>{LABEL[a]}</span><span style={{ color: C.base, fontWeight: 700 }}>{base[a]}</span></div>
              <input type="range" min={0} max={10} value={base[a]} onChange={(e) => setAxis(a, +e.target.value)} style={{ width: "100%", accentColor: C.base }} />
            </div>
          ))}
        </div>
      </div>
      {session && <SessionCard token={session.accessToken} refreshToken={session.refreshToken} now={now} event={sessionEvent} onApiCall={onApiCall} onExpireAccess={onExpireAccess} onExpireSession={onExpireSession} />}
      <div style={{ display: "flex", gap: 10, marginTop: 22 }}>
        <button onClick={onLogout} style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 600, color: C.muted, background: "transparent", border: `1px solid ${C.line}`, borderRadius: 999, padding: "9px 16px", cursor: "pointer" }}><LogOut size={14} /> Log out</button>
      </div>
    </div>
  );
}

/* ===================== shell ===================== */
const TABS = [{ id: "home", label: "Home", icon: HomeIcon }, { id: "discover", label: "Discover", icon: Compass }, { id: "profile", label: "Profile", icon: User }];
const SESSION_KEY = "cueva_session";
const SHELL = { background: C.bg, color: C.text, fontFamily: "'Hanken Grotesk',sans-serif", borderRadius: 20, overflow: "hidden", height: 700, display: "flex", flexDirection: "column", maxWidth: 440, margin: "0 auto", border: `1px solid ${C.line}`, position: "relative" };

export default function App() {
  const [phase, setPhase] = useState("loading"); // loading | auth | onboarding | app
  const [tab, setTab] = useState("home");
  const [profile, setProfile] = useState(null);
  const [now, setNow] = useState(Date.now());
  const [sessionEvent, setSessionEvent] = useState(""); const [expiredNotice, setExpiredNotice] = useState(null);
  const sessionRef = useRef(null); const [session, setSessionState] = useState(null);

  const setSession = useCallback((s) => { sessionRef.current = s; setSessionState(s); try { s ? storage()?.set(SESSION_KEY, JSON.stringify(s)) : storage()?.delete(SESSION_KEY); } catch (e) { /* ignore */ } }, []);

  const doLogout = useCallback((expired) => {
    setSession(null); setProfile(null); setTab("home"); setSessionEvent("");
    setExpiredNotice(expired ? "Your session expired — please sign in again." : null); setPhase("auth");
  }, [setSession]);

  // One client for the app's lifetime; token read from a ref so it's always current.
  const client = useMemo(() => new CuevaClient(API_URL, {
    getToken: () => sessionRef.current?.accessToken ?? null,
    refreshToken: async () => {
      const r = idp.refresh(sessionRef.current?.refreshToken);
      if (!r) return null;
      const next = { ...sessionRef.current, accessToken: r.accessToken }; setSession(next); return r.accessToken;
    },
    onSessionExpired: () => doLogout(true),
    refreshSkewSeconds: 5,
  }), [setSession, doLogout]);

  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);

  const refreshProfile = useCallback(() => { client.me().then(setProfile).catch(() => {}); }, [client]);
  const bootstrap = useCallback(async () => {
    const me = await client.meOrNull();   // GET /me through the real client (404 -> onboard)
    if (me) { setProfile(me); setPhase("app"); } else { setPhase("onboarding"); }
  }, [client]);

  // Launch: restore session, then bootstrap via the API.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await storage()?.get(SESSION_KEY); const s = r?.value ? JSON.parse(r.value) : null;
        if (!alive) return;
        if (s?.accessToken && idp.refresh(s.refreshToken)) { sessionRef.current = s; setSessionState(s); await bootstrap(); }
        else setPhase("auth");
      } catch { if (alive) setPhase("auth"); }
    })();
    return () => { alive = false; };
  }, [bootstrap]);

  const onAuthed = async (s) => { setExpiredNotice(null); setSessionEvent(""); setSession(s); setPhase("loading"); await bootstrap(); };
  const onboarded = () => { setTab("home"); setPhase("loading"); refreshProfile(); setPhase("app"); };

  // session demo actions — drive the real refresh/401 paths in CuevaClient
  const expireAccess = () => { setSession({ ...sessionRef.current, accessToken: mkJWT(session.email, -1000, "access") }); setSessionEvent("Access token forced expired. Next call → client refreshes it silently."); };
  const expireSession = () => { setSession({ ...sessionRef.current, accessToken: mkJWT(session.email, -1000, "access"), refreshToken: mkJWT(session.email, -1000, "refresh") }); setSessionEvent("Whole session expired. Next call → onSessionExpired → sign out."); };
  const callMe = async () => {
    try { await client.me(); setSessionEvent("✓ GET /me succeeded (token valid or silently refreshed by the client)."); refreshProfile(); }
    catch (e) { setSessionEvent(`✗ ${e.message}`); }
  };

  if (phase === "loading") return <div style={SHELL}><style>{FONTS}</style><div style={{ flex: 1, display: "grid", placeItems: "center" }}><Spinner label="Loading…" /></div></div>;
  if (phase === "auth") return <div style={SHELL}><style>{FONTS}</style><Auth onAuthed={onAuthed} notice={expiredNotice} /></div>;

  return (
    <div style={SHELL}>
      <style>{FONTS}</style>
      <div style={{ position: "absolute", top: 8, right: 12, zIndex: 5, display: "inline-flex", alignItems: "center", gap: 5, fontSize: 10.5, color: C.muted, background: "rgba(12,10,9,.6)", borderRadius: 999, padding: "3px 8px" }}>
        <Cloud size={12} color={C.learned} /> live API
      </div>
      {phase === "onboarding" ? (
        <div style={{ flex: 1, overflow: "hidden" }}><Onboarding client={client} onDone={onboarded} /></div>
      ) : (
        <>
          <div style={{ flex: 1, overflowY: "auto" }}>
            {tab === "home" && <HomeTab client={client} profile={profile} />}
            {tab === "discover" && <DiscoverTab client={client} profile={profile} onProfileChange={refreshProfile} />}
            {tab === "profile" && <ProfileTab client={client} profile={profile} onProfileChange={refreshProfile} email={session?.email} onLogout={() => doLogout(false)} session={session} now={now} sessionEvent={sessionEvent} onApiCall={callMe} onExpireAccess={expireAccess} onExpireSession={expireSession} />}
          </div>
          <div style={{ display: "flex", borderTop: `1px solid ${C.line}`, background: "#100d0a" }}>
            {TABS.map(({ id, label, icon: Icon }) => { const on = tab === id; return (
              <button key={id} onClick={() => setTab(id)} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 3, padding: "10px 0 12px", background: "transparent", border: "none", cursor: "pointer", color: on ? C.base : C.muted }}>
                <Icon size={21} strokeWidth={on ? 2.4 : 1.8} /><span style={{ fontSize: 11, fontWeight: on ? 700 : 500 }}>{label}</span>
              </button>); })}
          </div>
        </>
      )}
    </div>
  );
}
