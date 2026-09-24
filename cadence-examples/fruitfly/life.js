// The fly's life in the room: modes, drives, what the room does to the senses, and what the
// brain's descending neurons do to the body. The wingbeat-timescale equilibrium reflex is the
// body's own (the HandPilot's inner loop, as the worm's undulation is the worm's); everything
// here happens at the timescale of a rate model: decisions every DECISION_S of simulated time.
//
// Two layers act on the course. The instinct layer is hand-written and declared (bouts of
// flight with saccades, landing, sitting, grooming, wall avoidance): it is the control condition
// of the demo and the fallback when the brain is quiet. The brain layer reads the settled
// descending neurons (deviations from their level-flight rest) and overrides the course: DNa02
// left and right turn, DNp09 drives forward flight, DNp07 and DNp10 land, the giant fibre
// escapes, MN9 feeds, aDN1 and aDN2 groom. Only the brain layer changes between "brain",
// "shuffled" and "instincts" on the page's switch.
import { HandPilot, hoverTrim, wrap_ } from "./body.js";
import { haltereTone, ocelliLR, opticFlowDrive, antennaDrive } from "./senses.js";

export const DECISION_S = 0.1;          // s of simulated time between decisions
export const CRUISE = 0.3;              // m/s
export const ALTITUDE = 1.2;            // m, the preferred height away from surfaces
export const SACCADE_RATE = 0.4;        // per s, the spontaneous baseline (Censi 2013)
export const SACCADE_ANGLE = 93 * Math.PI / 180;  // rad (Muijres 2015)
export const BOUT_MEAN_S = 15;          // s, mean flight bout before a landing is sought (compressed from 30 to 90 s, Houot 2017)
export const SIT_MEAN_S = 6;            // s, mean sit before a voluntary takeoff (compressed)
export const GROOM_S = 2.5;             // s, a grooming episode (Mueller 2019: bouts of 0.15 to 2 s in longer events)
export const FEED_S = 4;                // s, a feeding burst on the fruit
export const WALL_MARGIN = 0.35;        // m, the fly turns away from a wall inside this band
export const ODOUR_SIGMA = 0.5;         // m, the odour field's width
export const ODOUR_BASELINE = 0.05;     // m, the bilateral sampling baseline (declared, stands in for casting)
export const ODOUR_COMPARISON = 1.5;    // drive per unit of log concentration ratio between the antennae
export const HUNGER_RATE = 1 / 120;     // per s, hunger rises from fed to starved in two minutes (compressed)
export const HAND_RADIUS = 0.025;       // m, the hand as a disc for looming
export const LOOM_SATURATION = 4.0;     // rad/s of angular expansion at full looming drive
export const K_TURN = 6.0;              // rad/s of turn per unit of DNa02 asymmetry
export const K_SPEED = 0.6;             // fraction of cruise per unit of DNp09 deviation
export const LAND_LEVEL = 0.15;         // DNp07/DNp10 deviation that asks for a landing
export const ESCAPE_LEVEL = 0.5;        // giant fibre activation that fires an escape
export const FEED_LEVEL = 0.2;          // MN9 activation that feeds when on sugar
export const GROOM_LEVEL = 0.15;        // aDN deviation that grooms when sitting

export function mulberry(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const expo = (rng, mean) => -mean * Math.log(1 - rng());

export class Life {
  constructor(flight, room, seed = 1) {
    this.flight = flight; this.room = room; this.rng = mulberry(seed);
    this.mode = "flying";                 // flying | landed | grooming | feeding
    this.pilot = new HandPilot(flight.p.slice(), flight.euler()[2], CRUISE);
    this.heading = flight.euler()[2]; this.speed = CRUISE; this.altitude = ALTITUDE;
    this.hunger = 0.6; this.fatigue = 0.0;
    this.bout = expo(this.rng, BOUT_MEAN_S); this.sit = 0; this.episode = 0;
    this.landing = null;                  // the point the fly descends to
    this.escape = 0;                      // s left of an escape manoeuvre
    this.since = 0;                       // s since the last decision
    this.clock = 0;
    this.events = [];                     // (t, text) for the page's log
    this.lastHand = null; this.loom = 0; this.handDist = Infinity;
    this.controls = hoverTrim();
    this.wingsOff = false;
    this.readouts = {}; this.baseline = null; this.source = "instincts";
    this.fruit = [room.table.x0 + (room.table.x1 - room.table.x0) / 2, room.table.y0 + (room.table.y1 - room.table.y0) / 2, room.table.z + 0.06];
    this.apple = [this.fruit[0] + 0.05, this.fruit[1] - 0.05, room.table.z + 0.06];
  }

  log(text) { this.events.push([this.clock, text]); if (this.events.length > 40) this.events.shift(); }

  // ---- the senses: what the room does to the afferents ----------------------------------
  odour(source, sigma = ODOUR_SIGMA) {
    const [x, y, z] = this.flight.p, R = this.flight.rotation();
    const nl = [R[1], R[4], R[7]]; // the body's y axis (left) in the world
    const at = (px, py, pz) => Math.exp(-((px - source[0]) ** 2 + (py - source[1]) ** 2 + (pz - source[2]) ** 2) / (2 * sigma * sigma));
    const c = at(x, y, z), cl = at(x + ODOUR_BASELINE * nl[0], y + ODOUR_BASELINE * nl[1], z + ODOUR_BASELINE * nl[2]), cr = at(x - ODOUR_BASELINE * nl[0], y - ODOUR_BASELINE * nl[1], z - ODOUR_BASELINE * nl[2]);
    const ratio = Math.log(cl + 1e-9) - Math.log(cr + 1e-9);
    const gain = 0.5 + this.hunger;      // hunger raises the olfactory drive (Root 2011: sNPF gates ORN sensitivity)
    return { left: Math.min(1, gain * (ODOUR_COMPARISON * Math.max(0, ratio) + c)), right: Math.min(1, gain * (ODOUR_COMPARISON * Math.max(0, -ratio) + c)), c };
  }

  senses(handPos, dt) {
    const f = this.flight, flying = this.mode === "flying";
    const [hl, hr] = haltereTone(flying);
    const [ol, or_] = ocelliLR(f.rotation());
    const flow = [f.w[2], f.w[0], f.w[1]];
    // looming: the rate of angular expansion of the hand as seen from the fly
    let loom = 0;
    if (handPos) {
      const d = Math.hypot(handPos[0] - f.p[0], handPos[1] - f.p[1], handPos[2] - f.p[2]);
      const theta = 2 * Math.atan(HAND_RADIUS / Math.max(d, 0.005));
      if (this.lastHand !== null && dt > 0) loom = Math.max(0, (theta - this.lastHand) / dt) / LOOM_SATURATION;
      this.lastHand = theta; this.handDist = d;
    } else { this.lastHand = null; this.loom = 0; this.handDist = Infinity; }
    this.loom = Math.min(1, 0.7 * this.loom + loom);  // a short memory so a swat is seen across brain steps
    const fruit = this.odour(this.fruit), apple = this.odour(this.apple, 0.35);
    const onFruit = !flying && Math.hypot(f.p[0] - this.fruit[0], f.p[1] - this.fruit[1]) < 0.09 && Math.abs(f.p[2] - this.room.table.z) < 0.02;
    const s = {
      "haltere:left": hl, "haltere:right": hr, "ocelli:left": ol, "ocelli:right": or_,
      "lptc:hs:left": opticFlowDrive(flow[0], flow[1], flow[2], "left"), "lptc:vs:left": opticFlowDrive(flow[0], flow[1], flow[2], "left"),
      "lptc:hs:right": opticFlowDrive(flow[0], flow[1], flow[2], "right"), "lptc:vs:right": opticFlowDrive(flow[0], flow[1], flow[2], "right"),
      "jo:C:left": antennaDrive(f.speed()), "jo:C:right": antennaDrive(f.speed()), "jo:E:left": antennaDrive(f.speed()), "jo:E:right": antennaDrive(f.speed()),
      "vis:LC4": this.loom, "vis:LPLC2": this.loom,
      "orn:decaying_fruit:left": fruit.left, "orn:decaying_fruit:right": fruit.right,
      "orn:fruity:left": apple.left, "orn:fruity:right": apple.right,
      "grn:sugar:labellum": onFruit ? 1 : 0, "grn:sugar:front_leg": onFruit ? 1 : 0,
      "leg_touch": flying ? 0 : 0.6,
    };
    this.onFruit = onFruit; this.fruitC = fruit.c;
    return s;
  }

  // ---- the brain's readouts, as deviations from their level-flight rest ---------------------
  setBaseline(readouts) { this.baseline = { ...readouts }; }
  dev(name) { const r = this.readouts[name]; if (r === undefined) return 0; return r - (this.baseline ? (this.baseline[name] || 0) : 0); }

  // ---- decisions ----------------------------------------------------------------------------
  decide(useBrain) {
    const f = this.flight, rng = this.rng, [x, y, z] = f.p, W = 4.0, D = 3.0, H = 2.6;
    if (this.mode === "flying") {
      if (this.escape > 0) return;
      // the instinct layer: saccades, wall avoidance, altitude, the end of a bout
      let turn = 0, speed = CRUISE, land = false;
      if (rng() < SACCADE_RATE * DECISION_S) { turn = (rng() < 0.5 ? 1 : -1) * SACCADE_ANGLE * (0.8 + 0.4 * rng()); this.log("saccade"); }
      const hx = Math.cos(this.heading), hy = Math.sin(this.heading);
      const ahead = [x + 0.5 * hx, y + 0.5 * hy];
      if (ahead[0] < WALL_MARGIN || ahead[0] > W - WALL_MARGIN || ahead[1] < WALL_MARGIN || ahead[1] > D - WALL_MARGIN) {
        const toCentre = Math.atan2(D / 2 - y, W / 2 - x);
        turn = wrap_(toCentre - this.heading) * 0.6;
      }
      this.altitude = Math.min(H - 0.4, Math.max(0.3, this.altitude + (rng() - 0.5) * 0.1));
      this.bout -= DECISION_S;
      if (this.bout <= 0) land = true;
      // the brain layer overrides
      if (useBrain && this.baseline) {
        const asym = this.dev("dn:DNa02:right") - this.dev("dn:DNa02:left");
        if (Math.abs(asym) > 0.02) turn += K_TURN * asym * DECISION_S;
        const fwd = this.dev("dn:DNp09") || this.dev("dn:DNp09:left");
        speed = CRUISE * Math.min(1.5, Math.max(0.3, 1 + K_SPEED * fwd));
        if (this.dev("dn:landing") > LAND_LEVEL) land = true;
        if ((this.readouts["gf"] || 0) > ESCAPE_LEVEL) this.startEscape("the giant fibre fired");
      }
      this.heading = wrap_(this.heading + turn); this.speed = speed;
      if (land) this.chooseLanding();
    } else if (this.mode === "landed") {
      this.sit -= DECISION_S;
      if (useBrain && this.baseline) {
        if ((this.readouts["gf"] || 0) > ESCAPE_LEVEL) { this.takeoff("escape takeoff"); return; }
        if (this.onFruit && (this.readouts["mn9"] || 0) > FEED_LEVEL && this.hunger > 0.15) { this.startFeeding(); return; }
        if (this.dev("dn:grooming") > GROOM_LEVEL) { this.startGrooming(); return; }
      }
      if (this.onFruit && this.hunger > 0.3 && rng() < 0.5) { this.startFeeding(); return; }
      if (this.sit <= 0) { if (rng() < 0.35) this.startGrooming(); else this.takeoff("voluntary takeoff"); }
    } else if (this.mode === "grooming" || this.mode === "feeding") {
      this.episode -= DECISION_S;
      if (useBrain && (this.readouts["gf"] || 0) > ESCAPE_LEVEL) { this.takeoff("escape takeoff"); return; }
      if (this.episode <= 0) { this.mode = "landed"; this.sit = expo(rng, SIT_MEAN_S) * 0.5; this.log("sits"); }
    }
  }

  chooseLanding() {
    const f = this.flight, t = this.room.table, [x, y] = f.p;
    const nearTable = x > t.x0 - 0.4 && x < t.x1 + 0.4 && y > t.y0 - 0.4 && y < t.y1 + 0.4;
    const drawn = this.fruitC > 0.15 && this.hunger > 0.3;
    if (nearTable || drawn) this.landing = [Math.min(t.x1 - 0.05, Math.max(t.x0 + 0.05, drawn ? this.fruit[0] + (this.rng() - 0.5) * 0.06 : x)), Math.min(t.y1 - 0.05, Math.max(t.y0 + 0.05, drawn ? this.fruit[1] + (this.rng() - 0.5) * 0.06 : y)), t.z];
    else this.landing = [x, y, 0.0];
    this.log(drawn ? "descends to the fruit" : "descends to land");
  }

  startEscape(why) { this.escape = 0.25; this.heading = wrap_(this.heading + (this.rng() < 0.5 ? 1 : -1) * Math.PI / 2); this.speed = 1.0; this.altitude = Math.min(2.2, this.altitude + 0.4); this.landing = null; this.log("escape: " + why); }
  startFeeding() { this.mode = "feeding"; this.episode = FEED_S; this.log("feeds on the fruit"); }
  startGrooming() { this.mode = "grooming"; this.episode = GROOM_S; this.log("grooms"); }
  takeoff(why) { this.mode = "flying"; this.wingsOff = false; this.landing = null; this.bout = expo(this.rng, BOUT_MEAN_S); this.altitude = Math.max(0.6, this.flight.p[2] + 0.4); this.speed = CRUISE; this.heading = this.flight.euler()[2]; this.flight.v[2] += 0.28; this.log(why); }

  // ---- every physics step: the course into the pilot, the pilot into the wings ---------------
  step(dt) {
    const f = this.flight; this.clock += dt; this.since += dt;
    this.hunger = Math.min(1, this.hunger + (this.mode === "feeding" ? -0.12 : HUNGER_RATE) * dt);
    if (this.mode === "flying") {
      this.fatigue = Math.min(1, this.fatigue + dt / 60);
      if (this.escape > 0) this.escape -= dt;
      const p = this.pilot;
      if (this.landing) {
        const L = this.landing, dxy = Math.hypot(L[0] - f.p[0], L[1] - f.p[1]);
        p.target = [L[0], L[1], dxy > 0.15 ? Math.max(L[2] + 0.12, f.p[2] - 0.05) : L[2] + 0.004];
        p.heading = dxy > 0.05 ? Math.atan2(L[1] - f.p[1], L[0] - f.p[0]) : p.heading; p.speed = Math.max(0.05, Math.min(CRUISE, dxy));
        if (f.p[2] - L[2] < 0.006 && f.speed() < 0.08) { this.wingsOff = true; }
        if (f.landed || (this.wingsOff && f.touching > 0 && f.speed() < 0.02)) { this.mode = "landed"; this.landing = null; this.sit = expo(this.rng, SIT_MEAN_S); this.fatigue = 0; this.log(this.onFruit ? "lands on the fruit" : "lands"); }
      } else {
        const look = 0.25;
        p.target = [f.p[0] + look * Math.cos(this.heading), f.p[1] + look * Math.sin(this.heading), this.altitude];
        p.heading = this.heading; p.speed = this.speed;
      }
      this.controls = this.wingsOff ? { aL: 0, aR: 0, betaL: 0, betaR: 0, sL: 0, sR: 0, f: 0 } : p.controls(f);
    } else {
      this.fatigue = Math.max(0, this.fatigue - dt / 20);
      this.controls = { aL: 0, aR: 0, betaL: 0, betaR: 0, sL: 0, sR: 0, f: 0 };
      f.v[0] *= 0.5; f.v[1] *= 0.5; // the legs hold the body still on the surface
    }
    f.step(dt, this.controls);
    if (this.since >= DECISION_S) { this.since -= DECISION_S; return true; }
    return false;
  }
}
