// The room, its light, the hand at the cursor and the cameras. three.js, metres.
//
// Physics coordinates are x along the long wall, y along the short wall, z up. Everything in the
// room lives inside `world`, a group rotated so those coordinates apply unchanged; the camera and
// the hand live in three.js coordinates, converted with toThree().
import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { ROOM } from "./body.js";

export const toThree = (x, y, z) => new THREE.Vector3(x, z, -y);
export const fromThree = (v) => [v.x, -v.z, v.y];

export const PALETTE = {
  wallNavy: 0x27375a, ceiling: 0x31426a, skirting: 0x18233b, plaster: 0x2b3c60,
  wood: ["#a97c50", "#b98a5a", "#9c7048", "#c2956a", "#8e6640"], walnut: 0x3f2c1e,
  frame: 0xe6dfd2, sill: 0xd9d0c0, ceramic: 0xefe6d6, banana: 0xe6c53c, apple: 0xc0352b, stem: 0x5a4a2a,
  leaf: 0x4b7a58, leafLight: 0x86b57a, pot: 0x3b4d70, soil: 0x2a1f16, lampShade: 0x1f2d4c, lampInner: 0xffd7a3,
  bulb: 0xfff0d0, sky: ["#cfe2f6", "#e9eef4", "#f3eee6"], hedge: "#8aa07a", hand: 0xd7b28f,
};

// -- textures ---------------------------------------------------------------------------------

function canvasTexture(w, h, draw) {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  draw(c.getContext("2d"), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function hash(n) { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); }

// One metre of floor: eight planks along x, staggered ends, grain lines.
function woodTexture() {
  return canvasTexture(1024, 1024, (g, w, h) => {
    const planks = 8, ph = h / planks;
    for (let i = 0; i < planks; i++) {
      const y = i * ph, off = hash(i) * w;
      const segs = [0, off % w, w];
      segs.sort((a, b) => a - b);
      for (let s = 0; s < segs.length - 1; s++) {
        const x0 = segs[s], x1 = segs[s + 1];
        if (x1 - x0 < 2) continue;
        g.fillStyle = PALETTE.wood[Math.floor(hash(i * 7 + s * 3) * PALETTE.wood.length)];
        g.fillRect(x0, y, x1 - x0, ph);
        g.strokeStyle = "rgba(40,22,10,.55)"; g.lineWidth = 2;
        g.strokeRect(x0 + 1, y + 1, x1 - x0 - 2, ph - 2);
        for (let k = 0; k < 14; k++) {          // grain
          const gy = y + 4 + hash(i * 31 + s * 17 + k) * (ph - 8);
          g.strokeStyle = `rgba(60,35,15,${0.08 + 0.12 * hash(k + i)})`; g.lineWidth = 1 + hash(k * 3 + i);
          g.beginPath(); g.moveTo(x0, gy);
          for (let x = x0; x <= x1; x += 32) g.lineTo(x, gy + 3 * Math.sin(x / 90 + k));
          g.stroke();
        }
      }
    }
  });
}

function skyTexture() {
  return canvasTexture(512, 512, (g, w, h) => {
    const grad = g.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, PALETTE.sky[0]); grad.addColorStop(0.55, PALETTE.sky[1]); grad.addColorStop(0.8, PALETTE.sky[2]);
    g.fillStyle = grad; g.fillRect(0, 0, w, h);
    const sun = g.createRadialGradient(w * 0.28, h * 0.22, 0, w * 0.28, h * 0.22, w * 0.3);
    sun.addColorStop(0, "rgba(255,248,225,.9)"); sun.addColorStop(1, "rgba(255,248,225,0)");
    g.fillStyle = sun; g.fillRect(0, 0, w, h);
    g.fillStyle = PALETTE.hedge;                 // a hedge line at the bottom
    g.beginPath(); g.moveTo(0, h);
    for (let x = 0; x <= w; x += 16) g.lineTo(x, h * 0.84 + 10 * Math.sin(x / 23) + 6 * Math.sin(x / 7));
    g.lineTo(w, h); g.fill();
  });
}

export function radialTexture(inner, outer) {
  return canvasTexture(128, 128, (g, w, h) => {
    const r = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    r.addColorStop(0, inner); r.addColorStop(1, outer);
    g.fillStyle = r; g.fillRect(0, 0, w, h);
  });
}

// -- the room ---------------------------------------------------------------------------------

const box = (w, d, h, mat, x, y, z, cast = true) => {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, d, h), mat);
  m.position.set(x, y, z); m.castShadow = cast; m.receiveShadow = true;
  return m;
};

export function createRoom(world) {
  const [W, D, H] = ROOM;
  const room = { table: { x0: 2.45, x1: 3.55, y0: 1.95, y1: 2.65, z: 0.75 }, window: { x0: 1.3, x1: 2.7, z0: 0.9, z1: 2.1 } };
  const plaster = new THREE.MeshStandardMaterial({ color: PALETTE.plaster, roughness: 0.95 });
  const ceilingMat = new THREE.MeshStandardMaterial({ color: PALETTE.ceiling, roughness: 0.95 });
  const skirtMat = new THREE.MeshStandardMaterial({ color: PALETTE.skirting, roughness: 0.7 });

  const wood = woodTexture();
  wood.wrapS = wood.wrapT = THREE.RepeatWrapping; wood.repeat.set(W, D); wood.anisotropy = 8;
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, D), new THREE.MeshStandardMaterial({ map: wood, roughness: 0.55, metalness: 0.05 }));
  floor.position.set(W / 2, D / 2, 0); floor.receiveShadow = true; world.add(floor);
  world.add(box(W, D, 0.02, ceilingMat, W / 2, D / 2, H + 0.01, false));

  // walls: slabs, the window wall in four pieces around the opening
  const t = 0.02, wn = room.window;
  world.add(box(W, t, H, plaster, W / 2, -t / 2, H / 2, false));
  world.add(box(t, D, H, plaster, -t / 2, D / 2, H / 2, false));
  world.add(box(t, D, H, plaster, W + t / 2, D / 2, H / 2, false));
  world.add(box(wn.x0, t, H, plaster, wn.x0 / 2, D + t / 2, H / 2, false));
  world.add(box(W - wn.x1, t, H, plaster, (W + wn.x1) / 2, D + t / 2, H / 2, false));
  world.add(box(wn.x1 - wn.x0, t, wn.z0, plaster, (wn.x0 + wn.x1) / 2, D + t / 2, wn.z0 / 2, false));
  world.add(box(wn.x1 - wn.x0, t, H - wn.z1, plaster, (wn.x0 + wn.x1) / 2, D + t / 2, (H + wn.z1) / 2, false));
  for (const [w, d, x, y] of [[W, 0.02, W / 2, 0.01], [W, 0.02, W / 2, D - 0.01], [0.02, D, 0.01, D / 2], [0.02, D, W - 0.01, D / 2]]) world.add(box(w, d, 0.09, skirtMat, x, y, 0.045, false));

  // the window: frame, mullions, sill, glass, and the sky beyond it
  const frameMat = new THREE.MeshStandardMaterial({ color: PALETTE.frame, roughness: 0.6 });
  const fw = 0.06, wx = (wn.x0 + wn.x1) / 2, wz = (wn.z0 + wn.z1) / 2, ww = wn.x1 - wn.x0, wh = wn.z1 - wn.z0;
  world.add(box(ww + 2 * fw, 0.08, fw, frameMat, wx, D, wn.z1 + fw / 2));
  world.add(box(ww + 2 * fw, 0.08, fw, frameMat, wx, D, wn.z0 - fw / 2));
  world.add(box(fw, 0.08, wh, frameMat, wn.x0 - fw / 2, D, wz));
  world.add(box(fw, 0.08, wh, frameMat, wn.x1 + fw / 2, D, wz));
  world.add(box(0.035, 0.05, wh, frameMat, wx, D, wz));
  world.add(box(ww, 0.05, 0.035, frameMat, wx, D, wz + 0.12));
  world.add(box(ww + 0.3, 0.16, 0.035, new THREE.MeshStandardMaterial({ color: PALETTE.sill, roughness: 0.6 }), wx, D - 0.05, wn.z0 - fw - 0.018));
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(ww, wh), new THREE.MeshPhysicalMaterial({ color: 0xdfeeff, transparent: true, opacity: 0.1, roughness: 0.05, metalness: 0, side: THREE.DoubleSide }));
  glass.rotation.x = Math.PI / 2; glass.position.set(wx, D, wz); world.add(glass);
  const sky = new THREE.Mesh(new THREE.PlaneGeometry(9, 6), new THREE.MeshBasicMaterial({ map: skyTexture() }));
  sky.rotation.x = Math.PI / 2; sky.position.set(wx, D + 0.9, 1.6); world.add(sky);

  // the table with the fruit bowl
  const tb = room.table, walnut = new THREE.MeshStandardMaterial({ color: PALETTE.walnut, roughness: 0.45, metalness: 0.05 });
  const tw = tb.x1 - tb.x0, td = tb.y1 - tb.y0, tx = (tb.x0 + tb.x1) / 2, ty = (tb.y0 + tb.y1) / 2;
  world.add(box(tw, td, 0.035, walnut, tx, ty, tb.z - 0.0175));
  for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.016, tb.z - 0.035, 12), walnut);
    leg.rotation.x = Math.PI / 2; leg.position.set(tx + sx * (tw / 2 - 0.07), ty + sy * (td / 2 - 0.07), (tb.z - 0.035) / 2);
    leg.castShadow = true; world.add(leg);
  }
  const bowlPts = []; for (let i = 0; i <= 12; i++) { const u = i / 12; bowlPts.push(new THREE.Vector2(0.03 + 0.14 * Math.sin(u * Math.PI / 2), 0.075 * (1 - Math.cos(u * Math.PI / 2)))); }
  const bowl = new THREE.Mesh(new THREE.LatheGeometry(bowlPts, 40), new THREE.MeshStandardMaterial({ color: PALETTE.ceramic, roughness: 0.35, side: THREE.DoubleSide }));
  bowl.rotation.x = Math.PI / 2; bowl.position.set(tx, ty, tb.z); bowl.castShadow = true; bowl.receiveShadow = true; world.add(bowl);
  const bananaPath = new THREE.QuadraticBezierCurve3(new THREE.Vector3(-0.09, -0.02, 0.05), new THREE.Vector3(0.0, 0.0, 0.11), new THREE.Vector3(0.09, 0.02, 0.05));
  const banana = new THREE.Mesh(new THREE.TubeGeometry(bananaPath, 24, 0.017, 10, false), new THREE.MeshStandardMaterial({ color: PALETTE.banana, roughness: 0.5 }));
  banana.position.set(tx, ty, tb.z); banana.rotation.z = 0.5; banana.castShadow = true; world.add(banana);
  const apple = new THREE.Mesh(new THREE.SphereGeometry(0.038, 24, 18), new THREE.MeshStandardMaterial({ color: PALETTE.apple, roughness: 0.3 }));
  apple.scale.set(1, 1, 0.92); apple.position.set(tx + 0.05, ty - 0.05, tb.z + 0.06); apple.castShadow = true; world.add(apple);
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.004, 0.025, 6), new THREE.MeshStandardMaterial({ color: PALETTE.stem }));
  stem.rotation.x = Math.PI / 2; stem.position.set(tx + 0.05, ty - 0.05, tb.z + 0.105); world.add(stem);

  // the plant in the far corner
  const plant = new THREE.Group(); plant.position.set(3.65, 2.65, 0);
  const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.11, 0.3, 24), new THREE.MeshStandardMaterial({ color: PALETTE.pot, roughness: 0.6 }));
  pot.rotation.x = Math.PI / 2; pot.position.z = 0.15; pot.castShadow = true; plant.add(pot);
  const soil = new THREE.Mesh(new THREE.CircleGeometry(0.145, 24), new THREE.MeshStandardMaterial({ color: PALETTE.soil, roughness: 1 }));
  soil.position.z = 0.295; plant.add(soil);
  const leafShape = new THREE.Shape();
  leafShape.moveTo(0, 0); leafShape.quadraticCurveTo(0.05, 0.35, 0.0, 0.9); leafShape.quadraticCurveTo(-0.05, 0.35, 0, 0);
  const leafGeo = new THREE.ShapeGeometry(leafShape, 12);
  for (let i = 0; i < 11; i++) {
    const leaf = new THREE.Mesh(leafGeo, new THREE.MeshStandardMaterial({ color: i % 3 ? PALETTE.leaf : PALETTE.leafLight, roughness: 0.7, side: THREE.DoubleSide }));
    const a = i / 11 * Math.PI * 2, lean = 0.25 + 0.35 * hash(i + 5);
    leaf.position.set(0.05 * Math.cos(a), 0.05 * Math.sin(a), 0.28);
    leaf.rotation.set(Math.PI / 2 - lean * Math.cos(a), lean * Math.sin(a), a + 0.3, "ZXY");
    leaf.scale.setScalar(0.75 + 0.5 * hash(i * 13));
    leaf.castShadow = true; plant.add(leaf);
  }
  world.add(plant);

  // the ceiling lamp: cord, shade, bulb and a warm point light
  const lamp = new THREE.Group(); lamp.position.set(W / 2, D / 2, H);
  const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.003, 0.4, 6), new THREE.MeshStandardMaterial({ color: 0x111111 }));
  cord.rotation.x = Math.PI / 2; cord.position.z = -0.2; lamp.add(cord);
  const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.2, 0.17, 32, 1, true), new THREE.MeshStandardMaterial({ color: PALETTE.lampShade, roughness: 0.5, side: THREE.DoubleSide }));
  shade.rotation.x = Math.PI / 2; shade.position.z = -0.47; lamp.add(shade);
  const inner = new THREE.Mesh(new THREE.CylinderGeometry(0.068, 0.198, 0.168, 32, 1, true), new THREE.MeshStandardMaterial({ color: PALETTE.lampInner, emissive: PALETTE.lampInner, emissiveIntensity: 0.6, side: THREE.BackSide }));
  inner.rotation.x = Math.PI / 2; inner.position.z = -0.47; lamp.add(inner);
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.03, 20, 14), new THREE.MeshStandardMaterial({ color: PALETTE.bulb, emissive: PALETTE.bulb, emissiveIntensity: 3.5 }));
  bulb.position.z = -0.5; lamp.add(bulb);
  const lampLight = new THREE.PointLight(0xffd6a0, 9, 0, 2); lampLight.position.z = -0.52; lamp.add(lampLight);
  world.add(lamp);
  room.lamp = { group: lamp, light: lampLight, position: [W / 2, D / 2, H - 0.5] };

  // daylight through the window, and the sky's fill
  const sun = new THREE.DirectionalLight(0xfff3df, 2.6);
  sun.position.set(1.2, D + 3.5, 4.0); sun.target.position.set(2.2, 1.0, 0.3);
  sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); sun.shadow.radius = 6; sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.01;
  Object.assign(sun.shadow.camera, { left: -3.2, right: 3.2, top: 3.2, bottom: -3.2, near: 0.5, far: 14 });
  world.add(sun); world.add(sun.target);
  world.add(new THREE.HemisphereLight(0xcfe0f5, 0x4a3a2a, 0.55));

  room.surfaceZ = (x, y) => (x >= tb.x0 && x <= tb.x1 && y >= tb.y0 && y <= tb.y1 ? tb.z : 0);
  return room;
}

// -- the hand at the cursor -------------------------------------------------------------------

export function createHand() {
  // an open palm about 7 cm tall, matte so that the daylight does not bloom on it
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0x9c7a5a, roughness: 1.0, metalness: 0 });
  const palm = new THREE.Mesh(new THREE.SphereGeometry(0.04, 24, 16), mat);
  palm.scale.set(1, 1.15, 0.28); g.add(palm);
  const finger = (len, x, y, rot, r = 0.0095) => {
    const f = new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 4, 10), mat);
    f.position.set(x, y, 0); f.rotation.z = rot; g.add(f);
  };
  finger(0.055, -0.03, 0.07, 0.18); finger(0.065, -0.01, 0.078, 0.05); finger(0.06, 0.012, 0.075, -0.06); finger(0.045, 0.031, 0.065, -0.2);
  finger(0.05, -0.058, 0.01, 0.95, 0.011);
  g.scale.setScalar(0.36);
  g.visible = false;
  return g;
}

// -- renderer and cameras ---------------------------------------------------------------------

export function createRenderer(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate = false; renderer.shadowMap.needsUpdate = true;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.0;
  return renderer;
}

export function createComposer(renderer, scene, camera) {
  const composer = new EffectComposer(renderer);
  const render = new RenderPass(scene, camera);
  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.22, 0.5, 1.0);
  composer.addPass(render); composer.addPass(bloom); composer.addPass(new OutputPass());
  return { composer, render, bloom };
}

// Three ways of looking: a chase camera behind and above the fly, the room from a corner, and
// the fly's own eyes.
export class CameraRig {
  constructor(aspect) {
    this.camera = new THREE.PerspectiveCamera(46, aspect, 0.0006, 20);
    this.mode = "follow";
    this.zoom = 0.03;                   // m, chase distance
    this.pos = new THREE.Vector3(); this.look = new THREE.Vector3();
    this.fwd = new THREE.Vector3(1, 0, 0);
    this.first = true;
  }

  setMode(mode) { this.mode = mode; this.first = true; }

  wheel(dy) { this.zoom = Math.min(0.5, Math.max(0.012, this.zoom * Math.exp(dy * 0.0015))); }

  update(flight, dt) {
    const cam = this.camera, [x, y, z] = flight.p, R = flight.rotation();
    if (this.mode === "room") {
      cam.fov = 60; cam.near = 0.01;
      cam.position.copy(toThree(0.32, 0.3, 2.35)); cam.up.set(0, 1, 0); cam.lookAt(toThree(2.4, 1.8, 0.85));
    } else if (this.mode === "eye") {
      cam.fov = 110; cam.near = 0.0004;
      const head = toThree(x + R[0] * 1.2e-3 + R[2] * 2e-4, y + R[3] * 1.2e-3 + R[5] * 2e-4, z + R[6] * 1.2e-3 + R[8] * 2e-4);
      cam.position.copy(head); cam.up.copy(toThree(R[2], R[5], R[8])); cam.lookAt(head.clone().add(toThree(R[0], R[3], R[6])));
    } else {
      cam.fov = 46; cam.near = 0.0006;
      const hx = R[0], hy = R[3], hn = Math.hypot(hx, hy) || 1;   // the heading, smoothed
      const k = this.first ? 1 : 1 - Math.exp(-dt / 0.25);
      this.fwd.lerp(new THREE.Vector3(hx / hn, hy / hn, 0), k).normalize();
      const d = this.zoom;
      const want = new THREE.Vector3(x - this.fwd.x * d, y - this.fwd.y * d, z + 0.42 * d);
      const kp = this.first ? 1 : 1 - Math.exp(-dt / 0.12), kl = this.first ? 1 : 1 - Math.exp(-dt / 0.05);
      this.pos.lerp(want, kp); this.look.lerp(new THREE.Vector3(x, y, z), kl);
      cam.position.copy(toThree(this.pos.x, this.pos.y, this.pos.z)); cam.up.set(0, 1, 0);
      cam.lookAt(toThree(this.look.x, this.look.y, this.look.z));
    }
    cam.updateProjectionMatrix();
    this.first = false;
  }
}
