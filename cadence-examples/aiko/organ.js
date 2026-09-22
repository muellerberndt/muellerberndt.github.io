// The voice organ, a twin of apollo/organ.py: a syrinx membrane, a tube tract shaped by tongue
// and beak, turbulence and a nasal branch. Constants come from data/organ.json so that the two
// twins cannot drift. Seven nerves per 10 ms frame in [0, 1].
export function mulberry(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function normals(random, n) {
  // The library's Box-Muller: pairs = ceil(n / 2) uniform draws give the radii, the next pairs
  // draws the angles; the output is all the cosines, then all the sines, cut to n.
  const pairs = Math.ceil(n / 2);
  const u = new Float64Array(2 * pairs);
  for (let i = 0; i < 2 * pairs; i++) u[i] = random();
  const out = new Float64Array(2 * pairs);
  for (let i = 0; i < pairs; i++) {
    const r = Math.sqrt(-2 * Math.log(Math.max(u[i], 1e-12)));
    const th = 2 * Math.PI * u[pairs + i];
    out[i] = r * Math.cos(th);
    out[pairs + i] = r * Math.sin(th);
  }
  return out.subarray(0, n);
}

export class Organ {
  constructor(c) {
    this.c = c;
    this.N = c.N;
    this.tractRate = c.RATE * c.OVER;
    this.rest = Float64Array.from(c.REST);
    this.mouthIndex = Float64Array.from(c.MOUTH_INDEX);
  }

  areas(tongueX, tongueY, beak) {
    const c = this.c;
    const areas = Float64Array.from(this.rest);
    const mi = this.mouthIndex;
    const centre = mi[0] + tongueX * (mi[mi.length - 1] - mi[0]);
    for (let k = 0; k < mi.length; k++) {
      const edge = Math.max(Math.abs(mi[k] - centre) - c.TONGUE_HALF, 0);
      const bump = Math.exp(-((edge / c.TONGUE_EDGE) ** 2));
      const f = 1 - tongueY * bump;
      areas[c.TRACHEA + k] *= f * f;
    }
    for (let k = this.N - 3; k < this.N; k++) areas[k] = c.A_MIN + beak * c.A_BEAK;
    for (let k = 0; k < this.N; k++) areas[k] = Math.max(areas[k], c.A_MIN);
    return areas;
  }

  // controls: array of F frames, each an array of 7 nerves. noise: optional Float64Array of F*HOP*OVER normals.
  render(controls, noise, seed = 1) {
    const c = this.c;
    const N = this.N;
    const frames = controls.length;
    const total = frames * c.HOP;
    if (!noise) noise = normals(mulberry(seed), total * c.OVER);
    const dt = 1 / this.tractRate;
    const smoothArt = 1 - Math.exp(-1 / (c.RATE * c.TAU_ARTICULATOR));
    const smoothBreath = 1 - Math.exp(-1 / (c.RATE * c.TAU_BREATH));
    const muscle = Float64Array.from(controls[0].map((v) => Math.min(Math.max(v, 0), 1)));
    let x = 0.02, y = 0;
    let f = new Float64Array(N), b = new Float64Array(N);
    let fn = new Float64Array(N), bn = new Float64Array(N);
    const out = new Float64Array(total);
    let hp = 0, last = 0, nasal1 = 0, nasal2 = 0;
    const nasalR = Math.exp(-Math.PI * c.NASAL_BANDWIDTH / c.RATE);
    const nasalC = 2 * nasalR * Math.cos(2 * Math.PI * c.NASAL_FORMANT / c.RATE);
    const nasalRR = nasalR * nasalR;
    const coupling = c.TRACHEA + 3;
    let areas = this.areas(muscle[3], muscle[4], muscle[5]);
    const refl = new Float64Array(N - 1);
    let narrow = 0, narrowArea = 0;
    const geometry = () => {
      for (let k = 0; k < N - 1; k++) refl[k] = (areas[k] - areas[k + 1]) / (areas[k] + areas[k + 1]);
      narrow = c.TRACHEA; narrowArea = areas[c.TRACHEA];
      for (let k = c.TRACHEA + 1; k < N; k++) if (areas[k] < narrowArea) { narrowArea = areas[k]; narrow = k; }
    };
    geometry();
    const trace = new Float64Array(frames * 3); // per frame: pressure, membrane amplitude, turbulence (for the page)
    let amp = 0;
    for (let n = 0; n < total; n++) {
      const target = controls[Math.floor(n / c.HOP)];
      muscle[0] += (Math.min(Math.max(target[0], 0), 1) - muscle[0]) * smoothBreath;
      for (let j = 1; j < 7; j++) muscle[j] += (Math.min(Math.max(target[j], 0), 1) - muscle[j]) * smoothArt;
      if (n % 16 === 0) { areas = this.areas(muscle[3], muscle[4], muscle[5]); geometry(); }
      const breath = muscle[0], gape = muscle[2];
      const omega = 2 * Math.PI * c.F0_LOW * Math.pow(c.F0_HIGH / c.F0_LOW, muscle[1]);
      const pressure = Math.max(breath - c.BREATH_THRESHOLD, 0) / (1 - c.BREATH_THRESHOLD);
      const mu = c.DRIVE * pressure * (1 - 2 * gape);
      const aspiration = 0.3 * breath * gape;
      const turbulence = 0.6 * breath * breath * Math.min(Math.max(1 - narrowArea / 0.12, 0), 1) * (narrowArea > 0.04 ? 1 : 0);
      const velum = muscle[6];
      const leak = 1 - 0.25 * velum;
      let acc = 0, back = 0;
      for (let k = 0; k < c.OVER; k++) {
        // membranes: midpoint step, then collision
        const dx1 = y, dv1 = -(omega * omega) * x - (2 * c.DAMPING * omega - mu * (1 - x * x)) * y;
        const xm = x + 0.5 * dt * dx1, vm = y + 0.5 * dt * dv1;
        const dx2 = vm, dv2 = -(omega * omega) * xm - (2 * c.DAMPING * omega - mu * (1 - xm * xm)) * vm;
        x = x + dt * dx2; y = y + dt * dv2;
        if (x < -c.CLOSED) { x = -c.CLOSED; y = -0.3 * y; }
        const open = Math.max(0, x - c.OPEN);
        const flow = 0.45 * open * open * Math.sqrt(pressure + 1e-6);
        const nz = noise[n * c.OVER + k];
        const source = flow + aspiration * nz;
        for (let s = 0; s < N - 1; s++) {
          const d = f[s] - b[s + 1];
          fn[s + 1] = f[s] + refl[s] * d;
          bn[s] = b[s + 1] + refl[s] * d;
        }
        fn[0] = source + c.SYRINX_REFLECTION * b[0];
        const radiated = f[N - 1] * (1 + c.BEAK_REFLECTION);
        bn[N - 1] = c.BEAK_REFLECTION * f[N - 1];
        fn[narrow] += turbulence * nz;
        bn[narrow] += turbulence * nz;
        for (let s = 0; s < N; s++) { fn[s] *= c.LOSS; bn[s] *= c.LOSS; }
        fn[coupling] *= leak; bn[coupling] *= leak;
        const tf = f; f = fn; fn = tf;
        const tb = b; b = bn; bn = tb;
        acc += radiated;
        back += f[coupling];
        amp = Math.max(amp * 0.999, Math.abs(x));
      }
      let sample = acc / c.OVER;
      const drive = velum * back / c.OVER;
      const nasal0 = drive + nasalC * nasal1 - nasalRR * nasal2;
      nasal2 = nasal1; nasal1 = nasal0;
      sample = sample + c.NASAL_GAIN * nasal0 * (1 - nasalRR);
      hp = 0.97 * hp + sample - last;
      last = sample;
      out[n] = Math.tanh(c.GAIN * hp);
      if (n % c.HOP === 0) { const fr = n / c.HOP; trace[3 * fr] = pressure; trace[3 * fr + 1] = amp; trace[3 * fr + 2] = turbulence + aspiration; }
    }
    return { audio: out, trace, areas: Array.from(areas), muscle: Array.from(muscle) };
  }
}
