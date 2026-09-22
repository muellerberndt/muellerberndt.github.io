// Aiko's brain in the browser: a twin of apollo/brain.py on the JS record patch, organ and ear.
import { RecordPatch } from "./patch.js";
import { Organ, mulberry, normals } from "./organ.js";
import { features } from "./ear.js";
import { HybridOrgan, warp } from "./hybrid.js";

export const LATENCY = 2;
export const COLORS = ["red", "blue", "green", "yellow"];
export const MATERIALS = ["wood", "metal", "paper", "glass"];
export const SLOTS = 24;
export const MIN_STRENGTH = 3;
export const REST = [0, 0.2, 0, 0.5, 0, 0.4, 0];
export const FORMANT_RATIO = 1.3, PITCH_RATIO = 1.6;
export const FEATURE_WEIGHTS = Float64Array.from([...new Array(24).fill(1), 2, 3, 2]);
const CONTEXT = COLORS.length + MATERIALS.length + 2 + 2 + SLOTS;

export function resample(score, frames) {
  const n = score.length, out = [];
  for (let t = 0; t < frames; t++) {
    const x = frames === 1 ? 0 : (t * (n - 1)) / (frames - 1);
    const i = Math.min(Math.floor(x), n - 1), j = Math.min(i + 1, n - 1), f = x - i;
    const row = new Float64Array(7);
    for (let k = 0; k < 7; k++) row[k] = score[i][k] * (1 - f) + score[j][k] * f;
    out.push(row);
  }
  return out;
}

export function dtw(a, b) {
  const n = a.length, m = b.length;
  let prev = new Float64Array(m + 1).fill(Infinity), row = new Float64Array(m + 1);
  prev[0] = 0;
  for (let i = 1; i <= n; i++) {
    row.fill(Infinity);
    for (let j = 1; j <= m; j++) {
      let c = 0; const ai = a[i - 1], bj = b[j - 1];
      for (let k = 0; k < ai.length; k++) { const d = (ai[k] - bj[k]) * FEATURE_WEIGHTS[k]; c += d * d; }
      row[j] = Math.sqrt(c) + Math.min(prev[j], prev[j - 1], row[j - 1]);
    }
    const t = prev; prev = row; row = t;
  }
  return prev[m] / (n + m);
}

export class Aiko {
  constructor(spec, organConstants, seed = 1) {
    this.mirror = new RecordPatch(spec.mirror);
    this.association = new RecordPatch(spec.association);
    this.organ = new Organ(organConstants);
    this.hybrid = new HybridOrgan(organConstants);
    this.memories = spec.memories.map((m) => ({ ...m, score: m.score.map((r) => Float64Array.from(r)), key: Float64Array.from(m.key), envelope: m.envelope ? m.envelope.map((r) => Float64Array.from(r)) : null, hearings: [] }));
    this.random = mulberry(seed);
    this.arousal = spec.arousal || 0;
    this.contexts = [];
    this.heardSequences = [];
    this.last = { nerves: null, heard: null, codes: null, hidden: null, values: null, context: null, trace: null, areas: null };
  }

  gauss() { return normals(this.random, 2)[0]; }

  // ------------------------------------------------------------ repertoire
  render(memory) {
    const seed = Math.floor(this.random() * 1e9);
    if (!memory.envelope) return this.organ.render(memory.score, null, seed);
    const audio = this.hybrid.render(memory.score, memory.envelope, null, seed);
    return { audio, trace: new Float64Array(memory.score.length * 3), areas: null };
  }
  addMemory(name, kind, score, key, strength = 1, envelope = null) {
    if (this.memories.length >= SLOTS) {
      // a full repertoire forgets its weakest word
      const words = this.memories.filter((m) => m.kind === "word");
      const weakest = words.reduce((a, b) => (b.strength < a.strength || (b.strength === a.strength && b.reward < a.reward) ? b : a));
      const m = { name, kind, score, key, envelope, strength, reward: 0, slot: weakest.slot, similarity: 0, hearings: [] };
      this.memories[weakest.slot] = m;
      return m;
    }
    const m = { name, kind, score, key, envelope, strength, reward: 0, slot: this.memories.length, similarity: 0, hearings: [] };
    this.memories.push(m);
    return m;
  }
  eligible() { return this.memories.filter((m) => m.strength >= MIN_STRENGTH); }

  // -------------------------------------------------------------- babbling
  babbleScore(frames) {
    const knots = Math.max(Math.floor(frames / 6), 3);
    const centre = [0.55, 0.16, 0.05, 0.5, 0.45, 0.5, 0.1], spread = [0.35, 0.08, 0.25, 0.5, 0.45, 0.5, 0.4];
    const k = [];
    for (let i = 0; i < knots; i++) { const row = new Float64Array(7); for (let j = 0; j < 7; j++) row[j] = Math.min(Math.max(centre[j] + spread[j] * this.gauss() * 0.9, 0), 1); k.push(row); }
    if (this.random() < 0.3) for (const row of k) { row[1] = 0.34 + 0.18 * this.random(); row[4] = 0.2 + 0.2 * this.random(); row[2] = 0; }
    const score = resample(k, frames);
    const rate = 3 + 4 * this.random(), phase = this.random() * 2 * Math.PI, power = 1 + 2 * this.random();
    for (let t = 0; t < frames; t++) {
      const pulse = 0.5 + 0.5 * Math.sin(2 * Math.PI * rate * t / 100 + phase);
      score[t][0] *= 0.4 + 0.6 * Math.pow(pulse, power);
      if (this.random() < 0.85) score[t][2] = Math.min(score[t][2], 0.15);
      score[t][6] = score[t][6] > 0.7 ? 1 : 0;
    }
    for (let t = 0; t < 4; t++) score[t].set(REST);
    for (let t = frames - 3; t < frames; t++) score[t].set(REST);
    return score;
  }
  babbleEnvelope(frames) {
    const knots = Math.max(Math.floor(frames / 8), 3);
    const k = [];
    for (let i = 0; i < knots; i++) k.push(Float64Array.from({ length: 24 }, () => 0.5 + 0.12 * this.gauss()));
    const bumps = 1 + Math.floor(this.random() * 3);
    for (let b = 0; b < bumps; b++) { const width = 1.5 + 2.5 * this.random(); for (const row of k) { const centre = 2 + 18 * this.random(); for (let j = 0; j < 24; j++) row[j] += 0.25 * Math.exp(-(((j - centre) / width) ** 2)); } }
    for (const row of k) { let mean = 0; for (const v of row) mean += v / 24; for (let j = 0; j < 24; j++) row[j] = Math.min(Math.max(row[j] - mean + 0.5, 0), 1); }
    const out = []; const n = k.length;
    for (let t = 0; t < frames; t++) { const x = frames === 1 ? 0 : (t * (n - 1)) / (frames - 1); const i = Math.min(Math.floor(x), n - 1), j = Math.min(i + 1, n - 1), f = x - i; out.push(Float64Array.from({ length: 24 }, (_, q) => k[i][q] * (1 - f) + k[j][q] * f)); }
    return out;
  }
  babble(frames = 100) {
    const score = this.babbleScore(frames);
    const audio = this.hybrid.render(score, this.babbleEnvelope(frames), null, Math.floor(this.random() * 1e9));
    this.learnOwn(score, audio);
    return { score, audio, trace: new Float64Array(frames * 3) };
  }
  pairs(score, audio) {
    const heard = features(audio);
    const n = Math.min(heard.length, score.length);
    return { heard: heard.slice(LATENCY, n), nerves: score.slice(0, n - LATENCY) };
  }
  learnOwn(score, audio) {
    const { heard, nerves } = this.pairs(score, audio);
    if (heard.length < 4) return;
    this.mirror.observe(heard, nerves, { rate: 0 });
    this.heardSequences.push(heard);
    if (this.heardSequences.length > 24) this.heardSequences.shift();
  }

  // ------------------------------------------------------------- listening
  propose(heard) {
    const path = this.mirror.imagine(heard, null);
    const score = [];
    for (let t = 0; t < heard.length; t++) {
      const src = path.output[Math.max(t - LATENCY, 0)];
      const row = new Float64Array(7);
      for (let k = 0; k < 7; k++) row[k] = Math.min(Math.max(src[k], 0), 1);
      score.push(row);
    }
    for (const t of [0, 1, heard.length - 2, heard.length - 1]) if (t >= 0 && t < heard.length) score[t].set(REST);
    this.last.codes = path.codes; this.last.hidden = path.hidden; this.last.heard = heard; this.last.nerves = score;
    return score;
  }
  hear(audio, label) {
    const heard = warp(features(audio), FORMANT_RATIO, PITCH_RATIO);
    const key = new Float64Array(heard[0].length);
    for (const row of heard) for (let k = 0; k < key.length; k++) key[k] += row[k] / heard.length;
    const attempt = this.propose(heard);
    let match = null;
    if (label) match = this.memories.find((m) => m.name === label) || null;
    if (!match) {
      let best = null;
      for (const m of this.memories) {
        if (m.kind !== "word") continue;
        let d = 0; for (let k = 0; k < key.length; k++) { const x = m.key[k] - key[k]; d += x * x; }
        d = Math.sqrt(d) + 0.3 * Math.abs(Math.log(m.score.length / heard.length));
        if (!best || d < best[0]) best = [d, m];
      }
      if (best && best[0] < 0.9) match = best[1];
    }
    let memory;
    if (!match) memory = this.addMemory(label || `word${this.memories.length}`, "word", attempt, key, 1, heard.map((r) => Float64Array.from(r.subarray(0, 24))));
    else {
      memory = match;
      const re = resample(attempt, memory.score.length);
      for (let t = 0; t < memory.score.length; t++) for (let k = 0; k < 7; k++) memory.score[t][k] += 0.5 * (re[t][k] - memory.score[t][k]);
      const env = heard.map((r) => Float64Array.from(r.subarray(0, 24)));
      const n = memory.envelope.length;
      for (let t = 0; t < n; t++) { const x = n === 1 ? 0 : (t * (env.length - 1)) / (n - 1); const i = Math.min(Math.floor(x), env.length - 1), j = Math.min(i + 1, env.length - 1), f = x - i; for (let k = 0; k < 24; k++) memory.envelope[t][k] += 0.5 * (env[i][k] * (1 - f) + env[j][k] * f - memory.envelope[t][k]); }
      for (let k = 0; k < key.length; k++) memory.key[k] += 0.5 * (key[k] - memory.key[k]);
      memory.strength += 1;
    }
    memory.hearings.push(heard);
    if (memory.hearings.length > 3) memory.hearings.shift();
    this.arousal = 0;
    return memory;
  }

  // ------------------------------------------------------------------ voice
  say(memory, practice = true) {
    const r = this.render(memory);
    this.last.trace = r.trace; this.last.areas = r.areas; this.last.nerves = memory.score;
    if (practice) {
      this.learnOwn(memory.score, r.audio);
      if (memory.hearings.length) memory.similarity = -dtw(features(r.audio), memory.hearings[memory.hearings.length - 1]);
    }
    this.arousal = 0;
    return r;
  }
  bored(silenceFrames) {
    this.arousal += (silenceFrames / 400) * (0.5 + this.random());
    if (this.arousal < 1) return null;
    const pool = this.eligible();
    if (!pool.length) return null;
    const w = pool.map((m) => m.strength * (1 + 2 * Math.max(m.reward, 0)));
    const total = w.reduce((a, b) => a + b, 0);
    let u = this.random() * total;
    for (let i = 0; i < pool.length; i++) { u -= w[i]; if (u <= 0) return pool[i]; }
    return pool[pool.length - 1];
  }

  // private practice: say it, hear yourself, keep what your own ear rates closer; one round per call
  practice(memory, candidates = 6, spread = 0.12) {
    if (!memory.hearings.length) return null;
    const target = memory.hearings[memory.hearings.length - 1];
    const proposal = resample(this.propose(target), memory.score.length);
    const pool = [memory.score, proposal, memory.score.map((row, t) => row.map((v, k) => v + 0.5 * (proposal[t][k] - v)))];
    while (pool.length < candidates) {
      const noise = memory.score.map(() => Float64Array.from({ length: 7 }, (_, k) => this.gauss() * spread * (k === 1 ? 0.4 : 1)));
      pool.push(memory.score.map((row, t) => { const out = new Float64Array(7); for (let k = 0; k < 7; k++) { let acc = 0, n = 0; for (let d = -2; d <= 2; d++) { const j = t + d; if (j >= 0 && j < noise.length) { acc += noise[j][k]; n++; } } out[k] = Math.min(Math.max(row[k] + acc / n, 0), 1); } return out; }));
    }
    let best = 0, bestD = Infinity;
    for (let i = 0; i < pool.length; i++) {
      const r = memory.envelope ? { audio: this.hybrid.render(pool[i], memory.envelope, null, Math.floor(this.random() * 1e9)) } : this.organ.render(pool[i], null, Math.floor(this.random() * 1e9));
      const d = dtw(features(r.audio), target);
      this.learnOwn(pool[i], r.audio);
      if (d < bestD) { bestD = d; best = i; }
    }
    memory.score = pool[best].map((r) => Float64Array.from(r));
    memory.similarity = -bestD;
    return bestD;
  }

  // ------------------------------------------------------------ association
  context(color, material, question, position, said) {
    const v = new Float64Array(CONTEXT);
    if (color) v[COLORS.indexOf(color)] = 1;
    if (material) v[COLORS.length + MATERIALS.indexOf(material)] = 1;
    const base = COLORS.length + MATERIALS.length;
    v[base] = question === "color" || question === "both" ? 1 : 0;
    v[base + 1] = question === "material" || question === "both" ? 1 : 0;
    v[base + 2 + position] = 1;
    for (const s of said) v[base + 4 + s] = 1;
    return v;
  }
  values(ctx) { const path = this.association.imagine([ctx], null); this.last.values = path.output[0]; this.last.context = ctx; return path.output[0]; }
  answer(color, material, question, { temperature = 0.25, greedy = false } = {}) {
    const steps = question === "both" ? 2 : 1;
    const said = [], trial = { contexts: [], slots: [], names: [] };
    const pool = this.eligible();
    for (let position = 0; position < steps; position++) {
      const ctx = this.context(color, material, question, position, said);
      const value = this.values(ctx);
      const candidates = pool.filter((m) => !said.includes(m.slot));
      const v = candidates.map((m) => value[m.slot]);
      let choice;
      if (greedy) choice = candidates[v.indexOf(Math.max(...v))];
      else {
        const mx = Math.max(...v); const p = v.map((x) => Math.exp((x - mx) / temperature)); const z = p.reduce((a, b) => a + b, 0);
        let u = this.random() * z; choice = candidates[candidates.length - 1];
        for (let i = 0; i < p.length; i++) { u -= p[i]; if (u <= 0) { choice = candidates[i]; break; } }
      }
      said.push(choice.slot); trial.contexts.push(ctx); trial.slots.push(choice.slot); trial.names.push(choice.name);
    }
    return trial;
  }
  reward(trial, r) {
    for (let i = 0; i < trial.contexts.length; i++) {
      const ctx = trial.contexts[i], slot = trial.slots[i];
      const target = Float64Array.from(this.values(ctx));
      target[slot] = r;
      this.association.observe([ctx], [target], { rate: 0 });
      this.contexts.push(ctx);
    }
    for (const slot of trial.slots) { const m = this.memories[slot]; m.reward += 0.5 * (r - m.reward); }
  }

  // ------------------------------------------------------------------ night
  // a generator so the page can draw between steps
  *night({ mirrorPasses = 3, associationPasses = 40 } = {}) {
    const report = {};
    const unique = new Map();
    for (const c of this.contexts) unique.set(Array.from(c).join(","), c);
    const cues = Array.from(unique.values()).map((c) => [c]);
    if (cues.length) {
      const dreams = cues.map((cue) => [cue, this.association.dream(cue)]);
      let admitted = 0;
      for (let p = 0; p < associationPasses; p++) {
        for (const [cue, dr] of dreams) admitted += this.association.observe(cue, dr, { rate: 4, write: false, backtrack: true }).updated ? 1 : 0;
        yield { stage: "association", pass: p + 1, of: associationPasses };
      }
      let writes = 0;
      for (let p = 0; p < 2; p++) for (const [cue, dr] of dreams) writes += this.association.write(cue, dr, this.association.forward(cue, null).hidden);
      report.association = { cues: cues.length, updates: admitted, dawn_writes: writes };
    }
    if (this.heardSequences.length) {
      const seqs = this.heardSequences.slice(-12);
      const dreams = seqs.map((cue) => [cue, this.mirror.dream(cue)]);
      let admitted = 0;
      for (let p = 0; p < mirrorPasses; p++) {
        for (const [cue, dr] of dreams) { admitted += this.mirror.observe(cue, dr, { rate: 2, write: false, backtrack: true }).updated ? 1 : 0; yield { stage: "mirror", pass: p + 1, of: mirrorPasses }; }
      }
      let writes = 0;
      for (let p = 0; p < 2; p++) for (const [cue, dr] of dreams) writes += this.mirror.write(cue, dr, this.mirror.forward(cue, null).hidden);
      report.mirror = { cues: seqs.length, updates: admitted, dawn_writes: writes };
    }
    this.arousal = 0;
    return report;
  }
}
