(() => {
"use strict";
const API_BASE = /\.github\.io$/i.test(location.hostname) || location.protocol === "file:" ? "https://neuron-game.sites.tab.bot" : ""; // live game server
const $ = (s) => document.querySelector(s);
const SVGNS = "http://www.w3.org/2000/svg";
const KEY = "neuron-game-v1";
const GATES_PER_MSG = 7, MSGS = 3;

// ---------- state ----------
let S = load() || {};
function load() { try { return JSON.parse(localStorage.getItem(KEY) || "null"); } catch { return null; } }
function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch {} }
function fresh(code, id, tok, name) {
  S = { code, id, tok, name, stage: 0, prog: 0, pts: 0, base: 0, t2: null, t3: null, a2: null, a3: null, done: 0, phase: "wait" };
  save();
}
let dirty = true, status = "lobby", pollTimer = null, ended = false;

function show(id) {
  document.querySelectorAll("main > section").forEach((s) => { s.hidden = s.id !== id; });
  window.scrollTo(0, 0);
}
function setPts(p) {
  S.pts = Math.max(0, Math.round(p)); $("#ptsVal").textContent = S.pts; dirty = true; save();
}
function addPts(d) { setPts(S.pts + d); }
function setProg(stage, prog) { S.stage = stage; S.prog = Math.round(prog); dirty = true; save(); }

async function post(path, body) {
  const r = await fetch(API_BASE + path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  let j = {}; try { j = await r.json(); } catch {}
  if (!r.ok) { const e = new Error(j.error || "משהו השתבש, נסו שוב"); e.status = r.status; throw e; }
  return j;
}

// ---------- join ----------
const params = new URLSearchParams(location.search);
const urlCode = (params.get("code") || "").replace(/\D/g, "").slice(0, 4);
if (urlCode) $("#code").value = urlCode;
$("#code").addEventListener("input", (e) => { e.target.value = e.target.value.replace(/\D/g, "").slice(0, 4); });

$("#joinForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const code = $("#code").value.trim(), name = $("#name").value.trim();
  const err = $("#joinErr");
  if (!/^\d{4}$/.test(code)) { err.textContent = "קוד הכיתה הוא 4 ספרות"; return; }
  if (!name) { err.textContent = "כתבו את השם הפרטי"; return; }
  err.textContent = ""; $("#joinBtn").disabled = true;
  try {
    const j = await post("/api/join", { code, name });
    fresh(code, j.id, j.tok, j.name);
    status = j.status;
    enterGame();
  } catch (ex) { err.textContent = ex.message; }
  finally { $("#joinBtn").disabled = false; }
});

function enterGame() {
  $("#ptsChip").hidden = false; $("#whoName").textContent = S.name; $("#ptsVal").textContent = S.pts || 0;
  $("#waitName").textContent = S.name;
  dirty = true;
  route();
  startPolling();
}

// decide what to show from state + room status
function route() {
  if (status === "ended" && !ended) { ended = true; stopAll(); showEnd(true); return; }
  if (S.done) { showEnd(false); return; }
  if (status !== "playing") { show("scr-wait"); return; }
  if (S.phase === "wait" || !S.stage) { S.stage = 1; S.phase = "intro"; S.base = S.pts; save(); }
  if (S.phase === "intro" || S.phase === "play") { // a refresh mid-stage restarts that stage
    setPts(S.base || 0); intro(S.stage);
  } else if (S.phase === "result") { showStageResult(S.stage); }
}

function startPolling() {
  if (pollTimer) return;
  const tick = async () => {
    try {
      const body = { code: S.code, id: S.id, tok: S.tok };
      if (dirty) body.st = { stage: S.done ? 4 : S.stage, prog: S.prog, pts: S.pts, t2: S.t2, t3: S.t3, a2: S.a2, a3: S.a3, done: S.done };
      const sent = dirty; dirty = false;
      const j = await post("/api/report", body);
      const prev = status; status = j.status;
      if (prev !== status) {
        if (status === "playing" && $("#scr-wait").hidden === false) route();
        if (status === "ended") route();
      }
      void sent;
    } catch (ex) {
      dirty = true;
      if (ex.status === 404) { // removed by teacher or room gone
        localStorage.removeItem(KEY); stopAll(); clearTimeout(pollTimer); pollTimer = null;
        $("#ptsChip").hidden = true; show("scr-join"); $("#joinErr").textContent = "יצאתם מהמשחק. אפשר להצטרף שוב."; return;
      }
    }
    pollTimer = setTimeout(tick, 1700 + Math.random() * 600);
  };
  pollTimer = setTimeout(tick, 50);
}

// ---------- intros ----------
const INTRO = {
  1: { emoji: "🧩", title: "בנו את הנוירון", text: "גררו כל חלק למקום שלו.", text2: "טעות מורידה קצת נקודות. מהירות מוסיפה." },
  2: { emoji: "⚡", title: "שלחו את המסר", text: "הקישו כשהדחף מגיע לנקודה הזוהרת.", text2: "המסר נע בכיוון אחד בלבד: מהדנדריטים אל השריר." },
  3: { emoji: "🩹", title: "מיאלין פגוע", text: "אותו מסלול, אבל המיאלין פגוע.", text2: "שימו לב מה קורה לדחף." },
};
function intro(n) {
  S.phase = "intro"; S.stage = n; S.base = S.pts; save(); setProg(n, 0);
  const d = INTRO[n];
  $("#introTag").textContent = `שלב ${n} מתוך 3`; $("#introEmoji").textContent = d.emoji;
  $("#introTitle").textContent = d.title; $("#introText").textContent = d.text; $("#introText2").textContent = d.text2;
  show("scr-intro");
  $("#introGo").onclick = () => {
    S.phase = "play"; save();
    if (n === 1) stage1(); else runStage(n);
  };
}

// ---------- stage 1 ----------
const PARTS = [
  { key: "dend", label: "דנדריטים", role: "דנדריטים קולטים את המסר מתאים אחרים.", zone: [352, 212], tip: [370, 160] },
  { key: "body", label: "גוף התא + גרעין", role: "גוף התא מעבד את המידע, ובו נמצא הגרעין.", zone: [316, 34], tip: [316, 82] },
  { key: "axon", label: "אקסון", role: "האקסון מוביל את הדחף החשמלי הלאה.", zone: [262, 212], tip: [270, 116] },
  { key: "myel", label: "מעטפת מיאלין", role: "מעטפת המיאלין מבודדת ומאיצה את הדחף.", zone: [176, 34], tip: [176, 98] },
  { key: "term", label: "סיומות עצב (סינפסה)", role: "בסינפסה המסר עובר לתא הבא בעזרת חומרים כימיים (מוליכים עצביים).", zone: [56, 212], tip: [34, 150] },
];
function el(tag, attrs = {}, parent) {
  const e = document.createElementNS(SVGNS, tag);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(e);
  return e;
}
function neuronSVG() {
  const svg = el("svg", { viewBox: "0 0 400 250", role: "img", "aria-label": "שרטוט נוירון לבנייה" });
  const g = (k) => el("g", { class: "part", "data-part": k }, svg);
  const gd = g("dend");
  el("path", { d: "M300 98 L345 62 L378 40 M345 62 L372 70 M352 56 L362 22 M302 122 L346 152 L380 168 M346 152 L372 142 M350 155 L356 192 M306 110 L360 110 L388 104" }, gd);
  const ga = g("axon");
  el("path", { d: "M292 110 L72 110" }, ga);
  const gm = g("myel");
  [[208, 250], [154, 196], [100, 142]].forEach(([a, b]) => el("rect", { x: a, y: 98, width: b - a, height: 24, rx: 11 }, gm));
  const gt = g("term");
  el("path", { d: "M72 110 L52 86 M72 110 L40 112 M72 110 L52 136 M52 86 L36 78 M52 136 L36 146" }, gt);
  [[34, 77], [36, 147], [38, 112], [52, 86], [52, 136]].slice(0, 3).forEach(([x, y]) => el("circle", { class: "bulb", cx: x, cy: y, r: 7 }, gt));
  const gb = g("body");
  el("circle", { class: "body", cx: 316, cy: 110, r: 30 }, gb);
  el("circle", { class: "nuc", cx: 318, cy: 110, r: 11 }, gb);
  PARTS.forEach((p, i) => {
    const z = el("g", { class: "zone", "data-zone": p.key }, svg);
    el("line", { x1: p.zone[0], y1: p.zone[1], x2: p.tip[0], y2: p.tip[1] }, z);
    el("circle", { cx: p.zone[0], cy: p.zone[1], r: 23 }, z);
    const t = el("text", { x: p.zone[0], y: p.zone[1] + 7, "text-anchor": "middle" }, z); t.textContent = String(i + 1);
    const pill = el("g", { class: "pill" }, z);
    const w = Math.min(120, 22 + p.label.length * 7.6);
    let x = p.zone[0] - w / 2; x = Math.max(3, Math.min(397 - w, x));
    el("rect", { x, y: p.zone[1] - 15, width: w, height: 30, rx: 15 }, pill);
    const pt = el("text", { x: x + w / 2, y: p.zone[1] + 5, "text-anchor": "middle" }, pill); pt.textContent = p.label;
  });
  return svg;
}
function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

function stage1() {
  show("scr-s1");
  const box = $("#neuronBox"); box.innerHTML = ""; const svg = neuronSVG(); box.appendChild(svg);
  const tray = $("#tray"); tray.innerHTML = "";
  const role = $("#role"); role.className = "role idle"; role.textContent = "גררו כל חלק למקום שלו על הנוירון";
  let placed = 0, mistakes = 0, selected = null; const t0 = performance.now();
  $("#s1meta").textContent = "0/5";
  const zones = {}; svg.querySelectorAll(".zone").forEach((z) => (zones[z.dataset.zone] = z));

  function zoneAt(x, y) {
    let best = null, bd = 1e9;
    for (const k in zones) {
      const z = zones[k]; if (z.classList.contains("done")) continue;
      const r = z.querySelector("circle").getBoundingClientRect();
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2, d = Math.hypot(cx - x, cy - y);
      const reach = Math.max(48, r.width * 1.2);
      if (d < reach && d < bd) { bd = d; best = z; }
    }
    return best;
  }
  function tryDrop(chip, z) {
    const part = PARTS.find((p) => p.key === chip.dataset.part);
    if (z.dataset.zone === part.key) {
      z.classList.add("done"); chip.classList.add("used"); chip.setAttribute("aria-hidden", "true");
      svg.querySelector(`.part[data-part="${part.key}"]`).classList.add("on");
      placed++; addPts(100);
      role.className = "role pop"; role.innerHTML = ""; const b = document.createElement("b"); b.textContent = "✅ "; role.append(b, part.role);
      $("#s1meta").textContent = `${placed}/5`; setProg(1, (placed / 5) * 100);
      if (placed === 5) finish1();
    } else {
      mistakes++; addPts(-10);
      z.classList.remove("shake"); void z.getBBox(); z.classList.add("shake");
      chip.classList.remove("shake"); void chip.offsetWidth; chip.classList.add("shake");
      role.className = "role bad pop"; role.textContent = "לא שם 🙂 נסו מקום אחר (‎-10)";
    }
    setTimeout(() => { role.classList.remove("pop"); }, 400);
  }
  function finish1() {
    const sec = (performance.now() - t0) / 1000;
    const bonus = Math.max(0, Math.round(150 - sec * 2)) + (mistakes === 0 ? 100 : 0);
    addPts(bonus);
    setTimeout(() => {
      S.phase = "result"; save();
      showStageResult(1, { sec, mistakes, bonus });
    }, 1500);
  }
  shuffle(PARTS.slice()).forEach((p) => {
    const c = document.createElement("div");
    c.className = "chip"; c.dataset.part = p.key; c.textContent = p.label; c.tabIndex = 0; c.setAttribute("role", "button");
    tray.appendChild(c);
    let ghost = null, sx = 0, sy = 0, moved = false, hot = null;
    c.addEventListener("pointerdown", (e) => {
      if (c.classList.contains("used")) return;
      e.preventDefault(); c.setPointerCapture(e.pointerId);
      sx = e.clientX; sy = e.clientY; moved = false;
    });
    c.addEventListener("pointermove", (e) => {
      if (!c.hasPointerCapture(e.pointerId)) return;
      if (!moved && Math.hypot(e.clientX - sx, e.clientY - sy) > 8) {
        moved = true; ghost = c.cloneNode(true); ghost.classList.add("drag-ghost"); ghost.classList.remove("sel"); document.body.appendChild(ghost);
        c.style.opacity = ".35";
      }
      if (ghost) {
        ghost.style.left = e.clientX + "px"; ghost.style.top = e.clientY + "px";
        const z = zoneAt(e.clientX, e.clientY);
        if (z !== hot) { if (hot) hot.classList.remove("hot"); hot = z; if (z) z.classList.add("hot"); }
      }
    });
    const end = (e, cancel) => {
      if (!c.hasPointerCapture || !c.hasPointerCapture(e.pointerId)) { if (!ghost) return; }
      if (hot) hot.classList.remove("hot");
      const z = moved && !cancel ? zoneAt(e.clientX, e.clientY) : null;
      if (ghost) { ghost.remove(); ghost = null; }
      c.style.opacity = "";
      if (!moved && !cancel) { // tap = select, then tap a zone
        tray.querySelectorAll(".chip.sel").forEach((x) => x !== c && x.classList.remove("sel"));
        c.classList.toggle("sel"); selected = c.classList.contains("sel") ? c : null;
        if (selected) { role.className = "role idle"; role.textContent = `עכשיו הקישו על המקום של: ${p.label}`; }
      } else if (z) { selected = null; c.classList.remove("sel"); tryDrop(c, z); }
      hot = null; moved = false;
    };
    c.addEventListener("pointerup", (e) => end(e, false));
    c.addEventListener("pointercancel", (e) => end(e, true));
    c.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); c.classList.add("sel"); selected = c; tray.querySelectorAll(".chip.sel").forEach((x) => x !== c && x.classList.remove("sel")); } });
  });
  Object.values(zones).forEach((z) => z.addEventListener("pointerdown", (e) => {
    if (!selected || z.classList.contains("done")) return;
    e.preventDefault(); const c = selected; selected = null; c.classList.remove("sel"); tryDrop(c, z);
  }));
}

// ---------- stages 2 & 3 ----------
const N = 0, M = 1, SYN = 2; // segment kinds
// waypoints: [x, y, kindOfSegmentFromPrev, gateLabel?]
const WP = [
  [378, 40, N], [345, 62, N, "דנדריטים", 296, 46], [316, 110, N, "גוף התא", 262, 90], [256, 110, N],
  [202, 110, M], [148, 110, M, "קפיצה במיאלין", 148, 90], [96, 110, M], [72, 110, N], [56, 128, N, "קפצו מעל הסינפסה", 146, 166],
  [56, 196, SYN], [86, 232, N, "גוף התא", 114, 274], [118, 232, N], [172, 232, M], [226, 232, M, "קפיצה במיאלין", 226, 212], [280, 232, M],
  [304, 232, N], [318, 262, N, "אל השריר", 366, 262],
];
function routeSVG(damaged) {
  const svg = el("svg", { viewBox: "0 0 400 480", role: "img", "aria-label": "מסלול הדחף משני נוירונים אל השריר" });
  const defs = el("defs", {}, svg);
  const f = el("filter", { id: "gl", x: "-100%", y: "-100%", width: "300%", height: "300%" }, defs);
  el("feGaussianBlur", { stdDeviation: "4", result: "b" }, f);
  const mg = el("feMerge", {}, f); el("feMergeNode", { in: "b" }, mg); el("feMergeNode", { in: "SourceGraphic" }, mg);
  const lab = (x, y, t, anchor = "middle") => { const e = el("text", { x, y, class: "lbl-s", "text-anchor": anchor }, svg); e.textContent = t; };
  lab(200, 62, "נוירון 1"); lab(214, 284, "נוירון 2");
  // neuron 1
  const n1 = el("g", { class: "r-n" + (damaged ? " dmg" : "") }, svg);
  el("path", { d: "M300 98 L345 62 L378 40 M345 62 L372 70 M352 56 L362 26 M302 122 L346 150 L378 162 M346 150 L370 140 M306 110 L360 110 L388 104" }, n1);
  el("path", { d: "M292 110 L80 110 Q56 110 56 128" }, n1);
  [[208, 250], [154, 196], [100, 142]].forEach(([a, b]) => el("rect", { class: "my", x: a, y: 100, width: b - a, height: 20, rx: 10 }, n1));
  el("path", { d: "M56 128 L42 140 M56 128 L56 144 M56 128 L70 140" }, n1);
  [[42, 143], [56, 148], [70, 143]].forEach(([x, y]) => el("circle", { class: "bulb", cx: x, cy: y, r: 5.5 }, n1));
  el("circle", { class: "body", cx: 316, cy: 110, r: 26 }, n1); el("circle", { class: "nuc", cx: 318, cy: 110, r: 9 }, n1);
  // synapse label
  // neuron 2
  const n2 = el("g", { class: "r-n" + (damaged ? " dmg" : "") }, svg);
  el("path", { d: "M74 214 L56 196 L44 176 M56 196 L56 172 M56 196 L70 176 M66 238 L38 232 L22 222 M38 232 L26 248 M78 252 L64 276" }, n2);
  el("path", { d: "M108 232 L292 232 Q318 232 318 252" }, n2);
  [[124, 166], [178, 220], [232, 274]].forEach(([a, b]) => el("rect", { class: "my", x: a, y: 222, width: b - a, height: 20, rx: 10 }, n2));
  el("path", { d: "M318 252 L304 262 M318 252 L318 266 M318 252 L332 262" }, n2);
  el("circle", { class: "body", cx: 86, cy: 232, r: 24 }, n2); el("circle", { class: "nuc", cx: 84, cy: 232, r: 8 }, n2);
  if (damaged) {
    [n1, n2].forEach((g) => g.querySelectorAll("rect.my").forEach((r) => {
      const x = +r.getAttribute("x"), y = +r.getAttribute("y"), w = +r.getAttribute("width");
      el("path", { class: "crack", d: `M${x + w * 0.3} ${y} l4 7 l-5 5 l4 8 M${x + w * 0.7} ${y + 20} l-3 -6 l5 -5` }, g);
    }));
  }
  // muscle
  const mus = el("g", { class: "muscle", id: "muscle" }, svg);
  el("ellipse", { cx: 318, cy: 370, rx: 44, ry: 92 }, mus);
  el("path", { d: "M300 300 Q292 370 300 440 M318 290 L318 450 M336 300 Q344 370 336 440" }, mus);
  const mt = el("text", { x: 318, y: 375, "text-anchor": "middle", class: "lbl-s", style: "fill:#fff;font-size:15px" }, svg); mt.textContent = "שריר";
  el("path", { d: "M318 268 L318 278 M318 462 L318 476", stroke: "#ffd9d3", "stroke-width": 4, "stroke-linecap": "round" }, svg);
  // gates
  const gates = [];
  WP.forEach((w, i) => {
    if (!w[3]) return;
    const g = el("g", { class: "gate", "data-i": i }, svg);
    el("circle", { class: "ring", cx: w[0], cy: w[1], r: 15 }, g);
    const t = el("text", { x: w[4], y: w[5], "text-anchor": "middle" }, g);
    t.textContent = damaged && w[3] === "קפיצה במיאלין" ? "מיאלין פגוע" : w[3];
    gates.push({ i, g });
  });
  const fx = el("g", {}, svg);
  const dot = el("circle", { r: 8, fill: "#ffe14d", filter: "url(#gl)", cx: WP[0][0], cy: WP[0][1], opacity: 0 }, svg);
  return { svg, dot, gates, fx, muscle: mus };
}

let raf = 0, flickerT = 0, runActive = false;
function stopAll() { runActive = false; cancelAnimationFrame(raf); clearInterval(flickerT); }

function runStage(n) {
  const damaged = n === 3;
  show("scr-run");
  $("#runTitle").textContent = damaged ? "שלב 3: מיאלין פגוע" : "שלב 2: שלחו את המסר";
  const box = $("#routeBox"); box.innerHTML = "";
  const R = routeSVG(damaged); box.appendChild(R.svg);
  $("#strengthRow").hidden = !damaged;
  const statusEl = $("#runStatus");
  const say = (t, cls = "") => { statusEl.textContent = t; statusEl.className = "status-line " + cls; };
  say(damaged ? "המיאלין פגוע. הקישו כשהנקודה דולקת" : "המסר נע בכיוון אחד בלבד", "");

  const speed = { [N]: 75, [M]: damaged ? 20 : 380, [SYN]: 0 };
  let msg = 0, seg = 1, segT = 0, state = "idle", gateStart = 0, msgStart = 0, gatesPassed = 0;
  let strength = 100, lit = true, lostThis = false;
  const times = [], arrived = [];
  const gateOf = (i) => R.gates.find((g) => g.i === i);
  const setStrength = (v) => { strength = Math.max(0, Math.min(100, v)); $("#strengthFill").style.width = strength + "%"; R.dot.setAttribute("opacity", damaged ? 0.25 + strength / 133 : 1); };
  const meta = () => { $("#runMeta").textContent = `מסר ${Math.min(msg + 1, MSGS)}/${MSGS}`; };
  const fly = (x, y, text, color) => { const t = el("text", { x, y: y - 14, "text-anchor": "middle", class: "fly", fill: color }, R.fx); if (/^[+\-\d]/.test(text)) t.setAttribute("direction", "ltr"); t.textContent = text; setTimeout(() => t.remove(), 1000); };
  const progress = () => setProg(n, ((msg * GATES_PER_MSG + gatesPassed) / (MSGS * GATES_PER_MSG)) * 100);

  function startMsg() {
    seg = 1; segT = 0; gatesPassed = 0; lostThis = false;
    R.gates.forEach((g) => g.g.classList.remove("passed", "near", "wait", "off"));
    R.dot.setAttribute("cx", WP[0][0]); R.dot.setAttribute("cy", WP[0][1]);
    setStrength(100); meta();
    msgStart = performance.now(); state = "move"; R.dot.setAttribute("opacity", 1);
  }
  function segLen(i) { const a = WP[i - 1], b = WP[i]; return Math.hypot(b[0] - a[0], b[1] - a[1]); }
  let last = 0;
  function frame(ts) {
    if (!runActive) return;
    const dt = Math.min(0.05, (ts - (last || ts)) / 1000); last = ts;
    if (state === "move") {
      const kind = WP[seg][2], L = segLen(seg);
      const dur = kind === SYN ? 0.8 : L / speed[kind];
      segT += dt / dur;
      // glowing checkpoint ahead
      const w = WP[seg];
      if (w[3]) { const g = gateOf(seg); const rem = (1 - segT) * dur; g.g.classList.toggle("near", rem < 0.7); }
      if (damaged && kind === M) {
        setStrength(strength - dt * 2.2);
        if (msg === 1 && seg === 5 && segT > 0.45) { lose(); }
      }
      if (state === "move") {
        const t = Math.min(1, segT), a = WP[seg - 1];
        let x = a[0] + (w[0] - a[0]) * t, y = a[1] + (w[1] - a[1]) * t;
        if (kind === M && !damaged) y -= Math.sin(Math.PI * t) * 10;
        if (kind === SYN) { // dot vanishes, neurotransmitters cross the gap
          R.dot.setAttribute("opacity", t < 0.15 || t > 0.85 ? 1 : 0);
          if (Math.random() < 0.35) { const c = el("circle", { cx: 44 + Math.random() * 26, cy: a[1] + 18 + t * 40, r: 2.4, fill: "#9ff3c4" }, R.fx); setTimeout(() => c.remove(), 350); }
        }
        R.dot.setAttribute("cx", x); R.dot.setAttribute("cy", y);
        if (segT >= 1) {
          segT = 0;
          if (w[3]) { state = "gate"; gateStart = performance.now(); const g = gateOf(seg); g.g.classList.remove("near"); g.g.classList.add("wait"); }
          else nextSeg();
        }
      }
    }
    raf = requestAnimationFrame(frame);
  }
  function nextSeg() {
    seg++;
    if (seg >= WP.length) arrive();
  }
  function arrive() {
    state = "idle";
    const t = (performance.now() - msgStart) / 1000;
    times.push(t); arrived.push(1); addPts(100);
    const m = R.muscle; const k = damaged ? strength / 100 : 1;
    m.style.setProperty("--fx", String(1 + 0.35 * Math.max(0.25, k))); m.style.setProperty("--fy", String(1 - 0.28 * Math.max(0.25, k)));
    m.classList.remove("flex"); void m.getBBox(); m.classList.add("flex");
    say(damaged ? `השריר התכווץ, אבל חלש 💪 (${t.toFixed(1)} שנ׳)` : `השריר התכווץ! 💪 ${t.toFixed(1)} שנ׳`, "good");
    gatesPassed = GATES_PER_MSG; progress();
    setTimeout(nextMsg, 1600);
  }
  function lose() {
    state = "idle"; arrived.push(0);
    R.dot.setAttribute("opacity", 0);
    fly(+R.dot.getAttribute("cx"), +R.dot.getAttribute("cy"), "המסר נחלש", "#ffb0b0");
    say("המסר נחלש ולא הגיע לשריר 😟", "bad"); setStrength(0);
    gatesPassed = GATES_PER_MSG; progress();
    setTimeout(nextMsg, 2200);
  }
  function nextMsg() {
    msg++;
    if (msg >= MSGS) return finishRun();
    say(damaged ? "מסר חדש יוצא לדרך..." : "מסר חדש יוצא לדרך...", "");
    startMsg();
  }
  function finishRun() {
    stopAll();
    const ok = times.length ? times.reduce((a, b) => a + b, 0) / times.length : null;
    const cnt = arrived.filter(Boolean).length;
    if (n === 2) { S.t2 = ok && +ok.toFixed(1); S.a2 = cnt; } else { S.t3 = ok && +ok.toFixed(1); S.a3 = cnt; }
    setProg(n, 100); S.phase = "result"; save();
    showStageResult(n);
  }
  function tap() {
    if (!runActive) return;
    const btn = $("#tapBtn"); btn.classList.remove("hit"); void btn.offsetWidth; btn.classList.add("hit");
    const w = WP[seg];
    if (state === "move" && w[3]) { // early-but-close tap counts as perfect timing
      const kind = w[2], dur = kind === SYN ? 0.8 : segLen(seg) / speed[kind];
      if ((1 - segT) * dur < 0.35 && (!damaged || lit)) { passGate(0, true); return; }
    }
    if (state !== "gate") { if (state === "move") { addPts(-5); say("מוקדם מדי, חכו לנקודה הזוהרת", "bad"); } return; }
    if (damaged && !lit) { setStrength(strength - 8); fly(w[0], w[1], "פספוס!", "#ffb0b0"); say("פספוס! המסר נחלש", "bad"); return; }
    if (damaged && w[2] === M && Math.random() < 0.35) { setStrength(strength - 10); fly(w[0], w[1], "המסר נחלש", "#ffb0b0"); say("הדחף לא עבר טוב. הקישו שוב!", "bad"); return; }
    passGate(performance.now() - gateStart, false);
  }
  function passGate(ms, early) {
    const w = WP[seg], g = gateOf(seg);
    const p = early ? 50 : Math.round(Math.max(10, 50 - Math.max(0, ms - 350) / 41));
    addPts(p); fly(w[0], w[1], `+${p}`, "#ffe14d");
    g.g.classList.remove("near", "wait"); g.g.classList.add("passed");
    gatesPassed++; progress();
    if (w[3] === "קפצו מעל הסינפסה") say("המסר עובר בסינפסה בעזרת חומרים כימיים", "good");
    else if (p >= 40) say(damaged ? "יפה!" : "מהיר! ⚡", "good"); else say("עבר", "good");
    if (early) { R.dot.setAttribute("cx", w[0]); R.dot.setAttribute("cy", w[1]); }
    segT = 0; state = "move"; nextSeg();
  }
  $("#tapBtn").onclick = null;
  $("#tapBtn").onpointerdown = (e) => { e.preventDefault(); tap(); };
  $("#tapBtn").onkeydown = (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); tap(); } };
  box.onpointerdown = (e) => { e.preventDefault(); tap(); };
  if (damaged) {
    flickerT = setInterval(() => {
      lit = Math.random() > 0.38;
      R.gates.forEach((g) => { if (!g.g.classList.contains("passed")) g.g.classList.toggle("off", !lit); });
    }, 330);
  } else lit = true;
  runActive = true; last = 0; startMsg(); raf = requestAnimationFrame(frame);
}

// ---------- results ----------
function showStageResult(n, extra) {
  show("scr-res"); S.phase = "result"; save();
  const c = $("#resCard"); c.innerHTML = "";
  const h = (tag, txt, style) => { const e = document.createElement(tag); e.textContent = txt; if (style) e.style.cssText = style; c.appendChild(e); return e; };
  if (n === 1) {
    h("div", "🧠", "font-size:3rem"); h("h2", "הנוירון בנוי!", "margin:.3rem 0");
    if (extra) h("p", `זמן: ${Math.round(extra.sec)} שנ׳ · טעויות: ${extra.mistakes} · בונוס: \u200e+${extra.bonus}`, "font-weight:700");
    h("p", "דנדריטים ← גוף התא ← אקסון ← סינפסה", "font-weight:700;color:#5a6b85;direction:rtl");
  } else if (n === 2) {
    h("div", "⚡💪", "font-size:3rem"); h("h2", "המסר הגיע לשריר!", "margin:.3rem 0");
    h("p", `זמן ממוצע למסר: ${S.t2 ?? "-"} שנ׳ · הגיעו ${S.a2 ?? 0} מתוך 3`, "font-weight:700");
    h("p", "המיאלין עוזר לדחף לקפוץ ולהגיע מהר.", "color:#5a6b85;font-weight:600");
  } else {
    h("div", "🩹", "font-size:3rem"); h("h2", "מה קרה למסר?", "margin:.3rem 0");
    c.appendChild(compareBlock());
  }
  const b = document.createElement("button"); b.className = "btn wide"; b.style.marginTop = "1rem";
  b.textContent = n < 3 ? `לשלב ${n + 1}` : "לסיום";
  b.onclick = () => { if (n < 3) intro(n + 1); else { S.done = 1; S.stage = 4; S.prog = 100; dirty = true; save(); showEnd(false); } };
  c.appendChild(b);
}
function compareBlock() {
  const wrap = document.createElement("div");
  const t2 = S.t2, t3 = S.t3, mx = Math.max(t2 || 0, t3 || 0, 1);
  const rows = [["עם מיאלין", t2, S.a2, "#2fbf71"], ["מיאלין פגוע", t3, S.a3, "#ef5b5b"]];
  const box = document.createElement("div"); box.className = "compare";
  rows.forEach(([lbl, t, a, col]) => {
    const r = document.createElement("div"); r.className = "cmp-row";
    const l = document.createElement("span"); l.textContent = lbl;
    const tr = document.createElement("span"); tr.className = "cmp-track"; const f = document.createElement("span"); f.className = "cmp-fill"; f.style.cssText = `display:block;width:${t ? Math.max(8, (t / mx) * 100) : 0}%;background:${col}`; tr.appendChild(f);
    const v = document.createElement("span"); v.textContent = t ? `${t} שנ׳` : "-";
    r.append(l, tr, v); box.appendChild(r);
  });
  wrap.appendChild(box);
  const a = document.createElement("p"); a.style.cssText = "font-weight:700;margin:.2rem 0 .7rem";
  a.textContent = `מסרים שהגיעו לשריר: ${S.a2 ?? "-"}/3 לעומת ${S.a3 ?? "-"}/3`; wrap.appendChild(a);
  const c = document.createElement("p"); c.className = "conclusion"; c.textContent = "פגיעה במיאלין מאטה את הדחף, וחלק מהמסרים לא מגיעים."; wrap.appendChild(c);
  return wrap;
}
function showEnd(byTeacher) {
  stopAll(); show("scr-end");
  $("#endTitle").textContent = byTeacher && !S.done ? "המשחק הסתיים" : "כל הכבוד!";
  const stars = S.pts >= 2500 ? 3 : S.pts >= 1700 ? 2 : 1;
  $("#endStars").textContent = "★".repeat(stars) + "☆".repeat(3 - stars);
  $("#endStars").setAttribute("aria-label", `${stars} כוכבים מתוך 3`);
  $("#endStars").style.color = "#f6b21b";
  $("#endScore").textContent = S.pts;
  const ec = $("#endCompare"); ec.innerHTML = "";
  if (S.t2 && S.t3) ec.appendChild(compareBlock());
}

// ---------- boot ----------
if (S && S.id && S.code && (!urlCode || urlCode === S.code)) {
  status = "lobby"; // resolved by the first poll
  $("#ptsChip").hidden = false; $("#whoName").textContent = S.name; $("#ptsVal").textContent = S.pts || 0; $("#waitName").textContent = S.name;
  (async () => {
    try { const j = await post("/api/report", { code: S.code, id: S.id, tok: S.tok }); status = j.status; enterGame(); }
    catch (ex) { if (ex.status === 404) { localStorage.removeItem(KEY); $("#ptsChip").hidden = true; show("scr-join"); } else { enterGame(); } }
  })();
} else {
  show("scr-join");
  if (urlCode) setTimeout(() => $("#name").focus(), 100);
}
})();
