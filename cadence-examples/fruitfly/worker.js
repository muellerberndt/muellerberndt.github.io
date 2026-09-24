// The brain in a worker: the flight sub-net settles here, off the drawing thread.
// Messages in: {type:"init", url} then {type:"run", stimuli:{channelSet: level}, steps:K}.
// Messages out: {type:"ready", n, edges, members, populations} then, per run,
// {type:"state", readouts:{group:mean}, active, s: Float32Array (transferred), steps}.
import { FlyBrain } from "./brain.js";
import { GROUPS } from "./motor.js";

let brain = null, readoutNames = [];

self.onmessage = async (e) => {
  const m = e.data;
  if (m.type === "init") {
    const payload = await (await fetch(m.url)).json();
    brain = new FlyBrain(payload);
    readoutNames = [];
    for (const g of GROUPS) for (const side of ["left", "right"]) if (brain.sets[`${g}:${side}`]) readoutNames.push(`${g}:${side}`);
    for (const extra of ["steering:left", "steering:right", "neck_mn", "dn", "mn:haltere:left", "mn:haltere:right", "haltere:left", "haltere:right", "ocelli:left", "ocelli:right",
                         "gf", "dn:landing", "dn:grooming", "dn:DNa02:left", "dn:DNa02:right", "dn:DNp09", "dn:DNp09:left", "mn9", "kc", "mbon", "dan:pam", "vis:LC4", "vis:LPLC2",
                         "orn:decaying_fruit:left", "orn:decaying_fruit:right", "orn:fruity:left", "orn:fruity:right", "grn:sugar:labellum", "leg_touch", "lptc:hs:left", "lptc:vs:left"]) if (brain.sets[extra] && !readoutNames.includes(extra)) readoutNames.push(extra);
    if (Array.isArray(m.readouts)) for (const name of m.readouts) if (brain.sets[name] && !readoutNames.includes(name)) readoutNames.push(name);
    self.postMessage({ type: "ready", n: brain.n, edges: brain.edges, synapses: payload.synapses, members: brain.members, populations: Object.keys(brain.sets), model: payload.model, whole: payload.whole, recruitment: payload.recruitment });
    return;
  }
  if (!brain) return;
  if (m.type === "reset") { brain.reset(); return; }
  if (m.type === "shuffle") { // the same neurons with the wiring shuffled: postsynaptic endpoints permuted, counts and signs kept
    if (!brain.original) brain.original = { rowPtr: brain.rowPtr, pre: brain.pre, w: brain.w };
    if (!m.on) { brain.rowPtr = brain.original.rowPtr; brain.pre = brain.original.pre; brain.w = brain.original.w; brain.reset(); return; }
    const o = brain.original, E = brain.edges, n = brain.n;
    const post = new Int32Array(E); for (let i = 0; i < n; i++) for (let e = o.rowPtr[i]; e < o.rowPtr[i + 1]; e++) post[e] = i;
    let a = (m.seed || 1) >>> 0; const rnd = () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    for (let e = E - 1; e > 0; e--) { const j = Math.floor(rnd() * (e + 1)); const t = post[e]; post[e] = post[j]; post[j] = t; }
    const count = new Int32Array(n + 1); for (let e = 0; e < E; e++) count[post[e] + 1]++;
    const rowPtr = new Int32Array(n + 1); for (let i = 0; i < n; i++) rowPtr[i + 1] = rowPtr[i] + count[i + 1];
    const fill = rowPtr.slice(0, n), pre = new Int32Array(E), w = new Float64Array(E);
    for (let e = 0; e < E; e++) { const k = fill[post[e]]++; pre[k] = o.pre[e]; w[k] = o.w[e]; }
    brain.rowPtr = rowPtr; brain.pre = pre; brain.w = w; brain.reset(); return;
  }
  if (m.type === "efficacy") { // learned synapse efficacies (a checkpoint): weight = gain * count * efficacy in the payload's order
    const eff = m.efficacy; for (let e = 0; e < brain.edges; e++) brain.w[e] = brain.w0[e] * eff[e]; return;
  }
  if (m.type === "run") {
    brain.clearStimuli();
    for (const [set, level] of Object.entries(m.stimuli || {})) brain.stimulate(set, level);
    const t0 = performance.now();
    for (let k = 0; k < (m.steps || 1); k++) brain.step();
    const ms = performance.now() - t0;
    const readouts = {};
    for (const name of readoutNames) readouts[name] = brain.mean(name);
    const s = Float32Array.from(brain.s);
    self.postMessage({ type: "state", readouts, active: brain.activeCount(0.5), s, steps: brain.steps, ms, ran: m.steps || 1, baseline: !!m.baseline }, [s.buffer]);
  }
};
