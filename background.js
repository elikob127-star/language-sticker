// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 E, Language Sticker (LS) project owner.
const api=globalThis.chrome;
importScripts('config.js','fixes.js');
// 0.5.1: welcome page on first install; right-click "improve translation" on selected text.
api.runtime.onInstalled.addListener(({reason})=>{
  // 0.3.52: right-click works anywhere on the page, not only on selected text.
  api.contextMenus.removeAll(()=>api.contextMenus.create({id:'dts-improve',title:'שיפור תרגום במדבקה 🎤',contexts:['page','selection','link']}));
  if(reason==='install')api.tabs.create({url:api.runtime.getURL('welcome.html')});
});
// 0.3.52: reads the paragraph the user pointed at (right-click or "mark another"): the original
// text and what the sticker shows on it. Runs only after the user's own click.
function grabSpot(pick){
  const blocks='p,li,h1,h2,h3,h4,h5,h6,blockquote,figcaption,td,th,dd,dt,caption';
  const controls='button,a,label,summary,[role="button"],[role="menuitem"],[role="tab"],[role="option"]';
  const read=start=>{
    let el=start&&start.nodeType===1?start:start?.parentElement;if(!el)return null;
    const box=el.closest(blocks)||el.closest(controls)||el;
    let text=(box.innerText||box.textContent||'').replace(/\s+/g,' ').trim();
    if(!text)return null;if(text.length>500)text=text.slice(0,500)+'…';
    const shown=globalThis.LanguageSticker?.shownIn?.(box.getBoundingClientRect())||[];
    const on=Boolean(globalThis.LanguageSticker?.status?.().enabled);
    let page='';try{page=location.origin+location.pathname;}catch{}
    return {text,shown:[...new Set(shown)].join(' ').slice(0,400),on,page,picked:String(getSelection()||'').trim().slice(0,180)};
  };
  if(!pick){const sel=getSelection();return read(sel&&!sel.isCollapsed?sel.anchorNode:globalThis.__dtsLastContext);}
  // "Mark another": the next click on the page is captured (and not followed), Esc cancels.
  if(globalThis.__dtsPicking)return 'picking';globalThis.__dtsPicking=true;
  const ring=document.createElement('div');ring.style.cssText='all:initial;position:fixed;pointer-events:none;z-index:2147483647;border:3px solid #8fb84a;border-radius:6px;background:rgba(200,240,122,.18);display:none';
  document.documentElement.append(ring);
  const hover=e=>{const b=(e.target.closest?.(blocks)||e.target.closest?.(controls)||e.target);const r=b.getBoundingClientRect();Object.assign(ring.style,{display:'block',left:r.left-3+'px',top:r.top-3+'px',width:r.width+6+'px',height:r.height+6+'px'});};
  const done=()=>{removeEventListener('mouseover',hover,true);removeEventListener('click',click,true);removeEventListener('keydown',key,true);ring.remove();globalThis.__dtsPicking=false;};
  const click=e=>{e.preventDefault();e.stopPropagation();const spot=read(e.target);done();globalThis.chrome.runtime.sendMessage({type:'dts-picked',spot});};
  const key=e=>{if(e.key==='Escape'){done();globalThis.chrome.runtime.sendMessage({type:'dts-picked',spot:null});}};
  addEventListener('mouseover',hover,true);addEventListener('click',click,true);addEventListener('keydown',key,true);
  return 'picking';
}
async function addSpot(tab,spot){
  let site='';try{site=new URL(tab?.url||'').hostname;}catch{}
  const {language='he',sourceLanguage='en'}=await api.storage.local.get(['language','sourceLanguage']);
  const {feedbackDraft:old}=await api.storage.session.get('feedbackDraft');
  const draft=old&&old.site===site&&Array.isArray(old.spots)?old:{site,pair:`${sourceLanguage}>${language}`,spots:[]};
  if(spot&&!draft.spots.some(s=>s.text===spot.text))draft.spots=[...draft.spots,spot].slice(-3);
  draft.page=spot?.page||draft.page||'';draft.at=Date.now();
  await api.storage.session.set({feedbackDraft:draft});
}
api.contextMenus.onClicked.addListener((info,tab)=>{
  if(info.menuItemId!=='dts-improve')return;
  // Open first, while Chrome still counts this as the user's click.
  const opened=api.sidePanel?api.sidePanel.open({windowId:tab.windowId}):Promise.reject();
  opened.catch(()=>api.tabs.create({url:api.runtime.getURL('feedback.html'),index:(tab?.index??0)+1}));
  (async()=>{
    let spot=null;
    try{const [r]=await api.scripting.executeScript({target:{tabId:tab.id,frameIds:[info.frameId||0]},func:grabSpot,args:[false]});spot=r?.result||null;}catch{}
    if(!spot&&info.selectionText)spot={text:info.selectionText.trim().slice(0,500),shown:'',on:false,page:'',picked:info.selectionText.trim().slice(0,180)};
    await addSpot(tab,spot);
    // Place not known (public build has no right-click tracker): the next click on the page marks it.
    if(!spot)await api.scripting.executeScript({target:{tabId:tab.id},func:grabSpot,args:[true]}).catch(()=>{});
  })().catch(()=>{});
});
api.runtime.onMessage.addListener((message,sender,reply)=>{
  if(message?.type==='dts-pick'){
    api.tabs.query({active:true,lastFocusedWindow:true}).then(([tab])=>{
      if(!tab?.id)return reply({ok:false});
      api.scripting.executeScript({target:{tabId:tab.id},func:grabSpot,args:[true]}).then(()=>reply({ok:true})).catch(()=>reply({ok:false}));
    });
    return true;
  }
  if(message?.type==='dts-picked'&&sender.tab){addSpot(sender.tab,message.spot).catch(()=>{});}
});
// 0.5.7 / 0.3.54: "quick marking" per site, by the user's choice. Only on sites the user approved,
// pointer.js remembers where the last right-click was. No site is approved by default.
async function syncQuickSites(){
  try{
    const {origins=[]}=await api.permissions.getAll();
    const sites=origins.filter(o=>/^https?:\/\/[^*]+\/\*$/.test(o));
    await api.scripting.unregisterContentScripts({ids:['ls-pointer']}).catch(()=>{});
    if(sites.length)await api.scripting.registerContentScripts([{id:'ls-pointer',js:['pointer.js'],matches:sites,runAt:'document_start'}]);
  }catch{}
}
api.permissions.onAdded.addListener(syncQuickSites);api.permissions.onRemoved.addListener(syncQuickSites);
api.runtime.onStartup.addListener(syncQuickSites);api.runtime.onInstalled.addListener(syncQuickSites);
api.runtime.onMessage.addListener((message)=>{
  if(message?.type!=='ls-quick-on')return;
  // Start at once on the open tab too, without reloading it.
  api.tabs.query({active:true,lastFocusedWindow:true}).then(([tab])=>{if(tab?.id)api.scripting.executeScript({target:{tabId:tab.id},files:['pointer.js']}).catch(()=>{});});
});
// 0.3.56 / 0.5.9: on-screen correction by core users (join code from E). The fix is kept on this
// computer for its language pair and sent to E's form. The sheet counts identical fixes by member
// number; 3 members = confirmed. E approves, and confirmed fixes enter the dictionary in a later version.
async function anonymousId(){
  let {userId}=await api.storage.local.get('userId');
  if(!userId){const a='ABCDEFGHJKLMNPQRSTUVWXYZ23456789',r=crypto.getRandomValues(new Uint8Array(6));userId='U-'+[...r].map(x=>a[x%a.length]).join('');await api.storage.local.set({userId});}
  return userId;
}
api.runtime.onMessage.addListener((message,sender,reply)=>{
  if(message?.type!=='ls-screen-fix'||!sender.tab)return;
  (async()=>{
    const F=globalThis.LanguageStickerFixes,C=globalThis.LanguageStickerConfig,f=message.fix||{};
    const member=await F.member(api);
    if(!member)return reply({saved:false,sent:false,reason:'not-member'});
    const text=v=>String(v||'').replace(/[\u0000-\u001f\u202a-\u202e\u2066-\u2069]/g,'').trim();
    const pair=text(f.pair),source=text(f.source).slice(0,180),before=text(f.before).slice(0,180),after=text(f.after).slice(0,180),why=text(f.why).slice(0,200);
    const saved=await F.add(api,pair,source,after);
    if(!saved)return reply({saved:false,sent:false});
    let page='';try{const u=new URL(f.page);if(/^https?:$/.test(u.protocol))page=u.origin+u.pathname;}catch{}
    const q=new URLSearchParams(),K=C.fields;
    q.set(K.user,`${await anonymousId()} · יסוד-${member}`);q.set(K.version,api.runtime.getManifest().version);
    q.set(K.pair,pair.replace('>',' → '));q.set(K.text,source);q.set(K.better,after);
    q.set(K.what,`[תיקון במסך] היה: ${before}${why?' · '+why:''}`.slice(0,600));if(page)q.set(K.site,page);
    try{await fetch(C.feedbackForm,{method:'POST',mode:'no-cors',body:q});reply({saved:true,sent:true});}
    catch{reply({saved:true,sent:false});}
  })().catch(()=>reply({saved:false,sent:false}));
  return true;
});
// Counts peels per site locally, so a site peeled twice stops auto-sticking.
api.runtime.onMessage.addListener((message,sender)=>{
  if(message?.type!=='sticker-peeled'||!sender.tab?.id)return;
  let host='';try{host=new URL(sender.url||sender.tab.url).hostname;}catch{}
  if(host)api.storage.local.get('peeled').then(({peeled={}})=>{peeled[host]=(peeled[host]||0)+1;return api.storage.local.set({peeled});}).catch(()=>{});
});

