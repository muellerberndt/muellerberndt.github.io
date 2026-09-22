// The hybrid organ, a twin of apollo/hybrid.py: the syrinx as the source, a remembered envelope as the tract.
import { Organ } from "./organ.js";
import { fft, RATE, HOP } from "./ear.js";
const WINDOW = 400, NFFT = 512, BANDS = 24, FEATURE_SCALE = 6, MAX_BOOST_DB = 30, CEPSTRAL = 30;
const F_LO = 100, F_HI = 7000;
const hzToMel = (f) => 2595 * Math.log10(1 + f / 700), melToHz = (m) => 700 * (Math.pow(10, m / 2595) - 1);
const CENTRES = (() => { const lo = hzToMel(F_LO), hi = hzToMel(F_HI); const c = []; for (let i = 1; i <= BANDS; i++) c.push(melToHz(lo + (hi - lo) * i / (BANDS + 1))); return c; })();
const BINS = Float64Array.from({ length: NFFT / 2 + 1 }, (_, k) => k * RATE / NFFT);
const HANN = Float64Array.from({ length: WINDOW }, (_, i) => 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (WINDOW - 1)));
const LN10 = Math.log(10);

function interp(x, xs, ys) {
  if (x <= xs[0]) return ys[0];
  if (x >= xs[xs.length - 1]) return ys[ys.length - 1];
  let i = 1; while (xs[i] < x) i++;
  const f = (x - xs[i - 1]) / (xs[i] - xs[i - 1]);
  return ys[i - 1] * (1 - f) + ys[i] * f;
}

export class HybridOrgan {
  constructor(constants) { this.organ = new Organ(constants); this.c = constants; }

  // the syrinx without a tube: reflections off, a wide fixed tract
  source(nerves, noise, seed) {
    const c = { ...this.c, SYRINX_REFLECTION: 0, BEAK_REFLECTION: -0.5 };
    const organ = new Organ(c);
    const controls = nerves.map((n) => [n[0], n[1], n[2], 0.5, 0, 1, 0]);
    return organ.render(controls, noise, seed).audio;
  }

  // smooth log envelope (bins) of one magnitude spectrum by cepstral liftering
  static cepstral(mag) {
    const n = NFFT, re = new Float64Array(n), im = new Float64Array(n);
    for (let k = 0; k <= n / 2; k++) { const v = Math.log(mag[k] + 1e-7); re[k] = v; if (k > 0 && k < n / 2) re[n - k] = v; }
    fft(re, im);                       // cepstrum (times n), real and even
    for (let q = CEPSTRAL; q < n - CEPSTRAL; q++) { re[q] = 0; im[q] = 0; } // python: cep[:, 30:-30] = 0
    for (let q = 0; q < n; q++) im[q] = -im[q]; // conjugate for the inverse
    fft(re, im);
    const out = new Float64Array(n / 2 + 1);
    for (let k = 0; k <= n / 2; k++) out[k] = re[k] / n;
    return out;
  }

  // nerves: F rows [breath, tension, gape, ...]; envelope: F rows of 24 feature-unit bands
  render(nerves, envelope, noise, seed = 1, level = 0.25) {
    const frames = Math.min(nerves.length, envelope.length);
    const steady = [];
    const breath = new Float64Array(frames);
    for (let t = 0; t < frames; t++) { breath[t] = Math.min(Math.max(nerves[t][0], 0), 1); steady.push([breath[t] > 0.12 ? 0.7 : 0, nerves[t][1], nerves[t][2]]); }
    const src = this.source(steady, noise, seed);
    const n = frames * HOP, pad = WINDOW / 2;
    const x = new Float64Array(n + 2 * WINDOW + pad);
    x.set(src.subarray(0, n), pad);
    const out = new Float64Array(x.length), norm = new Float64Array(x.length);
    const re = new Float64Array(NFFT), im = new Float64Array(NFFT), mag = new Float64Array(NFFT / 2 + 1);
    for (let t = 0; t < frames; t++) {
      re.fill(0); im.fill(0);
      for (let i = 0; i < WINDOW; i++) re[i] = x[t * HOP + i] * HANN[i];
      fft(re, im);
      for (let k = 0; k <= NFFT / 2; k++) mag[k] = Math.hypot(re[k], im[k]);
      const own = HybridOrgan.cepstral(mag);
      const row = envelope[t];
      const wantedDb = Array.from(row, (v) => (v - 0.5) * FEATURE_SCALE * 20 / LN10);
      for (let k = 0; k <= NFFT / 2; k++) {
        const wanted = interp(BINS[k], CENTRES, wantedDb) * LN10 / 20;
        const g = Math.exp(Math.min(Math.max(wanted - own[k], -6), MAX_BOOST_DB / 8.686 + 2));
        re[k] *= g; im[k] *= g;
        if (k > 0 && k < NFFT / 2) { re[NFFT - k] = re[k]; im[NFFT - k] = -im[k]; }
      }
      for (let k = 0; k < NFFT; k++) im[k] = -im[k];
      fft(re, im);
      for (let i = 0; i < WINDOW; i++) { const y = re[i] / NFFT * HANN[i]; out[t * HOP + i] += y; norm[t * HOP + i] += HANN[i] * HANN[i]; }
    }
    const audio = new Float64Array(n);
    let peak = 1e-9;
    for (let i = 0; i < n; i++) {
      const y = out[pad + i] / Math.max(norm[pad + i], 1e-3);
      // breath as a valve: linear interpolation of the frame values at frame centres
      const pos = (i - HOP / 2) / HOP; const t0 = Math.floor(pos);
      const b = t0 < 0 ? breath[0] : t0 >= frames - 1 ? breath[frames - 1] : breath[t0] * (1 - (pos - t0)) + breath[t0 + 1] * (pos - t0);
      audio[i] = y * b; peak = Math.max(peak, Math.abs(audio[i]));
    }
    const s = level / Math.tanh(1.2);
    for (let i = 0; i < n; i++) audio[i] = Math.tanh(audio[i] / peak * 1.2) * s;
    return audio;
  }
}

// a human sound's features in a parrot's proportions
export function warp(features, formantRatio, pitchRatio) {
  return features.map((row) => {
    const out = Float64Array.from(row);
    for (let k = 0; k < BANDS; k++) out[k] = interp(CENTRES[k] / formantRatio, CENTRES, Array.from(row.subarray(0, BANDS)));
    if (row[BANDS + 2] > 0.5) out[BANDS + 1] = Math.min(Math.max(row[BANDS + 1] + Math.log(pitchRatio) / Math.log(14), 0), 1);
    return out;
  });
}
