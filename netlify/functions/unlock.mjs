// A visitor enters an access code for a locked section.
import { loadConfig, hashCode, unlockToken, cookie, json, sleep, safeEqual, SECTIONS } from "../lib/common.mjs";

const tries = new Map(); // per warm instance: ip -> [timestamps]

export default async (req, context) => {
  if (req.method !== "POST") return json({ error: "method" }, 405);
  const ip = (context && context.ip) || "x";
  const now = Date.now();
  const list = (tries.get(ip) || []).filter((t) => now - t < 10 * 60e3);
  if (list.length >= 12) return json({ error: "יותר מדי ניסיונות. נסו שוב בעוד כמה דקות." }, 429);
  let body = {};
  try { body = await req.json(); } catch (e) {}
  const section = body.section, code = String(body.code || "").slice(0, 100);
  if (!SECTIONS.includes(section) || !code) return json({ error: "חסר קוד." }, 400);
  const cfg = await loadConfig();
  const mode = cfg.public.sections[section].mode;
  const stored = cfg.private.codes[section];
  if (mode !== "locked" || !stored) return json({ ok: true });
  const h = await hashCode(code, stored.salt);
  if (!safeEqual(h, stored.hash)) {
    list.push(now); tries.set(ip, list);
    await sleep(700);
    return json({ error: "הקוד לא נכון. נסו שוב." }, 403);
  }
  return json({ ok: true }, 200, { "set-cookie": cookie("ofek_u_" + section, await unlockToken(section, stored.hash), 60 * 86400) });
};
export const config = { path: "/api/unlock" };
