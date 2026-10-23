// Reads the chapters of "אופק אפס" from the series page on prog.co.il, plus the cover image and the
// summary at the top of each article. Only articles not seen before are opened, so a refresh is light.
import { siteStore } from "./common.mjs";

export const SERIES_URL = "https://www.prog.co.il/articles/series/%D7%90%D7%95%D7%A4%D7%A7-%D7%90%D7%A4%D7%A1.28/";
const ORIGIN = "https://www.prog.co.il";
const HEADERS = {
  "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36",
  "accept": "text/html,application/xhtml+xml",
  "accept-language": "he-IL,he;q=0.9,en;q=0.6"
};

const ENT = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", "#39": "'" };
export function decode(s) {
  return String(s || "")
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d))
    .replace(/&([a-z#0-9]+);/gi, (m, n) => (n in ENT ? ENT[n] : m));
}
export function text(html) {
  return decode(String(html || "").replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, ""))
    .replace(/[ \t]+/g, " ").replace(/\n[ \t]+/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

async function get(url) {
  const r = await fetch(url, { headers: HEADERS, redirect: "follow" });
  if (!r.ok) throw new Error("פרוג החזיר " + r.status);
  const t = await r.text();
  if (!/structItem|articleBody|bbWrapper/.test(t)) throw new Error("פרוג חסם את הבקשה (בדיקת רובוטים)");
  return t;
}

// "אופק אפס - פרק 4 - הסימון" -> {num:"4", title:"הסימון"}; "אופק אפס - פרק מבוא" -> {num:"0", title:"פרק מבוא"}
export function splitTitle(full) {
  const parts = String(full).split(/\s+[-–]\s+/).map((x) => x.trim()).filter(Boolean);
  const rest = parts.slice(1);
  let num = "", title = rest.join(" - ") || full;
  const m = rest.length && rest[0].match(/^פרק\s+(\d+)$/);
  if (m) { num = m[1]; title = rest.slice(1).join(" - ") || rest[0]; }
  else if (rest.length && /^פרק\s+מבוא/.test(rest[0])) { num = "0"; title = rest.join(" - "); }
  return { num, title };
}

export function hebrewDate(ts) {
  try {
    return new Date(ts).toLocaleDateString("he-IL-u-ca-hebrew", { timeZone: "Asia/Jerusalem", day: "numeric", month: "long", year: "numeric" });
  } catch (e) { return ""; }
}
const shortDate = (ts) => new Date(ts).toLocaleDateString("he-IL", { timeZone: "Asia/Jerusalem", day: "numeric", month: "numeric", year: "2-digit" });

function parseSeries(html) {
  const items = [];
  const re = /js-articleListItem-(\d+)"[\s\S]*?(?=js-articleListItem-\d+"|<\/main>|$)/g;
  let m;
  while ((m = re.exec(html))) {
    const block = m[0], id = m[1];
    const a = block.match(/structItem-title">[\s\S]*?<a href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/);
    if (!a) continue;
    const img = block.match(/amsThumbnail-image'?"?\s+src=['"]([^'"]+)['"]/) || block.match(/class=['"]amsThumbnail-image['"][^>]*src=['"]([^'"]+)['"]/);
    const time = block.match(/datetime="([^"]+)"/);
    const desc = block.match(/structItem-articleDescription">([\s\S]*?)<\/div>/);
    items.push({
      id, url: ORIGIN + decode(a[1]).replace(/^https?:\/\/[^/]+/, ""), full: text(a[2]),
      image: img ? decode(img[1]) : "", at: time ? Date.parse(time[1].replace(/([+-]\d\d)(\d\d)$/, "$1:$2")) : 0,
      snippet: desc ? text(desc[1]).replace(/^שוב תודה[^\n]*\n*/, "").replace(/^\(?תודה רבה[^\n]*\n*/, "").slice(0, 400) : ""
    });
  }
  return items;
}

function parseArticle(html) {
  const out = {};
  const ld = html.match(/"thumbnailUrl":\s*"([^"]+)"/);
  if (ld) out.image = JSON.parse('"' + ld[1] + '"');
  const body = html.indexOf('class="bbWrapper"');
  if (body >= 0) {
    const start = html.slice(body, body + 6000);
    const q = start.match(/<blockquote[\s\S]*?js-expandContent[^>]*>([\s\S]*?)<\/div>/);
    if (q && start.indexOf("<blockquote") < 1500) {
      let raw = q[1];
      const head = raw.match(/^\s*<b>([\s\S]*?)<\/b>\s*(<br\s*\/?>)?/);
      if (head) { out.summaryLabel = text(head[1]).replace(/:\s*$/, ""); raw = raw.slice(head[0].length); }
      out.summary = text(raw).slice(0, 2000);
    }
  }
  return out;
}

export async function syncProg({ force = false } = {}) {
  const store = siteStore();
  const prev = (await store.get("prog", { type: "json" })) || { items: [] };
  const known = new Map(prev.items.map((x) => [x.id, x]));
  const html = await get(SERIES_URL);
  const list = parseSeries(html);
  if (!list.length) throw new Error("לא נמצאו פרקים בדף הסדרה");
  const items = [];
  for (const it of list) {
    const old = known.get(it.id);
    let extra = old ? { image: old.image, summary: old.summary, summaryLabel: old.summaryLabel } : null;
    if (!extra || force) {
      try { extra = parseArticle(await get(it.url)); } catch (e) { extra = extra || {}; }
    }
    const { num, title } = splitTitle(it.full);
    items.push({
      id: it.id, num, title, full: it.full, url: it.url, at: it.at,
      date: it.at ? shortDate(it.at) : "", heDate: it.at ? hebrewDate(it.at) : "",
      image: extra.image || it.image || "", summary: extra.summary || "", summaryLabel: extra.summaryLabel || "",
      snippet: it.snippet
    });
  }
  items.sort((a, b) => (a.at || 0) - (b.at || 0));
  const added = items.filter((x) => !known.has(x.id)).length;
  const data = { items, syncedAt: Date.now(), added };
  await store.setJSON("prog", data);
  return data;
}

export async function loadProg() {
  return (await siteStore().get("prog", { type: "json" })) || null;
}
