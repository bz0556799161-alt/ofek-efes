// Public site settings (texts, fonts, which sections are open). Cached briefly at Netlify's CDN.
import { loadConfig, json } from "../lib/common.mjs";

export default async () => {
  const cfg = await loadConfig();
  return json(cfg.public, 200, {
    "cache-control": "public, max-age=0, must-revalidate",
    "netlify-cdn-cache-control": "public, durable, s-maxage=30, stale-while-revalidate=120",
    "netlify-cache-tag": "config"
  });
};
export const config = { path: "/api/config" };
