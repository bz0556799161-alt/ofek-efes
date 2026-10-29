// A player types an access code of כבוש את השמים: checked here, on the server; a right code is kept in a signed cookie.
import { loadConfig, gameSettings, gameCodeHash, normGameCode, readGameGrant, gameGrantCookie, json, sleep, safeEqual } from "../lib/common.mjs";

const tries = new Map(); // per warm instance: ip -> [timestamps]

export default async (req, context) => {
  if (req.method !== "POST") return json({ error: "method" }, 405);
  const ip = (context && context.ip) || "x";
  const now = Date.now();
  const list = (tries.get(ip) || []).filter((t) => now - t < 10 * 60e3);
  if (list.length >= 10) return json({ error: "יותר מדי ניסיונות. נסה שוב בעוד כמה דקות." }, 429);
  let body = {};
  try { body = await req.json(); } catch (e) {}
  const code = normGameCode(String(body.code || "").slice(0, 40));
  if (!code) return json({ error: "הקלד את הקוד שקיבלת." }, 400);
  const cfg = await loadConfig();
  const g = await gameSettings(cfg, req);
  const h = gameCodeHash(code);
  const entry = (g.codes || []).find((e) => safeEqual(e.h, h));
  if (!entry) {
    list.push(now); tries.set(ip, list);
    await sleep(700);
    return json({ error: "הקוד לא נכון. בדוק שהקלדת אותו בדיוק כמו שקיבלת." }, 403);
  }
  const valid = new Set((g.codes || []).map((e) => e.h));
  const had = (await readGameGrant(req)).filter((x) => valid.has(x));
  return json({ ok: true, ch: entry.ch || [], free: !!entry.free }, 200, { "set-cookie": await gameGrantCookie([...had, h]) });
};
export const config = { path: "/api/game-code" };
