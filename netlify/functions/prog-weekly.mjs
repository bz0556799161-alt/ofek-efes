// Every Saturday night (Israel time) checks prog.co.il for a new chapter of the book.
import { purgeCache } from "@netlify/functions";
import { syncProg } from "../lib/prog.mjs";

export default async () => {
  try {
    const data = await syncProg();
    if (data.added) await purgeCache({ tags: ["chapters"] }).catch(() => {});
    console.log("prog sync:", data.items.length, "chapters,", data.added, "new");
  } catch (e) {
    console.log("prog sync failed:", e.message);
  }
};
// 15:15-21:15 UTC on Saturday = from about motzei Shabbat until after midnight in Israel, all year
export const config = { schedule: "15 15-21 * * 6" };
