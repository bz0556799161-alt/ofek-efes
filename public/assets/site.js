/* =====================================================================
   אופק אפס — קוד משותף לכל הדפים
   - טוען את ההגדרות שנקבעו בתפריט הניהול (טקסטים, פונטים, מצב כפתורים)
   - סטטיסטיקה אנונימית (מזהה אקראי בדפדפן, בלי פרטים אישיים)
   - חלון קוד גישה לחלקים נעולים
   ===================================================================== */
(function () {
  "use strict";
  var script = document.currentScript;
  var APP = (script && script.getAttribute("data-app")) || "site";   // site | game | globe
  var LS_CFG = "ofek-config-v1", LS_VID = "ofek-vid";

  /* ---------------- אחסון מקומי בטוח ---------------- */
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }

  /* ---------------- סטטיסטיקה ---------------- */
  var vid = lsGet(LS_VID);
  if (!vid || !/^[a-z0-9]{12,40}$/.test(vid)) {
    vid = "";
    var chars = "abcdefghijklmnopqrstuvwxyz0123456789";
    var rnd = (window.crypto && crypto.getRandomValues) ? crypto.getRandomValues(new Uint8Array(20)) : null;
    for (var i = 0; i < 20; i++) vid += chars[(rnd ? rnd[i] : Math.floor(Math.random() * 256)) % 36];
    lsSet(LS_VID, vid);
  }
  /* לא סופרים: רובוטים, דפדפנים אוטומטיים, ומכשירים של המנהל (מסומנים בכניסה לניהול) */
  var BOT_RE = /bot|crawl|spider|slurp|headless|lighthouse|pagespeed|preview|screenshot|puppeteer|playwright|selenium|phantom|prerender|facebookexternalhit|whatsapp|telegram|discord|skype|embedly|bing|yandex|baidu|duckduck|semrush|ahrefs|mj12|petal|gptbot|claude|anthropic|chatgpt|perplexity|netlify/i;
  var noTrack = location.hostname === "localhost" || location.hostname === "127.0.0.1" ||
    navigator.webdriver === true || BOT_RE.test(navigator.userAgent || "") || lsGet("ofek-notrack") === "1";
  /* נספרים רק אחרי סימן של אדם אמיתי: תנועת עכבר, נגיעה, גלילה או מקש */
  var human = false;
  function markHuman() {
    if (human) return;
    human = true;
    ["pointermove", "pointerdown", "touchstart", "scroll", "wheel", "keydown"].forEach(function (t) { window.removeEventListener(t, markHuman, true); });
    if (queue.length && !timer) timer = setTimeout(function () { flush(false); }, 1500);
  }
  ["pointermove", "pointerdown", "touchstart", "scroll", "wheel", "keydown"].forEach(function (t) { window.addEventListener(t, markHuman, { capture: true, passive: true }); });

  var queue = [], timer = 0;
  function flush(useBeacon) {
    clearTimeout(timer); timer = 0;
    if (!queue.length || !human || noTrack) return;
    var body = JSON.stringify({
      vid: vid,
      device: /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent) ? "mobile" : "desktop",
      events: queue.splice(0, 50)
    });
    try {
      if (useBeacon && navigator.sendBeacon) { navigator.sendBeacon("/api/track", new Blob([body], { type: "text/plain" })); return; }
      fetch("/api/track", { method: "POST", body: body, keepalive: true, headers: { "content-type": "application/json" } }).catch(function () {});
    } catch (e) {}
  }
  window.ofekTrack = function (type, data) {
    if (noTrack) return;
    var ev = { t: String(type).slice(0, 20), at: Date.now() };
    if (data) for (var k in data) ev[k] = data[k];
    queue.push(ev);
    if (human && !timer) timer = setTimeout(function () { flush(false); }, 4000);
  };
  document.addEventListener("visibilitychange", function () { if (document.visibilityState === "hidden") flush(true); });
  window.addEventListener("pagehide", function () { flush(true); });

  var pageKey = (document.body && document.body.getAttribute("data-page")) || APP;
  window.ofekTrack("view", { page: pageKey });

  /* ---------------- פונטים ---------------- */
  var GOOGLE_W = "400;500;600;700";
  function fontStack(f, fallback) {
    if (!f || !f.family) return null;
    return '"' + f.family.replace(/"/g, "") + '", ' + fallback;
  }
  function applyFonts(cfg) {
    var fonts = (cfg && cfg.fonts) || {};
    var custom = (cfg && cfg.customFonts) || [];
    var id = "ofek-font-style";
    var css = "";
    var used = {};
    ["display", "body"].forEach(function (role) {
      var f = fonts[role];
      if (!f || !f.family) return;
      used[f.family] = f.kind || "google";
    });
    Object.keys(used).forEach(function (fam) {
      if (used[fam] === "google") {
        var lid = "ofek-gf-" + fam.replace(/\W+/g, "-");
        if (!document.getElementById(lid)) {
          var l = document.createElement("link");
          l.rel = "stylesheet"; l.id = lid;
          l.href = "https://fonts.googleapis.com/css2?family=" + encodeURIComponent(fam).replace(/%20/g, "+") + ":wght@" + GOOGLE_W + "&display=swap";
          l.onerror = function () { // משפחות שאין להן כל המשקלים
            l.href = "https://fonts.googleapis.com/css2?family=" + encodeURIComponent(fam).replace(/%20/g, "+") + "&display=swap";
          };
          document.head.appendChild(l);
        }
      } else {
        custom.filter(function (c) { return c.family === fam; }).forEach(function (c) {
          css += "@font-face{font-family:\"" + c.family.replace(/"/g, "") + "\";src:url(/api/font/" + encodeURIComponent(c.id) + ")" +
            (c.format ? " format(\"" + c.format + "\")" : "") + ";font-weight:" + (c.weight || 400) + ";font-style:" + (c.style || "normal") + ";font-display:swap}\n";
        });
      }
    });
    var disp = fontStack(fonts.display, "\"David\", serif"), body = fontStack(fonts.body, "\"Segoe UI\", Arial, sans-serif");
    var vars = "";
    if (APP === "site") {
      if (disp) vars += "--display:" + disp + ";";
      if (body) vars += "--body:" + body + ";";
    } else if (APP === "game") {
      if (disp) vars += "--serif:" + disp + ";";
      if (body) vars += "--sans:" + body + ";";
    } else if (APP === "globe" && body) {
      css += "html,body,.btn,input,label,#prompt,#roomLabel,#loadingOverlay,#adminPanel,#searchInput,#mapControls,#chartControls{font-family:" + body + " !important}\n";
      if (disp) css += "#roomLabel,#starChartCaption{font-family:" + disp + " !important}\n";
    }
    if (vars) css += ":root{" + vars + "}\n";
    var st = document.getElementById(id);
    if (!st) { st = document.createElement("style"); st.id = id; document.head.appendChild(st); }
    st.textContent = css;
  }

  /* ---------------- טקסטים ---------------- */
  function applyTexts(cfg) {
    var t = (cfg && cfg.texts) || {};
    document.querySelectorAll("[data-t]").forEach(function (el) {
      var k = el.getAttribute("data-t");
      if (!el.hasAttribute("data-t-default")) el.setAttribute("data-t-default", el.textContent);
      var v = Object.prototype.hasOwnProperty.call(t, k) && t[k] !== "" ? t[k] : el.getAttribute("data-t-default");
      if (el.textContent !== v) el.textContent = v;
    });
  }

  /* ---------------- מצב הכפתורים (פתוח / בקרוב / קוד / מוסתר) ---------------- */
  var SECTION_NAMES = { book: "הספר", game: "המשחק", globe: "המבנה הכדורי" };
  function sectionMode(cfg, s) {
    var m = cfg && cfg.sections && cfg.sections[s] && cfg.sections[s].mode;
    return m || "open";
  }
  function applySections(cfg) {
    document.querySelectorAll("[data-section]").forEach(function (el) {
      var s = el.getAttribute("data-section"), mode = sectionMode(cfg, s);
      var role = el.getAttribute("data-role") || "link";
      el.classList.remove("is-soon", "is-locked");
      if (role === "card") { el.hidden = mode === "hidden"; return; }
      if (role === "page") { el.hidden = !(mode === "hidden" || mode === "soon"); return; }
      // role link: "בקרוב" מוצג כתווית ליד הכפתור (בעיצוב), הטקסט עצמו לא משתנה
      el.hidden = mode === "hidden";
      if (mode === "soon") { el.classList.add("is-soon"); el.setAttribute("aria-disabled", "true"); }
      else el.removeAttribute("aria-disabled");
      if (mode === "locked") el.classList.add("is-locked");
    });
  }
  document.addEventListener("click", function (ev) {
    var el = ev.target.closest && ev.target.closest("[data-section]");
    if (!el || el.getAttribute("data-role") === "card" || el.getAttribute("data-role") === "page") return;
    if (el.classList.contains("is-soon")) { ev.preventDefault(); return; }
    if (el.classList.contains("is-locked") && el.hasAttribute("data-gate")) {
      ev.preventDefault();
      openCodeDialog(el.getAttribute("data-section"), el.getAttribute("href"));
    }
  });

  function openCodeDialog(section, href) {
    var old = document.getElementById("ofekCode"); if (old) old.remove();
    var wrap = document.createElement("div");
    wrap.id = "ofekCode"; wrap.className = "code-dialog"; wrap.setAttribute("role", "dialog"); wrap.setAttribute("aria-modal", "true");
    wrap.innerHTML =
      '<form class="code-card">' +
      '<button type="button" class="code-x" aria-label="סגירה">×</button>' +
      '<h3>הכניסה ל' + (SECTION_NAMES[section] || "כאן") + ' בקוד</h3>' +
      '<p>כרגע הכניסה פתוחה למי שקיבל קוד גישה.</p>' +
      '<label for="ofekCodeIn">קוד גישה</label>' +
      '<input id="ofekCodeIn" autocomplete="off" inputmode="text" required>' +
      '<p class="code-err" aria-live="polite"></p>' +
      '<button type="submit" class="btn primary">כניסה</button></form>';
    document.body.appendChild(wrap);
    var input = wrap.querySelector("input"), err = wrap.querySelector(".code-err");
    function close() { wrap.remove(); }
    wrap.querySelector(".code-x").onclick = close;
    wrap.addEventListener("click", function (e) { if (e.target === wrap) close(); });
    document.addEventListener("keydown", function esc(e) { if (e.key === "Escape") { close(); document.removeEventListener("keydown", esc); } });
    wrap.querySelector("form").addEventListener("submit", function (e) {
      e.preventDefault();
      err.textContent = "בודק…";
      fetch("/api/unlock", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ section: section, code: input.value.trim() }) })
        .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { return { ok: r.ok, j: j }; }); })
        .then(function (res) {
          if (res.ok) { window.ofekTrack("unlock", { section: section }); location.href = href; }
          else err.textContent = (res.j && res.j.error) || "הקוד לא נכון. נסו שוב.";
        })
        .catch(function () { err.textContent = "אין חיבור כרגע. נסו שוב בעוד רגע."; });
    });
    setTimeout(function () { input.focus(); }, 30);
  }

  /* ---------------- טעינת ההגדרות ---------------- */
  function apply(cfg) {
    window.OFEK_CONFIG = cfg || {};
    applyFonts(cfg);
    if (APP === "site") {
      applyTexts(cfg);
      applySections(cfg);
      if (/[?&]blocked=1/.test(location.search)) document.documentElement.classList.add("came-blocked");
    }
    document.dispatchEvent(new CustomEvent("ofek:config", { detail: cfg || {} }));
  }
  var cached = null;
  try { cached = JSON.parse(lsGet(LS_CFG) || "null"); } catch (e) {}
  function start() {
    apply(cached);
    fetch("/api/config", { cache: "no-store" }).then(function (r) { return r.ok ? r.json() : null; }).then(function (cfg) {
      if (!cfg) return;
      var s = JSON.stringify(cfg);
      if (s !== JSON.stringify(cached)) { lsSet(LS_CFG, s); apply(cfg); }
    }).catch(function () {});
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
})();
