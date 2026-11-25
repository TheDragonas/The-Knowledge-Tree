'use strict';
/* Bilder/Anhänge, deren Daten nicht im FileDataStore liegen ([MS-ONESTORE] 2.5.27 FileDataReference):
 *   <ifndf>{GUID}  normal (auch klein geschrieben / mit Null-Zeichen am Ende)
 *   <file>Name     im Begleitordner „<Abschnitt>_onefiles“ – wird aus Begleitdateien aufgelöst (roh oder mit FDSO-Kopf)
 *   <invfdo>       OneNote hat keine Daten → Platzhalter mit Grund „invfdo“
 *   <ifndf>{?}     GUID nicht im FileDataStore → Platzhalter mit Grund „fehlt“
 * dazu Seitentitel mit weichen Zeilenumbrüchen (U+000B) → erste Zeile.
 * Aufruf: node tests/onenote/missing-test.js */
const zlib = require('zlib');
const W = require('../../web/js/onenote-write.js');
const ON = require('../../web/js/onenote.js');
let ok = 0, fail = 0;
const check = (label, cond, info = '') => { if (cond) ok++; else { fail++; console.log('  FEHLER:', label, info); } };

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
const u32b = (v) => { const b = new Uint8Array(4); new DataView(b.buffer).setUint32(0, v, true); return b; };
const ft = (ms) => { const b = new Uint8Array(8); const v = BigInt(ms) * 10000n + 116444736000000000n; new DataView(b.buffer).setBigUint64(0, v, true); return b; };
const fdso = (data) => {   // FileDataStoreObject wie in der .one-Datei: Kopf-GUID, Länge, Daten, Fuss-GUID
  const head = W.guidBytes('{BDE316E7-2665-4511-A4C4-8D4D0B7A9EAC}'), foot = W.guidBytes('{71FBA722-0F79-4A0B-BB13-899256426B24}');
  const pad = (8 - (data.length % 8)) % 8, out = new Uint8Array(36 + data.length + pad + 16);
  out.set(head, 0); new DataView(out.buffer).setUint32(16, data.length, true); out.set(data, 36); out.set(foot, 36 + data.length + pad);
  return out;
};

const imgs = Array.from({ length: 6 }, (_, i) => png(40 + i, 30, [200 - i * 20, 100, 50 + i * 30]));
const att = new Uint8Array(Buffer.from('%PDF-1.4 Anhang'));
const page = { title: 'Merck interaktives PSE', created: Date.now(), modified: Date.now(), level: 0,
  items: [...imgs.map((d, i) => ({ kind: 'image', x: 20, y: 20 + i * 60, w: 40, h: 30, data: d, ext: '.png' })), { kind: 'file', x: 300, y: 20, name: 'Skript.pdf', data: att, ext: '.pdf' }] };
const files = [];
for (const it of page.items) { it.fileGuid = W.newGuid(); files.push({ guid: it.fileGuid, data: it.data }); }
const extGuid = W.newGuid(), extGuid2 = W.newGuid();
// Was im FileDataStore bleibt: Bild 0 (normal), Bild 1 (klein geschrieben + Null-Zeichen)
const keep = new Set([page.items[0].fileGuid, page.items[1].fileGuid]);
const sp = W.buildPage(page, files.filter(f => keep.has(f.guid)).concat(files.filter(f => !keep.has(f.guid)).map(f => ({ ...f, skip: true }))).filter(f => !f.skip));
const conts = [];
for (const o of sp.objs) {
  if (o.jcid === W.J.ImageNode) conts.push(o.props.find(p => p[0] === W.P.PictureContainer)[1]);
  if (o.jcid === W.J.EmbeddedFileNode) conts.push(o.props.find(p => p[0] === W.P.EmbeddedFileContainer)[1]);
}
check('7 Datei-Objekte gebaut', conts.length === 7, conts.length);
conts[1].file.ref = conts[1].file.ref.toLowerCase().replace('<ifndf>', '<ifndf>') + '\u0000';
conts[2].file = { ref: `<file>${extGuid}`, ext: '.png' };        // Begleitordner, rohe Datei {GUID}.onebin
conts[3].file = { ref: '<file>Bild 4.png', ext: '.png' };        // Begleitordner, mit FDSO-Kopf
conts[4].file = { ref: '<invfdo>', ext: '.png' };                // OneNote hat keine Daten
conts[5].file = { ref: `<ifndf>${extGuid2}`, ext: '.png' };      // GUID nicht im FileDataStore
conts[6].file = { ref: '<invfdo>', ext: '.pdf' };                // Anhang ohne Daten
const sec = new W.Space();
const series = sec.add(W.J.PageSeriesNode, [[W.P.ChildGraphSpaceElementNodes, [sp.gosid]], [W.P.NotebookManagementEntityGuid, W.guidBytes(W.newGuid())], [W.P.TopologyCreationTimeStamp, ft(Date.now())]]);
sec.root(1, sec.add(W.J.SectionNode, [[W.P.NotebookManagementEntityGuid, W.guidBytes(W.newGuid())], [W.P.TopologyCreationTimeStamp, ft(Date.now())], [W.P.ElementChildNodes, [series]]]));
sec.root(2, sec.add(W.J.SectionMetaData, [[W.P.SchemaRevisionInOrderToRead, u32b(40)], [W.P.X1400348B, u32b(40)]]));
const one = new W.FileBuilder(false).finish(sec, [sec, sp], files.filter(f => keep.has(f.guid)), '{7B5C52E4-D88C-4DA7-AEB1-5378D02996D3}');

const read = (external) => {
  const st = new ON.OneStore(one, 'Tabellen 2');
  if (external) st.external = external;
  const m = new ON.Model(st);
  return m.section('Tabellen 2');
};
// ohne Begleitordner
{
  const s = read(null);
  const items = s.pages[0].items, im = items.filter(i => i.kind === 'image'), fi = items.filter(i => i.kind === 'file');
  check('6 Bilder, 1 Anhang', im.length === 6 && fi.length === 1, items.map(i => i.kind).join());
  check('Bild 1 normal', !!(im[0].data && im[0].mime === 'image/png'));
  check('Bild 2: GUID klein + Null-Zeichen trotzdem gefunden', !!(im[1].data && im[1].data.length === imgs[1].length));
  check('Bild 3 ohne Begleitordner: Grund extern', im[2].missing && im[2].why === 'extern' && im[2].external === extGuid, JSON.stringify([im[2].why, im[2].external]));
  check('Bild 5: Grund invfdo', im[4].missing && im[4].why === 'invfdo', im[4].why);
  check('Bild 6: Grund fehlt', im[5].missing && im[5].why === 'fehlt', im[5].why);
  check('Anhang ohne Daten: Grund invfdo, Name bleibt', fi[0].missing && fi[0].why === 'invfdo' && fi[0].name === 'Skript.pdf', JSON.stringify(fi[0]));
  check('Liste der fehlenden Inhalte', s.missing.length === 5 && s.missing.filter(m => m.kind === 'Bild').length === 4, JSON.stringify(s.missing.map(m => m.why)));
  check('keine Reste auf der Sammelseite', (s.orphans || []).length === 0, s.orphans.length);
}
// mit Begleitordner „Tabellen 2_onefiles“ (wie im Ordner/ZIP neben der .one-Datei)
{
  const comp = [
    { name: 'NB/Tabellen 2_onefiles/' + extGuid + '.onebin', data: imgs[2] },
    { name: 'NB/Tabellen 2_onefiles/Bild 4.png', data: fdso(imgs[3]) },
    { name: 'NB/Anderer_onefiles/Bild 4.png', data: imgs[0] },   // falscher Ordner: darf nicht gewinnen
  ];
  // gleicher Resolver wie im Import (OneImport.companions), hier nachgebaut über den Browser-Code
  global.escapeHtml = (s) => String(s); global.el = () => ({});
  const src = require('fs').readFileSync(require('path').join(__dirname, '../../web/js/onenote-import.js'), 'utf8');
  const m = /  companions\(list\) \{[\s\S]*?\n  \},\n/.exec(src);
  check('Resolver im Import gefunden', !!m);
  const OI = eval('({' + m[0] + ' isCompanion(path) { return /_onefiles\\//i.test(path) || /\\.onebin$/i.test(path); } })');
  const s = read(OI.companions(comp)('NB/Tabellen 2.one'));
  const im = s.pages[0].items.filter(i => i.kind === 'image');
  check('Bild 3 aus Begleitordner ({GUID}.onebin, roh)', !!(im[2].data && im[2].data.length === imgs[2].length && im[2].mime === 'image/png'));
  check('Bild 4 aus Begleitordner (FDSO-Kopf entfernt, richtiger Ordner)', !!(im[3].data && im[3].data.length === imgs[3].length && im[3].data[16] === imgs[3][16]), im[3].data && im[3].data.length);
  check('übrige Gründe unverändert', im[4].why === 'invfdo' && im[5].why === 'fehlt');
}
// Seitentitel
check('Titel mit weichen Zeilenumbrüchen → erste Zeile', ON.cleanTitle('Merck interaktives PSE:\u000b\u000bhttps://pse.merckgroup.com/periodic-table') === 'Merck interaktives PSE:');
check('Titel: Steuerzeichen weg', ON.cleanTitle('\u000bA\u0001B\u0000 ') === 'A B');
check('normGuid', ON.normGuid('<ifndf>{abcdef01-2345-6789-abcd-ef0123456789}\u0000') === '{ABCDEF01-2345-6789-ABCD-EF0123456789}');

// zum Ausprobieren im Browser: KT_OUT=/pfad node tests/onenote/missing-test.js → Notizbuch-Ordner mit Begleitordner
if (process.env.KT_OUT) {
  const fs = require('fs'), path = require('path'), d = path.join(process.env.KT_OUT, 'NB');
  fs.mkdirSync(path.join(d, 'Tabellen 2_onefiles'), { recursive: true });
  fs.writeFileSync(path.join(d, 'Tabellen 2.one'), one);
  fs.writeFileSync(path.join(d, 'Tabellen 2_onefiles', extGuid + '.onebin'), imgs[2]);
  fs.writeFileSync(path.join(d, 'Tabellen 2_onefiles', 'Bild 4.png'), fdso(imgs[3]));
}
console.log(`${ok} von ${ok + fail} Prüfungen bestanden (fehlende Bild-/Dateidaten, Begleitordner, Titel)`);
process.exit(fail ? 1 : 0);
