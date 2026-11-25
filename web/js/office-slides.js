'use strict';
/* PowerPoint-Seiten: zwei Ansichten und Folien gestalten (1.67) – ergänzt office-ppt.js / office-view.js / office-anim.js.
 *
 *  Lernansicht (Standard): alle Folien untereinander mit viel Platz; links neben jeder Folie ihre Notizen (Notiz-Feld
 *    der Folie, zum Lernen und Mitschreiben), rechts der Animationsbereich der Folie (Reihenfolge, Auslöser „Beim
 *    Klicken / Mit Vorherigem / Nach Vorherigem“, Effekt, Früher/Später, Entfernen, Wiedergeben); Nummern an den Feldern.
 *  Normal (wie PowerPoint): nur die aktuelle Folie – alles ausserhalb ist abgedeckt, Mausrad = vorige/nächste Folie;
 *    links Folienübersicht und Notizen der aktuellen Folie; Animationen nur im Register „Animationen“.
 *  Die Ansicht gilt je Seite (Store.ui.pptView[Seiten-ID], ohne Eintrag = Lernansicht) und ändert keine Daten: beide
 *  zeigen dieselben Felder an derselben Stelle.
 *  Gestalten: neue Folie mit Layout (Platzhalter „Titel hinzufügen“ …), Textfeld aufziehen, an der Folie ausrichten,
 *  Führungslinien und Raster, Foliennummer/Datum. */
const OfficeSlides = {
  FX: 400,         // Folien beginnen hier (links davon die Notizen)
  NOTEW: 300,      // Breite der Notizen links der Folie (Lernansicht)
  page() { const p = Canvas.page; return p && p.type === 'folie' && p.office && p.office.asset ? p : null; },
  view(p = this.page()) { return p && Store.ui.pptView && Store.ui.pptView[p.id] === 'normal' ? 'normal' : 'lern'; },
  setView(v) {
    const p = this.page();
    if (!p) return;
    const map = Store.ui.pptView || (Store.ui.pptView = {});
    if (v === 'normal') map[p.id] = 'normal'; else delete map[p.id];
    UiState.saveSoon();
    const f = OfficePpt.currentFrame();
    OfficeView.sync(true);
    Canvas.render(true);
    if (f) OfficePpt.focusSlide(f.id);
    Ribbon.refresh();
  },

  /* ---------------------------------------------------------------- Anordnung (einmalig für Seiten vor 1.67) */
  shiftXY(it, dx, dy) {
    for (const b of it.boxes) { b.x += dx; b.y += dy; if (b.ox && b.ox.x0 != null) b.ox.x0 += dx; if (b.ox && b.ox.y0 != null) b.ox.y0 += dy; }
    for (const d of it.draws) { d.x1 += dx; d.x2 += dx; d.y1 += dy; d.y2 += dy; if (d.pts) for (let i = 0; i < d.pts.length; i += 3) { d.pts[i] += dx; d.pts[i + 1] += dy; } }
  },
  relayout(p) {
    const fr = OfficePpt.frames(p);
    if (!fr.length) { p.office.lay = 2; return false; }
    const step = OfficePpt.step(p), y0 = fr[0].y;
    const items = fr.map(f => ({ f, it: OfficePpt.itemsOf(f, p) }));
    items.forEach(({ f, it }, i) => this.shiftXY(it, this.FX - f.x, y0 + i * step - f.y));
    for (const nb of p.boxes.filter(b => b.ox && b.ox.k === 'notiz')) {
      const f = p.boxes.find(b => b.id === nb.ox.f);
      if (f) { nb.x = f.x - this.NOTEW - 60; nb.y = f.y + 13; nb.w = this.NOTEW; }
    }
    p.office.lay = 2;
    return true;
  },
  notesBox(f, p) { return p.boxes.find(b => b.ox && b.ox.k === 'notiz' && b.ox.f === f.id) || null; },
  addNotes(f, p, focus = true) {
    let nb = this.notesBox(f, p);
    if (!nb) nb = OfficePages.addBox(f.x - this.NOTEW - 60, f.y + 13, this.NOTEW, '<div><br></div>', { locked: false, office: 'notiz', style: { bg: '#fffbe6', border: '#e8dca0' }, ox: { k: 'notiz', part: null, f: f.id, h: '' } });
    Canvas.render();
    if (focus) { Canvas.select([nb.id]); Canvas.focusText(nb.id, true); }
    return nb;
  },

  /* ---------------------------------------------------------------- Leisten */
  sync(p, host, force) {
    const v = this.view(p);
    document.body.classList.toggle('ppt-lern', v === 'lern');
    document.body.classList.toggle('ppt-normal', v === 'normal');
    document.body.classList.toggle('ppt-guides', !!Store.ui.pptGuides);
    document.body.classList.toggle('ppt-grid', !!Store.ui.pptGrid);
    if (p.office.lay !== 2 && !Store.readOnly) { if (this.relayout(p)) { Canvas.render(true); Hist.touchPage(p.id); Hist.commit('Folien angeordnet (Lernansicht)'); } }
    if (force) { this._apOpen = null; if (this._lastP !== p.id) { this._ncolOpen = false; this._ncolF = null; } this._lastP = p.id; }
    for (const old of host.querySelectorAll(v === 'lern' ? '.ofv-mask, .ofv-ntog' : '.ofv-ap, .ofv-nadd, .ofv-chips')) old.remove();
    if (OfficeView.narrow() || v === 'normal') this.notesCol(p, host, force); else { const c = host.querySelector('.ofv-ncol'); if (c) c.remove(); }
    if (!OfficeView.compact()) { this._apOpen = null; for (const c of host.querySelectorAll('.ofv-chips, .ofv-ap.pop')) c.remove(); }
    this.place(p, host, force);
    this.viewButtons(p);
  },
  onView(p, host) { this.place(p, host); if (OfficeView.narrow() || this.view(p) === 'normal') this.notesCol(p, host); },
  clearBody() { for (const c of ['ppt-lern', 'ppt-normal', 'ppt-guides', 'ppt-grid']) document.body.classList.remove(c); this.viewButtons(null); },
  /* Statusleiste rechts: Ansicht umschalten (wie die Knöpfe unten rechts in PowerPoint) */
  viewButtons(p) {
    if (typeof OfficeUI !== 'undefined') return OfficeUI.views(p);   // 1.73: für alle drei Programme in office-ui.js
    const host = document.getElementById('sb-views');
    if (!host) return;
    if (!p) { host.innerHTML = ''; host._v = null; return; }
    const v = this.view(p);
    if (host._v === v && host.children.length) return;
    host._v = v; host.innerHTML = '';
    for (const [k, ic, t] of [['lern', 'notes', 'Lernansicht: alle Folien mit Notizen links und Animationen rechts'], ['normal', 'slides', 'Normal: nur die aktuelle Folie']]) {
      const b = el('button', { class: 'sb-btn sb-view' + (v === k ? ' on' : ''), type: 'button', html: icon(ic, 14), title: t });
      b.addEventListener('click', () => this.setView(k));
      host.append(b);
    }
  },
  scr(p) { const z = Canvas.view.z, off = OfficeWord.offset(OfficeView.el); return { z, sx: (x) => Canvas.view.x + x * z + off.x, sy: (y) => Canvas.view.y + y * z + off.y }; },
  animCount(f, p) { return OfficeAnim.slideBoxes(f, p).length; },
  /* Lage der Leisten auf dem Bildschirm: Abdeckung (Normal) bzw. Animationsbereiche und „Notizen hinzufügen“ (Lernansicht);
     schmal (Handy, geteilter Bereich): Knöpfe „Notizen“/„Animationen“ über der Folie, Leisten als Einblendung */
  place(p, host) {
    if (!host) return;
    const s = this.scr(p), sz = OfficePpt.size(p), vw = host.clientWidth, vh = host.clientHeight - OfficeView.stripH(), narrow = OfficeView.narrow(), cmp = OfficeView.compact();
    this.guides(p, host, s, sz, vh);
    if (this.view(p) === 'normal') {
      const f = OfficePpt.currentFrame();
      let m = host.querySelector('.ofv-mask');
      if (!m) {
        m = el('div', { class: 'ofv-mask' }, el('i'), el('i'), el('i'), el('i'));
        m.addEventListener('wheel', (e) => { e.preventDefault(); if (!OfficeView.wheel(e)) Canvas.onWheel(e); }, { passive: false });   // Rad auch neben der Folie: Folie wechseln / zoomen
        this.swipeOn(m);
        host.prepend(m);
      }
      let tg = host.querySelector('.ofv-ntog');
      if (cmp) {
        if (!tg) { tg = el('button', { class: 'ofv-ntog', type: 'button', html: icon('notes', 15) + '<span>Notizen</span>', title: 'Notizen zur Folie' }); tg.addEventListener('click', () => this.openNotes(null)); host.append(tg); }
        const nb = f && this.notesBox(f, p);
        tg.classList.toggle('has', !!(nb && !isEmptyHtml(nb.html)));
      } else if (tg) tg.remove();
      if (!f) return;
      const L = s.sx(f.x + 11), T = s.sy(f.y + 13), R = L + sz.w * s.z, B = T + sz.h * s.z, H = host.clientHeight;
      const [a, b, c, d] = m.children;
      Object.assign(a.style, { left: '0px', top: '0px', width: vw + 'px', height: Math.max(0, T) + 'px' });
      Object.assign(b.style, { left: '0px', top: Math.max(0, B) + 'px', width: vw + 'px', height: Math.max(0, H - B) + 'px' });
      Object.assign(c.style, { left: '0px', top: T + 'px', width: Math.max(0, L) + 'px', height: Math.max(0, B - T) + 'px' });
      Object.assign(d.style, { left: R + 'px', top: T + 'px', width: Math.max(0, vw - R) + 'px', height: Math.max(0, B - T) + 'px' });
      return;
    }
    // Lernansicht: für sichtbare Folien Animationsbereich rechts, „Notizen hinzufügen“ links (wenn noch keine Notizen)
    const seen = new Set(), apw = OfficeView.w('ap'), left = OfficeView.w('strip');
    for (const f of OfficePpt.frames(p)) {
      const T = s.sy(f.y + 13), B = T + sz.h * s.z;
      if (B < -40 || T > vh + 40) continue;
      seen.add(f.id);
      let ap = host.querySelector(`.ofv-ap[data-f="${f.id}"]`);
      let na = host.querySelector(`.ofv-nadd[data-f="${f.id}"]`);
      if (cmp) {
        if (narrow && na) na.remove();
        let ch = host.querySelector(`.ofv-chips[data-f="${f.id}"]`);
        if (!ch) {
          ch = el('div', { class: 'ofv-chips', dataset: { f: f.id } });
          const nt = el('button', { class: 'ofv-chip n', type: 'button', html: icon('notes', 13) + '<span>Notizen</span>' });
          nt.addEventListener('click', () => this.openNotes(f.id));
          const an = el('button', { class: 'ofv-chip a', type: 'button', html: icon('animPane', 13) + '<span>Animationen</span><b></b>' });
          an.addEventListener('click', () => { this._apOpen = this._apOpen === f.id ? null : f.id; this.place(p, host); });
          ch.append(nt, an); host.append(ch);
        }
        const nb = this.notesBox(f, p);
        ch.querySelector('.n').classList.toggle('has', !!(nb && !isEmptyHtml(nb.html)));
        ch.querySelector('.a b').textContent = String(this.animCount(f, p) || '');
        ch.querySelector('.n').hidden = !narrow;   // kompakt, nicht schmal: Notizen stehen links der Folie
        Object.assign(ch.style, { left: Math.max(left + 6, s.sx(f.x + 11)) + 'px', top: Math.max(4, T - 30) + 'px' });
        if (this._apOpen === f.id && Store.ui.pptAnimPane !== false) {
          if (!ap) { ap = el('div', { class: 'ofv-ap pop', dataset: { f: f.id } }); host.append(ap); }
          this.fillPane(ap, f, p);
          Object.assign(ap.style, { left: '', right: '8px', top: Math.max(8, T) + 'px', maxHeight: Math.max(160, vh - Math.max(8, T) - 8) + 'px', display: '' });
        } else if (ap) ap.remove();
        if (!narrow && !this.notesBox(f, p) && !Store.readOnly) {
          if (!na) { na = el('button', { class: 'ofv-nadd', type: 'button', dataset: { f: f.id }, html: icon('notes', 16) + '<span>Notizen zur Folie hinzufügen</span>' }); na.addEventListener('click', () => { const ff = Canvas.box(na.dataset.f); if (ff) { this.addNotes(ff, p); Hist.touchPage(p.id); Hist.commit('Notizen'); } }); host.append(na); }
          const nx = s.sx(f.x - this.NOTEW - 60), nw = (this.NOTEW + 22) * s.z;
          Object.assign(na.style, { left: nx + 'px', top: T + 'px', width: nw + 'px', display: nx + nw < left + 10 ? 'none' : '' });
        } else if (na) na.remove();
        continue;
      }
      for (const c of host.querySelectorAll(`.ofv-chips[data-f="${f.id}"]`)) c.remove();
      const ax = s.sx(f.x + 22 + sz.w) + 16;
      if (Store.ui.pptAnimPane !== false) {
        if (!ap) { ap = el('div', { class: 'ofv-ap', dataset: { f: f.id } }); host.append(ap); }
        ap.classList.remove('pop');
        this.fillPane(ap, f, p);
        OfficeView.grip(ap, 'ap', 'r');
        const at = Math.min(Math.max(T, 8), B - 120);   // bleibt oben sichtbar, solange die Folie zu sehen ist
        Object.assign(ap.style, { left: ax + 'px', right: '', top: at + 'px', maxHeight: Math.max(120, B - at) + 'px', display: ax > vw - 40 ? 'none' : '' });
      } else if (ap) ap.remove();
      if (!this.notesBox(f, p) && !Store.readOnly) {
        if (!na) { na = el('button', { class: 'ofv-nadd', type: 'button', dataset: { f: f.id }, html: icon('notes', 16) + '<span>Notizen zur Folie hinzufügen</span>' }); na.addEventListener('click', () => { const ff = Canvas.box(na.dataset.f); if (ff) { this.addNotes(ff, p); Hist.touchPage(p.id); Hist.commit('Notizen'); } }); host.append(na); }
        const nx = s.sx(f.x - this.NOTEW - 60), nw = (this.NOTEW + 22) * s.z;
        Object.assign(na.style, { left: nx + 'px', top: T + 'px', width: nw + 'px', display: nx + nw < left + 10 ? 'none' : '' });
      } else if (na) na.remove();
    }
    for (const e of host.querySelectorAll('.ofv-ap, .ofv-nadd, .ofv-chips')) if (!seen.has(e.dataset.f)) e.remove();
    void apw;
  },
  /* Wischen (Finger) über der Abdeckung bzw. nach dem Verschieben der Folie: Normalansicht = vorige/nächste Folie */
  swipeOn(m) {
    let st = null;
    m.addEventListener('pointerdown', (e) => { if (e.pointerType === 'touch') st = { x: e.clientX, y: e.clientY }; });
    m.addEventListener('pointerup', (e) => { if (st) { this.swipe(e.clientX - st.x, e.clientY - st.y, true); st = null; } });
    m.addEventListener('pointercancel', () => { st = null; });
  },
  swipe(dx, dy, onMask) {
    const p = this.page();
    if (!p || this.view(p) !== 'normal') return false;
    const fr = OfficePpt.frames(p), f = OfficePpt.currentFrame();
    let i = fr.indexOf(f);
    const big = Math.max(Math.abs(dx), Math.abs(dy)) > 60;
    if (big) i += (Math.abs(dx) > Math.abs(dy) ? dx : dy) < 0 ? 1 : -1;
    i = Math.max(0, Math.min(fr.length - 1, i));
    if (fr[i] && (big || !onMask)) OfficePpt.focusSlide(fr[i].id);
    return true;
  },
  /* Notizen als Einblendung öffnen (schmal) – fid = Folie (Lernansicht) oder null = aktuelle Folie */
  openNotes(fid) {
    const p = this.page(), host = OfficeView.el;
    if (!p || !host) return;
    this._ncolF = fid; this._ncolOpen = true;
    this.notesCol(p, host, true);
    const ed = host.querySelector('.ofv-ncol .ofv-ned');
    if (ed && !Store.readOnly) setTimeout(() => ed.focus(), 30);
  },
  closeNotes() { this._ncolOpen = false; this._ncolF = null; const c = OfficeView.el && OfficeView.el.querySelector('.ofv-ncol'); if (c) c.classList.remove('open'); },
  /* Führungslinien (Mitte) und Gitternetz über den sichtbaren Folien (Ansicht → Anzeigen) */
  guides(p, host, s, sz, vh) {
    const on = Store.ui.pptGuides || Store.ui.pptGrid;
    const keep = new Set();
    if (on) {
      const frs = this.view(p) === 'normal' ? [OfficePpt.currentFrame()].filter(Boolean) : OfficePpt.frames(p);
      for (const f of frs) {
        const T = s.sy(f.y + 13), L = s.sx(f.x + 11), W = sz.w * s.z, H = sz.h * s.z;
        if (T + H < 0 || T > vh) continue;
        keep.add(f.id);
        let g = host.querySelector(`.ofv-guide[data-f="${f.id}"]`);
        if (!g) { g = el('div', { class: 'ofv-guide', dataset: { f: f.id } }); host.append(g); }
        g.classList.toggle('c', !!Store.ui.pptGuides); g.classList.toggle('g', !!Store.ui.pptGrid);
        Object.assign(g.style, { left: L + 'px', top: T + 'px', width: W + 'px', height: H + 'px' });
        g.style.setProperty('--gs', (W / 24).toFixed(2) + 'px');
      }
    }
    for (const g of host.querySelectorAll('.ofv-guide')) if (!keep.has(g.dataset.f)) g.remove();
  },
  /* Animationsbereich einer Folie (wie „Animationsbereich“ in PowerPoint) */
  fillPane(ap, f, p) {
    const list = OfficeAnim.slideBoxes(f, p).sort((a, b) => a.anim.n - b.anim.n);
    const sig = list.map(b => b.id + b.anim.fx + b.anim.start + b.anim.dur + b.anim.n + (b.html || '').length + (Canvas.sel.has(b.id) ? '*' : '')).join('|') + '#' + ((f.ox.tr && f.ox.tr.type) || '');
    if (ap._sig === sig) return;
    ap._sig = sig;
    const grip = ap.querySelector(':scope > .ofv-rs');   // Ziehgriff behalten (sonst bricht ein laufendes Ziehen ab)
    ap.innerHTML = '';
    const fxName = (k) => (OfficeAnim.FX.find(x => x[0] === k) || [0, k])[1];
    const trName = (OfficeAnim.TRANS.find(x => x[0] === ((f.ox.tr && f.ox.tr.type) || 'none')) || [0, 'Ohne'])[1];
    const play = el('button', { class: 'ap-play', type: 'button', html: icon('play', 12) + '<span>Wiedergeben</span>', title: 'Animationen dieser Folie ansehen' });
    play.addEventListener('click', () => OfficeAnim.preview(f, 'anim'));
    ap.append(el('div', { class: 'ap-head' }, el('b', { text: 'Animationen' }), play));
    if (!list.length) ap.append(el('p', { class: 'ap-empty', text: 'Keine Animationen. Feld auf der Folie wählen, dann im Register „Animationen“ einen Effekt.' }));
    const ol = el('div', { class: 'ap-list' });
    let step = 0;
    list.forEach((b, i) => {
      if (b.anim.start === 'click' || i === 0) step++;
      const label = isEmptyHtml(b.html) ? (b.images.length ? 'Bild' : 'Feld') : OfficeWord.textOf(b.html).replace(/\s+/g, ' ').trim().slice(0, 28);
      const trg = { click: ['cursorClick', 'Beim Klicken'], with: ['play', 'Mit Vorherigem'], after: ['clock', 'Nach Vorherigem'] }[b.anim.start] || ['cursorClick', 'Beim Klicken'];
      const row = el('div', { class: 'ap-it' + (Canvas.sel.has(b.id) ? ' on' : ''), title: `${b.anim.n}. ${fxName(b.anim.fx)} – ${trg[1]} – ${(b.anim.dur / 1000).toFixed(2).replace('.', ',')} s` });
      const tb = el('button', { class: 'ap-trg', type: 'button', html: icon(trg[0], 14), title: 'Auslöser: ' + trg[1] + ' (Klick = ändern)' });
      tb.addEventListener('click', (e) => { e.stopPropagation(); Canvas.select([b.id]); UI.menu([{ head: 'Start' }, ...OfficeAnim.START.map(([k, l]) => ({ label: l, checked: b.anim.start === k, action: () => { Canvas.select([b.id]); OfficeAnim.setAnimOpt('start', k); this.refresh(); } }))], 0, 0, { anchor: tb }); });
      const up = el('button', { class: 'ap-mv', type: 'button', html: icon('arrowUp', 12), title: 'Früher' });
      up.addEventListener('click', (e) => { e.stopPropagation(); Canvas.select([b.id]); OfficeAnim.move(-1); this.refresh(); });
      const dn = el('button', { class: 'ap-mv', type: 'button', html: icon('arrowDown', 12), title: 'Später' });
      dn.addEventListener('click', (e) => { e.stopPropagation(); Canvas.select([b.id]); OfficeAnim.move(1); this.refresh(); });
      const x = el('button', { class: 'ap-mv', type: 'button', html: icon('x', 12), title: 'Animation entfernen' });
      x.addEventListener('click', (e) => { e.stopPropagation(); Canvas.select([b.id]); OfficeAnim.setAnim('none'); this.refresh(); });
      row.append(el('span', { class: 'ap-n', text: b.anim.start === 'click' || i === 0 ? String(step) : '' }), tb, el('span', { class: 'ap-fx fx-' + b.anim.fx, text: fxName(b.anim.fx) }), el('span', { class: 'ap-lbl', text: label }), up, dn, x);
      row.addEventListener('click', () => { Canvas.select([b.id]); Ribbon.show('p-anim'); this.refresh(); });
      ol.append(row);
    });
    ap.append(ol);
    ap.append(el('div', { class: 'ap-foot', text: 'Übergang: ' + trName }));
    if (grip) ap.append(grip);
  },
  refresh() { const p = this.page(); if (p && OfficeView.el) { for (const ap of OfficeView.el.querySelectorAll('.ofv-ap')) ap._sig = null; this.place(p, OfficeView.el); } },

  /* Normal: Notizen der aktuellen Folie links neben der Folie (breit verstellbar); schmal: Einblendung von links */
  notesCol(p, host, force) {
    const narrow = OfficeView.compact();
    const f = (this._ncolF && Canvas.box(this._ncolF)) || OfficePpt.currentFrame();
    let col = host.querySelector('.ofv-ncol');
    if (!col) {
      const x = el('button', { class: 'nc-x', type: 'button', html: icon('x', 14), title: 'Schliessen' });
      x.addEventListener('click', () => this.closeNotes());
      col = el('div', { class: 'ofv-ncol' }, el('div', { class: 'nc-head' }, el('b', { text: 'Notizen' }), el('span', { class: 'nc-n' }), x));
      const ed = el('div', { class: 'ofv-ned', contenteditable: Store.readOnly ? 'false' : 'true', spellcheck: 'true', 'data-ph': 'Klicken Sie, um Notizen hinzuzufügen' });
      ed.addEventListener('input', () => { OfficeView.notesInput(ed); this.place(p, host); });
      ed.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Escape' && OfficeView.narrow()) { ed.blur(); this.closeNotes(); } });
      ed.addEventListener('blur', () => { if (OfficeView._nT) { clearTimeout(OfficeView._nT); OfficeView._nT = null; Hist.commit('Notizen'); } });
      col.append(ed);
      host.append(col);
    }
    col.classList.toggle('open', !narrow || !!this._ncolOpen);
    if (!narrow) OfficeView.grip(col, 'ncol', 'r'); else { const g = col.querySelector(':scope > .ofv-rs'); if (g) g.remove(); }
    const ed = col.querySelector('.ofv-ned');
    if (!f) { ed.innerHTML = ''; return; }
    col.querySelector('.nc-n').textContent = 'Folie ' + (OfficePpt.frames(p).indexOf(f) + 1);
    if (ed._f === f.id && !force) return;
    if (document.activeElement === ed && ed._f === f.id) return;
    ed._f = f.id;
    const nb = this.notesBox(f, p);
    ed.innerHTML = nb && !isEmptyHtml(nb.html) ? nb.html : '';
  },
  /* Folie zeigen: Normal = nur die Folie neben Übersicht und Notizspalte; Lernansicht = Notizen + Folie + Animationen;
     schmal: nur die Folie (Übersicht unten) */
  fit(p, f) {
    const sz = OfficePpt.size(p), vp = Canvas.vp, narrow = OfficeView.narrow(), cmp = OfficeView.compact();
    const Hv = vp.clientHeight - (narrow ? 24 + OfficeView.stripH() : 48), top = narrow ? 12 : 24;
    if (narrow) {
      const pad = this.view(p) === 'normal' ? 10 : 14, top2 = top + 30, Wv = vp.clientWidth - 2 * pad, H2 = Hv - 30;
      const z = Math.max(0.1, Math.min(3, Math.min(Wv / sz.w, H2 / sz.h)));
      return { z, x: pad + (Wv - sz.w * z) / 2 - (f.x + 11) * z, y: top2 + (H2 - sz.h * z) / 2 - (f.y + 13) * z };
    }
    if (this.view(p) === 'normal') {
      // kompakt: Notizen per Knopf eingeblendet → die Folie bekommt die ganze Breite
      const L = OfficeView.w('strip') + (cmp ? 0 : OfficeView.w('ncol')) + 24, Wv = vp.clientWidth - L - 24, T0 = cmp ? top + 30 : top, H2 = cmp ? Hv - 30 : Hv;
      const z = Math.max(0.1, Math.min(3, Math.min(Wv / sz.w, H2 / sz.h)));
      return { z, x: L + (Wv - sz.w * z) / 2 - (f.x + 11) * z, y: T0 + (H2 - sz.h * z) / 2 - (f.y + 13) * z };
    }
    // Lernansicht: Notizen + Folie (+ Animationsbereich, ausser kompakt); oben ausgerichtet, darunter die nächste Folie
    const ap = !cmp && Store.ui.pptAnimPane !== false ? OfficeView.w('ap') + 24 : 0;
    const L = OfficeView.w('strip') + 16, Wv = vp.clientWidth - L - 16 - ap;
    const W = this.NOTEW + 60 + sz.w + 22;
    const z = Math.max(0.1, Math.min(2, Math.min(Wv / W, (Hv - 40) / (sz.h + 13))));
    const yc = top + (Hv - (sz.h + 13) * z) / 2 + 20 * z, yt = top + 44;
    return { z, x: L + (Wv - W * z) / 2 - (f.x - this.NOTEW - 60) * z, y: Math.min(yc, yt) - f.y * z };
  },
  /* Mausrad: Normal = Folie wechseln, Lernansicht = frei scrollen */
  wheelSlides(p) { return this.view(p) === 'normal'; },

  /* ---------------------------------------------------------------- Gestalten */
  LAYOUTS: [['title', 'Titelfolie'], ['content', 'Titel und Inhalt'], ['section', 'Abschnittsüberschrift'], ['two', 'Zwei Inhalte'], ['titleonly', 'Nur Titel'], ['blank', 'Leer']],
  async newSlide(layout = 'content') {
    const p = this.page();
    if (!p || Store.readOnly) return;
    const before = new Set(OfficePpt.frames(p).map(f => f.id));
    await OfficePpt.cmd('new');
    const f = OfficePpt.frames(p).find(g => !before.has(g.id));
    if (!f) return;
    p.office.curSlide = f.id;
    OfficePpt.focusSlide(f.id, this.view(p) === 'normal');
    if (layout === 'blank') return;
    const sz = OfficePpt.size(p), W = sz.w, H = sz.h, k = W / 960;   // Masse wie eine 16:9-Folie mit 960 px Breite
    const ph = (x, y, w, t, fs, al, html) => {
      const b = OfficePages.addBox(f.x + x * W, f.y + y * H, w * W + 22, html || `<div style="font-size:${Math.round(fs * k)}px${al === 'c' ? ';text-align:center' : ''}"><br></div>`, { locked: false, office: null, style: { bg: 'transparent', under: f.ox.bg || '#ffffff' }, raw: true });
      b.ph = { t, fs: Math.round(fs * k), al };
      return b;
    };
    const list = (fs) => `<ul><li style="font-size:${Math.round(fs * k)}px"><br></li></ul>`;
    if (layout === 'title') { ph(0.1, 0.28, 0.8, 'Titel hinzufügen', 54, 'c'); ph(0.15, 0.58, 0.7, 'Untertitel hinzufügen', 24, 'c'); }
    else if (layout === 'content') { ph(0.06, 0.05, 0.88, 'Titel hinzufügen', 40); ph(0.06, 0.26, 0.88, 'Text hinzufügen', 24, 'l', list(24)); }
    else if (layout === 'section') { ph(0.08, 0.38, 0.84, 'Titel hinzufügen', 48); ph(0.08, 0.62, 0.84, 'Text hinzufügen', 22); }
    else if (layout === 'two') { ph(0.06, 0.05, 0.88, 'Titel hinzufügen', 40); ph(0.06, 0.26, 0.43, 'Text hinzufügen', 22, 'l', list(22)); ph(0.51, 0.26, 0.43, 'Text hinzufügen', 22, 'l', list(22)); }
    else if (layout === 'titleonly') ph(0.06, 0.05, 0.88, 'Titel hinzufügen', 40);
    Canvas.render(true);
    Hist.touchPage(p.id); Hist.commit('Folienlayout');
  },
  /* neues Textfeld auf einer Folie: wie in PowerPoint ohne Rahmen und Füllung */
  newBoxStyle(b, pt) {
    const p = this.page();
    if (!p) return;
    const f = OfficePpt.frames(p).find(g => pt.x >= g.x && pt.y >= g.y && OfficePpt.inFrame({ x: pt.x, y: pt.y }, g, p));
    if (!f) return;
    b.style = { bg: 'transparent', under: f.ox.bg || '#ffffff' };
    if (!b.html) b.html = `<div style="font-size:${Math.round(24 * OfficePpt.size(p).w / 960)}px"><br></div>`;   // 18 pt wie PowerPoint
  },
  /* Einfügen → Textfeld: auf der Folie aufziehen */
  tbTool: false,
  startTextbox() { if (!this.page()) return Cmd.run('newBox'); this.tbTool = true; document.body.classList.add('tb-draw'); UI.toast('Textfeld aufziehen: auf der Folie klicken und ziehen (Esc = abbrechen)', 3500); },
  down(ev, t) {
    if (!this.tbTool || ev.button !== 0) return false;
    const p = this.page();
    if (!p) { this.tbTool = false; document.body.classList.remove('tb-draw'); return false; }
    ev.preventDefault();
    const a = Canvas.toWorld(ev.clientX, ev.clientY);
    const host = OfficeView.el, hr = host.getBoundingClientRect();
    const box = el('div', { class: 'ofv-tbdraw' }); host.append(box);
    const draw = (e) => { const x1 = Math.min(ev.clientX, e.clientX) - hr.left, y1 = Math.min(ev.clientY, e.clientY) - hr.top; Object.assign(box.style, { left: x1 + 'px', top: y1 + 'px', width: Math.abs(e.clientX - ev.clientX) + 'px', height: Math.abs(e.clientY - ev.clientY) + 'px' }); };
    const up = (e) => {
      window.removeEventListener('pointermove', draw); window.removeEventListener('pointerup', up);
      box.remove(); this.tbTool = false; document.body.classList.remove('tb-draw');
      const b2 = Canvas.toWorld(e.clientX, e.clientY);
      const x = Math.min(a.x, b2.x), y = Math.min(a.y, b2.y), w = Math.abs(b2.x - a.x);
      const nb = Canvas.createBoxAt({ x: x + PADX + BORDER, y: y + BAR + BORDER + 11 }, { w: w > 30 ? Math.round(w) : 260, noFocus: true });
      if (nb) { Canvas.render(); Canvas.focusText(nb.id); }
    };
    window.addEventListener('pointermove', draw); window.addEventListener('pointerup', up);
    void t;
    return true;
  },
  cancelTool() { if (this.tbTool) { this.tbTool = false; document.body.classList.remove('tb-draw'); return true; } return false; },
  /* Anordnen → an der Folie ausrichten */
  align(kind) {
    const p = this.page();
    if (!p || Store.readOnly) return;
    const bs = [...Canvas.sel].map(id => Canvas.box(id)).filter(b => b && !b.bg && !b.locked && OfficePpt.frameOf(b, p));
    if (!bs.length) { UI.toast('Zuerst ein Feld auf der Folie auswählen'); return; }
    for (const b of bs) {
      const f = OfficePpt.frameOf(b, p), rf = Canvas.rects.get(f.id), rb = Canvas.rects.get(b.id);
      if (!rf || !rb) continue;
      const FW = rf.w, FH = rf.h;
      if (kind === 'l') b.x = f.x; else if (kind === 'c') b.x = Math.round(f.x + (FW - rb.w) / 2); else if (kind === 'r') b.x = Math.round(f.x + FW - rb.w);
      else if (kind === 't') b.y = f.y; else if (kind === 'm') b.y = Math.round(f.y + (FH - rb.h) / 2); else if (kind === 'b') b.y = Math.round(f.y + FH - rb.h);
    }
    Canvas.render(); Hist.touchPage(p.id); Hist.commit('An Folie ausgerichtet');
  },
  /* Einfügen → Foliennummer / Datum unten auf der Folie */
  insertField(kind) {
    const p = this.page(), f = OfficePpt.currentFrame();
    if (!p || !f || Store.readOnly) return;
    const sz = OfficePpt.size(p), k = sz.w / 960;
    const n = OfficePpt.frames(p).indexOf(f) + 1;
    const txt = kind === 'num' ? String(n) : new Date().toLocaleDateString('de-CH');
    const w = kind === 'num' ? 80 : 180;
    const x = kind === 'num' ? f.x + sz.w - w * k - 10 : f.x + 20 * k;
    const b = OfficePages.addBox(x, f.y + sz.h - 40 * k, w * k + 22, `<div style="font-size:${Math.round(14 * k)}px;color:#808080${kind === 'num' ? ';text-align:right' : ''}">${escapeHtml(txt)}</div>`, { locked: false, office: null, style: { bg: 'transparent', under: f.ox.bg || '#ffffff' }, raw: true });
    void b;
    Canvas.render(); Hist.touchPage(p.id); Hist.commit(kind === 'num' ? 'Foliennummer' : 'Datum');
  },
  toggle(k) {
    if (k === 'pptAnimPane') { if (Store.ui.pptAnimPane === false) delete Store.ui.pptAnimPane; else Store.ui.pptAnimPane = false; }
    else Store.ui[k] = !Store.ui[k];
    UiState.saveSoon(); OfficeView.sync(true); Ribbon.refresh();
  },
};
if (typeof module !== 'undefined') module.exports = { OfficeSlides };
