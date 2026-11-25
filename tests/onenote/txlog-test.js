'use strict';
/* Transaktions-Log über mehrere Fragmente ([MS-ONESTORE] 2.3.3 TransactionLogFragment).
 * OneNote legt das Log in Fragmenten ab (z.B. 1024 Byte): Einträge (je 8 Byte), DANACH der Verweis auf das
 * nächste Fragment (12 Byte), Rest = Füllung. Bis 1.15 las KnowledgeTree den Verweis an „Ende − 12“ – bei
 * (cb − 12) nicht durch 8 teilbar landete das im Leeren, alle späteren Speichervorgänge fehlten (echte Datei
 * des Users „65_Potentiometrie“: 5 statt 11 Seiten, Ausdrucke nur als XPS, Anhänge „ungültig“).
 * Der Test baut eine Datei, deren 1. Fragment nur einen alten Stand beschreibt (Wurzel-Liste = 1 Knoten)
 * und deren 2. Fragment den aktuellen Stand – gelesen werden muss der aktuelle.
 * Aufruf: node tests/onenote/txlog-test.js */
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
const pages = ['QV 2011', 'QV 2012', 'QV 2013'].map((t, i) => ({ title: t, created: Date.now(), modified: Date.now(), level: 0,
  items: [{ kind: 'image', x: 20, y: 20, w: 60, h: 40, data: png(60 + i, 40, [200, 100 + i * 40, 50]), ext: '.png' }] }));
const orig = W.buildSection(pages);
const dv0 = new DataView(orig.buffer, orig.byteOffset, orig.byteLength);
const txStp = Number(dv0.getBigUint64(160, true)), txCb = dv0.getUint32(168, true);
const rootStp = Number(dv0.getBigUint64(172, true));
const rootId = dv0.getUint32(rootStp + 8, true);
const entries = [];
for (let i = 0; i < Math.floor((txCb - 12) / 8); i++) entries.push([dv0.getUint32(txStp + i * 8, true), dv0.getUint32(txStp + i * 8 + 4, true)]);
check('Original: eine Transaktion', entries.filter(e => e[0] === 1).length === 1, JSON.stringify(entries));
// Fragment = Einträge + nächstes Fragment (12) + 4 Byte Füllung – wie bei OneNote ((cb − 12) / 8 nicht ganzzahlig)
const frag = (ents, next) => { const b = new Uint8Array(ents.length * 8 + 12 + 4); const v = new DataView(b.buffer); ents.forEach(([a, c], i) => { v.setUint32(i * 8, a, true); v.setUint32(i * 8 + 4, c, true); }); v.setBigUint64(ents.length * 8, BigInt(next ? next.stp : 0), true); v.setUint32(ents.length * 8 + 8, next ? next.cb : 0, true); return b; };
const align = (n) => (n + 7) & ~7;
const f2 = frag(entries, null);
const f2stp = align(orig.length) + 64;
const f1 = frag([[rootId, 1], [1, 0]], { stp: f2stp, cb: f2.length });   // alter Stand: Wurzel-Liste hatte erst 1 Knoten
const f1stp = f2stp + align(f2.length);
const out = new Uint8Array(f1stp + f1.length);
out.set(orig); out.set(f2, f2stp); out.set(f1, f1stp);
const dv = new DataView(out.buffer);
dv.setBigUint64(160, BigInt(f1stp), true); dv.setUint32(168, f1.length, true);   // fcrTransactionLog → 1. Fragment
dv.setUint32(96, 2, true);                                                        // cTransactionsInLog = 2
dv.setBigUint64(196, BigInt(out.length), true);                                   // cbExpectedFileLength
check('Fragmente: (cb − 12) nicht durch 8 teilbar', (f1.length - 12) % 8 !== 0 && (f2.length - 12) % 8 !== 0);

const st = new ON.OneStore(out, 'Test');
check('beide Transaktionen gelesen', st.counts.get(rootId) === entries.find(e => e[0] === rootId)[1], `${st.counts.get(rootId)}`);
const sec = new ON.Model(st).section('Test');
check('alle 3 Seiten (aktueller Stand)', sec.pages.length === 3, sec.pages.length);
check('Titel', sec.pages.map(p => p.title).join('|') === 'QV 2011|QV 2012|QV 2013', sec.pages.map(p => p.title).join('|'));
check('alle Bilder mit Daten', sec.pages.every(p => p.items.some(i => i.kind === 'image' && i.data && i.mime === 'image/png')));
check('nichts fehlt', (sec.missing || []).length === 0);
// Gegenprobe: das unveränderte Original liest genauso
const s0 = new ON.Model(new ON.OneStore(orig, 'Test')).section('Test');
check('Original: 3 Seiten', s0.pages.length === 3);
console.log(`${ok} von ${ok + fail} Prüfungen bestanden (Transaktions-Log in mehreren Fragmenten)`);
process.exit(fail ? 1 : 0);
