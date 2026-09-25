// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 E, Language Sticker (LS) project owner.
(() => {
 const $=id=>document.getElementById(id),engine=globalThis.LanguageSticker,lex=globalThis.LanguageStickerDictionary;
 const toggle=$('preview-toggle'),note=$('sample-status');let enabled=false,clicks=0,changing=false;
 function refresh(){
  const source=$('source').value||'en',target=$('language').value||'he';
  const key=changing?'account':'settings';
  $('sample-settings').textContent=lex.dictionaries[source]?.[key]||(changing?'Account':'Settings');
  $('sample-save').textContent=lex.dictionaries[source]?.save||'Save';
  $('sample-settings').parentElement.dir=lex.direction(source);
  if(enabled){engine.enable(target,source);note.textContent=source===target?'אותה שפה נבחרה — אין צורך במדבקה.':'המדבקה פעילה בדוגמה בלבד.';}else note.textContent='המקור מוצג';
 }
 toggle.addEventListener('click',()=>{enabled=!enabled;toggle.textContent=enabled?'הסר מדבקה מהדוגמה':'הצג מדבקה בדוגמה';if(!enabled)engine.disable();refresh();});
 $('preview-change').addEventListener('click',()=>{changing=!changing;refresh();note.textContent=enabled?'תוכן הדוגמה השתנה — השכבה מתעדכנת לפי המקור.':'תוכן הדוגמה השתנה; אפשר להפעיל את המדבקה.';});
 for(const id of ['sample-settings','sample-save'])$(id).addEventListener('click',()=>{clicks++;note.textContent=`הכפתור המקורי הופעל · ${clicks} לחיצות · ללא שינוי חשבון`;});
 for(const id of ['source','language'])$(id).addEventListener('change',refresh);
 refresh();
})();
