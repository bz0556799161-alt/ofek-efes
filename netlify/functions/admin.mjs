// Admin API: login, settings, fonts and stats. Every route except login needs the admin cookie.
import { purgeCache } from "@netlify/functions";
import {
  loadConfig, saveConfig, isAdmin, adminCookie, adminPassword, cookie, json, sleep, safeEqual,
  sha256, randomHex, hashCode, staffOf, loadEditors, saveEditors, hashPassword, editorCookie, visitorStore, fontStore, messageStore, israelDay, SECTIONS, MODES
} from "../lib/common.mjs";
import { syncProg, loadProg, importProg } from "../lib/prog.mjs";

const FONT_EXT = ["woff2", "woff", "ttf", "otf"];
const FONT_FORMAT = { woff2: "woff2", woff: "woff", ttf: "truetype", otf: "opentype" };
const MAX_FONT = 4 * 1024 * 1024;
const failed = new Map();
const asked = new Map();   // ip -> times an editor request was sent (per warm instance)
const env = (k) => (globalThis.Netlify && Netlify.env && Netlify.env.get(k)) || process.env[k] || "";
const escH = (t) => String(t).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
// the parts of the admin only the owner sees
const OWNER_ONLY = ["stats", "visitor", "stats-reset", "messages", "texts", "font", "editors"];

// tells the owner by email that someone asked to become an editor (only when the email key is set)
async function tellOwner(ed) {
  const key = env("RESEND_API_KEY");
  if (!key) return;
  const rows = [["שם", ed.name], ["מייל", ed.email], ["טלפון", ed.phone], ["הערה", ed.note]].filter((r) => r[1]);
  const html = '<div dir="rtl" style="font-family:Arial,sans-serif;font-size:15px;line-height:1.6;color:#1b1b1b">' +
    '<h2 style="margin:0 0 12px">בקשה חדשה להרשאת עריכה באתר אופק אפס</h2>' +
    rows.map((r) => "<p style=\"margin:0\"><b>" + r[0] + ":</b> " + escH(r[1]) + "</p>").join("") +
    '<p style="margin-top:16px">מאשרים או דוחים בניהול האתר, בלשונית עורכים: <a href="https://ofek-efes.netlify.app/admin/#editors">ofek-efes.netlify.app/admin</a></p></div>';
  try {
    await fetch("https://api.resend.com/emails", {
      method: "POST", headers: { authorization: "Bearer " + key, "content-type": "application/json" },
      body: JSON.stringify({ from: env("CONTACT_FROM") || "אופק אפס <onboarding@resend.dev>", to: [env("CONTACT_TO") || "bz0556799161@gmail.com"],
        subject: "בקשת הרשאת עריכה: " + ed.name, html })
    });
  } catch (e) {}
}
const publicEditor = (e) => ({ id: e.id, name: e.name, email: e.email, phone: e.phone || "", note: e.note || "", status: e.status,
  askedAt: e.askedAt, approvedAt: e.approvedAt || 0, lastLogin: e.lastLogin || 0 });

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
  if ("game" in input) out.game = cleanGame(input.game);
  if (input.chapterEdits && typeof input.chapterEdits === "object") {
    const ce = {};
    Object.entries(input.chapterEdits).slice(0, 500).forEach(([id, e]) => {
      if (!/^\d{1,9}$/.test(id) || !e) return;
      const x = {};
      if (e.hidden) x.hidden = true;
      if (e.title) x.title = s(e.title, 200);
      if (e.summary) x.summary = s(e.summary, 2000);
      if (Object.keys(x).length) ce[id] = x;
    });
    out.chapterEdits = ce;
  }
  if ("globe" in input) out.globe = input.globe && Array.isArray(input.globe.open)
    ? { open: [...new Set(input.globe.open.map((x) => s(x, 12)).filter((x) => /^[A-Za-z0-9]{2,12}$/.test(x)))].slice(0, 120) }
    : null;
  return out;
}
function cleanStyle(v) {
  if (!v || typeof v !== "object") return null;
  const o = {};
  if (v.b === 1 || v.b === 0) o.b = v.b;
  if (v.i === 1) o.i = 1;
  if (v.u === 1) o.u = 1;
  if (Number.isFinite(+v.s) && +v.s !== 1) o.s = Math.max(0.5, Math.min(3, Math.round(+v.s * 100) / 100));
  if (typeof v.c === "string" && /^#[0-9a-f]{6}$/i.test(v.c)) o.c = v.c;
  if (v.f === "display" || v.f === "body") o.f = v.f;
  if (["right", "center", "left"].includes(v.a)) o.a = v.a;
  return Object.keys(o).length ? o : null;
}
const KEY_RE = /^[a-z0-9]{2,20}$/;
function cleanGame(g) {
  if (!g || typeof g !== "object") return null;
  const keys = (arr) => [...new Set((Array.isArray(arr) ? arr : []).map((k) => s(k, 20)).filter((k) => k === "*" || KEY_RE.test(k)))].slice(0, 80);
  return {
    open: keys(g.open),
    schedule: (Array.isArray(g.schedule) ? g.schedule : []).slice(0, 100)
      .filter((e) => e && KEY_RE.test(String(e.key)) && Number.isFinite(+e.at))
      .map((e) => ({ key: s(e.key, 20), at: Math.round(+e.at) })),
    codes: (Array.isArray(g.codes) ? g.codes : []).slice(0, 100)
      .filter((e) => e && /^[0-9a-f]{16}$/.test(String(e.h)))
      .map((e) => ({ h: String(e.h), name: s(e.name, 40), ch: keys(e.ch), free: !!e.free }))
  };
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
    sky: { players: 0, levels: Array.from({ length: Math.max(10, ...docs.map((d) => (d.sky && d.sky.lvl) || 1)) }, (_, i) => ({ level: i + 1, players: 0 })), groups: 0, perfect: 0, top: [], reached1000: 0 },
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
      const lvl = Math.max(1, sky.lvl || 1);
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
  if (route === "logout") {
    const h = new Headers({ "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
    h.append("set-cookie", cookie("ofek_admin", "", 0)); h.append("set-cookie", cookie("ofek_ed", "", 0));
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: h });
  }
  if (route === "me") {
    const who = await staffOf(req);
    return json({ admin: !!who && who.role === "owner", staff: !!who, role: who ? who.role : null, name: who && who.name || "", passwordSet: !!adminPassword() });
  }

  // an editor signs in with their email and their own password
  if (route === "editor-login" && method === "POST") {
    const ip = (context && context.ip) || "x", now = Date.now();
    const list = (failed.get(ip) || []).filter((t) => now - t < 15 * 60e3);
    if (list.length >= 8) return json({ error: "יותר מדי ניסיונות. נסה שוב בעוד רבע שעה." }, 429);
    let body = {};
    try { body = await req.json(); } catch (e) {}
    const email = s(body.email, 120).trim().toLowerCase();
    const data = await loadEditors();
    const ed = data.list.find((x) => x.email === email);
    const ok = ed && safeEqual(await hashPassword(s(body.password, 200), ed.salt), ed.hash);
    if (!ok) { list.push(now); failed.set(ip, list); await sleep(800); return json({ error: "המייל או הסיסמה לא נכונים." }, 403); }
    if (ed.status === "pending") return json({ error: "הבקשה שלך עוד ממתינה לאישור של מנהל האתר." }, 403);
    if (ed.status !== "active") return json({ error: "אין לך כרגע הרשאת עריכה." }, 403);
    ed.lastLogin = now;
    await saveEditors(data);
    return json({ ok: true }, 200, { "set-cookie": await editorCookie(ed) });
  }

  // someone asks to become an editor: their details are kept, waiting for the owner
  if (route === "editor-request" && method === "POST") {
    const ip = (context && context.ip) || "x", now = Date.now();
    const times = (asked.get(ip) || []).filter((t) => now - t < 60 * 60e3);
    if (times.length >= 5) return json({ error: "נשלחו כבר כמה בקשות. נסה שוב בעוד שעה." }, 429);
    let b = {};
    try { b = await req.json(); } catch (e) { return json({ error: "השליחה לא הצליחה." }, 400); }
    if (b.website) return json({ ok: true });
    const name = s(b.name, 60).trim(), email = s(b.email, 120).trim().toLowerCase(), phone = s(b.phone, 30).trim(), note = s(b.note, 300).trim();
    const pw = s(b.password, 200);
    if (name.length < 2) return json({ error: "חסר שם." }, 400);
    if (!EMAIL_RE.test(email)) return json({ error: "כתובת המייל לא תקינה." }, 400);
    if (phone && !/^[0-9+\-\s()]{7,20}$/.test(phone)) return json({ error: "מספר הטלפון לא תקין." }, 400);
    if (pw.length < 8) return json({ error: "הסיסמה צריכה להיות באורך 8 תווים לפחות." }, 400);
    const data = await loadEditors();
    const old = data.list.find((x) => x.email === email);
    if (old && old.status === "active") return json({ error: "כבר יש עורך עם המייל הזה. אפשר פשוט להיכנס." }, 409);
    if (!old && data.list.filter((x) => x.status === "pending").length >= 50) return json({ error: "יש כרגע יותר מדי בקשות שממתינות. נסה שוב מאוחר יותר." }, 429);
    times.push(now); asked.set(ip, times);
    const salt = randomHex(16);
    const ed = Object.assign(old || { id: randomHex(8), askedAt: now }, { name, email, phone, note, salt, hash: await hashPassword(pw, salt), ver: randomHex(8), status: "pending", askedAt: now });
    if (!old) data.list.push(ed);
    await saveEditors(data);
    await tellOwner(ed);
    return json({ ok: true });
  }

  const who = await staffOf(req);
  if (!who) return json({ error: "צריך להיכנס מחדש." }, 401);
  if (who.role !== "owner" && OWNER_ONLY.includes(route)) return json({ error: "לחלק הזה נכנס רק מנהל האתר." }, 403);

  // the owner: who may edit
  if (route === "editors" && method === "GET") {
    const data = await loadEditors();
    return json({ list: data.list.map(publicEditor) });
  }
  if (route === "editors" && method === "POST") {
    let b = {};
    try { b = await req.json(); } catch (e) { return json({ error: "bad" }, 400); }
    const data = await loadEditors();
    const ed = data.list.find((x) => x.id === b.id);
    if (!ed) return json({ error: "העורך לא נמצא." }, 404);
    if (b.action === "approve") { ed.status = "active"; ed.approvedAt = Date.now(); }
    else if (b.action === "revoke") { ed.status = "revoked"; ed.ver = randomHex(8); }
    else if (b.action === "delete") data.list = data.list.filter((x) => x !== ed);
    else return json({ error: "bad" }, 400);
    await saveEditors(data);
    return json({ list: data.list.map(publicEditor) });
  }

  if (route === "config" && method === "GET") {
    const cfg = await loadConfig();
    const codesSet = {};
    SECTIONS.forEach((sec) => { codesSet[sec] = !!cfg.private.codes[sec]; });
    return json({ public: cfg.public, codesSet, gameCodesPlain: cfg.private.gameCodes || {} });
  }

  // texts edited directly on the site: merge, don't replace
  if (route === "texts" && method === "POST") {
    let body = {};
    try { body = await req.json(); } catch (e) { return json({ error: "bad" }, 400); }
    const cfg = await loadConfig();
    const t = Object.assign({}, cfg.public.texts || {});
    for (const [k, v] of Object.entries(body.set || {})) {
      if (/^[a-z0-9._-]{1,60}$/i.test(k) && typeof v === "string" && v.trim()) t[k] = v.slice(0, 3000);
    }
    for (const k of Array.isArray(body.reset) ? body.reset : []) delete t[k];
    if (body.resetAll === true) Object.keys(t).forEach((k) => delete t[k]);
    cfg.public.texts = t;
    const st = Object.assign({}, cfg.public.textStyles || {});
    for (const [k, v] of Object.entries(body.styles || {})) {
      if (!/^[a-z0-9._-]{1,60}$/i.test(k)) continue;
      const c = cleanStyle(v);
      if (c) st[k] = c; else delete st[k];
    }
    if (body.resetAll === true) Object.keys(st).forEach((k) => delete st[k]);
    cfg.public.textStyles = st;
    await saveConfig(cfg);
    await refreshPublicCache();
    return json({ ok: true, texts: t, textStyles: st });
  }

  // room locks set from inside the structure (pick from the map)
  if (route === "globe" && method === "POST") {
    let body = {};
    try { body = await req.json(); } catch (e) { return json({ error: "bad" }, 400); }
    const cfg = await loadConfig();
    cfg.public = cleanPublic({ globe: { open: body.open || [] } }, cfg.public);
    await saveConfig(cfg);
    await refreshPublicCache();
    return json({ ok: true, globe: cfg.public.globe });
  }

  if (route === "config" && method === "PUT") {
    let body = {};
    try { body = await req.json(); } catch (e) { return json({ error: "bad" }, 400); }
    const cfg = await loadConfig();
    if (who.role !== "owner" && body.public) ["texts", "fonts", "textStyles", "customFonts"].forEach((k) => delete body.public[k]);
    cfg.public = cleanPublic(body.public || {}, cfg.public);
    if (body.gameCodesPlain && typeof body.gameCodesPlain === "object") {
      const keep = new Set(((cfg.public.game || {}).codes || []).map((c) => c.h));
      const plain = Object.assign({}, cfg.private.gameCodes || {});
      for (const [h, code] of Object.entries(body.gameCodesPlain)) if (/^[0-9a-f]{16}$/.test(h)) plain[h] = s(code, 20);
      for (const h of Object.keys(plain)) if (!keep.has(h)) delete plain[h];
      cfg.private.gameCodes = plain;
    }
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
    return json({ ok: true, public: cfg.public, codesSet, gameCodesPlain: cfg.private.gameCodes || {} });
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

  // messages sent through the contact page
  if (route === "messages" && method === "GET") {
    const store = messageStore(), keys = [];
    for await (const page of store.list({ paginate: true })) page.blobs.forEach((b) => keys.push(b.key));
    keys.sort().reverse();
    const items = (await Promise.all(keys.slice(0, 300).map((k) => store.get(k, { type: "json" }).catch(() => null)))).filter(Boolean);
    const env = (k) => (globalThis.Netlify && Netlify.env && Netlify.env.get(k)) || process.env[k] || "";
    return json({ items, total: keys.length, emailOn: !!env("RESEND_API_KEY") });
  }
  if (route === "messages" && (method === "PATCH" || method === "DELETE")) {
    const id = s(url.searchParams.get("id"), 40);
    if (!/^[0-9a-f-]{10,40}$/.test(id)) return json({ error: "bad" }, 400);
    const store = messageStore();
    if (method === "DELETE") { await store.delete(id); return json({ ok: true }); }
    const m = await store.get(id, { type: "json" });
    if (!m) return json({ error: "הפנייה לא נמצאה." }, 404);
    m.read = url.searchParams.get("read") !== "0";
    await store.setJSON(id, m);
    return json({ ok: true });
  }

  // the book's chapters from prog.co.il: read the stored list, or refresh it now
  if (route === "prog" && method === "GET") return json((await loadProg()) || { items: [], syncedAt: 0 });
  if (route === "prog-import" && method === "POST") {
    let body = {};
    try { body = JSON.parse((await req.text()).slice(0, 3e6)); } catch (e) { return json({ error: "bad" }, 400); }
    try {
      const data = await importProg(body.items);
      try { await purgeCache({ tags: ["chapters"] }); } catch (e) {}
      return json(data);
    } catch (e) { return json({ error: e.message }, 400); }
  }
  if (route === "prog" && method === "POST") {
    try {
      const data = await syncProg({ force: url.searchParams.get("force") === "1" });
      try { await purgeCache({ tags: ["chapters"] }); } catch (e) {}
      return json(data);
    } catch (e) {
      return json({ error: "לא הצלחתי לקרוא את פרוג: " + e.message }, 502);
    }
  }

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
