// Settings the game and the structure need before they start, as a small script.
import { loadConfig, publicGame } from "../lib/common.mjs";

export default async () => {
  const cfg = await loadConfig();
  const game = publicGame(cfg.public.game || null);   // never the code hashes
  const globe = cfg.public.globe || { open: [] };
  const js = "window.OFEK_GAME = " + JSON.stringify(game).replace(/</g, "\\u003c") + ";\n" +
    "window.ROOM_ACCESS = " + JSON.stringify({ open: globe.open || [], updatedAt: cfg.public.updatedAt || 0 }).replace(/</g, "\\u003c") + ";\n";
  return new Response(js, {
    headers: {
      "content-type": "text/javascript; charset=utf-8",
      "cache-control": "public, max-age=0, must-revalidate",
      "netlify-cdn-cache-control": "public, durable, s-maxage=30, stale-while-revalidate=120",
      "netlify-cache-tag": "config"
    }
  });
};
export const config = { path: "/api/state.js" };
