// The ear, a twin of apollo/ear.py: 40-band log-mel spectrum, loudness, a pitch track and the
// 27 features the brain hears per 10 ms frame.
const RATE = 16000, HOP = 160, WINDOW = 400, NFFT = 512, F_LO = 100, F_HI = 7000;
const PITCH_LO = 100, PITCH_HI = 1400, PITCH_WINDOW = 640;
const BANDS = 40, FEATURE_BANDS = 24;
export const FEATURES = FEATURE_BANDS + 3;

const hzToMel = (f) => 2595 * Math.log10(1 + f / 700);
const melToHz = (m) => 700 * (Math.pow(10, m / 2595) - 1);

function filterbank(bands) {
  const lo = hzToMel(F_LO), hi = hzToMel(F_HI);
  const edges = [];
  for (let i = 0; i < bands + 2; i++) edges.push(melToHz(lo + (hi - lo) * i / (bands + 1)));
  const bins = edges.map((e) => Math.floor((NFFT + 1) * e / RATE));
  const bank = [];
  for (let i = 0; i < bands; i++) {
    let a = bins[i], m = bins[i + 1], h = bins[i + 2];
    if (bands === FEATURE_BANDS) { m = Math.max(m, a + 1); h = Math.max(h, m + 2); } else { if (m === a) m += 1; if (h === m) h += 1; }
    const row = new Float64Array(NFFT / 2 + 1);
    for (let k = a; k < m; k++) row[k] = (k - a) / (m - a);
    for (let k = m; k < h; k++) row[k] = 1 - (k - m) / (h - m);
    bank.push(row);
  }
  return bank;
}
const BANK = filterbank(BANDS);
const FEATURE_BANK = filterbank(FEATURE_BANDS);
const HANN = Float64Array.from({ length: WINDOW }, (_, i) => 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (WINDOW - 1)));

// in-place radix-2 FFT of real re (length n power of two), im zero
export function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = -2 * Math.PI / len;
    const wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k, b = i + k + len / 2;
        const tr = re[b] * cr - im[b] * ci, ti = re[b] * ci + im[b] * cr;
        re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti;
        const ncr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = ncr;
      }
    }
  }
}

function power(frame, n) {
  const re = new Float64Array(n), im = new Float64Array(n);
  re.set(frame.subarray ? frame.subarray(0, Math.min(frame.length, n)) : frame.slice(0, n));
  fft(re, im);
  const out = new Float64Array(n / 2 + 1);
  for (let k = 0; k <= n / 2; k++) out[k] = re[k] * re[k] + im[k] * im[k];
  return out;
}

// centered frame of `window` samples at frame index t (zero padded), as python frames_of
function frameAt(audio, t, window) {
  const pad = window >> 1;
  const out = new Float64Array(window);
  const start = t * HOP - pad;
  for (let i = 0; i < window; i++) { const j = start + i; out[i] = j >= 0 && j < audio.length ? audio[j] : 0; }
  return out;
}

export function hear(audio) {
  const count = Math.floor(audio.length / HOP);
  const mel = [], loud = new Float64Array(count), f0 = new Float64Array(count), voiced = new Uint8Array(count), specs = [];
  const lagLo = Math.floor(RATE / PITCH_HI), lagHi = Math.floor(RATE / PITCH_LO);
  for (let t = 0; t < count; t++) {
    const fr = frameAt(audio, t, WINDOW);
    for (let i = 0; i < WINDOW; i++) fr[i] *= HANN[i];
    const spec = power(fr, NFFT);
    specs.push(spec);
    let sum = 0; for (let k = 0; k < spec.length; k++) sum += spec[k];
    loud[t] = Math.log1p(sum * 2);
    const row = new Float64Array(BANDS);
    for (let i = 0; i < BANDS; i++) { let e = 0; const bk = BANK[i]; for (let k = 0; k < bk.length; k++) e += spec[k] * bk[k]; row[i] = Math.log1p(e * 50); }
    mel.push(row);
    // pitch by normalized autocorrelation over a 40 ms frame
    const pf = frameAt(audio, t, PITCH_WINDOW);
    let mean = 0; for (let i = 0; i < PITCH_WINDOW; i++) mean += pf[i]; mean /= PITCH_WINDOW;
    const n2 = 2048; // >= 2 * PITCH_WINDOW and a power of two: the same linear autocorrelation as python's 1280-point transform
    const re = new Float64Array(n2), im = new Float64Array(n2);
    for (let i = 0; i < PITCH_WINDOW; i++) re[i] = pf[i] - mean;
    fft(re, im);
    for (let k = 0; k < n2; k++) { re[k] = re[k] * re[k] + im[k] * im[k]; im[k] = 0; }
    // inverse FFT of a real symmetric spectrum: forward FFT then divide by n2
    fft(re, im);
    const ac = new Float64Array(PITCH_WINDOW);
    for (let k = 0; k < PITCH_WINDOW; k++) ac[k] = re[k] / n2;
    const norm = ac[0] + 1e-9;
    let dipped = false, best = -1, bestVal = -1;
    for (let lag = lagLo; lag <= lagHi; lag++) {
      const w = ac[lag] / norm;
      if (w < 0.3) dipped = true;
      if (lag > lagLo && lag < lagHi) {
        const local = w > ac[lag - 1] / norm && w >= ac[lag + 1] / norm;
        if (dipped && local && w > bestVal) { bestVal = w; best = lag; }
      }
    }
    if (best < 0) { best = lagLo; bestVal = -1; }
    f0[t] = RATE / best;
    voiced[t] = bestVal > 0.45 && ac[0] > 1e-3 ? 1 : 0;
    if (!voiced[t]) f0[t] = 0;
  }
  return { mel, loud, f0, voiced, specs };
}

export function features(audio) {
  const h = hear(audio);
  const count = h.loud.length;
  const out = [];
  for (let t = 0; t < count; t++) {
    const spec = h.specs[t];
    const m = new Float64Array(FEATURE_BANDS);
    for (let i = 0; i < FEATURE_BANDS; i++) { let e = 0; const bk = FEATURE_BANK[i]; for (let k = 0; k < bk.length; k++) e += spec[k] * bk[k]; m[i] = Math.log(e + 1e-7); }
    const sm = new Float64Array(FEATURE_BANDS);
    for (let i = 0; i < FEATURE_BANDS; i++) { const a = m[Math.max(i - 1, 0)], c = m[Math.min(i + 1, FEATURE_BANDS - 1)]; sm[i] = (a + 2 * m[i] + c) / 4; }
    let mean = 0; for (let i = 0; i < FEATURE_BANDS; i++) mean += sm[i]; mean /= FEATURE_BANDS;
    const row = new Float64Array(FEATURES);
    for (let i = 0; i < FEATURE_BANDS; i++) row[i] = Math.min(Math.max((sm[i] - mean) / 6 + 0.5, 0), 1);
    let sum = 0; for (let k = 0; k < spec.length; k++) sum += spec[k];
    row[FEATURE_BANDS] = Math.min(Math.max((Math.log(sum + 1e-7) + 7) / 12, 0), 1);
    row[FEATURE_BANDS + 1] = h.voiced[t] ? Math.min(Math.max(Math.log(Math.max(h.f0[t], 1) / 100) / Math.log(14), 0), 1) : 0;
    row[FEATURE_BANDS + 2] = h.voiced[t];
    out.push(row);
  }
  return out;
}

export { RATE, HOP };
