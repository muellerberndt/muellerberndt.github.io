// OPH in 60 seconds: five scenes, each a pure function of progress t in [0, 1].
// The page loops them next to the text; the video renderer calls OPHScenes.draw() frame by frame.
(() => {
  const GLOW = "#4af1f2", INK = "#c9fbfb", RED = "#ff2a6d";
  const ease = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
  const seg = (t, a, b) => ease((t - a) / (b - a));
  const lerp = (a, b, u) => a + (b - a) * u;
  const rgba = (hex, a) => {
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`;
  };
  const mix = (h1, h2, u, a) => {
    const p = parseInt(h1.slice(1), 16), q = parseInt(h2.slice(1), 16);
    const c = (s) => Math.round(lerp((p >> s) & 255, (q >> s) & 255, u));
    return `rgba(${c(16)},${c(8)},${c(0)},${a})`;
  };
  const Q = { shadows: true };
  function glow(ctx, s, color = GLOW, blur = 0.02) {
    if (!Q.shadows) return;
    ctx.shadowColor = color;
    ctx.shadowBlur = blur * s;
  }
  function circle(ctx, x, y, r) {
    ctx.beginPath();
    ctx.arc(x, y, Math.max(0, r), 0, Math.PI * 2);
  }
  function eye(ctx, x, y, r, a, open = 1) {
    if (a <= 0) return;
    ctx.save();
    ctx.globalAlpha = a;
    ctx.strokeStyle = GLOW;
    ctx.lineWidth = Math.max(1, r * 0.14);
    const o = Math.max(0.06, open);
    ctx.beginPath();
    ctx.moveTo(x - r, y);
    ctx.quadraticCurveTo(x, y - r * 0.95 * o, x + r, y);
    ctx.quadraticCurveTo(x, y + r * 0.95 * o, x - r, y);
    ctx.stroke();
    if (o > 0.3) {
      circle(ctx, x, y, r * 0.32 * Math.min(1, o * 1.4));
      ctx.fillStyle = GLOW;
      ctx.fill();
    }
    ctx.restore();
  }
  // Blink: mostly open, closing briefly at seeded moments.
  const blink = (t, k) => {
    const ph = (t * 3.1 + k * 0.37) % 1;
    return ph < 0.05 ? Math.abs(ph - 0.025) / 0.025 : 1;
  };

  // 1. Physics starts with a world and puts observers in it; OPH starts with the observers.
  function observers(ctx, w, h, t) {
    const s = Math.min(w, h), cx = w / 2, cy = h / 2, R = 0.3 * s;
    const globeA = 1 - seg(t, 0.45, 0.68);
    if (globeA > 0) {
      ctx.save();
      ctx.globalAlpha = globeA;
      ctx.strokeStyle = rgba(GLOW, 0.75);
      ctx.lineWidth = Math.max(1, 0.004 * s);
      glow(ctx, s);
      circle(ctx, cx, cy, R);
      ctx.stroke();
      ctx.strokeStyle = rgba(GLOW, 0.35);
      for (let i = -2; i <= 2; i++) {
        if (!i) continue;
        const yy = cy + (i / 3) * R, rr = R * Math.sqrt(1 - (i / 3) ** 2);
        ctx.beginPath();
        ctx.ellipse(cx, yy, rr, rr * 0.18, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
      for (let k = 0; k < 4; k++) {
        const ph = ((k / 4 + t * 0.25) % 1) * Math.PI;
        ctx.beginPath();
        ctx.ellipse(cx, cy, Math.abs(Math.cos(ph)) * R, R, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
    }
    // One observer drops into the world, then the picture turns around: many observers, no world yet.
    const fall = seg(t, 0.05, 0.35);
    const spread = seg(t, 0.55, 0.9);
    const n = 7;
    const ring = [];
    for (let i = 0; i < n; i++) { const ang = -Math.PI / 2 + (i / n) * Math.PI * 2; ring.push([cx + Math.cos(ang) * 0.32 * s, cy + Math.sin(ang) * 0.32 * s]); }
    network(ctx, ring, s, t, seg(t, 0.82, 0.95));
    for (let i = 0; i < n; i++) {
      const ang = -Math.PI / 2 + (i / n) * Math.PI * 2;
      const x = lerp(cx, cx + Math.cos(ang) * 0.32 * s, spread);
      const y0 = lerp(cy - 0.6 * s, cy, fall);
      const y = lerp(y0, cy + Math.sin(ang) * 0.32 * s, spread);
      const r = lerp(0.045, 0.06, spread) * s;
      if (i === 0 && fall > 0 && fall < 1) {
        for (let k = 1; k <= 6; k++) {
          const yk = lerp(cy - 0.6 * s, cy, seg(t - k * 0.012, 0.05, 0.35));
          ctx.save();
          ctx.fillStyle = rgba(GLOW, 0.22 / k);
          circle(ctx, x, yk, r * 0.5);
          ctx.fill();
          ctx.restore();
        }
      }
      eye(ctx, x, y, r, i === 0 ? 1 : seg(t, 0.55, 0.7), blink(t, i));
      const ring = seg(t, 0.75, 1);
      if (ring > 0) {
        ctx.save();
        ctx.strokeStyle = rgba(GLOW, 0.4 * ring);
        ctx.lineWidth = Math.max(1, 0.003 * s);
        circle(ctx, x, y, 0.15 * s * ring);
        ctx.stroke();
        ctx.restore();
      }
    }
  }

  function network(ctx, pts, s, t, a) {
    if (a <= 0) return;
    ctx.save();
    ctx.globalAlpha = a;
    ctx.strokeStyle = rgba(GLOW, 0.55);
    ctx.lineWidth = Math.max(1, 0.003 * s);
    const links = [];
    pts.forEach((p, i) => links.push([i, (i + 1) % pts.length], [i, (i + 2) % pts.length]));
    ctx.beginPath();
    links.forEach(([i, j]) => { ctx.moveTo(pts[i][0], pts[i][1]); ctx.lineTo(pts[j][0], pts[j][1]); });
    ctx.stroke();
    ctx.fillStyle = "#ffffff";
    links.forEach(([i, j], q) => {
      const u = (t * 4 + q * 0.37) % 1;
      circle(ctx, lerp(pts[i][0], pts[j][0], u), lerp(pts[i][1], pts[j][1], u), 0.006 * s);
      ctx.fill();
    });
    ctx.restore();
  }

  // 2. Agreement as an ongoing process. New records keep arriving. Each one sets off a chain reaction:
  // every patch next to a change repairs toward the consensus of its neighbours, and the chain ends where
  // the correction is too small to matter. Patches holding a record keep it, so each settled state is a
  // new equilibrium. Some records arrive twisted; no local repair can undo a twist, and those twists are
  // the particles. Everything is computed once; drawing only looks up a step.
  const LAT = (() => {
    const R = 6, nodes = [];
    for (let q = -R; q <= R; q++)
      for (let r = -R; r <= R; r++) if (Math.abs(q + r) <= R) nodes.push([q + r / 2, (r * Math.sqrt(3)) / 2]);
    const n = nodes.length, edges = [], nb = nodes.map(() => []);
    for (let i = 0; i < n; i++)
      for (let j = i + 1; j < n; j++)
        if (Math.hypot(nodes[i][0] - nodes[j][0], nodes[i][1] - nodes[j][1]) < 1.05) {
          edges.push([i, j]);
          nb[i].push(j);
          nb[j].push(i);
        }
    const tris = [];
    for (let i = 0; i < n; i++) nb[i].forEach((j) => { if (j > i) nb[i].forEach((k) => { if (k > j && nb[j].includes(k)) tris.push([i, j, k]); }); });
    return { R, nodes, n, edges, nb, tris };
  })();
  const wrap = (d) => d - 2 * Math.PI * Math.round(d / (2 * Math.PI));
  const near = (x, y) => {
    let best = 0;
    LAT.nodes.forEach((p, i) => { if (Math.hypot(p[0] - x, p[1] - y) < Math.hypot(LAT.nodes[best][0] - x, LAT.nodes[best][1] - y)) best = i; });
    return best;
  };
  // Defect cores: triangles the needles wind around, with neighbouring cores merged into one knot.
  function cores(th) {
    const { nodes, tris } = LAT, out = [];
    tris.forEach(([i, j, k]) => {
      const w = Math.round((wrap(th[j] - th[i]) + wrap(th[k] - th[j]) + wrap(th[i] - th[k])) / (2 * Math.PI));
      if (!w) return;
      const x = (nodes[i][0] + nodes[j][0] + nodes[k][0]) / 3, y = (nodes[i][1] + nodes[j][1] + nodes[k][1]) / 3;
      const c = out.find((q) => Math.hypot(q[0] / q[2] - x, q[1] / q[2] - y) < 1.4);
      if (c) { c[0] += x; c[1] += y; c[2]++; } else out.push([x, y, 1]);
    });
    return out.map(([x, y, m]) => [x / m, y / m]);
  }
  const BASE = 0.5, EPS = 0.035, PASS = 0.85;
  // Runs the repair process. hooks(k, th, pinned, next, flash) injects records before each step's repairs.
  function runField(steps, th0, hooks) {
    const { n, nb } = LAT;
    let th = th0.slice();
    const pinned = new Uint8Array(n);
    const theta = new Float32Array(steps * n), flash = new Float32Array(steps * n), repairs = new Int32Array(steps);
    const pulses = [], defects = [];
    let changed = new Set(), count = 0;
    for (let k = 0; k < steps; k++) {
      const next = new Set();
      hooks(k, th, pinned, next, (i, v) => (flash[k * n + i] = v));
      const cand = new Set();
      changed.forEach((i) => nb[i].forEach((j) => { if (!pinned[j]) cand.add(j); }));
      const upd = [], stepPulses = [];
      cand.forEach((j) => {
        let sx = 0, sy = 0;
        nb[j].forEach((q) => { sx += Math.cos(th[q]); sy += Math.sin(th[q]); });
        const dv = PASS * wrap(Math.atan2(sy, sx) - th[j]);
        if (Math.abs(dv) < EPS) return;
        upd.push([j, dv]);
        let src = -1, big = -1;
        nb[j].forEach((q) => { if (changed.has(q)) { const d = Math.abs(wrap(th[q] - th[j])); if (d > big) { big = d; src = q; } } });
        if (src >= 0) stepPulses.push([src, j, Math.min(1, Math.abs(dv) / 0.5)]);
      });
      upd.forEach(([j, dv]) => {
        th[j] += dv;
        flash[k * n + j] = Math.max(flash[k * n + j], Math.min(1, Math.abs(dv) / 0.4));
        next.add(j);
        count++;
      });
      changed = next;
      theta.set(th, k * n);
      repairs[k] = count;
      pulses.push(stepPulses);
      defects.push(cores(th));
    }
    const activity = Array.from(repairs, (v, k) => (k ? v - repairs[k - 1] : v));
    return { steps, theta, flash, repairs, activity, pulses, defects, peak: Math.max(1, ...activity), last: th };
  }
  function twistAt(th, pinned, next, setFlash, ox, oy, w, r = 1.3) {
    const { nodes } = LAT;
    // Phase chosen to match what is already there, so a moving twist does not flip the field.
    let sx = 0, sy = 0;
    nodes.forEach(([x, y], i) => { if (Math.hypot(x - ox, y - oy) <= r) { const d = th[i] - w * Math.atan2(y - oy, x - ox); sx += Math.cos(d); sy += Math.sin(d); } });
    const ph = sx || sy ? Math.atan2(sy, sx) : BASE;
    nodes.forEach(([x, y], i) => {
      if (Math.hypot(x - ox, y - oy) > r) return;
      const v = ph + w * Math.atan2(y - oy, x - ox);
      if (Math.abs(wrap(v - th[i])) > 0.02) { setFlash(i, 0.7); next.add(i); }
      th[i] = v;
      pinned[i] = 1;
    });
  }
  // [x, y, kick, time, twist]
  const RECORDS = [[-3, -1.6, 1.5, 0.1, 0], [2.3, -1.6, 0, 0.26, 1], [0.4, -3.4, 1.3, 0.4, 0], [-2.1, -0.2, -1.4, 0.52, 0], [0.6, 2.1, 1.2, 0.64, 0], [3.8, 2.4, 1.3, 0.72, 0], [-3.6, 2.6, -1.3, 0.82, 0]];
  const TWISTS = RECORDS.filter((r) => r[4]).map(([x, y, , at]) => { const [x0, y0] = LAT.nodes[near(x, y)]; return { x: x0 + 0.5, y: y0 + 0.29, at }; });
  const NAMES = ["A", "B", "C"];
  const SIM = (() => {
    const STEPS = 170;
    const events = RECORDS.map(([x, y, kick, at, twist]) => ({ node: near(x, y), x, y, kick, twist, step: Math.round(at * STEPS), at }));
    const run = runField(STEPS, LAT.nodes.map(() => BASE), (k, th, pinned, next, setFlash) => {
      events.forEach((ev) => {
        if (ev.step !== k) return;
        if (ev.twist) {
          const [x0, y0] = LAT.nodes[ev.node];
          twistAt(th, pinned, next, setFlash, x0 + 0.5, y0 + 0.29, ev.twist);
          LAT.nodes.forEach((_, i) => { if (pinned[i]) setFlash(i, 1); });
        } else {
          th[ev.node] += ev.kick;
          pinned[ev.node] = 1;
          setFlash(ev.node, 1);
          next.add(ev.node);
        }
      });
    });
    run.defects = Array.from({ length: STEPS }, (_, k) => TWISTS.filter((tw) => Math.round(tw.at * STEPS) <= k).map((tw) => [tw.x, tw.y]));
    return { ...run, events };
  })();
  // The second run continues from the settled field. Motion is transport of a pattern: the patches stay
  // where they are, and the twist is rebuilt at the next triangle along its way, cycle after cycle.
  // Observers read the same thing out as one particle moving smoothly.
  const SIM2 = (() => {
    const STEPS = 220, tw = TWISTS[0], end = [-3.1, 2.1];
    const smooth = Array.from({ length: STEPS }, (_, k) => { const u = k / (STEPS - 1); return [lerp(tw.x, end[0], u), lerp(tw.y, end[1], u)]; });
    const cents = LAT.tris.map(([i, j, k]) => [(LAT.nodes[i][0] + LAT.nodes[j][0] + LAT.nodes[k][0]) / 3, (LAT.nodes[i][1] + LAT.nodes[j][1] + LAT.nodes[k][1]) / 3]);
    const snap = ([x, y]) => cents.reduce((b, c) => (Math.hypot(c[0] - x, c[1] - y) < Math.hypot(b[0] - x, b[1] - y) ? c : b), cents[0]);
    const core = smooth.map((p, k) => (k === 0 ? [tw.x, tw.y] : snap(p)));
    let held = new Set();
    const run = runField(STEPS, SIM.last, (k, th, pinned, next, setFlash) => {
      if (k > 0 && core[k] === core[k - 1]) return;
      held.forEach((i) => (pinned[i] = 0));
      twistAt(th, pinned, next, setFlash, core[k][0], core[k][1], 1, 1.3);
      LAT.nodes.forEach((_, i) => { if (pinned[i]) setFlash(i, 1); });
      held = new Set();
      pinned.forEach((v, i) => { if (v) held.add(i); });
    });
    run.defects = core.map((c) => [c]);
    run.smooth = smooth;
    run.core = core;
    return run;
  })();

  // Draws a field state in a panel (top-down). Shared by scene 2 and the left half of scene 3.
  function tag(ctx, text, x, y, s, a = 1) {
    ctx.save();
    ctx.globalAlpha = a;
    ctx.fillStyle = "#ffffff";
    ctx.font = `600 ${Math.round(0.034 * s)}px ui-monospace, "SF Mono", Menlo, monospace`;
    ctx.fillText(text, x, y);
    ctx.restore();
  }
  function drawField(ctx, box, run, t, { chart = false, vis = null, names = true } = {}) {
    const { nodes, n, edges } = LAT;
    const s = Math.min(box.w, box.h), cx = box.x + box.w / 2, cy = box.y + box.h * (chart ? 0.44 : 0.5), unit = (0.42 * s) / (LAT.R + 0.4);
    const ft = Math.min(run.steps - 1e-6, Math.max(0, t * run.steps)), k = Math.floor(ft), frac = ft - k;
    const T = run.theta, off = k * n;
    const P = nodes.map(([x, y]) => [cx + x * unit, cy + y * unit]);
    const al = (i) => (vis ? vis[i] : 1);
    // Links in three brightness buckets, one path each.
    const buckets = [[], [], []];
    edges.forEach(([i, j]) => {
      const m = (1 - Math.cos(T[off + i] - T[off + j])) / 2, hot = Math.min(1, Math.max(0, m * 30 - 0.2));
      if (Math.min(al(i), al(j)) < 0.5) return;
      buckets[hot > 0.66 ? 2 : hot > 0.2 ? 1 : 0].push([i, j]);
    });
    ctx.save();
    ctx.lineWidth = Math.max(1, 0.002 * s);
    buckets.forEach((list, b) => {
      ctx.strokeStyle = b === 0 ? rgba(GLOW, 0.14) : mix(GLOW, RED, b / 2, 0.22 + 0.2 * b);
      ctx.beginPath();
      list.forEach(([i, j]) => { ctx.moveTo(P[i][0], P[i][1]); ctx.lineTo(P[j][0], P[j][1]); });
      ctx.stroke();
    });
    // Repairs in flight.
    ctx.strokeStyle = rgba(RED, 0.75);
    ctx.lineWidth = Math.max(1, 0.004 * s);
    glow(ctx, s, RED, 0.02);
    ctx.beginPath();
    run.pulses[k].forEach(([i, j]) => { ctx.moveTo(P[i][0], P[i][1]); ctx.lineTo(lerp(P[i][0], P[j][0], frac), lerp(P[i][1], P[j][1], frac)); });
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.fillStyle = "rgba(255,220,230,.95)";
    run.pulses[k].forEach(([i, j]) => { circle(ctx, lerp(P[i][0], P[j][0], frac), lerp(P[i][1], P[j][1], frac), 0.006 * s); ctx.fill(); });
    ctx.restore();
    // Patches: circle plus needle; a patch lights up when it is repaired.
    const L = 0.36 * unit, F = run.flash;
    const dim = [], lit = [];
    P.forEach((p, i) => {
      let f = 0;
      for (let q = 0; q < 4 && k - q >= 0; q++) f = Math.max(f, F[(k - q) * n + i] * (1 - q / 4 - frac / 4));
      (f > 0.25 ? lit : dim).push([i, f]);
    });
    ctx.save();
    ctx.lineWidth = Math.max(1, 0.0018 * s);
    [[dim, rgba(GLOW, 0.25)], [lit, rgba(GLOW, 0.9)]].forEach(([list, col]) => {
      ctx.strokeStyle = col;
      ctx.beginPath();
      list.forEach(([i]) => { if (al(i) <= 0) return; ctx.moveTo(P[i][0] + 0.4 * unit, P[i][1]); ctx.arc(P[i][0], P[i][1], 0.4 * unit * al(i), 0, Math.PI * 2); });
      ctx.stroke();
    });
    ctx.lineWidth = Math.max(1.2, 0.0045 * s);
    [[dim, INK], [lit, "#ffffff"]].forEach(([list, col]) => {
      ctx.strokeStyle = col;
      ctx.beginPath();
      list.forEach(([i]) => {
        if (al(i) <= 0) return;
        const a = T[off + i], [x, y] = P[i], l = L * al(i);
        ctx.moveTo(x - Math.cos(a) * l, y - Math.sin(a) * l);
        ctx.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l);
      });
      ctx.stroke();
    });
    ctx.restore();
    // Twists: the knots no repair can undo.
    run.defects[k].forEach(([dx, dy], d) => {
      const x = cx + dx * unit, y = cy + dy * unit, r = 0.035 * s;
      if (names) tag(ctx, NAMES[d], x + 0.026 * s, y - 0.022 * s, s);
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, "rgba(255,255,255,.95)");
      g.addColorStop(0.3, rgba(GLOW, 0.85));
      g.addColorStop(1, rgba(GLOW, 0));
      ctx.fillStyle = g;
      circle(ctx, x, y, r);
      ctx.fill();
    });
    return { s, cx, cy, unit, k, frac, P };
  }

  function agreement(ctx, w, h, t) {
    const vis = LAT.nodes.map(([x, y]) => seg(t, Math.hypot(x, y) * 0.0035, Math.hypot(x, y) * 0.0035 + 0.015));
    const { s, cx, unit, k, P } = drawField(ctx, { x: 0, y: 0, w, h }, SIM, t, { chart: true, vis });
    // A new record arrives: a ring runs outward from it.
    SIM.events.forEach((ev) => {
      const u = (t - ev.at) / 0.08;
      if (u < 0 || u > 1) return;
      const [x, y] = P[ev.node];
      ctx.save();
      ctx.strokeStyle = rgba("#ffffff", 1 - u);
      ctx.lineWidth = Math.max(1, 0.005 * s * (1 - u));
      circle(ctx, x, y, unit * (0.4 + 2.5 * u));
      ctx.stroke();
      ctx.restore();
    });
    // Repair count and repair activity over time.
    const x0 = cx - 0.36 * s, x1 = cx + 0.36 * s, yb = h * 0.95, hh = 0.07 * s;
    ctx.save();
    ctx.font = `${Math.round(0.022 * s)}px ui-monospace, "SF Mono", Menlo, monospace`;
    ctx.fillStyle = rgba(GLOW, 0.6);
    ctx.textAlign = "right";
    ctx.fillText(`repairs ${String(SIM.repairs[k]).padStart(4, "0")}`, x1, yb + 0.03 * s);
    ctx.textAlign = "left";
    ctx.fillText("repair activity", x0, yb + 0.03 * s);
    ctx.strokeStyle = rgba(GLOW, 0.18);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x0, yb);
    ctx.lineTo(x1, yb);
    ctx.stroke();
    ctx.strokeStyle = RED;
    ctx.lineWidth = Math.max(1, 0.003 * s);
    ctx.beginPath();
    for (let q = 0; q <= k; q++) ctx[q ? "lineTo" : "moveTo"](lerp(x0, x1, q / (SIM.steps - 1)), yb - (SIM.activity[q] / SIM.peak) * hh);
    ctx.stroke();
    ctx.restore();
  }

  // 3. Two views of one process. Left: what the simulation does (the field keeps repairing while its
  // twists move). Right: what observers see (the same records read out as spacetime; the twists are
  // particles moving through it, and spacetime curves around them).
  function label(ctx, text, x, y, s, a) {
    ctx.save();
    ctx.globalAlpha = a;
    ctx.fillStyle = rgba(GLOW, 0.75);
    ctx.font = `500 ${Math.round(0.03 * s)}px ui-monospace, "SF Mono", Menlo, monospace`;
    ctx.textAlign = "center";
    ctx.fillText(text, x, y);
    ctx.restore();
  }
  function reality(ctx, w, h, t) {
    const split = seg(t, 0.02, 0.14), show = seg(t, 0.1, 0.24), tilt = seg(t, 0.12, 0.32), curve = seg(t, 0.3, 0.45);
    const S = Math.min(w, h);
    const left = { x: 0, y: lerp(0, h * 0.08, split), w: lerp(w, w / 2, split), h: lerp(h, h * 0.9, split) };
    const u = Math.max(0, (t - 0.06) / 0.94);
    const out = drawField(ctx, left, SIM2, u);
    label(ctx, "WHAT THE SIMULATION DOES", w * 0.25, h * 0.11, S, show);
    label(ctx, "WHAT OBSERVERS SEE", w * 0.75, h * 0.11, S, show);
    if (show <= 0) return;
    // Divider.
    ctx.save();
    ctx.strokeStyle = rgba(GLOW, 0.2 * show);
    ctx.beginPath();
    ctx.moveTo(w / 2, h * 0.1);
    ctx.lineTo(w / 2, h * 0.95);
    ctx.stroke();
    ctx.restore();
    // Readout: the same lattice tilted into a fabric, curved around the current twists.
    const { nodes, edges, R } = LAT;
    const box = { x: w / 2, y: h * 0.08, w: w / 2, h: h * 0.9 };
    const s = Math.min(box.w, box.h), cx = box.x + box.w / 2, unit = (0.42 * s) / (R + 0.4);
    const ft = Math.min(SIM2.steps - 1.001, u * SIM2.steps), k = Math.floor(ft), fr = ft - k;
    const here = [lerp(SIM2.smooth[k][0], SIM2.smooth[k + 1][0], fr), lerp(SIM2.smooth[k][1], SIM2.smooth[k + 1][1], fr)];
    const depthAt = (x, y) => Math.exp(-((x - here[0]) ** 2 + (y - here[1]) ** 2) / 2.4);
    const proj = (x, y, z) => {
      const f = lerp(1, 1.3, tilt) / (1 + 0.5 * tilt * ((-y / R + 1) / 2));
      return [cx + x * unit * f, box.y + box.h * lerp(0.5, 0.45, tilt) + (y * unit * lerp(1, 0.4, tilt) + z * unit * 1.5 * tilt) * f];
    };
    // Left: earlier cores fade where the twist was rebuilt before.
    ctx.save();
    const seen = [];
    for (let q = 0; q < k; q++) if (!seen.length || SIM2.core[q] !== seen[seen.length - 1][0]) seen.push([SIM2.core[q], q]);
    seen.slice(0, -1).forEach(([c, q], i, arr) => {
      const age = (arr.length - i) / 6;
      ctx.strokeStyle = rgba("#ffffff", Math.max(0, 0.6 - age * 0.6));
      ctx.lineWidth = Math.max(1, 0.0025 * S);
      circle(ctx, out.cx + c[0] * out.unit, out.cy + c[1] * out.unit, 0.012 * S);
      ctx.stroke();
    });
    ctx.restore();
    // The readout is a continuum: a fine fabric whose well keeps one shape and depth, because the
    // particle's mass does not change. Only its position moves.
    ctx.save();
    ctx.globalAlpha = show;
    ctx.lineWidth = Math.max(1, 0.0018 * s);
    ctx.strokeStyle = rgba(GLOW, 0.5);
    glow(ctx, s, GLOW, 0.012);
    const GX = R, GY = R * 0.87, M = 30, SUB = 60;
    ctx.beginPath();
    for (let a = 0; a <= M; a++) {
      const gx = -GX + (2 * GX * a) / M;
      for (let b2 = 0; b2 <= SUB; b2++) { const gy = -GY + (2 * GY * b2) / SUB; const [x, y] = proj(gx, gy, depthAt(gx, gy) * curve); ctx[b2 ? "lineTo" : "moveTo"](x, y); }
      const gy0 = -GY + (2 * GY * a) / M;
      for (let b2 = 0; b2 <= SUB; b2++) { const gx2 = -GX + (2 * GX * b2) / SUB; const [x, y] = proj(gx2, gy0, depthAt(gx2, gy0) * curve); ctx[b2 ? "lineTo" : "moveTo"](x, y); }
    }
    ctx.stroke();
    ctx.restore();
    // Right: one particle gliding through the continuum with its trail, spacetime curved around it.
    ctx.save();
    ctx.globalAlpha = show;
    ctx.strokeStyle = "rgba(255,255,255,.7)";
    ctx.lineWidth = Math.max(1.5, 0.005 * s);
    glow(ctx, s, GLOW, 0.02);
    ctx.beginPath();
    for (let q = Math.max(0, k - 90); q <= k; q++) {
      const [x0, y0] = SIM2.smooth[q], [x, y] = proj(x0, y0, depthAt(x0, y0) * curve);
      ctx[q === Math.max(0, k - 90) ? "moveTo" : "lineTo"](x, y);
    }
    const [hx, hy] = proj(here[0], here[1], curve);
    ctx.lineTo(hx, hy);
    ctx.stroke();
    ctx.restore();
    const r = 0.06 * s, pulse = 0.85 + 0.15 * Math.sin(t * 30);
    const g = ctx.createRadialGradient(hx, hy, 0, hx, hy, r);
    g.addColorStop(0, rgba("#ffffff", show * pulse));
    g.addColorStop(0.25, rgba(GLOW, 0.9 * show * pulse));
    g.addColorStop(1, rgba(GLOW, 0));
    ctx.fillStyle = g;
    circle(ctx, hx, hy, r);
    ctx.fill();
    tag(ctx, "A", hx + 0.03 * s, hy - 0.03 * s, s, show);
    const cap = (text, x, y) => {
      ctx.save();
      ctx.globalAlpha = show;
      ctx.fillStyle = rgba(INK, 0.8);
      ctx.font = `${Math.round(0.022 * S)}px ui-monospace, "SF Mono", Menlo, monospace`;
      ctx.textAlign = "center";
      ctx.fillText(text, x, y);
      ctx.restore();
    };
    cap("defect A: the twist is rebuilt", w * 0.25, h * 0.88);
    cap("one place over, again and again", w * 0.25, h * 0.92);
    cap("particle A: moves smoothly,", w * 0.75, h * 0.88);
    cap("spacetime curves around it", w * 0.75, h * 0.92);
  }

  // 4. No computer outside. Inside the world an observer measures it, works out its rule, builds the
  // machine that runs it and switches it on; the screen shows the same world, and the view falls in.
  const K = 0.3, IX = 0.6, IY = 0.6;
  function stick(ctx, x, y, u, arm, legs) {
    // u: figure height in px; arm: angle of the working arm (0 = horizontal right); legs: swing phase.
    const hip = y - 0.06 * u, sh = y - 0.125 * u, sw = Math.sin(legs) * 0.025 * u;
    ctx.beginPath();
    ctx.arc(x, y - 0.17 * u, 0.025 * u, 0, Math.PI * 2);
    ctx.moveTo(x, y - 0.145 * u);
    ctx.lineTo(x, hip);
    ctx.lineTo(x - 0.03 * u + sw, y);
    ctx.moveTo(x, hip);
    ctx.lineTo(x + 0.03 * u - sw, y);
    ctx.moveTo(x, sh);
    ctx.lineTo(x + Math.cos(arm) * 0.08 * u, sh + Math.sin(arm) * 0.08 * u);
    ctx.moveTo(x, sh);
    ctx.lineTo(x - 0.03 * u, sh + 0.06 * u);
    ctx.stroke();
    return [x + Math.cos(arm) * 0.08 * u, sh + Math.sin(arm) * 0.08 * u];
  }
  function miniFabric(ctx, x, y, size, a = 0.55) {
    ctx.strokeStyle = rgba(GLOW, a);
    const gcx = x + 0.47 * size, gcy = y + 0.25 * size, M = 9;
    const gp = (u, v) => {
      const f = 1 / (1 + 0.5 * ((v + 1) / 2)), z = -0.6 * Math.exp(-(u * u + v * v) / 0.16);
      return [gcx + u * 0.3 * size * f, gcy + (-v * 0.12 * size - z * 0.2 * size) * f];
    };
    ctx.beginPath();
    for (let i = 0; i < M; i++)
      for (const dir of [0, 1])
        for (let j = 0; j < M; j++) {
          const a1 = (i / (M - 1)) * 2 - 1, b1 = (j / (M - 1)) * 2 - 1;
          const [px, py] = dir ? gp(b1, a1) : gp(a1, b1);
          ctx[j ? "lineTo" : "moveTo"](px, py);
        }
    ctx.stroke();
    return [gcx, gcy + 0.1 * size];
  }
  // phase u in [0, 1] drives the story; inner worlds are drawn finished (u = 1).
  function world(ctx, x, y, size, depth, s, u) {
    if (size < 3 || depth > 6) return;
    ctx.save();
    ctx.lineWidth = Math.max(0.6, Math.min(0.004 * s, size * 0.006));
    ctx.strokeStyle = rgba(GLOW, 0.8);
    ctx.strokeRect(x, y, size, size);
    const [fx, fy] = miniFabric(ctx, x, y, size);
    // Blackboard with the closure rule.
    const bx = x + 0.05 * size, by = y + 0.5 * size, bw = 0.3 * size, bh = 0.17 * size;
    ctx.strokeStyle = rgba(GLOW, 0.45);
    ctx.strokeRect(bx, by, bw, bh);
    const rule = "T(U) = U", write = seg(u, 0.27, 0.44);
    const shown = rule.slice(0, Math.round(rule.length * write));
    if (shown) {
      ctx.fillStyle = "#ffffff";
      ctx.font = `italic ${Math.max(4, 0.05 * size)}px Georgia, "Times New Roman", serif`;
      ctx.fillText(shown, bx + 0.03 * size, by + 0.08 * size);
      if (write > 0.5) {
        ctx.strokeStyle = rgba(GLOW, 0.6 * (write - 0.5) * 2);
        ctx.beginPath();
        for (let q = 0; q <= 12; q++) { const xx = bx + 0.05 * size + q * 0.016 * size, yy = by + 0.13 * size + 0.02 * size * Math.exp(-(((q - 6) / 3) ** 2)); ctx[q ? "lineTo" : "moveTo"](xx, yy); }
        ctx.stroke();
      }
    }
    // The machine: frame, screen, stand and switch, built piece by piece.
    const mx = x + IX * size, my = y + IY * size, ms = K * size;
    const build = seg(u, 0.54, 0.7), on = seg(u, 0.73, 0.8);
    if (build > 0) {
      ctx.strokeStyle = rgba(GLOW, 0.85);
      ctx.setLineDash([4 * ms * build, 4 * ms]);
      ctx.strokeRect(mx, my, ms, ms);
      ctx.setLineDash([]);
      if (build > 0.6) {
        ctx.beginPath();
        ctx.moveTo(mx + ms / 2, my + ms);
        ctx.lineTo(mx + ms / 2, my + ms + 0.04 * size);
        ctx.moveTo(mx + ms * 0.25, my + ms + 0.04 * size);
        ctx.lineTo(mx + ms * 0.75, my + ms + 0.04 * size);
        ctx.stroke();
      }
      if (build > 0.9) {
        ctx.fillStyle = on > 0 ? GLOW : rgba(RED, 0.8);
        ctx.fillRect(mx + ms + 0.012 * size, my + ms * 0.8, 0.02 * size, 0.02 * size);
      }
    }
    // Figure: observe, walk, write, walk, build, switch on.
    const walk1 = seg(u, 0.18, 0.26), walk2 = seg(u, 0.45, 0.53);
    const px = x + size * (u < 0.45 ? lerp(0.44, 0.24, walk1) : lerp(0.24, 0.5, walk2));
    const walking = (u > 0.18 && u < 0.26) || (u > 0.45 && u < 0.53);
    let arm = 0;
    if (u < 0.18) arm = -1.0;
    else if (u > 0.27 && u < 0.44) arm = -0.5 + 0.35 * Math.sin(u * 160);
    else if (u > 0.54 && u < 0.7) arm = -0.2 + 0.6 * Math.abs(Math.sin(u * 120));
    else if (u > 0.7 && u < 0.75) arm = 0.15;
    ctx.strokeStyle = rgba(INK, 0.9);
    const hand = stick(ctx, px, y + 0.9 * size, size, arm, walking ? u * 140 : 0);
    if (u < 0.18 && depth === 0) {
      // Telescope and measurement dots running from the fabric into it.
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = Math.max(1, 0.008 * size);
      ctx.beginPath();
      ctx.moveTo(hand[0], hand[1]);
      ctx.lineTo(hand[0] + 0.03 * size, hand[1] - 0.05 * size);
      ctx.stroke();
      ctx.fillStyle = "#ffffff";
      for (let q = 0; q < 4; q++) {
        const v = (u * 18 + q / 4) % 1;
        circle(ctx, lerp(fx, hand[0] + 0.03 * size, v), lerp(fy, hand[1] - 0.05 * size, v), Math.max(1, 0.006 * size));
        ctx.fill();
      }
    }
    ctx.restore();
    // The screen: dark until switched on, a flicker, then the same world inside.
    if (on > 0) {
      const flick = on < 1 && Math.floor(u * 300) % 3 === 0;
      if (!flick) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(mx, my, ms, ms);
        ctx.clip();
        ctx.globalAlpha = on;
        world(ctx, mx, my, ms, depth + 1, s, 1);
        ctx.restore();
      }
    }
  }
  function noOutside(ctx, w, h, t) {
    const s = Math.min(w, h), L = 0.86 * s, ox = (w - L) / 2, oy = (h - L) / 2;
    const px = IX / (1 - K), py = IY / (1 - K);
    const z = seg(t, 0.8, 1);
    const size = L * Math.pow(1 / K, z);
    const x = ox + px * L - px * size, y = oy + py * L - py * size;
    ctx.save();
    glow(ctx, s, GLOW, 0.01);
    world(ctx, x, y, size, 0, s, z > 0 ? 1 : t);
    ctx.restore();
  }

  // 5. The whole theory: the caret and one line.
  const CARET = [[6,0,3,2],[5,2,5,2],[4,4,3,2],[8,4,3,2],[3,6,3,2],[9,6,3,2],[2,8,3,2],[10,8,3,2],[1,10,3,2],[11,10,3,2],[0,12,3,2],[12,12,3,2]];
  function whole(ctx, w, h, t) {
    const s = Math.min(w, h), cell = 0.024 * s, cx = w / 2, cy = h / 2 - 0.08 * s;
    const a = seg(t, 0.03, 0.12), sy = lerp(0.02, 1, seg(t, 0.08, 0.3)), sx = lerp(1.7, 1, seg(t, 0.03, 0.18));
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(sx, sy);
    ctx.fillStyle = rgba(sy < 0.95 ? "#ffffff" : GLOW, a);
    glow(ctx, s, GLOW, 0.05);
    CARET.forEach(([x, y, cw, ch]) => ctx.fillRect((x - 7.5) * cell, (y - 7) * cell, cw * cell, ch * cell));
    ctx.restore();
    const msg = "One hypothesis. All of physics.";
    const GL = "#%&@$01<>/|=+*";
    const shown = [...msg].map((c, i) => {
      const at = 0.34 + (i / msg.length) * 0.22 + ((i * 7) % 5) * 0.012;
      if (c === " " || t >= at) return c;
      return t >= at - 0.08 ? GL[(i * 13 + Math.floor(t * 120)) % GL.length] : " ";
    }).join("");
    ctx.save();
    ctx.fillStyle = INK;
    glow(ctx, s, GLOW, 0.015);
    ctx.font = `500 ${Math.round(0.042 * s)}px ui-monospace, "SF Mono", Menlo, monospace`;
    ctx.textAlign = "center";
    ctx.fillText(shown, cx, cy + 0.3 * s);
    ctx.restore();
  }

  const SCENES = [
    { id: "observers", draw: observers, seconds: 7 },
    { id: "agreement", draw: agreement, seconds: 13 },
    { id: "reality", draw: reality, seconds: 14 },
    { id: "no-outside", draw: noOutside, seconds: 10 },
    { id: "whole", draw: whole, seconds: 6 },
  ];

  function dust(ctx, w, h, time) {
    const s = Math.min(w, h);
    ctx.save();
    for (let i = 0; i < 70; i++) {
      const r1 = Math.sin(i * 91.7) * 0.5 + 0.5, r2 = Math.sin(i * 37.3) * 0.5 + 0.5, r3 = Math.sin(i * 13.1) * 0.5 + 0.5;
      const x = ((r1 + time * 0.004 * (0.3 + r3)) % 1) * w;
      const y = ((r2 - time * 0.006 * (0.2 + r1)) % 1 + 1) % 1 * h;
      ctx.fillStyle = rgba(GLOW, 0.05 + 0.12 * r3 * (0.6 + 0.4 * Math.sin(time * 1.3 + i)));
      circle(ctx, x, y, (0.6 + 1.6 * r3) * s / 1000);
      ctx.fill();
    }
    ctx.restore();
  }
  const buffers = new WeakMap();
  const canBlur = (() => {
    try { const c = document.createElement("canvas").getContext("2d"); c.filter = "blur(2px)"; return c.filter === "blur(2px)"; } catch (e) { return false; }
  })();
  // draw(): background, scene and bloom. time = seconds since the scene started (drives the dust).
  function draw(ctx, w, h, id, t, time = t * 8) {
    ctx.save();
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, w, h);
    const bg = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.max(w, h) * 0.7);
    bg.addColorStop(0, "rgba(10,40,44,.55)");
    bg.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);
    dust(ctx, w, h, time);
    ctx.restore();
    let buf = buffers.get(ctx.canvas);
    if (!buf) { buf = document.createElement("canvas"); buffers.set(ctx.canvas, buf); }
    if (buf.width !== w || buf.height !== h) { buf.width = w; buf.height = h; }
    const b = buf.getContext("2d");
    b.clearRect(0, 0, w, h);
    SCENES.find((x) => x.id === id).draw(b, w, h, t);
    ctx.drawImage(buf, 0, 0);
    if (canBlur) {
      let sm = buffers.get(buf);
      if (!sm) { sm = document.createElement("canvas"); buffers.set(buf, sm); }
      const sw = Math.max(1, Math.round(w / 4)), shh = Math.max(1, Math.round(h / 4));
      if (sm.width !== sw || sm.height !== shh) { sm.width = sw; sm.height = shh; }
      const m = sm.getContext("2d");
      m.clearRect(0, 0, sw, shh);
      m.filter = `blur(${Math.max(1, Math.round(Math.min(sw, shh) * 0.014))}px)`;
      m.drawImage(buf, 0, 0, sw, shh);
      m.filter = "none";
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = 0.6;
      ctx.drawImage(sm, 0, 0, w, h);
      ctx.restore();
    }
  }
  window.OPHScenes = { SCENES, draw, GLOW, INK, RED, Q, SIM, SIM2 };

  // Page: loop each scene while it is on screen; draw a still frame for reduced motion.
  const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const canvases = [...document.querySelectorAll("canvas[data-scene]")];
  if (canvases.length) Q.shadows = false;
  const live = new Set();
  function fit(c) {
    const dpr = Math.min(1.5, devicePixelRatio || 1), r = c.getBoundingClientRect();
    c.width = Math.round(r.width * dpr);
    c.height = Math.round(r.height * dpr);
  }
  function paint(c, t) {
    draw(c.getContext("2d"), c.width, c.height, c.dataset.scene, t);
  }
  canvases.forEach((c) => {
    fit(c);
    paint(c, c.dataset.scene === "no-outside" ? 0.79 : 0.92);
  });
  addEventListener("resize", () => canvases.forEach((c) => { fit(c); paint(c, 0.92); }));
  if (still || !canvases.length) return;
  const ratio = new Map();
  const io = new IntersectionObserver((es) => es.forEach((e) => ratio.set(e.target, e.intersectionRatio)), { threshold: [0, 0.25, 0.5, 0.75, 1] });
  canvases.forEach((c) => io.observe(c));
  const start = performance.now();
  let lastPaint = 0;
  const tick = (now) => {
    requestAnimationFrame(tick);
    if (now - lastPaint < 33) return;
    lastPaint = now;
    let best = null, br = 0.2;
    ratio.forEach((r, c) => { if (r > br) { br = r; best = c; } });
    live.clear();
    if (best) live.add(best);
    live.forEach((c) => {
      const sc = SCENES.find((x) => x.id === c.dataset.scene);
      const loop = sc.seconds + 2.5;
      const el = (now - start) / 1000;
      const t = Math.min(1, (el % loop) / sc.seconds);
      draw(c.getContext("2d"), c.width, c.height, c.dataset.scene, t, el);
    });
  };
  requestAnimationFrame(tick);
})();
