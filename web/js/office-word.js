'use strict';
/* Word-Seiten wie Word bedienen (1.67) – ergänzt office-view.js (Papier, Fluss) und office-doc.js (Datei).
 *
 *  - Klick aufs Blatt (Rand, Fläche, Lücke zwischen Absätzen): Schreibmarke an die nächste Textstelle, Ziehen markiert
 *    Text, Umschalt+Klick erweitert die Markierung – wie Word (kein neues Textfeld, kein Auswählen des Blatts).
 *  - Formatierungszeichen (¶): Absatzmarken, Leerzeichen/Tabulatoren hervorgehoben, Seitenumbruch beschriftet.
 *  - Statusleiste: Seite x von n (an der Schreibmarke), Wörter (bei Markierung „12 von 530 Wörtern“), Zeichen;
 *    Klick darauf = „Wörter zählen“.
 *  - Lineale oben und links: Ränder grau, Zählung ab dem Rand; Ränder durch Ziehen der Grenze ändern (→ w:pgMar).
 *  - Navigationsbereich: Überschriften 1–3, Klick springt hin.
 *  - Entwurf: Absatzabstand (docDefaults/Standard), Schriftart des Dokuments (rFonts), Seitenränder (w:pgBorders). */
const OfficeWord = {
  on() { const p = Canvas.page; return p && p.type === 'dok' && p.office && p.office.asset ? p : null; },
  init() {
    document.addEventListener('selectionchange', () => {
      if (!this.on()) return;
      cancelAnimationFrame(this._sc);
      this._sc = requestAnimationFrame(() => { Canvas.updateStatus(); this.navMark(); });
    });
    document.addEventListener('input', (e) => { if (this.on() && this.marksOn() && e.target.closest && e.target.closest('.box.ow')) this.marksSoon(); }, true);
    const sb = document.getElementById('sb-left');
    if (sb) sb.addEventListener('click', () => { if (this.on()) OfficeDoc.wordCount(); });
  },

  /* ---------------------------------------------------------------- Klick aufs Blatt */
  writeBoxes(p) {
    return p.boxes.filter(b => b.ox && b.ox.k === 'w' && !Canvas.isLocked(b)).map(b => ({ b, t: Canvas.textEl(b.id) })).filter(o => o.t && o.t.isConnected);
  },
  down(ev, t) {
    const p = this.on();
    if (!p || ev.button !== 0 || ev.altKey || ev.ctrlKey || Store.readOnly || Canvas.spaceDown) return false;
    if (typeof Draw !== 'undefined' && Draw.tool && Draw.tool !== 'select') return false;
    if (Fmt.painter && Fmt.painter.kind === 'box') return false;
    const boxEl = t.closest && t.closest('.box');
    if (boxEl) {
      const b = Canvas.box(boxEl.dataset.id);
      if (!b || !b.ox) return false;
      if (b.ox.k === 'w') { if (t.closest('.box-text, .box-rs, .sock, .fimg')) return false; }
      else if (b.ox.k === 'hfp') {   // Kopf-/Fusszeile (1.72): Doppelklick = bearbeiten (wie Word)
        ev.preventDefault();
        const now = Date.now();
        if (this._hfT && now - this._hfT < 450 && typeof OfficeWX !== 'undefined') { this._hfT = 0; OfficeWX.hfDialog(b.ox.pos); } else this._hfT = now;
        return true;
      }
      else if (b.ox.k !== 'blatt' && b.ox.k !== 'wmp') return false;   // Bild, Tabelle, Kopfzeile, eigene Textfelder: wie bisher
    } else if (t.closest && t.closest('.pkg, .link-handle, [data-link], .kt-scroll, #empty-state')) return false;
    // Finger (Handy/Tablet, 1.68): ziehen = Seite verschieben wie bisher, kurz tippen = Schreibmarke (Tastatur erscheint)
    if (ev.pointerType === 'touch') {
      const x0 = ev.clientX, y0 = ev.clientY, t0 = performance.now();
      const up = (e) => {
        window.removeEventListener('pointerup', up, true);
        if (Math.hypot(e.clientX - x0, e.clientY - y0) > 10 || performance.now() - t0 > 650) return;
        setTimeout(() => { const h = this.caretAt(p, x0, y0); if (h) { Canvas.select([]); this.place(h, null); } }, 0);
      };
      window.addEventListener('pointerup', up, true);
      return false;
    }
    const hit = this.caretAt(p, ev.clientX, ev.clientY);
    if (!hit) return false;
    ev.preventDefault();
    if (Canvas.sel.size && !Canvas.sel.has(hit.b.id)) Canvas.select([]);
    const s = getSelection();
    const anchor = ev.shiftKey && s.rangeCount && hit.t.contains(s.anchorNode) ? { node: s.anchorNode, off: s.anchorOffset } : { node: hit.node, off: hit.off };
    this.place(hit, ev.shiftKey ? anchor : null);
    const move = (e) => { const h = this.caretAt(p, e.clientX, e.clientY, hit.t); if (h) this.place(h, anchor); };
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up); };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up);
    return true;
  },
  place(h, anchor) {
    if (document.activeElement !== h.t) h.t.focus({ preventScroll: true });
    const s = getSelection();
    try {
      if (anchor) s.setBaseAndExtent(anchor.node, anchor.off, h.node, h.off);
      else s.setBaseAndExtent(h.node, h.off, h.node, h.off);
    } catch (e) { /* Knoten inzwischen ersetzt */ }
  },
  rangeAt(x, y) {
    if (document.caretRangeFromPoint) return document.caretRangeFromPoint(x, y);
    if (document.caretPositionFromPoint) { const c = document.caretPositionFromPoint(x, y); if (c) { const r = document.createRange(); r.setStart(c.offsetNode, c.offset); return r; } }
    return null;
  },
  /* nächste Textstelle zum Punkt (Fensterkoordinaten): passender Schreibbereich, Zeile auf Höhe y, x in die Zeile geklemmt */
  caretAt(p, x, y, only) {
    const list = only ? [{ t: only, b: Canvas.box(only.closest('.box').dataset.id) }] : this.writeBoxes(p);
    let best = null, bd = Infinity;
    for (const o of list) {
      const r = o.t.getBoundingClientRect();
      if (!r.height) continue;
      const d = y < r.top ? r.top - y : y > r.bottom ? y - r.bottom : 0;
      if (d < bd) { bd = d; best = { ...o, r }; }
    }
    if (!best) return null;
    const { t, r } = best;
    const texts = () => { const w = document.createTreeWalker(t, NodeFilter.SHOW_TEXT); const out = []; while (w.nextNode()) out.push(w.currentNode); return out; };
    const at = (start) => { const ns = texts(); if (!ns.length) return { node: t, off: start ? 0 : t.childNodes.length }; const n = start ? ns[0] : ns[ns.length - 1]; return { node: n, off: start ? 0 : n.length }; };
    let pos;
    if (y >= r.bottom - 1) pos = at(false);
    else if (y <= r.top + 1) pos = at(true);
    else {
      const rg = this.rangeAt(clamp(x, r.left + 1, r.right - 2), y);
      if (rg && t.contains(rg.startContainer)) pos = { node: rg.startContainer, off: rg.startOffset };
      else {
        // Punkt über einer Lücke (Seitenwechsel, Absatzabstand): nächster Block, dessen Zeile am nächsten liegt
        let bb = null, bdd = Infinity;
        for (const c of t.querySelectorAll('p, div, h1, h2, h3, h4, h5, h6, li, pre, blockquote')) {
          if (c.querySelector('p, div, h1, h2, h3, h4, li')) continue;
          const cr = c.getBoundingClientRect(); if (!cr.height) continue;
          const d = y < cr.top ? cr.top - y : y > cr.bottom ? y - cr.bottom : 0;
          if (d < bdd) { bdd = d; bb = { c, cr }; }
        }
        if (bb) { const r2 = this.rangeAt(clamp(x, bb.cr.left + 1, bb.cr.right - 2), clamp(y, bb.cr.top + 2, bb.cr.bottom - 2)); pos = r2 && t.contains(r2.startContainer) ? { node: r2.startContainer, off: r2.startOffset } : at(false); }
        else pos = at(false);
      }
    }
    return { b: best.b, t, node: pos.node, off: pos.off };
  },

  /* ---------------------------------------------------------------- Formatierungszeichen ¶ */
  marksOn() { return !!Store.ui.wordMarks; },
  toggleMarks() { Store.ui.wordMarks = !this.marksOn(); UiState.saveSoon(); this.applyMarks(); Ribbon.refresh(); },
  marksSoon() { clearTimeout(this._mt); this._mt = setTimeout(() => this.applyMarks(), 200); },
  applyMarks() {
    const on = !!this.on() && this.marksOn();
    document.body.classList.toggle('kt-marks', on);
    if (typeof CSS === 'undefined' || !CSS.highlights) return;
    if (!on) { CSS.highlights.delete('kt-marks'); return; }
    const ranges = [];
    for (const t of document.querySelectorAll('#viewport .box.ow .box-text')) {
      const w = document.createTreeWalker(t, NodeFilter.SHOW_TEXT);
      while (w.nextNode() && ranges.length < 30000) {
        const n = w.currentNode, s = n.data;
        for (let i = 0; i < s.length; i++) { const ch = s.charCodeAt(i); if (ch === 32 || ch === 160 || ch === 9) ranges.push(new StaticRange({ startContainer: n, startOffset: i, endContainer: n, endOffset: i + 1 })); }
      }
    }
    CSS.highlights.set('kt-marks', new Highlight(...ranges));
  },

  /* ---------------------------------------------------------------- Statusleiste */
  _cnt: new Map(),
  _doc: null,
  textOf(html) {
    if (!this._doc) this._doc = document.implementation.createHTMLDocument('');
    const d = this._doc.createElement('div');
    d.innerHTML = (html || '').replace(/<\/(p|div|h\d|li|tr|pre|blockquote)>|<br\s*\/?>/gi, '$&\n');
    return d.textContent.replace(/ /g, ' ');
  },
  wordsIn(s) { return (s.match(/[\p{L}\p{N}][\p{L}\p{N}'’.-]*/gu) || []).length; },
  counts(p) {
    let words = 0, chars = 0, nsp = 0;
    for (const b of p.boxes) {
      if (!b.ox || !(b.ox.k === 'w' || b.ox.k === 'wlock')) continue;
      let c = this._cnt.get(b.id);
      if (!c || c.html !== b.html) {
        const t = this.textOf(b.html), lines = t.replace(/\n/g, '');
        c = { html: b.html, words: this.wordsIn(t), chars: lines.length, nsp: lines.replace(/\s/g, '').length };
        this._cnt.set(b.id, c);
      }
      words += c.words; chars += c.chars; nsp += c.nsp;
    }
    return { words, chars, nsp };
  },
  /* markierter Text im Dokument → Wörter (null = nichts markiert) */
  selWords() {
    const s = getSelection();
    if (!s.rangeCount || s.isCollapsed) return null;
    const n = s.anchorNode, e = n && (n.nodeType === 1 ? n : n.parentElement);
    if (!e || !e.closest('.box.ow')) return null;
    return this.wordsIn(s.toString());
  },
  pageAtCaret(p) {
    const P = OfficeView.paper(p);
    let wy = Canvas.viewCenter().y;
    const s = getSelection();
    if (s.rangeCount && Canvas.editing) {
      const n = s.focusNode, e = n && (n.nodeType === 1 ? n : n.parentElement);
      if (e && e.closest('.box.ow')) {
        const r = s.getRangeAt(0).getBoundingClientRect(), vr = Canvas.vp.getBoundingClientRect();
        if (r.height || r.top) wy = (r.top + r.height / 2 - vr.top - Canvas.view.y) / Canvas.view.z;
      }
    }
    return p.office.paperY != null ? Math.min(p.office.pages || 1, Math.max(1, Math.floor((wy - p.office.paperY) / (P.H + OfficeView.GAP)) + 1)) : 1;
  },
  status(p) {
    const c = this.counts(p), sw = this.selWords(), f = (n) => n.toLocaleString('de-CH');
    const w = sw != null ? `${f(sw)} von ${f(c.words)} Wörtern` : `${f(c.words)} Wörter`;
    return `Seite ${this.pageAtCaret(p)} von ${p.office.pages || 1}  ·  ${w}  ·  ${f(c.chars)} Zeichen  ·  ${OfficePages.LABEL.docx}: ${p.office.name}`;
  },

  /* ---------------------------------------------------------------- Ansicht: Lineale, Navigation, Entwurf */
  sync(p, el, force) {
    this.applyDesign(p);
    this.rulers(p, el, force);
    this.nav(p, el);
    this.marksSoon();
  },
  onView(p, el) { this.rulers(p, el); this.navMark(); },
  rulerOn() { return Store.ui.wordRuler !== false; },
  navOn() { return !!Store.ui.wordNav; },
  get NAVW() { return OfficeView.w('nav'); },
  /* links belegt: Navigationsbereich (nicht schmal: dort Einblendung) und senkrechtes Lineal */
  leftW() { const n = OfficeView.narrow(); return (this.navOn() && !n ? OfficeView.w('nav') : 0) + (this.rulerOn() && !n ? 22 : 0); },
  /* Lineale: oben über der Breite des Blatts, links für das Blatt an der Schreibmarke bzw. in der Mitte */
  rulers(p, host, force) {
    if (!host) return;
    let h = host.querySelector('.ofv-ruler'), v = host.querySelector('.ofv-vruler');
    if (!this.rulerOn() || OfficeView.narrow()) { if (h) h.remove(); if (v) v.remove(); return; }
    if (!h) { h = el('div', { class: 'ofv-ruler' }); host.prepend(h); }
    if (!v) { v = el('div', { class: 'ofv-vruler' }); host.append(v); }
    const nav = this.navOn() && !OfficeView.narrow() ? OfficeView.w('nav') : 0;
    h.style.left = nav + 'px'; v.style.left = nav + 'px';
    const P = this.paperPx(p), z = Canvas.view.z;
    const off = this.offset(host);
    const x0 = Canvas.view.x + (OfficeView.PX + 11) * z + off.x - nav;
    const i = this.pageAtCaret(p) - 1;
    const y0 = Canvas.view.y + (OfficeView.pageTop(p, i) + 13) * z + off.y - 22;
    const key = [Math.round(x0), Math.round(y0), z.toFixed(3), P.W, P.H, P.l, P.r, P.t, P.b, nav].join('|');
    if (!force && h._key === key) return;
    h._key = key;
    h.innerHTML = this.scale(P.W, P.l, P.r, z, x0, 'h');
    v.innerHTML = this.scale(P.H, P.t, P.b, z, y0, 'v');
    for (const m of host.querySelectorAll('.or-mh')) m.addEventListener('pointerdown', (e) => this.dragMargin(e, m.dataset.side));
  },
  paperPx(p) { return OfficeView.paper(p); },
  offset(host) { const a = Canvas.vp.getBoundingClientRect(), b = host.getBoundingClientRect(); return { x: a.left - b.left, y: a.top - b.top }; },
  /* eine Skala (h = waagrecht, v = senkrecht): Länge L, Ränder a/b in px (unskaliert), Beginn s0 auf dem Bildschirm */
  scale(L, a, b, z, s0, dir) {
    const CM = 1440 / 2.54 / 15, cm = CM * z, H = dir === 'h';
    const pos = (v) => H ? `left:${v}px` : `top:${v}px`, size = (v) => H ? `width:${v}px` : `height:${v}px`;
    let s = `<div class="or-page ${dir}" style="${pos(s0)};${size(L * z)}"><i style="${H ? 'left' : 'top'}:0;${size(a * z)}"></i><i style="${H ? 'right' : 'bottom'}:0;${size(b * z)}"></i>`;
    const step = cm > 30 ? 0.25 : cm > 14 ? 0.5 : 1;
    for (let k = -Math.floor(a / CM / step) * step; (a / CM + k) * CM <= L + 0.5; k += step) {
      const xx = (a / CM + k) * cm, whole = Math.abs(k - Math.round(k)) < 1e-6;
      if (whole && k && cm > 14) s += `<span style="${pos(xx)}">${Math.abs(Math.round(k))}</span>`;
      else if (whole && !k) continue;
      else s += `<b style="${pos(xx)}" class="${whole ? 'm' : Math.abs(k * 2 - Math.round(k * 2)) < 1e-6 ? 'h' : 'q'}"></b>`;
    }
    if (H) s += `<em style="left:${a * z}px" title="Linker Einzug"></em><em class="r" style="left:${(L - b) * z}px" title="Rechter Einzug"></em>`;
    const t1 = H ? 'Linker Rand – ziehen zum Ändern' : 'Oberer Rand – ziehen zum Ändern', t2 = H ? 'Rechter Rand – ziehen zum Ändern' : 'Unterer Rand – ziehen zum Ändern';
    s += `<u class="or-mh" data-side="${H ? 'l' : 't'}" style="${pos(a * z)}" title="${t1}"></u><u class="or-mh" data-side="${H ? 'r' : 'b'}" style="${pos((L - b) * z)}" title="${t2}"></u>`;
    return s + '</div>';
  },
  /* Rand ziehen: Linie über der Seite, beim Loslassen → Seite einrichten (Twips, auf 0,05 cm gerundet) */
  dragMargin(ev, side) {
    const p = this.on();
    if (!p || Store.readOnly) return;
    ev.preventDefault(); ev.stopPropagation();
    const P = this.paperPx(p), z = Canvas.view.z, H = side === 'l' || side === 'r';
    const host = OfficeView.el, page = ev.target.closest('.or-page'), pr = page.getBoundingClientRect(), hr = host.getBoundingClientRect();
    const line = el('div', { class: 'ofv-mline ' + (H ? 'h' : 'v') });
    host.append(line);
    const L = H ? P.W : P.H, other = { l: P.r, r: P.l, t: P.b, b: P.t }[side];
    let val = { l: P.l, r: P.r, t: P.t, b: P.b }[side];
    const tip = el('div', { class: 'ofv-mtip' }); host.append(tip);
    const show = (e) => {
      const at = H ? (e.clientX - pr.left) / z : (e.clientY - pr.top) / z;
      val = clamp(side === 'l' || side === 't' ? at : L - at, 0, L - other - 40);
      const sp = side === 'l' || side === 't' ? val : L - val;
      if (H) { line.style.left = (pr.left - hr.left + sp * z) + 'px'; tip.style.left = (pr.left - hr.left + sp * z + 6) + 'px'; tip.style.top = '26px'; }
      else { line.style.top = (pr.top - hr.top + sp * z) + 'px'; tip.style.top = (pr.top - hr.top + sp * z + 6) + 'px'; tip.style.left = '28px'; }
      tip.textContent = (val * 15 / 567).toFixed(2).replace('.', ',') + ' cm';
    };
    show(ev);
    const move = (e) => show(e);
    const up = () => {
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up);
      line.remove(); tip.remove();
      const tw = Math.round(val * 15 / 28.35) * 28.35;
      OfficeDoc.setPage('margin', { side, tw: Math.round(tw) });
    };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
  },

  /* Navigationsbereich (Ansicht → Navigationsbereich): Überschriften, Klick springt hin */
  toggleNav() { Store.ui.wordNav = !this.navOn(); UiState.saveSoon(); OfficeView.sync(true); if (!OfficeView.narrow()) this.refit(true); Ribbon.refresh(); },
  toggleRuler() { Store.ui.wordRuler = !this.rulerOn(); UiState.saveSoon(); OfficeView.sync(true); this.refit(true); Ribbon.refresh(); },
  /* Seitenbreite einpassen (höchstens 125 %); soft = nach Grössenänderung: Zoom behalten, solange das Blatt passt,
     nur waagrecht zentrieren – die Stelle oben im Fenster bleibt */
  refit(soft) {
    const p = this.on();
    if (!p || !Canvas.vp) return;
    const P = OfficeView.paper(p), vp = Canvas.vp, L = this.leftW(), narrow = OfficeView.narrow(), m = narrow ? 12 : 48;
    const avail = vp.clientWidth - L - m;
    if (!soft) { OfficeDoc.zoom('width'); if (Canvas.view.z > 1.25) { Canvas.view.z = 1.25; OfficeDoc.zoom('width-keep'); } return; }
    const v = Canvas.view, wy = -v.y / v.z;
    if (P.W * v.z > avail || narrow || this._fitW) { v.z = Math.max(0.1, Math.min(1.25, avail / P.W)); this._fitW = true; }
    v.x = L + (vp.clientWidth - L - P.W * v.z) / 2 - (OfficeView.PX + 11) * v.z;
    v.y = -wy * v.z;
    Canvas.applyView();
  },
  headings() {
    const out = [];
    const p = this.on();
    if (!p) return out;
    for (const m of p.office.map || []) {
      const t = m.box && Canvas.textEl(m.box);
      if (!t) continue;
      for (const h of t.querySelectorAll('h1, h2, h3')) { const s = h.textContent.trim(); if (s) out.push({ h, lvl: +h.tagName[1], s, box: m.box }); }
    }
    return out;
  },
  nav(p, host) {
    if (!host) return;
    let pane = host.querySelector('.ofv-nav');
    if (!this.navOn()) { if (pane) pane.remove(); return; }
    if (!pane) {
      pane = el('div', { class: 'ofv-nav' }, el('div', { class: 'on-head' }, el('b', { text: 'Navigation' }), el('button', { class: 'on-x', type: 'button', html: icon('x', 14), title: 'Schliessen', onclick: () => this.toggleNav() })), el('div', { class: 'on-list' }));
      host.append(pane);
    }
    if (!OfficeView.narrow()) OfficeView.grip(pane, 'nav', 'r');
    const hs = this.headings();
    const sig = hs.map(x => x.lvl + x.s).join('|');
    const list = pane.querySelector('.on-list');
    if (list._sig === sig) return;
    list._sig = sig;
    list.innerHTML = '';
    if (!hs.length) list.append(el('p', { class: 'on-empty', text: 'Keine Überschriften. Text als „Überschrift 1–3“ formatieren (Start → Formatvorlagen), dann erscheint er hier.' }));
    hs.forEach((x, i) => {
      const it = el('button', { class: 'on-it l' + x.lvl, type: 'button', text: x.s, dataset: { i } });
      it.addEventListener('click', () => this.jump(i));
      list.append(it);
    });
    this.navMark();
  },
  jump(i) {
    const x = this.headings()[i];
    if (!x) return;
    const vr = Canvas.vp.getBoundingClientRect(), r = x.h.getBoundingClientRect();
    Canvas.view.y += vr.top + 90 - r.top;
    Canvas.applyView();
    const t = Canvas.textEl(x.box);
    if (t) { t.focus({ preventScroll: true }); const s = getSelection(); const rg = document.createRange(); rg.selectNodeContents(x.h); rg.collapse(true); s.removeAllRanges(); s.addRange(rg); }
    if (OfficeView.narrow()) this.toggleNav();   // Handy: Navigation schliesst nach dem Sprung (1.68)
  },
  navMark() {
    const host = OfficeView.el, list = host && host.querySelector('.ofv-nav .on-list');
    if (!list) return;
    const hs = this.headings(), vr = Canvas.vp.getBoundingClientRect();
    let cur = -1;
    hs.forEach((x, i) => { if (x.h.getBoundingClientRect().top < vr.top + vr.height * 0.4) cur = i; });
    for (const b of list.querySelectorAll('.on-it')) b.classList.toggle('on', +b.dataset.i === cur);
  },

  /* ---------------------------------------------------------------- Entwurf */
  SPACING: [['', 'Wie im Dokument', null], ['kein', 'Kein Absatzabstand', [0, 1.0]], ['kompakt', 'Kompakt', [4, 1.0]], ['eng', 'Eng', [6, 1.0]], ['offen', 'Offen', [10, 1.15]], ['entspannt', 'Entspannt', [6, 1.5]], ['doppelt', 'Doppelt', [8, 2.0]]],
  BORDERS: [['', 'Kein Seitenrand', null], ['linie', 'Linie', { val: 'single', sz: 8 }], ['dick', 'Dicke Linie', { val: 'single', sz: 24 }], ['doppelt', 'Doppelte Linie', { val: 'double', sz: 6 }], ['punkte', 'Punktiert', { val: 'dotted', sz: 8 }], ['schatten', 'Schatten', { val: 'single', sz: 12, shadow: true }]],
  async setDesign(k, v) {
    const p = this.on();
    if (!p || Store.readOnly) return;
    const o = p.office;
    if (k === 'spacing') o.spacing = v || null;
    else if (k === 'font') o.font = v || null;
    else if (k === 'border') { const d = this.BORDERS.find(x => x[0] === (v || '')); o.pgBorder = d && d[2] ? { ...d[2], color: o.pgBorder && o.pgBorder.color || 'auto', key: d[0] } : null; }
    else if (k === 'borderColor') { if (!o.pgBorder) o.pgBorder = { ...this.BORDERS[1][2], key: 'linie' }; o.pgBorder = { ...o.pgBorder, color: v ? v.replace('#', '').toUpperCase() : 'auto' }; }
    this.applyDesign(p);
    Canvas.render(true);
    Hist.touchPage(p.id); Hist.commit({ spacing: 'Absatzabstand', font: 'Schriftart des Dokuments', border: 'Seitenrand', borderColor: 'Seitenrand' }[k]);
    Ribbon.refresh();
  },
  applyDesign(p) {
    const vp = Canvas.vp;
    if (!vp) return;
    const o = p && p.type === 'dok' && p.office ? p.office : null;
    const sp = o && o.spacing && this.SPACING.find(x => x[0] === o.spacing);
    if (sp && sp[2]) { vp.dataset.wsp = sp[0]; vp.style.setProperty('--kt-pa', sp[2][0] + 'pt'); vp.style.setProperty('--kt-lh', String(sp[2][1] * 1.2)); }
    else { delete vp.dataset.wsp; vp.style.removeProperty('--kt-pa'); vp.style.removeProperty('--kt-lh'); }
    // Grundschrift aus der Formatvorlage „Standard“ (1.74)
    if (o && o.wbase && o.wbase.font && typeof OfficeWI !== 'undefined') vp.style.setProperty('--kt-wbase', OfficeWI.fontCss(o.wbase.font)); else vp.style.removeProperty('--kt-wbase');
    if (o && o.font) { vp.dataset.wfont = '1'; vp.style.setProperty('--kt-wfont', `"${o.font.replace(/"/g, '')}"`); }
    else { delete vp.dataset.wfont; vp.style.removeProperty('--kt-wfont'); }
    const bd = o && o.pgBorder;
    if (bd) {
      const w = Math.max(1, Math.round(bd.sz / 8 * 1.33)), col = !bd.color || bd.color === 'auto' ? '#000' : '#' + bd.color;
      const style = bd.val === 'double' ? 'double' : bd.val === 'dotted' ? 'dotted' : 'solid';
      vp.dataset.pgb = bd.key || 'linie';
      vp.style.setProperty('--kt-pgb', `${bd.val === 'double' ? Math.max(3, w * 3) : w}px ${style} ${col}`);
      vp.style.setProperty('--kt-pgb-sh', bd.shadow ? `${3 * w}px ${3 * w}px 0 -${w}px ${col}` : 'none');
    } else { delete vp.dataset.pgb; vp.style.removeProperty('--kt-pgb'); vp.style.removeProperty('--kt-pgb-sh'); }
  },
  /* ---------------------------------------------------------------- Export (aus OfficeDoc.write) */
  W: 'http://schemas.openxmlformats.org/wordprocessingml/2006/main',
  /* Absatzabstand und Schriftart: Standardwerte (docDefaults) und Formatvorlage „Standard“ in styles.xml */
  async writeDefaults(pkg, o) {
    const X = OfficePages, W = this.W;
    const sr = (await pkg.rels(pkg.main)).find(r => /\/styles$/.test(r.type) && pkg.has(r.path));
    if (!sr) return false;
    const sd = await pkg.xml(sr.path), root = sd.documentElement, pre = root.lookupPrefix(W) || 'w';
    const att = (e, k, v) => e.setAttributeNS(W, pre + ':' + k, String(v));
    const kid = (parent, name, first) => { let e = X.kid(parent, W, name); if (!e) { e = X.mk(sd, W, name); if (first) parent.prepend(e); else parent.append(e); } return e; };
    let dd = X.kid(root, W, 'docDefaults');
    if (!dd) { dd = X.mk(sd, W, 'docDefaults'); const lat = X.kid(root, W, 'latentStyles'); if (lat) lat.before(dd); else root.prepend(dd); }
    const normal = X.kids(root, W, 'style').find(s => X.at(s, W, 'type') === 'paragraph' && (X.at(s, W, 'default') === '1' || X.at(s, W, 'default') === 'true')) || null;
    const sp = o.spacing && this.SPACING.find(x => x[0] === o.spacing);
    if (sp && sp[2]) {
      const after = Math.round(sp[2][0] * 20), line = Math.round(sp[2][1] * 240);
      const set = (pPr) => { const s = kid(pPr, 'spacing'); att(s, 'before', 0); att(s, 'after', after); att(s, 'line', line); att(s, 'lineRule', 'auto'); };
      const pd = kid(dd, 'pPrDefault'); set(kid(pd, 'pPr'));
      if (normal) { const pPr = X.kid(normal, W, 'pPr'); if (pPr && X.kid(pPr, W, 'spacing')) set(pPr); }
      // rPrDefault muss vor pPrDefault stehen
      const rd = X.kid(dd, W, 'rPrDefault'); if (rd && rd.previousElementSibling === pd) pd.before(rd);
    }
    if (o.font) {
      const setF = (rPr) => { const f = kid(rPr, 'rFonts', true); for (const a of ['asciiTheme', 'hAnsiTheme', 'cstheme', 'eastAsiaTheme']) f.removeAttributeNS(W, a); att(f, 'ascii', o.font); att(f, 'hAnsi', o.font); att(f, 'cs', o.font); };
      const rd = kid(dd, 'rPrDefault', true); setF(kid(rd, 'rPr'));
      if (normal) { const rPr = X.kid(normal, W, 'rPr'); if (rPr && X.kid(rPr, W, 'rFonts')) setF(rPr); }
    }
    pkg.setXml(sr.path, sd);
    return true;
  },
  /* Seitenränder → w:pgBorders im letzten Abschnitt (Abstand vom Seitenrand 24 pt) */
  writeBorders(doc, body, bd) {
    const X = OfficePages, W = this.W;
    let sect = X.kid(body, W, 'sectPr');
    if (!sect) { sect = X.mk(doc, W, 'sectPr'); body.append(sect); }
    const old = X.kid(sect, W, 'pgBorders'); if (old) old.remove();
    if (!bd) return;
    const pre = doc.documentElement.lookupPrefix(W) || 'w';
    const e = X.mk(doc, W, 'pgBorders');
    e.setAttributeNS(W, pre + ':offsetFrom', 'page');
    for (const side of ['top', 'left', 'bottom', 'right']) {
      const s = X.mk(doc, W, side);
      s.setAttributeNS(W, pre + ':val', bd.val); s.setAttributeNS(W, pre + ':sz', String(bd.sz)); s.setAttributeNS(W, pre + ':space', '24'); s.setAttributeNS(W, pre + ':color', bd.color || 'auto');
      if (bd.shadow) s.setAttributeNS(W, pre + ':shadow', '1');
      e.append(s);
    }
    const before = ['lnNumType', 'pgNumType', 'cols', 'formProt', 'vAlign', 'noEndnote', 'titlePg', 'textDirection', 'bidi', 'rtlGutter', 'docGrid', 'printerSettings', 'sectPrChange'].map(n => X.kid(sect, W, n)).find(Boolean);
    if (before) before.before(e); else sect.append(e);
  },
  /* Import: vorhandene Seitenränder (nur Darstellung, Wert bleibt erhalten, solange man nichts ändert) */
  readBorders(sect) {
    const X = OfficePages, W = this.W;
    const pb = sect && X.kid(sect, W, 'pgBorders'), top = pb && (X.kid(pb, W, 'top') || X.kid(pb, W, 'left'));
    if (!top) return null;
    const val = X.at(top, W, 'val') || 'single';
    if (val === 'none' || val === 'nil') return null;
    const sz = +X.at(top, W, 'sz') || 4, shadow = /^(1|true|on)$/.test(X.at(top, W, 'shadow') || '');
    const key = val === 'double' ? 'doppelt' : val === 'dotted' ? 'punkte' : shadow ? 'schatten' : sz >= 18 ? 'dick' : 'linie';
    return { val: /^(single|double|dotted)$/.test(val) ? val : 'single', sz, color: X.at(top, W, 'color') || 'auto', shadow, key, orig: true };
  },
};
if (typeof module !== 'undefined') module.exports = { OfficeWord };
