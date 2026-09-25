// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 E, Language Sticker (LS) project owner.
(() => {
 'use strict';
 if(globalThis.LanguageStickerNative)return;
 let session=null, generation=0, source='en',target='he', phase='idle', failures=0, downloading=0;
 const cache=new Map(), pending=new Set();let chain=Promise.resolve(),updated=()=>{};
 const canonical=code=>{if(typeof code!=='string'||!code.trim())throw new Error('invalid-language');return Intl.getCanonicalLocales(code)[0];};
 async function availability(from,to){
  try{from=canonical(from);to=canonical(to);if(from===to)return 'same-language';
   if(!globalThis.Translator)return 'missing-api';
   return await globalThis.Translator.availability({sourceLanguage:from,targetLanguage:to});
  }catch{return 'unavailable';}
 }
 function stop(){generation++;try{session?.destroy();}catch{}session=null;cache.clear();pending.clear();chain=Promise.resolve();phase='idle';failures=0;downloading=0;updated=()=>{};}
 // Invoke directly from an explicit click. Chrome may download language models here.
 async function start(from,to,onUpdate=()=>{}){
  stop();source=canonical(from);target=canonical(to);updated=onUpdate;
  if(source===target)throw new Error('same-language');
  if(!globalThis.Translator){phase='unavailable';throw new Error('missing-api');}
  phase='starting';const epoch=generation;
  try{
   const created=await globalThis.Translator.create({sourceLanguage:source,targetLanguage:target,monitor(m){m.addEventListener('downloadprogress',e=>{if(epoch===generation){downloading=e.loaded;updated();}});}});
   if(epoch!==generation){created.destroy();return false;}
   session=created;phase='ready';updated();return true;
  }catch(error){if(epoch===generation){phase='error';updated();}throw error;}
 }
 function lookup(text,from,to){
  text=text.trim();
  if(phase!=='ready'||from!==source||to!==target||!text||text.length>2000)return null;
  if(cache.has(text))return cache.get(text);
  if(pending.has(text)||cache.size+pending.size>=500)return null;
  pending.add(text);const epoch=generation;
  chain=chain.then(async()=>{
   if(epoch!==generation)return;
   try{
    const translated=await session.translate(text);
    if(epoch!==generation)return;
    const valid=typeof translated==='string'&&translated.length<=8000&&translated.trim()&&translated!==text;
    cache.set(text,valid?translated:null);
   }catch{if(epoch===generation){failures++;cache.set(text,null);}}
   finally{if(epoch===generation){pending.delete(text);updated();}}
  });
  return null;
 }
 // Promise-based single translation, used by the translation chain. Shares the same
 // serialized queue as lookup(); resolves to null on any failure, never rejects.
 function translate(text){
  if(phase!=='ready'||typeof text!=='string'||!text.trim()||text.length>2000)return Promise.resolve(null);
  const epoch=generation;
  const job=chain.then(async()=>{
   if(epoch!==generation)return null;
   try{
    const t=await session.translate(text);
    return (typeof t==='string'&&t.trim()&&t.length<=8000&&t!==text)?t:null;
   }catch{if(epoch===generation)failures++;return null;}
  });
  chain=job;return job;
 }
 globalThis.LanguageStickerNative=Object.freeze({availability,start,stop,lookup,translate,
  status:()=>({phase,source,target,pending:pending.size,cached:cache.size,failures,downloadProgress:downloading})});
})();
