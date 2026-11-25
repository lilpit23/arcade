// Pixel scenery and characters drawn at the game's native resolution.
export function draw(ctx, world, t) {
  const {hero, kai, post, beerus, phase, flash, shot, attack} = world;
  const r=(x,y,w,h,c)=>{ctx.fillStyle=c;ctx.fillRect(Math.round(x),Math.round(y),w,h)};
  function oval(x,y,a,b,c){ctx.fillStyle=c;ctx.beginPath();ctx.ellipse(x,y,a,b,0,0,Math.PI*2);ctx.fill()}
  function poly(c,...pts){ctx.fillStyle=c;ctx.beginPath();pts.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.closePath();ctx.fill()}
  const sky=ctx.createLinearGradient(0,0,0,224);sky.addColorStop(0,'#171537');sky.addColorStop(.7,'#514778');sky.addColorStop(1,'#bc84a2');ctx.fillStyle=sky;ctx.fillRect(0,0,384,224);
  for(let i=0;i<90;i++){let x=(i*113+13)%384,y=(i*i*17+i*5)%224;r(x,y,1+(i%18===0),1,i%4?'#b3a9d4':'#fff2c9')}
  oval(308,30,13,13,'#f5d1a0');oval(311,27,11,11,'#544168');
  oval(192,161,180,61,'#39384b');oval(192,155,180,59,'#666148');oval(192,143,180,63,'#518860');oval(192,137,180,62,'#89bb70');
  for(let i=0;i<180;i++){const x=(i*89)%356+14,y=(i*i*19+7*i)%121+76;if(((x-192)/176)**2+((y-138)/57)**2<1){r(x,y,2,1,i%3?'#78ac64':'#afcc79')}}
  ctx.strokeStyle='#d8ba87';ctx.lineWidth=7;ctx.beginPath();ctx.ellipse(192,138,159,45,0,0,Math.PI*2);ctx.stroke();
  ctx.strokeStyle='#887e84';ctx.lineWidth=4;ctx.stroke();
  function tree(x,y){r(x-2,y-18,4,18,'#755440');oval(x,y-21,11,12,'#376e58');oval(x-2,y-25,9,8,'#569266');oval(x-5,y-27,4,3,'#89ba69')}
  tree(51,120);tree(316,105);tree(333,122);
  oval(130,111,29,6,'#61975c');r(108,87,43,23,'#f7dfac');r(144,86,7,23,'#d8b187');
  oval(129,87,26,13,'#a33c47');oval(127,84,24,11,'#ed7357');r(102,88,54,3,'#773c47');
  r(123,95,10,15,'#735548');r(111,95,7,7,'#73c5c8');r(137,95,7,7,'#73c5c8');
  r(72,118,24,7,'#b74349');r(77,113,13,6,'#e77b66');r(80,114,8,4,'#b9e5df');r(74,123,5,4,'#302945');r(88,123,5,4,'#302945');
  if(phase==='walk'){ctx.strokeStyle='#ffdf84';ctx.lineWidth=2;ctx.beginPath();ctx.ellipse(kai.x-12,kai.y+3,10+Math.sin(t*5),4,0,0,Math.PI*2);ctx.stroke()}
  function sprite(x,y,rows,palette,flip=false,down=false){
    ctx.save();ctx.translate(Math.round(x),Math.round(y));if(down)ctx.rotate(Math.PI/2);ctx.scale(flip?-1:1,1);
    rows.forEach((line,j)=>[...line].forEach((v,i)=>{if(palette[v])r(i-6,j-rows.length,1,1,palette[v])}));ctx.restore()
  }
  const sprites={
    hero:['..k..k.....','k.kk.kk..k.','.kkkkkkkkk.','..kkkkkkk..','.kkhkhhhk..','...hhkhh...','....hhh....','..oooobbo..','.ohhoooohh.','..hboooob..','...bbbbb...','...oo.oo...','...oo.oo...','..bbb.bbb..'],
    kai:['..k.....k..','...k...k...','...ttttt...','..ttttttt..','..kggkggk..','...ttttt...','..yyyyyyy..','.ydddddddy.','ttddyyddytt','.yddddddy..','..yyyyyyy..','...kk.kk...'],
    beerus:['..p.....p..','..pp...pp..','..pPp.pPp..','...ppppp...','..ppppppp..','..pypppyp..','....ppp....','...bbybb...','..pbbybbp..','..p.bbb.p..','....yyy....','...bbbbb...','...bb.bb...','...pp.pp...','..ppp.ppp..']};
  const pal={k:'#211e30',h:'#efb27d',o:'#f38235',b:'#274979',t:'#72c6c8',y:'#f5cb65',d:'#372e45',g:'#191924',p:'#ae7fc0',P:'#654776'};
  const actors=[[kai,'kai'],[hero,'hero']];
  if(world.arrived)actors.push([beerus,'beerus']);
  if(!world.broken)actors.push([post,'post']);
  actors.sort((a,b)=>a[0].y-b[0].y).forEach(([o,kind])=>{
    oval(o.x,o.y+1,6,2,'#5a8654');
    if(kind==='post'){r(o.x-2,o.y-18,4,18,'#855944');r(o.x-6,o.y-17,12,10,'#c58758');r(o.x-5,o.y-14,10,3,'#f2cc8b');return}
    const bob=kind==='hero'&&world.moving?Math.floor(t*12)%2:0;
    sprite(o.x,o.y-bob,sprites[kind],pal,kind==='hero'&&world.left,kind==='hero'&&world.ko)
  });
  if(shot){oval(shot.x,shot.y-8,5,3,'#81d9ff');oval(shot.x,shot.y-8,3,2,'#fffae2')}
  if(attack>0){let x=hero.x+(world.left?-8:8);r(x-2,hero.y-9,5,3,'#ffd18f')}
  if(phase==='windup'){ctx.strokeStyle='#ecc0fa';ctx.lineWidth=1;ctx.beginPath();ctx.arc(beerus.x,beerus.y-8,10+Math.sin(t*19)*3,0,Math.PI*2);ctx.stroke()}
  if(flash>0){ctx.fillStyle='rgba(245,228,255,'+Math.min(.8,flash*4)+')';ctx.fillRect(0,0,384,224)}
}
