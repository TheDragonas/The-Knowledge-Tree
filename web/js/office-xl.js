'use strict';
/* Excel-Seiten (1.64) – .xlsx lesen, jedes Blatt als Rechentabelle bearbeiten, Änderungen zurückschreiben.
 *
 * Jedes Arbeitsblatt wird eine Rechentabelle (die bestehende Tabellen-Funktion) mit b.ox = { k:'xl', part, name,
 * c0: { A1: Rohwert } } – Rohwert so, wie KnowledgeTree ihn speichert (Text, Zahl als Text, Formel „=…“).
 * Export: nur Zellen, deren Rohwert sich geändert hat, werden im Blatt-XML ersetzt/eingefügt/geleert; Zellformat
 * (s="…"), Zeilen-Eigenschaften, Spalten, verbundene Zellen, bedingte Formate, Diagramme usw. bleiben. Text wird als
 * Inline-Text geschrieben (gemeinsame Zeichenketten bleiben unberührt), Formeln in Excel-Schreibweise (englische
 * Funktionsnamen, Komma), ohne zwischengespeichertes Ergebnis; Excel rechnet beim Öffnen neu (fullCalcOnLoad), die
 * Rechenkette (calcChain.xml) wird dann entfernt, damit Excel nichts „reparieren“ muss. */
const OfficeXl = {
  get S() { return Ooxml.NS.s; }, get R() { return Ooxml.NS.r; },
  get X() { return OfficePages; },
  MAXC: 60, MAXR: 3000, ROWS: 40, COLS: 12,
  colN(s) { let n = 0; for (const ch of s) n = n * 26 + ch.charCodeAt(0) - 64; return n - 1; },

  async sharedStrings(pkg, rels) {
    const X = this.X, S = this.S;
    const r = rels.find(x => /sharedStrings$/.test(x.type));
    if (!r || !pkg.has(r.path)) return [];
    const d = await pkg.xml(r.path);
    return X.kids(d.documentElement, S, 'si').map(si => X.q(si, S, 't').filter(t => !(t.parentNode && t.parentNode.localName === 'rPh')).map(t => t.textContent).join(''));
  },
  /* Zelle → Rohwert für KnowledgeTree */
  rawOf(c, sst, shared) {
    const X = this.X, S = this.S;
    const t = c.getAttribute('t') || '', f = X.kid(c, S, 'f'), v = X.kid(c, S, 'v');
    if (f && f.getAttribute('t') === 'shared' && shared) {
      // geteilte Formel (Excel „ausfüllen“): Vorlage merken bzw. für diese Zelle verschieben
      const si = f.getAttribute('si'), ref = c.getAttribute('r');
      if (f.textContent) shared.set(si, { ref, raw: '=' + f.textContent.replace(/_xlfn\.|_xlws\./g, '') });
      const m = shared.get(si);
      if (m) { const a = /^([A-Z]+)(\d+)$/.exec(m.ref), b = /^([A-Z]+)(\d+)$/.exec(ref); if (a && b) return XL.shiftFormula(m.raw, this.colN(b[1]) - this.colN(a[1]), +b[2] - +a[2]); }
    }
    if (f && f.textContent) return '=' + f.textContent.replace(/_xlfn\.|_xlws\./g, '');
    let raw = '';
    if (t === 's' && v) raw = sst[+v.textContent] ?? '';
    else if (t === 'inlineStr') raw = X.q(c, S, 't').map(x => x.textContent).join('');
    else if (t === 'str' && v) raw = v.textContent;
    else if (t === 'b' && v) return v.textContent === '1' ? 'WAHR' : 'FALSCH';
    else if (t === 'e' && v) return v.textContent;
    else if (v) return v.textContent;
    // Text, der wie Zahl/Formel aussieht, bleibt Text
    if (raw && (raw[0] === '=' || raw[0] === "'" || (typeof XL !== 'undefined' && typeof XL.parseInput(raw).v !== 'string'))) raw = "'" + raw;
    return raw;
  },
  /* Zeichnung eines Blatts (xl/drawings/drawingN.xml): Bilder (gedreht/zugeschnitten wie Excel), Diagramme (mit Bezug auf
     das Blatt, wenn möglich), Formen mit Text. Felder ox.k = 'xlo' mit Anker { c, r, dx, dy } (+ Ende), Lage nach dem
     Messen des Rasters (OfficeView.flowXl). → true, wenn etwas gezeigt wird */
  async drawings(pkg, sheetPath, rid, sb, dd, later) {
    const X = this.X, R = this.R, A = Ooxml.NS.a, XDR = 'http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing';
    const sr = (await pkg.rels(sheetPath)).find(x => x.id === rid);
    if (!sr || !pkg.has(sr.path)) return false;
    const doc = await pkg.xml(sr.path), drels = await pkg.rels(sr.path);
    const colW = (c) => (dd.cols && dd.cols[c]) || (dd.xl && dd.xl.cw) || 64, rowH = (r) => (dd.rowh && dd.rowh[r]) || (dd.xl && dd.xl.rh) || 20;
    const at = (e) => { if (!e) return null; const g = (t) => +((X.kid(e, XDR, t) || {}).textContent || 0); return { c: g('col'), r: g('row'), dx: g('colOff') / 9525, dy: g('rowOff') / 9525 }; };
    const span = (a, b) => { let w = 0, h = 0; for (let c = a.c; c < b.c; c++) w += colW(c); for (let r = a.r; r < b.r; r++) h += rowH(r); return { w: w - a.dx + b.dx, h: h - a.dy + b.dy }; };
    let n = 0;
    for (const an of X.kids(doc.documentElement, XDR)) {
      if (!/Anchor$/.test(an.localName)) continue;
      const from = at(X.kid(an, XDR, 'from')), to = at(X.kid(an, XDR, 'to')), ext = X.kid(an, XDR, 'ext'), pos = X.kid(an, XDR, 'pos');
      const a = from || { c: 0, r: 0, dx: pos ? +pos.getAttribute('x') / 9525 : 0, dy: pos ? +pos.getAttribute('y') / 9525 : 0 };
      const sz = to && from ? span(from, to) : { w: ext ? +ext.getAttribute('cx') / 9525 : 200, h: ext ? +ext.getAttribute('cy') / 9525 : 120 };
      if (!(sz.w > 2 && sz.h > 2)) continue;
      const ox = { k: 'xlo', sh: sb.id, a, ...(to && from ? { b: to } : {}) };
      const obj = [...an.children].find(e => /^(pic|graphicFrame|sp|grpSp)$/.test(e.localName));
      if (!obj) continue;
      if (obj.localName === 'pic') {
        const bl = X.q(obj, A, 'blip')[0], rel = bl && drels.find(x => x.id === X.at(bl, R, 'embed'));
        const xf = X.q(obj, A, 'xfrm')[0], src = X.q(obj, A, 'srcRect')[0];
        const im = rel && rel.path && pkg.has(rel.path) && typeof OfficeWI !== 'undefined' ? await OfficeWI.picture(pkg, rel.path, { w: sz.w, h: sz.h, rot: xf ? (+xf.getAttribute('rot') || 0) / 60000 : 0, flipH: !!xf && xf.getAttribute('flipH') === '1', flipV: !!xf && xf.getAttribute('flipV') === '1', crop: src ? { l: +src.getAttribute('l') / 1e5 || 0, t: +src.getAttribute('t') / 1e5 || 0, r: +src.getAttribute('r') / 1e5 || 0, b: +src.getAttribute('b') / 1e5 || 0 } : null }) : null;
        if (!im) continue;
        X.addBox(sb.x, sb.y, im.w + 22, '', { images: [{ id: uid('i'), src: im.name, x: 0, y: 0, w: Math.round(im.w), h: Math.round(im.h) }], office: null, front: true, style: { bg: 'transparent', border: 'transparent' }, ox: { ...ox, iw: im.w, ih: im.h, fw: sz.w, fh: sz.h } });
        n++;
      } else if (obj.localName === 'graphicFrame') {
        const ce = typeof OfficeObj !== 'undefined' && X.q(obj, OfficeObj.C, 'chart')[0], cr = ce && drels.find(x => x.id === X.at(ce, R, 'id'));
        const spec = cr && cr.path && pkg.has(cr.path) ? await OfficeObj.chart(pkg, cr.path) : null;
        if (!spec) continue;
        const b = OfficeObj.chartBox(spec, sb.x, sb.y, Math.max(140, sz.w - 14), Math.max(120, sz.h - 22), { front: true, ox: { ...ox, chart: true } });
        // Bezug auf das Blatt (live wie ein KnowledgeTree-Diagramm), wenn die Reihen einen Block bilden und gleich ausfallen
        later.push(() => {
          const src = OfficeObj.srcOf(spec);
          if (!src) return;
          const tb = Canvas.page.boxes.find(q => q.sheet && q.ox && q.ox.k === 'xl' && q.sheet.name.toLowerCase() === (src.name || sb.sheet.name).toLowerCase());
          if (!tb) return;
          const dd2 = Chart.fromRange(tb, src.range, spec.type, src.byRow);
          const cached = spec.series.some(s => s.vals.some(v => v != null));
          if (!dd2 || dd2.series.length !== spec.series.length || (cached && dd2.series.some((s, i) => s.vals.length !== spec.series[i].vals.length))) return;
          b.chart.src = { id: tb.id, name: tb.sheet.name, range: src.range }; b.chart.byRow = !!src.byRow;
        });
        n++;
      } else if (typeof OfficeObj !== 'undefined') {
        // Form oder Gruppe mit Text
        const html = obj.localName === 'grpSp' ? await OfficeObj.groupHtml(obj, sz.w, sz.h, { pic: (rid2, f) => { const r2 = drels.find(x => x.id === rid2); return r2 && r2.path && pkg.has(r2.path) && typeof OfficeWI !== 'undefined' ? OfficeWI.picture(pkg, r2.path, f) : null; } })
          : OfficeObj.frame(0, 0, sz.w, sz.h, OfficeObj.look(X.kids(obj, XDR).find(e => e.localName === 'spPr'), X.kids(obj, XDR).find(e => e.localName === 'style')), `<div class="kt-shp-t">${OfficeObj.txHtml(X.kids(obj, XDR).find(e => e.localName === 'txBody'))}</div>`);
        if (!html.replace(/<[^>]+>/g, '').trim() && !/background|border|<img/.test(html)) continue;
        X.addBox(sb.x, sb.y, sz.w + 22, obj.localName === 'grpSp' ? html : `<div class="kt-grp" style="position:relative;width:${sz.w.toFixed(1)}px;height:${sz.h.toFixed(1)}px">${html}</div>`, { raw: true, office: null, front: true, style: { bg: 'transparent', border: 'transparent' }, ox });
        n++;
      }
    }
    return n > 0;
  },
  async read(pkg, p, y0) {
    const X = this.X, S = this.S, R = this.R;
    const wb = await pkg.xml(pkg.main);
    const rels = await pkg.rels(pkg.main);
    const sst = await this.sharedStrings(pkg, rels);
    let y = y0;
    const sheets = [];
    // Zellformate und bedingte Formate (1.67): Schrift, Füllung, Ausrichtung, Rahmen, Zahlenformat
    const styleOf = await OfficeGrid.readStyles(pkg);
    const sr = rels.find(x => /\/styles$/.test(x.type) && pkg.has(x.path)), stylesDoc = sr ? await pkg.xml(sr.path) : null;
    const later = [];   // Diagramme erst nach allen Blättern (Bezug auf ein anderes Blatt)
    for (const [si, sh] of X.q(wb, S, 'sheet').entries()) {
      const r = rels.find(x => x.id === X.at(sh, R, 'id'));
      if (!r || !/worksheet$/.test(r.type) || !pkg.has(r.path)) continue;
      const d = await pkg.xml(r.path);
      const cells = {}, fmts = {}, shared = new Map(); let nrows = 1, ncols = 1, cut = false;
      for (const c of X.q(d, S, 'c')) {
        const ref = c.getAttribute('r'); if (!ref) continue;
        const m = /^([A-Z]+)(\d+)$/.exec(ref); if (!m) continue;
        const ci = this.colN(m[1]), ri = +m[2] - 1;
        if (ci >= this.MAXC || ri >= this.MAXR) { cut = true; continue; }
        const raw = this.rawOf(c, sst, shared);
        const st = +(c.getAttribute('s') || 0);
        if (st) { const f = styleOf(st); if (Object.keys(f).length && (raw !== '' || f.bg || f.bd || f.ul)) fmts[ref] = f; }
        if (raw === '') { if (fmts[ref]) { nrows = Math.max(nrows, ri + 1); ncols = Math.max(ncols, ci + 1); } continue; }
        cells[ref] = raw;
        nrows = Math.max(nrows, ri + 1); ncols = Math.max(ncols, ci + 1);
      }
      // 1.71: Standardschrift, Standardbreite/-höhe, Zeilenhöhen, ausgeblendete Zeilen/Spalten, verbundene Zellen,
      //       Dropdown-Listen (Datenüberprüfung)
      const fmtPr = X.q(d, S, 'sheetFormatPr')[0];
      const cw = (w) => Math.round(w * 7 + 5);   // Excel-Breite (Zeichen der Ziffer 0) → px
      const defW = fmtPr && +fmtPr.getAttribute('defaultColWidth') ? cw(+fmtPr.getAttribute('defaultColWidth')) : fmtPr && +fmtPr.getAttribute('baseColWidth') ? cw(+fmtPr.getAttribute('baseColWidth') + 0.71) : 64;
      const defH = fmtPr && +fmtPr.getAttribute('defaultRowHeight') ? Math.round(Ooxml.pt2px(+fmtPr.getAttribute('defaultRowHeight'))) : Math.round(styleOf.font.s * 96 / 72 * 1.36);
      const hideC = [], rowh = {}, hideR = [];
      let maxCol = ncols;
      for (const co of X.q(d, S, 'col')) { const b2 = Math.min(this.MAXC, +co.getAttribute('max')); if (co.getAttribute('hidden') === '1' || (+co.getAttribute('width') || 0) > 0) maxCol = Math.max(maxCol, Math.min(b2, ncols + 30)); }
      const cols = Array(maxCol).fill(Math.max(20, defW));
      for (const co of X.q(d, S, 'col')) {
        const a = +co.getAttribute('min') - 1, b2 = +co.getAttribute('max') - 1, w = +co.getAttribute('width'), hid = co.getAttribute('hidden') === '1';
        for (let k = Math.max(0, a); k <= Math.min(maxCol - 1, b2); k++) { if (w) cols[k] = Math.max(16, Math.min(1200, cw(w))); if (hid) hideC.push(k); }
      }
      for (const rw of X.q(d, S, 'row')) {
        const rn = +rw.getAttribute('r') - 1; if (!(rn >= 0) || rn >= this.MAXR) continue;
        if (rw.getAttribute('hidden') === '1') { hideR.push(rn); nrows = Math.max(nrows, rn + 1); }
        else if (rw.getAttribute('customHeight') === '1' && +rw.getAttribute('ht')) { rowh[rn] = Math.max(4, Math.round(Ooxml.pt2px(+rw.getAttribute('ht')))); nrows = Math.max(nrows, rn + 1); }
      }
      const merges = X.q(d, S, 'mergeCell').map(m => m.getAttribute('ref')).filter(Boolean).filter(r => { const g = XL.parseRange(r); return g && g.c2 < this.MAXC && g.r2 < this.MAXR; });
      const dv = [];
      for (const v of X.q(d, S, 'dataValidation')) {
        if (v.getAttribute('type') !== 'list') continue;
        const f1 = X.kid(v, S, 'formula1') || X.q(v, 'http://schemas.microsoft.com/office/excel/2006/main', 'f')[0];
        const src = f1 ? f1.textContent.trim() : '';
        if (!src) continue;
        for (const ref of (v.getAttribute('sqref') || X.q(v, 'http://schemas.microsoft.com/office/excel/2006/main', 'sqref').map(x => x.textContent).join(' ')).split(/\s+/).filter(Boolean)) dv.push({ ref, src, drop: v.getAttribute('showDropDown') !== '1' });
      }
      ncols = Math.max(ncols, maxCol);
      const d0 = XL.normSheet({ cells: {}, nrows: Math.max(nrows + 10, this.ROWS), ncols: Math.max(ncols + 2, this.COLS), cols: [] });   // Raster wie Excel
      for (const [k, raw] of Object.entries(cells)) { const m = /^([A-Z]+)(\d+)$/.exec(k); Sheet.writeRaw(d0, this.colN(m[1]), +m[2] - 1, String(raw)); }
      const c0 = {};
      for (const [k, cell] of Object.entries(d0.cells)) if (cell && cell.v !== '' && cell.v != null) c0[k] = String(cell.v);
      // Zellformate aus der Datei (Ausgangsstand f0: nur geänderte Formate werden später geschrieben)
      const f0 = {};
      for (const [k, f] of Object.entries(fmts)) { const cell = d0.cells[k] || (d0.cells[k] = { v: '' }); cell.f = { ...(cell.f || {}), ...f }; }
      for (const [k, cell] of Object.entries(d0.cells)) if (cell.f && Object.keys(cell.f).length) f0[k] = JSON.stringify(cell.f);
      const head = false;   // wie in Excel: keine eigene Kopfzeilen-Farbe (1.67)
      const name = Sheet.uniqueName((sh.getAttribute('name') || 'Tabelle').slice(0, 40));
      const dd = XL.normSheet({ name, cells: d0.cells, nrows: d0.nrows, ncols: d0.ncols, cols: cols.concat(Array(Math.max(0, d0.ncols - cols.length)).fill(Math.max(20, defW))).slice(0, d0.ncols), head, band: false, grid: true, color: null });
      // Darstellung wie Excel (1.71): Schrift der Mappe, Zeilenhöhe, Standardbreite für neue Spalten
      dd.xl = { fn: styleOf.font.n, fs: styleOf.font.s, rh: Math.max(12, defH), cw: Math.max(20, defW) };
      { const z = styleOf(0); if (Object.keys(z).length) dd.xl.f0 = z; }   // Zellformat 0 gilt für Zellen ohne eigenes
      if (Object.keys(rowh).length) dd.rowh = rowh;
      if (hideR.length) dd.hideR = hideR;
      if (hideC.length) dd.hideC = hideC;
      if (merges.length) dd.merges = merges;
      if (dv.length) dd.dv = dv;
      OfficeGrid.readView(d, dd);
      const cf = OfficeGrid.readCf(d, stylesDoc); if (cf.length) dd.cf = cf;
      // 1.72: Filter, Notizen, Seite einrichten, Blattschutz, alle Datenüberprüfungen, Formeln anzeigen
      if (typeof OfficeXT !== 'undefined') await OfficeXT.read(pkg, d, dd, r.path, si, wb);
      const st = sh.getAttribute('state');
      const b = { id: uid('b'), x: 40, y: Math.round(y0), w: Sheet.width(dd), html: '', images: [], z: Canvas.maxZ() + 1, style: { bg: 'transparent' }, locked: false, pkg: null, sheet: dd, ox: { k: 'xl', part: r.path, name: sh.getAttribute('name') || '', c0, f0, cf0: JSON.stringify(dd.cf || null), v0: this.viewKey(dd), ...(st === 'hidden' || st === 'veryHidden' ? { hid: st, hid0: st } : {}) } };
      if (typeof OfficeXT !== 'undefined') b.ox.lk0 = OfficeXT.layoutKeys(dd);
      Canvas.page.boxes.push(b);
      Sheet.bump();
      sheets.push(b.id);
      const notes = [];
      // Bilder, Diagramme, Formen des Blatts (1.75): an ihrer Zelle über dem Raster (Anzeige; die Datei behält sie)
      const drw = X.q(d, S, 'drawing')[0];
      if (drw) { const ok = await this.drawings(pkg, r.path, X.at(drw, R, 'id'), b, dd, later); if (!ok) notes.push('Diagramme/Grafiken dieses Blatts: nur in Excel sichtbar (bleiben in der Datei).'); }
      if (X.q(d, S, 'cfRule').some(r => !OfficeGrid.readable(r))) notes.push('Weitere bedingte Formate (Symbolsätze, Formeln) bleiben in der Datei, werden hier aber nicht gezeigt.');
      if (cut) notes.push(`Nur die ersten ${this.MAXC} Spalten / ${this.MAXR} Zeilen werden gezeigt – der Rest bleibt unverändert in der Datei.`);
      if (notes.length) X.addBox(40 + b.w + 24, b.y, 260, `<div style="color:#777;font-size:12px">${notes.join('<br>')}</div>`, { style: { bg: 'transparent' }, ox: { k: 'label', f: b.id } });
    }
    p.office.sheets = sheets;
    for (const fn of later) { try { fn(); } catch (e) { /* Diagramm ohne Bezug */ } }
    if (typeof OfficeXT !== 'undefined') OfficeXT.readBook(wb, p);   // Arbeitsmappenschutz (1.73)
    // aktives Blatt wie in der Datei (workbookView activeTab), ausgeblendete nie
    const at = +(X.q(wb, S, 'workbookView')[0] || { getAttribute: () => 0 }).getAttribute('activeTab') || 0;
    const vis = sheets.filter(id => { const bb = Canvas.box(id); return bb && !bb.ox.hid; });
    p.office.cur = (vis.includes(sheets[at]) ? sheets[at] : vis[0]) || sheets[0] || null;
    p.office.y0 = y0;
    void y;
    Canvas.render();
  },

  viewKey(d) { return JSON.stringify({ g: d.grid !== false, h: d.heads !== false, f: d.freeze || null, ...(d.showF ? { s: 1 } : {}) }); },
  /* ---------------------------------------------------------------- Blätter (Register unten) */
  addSheet() {
    const p = OfficePages.page('xlsx');
    if (!p || Store.readOnly || (typeof OfficeXT !== 'undefined' && !OfficeXT.wbGuard())) return;
    if (Canvas.editing) Canvas.stopEditing();
    const list = OfficeView.sheets(p);
    let n = list.length + 1; while (list.some(b => b.sheet.name.toLowerCase() === ('tabelle' + n))) n++;
    const d = XL.normSheet({ name: Sheet.uniqueName('Tabelle' + n), cells: {}, nrows: this.ROWS, ncols: this.COLS, cols: Array(this.COLS).fill(96), head: false, band: false, grid: true, color: null });
    const ref = list[0];
    const b = { id: uid('b'), x: ref ? ref.x : 40, y: ref ? ref.y : (p.office.y0 || 120), w: Sheet.width(d), html: '', images: [], z: Canvas.maxZ() + 1, style: { bg: 'transparent' }, locked: false, pkg: null, sheet: d, ox: { k: 'xl', part: null, name: '', c0: {} } };
    p.boxes.push(b);
    (p.office.sheets || (p.office.sheets = [])).splice((p.office.sheets.indexOf(p.office.cur) + 1) || p.office.sheets.length, 0, b.id);
    Sheet.bump();
    Hist.touchPage(p.id); Hist.commit('Blatt eingefügt');
    OfficeView.showSheet(b.id);
  },
  async deleteSheet(id) {
    const p = OfficePages.page('xlsx');
    const b = p && p.boxes.find(x => x.id === id);
    if (!b || Store.readOnly || OfficeView.sheets(p).length < 2 || (typeof OfficeXT !== 'undefined' && !OfficeXT.wbGuard())) return;
    const ok = await UI.confirm(`Blatt „${b.sheet.name}“ löschen?`, 'Das Blatt und seine Inhalte werden entfernt (Strg+Z holt es zurück). Formeln, die darauf verweisen, zeigen danach #BEZUG!.', { ok: 'Löschen', danger: true });
    if (!ok) return;
    if (Sheet.active && Sheet.active.id === id) Sheet.deactivate();
    p.boxes = p.boxes.filter(x => x.id !== id && !(x.ox && x.ox.k === 'label' && x.ox.f === id) && !(x.ox && x.ox.k === 'xlo' && x.ox.sh === id));
    p.office.sheets = (p.office.sheets || []).filter(x => x !== id);
    Sheet.bump();
    Hist.touchPage(p.id); Hist.commit('Blatt gelöscht');
    OfficeView.showSheet(OfficeView.sheets(p)[0].id);
  },
  /* Blätter der Mappe abgleichen: neue anlegen, gelöschte entfernen, Namen, Reihenfolge → Teil je Feld */
  async syncSheets(pkg, p) {
    const X = this.X, S = this.S, R = this.R;
    const wb = await pkg.xml(pkg.main);
    const sheetsEl = X.q(wb, S, 'sheets')[0];
    const rels = await pkg.rels(pkg.main);
    const boxes = OfficeView.sheets(p);
    const parts = new Map();
    let changed = false;
    const elOf = (part) => X.kids(sheetsEl, S, 'sheet').find(e => { const r = rels.find(x => x.id === X.at(e, R, 'id')); return r && r.path === part; });
    const live = new Set(boxes.map(b => b.ox.part).filter(Boolean));
    // gelöschte Blätter (nur wenn keine blattbezogenen Namen die Nummerierung brauchen)
    const local = X.q(wb, S, 'definedName').some(d => d.hasAttribute('localSheetId'));
    for (const e of X.kids(sheetsEl, S, 'sheet')) {
      const r = rels.find(x => x.id === X.at(e, R, 'id'));
      if (!r || !/worksheet$/.test(r.type) || live.has(r.path)) continue;
      if (local) { UI.toast('Ein gelöschtes Blatt bleibt in der Excel-Datei (die Mappe hat blattbezogene Namen)', 5000); continue; }
      e.remove(); await pkg.removeRel(pkg.main, r.id); await pkg.removePart(r.path); changed = true;
    }
    // neue Blätter
    let maxId = Math.max(0, ...X.kids(sheetsEl, S, 'sheet').map(e => +e.getAttribute('sheetId') || 0));
    for (const b of boxes) {
      if (b.ox.part && pkg.has(b.ox.part)) { parts.set(b.id, b.ox.part); continue; }
      const dir = pkg.main.replace(/[^/]+$/, '');
      const path = pkg.freeName(dir + 'worksheets/sheet%.xml');
      await pkg.addPart(path, '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheetData/></worksheet>', 'application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml');
      const rid = await pkg.addRel(pkg.main, 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet', path.slice(dir.length));
      const e = X.mk(wb, S, 'sheet', { name: b.sheet.name.slice(0, 31), sheetId: String(++maxId), 'r:id': rid });
      sheetsEl.append(e);
      parts.set(b.id, path);
      changed = true;
    }
    // Namen (Excel: höchstens 31 Zeichen, ohne : \ / ? * [ ])
    const rels2 = await pkg.rels(pkg.main);
    for (const b of boxes) {
      const e = X.kids(sheetsEl, S, 'sheet').find(x => { const r = rels2.find(y => y.id === X.at(x, R, 'id')); return r && r.path === parts.get(b.id); });
      if (e && (b.ox.hid || null) !== (e.getAttribute('state') && e.getAttribute('state') !== 'visible' ? e.getAttribute('state') : null)) { if (b.ox.hid) e.setAttribute('state', b.ox.hid); else e.removeAttribute('state'); changed = true; }   // ausgeblendet (1.71)
      const want = b.sheet.name.replace(/[:\\/?*[\]]/g, '_').slice(0, 31);
      if (e && e.getAttribute('name') !== want) {
        const old = e.getAttribute('name');
        e.setAttribute('name', want);
        for (const d of X.q(wb, S, 'definedName')) d.textContent = d.textContent.split("'" + old + "'!").join("'" + want + "'!").split(old + '!').join(/\s/.test(want) ? "'" + want + "'!" : want + '!');
        changed = true;
      }
    }
    // Reihenfolge wie die Register
    if (!local) {
      const cur = X.kids(sheetsEl, S, 'sheet');
      const want = boxes.map(b => cur.find(x => { const r = rels2.find(y => y.id === X.at(x, R, 'id')); return r && r.path === parts.get(b.id); })).filter(Boolean);
      if (want.length === cur.length && want.some((e, i) => e !== cur[i])) { for (const e of want) sheetsEl.append(e); changed = true; }
    }
    if (changed) {
      pkg.setXml(pkg.main, wb);
      const cc = rels2.find(r => /calcChain$/.test(r.type));
      if (cc) { await pkg.removeRel(pkg.main, cc.id); await pkg.removePart(cc.path); }
    }
    void elOf;
    return parts;
  },

  /* ---------------------------------------------------------------- Formeln für Excel */
  XLFN: new Set(['IFS', 'SWITCH', 'MAXIFS', 'MINIFS', 'TEXTJOIN', 'CONCAT', 'XLOOKUP', 'XMATCH', 'UNIQUE', 'SORT', 'SORTBY', 'FILTER', 'SEQUENCE', 'IFNA', 'DAYS', 'ISOWEEKNUM', 'STDEV.S', 'STDEV.P', 'VAR.S', 'VAR.P', 'MODE.SNGL', 'CEILING.MATH', 'FLOOR.MATH', 'NORM.DIST', 'NORM.INV', 'PERCENTILE.INC', 'QUARTILE.INC', 'RANK.EQ', 'LET']),
  toExcel(raw) {
    const src = raw.slice(1);
    let toks;
    try { toks = XL.tokenize(src); } catch (e) { return src; }
    let out = '', pos = 0;
    for (const t of toks) {
      let rep = null;
      if (t.t === 'fn') { const en = XL.fnName(t.v); if (en) rep = (this.XLFN.has(en) ? '_xlfn.' : '') + en; }
      else if (t.t === 'bool') rep = t.v ? 'TRUE' : 'FALSE';
      else if (t.t === 'op' && t.v === ';') rep = ',';
      if (rep == null) continue;
      out += src.slice(pos, t.p) + rep;
      pos = t.e;
    }
    return out + src.slice(pos);
  },
  /* ---------------------------------------------------------------- Export */
  async write(pkg, p) {
    const X = this.X, S = this.S;
    let changed = 0, formulas = false, sw = null;
    const parts = await this.syncSheets(pkg, p);
    if (pkg.dirty) changed++;
    for (const b of p.boxes.filter(b => b.sheet && b.ox && b.ox.k === 'xl' && parts.has(b.id))) {
      const part = parts.get(b.id);
      const cur = {};
      for (const [k, cell] of Object.entries(b.sheet.cells)) if (cell && cell.v !== '' && cell.v != null) cur[k] = String(cell.v);
      const keys = new Set([...Object.keys(cur), ...Object.keys(b.ox.c0)]);
      let diff = [...keys].filter(k => (cur[k] ?? '') !== (b.ox.c0[k] ?? ''));
      // 1.67: Zellformate, bedingte Formate, Ansicht (fixiert, Gitternetz) – nur bei Änderung
      const fcur = {}, f0 = b.ox.f0 || {};
      for (const [k, cell] of Object.entries(b.sheet.cells)) if (cell && cell.f && Object.keys(cell.f).length) fcur[k] = JSON.stringify(cell.f);
      const fdiff = [...new Set([...Object.keys(fcur), ...Object.keys(f0)])].filter(k => (fcur[k] || '') !== (f0[k] || ''));
      const cfChanged = JSON.stringify(b.sheet.cf || null) !== (b.ox.cf0 || 'null');
      const vChanged = this.viewKey(b.sheet) !== (b.ox.v0 || this.viewKey({}));
      // 1.72: Spalten, Zeilen, verbundene Zellen, Datenüberprüfung, Filter, Notizen, Seite einrichten, Blattschutz
      const XT = typeof OfficeXT !== 'undefined' ? OfficeXT : null;
      const lk0 = XT ? b.ox.lk0 || XT.layoutKeys({ cols: [] }) : null, lk1 = XT ? XT.layoutKeys(b.sheet) : null;
      const lChanged = XT && Object.keys(lk1).some(k => lk0[k] !== lk1[k]);
      if (!diff.length && !fdiff.length && !cfChanged && !vChanged && !lChanged) continue;
      const doc = await pkg.xml(part);
      const sd = X.q(doc, S, 'sheetData')[0];
      if (!sd) continue;
      const rows = new Map(X.kids(sd, S, 'row').map(r => [+r.getAttribute('r'), r]));
      // geteilte Formeln, die eine geänderte Zelle betreffen: alle Zellen der Gruppe mit eigener Formel schreiben
      const si = new Set();
      for (const k of diff) { const c = X.q(sd, S, 'c').find(x => x.getAttribute('r') === k); const f = c && X.kid(c, S, 'f'); if (f && f.getAttribute('t') === 'shared') si.add(f.getAttribute('si')); }
      if (si.size) for (const c of X.q(sd, S, 'c')) { const f = X.kid(c, S, 'f'); if (f && f.getAttribute('t') === 'shared' && si.has(f.getAttribute('si'))) { const k = c.getAttribute('r'); if (!diff.includes(k)) diff.push(k); } }
      for (const k of diff) {
        const m = /^([A-Z]+)(\d+)$/.exec(k); if (!m) continue;
        const rn = +m[2], ci = this.colN(m[1]);
        let row = rows.get(rn);
        const raw = cur[k] ?? '';
        if (!row) {
          if (raw === '') continue;
          row = X.mk(doc, S, 'row', { r: String(rn) });
          const after = [...rows.keys()].filter(r => r > rn).sort((a, b) => a - b)[0];
          if (after != null) rows.get(after).before(row); else sd.append(row);
          rows.set(rn, row);
        }
        let c = X.kids(row, S, 'c').find(x => x.getAttribute('r') === k);
        if (!c) {
          if (raw === '') continue;
          c = X.mk(doc, S, 'c', { r: k });
          const next = X.kids(row, S, 'c').find(x => { const mm = /^([A-Z]+)/.exec(x.getAttribute('r') || ''); return mm && this.colN(mm[1]) > ci; });
          if (next) next.before(c); else row.append(c);
          if (row.getAttribute('spans')) row.removeAttribute('spans');
        }
        for (const ch of [...c.children]) if (/^(f|v|is)$/.test(ch.localName)) ch.remove();
        c.removeAttribute('t');
        if (raw === '') { if (!c.getAttribute('s')) c.remove(); continue; }
        if (XL.isFormula(b.ox.c0[k] || '')) formulas = true;
        if (XL.isFormula(raw)) {
          const f = X.mk(doc, S, 'f'); f.textContent = this.toExcel(raw); c.prepend(f); formulas = true;
        } else {
          const pv = XL.parseInput(raw);
          if (raw[0] !== "'" && typeof pv.v === 'number') { const v = X.mk(doc, S, 'v'); v.textContent = String(pv.v); c.append(v); }
          else if (raw[0] !== "'" && typeof pv.v === 'boolean') { c.setAttribute('t', 'b'); const v = X.mk(doc, S, 'v'); v.textContent = pv.v ? '1' : '0'; c.append(v); }
          else { c.setAttribute('t', 'inlineStr'); const is = X.mk(doc, S, 'is'), t = X.mk(doc, S, 't'); t.setAttribute('xml:space', 'preserve'); t.textContent = raw[0] === "'" ? raw.slice(1) : raw; is.append(t); c.append(is); }
        }
      }
      // Zellformate: neues Zellformat (cellXfs) aus dem bisherigen der Zelle + Format von KnowledgeTree
      if (fdiff.length) {
        sw = sw || await OfficeGrid.styleWriter(pkg);
        for (const k of sw ? fdiff : []) {
          const m = /^([A-Z]+)(\d+)$/.exec(k); if (!m) continue;
          const rn = +m[2], ci = this.colN(m[1]);
          let row = rows.get(rn);
          if (!row) { row = X.mk(doc, S, 'row', { r: String(rn) }); const after = [...rows.keys()].filter(r => r > rn).sort((a, b) => a - b)[0]; if (after != null) rows.get(after).before(row); else sd.append(row); rows.set(rn, row); }
          let c = X.kids(row, S, 'c').find(x => x.getAttribute('r') === k);
          if (!c) { c = X.mk(doc, S, 'c', { r: k }); const next = X.kids(row, S, 'c').find(x => { const mm = /^([A-Z]+)/.exec(x.getAttribute('r') || ''); return mm && this.colN(mm[1]) > ci; }); if (next) next.before(c); else row.append(c); if (row.getAttribute('spans')) row.removeAttribute('spans'); }
          const base = +(c.getAttribute('s') || 0);
          c.setAttribute('s', String(sw.xf(base, JSON.parse(fcur[k] || '{}'))));
        }
      }
      if (cfChanged) { sw = sw || await OfficeGrid.styleWriter(pkg); if (sw) OfficeGrid.writeCf(doc, b.sheet, sw); }
      if (vChanged) OfficeGrid.writeView(doc, b.sheet);
      if (lChanged) await XT.write(pkg, doc, b, part, lk0, lk1);
      // zwischengespeicherte Ergebnisse der Formeln dieses Blatts verwerfen – sonst zeigen Programme, die beim Öffnen
      // nicht neu rechnen (z.B. LibreOffice), alte Werte; Excel rechnet ohnehin neu (fullCalcOnLoad)
      for (const f of X.q(sd, S, 'f')) { const c = f.parentNode, v = X.kid(c, S, 'v'); if (v) v.remove(); if (c.getAttribute('t') === 'str' || c.getAttribute('t') === 'b' || c.getAttribute('t') === 'e') c.removeAttribute('t'); formulas = true; }
      // Dimension anpassen
      const dim = X.q(doc, S, 'dimension')[0];
      if (dim) { const all = X.q(sd, S, 'c').map(c => c.getAttribute('r')).filter(Boolean); if (all.length) { let c1 = 1e9, r1 = 1e9, c2 = 0, r2 = 0; for (const r of all) { const mm = /^([A-Z]+)(\d+)$/.exec(r); const cc = this.colN(mm[1]), rr = +mm[2]; c1 = Math.min(c1, cc); c2 = Math.max(c2, cc); r1 = Math.min(r1, rr); r2 = Math.max(r2, rr); } dim.setAttribute('ref', XL.colName(c1) + r1 + (c1 === c2 && r1 === r2 ? '' : ':' + XL.colName(c2) + r2)); } }
      pkg.setXml(part, doc);
      changed++;
    }
    if (sw) sw.save();
    // Druckbereich, Drucktitel, Filterbereich: Namen der Mappe (1.72)
    if (typeof OfficeXT !== 'undefined') {
      const wb = await pkg.xml(pkg.main), rels = await pkg.rels(pkg.main);
      const els = X.q(wb, S, 'sheet');
      const idxOf = (b) => els.findIndex(e => { const r = rels.find(x => x.id === X.at(e, Ooxml.NS.r, 'id')); return r && r.path === parts.get(b.id); });
      const nm = OfficeXT.writeNames(wb, p.boxes.filter(b => b.sheet && b.ox && b.ox.k === 'xl' && parts.has(b.id)), idxOf);
      if (OfficeXT.writeBook(wb, p) || nm) { pkg.setXml(pkg.main, wb); changed++; }
    }
    if (changed) {
      // Excel soll beim Öffnen neu rechnen; Rechenkette entfernen (würde sonst nicht mehr stimmen)
      const wb = await pkg.xml(pkg.main);
      let cp = X.q(wb, S, 'calcPr')[0];
      if (!cp) { cp = X.mk(wb, S, 'calcPr'); const after = ['oleSize', 'customWorkbookViews', 'pivotCaches', 'smartTagPr', 'smartTagTypes', 'webPublishing', 'fileRecoveryPr', 'webPublishObjects', 'extLst'].map(t => X.kid(wb.documentElement, S, t)).find(Boolean); if (after) after.before(cp); else wb.documentElement.append(cp); }
      cp.setAttribute('fullCalcOnLoad', '1');
      pkg.setXml(pkg.main, wb);
      const rels = await pkg.rels(pkg.main);
      const cc = rels.find(r => /calcChain$/.test(r.type));
      if (cc && formulas) { await pkg.removeRel(pkg.main, cc.id); await pkg.removePart(cc.path); }
    }
    return { changed };
  },
};
if (typeof module !== 'undefined') module.exports = { OfficeXl };
