// Point-and-click field controls for the three USA cartridges.
// Memory layouts are read from the pinned mGBA MEM chunk.
const layouts = {
  ALGE: {player:0x030007b8, list:0x03000610, camera:0x03000608, dialog:[0x030009cc,0x03003b60]},
  ALFE: {player:0x03001fa8, list:0x03001124, camera:0x0300109c, position:0x158},
  BG3E: {player:0x03001c34, list:0x03001bb0, camera:0x030019bc, position:0x1a0, dialog:[0x03002a5c]}
};
// The game's own Text Speed option (first game: Low 0, Medium 1, High 2).
const textSpeed = {ALGE: {address:0x03000020, fastest:2}};
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
  // A text box (conversation, sign, item description) or menu is open.
  const talking = (layout.dialog || []).some(a => view.getUint8(offset(a)) !== 0);
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
        // Anything else placed on the map (people, items, signs) can be pressed with A.
        const script = word(p+0x38) >>> 0;
        if (talkers.has(script)) found = {...at, kind:'talk'};
        else if (things.has(script) || half(p+0x20) || half(p+0x22)) found = {...at, kind:'use'};
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
const A=8, B=0, SELECT=2, START=3, UP=4, DOWN=5, LEFT=6, RIGHT=7, L=10, R=11;
// Keyboard: WASD or arrows to move, several choices for each button so any keyboard works.
const aliases = {Space:A, KeyJ:A, KeyZ:A, KeyK:B, KeyX:B, Enter:START, KeyU:L, KeyI:R,
  ArrowUp:UP, ArrowDown:DOWN, ArrowLeft:LEFT, ArrowRight:RIGHT};
const gbaButtons = [A,B,SELECT,START,UP,DOWN,LEFT,RIGHT,L,R];
const FEET = 8;   // a sprite's feet sit about this far below the middle of its body
const verbs = {enemy:'Attack', talk:'Talk-to', use:'Use', walk:'Walk here'};

// The point-and-click ROM hack keeps a mailbox in IWRAM (see romhack/src).
// The page writes a click into it; the game walks, talks and fights by itself.
const MAGIC = 0x31434e50, BOX = {seq:0, kind:1, tx:4, ty:6, target:8, seen:12, active:13, magic:0x24, frame:0x2c, result:0x2e};
const KIND = {walk:1, talk:2, use:2, enemy:3};

function romMailbox(manager) {
  let at = null, frame = -1, tries = 0;
  const heap = () => manager.Module.HEAPU8;
  // Find the mailbox in the emulator's memory by its marker, then make sure it is
  // the live copy (its frame counter moves), not the marker inside the ROM itself.
  function find() {
    const h = heap(), words = new Uint32Array(h.buffer, 0, h.length >> 2), found = [];
    for (let i = 0; i < words.length; i++) if (words[i] === MAGIC) found.push(i*4 - BOX.magic);
    return found;
  }
  let candidates = [];
  function locate() {
    if (at !== null) return at;
    const h = heap();
    if (!candidates.length) { if (++tries > 40) return null; candidates = find().map(c => [c, h[c+BOX.frame] | h[c+BOX.frame+1]<<8]); return null; }
    const live = candidates.find(([c, f]) => (h[c+BOX.frame] | h[c+BOX.frame+1]<<8) !== f);
    candidates = [];
    if (live) at = live[0];
    return at;
  }
  return {
    ready: () => locate() !== null,
    gaveUp: () => tries > 40,
    send(kind, x=0, y=0, target=0) {
      const h = heap(), b = locate(); if (b === null) return false;
      const v = new DataView(h.buffer, b, 16);
      v.setInt16(BOX.tx, Math.round(x), true); v.setInt16(BOX.ty, Math.round(y), true);
      v.setUint32(BOX.target, target >>> 0, true); h[b+BOX.kind] = kind;
      h[b+BOX.seq] = (h[b+BOX.seq] + 1) & 255;
      return true;
    },
    // Still carrying out the last click?
    busy() { const h = heap(), b = locate(); return b !== null && (h[b+BOX.active] || h[b+BOX.seq] !== h[b+BOX.seen]); },
    iwram(offset) { const b = locate(); return b === null ? null : b - 0x1000 + offset; },
  };
}

export function attachControls(emu, code, hacked=false) {
  const manager = emu.gameManager;
  const rom = hacked ? romMailbox(manager) : null;
  const romReady = () => rom && rom.ready();
  // Find the mailbox right away, so the very first click already goes to the game.
  if (rom) { const look = setInterval(() => { if (rom.ready() || rom.gaveUp()) clearInterval(look); }, 150); }
  const canvas = emu.canvas;
  const clickMode = document.querySelector('#walk');
  const retaliate = document.querySelector('#battle');
  const interact = document.querySelector('#interact');
  const autoSprint = document.querySelector('#sprint');
  const held = new Set();
  // Without a known text-box flag (second game), guess from a click that can't move the hero.
  const guessText = !layouts[code]?.dialog;
  // order: {kind, x, y, id?}; marker: where the click landed, drawn as an X.
  let order=null, marker=null, lastHero=null, nav=null, pulse=0;
  let latest=null, stuck=null, startUsed=false;   // the first click on a title screen presses Start

  // The emulator only reads keys while its own game area has focus, which is easy to
  // lose (clicking a checkbox, the page around the game). Read the keyboard for the
  // whole player instead, and let the campaign page forward keys pressed outside it.
  const keys = emu.elements.parent;
  const focusGame = () => { if (document.activeElement !== keys) keys.focus({preventScroll:true}); };
  focusGame();
  const down = new Map();
  let clickDirections = [];
  const shifts = new Set();
  const moving = () => [...down.values(), ...clickDirections].filter(k => k >= UP && k <= RIGHT);
  let dashTimer, dashButton;
  const send = (button, on) => manager.simulateInput(0, button, on ? 1 : 0);

  // The first chapter has one ground-walk speed in sixteenths of a pixel.
  // Mark our override in a spare mailbox byte so a restored checkpoint can
  // undo it even when it was saved in the middle of a sprint.
  function groundSpeed(on) {
    const speed = rom?.iwram(0x7b2);
    if (speed == null) return;
    const ram = manager.Module.HEAPU8;
    const mark = rom.iwram(0x1002);
    if (on && !ram[mark] && ram[speed] === 16 && !ram[rom.iwram(0x7dc)]) {
      ram[speed] = 32;
      ram[mark] = 1;
    } else if (!on && ram[mark] === 1) {
      if (ram[speed] === 32) ram[speed] = 16;
      ram[mark] = 0;
    }
  }
  function updateSprint(alreadyWalking=false) {
    clearTimeout(dashTimer);
    const previous = dashButton;
    dashButton = null;
    const dirs = moving();
    const button = dirs.at(-1);
    const sprint = (autoSprint.checked || shifts.size > 0) && button !== undefined && !busy();
    if (code === 'ALGE') { groundSpeed(sprint); return; }
    if (previous !== null && previous !== undefined && dirs.includes(previous)) send(previous,true);
    if (button === undefined || busy()) return;
    // II and Buu use a directional double-tap to enter their native dash.
    // Release once more on Shift-up to return to walking with the key held.
    if (!sprint && previous !== button) return;
    dashButton = sprint ? button : null;
    const resume = () => { if (!busy() && moving().includes(button)) send(button,true); };
    if (sprint) {
      const scene = field();
      if (!scene || scene.talking) { dashButton = null; return; }
      const firstTap = () => {
        if (busy() || !moving().includes(button)) return;
        send(button,true);
        dashTimer = setTimeout(() => {
          send(button,false);
          dashTimer = setTimeout(resume,50);
        },50);
      };
      if (alreadyWalking) { send(button,false); dashTimer = setTimeout(firstTap,50); }
      else firstTap();
    } else {
      send(button,false);
      dashTimer = setTimeout(resume,50);
    }
  }
  function key(e, pressed) {
    if (pressed && (busy() || e.ctrlKey || e.metaKey || e.altKey)) return false;
    const name = e.code || e.key;
    if (pressed && (e.target?.isContentEditable || e.target?.closest?.('textarea,select,input:not([type=checkbox])') ||
        (e.target?.closest?.('button,input[type=checkbox],a') && ['Space','Enter'].includes(name)))) return false;
    const num = /^Numpad([0-9])$/.exec(name);
    const keyCode = num ? 96 + Number(num[1]) : e.keyCode;
    const controls = emu.controls[0];
    const assigned = Object.keys(controls).find(id => controls[id]?.value === keyCode);
    if (e.key === 'Shift' && (shifts.has(name) || assigned === undefined)) {
      if (shifts.has(name) !== pressed) {
        if (pressed) shifts.add(name); else shifts.delete(name);
        updateSprint(true);
      }
      return true;
    }
    if (pressed && down.has(name)) return true;
    let button = down.get(name);
    if (pressed) {
      // Give configured bindings (including emulator shortcuts) priority over aliases.
      button = assigned === undefined ? aliases[name] : Number(assigned);
      if (!gbaButtons.includes(button)) return false;
      if (assigned === undefined && controls[button]?.value !== emu.defaultControllers[0][button]?.value) return false;
      if (button === START) startUsed = true;
      stop();
      down.set(name, button);
    } else {
      if (button === undefined) return false;
      down.delete(name);
    }
    send(button, pressed || [...down.values()].includes(button));
    if (button >= UP && button <= RIGHT) updateSprint();
    return true;
  }
  const onKey = pressed => e => { if (key(e, pressed)) { e.preventDefault(); e.stopPropagation(); } };
  window.addEventListener('keydown', onKey(true), true);
  window.addEventListener('keyup', onKey(false), true);
  window.trilogyKey = (e, pressed) => key(e, pressed);
  // Let go of everything if the window loses focus mid-press.
  function releaseKeyboard() {
    clearTimeout(dashTimer); dashButton = null; shifts.clear();
    for (const button of down.values()) send(button,false);
    down.clear();
    if (romReady()) groundSpeed(false);
  }
  window.addEventListener('blur', releaseKeyboard);
  window.parent.addEventListener('blur', releaseKeyboard);
  window.addEventListener('pagehide', () => {
    releaseKeyboard();
    window.parent.removeEventListener('blur',releaseKeyboard);
  }, {once:true});

  document.querySelector('#controls').hidden = false;
  // Point and click and auto-interact start on every time a chapter opens.
  clickMode.checked = true;
  interact.checked = true;
  try { retaliate.checked = localStorage.getItem('trilogy.retaliate') === 'on'; } catch {}
  try { autoSprint.checked = localStorage.getItem('trilogy.autoSprint') === 'on'; } catch {}
  autoSprint.onchange = () => {
    remember('trilogy.autoSprint', autoSprint.checked);
    updateSprint(true);
    focusGame();
  };
  clickMode.onchange = () => stop();
  interact.onchange = () => stop();
  retaliate.onchange = () => { stop(); remember('trilogy.retaliate', retaliate.checked); };
  function remember(key, on) { try { localStorage.setItem(key, on ? 'on' : 'off'); } catch {} }

  function inputs(keys=[], travel=false) {
    const directions = travel ? keys.filter(k => k >= UP && k <= RIGHT) : [];
    for (const key of held) if (!keys.includes(key)) { if (![...down.values()].includes(key)) send(key,false); held.delete(key); }
    for (const key of keys) if (!held.has(key)) { manager.simulateInput(0,key,1); held.add(key); }
    if (directions.join() !== clickDirections.join()) {
      clickDirections = directions;
      updateSprint();
    }
  }
  let act = 0;   // bumped by every new order, so a pending A press is cancelled
  function stop() {
    if (romReady() && order) rom.send(0);
    order=null; marker=null; lastHero=null; nav=null; act++; inputs();
  }
  function arrive(dirs) { stop(); if (interact.checked) press(dirs); }
  // Walked onto open ground: just stop, no button press.
  function busy() { return document.hidden || emu.paused || emu.settingsMenuOpen || emu.disksMenuOpen || emu.isPopupOpen(); }
  function field() { const s = readField(code, manager.getState()); if (s) startUsed = true; return s; }
  const wait = ms => new Promise(r => setTimeout(r, ms));
  async function tap(key, ms=70) { inputs(); manager.simulateInput(0,key,1); await wait(ms); if (![...down.values()].includes(key)) send(key,false); }
  // Settle, turn toward the target, then press A: talks, opens, picks up or reads what
  // is there. If no text box opens, try again facing along the other axis (someone
  // standing diagonally). Any new click or key press cancels it.
  async function press(dirs) {
    const id = act;
    for (const dir of dirs) {
      await wait(120); if (id !== act) return;
      inputs([dir]); await wait(130); if (id !== act) return; inputs(); await wait(70);
      if (id !== act || !clickMode.checked) return;
      await tap(A, 110); await wait(450);
      if (id !== act || !layouts[code].dialog) return;
      const s = field();
      if (!s || s.talking) return;
    }
  }

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
    // Walk so your feet land where you clicked: a click on someone's body aims at where they stand.
    return best ? {...best} : {kind:'walk', x:wx, y:wy+FEET};
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
    marker = {x:o.x, y:o.kind==='walk'?o.y-FEET:o.y-8, red:o.kind!=='walk', until:performance.now()+600};
    if (romReady()) {
      if (o.kind !== 'walk' && !interact.checked) rom.send(KIND.walk, o.x, o.y+FEET);
      else rom.send(KIND[o.kind], o.x, o.y, o.id || 0);
      order.rom = true; order.sentAt = performance.now();
    }
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
    focusGame();
    menu.style.display='none';
    if (!clickMode.checked || busy() || event.button !== 0) return;
    const state = field();
    const pt = toGame(event);
    if (!pt) return;
    event.preventDefault();
    // The very first click gets past "Press Start". After that, outside the field
    // (menus, story text) or with a text box open, a click presses A.
    if (!state && !startUsed) { startUsed = true; stop(); tap(START); return; }
    if (!state || state.talking) { stop(); tap(A); return; }
    const hit = pick(state, pt);
    // The last walk click, just now, went nowhere: probably a screen the hero can't move
    // in (story text), so this click continues instead. It only covers one click, so a
    // hero blocked by a wall is never locked out of walking.
    const now = performance.now();
    if (guessText && hit.kind === 'walk' && stuck && now - stuck.time < 2000 &&
        stuck.x === state.hero.x && stuck.y === state.hero.y) { stuck = null; stop(); tap(A); return; }
    stuck = hit.kind === 'walk' ? {...state.hero, time:now} : null;
    give(hit);
  });
  canvas.addEventListener('contextmenu', event => {
    if (!clickMode.checked || busy()) return;
    // Our menu replaces the emulator's own right-click menu while point and click is on.
    event.preventDefault(); event.stopPropagation();
    const state = field(), pt = toGame(event);
    if (!state || !pt || state.talking) return;
    const hit = pick(state, pt), options = [];
    if (hit.kind !== 'walk') options.push([verbs[hit.kind], () => give(hit)]);
    options.push(['Walk here', () => give({kind:'walk', x:state.camera.x+pt.x, y:state.camera.y+pt.y+FEET})]);
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
  // Hold a direction until that axis is lined up, and only start a new one once it's
  // clearly off, so the hero walks in long straight or diagonal lines, not a zigzag.
  function steer(dx, dy, slack=3) {
    const keys = [];
    const axis = (d, minus, plus) => {
      const k = d < 0 ? minus : plus;
      if (Math.abs(d) > (held.has(k) ? 1 : slack + 3)) keys.push(k);
    };
    axis(dx, LEFT, RIGHT); axis(dy, UP, DOWN);
    return keys;
  }
  function face(dx, dy) { return Math.abs(dx) > Math.abs(dy) ? (dx<0?LEFT:RIGHT) : (dy<0?UP:DOWN); }
  // Both ways to face something: the main axis first, then the other one.
  function faces(dx, dy) { const h = dx<0?LEFT:RIGHT, v = dy<0?UP:DOWN; return Math.abs(dx) > Math.abs(dy) ? [h,v] : [v,h]; }

  function tick() {
    if (busy() && (down.size || shifts.size)) releaseKeyboard();
    if (romReady()) groundSpeed((autoSprint.checked || shifts.size > 0) && (moving().length > 0 || (order?.rom && rom.busy())) && !busy());
    if (!order && !retaliate.checked) { latest = null; return; }
    if (busy()) { stop(); return; }
    const state = field();
    latest = state;
    if (!state) { stop(); return; }
    if (state.talking) { if (order && order.kind!=='walk') stop(); inputs(); return; }
    if (romReady()) {
      // The patched game walks, talks and fights; just keep the target ring up to date.
      if (order && order.rom && performance.now() - order.sentAt > 100 && !rom.busy()) { order = null; marker = marker; }
      if (!order && retaliate.checked && state.nearest && state.distance <= 44) give(state.nearest);
      return;
    }
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
      stop(); press(faces(dx,dy));
      return;
    }
    if (dist > 4) order.face = face(dx,dy);
    if (order.kind === 'walk' && Math.abs(dx) <= 3 && Math.abs(dy) <= 3) { stop(); return; }

    // Walk straight at the goal. When blocked, follow the obstacle's edge
    // (always turning the same way) until the way toward the goal opens up.
    const moved = lastHero ? Math.hypot(hero.x-lastHero.x, hero.y-lastHero.y) : 1;
    lastHero = hero;
    nav ||= {follow:false, dir:0, side:1, stall:0, turns:0, ticks:0, best:dist, idle:0, flips:0, from:hero, age:0};
    // A click that can't move you at all (story text, a menu, a box the game hides
    // from us) presses A instead, like clicking through text.
    if (++nav.age === 7 && guessText && order.kind === 'walk' && hero.x === nav.from.x && hero.y === nav.from.y) {
      stop(); tap(A); return;
    }
    // Going around this way isn't working: follow the edge the other way instead.
    const exact = heading(dx, dy), goal = ((Math.round(exact) % 8) + 8) % 8;
    const flip = () => {
      if (++nav.flips > 3) return false;
      nav.side = -nav.side; nav.follow = true; nav.turns = 0; nav.idle = 0; nav.best = dist; nav.ticks = 0;
      nav.dir = (goal + nav.side + 8) % 8;
      return true;
    };
    // Gave up close to the spot: something is probably standing there, so press A on it.
    const giveUp = () => { if (order.kind === 'walk' && dist <= 20) arrive(faces(dx,dy)); else stop(); };
    if (dist < nav.best-1) { nav.best = dist; nav.idle = 0; }
    else if (++nav.idle > 60 && !flip()) { giveUp(); return; }
    nav.stall = moved < 0.4 ? nav.stall+1 : 0;
    if (!nav.follow) {
      if (nav.stall < 3) { inputs(steer(dx, dy, order.kind==='walk' ? 2 : 4), true); return; }
      // Bumped into something right where you clicked (a person, chest or sign): use it.
      if (order.kind === 'walk' && dist <= 20) { arrive(faces(dx,dy)); return; }
      const lean = exact - Math.round(exact);
      if (!nav.flips) nav.side = lean >= 0 ? 1 : -1;
      nav = {...nav, follow:true, stall:0, turns:0, ticks:0, start:dist};
      nav.dir = (goal + nav.side + 8) % 8;
    } else {
      nav.ticks++;
      if (nav.stall >= 3) {
        nav.dir = (nav.dir + nav.side + 8) % 8; nav.stall = 0;
        // This side would lead well away from the goal before getting anywhere: try the other side.
        if (gap(nav.dir, goal) >= 3 && nav.best >= nav.start-1 && nav.flips === 0) flip();
        else if (++nav.turns > 10 && !flip()) { giveUp(); return; }   // boxed in
      } else if (nav.ticks % 6 === 0) {
        // Try leaning back toward the goal.
        const back = (nav.dir - nav.side + 8) % 8;
        if (gap(back, goal) < gap(nav.dir, goal)) nav.dir = back;
        if (nav.dir === goal) { nav.follow = false; nav.turns = 0; }
      }
    }
    inputs(DIRS[nav.dir], true);
  }
  const timer = setInterval(tick, 50);

  // Keep the game's Text Speed option on its fastest setting. The emulator has no
  // single-byte write, so patch a save state and load it back, only when needed.
  const speed = !hacked && textSpeed[code];
  let speedWrites = 0;
  const speedTimer = speed && setInterval(() => {
    if (busy() || speedWrites >= 6) return;
    const state = manager.getState();
    const view = new DataView(state.buffer, state.byteOffset, state.byteLength);
    if (state.length < 0x61010 || view.getUint32(0) !== 0x52415354 || view.getUint32(8) !== 0x4d454d20 ||
        view.getUint32(16,true) !== 0x01000007) return;
    const at = speed.address - 0x03000000 + 0x19010;
    if (state[at] === speed.fastest) return;
    state[at] = speed.fastest;
    speedWrites++;
    manager.loadState(state);
  }, 1000);
  function suspend() { stop(); }
  window.addEventListener('blur', suspend);
  document.addEventListener('visibilitychange', () => { if (document.hidden) { releaseKeyboard(); suspend(); } });
  window.addEventListener('pagehide', () => { clearInterval(timer); clearInterval(speedTimer); suspend(); menu.remove(); }, {once:true});
  return rom;
}
