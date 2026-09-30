/* A fixed-weight mechanism illustration, not the Cadence runtime or a benchmark.
 * Each patch obeys p=tanh(b+sum(w*signal)), e=x-p. All active states minimize
 * E=.5*sum(e*e)+.5*statePrior*sum(x*x), with the sensory inputs held fixed.
 * Read edges are acyclic. Returning influence comes from full derivatives of
 * this one energy, including recursively recomputed prediction-error signals.
 */
(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.CadenceIllustration = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var STATE_PRIOR = 0.18;
  var BODY_INPUT = 0.2;
  var TOLERANCE = 1e-7;
  var MAX_BACKTRACKS = 40;
  var PATCHES = [
    { id: "P0", name: "Perception 1", level: 0, bias: 0.05 },
    { id: "P1", name: "Perception 2", level: 0, bias: -0.08 },
    { id: "O0", name: "Observer 1", level: 1, bias: 0.1 },
    { id: "O1", name: "Observer 2", level: 1, bias: -0.05 },
    { id: "R0", name: "Recursive observer 1", level: 2, bias: 0.04 },
    { id: "R1", name: "Recursive observer 2", level: 2, bias: -0.07 }
  ];
  var EDGES = [
    ["signal", "P0", "input", 1.15], ["body", "P0", "input", 0.3],
    ["signal", "P1", "input", -0.8], ["body", "P1", "input", 0.65],
    ["P0", "O0", "state", 0.65], ["P1", "O0", "state", -0.3],
    ["P0", "O0", "error", 0.5], ["P1", "O0", "error", -0.25],
    ["P0", "O1", "state", 0.25], ["P1", "O1", "state", 0.65],
    ["P0", "O1", "error", 0.3], ["P1", "O1", "error", 0.5],
    ["O0", "R0", "state", 0.7], ["O1", "R0", "state", -0.3],
    ["O0", "R0", "error", 0.45], ["O1", "R0", "error", -0.25],
    ["O0", "R1", "state", 0.4], ["O1", "R1", "state", 0.65],
    ["O0", "R1", "error", -0.3], ["O1", "R1", "error", 0.5]
  ];
  var INDEX = Object.create(null);
  PATCHES.forEach(function (patch, index) { INDEX[patch.id] = index; });
  var INCOMING = PATCHES.map(function (patch) {
    return EDGES.filter(function (edge) { return edge[1] === patch.id; });
  });

  function depthValue(depth) {
    if (depth === undefined) return 2;
    if (!Number.isInteger(depth) || depth < 0 || depth > 2) {
      throw new RangeError("depth must be 0, 1 or 2");
    }
    return depth;
  }

  function inputValue(input) {
    if (typeof input !== "number" || !Number.isFinite(input) || input < -1 || input > 1) {
      throw new RangeError("input must be a finite number in [-1, 1]");
    }
    return input;
  }

  function bounded(value) { return Math.max(-1, Math.min(1, value)); }
  function zeros(length) { return Array(length).fill(0); }

  function initialStates(depth) {
    return zeros(2 * (depthValue(depth) + 1));
  }

  function topology(depth) {
    depth = depthValue(depth);
    var count = 2 * (depth + 1);
    return {
      depth: depth,
      statePrior: STATE_PRIOR,
      tolerance: TOLERANCE,
      inputs: [
        { id: "signal", name: "Sensory signal", level: -1, clamped: true },
        { id: "body", name: "Body input", level: -1, clamped: true, value: BODY_INPUT }
      ],
      patches: PATCHES.slice(0, count).map(function (patch, index) {
        return { id: patch.id, name: patch.name, index: index, level: patch.level, bias: patch.bias };
      }),
      edges: EDGES.filter(function (edge) { return INDEX[edge[1]] < count; }).map(function (edge) {
        return { source: edge[0], target: edge[1], kind: edge[2], weight: edge[3] };
      }),
      output: PATCHES[count - 1].id
    };
  }

  // Forward-mode analytic differentiation over acyclic error-read dependencies.
  // A derivative row records dependence on EVERY eligible state, not just the
  // patch's own state or a completed lower-population prediction.
  function evaluate(states, input, depth) {
    depth = depthValue(depth);
    input = inputValue(input);
    var count = 2 * (depth + 1);
    if (!Array.isArray(states) || states.length !== count || states.some(function (x) {
      return typeof x !== "number" || !Number.isFinite(x) || x < -1 || x > 1;
    })) throw new RangeError("states must contain " + count + " finite values in [-1, 1]");
    var x = states.slice();
    var predictions = zeros(count);
    var errors = zeros(count);
    var errorDerivatives = [];
    var gradient = x.map(function (value) { return STATE_PRIOR * value; });
    var energy = 0;
    for (var i = 0; i < count; i += 1) {
      var drive = PATCHES[i].bias;
      var driveDerivative = zeros(count);
      INCOMING[i].forEach(function (edge) {
        var source = edge[0], kind = edge[2], weight = edge[3];
        if (kind === "input") {
          drive += weight * (source === "signal" ? input : BODY_INPUT);
        } else {
          var sourceIndex = INDEX[source];
          if (kind === "state") {
            drive += weight * x[sourceIndex];
            driveDerivative[sourceIndex] += weight;
          } else {
            drive += weight * errors[sourceIndex];
            for (var k = 0; k < count; k += 1) {
              driveDerivative[k] += weight * errorDerivatives[sourceIndex][k];
            }
          }
        }
      });
      predictions[i] = Math.tanh(drive);
      errors[i] = x[i] - predictions[i];
      var slope = 1 - predictions[i] * predictions[i];
      errorDerivatives[i] = driveDerivative.map(function (derivative, k) {
        return (i === k ? 1 : 0) - slope * derivative;
      });
      energy += 0.5 * errors[i] * errors[i] + 0.5 * STATE_PRIOR * x[i] * x[i];
      for (var j = 0; j < count; j += 1) gradient[j] += errors[i] * errorDerivatives[i][j];
    }
    // Unit-step projected-gradient residual handles the state-box boundary.
    var stationarity = Math.max.apply(null, x.map(function (value, i) {
      return Math.abs(value - bounded(value - gradient[i]));
    }));
    return {
      states: x, predictions: predictions, errors: errors, gradient: gradient,
      energy: energy, stationarity: stationarity, output: x[count - 1],
      input: input, bodyInput: BODY_INPUT, depth: depth
    };
  }

  function feedForward(input, depth) {
    depth = depthValue(depth);
    input = inputValue(input);
    var states = initialStates(depth);
    var errors = zeros(states.length);
    // This explicitly chooses prediction as state in declaration order. It is
    // the same illustrative relation graph, not a trained feed-forward rival.
    for (var i = 0; i < states.length; i += 1) {
      var drive = PATCHES[i].bias;
      INCOMING[i].forEach(function (edge) {
        var value = edge[2] === "input" ? (edge[0] === "signal" ? input : BODY_INPUT)
          : edge[2] === "state" ? states[INDEX[edge[0]]] : errors[INDEX[edge[0]]];
        drive += edge[3] * value;
      });
      states[i] = Math.tanh(drive);
    }
    return evaluate(states, input, depth);
  }

  function step(states, input, depth) {
    var current = evaluate(states, input, depth);
    if (current.stationarity <= TOLERANCE) {
      return Object.assign({}, current, {
        accepted: true, converged: true, stepSize: 0, backtracks: 0
      });
    }
    var stepSize = 1;
    for (var attempts = 0; attempts < MAX_BACKTRACKS; attempts += 1) {
      var proposed = current.states.map(function (x, i) {
        return bounded(x - stepSize * current.gradient[i]);
      });
      var direction = proposed.reduce(function (total, x, i) {
        return total + current.gradient[i] * (x - current.states[i]);
      }, 0);
      var candidate = evaluate(proposed, input, current.depth);
      if (direction < 0 && candidate.energy <= current.energy + 1e-4 * direction) {
        return Object.assign({}, candidate, {
          accepted: true, converged: candidate.stationarity <= TOLERANCE,
          stepSize: stepSize, backtracks: attempts
        });
      }
      stepSize *= 0.5;
    }
    // A failed search leaves the caller's continuation unchanged. This is a
    // bounded numerical move, not a proof that any run will reach equilibrium.
    return Object.assign({}, current, {
      accepted: false, converged: false, stepSize: 0, backtracks: MAX_BACKTRACKS
    });
  }

  var api = {
    createModel: function () { return api; },
    evaluate: evaluate,
    feedForward: feedForward,
    step: step,
    initialStates: initialStates,
    topology: topology
  };
  return Object.freeze(api);
});
