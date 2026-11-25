'use strict';
/* Weitere Dateiformate für Office-Seiten (1.71) – Import.
 *
 * Office-Seiten arbeiten mit Office Open XML (.xlsx/.docx/.pptx, auch .xlsm/.xltx/.docm/.dotx/.pptm/.ppsx/.potx …).
 * Alle anderen Formate werden beim Importieren in das neueste Format umgewandelt; die Seite arbeitet danach mit der
 * umgewandelten Datei, das Original bleibt zusätzlich im Notizbuch („Original speichern“ gibt es unverändert zurück).
 *
 *   Tabelle:      .csv .tsv .tab (Text, Trennzeichen automatisch) · .xls .xlt (Excel 97–2003, BIFF8/BIFF5) · .ods (OpenDocument)
 *   Dokument:     .doc .dot (Word 97–2003, Text) · .rtf · .odt · .txt · .md
 *   Präsentation: .ppt .pps .pot (PowerPoint 97–2003, Texte je Folie) · .odp
 *
 * Aufbau: Leser → einfaches Modell → Bauer (OOXML-Paket als Datei) → normaler Import (OfficePages.importOne).
 *   Mappe:        { sheets: [{ name, hidden, cells: { A1: { v, f, s } }, cols: { 0: Breite in Zeichen }, rowh: { 0: pt },
 *                   merges: ['A1:B2'], freeze: { r, c } }], font: { n, s } }      s = Format wie KnowledgeTree (b, i, c, bg, al, va, wr, nfc …)
 *   Dokument:     { blocks: [{ t: 'p', h: 1–6, list: { num, lvl }, al, runs: [{ t, b, i, u, s, c, sz, fn }] } | { t: 'table', rows: [[[blocks]]] } | { t: 'pb' }] }
 *   Präsentation: { w, h (px), slides: [{ items: [{ x, y, w, h, kind, paras: [{ lvl, bullet, runs }] }], images: [{ x, y, w, h, bytes, ext }], notes }] }
 * Grenzen: Word 97–2003 nur Text und Absätze (ohne Formatierung), PowerPoint 97–2003 nur Titel und Texte je Folie,
 * Excel 97–2003 Formeln nur, soweit die Funktion bekannt ist (sonst der gespeicherte Wert). */
const OfficeConvert = {
  KIND: {
    csv: 'xlsx', tsv: 'xlsx', tab: 'xlsx', xls: 'xlsx', xlt: 'xlsx', ods: 'xlsx', ots: 'xlsx',
    doc: 'docx', dot: 'docx', rtf: 'docx', odt: 'docx', ott: 'docx', txt: 'docx', md: 'docx', markdown: 'docx',
    ppt: 'pptx', pps: 'pptx', pot: 'pptx', odp: 'pptx', otp: 'pptx',
  },
  LABEL: {
    csv: 'CSV (Trennzeichen-getrennt)', tsv: 'Text (Tabstopp-getrennt)', tab: 'Text (Tabstopp-getrennt)', xls: 'Excel 97–2003', xlt: 'Excel-Vorlage 97–2003', ods: 'OpenDocument-Tabelle', ots: 'OpenDocument-Tabellenvorlage',
    doc: 'Word 97–2003', dot: 'Word-Vorlage 97–2003', rtf: 'Rich Text Format', odt: 'OpenDocument-Text', ott: 'OpenDocument-Textvorlage', txt: 'Nur Text', md: 'Markdown', markdown: 'Markdown',
    ppt: 'PowerPoint 97–2003', pps: 'PowerPoint-Bildschirmpräsentation 97–2003', pot: 'PowerPoint-Vorlage 97–2003', odp: 'OpenDocument-Präsentation', otp: 'OpenDocument-Präsentationsvorlage',
  },
  ext(name) { return String(name || '').toLowerCase().split('.').pop(); },
  kindOf(name) { return this.KIND[this.ext(name)] || ''; },
  /* Datei → { file (OOXML), notes: [] } */
  async convert(file) {
    const ext = this.ext(file.name), kind = this.KIND[ext];
    if (!kind) throw new Error('Unbekanntes Format: .' + ext);
    const u8 = new Uint8Array(await file.arrayBuffer());
    const base = file.name.replace(/\.[^.]+$/, '') || 'Datei';
    const notes = [];
    let blob;
    if (kind === 'xlsx') {
      let book;
      if (ext === 'csv' || ext === 'tsv' || ext === 'tab') book = this.readCsv(u8, ext, base);
      else if (ext === 'xls' || ext === 'xlt') book = this.readXls(u8, notes);
      else book = await this.readOds(u8, notes);
      blob = await this.buildXlsx(book);
    } else if (kind === 'docx') {
      let doc;
      if (ext === 'doc' || ext === 'dot') doc = this.readDoc(u8, notes);
      else if (ext === 'rtf') doc = this.readRtf(u8);
      else if (ext === 'odt' || ext === 'ott') doc = await this.readOdt(u8);
      else if (ext === 'md' || ext === 'markdown') doc = this.readMd(this.decodeText(u8));
      else doc = this.readTxt(this.decodeText(u8));
      blob = await this.buildDocx(doc);
    } else {
      let deck;
      if (ext === 'odp' || ext === 'otp') deck = await this.readOdp(u8);
      else deck = this.readPpt(u8, notes);
      blob = await this.buildPptx(deck);
    }
    return { file: new File([blob], base + '.' + kind, { type: Ooxml.MIME[kind] }), notes, from: ext };
  },

  /* ================================================================ Hilfen */
  decodeText(u8) {
    if (u8[0] === 0xFF && u8[1] === 0xFE) return new TextDecoder('utf-16le').decode(u8.subarray(2));
    if (u8[0] === 0xFE && u8[1] === 0xFF) return new TextDecoder('utf-16be').decode(u8.subarray(2));
    try { return new TextDecoder('utf-8', { fatal: true }).decode(u8).replace(/^﻿/, ''); }
    catch (e) { return new TextDecoder('windows-1252').decode(u8); }   // ältere Windows-Dateien
  },
  esc(s) { return Ooxml.esc(s); },
  /* gültiger XML-Text (Steuerzeichen raus) */
  xt(s) { return this.esc(String(s == null ? '' : s).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, '')); },
  /* ZIP-Inhalt (ODF) lesen: Name → Bytes */
  async unzip(u8) {
    const out = new Map();
    for (const e of Ooxml.readZip(u8)) out.set(e.name, e);
    return {
      has: (n) => out.has(n),
      async bytes(n) { const e = out.get(n); if (!e) return null; return e.method === 0 ? e.raw : Ooxml.inflate(e.raw); },
      async text(n) { const b = await this.bytes(n); return b ? new TextDecoder().decode(b) : ''; },
      async xml(n) { const t = await this.text(n); return t ? new DOMParser().parseFromString(t, 'application/xml') : null; },
    };
  },
  async zip(files) {
    const enc = new TextEncoder(), entries = [];
    for (const [name, data] of files) {
      const u8 = typeof data === 'string' ? enc.encode(data) : data;
      if (name === 'mimetype') entries.push({ name, method: 0, crc: Ooxml.crc32(u8), csize: u8.length, usize: u8.length, raw: u8, time: 0, date: 0x21 });
      else entries.push(await Ooxml.entry(name, u8));
    }
    return Ooxml.writeZip(entries);
  },
  /* Länge mit Einheit (ODF: cm, mm, in, pt, pc, px) → px */
  len(v) {
    const m = /^(-?[\d.]+)\s*(cm|mm|in|pt|pc|px)?$/.exec(String(v || '').trim());
    if (!m) return 0;
    const n = +m[1];
    return { cm: n * 96 / 2.54, mm: n * 96 / 25.4, in: n * 96, pt: n * 96 / 72, pc: n * 16, px: n }[m[2] || 'px'];
  },
  colName(c) { let s = ''; c++; while (c > 0) { const m = (c - 1) % 26; s = String.fromCharCode(65 + m) + s; c = Math.floor((c - 1) / 26); } return s; },
  ref(c, r) { return this.colName(c) + (r + 1); },

  /* ================================================================ Compound File (OLE2): .xls .doc .ppt */
  cfb(u8) {
    const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    if (u8.length < 512 || dv.getUint32(0, true) !== 0xE011CFD0 || dv.getUint32(4, true) !== 0xE11AB1A1) throw new Error('Keine Office-97–2003-Datei (Kopf fehlt) – vielleicht eine umbenannte Datei?');
    const ssz = 1 << dv.getUint16(30, true), mssz = 1 << dv.getUint16(32, true);
    const nFat = dv.getUint32(44, true), dir0 = dv.getInt32(48, true), cutoff = dv.getUint32(56, true);
    const mfat0 = dv.getInt32(60, true), nMfat = dv.getUint32(64, true);
    let difat = dv.getInt32(68, true);
    const secOff = (n) => ssz + n * ssz;   // der Kopf belegt den ersten Sektor (512 bzw. 4096 Byte)
    const fatSecs = [];
    for (let i = 0; i < 109 && fatSecs.length < nFat; i++) { const v = dv.getInt32(76 + i * 4, true); if (v >= 0) fatSecs.push(v); }
    let guard = 0;
    while (difat >= 0 && fatSecs.length < nFat && guard++ < 10000) {
      const o = secOff(difat), k = ssz / 4 - 1;
      for (let i = 0; i < k && fatSecs.length < nFat; i++) { const v = dv.getInt32(o + i * 4, true); if (v >= 0) fatSecs.push(v); }
      difat = dv.getInt32(o + k * 4, true);
    }
    const per = ssz / 4, fat = new Int32Array(fatSecs.length * per);
    fatSecs.forEach((s, i) => { const o = secOff(s); for (let j = 0; j < per; j++) fat[i * per + j] = o + j * 4 + 4 <= u8.length ? dv.getInt32(o + j * 4, true) : -1; });
    const chain = (start, tbl) => { const out = []; let s = start, g = 0; while (s >= 0 && s < tbl.length && g++ < 1e7) { out.push(s); s = tbl[s]; } return out; };
    const read = (start, size) => {
      const ch = chain(start, fat), out = new Uint8Array(size == null ? ch.length * ssz : size);
      let p = 0;
      for (const s of ch) { const o = secOff(s), n = Math.min(ssz, out.length - p); if (n <= 0) break; out.set(u8.subarray(o, o + n), p); p += n; }
      return out;
    };
    const dirBytes = read(dir0);
    const ents = [];
    for (let o = 0; o + 128 <= dirBytes.length; o += 128) {
      const ddv = new DataView(dirBytes.buffer, dirBytes.byteOffset + o, 128);
      const nl = ddv.getUint16(64, true), type = dirBytes[o + 66];
      if (!type) { ents.push(null); continue; }
      const name = new TextDecoder('utf-16le').decode(dirBytes.subarray(o, o + Math.max(0, nl - 2)));
      ents.push({ name, type, start: ddv.getInt32(116, true), size: ddv.getUint32(120, true) });
    }
    const root = ents[0];
    const mini = root && root.start >= 0 ? read(root.start, root.size) : new Uint8Array(0);
    const mfatB = mfat0 >= 0 ? read(mfat0, nMfat * ssz) : new Uint8Array(0);
    const mfat = new Int32Array(mfatB.buffer.slice(mfatB.byteOffset, mfatB.byteOffset + (mfatB.length & ~3)));
    return {
      names: ents.filter(Boolean).map(e => e.name),
      get(name) {
        const e = ents.find(x => x && x.type === 2 && x.name.toLowerCase() === name.toLowerCase());
        if (!e) return null;
        if (e.size >= cutoff) return read(e.start, e.size);
        const out = new Uint8Array(e.size); let p = 0;
        for (const s of chain(e.start, mfat)) { const n = Math.min(mssz, e.size - p); if (n <= 0) break; out.set(mini.subarray(s * mssz, s * mssz + n), p); p += n; }
        return out;
      },
    };
  },

  /* ================================================================ Tabellen lesen */
  /* CSV/TSV: Trennzeichen (; , Tab |) automatisch, Anführungszeichen, Zahlen wie geschrieben (1'234.50 / 1.234,50) */
  readCsv(u8, ext, name) {
    const text = this.decodeText(u8).replace(/\r\n?/g, '\n');
    const first = text.split('\n').slice(0, 5).join('\n');
    const count = (ch) => { let n = 0, q = false; for (const c of first) { if (c === '"') q = !q; else if (c === ch && !q) n++; } return n; };
    const sep = ext === 'tsv' || ext === 'tab' ? '\t' : ['\t', ';', ',', '|'].map(c => [c, count(c)]).sort((a, b) => b[1] - a[1])[0][1] ? ['\t', ';', ',', '|'].map(c => [c, count(c)]).sort((a, b) => b[1] - a[1])[0][0] : ',';
    const rows = [];
    let row = [], cell = '', q = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) { if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; continue; }
      if (c === '"' && cell === '') q = true;
      else if (c === sep) { row.push(cell); cell = ''; }
      else if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
      else cell += c;
    }
    if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
    // Dezimalkomma: Semikolon-Dateien aus Excel (DE) schreiben 1,5 – dann ist „,“ das Dezimalzeichen
    const decComma = sep === ';' && rows.some(r => r.some(v => /^-?\d+,\d+$/.test(v.trim())));
    const cells = {};
    const widths = {};
    rows.forEach((r, ri) => r.forEach((v, ci) => {
      if (v === '') return;
      widths[ci] = Math.max(widths[ci] || 0, Math.min(60, v.length));
      const t = v.trim();
      let num = null;
      if (/^-?[\d'’ ]*\d([.,]\d+)?%?$/.test(t) || /^-?\d{1,3}([.,'’ ]\d{3})+([.,]\d+)?$/.test(t)) {
        let s = t.replace(/['’ ]/g, '');
        const pct = s.endsWith('%'); if (pct) s = s.slice(0, -1);
        if (decComma) s = s.replace(/\./g, '').replace(',', '.');
        else if (/,\d{3}(\.|$)/.test(s) && !/\.\d{3},/.test(s)) s = s.replace(/,/g, '');
        else s = s.replace(',', '.');
        if (/^-?\d+(\.\d+)?$/.test(s) && !/^0\d/.test(s.replace('-', ''))) num = +s / (pct ? 100 : 1);
      }
      if (num != null && isFinite(num)) cells[this.ref(ci, ri)] = { v: num, s: /%$/.test(t) ? { nf: 'pct' } : undefined };
      else if (/^(true|false|wahr|falsch)$/i.test(t)) cells[this.ref(ci, ri)] = { v: /^(true|wahr)$/i.test(t) };
      else if (/^=/.test(t)) cells[this.ref(ci, ri)] = { v: t };   // keine Formeln aus Textdateien ausführen
      else cells[this.ref(ci, ri)] = { v };
    }));
    const cols = {};
    for (const [c, w] of Object.entries(widths)) cols[c] = Math.max(8.43, Math.min(60, w + 2));
    return { sheets: [{ name: String(name || 'Tabelle1').slice(0, 31), cells, cols }], font: { n: 'Calibri', s: 11 } };
  },

  /* Excel 97–2003 (.xls, BIFF8; BIFF5 ohne Formate) */
  readXls(u8, notes) {
    const cf = this.cfb(u8);
    const wb = cf.get('Workbook') || cf.get('Book');
    if (!wb) throw new Error('Keine Excel-Arbeitsmappe in der Datei');
    const dv = new DataView(wb.buffer, wb.byteOffset, wb.byteLength);
    const recs = [];
    for (let p = 0; p + 4 <= wb.length;) { const t = dv.getUint16(p, true), n = dv.getUint16(p + 2, true); recs.push({ t, o: p + 4, n }); p += 4 + n; }
    let biff = 8, cp = 'windows-1252', d1904 = false;
    // BIFF8: „komprimierte“ Zeichenketten sind Latin-1 (das untere Byte von UTF-16), die Codepage gilt nur für BIFF5
    const dec1 = (b) => new TextDecoder(biff >= 8 || cp === 'utf-16le' ? 'latin1' : cp).decode(b), dec2 = (b) => new TextDecoder('utf-16le').decode(b);
    // Zeichenkette (BIFF8: cch + Optionen; BIFF5: cch + Bytes)
    const str = (o, cchSize) => {
      const cch = cchSize === 1 ? wb[o] : dv.getUint16(o, true);
      let p = o + cchSize;
      if (biff < 8) return { s: dec1(wb.subarray(p, p + cch)), end: p + cch };
      const fl = wb[p++];
      let runs = 0, ext = 0;
      if (fl & 8) { runs = dv.getUint16(p, true); p += 2; }
      if (fl & 4) { ext = dv.getUint32(p, true); p += 4; }
      const nb = fl & 1 ? cch * 2 : cch;
      const s = fl & 1 ? dec2(wb.subarray(p, p + nb)) : dec1(wb.subarray(p, p + nb));
      return { s, end: p + nb + runs * 4 + ext };
    };
    const fonts = [], xfs = [], fmts = {}, pal = OfficeGrid.PALETTE.slice(), sheets = [], sst = [], xti = [];
    let i = 0;
    // ---- Arbeitsmappe (bis zum ersten EOF)
    for (; i < recs.length; i++) {
      const r = recs[i], o = r.o;
      if (r.t === 0x0809 && i === 0) { const v = dv.getUint16(o, true); biff = v === 0x0600 ? 8 : v === 0x0500 ? 5 : v === 0x0400 ? 4 : 8; if (biff < 5) throw new Error('Excel-Datei zu alt (vor Excel 5)'); }
      else if (r.t === 0x002F) throw new Error('Die Excel-Datei ist mit einem Kennwort geschützt – bitte in Excel ohne Kennwort speichern');
      else if (r.t === 0x0042) { const v = dv.getUint16(o, true); if (v === 1200) cp = 'utf-16le'; else if (v === 0x8000) cp = 'macintosh'; else if (v && v !== 32769) { try { new TextDecoder('windows-' + v); cp = 'windows-' + v; } catch (e) { /* */ } } }
      else if (r.t === 0x0022) d1904 = dv.getUint16(o, true) === 1;
      else if (r.t === 0x0031) {
        const sz = dv.getUint16(o, true) / 20, gr = dv.getUint16(o + 2, true), icv = dv.getUint16(o + 4, true), bls = dv.getUint16(o + 6, true), ul = wb[o + 10];
        const nm = biff >= 8 ? str(o + 14, 1).s : dec1(wb.subarray(o + 15, o + 15 + wb[o + 14]));
        fonts.push({ sz, i: !!(gr & 2), s: !!(gr & 8), b: bls >= 600, u: !!ul, icv, n: nm });
        if (fonts.length === 4) fonts.push(null);   // Schrift 4 gibt es nicht (Excel-Eigenheit)
      }
      else if (r.t === 0x041E || r.t === 0x001E) { const id = dv.getUint16(o, true); fmts[id] = biff >= 8 ? str(o + 2, 2).s : dec1(wb.subarray(o + 3, o + 3 + wb[o + 2])); }
      else if (r.t === 0x00E0) {
        if (biff >= 8) {
          const al = wb[o + 6], b1 = dv.getUint32(o + 10, true), b2 = dv.getUint32(o + 14, true), b3 = dv.getUint16(o + 18, true);
          xfs.push({ font: dv.getUint16(o, true), fmt: dv.getUint16(o + 2, true), alc: al & 7, wrap: !!(al & 8), alcV: (al >> 4) & 7, ind: wb[o + 8] & 15, bd: [b1 & 15, (b1 >> 4) & 15, (b1 >> 8) & 15, (b1 >> 12) & 15], fls: (b2 >>> 26) & 63, fore: b3 & 127, back: (b3 >> 7) & 127 });
        } else {
          const al = wb[o + 6], fill = dv.getUint32(o + 8, true);
          xfs.push({ font: dv.getUint16(o, true), fmt: dv.getUint16(o + 2, true), alc: al & 7, wrap: !!(al & 8), alcV: (al >> 4) & 7, ind: 0, bd: [0, 0, 0, 0], fls: (fill >> 16) & 63, fore: fill & 127, back: (fill >> 7) & 127 });
        }
      }
      else if (r.t === 0x0092) { const n = dv.getUint16(o, true); for (let k = 0; k < n && 8 + k < 64; k++) pal[8 + k] = [wb[o + 2 + k * 4], wb[o + 3 + k * 4], wb[o + 4 + k * 4]].map(x => x.toString(16).padStart(2, '0')).join('').toUpperCase(); }
      else if (r.t === 0x0085) {
        const pos = dv.getUint32(o, true), st = wb[o + 4], dt = wb[o + 5];
        const nm = biff >= 8 ? str(o + 6, 1).s : dec1(wb.subarray(o + 7, o + 7 + wb[o + 6]));
        sheets.push({ pos, hidden: st === 1 ? 'hidden' : st === 2 ? 'veryHidden' : '', name: nm, chart: dt !== 0 });
      }
      else if (r.t === 0x0017 && biff >= 8) { const n = dv.getUint16(o, true); for (let k = 0; k < n; k++) xti.push(dv.getUint16(o + 2 + k * 6 + 2, true)); }
      else if (r.t === 0x00FC) {
        // gemeinsame Zeichenketten, über CONTINUE-Datensätze verteilt
        const parts = [wb.subarray(o, o + r.n)];
        for (let j = i + 1; j < recs.length && recs[j].t === 0x003C; j++) parts.push(wb.subarray(recs[j].o, recs[j].o + recs[j].n));
        let pi = 0, p = 8;
        const total = new DataView(parts[0].buffer, parts[0].byteOffset).getUint32(4, true);
        const u8at = () => { while (pi < parts.length && p >= parts[pi].length) { pi++; p = 0; } return pi < parts.length ? parts[pi][p++] : 0; };
        const u16 = () => u8at() | (u8at() << 8), u32 = () => (u16() | (u16() << 16)) >>> 0;
        for (let k = 0; k < total && pi < parts.length; k++) {
          const cch = u16(); let fl = u8at();
          const runs = fl & 8 ? u16() : 0, ext = fl & 4 ? u32() : 0;
          let s = '', left = cch;
          while (left > 0 && pi < parts.length) {
            if (p >= parts[pi].length) { pi++; p = 0; if (pi >= parts.length) break; fl = parts[pi][p++]; continue; }   // neue Fortsetzung: neues Optionsbyte
            const hi = fl & 1, avail = Math.floor((parts[pi].length - p) / (hi ? 2 : 1)), n = Math.min(left, avail);
            if (n <= 0) { pi++; p = 0; if (pi < parts.length) fl = parts[pi][p++]; continue; }
            const b = parts[pi].subarray(p, p + n * (hi ? 2 : 1));
            s += hi ? dec2(b) : dec1(b); p += b.length; left -= n;
          }
          for (let q = 0; q < runs * 4 + ext; q++) u8at();
          sst.push(s);
        }
      }
      else if (r.t === 0x000A) { i++; break; }
    }
    const date = (v) => v;   // Datumswerte bleiben Zahlen mit Datumsformat
    void date;
    const BI = OfficeGrid.BUILTIN_FMT;
    const styleOf = (ixfe) => {
      const x = xfs[ixfe]; if (!x) return undefined;
      const s = {}, f = fonts[x.font];
      if (f) { if (f.b) s.b = true; if (f.i) s.i = true; if (f.u) s.u = true; if (f.s) s.s = true; if (f.sz && fonts[0] && f.sz !== fonts[0].sz) s.fs = f.sz; if (f.n && fonts[0] && f.n !== fonts[0].n) s.fn = f.n; if (f.icv < 64 && pal[f.icv] !== '000000') s.c = '#' + pal[f.icv].toLowerCase(); }
      if (x.fls >= 1 && x.fore < 64) s.bg = '#' + pal[x.fore].toLowerCase();
      if (x.alc === 1) s.al = 'l'; else if (x.alc === 2 || x.alc === 6) s.al = 'c'; else if (x.alc === 3) s.al = 'r'; else if (x.alc === 5 || x.alc === 7) s.al = 'l';
      if (x.alcV === 0) s.va = 't'; else if (x.alcV === 1) s.va = 'm';
      if (x.wrap) s.wr = true;
      if (x.ind) s.in = x.ind;
      const bd = x.bd.map((v, k) => v ? (v === 2 || v === 5 || v === 6 ? 'LRTB'[k] : 'lrtb'[k]) : '').join('');
      if (bd) s.bd = bd;
      const code = fmts[x.fmt] ?? BI[x.fmt];
      if (code && code !== 'General') s.nfc = code;
      return Object.keys(s).length ? s : undefined;
    };
    const rk = (v) => { let n; if (v & 2) n = v >> 2; else { const b = new DataView(new ArrayBuffer(8)); b.setUint32(4, v & 0xFFFFFFFC, true); n = b.getFloat64(0, true); } return v & 1 ? n / 100 : n; };
    const errs = { 0: '#NULL!', 7: '#DIV/0!', 15: '#VALUE!', 23: '#REF!', 29: '#NAME?', 36: '#NUM!', 42: '#N/A' };
    const book = { sheets: [], font: fonts[0] ? { n: fonts[0].n, s: fonts[0].sz } : { n: 'Arial', s: 10 }, d1904 };
    let lost = 0;
    const byPos = new Map(recs.map((r, k) => [r.o - 4, k]));
    for (const sh of sheets) {
      if (sh.chart) continue;
      const start = byPos.get(sh.pos);
      if (start == null) continue;
      const out = { name: sh.name.slice(0, 31) || 'Tabelle' + (book.sheets.length + 1), hidden: sh.hidden, cells: {}, cols: {}, rowh: {}, merges: [], hideR: [], hideC: [] };
      let pending = null, frozen = false, defw = null;
      const shared = new Map();
      for (let k = start + 1; k < recs.length; k++) {
        const r = recs[k], o = r.o;
        if (r.t === 0x000A) break;
        const put = (rw, col, v, ix, f) => { const c = { v }; const st = styleOf(ix); if (st) c.s = st; if (f) c.f = f; out.cells[this.ref(col, rw)] = c; };
        if (r.t === 0x00FD) put(dv.getUint16(o, true), dv.getUint16(o + 2, true), sst[dv.getUint32(o + 6, true)] ?? '', dv.getUint16(o + 4, true));
        else if (r.t === 0x0204 || r.t === 0x00D6) put(dv.getUint16(o, true), dv.getUint16(o + 2, true), str(o + 6, 2).s, dv.getUint16(o + 4, true));
        else if (r.t === 0x0203) put(dv.getUint16(o, true), dv.getUint16(o + 2, true), dv.getFloat64(o + 6, true), dv.getUint16(o + 4, true));
        else if (r.t === 0x027E) put(dv.getUint16(o, true), dv.getUint16(o + 2, true), rk(dv.getInt32(o + 6, true)), dv.getUint16(o + 4, true));
        else if (r.t === 0x00BD) { const rw = dv.getUint16(o, true), c1 = dv.getUint16(o + 2, true), n = (r.n - 6) / 6; for (let q = 0; q < n; q++) put(rw, c1 + q, rk(dv.getInt32(o + 4 + q * 6 + 2, true)), dv.getUint16(o + 4 + q * 6, true)); }
        else if (r.t === 0x0205) { const v = wb[o + 6], e = wb[o + 7]; put(dv.getUint16(o, true), dv.getUint16(o + 2, true), e ? (errs[v] || '#N/A') : !!v, dv.getUint16(o + 4, true)); }
        else if (r.t === 0x0201) { const st = styleOf(dv.getUint16(o + 4, true)); if (st && (st.bg || st.bd)) out.cells[this.ref(dv.getUint16(o + 2, true), dv.getUint16(o, true))] = { v: null, s: st }; }
        else if (r.t === 0x00BE) { const rw = dv.getUint16(o, true), c1 = dv.getUint16(o + 2, true), n = (r.n - 6) / 2; for (let q = 0; q < n; q++) { const st = styleOf(dv.getUint16(o + 4 + q * 2, true)); if (st && (st.bg || st.bd)) out.cells[this.ref(c1 + q, rw)] = { v: null, s: st }; } }
        else if (r.t === 0x0006) {
          const rw = dv.getUint16(o, true), col = dv.getUint16(o + 2, true), ix = dv.getUint16(o + 4, true);
          let v;
          if (dv.getUint16(o + 12, true) === 0xFFFF) { const ty = wb[o + 6]; v = ty === 1 ? !!wb[o + 8] : ty === 2 ? (errs[wb[o + 8]] || '#N/A') : ty === 3 ? '' : null; if (ty === 0) pending = { rw, col }; }
          else v = dv.getFloat64(o + 6, true);
          let f = null;
          if (biff >= 8) {
            const cce = dv.getUint16(o + 20, true), g = wb.subarray(o + 22, o + 22 + cce);
            if (g[0] === 0x01 && cce >= 5) {
              // geteilte Formel (SHRFMLA folgt der ersten Zelle des Bereichs): Vorlage mit relativen Bezügen
              const base = dv.getUint16(o + 23, true) + ':' + dv.getUint16(o + 25, true);
              let sh2 = shared.get(base);
              if (!sh2 && recs[k + 1] && recs[k + 1].t === 0x04BC) { const so = recs[k + 1].o, scce = dv.getUint16(so + 8, true); sh2 = wb.subarray(so + 10, so + 10 + scce); shared.set(base, sh2); }
              if (sh2) f = this.xlsFormula(sh2, sheets, xti, { rw, col });
            } else f = this.xlsFormula(g, sheets, xti, { rw, col });
            if (!f) lost++;
          }
          put(rw, col, v, ix, f);
        }
        else if (r.t === 0x0207 && pending) { const c = out.cells[this.ref(pending.col, pending.rw)]; if (c) c.v = biff >= 8 ? str(o, 2).s : dec1(wb.subarray(o + 2, o + 2 + dv.getUint16(o, true))); pending = null; }
        else if (r.t === 0x007D) { const a = dv.getUint16(o, true), b = dv.getUint16(o + 2, true), w = dv.getUint16(o + 4, true) / 256, fl = dv.getUint16(o + 8, true); for (let c = a; c <= Math.min(b, a + 255); c++) { out.cols[c] = w; if (fl & 1) out.hideC.push(c); } }
        else if (r.t === 0x0055) defw = dv.getUint16(o, true);
        else if (r.t === 0x0208) { const rw = dv.getUint16(o, true), h = dv.getUint16(o + 6, true), fl = dv.getUint16(o + 12, true); if (fl & 0x20) out.hideR.push(rw); else if (fl & 0x40) out.rowh[rw] = (h & 0x7FFF) / 20; }
        else if (r.t === 0x00E5) { const n = dv.getUint16(o, true); for (let q = 0; q < n; q++) { const b = o + 2 + q * 8; out.merges.push(this.ref(dv.getUint16(b + 4, true), dv.getUint16(b, true)) + ':' + this.ref(dv.getUint16(b + 6, true), dv.getUint16(b + 2, true))); } }
        else if (r.t === 0x023E) frozen = !!(dv.getUint16(o, true) & 8);
        else if (r.t === 0x0041 && frozen) { const x = dv.getUint16(o, true), y = dv.getUint16(o + 2, true); if (x || y) out.freeze = { c: x, r: y }; }
      }
      if (defw) out.defw = defw;
      book.sheets.push(out);
    }
    if (lost) notes.push(`${lost} Formel(n) mit Funktionen, die beim Umwandeln nicht bekannt sind, stehen als Wert da.`);
    if (!book.sheets.length) book.sheets.push({ name: 'Tabelle1', cells: {} });
    return book;
  },
  /* BIFF8-Formel (umgekehrte polnische Notation) → Excel-Text (ohne „=“) oder null */
  XLS_FN: {
    0: 'COUNT', 1: 'IF', 2: ['ISNA', 1], 3: ['ISERROR', 1], 4: 'SUM', 5: 'AVERAGE', 6: 'MIN', 7: 'MAX', 8: 'ROW', 9: 'COLUMN', 10: ['NA', 0], 12: 'STDEV', 15: ['SIN', 1], 16: ['COS', 1], 17: ['TAN', 1], 18: ['ATAN', 1], 19: ['PI', 0], 20: ['SQRT', 1], 21: ['EXP', 1], 22: ['LN', 1], 23: ['LOG10', 1], 24: ['ABS', 1], 25: ['INT', 1], 26: ['SIGN', 1], 27: ['ROUND', 2], 28: 'LOOKUP', 29: 'INDEX', 30: ['REPT', 2], 31: ['MID', 3], 32: ['LEN', 1], 33: ['VALUE', 1], 34: ['TRUE', 0], 35: ['FALSE', 0], 36: 'AND', 37: 'OR', 38: ['NOT', 1], 39: ['MOD', 2], 46: 'VAR', 48: ['TEXT', 2], 56: 'PV', 57: 'FV', 58: 'NPER', 59: 'PMT', 62: 'IRR', 63: ['RAND', 0], 64: 'MATCH', 65: ['DATE', 3], 66: ['TIME', 3], 67: ['DAY', 1], 68: ['MONTH', 1], 69: ['YEAR', 1], 70: 'WEEKDAY', 71: ['HOUR', 1], 72: ['MINUTE', 1], 73: ['SECOND', 1], 74: ['NOW', 0], 76: ['ROWS', 1], 77: ['COLUMNS', 1], 78: 'OFFSET', 82: 'SEARCH', 86: ['TYPE', 1], 97: ['ATAN2', 2], 98: ['ASIN', 1], 99: ['ACOS', 1], 101: 'HLOOKUP', 102: 'VLOOKUP', 109: 'LOG', 111: ['CHAR', 1], 112: ['LOWER', 1], 113: ['UPPER', 1], 114: ['PROPER', 1], 115: 'LEFT', 116: 'RIGHT', 117: ['EXACT', 2], 118: ['TRIM', 1], 119: ['REPLACE', 4], 120: 'SUBSTITUTE', 121: ['CODE', 1], 124: 'FIND', 126: ['ISERR', 1], 127: ['ISTEXT', 1], 128: ['ISNUMBER', 1], 129: ['ISBLANK', 1], 130: ['T', 1], 131: ['N', 1], 140: ['DATEVALUE', 1], 141: ['TIMEVALUE', 1], 148: 'INDIRECT', 162: ['CLEAN', 1], 169: 'COUNTA', 183: 'PRODUCT', 184: ['FACT', 1], 190: ['ISNONTEXT', 1], 193: 'STDEVP', 194: 'VARP', 197: 'TRUNC', 198: ['ISLOGICAL', 1], 212: ['ROUNDUP', 2], 213: ['ROUNDDOWN', 2], 216: 'RANK', 220: 'DAYS360', 221: ['TODAY', 0], 227: 'MEDIAN', 228: 'SUMPRODUCT', 285: ['FLOOR', 2], 288: ['CEILING', 2], 336: 'CONCATENATE', 337: ['POWER', 2], 342: ['RADIANS', 1], 343: ['DEGREES', 1], 344: 'SUBTOTAL', 345: 'SUMIF', 346: ['COUNTIF', 2], 347: ['COUNTBLANK', 1], 359: 'HYPERLINK', 362: 'MAXA', 363: 'MINA',
  },
  xlsFormula(g, sheets, xti, at) {
    const dv = new DataView(g.buffer, g.byteOffset, g.byteLength);
    const st = [], ops = { 3: '+', 4: '-', 5: '*', 6: '/', 7: '^', 8: '&', 9: '<', 10: '<=', 11: '=', 12: '>=', 13: '>', 14: '<>', 15: ' ', 16: ',', 17: ':' };
    const cell = (rw, cc) => { const c = cc & 0x3FFF; return (cc & 0x4000 ? '' : '$') + this.colName(c) + (cc & 0x8000 ? '' : '$') + (rw + 1); };
    const sheetOf = (ix) => { const s = sheets[xti[ix]]; if (!s) return null; const n = s.name; return /^[A-Za-z_][A-Za-z0-9_.]*$/.test(n) ? n + '!' : "'" + n.replace(/'/g, "''") + "'!"; };
    let p = 0;
    try {
      while (p < g.length) {
        const t = g[p++], b = t >= 0x20 ? (t & 0x1F) | 0x20 : t;
        if (ops[t]) { const y = st.pop(), x = st.pop(); if (x == null) return null; st.push(x + ops[t] + y); }
        else if (t === 0x12) st.push('+' + st.pop());
        else if (t === 0x13) st.push('-' + st.pop());
        else if (t === 0x14) st.push(st.pop() + '%');
        else if (t === 0x15) st.push('(' + st.pop() + ')');
        else if (t === 0x16) st.push('');
        else if (t === 0x17) { const n = g[p], fl = g[p + 1]; const s = fl & 1 ? new TextDecoder('utf-16le').decode(g.subarray(p + 2, p + 2 + n * 2)) : new TextDecoder('windows-1252').decode(g.subarray(p + 2, p + 2 + n)); p += 2 + (fl & 1 ? n * 2 : n); st.push('"' + s.replace(/"/g, '""') + '"'); }
        else if (t === 0x19) { const fl = g[p], w = dv.getUint16(p + 1, true); p += 3; if (fl & 0x04) p += (w + 1) * 2; if (fl & 0x10) st.push('SUM(' + st.pop() + ')'); }
        else if (t === 0x1C) { st.push({ 0: '#NULL!', 7: '#DIV/0!', 15: '#VALUE!', 23: '#REF!', 29: '#NAME?', 36: '#NUM!', 42: '#N/A' }[g[p++]] || '#N/A'); }
        else if (t === 0x1D) st.push(g[p++] ? 'TRUE' : 'FALSE');
        else if (t === 0x1E) { st.push(String(dv.getUint16(p, true))); p += 2; }
        else if (t === 0x1F) { st.push(String(dv.getFloat64(p, true))); p += 8; }
        else if (b === 0x21 || b === 0x22) {
          let n, id;
          if (b === 0x22) { n = g[p] & 0x7F; id = dv.getUint16(p + 1, true) & 0x7FFF; p += 3; } else { id = dv.getUint16(p, true); p += 2; }
          const fdef = this.XLS_FN[id];
          if (fdef == null) return null;
          const name = Array.isArray(fdef) ? fdef[0] : fdef;
          if (b === 0x21) { if (!Array.isArray(fdef)) return null; n = fdef[1]; }
          const args = st.splice(st.length - n, n);
          if (args.length !== n) return null;
          st.push(name + '(' + args.join(',') + ')');
        }
        else if (b === 0x24) { st.push(cell(dv.getUint16(p, true), dv.getUint16(p + 2, true))); p += 4; }
        else if (b === 0x25) { st.push(cell(dv.getUint16(p, true), dv.getUint16(p + 4, true)) + ':' + cell(dv.getUint16(p + 2, true), dv.getUint16(p + 6, true))); p += 8; }
        else if (b === 0x26 || b === 0x27) p += 6;
        else if (b === 0x29) p += 2;
        else if (b === 0x2C || b === 0x2D) {
          // relative Bezüge geteilter Formeln: Zeile/Spalte als Versatz zur Zelle
          if (!at) return null;
          const rel = (rw, cc) => { const r = cc & 0x8000 ? (at.rw + ((rw << 16) >> 16)) & 0xFFFF : rw; const c = cc & 0x4000 ? (at.col + (((cc & 0xFF) << 24) >> 24)) & 0xFF : cc & 0xFF; return cell(r, (c & 0x3FFF) | (cc & 0xC000)); };
          if (b === 0x2C) { st.push(rel(dv.getUint16(p, true), dv.getUint16(p + 2, true))); p += 4; }
          else { st.push(rel(dv.getUint16(p, true), dv.getUint16(p + 4, true)) + ':' + rel(dv.getUint16(p + 2, true), dv.getUint16(p + 6, true))); p += 8; }
        }
        else if (b === 0x2A) { st.push('#REF!'); p += 4; }
        else if (b === 0x2B) { st.push('#REF!'); p += 8; }
        else if (b === 0x3A) { const s = sheetOf(dv.getUint16(p, true)); if (!s) return null; st.push(s + cell(dv.getUint16(p + 2, true), dv.getUint16(p + 4, true))); p += 6; }
        else if (b === 0x3B) { const s = sheetOf(dv.getUint16(p, true)); if (!s) return null; st.push(s + cell(dv.getUint16(p + 2, true), dv.getUint16(p + 6, true)) + ':' + cell(dv.getUint16(p + 4, true), dv.getUint16(p + 8, true))); p += 10; }
        else return null;   // geteilte Formeln, Namen, Matrizen … → Wert
      }
    } catch (e) { return null; }
    return st.length === 1 && typeof st[0] === 'string' && st[0] ? st[0] : null;
  },

  /* OpenDocument-Tabelle (.ods) */
  async readOds(u8, notes) {
    const z = await this.unzip(u8);
    const doc = await z.xml('content.xml');
    if (!doc) throw new Error('Keine OpenDocument-Tabelle (content.xml fehlt)');
    const sdoc = await z.xml('styles.xml');
    const NS = { table: 'urn:oasis:names:tc:opendocument:xmlns:table:1.0', office: 'urn:oasis:names:tc:opendocument:xmlns:office:1.0', text: 'urn:oasis:names:tc:opendocument:xmlns:text:1.0', style: 'urn:oasis:names:tc:opendocument:xmlns:style:1.0', fo: 'urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0' };
    const A = (e, ns, n) => e.getAttributeNS(NS[ns], n);
    const styles = this.odfStyles([doc, sdoc], NS);
    const book = { sheets: [], font: { n: 'Liberation Sans', s: 10 } };
    const def = styles.get('Default') || styles.get('default');
    if (def && def.fn) book.font = { n: def.fn, s: def.fs || 10 };
    let big = false;
    for (const t of doc.getElementsByTagNameNS(NS.table, 'table')) {
      if (t.parentNode && t.parentNode.localName !== 'spreadsheet') continue;
      const out = { name: (A(t, 'table', 'name') || 'Tabelle').slice(0, 31), cells: {}, cols: {}, rowh: {}, merges: [], hideR: [], hideC: [] };
      const ts = styles.get(A(t, 'table', 'style-name'));
      if (ts && ts.hidden) out.hidden = 'hidden';
      let ci = 0;
      const colStyle = [];
      for (const c of t.getElementsByTagNameNS(NS.table, 'table-column')) {
        const n = Math.min(+(A(c, 'table', 'number-columns-repeated') || 1), 1024 - ci), st = styles.get(A(c, 'table', 'style-name'));
        for (let k = 0; k < n && ci < 1024; k++, ci++) { if (st && st.cw) out.cols[ci] = st.cw / 7; if (A(c, 'table', 'visibility') === 'collapse') out.hideC.push(ci); colStyle[ci] = A(c, 'table', 'default-cell-style-name'); }
      }
      let ri = 0;
      for (const row of t.getElementsByTagNameNS(NS.table, 'table-row')) {
        const rep = +(A(row, 'table', 'number-rows-repeated') || 1);
        const cellsEls = [...row.children].filter(x => x.localName === 'table-cell' || x.localName === 'covered-table-cell');
        const empty = !cellsEls.some(c => c.firstElementChild || A(c, 'office', 'value-type'));
        if (empty && rep > 50) { ri += rep; continue; }   // leere Füllzeilen bis zum Blattende
        const rst = styles.get(A(row, 'table', 'style-name'));
        for (let rr = 0; rr < Math.min(rep, 2000); rr++, ri++) {
          if (ri >= 10000) { big = true; break; }
          if (rst && rst.rh && rst.customH) out.rowh[ri] = rst.rh * 72 / 96;
          if (A(row, 'table', 'visibility') === 'collapse') out.hideR.push(ri);
          let cc = 0;
          for (const c of cellsEls) {
            const crep = Math.min(+(A(c, 'table', 'number-columns-repeated') || 1), 1024);
            const vt = A(c, 'office', 'value-type');
            const has = !!(vt || c.firstElementChild);
            const sn = A(c, 'table', 'style-name') || colStyle[cc];
            const st = sn ? styles.get(sn) : null;
            if (!has && (!st || !st.bg) || c.localName === 'covered-table-cell') { cc += crep; continue; }
            for (let k = 0; k < Math.min(crep, 200); k++, cc++) {
              let v = null;
              if (vt === 'float' || vt === 'percentage' || vt === 'currency') v = +A(c, 'office', 'value');
              else if (vt === 'boolean') v = A(c, 'office', 'boolean-value') === 'true';
              else if (vt === 'date') { const dt = A(c, 'office', 'date-value'); const m = /^(\d{4})-(\d\d)-(\d\d)(?:T(\d\d):(\d\d):?(\d\d)?)?/.exec(dt || ''); v = m ? (Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0)) - Date.UTC(1899, 11, 30)) / 864e5 : null; }
              else if (vt === 'time') { const m = /PT(\d+)H(\d+)M([\d.]+)S/.exec(A(c, 'office', 'time-value') || ''); v = m ? (+m[1] * 3600 + +m[2] * 60 + +m[3]) / 86400 : null; }
              else v = this.odfText(c, NS);
              const cell = { v };
              const fx = A(c, 'table', 'formula');
              if (fx) { const f = this.odsFormula(fx); if (f) cell.f = f; }
              const s = st ? { ...st.cell } : {};
              if (vt === 'percentage' && !s.nfc) s.nfc = '0.00%';
              if (vt === 'date' && !s.nfc) s.nfc = /T\d/.test(A(c, 'office', 'date-value') || '') ? 'dd.mm.yyyy hh:mm' : 'dd.mm.yyyy';
              if (vt === 'time' && !s.nfc) s.nfc = 'hh:mm';
              if (vt === 'currency' && !s.nfc) s.nfc = '#,##0.00 "' + (A(c, 'office', 'currency') || 'CHF') + '"';
              if (Object.keys(s).length) cell.s = s;
              const cs = +(A(c, 'table', 'number-columns-spanned') || 1), rs = +(A(c, 'table', 'number-rows-spanned') || 1);
              if ((cs > 1 || rs > 1) && k === 0) out.merges.push(this.ref(cc, ri) + ':' + this.ref(cc + cs - 1, ri + rs - 1));
              out.cells[this.ref(cc, ri)] = cell;
            }
          }
        }
      }
      book.sheets.push(out);
    }
    if (big) notes.push('Nur die ersten 10’000 Zeilen wurden übernommen.');
    if (!book.sheets.length) book.sheets.push({ name: 'Tabelle1', cells: {} });
    return book;
  },
  /* ODF-Formel → Excel-Text: of:=SUMME([.A1:.B2];1) → SUM(A1:B2,1) */
  odsFormula(f) {
    let s = String(f).replace(/^(of|oooc|msoxl):/, '').replace(/^=/, '');
    let out = '', q = false;
    for (let i = 0; i < s.length; i++) {
      const ch = s[i];
      if (ch === '"') { q = !q; out += ch; continue; }
      if (q) { out += ch; continue; }
      if (ch === '[') {
        const j = s.indexOf(']', i); if (j < 0) return null;
        const inner = s.slice(i + 1, j).split(':').map(part => {
          const m = /^\$?(?:'((?:[^']|'')+)'|([^.]*))?\.(\$?[A-Z]+\$?\d+)$/.exec(part);
          if (!m) return null;
          const sh = m[1] != null ? m[1].replace(/''/g, "'") : m[2];
          return (sh ? (/^[A-Za-z_][A-Za-z0-9_]*$/.test(sh) ? sh : "'" + sh.replace(/'/g, "''") + "'") + '!' : '') + m[3];
        });
        if (inner.some(x => x == null)) return null;
        out += inner.length === 2 && inner[1].includes('!') && inner[0].split('!')[0] === inner[1].split('!')[0] ? inner[0] + ':' + inner[1].split('!')[1] : inner.join(':');
        i = j; continue;
      }
      out += ch === ';' ? ',' : ch;
    }
    return out;
  },
  /* automatische Formatvorlagen (ODF) → Map Name → { cell: Format, cw, rh, hidden, fn, fs, b, i, u, c, al, heading } */
  odfStyles(docs, NS) {
    const map = new Map(), raw = new Map();
    for (const d of docs) if (d) for (const s of d.getElementsByTagNameNS(NS.style, 'style')) raw.set(s.getAttributeNS(NS.style, 'name'), s);
    for (const d of docs) if (d) for (const s of d.getElementsByTagNameNS(NS.style, 'default-style')) if (s.getAttributeNS(NS.style, 'family') === 'table-cell' || s.getAttributeNS(NS.style, 'family') === 'paragraph') raw.set('default', s);
    const color = (v) => v && /^#[0-9a-fA-F]{6}$/.test(v) && v.toLowerCase() !== 'transparent' ? v.toLowerCase() : null;
    const get = (name, depth = 0) => {
      if (!name || depth > 8) return null;
      if (map.has(name)) return map.get(name);
      const s = raw.get(name);
      if (!s) return null;
      const parent = get(s.getAttributeNS(NS.style, 'parent-style-name'), depth + 1);
      const o = parent ? JSON.parse(JSON.stringify(parent)) : { cell: {} };
      const disp = s.getAttributeNS(NS.style, 'display-name') || name;
      const hm = /^(Heading|Überschrift)[ _]?(?:_20_)?(\d)$/i.exec(disp.replace(/_20_/g, ' ').replace(/ /g, '')) || /Heading_20_(\d)/.exec(name);
      if (hm) o.heading = +(hm[2] || hm[1]);
      const ol = s.getAttributeNS(NS.style, 'default-outline-level'); if (ol) o.heading = +ol;
      for (const p of s.children) {
        const A = (n, ns = 'fo') => p.getAttributeNS(NS[ns], n);
        if (p.localName === 'table-cell-properties') {
          const bg = color(A('background-color')); if (bg && bg !== '#ffffff') o.cell.bg = bg;
          const va = A('vertical-align', 'style'); if (va === 'top') o.cell.va = 't'; else if (va === 'middle') o.cell.va = 'm';
          if (A('wrap-option') === 'wrap') o.cell.wr = true;
          let bd = '';
          for (const [k, n] of [['t', 'top'], ['b', 'bottom'], ['l', 'left'], ['r', 'right']]) { const v = A('border-' + n) || A('border'); if (v && v !== 'none' && !/^0/.test(v)) bd += /([\d.]+)pt/.test(v) && +/([\d.]+)pt/.exec(v)[1] > 1.2 ? k.toUpperCase() : k; }
          if (bd) o.cell.bd = bd;
        } else if (p.localName === 'paragraph-properties') {
          const al = A('text-align'); const a = { start: 'l', left: 'l', center: 'c', end: 'r', right: 'r', justify: 'j' }[al];
          if (a) { o.al = a; if (a !== 'j') o.cell.al = a; }
        } else if (p.localName === 'text-properties') {
          if (A('font-weight') === 'bold') { o.b = true; o.cell.b = true; }
          if (A('font-style') === 'italic') { o.i = true; o.cell.i = true; }
          const u = A('text-underline-style', 'style'); if (u && u !== 'none') { o.u = true; o.cell.u = true; }
          const lt = A('text-line-through-style', 'style'); if (lt && lt !== 'none') { o.s = true; o.cell.s = true; }
          const c = color(A('color')); if (c && c !== '#000000') { o.c = c; o.cell.c = c; }
          const fs = A('font-size'); if (fs && /pt$/.test(fs)) { o.fs = +fs.replace('pt', ''); }
          const fn = A('font-name', 'style'); if (fn) o.fn = fn;
        } else if (p.localName === 'table-column-properties') { const w = A('column-width', 'style'); if (w) o.cw = this.len(w); }
        else if (p.localName === 'table-row-properties') { const h = A('row-height', 'style'); if (h) o.rh = this.len(h); if (A('use-optimal-row-height', 'style') === 'false') o.customH = true; }
        else if (p.localName === 'table-properties') { if (A('display', 'table') === 'false') o.hidden = true; }
      }
      map.set(name, o);
      return o;
    };
    return { get: (n) => get(n) };
  },
  odfText(el, NS) {
    const paras = [];
    for (const p of el.children) if (p.namespaceURI === NS.text && (p.localName === 'p' || p.localName === 'h')) paras.push(this.odfInline(p, NS).map(r => r.t).join(''));
    return paras.join('\n');
  },
  /* Absatzinhalt (ODF) → Läufe [{ t, b, i, u, s, c, sz }] */
  odfInline(p, NS, styles, base = {}) {
    const out = [];
    const walk = (n, fmt) => {
      for (const c of n.childNodes) {
        if (c.nodeType === 3) { if (c.nodeValue) out.push({ ...fmt, t: c.nodeValue }); continue; }
        if (c.nodeType !== 1) continue;
        const ln = c.localName;
        if (ln === 's') out.push({ ...fmt, t: ' '.repeat(+(c.getAttributeNS(NS.text, 'c') || 1)) });
        else if (ln === 'tab') out.push({ ...fmt, t: '\t' });
        else if (ln === 'line-break') out.push({ ...fmt, t: '\n' });
        else if (ln === 'note' || ln === 'annotation' || ln === 'bookmark' || ln === 'bookmark-start' || ln === 'bookmark-end' || ln === 'soft-page-break') continue;
        else if (ln === 'span' && styles) { const st = styles.get(c.getAttributeNS(NS.text, 'style-name')); const f2 = { ...fmt }; if (st) { for (const k of ['b', 'i', 'u', 's', 'c']) if (st[k]) f2[k] = st[k]; if (st.fs) f2.sz = st.fs; if (st.fn) f2.fn = st.fn; } walk(c, f2); }
        else walk(c, fmt);
      }
    };
    walk(p, base);
    return out;
  },

  /* ================================================================ Dokumente lesen */
  readTxt(text) {
    const blocks = text.replace(/\r\n?/g, '\n').split('\n').map(l => ({ t: 'p', runs: l ? [{ t: l.replace(/\f/g, '') }] : [] }));
    return { blocks };
  },
  /* Markdown: Überschriften, Listen, fett/kursiv/Code, Tabellen (| a | b |) */
  readMd(text) {
    const lines = text.replace(/\r\n?/g, '\n').split('\n'), blocks = [];
    const inl = (s) => {
      const runs = [], re = /(\*\*|__)(.+?)\1|(\*|_)(.+?)\3|`([^`]+)`|\[([^\]]+)\]\(([^)]+)\)|~~(.+?)~~/g;
      let p = 0, m;
      while ((m = re.exec(s))) {
        if (m.index > p) runs.push({ t: s.slice(p, m.index) });
        if (m[2]) runs.push({ t: m[2], b: true }); else if (m[4]) runs.push({ t: m[4], i: true }); else if (m[5]) runs.push({ t: m[5], fn: 'Consolas' }); else if (m[6]) runs.push({ t: m[6], u: true, c: '#0563c1' }); else if (m[8]) runs.push({ t: m[8], s: true });
        p = re.lastIndex;
      }
      if (p < s.length) runs.push({ t: s.slice(p) });
      return runs;
    };
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i];
      let m;
      if ((m = /^(#{1,6})\s+(.*)$/.exec(l))) blocks.push({ t: 'p', h: m[1].length, runs: inl(m[2].replace(/\s+#+\s*$/, '')) });
      else if ((m = /^(\s*)[-*+]\s+(\[[ xX]\]\s+)?(.*)$/.exec(l))) blocks.push({ t: 'p', list: { num: false, lvl: Math.min(2, Math.floor(m[1].length / 2)) }, runs: inl((m[2] ? (/x/i.test(m[2]) ? '☑ ' : '☐ ') : '') + m[3]) });
      else if ((m = /^(\s*)\d+[.)]\s+(.*)$/.exec(l))) blocks.push({ t: 'p', list: { num: true, lvl: Math.min(2, Math.floor(m[1].length / 2)) }, runs: inl(m[2]) });
      else if (/^\s*\|.*\|\s*$/.test(l)) {
        const rows = [];
        for (; i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i]); i++) { if (/^\s*\|[\s:|-]+\|\s*$/.test(lines[i])) continue; rows.push(lines[i].trim().slice(1, -1).split('|').map(c => [{ t: 'p', runs: inl(c.trim()) }])); }
        i--;
        blocks.push({ t: 'table', rows });
      }
      else if (/^(-{3,}|\*{3,}|_{3,})\s*$/.test(l)) blocks.push({ t: 'p', runs: [{ t: '―'.repeat(20), c: '#999999' }], al: 'c' });
      else if ((m = /^>\s?(.*)$/.exec(l))) blocks.push({ t: 'p', runs: inl(m[1]).map(r => ({ ...r, i: true, c: r.c || '#555555' })) });
      else if (/^```/.test(l)) { for (i++; i < lines.length && !/^```/.test(lines[i]); i++) blocks.push({ t: 'p', runs: [{ t: lines[i], fn: 'Consolas' }] }); }
      else if (l.trim() === '' && blocks.length && blocks[blocks.length - 1].t === 'p' && !(blocks[blocks.length - 1].runs || []).length) continue;
      else blocks.push({ t: 'p', runs: l ? inl(l) : [] });
    }
    return { blocks };
  },
  /* Word 97–2003: Text der Hauptgeschichte über die Stückliste (CLX); Tabellenzellen → Tabstopp, Felder → Ergebnis */
  readDoc(u8, notes) {
    const cf = this.cfb(u8);
    const wd = cf.get('WordDocument');
    if (!wd) throw new Error('Kein Word-Dokument in der Datei');
    const dv = new DataView(wd.buffer, wd.byteOffset, wd.byteLength);
    if (dv.getUint16(0, true) !== 0xA5EC) throw new Error('Word-Datei vor Word 97 – bitte in Word als .docx speichern');
    const fl = dv.getUint16(10, true);
    if (fl & 0x0100) throw new Error('Das Word-Dokument ist mit einem Kennwort geschützt');
    const tbl = cf.get(fl & 0x0200 ? '1Table' : '0Table');
    const ccp = dv.getInt32(76, true);
    const fcClx = dv.getUint32(0x1A2, true), lcbClx = dv.getUint32(0x1A6, true);
    let text = '';
    const cp1252 = new TextDecoder('windows-1252'), u16 = new TextDecoder('utf-16le');
    if (tbl && lcbClx) {
      const tv = new DataView(tbl.buffer, tbl.byteOffset, tbl.byteLength);
      let p = fcClx;
      while (tbl[p] === 1) p += 3 + tv.getInt16(p + 1, true);
      if (tbl[p] === 2) {
        const lcb = tv.getUint32(p + 1, true), base = p + 5, n = (lcb - 4) / 12;
        for (let k = 0; k < n; k++) {
          const cp0 = tv.getInt32(base + k * 4, true), cp1 = tv.getInt32(base + (k + 1) * 4, true);
          if (cp0 >= ccp) break;
          const pcd = base + (n + 1) * 4 + k * 8, fc = tv.getUint32(pcd + 2, true);
          const len = Math.min(cp1, ccp) - cp0;
          if (fc & 0x40000000) { const o = (fc & 0x3FFFFFFF) / 2; text += cp1252.decode(wd.subarray(o, o + len)); }
          else text += u16.decode(wd.subarray(fc, fc + len * 2));
        }
      }
    }
    if (!text) { const fcMin = dv.getUint32(24, true), fcMac = dv.getUint32(28, true); text = cp1252.decode(wd.subarray(fcMin, fcMac)); notes.push('Der Text wurde vereinfacht gelesen.'); }
    // Felder: nur das Ergebnis (zwischen 0x14 und 0x15); Bild-/Objektzeichen weg
    let out = '', depth = 0, show = [true];
    for (const ch of text) {
      if (ch === '\u0013') { depth++; show.push(false); continue; }
      if (ch === '\u0014') { show[show.length - 1] = true; continue; }
      if (ch === '\u0015') { if (depth) { depth--; show.pop(); } continue; }
      if (!show.every(Boolean)) continue;
      if (ch === '\u0001' || ch === '\u0008' || ch === '\u0002' || ch === '\u0005') continue;
      out += ch;
    }
    const blocks = [];
    for (let para of out.split(/\r/)) {
      if (para.includes('\u000C')) { const parts = para.split('\u000C'); para = parts.pop(); for (const pp of parts) { if (pp) blocks.push({ t: 'p', runs: [{ t: pp }] }); blocks.push({ t: 'pb' }); } }
      para = para.replace(/\u0007\u0007?$/, '').replace(/\u0007/g, '\t').replace(/\u000B/g, '\n').replace(/\u001E/g, '-').replace(/\u001F/g, '').replace(/ /g, ' ');
      blocks.push({ t: 'p', runs: para ? [{ t: para }] : [] });
    }
    notes.push('Word 97–2003: Text und Absätze übernommen, Formatierungen und Bilder nicht.');
    return { blocks };
  },
  /* Rich Text Format */
  readRtf(u8) {
    const src = new TextDecoder('latin1').decode(u8);
    if (!/^\{\\rtf/.test(src)) throw new Error('Keine RTF-Datei');
    const blocks = [], colors = [null], styleHeads = {};
    let para = { t: 'p', runs: [] }, row = null, cell = null, table = null;
    const st = [{ b: false, i: false, u: false, s: false, c: null, sz: null, skip: false, uc: 1, al: null, h: null, list: null, intbl: false }];
    const cur = () => st[st.length - 1];
    let cp = 'windows-1252';
    const flushPara = () => {
      const s = cur();
      para.al = s.al || para.al; if (s.h) para.h = s.h; if (s.list) para.list = s.list;
      if (s.intbl && row) { (cell || (cell = [])).push(para); }
      else { if (table) { blocks.push(table); table = null; } blocks.push(para); }
      para = { t: 'p', runs: [] };
    };
    const addText = (t) => {
      const s = cur(); if (s.skip || !t) return;
      const last = para.runs[para.runs.length - 1];
      const f = { b: s.b || undefined, i: s.i || undefined, u: s.u || undefined, s: s.s || undefined, c: s.c || undefined, sz: s.sz || undefined };
      if (last && JSON.stringify({ ...last, t: '' }) === JSON.stringify({ ...f, t: '' })) last.t += t; else para.runs.push({ ...f, t });
    };
    let i = 0, ucSkip = 0;
    const n = src.length;
    while (i < n) {
      const ch = src[i];
      if (ch === '{') { st.push({ ...cur() }); i++; continue; }
      if (ch === '}') { const s = st.pop(); if (s && s.dest === 'colortbl') { /* bereits gelesen */ } if (!st.length) break; i++; continue; }
      if (ch === '\\') {
        const m = /^\\([a-zA-Z]+)(-?\d+)? ?|^\\'([0-9a-fA-F]{2})|^\\([^a-zA-Z])/.exec(src.slice(i, i + 40));
        if (!m) { i++; continue; }
        i += m[0].length;
        if (m[3]) { if (ucSkip > 0) { ucSkip--; continue; } addText(new TextDecoder(cp).decode(new Uint8Array([parseInt(m[3], 16)]))); continue; }
        if (m[4]) { const c = m[4]; if (c === '*') cur().skip = true; else if (c === '~') addText(' '); else if (c === '-') { /* */ } else if (c === '_') addText('-'); else if (c === '\\' || c === '{' || c === '}') addText(c); else if (c === '\n' || c === '\r') { if (!cur().skip) flushPara(); } continue; }
        const w = m[1], a = m[2] != null ? +m[2] : null, s = cur();
        switch (w) {
          case 'fonttbl': case 'stylesheet': case 'info': case 'pict': case 'object': case 'header': case 'footer': case 'headerl': case 'headerr': case 'footerl': case 'footerr': case 'fldinst': case 'pntext': case 'listtext': case 'listtable': case 'listoverridetable': case 'themedata': case 'colorschememapping': case 'latentstyles': case 'datastore': case 'xmlnstbl': case 'generator': case 'rsidtbl': case 'mmathPr': case 'footnote': case 'annotation': case 'bkmkstart': case 'bkmkend':
            if (w === 'stylesheet') { s.dest = 'stylesheet'; s.skip = true; const end = this.rtfGroupEnd(src, i); const body = src.slice(i, end); for (const mm of body.matchAll(/\{[^{}]*?\\s(\d+)[^{}]*?\s([^;{}\\]+);\}/g)) { const hm = /heading (\d)|berschrift (\d)/i.exec(mm[2]); if (hm) styleHeads[mm[1]] = +(hm[1] || hm[2]); } }
            else s.skip = true;
            break;
          case 'colortbl': {
            const end = this.rtfGroupEnd(src, i), body = src.slice(i, end);
            colors.length = 0;   // Eintrag 0 = automatisch (leer vor dem ersten „;“)
            for (const part of body.split(';').slice(0, -1)) { const r = /\\red(\d+)/.exec(part), g = /\\green(\d+)/.exec(part), b = /\\blue(\d+)/.exec(part); colors.push(r ? '#' + [r, g, b].map(x => (+(x ? x[1] : 0)).toString(16).padStart(2, '0')).join('') : null); }
            s.skip = true; break;
          }
          case 'ansicpg': if (a) { try { new TextDecoder('windows-' + a); cp = 'windows-' + a; } catch (e) { /* */ } } break;
          case 'uc': s.uc = a ?? 1; break;
          case 'u': if (!s.skip) { addText(String.fromCharCode(a < 0 ? a + 65536 : a)); } ucSkip = s.uc; break;
          case 'par': case 'sect': if (!s.skip) flushPara(); break;
          case 'page': if (!s.skip) { flushPara(); blocks.push({ t: 'pb' }); } break;
          case 'line': addText('\n'); break;
          case 'tab': addText('\t'); break;
          case 'emdash': addText('—'); break; case 'endash': addText('–'); break; case 'bullet': addText('•'); break;
          case 'lquote': addText('‘'); break; case 'rquote': addText('’'); break; case 'ldblquote': addText('“'); break; case 'rdblquote': addText('”'); break;
          case 'b': s.b = a !== 0; break; case 'i': s.i = a !== 0; break; case 'strike': s.s = a !== 0; break;
          case 'ul': s.u = a !== 0; break; case 'ulnone': s.u = false; break;
          case 'fs': s.sz = a ? a / 2 : null; break;
          case 'cf': s.c = colors[a] || null; break;
          case 'plain': Object.assign(s, { b: false, i: false, u: false, s: false, c: null, sz: null }); break;
          case 'pard': Object.assign(s, { al: null, h: null, list: null, intbl: false }); break;
          case 'ql': s.al = 'l'; break; case 'qc': s.al = 'c'; break; case 'qr': s.al = 'r'; break; case 'qj': s.al = 'j'; break;
          case 's': if (styleHeads[a]) s.h = styleHeads[a]; break;
          case 'outlinelevel': if (a != null && a < 6) s.h = a + 1; break;
          case 'ls': s.list = { num: false, lvl: s.list ? s.list.lvl : 0 }; break;
          case 'ilvl': if (s.list) s.list.lvl = Math.min(2, a || 0); break;
          case 'pnlvlbody': case 'pndec': s.list = { num: w === 'pndec', lvl: 0 }; break;
          case 'intbl': s.intbl = true; if (!row) { row = []; table = table || { t: 'table', rows: [] }; } break;
          case 'cell': case 'nestcell': if (!s.skip) { flushPara(); if (row) { row.push(cell || [{ t: 'p', runs: [] }]); cell = null; } } break;
          case 'row': case 'nestrow': if (row) { if (!table) table = { t: 'table', rows: [] }; if (row.length) table.rows.push(row); row = null; } break;
          case 'trowd': if (!row) row = []; if (!table) table = { t: 'table', rows: [] }; break;
          default: break;
        }
        continue;
      }
      if (ch === '\r' || ch === '\n') { i++; continue; }
      let j = i; while (j < n && !'{}\\\r\n'.includes(src[j])) j++;
      let t = src.slice(i, j);
      if (ucSkip > 0) { const k = Math.min(ucSkip, t.length); t = t.slice(k); ucSkip -= k; }
      addText(new TextDecoder(cp).decode(Uint8Array.from(t, c => c.charCodeAt(0) & 255)));
      i = j;
    }
    if (para.runs.length) flushPara();
    if (table && table.rows.length) blocks.push(table);
    return { blocks };
  },
  rtfGroupEnd(src, i) { let d = 1; for (let k = i; k < src.length; k++) { const c = src[k]; if (c === '\\') { k++; continue; } if (c === '{') d++; else if (c === '}') { d--; if (!d) return k; } } return src.length; },
  /* OpenDocument-Text (.odt) */
  async readOdt(u8) {
    const z = await this.unzip(u8);
    const doc = await z.xml('content.xml');
    if (!doc) throw new Error('Kein OpenDocument-Text (content.xml fehlt)');
    const NS = { text: 'urn:oasis:names:tc:opendocument:xmlns:text:1.0', table: 'urn:oasis:names:tc:opendocument:xmlns:table:1.0', office: 'urn:oasis:names:tc:opendocument:xmlns:office:1.0', style: 'urn:oasis:names:tc:opendocument:xmlns:style:1.0', fo: 'urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0' };
    const styles = this.odfStyles([doc, await z.xml('styles.xml')], NS);
    // Listen: Nummerierung oder Aufzählung je Listenformat
    const numbered = new Set();
    for (const d of [doc]) for (const ls of d.getElementsByTagNameNS(NS.text, 'list-style')) if (ls.getElementsByTagNameNS(NS.text, 'list-level-style-number').length && !ls.getElementsByTagNameNS(NS.text, 'list-level-style-bullet').length) numbered.add(ls.getAttributeNS(NS.style, 'name'));
    const body = doc.getElementsByTagNameNS(NS.office, 'text')[0];
    const para = (p, extra = {}) => {
      const st = styles.get(p.getAttributeNS(NS.text, 'style-name'));
      const b = { t: 'p', runs: this.odfInline(p, NS, styles, st ? { b: st.b, i: st.i, u: st.u, c: st.c, sz: st.fs } : {}), ...extra };
      if (p.localName === 'h') b.h = Math.min(6, +(p.getAttributeNS(NS.text, 'outline-level') || 1));
      else if (st && st.heading) b.h = st.heading;
      if (st && st.al) b.al = st.al;
      for (const r of b.runs) for (const k of Object.keys(r)) if (r[k] === undefined) delete r[k];
      return b;
    };
    const blocks = [];
    const walk = (parent, out, list) => {
      for (const n of parent.children) {
        const ln = n.localName;
        if (ln === 'p' || ln === 'h') out.push(para(n, list ? { list } : {}));
        else if (ln === 'list') {
          const num = list ? list.num : numbered.has(n.getAttributeNS(NS.text, 'style-name'));
          for (const it of n.children) if (it.localName === 'list-item' || it.localName === 'list-header') walk(it, out, { num, lvl: list ? Math.min(2, list.lvl + 1) : 0 });
        }
        else if (ln === 'table') {
          const rows = [];
          for (const r of n.getElementsByTagNameNS(NS.table, 'table-row')) { const row = []; for (const c of r.children) if (c.localName === 'table-cell') { const cb = []; walk(c, cb, null); row.push(cb.length ? cb : [{ t: 'p', runs: [] }]); } if (row.length) rows.push(row); }
          if (rows.length) out.push({ t: 'table', rows });
        }
        else if (ln === 'section' || ln === 'index-body' || ln === 'table-of-content' || ln === 'alphabetical-index') walk(n, out, list);
      }
    };
    if (body) walk(body, blocks, null);
    return { blocks };
  },

  /* ================================================================ Präsentationen lesen */
  /* PowerPoint 97–2003: Titel und Texte je Folie (SlideListWithText), Foliengrösse aus DocumentAtom */
  readPpt(u8, notes) {
    const cf = this.cfb(u8);
    const s = cf.get('PowerPoint Document');
    if (!s) throw new Error('Keine PowerPoint-Präsentation in der Datei');
    const dv = new DataView(s.buffer, s.byteOffset, s.byteLength);
    const u16 = new TextDecoder('utf-16le'), l1 = new TextDecoder('windows-1252');
    let w = 960, h = 720;
    const order = [], slwt = [], persist = new Map();
    // 1) Durchlauf: Foliengrösse, Folienliste mit Texten (SlideListWithText), Persist-Verzeichnis (Folie → Stelle im Strom)
    const walk = (a, b, list) => {
      for (let p = a; p + 8 <= b;) {
        const vi = dv.getUint16(p, true), type = dv.getUint16(p + 2, true), len = dv.getUint32(p + 4, true);
        const ver = vi & 15, inst = vi >> 4, o = p + 8, end = Math.min(b, o + len);
        if (type === 0x03E9 && len >= 8) { w = dv.getInt32(o, true) / 6; h = dv.getInt32(o + 4, true) / 6; }
        else if (type === 0x1772) { for (let q = o; q + 4 <= end;) { const x = dv.getUint32(q, true), id = x & 0xFFFFF, n = x >>> 20; q += 4; for (let k = 0; k < n && q + 4 <= end; k++, q += 4) persist.set(id + k, dv.getUint32(q, true)); } }
        else if (type === 0x0FF0) walk(o, end, inst);
        else if (list === 0 && type === 0x03F3) { order.push(dv.getUint32(o, true)); slwt.push({ texts: [] }); }
        else if (list === 0 && type === 0x0F9F && slwt.length) slwt[slwt.length - 1].tt = dv.getUint32(o, true);
        else if (list === 0 && (type === 0x0FA0 || type === 0x0FA8) && slwt.length) { const sl = slwt[slwt.length - 1]; sl.texts.push({ type: sl.tt, text: type === 0x0FA0 ? u16.decode(s.subarray(o, end)) : l1.decode(s.subarray(o, end)) }); }
        else if (ver === 15 && type === 0x03E8) walk(o, end, list);
        p = o + len;
      }
    };
    walk(0, s.length, null);
    // 2) je Folie: Texte der Formen (ClientTextbox) mit Lage (ClientAnchor), Titel/Text aus dem Textkopf
    const shapesOf = (off) => {
      if (off == null || off + 8 > s.length || dv.getUint16(off + 2, true) !== 0x03EE) return [];
      const out = [];
      const rec = (a, b, sp) => {
        for (let p = a; p + 8 <= b;) {
          const vi = dv.getUint16(p, true), type = dv.getUint16(p + 2, true), len = dv.getUint32(p + 4, true), o = p + 8, end = Math.min(b, o + len);
          if (type === 0xF004) { const shp = { texts: [] }; rec(o, end, shp); if (shp.texts.length) out.push(shp); }
          else if ((vi & 15) === 15) rec(o, end, sp);
          else if (sp && type === 0xF010 && len >= 8) { const t = dv.getInt16(o, true), l = dv.getInt16(o + 2, true), r = dv.getInt16(o + 4, true), bt = dv.getInt16(o + 6, true); sp.box = { x: l / 6, y: t / 6, w: (r - l) / 6, h: (bt - t) / 6 }; }
          else if (sp && type === 0x0F9F) sp.tt = dv.getUint32(o, true);
          else if (sp && (type === 0x0FA0 || type === 0x0FA8)) sp.texts.push(type === 0x0FA0 ? u16.decode(s.subarray(o, end)) : l1.decode(s.subarray(o, end)));
          p = o + len;
        }
      };
      rec(off + 8, Math.min(s.length, off + 8 + dv.getUint32(off + 4, true)), null);
      return out;
    };
    const deck = { w: w > 100 ? w : 960, h: h > 100 ? h : 720, slides: [] };
    const paras = (t, bullet) => t.split('\r').map(x => ({ runs: [{ t: x.replace(/\u000B/g, '\n') }], bullet: bullet && !!x.trim(), lvl: 0 }));
    const n = Math.max(order.length, slwt.length);
    for (let i = 0; i < n; i++) {
      const items = [];
      const shapes = shapesOf(persist.get(order[i]));
      const fromList = (slwt[i] || { texts: [] }).texts;
      const isTitle = (tt) => tt === 0 || tt === 6;
      if (shapes.length) {
        for (const sp of shapes) {
          const title = isTitle(sp.tt), box = sp.box || { x: deck.w * 0.06, y: title ? deck.h * 0.05 : deck.h * 0.26, w: deck.w * 0.88, h: title ? deck.h * 0.18 : deck.h * 0.6 };
          items.push({ kind: title ? 'title' : 'body', ...box, paras: paras(sp.texts.join('\r'), sp.tt === 1 || sp.tt === 5 || sp.tt === 7 || sp.tt === 8) });
        }
        // Platzhaltertexte, die nur in der Folienliste stehen
        for (const t of fromList) if (!shapes.some(sp => sp.texts.join('\r') === t.text)) items.push({ kind: isTitle(t.type) ? 'title' : 'body', x: deck.w * 0.06, y: isTitle(t.type) ? deck.h * 0.05 : deck.h * 0.26, w: deck.w * 0.88, h: isTitle(t.type) ? deck.h * 0.18 : deck.h * 0.6, paras: paras(t.text, t.type === 1 || t.type === 7) });
      } else {
        const title = fromList.filter(t => isTitle(t.type)), body = fromList.filter(t => !isTitle(t.type) && t.type !== 2);
        if (title.length) items.push({ kind: 'title', x: deck.w * 0.06, y: deck.h * 0.05, w: deck.w * 0.88, h: deck.h * 0.18, paras: paras(title.map(t => t.text).join('\r')) });
        body.forEach((b, k) => items.push({ kind: 'body', x: deck.w * 0.06, y: deck.h * (0.26 + k * 0.7 / body.length), w: deck.w * 0.88, h: deck.h * 0.68 / body.length, paras: paras(b.text, b.type === 1 || b.type === 7 || b.type === 8) }));
      }
      deck.slides.push({ items, images: [] });
    }
    if (!deck.slides.length) throw new Error('Keine Folien gefunden');
    notes.push('PowerPoint 97–2003: Titel und Texte je Folie übernommen, Bilder und Formen nicht.');
    return deck;
  },
  /* OpenDocument-Präsentation (.odp): Rahmen mit Text und Bildern an ihrer Stelle */
  async readOdp(u8) {
    const z = await this.unzip(u8);
    const doc = await z.xml('content.xml');
    if (!doc) throw new Error('Keine OpenDocument-Präsentation (content.xml fehlt)');
    const NS = { draw: 'urn:oasis:names:tc:opendocument:xmlns:drawing:1.0', svg: 'urn:oasis:names:tc:opendocument:xmlns:svg-compatible:1.0', text: 'urn:oasis:names:tc:opendocument:xmlns:text:1.0', presentation: 'urn:oasis:names:tc:opendocument:xmlns:presentation:1.0', xlink: 'http://www.w3.org/1999/xlink', style: 'urn:oasis:names:tc:opendocument:xmlns:style:1.0', fo: 'urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0', office: 'urn:oasis:names:tc:opendocument:xmlns:office:1.0', table: 'urn:oasis:names:tc:opendocument:xmlns:table:1.0' };
    const sdoc = await z.xml('styles.xml');
    const styles = this.odfStyles([doc, sdoc], NS);
    let W = 960, H = 540;
    const pl = sdoc && sdoc.getElementsByTagNameNS(NS.style, 'page-layout-properties')[0];
    if (pl) { W = this.len(pl.getAttributeNS(NS.fo, 'page-width')) || W; H = this.len(pl.getAttributeNS(NS.fo, 'page-height')) || H; }
    const deck = { w: W, h: H, slides: [] };
    for (const pg of doc.getElementsByTagNameNS(NS.draw, 'page')) {
      const sl = { items: [], images: [], notes: '' };
      const frames = [...pg.children].filter(n => n.namespaceURI === NS.draw);
      for (const f of frames) {
        const x = this.len(f.getAttributeNS(NS.svg, 'x')), y = this.len(f.getAttributeNS(NS.svg, 'y')), w = this.len(f.getAttributeNS(NS.svg, 'width')), h = this.len(f.getAttributeNS(NS.svg, 'height'));
        const cls = f.getAttributeNS(NS.presentation, 'class');
        const img = f.getElementsByTagNameNS(NS.draw, 'image')[0];
        const tb = f.getElementsByTagNameNS(NS.draw, 'text-box')[0] || (f.localName === 'custom-shape' || f.localName === 'rect' ? f : null);
        if (img && !tb) {
          const href = img.getAttributeNS(NS.xlink, 'href');
          const bytes = href && await z.bytes(href);
          const ext = (href || '').split('.').pop().toLowerCase();
          if (bytes && /^(png|jpe?g|gif|bmp|svg)$/.test(ext)) sl.images.push({ x, y, w, h, bytes, ext: ext === 'jpg' ? 'jpeg' : ext });
          continue;
        }
        if (!tb) continue;
        const paras = [];
        const walk = (n, lvl, bullet) => {
          for (const c of n.children) {
            if (c.localName === 'p' || c.localName === 'h') paras.push({ runs: this.odfInline(c, NS, styles), lvl, bullet });
            else if (c.localName === 'list') for (const it of c.children) walk(it, cls === 'outline' || bullet ? Math.min(4, lvl + (bullet ? 1 : 0)) : lvl, true);
            else if (c.localName === 'list-item') walk(c, lvl, true);
          }
        };
        walk(tb, 0, cls === 'outline');
        if (!paras.some(p => p.runs.some(r => r.t.trim()))) continue;
        sl.items.push({ kind: cls === 'title' ? 'title' : 'body', x, y, w, h, paras });
      }
      const nt = pg.getElementsByTagNameNS(NS.presentation, 'notes')[0];
      if (nt) { const tbs = [...nt.getElementsByTagNameNS(NS.draw, 'text-box')]; sl.notes = tbs.map(t => this.odfText(t, NS)).join('\n').trim(); }
      deck.slides.push(sl);
    }
    if (!deck.slides.length) deck.slides.push({ items: [], images: [] });
    return deck;
  },

  /* ================================================================ OOXML bauen */
  /* Format (KnowledgeTree-Zellformat + nfc) → Excel-Zahlenformat */
  nfCode(s) { if (!s) return null; if (s.nfc) return s.nfc; return OfficeGrid.codeOf(s); },
  async buildXlsx(book) {
    const X = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n';
    const S = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
    const font0 = book.font || { n: 'Calibri', s: 11 };
    const fonts = [`<font><sz val="${font0.s}"/><name val="${this.xt(font0.n)}"/></font>`], fills = ['<fill><patternFill patternType="none"/></fill>', '<fill><patternFill patternType="gray125"/></fill>'];
    const borders = ['<border><left/><right/><top/><bottom/><diagonal/></border>'], numFmts = [], xfs = ['<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'];
    const idx = (arr, x) => { let i = arr.indexOf(x); if (i < 0) { arr.push(x); i = arr.length - 1; } return i; };
    const xfKey = new Map();
    const rgb = (c) => 'FF' + c.replace('#', '').toUpperCase();
    const xfOf = (s) => {
      if (!s) return 0;
      const key = JSON.stringify(s);
      if (xfKey.has(key)) return xfKey.get(key);
      const fo = `<font>${s.b ? '<b/>' : ''}${s.i ? '<i/>' : ''}${s.s ? '<strike/>' : ''}${s.u ? '<u/>' : ''}<sz val="${s.fs || font0.s}"/>${s.c ? `<color rgb="${rgb(s.c)}"/>` : ''}<name val="${this.xt(s.fn || font0.n)}"/></font>`;
      const fi = s.bg ? idx(fills, `<fill><patternFill patternType="solid"><fgColor rgb="${rgb(s.bg)}"/><bgColor indexed="64"/></patternFill></fill>`) : 0;
      const side = (k, n) => s.bd && s.bd.includes(k.toUpperCase()) ? `<${n} style="medium"><color auto="1"/></${n}>` : s.bd && s.bd.includes(k) ? `<${n} style="thin"><color auto="1"/></${n}>` : `<${n}/>`;
      const bi = s.bd ? idx(borders, `<border>${side('l', 'left')}${side('r', 'right')}${side('t', 'top')}${side('b', 'bottom')}<diagonal/></border>`) : 0;
      const code = this.nfCode(s);
      let nid = 0;
      if (code) { const bi2 = Object.entries(OfficeGrid.BUILTIN_FMT).find(([, c]) => c === code); if (bi2) nid = +bi2[0]; else { let k = numFmts.findIndex(x => x[1] === code); if (k < 0) { numFmts.push([164 + numFmts.length, code]); k = numFmts.length - 1; } nid = numFmts[k][0]; } }
      const al = (s.al && s.al !== 'j' ? ` horizontal="${{ l: 'left', c: 'center', r: 'right' }[s.al]}"` : '') + (s.va ? ` vertical="${s.va === 't' ? 'top' : 'center'}"` : '') + (s.wr ? ' wrapText="1"' : '') + (s.in ? ` indent="${s.in}"` : '');
      xfs.push(`<xf numFmtId="${nid}" fontId="${idx(fonts, fo)}" fillId="${fi}" borderId="${bi}" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1"${al ? ' applyAlignment="1"' : ''}>${al ? `<alignment${al}/>` : ''}</xf>`);
      xfKey.set(key, xfs.length - 1);
      return xfs.length - 1;
    };
    const files = [];
    const sheetsXml = [], rels = [], over = [];
    const used = new Set();
    book.sheets.forEach((sh, k) => {
      let name = String(sh.name || 'Tabelle' + (k + 1)).replace(/[:\\/?*[\]]/g, '_').slice(0, 31) || 'Tabelle' + (k + 1);
      while (used.has(name.toLowerCase())) name = name.slice(0, 28) + ' ' + (k + 1);
      used.add(name.toLowerCase());
      const rows = new Map();
      for (const [ref, c] of Object.entries(sh.cells || {})) {
        const m = /^([A-Z]+)(\d+)$/.exec(ref); if (!m) continue;
        const r = +m[2]; if (!rows.has(r)) rows.set(r, []);
        rows.get(r).push([OfficeXl.colN(m[1]), ref, c]);
      }
      for (const r of Object.keys(sh.rowh || {})) if (!rows.has(+r + 1)) rows.set(+r + 1, []);
      for (const r of sh.hideR || []) if (!rows.has(r + 1)) rows.set(r + 1, []);
      let sd = '';
      for (const r of [...rows.keys()].sort((a, b) => a - b)) {
        const list = rows.get(r).sort((a, b) => a[0] - b[0]);
        const ht = sh.rowh && sh.rowh[r - 1], hid = sh.hideR && sh.hideR.includes(r - 1);
        sd += `<row r="${r}"${ht ? ` ht="${ht}" customHeight="1"` : ''}${hid ? ' hidden="1"' : ''}>`;
        for (const [, ref, c] of list) {
          const s = xfOf(c.s), sa = s ? ` s="${s}"` : '';
          const f = c.f ? `<f>${this.xt(c.f)}</f>` : '';
          const v = c.v;
          if (v == null || v === '') sd += f ? `<c r="${ref}"${sa}>${f}</c>` : `<c r="${ref}"${sa}/>`;
          else if (typeof v === 'number') sd += `<c r="${ref}"${sa}>${f}<v>${isFinite(v) ? v : 0}</v></c>`;
          else if (typeof v === 'boolean') sd += `<c r="${ref}"${sa} t="b">${f}<v>${v ? 1 : 0}</v></c>`;
          else if (/^#(NULL!|DIV\/0!|VALUE!|REF!|NAME\?|NUM!|N\/A)$/.test(v)) sd += `<c r="${ref}"${sa} t="e">${f}<v>${v}</v></c>`;
          else if (f) sd += `<c r="${ref}"${sa} t="str">${f}<v>${this.xt(v)}</v></c>`;
          else sd += `<c r="${ref}"${sa} t="inlineStr"><is><t xml:space="preserve">${this.xt(v)}</t></is></c>`;
        }
        sd += '</row>';
      }
      const colsKeys = new Set([...Object.keys(sh.cols || {}).map(Number), ...(sh.hideC || [])]);
      const cols = [...colsKeys].sort((a, b) => a - b).map(c => { const w = (sh.cols || {})[c]; return `<col min="${c + 1}" max="${c + 1}" width="${(w || sh.defw || 8.43).toFixed(2)}"${w ? ' customWidth="1"' : ''}${(sh.hideC || []).includes(c) ? ' hidden="1"' : ''}/>`; }).join('');
      const fz = sh.freeze && (sh.freeze.r || sh.freeze.c) ? `<sheetViews><sheetView workbookViewId="0"${k === 0 ? ' tabSelected="1"' : ''}><pane${sh.freeze.c ? ` xSplit="${sh.freeze.c}"` : ''}${sh.freeze.r ? ` ySplit="${sh.freeze.r}"` : ''} topLeftCell="${this.ref(sh.freeze.c || 0, sh.freeze.r || 0)}" activePane="${sh.freeze.r && sh.freeze.c ? 'bottomRight' : sh.freeze.r ? 'bottomLeft' : 'topRight'}" state="frozen"/></sheetView></sheetViews>` : `<sheetViews><sheetView workbookViewId="0"${k === 0 ? ' tabSelected="1"' : ''}/></sheetViews>`;
      const merges = (sh.merges || []).length ? `<mergeCells count="${sh.merges.length}">${sh.merges.map(m => `<mergeCell ref="${m}"/>`).join('')}</mergeCells>` : '';
      const xml = X + `<worksheet ${S}>${fz}<sheetFormatPr defaultRowHeight="${Math.round(font0.s * 1.36 * 4) / 4}"${sh.defw ? ` defaultColWidth="${sh.defw}"` : ''}/>${cols ? `<cols>${cols}</cols>` : ''}<sheetData>${sd}</sheetData>${merges}</worksheet>`;
      files.push([`xl/worksheets/sheet${k + 1}.xml`, xml]);
      sheetsXml.push(`<sheet name="${this.xt(name)}" sheetId="${k + 1}"${sh.hidden ? ` state="${sh.hidden}"` : ''} r:id="rId${k + 1}"/>`);
      rels.push([`rId${k + 1}`, 'worksheet', `worksheets/sheet${k + 1}.xml`]);
      over.push([`xl/worksheets/sheet${k + 1}.xml`, 'application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml']);
    });
    // mindestens ein sichtbares Blatt
    if (!book.sheets.some(s => !s.hidden) && sheetsXml.length) sheetsXml[0] = sheetsXml[0].replace(/ state="\w+"/, '');
    const n = book.sheets.length;
    const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/', OFF = 'application/vnd.openxmlformats-officedocument.';
    files.unshift(['[Content_Types].xml', X + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>' +
      [['xl/workbook.xml', OFF + 'spreadsheetml.sheet.main+xml'], ...over, ['xl/styles.xml', OFF + 'spreadsheetml.styles+xml'], ['docProps/core.xml', 'application/vnd.openxmlformats-package.core-properties+xml']].map(([p, t]) => `<Override PartName="/${p}" ContentType="${t}"/>`).join('') + '</Types>']);
    files.push(['_rels/.rels', X + `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${R}officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>`]);
    files.push(['xl/_rels/workbook.xml.rels', X + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' + rels.map(([id, t, tg]) => `<Relationship Id="${id}" Type="${R}${t}" Target="${tg}"/>`).join('') + `<Relationship Id="rId${n + 1}" Type="${R}styles" Target="styles.xml"/></Relationships>`]);
    files.push(['xl/workbook.xml', X + `<workbook ${S}>${book.d1904 ? '<workbookPr date1904="1"/>' : ''}<bookViews><workbookView activeTab="${Math.max(0, book.sheets.findIndex(s => !s.hidden))}"/></bookViews><sheets>${sheetsXml.join('')}</sheets><calcPr fullCalcOnLoad="1"/></workbook>`]);
    files.push(['xl/styles.xml', X + `<styleSheet ${S}>${numFmts.length ? `<numFmts count="${numFmts.length}">${numFmts.map(([id, c]) => `<numFmt numFmtId="${id}" formatCode="${this.xt(c)}"/>`).join('')}</numFmts>` : ''}<fonts count="${fonts.length}">${fonts.join('')}</fonts><fills count="${fills.length}">${fills.join('')}</fills><borders count="${borders.length}">${borders.join('')}</borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="${xfs.length}">${xfs.join('')}</cellXfs><cellStyles count="1"><cellStyle name="Standard" xfId="0" builtinId="0"/></cellStyles></styleSheet>`]);
    files.push(['docProps/core.xml', X + '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:creator>KnowledgeTree</dc:creator></cp:coreProperties>']);
    return this.zip(files);
  },
  /* Dokument-Modell → document.xml (in das leere Paket von Ooxml.blank) */
  docxBody(doc) {
    const run = (r) => {
      if (!r.t) return '';
      // Reihenfolge wie im Schema (Word ist dabei streng): rFonts, b, i, strike, color, sz, u
      const rp = (r.fn ? `<w:rFonts w:ascii="${this.xt(r.fn)}" w:hAnsi="${this.xt(r.fn)}"/>` : '') + (r.b ? '<w:b/>' : '') + (r.i ? '<w:i/>' : '') + (r.s ? '<w:strike/>' : '') + (r.c ? `<w:color w:val="${r.c.replace('#', '').toUpperCase()}"/>` : '') + (r.sz ? `<w:sz w:val="${Math.round(r.sz * 2)}"/>` : '') + (r.u ? '<w:u w:val="single"/>' : '');
      return String(r.t).split('\n').map((line, k) => (k ? `<w:r>${rp ? `<w:rPr>${rp}</w:rPr>` : ''}<w:br/></w:r>` : '') + line.split('\t').map((seg, j) => (j ? `<w:r>${rp ? `<w:rPr>${rp}</w:rPr>` : ''}<w:tab/></w:r>` : '') + (seg ? `<w:r>${rp ? `<w:rPr>${rp}</w:rPr>` : ''}<w:t xml:space="preserve">${this.xt(seg)}</w:t></w:r>` : '')).join('')).join('');
    };
    const para = (b) => {
      const pp = (b.h ? `<w:pStyle w:val="Heading${Math.min(3, b.h)}"/>` : b.list ? '<w:pStyle w:val="ListParagraph"/>' : '') + (b.list ? `<w:numPr><w:ilvl w:val="${b.list.lvl || 0}"/><w:numId w:val="${b.list.num ? 2 : 1}"/></w:numPr>` : '') + (b.al && b.al !== 'l' ? `<w:jc w:val="${{ c: 'center', r: 'right', j: 'both' }[b.al]}"/>` : '');
      return `<w:p>${pp ? `<w:pPr>${pp}</w:pPr>` : ''}${(b.runs || []).map(run).join('')}</w:p>`;
    };
    const block = (b) => {
      if (b.t === 'pb') return '<w:p><w:r><w:br w:type="page"/></w:r></w:p>';
      if (b.t === 'table') {
        const nc = Math.max(1, ...b.rows.map(r => r.length)), w = Math.floor(9000 / nc);
        return `<w:tbl><w:tblPr><w:tblStyle w:val="TableGrid"/><w:tblW w:w="0" w:type="auto"/></w:tblPr><w:tblGrid>${'<w:gridCol w:w="' + w + '"/>'.repeat(nc)}</w:tblGrid>` +
          b.rows.map(r => '<w:tr>' + Array.from({ length: nc }, (_, k) => `<w:tc><w:tcPr><w:tcW w:w="${w}" w:type="dxa"/></w:tcPr>${(r[k] && r[k].length ? r[k] : [{ t: 'p', runs: [] }]).map(x => x.t === 'table' ? para({ runs: [] }) : para(x)).join('')}</w:tc>`).join('') + '</w:tr>').join('') + '</w:tbl><w:p/>';
      }
      return para(b);
    };
    return doc.blocks.map(block).join('');
  },
  async buildDocx(doc) {
    const parts = Ooxml.blankParts('docx');
    parts['word/document.xml'] = parts['word/document.xml'].replace('<w:body><w:p/>', '<w:body>' + (this.docxBody(doc) || '<w:p/>'));
    const enc = new TextEncoder(), entries = [];
    for (const [name, text] of Object.entries(parts)) entries.push(await Ooxml.entry(name, enc.encode(text)));
    return Ooxml.writeZip(entries);
  },
  /* Präsentations-Modell → .pptx (aus dem leeren Paket: Master, Layout, Design) */
  async buildPptx(deck) {
    const parts = Ooxml.blankParts('pptx');
    const P = 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"';
    const X = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n';
    const E = (px) => Math.round(px * 9525);
    const cx = E(deck.w), cy = E(deck.h);
    parts['ppt/presentation.xml'] = parts['ppt/presentation.xml'].replace(/<p:sldIdLst>.*<\/p:sldIdLst>/, '<p:sldIdLst>' + deck.slides.map((s, k) => `<p:sldId id="${256 + k}" r:id="rIdS${k + 1}"/>`).join('') + '</p:sldIdLst>').replace(/<p:sldSz cx="\d+" cy="\d+"\/>/, `<p:sldSz cx="${cx}" cy="${cy}"/>`);
    parts['ppt/_rels/presentation.xml.rels'] = parts['ppt/_rels/presentation.xml.rels'].replace(/<Relationship Id="rId2"[^>]*\/>/, deck.slides.map((s, k) => `<Relationship Id="rIdS${k + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide${k + 1}.xml"/>`).join(''));
    delete parts['ppt/slides/slide1.xml']; delete parts['ppt/slides/_rels/slide1.xml.rels'];
    let ct = parts['[Content_Types].xml'].replace('<Override PartName="/ppt/slides/slide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>', '');
    const extraCt = new Set();
    const media = [];
    const runXml = (r, title) => {
      if (!r.t) return '';
      const sz = ` sz="${r.sz ? Math.round(r.sz * 100) : title ? 3600 : 2000}"`;
      const attrs = `lang="de-CH"${sz}${r.b ? ' b="1"' : ''}${r.i ? ' i="1"' : ''}${r.u ? ' u="sng"' : ''}${r.s ? ' strike="sngStrike"' : ''} dirty="0"`;
      return String(r.t).split('\n').map((seg, k) => (k ? '<a:br/>' : '') + (seg ? `<a:r><a:rPr ${attrs}>${r.c ? `<a:solidFill><a:srgbClr val="${r.c.replace('#', '').toUpperCase()}"/></a:solidFill>` : ''}${r.fn ? `<a:latin typeface="${this.xt(r.fn)}"/>` : ''}</a:rPr><a:t>${this.xt(seg)}</a:t></a:r>` : '')).join('');
    };
    deck.slides.forEach((sl, k) => {
      let id = 2, sp = '';
      for (const it of sl.items) {
        const title = it.kind === 'title';
        const ps = (it.paras.length ? it.paras : [{ runs: [] }]).map(p => {
          const lvl = Math.min(4, p.lvl || 0);
          const ppr = p.bullet ? `<a:pPr marL="${285750 + lvl * 342900}" lvl="${lvl}" indent="-285750"><a:buFont typeface="Arial"/><a:buChar char="•"/></a:pPr>` : (p.al ? `<a:pPr algn="${{ c: 'ctr', r: 'r', j: 'just' }[p.al] || 'l'}"/>` : '');
          const def = title ? ' sz="3600"' : ' sz="2000"';
          return `<a:p>${ppr}${p.runs.map(r => runXml(r, title)).join('')}<a:endParaRPr lang="de-CH"${def} dirty="0"/></a:p>`;
        }).join('');
        sp += `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="${title ? 'Titel' : 'Text'} ${id}"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="${E(it.x)}" y="${E(it.y)}"/><a:ext cx="${E(Math.max(20, it.w))}" cy="${E(Math.max(20, it.h))}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/></p:spPr><p:txBody><a:bodyPr wrap="square" rtlCol="0"${title ? ' anchor="b"' : ''}><a:normAutofit/></a:bodyPr><a:lstStyle/>${ps}</p:txBody></p:sp>`;
        id++;
      }
      const rels = [['rId1', 'slideLayout', '../slideLayouts/slideLayout1.xml']];
      sl.images.forEach((im, j) => {
        const name = `media/image${k + 1}_${j + 1}.${im.ext}`;
        media.push([`ppt/${name}`, im.bytes]);
        extraCt.add(im.ext);
        const rid = `rId${j + 2}`;
        rels.push([rid, 'image', '../' + name]);
        sp = `<p:pic><p:nvPicPr><p:cNvPr id="${id}" name="Bild ${id}"/><p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr/></p:nvPicPr><p:blipFill><a:blip r:embed="${rid}"/><a:stretch><a:fillRect/></a:stretch></p:blipFill><p:spPr><a:xfrm><a:off x="${E(im.x)}" y="${E(im.y)}"/><a:ext cx="${E(im.w)}" cy="${E(im.h)}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic>` + sp;   // Bilder hinter den Text
        id++;
      });
      parts[`ppt/slides/slide${k + 1}.xml`] = X + `<p:sld ${P}><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>${sp}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`;
      parts[`ppt/slides/_rels/slide${k + 1}.xml.rels`] = X + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' + rels.map(([rid, t, tg]) => `<Relationship Id="${rid}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/${t}" Target="${tg}"/>`).join('') + '</Relationships>';
      ct = ct.replace('</Types>', `<Override PartName="/ppt/slides/slide${k + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/></Types>`);
    });
    for (const e of extraCt) if (!new RegExp(`Extension="${e}"`).test(ct)) ct = ct.replace('</Types>', `<Default Extension="${e}" ContentType="${{ png: 'image/png', jpeg: 'image/jpeg', gif: 'image/gif', bmp: 'image/bmp', svg: 'image/svg+xml' }[e]}"/></Types>`);
    parts['[Content_Types].xml'] = ct;
    const enc = new TextEncoder(), entries = [];
    for (const [name, text] of Object.entries(parts)) entries.push(await Ooxml.entry(name, enc.encode(text)));
    for (const [name, bytes] of media) entries.push(await Ooxml.entry(name, bytes));
    return Ooxml.writeZip(entries);
  },
};
if (typeof module !== 'undefined') module.exports = { OfficeConvert };
