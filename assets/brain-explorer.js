/* Educational interaction for brain-model.js. All displayed values come from
 * its fixed-weight equations; animation timing has no computational meaning. */
'use strict';
(() => {
  const root = document.querySelector('#brain-explorer');
  const model = globalThis.CadenceIllustration;
  if (!root || !model) return;
  const el = id => document.getElementById(id);
  const signal = el('brain-signal'), depthControl = el('brain-depth'), modeControl = el('brain-mode');
  const run = el('brain-run'), stepButton = el('brain-step'), reset = el('brain-reset');
  const status = el('brain-status');
  const recursive = el('brain-recursive'), forward = el('brain-forward'), trace = el('brain-energy-trace');
  if (![recursive, forward, trace].every(canvas => canvas.getContext('2d'))) return;
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const MAX_STEPS = 240;
  let input = Number(signal.value), depth = Number(depthControl.value), mode = modeControl.value;
  const settings = () => ({mode, depth});
  let topology = model.topology(settings()), states = model.initialStates(settings());
  let result = model.evaluate(states, input, settings()), reference = model.feedForward(input, settings());
  const patterns = {
    flat: {
      name: 'Flat settlement', title: 'A direct, practised response.',
      description: 'Each patch reads the same fixed inputs and settles independently. No patch reads its neighbours.',
      analogy: 'Think of a familiar movement becoming a practised response: a direct mapping from a situation to an action.',
      note: 'Six input-only patches. Only P5 supplies the displayed output; the other patches do not act as a hidden layer.',
      diagram: 'Independent states. One qualification.'
    },
    composed: {
      name: 'State-coupled settlement', title: 'Coordinate the whole response.',
      description: 'Later populations read earlier live states. Their constraints can change those states while the whole system settles.',
      analogy: 'Think of coordination and balance: several parts adjust together to find a consistent position.',
      note: 'Six patches in three populations, connected through states. There are no error-reading connections.',
      diagram: 'State connections. One coupled objective.'
    },
    recursive: {
      name: 'Recursive observer settlement', title: 'Bring internal error into the answer.',
      description: 'Observers read states and exact prediction errors. A further observer can read those observers in the same solve.',
      analogy: 'Think of reflective reasoning: considering an interpretation alongside where it fails to fit.',
      note: 'Choose the number of observer levels. Zero is a two-patch input-only control; two levels include observers of observers.',
      diagram: 'State + error readback. One objective.'
    }
  };
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
    const muted = coupled ? '#b5c5d7' : '#59605a';
    const points = new Map();
    const layers = topology.levels + 1;
    const yStart = 48, yEnd = h-80;
    const xStart = 55, xEnd = w-64;
    const pairGap = vertical ? Math.min(w*.20,70) : 54;
    const position = (layer,row) => {
      if(mode==='flat') {
        if(vertical) return layer===0
          ? {x:w/2+(row?pairGap:-pairGap),y:62}
          : {x:w/2+(row%2?pairGap:-pairGap),y:154+Math.floor(row/2)*(h-236)/2};
        return layer===0 ? {x:65,y:row?230:125}
          : {x:w-80,y:78+row*(h-150)/5};
      }
      return vertical
        ? {x:w/2+(row ? pairGap : -pairGap),y:yStart+layer*(yEnd-yStart)/(layers-1)}
        : {x:xStart+layer*(xEnd-xStart)/(layers-1),y:row ? Math.min(224,h*.60) : Math.min(116,h*.32)};
    };
    topology.inputs.forEach((item,index) => points.set(item.id,{...position(0,index),id:item.id,input:true}));
    topology.patches.forEach(patch => points.set(patch.id,{...position(patch.level+1,patch.row),...patch}));
    ctx.font = '12px Inter, Arial, sans-serif';ctx.textAlign='center';ctx.fillStyle=muted;
    for (let layer=0; layer<layers; layer++) {
      const names = mode==='flat' ? ['Inputs','Independent patches']
        : mode==='composed' ? ['Inputs','Processing','Representation','Response']
          : ['Inputs','Processing','Observer','Observes observer'];
      const point = position(layer,0);
      if (vertical) {
        ctx.textAlign='left';ctx.fillText(names[layer],16,point.y-31);ctx.textAlign='center';
      } else ctx.fillText(names[layer],point.x,mode==='flat'?34:52);
    }
    const grouped = new Map();
    topology.edges.forEach(edge => {
      const key = `${edge.source}:${edge.target}`;
      const previous = grouped.get(key);
      if (!previous) grouped.set(key,{...edge,observed:edge.kind==='error'});
      else if (edge.kind === 'error') previous.observed=true;
    });
    grouped.forEach(edge => arrow(ctx,points.get(edge.source),points.get(edge.target),
      coupled ? 'rgba(188,207,227,.35)' : 'rgba(89,96,90,.4)',coupled && edge.observed));
    if (coupled && topology.levels>1) {
      // A population-level guide to objective influence, not extra read edges.
      for (let level=topology.levels-1;level>=1;level--) {
        if (vertical) {
          const a=position(level+1,1),b=position(level,1);
          arrow(ctx,{x:w-35,y:a.y},{x:w-35,y:b.y},'#8fb8e8');
        } else {
          const a=position(level+1,1),b=position(level,1);
          arrow(ctx,{x:a.x,y:h-65},{x:b.x,y:h-65},'#8fb8e8',false,24);
        }
      }
    }
    for (const point of points.values()) {
      const isSelected = !point.input && point.index===selected && coupled;
      const radius = point.input ? 16 : mode==='flat' && !vertical ? 17 : 22;
      if (isSelected) {ctx.beginPath();ctx.arc(point.x,point.y,29,0,Math.PI*2);ctx.strokeStyle='#8fb8e8';ctx.lineWidth=1;ctx.stroke();}
      ctx.beginPath();ctx.arc(point.x,point.y,radius,0,Math.PI*2);
      ctx.fillStyle = point.input ? (coupled?'#2e3b4a':'#dce8f5') : (coupled?'#8fb8e8':'#191d1c');ctx.fill();
      ctx.fillStyle = point.input ? ink : (coupled?'#191d1c':'#f3f1e9');
      ctx.font='600 12px Inter, Arial, sans-serif';ctx.fillText(point.input?(point.id==='signal'?'S':'B'):point.id,point.x,point.y+4);
      ctx.fillStyle=muted;ctx.font='12px Inter, Arial, sans-serif';
      const value = point.input ? (point.id==='signal'?input:.2) : data.states[point.index];
      ctx.fillText(signed(value),point.x+(mode==='flat'&&!vertical&&!point.input?47:0),point.y+(point.input?33:mode==='flat'&&!vertical?4:40));
    }
    ctx.fillStyle=muted;ctx.font='11px Inter, Arial, sans-serif';ctx.textAlign='center';
    const note = coupled ? (mode==='recursive' && depth===0 ? 'No observers. Input-only control.' : patterns[mode].diagram) : 'Forward substitution; no joint repair.';
    ctx.fillText(note,w/2,h-15);
    if (coupled) lastPoints=[...points.values()].filter(p=>!p.input);
    canvas.setAttribute('aria-label',`${coupled?patterns[mode].name:'Forward reference'}, ${topology.patches.length} patches, output ${topology.output} ${signed(data.output)}. ${coupled ? 'Inspect patch values with the buttons below.' : 'Directed forward computation.'}`);
  }
  function drawTrace() {
    const {ctx,w,h}=prepare(trace),top=Math.max(...energies,1e-8),left=4,bottom=h-6;
    ctx.strokeStyle='#cccfc4';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(left,3);ctx.lineTo(left,bottom);ctx.lineTo(w-4,bottom);ctx.stroke();
    ctx.strokeStyle='#315d8a';ctx.lineWidth=2;ctx.beginPath();
    energies.forEach((value,index)=>{const x=left+index/Math.max(1,energies.length-1)*(w-10),y=bottom-value/top*(h-12);if(index)ctx.lineTo(x,y);else ctx.moveTo(x,y);});ctx.stroke();
    trace.setAttribute('aria-label',`Shared objective after ${count} steps: ${concise(result.energy)}. Starting objective: ${concise(energies[0])}.`);
  }
  function inspect() {
    const patch=topology.patches[selected];
    el('brain-patch-title').textContent=patch.name;
    const reads=topology.edges.filter(edge=>edge.target===patch.id);
    const sources=[...new Set(reads.filter(edge=>edge.kind!=='input').map(edge=>edge.source))];
    el('brain-patch-description').textContent=!sources.length
      ? 'Reads the sensory signal S and fixed body input B = +0.20. The supplied values stay fixed during settlement.'
      : reads.some(edge=>edge.kind==='error')
        ? `Reads the states and exact prediction errors of ${sources.join(' and ')}. Its constraints can influence those earlier states.`
        : `Reads the live states of ${sources.join(' and ')}. The shared objective lets its constraints influence them, without reading their errors.`;
    el('brain-state').textContent=signed(result.states[selected]);
    el('brain-prediction').textContent=signed(result.predictions[selected]);
    el('brain-error').textContent=signed(result.errors[selected]);
    el('brain-patch-buttons').querySelectorAll('button').forEach((button,index)=>button.setAttribute('aria-pressed',String(index===selected)));
  }
  function render() {
    const pattern=patterns[mode];
    depthControl.disabled=mode!=='recursive';
    el('brain-mode-name').textContent=mode==='recursive'&&depth===0?'Input-only control':pattern.name;
    el('brain-mode-title').textContent=mode==='recursive'&&depth===0?'Settle without an observer.':pattern.title;
    el('brain-mode-description').textContent=mode==='recursive'&&depth===0?patterns.flat.description:pattern.description;
    el('brain-mode-analogy').textContent=mode==='recursive'&&depth===0?patterns.flat.analogy:pattern.analogy;
    el('brain-mode-note').textContent=pattern.note;
    el('brain-depth-help').textContent=mode==='recursive'?'Depth changes the number of observer populations.':'Observer depth applies only to recursive mode.';
    el('brain-legend-observe').hidden=!topology.edges.some(edge=>edge.kind==='error');
    el('brain-legend-return').hidden=topology.levels===1;
    el('brain-legend-populations').textContent=mode==='flat'?'Six independent patches read the supplied inputs.':'Each pair is a population; all use the same patch rule.';
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
    const next=model.step(states,input,settings());
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
  reset.addEventListener('click',()=>{stop();states=model.initialStates(settings());count=0;result=model.evaluate(states,input,settings());energies=[result.energy];setStatus('Internal activity reset to zero. Input, layout and weights are unchanged.');render();});
  signal.addEventListener('input',()=>{stop();input=Number(signal.value);count=0;result=model.evaluate(states,input,settings());reference=model.feedForward(input,settings());energies=[result.energy];setStatus('Sensory signal changed. The forward pass is complete; patch-net activity is retained. Run settlement to repair it.');render();});
  function changeLayout() {
    stop();mode=modeControl.value;depth=Number(depthControl.value);
    topology=model.topology(settings());states=model.initialStates(settings());
    selected=Math.min(selected,states.length-1);count=0;
    result=model.evaluate(states,input,settings());reference=model.feedForward(input,settings());energies=[result.energy];
    buttons();setStatus(`${patterns[mode].name} selected. ${topology.patches.length} patches. New wiring, reset activity; the sensory input is unchanged.`);render();
  }
  modeControl.addEventListener('change',changeLayout);
  depthControl.addEventListener('change',changeLayout);
  recursive.addEventListener('click',event=>{const bounds=recursive.getBoundingClientRect();const x=event.clientX-bounds.left,y=event.clientY-bounds.top;const point=lastPoints.find(p=>Math.hypot(p.x-x,p.y-y)<30);if(point){selected=point.index;render();}});
  document.addEventListener('visibilitychange',()=>{if(document.hidden&&running){stop();setStatus(`Paused after ${count} repair steps while this tab is hidden.`);}});
  motion.addEventListener('change',()=>{if(motion.matches&&running){stop();setStatus('Animation paused for reduced motion. Run settlement to compute the result directly.');}});
  new IntersectionObserver(entries=>{if(!entries[0].isIntersecting&&running){stop();setStatus(`Paused after ${count} repair steps. Continue when ready.`);}}).observe(root);
  new ResizeObserver(()=>{diagram(forward,reference,false);diagram(recursive,result,true);drawTrace();}).observe(root);
  [signal,modeControl,run,stepButton,reset].forEach(control=>{control.disabled=false;});
  run.setAttribute('aria-pressed','false');buttons();
  setStatus('Ready. Choose a pattern and run settlement. The forward reference uses the same example relations without joint repair.');render();
})();
