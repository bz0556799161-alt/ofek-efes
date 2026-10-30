// Contact form: every message is kept on the site (admin → פניות) and, when an email key is set, also sent by email.
import { messageStore, json, sleep, randomHex } from "../lib/common.mjs";

const env = (k) => (globalThis.Netlify && Netlify.env && Netlify.env.get(k)) || process.env[k] || "";
const s = (v, max) => String(v == null ? "" : v).replace(/\u0000/g, "").trim().slice(0, max);
const esc = (t) => t.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const recent = new Map(); // per warm instance: ip -> [timestamps]

async function sendEmail(m) {
  const key = env("RESEND_API_KEY");
  if (!key) return "no-key";
  const to = env("CONTACT_TO") || "bz0556799161@gmail.com";
  const rows = [["שם", m.name], ["נושא", m.topic], ["מייל", m.email], ["טלפון", m.phone]].filter((r) => r[1]);
  const html = '<div dir="rtl" style="font-family:Arial,sans-serif;font-size:15px;line-height:1.6;color:#1b1b1b">' +
    "<h2 style=\"margin:0 0 12px\">פנייה חדשה מאתר אופק אפס</h2>" +
    rows.map((r) => "<p style=\"margin:0\"><b>" + r[0] + ":</b> " + esc(r[1]) + "</p>").join("") +
    "<p style=\"margin:14px 0 4px\"><b>ההודעה:</b></p><div style=\"white-space:pre-wrap;background:#f4f1ea;border-radius:8px;padding:12px\">" + esc(m.message) + "</div>" +
    "<p style=\"color:#777;font-size:13px;margin-top:16px\">כל הפניות שמורות גם בניהול האתר, בלשונית פניות.</p></div>";
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: "Bearer " + key, "content-type": "application/json" },
    body: JSON.stringify({
      from: env("CONTACT_FROM") || "אופק אפס <onboarding@resend.dev>",
      to: [to], subject: "פנייה חדשה: " + (m.topic || "אתר אופק אפס") + " · " + m.name,
      html, reply_to: m.email || undefined
    })
  });
  return r.ok ? "sent" : "failed-" + r.status;
}

export default async (req, context) => {
  if (req.method !== "POST") return json({ error: "method" }, 405);
  let b = {};
  try { b = await req.json(); } catch (e) { return json({ error: "השליחה לא הצליחה." }, 400); }
  if (b.website) return json({ ok: true });   // the hidden field only robots fill in
  const m = { name: s(b.name, 80), topic: s(b.topic, 60), email: s(b.email, 120), phone: s(b.phone, 30), message: s(b.message, 4000) };
  if (!m.name || !m.message) return json({ error: "חסר שם או הודעה." }, 400);
  if (!m.email && !m.phone) return json({ error: "השאר מייל או טלפון לחזרה." }, 400);
  if (m.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(m.email)) return json({ error: "כתובת המייל לא תקינה." }, 400);
  const ip = (context && context.ip) || "x", now = Date.now();
  const list = (recent.get(ip) || []).filter((t) => now - t < 3600e3);
  if (list.length >= 5) { await sleep(500); return json({ error: "נשלחו כבר כמה פניות. נסה שוב מאוחר יותר." }, 429); }
  list.push(now); recent.set(ip, list);
  const id = new Date(now).toISOString().replace(/[-:.TZ]/g, "").slice(0, 14) + "-" + randomHex(3);
  let mail = "no-key";
  try { mail = await sendEmail(m); } catch (e) { mail = "failed"; }
  await messageStore().setJSON(id, Object.assign({ id, at: now, read: false, mail }, m));
  return json({ ok: true });
};
export const config = { path: "/api/contact" };
