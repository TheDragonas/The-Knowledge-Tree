'use strict';
/* Excel-Seiten: weitere Funktionen wie in Excel (1.72) – ergänzt sheet.js, office-grid.js und office-xl.js.
 *
 *   Start:        Zellen verbinden (verbinden und zentrieren, verbinden über, aufheben), Format (Zeilenhöhe, Spaltenbreite,
 *                 automatisch, Standardbreite, aus-/einblenden, Zellen sperren), Zellenformatvorlagen (Gut, Schlecht,
 *                 Neutral, Eingabe, Ausgabe, Berechnung, Überschriften, Ergebnis, Akzente …), Als Tabelle formatieren,
 *                 Zellen formatieren (Strg+1), Suchen und Ersetzen, Gehe zu, Löschen (alles, Formate, Inhalte, Notizen)
 *   Seitenlayout: Seitenränder, Ausrichtung, Format, Druckbereich, Drucktitel, Kopf-/Fusszeile, An Seite anpassen,
 *                 Gitternetz/Überschriften drucken, Seitenumbrüche in der Ansicht
 *   Formeln:      Formeln anzeigen, Fehlerprüfung, Spur zum Vorgänger/Nachfolger (markieren)
 *   Daten:        Filtern (AutoFilter mit Werteliste und „enthält“), Benutzerdefiniertes Sortieren, Datenüberprüfung
 *                 (Liste, ganze Zahl, Dezimal, Datum, Textlänge), Zielwertsuche
 *   Überprüfen:   Notizen (neu, bearbeiten, löschen, alle anzeigen), Blatt schützen (mit Kennwort, SHA-512 wie Excel)
 *
 * Modell (je Blatt, b.sheet): merges, rowh, hideR, hideC, cols (gab es), neu: af { ref, f: { Spalte: { vals } | { has } } },
 * hideF (vom Filter ausgeblendete Zeilen), dv [{ ref, t, op, a, b, src, drop, err }], notes { A1: { t, a } },
 * ps { or, paper, m: [l, r, t, b, h, f] (Zoll), fit: { w, h }, scale, pa, pt, pg, ph, hf: { h, f } }, prot { on, pw…, raw },
 * showF (Formeln anzeigen). Beim Speichern schreibt office-xl.js nur, was sich geändert hat (layoutKeys). */
const OfficeXT = {
  S: 'http://schemas.openxmlformats.org/spreadsheetml/2006/main',
  on(id) { return typeof OfficeGrid !== 'undefined' && OfficeGrid.endless(id); },
  cur() {
    const a = Sheet.active;
    if (!a || !this.on(a.id)) return null;
    return { a, id: a.id, b: Sheet.box(a.id), d: Sheet.data(a.id), s: Sheet.sel() };
  },
  need() { const c = this.cur(); if (!c) UI.toast('Zuerst eine Zelle der Tabelle wählen'); return c; },
  ro(c) { return !c || Sheet.locked(c.id); },
  refOf(g) { return g.c1 === g.c2 && g.r1 === g.r2 ? XL.key(g.c1, g.r1) : XL.key(g.c1, g.r1) + ':' + XL.key(g.c2, g.r2); },
  hit(g, c, r) { return c >= g.c1 && c <= g.c2 && r >= g.r1 && r <= g.r2; },
  overlap(a, b) { return a.c1 <= b.c2 && b.c1 <= a.c2 && a.r1 <= b.r2 && b.r1 <= a.r2; },
  hiddenRows(d) { const s = new Set(d.hideR || []); for (const r of d.hideF || []) s.add(r); return s; },
  changed(label, full) { if (full) Sheet._full = true; Sheet.changed(label); Ribbon.refresh(); },

  /* ---------------------------------------------------------------- Zeilen/Spalten eingefügt oder gelöscht */
  shiftRef(ref, axis, at, n) {
    const g = XL.parseRange(String(ref).replace(/\$/g, ''));
    if (!g) return ref;
    const k1 = axis === 'r' ? 'r1' : 'c1', k2 = axis === 'r' ? 'r2' : 'c2';
    if (n > 0) { if (g[k1] >= at) g[k1] += n; if (g[k2] >= at) g[k2] += n; }
    else {
      const m = -n, end = at + m - 1;
      if (g[k1] >= at && g[k2] <= end) return null;
      const f1 = (v) => v < at ? v : v > end ? v - m : at, f2 = (v) => v < at ? v : v > end ? v - m : at - 1;
      g[k1] = f1(g[k1]); g[k2] = f2(g[k2]);
      if (g[k2] < g[k1]) return null;
    }
    return this.refOf(g);
  },
  shift(d, axis, at, n) {
    if (!d) return;
    const R = axis === 'r';
    const idx = (arr) => arr ? arr.map(v => v >= at ? (n > 0 ? v + n : v < at - n ? null : v + n) : v).filter(v => v != null && v >= 0) : arr;
    if (R) { d.hideR = idx(d.hideR); d.hideF = idx(d.hideF); if (d.rowh) { const o = {}; for (const [k, v] of Object.entries(d.rowh)) { const [x] = idx([+k]); if (x != null) o[x] = v; } d.rowh = o; } }
    else d.hideC = idx(d.hideC);
    if (d.merges) d.merges = d.merges.map(m => this.shiftRef(m, axis, at, n)).filter(m => m && XL.parseRange(m) && (() => { const g = XL.parseRange(m); return g.c1 !== g.c2 || g.r1 !== g.r2; })());
    if (d.dv) d.dv = d.dv.map(v => { const ref = this.shiftRef(v.ref, axis, at, n); return ref ? { ...v, ref, x: ref === v.ref ? v.x : null } : null; }).filter(Boolean);
    if (d.af) { const ref = this.shiftRef(d.af.ref, axis, at, n); if (!ref) { delete d.af; delete d.hideF; } else { if (!R && d.af.f) { const o = {}; for (const [k, v] of Object.entries(d.af.f)) { const [x] = idx([+k]); if (x != null) o[x] = v; } d.af.f = o; } d.af.ref = ref; } }
    if (d.notes) { const o = {}; for (const [k, v] of Object.entries(d.notes)) { const p = XL.parseKey(k); const nk = this.shiftRef(k, axis, at, n); if (nk && p) o[nk] = v; } d.notes = o; }
    if (d.cf) d.cf = d.cf.map(r => { const ref = this.shiftRef(r.ref, axis, at, n); return ref ? { ...r, ref } : null; }).filter(Boolean);
    if (d.ps && d.ps.pa) d.ps.pa = this.shiftRef(d.ps.pa, axis, at, n) || null;
  },

  /* ---------------------------------------------------------------- Zellen verbinden */
  async merge(kind) {
    const c = this.need(); if (!c || this.ro(c)) return;
    const { d, s } = c;
    const sel = { c1: s.c1, r1: s.r1, c2: s.c2, r2: s.r2 };
    const ms = (d.merges || []).map(m => XL.parseRange(m)).filter(Boolean);
    if (kind === 'unmerge') {
      const keep = ms.filter(g => !this.overlap(g, sel));
      if (keep.length === ms.length) { UI.toast('In der Auswahl sind keine verbundenen Zellen'); return; }
      d.merges = keep.map(g => this.refOf(g));
      if (!d.merges.length) delete d.merges;
      return this.changed('Zellverbund aufgehoben', true);
    }
    // Verbinden und zentrieren: genau ein verbundener Bereich ausgewählt → aufheben (Knopf wirkt wie ein Schalter)
    if (kind === 'center' && ms.some(g => g.c1 === sel.c1 && g.r1 === sel.r1 && g.c2 === sel.c2 && g.r2 === sel.r2)) return this.merge('unmerge');
    if (sel.c1 === sel.c2 && sel.r1 === sel.r2) { UI.toast('Zuerst mehrere Zellen markieren'); return; }
    const areas = kind === 'across' ? Array.from({ length: sel.r2 - sel.r1 + 1 }, (_, i) => ({ c1: sel.c1, c2: sel.c2, r1: sel.r1 + i, r2: sel.r1 + i })).filter(g => g.c1 !== g.c2) : [sel];
    if (!areas.length) { UI.toast('„Verbinden über“ braucht mehrere Spalten'); return; }
    const lost = [];
    for (const g of areas) for (let r = g.r1; r <= g.r2; r++) for (let cc = g.c1; cc <= g.c2; cc++) if ((r !== g.r1 || cc !== g.c1) && Sheet.raw(d, cc, r) !== '') lost.push([cc, r]);
    if (lost.length && !await UI.confirm('Zellen verbinden', 'Beim Verbinden bleibt nur der Wert oben links erhalten – die anderen Werte werden gelöscht (Strg+Z holt sie zurück).', { ok: 'Verbinden' })) return;
    for (const [cc, r] of lost) { const k = XL.key(cc, r); if (d.cells[k]) { d.cells[k].v = ''; if (!d.cells[k].f) delete d.cells[k]; } }
    const rest = ms.filter(g => !areas.some(a => this.overlap(a, g)));
    d.merges = [...rest, ...areas].map(g => this.refOf(g));
    if (kind === 'center') for (const g of areas) { const k = XL.key(g.c1, g.r1), cell = d.cells[k] || (d.cells[k] = { v: '' }); cell.f = { ...(cell.f || (d.xl && d.xl.f0) || {}), al: 'c' }; }
    Sheet.active.c2 = Sheet.active.c; Sheet.active.r2 = Sheet.active.r; Sheet.active.c = sel.c1; Sheet.active.r = sel.r1; Sheet.active.c2 = sel.c2; Sheet.active.r2 = sel.r2;
    this.changed(kind === 'center' ? 'Verbinden und zentrieren' : 'Zellen verbunden', true);
  },
  mergeMenu(anchor) {
    UI.menu([{ head: 'Zellen verbinden' }, { label: 'Verbinden und zentrieren', icon: 'merge', action: () => this.merge('center') }, { label: 'Verbinden über (je Zeile)', icon: 'merge', action: () => this.merge('across') },
      { label: 'Zellen verbinden', icon: 'merge', action: () => this.merge('merge') }, { label: 'Zellverbund aufheben', icon: 'splitH', action: () => this.merge('unmerge') }], 0, 0, { anchor });
  },

  /* ---------------------------------------------------------------- Format: Zeilenhöhe, Spaltenbreite, aus-/einblenden */
  pt(px) { return Math.round(px * 72 / 96 * 4) / 4; },
  chars(px) { return Math.round((px - 5) / 7 * 100) / 100; },
  num(v) { const n = parseFloat(String(v).replace(',', '.')); return isFinite(n) ? n : null; },
  async rowHeight() {
    const c = this.need(); if (!c || this.ro(c)) return;
    const { d, s } = c, rh = (d.rowh && d.rowh[s.r1]) || (d.xl && d.xl.rh) || 20;
    const v = await UI.prompt('Zeilenhöhe', String(this.pt(rh)).replace('.', ','), { text: 'In Punkt (pt), wie Excel – 0 blendet die Zeilen aus.' });
    const n = v == null ? null : this.num(v); if (n == null) return;
    for (let r = s.r1; r <= s.r2; r++) { if (n <= 0) { d.hideR = [...new Set([...(d.hideR || []), r])]; continue; } (d.rowh || (d.rowh = {}))[r] = Math.max(4, Math.round(Math.min(409, n) * 96 / 72)); }
    this.changed('Zeilenhöhe', true);
  },
  rowAuto() { const c = this.need(); if (!c || this.ro(c)) return; for (let r = c.s.r1; r <= c.s.r2; r++) if (c.d.rowh) delete c.d.rowh[r]; this.changed('Zeilenhöhe automatisch', true); },
  async colWidth(std) {
    const c = this.need(); if (!c || this.ro(c)) return;
    const { d, s } = c, w0 = std ? (d.xl && d.xl.cw) || 64 : d.cols[s.c1] || 64;
    const v = await UI.prompt(std ? 'Standardbreite' : 'Spaltenbreite', String(this.chars(w0)).replace('.', ','), { text: 'In Zeichen der Standardschrift, wie Excel – 0 blendet die Spalten aus.' + (std ? ' Gilt für alle Spalten, die die Standardbreite haben.' : '') });
    const n = v == null ? null : this.num(v); if (n == null) return;
    const px = Math.max(16, Math.round(Math.min(255, n) * 7 + 5));
    if (std) { const old = (d.xl && d.xl.cw) || 64; d.cols = d.cols.map(w => Math.abs(w - old) <= 1 ? px : w); if (d.xl) d.xl.cw = px; }
    else for (let cc = s.c1; cc <= s.c2; cc++) { if (n <= 0) { d.hideC = [...new Set([...(d.hideC || []), cc])]; continue; } d.cols[cc] = px; }
    this.changed(std ? 'Standardbreite' : 'Spaltenbreite', true);
  },
  colAuto() { const c = this.need(); if (!c || this.ro(c)) return; for (let cc = c.s.c1; cc <= c.s.c2; cc++) Sheet.autofit(c.id, cc); },
  hide(axis, on) {
    const c = this.need(); if (!c || this.ro(c)) return;
    const { d, s } = c, key = axis === 'r' ? 'hideR' : 'hideC', a = axis === 'r' ? s.r1 : s.c1, b = axis === 'r' ? s.r2 : s.c2;
    let set = new Set(d[key] || []);
    if (on) { const n = axis === 'r' ? d.nrows : d.ncols; if (b - a + 1 >= n) { UI.toast('Nicht alle Zeilen/Spalten ausblenden'); return; } for (let i = a; i <= b; i++) set.add(i); }
    else {
      let any = false;
      for (let i = a; i <= b; i++) if (set.delete(i)) any = true;
      // wie Excel: Auswahl um die ausgeblendeten herum – sonst die direkt daneben
      if (!any) { for (let i = a - 1; i >= 0 && set.has(i); i--) set.delete(i); for (let i = b + 1; set.has(i); i++) set.delete(i); }
    }
    set = [...set].sort((x, y) => x - y);
    if (set.length) d[key] = set; else delete d[key];
    this.changed(on ? (axis === 'r' ? 'Zeilen ausgeblendet' : 'Spalten ausgeblendet') : (axis === 'r' ? 'Zeilen eingeblendet' : 'Spalten eingeblendet'), true);
  },
  lockCells(unlock) { const c = this.need(); if (!c || Sheet.locked(c.id)) return; Sheet.formatSel(f => { f.ul = unlock || null; }, unlock ? 'Zellen entsperrt' : 'Zellen gesperrt'); },
  formatMenu(anchor) {
    const c = this.cur(), ul = c && !!Sheet.cellF(c.d, c.a.c, c.a.r).ul;
    UI.menu([{ head: 'Zellengrösse' }, { label: 'Zeilenhöhe …', icon: 'rowBelow', action: () => this.rowHeight() }, { label: 'Zeilenhöhe automatisch anpassen', icon: 'fit', action: () => this.rowAuto() },
      { label: 'Spaltenbreite …', icon: 'colRight', action: () => this.colWidth() }, { label: 'Spaltenbreite automatisch anpassen', icon: 'sameWidth', action: () => this.colAuto() }, { label: 'Standardbreite …', icon: 'colRight', action: () => this.colWidth(true) },
      { head: 'Ausblenden und Einblenden' }, { label: 'Zeilen ausblenden', key: 'Strg+9', action: () => this.hide('r', true) }, { label: 'Spalten ausblenden', key: 'Strg+0', action: () => this.hide('c', true) },
      { label: 'Zeilen einblenden', action: () => this.hide('r', false) }, { label: 'Spalten einblenden', action: () => this.hide('c', false) },
      { label: 'Blatt ausblenden', action: () => { const p = OfficeGrid.page(); if (p && c) OfficeView.hideSheet(c.id, true); } },
      { head: 'Blätter organisieren' }, { label: 'Blatt umbenennen', icon: 'pencil', action: () => Cmd.run('xlRename') }, { label: 'Neues Blatt', icon: 'plus', action: () => Cmd.run('xlSheetAdd') },
      { head: 'Schutz' }, { label: (c && c.d.prot && c.d.prot.on) ? 'Blattschutz aufheben …' : 'Blatt schützen …', icon: 'lock', action: () => this.protect() },
      { label: 'Zelle sperren', checked: !ul, title: 'Gesperrte Zellen lassen sich bei geschütztem Blatt nicht ändern (Standard)', action: () => this.lockCells(!ul) },
      { label: 'Zellen formatieren …', icon: 'settings', key: 'Strg+1', action: () => this.formatDialog() }], 0, 0, { anchor });
  },
  clearMenu(anchor) {
    UI.menu([{ head: 'Löschen' }, { label: 'Alles löschen', icon: 'eraser', action: () => { this.dropNotes(); Sheet.clear('all'); } }, { label: 'Formate löschen', icon: 'clearFormat', action: () => Sheet.clear('f') },
      { label: 'Inhalte löschen', icon: 'eraser', key: 'Entf', action: () => Sheet.clear('v') }, { label: 'Notizen löschen', icon: 'notes', action: () => { if (this.dropNotes()) this.changed('Notizen gelöscht'); } }], 0, 0, { anchor });
  },

  /* ---------------------------------------------------------------- Zellenformatvorlagen, Als Tabelle formatieren */
  CELL_STYLES: [
    ['Standard', null, 'Gut, schlecht und neutral'], ['Gut', { bg: '#C6EFCE', c: '#006100' }], ['Schlecht', { bg: '#FFC7CE', c: '#9C0006' }], ['Neutral', { bg: '#FFEB9C', c: '#9C5700' }],
    ['Berechnung', { bg: '#F2F2F2', c: '#FA7D00', b: true, bd: 'tlbr' }, 'Daten und Modell'], ['Eingabe', { bg: '#FFCC99', c: '#3F3F76', bd: 'tlbr' }], ['Ausgabe', { bg: '#F2F2F2', c: '#3F3F3F', b: true, bd: 'tlbr' }],
    ['Notiz', { bg: '#FFFFCC', bd: 'tlbr' }], ['Warntext', { c: '#FF0000' }], ['Erklärender Text', { i: true, c: '#7F7F7F' }], ['Zelle prüfen', { bg: '#A5A5A5', c: '#FFFFFF', b: true, bd: 'TLBR' }],
    ['Titel', { fs: 18, c: '#44546A' }, 'Titel und Überschriften'], ['Überschrift 1', { fs: 15, b: true, c: '#44546A', bd: 'B' }], ['Überschrift 2', { fs: 13, b: true, c: '#44546A', bd: 'B' }],
    ['Überschrift 3', { b: true, c: '#44546A', bd: 'b' }], ['Überschrift 4', { b: true, c: '#44546A' }], ['Ergebnis', { b: true, bd: 'tB' }],
    ['Akzent1', { bg: '#4472C4', c: '#FFFFFF' }, 'Zellenformatvorlagen mit Designs'], ['Akzent2', { bg: '#ED7D31', c: '#FFFFFF' }], ['Akzent3', { bg: '#A5A5A5', c: '#FFFFFF' }],
    ['Akzent4', { bg: '#FFC000', c: '#FFFFFF' }], ['Akzent5', { bg: '#5B9BD5', c: '#FFFFFF' }], ['Akzent6', { bg: '#70AD47', c: '#FFFFFF' }],
    ['20 % – Akzent1', { bg: '#D9E1F2' }], ['40 % – Akzent1', { bg: '#B4C6E7' }], ['20 % – Akzent6', { bg: '#E2EFDA' }], ['40 % – Akzent6', { bg: '#C6E0B4' }],
    ['Prozent', { nf: 'pct', d: 0 }, 'Zahlenformat'], ['Währung', { nf: 'cur', d: 2, cur: 'CHF' }], ['Komma', { nf: 'num', d: 2 }], ['Komma [0]', { nf: 'num', d: 0 }],
  ],
  cellStyle(name) {
    const st = this.CELL_STYLES.find(x => x[0] === name);
    if (!st) return;
    const nfOnly = st[1] && st[1].nf;
    Sheet.formatSel((f) => {
      if (!st[1]) { for (const k of ['b', 'i', 'u', 's', 'c', 'bg', 'fs', 'bd', 'nf', 'd', 'cur', 'ts']) delete f[k]; return; }
      if (nfOnly) { delete f.nf; delete f.d; delete f.cur; }
      else for (const k of ['b', 'i', 'c', 'bg', 'fs', 'bd']) delete f[k];
      Object.assign(f, st[1]);
    }, 'Formatvorlage „' + name + '“');
  },
  stylesMenu(anchor) {
    const box = el('div', { class: 'xt-styles' });
    for (const [name, f, head] of this.CELL_STYLES) {
      if (head) box.append(el('div', { class: 'mhead', text: head }));
      const b = el('button', { class: 'xt-st', type: 'button', text: name, title: 'Formatvorlage „' + name + '“' });
      if (f) b.style.cssText = Sheet.cellStyle(f, false, false, true) + (f.fs ? `font-size:${Math.min(16, f.fs)}pt;` : '');
      b.addEventListener('click', () => { UI.closePopup(); this.cellStyle(name); });
      box.append(b);
    }
    UI.showPopup(box, 0, 0, { anchor });
  },
  TABLES: [['Hellblau', '#4472C4', '#D9E1F2'], ['Orange', '#ED7D31', '#FCE4D6'], ['Grau', '#7F7F7F', '#EDEDED'], ['Gold', '#BF8F00', '#FFF2CC'], ['Blau', '#2F75B5', '#DDEBF7'], ['Grün', '#548235', '#E2EFDA'], ['Dunkel', '#262626', '#D9D9D9']],
  asTable(i) {
    const c = this.need(); if (!c || this.ro(c)) return;
    const [, hd, band] = this.TABLES[i] || this.TABLES[0];
    let g = c.s;
    if (g.c1 === g.c2 && g.r1 === g.r2) { const rg = OfficeGrid.region(); if (rg) g = rg; }
    if (g.r2 <= g.r1) { UI.toast('Zuerst den Bereich mit Kopfzeile markieren'); return; }
    Sheet.active.c = g.c1; Sheet.active.r = g.r1; Sheet.active.c2 = g.c2; Sheet.active.r2 = g.r2;
    Sheet.formatSel((f, cc, r) => {
      delete f.bd;
      if (r === g.r1) { f.bg = hd; f.c = '#FFFFFF'; f.b = true; }
      else { f.bg = (r - g.r1) % 2 === 1 ? band : null; if (f.c === '#FFFFFF') delete f.c; delete f.b; f.bd = r === g.r2 ? 'b' : null; }
    }, 'Als Tabelle formatiert');
    // wie Excel: Filterknöpfe in der Kopfzeile
    const d = c.d;
    if (!d.af) { d.af = { ref: this.refOf(g), f: {} }; this.changed('Filter', true); }
  },
  tableMenu(anchor) {
    UI.menu([{ head: 'Als Tabelle formatieren' }, ...this.TABLES.map(([l, h], i) => ({ label: l, icon: 'table', title: 'Kopfzeile ' + h + ', gebänderte Zeilen, Filter', action: () => this.asTable(i) }))], 0, 0, { anchor });
  },

  /* ---------------------------------------------------------------- Zellen formatieren (Strg+1) */
  NF: [['std', 'Standard'], ['num', 'Zahl'], ['cur', 'Währung'], ['date', 'Datum'], ['datel', 'Datum lang'], ['time', 'Uhrzeit'], ['dt', 'Datum und Uhrzeit'], ['pct', 'Prozent'], ['frac', 'Bruch'], ['sci', 'Wissenschaft'], ['text', 'Text']],
  async formatDialog(tab0) {
    const c = this.need(); if (!c) return;
    if (Sheet.locked(c.id)) { UI.toast('Das Blatt ist geschützt'); return; }
    const f0 = { ...Sheet.cellF(c.d, c.a.c, c.a.r) };
    const touched = new Set();
    const v = { ...f0, nf: f0.nf || 'std' };
    const res = await UI.dialog((dlg, close) => {
      dlg.classList.add('xt-fmt');
      dlg.append(el('h2', { text: 'Zellen formatieren' }));
      const tabs = el('div', { class: 'xt-tabs' }), body = el('div', { class: 'xt-body' });
      const prev = el('div', { class: 'xt-prev' });
      const upd = () => { const val = Sheet.value(c.id, c.a.c, c.a.r); const f = this.pick(v); const disp = XL.format(val == null || val === '' ? 1234.5 : val, f); prev.textContent = disp.t; prev.style.cssText = Sheet.cellStyle(f, false, false, true) + `text-align:${{ l: 'left', c: 'center', r: 'right' }[f.al || disp.al] || 'left'};`; };
      const set = (k, val) => { v[k] = val; touched.add(k); upd(); };
      const row = (label, ctl) => el('label', { class: 'sa-row' }, el('span', { text: label }), ctl);
      const sel = (k, list, cur) => { const s = el('select', {}, ...list.map(([a, b]) => el('option', { value: a, text: b }))); s.value = cur == null ? list[0][0] : String(cur); s.addEventListener('change', () => set(k, s.value)); return s; };
      const chk = (k, label) => { const i = el('input', { type: 'checkbox' }); i.checked = !!v[k]; i.addEventListener('change', () => set(k, i.checked)); return el('label', { class: 'ex-opt' }, i, label); };
      const numIn = (k, cur, min, max) => { const i = el('input', { type: 'number', min, max, value: cur == null ? '' : cur }); i.addEventListener('input', () => set(k, i.value === '' ? null : +i.value)); return i; };
      const color = (k) => { const w = el('div', { class: 'xt-cols' }); for (const col of [null, '#000000', '#FFFFFF', '#C00000', '#FF0000', '#FFC000', '#FFFF00', '#92D050', '#00B050', '#00B0F0', '#0070C0', '#002060', '#7030A0', '#D9E1F2', '#FCE4D6', '#E2EFDA', '#F2F2F2']) { const b = el('button', { type: 'button', class: 'sw' + (col ? '' : ' none') + ((v[k] || null) === col ? ' on' : ''), title: col || 'Keine', style: { background: col || '' } }); b.addEventListener('click', () => { set(k, col); for (const x of w.children) x.classList.toggle('on', x === b); }); w.append(b); } return w; };
      const pages = {
        Zahl: () => [row('Kategorie', sel('nf', this.NF, v.nf)), row('Dezimalstellen', numIn('d', v.d, 0, 15)), row('Währung', sel('cur', [['CHF', 'CHF'], ['€', '€ Euro'], ['$', '$ Dollar'], ['£', '£ Pfund']], v.cur || 'CHF')), el('div', { class: 'sa-row' }, el('span'), chk('ts', "Tausendertrennzeichen (')"))],
        Ausrichtung: () => [row('Horizontal', sel('al', [['', 'Standard'], ['l', 'Links'], ['c', 'Zentriert'], ['r', 'Rechts']], v.al || '')), row('Vertikal', sel('va', [['', 'Unten'], ['m', 'Zentriert'], ['t', 'Oben']], v.va || '')),
          row('Einzug', numIn('in', v.in, 0, 15)), el('div', { class: 'sa-row' }, el('span'), chk('wr', 'Zeilenumbruch')), el('div', { class: 'sa-row' }, el('span'), chk('mg', 'Zellen verbinden'))],
        Schrift: () => [row('Schriftart', sel('fn', [['', 'Standard (' + ((c.d.xl && c.d.xl.fn) || 'Calibri') + ')'], ...FONTS.map(x => [x, x])], v.fn || '')), row('Grösse (pt)', numIn('fs', v.fs, 6, 72)),
          el('div', { class: 'sa-row' }, el('span'), el('div', { class: 'xt-flags' }, chk('b', 'Fett'), chk('i', 'Kursiv'), chk('u', 'Unterstrichen'), chk('s', 'Durchgestrichen'))), row('Farbe', color('c'))],
        Rahmen: () => { const bd = () => v.bd || ''; const w = el('div', { class: 'xt-flags' }); const mk = (ch, label) => { const i = el('input', { type: 'checkbox' }); i.checked = bd().toLowerCase().includes(ch); i.addEventListener('change', () => { let s = bd().replace(new RegExp(ch, 'gi'), ''); if (i.checked) s += thick.checked ? ch.toUpperCase() : ch; set('bd', s || null); }); return el('label', { class: 'ex-opt' }, i, label); };
          const thick = el('input', { type: 'checkbox' }); thick.checked = /[TLBR]/.test(bd()); thick.addEventListener('change', () => set('bd', (bd().replace(/[tlbrTLBR]/g, (m) => thick.checked ? m.toUpperCase() : m.toLowerCase())) || null));
          const presets = el('div', { class: 'xt-flags' }, ...[['Keine', ''], ['Alle', 'tlbr'], ['Aussen dick', 'TLBR']].map(([l, s]) => { const b = el('button', { class: 'btn small', type: 'button', text: l }); b.addEventListener('click', () => { set('bd', s || null); show(); }); return b; }));
          w.append(mk('t', 'Oben'), mk('b', 'Unten'), mk('l', 'Links'), mk('r', 'Rechts')); return [row('Voreinstellung', presets), row('Linien', w), el('div', { class: 'sa-row' }, el('span'), el('label', { class: 'ex-opt' }, thick, 'Dicke Linie'))]; },
        Ausfüllen: () => [row('Hintergrund', color('bg'))],
        Schutz: () => [el('div', { class: 'sa-row' }, el('span'), (() => { const i = el('input', { type: 'checkbox' }); i.checked = !v.ul; i.addEventListener('change', () => set('ul', !i.checked)); return el('label', { class: 'ex-opt' }, i, 'Gesperrt'); })()), el('p', { class: 'bs-note', text: 'Gesperrte Zellen lassen sich erst nach „Überprüfen → Blatt schützen“ nicht mehr ändern.' })],
      };
      let cur = tab0 && pages[tab0] ? tab0 : 'Zahl';
      const show = () => { body.innerHTML = ''; body.append(...pages[cur]()); for (const t of tabs.children) t.classList.toggle('on', t.dataset.k === cur); };
      for (const k of Object.keys(pages)) { const t = el('button', { type: 'button', class: 'xt-tab', text: k, dataset: { k } }); t.addEventListener('click', () => { cur = k; show(); }); tabs.append(t); }
      dlg.append(tabs, body, el('div', { class: 'xt-prevw' }, el('span', { text: 'Vorschau' }), prev), el('div', { class: 'dlg-btns' }, el('button', { class: 'btn', type: 'button', text: 'Abbrechen', onclick: () => close(null) }), el('button', { class: 'btn primary', type: 'button', text: 'OK', onclick: () => close('ok') })));
      show(); upd();
    }, { wide: true });
    if (res !== 'ok') return;
    const apply = () => {
      Sheet.formatSel((f) => {
        for (const k of touched) {
          if (k === 'mg') continue;
          if (k === 'nf') { if (v.nf === 'std') { delete f.nf; delete f.d; delete f.cur; } else f.nf = v.nf; continue; }
          f[k] = v[k] === '' || v[k] == null || v[k] === false ? null : v[k];
        }
      }, 'Zellen formatiert');
    };
    if (touched.size && [...touched].some(k => k !== 'mg')) apply();
    if (touched.has('mg')) await this.merge(v.mg ? 'merge' : 'unmerge');
  },
  pick(v) { const f = { ...v }; if (f.nf === 'std') { delete f.nf; delete f.d; delete f.cur; } for (const k of Object.keys(f)) if (f[k] == null || f[k] === '' || f[k] === false) delete f[k]; delete f.mg; return f; },

  /* ---------------------------------------------------------------- Suchen und Ersetzen, Gehe zu */
  async findDialog(replace) {
    const c = this.need(); if (!c) return;
    const p = OfficeGrid.page();
    const st = this._find || (this._find = { q: '', r: '', cs: false, whole: false, book: false, inF: true });
    await UI.dialog((dlg, close) => {
      dlg.classList.add('kt-saveas', 'xt-find');
      dlg.append(el('h2', { text: replace ? 'Suchen und Ersetzen' : 'Suchen' }));
      const q = el('input', { type: 'text', value: st.q, class: 'sa-name', autofocus: true }), r = el('input', { type: 'text', value: st.r, class: 'sa-name' });
      const ck = (k, l) => { const i = el('input', { type: 'checkbox' }); i.checked = !!st[k]; i.addEventListener('change', () => { st[k] = i.checked; }); return el('label', { class: 'ex-opt' }, i, l); };
      const list = el('div', { class: 'xt-hits' }), info = el('p', { class: 'bs-note' });
      const hits = () => {
        st.q = q.value; st.r = r.value;
        if (!st.q) return [];
        const out = [], boxes = st.book ? OfficeView.sheets(p) : [Sheet.box(Sheet.active ? Sheet.active.id : c.id)];
        const norm = (s) => st.cs ? s : s.toLowerCase(), needle = norm(st.q);
        for (const b of boxes) {
          const d = b.sheet;
          const keys = Object.keys(d.cells).map(k => [k, XL.parseKey(k)]).filter(x => x[1]).sort((x, y) => x[1].r - y[1].r || x[1].c - y[1].c);
          for (const [k, pk] of keys) {
            const raw = String(d.cells[k].v ?? ''); if (raw === '') continue;
            const txt = st.inF && !replace ? raw : XL.isFormula(raw) && !replace ? Sheet.display(b.id, pk.c, pk.r).t : raw;
            const t = norm(txt);
            if (st.whole ? t === needle : t.includes(needle)) out.push({ b, c: pk.c, r: pk.r, k, txt });
          }
        }
        return out;
      };
      const go = (h) => { if (Sheet.active && Sheet.active.id !== h.b.id) OfficeView.showSheet(h.b.id); Sheet.activate(h.b.id, h.c, h.r); Sheet.reveal(); };
      const next = () => { const hs = hits(); if (!hs.length) { info.textContent = 'Nichts gefunden.'; return; } const a = Sheet.active; const i = hs.findIndex(h => a && h.b.id === a.id && (h.r > a.r || (h.r === a.r && h.c > a.c))); go(hs[i < 0 ? 0 : i]); info.textContent = `${hs.length} Treffer`; };
      const all = () => { const hs = hits(); list.innerHTML = ''; info.textContent = hs.length ? `${hs.length} Zelle(n) gefunden` : 'Nichts gefunden.'; for (const h of hs.slice(0, 300)) { const it = el('button', { type: 'button', class: 'xt-hit', text: `${h.b.sheet.name}!${h.k}   ${h.txt.slice(0, 80)}` }); it.addEventListener('click', () => go(h)); list.append(it); } };
      const repl = (h) => { const d = h.b.sheet, raw = String(d.cells[h.k].v); const re = new RegExp(st.whole ? '^' + st.q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$' : st.q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), st.cs ? 'g' : 'gi'); return raw.replace(re, () => st.r); };
      const one = () => { const a = Sheet.active, hs = hits(); const h = a && hs.find(x => x.b.id === a.id && x.c === a.c && x.r === a.r); if (h && !Sheet.locked(h.b.id)) Sheet.setCells(h.b.id, [[h.c, h.r, repl(h)]], 'Ersetzt'); next(); };
      const every = () => { const hs = hits(); const by = new Map(); for (const h of hs) { if (Sheet.locked(h.b.id)) continue; if (!by.has(h.b.id)) by.set(h.b.id, []); by.get(h.b.id).push([h.c, h.r, repl(h)]); } let n = 0; for (const [id, l] of by) { Sheet.setCells(id, l, 'Alle ersetzt'); n += l.length; } info.textContent = `${n} Ersetzung(en) vorgenommen.`; list.innerHTML = ''; };
      q.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); next(); } });
      const btn = (t, fn, pri) => { const b = el('button', { class: 'btn' + (pri ? ' primary' : ''), type: 'button', text: t }); b.addEventListener('click', fn); return b; };
      dlg.append(el('label', { class: 'sa-row' }, el('span', { text: 'Suchen nach' }), q));
      if (replace) dlg.append(el('label', { class: 'sa-row' }, el('span', { text: 'Ersetzen durch' }), r));
      dlg.append(el('div', { class: 'xt-flags' }, ck('cs', 'Gross-/Kleinschreibung'), ck('whole', 'Gesamten Zellinhalt vergleichen'), ck('book', 'In der ganzen Arbeitsmappe'), replace ? '' : ck('inF', 'In Formeln (sonst Werte)')), info, list,
        el('div', { class: 'dlg-btns' }, ...(replace ? [btn('Alle ersetzen', every), btn('Ersetzen', one)] : []), btn('Alle suchen', all), btn('Weitersuchen', next, true), btn('Schliessen', () => close(null))));
    }, { wide: true });
  },
  async goTo() { const c = this.need(); if (!c) return; const v = await UI.prompt('Gehe zu', '', { text: 'Bezug, z.B. B12, C3:F9 oder Tabelle2!A1', placeholder: 'A1' }); if (v) Sheet.goTo(v); },
  findMenu(anchor) {
    const c = this.cur();
    UI.menu([{ head: 'Suchen und Auswählen' }, { label: 'Suchen …', icon: 'search', action: () => this.findDialog(false) }, { label: 'Ersetzen …', icon: 'replace', action: () => this.findDialog(true) }, { label: 'Gehe zu …', icon: 'arrowRight', key: 'F5', action: () => this.goTo() },
      '-', { label: 'Notizen', icon: 'notes', disabled: !c || !c.d.notes || !Object.keys(c.d.notes).length, action: () => this.noteStep(1) }, { label: 'Fehler (#…)', icon: 'warning', action: () => this.errorCheck() }], 0, 0, { anchor });
  },

  /* ---------------------------------------------------------------- Formeln: anzeigen, Fehlerprüfung, Spuren */
  showFormulas() { const c = this.need(); if (!c) return; if (c.d.showF) delete c.d.showF; else c.d.showF = true; this.changed('Formeln anzeigen', true); },
  errorCheck() {
    const c = this.need(); if (!c) return;
    const errs = [];
    for (const k of Object.keys(c.d.cells)) { const pk = XL.parseKey(k); if (!pk) continue; const t = Sheet.display(c.id, pk.c, pk.r); if (t.err) errs.push({ k, ...pk, t: t.t }); }
    if (!errs.length) { UI.toast('Keine Fehler in diesem Blatt'); return; }
    errs.sort((a, b) => a.r - b.r || a.c - b.c);
    const a = Sheet.active, i = errs.findIndex(e => e.r > a.r || (e.r === a.r && e.c > a.c));
    const e = errs[i < 0 ? 0 : i];
    Sheet.activate(c.id, e.c, e.r); Sheet.reveal();
    UI.toast(`${e.k}: ${e.t} – ${errs.length} Fehler im Blatt (nochmals = nächster)`, 3500);
  },
  /* Spur zum Vorgänger (Zellen, aus denen die Formel liest) bzw. Nachfolger (Formeln, die diese Zelle lesen): markieren */
  trace(kind) {
    const c = this.need(); if (!c) return;
    const { d, a } = c, out = [];
    if (kind === 'pre') {
      const raw = Sheet.raw(d, a.c, a.r);
      if (!XL.isFormula(raw)) { UI.toast('Die Zelle enthält keine Formel'); return; }
      for (const rf of XL.refsIn(raw)) if (!rf.sheet && !rf.page) out.push({ c1: rf.c1, r1: rf.r1, c2: Math.min(rf.c2, d.ncols - 1), r2: Math.min(rf.r2, d.nrows - 1) });
    } else {
      for (const [k, cell] of Object.entries(d.cells)) {
        if (!XL.isFormula(cell.v)) continue;
        if (XL.refsIn(cell.v).some(rf => !rf.sheet && !rf.page && this.hit(rf, a.c, a.r))) { const pk = XL.parseKey(k); out.push({ c1: pk.c, r1: pk.r, c2: pk.c, r2: pk.r }); }
      }
    }
    if (!out.length) { UI.toast(kind === 'pre' ? 'Keine Vorgänger auf diesem Blatt' : 'Keine Formel auf diesem Blatt liest diese Zelle'); return; }
    this._trace = { id: c.id, src: { c1: a.c, r1: a.r, c2: a.c, r2: a.r }, list: out, kind };
    Sheet.overlay(c.b);
    UI.toast(`${out.length} ${kind === 'pre' ? 'Vorgänger' : 'Nachfolger'} markiert (blau) – „Pfeile entfernen“ blendet sie aus`, 3500);
  },
  untrace() { const t = this._trace; this._trace = null; if (t) { const b = Sheet.box(t.id); if (b) Sheet.overlay(b); } },

  /* ---------------------------------------------------------------- Daten: Filter */
  filterToggle() {
    const c = this.need(); if (!c || this.ro(c)) return;
    const d = c.d;
    if (d.af) { delete d.af; delete d.hideF; return this.changed('Filter entfernt', true); }
    let g = c.s;
    if (g.r1 === g.r2) { const rg = OfficeGrid.region(); if (rg) g = rg; }
    if (g.r2 <= g.r1) { UI.toast('Zuerst eine Zelle in einer Liste mit Kopfzeile wählen'); return; }
    d.af = { ref: this.refOf(g), f: {} };
    this.changed('Filter', true);
  },
  colValues(d, id, g, cc) {
    const set = new Map();
    for (let r = g.r1 + 1; r <= g.r2; r++) { const t = Sheet.display(id, cc, r).t; set.set(t, (set.get(t) || 0) + 1); }
    return [...set.keys()].sort((a, b) => { const na = XL.parseInput(a).v, nb = XL.parseInput(b).v; if (a === '') return 1; if (b === '') return -1; return typeof na === 'number' && typeof nb === 'number' ? na - nb : a.localeCompare(b, 'de'); });
  },
  applyFilter(id) {
    const b = Sheet.box(id), d = b && b.sheet;
    if (!d || !d.af) return;
    const g = XL.parseRange(d.af.ref), hid = [];
    if (g) for (let r = g.r1 + 1; r <= g.r2; r++) {
      for (const [k, f] of Object.entries(d.af.f || {})) {
        const t = Sheet.display(id, +k, r).t;
        if (f.vals && !f.vals.includes(t)) { hid.push(r); break; }
        if (f.has != null && !t.toLowerCase().includes(String(f.has).toLowerCase())) { hid.push(r); break; }
      }
    }
    if (hid.length) d.hideF = hid; else delete d.hideF;
  },
  async filterMenu(id, cc, anchor) {
    const b = Sheet.box(id), d = b.sheet, g = XL.parseRange(d.af.ref);
    if (!g) return;
    Sheet.activate(id, cc, g.r1);
    const cur = (d.af.f || {})[cc];
    const vals = this.colValues(d, id, g, cc);
    const ro = Sheet.locked(id);
    const res = await UI.dialog((dlg, close) => {
      dlg.classList.add('kt-saveas', 'xt-filter');
      dlg.append(el('h2', { text: `Filter: ${Sheet.display(id, cc, g.r1).t || XL.colName(cc)}` }));
      const sortRow = el('div', { class: 'xt-flags' }, el('button', { class: 'btn small', type: 'button', html: icon('sortAsc', 14) + ' A → Z sortieren', onclick: () => close({ sort: false }) }), el('button', { class: 'btn small', type: 'button', html: icon('sortDesc', 14) + ' Z → A sortieren', onclick: () => close({ sort: true }) }));
      const search = el('input', { type: 'text', class: 'sa-name', placeholder: 'Suchen …' });
      const has = el('input', { type: 'text', class: 'sa-name', placeholder: 'Textfilter: enthält …', value: cur && cur.has != null ? cur.has : '' });
      const list = el('div', { class: 'xt-vals' });
      const allCb = el('input', { type: 'checkbox' });
      const cbs = vals.map(v => { const i = el('input', { type: 'checkbox' }); i.checked = !cur || !cur.vals || cur.vals.includes(v); const l = el('label', { class: 'ex-opt' }, i, v === '' ? '(Leere)' : v); l.dataset.v = v.toLowerCase(); list.append(l); return [v, i, l]; });
      const sync = () => { allCb.checked = cbs.every(x => x[1].checked); allCb.indeterminate = !allCb.checked && cbs.some(x => x[1].checked); };
      allCb.addEventListener('change', () => { for (const [, i, l] of cbs) if (!l.hidden) i.checked = allCb.checked; sync(); });
      for (const [, i] of cbs) i.addEventListener('change', sync);
      search.addEventListener('input', () => { const q = search.value.toLowerCase(); for (const [, , l] of cbs) l.hidden = !!q && !l.dataset.v.includes(q); });
      sync();
      dlg.append(ro ? '' : sortRow, has, search, el('label', { class: 'ex-opt' }, allCb, '(Alle auswählen)'), list,
        el('div', { class: 'dlg-btns' }, el('button', { class: 'btn', type: 'button', text: 'Filter löschen', onclick: () => close({ clear: true }) }), el('button', { class: 'btn', type: 'button', text: 'Abbrechen', onclick: () => close(null) }),
          el('button', { class: 'btn primary', type: 'button', text: 'OK', onclick: () => close({ vals: cbs.filter(x => x[1].checked).map(x => x[0]), all: cbs.every(x => x[1].checked), has: has.value.trim() }) })));
    });
    if (!res) return;
    if (res.sort != null) { Sheet.active.c = cc; Sheet.active.r = g.r1 + 1; Sheet.active.c2 = g.c2; Sheet.active.r2 = g.r2; Sheet.active.c = g.c1; this.sortRange(id, { c1: g.c1, r1: g.r1 + 1, c2: g.c2, r2: g.r2 }, [{ c: cc, desc: res.sort }]); return; }
    d.af.f = d.af.f || {};
    if (res.clear || (res.all && !res.has)) delete d.af.f[cc];
    else d.af.f[cc] = res.has ? { has: res.has } : { vals: res.vals };
    this.applyFilter(id);
    this.changed('Filter', true);
  },
  reapply() { const c = this.need(); if (!c || !c.d.af) return; this.applyFilter(c.id); this.changed('Filter erneut angewendet', true); },
  clearFilters() { const c = this.need(); if (!c || !c.d.af) return; c.d.af.f = {}; delete c.d.hideF; this.changed('Filter gelöscht', true); },

  /* ---------------------------------------------------------------- Daten: Benutzerdefiniertes Sortieren */
  sortRange(id, g, keys) {
    const d = Sheet.data(id);
    if (!d || Sheet.locked(id)) return;
    const rows = [];
    for (let r = g.r1; r <= g.r2; r++) { const row = []; for (let cc = g.c1; cc <= g.c2; cc++) row.push(d.cells[XL.key(cc, r)] || null); rows.push({ r, row, v: keys.map(k => Sheet.value(id, k.c, r)) }); }
    const cmp = (a, b) => { if (a == null || a === '') return b == null || b === '' ? 0 : 1; if (b == null || b === '') return -1; if (typeof a === 'number' && typeof b === 'number') return a - b; if (typeof a === 'number') return -1; if (typeof b === 'number') return 1; return String(a).localeCompare(String(b), 'de', { numeric: true }); };
    rows.sort((x, y) => { for (let i = 0; i < keys.length; i++) { let q = cmp(x.v[i], y.v[i]); const blank = (x.v[i] == null || x.v[i] === '') !== (y.v[i] == null || y.v[i] === ''); if (keys[i].desc && !blank) q = -q; if (q) return q; } return x.r - y.r; });
    rows.forEach((x, i) => { const r = g.r1 + i; x.row.forEach((cell, j) => { const k = XL.key(g.c1 + j, r); if (cell) d.cells[k] = cell; else delete d.cells[k]; }); });
    Sheet.markDirty(id, { c1: g.c1, r1: g.r1, c2: g.c2, r2: g.r2 });
    this.changed('Sortiert', true);
  },
  async sortDialog() {
    const c = this.need(); if (!c || this.ro(c)) return;
    let g = c.s;
    if (g.r1 === g.r2 && g.c1 === g.c2) { const rg = OfficeGrid.region(); if (rg) g = rg; }
    const levels = [{ c: c.a.c, desc: false }];
    const res = await UI.dialog((dlg, close) => {
      dlg.classList.add('kt-saveas');
      dlg.append(el('h2', { text: 'Sortieren' }), el('p', { class: 'bs-note', text: 'Bereich ' + XL.rangeText(g.c1, g.r1, g.c2, g.r2) }));
      const head = el('input', { type: 'checkbox' }); head.checked = Sheet.raw(c.d, g.c1, g.r1) !== '' && typeof Sheet.value(c.id, g.c1, g.r1) === 'string';
      const box = el('div');
      const colName = (cc) => head.checked ? (Sheet.display(c.id, cc, g.r1).t || XL.colName(cc)) : 'Spalte ' + XL.colName(cc);
      const draw = () => {
        box.innerHTML = '';
        levels.forEach((lv, i) => {
          const s = el('select', {}, ...Array.from({ length: g.c2 - g.c1 + 1 }, (_, j) => el('option', { value: g.c1 + j, text: colName(g.c1 + j) }))); s.value = lv.c; s.addEventListener('change', () => { lv.c = +s.value; });
          const o = el('select', {}, el('option', { value: '0', text: 'A bis Z / klein nach gross' }), el('option', { value: '1', text: 'Z bis A / gross nach klein' })); o.value = lv.desc ? '1' : '0'; o.addEventListener('change', () => { lv.desc = o.value === '1'; });
          const x = el('button', { class: 'btn small', type: 'button', text: '✕', title: 'Ebene löschen' }); x.addEventListener('click', () => { if (levels.length > 1) { levels.splice(i, 1); draw(); } });
          box.append(el('div', { class: 'xt-sortrow' }, el('span', { text: i ? 'Dann nach' : 'Sortieren nach' }), s, o, x));
        });
      };
      head.addEventListener('change', draw);
      const add = el('button', { class: 'btn small', type: 'button', text: '+ Ebene hinzufügen' }); add.addEventListener('click', () => { levels.push({ c: g.c1, desc: false }); draw(); });
      draw();
      dlg.append(el('label', { class: 'ex-opt' }, head, 'Daten haben Überschriften'), box, add, el('div', { class: 'dlg-btns' }, el('button', { class: 'btn', type: 'button', text: 'Abbrechen', onclick: () => close(null) }), el('button', { class: 'btn primary', type: 'button', text: 'OK', onclick: () => close({ head: head.checked }) })));
    }, { wide: true });
    if (!res) return;
    this.sortRange(c.id, { ...g, r1: g.r1 + (res.head ? 1 : 0) }, levels);
  },

  /* ---------------------------------------------------------------- Daten: Datenüberprüfung */
  DV: [['any', 'Jeden Wert'], ['whole', 'Ganze Zahl'], ['decimal', 'Dezimal'], ['list', 'Liste'], ['date', 'Datum'], ['textLength', 'Textlänge']],
  OPS: [['between', 'zwischen'], ['notBetween', 'nicht zwischen'], ['equal', 'gleich'], ['notEqual', 'ungleich'], ['greaterThan', 'grösser als'], ['lessThan', 'kleiner als'], ['greaterThanOrEqual', 'grösser oder gleich'], ['lessThanOrEqual', 'kleiner oder gleich']],
  dvAt(d, c, r) { for (const v of d.dv || []) { const g = XL.parseRange(v.ref); if (g && this.hit(g, c, r)) return v; } return null; },
  async dvDialog() {
    const c = this.need(); if (!c || this.ro(c)) return;
    const { d, s } = c;
    const old = this.dvAt(d, c.a.c, c.a.r);
    const v = old ? { ...old, t: old.t || 'list' } : { t: 'list', op: 'between', drop: true };
    const res = await UI.dialog((dlg, close) => {
      dlg.classList.add('kt-saveas');
      dlg.append(el('h2', { text: 'Datenüberprüfung' }), el('p', { class: 'bs-note', text: 'Für ' + XL.rangeText(s.c1, s.r1, s.c2, s.r2) + ' – wie Excel: Eingaben ausserhalb der Regel werden abgelehnt.' }));
      const t = el('select', {}, ...this.DV.map(([k, l]) => el('option', { value: k, text: l }))); t.value = v.t;
      const op = el('select', {}, ...this.OPS.map(([k, l]) => el('option', { value: k, text: l }))); op.value = v.op || 'between';
      const a = el('input', { type: 'text', class: 'sa-name', value: v.a ?? '' }), b2 = el('input', { type: 'text', class: 'sa-name', value: v.b ?? '' });
      const src = el('input', { type: 'text', class: 'sa-name', value: v.src ? String(v.src).replace(/^"|"$/g, '').split(',').join(';') : '', placeholder: 'Ja;Nein;Vielleicht  oder  =$A$1:$A$5' });
      const drop = el('input', { type: 'checkbox' }); drop.checked = v.drop !== false;
      const err = el('input', { type: 'text', class: 'sa-name', value: v.err || '', placeholder: 'Fehlermeldung (leer = Standard)' });
      const rows = { op: el('label', { class: 'sa-row' }, el('span', { text: 'Daten' }), op), a: el('label', { class: 'sa-row' }, el('span', { text: 'Minimum' }), a), b: el('label', { class: 'sa-row' }, el('span', { text: 'Maximum' }), b2), src: el('label', { class: 'sa-row' }, el('span', { text: 'Quelle' }), src), drop: el('label', { class: 'ex-opt' }, drop, 'Zellendropdown') };
      const upd = () => { const T = t.value, two = /between/i.test(op.value); rows.op.hidden = /^(any|list)$/.test(T); rows.a.hidden = /^(any|list)$/.test(T); rows.b.hidden = rows.a.hidden || !two; rows.a.firstChild.textContent = two ? 'Minimum' : 'Wert'; rows.src.hidden = T !== 'list'; rows.drop.hidden = T !== 'list'; };
      t.addEventListener('change', upd); op.addEventListener('change', upd); upd();
      dlg.append(el('label', { class: 'sa-row' }, el('span', { text: 'Zulassen' }), t), rows.op, rows.a, rows.b, rows.src, rows.drop, el('label', { class: 'sa-row' }, el('span', { text: 'Meldung' }), err),
        el('div', { class: 'dlg-btns' }, old ? el('button', { class: 'btn', type: 'button', text: 'Alle löschen', onclick: () => close({ del: true }) }) : '', el('button', { class: 'btn', type: 'button', text: 'Abbrechen', onclick: () => close(null) }),
          el('button', { class: 'btn primary', type: 'button', text: 'OK', onclick: () => close({ t: t.value, op: op.value, a: a.value.trim(), b: b2.value.trim(), src: src.value.trim(), drop: drop.checked, err: err.value.trim() }) })));
    });
    if (!res) return;
    const g = { c1: s.c1, r1: s.r1, c2: s.c2, r2: s.r2 };
    // Regeln, die den Bereich schneiden: dort entfernen (Rest bleibt)
    d.dv = (d.dv || []).filter(x => { const q = XL.parseRange(x.ref); return !q || !this.overlap(q, g); });
    if (!res.del && res.t !== 'any') {
      const it = { ref: this.refOf(g), t: res.t };
      if (res.t === 'list') { if (!res.src) { UI.toast('Quelle fehlt'); return; } it.src = /^=/.test(res.src) ? res.src.slice(1) : '"' + res.src.split(/\s*[;,]\s*/).filter(Boolean).join(',') + '"'; it.drop = res.drop; }
      else { it.op = res.op; it.a = res.a; if (/between/i.test(res.op)) it.b = res.b; }
      if (res.err) it.err = res.err;
      d.dv.push(it);
    }
    if (!d.dv.length) delete d.dv;
    this.changed('Datenüberprüfung', true);
  },
  /* Eingabe prüfen (sheet.js commit) → Meldung oder null */
  validate(id, c, r, raw) {
    const d = Sheet.data(id); if (!d || !d.dv || raw === '') return null;
    const v = this.dvAt(d, c, r); if (!v) return null;
    const t = v.t || 'list';
    const msg = v.err || 'Dieser Wert entspricht nicht den Einschränkungen der Datenüberprüfung für diese Zelle.';
    if (t === 'list') { const b = Sheet.box(id); const list = Sheet.dvValues(b, v); return list.length && !list.some(x => x.toLowerCase() === String(raw).replace(/^'/, '').toLowerCase()) ? msg : null; }
    const pv = XL.parseInput(raw).v;
    const n = t === 'textLength' ? String(raw).replace(/^'/, '').length : typeof pv === 'number' ? pv : NaN;
    if (!isFinite(n)) return msg;
    if (t === 'whole' && Math.round(n) !== n) return msg;
    const num = (x) => { const q = XL.parseInput(String(x ?? '')).v; return typeof q === 'number' ? q : null; };
    const A = num(v.a), B = num(v.b);
    if (A == null) return null;   // Grenzen aus Formeln: hier nicht geprüft
    const ok = { between: B == null || (n >= A && n <= B), notBetween: B == null || n < A || n > B, equal: n === A, notEqual: n !== A, greaterThan: n > A, lessThan: n < A, greaterThanOrEqual: n >= A, lessThanOrEqual: n <= A }[v.op || 'between'];
    return ok === false ? msg : null;
  },

  /* ---------------------------------------------------------------- Was-wäre-wenn: Zielwertsuche */
  async goalSeek() {
    const c = this.need(); if (!c || this.ro(c)) return;
    const res = await UI.dialog((dlg, close) => {
      dlg.classList.add('kt-saveas');
      dlg.append(el('h2', { text: 'Zielwertsuche' }));
      const t = el('input', { type: 'text', class: 'sa-name', value: XL.key(c.a.c, c.a.r) }), v = el('input', { type: 'text', class: 'sa-name', value: '' }), x = el('input', { type: 'text', class: 'sa-name', value: '' });
      dlg.append(el('label', { class: 'sa-row' }, el('span', { text: 'Zielzelle' }), t), el('label', { class: 'sa-row' }, el('span', { text: 'Zielwert' }), v), el('label', { class: 'sa-row' }, el('span', { text: 'Veränderbare Zelle' }), x),
        el('p', { class: 'bs-note', text: 'Die Zielzelle muss eine Formel enthalten, die (auch über Umwege) von der veränderbaren Zelle abhängt.' }),
        el('div', { class: 'dlg-btns' }, el('button', { class: 'btn', type: 'button', text: 'Abbrechen', onclick: () => close(null) }), el('button', { class: 'btn primary', type: 'button', text: 'OK', onclick: () => close({ t: t.value, v: v.value, x: x.value }) })));
      setTimeout(() => v.focus(), 30);
    });
    if (!res) return;
    const T = XL.parseKey(res.t.trim().toUpperCase().replace(/\$/g, '')), X = XL.parseKey(res.x.trim().toUpperCase().replace(/\$/g, '')), goal = XL.parseInput(res.v).v;
    if (!T || !X || typeof goal !== 'number') { UI.toast('Bitte Zielzelle, Zielwert (Zahl) und veränderbare Zelle angeben'); return; }
    const out = this.solve(c.id, T, X, goal);
    if (!out) return;
    const ok = await UI.confirm('Status der Zielwertsuche', out.ok ? `Lösung gefunden: ${XL.key(X.c, X.r)} = ${XL.format(out.x, {}).t} ergibt ${XL.key(T.c, T.r)} = ${XL.format(out.y, {}).t}.` : `Keine genaue Lösung gefunden (bester Wert ${XL.format(out.x, {}).t} ergibt ${XL.format(out.y, {}).t}).`, { ok: 'Übernehmen' });
    if (ok) Sheet.setCells(c.id, [[X.c, X.r, String(Math.round(out.x * 1e10) / 1e10)]], 'Zielwertsuche');
  },
  solve(id, T, X, goal) {
    const d = Sheet.data(id);
    if (!XL.isFormula(Sheet.raw(d, T.c, T.r))) { UI.toast('Die Zielzelle muss eine Formel enthalten'); return null; }
    if (XL.isFormula(Sheet.raw(d, X.c, X.r))) { UI.toast('Die veränderbare Zelle muss einen Wert enthalten'); return null; }
    const raw0 = Sheet.raw(d, X.c, X.r);
    const f = (x) => { Sheet.writeRaw(d, X.c, X.r, String(x)); Sheet.markDirty(id, [[X.c, X.r]]); Sheet.refresh(); const y = Sheet.value(id, T.c, T.r); return typeof y === 'number' ? y - goal : NaN; };
    let x0 = typeof XL.parseInput(raw0).v === 'number' ? XL.parseInput(raw0).v : 0, x1 = x0 ? x0 * 1.01 + 0.01 : 1;
    let f0 = f(x0), f1 = f(x1), best = { x: x0, e: Math.abs(f0) };
    const tol = Math.max(1e-7, Math.abs(goal) * 1e-9);
    for (let i = 0; i < 100 && isFinite(f1) && Math.abs(f1) > tol; i++) {
      if (Math.abs(f1) < best.e) best = { x: x1, e: Math.abs(f1) };
      const den = f1 - f0;
      let x2 = den ? x1 - f1 * (x1 - x0) / den : x1 + 1;
      if (!isFinite(x2)) x2 = x1 * 2 + 1;
      x0 = x1; f0 = f1; x1 = x2; f1 = f(x1);
    }
    if (isFinite(f1) && Math.abs(f1) < best.e) best = { x: x1, e: Math.abs(f1) };
    f(best.x); const y = Sheet.value(id, T.c, T.r);
    Sheet.writeRaw(d, X.c, X.r, raw0); Sheet.markDirty(id, [[X.c, X.r]]); Sheet.refresh();
    return { x: best.x, y, ok: best.e <= Math.max(1e-6, Math.abs(goal) * 1e-6) };
  },

  /* ---------------------------------------------------------------- Überprüfen: Notizen */
  author() { return (Store.info && Store.info.author) || 'KnowledgeTree'; },
  async noteEdit() {
    const c = this.need(); if (!c) return;
    if (Sheet.locked(c.id)) { UI.toast('Das Blatt ist geschützt'); return; }
    const k = XL.key(c.a.c, c.a.r), old = c.d.notes && c.d.notes[k];
    const res = await UI.dialog((dlg, close) => {
      dlg.classList.add('kt-saveas');
      dlg.append(el('h2', { text: (old ? 'Notiz bearbeiten' : 'Neue Notiz') + ' – ' + k }));
      const ta = el('textarea', { class: 'xt-note', rows: 5, autofocus: true }); ta.value = old ? old.t : '';
      ta.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) close(ta.value); });
      dlg.append(ta, el('div', { class: 'dlg-btns' }, old ? el('button', { class: 'btn', type: 'button', text: 'Löschen', onclick: () => close('') }) : '', el('button', { class: 'btn', type: 'button', text: 'Abbrechen', onclick: () => close(null) }), el('button', { class: 'btn primary', type: 'button', text: 'OK', onclick: () => close(ta.value) })));
    });
    if (res == null) return;
    if (!res.trim()) { if (old) { delete c.d.notes[k]; if (!Object.keys(c.d.notes).length) delete c.d.notes; this.changed('Notiz gelöscht', true); } return; }
    (c.d.notes || (c.d.notes = {}))[k] = { t: res, a: old ? old.a : this.author() };
    this.changed(old ? 'Notiz bearbeitet' : 'Notiz eingefügt', true);
  },
  dropNotes() {
    const c = this.cur(); if (!c || !c.d.notes || Sheet.locked(c.id)) return false;
    let n = 0;
    for (const k of Object.keys(c.d.notes)) { const p = XL.parseKey(k); if (p && this.hit(c.s, p.c, p.r)) { delete c.d.notes[k]; n++; } }
    if (!Object.keys(c.d.notes).length) delete c.d.notes;
    if (n) Sheet._full = true;
    return n > 0;
  },
  noteDel() { if (this.dropNotes()) this.changed('Notiz gelöscht'); else UI.toast('Keine Notiz in der Auswahl'); },
  noteStep(dir) {
    const c = this.need(); if (!c || !c.d.notes) { UI.toast('Keine Notizen auf diesem Blatt'); return; }
    const ks = Object.keys(c.d.notes).map(k => XL.parseKey(k)).filter(Boolean).sort((a, b) => a.r - b.r || a.c - b.c);
    if (!ks.length) return;
    const a = c.a, after = (p) => p.r > a.r || (p.r === a.r && p.c > a.c), before = (p) => p.r < a.r || (p.r === a.r && p.c < a.c);
    const p = dir > 0 ? (ks.find(after) || ks[0]) : ([...ks].reverse().find(before) || ks[ks.length - 1]);
    Sheet.activate(c.id, p.c, p.r); Sheet.reveal();
  },
  notesAll() { Store.ui.xlNotesAll = !Store.ui.xlNotesAll; UiState.saveSoon(); const c = this.cur(); if (c) Sheet.update(c.b, Canvas.els.get(c.id), true); Ribbon.refresh(); },

  /* ---------------------------------------------------------------- Blatt schützen */
  legacyHash(pw) {
    let h = 0;
    for (let i = pw.length - 1; i >= 0; i--) { h = ((h >> 14) & 1) | ((h << 1) & 0x7fff); h ^= pw.charCodeAt(i); }
    h = ((h >> 14) & 1) | ((h << 1) & 0x7fff);
    return ((h ^ pw.length ^ 0xCE4B) & 0xffff).toString(16).toUpperCase().padStart(4, '0');
  },
  b64(u8) { let s = ''; for (const x of u8) s += String.fromCharCode(x); return btoa(s); },
  async shaHash(pw, salt, spin, alg = 'SHA-512') {
    const enc = new Uint8Array(pw.length * 2); for (let i = 0; i < pw.length; i++) { const c = pw.charCodeAt(i); enc[i * 2] = c & 255; enc[i * 2 + 1] = c >> 8; }
    const cat = (a, b) => { const o = new Uint8Array(a.length + b.length); o.set(a); o.set(b, a.length); return o; };
    let h = new Uint8Array(await crypto.subtle.digest(alg, cat(salt, enc)));
    const it = new Uint8Array(4);
    for (let i = 0; i < spin; i++) { it[0] = i & 255; it[1] = (i >> 8) & 255; it[2] = (i >> 16) & 255; it[3] = (i >>> 24) & 255; h = new Uint8Array(await crypto.subtle.digest(alg, cat(h, it))); }
    return this.b64(h);
  },
  async checkPw(p, pw) {
    if (p.legacy) return this.legacyHash(pw) === String(p.legacy).toUpperCase();
    if (p.hash) {
      const alg = { 'SHA-512': 'SHA-512', 'SHA-384': 'SHA-384', 'SHA-256': 'SHA-256', 'SHA-1': 'SHA-1' }[p.alg];
      if (!alg) return false;
      const salt = Uint8Array.from(atob(p.salt || ''), ch => ch.charCodeAt(0));
      return (await this.shaHash(pw, salt, +p.spin || 0, alg)) === p.hash;
    }
    return true;
  },
  async protect() {
    const c = this.need(); if (!c) return;
    const d = c.d;
    if (Store.readOnly || App.preview) return;
    if (d.prot && d.prot.on) {
      if (d.prot.legacy || d.prot.hash) {
        const pw = await UI.prompt('Blattschutz aufheben', '', { password: true, text: 'Kennwort:' });
        if (pw == null) return;
        UI.toast('Kennwort wird geprüft …', 1500);
        if (!await this.checkPw(d.prot, pw)) { UI.info('Blattschutz aufheben', '<p>Das Kennwort ist falsch.</p>'); return; }
      }
      d.prot = { on: false };
      return this.changed('Blattschutz aufgehoben', true);
    }
    const pw = await UI.prompt('Blatt schützen', '', { password: true, text: 'Kennwort zum Aufheben des Blattschutzes (optional). Gesperrte Zellen (Standard) lassen sich danach nicht ändern – Zellen mit „Format → Zelle sperren“ ausgeschaltet bleiben bearbeitbar.', ok: 'Schützen' });
    if (pw == null) return;
    if (pw) { const pw2 = await UI.prompt('Kennwort bestätigen', '', { password: true, text: 'Kennwort erneut eingeben:' }); if (pw2 !== pw) { UI.toast('Die Kennwörter stimmen nicht überein'); return; } }
    const prot = { on: true };
    if (pw) { const salt = crypto.getRandomValues(new Uint8Array(16)); prot.alg = 'SHA-512'; prot.salt = this.b64(salt); prot.spin = 100000; UI.toast('Kennwort wird verschlüsselt …', 1500); prot.hash = await this.shaHash(pw, salt, prot.spin); }
    d.prot = prot;
    if (Sheet.edit) Sheet.cancel();
    this.changed('Blatt geschützt', true);
  },
  /* geschütztes Blatt: nur entsperrte Zellen (f.ul) ändern */
  protLocked(id, c, r) { const d = Sheet.data(id); if (!d || !d.prot || !d.prot.on) return false; if (c == null) return true; const cell = d.cells[XL.key(c, r)]; return !(cell && cell.f && cell.f.ul); },

  /* ---------------------------------------------------------------- Seitenlayout */
  PAPERS: [[9, 'A4', '21 × 29,7 cm'], [8, 'A3', '29,7 × 42 cm'], [11, 'A5', '14,8 × 21 cm'], [1, 'Letter', '21,59 × 27,94 cm'], [5, 'Legal', '21,59 × 35,56 cm']],
  MARG: [['normal', 'Normal', [0.7, 0.7, 0.75, 0.75, 0.3, 0.3]], ['breit', 'Breit', [1, 1, 1, 1, 0.5, 0.5]], ['schmal', 'Schmal', [0.25, 0.25, 0.75, 0.75, 0.3, 0.3]]],
  ps(d) { return d.ps || (d.ps = {}); },
  setPs(fn, label) { const c = this.need(); if (!c || this.ro(c)) return; fn(this.ps(c.d), c); this.changed(label || 'Seite einrichten', true); },
  printArea(on) { this.setPs((ps, c) => { if (on) { const s = c.s; ps.pa = this.refOf(s); UI.toast('Druckbereich: ' + XL.rangeText(s.c1, s.r1, s.c2, s.r2)); } else delete ps.pa; }, on ? 'Druckbereich festgelegt' : 'Druckbereich aufgehoben'); },
  async printTitles() {
    const c = this.need(); if (!c || this.ro(c)) return;
    const ps = this.ps(c.d);
    const v = await UI.prompt('Drucktitel', ps.pt || (c.s.r1 + 1) + ':' + (c.s.r2 + 1), { text: 'Wiederholungszeilen oben auf jedem Blatt, z.B. 1:1 oder 1:2 (leer = keine)' });
    if (v == null) return;
    const m = /^\s*\$?(\d+)\s*:\s*\$?(\d+)\s*$/.exec(v);
    if (v.trim() && !m) { UI.toast('Bitte als Zeilen angeben, z.B. 1:1'); return; }
    this.setPs((p) => { if (m) p.pt = Math.min(+m[1], +m[2]) + ':' + Math.max(+m[1], +m[2]); else delete p.pt; }, 'Drucktitel');
  },
  HF: [['', '(keine)'], ['&A', 'Blattname'], ['&F', 'Dateiname'], ['Seite &P', 'Seite 1'], ['Seite &P von &N', 'Seite 1 von ?'], ['&D', 'Datum'], ['&A, Seite &P', 'Blattname, Seite 1']],
  async headerFooter() {
    const c = this.need(); if (!c || this.ro(c)) return;
    const hf = this.ps(c.d).hf || { h: { l: '', c: '', r: '' }, f: { l: '', c: '', r: '' } };
    const res = await UI.dialog((dlg, close) => {
      dlg.classList.add('kt-saveas');
      dlg.append(el('h2', { text: 'Kopf- und Fusszeile' }), el('p', { class: 'bs-note', text: 'Platzhalter wie Excel: &P = Seite, &N = Anzahl Seiten, &D = Datum, &A = Blattname, &F = Dateiname' }));
      const part = (k, label) => {
        const ins = ['l', 'c', 'r'].map(s => { const i = el('input', { type: 'text', class: 'sa-name', value: (hf[k] && hf[k][s]) || '', placeholder: { l: 'links', c: 'Mitte', r: 'rechts' }[s] }); i.dataset.s = s; return i; });
        const pre = el('select', {}, ...this.HF.map(([v, l]) => el('option', { value: v, text: l }))); pre.addEventListener('change', () => { ins[1].value = pre.value; });
        return [el('div', { class: 'oio-sub', text: label }), el('label', { class: 'sa-row' }, el('span', { text: 'Vorlage' }), pre), el('div', { class: 'xt-hf' }, ...ins), ins];
      };
      const H = part('h', 'Kopfzeile'), F = part('f', 'Fusszeile');
      dlg.append(...H.slice(0, 3), ...F.slice(0, 3), el('div', { class: 'dlg-btns' }, el('button', { class: 'btn', type: 'button', text: 'Abbrechen', onclick: () => close(null) }),
        el('button', { class: 'btn primary', type: 'button', text: 'OK', onclick: () => close({ h: Object.fromEntries(H[3].map(i => [i.dataset.s, i.value])), f: Object.fromEntries(F[3].map(i => [i.dataset.s, i.value])) }) })));
    }, { wide: true });
    if (!res) return;
    this.setPs((p) => { if ([...Object.values(res.h), ...Object.values(res.f)].some(Boolean)) p.hf = res; else delete p.hf; }, 'Kopf- und Fusszeile');
  },
  pageBreaks() { Store.ui.xlBreaks = !Store.ui.xlBreaks; UiState.saveSoon(); if (typeof OfficeUI !== 'undefined') OfficeUI.refreshViews(); const c = this.cur(); const p = OfficeGrid.page(); if (p) for (const b of OfficeView.sheets(p)) { const e = Canvas.els.get(b.id); if (e) this.decor(b, e); } void c; Ribbon.refresh(); },
  /* Druckbereich (oder benutzter Bereich) ohne ausgeblendete Zeilen/Spalten */
  printRange(b) {
    const d = b.sheet, ps = d.ps || {};
    const g = ps.pa && XL.parseRange(ps.pa);
    if (g) return g;
    let c2 = 0, r2 = 0;
    for (const [k, x] of Object.entries(d.cells)) if ((x.v !== '' && x.v != null) || (x.f && (x.f.bg || x.f.bd))) { const p = XL.parseKey(k); if (p) { c2 = Math.max(c2, p.c); r2 = Math.max(r2, p.r); } }
    for (const m of d.merges || []) { const q = XL.parseRange(m); if (q) { c2 = Math.max(c2, q.c2); r2 = Math.max(r2, q.r2); } }
    return { c1: 0, r1: 0, c2, r2 };
  },
  /* Seitenumbrüche (gestrichelt) aus Papier, Ausrichtung, Rändern und Massstab */
  breaks(b) {
    const d = b.sheet, ps = d.ps || {};
    const pap = { 9: [210, 297], 8: [297, 420], 11: [148, 210], 1: [216, 279], 5: [216, 356] }[ps.paper || 9] || [210, 297];
    const [W, H] = ps.or === 'landscape' ? [pap[1], pap[0]] : pap;
    const m = ps.m || this.MARG[0][2], PX = 96 / 25.4, IN = 25.4;
    let z = (ps.scale || 100) / 100;
    const g = this.printRange(b);
    const hc = new Set(d.hideC || []), hr = this.hiddenRows(d);
    const cw = (cc) => hc.has(cc) ? 0 : d.cols[cc] || 64, rh = (r) => hr.has(r) ? 0 : (d.rowh && d.rowh[r]) || (d.xl && d.xl.rh) || 20;
    const availW = (W - (m[0] + m[1]) * IN) * PX, availH = (H - (m[2] + m[3]) * IN) * PX;
    if (ps.fit) { let tw = 0, th = 0; for (let cc = g.c1; cc <= g.c2; cc++) tw += cw(cc); for (let r = g.r1; r <= g.r2; r++) th += rh(r); z = Math.min(ps.fit.w ? availW * ps.fit.w / tw : 9, ps.fit.h ? availH * ps.fit.h / th : 9, 1); }
    const cols = [], rows = [];
    let acc = 0; for (let cc = g.c1; cc <= g.c2; cc++) { const w = cw(cc) * z; if (acc + w > availW && acc > 0) { cols.push(cc); acc = 0; } acc += w; }
    acc = 0; for (let r = g.r1; r <= g.r2; r++) { const h = rh(r) * z; if (acc + h > availH && acc > 0) { rows.push(r); acc = 0; } acc += h; }
    return { g, cols, rows, pages: (cols.length + 1) * (rows.length + 1) };
  },

  /* ---------------------------------------------------------------- Darstellung: Notizen, Filterknöpfe, Seitenumbrüche */
  decor(b, e) {
    const d = b.sheet, wrap = e && e.querySelector('.xl-wrap');
    if (!wrap) return;
    let L = wrap.querySelector('.xl-dec');
    const want = this.on(b.id) && (d.notes || d.af || Store.ui.xlBreaks || d.prot);
    if (!want) { if (L) L.remove(); return; }
    if (!L) { L = el('div', { class: 'xl-dec' }); wrap.querySelector('.xl-ov').before(L); }
    const C = e._cols || [], R = e._rows || [];
    const fz = d.freeze ? (c, r) => (r < d.freeze.r ? ' xl-fzr' : '') + (c < d.freeze.c ? ' xl-fzc' : '') : () => '';
    let h = '';
    for (const [k, n] of Object.entries(d.notes || {})) {
      const p = XL.parseKey(k); if (!p || !C[p.c] || !R[p.r] || !C[p.c][1] || !R[p.r][1]) continue;
      const x = C[p.c][0] + C[p.c][1], y = R[p.r][0];
      h += `<i class="xl-note${fz(p.c, p.r)}" style="left:${x - 7}px;top:${y}px" title="${escapeHtml((n.a ? n.a + ':\n' : '') + n.t)}"></i>`;
      if (Store.ui.xlNotesAll) h += `<div class="xl-nbox${fz(p.c, p.r)}" style="left:${x + 8}px;top:${y}px">${n.a ? `<b>${escapeHtml(n.a)}:</b><br>` : ''}${escapeHtml(n.t).replace(/\n/g, '<br>')}</div>`;
    }
    const g = d.af && XL.parseRange(d.af.ref);
    if (g && R[g.r1]) for (let c = g.c1; c <= g.c2 && c < C.length; c++) {
      if (!C[c][1]) continue;
      const on = d.af.f && d.af.f[c];
      h += `<button type="button" class="xl-afb${on ? ' on' : ''}${fz(c, g.r1)}" data-c="${c}" title="${on ? 'Gefiltert – ' : ''}Filter und Sortieren" style="left:${C[c][0] + C[c][1] - 18}px;top:${R[g.r1][0] + R[g.r1][1] - 18}px">${icon(on ? 'filter' : 'chevDown', 11)}</button>`;
    }
    if (Store.ui.xlBreaks && C.length && R.length) {
      const bk = this.breaks(b), W = C[Math.min(bk.g.c2, C.length - 1)], H = R[Math.min(bk.g.r2, R.length - 1)];
      const x1 = C[bk.g.c1][0], y1 = R[bk.g.r1][0], x2 = W[0] + W[1], y2 = H[0] + H[1];
      h += `<div class="xl-pa" style="left:${x1}px;top:${y1}px;width:${x2 - x1}px;height:${y2 - y1}px"></div>`;
      for (const c of bk.cols) if (C[c]) h += `<div class="xl-pb v" style="left:${C[c][0]}px;top:${y1}px;height:${y2 - y1}px"></div>`;
      for (const r of bk.rows) if (R[r]) h += `<div class="xl-pb" style="top:${R[r][0]}px;left:${x1}px;width:${x2 - x1}px"></div>`;
    }
    L.innerHTML = h;
  },
  /* aktive Zelle: Notiz daneben, Spuren (sheet.js overlay) */
  overlayHtml(b, e, a) {
    let h = '';
    const d = b.sheet;
    if (a && d.notes && !Store.ui.xlNotesAll && !Sheet.edit) {
      const n = d.notes[XL.key(a.c, a.r)], r = n && Sheet.rectOf(e, a.c, a.r);
      if (r) h += `<div class="xl-nbox" style="left:${r.x + r.w + 8}px;top:${r.y - e._gy}px">${n.a ? `<b>${escapeHtml(n.a)}:</b><br>` : ''}${escapeHtml(n.t).replace(/\n/g, '<br>')}</div>`;
    }
    const t = this._trace;
    if (t && t.id === b.id) for (const g of t.list) { const r = Sheet.rectOf(e, g.c1, g.r1, g.c2, g.r2); if (r) h += `<div class="xl-trace" style="left:${r.x}px;top:${r.y - e._gy}px;width:${r.w}px;height:${r.h}px"></div>`; }
    if (d.prot && d.prot.on && a) h += '';
    return h;
  },
  /* Kontextmenü der Zellen (sheet.js) */
  ctxItems(kind) {
    const c = this.cur(); if (!c) return [];
    const ro = Sheet.locked(c.id), note = c.d.notes && c.d.notes[XL.key(c.a.c, c.a.r)];
    const out = ['-', { label: note ? 'Notiz bearbeiten …' : 'Neue Notiz …', icon: 'notes', disabled: ro, action: () => this.noteEdit() }];
    if (note) out.push({ label: 'Notiz löschen', icon: 'trash', disabled: ro, action: () => this.noteDel() });
    out.push({ label: 'Zellen formatieren …', icon: 'settings', key: 'Strg+1', disabled: ro, action: () => this.formatDialog() });
    if (kind === 'row') out.push({ label: 'Zeilenhöhe …', disabled: ro, action: () => this.rowHeight() }, { label: 'Ausblenden', disabled: ro, action: () => this.hide('r', true) }, { label: 'Einblenden', disabled: ro, action: () => this.hide('r', false) });
    if (kind === 'col') out.push({ label: 'Spaltenbreite …', disabled: ro, action: () => this.colWidth() }, { label: 'Ausblenden', disabled: ro, action: () => this.hide('c', true) }, { label: 'Einblenden', disabled: ro, action: () => this.hide('c', false) });
    if (!kind) out.push({ label: 'Zellen verbinden', icon: 'merge', disabled: ro, action: () => this.merge('merge') }, { label: 'Zellverbund aufheben', disabled: ro || !(c.d.merges || []).length, action: () => this.merge('unmerge') });
    return out;
  },
  /* Tasten (sheet.js onKey): Strg+1, Strg+9/0, Umsch+F2 → true = erledigt */
  key(e) {
    const k = e.key, mod = e.ctrlKey || e.metaKey;
    if (!this.cur()) return false;
    if (mod && !e.shiftKey && k === '1') { this.formatDialog(); return true; }
    if (mod && !e.shiftKey && k === '9') { this.hide('r', true); return true; }
    if (mod && !e.shiftKey && k === '0') { this.hide('c', true); return true; }
    if (mod && e.shiftKey && (k === '(' || k === '9')) { this.hide('r', false); return true; }
    if (e.shiftKey && !mod && k === 'F2') { this.noteEdit(); return true; }
    if (mod && !e.shiftKey && (k === '`' || k === '´')) { this.showFormulas(); return true; }
    if (mod && e.shiftKey && (k === 'L' || k === 'l')) { this.filterToggle(); return true; }
    if (!mod && k === 'F5') { this.goTo(); return true; }
    if (mod && !e.shiftKey && (k === 'h' || k === 'H')) { this.findDialog(true); return true; }
    return false;
  },

  /* ================================================================ Datei: lesen und schreiben (office-xl.js) */
  /* Teile, die sich unabhängig ändern können – je Teil ein Schlüssel (geschrieben wird nur, was sich geändert hat) */
  layoutKeys(d) {
    const cw = d.xl ? d.xl.cw : 64;
    return {
      cols: JSON.stringify([Object.fromEntries((d.cols || []).map((w, i) => [i, Math.round(w)]).filter(([, w]) => Math.abs(w - cw) > 1)), d.hideC || [], cw]),   // nur abweichende Breiten (das Raster wächst beim Scrollen)
      rows: JSON.stringify([d.rowh || {}, [...this.hiddenRows(d)].sort((a, b) => a - b)]),
      merges: JSON.stringify(d.merges || []),
      dv: JSON.stringify((d.dv || []).map(v => ({ ...v, x: undefined }))),
      af: JSON.stringify(d.af || null),
      notes: JSON.stringify(d.notes || null),
      ps: JSON.stringify(d.ps || null),
      prot: JSON.stringify(d.prot || null),
    };
  },
  ORDER: ['sheetPr', 'dimension', 'sheetViews', 'sheetFormatPr', 'cols', 'sheetData', 'sheetCalcPr', 'sheetProtection', 'protectedRanges', 'scenarios', 'autoFilter', 'sortState', 'dataConsolidate', 'customSheetViews', 'mergeCells', 'phoneticPr', 'conditionalFormatting', 'dataValidations', 'hyperlinks', 'printOptions', 'pageMargins', 'pageSetup', 'headerFooter', 'rowBreaks', 'colBreaks', 'customProperties', 'cellWatches', 'ignoredErrors', 'smartTags', 'drawing', 'legacyDrawing', 'legacyDrawingHF', 'picture', 'oleObjects', 'controls', 'webPublishItems', 'tableParts', 'extLst'],
  /* Element an seinen Platz laut Schema (ersetzt ein vorhandenes gleichen Namens) */
  put(doc, e, name) {
    const X = OfficePages, root = doc.documentElement, S = this.S;
    for (const old of X.kids(root, S, name)) old.remove();
    if (!e) return;
    const i = this.ORDER.indexOf(name);
    const after = this.ORDER.slice(i + 1).map(n => X.kid(root, S, n)).find(Boolean);
    if (after) after.before(e); else root.append(e);
  },
  /* ---- lesen: ergänzt OfficeXl.read (dd = Blatt, d = XML des Blatts, part = Pfad) */
  async read(pkg, d, dd, part, sheetIdx, wb) {
    const X = OfficePages, S = this.S, R = Ooxml.NS.r;
    const root = d.documentElement;
    // Datenüberprüfung: alle Arten (1.71 las nur Listen)
    const dv = [];
    for (const v of X.q(d, S, 'dataValidation')) {
      const t = v.getAttribute('type') || 'any';
      const f1 = X.kid(v, S, 'formula1'), f2 = X.kid(v, S, 'formula2');
      const xml = new XMLSerializer().serializeToString(v);
      const refs = (v.getAttribute('sqref') || '').split(/\s+/).filter(Boolean);
      for (const ref of refs) {
        if (t === 'list') { const src = f1 ? f1.textContent.trim() : ''; if (src) dv.push({ ref, t, src, drop: v.getAttribute('showDropDown') !== '1', x: xml, n: refs.length }); continue; }
        dv.push({ ref, t, op: v.getAttribute('operator') || 'between', a: f1 ? f1.textContent : '', ...(f2 ? { b: f2.textContent } : {}), ...(v.getAttribute('error') ? { err: v.getAttribute('error') } : {}), x: xml, n: refs.length });
      }
    }
    // x14-Listen (Quelle auf anderem Blatt): wie 1.71 aus dd.dv übernehmen
    for (const v of dd.dv || []) if (!dv.some(w => w.ref === v.ref)) dv.push({ ...v, t: 'list', ext: true });
    if (dv.length) dd.dv = dv; else delete dd.dv;
    // AutoFilter
    const af = X.kid(root, S, 'autoFilter');
    if (af && XL.parseRange(af.getAttribute('ref') || '')) {
      const g = XL.parseRange(af.getAttribute('ref'));
      const f = {};
      for (const fc of X.kids(af, S, 'filterColumn')) {
        const col = g.c1 + (+fc.getAttribute('colId') || 0);
        const fs = X.kid(fc, S, 'filters'), cf = X.q(fc, S, 'customFilter')[0];
        if (fs) { const vals = X.kids(fs, S, 'filter').map(x => x.getAttribute('val') || ''); if (fs.getAttribute('blank') === '1') vals.push(''); f[col] = { vals }; }
        else if (cf && /^\*.*\*$/.test(cf.getAttribute('val') || '')) f[col] = { has: cf.getAttribute('val').slice(1, -1) };
        else f[col] = { raw: true };
      }
      dd.af = { ref: this.refOf(g), f };
      if (Object.keys(f).length && dd.hideR) { const inR = dd.hideR.filter(r => r > g.r1 && r <= g.r2); if (inR.length) { dd.hideF = inR; dd.hideR = dd.hideR.filter(r => !inR.includes(r)); if (!dd.hideR.length) delete dd.hideR; } }
      dd.afx = new XMLSerializer().serializeToString(af);
    }
    // Notizen (Kommentare)
    const rels = await pkg.rels(part);
    const cr = rels.find(r => /\/comments$/.test(r.type) && pkg.has(r.path));
    if (cr) {
      const cd = await pkg.xml(cr.path);
      const authors = X.q(cd, S, 'author').map(a => a.textContent);
      const notes = {};
      for (const cm of X.q(cd, S, 'comment')) {
        const ref = cm.getAttribute('ref'); if (!ref || !XL.parseKey(ref)) continue;
        const t = X.q(cm, S, 't').map(x => x.textContent).join('');
        const a = authors[+cm.getAttribute('authorId') || 0] || '';
        notes[ref] = { t: a && t.startsWith(a + ':') ? t.slice(a.length + 1).replace(/^\s*\n?/, '') : t, a };
      }
      if (Object.keys(notes).length) dd.notes = notes;
    }
    // Seite einrichten
    const ps = {};
    const pm = X.kid(root, S, 'pageMargins');
    if (pm) ps.m = ['left', 'right', 'top', 'bottom', 'header', 'footer'].map(k => +pm.getAttribute(k) || 0);
    const su = X.kid(root, S, 'pageSetup');
    if (su) {
      if (su.getAttribute('orientation') === 'landscape') ps.or = 'landscape';
      if (+su.getAttribute('paperSize')) ps.paper = +su.getAttribute('paperSize');
      if (+su.getAttribute('scale') && +su.getAttribute('scale') !== 100) ps.scale = +su.getAttribute('scale');
    }
    const spr = X.kid(root, S, 'sheetPr'), fp = spr && X.kid(spr, S, 'pageSetUpPr');
    if (fp && fp.getAttribute('fitToPage') === '1') ps.fit = { w: su && su.hasAttribute('fitToWidth') ? +su.getAttribute('fitToWidth') : 1, h: su && su.hasAttribute('fitToHeight') ? +su.getAttribute('fitToHeight') : 1 };
    const po = X.kid(root, S, 'printOptions');
    if (po) { if (po.getAttribute('gridLines') === '1' || po.getAttribute('gridLines') === 'true') ps.pg = true; if (po.getAttribute('headings') === '1' || po.getAttribute('headings') === 'true') ps.ph = true; }
    const hfe = X.kid(root, S, 'headerFooter');
    if (hfe) {
      const sec = (s) => { const o = { l: '', c: '', r: '' }; let cur = 'c'; for (const m of String(s || '').split(/(&[LCR])/)) { if (/^&[LCR]$/.test(m)) cur = m[1].toLowerCase(); else o[cur] += m; } return o; };
      const oh = X.kid(hfe, S, 'oddHeader'), of = X.kid(hfe, S, 'oddFooter');
      if ((oh && oh.textContent) || (of && of.textContent)) ps.hf = { h: sec(oh && oh.textContent), f: sec(of && of.textContent) };
    }
    // Druckbereich und Drucktitel (Namen der Mappe für dieses Blatt)
    for (const dn of X.q(wb, S, 'definedName')) {
      if (dn.getAttribute('localSheetId') !== String(sheetIdx)) continue;
      const nm = dn.getAttribute('name'), v = dn.textContent.replace(/^.*!/, '').replace(/\$/g, '');
      if (nm === '_xlnm.Print_Area' && XL.parseRange(v.split(',')[0])) ps.pa = this.refOf(XL.parseRange(v.split(',')[0]));
      if (nm === '_xlnm.Print_Titles') { const m = /\$?(\d+):\$?(\d+)/.exec(dn.textContent); if (m) ps.pt = m[1] + ':' + m[2]; }
    }
    if (Object.keys(ps).length) dd.ps = ps;
    // Blattschutz
    const sp = X.kid(root, S, 'sheetProtection');
    if (sp && /^(1|true)$/.test(sp.getAttribute('sheet') || '')) {
      dd.prot = { on: true, raw: new XMLSerializer().serializeToString(sp) };
      if (sp.getAttribute('password')) dd.prot.legacy = sp.getAttribute('password');
      if (sp.getAttribute('hashValue')) Object.assign(dd.prot, { alg: sp.getAttribute('algorithmName'), hash: sp.getAttribute('hashValue'), salt: sp.getAttribute('saltValue'), spin: +sp.getAttribute('spinCount') || 0 });
    }
    // Formeln anzeigen
    const sv = X.q(d, S, 'sheetView')[0];
    if (sv && /^(1|true)$/.test(sv.getAttribute('showFormulas') || '')) dd.showF = true;
    void R;
  },
  /* ---- schreiben: geänderte Teile eines Blatts */
  async write(pkg, doc, b, part, k0, k1) {
    const X = OfficePages, S = this.S, d = b.sheet, root = doc.documentElement;
    const xml = (s) => X.xml(doc, S, s)[0];
    if (k0.cols !== k1.cols) {
      // Spalten: vorhandene <col>-Bereiche je Spalte auflösen, Breite/ausgeblendet ändern, gleiche wieder zusammenfassen
      const per = new Map();
      for (const co of X.q(doc, S, 'col')) { const a = +co.getAttribute('min'), z = +co.getAttribute('max'); for (let i = a; i <= Math.min(z, Math.max(a, d.ncols + 1)); i++) per.set(i, Object.fromEntries([...co.attributes].map(x => [x.name, x.value]))); if (z > d.ncols + 1) per.set('rest:' + a, { ...Object.fromEntries([...co.attributes].map(x => [x.name, x.value])), min: String(Math.max(a, d.ncols + 2)) }); }
      const old = JSON.parse(k0.cols), hc = new Set(d.hideC || []), cw = d.xl ? d.xl.cw : 64;
      for (let c = 0; c < d.ncols; c++) {
        const w = Math.round(d.cols[c]), w0 = old[0][c] != null ? old[0][c] : old[2], hid = hc.has(c), hid0 = old[1].includes(c);
        if (w === w0 && hid === hid0 && cw === old[2]) continue;
        const a = per.get(c + 1) ? { ...per.get(c + 1) } : { min: String(c + 1), max: String(c + 1) };
        a.min = a.max = String(c + 1);
        if (Math.abs(w - cw) > 1 || a.width) { a.width = String(Math.round((w - 5) / 7 * 256) / 256); a.customWidth = '1'; }
        if (hid) a.hidden = '1'; else delete a.hidden;
        if (!hid && Math.abs(w - cw) <= 1 && !a.style) { per.delete(c + 1); continue; }
        per.set(c + 1, a);
      }
      const list = [...per.entries()].filter(([k]) => typeof k === 'number').sort((x, y) => x[0] - y[0]);
      const out = [];
      for (const [i, a] of list) {
        const last = out[out.length - 1], sig = JSON.stringify({ ...a, min: 0, max: 0 });
        if (last && +last.a.max === i - 1 && last.sig === sig) last.a.max = String(i); else out.push({ a: { ...a, min: String(i), max: String(i) }, sig });
      }
      for (const [k, a] of per) if (typeof k === 'string') out.push({ a });
      const cols = out.length ? xml('<cols/>') : null;
      for (const { a } of out) { const e = X.mk(doc, S, 'col'); for (const [n, v] of Object.entries(a)) e.setAttribute(n, v); cols.append(e); }
      this.put(doc, cols, 'cols');
      const fp = X.kid(root, S, 'sheetFormatPr');
      if (fp && cw !== old[2]) fp.setAttribute('defaultColWidth', String(Math.round((cw - 5) / 7 * 100) / 100));
    }
    if (k0.rows !== k1.rows) {
      const [rh0, hr0] = JSON.parse(k0.rows), hr = this.hiddenRows(d), H0 = new Set(hr0);
      const sd = X.q(doc, S, 'sheetData')[0];
      const rows = new Map(X.kids(sd, S, 'row').map(r => [+r.getAttribute('r'), r]));
      const touch = new Set([...Object.keys(rh0), ...Object.keys(d.rowh || {})].map(Number).filter(r => (rh0[r] || 0) !== ((d.rowh || {})[r] || 0)));
      for (const r of new Set([...hr0, ...hr])) if (H0.has(r) !== hr.has(r)) touch.add(r);
      for (const r of touch) {
        let row = rows.get(r + 1);
        const want = (d.rowh || {})[r], hid = hr.has(r);
        if (!row) { if (!want && !hid) continue; row = X.mk(doc, S, 'row', { r: String(r + 1) }); const after = [...rows.keys()].filter(x => x > r + 1).sort((a, b) => a - b)[0]; if (after != null) rows.get(after).before(row); else sd.append(row); rows.set(r + 1, row); }
        if (want) { row.setAttribute('ht', String(this.pt(want))); row.setAttribute('customHeight', '1'); } else { row.removeAttribute('ht'); row.removeAttribute('customHeight'); }
        if (hid) row.setAttribute('hidden', '1'); else row.removeAttribute('hidden');
      }
    }
    if (k0.merges !== k1.merges) this.put(doc, d.merges && d.merges.length ? xml(`<mergeCells count="${d.merges.length}">${d.merges.map(m => `<mergeCell ref="${Ooxml.esc(m)}"/>`).join('')}</mergeCells>`) : null, 'mergeCells');
    if (k0.dv !== k1.dv) {
      const seen = new Set(), parts = [];
      for (const v of d.dv || []) {
        if (v.ext) continue;   // x14-Erweiterung: bleibt im extLst
        if (v.x && v.n === 1) { if (!seen.has(v.x)) { seen.add(v.x); parts.push(v.x); } continue; }
        if (v.x && v.n > 1 && (d.dv || []).filter(w => w.x === v.x).length === v.n) { if (!seen.has(v.x)) { seen.add(v.x); parts.push(v.x); } continue; }
        const t = v.t || 'list';
        const err = v.err ? ` errorTitle="KnowledgeTree" error="${Ooxml.esc(v.err)}"` : '';
        if (t === 'list') parts.push(`<dataValidation type="list" allowBlank="1" showInputMessage="1" showErrorMessage="1"${v.drop === false ? ' showDropDown="1"' : ''}${err} sqref="${Ooxml.esc(v.ref)}"><formula1>${Ooxml.esc(v.src)}</formula1></dataValidation>`);
        else parts.push(`<dataValidation type="${t}" operator="${v.op || 'between'}" allowBlank="1" showInputMessage="1" showErrorMessage="1"${err} sqref="${Ooxml.esc(v.ref)}"><formula1>${Ooxml.esc(v.a ?? '')}</formula1>${/between/i.test(v.op || 'between') ? `<formula2>${Ooxml.esc(v.b ?? '')}</formula2>` : ''}</dataValidation>`);
      }
      let e = null;
      if (parts.length) {
        e = xml(`<dataValidations count="${parts.length}"/>`);
        for (const p of parts) {
          const w = new DOMParser().parseFromString(`<w xmlns="${S}">${p}</w>`, 'application/xml');
          if (w.getElementsByTagName('parsererror').length) throw new Error('Datenüberprüfung: ungültiges XML');
          e.append(doc.importNode(w.documentElement.firstElementChild, true));
        }
      }
      this.put(doc, e, 'dataValidations');
    }
    if (k0.af !== k1.af) {
      let e = null;
      if (d.af) {
        const g = XL.parseRange(d.af.ref);
        let s = `<autoFilter ref="${Ooxml.esc(d.af.ref)}">`;
        for (const [c, f] of Object.entries(d.af.f || {}).sort((a, b) => a[0] - b[0])) {
          if (f.raw) continue;
          if (f.vals) s += `<filterColumn colId="${+c - g.c1}"><filters${f.vals.includes('') ? ' blank="1"' : ''}>${f.vals.filter(v => v !== '').map(v => `<filter val="${Ooxml.esc(v)}"/>`).join('')}</filters></filterColumn>`;
          else if (f.has != null) s += `<filterColumn colId="${+c - g.c1}"><customFilters><customFilter val="*${Ooxml.esc(f.has)}*"/></customFilters></filterColumn>`;
        }
        e = xml(s + '</autoFilter>');
        // unveränderte, nicht lesbare Filter (Farbe, Top 10 …) aus der Datei behalten
        if (d.afx && Object.values(d.af.f || {}).some(f => f.raw)) { const o = new DOMParser().parseFromString(d.afx, 'application/xml').documentElement; e = doc.importNode(o, true); e.setAttribute('ref', d.af.ref); }
      }
      this.put(doc, e, 'autoFilter');
    }
    if (k0.ps !== k1.ps) {
      const ps = d.ps || {};
      const m = ps.m || (X.kid(root, S, 'pageMargins') ? null : this.MARG[0][2]);
      if (m) this.put(doc, xml(`<pageMargins left="${m[0]}" right="${m[1]}" top="${m[2]}" bottom="${m[3]}" header="${m[4]}" footer="${m[5]}"/>`), 'pageMargins');
      let su = X.kid(root, S, 'pageSetup');
      if (!su) { su = xml('<pageSetup/>'); this.put(doc, su, 'pageSetup'); }
      if (ps.paper) su.setAttribute('paperSize', String(ps.paper)); else su.removeAttribute('paperSize');
      su.setAttribute('orientation', ps.or === 'landscape' ? 'landscape' : 'portrait');
      if (ps.scale && ps.scale !== 100) su.setAttribute('scale', String(ps.scale)); else su.removeAttribute('scale');
      if (ps.fit) { su.setAttribute('fitToWidth', String(ps.fit.w || 0)); su.setAttribute('fitToHeight', String(ps.fit.h || 0)); } else { su.removeAttribute('fitToWidth'); su.removeAttribute('fitToHeight'); }
      let spr = X.kid(root, S, 'sheetPr');
      if (ps.fit || spr) {
        if (!spr) { spr = xml('<sheetPr/>'); root.prepend(spr); }
        let fp = X.kid(spr, S, 'pageSetUpPr');
        if (ps.fit) { if (!fp) { fp = xml('<pageSetUpPr/>'); const ol = X.kid(spr, S, 'outlinePr') || X.kid(spr, S, 'tabColor'); if (ol) ol.after(fp); else spr.prepend(fp); } fp.setAttribute('fitToPage', '1'); }
        else if (fp) { fp.removeAttribute('fitToPage'); if (!fp.attributes.length) fp.remove(); }
      }
      this.put(doc, ps.pg || ps.ph ? xml(`<printOptions${ps.pg ? ' gridLines="1"' : ''}${ps.ph ? ' headings="1"' : ''}/>`) : null, 'printOptions');
      const sec = (o) => o ? ['l', 'c', 'r'].filter(s => o[s]).map(s => '&' + s.toUpperCase() + o[s]).join('') : '';
      const oh = ps.hf && sec(ps.hf.h), of = ps.hf && sec(ps.hf.f);
      const oldHf = X.kid(root, S, 'headerFooter');
      if (oh || of || oldHf) {
        const e = xml('<headerFooter/>');
        if (oh) { const x = xml('<oddHeader/>'); x.textContent = oh; e.append(x); }
        if (of) { const x = xml('<oddFooter/>'); x.textContent = of; e.append(x); }
        this.put(doc, oh || of ? e : null, 'headerFooter');
      }
    }
    if (k0.prot !== k1.prot) {
      const p = d.prot;
      if (!p || !p.on) this.put(doc, null, 'sheetProtection');
      else if (p.raw) { const o = new DOMParser().parseFromString(p.raw, 'application/xml').documentElement; this.put(doc, doc.importNode(o, true), 'sheetProtection'); }
      else this.put(doc, xml(`<sheetProtection${p.hash ? ` algorithmName="${p.alg}" hashValue="${p.hash}" saltValue="${p.salt}" spinCount="${p.spin}"` : ''} sheet="1" objects="1" scenarios="1"/>`), 'sheetProtection');
    }
    if (k0.notes !== k1.notes) await this.writeNotes(pkg, doc, d, part);
  },
  /* Notizen: Kommentar-Teil (Text) + VML-Zeichnung (Kästchen, sonst zeigt Excel sie nicht) */
  async writeNotes(pkg, doc, d, part) {
    const X = OfficePages, S = this.S, R = Ooxml.NS.r, root = doc.documentElement;
    const notes = Object.entries(d.notes || {}).filter(([k]) => XL.parseKey(k)).sort((a, b) => { const p = XL.parseKey(a[0]), q = XL.parseKey(b[0]); return p.r - q.r || p.c - q.c; });
    const rels = await pkg.rels(part);
    const dir = part.replace(/[^/]+$/, ''), base = dir.replace(/worksheets\/$/, '');
    // verknüpfte (neue) Kommentare von Excel 365: passen danach nicht mehr – entfernen, die Notizen bleiben
    for (const r of rels.filter(x => /threadedComment/.test(x.type))) { await pkg.removeRel(part, r.id); if (pkg.has(r.path)) await pkg.removePart(r.path); }
    let cr = rels.find(r => /\/comments$/.test(r.type));
    if (!notes.length) { if (cr) { await pkg.removeRel(part, cr.id); if (pkg.has(cr.path)) await pkg.removePart(cr.path); } }
    else {
      const authors = [...new Set(notes.map(([, n]) => n.a || ''))];
      const cx = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n<comments xmlns="${S}"><authors>${authors.map(a => `<author>${Ooxml.esc(a)}</author>`).join('')}</authors><commentList>` +
        notes.map(([k, n]) => `<comment ref="${k}" authorId="${authors.indexOf(n.a || '')}"><text>${n.a ? `<r><rPr><b/><sz val="9"/><color indexed="81"/><rFont val="Tahoma"/><family val="2"/></rPr><t xml:space="preserve">${Ooxml.esc(n.a)}:</t></r>` : ''}<r><rPr><sz val="9"/><color indexed="81"/><rFont val="Tahoma"/><family val="2"/></rPr><t xml:space="preserve">${Ooxml.esc((n.a ? '\n' : '') + n.t)}</t></r></text></comment>`).join('') + '</commentList></comments>';
      if (cr && pkg.has(cr.path)) pkg.setText(cr.path, cx);
      else { const path = pkg.freeName(base + 'comments%.xml'); await pkg.addPart(path, cx, 'application/vnd.openxmlformats-officedocument.spreadsheetml.comments+xml'); await pkg.addRel(part, 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/comments', '../' + path.slice(base.length)); }
    }
    // VML: Notiz-Kästchen ersetzen, andere Formen (Steuerelemente) bleiben
    const ld = X.kid(root, S, 'legacyDrawing');
    const vr = ld && rels.find(r => r.id === X.at(ld, R, 'id') && pkg.has(r.path));
    let vml = vr ? await pkg.text(vr.path) : '';
    const idm = /<o:idmap[^>]*data="(\d+)/.exec(vml);
    const sheetNo = +((/(\d+)\.xml$/.exec(part) || [0, 1])[1]) || 1;
    const block = idm ? +idm[1] : sheetNo;
    const shapes = notes.map(([k], i) => {
      const p = XL.parseKey(k);
      return `<v:shape id="_x0000_s${block * 1024 + 1 + i}" type="#_x0000_t202" style="position:absolute;margin-left:59.25pt;margin-top:1.5pt;width:108pt;height:59.25pt;z-index:${i + 1};visibility:hidden" fillcolor="#ffffe1" o:insetmode="auto"><v:fill color2="#ffffe1"/><v:shadow on="t" color="black" obscured="t"/><v:path o:connecttype="none"/><v:textbox style="mso-direction-alt:auto"><div style="text-align:left"></div></v:textbox><x:ClientData ObjectType="Note"><x:MoveWithCells/><x:SizeWithCells/><x:Anchor>${p.c + 1}, 15, ${p.r}, 2, ${p.c + 3}, 15, ${p.r + 4}, 16</x:Anchor><x:AutoFill>False</x:AutoFill><x:Row>${p.r}</x:Row><x:Column>${p.c}</x:Column></x:ClientData></v:shape>`;
    }).join('');
    if (vml) {
      vml = vml.replace(/<v:shape\b[^>]*>(?:(?!<\/v:shape>)[\s\S])*ObjectType\s*=\s*["']Note["'][\s\S]*?<\/v:shape>/g, '');
      if (!/_x0000_t202/.test(vml) && shapes) vml = vml.replace(/(<\/o:shapelayout>)/, '$1<v:shapetype id="_x0000_t202" coordsize="21600,21600" o:spt="202" path="m,l,21600r21600,l21600,xe"><v:stroke joinstyle="miter"/><v:path gradientshapeok="t" o:connecttype="rect"/></v:shapetype>');
      vml = vml.replace(/<\/xml>\s*$/, shapes + '</xml>');
      if (!/<v:shape\b/.test(vml)) { await pkg.removeRel(part, vr.id); await pkg.removePart(vr.path); ld.remove(); }
      else pkg.setText(vr.path, vml);
    } else if (shapes) {
      vml = `<xml xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel"><o:shapelayout v:ext="edit"><o:idmap v:ext="edit" data="${block}"/></o:shapelayout><v:shapetype id="_x0000_t202" coordsize="21600,21600" o:spt="202" path="m,l,21600r21600,l21600,xe"><v:stroke joinstyle="miter"/><v:path gradientshapeok="t" o:connecttype="rect"/></v:shapetype>${shapes}</xml>`;
      const path = pkg.freeName(base + 'drawings/vmlDrawing%.vml');
      await pkg.addPart(path, vml, 'application/vnd.openxmlformats-officedocument.vmlDrawing');
      const rid = await pkg.addRel(part, 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/vmlDrawing', '../' + path.slice(base.length));
      const e = X.mk(doc, S, 'legacyDrawing'); e.setAttributeNS(R, 'r:id', rid);
      this.put(doc, e, 'legacyDrawing');
    }
  },
  /* Namen der Mappe: Druckbereich, Drucktitel, Filterbereich – je Blatt (localSheetId = Stelle in <sheets>) */
  writeNames(wb, boxes, idxOf) {
    const X = OfficePages, S = this.S, root = wb.documentElement;
    let changed = false;
    for (const b of boxes) {
      const d = b.sheet, k0 = b.ox.lk0 || {}, k1 = this.layoutKeys(d), idx = idxOf(b);
      if (idx < 0 || (k0.ps === k1.ps && k0.af === k1.af && (k0.ps != null || k0.af != null))) continue;
      const nm = "'" + String(d.name).replace(/'/g, "''") + "'!";
      const ps = d.ps || {};
      const abs = (ref) => { const g = XL.parseRange(ref); return g ? `$${XL.colName(g.c1)}$${g.r1 + 1}:$${XL.colName(g.c2)}$${g.r2 + 1}` : ref; };
      const want = { '_xlnm.Print_Area': ps.pa ? nm + abs(ps.pa) : null, '_xlnm.Print_Titles': ps.pt ? nm + '$' + ps.pt.replace(':', ':$') : null, '_xlnm._FilterDatabase': d.af ? nm + abs(d.af.ref) : null };
      let dns = X.kid(root, S, 'definedNames');
      for (const [name, val] of Object.entries(want)) {
        const cur = dns && X.kids(dns, S, 'definedName').find(e => e.getAttribute('name') === name && e.getAttribute('localSheetId') === String(idx));
        if (!val) { if (cur) { cur.remove(); changed = true; } continue; }
        if (cur && cur.textContent === val) continue;
        if (!dns) { dns = X.mk(wb, S, 'definedNames'); const after = ['calcPr', 'oleSize', 'customWorkbookViews', 'pivotCaches', 'smartTagPr', 'smartTagTypes', 'webPublishing', 'fileRecoveryPr', 'webPublishObjects', 'extLst'].map(t => X.kid(root, S, t)).find(Boolean); if (after) after.before(dns); else root.append(dns); }
        const e = cur || X.mk(wb, S, 'definedName', { name, localSheetId: String(idx), ...(name === '_xlnm._FilterDatabase' ? { hidden: '1' } : {}) });
        e.textContent = val;
        if (!cur) dns.append(e);
        changed = true;
      }
      if (dns && !dns.children.length) { dns.remove(); changed = true; }
    }
    return changed;
  },
};
if (typeof module !== 'undefined') module.exports = { OfficeXT };
/* Seite einrichten über das Register (Befehl xlPs): Ränder, Ausrichtung, Format, Anpassen, Massstab, Gitternetz/Überschriften drucken */
OfficeXT.psSet = function (kind, arg) {
  this.setPs((ps) => {
    if (kind === 'm') { const m = this.MARG.find(x => x[0] === arg); if (m) ps.m = m[2].slice(); }
    else if (kind === 'or') { if (arg === 'landscape') ps.or = 'landscape'; else delete ps.or; }
    else if (kind === 'paper') ps.paper = +arg;
    else if (kind === 'fitw' || kind === 'fith') { const f = ps.fit || { w: 0, h: 0 }; f[kind === 'fitw' ? 'w' : 'h'] = +arg || 0; if (f.w || f.h) { ps.fit = f; delete ps.scale; } else delete ps.fit; }
    else if (kind === 'scale') { delete ps.fit; if (+arg && +arg !== 100) ps.scale = +arg; else delete ps.scale; }
    else if (kind === 'pg' || kind === 'ph') { if (ps[kind]) delete ps[kind]; else ps[kind] = true; }
  }, 'Seite einrichten');
};
OfficeXT.psGet = function (kind, arg) {
  const c = this.cur(); if (!c) return false;
  const ps = c.d.ps || {};
  if (kind === 'm') { const m = this.MARG.find(x => x[0] === arg); return !!m && JSON.stringify(ps.m || this.MARG[0][2]) === JSON.stringify(m[2]); }
  if (kind === 'or') return (ps.or === 'landscape') === (arg === 'landscape');
  if (kind === 'paper') return (ps.paper || 9) === +arg;
  if (kind === 'fitw') return ((ps.fit && ps.fit.w) || 0) === +arg;
  if (kind === 'fith') return ((ps.fit && ps.fit.h) || 0) === +arg;
  if (kind === 'scale') return !ps.fit && (ps.scale || 100) === +arg;
  return !!ps[kind];
};
/* ---------------------------------------------------------------- 1.73: Start wie Excel – Schrift, Einfügen/Löschen, Sortieren und Filtern */
OfficeXT.cellFont = function (k, v) {
  const c = this.need(); if (!c || this.ro(c)) return;
  const xl = c.d.xl || {};
  if (k === 'fs') { v = Math.max(1, Math.min(409, Math.round(parseFloat(String(v).replace(',', '.')) * 2) / 2 || 11)); }
  Sheet.formatSel((f) => { f[k] = (k === 'fn' ? v === xl.fn : v === (xl.fs || 11)) ? null : v; }, k === 'fn' ? 'Schriftart' : 'Schriftgrad');
};
OfficeXT.grow = function (dir) {
  const c = this.need(); if (!c) return;
  const cur = Sheet.fmtActive('fs') || (c.d.xl && c.d.xl.fs) || 11;
  const next = dir > 0 ? (FONT_SIZES.find(s => s > cur) || cur + 8) : ([...FONT_SIZES].reverse().find(s => s < cur) || Math.max(1, cur - 1));
  this.cellFont('fs', next);
};
OfficeXT.insertMenu = function (anchor) {
  const s = Sheet.sel(), nr = s ? s.r2 - s.r1 + 1 : 1, nc = s ? s.c2 - s.c1 + 1 : 1;
  UI.menu([{ head: 'Einfügen' }, { label: nr > 1 ? `${nr} Blattzeilen einfügen (oberhalb)` : 'Blattzeilen einfügen (oberhalb)', icon: 'rowAbove', action: () => Cmd.run('xlRowAbove') }, { label: 'Zeilen unterhalb einfügen', icon: 'rowBelow', action: () => Cmd.run('xlRowBelow') },
    { label: nc > 1 ? `${nc} Blattspalten einfügen (links)` : 'Blattspalten einfügen (links)', icon: 'colLeft', action: () => Cmd.run('xlColLeft') }, { label: 'Spalten rechts einfügen', icon: 'colRight', action: () => Cmd.run('xlColRight') },
    '-', { label: 'Blatt einfügen', icon: 'plus', action: () => Cmd.run('xlSheetAdd') }], 0, 0, { anchor });
};
OfficeXT.deleteMenu = function (anchor) {
  const p = OfficeGrid.page(), c = this.cur();
  UI.menu([{ head: 'Löschen' }, { label: 'Blattzeilen löschen', icon: 'rowDel', action: () => Cmd.run('xlDelRow') }, { label: 'Blattspalten löschen', icon: 'colDel', action: () => Cmd.run('xlDelCol') },
    '-', { label: 'Blatt löschen …', icon: 'trash', danger: true, disabled: !p || !c || OfficeView.sheets(p).length < 2, action: () => this.wbGuard() && OfficeXl.deleteSheet(c.id) }], 0, 0, { anchor });
};
OfficeXT.sortMenu = function (anchor) {
  const c = this.cur(), af = !!(c && c.d.af);
  UI.menu([{ head: 'Sortieren und Filtern' }, { label: 'Von A bis Z sortieren', icon: 'sortAsc', action: () => Cmd.run('xlSortAsc') }, { label: 'Von Z bis A sortieren', icon: 'sortDesc', action: () => Cmd.run('xlSortDesc') },
    { label: 'Benutzerdefiniertes Sortieren …', icon: 'sortAsc', action: () => this.sortDialog() }, '-', { label: 'Filtern', icon: 'filter', checked: af, key: 'Strg+Umsch+L', action: () => this.filterToggle() },
    { label: 'Filter löschen', icon: 'x', disabled: !af || !Object.keys(c.d.af.f || {}).length, action: () => this.clearFilters() }, { label: 'Erneut anwenden', icon: 'restore', disabled: !af, action: () => this.reapply() }], 0, 0, { anchor });
};

/* ---------------------------------------------------------------- 1.73: Arbeitsmappe schützen (Struktur) */
OfficeXT.wbOn = function (p = OfficeGrid.page()) { return !!(p && p.office.wbProt && p.office.wbProt.on); };
/* Blätter einfügen/löschen/umbenennen/aus-/einblenden/verschieben: bei geschützter Struktur nicht */
OfficeXT.wbGuard = function () { if (!this.wbOn()) return true; UI.toast('Die Struktur der Arbeitsmappe ist geschützt – Datei → Informationen → Arbeitsmappe schützen', 4000); return false; };
OfficeXT.protectBook = async function () {
  const p = OfficeGrid.page(); if (!p || Store.readOnly) return;
  const wp = p.office.wbProt;
  if (wp && wp.on) {
    if (wp.legacy || wp.hash) {
      const pw = await UI.prompt('Arbeitsmappenschutz aufheben', '', { password: true, text: 'Kennwort:' });
      if (pw == null) return;
      if (!await this.checkPw(wp, pw)) { UI.info('Arbeitsmappenschutz aufheben', '<p>Das Kennwort ist falsch.</p>'); return; }
    }
    p.office.wbProt = { on: false };
  } else {
    const pw = await UI.prompt('Struktur der Arbeitsmappe schützen', '', { password: true, ok: 'Schützen', text: 'Kennwort (optional). Danach lassen sich Blätter nicht mehr einfügen, löschen, umbenennen, verschieben oder aus-/einblenden.' });
    if (pw == null) return;
    if (pw) { const pw2 = await UI.prompt('Kennwort bestätigen', '', { password: true, text: 'Kennwort erneut eingeben:' }); if (pw2 !== pw) { UI.toast('Die Kennwörter stimmen nicht überein'); return; } }
    const prot = { on: true };
    if (pw) { const salt = crypto.getRandomValues(new Uint8Array(16)); Object.assign(prot, { alg: 'SHA-512', salt: this.b64(salt), spin: 100000, hash: await this.shaHash(pw, salt, 100000) }); }
    p.office.wbProt = prot;
  }
  Hist.touchPage(p.id); Hist.commit(p.office.wbProt.on ? 'Arbeitsmappe geschützt' : 'Arbeitsmappenschutz aufgehoben');
  Ribbon.refresh(); if (typeof Backstage !== 'undefined' && Backstage.isOpen && Backstage.isOpen()) Backstage.show('info');
};
OfficeXT.readBook = function (wb, p) {
  const X = OfficePages, S = this.S;
  const e = X.q(wb, S, 'workbookProtection')[0];
  if (!e || !/^(1|true)$/.test(e.getAttribute('lockStructure') || '')) return;
  const w = { on: true, raw: new XMLSerializer().serializeToString(e) };
  if (e.getAttribute('workbookPassword')) w.legacy = e.getAttribute('workbookPassword');
  if (e.getAttribute('workbookHashValue')) Object.assign(w, { alg: e.getAttribute('workbookAlgorithmName'), hash: e.getAttribute('workbookHashValue'), salt: e.getAttribute('workbookSaltValue'), spin: +e.getAttribute('workbookSpinCount') || 0 });
  p.office.wbProt = w; p.office.wbProt0 = JSON.stringify(w);
};
OfficeXT.writeBook = function (wb, p) {
  const X = OfficePages, S = this.S, root = wb.documentElement, w = p.office.wbProt || null;
  if (JSON.stringify(w) === (p.office.wbProt0 || 'null') || (!p.office.wbProt0 && (!w || !w.on))) return false;
  const old = X.kid(root, S, 'workbookProtection'); if (old) old.remove();
  if (w && w.on) {
    const [e] = X.xml(wb, S, `<workbookProtection${w.hash ? ` workbookAlgorithmName="${w.alg}" workbookHashValue="${w.hash}" workbookSaltValue="${w.salt}" workbookSpinCount="${w.spin}"` : w.legacy ? ` workbookPassword="${w.legacy}"` : ''} lockStructure="1"/>`);
    // Reihenfolge laut Schema: fileVersion, fileSharing, workbookPr, workbookProtection, bookViews …
    const after = ['bookViews', 'sheets'].map(n => X.kid(root, S, n)).find(Boolean);
    if (after) after.before(e); else root.prepend(e);
  }
  return true;
};
