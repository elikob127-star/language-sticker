// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 E, Language Sticker (LS) project owner.
(() => {
 if(globalThis.LanguageStickerLocalControls)return;
 let host=null, generation=0;
 function removeUi(){host?.remove();host=null;}
 function close(){generation++;globalThis.LanguageSticker.disable();globalThis.LanguageStickerChain?.stop();globalThis.LanguageStickerNative.stop();removeUi();}
 async function show(from,to){
  const canonical=Intl.getCanonicalLocales;from=canonical(from)[0];to=canonical(to)[0];
  close();const epoch=generation;
  const state=await globalThis.LanguageStickerNative.availability(from,to);
  if(epoch!==generation)return {state:'cancelled'};
  if(!['available','downloadable','downloading'].includes(state))return {state};
  host=document.createElement('div');host.setAttribute('data-sticker-private','');
  host.style.cssText='all:initial;position:fixed;bottom:16px;right:16px;z-index:2147483647;max-width:min(320px,calc(100vw - 32px));';
  const root=host.attachShadow({mode:'closed'});
  const box=document.createElement('section');box.dir='rtl';box.setAttribute('aria-label','מדבקת שפה — אישור תרגום');
  box.style.cssText='font:14px/1.55 system-ui;background:#fff;color:#172821;border:1px solid #6b8176;border-radius:12px;padding:14px;box-shadow:0 8px 28px #0003;';
  const note=document.createElement('p');note.setAttribute('role','status');note.style.cssText='margin:0 0 10px;';
  note.textContent='התרגום מתבצע במכשיר. ייתכן שהדפדפן יוריד מודל שפה; טקסט האתר אינו נשלח לשירות תרגום.';
  const start=document.createElement('button');start.textContent='הפעל תרגום';
  const dismiss=document.createElement('button');dismiss.textContent='ביטול';
  // 0.3.8: confirm is one full-width primary button, cancel sits under it - no left/right guessing.
  start.style.cssText='display:block;width:100%;font:600 15px system-ui;min-height:44px;margin:0;padding:10px 12px;background:#d7f8a3;color:#183a29;border:1px solid #9cc56a;border-radius:9px;cursor:pointer;';
  dismiss.style.cssText='display:block;width:100%;font:14px system-ui;min-height:40px;margin:8px 0 0;padding:8px 12px;background:transparent;color:#4a5d53;border:1px solid #b9c6bd;border-radius:9px;cursor:pointer;';
  dismiss.onclick=close;
  start.onclick=async()=>{
   if(epoch!==generation)return;
   start.disabled=true;dismiss.disabled=true;
   try{
    const pending=globalThis.LanguageStickerNative.start(from,to,()=>{
      if(epoch!==generation)return;
      const s=globalThis.LanguageStickerNative.status();
      if(s.phase==='starting')note.textContent=`מכין תרגום מקומי: ${Math.round((s.downloadProgress||0)*100)}%`;
      globalThis.LanguageSticker.refresh();
    });
    if(await pending && epoch===generation){
      // Chain (learned dictionary -> Chrome local -> AI) when loaded; plain native otherwise.
      const chain=globalThis.LanguageStickerChain;
      if(chain){
        await chain.start(from,to,{native:globalThis.LanguageStickerNative,ai:chain.mockAI,onUpdate:()=>globalThis.LanguageSticker.refresh()});
        if(epoch!==generation)return;
        globalThis.LanguageSticker.enable(to,from,chain);
      }else globalThis.LanguageSticker.enable(to,from,globalThis.LanguageStickerNative);
      // Customer-facing mode: after approval, get out of the way. The extension popup
      // remains the control surface; Alt temporarily reveals the original page text.
      removeUi();
    }
   }catch{
    if(epoch===generation){note.textContent='התרגום לא הופעל. ייתכן שהשפה או המודל אינם זמינים בדפדפן זה.';start.disabled=false;dismiss.disabled=false;}
   }
  };
  box.append(note,start,dismiss);root.append(box);document.documentElement.append(host);
  return {state:'awaiting-user'};
 }
 globalThis.LanguageStickerLocalControls=Object.freeze({show,close});
})();
