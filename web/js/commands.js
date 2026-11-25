'use strict';
/* Alle Befehle des Menübands + Textformatierung wie in PowerPoint */

const FONT_SIZES = [8, 9, 10, 10.5, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36, 40, 44, 48, 54, 60, 66, 72, 80, 88, 96];
const FONTS = ['Calibri', 'Aptos', 'Arial', 'Arial Black', 'Cambria', 'Candara', 'Comic Sans MS', 'Consolas', 'Courier New', 'Georgia',
  'Impact', 'Lucida Sans Unicode', 'Palatino Linotype', 'Segoe Print', 'Segoe Script', 'Segoe UI', 'Tahoma', 'Times New Roman', 'Trebuchet MS', 'Verdana'];
const SYMBOLS = ['→', '←', '↑', '↓', '↔', '⇒', '⇐', '⇔', '➜', '↳', '✓', '✗', '★', '☆', '•', '◦', '▪', '►', '◆', '○',
  '…', '–', '—', '≈', '≠', '≤', '≥', '±', '×', '÷', '∞', '°', '€', '£', '$', '§', '©', '®', '™', '¶',
  'α', 'β', 'γ', 'δ', 'Δ', 'λ', 'μ', 'π', 'Σ', 'Ω', '½', '¼', '¾', '²', '³', '√', '∑', '∫', '∅', '∈',
  '💡', '❗', '❓', '⚠️', '✅', '❌', '📌', '📎', '🔗', '📅', '⭐', '🔥', '🎯', '🚀', '🧠', '💬', '📝', '🔍', '🏁', '❤️'];
const BOX_PRESETS = [
  { name: 'Standard', style: { bg: null, border: null, color: null }, sw: 'var(--box-bg)', bd: 'var(--box-border)' },
  { name: 'Unsichtbar (wie OneNote)', style: { bg: 'transparent', border: null, color: null }, sw: 'transparent', bd: 'var(--line-2)', dash: true },
  // Schriftfarbe automatisch (dunkle bzw. helle Tönung der Füllfarbe, siehe contrast.js)
  { name: 'Idee', style: { bg: '#FFF4C2', border: '#E8C547', color: null } },
  { name: 'Info', style: { bg: '#DCEBFF', border: '#6AA3E8', color: null } },
  { name: 'Erledigt', style: { bg: '#DDF3E0', border: '#5DB36A', color: null } },
  { name: 'Wichtig', style: { bg: '#FDE0E0', border: '#E06666', color: null } },
  { name: 'Frage', style: { bg: '#EDE3FA', border: '#9B7AD6', color: null } },
  { name: 'Dunkel', style: { bg: '#2B2F36', border: '#2B2F36', color: null } },
];

function anchorElement() {
  const s = getSelection();
  if (!s.rangeCount) return null;
  const n = s.anchorNode;
  return n && (n.nodeType === 1 ? n : n.parentElement);
}

const Fmt = {
  painter: null,

  target() {
    if (Canvas.editing && Canvas.restoreRange()) return 'edit';
    if (Canvas.selectedBoxes().length) return 'boxes';
    return null;
  },
  apply(fn, label) {
    if (Store.readOnly) return;
    Hist.flushPending();
    const t = this.target();
    if (t === 'edit') {
      try { document.execCommand('styleWithCSS', false, true); } catch (e) { /* */ }
      fn(Canvas.textEl(Canvas.editing));
      const sel = getSelection();
      if (sel.rangeCount) { Canvas.lastRange = sel.getRangeAt(0).cloneRange(); Canvas.lastRangeBox = Canvas.editing; }
      Canvas.syncEditing();
      Hist.commit(label);
    } else if (t === 'boxes') {
      Canvas.bulkEdit(Canvas.selectedBoxes(), (root) => { document.execCommand('styleWithCSS', false, true); fn(root); });
      Hist.commit(label);
    } else UI.toast('Zuerst Text markieren oder ein Textfeld auswählen');
    Ribbon.refreshSoon();
  },
  exec(cmd, val = null) { document.execCommand(cmd, false, val); },

  setFontSize(pt, root) {
    const s = getSelection();
    if (!s.rangeCount) return;
    if (s.isCollapsed) {
      document.execCommand('insertHTML', false, `<span data-kt-new="1" style="font-size:${pt}pt">\u200B</span>`);
      const sp = root.querySelector('[data-kt-new]');
      if (sp) {
        sp.removeAttribute('data-kt-new');
        const r = document.createRange();
        r.setStart(sp.firstChild, 1); r.collapse(true);
        s.removeAllRanges(); s.addRange(r);
      }
      return;
    }
    document.execCommand('styleWithCSS', false, false);
    document.execCommand('fontSize', false, '7');
    document.execCommand('styleWithCSS', false, true);
    const made = [];
    for (const f of Array.from(root.querySelectorAll('font[size="7"]'))) {
      const sp = document.createElement('span');
      sp.style.fontSize = pt + 'pt';
      for (const inner of f.querySelectorAll('[style]')) { inner.style.fontSize = ''; if (!inner.getAttribute('style')) inner.removeAttribute('style'); }
      for (const inner of f.querySelectorAll('font[size]')) inner.removeAttribute('size');
      while (f.firstChild) sp.append(f.firstChild);
      if (f.getAttribute('color')) sp.style.color = f.getAttribute('color');
      if (f.getAttribute('face')) sp.style.fontFamily = f.getAttribute('face');
      f.replaceWith(sp);
      made.push(sp);
    }
    for (const x of Array.from(root.querySelectorAll('[style*="xxx-large"]'))) x.style.fontSize = pt + 'pt';
    if (made.length) {
      const r = document.createRange();
      r.setStartBefore(made[0]); r.setEndAfter(made[made.length - 1]);
      s.removeAllRanges(); s.addRange(r);
    }
  },
  fontSize(pt) {
    pt = clamp(Math.round(+pt * 2) / 2 || 11, 1, 400);
    this.apply(root => this.setFontSize(pt, root), 'Schriftgrad ' + pt);
  },
  currentSize() {
    let e = anchorElement();
    if (!(e && e.closest('.box-text'))) { const b = Canvas.selectedBoxes()[0]; e = b && Canvas.textEl(b.id); if (e && e.firstElementChild) e = e.firstElementChild; }
    if (!e) return 11;
    const px = parseFloat(getComputedStyle(e).fontSize) || 14.67;
    return Math.round(px * 0.75 * 2) / 2;
  },
  currentFont() {
    let e = anchorElement();
    if (!(e && e.closest('.box-text'))) { const b = Canvas.selectedBoxes()[0]; e = b && Canvas.textEl(b.id); }
    if (!e) return 'Calibri';
    return (getComputedStyle(e).fontFamily.split(',')[0] || 'Calibri').replace(/["']/g, '').trim();
  },
  grow(dir) {
    const cur = this.currentSize();
    const next = dir > 0 ? (FONT_SIZES.find(s => s > cur) || cur + 8) : ([...FONT_SIZES].reverse().find(s => s < cur) || Math.max(1, cur - 1));
    this.fontSize(next);
  },
  changeCase(mode) {
    this.apply((root) => {
      const s = getSelection();
      if (!s.rangeCount) return;
      const r = s.getRangeAt(0);
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      const nodes = [];
      while (walker.nextNode()) if (r.intersectsNode(walker.currentNode)) nodes.push(walker.currentNode);
      let prev = ' ', first = true;
      const one = (ch, up) => { const t = up ? ch.toLocaleUpperCase('de') : ch.toLocaleLowerCase('de'); return t.length === 1 ? t : ch; };
      for (const n of nodes) {
        const a = n === r.startContainer ? r.startOffset : 0;
        const b = n === r.endContainer ? r.endOffset : n.data.length;
        let seg = '';
        for (const ch of n.data.slice(a, b)) {
          let out = ch;
          if (mode === 'upper') out = one(ch, true);
          else if (mode === 'lower') out = one(ch, false);
          else if (mode === 'toggle') out = ch === one(ch, true) ? one(ch, false) : one(ch, true);
          else if (mode === 'title') out = /\s|[-–(„"]/.test(prev) ? one(ch, true) : one(ch, false);
          else if (mode === 'sentence') out = (first || /[.!?]\s*$/.test(prev + '') ) && /\p{L}/u.test(ch) ? one(ch, true) : one(ch, false);
          if (/\p{L}/u.test(ch)) first = false;
          if (mode === 'sentence' && /[.!?]/.test(ch)) first = true;
          prev = ch;
          seg += out;
        }
        n.data = n.data.slice(0, a) + seg + n.data.slice(b);
      }
      try { s.removeAllRanges(); s.addRange(r); } catch (e) { /* */ }
    }, 'Gross-/Kleinschreibung');
  },
  lineSpacing(v) {
    const boxes = Canvas.editing ? [Canvas.box(Canvas.editing)] : Canvas.selectedBoxes();
    if (!boxes.length || !boxes[0]) { UI.toast('Zuerst ein Textfeld auswählen'); return; }
    Hist.flushPending();
    for (const b of boxes) {
      b.style = { ...b.style, lh: String(v) };
      _tpl.innerHTML = b.html;
      _tpl.content.querySelectorAll('[style]').forEach(x => { x.style.lineHeight = ''; if (!x.getAttribute('style')) x.removeAttribute('style'); });
      b.html = _tpl.innerHTML;
    }
    Canvas.render(true);
    if (Canvas.editing) Canvas.restoreRange();
    Hist.touchPage(Canvas.pageId);
    Hist.commit('Zeilenabstand');
  },
  listStyleAtCursor(type) {
    const e = anchorElement();
    const list = e && e.closest('ul,ol');
    if (list && type) list.style.listStyleType = type;
  },
  bullets(type) {
    this.apply((root) => {
      const e = anchorElement();
      const inUl = e && e.closest('ul');
      if (!inUl || !type) this.exec('insertUnorderedList');
      const ul = anchorElement()?.closest('ul');
      if (ul) { ul.classList.remove('checklist'); if (!ul.className) ul.removeAttribute('class'); if (type) ul.style.listStyleType = type; }
      if (!type && ul) root.querySelectorAll('ul').forEach(x => { if (!x.className) x.removeAttribute('class'); });
    }, 'Aufzählung');
  },
  numbering(type) {
    this.apply(() => {
      const e = anchorElement();
      if (!(e && e.closest('ol')) || !type) this.exec('insertOrderedList');
      this.listStyleAtCursor(type);
    }, 'Nummerierung');
  },
  checklist() {
    this.apply(() => {
      const e = anchorElement();
      const ul = e && e.closest('ul');
      if (ul && ul.classList.contains('checklist')) { this.exec('insertUnorderedList'); return; }
      if (!ul) this.exec('insertUnorderedList');
      const u = anchorElement()?.closest('ul');
      if (u) { u.classList.add('checklist'); u.style.listStyleType = ''; }
    }, 'Checkliste');
  },
  clearFormat() {
    this.apply((root) => {
      this.exec('removeFormat');
      const s = getSelection();
      if (!s.rangeCount) return;
      const r = s.getRangeAt(0);
      for (const x of Array.from(root.querySelectorAll('span[style],font'))) {
        if (!r.intersectsNode(x)) continue;
        if (x.tagName === 'FONT') { x.replaceWith(...x.childNodes); continue; }
        for (const p of ['font-size', 'font-family', 'color', 'background-color', 'font-weight', 'font-style', 'text-decoration', 'text-decoration-line']) x.style.removeProperty(p);
        if (!x.getAttribute('style')) x.replaceWith(...x.childNodes);
      }
    }, 'Formatierung löschen');
  },
  fontColor(c) {
    this.apply((root) => {
      if (c) { this.exec('foreColor', c); return; }
      const s = getSelection();
      if (!s.rangeCount) return;
      const r = s.getRangeAt(0);
      for (const x of Array.from(root.querySelectorAll('[style*="color"],font[color]'))) {
        if (!r.intersectsNode(x)) continue;
        x.style.removeProperty('color'); x.removeAttribute('color');
        if (x.tagName === 'SPAN' && !x.getAttribute('style')) x.replaceWith(...x.childNodes);
      }
    }, 'Schriftfarbe');
  },
  highlight(c) {
    this.apply(() => this.exec('hiliteColor', c || 'transparent'), 'Texthervorhebung');
  },
  blockStyle(tag) {
    this.apply(() => this.exec('formatBlock', tag), 'Formatvorlage');
  },

  /* Format übertragen (Pinsel) */
  startPainter() {
    if (Canvas.editing && Canvas.restoreRange()) {
      const e = anchorElement();
      if (!e) return;
      const cs = getComputedStyle(e);
      let bg = null;
      for (let x = e; x && !x.classList.contains('box-text'); x = x.parentElement) {
        const b = getComputedStyle(x).backgroundColor;
        if (b && b !== 'rgba(0, 0, 0, 0)' && b !== 'transparent') { bg = b; break; }
      }
      this.painter = {
        kind: 'text', bold: parseInt(cs.fontWeight, 10) >= 600, italic: cs.fontStyle === 'italic',
        underline: cs.textDecorationLine.includes('underline'), strike: cs.textDecorationLine.includes('line-through'),
        color: Contrast.declared(e), bg, font: cs.fontFamily.split(',')[0].replace(/["']/g, ''),
        size: Math.round(parseFloat(cs.fontSize) * 0.75 * 2) / 2,
      };
      UI.toast('Format übertragen: jetzt den Zieltext markieren (Esc = abbrechen)', 3500);
    } else {
      const b = Canvas.selectedBoxes()[0];
      if (!b) { UI.toast('Zuerst Text oder ein Textfeld auswählen, dessen Format übertragen werden soll'); return; }
      this.painter = { kind: 'box', style: { ...b.style } };
      UI.toast('Format übertragen: jetzt auf ein anderes Textfeld klicken (Esc = abbrechen)', 3500);
    }
    document.body.classList.add('painter');
    Ribbon.refreshSoon();
  },
  cancelPainter() {
    this.painter = null;
    document.body.classList.remove('painter');
    Ribbon.refreshSoon();
  },
  applyPainter() {
    const P = this.painter;
    if (!P || P.kind !== 'text') return;
    const s = getSelection();
    if (!s.rangeCount || s.isCollapsed) return;
    const e = anchorElement();
    const root = e && e.closest('.box-text');
    if (!root) return;
    Hist.flushPending();
    document.execCommand('styleWithCSS', false, true);
    this.exec('removeFormat');
    this.exec('fontName', P.font);
    this.setFontSize(P.size, root);
    if (P.color) this.exec('foreColor', P.color);
    if (P.bg) this.exec('hiliteColor', P.bg);
    if (P.bold) this.exec('bold');
    if (P.italic) this.exec('italic');
    if (P.underline) this.exec('underline');
    if (P.strike) this.exec('strikeThrough');
    Canvas.syncEditing();
    Hist.commit('Format übertragen');
    this.cancelPainter();
  },
  applyBoxPainter(boxId) {
    const P = this.painter;
    const b = Canvas.box(boxId);
    if (!P || P.kind !== 'box' || !b) return;
    b.style = { ...P.style };
    Canvas.render();
    Hist.touchPage(Canvas.pageId);
    Hist.commit('Format übertragen');
    this.cancelPainter();
  },
};

/* ---------------------------------------------------------------- Suchen & Ersetzen */
function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
function replaceInHtml(html, q, rep, once) {
  _tpl.innerHTML = html;
  let count = 0;
  const re = new RegExp(escapeRe(q), 'gi');
  const w = document.createTreeWalker(_tpl.content, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (w.nextNode()) nodes.push(w.currentNode);
  for (const n of nodes) {
    if (once && count) break;
    n.data = n.data.replace(re, (m) => { if (once && count) return m; count++; return rep; });
  }
  return { html: _tpl.innerHTML, count };
}

const Find = {
  el: null, results: [], cur: -1,
  open(mode = 'find', q) {
    if (!Store.complete) return Store.gate(() => this.open(mode, q));   // alle Seiten nötig (Laden in Stufen, 1.30)
    if (!this.el) this.build();
    this.el.hidden = false;
    this.el.querySelector('.fp-rep').hidden = mode !== 'replace';
    this.el.querySelector('.fp-title').textContent = mode === 'replace' ? 'Suchen und Ersetzen' : 'Suchen';
    const r = $('#stage').getBoundingClientRect();
    this.el.style.left = (r.right - 356) + 'px';
    this.el.style.top = (r.top + 8) + 'px';
    const inp = this.el.querySelector('.fp-q');
    if (q != null) inp.value = q;
    else if (Canvas.editing) { const s = getSelection().toString().trim(); if (s && s.length < 80) inp.value = s; }
    inp.focus(); inp.select();
    this.search();
  },
  close() { if (this.el) this.el.hidden = true; },
  build() {
    const p = el('div', { id: 'findpanel', hidden: true });
    p.innerHTML = `<div class="fp-head"><span class="fp-title">Suchen</span><button class="nav-add fp-x" title="Schliessen">${icon('x', 14)}</button></div>
      <div class="fp-row"><input type="text" class="fp-q" placeholder="In allen Seiten suchen …"></div>
      <div class="fp-rep"><div class="fp-row"><input type="text" class="fp-r" placeholder="Ersetzen durch …"></div>
      <div class="fp-row"><button class="btn fp-one">Ersetzen</button><button class="btn fp-all">Alle ersetzen</button><label><input type="checkbox" class="fp-scope"> alle Seiten</label></div></div>
      <div class="fp-count"></div><div class="fp-res"></div>`;
    document.body.append(p);
    this.el = p;
    p.querySelector('.fp-x').addEventListener('click', () => this.close());
    const q = p.querySelector('.fp-q');
    q.addEventListener('input', debounce(() => this.search(), 120));
    q.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') this.go(this.cur + 1); if (e.key === 'Escape') this.close(); });
    p.querySelector('.fp-r').addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Escape') this.close(); });
    p.querySelector('.fp-one').addEventListener('click', () => this.replace(false));
    p.querySelector('.fp-all').addEventListener('click', () => this.replace(true));
  },
  search() {
    const q = this.el.querySelector('.fp-q').value.trim();
    const res = this.el.querySelector('.fp-res');
    res.innerHTML = '';
    this.results = []; this.cur = -1;
    if (!q) { this.el.querySelector('.fp-count').textContent = 'Suchbegriff eingeben – durchsucht alle Seiten und Gruppen.'; return; }
    const ql = q.toLowerCase();
    const order = [];
    for (const { g } of Tree.all()) for (const pid of g.pages) order.push({ pid, g });
    let total = 0;
    for (const { pid, g } of order) {
      const p = Store.pages[pid];
      if (!p) continue;
      if (p.title.toLowerCase().includes(ql)) this.results.push({ pid, boxId: null, text: p.title, g });
      for (const b of p.boxes) {
        // von OneNote erkannter Bildtext (OCR) gehört zur Suche: freie Bilder (im.ocr) und Bilder im Text (data-ocr)
        const ocr = [...(b.images || []).map(im => im.ocr || ''), ...[...(b.html || '').matchAll(/data-ocr="([^"]*)"/g)].map(m => m[1].replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&'))].filter(Boolean).join(' ');
        const t = ((b.sheet ? Sheet.texts(b) : b.chart ? [b.chart.title, b.chart.xTitle, b.chart.yTitle].join(' ') : htmlToText(b.html)) + (ocr ? ' ' + ocr : '')).replace(/\s+/g, ' ');
        const i = t.toLowerCase().indexOf(ql);
        if (i < 0) continue;
        total += t.toLowerCase().split(ql).length - 1;
        this.results.push({ pid, boxId: b.id, text: (i > 30 ? '…' : '') + t.slice(Math.max(0, i - 30), i + q.length + 50), g });
      }
    }
    this.el.querySelector('.fp-count').textContent = this.results.length ? `${total || this.results.length} Treffer in ${new Set(this.results.map(r => r.pid)).size} Seite(n)` : 'Keine Treffer';
    const re = new RegExp(escapeRe(escapeHtml(q)), 'gi');
    this.results.slice(0, 200).forEach((r, i) => {
      const it = el('div', { class: 'fp-item' });
      it.innerHTML = `<b></b><span>${escapeHtml(r.text).replace(re, m => `<mark>${m}</mark>`)}</span>`;
      it.querySelector('b').textContent = `${r.g.name} › ${Store.pages[r.pid].title}`;
      it.addEventListener('click', () => this.go(i));
      res.append(it);
    });
  },
  go(i) {
    if (!this.results.length) return;
    this.cur = ((i % this.results.length) + this.results.length) % this.results.length;
    const r = this.results[this.cur];
    if (r.pid !== Canvas.pageId) App.openPage(r.pid);
    $$('.fp-item', this.el).forEach((x, j) => x.style.background = j === this.cur ? 'var(--accent-soft)' : '');
    if (r.boxId) setTimeout(() => { Canvas.scrollToBox(r.boxId); Canvas.select([r.boxId]); }, 40);
  },
  replace(all) {
    const q = this.el.querySelector('.fp-q').value;
    const rep = this.el.querySelector('.fp-r').value;
    if (!q) return;
    Hist.flushPending();
    Canvas.stopEditing();
    let count = 0;
    const scopeAll = this.el.querySelector('.fp-scope').checked;
    const pages = all ? (scopeAll ? Object.values(Store.pages) : [Canvas.page].filter(Boolean)) : [];
    if (!all) {
      const r = this.results[Math.max(0, this.cur)];
      const p = r && Store.pages[r.pid];
      const b = p && r.boxId && p.boxes.find(x => x.id === r.boxId);
      if (b && !b.locked) { const o = replaceInHtml(b.html, q, rep, true); b.html = o.html; count = o.count; Hist.touchPage(p.id); }
    } else {
      for (const p of pages) {
        for (const b of p.boxes) {
          if (b.locked) continue;
          const o = replaceInHtml(b.html, q, rep, false);
          if (o.count) { b.html = o.html; count += o.count; Hist.touchPage(p.id); }
        }
      }
    }
    Hist.commit('Ersetzen');
    Canvas.reload();
    UI.toast(count ? `${count} Stelle(n) ersetzt` : 'Nichts ersetzt');
    this.search();
  },
};

/* ---------------------------------------------------------------- Export */
async function exportPageHtml() {
  const p = Canvas.page;
  if (!p) return;
  Canvas.stopEditing();
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
  for (const r of Canvas.rects.values()) { x1 = Math.min(x1, r.x); y1 = Math.min(y1, r.y); x2 = Math.max(x2, r.x + r.w); y2 = Math.max(y2, r.y + r.h); }
  if (x1 === Infinity) { x1 = y1 = 0; x2 = y2 = 200; }
  const world = $('#world').cloneNode(true);
  world.removeAttribute('id');
  world.style.transform = `translate(${40 - x1}px, ${20 - y1}px)`;
  world.querySelectorAll('[contenteditable]').forEach(x => x.removeAttribute('contenteditable'));
  world.querySelectorAll('.sock,.box-rs,.fimg-rs,.link-hit,#layer-overlay,.ui-only,.ch-guide').forEach(x => x.remove());
  world.querySelectorAll('.sel,.editing').forEach(x => x.classList.remove('sel', 'editing'));
  for (const img of world.querySelectorAll('img')) {
    try { const b = await (await fetch(img.getAttribute('src'))).blob(); img.src = await blobToDataURL(b); } catch (e) { /* */ }
  }
  let css = '';
  const inline = document.getElementById('kt-css');
  if (inline) css = inline.textContent;
  else { try { css = await (await fetch('app.css')).text(); } catch (e) { /* */ } }
  css = css.replace(/url\(icon\.svg\)/g, 'none');
  const W = Math.ceil(x2 - x1 + 80), H = Math.ceil(y2 - y1 + 60);
  const html = `<!doctype html><html lang="de"><head><meta charset="utf-8"><title>${escapeHtml(p.title)}</title><style>${css}
html,body{overflow:auto;height:auto;user-select:text;-webkit-user-select:text}body{background:var(--canvas);padding:0 0 40px}
.kt-title{font:300 28px var(--font-ui);margin:28px 40px 4px;color:var(--ink)}.kt-meta{margin:0 40px 10px;color:var(--ink-3);font-size:12px}
.kt-wrap{position:relative;width:${W}px;height:${H}px}.kt-wrap>div{position:absolute;left:0;top:0}.box-grip{display:none}</style></head>
<body data-theme="${Store.ui.theme === 'dunkel' ? 'dunkel' : 'hell'}"><div class="kt-title">${escapeHtml(p.title)}</div><div class="kt-meta">${escapeHtml(fmtDate(p.created))} · exportiert aus KnowledgeTree</div>
<div class="kt-wrap">${world.outerHTML}</div></body></html>`;
  const a = el('a', { href: URL.createObjectURL(new Blob([html], { type: 'text/html' })), download: (p.title || 'Seite').replace(/[<>:"/\\|?*]+/g, '_') + '.html' });
  document.body.append(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
  UI.toast('Seite als HTML exportiert (Ordner „Downloads“)');
}

function pickImageFiles() {
  return new Promise((res) => {
    const inp = el('input', { type: 'file', accept: 'image/*', multiple: true, style: { display: 'none' } });
    inp.addEventListener('change', () => { res([...inp.files]); inp.remove(); });
    document.body.append(inp);
    inp.click();
  });
}
function pickAnyFiles() {
  return new Promise((res) => {
    const inp = el('input', { type: 'file', multiple: true, style: { display: 'none' } });
    inp.addEventListener('change', () => { res([...inp.files]); inp.remove(); });
    document.body.append(inp);
    inp.click();
  });
}

/* ---------------------------------------------------------------- Befehlsliste */
const canText = () => !!Canvas.editing || Canvas.selectedBoxes().some(b => !b.sheet && !b.chart);
const xlOn = () => !!Sheet.active && !Sheet.locked(Sheet.active.id);
const xlCellFmt = () => !Canvas.editing && xlOn() && typeof OfficeXT !== 'undefined';
const chOn = () => !!Chart.selected() && !Canvas.isLocked(Chart.selected());
const inEdit = () => !!Canvas.editing;
const hasSel = () => Canvas.sel.size > 0 || Draw.sel.size > 0;
const qs = (c) => { try { return document.queryCommandState(c); } catch (e) { return false; } };
const editingState = (c) => () => inEdit() && qs(c);
const alignState = (c) => () => inEdit() && qs(c);
const hasPage = () => !!Canvas.page && !App.preview;
const selPages = () => Sidebar.pageSel.size && Sidebar.pageSel.has(Canvas.pageId) ? [...Sidebar.pageSel] : (Canvas.pageId ? [Canvas.pageId] : []);
const curNotebook = () => { const nb = Tree.notebookOf(Store.ui.currentGroup) || Tree.group(Store.ui.currentContainer) && Tree.notebookOf(Store.ui.currentContainer); return nb && nb.kind === 'notebook' ? nb : null; };

const COMMANDS = {
  undo: { run: () => Hist.undoStep(), enabled: () => Hist.undo.length > 0 },
  redo: { run: () => Hist.redoStep(), enabled: () => Hist.redo.length > 0 },
  save: { run: async () => { if (Backend.kind === 'datei') { App.createBackup(); return; } await Save.flushAll(); await Hist.persist(); await UiState.save(); UI.toast(Save.state === 'error' ? 'Speichern fehlgeschlagen' : 'Alles gespeichert'); } },

  newPage: { run: () => Ops.newPage() },
  // Office-Seiten (1.61–1.64): Seitentyp beim Erstellen, Speichern als Office-Datei, Folien, Vorführen
  newTypedPage: { run: (fmt) => { if (fmt && fmt !== 'frei' && typeof OfficePages !== 'undefined') OfficePages.newTyped(fmt).catch(e => UI.toast(e.message, 5000)); else Ops.newPage(); }, enabled: () => !Store.readOnly },
  officeSave: { run: () => (typeof OfficeSaveAs !== 'undefined' ? OfficeSaveAs.dialog() : OfficePages.saveCurrent(false)).catch(e => UI.toast(e.message, 5000)), enabled: () => typeof OfficePages !== 'undefined' && !!OfficePages.page() },   // 1.71: mit Dateityp
  officeOpen: { run: () => typeof OfficeIO !== 'undefined' ? OfficeIO.openDialog() : OfficePages.openPicker(), enabled: () => !Store.readOnly },
  officeRebuild: { run: () => OfficePages.rebuild().catch(e => UI.toast(e.message, 5000)), enabled: () => !Store.readOnly && typeof OfficePages !== 'undefined' && !!OfficePages.page() },
  officeOriginal: { run: () => OfficePages.saveCurrent(true).catch(e => UI.toast(e.message, 5000)), enabled: () => typeof OfficePages !== 'undefined' && !!OfficePages.page() },
  // Office-Register (1.65)
  wMargins: { run: (k) => OfficeDoc.setPage('margins', k), enabled: () => !Store.readOnly && !!OfficePages.page('docx') },
  wOrient: { run: (k) => OfficeDoc.setPage('orient', k), enabled: () => !Store.readOnly && !!OfficePages.page('docx') },
  wPaper: { run: (k) => OfficeDoc.setPage('paper', k), enabled: () => !Store.readOnly && !!OfficePages.page('docx') },
  wPageBreak: { run: () => OfficeDoc.pageBreak(), enabled: () => !Store.readOnly && !!OfficePages.page('docx') },
  wTable: { run: () => OfficeDoc.table(), enabled: () => !Store.readOnly && !!OfficePages.page('docx') },
  wWordCount: { run: () => OfficeDoc.wordCount(), enabled: () => !!OfficePages.page('docx') },
  wZoom: { run: (k) => OfficeDoc.zoom(k), enabled: () => !!OfficePages.page('docx') },
  zoomTo: { run: (pct) => Canvas.setZoom(pct / 100), enabled: () => !!Canvas.page },
  xlFxCat: { run: (c) => Sheet.functionDialog(c), enabled: () => !!Sheet.active },
  xlSheetAdd: { run: () => OfficeXl.addSheet(), enabled: () => !Store.readOnly && !!OfficePages.page('xlsx') },
  slideBg: { run: (c) => OfficePpt.setBg(c), enabled: () => !Store.readOnly && !!OfficePages.page('pptx') },
  slideBgAll: { run: () => { const f = OfficePpt.currentFrame(); if (f) OfficePpt.setBg(f.ox.bg || '#ffffff', true); }, enabled: () => !Store.readOnly && !!OfficePages.page('pptx') },
  slideSize: { run: (k) => OfficePpt.setSize(k), enabled: () => !Store.readOnly && !!OfficePages.page('pptx') },
  slideFit: { run: () => { const f = OfficePpt.currentFrame(); if (f) OfficePpt.focusSlide(f.id); }, enabled: () => !!OfficePages.page('pptx') },
  // 1.66: Übergänge, Animationen, Word-Entwurf/Referenzen, Grammatik, Wörterbücher, Schriftarten, Makros, Add-Ins
  transSet: { run: (k) => OfficeAnim.setTransition(k), enabled: () => !Store.readOnly && !!OfficePages.page('pptx'), active: (k) => { const f = OfficePpt.currentFrame(); return !!f && ((f.ox.tr && f.ox.tr.type) || 'none') === k; } },
  transDur: { run: (ms) => OfficeAnim.setTransDur(ms), enabled: () => !Store.readOnly && !!OfficePages.page('pptx') },
  transAll: { run: () => OfficeAnim.transAll(), enabled: () => !Store.readOnly && !!OfficePages.page('pptx') },
  transPreview: { run: () => { const f = OfficePpt.currentFrame(); if (f) Show.previewAt(f, Canvas.page, 'trans'); }, enabled: () => !!OfficePages.page('pptx') },
  animSet: { run: (k) => OfficeAnim.setAnim(k), enabled: () => !Store.readOnly && !!OfficePages.page('pptx') && OfficeAnim.selected().length > 0, active: (k) => OfficeAnim.selected().length > 0 && (OfficeAnim.current('fx') || 'none') === k },
  animStart: { run: (k) => OfficeAnim.setAnimOpt('start', k), enabled: () => !Store.readOnly && !!OfficeAnim.current('fx') },
  animDur: { run: (ms) => OfficeAnim.setAnimOpt('dur', ms), enabled: () => !Store.readOnly && !!OfficeAnim.current('fx') },
  animEarlier: { run: () => OfficeAnim.move(-1), enabled: () => !Store.readOnly && !!OfficeAnim.current('fx') },
  animLater: { run: () => OfficeAnim.move(1), enabled: () => !Store.readOnly && !!OfficeAnim.current('fx') },
  animPreview: { run: () => { const f = OfficePpt.currentFrame(); if (f) Show.previewAt(f, Canvas.page, 'anim'); }, enabled: () => !!OfficePages.page('pptx') },
  wPageColor: { run: (c) => OfficeDoc.setPageColor(c), enabled: () => !Store.readOnly && !!OfficePages.page('docx') },
  wToc: { run: () => OfficeDoc.toc(), enabled: () => !Store.readOnly && !!OfficePages.page('docx') },
  // Word 1.67: Formatierungszeichen, Lineal, Navigationsbereich, Entwurf
  wMarks: { run: () => OfficeWord.toggleMarks(), enabled: () => !!OfficePages.page('docx'), active: () => OfficeWord.marksOn() },
  wRuler: { run: () => OfficeWord.toggleRuler(), enabled: () => !!OfficePages.page('docx'), active: () => OfficeWord.rulerOn() },
  wNav: { run: () => OfficeWord.toggleNav(), enabled: () => !!OfficePages.page('docx'), active: () => OfficeWord.navOn() },
  wSpacing: { run: (k) => OfficeWord.setDesign('spacing', k), enabled: () => !Store.readOnly && !!OfficePages.page('docx') },
  wFont: { run: (f) => OfficeWord.setDesign('font', f), enabled: () => !Store.readOnly && !!OfficePages.page('docx') },
  wBorder: { run: (k) => OfficeWord.setDesign('border', k), enabled: () => !Store.readOnly && !!OfficePages.page('docx') },
  wBorderColor: { run: (c) => OfficeWord.setDesign('borderColor', c), enabled: () => !Store.readOnly && !!OfficePages.page('docx') },
  grammarToggle: { run: () => Grammar.toggle(), active: () => typeof Grammar !== 'undefined' && Grammar.on() },
  dictAdd: { run: () => Spell.addDictionary().catch(e => UI.toast(e.message, 5000)), enabled: () => !Store.readOnly },
  fontAdd: { run: () => Fonts.add(), enabled: () => !Store.readOnly },
  macroList: { run: () => Macros.dialog(), enabled: () => !!Macros.page() },
  macroRec: { run: () => Macros.record(), enabled: () => !Store.readOnly && !!Macros.page(), active: () => !!Macros.rec },
  macroNew: { run: () => Macros.editor(null), enabled: () => !Store.readOnly && !!Macros.page() },
  addins: { run: () => Plugins.manage() },
  // Register „Add-Ins“ (1.69): Häkchen je Add-In, Ordner, KI-Vorlage
  addinToggle: { run: (id) => Plugins.toggle(id), active: (id) => Plugins.isOn(id) && Plugins.defs.has(id) },
  addinAdd: { run: () => Plugins.addFile() },
  addinFolder: { run: () => Plugins.openFolder(), enabled: () => !!Backend.addinFolder },
  addinReload: { run: () => Plugins.reload() },
  addinTemplate: { run: () => Plugins.saveTemplate() },
  addinGuide: { run: () => Plugins.guide() },   // Anleitung (1.70)
  slideNew: { run: () => OfficePpt.cmd('new'), enabled: () => !Store.readOnly && typeof OfficePages !== 'undefined' && !!OfficePages.page('pptx') },
  slideDup: { run: () => OfficePpt.cmd('dup'), enabled: () => !Store.readOnly && typeof OfficePages !== 'undefined' && !!OfficePages.page('pptx') },
  slideDel: { run: () => OfficePpt.cmd('del'), enabled: () => !Store.readOnly && typeof OfficePages !== 'undefined' && !!OfficePages.page('pptx') && OfficePpt.frames().length > 1 },
  slideUp: { run: () => OfficePpt.cmd('up'), enabled: () => !Store.readOnly && typeof OfficePages !== 'undefined' && !!OfficePages.page('pptx') },
  slideDown: { run: () => OfficePpt.cmd('down'), enabled: () => !Store.readOnly && typeof OfficePages !== 'undefined' && !!OfficePages.page('pptx') },
  // PowerPoint 1.67: Ansichten, Layouts, Textfeld aufziehen, Ausrichten, Führungslinien
  pptView: { run: (v) => OfficeSlides.setView(v), enabled: () => !!OfficePages.page('pptx'), active: (v) => !!OfficePages.page('pptx') && OfficeSlides.view() === v },
  slideLayout: { run: (l) => OfficeSlides.newSlide(l), enabled: () => !Store.readOnly && !!OfficePages.page('pptx') },
  slideTextbox: { run: () => OfficeSlides.startTextbox(), enabled: () => !Store.readOnly && !!OfficePages.page('pptx') },
  slideAlign: { run: (k) => OfficeSlides.align(k), enabled: () => !Store.readOnly && !!OfficePages.page('pptx') },
  slideField: { run: (k) => OfficeSlides.insertField(k), enabled: () => !Store.readOnly && !!OfficePages.page('pptx') },
  pptToggle: { run: (k) => OfficeSlides.toggle(k), enabled: () => !!OfficePages.page('pptx'), active: (k) => k === 'pptAnimPane' ? Store.ui.pptAnimPane !== false : !!Store.ui[k] },
  slideNotes: { run: () => OfficePpt.cmd('notes'), enabled: () => !Store.readOnly && typeof OfficePages !== 'undefined' && !!OfficePages.page('pptx') },
  showStart: { run: () => Show.start('begin'), enabled: () => typeof OfficePages !== 'undefined' && !!OfficePages.page('pptx') },
  showHere: { run: () => Show.start('here'), enabled: () => typeof OfficePages !== 'undefined' && !!OfficePages.page('pptx') },
  showPresenter: { run: () => { Store.ui.showPresenter = !Store.ui.showPresenter; UiState.saveSoon(); Ribbon.refresh(); }, active: () => !!Store.ui.showPresenter },
  newSubpage: { run: () => Ops.newSubpage(), enabled: hasPage },
  newSection: { run: () => Ops.newSection() },
  newSectionGroup: { run: () => Ops.newSectionGroup() },
  newNotebook: { run: () => Ops.newNotebook() },
  quickNote: { run: () => Ops.quickNote() },
  dupPage: { run: () => Ops.duplicatePage(Canvas.pageId), enabled: hasPage },
  renamePage: { run: () => Ops.renamePage(Canvas.pageId), enabled: hasPage },
  deletePage: { run: () => Ops.deletePages(selPages()), enabled: hasPage },
  movePage: { run: () => Ops.movePagesDialog(selPages()), enabled: hasPage },
  indentPage: { run: () => Ops.setLevel(selPages(), +1), enabled: hasPage },
  outdentPage: { run: () => Ops.setLevel(selPages(), -1), enabled: hasPage },
  sortPages: { run: (k) => Ops.sortPages(null, k), enabled: () => !!Ops.currentSection() },
  versions: { run: () => App.showVersions(Canvas.pageId), enabled: () => hasPage() && !!Backend.versionList },
  renameSection: { run: () => Ops.renameNode(Store.ui.currentGroup), enabled: () => { const s = Ops.currentSection(); return !!s && s.kind !== 'quick'; } },
  deleteSection: { run: () => Ops.deleteNode(Store.ui.currentGroup), enabled: () => { const s = Ops.currentSection(); return !!s && s.kind !== 'quick'; } },
  sectionColor: { run: (c) => { const s = Ops.currentSection(); if (s) Ops.setNodeColor(s.id, c); }, enabled: () => !!Ops.currentSection() },
  exportNotebook: { run: () => App.exportNotebook(curNotebook()?.id), enabled: () => !!curNotebook() },
  closeNotebook: { run: () => Ops.closeNotebook(curNotebook()?.id), enabled: () => !!curNotebook() },
  openNotebook: { run: (anchor) => Ops.openNotebookMenu(anchor), enabled: () => Store.groups.some(g => g.closed) },
  goBack: { run: () => App.goBack(), enabled: () => App.nav.back.some(id => Store.has(id)) },
  goForward: { run: () => App.goForward(), enabled: () => App.nav.fwd.some(id => Store.has(id)) },
  exportHtml: { run: () => exportPageHtml(), enabled: hasPage },
  exportDlg: { run: () => Export.show() },
  backup: { run: () => App.createBackup() },
  restore: { run: () => App.restoreBackup() },
  settings: { run: (cat) => Settings.show(cat) },
  print: { run: (what) => Print.show(what), enabled: () => !!Canvas.page },
  importAuto: { run: () => OneImport.pick(false) },     // ein Knopf für alles: erkennt die Datei selbst (1.17)
  importFolder: { run: () => OneImport.pick(true) },
  oneImport: { run: () => OneImport.pick(false) },      // ältere Namen (Tastenkürzel, Menüs)
  importArchive: { run: () => OneImport.pick(false) },
  trash: { run: () => App.showTrash() },
  openSaves: { run: () => Backend.openFolder('saves') },
  openCache: { run: () => Backend.openFolder('cache') },
  openTrash: { run: () => Backend.openFolder('papierkorb') },
  openBackups: { run: () => Backend.openFolder('backups') },
  shortcuts: { run: () => App.showShortcuts() },
  about: { run: () => App.showAbout() },
  quit: { run: () => App.quit() },

  paste: { run: (plain) => App.pasteFromButton(!!plain) },
  pastePlain: { run: () => App.pasteFromButton(true) },
  cut: { run: () => { if (Canvas.editing && Canvas.restoreRange()) { document.execCommand('cut'); Canvas.syncEditing(); Hist.commit('Ausschneiden'); } else Canvas.copySelection(true); }, enabled: () => canText() || hasSel() },
  copy: { run: () => { if (Canvas.editing && Canvas.restoreRange()) document.execCommand('copy'); else Canvas.copySelection(false); }, enabled: () => canText() || hasSel() },
  painter: { run: () => Fmt.painter ? Fmt.cancelPainter() : Fmt.startPainter(), active: () => !!Fmt.painter, enabled: canText },

  newBox: { run: () => { const c = Canvas.viewCenter(); Canvas.createBoxAt({ x: c.x - 140, y: c.y - 40 }); }, enabled: hasPage },
  // 1.73: in einer Tabelle (ohne Textbearbeitung) gelten Schriftart/-grad für die markierten Zellen
  font: { run: (f) => xlCellFmt() ? OfficeXT.cellFont('fn', f) : Fmt.apply(() => Fmt.exec('fontName', f), 'Schriftart'), enabled: () => canText() || xlCellFmt() },
  size: { run: (s) => xlCellFmt() ? OfficeXT.cellFont('fs', s) : Fmt.fontSize(s), enabled: () => canText() || xlCellFmt() },
  grow: { run: () => xlCellFmt() ? OfficeXT.grow(1) : Fmt.grow(1), enabled: () => canText() || xlCellFmt() },
  shrink: { run: () => xlCellFmt() ? OfficeXT.grow(-1) : Fmt.grow(-1), enabled: () => canText() || xlCellFmt() },
  clearFormat: { run: () => Fmt.clearFormat(), enabled: canText },
  bold: { run: () => Fmt.apply(() => Fmt.exec('bold'), 'Fett'), active: editingState('bold'), enabled: canText },
  italic: { run: () => Fmt.apply(() => Fmt.exec('italic'), 'Kursiv'), active: editingState('italic'), enabled: canText },
  underline: { run: () => Fmt.apply(() => Fmt.exec('underline'), 'Unterstrichen'), active: editingState('underline'), enabled: canText },
  strike: { run: () => Fmt.apply(() => Fmt.exec('strikeThrough'), 'Durchgestrichen'), active: editingState('strikeThrough'), enabled: canText },
  sup: { run: () => Fmt.apply(() => Fmt.exec('superscript'), 'Hochgestellt'), active: editingState('superscript'), enabled: canText },
  sub: { run: () => Fmt.apply(() => Fmt.exec('subscript'), 'Tiefgestellt'), active: editingState('subscript'), enabled: canText },
  case: { run: (m) => Fmt.changeCase(m), enabled: canText },
  highlight: { run: (c) => Fmt.highlight(c), enabled: canText },
  fontColor: { run: (c) => Fmt.fontColor(c), enabled: canText },
  bullets: { run: (t) => Fmt.bullets(t), active: editingState('insertUnorderedList'), enabled: canText },
  numbering: { run: (t) => Fmt.numbering(t), active: editingState('insertOrderedList'), enabled: canText },
  outdent: { run: () => Fmt.apply(() => Fmt.exec('outdent'), 'Einzug verkleinern'), enabled: canText },
  indent: { run: () => Fmt.apply(() => Fmt.exec('indent'), 'Einzug vergrössern'), enabled: canText },
  lineSpacing: { run: (v) => Fmt.lineSpacing(v), enabled: canText },
  alignLeft: { run: () => Fmt.apply(() => Fmt.exec('justifyLeft'), 'Linksbündig'), active: alignState('justifyLeft'), enabled: canText },
  alignCenter: { run: () => Fmt.apply(() => Fmt.exec('justifyCenter'), 'Zentriert'), active: alignState('justifyCenter'), enabled: canText },
  alignRight: { run: () => Fmt.apply(() => Fmt.exec('justifyRight'), 'Rechtsbündig'), active: alignState('justifyRight'), enabled: canText },
  alignJustify: { run: () => Fmt.apply(() => Fmt.exec('justifyFull'), 'Blocksatz'), active: alignState('justifyFull'), enabled: canText },
  checklist: { run: () => Fmt.checklist(), enabled: canText },
  style: { run: (t) => Fmt.blockStyle(t), enabled: canText },
  boxPreset: { run: (i) => Canvas.setBoxStyle({ ...BOX_PRESETS[i].style }, 'Schnellformatvorlage: ' + BOX_PRESETS[i].name) },
  boxFill: { run: (c) => Canvas.setBoxStyle({ bg: c, color: null }, 'Fülleffekt') },   // Schrift passt sich automatisch an
  boxBorder: { run: (c) => Canvas.setBoxStyle({ border: c }, 'Formkontur') },
  find: { run: () => Find.open('find') },
  replace: { run: () => Find.open('replace') },
  selectAll: { run: () => { if (Canvas.editing && Canvas.restoreRange()) document.execCommand('selectAll'); else Canvas.selectAll(); }, enabled: hasPage },

  insertImage: {
    run: async (opt = {}) => {
      if (!Canvas.page) return;
      const boxId = opt.boxId || Canvas.editing || (Canvas.sel.size === 1 && Canvas.box([...Canvas.sel][0]) ? [...Canvas.sel][0] : null);
      const files = await pickImageFiles();
      let off = 0;
      for (const f of files) { await Canvas.insertImage(boxId, f, boxId ? null : (opt.at ? { x: opt.at.x + off, y: opt.at.y + off } : null)); off += 24; }
    }, enabled: hasPage,
  },
  insertTable: { run: () => Fmt.apply(() => Fmt.exec('insertHTML', '<table><tbody>' + '<tr><td><br></td><td><br></td><td><br></td></tr>'.repeat(3) + '</tbody></table><div><br></div>'), 'Tabelle eingefügt'), enabled: canText },
  // Datei anhängen (PDF, Word …); Rechtsklick auf den Anhang: Seiten als Bilder aufklappen
  insertFile: {
    run: async (opt = {}) => {
      if (!Canvas.page) return;
      const boxId = opt.boxId || Canvas.editing || (Canvas.sel.size === 1 && Canvas.box([...Canvas.sel][0]) ? [...Canvas.sel][0] : null);
      const files = await pickAnyFiles();
      let off = 0;
      for (const f of files) { await Canvas.attachFile(f, boxId ? null : (opt.at || null), boxId); off += 20; }
    }, enabled: hasPage,
  },
  // Tabellen (wie Excel)
  insertSheet: {
    run: (o = {}) => {
      if (!Canvas.page) return;
      if (Canvas.editing) Canvas.stopEditing();
      const c = o.at || Canvas.viewCenter();
      const nc = o.ncols || 4, nr = o.nrows || 5;
      Sheet.create({ x: c.x - nc * 48, y: c.y - nr * 12 - 20 }, { ncols: nc, nrows: nr });
      if (Ribbon.tab !== 'tabelle') { Sheet.prevTab = Ribbon.tab; Ribbon.show('tabelle'); }
    }, enabled: hasPage,
  },
  importCsv: {
    run: async () => {
      if (!Canvas.page) return;
      const f = await new Promise((res) => { const inp = el('input', { type: 'file', accept: '.csv,.tsv,.txt,text/csv', style: { display: 'none' } }); inp.addEventListener('change', () => { res(inp.files[0] || null); inp.remove(); }); document.body.append(inp); inp.click(); });
      if (f) Sheet.importCsv(f);
    }, enabled: hasPage,
  },
  insertChart: { run: (t) => Chart.insert(t), enabled: hasPage },
  guide: { run: (k) => Guide.open(k), enabled: () => !Store.readOnly },
  fotomath: { run: () => Fotomath.start(), enabled: () => !!Canvas.page && !Store.readOnly },
  calculator: { run: () => Calc.toggle(), active: () => !!(Calc.win && !Calc.win.hidden) },
  xlRowAbove: { run: () => { const s = Sheet.sel(); Sheet.insertRows(s.r1, s.r2 - s.r1 + 1); }, enabled: xlOn },
  xlRowBelow: { run: () => { const s = Sheet.sel(); Sheet.insertRows(s.r2 + 1, s.r2 - s.r1 + 1); }, enabled: xlOn },
  xlColLeft: { run: () => { const s = Sheet.sel(); Sheet.insertCols(s.c1, s.c2 - s.c1 + 1); }, enabled: xlOn },
  xlColRight: { run: () => { const s = Sheet.sel(); Sheet.insertCols(s.c2 + 1, s.c2 - s.c1 + 1); }, enabled: xlOn },
  xlDelRow: { run: () => { const s = Sheet.sel(); Sheet.deleteRows(s.r1, s.r2 - s.r1 + 1); }, enabled: xlOn },
  xlDelCol: { run: () => { const s = Sheet.sel(); Sheet.deleteCols(s.c1, s.c2 - s.c1 + 1); }, enabled: xlOn },
  xlNumFmt: { run: (nf) => Sheet.setNumFmt(nf), enabled: xlOn, active: (nf) => !!Sheet.active && (Sheet.fmtActive('nf') || 'std') === nf },
  xlCur: { run: (cur) => Sheet.setNumFmt('cur', { cur: cur || 'CHF', d: 2 }), enabled: xlOn },
  xlPct: { run: () => Sheet.setNumFmt('pct', { d: 0 }), enabled: xlOn },
  xlThousands: { run: () => Sheet.formatSel(f => { f.nf = 'num'; f.d = f.d ?? 0; f.ts = f.ts === false; }, 'Tausendertrennzeichen'), enabled: xlOn },
  xlDec: { run: (d) => Sheet.decimals(d), enabled: xlOn },
  xlSum: { run: (fn) => Sheet.autoSum(fn || 'SUMME'), enabled: xlOn },
  xlFillDown: { run: () => Sheet.fillDir('d'), enabled: xlOn },
  xlFillRight: { run: () => Sheet.fillDir('r'), enabled: xlOn },
  xlSortAsc: { run: () => Sheet.sort(false), enabled: xlOn },
  xlSortDesc: { run: () => Sheet.sort(true), enabled: xlOn },
  xlClear: { run: (w) => Sheet.clear(w || 'v'), enabled: xlOn },
  xlFx: { run: () => Sheet.functionDialog(), enabled: xlOn },
  xlRename: { run: () => Sheet.rename(Sheet.active.id), enabled: xlOn },
  xlPasteLink: { run: () => Sheet.pasteLink(), enabled: () => xlOn() && !!Sheet.clip && !Sheet.clip.cut },
  xlCopyRef: { run: () => Sheet.copyRef(), enabled: () => !!Sheet.active },
  xlCalcMode: { run: (m) => { Store.ui.berechnung = m === 'manuell' ? 'manuell' : 'auto'; UiState.save(); if (m !== 'manuell') Sheet.recalc(); else UI.toast('Manuelle Berechnung: abhängige Zellen mit F9 berechnen'); Ribbon.refresh(); } },
  xlRecalc: { run: (full) => Sheet.recalc(!!full) },
  xlAlign: { run: (a) => Sheet.formatSel(f => { f.al = f.al === a ? null : a; }, 'Ausrichtung'), enabled: xlOn, active: (a) => !!Sheet.active && Sheet.fmtActive('al') === a },
  xlBg: { run: (c) => Sheet.formatSel(f => { f.bg = c || null; }, 'Füllfarbe'), enabled: xlOn },
  xlColor: { run: (c) => Sheet.formatSel(f => { f.c = c || null; }, 'Schriftfarbe'), enabled: xlOn },
  // Excel-Seiten 1.67: Rahmen, Fenster fixieren, Überschriften, Duplikate, Text in Spalten
  xlBorder: { run: (k) => OfficeGrid.setBorder(k), enabled: () => xlOn() },
  // Ausrichtung wie Excel (1.71): oben / Mitte / unten, Zeilenumbruch
  xlVa: { run: (v) => Sheet.formatSel((f) => { f.va = v === 'b' ? null : v; }, 'Vertikal ausgerichtet'), enabled: () => xlOn(), active: (v) => { const a = Sheet.active, d = a && Sheet.data(a.id), c = d && d.cells[XL.key(a.c, a.r)], f = (c && c.f) || (d && d.xl && d.xl.f0) || {}; return (f.va || 'b') === v; } },
  xlWrap: { run: () => { const a = Sheet.active, d = a && Sheet.data(a.id), c = d && d.cells[XL.key(a.c, a.r)], on = !!(((c && c.f) || (d && d.xl && d.xl.f0) || {}).wr); Sheet.formatSel((f) => { f.wr = !on || null; }, on ? 'Zeilenumbruch aus' : 'Zeilenumbruch'); }, enabled: () => xlOn(), active: () => { const a = Sheet.active, d = a && Sheet.data(a.id), c = d && d.cells[XL.key(a.c, a.r)]; return !!(((c && c.f) || (d && d.xl && d.xl.f0) || {}).wr); } },
  xlFreeze: { run: (k) => OfficeGrid.freeze(k), enabled: () => xlOn(), active: (k) => { const d = Sheet.active && Sheet.data(Sheet.active.id); return !!d && !!d.freeze && k !== 'off'; } },
  xlHeads: { run: () => { const d = Sheet.data(Sheet.active.id); if (d.heads === false) delete d.heads; else d.heads = false; Sheet.changed('Überschriften'); }, enabled: () => xlOn(), active: () => { const d = Sheet.active && Sheet.data(Sheet.active.id); return !!d && d.heads !== false; } },
  xlDup: { run: () => OfficeGrid.removeDuplicates(), enabled: () => xlOn() },
  xlSplit: { run: () => OfficeGrid.textToColumns(), enabled: () => xlOn() },
  xlOpt: {
    run: (k) => { const d = Sheet.data(Sheet.active.id); d[k] = !d[k]; Sheet.changed({ head: 'Kopfzeile', band: 'Gebänderte Zeilen', grid: 'Gitternetzlinien' }[k]); },
    enabled: xlOn, active: (k) => !!Sheet.active && !!(Sheet.data(Sheet.active.id) || {})[k],
  },
  xlStyle: { run: (c) => { const d = Sheet.data(Sheet.active.id); d.color = c || null; Sheet.changed('Tabellenfarbe'); }, enabled: xlOn },
  /* Word, PowerPoint wie die Programme (1.72, office-wordtools.js / office-ppttools.js) */
  symbol: { run: () => OfficeSym.show(), enabled: () => !Store.readOnly && !!Canvas.page },
  wHF: { run: (k) => OfficeWX.hfDialog(k || 'h'), enabled: () => !Store.readOnly && !!OfficePages.page('docx') },
  wHyph: { run: (on) => OfficeWX.hyph(on === '1'), enabled: () => !Store.readOnly && !!OfficePages.page('docx'), active: (on) => { const p = OfficePages.page('docx'); return !!p && !!p.office.hyph === (on === '1'); } },
  wSort: { run: (d) => OfficeWX.sort(d === 'desc'), enabled: () => !Store.readOnly && !!OfficePages.page('docx') },
  pHide: { run: () => OfficePX.hideSlide(), enabled: () => !Store.readOnly && !!OfficePages.page('pptx'), active: () => OfficePX.hidden() },
  pHF: { run: () => OfficePX.hfDialog(), enabled: () => !Store.readOnly && !!OfficePages.page('pptx') },
  pSorter: { run: () => OfficePX.sorter(), enabled: () => !!OfficePages.page('pptx'), active: () => OfficePX.sorterOn() },
  pSetup: { run: () => OfficePX.setup(), enabled: () => !Store.readOnly && !!OfficePages.page('pptx') },
  transOpt: { run: (a) => { if (a === 'click:true') { const f = OfficePpt.currentFrame(); OfficeAnim.setTransOpt('click', f && f.ox.tr && f.ox.tr.click === false ? true : false); return; } const i = String(a).indexOf(':'); OfficeAnim.setTransOpt(a.slice(0, i), a.slice(i + 1) === 'true' ? true : a.slice(i + 1) === 'false' ? false : a.slice(i + 1)); }, enabled: () => !Store.readOnly && !!OfficePpt.currentFrame(),
    active: (a) => { const f = OfficePpt.currentFrame(), t = (f && f.ox.tr) || {}; const [k, v] = [a.slice(0, a.indexOf(':')), a.slice(a.indexOf(':') + 1)]; return k === 'click' ? t.click !== false : String(t[k] ?? '') === v; } },
  /* Office-Konzept (1.73, office-ui.js) */
  tbl: { run: (op) => OfficeUI.tbl(op), enabled: () => !Store.readOnly && OfficeUI.inTable() },
  textToTable: { run: () => OfficeUI.textToTable(), enabled: () => !Store.readOnly && !!Canvas.editing },
  wRead: { run: () => OfficeUI.readMode(), enabled: () => !!OfficePages.page('docx') },
  wPages: { run: (m) => OfficeReader.open(m ? { mode: m } : null), enabled: () => !!OfficePages.page('docx') },   // Seitenansicht (1.74)
  wPrintView: { run: () => OfficeDoc.zoom('width'), enabled: () => !!OfficePages.page('docx'), active: () => !!OfficePages.page('docx') },
  xlNormalView: { run: () => { if (Store.ui.xlBreaks) OfficeXT.pageBreaks(); }, enabled: () => !!OfficePages.page('xlsx'), active: () => !Store.ui.xlBreaks },
  pOutline: { run: () => OfficeUI.outline(), enabled: () => !!OfficePages.page('pptx'), active: () => !!OfficeUI._outline },
  pRead: { run: () => Show.start('here', { window: true }), enabled: () => !!OfficePages.page('pptx') },
  xlProtectBook: { run: () => OfficeXT.protectBook(), enabled: () => !Store.readOnly && !!OfficePages.page('xlsx'), active: () => OfficeXT.wbOn() },
  officeInspect: { run: () => OfficeUI.inspect(), enabled: () => !!OfficePages.page() },
  officeCompat: { run: () => OfficeUI.compat(), enabled: () => !!OfficePages.page() },
  /* Excel wie Excel (1.72, office-xltools.js) */
  xlMerge: { run: (k) => OfficeXT.merge(k || 'center'), enabled: xlOn },
  xlIndent: { run: (d) => Sheet.formatSel(f => { f.in = Math.max(0, Math.min(15, (f.in || 0) + (+d || 1))) || null; if (f.in && !f.al) f.al = 'l'; }, 'Einzug'), enabled: xlOn },
  xlFmtDlg: { run: (t) => OfficeXT.formatDialog(t), enabled: xlOn },
  xlFind: { run: (r) => OfficeXT.findDialog(!!r), enabled: () => !!Sheet.active },
  xlGoTo: { run: () => OfficeXT.goTo(), enabled: () => !!Sheet.active },
  xlCellStyle: { run: (n) => OfficeXT.cellStyle(n), enabled: xlOn },
  xlAsTable: { run: (i) => OfficeXT.asTable(+i || 0), enabled: xlOn },
  xlRowH: { run: () => OfficeXT.rowHeight(), enabled: xlOn },
  xlColW: { run: () => OfficeXT.colWidth(), enabled: xlOn },
  xlHide: { run: (k) => OfficeXT.hide(k[0], k[1] === '+'), enabled: xlOn },
  xlNote: { run: () => OfficeXT.noteEdit(), enabled: () => !!Sheet.active && !Store.readOnly },
  xlNoteDel: { run: () => OfficeXT.noteDel(), enabled: xlOn },
  xlNoteStep: { run: (d) => OfficeXT.noteStep(+d || 1), enabled: () => { const d = Sheet.active && Sheet.data(Sheet.active.id); return !!(d && d.notes && Object.keys(d.notes).length); } },
  xlNotesAll: { run: () => OfficeXT.notesAll(), enabled: () => !!Sheet.active, active: () => !!Store.ui.xlNotesAll },
  xlProtect: { run: () => OfficeXT.protect(), enabled: () => !!Sheet.active && !Store.readOnly, active: () => { const d = Sheet.active && Sheet.data(Sheet.active.id); return !!(d && d.prot && d.prot.on); } },
  xlFilter: { run: () => OfficeXT.filterToggle(), enabled: xlOn, active: () => { const d = Sheet.active && Sheet.data(Sheet.active.id); return !!(d && d.af); } },
  xlFilterClear: { run: () => OfficeXT.clearFilters(), enabled: () => { const d = xlOn() && Sheet.data(Sheet.active.id); return !!(d && d.af && d.af.f && Object.keys(d.af.f).length); } },
  xlFilterRe: { run: () => OfficeXT.reapply(), enabled: () => { const d = xlOn() && Sheet.data(Sheet.active.id); return !!(d && d.af); } },
  xlSortDlg: { run: () => OfficeXT.sortDialog(), enabled: xlOn },
  xlDv: { run: () => OfficeXT.dvDialog(), enabled: xlOn },
  xlGoal: { run: () => OfficeXT.goalSeek(), enabled: xlOn },
  xlShowF: { run: () => OfficeXT.showFormulas(), enabled: () => !!Sheet.active, active: () => { const d = Sheet.active && Sheet.data(Sheet.active.id); return !!(d && d.showF); } },
  xlTrace: { run: (k) => k === 'off' ? OfficeXT.untrace() : OfficeXT.trace(k), enabled: () => !!Sheet.active },
  xlErrCheck: { run: () => OfficeXT.errorCheck(), enabled: () => !!Sheet.active },
  xlBreaks: { run: () => OfficeXT.pageBreaks(), enabled: () => !!Sheet.active, active: () => !!Store.ui.xlBreaks },
  xlPs: { run: (a) => OfficeXT.psSet(...String(a).split(':')), enabled: xlOn, active: (a) => OfficeXT.psGet(...String(a).split(':')) },
  xlPrintArea: { run: (on) => OfficeXT.printArea(on !== 'off'), enabled: xlOn },
  xlPrintTitles: { run: () => OfficeXT.printTitles(), enabled: xlOn },
  xlHF: { run: () => OfficeXT.headerFooter(), enabled: xlOn },
  xlCsv: { run: () => Sheet.exportCsv(), enabled: () => !!Sheet.active },
  xlChart: { run: (t) => Chart.insertFromSheet(t), enabled: xlOn },
  xlToCalc: { run: () => { Calc.show(); Calc.view = 'data'; Calc.fromSheet(); }, enabled: () => !!Sheet.active },
  // Diagramme
  chType: { run: (t) => Chart.set('type', t, 'Diagrammtyp'), enabled: chOn, active: (t) => !!Chart.selected() && Chart.selected().chart.type === t },
  chEdit: { run: () => Chart.editDialog(), enabled: () => !!Chart.selected() },
  chFlag: { run: (k) => { const b = Chart.selected(); Chart.set(k, !b.chart[k]); }, enabled: chOn, active: (k) => !!Chart.selected() && !!Chart.selected().chart[k] },
  chLegend: { run: (v) => Chart.set('legend', v, 'Legende'), enabled: chOn, active: (v) => !!Chart.selected() && Chart.selected().chart.legend === v },
  chTrend: { run: (v) => Chart.set('trend', v, 'Trendlinie'), enabled: chOn, active: (v) => !!Chart.selected() && (Chart.selected().chart.trend || '') === v },
  chPal: { run: (i) => Chart.set('pal', i, 'Diagrammfarben'), enabled: chOn },
  chSwap: { run: () => { const b = Chart.selected(); Chart.set('byRow', !b.chart.byRow, 'Zeilen/Spalten getauscht'); }, enabled: chOn },
  chData: { run: () => Chart.showData(), enabled: () => !!Chart.selected() },
  chToSheet: { run: () => Chart.toSheet(), enabled: () => !!Chart.selected() && !!Canvas.page },
  chTitle: {
    run: async (k) => { const b = Chart.selected(); const v = await UI.prompt({ title: 'Diagrammtitel', xTitle: 'Titel der x-Achse', yTitle: 'Titel der y-Achse' }[k || 'title'], b.chart[k || 'title'] || '', { placeholder: k === 'title' || !k ? 'leer = automatisch' : '' }); if (v != null) Chart.set(k || 'title', v.trim(), 'Diagrammtitel'); },
    enabled: chOn,
  },
  chSource: { run: () => { const b = Chart.selected(); const sb = b && Chart.srcBox(b); if (!sb) { UI.toast('Keine Quelltabelle auf dieser Seite'); return; } const rg = XL.parseRange(b.chart.src.range); Canvas.scrollToBox(sb.id); Sheet.activate(sb.id, rg.c1, rg.r1); Sheet.active.c2 = Math.min(rg.c2, sb.sheet.ncols - 1); Sheet.active.r2 = Math.min(rg.r2, sb.sheet.nrows - 1); Sheet.refreshUi(); }, enabled: () => !!Chart.selected() && !!Chart.srcBox(Chart.selected()) },
  linkRoute: { run: () => { Store.ui.linkRoute = Store.ui.linkRoute === false; UiState.saveSoon(); Canvas.renderLinks(); }, active: () => Store.ui.linkRoute !== false },
  scrollbars: { run: () => { Store.ui.scrollbars = Store.ui.scrollbars === false; UiState.saveSoon(); Canvas.updateScroll(); }, active: () => Store.ui.scrollbars !== false },
  showAnchors: { run: () => { Store.ui.showAnchors = !Store.ui.showAnchors; UiState.saveSoon(); Canvas.updateScroll(); }, active: () => !!Store.ui.showAnchors },
  goAnchor: { run: (w) => Canvas.goAnchor(w), enabled: hasPage },
  insertLink: {
    run: async () => {
      if (!Canvas.editing) { UI.toast('Zuerst in ein Textfeld klicken bzw. Text markieren'); return; }
      Canvas.restoreRange();
      const range = Canvas.lastRange ? Canvas.lastRange.cloneRange() : null;
      const selText = getSelection().toString();
      const url = await UI.prompt('Link einfügen', /^https?:\/\//i.test(selText) ? selText : 'https://', { text: 'Adresse der Webseite. Im Textfeld genügt ein Klick zum Öffnen (Strg+Klick = Text bearbeiten).', ok: 'Einfügen' });
      if (!url || url === 'https://') return;
      Canvas.lastRange = range;
      Fmt.apply(() => {
        if (getSelection().isCollapsed) Fmt.exec('insertHTML', `<a href="${escapeHtml(url)}">${escapeHtml(url)}</a>&nbsp;`);
        else Fmt.exec('createLink', url);
      }, 'Link eingefügt');
    }, enabled: inEdit,
  },
  unlink: { run: () => Fmt.apply(() => Fmt.exec('unlink'), 'Link entfernt'), enabled: inEdit },
  insertDate: { run: (withTime) => Fmt.apply(() => Fmt.exec('insertText', new Date().toLocaleDateString('de-CH', { day: 'numeric', month: 'long', year: 'numeric' }) + (withTime ? ', ' + new Date().toLocaleTimeString('de-CH', { hour: '2-digit', minute: '2-digit' }) : '')), 'Datum eingefügt'), enabled: inEdit },
  insertSymbol: { run: (ch) => Fmt.apply(() => Fmt.exec('insertText', ch), 'Symbol eingefügt'), enabled: inEdit },
  insertFormula: { run: (tex) => Formula.open(null, tex), enabled: hasPage },
  insertHr: { run: () => Fmt.apply(() => Fmt.exec('insertHTML', '<hr><div><br></div>'), 'Trennlinie'), enabled: inEdit },

  group: { run: () => Canvas.group(), enabled: () => Canvas.selectedBoxes().length > 1 },
  ungroup: { run: () => Canvas.ungroup(), enabled: () => Canvas.selectedPkgIds().length > 0 },
  lock: { run: () => Canvas.setLock(true), enabled: hasSel },
  unlock: { run: () => Canvas.setLock(false), enabled: hasSel },
  toggleLock: { run: () => Canvas.toggleLock(), enabled: hasSel, active: () => Canvas.selectionLocked() },
  front: { run: () => Canvas.order(true), enabled: hasSel },
  back: { run: () => Canvas.order(false), enabled: hasSel },
  align: { run: (m) => Canvas.align(m), enabled: () => Canvas.selectedNodes().length > 1 },
  sameWidth: { run: () => Canvas.sameWidth(), enabled: () => Canvas.selectedBoxes().length > 1 },
  pkgRename: { run: () => { const id = Canvas.selectedPkgIds()[0]; if (id) Canvas.renamePkg(id); }, enabled: () => Canvas.selectedPkgIds().length > 0 },
  pkgColor: { run: (c) => Canvas.setPkgColor(c), enabled: () => Canvas.selectedPkgIds().length > 0 },

  connect: { run: () => Canvas.connectSelected(), enabled: () => Canvas.selectedNodes().length > 1 },
  disconnect: { run: () => Canvas.disconnectSelected(), enabled: () => !!Canvas.selLink || hasSel() },
  linkStyle: { run: (s) => Canvas.setLinkProps({ style: s }, 'Linienform'), active: (s) => linkActive('style', 'kurve', s) },
  arrow: { run: (a) => Canvas.setLinkProps({ arrow: a }, 'Pfeil'), active: (a) => linkActive('arrow', 'ende', a) },
  reverse: { run: () => Canvas.reverseLinks(), enabled: () => !!Canvas.page && Canvas.linksOfSelection().length > 0 },
  linkColor: { run: (c) => Canvas.setLinkProps({ color: c }, 'Linienfarbe') },
  linkWidth: { run: (w) => Canvas.setLinkProps({ w }, 'Linienstärke') },
  dash: { run: () => { const ls = Canvas.page ? Canvas.linksOfSelection() : []; const on = ls.length ? !ls.every(l => l.dash) : !Store.ui.linkDefault?.dash; Canvas.setLinkProps({ dash: on }, 'Linienart'); }, active: () => { const ls = Canvas.page ? Canvas.linksOfSelection() : []; return ls.length ? ls.every(l => l.dash) : !!Store.ui.linkDefault?.dash; } },
  label: { run: () => Canvas.editLinkLabel(Canvas.selLink), enabled: () => !!Canvas.selLink },
  resetLink: { run: () => Canvas.resetLinks(), enabled: () => !!Canvas.page && Canvas.linksOfSelection().some(l => l.aAnchor || l.bAnchor || l.bend) },
  treeLayout: { run: () => Canvas.treeLayout(), enabled: hasPage },

  drawTool: { run: (t) => Draw.setTool(t), active: (t) => Draw.tool === t, enabled: hasPage },
  pen: {
    // mit ausgewählten Strichen (1.51): nur die Striche dieser Stiftart bekommen die Farbe des Stifts
    run: (i) => {
      if (Draw.sel.size && Draw.applyPen(Store.ui.pens[i])) return;
      if (Draw.tool === 'pen' && Store.ui.activePen === i) Draw.penMenu(i, $(`#panel .pen-btn[data-pen="${i}"]`)); else Draw.setTool('pen', i);
    },
    active: (i) => Draw.tool === 'pen' && Store.ui.activePen === i, enabled: hasPage,
  },
  penSettings: { run: (anchor) => Draw.penMenu(Store.ui.activePen || 0, anchor || $(`#panel .pen-btn[data-pen="${Store.ui.activePen || 0}"]`)), enabled: hasPage },
  eraserMode: { run: (m) => { Store.ui.eraserMode = m; UiState.saveSoon(); Draw.setTool('eraser'); }, active: (m) => Draw.tool === 'eraser' && Store.ui.eraserMode === m, enabled: hasPage },
  eraserSize: { run: (s) => { Store.ui.eraserSize = s; Store.ui.eraserMode = 'punkt'; UiState.saveSoon(); Draw.setTool('eraser'); } },
  shapeTool: { run: (s) => Draw.setTool('shape', s), active: (s) => Draw.tool === 'shape' && Draw.shape === s, enabled: hasPage },
  shapeFill: { run: (c) => { if (!Draw.setFill(c)) { Store.ui.shapeFill = c || null; UiState.saveSoon(); UI.toast(c ? 'Neue Formen werden gefüllt' : 'Neue Formen ohne Füllung'); } } },
  drawColor: {
    run: (c) => {
      if (!c) return;
      // gemischte Auswahl (1.51): nur die Striche der Art des aktiven Stifts, sonst alles Ausgewählte
      if (Draw.sel.size) {
        const pen = Draw.activePen(), sel = Draw.selected();
        const same = sel.filter(d => d.type === 'ink' && (d.kind || 'pen') === pen.kind);
        if (same.length && same.length < sel.length && pen.kind !== 'rainbow' && pen.kind !== 'glitter') { Draw.applyPen({ ...pen, color: c }); return; }
      }
      if (Draw.recolor(c)) return;
      const pen = Draw.activePen();
      if (pen.kind === 'rainbow' || pen.kind === 'glitter') pen.kind = 'pen';
      pen.color = c; UiState.saveSoon(); Draw.setTool('pen'); Ribbon.show(Ribbon.tab);
    },
  },
  ruler: { run: () => Draw.toggleTool('ruler'), active: () => !!(Store.ui.ruler && Store.ui.ruler.visible), enabled: hasPage },
  protractor: { run: () => Draw.toggleTool('protractor'), active: () => !!(Store.ui.protractor && Store.ui.protractor.visible), enabled: hasPage },
  penOnly: {
    run: () => { Store.ui.penOnly = !Store.ui.penOnly; UiState.saveSoon(); UI.toast(Store.ui.penOnly ? 'Nur mit Stift zeichnen: Finger verschieben und zoomen' : 'Finger zeichnen wieder mit', 3000); },
    active: () => !!Store.ui.penOnly,
  },
  recognize: {
    run: () => { Store.ui.recognize = !Store.ui.recognize; UiState.saveSoon(); if (Store.ui.recognize && Draw.tool !== 'pen') Draw.setTool('pen'); else Draw.hint(); UI.toast(Store.ui.recognize ? 'Formerkennung an: gezeichnete Linien, Rechtecke, Kreise … werden sauber' : 'Formerkennung aus'); },
    active: () => !!Store.ui.recognize,
  },
  inkToShape: { run: () => Draw.inkToShape(), enabled: () => Draw.selected().some(d => d.type === 'ink') },
  inkToText: { run: () => Draw.inkToText(), enabled: () => Draw.selected().some(d => d.type === 'ink') },
  // chemDraw, chemTool, chemFormula, chemPse: seit 1.69 vom eingebauten Add-In Chem-Draw (addon-chemdraw.js)
  drawFront: { run: () => Draw.order(true), enabled: () => Draw.sel.size > 0 },
  drawBack: { run: () => Draw.order(false), enabled: () => Draw.sel.size > 0 },

  zoomIn: { run: () => Canvas.setZoom(Math.min(ZOOM_MAX, Canvas.view.z * 1.2)), enabled: hasPage },
  zoomOut: { run: () => Canvas.setZoom(Math.max(ZOOM_MIN, Canvas.view.z / 1.2)), enabled: hasPage },
  zoom100: { run: () => Canvas.setZoom(1), enabled: hasPage },
  fit: { run: () => Canvas.fit(), enabled: hasPage },
  bg: {
    run: (t) => { if (!Canvas.page) return; Canvas.page.bg = t; Canvas.applyView(); Hist.touchPage(Canvas.pageId); Hist.commit('Linien der Seite'); },
    active: (t) => !!Canvas.page && Canvas.page.bg === t, enabled: hasPage,
  },
  pageColor: {
    run: (c) => { if (!Canvas.page) return; Canvas.page.color = c || null; Canvas.applyView(); Hist.touchPage(Canvas.pageId); Hist.commit('Seitenfarbe'); },
    enabled: hasPage,
  },
  // mehrere Tabs und geteilte Bereiche (1.35)
  // Rechtschreibung (1.38)
  spellPanel: { run: () => Spell.panel(), enabled: hasPage },
  spellOn: { run: () => Spell.setOpts({ on: !Spell.opts().on }), active: () => Spell.opts().on },
  spellFach: { run: () => Spell.setOpts({ fach: !Spell.opts().fach }), active: () => Spell.opts().on && Spell.opts().fach },
  spellUser: { run: () => Spell.userDialog() },
  spellReload: { run: () => Spell.reload() },
  tabNew: { run: () => Panes.newTab(), enabled: () => !!Canvas.pageId },
  tabsMin: { run: () => Panes.toggleMin(), active: () => !!Store.ui.tabsMin },
  splitRight: { run: () => Panes.split('h'), enabled: () => !!Canvas.pageId },
  splitDown: { run: () => Panes.split('v'), enabled: () => !!Canvas.pageId },
  tabClose: { run: () => Panes.closeTab(Store.ui.panes.active), enabled: () => !!Store.ui.panes && (Panes.count() > 1 || (Panes.active() || { tabs: [] }).tabs.length > 1) },
  paneClose: { run: () => Panes.closePane(Store.ui.panes.active), enabled: () => !!Store.ui.panes && Panes.count() > 1 },
  fullscreen: { run: () => App.toggleFullscreen(), active: () => document.body.classList.contains('fullscreen') },
  pageListSide: { run: (s) => { Store.ui.pageListSide = s; Sidebar.applyWidths(); UiState.saveSoon(); }, active: (s) => (Store.ui.pageListSide || 'links') === s },
  snap: { run: () => { Store.ui.snap = !Store.ui.snap; UiState.saveSoon(); UI.toast(Store.ui.snap ? 'Am Raster ausrichten: an' : 'Am Raster ausrichten: aus'); }, active: () => !!Store.ui.snap },
  foldNav: { run: (w) => Sidebar.fold(w), active: (w) => !!(Store.ui.navFold || {})[w] },
  sidebar: { run: () => { Store.ui.sidebar = Store.ui.sidebar === false; Sidebar.applyWidths(); UiState.saveSoon(); }, active: () => Store.ui.sidebar !== false },
  theme: { run: (t) => { Store.ui.theme = t || (Store.ui.theme === 'dunkel' ? 'hell' : 'dunkel'); App.applyTheme(); Canvas.render(); Canvas.renderLinks(); Canvas.applyView(); UiState.saveSoon(); }, active: (t) => Store.ui.theme === t },
  inkFix: { run: () => { Store.ui.inkFix = Store.ui.inkFix === false; Canvas.refreshInk(); UiState.saveSoon(); UI.toast(Store.ui.inkFix ? 'Lesbare Farben: kaum lesbare Schriftfarben werden heller bzw. dunkler angezeigt' : 'Lesbare Farben aus: Schriftfarben genau wie gewählt'); }, active: () => Store.ui.inkFix !== false },
};

function linkActive(prop, def, v) {
  const ls = Canvas.page ? Canvas.linksOfSelection() : [];
  if (ls.length) return ls.some(l => (l[prop] || def) === v);
  return ((Store.ui.linkDefault || {})[prop] || def) === v;
}

/* Start-Register bei aktiver Tabelle: Formatierung wirkt auf die markierten Zellen (wie Excel) */
{
  const xlPage = () => typeof OfficeXT !== 'undefined' && !!Sheet.active && OfficeXT.on(Sheet.active.id);
  const R = {
    bold: [() => Sheet.toggle('b'), () => Sheet.fmtActive('b')], italic: [() => Sheet.toggle('i'), () => Sheet.fmtActive('i')],
    underline: [() => Sheet.toggle('u'), () => Sheet.fmtActive('u')], strike: [() => Sheet.toggle('s'), () => Sheet.fmtActive('s')],
    fontColor: [(c) => Sheet.formatSel(f => { f.c = c || null; }, 'Schriftfarbe')], highlight: [(c) => Sheet.formatSel(f => { f.bg = c || null; }, 'Füllfarbe')],
    alignLeft: [() => Sheet.formatSel(f => { f.al = 'l'; }, 'Linksbündig'), () => Sheet.fmtActive('al') === 'l'],
    alignCenter: [() => Sheet.formatSel(f => { f.al = 'c'; }, 'Zentriert'), () => Sheet.fmtActive('al') === 'c'],
    alignRight: [() => Sheet.formatSel(f => { f.al = 'r'; }, 'Rechtsbündig'), () => Sheet.fmtActive('al') === 'r'],
    size: [(v) => xlPage() ? OfficeXT.cellFont('fs', v) : Sheet.formatSel(f => { f.fs = +v || null; }, 'Schriftgrad')], clearFormat: [() => Sheet.clear('f')],
    // Excel-Seite (1.73): Schritte wie Excel (8, 9, 10, 11, 12, 14, 16 …); Tabellen auf Freiform-Seiten wie bisher ±1
    grow: [() => xlPage() ? OfficeXT.grow(1) : Sheet.formatSel(f => { f.fs = Math.min(72, (f.fs || 11) + 1); }, 'Schrift vergrössern')], shrink: [() => xlPage() ? OfficeXT.grow(-1) : Sheet.formatSel(f => { f.fs = Math.max(6, (f.fs || 11) - 1); }, 'Schrift verkleinern')],
    cut: [() => { Sheet.focusKb(); document.execCommand('cut'); }], copy: [() => { Sheet.focusKb(); document.execCommand('copy'); }], paste: [() => Sheet.pasteButton()],
    selectAll: [() => { const a = Sheet.active, d = Sheet.data(a.id); a.c = 0; a.r = 0; a.c2 = d.ncols - 1; a.r2 = d.nrows - 1; Sheet.refreshUi(); }],
  };
  for (const [k, [fn, act]] of Object.entries(R)) {
    const c = COMMANDS[k];
    if (!c) continue;
    const run0 = c.run, en0 = c.enabled, act0 = c.active;
    c.run = (a) => Sheet.active ? fn(a) : run0(a);
    c.enabled = () => Sheet.active ? (['copy', 'selectAll'].includes(k) || !Sheet.locked(Sheet.active.id)) : (en0 ? en0() : true);
    if (act || act0) c.active = (a) => Sheet.active ? (act ? !!act(a) : false) : (act0 ? act0(a) : false);
  }
}

const Cmd = {
  // brauchen alle Seiten (Laden in Stufen, 1.30): warten kurz, bis alles da ist
  NEED_ALL: new Set(['deleteSection', 'exportNotebook', 'closeNotebook', 'backup', 'restore', 'trash', 'movePage', 'insertLink', 'xlPasteLink', 'versions', 'save', 'quit']),
  run(name, arg) {
    const c = COMMANDS[name];
    if (!c) return;
    if (!Store.complete && this.NEED_ALL.has(name)) { Store.gate(() => this.run(name, arg)); return; }
    if (Store.readOnly && !['about', 'shortcuts', 'zoomIn', 'zoomOut', 'zoom100', 'fit', 'find'].includes(name)) return;
    try {
      const r = c.run(arg);
      if (r && r.catch) r.catch(e => { console.error(e); UI.toast('Fehler: ' + e.message); });
    } catch (e) { console.error(e); UI.toast('Fehler: ' + e.message); }
    Ribbon.refreshSoon();
  },
  enabled(name) { const c = COMMANDS[name]; return !c || !c.enabled || c.enabled(); },
  active(name, arg) { const c = COMMANDS[name]; return !!(c && c.active && c.active(arg)); },
};
