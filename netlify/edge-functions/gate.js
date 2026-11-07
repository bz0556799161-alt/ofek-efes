// Keeps hidden / coming-soon / code-locked sections closed, even for direct links.
// Content pages (the book, the game itself, the structure itself) open only when the section is open,
// unlocked by code, or for the admin. The explanation pages of the game and the structure stay
// reachable for "coming soon" and "locked", and disappear only when the section is hidden.
const CONTENT = {
  book: ["/book", "/book/", "/book/index.html"],
  game: ["/game/play", "/game/play/", "/game/play/index.html"],
  globe: ["/globe/tour", "/globe/tour/", "/globe/tour/index.html", "/globe/walk", "/globe/walk/", "/globe/walk/index.html"]
};
const INFO = {
  game: ["/game", "/game/", "/game/index.html"],
  globe: ["/globe", "/globe/", "/globe/index.html"]
};
const BACK = { book: "/", game: "/game/", globe: "/globe/" };

const find = (map, p) => Object.keys(map).find((s) => map[s].includes(p));

export default async (req, context) => {
  const url = new URL(req.url);
  const contentSec = find(CONTENT, url.pathname);
  const infoSec = contentSec ? null : find(INFO, url.pathname);
  const section = contentSec || infoSec;
  if (!section) return context.next();
  let res, data = {};
  try {
    res = await fetch(new URL("/api/access?section=" + section, url), { headers: { cookie: req.headers.get("cookie") || "" } });
    data = await res.json().catch(() => ({}));
  } catch (e) {
    // if the check itself fails, don't lock people out of the section (the game still leaves out its locked chapters)
    return pass(contentSec, req, url, context);
  }
  if (res.status === 200) return pass(contentSec, req, url, context);
  if (res.status !== 403) return pass(contentSec, req, url, context);
  if (infoSec) return data.mode === "hidden" ? Response.redirect(new URL("/?blocked=1", url), 302) : context.next();
  const back = data.mode === "hidden" ? "/" : BACK[section];
  return Response.redirect(new URL(back + "?blocked=1", url), 302);
};

function pass(sec, req, url, context) {
  if (sec === "game") return gameForVisitor(req, url, context);
  if (sec === "book") return bookWithChapters(req, url, context);
  return context.next();
}

// The book page arrives with the current chapter list already inside it, so it never shows an older list first.
async function bookWithChapters(req, url, context) {
  const h = new Headers(req.headers);
  h.delete("if-none-match"); h.delete("if-modified-since");
  const [res, ch] = await Promise.all([
    context.next(new Request(req.url, { method: "GET", headers: h })),
    fetch(new URL("/api/chapters", url)).then((r) => (r.ok ? r.json() : null)).catch(() => null)
  ]);
  if (res.status !== 200 || !ch || !Array.isArray(ch.items) || !ch.items.length) return res;
  const html = (await res.text()).replace("</head>",
    "<script>window.OFEK_CH=" + JSON.stringify(ch.items).replace(/</g, "\\u003c") + ";</script>\n</head>");
  const headers = new Headers(res.headers);
  ["content-length", "etag", "last-modified", "content-encoding"].forEach((k) => headers.delete(k));
  headers.set("cache-control", "public, max-age=0, must-revalidate");
  return new Response(html, { status: 200, headers });
}

// כבוש את השמים: the page is sent without the levels of every chapter this visitor may not open.
// In the game source each chapter's levels sit between the markers  /*@key*\/[ ... ]/*@end*\/  (its medium levels: /*@m:key*\/);
// a chapter that is not allowed becomes LOCKED_LV("key") (empty placeholders) and its medium levels [].
// The code hashes are removed too. So nothing typed in the browser's console can open a locked chapter: its levels are not in the page.
async function gameAccessFor(req, url) {
  for (let i = 0; i < 2; i++) {
    try {
      const r = await fetch(new URL("/api/game-access", url), { headers: { cookie: req.headers.get("cookie") || "" } });
      if (r.ok) return await r.json();
    } catch (e) {}
  }
  return null;  // unknown: every chapter stays out (safe side)
}
export function stripGame(html, ga) {
  if (!ga) {   // the check failed: only the chapters the page itself lists as open by default
    let open = [];
    try { open = JSON.parse((html.match(/\/\*LOCK_START\*\/(\[.*?\])\/\*LOCK_END\*\//) || [])[1] || "[]"); } catch (e) {}
    ga = { admin: false, all: false, open, keys: [], free: [] };
  }
  const allowAll = !!(ga.admin || ga.all);
  const allow = new Set([...(ga.open || []), ...(ga.keys || [])]);
  if (!allowAll) {
    html = html.replace(/\/\*@(m:)?([a-z0-9]+)\*\/\[[\s\S]*?\]\/\*@end\*\//g,
      (all, med, key) => (allow.has(key) ? all : med ? "[]" : 'LOCKED_LV("' + key + '")'));
  }
  html = html.replace(/\/\*CODES_START\*\/[\s\S]*?\/\*CODES_END\*\//, "/*CODES_START*/[]/*CODES_END*/");
  const grant = { keys: ga.admin ? [] : ga.all ? ["*"] : ga.keys || [], free: ga.admin ? [] : ga.free || [] };
  return html.replace('<script id="gameScript">',
    "<script>window.OFEK_GRANT=" + JSON.stringify(grant).replace(/</g, "\\u003c") + ";</script>\n<script id=\"gameScript\">");
}
async function gameForVisitor(req, url, context) {
  const h = new Headers(req.headers);
  h.delete("if-none-match"); h.delete("if-modified-since");   // always the full page, never "not modified"
  const [res, ga] = await Promise.all([context.next(new Request(req.url, { method: "GET", headers: h })), gameAccessFor(req, url)]);
  if (res.status !== 200) return res;
  const html = stripGame(await res.text(), ga);
  const headers = new Headers(res.headers);
  ["content-length", "etag", "last-modified", "content-encoding"].forEach((k) => headers.delete(k));
  headers.set("cache-control", "private, no-store");
  return new Response(html, { status: 200, headers });
}

export const config = { path: [...Object.values(CONTENT).flat(), ...Object.values(INFO).flat()] };
