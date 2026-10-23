// The book's chapters as read from prog.co.il, with the admin's edits applied. Used by the book page.
import { loadConfig, json } from "../lib/common.mjs";
import { loadProg } from "../lib/prog.mjs";

export default async () => {
  const [cfg, prog] = await Promise.all([loadConfig(), loadProg()]);
  const edits = cfg.public.chapterEdits || {};
  const items = prog ? prog.items.filter((c) => !(edits[c.id] && edits[c.id].hidden)).map((c) => {
    const e = edits[c.id] || {};
    return {
      id: c.id, num: c.num, title: e.title || c.title, url: c.url, date: c.date, heDate: c.heDate,
      image: c.image, summary: e.summary != null && e.summary !== "" ? e.summary : (c.summary || c.snippet || ""),
      summaryLabel: e.summary ? "" : (c.summary ? c.summaryLabel : "")
    };
  }) : null;
  return json({ items, syncedAt: prog ? prog.syncedAt : 0 }, 200, {
    "cache-control": "public, max-age=0, must-revalidate",
    "netlify-cdn-cache-control": "public, durable, s-maxage=60, stale-while-revalidate=600",
    "netlify-cache-tag": "config,chapters"
  });
};
export const config = { path: "/api/chapters" };
