(() => {
"use strict";
const API_BASE = /\.github\.io$/i.test(location.hostname) || location.protocol === "file:" ? "https://neuron-game.sites.tab.bot" : ""; // live game server
const $ = (s) => document.querySelector(s);
const params = new URLSearchParams(location.search);
let code = (params.get("room") || "").replace(/\D/g, ""), k = params.get("k") || "";
let data = null, timer = null, view = "";
const ICON = { 0: "⏳", 1: "🧩", 2: "⚡", 3: "🩹", 4: "✅" };

function views(v) {
  view = v;
  ["t-home", "t-lobby", "t-play", "t-final"].forEach((id) => { $("#" + id).hidden = id !== "t-" + v; });
  $("#btnStart").hidden = v !== "lobby";
  $("#btnEnd").hidden = v !== "play";
  $("#btnNew").hidden = v !== "final";
  $("#tCount").hidden = v === "home";
}
async function call(method, path, body) {
  const r = await fetch(API_BASE + path, { method, headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  let j = {}; try { j = await r.json(); } catch {}
  if (!r.ok) { const e = new Error(j.error || "שגיאה"); e.status = r.status; throw e; }
  return j;
}
const SITE_DIR = location.pathname.replace(/[^/]*$/, ""); // "/" on tab.bot, "/shliach-hadachaf-game/" on GitHub Pages
function joinUrl() { return `${location.origin}${SITE_DIR}?code=${code}`; }
function qrSvg(text, cell) {
  const q = qrcode(0, "M"); q.addData(text); q.make();
  return q.createSvgTag({ cellSize: cell, margin: 2, scalable: true });
}
function drawJoin() {
  $("#qrBig").innerHTML = qrSvg(joinUrl(), 8);
  $("#qrMini").innerHTML = qrSvg(joinUrl(), 4);
  $("#joinUrl").textContent = `${location.host}${SITE_DIR}`.replace(/\/$/, "");
  $("#codeBig").textContent = code; $("#codeMini").textContent = code;
}
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const overall = (p) => p.done ? 100 : p.stage ? Math.round(((p.stage - 1) * 100 + p.prog) / 3) : 0;

$("#btnCreate").onclick = async () => {
  $("#btnCreate").disabled = true; $("#homeErr").textContent = "";
  try {
    const j = await call("POST", "/api/room");
    code = j.code; k = j.k;
    history.replaceState(null, "", `${location.pathname}?room=${code}&k=${k}`);
    drawJoin(); views("lobby"); poll();
  } catch (e) { $("#homeErr").textContent = e.message; }
  finally { $("#btnCreate").disabled = false; }
};
$("#btnStart").onclick = async () => { $("#btnStart").disabled = true; try { await call("POST", "/api/room/start", { code, k }); await refresh(); } catch (e) { alert(e.message); } $("#btnStart").disabled = false; };
$("#btnEnd").onclick = async () => {
  if (!confirm("לסיים את המשחק לכולם ולהציג את הזוכים?")) return;
  try { await call("POST", "/api/room/end", { code, k }); await refresh(); } catch (e) { alert(e.message); }
};
$("#btnNew").onclick = () => { clearTimeout(timer); timer = null; history.replaceState(null, "", location.pathname); code = ""; k = ""; data = null; views("home"); };
$("#names").addEventListener("click", async (e) => {
  const b = e.target.closest(".name-tag"); if (!b) return;
  if (!confirm(`להוציא את ${b.textContent} מהמשחק?`)) return;
  try { await call("POST", "/api/room/kick", { code, k, id: b.dataset.id }); await refresh(); } catch (ex) { alert(ex.message); }
});

async function refresh() {
  try {
    data = await call("GET", `/api/room?code=${code}&k=${encodeURIComponent(k)}`);
  } catch (e) {
    if (e.status === 404) { clearTimeout(timer); timer = null; views("home"); $("#homeErr").textContent = "המשחק הזה לא נמצא או שפג תוקפו. פתחו משחק חדש."; history.replaceState(null, "", location.pathname); }
    return;
  }
  render();
}
function poll() { clearTimeout(timer); const go = async () => { await refresh(); if (code) timer = setTimeout(go, 1500); }; go(); }

function render() {
  const ps = data.players || [];
  $("#tCount").textContent = `${ps.length} תלמידים · קוד ${data.code}`;
  if (data.status === "lobby") { if (view !== "lobby") { drawJoin(); views("lobby"); } renderLobby(ps); }
  else if (data.status === "playing") { if (view !== "play") { drawJoin(); views("play"); } renderPlay(ps); }
  else { if (view !== "final") views("final"); renderFinal(ps); }
}
function renderLobby(ps) {
  $("#lobbyCount").textContent = ps.length === 1 ? "תלמיד אחד הצטרף" : `${ps.length} תלמידים הצטרפו`;
  const box = $("#names");
  const have = new Set([...box.children].map((c) => c.dataset.id));
  const want = new Set(ps.map((p) => p.id));
  [...box.children].forEach((c) => { if (!want.has(c.dataset.id)) c.remove(); });
  ps.forEach((p) => { if (!have.has(p.id)) { const b = document.createElement("button"); b.className = "name-tag"; b.dataset.id = p.id; b.textContent = p.name; b.title = "הוצאה מהמשחק"; box.appendChild(b); } });
}
function renderPlay(ps) {
  const now = data.now;
  const cnt = (s) => ps.filter((p) => !p.done && p.stage === s).length;
  $("#stS1").textContent = cnt(1) + cnt(0); $("#stS2").textContent = cnt(2); $("#stS3").textContent = cnt(3); $("#stDone").textContent = ps.filter((p) => p.done).length;
  $("#grid").innerHTML = ps.map((p) => {
    const st = p.done ? 4 : p.stage || 0;
    const away = now - p.seen > 15000;
    return `<div class="st-card${p.done ? " done" : ""}${away ? " away" : ""}">
      <div class="st-head"><span class="nm">${esc(p.name)}</span><span title="שלב">${ICON[st]}${st >= 1 && st <= 3 ? " " + st : ""}</span></div>
      <div class="pbar"><i style="width:${overall(p)}%"></i></div>
      <div class="st-meta"><span>${p.pts} נק׳</span><span>${p.done ? "סיים ✓" : st ? "שלב " + st + "/3" : "מחכה"}</span></div>
    </div>`;
  }).join("") || `<p class="muted" style="font-size:1.3rem">עדיין אין תלמידים. הם יכולים להצטרף גם עכשיו.</p>`;
  const top = [...ps].sort((a, b) => b.pts - a.pts).slice(0, 5);
  $("#top5").innerHTML = top.map((p, i) => `<li><span class="rk">${i + 1}</span><span class="nm">${esc(p.name)} ${p.done ? "✅" : ICON[p.stage || 0]}</span><span>${p.pts}</span></li>`).join("");
}
function avg(a) { return a.length ? a.reduce((x, y) => x + y, 0) / a.length : null; }
let finalKey = "";
function renderFinal(ps) {
  const key = JSON.stringify(ps.map((p) => [p.id, p.pts, p.t2, p.t3, p.a2, p.a3]));
  if (key === finalKey) return; finalKey = key;
  const top = [...ps].sort((a, b) => b.pts - a.pts).slice(0, 3);
  const order = [[1, "second", "2"], [0, "first", "1"], [2, "third", "3"]]; // visual order in RTL: right = first column
  $("#podium").innerHTML = [[0, "first", "1"], [1, "second", "2"], [2, "third", "3"]]
    .sort((a, b) => ({ first: 1, second: 0, third: 2 }[a[1]] - { first: 1, second: 0, third: 2 }[b[1]]))
    .map(([i, cls, n]) => { const p = top[i]; return p ? `<div class="pod ${cls}"><div class="who">${esc(p.name)}</div><div class="p">${p.pts} נק׳</div><div class="block">${n}</div></div>` : `<div class="pod ${cls}"></div>`; }).join("");
  void order;
  const t2 = avg(ps.filter((p) => p.t2 != null).map((p) => p.t2));
  const t3 = avg(ps.filter((p) => p.t3 != null).map((p) => p.t3));
  const a2s = ps.filter((p) => p.a2 != null), a3s = ps.filter((p) => p.a3 != null);
  const pct = (arr, f) => arr.length ? Math.round((arr.reduce((s, p) => s + p[f], 0) / (arr.length * 3)) * 100) : null;
  const p2 = pct(a2s, "a2"), p3 = pct(a3s, "a3");
  const mx = Math.max(t2 || 0, t3 || 0, 1);
  const row = (lbl, v, col, unit) => `<div class="cmp-row"><span>${lbl}</span><span class="cmp-track"><span class="cmp-fill" style="display:block;width:${v ? Math.max(6, (v / (unit === "%" ? 100 : mx)) * 100) : 0}%;background:${col}"></span></span><span>${v == null ? "-" : unit === "%" ? v + "%" : v.toFixed(1) + " שנ׳"}</span></div>`;
  const ratio = t2 && t3 ? (t3 / t2) : null;
  $("#summary").innerHTML = `
    <h2>📊 סיכום הכיתה</h2>
    <p style="font-weight:700;margin:.2rem 0 .8rem">${ps.length} תלמידים שיחקו · ${ps.filter((p) => p.done).length} סיימו את כל השלבים</p>
    <h3 style="margin:.4rem 0">⏱️ זמן ממוצע של מסר עד השריר</h3>
    <div class="compare">${row("עם מיאלין", t2, "#2fbf71", "s")}${row("מיאלין פגוע", t3, "#ef5b5b", "s")}</div>
    <h3 style="margin:.8rem 0 .4rem">📨 מסרים שהגיעו לשריר</h3>
    <div class="compare">${row("עם מיאלין", p2, "#2fbf71", "%")}${row("מיאלין פגוע", p3, "#ef5b5b", "%")}</div>
    ${ratio ? `<p style="font-weight:800;font-size:1.3rem;margin:.6rem 0">עם מיאלין פגוע המסר היה איטי פי ${ratio.toFixed(1)}</p>` : ""}
    <p class="conclusion big-concl">פגיעה במיאלין מאטה את הדחף, וחלק מהמסרים לא מגיעים.</p>`;
}

// boot
if (code && k) { drawJoin(); views("lobby"); poll(); } else views("home");
})();
