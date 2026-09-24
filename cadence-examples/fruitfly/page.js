// A fly in a room: the page. The body flies in the three.js room (body.js, room.js, fly.js), the
// life layer decides (life.js), the brain settles in a worker (worker.js over brain.js) on the
// flight-and-instinct sub-net of the BANC connectome, and the whole nervous system is drawn at
// its measured positions (brain_scan.js on data/atlas.json) with the sub-net's activity live.
import * as THREE from "three";
import { Flight, DT, cos_, sin_ } from "./body.js";
import { createRoom, createHand, createRenderer, createComposer, CameraRig, toThree, fromThree } from "./room.js";
import { createFly } from "./fly.js";
import { Life, DECISION_S } from "./life.js";
import { BrainScan, decodeAtlas } from "./brain_scan.js";

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const BRAIN_MS = 2.0;                      // ms of simulated time per settling step (declared timescale)
const STEPS_PER_MESSAGE = 12;

// ---- the room ------------------------------------------------------------------------------
const canvas = $("world");
const renderer = createRenderer(canvas);
const scene = new THREE.Scene(); scene.background = new THREE.Color(0x0c182b);
const world = new THREE.Group(); world.rotation.x = -Math.PI / 2; scene.add(world);
const room = createRoom(world);
const fly = createFly(); world.add(fly.group, fly.shadow, fly.locator);
const hand = createHand(); scene.add(hand);
const rig = new CameraRig(innerWidth / innerHeight);
const { composer, bloom } = createComposer(renderer, scene, rig.camera);

// ---- the fly and its life --------------------------------------------------------------------
const S = { speed: 0.25, pilot: "brain", paused: false, ready: false, brainReady: false, atlasReady: false, simTime: 0, brainDue: 0, pending: false, brainSteps: 0, brainMs: 0, active: 0, frames: 0, fps: 0, fpsClock: 0, lastScan: 0, seed: Number(params.get("seed") || 1) };
let flight = new Flight([1.2, 1.0, 1.2], 0.3);
let life = new Life(flight, room, S.seed);

// ---- the brain in its worker ---------------------------------------------------------------
const worker = new Worker("./worker.js", { type: "module" });
let members = null, whole = 0, activation = null, payloadInfo = null;
worker.onmessage = (e) => {
  const m = e.data;
  if (m.type === "ready") {
    members = m.members; whole = m.whole.neurons; payloadInfo = m;
    S.brainReady = true; loadingStep("the brain is awake", 0.9);
    // the level-flight rest: settle under the senses of a level, still fly with no hand
    worker.postMessage({ type: "run", stimuli: life.senses(null, 0), steps: 200, baseline: true });
    S.pending = true;
    fillCard();
    return;
  }
  if (m.type === "state") {
    S.pending = false; S.brainSteps = m.steps; S.brainMs = m.ms / Math.max(1, m.ran || 1); S.active = m.active;
    life.readouts = m.readouts;
    if (m.baseline) { life.setBaseline(m.readouts); finishLoading(); }
    if (activation && members) { for (let i = 0; i < members.length; i++) activation[members[i]] = m.s[i]; S.newState = true; }
  }
};
worker.postMessage({ type: "init", url: "./data/brain.json" });

// ---- the whole nervous system ---------------------------------------------------------------
let scan = null;
fetch("./data/atlas.json").then((r) => r.json()).then((raw) => {
  const atlas = decodeAtlas(raw);
  activation = new Float32Array(atlas.n);
  scan = new BrainScan($("scan"), atlas, { style: params.get("style") === "scan" ? "scan" : "brain", labels: $("labels"), strip: $("strip"), shell: false, spin: true, spinRate: 0.06, montageRows: 9, restAlpha: 0.05, lineBudget: 200000, particleBudget: 150000, background: [12 / 255, 24 / 255, 43 / 255], exposure: 0.45, glow: 1.6, labelTop: 4, heatDecay: 0.9 });
  scan.set(activation);
  $("legend").innerHTML = atlas.regions.map((r) => `<span><i style="background:rgb(${r.color.join(",")})"></i>${r.name}</span>`).join("");
  S.atlasReady = true; loadingStep("the nervous system is drawn", 0.6);
  $("style-brain").onclick = () => { scan.setStyle("brain"); styleButtons("brain"); };
  $("style-scan").onclick = () => { scan.setStyle("scan"); styleButtons("scan"); };
  $("brain-fit").onclick = () => scan.fit();
  $("brain-big").onclick = () => { const big = $("brain").classList.toggle("big"); $("brain-big").textContent = big ? "shrink" : "expand"; scan.options.labelTop = big ? 12 : 4; scan.options.exposure = big ? 0.8 : 0.45; setTimeout(() => { scan.resize && scan.resize(); scan.fit(); }, 300); };
  styleButtons(scan.brain ? "brain" : "scan");
});
function styleButtons(which) { $("style-brain").classList.toggle("on", which === "brain"); $("style-scan").classList.toggle("on", which === "scan"); }

// ---- loading -------------------------------------------------------------------------------
function loadingStep(text, frac) { $("loading-text").textContent = text; $("loading-bar").style.width = (100 * frac).toFixed(0) + "%"; }
function finishLoading() { if (S.ready) return; S.ready = true; loadingStep("ready", 1); setTimeout(() => $("loading").classList.add("gone"), 400); }
loadingStep("loading the nervous system (30 MB)", 0.1);

// ---- the hand at the cursor ----------------------------------------------------------------
const mouse = new THREE.Vector2(), ray = new THREE.Raycaster(), fwd = new THREE.Vector3();
let lunge = 0, handWorld = null;
canvas.addEventListener("pointermove", (e) => { mouse.set(e.clientX / innerWidth * 2 - 1, -(e.clientY / innerHeight) * 2 + 1); hand.visible = true; });
canvas.addEventListener("pointerleave", () => { hand.visible = false; handWorld = null; });
canvas.addEventListener("pointerdown", swat);
canvas.addEventListener("wheel", (e) => { rig.wheel(e.deltaY); e.preventDefault(); }, { passive: false });
function placeHand(dt) {
  lunge = Math.max(0, lunge - dt);
  if (!hand.visible) { handWorld = null; return; }
  rig.camera.getWorldDirection(fwd);
  const flyPos = toThree(...flight.p);
  let depth = flyPos.sub(rig.camera.position).dot(fwd);
  if (rig.mode === "eye") depth = 0.08;
  depth = Math.max(depth, 0.03) - 0.02 * Math.sin(Math.PI * Math.min(1, lunge / 0.16));
  ray.setFromCamera(mouse, rig.camera);
  const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(fwd, rig.camera.position.clone().addScaledVector(fwd, depth));
  const hit = new THREE.Vector3();
  if (ray.ray.intersectPlane(plane, hit)) { hand.position.copy(hit); hand.lookAt(rig.camera.position); handWorld = fromThree(hand.position); }
}
function swat() {
  if (!hand.visible || !handWorld) return;
  lunge = 0.16;
  const hp = handWorld, p = flight.p, d = [p[0] - hp[0], p[1] - hp[1], p[2] - hp[2]], dist = Math.hypot(...d);
  life.log(dist > 0.03 ? "a swat misses" : "swatted");
  if (dist > 0.03) return;
  const f = fromThree(fwd);
  let dir = [0.6 * d[0] / (dist || 1) + 0.4 * f[0], 0.6 * d[1] / (dist || 1) + 0.4 * f[1], 0.6 * d[2] / (dist || 1) + 0.4 * f[2] + 0.2];
  const n = Math.hypot(...dir) || 1; dir = dir.map((v) => v / n);
  if (life.mode !== "flying") life.takeoff("swatted off the surface");
  flight.swat([1.2 * dir[0], 1.2 * dir[1], 1.2 * dir[2]], [3 * dir[0], 3 * dir[1], 3 * dir[2]], [40 * dir[1], -40 * dir[0], 25 * (dir[0] - dir[1])]);
}

// ---- controls on screen ----------------------------------------------------------------------
for (const b of document.querySelectorAll("[data-cam]")) b.addEventListener("click", () => setCam(b.dataset.cam));
function setCam(mode) { rig.setMode(mode); for (const b of document.querySelectorAll("[data-cam]")) b.classList.toggle("on", b.dataset.cam === mode); }
for (const b of document.querySelectorAll("[data-speed]")) b.addEventListener("click", () => { S.speed = Number(b.dataset.speed); for (const c of document.querySelectorAll("[data-speed]")) c.classList.toggle("on", c === b); });
for (const b of document.querySelectorAll("[data-pilot]")) b.addEventListener("click", () => setPilot(b.dataset.pilot));
function setPilot(which) {
  S.pilot = which; for (const b of document.querySelectorAll("[data-pilot]")) b.classList.toggle("on", b.dataset.pilot === which);
  worker.postMessage({ type: "shuffle", on: which === "shuffled", seed: S.seed });
  life.log(which === "brain" ? "the measured wiring steers" : which === "shuffled" ? "the wiring is shuffled" : "the hand-written instincts alone");
}
$("disturb").onclick = () => { const [w, x, y, z] = flight.q, c = cos_(-0.175), s = sin_(-0.175); flight.q = [w * c - y * s, x * c + z * s, y * c + w * s, z * c - x * s]; flight.kick(0, -25, 0); if (life.mode !== "flying") life.takeoff("kicked into the air"); life.log("kicked in pitch"); };
$("pause").onclick = () => { S.paused = !S.paused; $("pause").textContent = S.paused ? "resume" : "pause"; };
$("about").onclick = () => { $("card").classList.toggle("open"); };
addEventListener("keydown", (e) => { if (e.key === "1") setCam("follow"); if (e.key === "2") setCam("room"); if (e.key === "3") setCam("eye"); if (e.key === " ") { e.preventDefault(); $("pause").onclick(); } });

function resize() { const w = innerWidth, h = innerHeight; renderer.setSize(w, h); composer.setSize(w, h); bloom.resolution.set(w / 2, h / 2); rig.camera.aspect = w / h; rig.camera.updateProjectionMatrix(); }
addEventListener("resize", resize); resize();

// ---- the HUD --------------------------------------------------------------------------------
const SENSE_ROWS = [["haltere tone", (s) => s["haltere:left"]], ["ocellus L", (s) => s["ocelli:left"]], ["ocellus R", (s) => s["ocelli:right"]], ["looming", (s) => s["vis:LC4"]], ["fruit odour L", (s) => s["orn:decaying_fruit:left"]], ["fruit odour R", (s) => s["orn:decaying_fruit:right"]], ["apple odour", (s) => Math.max(s["orn:fruity:left"], s["orn:fruity:right"])], ["sugar", (s) => s["grn:sugar:labellum"]], ["leg touch", (s) => s["leg_touch"]], ["wind", (s) => s["jo:C:left"]]];
const MOTOR_ROWS = [["DNa02 left", "dn:DNa02:left"], ["DNa02 right", "dn:DNa02:right"], ["DNp09 forward", "dn:DNp09"], ["landing DNs", "dn:landing"], ["giant fibre", "gf"], ["MN9 feeding", "mn9"], ["aDN grooming", "dn:grooming"], ["power L", "power:left"], ["power R", "power:right"], ["steering L", "steering:left"], ["steering R", "steering:right"]];
function row(parent, label, cls) { const d = document.createElement("div"); d.className = "row"; d.innerHTML = `<span>${label}</span><div class="bar ${cls}"><i></i></div><span class="num">0.00</span>`; parent.appendChild(d); return { fill: d.querySelector("i"), num: d.querySelector(".num") }; }
const senseBars = SENSE_ROWS.map(([label]) => row($("senses"), label, "")), motorBars = MOTOR_ROWS.map(([label]) => row($("motors"), label, "motor"));
let lastSenses = {};
function hud() {
  SENSE_ROWS.forEach(([_, f], k) => { const v = Math.max(0, Math.min(1, f(lastSenses) || 0)); senseBars[k].fill.style.width = (100 * v).toFixed(1) + "%"; senseBars[k].num.textContent = v.toFixed(2); });
  MOTOR_ROWS.forEach(([_, name], k) => { const v = Math.max(0, Math.min(1, life.readouts[name] || 0)); motorBars[k].fill.style.width = (100 * v).toFixed(1) + "%"; motorBars[k].num.textContent = v.toFixed(2); });
  const ev = life.events.slice(-4).map(([t, x]) => `<span style="color:var(--dim)">${t.toFixed(1)} s</span> ${x}`).join("<br>");
  $("stats").innerHTML = `<b>${life.mode}</b> · ${flight.speed().toFixed(2)} m/s · ${(100 * flight.p[2]).toFixed(0)} cm up · ${life.controls.f.toFixed(0)} Hz · hunger ${life.hunger.toFixed(2)}<br>${ev}`;
  const info = payloadInfo ? `<b>${payloadInfo.n.toLocaleString()}</b> of ${whole.toLocaleString()} neurons settle here (${payloadInfo.edges.toLocaleString()} synapse classes) · step ${S.brainSteps.toLocaleString()} · ${S.brainMs.toFixed(1)} ms per step · ${S.active} active` : "loading the brain";
  $("brainfoot").innerHTML = info + (scan ? ` · ${S.fps.toFixed(0)} fps` : "");
}

// ---- the model card -------------------------------------------------------------------------
function fillCard() {
  const m = payloadInfo;
  $("card-brain").innerHTML = `<b>The brain.</b> The nervous system of an adult female <i>Drosophila melanogaster</i>, brain and nerve cord wired as measured (BANC release 888: ${whole.toLocaleString()} neurons, 1,861,418 synapse classes at five or more synapses), as one Cadence brain with the library's graded rate model at one global gain selected on two physiology facts. The page draws every neuron at its soma position and settles the ${m.n.toLocaleString()}-neuron sub-net recruited from the flight, looming, odour, taste and mushroom-body populations, one step per ${BRAIN_MS} ms of simulated time; the sub-net's settled populations agree with the whole brain's under the page's stimuli to a readout deviation below 1e-3 (receipts/subnet_closure.json).`;
  $("card-body").innerHTML = `<b>The body.</b> A rigid body with stroke-averaged aerodynamics, unstable in pitch open loop as the animal is; its wingbeat-timescale equilibrium reflex is a hand-written inner loop, supplied like the worm's undulation, because haltere afferents encode rotation in spike timing that a rate model cannot carry. The browser body is bit-identical to the Python reference over 71,000 steps.`;
  $("card-senses").innerHTML = `<b>Senses and muscles.</b> Halteres as a flight tone, the two ocelli by attitude, HS and VS by rotational flow, the antennae by airspeed, looming by the hand's angular expansion onto LC4 and LPLC2, the fruit's odour on the receptor neurons of its class with a 5 cm bilateral baseline, sugar on the labellar and leg receptors when standing on the fruit, leg touch when landed. The descending neurons DNa02 (turns), DNp09 (forward flight), DNp07 and DNp10 (landing), the giant fibre (escape), MN9 (feeding) and aDN1/2 (grooming) are read as deviations from their level-flight rest and override a hand-written instinct layer (bouts, saccades at 0.4 per second, landings, sitting, grooming); the switch below the room replaces the measured wiring by a shuffled one, or removes the brain.`;
  $("card-claim").innerHTML = `<b>What is measured.</b> Gate 2: 7 of 13 held-out physiology facts about the wing steering circuit pass on the measured wiring against 4, 3 and 0 on shuffled wirings. Gate 3: 7 of 14 instinct facts (looming to the giant fibre, sugar to the proboscis, odour to the descending neurons) against 2 on each shuffled wiring. Gate 4, learning which odour means sugar by the library's actor-critic on the measured wiring, is in the receipts of the repository.`;
  $("card-sources").innerHTML = ["BANC: the Lee lab and the BANC community, release 888 (CC BY).", "Fayyazuddin and Dickinson 1996, 1999; Dickinson 1999; Chan, Prete and Dickinson 1998 (the haltere and wing steering circuit).", "von Reyn et al. 2014; Klapoetke et al. 2017; Ache et al. 2019 (looming, escape, landing).", "Gordon and Scott 2009; Shiu et al. 2024 (taste to the proboscis).", "Censi et al. 2013; Muijres et al. 2015; van Breugel and Dickinson 2012, 2014 (the ethogram)."].map((s) => `<li>${s}</li>`).join("");
}

// ---- the loop --------------------------------------------------------------------------------
let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dtWall = Math.min(0.05, (now - last) / 1000); last = now;
  const useBrain = S.pilot !== "instincts" && !!life.baseline;
  if (S.ready && !S.paused) {
    const simDt = dtWall * S.speed;
    let n = Math.round(simDt / DT), k = 0;
    while (k < n && k < 120) {
      if (life.step(DT)) life.decide(useBrain);
      k++;
    }
    S.simTime += k * DT;
    S.brainDue += k * DT * 1000;
    lastSenses = life.senses(handWorld, k * DT || dtWall);
    if (!S.pending && S.brainDue >= BRAIN_MS) {
      const steps = Math.min(STEPS_PER_MESSAGE, Math.floor(S.brainDue / BRAIN_MS));
      S.brainDue -= steps * BRAIN_MS; S.pending = true;
      worker.postMessage({ type: "run", stimuli: lastSenses, steps });
    }
    if (S.brainDue > 10 * BRAIN_MS) S.brainDue = 10 * BRAIN_MS; // a slow worker never builds a backlog
  }
  fly.update(flight, life.controls, dtWall, room.surfaceZ, rig.mode === "room");
  rig.update(flight, dtWall);
  placeHand(dtWall);
  composer.render();
  if (scan) {
    if (S.newState && now - S.lastScan > 33) { scan.step(activation, { draw: false }); S.newState = false; S.lastScan = now; }
    scan.draw(now);
  }
  S.frames++; S.fpsClock += dtWall;
  if (S.fpsClock >= 1) { S.fps = S.frames / S.fpsClock; S.frames = 0; S.fpsClock = 0; window.__fps = S.fps; }
  if ((S.frames & 3) === 0) hud();
  window.__frames = (window.__frames || 0) + 1;
}
requestAnimationFrame(frame);
window.__app = { S, life: () => life, flight: () => flight, scan: () => scan, setCam, setPilot };
