// Field layouts for the three USA cartridges, in the pinned mGBA MEM chunk.
const layouts = {
  ALGE: {player:0x030007b8, list:0x03000610, camera:0x03000608},
  ALFE: {player:0x03001fa8, list:0x03001124, camera:0x0300109c, position:0x158},
  BG3E: {player:0x03001c34, list:0x03001bb0, camera:0x030019bc, position:0x1a0}
};

export function readField(code, bytes) {
  const layout = layouts[code];
  if (!layout || bytes.length < 0x61010) return;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(0) !== 0x52415354 || view.getUint32(8) !== 0x4d454d20 ||
      view.getUint32(16,true) !== 0x01000007) return;
  const offset = a => a >= 0x03000000 ? a - 0x03000000 + 0x19010 : a - 0x02000000 + 0x21010;
  const word = a => view.getInt32(offset(a),true);
  const half = a => view.getInt16(offset(a),true);
  const object = a => a >= 0x02000000 && a <= 0x0203fd00 && a % 4 === 0;
  const player = word(layout.player);
  if (!object(player)) return;
  const first = code === 'ALGE';
  const position = p => ({
    x:word(p + layout.position) / 256, y:word(p + layout.position + 4) / 256
  });
  const hero = first ? {x:(half(0x030007c0) >> 4)+8, y:(half(0x030007c2) >> 4)+4} : position(player);
  const camera = first ? {x:half(layout.camera), y:half(layout.camera+2)} :
    {x:word(layout.camera), y:word(layout.camera+4)};
  const count = word(layout.list);
  if (count < 0 || count > 256) return;
  let nearest, distance = Infinity;
  for (let i=0; i<count; i++) {
    const p = word(layout.list+4+4*i);
    if (!object(p) || p === player) continue;
    let enemy;
    if (first) {
      const c = word(p+0x3c);
      if (c < 0x02013224 || c >= 0x02030000 || (c-0x02013224)%0x278 ||
          half(c+0x9a) !== 2 || word(c+0x4c) <= 0) continue;
      enemy = {x:half(p+0x20), y:half(p+0x22)};
    } else {
      if (code === 'ALFE') {
        const type = word(p+0x180)-0x086d56ac;
        if (type < 0 || type >= 109*24 || type%24 || word(p+0x188) <= 0) continue;
      } else if (word(p+0x28c) <= 0) continue;
      enemy = position(p);
    }
    const d = Math.hypot(enemy.x-hero.x, enemy.y-hero.y);
    if (d < distance) {nearest=enemy; distance=d;}
  }
  return {player, hero, camera, nearest, distance};
}

export function attachControls(emu, code) {
  const manager = emu.gameManager;
  const clickMode = document.querySelector('#walk');
  const battle = document.querySelector('#battle');
  const held = new Set();
  let goal, lastHero, stalled=0, pulse=0;
  function inputs(keys=[]) {
    for (const key of held) if (!keys.includes(key)) {
      manager.simulateInput(0,key,0);
      held.delete(key);
    }
    for (const key of keys) if (!held.has(key)) {
      manager.simulateInput(0,key,1);
      held.add(key);
    }
  }
  function stop() {goal=null; lastHero=null; stalled=0; inputs();}
  function suspend() {stop(); battle.checked=false;}
  function busy() {return document.hidden || emu.paused || emu.settingsMenuOpen || emu.disksMenuOpen;}
  function field() {return readField(code,manager.getState());}
  document.querySelector('#controls').hidden=false;
  emu.canvas.addEventListener('pointerdown',event=>{
    if (!clickMode.checked || busy() || event.button !== 0) return;
    const state=field();
    if (!state) return;
    const rect=emu.canvas.getBoundingClientRect();
    const scale=Math.min(rect.width/240,rect.height/160);
    const x=(event.clientX-rect.left-rect.width/2)/scale+120;
    const y=(event.clientY-rect.top-rect.height/2)/scale+80;
    if (x<0 || x>=240 || y<0 || y>=160) return;
    stop();
    goal={x:state.camera.x+x,y:state.camera.y+y,player:state.player,until:performance.now()+6000};
    event.preventDefault();
  });
  function tick() {
    if (!goal && !battle.checked) return;
    if (busy()) {suspend(); return;}
    const state=field();
    if (!state) {stop(); return;}
    const {hero,nearest,distance}=state;
    if (goal && (goal.player!==state.player || performance.now()>goal.until ||
        (lastHero && Math.hypot(hero.x-lastHero.x,hero.y-lastHero.y)>45))) {stop(); return;}
    if (goal && lastHero && Math.hypot(hero.x-lastHero.x,hero.y-lastHero.y)<0.5) stalled++;
    else stalled=0;
    lastHero=hero;
    if (goal && stalled>=8) {stop(); return;}
    const target=goal || (battle.checked && distance<=44 && nearest);
    if (!target) {inputs(); return;}
    const dx=target.x-hero.x, dy=target.y-hero.y;
    const direction=Math.abs(dx)>Math.abs(dy) ? (dx<0?6:7) : (dy<0?4:5);
    if (goal && Math.abs(dx)<=5 && Math.abs(dy)<=5) {stop(); return;}
    if (!goal && distance<=18) {
      // Briefly face the opponent, then tap A and release between punches.
      pulse=(pulse+1)%4;
      inputs(pulse===1 ? [direction] : pulse===2 ? [8] : []);
    } else inputs([direction]);
  }
  const timer=setInterval(tick,65);
  battle.onchange=stop;
  clickMode.onchange=stop;
  document.addEventListener('keydown',suspend,true);
  window.addEventListener('blur',suspend);
  document.addEventListener('visibilitychange',()=>{if(document.hidden) suspend();});
  window.addEventListener('pagehide',()=>{clearInterval(timer); suspend();},{once:true});
}
