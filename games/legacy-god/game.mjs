import {draw} from './art.mjs';

const $ = id => document.getElementById(id);
const canvas = document.querySelector('canvas'), ctx = canvas.getContext('2d');
const keys = new Set(), directions = {KeyW:[0,-1],ArrowUp:[0,-1],KeyS:[0,1],ArrowDown:[0,1],KeyA:[-1,0],ArrowLeft:[-1,0],KeyD:[1,0],ArrowRight:[1,0]};
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const dialogue = {
  intro:['King Kai','Goku! Ten times Earth’s gravity and you’re still bouncing on your toes. Come over here. Let’s put those feet to work.'],
  walk:['Footwork','Move to the gold ring beside King Kai.'],
  punch:['King Kai','Good. Now plant your feet beside the training post and throw a punch.'],
  blast:['King Kai','You cracked it! Back up a few steps and finish it with a ki blast.'],
  arrival:['King Kai','That pressure… Goku, hands down. Lord Beerus is here. Please let me do the talking.'],
  challenge:['Beerus','You’re the Saiyan who defeated Frieza? I have time for one exchange. You may go first.'],
  duel:['Goku','One exchange? I’ll make it count!'],
  windup:['Beerus','My turn.'],
  defeat:['King Kai','Goku? Goku! …He’s breathing. Lord Beerus put him down with one tap.']
};
let w, goal, action, clock, last=0;
function setPhase(phase){
  w.phase=phase;goal=action=null;w.moving=false;
  const [speaker,line]=dialogue[phase];$('speaker').textContent=speaker;$('line').textContent=line;
  $('next').hidden=!['intro','arrival','challenge'].includes(phase);
  $('punch').hidden=!['punch','duel'].includes(phase);$('blast').hidden=!['blast','duel'].includes(phase);
  $('again').hidden=phase!=='defeat';
  $('hp').value=w.ko?0:100;$('health').textContent=w.ko?'0 HP':'100 HP';
}
function reset(){
  keys.clear();clock=0;
  w={hero:{x:118,y:159},kai:{x:182,y:132},post:{x:223,y:145},beerus:{x:275,y:122},
    arrived:false,broken:false,ko:false,moving:false,left:false,flash:0,attack:0,shot:null};
  setPhase('intro');
}
function advance(){
  if(w.phase==='intro')setPhase('walk');
  else if(w.phase==='arrival')setPhase('challenge');
  else if(w.phase==='challenge')setPhase('duel');
}
function strike(){
  if(!['punch','duel'].includes(w.phase)||w.attack>0)return;
  const target=w.phase==='duel'?w.beerus:w.post;
  w.left=target.x<w.hero.x;w.attack=.22;
  if(distance(w.hero,target)>18){$('line').textContent='Step closer, or click your target to close the distance.';return}
  if(w.phase==='punch'){w.flash=.06;setPhase('blast')}
  else counter();
}
function fire(){
  if(!['blast','duel'].includes(w.phase)||w.shot)return;
  const target=w.phase==='blast'?w.post:w.beerus;
  if(w.phase==='blast'&&distance(w.hero,target)<29){$('line').textContent='Give the blast some room. Step back, or click the post to line up your shot.';return}
  w.left=target.x<w.hero.x;w.shot={...w.hero,target};
}
function counter(){setPhase('windup');clock=.6}
function use(){if(!$('next').hidden)advance();else strike()}
$('next').onclick=advance;$('punch').onclick=strike;$('blast').onclick=fire;$('again').onclick=reset;
try{$('sprint').checked=localStorage.getItem('trilogy.autoSprint')==='on'}catch{}
$('sprint').onchange=()=>{try{localStorage.setItem('trilogy.autoSprint',$('sprint').checked?'on':'off')}catch{}};
function canMove(){return ['walk','punch','blast','duel'].includes(w.phase)}
function fieldPoint(x,y){
  const scale=Math.max(1,Math.hypot((x-192)/166,(y-141)/52));
  return {x:192+(x-192)/scale,y:141+(y-141)/scale};
}
canvas.addEventListener('pointerdown',e=>{
  if(e.button!==0)return;
  canvas.focus();if(!canMove()){advance();return}
  const b=canvas.getBoundingClientRect(),p={x:(e.clientX-b.left)*384/b.width,y:(e.clientY-b.top)*224/b.height};
  const near=o=>Math.hypot(p.x-o.x,p.y-o.y+7)<=18;
  action=null;
  if(w.phase==='walk'&&near(w.kai))goal={x:w.kai.x-12,y:w.kai.y};
  else if(w.phase==='blast'&&near(w.post)){
    goal={x:w.post.x+(w.hero.x<w.post.x?-38:38),y:w.post.y};action=fire;
  }else if((w.phase==='punch'&&near(w.post))||(w.phase==='duel'&&near(w.beerus))){
    const o=w.phase==='duel'?w.beerus:w.post;goal={x:o.x+(w.hero.x<o.x?-10:10),y:o.y};action=strike;
  }else goal=fieldPoint(p.x,p.y);
});
window.addEventListener('keydown',e=>{
  if(e.ctrlKey||e.metaKey||e.altKey||e.target.matches?.('button,input,a')&&['Space','Enter'].includes(e.code))return;
  if(directions[e.code]||e.key==='Shift'){e.preventDefault();keys.add(e.code);if(directions[e.code])goal=action=null;return}
  if(!['Numpad4','KeyJ','Space','KeyE','Enter','Numpad6','KeyK'].includes(e.code))return;
  e.preventDefault();if(e.repeat)return;
  if(['Numpad6','KeyK'].includes(e.code))fire();else if(['Enter','KeyE'].includes(e.code))advance();else use();
});
window.addEventListener('keyup',e=>keys.delete(e.code));
window.addEventListener('blur',()=>keys.clear());
function step(dt){
  const h=w.hero;w.attack=Math.max(0,w.attack-dt);w.flash=Math.max(0,w.flash-dt);w.moving=false;
  if(canMove()){
    let dx=0,dy=0;
    for(const k of keys)if(directions[k]){dx+=directions[k][0];dy+=directions[k][1]}
    if(goal){dx=goal.x-h.x;dy=goal.y-h.y}
    const d=Math.hypot(dx,dy),speed=$('sprint').checked||keys.has('ShiftLeft')||keys.has('ShiftRight')?70:40;
    if(d>0){
      const n=(goal?Math.min(d,speed*dt):speed*dt)/d;
      const end=fieldPoint(h.x+dx*n,h.y+dy*n);w.moving=distance(h,end)>.01;
      Object.assign(h,end);if(dx)w.left=dx<0;
    }
    if(goal&&distance(h,goal)<1){const done=action;goal=action=null;done?.()}
    if(w.phase==='walk'&&distance(h,{x:w.kai.x-12,y:w.kai.y})<11)setPhase('punch');
  }
  if(w.shot){
    const s=w.shot,d=distance(s,s.target),n=155*dt;
    if(d<=n){w.shot=null;w.flash=.12;
      if(w.phase==='blast'){w.broken=true;w.arrived=true;setPhase('arrival')}
      else counter();
    }else{s.x+=(s.target.x-s.x)*n/d;s.y+=(s.target.y-s.y)*n/d}
  }
  if(w.phase==='windup'&&(clock-=dt)<=0){
    w.beerus={x:h.x+8,y:h.y-1};w.shot=null;w.ko=true;w.flash=.25;keys.clear();setPhase('defeat');
  }
}
function frame(ms){const dt=Math.min(.05,(ms-last)/1000);last=ms;step(dt);draw(ctx,w,ms/1000);requestAnimationFrame(frame)}
reset();requestAnimationFrame(frame);
