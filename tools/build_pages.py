# Builds the four public pages from shared parts. Run: python3 tools/build_pages.py
import os
ROOT = os.path.join(os.path.dirname(__file__), "..", "public")

FAVICON = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' rx='14' fill='%23040815'/%3E%3Cpath d='M32 10l4.6 15.4L52 32l-15.4 4.6L32 54l-4.6-17.4L12 32l15.4-6.6z' fill='%23e8cf8a'/%3E%3C/svg%3E"

def head(title, desc):
    return f'''<!doctype html>
<html lang="he" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>{title}</title>
<meta name="description" content="{desc}">
<meta property="og:title" content="{title}">
<meta property="og:description" content="{desc}">
<meta property="og:image" content="/assets/og.jpg">
<meta name="theme-color" content="#050d10">
<link rel="icon" href="/favicon.ico" sizes="any"><link rel="icon" type="image/png" sizes="32x32" href="/assets/favicon-32.png"><link rel="apple-touch-icon" href="/assets/apple-touch-icon.png"><link rel="manifest" href="/site.webmanifest">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Rubik:wght@400;500;600;700&display=swap">
<link rel="stylesheet" href="/assets/site.css">
</head>
'''

LOGO = '<picture><source type="image/webp" srcset="/assets/logo-640.webp 640w, /assets/logo-1100.webp 1100w, /assets/logo-2200.webp 2200w" sizes="{sizes}"><img src="/assets/logo.png" alt="אופק אפס" class="{cls}" width="1100" height="659" decoding="async"></picture>'

def topbar(current):
    links = [("book", "/book/", "הספר"), ("game", "/game/", "המשחק"), ("globe", "/globe/", "המבנה")]
    nav = "".join(
        f'<a class="btn" href="{h}" data-section="{k}"{" data-gate" if k == "book" else " data-role=\"card\""}{" aria-current=\"page\"" if k == current else ""}>{t}</a>'
        for k, h, t in links)
    return f'''  <div class="topbar wrap">
    <a class="home-link" href="/" aria-label="לדף הבית">{LOGO.format(cls="", sizes="92px")}</a>
    <nav class="topnav" aria-label="ניווט">{nav}</nav>
  </div>
'''

HUD = '''<aside class="hud" id="hud" aria-label="משחק הכוכבים" data-solid>
  <p class="hud-toast" id="hudToast" hidden aria-live="polite"></p>
  <div class="hud-grip" aria-hidden="true" title="גרור כדי להזיז את הלוח"></div>
  <button class="hud-fold" id="hudFold" aria-expanded="true" aria-label="הקטן או הגדל את לוח המשחק" title="הקטן את לוח המשחק"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg></button>
  <div class="hud-top">
    <canvas id="hudShape" width="64" height="64" aria-hidden="true"></canvas>
    <div class="hud-info">
      <div class="hud-ask">מצאו בשמיים את</div>
      <div class="hud-name" id="hudName">…</div>
      <div class="hud-prog" id="hudProgress" aria-live="polite"></div>
      <div class="hud-note" id="hudNote"></div>
    </div>
    <div class="hud-score"><b id="hudScore">0</b><span>נקודות</span></div>
  </div>
  <div class="hud-lv"><div class="hud-lvbar"><i id="hudLvBar"></i></div><div class="hud-lvtext" id="hudLvText"></div></div>
  <div class="hud-row">
    <div class="lv" role="group" aria-label="שלב">
      <button class="hb" id="lvPrev" aria-label="שלב קודם" title="שלב קודם"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg></button>
      <span id="hudLevel">שלב 1</span>
      <button class="hb" id="lvNext" aria-label="שלב הבא" title="שלב הבא (נפתח כל 100 נקודות)"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg></button>
    </div>
    <button class="hb" id="btnHint" title="רמז נחשב כטעות אחת">רמז</button>
    <button class="hb" id="btnSwap">החלף</button>
    <button class="hb" id="btnSkyOnly" aria-pressed="false">רק שמיים</button>
  </div>
</aside>
'''

FOOT = '''  <footer>
    <div class="wrap">
      <span data-t="footer.name">אופק אפס</span>
      <span data-t="footer.privacy">האתר שומר נתוני שימוש אנונימיים בלבד, בלי פרטים אישיים.</span>
    </div>
  </footer>
'''

def page(name, title, desc, body, extra_scripts=""):
    return head(title, desc) + f'''<body data-page="{name}">

<canvas id="sky" aria-label="שמי לילה. לחצו על כוכבי הקבוצה המבוקשת"></canvas>

<div class="page">
{body}
{FOOT}</div>

{HUD}
{extra_scripts}<script src="/assets/site.js"></script>
<script src="/assets/sky.js"></script>
</body>
</html>
'''

# ---------------- home ----------------
def door(sec, href, kicker_key, kicker, title_key, title, text_key, text, cta_key, cta):
    return f'''      <article class="panel door" data-section="{sec}" data-role="card" data-solid>
        <span class="kicker" data-t="{kicker_key}">{kicker}</span>
        <h2 data-t="{title_key}">{title}</h2>
        <p data-t="{text_key}">{text}</p>
        <a class="btn primary" href="{href}" data-section="{sec}"{" data-gate" if sec == "book" else ""}><span data-t="{cta_key}">{cta}</span></a>
      </article>
'''

home_body = f'''  <header class="hero home wrap">
    <div class="hero-text" data-solid>
      <h1 class="logo-wrap">{LOGO.format(cls="logo", sizes="(max-width: 600px) 86vw, 560px")}</h1>
      <p class="lede" data-t="home.lede">ספר בהמשכים על שמיים, כוכבים ומה שמסתתר מעבר לאופק. סביב הספר נבנו גם משחק ומבנה תלת־ממדי, כדי לראות בעיניים את מה שהדמויות לומדות.</p>
      <p class="blocked-note" data-t="home.blocked">החלק שניסיתם להיכנס אליו לא פתוח כרגע.</p>
    </div>
  </header>

  <main class="wrap">
    <div class="doors">
{door("book", "/book/", "home.book.kicker", "פרק חדש בכל מוצאי שבת", "home.book.title", "הספר", "home.book.text", "הפרק האחרון, כל הפרקים שפורסמו עד עכשיו, וקצת על הספר.", "home.book.cta", "לפרקי הספר")}{door("game", "/game/", "home.game.kicker", "משחק", "home.game.title", "הדרך לכוכב הצפון", "home.game.text", "לומדים לזהות קבוצות כוכבים ולמצוא בעזרתן את הצפון, שלב אחרי שלב.", "home.game.cta", "למשחק")}{door("globe", "/globe/", "home.globe.kicker", "סיור תלת־ממדי", "home.globe.title", "המבנה הכדורי", "home.globe.text", "נכנסים לתוך כדור השמיים ומטיילים בין החדרים, חדר לכל קבוצת כוכבים.", "home.globe.cta", "למבנה")}    </div>
    <p class="hero-hint" data-t="home.skyhint">ברקע מסתתרת קבוצת כוכבים. מצאו אותה ולחצו על כל הכוכבים שלה.</p>
  </main>
'''

# ---------------- book ----------------
book_body = topbar("book") + '''  <header class="page-head wrap" data-solid>
    <h1 data-t="book.title">הספר</h1>
    <p class="lede" data-t="book.lede">אופק אפס מתפרסם בהמשכים בפורום פרוג. פרק חדש עולה בכל מוצאי שבת.</p>
  </header>
  <main>
    <section class="wrap">
      <div class="panel latest" data-solid id="latestCard"></div>
    </section>
    <section id="chapters" class="wrap" aria-labelledby="chaptersTitle">
      <div class="panel" data-solid>
        <h2 id="chaptersTitle" data-t="book.list.title">כל הפרקים</h2>
        <p class="sub" data-t="book.list.sub">לחיצה על פרק פותחת אותו בפרוג.</p>
        <ol class="chapters" id="chapterList"></ol>
        <p class="series-link"><span data-t="book.series.before">לכל הסדרה ולתגובות הקוראים:</span> <a id="seriesLink" href="https://www.prog.co.il/articles/series/%D7%90%D7%95%D7%A4%D7%A7-%D7%90%D7%A4%D7%A1.28/" target="_blank" rel="noopener"><span data-t="book.series.link">אופק אפס בפרוג</span> ↗</a></p>
      </div>
    </section>
    <section id="about" class="wrap" aria-labelledby="aboutTitle">
      <div class="panel about" data-solid>
        <h2 id="aboutTitle" data-t="book.about.title">על הספר</h2>
        <p data-t="book.about.p1">כמעט כל יום אנחנו מרימים את העיניים אל השמיים, ורק מעטים יודעים באמת לקרוא אותם.</p>
        <p data-t="book.about.p2">אנחנו יודעים שהשמש זורחת ושוקעת ושהירח משנה את צורתו, אבל מעבר לזה יש עולם שלם של סדר ויופי: כוכבים שחוזרים כל לילה לאותו מקום, קבוצות שמשמשות שלטי דרך, וכוכב אחד שכמעט לא זז. אופק אפס יוצא לדרך הזאת דרך סיפור, יחד עם איתן וחבריו.</p>
      </div>
    </section>
  </main>
'''

BOOK_SCRIPT = '''<script src="/assets/chapters.js"></script>
<script>
(function(){
  function esc(s){ return String(s==null?"":s).replace(/[&<>"]/g, function(m){ return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[m]; }); }
  function render(){
    var cfg = window.OFEK_CONFIG || {};
    var ch = (cfg.chapters && cfg.chapters.length) ? cfg.chapters : (window.OFEK_CHAPTERS || []);
    var last = ch[ch.length-1];
    var label = function(c){ return +c.num === 0 ? "מבוא" : "פרק " + c.num; };
    var mark = function(c){ return +c.num === 0 ? "◦" : esc(c.num); };
    document.getElementById("latestCard").innerHTML = last ?
      '<div class="num" aria-hidden="true">' + mark(last) + '</div>' +
      '<p class="label">הפרק החדש · ' + esc(label(last)) + '</p>' +
      '<h3>' + esc(last.title) + '</h3>' +
      '<p>' + esc(last.teaser) + '</p>' +
      '<p class="meta">' + esc([last.heDate, last.date].filter(Boolean).join(" · ")) + '</p>' +
      '<a class="btn primary" href="' + esc(last.url) + '" target="_blank" rel="noopener">לקריאת הפרק ↗</a>' : "";
    document.getElementById("chapterList").innerHTML = ch.map(function(c, i){
      return '<li><a href="' + esc(c.url) + '" target="_blank" rel="noopener">' +
        '<span class="n">' + mark(c) + '</span>' +
        '<span class="t">' + esc(c.title) + (i === ch.length-1 ? '<span class="new">חדש</span>' : '') +
        '<small>' + esc(c.teaser) + '</small></span>' +
        '<span class="d"><b>' + esc(c.heDate) + '</b>' + esc(c.date) + '</span></a></li>';
    }).join("");
    if (cfg.seriesUrl) document.getElementById("seriesLink").href = cfg.seriesUrl;
  }
  render();
  document.addEventListener("ofek:config", render);
})();
</script>
'''

# ---------------- info pages ----------------
def unavailable(sec, key):
    return f'''    <section class="wrap" data-section="{sec}" data-role="page" hidden>
      <div class="panel info unavailable" data-solid>
        <h2 data-t="{key}.closed.title">עוד לא פתוח</h2>
        <p data-t="{key}.closed.text">החלק הזה ייפתח בקרוב. בינתיים אפשר לקרוא את הספר ולחפש קבוצות כוכבים ברקע.</p>
      </div>
    </section>
'''

game_body = topbar("game") + '''  <header class="page-head wrap" data-solid>
    <h1 data-t="game.title">הדרך לכוכב הצפון</h1>
    <p class="lede" data-t="game.lede">לפני מצפן ולפני GPS, אנשים מצאו את הצפון בעזרת כוכב אחד קטן. במשחק הזה לומדים לעשות את זה בעצמכם.</p>
  </header>
  <main>
''' + unavailable("game", "game") + '''    <section class="wrap">
      <div class="panel info" data-solid>
        <h2 data-t="game.how.title">איך משחקים</h2>
        <ol class="steps">
          <li><b>1</b><span data-t="game.how.1">בכל רמה מופיעים שמי לילה, עם הכוכבים במקומם האמיתי.</span></li>
          <li><b>2</b><span data-t="game.how.2">מחפשים את קבוצת הכוכבים שהמשחק מבקש ולוחצים על הכוכבים שלה.</span></li>
          <li><b>3</b><span data-t="game.how.3">מקבוצה לקבוצה מתקדמים, עד שמוצאים את כוכב הצפון.</span></li>
        </ol>
        <p data-t="game.more">המשחק בנוי בפרקים, ופרקים חדשים נפתחים לאורך הזמן, כמו הספר. ההתקדמות נשמרת בדפדפן, אז אפשר להפסיק ולחזור.</p>
        <p class="note" data-t="game.note">אפשר לשחק במחשב ובטלפון.</p>
        <div class="cta"><a class="btn primary" href="/game/play/" data-section="game" data-gate><span data-t="game.cta">להתחיל לשחק</span></a></div>
      </div>
    </section>
  </main>
'''

globe_body = topbar("globe") + '''  <header class="page-head wrap" data-solid>
    <h1 data-t="globe.title">המבנה הכדורי</h1>
    <p class="lede" data-t="globe.lede">דמיינו כדור ענק שהשמיים מצוירים על הקירות שלו מבפנים. אפשר להיכנס פנימה וללכת בו מחדר לחדר.</p>
  </header>
  <main>
''' + unavailable("globe", "globe") + '''    <section class="wrap">
      <div class="panel info" data-solid>
        <h2 data-t="globe.what.title">מה יש בפנים</h2>
        <p data-t="globe.what.text">הכדור מחולק ל־89 חדרים, חדר לכל קבוצת כוכבים, לפי הגבולות שנהוגים היום באסטרונומיה. בכל חדר רואים את הכוכבים של הקבוצה במקומם האמיתי, ואפשר להציג קווים ביניהם ואת מישור המילקה.</p>
        <h2 data-t="globe.how.title">איך מטיילים</h2>
        <ol class="steps">
          <li><b>1</b><span data-t="globe.how.1">מבחוץ: גוררים כדי לסובב את הכדור, ולוחצים פעמיים על חדר כדי להיכנס אליו.</span></li>
          <li><b>2</b><span data-t="globe.how.2">בפנים: הולכים עם המקשים W A S D ומסתכלים מסביב עם העכבר.</span></li>
          <li><b>3</b><span data-t="globe.how.3">המפה הקטנה בפינה מראה איפה אתם בכדור, ואפשר לסובב בה את השעה.</span></li>
        </ol>
        <p class="note" data-t="globe.note">הכי נוח במחשב עם עכבר ומקלדת. הטעינה הראשונה לוקחת כמה שניות.</p>
        <div class="cta"><a class="btn primary" href="/globe/tour/" data-section="globe" data-gate><span data-t="globe.cta">להיכנס למבנה</span></a></div>
      </div>
    </section>
  </main>
'''

files = {
  "index.html": page("home", "אופק אפס", "אופק אפס: ספר בהמשכים על שמיים וכוכבים, משחק הדרך לכוכב הצפון, וסיור במבנה הכדורי.", home_body),
  "book/index.html": page("book", "אופק אפס · הספר", "כל פרקי הספר אופק אפס. פרק חדש בכל מוצאי שבת.", book_body, BOOK_SCRIPT),
  "game/index.html": page("game", "הדרך לכוכב הצפון · אופק אפס", "משחק שמלמד לזהות קבוצות כוכבים ולמצוא את כוכב הצפון.", game_body),
  "globe/index.html": page("globe", "המבנה הכדורי · אופק אפס", "סיור תלת־ממדי בתוך כדור השמיים, חדר לכל קבוצת כוכבים.", globe_body),
}
for path, html in files.items():
    full = os.path.join(ROOT, path)
    os.makedirs(os.path.dirname(full), exist_ok=True)
    open(full, "w", encoding="utf8").write(html)
    print("wrote", path)
