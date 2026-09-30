"use strict";

// Numerical checks for the website illustration, not research qualification.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const modelPath = path.join(__dirname, "../assets/brain-model.js");
const model = require(modelPath);
const near = (actual, expected, tolerance, label) => {
  assert.ok(Math.abs(actual - expected) <= tolerance,
    `${label}: ${actual} differs from ${expected} by ${Math.abs(actual - expected)}`);
};

// A separate energy evaluator directly follows topology, with no derivatives.
function reference(states, input, depth) {
  const graph = model.topology(depth);
  const errors = {};
  const predictions = [];
  let energy = 0;
  graph.patches.forEach((patch, index) => {
    let drive = patch.bias;
    for (const edge of graph.edges.filter(e => e.target === patch.id)) {
      const sourceIndex = graph.patches.findIndex(p => p.id === edge.source);
      const signal = edge.kind === "input" ? (edge.source === "signal" ? input : 0.2)
        : edge.kind === "state" ? states[sourceIndex] : errors[edge.source];
      drive += edge.weight * signal;
    }
    predictions.push(Math.tanh(drive));
    errors[patch.id] = states[index] - predictions[index];
    energy += 0.5 * errors[patch.id] ** 2 + 0.5 * graph.statePrior * states[index] ** 2;
  });
  return { energy, predictions, errors };
}

let gradientCases = 0, settlementCases = 0;
const layouts = [0, 1, 2, {mode:'flat'}, {mode:'composed'}];
for (const depth of layouts) {
  const graph = model.topology(depth);
  assert.equal(graph.patches.length, typeof depth==='number' ? 2 * (depth + 1) : 6);
  const index = Object.fromEntries(graph.patches.map((p, i) => [p.id, i]));
  for (const edge of graph.edges) {
    if (edge.kind !== "input") assert.ok(index[edge.source] < index[edge.target], "acyclic reads");
  }
  for (const input of [-1, -0.41, 0, 0.37, 1]) {
    for (let fixture = 0; fixture < 4; fixture += 1) {
      const states = graph.patches.map((_, i) => 0.65 * Math.sin((i + 1) * (fixture + 0.73)));
      const saved = states.slice();
      const result = model.evaluate(states, input, depth);
      near(result.energy, reference(states, input, depth).energy, 1e-14, "exact toy objective");
      const h = 1e-6;
      for (let coordinate = 0; coordinate < states.length; coordinate += 1) {
        const plus = states.slice(), minus = states.slice();
        plus[coordinate] += h;
        minus[coordinate] -= h;
        const numeric = (reference(plus, input, depth).energy - reference(minus, input, depth).energy) / (2 * h);
        near(result.gradient[coordinate], numeric, 2e-8, "full analytic state derivative");
      }
      assert.deepEqual(states, saved, "query must not mutate caller state");
      gradientCases += 1;
    }

    const ff = model.feedForward(input, depth);
    ff.errors.forEach(error => near(error, 0, 1e-15, "forward substitution error"));
    const hand = reference(ff.states, input, depth);
    near(ff.energy, hand.energy, 1e-14, "forward uses the same energy");

    // Inputs are clamped: changing internal states cannot change P0/P1's
    // predictions, which only read the supplied signal and constant body input.
    const zero = model.evaluate(model.initialStates(depth), input, depth);
    const high = model.evaluate(graph.patches.map(() => 0.9), input, depth);
    assert.deepEqual(zero.predictions.slice(0, 2), high.predictions.slice(0, 2));
    assert.equal(zero.input, input);
    assert.equal(zero.bodyInput, 0.2);

    // Independent starts include box boundaries and a previous forward answer.
    for (const initial of [model.initialStates(depth), graph.patches.map((_, i) => i % 2 ? -1 : 1), ff.states]) {
      let states = initial.slice();
      let result = model.evaluate(states, input, depth);
      for (let iteration = 0; iteration < 600; iteration += 1) {
        const saved = states.slice();
        const next = model.step(states, input, depth);
        assert.deepEqual(states, saved, "step must not mutate caller state");
        assert.ok(next.energy <= result.energy, "every accepted move must decrease energy");
        assert.ok(next.states.every(x => Number.isFinite(x) && x >= -1 && x <= 1));
        assert.ok(Number.isFinite(next.stationarity) && Number.isFinite(next.output));
        assert.equal(next.input, input);
        if (!next.accepted) assert.deepEqual(next.states, states, "refusal preserves continuation");
        result = next;
        states = next.states;
        if (next.converged || !next.accepted) break;
      }
      assert.ok(result.stationarity < 2e-6, "bounded fixture reaches small stationarity residual");
      assert.ok(result.errors.some(e => Math.abs(e) > 1e-5), "positive-prior compromise is not zero error");
      settlementCases += 1;
    }
  }
}

// Returning influence must actually reach the lower state. Altering R1 changes
// lower-state gradients without changing clamped sensory predictions.
const low = [0.1, -0.2, 0.15, -0.1, 0.2, -0.3];
const changed = low.slice();
changed[5] = 0.7;
const before = model.evaluate(low, 0.5, 2);
const after = model.evaluate(changed, 0.5, 2);
assert.deepEqual(before.predictions.slice(0, 2), after.predictions.slice(0, 2));
assert.ok(before.gradient.slice(0, 2).some((x, i) => Math.abs(x - after.gradient[i]) > 0.01),
  "recursive error derivatives send returning influence to perception");

// Flat patches cannot influence one another. The independently computed
// optimum is p/(1+prior), not the zero-error forward substitution answer.
const flat = {mode:'flat'};
const flatGraph = model.topology(flat);
assert.equal(flatGraph.levels, 1);
assert.ok(flatGraph.edges.every(edge=>edge.kind==='input'));
assert.equal(new Set(flatGraph.patches.map(patch=>patch.level)).size, 1);
assert.equal(flatGraph.patches.at(-1).id, flatGraph.output);
const flatBefore = model.evaluate(low, 0.5, flat);
const flatAfter = model.evaluate(changed, 0.5, flat);
assert.deepEqual(flatBefore.gradient.slice(0,5), flatAfter.gradient.slice(0,5));
for (const input of [-1,-0.4,0,0.65,1]) {
  const forward = model.feedForward(input, flat);
  const optimum = reference(forward.states, input, flat).predictions.map(p=>p/(1+flatGraph.statePrior));
  const exact = model.evaluate(optimum, input, flat);
  assert.ok(exact.stationarity < 1e-14);
  assert.ok(exact.energy < forward.energy);
  let settled = model.evaluate(model.initialStates(flat), input, flat);
  for(let i=0;i<240 && settled.stationarity>flatGraph.tolerance;i++) settled=model.step(settled.states,input,flat);
  settled.states.forEach((x,i)=>near(x,optimum[i],2e-7,'flat settled optimum'));
}

// Ordinary composition already has returning influence. A later state changes
// earlier derivatives without any error ports. Recursion adds further paths.
const composed = {mode:'composed'};
const composedGraph = model.topology(composed);
assert.equal(composedGraph.levels, 3);
assert.ok(composedGraph.edges.some(edge=>edge.kind==='state'));
assert.ok(composedGraph.edges.every(edge=>edge.kind!=='error'));
const composedBefore = model.evaluate(low, 0.5, composed);
const composedAfter = model.evaluate(changed, 0.5, composed);
assert.ok(composedBefore.gradient.slice(2,4).some((x,i)=>Math.abs(x-composedAfter.gradient[i+2])>0.01));
assert.deepEqual(composedBefore.gradient.slice(0,2), composedAfter.gradient.slice(0,2),
  'no direct level-two-to-input derivative in this state-only fixture');
assert.ok(model.topology({mode:'recursive',depth:2}).edges.some(edge=>edge.kind==='error'));
assert.deepEqual(model.evaluate(low, 0.5, {mode:'recursive',depth:2}), before,
  'numeric depth and explicit recursive mode are equivalent');

// Neither metadata nor returned arrays may modify the fixed model.
const graph = model.topology();
graph.edges[0].weight = 900;
graph.patches[0].bias = 900;
assert.deepEqual(model.evaluate(low, 0.5, 2), before);
assert.equal(model.createModel(), model);
assert.throws(() => model.evaluate([0, 0], NaN, 0), /input/);
assert.throws(() => model.evaluate([0, 0], 2, 0), /input/);
assert.throws(() => model.initialStates(3), /depth/);
assert.throws(() => model.evaluate([2, 0], 0, 0), /states/);
assert.throws(() => model.evaluate([0, 0], 0, 2), /states/);
assert.throws(() => model.topology({mode:'unknown'}), /mode/);
assert.throws(() => model.topology({mode:'flat',depth:3}), /depth/);
assert.throws(() => model.topology(null), /layout/);

const browser = {};
vm.createContext(browser);
vm.runInContext(fs.readFileSync(modelPath, "utf8"), browser);
assert.equal(typeof browser.CadenceIllustration.step, "function", "browser global export");
near(browser.CadenceIllustration.evaluate(low, 0.5, 2).energy, before.energy, 1e-14, "browser/CJS parity");
console.log(`Brain illustration checks passed: ${gradientCases} derivative fixtures, ${settlementCases} bounded settlement fixtures, all three patterns, flat exact optimum, state/error returning influence, forward substitution and browser export.`);
