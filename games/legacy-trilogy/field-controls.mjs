// Point-and-click field controls for the three USA cartridges.
// Memory layouts are read from the pinned mGBA MEM chunk.
const layouts = {
  ALGE: {player:0x030007b8, list:0x03000610, camera:0x03000608, dialog:0x030009cc},
  ALFE: {player:0x03001fa8, list:0x03001124, camera:0x0300109c, position:0x158},
  BG3E: {player:0x03001c34, list:0x03001bb0, camera:0x030019bc, position:0x1a0, dialog:0x03002a5c}
};
// Script callbacks that mark talkable people and inspectable objects (first game).
const talkers = new Set([0x080057a9]);
const things = new Set([0x08005d05]);

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
  const talking = layout.dialog ? view.getUint8(offset(layout.dialog)) !== 0 : false;
  const objects = [];
  let nearest, distance = Infinity;
  for (let i=0; i<count; i++) {
    const p = word(layout.list+4+4*i);
    if (!object(p) || p === player) continue;
    let found;
    if (first) {
      const c = word(p+0x3c);
      const at = {x:half(p+0x20)+8, y:half(p+0x22)+4};
      if (c >= 0x02013224 && c < 0x02030000 && !((c-0x02013224)%0x278)) {
        if (half(c+0x9a) === 2 && word(c+0x4c) > 0) found = {...at, kind:'enemy'};
      } else {
        const script = word(p+0x38) >>> 0;
        if (talkers.has(script)) found = {...at, kind:'talk'};
        else if (things.has(script)) found = {...at, kind:'use'};
      }
    } else {
      if (code === 'ALFE') {
        const type = word(p+0x180)-0x086d56ac;
        if (type < 0 || type >= 109*24 || type%24 || word(p+0x188) <= 0) continue;
      } else if (word(p+0x28c) <= 0) continue;
      found = {...position(p), kind:'enemy'};
    }
    if (!found) continue;
    found.id = p;
    objects.push(found);
    if (found.kind !== 'enemy') continue;
    const d = Math.hypot(found.x-hero.x, found.y-hero.y);
    if (d < distance) {nearest=found; distance=d;}
  }
  return {player, hero, camera, objects, nearest, distance, talking};
}

// GBA buttons as RetroPad IDs.
const A=8, UP=4, DOWN=5, LEFT=6, RIGHT=7;
const verbs = {enemy:'Attack', talk:'Talk-to', use:'Use', walk:'Walk here'};

export function attachControls(emu, code) {
  const manager = emu.gameManager;
  const canvas = emu.canvas;
  const clickMode = document.querySelector('#walk');
  const retaliate = document.querySelector('#battle');
  const held = new Set();
  // order: {kind, x, y, id?}; marker: where the click landed, drawn as an X.
  let order=null, marker=null, lastHero=null, nav=null, pulse=0;
  let latest=null;

  try {
    clickMode.checked = localStorage.getItem('trilogy.click') !== 'off';
    retaliate.checked = localStorage.getItem('trilogy.retaliate') === 'on';
  } catch { clickMode.checked = true; }
  clickMode.onchange = () => { stop(); remember('trilogy.click', clickMode.checked); };
  retaliate.onchange = () => { stop(); remember('trilogy.retaliate', retaliate.checked); };
  function remember(key, on) { try { localStorage.setItem(key, on ? 'on' : 'off'); } catch {} }

  function inputs(keys=[]) {
    for (const key of held) if (!keys.includes(key)) { manager.simulateInput(0,key,0); held.delete(key); }
    for (const key of keys) if (!held.has(key)) { manager.simulateInput(0,key,1); held.add(key); }
  }
  function stop() { order=null; marker=null; lastHero=null; nav=null; inputs(); }
  function busy() { return document.hidden || emu.paused || emu.settingsMenuOpen || emu.disksMenuOpen; }
  function field() { return readField(code, manager.getState()); }
  async function tap(key) { inputs(); manager.simulateInput(0,key,1); await new Promise(r=>setTimeout(r,70)); manager.simulateInput(0,key,0); }

  // ---------- overlay: hover label, click markers, target ring ----------
  const overlay = document.createElement('canvas');
  overlay.width = 240*4; overlay.height = 160*4;
  Object.assign(overlay.style, {position:'absolute', pointerEvents:'none', imageRendering:'pixelated', zIndex:5});
  canvas.parentElement.style.position ||= 'relative';
  canvas.parentElement.append(overlay);
  const g = overlay.getContext('2d');
  const label = document.createElement('div');
  Object.assign(label.style, {position:'fixed', zIndex:6, pointerEvents:'none', whiteSpace:'nowrap',
    font:'bold 15px system-ui', color:'#fff', textShadow:'1px 1px 0 #000, -1px 0 0 #000', display:'none'});
  canvas.parentElement.append(label);
  const menu = document.createElement('div');
  Object.assign(menu.style, {position:'fixed', zIndex:10, background:'#5d5447', border:'2px solid #2b2620',
    font:'14px system-ui', color:'#fff', minWidth:'130px', display:'none', boxShadow:'2px 2px 0 #0008'});
  document.body.append(menu);

  function frame() {
    const rect = canvas.getBoundingClientRect(), box = canvas.parentElement.getBoundingClientRect();
    const scale = Math.min(rect.width/240, rect.height/160);
    const left = rect.left + (rect.width-240*scale)/2, top = rect.top + (rect.height-160*scale)/2;
    return {scale, left, top, box};
  }
  function toGame(event) {
    const {scale,left,top} = frame();
    const x=(event.clientX-left)/scale, y=(event.clientY-top)/scale;
    return x<0 || x>=240 || y<0 || y>=160 ? null : {x,y};
  }
  // What is under a screen point: the closest enemy, person or object, else the ground.
  function pick(state, pt) {
    const wx = state.camera.x+pt.x, wy = state.camera.y+pt.y;
    let best=null, bestD=Infinity;
    for (const o of state.objects) {
      // Hit box: the sprite stands on its feet point and is about 24px tall.
      const dx = wx-o.x, dy = wy-(o.y-10);
      if (Math.abs(dx) > 11 || dy < -16 || dy > 14) continue;
      const d = Math.hypot(dx,dy);
      if (d < bestD) { best=o; bestD=d; }
    }
    return best ? {...best} : {kind:'walk', x:wx, y:wy};
  }

  function draw() {
    const {scale,left,top,box} = frame();
    Object.assign(overlay.style, {left:(left-box.left)+'px', top:(top-box.top)+'px',
      width:240*scale+'px', height:160*scale+'px'});
    g.clearRect(0,0,overlay.width,overlay.height);
    if (!latest || !clickMode.checked) return;
    const cam = latest.camera, k = 4;
    if (marker && performance.now() < marker.until) {
      const t = 1-(marker.until-performance.now())/600, s = (5-3*t)*k;
      const x=(marker.x-cam.x)*k, y=(marker.y-cam.y)*k;
      g.strokeStyle = marker.red ? '#ff2a2a' : '#ffe14d'; g.lineWidth = 2.5*k/2;
      g.beginPath(); g.moveTo(x-s,y-s); g.lineTo(x+s,y+s); g.moveTo(x+s,y-s); g.lineTo(x-s,y+s); g.stroke();
    }
    const target = order && order.id && latest.objects.find(o => o.id === order.id);
    if (target) {
      g.strokeStyle = order.kind==='enemy' ? '#ff2a2a' : '#ffe14d'; g.lineWidth = k/2;
      g.beginPath(); g.ellipse((target.x-cam.x)*k, (target.y-cam.y)*k, 9*k, 3.5*k, 0, 0, Math.PI*2); g.stroke();
    }
  }
  (function loop(){ draw(); requestAnimationFrame(loop); })();

  // ---------- giving orders ----------
  function give(o) {
    stop();
    order = {...o, until: performance.now() + (o.kind==='enemy' ? 30000 : 9000)};
    marker = {x:o.x, y:o.kind==='walk'?o.y:o.y-8, red:o.kind!=='walk', until:performance.now()+600};
  }
  canvas.addEventListener('pointermove', event => {
    if (!clickMode.checked || busy()) { label.style.display='none'; return; }
    const pt = toGame(event);
    latest = latest || field();
    if (!pt || !latest || latest.talking) { label.style.display='none'; canvas.style.cursor=''; return; }
    const hit = pick(latest, pt);
    label.textContent = verbs[hit.kind];
    label.style.color = hit.kind==='enemy' ? '#ffd23f' : '#fff';
    label.style.left = event.clientX+16+'px'; label.style.top = event.clientY+12+'px';
    label.style.display = 'block';
    canvas.style.cursor = hit.kind==='walk' ? 'crosshair' : 'pointer';
  });
  canvas.addEventListener('pointerleave', () => { label.style.display='none'; });
  canvas.addEventListener('pointerdown', event => {
    menu.style.display='none';
    if (!clickMode.checked || busy() || event.button !== 0) return;
    const state = field();
    const pt = toGame(event);
    if (!pt) return;
    event.preventDefault();
    // Not in the field, or a text box is open: a click continues, like the A button.
    if (!state || state.talking) { stop(); tap(A); return; }
    give(pick(state, pt));
  });
  canvas.addEventListener('contextmenu', event => {
    if (!clickMode.checked || busy()) return;
    // Our menu replaces the emulator's own right-click menu while point and click is on.
    event.preventDefault(); event.stopPropagation();
    const state = field(), pt = toGame(event);
    if (!state || !pt || state.talking) return;
    const hit = pick(state, pt), options = [];
    if (hit.kind !== 'walk') options.push([verbs[hit.kind], () => give(hit)]);
    options.push(['Walk here', () => give({kind:'walk', x:state.camera.x+pt.x, y:state.camera.y+pt.y})]);
    options.push(['Cancel', () => {}]);
    menu.replaceChildren();
    const head = document.createElement('div');
    head.textContent='Choose Option'; Object.assign(head.style,{padding:'3px 8px',background:'#000',color:'#5d5447',fontWeight:'bold'});
    menu.append(head);
    for (const [text, act] of options) {
      const row = document.createElement('div');
      row.textContent = text; row.style.padding='4px 8px'; row.style.cursor='pointer';
      if (text==='Attack') row.style.color='#ffd23f';
      row.onmouseenter=()=>row.style.background='#0004'; row.onmouseleave=()=>row.style.background='';
      row.onpointerdown = e => { e.stopPropagation(); e.preventDefault(); menu.style.display='none'; act(); };
      menu.append(row);
    }
    menu.style.left = event.clientX-20+'px'; menu.style.top = event.clientY-10+'px'; menu.style.display='block';
  });
  document.addEventListener('pointerdown', e => { if (!menu.contains(e.target)) menu.style.display='none'; });

  // ---------- movement ----------
  // Eight headings, clockwise from east (screen y points down).
  const DIRS = [[RIGHT],[RIGHT,DOWN],[DOWN],[DOWN,LEFT],[LEFT],[LEFT,UP],[UP],[UP,RIGHT]];
  const heading = (dx, dy) => Math.atan2(dy, dx) / (Math.PI/4);
  const gap = (a, b) => { const d = Math.abs(a-b) % 8; return Math.min(d, 8-d); };
  function steer(dx, dy, slack=3) {
    const keys = [];
    if (dx < -slack) keys.push(LEFT); else if (dx > slack) keys.push(RIGHT);
    if (dy < -slack) keys.push(UP); else if (dy > slack) keys.push(DOWN);
    return keys;
  }
  function face(dx, dy) { return Math.abs(dx) > Math.abs(dy) ? (dx<0?LEFT:RIGHT) : (dy<0?UP:DOWN); }

  function tick() {
    if (!order && !retaliate.checked) { latest = null; return; }
    if (busy()) { stop(); return; }
    const state = field();
    latest = state;
    if (!state) { stop(); return; }
    if (state.talking) { if (order && order.kind!=='walk') stop(); inputs(); return; }
    const {hero} = state;
    if (order && (performance.now() > order.until || (lastHero && Math.hypot(hero.x-lastHero.x, hero.y-lastHero.y) > 45))) { stop(); return; }

    // Retaliate: with no order, fight any enemy that comes close.
    if (!order && retaliate.checked && state.nearest && state.distance <= 44)
      order = {...state.nearest, until: performance.now()+30000, auto:true};
    if (!order) { inputs(); return; }

    // Follow a moving target by id.
    if (order.id) {
      const t = state.objects.find(o => o.id === order.id);
      if (!t) { stop(); return; }            // defeated or gone
      order.x = t.x; order.y = t.y;
    }
    const dx = order.x-hero.x, dy = order.y-hero.y, dist = Math.hypot(dx,dy);

    if (order.kind === 'enemy' && dist <= 18) {
      // Face the opponent, then tap A and release between punches.
      nav = null;
      pulse = (pulse+1)%4;
      inputs(pulse===1 ? [face(dx,dy)] : pulse===2 ? [A] : []);
      lastHero = hero; return;
    }
    if ((order.kind === 'talk' || order.kind === 'use') && dist <= 20) {
      const dir = face(dx,dy);
      order = null; inputs([dir]);
      setTimeout(() => { inputs(); if (!clickMode.checked) return; tap(A); }, 90);
      return;
    }
    if (order.kind === 'walk' && Math.abs(dx) <= 3 && Math.abs(dy) <= 3) { stop(); return; }

    // Walk straight at the goal. When blocked, follow the obstacle's edge
    // (always turning the same way) until the way toward the goal opens up.
    const moved = lastHero ? Math.hypot(hero.x-lastHero.x, hero.y-lastHero.y) : 1;
    lastHero = hero;
    nav ||= {follow:false, dir:0, side:1, stall:0, turns:0, ticks:0, best:dist, idle:0, flips:0};
    // Going around this way isn't working: follow the edge the other way instead.
    const flip = () => {
      if (++nav.flips > 3) return false;
      nav.side = -nav.side; nav.follow = true; nav.turns = 0; nav.idle = 0; nav.best = dist; nav.ticks = 0;
      nav.dir = (nav.dir + 4) % 8;
      return true;
    };
    if (dist < nav.best-1) { nav.best = dist; nav.idle = 0; }
    else if (++nav.idle > 60 && !flip()) { stop(); return; }
    nav.stall = moved < 0.4 ? nav.stall+1 : 0;
    const exact = heading(dx, dy), goal = ((Math.round(exact) % 8) + 8) % 8;
    if (!nav.follow) {
      if (nav.stall < 3) { inputs(steer(dx, dy, order.kind==='walk' ? 2 : 4)); return; }
      const lean = exact - Math.round(exact);
      if (!nav.flips) nav.side = lean >= 0 ? 1 : -1;
      nav = {...nav, follow:true, stall:0, turns:0, ticks:0};
      nav.dir = (goal + nav.side + 8) % 8;
    } else {
      nav.ticks++;
      if (nav.stall >= 3) {
        nav.dir = (nav.dir + nav.side + 8) % 8; nav.stall = 0;
        if (++nav.turns > 10 && !flip()) { stop(); return; }   // boxed in
      } else if (nav.ticks % 6 === 0) {
        // Try leaning back toward the goal.
        const back = (nav.dir - nav.side + 8) % 8;
        if (gap(back, goal) < gap(nav.dir, goal)) nav.dir = back;
        if (nav.dir === goal) { nav.follow = false; nav.turns = 0; }
      }
    }
    inputs(DIRS[nav.dir]);
  }
  const timer = setInterval(tick, 50);
  function suspend() { stop(); }
  document.addEventListener('keydown', suspend, true);
  window.addEventListener('blur', suspend);
  document.addEventListener('visibilitychange', () => { if (document.hidden) suspend(); });
  window.addEventListener('pagehide', () => { clearInterval(timer); suspend(); menu.remove(); }, {once:true});
}
