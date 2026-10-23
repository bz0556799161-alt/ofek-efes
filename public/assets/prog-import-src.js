(async function () {
  var ADMIN = "__ORIGIN__/admin/";
  if (!/prog\.co\.il$/.test(location.hostname)) { alert("את הכפתור הזה לוחצים כשנמצאים באתר פרוג."); return; }
  var box = document.createElement("div");
  box.style.cssText = "position:fixed;z-index:99999;top:16px;left:50%;transform:translateX(-50%);background:#0e1417;color:#eceeee;border:1px solid #d6b46c;border-radius:14px;padding:12px 18px;font:600 15px Arial;direction:rtl;box-shadow:0 10px 30px rgba(0,0,0,.4)";
  box.textContent = "אופק אפס: קורא את הפרקים…"; document.body.appendChild(box);
  var E = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", "#39": "'" };
  function dec(s) { return String(s || "").replace(/&#x([0-9a-f]+);/gi, function (_, h) { return String.fromCodePoint(parseInt(h, 16)); }).replace(/&#(\d+);/g, function (_, d) { return String.fromCodePoint(+d); }).replace(/&([a-z#0-9]+);/gi, function (m, n) { return n in E ? E[n] : m; }); }
  function txt(h) { return dec(String(h || "").replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "")).replace(/[ \t]+/g, " ").replace(/\n[ \t]+/g, "\n").replace(/\n{3,}/g, "\n\n").trim(); }
  try {
    var html = await (await fetch("/articles/series/%D7%90%D7%95%D7%A4%D7%A7-%D7%90%D7%A4%D7%A1.28/", { cache: "no-store" })).text();
    var items = [], re = /js-articleListItem-(\d+)"[\s\S]*?(?=js-articleListItem-\d+"|<\/main>|$)/g, m;
    while ((m = re.exec(html))) {
      var b = m[0], a = b.match(/structItem-title">[\s\S]*?<a href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/); if (!a) continue;
      var img = b.match(/class=['"]amsThumbnail-image['"][^>]*src=['"]([^'"]+)['"]/), t = b.match(/datetime="([^"]+)"/), d = b.match(/structItem-articleDescription">([\s\S]*?)<\/div>/);
      items.push({ id: m[1], url: "https://www.prog.co.il" + dec(a[1]).replace(/^https?:\/\/[^/]+/, ""), full: txt(a[2]), image: img ? dec(img[1]) : "",
        at: t ? Date.parse(t[1].replace(/([+-]\d\d)(\d\d)$/, "$1:$2")) : 0, snippet: d ? txt(d[1]).replace(/^שוב תודה[^\n]*\n*/, "").replace(/^\(?תודה רבה[^\n]*\n*/, "").slice(0, 400) : "" });
    }
    if (!items.length) throw new Error("לא נמצאו פרקים בדף הסדרה");
    for (var i = 0; i < items.length; i++) {
      box.textContent = "אופק אפס: קורא פרק " + (i + 1) + " מתוך " + items.length + "…";
      var h = await (await fetch(items[i].url.replace("https://www.prog.co.il", ""), { cache: "no-store" })).text();
      var ld = h.match(/"thumbnailUrl":\s*"([^"]+)"/); if (ld) items[i].image = JSON.parse('"' + ld[1] + '"');
      var at = h.indexOf('class="bbWrapper"');
      if (at >= 0) {
        var st = h.slice(at, at + 6000), q = st.match(/<blockquote[\s\S]*?js-expandContent[^>]*>([\s\S]*?)<\/div>/);
        if (q && st.indexOf("<blockquote") < 1500) {
          var raw = q[1], hd = raw.match(/^\s*<b>([\s\S]*?)<\/b>\s*(<br\s*\/?>)?/);
          if (hd) { items[i].summaryLabel = txt(hd[1]).replace(/:\s*$/, ""); raw = raw.slice(hd[0].length); }
          items[i].summary = txt(raw).slice(0, 2000);
        }
      }
    }
    box.textContent = "אופק אפס: עובר לניהול לשמירה…";
    location.href = ADMIN + "#import=" + encodeURIComponent(JSON.stringify(items));
  } catch (e) { box.textContent = "אופק אפס: הקריאה נכשלה (" + e.message + ")"; setTimeout(function () { box.remove(); }, 6000); }
})();
