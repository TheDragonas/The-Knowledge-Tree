'use strict';
/* Stückweises Entpacken (seit 1.18): LZX als Strom mit Ringpuffer, MSZIP Block für Block, CAB-Dateien einzeln,
 * ZIP direkt aus der Datei (CP437-Namen, UTF-8, Info-ZIP-Unicode, ZIP64, Deflate). Die Testdaten erzeugt der
 * Test selbst – für LZX mit einem kleinen eigenen Kodierer (wörtliche Blöcke mit festen Codelängen, weite
 * Rückverweise über den Ring hinweg, unkomprimierte Blöcke, E8-Übersetzung).  Aufruf: node tests/onenote/stream-test.js */
const zlib = require('zlib');
const ON = require('../../web/js/onenote.js');
const FP = require('../../web/js/filepages.js');
let ok = 0, fail = 0;
const check = (label, cond, info = '') => { if (cond) ok++; else { fail++; console.log('  FEHLER:', label, info); } };
const eq = (a, b) => a.length === b.length && Buffer.compare(Buffer.from(a.buffer, a.byteOffset, a.length), Buffer.from(b.buffer, b.byteOffset, b.length)) === 0;
let seed = 7; const rnd = (n) => { seed = (seed * 1103515245 + 12345) >>> 0; return seed % n; };

/* ------------------------------------------------------------ kleiner LZX-Kodierer (nur für den Test) */
const EXTRA = new Uint8Array(51), BASE = new Uint32Array(51);
for (let i = 0, j = 0; i < 51; i += 2) { EXTRA[i] = j; if (i + 1 < 51) EXTRA[i + 1] = j; if (i !== 0 && j < 17) j++; }
for (let i = 0, j = 0; i < 51; i++) { BASE[i] = j; j += 1 << EXTRA[i]; }
function lzxEncode(plain, windowBits, opts = {}) {
  const posnSlots = { 15: 30, 16: 32, 17: 34, 18: 36, 19: 38, 20: 42, 21: 50 }[windowBits];
  const mainN = 256 + posnSlots * 8, L = Math.ceil(Math.log2(mainN)), wsize = 1 << windowBits;
  // E8 vorwärts übersetzen (Kodierer-Seite), je 32-KB-Rahmen
  const data = Uint8Array.from(plain);
  const intel = opts.intel || 0;
  if (intel) for (let fs = 0; fs < data.length; fs += 32768) {
    const size = Math.min(32768, data.length - fs); if (size <= 10) continue;
    let i = fs, cur = fs; const end = fs + size - 10;
    while (i < end) {
      if (data[i++] !== 0xE8) { cur++; continue; }
      const rel = data[i] | (data[i + 1] << 8) | (data[i + 2] << 16) | (data[i + 3] << 24);
      if (rel >= -cur && rel < intel) { const abs = rel < intel - cur ? rel + cur : rel - intel; data[i] = abs & 255; data[i + 1] = (abs >>> 8) & 255; data[i + 2] = (abs >>> 16) & 255; data[i + 3] = (abs >>> 24) & 255; }
      i += 4; cur += 5;
    }
  }
  const out = []; let word = 0, nb = 0;
  const put = (v, n) => { for (let k = n - 1; k >= 0; k--) { word = (word << 1) | ((Math.floor(v / 2 ** k)) & 1); if (++nb === 16) { out.push(word & 255, word >>> 8); word = 0; nb = 0; } } };
  const align = () => { if (nb) put(0, 16 - nb); };
  put(intel ? 1 : 0, 1); if (intel) { put(intel >>> 16, 16); put(intel & 0xFFFF, 16); }
  const lens = (prev, target, n) => { const z = ((prev - target) % 17 + 17) % 17; for (let i = 0; i < 20; i++) put(i === z ? 1 : 0, 4); for (let i = 0; i < n; i++) put(0, 1); };
  let o = 0, first = true;
  const crossed = (a, b) => Math.floor(a / 32768) !== Math.floor(b / 32768);
  while (o < data.length) {
    const size = Math.min(data.length - o, opts.block || 40000);
    if (opts.raw && rnd(3) === 0) {   // unkomprimierter Block
      put(3, 3); put(size >>> 8, 16); put(size & 255, 8);
      if (nb) put(0, 16 - nb); else put(0, 16);
      for (const r of [1, 1, 1]) out.push(r & 255, (r >>> 8) & 255, 0, 0);
      for (let i = 0; i < size; i++) out.push(data[o + i]);
      if (size & 1) out.push(0);
      o += size; continue;
    }
    put(1, 3); put(size >>> 8, 16); put(size & 255, 8);
    lens(first ? 0 : L, L, 256); lens(first ? 0 : L, L, mainN - 256); lens(first ? 0 : 8, 8, 249); first = false;
    const end = o + size;
    while (o < end) {
      // Rückverweis suchen: gleiche Bytes weiter hinten (bis knapp ans Fensterende), sonst Buchstabe
      let best = 0, dist = 0;
      if (opts.dists) for (const d of opts.dists) {
        if (d > o || d >= wsize - 3) continue;
        let l = 0; while (l < 257 && o + l < end && data[o + l] === data[o + l - d]) l++;
        if (l > best) { best = l; dist = d; }
      }
      const before = o;
      if (best >= 3) {
        const F = dist + 2; let s = 3; while (s + 1 < posnSlots && BASE[s + 1] <= F) s++;
        const lh = Math.min(best - 2, 7);
        put(256 + s * 8 + lh, L); if (lh === 7) put(best - 9, 8);
        if (EXTRA[s]) put(F - BASE[s], EXTRA[s]);
        o += best;
      } else { put(data[o], L); o++; }
      if (crossed(before, o) || o % 32768 === 0) align();
    }
  }
  align();
  return new Uint8Array(out);
}
/* Klartext mit weiten Wiederholungen, Läufen und E8-Bytes */
function plaintext(n, wsize) {
  const p = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const k = rnd(10);
    if (i > wsize / 2 && k < 4) p[i] = p[i - Math.floor(wsize / 2) + 7];       // weit zurück
    else if (i > 300 && k < 6) p[i] = p[i - 300];
    else if (k === 9) p[i] = 0xE8;
    else p[i] = rnd(256);
  }
  return p;
}
for (const [wb, n, intel, raw] of [[15, 300000, 0, false], [15, 700000, 12000000, true], [16, 500000, 6000000, false], [17, 400000, 0, true]]) {
  const plain = plaintext(n, 1 << wb);
  const comp = lzxEncode(plain, wb, { intel, raw, dists: [1, 300, (1 << wb) / 2 - 7, 4096], block: 50000 });
  const parts = []; let total = 0;
  for (const fr of ON.lzxStream(comp, n, wb)) { parts.push(fr); total += fr.length; }
  const got = new Uint8Array(total); let q = 0; for (const x of parts) { got.set(x, q); q += x.length; }
  check(`LZX ${wb} Bit, ${n} B${intel ? ', E8' : ''}${raw ? ', unkomprimierte Blöcke' : ''}: identisch`, eq(got, plain), `${total} B`);
  check(`LZX ${wb}: Rahmen à 32 KB`, parts.slice(0, -1).every(f => f.length === 32768) && parts.length === Math.ceil(n / 32768));
  // kleinster Ring (2 × Fenster) – Ring läuft mehrfach über
  const g2 = []; for (const fr of ON.lzxStream(comp, n, wb, wb + 1)) g2.push(fr);
  const all2 = Buffer.concat(g2.map(x => Buffer.from(x)));
  check(`LZX ${wb}: auch mit kleinstem Ring`, eq(new Uint8Array(all2), plain));
}

/* ------------------------------------------------------------ CAB bauen (keine / MSZIP / LZX) */
function cab(files, kind, wb = 15) {
  const all = Buffer.concat(files.map(f => Buffer.from(f.data)));
  const blocks = [];
  if (kind === 'lzx') {
    const comp = Buffer.from(lzxEncode(new Uint8Array(all), wb, { dists: [1, 300], block: 30000 }));
    const nf = Math.ceil(all.length / 32768), per = Math.ceil(comp.length / nf);
    for (let i = 0; i < nf; i++) blocks.push({ c: comp.subarray(i * per, Math.min(comp.length, (i + 1) * per)), u: Math.min(32768, all.length - i * 32768) });
  } else for (let o = 0; o < all.length; o += 32768) {
    const u = all.subarray(o, Math.min(all.length, o + 32768));
    if (kind === 'none') blocks.push({ c: u, u: u.length });
    else { const dict = all.subarray(Math.max(0, o - 32768), o); blocks.push({ c: Buffer.concat([Buffer.from('CK'), zlib.deflateRawSync(u, dict.length ? { dictionary: dict } : {})]), u: u.length }); }
  }
  const names = files.map(f => Buffer.from(f.name.replace(/\//g, '\\') + '\0', 'utf8'));
  const hdr = 36, fol = 8, fl = files.reduce((a, f, i) => a + 16 + names[i].length, 0);
  const dataStart = hdr + fol + fl;
  const h = Buffer.alloc(dataStart);
  h.write('MSCF', 0, 'latin1'); h.writeUInt32LE(dataStart + blocks.reduce((a, b) => a + 8 + b.c.length, 0), 8); h.writeUInt32LE(hdr + fol, 16);
  h[24] = 3; h[25] = 1; h.writeUInt16LE(1, 26); h.writeUInt16LE(files.length, 28);
  h.writeUInt32LE(dataStart, 36); h.writeUInt16LE(blocks.length, 40); h.writeUInt16LE(kind === 'none' ? 0 : kind === 'mszip' ? 1 : 3 | (wb << 8), 42);
  let p = hdr + fol, off = 0;
  files.forEach((f, i) => { h.writeUInt32LE(f.data.length, p); h.writeUInt32LE(off, p + 4); h.writeUInt16LE(0x20 | 0x80, p + 14); names[i].copy(h, p + 16); p += 16 + names[i].length; off += f.data.length; });
  return new Uint8Array(Buffer.concat([h, ...blocks.map(b => { const bh = Buffer.alloc(8); bh.writeUInt16LE(b.c.length, 4); bh.writeUInt16LE(b.u, 6); return Buffer.concat([bh, b.c]); })]));
}
(async () => {
  const files = [
    { name: 'Notizbuch/Open Notebook.onetoc2', data: plaintext(9000, 32768) },
    { name: 'Notizbuch/Grüne Gruppe/Abschnitt A.one', data: plaintext(150000, 32768) },
    { name: 'Notizbuch/leer.one', data: new Uint8Array(0) },
    { name: 'Notizbuch/Abschnitt B.one', data: plaintext(260000, 32768) },
  ];
  for (const kind of ['none', 'mszip', 'lzx']) {
    const u8 = cab(files, kind);
    for (const src of [u8, new Blob([u8])]) {
      const c = await ON.openCab(src);
      check(`CAB ${kind}: Dateiliste`, c.files.map(f => f.name).join('|') === files.map(f => f.name).join('|'), c.files.map(f => f.name).join('|'));
      const got = []; for await (const f of c.iterate()) got.push(f);
      check(`CAB ${kind} (${src instanceof Blob ? 'Blob' : 'Bytes'}): alle Dateien identisch`, got.length === files.length && files.every(f => { const g = got.find(x => x.name === f.name); return g && eq(g.data, f.data); }), got.map(g => g.name + ':' + g.data.length).join(' '));
    }
    if (kind !== 'lzx') { const old = ON.readCab(u8); check(`CAB ${kind}: gleich wie bisheriger Leser`, old.every(f => eq(f.data, files.find(x => x.name === f.name).data))); }
  }
  // echtes OneNote-Paket aus OneNote (LZX), falls vorhanden
  try {
    const fs = require('fs'), path = require('path');
    const real = fs.readdirSync('/root/.claude/uploads').flatMap(d => { try { return fs.readdirSync(path.join('/root/.claude/uploads', d)).filter(n => /\.onepkg$/i.test(n)).map(n => path.join('/root/.claude/uploads', d, n)); } catch (e) { return []; } })[0];
    if (real) {
      const u8 = new Uint8Array(fs.readFileSync(real)); const old = ON.readCab(u8); const c = await ON.openCab(new Blob([u8])); const got = []; for await (const f of c.iterate()) got.push(f);
      check('echtes .onepkg (LZX): Strom = am Stück', old.length === got.length && old.every(f => eq(f.data, got.find(g => g.name === f.name).data)));
    }
  } catch (e) { /* ohne Datei */ }

  /* ------------------------------------------------------------ ZIP direkt aus der Datei */
  const crc = (b) => zlib.crc32 ? zlib.crc32(b) : 0;
  const entries = [
    { name: Buffer.from([0x4E, 0x6F, 0x74, 0x69, 0x7A, 0x2F, 0x9A, 0x62, 0x65, 0x72, 0x73, 0x69, 0x63, 0x68, 0x74, 0x2E, 0x6F, 0x6E, 0x65]), flags: 0, want: 'Notiz/Übersicht.one', data: plaintext(70000, 32768), method: 8 },   // CP437 wie der Explorer
    { name: Buffer.from('Notiz/Größe.one', 'utf8'), flags: 0x800, want: 'Notiz/Größe.one', data: plaintext(5000, 32768), method: 0 },
    { name: Buffer.from('Notiz/x.one', 'latin1'), flags: 0, uni: 'Notiz/Ärger.one', want: 'Notiz/Ärger.one', data: plaintext(3000, 32768), method: 8 },
    { name: Buffer.from('Notiz/gross.one'), flags: 0x800, want: 'Notiz/gross.one', data: plaintext(90000, 32768), method: 8, zip64: true },
  ];
  const parts = [], cd = []; let off = 0;
  for (const e of entries) {
    const comp = e.method === 8 ? zlib.deflateRawSync(e.data) : Buffer.from(e.data);
    const lh = Buffer.alloc(30); lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(e.flags, 6); lh.writeUInt16LE(e.method, 8);
    lh.writeUInt32LE(crc(e.data), 14); lh.writeUInt32LE(comp.length, 18); lh.writeUInt32LE(e.data.length, 22); lh.writeUInt16LE(e.name.length, 26);
    parts.push(lh, e.name, comp);
    let extra = Buffer.alloc(0);
    if (e.uni) { const u = Buffer.from(e.uni, 'utf8'); extra = Buffer.alloc(9 + u.length); extra.writeUInt16LE(0x7075, 0); extra.writeUInt16LE(5 + u.length, 2); extra[4] = 1; u.copy(extra, 9); }
    if (e.zip64) { extra = Buffer.alloc(28); extra.writeUInt16LE(1, 0); extra.writeUInt16LE(24, 2); extra.writeBigUInt64LE(BigInt(e.data.length), 4); extra.writeBigUInt64LE(BigInt(comp.length), 12); extra.writeBigUInt64LE(BigInt(off), 20); }
    const ch = Buffer.alloc(46); ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(e.flags, 8); ch.writeUInt16LE(e.method, 10);
    ch.writeUInt32LE(crc(e.data), 16); ch.writeUInt32LE(e.zip64 ? 0xFFFFFFFF : comp.length, 20); ch.writeUInt32LE(e.zip64 ? 0xFFFFFFFF : e.data.length, 24);
    ch.writeUInt16LE(e.name.length, 28); ch.writeUInt16LE(extra.length, 30); ch.writeUInt32LE(e.zip64 ? 0xFFFFFFFF : off, 42);
    cd.push(Buffer.concat([ch, e.name, extra]));
    off += 30 + e.name.length + comp.length;
  }
  const cdb = Buffer.concat(cd);
  const z64 = Buffer.alloc(56); z64.writeUInt32LE(0x06064b50, 0); z64.writeBigUInt64LE(44n, 4); z64.writeUInt16LE(45, 12); z64.writeUInt16LE(45, 14);
  z64.writeBigUInt64LE(BigInt(entries.length), 24); z64.writeBigUInt64LE(BigInt(entries.length), 32); z64.writeBigUInt64LE(BigInt(cdb.length), 40); z64.writeBigUInt64LE(BigInt(off), 48);
  const loc = Buffer.alloc(20); loc.writeUInt32LE(0x07064b50, 0); loc.writeBigUInt64LE(BigInt(off + cdb.length), 8); loc.writeUInt32LE(1, 16);
  const eocd = Buffer.alloc(22); eocd.writeUInt32LE(0x06054b50, 0); eocd.writeUInt16LE(0xFFFF, 8); eocd.writeUInt16LE(0xFFFF, 10); eocd.writeUInt32LE(0xFFFFFFFF, 12); eocd.writeUInt32LE(0xFFFFFFFF, 16);
  const zip = new Blob([...parts, cdb, z64, loc, eocd]);
  const list = await FP.openZip(zip);
  check('ZIP: Namen (CP437, UTF-8, Unicode-Feld, ZIP64)', list.map(e => e.name).join('|') === entries.map(e => e.want).join('|'), list.map(e => e.name).join('|'));
  for (const [i, e] of list.entries()) check(`ZIP: „${e.name}“ entpackt`, eq(await e.read(), entries[i].data));
  console.log(`${ok} von ${ok + fail} Prüfungen bestanden (LZX-Strom, MSZIP, CAB, ZIP aus der Datei)`);
  process.exit(fail ? 1 : 0);
})();
