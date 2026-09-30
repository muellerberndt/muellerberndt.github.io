'use strict';
(() => {
  const toggle = document.querySelector('.menu-toggle');
  const nav = document.querySelector('#site-nav');
  const mobileNav = matchMedia('(max-width: 940px)');
  const setMenu = open => {
    nav?.classList.toggle('is-open', open);
    toggle?.setAttribute('aria-expanded', String(open));
    const icon = toggle?.querySelector('span');
    if (icon) icon.textContent = open ? '−' : '+';
  };
  const closeMenu = () => setMenu(false);
  toggle?.addEventListener('click', () => {
    setMenu(toggle.getAttribute('aria-expanded') !== 'true');
  });
  nav?.addEventListener('click', event => { if (event.target.closest('a')) closeMenu(); });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && toggle?.getAttribute('aria-expanded') === 'true') {
      closeMenu();
      toggle.focus();
    }
  });
  document.addEventListener('pointerdown', event => {
    if (!event.target.closest('.site-header')) closeMenu();
  });
  document.addEventListener('focusin', event => {
    if (!event.target.closest('.site-header')) closeMenu();
  });
  mobileNav.addEventListener('change', closeMenu);
  document.querySelectorAll('[data-print]').forEach(button => button.addEventListener('click', () => window.print()));
  document.querySelectorAll('[data-demo-fullscreen]').forEach(button => {
    const player = document.getElementById(button.dataset.demoFullscreen);
    if (!player?.requestFullscreen || !document.fullscreenEnabled) return;
    button.hidden = false;
    button.addEventListener('click', () => {
      player.requestFullscreen().catch(() => { button.hidden = true; });
    });
  });
  const film = document.querySelector('#film');
  document.querySelectorAll('button[data-t]').forEach(button => button.addEventListener('click', () => {
    if (!film) return;
    film.currentTime = Number(button.dataset.t);
    film.play().catch(() => {});
    film.scrollIntoView({block: 'center', behavior: 'smooth'});
  }));
  const canvas = document.querySelector('#settling-network');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let paused = reduced.matches, visible = true, frame = 0, last = 0, phase = 0, pulse = 0;
  let w = 400, h = 420;
  const pause = document.querySelector('[data-network-pause]');
  const perturb = document.querySelector('[data-network-perturb]');
  const state = document.querySelector('#network-state');
  const nodes = [];
  for (let group = 0; group < 7; group++) {
    const angle = group / 6 * Math.PI * 2;
    const cx = group === 6 ? .5 : .5 + .31 * Math.cos(angle);
    const cy = group === 6 ? .5 : .5 + .31 * Math.sin(angle);
    nodes.push({x:cx, y:cy, group, hub:true, seed:group * 1.7});
    for (let n = 0; n < 7; n++) {
      const a = n / 7 * Math.PI * 2;
      nodes.push({x:cx+.08*Math.cos(a), y:cy+.08*Math.sin(a), group, hub:false, seed:n+group*1.7});
    }
  }
  const draw = () => {
    ctx.clearRect(0, 0, w, h);
    const points = nodes.map(n => ({...n, px:n.x*w+Math.sin(phase+n.seed)*pulse*9, py:n.y*h+Math.cos(phase*.7+n.seed)*pulse*9}));
    for (let a = 0; a < points.length; a++) {
      for (let b = a+1; b < points.length; b++) {
        const p = points[a], q = points[b];
        if ((p.group === q.group && (p.hub || b === a+1)) || (p.hub && q.hub)) {
          ctx.strokeStyle = p.group === q.group ? 'rgba(220,246,100,.28)' : 'rgba(243,241,233,.17)';
          ctx.lineWidth = .8;
          ctx.beginPath();ctx.moveTo(p.px,p.py);ctx.lineTo(q.px,q.py);ctx.stroke();
        }
      }
    }
    points.forEach(p => {
      ctx.beginPath();ctx.arc(p.px,p.py,p.hub?5:2,0,Math.PI*2);
      ctx.fillStyle=p.hub?'#dcf664':'#c7d0bc';ctx.fill();
      if (p.hub) {ctx.beginPath();ctx.arc(p.px,p.py,12+Math.sin(phase+p.seed)*2,0,Math.PI*2);ctx.strokeStyle='rgba(220,246,100,.2)';ctx.stroke();}
    });
  };
  const tick = time => {
    frame = 0;
    if (paused || !visible || document.hidden) return;
    if (time-last > 32) {phase += .025;pulse *= .987;draw();last=time;}
    frame=requestAnimationFrame(tick);
  };
  const start = () => {if (!frame && !paused && visible && !document.hidden) frame=requestAnimationFrame(tick);};
  const syncPause = () => {if(pause){pause.textContent=paused?'Animate':'Pause';pause.setAttribute('aria-pressed',String(paused));} if(paused){cancelAnimationFrame(frame);frame=0;draw();}else start();};
  const resize = () => {const rect=canvas.getBoundingClientRect();w=rect.width;h=rect.height;const scale=Math.min(devicePixelRatio||1,2);canvas.width=Math.round(w*scale);canvas.height=Math.round(h*scale);ctx.setTransform(scale,0,0,scale,0,0);draw();};
  new ResizeObserver(resize).observe(canvas);
  new IntersectionObserver(entries => {visible=entries[0].isIntersecting;if(visible)start();else{cancelAnimationFrame(frame);frame=0;}}).observe(canvas);
  document.addEventListener('visibilitychange', () => {if(document.hidden){cancelAnimationFrame(frame);frame=0;}else start();});
  pause?.addEventListener('click', () => {paused=!paused;syncPause();});
  let settleTimer;
  perturb?.addEventListener('click', () => {pulse=1.8;if(state)state.textContent='Perturbed';draw();clearTimeout(settleTimer);settleTimer=setTimeout(()=>{if(state)state.textContent='Coupled models';},2500);start();});
  reduced.addEventListener('change', () => {paused=reduced.matches;syncPause();});
  resize();syncPause();
})();
