(function(){
  'use strict';
  const $ = id => document.getElementById(id);
  const state = { month: new Date(new Date().getFullYear(),new Date().getMonth(),1), selected: null, entries: new Map(), db: null, saveTimer: null, toastTimer: null, installPrompt: null, revision: 0 };
  const pad = n => String(n).padStart(2,'0');
  const keyFor = d => d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());
  const parseKey = key => { const [y,m,d]=key.split('-').map(Number); return new Date(y,m-1,d); };
  const niceDate = d => new Intl.DateTimeFormat(undefined,{weekday:'long',month:'long',day:'numeric',year:'numeric'}).format(d);
  const monthName = d => new Intl.DateTimeFormat(undefined,{month:'long',year:'numeric'}).format(d);
  const escapeHtml = s => s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function toast(message){ $('toast').textContent=message; $('toast').classList.add('show'); clearTimeout(state.toastTimer); state.toastTimer=setTimeout(()=>$('toast').classList.remove('show'),2400); }
  function openDB(){
    return new Promise((resolve,reject)=>{
      if(!('indexedDB' in window)){ reject(new Error('IndexedDB unavailable')); return; }
      const request=indexedDB.open('daywell-journal',1);
      request.onupgradeneeded=()=>{ const db=request.result; if(!db.objectStoreNames.contains('entries')) db.createObjectStore('entries',{keyPath:'date'}); };
      request.onsuccess=()=>resolve(request.result); request.onerror=()=>reject(request.error);
    });
  }
  function dbAll(){
    return new Promise((resolve,reject)=>{ const tx=state.db.transaction('entries','readonly'); const req=tx.objectStore('entries').getAll(); req.onsuccess=()=>resolve(req.result||[]); req.onerror=()=>reject(req.error); });
  }
  function dbPut(entry){
    return new Promise((resolve,reject)=>{ const tx=state.db.transaction('entries','readwrite'); tx.objectStore('entries').put(entry); tx.oncomplete=()=>resolve(); tx.onerror=()=>reject(tx.error); tx.onabort=()=>reject(tx.error||new Error('Save failed')); });
  }
  function dbDelete(date){
    return new Promise((resolve,reject)=>{ const tx=state.db.transaction('entries','readwrite'); tx.objectStore('entries').delete(date); tx.oncomplete=()=>resolve(); tx.onerror=()=>reject(tx.error); });
  }
  function dbPutMany(entries){
    return new Promise((resolve,reject)=>{
      const tx=state.db.transaction('entries','readwrite');
      const store=tx.objectStore('entries');
      entries.forEach(entry=>store.put(entry));
      tx.oncomplete=()=>resolve();
      tx.onerror=()=>reject(tx.error||new Error('Restore failed'));
      tx.onabort=()=>reject(tx.error||new Error('Restore failed'));
    });
  }
  async function loadEntries(){
    try { state.db=await openDB(); const all=await dbAll(); all.forEach(e=>state.entries.set(e.date,e.text)); }
    catch(err){
      try { const raw=localStorage.getItem('daywell-entries-v1'); if(raw){ const obj=JSON.parse(raw); Object.entries(obj).forEach(([k,v])=>state.entries.set(k,v)); } }
      catch(e){ toast('Could not read local journal storage.'); }
    }
    renderCalendar();
  }
  async function persist(date,text){
    try {
      if(state.db){ if(text.trim()) await dbPut({date,text,updatedAt:Date.now()}); else await dbDelete(date); }
      else { const obj={}; state.entries.forEach((v,k)=>{if(v.trim())obj[k]=v}); if(text.trim())obj[date]=text; else delete obj[date]; localStorage.setItem('daywell-entries-v1',JSON.stringify(obj)); }
      if(state.selected===date){ $('saveStatus').textContent='Saved on this device'; $('statusDot').classList.add('saved'); }
    } catch(err){ if(state.selected===date){ $('saveStatus').textContent='Could not save · keep this page open'; $('statusDot').classList.remove('saved'); } toast('Could not save this entry. Check device storage.'); }
  }
  function downloadBackup(){
    const entries=[...state.entries.entries()].filter(([,text])=>typeof text==='string'&&text.trim()).sort(([a],[b])=>a.localeCompare(b)).map(([date,text])=>({date,text}));
    const backup={format:'daywell-journal-backup',version:1,exportedAt:new Date().toISOString(),entries};
    const blob=new Blob([JSON.stringify(backup,null,2)],{type:'application/json'});
    const url=URL.createObjectURL(blob); const link=document.createElement('a');
    link.href=url; link.download='daywell-backup-'+keyFor(new Date())+'.json';
    document.body.appendChild(link); link.click(); link.remove(); URL.revokeObjectURL(url);
    toast(entries.length+' journal '+(entries.length===1?'page':'pages')+' backed up. Keep the file somewhere safe.');
  }
  function validateBackup(data){
    if(!data||typeof data!=='object'||data.format!=='daywell-journal-backup'||data.version!==1||!Array.isArray(data.entries)) throw new Error('This is not a supported Daywell backup.');
    const validated=new Map();
    for(const entry of data.entries){
      if(!entry||typeof entry!=='object'||typeof entry.date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(entry.date)||typeof entry.text!=='string') throw new Error('The backup contains an invalid journal page.');
      const date=parseKey(entry.date);
      if(!Number.isFinite(date.getTime())||keyFor(date)!==entry.date) throw new Error('The backup contains an invalid date.');
      if(entry.text.length>5000000) throw new Error('A journal page is too large to restore.');
      validated.set(entry.date,entry.text);
    }
    return [...validated.entries()].filter(([,text])=>text.trim()).map(([date,text])=>({date,text,updatedAt:Date.now()}));
  }
  async function restoreBackup(file){
    const raw=await file.text(); const incoming=validateBackup(JSON.parse(raw));
    const merged=new Map(state.entries);
    incoming.forEach(entry=>merged.set(entry.date,entry.text));
    const all=[...merged.entries()].filter(([,text])=>text.trim());
    if(state.db){ await dbPutMany(all.map(([date,text])=>({date,text,updatedAt:Date.now()}))); }
    else {
      const object={}; all.forEach(([date,text])=>object[date]=text);
      localStorage.setItem('daywell-entries-v1',JSON.stringify(object));
    }
    state.entries=merged;
    renderCalendar();
    toast('Restored '+incoming.length+' journal '+(incoming.length===1?'page':'pages')+'. Existing dates were merged.');
  }
  function renderCalendar(){
    $('monthTitle').textContent=monthName(state.month);
    const y=state.month.getFullYear(),m=state.month.getMonth();
    const first=new Date(y,m,1), startOffset=(first.getDay()+6)%7, count=new Date(y,m+1,0).getDate();
    const prevCount=new Date(y,m,0).getDate(), total=Math.ceil((startOffset+count)/7)*7;
    const today=keyFor(new Date()); let html='';
    for(let i=0;i<total;i++){
      let date, outside=false;
      if(i<startOffset){date=new Date(y,m-1,prevCount-startOffset+i+1);outside=true}
      else if(i>=startOffset+count){date=new Date(y,m+1,i-startOffset-count+1);outside=true}
      else date=new Date(y,m,i-startOffset+1);
      const key=keyFor(date), text=state.entries.get(key)||'', has=!!text.trim();
      html+='<button class="day'+(outside?' outside':'')+(key===today?' today':'')+'" data-date="'+key+'" aria-label="'+escapeHtml(niceDate(date))+(has?', has a journal entry':'')+'"><span class="day-number">'+date.getDate()+'</span>'+(has?'<span class="entry-dot" aria-hidden="true"></span><span class="day-preview">'+escapeHtml(text.replace(/\s+/g,' ').trim())+'</span>':'')+'</button>';
    }
    $('daysGrid').innerHTML=html;
    $('daysGrid').querySelectorAll('.day').forEach(btn=>btn.addEventListener('click',()=>openEditor(btn.dataset.date)));
    const written=[...state.entries.values()].filter(v=>v.trim()).length;
    $('entrySummary').textContent=written===1?'1 page written':written+' pages written';
  }
  function showCalendar(){ $('editorView').classList.remove('active'); $('calendarView').classList.remove('hidden'); renderCalendar(); }
  function openEditor(date){
    if(state.selected && state.selected!==date) flushSave();
    state.selected=date;
    const d=parseKey(date); $('editorDate').textContent=niceDate(d);
    $('entryText').value=state.entries.get(date)||'';
    $('wordCount').textContent=countWords($('entryText').value)+' words';
    $('saveStatus').textContent='Saved on this device'; $('statusDot').classList.add('saved');
    $('calendarView').classList.add('hidden'); $('editorView').classList.add('active');
    history.replaceState({date},'',location.pathname+'#'+date);
    window.scrollTo(0,0); $('entryText').focus({preventScroll:true});
  }
  function countWords(s){const t=s.trim();return t?t.split(/\s+/).length:0}
  function queueSave(){
    const date=state.selected;if(!date)return;
    const text=$('entryText').value;state.entries.set(date,text);
    $('wordCount').textContent=countWords(text)+' words';$('saveStatus').textContent='Saving…';$('statusDot').classList.remove('saved');
    clearTimeout(state.saveTimer);state.saveTimer=setTimeout(async()=>{await persist(date,text);renderCalendar()},450);
  }
  function flushSave(){
    clearTimeout(state.saveTimer);
    const date=state.selected;if(!date)return Promise.resolve();
    const text=$('entryText').value;state.entries.set(date,text);
    return persist(date,text).then(()=>renderCalendar());
  }
  $('backupBtn').addEventListener('click',()=>{ if(state.selected) flushSave().then(downloadBackup); else downloadBackup(); });
  $('restoreBtn').addEventListener('click',()=>$('restoreFile').click());
  $('restoreFile').addEventListener('change',async event=>{
    const file=event.target.files&&event.target.files[0]; if(!file)return;
    try { if(state.selected) await flushSave(); await restoreBackup(file); }
    catch(err){ toast(err instanceof SyntaxError?'The backup file is not valid JSON.':(err.message||'Could not restore this backup.')); }
    finally { event.target.value=''; }
  });
  $('prevMonth').addEventListener('click',()=>{state.month=new Date(state.month.getFullYear(),state.month.getMonth()-1,1);renderCalendar()});
  $('nextMonth').addEventListener('click',()=>{state.month=new Date(state.month.getFullYear(),state.month.getMonth()+1,1);renderCalendar()});
  $('todayBtn').addEventListener('click',()=>{if(state.selected){flushSave().then(()=>{const d=new Date();state.month=new Date(d.getFullYear(),d.getMonth(),1);openEditor(keyFor(d))})}else{const d=new Date();state.month=new Date(d.getFullYear(),d.getMonth(),1);renderCalendar()}});
  $('backBtn').addEventListener('click',()=>{flushSave().then(()=>{history.replaceState({},'',location.pathname);showCalendar()})});
  $('entryText').addEventListener('input',queueSave);
  $('prevDay').addEventListener('click',async()=>{await flushSave();openEditor(keyFor(new Date(parseKey(state.selected).getTime()-86400000)))});
  $('nextDay').addEventListener('click',async()=>{await flushSave();openEditor(keyFor(new Date(parseKey(state.selected).getTime()+86400000)))});
  window.addEventListener('beforeunload',e=>{if(state.saveTimer){clearTimeout(state.saveTimer); const date=state.selected;if(date){try{const text=$('entryText').value;if(state.db){const tx=state.db.transaction('entries','readwrite');if(text.trim())tx.objectStore('entries').put({date,text,updatedAt:Date.now()});else tx.objectStore('entries').delete(date)}else{const obj={};state.entries.forEach((v,k)=>{if(v.trim())obj[k]=v});if(text.trim())obj[date]=text;else delete obj[date];localStorage.setItem('daywell-entries-v1',JSON.stringify(obj))}}catch(err){}}}});
  window.addEventListener('keydown',e=>{if(e.key==='Escape'&&state.selected){flushSave().then(()=>{history.replaceState({},'',location.pathname);showCalendar()})}});
  window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();state.installPrompt=e;$('installBtn').hidden=false});
  $('installBtn').addEventListener('click',async()=>{if(!state.installPrompt){toast('Use your browser menu and choose Install app or Add to Home Screen.');return}state.installPrompt.prompt();await state.installPrompt.userChoice;state.installPrompt=null;$('installBtn').hidden=true});
  if('serviceWorker' in navigator && (location.protocol==='https:'||location.hostname==='localhost')) navigator.serviceWorker.register('./sw.js').catch(()=>{});
  loadEntries().then(()=>{const hash=location.hash.slice(1);if(/^\d{4}-\d{2}-\d{2}$/.test(hash)){const d=parseKey(hash);state.month=new Date(d.getFullYear(),d.getMonth(),1);openEditor(hash)}});
})();
