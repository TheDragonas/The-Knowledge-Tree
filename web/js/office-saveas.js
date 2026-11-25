'use strict';
/* „Speichern unter“ mit Dateityp (1.71) – wie in Word/Excel/PowerPoint: Auswahlliste, voreingestellt das neueste Format.
 *
 *   Excel:      .xlsx (Standard) · .xlsm · .xltx · .xls (Excel 97–2003, Werte und Formate) · .ods · .csv (;) · .csv UTF-8 (,) · .txt (Tabstopp)
 *   Word:       .docx (Standard) · .docm · .dotx · .rtf · .odt · .html · .md · .txt
 *   PowerPoint: .pptx (Standard) · .pptm · .ppsx (Bildschirmpräsentation) · .potx · .ppsm · .potm
 *
 * Office-Open-XML-Varianten: dieselbe Datei (verlustfrei, wie bisher) mit anderem Inhaltstyp des Hauptteils – Makros
 * (vbaProject) bleiben nur in Formaten mit Makros, sonst werden sie entfernt (wie Excel/Word beim Speichern).
 * Alle anderen Formate entstehen aus dem Inhalt der Seite (Excel: Blätter, Werte, Formate; Word: Absätze, Läufe,
 * Listen, Tabellen) – siehe die Hinweise in der Auswahlliste. */
const OfficeSaveAs = {
  TYPES: {
    xlsx: [
      ['xlsx', 'Excel-Arbeitsmappe (*.xlsx)', 'Neuestes Format – alles bleibt erhalten'],
      ['xlsm', 'Excel-Arbeitsmappe mit Makros (*.xlsm)', 'Wie .xlsx, VBA-Makros aus der Datei bleiben erhalten'],
      ['xltx', 'Excel-Vorlage (*.xltx)', 'Als Vorlage für neue Mappen'],
      ['xls', 'Excel 97–2003-Arbeitsmappe (*.xls)', 'Für alte Excel-Versionen: Werte, Formate, Spaltenbreiten, verbundene Zellen – Formeln als Ergebnis'],
      ['ods', 'OpenDocument-Tabelle (*.ods)', 'LibreOffice/OpenOffice: Werte, Formeln, Formate'],
      ['csv', 'CSV (Trennzeichen-getrennt, ;) (*.csv)', 'Nur das aktuelle Blatt, nur Werte – Excel Schweiz/Deutschland'],
      ['csvu', 'CSV UTF-8 (Komma-getrennt) (*.csv)', 'Nur das aktuelle Blatt, nur Werte – international'],
      ['txt', 'Text (Tabstopp-getrennt) (*.txt)', 'Nur das aktuelle Blatt, nur Werte'],
      ['html', 'Webseite (*.html)', 'Alle sichtbaren Blätter als Tabellen mit Farben, Schrift und verbundenen Zellen – im Browser lesbar'],
      ['pdf', 'PDF (*.pdf)', 'Über den Druckdialog („Als PDF speichern“) – so, wie die Tabelle aussieht'],
    ],
    docx: [
      ['docx', 'Word-Dokument (*.docx)', 'Neuestes Format – alles bleibt erhalten'],
      ['docm', 'Word-Dokument mit Makros (*.docm)', 'Wie .docx, VBA-Makros aus der Datei bleiben erhalten'],
      ['dotx', 'Word-Vorlage (*.dotx)', 'Als Vorlage für neue Dokumente'],
      ['rtf', 'Rich Text Format (*.rtf)', 'Öffnet in jedem Word (auch 97–2003): Text, Überschriften, Listen, Tabellen, Schrift'],
      ['odt', 'OpenDocument-Text (*.odt)', 'LibreOffice/OpenOffice: Text, Überschriften, Listen, Tabellen, Schrift'],
      ['html', 'Webseite (*.html)', 'Seiten wie in Word – Seitenansicht mit einer, zwei oder mehreren Seiten, Zoom, Suche und Inhaltsverzeichnis-Sprüngen, im Browser lesbar'],
      ['htm', 'Webseite, gefiltert (*.htm)', 'Nur Text mit Formatierung, ohne Seiten (klein, zum Weiterverarbeiten)'],
      ['md', 'Markdown (*.md)', 'Text mit Überschriften, Listen, fett/kursiv'],
      ['txt', 'Nur Text (*.txt)', 'Ohne Formatierung'],
      ['pdf', 'PDF (*.pdf)', 'Über den Druckdialog („Als PDF speichern“) – so, wie das Dokument aussieht'],
    ],
    pptx: [
      ['pptx', 'PowerPoint-Präsentation (*.pptx)', 'Neuestes Format – alles bleibt erhalten'],
      ['pptm', 'PowerPoint-Präsentation mit Makros (*.pptm)', 'Wie .pptx, VBA-Makros aus der Datei bleiben erhalten'],
      ['ppsx', 'PowerPoint-Bildschirmpräsentation (*.ppsx)', 'Startet beim Öffnen direkt die Vorführung'],
      ['potx', 'PowerPoint-Vorlage (*.potx)', 'Als Vorlage für neue Präsentationen'],
      ['ppsm', 'Bildschirmpräsentation mit Makros (*.ppsm)', 'Vorführung, VBA-Makros bleiben erhalten'],
      ['potm', 'PowerPoint-Vorlage mit Makros (*.potm)', 'Vorlage, VBA-Makros bleiben erhalten'],
      ['odp', 'OpenDocument-Präsentation (*.odp)', 'LibreOffice/OpenOffice: Folien mit Texten, Bildern und Hintergrundfarbe (ohne Animationen)'],
      ['rtf', 'Gliederung/RTF (*.rtf)', 'Titel und Texte aller Folien als Gliederung – öffnet in Word'],
      ['html', 'Webseite (*.html)', 'Alle Folien untereinander: Texte und Bilder an ihrer Stelle'],
      ['txt', 'Nur Text (*.txt)', 'Titel und Texte aller Folien ohne Formatierung'],
      ['pdf', 'PDF (*.pdf)', 'Über den Druckdialog („Als PDF speichern“) – eine Folie je Blatt'],
    ],
  },
  /* Gruppen der Auswahlliste (1.72): neuestes Format zuerst, dann Varianten, andere Programme, Text/Web, PDF */
  GROUP: [['new', 'Neuestes Format (empfohlen)'], ['var', 'Varianten (Makros, Vorlagen, Bildschirmpräsentation)'], ['old', 'Ältere Versionen und andere Programme'], ['text', 'Text und Web'], ['pdf', 'Drucken']],
  groupOf(fmt, k) {
    if (k === this.TYPES[fmt][0][0]) return 'new';
    if (this.MAIN[k]) return 'var';
    if (k === 'pdf') return 'pdf';
    if (/^(xls|ods|odt|odp)$/.test(k) || (k === 'rtf' && fmt === 'docx')) return 'old';
    return 'text';
  },
  /* Auswahlliste „Dateityp“ mit Gruppen; ohne pdf, wenn nicht möglich (mehrere Seiten auf einmal) */
  typeSelect(fmt, value, opts = {}) {
    const sel = el('select', { class: 'sa-type' });
    if (opts.original) sel.append(el('option', { value: 'orig', text: 'Original (unverändert, wie importiert)' }));
    for (const [g, label] of this.GROUP) {
      const items = this.TYPES[fmt].filter(t => this.groupOf(fmt, t[0]) === g && !(opts.noPdf && t[0] === 'pdf'));
      if (!items.length) continue;
      const og = el('optgroup', { label });
      for (const [k, l, h] of items) og.append(el('option', { value: k, text: l, title: h }));
      sel.append(og);
    }
    sel.value = value && [...sel.options].some(o => o.value === value) ? value : this.TYPES[fmt][0][0];
    return sel;
  },
  hintOf(fmt, k) { const t = this.TYPES[fmt].find(x => x[0] === k); return k === 'orig' ? 'Die Datei, wie sie importiert bzw. erstellt wurde – ohne Änderungen' : t ? t[2] : ''; },
  /* Hauptteil-Inhaltstyp je OOXML-Variante */
  MAIN: {
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml', xlsm: 'application/vnd.ms-excel.sheet.macroEnabled.main+xml',
    xltx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.template.main+xml', xltm: 'application/vnd.ms-excel.template.macroEnabled.main+xml',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml', docm: 'application/vnd.ms-word.document.macroEnabled.main+xml',
    dotx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.template.main+xml', dotm: 'application/vnd.ms-word.template.macroEnabledTemplate.main+xml',
    pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml', pptm: 'application/vnd.ms-powerpoint.presentation.macroEnabled.main+xml',
    ppsx: 'application/vnd.openxmlformats-officedocument.presentationml.slideshow.main+xml', ppsm: 'application/vnd.ms-powerpoint.slideshow.macroEnabled.main+xml',
    potx: 'application/vnd.openxmlformats-officedocument.presentationml.template.main+xml', potm: 'application/vnd.ms-powerpoint.template.macroEnabled.main+xml',
  },
  MIME: { xls: 'application/vnd.ms-excel', ods: 'application/vnd.oasis.opendocument.spreadsheet', csv: 'text/csv', csvu: 'text/csv', txt: 'text/plain', rtf: 'application/rtf', odt: 'application/vnd.oasis.opendocument.text', html: 'text/html', htm: 'text/html', md: 'text/markdown' },

  /* Dialog: Dateiname + Dateityp (voreingestellt das neueste Format) */
  async dialog() {
    const p = OfficePages.page();
    if (!p) return;
    await Save.flushAll();
    const fmt = p.office.fmt, list = this.TYPES[fmt];
    const v = await UI.dialog((dlg, close) => {
      dlg.classList.add('kt-saveas');
      dlg.append(el('h2', { text: 'Speichern unter' }));
      const name = el('input', { type: 'text', class: 'sa-name', value: (p.title || 'Datei').replace(/[<>:"/\\|?*\u0000-\u001f]+/g, '_').trim() });
      const sel = this.typeSelect(fmt, list[0][0]);   // neuestes Format als Voreinstellung
      const hint = el('p', { class: 'bs-note sa-hint' });
      const upd = () => { hint.textContent = this.hintOf(fmt, sel.value); };
      sel.addEventListener('change', upd); upd();
      const ok = el('button', { class: 'btn primary', type: 'button', text: 'Speichern' });
      ok.addEventListener('click', () => close({ name: name.value.trim() || 'Datei', type: sel.value }));
      name.addEventListener('keydown', (e) => { if (e.key === 'Enter') ok.click(); });
      dlg.append(el('label', { class: 'sa-row' }, el('span', { text: 'Dateiname' }), name), el('label', { class: 'sa-row' }, el('span', { text: 'Dateityp' }), sel), hint,
        p.office.src ? el('p', { class: 'bs-note', text: `Diese Seite wurde aus „${p.office.src.name}“ umgewandelt. Das Original gibt es unverändert über „Original speichern“.` }) : '',
        el('div', { class: 'dlg-btns' }, el('button', { class: 'btn', type: 'button', text: 'Abbrechen', onclick: () => close(null) }), ok));
      setTimeout(() => { name.focus(); name.select(); }, 30);
    });
    if (!v) return;
    try { await this.save(p, v.type, v.name); }
    catch (e) { console.error(e); UI.info('Speichern unter', `<p>Konnte nicht als ${escapeHtml(v.type)} gespeichert werden:</p><p><code>${escapeHtml(e.message)}</code></p>`); }
  },
  async save(p, type, name) {
    if (type === 'pdf') return this.pdf(p);
    const r = await this.build(p, type);
    Export.download(Export.safe(name) + '.' + r.ext, r.blob);
    if (r.note) UI.toast(r.note, 5000);
  },
  /* Seite → { blob, ext, note } im gewünschten Format */
  async build(p, type) {
    const fmt = p.office.fmt;
    if (this.MAIN[type]) {
      const cur = await OfficePages.current(p);
      if (type === fmt && !/\.(xlsm|xltx|xltm|docm|dotx|dotm|pptm|ppsx|ppsm|potx|potm)$/i.test(p.office.name || '')) return { blob: cur.blob, ext: type };
      return this.ooxmlAs(cur.blob, type);
    }
    if (fmt === 'xlsx') {
      const book = this.bookOf(p);
      if (type === 'html') return { blob: new Blob([this.bookHtml(book, p.title)], { type: 'text/html' }), ext: 'html' };
      if (type === 'xls') return { blob: this.xls(book), ext: 'xls', note: book.formulas ? 'Excel 97–2003: Formeln als Ergebnis gespeichert (für Formeln .xlsx verwenden)' : '' };
      if (type === 'ods') return { blob: await this.ods(book), ext: 'ods' };
      const sh = book.sheets[book.cur] || book.sheets[0];
      const sep = type === 'csv' ? ';' : type === 'csvu' ? ',' : '\t';
      return { blob: new Blob(['\uFEFF' + this.delimited(sh, sep)], { type: 'text/plain;charset=utf-8' }), ext: type === 'txt' ? 'txt' : 'csv', note: book.sheets.length > 1 ? `Nur das Blatt „${sh.name}“ gespeichert (${type === 'txt' ? 'Text' : 'CSV'} kennt nur ein Blatt)` : '' };
    }
    if (fmt === 'docx') {
      const doc = await this.docOf(await OfficePages.current(p));
      if (type === 'rtf') return { blob: new Blob([this.rtf(doc)], { type: 'application/rtf' }), ext: 'rtf' };
      if (type === 'odt') return { blob: await this.odt(doc), ext: 'odt' };
      if (type === 'html' && typeof OfficeReader !== 'undefined' && OfficeReader.isDoc(p) && Canvas.page === p) return { blob: new Blob([await Export.docHtml(p)], { type: 'text/html' }), ext: 'html' };
      if (type === 'html' || type === 'htm') return { blob: new Blob([this.html(doc, p.title)], { type: 'text/html' }), ext: type };
      if (type === 'md') return { blob: new Blob([this.md(doc)], { type: 'text/markdown' }), ext: 'md' };
      return { blob: new Blob(['\uFEFF' + this.txt(doc)], { type: 'text/plain;charset=utf-8' }), ext: 'txt' };
    }
    if (fmt === 'pptx') {
      const deck = await this.deckOf(await OfficePages.current(p));
      if (type === 'odp') return { blob: await this.odp(deck), ext: 'odp', note: deck.notes.length ? deck.notes.join(' ') : '' };
      const doc = this.outline(deck);
      if (type === 'rtf') return { blob: new Blob([this.rtf(doc)], { type: 'application/rtf' }), ext: 'rtf' };
      if (type === 'html') return { blob: new Blob([this.deckHtml(deck, p.title)], { type: 'text/html' }), ext: 'html' };
      if (type === 'txt') return { blob: new Blob(['\uFEFF' + this.txt(doc)], { type: 'text/plain;charset=utf-8' }), ext: 'txt' };
    }
    throw new Error('Unbekannter Dateityp');
  },
  /* OOXML-Variante: Inhaltstyp des Hauptteils ändern; ohne Makro-Format Makros entfernen */
  async ooxmlAs(blob, type) {
    const pkg = await Ooxml.open(blob);
    let ct = await pkg.text('[Content_Types].xml');
    const want = this.MAIN[type];
    ct = ct.replace(new RegExp(`(PartName="/${pkg.main.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"\\s+ContentType=")[^"]+(")`), `$1${want}$2`);
    const macro = /m$/.test(type);
    let note = '';
    if (!macro) {
      const rels = await pkg.rels(pkg.main);
      for (const r of rels.filter(x => /vbaProject$/.test(x.type))) { await pkg.removeRel(pkg.main, r.id); if (pkg.has(r.path)) await pkg.removePart(r.path); note = 'Die Makros (VBA) wurden entfernt – dieses Format kann keine Makros enthalten.'; }
      ct = await pkg.text('[Content_Types].xml').then(t => t.replace(new RegExp(`(PartName="/${pkg.main.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"\\s+ContentType=")[^"]+(")`), `$1${want}$2`));
    }
    pkg.setText('[Content_Types].xml', ct);
    const out = await pkg.save();
    return { blob: new Blob([out], { type: Ooxml.MIME[{ x: 'xlsx', d: 'docx', p: 'pptx' }[type[0]]] }), ext: type, note };
  },

  /* ================================================================ Excel: Inhalt der Seite */
  bookOf(p) {
    const boxes = OfficeView.sheets(p), cur = OfficeView.curSheet(p);
    const book = { sheets: [], formulas: 0, cur: Math.max(0, boxes.findIndex(b => b.id === cur)), font: null };
    for (const b of boxes) {
      const d = b.sheet;
      if (!book.font && d.xl) book.font = { n: d.xl.fn, s: d.xl.fs };
      const sh = { name: d.name, hidden: b.ox && b.ox.hid ? b.ox.hid : '', cells: {}, cols: {}, rowh: {}, merges: d.merges || [], freeze: d.freeze || null, hideR: d.hideR || [], hideC: d.hideC || [], nrows: 0, ncols: 0 };
      for (const [k, cell] of Object.entries(d.cells)) {
        const pk = XL.parseKey(k); if (!pk) continue;
        const raw = cell.v == null ? '' : String(cell.v);
        let v = raw === '' ? null : Sheet.value(b.id, pk.c, pk.r);
        if (v && typeof v === 'object') v = v.err || (XL.isErr && XL.isErr(v) ? String(v) : null);
        if (v instanceof Date) v = null;
        const c = { v };
        if (XL.isFormula(raw)) { c.f = OfficeXl.toExcel(raw); book.formulas++; }
        const f = cell.f || (d.xl && d.xl.f0);
        if (f && Object.keys(f).length) c.s = f;
        if (v == null && !c.s) continue;
        sh.cells[k] = c;
        sh.nrows = Math.max(sh.nrows, pk.r + 1); sh.ncols = Math.max(sh.ncols, pk.c + 1);
      }
      d.cols.forEach((w, i) => { if (i < Math.max(sh.ncols + 5, 30) && Math.abs(w - (d.xl ? d.xl.cw : 96)) > 1) sh.cols[i] = Math.max(1, (w - 5) / 7); });
      if (d.rowh) for (const [r, h] of Object.entries(d.rowh)) sh.rowh[r] = Math.round(h * 72 / 96 * 4) / 4;
      if (d.xl) sh.defw = Math.max(1, (d.xl.cw - 5) / 7);
      book.sheets.push(sh);
    }
    if (!book.font) book.font = { n: 'Calibri', s: 11 };
    return book;
  },
  /* Wert so, wie er in der Zelle steht (für Text-Formate; Zahlen ohne Tausender-Trennzeichen) */
  textOf(c) {
    const v = c.v;
    if (v == null) return '';
    if (typeof v === 'boolean') return v ? 'WAHR' : 'FALSCH';
    if (typeof v === 'number') {
      const s = c.s || {};
      if (s.nf === 'date' || s.nf === 'datel' || s.nf === 'time' || s.nf === 'dt' || /[dmyhs]/i.test(s.nfc || '') && !/[0#]/.test(s.nfc || '')) return XL.format(v, s).t;
      return String(Math.round(v * 1e12) / 1e12);
    }
    return String(v);
  },
  delimited(sh, sep) {
    const lines = [];
    for (let r = 0; r < sh.nrows; r++) {
      const row = [];
      for (let c = 0; c < sh.ncols; c++) {
        const cell = sh.cells[XL.key(c, r)];
        const t = cell ? this.textOf(cell) : '';
        row.push(sep !== '\t' && (t.includes(sep) || /["\n\r]/.test(t)) ? '"' + t.replace(/"/g, '""') + '"' : t.replace(/[\t\r\n]+/g, ' '));
      }
      lines.push(row.join(sep).replace(new RegExp((sep === '\t' ? '\\t' : '\\' + sep) + '+$'), ''));
    }
    while (lines.length && !lines[lines.length - 1]) lines.pop();
    return lines.join('\r\n') + '\r\n';
  },

  /* ---------------------------------------------------------------- Excel 97–2003 (.xls, BIFF8 in einer Verbunddatei) */
  xls(book) {
    const recs = [];   // [{ t, data }]
    const rec = (t, data) => recs.push({ t, data });
    const B = (n) => new DataView(new ArrayBuffer(n));
    const u16 = (v) => { const d = B(2); d.setUint16(0, v, true); return new Uint8Array(d.buffer); };
    const cat = (...a) => { const n = a.reduce((s, x) => s + x.length, 0), o = new Uint8Array(n); let p = 0; for (const x of a) { o.set(x, p); p += x.length; } return o; };
    const ustr16 = (s) => { const t = String(s); const o = B(3 + t.length * 2); o.setUint16(0, t.length, true); o.setUint8(2, 1); for (let i = 0; i < t.length; i++) o.setUint16(3 + i * 2, t.charCodeAt(i), true); return new Uint8Array(o.buffer); };
    const ustr8 = (s) => { const t = String(s).slice(0, 255); const o = B(2 + t.length * 2); o.setUint8(0, t.length); o.setUint8(1, 1); for (let i = 0; i < t.length; i++) o.setUint16(2 + i * 2, t.charCodeAt(i), true); return new Uint8Array(o.buffer); };
    // Palette: Standardfarben 8–63, eigene Farben ersetzen von hinten
    const pal = OfficeGrid.PALETTE.slice(0, 64);
    let slot = 63;
    const colorIdx = (hex) => {
      if (!hex) return null;
      const h = hex.replace('#', '').toUpperCase();
      for (let i = 8; i < 64; i++) if (pal[i] === h) return i;
      if (slot < 8) { let best = 8, bd = 1e9; const rgb = [0, 2, 4].map(k => parseInt(h.slice(k, k + 2), 16)); for (let i = 8; i < 64; i++) { const q = [0, 2, 4].map(k => parseInt(pal[i].slice(k, k + 2), 16)); const dd = q.reduce((s, x, k) => s + (x - rgb[k]) ** 2, 0); if (dd < bd) { bd = dd; best = i; } } return best; }
      pal[slot] = h;
      return slot--;
    };
    // Schriften, Zahlenformate, Zellformate
    const f0 = book.font || { n: 'Calibri', s: 11 };
    const fonts = [], fontKey = new Map();
    const fontRec = (o) => { const d = B(14); d.setUint16(0, Math.round((o.s || f0.s) * 20), true); d.setUint16(2, (o.i ? 2 : 0) | (o.st ? 8 : 0), true); d.setUint16(4, o.c != null ? o.c : 0x7FFF, true); d.setUint16(6, o.b ? 700 : 400, true); d.setUint16(8, 0, true); d.setUint8(10, o.u ? 1 : 0); d.setUint8(11, 2); d.setUint8(12, 0); return cat(new Uint8Array(d.buffer), ustr8(o.n || f0.n)); };
    const fontOf = (s) => {
      const o = { n: s.fn || f0.n, s: s.fs || f0.s, b: !!s.b, i: !!s.i, u: !!s.u, st: !!s.s, c: s.c ? colorIdx(s.c) : null };
      const k = JSON.stringify(o);
      if (fontKey.has(k)) return fontKey.get(k);
      fonts.push(o);
      const i = fonts.length - 1 + 4 + 1;   // 4 Standardschriften, Index 4 gibt es nicht
      fontKey.set(k, i);
      return i;
    };
    const fmts = [], fmtKey = new Map();
    const fmtOf = (s) => {
      const code = OfficeConvert.nfCode(s);
      if (!code) return 0;
      const bi = Object.entries(OfficeGrid.BUILTIN_FMT).find(([, c]) => c === code);
      if (bi && +bi[0] < 50) return +bi[0];
      if (!fmtKey.has(code)) { fmts.push(code); fmtKey.set(code, 164 + fmts.length - 1); }
      return fmtKey.get(code);
    };
    const xfs = [], xfKey = new Map();
    const xfRec = (font, fmt, s, style) => {
      const d = B(20);
      d.setUint16(0, font, true); d.setUint16(2, fmt, true);
      d.setUint16(4, style ? 0xFFF5 : 0x0001, true);
      const alc = s.al === 'l' ? 1 : s.al === 'c' ? 2 : s.al === 'r' ? 3 : s.al === 'j' ? 5 : 0, alcV = s.va === 't' ? 0 : s.va === 'm' ? 1 : 2;
      d.setUint8(6, alc | (s.wr ? 8 : 0) | (alcV << 4)); d.setUint8(7, 0); d.setUint8(8, Math.min(15, s.in || 0)); d.setUint8(9, style ? 0 : 0xFC);
      const bd = s.bd || '', st = (k) => bd.includes(k.toUpperCase()) ? 2 : bd.includes(k) ? 1 : 0;
      d.setUint32(10, (st('l') | (st('r') << 4) | (st('t') << 8) | (st('b') << 12) | (64 << 16) | (64 << 23)) >>> 0, true);
      const bg = s.bg ? colorIdx(s.bg) : null;
      d.setUint32(14, ((64) | (64 << 7) | ((bg != null ? 1 : 0) << 26)) >>> 0, true);
      d.setUint16(18, (bg != null ? bg : 64) | (65 << 7), true);
      return new Uint8Array(d.buffer);
    };
    const xfOf = (s) => {
      if (!s || !Object.keys(s).length) return 15;
      const k = JSON.stringify(s);
      if (xfKey.has(k)) return xfKey.get(k);
      xfs.push(xfRec(fontOf(s), fmtOf(s), s, false));
      const i = 16 + xfs.length - 1;
      xfKey.set(k, i);
      return i;
    };
    // gemeinsame Zeichenketten
    const sst = [], sstKey = new Map();
    const sstOf = (t) => { if (!sstKey.has(t)) { sst.push(t); sstKey.set(t, sst.length - 1); } return sstKey.get(t); };
    // ---- Blätter zuerst (damit Formate/Zeichenketten bekannt sind)
    const sheetRecs = book.sheets.map((sh, si) => {
      const R = [];
      const r = (t, data) => R.push({ t, data });
      const bof = B(16); bof.setUint16(0, 0x0600, true); bof.setUint16(2, 0x0010, true); bof.setUint16(4, 0x0DBB, true); bof.setUint16(6, 0x07CC, true); bof.setUint32(8, 0, true); bof.setUint32(12, 6, true);
      r(0x0809, new Uint8Array(bof.buffer));
      const nr = Math.max(1, sh.nrows), nc = Math.max(1, sh.ncols);
      const dim = B(14); dim.setUint32(0, 0, true); dim.setUint32(4, nr, true); dim.setUint16(8, 0, true); dim.setUint16(10, nc, true); r(0x0200, new Uint8Array(dim.buffer));
      if (sh.defw) r(0x0055, u16(Math.round(sh.defw)));
      const colKeys = new Set([...Object.keys(sh.cols).map(Number), ...sh.hideC]);
      for (const c of [...colKeys].sort((a, b) => a - b)) { if (c > 255) continue; const d = B(12); d.setUint16(0, c, true); d.setUint16(2, c, true); d.setUint16(4, Math.min(65535, Math.round((sh.cols[c] || sh.defw || 8.43) * 256 + 182)), true); d.setUint16(6, 15, true); d.setUint16(8, sh.hideC.includes(c) ? 1 : 0, true); r(0x007D, new Uint8Array(d.buffer)); }
      const rowKeys = new Set([...Object.keys(sh.rowh).map(Number), ...sh.hideR]);
      for (const rw of [...rowKeys].sort((a, b) => a - b)) { if (rw > 65535) continue; const d = B(16); d.setUint16(0, rw, true); d.setUint16(6, Math.round((sh.rowh[rw] || f0.s * 1.36) * 20), true); d.setUint16(12, 0x0100 | (sh.hideR.includes(rw) ? 0x20 : 0) | (sh.rowh[rw] ? 0x40 : 0), true); d.setUint16(14, 15, true); r(0x0208, new Uint8Array(d.buffer)); }
      const keys = Object.keys(sh.cells).map(k => [k, XL.parseKey(k)]).filter(([, p]) => p && p.r < 65536 && p.c < 256).sort((a, b) => a[1].r - b[1].r || a[1].c - b[1].c);
      for (const [k, pk] of keys) {
        const c = sh.cells[k], ix = xfOf(c.s);
        const head = () => { const d = B(6); d.setUint16(0, pk.r, true); d.setUint16(2, pk.c, true); d.setUint16(4, ix, true); return new Uint8Array(d.buffer); };
        const v = c.v;
        if (v == null || v === '') r(0x0201, head());
        else if (typeof v === 'number') { const d = B(8); d.setFloat64(0, isFinite(v) ? v : 0, true); r(0x0203, cat(head(), new Uint8Array(d.buffer))); }
        else if (typeof v === 'boolean') r(0x0205, cat(head(), new Uint8Array([v ? 1 : 0, 0])));
        else { const em = { '#NULL!': 0, '#DIV/0!': 7, '#VALUE!': 15, '#WERT!': 15, '#REF!': 23, '#BEZUG!': 23, '#NAME?': 29, '#NUM!': 36, '#ZAHL!': 36, '#N/A': 42, '#NV': 42 }[v]; if (em != null) r(0x0205, cat(head(), new Uint8Array([em, 1]))); else { const d = B(4); d.setUint32(0, sstOf(String(v)), true); r(0x00FD, cat(head(), new Uint8Array(d.buffer))); } }
      }
      const fz = sh.freeze && (sh.freeze.r || sh.freeze.c);
      const w2 = B(18); w2.setUint16(0, 0xB6 | (si === book.cur ? 0x600 : 0) | (fz ? 0x108 : 0), true); w2.setUint32(6, 64, true); r(0x023E, new Uint8Array(w2.buffer));
      if (fz) { const d = B(10); d.setUint16(0, sh.freeze.c || 0, true); d.setUint16(2, sh.freeze.r || 0, true); d.setUint16(4, sh.freeze.r || 0, true); d.setUint16(6, sh.freeze.c || 0, true); d.setUint8(8, sh.freeze.r && sh.freeze.c ? 0 : sh.freeze.r ? 2 : 1); r(0x0041, new Uint8Array(d.buffer)); }
      const mg = (sh.merges || []).map(m => XL.parseRange(m)).filter(g => g && g.r2 < 65536 && g.c2 < 256);
      for (let i = 0; i < mg.length; i += 1000) { const part = mg.slice(i, i + 1000); const d = B(2 + part.length * 8); d.setUint16(0, part.length, true); part.forEach((g, j) => { d.setUint16(2 + j * 8, g.r1, true); d.setUint16(4 + j * 8, g.r2, true); d.setUint16(6 + j * 8, g.c1, true); d.setUint16(8 + j * 8, g.c2, true); }); r(0x00E5, new Uint8Array(d.buffer)); }
      r(0x000A, new Uint8Array(0));
      return R;
    });
    // ---- Arbeitsmappe
    const bof = B(16); bof.setUint16(0, 0x0600, true); bof.setUint16(2, 0x0005, true); bof.setUint16(4, 0x0DBB, true); bof.setUint16(6, 0x07CC, true); bof.setUint32(12, 6, true);
    rec(0x0809, new Uint8Array(bof.buffer));
    rec(0x0042, u16(1200));
    const w1 = B(18); w1.setUint16(4, 0x3A00, true); w1.setUint16(6, 0x2000, true); w1.setUint16(8, 0x0038, true); w1.setUint16(10, book.cur, true); w1.setUint16(14, 1, true); w1.setUint16(16, 0x0258, true); rec(0x003D, new Uint8Array(w1.buffer));
    rec(0x0022, u16(0));
    for (let i = 0; i < 4; i++) rec(0x0031, fontRec({ n: f0.n, s: f0.s }));
    for (const o of fonts) rec(0x0031, fontRec(o));
    fmts.forEach((code, i) => rec(0x041E, cat(u16(164 + i), ustr16(code))));
    for (let i = 0; i < 15; i++) rec(0x00E0, xfRec(0, 0, {}, true));
    rec(0x00E0, xfRec(0, 0, {}, false));
    for (const x of xfs) rec(0x00E0, x);
    rec(0x0293, new Uint8Array([0x00, 0x80, 0x00, 0xFF]));
    { const d = B(2 + 56 * 4); d.setUint16(0, 56, true); for (let i = 8; i < 64; i++) { const h = pal[i]; d.setUint8(2 + (i - 8) * 4, parseInt(h.slice(0, 2), 16)); d.setUint8(3 + (i - 8) * 4, parseInt(h.slice(2, 4), 16)); d.setUint8(4 + (i - 8) * 4, parseInt(h.slice(4, 6), 16)); } rec(0x0092, new Uint8Array(d.buffer)); }
    const bsIdx = [];
    book.sheets.forEach((sh) => { bsIdx.push(recs.length); const d = B(6); d.setUint8(4, sh.hidden === 'veryHidden' ? 2 : sh.hidden ? 1 : 0); rec(0x0085, cat(new Uint8Array(d.buffer), ustr8(String(sh.name).replace(/[:\\/?*[\]]/g, '_').slice(0, 31) || 'Tabelle'))); });
    // SST mit CONTINUE (max. 8224 Byte je Datensatz; Zeichen dürfen getrennt werden, dann neues Optionsbyte)
    const sstStart = recs.length;
    if (sst.length) {
      const MAX = 8224;
      let cur = []; let len = 8;
      const head = B(8); head.setUint32(0, Object.values(book.sheets).reduce((n, sh) => n + Object.values(sh.cells).filter(c => typeof c.v === 'string' && c.v !== '').length, 0), true); head.setUint32(4, sst.length, true);
      cur.push(new Uint8Array(head.buffer));
      const parts = [];
      const flush = () => { parts.push(cat(...cur)); cur = []; len = 0; };
      const ext = [];   // für EXTSST: (Teil, Versatz) des ersten Strings je Bucket
      const dsst = Math.max(8, Math.ceil(sst.length / 128));
      sst.forEach((t, k) => {
        if (len + 3 + 2 > MAX) flush();
        if (k % dsst === 0) ext.push([parts.length, len]);
        const hd = B(3); hd.setUint16(0, t.length, true); hd.setUint8(2, 1); cur.push(new Uint8Array(hd.buffer)); len += 3;
        let i = 0;
        while (i < t.length) {
          let room = Math.floor((MAX - len) / 2);
          if (room <= 0) { flush(); cur.push(new Uint8Array([1])); len = 1; room = Math.floor((MAX - len) / 2); }
          const n = Math.min(room, t.length - i), d = B(n * 2);
          for (let j = 0; j < n; j++) d.setUint16(j * 2, t.charCodeAt(i + j), true);
          cur.push(new Uint8Array(d.buffer)); len += n * 2; i += n;
        }
      });
      if (cur.length) flush();
      parts.forEach((pt, k) => rec(k ? 0x003C : 0x00FC, pt));
      recs[sstStart].ext = { ext, dsst, n: parts.length };
      rec(0x00FF, new Uint8Array(2 + ext.length * 8));   // EXTSST, wird unten gefüllt
    }
    rec(0x000A, new Uint8Array(0));
    // Positionen: Arbeitsmappe, dann die Blätter
    const size = (list) => list.reduce((n, x) => n + 4 + x.data.length, 0);
    let pos = 0;
    const recPos = recs.map(x => { const p0 = pos; pos += 4 + x.data.length; return p0; });
    const sheetPos = [];
    for (const R of sheetRecs) { sheetPos.push(pos); pos += size(R); }
    bsIdx.forEach((ri, k) => new DataView(recs[ri].data.buffer).setUint32(0, sheetPos[k], true));
    if (sst.length) {
      const info = recs[sstStart].ext, ex = recs.find(x => x.t === 0x00FF), d = new DataView(ex.data.buffer);
      d.setUint16(0, info.dsst, true);
      info.ext.forEach(([part, off], k) => { d.setUint32(2 + k * 8, recPos[sstStart + part] + 4 + off, true); d.setUint16(6 + k * 8, 4 + off, true); });
    }
    const all = [...recs, ...sheetRecs.flat()];
    const total = size(all), out = new Uint8Array(Math.max(total, 4096));
    let p = 0;
    for (const x of all) { const h = B(4); h.setUint16(0, x.t, true); h.setUint16(2, x.data.length, true); out.set(new Uint8Array(h.buffer), p); out.set(x.data, p + 4); p += 4 + x.data.length; }
    return new Blob([this.cfbWrite('Workbook', out)], { type: this.MIME.xls });
  },
  /* Verbunddatei mit einem Datenstrom (≥ 4096 Byte, ohne Mini-Stream) */
  cfbWrite(name, data) {
    const SS = 512, ns = Math.ceil(data.length / SS);
    let nf = 1;
    while (nf * 128 < nf + 1 + ns) nf++;
    if (nf > 109) throw new Error('Datei zu gross für Excel 97–2003');
    const total = nf + 1 + ns, out = new Uint8Array(SS * (1 + total)), dv = new DataView(out.buffer);
    // Kopf
    [0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1].forEach((b, i) => { out[i] = b; });
    dv.setUint16(24, 0x003E, true); dv.setUint16(26, 3, true); dv.setUint16(28, 0xFFFE, true); dv.setUint16(30, 9, true); dv.setUint16(32, 6, true);
    dv.setUint32(44, nf, true); dv.setInt32(48, nf, true); dv.setUint32(56, 4096, true); dv.setInt32(60, -2, true); dv.setUint32(64, 0, true); dv.setInt32(68, -2, true); dv.setUint32(72, 0, true);
    for (let i = 0; i < 109; i++) dv.setInt32(76 + i * 4, i < nf ? i : -1, true);
    // FAT
    const fat = (i, v) => dv.setInt32(SS + i * 4, v, true);
    for (let i = 0; i < nf * 128; i++) fat(i, -1);
    for (let i = 0; i < nf; i++) fat(i, -3);
    fat(nf, -2);
    for (let i = 0; i < ns; i++) fat(nf + 1 + i, i === ns - 1 ? -2 : nf + 2 + i);
    // Verzeichnis
    const dir = SS * (1 + nf);
    const entry = (k, nm, type, child, start, size) => {
      const o = dir + k * 128;
      for (let i = 0; i < nm.length; i++) dv.setUint16(o + i * 2, nm.charCodeAt(i), true);
      dv.setUint16(o + 64, (nm.length + 1) * 2, true); out[o + 66] = type; out[o + 67] = 1;
      dv.setInt32(o + 68, -1, true); dv.setInt32(o + 72, -1, true); dv.setInt32(o + 76, child, true);
      dv.setInt32(o + 116, start, true); dv.setUint32(o + 120, size, true);
    };
    entry(0, 'Root Entry', 5, 1, -2, 0);
    entry(1, name, 2, -1, nf + 1, data.length);
    for (let k = 2; k < 4; k++) { const o = dir + k * 128; dv.setInt32(o + 68, -1, true); dv.setInt32(o + 72, -1, true); dv.setInt32(o + 76, -1, true); }
    out.set(data, SS * (2 + nf));
    return out;
  },

  /* ---------------------------------------------------------------- OpenDocument-Tabelle (.ods) */
  odsFormula(f) {
    // Excel → OpenFormula: Bezüge in [.A1], Blätter [$'Name'.A1], Trennzeichen ;
    let out = '', q = false;
    const re = /^(?:(?:'((?:[^']|'')+)'|([A-Za-z_][A-Za-z0-9_.]*))!)?(\$?[A-Z]{1,3}\$?\d+)(?::(\$?[A-Z]{1,3}\$?\d+))?/;
    for (let i = 0; i < f.length;) {
      const ch = f[i];
      if (ch === '"') { q = !q; out += ch; i++; continue; }
      if (q) { out += ch; i++; continue; }
      const prev = out[out.length - 1];
      const m = (!prev || !/[A-Za-z0-9_.$]/.test(prev)) && re.exec(f.slice(i));
      if (m && f[i + m[0].length] !== '(') {
        const sh = m[1] != null ? m[1].replace(/''/g, "'") : m[2];
        const pre = sh ? `$'${sh.replace(/'/g, "''")}'.` : '.';
        out += '[' + pre + m[3] + (m[4] ? ':' + pre + m[4] : '') + ']';
        i += m[0].length; continue;
      }
      out += ch === ',' ? ';' : ch;
      i++;
    }
    return 'of:=' + out.replace(/_xlfn\./g, '');
  },
  async ods(book) {
    const NS = 'xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0" xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0" xmlns:of="urn:oasis:names:tc:opendocument:xmlns:of:1.2" xmlns:number="urn:oasis:names:tc:opendocument:xmlns:datastyle:1.0" office:version="1.2"';
    const X = '<?xml version="1.0" encoding="UTF-8"?>';
    const x = (s) => OfficeConvert.xt(s);
    const auto = [], cellStyle = new Map(), colStyle = new Map();
    const cm = (px) => (px * 2.54 / 96).toFixed(3) + 'cm';
    const csOf = (s) => {
      if (!s || !Object.keys(s).length) return null;
      const k = JSON.stringify(s);
      if (cellStyle.has(k)) return cellStyle.get(k);
      const n = 'ce' + (cellStyle.size + 1);
      const bd = s.bd || '', side = (c) => bd.includes(c.toUpperCase()) ? '1.5pt solid #000000' : bd.includes(c) ? '0.5pt solid #000000' : null;
      const tc = (s.bg ? ` fo:background-color="${s.bg}"` : '') + (s.va ? ` style:vertical-align="${s.va === 't' ? 'top' : 'middle'}"` : '') + (s.wr ? ' fo:wrap-option="wrap"' : '') + [['t', 'top'], ['b', 'bottom'], ['l', 'left'], ['r', 'right']].map(([c, nme]) => side(c) ? ` fo:border-${nme}="${side(c)}"` : '').join('');
      const tp = (s.b ? ' fo:font-weight="bold"' : '') + (s.i ? ' fo:font-style="italic"' : '') + (s.u ? ' style:text-underline-style="solid" style:text-underline-width="auto" style:text-underline-color="font-color"' : '') + (s.s ? ' style:text-line-through-style="solid"' : '') + (s.c ? ` fo:color="${s.c}"` : '') + (s.fs ? ` fo:font-size="${s.fs}pt"` : '') + (s.fn ? ` style:font-name="${x(s.fn)}"` : '');
      const pp = s.al ? ` fo:text-align="${{ l: 'start', c: 'center', r: 'end', j: 'justify' }[s.al]}"` : '';
      auto.push(`<style:style style:name="${n}" style:family="table-cell" style:parent-style-name="Default">${tc ? `<style:table-cell-properties${tc}/>` : ''}${pp ? `<style:paragraph-properties${pp}/>` : ''}${tp ? `<style:text-properties${tp}/>` : ''}</style:style>`);
      cellStyle.set(k, n);
      return n;
    };
    const coOf = (cmw) => { if (!colStyle.has(cmw)) { const n = 'co' + (colStyle.size + 1); auto.push(`<style:style style:name="${n}" style:family="table-column"><style:table-column-properties style:column-width="${cmw}"/></style:style>`); colStyle.set(cmw, n); } return colStyle.get(cmw); };
    const fonts = new Set([book.font.n]);
    for (const sh of book.sheets) for (const c of Object.values(sh.cells)) if (c.s && c.s.fn) fonts.add(c.s.fn);
    let tables = '';
    book.sheets.forEach((sh, si) => {
      const ncols = Math.max(1, sh.ncols), nrows = Math.max(1, sh.nrows);
      let cols = '';
      for (let c = 0; c < ncols; c++) { const w = sh.cols[c] || sh.defw || 8.43; cols += `<table:table-column table:style-name="${coOf(cm(w * 7 + 5))}"${sh.hideC.includes(c) ? ' table:visibility="collapse"' : ''} table:default-cell-style-name="Default"/>`; }
      const covered = new Set(), span = new Map();
      for (const m of sh.merges || []) { const g = XL.parseRange(m); if (!g) continue; span.set(XL.key(g.c1, g.r1), [g.c2 - g.c1 + 1, g.r2 - g.r1 + 1]); for (let r = g.r1; r <= g.r2; r++) for (let c = g.c1; c <= g.c2; c++) if (r !== g.r1 || c !== g.c1) covered.add(XL.key(c, r)); }
      let rows = '';
      for (let r = 0; r < nrows; r++) {
        let cells = '';
        for (let c = 0; c < ncols; c++) {
          const k = XL.key(c, r);
          if (covered.has(k)) { cells += '<table:covered-table-cell/>'; continue; }
          const cell = sh.cells[k], sp = span.get(k);
          const spa = sp ? ` table:number-columns-spanned="${sp[0]}" table:number-rows-spanned="${sp[1]}"` : '';
          if (!cell) { cells += `<table:table-cell${spa}/>`; continue; }
          const st = csOf(cell.s), sa = st ? ` table:style-name="${st}"` : '';
          const fa = cell.f ? ` table:formula="${x(this.odsFormula(cell.f))}"` : '';
          const v = cell.v;
          if (v == null || v === '') cells += `<table:table-cell${sa}${spa}${fa}/>`;
          else if (typeof v === 'number') cells += `<table:table-cell${sa}${spa}${fa} office:value-type="float" office:value="${v}"><text:p>${x(this.textOf(cell))}</text:p></table:table-cell>`;
          else if (typeof v === 'boolean') cells += `<table:table-cell${sa}${spa}${fa} office:value-type="boolean" office:boolean-value="${v}"><text:p>${v ? 'WAHR' : 'FALSCH'}</text:p></table:table-cell>`;
          else cells += `<table:table-cell${sa}${spa}${fa} office:value-type="string"><text:p>${String(v).split('\n').map(x).join('</text:p><text:p>')}</text:p></table:table-cell>`;
        }
        const rh = sh.rowh[r];
        let rs = '';
        if (rh) { rs = 'ro_' + r; auto.push(`<style:style style:name="${rs}" style:family="table-row"><style:table-row-properties style:row-height="${(rh / 72 * 2.54).toFixed(3)}cm" style:use-optimal-row-height="false"/></style:style>`); }
        rows += `<table:table-row${rs ? ` table:style-name="${rs}"` : ''}${sh.hideR.includes(r) ? ' table:visibility="collapse"' : ''}>${cells}</table:table-row>`;
      }
      let tst = '';
      if (sh.hidden) { tst = 'ta_' + si; auto.push(`<style:style style:name="${tst}" style:family="table" style:master-page-name="Default"><style:table-properties table:display="false"/></style:style>`); }
      tables += `<table:table table:name="${x(sh.name)}"${tst ? ` table:style-name="${tst}"` : ''}>${cols}${rows}</table:table>`;
    });
    const fontDecls = `<office:font-face-decls>${[...fonts].map(f => `<style:font-face style:name="${x(f)}" svg:font-family="'${x(f)}'" xmlns:svg="urn:oasis:names:tc:opendocument:xmlns:svg-compatible:1.0"/>`).join('')}</office:font-face-decls>`;
    const content = X + `<office:document-content ${NS}>${fontDecls}<office:automatic-styles>${auto.join('')}</office:automatic-styles><office:body><office:spreadsheet>${tables}</office:spreadsheet></office:body></office:document-content>`;
    const styles = X + `<office:document-styles ${NS}>${fontDecls}<office:styles><style:default-style style:family="table-cell"><style:text-properties style:font-name="${x(book.font.n)}" fo:font-size="${book.font.s}pt"/></style:default-style><style:style style:name="Default" style:family="table-cell"/></office:styles></office:document-styles>`;
    return this.odfZip('application/vnd.oasis.opendocument.spreadsheet', content, styles);
  },
  async odfZip(mime, content, styles, extra = []) {
    const manifest = '<?xml version="1.0" encoding="UTF-8"?><manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0" manifest:version="1.2">' +
      `<manifest:file-entry manifest:full-path="/" manifest:version="1.2" manifest:media-type="${mime}"/><manifest:file-entry manifest:full-path="content.xml" manifest:media-type="text/xml"/><manifest:file-entry manifest:full-path="styles.xml" manifest:media-type="text/xml"/><manifest:file-entry manifest:full-path="meta.xml" manifest:media-type="text/xml"/>` +
      extra.map(([n, , t]) => `<manifest:file-entry manifest:full-path="${n}" manifest:media-type="${t}"/>`).join('') + '</manifest:manifest>';
    const meta = '<?xml version="1.0" encoding="UTF-8"?><office:document-meta xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:meta="urn:oasis:names:tc:opendocument:xmlns:meta:1.0" office:version="1.2"><office:meta><meta:generator>KnowledgeTree</meta:generator></office:meta></office:document-meta>';
    const blob = await OfficeConvert.zip([['mimetype', mime], ['content.xml', content], ['styles.xml', styles], ['meta.xml', meta], ...extra.map(([n, u8]) => [n, u8]), ['META-INF/manifest.xml', manifest]]);
    return new Blob([blob], { type: mime });
  },

  /* ================================================================ Word: Inhalt der Datei */
  /* .docx → Dokument-Modell (Absätze, Läufe, Überschriften, Listen, Tabellen, Seitenumbrüche) */
  async docOf(cur) {
    const pkg = await Ooxml.open(cur.blob);
    const W = Ooxml.NS.w, X = OfficePages;
    const d = await pkg.xml(pkg.main), rels = await pkg.rels(pkg.main);
    // Formatvorlagen: Überschriften (heading N / Überschrift N / outlineLvl)
    const heads = {}, styleNum = {};
    const sr = rels.find(r => /\/styles$/.test(r.type));
    if (sr && pkg.has(sr.path)) {
      const sd = await pkg.xml(sr.path);
      for (const s of X.q(sd, W, 'style')) {
        const id = s.getAttributeNS(W, 'styleId'), nm = (X.kid(s, W, 'name') || { getAttributeNS: () => '' }).getAttributeNS(W, 'val') || '';
        const m = /^(heading|überschrift|berschrift)\s*(\d)$/i.exec(nm) || /^(Heading|berschrift)(\d)$/.exec(id || '');
        const ol = X.q(s, W, 'outlineLvl')[0];
        if (m) heads[id] = +m[2]; else if (ol && +ol.getAttributeNS(W, 'val') < 6) heads[id] = +ol.getAttributeNS(W, 'val') + 1;
        // Listen über die Formatvorlage (z.B. „List Bullet“ mit eigener Nummerierung)
        const snp = X.q(s, W, 'numPr')[0];
        if (snp) { const ni = X.kid(snp, W, 'numId'); if (ni) styleNum[id] = { id: ni.getAttributeNS(W, 'val'), lvl: +((X.kid(snp, W, 'ilvl') || { getAttributeNS: () => 0 }).getAttributeNS(W, 'val') || 0) }; }
        else if (/^list (bullet|number)/i.test(nm)) styleNum[id] = { kind: /number/i.test(nm) ? 'num' : 'bullet', lvl: Math.max(0, (+(/(\d)$/.exec(nm) || [0, 1])[1]) - 1) };
        if (/^title$/i.test(nm)) heads[id] = 1;
      }
    }
    // Nummerierung: numId → Aufzählung oder Nummer
    const numFmt = {};
    const nr = rels.find(r => /\/numbering$/.test(r.type));
    if (nr && pkg.has(nr.path)) {
      const nd = await pkg.xml(nr.path), abs = {};
      for (const a of X.q(nd, W, 'abstractNum')) { const l0 = X.q(a, W, 'numFmt')[0]; abs[a.getAttributeNS(W, 'abstractNumId')] = l0 ? l0.getAttributeNS(W, 'val') : 'bullet'; }
      for (const n of X.q(nd, W, 'num')) { const a = X.kid(n, W, 'abstractNumId'); numFmt[n.getAttributeNS(W, 'numId')] = a ? abs[a.getAttributeNS(W, 'val')] : 'bullet'; }
    }
    const val = (e, n) => { const x = e && X.kid(e, W, n); return x ? (x.getAttributeNS(W, 'val') || 'true') : null; };
    const on = (e, n) => { const v = val(e, n); return v != null && !/^(0|false|none)$/.test(v); };
    const runs = (p) => {
      const out = [];
      const walk = (n) => {
        for (const c of n.children) {
          if (c.namespaceURI !== W) continue;
          if (c.localName === 'r') {
            const rp = X.kid(c, W, 'rPr');
            const f = {};
            if (on(rp, 'b')) f.b = true; if (on(rp, 'i')) f.i = true; if (on(rp, 'u')) f.u = true; if (on(rp, 'strike')) f.s = true;
            const col = val(rp, 'color'); if (col && /^[0-9A-Fa-f]{6}$/.test(col) && col !== '000000') f.c = '#' + col.toLowerCase();
            const sz = val(rp, 'sz'); if (sz) f.sz = +sz / 2;
            const rf = rp && X.kid(rp, W, 'rFonts'); if (rf && rf.getAttributeNS(W, 'ascii')) f.fn = rf.getAttributeNS(W, 'ascii');
            let t = '';
            for (const x of c.children) {
              if (x.localName === 't') t += x.textContent;
              else if (x.localName === 'tab') t += '\t';
              else if (x.localName === 'br') { if (x.getAttributeNS(W, 'type') === 'page') { if (t) out.push({ ...f, t }); t = ''; out.push({ pb: true }); } else t += '\n'; }
              else if (x.localName === 'noBreakHyphen') t += '-';
              else if (x.localName === 'sym') t += String.fromCharCode(parseInt(x.getAttributeNS(W, 'char') || '20', 16) & 0xFF);
            }
            if (t) out.push({ ...f, t });
          } else if (/^(hyperlink|smartTag|ins|fldSimple|sdt|sdtContent|customXml)$/.test(c.localName)) walk(c);
        }
      };
      walk(p);
      return out;
    };
    const para = (p) => {
      const pp = X.kid(p, W, 'pPr');
      const b = { t: 'p', runs: [] };
      const sid = val(pp, 'pStyle'); if (sid && heads[sid]) b.h = heads[sid];
      const ol = val(pp, 'outlineLvl'); if (ol != null && +ol < 6) b.h = +ol + 1;
      const np = pp && X.kid(pp, W, 'numPr');
      if (np && !b.h) { const id = val(np, 'numId'); if (id && id !== '0') b.list = { num: numFmt[id] && numFmt[id] !== 'bullet' && numFmt[id] !== 'none', lvl: Math.min(4, +(val(np, 'ilvl') || 0)) }; }
      else if (!b.h && sid && styleNum[sid]) { const sn = styleNum[sid]; b.list = sn.kind ? { num: sn.kind === 'num', lvl: sn.lvl } : { num: numFmt[sn.id] && numFmt[sn.id] !== 'bullet' && numFmt[sn.id] !== 'none', lvl: sn.lvl }; }
      const jc = val(pp, 'jc'); if (jc) b.al = { center: 'c', right: 'r', end: 'r', both: 'j', distribute: 'j' }[jc];
      b.runs = runs(p);
      return b;
    };
    const blocks = [];
    const body = X.q(d, W, 'body')[0];
    const walkBody = (n, out) => {
      for (const c of n.children) {
        if (c.localName === 'p') {
          const b = para(c);
          const pbs = b.runs.filter(r => r.pb);
          if (pbs.length) { b.runs = b.runs.filter(r => !r.pb); out.push(b); out.push({ t: 'pb' }); }
          else out.push(b);
        }
        else if (c.localName === 'tbl') { const rows = X.kids(c, W, 'tr').map(tr => X.kids(tr, W, 'tc').map(tc => { const cb = []; walkBody(tc, cb); return cb; })); out.push({ t: 'table', rows }); }
        else if (c.localName === 'sdt') { const sc = X.kid(c, W, 'sdtContent'); if (sc) walkBody(sc, out); }
      }
    };
    if (body) walkBody(body, blocks);
    return { blocks };
  },
  plain(b) { return (b.runs || []).map(r => r.t).join(''); },
  txt(doc) {
    const out = [];
    let n = [0, 0, 0, 0, 0], last = null;
    for (const b of doc.blocks) {
      if (b.t === 'pb') { out.push('\f'); continue; }
      if (b.t === 'table') { for (const r of b.rows) out.push(r.map(c => c.map(x => this.plain(x)).join(' ')).join('\t')); out.push(''); continue; }
      if (b.list) { const l = b.list.lvl || 0; if (l === 0 && last !== b.list.num) n = [0, 0, 0, 0, 0]; if (l === 0) last = b.list.num; n[l]++; for (let k = l + 1; k < 5; k++) n[k] = 0; out.push('  '.repeat(l) + (b.list.num ? n[l] + '. ' : '• ') + this.plain(b)); }
      else { n = [0, 0, 0, 0, 0]; last = null; out.push(this.plain(b)); }
    }
    return out.join('\r\n').replace(/\n/g, '\r\n').replace(/\r\r\n/g, '\r\n') + '\r\n';
  },
  md(doc) {
    const inl = (b) => (b.runs || []).map(r => { let t = r.t.replace(/([*_`\\[\]])/g, '\\$1'); if (!t.trim()) return t; if (r.b) t = '**' + t + '**'; if (r.i) t = '*' + t + '*'; if (r.s) t = '~~' + t + '~~'; return t; }).join('').replace(/\n/g, '  \n');
    const out = [];
    for (const b of doc.blocks) {
      if (b.t === 'pb') { out.push('', '---', ''); continue; }
      if (b.t === 'table') { const rows = b.rows.map(r => '| ' + r.map(c => c.map(inl).join(' ').replace(/\|/g, '\\|')).join(' | ') + ' |'); if (rows.length) rows.splice(1, 0, '|' + ' --- |'.repeat(b.rows[0].length)); out.push('', ...rows, ''); continue; }
      if (b.h) out.push('', '#'.repeat(b.h) + ' ' + inl(b), '');
      else if (b.list) out.push('  '.repeat(b.list.lvl || 0) + (b.list.num ? '1. ' : '- ') + inl(b));
      else out.push(inl(b), '');
    }
    return out.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
  },
  html(doc, title) {
    const e = escapeHtml;
    const run = (r) => { let t = e(r.t).replace(/\n/g, '<br>').replace(/\t/g, '&emsp;'); const st = (r.c ? `color:${r.c};` : '') + (r.sz ? `font-size:${r.sz}pt;` : '') + (r.fn ? `font-family:'${e(r.fn)}';` : ''); if (st) t = `<span style="${st}">${t}</span>`; if (r.u) t = `<u>${t}</u>`; if (r.s) t = `<s>${t}</s>`; if (r.i) t = `<em>${t}</em>`; if (r.b) t = `<strong>${t}</strong>`; return t; };
    const al = (b) => b.al && b.al !== 'l' ? ` style="text-align:${{ c: 'center', r: 'right', j: 'justify' }[b.al]}"` : '';
    let h = '', list = null;
    const close = () => { if (list) { h += `</${list}>`; list = null; } };
    for (const b of doc.blocks) {
      if (b.list && !b.h) { const tag = b.list.num ? 'ol' : 'ul'; if (list !== tag) { close(); h += `<${tag}>`; list = tag; } h += `<li${al(b)} style="margin-left:${(b.list.lvl || 0) * 1.5}em">${b.runs.map(run).join('')}</li>`; continue; }
      close();
      if (b.t === 'pb') h += '<hr style="page-break-after:always;border:0">';
      else if (b.t === 'table') h += '<table>' + b.rows.map(r => '<tr>' + r.map(c => '<td>' + c.map(x => `<p${al(x)}>${(x.runs || []).map(run).join('') || '&nbsp;'}</p>`).join('') + '</td>').join('') + '</tr>').join('') + '</table>';
      else if (b.h) h += `<h${b.h}${al(b)}>${b.runs.map(run).join('')}</h${b.h}>`;
      else h += `<p${al(b)}>${b.runs.map(run).join('') || '&nbsp;'}</p>`;
    }
    close();
    return `<!DOCTYPE html>\n<html lang="de"><head><meta charset="utf-8"><title>${e(title || 'Dokument')}</title><style>body{font:11pt/1.45 Calibri,Arial,sans-serif;max-width:46em;margin:2em auto;padding:0 1em}p{margin:0 0 .5em}table{border-collapse:collapse;margin:.5em 0}td{border:1px solid #999;padding:3px 6px;vertical-align:top}td p{margin:0}</style></head><body>\n${h}\n</body></html>\n`;
  },
  rtf(doc) {
    const colors = ['#000000'];
    const ci = (c) => { let i = colors.indexOf(c); if (i < 0) { colors.push(c); i = colors.length - 1; } return i + 1; };
    const fontsL = ['Calibri'];
    const fi = (f) => { let i = fontsL.indexOf(f); if (i < 0) { fontsL.push(f); i = fontsL.length - 1; } return i; };
    const esc = (t) => { let s = ''; for (const ch of t) { const c = ch.codePointAt(0); if (ch === '\\' || ch === '{' || ch === '}') s += '\\' + ch; else if (ch === '\n') s += '\\line '; else if (ch === '\t') s += '\\tab '; else if (c > 126) { if (c > 0xFFFF) { const hi = Math.floor((c - 0x10000) / 0x400) + 0xD800, lo = (c - 0x10000) % 0x400 + 0xDC00; s += `\\u${hi - 65536}?\\u${lo - 65536}?`; } else s += `\\u${c > 32767 ? c - 65536 : c}?`; } else s += ch; } return s; };
    const run = (r) => { const fl = `${r.b ? '\\b' : ''}${r.i ? '\\i' : ''}${r.u ? '\\ul' : ''}${r.s ? '\\strike' : ''}${r.c ? '\\cf' + ci(r.c) : ''}${r.sz ? '\\fs' + Math.round(r.sz * 2) : ''}${r.fn ? '\\f' + fi(r.fn) : ''}`; return fl ? `{${fl} ${esc(r.t)}}` : esc(r.t); };   // Leerzeichen nur als Ende eines Steuerworts
    const HS = [0, 32, 28, 26, 24, 22, 22];
    const para = (b, intbl) => {
      const al = { c: '\\qc', r: '\\qr', j: '\\qj' }[b.al] || '\\ql';
      if (b.h) return `\\pard${intbl ? '\\intbl' : ''}\\s${b.h}\\outlinelevel${b.h - 1}\\sb240\\sa80\\keepn${al}{\\b\\fs${HS[b.h]}\\cf${ci('#2f2f7f')} ${(b.runs || []).map(r => esc(r.t)).join('')}}\\par\n`;
      if (b.list) { const l = b.list.lvl || 0; return `\\pard${intbl ? '\\intbl' : ''}\\fi-360\\li${720 + l * 360}\\sa60${al}{${b.list.num ? '\\bullet' : '\\bullet'} }\\tab ${(b.runs || []).map(run).join('')}\\par\n`.replace('{\\bullet }', b.list.num ? '{' + (b._n || 1) + '.}' : '{\\u8226?}'); }
      return `\\pard${intbl ? '\\intbl' : ''}\\sa120${al} ${(b.runs || []).map(run).join('')}\\par\n`;   // „ “ beendet \\ql
    };
    let body = '', lastNum = null;
    const n = [0, 0, 0, 0, 0];
    for (const b of doc.blocks) {
      if (b.t === 'pb') { body += '\\page\n'; continue; }
      if (b.t === 'table') {
        const nc = Math.max(1, ...b.rows.map(r => r.length)), w = Math.floor(9000 / nc);
        for (const r of b.rows) {
          body += '\\trowd\\trgaph108' + Array.from({ length: nc }, (_, k) => `\\clbrdrt\\brdrs\\clbrdrl\\brdrs\\clbrdrb\\brdrs\\clbrdrr\\brdrs\\cellx${w * (k + 1)}`).join('') + '\n';
          for (let k = 0; k < nc; k++) { const cbs = (r[k] && r[k].length ? r[k] : [{ t: 'p', runs: [] }]); body += cbs.map((x, j) => (j === cbs.length - 1 ? para(x, true).replace(/\\par\n$/, '\\cell\n') : para(x, true))).join(''); }
          body += '\\row\n';
        }
        body += '\\pard\\par\n';
        continue;
      }
      if (b.list) { const l = b.list.lvl || 0; if (l === 0 && lastNum !== b.list.num) n.fill(0); lastNum = l === 0 ? b.list.num : lastNum; n[l]++; for (let k = l + 1; k < 5; k++) n[k] = 0; b._n = n[l]; } else { n.fill(0); lastNum = null; }
      body += para(b, false);
    }
    const head = `{\\rtf1\\ansi\\ansicpg1252\\deff0\\uc1{\\fonttbl${fontsL.map((f, i) => `{\\f${i}\\fswiss ${f.replace(/[{}\\;]/g, '')};}`).join('')}}{\\colortbl;${colors.map(c => `\\red${parseInt(c.slice(1, 3), 16)}\\green${parseInt(c.slice(3, 5), 16)}\\blue${parseInt(c.slice(5, 7), 16)};`).join('')}}{\\stylesheet{\\s0 Normal;}${[1, 2, 3, 4, 5, 6].map(i => `{\\s${i}\\b\\fs${HS[i]} heading ${i};}`).join('')}}\\paperw11906\\paperh16838\\margl1417\\margr1417\\margt1417\\margb1134\\f0\\fs22\n`;
    return head + body + '}';
  },
  async odt(doc) {
    const NS = 'xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0" xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0" xmlns:svg="urn:oasis:names:tc:opendocument:xmlns:svg-compatible:1.0" office:version="1.2"';
    const X = '<?xml version="1.0" encoding="UTF-8"?>', x = (s) => OfficeConvert.xt(s);
    const auto = [], tKey = new Map(), pKey = new Map();
    const tStyle = (r) => {
      const a = (r.b ? ' fo:font-weight="bold"' : '') + (r.i ? ' fo:font-style="italic"' : '') + (r.u ? ' style:text-underline-style="solid" style:text-underline-width="auto" style:text-underline-color="font-color"' : '') + (r.s ? ' style:text-line-through-style="solid"' : '') + (r.c ? ` fo:color="${r.c}"` : '') + (r.sz ? ` fo:font-size="${r.sz}pt"` : '') + (r.fn ? ` fo:font-family="${x(r.fn)}"` : '');
      if (!a) return null;
      if (!tKey.has(a)) { const n = 'T' + (tKey.size + 1); auto.push(`<style:style style:name="${n}" style:family="text"><style:text-properties${a}/></style:style>`); tKey.set(a, n); }
      return tKey.get(a);
    };
    const pStyle = (b) => {
      const parent = b.h ? `Heading_20_${b.h}` : 'Standard';
      if (!b.al || b.al === 'l') return parent;
      const k = parent + b.al;
      if (!pKey.has(k)) { const n = 'P' + (pKey.size + 1); auto.push(`<style:style style:name="${n}" style:family="paragraph" style:parent-style-name="${parent}"><style:paragraph-properties fo:text-align="${{ c: 'center', r: 'end', j: 'justify' }[b.al]}"/></style:style>`); pKey.set(k, n); }
      return pKey.get(k);
    };
    const inl = (b) => (b.runs || []).map(r => {
      const t = x(r.t).replace(/\t/g, '<text:tab/>').replace(/\n/g, '<text:line-break/>').replace(/ {2,}/g, (m) => ' <text:s text:c="' + (m.length - 1) + '"/>');
      const s = tStyle(r);
      return s ? `<text:span text:style-name="${s}">${t}</text:span>` : t;
    }).join('');
    const para = (b) => b.h ? `<text:h text:style-name="${pStyle(b)}" text:outline-level="${b.h}">${inl(b)}</text:h>` : `<text:p text:style-name="${pStyle(b)}">${inl(b)}</text:p>`;
    let body = '';
    const blocks = doc.blocks;
    for (let i = 0; i < blocks.length; i++) {
      const b = blocks[i];
      if (b.t === 'pb') { body += '<text:p text:style-name="PB"/>'; continue; }
      if (b.t === 'table') {
        const nc = Math.max(1, ...b.rows.map(r => r.length));
        body += `<table:table table:name="Tabelle${i + 1}"><table:table-column table:number-columns-repeated="${nc}"/>` + b.rows.map(r => '<table:table-row>' + Array.from({ length: nc }, (_, k) => `<table:table-cell table:style-name="TC" office:value-type="string">${(r[k] && r[k].length ? r[k] : [{ t: 'p', runs: [] }]).map(y => y.t === 'table' ? '<text:p/>' : para(y)).join('')}</table:table-cell>`).join('') + '</table:table-row>').join('') + '</table:table>';
        continue;
      }
      if (b.list && !b.h) {
        // zusammenhängende Listeneinträge → verschachtelte text:list
        const items = [];
        while (i < blocks.length && blocks[i].list && !blocks[i].h && !(items.length && (blocks[i].list.lvl || 0) === 0 && blocks[i].list.num !== items[0].list.num)) items.push(blocks[i++]);
        i--;
        const num = items[0].list.num;
        let h = `<text:list text:style-name="${num ? 'LN' : 'LB'}">`, lvl = 0;
        items.forEach((it, k) => {
          const l = it.list.lvl || 0;
          if (k) { if (l > lvl) { for (; lvl < l; lvl++) h += '<text:list>' + (lvl + 1 < l ? '<text:list-item>' : ''); } else { h += '</text:list-item>'; for (; lvl > l; lvl--) h += '</text:list></text:list-item>'; } }
          else for (; lvl < l; lvl++) h += '<text:list-item><text:list>';
          h += `<text:list-item><text:p text:style-name="${pStyle(it)}">${inl(it)}</text:p>`;
        });
        h += '</text:list-item>';
        for (; lvl > 0; lvl--) h += '</text:list></text:list-item>';
        body += h + '</text:list>';
        continue;
      }
      body += para(b);
    }
    const lst = (name, num) => `<text:list-style style:name="${name}">${[1, 2, 3, 4, 5].map(l => num ? `<text:list-level-style-number text:level="${l}" style:num-suffix="." style:num-format="${['1', 'a', 'i', '1', 'a'][l - 1]}"><style:list-level-properties text:list-level-position-and-space-mode="label-alignment"><style:list-level-label-alignment text:label-followed-by="listtab" fo:text-indent="-0.635cm" fo:margin-left="${(0.635 * l + 0.635).toFixed(3)}cm"/></style:list-level-properties></text:list-level-style-number>` : `<text:list-level-style-bullet text:level="${l}" text:bullet-char="${['•', '◦', '▪', '•', '◦'][l - 1]}"><style:list-level-properties text:list-level-position-and-space-mode="label-alignment"><style:list-level-label-alignment text:label-followed-by="listtab" fo:text-indent="-0.635cm" fo:margin-left="${(0.635 * l + 0.635).toFixed(3)}cm"/></style:list-level-properties></text:list-level-style-bullet>`).join('')}</text:list-style>`;
    auto.push('<style:style style:name="PB" style:family="paragraph" style:parent-style-name="Standard"><style:paragraph-properties fo:break-before="page"/></style:style>', '<style:style style:name="TC" style:family="table-cell"><style:table-cell-properties fo:padding="0.1cm" fo:border="0.5pt solid #000000"/></style:style>', lst('LB', false), lst('LN', true));
    const content = X + `<office:document-content ${NS}><office:automatic-styles>${auto.join('')}</office:automatic-styles><office:body><office:text>${body}</office:text></office:body></office:document-content>`;
    const HS = [0, 18, 15, 13, 12, 11, 11];
    const styles = X + `<office:document-styles ${NS}><office:styles><style:default-style style:family="paragraph"><style:paragraph-properties fo:margin-bottom="0.21cm"/><style:text-properties fo:font-family="Calibri" fo:font-size="11pt" fo:language="de" fo:country="CH"/></style:default-style><style:style style:name="Standard" style:family="paragraph" style:class="text"/>` +
      [1, 2, 3, 4, 5, 6].map(i => `<style:style style:name="Heading_20_${i}" style:display-name="Heading ${i}" style:family="paragraph" style:parent-style-name="Standard" style:next-style-name="Standard" style:default-outline-level="${i}" style:class="text"><style:paragraph-properties fo:margin-top="${i < 3 ? 0.42 : 0.3}cm" fo:margin-bottom="0.14cm" fo:keep-with-next="always"/><style:text-properties fo:font-size="${HS[i]}pt" fo:font-weight="bold" fo:color="#2f2f7f"/></style:style>`).join('') +
      '</office:styles><office:automatic-styles><style:page-layout style:name="pm1"><style:page-layout-properties fo:page-width="21cm" fo:page-height="29.7cm" fo:margin-top="2.5cm" fo:margin-bottom="2cm" fo:margin-left="2.5cm" fo:margin-right="2.5cm"/></style:page-layout></office:automatic-styles><office:master-styles><style:master-page style:name="Standard" style:page-layout-name="pm1"/></office:master-styles></office:document-styles>';
    return this.odfZip('application/vnd.oasis.opendocument.text', content, styles);
  },
  /* ================================================================ 1.72: PDF, Excel als Webseite, PowerPoint als ODP/RTF/HTML/Text */
  /* PDF: Druckdialog mit Vorschau (dort „Als PDF speichern“) */
  pdf(p) { if (Canvas.page !== p) App.openPage(p.id); setTimeout(() => Cmd.run('print'), 60); },
  bookHtml(book, title) {
    const e = escapeHtml;
    let h = '';
    for (const sh of book.sheets) {
      if (sh.hidden) continue;
      const hr = new Set(sh.hideR || []), hc = new Set(sh.hideC || []), skip = new Set(), span = {};
      for (const m of sh.merges || []) { const g = XL.parseRange(m); if (!g) continue; span[XL.key(g.c1, g.r1)] = [g.c2 - g.c1 + 1, g.r2 - g.r1 + 1]; for (let r = g.r1; r <= g.r2; r++) for (let c = g.c1; c <= g.c2; c++) if (r !== g.r1 || c !== g.c1) skip.add(XL.key(c, r)); }
      const w = (c) => sh.cols[c] != null ? Math.round(sh.cols[c] * 7 + 5) : Math.round((sh.defw || 8.43) * 7 + 5);
      h += `<h2>${e(sh.name)}</h2><table><colgroup>${Array.from({ length: sh.ncols }, (_, c) => hc.has(c) ? '' : `<col style="width:${w(c)}px">`).join('')}</colgroup>`;
      for (let r = 0; r < sh.nrows; r++) {
        if (hr.has(r)) continue;
        h += `<tr${sh.rowh[r] ? ` style="height:${sh.rowh[r]}pt"` : ''}>`;
        for (let c = 0; c < sh.ncols; c++) {
          const k = XL.key(c, r);
          if (hc.has(c) || skip.has(k)) continue;
          const cell = sh.cells[k], f = (cell && cell.s) || {};
          const disp = cell && cell.v != null ? XL.format(cell.v, f) : { t: '', al: 'l' };
          const al = f.al || disp.al;
          const sp = span[k];
          h += `<td${sp ? `${sp[0] > 1 ? ` colspan="${sp[0]}"` : ''}${sp[1] > 1 ? ` rowspan="${sp[1]}"` : ''}` : ''} style="${Sheet.cellStyle(f, false, false, true)}${al && al !== 'l' ? `text-align:${al === 'c' ? 'center' : 'right'};` : ''}${f.wr ? 'white-space:pre-wrap;' : ''}">${e(disp.t)}</td>`;
        }
        h += '</tr>';
      }
      h += '</table>';
    }
    const fn = (book.font && book.font.n) || 'Calibri', fs = (book.font && book.font.s) || 11;
    return `<!DOCTYPE html>\n<html lang="de"><head><meta charset="utf-8"><title>${e(title || 'Arbeitsmappe')}</title><style>body{font:${fs}pt "${fn.replace(/"/g, '')}",Calibri,Arial,sans-serif;margin:1.5em}h2{font-size:1.15em;margin:1.4em 0 .4em}table{border-collapse:collapse;table-layout:fixed}td{border:1px solid #d4d4d4;padding:1px 4px;white-space:nowrap;overflow:hidden;vertical-align:bottom}</style></head><body>${h}</body></html>`;
  },

  /* PowerPoint-Datei → { w, h (EMU), slides: [{ bg, hidden, items: [{ x, y, w, h, title, paras: [{ lvl, bullet, al, runs }] } | { x, y, w, h, img: { u8, ext } }] }], notes } */
  async deckOf(cur) {
    const pkg = await Ooxml.open(cur.blob);
    const X = OfficePages, P = Ooxml.NS.p, A = Ooxml.NS.a, R = Ooxml.NS.r;
    const pres = await pkg.xml(pkg.main), prels = await pkg.rels(pkg.main);
    const sz = X.q(pres, P, 'sldSz')[0];
    const deck = { w: sz ? +sz.getAttribute('cx') : 12192000, h: sz ? +sz.getAttribute('cy') : 6858000, slides: [], notes: [] };
    const xfrmOf = (sp) => { const x = X.q(sp, A, 'xfrm')[0], off = x && X.kid(x, A, 'off'), ext = x && X.kid(x, A, 'ext'); return off && ext ? { x: +off.getAttribute('x'), y: +off.getAttribute('y'), w: +ext.getAttribute('cx'), h: +ext.getAttribute('cy') } : null; };
    const phOf = (sp) => { const ph = X.q(sp, P, 'ph')[0]; return ph ? { type: ph.getAttribute('type') || 'body', idx: ph.getAttribute('idx') || '' } : null; };
    const findPh = (doc, ph) => { if (!doc) return null; const sps = X.q(doc, P, 'sp'); return sps.find(s => { const q = phOf(s); return q && ph.idx && q.idx === ph.idx; }) || sps.find(s => { const q = phOf(s); return q && q.type === ph.type; }) || (/^(title|ctrTitle)$/.test(ph.type) ? sps.find(s => { const q = phOf(s); return q && /^(title|ctrTitle)$/.test(q.type); }) : null); };
    const hex = (e) => { const c = e && X.q(e, A, 'srgbClr')[0]; return c && /^[0-9A-Fa-f]{6}$/.test(c.getAttribute('val')) ? '#' + c.getAttribute('val').toLowerCase() : null; };
    const relDoc = async (part, re) => { const r = (await pkg.rels(part)).find(x => re.test(x.type) && pkg.has(x.path)); return r ? { path: r.path, doc: await pkg.xml(r.path) } : null; };
    for (const sid of X.q(pres, P, 'sldId')) {
      const r = prels.find(x => x.id === X.at(sid, R, 'id'));
      if (!r || !pkg.has(r.path)) continue;
      const sd = await pkg.xml(r.path), srels = await pkg.rels(r.path);
      const lay = await relDoc(r.path, /slideLayout$/), mas = lay ? await relDoc(lay.path, /slideMaster$/) : null;
      const slide = { items: [], hidden: sd.documentElement.getAttribute('show') === '0', bg: null };
      const bg = X.q(sd, P, 'bg')[0]; if (bg) slide.bg = hex(X.q(bg, A, 'solidFill')[0]);
      const walk = async (parent, off) => {
        for (const n of X.kids(parent, P)) {
          if (n.localName === 'grpSp') {
            const gx = X.q(X.kid(n, P, 'grpSpPr'), A, 'xfrm')[0], ch = gx && X.kid(gx, A, 'chOff'), o = gx && X.kid(gx, A, 'off');
            await walk(n, { dx: off.dx + (o ? +o.getAttribute('x') : 0) - (ch ? +ch.getAttribute('x') : 0), dy: off.dy + (o ? +o.getAttribute('y') : 0) - (ch ? +ch.getAttribute('y') : 0) });
            continue;
          }
          const ph = phOf(n);
          let xf = xfrmOf(n);
          if (!xf && ph) xf = xfrmOf(findPh(lay && lay.doc, ph) || {}) || xfrmOf(findPh(mas && mas.doc, ph) || {});
          if (!xf) continue;
          const box = { x: xf.x + off.dx, y: xf.y + off.dy, w: xf.w, h: xf.h };
          if (n.localName === 'pic') {
            const bl = X.q(n, A, 'blip')[0], rr = bl && srels.find(x => x.id === X.at(bl, R, 'embed'));
            if (rr && pkg.has(rr.path)) slide.items.push({ ...box, img: { u8: await pkg.bytes(rr.path), ext: (rr.path.split('.').pop() || 'png').toLowerCase() } });
            continue;
          }
          if (ph && /^(dt|ftr|sldNum)$/.test(ph.type)) continue;
          const tx = n.localName === 'sp' ? X.kid(n, P, 'txBody') : null;
          const paras = [];
          const tbls = n.localName === 'graphicFrame' ? X.q(n, A, 'tbl') : [];
          const fromP = (p0, isBody) => {
            const pPr = X.kid(p0, A, 'pPr');
            const lvl = pPr ? +(pPr.getAttribute('lvl') || 0) : 0;
            const runs = [];
            for (const c of X.kids(p0, A)) {
              if (c.localName === 'br') { runs.push({ t: '\n' }); continue; }
              if (c.localName !== 'r' && c.localName !== 'fld') continue;
              const rp = X.kid(c, A, 'rPr'), t = (X.kid(c, A, 't') || {}).textContent || '';
              if (!t) continue;
              const f = { t };
              if (rp) { if (rp.getAttribute('b') === '1') f.b = true; if (rp.getAttribute('i') === '1') f.i = true; if (rp.getAttribute('u') && rp.getAttribute('u') !== 'none') f.u = true; if (+rp.getAttribute('sz')) f.sz = +rp.getAttribute('sz') / 100; const c2 = hex(X.kid(rp, A, 'solidFill')); if (c2) f.c = c2; }
              runs.push(f);
            }
            const noBu = pPr && X.kid(pPr, A, 'buNone'), bu = pPr && (X.kid(pPr, A, 'buChar') || X.kid(pPr, A, 'buAutoNum'));
            const al = pPr && { ctr: 'c', r: 'r', just: 'j' }[pPr.getAttribute('algn')];
            return { lvl, bullet: !noBu && (!!bu || isBody), al, runs };
          };
          const isBody = !!ph && !/^(title|ctrTitle|subTitle)$/.test(ph.type);
          if (tx) for (const p0 of X.kids(tx, A, 'p')) paras.push(fromP(p0, isBody));
          for (const t of tbls) for (const tr of X.kids(t, A, 'tr')) paras.push({ lvl: 0, bullet: false, runs: [{ t: X.kids(tr, A, 'tc').map(tc => X.q(tc, A, 't').map(x => x.textContent).join('')).join('\t') }] });
          if (!paras.some(q => q.runs.length)) continue;
          slide.items.push({ ...box, title: !!ph && /^(title|ctrTitle)$/.test(ph.type), sub: !!ph && ph.type === 'subTitle', paras });
        }
      };
      const tree = X.q(sd, P, 'spTree')[0];
      if (tree) await walk(tree, { dx: 0, dy: 0 });
      deck.slides.push(slide);
    }
    if (deck.slides.some(s => s.items.length === 0)) deck.notes.push('Folien ohne Text und Bilder bleiben leer (Diagramme/SmartArt gibt es nur in PowerPoint).');
    return deck;
  },
  /* Gliederung wie PowerPoint „Gliederung/RTF“: Folientitel = Überschrift 1, Texte darunter als Liste */
  outline(deck) {
    const blocks = [];
    deck.slides.forEach((s, i) => {
      const items = s.items.filter(x => x.paras).sort((a, b) => (b.title - a.title) || a.y - b.y || a.x - b.x);
      const t = items.find(x => x.title);
      const title = t ? t.paras.map(q => q.runs.map(r => r.t).join('')).join(' ').trim() : '';
      blocks.push({ t: 'p', h: 1, runs: [{ t: title || `Folie ${i + 1}` }] });
      for (const it of items) {
        if (it === t) continue;
        for (const q of it.paras) { if (!q.runs.length) continue; blocks.push({ t: 'p', runs: q.runs.map(r => ({ ...r, sz: null })), ...(q.bullet ? { list: { num: false, lvl: Math.min(4, q.lvl) } } : {}) }); }
      }
    });
    return { blocks };
  },
  deckHtml(deck, title) {
    const e = escapeHtml, W = deck.w / 9525, H = deck.h / 9525;
    const run = (r) => { const t = e(r.t).replace(/\n/g, '<br>'); const st = (r.c ? `color:${r.c};` : '') + (r.sz ? `font-size:${r.sz}pt;` : ''); let x = st ? `<span style="${st}">${t}</span>` : t; if (r.b) x = `<b>${x}</b>`; if (r.i) x = `<i>${x}</i>`; if (r.u) x = `<u>${x}</u>`; return x; };
    let h = '';
    deck.slides.forEach((s, i) => {
      h += `<section style="width:${W}px;height:${H}px;${s.bg ? `background:${s.bg};` : ''}" aria-label="Folie ${i + 1}">`;
      for (const it of s.items) {
        const pos = `left:${it.x / 9525}px;top:${it.y / 9525}px;width:${it.w / 9525}px;height:${it.h / 9525}px`;
        if (it.img) { const mime = it.img.ext === 'jpg' || it.img.ext === 'jpeg' ? 'image/jpeg' : it.img.ext === 'svg' ? 'image/svg+xml' : 'image/' + it.img.ext; let b = ''; const u = it.img.u8; for (let k = 0; k < u.length; k += 0x8000) b += String.fromCharCode.apply(null, u.subarray(k, k + 0x8000)); h += `<img style="${pos}" src="data:${mime};base64,${btoa(b)}" alt="">`; continue; }
        h += `<div class="${it.title ? 'ti' : ''}" style="${pos}">` + it.paras.map(q => `<p style="${q.al ? `text-align:${{ c: 'center', r: 'right', j: 'justify' }[q.al]};` : ''}${q.bullet ? `padding-left:${1 + q.lvl * 1.2}em;` : ''}">${q.bullet && q.runs.length ? '• ' : ''}${q.runs.map(run).join('') || '&nbsp;'}</p>`).join('') + '</div>';
      }
      h += `<span class="n">${i + 1}${s.hidden ? ' (ausgeblendet)' : ''}</span></section>`;
    });
    return `<!DOCTYPE html>\n<html lang="de"><head><meta charset="utf-8"><title>${e(title || 'Präsentation')}</title><style>body{background:#e9e9e9;font:18pt Calibri,Arial,sans-serif;margin:0;padding:24px}section{position:relative;margin:0 auto 28px;background:#fff;box-shadow:0 2px 8px #0003;overflow:hidden}section>*{position:absolute;margin:0}section p{margin:0 0 .2em}.ti{font-size:32pt}.n{right:8px;bottom:4px;font-size:10pt;color:#888}</style></head><body>${h}</body></html>`;
  },
  /* OpenDocument-Präsentation: eine Seite je Folie, Textrahmen und Bilder an ihrer Stelle */
  async odp(deck) {
    const NS = 'xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" xmlns:draw="urn:oasis:names:tc:opendocument:xmlns:drawing:1.0" xmlns:svg="urn:oasis:names:tc:opendocument:xmlns:svg-compatible:1.0" xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0" xmlns:presentation="urn:oasis:names:tc:opendocument:xmlns:presentation:1.0" xmlns:xlink="http://www.w3.org/1999/xlink" office:version="1.2"';
    const cm = (emu) => (emu / 360000).toFixed(3) + 'cm';
    const X = '<?xml version="1.0" encoding="UTF-8"?>';
    const esc = (t) => Ooxml.esc(t).replace(/\t/g, '<text:tab/>').replace(/\n/g, '<text:line-break/>').replace(/ {2,}/g, (m) => ' <text:s text:c="' + (m.length - 1) + '"/>');
    const auto = ['<style:style style:name="gr1" style:family="graphic"><style:graphic-properties draw:stroke="none" draw:fill="none" draw:textarea-vertical-align="top" fo:padding="0.13cm"/></style:style>'];
    const tsty = new Map(), psty = new Map(), dsty = new Map();
    const tName = (r) => { const k = JSON.stringify([r.b, r.i, r.u, r.sz, r.c]); if (!tsty.has(k)) { const n = 'T' + (tsty.size + 1); tsty.set(k, n); auto.push(`<style:style style:name="${n}" style:family="text"><style:text-properties${r.b ? ' fo:font-weight="bold"' : ''}${r.i ? ' fo:font-style="italic"' : ''}${r.u ? ' style:text-underline-style="solid" style:text-underline-width="auto" style:text-underline-color="font-color"' : ''}${r.sz ? ` fo:font-size="${r.sz}pt"` : ''}${r.c ? ` fo:color="${r.c}"` : ''}/></style:style>`); } return tsty.get(k); };
    const pName = (q, title) => { const k = (q.al || 'l') + (title ? 't' : ''); if (!psty.has(k)) { const n = 'P' + (psty.size + 1); psty.set(k, n); auto.push(`<style:style style:name="${n}" style:family="paragraph"><style:paragraph-properties fo:text-align="${{ c: 'center', r: 'end', j: 'justify' }[q.al] || 'start'}"/>${title ? '<style:text-properties fo:font-size="32pt"/>' : ''}</style:style>`); } return psty.get(k); };
    const dName = (bg) => { const k = bg || ''; if (!dsty.has(k)) { const n = 'dp' + (dsty.size + 1); dsty.set(k, n); auto.push(`<style:style style:name="${n}" style:family="drawing-page"><style:drawing-page-properties presentation:visibility="visible"${bg ? ` draw:fill="solid" draw:fill-color="${bg}"` : ''}/></style:style>`); } return dsty.get(k); };
    const hid = []; let hidStyle = null;
    const extra = [];
    let body = '';
    deck.slides.forEach((s, i) => {
      let st = dName(s.bg);
      if (s.hidden) { if (!hidStyle) { hidStyle = 'dph'; auto.push('<style:style style:name="dph" style:family="drawing-page"><style:drawing-page-properties presentation:visibility="hidden"/></style:style>'); } st = s.bg ? st : hidStyle; hid.push(i); }
      body += `<draw:page draw:name="Folie ${i + 1}" draw:style-name="${st}" draw:master-page-name="Standard">`;
      for (const it of s.items) {
        const pos = `svg:x="${cm(it.x)}" svg:y="${cm(it.y)}" svg:width="${cm(it.w)}" svg:height="${cm(it.h)}"`;
        if (it.img) { const n = `Pictures/bild${extra.length + 1}.${it.img.ext}`; extra.push([n, it.img.u8, it.img.ext === 'jpg' || it.img.ext === 'jpeg' ? 'image/jpeg' : 'image/' + it.img.ext]); body += `<draw:frame draw:style-name="gr1" ${pos}><draw:image xlink:href="${n}" xlink:type="simple" xlink:show="embed" xlink:actuate="onLoad"/></draw:frame>`; continue; }
        let tx = '', open = 0;
        for (const q of it.paras) {
          const p = `<text:p text:style-name="${pName(q, it.title)}">${q.runs.map(r => (r.b || r.i || r.u || r.sz || r.c) ? `<text:span text:style-name="${tName(r)}">${esc(r.t)}</text:span>` : esc(r.t)).join('')}</text:p>`;
          if (q.bullet) { const want = q.lvl + 1; while (open < want) { tx += open ? '<text:list-item><text:list>' : '<text:list>'; open++; } while (open > want) { tx += open > 1 ? '</text:list></text:list-item>' : '</text:list>'; open--; } tx += `<text:list-item>${p}</text:list-item>`; }
          else { while (open > 0) { tx += open > 1 ? '</text:list></text:list-item>' : '</text:list>'; open--; } tx += p; }
        }
        while (open > 0) { tx += open > 1 ? '</text:list></text:list-item>' : '</text:list>'; open--; }
        body += `<draw:frame draw:style-name="gr1" ${pos}${it.title ? ' presentation:class="title"' : ''}><draw:text-box>${tx}</draw:text-box></draw:frame>`;
      }
      body += '</draw:page>';
    });
    void hid;
    const content = X + `<office:document-content ${NS}><office:automatic-styles>${auto.join('')}</office:automatic-styles><office:body><office:presentation>${body}</office:presentation></office:body></office:document-content>`;
    const styles = X + `<office:document-styles ${NS}><office:styles><style:default-style style:family="graphic"><style:text-properties fo:font-size="18pt" style:font-name="Calibri" fo:font-family="Calibri"/></style:default-style></office:styles><office:automatic-styles><style:page-layout style:name="PM1"><style:page-layout-properties fo:margin-top="0cm" fo:margin-bottom="0cm" fo:margin-left="0cm" fo:margin-right="0cm" fo:page-width="${cm(deck.w)}" fo:page-height="${cm(deck.h)}" style:print-orientation="${deck.w >= deck.h ? 'landscape' : 'portrait'}"/></style:page-layout><style:style style:name="Mdp1" style:family="drawing-page"><style:drawing-page-properties draw:fill="solid" draw:fill-color="#ffffff"/></style:style></office:automatic-styles><office:master-styles><style:master-page style:name="Standard" style:page-layout-name="PM1" draw:style-name="Mdp1"/></office:master-styles></office:document-styles>`;
    return this.odfZip('application/vnd.oasis.opendocument.presentation', content, styles, extra);
  },
};
if (typeof module !== 'undefined') module.exports = { OfficeSaveAs };