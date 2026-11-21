(() => {
"use strict";
const $ = (id) => document.getElementById(id);
const DPR = Math.min(2, window.devicePixelRatio || 1);
const MAGMA = [[0, 0, 0, 4], [0.13, 28, 16, 68], [0.25, 79, 18, 123], [0.38, 129, 37, 129], [0.5, 181, 54, 122],
  [0.63, 229, 80, 100], [0.75, 251, 135, 97], [0.88, 254, 194, 135], [1, 252, 253, 191]];
const BASE = [[-1, 1.618034, 0], [1, 1.618034, 0], [-1, -1.618034, 0], [1, -1.618034, 0], [0, -1, 1.618034],
  [0, 1, 1.618034], [0, -1, -1.618034], [0, 1, -1.618034], [1.618034, 0, -1], [1.618034, 0, 1],
  [-1.618034, 0, -1], [-1.618034, 0, 1]].map((v) => { const n = Math.hypot(...v); return v.map((x) => x / n); });
const ARMS = ["sharp", "exchange_only"];
const st = { board: 0, f: 0, playing: true, yaw: 0.4, pitch: -0.35, user: false, last: 0, hold: 0 };
let B = null;

function magma(x) {
  x = Math.max(0, Math.min(1, x));
  for (let i = 1; i < MAGMA.length; i++) if (x <= MAGMA[i][0]) {
    const a = MAGMA[i - 1], b = MAGMA[i], f = (x - a[0]) / (b[0] - a[0]);
    return [a[1] + f * (b[1] - a[1]), a[2] + f * (b[2] - a[2]), a[3] + f * (b[3] - a[3])];
  }
  return MAGMA[MAGMA.length - 1].slice(1);
}
const rgba = (c, a) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;

function decode(s, n) {
  const bin = atob(s), u = new Uint16Array(bin.length / 2);
  for (let i = 0; i < u.length; i++) u[i] = bin.charCodeAt(2 * i) | (bin.charCodeAt(2 * i + 1) << 8);
  const f = new Float32Array(u.length);
  for (let i = 0; i < u.length; i++) f[i] = u[i] / 65535;
  return f;
}

function prepare(d) {
  const N = d.cells, ports = new Float64Array(12 * N * 3);
  const eps = 0.30 * Math.sqrt(4 * Math.PI / N);
  for (let c = 0; c < N; c++) {
    const n = d.centres[c], ref = Math.abs(n[2]) > 0.9 ? [1, 0, 0] : [0, 0, 1];
    let tx = [ref[1] * n[2] - ref[2] * n[1], ref[2] * n[0] - ref[0] * n[2], ref[0] * n[1] - ref[1] * n[0]];
    const tl = Math.hypot(...tx); tx = tx.map((x) => x / tl);
    const ty = [n[1] * tx[2] - n[2] * tx[1], n[2] * tx[0] - n[0] * tx[2], n[0] * tx[1] - n[1] * tx[0]];
    for (let p = 0; p < 12; p++) {
      const q = BASE[p];
      for (let k = 0; k < 3; k++) ports[3 * (12 * c + p) + k] = n[k] + eps * (tx[k] * q[0] + ty[k] * q[1] + n[k] * q[2]);
    }
  }
  const S = d.seams.length;
  const arms = {};
  for (const arm of ["sharp", "perturbed", "exchange_only"]) {
    arms[arm] = { ports: decode(d.arms[arm].ports), seams: decode(d.arms[arm].seams), together: d.arms[arm].together,
      home: d.arms[arm].home };
  }
  const internal0 = [];
  d.seams.forEach(([a, b], i) => { if (a < 12 && b < 12) internal0.push(i); });
  return { ...d, P: 12 * N, S, portsXYZ: ports, arms, internal0, F: d.times.length };
}

function fit(cv) {
  const r = cv.getBoundingClientRect(), w = Math.max(10, Math.round(r.width * DPR)), h = Math.max(10, Math.round(r.height * DPR));
  if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
  const g = cv.getContext("2d"); g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = "source-over";
  g.fillStyle = "#000"; g.fillRect(0, 0, w, h); return [g, w, h];
}

function project(xyz, yaw, pitch, R, cx, cy) {
  const cy_ = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
  const n = xyz.length / 3, out = new Float64Array(3 * n);
  for (let i = 0; i < n; i++) {
    const x = xyz[3 * i], y = xyz[3 * i + 1], z = xyz[3 * i + 2];
    const x1 = x * cy_ + z * sy, z1 = -x * sy + z * cy_;
    const y2 = y * cp - z1 * sp, z2 = y * sp + z1 * cp;
    out[3 * i] = cx + x1 * R; out[3 * i + 1] = cy - y2 * R; out[3 * i + 2] = z2;
  }
  return out;
}

function drawGraph(g, P, seams, seamP, portP, lw, glow) {
  // instrument wireframe
  g.lineCap = "round";
  for (let i = 0; i < seams.length; i++) {
    const [a, b] = seams[i], z = (P[3 * a + 2] + P[3 * b + 2]) / 2, depth = 0.25 + 0.75 * Math.max(0, (z + 1.2) / 2.4);
    g.strokeStyle = `rgba(150,170,175,${0.10 * depth})`; g.lineWidth = lw * DPR;
    g.beginPath(); g.moveTo(P[3 * a], P[3 * a + 1]); g.lineTo(P[3 * b], P[3 * b + 1]); g.stroke();
  }
  g.globalCompositeOperation = "lighter";
  for (let i = 0; i < seams.length; i++) {
    const q = seamP[i]; if (q < 2e-4) continue;
    const [a, b] = seams[i], s = Math.sqrt(q), c = magma(0.25 + 0.75 * Math.min(1, s * 1.3));
    g.strokeStyle = rgba(c, Math.min(1, 0.15 + s)); g.lineWidth = (lw + glow * s) * DPR;
    g.beginPath(); g.moveTo(P[3 * a], P[3 * a + 1]); g.lineTo(P[3 * b], P[3 * b + 1]); g.stroke();
  }
  for (let p = 0; p < portP.length; p++) {
    const q = portP[p]; if (q < 2e-4) continue;
    const s = Math.sqrt(q), x = P[3 * p], y = P[3 * p + 1], r = (1.5 + glow * 1.6 * s) * DPR, c = magma(0.3 + 0.7 * Math.min(1, s * 1.2));
    const grd = g.createRadialGradient(x, y, 0, x, y, r * 2.2);
    grd.addColorStop(0, rgba(c, Math.min(1, 0.25 + s))); grd.addColorStop(1, rgba(c, 0));
    g.fillStyle = grd; g.beginPath(); g.arc(x, y, r * 2.2, 0, 7); g.fill();
  }
  g.globalCompositeOperation = "source-over";
}

function sphere(id, arm, f) {
  const [g, W, H] = fit($(id));
  const R = Math.min(W, H) * 0.40, P = project(B.portsXYZ, st.yaw, st.pitch, R, W / 2, H / 2 + H * 0.03);
  const A = B.arms[arm], ports = A.ports.subarray(f * B.P, (f + 1) * B.P), seams = A.seams.subarray(f * B.S, (f + 1) * B.S);
  drawGraph(g, P, B.seams, seams, ports, B.cells > 40 ? 0.6 : 0.9, B.cells > 40 ? 5 : 8);
}

function closeup(id, arm, f) {
  const [g, W, H] = fit($(id));
  const xyz = new Float64Array(36);
  for (let p = 0; p < 12; p++) for (let k = 0; k < 3; k++) xyz[3 * p + k] = BASE[p][k];
  const R = Math.min(W, H) * 0.36, P = project(xyz, 0.6 * st.yaw + 0.3, -0.3, R, W / 2, H / 2 + H * 0.05);
  const A = B.arms[arm];
  const seamsAll = A.seams.subarray(f * B.S, (f + 1) * B.S), portsAll = A.ports.subarray(f * B.P, (f + 1) * B.P);
  const seams = B.internal0.map((i) => B.seams[i]), seamP = B.internal0.map((i) => seamsAll[i]);
  drawGraph(g, P, seams, seamP, portsAll.subarray(0, 12), 1.3, 16);
}

function plot(f) {
  const [g, W, H] = fit($("plot"));
  const L = 52 * DPR, Rr = W - 18 * DPR, T = 26 * DPR, Bm = H - 26 * DPR;
  const t = B.times, t0 = t[1], t1 = t[t.length - 1];
  const X = (x) => L + (x <= 0 ? 0 : (Math.log(x / t0) / Math.log(t1 / t0))) * (Rr - L);
  const Y = (y) => Bm - y * (Bm - T);
  g.font = `${10 * DPR}px ui-monospace, Menlo, monospace`; g.fillStyle = "#6f878c"; g.textAlign = "right";
  for (const y of [0, 0.5, 1]) { g.fillText(String(y), L - 8 * DPR, Y(y) + 4 * DPR); g.strokeStyle = "#142226"; g.beginPath(); g.moveTo(L, Y(y)); g.lineTo(Rr, Y(y)); g.stroke(); }
  g.textAlign = "center";
  for (const x of B.registered_times) if (x > 0) { g.fillText(String(x), X(x), H - 8 * DPR); }
  g.setLineDash([5 * DPR, 4 * DPR]); g.strokeStyle = "rgba(200,220,225,0.45)"; g.lineWidth = DPR;
  g.beginPath(); g.moveTo(L, Y(B.bound_all_times)); g.lineTo(Rr, Y(B.bound_all_times)); g.stroke(); g.setLineDash([]);
  g.textAlign = "left"; g.fillStyle = "#8aa0a4"; g.fillText("all-time bound", L + 6 * DPR, Y(B.bound_all_times) - 6 * DPR);
  const series = [["sharp", "#4af1f2", [], "κ = 8"], ["perturbed", "#4af1f2", [4, 4], "κ = 8, 4% separated"], ["exchange_only", "#ffb547", [], "exchange only"]];
  series.forEach(([arm, col, dash, name], j) => {
    const y = B.arms[arm].together;
    g.strokeStyle = col; g.lineWidth = 1.8 * DPR; g.setLineDash(dash.map((d) => d * DPR)); g.globalAlpha = 0.9;
    g.beginPath(); for (let i = 0; i <= f; i++) { const px = X(t[i]), py = Y(y[i]); i ? g.lineTo(px, py) : g.moveTo(px, py); } g.stroke();
    g.setLineDash([]); g.globalAlpha = 1;
    g.fillStyle = col; g.fillText(name, Rr - 170 * DPR, T + (10 + 14 * j) * DPR);
    g.beginPath(); g.arc(X(t[f]), Y(y[f]), 3 * DPR, 0, 7); g.fill();
  });
  g.strokeStyle = "rgba(255,255,255,0.25)"; g.beginPath(); g.moveTo(X(t[f]), T); g.lineTo(X(t[f]), Bm); g.stroke();
}

function draw() {
  const f = Math.min(B.F - 1, Math.floor(st.f));
  sphere("s0", "sharp", f); sphere("s1", "exchange_only", f);
  closeup("c0", "sharp", f); closeup("c1", "exchange_only", f); plot(f);
  const pct = (x) => (100 * x).toFixed(1) + "%";
  $("b0").innerHTML = pct(B.arms.sharp.together[f]) + "<small>together</small>";
  $("b1").innerHTML = pct(B.arms.exchange_only.together[f]) + "<small>together</small>";
  $("h0").innerHTML = pct(B.arms.sharp.home[f]) + "<small>in its cell</small>";
  $("h1").innerHTML = pct(B.arms.exchange_only.home[f]) + "<small>in its cell</small>";
  $("clock").textContent = `t = ${B.times[f].toFixed(B.times[f] < 10 ? 2 : 1)}`;
  $("time").value = Math.round(1000 * f / (B.F - 1));
}

function loop(t) {
  const dt = st.last ? Math.min(0.1, (t - st.last) / 1000) : 0; st.last = t;
  if (st.playing && B) {
    if (st.f >= B.F - 1) { st.hold += dt; if (st.hold > 2) { st.f = 0; st.hold = 0; } }
    else st.f = Math.min(B.F - 1, st.f + dt * B.F / 16);
  }
  if (!st.user) st.yaw += dt * 0.12;
  if (B) draw();
  requestAnimationFrame(loop);
}

async function load(i) {
  st.board = i;
  const d = await (await fetch(window.ROW4.boards[i].url)).json();
  B = prepare(d); st.f = 0;
  document.querySelectorAll("#boards button").forEach((b, j) => b.classList.toggle("on", j === i));
}

window.ROW4.boards.forEach((b, i) => {
  const el = document.createElement("button"); el.textContent = b.name; el.onclick = () => load(i); $("boards").appendChild(el);
});
$("play").onclick = () => { st.playing = !st.playing; $("play").textContent = st.playing ? "❚❚" : "▶"; };
$("time").oninput = (e) => { if (!B) return; st.playing = false; $("play").textContent = "▶"; st.f = (+e.target.value / 1000) * (B.F - 1); };
for (const id of ["s0", "s1"]) {
  let p = null;
  $(id).addEventListener("pointerdown", (e) => { p = [e.clientX, e.clientY]; st.user = true; $(id).setPointerCapture(e.pointerId); });
  $(id).addEventListener("pointermove", (e) => { if (!p) return; st.yaw += (e.clientX - p[0]) * 0.008; st.pitch += (e.clientY - p[1]) * 0.006; p = [e.clientX, e.clientY]; });
  $(id).addEventListener("pointerup", () => { p = null; });
}
load(0).then(() => requestAnimationFrame(loop));
})();
