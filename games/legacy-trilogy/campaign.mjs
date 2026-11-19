import {chapters, chapterImage, atHandoff} from './bridge.mjs';

const library=document.querySelector('#library');
const files=document.querySelector('#files');
const play=document.querySelector('#play');
const pause=document.querySelector('#pause');
const frame=document.querySelector('#chapter-screen');
const message=document.querySelector('#message');
let database, checkpoint, manager, timer, releaseSession, pending=false;

function request(req) {
  return new Promise((resolve,reject)=>{
    req.onsuccess=()=>resolve(req.result);
    req.onerror=()=>reject(req.error);
  });
}
function read(key) {
  return request(database.transaction('campaign').objectStore('campaign').get(key));
}
function write(key,value) {
  return new Promise((resolve,reject)=>{
    const tx=database.transaction('campaign','readwrite');
    tx.oncomplete=resolve;
    tx.onabort=()=>reject(tx.error);
    tx.objectStore('campaign').put(value,key);
  });
}
function notice(error) {
  message.textContent=error instanceof Error ? error.message : String(error);
}

async function showLibrary() {
  clearInterval(timer);
  manager=null;
  if (releaseSession) {releaseSession();releaseSession=null;}
  window.trilogySession=null;
  frame.src='about:blank';
  frame.hidden=true;
  pause.hidden=true;
  library.hidden=false;
  checkpoint=await read('checkpoint');
  const list=document.querySelector('#titles');
  list.replaceChildren();
  let ready=true;
  for (const ch of chapters) {
    const exists=await request(database.transaction('campaign').objectStore('campaign').count(ch.code));
    const li=document.createElement('li');
    li.textContent=ch.title+(exists?' — ready':' — file needed');
    list.append(li);
    ready=ready && !!exists;
  }
  files.parentElement.hidden=ready;
  play.textContent=checkpoint?'Continue · '+chapters[checkpoint.chapter].title:'New Game';
  play.disabled=!ready;
}

files.onchange=async()=>{
  files.disabled=true;
  play.disabled=true;
  const errors=[];
  try {
    for (const file of files.files) {
      if (file.size!==8388608) {errors.push(file.name+' has an unsupported size.');continue;}
      const buffer=await file.arrayBuffer();
      const digest=new Uint8Array(await crypto.subtle.digest('SHA-256',buffer));
      const hash=Array.from(digest,b=>b.toString(16).padStart(2,'0')).join('');
      const chapter=chapters.find(c=>c.hash===hash);
      if (!chapter) {errors.push(file.name+' does not match a supported USA release.');continue;}
      await write(chapter.code,buffer);
    }
    await showLibrary();
    message.textContent=errors.join(' ');
  } catch(error){notice(error);}
  finally{files.value='';files.disabled=false;}
};

async function openChapter() {
  const index=checkpoint.chapter;
  const ch=chapters[index];
  const bytes=chapterImage(index,await read(ch.code));
  manager=null;
  clearInterval(timer);
  pause.hidden=true;
  library.hidden=true;
  frame.hidden=false;
  message.textContent='Chapter '+(index+1)+' · '+ch.title;
  window.trilogySession={
    bytes,code:ch.code,failed:notice,
    started(next) {
      manager=next;
      if (checkpoint.state) manager.loadState(checkpoint.state);
      pause.hidden=false;
      let ticks=0;
      timer=setInterval(async()=>{
        if (pending || !manager) return;
        pending=true;
        try {
          const state=manager.getState();
          if (atHandoff(state,index)) {
            const nextChapter={chapter:index+1,state:null};
            await write('checkpoint',nextChapter);
            checkpoint=nextChapter;
            await openChapter();
          } else if (++ticks%10===0) {
            await write('checkpoint',{chapter:index,state});
          }
        } catch(error){notice(error);}
        finally{pending=false;}
      },1000);
      frame.focus();
    }
  };
  frame.src='player.html?chapter='+index;
}
async function begin() {
  checkpoint=await read('checkpoint');
  try {
    if (!checkpoint) {checkpoint={chapter:0,state:null};await write('checkpoint',checkpoint);}
    await openChapter();
  } catch(error){await showLibrary();notice(error);}
}
play.onclick=async()=>{
  play.disabled=true;
  try {
    if (!navigator.locks) {await begin();return;}
    await navigator.locks.request('legacy-trilogy-session',{ifAvailable:true},async lock=>{
      if (!lock) {notice('Save and quit in the other campaign tab, then continue here.');play.disabled=false;return;}
      const released=new Promise(resolve=>{releaseSession=resolve;});
      await begin();
      await released;
    });
  } catch(error){await showLibrary();notice(error);}
};
pause.onclick=async()=>{
  if (!manager || pending) return;
  pending=true;
  try {
    await write('checkpoint',{chapter:checkpoint.chapter,state:manager.getState()});
    await showLibrary();
    message.textContent='Campaign saved on this device.';
  } catch(error){notice(error);}
  finally{pending=false;}
};
// Keys pressed while the page around the game has focus still reach the game.
for (const [type,pressed] of [['keydown',true],['keyup',false]]) {
  window.addEventListener(type,e=>{
    if (frame.hidden || e.target.closest?.('input,select,textarea,button')) return;
    const forward=frame.contentWindow?.trilogyKey;
    if (forward && forward(e,pressed)) e.preventDefault();
  });
}
document.addEventListener('visibilitychange',()=>{
  if (document.hidden && manager && !pending) {
    try {write('checkpoint',{chapter:checkpoint.chapter,state:manager.getState()}).catch(notice);}
    catch(error){notice(error);}
  }
});
try {
  const open=indexedDB.open('lilpit-legacy-trilogy-v1',1);
  open.onupgradeneeded=()=>open.result.createObjectStore('campaign');
  database=await request(open);
  await showLibrary();
} catch(error){notice('Browser storage is required for the campaign. '+error.message);}
