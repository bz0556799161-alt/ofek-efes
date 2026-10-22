// Keeps hidden / coming-soon / code-locked sections closed, even for direct links.
const PATHS = {
  book: ["/book", "/book/", "/book/index.html"],
  game: ["/game/play", "/game/play/", "/game/play/index.html"],
  globe: ["/globe/tour", "/globe/tour/", "/globe/tour/index.html"]
};
const BACK = { book: "/", game: "/game/", globe: "/globe/" };

export default async (req, context) => {
  const url = new URL(req.url);
  const section = Object.keys(PATHS).find((s) => PATHS[s].includes(url.pathname));
  if (!section) return context.next();
  try {
    const r = await fetch(new URL("/api/access?section=" + section, url), {
      headers: { cookie: req.headers.get("cookie") || "" }
    });
    if (r.status === 200) return context.next();
    if (r.status !== 403) return context.next(); // if the check itself fails, don't lock people out
  } catch (e) {
    return context.next();
  }
  return Response.redirect(new URL(BACK[section] + "?blocked=1", url), 302);
};

export const config = { path: Object.values(PATHS).flat() };
