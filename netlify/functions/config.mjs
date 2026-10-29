// Public site settings (texts, fonts, which sections are open). Cached briefly at Netlify's CDN.
import { loadConfig, json, publicGame } from "../lib/common.mjs";

export default async () => {
  const cfg = await loadConfig();
  return json(Object.assign({}, cfg.public, { game: publicGame(cfg.public.game) }), 200, {   // never the code hashes
    "cache-control": "public, max-age=0, must-revalidate",
    "netlify-cdn-cache-control": "public, durable, s-maxage=30, stale-while-revalidate=120",
    "netlify-cache-tag": "config"
  });
};
export const config = { path: "/api/config" };
