// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 E, Language Sticker (LS) project owner.
(() => {
 'use strict';
 if (globalThis.LanguageStickerNetwork) return;
 // "Mycelium" slot (תפטיר): a shared phrase network across users.
 // Test stage: read-only table bundled inside the extension. No server, no network, no cost.
 // Future: the same lookup() will read a shared list downloaded from the network.
 // Privacy rule for the future: only the phrase and its translation may ever be shared —
 // never the site address, page content, or anything identifying the user.
 const normalize = globalThis.LanguageStickerDictionary?.normalize ||
  (t => t.normalize('NFC').replace(/\s+/g, ' ').trim().toLowerCase());
 // Shape: { 'en>he': { 'phrase': 'תרגום' } }. Filled manually each version for now.
 const shared = Object.create(null);
 function lookup(text, from, to) {
  if (typeof text !== 'string') return null;
  const table = shared[`${from}>${to}`];
  if (!table) return null;
  const t = table[normalize(text)];
  return typeof t === 'string' && t.trim() ? t : null;
 }
 // Test hook only: loads entries into memory for this page; nothing is saved or sent.
 function load(pair, entries) {
  if (!/^[a-z-]+>[a-z-]+$/i.test(pair) || !entries || typeof entries !== 'object') return 0;
  const table = shared[pair] || (shared[pair] = Object.create(null));
  let n = 0;
  for (const [k, v] of Object.entries(entries).slice(0, 5000))
   if (typeof v === 'string' && v.trim() && k.length <= 180 && v.length <= 180) { table[normalize(k)] = v.trim(); n++; }
  return n;
 }
 const size = () => Object.values(shared).reduce((s, t) => s + Object.keys(t).length, 0);
 globalThis.LanguageStickerNetwork = Object.freeze({ lookup, load, size });
})();
