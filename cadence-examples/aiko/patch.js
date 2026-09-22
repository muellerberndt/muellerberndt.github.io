// A twin of cadence.RecordPatchNet (no categorical groups, no output code): the gated linear
// context, the record store inside the patch, the adjoint scan, backtracking admission, dreams
// and a night. Batch is always one path here.
import { mulberry, normals } from "./organ.js";

const sigmoid = (x) => 1 / (1 + Math.exp(-x));

export class RecordPatch {
  // spec: exported by tools/export_brain.py
  constructor(spec) {
    Object.assign(this, {
      inputs: spec.inputs, hidden: spec.hidden, outputs: spec.outputs, cells: spec.cells, active: spec.active,
      rate: spec.record_rate, habituation: spec.habituation, averaging: spec.record_averaging,
      inputNorm: spec.input_norm, seen: spec.seen, precision: Float64Array.from(spec.precision),
      scale: Float64Array.from(spec.scale),
    });
    this.g = Float64Array.from(spec.g); this.G = spec.G.map((r) => Float64Array.from(r));
    this.B = spec.B.map((r) => Float64Array.from(r)); this.b = Float64Array.from(spec.b);
    this.C = spec.C.map((r) => Float64Array.from(r)); this.c = Float64Array.from(spec.c);
    const reading = this.inputs + this.hidden;
    // the projection and offsets regenerate from the seed, as the library does
    const gen = mulberry(spec.seed);
    const draws = normals(gen, reading * this.cells);
    this.projection = new Float64Array(reading * this.cells); // row-major (reading, cells)
    const s = Math.sqrt(reading);
    for (let i = 0; i < reading * this.cells; i++) this.projection[i] = draws[i] / s;
    const off = normals(gen, this.cells);
    this.offset = new Float64Array(this.cells);
    for (let i = 0; i < this.cells; i++) this.offset[i] = off[i] * spec.record_bias;
    this.mean = Float64Array.from(spec.mean);
    this.table = spec.table.map((r) => Float64Array.from(r)); // (cells, outputs)
    this.count = Float64Array.from(spec.count || new Array(this.cells).fill(0));
    this.updates = 0; this.writes = 0;
  }

  params() { return { g: this.g, G: this.G, B: this.B, b: this.b, C: this.C, c: this.c }; }

  // the k-winner code of one reading: {idx, val}
  code(reading) {
    const n = reading.length, cells = this.cells;
    const drive = new Float64Array(cells);
    for (let j = 0; j < cells; j++) drive[j] = this.offset[j];
    for (let i = 0; i < n; i++) {
      const x = reading[i] - this.mean[i];
      if (x === 0) continue;
      const row = i * cells;
      for (let j = 0; j < cells; j++) drive[j] += x * this.projection[row + j];
    }
    // top-k by a min-heap over the drives (ties are improbable with continuous drives)
    const k = this.active;
    const heapIdx = new Int32Array(k), heapVal = new Float64Array(k);
    let size = 0;
    const siftUp = (i) => { while (i > 0) { const p = (i - 1) >> 1; if (heapVal[p] <= heapVal[i]) break; [heapVal[p], heapVal[i]] = [heapVal[i], heapVal[p]]; [heapIdx[p], heapIdx[i]] = [heapIdx[i], heapIdx[p]]; i = p; } };
    const siftDown = (i) => { for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < size && heapVal[l] < heapVal[m]) m = l; if (r < size && heapVal[r] < heapVal[m]) m = r; if (m === i) break; [heapVal[m], heapVal[i]] = [heapVal[i], heapVal[m]]; [heapIdx[m], heapIdx[i]] = [heapIdx[i], heapIdx[m]]; i = m; } };
    for (let j = 0; j < cells; j++) {
      const v = drive[j];
      if (size < k) { heapIdx[size] = j; heapVal[size] = v; size++; siftUp(size - 1); }
      else if (v > heapVal[0]) { heapIdx[0] = j; heapVal[0] = v; siftDown(0); }
    }
    const idx = new Int32Array(k);
    const val = new Float64Array(k);
    let norm = 0;
    for (let q = 0; q < k; q++) { idx[q] = heapIdx[q]; val[q] = Math.max(heapVal[q], 0); norm += val[q] * val[q]; }
    norm = Math.sqrt(norm);
    if (norm > 0) for (let q = 0; q < k; q++) val[q] /= Math.max(norm, 1e-12);
    return { idx, val };
  }

  reading(u, h) {
    const r = new Float64Array(this.inputs + this.hidden);
    const s = Math.sqrt(this.inputs) / this.inputNorm;
    for (let i = 0; i < this.inputs; i++) r[i] = u[i] * s;
    for (let j = 0; j < this.hidden; j++) r[this.inputs + j] = h[j] * this.scale[j];
    return r;
  }

  slow(h) {
    const y = new Float64Array(this.outputs);
    for (let o = 0; o < this.outputs; o++) { let a = this.c[o]; const row = this.C[o]; for (let j = 0; j < this.hidden; j++) a += row[j] * h[j]; y[o] = a; }
    return y;
  }

  // inputs: array of F Float64Array(inputs); boundary: Float64Array(hidden) or null
  forward(inputs, boundary) {
    const F = inputs.length, H = this.hidden;
    const hidden = [], gate = [], port = [], codes = [], read = [], output = [];
    let prev = boundary ? Float64Array.from(boundary) : new Float64Array(H);
    for (let t = 0; t < F; t++) {
      const u = inputs[t];
      const g = new Float64Array(H), p = new Float64Array(H), h = new Float64Array(H);
      for (let j = 0; j < H; j++) {
        let a = this.g[j], z = this.b[j];
        const Gr = this.G[j], Br = this.B[j];
        for (let i = 0; i < this.inputs; i++) { a += Gr[i] * u[i]; z += Br[i] * u[i]; }
        g[j] = sigmoid(a); p[j] = Math.tanh(z);
        h[j] = g[j] * prev[j] + (1 - g[j]) * p[j];
      }
      const cd = this.code(this.reading(u, h));
      const rd = new Float64Array(this.outputs);
      for (let k = 0; k < this.active; k++) { const row = this.table[cd.idx[k]], v = cd.val[k]; for (let o = 0; o < this.outputs; o++) rd[o] += v * row[o]; }
      const y = this.slow(h);
      const out = new Float64Array(this.outputs);
      for (let o = 0; o < this.outputs; o++) out[o] = y[o] + rd[o];
      hidden.push(h); gate.push(g); port.push(p); codes.push(cd); read.push(rd); output.push(out);
      prev = h;
    }
    return { hidden, gate, port, codes, read, output };
  }

  imagine(inputs, state) { return this.forward(inputs, state || null); }

  loss(output, target) {
    let s = 0; const F = output.length;
    for (let t = 0; t < F; t++) for (let o = 0; o < this.outputs; o++) { const d = output[t][o] - target[t][o]; s += this.precision[o] * d * d; }
    return 0.5 * s / (F * this.outputs);
  }

  slowLoss(path, target) {
    const F = path.output.length; let s = 0;
    for (let t = 0; t < F; t++) for (let o = 0; o < this.outputs; o++) { const d = path.output[t][o] - path.read[t][o] - target[t][o]; s += this.precision[o] * d * d; }
    return 0.5 * s / (F * this.outputs);
  }

  adjoint(inputs, boundary, path, target) {
    const F = inputs.length, H = this.hidden, O = this.outputs, I = this.inputs;
    const prev = boundary ? Float64Array.from(boundary) : new Float64Array(H);
    const d = [];
    for (let t = 0; t < F; t++) { const row = new Float64Array(O); for (let o = 0; o < O; o++) row[o] = this.precision[o] * (path.output[t][o] - path.read[t][o] - target[t][o]) / (F * O); d.push(row); }
    const gh = [];
    for (let t = 0; t < F; t++) { const row = new Float64Array(H); for (let o = 0; o < O; o++) { const dd = d[t][o]; if (dd === 0) continue; const Cr = this.C[o]; for (let j = 0; j < H; j++) row[j] += dd * Cr[j]; } gh.push(row); }
    const carried = new Float64Array(H);
    for (let t = F - 1; t >= 0; t--) { const g = path.gate[t]; for (let j = 0; j < H; j++) { gh[t][j] += carried[j]; carried[j] = g[j] * gh[t][j]; } }
    const dG = Array.from({ length: H }, () => new Float64Array(I)), dB = Array.from({ length: H }, () => new Float64Array(I));
    const dg = new Float64Array(H), db = new Float64Array(H);
    const dC = Array.from({ length: O }, () => new Float64Array(H)), dc = new Float64Array(O);
    for (let t = 0; t < F; t++) {
      const g = path.gate[t], p = path.port[t], h = path.hidden[t], pv = t === 0 ? prev : path.hidden[t - 1], u = inputs[t];
      for (let j = 0; j < H; j++) {
        const gp = (1 - g[j]) * gh[t][j] * (1 - p[j] * p[j]);
        const gs = gh[t][j] * (pv[j] - p[j]) * g[j] * (1 - g[j]);
        dg[j] += gs; db[j] += gp;
        const Gr = dG[j], Br = dB[j];
        for (let i = 0; i < I; i++) { Gr[i] += gs * u[i]; Br[i] += gp * u[i]; }
      }
      for (let o = 0; o < O; o++) { const dd = d[t][o]; dc[o] += dd; const Cr = dC[o]; for (let j = 0; j < H; j++) Cr[j] += dd * h[j]; }
    }
    return { g: dg, G: dG, B: dB, b: db, C: dC, c: dc };
  }

  write(inputs, target, hidden) {
    const F = inputs.length;
    for (let t = 0; t < F; t++) { let n = 0; for (let i = 0; i < this.inputs; i++) n += inputs[t][i] * inputs[t][i]; this.inputNorm += 0.01 * (Math.max(Math.sqrt(n), 1e-6) - this.inputNorm); }
    const readings = [];
    for (let t = 0; t < F; t++) readings.push(this.reading(inputs[t], hidden[t]));
    if (this.habituation > 0) for (const r of readings) { this.seen += 1; const s = Math.max(this.habituation, 1 / this.seen); for (let i = 0; i < r.length; i++) this.mean[i] += s * (r[i] - this.mean[i]); }
    let written = 0;
    for (let t = 0; t < F; t++) {
      const cd = this.code(readings[t]);
      const y = this.slow(hidden[t]);
      const err = new Float64Array(this.outputs);
      for (let o = 0; o < this.outputs; o++) err[o] = target[t][o] - y[o];
      for (let k = 0; k < this.active; k++) { const row = this.table[cd.idx[k]], v = cd.val[k]; for (let o = 0; o < this.outputs; o++) err[o] -= v * row[o]; }
      for (let k = 0; k < this.active; k++) {
        const cell = cd.idx[k], v = cd.val[k];
        let step = this.rate;
        if (this.averaging) { this.count[cell] += v; step = Math.min(Math.max(1 / this.count[cell], this.rate), 1); }
        const row = this.table[cell];
        for (let o = 0; o < this.outputs; o++) row[o] += step * v * err[o];
      }
      written += 1;
    }
    this.writes += written;
    return written;
  }

  applyStep(delta, step) {
    const P = this.params();
    for (const k of ["g", "b", "c"]) for (let i = 0; i < P[k].length; i++) P[k][i] -= step * delta[k][i];
    for (const k of ["G", "B", "C"]) for (let i = 0; i < P[k].length; i++) for (let j = 0; j < P[k][i].length; j++) P[k][i][j] -= step * delta[k][i][j];
  }

  observe(inputs, target, { rate = 1, write = true, backtrack = false } = {}) {
    const path = this.forward(inputs, null);
    const initial = this.slowLoss(path, target);
    const delta = this.adjoint(inputs, null, path, target);
    if (write) this.write(inputs, target, path.hidden);
    if (rate <= 0) return { updated: false, initial, loss: initial, writes: write ? inputs.length : 0 };
    if (!backtrack) { this.applyStep(delta, rate); this.updates += 1; return { updated: true, initial }; }
    let norm2 = 0;
    for (const k of ["g", "b", "c"]) for (const v of delta[k]) norm2 += v * v;
    for (const k of ["G", "B", "C"]) for (const r of delta[k]) for (const v of r) norm2 += v * v;
    if (!(norm2 > 0)) return { updated: false, initial, loss: initial };
    for (let index = 0; index < 16; index++) {
      const step = rate * Math.pow(0.5, index);
      this.applyStep(delta, step);
      const trial = this.forward(inputs, null);
      const loss = this.slowLoss(trial, target);
      const floor = 64 * 2.220446049250313e-16 * Math.max(Math.abs(initial), Math.abs(loss), 2.2250738585072014e-308);
      if (loss < initial - floor && loss <= initial - 1e-4 * step * norm2) { this.updates += 1; return { updated: true, initial, loss, step }; }
      this.applyStep(delta, -step);
    }
    return { updated: false, initial, loss: initial };
  }

  dream(cue) { return this.forward(cue, null).output; }

  sleep(cues, { passes = 1, rate = 1, backtrack = true, dawn = 2 } = {}) {
    const dreams = cues.map((cue) => [cue, this.dream(cue)]);
    const mean = () => dreams.reduce((s, [cue, dr]) => s + this.slowLoss(this.forward(cue, null), dr), 0) / dreams.length;
    const before = mean();
    let admitted = 0;
    for (let p = 0; p < passes; p++) for (const [cue, dr] of dreams) admitted += this.observe(cue, dr, { rate, write: false, backtrack }).updated ? 1 : 0;
    const after = mean();
    let writes = 0;
    for (let p = 0; p < dawn; p++) for (const [cue, dr] of dreams) writes += this.write(cue, dr, this.forward(cue, null).hidden);
    return { cues: dreams.length, updates: admitted, dream_loss_before: before, dream_loss_after: after, dawn_writes: writes };
  }
}
