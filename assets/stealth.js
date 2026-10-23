(() => {
  const root = document.documentElement;
  const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const GLYPHS = "▓▒░█<>/\\|=+*#%&@$01";
  const GLOW = "74,241,242";
  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = (s) => s[(Math.random() * s.length) | 0];

  // Text that settles from noise into its label.
  function scramble(el, duration = 900) {
    if (still) return;
    const target = el.dataset.text || (el.dataset.text = el.textContent);
    const settle = [...target].map(() => rand(.25, 1) * duration);
    const start = performance.now();
    cancelAnimationFrame(el._raf);
    const frame = (now) => {
      const t = now - start;
      let done = true;
      el.textContent = [...target].map((c, i) => {
        if (c === " " || t >= settle[i]) return c;
        done = false;
        return pick(GLYPHS);
      }).join("");
      if (!done) el._raf = requestAnimationFrame(frame);
    };
    el._raf = requestAnimationFrame(frame);
  }

  const word = document.querySelector(".word [data-scramble]");
  const labels = [...document.querySelectorAll(".label[data-scramble]")];
  const rootLabel = document.querySelector(".node.root .label");
  const leafLabels = [...document.querySelectorAll(".leaves .label")];

  root.classList.add("booted");
  if (word) setTimeout(() => scramble(word, 1100), 900);
  if (rootLabel) setTimeout(() => scramble(rootLabel, 900), 1500);
  leafLabels.forEach((el, i) => setTimeout(() => scramble(el, 800), 2300 + i * 120));
  labels.forEach((el) => {
    el.addEventListener("mouseenter", () => scramble(el, 380));
    el.addEventListener("focus", () => scramble(el, 380));
  });

  // Film grain.
  const grain = document.getElementById("grain");
  if (grain && !still) {
    const g = grain.getContext("2d");
    let img;
    const size = () => {
      grain.width = Math.min(480, Math.ceil(innerWidth / 3));
      grain.height = Math.min(320, Math.ceil(innerHeight / 3));
      img = g.createImageData(grain.width, grain.height);
    };
    size();
    addEventListener("resize", size);
    setInterval(() => {
      if (document.hidden) return;
      const d = img.data;
      for (let i = 0; i < d.length; i += 4) {
        const v = (Math.random() * 255) | 0;
        d[i] = d[i + 1] = d[i + 2] = v;
        d[i + 3] = 255;
      }
      g.putImageData(img, 0, 0);
    }, 70);
  }

  // Glitch bursts on the caret, sometimes tearing the whole screen.
  const mark = document.getElementById("mark");
  const stage = document.getElementById("stage");
  const tear = document.getElementById("tear");
  let wireJolt = 0;

  function slice() {
    const top = rand(0, 80);
    return `inset(${top.toFixed(1)}% 0 ${Math.max(0, 100 - top - rand(6, 40)).toFixed(1)}% 0)`;
  }

  function burst(big) {
    const frames = big ? 7 : (3 + (Math.random() * 3) | 0);
    let n = 0;
    const amp = big ? 14 : 7;
    const step = () => {
      if (n++ >= frames) {
        mark.classList.remove("glitching");
        stage.classList.remove("shake");
        tear.classList.remove("on");
        wireJolt = 0;
        return;
      }
      const s = mark.style;
      s.setProperty("--rx", `${rand(-amp, amp).toFixed(1)}px`);
      s.setProperty("--ry", `${rand(-2, 2).toFixed(1)}px`);
      s.setProperty("--bx", `${rand(-amp, amp).toFixed(1)}px`);
      s.setProperty("--by", `${rand(-2, 2).toFixed(1)}px`);
      s.setProperty("--rclip", slice());
      s.setProperty("--bclip", slice());
      s.setProperty("--sx", Math.random() < .5 ? `${rand(-amp, amp).toFixed(1)}px` : "0px");
      s.setProperty("--sclip", Math.random() < .35 ? slice() : "none");
      mark.classList.add("glitching");
      if (big) {
        stage.style.setProperty("--shake", `${rand(-10, 10).toFixed(1)}px`);
        stage.style.setProperty("--skew", `${rand(-4, 4).toFixed(1)}deg`);
        stage.style.setProperty("--hue", `${rand(-40, 40).toFixed(0)}deg`);
        stage.classList.add("shake");
        tear.style.top = `${rand(5, 90).toFixed(1)}vh`;
        tear.style.height = `${rand(2, 26).toFixed(0)}px`;
        tear.classList.add("on");
        wireJolt = rand(-12, 12);
      }
      setTimeout(step, rand(30, 75));
    };
    step();
  }

  if (mark && !still) {
    const schedule = () => setTimeout(() => {
      if (!document.hidden) {
        const big = Math.random() < .28;
        burst(big);
        if (big && word && Math.random() < .5) scramble(word, 500);
      }
      schedule();
    }, rand(1800, 6200));
    setTimeout(schedule, 2600);
    mark.addEventListener("pointerenter", () => burst(false));
  }

  // Wires: repair network to physics and AI, signals running both ways.
  const tree = document.getElementById("tree");
  const wires = document.getElementById("wires");
  if (!tree || !wires || !rootLabel || leafLabels.length !== 2) return;
  const w = wires.getContext("2d");
  let segs = [];
  let dpr = 1;

  function layout() {
    dpr = Math.min(2, devicePixelRatio || 1);
    const box = tree.getBoundingClientRect();
    wires.width = Math.round(box.width * dpr);
    wires.height = Math.round(box.height * dpr);
    const r = rootLabel.parentElement.getBoundingClientRect();
    const from = { x: r.left + r.width / 2 - box.left, y: r.bottom + 8 - box.top };
    segs = leafLabels.map((el) => {
      const l = el.getBoundingClientRect();
      return { a: from, b: { x: l.left + l.width / 2 - box.left, y: l.top - box.top } };
    });
  }
  layout();
  new ResizeObserver(layout).observe(tree);

  const pulses = [];
  function spawn() {
    const up = Math.random() < .3;
    pulses.push({ seg: (Math.random() * 2) | 0, t: 0, up, speed: rand(.35, .7) });
  }

  const born = performance.now() + (still ? -9999 : 1800);
  let last = performance.now();
  let nextPulse = 0;

  function draw(now) {
    const dt = Math.min(.05, (now - last) / 1000);
    last = now;
    const grow = Math.max(0, Math.min(1, (now - born) / 700));
    w.setTransform(dpr, 0, 0, dpr, 0, 0);
    w.clearRect(0, 0, wires.width, wires.height);
    w.lineCap = "square";

    segs.forEach(({ a, b }) => {
      const bx = a.x + (b.x - a.x) * grow + wireJolt;
      const by = a.y + (b.y - a.y) * grow;
      w.strokeStyle = `rgba(${GLOW},.26)`;
      w.lineWidth = 1;
      w.beginPath();
      w.moveTo(a.x + wireJolt, a.y);
      w.lineTo(bx, by);
      w.stroke();
      if (grow > 0 && grow < 1) {
        w.fillStyle = `rgb(${GLOW})`;
        w.fillRect(bx - 2, by - 2, 4, 4);
      }
    });

    if (grow >= 1 && !still) {
      if (now > nextPulse) {
        spawn();
        nextPulse = now + rand(350, 1300);
      }
      for (let i = pulses.length - 1; i >= 0; i--) {
        const p = pulses[i];
        p.t += p.speed * dt;
        if (p.t >= 1) { pulses.splice(i, 1); continue; }
        const { a, b } = segs[p.seg];
        const t = p.up ? 1 - p.t : p.t;
        const tail = p.up ? Math.min(1, t + .16) : Math.max(0, t - .16);
        const hx = a.x + (b.x - a.x) * t + wireJolt;
        const hy = a.y + (b.y - a.y) * t;
        const tx = a.x + (b.x - a.x) * tail + wireJolt;
        const ty = a.y + (b.y - a.y) * tail;
        const grad = w.createLinearGradient(tx, ty, hx, hy);
        grad.addColorStop(0, `rgba(${GLOW},0)`);
        grad.addColorStop(1, `rgba(${GLOW},.95)`);
        w.strokeStyle = grad;
        w.lineWidth = 2;
        w.shadowColor = `rgb(${GLOW})`;
        w.shadowBlur = 10;
        w.beginPath();
        w.moveTo(tx, ty);
        w.lineTo(hx, hy);
        w.stroke();
        w.fillStyle = "#e9ffff";
        w.fillRect(Math.round(hx) - 1.5, Math.round(hy) - 1.5, 3, 3);
        w.shadowBlur = 0;
      }
    }

    // Terminals where the wires meet the nodes.
    if (grow > 0) {
      w.fillStyle = `rgb(${GLOW})`;
      const a = segs[0].a;
      w.fillRect(a.x - 2 + wireJolt, a.y - 1, 4, 3);
      if (grow >= 1) segs.forEach(({ b }) => w.fillRect(b.x - 2 + wireJolt, b.y - 2, 4, 3));
    }

    if (!still) requestAnimationFrame(draw);
  }
  requestAnimationFrame(draw);
})();
