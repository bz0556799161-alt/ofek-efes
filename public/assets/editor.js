/* =====================================================================
   אופק אפס — עריכת טקסטים ועיצובם ישירות בדף (רק למנהל המחובר)
   נטען רק במכשיר שנכנס לניהול. כל טקסט עם data-t אפשר לשנות במקום,
   ולעצב: הדגשה, נטוי, קו תחתון, גודל, צבע, גופן ויישור.
   טקסט שמרוקנים חוזר לנוסח המקורי.
   ===================================================================== */
(function () {
  "use strict";
  var EDIT_KEY = "ofek-editing";
  function ssGet(k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } }
  function ssSet(k, v) { try { if (v == null) sessionStorage.removeItem(k); else sessionStorage.setItem(k, v); } catch (e) {} }
  var GOLD = "#d6b46c";
  var COLORS = [["", "ברירת מחדל"], ["#d6b46c", "זהב"], ["#6fb6bd", "טורקיז"], ["#ffffff", "לבן"], ["#b0b9bb", "אפור"], ["#e57c6b", "אדום"]];

  var css = document.createElement("style");
  css.textContent =
    "#ofekAdminBar{position:fixed;z-index:40;top:calc(8px + env(safe-area-inset-top,0px));left:50%;transform:translateX(-50%);display:flex;gap:6px;align-items:center;" +
    "padding:6px;border-radius:99px;background:rgba(11,15,17,.94);border:1px solid rgba(214,180,108,.45);box-shadow:0 8px 30px rgba(0,0,0,.45);font:600 14px Rubik,Arial,sans-serif;max-width:calc(100vw - 24px);flex-wrap:wrap;justify-content:center}" +
    "#ofekAdminBar button,#ofekAdminBar a,#ofekFmt button,#ofekFmt select{min-height:32px;padding:0 12px;border-radius:99px;border:1px solid rgba(205,216,218,.18);background:rgba(255,255,255,.05);color:#eceeee;font:inherit;cursor:pointer;text-decoration:none;display:inline-flex;align-items:center;justify-content:center}" +
    "#ofekAdminBar .on,#ofekFmt .on{background:" + GOLD + ";color:#1b1407;border-color:" + GOLD + "}" +
    "#ofekAdminBar .msg{color:#b0b9bb;font-weight:400;padding:0 6px;font-size:13px}" +
    "#ofekFmt{position:fixed;z-index:41;display:flex;gap:4px;align-items:center;flex-wrap:wrap;padding:5px;border-radius:14px;background:rgba(11,15,17,.96);border:1px solid rgba(214,180,108,.45);box-shadow:0 10px 30px rgba(0,0,0,.5);font:600 13px Rubik,Arial,sans-serif;max-width:min(560px,calc(100vw - 16px))}" +
    "#ofekFmt button{min-width:32px;padding:0 8px;border-radius:9px}" +
    "#ofekFmt select{border-radius:9px;padding:0 6px;background:#161c1f}" +
    "#ofekFmt .sw{width:22px;min-width:22px;height:22px;min-height:22px;padding:0;border-radius:50%;border:2px solid rgba(255,255,255,.25)}" +
    "#ofekFmt .sw.on{border-color:#fff;box-shadow:0 0 0 2px " + GOLD + "}" +
    "#ofekFmt .sep{width:1px;height:22px;background:rgba(255,255,255,.15);margin:0 2px}" +
    "#ofekFmt input[type=color]{width:26px;height:26px;padding:0;border:0;background:none;cursor:pointer}" +
    ".ofek-editing [data-t]{pointer-events:auto!important;cursor:text;outline:1px dashed rgba(214,180,108,.55);outline-offset:3px;border-radius:3px;-webkit-user-select:text;user-select:text}" +
    ".ofek-editing [data-t]:hover{background:rgba(214,180,108,.08)}" +
    ".ofek-editing [data-t]:focus{outline:2px solid " + GOLD + ";background:rgba(214,180,108,.1)}" +
    ".ofek-editing [data-t].ofek-changed{outline:2px solid " + GOLD + "}" +
    ".ofek-editing .door .btn::after{display:none}" +
    ".ofek-editing [data-role=\"page\"][hidden],.ofek-editing .blocked-note{display:block!important;position:relative}" +
    ".ofek-editing [data-role=\"page\"][hidden]::before,.ofek-editing .blocked-note::before{content:\"מוצג רק כשהחלק סגור\";position:absolute;top:-11px;right:14px;z-index:1;font-size:12px;font-weight:700;background:" + GOLD + ";color:#1b1407;border-radius:99px;padding:0 9px}";
  document.head.appendChild(css);

  var bar, btnEdit, btnSave, btnCancel, msg, fmt, editing = false, current = null;
  var originals = new Map();          // el -> text when editing started (or last saved)
  var styleOrig = {}, styleNow = {};  // key -> style object

  function plain() {
    var probe = document.createElement("div");
    try { probe.contentEditable = "plaintext-only"; } catch (e) {}
    return probe.contentEditable === "plaintext-only" ? "plaintext-only" : "true";
  }
  var CE = plain();
  var cfgStyles = function () { return ((window.OFEK_CONFIG || {}).textStyles) || {}; };
  var same = function (a, b) { return JSON.stringify(a || {}) === JSON.stringify(b || {}); };
  var keyOf = function (el) { return el.getAttribute("data-t"); };

  function changedEls() {
    var out = [];
    document.querySelectorAll("[data-t]").forEach(function (el) {
      if (originals.has(el) && el.innerText.trim() !== originals.get(el)) out.push(el);
    });
    return out;
  }
  function changedStyleKeys() {
    return Object.keys(styleNow).filter(function (k) { return !same(styleNow[k], styleOrig[k]); });
  }
  function refresh() {
    var n = changedEls().length + changedStyleKeys().filter(function (k) { return !changedEls().some(function (el) { return keyOf(el) === k; }); }).length;
    btnSave.textContent = n ? "שמירה (" + n + ")" : "שמירה";
    btnSave.disabled = !n; btnSave.style.opacity = n ? "1" : ".5";
    var sk = changedStyleKeys();
    document.querySelectorAll("[data-t]").forEach(function (el) {
      el.classList.toggle("ofek-changed", (originals.has(el) && el.innerText.trim() !== originals.get(el)) || sk.indexOf(keyOf(el)) >= 0);
    });
  }

  /* ---------- the format toolbar ---------- */
  function styleFor(el) { var k = keyOf(el); return styleNow[k] || (styleNow[k] = JSON.parse(JSON.stringify(styleOrig[k] || {}))); }
  function applyAll(k) { document.querySelectorAll('[data-t="' + k + '"]').forEach(function (el) { window.ofekApplyStyle(el, styleNow[k]); }); }
  function setStyle(prop, val) {
    if (!current) return;
    var k = keyOf(current), st = styleFor(current);
    if (val === undefined || val === null || val === "") delete st[prop]; else st[prop] = val;
    applyAll(k); refresh(); syncFmt(); placeFmt();
  }
  function buildFmt() {
    fmt = document.createElement("div"); fmt.id = "ofekFmt"; fmt.hidden = true; fmt.setAttribute("role", "toolbar"); fmt.setAttribute("aria-label", "עיצוב הטקסט");
    var html =
      '<button type="button" data-a="b" title="הדגשה"><b>ב</b></button>' +
      '<button type="button" data-a="i" title="נטוי"><i>נ</i></button>' +
      '<button type="button" data-a="u" title="קו תחתון"><u>ק</u></button>' +
      '<span class="sep"></span>' +
      '<button type="button" data-a="smaller" title="הקטנה">א−</button>' +
      '<button type="button" data-a="bigger" title="הגדלה">א+</button>' +
      '<span class="sep"></span>' +
      COLORS.map(function (c) { return '<button type="button" class="sw" data-color="' + c[0] + '" title="' + c[1] + '" style="background:' + (c[0] || "linear-gradient(135deg,#eceeee 50%,#76818a 50%)") + '"></button>'; }).join("") +
      '<input type="color" data-a="pick" title="צבע אחר">' +
      '<span class="sep"></span>' +
      '<select data-a="font" title="גופן"><option value="">גופן רגיל</option><option value="display">גופן כותרות</option><option value="body">גופן טקסט</option></select>' +
      '<span class="sep"></span>' +
      '<button type="button" data-al="right" title="יישור לימין">⇥</button><button type="button" data-al="center" title="מרכוז">≡</button><button type="button" data-al="left" title="יישור לשמאל">⇤</button>' +
      '<span class="sep"></span>' +
      '<button type="button" data-a="clear" title="ניקוי העיצוב">ניקוי עיצוב</button>';
    fmt.innerHTML = html;
    document.body.appendChild(fmt);
    fmt.addEventListener("mousedown", function (e) { if (e.target.tagName !== "SELECT" && e.target.tagName !== "INPUT") e.preventDefault(); });
    fmt.addEventListener("click", function (e) {
      var b = e.target.closest("button"); if (!b || !current) return;
      var st = styleFor(current), a = b.getAttribute("data-a");
      if (a === "b") setStyle("b", st.b === 1 ? 0 : st.b === 0 ? null : (parseInt(getComputedStyle(current).fontWeight, 10) >= 600 ? 0 : 1));
      else if (a === "i") setStyle("i", st.i ? null : 1);
      else if (a === "u") setStyle("u", st.u ? null : 1);
      else if (a === "smaller") setStyle("s", Math.max(0.5, Math.round(((st.s || 1) - 0.1) * 100) / 100));
      else if (a === "bigger") setStyle("s", Math.min(3, Math.round(((st.s || 1) + 0.1) * 100) / 100));
      else if (a === "clear") { styleNow[keyOf(current)] = {}; applyAll(keyOf(current)); refresh(); syncFmt(); placeFmt(); }
      else if (b.hasAttribute("data-color")) setStyle("c", b.getAttribute("data-color"));
      else if (b.hasAttribute("data-al")) setStyle("a", st.a === b.getAttribute("data-al") ? null : b.getAttribute("data-al"));
      if (current) current.focus();
    });
    fmt.querySelector('[data-a="font"]').addEventListener("change", function (e) { setStyle("f", e.target.value); });
    fmt.querySelector('[data-a="pick"]').addEventListener("input", function (e) { setStyle("c", e.target.value); });
  }
  function syncFmt() {
    if (!current) return;
    var st = styleFor(current);
    fmt.querySelector('[data-a="b"]').classList.toggle("on", st.b === 1);
    fmt.querySelector('[data-a="i"]').classList.toggle("on", !!st.i);
    fmt.querySelector('[data-a="u"]').classList.toggle("on", !!st.u);
    fmt.querySelectorAll("[data-color]").forEach(function (b) { b.classList.toggle("on", (st.c || "") === b.getAttribute("data-color")); });
    fmt.querySelectorAll("[data-al]").forEach(function (b) { b.classList.toggle("on", st.a === b.getAttribute("data-al")); });
    fmt.querySelector('[data-a="font"]').value = st.f || "";
    fmt.querySelector('[data-a="pick"]').value = /^#[0-9a-f]{6}$/i.test(st.c || "") ? st.c : "#d6b46c";
  }
  function placeFmt() {
    if (!current || fmt.hidden) return;
    var r = current.getBoundingClientRect(), fh = fmt.offsetHeight, fw = fmt.offsetWidth;
    var top = r.top - fh - 10; if (top < 54) top = r.bottom + 10;
    var left = Math.min(window.innerWidth - fw - 8, Math.max(8, r.right - fw));
    fmt.style.top = top + "px"; fmt.style.left = left + "px";
  }
  function onFocus(e) {
    if (!editing) return;
    var el = e.target.closest && e.target.closest("[data-t]");
    if (!el) return;
    current = el; fmt.hidden = false; syncFmt(); placeFmt();
  }
  function onBlur() {
    setTimeout(function () {
      var a = document.activeElement;
      if (fmt.contains(a) || (a && a.closest && a.closest("[data-t]"))) return;
      fmt.hidden = true; current = null;
    }, 150);
  }

  function onPaste(e) {
    if (!e.target.closest || !e.target.closest("[data-t]")) return;
    e.preventDefault();
    var t = (e.clipboardData || window.clipboardData).getData("text/plain");
    document.execCommand("insertText", false, t);
  }
  // inside edit mode, clicking a text edits it: links and buttons around it don't fire
  function onClick(e) {
    if (!editing) return;
    if (e.target.closest && (e.target.closest("#ofekAdminBar") || e.target.closest("#ofekFmt"))) return;
    if (e.target.closest && e.target.closest("[data-t]")) { e.preventDefault(); e.stopPropagation(); }
  }

  function enter() {
    editing = true; ssSet(EDIT_KEY, "1");
    document.documentElement.classList.add("ofek-editing");
    styleOrig = JSON.parse(JSON.stringify(cfgStyles())); styleNow = {};
    document.querySelectorAll("[data-t]").forEach(function (el) {
      originals.set(el, el.innerText.trim());
      el.setAttribute("contenteditable", CE);
      el.spellcheck = false;
    });
    btnEdit.classList.add("on"); btnEdit.textContent = "✎ במצב עריכה";
    btnSave.hidden = false; btnCancel.hidden = false;
    msg.textContent = "לחץ על טקסט כדי לשנות אותו או לעצב. טקסט ריק חוזר למקור.";
    refresh();
  }
  function leave() {
    editing = false; ssSet(EDIT_KEY, null);
    document.documentElement.classList.remove("ofek-editing");
    document.querySelectorAll("[data-t]").forEach(function (el) { el.removeAttribute("contenteditable"); el.classList.remove("ofek-changed"); });
    originals.clear(); fmt.hidden = true; current = null;
    btnEdit.classList.remove("on"); btnEdit.textContent = "✎ עריכת טקסטים";
    btnSave.hidden = true; btnCancel.hidden = true; msg.textContent = "";
  }
  function cancel() {
    document.querySelectorAll("[data-t]").forEach(function (el) { if (originals.has(el)) el.textContent = originals.get(el); });
    Object.keys(styleNow).forEach(function (k) { styleNow[k] = JSON.parse(JSON.stringify(styleOrig[k] || {})); applyAll(k); });
    refresh(); syncFmt();
    msg.textContent = "השינויים בוטלו.";
  }
  function save() {
    var set = {}, reset = [], styles = {};
    changedEls().forEach(function (el) {
      var k = keyOf(el), v = el.innerText.trim();
      if (!v || v === (el.getAttribute("data-t-default") || "").trim()) reset.push(k); else set[k] = v;
    });
    changedStyleKeys().forEach(function (k) { styles[k] = Object.keys(styleNow[k] || {}).length ? styleNow[k] : null; });
    btnSave.disabled = true; msg.textContent = "שומר…";
    fetch("/api/admin/texts", { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ set: set, reset: reset, styles: styles }) })
      .then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error(j.error || "השמירה נכשלה"); return j; }); })
      .then(function (j) {
        var cfg = window.OFEK_CONFIG || {};
        cfg.texts = j.texts; cfg.textStyles = j.textStyles || {};
        try { localStorage.setItem("ofek-config-v1", JSON.stringify(cfg)); } catch (e) {}
        document.querySelectorAll("[data-t]").forEach(function (el) {
          var k = keyOf(el);
          if (reset.indexOf(k) >= 0) el.textContent = el.getAttribute("data-t-default") || el.textContent;
          if (originals.has(el)) originals.set(el, el.innerText.trim());
        });
        styleOrig = JSON.parse(JSON.stringify(cfg.textStyles)); styleNow = {};
        refresh();
        msg.textContent = "נשמר. המבקרים יראו את זה תוך חצי דקה.";
      })
      .catch(function (err) { btnSave.disabled = false; msg.textContent = err.message; });
  }

  function build() {
    bar = document.createElement("div");
    bar.id = "ofekAdminBar"; bar.setAttribute("role", "toolbar"); bar.setAttribute("aria-label", "כלי מנהל");
    var inFrame = window.top !== window;
    var admin = document.createElement("a"); admin.href = "/admin/"; admin.textContent = "ניהול"; if (inFrame) admin.target = "_top";
    btnEdit = document.createElement("button"); btnEdit.type = "button"; btnEdit.textContent = "✎ עריכת טקסטים";
    btnSave = document.createElement("button"); btnSave.type = "button"; btnSave.className = "on"; btnSave.hidden = true;
    btnCancel = document.createElement("button"); btnCancel.type = "button"; btnCancel.textContent = "ביטול שינויים"; btnCancel.hidden = true;
    msg = document.createElement("span"); msg.className = "msg"; msg.setAttribute("aria-live", "polite");
    if (inFrame) bar.append(btnEdit, btnSave, btnCancel, msg); else bar.append(admin, btnEdit, btnSave, btnCancel, msg);
    document.body.appendChild(bar);
    buildFmt();
    btnEdit.onclick = function () { if (editing) { if (changedEls().length || changedStyleKeys().length) { msg.textContent = "יש שינויים שלא נשמרו. שמור או בטל קודם."; return; } leave(); } else enter(); };
    btnSave.onclick = save;
    btnCancel.onclick = cancel;
    document.addEventListener("input", refresh, true);
    document.addEventListener("paste", onPaste, true);
    document.addEventListener("focusin", onFocus, true);
    document.addEventListener("focusout", onBlur, true);
    window.addEventListener("click", onClick, true);
    window.addEventListener("scroll", placeFmt, { passive: true });
    window.addEventListener("resize", placeFmt);
    window.addEventListener("beforeunload", function (e) { if (editing && (changedEls().length || changedStyleKeys().length)) { e.preventDefault(); e.returnValue = ""; } });
    if (/[?&]edit=1/.test(location.search) || ssGet(EDIT_KEY) === "1") enter();
  }

  fetch("/api/admin/me", { cache: "no-store", credentials: "same-origin" })
    .then(function (r) { return r.json(); })
    .then(function (me) { if (me && me.admin) build(); })
    .catch(function () {});
})();
