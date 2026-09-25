// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 E, Language Sticker (LS) project owner.
// 0.3.56 / 0.5.9: the user's corrections, stored on this computer only, per language pair
// ({"en>he": {...}, "de>fr": {...}}), so they work in every language. Also: core-user membership.
(()=>{
 if(globalThis.LanguageStickerFixes)return;
 async function load(api){
  const v=await api.storage.local.get(['fixes','corrections']);
  const all=v.fixes&&typeof v.fixes==='object'?v.fixes:{};
  // Before 0.3.56 corrections were one list, always English -> Hebrew. Moved once into "en>he".
  if(v.corrections&&typeof v.corrections==='object'&&Object.keys(v.corrections).length){
   all['en>he']={...v.corrections,...(all['en>he']||{})};
   await api.storage.local.set({fixes:all});await api.storage.local.remove('corrections');
  }
  return all;
 }
 async function add(api,pair,text,value){
  if(!/^[\w-]{2,35}>[\w-]{2,35}$/.test(pair||'')||!text||!value)return false;
  const all=await load(api);const list=all[pair]||{};
  if(Object.keys(list).length>=2000&&!list[text])return false;
  list[text.trim().slice(0,180)]=value.trim().slice(0,180);all[pair]=list;
  await api.storage.local.set({fixes:all});return true;
 }
 // Core users: a personal join code from E. Only its fingerprint (hash) is in the code; the codes
 // themselves are never published. The member number (e.g. 07) is what the sheet counts.
 async function hash(text){
  const d=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text));
  return [...new Uint8Array(d)].map(b=>b.toString(16).padStart(2,'0')).join('');
 }
 async function join(api,code){
  const clean=String(code||'').toUpperCase().replace(/[\s_]/g,'');
  const m=clean.match(/^LS(\d{2})-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/);if(!m)return null;
  const want=globalThis.LanguageStickerConfig?.coreCodes?.[m[1]];
  if(!want||await hash('LS-core:'+clean)!==want)return null;
  await api.storage.local.set({coreMember:m[1]});return m[1];
 }
 async function member(api){
  const {coreMember}=await api.storage.local.get('coreMember');
  return coreMember||globalThis.LanguageStickerConfig?.ownerMember||null;
 }
 async function leave(api){await api.storage.local.remove('coreMember');}
 globalThis.LanguageStickerFixes=Object.freeze({load,add,join,member,leave,hash});
})();
