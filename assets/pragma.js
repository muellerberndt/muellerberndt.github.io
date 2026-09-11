/* Pragma Research · reveal-on-scroll, copy buttons, live consensus field */
(function () {
  document.documentElement.classList.add('js');

  var reveals = document.querySelectorAll('.reveal');
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
    }, { rootMargin: '0px 0px -8% 0px' });
    reveals.forEach(function (el) { io.observe(el); });
  } else {
    reveals.forEach(function (el) { el.classList.add('in'); });
  }

  document.querySelectorAll('[data-copy]').forEach(function (b) {
    b.addEventListener('click', function () {
      var lbl = b.querySelector('.lbl');
      if (!navigator.clipboard) return;
      navigator.clipboard.writeText(b.getAttribute('data-copy')).then(function () {
        if (!lbl) return;
        var old = lbl.textContent; lbl.textContent = 'Copied';
        setTimeout(function () { lbl.textContent = old; }, 1400);
      }).catch(function () {});
    });
  });

  document.querySelectorAll('canvas[data-field]').forEach(initField);

  /* A lattice of phase oscillators coupled only to their neighbours (Kuramoto).
     They start scrambled, settle into shared waves, and heal local disturbances. */
  function initField(canvas) {
    var mode = canvas.getAttribute('data-field');
    var ctx = canvas.getContext('2d');
    var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var PHYS = [127, 231, 255], MIND = [255, 179, 107];
    var W = 0, H = 0, nodes = [], edges = [], running = false, onScreen = true, raf = 0, t = 0, nextKick = 5, last = 0;

    function colorAt(x) {
      if (mode === 'phys') return PHYS;
      if (mode === 'mind') return MIND;
      var u = Math.min(1, Math.max(0, (x / W - 0.42) / 0.46));
      return [0, 1, 2].map(function (i) { return Math.round(PHYS[i] + (MIND[i] - PHYS[i]) * u); });
    }

    function build() {
      var r = canvas.getBoundingClientRect();
      var dpr = Math.min(2, window.devicePixelRatio || 1);
      W = r.width; H = r.height;
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      var gap = W < 700 ? 44 : 52;
      nodes = []; edges = [];
      var row = 0;
      for (var y = gap * 0.4; y < H + gap; y += gap * 0.866, row++) {
        for (var x = (row % 2 ? gap * 0.5 : 0); x < W + gap; x += gap) {
          var nx = x + (Math.random() - 0.5) * gap * 0.55, ny = y + (Math.random() - 0.5) * gap * 0.55;
          nodes.push({ x: nx, y: ny, th: Math.random() * Math.PI * 2, w: 1 + (Math.random() - 0.5) * 0.45, nb: [], c: colorAt(nx) });
        }
      }
      var R2 = Math.pow(gap * 1.32, 2);
      for (var i = 0; i < nodes.length; i++) {
        for (var j = i + 1; j < nodes.length; j++) {
          var dx = nodes[i].x - nodes[j].x, dy = nodes[i].y - nodes[j].y;
          if (dx * dx + dy * dy < R2) { nodes[i].nb.push(j); nodes[j].nb.push(i); edges.push(i, j); }
        }
      }
    }

    var dth = new Float32Array(0);
    function step(dt) {
      if (dth.length !== nodes.length) dth = new Float32Array(nodes.length);
      var K = 1.7;
      for (var i = 0; i < nodes.length; i++) {
        var a = nodes[i], s = 0;
        for (var k = 0; k < a.nb.length; k++) s += Math.sin(nodes[a.nb[k]].th - a.th);
        dth[i] = a.w + K * s / Math.max(1, a.nb.length);
      }
      for (var m = 0; m < nodes.length; m++) nodes[m].th += dth[m] * dt;
    }

    function kick(x, y, rad) {
      var r2 = rad * rad;
      for (var i = 0; i < nodes.length; i++) {
        var n = nodes[i], dx = n.x - x, dy = n.y - y;
        if (dx * dx + dy * dy < r2) n.th += (Math.random() - 0.5) * Math.PI * 2.2;
      }
    }

    function draw() {
      ctx.clearRect(0, 0, W, H);
      ctx.lineWidth = 1;
      for (var e = 0; e < edges.length; e += 2) {
        var a = nodes[edges[e]], b = nodes[edges[e + 1]];
        var agree = (1 + Math.cos(a.th - b.th)) / 2;
        var al = 0.03 + 0.24 * agree * agree * agree;
        var c = a.c;
        ctx.strokeStyle = 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + al.toFixed(3) + ')';
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      }
      for (var i = 0; i < nodes.length; i++) {
        var n = nodes[i], p = (1 + Math.sin(n.th)) / 2, cc = n.c;
        ctx.fillStyle = 'rgba(' + cc[0] + ',' + cc[1] + ',' + cc[2] + ',' + (0.22 + 0.72 * p).toFixed(3) + ')';
        ctx.beginPath(); ctx.arc(n.x, n.y, 1.1 + 2.3 * p, 0, Math.PI * 2); ctx.fill();
      }
    }

    function frame(now) {
      var dt = Math.min(0.05, (now - last) / 1000); last = now; t += dt;
      step(dt);
      if (t > nextKick) { kick(W * (0.35 + Math.random() * 0.6), Math.random() * H, 80 + Math.random() * 90); nextKick = t + 5 + Math.random() * 3; }
      draw();
      raf = requestAnimationFrame(frame);
    }
    function start() { if (running || reduce || !onScreen || document.hidden) return; running = true; last = performance.now(); raf = requestAnimationFrame(frame); }
    function stop() { running = false; cancelAnimationFrame(raf); }
    function still() { for (var k = 0; k < 500; k++) step(0.03); draw(); }

    build();
    if (reduce) still(); else start();

    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (es) { onScreen = es[0].isIntersecting; if (onScreen) start(); else stop(); }).observe(canvas);
    }
    document.addEventListener('visibilitychange', function () { if (document.hidden) stop(); else start(); });

    var lastW = W, rt;
    window.addEventListener('resize', function () {
      clearTimeout(rt);
      rt = setTimeout(function () {
        var w = canvas.getBoundingClientRect().width;
        if (Math.abs(w - lastW) < 2) return;
        lastW = w; build(); if (reduce) still();
      }, 160);
    });

    var host = canvas.closest('[data-field-host]') || canvas, lastKick = 0;
    host.addEventListener('pointermove', function (ev) {
      if (reduce) return;
      var now = performance.now(); if (now - lastKick < 70) return; lastKick = now;
      var r = canvas.getBoundingClientRect();
      kick(ev.clientX - r.left, ev.clientY - r.top, 56);
    });
  }
})();

/* ---- polish layer: spotlight, count-up, live icosahedron, live settlement ---- */
(function () {
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  function hexRGB(h) { h = h.replace('#', ''); return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]; }
  function rgba(c, a) { return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a.toFixed(3) + ')'; }
  function whenVisible(el, on, off) {
    if (!('IntersectionObserver' in window)) { on(); return; }
    new IntersectionObserver(function (es) { es[0].isIntersecting ? on() : off(); }).observe(el);
  }
  function fit(canvas, ctx) {
    var r = canvas.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.max(1, Math.round(r.width * dpr)); canvas.height = Math.max(1, Math.round(r.height * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { w: r.width, h: r.height };
  }

  /* cursor spotlight */
  document.querySelectorAll('.spot').forEach(function (el) {
    el.addEventListener('pointermove', function (e) {
      var r = el.getBoundingClientRect();
      el.style.setProperty('--mx', (e.clientX - r.left) + 'px');
      el.style.setProperty('--my', (e.clientY - r.top) + 'px');
    });
  });

  /* count-up */
  document.querySelectorAll('[data-count]').forEach(function (el) {
    var txt = el.textContent, m = txt.match(/[\d][\d,]*/);
    if (!m || reduce) return;
    var target = parseInt(m[0].replace(/,/g, ''), 10), pre = txt.slice(0, m.index), post = txt.slice(m.index + m[0].length), done = false;
    el.textContent = pre + '0' + post;
    whenVisible(el, function () {
      if (done) return; done = true;
      var t0 = performance.now(), dur = 1600;
      (function tick(now) {
        var u = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - u, 4);
        el.textContent = pre + Math.round(target * e).toLocaleString('en-US') + post;
        if (u < 1) requestAnimationFrame(tick);
      })(t0);
    }, function () {});
  });

  /* rotating icosahedron: the twelve-port observer screen, with records travelling along edges */
  document.querySelectorAll('canvas[data-icosa]').forEach(function (canvas) {
    var ctx = canvas.getContext('2d'), col = hexRGB(canvas.getAttribute('data-icosa') || '#7fe7ff');
    var p = (1 + Math.sqrt(5)) / 2, V = [], E = [];
    [-1, 1].forEach(function (a) { [-p, p].forEach(function (b) { V.push([0, a, b], [a, b, 0], [b, 0, a]); }); });
    for (var i = 0; i < 12; i++) for (var j = i + 1; j < 12; j++) {
      var d = 0; for (var k = 0; k < 3; k++) d += Math.pow(V[i][k] - V[j][k], 2);
      if (Math.abs(d - 4) < 1e-6) E.push([i, j]);
    }
    var ay = 0.6, ax = 0.36, vy = 0.0026, vx = 0.0009, size = { w: 0, h: 0 }, running = false, raf = 0;
    var pulses = [], drag = null;
    function spawn() { var e = E[(Math.random() * E.length) | 0]; pulses.push({ e: Math.random() < 0.5 ? e : [e[1], e[0]], t: 0, v: 0.008 + Math.random() * 0.01 }); }
    for (var s = 0; s < 7; s++) { spawn(); pulses[s].t = Math.random(); }
    function proj() {
      var s = Math.min(size.w, size.h) * 0.215, cx = size.w / 2, cy = size.h / 2;
      var cyA = Math.cos(ay), syA = Math.sin(ay), cxA = Math.cos(ax), sxA = Math.sin(ax);
      return V.map(function (v) {
        var x = cyA * v[0] + syA * v[2], z = -syA * v[0] + cyA * v[2], y = v[1];
        var y2 = cxA * y - sxA * z, z2 = sxA * y + cxA * z;
        return [cx + s * x, cy - s * y2, z2 / 1.902];
      });
    }
    function draw() {
      var P = proj(), w = size.w, h = size.h;
      ctx.clearRect(0, 0, w, h);
      var R = Math.min(w, h) * 0.215 * 1.902, M = Math.min(w, h) / 2;
      var g = ctx.createRadialGradient(w / 2, h / 2, R * 0.1, w / 2, h / 2, M);
      g.addColorStop(0, rgba(col, 0.10)); g.addColorStop(1, rgba(col, 0));
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(w / 2, h / 2, M, 0, Math.PI * 2); ctx.fill();
      ctx.setLineDash([2, 6]); ctx.strokeStyle = rgba(col, 0.16); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(w / 2, h / 2, Math.min(R + 14, M - 2), 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
      E.slice().sort(function (a, b) { return (P[a[0]][2] + P[a[1]][2]) - (P[b[0]][2] + P[b[1]][2]); }).forEach(function (e) {
        var z = (P[e[0]][2] + P[e[1]][2]) / 2, a = 0.1 + 0.62 * (z + 1) / 2;
        ctx.strokeStyle = rgba(col, a); ctx.lineWidth = 0.8 + 0.7 * (z + 1) / 2;
        ctx.beginPath(); ctx.moveTo(P[e[0]][0], P[e[0]][1]); ctx.lineTo(P[e[1]][0], P[e[1]][1]); ctx.stroke();
      });
      pulses.forEach(function (q) {
        var A = P[q.e[0]], B = P[q.e[1]], x = A[0] + (B[0] - A[0]) * q.t, y = A[1] + (B[1] - A[1]) * q.t, z = A[2] + (B[2] - A[2]) * q.t;
        var a = 0.35 + 0.65 * (z + 1) / 2, gg = ctx.createRadialGradient(x, y, 0, x, y, 10);
        gg.addColorStop(0, rgba([255, 255, 255], a)); gg.addColorStop(0.3, rgba(col, a * 0.8)); gg.addColorStop(1, rgba(col, 0));
        ctx.fillStyle = gg; ctx.beginPath(); ctx.arc(x, y, 10, 0, Math.PI * 2); ctx.fill();
      });
      P.map(function (q, i) { return [q, i]; }).sort(function (a, b) { return a[0][2] - b[0][2]; }).forEach(function (it) {
        var q = it[0], f = (q[2] + 1) / 2;
        ctx.strokeStyle = rgba(col, 0.1 + 0.25 * f); ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(q[0], q[1], 5 + 6 * f, 0, Math.PI * 2); ctx.stroke();
        ctx.fillStyle = rgba(col, 0.3 + 0.7 * f);
        ctx.beginPath(); ctx.arc(q[0], q[1], 1.6 + 2.2 * f, 0, Math.PI * 2); ctx.fill();
      });
    }
    function frame() {
      if (!drag) { ay += vy; ax += vx; }
      pulses.forEach(function (q) { q.t += q.v; });
      for (var i = pulses.length - 1; i >= 0; i--) if (pulses[i].t >= 1) {
        var end = pulses[i].e[1], nb = E.filter(function (e) { return e[0] === end || e[1] === end; }), e = nb[(Math.random() * nb.length) | 0];
        pulses[i] = { e: e[0] === end ? e : [e[1], e[0]], t: 0, v: 0.008 + Math.random() * 0.01 };
      }
      draw(); raf = requestAnimationFrame(frame);
    }
    function start() { if (running || reduce) return; running = true; raf = requestAnimationFrame(frame); }
    function stop() { running = false; cancelAnimationFrame(raf); }
    size = fit(canvas, ctx); draw();
    whenVisible(canvas, start, stop);
    window.addEventListener('resize', function () { size = fit(canvas, ctx); draw(); });
    canvas.addEventListener('pointerdown', function (e) { drag = [e.clientX, e.clientY, ay, ax]; canvas.setPointerCapture(e.pointerId); });
    canvas.addEventListener('pointermove', function (e) { if (!drag) return; ay = drag[2] + (e.clientX - drag[0]) * 0.008; ax = drag[3] + (e.clientY - drag[1]) * 0.008; if (reduce) draw(); });
    canvas.addEventListener('pointerup', function () { drag = null; });
    canvas.addEventListener('pointercancel', function () { drag = null; });
  });

  /* live settlement: units start noisy, relax to rest, then a new input arrives */
  document.querySelectorAll('canvas[data-settle]').forEach(function (canvas) {
    var ctx = canvas.getContext('2d'), col = hexRGB(canvas.getAttribute('data-settle') || '#ffb36b');
    var n = 7, size = { w: 0, h: 0 }, hist = [], y = [], v = [], rest = [], running = false, raf = 0, t = 0, next = 0, L = 0;
    function newInput() {
      for (var i = 0; i < n; i++) { rest[i] = 0.12 + 0.76 * (i + Math.random() * 0.6) / n; v[i] = (Math.random() - 0.5) * 0.09; }
      next = t + 5.2;
    }
    function reset() {
      size = fit(canvas, ctx); L = Math.max(40, Math.floor((size.w - 46) / 2.2));
      hist = []; for (var i = 0; i < n; i++) { y[i] = Math.random(); v[i] = 0; hist.push([]); }
      newInput();
    }
    function step() {
      t += 1 / 60;
      if (t > next) newInput();
      for (var i = 0; i < n; i++) {
        var pull = rest[i] - y[i], nb = 0;
        if (i > 0) nb += y[i - 1] - y[i] + (rest[i] - rest[i - 1]);
        if (i < n - 1) nb += y[i + 1] - y[i] - (rest[i + 1] - rest[i]);
        v[i] = v[i] * 0.94 + 0.018 * pull + 0.004 * nb;
        y[i] += v[i];
        hist[i].push(y[i]); if (hist[i].length > L) hist[i].shift();
      }
    }
    function draw() {
      var w = size.w, h = size.h, pad = 14, right = w - 30, dx = (right - 16) / L;
      ctx.clearRect(0, 0, w, h);
      ctx.setLineDash([2, 5]); ctx.strokeStyle = rgba(col, 0.22); ctx.beginPath(); ctx.moveTo(right, pad); ctx.lineTo(right, h - pad); ctx.stroke(); ctx.setLineDash([]);
      for (var i = 0; i < n; i++) {
        var H = hist[i], x0 = right - H.length * dx;
        var g = ctx.createLinearGradient(x0, 0, right, 0); g.addColorStop(0, rgba(col, 0)); g.addColorStop(0.7, rgba(col, 0.75)); g.addColorStop(1, rgba(col, 1));
        ctx.strokeStyle = g; ctx.lineWidth = 1.4; ctx.beginPath();
        for (var k = 0; k < H.length; k++) { var yy = pad + (h - 2 * pad) * H[k], xx = x0 + k * dx; k ? ctx.lineTo(xx, yy) : ctx.moveTo(xx, yy); }
        ctx.stroke();
        var yl = pad + (h - 2 * pad) * y[i], calm = Math.max(0, 1 - Math.abs(v[i]) * 90);
        ctx.strokeStyle = rgba(col, 0.15 + 0.35 * calm); ctx.beginPath(); ctx.arc(right + 12, yl, 8 + 3 * calm, 0, Math.PI * 2); ctx.stroke();
        ctx.fillStyle = rgba(col, 0.5 + 0.5 * calm); ctx.beginPath(); ctx.arc(right + 12, yl, 3.4, 0, Math.PI * 2); ctx.fill();
      }
    }
    function frame() { step(); draw(); raf = requestAnimationFrame(frame); }
    function start() { if (running || reduce) return; running = true; raf = requestAnimationFrame(frame); }
    function stop() { running = false; cancelAnimationFrame(raf); }
    reset();
    for (var w = 0; w < L; w++) step();
    draw();
    whenVisible(canvas, start, stop);
    var lw = size.w; window.addEventListener('resize', function () { var nw = canvas.getBoundingClientRect().width; if (Math.abs(nw - lw) > 2) { lw = nw; reset(); for (var w = 0; w < L; w++) step(); draw(); } });
  });
})();

/* ---- OPH visualisations: universe emergence, observer patch detuning ---- */
(function () {
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var CY = [127, 231, 255], WARM = [255, 138, 110];
  function rgba(c, a) { return 'rgba(' + (c[0] | 0) + ',' + (c[1] | 0) + ',' + (c[2] | 0) + ',' + (a < 0 ? 0 : a > 1 ? 1 : a).toFixed(3) + ')'; }
  function mix(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
  function ramp(a, b, t) { var u = (t - a) / (b - a); u = u < 0 ? 0 : u > 1 ? 1 : u; return u * u * (3 - 2 * u); }
  function fit(canvas, ctx) {
    var r = canvas.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.max(1, Math.round(r.width * dpr)); canvas.height = Math.max(1, Math.round(r.height * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); return { w: r.width, h: r.height };
  }
  function whenVisible(el, on, off) {
    if (!('IntersectionObserver' in window)) { on(); return; }
    new IntersectionObserver(function (es) { es[0].isIntersecting ? on() : off(); }, { rootMargin: '80px' }).observe(el);
  }

  /* Universe emergence: scattered patches -> records -> overlaps -> repair -> one shared world */
  document.querySelectorAll('canvas[data-emergence]').forEach(function (canvas) {
    var ctx = canvas.getContext('2d');
    var steps = canvas.getAttribute('data-steps') ? document.querySelector(canvas.getAttribute('data-steps')) : null;
    var W = 0, H = 0, nodes = [], edges = [], waves = [], raf = 0, running = false, last = 0, u = 0, stage = -1, nextWave = 0;
    var DUR = 27;

    function scatter(n) { n.x = W / 2 + (Math.random() - 0.5) * W * 0.92; n.y = H / 2 + (Math.random() - 0.5) * H * 0.86; n.th = Math.random() * Math.PI * 2; }

    function build() {
      var r = fit(canvas, ctx); W = r.w; H = r.h;
      var gap = W < 620 ? 50 : 60;
      var cols = Math.max(4, Math.floor((W - 46) / gap)), rows = Math.max(3, Math.floor((H - 46) / (gap * 0.87)));
      var ox = (W - ((cols - 1) * gap + gap * 0.5)) / 2, oy = (H - (rows - 1) * gap * 0.87) / 2;
      nodes = []; edges = []; waves = [];
      for (var j = 0; j < rows; j++) for (var i = 0; i < cols; i++) {
        var n = { tx: ox + i * gap + (j % 2 ? gap * 0.5 : 0), ty: oy + j * gap * 0.87, w: 1.05 + (Math.random() - 0.5) * 0.7, nb: [] };
        scatter(n); nodes.push(n);
      }
      var R2 = Math.pow(gap * 1.12, 2);
      for (var a = 0; a < nodes.length; a++) for (var b = a + 1; b < nodes.length; b++) {
        var dx = nodes[a].tx - nodes[b].tx, dy = nodes[a].ty - nodes[b].ty;
        if (dx * dx + dy * dy < R2) { nodes[a].nb.push(b); nodes[b].nb.push(a); edges.push(a, b); }
      }
    }

    function setStage(s) {
      if (s === stage) return; stage = s;
      if (!steps) return;
      var li = steps.children;
      for (var i = 0; i < li.length; i++) li[i].className = i === s ? 'on' : '';
    }

    function step(dt) {
      var spring = ramp(0.34, 0.62, u) * 3.0, K = 3.4 * ramp(0.54, 0.80, u);
      for (var i = 0; i < nodes.length; i++) {
        var n = nodes[i];
        n.x += (n.tx - n.x) * Math.min(1, spring * dt);
        n.y += (n.ty - n.y) * Math.min(1, spring * dt);
        var s = 0;
        for (var k = 0; k < n.nb.length; k++) s += Math.sin(nodes[n.nb[k]].th - n.th);
        n.d = n.w + (n.nb.length ? K * s / n.nb.length : 0);
      }
      for (var m = 0; m < nodes.length; m++) nodes[m].th += nodes[m].d * dt;
    }

    function draw() {
      var rec = ramp(0.15, 0.30, u), eA = ramp(0.36, 0.56, u), world = ramp(0.80, 0.95, u), out = 1 - ramp(0.965, 1, u);
      ctx.clearRect(0, 0, W, H);
      if (world > 0.02) {
        var g = ctx.createRadialGradient(W / 2, H / 2, 10, W / 2, H / 2, Math.max(W, H) * 0.6);
        g.addColorStop(0, rgba(CY, 0.10 * world * out)); g.addColorStop(1, rgba(CY, 0));
        ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      }
      for (var q = waves.length - 1; q >= 0; q--) {
        var wv = waves[q], age = (performance.now() - wv.t0) / 1000, rr = age * 190;
        if (age > 2.6) { waves.splice(q, 1); continue; }
        ctx.strokeStyle = rgba(CY, 0.22 * (1 - age / 2.6) * world * out); ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(wv.x, wv.y, rr, 0, Math.PI * 2); ctx.stroke();
      }
      ctx.lineWidth = 1;
      for (var e = 0; e < edges.length; e += 2) {
        var a = nodes[edges[e]], b = nodes[edges[e + 1]];
        var agree = (1 + Math.cos(a.th - b.th)) / 2;
        var c = mix(WARM, CY, agree);
        ctx.strokeStyle = rgba(c, eA * out * (0.13 + 0.30 * agree));
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      }
      for (var i = 0; i < nodes.length; i++) {
        var n = nodes[i], p = (1 + Math.sin(n.th)) / 2;
        if (rec > 0.02) {
          ctx.strokeStyle = rgba(CY, rec * out * (0.10 + 0.22 * p)); ctx.lineWidth = 1;
          ctx.beginPath(); ctx.arc(n.x, n.y, 7 + 2 * p, 0, Math.PI * 2); ctx.stroke();
        }
        ctx.fillStyle = rgba(CY, out * (0.25 + 0.7 * p));
        ctx.beginPath(); ctx.arc(n.x, n.y, 1.5 + 2.2 * p, 0, Math.PI * 2); ctx.fill();
      }
    }

    function frame(now) {
      var dt = Math.min(0.05, (now - last) / 1000); last = now;
      var prev = u; u += dt / DUR;
      if (u >= 1) { u -= 1; for (var i = 0; i < nodes.length; i++) scatter(nodes[i]); waves = []; }
      if (u > 0.82 && now > nextWave) { var n = nodes[(Math.random() * nodes.length) | 0]; waves.push({ x: n.x, y: n.y, t0: now }); nextWave = now + 2000; }
      step(dt); draw();
      setStage(u < 0.15 ? 0 : u < 0.32 ? 1 : u < 0.54 ? 2 : u < 0.80 ? 3 : 4);
      raf = requestAnimationFrame(frame);
    }
    function start() { if (running || reduce) return; running = true; last = performance.now(); raf = requestAnimationFrame(frame); }
    function stop() { running = false; cancelAnimationFrame(raf); }

    build();
    if (reduce) { u = 0.9; for (var i = 0; i < 900; i++) step(0.03); draw(); setStage(4); } else start();
    whenVisible(canvas, start, stop);
    var lw = W;
    window.addEventListener('resize', function () {
      var nw = canvas.getBoundingClientRect().width;
      if (Math.abs(nw - lw) < 2) return; lw = nw; build();
      if (reduce) { for (var i = 0; i < 900; i++) step(0.03); draw(); }
    });
  });

  /* Observer patch detuning: mean-field Kuramoto with a spread the reader controls */
  document.querySelectorAll('canvas[data-detune]').forEach(function (canvas) {
    var ctx = canvas.getContext('2d');
    var host = canvas.closest('.viz') || document;
    var input = host.querySelector('[data-detune-input]');
    var outD = host.querySelector('[data-detune-out="d"]'), outR = host.querySelector('[data-detune-out="r"]'), outS = host.querySelector('[data-detune-out="state"]');
    var N = 28, th = [], base = [], D = 0.3, K = 1.0, W = 0, H = 0, raf = 0, running = false, last = 0, rs = 1;
    for (var i = 0; i < N; i++) { base[i] = ((i + 0.5) / N) * 2 - 1; th[i] = Math.random() * Math.PI * 2; }
    for (var s = N - 1; s > 0; s--) { var j = (Math.random() * (s + 1)) | 0, t = base[s]; base[s] = base[j]; base[j] = t; }

    function order() {
      var sx = 0, sy = 0;
      for (var i = 0; i < N; i++) { sx += Math.cos(th[i]); sy += Math.sin(th[i]); }
      return { r: Math.sqrt(sx * sx + sy * sy) / N, psi: Math.atan2(sy, sx) };
    }
    function step(dt) {
      var o = order();
      for (var i = 0; i < N; i++) th[i] += (1 + base[i] * D + K * o.r * Math.sin(o.psi - th[i])) * dt;
      rs += (o.r - rs) * Math.min(1, dt * 2.4);
      return o;
    }
    function readout() {
      if (outD) outD.textContent = D.toFixed(2);
      if (outR) outR.textContent = rs.toFixed(2);
      if (outS) {
        var s = rs > 0.62 ? ['Consensus holds', ''] : rs > 0.3 ? ['Consensus fraying', ' mid'] : ['Consensus breaks', ' warn'];
        outS.textContent = s[0]; outS.className = 'state' + s[1];
      }
    }
    function draw() {
      var o = order(), R = Math.min(W * 0.30, H * 0.30), cx = W / 2, cy = H * 0.42;
      ctx.clearRect(0, 0, W, H);
      ctx.strokeStyle = rgba(CY, 0.18); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([2, 6]); ctx.strokeStyle = rgba(CY, 0.10);
      ctx.beginPath(); ctx.arc(cx, cy, R * 0.62, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
      for (var i = 0; i < N; i++) {
        var a = th[i], near = (1 + Math.cos(a - o.psi)) / 2, c = mix(WARM, CY, near);
        var x = cx + Math.cos(a) * R, y = cy + Math.sin(a) * R;
        ctx.fillStyle = rgba(c, 0.45 + 0.5 * near);
        ctx.beginPath(); ctx.arc(x, y, 3.6, 0, Math.PI * 2); ctx.fill();
      }
      var ax = cx + Math.cos(o.psi) * R * o.r, ay = cy + Math.sin(o.psi) * R * o.r;
      var ac = mix(WARM, CY, Math.min(1, o.r * 1.4));
      ctx.strokeStyle = rgba(ac, 0.85); ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(ax, ay); ctx.stroke();
      ctx.fillStyle = rgba(ac, 0.95);
      ctx.beginPath(); ctx.arc(ax, ay, 4.2, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = rgba([150, 163, 180], 0.75); ctx.font = '500 9px "JetBrains Mono",monospace'; ctx.textAlign = 'center';
      ctx.fillText('PHASE OF EACH PATCH', cx, cy - R - 14);
      var bw = Math.min(W - 44, N * 22), x0 = (W - bw) / 2, tw = bw / N, by = H - 46;
      for (var k = 0; k < N; k++) {
        var p = (1 + Math.sin(th[k])) / 2, cc = mix(WARM, CY, Math.min(1, o.r * 1.4));
        ctx.fillStyle = rgba(cc, 0.12 + 0.78 * p);
        ctx.fillRect(x0 + k * tw + 1.5, by, tw - 3, 26);
      }
      ctx.fillStyle = rgba([150, 163, 180], 0.75);
      ctx.fillText('THE PATCHES, PULSING', cx, by + 44);
    }
    function frame(now) { var dt = Math.min(0.05, (now - last) / 1000); last = now; step(dt); draw(); readout(); raf = requestAnimationFrame(frame); }
    function start() { if (running || reduce) return; running = true; last = performance.now(); raf = requestAnimationFrame(frame); }
    function stop() { running = false; cancelAnimationFrame(raf); }
    function settle() { for (var i = 0; i < 600; i++) step(0.03); rs = order().r; draw(); readout(); }

    var r0 = fit(canvas, ctx); W = r0.w; H = r0.h;
    if (input) {
      D = parseInt(input.value, 10) / 100;
      input.addEventListener('input', function () { D = parseInt(input.value, 10) / 100; if (reduce) settle(); });
    }
    settle();
    if (!reduce) start();
    whenVisible(canvas, start, stop);
    var lw = W;
    window.addEventListener('resize', function () {
      var nw = canvas.getBoundingClientRect().width;
      if (Math.abs(nw - lw) < 2) return; lw = nw; var r = fit(canvas, ctx); W = r.w; H = r.h; draw();
    });
  });
})();
