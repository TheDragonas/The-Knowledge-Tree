'use strict';
/* OneNote-Export gegen die Spezifikation prüfen (seit 1.21).
 * Der User konnte exportierte Abschnitte in OneNote nicht öffnen („Problem mit seinem Inhalt“). Ursachen waren
 * Verstösse gegen MUST-Regeln aus [MS-ONESTORE]/[MS-ONE], die der eigene Leser still hinnahm. Dieser Test baut
 * Abschnitte mit allem, was der Export schreibt, und prüft sie mit tests/onenote/onecheck.js (Dateiaufbau, CRCs,
 * Revisionen, Inhaltsregeln) – dazu Rücklesen mit dem eigenen Leser.
 * Aufruf: node tests/onenote/export-check-test.js */
const zlib = require('zlib');
const W = require('../../web/js/onenote-write.js');
const ON = require('../../web/js/onenote.js');
const { check: oneCheck } = require('./onecheck.js');
let ok = 0, fail = 0;
const check = (label, cond, info = '') => { if (cond) ok++; else { fail++; console.log('  FEHLER:', label, info); } };
const valid = (label, u8) => {
  const r = oneCheck(u8);
  check(label + ': gültig', !r.errors.length, '\n     ' + r.errors.slice(0, 8).join('\n     '));
  return r;
};

/* ---------------------------------------------------------------- Testdaten */
const CRC = new Uint32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = (b) => { let c = 0xFFFFFFFF; for (const x of b) c = CRC[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
const be = (v) => { const b = Buffer.alloc(4); b.writeUInt32BE(v >>> 0); return b; };
const chunk = (t, d) => Buffer.concat([be(d.length), Buffer.from(t), d, be(crc32(Buffer.concat([Buffer.from(t), d])))]);
function png(w, h, rgb) {
  const row = Buffer.alloc(1 + w * 3); for (let x = 0; x < w; x++) row.set(rgb, 1 + x * 3);
  const raw = Buffer.alloc(row.length * h); for (let y = 0; y < h; y++) row.copy(raw, y * row.length);
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr.set([8, 2, 0, 0, 0], 8);
  return new Uint8Array(Buffer.concat([Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]));
}
const T0 = Date.UTC(2026, 9, 14, 8, 30);
const XPS = new Uint8Array([0x50, 0x4B, 3, 4, 1, 2, 3]), PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2D, 0x31, 0x2E, 0x37]);
const para = (text, extra = {}) => ({ depth: 0, style: 'p', runs: [{ text }], ...extra });
const cell = (text) => ({ paras: [para(text)] });
const stroke = (n, x0, y0, opts = {}) => ({ pts: Array.from({ length: n }, (_, i) => ({ x: x0 + i * 2, y: y0 + Math.sin(i / 3) * 5, p: 0.3 + (i % 5) / 10 })), w: 2, color: '#c00000', ...opts });

const reich = {
  title: 'Alles drin – Ümläute & Emoji 🙂', created: T0, modified: T0, level: 0,
  items: [
    { kind: 'outline', x: 48, y: 120, w: 500, paras: [
      { depth: 0, style: 'h1', runs: [{ text: 'Überschrift' }] },
      { depth: 0, style: 'p', runs: [{ text: 'fett ', b: true }, { text: 'kursiv ', i: true }, { text: 'Link', href: 'https://example.org/a?b=1' }, { text: ' Ende' }] },
      { depth: 1, style: 'p', runs: [{ text: 'Zeile 1\nZeile 2\r\nZeile 3' }] },            // Umbruch im Absatz
      { depth: 2, style: 'p', align: 'center', runs: [{ text: 'tiefer, mittig' }] },
      { depth: 0, style: 'p', runs: [{ text: 'Unicode: ∑ x² → ∞ 🙂' }] },
      { depth: 0, style: 'quote', runs: [] },                                                    // leerer Absatz
      { depth: 0, image: { w: 120, h: 80, data: png(120, 80, [30, 160, 90]), ext: '.png', name: 'im Text.png', ocr: 'Text im Bild\r\nzweite Zeile' } },
      { depth: 0, file: { name: 'Bericht.pdf', data: new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2D, 0x31]), ext: '.pdf' } },
      { depth: 0, table: { cols: [5, 120, 300], borders: true, rows: [
        [cell('a'), cell('b'), cell('c')],
        [cell('nur eine Zelle')],                                                                  // zu kurze Zeile
        [{ paras: [] }, { paras: [para('x'), para('y')], shade: '#ffee00' }, cell('z')],
      ] } },
      { depth: 0, table: { cols: [], rows: [] } },                                                 // ganz leere Tabelle
    ] },
    { kind: 'image', x: 600, y: 120, w: 200, h: 150, data: png(200, 150, [200, 60, 60]), ext: '.png', name: 'frei.png', alt: 'Alternativtext' },
    { kind: 'image', x: 0, y: 0, w: 794, h: 1123, data: png(64, 90, [250, 250, 240]), ext: '.png', background: true },
    { kind: 'image', x: 600, y: 300, w: 100, h: 60 },                                            // Bild ohne Daten
    { kind: 'image', x: 600, y: 400, w: 160, h: 90, data: png(16, 9, [0, 0, 0]), ext: '.png', video: 'https://www.youtube.com/watch?v=abc', title: 'Video' },
    { kind: 'file', x: 900, y: 120, name: 'Tabelle.xlsx', data: new Uint8Array([0x50, 0x4B, 3, 4]), ext: '.xlsx' },
    // Ausdruck (1.22): Seitenbild + Druckdokument (.xps) + Quelldatei (.pdf), zwei Seiten aus derselben PDF
    ...[1, 2].map(k => ({ kind: 'image', x: 40, y: 1200 + k * 1140, w: 794, h: 1123, data: png(60, 85, [240, 240, 230 - k]), ext: '.png', name: 'Skript.pdf',
      print: { xps: XPS, xpsKey: 'x1', src: PDF, srcKey: 'p1', srcExt: '.pdf', page: k, idx: k, group: '0123456789abcdef0123456789abcdef' } })),
    { kind: 'file', x: 900, y: 220, name: 'ohne Endung', data: new Uint8Array([1, 2, 3]) },
    { kind: 'ink', strokes: [stroke(40, 100, 700), stroke(1, 300, 700), stroke(30, 100, 760, { marker: true, color: '#ffff00', w: 12 }), stroke(20, 100, 800, { np: true })] },
  ],
};
const unterseite = { title: 'Unterseite', created: T0, modified: T0, level: 1, items: [{ kind: 'outline', x: 48, y: 120, w: 300, paras: [para('nur Text')] }] };
const ohneTitel = { title: '', created: T0, modified: T0, level: 0, items: [] };

/* ---------------------------------------------------------------- 1. reicher Abschnitt */
const sec1 = W.buildSection([reich, unterseite, ohneTitel], { color: '#8AA8E4' });
const r1 = valid('Abschnitt mit allem', sec1);
check('keine Hinweise (mit Abschnittsfarbe)', r1.warnings.every(w => /cRef/.test(w)), r1.warnings.slice(0, 5).join(' | '));
const st1 = new ON.OneStore(sec1, 'T');
const m1 = new ON.Model(st1).section('T');
check('3 Seiten zurück', m1.pages.length === 3, m1.pages.length);
check('Titel zurück', m1.pages[0].title === reich.title, m1.pages[0].title);
const items = m1.pages[0].items;
const kinds = items.map(i => i.kind);
check('Bilder zurück (frei, Hintergrund, Platzhalter, Video)', kinds.filter(k => k === 'image').length >= 4, kinds.join(','));
check('Anhänge zurück (frei 2 + im Text 1)', JSON.stringify(m1.pages[0]).split('Bericht.pdf').length > 1 && items.filter(i => i.kind === 'file').length === 2, kinds.join(','));
check('Symbolbilder nicht als eigene Bilder', !items.some(i => i.kind === 'image' && i.w === 64 && i.h === 64), '');
check('nichts „nicht zugeordnet“, nichts fehlt', !(m1.orphans || []).length && !(m1.missing || []).length, JSON.stringify((m1.orphans || []).map(o => o.ext + ' ' + o.data.length)) + JSON.stringify(m1.missing || []).slice(0, 200));
const txt = JSON.stringify(m1.pages[0]);
check('Zeilenumbruch im Absatz bleibt erhalten', /Zeile 1[^"]*Zeile 2[^"]*Zeile 3/.test(txt) && !/Zeile 1\\n/.test(txt) || /Zeile 1(<br>|\\u000b)/i.test(txt), (txt.match(/Zeile 1.{0,30}/) || [''])[0]);
check('Tabelle: kurze Zeile aufgefüllt, Inhalt da', /nur eine Zelle/.test(txt) && /\bz\b/.test(txt));

// Einzelheiten direkt in der Datei
const P = ON.P;
let vhCtx = 0, imgs = 0, imgLang = 0, filesN = 0, fileIcon = 0, tables = 0, minW = Infinity, rowsOk = true;
for (const sp of st1.spaces.values()) for (const rv of sp.revisions.values()) {
  if (rv.ctx) vhCtx += rv.ctx === '{7111497F-1B6B-4209-9491-C98B04CF4C5A}:1' ? 1 : -100;
  for (const o of rv.objects.values()) {
    const p = st1.props(o);
    if (o.jcid === 0x60011) { imgs++; if (p.has(P.LanguageID) && p.has(P.PictureContainer)) imgLang++; }
    if (o.jcid === 0x60035) {
      filesN++;
      const pc = rv.objects.get(p.get(P.PictureContainer)), fb = pc && st1.fileBytes(pc);
      if (fb && fb.data && fb.data[1] === 0x50 && p.has(P.LanguageID) && p.has(P.RichEditTextUnicode)) fileIcon++;
    }
    if (o.jcid === 0x60022) {
      tables++;
      const w = p.get(P.TableColumnWidths), cols = w[0];
      for (let i = 0; i < cols; i++) minW = Math.min(minW, new DataView(w.buffer, w.byteOffset + 1 + 4 * i, 4).getFloat32(0, true));
      for (const r of p.get(P.ElementChildNodes)) if (st1.props(rv.objects.get(r)).get(P.ElementChildNodes).length !== cols) rowsOk = false;
    }
  }
}
check('Versionsverlauf je Seite im festen Kontext {7111497F-…}:1', vhCtx === 3, vhCtx);
const prs = items.filter(i => i.kind === 'image' && i.printout).map(i => i.printout);
check('Ausdruck zurück: 2 Seitenbilder mit XPS, PDF, Seitennummer, Kennung', prs.length === 2 && prs.every((p, k) => p.xps && p.xps.data.length === XPS.length && p.src && p.src.data.length === PDF.length && p.src.ext === '.pdf' && p.page === k + 1 && p.group === '0123456789abcdef0123456789abcdef'), JSON.stringify(prs.map(p => [!!p.xps, !!p.src, p.page, p.group])));
const same = (a, b) => a && a.length === b.length && a.every((x, i) => x === b[i]);
const fdsData = [...st1.fileData.keys()].map(g => st1.fileDataBytes(g));
check('Ausdruck: PDF und XPS je nur einmal im FileDataStore', fdsData.filter(d => same(d, PDF)).length === 1 && fdsData.filter(d => same(d, XPS)).length === 1, fdsData.filter(d => same(d, PDF)).length + '/' + fdsData.filter(d => same(d, XPS)).length);
check('jedes Bild mit LanguageID und Bilddaten', imgs >= 5 && imgLang === imgs, `${imgLang}/${imgs}`);
check('jeder Anhang mit Symbolbild (PNG), LanguageID, Text', filesN === 3 && fileIcon === filesN, `${fileIcon}/${filesN}`);
check('2 Tabellen, Spaltenbreite ≥ 1.0, Zeilen vollständig', tables === 2 && minW >= 1 && rowsOk, `${tables} ${minW} ${rowsOk}`);

/* ---------------------------------------------------------------- 2. gross: viele Objekte und Striche */
const viel = { title: 'Viele Absätze', created: T0, modified: T0, level: 0,
  items: [{ kind: 'outline', x: 48, y: 120, w: 400, paras: Array.from({ length: 1500 }, (_, i) => para('Absatz ' + i, { b: i % 2 })) }] };
const tinte = { title: 'Viel Tinte', created: T0, modified: T0, level: 0, items: [{ kind: 'ink', strokes: Array.from({ length: 6000 }, (_, i) => stroke(6, (i % 100) * 7, 150 + Math.floor(i / 100) * 9, { color: ['#000000', '#1f4e79', '#c00000'][i % 3] })) }] };
const sec2 = W.buildSection([viel, tinte, ...Array.from({ length: 60 }, (_, i) => ({ title: 'Seite ' + i, created: T0, modified: T0, level: i % 3 ? 1 : 0, items: [{ kind: 'outline', x: 48, y: 120, w: 300, paras: [para('Inhalt ' + i)] }] }))]);
const r2 = valid('Abschnitt mit 62 Seiten, 1500 Absätzen, 6000 Strichen', sec2);
check('Listen in mehrere Fragmente geteilt', r2.stats.lists > 62 * 3, JSON.stringify(r2.stats));
const m2 = new ON.Model(new ON.OneStore(sec2, 'T')).section('T');
check('62 Seiten zurück', m2.pages.length === 62, m2.pages.length);
check('1500 Absätze zurück', JSON.stringify(m2.pages[0]).split('Absatz ').length - 1 === 1500);

/* ---------------------------------------------------------------- 3. leerer Abschnitt, Inhaltsverzeichnis, Paket */
const leer = W.buildSection([]);
valid('leerer Abschnitt', leer);
check('leerer Abschnitt liest sich ohne Seiten', new ON.Model(new ON.OneStore(leer, 'T')).section('T').pages.length === 0);
const toc = W.buildToc([{ file: 'A.one', color: '#8AA8E4' }, { file: 'Gruppe' }, { file: 'B (2).one' }], '#ADD8E6');
valid('Inhaltsverzeichnis (.onetoc2)', toc);

(async () => {
  const tree = [{ kind: 'notebook', name: 'Test NB', color: '#8AA8E4', pages: [], groups: [
    { kind: 'section', name: 'Erster', pages: [] },
    { kind: 'group', name: 'Gruppe', pages: [], groups: [{ kind: 'section', name: 'Innen', pages: [] }] },
  ] }];
  if (typeof W.exportTree === 'function' && W.buildCab) {
    let pkg = null;
    try { pkg = await W.exportTree(tree, { pageModel: () => null }); } catch (e) { pkg = null; }
    void pkg;   // Paketbau braucht den Browser (Seiten rendern) – dort im Playwright-Test geprüft
  }
  console.log(`${ok} von ${ok + fail} Prüfungen bestanden (OneNote-Export nach Spezifikation)`);
  process.exit(fail ? 1 : 0);
})();
