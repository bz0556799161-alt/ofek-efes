// Which chapters of כבוש את השמים this visitor may open (used by the edge gate to leave the others out of the page).
import { loadConfig, gameAccess, json } from "../lib/common.mjs";

export default async (req) => {
  const cfg = await loadConfig();
  return json(await gameAccess(req, cfg));
};
export const config = { path: "/api/game-access" };
