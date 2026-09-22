import { Aiko, COLORS, MATERIALS, MIN_STRENGTH, SLOTS } from "./aiko.js";
import { features } from "./ear.js";

const RATE = 16000, HOP = 160;
const $ = (id) => document.getElementById(id);
let aiko, spec, organC, audioCtx = null;
let speaking = null; // {score, start, feats, shownRows}
let sleeping = false, listening = false, silence = 0, autoRunning = false;
const shown = { color: null, material: null };
let pendingTrial = null, rewardTimer = null;
const ear = { rows: [], max: 320 };
let cellGlow = null;
const stats = { nights: 0, heard: 0, said: 0, rewards: 0 };
const COLOR_HEX = { red: "#e5383b", blue: "#3a86ff", green: "#3cb371", yellow: "#ffd166" };

// ------------------------------------------------------------------ setup
async function main() {
  const [b, o] = await Promise.all([fetch("data/brain.json").then((r) => r.json()), fetch("data/organ.json").then((r) => r.json())]);
  spec = b; organC = o;
  aiko = new Aiko(spec, organC, (Date.now() % 100000) | 1);
  cellGlow = new Float32Array(aiko.mirror.cells);
  drawParrot();
  buildTrainer();
  renderRepertoire();
  fillCard();
  setMood("awake");
  requestAnimationFrame(frame);
  setInterval(tick, 100);
}

function ensureAudio() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (audioCtx.state === "suspended") audioCtx.resume();
  return audioCtx;
}

function play(audio) {
  const ctx = ensureAudio();
  const buf = ctx.createBuffer(1, audio.length, RATE);
  const ch = buf.getChannelData(0);
  for (let i = 0; i < audio.length; i++) ch[i] = audio[i];
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.connect(ctx.destination);
  const start = ctx.currentTime + 0.03;
  src.start(start);
  return { start, end: start + audio.length / RATE };
}

// ------------------------------------------------------------------ speaking
function speak(memory, { practice = true } = {}) {
  return new Promise((resolve) => {
    if (speaking || sleeping) return resolve();
    const r = aiko.say(memory, practice);
    const { start, end } = play(r.audio);
    speaking = { score: memory.score, start, end, feats: features(r.audio), shownRows: 0, name: memory.name, trace: r.trace, areas: r.areas };
    setBubble(memory.name);
    setMood(memory.kind === "born" ? "sounding off" : "saying " + memory.name);
    stats.said += 1;
    silence = 0;
    const ms = (end - ensureAudio().currentTime) * 1000 + 120;
    setTimeout(() => { speaking = null; setBubble(""); setMood("awake"); renderRepertoire(); resolve(); }, ms);
  });
}

function setBubble(text) { const el = $("bubble"); el.textContent = text; el.classList.toggle("on", !!text); }
function setMood(text) { $("mood").textContent = text; }

// ------------------------------------------------------------------ the loop
function tick() {
  if (speaking || sleeping || listening || autoRunning || pendingTrial) return;
  silence += 10;
  const m = aiko.bored(10);
  if (m) speak(m);
}

// ------------------------------------------------------------------ listening
let mediaStream = null, processor = null, recBuf = [], recRate = 48000, recCarry = [];
async function startListening() {
  ensureAudio();
  if (!mediaStream) {
    try { mediaStream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } }); }
    catch (e) { $("hint").textContent = "No microphone: the trainer's own recordings are below in the repertoire."; return; }
  }
  const ctx = audioCtx;
  recRate = ctx.sampleRate;
  const src = ctx.createMediaStreamSource(mediaStream);
  processor = ctx.createScriptProcessor(2048, 1, 1);
  recBuf = []; recCarry = [];
  processor.onaudioprocess = (e) => {
    if (!listening) return;
    const x = e.inputBuffer.getChannelData(0);
    const ratio = recRate / RATE;
    // linear resampling with a running phase
    let phase = recCarry.phase || 0;
    const last = recCarry.last || 0;
    const out = [];
    for (let i = 0; phase < x.length; ) {
      const j = Math.floor(phase), f = phase - j;
      const a = j === 0 ? last : x[j - 1], b = x[Math.min(j, x.length - 1)];
      out.push(a * (1 - f) + b * f);
      phase += ratio;
    }
    recCarry.phase = phase - x.length; recCarry.last = x[x.length - 1];
    for (const v of out) recBuf.push(v);
    // live ear: the newest frames
    const tail = recBuf.slice(-Math.max(out.length + 400, 800));
    const fr = features(Float64Array.from(tail));
    const fresh = Math.floor(out.length / HOP);
    for (const row of fr.slice(-fresh)) pushEar(row);
  };
  src.connect(processor);
  processor.connect(ctx.destination);
  listening = true;
  setMood("listening");
  $("mic").classList.add("rec");
}

function stopListening() {
  if (!listening) return;
  listening = false;
  $("mic").classList.remove("rec");
  if (processor) { processor.disconnect(); processor.onaudioprocess = null; processor = null; }
  const audio = trimAndLevel(Float64Array.from(recBuf));
  recBuf = [];
  if (!audio || audio.length < RATE * 0.12) { setMood("awake"); $("hint").textContent = "Too short. Hold the button while you say the word."; return; }
  const label = $("label").value.trim().toLowerCase() || null;
  const memory = aiko.hear(audio, label);
  stats.heard += 1;
  const n = memory.strength;
  $("hint").textContent = `Heard ${memory.name}: ${Math.min(n, MIN_STRENGTH)} of ${MIN_STRENGTH} hearings` + (n >= MIN_STRENGTH ? " · Aiko now says it on its own." : "");
  setMood("heard " + memory.name);
  renderRepertoire();
  setTimeout(() => speak(memory), 350);
}

function trimAndLevel(audio, margin = 4) {
  if (audio.length < RATE * 0.1) return null;
  const fr = features(audio);
  const loud = fr.map((r) => r[24]);
  const mx = Math.max(...loud);
  const on = [];
  loud.forEach((v, i) => { if (v > mx - 0.18 && v > 0.3) on.push(i); });
  if (!on.length) return null;
  const lo = Math.max(on[0] - margin, 0), hi = Math.min(on[on.length - 1] + margin + 1, loud.length);
  const cut = audio.slice(lo * HOP, hi * HOP);
  let rms = 0; for (const v of cut) rms += v * v; rms = Math.sqrt(rms / cut.length) || 1e-6;
  const g = Math.min(0.09 / rms, 40);
  return cut.map((v) => Math.tanh(v * g));
}

function pushEar(row) { ear.rows.push(row); if (ear.rows.length > ear.max) ear.rows.shift(); }

// ------------------------------------------------------------------ trainer
function buildTrainer() {
  for (const c of COLORS) {
    const b = document.createElement("button"); b.className = "swatch"; b.style.background = COLOR_HEX[c]; b.title = c;
    b.onclick = () => { shown.color = c; document.querySelectorAll("#colors .swatch").forEach((s) => s.classList.toggle("on", s.title === c)); objectShown(); };
    $("colors").appendChild(b);
  }
  for (const m of MATERIALS) {
    const b = document.createElement("button"); b.className = "chip"; b.textContent = m;
    b.onclick = () => { shown.material = m; document.querySelectorAll("#materials .chip").forEach((s) => s.classList.toggle("on", s.textContent === m)); objectShown(); };
    $("materials").appendChild(b);
  }
  $("q_color").onclick = () => ask("color");
  $("q_material").onclick = () => ask("material");
  $("q_both").onclick = () => ask("both");
  $("r_good").onclick = () => reward(1);
  $("r_almost").onclick = () => reward(0.5);
  $("auto").onclick = autoTrain;
  $("sleep").onclick = night;
  const mic = $("mic");
  mic.onpointerdown = (e) => { e.preventDefault(); startListening(); };
  mic.onpointerup = mic.onpointerleave = mic.onpointercancel = () => stopListening();
}

function objectShown() {
  const ready = shown.color && shown.material;
  for (const id of ["q_color", "q_material", "q_both"]) $(id).disabled = !ready;
  drawObject();
}

function say(text) {
  return new Promise((resolve) => {
    if (!("speechSynthesis" in window)) return resolve();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 1.0; u.pitch = 1.0;
    let done = false; const finish = () => { if (!done) { done = true; resolve(); } };
    u.onend = finish; u.onerror = finish;
    speechSynthesis.speak(u);
    setTimeout(finish, 2500);
  });
}

const QUESTION_TEXT = { color: "What color is this?", material: "What is this made of?", both: "What color is this, and what is it made of?" };

async function ask(question, { voice = true, auto = false } = {}) {
  if (speaking || sleeping || pendingTrial || !shown.color || !shown.material) return;
  ensureAudio();
  setMood("listening to the question");
  if (voice) await say(QUESTION_TEXT[question]);
  const trial = aiko.answer(shown.color, shown.material, question, { temperature: 0.25 });
  trial.question = question; trial.color = shown.color; trial.material = shown.material;
  pendingTrial = trial;
  for (const slot of trial.slots) await speak(aiko.memories[slot]);
  if (auto) return trial;
  $("r_good").disabled = false; $("r_almost").disabled = false;
  setMood("waiting for the trainer");
  rewardTimer = setTimeout(() => reward(0, true), 6000);
  return trial;
}

function reward(r, silent = false) {
  if (!pendingTrial) return;
  clearTimeout(rewardTimer);
  aiko.reward(pendingTrial, r);
  stats.rewards += 1;
  pendingTrial = null;
  $("r_good").disabled = true; $("r_almost").disabled = true;
  setBubble(r >= 1 ? "♥" : r > 0 ? "…" : "");
  setMood(r >= 1 ? "rewarded" : r > 0 ? "almost" : silent ? "no reward" : "no reward");
  setTimeout(() => { setBubble(""); setMood("awake"); }, 900);
  renderRepertoire();
}

function correct(trial) {
  const names = trial.names;
  if (trial.question === "color") return names[0] === trial.color ? 1 : 0;
  if (trial.question === "material") return names[0] === trial.material ? 1 : 0;
  return 0.5 * (names.includes(trial.color) ? 1 : 0) + 0.5 * (names.includes(trial.material) ? 1 : 0);
}

async function autoTrain() {
  if (autoRunning || speaking || sleeping) return;
  autoRunning = true;
  $("auto").disabled = true;
  const eligible = aiko.eligible().map((m) => m.name);
  const colors = COLORS.filter((c) => eligible.includes(c)), materials = MATERIALS.filter((m) => eligible.includes(m));
  if (!colors.length || !materials.length) { $("hint").textContent = "Teach Aiko color and material words first (three hearings each)."; autoRunning = false; $("auto").disabled = false; return; }
  let score = 0;
  for (let k = 0; k < 20; k++) {
    shown.color = colors[Math.floor(Math.random() * colors.length)];
    shown.material = materials[Math.floor(Math.random() * materials.length)];
    document.querySelectorAll("#colors .swatch").forEach((s) => s.classList.toggle("on", s.title === shown.color));
    document.querySelectorAll("#materials .chip").forEach((s) => s.classList.toggle("on", s.textContent === shown.material));
    objectShown();
    const q = ["color", "material", "both"][Math.floor(Math.random() * 3)];
    const trial = await ask(q, { voice: false, auto: true });
    if (!trial) break;
    const r = correct(trial);
    score += r;
    aiko.reward(trial, r); stats.rewards += 1; pendingTrial = null;
    setBubble(r >= 1 ? "♥" : r > 0 ? "…" : "✕"); setMood(`trial ${k + 1} of 20 · ${QUESTION_TEXT[q]} → ${trial.names.join(" ")}`);
    await new Promise((res) => setTimeout(res, 500));
    setBubble("");
  }
  $("hint").textContent = `Trainer's verdict over 20 trials: ${(100 * score / 20).toFixed(0)}% right. Sleep, then train again to see the night's effect.`;
  setMood("awake");
  autoRunning = false; $("auto").disabled = false;
  renderRepertoire();
}

function night() {
  if (sleeping || speaking) return;
  sleeping = true;
  $("night").classList.add("on");
  const gen = aiko.night({ mirrorPasses: 3, associationPasses: 40 });
  const step = () => {
    const t0 = performance.now();
    let r;
    while (performance.now() - t0 < 30) { r = gen.next(); if (r.done) break; $("nightsub").textContent = `dreaming · ${r.value.stage} ${r.value.pass} of ${r.value.of}`; }
    if (r && r.done) {
      sleeping = false; stats.nights += 1;
      $("night").classList.remove("on");
      const rep = r.value || {};
      $("hint").textContent = `Dawn. ${rep.association ? rep.association.updates + " slow updates on " + rep.association.cues + " situations" : "no situations yet"}${rep.mirror ? "; the mirror took " + rep.mirror.updates + " updates from " + rep.mirror.cues + " dreams" : ""}.`;
      setMood("awake");
      renderRepertoire();
    } else requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

function renderRepertoire() {
  const el = $("repertoire");
  el.innerHTML = "";
  for (const m of aiko.memories) {
    const s = document.createElement("span");
    s.textContent = m.name;
    if (m.strength < MIN_STRENGTH) { s.classList.add("weak"); s.innerHTML += `<b>${m.strength}/${MIN_STRENGTH}</b>`; }
    else if (m.reward > 0.05) s.innerHTML += `<b>♥${m.reward.toFixed(1)}</b>`;
    s.onclick = () => speak(m);
    el.appendChild(s);
  }
  $("counts").textContent = `${aiko.mirror.writes + aiko.association.writes} records · ${aiko.mirror.updates + aiko.association.updates} slow updates · ${stats.nights} nights`;
}

// ------------------------------------------------------------------ the parrot
function drawParrot() {
  const svg = $("parrot");
  svg.innerHTML = `
  <defs>
    <linearGradient id="gBody" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#b7bec7"/><stop offset="1" stop-color="#6f7884"/></linearGradient>
    <linearGradient id="gHead" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e3e7ec"/><stop offset="1" stop-color="#aeb6c0"/></linearGradient>
    <linearGradient id="gWing" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#8d96a2"/><stop offset="1" stop-color="#4f5762"/></linearGradient>
    <linearGradient id="gTail" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e63946"/><stop offset="1" stop-color="#9d0208"/></linearGradient>
    <radialGradient id="gEye"><stop offset="0" stop-color="#fff3b0"/><stop offset="1" stop-color="#e9c46a"/></radialGradient>
    <pattern id="wood" width="14" height="14" patternUnits="userSpaceOnUse" patternTransform="rotate(20)"><rect width="14" height="14" fill="rgba(0,0,0,0)"/><path d="M0 4 H14 M0 10 H14" stroke="rgba(60,30,0,.35)" stroke-width="2"/></pattern>
    <pattern id="paper" width="12" height="12" patternUnits="userSpaceOnUse"><path d="M0 6 H12" stroke="rgba(255,255,255,.35)" stroke-width="1"/></pattern>
    <linearGradient id="metal" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="rgba(255,255,255,.55)"/><stop offset=".45" stop-color="rgba(255,255,255,0)"/><stop offset=".55" stop-color="rgba(0,0,0,.25)"/><stop offset="1" stop-color="rgba(255,255,255,.3)"/></linearGradient>
    <linearGradient id="glass" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="rgba(255,255,255,.6)"/><stop offset=".5" stop-color="rgba(255,255,255,.05)"/><stop offset="1" stop-color="rgba(255,255,255,.35)"/></linearGradient>
  </defs>
  <g id="perch"><path d="M40 430 C 200 400, 420 470, 610 420" stroke="#5b3a1e" stroke-width="18" fill="none" stroke-linecap="round"/><path d="M40 430 C 200 400, 420 470, 610 420" stroke="#8a5a2b" stroke-width="8" fill="none" stroke-linecap="round" opacity=".6"/></g>
  <g id="bird" transform="translate(300 300)">
    <g id="body">
      <path id="tail" d="M-30 70 L-70 190 L-20 175 L10 195 L30 168 L55 185 L40 70 Z" fill="url(#gTail)"/>
      <ellipse cx="0" cy="60" rx="92" ry="112" fill="url(#gBody)"/>
      <path id="wing" d="M-20 -10 C 60 -20, 110 60, 70 160 C 50 120, 10 80, -20 -10 Z" fill="url(#gWing)"/>
      <path d="M-40 150 l-12 30 M-34 152 l2 32 M-28 150 l14 30" stroke="#3a3f47" stroke-width="5" stroke-linecap="round" fill="none"/>
      <path d="M22 156 l-12 30 M28 158 l2 32 M34 156 l14 30" stroke="#3a3f47" stroke-width="5" stroke-linecap="round" fill="none"/>
    </g>
    <g id="head">
      <circle cx="-8" cy="-60" r="70" fill="url(#gHead)"/>
      <ellipse cx="18" cy="-70" rx="30" ry="26" fill="#f6f7f9"/>
      <circle id="eye" cx="24" cy="-70" r="11" fill="url(#gEye)"/>
      <circle id="pupil" cx="26" cy="-70" r="5.5" fill="#111"/>
      <rect id="lid" x="10" y="-84" width="28" height="0" rx="6" fill="#dfe3e8"/>
      <path id="upperbeak" d="M40 -70 C 80 -80, 96 -40, 74 -18 C 62 -8, 52 -12, 44 -20 C 46 -40, 42 -56, 40 -70 Z" fill="#2b2f36"/>
      <g id="jaw" transform="rotate(0 44 -20)">
        <path d="M44 -22 C 60 -14, 72 -14, 78 -22 C 74 -4, 58 4, 44 -6 Z" fill="#1c1f25"/>
      </g>
      <path d="M40 -70 C 62 -78, 80 -66, 84 -56" stroke="rgba(0,0,0,.25)" stroke-width="2" fill="none"/>
    </g>
  </g>
  <g id="object" transform="translate(110 350)"></g>`;
}

function drawObject() {
  const g = $("object");
  if (!shown.color || !shown.material) { g.innerHTML = ""; return; }
  const c = COLOR_HEX[shown.color];
  let extra = "";
  if (shown.material === "wood") extra = `<rect x="-46" y="-40" width="92" height="80" rx="10" fill="url(#wood)"/>`;
  if (shown.material === "paper") extra = `<rect x="-46" y="-40" width="92" height="80" rx="10" fill="url(#paper)"/><path d="M46 -40 L 28 -40 L 46 -22 Z" fill="rgba(255,255,255,.7)"/>`;
  if (shown.material === "metal") extra = `<rect x="-46" y="-40" width="92" height="80" rx="10" fill="url(#metal)"/><circle cx="-34" cy="-28" r="3" fill="#333"/><circle cx="34" cy="-28" r="3" fill="#333"/><circle cx="-34" cy="28" r="3" fill="#333"/><circle cx="34" cy="28" r="3" fill="#333"/>`;
  if (shown.material === "glass") extra = `<rect x="-46" y="-40" width="92" height="80" rx="10" fill="url(#glass)"/>`;
  const opacity = shown.material === "glass" ? 0.55 : 1;
  g.innerHTML = `<ellipse cx="0" cy="48" rx="60" ry="10" fill="rgba(0,0,0,.35)"/><rect x="-46" y="-40" width="92" height="80" rx="10" fill="${c}" opacity="${opacity}"/>${extra}<text x="0" y="72" text-anchor="middle" fill="#7389a6" font-size="12" font-family="Inter">${shown.color} ${shown.material}</text>`;
}

let blinkAt = performance.now() + 2000;
function animateParrot(now) {
  let open = 0.05 + 0.03 * Math.sin(now / 900);
  let tilt = 0;
  if (speaking && audioCtx) {
    const t = audioCtx.currentTime - speaking.start;
    const fr = Math.floor(t * 100);
    if (fr >= 0 && fr < speaking.score.length) {
      const s = speaking.score[fr];
      open = 0.1 + 0.9 * Math.min(1, s[0] * (0.3 + 0.7 * s[5]));
      // reveal the ear rows as the sound goes by
      while (speaking.shownRows <= fr && speaking.shownRows < speaking.feats.length) pushEar(speaking.feats[speaking.shownRows++]);
    }
  }
  if (listening) tilt = -8;
  if (now > blinkAt) { $("lid").setAttribute("height", now - blinkAt < 120 ? 26 : 0); if (now - blinkAt > 160) blinkAt = now + 1500 + Math.random() * 3500; }
  $("jaw").setAttribute("transform", `rotate(${(open * 26).toFixed(1)} 44 -20)`);
  const puff = 1 + 0.03 * Math.min(aiko.arousal, 1.5);
  $("head").setAttribute("transform", `rotate(${tilt} -8 -60)`);
  $("body").setAttribute("transform", `scale(${puff.toFixed(3)})`);
}

// ------------------------------------------------------------------ the brain scan
function frame(now) {
  animateParrot(now);
  drawScan();
  requestAnimationFrame(frame);
}

function heat(v) { // 0..1 -> ember ramp
  const x = Math.min(Math.max(v, 0), 1);
  const r = Math.min(255, 40 + 420 * x), g = Math.max(0, Math.min(255, -60 + 360 * x)), b = Math.max(0, Math.min(255, 60 - 40 * x + 500 * Math.max(x - 0.75, 0)));
  return `rgb(${r | 0},${g | 0},${b | 0})`;
}

function drawScan() {
  const cv = $("scan"), ctx = cv.getContext("2d");
  const W = cv.width, H = cv.height;
  ctx.fillStyle = "#0a1526"; ctx.fillRect(0, 0, W, H);
  const label = (text, x, y) => { ctx.fillStyle = "#7389a6"; ctx.font = "600 18px Inter"; ctx.letterSpacing = "2px"; ctx.fillText(text.toUpperCase(), x, y); };
  // 1 ear
  label("Ear · what it hears", 20, 34);
  const ex = 20, ey = 46, ew = W - 40, eh = 200;
  const cols = ear.max, cw = ew / cols, rh = eh / 24;
  ctx.fillStyle = "#0e1b30"; ctx.fillRect(ex, ey, ew, eh);
  for (let i = 0; i < ear.rows.length; i++) {
    const row = ear.rows[i], x = ex + (cols - ear.rows.length + i) * cw;
    for (let k = 0; k < 24; k++) { ctx.fillStyle = heat((row[k] - 0.35) * 1.8 * Math.min(1, row[24] * 1.5)); ctx.fillRect(x, ey + eh - (k + 1) * rh, Math.ceil(cw), Math.ceil(rh)); }
    if (row[26]) { ctx.fillStyle = "#9bd7ff"; ctx.fillRect(x, ey + eh - row[25] * eh, Math.ceil(cw), 3); }
  }
  ctx.fillStyle = "#7389a6"; ctx.font = "13px Inter"; ctx.fillText("24 bands, pitch in blue", ex, ey + eh + 18);
  // 2 mirror
  label("Mirror · sound to nerves", 20, 300);
  const my = 312, mh = 260;
  // context channels
  const hid = aiko.last.hidden;
  ctx.fillStyle = "#0e1b30"; ctx.fillRect(20, my, 300, mh);
  if (hid) {
    const T = hid.length, Hn = hid[0].length, cw2 = 300 / T, rh2 = mh / Hn;
    for (let t = 0; t < T; t++) for (let j = 0; j < Hn; j++) { ctx.fillStyle = heat(0.5 + 0.5 * hid[t][j]); ctx.fillRect(20 + t * cw2, my + j * rh2, Math.ceil(cw2), Math.ceil(rh2)); }
  }
  ctx.fillStyle = "#7389a6"; ctx.font = "13px Inter"; ctx.fillText(`context · ${aiko.mirror.hidden} channels over time`, 20, my + mh + 18);
  // record cells
  const gx = 340, gs = 260 / 64;
  for (let i = 0; i < cellGlow.length; i++) cellGlow[i] *= 0.97;
  if (aiko.last.codes) { const last = aiko.last.codes; const from = Math.max(0, last.length - 8); for (let t = from; t < last.length; t++) for (let k = 0; k < last[t].idx.length; k++) cellGlow[last[t].idx[k]] = Math.max(cellGlow[last[t].idx[k]], last[t].val[k] * 3); }
  ctx.fillStyle = "#0e1b30"; ctx.fillRect(gx, my, 260, 260);
  for (let i = 0; i < cellGlow.length; i++) { if (cellGlow[i] < 0.02) continue; ctx.fillStyle = heat(cellGlow[i]); ctx.fillRect(gx + (i % 64) * gs, my + Math.floor(i / 64) * gs, gs - 0.6, gs - 0.6); }
  ctx.fillStyle = "#7389a6"; ctx.fillText(`records · ${aiko.mirror.cells} cells, ${aiko.mirror.active} active`, gx, my + mh + 18);
  // nerves
  const nx = 620, nw = W - 20 - nx;
  ctx.fillStyle = "#0e1b30"; ctx.fillRect(nx, my, nw, mh);
  const names = organC.NERVES;
  const score = aiko.last.nerves;
  if (score) {
    const T = score.length, rh3 = mh / 7;
    for (let k = 0; k < 7; k++) {
      ctx.strokeStyle = ["#ff6228", "#ffd166", "#9bd7ff", "#7cffa0", "#a78bfa", "#f472b6", "#94a3b8"][k]; ctx.lineWidth = 2; ctx.beginPath();
      for (let t = 0; t < T; t++) { const x = nx + (t / Math.max(T - 1, 1)) * nw, y = my + (k + 1) * rh3 - score[t][k] * (rh3 - 4) - 2; if (t === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); }
      ctx.stroke();
      ctx.fillStyle = "#7389a6"; ctx.font = "11px Inter"; ctx.fillText(names[k], nx + 4, my + k * rh3 + 12);
    }
  }
  ctx.fillStyle = "#7389a6"; ctx.font = "13px Inter"; ctx.fillText("nerves · seven per 10 ms", nx, my + mh + 18);
  // 3 organ
  label("Organ · syrinx, tract, beak", 20, 630);
  const oy = 650, oh = 150;
  ctx.fillStyle = "#0e1b30"; ctx.fillRect(20, oy, W - 40, oh);
  const areas = (speaking && speaking.areas) || aiko.last.areas || organC.REST;
  const n = areas.length, sw = (W - 80) / n;
  let amp = 0, turb = 0;
  if (speaking && audioCtx) { const fr = Math.floor((audioCtx.currentTime - speaking.start) * 100); if (fr >= 0 && fr < speaking.score.length) { amp = speaking.trace[3 * fr + 1]; turb = speaking.trace[3 * fr + 2]; } }
  for (let i = 0; i < n; i++) {
    const w = Math.sqrt(areas[i] / 3.0) * (oh - 30);
    const x = 40 + i * sw, cy = oy + oh / 2;
    ctx.fillStyle = i < organC.TRACHEA ? "#3b5f8a" : i >= n - 3 ? "#2b2f36" : "#4f7fb5";
    ctx.fillRect(x, cy - w / 2, sw - 1.5, w);
  }
  ctx.fillStyle = heat(Math.min(1, amp / 2)); ctx.beginPath(); ctx.arc(40, oy + oh / 2, 8 + 10 * Math.min(1, amp / 2), 0, 7); ctx.fill();
  if (turb > 0.02) { ctx.fillStyle = "rgba(255,255,255,.7)"; for (let s = 0; s < 12 * turb; s++) ctx.fillRect(40 + Math.random() * (W - 80), oy + 10 + Math.random() * (oh - 20), 2, 2); }
  ctx.fillStyle = "#7389a6"; ctx.font = "13px Inter"; ctx.fillText("area of each tube section, syrinx at the left, beak at the right · membrane glow · turbulence", 20, oy + oh + 18);
  // 4 situations
  label("Situations · object and question to word", 20, 850);
  const sy = 870, sh = 260;
  ctx.fillStyle = "#0e1b30"; ctx.fillRect(20, sy, W - 40, sh);
  const vals = aiko.last.values;
  const bw = (W - 60) / SLOTS;
  for (let s = 0; s < SLOTS; s++) {
    const m = aiko.memories[s];
    const v = vals ? vals[s] : 0;
    const x = 30 + s * bw;
    const chosen = pendingTrial && pendingTrial.slots.includes(s);
    ctx.fillStyle = chosen ? "#ffd166" : m ? (m.strength >= MIN_STRENGTH ? "#4f7fb5" : "#2c3f5c") : "#182642";
    const h = Math.max(2, Math.min(1, Math.max(v, 0)) * (sh - 60));
    ctx.fillRect(x, sy + sh - 34 - h, bw - 6, h);
    if (m) { ctx.save(); ctx.translate(x + bw / 2 - 2, sy + sh - 28); ctx.rotate(-Math.PI / 5); ctx.fillStyle = chosen ? "#ffd166" : "#aec3da"; ctx.font = "11px Inter"; ctx.fillText(m.name, 0, 0); ctx.restore(); }
  }
  const c = aiko.last.context;
  if (c) { for (let i = 0; i < c.length; i++) { ctx.fillStyle = c[i] ? "#7cffa0" : "#1c2a44"; ctx.fillRect(30 + i * 14, sy + 8, 11, 11); } ctx.fillStyle = "#7389a6"; ctx.font = "11px Inter"; ctx.fillText("color · material · question · slot · said", 30, sy + 34); }
  // 5 status
  const ay = 1160;
  label("Need to act", 20, ay);
  ctx.fillStyle = "#0e1b30"; ctx.fillRect(20, ay + 12, W - 40, 22);
  ctx.fillStyle = heat(Math.min(aiko.arousal, 1)); ctx.fillRect(20, ay + 12, (W - 40) * Math.min(aiko.arousal, 1), 22);
  ctx.fillStyle = "#7389a6"; ctx.font = "13px Inter";
  ctx.fillText(`arousal rises in silence and discharges into a vocalization · ${stats.said} said · ${stats.heard} heard · ${stats.rewards} rewards · ${stats.nights} nights`, 20, ay + 58);
  $("brainfoot").innerHTML = speaking ? `saying <b>${speaking.name}</b>` : listening ? "listening" : sleeping ? "sleeping" : pendingTrial ? "waiting for the reward" : `${aiko.eligible().length} things it can say · ${aiko.memories.length - aiko.eligible().length} being learned`;
}

function fillCard() {
  const m = spec.mirror, a = spec.association;
  $("cardbody").innerHTML = `
  <p>Aiko is an African grey parrot in software. Its voice is a physical model: a membrane in the syrinx driven by air-sac pressure, a tube tract of ${organC.N} sections whose areas the tongue and beak set, turbulence at the narrowest constriction, and a nasal branch. Seven nerves per 10 ms drive it. Nothing in the organ or the brain knows a phone or a formant.</p>
  <p>Two Cadence record patches learn. The <b>mirror</b> hears (24 bands, loudness, pitch, voicing) and proposes the nerves that would have made the sound; it learned from Aiko's own babbling, one record per moment, and slept. A word you say goes through the mirror and comes out as a nerve score; every further hearing averages a new proposal into it. The <b>situation</b> patch reads the object shown, the question, and what it has said, and values each thing it can say; your reward is written into its records in one step. A night dreams over the situations and moves what the store holds into the slow weights, which is where generalization to objects never shown comes from.</p>
  <table>
  <tr><td>mirror</td><td>${m.inputs} features → ${m.hidden} context channels → ${m.outputs} nerves; ${m.cells} record cells, ${m.active} active; write rate ${m.record_rate}</td></tr>
  <tr><td>situations</td><td>${a.inputs} context units → ${a.hidden} channels → ${a.outputs} slots; ${a.cells} cells, ${a.active} active</td></tr>
  <tr><td>born with</td><td>${spec.memories.filter((x) => x.kind === "born").map((x) => x.name).join(", ")}</td></tr>
  <tr><td>arrived knowing</td><td>${spec.memories.filter((x) => x.kind === "word").map((x) => x.name).join(", ") || "no words"} (heard three times each from a synthetic trainer before the page was built)</td></tr>
  <tr><td>in the browser</td><td>the same organ, ear and patches in JavaScript, checked against the Python originals to 1e-14; the night runs here too</td></tr>
  <tr><td>imitation</td><td>ear distance to the trainer after three hearings: 0.83 with the mirror's records, 0.61 after a night, 0.50 after ten rounds of private practice; a direct fit of the nerves to the trainer reaches 0.40 to 0.57. Whisper names 2 of the 10 hand-scored words and none of the imitations: the recognizer is a harsh judge of this voice, and the listening board carries the human verdict.</td></tr>
  <tr><td>association</td><td>16 objects, three questions, four objects never shown, 400 rewarded trials, three seeds: greedy accuracy 0.69 to 0.92 on shown objects and 0.58 to 0.75 on the unseen ones; shuffled reward 0.06 to 0.10 and 0.00 to 0.08; an online GRU with one gradient step per trial on the same rewards 0.28 to 0.43 and 0.00 to 0.12.</td></tr>
  <tr><td>source</td><td>cadence-apollo (Pragma Research, 2026); library <a href="https://github.com/muellerberndt/cadence">cadence</a></td></tr>
  </table>
  <p>Aiko is not Apollo, Alex or any living bird. The design follows Pepperberg's model/rival training and Beckers, Nelson and Suthers on lingual articulation in parrots. Whisper, a speech recognizer, is the intelligibility judge in the measurements; your ear is the judge here.</p>`;
}

main();
