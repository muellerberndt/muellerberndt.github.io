"use strict";

// Code-level event checks with a mocked document and canvas. This executes the
// controller without launching a browser or inspecting a rendered webpage.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const model = require("../assets/brain-model.js");
const script = fs.readFileSync(path.join(__dirname, "../assets/brain-explorer.js"), "utf8");
const html = fs.readFileSync(path.join(__dirname, "../_company/pages/cadence.html"), "utf8");
const ids = [...html.matchAll(/\bid="(brain-[^"]+)"/g)].map(match => match[1]);
const copy = value => JSON.parse(JSON.stringify(value));
const signed = value => `${value >= 0 ? "+" : "−"}${Math.abs(value).toFixed(3)}`;

class Events {
  constructor() { this.listeners = new Map(); }
  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) || [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }
  emit(type, event = {}) {
    for (const listener of this.listeners.get(type) || []) listener(event);
  }
}

class Context {
  constructor() { this.calls = []; this.font = "10px sans-serif"; this.textAlign = "start"; }
  clearRect() { this.calls = []; }
  fillText(text, x, y) {
    this.calls.push({ kind: "text", text, x, y, font: this.font, align: this.textAlign });
  }
  setLineDash(value) { this.dash = [...value]; }
  stroke() { this.calls.push({ kind: "stroke", color: this.strokeStyle, dash: this.dash || [] }); }
}
for (const method of ["setTransform", "beginPath", "moveTo", "lineTo", "quadraticCurveTo", "closePath", "fill", "arc"]) {
  Context.prototype[method] = function (...args) { this.calls.push({ kind: method, args }); };
}

class Element extends Events {
  constructor(id, width = 620, height = 365) {
    super();
    this.id = id;
    this.value = "";
    this.textContent = "";
    this.disabled = true;
    this.attributes = {};
    this.children = [];
    this.context = new Context();
    this.bounds = { left: 12, top: 18, width, height };
  }
  setAttribute(name, value) { this.attributes[name] = value; }
  getAttribute(name) { return this.attributes[name]; }
  replaceChildren(...children) { this.children = [...children]; }
  appendChild(child) { this.children.push(child); }
  querySelectorAll(selector) {
    assert.equal(selector, "button");
    return this.children;
  }
  getBoundingClientRect() { return { ...this.bounds }; }
  getContext(type) { assert.equal(type, "2d"); return this.context; }
}

function start({ reduced = false, depth = 2, signal = 0.65, width = 620, height = 365,
                 stepOverride = null, missingRoot = false, missingCanvas = false } = {}) {
  const elements = new Map(ids.map(id => [id, new Element(id, width, height)]));
  const get = id => {
    assert.ok(elements.has(id), `HTML is missing controller element #${id}`);
    return elements.get(id);
  };
  get("brain-signal").value = String(signal);
  get("brain-depth").value = String(depth);
  get("brain-run").textContent = "Run settlement";
  get("brain-energy-trace").bounds.height = 76;
  if (missingCanvas) get("brain-recursive").getContext = () => null;
  const document = new Events();
  document.hidden = false;
  document.querySelector = selector => {
    assert.equal(selector, "#brain-explorer");
    return missingRoot ? null : get("brain-explorer");
  };
  document.getElementById = get;
  document.createElement = tag => {
    assert.equal(tag, "button");
    return new Element("");
  };
  const motion = new Events();
  motion.matches = reduced;
  const pending = new Map();
  const observers = {};
  const trace = { result: null, steps: [], evaluations: [] };
  const wrapped = {
    ...model,
    evaluate(states, input, selectedDepth) {
      const result = model.evaluate(states, input, selectedDepth);
      trace.result = copy(result);
      trace.evaluations.push(copy(result));
      return result;
    },
    step(states, input, selectedDepth) {
      const result = stepOverride ? stepOverride(states, input, selectedDepth)
        : model.step(states, input, selectedDepth);
      trace.steps.push({ before: model.evaluate(states, input, selectedDepth), after: copy(result) });
      trace.result = copy(result);
      return result;
    }
  };
  let timerId = 0;
  const sandbox = {
    document, CadenceIllustration: wrapped, devicePixelRatio: 2,
    matchMedia(query) { assert.equal(query, "(prefers-reduced-motion: reduce)"); return motion; },
    setTimeout(callback, delay) { assert.equal(delay, 60); pending.set(++timerId, callback); return timerId; },
    clearTimeout(id) { pending.delete(id); },
    IntersectionObserver: class {
      constructor(callback) { observers.intersection = callback; }
      observe(element) { assert.equal(element, get("brain-explorer")); }
    },
    ResizeObserver: class {
      constructor(callback) { observers.resize = callback; }
      observe(element) { assert.equal(element, get("brain-explorer")); }
    }
  };
  vm.runInNewContext(script, sandbox, { filename: "brain-explorer.js", timeout: 1000 });
  const click = id => get(id).emit("click");
  const change = (id, value, type) => { get(id).value = String(value); get(id).emit(type); };
  return {
    get, click, trace, pending, observers,
    count: () => Number(get("brain-steps").textContent),
    result: () => copy(trace.result),
    input: value => change("brain-signal", value, "input"),
    depth: value => change("brain-depth", value, "change"),
    motion(value) { motion.matches = value; motion.emit("change"); },
    hidden(value) { document.hidden = value; document.emit("visibilitychange"); },
    intersect(value) { observers.intersection([{ isIntersecting: value }]); },
    drain() {
      let calls = 0;
      while (pending.size) {
        assert.ok(++calls < 500, "animation must terminate within a finite timer budget");
        const [id, callback] = pending.entries().next().value;
        pending.delete(id);
        callback();
      }
      return calls;
    }
  };
}

const stopped = app => {
  assert.equal(app.pending.size, 0, "stop clears the scheduled continuation");
  assert.equal(app.get("brain-run").textContent, "Run settlement");
  assert.equal(app.get("brain-run").getAttribute("aria-pressed"), "false");
};
const displayed = app => {
  const result = app.result();
  assert.equal(app.get("brain-recursive-output").textContent, signed(result.output));
  assert.ok(Number.isFinite(result.energy) && Number.isFinite(result.stationarity));
  assert.ok(result.states.every(Number.isFinite));
};

// Initialization and a manual move use real model equations and actual handlers.
const app = start();
for (const id of ["brain-signal", "brain-depth", "brain-run", "brain-step", "brain-reset"]) {
  assert.equal(app.get(id).disabled, false, `${id} enabled after successful initialization`);
}
stopped(app);
assert.equal(app.get("brain-patch-buttons").children.length, 6);
assert.equal(app.get("brain-output-name").textContent, "R1");
assert.equal(app.count(), 0);
assert.equal(app.get("brain-forward-output").textContent, signed(model.feedForward(0.65, 2).output));
const returnStrokes = app.get("brain-recursive").context.calls.filter(call => call.kind === "stroke" && call.color === "#dcf664");
assert.ok(returnStrokes.length > 0);
assert.ok(returnStrokes.every(call => call.dash.length === 0), "returning influence uses the solid line shown in the legend");
const initialEnergy = app.result().energy;
app.click("brain-step");
assert.equal(app.count(), 1);
assert.ok(app.result().energy < initialEnergy, "manual step decreases the objective");
stopped(app);
displayed(app);

// Moving the slider cancels animation but preserves activity and restarts the
// objective history for the changed sensory constraint.
app.click("brain-run");
assert.equal(app.pending.size, 1);
const retained = app.result().states;
app.input(-0.35);
stopped(app);
assert.equal(app.count(), 0);
assert.deepEqual(app.result().states, retained, "slider retains the settled continuation");
assert.deepEqual(app.result(), model.evaluate(retained, -0.35, 2));
assert.equal(app.get("brain-signal-value").textContent, "−0.350");
assert.equal(app.get("brain-forward-output").textContent, signed(model.feedForward(-0.35, 2).output));
assert.match(app.get("brain-energy-trace").getAttribute("aria-label"), /after 0 steps/);
assert.equal(app.get("brain-energy-trace").context.calls.filter(call => call.kind === "lineTo").length, 2,
  "a changed-input trace contains one objective point and only the two axis segments");

// Inspector buttons track the chosen patch through a reset and depth changes.
app.get("brain-patch-buttons").children[5].emit("click");
assert.equal(app.get("brain-patch-title").textContent, "Recursive observer patch R1");
assert.equal(app.get("brain-state").textContent, signed(app.result().states[5]));
assert.equal(app.get("brain-error").textContent, signed(app.result().errors[5]));
assert.equal(app.get("brain-prediction").textContent, signed(app.result().predictions[5]));
assert.match(app.get("brain-patch-description").textContent, /O0 and O1/);
app.click("brain-reset");
stopped(app);
assert.equal(app.get("brain-signal").value, "-0.35");
assert.equal(app.get("brain-depth").value, "2");
assert.equal(app.count(), 0);
assert.deepEqual(app.result().states, Array(6).fill(0));
assert.equal(app.get("brain-patch-title").textContent, "Recursive observer patch R1");

for (const depth of [0, 1, 2]) {
  app.depth(depth);
  stopped(app);
  assert.deepEqual(app.result().states, Array(2 * (depth + 1)).fill(0));
  assert.equal(app.result().input, -0.35);
  assert.equal(app.count(), 0);
  assert.equal(app.get("brain-patch-buttons").children.length, 2 * (depth + 1));
  assert.equal(app.get("brain-output-name").textContent, ["P1", "O1", "R1"][depth]);
  assert.equal(app.get("brain-forward-output").textContent, signed(model.feedForward(-0.35, depth).output));
  assert.equal(app.get("brain-patch-title").textContent, "Processing patch P1", "selection clamps to a surviving patch");
  assert.equal(app.get("brain-patch-buttons").children.filter(button => button.getAttribute("aria-pressed") === "true").length, 1);
  displayed(app);
}

// Canvas selection is checked against its emitted drawing coordinates, with
// nonzero canvas offsets so client coordinates cannot accidentally be reused.
const canvas = app.get("brain-recursive");
const patchLabel = canvas.context.calls.find(call => call.kind === "text" && call.text === "R0");
canvas.emit("click", { clientX: patchLabel.x + canvas.bounds.left, clientY: patchLabel.y - 4 + canvas.bounds.top });
assert.equal(app.get("brain-patch-title").textContent, "Recursive observer patch R0");
canvas.emit("click", { clientX: -100, clientY: -100 });
assert.equal(app.get("brain-patch-title").textContent, "Recursive observer patch R0");

// Pause/resume, one-step during a run, background and offscreen transitions.
app.click("brain-run");
const pausedCount = app.count();
app.click("brain-run");
stopped(app);
assert.equal(app.count(), pausedCount);
assert.match(app.get("brain-status").textContent, /Paused/);
app.click("brain-run");
assert.ok(app.count() > pausedCount);
assert.equal(app.pending.size, 1);
const beforeManual = app.count();
app.click("brain-step");
stopped(app);
assert.equal(app.count(), beforeManual + 1);
app.click("brain-run");
app.hidden(true);
stopped(app);
assert.match(app.get("brain-status").textContent, /tab is hidden/);
app.hidden(false);
stopped(app);
app.click("brain-run");
app.intersect(false);
stopped(app);
app.intersect(true);
stopped(app);

// Reduced motion can be selected before initialization or during animation.
app.click("brain-reset");
app.click("brain-run");
const beforePreference = app.result().states;
app.motion(true);
stopped(app);
assert.deepEqual(app.result().states, beforePreference);
assert.match(app.get("brain-status").textContent, /reduced motion/);
app.click("brain-run");
stopped(app);
assert.ok(app.count() <= 240);
assert.match(app.get("brain-status").textContent, /Settled|budget|no accepted/);
app.motion(false);
app.click("brain-reset");
app.click("brain-run");
assert.equal(app.pending.size, 1, "animation resumes when reduced motion is disabled");
app.drain();
stopped(app);

let runs = 0;
for (const reduced of [false, true]) {
  for (const depth of [0, 1, 2]) {
    for (const signal of [-1, -0.4, 0, 0.65, 1]) {
      const run = start({ reduced, depth, signal });
      run.click("brain-run");
      if (reduced) assert.equal(run.pending.size, 0, "reduced motion never schedules an animation");
      run.drain();
      stopped(run);
      assert.ok(run.count() > 0 && run.count() <= 240);
      assert.match(run.get("brain-status").textContent, /Settled|budget|no accepted/);
      for (const step of run.trace.steps) {
        assert.ok(step.after.energy <= step.before.energy, "rendered runs descend the actual objective");
      }
      displayed(run);
      runs += 1;
    }
  }
}

// Controlled numerical responses exercise terminal branches that a well-behaved
// default input may not reach. They test the controller, not the model's science.
for (const reduced of [false, true]) {
  const limited = start({ reduced, stepOverride: (states, input, depth) => ({
    ...model.evaluate(states, input, depth), accepted: true, converged: false, stepSize: 1
  }) });
  limited.click("brain-run");
  limited.drain();
  stopped(limited);
  assert.equal(limited.count(), 240);
  assert.equal(limited.trace.steps.length, 240);
  assert.match(limited.get("brain-status").textContent, /Step budget reached/);
  limited.click("brain-run");
  stopped(limited);
  assert.equal(limited.trace.steps.length, 240, "running a completed budget cannot add steps");
}
const refused = start({ stepOverride: (states, input, depth) => ({
  ...model.evaluate(states, input, depth), accepted: false, converged: false, stepSize: 0
}) });
refused.click("brain-run");
stopped(refused);
assert.equal(refused.count(), 0);
assert.match(refused.get("brain-status").textContent, /no accepted step/);

const settled = start({ reduced: true, stepOverride: (states, input, depth) => ({
  ...model.evaluate(states, input, depth), accepted: true, converged: true, stepSize: 0
}) });
settled.click("brain-run");
stopped(settled);
assert.equal(settled.count(), 0, "zero-size converged response adds no phantom step");

// Reflow executes both drawing orientations at narrow and split-panel sizes.
// These mocks validate numerical coordinates, not browser font metrics/layout.
for (const [width, height] of [[278, 450], [335, 450], [371, 365], [419, 365], [420, 365], [620, 365]]) {
  const resized = start({ width, height });
  resized.observers.resize();
  for (const id of ["brain-forward", "brain-recursive"]) {
    const item = resized.get(id);
    assert.equal(item.width, width * 2);
    for (const call of item.context.calls) {
      if (call.kind === "text") {
        assert.ok(Number.isFinite(call.x) && Number.isFinite(call.y));
        assert.ok(call.x >= 0 && call.x <= width, "label anchor lies inside the canvas");
        assert.ok(call.y > 0 && call.y < height, "label baseline lies inside the canvas");
      }
    }
  }
}
assert.doesNotThrow(() => start({ missingRoot: true }));
const noCanvas = start({ missingCanvas: true });
assert.equal(noCanvas.get("brain-run").disabled, true);

console.log(`Brain explorer event checks passed: ${runs} full runs; input/state retention, manual repair, reset, all depths, inspector buttons/canvas selection, pause/resume, visibility, reduced motion, 240-step limit, refusal and responsive drawing coordinates.`);
