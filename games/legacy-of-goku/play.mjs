import {arcs, stages, newSave, valid, fight, tick} from './campaign.mjs';
const el=id=>document.getElementById(id);
const ctx=document.querySelector('canvas').getContext('2d');
const slot='legacy-campaign-v1';
let save=newSave(), storageIssue='';
try{const stored=JSON.parse(localStorage.getItem(slot));if(valid(stored))save=stored;}catch{storageIssue=' Browser checkpoint unavailable.';}
let sim,active=false,paused=false,dash=false,previous=0,accumulator=0;
const held=new Set(),taps=new Map();
const keys=['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','KeyX','KeyZ','KeyC'];
function persist(){
  try{localStorage.setItem(slot,JSON.stringify(save));}catch{storageIssue=' Browser checkpoint unavailable.';}
}
function setup(){
  sim=fight(save);
  const end=save.stage===stages.length;
  const i=Math.min(save.stage,stages.length-1);
  el('arc').textContent=arcs[Math.floor(i/3)].toUpperCase();
  el('place').textContent=end?'Campaign complete':stages[i][0];
  el('boss').textContent=end?'':stages[i][1];
  el('story').textContent=(end?'All three arcs cleared.':stages[i][2])+storageIssue;
  el('action').textContent=end?'Play again':'Begin encounter';
  el('action').hidden=false;draw();
}
el('action').onclick=()=>{
  if(save.stage===stages.length){save=newSave();persist();setup();}
  if(!paused)sim=fight(save);
  paused=false;active=true;accumulator=0;previous=performance.now();
  el('action').hidden=true;el('story').textContent='A gold ring signals the incoming strike.';
};
window.addEventListener('keydown',e=>{
  if(!active || !keys.includes(e.code))return;
  e.preventDefault();
  if(!held.has(e.code) && e.code.startsWith('Arrow')){
    if(performance.now()-(taps.get(e.code)??-Infinity)<1000/3)dash=true;
    taps.set(e.code,performance.now());
  }
  held.add(e.code);
});
window.addEventListener('keyup',e=>held.delete(e.code));
window.addEventListener('blur',()=>{
  held.clear();taps.clear();dash=false;
  if(active){paused=true;active=false;el('action').hidden=false;el('action').textContent='Resume';}
});
const palettes=[
  ['#c37856','#915841','#533e3a','#c09260'],['#c29866','#886440','#574635','#b29670'],['#71afa1','#517479','#314e55','#70998a'],
  ['#85b4ac','#618b83','#415d59','#b8a27d'],['#929caa','#697784','#404953','#997c67'],['#adb6aa','#778784','#556261','#a9a28d'],
  ['#8a778f','#60566f','#41394e','#726680'],['#93b9ca','#748caa','#515a76','#b3a3a6'],['#bf9dc3','#90819f','#60546e','#a6a281']
];
function ring(x,y,r,color){
  ctx.strokeStyle=color;ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.stroke();
}
function fighter(x,y,color,face){
  x=Math.round(x);y=Math.round(y);
  ctx.fillStyle='#302d3588';ctx.fillRect(x-8,y+2,17,3);
  ctx.fillStyle='#252d36';ctx.fillRect(x-5,y-6,4,9);ctx.fillRect(x+2,y-5,4,8);
  ctx.fillStyle=color;ctx.fillRect(x-6,y-16,12,11);ctx.fillRect(x+face*6-2,y-13,5,5);
  ctx.fillStyle='#f0bf95';ctx.fillRect(x-4,y-23,8,8);
  ctx.fillStyle='#26333b';ctx.fillRect(x-5,y-25,10,4);ctx.fillRect(x-face*4-1,y-23,3,5);
}
function draw(){
  const p=palettes[Math.min(save.stage,8)],f=sim;
  ctx.fillStyle=p[0];ctx.fillRect(0,0,400,224);
  ctx.fillStyle='#ffe2a3';ctx.fillRect(312,12,17,17);
  for(let layer=1;layer<=2;layer++){
    ctx.fillStyle=p[layer];ctx.beginPath();ctx.moveTo(0,80);
    for(let x=0;x<=410;x+=10)ctx.lineTo(x,20+layer*13+Math.sin(x*.053+save.stage+layer)*8+Math.cos(x*.091+layer)*7);
    ctx.lineTo(410,80);ctx.fill();
  }
  ctx.fillStyle=p[3];ctx.fillRect(0,59,400,165);
  ctx.fillStyle='#ffffff29';
  for(let i=0;i<120;i++)ctx.fillRect((i*127)%399,60+(i*93)%164,3+i%5,1);
  if(f.age%(80-save.stage*3)>=65-save.stage*3)ring(f.bx,f.by,25,'#ffda75');
  fighter(f.bx,f.by,'#882f52',f.bx>f.x?-1:1);fighter(f.x,f.y,'#ed903d',f.fx>=0?1:-1);
  if(f.guard||f.charge)ring(f.x,f.y-9,f.shield?20:13,f.guard?'#84ffff':'#ffe98e');
  if(f.strike>12)ring(f.x+f.fx*14,f.y-9+f.fy*14,7,'#fff2ba');
  ctx.fillStyle='#ffffac';for(const b of f.bolts)ctx.fillRect(b.x-3,b.y-10,6,5);
  el('health').textContent='Health '+Math.ceil(f.save.hp)+' / 100';
  el('energy').textContent='Energy '+Math.floor(f.save.ep)+' / 32';
  el('enemy').textContent=save.stage<9?'Opponent HP '+Math.max(0,Math.ceil(f.bhp)):'';
}
function frame(now){
  if(active){
    accumulator+=Math.min(100,now-previous);
    while(accumulator>=1000/60 && active){
      tick(sim,{x:Number(held.has('ArrowRight'))-Number(held.has('ArrowLeft')),y:Number(held.has('ArrowDown'))-Number(held.has('ArrowUp')),hit:held.has('KeyX'),ki:held.has('KeyZ'),guard:held.has('KeyC'),dash});
      dash=false;accumulator-=1000/60;
      if(sim.result){
        active=false;held.clear();taps.clear();
        if(sim.result==='won'){save=sim.save;persist();setup();}
        else{el('action').hidden=false;el('action').textContent='Retry encounter';el('story').textContent='Defeated. Retry from the last checkpoint.';}
      }
    }
    draw();
  }
  previous=now;requestAnimationFrame(frame);
}
setup();requestAnimationFrame(frame);
