'use strict';
/* Ausdruck-Import (verlustfrei): baut eine .one-Datei wie OneNote sie für „Als Ausdruck einfügen“ schreibt
 * (PictureContainer 0x20001C3F → XPS-Druckdokument, WebPictureContainer14 0x200034C8 → PNG-Seitenbild),
 * dazu je Seite einen .docx-Anhang und ein unzugeordnetes 64×64-Symbol im FileDataStore – und liest sie
 * mit dem eigenen Leser zurück. Entspricht dem Akzeptanztest „Wohnen“ (2 Seiten, 8 + 5 Seitenbilder).
 * Aufruf: node tests/onenote/printout-test.js   (erzeugt alle Testdateien selbst; die gebaute Datei
 * landet als Wohnen.one im Temp-Ordner, zum Ansehen in OneNote/KnowledgeTree) */
const fs = require('fs'), path = require('path'), os = require('os'), zlib = require('zlib');
const W = require('../../web/js/onenote-write.js');
const ON = require('../../web/js/onenote.js');
const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'kt-wohnen-'));
const P_WEB14 = 0x200034C8, J_XPS_CONTAINER = 0x0008003A;
let ok = 0, fail = 0;
const check = (label, cond, info = '') => { if (cond) ok++; else { fail++; console.log('  FEHLER:', label, info); } };

/* ---------------------------------------------------------------- Testdateien erzeugen */
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
const zipLike = (txt) => new Uint8Array(Buffer.concat([Buffer.from([0x50, 0x4B, 0x03, 0x04]), Buffer.from(txt)]));   // „PK…“ wie XPS/DOCX
const docx = zipLike('Mietvertrag (Word) – Testinhalt');
const xps = [zipLike('XPS-Druckdokument 1'), zipLike('XPS-Druckdokument 2')];
const pngs = Array.from({ length: 13 }, (_, i) => png(1191, 1684, [240 - i * 7, 235, 220 + i * 2]));
const icon = png(64, 64, [90, 120, 200]);
const A4W = 794, A4H = 1123, GAP = 1140;
const pages = [
  { title: 'Miete, Gebrauchsüberlassung', created: Date.UTC(2025, 2, 3, 9, 15), n: 8, from: 0 },
  { title: 'Miete, Gebrauchsüberlassung Lösungen - 2025', created: Date.UTC(2025, 2, 4, 10, 30), n: 5, from: 8 },
].map((pg, k) => ({
  title: pg.title, created: pg.created, modified: pg.created, level: 0,
  items: [
    ...Array.from({ length: pg.n }, (_, i) => ({ kind: 'image', x: 40, y: 60 + i * GAP, w: A4W, h: A4H, data: pngs[pg.from + i], ext: '.png', printout: k })),
    { kind: 'file', x: 900, y: 60, name: 'Mietvertrag.docx', data: docx, ext: '.docx' },
  ],
}));

/* wie buildSection, aber die Bild-Knoten bekommen die Ausdruck-Struktur */
const files = [];
for (const pg of pages) for (const it of pg.items) if (it.data && !it.fileGuid) { it.fileGuid = W.newGuid(); files.push({ guid: it.fileGuid, data: it.data }); }
const xpsGuid = xps.map(d => { const g = W.newGuid(); files.push({ guid: g, data: d }); return g; });
files.push({ guid: W.newGuid(), data: icon });           // Anhang-Symbol: von keinem Element verwendet
const utf16z = (t) => { const b = new Uint8Array((t.length + 1) * 2); for (let i = 0; i < t.length; i++) { b[i * 2] = t.charCodeAt(i) & 255; b[i * 2 + 1] = t.charCodeAt(i) >> 8; } return b; };
const OCR = 'Mietzins und Nebenkosten';
const pageSpaces = pages.map((pg, k) => {
  const sp = W.buildPage(pg, files);
  let first = true;
  for (const o of sp.objs) {
    if (o.jcid !== W.J.ImageNode) continue;
    const pc = o.props.find(p => p[0] === W.P.PictureContainer);
    if (!pc) continue;
    const png = pc[1];                                   // PictureContainer14 mit dem PNG-Seitenbild
    const xc = sp.add(J_XPS_CONTAINER); xc.file = { ref: `<ifndf>${xpsGuid[k]}`, ext: '.xps' };
    pc[1] = xc;                                          // 0x20001C3F → XPS (für alle Seiten des Ausdrucks gleich)
    o.props.push([P_WEB14, png]);                        // 0x200034C8 → sichtbares Seitenbild
    if (k === 0 && first) o.props.push([W.P.RichEditTextUnicode, utf16z(OCR)]);   // von OneNote erkannter Bildtext
    first = false;
  }
  return sp;
});
const u32b = (v) => { const b = new Uint8Array(4); new DataView(b.buffer).setUint32(0, v, true); return b; };
const ft = (ms) => { const b = new Uint8Array(8); const v = BigInt(ms) * 10000n + 116444736000000000n; new DataView(b.buffer).setBigUint64(0, v, true); return b; };
const sec = new W.Space();
const series = sec.add(W.J.PageSeriesNode, [[W.P.ChildGraphSpaceElementNodes, pageSpaces.map(s => s.gosid)], [W.P.NotebookManagementEntityGuid, W.guidBytes(W.newGuid())], [W.P.TopologyCreationTimeStamp, ft(Date.now())]]);
const node = sec.add(W.J.SectionNode, [[W.P.NotebookManagementEntityGuid, W.guidBytes(W.newGuid())], [W.P.TopologyCreationTimeStamp, ft(Date.now())], [W.P.ElementChildNodes, [series]]]);
const meta = sec.add(W.J.SectionMetaData, [[W.P.SchemaRevisionInOrderToRead, u32b(40)], [W.P.X1400348B, u32b(40)]]);
sec.root(1, node); sec.root(2, meta);
const one = new W.FileBuilder(false).finish(sec, [sec, ...pageSpaces], files, '{7B5C52E4-D88C-4DA7-AEB1-5378D02996D3}');
fs.writeFileSync(path.join(DIR, 'Wohnen.one'), one);

/* ---------------------------------------------------------------- zurücklesen */
const store = new ON.OneStore(one, 'Wohnen');
const model = new ON.Model(store);
const s = model.section('Wohnen');
const sig = (d) => d[0] === 0x89 && d[1] === 0x50 ? 'png' : d[0] === 0x50 && d[1] === 0x4B ? 'zip' : '?';
const pngSize = (d) => { const v = new DataView(d.buffer, d.byteOffset); return [v.getUint32(16), v.getUint32(20)]; };
check('2 Seiten', s.pages.length === 2, s.pages.length);
const exp = [{ title: 'Miete, Gebrauchsüberlassung', imgs: 8 }, { title: 'Miete, Gebrauchsüberlassung Lösungen - 2025', imgs: 5 }];
s.pages.forEach((pg, k) => {
  const imgs = pg.items.filter(it => it.kind === 'image'), att = pg.items.filter(it => it.kind === 'file');
  check(`Seite ${k + 1}: Titel ohne Datum/Uhrzeit`, pg.title === exp[k].title, JSON.stringify(pg.title));
  check(`Seite ${k + 1}: ${exp[k].imgs} Seitenbilder`, imgs.length === exp[k].imgs, imgs.length);
  check(`Seite ${k + 1}: alle Bilder PNG (kein XPS)`, imgs.every(im => im.mime === 'image/png' && sig(im.data) === 'png'), imgs.map(i => i.mime).join());
  check(`Seite ${k + 1}: alle Bilder 1191×1684`, imgs.every(im => { const [w, h] = pngSize(im.data); return w === 1191 && h === 1684; }));
  check(`Seite ${k + 1}: kein Bild fehlt`, imgs.every(im => !im.missing));
  check(`Seite ${k + 1}: Seitenbilder untereinander (≈${GAP} px)`, imgs.every((im, i) => i === 0 || Math.abs((im.y - imgs[i - 1].y) - GAP) < 1), imgs.map(i => Math.round(i.y)).join());
  check(`Seite ${k + 1}: Grösse A4 bei 96 dpi`, imgs.every(im => Math.abs(im.w - A4W) < 1 && Math.abs(im.h - A4H) < 1), imgs[0] && [imgs[0].w, imgs[0].h]);
  if (k === 0) check('OCR-Text am ersten Seitenbild', imgs[0] && imgs[0].ocr === OCR, imgs[0] && JSON.stringify(imgs[0].ocr));
  check(`Seite ${k + 1}: 1 .docx-Anhang mit Daten`, att.length === 1 && att[0].name === 'Mietvertrag.docx' && att[0].data && att[0].data.length === docx.length, att.map(a => a.name));
});
// seit 1.22: das Druckdokument gehört zum Ausdruck (am Seitenbild), nur das lose Symbol bleibt „nicht zugeordnet“
const orph = s.orphans || [];
const oI = orph.filter(o => sig(o.data) === 'png');
check('nicht zugeordnet: nur das lose Symbol', orph.length === 1 && oI.length === 1, orph.map(o => o.ext + ':' + o.data.length).join());
check('Symbol 64×64', oI.length === 1 && pngSize(oI[0].data).join('x') === '64x64');
const prs = s.pages.flatMap(pg => pg.items.filter(it => it.kind === 'image').map(it => it.printout));
check('Ausdruck: jedes Seitenbild mit seinem XPS (.xps)', prs.length === 13 && prs.every(p => p && p.xps && sig(p.xps.data) === 'zip' && p.xps.ext === '.xps'), prs.map(p => p && p.xps && p.xps.ext).join());
/* ---------------------------------------------------------------- Bild mit Vektor-Fassung (EMF) + PNG: PNG gewinnt */
{
  const emf = new Uint8Array(4000); emf.set([1, 0, 0, 0]); emf[40] = 0x20; emf[41] = 0x45;   // EMF-Signatur, grösser als das PNG
  const fl = [];
  const pg = { title: 'Vektor', created: Date.now(), modified: Date.now(), level: 0, items: [{ kind: 'image', x: 10, y: 10, w: 64, h: 64, data: icon, ext: '.png' }] };
  for (const it of pg.items) { it.fileGuid = W.newGuid(); fl.push({ guid: it.fileGuid, data: it.data }); }
  const emfGuid = W.newGuid(); fl.push({ guid: emfGuid, data: emf });
  const sp = W.buildPage(pg, fl);
  for (const o of sp.objs) {
    if (o.jcid !== W.J.ImageNode) continue;
    const pc = o.props.find(p => p[0] === W.P.PictureContainer);
    const png = pc[1];
    const ec = sp.add(W.J.PictureContainer14); ec.file = { ref: `<ifndf>${emfGuid}`, ext: '.emf' };
    pc[1] = ec; o.props.push([P_WEB14, png]);
  }
  const sec2 = new W.Space();
  const ser2 = sec2.add(W.J.PageSeriesNode, [[W.P.ChildGraphSpaceElementNodes, [sp.gosid]], [W.P.NotebookManagementEntityGuid, W.guidBytes(W.newGuid())], [W.P.TopologyCreationTimeStamp, ft(Date.now())]]);
  sec2.root(1, sec2.add(W.J.SectionNode, [[W.P.NotebookManagementEntityGuid, W.guidBytes(W.newGuid())], [W.P.TopologyCreationTimeStamp, ft(Date.now())], [W.P.ElementChildNodes, [ser2]]]));
  sec2.root(2, sec2.add(W.J.SectionMetaData, [[W.P.SchemaRevisionInOrderToRead, u32b(40)], [W.P.X1400348B, u32b(40)]]));
  const one2 = new W.FileBuilder(false).finish(sec2, [sec2, sp], fl, '{7B5C52E4-D88C-4DA7-AEB1-5378D02996D3}');
  const m2 = new ON.Model(new ON.OneStore(one2, 'Vektor'));
  const s2 = m2.section('Vektor');
  const im = s2.pages[0].items.find(i => i.kind === 'image');
  check('EMF + PNG: das darstellbare PNG wird genommen', im && im.mime === 'image/png', im && im.mime);
  check('EMF-Fassung gilt als zugeordnet (keine Sammelseite)', (s2.orphans || []).length === 0, (s2.orphans || []).length);
}
console.log(`${ok} von ${ok + fail} Prüfungen bestanden (Ausdruck-Import, ${files.length} Dateien im FileDataStore, .one ${one.length} Bytes → ${path.join(DIR, 'Wohnen.one')})`);
process.exitCode = fail ? 1 : 0;
