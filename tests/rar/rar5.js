// RAR5-Schreiber (nur „Speichern“, Methode 0) für Tests – Format nach rarlab „RAR 5.0 archive format“
const fs = require('fs');
const CRC = new Uint32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = (b, c = 0xFFFFFFFF) => { for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 255] ^ (c >>> 8); return c; };
const vint = (v) => { const o = []; v = BigInt(v); do { let b = Number(v & 0x7Fn); v >>= 7n; if (v) b |= 0x80; o.push(b); } while (v); return Buffer.from(o); };
const u32 = (v) => { const b = Buffer.alloc(4); b.writeUInt32LE(v >>> 0); return b; };
function header(type, flags, fields) {
  const body = Buffer.concat([vint(type), vint(flags), ...fields]);
  const sz = vint(body.length);
  const c = (crc32(Buffer.concat([sz, body])) ^ 0xFFFFFFFF) >>> 0;
  return Buffer.concat([u32(c), sz, body]);
}
class Rar5Writer {
  constructor(path, opts = {}) {
    this.fd = fs.openSync(path, 'w');
    fs.writeSync(this.fd, Buffer.from([0x52, 0x61, 0x72, 0x21, 0x1A, 0x07, 0x01, 0x00]));
    fs.writeSync(this.fd, header(1, 0, [vint(opts.solid ? 0x0004 : 0)]));
    this.mtime = Math.floor(Date.now() / 1000);
  }
  dir(name) {
    const nb = Buffer.from(name, 'utf8');
    fs.writeSync(this.fd, header(2, 0, [vint(0x0001 | 0x0002), vint(0), vint(0x10), u32(this.mtime), vint(0), vint(0), vint(nb.length), nb]));
  }
  file(name, data) {
    const nb = Buffer.from(name, 'utf8');
    const dc = (crc32(data) ^ 0xFFFFFFFF) >>> 0;
    fs.writeSync(this.fd, header(2, 0x0002, [vint(data.length), vint(0x0002 | 0x0004), vint(data.length), vint(0x20), u32(this.mtime), u32(dc), vint(0), vint(0), vint(nb.length), nb]));
    fs.writeSync(this.fd, data);
  }
  close() { fs.writeSync(this.fd, header(5, 0, [vint(0)])); fs.closeSync(this.fd); }
}
module.exports = { Rar5Writer, crc32 };
// „Komprimiert“ (RAR5-Algorithmus, nur Literale mit 8-Bit-Codes): echte Unpack-Pfade in unrar (Fenster = Wörterbuch),
// Tabellen so gewählt, dass sie genau 48 Byte lang sind → die Daten folgen bytegenau.
const TABLE48 = (() => {
  const bits = [];
  const put = (v, n) => { for (let i = n - 1; i >= 0; i--) bits.push((v >> i) & 1); };
  const lv = new Array(20).fill(0); lv[8] = 1; lv[18] = 2; lv[19] = 2;      // Code: 8='0', 18='10', 19='11'
  for (const l of lv) put(l, 4);
  for (let i = 0; i < 256; i++) put(0, 1);                                    // 256 × Länge 8
  for (const n of [57, 57]) { put(3, 2); put(n - 11, 7); }                   // Nullen (19)
  for (let i = 0; i < 6; i++) { put(2, 2); put(10 - 3, 3); }                 // Nullen (18), zusammen 174
  if (bits.length !== 384) throw new Error('Tabelle ' + bits.length);
  const b = Buffer.alloc(48); bits.forEach((x, i) => { if (x) b[i >> 3] |= 0x80 >> (i & 7); }); return b;
})();
function packLiteral(data, blockData = 4 << 20) {
  const parts = [];
  for (let off = 0; off < data.length || (off === 0 && !data.length); off += blockData) {
    const n = Math.min(blockData, data.length - off), last = off + n >= data.length;
    const size = 48 + n, flags = (8 - 1) | (2 << 3) | (last ? 0x40 : 0) | 0x80;
    const cs = (0x5a ^ flags ^ size ^ (size >> 8) ^ (size >> 16)) & 255;
    parts.push(Buffer.from([flags, cs, size & 255, (size >> 8) & 255, (size >> 16) & 255]), TABLE48, Buffer.from(data.buffer, data.byteOffset + off, n));
    if (!data.length) break;
  }
  return Buffer.concat(parts);
}
Rar5Writer.prototype.packed = function (name, data, { dict = 8, solid = false, method = 3 } = {}) {
  const nb = Buffer.from(name, 'utf8');
  const dc = (crc32(data) ^ 0xFFFFFFFF) >>> 0;
  const pk = packLiteral(data);
  const ci = 0 | (method << 7) | (dict << 10) | (solid ? 0x40 : 0);
  fs.writeSync(this.fd, header(2, 0x0002, [vint(pk.length), vint(0x0002 | 0x0004), vint(data.length), vint(0x20), u32(this.mtime), u32(dc), vint(ci), vint(0), vint(nb.length), nb]));
  fs.writeSync(this.fd, pk);
};
module.exports.packLiteral = packLiteral;
