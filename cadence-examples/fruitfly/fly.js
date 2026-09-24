// The fly as meshes: head, thorax, abdomen, six legs, two wings, two halteres, about 3 mm long,
// in body coordinates (x forward, y left, z up, metres). The wings are drawn twice: the wing at
// its instantaneous stroke angle, and a translucent sweep whose angle follows the stroke
// amplitude and whose plane tilts with the stroke-plane control. Below the fly a soft shadow
// rests on the surface beneath it.
import * as THREE from "three";
import { HINGE_Y, HINGE_Z, TWO_PI } from "./body.js";
import { radialTexture } from "./room.js";

const MM = 1e-3;
const SWEEP_HOVER = 1.0472;     // rad, half the stroke angle at hover amplitude (60 degrees)
const SWEEP_MAX = 1.396;        // rad, 80 degrees
const WING_LENGTH = 2.3 * MM;
const FAN_SEGMENTS = 18;

const COLOURS = { thorax: 0x9a7444, head: 0x7a5530, abdomen: 0x6a4526, tip: 0x3d2614, eye: 0xc23a2e, leg: 0x4a3420, wing: 0xe4efff, sweep: 0xd6e6ff, haltere: 0xd9c8a6 };

function segment(a, b, r, mat) {
  const d = new THREE.Vector3().subVectors(b, a), len = d.length();
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 0.8, len, 5), mat);
  m.position.copy(a).addScaledVector(d, 0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
  return m;
}

function wingShape() {
  const s = new THREE.Shape();
  s.moveTo(0, 0);
  s.bezierCurveTo(0.55 * MM, 0.5 * MM, 0.5 * MM, 1.9 * MM, 0.05 * MM, 2.25 * MM);
  s.bezierCurveTo(-0.3 * MM, 2.1 * MM, -0.42 * MM, 1.0 * MM, 0, 0);
  return new THREE.ShapeGeometry(s, 10);
}

function fanGeometry() {
  const g = new THREE.BufferGeometry();
  const pos = new Float32Array(3 * (FAN_SEGMENTS + 2));
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  const idx = [];
  for (let k = 0; k < FAN_SEGMENTS; k++) idx.push(0, k + 1, k + 2);
  g.setIndex(idx);
  return g;
}

function buildWing(side) {
  const pivot = new THREE.Group();
  pivot.position.set(0, side * HINGE_Y, HINGE_Z);
  const tilt = new THREE.Group();
  pivot.add(tilt);
  const fan = new THREE.Mesh(fanGeometry(), new THREE.MeshBasicMaterial({ color: COLOURS.sweep, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false }));
  tilt.add(fan);
  const blade = new THREE.Mesh(wingShape(), new THREE.MeshPhysicalMaterial({ color: COLOURS.wing, transparent: true, opacity: 0.42, roughness: 0.15, metalness: 0.0, side: THREE.DoubleSide, depthWrite: false, sheen: 0.6, sheenColor: new THREE.Color(0xbfd8ff) }));
  if (side < 0) blade.scale.y = -1;
  tilt.add(blade);
  return { pivot, tilt, fan, blade, side };
}

export function createFly() {
  const group = new THREE.Group();
  const std = (color, roughness = 0.55) => new THREE.MeshStandardMaterial({ color, roughness });

  const thorax = new THREE.Mesh(new THREE.SphereGeometry(0.46 * MM, 20, 14), std(COLOURS.thorax));
  thorax.scale.set(1.0, 0.85, 0.8); thorax.position.set(0.15 * MM, 0, 0); group.add(thorax);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.3 * MM, 18, 12), std(COLOURS.head));
  head.position.set(0.9 * MM, 0, 0.05 * MM); group.add(head);
  for (const s of [1, -1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.17 * MM, 16, 12), std(COLOURS.eye, 0.3));
    eye.position.set(1.0 * MM, s * 0.22 * MM, 0.08 * MM); group.add(eye);
  }
  const abdomen = new THREE.Mesh(new THREE.SphereGeometry(0.5 * MM, 20, 14), std(COLOURS.abdomen));
  abdomen.scale.set(1.5, 0.75, 0.65); abdomen.position.set(-0.95 * MM, 0, -0.05 * MM); group.add(abdomen);
  const tip = new THREE.Mesh(new THREE.SphereGeometry(0.27 * MM, 14, 10), std(COLOURS.tip));
  tip.scale.set(1.3, 0.8, 0.7); tip.position.set(-1.55 * MM, 0, -0.1 * MM); group.add(tip);

  const legMat = std(COLOURS.leg, 0.7);
  for (const s of [1, -1]) for (const [xa, dx] of [[0.4, 0.35], [0.0, 0.0], [-0.4, -0.35]]) {
    const a = new THREE.Vector3(xa * MM, s * 0.3 * MM, -0.25 * MM);
    const knee = new THREE.Vector3((xa + dx) * MM, s * 0.78 * MM, -0.02 * MM);
    const foot = new THREE.Vector3((xa + 2 * dx) * MM, s * 1.05 * MM, -0.85 * MM);
    group.add(segment(a, knee, 0.03 * MM, legMat)); group.add(segment(knee, foot, 0.022 * MM, legMat));
  }
  const halMat = std(COLOURS.haltere, 0.6);
  for (const s of [1, -1]) {
    const a = new THREE.Vector3(-0.5 * MM, s * 0.4 * MM, 0.1 * MM), b = new THREE.Vector3(-0.75 * MM, s * 0.72 * MM, 0.16 * MM);
    group.add(segment(a, b, 0.018 * MM, halMat));
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.06 * MM, 8, 6), halMat); knob.position.copy(b); group.add(knob);
  }

  const wings = [buildWing(1), buildWing(-1)];
  for (const w of wings) group.add(w.pivot);

  // the shadow on the surface beneath, and a locator for the room view
  const shadow = new THREE.Mesh(new THREE.CircleGeometry(1, 28), new THREE.MeshBasicMaterial({ map: radialTexture("rgba(0,0,0,.7)", "rgba(0,0,0,0)"), transparent: true, depthWrite: false }));
  const locator = new THREE.Sprite(new THREE.SpriteMaterial({ map: radialTexture("rgba(255,214,150,.85)", "rgba(255,214,150,0)"), transparent: true, depthWrite: false, depthTest: false, sizeAttenuation: false, opacity: 0.7 }));
  locator.scale.set(0.022, 0.022 * 1.6, 1); locator.visible = false;

  const fan = new Float32Array(3 * (FAN_SEGMENTS + 2));

  function update(flight, c, dt, surfaceZ, showLocator) {
    const [x, y, z] = flight.p, q = flight.q;
    group.position.set(x, y, z);
    group.quaternion.set(q[1], q[2], q[3], q[0]);
    const phase = flight.phase, flicker = 0.5 + 0.5 * Math.sin(2.0 * phase);
    for (const w of wings) {
      const a = w.side > 0 ? c.aL : c.aR, beta = w.side > 0 ? c.betaL : c.betaR, s = w.side > 0 ? c.sL : c.sR;
      const sweep = Math.min(SWEEP_MAX, SWEEP_HOVER * a);
      w.pivot.position.x = s;
      w.tilt.rotation.y = beta;
      const mid = w.side * Math.PI / 2;
      // the sweep fan, its angle following the amplitude
      fan[0] = 0; fan[1] = 0; fan[2] = 0;
      for (let k = 0; k <= FAN_SEGMENTS; k++) {
        const th = mid - w.side * sweep * (2 * k / FAN_SEGMENTS - 1);
        fan[3 * (k + 1)] = WING_LENGTH * Math.cos(th); fan[3 * (k + 1) + 1] = WING_LENGTH * Math.sin(th); fan[3 * (k + 1) + 2] = 0;
      }
      w.fan.geometry.attributes.position.array.set(fan);
      w.fan.geometry.attributes.position.needsUpdate = true;
      w.fan.material.opacity = a > 0.02 ? 0.1 + 0.1 * Math.min(1, a) + 0.05 * flicker : 0;
      // the wing itself at its instantaneous stroke angle
      w.blade.rotation.z = mid - w.side * sweep * Math.sin(phase) - Math.PI / 2 * w.side;
      w.blade.material.opacity = 0.34 + 0.14 * flicker;
    }
    const zs = surfaceZ(x, y), h = Math.max(0, z - zs);
    shadow.position.set(x, y, zs + 0.0004);
    const r = 0.0022 + 0.004 * h;
    shadow.scale.set(r, r, 1);
    shadow.material.opacity = 0.55 / (1 + 5 * h);
    locator.position.set(x, y, z);
    locator.visible = showLocator;
  }

  return { group, shadow, locator, wings, update };
}
