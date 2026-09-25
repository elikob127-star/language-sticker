// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 E, Language Sticker (LS) project owner.
// 0.3.46: "do not stick" sites. Mail, messaging and banks are off by default (privacy, and a
// sticker left on in a Gmail tab kept translating every mail). A site where E peeled the sticker
// off twice joins the list by itself. A click in the menu can still start it there, once.
globalThis.LanguageStickerNoStick=(()=>{
 const defaults=['mail.google.com','outlook.live.com','outlook.office.com','outlook.office365.com','mail.yahoo.com','web.whatsapp.com','web.telegram.org','paypal.com','bankhapoalim.co.il','leumi.co.il','discountbank.co.il','mizrahi-tefahot.co.il','fibi.co.il','bankjerusalem.co.il','mercantile.co.il','onezero.co.il'];
 const match=(host,site)=>host===site||host.endsWith('.'+site);
 const reason=(host,peeled={})=>{
  if(!host)return null;
  if(defaults.some(site=>match(host,site)))return 'default';
  if((peeled[host]||0)>=2)return 'peeled';
  return null;
 };
 return Object.freeze({reason,defaults});
})();
