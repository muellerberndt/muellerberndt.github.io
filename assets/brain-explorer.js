/* Educational interaction for brain-model.js. All displayed values come from
 * its fixed-weight equations; animation timing has no computational meaning. */
'use strict';
(() => {
  const root = document.querySelector('#brain-explorer');
  const model = globalThis.CadenceIllustration;
  if (!root || !model) return;
  const el = id => document.getElementById(id);
  const signal = el('brain-signal'), depthControl = el('brain-depth');
  const run = el('brain-run'), stepButton = el('brain-step'), reset = el('brain-reset');
  const status = el('brain-status');
  const recursive = el('brain-recursive'), forward = el('brain-forward'), trace = el('brain-energy-trace');
  if (![recursive, forward, trace].every(canvas => canvas.getContext('2d'))) return;
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const MAX_STEPS = 240;
  let input = Number(signal.value), depth = Number(depthControl.value);
  let topology = model.topology(depth), states = model.initialStates(depth);
  let result = model.evaluate(states, input, depth), reference = model.feedForward(input, depth);
  let selected = 0, count = 0, energies = [result.energy], timer = null, running = false;
  let lastPoints = [];
  const signed = n => `${n >= 0 ? '+' : '−'}${Math.abs(n).toFixed(3)}`;
  const concise = n => n === 0 ? '0' : n < .001 ? n.toExponential(1) : n.toFixed(4);
  const setStatus = message => { status.textContent = message; };
  const stop = () => {
    if (timer !== null) clearTimeout(timer);
    timer = null; running = false;
    run.textContent = 'Run settlement';
    run.setAttribute('aria-pressed', 'false');
  };
  function prepare(canvas) {
    const box = canvas.getBoundingClientRect();
    const w = Math.max(1, box.width), h = Math.max(1, box.height);
    const ratio = Math.min(globalThis.devicePixelRatio || 1, 2);
    if (canvas.width !== Math.round(w * ratio) || canvas.height !== Math.round(h * ratio)) {
      canvas.width = Math.round(w * ratio); canvas.height = Math.round(h * ratio);
    }
    const ctx = canvas.getContext('2d');
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, w, h);
    return {ctx, w, h};
  }
  function arrow(ctx, start, end, color, dashed = false, bend = 0) {
    const angle = Math.atan2(end.y-start.y, end.x-start.x);
    const from = {x:start.x+Math.cos(angle)*24, y:start.y+Math.sin(angle)*24};
    const to = {x:end.x-Math.cos(angle)*24, y:end.y-Math.sin(angle)*24};
    ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = 1.15;
    ctx.setLineDash(dashed ? [4, 5] : []);
    ctx.beginPath(); ctx.moveTo(from.x, from.y);
    const mid = {x:(from.x+to.x)/2, y:(from.y+to.y)/2+bend};
    if (bend) ctx.quadraticCurveTo(mid.x,mid.y,to.x,to.y); else ctx.lineTo(to.x,to.y);
    ctx.stroke(); ctx.setLineDash([]);
    const a = bend ? Math.atan2(to.y-mid.y,to.x-mid.x) : angle;
    ctx.beginPath();ctx.moveTo(to.x,to.y);
    ctx.lineTo(to.x-Math.cos(a-.45)*7,to.y-Math.sin(a-.45)*7);
    ctx.lineTo(to.x-Math.cos(a+.45)*7,to.y-Math.sin(a+.45)*7);
    ctx.closePath();ctx.fill();
  }
  function diagram(canvas, data, coupled) {
    const {ctx,w,h} = prepare(canvas);
    const vertical = w < 420;
    const ink = coupled ? '#f3f1e9' : '#191d1c';
    const muted = coupled ? '#a8b3a0' : '#59605a';
    const points = new Map();
    const layers = depth + 2;
    const yStart = 48, yEnd = h-80;
    const xStart = 45, xEnd = w-48;
    const pairGap = vertical ? Math.min(w*.20,70) : 54;
    const position = (layer,row) => vertical
      ? {x:w/2+(row ? pairGap : -pairGap),y:yStart+layer*(yEnd-yStart)/(layers-1)}
      : {x:xStart+layer*(xEnd-xStart)/(layers-1),y:row ? 224 : 116};
    topology.inputs.forEach((item,index) => points.set(item.id,{...position(0,index),id:item.id,input:true}));
    topology.patches.forEach(patch => points.set(patch.id,{...position(patch.level+1,patch.index%2),...patch}));
    ctx.font = '10px Inter, Arial, sans-serif';ctx.textAlign='center';ctx.fillStyle=muted;
    for (let layer=0; layer<layers; layer++) {
      const names = coupled ? ['Inputs','Processing','Observer','Observes observer'] : ['Inputs','Layer 1','Layer 2','Layer 3'];
      const point = position(layer,0);
      if (vertical) {
        ctx.textAlign='left';ctx.fillText(names[layer],16,point.y-31);ctx.textAlign='center';
      } else ctx.fillText(names[layer],point.x,52);
    }
    const grouped = new Map();
    topology.edges.forEach(edge => {
      const key = `${edge.source}:${edge.target}`;
      const previous = grouped.get(key);
      if (!previous) grouped.set(key,{...edge,observed:edge.kind==='error'});
      else if (edge.kind === 'error') previous.observed=true;
    });
    grouped.forEach(edge => arrow(ctx,points.get(edge.source),points.get(edge.target),
      coupled ? 'rgba(207,218,197,.35)' : 'rgba(89,96,90,.4)',coupled && edge.observed));
    if (coupled && depth>0) {
      // A population-level guide to objective influence, not extra read edges.
      for (let level=depth;level>=1;level--) {
        if (vertical) {
          const a=position(level+1,1),b=position(level,1);
          arrow(ctx,{x:w-35,y:a.y},{x:w-35,y:b.y},'#dcf664');
        } else {
          const a=position(level+1,1),b=position(level,1);
          arrow(ctx,{x:a.x,y:284},{x:b.x,y:284},'#dcf664',false,30);
        }
      }
    }
    for (const point of points.values()) {
      const isSelected = !point.input && point.index===selected && coupled;
      const radius = point.input ? 16 : 22;
      if (isSelected) {ctx.beginPath();ctx.arc(point.x,point.y,29,0,Math.PI*2);ctx.strokeStyle='#dcf664';ctx.lineWidth=1;ctx.stroke();}
      ctx.beginPath();ctx.arc(point.x,point.y,radius,0,Math.PI*2);
      ctx.fillStyle = point.input ? (coupled?'#353d34':'#e0e4d6') : (coupled?'#dcf664':'#191d1c');ctx.fill();
      ctx.fillStyle = point.input ? ink : (coupled?'#191d1c':'#f3f1e9');
      ctx.font='600 11px Inter, Arial, sans-serif';ctx.fillText(point.input?(point.id==='signal'?'S':'B'):point.id,point.x,point.y+4);
      ctx.fillStyle=muted;ctx.font='10px Inter, Arial, sans-serif';
      const value = point.input ? (point.id==='signal'?input:.2) : data.states[point.index];
      ctx.fillText(signed(value),point.x,point.y+(point.input?33:40));
    }
    ctx.fillStyle=muted;ctx.font='10px Inter, Arial, sans-serif';ctx.textAlign='center';
    const note = coupled ? (depth ? 'One objective. All active patches participate.' : 'Local repair; no observer populations selected.') : 'Values propagate forward; weights stay fixed.';
    ctx.fillText(note,w/2,h-15);
    if (coupled) lastPoints=[...points.values()].filter(p=>!p.input);
    canvas.setAttribute('aria-label',`${coupled?'Recursive settlement':'Forward reference'}, ${topology.patches.length} patches, output ${topology.output} ${signed(data.output)}. ${coupled ? 'Inspect patch values with the buttons below.' : 'Directed forward computation.'}`);
  }
  function drawTrace() {
    const {ctx,w,h}=prepare(trace),top=Math.max(...energies,1e-8),left=4,bottom=h-6;
    ctx.strokeStyle='#cccfc4';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(left,3);ctx.lineTo(left,bottom);ctx.lineTo(w-4,bottom);ctx.stroke();
    ctx.strokeStyle='#526820';ctx.lineWidth=2;ctx.beginPath();
    energies.forEach((value,index)=>{const x=left+index/Math.max(1,energies.length-1)*(w-10),y=bottom-value/top*(h-12);if(index)ctx.lineTo(x,y);else ctx.moveTo(x,y);});ctx.stroke();
    trace.setAttribute('aria-label',`Shared objective after ${count} steps: ${concise(result.energy)}. Starting objective: ${concise(energies[0])}.`);
  }
  function inspect() {
    const patch=topology.patches[selected];
    el('brain-patch-title').textContent=`${['Processing','Observer','Recursive observer'][patch.level]} patch ${patch.id}`;
    const reads=topology.edges.filter(edge=>edge.target===patch.id);
    const sources=[...new Set(reads.filter(edge=>edge.kind!=='input').map(edge=>edge.source))];
    el('brain-patch-description').textContent=patch.level===0
      ? 'Reads the sensory signal S and the fixed body input B = +0.20. Both stay fixed during settlement.'
      : `Reads the states and exact prediction errors of ${sources.join(' and ')}. Its constraints can influence those earlier states.`;
    el('brain-state').textContent=signed(result.states[selected]);
    el('brain-prediction').textContent=signed(result.predictions[selected]);
    el('brain-error').textContent=signed(result.errors[selected]);
    el('brain-patch-buttons').querySelectorAll('button').forEach((button,index)=>button.setAttribute('aria-pressed',String(index===selected)));
  }
  function render() {
    el('brain-signal-value').textContent=signed(input);
    el('brain-forward-output').textContent=signed(reference.output);
    el('brain-recursive-output').textContent=signed(result.output);
    el('brain-output-name').textContent=topology.output;
    el('brain-steps').textContent=String(count);
    el('brain-energy').textContent=concise(result.energy);
    el('brain-stationarity').textContent=concise(result.stationarity);
    inspect();diagram(forward,reference,false);diagram(recursive,result,true);drawTrace();
  }
  function buttons() {
    const group=el('brain-patch-buttons');group.replaceChildren();
    topology.patches.forEach(patch=>{
      const button=document.createElement('button');button.type='button';button.textContent=patch.id;
      button.setAttribute('aria-label',`Inspect ${patch.name}, ${patch.id}`);
      button.addEventListener('click',()=>{selected=patch.index;render();});group.appendChild(button);
    });
  }
  function advance() {
    if (count>=MAX_STEPS) {stop();setStatus('Step budget reached. Inspect the remaining stationarity, or reset activity.');return false;}
    const next=model.step(states,input,depth);
    if (!next.accepted) {stop();setStatus('Repair stopped: no accepted step within the search budget.');return false;}
    states=next.states;result=next;
    if(next.stepSize>0){count++;energies.push(result.energy);}
    if(next.converged){stop();setStatus(`Settled to the numerical tolerance after ${count} repair steps. Weights stayed fixed.`);return false;}
    if(count>=MAX_STEPS){stop();setStatus('Step budget reached before the stationarity tolerance.');return false;}
    return true;
  }
  function animate() {
    timer=null;
    if (!running) return;
    // Two actual numerical steps per frame; the timing is only for readability.
    let continuing=true;
    for(let i=0;i<2 && continuing;i++) continuing=advance();
    render();if(running)timer=setTimeout(animate,60);
  }
  run.addEventListener('click',()=>{
    if(running){stop();setStatus(`Paused after ${count} repair steps. Continue or inspect a patch.`);return;}
    if(motion.matches){while(advance()){}render();return;}
    running=true;run.textContent='Pause settlement';run.setAttribute('aria-pressed','true');
    setStatus('Settling internal states. Sensory values and relation parameters stay fixed.');animate();
  });
  stepButton.addEventListener('click',()=>{stop();const continuing=advance();if(continuing)setStatus(`Repair step ${count}. Every patch contributes to the shared objective.`);render();});
  reset.addEventListener('click',()=>{stop();states=model.initialStates(depth);count=0;result=model.evaluate(states,input,depth);energies=[result.energy];setStatus('Internal activity reset to zero. Input, observer depth and weights are unchanged.');render();});
  signal.addEventListener('input',()=>{stop();input=Number(signal.value);count=0;result=model.evaluate(states,input,depth);reference=model.feedForward(input,depth);energies=[result.energy];setStatus('Sensory signal changed. The forward pass is complete; patch-net activity is retained. Run settlement to repair it.');render();});
  depthControl.addEventListener('change',()=>{stop();depth=Number(depthControl.value);topology=model.topology(depth);states=model.initialStates(depth);selected=Math.min(selected,states.length-1);count=0;result=model.evaluate(states,input,depth);reference=model.feedForward(input,depth);energies=[result.energy];buttons();setStatus(`${depth} observer levels selected. Internal activity reset; the input is unchanged.`);render();});
  recursive.addEventListener('click',event=>{const bounds=recursive.getBoundingClientRect();const x=event.clientX-bounds.left,y=event.clientY-bounds.top;const point=lastPoints.find(p=>Math.hypot(p.x-x,p.y-y)<30);if(point){selected=point.index;render();}});
  document.addEventListener('visibilitychange',()=>{if(document.hidden&&running){stop();setStatus(`Paused after ${count} repair steps while this tab is hidden.`);}});
  motion.addEventListener('change',()=>{if(motion.matches&&running){stop();setStatus('Animation paused for reduced motion. Run settlement to compute the result directly.');}});
  new IntersectionObserver(entries=>{if(!entries[0].isIntersecting&&running){stop();setStatus(`Paused after ${count} repair steps. Continue when ready.`);}}).observe(root);
  new ResizeObserver(()=>{diagram(forward,reference,false);diagram(recursive,result,true);drawTrace();}).observe(root);
  [signal,depthControl,run,stepButton,reset].forEach(control=>{control.disabled=false;});
  run.setAttribute('aria-pressed','false');buttons();
  setStatus('Ready. The forward reference has its answer. Run settlement to watch the patch-net repair its internal state.');render();
})();
