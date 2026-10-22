// Checks whether this visitor may open a section (used by the edge gate).
import { loadConfig, canAccess, json, SECTIONS } from "../lib/common.mjs";

export default async (req) => {
  const section = new URL(req.url).searchParams.get("section");
  if (!SECTIONS.includes(section)) return json({ ok: false }, 400);
  const cfg = await loadConfig();
  const ok = await canAccess(req, cfg, section);
  return json({ ok, mode: cfg.public.sections[section].mode }, ok ? 200 : 403);
};
export const config = { path: "/api/access" };
