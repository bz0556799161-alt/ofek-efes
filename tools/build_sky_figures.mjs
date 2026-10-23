// Builds public/assets/sky-figures.js for "תפוס כוכב": every constellation figure (from the
// structure's own line data) plus well-known asterisms. Run: node tools/build_sky_figures.mjs
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

const root = path.join(path.dirname(new URL(import.meta.url).pathname), "..");
const ctx = { window: {} };
vm.createContext(ctx);
for (const f of ["public/globe/tour/js/data/boundaries.js", "public/globe/tour/js/data/stars.js"])
  vm.runInContext(fs.readFileSync(path.join(root, f), "utf8"), ctx);
const W = ctx.window;
const nameHe = Object.fromEntries(W.SPHERE_ROOMS.map((r) => [r.id, r.nameHe]));
const nameLa = Object.fromEntries(W.SPHERE_ROOMS.map((r) => [r.id, r.nameLatin]));

const r = (x, d) => Math.round(x * 10 ** d) / 10 ** d;
function sep(a, b) { // angular separation in degrees
  const ra1 = a[0] * 15 * Math.PI / 180, d1 = a[1] * Math.PI / 180, ra2 = b[0] * 15 * Math.PI / 180, d2 = b[1] * Math.PI / 180;
  const c = Math.sin(d1) * Math.sin(d2) + Math.cos(d1) * Math.cos(d2) * Math.cos(ra1 - ra2);
  return Math.acos(Math.max(-1, Math.min(1, c))) * 180 / Math.PI;
}
function fromSegments(segs) {
  const stars = [], lines = [];
  const idx = (p) => {
    for (let i = 0; i < stars.length; i++) if (sep(stars[i], p) < 0.25) return i;
    stars.push([r(p[0], 4), r(p[1], 3)]); return stars.length - 1;
  };
  for (const [ra1, d1, ra2, d2] of segs) {
    const a = idx([ra1, d1]), b = idx([ra2, d2]);
    if (a !== b && !lines.some(([x, y]) => (x === a && y === b) || (x === b && y === a))) lines.push([a, b]);
  }
  return { stars, lines };
}

const figures = [];
const LINES = Object.assign({}, W.SPHERE_ASTERISM_LINES);
// Triangulum Australe is missing from the structure's line data
LINES.TrA = [[16.811, -69.028, 15.919, -63.430], [15.919, -63.430, 15.315, -68.680], [15.315, -68.680, 16.811, -69.028]];
for (const id of Object.keys(LINES).sort()) {
  const f = fromSegments(LINES[id]);
  if (f.stars.length < 2) continue;
  figures.push({ id, name: nameHe[id] || id, latin: nameLa[id] || (id === "TrA" ? "Triangulum Australe" : id), kind: "c", stars: f.stars, lines: f.lines });
}

// asterisms: well-known shapes that are not whole constellations
const A = (id, name, stars, lines, note) => figures.push({ id, name, latin: "", kind: "a", stars, lines, note });
A("dipper", "העגלה הגדולה",
  [[11.062, 61.751], [11.031, 56.382], [11.897, 53.695], [12.257, 57.033], [12.900, 55.960], [13.399, 54.925], [13.792, 49.313]],
  [[0, 1], [1, 2], [2, 3], [3, 0], [3, 4], [4, 5], [5, 6]], "שבעה כוכבים בתוך הדובה הגדולה");
A("lildipper", "העגלה הקטנה",
  [[2.530, 89.264], [17.537, 86.586], [16.766, 82.037], [15.734, 77.794], [14.845, 74.155], [15.345, 71.834], [16.292, 75.755]],
  [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 3]], "הכוכב בקצה הידית הוא כוכב הצפון");
A("summer", "משולש הקיץ", [[18.616, 38.784], [20.690, 45.280], [19.846, 8.868]], [[0, 1], [1, 2], [2, 0]], "וגה, דנב ואלטאיר");
A("winter", "משולש החורף", [[5.919, 7.407], [7.655, 5.225], [6.752, -16.716]], [[0, 1], [1, 2], [2, 0]], "בטלג'וז, פרוקיון וסיריוס");
A("spring", "משולש האביב", [[14.261, 19.182], [13.420, -11.161], [10.140, 11.967]], [[0, 1], [1, 2], [2, 0]], "ארקטורוס, ספיקה ורגולוס");
A("hexagon", "משושה החורף",
  [[6.752, -16.716], [5.242, -8.202], [4.599, 16.509], [5.278, 45.998], [7.755, 28.026], [7.655, 5.225]],
  [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 0]], "שישה כוכבים בהירים סביב אוריון");
A("square", "הריבוע הגדול", [[23.079, 15.205], [23.063, 28.083], [0.140, 29.090], [0.221, 15.184]], [[0, 1], [1, 2], [2, 3], [3, 0]], "הגוף של פגסוס");
A("belt", "חגורת אוריון", [[5.679, -1.943], [5.604, -1.202], [5.533, -0.299]], [[0, 1], [1, 2]], "שלושה כוכבים בשורה");
A("pleiades", "כימה",
  [[3.791, 24.105], [3.819, 24.053], [3.748, 24.113], [3.763, 24.368], [3.773, 23.948], [3.749, 24.467]],
  [[5, 3], [3, 0], [0, 1], [1, 4], [4, 2], [2, 3]], "צביר קטן וצפוף");
A("teapot", "הקומקום",
  [[18.097, -30.424], [18.350, -29.828], [18.403, -34.385], [18.466, -25.421], [18.761, -26.991], [19.044, -29.880], [18.921, -26.297], [19.116, -27.671]],
  [[0, 1], [0, 2], [1, 2], [1, 3], [3, 4], [1, 4], [2, 5], [4, 5], [4, 6], [6, 7], [7, 5]], "בתוך הקשת");
A("cross", "הצלב הצפוני", [[20.690, 45.280], [20.370, 40.257], [19.512, 27.960], [19.750, 45.131], [20.770, 33.970]],
  [[0, 1], [1, 2], [3, 1], [1, 4]], "בתוך הברבור");
A("sickle", "המגל", [[10.140, 11.967], [10.122, 16.763], [10.333, 19.842], [10.278, 23.417], [9.879, 26.007], [9.764, 23.774]],
  [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5]], "הראש של האריה");
A("keystone", "אבן הראשה", [[17.005, 30.926], [16.688, 31.603], [16.714, 38.922], [17.251, 36.809]], [[0, 1], [1, 2], [2, 3], [3, 0]], "בתוך הרקולס");
A("kite", "העפיפון", [[14.261, 19.182], [14.750, 27.074], [15.258, 33.315], [15.032, 40.391], [14.535, 38.308], [14.530, 30.371]],
  [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 0]], "רועה הדובים");
A("hyades", "ה־V של השור", [[4.599, 16.509], [4.478, 15.871], [4.330, 15.628], [4.382, 17.543], [4.477, 19.180]],
  [[0, 1], [1, 2], [2, 3], [3, 4]], "הראש של השור");

// which figures appear from which level (1 = from the start)
const EASY = ["dipper", "lildipper", "summer", "winter", "spring", "belt", "pleiades", "square", "cross", "Ori", "Cas", "Cyg", "Leo", "Sco", "UMi", "Lyr", "CrB", "Del", "Sge", "Cru", "Tri", "Ari"];
const MID = ["hexagon", "teapot", "sickle", "keystone", "kite", "hyades", "Tau", "Gem", "Peg", "And", "Per", "Aur", "Boo", "Her", "Aql", "CMa", "CMi", "Cep", "UMa", "Crv", "Lep", "Vir", "Sgr", "Cnc", "Lib", "Cap", "Aqr", "Psc", "Oph", "Dra", "Col"];
figures.forEach((f) => { f.from = EASY.includes(f.id) ? 1 : MID.includes(f.id) ? 3 : 5; });

const out = "/* generated by tools/build_sky_figures.mjs — " + figures.length + " figures for תפוס כוכב: 88 constellations + asterisms. [ra hours, dec deg] */\n" +
  "window.SKY_FIGURES=" + JSON.stringify(figures) + ";\n";
fs.writeFileSync(path.join(root, "public/assets/sky-figures.js"), out);
console.log(figures.length, "figures,", figures.reduce((n, f) => n + f.stars.length, 0), "stars,", Math.round(out.length / 1024) + "KB");
