// Anonymous usage stats. Each browser has a random id; nothing personal is stored.
import { visitorStore, json, israelDay, isAdmin } from "../lib/common.mjs";

const BOT_RE = /bot|crawl|spider|slurp|headless|lighthouse|pagespeed|preview|screenshot|puppeteer|playwright|selenium|phantom|prerender|facebookexternalhit|whatsapp|telegram|discord|skype|embedly|bing|yandex|baidu|duckduck|semrush|ahrefs|mj12|petal|gptbot|claude|anthropic|chatgpt|perplexity|netlify/i;

const PAGES = ["home", "book", "game", "globe", "site"];
const num = (v, max = 1e6) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.max(0, Math.min(max, n)) : 0;
};
const str = (v, max = 60) => String(v == null ? "" : v).slice(0, max);

function emptyDoc(now) {
  return {
    first: now, last: now, device: "", hits: 0,
    views: {}, days: [],
    sky: { score: 0, lvl: 1, groups: 0, perfect: 0, misses: 0 },
    game: { started: {}, done: {}, maxDone: 0, maxStarted: 0 },
    globe: { rooms: {}, entries: 0 },
    unlocks: {}
  };
}

export default async (req) => {
  if (req.method !== "POST") return json({ error: "method" }, 405);
  // robots and the site's admin are not counted
  if (BOT_RE.test(req.headers.get("user-agent") || "")) return json({ ok: true, skipped: "bot" });
  if (await isAdmin(req)) return json({ ok: true, skipped: "admin" });
  let body;
  try { body = JSON.parse((await req.text()).slice(0, 20000)); } catch (e) { return json({ error: "bad" }, 400); }
  const vid = String(body.vid || "");
  if (!/^[a-z0-9]{12,40}$/.test(vid)) return json({ error: "bad" }, 400);
  const events = Array.isArray(body.events) ? body.events.slice(0, 50) : [];
  if (!events.length) return json({ ok: true });

  const store = visitorStore();
  const now = Date.now();
  const doc = Object.assign(emptyDoc(now), (await store.get(vid, { type: "json" })) || {});
  doc.last = now;
  if (body.device === "mobile" || body.device === "desktop") doc.device = body.device;
  const day = israelDay(now);
  if (!doc.days.includes(day)) { doc.days.push(day); if (doc.days.length > 120) doc.days = doc.days.slice(-120); }

  for (const e of events) {
    if (!e || typeof e !== "object") continue;
    doc.hits++;
    switch (e.t) {
      case "view": {
        const p = PAGES.includes(e.page) ? e.page : "site";
        doc.views[p] = (doc.views[p] || 0) + 1;
        break;
      }
      case "sky": {
        doc.sky.groups++;
        doc.sky.misses += num(e.misses, 1000);
        if (num(e.misses) === 0) doc.sky.perfect++;
        doc.sky.score = Math.max(doc.sky.score, num(e.score, 1e6));
        doc.sky.lvl = Math.max(doc.sky.lvl, Math.floor(doc.sky.score / 100) + 1);
        if (e.group) doc.sky.groupsSeen = Object.assign(doc.sky.groupsSeen || {}, { [str(e.group, 16)]: ((doc.sky.groupsSeen || {})[str(e.group, 16)] || 0) + 1 });
        break;
      }
      case "game-start": {
        const n = num(e.level, 1000);
        if (!n) break;
        doc.game.started[n] = (doc.game.started[n] || 0) + 1;
        doc.game.maxStarted = Math.max(doc.game.maxStarted, n);
        doc.game.chapter = Math.max(doc.game.chapter || 0, num(e.chapter, 100));
        if (e.title) doc.game.chapterTitles = Object.assign(doc.game.chapterTitles || {}, { [num(e.chapter, 100)]: str(e.title) });
        break;
      }
      case "game-done": {
        const n = num(e.level, 1000);
        if (!n) break;
        const prev = doc.game.done[n] || { best: 0, plays: 0 };
        prev.plays++;
        prev.best = Math.max(prev.best, num(e.score, 1000));
        prev.mistakes = num(e.mistakes, 1000);
        prev.hints = num(e.hints, 100);
        doc.game.done[n] = prev;
        doc.game.maxDone = Math.max(doc.game.maxDone, n);
        break;
      }
      case "globe-room": {
        const r = str(e.room, 40);
        if (!r) break;
        doc.globe.entries++;
        doc.globe.rooms[r] = (doc.globe.rooms[r] || 0) + 1;
        break;
      }
      case "unlock": {
        const s = str(e.section, 10);
        doc.unlocks[s] = (doc.unlocks[s] || 0) + 1;
        break;
      }
    }
  }
  await store.setJSON(vid, doc);
  return json({ ok: true });
};
export const config = { path: "/api/track" };
