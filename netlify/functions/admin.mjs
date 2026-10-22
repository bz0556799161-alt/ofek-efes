// Admin API: login, settings, fonts and stats. Every route except login needs the admin cookie.
import { purgeCache } from "@netlify/functions";
import {
  loadConfig, saveConfig, isAdmin, adminCookie, adminPassword, cookie, json, sleep, safeEqual,
  sha256, randomHex, hashCode, visitorStore, fontStore, israelDay, SECTIONS, MODES
} from "../lib/common.mjs";

const FONT_EXT = ["woff2", "woff", "ttf", "otf"];
const FONT_FORMAT = { woff2: "woff2", woff: "woff", ttf: "truetype", otf: "opentype" };
const MAX_FONT = 4 * 1024 * 1024;
const failed = new Map();

const s = (v, max) => String(v == null ? "" : v).slice(0, max);

async function refreshPublicCache() {
  try { await purgeCache({ tags: ["config"] }); } catch (e) { /* the CDN copy expires within 30s anyway */ }
}

/* ---------------- settings ---------------- */
function cleanPublic(input, current) {
  const out = JSON.parse(JSON.stringify(current));
  if (input.sections) {
    for (const sec of SECTIONS) {
      const m = input.sections[sec] && input.sections[sec].mode;
      if (MODES.includes(m)) out.sections[sec] = { mode: m };
    }
  }
  if (input.texts && typeof input.texts === "object") {
    const t = {};
    Object.keys(input.texts).slice(0, 400).forEach((k) => {
      if (/^[a-z0-9._-]{1,60}$/i.test(k) && typeof input.texts[k] === "string") t[k] = input.texts[k].slice(0, 3000);
    });
    out.texts = t;
  }
  if (input.fonts && typeof input.fonts === "object") {
    const f = {};
    for (const role of ["display", "body"]) {
      const x = input.fonts[role];
      if (x && x.family) f[role] = { family: s(x.family, 60).replace(/["<>;{}]/g, ""), kind: x.kind === "custom" ? "custom" : "google" };
    }
    out.fonts = f;
  }
  if ("chapters" in input) {
    if (Array.isArray(input.chapters) && input.chapters.length) {
      out.chapters = input.chapters.slice(0, 500).map((c) => ({
        num: s(c.num, 10), title: s(c.title, 200), heDate: s(c.heDate, 60), date: s(c.date, 30),
        url: /^https?:\/\//.test(c.url || "") ? s(c.url, 600) : "", teaser: s(c.teaser, 1000)
      }));
    } else out.chapters = null;
  }
  if ("seriesUrl" in input) out.seriesUrl = /^https?:\/\//.test(input.seriesUrl || "") ? s(input.seriesUrl, 600) : null;
  return out;
}

/* ---------------- stats ---------------- */
async function stats() {
  const store = visitorStore();
  const keys = [];
  for await (const page of store.list({ paginate: true })) page.blobs.forEach((b) => keys.push(b.key));
  const docs = [];
  for (let i = 0; i < keys.length; i += 40) {
    const batch = await Promise.all(keys.slice(i, i + 40).map((k) => store.get(k, { type: "json" }).then((d) => d && Object.assign(d, { id: k })).catch(() => null)));
    batch.forEach((d) => d && docs.push(d));
  }
  const now = Date.now(), today = israelDay(now);
  const lastDays = [];
  for (let i = 29; i >= 0; i--) lastDays.push(israelDay(now - i * 864e5));
  const out = {
    generatedAt: now,
    visitors: { total: docs.length, today: 0, last7: 0, last30: 0, newToday: 0, mobile: 0, desktop: 0 },
    daily: lastDays.map((d) => ({ day: d, visitors: 0 })),
    pages: {},
    sky: { players: 0, levels: Array.from({ length: 10 }, (_, i) => ({ level: i + 1, players: 0 })), groups: 0, perfect: 0, top: [], reached1000: 0 },
    game: { players: 0, levels: {}, chapterTitles: {}, finishedAny: 0 },
    globe: { visitors: 0, entries: 0, rooms: {} },
    unlocks: {},
    recent: []
  };
  const dayIndex = Object.fromEntries(lastDays.map((d, i) => [d, i]));
  for (const d of docs) {
    const v = out.visitors;
    if ((d.days || []).includes(today)) v.today++;
    if (now - d.last < 7 * 864e5) v.last7++;
    if (now - d.last < 30 * 864e5) v.last30++;
    if (israelDay(d.first) === today) v.newToday++;
    if (d.device === "mobile") v.mobile++; else if (d.device === "desktop") v.desktop++;
    (d.days || []).forEach((day) => { if (day in dayIndex) out.daily[dayIndex[day]].visitors++; });
    for (const [p, n] of Object.entries(d.views || {})) {
      out.pages[p] = out.pages[p] || { views: 0, visitors: 0 };
      out.pages[p].views += n; out.pages[p].visitors++;
    }
    const sky = d.sky || {};
    if (sky.groups) {
      out.sky.players++;
      out.sky.groups += sky.groups; out.sky.perfect += sky.perfect || 0;
      const lvl = Math.min(10, Math.max(1, sky.lvl || 1));
      out.sky.levels[lvl - 1].players++;
      if (sky.score >= 1000) out.sky.reached1000++;
      out.sky.top.push({ id: d.id.slice(0, 6), score: sky.score, groups: sky.groups, perfect: sky.perfect || 0 });
    }
    const g = d.game || {};
    const started = Object.keys(g.started || {});
    if (started.length) {
      out.game.players++;
      if (g.maxDone) out.game.finishedAny++;
      started.forEach((n) => {
        const L = (out.game.levels[n] = out.game.levels[n] || { started: 0, done: 0, scoreSum: 0, plays: 0 });
        L.started++;
      });
      Object.entries(g.done || {}).forEach(([n, x]) => {
        const L = (out.game.levels[n] = out.game.levels[n] || { started: 0, done: 0, scoreSum: 0, plays: 0 });
        L.done++; L.scoreSum += x.best || 0; L.plays += x.plays || 0;
      });
      Object.assign(out.game.chapterTitles, g.chapterTitles || {});
    }
    const gl = d.globe || {};
    if (gl.entries) {
      out.globe.visitors++; out.globe.entries += gl.entries;
      Object.entries(gl.rooms || {}).forEach(([r, n]) => { out.globe.rooms[r] = (out.globe.rooms[r] || 0) + n; });
    }
    Object.entries(d.unlocks || {}).forEach(([sec, n]) => { out.unlocks[sec] = (out.unlocks[sec] || 0) + 1; });
  }
  out.sky.top = out.sky.top.sort((a, b) => b.score - a.score).slice(0, 10);
  Object.values(out.game.levels).forEach((L) => { L.avgScore = L.done ? Math.round(L.scoreSum / L.done) : null; delete L.scoreSum; });
  out.globe.rooms = Object.entries(out.globe.rooms).sort((a, b) => b[1] - a[1]).slice(0, 20).map(([room, n]) => ({ room, n }));
  out.recent = docs.sort((a, b) => b.last - a.last).slice(0, 60).map((d) => ({
    id: d.id.slice(0, 6), first: d.first, last: d.last, device: d.device || "", days: (d.days || []).length,
    views: d.views || {}, skyScore: (d.sky || {}).score || 0, skyLevel: (d.sky || {}).lvl || 1,
    gameMaxStarted: (d.game || {}).maxStarted || 0, gameMaxDone: (d.game || {}).maxDone || 0,
    globeRooms: Object.keys((d.globe || {}).rooms || {}).length
  }));
  return out;
}

/* ---------------- router ---------------- */
export default async (req, context) => {
  const url = new URL(req.url);
  const route = url.pathname.replace(/^\/api\/admin\/?/, "");
  const method = req.method;

  if (route === "login" && method === "POST") {
    const pw = adminPassword();
    if (!pw) return json({ error: "nopassword" }, 503);
    const ip = (context && context.ip) || "x", now = Date.now();
    const list = (failed.get(ip) || []).filter((t) => now - t < 15 * 60e3);
    if (list.length >= 8) return json({ error: "יותר מדי ניסיונות. נסה שוב בעוד רבע שעה." }, 429);
    let body = {};
    try { body = await req.json(); } catch (e) {}
    if (!safeEqual(await sha256(String(body.password || "")), await sha256(pw))) {
      list.push(now); failed.set(ip, list);
      await sleep(800);
      return json({ error: "הסיסמה לא נכונה." }, 403);
    }
    return json({ ok: true }, 200, { "set-cookie": await adminCookie() });
  }
  if (route === "logout") return json({ ok: true }, 200, { "set-cookie": cookie("ofek_admin", "", 0) });
  if (route === "me") return json({ admin: await isAdmin(req), passwordSet: !!adminPassword() });

  if (!(await isAdmin(req))) return json({ error: "צריך להיכנס מחדש." }, 401);

  if (route === "config" && method === "GET") {
    const cfg = await loadConfig();
    const codesSet = {};
    SECTIONS.forEach((sec) => { codesSet[sec] = !!cfg.private.codes[sec]; });
    return json({ public: cfg.public, codesSet });
  }

  if (route === "config" && method === "PUT") {
    let body = {};
    try { body = await req.json(); } catch (e) { return json({ error: "bad" }, 400); }
    const cfg = await loadConfig();
    cfg.public = cleanPublic(body.public || {}, cfg.public);
    const codes = body.codes || {};
    for (const sec of SECTIONS) {
      if (codes[sec] === null) delete cfg.private.codes[sec];
      else if (typeof codes[sec] === "string" && codes[sec].trim()) {
        const salt = randomHex(8);
        cfg.private.codes[sec] = { salt, hash: await hashCode(codes[sec], salt) };
      }
      if (cfg.public.sections[sec].mode === "locked" && !cfg.private.codes[sec]) {
        return json({ error: "כדי לנעול את " + ({ book: "הספר", game: "המשחק", globe: "המבנה" })[sec] + " צריך לקבוע לו קוד גישה." }, 400);
      }
    }
    await saveConfig(cfg);
    await refreshPublicCache();
    const codesSet = {};
    SECTIONS.forEach((sec) => { codesSet[sec] = !!cfg.private.codes[sec]; });
    return json({ ok: true, public: cfg.public, codesSet });
  }

  if (route === "font" && method === "POST") {
    const family = s(url.searchParams.get("family"), 60).replace(/["<>;{}]/g, "").trim();
    const ext = s(url.searchParams.get("ext"), 6).toLowerCase();
    const weight = Math.max(100, Math.min(900, parseInt(url.searchParams.get("weight"), 10) || 400));
    const style = url.searchParams.get("style") === "italic" ? "italic" : "normal";
    if (!family) return json({ error: "חסר שם לפונט." }, 400);
    if (!FONT_EXT.includes(ext)) return json({ error: "אפשר להעלות רק קבצי woff2, woff, ttf או otf." }, 400);
    const data = await req.arrayBuffer();
    if (!data.byteLength) return json({ error: "הקובץ ריק." }, 400);
    if (data.byteLength > MAX_FONT) return json({ error: "הקובץ גדול מ־4MB." }, 400);
    const id = (family.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "font") + "-" + weight + "-" + randomHex(4);
    await fontStore().set(id, data, { metadata: { ext, family, weight, style, size: data.byteLength } });
    const cfg = await loadConfig();
    cfg.public.customFonts = (cfg.public.customFonts || []).filter((f) => !(f.family === family && f.weight === weight && f.style === style));
    cfg.public.customFonts.push({ id, family, weight, style, format: FONT_FORMAT[ext], size: data.byteLength });
    await saveConfig(cfg);
    await refreshPublicCache();
    return json({ ok: true, public: cfg.public });
  }

  if (route === "font" && method === "DELETE") {
    const id = s(url.searchParams.get("id"), 90);
    const cfg = await loadConfig();
    const f = (cfg.public.customFonts || []).find((x) => x.id === id);
    if (!f) return json({ error: "הפונט לא נמצא." }, 404);
    cfg.public.customFonts = cfg.public.customFonts.filter((x) => x.id !== id);
    if (!cfg.public.customFonts.some((x) => x.family === f.family)) {
      for (const role of ["display", "body"]) if (cfg.public.fonts[role] && cfg.public.fonts[role].family === f.family && cfg.public.fonts[role].kind === "custom") delete cfg.public.fonts[role];
    }
    await saveConfig(cfg);
    await fontStore().delete(id);
    await refreshPublicCache();
    return json({ ok: true, public: cfg.public });
  }

  if (route === "stats" && method === "GET") return json(await stats());

  // forget this admin's own device (called when the admin logs in)
  if (route === "visitor" && method === "DELETE") {
    const vid = s(url.searchParams.get("vid"), 40);
    if (/^[a-z0-9]{12,40}$/.test(vid)) await visitorStore().delete(vid);
    return json({ ok: true });
  }

  // wipe all stats and start counting from now
  if (route === "stats-reset" && method === "POST") {
    const store = visitorStore();
    let n = 0;
    for await (const page of store.list({ paginate: true })) {
      for (const b of page.blobs) { await store.delete(b.key); n++; }
    }
    return json({ ok: true, deleted: n });
  }

  return json({ error: "not found" }, 404);
};
export const config = { path: "/api/admin/*" };
