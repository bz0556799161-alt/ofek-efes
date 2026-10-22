// Serves a font file uploaded in the admin panel.
import { fontStore } from "../lib/common.mjs";

const TYPES = { woff2: "font/woff2", woff: "font/woff", ttf: "font/ttf", otf: "font/otf" };

export default async (req) => {
  const id = decodeURIComponent(new URL(req.url).pathname.split("/").pop() || "");
  if (!/^[a-z0-9-]{6,80}$/.test(id)) return new Response("not found", { status: 404 });
  const res = await fontStore().getWithMetadata(id, { type: "arrayBuffer" });
  if (!res) return new Response("not found", { status: 404 });
  const ext = (res.metadata && res.metadata.ext) || "woff2";
  return new Response(res.data, {
    headers: {
      "content-type": TYPES[ext] || "application/octet-stream",
      "cache-control": "public, max-age=31536000, immutable",
      "access-control-allow-origin": "*"
    }
  });
};
export const config = { path: "/api/font/*" };
