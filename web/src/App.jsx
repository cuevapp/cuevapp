import React, { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, ResponsiveContainer } from "recharts";
import {
  Clapperboard, Check, Sparkles, Ticket, MonitorPlay, ArrowRight, Heart, ThumbsDown, Eye, EyeOff,
  Home as HomeIcon, Compass, User, Moon, TrendingUp, TrendingDown, SlidersHorizontal, Loader2,
  Mail, Lock, AlertCircle, LogOut, ShieldCheck, Cloud, Coffee, Info, ExternalLink, Search,
} from "lucide-react";
import { useAuth0 } from "@auth0/auth0-react";
import { Capacitor } from "@capacitor/core";
import { Browser } from "@capacitor/browser";
import { App as CapApp } from "@capacitor/app";
import { createAuth0Client } from "@auth0/auth0-spa-js";

/* =======================================================================
 *  Cueva — connected app. The UI calls CuevaClient; CuevaClient makes real
 *  fetch() requests with real auth + refresh/401 handling. A mock backend
 *  (the BACKEND section) implements the API contract in-browser so this
 *  runs without a server. TO GO LIVE: set API_URL to your backend and
 *  delete installMockBackend() — the app and client are unchanged.
 * ===================================================================== */
const API_URL = import.meta.env.VITE_API_URL || "https://api.cueva.local"; // set VITE_API_URL to your backend
const USE_MOCK = import.meta.env.VITE_USE_MOCK !== "false";                 // VITE_USE_MOCK=false -> hit the real API

// Auth0: present these env vars to switch from the mock IdP to real Auth0.
export const AUTH0 = {
  domain: import.meta.env.VITE_AUTH0_DOMAIN,
  clientId: import.meta.env.VITE_AUTH0_CLIENT_ID,
  audience: import.meta.env.VITE_AUTH0_AUDIENCE,
};
export const USING_AUTH0 = Boolean(AUTH0.domain && AUTH0.clientId);
// True only inside the native iOS/Android shell. The web build is always false.
export const IS_NATIVE = Capacitor.isNativePlatform();

// --- About / developer info (edit these; donate link can also come from VITE_DONATE_URL) ---
const ABOUT = {
  devName: "Adrian Rodriguez",
  devTagline: "Creator of Cueva",
  devBio:
    "A silly man trying to create something from a dream over a decade ago. " +
    "Thank you for trying this out and any support you want to throw my way!",
  links: [
    // { label: "GitHub",  url: "https://github.com/you" },
    // { label: "Website", url: "https://you.dev" },
  ],
  // Donate link (override per-deploy with VITE_DONATE_URL).
  donateUrl: import.meta.env.VITE_DONATE_URL || "https://buymeacoffee.com/cuevaapp",
  donateLabel: "Buy me a coffee",
};

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
    if (res.status === 204) return null;            // no-content (e.g. account deletion)
    return res.json();
  }
  onboardingCatalog(limit = 28) { return this._req(`/catalog/onboarding?limit=${limit}`, {}, false); }
  searchCatalog(q, limit = 24) { return this._req(`/catalog/search?q=${encodeURIComponent(q)}&limit=${limit}`, {}, false); }
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
  deleteAccount() { return this._req(`/me`, { method: "DELETE" }); }
}

/* =======================================================================
 *  BACKEND (mock) — implements the FastAPI contract + a mock identity
 *  provider, in-browser. Delete this whole section in production.
 * ===================================================================== */
// In the artifact this was window.storage; in a real app we back it with localStorage.
// This holds the session + the mock's data for the demo. In production the identity
// provider holds the session and real data lives in the backend, so this can shrink
// to just the session token (or be dropped if the SDK persists it for you).
const _ls = typeof window !== "undefined" ? window.localStorage : null;
const _store = _ls ? {
  async get(k) { const v = _ls.getItem(k); if (v === null) throw new Error("missing"); return { key: k, value: v }; },
  async set(k, v) { _ls.setItem(k, v); return { key: k, value: v }; },
  async delete(k) { _ls.removeItem(k); return { key: k, deleted: true }; },
} : null;
const storage = () => _store;
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
    if (path === "/catalog/search" && method === "GET") {
      const q = (u.searchParams.get("q") || "").toLowerCase();
      return J(CATALOG.filter((m) => m.t.toLowerCase().includes(q)).map((m) => ({ tmdb_id: m.id, title: m.t, year: m.y, poster_path: null, dominant_axis: topAxesArr(m.fp, 1)[0].axis, fingerprint: m.fp })));
    }
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
if (typeof window !== "undefined" && USE_MOCK) installMockBackend();

/* ===================== UI atoms ===================== */
const gradientFor = (f) => { const [a, b] = topAxesArr(f, 2); return `linear-gradient(150deg, ${GENRE_COLOR[a.axis]}cc, ${GENRE_COLOR[b.axis]}88 72%, #0c0a09 150%)`; };
const Spinner = ({ label }) => (
  <div style={{ display: "grid", placeItems: "center", padding: 30, color: C.muted }}>
    <style>{`@keyframes spin{to{transform:rotate(360deg)}}.cv-spin{animation:spin 1s linear infinite}`}</style>
    <Loader2 size={20} className="cv-spin" /><div style={{ fontSize: 12.5, marginTop: 8 }}>{label}</div>
  </div>
);
// Real poster art from TMDB. The gradient (gradientFor) stays as the background, so
// it shows while the image loads and as a graceful fallback if a film has no poster
// or the image fails to load (onError hides the <img>).
const IMG_BASE = "https://image.tmdb.org/t/p";
const tmdbPoster = (path, size = "w342") => (path ? `${IMG_BASE}/${size}${path}` : null);
const hidePoster = (e) => { e.currentTarget.style.display = "none"; };

function Poster({ f, poster, size = "w342", w, h, pct }) {
  const src = tmdbPoster(poster, size);
  return (
    <div style={{ width: w, height: h, flexShrink: 0, borderRadius: 11, background: gradientFor(f), position: "relative", overflow: "hidden", boxShadow: "0 6px 16px rgba(0,0,0,.4)" }}>
      {src && <img src={src} alt="" loading="lazy" onError={hidePoster} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />}
      <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, rgba(8,7,6,.78), transparent 58%)" }} />
      {pct != null && <div style={{ position: "absolute", top: 7, right: 7, fontSize: 10.5, fontWeight: 700, padding: "2px 6px", borderRadius: 999, background: "rgba(12,10,9,.72)", color: C.base }}>{pct}%</div>}
    </div>
  );
}
// Fandango search for a title — lands on showtimes/ticket purchase for in-theater films.
// Commission Junction (CJ) affiliate wrap: when the CJ ids are configured, outbound
// Fandango links route through CJ's tracking redirect so ticket sales earn commission.
// All three come from your CJ dashboard after the Fandango program is approved; the
// redirect domain is the one CJ shows in its link generator (anrdoezrs.net, tkqlhce.com,
// dpbolvw.net, …). With the ids unset, links fall back to a plain Fandango search.
const CJ_PID = import.meta.env.VITE_CJ_PID;                 // your CJ website/publisher id
const CJ_AID = import.meta.env.VITE_CJ_FANDANGO_AID;        // Fandango advertiser link id in CJ
const CJ_DOMAIN = import.meta.env.VITE_CJ_DOMAIN || "anrdoezrs.net";
const fandangoSearch = (title) => `https://www.fandango.com/search?q=${encodeURIComponent(title || "")}`;
const fandangoUrl = (title) => {
  const target = fandangoSearch(title);
  if (!CJ_PID || !CJ_AID) return target;                   // no affiliate configured → plain link
  return `https://www.${CJ_DOMAIN}/click-${CJ_PID}-${CJ_AID}?url=${encodeURIComponent(target)}`;
};
// Availability indicator. In theaters -> a "Get tickets" link to Fandango; otherwise the
// first streaming provider. Uses the `inTheaters` flag (the API's source of truth) rather
// than sniffing the providers array, so it's correct against both the mock and real backend.
const Badge = ({ inTheaters, providers, title }) => {
  if (inTheaters) return (
    <a href={fandangoUrl(title)} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}
       title={`Get tickets for ${title} on Fandango`}
       style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, fontWeight: 600, color: C.base, textDecoration: "none" }}>
      <Ticket size={12} /> Get tickets
    </a>
  );
  const p = providers?.[0];
  if (!p) return null;
  return <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, fontWeight: 600, color: C.learned }}><MonitorPlay size={12} />{p}</span>;
};
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
            <Poster f={CAT[m.tmdb_id]?.fp || {}} poster={m.poster_path} w={116} h={170} pct={m.match_pct} />
            <div style={{ fontSize: 12.5, fontWeight: 700, marginTop: 6, lineHeight: 1.2 }}>{m.title}</div>
            <div style={{ marginTop: 3 }}><Badge inTheaters={m.in_theaters} providers={m.providers} title={m.title} /></div>
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
function Auth({ onSubmit, notice }) {
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState(""); const [password, setPassword] = useState("");
  const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  const ok = /\S+@\S+\.\S+/.test(email) && password.length >= 6;
  const submit = async () => {
    if (!ok || busy) return; setBusy(true); setErr("");
    try { await onSubmit(mode, email, password); }
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
  const [query, setQuery] = useState(""); const [results, setResults] = useState(null); const [searching, setSearching] = useState(false);
  // Remember the fingerprint of every film we've shown (curated grid + search results) so the
  // live preview radar can average whatever the user picked, no matter where they found it.
  const fpMap = useRef({});
  const remember = (items) => { (items || []).forEach((m) => { fpMap.current[m.tmdb_id] = m.fingerprint; }); };
  useEffect(() => { client.onboardingCatalog(28).then((items) => { setCatalog(items); remember(items); }).catch(() => setCatalog([])); }, [client]);
  // Debounced title search over the catalog.
  useEffect(() => {
    const q = query.trim();
    if (!q) { setResults(null); setSearching(false); return; }
    setSearching(true);
    const t = setTimeout(() => {
      client.searchCatalog(q, 24).then((items) => { remember(items); setResults(items); }).catch(() => setResults([])).finally(() => setSearching(false));
    }, 300);
    return () => clearTimeout(t);
  }, [query, client]);
  const base = useMemo(() => {
    const have = picked.map((id) => fpMap.current[id]).filter(Boolean);
    return AXES.reduce((o, a) => ({ ...o, [a]: have.length ? Math.round(have.reduce((s, f) => s + f[a], 0) / have.length) : 5 }), {});
  }, [picked]);

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
  const card = (m) => { const on = picked.includes(m.tmdb_id); return (
    <div key={m.tmdb_id} onClick={() => toggle(m.tmdb_id)} style={{ cursor: "pointer" }}>
      <div style={{ position: "relative", aspectRatio: "2/3", borderRadius: 12, overflow: "hidden", background: gradientFor(m.fingerprint), border: `2px solid ${on ? C.base : "transparent"}`, boxShadow: on ? "0 8px 22px rgba(245,166,35,.32)" : "0 4px 14px rgba(0,0,0,.4)", display: "flex", flexDirection: "column", justifyContent: "flex-end", padding: 9 }}>
        {tmdbPoster(m.poster_path) && <img src={tmdbPoster(m.poster_path)} alt="" loading="lazy" onError={hidePoster} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />}
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, rgba(8,7,6,.82), transparent 58%)" }} />
        {on && <div style={{ position: "absolute", top: 8, right: 8, width: 22, height: 22, borderRadius: "50%", background: C.base, display: "grid", placeItems: "center" }}><Check size={13} color="#1a1206" strokeWidth={3} /></div>}
        <div style={{ position: "relative", fontFamily: "'Fraunces',serif", fontSize: 13, fontWeight: 600, lineHeight: 1.15 }}>{m.title}</div>
      </div>
    </div>); };
  const grid = (films) => <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(104px,1fr))", gap: 11 }}>{films.map(card)}</div>;
  const inSearch = query.trim().length > 0;
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}.cv-spin{animation:spin 1s linear infinite}.cv-field:focus{border-color:${C.base}!important}`}</style>
      <div style={{ padding: "16px 20px 8px" }}>
        <h2 style={{ fontFamily: "'Fraunces',serif", fontSize: 24, fontWeight: 600, margin: "4px 0 2px" }}>Pick films you love</h2>
        <p style={{ color: C.muted, fontSize: 13, margin: "0 0 12px" }}>Search for your favorites, or pick from below — at least {MIN_PICKS}.</p>
        <div style={{ position: "relative" }}>
          <Search size={16} color={C.muted} style={{ position: "absolute", left: 13, top: 13, pointerEvents: "none" }} />
          <input className="cv-field" style={{ ...FIELD, paddingRight: 34 }} placeholder="Search a movie you love…" value={query} onChange={(e) => setQuery(e.target.value)} />
          {query && <button onClick={() => setQuery("")} aria-label="Clear search" style={{ position: "absolute", right: 8, top: 8, width: 24, height: 24, borderRadius: "50%", border: "none", background: "transparent", color: C.muted, cursor: "pointer", fontSize: 17, lineHeight: 1 }}>×</button>}
        </div>
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: "8px 20px 16px" }}>
        {inSearch
          ? (results === null ? <Spinner label="Searching…" />
            : results.length === 0 ? <div style={{ textAlign: "center", color: C.muted, fontSize: 13, lineHeight: 1.6, padding: "26px 12px" }}>No films matching “{query.trim()}” in our catalog yet.<br />Try another title, or pick from the grid.</div>
            : grid(results))
          : (!catalog ? <Spinner label="Loading catalog…" /> : grid(catalog))}
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
            <Poster f={CAT[m.tmdb_id]?.fp || {}} poster={m.poster_path} size="w185" w={50} h={75} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14.5, fontWeight: 700 }}>{m.title} <span style={{ color: C.muted, fontWeight: 400 }}>· {m.year}</span></div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                <span style={{ fontSize: 12, color: C.base, fontWeight: 600 }}>{m.match_pct}% match</span>
                {m.in_theaters && <Badge inTheaters title={m.title} />}
              </div>
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
  const [deleting, setDeleting] = useState(false);
  const deleteAccount = async () => {
    if (!window.confirm("Permanently delete your Cueva account and all your data (taste profile + feedback)? This can't be undone.")) return;
    setDeleting(true);
    try { await client.deleteAccount(); onLogout(); }
    catch (e) { setDeleting(false); window.alert("Couldn't delete account: " + e.message); }
  };
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
      {/* About Cueva */}
      <div style={{ marginTop: 22, background: C.panel, border: `1px solid ${C.line}`, borderRadius: 14, padding: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 13, fontWeight: 600, marginBottom: 10 }}><Info size={14} color={C.base} /> About Cueva</div>
        <p style={{ fontSize: 12.5, color: C.text, lineHeight: 1.6, margin: 0 }}>
          Cueva reads every film across seven feeling-axes — Action, Comedy, Romance, Sci-Fi, Adventure, Drama and Horror — to draw its <strong>fingerprint</strong>. From the movies you love it builds <em>yours</em>, then finds films whose shape matches it. Each time you react, your fingerprint sharpens — so the matches get more <em>you</em> over time.
        </p>
        <p style={{ fontSize: 12, color: C.muted, lineHeight: 1.6, margin: "10px 0 0" }}>No star ratings, no genres to scroll. Just taste, as a shape.</p>
      </div>

      {/* Meet the developer + Donate */}
      <div style={{ marginTop: 16, background: C.panel, border: `1px solid ${C.line}`, borderRadius: 14, padding: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 13, fontWeight: 600, marginBottom: 12 }}><User size={14} color={C.learned} /> Meet the developer</div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 44, height: 44, borderRadius: "50%", flexShrink: 0, display: "grid", placeItems: "center", background: "linear-gradient(135deg,#f5a623,#d4791b)", color: "#1a1206", fontFamily: "'Fraunces',serif", fontWeight: 600, fontSize: 18 }}>{(ABOUT.devName.trim()[0] || "?").toUpperCase()}</div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontFamily: "'Fraunces',serif", fontSize: 16, fontWeight: 600 }}>{ABOUT.devName}</div>
            <div style={{ fontSize: 12, color: C.muted }}>{ABOUT.devTagline}</div>
          </div>
        </div>
        <p style={{ fontSize: 12.5, color: C.text, lineHeight: 1.6, margin: "12px 0 0" }}>{ABOUT.devBio}</p>
        {ABOUT.links.length > 0 && (
          <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginTop: 10 }}>
            {ABOUT.links.map((l) => (
              <a key={l.url} href={l.url} target="_blank" rel="noopener noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, fontWeight: 600, color: C.learned, textDecoration: "none" }}><ExternalLink size={13} /> {l.label}</a>
            ))}
          </div>
        )}
        <a
          href={ABOUT.donateUrl || undefined}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => { if (!ABOUT.donateUrl) e.preventDefault(); }}
          title={ABOUT.donateUrl ? `Support ${ABOUT.devName}` : "Set ABOUT.donateUrl or VITE_DONATE_URL to enable"}
          style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 9, marginTop: 16, width: "100%", boxSizing: "border-box", fontSize: 14.5, fontWeight: 700, padding: "12px", borderRadius: 13, border: "none", cursor: ABOUT.donateUrl ? "pointer" : "not-allowed", opacity: ABOUT.donateUrl ? 1 : 0.5, color: "#1a1206", background: "linear-gradient(135deg,#f5a623,#d4791b)", textDecoration: "none" }}
        >
          <Coffee size={17} /> {ABOUT.donateLabel}
        </a>
        {!ABOUT.donateUrl && <div style={{ fontSize: 10.5, color: C.muted, textAlign: "center", marginTop: 8 }}>Add your donation link (Ko-fi, Buy Me a Coffee, PayPal…) to enable.</div>}
      </div>

      {session && <SessionCard token={session.accessToken} refreshToken={session.refreshToken} now={now} event={sessionEvent} onApiCall={onApiCall} onExpireAccess={onExpireAccess} onExpireSession={onExpireSession} />}
      <div style={{ display: "flex", gap: 10, marginTop: 22, flexWrap: "wrap" }}>
        <button onClick={onLogout} style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 600, color: C.muted, background: "transparent", border: `1px solid ${C.line}`, borderRadius: 999, padding: "9px 16px", cursor: "pointer" }}><LogOut size={14} /> Log out</button>
        <button onClick={deleteAccount} disabled={deleting} style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 600, color: "#e8888a", background: "transparent", border: "1px solid rgba(232,136,138,.35)", borderRadius: 999, padding: "9px 16px", cursor: deleting ? "default" : "pointer", opacity: deleting ? 0.5 : 1 }}>{deleting ? "Deleting…" : "Delete account"}</button>
      </div>
      <p style={{ fontSize: 10.5, color: C.muted, lineHeight: 1.5, marginTop: 20 }}>Movie data and posters provided by TMDB. This product uses the TMDB API but is not endorsed or certified by TMDB.</p>
    </div>
  );
}

/* ===================== shell ===================== */
const TABS = [{ id: "home", label: "Home", icon: HomeIcon }, { id: "discover", label: "Discover", icon: Compass }, { id: "profile", label: "Profile", icon: User }];
const SESSION_KEY = "cueva_session";
const SHELL = { background: C.bg, color: C.text, fontFamily: "'Hanken Grotesk',sans-serif", borderRadius: 20, overflow: "hidden", height: 700, display: "flex", flexDirection: "column", maxWidth: 440, margin: "0 auto", border: `1px solid ${C.line}`, position: "relative" };

// Hosted-login screen for providers that own their own login UI (Auth0, Clerk…).
function RedirectLogin({ onLogin, notice }) {
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", padding: "30px 28px", textAlign: "center" }}>
      <div style={{ width: 52, height: 52, borderRadius: 15, display: "grid", placeItems: "center", marginBottom: 20, background: "linear-gradient(135deg,#f5a623,#d4791b)", boxShadow: "0 10px 36px rgba(245,166,35,.4)" }}><Clapperboard size={28} color="#1a1206" /></div>
      <h1 style={{ fontFamily: "'Fraunces',serif", fontSize: 28, fontWeight: 600, margin: 0 }}>Welcome to Cueva</h1>
      <p style={{ color: C.muted, fontSize: 14, lineHeight: 1.6, maxWidth: 320, marginTop: 10 }}>Sign in or create an account to build your movie fingerprint.</p>
      {notice && <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12.5, color: C.base, background: "rgba(245,166,35,.1)", border: "1px solid rgba(245,166,35,.3)", borderRadius: 9, padding: "9px 11px", margin: "16px 0 0" }}><AlertCircle size={15} /> {notice}</div>}
      <button onClick={onLogin} style={{ marginTop: 22, display: "inline-flex", alignItems: "center", gap: 9, fontSize: 15.5, fontWeight: 700, padding: "14px 28px", borderRadius: 13, border: "none", cursor: "pointer", color: "#1a1206", background: "linear-gradient(135deg,#f5a623,#d4791b)" }}>Continue <ArrowRight size={18} /></button>
      <p style={{ fontSize: 11, color: C.muted, lineHeight: 1.5, marginTop: 18, maxWidth: 300 }}>You'll be redirected to your identity provider. Cueva verifies the returned token and never sees your password.</p>
    </div>
  );
}

/* AppCore is provider-agnostic. It receives a normalized `auth` object + a configured
 * CuevaClient and owns everything else (bootstrap, tabs, data). The two shells below
 * implement `auth` for the mock IdP and for Auth0 — that's the entire seam. */
function AppCore({ client, auth }) {
  const [tab, setTab] = useState("home");
  const [phase, setPhase] = useState("boot"); // boot | onboarding | app  (gated by auth.ready/isAuthenticated)
  const [profile, setProfile] = useState(null);

  const refreshProfile = useCallback(() => { client.me().then(setProfile).catch(() => {}); }, [client]);
  const bootstrap = useCallback(async () => {
    setPhase("boot");
    try { const me = await client.meOrNull(); setProfile(me); setPhase(me ? "app" : "onboarding"); } // 404 -> onboard
    catch { setPhase("boot"); }
  }, [client]);

  // Bootstrap once the provider says we're authenticated; reset when we sign out.
  useEffect(() => { if (auth.ready && auth.isAuthenticated) { bootstrap(); } else { setProfile(null); } }, [auth.ready, auth.isAuthenticated, bootstrap]);

  const onboarded = () => { setTab("home"); setPhase("boot"); client.me().then((p) => { setProfile(p); setPhase("app"); }).catch(() => setPhase("app")); };

  if (!auth.ready) return <div style={SHELL}><style>{FONTS}</style><div style={{ flex: 1, display: "grid", placeItems: "center" }}><Spinner label="Loading…" /></div></div>;
  if (!auth.isAuthenticated) return (
    <div style={SHELL}><style>{FONTS}</style>
      {auth.kind === "auth0" ? <RedirectLogin onLogin={auth.login} notice={auth.notice} /> : <Auth onSubmit={auth.login} notice={auth.notice} />}
    </div>
  );

  return (
    <div style={SHELL}>
      <style>{FONTS}</style>
      <div style={{ position: "absolute", top: 8, right: 12, zIndex: 5, display: "inline-flex", alignItems: "center", gap: 5, fontSize: 10.5, color: C.muted, background: "rgba(12,10,9,.6)", borderRadius: 999, padding: "3px 8px" }}>
        <Cloud size={12} color={C.learned} /> {auth.kind === "auth0" ? "Auth0 + API" : "live API"}
      </div>
      {phase === "boot" ? <div style={{ flex: 1, display: "grid", placeItems: "center" }}><Spinner label="Loading your fingerprint…" /></div>
        : phase === "onboarding" ? <div style={{ flex: 1, overflow: "hidden" }}><Onboarding client={client} onDone={onboarded} /></div>
          : (
            <>
              <div style={{ flex: 1, overflowY: "auto" }}>
                {tab === "home" && profile && <HomeTab client={client} profile={profile} />}
                {tab === "discover" && profile && <DiscoverTab client={client} profile={profile} onProfileChange={refreshProfile} />}
                {tab === "profile" && profile && <ProfileTab client={client} profile={profile} onProfileChange={refreshProfile} email={auth.email} onLogout={auth.logout}
                  session={auth.sessionDemo?.session} now={auth.sessionDemo?.now} sessionEvent={auth.sessionDemo?.event}
                  onApiCall={auth.sessionDemo?.callMe} onExpireAccess={auth.sessionDemo?.expireAccess} onExpireSession={auth.sessionDemo?.expireSession} />}
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

/* ---- Shell A: the mock IdP (default; works with no Auth0 account) ---- */
function MockAuthShell() {
  const [session, setSessionState] = useState(null);
  const [ready, setReady] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [sessionEvent, setSessionEvent] = useState(""); const [notice, setNotice] = useState(null);
  const sessionRef = useRef(null);
  const setSession = useCallback((s) => { sessionRef.current = s; setSessionState(s); try { s ? storage()?.set(SESSION_KEY, JSON.stringify(s)) : storage()?.delete(SESSION_KEY); } catch (e) { /* ignore */ } }, []);
  const logout = useCallback((expired) => { setSession(null); setSessionEvent(""); setNotice(expired ? "Your session expired — please sign in again." : null); }, [setSession]);

  const client = useMemo(() => new CuevaClient(API_URL, {
    getToken: () => sessionRef.current?.accessToken ?? null,
    refreshToken: async () => { const r = idp.refresh(sessionRef.current?.refreshToken); if (!r) return null; const next = { ...sessionRef.current, accessToken: r.accessToken }; setSession(next); return r.accessToken; },
    onSessionExpired: () => logout(true),
    refreshSkewSeconds: 5,
  }), [setSession, logout]);

  useEffect(() => { (async () => { try { const r = await storage()?.get(SESSION_KEY); const s = r?.value ? JSON.parse(r.value) : null; if (s?.accessToken && idp.refresh(s.refreshToken)) { sessionRef.current = s; setSessionState(s); } } catch (e) { /* none */ } setReady(true); })(); }, []);
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);

  const expireAccess = () => { setSession({ ...sessionRef.current, accessToken: mkJWT(session.email, -1000, "access") }); setSessionEvent("Access token forced expired. Next call → client refreshes it silently."); };
  const expireSession = () => { setSession({ ...sessionRef.current, accessToken: mkJWT(session.email, -1000, "access"), refreshToken: mkJWT(session.email, -1000, "refresh") }); setSessionEvent("Whole session expired. Next call → onSessionExpired → sign out."); };
  const callMe = async () => { try { await client.me(); setSessionEvent("✓ GET /me succeeded (token valid or silently refreshed)."); } catch (e) { setSessionEvent(`✗ ${e.message}`); } };

  const auth = {
    kind: "mock", ready, isAuthenticated: !!session, email: session?.email, notice,
    login: async (mode, email, password) => { setNotice(null); setSession(await (mode === "signup" ? idp.signUp : idp.logIn)(email, password)); },
    logout: () => logout(false),
    sessionDemo: { session, now, event: sessionEvent, callMe, expireAccess, expireSession },
  };
  return <AppCore client={client} auth={auth} />;
}

/* ---- Shell B: real Auth0 (active when VITE_AUTH0_* are set) ----
 * The whole integration: getToken/refreshToken come from Auth0's SDK, which manages
 * the access token + silent refresh. CuevaClient's refresh/401 logic still applies as
 * a safety net. No password ever touches this app — Auth0 hosts login. */
function Auth0AuthShell() {
  const { isLoading, isAuthenticated, user, loginWithRedirect, logout, getAccessTokenSilently } = useAuth0();
  const client = useMemo(() => new CuevaClient(API_URL, {
    getToken: () => getAccessTokenSilently().catch(() => null),
    refreshToken: () => getAccessTokenSilently({ cacheMode: "off" }).catch(() => null),
    onSessionExpired: () => loginWithRedirect(),
    refreshSkewSeconds: 30,
  }), [getAccessTokenSilently, loginWithRedirect]);

  const auth = {
    kind: "auth0", ready: !isLoading, isAuthenticated, email: user?.email, notice: null,
    login: () => loginWithRedirect(),
    logout: () => logout({ logoutParams: { returnTo: window.location.origin } }),
    sessionDemo: null, // Auth0 manages tokens; no manual expiry demo
  };
  return <AppCore client={client} auth={auth} />;
}

/* ---- Shell C: local dev against the REAL backend (AUTH_DEV_MODE=true) ----
 * Active when VITE_USE_MOCK=false and no Auth0 vars are set. Keeps the
 * email/password UX (accounts are checked + stored locally by `idp`, so wrong
 * passwords are rejected and each account is distinct) but issues `dev:<email>`
 * bearer tokens that the backend's AUTH_DEV_MODE accepts. The string after
 * "dev:" is the stable subject, so the Cueva profile persists in Postgres.
 * LOCAL DEVELOPMENT ONLY — production uses the Auth0 shell. */
function DevAuthShell() {
  const [session, setSessionState] = useState(null);
  const [ready, setReady] = useState(false);
  const [notice, setNotice] = useState(null);
  const sessionRef = useRef(null);
  const setSession = useCallback((s) => { sessionRef.current = s; setSessionState(s); try { s ? storage()?.set(SESSION_KEY, JSON.stringify(s)) : storage()?.delete(SESSION_KEY); } catch (e) { /* ignore */ } }, []);
  const logout = useCallback(() => { setSession(null); setNotice(null); }, [setSession]);

  const client = useMemo(() => new CuevaClient(API_URL, {
    getToken: () => sessionRef.current?.accessToken ?? null,
    refreshToken: () => sessionRef.current?.accessToken ?? null, // dev tokens don't expire
    onSessionExpired: () => logout(),
    refreshSkewSeconds: 30,
  }), [logout]);

  // Restore a persisted dev session on reload (ignore stale non-dev sessions).
  useEffect(() => { (async () => { try { const r = await storage()?.get(SESSION_KEY); const s = r?.value ? JSON.parse(r.value) : null; if (s?.accessToken?.startsWith?.("dev:")) { sessionRef.current = s; setSessionState(s); } } catch (e) { /* none */ } setReady(true); })(); }, []);

  const auth = {
    kind: "dev", ready, isAuthenticated: !!session, email: session?.email, notice,
    login: async (mode, email, password) => {
      setNotice(null);
      const acct = await (mode === "signup" ? idp.signUp : idp.logIn)(email, password); // credential check + local account store
      setSession({ email: acct.email, accessToken: `dev:${acct.email}` });
    },
    logout,
    sessionDemo: null, // no token-expiry demo against the real backend
  };
  return <AppCore client={client} auth={auth} />;
}

/* ---- Shell D: native (Capacitor) Auth0 — system-browser login + custom-scheme callback ----
 * Active ONLY inside the iOS/Android app (Capacitor.isNativePlatform()). The web build never
 * renders this; it keeps using Auth0AuthShell. Auth0's @auth0/auth0-react redirect flow can't
 * complete in a native shell, so here we drive @auth0/auth0-spa-js: login opens the system
 * browser (@capacitor/browser) and the redirect comes back via the app's custom URL scheme,
 * caught by @capacitor/app's appUrlOpen.
 *
 * REQUIRED SETUP (see MOBILE.md): add this redirect URI to the Auth0 app's Allowed Callback
 * URLs AND Allowed Logout URLs, and register the `com.cuevapp.app` scheme in the native
 * projects (AndroidManifest intent-filter is added; iOS needs an Info.plist URL type). */
const NATIVE_APP_ID = "com.cuevapp.app";
const NATIVE_REDIRECT = `${NATIVE_APP_ID}://${AUTH0.domain}/capacitor/${NATIVE_APP_ID}/callback`;

function CapacitorAuthShell() {
  const [ready, setReady] = useState(false);
  const [isAuth, setIsAuth] = useState(false);
  const [email, setEmail] = useState(null);
  const a0Ref = useRef(null);

  const login = async () => {
    await a0Ref.current?.loginWithRedirect({
      authorizationParams: { redirect_uri: NATIVE_REDIRECT },
      openUrl: (url) => Browser.open({ url, windowName: "_self" }),
    });
  };
  const logout = async () => {
    await a0Ref.current?.logout({
      logoutParams: { returnTo: NATIVE_REDIRECT },
      openUrl: (url) => Browser.open({ url, windowName: "_self" }),
    });
    setIsAuth(false); setEmail(null);
  };

  useEffect(() => {
    let sub;
    (async () => {
      const a0 = await createAuth0Client({
        domain: AUTH0.domain,
        clientId: AUTH0.clientId,
        useRefreshTokens: true,
        cacheLocation: "localstorage",            // survive app restarts
        authorizationParams: { audience: AUTH0.audience, redirect_uri: NATIVE_REDIRECT },
      });
      a0Ref.current = a0;
      const sync = async () => {
        const authed = await a0.isAuthenticated();
        setIsAuth(authed);
        setEmail(authed ? (await a0.getUser())?.email ?? null : null);
      };
      // The Auth0 redirect returns via the custom scheme; finish the login here.
      sub = await CapApp.addListener("appUrlOpen", async ({ url }) => {
        if (url && url.startsWith(NATIVE_APP_ID + "://") && url.includes("state=") && (url.includes("code=") || url.includes("error="))) {
          try { await a0.handleRedirectCallback(url); } catch (e) { /* ignore; user can retry */ }
          await Browser.close().catch(() => {});
          await sync();
        }
      });
      await sync();
      setReady(true);
    })();
    return () => { sub?.remove?.(); };
  }, []);

  const client = useMemo(() => new CuevaClient(API_URL, {
    getToken: async () => { try { return await a0Ref.current?.getTokenSilently(); } catch { return null; } },
    refreshToken: async () => { try { return await a0Ref.current?.getTokenSilently({ cacheMode: "off" }); } catch { return null; } },
    onSessionExpired: () => login(),
    refreshSkewSeconds: 30,
  }), []);

  const auth = { kind: "auth0", ready, isAuthenticated: isAuth, email, notice: null, login, logout, sessionDemo: null };
  return <AppCore client={client} auth={auth} />;
}

export default function App() {
  if (IS_NATIVE) return <CapacitorAuthShell />;          // iOS/Android app
  if (USING_AUTH0) return <Auth0AuthShell />;             // web, real auth
  return USE_MOCK ? <MockAuthShell /> : <DevAuthShell />; // web, mock / dev
}
