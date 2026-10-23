// Keeps hidden / coming-soon / code-locked sections closed, even for direct links.
// Content pages (the book, the game itself, the structure itself) open only when the section is open,
// unlocked by code, or for the admin. The explanation pages of the game and the structure stay
// reachable for "coming soon" and "locked", and disappear only when the section is hidden.
const CONTENT = {
  book: ["/book", "/book/", "/book/index.html"],
  game: ["/game/play", "/game/play/", "/game/play/index.html"],
  globe: ["/globe/tour", "/globe/tour/", "/globe/tour/index.html"]
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
    return context.next(); // if the check itself fails, don't lock people out
  }
  if (res.status === 200) return context.next();
  if (res.status !== 403) return context.next();
  if (infoSec) return data.mode === "hidden" ? Response.redirect(new URL("/?blocked=1", url), 302) : context.next();
  const back = data.mode === "hidden" ? "/" : BACK[section];
  return Response.redirect(new URL(back + "?blocked=1", url), 302);
};

export const config = { path: [...Object.values(CONTENT).flat(), ...Object.values(INFO).flat()] };
