'use strict';
const $ = (id) => document.getElementById(id);
const defaults = Array.from({length:7}, (_,i)=>`Opción ${i+1}`);
const colors = ['#3977e5','#678fdb','#8565c4','#3c9b9d','#d49b48','#bf6985','#526baf'];
const storageKey = 'gg-ruleta-v1';
let saved = {};
try { saved = JSON.parse(localStorage.getItem(storageKey) || '{}') || {}; } catch {}
let history = Array.isArray(saved.history) ? saved.history.filter(x=>typeof x?.label==='string' && Number.isFinite(x.time)).slice(0,30) : [];
let rotation = 0, spinning = false, options = [];
$('options').value = typeof saved.text === 'string' ? saved.text : defaults.join('\n');
$('remove').checked = saved.remove === true;
$('duration').value = ['3000','5000','8000'].includes(saved.duration) ? saved.duration : '5000';
let light = saved.light === true;
function theme() { document.body.classList.toggle('light',light); $('theme').textContent = light ? '◐ Tema oscuro' : '◐ Tema claro'; }
theme();
function persist() {
  try { localStorage.setItem(storageKey, JSON.stringify({text:$('options').value,remove:$('remove').checked,duration:$('duration').value,light,history})); }
  catch { $('status').textContent = 'El navegador no permite guardar. Puedes seguir usando la ruleta.'; }
}
function randomIndex(n) {
  const max = 4294967296 - (4294967296 % n), a = new Uint32Array(1);
  do { crypto.getRandomValues(a); } while(a[0] >= max);
  return a[0] % n;
}
function draw() {
  const c = $('wheel'), ctx = c.getContext('2d'), size = 1000, center = 500, radius = 480;
  ctx.clearRect(0,0,size,size);
  const entries = options.length ? options : ['Añade tus opciones'];
  const step = Math.PI*2/entries.length;
  entries.forEach((label,i)=> {
    const start = rotation + i*step;
    ctx.beginPath();ctx.moveTo(center,center);ctx.arc(center,center,radius,start,start+step);ctx.closePath();
    ctx.fillStyle = colors[i%colors.length];ctx.fill();ctx.strokeStyle='#dce8ff33';ctx.lineWidth=2;ctx.stroke();
    ctx.save();ctx.translate(center,center);ctx.rotate(start+step/2);ctx.fillStyle='#fff';ctx.textAlign='right';ctx.textBaseline='middle';
    const fontSize = Math.min(38, Math.max(12, 320/Math.sqrt(entries.length)));
    ctx.font=`500 ${fontSize}px "Segoe UI", Arial, sans-serif`;
    let text = label;
    while(ctx.measureText(text).width>320 && text.length>1) text=text.slice(0,-1);
    if(text!==label) text=text.slice(0,-1)+'…';
    ctx.fillText(text,435,0);ctx.restore();
  });
  ctx.beginPath();ctx.arc(center,center,radius,0,Math.PI*2);ctx.lineWidth=8;ctx.strokeStyle='#b4cfff55';ctx.stroke();
  $('wheel').setAttribute('aria-label',`Ruleta con ${options.length} opciones: ${options.join(', ')}`);
}
function update() {
  const all = $('options').value.split('\n').map(x=>x.trim()).filter(Boolean);
  options = all.slice(0,100);
  $('count').textContent=options.length;
  $('spin').disabled=$('hub').disabled=spinning || options.length<2 || all.length>100;
  $('input-hint').textContent=all.length>100 ? 'Hay más de 100 opciones. Reduce la lista para poder girar.' : 'Entre 2 y 100 opciones · Se guardan automáticamente';
  if(!spinning) draw();
  persist();
}
function renderHistory() {
  $('history').replaceChildren();
  history.forEach((entry)=> {
    const li = document.createElement('li'), name=document.createElement('strong'), time=document.createElement('time');
    name.textContent=entry.label; time.dateTime=new Date(entry.time).toISOString();
    time.textContent=new Date(entry.time).toLocaleString('es-ES',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'});
    li.append(name,time);$('history').append(li);
  });
  $('empty').hidden=history.length>0;$('clear').disabled=history.length===0;$('history-count').textContent=history.length;
}
function lock(value) {
  spinning=value;
  for(const id of ['options','shuffle','sort','reset','remove','duration']) $(id).disabled=value;
  $('spin').disabled=$('hub').disabled=value || options.length<2;
}
function spin() {
  if(spinning || $('spin').disabled) return;
  const entries=[...options], chosen=randomIndex(entries.length), step=2*Math.PI/entries.length;
  const start=rotation, targetAngle=2*Math.PI-(chosen+.5)*step;
  const normalized=((rotation%(2*Math.PI))+2*Math.PI)%(2*Math.PI);
  const delta=((targetAngle-normalized+2*Math.PI)%(2*Math.PI))+2*Math.PI*(5+randomIndex(3));
  const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
  const duration=reduced ? 150 : Number($('duration').value);
  const began=performance.now();
  lock(true);$('status').textContent='La suerte está en movimiento…';
  function animate(now) {
    const t=Math.min(1,(now-began)/duration);
    rotation=start+delta*(1-Math.pow(1-t,4));draw();
    if(t<1) {requestAnimationFrame(animate);return;}
    rotation=((rotation%(2*Math.PI))+2*Math.PI)%(2*Math.PI);
    const label=entries[chosen];
    history.unshift({label,time:Date.now()});history=history.slice(0,30);renderHistory();
    if($('remove').checked) {entries.splice(chosen,1);$('options').value=entries.join('\n');}
    lock(false);
    // Keep the finished wheel visible until the result is dismissed.
    if($('remove').checked) {options=entries;$('count').textContent=entries.length;$('spin').disabled=$('hub').disabled=entries.length<2;}
    persist();$('winner').textContent=label;$('status').textContent=`Ha salido: ${label}`;$('result').showModal();
    $('again').disabled=options.length<2;
  }
  requestAnimationFrame(animate);
}
$('spin').addEventListener('click',spin);$('hub').addEventListener('click',spin);
$('options').addEventListener('input',update);
$('remove').addEventListener('change',persist);$('duration').addEventListener('change',persist);
$('theme').addEventListener('click',()=>{light=!light;theme();persist();});
$('shuffle').addEventListener('click',()=> {const a=[...options];for(let i=a.length-1;i>0;i--){const j=randomIndex(i+1);[a[i],a[j]]=[a[j],a[i]];}$('options').value=a.join('\n');update();});
$('sort').addEventListener('click',()=>{$('options').value=[...options].sort((a,b)=>a.localeCompare(b,'es',{numeric:true})).join('\n');update();});
$('reset').addEventListener('click',()=>{if(confirm('¿Restablecer las opciones de ejemplo? Se sustituirá tu lista actual.')){$('options').value=defaults.join('\n');rotation=0;update();}});
$('clear').addEventListener('click',()=>{if(confirm('¿Vaciar el historial de resultados?')){history=[];renderHistory();persist();}});
$('close').addEventListener('click',()=>$('result').close());
$('again').addEventListener('click',()=>{$('result').close();spin();});
$('result').addEventListener('close',draw);
window.addEventListener('keydown',(e)=> {if(e.code==='Space' && !e.repeat && !['INPUT','TEXTAREA','SELECT','BUTTON','A'].includes(document.activeElement.tagName) && !$('result').open){e.preventDefault();spin();}});
renderHistory();update();
