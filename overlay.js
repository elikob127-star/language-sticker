// SPDX-License-Identifier: MPL-2.0
// Copyright (c) 2026 E, Language Sticker (LS) project owner.
(() => {
  'use strict';
  if (globalThis.LanguageSticker) return;
  const lexicon = globalThis.LanguageStickerDictionary;
  const {normalize, dictionaries} = lexicon;
  const uiSelector = 'button,a,nav,label,summary,h1,h2,h3,h4,[role="button"],[role="tab"],[role="menuitem"],[role="switch"],[role="dialog"],dialog';
  const excluded = 'input,textarea,select,option,script,style,code,pre,[contenteditable]:not([contenteditable="false"]),[data-message-author-role],article,[role="log"],[data-sticker-private],svg,canvas,img,[role="img"],[translate="no"],[class*="logo" i],[id*="logo" i]';
  let language = 'he', sourceLanguage = 'en', running = false, peek = false, host, layer, observer, timer, frame;
  // 0.3.34: controls (Share, Save...) inside an <article> are interface, not article text (BBC).
  // Article text itself (paragraphs, headlines, links in the body) is still left alone.
  const controls = 'button,[role="button"],label,summary,[role="tab"],[role="menuitem"],[role="switch"]';
  const blocked = el => { const ex = provider ? excluded.replace('article,','') : excluded;
    if (!el.closest(ex)) return false;
    if (!provider && el.closest(controls) && el.closest('article')) return Boolean(el.closest(excluded.replace('article,','')));
    return true; };
  let provider = null, scanned = 0, testVisible = false;
  // 0.3.56 / 0.5.9: on-screen correction for core users. In this mode each translated tile can be
  // clicked and fixed in place; the fix is sent (via the extension) and used at once on this page.
  let correcting = false, editing = null, shadowRoot = null, banner = null;
  const tileData = new WeakMap();
  let records = [], redraws = 0, skipped = 0, privateSelection = false, altHeld = false, lastActive = Date.now();
  // 0.3.46: the sticker falls asleep after 5 minutes without scrolling, mouse or keys,
  // so it never stays on for hours in a forgotten tab (Gmail).
  const SLEEP_MS = 5 * 60 * 1000;
  const active = () => { lastActive = Date.now(); };
  const activity = ['scroll','wheel','pointermove','pointerdown','keydown','touchstart'];
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  // 0.3.8: a transparent layer on top of text (e.g. a card-wide click link) does not hide it.
  // Anything with a real background, image or blur (menus, dialogs, popups) still blocks.
  const seeThrough = h => { const s = getComputedStyle(h);
    const bg = s.backgroundColor.replace(/\s/g,'');
    const clearBg = bg === 'transparent' || /^rgba\(\d+,\d+,\d+,0(\.0+)?\)$/.test(bg);
    return clearBg && s.backgroundImage === 'none' && (s.backdropFilter || 'none') === 'none'; };
  const clearAt = (el, x, y) => { for (const h of document.elementsFromPoint(x, y)) {
      // 0.3.45: the text's own ancestor (its link or menu bar) is its background, not a cover.
      // The top pixel of a glyph can stick out above its small <span> (B&H green menu).
      // A foreign element with a real background above the text still blocks.
      if (h === el || el.contains(h) || h.contains(el)) return true;
      if (!seeThrough(h)) return false; }
    return false; };
  // 0.3.10: sites like Expedia mark visible labels as hidden-from-screen-readers and keep a
  // hidden duplicate for them. Visible marked text is translated; icon glyphs still are not.
  const iconLike = (el, text) => /icon|symbol|material|awesome|glyph/i.test(getComputedStyle(el).fontFamily) || /^[a-z0-9]+(_[a-z0-9]+)+$/i.test(text.trim());
  // 0.3.19: a "transform" that changes nothing (identity) and is not animating is not moving text.
  // Sites like BBC put one on the whole menu. Real movement (tickers, animations) is still skipped.
  const identity = /^matrix\(1, 0, 0, 1, 0, 0\)$|^matrix3d\(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1\)$/;
  const moving = (e, s) => s.transform !== 'none' && (!identity.test(s.transform) || (e.getAnimations?.() || []).some(a => a.playState === 'running'));
  // 0.3.6: readability check. Canvas normalizes any CSS color (rgb, hex, oklch...) to hex/rgba.
  function rgb(color) {
    let c = color;
    if (ctx) { ctx.fillStyle = '#000'; ctx.fillStyle = color; c = ctx.fillStyle; }
    let m = /^#([0-9a-f]{6})$/i.exec(c);
    if (m) { const n = parseInt(m[1], 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; }
    m = /rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/i.exec(c);
    return m ? [+m[1], +m[2], +m[3]] : null;
  }
  function luminance([r, g, b]) {
    const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  }
  // Never paint a tile the reader cannot read (e.g. white text over a photo -> white box).
  function readable(fg, bg) {
    const a = rgb(fg), b = rgb(bg);
    if (!a || !b) return false;
    const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05) >= 3;
  }
  // 0.3.6: "screen protector" scan. Whole subtrees that are hidden or entirely outside
  // the visible screen are skipped before any work is done on them.
  function offscreen(el) {
    // 0.3.20: display:contents wrappers have no box of their own; their children can still be visible (BBC).
    if (el.checkVisibility && !el.checkVisibility() && getComputedStyle(el).display !== 'contents') return true;
    const r = el.getBoundingClientRect();
    if (!r.width && !r.height) return false; // no own box (e.g. display:contents): look inside
    return r.bottom < 0 || r.right < 0 || r.top > innerHeight || r.left > innerWidth;
  }
  function background(el) {
    let backdrop = null;
    for (let e = el; e; e = e.parentElement) {
      const s = getComputedStyle(e);
      // Check the entire ancestor chain, even after finding an opaque backdrop.
      // Otherwise a solid button inside an invisible parent could be revealed.
      if (Number(s.opacity) === 0 || moving(e, s)) return null;
      if (backdrop) {
        if (Number(s.opacity) < 1) return null;
        continue;
      }
      if (s.backgroundImage !== 'none' && e !== document.body && e !== document.documentElement) return null;
      const c = s.backgroundColor;
      if (c && c !== 'transparent' && !/rgba\([^)]*,\s*0\s*\)/.test(c)) {
        // A transparent wrapper may fade its text without changing the backdrop.
        // Keep translated text fully legible; translucent painted backdrops still
        // require compositing that this version deliberately does not guess.
        if (Number(s.opacity) < 1) return null;
        if (c.startsWith('rgba(') && !/[,/]\s*1\s*\)/.test(c)) return null;
        backdrop = c;
      }
    }
    return backdrop || (getComputedStyle(document.documentElement).colorScheme === 'dark' ? '#121212' : '#ffffff');
  }
  function schedule() {
    if (!running || frame || editing) return;
    // Old positions must never remain visible while layout is moving.
    layer.style.visibility = 'hidden';
    if (document.hidden && testVisible) { frame = setTimeout(() => { frame = 0; render(); }, 50); return; }
    frame = requestAnimationFrame(() => { frame = 0; render(); });
  }
  function hiddenBySelection() {
    const sel = document.getSelection();
    return privateSelection || (sel && !sel.isCollapsed);
  }
  function render() {
    if (!running) return;
    layer.replaceChildren(); records = []; skipped = 0; scanned = 0; redraws++;
    // 0.3.40 (private beta): Claude's test tab is usually in the background, where Chrome pauses
    // drawing. The beta test trigger sets testVisible so the sticker still draws there.
    if (peek || altHeld || hiddenBySelection() || (document.hidden && !testVisible)) return;
    const seen = new Set(), fragment = document.createDocumentFragment();
    // 0.3.37: a box that is off the screen may still hold visible children when its content
    // overflows it (eBay: result list inside a 0–29px tall wrapper above the screen). Such a
    // subtree is no longer skipped; only boxes whose content fits inside them are skipped.
    const overflowing = n => n.scrollHeight > n.clientHeight + 1 || n.scrollWidth > n.clientWidth + 1;
    const skipSubtree = {acceptNode: n => n.nodeType === 1 && (n === host || (offscreen(n) && !overflowing(n))) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT};
    // 0.3.36: shop listings put labels ("Brand New", "Buy It Now", "Located in China") in plain
    // text boxes, not in buttons or links, so they were never scanned (eBay, below the fold).
    // The body is now walked too, but outside UI elements only short dictionary labels are used,
    // never paragraphs or article text. Offscreen parts are still skipped (screen-protector).
    const roots = provider ? [document.body] : [...document.querySelectorAll(uiSelector), document.body];
    for (const root of roots) {
      if (root === host || blocked(root) || offscreen(root)) continue;
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, skipSubtree);
      let node, visited = 0;
      while ((node = walker.nextNode()) && records.length < 250 && scanned < 2000 && ++visited < 20000) {
        if (node.nodeType !== 3) continue;
        if (seen.has(node)) continue;
        seen.add(node); scanned++;
        const el = node.parentElement;
        if (!el || blocked(el) || el.closest('[hidden]') || (el.closest('[aria-hidden="true"]') && iconLike(el, node.textContent))) continue;
        // Exact local dictionary matches only. No values, requests, model or inference.
        if (!provider && root === document.body && !el.closest(uiSelector)) {
          const text = node.textContent.trim();
          if (text.length > 40 || text.split(/\s+/).length > 5 || el.closest('p,article,blockquote,figcaption,li p,td p')) continue;
        }
        let translation = lexicon.lookup(node.textContent,sourceLanguage,language);
        const style = getComputedStyle(el);
        if (style.visibility !== 'visible' || style.display === 'none' || style.webkitTextSecurity === 'disc') continue;
        const start = node.textContent.search(/\S/), end = node.textContent.trimEnd().length;
        // Whitespace is a text node too; a negative Range offset aborts the frame.
        if (start < 0 || end <= start) continue;
        const range = document.createRange(); range.setStart(node, start); range.setEnd(node, end);
        const boxes = [...range.getClientRects()].filter(r => r.width > 1 && r.height > 1);
        if (!boxes.length) continue;
        const multiline=boxes.length>1;
        if(multiline && el.childNodes.length!==1) { skipped++; continue; }
        let r = multiline ? range.getBoundingClientRect() : boxes[0];
        if (r.top < 0 || r.left < 0 || r.bottom > innerHeight || r.right > innerWidth) continue;
        // Do not paint through menus, dialogs, clipped scroll regions or other occluders.
        const points = [[r.left+1,r.top+r.height/2],[r.right-1,r.top+r.height/2],[r.left+r.width/2,r.top+1],[r.left+r.width/2,r.bottom-1]];
        if (!points.every(([x,y]) => clearAt(el,x,y))) continue;
        const bg = background(el);
        if (!bg) { skipped++; continue; }
        if(!translation && provider) translation=provider.lookup(node.textContent,sourceLanguage,language);
        if(!translation) continue;
        // 0.3.11: no Hebrew vowel marks (E's decision). Punctuation like maqaf stays.
        if(language==='he') translation=translation.replace(/[\u0591-\u05BD\u05BF\u05C1\u05C2\u05C4\u05C5\u05C7]/g,'');
        if (!readable(style.color, bg)) { skipped++; continue; }
        let size = parseFloat(style.fontSize);
        ctx.font = `${style.fontWeight} ${size}px ${style.fontFamily}`;
        const measured = ctx.measureText(translation).width;
        if(multiline){
          const fits=fontSize=>{ctx.font=`${style.fontWeight} ${fontSize}px ${style.fontFamily}`;let lines=1,width=0;for(const char of translation){const w=ctx.measureText(char).width;if(width+w>r.width){lines++;width=0;}width+=w;}return lines*fontSize*1.25<=r.height;};
          while(size>=10&&!fits(size))size-=0.5;
        }else if (measured > r.width) {
          // 0.3.20: a short label (menu item, tag) may use its own element's full width, e.g. link padding.
          // Still never beyond the element itself, so neighbours are never covered.
          const own = el.childNodes.length === 1 ? el.getBoundingClientRect() : null;
          if (own && own.width > r.width && own.left >= 0 && own.right <= innerWidth && own.top <= r.top + 1 && own.bottom >= r.bottom - 1) {
            const extra = Math.min(own.width, measured) - r.width;
            const left = Math.max(own.left, Math.min(r.left - extra / 2, own.right - (r.width + extra)));
            r = new DOMRect(left, r.top, r.width + extra, r.height);
          }
          if (measured > r.width) size *= r.width / measured;
        }
        if (size < 10) { skipped++; continue; }
        const tile = document.createElement('span');
        tile.textContent = translation;
        tile.style.cssText = `all:initial;position:fixed;box-sizing:border-box;pointer-events:${correcting?'auto':'none'};display:flex;align-items:center;justify-content:center;overflow:hidden;white-space:nowrap;unicode-bidi:isolate;`;
        Object.assign(tile.style, {left:r.left+'px',top:r.top+'px',width:r.width+'px',height:r.height+'px',background:bg,color:style.color,fontFamily:style.fontFamily,fontWeight:style.fontWeight,fontSize:size+'px',direction:lexicon.direction(language),lineHeight:'1'});
        if(multiline)Object.assign(tile.style,{display:'block',whiteSpace:'normal',overflowWrap:'anywhere',lineHeight:'1.25',textAlign:'start'});
        if(correcting){Object.assign(tile.style,{cursor:'pointer',outline:'2px dashed #8fb84a',outlineOffset:'1px'});
          tileData.set(tile,{original:node.textContent.replace(/\s+/g,' ').trim().slice(0,180),translated:translation});
          tile.title='לחצו לתיקון';tile.addEventListener('click',openEditor);}
        fragment.append(tile);
        records.push({source: normalize(node.textContent), translated:translation, rect:{x:r.x,y:r.y,width:r.width,height:r.height}});
      }
    }
    layer.append(fragment); layer.style.visibility = 'visible';
  }
  const ours = e => host && e.composedPath?.().includes(host);
  function onDown(e) { if (ours(e)) return; privateSelection = true; schedule(); }
  function onUp() { privateSelection = false; schedule(); }
  function onKey(e) {
    if (e.key === 'Escape' && e.type === 'keydown' && (editing || correcting)) { if (editing) closeEditor(); else correct(false); return; }
    if (e.key === 'Alt' && !ours(e)) { altHeld = e.type === 'keydown'; schedule(); } }
  // ---- 0.3.56 / 0.5.9: on-screen correction
  const css = (e, text) => { e.style.cssText = 'all:initial;box-sizing:border-box;font:14px/1.45 system-ui,-apple-system,sans-serif;color:#172821;' + text; return e; };
  function showBanner() {
    banner?.remove(); if (!correcting || !shadowRoot) return;
    banner = css(document.createElement('div'), 'position:fixed;top:10px;left:50%;transform:translateX(-50%);pointer-events:auto;display:flex;gap:10px;align-items:center;background:#d2f895;border:1px solid #8fb84a;border-radius:20px;padding:6px 8px 6px 14px;box-shadow:0 4px 14px #0003;direction:rtl;max-width:calc(100vw - 20px);');
    const t = css(document.createElement('span'), 'font-weight:600;'); t.textContent = '✏️ מצב תיקון: לחצו על תרגום כדי לתקן · Esc ליציאה';
    const x = css(document.createElement('button'), 'cursor:pointer;background:#fff;border:1px solid #8fb84a;border-radius:50%;width:26px;height:26px;text-align:center;');
    x.type = 'button'; x.textContent = '✕'; x.title = 'יציאה ממצב תיקון'; x.addEventListener('click', e => { e.stopPropagation(); correct(false); });
    banner.append(t, x); shadowRoot.append(banner);
  }
  function correct(on = true) {
    correcting = Boolean(on) && running; if (!correcting) closeEditor(); showBanner(); frame = 0; schedule();
    return correcting;
  }
  function closeEditor() { editing?.remove(); editing = null; if (running) schedule(); }
  function openEditor(e) {
    e.preventDefault(); e.stopPropagation();
    const data = tileData.get(e.currentTarget); if (!data || editing) return;
    const r = e.currentTarget.getBoundingClientRect();
    const box = css(document.createElement('section'), 'position:fixed;pointer-events:auto;display:block;background:#fff;border:1px solid #6b8176;border-radius:12px;padding:12px;box-shadow:0 8px 28px #0004;direction:rtl;');
    const w = Math.min(360, innerWidth - 16), below = r.bottom + 8 + 250 < innerHeight;
    Object.assign(box.style, { width: w + 'px', left: Math.max(8, Math.min(r.left, innerWidth - w - 8)) + 'px', top: (below ? r.bottom + 8 : Math.max(8, r.top - 258)) + 'px' });
    const head = css(document.createElement('div'), 'display:block;font-weight:700;margin-bottom:4px;'); head.textContent = 'תיקון התרגום';
    const orig = css(document.createElement('div'), 'display:block;font-size:13px;color:#4a5d53;margin-bottom:8px;overflow-wrap:anywhere;');
    const o = document.createElement('bdi'); o.textContent = data.original; orig.append('מקור: ', o);
    const field = css(document.createElement('input'), 'display:block;width:100%;padding:8px 10px;border:1px solid #9cc56a;border-radius:8px;background:#fff;font-size:15px;');
    field.value = data.translated; field.maxLength = 180; field.dir = lexicon.direction(language); field.setAttribute('aria-label', 'התרגום הנכון');
    const why = css(document.createElement('input'), 'display:block;width:100%;margin-top:6px;padding:7px 10px;border:1px solid #b9c6bd;border-radius:8px;background:#fff;font-size:13px;');
    why.placeholder = 'למה? הקשר או מינוח (רשות)'; why.maxLength = 200; why.dir = 'auto';
    const siteRow = css(document.createElement('label'), 'display:flex;gap:6px;align-items:center;margin-top:8px;font-size:12px;color:#4a5d53;cursor:pointer;');
    const site = css(document.createElement('input'), 'cursor:pointer;appearance:auto;-webkit-appearance:checkbox;width:15px;height:15px;margin:0;'); site.type = 'checkbox'; site.checked = true; siteRow.append(site, 'לצרף את כתובת הדף');
    const row = css(document.createElement('div'), 'display:flex;gap:8px;margin-top:10px;');
    const ok = css(document.createElement('button'), 'flex:1;text-align:center;cursor:pointer;font-weight:600;padding:9px;background:#d7f8a3;border:1px solid #9cc56a;border-radius:9px;');
    const no = css(document.createElement('button'), 'flex:1;text-align:center;cursor:pointer;padding:9px;background:transparent;border:1px solid #b9c6bd;border-radius:9px;color:#4a5d53;');
    ok.type = no.type = 'button'; ok.textContent = '✔ שליחה'; no.textContent = 'ביטול'; row.append(ok, no);
    const note = css(document.createElement('div'), 'display:block;margin-top:8px;font-size:12px;color:#4a5d53;'); note.setAttribute('role', 'status');
    note.textContent = 'נשלח רק לצוות המדבקה. בלי פרטים אישיים.';
    box.append(head, orig, field, why, siteRow, row, note);
    for (const t of ['keydown', 'keyup', 'keypress']) box.addEventListener(t, ev => { if (ev.key !== 'Escape') ev.stopPropagation(); });
    field.addEventListener('keydown', ev => { if (ev.key === 'Enter') { ev.preventDefault(); ok.click(); } });
    no.addEventListener('click', closeEditor);
    ok.addEventListener('click', async () => {
      const after = field.value.replace(/\s+/g, ' ').trim();
      if (!after) { note.textContent = 'כתבו את התרגום הנכון.'; field.focus(); return; }
      if (after === data.translated) { note.textContent = 'זה אותו תרגום. שנו אותו, או ביטול.'; field.focus(); return; }
      ok.disabled = no.disabled = true; note.textContent = 'שולח…';
      lexicon.fix?.(sourceLanguage, language, data.original, after);
      let page = ''; try { if (site.checked) page = location.origin + location.pathname; } catch {}
      let res = null;
      try { res = await globalThis.chrome?.runtime?.sendMessage({ type: 'ls-screen-fix', fix: { pair: `${sourceLanguage}>${language}`, source: data.original, before: data.translated, after, why: why.value.trim(), page } }); } catch {}
      note.textContent = res?.sent ? 'נשלח. תודה! התיקון כבר מופיע אצלך.' : res?.saved ? 'נשמר אצלך. השליחה לא הצליחה, נסו שוב מאוחר יותר.' : 'נשמר בדף הזה בלבד.';
      setTimeout(closeEditor, 1400);
    });
    editing = box; shadowRoot.append(box); field.focus(); field.select();
  }
  function blur() { altHeld = false; privateSelection = false; schedule(); }
  const events = [['scroll',schedule,true],['resize',schedule,false],['pointerdown',onDown,true],['pointerup',onUp,true],['pointercancel',onUp,true],['keydown',onKey,true],['keyup',onKey,true],['blur',blur,false],['focus',schedule,false]];
  function enable(lang='he',source='en',translationProvider=null) {
    if (!translationProvider && (!lexicon.dictionaries[lang]||!lexicon.dictionaries[source])) throw new Error('Unsupported dictionary');
    if(provider&&provider!==translationProvider)provider.stop?.();
    provider=translationProvider;language=lang;sourceLanguage=source;
    if (running) { schedule(); return; }
    running = true;
    host = document.createElement('div'); host.setAttribute('aria-hidden','true'); host.setAttribute('data-language-sticker','');
    host.style.cssText = 'all:initial!important;position:fixed!important;inset:0!important;z-index:2147483647!important;pointer-events:none!important;display:block!important;';
    const shadow = host.attachShadow({mode:'closed'}); shadowRoot = shadow; layer = document.createElement('div'); shadow.append(layer);
    // 0.3.46: peel corner. While the sticker is on, a small folded corner shows at the bottom-left.
    // One click peels the sticker off this tab. Two peels on the same site: it stops sticking there.
    const corner = document.createElement('button');
    corner.type = 'button'; corner.title = 'קילוף המדבקה (כיבוי)'; corner.setAttribute('aria-label','קילוף המדבקה (כיבוי)');
    corner.style.cssText = 'all:initial;position:fixed;left:0;bottom:0;width:30px;height:30px;cursor:pointer;pointer-events:auto;background:linear-gradient(45deg,#d2f895 0 50%,transparent 50%);clip-path:polygon(0 0,0 100%,100% 100%);filter:drop-shadow(1px -1px 2px rgba(0,0,0,.35));transition:width .15s,height .15s;';
    corner.addEventListener('mouseenter',()=>{corner.style.width=corner.style.height='42px';});
    corner.addEventListener('mouseleave',()=>{corner.style.width=corner.style.height='30px';});
    corner.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();peel();});
    shadow.append(corner);
    document.documentElement.append(host);
    observer = new MutationObserver(schedule);
    observer.observe(document.body,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['class','style','hidden','open','aria-expanded','aria-hidden']});
    for (const [name,fn,capture] of events) window.addEventListener(name,fn,capture);
    document.addEventListener('selectionchange',schedule);
    document.addEventListener('visibilitychange',schedule);
    window.visualViewport?.addEventListener('resize',schedule);
    window.visualViewport?.addEventListener('scroll',schedule);
    // Also track layout shifts not represented by text mutations (fonts, images, CSS animation).
    lastActive = Date.now();
    for (const name of activity) window.addEventListener(name,active,{capture:true,passive:true});
    timer = setInterval(()=>{ if (Date.now() - lastActive > SLEEP_MS) { stopAll(); return; } schedule(); },250);
    schedule();
  }
  function disable() {
    running = false; provider?.stop?.();provider=null; observer?.disconnect(); clearInterval(timer); cancelAnimationFrame(frame); clearTimeout(frame); frame=0; testVisible=false;
    for (const [name,fn,capture] of events) window.removeEventListener(name,fn,capture);
    for (const name of activity) window.removeEventListener(name,active,{capture:true});
    document.removeEventListener('selectionchange',schedule); document.removeEventListener('visibilitychange',schedule);
    window.visualViewport?.removeEventListener('resize',schedule); window.visualViewport?.removeEventListener('scroll',schedule);
    host?.remove(); records=[]; peek=false; altHeld=false; privateSelection=false; correcting=false; editing=null; banner=null; shadowRoot=null;
  }
  // Full stop: also closes the extended-translation engine and its on-page panel, if open.
  function stopAll() { if (globalThis.LanguageStickerLocalControls) globalThis.LanguageStickerLocalControls.close(); else disable(); }
  function peel() {
    stopAll();
    try { globalThis.chrome?.runtime?.sendMessage({type:'sticker-peeled'}); } catch {}
  }
  globalThis.LanguageSticker = Object.freeze({ correct, testVisible(on = true) { testVisible = Boolean(on); schedule(); },enable,disable,refresh:schedule,peek(value){peek=Boolean(value);schedule();},
    status(){return {enabled:running,correcting,language,sourceLanguage,count:records.length,skipped,redraws,scanned,provider:provider?.status?.()||null};},
    // Debug metrics contain only matched public dictionary keys, never arbitrary page text.
    inspect(){return records.map(r => provider?{rect:{...r.rect}}:({...r,rect:{...r.rect}}));},
    // 0.3.52: feedback only (after the user's right-click): what the sticker shows inside one area of the screen.
    shownIn(box){if(!box)return [];return records.filter(r=>r.translated&&r.rect.x<box.right&&r.rect.x+r.rect.width>box.left&&r.rect.y<box.bottom&&r.rect.y+r.rect.height>box.top).map(r=>String(r.translated)).slice(0,20);}
  });
})();
