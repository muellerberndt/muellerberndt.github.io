/* Presentation adapter for the pinned demos. No model or simulation changes. */
(() => {
  'use strict';
  const demo = document.documentElement.dataset.demo;
  if (demo === 'amen') {
    const status = document.getElementById('status');
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    document.getElementById('err').setAttribute('role', 'alert');
    document.getElementById('play').setAttribute('aria-label', 'Play or pause the generated dub');
    return;
  }
  if (demo === 'atari-arcade') {
    // The site page sizes the frame to the whole arcade: report the content height whenever it changes.
    if (window.parent === window) return;
    const report = () => {
      const height = Math.ceil(document.body.getBoundingClientRect().height);
      if (height > 0) window.parent.postMessage({ type: 'demo-height', demo, height }, location.origin);
    };
    new ResizeObserver(report).observe(document.body);
    window.addEventListener('load', report);
    report();
    return;
  }
  if (demo !== 'patch-world' || typeof cam === 'undefined') return;

  const canvas = document.getElementById('gl');
  const world = document.getElementById('world');
  const views = document.querySelector('.views');
  const playback = document.getElementById('pause').parentElement;
  const viewHome = document.createComment('view controls home');
  const playbackHome = document.createComment('playback controls home');
  views.before(viewHome);
  playback.before(playbackHome);
  const console = document.createElement('div');
  console.className = 'demo-world-console';
  world.before(console);

  const cameraControls = document.createElement('div');
  cameraControls.className = 'demo-camera-controls';
  cameraControls.setAttribute('role', 'group');
  cameraControls.setAttribute('aria-label', 'Camera controls');
  const initial = { az: cam.az, pol: cam.pol, dist: cam.dist, target: cam.target.clone() };
  const zoom = factor => { cam.dist = Math.max(6, Math.min(240, cam.dist * factor)); };
  const stopFollowing = () => {
    cam.follow = false;
    document.getElementById('follow').setAttribute('aria-pressed', 'false');
  };
  for (const [label, action] of [
    ['Zoom in', () => zoom(0.8)],
    ['Zoom out', () => zoom(1.25)],
    ['Reset view', () => {
      cam.az = initial.az; cam.pol = initial.pol; cam.dist = initial.dist;
      cam.target.copy(initial.target); stopFollowing();
    }],
  ]) {
    const button = document.createElement('button');
    button.type = 'button'; button.className = 'act'; button.textContent = label;
    button.addEventListener('click', action); cameraControls.append(button);
  }
  console.append(cameraControls);
  const touchHint = document.createElement('p');
  touchHint.className = 'demo-touch-hint';
  touchHint.textContent = 'Drag to orbit. Pinch to zoom. Two fingers pan. Tap a creature to select it.';
  console.append(touchHint);
  const inspector = document.getElementById('brain').parentElement;
  inspector.id = 'demo-creature-inspector';
  const inspect = document.createElement('a');
  inspect.href = '#demo-creature-inspector';
  inspect.target = '_self';
  inspect.className = 'demo-inspector-link';
  inspect.textContent = 'Open the selected creature’s brain ↓';
  world.after(inspect);

  const narrow = matchMedia('(max-width: 820px)');
  function arrange() {
    if (narrow.matches) {
      console.prepend(views, playback);
    } else {
      viewHome.after(views); playbackHome.after(playback);
    }
    // Moving controls changes canvas geometry, never the underlying world.
    window.dispatchEvent(new Event('resize'));
  }
  narrow.addEventListener('change', arrange);
  arrange();

  // Capture touch pointers only. The archived mouse, wheel and keyboard
  // controls keep their original handlers. Scrolling outside the canvas stays native.
  const fingers = new Map();
  let moved = 0;
  let multiple = false;
  const point = e => ({ x: e.clientX, y: e.clientY });
  const center = points => ({ x: (points[0].x + points[1].x) / 2, y: (points[0].y + points[1].y) / 2 });
  const span = points => Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
  const capture = e => { e.preventDefault(); e.stopImmediatePropagation(); };
  canvas.addEventListener('pointerdown', e => {
    if (e.pointerType !== 'touch') return;
    capture(e);
    if (!fingers.size) { moved = 0; multiple = false; }
    fingers.set(e.pointerId, point(e));
    if (fingers.size > 1) multiple = true;
    canvas.setPointerCapture(e.pointerId);
  }, { capture: true, passive: false });
  canvas.addEventListener('pointermove', e => {
    if (e.pointerType !== 'touch' || !fingers.has(e.pointerId)) return;
    capture(e);
    const previous = fingers.get(e.pointerId);
    const before = [...fingers.values()];
    fingers.set(e.pointerId, point(e));
    const dx = e.clientX - previous.x, dy = e.clientY - previous.y;
    moved += Math.abs(dx) + Math.abs(dy);
    if (fingers.size > 1) {
      const after = [...fingers.values()];
      const oldCenter = center(before), nextCenter = center(after);
      const oldSpan = span(before), nextSpan = span(after);
      if (oldSpan > 4 && nextSpan > 4) zoom(oldSpan / nextSpan);
      const k = cam.dist * 0.0016;
      const right = new THREE.Vector3(Math.cos(cam.az), 0, -Math.sin(cam.az));
      const forward = new THREE.Vector3(-Math.sin(cam.az), 0, -Math.cos(cam.az));
      cam.target.addScaledVector(right, -(nextCenter.x - oldCenter.x) * k)
        .addScaledVector(forward, -(nextCenter.y - oldCenter.y) * k);
      stopFollowing();
    } else {
      cam.az -= dx * 0.006;
      cam.pol = Math.max(0.12, Math.min(1.5, cam.pol - dy * 0.006));
    }
  }, { capture: true, passive: false });
  function release(e) {
    if (e.pointerType !== 'touch' || !fingers.has(e.pointerId)) return;
    capture(e);
    if (e.type === 'pointerup' && !multiple && moved < 6) pick(e);
    fingers.delete(e.pointerId);
    if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
  }
  canvas.addEventListener('pointerup', release, { capture: true, passive: false });
  canvas.addEventListener('pointercancel', release, { capture: true, passive: false });
  canvas.addEventListener('lostpointercapture', e => { fingers.delete(e.pointerId); });
})();
