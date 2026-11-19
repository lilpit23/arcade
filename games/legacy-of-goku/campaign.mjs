// Positions are arena pixels. Simulation runs at 60 fixed ticks per second.
export const arcs = ['The Legacy of Goku', 'The Legacy of Goku II', "Buu’s Fury"];
export const stages = [
  ['Saiyan landing', 'Raditz', 'Intercept the invader before he can leave Earth.'],
  ['Rocky wasteland', 'Vegeta', 'Hold the line against the Saiyan prince.'],
  ['Planet Namek', 'Frieza', 'Break the siege of Namek. Victory opens the android campaign.'],
  ['Southern island', 'Android 19', 'A warning from the future leads you to the coast.'],
  ['Mountain highway', 'Android 17', 'Stop the android advance through the mountains.'],
  ['Cell Games', 'Cell', 'Finish the tournament. Your progress carries into the next era.'],
  ['Babidi’s ship', 'Dabura', 'Descend into the ship before Buu awakens.'],
  ['The lookout', 'Super Buu', 'Buy the survivors enough time to escape.'],
  ['Sacred world', 'Kid Buu', 'Make your final stand on the world of the Kais.']
];
export function newSave(){ return {stage:0,hp:100,ep:16}; }
export function valid(s){ return s && Number.isInteger(s.stage) && s.stage>=0 && s.stage<=stages.length && Number.isFinite(s.hp) && s.hp>0 && s.hp<=100 && Number.isFinite(s.ep) && s.ep>=0 && s.ep<=32; }
export function fight(save){
  return {save:{...save},x:94,y:120,fx:1,fy:0,bx:305,by:116,bhp:48+save.stage*10,age:0,charge:0,strike:0,dash:0,bolts:[],shield:false,guard:false,result:''};
}
const clamp=(v,min,max)=>Math.min(max,Math.max(min,v));
export function tick(f,k){
  if(f.result)return;
  const s=f.save;
  f.age++;
  f.strike=Math.max(0,f.strike-1);
  f.guard=!!k.guard;
  f.shield=!!(k.guard && k.ki && s.ep>=0.12);
  if(f.shield)s.ep-=0.12;
  if(k.dash)f.dash=12;
  const length=Math.hypot(k.x,k.y);
  if(length){
    f.fx=k.x/length; f.fy=k.y/length;
    const speed=f.guard?0.55:f.dash?3.4:1.45;
    f.x=clamp(f.x+f.fx*speed,14,386); f.y=clamp(f.y+f.fy*speed,57,208);
  }
  f.dash=Math.max(0,f.dash-1);
  const dx=f.bx-f.x,dy=f.by-f.y,dist=Math.hypot(dx,dy),front=dx*f.fx+dy*f.fy>=0;
  if(k.hit && !f.guard && !f.strike){
    f.strike=17;
    if(dist<30 && front){f.bhp-=9+s.stage; s.ep=Math.min(32,s.ep+1);}
  }
  if(k.guard)f.charge=0;
  else if(k.ki)f.charge=Math.min(60,f.charge+1);
  else if(f.charge){
    const cost=f.charge>=30?6:2;
    if(s.ep>=cost){s.ep-=cost;f.bolts.push({x:f.x,y:f.y,vx:f.fx*4,vy:f.fy*4,power:cost*3+s.stage});}
    f.charge=0;
  }
  f.bolts=f.bolts.filter(p=>{
    p.x+=p.vx;p.y+=p.vy;
    if(Math.hypot(p.x-f.bx,p.y-f.by)<12){f.bhp-=p.power;return false;}
    return p.x>0 && p.y>45 && p.x<400 && p.y<224;
  });
  if(f.bhp<=0){
    s.stage++;s.hp=Math.min(100,s.hp+20);s.ep=Math.min(32,s.ep+4);f.result='won';return;
  }
  const cycle=80-s.stage*3, phase=f.age%cycle;
  if(dist>17 && phase<cycle-15){
    const speed=0.68+s.stage*0.065;
    f.bx-=dx/dist*speed;f.by-=dy/dist*speed;
  }
  if(phase===0 && dist<38 && !f.shield){
    s.hp=Math.max(0,s.hp-(8+s.stage)/(f.guard && front?16:1));
    if(!s.hp)f.result='lost';
  }
}
