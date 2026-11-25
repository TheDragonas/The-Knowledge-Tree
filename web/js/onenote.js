'use strict';
/* OneNote-Dateien lesen (.one, .onepkg) – ohne fremde Bibliotheken.
 *
 *   Ebene 1  Bytes:    Entpacken (Inflate/MSZIP) und CAB-Archive (.onepkg)
 *   Ebene 2  OneStore: das Revisions-Speicherformat [MS-ONESTORE] – Dateiknoten-Listen, Objekträume,
 *                      Revisionen, Objekte mit Eigenschaften, eingebettete Dateien
 *   Ebene 3  Inhalt:   Bedeutung der Objekte nach [MS-ONE] – Abschnitt, Seiten, Gliederungen, Text …
 *
 * Läuft im Browser und (für Tests) in Node. Keine DOM-Abhängigkeiten. */

const ON = (() => {

  /* ================================================================ Bytes */
  const hex = (n, w = 8) => '0x' + (n >>> 0).toString(16).toUpperCase().padStart(w, '0');
  function guidStr(u8, o) {
    const h = (i) => u8[o + i].toString(16).padStart(2, '0');
    const d1 = h(3) + h(2) + h(1) + h(0), d2 = h(5) + h(4), d3 = h(7) + h(6);
    let d4 = '', d5 = '';
    for (let i = 8; i < 10; i++) d4 += h(i);
    for (let i = 10; i < 16; i++) d5 += h(i);
    return `{${d1}-${d2}-${d3}-${d4}-${d5}}`.toUpperCase();
  }
  const NIL_GUID = '{00000000-0000-0000-0000-000000000000}';

  class Reader {
    constructor(u8, pos = 0, end = u8.length) {
      this.u8 = u8; this.dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
      this.pos = pos; this.end = end;
    }
    need(n) { if (this.pos + n > this.end) throw new Error(`Datei zu kurz (bei ${this.pos}, brauche ${n})`); }
    u8v() { this.need(1); return this.u8[this.pos++]; }
    u16() { this.need(2); const v = this.dv.getUint16(this.pos, true); this.pos += 2; return v; }
    u32() { this.need(4); const v = this.dv.getUint32(this.pos, true); this.pos += 4; return v; }
    i32() { this.need(4); const v = this.dv.getInt32(this.pos, true); this.pos += 4; return v; }
    f32() { this.need(4); const v = this.dv.getFloat32(this.pos, true); this.pos += 4; return v; }
    u64() { this.need(8); const lo = this.dv.getUint32(this.pos, true), hi = this.dv.getUint32(this.pos + 4, true); this.pos += 8; return hi === 0xFFFFFFFF && lo === 0xFFFFFFFF ? -1 : hi * 4294967296 + lo; }
    guid() { this.need(16); const g = guidStr(this.u8, this.pos); this.pos += 16; return g; }
    bytes(n) { this.need(n); const b = this.u8.subarray(this.pos, this.pos + n); this.pos += n; return b; }
    skip(n) { this.need(n); this.pos += n; }
    left() { return this.end - this.pos; }
  }
  const utf16 = (b) => {
    let s = '';
    for (let i = 0; i + 1 < b.length; i += 2) s += String.fromCharCode(b[i] | (b[i + 1] << 8));
    return s;
  };
  const latin1 = (b) => { let s = ''; for (const c of b) s += String.fromCharCode(c); return s; };
  const CP1252 = '\u20AC\u0081\u201A\u0192\u201E\u2026\u2020\u2021\u02C6\u2030\u0160\u2039\u0152\u008D\u017D\u008F\u0090\u2018\u2019\u201C\u201D\u2022\u2013\u2014\u02DC\u2122\u0161\u203A\u0153\u009D\u017E\u0178';
  const cp1252 = (b) => { let s = ''; for (const c of b) s += c >= 0x80 && c < 0xA0 ? CP1252[c - 0x80] : String.fromCharCode(c); return s; };

  /* ================================================================ Inflate (Deflate, RFC 1951)
   * Schreibt in einen gemeinsamen Ausgabepuffer – so funktionieren auch MSZIP-Blöcke,
   * die auf die Daten des vorherigen Blocks zurückgreifen. */
  const LBASE = [3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258];
  const LEXT = [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0];
  const DBASE = [1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145, 8193, 12289, 16385, 24577];
  const DEXT = [0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13];
  const CLORDER = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15];

  function huff(lengths, n) {
    const count = new Uint16Array(16), sym = new Uint16Array(n), offs = new Uint16Array(16);
    for (let i = 0; i < n; i++) count[lengths[i]]++;
    count[0] = 0;
    for (let i = 1; i < 16; i++) offs[i] = offs[i - 1] + count[i - 1];
    for (let i = 0; i < n; i++) if (lengths[i]) sym[offs[lengths[i]]++] = i;
    // schneller Tabellenzugriff für Codes bis 9 Bit
    return { count, sym, fast: null };
  }
  let FIXED = null;
  function fixedTables() {
    if (FIXED) return FIXED;
    const l = new Uint8Array(288);
    for (let i = 0; i < 144; i++) l[i] = 8;
    for (let i = 144; i < 256; i++) l[i] = 9;
    for (let i = 256; i < 280; i++) l[i] = 7;
    for (let i = 280; i < 288; i++) l[i] = 8;
    const d = new Uint8Array(30).fill(5);
    FIXED = { lit: huff(l, 288), dist: huff(d, 30) };
    return FIXED;
  }

  /* inflate(src, srcPos, out, outPos) -> { srcPos, outPos } */
  function inflate(src, srcPos, out, outPos, srcEnd = src.length) {
    let bitbuf = 0, bitcnt = 0, p = srcPos, o = outPos;
    const bits = (need) => {
      let val = bitbuf;
      while (bitcnt < need) {
        if (p >= srcEnd) throw new Error('Entpacken: Daten zu kurz');
        val |= src[p++] << bitcnt;
        bitcnt += 8;
      }
      bitbuf = val >>> need;
      bitcnt -= need;
      return val & ((1 << need) - 1);
    };
    const decode = (h) => {
      let code = 0, first = 0, index = 0;
      for (let len = 1; len < 16; len++) {
        code |= bits(1);
        const count = h.count[len];
        if (code - count < first) return h.sym[index + (code - first)];
        index += count;
        first += count;
        first <<= 1;
        code <<= 1;
      }
      throw new Error('Entpacken: ungültiger Code');
    };
    const codes = (lit, dist) => {
      for (;;) {
        let s = decode(lit);
        if (s < 256) { if (o >= out.length) throw new Error('Entpacken: Ausgabe zu gross'); out[o++] = s; continue; }
        if (s === 256) return;
        s -= 257;
        if (s >= 29) throw new Error('Entpacken: ungültige Länge');
        const len = LBASE[s] + bits(LEXT[s]);
        const ds = decode(dist);
        if (ds >= 30) throw new Error('Entpacken: ungültige Distanz');
        const d = DBASE[ds] + bits(DEXT[ds]);
        if (d > o) throw new Error('Entpacken: Distanz zu weit');
        if (o + len > out.length) throw new Error('Entpacken: Ausgabe zu gross');
        for (let i = 0; i < len; i++, o++) out[o] = out[o - d];
      }
    };
    let last;
    do {
      last = bits(1);
      const type = bits(2);
      if (type === 0) {
        bitbuf = 0; bitcnt = 0;
        if (p + 4 > srcEnd) throw new Error('Entpacken: Daten zu kurz');
        const len = src[p] | (src[p + 1] << 8);
        p += 4;
        if (p + len > srcEnd || o + len > out.length) throw new Error('Entpacken: Block zu gross');
        out.set(src.subarray(p, p + len), o);
        p += len; o += len;
      } else if (type === 1) {
        const f = fixedTables();
        codes(f.lit, f.dist);
      } else if (type === 2) {
        const nlen = bits(5) + 257, ndist = bits(5) + 1, ncode = bits(4) + 4;
        const lengths = new Uint8Array(320);
        for (let i = 0; i < ncode; i++) lengths[CLORDER[i]] = bits(3);
        for (let i = ncode; i < 19; i++) lengths[CLORDER[i]] = 0;
        const lencode = huff(lengths, 19);
        const all = new Uint8Array(nlen + ndist);
        let i = 0;
        while (i < nlen + ndist) {
          let s = decode(lencode);
          if (s < 16) { all[i++] = s; continue; }
          let rep, val = 0;
          if (s === 16) { if (!i) throw new Error('Entpacken: Wiederholung ohne Wert'); val = all[i - 1]; rep = 3 + bits(2); }
          else if (s === 17) rep = 3 + bits(3);
          else rep = 11 + bits(7);
          if (i + rep > nlen + ndist) throw new Error('Entpacken: zu viele Längen');
          while (rep--) all[i++] = val;
        }
        codes(huff(all.subarray(0, nlen), nlen), huff(all.subarray(nlen), ndist));
      } else throw new Error('Entpacken: ungültiger Blocktyp');
    } while (!last);
    return { srcPos: p, outPos: o };
  }


  /* ================================================================ LZX (CAB-Variante, wie libmspack)
   * OneNote packt .onepkg-Dateien mit LZX. Ausgabe wird komplett im Speicher gehalten. */
  const LZX_EXTRA = new Uint8Array(51), LZX_BASE = new Uint32Array(51);
  (() => {
    for (let i = 0, j = 0; i < 51; i += 2) { LZX_EXTRA[i] = j; if (i + 1 < 51) LZX_EXTRA[i + 1] = j; if (i !== 0 && j < 17) j++; }
    for (let i = 0, j = 0; i < 51; i++) { LZX_BASE[i] = j; j += 1 << LZX_EXTRA[i]; }
  })();
  function lzxHuff(lens, n) {
    const count = new Uint16Array(17), offs = new Uint16Array(17), sym = new Uint16Array(n);
    for (let i = 0; i < n; i++) count[lens[i]]++;
    count[0] = 0;
    for (let i = 1; i < 17; i++) offs[i] = offs[i - 1] + count[i - 1];
    for (let i = 0; i < n; i++) if (lens[i]) sym[offs[lens[i]]++] = i;
    return { count, sym };
  }
  /* LZX als Strom (seit 1.18): liefert die Ausgabe in 32-KB-Rahmen, statt alles auf einmal zu erzeugen.
   * Das Fenster ist ein Ringpuffer (2 × Fenstergrösse, mind. 128 KB) – so braucht ein 1-GB-Paket nicht 1 GB
   * Ausgabe-Speicher (und keine zweite Kopie für die E8-Übersetzung). E8-Übersetzung je Rahmen beim Ausgeben,
   * wie in libmspack (nur Rahmen ab dem Zeitpunkt, an dem sie aktiv ist; höchstens die ersten 32768 Rahmen). */
  function* lzxStream(src, outSize, windowBits, ringBits) {
    const posnSlots = { 15: 30, 16: 32, 17: 34, 18: 36, 19: 38, 20: 42, 21: 50 }[windowBits];
    if (!posnSlots) throw new Error('LZX: ungültige Fenstergrösse');
    const ring = new Uint8Array(ringBits ? 1 << ringBits : Math.max(2 << windowBits, 1 << 17)), mask = ring.length - 1;
    const mainN = 256 + posnSlots * 8;
    const mainLen = new Uint8Array(mainN), lenLen = new Uint8Array(249), alignLen = new Uint8Array(8);
    let p = 0, buf = 0, left = 0;
    const word = () => { const w = p + 1 < src.length ? (src[p] | (src[p + 1] << 8)) : (p < src.length ? src[p] : 0); p += 2; return w; };
    const ensure = (n) => { while (left < n) { buf = (buf | (word() << (16 - left))) >>> 0; left += 16; } };
    const peek = (n) => buf >>> (32 - n);
    const remove = (n) => { buf = n >= 32 ? 0 : (buf << n) >>> 0; left -= n; };
    const bits = (n) => {
      if (!n) return 0;
      if (n > 16) { const hi = bits(n - 16); return hi * 65536 + bits(16); }
      ensure(n); const v = peek(n); remove(n); return v;
    };
    const sym = (h) => {
      let code = 0, first = 0, index = 0;
      for (let len = 1; len <= 16; len++) {
        code |= bits(1);
        const c = h.count[len];
        if (code - c < first) return h.sym[index + (code - first)];
        index += c; first += c; first <<= 1; code <<= 1;
      }
      throw new Error('LZX: ungültiger Code');
    };
    const readLens = (lens, first, last) => {
      const pre = new Uint8Array(20);
      for (let i = 0; i < 20; i++) pre[i] = bits(4);
      const ph = lzxHuff(pre, 20);
      for (let x = first; x < last;) {
        let z = sym(ph);
        if (z === 17) { let y = bits(4) + 4; while (y-- && x < last) lens[x++] = 0; }
        else if (z === 18) { let y = bits(5) + 20; while (y-- && x < last) lens[x++] = 0; }
        else if (z === 19) { let y = bits(1) + 4; z = sym(ph); z = lens[x] - z; if (z < 0) z += 17; while (y-- && x < last) lens[x++] = z; }
        else { z = lens[x] - z; if (z < 0) z += 17; lens[x++] = z; }
      }
    };
    // Kopf: Intel-E8-Übersetzung
    let intelSize = 0, intelStarted = false;
    if (bits(1)) { const hi = bits(16), lo = bits(16); intelSize = hi * 65536 + lo; }
    let R0 = 1, R1 = 1, R2 = 1, o = 0, nextFrame = Math.min(32768, outSize);
    let blockType = 0, blockLen = 0, remaining = 0, mainH = null, lenH = null, alignH = null;
    let emitted = 0, frameNo = 0;
    const realign = () => {
      while (o >= nextFrame && nextFrame < outSize + 32768) {
        if (left > 0) ensure(16);
        if (left & 15) remove(left & 15);
        nextFrame += 32768;
      }
    };
    // einen Rahmen (32 KB, der letzte kürzer) aus dem Ring kopieren, E8 zurückübersetzen
    const frame = () => {
      const size = Math.min(32768, outSize - emitted), fr = new Uint8Array(size), st = emitted & mask;
      if (st + size <= ring.length) fr.set(ring.subarray(st, st + size));
      else { const a = ring.length - st; fr.set(ring.subarray(st)); fr.set(ring.subarray(0, size - a), a); }
      if (intelStarted && intelSize && frameNo < 32768 && size > 10) {
        let i = 0, curpos = emitted;
        const end = size - 10;
        while (i < end) {
          if (fr[i++] !== 0xE8) { curpos++; continue; }
          const abs = fr[i] | (fr[i + 1] << 8) | (fr[i + 2] << 16) | (fr[i + 3] << 24);
          if (abs >= -curpos && abs < intelSize) {
            const rel = abs >= 0 ? abs - curpos : abs + intelSize;
            fr[i] = rel & 255; fr[i + 1] = (rel >>> 8) & 255; fr[i + 2] = (rel >>> 16) & 255; fr[i + 3] = (rel >>> 24) & 255;
          }
          i += 4; curpos += 5;
        }
      }
      emitted += size; frameNo++;
      return fr;
    };
    while (o < outSize) {
      if (remaining === 0) {
        if (blockType === 3 && (blockLen & 1)) p++;
        blockType = bits(3);
        const hi = bits(16), lo = bits(8);
        blockLen = remaining = hi * 256 + lo;
        if (blockType === 2) { for (let i = 0; i < 8; i++) alignLen[i] = bits(3); alignH = lzxHuff(alignLen, 8); }
        if (blockType === 1 || blockType === 2) {
          readLens(mainLen, 0, 256);
          readLens(mainLen, 256, mainN);
          mainH = lzxHuff(mainLen, mainN);
          if (mainLen[0xE8]) intelStarted = true;
          readLens(lenLen, 0, 249);
          lenH = lzxHuff(lenLen, 249);
        } else if (blockType === 3) {
          intelStarted = true;
          if (left === 0) ensure(16);
          buf = 0; left = 0;
          const rd = () => { const v = (src[p] | (src[p + 1] << 8) | (src[p + 2] << 16) | (src[p + 3] << 24)) >>> 0; p += 4; return v; };
          R0 = rd(); R1 = rd(); R2 = rd();
        } else throw new Error('LZX: unbekannter Blocktyp ' + blockType);
        if (!remaining) continue;
      }
      if (blockType === 3) {
        // unkomprimiert: höchstens bis zur nächsten Rahmengrenze kopieren, dann ausgeben
        const n = Math.min(remaining, outSize - o, 32768 - (o % 32768));
        for (let i = 0; i < n; i++) ring[(o + i) & mask] = src[p + i];
        p += n; o += n; remaining -= n;
        if (o >= nextFrame) nextFrame = (Math.floor(o / 32768) + 1) * 32768;
        while (o - emitted >= 32768) yield frame();
        continue;
      }
      const start = o;
      let main = sym(mainH);
      if (main < 256) { ring[o & mask] = main; o++; }
      else {
        main -= 256;
        let len = main & 7;
        if (len === 7) len += sym(lenH);
        len += 2;
        let off = main >> 3;
        if (off > 2) {
          const extra = off >= 36 ? 17 : LZX_EXTRA[off];
          if (blockType === 2) {
            let mo = LZX_BASE[off] - 2;
            if (extra > 3) { mo += bits(extra - 3) * 8; mo += sym(alignH); }
            else if (extra === 3) mo += sym(alignH);
            else if (extra > 0) mo += bits(extra);
            else mo = 1;
            off = mo;
          } else {
            off = off !== 3 ? LZX_BASE[off] - 2 + bits(extra) : 1;
          }
          R2 = R1; R1 = R0; R0 = off;
        } else if (off === 0) off = R0;
        else if (off === 1) { off = R1; R1 = R0; R0 = off; }
        else { off = R2; R2 = R0; R0 = off; }
        if (off > o) throw new Error('LZX: Verweis vor den Anfang');
        if (o + len > outSize) len = outSize - o;
        for (let i = 0; i < len; i++, o++) ring[o & mask] = ring[(o - off) & mask];
      }
      remaining -= (o - start);
      if (remaining < 0) remaining = 0;
      if (o >= nextFrame) realign();
      while (o - emitted >= 32768) yield frame();
    }
    while (emitted < outSize) yield frame();
  }
  /* alles auf einmal (kleine Dateien, Tests) */
  function lzxDecompress(src, outSize, windowBits) {
    const out = new Uint8Array(outSize);
    let o = 0;
    for (const fr of lzxStream(src, outSize, windowBits)) { out.set(fr, o); o += fr.length; }
    return out;
  }

  /* ================================================================ CAB (.onepkg) */
  function readCab(u8) {
    const r = new Reader(u8);
    if (latin1(r.bytes(4)) !== 'MSCF') throw new Error('Keine OneNote-Paketdatei (.onepkg) – das CAB-Kennzeichen fehlt');
    r.skip(4);
    r.u32(); // cbCabinet
    r.skip(4);
    const coffFiles = r.u32();
    r.skip(4);
    r.skip(2); // Version
    const cFolders = r.u16(), cFiles = r.u16(), flags = r.u16();
    r.skip(4); // setID, iCabinet
    let cbFolderRes = 0, cbDataRes = 0;
    if (flags & 4) { const cbHeaderRes = r.u16(); cbFolderRes = r.u8v(); cbDataRes = r.u8v(); r.skip(cbHeaderRes); }
    const cstr = () => { const s = r.pos; while (r.u8[r.pos] !== 0) r.pos++; const b = r.u8.subarray(s, r.pos); r.pos++; return b; };
    if (flags & 1) { cstr(); cstr(); }
    if (flags & 2) { cstr(); cstr(); }
    if (flags & 3) throw new Error('Mehrteilige Paketdateien werden nicht unterstützt');
    const folders = [];
    for (let i = 0; i < cFolders; i++) { folders.push({ start: r.u32(), nData: r.u16(), comp: r.u16() }); r.skip(cbFolderRes); }
    r.pos = coffFiles;
    const files = [];
    for (let i = 0; i < cFiles; i++) {
      const size = r.u32(), off = r.u32(), folder = r.u16();
      r.skip(4); // Datum, Zeit
      const attr = r.u16();
      const nb = cstr();
      const name = (attr & 0x80) ? new TextDecoder('utf-8').decode(nb) : latin1(nb);
      files.push({ name: name.replace(/\\/g, '/'), size, off, folder });
    }
    // Ordner entpacken
    const data = folders.map((f) => {
      const t = f.comp & 0x0F;
      if (t !== 0 && t !== 1 && t !== 3) throw new Error('Unbekannte Packart in der Paketdatei (Quantum)');
      const blocks = [];
      let pos = f.start, total = 0;
      for (let i = 0; i < f.nData; i++) {
        const br = new Reader(u8, pos);
        br.skip(4);
        const cb = br.u16(), cbU = br.u16();
        br.skip(cbDataRes);
        blocks.push({ at: br.pos, cb, cbU });
        total += cbU;
        pos = br.pos + cb;
      }
      if (t === 3) {
        const all = new Uint8Array(blocks.reduce((x, b) => x + b.cb, 0));
        let q = 0;
        for (const b of blocks) { all.set(u8.subarray(b.at, b.at + b.cb), q); q += b.cb; }
        return lzxDecompress(all, total, (f.comp >> 8) & 0x1F);
      }
      const out = new Uint8Array(total);
      let o = 0;
      for (const b of blocks) {
        if (t === 0) { out.set(u8.subarray(b.at, b.at + b.cb), o); o += b.cb; continue; }
        if (u8[b.at] !== 0x43 || u8[b.at + 1] !== 0x4B) throw new Error('MSZIP-Block ohne Kennzeichen');
        const res = inflate(u8, b.at + 2, out, o, b.at + b.cb);
        if (res.outPos - o !== b.cbU) throw new Error('MSZIP-Block hat die falsche Grösse');
        o = res.outPos;
      }
      return out;
    });
    return files.map(f => ({ name: f.name, data: data[f.folder].subarray(f.off, f.off + f.size) }));
  }

  /* CAB als Strom (seit 1.18): Kopf lesen, dann Ordner für Ordner entpacken und jede Datei liefern, sobald sie
   * vollständig ist – nie das ganze entpackte Paket auf einmal im Speicher. src = Blob/File (wird stückweise
   * gelesen) oder Uint8Array. openCab(src) → { files: [{ name, size }], async *iterate() → { name, data } } */
  async function openCab(src) {
    const total = src instanceof Uint8Array ? src.length : src.size;
    const get = async (a, b) => src instanceof Uint8Array ? src.subarray(a, Math.min(b, total)) : new Uint8Array(await src.slice(a, Math.min(b, total)).arrayBuffer());
    let head = await get(0, 64 * 1024);
    let r = new Reader(head);
    if (latin1(r.bytes(4)) !== 'MSCF') throw new Error('Keine OneNote-Paketdatei (.onepkg) – das CAB-Kennzeichen fehlt');
    r.skip(4); r.u32(); r.skip(4);
    const coffFiles = r.u32();
    r.skip(4); r.skip(2);
    const cFolders = r.u16(), cFiles = r.u16(), flags = r.u16();
    r.skip(4);
    if (flags & 3) throw new Error('Mehrteilige Paketdateien werden nicht unterstützt');
    let cbFolderRes = 0, cbDataRes = 0, cbHeaderRes = 0;
    if (flags & 4) { cbHeaderRes = r.u16(); cbFolderRes = r.u8v(); cbDataRes = r.u8v(); r.skip(cbHeaderRes); }
    const folders = [];
    for (let i = 0; i < cFolders; i++) { folders.push({ start: r.u32(), nData: r.u16(), comp: r.u16() }); r.skip(cbFolderRes); }
    // Dateiliste steht vor den Daten – notfalls mehr lesen
    const dataStart = Math.min(...folders.map(f => f.start), total);
    if (dataStart > head.length) { head = await get(0, dataStart); r = new Reader(head); }
    r.pos = coffFiles;
    const cstr = () => { const s0 = r.pos; while (r.u8[r.pos] !== 0) r.pos++; const b = r.u8.subarray(s0, r.pos); r.pos++; return b; };
    const files = [];
    for (let i = 0; i < cFiles; i++) {
      const size = r.u32(), off = r.u32(), folder = r.u16();
      r.skip(4);
      const attr = r.u16();
      const nb = cstr();
      files.push({ name: ((attr & 0x80) ? new TextDecoder('utf-8').decode(nb) : latin1(nb)).replace(/\\/g, '/'), size, off, folder });
    }
    for (const f of folders) if ((f.comp & 0x0F) !== 0 && (f.comp & 0x0F) !== 1 && (f.comp & 0x0F) !== 3) throw new Error('Unbekannte Packart in der Paketdatei (Quantum)');
    // Datenblöcke (CFDATA) eines Ordners der Reihe nach, in grösseren Stücken gelesen
    async function* blocks(f) {
      let pos = f.start, chunk = null, cStart = 0;
      const need = async (a, b) => { if (!chunk || a < cStart || b > cStart + chunk.length) { cStart = a; chunk = await get(a, Math.max(b, a + 8 * 1024 * 1024)); } return chunk.subarray(a - cStart, b - cStart); };
      for (let i = 0; i < f.nData; i++) {
        const h = await need(pos, pos + 8 + cbDataRes);
        const cb = h[4] | (h[5] << 8), cbU = h[6] | (h[7] << 8);
        const at = pos + 8 + cbDataRes;
        yield { data: await need(at, at + cb), cbU };
        pos = at + cb;
      }
    }
    // entpackte Bytes eines Ordners als Strom von Stücken
    async function* folderStream(f) {
      const t = f.comp & 0x0F;
      if (t === 0) { for await (const b of blocks(f)) yield b.data.slice(); return; }
      if (t === 1) {
        // MSZIP: jeder Block ist ein Deflate-Strom, der die letzten 32 KB des vorigen Blocks als Wörterbuch nutzt
        const hist = new Uint8Array(65536 + 32768);   // [0, 32768) = Vorgeschichte, danach der neue Block
        for await (const b of blocks(f)) {
          const d = b.data;
          if (d[0] !== 0x43 || d[1] !== 0x4B) throw new Error('MSZIP-Block ohne Kennzeichen');
          const res = inflate(d, 2, hist, 32768, d.length);
          if (res.outPos - 32768 !== b.cbU) throw new Error('MSZIP-Block hat die falsche Grösse');
          yield hist.slice(32768, 32768 + b.cbU);
          // die letzten 32 KB nach vorn schieben
          const end = 32768 + b.cbU, keep = Math.min(32768, end);
          hist.copyWithin(32768 - keep, end - keep, end);
        }
        return;
      }
      // LZX: der Bitstrom läuft über alle Blöcke – komprimiert zusammensetzen (nur komprimierte Grösse im Speicher)
      const parts = [];
      let cTotal = 0, uTotal = 0;
      for await (const b of blocks(f)) { parts.push(b.data.slice()); cTotal += b.data.length; uTotal += b.cbU; }
      const all = new Uint8Array(cTotal);
      let q = 0;
      for (const x of parts) { all.set(x, q); q += x.length; }
      parts.length = 0;
      yield* lzxStream(all, uTotal, (f.comp >> 8) & 0x1F);
    }
    return {
      files: files.map(f => ({ name: f.name, size: f.size })),
      async *iterate() {
        for (let fi = 0; fi < folders.length; fi++) {
          const list = files.filter(f => f.folder === fi).sort((a, b) => a.off - b.off);
          if (!list.length) continue;
          let pos = 0, k = 0;
          let cur = null, curFill = 0;
          for await (const piece of folderStream(folders[fi])) {
            let i = 0;
            while (i < piece.length && k < list.length) {
              const f = list[k];
              if (pos + i < f.off) { i = Math.min(piece.length, f.off - pos); continue; }   // Lücke (selten)
              if (!cur) { cur = new Uint8Array(f.size); curFill = 0; }
              const n = Math.min(piece.length - i, f.size - curFill);
              cur.set(piece.subarray(i, i + n), curFill);
              curFill += n; i += n;
              if (curFill >= f.size) { const done = cur; cur = null; k++; yield { name: f.name, data: done }; }
            }
            // Dateien der Grösse 0
            while (k < list.length && list[k].size === 0) { yield { name: list[k].name, data: new Uint8Array(0) }; k++; }
            pos += piece.length;
          }
        }
      },
    };
  }

  /* ================================================================ OneStore [MS-ONESTORE] */
  const FT_ONE = '{7B5C52E4-D88C-4DA7-AEB1-5378D02996D3}';
  const FT_TOC = '{43FF2FA1-EFD9-4C76-9EE2-10EA5722765F}';
  const FF_REVSTORE = '{109ADD3F-911B-49F5-A5D0-1791EDC8AED8}';
  const FDSO_HEADER = '{BDE316E7-2665-4511-A4C4-8D4D0B7A9EAC}';
  const LIST_MAGIC_LO = 0xF5F7F4C4, LIST_MAGIC_HI = 0xA4567AB1;
  const FOOTER_LO = 0x8233BA4B, FOOTER_HI = 0x8BC215C3;

  const FND = {
    ObjectSpaceManifestRoot: 0x004, ObjectSpaceManifestListReference: 0x008, ObjectSpaceManifestListStart: 0x00C,
    RevisionManifestListReference: 0x010, RevisionManifestListStart: 0x014, RevisionManifestStart4: 0x01B, RevisionManifestEnd: 0x01C,
    RevisionManifestStart6: 0x01E, RevisionManifestStart7: 0x01F, GlobalIdTableStart: 0x021, GlobalIdTableStart2: 0x022,
    GlobalIdTableEntry: 0x024, GlobalIdTableEntry2: 0x025, GlobalIdTableEntry3: 0x026, GlobalIdTableEnd: 0x028,
    ObjectDeclarationWithRefCount: 0x02D, ObjectDeclarationWithRefCount2: 0x02E, ObjectRevisionWithRefCount: 0x041, ObjectRevisionWithRefCount2: 0x042,
    RootObjectReference2: 0x059, RootObjectReference3: 0x05A, RevisionRoleDeclaration: 0x05C, RevisionRoleAndContextDeclaration: 0x05D,
    ObjectDeclarationFileData3RefCount: 0x072, ObjectDeclarationFileData3LargeRefCount: 0x073, ObjectDataEncryptionKeyV2: 0x07C,
    ObjectInfoDependencyOverrides: 0x084, DataSignatureGroupDefinition: 0x08C, FileDataStoreListReference: 0x090, FileDataStoreObjectReference: 0x094,
    ObjectDeclaration2RefCount: 0x0A4, ObjectDeclaration2LargeRefCount: 0x0A5, ObjectGroupListReference: 0x0B0, ObjectGroupStart: 0x0B4,
    ObjectGroupEnd: 0x0B8, HashedChunkDescriptor2: 0x0C2, ReadOnlyObjectDeclaration2RefCount: 0x0C4, ReadOnlyObjectDeclaration2LargeRefCount: 0x0C5,
    ChunkTerminator: 0x0FF,
  };
  const FND_NAME = Object.fromEntries(Object.entries(FND).map(([k, v]) => [v, k]));

  const exg = (g, n) => (g === NIL_GUID && !n) ? null : g + ':' + n;
  /* GUID aus einem Verweis-Text ziehen (mit/ohne Klammern, gross/klein, evtl. mit Null-Zeichen am Ende) */
  const GUID_RE = /\{?([0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12})\}?/;
  const normGuid = (s) => { const m = GUID_RE.exec(String(s || '')); return m ? '{' + m[1].toUpperCase() + '}' : null; };

  class OneStore {
    constructor(u8, name = '') {
      this.u8 = u8; this.name = name;
      this.warnings = [];
      this.parseHeader();
      this.readTransactionLog();
      this.spaces = new Map();
      this.fileData = new Map();
      this.external = null;   // (name, ext) => Uint8Array|null: Dateien aus dem Begleitordner „<Abschnitt>_onefiles“
      this.encrypted = false;
      this.parseRoot();
    }

    parseHeader() {
      const r = new Reader(this.u8);
      if (this.u8.length < 1024) throw new Error('Keine OneNote-Datei (zu kurz)');
      const ft = r.guid();
      if (ft === FT_ONE) this.type = 'one';
      else if (ft === FT_TOC) this.type = 'onetoc2';
      else throw new Error('Keine OneNote-Datei (.one) – unbekanntes Format');
      r.skip(32);
      const ff = r.guid();
      if (ff !== FF_REVSTORE) throw new Error('Unbekanntes OneNote-Dateiformat (nicht das Desktop-Format)');
      const rd = (o, n) => { const x = new Reader(this.u8, o); return n === 12 ? { stp: x.u64(), cb: x.u32() } : null; };
      const x = new Reader(this.u8, 96);
      this.cTransactions = x.u32();
      this.fcrTransactionLog = rd(160, 12);
      this.fcrFileNodeListRoot = rd(172, 12);
      this.fcrHashedChunkList = rd(148, 12);
    }

    /* Transaktions-Log: wie viele Dateiknoten jede Liste gültig enthält */
    readTransactionLog() {
      this.counts = new Map();
      let ref = this.fcrTransactionLog, done = 0;
      let guard = 0;
      while (ref && ref.stp !== -1 && ref.cb && done < this.cTransactions && guard++ < 100000) {
        const r = new Reader(this.u8, ref.stp, ref.stp + ref.cb);
        const n = Math.floor((ref.cb - 12) / 8);
        let pending = new Map();
        for (let i = 0; i < n && done < this.cTransactions; i++) {
          const src = r.u32(), sw = r.u32();
          if (src === 1) { for (const [k, v] of pending) this.counts.set(k, v); pending = new Map(); done++; }
          else pending.set(src, sw);
        }
        // Verweis auf das nächste Fragment steht DIREKT nach den Einträgen – nicht an cb−12: die Fragmente sind
        // z.B. 1024 Byte gross, (1024 − 12) / 8 = 126,5 → nach 126 Einträgen + 12 Byte bleiben 4 Byte Füllung.
        // (Bis 1.15 falsch gelesen: bei Abschnitten mit mehr als ~130 Speichervorgängen fehlten dann alle neueren
        // Seiten, Bilder und Anhänge – die Datei wurde auf einem alten Stand gelesen.)
        r.pos = ref.stp + n * 8;
        ref = { stp: r.u64(), cb: r.u32() };
      }
      // Log unvollständig (Kette bricht ab): lieber alle Knoten lesen als auf einem alten Stand stehen bleiben
      if (done < this.cTransactions) {
        this.warnings.push(`Transaktions-Log unvollständig (${done} von ${this.cTransactions}) – Listen werden ganz gelesen`);
        this.counts = new Map();
      }
    }

    /* Dateiknoten-Liste lesen (alle Fragmente) */
    readList(ref) {
      const nodes = [];
      if (!ref || ref.stp === -1 || !ref.cb) return nodes;
      let listId = null, max = Infinity, guard = 0;
      while (ref && ref.stp !== -1 && ref.cb && guard++ < 100000) {
        const r = new Reader(this.u8, ref.stp, ref.stp + ref.cb);
        const lo = r.u32(), hi = r.u32();
        if (lo !== LIST_MAGIC_LO || hi !== LIST_MAGIC_HI) throw new Error('Beschädigte Dateiknoten-Liste bei ' + ref.stp);
        const id = r.u32();
        r.u32(); // nFragmentSequence
        if (listId === null) { listId = id; if (this.counts.has(id)) max = this.counts.get(id); }
        const endNodes = ref.stp + ref.cb - 20;
        while (r.pos + 4 <= endNodes && nodes.length < max) {
          const at = r.pos;
          const h = r.u32();
          const fid = h & 0x3FF, size = (h >>> 10) & 0x1FFF;
          if (fid === 0 && size === 0) break;
          if (size < 4 || at + size > endNodes) { this.warnings.push(`Knoten ${hex(fid, 3)} mit ungültiger Grösse bei ${at}`); break; }
          if (fid === FND.ChunkTerminator) break;   // Rest des Fragments ist Füllung
          nodes.push(this.parseNode(at, h, fid, size));
          r.pos = at + size;
        }
        if (nodes.length >= max) break;
        const nr = new Reader(this.u8, ref.stp + ref.cb - 20);
        const nref = { stp: nr.u64(), cb: nr.u32() };
        const flo = nr.u32(), fhi = nr.u32();
        if (flo !== FOOTER_LO || fhi !== FOOTER_HI) this.warnings.push('Fragment-Fussmarke fehlt bei ' + ref.stp);
        if (nref.stp === -1 || !nref.cb) break;
        ref = nref;
      }
      return nodes;
    }

    parseNode(at, h, id, size) {
      const stpFmt = (h >>> 23) & 3, cbFmt = (h >>> 25) & 3, base = (h >>> 27) & 0xF;
      const r = new Reader(this.u8, at + 4, at + size);
      const node = { id, at, size };
      if (base === 1 || base === 2) {
        let stp, cb;
        if (stpFmt === 0) stp = r.u64(); else if (stpFmt === 1) stp = r.u32(); else if (stpFmt === 2) stp = r.u16() * 8; else stp = r.u32() * 8;
        if (cbFmt === 0) cb = r.u32(); else if (cbFmt === 1) cb = r.u64(); else if (cbFmt === 2) cb = r.u8v() * 8; else cb = r.u16() * 8;
        if ((stpFmt === 1 && stp === 0xFFFFFFFF) || (stpFmt === 2 && stp === 0xFFFF * 8) || (stpFmt === 3 && stp === 0xFFFFFFFF * 8)) stp = -1;
        node.ref = { stp, cb };
      }
      const eg = () => { const g = r.guid(); const n = r.u32(); return exg(g, n); };
      const sisb = () => { const n = r.u32(); return utf16(r.bytes(n * 2)); };
      try {
        switch (id) {
          case FND.ObjectSpaceManifestRoot: node.gosid = eg(); break;
          case FND.ObjectSpaceManifestListReference: node.gosid = eg(); break;
          case FND.ObjectSpaceManifestListStart: node.gosid = eg(); break;
          case FND.RevisionManifestListStart: node.gosid = eg(); break;
          case FND.RevisionManifestStart6: case FND.RevisionManifestStart7:
            node.rid = eg(); node.ridDependent = eg(); node.role = r.u32(); r.u16();
            node.ctx = id === FND.RevisionManifestStart7 ? eg() : null;
            break;
          case FND.RevisionManifestStart4:
            node.rid = eg(); node.ridDependent = eg(); r.skip(8); node.role = r.u32(); node.ctx = null;
            break;
          case FND.GlobalIdTableEntry: node.index = r.u32(); node.guid = r.guid(); break;
          case FND.GlobalIdTableEntry2: node.from = r.u32(); node.to = r.u32(); break;
          case FND.GlobalIdTableEntry3: node.from = r.u32(); node.count = r.u32(); node.to = r.u32(); break;
          case FND.RootObjectReference3: node.oid = eg(); node.rootRole = r.u32(); break;
          case FND.RootObjectReference2: node.coid = r.u32(); node.rootRole = r.u32(); break;
          case FND.RevisionRoleDeclaration: node.rid = eg(); node.role = r.u32(); node.ctx = null; break;
          case FND.RevisionRoleAndContextDeclaration: node.rid = eg(); node.role = r.u32(); node.ctx = eg(); break;
          case FND.ObjectGroupListReference: node.groupId = eg(); break;
          case FND.ObjectGroupStart: node.groupId = eg(); break;
          case FND.ObjectDeclaration2RefCount: case FND.ObjectDeclaration2LargeRefCount:
          case FND.ReadOnlyObjectDeclaration2RefCount: case FND.ReadOnlyObjectDeclaration2LargeRefCount: {
            node.coid = r.u32(); node.jcid = r.u32();
            const f = r.u8v(); node.hasOids = !!(f & 1); node.hasOsids = !!(f & 2);
            break;
          }
          case FND.ObjectDeclarationWithRefCount: case FND.ObjectDeclarationWithRefCount2: {
            node.coid = r.u32();
            const j = r.u16(); node.jcid = 0x00020000 | (j & 0x3FF); // nur .onetoc2
            break;
          }
          case FND.ObjectRevisionWithRefCount: case FND.ObjectRevisionWithRefCount2: node.coid = r.u32(); break;
          case FND.ObjectDeclarationFileData3RefCount: case FND.ObjectDeclarationFileData3LargeRefCount:
            node.coid = r.u32(); node.jcid = r.u32();
            if (id === FND.ObjectDeclarationFileData3RefCount) r.u8v(); else r.u32();
            node.fileRef = sisb(); node.ext = sisb();
            break;
          case FND.FileDataStoreObjectReference: node.guid = r.guid(); break;
          case FND.DataSignatureGroupDefinition: node.sig = eg(); break;
        }
      } catch (e) { node.error = e.message; }
      return node;
    }

    parseRoot() {
      const root = this.readList(this.fcrFileNodeListRoot);
      for (const n of root) {
        if (n.id === FND.ObjectSpaceManifestRoot) this.rootSpace = n.gosid;
        else if (n.id === FND.FileDataStoreListReference) {
          for (const f of this.readList(n.ref)) {
            if (f.id !== FND.FileDataStoreObjectReference) continue;
            this.fileData.set(normGuid(f.guid) || f.guid, f.ref);
          }
        }
      }
      for (const n of root) if (n.id === FND.ObjectSpaceManifestListReference) this.parseSpace(n);
    }

    parseSpace(refNode) {
      const list = this.readList(refNode.ref);
      let revListRef = null;
      for (const n of list) if (n.id === FND.RevisionManifestListReference) revListRef = n.ref; // die letzte gilt
      const space = { id: refNode.gosid, revisions: new Map(), roles: new Map() };
      this.spaces.set(space.id, space);
      if (!revListRef) return;
      const nodes = this.readList(revListRef);
      let cur = null, table = null, prevTable = null;
      const roleKey = (role, ctx) => role + '|' + (ctx || '');
      for (const n of nodes) {
        switch (n.id) {
          case FND.RevisionManifestStart4: case FND.RevisionManifestStart6: case FND.RevisionManifestStart7:
            cur = { rid: n.rid, dep: n.ridDependent, role: n.role, ctx: n.ctx, objects: new Map(), roots: new Map(), groups: [] };
            table = null;
            break;
          case FND.RevisionManifestEnd:
            if (cur) { space.revisions.set(cur.rid, cur); space.roles.set(roleKey(cur.role, cur.ctx), cur.rid); }
            cur = null;
            break;
          case FND.GlobalIdTableStart: case FND.GlobalIdTableStart2: prevTable = table || prevTable; table = new Map(); if (cur) cur.table = table; break;
          case FND.GlobalIdTableEntry: if (table) table.set(n.index, n.guid); break;
          case FND.GlobalIdTableEntry2: if (table && prevTable && prevTable.has(n.from)) table.set(n.to, prevTable.get(n.from)); break;
          case FND.GlobalIdTableEntry3: if (table && prevTable) for (let i = 0; i < n.count; i++) if (prevTable.has(n.from + i)) table.set(n.to + i, prevTable.get(n.from + i)); break;
          case FND.RootObjectReference3: if (cur) cur.roots.set(n.rootRole, n.oid); break;
          case FND.RootObjectReference2: if (cur) cur.roots.set(n.rootRole, this.resolveCid(n.coid, cur.table)); break;
          case FND.ObjectGroupListReference: if (cur) this.readGroup(n.ref, cur); break;
          case FND.ObjectDataEncryptionKeyV2: this.encrypted = true; break;
          case FND.RevisionRoleDeclaration: case FND.RevisionRoleAndContextDeclaration:
            space.roles.set(roleKey(n.role, n.ctx), n.rid);
            break;
          default:
            if (cur && this.isDecl(n.id)) this.declare(n, cur, cur.table);
        }
      }
    }
    isDecl(id) {
      return id === FND.ObjectDeclaration2RefCount || id === FND.ObjectDeclaration2LargeRefCount || id === FND.ReadOnlyObjectDeclaration2RefCount ||
        id === FND.ReadOnlyObjectDeclaration2LargeRefCount || id === FND.ObjectDeclarationFileData3RefCount || id === FND.ObjectDeclarationFileData3LargeRefCount ||
        id === FND.ObjectDeclarationWithRefCount || id === FND.ObjectDeclarationWithRefCount2 || id === FND.ObjectRevisionWithRefCount || id === FND.ObjectRevisionWithRefCount2;
    }
    readGroup(ref, rev) {
      let table = null;
      for (const n of this.readList(ref)) {
        if (n.id === FND.GlobalIdTableStart2 || n.id === FND.GlobalIdTableStart) table = new Map();
        else if (n.id === FND.GlobalIdTableEntry) { if (table) table.set(n.index, n.guid); }
        else if (n.id === FND.ObjectDataEncryptionKeyV2) this.encrypted = true;
        else if (this.isDecl(n.id)) this.declare(n, rev, table || rev.table);
      }
    }
    resolveCid(v, table) {
      const n = v & 0xFF, idx = v >>> 8;
      if (!v) return null;
      const g = table && table.get(idx);
      if (!g) return '?' + idx + ':' + n;
      return exg(g, n);
    }
    declare(n, rev, table) {
      const oid = this.resolveCid(n.coid, table);
      let jcid = n.jcid;
      if (jcid === undefined) { const old = rev.objects.get(oid) || (this._lastJcid && this._lastJcid.get(oid)); jcid = old ? (old.jcid ?? old) : 0; }
      (this._lastJcid || (this._lastJcid = new Map())).set(oid, jcid >>> 0);
      const obj = { oid, jcid: jcid >>> 0, table, node: n };
      if (n.fileRef !== undefined) {
        obj.fileRef = n.fileRef; obj.ext = n.ext;
        // Dateiendung je FileDataStore-Eintrag merken (für „Nicht zugeordnete Inhalte“)
        const g = /<ifndf>/i.test(n.fileRef) && normGuid(n.fileRef);
        if (g) (this.fileExt || (this.fileExt = new Map())).set(g, n.ext || '');
      }
      else if (n.ref && n.ref.stp !== -1 && n.ref.cb) obj.ref = n.ref;
      rev.objects.set(oid, obj);
    }

    /* Objekte einer Revision samt aller abhängigen Revisionen */
    revisionView(space, rid) {
      const sp = this.spaces.get(space);
      if (!sp) return null;
      const chain = [];
      const seen = new Set();
      let r = sp.revisions.get(rid);
      while (r && !seen.has(r.rid)) { chain.unshift(r); seen.add(r.rid); r = r.dep ? sp.revisions.get(r.dep) : null; }
      const objects = new Map(), roots = new Map();
      for (const rv of chain) { for (const [k, v] of rv.objects) objects.set(k, v); for (const [k, v] of rv.roots) roots.set(k, v); }
      return { objects, roots, space: sp };
    }
    currentRevision(space, role = 1, ctx = null) {
      const sp = this.spaces.get(space);
      if (!sp) return null;
      const rid = sp.roles.get(role + '|' + (ctx || ''));
      return rid ? this.revisionView(space, rid) : null;
    }

    /* Eigenschaften eines Objekts lesen (ObjectSpaceObjectPropSet) */
    props(obj) {
      if (!obj) return null;
      if (obj._props) return obj._props;
      if (!obj.ref) { obj._props = new Map(); return obj._props; }
      const r = new Reader(this.u8, obj.ref.stp, obj.ref.stp + obj.ref.cb);
      const stream = () => {
        const h = r.u32();
        const count = h & 0xFFFFFF, ext = !!(h & 0x40000000), noOsid = !!(h & 0x80000000);
        const ids = [];
        for (let i = 0; i < count; i++) ids.push(r.u32());
        return { ids, ext, noOsid, i: 0 };
      };
      const oids = stream();
      const osids = oids.noOsid ? { ids: [], i: 0 } : stream();
      const ctxs = (!oids.noOsid && osids.ext) ? stream() : { ids: [], i: 0 };
      const st = { oids, osids, ctxs };
      try { obj._props = this.readPropSet(r, st, obj.table); }
      catch (e) { this.warnings.push(`Eigenschaften von ${hex(obj.jcid)} nicht lesbar: ${e.message}`); obj._props = new Map(); }
      return obj._props;
    }
    readPropSet(r, st, table) {
      const n = r.u16();
      const prids = [];
      for (let i = 0; i < n; i++) prids.push(r.u32());
      const map = new Map();
      for (const p of prids) map.set((p & 0x7FFFFFFF) >>> 0, this.readValue(r, st, table, p));
      return map;
    }
    readValue(r, st, table, p) {
      const type = (p >>> 26) & 0x1F;
      const take = (s) => { if (s.i >= s.ids.length) throw new Error('Verweis-Strom erschöpft'); return s.ids[s.i++]; };
      switch (type) {
        case 0x1: return true;
        case 0x2: return !!(p & 0x80000000);
        case 0x3: return r.u8v();
        case 0x4: return r.u16();
        case 0x5: return r.bytes(4);
        case 0x6: return r.bytes(8);
        case 0x7: { const len = r.u32(); return r.bytes(len); }
        case 0x8: return this.resolveCid(take(st.oids), table);
        case 0x9: { const c = r.u32(); const a = []; for (let i = 0; i < c; i++) a.push(this.resolveCid(take(st.oids), table)); return a; }
        case 0xA: return this.resolveCid(take(st.osids), table);
        case 0xB: { const c = r.u32(); const a = []; for (let i = 0; i < c; i++) a.push(this.resolveCid(take(st.osids), table)); return a; }
        case 0xC: return this.resolveCid(take(st.ctxs), table);
        case 0xD: { const c = r.u32(); const a = []; for (let i = 0; i < c; i++) a.push(this.resolveCid(take(st.ctxs), table)); return a; }
        case 0x10: {
          const c = r.u32();
          if (!c) return [];
          r.u32(); // prid (Typ PropertySet)
          const a = [];
          for (let i = 0; i < c; i++) a.push(this.readPropSet(r, st, table));
          return a;
        }
        case 0x11: return this.readPropSet(r, st, table);
        default: throw new Error('Unbekannter Eigenschaftstyp ' + type);
      }
    }

    /* eingebettete Datei (Bild, Anhang) zu einem Datei-Objekt.
     * Verweis (FileDataReference, [MS-ONESTORE] 2.5.27):
     *   <ifndf>{GUID}  Daten im FileDataStore dieser Datei
     *   <file>Name     Daten in einer eigenen Datei im Begleitordner „<Abschnitt>_onefiles“ neben der .one-Datei
     *   <invfdo>       OneNote hat KEINE Daten (ungültig – z.B. beim Sichern noch nicht heruntergeladen)
     * Ergebnis: { data, ext, guid } oder ohne data mit { missing: Grund } */
    fileBytes(obj) {
      if (!obj) return null;
      if (obj.fileRef === undefined) return { missing: 'kein-dateiobjekt', ext: '' };
      const ref = String(obj.fileRef || '').replace(/\u0000/g, '').trim(), ext = obj.ext || '';
      if (/^<invfdo>/i.test(ref)) return { missing: 'invfdo', ext };
      if (/^<file>/i.test(ref)) {
        const name = ref.slice(6).trim();
        let data = null;
        try { data = this.external ? this.external(name, ext) : null; } catch (e) { data = null; }
        if (data && data.length >= 36 && guidStr(data, 0) === FDSO_HEADER) data = this.unwrapFdso(data);
        return data ? { data, ext, external: name } : { missing: 'extern', external: name, ext };
      }
      const guid = normGuid(ref);
      if (!guid) return { missing: 'unbekannt', ref, ext };
      const data = this.fileDataBytes(guid);
      return data ? { data, ext, guid } : { missing: 'fds', guid, ext };
    }
    /* FileDataStoreObject: Header-GUID, cbLength (u64) an +16, Daten ab +36 */
    fileDataBytes(guid) {
      const fr = this.fileData.get(normGuid(guid) || guid);
      if (!fr) return null;
      try {
        const r = new Reader(this.u8, fr.stp, Math.min(this.u8.length, fr.stp + fr.cb));
        if (r.guid() !== FDSO_HEADER) return null;
        const len = r.u64();
        r.skip(12);
        return r.bytes(Math.min(len, r.left()));   // abgeschnittene Datei: so viel wie da ist
      } catch (e) { this.warnings.push('Datei-Eintrag ' + guid + ' nicht lesbar: ' + e.message); return null; }
    }
    unwrapFdso(u8) {
      try { const r = new Reader(u8, 16); const len = r.u64(); r.skip(12); return r.bytes(Math.min(len, r.left())); } catch (e) { return u8; }
    }
    /* Namen der Dateien, die im Begleitordner liegen (<file>-Verweise) */
    externalNames() {
      const out = new Set();
      for (const sp of this.spaces.values()) for (const rv of sp.revisions.values()) for (const o of rv.objects.values()) if (o.fileRef && /^<file>/i.test(o.fileRef)) out.add(o.fileRef.slice(6).replace(/\u0000/g, '').trim());
      return [...out];
    }
    /* zwischengespeicherte Eigenschaften eines Objektraums (einer Seite) freigeben – nach dem Umwandeln */
    release(osid) {
      const sp = this.spaces.get(osid);
      if (!sp) return;
      for (const rv of sp.revisions.values()) for (const o of rv.objects.values()) if (o._props) o._props = undefined;
    }
    /* Objekt in irgendeiner Revision suchen (Notnagel, wenn der Verweis nicht in der aktuellen Ansicht liegt) */
    anyObject(oid, pred) {
      if (!oid) return null;
      if (!this._all) {
        this._all = new Map();
        for (const sp of this.spaces.values()) for (const rv of sp.revisions.values()) for (const [k, o] of rv.objects) {
          const prev = this._all.get(k);   // spätere Revision gewinnt – ausser sie hätte keine Daten mehr
          if (!prev || o.fileRef !== undefined || o.ref || (prev.fileRef === undefined && !prev.ref)) this._all.set(k, o);
        }
      }
      const o = this._all.get(oid) || null;
      return o && (!pred || pred(o)) ? o : null;
    }
  }

  /* Eigenschaften nach [MS-ONE] 2.1.12 */
  const P = {
    LayoutTightLayout: 0x08001C00,
    PageWidth: 0x14001C01,
    PageHeight: 0x14001C02,
    OutlineElementChildLevel: 0x0C001C03,
    Bold: 0x08001C04,
    Italic: 0x08001C05,
    Underline: 0x08001C06,
    Strikethrough: 0x08001C07,
    Superscript: 0x08001C08,
    Subscript: 0x08001C09,
    Font: 0x1C001C0A,
    FontSize: 0x10001C0B,
    FontColor: 0x14001C0C,
    Highlight: 0x14001C0D,
    RgOutlineIndentDistance: 0x1C001C12,
    BodyTextAlignment: 0x0C001C13,
    OffsetFromParentHoriz: 0x14001C14,
    OffsetFromParentVert: 0x14001C15,
    NumberListFormat: 0x1C001C1A,
    LayoutMaxWidth: 0x14001C1B,
    LayoutMaxHeight: 0x14001C1C,
    ContentChildNodes: 0x24001C1F,
    ElementChildNodes: 0x24001C20,
    EnableHistory: 0x08001E1E,
    RichEditTextUnicode: 0x1C001C22,
    ListNodes: 0x24001C26,
    NotebookManagementEntityGuid: 0x1C001C30,
    OutlineElementRTL: 0x08001C34,
    LanguageID: 0x14001C3B,
    LayoutAlignmentInParent: 0x14001C3E,
    PictureContainer: 0x20001C3F,
    PageMarginTop: 0x14001C4C,
    PageMarginBottom: 0x14001C4D,
    PageMarginLeft: 0x14001C4E,
    PageMarginRight: 0x14001C4F,
    ListFont: 0x1C001C52,
    TopologyCreationTimeStamp: 0x18001C65,
    LayoutAlignmentSelf: 0x14001C84,
    IsTitleTime: 0x08001C87,
    IsBoilerText: 0x08001C88,
    PageSize: 0x14001C8B,
    PortraitPage: 0x08001C8E,
    EnforceOutlineStructure: 0x08001C91,
    EditRootRTL: 0x08001C92,
    CannotBeSelected: 0x08001CB2,
    IsTitleText: 0x08001CB4,
    IsTitleDate: 0x08001CB5,
    ListRestart: 0x14001CB7,
    IsLayoutSizeSetByUser: 0x08001CBD,
    ListSpacingMu: 0x14001CCB,
    LayoutOutlineReservedWidth: 0x14001CDB,
    LayoutResolveChildCollisions: 0x08001CDC,
    IsReadOnly: 0x08001CDE,
    LayoutMinimumOutlineWidth: 0x14001CEC,
    LayoutCollisionPriority: 0x14001CF1,
    CachedTitleString: 0x1C001CF3,
    DescendantsCannotBeMoved: 0x08001CF9,
    RichEditTextLangID: 0x10001CFE,
    LayoutTightAlignment: 0x08001CFF,
    Charset: 0x0C001D01,
    CreationTimeStamp: 0x14001D09,
    Deletable: 0x08001D0C,
    ListMSAAIndex: 0x10001D0E,
    IsBackground: 0x08001D13,
    IRecordMedia: 0x14001D24,
    CachedTitleStringFromPage: 0x1C001D3C,
    RowCount: 0x14001D57,
    ColumnCount: 0x14001D58,
    TableBordersVisible: 0x08001D5E,
    StructureElementChildNodes: 0x24001D5F,
    ChildGraphSpaceElementNodes: 0x2C001D63,
    TableColumnWidths: 0x1C001D66,
    Author: 0x1C001D75,
    LastModifiedTimeStamp: 0x18001D77,
    AuthorOriginal: 0x20001D78,
    AuthorMostRecent: 0x20001D79,
    LastModifiedTime: 0x14001D7A,
    IsConflictPage: 0x08001D7C,
    TableColumnsLocked: 0x1C001D7D,
    SchemaRevisionInOrderToRead: 0x14001D82,
    IsConflictObjectForRender: 0x08001D96,
    EmbeddedFileContainer: 0x20001D9B,
    EmbeddedFileName: 0x1C001D9C,
    SourceFilepath: 0x1C001D9D,
    ConflictingUserName: 0x1C001D9E,
    ImageFilename: 0x1C001DD7,
    IsConflictObjectForSelection: 0x08001DDB,
    PageLevel: 0x14001DFF,
    TextRunIndex: 0x1C001E12,
    TextRunFormatting: 0x24001E13,
    Hyperlink: 0x08001E14,
    UnderlineType: 0x0C001E15,
    Hidden: 0x08001E16,
    HyperlinkProtected: 0x08001E19,
    TextRunIsEmbeddedObject: 0x08001E22,
    CellShadingColor: 0x14001E26,
    ImageAltText: 0x1C001E58,
    MathFormatting: 0x08003401,
    ParagraphStyle: 0x2000342C,
    ParagraphSpaceBefore: 0x1400342E,
    ParagraphSpaceAfter: 0x1400342F,
    ParagraphLineSpacingExact: 0x14003430,
    MetaDataObjectsAboveGraphSpace: 0x24003442,
    TextRunDataObject: 0x24003458,
    TextRunData: 0x40003499,
    ParagraphStyleId: 0x1C00345A,
    HasVersionPages: 0x08003462,
    ActionItemType: 0x10003463,
    NoteTagShape: 0x10003464,
    NoteTagHighlightColor: 0x14003465,
    NoteTagTextColor: 0x14003466,
    NoteTagPropertyStatus: 0x14003467,
    NoteTagLabel: 0x1C003468,
    NoteTagCreated: 0x1400346E,
    NoteTagCompleted: 0x1400346F,
    NoteTagDefinitionOid: 0x20003488,
    NoteTagStates: 0x04003489,
    ActionItemStatus: 0x10003470,
    ActionItemSchemaVersion: 0x0C003473,
    ReadingOrderRTL: 0x08003476,
    ParagraphAlignment: 0x0C003477,
    VersionHistoryGraphSpaceContextNodes: 0x3400347B,
    DisplayedPageNumber: 0x14003480,
    SectionDisplayName: 0x1C00349B,
    NextStyle: 0x1C00348A,
    WebPictureContainer14: 0x200034C8,
    ImageUploadState: 0x140034CB,
    TextExtendedAscii: 0x1C003498,
    PictureWidth: 0x140034CD,
    PictureHeight: 0x140034CE,
    PageMarginOriginX: 0x14001D0F,
    PageMarginOriginY: 0x14001D10,
    WzHyperlinkUrl: 0x1C001E20,
    TaskTagDueDate: 0x1400346B,
    IsDeletedGraphSpaceContent: 0x1C001DE9,
    FileDataObjectGuid: 0x1C00343E,
    FileDataObjectInvalid: 0x0800343D,
    FileDataObjectExtension: 0x1C003424,
  };
  const P_NAME = Object.fromEntries(Object.entries(P).map(([k, v]) => [v >>> 0, k]));

  /* Hilfen zum Lesen von Eigenschaftswerten */
  const V = {
    u32: (b) => b ? (b[0] | (b[1] << 8) | (b[2] << 16) | (b[3] << 24)) >>> 0 : null,
    i32: (b) => b ? (b[0] | (b[1] << 8) | (b[2] << 16) | (b[3] << 24)) : null,
    f32: (b) => b ? new DataView(b.buffer, b.byteOffset, 4).getFloat32(0, true) : null,
    u64: (b) => b ? new DataView(b.buffer, b.byteOffset, 8).getUint32(4, true) * 4294967296 + new DataView(b.buffer, b.byteOffset, 8).getUint32(0, true) : null,
    str: (b) => b ? utf16(b).replace(/\u0000+$/, '') : '',
    ascii: (b) => b ? cp1252(b).replace(/\u0000+$/, '') : '',
  };


  /* ================================================================ Inhalt [MS-ONE] */
  const J = {
    SectionNode: 0x00060007, PageSeriesNode: 0x00060008, PageNode: 0x0006000B, OutlineNode: 0x0006000C, OutlineElementNode: 0x0006000D,
    RichTextOENode: 0x0006000E, ImageNode: 0x00060011, NumberListNode: 0x00060012, OutlineGroup: 0x00060019, TableNode: 0x00060022,
    TableRowNode: 0x00060023, TableCellNode: 0x00060024, TitleNode: 0x0006002C, PageMetaData: 0x00020030, SectionMetaData: 0x00020031,
    EmbeddedFileContainer: 0x00080036, EmbeddedFileNode: 0x00060035, PageManifestNode: 0x00060037, ConflictPageMetaData: 0x00020038,
    VersionHistoryContent: 0x0006003C, VersionProxy: 0x0006003D, NoteTagSharedDefinitionContainer: 0x00120043, RevisionMetaData: 0x00020044,
    VersionHistoryMetaData: 0x00020046, ParagraphStyleObject: 0x0012004D, PictureContainer14: 0x00080039,
    InkContainer: 0x00060014, InkData: 0x0002003B, InkStroke: 0x00020047, InkStrokeProperties: 0x00120048, Author: 0x00120001,
  };
  /* Tinte (nicht in [MS-ONE] beschrieben, aus echten Dateien ermittelt) */
  const INK = {
    Data: 0x20003415, Strokes: 0x24003416, Path: 0x1C00340B, Props: 0x20003409, Time: 0x1C00341D,
    Metric: 0x1C00340A, Width: 0x1400340C, Height: 0x1400340D, Color: 0x1400340F, FitToCurve: 0x08003411, IgnorePressure: 0x08003410,
    Tip: 0x0C003412, RasterOp: 0x0C003413, Transparency: 0x0C003414, Kind: 0x14001D4E,
  };
  const GUID_X = '{598A6A8F-52C0-4BA0-93AF-AF357411A561}', GUID_Y = '{B53F9F75-04E0-4498-A7EE-C30DBB5A9011}';
  const GUID_PRESSURE = '{7307502D-F9F4-4E18-B3F2-2CE1B1A3610C}';
  /* ISF-Mehrbyte-Zahlen mit Vorzeichen */
  function multiByte(u8) {
    const out = [];
    let i = 0;
    while (i < u8.length) {
      let v = 0, sh = 1, b;
      do { b = u8[i++]; v += (b & 0x7F) * sh; sh *= 128; } while ((b & 0x80) && i < u8.length);
      out.push(v % 2 ? -Math.floor(v / 2) : Math.floor(v / 2));
    }
    return out;
  }
  const J_NAME = Object.fromEntries(Object.entries(J).map(([k, v]) => [v, k]));
  const HALF_INCH = 48; // Längen in OneNote: halbe Zoll -> Pixel bei 96 dpi

  /* Zeitstempel */
  const fileTime = (b) => { const v = V.u64(b); return v > 0 ? Math.round(v / 10000 - 11644473600000) : null; };
  const time32 = (b) => { const v = V.u32(b); return v ? (v + 315532800) * 1000 : null; }; // Sekunden seit 1.1.1980
  /* COLORREF 0x00BBGGRR, 0xFF...... = automatisch */
  const colorRef = (b) => (!b || b[3] === 0xFF) ? null : '#' + [b[0], b[1], b[2]].map(x => x.toString(16).padStart(2, '0')).join('');
  const sniff = (d) => {
    if (!d || d.length < 4) return 'application/octet-stream';
    if (d[0] === 0x89 && d[1] === 0x50) return 'image/png';
    if (d[0] === 0xFF && d[1] === 0xD8) return 'image/jpeg';
    if (d[0] === 0x47 && d[1] === 0x49) return 'image/gif';
    if (d[0] === 0x42 && d[1] === 0x4D) return 'image/bmp';
    if (d[0] === 0x52 && d[1] === 0x49 && d[8] === 0x57) return 'image/webp';
    if (d[0] === 0x3C && (d[1] === 0x73 || d[1] === 0x3F)) return 'image/svg+xml';
    if (d[0] === 0x25 && d[1] === 0x50 && d[2] === 0x44 && d[3] === 0x46) return 'application/pdf';
    if (d[0] === 0xD7 && d[1] === 0xCD && d[2] === 0xC6 && d[3] === 0x9A) return 'image/x-wmf';
    if (d[0] === 0x01 && d[1] === 0x00 && d[2] === 0x00 && d[3] === 0x00 && d[40] === 0x20 && d[41] === 0x45) return 'image/x-emf';
    return 'application/octet-stream';
  };

  class Model {
    constructor(store) { this.store = store; this.report = new Map(); this.used = new Set(); }
    note(what, n = 1) { this.report.set(what, (this.report.get(what) || 0) + n); }
    p(view, oid) { const o = oid && view.objects.get(oid); return o ? this.store.props(o) : null; }
    obj(view, oid) { return oid ? view.objects.get(oid) || null : null; }
    /* Datei-Objekt (Bild/Anhang): erst die Ansicht der Seite, sonst irgendeine Revision der Datei */
    fileObj(view, oid) { return this.obj(view, oid) || this.store.anyObject(oid, (o) => o.fileRef !== undefined); }
    /* Datei-Daten mit Grund, falls sie fehlen */
    fileOf(view, oid) {
      if (!oid) return { missing: 'kein-verweis' };
      const o = this.fileObj(view, oid);
      if (!o) return { missing: 'objekt' };
      return this.store.fileBytes(o) || { missing: 'objekt' };
    }
    /* Grund in Klartext (für Bericht und Platzhalter) */
    static why(fb) {
      switch (fb && fb.missing) {
        case 'invfdo': return 'invfdo';
        case 'extern': return 'extern';
        default: return 'fehlt';
      }
    }
    f(props, id) { const b = props && props.get(id); return b instanceof Uint8Array && b.length === 4 ? V.f32(b) : null; }
    u(props, id) { const b = props && props.get(id); return b instanceof Uint8Array ? (b.length === 4 ? V.u32(b) : b.length === 8 ? V.u64(b) : null) : (typeof b === 'number' ? b : null); }
    s(props, id) { const b = props && props.get(id); return b instanceof Uint8Array ? V.str(b) : ''; }
    list(props, id) { const v = props && props.get(id); return Array.isArray(v) ? v.filter(Boolean) : (v ? [v] : []); }

    /* Abschnitt seitenweise lesen (seit 1.18): sectionStart → für jede Seite readPage → sectionEnd.
     * So muss nie der ganze Abschnitt auf einmal umgewandelt im Speicher liegen. section() = alles auf einmal. */
    sectionStart(name) {
      const st = this.store;
      if (st.encrypted) throw new Error(`„${name}“ ist passwortgeschützt – bitte in OneNote zuerst den Kennwortschutz entfernen.`);
      const view = st.currentRevision(st.rootSpace, 1);
      if (!view) throw new Error(`„${name}“: kein lesbarer Inhalt gefunden`);
      let root = this.obj(view, view.roots.get(1));
      if (!root || root.jcid !== J.SectionNode) root = [...view.objects.values()].find(o => o.jcid === J.SectionNode) || root;
      const sp = st.props(root);
      const refs = [];
      for (const sid of this.list(sp, P.ElementChildNodes)) {
        const so = this.obj(view, sid);
        if (!so) continue;
        const pp = st.props(so);
        const spaces = this.list(pp, P.ChildGraphSpaceElementNodes);
        const metas = this.list(pp, P.MetaDataObjectsAboveGraphSpace).map(id => this.p(view, id));
        spaces.forEach((osid, i) => refs.push({ osid, meta: metas[i] }));
      }
      const meta = this.p(view, view.roots.get(2));
      return { name: (meta && this.s(meta, P.SectionDisplayName)) || name, refs };
    }
    readPage(ref) {
      try { return this.page(ref.osid, ref.meta); }
      catch (e) { this.store.warnings.push('Seite nicht lesbar: ' + e.message); this.note('Seiten, die nicht gelesen werden konnten'); return null; }
    }
    /* Absicherung (verlustfrei): FileDataStore-Einträge, die keinem Element zugeordnet wurden – z.B. das
     * XPS-Druckdokument eines Ausdrucks oder das Symbolbild eines Anhangs – werden gesammelt zurückgegeben */
    sectionEnd() {
      const st = this.store;
      const orphans = [];
      for (const guid of st.fileData.keys()) {
        if (this.used.has(guid)) continue;
        const data = st.fileDataBytes(guid);
        if (!data || !data.length) continue;
        orphans.push({ guid, data, ext: (st.fileExt && st.fileExt.get(guid)) || '', mime: sniff(data) });
      }
      if (orphans.length) this.note('Nicht zugeordnete Inhalte (auf der Seite „Nicht zugeordnete Inhalte“ gesammelt)', orphans.length);
      return { orphans, missing: this.missing || [] };
    }
    section(name) {
      const s0 = this.sectionStart(name);
      const pages = [];
      for (const ref of s0.refs) { const pg = this.readPage(ref); if (pg) pages.push(pg); }
      const end = this.sectionEnd();
      return { name: s0.name, pages, orphans: end.orphans, missing: end.missing };
    }

    page(osid, metaProps) {
      const st = this.store;
      const view = st.currentRevision(osid, 1);
      if (!view) return null;
      const rootObj = this.obj(view, view.roots.get(1));
      let pageObj = null;
      if (rootObj && rootObj.jcid === J.PageNode) pageObj = rootObj;
      else {
        const mp = rootObj ? st.props(rootObj) : null;
        const kids = this.list(mp, P.ContentChildNodes).map(id => this.obj(view, id)).filter(Boolean);
        pageObj = kids.find(o => o.jcid === J.PageNode && !st.props(o).get(P.IsConflictPage)) || kids.find(o => o.jcid === J.PageNode) || null;
      }
      if (!pageObj) pageObj = [...view.objects.values()].find(o => o.jcid === J.PageNode) || null;
      if (!pageObj) return null;
      const pp = st.props(pageObj);
      const meta = this.p(view, view.roots.get(2)) || metaProps || null;
      const page = {
        title: '', level: 0, created: null, modified: null,
        width: (this.f(pp, P.PageWidth) || 0) * HALF_INCH, items: [],
      };
      const lv = this.u(meta, P.PageLevel) ?? this.u(pp, P.PageLevel);
      if (lv) page.level = Math.max(0, Math.min(2, lv - 1));
      page.created = fileTime(pp.get(P.TopologyCreationTimeStamp)) || fileTime(meta && meta.get(P.TopologyCreationTimeStamp)) || time32(meta && meta.get(P.CreationTimeStamp)) || time32(pp.get(P.CreationTimeStamp));
      page.modified = time32(pp.get(P.LastModifiedTime)) || fileTime(pp.get(P.LastModifiedTimeStamp));
      const ctx = { view, page };
      const kids = [...this.list(pp, P.StructureElementChildNodes), ...this.list(pp, P.ElementChildNodes)];
      const seen = new Set();
      for (const id of kids) {
        if (seen.has(id)) continue;
        seen.add(id);
        const o = this.obj(view, id);
        if (!o) continue;
        const props = st.props(o);
        switch (o.jcid) {
          case J.TitleNode: {
            const parts = [];
            for (const oid of this.list(props, P.ElementChildNodes)) {
              const oo = this.obj(view, oid);
              const op = oo && st.props(oo);
              if (!op || op.get(P.IsTitleDate) || op.get(P.IsTitleTime)) continue; // Datum/Uhrzeit unter dem Titel
              const out = this.outline(ctx, oo);
              if (out) parts.push(out);
            }
            page.title = parts.map(x => x.blocks.map(b => b.content.filter(c => c.type === 'p').map(c => c.runs.map(r => r.text).join('')).join(' ')).join(' ')).join(' ').replace(/\s+/g, ' ').trim();
            page.titleOutline = parts[0] || null;
            break;
          }
          case J.OutlineNode: { const out = this.outline(ctx, o); if (out) page.items.push(out); break; }
          case J.ImageNode: { const im = this.image(ctx, o); if (im) page.items.push({ ...im, kind: im.asFile ? 'file' : 'image' }); break; }
          case J.EmbeddedFileNode: { const fi = this.file(ctx, o); if (fi) page.items.push({ ...fi, kind: 'file' }); break; }
          case J.InkContainer: { const ink = this.ink(ctx, o); if (ink) page.items.push(ink); break; }
          default: page.items.push(this.unknown(ctx, o));
        }
      }
      // Titel: TitleNode (oben); sonst die zwischengespeicherten Titel aus PageMetaData bzw. der Seite
      if (!page.title) page.title = cleanTitle(this.s(meta, P.CachedTitleStringFromPage) || this.s(meta, P.CachedTitleString) || this.s(pp, P.CachedTitleString) || '');
      else page.title = cleanTitle(page.title);
      return page;
    }

    pos(props) {
      return { x: (this.f(props, P.OffsetFromParentHoriz) || 0) * HALF_INCH, y: (this.f(props, P.OffsetFromParentVert) || 0) * HALF_INCH };
    }
    unknown(ctx, o) {
      const props = this.store.props(o);
      const name = J_NAME[o.jcid] || ON_hex(o.jcid);
      this.note('Unbekannte Elemente (' + name + ')');
      return { kind: 'unknown', jcid: o.jcid, ...this.pos(props) };
    }

    outline(ctx, o) {
      if (!o) return null;
      const props = this.store.props(o);
      const w = this.f(props, P.LayoutMaxWidth);
      const minW = this.f(props, P.LayoutMinimumOutlineWidth);
      const indRaw = props.get(P.RgOutlineIndentDistance);
      const indents = [];
      if (indRaw instanceof Uint8Array && indRaw.length >= 4) { const c = indRaw[0]; for (let i = 0; i < c && 4 + i * 4 + 4 <= indRaw.length; i++) indents.push(V.f32(indRaw.subarray(4 + i * 4, 8 + i * 4)) * HALF_INCH); }
      const out = { kind: 'outline', ...this.pos(props), w: (w || minW || 0) * HALF_INCH, userWidth: !!props.get(P.IsLayoutSizeSetByUser), indents, blocks: [] };
      for (const id of this.list(props, P.ElementChildNodes)) this.element(ctx, this.obj(ctx.view, id), 0, out.blocks);
      return out;
    }
    element(ctx, o, depth, out) {
      if (!o) return;
      const st = this.store;
      const props = st.props(o);
      if (o.jcid === J.OutlineGroup) { for (const id of this.list(props, P.ElementChildNodes)) this.element(ctx, this.obj(ctx.view, id), depth, out); return; }
      const block = { depth, list: null, tags: [], content: [] };
      const lists = this.list(props, P.ListNodes).map(id => this.p(ctx.view, id)).filter(Boolean);
      if (lists.length) {
        const l = lists[0];
        const fmt = this.s(l, P.NumberListFormat);
        block.list = { format: fmt, font: this.s(l, P.ListFont), restart: this.u(l, P.ListRestart), numbered: /[�\u0000-\u0008]/.test(fmt) || /%\d/.test(fmt) };
      }
      const tags = props.get(P.NoteTagStates);
      if (Array.isArray(tags)) {
        for (const t of tags) {
          const def = this.p(ctx.view, t.get(P.NoteTagDefinitionOid));
          const status = this.u(t, P.ActionItemStatus);
          block.tags.push({
            label: def ? this.s(def, P.NoteTagLabel) : '', shape: def ? this.u(def, P.NoteTagShape) : null,
            type: def ? this.u(def, P.ActionItemType) : null, done: status != null ? !!(status & 1) : false,
            color: def ? colorRef(def.get(P.NoteTagHighlightColor)) : null,
          });
        }
      }
      for (const id of this.list(props, P.ContentChildNodes)) {
        const c = this.obj(ctx.view, id);
        if (!c) continue;
        if (c.jcid === J.RichTextOENode) block.content.push(this.richText(ctx, c));
        else if (c.jcid === J.ImageNode) { const im = this.image(ctx, c); if (im) block.content.push({ type: im.asFile ? 'file' : 'img', ...im }); }
        else if (c.jcid === J.TableNode) block.content.push(this.table(ctx, c));
        else if (c.jcid === J.EmbeddedFileNode) { const fi = this.file(ctx, c); if (fi) block.content.push({ type: 'file', ...fi }); }
        else { this.note('Unbekannte Inhalte (' + (J_NAME[c.jcid] || ON_hex(c.jcid)) + ')'); }
      }
      out.push(block);
      for (const id of this.list(props, P.ElementChildNodes)) this.element(ctx, this.obj(ctx.view, id), depth + 1, out);
    }

    ink(ctx, o) {
      const st = this.store;
      const props = st.props(o);
      const off = this.pos(props);
      const kind = this.u(props, INK.Kind) || 1;
      const data = this.p(ctx.view, props.get(INK.Data));
      const strokes = [];
      for (const sid of this.list(data, INK.Strokes)) {
        const sp = this.p(ctx.view, sid);
        const raw = sp && sp.get(INK.Path);
        if (!(raw instanceof Uint8Array)) continue;
        const pp = this.p(ctx.view, sp.get(INK.Props)) || new Map();
        // Kanäle aus der Metrik-Tabelle (X, Y, evtl. Druck)
        const chans = [];
        const mt = pp.get(INK.Metric);
        if (mt instanceof Uint8Array && mt.length >= 32) {
          for (let i = 0; i + 32 <= mt.length; i += 32) {
            const r = new Reader(mt, i);
            chans.push({ guid: r.guid(), min: r.i32(), max: r.i32(), unit: r.u32(), res: r.f32() });
          }
        } else chans.push({ guid: GUID_X, unit: 2, res: 1000 }, { guid: GUID_Y, unit: 2, res: 1000 });
        const vals = multiByte(raw);
        const n = vals[0];
        const body = vals.slice(1, 1 + n);
        const per = Math.floor(body.length / chans.length);
        if (per < 1) continue;
        const series = chans.map((c, k) => { let acc = 0; return body.slice(k * per, (k + 1) * per).map(d => (acc += d)); });
        const ix = Math.max(0, chans.findIndex(c => c.guid === GUID_X)), iy = chans.findIndex(c => c.guid === GUID_Y) >= 0 ? chans.findIndex(c => c.guid === GUID_Y) : 1;
        const ip = chans.findIndex(c => c.guid === GUID_PRESSURE);
        const toPx = (c) => { const res = c.res || 1000; return c.unit === 1 ? 96 / res : 96 / 2.54 / res; };
        const sx = toPx(chans[ix]), sy = toPx(chans[iy] || chans[ix]);
        const pmax = ip >= 0 ? (chans[ip].max > 0 && chans[ip].max < 1e7 ? chans[ip].max : 32767) : 0;
        const pts = [];
        for (let i = 0; i < per; i++) {
          const p = ip >= 0 ? Math.max(0.05, Math.min(1, series[ip][i] / pmax / 1.5)) : 0.5;
          pts.push({ x: off.x + series[ix][i] * sx, y: off.y + series[iy][i] * sy, p: Math.round(p * 100) / 100 });
        }
        const w = (this.f(pp, INK.Width) || 100) * 96 / 2540;
        // Textmarker = Raster-Op 9 („MaskPen“); 0x08003411 ist NICHT Textmarker (steht auch bei normalen Stiften)
        const marker = pp.get(INK.RasterOp) === 9;
        let color = colorRef(pp.get(INK.Color)) || (marker ? '#ffff00' : '#000000');
        // Weiss = „automatische“ Farbe (in OneNote auf hellem Hintergrund schwarz, im dunklen Modus weiss)
        if (!marker && color === '#ffffff') color = '#000000';
        strokes.push({ pts, w: Math.round(w * 100) / 100, color, marker, pressure: ip >= 0 && !pp.get(INK.IgnorePressure), t0: fileTime(sp.get(INK.Time)) || 0 });
      }
      if (!strokes.length) return null;
      if (kind !== 1) this.note('Formen aus OneNote (als Linien übernommen)');
      return { kind: 'ink', shape: kind !== 1, strokes, ...off };
    }

    fmt(props) {
      if (!props) return {};
      const f = {};
      for (const [k, n] of [[P.Bold, 'b'], [P.Italic, 'i'], [P.Underline, 'u'], [P.Strikethrough, 's'], [P.Superscript, 'sup'], [P.Subscript, 'sub'], [P.Hyperlink, 'link'], [P.Hidden, 'hidden'], [P.MathFormatting, 'math']]) {
        if (props.has(k)) f[n] = !!props.get(k);
      }
      const font = this.s(props, P.Font); if (font) f.font = font;
      const size = props.get(P.FontSize); if (typeof size === 'number') f.size = size / 2;
      if (props.has(P.FontColor)) f.color = colorRef(props.get(P.FontColor));
      if (props.has(P.Highlight)) f.hl = colorRef(props.get(P.Highlight));
      const url = this.s(props, P.WzHyperlinkUrl); if (url) f.url = url;
      return f;
    }
    richText(ctx, o) {
      const props = this.store.props(o);
      let text = '';
      if (props.has(P.RichEditTextUnicode)) text = V.str(props.get(P.RichEditTextUnicode));
      else if (props.has(P.TextExtendedAscii)) text = V.ascii(props.get(P.TextExtendedAscii));
      const idxRaw = props.get(P.TextRunIndex);
      const bounds = [];
      if (idxRaw instanceof Uint8Array) for (let i = 0; i + 4 <= idxRaw.length; i += 4) bounds.push(V.u32(idxRaw.subarray(i, i + 4)));
      const fmts = this.list(props, P.TextRunFormatting).map(id => this.fmt(this.p(ctx.view, id)));
      const styleP = this.p(ctx.view, props.get(P.ParagraphStyle));
      const para = { type: 'p', style: styleP ? this.s(styleP, P.ParagraphStyleId) : '', base: this.fmt(styleP), runs: [], align: props.get(P.ParagraphAlignment) ?? null };
      // Absatzabstände (Punkte): direkt am Absatz oder aus der Formatvorlage
      for (const [k, n] of [[P.ParagraphSpaceBefore, 'before'], [P.ParagraphSpaceAfter, 'after'], [P.ParagraphLineSpacingExact, 'lineExact']]) {
        const v = props.has(k) ? this.f(props, k) : styleP ? this.f(styleP, k) : 0;
        if (v > 0 && v < 400) para[n] = v;
      }
      const cuts = [0, ...bounds.filter(b => b > 0 && b < text.length), text.length];
      for (let i = 0; i < cuts.length - 1; i++) {
        const t = text.slice(cuts[i], cuts[i + 1]);
        if (!t) continue;
        para.runs.push({ text: t, ...(fmts[i] || {}) });
      }
      if (!para.runs.length && text) para.runs.push({ text });
      // Hyperlinks: Feldcode U+FDDF HYPERLINK "adresse" vor dem angezeigten Text
      let link = null;
      for (const r of para.runs) {
        const m = /﷟\s*HYPERLINK\s+"([^"]*)"/.exec(r.text);
        if (m) { link = m[1]; r.text = r.text.replace(m[0], ''); }
        if (r.link || r.url) r.href = r.url || link; else if (!m) link = null;
        r.text = r.text.replace(/[﷐-﷯]/g, '');
      }
      para.runs = para.runs.filter(r => r.text && !r.hidden);
      if (para.runs.some(r => r.math)) this.note('Formeln (als Text übernommen)');
      return para;
    }
    /* Bild. Die Bilddaten liegen im FileDataStore (Verweis <ifndf>{GUID}). Ein ImageNode kann zwei Quellen haben:
     *  - WebPictureContainer14 (0x200034C8 → PictureContainer14 0x00080039): das sichtbare Bild – bei
     *    „Als Ausdruck einfügen“ das PNG der jeweiligen Seite
     *  - PictureContainer (0x20001C3F): bei Ausdrucken das ganze Druckdokument (.xps, für alle Seiten gleich,
     *    im Browser nicht darstellbar), sonst das Bild selbst
     * Regel: zuerst 0x200034C8, dann 0x20001C3F; massgebend ist, was die Magic Bytes sagen. Sind beide Bilder,
     * gewinnt das grössere (verlustfrei). Ist keine Quelle ein Bild, wird das Element als Anhang geführt.
     * Nicht verwendete Nicht-Bild-Quellen (z.B. das XPS) bleiben übrig und landen bei „Nicht zugeordnete Inhalte“. */
    image(ctx, o) {
      const props = this.store.props(o);
      const cands = [], lost = [];
      for (const pid of [P.WebPictureContainer14, P.PictureContainer]) {
        const ref = props.get(pid);
        if (!ref) continue;
        const b = this.fileOf(ctx.view, ref);
        if (b.data) cands.push(b); else lost.push(b);
      }
      const isImg = (b) => !!(b && b.data && /^image\//.test(sniff(b.data)));
      const imgs = cands.filter(isImg);
      // Browser-taugliche Formate (PNG/JPEG/GIF/BMP/WebP/SVG) vor WMF/EMF; bei Gleichstand die grössere Fassung
      const rank = (b) => (/^image\/x-/.test(sniff(b.data)) ? 0 : 1);
      let fb = imgs.length ? imgs.reduce((a, b) => (rank(b) > rank(a) || (rank(b) === rank(a) && b.data.length > a.data.length) ? b : a)) : null;
      for (const b of imgs) if (b.guid) this.used.add(b.guid);   // alle Bild-Fassungen gelten als zugeordnet
      // Online-Video: Bild mit Kind-Objekt 0x00060058 (Adresse 0x1C0035F3), Titel 0x1C00360A
      let video = null, videoTitle = this.s(props, 0x1C00360A) || '';
      for (const cid of this.list(props, P.ContentChildNodes)) {
        const c = this.p(ctx.view, cid);
        const url = c && this.s(c, 0x1C0035F3);
        if (url) video = url;
      }
      if (video) this.note('Online-Videos (als Vorschaubild mit Abspielknopf)');
      // Angezeigt wird die Layout-Grösse (PictureWidth ist die Grösse der Bilddatei, z.B. bei Ausdrucken 3/4 davon).
      // Beim Video ist die Layout-Grösse die des Players – sichtbar ist das Vorschaubild.
      const pw = this.f(props, P.PictureWidth), ph = this.f(props, P.PictureHeight);
      const lw = this.f(props, P.LayoutMaxWidth), lh = this.f(props, P.LayoutMaxHeight);
      const useLayout = !video && lw > 0 && lh > 0;
      const w = ((useLayout ? lw : pw || lw) || 0) * HALF_INCH;
      const h = ((useLayout ? lh : ph || lh) || 0) * HALF_INCH;
      // Von OneNote erkannter Bildtext (OCR) – als Suchtext
      const ocr = (this.s(props, P.RichEditTextUnicode) || '').replace(/\u0000/g, '').trim();
      const name = this.s(props, P.ImageFilename);
      if (!fb) {
        const other = cands.find(b => b.data);
        if (other) {
          // keine Bildquelle, aber Daten (z.B. nur ein Druckdokument): als Anhang führen, nicht als Bild
          this.note('Bild-Elemente ohne Bildquelle (als Anhang übernommen)');
          if (other.guid) this.used.add(other.guid);
          const ext = other.ext || '';
          return { asFile: true, name: (name || 'Ausdruck').replace(/\.[^.]+$/, '') + ext, data: other.data, mime: sniff(other.data), ...this.pos(props) };
        }
        // Grund merken: <invfdo> (OneNote hatte selbst keine Daten), <file> (Begleitordner fehlt), sonst Verweis ins Leere
        const lb = lost.find(b => b.missing === 'extern') || lost.find(b => b.missing === 'invfdo') || lost[0] || { missing: 'kein-verweis' };
        const why = Model.why(lb);
        (this.missing || (this.missing = [])).push({ kind: 'Bild', why, detail: lb.missing, external: lb.external || '', guid: lb.guid || '', page: ctx.page && ctx.page.title || '' });
        return { missing: true, why, external: lb.external || '', w, h, video, videoTitle, ocr, name, alt: this.s(props, P.ImageAltText), ...this.pos(props) };
      }
      const type = sniff(fb.data);
      if (type === 'image/x-wmf' || type === 'image/x-emf') this.note('Bilder im Format WMF/EMF (Browser können sie nicht anzeigen)');
      const printout = this.printout(ctx, props, cands.filter(b => !isImg(b)));
      if (printout) this.note('Ausdrucke (Seitenbild, Druckdokument und Quelldatei übernommen)');
      return { data: fb.data, mime: type, ext: fb.ext || '', w, h, alt: this.s(props, P.ImageAltText), name, video, videoTitle, ocr, ...this.pos(props), background: !!props.get(P.IsBackground), ...(printout ? { printout } : {}) };
    }
    /* Ausdruck (seit 1.22 verlustfrei): zum Seitenbild gehören das Druckdokument (.xps, PictureContainer 0x8003A),
     * die Quelldatei (z.B. .pdf, 0x200035C1 → Dateiobjekt 0x80060), Seitennummer und die Kennung des Ausdrucks.
     * Bis 1.21 landeten Druckdokument und Quelldatei auf „Nicht zugeordnete Inhalte“. */
    printout(ctx, props, others) {
      const out = {};
      const xps = others.find(b => b.data);
      if (xps) { out.xps = { data: xps.data, ext: xps.ext || '.xps', guid: xps.guid || '' }; if (xps.guid) this.used.add(xps.guid); }
      const srcRef = props.get(0x200035C1);
      if (srcRef) {
        const b = this.fileOf(ctx.view, srcRef);
        if (b.data) { out.src = { data: b.data, ext: b.ext || '', guid: b.guid || '' }; if (b.guid) this.used.add(b.guid); }
      }
      const u32 = (id) => { const v = props.get(id); return v instanceof Uint8Array && v.length >= 4 ? V.u32(v) : null; };
      const page = u32(P.DisplayedPageNumber), idx = u32(0x14001DF9), grp = props.get(0x1C001D84);
      if (!out.xps && !out.src && page == null && !(grp instanceof Uint8Array)) return null;
      if (page != null) out.page = page;
      if (idx != null) out.idx = idx;
      if (grp instanceof Uint8Array && grp.length === 16) out.group = [...grp].map(x => x.toString(16).padStart(2, '0')).join('');
      if (props.get(0x08001D85) === true) out.flag = true;
      return out;
    }
    file(ctx, o) {
      const props = this.store.props(o);
      const fb = this.fileOf(ctx.view, props.get(P.EmbeddedFileContainer));
      const name = this.s(props, P.EmbeddedFileName) || 'Anhang' + ((fb && fb.ext) || '');
      this.note('Dateianhänge');
      if (!fb.data) {
        const why = Model.why(fb);
        (this.missing || (this.missing = [])).push({ kind: 'Anhang', why, detail: fb.missing, external: fb.external || '', guid: fb.guid || '', name, page: ctx.page && ctx.page.title || '' });
        return { name, missing: true, why, external: fb.external || '', ...this.pos(props) };
      }
      if (fb.guid) this.used.add(fb.guid);
      // Symbolbild des Anhangs (PictureContainer, von OneNote erzeugt) gehört zum Anhang – nicht „nicht zugeordnet“
      const icon = props.get(P.PictureContainer) && this.fileOf(ctx.view, props.get(P.PictureContainer));
      if (icon && icon.guid) this.used.add(icon.guid);
      return { name, data: fb.data, mime: sniff(fb.data), ...this.pos(props) };
    }
    table(ctx, o) {
      const props = this.store.props(o);
      const wr = props.get(P.TableColumnWidths);
      const cols = [];
      if (wr instanceof Uint8Array && wr.length >= 1) { const c = wr[0]; for (let i = 0; i < c && 1 + i * 4 + 4 <= wr.length; i++) cols.push(V.f32(wr.subarray(1 + i * 4, 5 + i * 4)) * HALF_INCH); }
      const t = { type: 'table', cols, borders: props.get(P.TableBordersVisible) !== false, rows: [] };
      for (const rid of this.list(props, P.ElementChildNodes)) {
        const ro = this.obj(ctx.view, rid);
        if (!ro) continue;
        const row = [];
        for (const cid of this.list(this.store.props(ro), P.ElementChildNodes)) {
          const co = this.obj(ctx.view, cid);
          if (!co) continue;
          const cp = this.store.props(co);
          const blocks = [];
          for (const eid of this.list(cp, P.ElementChildNodes)) this.element(ctx, this.obj(ctx.view, eid), 0, blocks);
          row.push({ blocks, shade: colorRef(cp.get(P.CellShadingColor)) });
        }
        t.rows.push(row);
      }
      return t;
    }
  }
  const ON_hex = (n) => hex(n);
  /* Seitentitel: OneNote speichert ohne Titelzeile den Anfang der Seite – mit weichen Zeilenumbrüchen (U+000B),
     die im Browser als Kästchen erscheinen. Wie OneNote: die erste nicht leere Zeile, ohne Steuerzeichen. */
  function cleanTitle(t) {
    const lines = String(t || '').replace(/\u0000/g, '').split(/[\u000b\r\n\u2028\u2029]+/).map(x => x.replace(/[\u0001-\u001f\u007f\ufff9-\ufffc]/g, ' ').replace(/\s+/g, ' ').trim()).filter(Boolean);
    return lines[0] || '';
  }

  /* Inhaltsverzeichnis eines Notizbuchs (.onetoc2): Reihenfolge und Farben */
  function readToc(store) {
    const out = { color: null, entries: [] };
    try {
      const view = store.currentRevision(store.rootSpace, 1);
      if (!view) return out;
      let root = view.objects.get(view.roots.get(1));
      if (!root) return out;
      const rp = store.props(root);
      out.color = colorRef(rp.get(0x14001CBE));
      const kids = (rp.get(0x24001CF6) || []).map(id => view.objects.get(id)).filter(Boolean).map(o => store.props(o));
      for (const k of kids) {
        const name = k.get(0x1C001D6B) instanceof Uint8Array ? V.str(k.get(0x1C001D6B)) : '';
        if (!name) continue;
        const ord = k.get(0x14001CB9) instanceof Uint8Array ? V.u32(k.get(0x14001CB9)) : 0;
        out.entries.push({ name, order: ord, color: colorRef(k.get(0x14001CBE)) });
      }
      out.entries.sort((x, y) => x.order - y.order);
    } catch (e) { /* Reihenfolge ist nicht wichtig */ }
    return out;
  }

  return { Reader, inflate, readCab, lzxDecompress, OneStore, Model, readToc, multiByte, V, P, P_NAME, J, J_NAME, INK, HALF_INCH, hex, guidStr, FND, FND_NAME, utf16, latin1, sniff, cleanTitle, normGuid, FT_ONE, FT_TOC, lzxStream, openCab, inflate };
})();

if (typeof module !== 'undefined') module.exports = ON;
