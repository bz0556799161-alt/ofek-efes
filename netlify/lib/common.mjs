// Shared server code for the Ofek Efes site functions.
import { getStore } from "@netlify/blobs";

export const SECTIONS = ["book", "game", "globe"];
export const MODES = ["open", "soon", "locked", "hidden"];

export const siteStore = () => getStore({ name: "ofek-site", consistency: "strong" });
export const visitorStore = () => getStore({ name: "ofek-visitors" });
export const fontStore = () => getStore({ name: "ofek-fonts" });

export function defaultConfig() {
  return {
    public: {
      sections: { book: { mode: "open" }, game: { mode: "open" }, globe: { mode: "open" } },
      texts: {},
      textStyles: {},  // עיצוב לטקסט מסוים: {b,i,u,s,c,f,a}
      fonts: {},
      customFonts: [],
      chapters: null,
      seriesUrl: null,
      game: null,      // כבוש את השמים: {open:[keys], schedule:[{key,at}], codes:[{h,name,ch,free}]}; null = ההגדרות שבתוך המשחק
      chapterEdits: {}, // תיקונים לפרקים שנקראו מפרוג: {id:{title, summary, hidden}}
      globe: null,     // המבנה הכדורי: {open:[roomIds]}; רשימה ריקה = הכל פתוח
      updatedAt: 0
    },
    private: { codes: {}, gameCodes: {} }
  };
}

export async function loadConfig() {
  const stored = await siteStore().get("config", { type: "json" });
  const d = defaultConfig();
  if (!stored) return d;
  const pub = Object.assign(d.public, stored.public || {});
  pub.sections = Object.assign(defaultConfig().public.sections, (stored.public && stored.public.sections) || {});
  return { public: pub, private: Object.assign(d.private, stored.private || {}) };
}

export async function saveConfig(cfg) {
  cfg.public.updatedAt = Date.now();
  await siteStore().setJSON("config", cfg);
}

/* ---------------- crypto helpers ---------------- */
const enc = new TextEncoder();
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");

export async function sha256(text) {
  return hex(await crypto.subtle.digest("SHA-256", enc.encode(text)));
}
export async function hmac(secret, msg) {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return hex(await crypto.subtle.sign("HMAC", key, enc.encode(msg)));
}
export function randomHex(n = 32) {
  const a = new Uint8Array(n);
  crypto.getRandomValues(a);
  return hex(a);
}
// constant-time string compare
export function safeEqual(a, b) {
  a = String(a); b = String(b);
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

let secretCache = null;
export async function getSecret() {
  if (secretCache) return secretCache;
  const store = siteStore();
  let s = await store.get("secret");
  if (!s) {
    await store.set("secret", randomHex(32), { onlyIfNew: true });
    s = await store.get("secret");
  }
  secretCache = s;
  return s;
}

/* ---------------- cookies ---------------- */
export function readCookies(req) {
  const out = {};
  (req.headers.get("cookie") || "").split(";").forEach((part) => {
    const i = part.indexOf("=");
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  });
  return out;
}
export function cookie(name, value, maxAge) {
  return `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Lax`;
}

/* ---------------- admin session ---------------- */
const ADMIN_DAYS = 7;
export function adminPassword() {
  const p = (globalThis.Netlify && Netlify.env && Netlify.env.get("ADMIN_PASSWORD")) || process.env.ADMIN_PASSWORD || "";
  return p;
}
export async function adminToken(exp) {
  const secret = await getSecret();
  return exp + "." + (await hmac(secret, "admin:" + exp + ":" + (await sha256(adminPassword()))));
}
export async function isAdmin(req) {
  if (!adminPassword()) return false;
  const c = readCookies(req).ofek_admin;
  if (!c) return false;
  const exp = parseInt(c.split(".")[0], 10);
  if (!exp || exp < Date.now()) return false;
  return safeEqual(c, await adminToken(exp));
}
export async function adminCookie() {
  const exp = Date.now() + ADMIN_DAYS * 864e5;
  return cookie("ofek_admin", await adminToken(exp), ADMIN_DAYS * 86400);
}

/* ---------------- section access ---------------- */
export async function unlockToken(section, codeHash) {
  return hmac(await getSecret(), "unlock:" + section + ":" + codeHash);
}
export async function canAccess(req, cfg, section) {
  const mode = (cfg.public.sections[section] || {}).mode || "open";
  if (mode === "open") return true;
  if (await isAdmin(req)) return true;
  if (mode !== "locked") return false;
  const code = cfg.private.codes[section];
  if (!code) return true; // locked without a code means nothing to check
  const c = readCookies(req)["ofek_u_" + section];
  return !!c && safeEqual(c, await unlockToken(section, code.hash));
}
export async function hashCode(code, salt) {
  return sha256(salt + ":" + String(code).trim().toLowerCase());
}

/* ---------------- responses ---------------- */
export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: Object.assign({ "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }, headers)
  });
}
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function israelDay(ts = Date.now()) {
  return new Date(ts).toLocaleDateString("en-CA", { timeZone: "Asia/Jerusalem" });
}
