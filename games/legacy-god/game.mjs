import {installScene} from './cartridge.mjs';

// The standalone source and arcade deployment share the trilogy's pinned core.
const runtime = location.pathname.includes('/games/legacy-god/') ?
  new URL('../legacy-trilogy/',location.href) : new URL('https://lilpit23.github.io/arcade/games/legacy-trilogy/');
const [{chapters,chapterImage},{patchRom},{trilogyControls},{attachControls}] = await Promise.all(
  ['bridge','romhack','keyboard','field-controls'].map(name=>import(new URL(name+'.mjs',runtime))));
const $=id=>document.getElementById(id);
const req=r=>new Promise((resolve,reject)=>{r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});
let db, cartridge, manager, mailbox, entry, phase=0, tick, url, bootTicks=0;
const words={
  1:['King Kai','Goku! You left two boot prints in my lawn. Come over by the house. We’ll work on your footing.'],
  5:['King Kai','That pressure… Goku, put your hands down! Lord Beerus, what brings you to my planet?'],
  6:['Beerus','So this is the Saiyan who defeated Frieza. Come, then. Show me one good attack.'],
  8:['Beerus','My turn.'],
  9:['King Kai','Goku! …Still breathing. One tap, and he’s out cold.']
};
const goals={2:'Walk to King Kai beside the round house.',3:'Practice a punch with Numpad 4.',4:'Hold Numpad 6 to charge a ki blast, then release.',7:'Face Beerus. Get close and punch, or aim a ki blast at him.'};
function display(n){
  phase=n;$('loading').hidden=true;$('dialog').hidden=!words[n];$('objective').textContent=goals[n]||'';
  if(words[n]){[$('speaker').textContent,$('line').textContent]=words[n];$('advance').textContent=[1,5,6].includes(n)?'A ▸':''}
  $('replay').hidden=n!==9;
}
function tapA(){if (![1,5,6].includes(phase))return;manager.simulateInput(0,8,1);setTimeout(()=>manager.simulateInput(0,8,0),75)}
$('dialog').onclick=tapA;
$('replay').onclick=()=>{manager.loadState(entry);manager.toggleMainLoop(1);display(1);window.EJS_emulator.elements.parent.focus()};
function poll(){
  const address=mailbox.iwram(0x1230);
  const n=address===null ? manager.getState()[0x19010+0x1230] : manager.Module.HEAPU8[address];
  if(!phase && !n){
    // Select New Game in the native title screens before revealing the field.
    const step=bootTicks++%4;
    manager.simulateInput(0,3,step===0?1:0);
    manager.simulateInput(0,8,step===2?1:0);
    return;
  }
  if(n<1||n>9||n===phase)return;
  if(!phase){
    manager.toggleFastForward(false);manager.simulateInput(0,3,0);manager.simulateInput(0,8,0);
    entry=manager.getState();
  }
  display(n);
  if(n===9)setTimeout(()=>{if(phase===9)manager.toggleMainLoop(0)},180);
}
function error(e){$('library').hidden=false;$('status').textContent=e.message||String(e);$('play').hidden=true}
async function start(){
  $('start').disabled=true;
  try{
    const rom=await patchRom('ALGE',chapterImage(0,cartridge));
    if(!rom.hacked)throw Error('Could not load the field controls. Reload to try again.');
    const response=await fetch(new URL('./cartridge/scene.bin',import.meta.url));
    if(!response.ok)throw Error('Could not load the opening scene.');
    const bytes=installScene(rom.bytes,new Uint8Array(await response.arrayBuffer()));
    url=URL.createObjectURL(new Blob([bytes]));
    $('library').hidden=true;$('play').hidden=false;
    Object.assign(window,{EJS_player:'#game',EJS_core:'mgba',EJS_gameName:'Legacy-GOD-Opening',
      EJS_gameUrl:url,EJS_pathtodata:new URL('engine/',runtime).href,EJS_startOnLoaded:true,EJS_threads:false,
      EJS_DEBUG_XX:true,EJS_disableDatabases:true,EJS_disableAutoLang:true,EJS_defaultControls:trilogyControls('ALGE'),
      EJS_onGameStart:()=>{
        const emu=window.EJS_emulator;manager=emu.gameManager;
        mailbox=attachControls(emu,'ALGE',true);
        $('interact').checked=false;$('battle').checked=false;
        manager.setFastForwardRatio(8);manager.toggleFastForward(true);tick=setInterval(poll,55);
      }});
    const loader=document.createElement('script');loader.src=new URL('engine/loader.js',runtime);loader.onerror=()=>error(Error('Could not load the GBA player.'));document.body.append(loader);
  }catch(e){error(e);$('start').disabled=false}
}
$('start').onclick=start;
function ready(){ $('file').hidden=true;$('start').hidden=false;$('status').textContent='The Legacy of Goku cartridge is ready.' }
$('file').onchange=async()=>{
  try{
    const file=$('file').files[0];if(!file)return;
    const buf=await file.arrayBuffer(),digest=await crypto.subtle.digest('SHA-256',buf);
    if(Array.from(new Uint8Array(digest),v=>v.toString(16).padStart(2,'0')).join('')!==chapters[0].hash)throw Error('Choose the USA release of The Legacy of Goku.');
    if(db){const tx=db.transaction('campaign','readwrite');await req(tx.objectStore('campaign').put(buf,'ALGE'))}
    cartridge=buf;ready();
  }catch(e){error(e);$('file').value=''}
};
try{
  const open=indexedDB.open('lilpit-legacy-trilogy-v1',1);
  open.onupgradeneeded=()=>open.result.createObjectStore('campaign');
  db=await req(open);cartridge=await req(db.transaction('campaign').objectStore('campaign').get('ALGE'));
}catch{}
if(cartridge)ready();else{$('file').hidden=false;$('status').textContent='Choose your USA Legacy of Goku .gba file to play on the original field engine.'}
window.addEventListener('pagehide',()=>{clearInterval(tick);if(url)URL.revokeObjectURL(url)});
