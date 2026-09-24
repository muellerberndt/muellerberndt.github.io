export function calculateFriction({ notional, gross, fees, slippage, latency, gas }) {
  const values = [notional, gross, fees, slippage, latency, gas];
  if (!values.every(Number.isFinite) || notional <= 0 || [fees, slippage, latency, gas].some(value => value < 0)) return null;
  const costBps = fees + slippage + latency + gas / notional * 10000;
  return {
    costBps,
    costDollars: notional * costBps / 10000,
    netDollars: notional * (gross - costBps) / 10000,
    components: [fees, slippage, latency, gas / notional * 10000],
  };
}

if (typeof document !== "undefined") {
  const stageDetails = [
    ["One small brain, one shared rule.", "Two feeds enter bounded patches. The proposed settled outputs predict one-step market, execution and inventory outcomes under candidate actions. Test those predictions and costed decisions against simple controls."],
    ["Specialize the wiring. Keep the rule.", "Sensory, memory, world-model and action cortices share the same patch mechanism. Compare specialization with an equally resourced single brain. Prediction and coordination must earn their cost."],
    ["Let patches observe other patches.", "Observer patches read prediction mismatch, disagreement and resource use. Learned attention may request another observation or private counterfactual; it never turns surprise directly into a trade. Test against fixed attention."],
  ];
  let stage = 0;
  let paused = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const canvas = document.getElementById("brain-canvas");
  const context = canvas.getContext("2d");
  const motionButton = document.getElementById("motion-toggle");
  let visible = true;
  let width = 0;
  let height = 0;
  let frame = null;
  let phase = 0;
  let lastTimestamp = null;

  function syncMotionLabel() {
    motionButton.textContent = paused ? "Play illustration" : "Pause illustration";
    motionButton.setAttribute("aria-pressed", String(paused));
  }

  function brainNodes() {
    const groups = stage === 0 ? [{ x: 0.5, y: 0.48, r: 0.24, n: 23 }] : [
      { x: 0.28, y: 0.39, r: 0.145, n: 13 },
      { x: 0.7, y: 0.39, r: 0.145, n: 13 },
      { x: 0.5, y: 0.69, r: 0.135, n: 11 },
    ];
    const nodes = [];
    groups.forEach((group, groupIndex) => {
      for (let i = 0; i < group.n; i += 1) {
        const theta = i * 2.39996323;
        const radius = Math.sqrt((i + 0.8) / group.n) * group.r;
        nodes.push({ x: group.x + Math.cos(theta) * radius, y: group.y + Math.sin(theta) * radius, group: groupIndex, index: i });
      }
    });
    if (stage === 2) {
      for (let i = 0; i < 6; i += 1) nodes.push({ x: 0.34 + i * 0.064, y: 0.14 + Math.sin(i * 1.3) * 0.018, group: 3, index: i });
    }
    return { nodes, groups };
  }

  function draw() {
    if (!context || !width || !height) return;
    const { nodes, groups } = brainNodes();
    const scale = Math.min(width, height * 1.45);
    const toPoint = node => ({ x: width / 2 + (node.x - 0.5) * scale, y: height * node.y });
    context.clearRect(0, 0, width, height);
    groups.forEach(group => {
      const center = toPoint(group);
      context.beginPath();
      context.ellipse(center.x, center.y, group.r * scale + 12, group.r * height + 12, 0, 0, Math.PI * 2);
      context.setLineDash([3, 4]);
      context.lineWidth = 0.7;
      context.strokeStyle = "#aeb8a5";
      context.stroke();
      context.setLineDash([]);
    });
    if (stage === 2) {
      context.beginPath();
      context.ellipse(width / 2, height * 0.13, scale * 0.25, height * 0.07, 0, 0, Math.PI * 2);
      context.strokeStyle = "#d75c3280";
      context.setLineDash([3, 4]);
      context.stroke();
      context.setLineDash([]);
    }
    nodes.forEach((node, i) => {
      const a = toPoint(node);
      nodes.slice(i + 1).forEach((other, offset) => {
        const j = i + offset + 1;
        const sameGroup = node.group === other.group;
        const distance = Math.hypot(node.x - other.x, node.y - other.y);
        const localEdge = sameGroup && distance < (stage === 0 ? 0.16 : 0.115) && (i + j) % 3 !== 0;
        const bridge = !sameGroup && (i * 17 + j * 13) % 41 === 0;
        if (!localEdge && !bridge) return;
        const b = toPoint(other);
        context.beginPath();
        context.moveTo(a.x, a.y);
        if (bridge) context.quadraticCurveTo((a.x + b.x) / 2 + 16, (a.y + b.y) / 2 - 12, b.x, b.y);
        else context.lineTo(b.x, b.y);
        context.lineWidth = bridge ? 0.8 : 0.65;
        context.strokeStyle = node.group === 3 || other.group === 3 ? "#d75c3270" : bridge ? "#365adb70" : "#4b5b4359";
        context.stroke();
      });
    });
    const inputPorts = [{ x: 0.05, y: 0.3 }, { x: 0.94, y: 0.3 }];
    inputPorts.forEach((port, i) => {
      const a = toPoint(port);
      const target = toPoint(nodes[i === 0 ? 4 : stage === 0 ? 16 : 18]);
      context.beginPath();
      context.moveTo(a.x, a.y);
      context.bezierCurveTo((a.x + target.x) / 2, a.y, (a.x + target.x) / 2, target.y, target.x, target.y);
      context.strokeStyle = "#365adb85";
      context.lineWidth = 1;
      context.stroke();
      context.fillStyle = "#365adb";
      context.fillRect(a.x - 3.5, a.y - 3.5, 7, 7);
    });
    const output = toPoint({ x: 0.69, y: 0.85 });
    const source = toPoint(nodes[stage === 0 ? 10 : 29]);
    context.beginPath();
    context.moveTo(source.x, source.y);
    context.quadraticCurveTo(source.x, output.y, output.x, output.y);
    context.strokeStyle = "#d75c32a0";
    context.stroke();
    context.fillStyle = "#d75c32";
    context.fillRect(output.x - 3.5, output.y - 3.5, 7, 7);
    nodes.forEach((node, i) => {
      const point = toPoint(node);
      const pulse = (Math.sin(phase * 1.15 - i * 0.51) + 1) / 2;
      const accented = node.group === 3 || i % 8 === 0;
      if (accented) {
        context.beginPath();
        context.arc(point.x, point.y, 5.5 + pulse * 3, 0, Math.PI * 2);
        context.fillStyle = node.group === 3 ? "#d75c3218" : "#365adb12";
        context.fill();
      }
      context.beginPath();
      context.arc(point.x, point.y, accented ? 3 : 1.8 + pulse * 0.5, 0, Math.PI * 2);
      context.fillStyle = node.group === 3 ? "#d75c32" : i % 8 === 0 ? "#365adb" : "#4b5b43";
      context.fill();
    });
  }

  function tick(timestamp) {
    frame = null;
    if (paused || !visible || document.hidden) { lastTimestamp = null; return; }
    if (lastTimestamp !== null) phase += Math.min(timestamp - lastTimestamp, 100) / 1000;
    lastTimestamp = timestamp;
    draw();
    frame = requestAnimationFrame(tick);
  }

  function requestMotion() {
    if (frame !== null) cancelAnimationFrame(frame);
    frame = null;
    lastTimestamp = null;
    draw();
    if (!paused && visible && !document.hidden) frame = requestAnimationFrame(tick);
  }

  function resize() {
    width = canvas.clientWidth;
    height = canvas.clientHeight;
    const ratio = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    context?.setTransform(ratio, 0, 0, ratio, 0, 0);
    draw();
  }

  document.querySelectorAll("[data-stage]").forEach(button => button.addEventListener("click", () => {
    stage = Number(button.dataset.stage);
    document.querySelectorAll("[data-stage]").forEach(item => item.setAttribute("aria-pressed", String(item === button)));
    document.getElementById("stage-title").textContent = stageDetails[stage][0];
    document.getElementById("stage-description").textContent = stageDetails[stage][1];
    draw();
  }));
  motionButton.addEventListener("click", () => { paused = !paused; syncMotionLabel(); requestMotion(); });
  matchMedia("(prefers-reduced-motion: reduce)").addEventListener("change", event => {
    if (event.matches) { paused = true; syncMotionLabel(); requestMotion(); }
  });
  document.addEventListener("visibilitychange", requestMotion);
  new ResizeObserver(resize).observe(canvas);
  new IntersectionObserver(entries => { visible = entries[0].isIntersecting; requestMotion(); }, { threshold: 0.05 }).observe(canvas);
  syncMotionLabel();
  resize();
  requestMotion();

  const modes = {
    replay: {
      glyph: "↠", eyebrow: "FASTER EXPOSURE, THE SAME EVIDENCE", title: ["Speed up exposure.", "Preserve market time."],
      description: "Replay recorded events in causal order. Advance the simulator through the original timestamps, fill delays and reward delays. A month of market events can take less wall-clock time; execution does not become instantaneous.",
      boundary: "Evolution sees training folds only. Chronological validation chooses candidates; sealed future windows test the locked procedure.",
    },
    live: {
      glyph: "◷", eyebrow: "ONE EVENT AT A TIME, AS IT ARRIVES", title: ["Learn from consequences.", "Keep a frozen comparison."],
      description: "Observe fresh events in real time. Record world predictions and hypothetical fills in a shadow portfolio. Matured outcomes teach the champion; a frozen twin measures adaptation. Discrepancies become readback for tested attention controls.",
      boundary: "The genome stays fixed during each life. Architecture changes enter through evaluated descendants; continuous improvement is a hypothesis.",
    },
  };
  document.querySelectorAll("[data-mode]").forEach(button => button.addEventListener("click", () => {
    document.querySelectorAll("[data-mode]").forEach(item => item.setAttribute("aria-pressed", String(item === button)));
    const mode = modes[button.dataset.mode];
    document.getElementById("mode-glyph").textContent = mode.glyph;
    document.getElementById("mode-eyebrow").textContent = mode.eyebrow;
    const title = document.getElementById("mode-title");
    title.replaceChildren(document.createTextNode(mode.title[0]), document.createElement("br"), document.createTextNode(mode.title[1]));
    document.getElementById("mode-description").textContent = mode.description;
    document.getElementById("mode-boundary").textContent = mode.boundary;
  }));

  const form = document.getElementById("friction-form");
  const amount = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const money = { format: value => `${Math.abs(value) >= 1e9 ? value.toExponential(2) : amount.format(value)} USDC` };
  function updateCalculation() {
    const values = Object.fromEntries(Array.from(form.elements).filter(input => input.name).map(input => [input.name, input.valueAsNumber]));
    const result = form.checkValidity() ? calculateFriction(values) : null;
    document.getElementById("calculator-error").hidden = Boolean(result);
    if (!result) {
      document.getElementById("break-even").textContent = "—";
      document.getElementById("break-even").removeAttribute("aria-label");
      document.getElementById("break-even-detail").textContent = "Waiting for valid assumptions";
      document.getElementById("net-result").textContent = "—";
      document.getElementById("net-result").removeAttribute("aria-label");
      ["fee-bar", "slippage-bar", "latency-bar", "gas-bar"].forEach(id => { document.getElementById(id).style.width = "0%"; });
      return;
    }
    const percent = document.createElement("span");
    percent.textContent = "%";
    const breakEven = document.getElementById("break-even");
    const percentValue = result.costBps / 100;
    const percentText = percentValue >= 1e5 ? percentValue.toExponential(2) : percentValue.toFixed(2);
    breakEven.replaceChildren(document.createTextNode(percentText), percent);
    breakEven.classList.toggle("compact-number", percentValue >= 1000);
    breakEven.setAttribute("aria-label", `${amount.format(percentValue)} percent`);
    document.getElementById("break-even-detail").textContent = `${result.costBps.toFixed(1)} bp to cover ${money.format(result.costDollars)} of friction`;
    const net = Math.abs(result.netDollars) < 0.005 ? 0 : result.netDollars;
    const netOutput = document.getElementById("net-result");
    netOutput.textContent = `${net > 0 ? "+" : ""}${money.format(net)}`;
    netOutput.dataset.negative = String(net < 0);
    netOutput.setAttribute("aria-label", `${amount.format(net)} USDC`);
    ["fee-bar", "slippage-bar", "latency-bar", "gas-bar"].forEach((id, i) => {
      document.getElementById(id).style.width = `${result.costBps > 0 ? result.components[i] / result.costBps * 100 : 0}%`;
    });
  }
  form.addEventListener("submit", event => event.preventDefault());
  form.addEventListener("input", updateCalculation);
  form.addEventListener("reset", () => requestAnimationFrame(updateCalculation));
  updateCalculation();
}
