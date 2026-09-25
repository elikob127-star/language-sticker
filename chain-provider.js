// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 E, Language Sticker (LS) project owner.
(() => {
 'use strict';
 if (globalThis.LanguageStickerChain) return;
 // Translation chain. The built-in dictionary is checked by overlay.js before this runs.
 // Order here: learned dictionary (free, instant) -> shared network (mycelium slot) -> Chrome local engine (free, private)
 // -> AI (the only step that costs money). Every successful short-phrase result is saved
 // to the learned dictionary on this device, so the same phrase never costs again.
 const api = globalThis.chrome || globalThis.browser;
 const normalize = globalThis.LanguageStickerDictionary?.normalize || (t => t.trim().replace(/\s+/g, ' ').toLowerCase());
 const MAX_PHRASE_CHARS = 60, MAX_PHRASE_WORDS = 6;   // "UI phrase": buttons, menus, headings
 const MAX_AI_PER_PAGE = 50;                           // cost guard per activation
 const MAX_LEARNED = 5000, MAX_PENDING = 20, MAX_CACHE = 1000;
 const isPhrase = t => t.length <= MAX_PHRASE_CHARS && t.split(/\s+/).length <= MAX_PHRASE_WORDS;
 // 0.3.39: never send names, sizes, prices or numbers to the engine or AI (E's eBay screenshot:
 // "New Balance" became "איזון חדש", "US" became "לנו", prices got the ✦ mark).
 const BRANDS = new Set(['nike','adidas','new balance','asics','brooks','hoka','hoka one one','saucony','puma','reebok','mizuno','salomon','on','on running','skechers','under armour','the north face','patagonia','columbia','vans','converse','fila','jordan','air jordan','altra','merrell','timberland','crocs','birkenstock','lululemon','zara','h&m','uniqlo',"levi's",'gildan','apple','samsung','sony','google','amazon','ebay','walmart','best buy','expedia','booking.com','airbnb','ryanair','easyjet','kayak','viator','bbc','cnn','microsoft','dell','hp','lenovo','asus','acer','lg','bose','jbl','canon','nikon','gopro','dyson','ikea','lego','nintendo','playstation','xbox','shein','temu','aliexpress','etsy','iherb','asos','nordstrom','macy\'s','target','costco','sephora','ulta','champion','new era','ralph lauren','calvin klein','tommy hilfiger','guess','michael kors','coach','gucci','prada','balenciaga','versace','armani','hugo boss']);
 const keepOriginal = t => !/\p{L}/u.test(t)                        // numbers, prices, symbols
  || /^[A-Z]{1,4}$/.test(t)                                         // US, UK, EU, EE, XL
  || /^(US|UK|EU)\b/.test(t)                                        // size systems: "US W 9.5"
  || /^([A-Z]{3}|[$€£₪])\s?[\d.,]+/.test(t)                          // "ILS 36.46"
  || BRANDS.has(t.toLowerCase());
 const valid = (t, original) => typeof t === 'string' && t.trim() && t.length <= 8000 && t !== original;

 // Mock AI: no network, no cost. The ✦ mark makes AI-sourced text visible on screen.
 const mockAI = Object.freeze({ mock: true, async translate(text) {
  await new Promise(r => setTimeout(r, 400));
  return '✦ ' + text;
 }});

 let phase = 'idle', source = 'en', target = 'he', generation = 0;
 let native = null, ai = null, updated = () => {}, storageKey = '', saveTimer = 0;
 let learned = Object.create(null);
 const cache = new Map(), pending = new Set();
 let stats = {};
 const resetStats = () => { stats = { learnedHits: 0, networkHits: 0, nativeHits: 0, aiCalls: 0, aiHits: 0, failures: 0 }; };
 resetStats();

 async function load() {
  try { const v = await api?.storage?.local?.get(storageKey); const saved = v?.[storageKey];
   if (saved && typeof saved === 'object') for (const [k, t] of Object.entries(saved).slice(0, MAX_LEARNED)) if (typeof t === 'string') learned[k] = t;
  } catch {}
 }
 function save() {
  clearTimeout(saveTimer); saveTimer = 0;
  try { api?.storage?.local?.set({ [storageKey]: { ...learned } }); } catch {}
 }
 function remember(key, translation) {
  if (Object.keys(learned).length >= MAX_LEARNED) return;
  learned[key] = translation;
  clearTimeout(saveTimer); saveTimer = setTimeout(save, 1000);
 }

 async function start(from, to, { native: nativeProvider = null, ai: aiProvider = mockAI, onUpdate = () => {} } = {}) {
  stop();
  source = from; target = to; native = nativeProvider; ai = aiProvider; updated = onUpdate;
  // Mock results are kept apart so test output never pollutes the real learned dictionary.
  storageKey = `${ai?.mock ? 'learnedMock' : 'learned'}:${source}>${target}`;
  phase = 'loading'; const epoch = generation;
  await load();
  if (epoch !== generation) return false;
  phase = 'ready'; updated(); return true;
 }

 function stop() {
  if (saveTimer) save();
  generation++; phase = 'idle'; native = null; ai = null; updated = () => {};
  learned = Object.create(null); cache.clear(); pending.clear(); resetStats();
 }

 async function resolve(text, key, epoch) {
  let result = null, via = null;
  try {
   if (native?.translate) { const t = await native.translate(text); if (valid(t, text)) { result = t; via = 'native'; } }
   if (epoch !== generation) return;
   if (!result && ai && isPhrase(text) && stats.aiCalls < MAX_AI_PER_PAGE) {
    stats.aiCalls++;
    const t = await ai.translate(text, source, target);
    if (epoch !== generation) return;
    if (valid(t, text)) { result = t; via = 'ai'; }
   }
  } catch { if (epoch === generation) stats.failures++; }
  if (epoch !== generation) return;
  if (via === 'native') stats.nativeHits++; else if (via === 'ai') stats.aiHits++;
  if (cache.size >= MAX_CACHE) cache.clear();
  cache.set(key, result);
  // Privacy: only short UI phrases are stored, never paragraphs of page content.
  if (result && isPhrase(text)) remember(key, result);
  pending.delete(key); updated();
 }

 // Same interface as the native provider: synchronous, returns a translation or null,
 // and schedules background work that calls onUpdate() when a result is ready.
 function lookup(text, from, to) {
  if (phase !== 'ready' || from !== source || to !== target || typeof text !== 'string') return null;
  text = text.trim(); if (!text || text.length > 2000) return null;
  if (keepOriginal(text)) return null;   // also hides wrong results learned before 0.3.39
  const key = normalize(text);
  if (learned[key]) { stats.learnedHits++; return learned[key]; }
  // Mycelium slot: shared phrase network, checked before any engine or AI.
  const shared = globalThis.LanguageStickerNetwork?.lookup(text, source, target);
  if (shared) { stats.networkHits++; return shared; }
  if (cache.has(key)) return cache.get(key);
  if (pending.has(key) || pending.size >= MAX_PENDING) return null;
  pending.add(key); resolve(text, key, generation);
  return null;
 }

 globalThis.LanguageStickerChain = Object.freeze({ start, stop, lookup, mockAI,
  status: () => ({ phase, source, target, mockAI: Boolean(ai?.mock), native: Boolean(native),
   pending: pending.size, cached: cache.size, learned: Object.keys(learned).length, ...stats }) });
})();
