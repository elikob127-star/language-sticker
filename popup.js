// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 E, Language Sticker (LS) project owner.
const api = globalThis.browser || globalThis.chrome;
const lex = globalThis.LanguageStickerDictionary;
const status = document.getElementById('status'), language = document.getElementById('language'), source = document.getElementById('source');
const installed=Boolean(api?.runtime?.id);
let packs=[];
function coverage(){
 const src=lex.dictionaries[source.value]||{},dst=lex.dictionaries[language.value]||{};
 const shared=Object.keys(src).filter(key=>dst[key]).length;
 document.getElementById('coverage').textContent=source.value===language.value?'נבחרה אותה שפה — המקור יוצג.':`${shared} מונחי מילון משותפים לצמד השפות. שאר הטקסט נשאר במקור.`;
}
function fill(preferredSource=source.value||'en',preferredTarget=language.value||'he'){
 for(const select of [source,language]){
  select.replaceChildren();
  for(const lang of lex.languages()){
   const option=document.createElement('option');option.value=lang.code;option.textContent=lang.name;select.append(option);
  }
 }
 source.value=lex.dictionaries[preferredSource]?preferredSource:'en';
 language.value=lex.dictionaries[preferredTarget]?preferredTarget:'he';coverage();
}
fill();
if(!installed){
 status.textContent='מצב פיתוח: זהו קובץ מקומי, והתוסף אינו מותקן כאן. הכפתורים דורשים התקנה בדפדפן.';
 document.getElementById('enable').disabled=true;
 document.getElementById('disable').disabled=true;
 document.getElementById('pack').disabled=true;
 const link=document.createElement('a');link.href='../demo/index.html';link.textContent='פתיחת בדיקת המדבקה החיה';link.style.cssText='display:block;color:#d2f895;padding:14px 0;font-weight:bold';status.after(link);
}else{
 document.getElementById('enable').disabled=true;
 api.storage.local.get(['language','sourceLanguage','languagePacks']).then(v=>{
  if(Array.isArray(v.languagePacks))for(const pack of v.languagePacks.slice(0,30)){try{lex.register(pack);packs.push(pack);}catch{}}
  fill(v.sourceLanguage,v.language);
 }).catch(()=>{status.textContent='טעינת ההעדפות נכשלה. אפשר להשתמש במילונים המובנים.';}).finally(()=>{document.getElementById('enable').disabled=false;});
}
source.addEventListener('change',coverage);language.addEventListener('change',coverage);
async function run(enabled){
 if(!installed)return;
 if(enabled&&document.getElementById('native-mode')?.checked)return runNative();
 try{
  const [tab]=await api.tabs.query({active:true,currentWindow:true});
  if(!tab?.id||!/^https?:\/\//.test(tab.url||''))throw new Error('Protected page');
  if(enabled){await api.scripting.executeScript({target:{tabId:tab.id},files:['mozilla-pack.js','aosp-pack.js','ai-pack.js','libreoffice-pack.js','dictionary.js','overlay.js']});await sendFixes(tab.id);}
  await api.scripting.executeScript({target:{tabId:tab.id},func:(on,target,origin,localPacks)=>{
   if(on){for(const pack of localPacks)globalThis.LanguageStickerDictionary.register(pack);globalThis.LanguageSticker.enable(target,origin);}
   else {globalThis.LanguageSticker?.disable();globalThis.LanguageStickerLocalControls?.close();}
  },args:[enabled,language.value,source.value,packs]});
  await api.storage.local.set({language:language.value,sourceLanguage:source.value});
  status.textContent=enabled?'המדבקה הופעלה למונחים נתמכים. החזק Alt להצגת המקור.':'המדבקה הוסרה; המקור לא שונה.';
 }catch{status.textContent='הפעולה לא הושלמה. ייתכן שהעמוד מוגן או שהגישה אליו לא זמינה. אין אישור שהמדבקה הופעלה.';}
}
// 0.3.46: on a "do not stick" site the first click only explains; a second click starts it once.
let armedHost='';
document.getElementById('enable').addEventListener('click',async()=>{
 try{
  const [tab]=await api.tabs.query({active:true,currentWindow:true});
  const host=new URL(tab?.url||'').hostname;
  const {peeled={}}=await api.storage.local.get('peeled');
  const why=globalThis.LanguageStickerNoStick.reason(host,peeled);
  if(why&&armedHost!==host){
   armedHost=host;
   status.textContent=why==='default'?'אתר אישי (מייל, בנק או הודעות): המדבקה לא נדבקת כאן מעצמה. לחץ שוב להפעלה חד-פעמית.':'קילפת את המדבקה באתר הזה פעמיים, ולכן היא לא נדבקת כאן. לחץ שוב להפעלה חד-פעמית.';
   return;
  }
 }catch{}
 armedHost='';run(true);
});
document.getElementById('disable').addEventListener('click',()=>run(false));
document.getElementById('pack').addEventListener('change',async event=>{
 const note=document.getElementById('pack-status');
 try{
  const file=event.target.files?.[0];if(!file)return;
  if(file.size>300000)throw new Error('הקובץ גדול מדי');
  const pack=JSON.parse(await file.text()),valid=lex.validatePack(pack);
  if(packs.length>=30&&!packs.some(p=>p.language===valid.code))throw new Error('מגבלת 30 חבילות');
  const normalizedPack={schemaVersion:1,language:valid.code,name:valid.name,direction:valid.direction,entries:pack.entries};
  // Retain previous terms when a user adds a second pack for the same language.
  const prior=packs.find(p=>p.language===valid.code);
  if(prior)normalizedPack.entries={...prior.entries,...normalizedPack.entries};
  lex.validatePack(normalizedPack);
  const next=packs.filter(p=>p.language!==valid.code).concat(normalizedPack);
  await api.storage.local.set({languagePacks:next});
  lex.register(normalizedPack);packs=next;fill(source.value,valid.code);
  note.textContent='החבילה נוספה במכשיר. הפעל שוב את המדבקה להחלת השינוי.';
 }catch{note.textContent='החבילה לא נטענה. נדרש JSON תקין עם קוד שפה, שם ומונחים; עד 300KB ו־2,000 מונחים לחבילה.';}
 event.target.value='';
});

async function runNative(){
 try{
  const target=Intl.getCanonicalLocales(document.getElementById('native-target').value.trim()||language.value)[0];
  const [tab]=await api.tabs.query({active:true,currentWindow:true});
  if(!tab?.id||!/^https?:\/\//.test(tab.url||''))throw new Error('Protected page');
  await api.scripting.executeScript({target:{tabId:tab.id},files:['mozilla-pack.js','aosp-pack.js','ai-pack.js','libreoffice-pack.js','dictionary.js','native-provider.js','network-provider.js','chain-provider.js','overlay.js','native-controls.js']});
  await sendFixes(tab.id);
  const results=await api.scripting.executeScript({target:{tabId:tab.id},func:(from,to)=>globalThis.LanguageStickerLocalControls.show(from,to),args:[source.value,target]});
  const result=results?.[0]?.result?.state;
  // No Chrome local engine here (e.g. some devices): run dictionary + mock AI directly.
  if(['missing-api','unavailable'].includes(result)){
   await api.scripting.executeScript({target:{tabId:tab.id},func:async(from,to,localPacks)=>{
    for(const pack of localPacks)globalThis.LanguageStickerDictionary.register(pack);
    const chain=globalThis.LanguageStickerChain;
    await chain.start(from,to,{native:null,ai:chain.mockAI,onUpdate:()=>globalThis.LanguageSticker.refresh()});
    globalThis.LanguageSticker.enable(to,from,chain);return true;
   },args:[source.value,target,packs]});
   status.textContent='אין כאן מנוע תרגום מקומי. פועלים מילון ו-AI מדומה (מצב בדיקה, ללא עלות). ✦ מסמן תרגום AI.';
   return;
  }
  const messages={'awaiting-user':'בעמוד מופיע כפתור אישור לתרגום מקומי. טרם הופעל תרגום.', 'missing-api':'אין מנוע תרגום מקומי נגיש בדפדפן או בעמוד זה. אפשר להשתמש במילון.',unavailable:'צמד השפות אינו זמין לתרגום מקומי כאן.','same-language':'שפת המקור והיעד זהות; אין צורך במדבקה.'};
  status.textContent=messages[result]||'לא התקבל אישור הפעלה.';
 }catch{status.textContent='התרגום המקומי לא הופעל. בדוק קוד שפה וגישת התוסף לעמוד.';}
}

// 0.3.31: feedback loop, first step. The user's own corrections are stored only on this computer
// and win over every other source. 0.3.56 / 0.5.9: kept per language pair, so every language works.
const Fixes=globalThis.LanguageStickerFixes;
async function sendFixes(tabId){
 const all=await Fixes.load(api).catch(()=>({}));
 await api.scripting.executeScript({target:{tabId},func:fixes=>{globalThis.LanguageStickerDictionary?.setFixes?.(fixes);},args:[all]}).catch(()=>{});
}
if(installed){
 const fixStatus=document.getElementById('fix-status');
 document.getElementById('fix-export')?.addEventListener('click',async()=>{
  const all=await Fixes.load(api);const n=Object.values(all).reduce((t,list)=>t+Object.keys(list||{}).length,0);
  if(!n){fixStatus.textContent='אין עדיין תיקונים לייצוא.';return;}
  const blob=new Blob([JSON.stringify({schemaVersion:1,kind:'language-sticker-fixes',fixes:all},null,1)],{type:'application/json'});
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='sticker-fixes.json';a.click();
  fixStatus.textContent=`יוצאו ${n} תיקונים ב-${Object.keys(all).length} צמדי שפות.`;
 });
 // ---- 0.3.56 / 0.5.9: core users and on-screen correction
 const fixBtn=document.getElementById('screen-fix'),coreNote=document.getElementById('core-status');
 async function showMember(){
  const m=await Fixes.member(api);fixBtn.hidden=!m;
  document.getElementById('core-join').hidden=Boolean(m);
  coreNote.replaceChildren();
  if(m){coreNote.append(`✓ משתמש יסוד ${m}. אפשר לתקן על המסך. `);
   const {coreMember}=await api.storage.local.get('coreMember');
   if(coreMember){const out=document.createElement('a');out.href='#';out.textContent='יציאה';out.addEventListener('click',async e=>{e.preventDefault();await Fixes.leave(api);showMember();});coreNote.append(out);}}
 }
 document.getElementById('core-ok').addEventListener('click',async()=>{
  const input=document.getElementById('core-code');
  const m=await Fixes.join(api,input.value).catch(()=>null);
  if(!m){coreNote.textContent='הקוד לא תקין. בדקו שהעתקתם אותו במלואו.';return;}
  input.value='';showMember();
 });
 fixBtn.addEventListener('click',async()=>{
  try{
   const [tab]=await api.tabs.query({active:true,currentWindow:true});
   const [r]=await api.scripting.executeScript({target:{tabId:tab.id},func:()=>globalThis.LanguageSticker?.status?.().enabled?globalThis.LanguageSticker.correct(true):false});
   if(r?.result){window.close();return;}
   status.textContent='קודם לחצו "תרגם את האתר", ואז "תיקון על המסך".';
  }catch{status.textContent='אי אפשר לתקן בדף הזה.';}
 });
 showMember();
}

// 0.3.52: feedback opens as a side panel beside the page, so the translated page stays visible.
let dtsWindowId=null;api.windows?.getCurrent().then(w=>{dtsWindowId=w.id;}).catch(()=>{});
document.getElementById('open-feedback')?.addEventListener('click',()=>{
 if(dtsWindowId!==null&&api.sidePanel)api.sidePanel.open({windowId:dtsWindowId}).catch(()=>api.tabs.create({url:api.runtime.getURL('feedback.html')}));
 else api.tabs.create({url:api.runtime.getURL('feedback.html')});
 setTimeout(()=>window.close(),150);
});
