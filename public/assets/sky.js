/* =====================================================================
   משחק הכוכבים שברקע — "מצאו את הקבוצה"
   כל פעם מוצגת קבוצת כוכבים אחת בשמיים. לוחצים על כל הכוכבים שלה,
   ומקבלים 10 נקודות. אפשר להחליף קבוצה ולעבור בין שלבים.
   ===================================================================== */
(function () {
  "use strict";

  /* ---------- קבוצות הכוכבים (מיקום אמיתי בשמיים: שעות, מעלות) ---------- */
  const GROUPS = [
    { id: "ursa-major", name: "העגלה הגדולה",
      stars: [[11.06,61.75],[11.03,56.38],[11.90,53.69],[12.26,57.03],[12.90,55.96],[13.40,54.93],[13.79,49.31]],
      lines: [[0,1],[1,2],[2,3],[3,0],[3,4],[4,5],[5,6]] },
    { id: "ursa-minor", name: "העגלה הקטנה",
      note: "הכוכב בקצה הידית הוא כוכב הצפון",
      stars: [[2.53,89.26],[17.54,86.59],[16.77,82.04],[15.73,77.79],[14.85,74.16],[15.35,71.83],[16.29,75.76]],
      lines: [[0,1],[1,2],[2,3],[3,4],[4,5],[5,6],[6,3]] },
    { id: "orion", name: "כסיל",
      stars: [[5.59,9.93],[5.92,7.41],[5.42,6.35],[5.68,-1.94],[5.60,-1.20],[5.53,-0.30],[5.80,-9.67],[5.24,-8.20]],
      lines: [[0,1],[0,2],[1,3],[2,5],[5,4],[4,3],[3,6],[5,7]] },
    { id: "pleiades", name: "כימה",
      note: "צביר קטן וצפוף, נראה כמו ענן זעיר",
      stars: [[3.79,24.11],[3.82,24.05],[3.75,24.11],[3.76,24.37],[3.77,23.95],[3.75,24.47]],
      lines: [[5,3],[3,0],[0,1],[1,4],[4,2],[2,3]] },
    { id: "summer-triangle", name: "משולש הקיץ",
      stars: [[18.62,38.78],[20.69,45.28],[19.85,8.87]],
      lines: [[0,1],[1,2],[2,0]] },
    { id: "cygnus", name: "הברבור",
      stars: [[20.69,45.28],[20.37,40.26],[20.77,33.97],[19.75,45.13],[19.51,27.96]],
      lines: [[0,1],[1,4],[3,1],[1,2]] },
    { id: "w", name: "קבוצת ה־W",
      stars: [[0.15,59.15],[0.68,56.54],[0.95,60.72],[1.43,60.24],[1.91,63.67]],
      lines: [[0,1],[1,2],[2,3],[3,4]] },
    { id: "leo", name: "אריה",
      stars: [[10.14,11.97],[10.12,16.76],[10.33,19.84],[10.28,23.42],[9.88,26.01],[9.76,23.77],[11.24,20.52],[11.24,15.43],[11.82,14.57]],
      lines: [[0,1],[1,2],[2,3],[3,4],[4,5],[2,6],[6,8],[8,7],[7,0],[6,7]] },
    { id: "corona", name: "הכתר הצפוני",
      stars: [[15.55,31.36],[15.46,29.11],[15.58,26.71],[15.71,26.30],[15.83,26.07],[15.96,26.88],[16.02,29.85]],
      lines: [[0,1],[1,2],[2,3],[3,4],[4,5],[5,6]] },
    { id: "gemini", name: "תאומים",
      stars: [[7.58,31.89],[7.76,28.03],[6.73,25.13],[6.38,22.51],[7.34,21.98],[7.07,20.57],[6.63,16.40]],
      lines: [[0,1],[0,2],[2,3],[1,4],[4,5],[5,6]] },
    { id: "taurus", name: "שור",
      stars: [[4.60,16.51],[4.48,15.87],[4.33,15.63],[4.38,17.54],[4.48,19.18],[5.44,28.61],[5.63,21.14]],
      lines: [[6,0],[0,1],[1,2],[2,3],[3,4],[4,5]] },
    { id: "scorpius", name: "עקרב",
      stars: [[16.09,-19.81],[16.01,-22.62],[15.98,-26.11],[16.49,-26.43],[16.60,-28.22],[16.84,-34.29],[16.86,-38.05],[16.90,-42.36],[17.20,-43.24],[17.62,-43.00],[17.79,-40.13],[17.71,-39.03],[17.56,-37.10]],
      lines: [[0,1],[1,2],[1,3],[3,4],[4,5],[5,6],[6,7],[7,8],[8,9],[9,10],[10,11],[11,12]] }
  ];

  /* ---------- שלבים: כל 100 נקודות פותחות שלב חדש, עד 1,000 ---------- */
  const LEVELS = [
    { dim: 120, decoys: 4,  groupBoost: 1.0, rot: 0,    size: 0.44 },
    { dim: 170, decoys: 8,  groupBoost: 0.8, rot: 0,    size: 0.42 },
    { dim: 220, decoys: 12, groupBoost: 0.6, rot: 0,    size: 0.40 },
    { dim: 270, decoys: 16, groupBoost: 0.45,rot: 0,    size: 0.38 },
    { dim: 320, decoys: 22, groupBoost: 0.3, rot: 0.35, size: 0.36 },
    { dim: 370, decoys: 28, groupBoost: 0.2, rot: 0.5,  size: 0.34 },
    { dim: 420, decoys: 34, groupBoost: 0.1, rot: 0.75, size: 0.32 },
    { dim: 470, decoys: 40, groupBoost: 0,   rot: 1.0,  size: 0.30 },
    { dim: 520, decoys: 48, groupBoost: 0,   rot: 1.5,  size: 0.28 },
    { dim: 580, decoys: 56, groupBoost: 0,   rot: 3.14, size: 0.26 }
  ];
  const PER_LEVEL = 100, MAX_SCORE = 1000;
  let adminDevice = false;
  try { adminDevice = localStorage.getItem("ofek-admin-device") === "1"; } catch (e) {}
  // במכשיר של המנהל כל השלבים פתוחים, כדי לבדוק את רמות הקושי
  const unlockedLevel = () => adminDevice ? LEVELS.length - 1 : Math.min(LEVELS.length - 1, Math.floor(state.score / PER_LEVEL));

  const STORE_KEY = "ofek-sky-v2";
  const reduceMotion = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- מצב ---------- */
  const state = { score: 0, solved: 0, perfect: 0, level: 0, groupIdx: -1, recent: [] };
  try {
    const saved = JSON.parse(localStorage.getItem(STORE_KEY) || "null");
    if (saved) Object.assign(state, { score: Math.min(MAX_SCORE, saved.score | 0), solved: saved.solved | 0, perfect: saved.perfect | 0, level: saved.level | 0 });
    state.level = Math.min(state.level, LEVELS.length - 1);
  } catch (e) {}
  function save() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify({ score: state.score, solved: state.solved, perfect: state.perfect, level: state.level })); } catch (e) {}
  }

  if (!adminDevice) state.level = Math.min(state.level, unlockedLevel());

  /* ---------- קנבס ---------- */
  const canvas = document.getElementById("sky");
  const ctx = canvas.getContext("2d");
  const dimLayer = document.createElement("canvas");
  const dctx = dimLayer.getContext("2d");
  let W = 0, H = 0, DPR = 1;

  let dimStars = [];   // רקע שאי אפשר ללחוץ עליו
  let brights = [];    // כוכבים בהירים: חלק מהקבוצה + כוכבי הסחה
  let group = null;    // { def, pts:[{x,y,found}], done }
  let marks = [];      // אפקטים קצרים: טבעות, החטאות, +10
  let meteor = null, nextMeteor = performance.now() + 9000;
  let completeAt = 0;

  function rand(a, b) { return a + Math.random() * (b - a); }

  /* הקרנה מכדור השמיים למישור, כפי שרואים מלמטה (מזרח משמאל) */
  function project(stars) {
    const v = stars.map(([raH, dec]) => {
      const ra = raH * 15 * Math.PI / 180, d = dec * Math.PI / 180;
      return [Math.cos(d) * Math.cos(ra), Math.cos(d) * Math.sin(ra), Math.sin(d)];
    });
    let c = v.reduce((s, p) => [s[0] + p[0], s[1] + p[1], s[2] + p[2]], [0, 0, 0]);
    const L = Math.hypot(c[0], c[1], c[2]); c = c.map(x => x / L);
    const ra0 = Math.atan2(c[1], c[0]), dec0 = Math.asin(c[2]);
    const e = [-Math.sin(ra0), Math.cos(ra0), 0];
    const n = [-Math.sin(dec0) * Math.cos(ra0), -Math.sin(dec0) * Math.sin(ra0), Math.cos(dec0)];
    const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    return v.map(p => { const k = dot(p, c); return [-dot(p, e) / k, -dot(p, n) / k]; });
  }

  /* אזורים בעמוד שמסתירים את השמיים (כרטיסים, כותרת, לוח הניקוד) */
  function solidRects() {
    const out = [];
    document.querySelectorAll("[data-solid]").forEach(el => {
      if (document.body.classList.contains("sky-only") && !el.closest(".hud")) return;
      const r = el.getBoundingClientRect();
      if (r.width && r.height && r.bottom > 0 && r.top < H) out.push(r);
    });
    return out;
  }

  function paintDim() {
    dimLayer.width = W * DPR; dimLayer.height = H * DPR;
    dctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    dctx.clearRect(0, 0, W, H);
    // שביל עמום של אור, לאורך האלכסון
    const g = dctx.createLinearGradient(0, H * 0.85, W, H * 0.15);
    g.addColorStop(0, "rgba(90,150,158,0)"); g.addColorStop(0.5, "rgba(90,150,158,0.06)"); g.addColorStop(1, "rgba(90,150,158,0)");
    dctx.fillStyle = g; dctx.fillRect(0, 0, W, H);
    for (const s of dimStars) {
      dctx.globalAlpha = s.a; dctx.fillStyle = "#e2ecec";
      dctx.beginPath(); dctx.arc(s.x, s.y, s.r, 0, Math.PI * 2); dctx.fill();
    }
    dctx.globalAlpha = 1;
  }

  /* ---------- שמירת המצב בין דפים: אותם שמיים, אותה קבוצה, אותם כוכבים שנמצאו ---------- */
  const SCENE_KEY = "ofek-sky-scene-v1";
  const r4 = (n) => Math.round(n * 10000) / 10000;
  function snapshot() {
    if (!group || !W || !H) return null;
    return {
      t: Date.now(), level: state.level, groupIdx: state.groupIdx, recent: state.recent,
      misses: group.misses, done: group.done,
      pts: group.pts.map(p => [r4(p.x / W), r4(p.y / H), p.found ? 1 : 0]),
      dim: dimStars.map(d => [r4(d.x / W), r4(d.y / H), r4(d.r), r4(d.a)]),
      br: brights.map(b => [r4(b.x / W), r4(b.y / H), r4(b.r), r4(b.ph), b.g])
    };
  }
  function persist() {
    const snap = snapshot();
    if (!snap) return;
    const txt = JSON.stringify(snap);
    try { sessionStorage.setItem(SCENE_KEY, txt); } catch (e) {}
    try { localStorage.setItem(SCENE_KEY, txt); } catch (e) {}
  }
  function readSaved() {
    let txt = null;
    try { txt = sessionStorage.getItem(SCENE_KEY); } catch (e) {}
    if (!txt) try { txt = localStorage.getItem(SCENE_KEY); } catch (e) {}
    try { return txt ? JSON.parse(txt) : null; } catch (e) { return null; }
  }
  function restore(snap) {
    if (!snap || !GROUPS[snap.groupIdx] || !Array.isArray(snap.pts) || snap.pts.length !== GROUPS[snap.groupIdx].stars.length) return false;
    state.groupIdx = snap.groupIdx;
    if (Array.isArray(snap.recent)) state.recent = snap.recent.slice(-5);
    dimStars = snap.dim.map(d => ({ x: d[0] * W, y: d[1] * H, r: d[2], a: d[3] }));
    paintDim();
    group = {
      def: GROUPS[snap.groupIdx],
      pts: snap.pts.map(p => ({ x: p[0] * W, y: p[1] * H, found: !!p[2] })),
      done: !!snap.done, misses: snap.misses | 0
    };
    brights = snap.br.map(b => ({ x: b[0] * W, y: b[1] * H, r: b[2], ph: b[3], g: b[4] }));
    updateHud();
    return true;
  }
  window.addEventListener("pagehide", persist);
  document.addEventListener("visibilitychange", () => { if (document.hidden) persist(); });

  function buildScene(keepGroup) {
    const lv = LEVELS[state.level];
    const area = (W * H) / (1280 * 800);

    // כוכבים עמומים
    dimStars = [];
    const nDim = Math.round(lv.dim * Math.max(0.45, area));
    for (let i = 0; i < nDim; i++) {
      dimStars.push({ x: Math.random() * W, y: Math.random() * H, r: Math.pow(Math.random(), 2.2) * 1.1 + 0.35, a: rand(0.18, 0.62) });
    }
    paintDim();

    // בחירת קבוצה
    if (!keepGroup || state.groupIdx < 0) pickGroup();
    const def = GROUPS[state.groupIdx];
    let pts = project(def.stars);
    if (lv.rot) {
      const t = rand(-lv.rot, lv.rot), cs = Math.cos(t), sn = Math.sin(t);
      pts = pts.map(([x, y]) => [x * cs - y * sn, x * sn + y * cs]);
    }
    const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
    const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
    const span = Math.max(maxX - minX, maxY - minY) || 1;
    let scale = (Math.min(W, H) * lv.size) / span;
    // מרחק מינימלי בין כוכבים כדי שאפשר יהיה ללחוץ על כל אחד
    let minD = Infinity;
    for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++)
      minD = Math.min(minD, Math.hypot(pts[i][0] - pts[j][0], pts[i][1] - pts[j][1]));
    scale = Math.max(scale, 30 / minD);
    scale = Math.min(scale, (Math.min(W, H) * 0.7) / span);
    let bw = (maxX - minX) * scale, bh = (maxY - minY) * scale;

    // מיקום: מחפשים מקום פנוי שלא מוסתר ע"י תוכן
    const rects = solidRects(), pad = 28;
    let best = null;
    // מחפשים מקום פנוי; אם אין, מקטינים מעט את הקבוצה ומנסים שוב
    for (let shrink = 0; shrink < 4; shrink++) {
    if (shrink) { scale *= 0.84; bw = (maxX - minX) * scale; bh = (maxY - minY) * scale; best = null; }
    for (let tries = 0; tries < 80; tries++) {
      const ox = rand(pad, Math.max(pad, W - bw - pad));
      const oy = rand(pad + 10, Math.max(pad + 10, H - bh - pad));
      const box = { l: ox - 18, t: oy - 18, r: ox + bw + 18, b: oy + bh + 18 };
      let overlap = 0;
      for (const r of rects) {
        const ix = Math.max(0, Math.min(box.r, r.right) - Math.max(box.l, r.left));
        const iy = Math.max(0, Math.min(box.b, r.bottom) - Math.max(box.t, r.top));
        overlap += ix * iy;
      }
      if (!best || overlap < best.overlap) best = { ox, oy, overlap };
      if (overlap === 0) break;
    }
    if (best.overlap === 0) break;
    }
    const prevFound = keepGroup && group && group.def === def ? group.pts.map(p => p.found) : null;
    group = {
      def,
      pts: pts.map(([x, y], i) => ({ x: best.ox + (x - minX) * scale, y: best.oy + (y - minY) * scale, found: prevFound ? prevFound[i] : false })),
      done: false,
      misses: prevFound ? (group.misses || 0) : 0
    };
    if (prevFound && prevFound.every(Boolean)) group.done = true;

    // כוכבים בהירים: הקבוצה + כוכבי הסחה בגודל דומה
    brights = group.pts.map((p, i) => ({ x: p.x, y: p.y, r: 2.1 + lv.groupBoost * 1.1 + (i % 3) * 0.25, ph: Math.random() * 6.28, g: i }));
    const nDecoy = Math.round(lv.decoys * Math.max(0.55, area));
    let guard = 0;
    while (brights.length < group.pts.length + nDecoy && guard++ < 3000) {
      const x = Math.random() * W, y = Math.random() * H;
      if (group.pts.some(p => Math.hypot(p.x - x, p.y - y) < 46)) continue;
      if (brights.some(b => Math.hypot(b.x - x, b.y - y) < 30)) continue;
      brights.push({ x, y, r: rand(1.5, 2.1 + lv.groupBoost * 0.2 + (state.level >= 2 ? 0.9 : 0)), ph: Math.random() * 6.28, g: -1 });
    }
    updateHud();
    persist();
  }

  function pickGroup() {
    let idx, guard = 0;
    do { idx = Math.floor(Math.random() * GROUPS.length); }
    while ((idx === state.groupIdx || state.recent.includes(idx)) && guard++ < 50);
    state.groupIdx = idx;
    state.recent.push(idx); if (state.recent.length > 5) state.recent.shift();
  }

  /* ---------- ציור ---------- */
  function draw(now) {
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.drawImage(dimLayer, 0, 0, W, H);

    // קווי הקבוצה בין כוכבים שנמצאו
    if (group) {
      ctx.lineCap = "round";
      for (const [a, b] of group.def.lines) {
        const A = group.pts[a], B = group.pts[b];
        if (!(A.found && B.found)) continue;
        ctx.strokeStyle = group.done ? "rgba(214,180,108,.75)" : "rgba(143,180,185,.55)";
        ctx.lineWidth = group.done ? 1.6 : 1.2;
        ctx.beginPath(); ctx.moveTo(A.x, A.y); ctx.lineTo(B.x, B.y); ctx.stroke();
      }
    }

    // כוכבים בהירים
    for (const s of brights) {
      const tw = reduceMotion ? 1 : 0.78 + 0.22 * Math.sin(now / 900 + s.ph);
      const found = s.g >= 0 && group.pts[s.g].found;
      const r = s.r * (found ? 1.25 : 1);
      const glow = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, r * 5);
      glow.addColorStop(0, found ? "rgba(244,226,180,.55)" : `rgba(205,228,230,${0.32 * tw})`);
      glow.addColorStop(1, "rgba(205,228,230,0)");
      ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(s.x, s.y, r * 5, 0, 6.283); ctx.fill();
      ctx.fillStyle = found ? "#f4e3b8" : `rgba(242,248,248,${0.75 + 0.25 * tw})`;
      ctx.beginPath(); ctx.arc(s.x, s.y, r, 0, 6.283); ctx.fill();
      if (found) {
        ctx.strokeStyle = "rgba(214,180,108,.85)"; ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.arc(s.x, s.y, r + 6, 0, 6.283); ctx.stroke();
      }
    }

    // שם הקבוצה אחרי שהושלמה
    if (group && group.done) {
      const cx = group.pts.reduce((s, p) => s + p.x, 0) / group.pts.length;
      const top = Math.min(...group.pts.map(p => p.y));
      const a = Math.min(1, (now - completeAt) / 600);
      ctx.globalAlpha = a;
      ctx.font = "600 20px " + (getComputedStyle(document.documentElement).getPropertyValue("--display").trim() || "serif");
      ctx.textAlign = "center"; ctx.fillStyle = "#d6b46c";
      ctx.fillText(group.def.name, cx, Math.max(24, top - 22));
      ctx.globalAlpha = 1;
    }

    // אפקטים
    marks = marks.filter(m => now - m.t < m.life);
    for (const m of marks) {
      const k = (now - m.t) / m.life;
      if (m.type === "ring") {
        ctx.strokeStyle = `rgba(214,180,108,${1 - k})`; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(m.x, m.y, 6 + k * 26, 0, 6.283); ctx.stroke();
      } else if (m.type === "miss") {
        ctx.strokeStyle = `rgba(143,180,185,${0.45 * (1 - k)})`; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(m.x, m.y, 4 + k * 14, 0, 6.283); ctx.stroke();
      } else if (m.type === "plus") {
        ctx.globalAlpha = 1 - k;
        ctx.font = "700 22px " + (getComputedStyle(document.documentElement).getPropertyValue("--body").trim() || "sans-serif"); ctx.textAlign = "center"; ctx.fillStyle = "#d6b46c";
        ctx.fillText(m.text || "+10", m.x, m.y - k * 40);
        ctx.globalAlpha = 1;
      }
    }

    // כוכב נופל, מדי פעם
    if (!reduceMotion) {
      if (!meteor && now > nextMeteor) {
        meteor = { x: rand(W * 0.2, W), y: rand(0, H * 0.4), t: now, dx: -rand(260, 420), dy: rand(120, 220) };
      }
      if (meteor) {
        const k = (now - meteor.t) / 900;
        if (k >= 1) { meteor = null; nextMeteor = now + rand(10000, 20000); }
        else {
          const x = meteor.x + meteor.dx * k, y = meteor.y + meteor.dy * k;
          const gr = ctx.createLinearGradient(x, y, x - meteor.dx * 0.18, y - meteor.dy * 0.18);
          gr.addColorStop(0, `rgba(255,255,255,${0.8 * Math.sin(k * Math.PI)})`); gr.addColorStop(1, "rgba(255,255,255,0)");
          ctx.strokeStyle = gr; ctx.lineWidth = 1.4;
          ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - meteor.dx * 0.18, y - meteor.dy * 0.18); ctx.stroke();
        }
      }
    }
  }

  let raf = 0;
  function loop(now) { draw(now); raf = requestAnimationFrame(loop); }
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) cancelAnimationFrame(raf); else raf = requestAnimationFrame(loop);
  });

  /* ---------- לחיצות ---------- */
  canvas.addEventListener("pointerdown", ev => {
    if (!group) return;
    const x = ev.clientX, y = ev.clientY;
    const radius = ev.pointerType === "touch" ? 30 : 22;
    let hit = null, hd = Infinity;
    for (const s of brights) {
      const d = Math.hypot(s.x - x, s.y - y);
      if (d < radius && d < hd) { hd = d; hit = s; }
    }
    const now = performance.now();
    if (hit && hit.g >= 0 && !group.done) {
      const p = group.pts[hit.g];
      if (!p.found) {
        p.found = true;
        marks.push({ type: "ring", x: p.x, y: p.y, t: now, life: 700 });
        if (group.pts.every(q => q.found)) complete(now);
        updateHud();
        persist();
      }
    } else if (!group.done && !(hit && hit.g >= 0)) {
      group.misses++;
      marks.push({ type: "miss", x, y, t: now, life: 600 });
      updateHud();
      persist();
    }
  });

  let nextTimer = 0, lastPts = null, toastTimer = 0;
  function toast(msg) {
    const el = document.getElementById("hudToast");
    if (!el) return;
    el.textContent = msg; el.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(() => { el.hidden = true; }, 3600);
  }
  function complete(now) {
    group.done = true; completeAt = now;
    const hits = group.pts.length;
    const pts = Math.round(10 * hits / (hits + group.misses));   // 10 רק בלי אף טעות
    const before = unlockedLevel();
    state.score = Math.min(MAX_SCORE, state.score + pts); state.solved += 1;
    if (group.misses === 0) state.perfect += 1;
    const after = unlockedLevel();
    if (after > before && state.level === before) state.level = after;   // עולים שלב אוטומטית
    save();
    lastPts = pts;
    if (window.ofekTrack) ofekTrack("sky", { lvl: state.level + 1, pts: pts, misses: group.misses, score: state.score, group: group.def.id });
    if (after > before) toast(state.score >= MAX_SCORE ? "הגעת ל־1,000 נקודות! כל השלבים פתוחים." : "עלית לשלב " + (after + 1) + "!");
    else if (state.score >= MAX_SCORE && before === LEVELS.length - 1 && state.score - pts < MAX_SCORE) toast("הגעת ל־1,000 נקודות!");
    const cx = group.pts.reduce((s, p) => s + p.x, 0) / group.pts.length;
    const cy = group.pts.reduce((s, p) => s + p.y, 0) / group.pts.length;
    marks.push({ type: "plus", x: cx, y: cy, t: now, life: 1400, text: "+" + pts });
    hud.classList.add("won");
    setTimeout(() => hud.classList.remove("won"), 1200);
    clearTimeout(nextTimer);
    nextTimer = setTimeout(() => { buildScene(false); }, 3200);
  }

  /* ---------- לוח הניקוד ---------- */
  const hud = document.getElementById("hud");
  const elName = document.getElementById("hudName");
  const elProg = document.getElementById("hudProgress");
  const elScore = document.getElementById("hudScore");
  const elLevel = document.getElementById("hudLevel");
  const elNote = document.getElementById("hudNote");
  const mini = document.getElementById("hudShape");
  const mctx = mini.getContext("2d");

  const elLvBar = document.getElementById("hudLvBar");
  const elLvText = document.getElementById("hudLvText");
  function updateHud() {
    if (!group) return;
    const found = group.pts.filter(p => p.found).length;
    elName.textContent = group.def.name;
    if (group.done) elProg.textContent = lastPts === 10 ? "בלי אף טעות! ‎+10" : "נמצאה! ‎+" + lastPts;
    else elProg.textContent = found + " מתוך " + group.pts.length + (group.misses ? " · " + group.misses + " החטאות" : "");
    elScore.textContent = state.score.toLocaleString("he-IL");
    elLevel.textContent = "שלב " + (state.level + 1);
    const top = unlockedLevel();
    elLevel.title = adminDevice ? "מצב מנהל: כל השלבים פתוחים" : "פתוחים: שלבים 1–" + (top + 1);
    elNote.textContent = group.def.note || (group.misses ? "" : "10 נקודות אם אין אף לחיצה מיותרת");
    if (adminDevice) { elLvText.textContent = "מצב מנהל: אפשר לעבור בין כל 10 השלבים"; elLvBar.style.width = Math.min(100, state.score % PER_LEVEL) + "%"; }
    else if (state.score >= MAX_SCORE) { elLvText.textContent = "1,000 · כל השלבים פתוחים"; elLvBar.style.width = "100%"; }
    else {
      const into = state.score % PER_LEVEL;
      elLvText.textContent = "עוד " + (PER_LEVEL - into) + " נק׳ לשלב " + (top + 2 > LEVELS.length ? LEVELS.length : top + 2);
      elLvBar.style.width = into + "%";
    }
    document.getElementById("lvPrev").disabled = state.level === 0;
    document.getElementById("lvNext").disabled = state.level >= top;
    drawMini();
  }

  function drawMini() {
    const S = 64, d = window.devicePixelRatio || 1;
    mini.width = S * d; mini.height = S * d;
    mctx.setTransform(d, 0, 0, d, 0, 0);
    mctx.clearRect(0, 0, S, S);
    // הצורה המקורית (בלי סיבוב), כדי לעזור לזהות
    const pts = project(group.def.stars);
    const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
    const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
    const span = Math.max(maxX - minX, maxY - minY) || 1, k = (S - 16) / span;
    const ox = (S - (maxX - minX) * k) / 2, oy = (S - (maxY - minY) * k) / 2;
    const P = pts.map(([x, y]) => [ox + (x - minX) * k, oy + (y - minY) * k]);
    mctx.strokeStyle = "rgba(143,180,185,.5)"; mctx.lineWidth = 1;
    for (const [a, b] of group.def.lines) { mctx.beginPath(); mctx.moveTo(...P[a]); mctx.lineTo(...P[b]); mctx.stroke(); }
    P.forEach((p, i) => {
      mctx.fillStyle = group.pts[i] && group.pts[i].found ? "#d6b46c" : "#e8eeee";
      mctx.beginPath(); mctx.arc(p[0], p[1], 2.2, 0, 6.283); mctx.fill();
    });
  }

  document.getElementById("btnSwap").addEventListener("click", () => { clearTimeout(nextTimer); buildScene(false); });
  document.getElementById("lvPrev").addEventListener("click", () => { if (state.level > 0) { state.level--; save(); clearTimeout(nextTimer); buildScene(false); } });
  document.getElementById("lvNext").addEventListener("click", () => { if (state.level < unlockedLevel()) { state.level++; save(); clearTimeout(nextTimer); buildScene(false); } });
  document.getElementById("btnHint").addEventListener("click", () => {
    if (!group || group.done) return;
    const p = group.pts.find(q => !q.found);
    if (p) { group.misses++; marks.push({ type: "ring", x: p.x, y: p.y, t: performance.now(), life: 1600 }); updateHud(); persist(); }
  });
  const btnSky = document.getElementById("btnSkyOnly");
  btnSky.addEventListener("click", () => {
    const on = document.body.classList.toggle("sky-only");
    btnSky.setAttribute("aria-pressed", on ? "true" : "false");
    btnSky.textContent = on ? "החזר את העמוד" : "רק שמיים";
  });
  const btnFold = document.getElementById("hudFold");
  function setFolded(folded) {
    hud.classList.toggle("folded", folded);
    btnFold.setAttribute("aria-expanded", folded ? "false" : "true");
    btnFold.title = folded ? "פתח את לוח המשחק" : "הקטן את לוח המשחק";
    requestAnimationFrame(clampHud);
  }

  /* ---------- לוח צף: אפשר לגרור אותו לכל מקום במסך ---------- */
  const HUD_POS = "ofek-hud-pos";
  function placeHud(x, y) {
    const r = hud.getBoundingClientRect();
    x = Math.max(6, Math.min(window.innerWidth - r.width - 6, x));
    y = Math.max(6, Math.min(window.innerHeight - r.height - 6, y));
    hud.style.left = x + "px"; hud.style.top = y + "px"; hud.style.bottom = "auto"; hud.style.right = "auto";
  }
  function clampHud() {
    if (!hud.style.top) return;
    const r = hud.getBoundingClientRect();
    placeHud(r.left, r.top);
  }
  try {
    const pos = JSON.parse(localStorage.getItem(HUD_POS) || "null");
    if (pos) requestAnimationFrame(() => placeHud(pos.x * window.innerWidth, pos.y * window.innerHeight));
  } catch (e) {}
  let drag = null;
  hud.addEventListener("pointerdown", (e) => {
    if (e.target.closest("button")) return;
    const r = hud.getBoundingClientRect();
    drag = { dx: e.clientX - r.left, dy: e.clientY - r.top, moved: false };
    try { hud.setPointerCapture(e.pointerId); } catch (err) {}
  });
  hud.addEventListener("pointermove", (e) => {
    if (!drag) return;
    drag.moved = true; hud.classList.add("dragging");
    placeHud(e.clientX - drag.dx, e.clientY - drag.dy);
  });
  function endDrag() {
    if (!drag) return;
    hud.classList.remove("dragging");
    if (drag.moved) {
      const r = hud.getBoundingClientRect();
      try { localStorage.setItem(HUD_POS, JSON.stringify({ x: r.left / window.innerWidth, y: r.top / window.innerHeight })); } catch (e) {}
    }
    drag = null;
  }
  hud.addEventListener("pointerup", endDrag);
  hud.addEventListener("pointercancel", endDrag);
  window.addEventListener("resize", clampHud);
  let foldPref = null;
  try { foldPref = localStorage.getItem("ofek-hud-folded"); } catch (e) {}
  setFolded(foldPref === null ? true : foldPref === "1");   // בפעם הראשונה הלוח מוקטן
  btnFold.addEventListener("click", () => {
    const folded = !hud.classList.contains("folded");
    setFolded(folded);
    try { localStorage.setItem("ofek-hud-folded", folded ? "1" : "0"); } catch (e) {}
  });

  /* ---------- גודל מסך ---------- */
  function resize(keep) {
    const snap = keep ? snapshot() : null;   // המיקומים נשמרים יחסית לגודל המסך
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth; H = window.innerHeight;
    canvas.width = W * DPR; canvas.height = H * DPR;
    canvas.style.width = W + "px"; canvas.style.height = H + "px";
    if (snap && restore(snap)) { persist(); return; }
    buildScene(false);
  }
  let rt = 0, lastW = 0;
  window.addEventListener("resize", () => {
    clearTimeout(rt);
    rt = setTimeout(() => {
      // בטלפון, גלילה משנה מעט את הגובה; לא בונים מחדש בגלל זה
      if (Math.abs(window.innerWidth - lastW) < 2 && Math.abs(window.innerHeight - H) < 140) return;
      lastW = window.innerWidth; resize(true);
    }, 200);
  });

  function start() {
    const saved = readSaved();   // נקרא לפני שבונים שמיים חדשים, כי הבנייה שומרת מעליו
    lastW = window.innerWidth;
    resize(false);
    // ממשיכים בדיוק מאיפה שהפסיקו בדף הקודם
    if (saved && !saved.done && saved.level === state.level && Date.now() - saved.t < 12 * 3600e3) restore(saved);
    persist();
    raf = requestAnimationFrame(loop);
  }
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(start); else start();
})();
