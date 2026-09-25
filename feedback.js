// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 E, Language Sticker (LS) project owner.
// 0.3.52 feedback panel: opens beside the page (Chrome side panel). The spot the user right-clicked
// (or marks with "mark another") arrives by itself: the original paragraph and what the sticker
// showed on it. The user only says or types what is wrong. Sent in the background, the page stays.
(()=>{
 const api=globalThis.chrome, $=id=>document.getElementById(id);
 const status=$('status');let draft={site:'',page:'',pair:'en>he',spots:[]};
 const speechLang={he:'he-IL',en:'en-US',ar:'ar-SA',ru:'ru-RU',es:'es-ES',fr:'fr-FR',de:'de-DE',pt:'pt-BR',it:'it-IT',tr:'tr-TR',ja:'ja-JP',ko:'ko-KR',zh:'zh-CN',hi:'hi-IN'};
 const el=(tag,cls,text)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(text!=null)e.textContent=text;return e;};
 function shownLine(s){
  if(!s.on)return ['המדבקה הייתה כבויה כאן',''];
  return s.shown?['המדבקה הראתה: ',s.shown]:['לא תורגם',''];
 }
 // ---- two kinds of feedback: words & context (main) or use & look (operation, look, accessibility...)
 let mode='words';const kinds=new Set();
 function setMode(m){
  mode=m;$('mode-words').setAttribute('aria-selected',String(m==='words'));$('mode-use').setAttribute('aria-selected',String(m==='use'));
  $('use-kind').hidden=m!=='use';$('better-box').hidden=m!=='words';
  $('title').textContent=m==='words'?'מה לא תורגם טוב?':'מה היה לא נוח?';
  $('step1').textContent=m==='words'?'1 · המקום בדף (נקלט לבד)':'המקום בדף (רשות)';
  $('step2').textContent=m==='words'?'2 · ספרו מה לא טוב ומה הכוונה':'ספרו מה היה לא נוח או מה אפשר לשפר';
  $('what').placeholder=m==='words'?'למשל: הפסקה הזו לא תורגמה בכלל':'למשל: הפינה הירוקה קטנה מדי, קשה ללחוץ עליה';
 }
 $('mode-words').addEventListener('click',()=>setMode('words'));$('mode-use').addEventListener('click',()=>setMode('use'));
 $('kinds').addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;const k=b.dataset.kind;
  if(kinds.has(k))kinds.delete(k);else kinds.add(k);b.setAttribute('aria-pressed',String(kinds.has(k)));});
 function render(){
  const box=$('spots');box.replaceChildren();
  if(!draft.spots.length){box.append(el('div','empty','קליק ימני על המקום בדף ← "שיפור תרגום", או 👆 "סמן עוד מקום בדף" ולחיצה עליו.'));}
  draft.spots.forEach((s,i)=>{
   const card=el('div','spot');card.append(el('div','orig',s.text));card.firstChild.dir='auto';
   const [label,value]=shownLine(s),line=el('div','shown',label);if(value){const b=el('b',null,value);b.dir='auto';line.append(b);}card.append(line);
   const x=el('button','x','✕');x.type='button';x.title='הסרה';x.addEventListener('click',async()=>{draft.spots.splice(i,1);await api.storage.session.set({feedbackDraft:draft});});
   card.append(x);box.append(card);
  });
  const page=draft.page||draft.site;$('site-name').textContent=page||'—';$('site-ok').disabled=!page;
 }
 // ---- quick marking, one site at a time (the user's choice)
 const originOf=()=>{try{return new URL(draft.page||('https://'+draft.site)).origin;}catch{return '';}};
 async function quickState(){
  const o=originOf();$('quick').hidden=true;$('quick-on').hidden=true;if(!o||!api.permissions)return;
  const has=await api.permissions.contains({origins:[o+'/*']}).catch(()=>false);
  if(has){$('quick-on').hidden=false;return;}
  const {quickDeclined={}}=await api.storage.local.get('quickDeclined');
  if(!quickDeclined[new URL(o).hostname]){$('quick-site').textContent=new URL(o).hostname;$('quick').hidden=false;}
 }
 $('quick-yes').addEventListener('click',()=>{
  const o=originOf();if(!o)return;
  // Chrome asks the user itself; the request must start right inside this click.
  api.permissions.request({origins:[o+'/*']}).then(ok=>{
   if(ok){api.runtime.sendMessage({type:'ls-quick-on'}).catch(()=>{});status.textContent='סימון מהיר פעיל באתר הזה. מעכשיו קליק ימני מספיק.';}
   quickState();
  }).catch(()=>quickState());
 });
 $('quick-no').addEventListener('click',async()=>{
  const o=originOf();if(!o)return;const {quickDeclined={}}=await api.storage.local.get('quickDeclined');
  quickDeclined[new URL(o).hostname]=true;await api.storage.local.set({quickDeclined});quickState();
 });
 $('quick-off').addEventListener('click',e=>{e.preventDefault();const o=originOf();if(o)api.permissions.remove({origins:[o+'/*']}).then(quickState).catch(quickState);});
 async function load(){
  try{const v=await api.storage.session.get('feedbackDraft');if(v.feedbackDraft)draft={...draft,...v.feedbackDraft,spots:v.feedbackDraft.spots||[]};}catch{}
  render();quickState();
 }
 api.storage.onChanged.addListener((changes,area)=>{
  if(area!=='session'||!changes.feedbackDraft)return;
  const nv=changes.feedbackDraft.newValue;draft=nv?{...draft,...nv,spots:nv.spots||[]}:{site:'',page:'',pair:draft.pair,spots:[]};
  render();quickState();if(draft.spots.length)status.textContent='נקלט. עכשיו ספרו מה לא טוב.';
 });
 // ---- mark another spot on the page
 $('pick').addEventListener('click',async()=>{
  status.textContent='לחצו על המקום בדף. Esc לביטול.';
  const r=await api.runtime.sendMessage({type:'dts-pick'}).catch(()=>null);
  if(!r?.ok)status.textContent='לא הצלחתי לסמן בדף הזה. נסו קליק ימני על המקום.';
 });
 // ---- microphone
 const SR=globalThis.SpeechRecognition||globalThis.webkitSpeechRecognition;let rec=null,on=false,stopTimer=0,base='';
 if(!SR){$('mic').hidden=true;$('mic-note').textContent='בדפדפן הזה אין תמלול מובנה. אפשר להכתיב עם המיקרופון שבמקלדת.';}
 function setOn(v){on=v;$('mic').classList.toggle('on',v);$('mic').setAttribute('aria-pressed',String(v));$('mic-label').textContent=v?'מקליט… לחצו לסיום':'🎤 לחצו ודברו';}
 // A side panel cannot show Chrome's microphone question, so the first time it opens a small tab for it.
 async function micAllowed(){try{return (await navigator.permissions.query({name:'microphone'})).state==='granted';}catch{return false;}}
 function askMic(){api.tabs.create({url:api.runtime.getURL('mic.html')});$('mic-note').textContent='אשרו את המיקרופון בלשונית שנפתחה, ואז לחצו שוב על 🎤.';}
 function start(){
  const my=(draft.pair||'en>he').split('>')[1]||'he';
  rec=new SR();rec.lang=speechLang[my]||navigator.language||'he-IL';rec.interimResults=true;rec.continuous=true;
  base=$('what').value.trim();base=base?base+' ':'';
  rec.onresult=e=>{let t='';for(const r of e.results)t+=r[0].transcript;$('what').value=(base+t).slice(0,600);};
  rec.onerror=e=>{setOn(false);if(e.error==='not-allowed')askMic();else $('mic-note').textContent='התמלול נעצר. אפשר לנסות שוב או להקליד.';};
  rec.onend=()=>{setOn(false);clearTimeout(stopTimer);};
  try{rec.start();setOn(true);$('mic-note').textContent='';stopTimer=setTimeout(()=>rec?.stop(),60000);}catch{setOn(false);}
 }
 async function go(){if(await micAllowed())start();else askMic();}
 $('mic').addEventListener('click',async()=>{
  if(on){rec?.stop();return;}
  const {micConsent}=await api.storage.local.get('micConsent');
  if(micConsent)go();else{$('consent').classList.add('show');$('c-yes').focus();}
 });
 $('c-yes').addEventListener('click',async()=>{await api.storage.local.set({micConsent:true});$('consent').classList.remove('show');go();});
 $('c-no').addEventListener('click',()=>{$('consent').classList.remove('show');$('what').focus();});
 document.addEventListener('keydown',e=>{if(e.key==='Escape')$('consent').classList.remove('show');});
 // ---- save / send
 function spotsText(){
  return draft.spots.map(s=>{const [label,value]=shownLine(s);return `${s.text} ⟵ ${label}${value}`;}).join(' ¶ ').slice(0,1500);
 }
 async function keep(better){
  const key=draft.spots[0]?.picked||(draft.spots[0]?.text.length<=60?draft.spots[0].text:'');
  if(!key)return;
  // 0.3.56 / 0.5.9: kept per language pair, so it works in every language (not only English -> Hebrew).
  if(better)await globalThis.LanguageStickerFixes.add(api,draft.pair||'en>he',key,better);
  const {correctionNotes:notes={}}=await api.storage.local.get('correctionNotes');
  notes[key]={what:$('what').value.trim(),pair:draft.pair};
  await api.storage.local.set({correctionNotes:notes});
 }
 async function clearDraft(){draft={...draft,spots:[]};await api.storage.session.set({feedbackDraft:draft});$('what').value='';$('better').value='';kinds.clear();document.querySelectorAll('#kinds button').forEach(b=>b.setAttribute('aria-pressed','false'));}
 $('save').addEventListener('click',async()=>{
  if(!draft.spots.length){status.textContent='קודם סמנו מקום בדף.';return;}
  const better=$('better').value.trim();await keep(better);
  status.textContent=better?'נשמר אצלך, ויופיע בהפעלה הבאה של המדבקה.':'נשמר אצלך.';
 });
 $('send').addEventListener('click',async()=>{
  const what=$('what').value.trim(),better=$('better').value.trim();
  if(mode==='words'&&!draft.spots.length){status.textContent='קודם סמנו מקום בדף: קליק ימני עליו, או 👆.';return;}
  if(!what&&(mode==='use'||!better)){status.textContent='ספרו בקול או במילים מה לא טוב.';$('what').focus();return;}
  if(on)rec?.stop();
  if(mode==='words')await keep(better);
  // Anonymous user number, created once on this computer. No name, mail or device data.
  let {userId}=await api.storage.local.get('userId');
  if(!userId){const a='ABCDEFGHJKLMNPQRSTUVWXYZ23456789',r=crypto.getRandomValues(new Uint8Array(6));userId='U-'+[...r].map(x=>a[x%a.length]).join('');await api.storage.local.set({userId});}
  const C=globalThis.LanguageStickerConfig,F=C.fields,q=new URLSearchParams();
  const member=await globalThis.LanguageStickerFixes.member(api);
  q.set(F.user,member?`${userId} · יסוד-${member}`:userId);q.set(F.version,api.runtime.getManifest().version);q.set(F.pair,(draft.pair||'en>he').replace('>',' → '));q.set(F.text,spotsText()||'—');
  // Use & look feedback is marked at the start of "what", so the sheet can be filtered by it.
  const tag=mode==='use'?`[שימוש ונראות${kinds.size?': '+[...kinds].join(', '):''}] `:'';
  if(what)q.set(F.what,tag+what);if(better&&mode==='words')q.set(F.better,better);
  const page=draft.page||draft.site;if($('site-ok').checked&&page)q.set(F.site,page);
  $('send').disabled=true;status.textContent='שולח…';
  try{await fetch(C.feedbackForm,{method:'POST',mode:'no-cors',body:q});status.textContent='נשלח. תודה! אפשר להמשיך לגלוש ולסמן עוד.';await clearDraft();}
  catch{q.set('submit','Submit');api.tabs.create({url:`${C.feedbackForm}?${q}`});status.textContent='נשלח דרך לשונית חדשה. תודה!';await clearDraft();}
  finally{$('send').disabled=false;}
 });
 // Opened from the sticker's menu with no spot: start on "use & look".
 if(new URLSearchParams(location.search).get('mode')==='use')setMode('use');
 load();
})();
