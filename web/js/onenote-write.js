'use strict';
/* OneNote-Dateien schreiben (Beta): Abschnitt (.one), Inhaltsverzeichnis (.onetoc2) und Notizbuch-Paket (.onepkg).
 * Aufbau nach [MS-ONESTORE] und [MS-ONE], nachgebildet an echten Dateien von OneNote (Microsoft 365).
 * Teil 1: Binärformat (unabhängig vom Browser, auch unter Node testbar)
 * Teil 2: KnowledgeTree-Seiten -> OneNote-Seiten (braucht die gerenderte Seite im Browser) */

const OneWrite = (() => {
  /* ================================================================ Hilfen */
  const rnd = (n) => { const a = new Uint8Array(n); (globalThis.crypto || require('crypto').webcrypto).getRandomValues(a); return a; };
  const newGuid = () => {
    const b = rnd(16);
    b[7] = (b[7] & 0x0F) | 0x40; b[8] = (b[8] & 0x3F) | 0x80;
    const h = [...b].map(x => x.toString(16).padStart(2, '0'));
    // Darstellung wie in der Datei gelesen (Data1-3 little endian)
    return `{${h[3]}${h[2]}${h[1]}${h[0]}-${h[5]}${h[4]}-${h[7]}${h[6]}-${h[8]}${h[9]}-${h.slice(10).join('')}}`.toUpperCase();
  };
  const guidBytes = (g) => {
    const s = g.replace(/[{}-]/g, '');
    const b = new Uint8Array(16);
    const hx = (i) => parseInt(s.substr(i * 2, 2), 16);
    b[0] = hx(3); b[1] = hx(2); b[2] = hx(1); b[3] = hx(0); b[4] = hx(5); b[5] = hx(4); b[6] = hx(7); b[7] = hx(6);
    for (let i = 8; i < 16; i++) b[i] = hx(i);
    return b;
  };
  const NIL = '{00000000-0000-0000-0000-000000000000}';
  const VH_CONTEXT = '{7111497F-1B6B-4209-9491-C98B04CF4C5A}';

  let CRC_T = null;
  const crc32 = (u8, crc = 0) => {
    if (!CRC_T) { CRC_T = new Uint32Array(256); for (let i = 0; i < 256; i++) { let c = i; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; CRC_T[i] = c >>> 0; } }
    let c = (crc ^ 0xFFFFFFFF) >>> 0;
    for (let i = 0; i < u8.length; i++) c = CRC_T[(c ^ u8[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  };
  /* MsoCrc32Compute ([MS-OSHARED] 2.4.3.2): .onetoc2 rechnet seine Prüfsummen damit (Polynom 0xAF, nicht gespiegelt,
   * Start 0, ohne Abschluss-XOR) – .one dagegen mit CRC-32 nach RFC 3309 (oben). An echten OneNote-Dateien geprüft. */
  let MSO_T = null;
  const msoCrc32 = (u8, crc = 0) => {
    if (!MSO_T) { MSO_T = new Uint32Array(256); for (let i = 0; i < 256; i++) { let v = (i << 24) >>> 0; for (let k = 0; k < 8; k++) v = (v & 0x80000000) ? ((v << 1) ^ 0xAF) >>> 0 : (v << 1) >>> 0; MSO_T[i] = v >>> 0; } }
    let c = crc >>> 0;
    for (let i = 0; i < u8.length; i++) c = ((c << 8) ^ MSO_T[((c >>> 24) ^ u8[i]) & 0xFF]) >>> 0;
    return c >>> 0;
  };
  /* MD5 nach RFC 1321 (für schreibgeschützte Objekte) */
  const md5 = (msg) => {
    const K = new Uint32Array(64), S = [7, 12, 17, 22, 5, 9, 14, 20, 4, 11, 16, 23, 6, 10, 15, 21];
    for (let i = 0; i < 64; i++) K[i] = Math.floor(Math.abs(Math.sin(i + 1)) * 2 ** 32) >>> 0;
    const len = msg.length, nb = ((len + 8) >>> 6) + 1;
    const m = new Uint8Array(nb * 64);
    m.set(msg); m[len] = 0x80;
    const dv = new DataView(m.buffer);
    dv.setUint32(nb * 64 - 8, (len * 8) >>> 0, true); dv.setUint32(nb * 64 - 4, Math.floor(len / 0x20000000), true);
    let a0 = 0x67452301, b0 = 0xefcdab89, c0 = 0x98badcfe, d0 = 0x10325476;
    for (let o = 0; o < m.length; o += 64) {
      let A = a0, B = b0, C = c0, D = d0;
      for (let i = 0; i < 64; i++) {
        let F, g;
        if (i < 16) { F = (B & C) | (~B & D); g = i; } else if (i < 32) { F = (D & B) | (~D & C); g = (5 * i + 1) % 16; } else if (i < 48) { F = B ^ C ^ D; g = (3 * i + 5) % 16; } else { F = C ^ (B | ~D); g = (7 * i) % 16; }
        F = (F + A + K[i] + dv.getUint32(o + g * 4, true)) >>> 0;
        A = D; D = C; C = B;
        const sh = S[(i >> 4) * 4 + (i & 3)];
        B = (B + ((F << sh) | (F >>> (32 - sh)))) >>> 0;
      }
      a0 = (a0 + A) >>> 0; b0 = (b0 + B) >>> 0; c0 = (c0 + C) >>> 0; d0 = (d0 + D) >>> 0;
    }
    const out = new Uint8Array(16), ov = new DataView(out.buffer);
    ov.setUint32(0, a0, true); ov.setUint32(4, b0, true); ov.setUint32(8, c0, true); ov.setUint32(12, d0, true);
    return out;
  };
  const utf16z = (s) => { const b = new Uint8Array((s.length + 1) * 2); for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); b[i * 2] = c & 0xFF; b[i * 2 + 1] = c >> 8; } return b; };
  const utf16 = (s) => utf16z(s).subarray(0, s.length * 2);
  const CP1252_EXTRA = '€\u0081‚ƒ„…†‡ˆ‰Š‹Œ\u008DŽ\u008F\u0090‘’“”•–—˜™š›œ\u009DžŸ';
  const toCp1252 = (s) => {
    const b = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) {
      const c = s.charCodeAt(i);
      if (c < 0x80 || (c >= 0xA0 && c <= 0xFF)) b[i] = c;
      else { const k = CP1252_EXTRA.indexOf(s[i]); if (k < 0) return null; b[i] = 0x80 + k; }
    }
    return b;
  };
  const f32 = (v) => { const b = new Uint8Array(4); new DataView(b.buffer).setFloat32(0, v, true); return b; };
  const u32b = (v) => { const b = new Uint8Array(4); new DataView(b.buffer).setUint32(0, v >>> 0, true); return b; };
  const u64b = (v) => { const b = new Uint8Array(8); const dv = new DataView(b.buffer); dv.setUint32(0, Number(BigInt(v) & 0xFFFFFFFFn), true); dv.setUint32(4, Number(BigInt(v) >> 32n), true); return b; };
  const fileTime = (ms) => u64b((BigInt(Math.round(ms)) + 11644473600000n) * 10000n);
  const time32 = (ms) => u32b(Math.max(0, Math.floor(ms / 1000) - 315532800));
  /* kleines PNG (RGBA, „stored“-Deflate, ohne Canvas – läuft auch in Node): px(x, y) → [r, g, b, a] */
  const pngImage = (w, h, px) => {
    const raw = new Uint8Array(h * (w * 4 + 1));
    for (let y = 0, o = 0; y < h; y++) { raw[o++] = 0; for (let x = 0; x < w; x++) { const c = px(x, y); raw[o++] = c[0]; raw[o++] = c[1]; raw[o++] = c[2]; raw[o++] = c[3]; } }
    const be = (v) => [(v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255];
    const z = [0x78, 0x01];
    for (let i = 0; ;) { const n = Math.min(65535, raw.length - i), last = i + n >= raw.length; z.push(last ? 1 : 0, n & 255, n >> 8, ~n & 255, (~n >> 8) & 255); for (let k = 0; k < n; k++) z.push(raw[i + k]); i += n; if (last) break; }
    let a = 1, b = 0; for (let i = 0; i < raw.length; i++) { a = (a + raw[i]) % 65521; b = (b + a) % 65521; }
    z.push(...be(((b << 16) | a) >>> 0));
    const out = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];
    const chunk = (type, data) => { const t = [...type].map(c => c.charCodeAt(0)), td = new Uint8Array([...t, ...data]); out.push(...be(data.length), ...td, ...be(crc32(td))); };
    chunk('IHDR', [...be(w), ...be(h), 8, 6, 0, 0, 0]);
    chunk('IDAT', z);
    chunk('IEND', []);
    return new Uint8Array(out);
  };
  /* Symbolbild für Dateianhänge (OneNote verlangt eines, [MS-ONE] 2.2.34): Blatt mit Eselsohr, Farbband je Dateityp.
   * 64 × 64 Pixel wie bei OneNote; eigene Zeichnung. */
  const ICON_COLORS = [[/^(pdf)$/, [217, 48, 37]], [/^(docx?|odt|rtf|txt|md)$/, [43, 87, 154]], [/^(xlsx?|xlsm|csv|ods)$/, [33, 115, 70]],
    [/^(pptx?|odp)$/, [210, 71, 38]], [/^(zip|rar|7z|gz|tar|cab|onepkg)$/, [138, 109, 59]], [/^(png|jpe?g|gif|bmp|tiff?|webp|svg|heic)$/, [123, 79, 160]],
    [/^(mp3|wav|m4a|ogg|mp4|mov|avi|mkv|webm)$/, [15, 123, 138]]];
  const fileIcon = (ext) => {
    const e = String(ext || '').replace(/^\./, '').toLowerCase();
    const band = (ICON_COLORS.find(([re]) => re.test(e)) || [0, [95, 107, 122]])[1];
    const L = 12, R = 51, T = 4, B = 59, F = 14;   // Blatt und Eselsohr
    return pngImage(64, 64, (x, y) => {
      if (x < L || x > R || y < T || y > B) return [0, 0, 0, 0];
      const dx = x - (R - F), dy = y - T;
      if (dx > dy) return [0, 0, 0, 0];                                          // abgeschnittene Ecke
      if (dx >= 0 && dy <= F && (dx === dy || dx === 0 || dy === F)) return [122, 122, 122, 255];   // Eselsohr-Kanten
      if (dx > 0 && dy < F) return [228, 228, 228, 255];                          // Eselsohr-Fläche
      if (x === L || x === R || y === T || y === B) return [122, 122, 122, 255];  // Rand
      if (y >= 40 && y <= 52) return [...band, 255];                              // Farbband
      if (x >= 18 && x <= 45 && [16, 22, 28, 34].includes(y) && !(y === 16 && x > R - F - 4)) return [170, 170, 170, 255];   // Textzeilen
      return [255, 255, 255, 255];
    });
  };
  /* Platzhalter für ein Bild ohne Daten (OneNote verlangt bei jedem Bild Bilddaten) */
  const missingPicture = () => pngImage(8, 8, (x, y) => (x === 0 || y === 0 || x === 7 || y === 7) ? [190, 190, 190, 255] : [235, 235, 235, 255]);

  const colorRef = (hex) => { const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex || ''); return m ? new Uint8Array([parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16), 0]) : new Uint8Array([0, 0, 0, 0xFF]); };

  class Out {
    constructor(cap = 4096) { this.b = new Uint8Array(cap); this.dv = new DataView(this.b.buffer); this.n = 0; }
    need(k) { if (this.n + k <= this.b.length) return; let c = this.b.length * 2; while (c < this.n + k) c *= 2; const nb = new Uint8Array(c); nb.set(this.b.subarray(0, this.n)); this.b = nb; this.dv = new DataView(nb.buffer); }
    u8(v) { this.need(1); this.b[this.n++] = v & 0xFF; return this; }
    u16(v) { this.need(2); this.dv.setUint16(this.n, v, true); this.n += 2; return this; }
    u32(v) { this.need(4); this.dv.setUint32(this.n, v >>> 0, true); this.n += 4; return this; }
    u64(v) { this.bytes(u64b(v)); return this; }
    bytes(a) { this.need(a.length); this.b.set(a, this.n); this.n += a.length; return this; }
    guid(g) { return this.bytes(guidBytes(g)); }
    eg(x) { this.guid(x ? x.g : NIL); return this.u32(x ? x.n : 0); }
    zeros(k) { this.need(k); this.b.fill(0, this.n, this.n + k); this.n += k; return this; }
    align(a) { const r = this.n % a; if (r) this.zeros(a - r); return this; }
    done() { return this.b.slice(0, this.n); }
  }

  /* Ausgabe in Stücken (seit 1.18): kleine Daten in einen Puffer, grosse (Bilder, Anhänge) werden nur als Teil
   * vermerkt – ohne Kopie, auch als Blob. Am Ende ein Uint8Array (nur Bytes) oder ein Blob (spart Speicher). */
  class SegOut {
    constructor() { this.parts = []; this.cur = new Out(64 * 1024); this.base = 0; }
    get n() { return this.base + this.cur.n; }
    flush() { if (this.cur.n) { this.parts.push(this.cur.b.subarray(0, this.cur.n)); this.base += this.cur.n; this.cur = new Out(64 * 1024); } }
    big(x) { const len = x instanceof Uint8Array ? x.length : x.size; this.flush(); this.parts.push(x); this.base += len; return this; }
    bytes(a) { if (a.length >= 65536) return this.big(a); this.cur.bytes(a); return this; }
    data(x) { return x instanceof Uint8Array ? this.bytes(x) : this.big(x); }
    u8(v) { this.cur.u8(v); return this; } u16(v) { this.cur.u16(v); return this; } u32(v) { this.cur.u32(v); return this; }
    u64(v) { this.cur.u64(v); return this; } guid(g) { this.cur.guid(g); return this; }
    zeros(k) { this.cur.zeros(k); return this; }
    align(a) { const r = this.n % a; if (r) this.zeros(a - r); return this; }
    result() {
      this.flush();
      if (this.parts.every(x => x instanceof Uint8Array)) {
        const out = new Uint8Array(this.base); let o = 0;
        for (const x of this.parts) { out.set(x, o); o += x.length; }
        return out;
      }
      return new Blob(this.parts);
    }
  }
  const sizeOf = (x) => x instanceof Uint8Array ? x.length : x.size;

  /* ================================================================ Objekte und Eigenschaften */
  const T = { noData: 1, bool: 2, u8: 3, u16: 4, b4: 5, b8: 6, bytes: 7, oid: 8, oids: 9, osid: 10, osids: 11, ctx: 12, ctxs: 13, propArr: 16, propSet: 17 };
  const ptype = (id) => (id >>> 26) & 0x1F;
  /* Objekt: { oid:{g,n}, jcid, props:[[id,value]], ro, file } */
  class Obj {
    constructor(space, jcid, props = []) { this.space = space; this.jcid = jcid; this.props = props; this.oid = space ? space.nextOid() : null; this.ro = !!(jcid & 0x00100000); }
    set(id, v) { const i = this.props.findIndex(p => p[0] === id); if (i >= 0) this.props[i][1] = v; else this.props.push([id, v]); return this; }
  }
  /* Eigenschaften -> ObjectSpaceObjectPropSet (Ströme + Eigenschaften + Füllbytes) */
  function propSetBytes(props, table) {
    const oids = [], osids = [], ctxs = [];
    const cid = (x) => {
      if (!x) return 0;
      const idx = table.get(x.g);
      if (idx === undefined) throw new Error('GUID fehlt in der Tabelle: ' + x.g);
      if (x.n > 255) throw new Error('Objektnummer zu gross');
      return ((idx << 8) | x.n) >>> 0;
    };
    const body = new Out(256);
    const writeSet = (list) => {
      body.u16(list.length);
      for (const [id, v] of list) {
        let pid = id & 0x7FFFFFFF;
        if (ptype(id) === T.bool && v) pid |= 0x80000000;
        body.u32(pid >>> 0);
      }
      for (const [id, v] of list) {
        switch (ptype(id)) {
          case T.noData: case T.bool: break;
          case T.u8: body.u8(v); break;
          case T.u16: body.u16(v); break;
          case T.b4: body.bytes(v instanceof Uint8Array ? v : u32b(v)); break;
          case T.b8: body.bytes(v); break;
          case T.bytes: body.u32(v.length).bytes(v); break;
          case T.oid: oids.push(cid(v && v.oid)); break;
          case T.oids: body.u32(v.length); for (const o of v) oids.push(cid(o.oid)); break;
          case T.osid: osids.push(cid(v)); break;
          case T.osids: body.u32(v.length); for (const o of v) osids.push(cid(o)); break;
          case T.ctx: ctxs.push(cid(v)); break;
          case T.ctxs: body.u32(v.length); for (const o of v) ctxs.push(cid(o)); break;
          case T.propArr: body.u32(v.length); if (v.length) { body.u32(0x44000000 | 0); for (const s of v) writeSet(s); } break;
          case T.propSet: writeSet(v); break;
          default: throw new Error('Eigenschaftstyp ' + ptype(id));
        }
      }
    };
    writeSet(props);
    const o = new Out(body.n + 64);
    // Strom-Köpfe ([MS-ONESTORE] 2.6.2–2.6.4): OsidStreamNotPresent im OID-Kopf, wenn weder OSIDs noch Kontexte;
    // ExtendedStreamsPresent im OID- UND im OSID-Kopf, wenn Kontexte folgen (fehlte bis 1.21 im OID-Kopf – OneNote las
    // darum den PageManifestNode jeder Seite falsch: „Seite kann nicht geöffnet werden“)
    const hasOsid = osids.length > 0 || ctxs.length > 0, ext = ctxs.length ? 0x40000000 : 0;
    o.u32((oids.length & 0xFFFFFF) | (hasOsid ? 0 : 0x80000000) | ext);
    for (const c of oids) o.u32(c);
    if (hasOsid) { o.u32((osids.length & 0xFFFFFF) | ext); for (const c of osids) o.u32(c); }
    if (ctxs.length) { o.u32(ctxs.length & 0xFFFFFF); for (const c of ctxs) o.u32(c); }
    o.bytes(body.done());
    o.align(8);
    // fHasOsidReferences: der OSID-Strom ist da (auch wenn nur Kontexte folgen – so setzt es OneNote)
    return { data: o.done(), hasOids: oids.length > 0, hasOsids: hasOsid };
  }
  /* alle GUIDs, die ein Objekt braucht */
  function collectGuids(obj, set) {
    if (obj.oid) set.add(obj.oid.g);
    const walk = (list) => {
      for (const [id, v] of list) {
        const t = ptype(id);
        if (t === T.oid && v) set.add(v.oid.g);
        else if (t === T.oids) v.forEach(o => set.add(o.oid.g));
        else if (t === T.osid || t === T.ctx) { if (v) set.add(v.g); }
        else if (t === T.osids || t === T.ctxs) v.forEach(o => set.add(o.g));
        else if (t === T.propArr) v.forEach(walk);
        else if (t === T.propSet) walk(v);
      }
    };
    walk(obj.props);
  }
  function refsOf(obj) {
    const out = [];
    const walk = (list) => { for (const [id, v] of list) { const t = ptype(id); if (t === T.oid && v) out.push(v); else if (t === T.oids) out.push(...v); else if (t === T.propArr) v.forEach(walk); else if (t === T.propSet) walk(v); } };
    walk(obj.props);
    return out;
  }

  /* Objektraum (Abschnitt, Seite, Inhaltsverzeichnis) */
  class Space {
    constructor() { this.gosid = { g: newGuid(), n: 1 }; this.objs = []; this.roots = []; this._g = newGuid(); this._n = 10; this.files = []; }
    nextOid() { if (this._n > 250) { this._g = newGuid(); this._n = 1; } return { g: this._g, n: this._n++ }; }
    add(jcid, props) { const o = new Obj(this, jcid, props); this.objs.push(o); return o; }
    root(role, obj) { this.roots.push([role, obj]); }
  }

  /* ================================================================ Datei zusammensetzen */
  const FND = {
    OSMRoot: 0x004, OSMListRef: 0x008, OSMListStart: 0x00C, RevListRef: 0x010, RevListStart: 0x014, RevStart4: 0x01B, RevEnd: 0x01C, RevStart6: 0x01E,
    GidStart: 0x021, GidStart2: 0x022, GidEntry: 0x024, GidEnd: 0x028, DeclRef: 0x02D, RootRef2: 0x059, RootRef3: 0x05A,
    DeclFile3: 0x072, FdsListRef: 0x090, FdsObjRef: 0x094, Decl2: 0x0A4, GroupListRef: 0x0B0, GroupStart: 0x0B4, GroupEnd: 0x0B8, RevStart7: 0x01F,
    DataSig: 0x08C, RoDecl2: 0x0C4,
  };
  class FileBuilder {
    constructor(legacy) {
      this.legacy = legacy;
      this.out = new SegOut();
      this.out.zeros(1024);
      this.listId = 0x10;
      this.counts = [];
    }
    chunk(bytes) { this.out.align(8); const stp = this.out.n; this.out.bytes(bytes); return { stp, cb: bytes.length }; }
    /* Dateiknoten: id, Grundtyp, Verweis, Inhalt */
    node(id, body, ref) {
      const o = new Out(64);
      const base = ref ? ref.base : 0;
      const refLen = ref ? 8 : 0;
      const size = 4 + refLen + (body ? body.length : 0);
      if (size > 0x1FFF) throw new Error(`Dateiknoten 0x${id.toString(16)} zu gross (${size} Byte)`);
      if (ref && ref.stp > 0xFFFFFFFE) throw new Error('OneNote-Abschnitt zu gross (über 4 GB)');
      // [MS-ONESTORE] 2.4.3: StpFormat 1 (4 Byte), CbFormat 0 (4 Byte; bei BaseType 0 MUSS 0 sein),
      // Bit 31 (Reserved) MUSS 1 sein – bis 1.20 fehlte es, OneNote lehnte die Abschnitte ab.
      const h = (id & 0x3FF) | ((size & 0x1FFF) << 10) | (1 << 23) | (0 << 25) | ((base & 0xF) << 27) | 0x80000000;
      o.u32(h >>> 0);
      if (ref) { o.u32(ref.stp < 0 ? 0xFFFFFFFF : ref.stp); o.u32(ref.cb); }
      if (body) o.bytes(body);
      return o.done();
    }
    /* ObjectInfoDependencyOverridesFND ([MS-ONESTORE] 2.5.20/2.6.10): MUSS in .one nach jeder Objektgruppe stehen.
     * Ohne Überschreibungen; crc = Prüfsumme über die cRef aller Deklarationen davor (je 4 Byte), .one: CRC-32,
     * .onetoc2: MsoCrc32. Verweis fcrNil (8 Byte), Daten direkt im Knoten – genau wie OneNote es schreibt. */
    overrides(crefs) {
      const b = new Uint8Array(crefs.length * 4), dv = new DataView(b.buffer);
      crefs.forEach((c, i) => dv.setUint32(i * 4, c >>> 0, true));
      const crc = this.legacy ? msoCrc32(b) : crc32(b);
      const o = new Out(32);
      const size = 4 + 9 + 12;
      o.u32(((0x084) | (size << 10) | (0 << 23) | (2 << 25) | (1 << 27) | 0x80000000) >>> 0);
      o.u32(0xFFFFFFFF).u32(0xFFFFFFFF).u8(0);   // ref = fcrNil (StpFormat 0: 8 Byte, CbFormat 2: 1 Byte)
      o.u32(0).u32(0).u32(crc);                  // c8BitOverrides, c32BitOverrides, crc
      return o.done();
    }
    /* Dateiknoten-Liste; lange Listen in Fragmente zu höchstens ~48 KB (OneNote selbst: bis ~58 KB je Fragment),
     * verkettet über nextFragment, nFragmentSequence 0, 1, 2 … – gezählt wird im Transaktions-Log die ganze Liste */
    list(nodes) {
      const id = this.listId++;
      const MAX = 48 * 1024;
      const parts = [];
      let cur = [], size = 36;
      for (const n of nodes) {
        if (cur.length && size + n.length > MAX) { parts.push(cur); cur = []; size = 36; }
        cur.push(n); size += n.length;
      }
      parts.push(cur);
      const frags = parts.map((list, k) => {
        const o = new Out(256);
        o.u32(0xF5F7F4C4).u32(0xA4567AB1).u32(id).u32(k);
        for (const n of list) o.bytes(n);
        // nicht letztes Fragment: ChunkTerminatorFND (0x0FF) beendet die Knoten – sonst läse OneNote die Füllnullen
        // als Knoten (so auch in echten Dateien; zählt nicht im Transaktions-Log)
        if (k + 1 < parts.length) o.u32(0x0FF | (4 << 10) | 0x80000000);
        o.align(8);
        const at = o.n;
        o.u32(0xFFFFFFFF).u32(0xFFFFFFFF).u32(0); // nextFragment = fcrNil (beim letzten)
        o.u32(0x8233BA4B).u32(0x8BC215C3);
        return { b: o.done(), at };
      });
      // Lage der Fragmente vorausberechnen (sie werden direkt hintereinander geschrieben, je 8-Byte-ausgerichtet)
      this.out.align(8);
      let pos = this.out.n;
      const where = frags.map(f => { const p = pos; pos += f.b.length; pos += (8 - pos % 8) % 8; return p; });
      frags.forEach((f, k) => {
        if (k + 1 < frags.length) { const dv = new DataView(f.b.buffer, f.b.byteOffset); dv.setUint32(f.at, where[k + 1], true); dv.setUint32(f.at + 4, 0, true); dv.setUint32(f.at + 8, frags[k + 1].b.length, true); }
      });
      const first = frags.map(f => this.chunk(f.b))[0];
      this.counts.push([id, nodes.length]);
      return first;
    }
    b(fn) { const o = new Out(64); fn(o); return o.done(); }

    /* ein Objektraum mit einer Revision */
    /* Objekte einer Revision: GUID-Tabelle + Deklarationen (+ cRef-Liste für die Prüfsumme) */
    decls(objs, roots) {
      const legacy = this.legacy;
      const guids = new Set();
      for (const o of objs) collectGuids(o, guids);
      const table = new Map([...guids].map((g, i) => [g, i]));
      const refCount = new Map();
      for (const o of objs) for (const r of refsOf(o)) refCount.set(r, (refCount.get(r) || 0) + 1);
      for (const [, o] of roots) refCount.set(o, (refCount.get(o) || 0) + 1);
      const cid = (x) => ((table.get(x.g) << 8) | x.n) >>> 0;
      const decls = [], crefs = [];
      for (const o of objs) {
        const cRef = Math.min(255, Math.max(1, refCount.get(o) || 1));
        crefs.push(cRef);
        if (o.file) {
          decls.push(this.node(FND.DeclFile3, this.b(w => {
            w.u32(cid(o.oid)).u32(o.jcid).u8(cRef);
            const ref = utf16(o.file.ref), ext = utf16(o.file.ext || '');
            w.u32(o.file.ref.length).bytes(ref).u32((o.file.ext || '').length).bytes(ext);
          })));
          continue;
        }
        const ps = propSetBytes(o.props, table);
        const ref = this.chunk(ps.data);
        if (legacy) {
          // ObjectDeclarationWithRefCountFND (nur Inhaltsverzeichnis): jci 10 Bit, Flags in Bit 16/17
          decls.push(this.node(FND.DeclRef, this.b(w => {
            w.u32(cid(o.oid));
            w.u16(o.jcid & 0x3FF);
            w.u16((ps.hasOids ? 1 : 0) | (ps.hasOsids ? 2 : 0)).u16(0);
            w.u8(cRef);
          }), { ...ref, base: 1 }));
        } else {
          decls.push(this.node(o.ro ? FND.RoDecl2 : FND.Decl2, this.b(w => {
            w.u32(cid(o.oid)).u32(o.jcid).u8((ps.hasOids ? 1 : 0) | (ps.hasOsids ? 2 : 0)).u8(cRef);
            if (o.ro) w.bytes(md5(ps.data));
          }), { ...ref, base: 1 }));
        }
      }
      const tableNodes = [];
      tableNodes.push(legacy ? this.node(FND.GidStart, new Uint8Array([0])) : this.node(FND.GidStart2));
      for (const [g, i] of table) tableNodes.push(this.node(FND.GidEntry, this.b(w => w.u32(i).guid(g))));
      tableNodes.push(this.node(FND.GidEnd));
      return { tableNodes, decls, crefs, cid };
    }
    /* eine Revision (.one): Objektgruppe, Überschreibungen, Wurzeln; ctx = Kontext (RevisionManifestStart7) */
    revision(objs, roots, ctx) {
      const d = this.decls(objs, roots);
      const sig = this.node(FND.DataSig, this.b(w => w.eg({ g: newGuid(), n: 1 })));
      const rid = { g: newGuid(), n: 1 }, gid = { g: newGuid(), n: 0 };   // Gruppen-ID mit n = 0 wie bei OneNote
      const group = this.list([this.node(FND.GroupStart, this.b(w => w.eg(gid))), ...d.tableNodes, sig, ...d.decls, this.node(FND.GroupEnd)]);
      const out = [ctx ? this.node(FND.RevStart7, this.b(w => w.eg(rid).eg(null).u32(1).u16(0).eg(ctx))) : this.node(FND.RevStart6, this.b(w => w.eg(rid).eg(null).u32(1).u16(0)))];
      out.push(this.node(FND.GroupListRef, this.b(w => w.eg(gid)), { ...group, base: 2 }));
      out.push(this.overrides(d.crefs));
      for (const [role, o] of roots) out.push(this.node(FND.RootRef3, this.b(w => w.eg(o.oid).u32(role))));
      out.push(this.node(FND.RevEnd));
      return out;
    }

    /* ein Objektraum mit einer Revision (Seiten zusätzlich mit der Versionsverlauf-Revision im Kontext) */
    space(sp, fileStore) {
      const legacy = this.legacy;
      const rev = [this.node(FND.RevListStart, this.b(w => w.eg(sp.gosid).u32(0)))];
      if (legacy) {
        const d = this.decls(sp.objs, sp.roots);
        const sig = this.node(FND.DataSig, this.b(w => w.eg({ g: newGuid(), n: 1 })));
        const rid = { g: newGuid(), n: 1 };
        rev.push(this.node(FND.RevStart4, this.b(w => w.eg(rid).eg(null).u64(BigInt(Date.now()) * 10000n + 116444736000000000n).u32(1).u16(0))));
        rev.push(...d.tableNodes, sig, ...d.decls);
        rev.push(this.overrides(d.crefs));   // wie OneNote (in .onetoc2 erlaubt, nicht Pflicht)
        for (const [role, o] of sp.roots) rev.push(this.node(FND.RootRef2, this.b(w => w.u32(d.cid(o.oid)).u32(role))));
        rev.push(this.node(FND.RevEnd));
      } else {
        rev.push(...this.revision(sp.objs, sp.roots, null));
        for (const c of sp.contexts || []) rev.push(...this.revision(c.objs, c.roots, c.ctx));
      }
      const revList = this.list(rev);
      const spList = this.list([this.node(FND.OSMListStart, this.b(w => w.eg(sp.gosid))), this.node(FND.RevListRef, null, { ...revList, base: 2 })]);
      return this.node(FND.OSMListRef, this.b(w => w.eg(sp.gosid)), { ...spList, base: 2 });
    }

    /* Bilder und Anhänge: FileDataStoreObject – die Daten (Uint8Array oder Blob) werden nicht kopiert */
    fileStore(files) {
      if (!files.length) return null;
      const nodes = [];
      for (const f of files) {
        const len = sizeOf(f.data);
        this.out.align(8);
        const stp = this.out.n;
        this.out.guid('{BDE316E7-2665-4511-A4C4-8D4D0B7A9EAC}').u64(len).u32(0).u64(0).data(f.data).align(8).guid('{71FBA722-0F79-4A0B-BB13-899256426B24}');
        const ref = { stp, cb: this.out.n - stp };
        nodes.push(this.node(FND.FdsObjRef, this.b(w => w.guid(f.guid)), { ...ref, base: 1 }));
      }
      return this.node(FND.FdsListRef, null, { ...this.list(nodes), base: 2 });
    }

    finish(rootSpace, spaces, files, fileType) {
      const spaceNodes = spaces.map(sp => this.space(sp));
      const rootIdx = spaces.indexOf(rootSpace);
      const rootNodes = [spaceNodes[rootIdx], this.node(FND.OSMRoot, this.b(w => w.eg(rootSpace.gosid)))];
      spaceNodes.forEach((n, i) => { if (i !== rootIdx) rootNodes.push(n); });
      const fds = this.fileStore(files || []);
      if (fds) rootNodes.push(fds);
      const rootList = this.list(rootNodes);
      // Transaktions-Log: eine Transaktion mit allen Listen
      // [MS-ONESTORE] 2.3.3.2: der Abschluss-Eintrag (srcID 1) trägt die Prüfsumme über ALLE Einträge davor
      // (ohne ihn selbst – bis 1.20 floss sein srcID mit ein, OneNote verwarf darum die Transaktion);
      // .one: CRC-32 (RFC 3309), .onetoc2: MsoCrc32
      const log = new Out(this.counts.length * 8 + 32);
      for (const [id, c] of this.counts) log.u32(id).u32(c);
      const entries = log.done();
      log.u32(1).u32(this.legacy ? msoCrc32(entries) : crc32(entries));
      log.u32(0).u32(0).u32(0); // nextFragment = fcrZero
      const txl = this.chunk(log.done());
      this.out.align(8);
      const total = this.out.n;
      // Kopf
      const h = new Out(1024);
      h.guid(fileType).guid(newGuid()).guid(NIL).guid('{109ADD3F-911B-49F5-A5D0-1791EDC8AED8}');
      const ffv = this.legacy ? 0x1B : 0x2A;
      h.u32(ffv).u32(ffv).u32(ffv).u32(ffv);
      h.u32(0).u32(0);                 // fcrLegacyFreeChunkList (fcrZero)
      h.u32(0xFFFFFFFF).u32(0);        // fcrLegacyTransactionLog (fcrNil)
      h.u32(1);                        // cTransactionsInLog
      h.u32(0);                        // cbLegacyExpectedFileLength
      h.u64(0);                        // rgbPlaceholder
      h.u32(0xFFFFFFFF).u32(0);        // fcrLegacyFileNodeListRoot (fcrNil)
      h.u32(0);                        // cbLegacyFreeSpaceInFreeChunkList
      h.u8(0).u8(0).u8(0).u8(0);       // fNeedsDefrag, fRepairedFile, fNeedsGarbageCollect, fHasNoEmbeddedFileObjects
      h.guid(NIL);                     // guidAncestor
      h.u32(0);                        // crcName
      h.u64(0xFFFFFFFFFFFFFFFFn).u32(0); // fcrHashedChunkList (fcrNil)
      h.u64(txl.stp).u32(txl.cb);      // fcrTransactionLog
      h.u64(rootList.stp).u32(rootList.cb); // fcrFileNodeListRoot
      h.u64(0xFFFFFFFFFFFFFFFFn).u32(0); // fcrFreeChunkList (fcrNil)
      h.u64(total);                    // cbExpectedFileLength
      h.u64(0);                        // cbFreeSpaceInFreeChunkList
      h.guid(newGuid());               // guidFileVersion
      h.u64(1);                        // nFileVersionGeneration
      h.guid(newGuid());               // guidDenyReadFileVersion
      h.u32(0);                        // grfDebugLogFlags
      h.u64(0).u32(0);                 // fcrDebugLog
      h.u64(0).u32(0);                 // fcrAllocVerificationFreeChunkList
      h.u32(0x3AB8F666).u32(0x3AB8F666).u32(0x3AB8F666).u32(0x3AB8F666); // bnCreated … bnNewestWritten
      h.zeros(1024 - h.n);
      this.out.flush();
      this.out.parts[0].set(h.done(), 0);   // erster Teil beginnt mit den 1024 reservierten Kopf-Bytes
      return this.out.result();             // Uint8Array – oder Blob, wenn Bilder als Blob übergeben wurden
    }
  }

  /* ================================================================ OneNote-Inhalte [MS-ONE] */
  const P = {
    LayoutTightLayout: 0x08001C00, PageWidth: 0x14001C01, PageHeight: 0x14001C02, OutlineElementChildLevel: 0x0C001C03,
    Bold: 0x08001C04, Italic: 0x08001C05, Underline: 0x08001C06, Strikethrough: 0x08001C07, Superscript: 0x08001C08, Subscript: 0x08001C09,
    Font: 0x1C001C0A, FontSize: 0x10001C0B, FontColor: 0x14001C0C, Highlight: 0x14001C0D, RgOutlineIndentDistance: 0x1C001C12,
    OffsetFromParentHoriz: 0x14001C14, OffsetFromParentVert: 0x14001C15, LayoutMaxWidth: 0x14001C1B, LayoutMaxHeight: 0x14001C1C,
    ContentChildNodes: 0x24001C1F, ElementChildNodes: 0x24001C20, RichEditTextUnicode: 0x1C001C22, NotebookManagementEntityGuid: 0x1C001C30,
    OutlineElementRTL: 0x08001C34, LanguageID: 0x14001C3B, LayoutAlignmentInParent: 0x14001C3E, PictureContainer: 0x20001C3F,
    PageMarginTop: 0x14001C4C, PageMarginBottom: 0x14001C4D, PageMarginLeft: 0x14001C4E, PageMarginRight: 0x14001C4F,
    TopologyCreationTimeStamp: 0x18001C65, LayoutAlignmentSelf: 0x14001C84, IsTitleTime: 0x08001C87, IsBoilerText: 0x08001C88,
    PortraitPage: 0x08001C8E, EnforceOutlineStructure: 0x08001C91, EditRootRTL: 0x08001C92, CannotBeSelected: 0x08001CB2,
    IsTitleText: 0x08001CB4, IsTitleDate: 0x08001CB5, IsLayoutSizeSetByUser: 0x08001CBD, LayoutResolveChildCollisions: 0x08001CDC,
    IsReadOnly: 0x08001CDE, LayoutMinimumOutlineWidth: 0x14001CEC, LayoutCollisionPriority: 0x14001CF1, CachedTitleString: 0x1C001CF3,
    DescendantsCannotBeMoved: 0x08001CF9, RichEditTextLangID: 0x10001CFE, LayoutTightAlignment: 0x08001CFF, Charset: 0x0C001D01,
    CreationTimeStamp: 0x14001D09, Deletable: 0x08001D0C, PageMarginOriginX: 0x14001D0F, PageMarginOriginY: 0x14001D10, IsBackground: 0x08001D13,
    StructureElementChildNodes: 0x24001D5F, ChildGraphSpaceElementNodes: 0x2C001D63, AuthorName: 0x1C001D75, LastModifiedTimeStamp: 0x18001D77,
    AuthorOriginal: 0x20001D78, AuthorMostRecent: 0x20001D79, LastModifiedTime: 0x14001D7A, SchemaRevisionInOrderToRead: 0x14001D82,
    ImageFilename: 0x1C001DD7, AuthorInitials: 0x1C001DF8, PageLevel: 0x14001DFF, TextRunIndex: 0x1C001E12, TextRunFormatting: 0x24001E13,
    Hyperlink: 0x08001E14, Hidden: 0x08001E16, HyperlinkProtected: 0x08001E19, WzHyperlinkUrl: 0x1C001E20, ImageAltText: 0x1C001E58,
    MathFormatting: 0x08003401, ParagraphStyle: 0x2000342C, ParagraphSpaceBefore: 0x1400342E, ParagraphSpaceAfter: 0x1400342F,
    ParagraphLineSpacingExact: 0x14003430, ParagraphStyleId: 0x1C00345A, ParagraphAlignment: 0x0C003477, TextExtendedAscii: 0x1C003498,
    PictureWidth: 0x140034CD, PictureHeight: 0x140034CE, VersionHistoryGraphSpaceContextNodes: 0x3400347B,
    // Ausdruck (1.22, wie in den echten Dateien des Users): Seitenbild + Druckdokument + Quelldatei
    WebPictureContainer14: 0x200034C8, DisplayedPageNumber: 0x14003480, PrintPageIndex: 0x14001DF9, PrintGroup: 0x1C001D84,
    IsPrintout: 0x08001D85, PrintSource: 0x200035C1,
    // Dateianhang (EmbeddedFileNode)
    EmbeddedFileContainer: 0x20001D9B, EmbeddedFileName: 0x1C001D9C, SourceFilepath: 0x1C001D9D,
    // Tabellen
    RowCount: 0x14001D57, ColumnCount: 0x14001D58, TableBordersVisible: 0x08001D5E, TableColumnWidths: 0x1C001D66, TableColumnsLocked: 0x1C001D7D, CellShadingColor: 0x14001E26,
    // ohne Namen in [MS-ONE], Werte wie in echten Dateien
    X1400348B: 0x1400348B, X080034DD: 0x080034DD, X080034AA: 0x080034AA, X0C003452: 0x0C003452, X08003405: 0x08003405, X08003406: 0x08003406,
    X14001C9E: 0x14001C9E, X14001C9F: 0x14001C9F, X14001CA0: 0x14001CA0, X14001CA1: 0x14001CA1, X14001D5C: 0x14001D5C, X14003653: 0x14003653,
    X1C001D5D: 0x1C001D5D, X1C001E30: 0x1C001E30,
    // Tinte
    InkData: 0x20003415, InkStrokes: 0x24003416, InkPath: 0x1C00340B, InkProps: 0x20003409, InkTime: 0x1C00341D, InkGuid: 0x1C00341A,
    InkMetric: 0x1C00340A, InkWidth: 0x1400340C, InkHeight: 0x1400340D, InkColor: 0x1400340F, InkFitToCurve: 0x08003411, InkIgnorePressure: 0x08003410, InkTip: 0x0C003412,
    InkRasterOp: 0x0C003413, InkKind: 0x14001D4E, InkLang: 0x1000341B, InkX0C00341C: 0x0C00341C, InkX0C003610: 0x0C003610,
    // Inhaltsverzeichnis
    TocChildren: 0x24001CF6, TocFileName: 0x1C001D6B, TocOrder: 0x14001CB9, TocColor: 0x14001CBE, TocGuid: 0x1C001D94,
  };
  const J = {
    SectionNode: 0x00060007, PageSeriesNode: 0x00060008, PageNode: 0x0006000B, OutlineNode: 0x0006000C, OutlineElementNode: 0x0006000D,
    RichTextOENode: 0x0006000E, ImageNode: 0x00060011, InkContainer: 0x00060014, TitleNode: 0x0006002C, PageManifestNode: 0x00060037,
    PageMetaData: 0x00020030, SectionMetaData: 0x00020031, InkData: 0x0002003B, RevisionMetaData: 0x00020044, InkStroke: 0x00020047,
    Author: 0x00120001, InkStrokeProperties: 0x00120048, ParagraphStyleObject: 0x0012004D, PictureContainer14: 0x00080039, TocEntry: 0x00020001,
    TableNode: 0x00060022, TableRowNode: 0x00060023, TableCellNode: 0x00060024,
    EmbeddedFileNode: 0x00060035, EmbeddedFileContainer: 0x00080036, XpsContainer: 0x0008003A, PrintSourceFile: 0x00080060,
    VersionHistoryContent: 0x0006003C, VersionHistoryMetaData: 0x00020046,
  };
  const HI = 48;                // px je halber Zoll
  const HIMETRIC = 2540 / 96;   // HIMETRIC je px
  const LANG = 2055;            // Deutsch (Schweiz)
  const GUID_X = '{598A6A8F-52C0-4BA0-93AF-AF357411A561}', GUID_Y = '{B53F9F75-04E0-4498-A7EE-C30DBB5A9011}', GUID_P = '{7307502D-F9F4-4E18-B3F2-2CE1B1A3610C}';
  const AUTHOR = 'KnowledgeTree', INITIALS = 'KT';

  /* Standard-Formatvorlagen (Absatz) wie OneNote */
  const PARA_STYLES = {
    p: { font: 'Calibri', size: 11 }, h1: { font: 'Calibri Light', size: 16, color: '#1e4e79' }, h2: { font: 'Calibri Light', size: 14, color: '#2e75b5' },
    h3: { font: 'Calibri', size: 12, color: '#1f3763' }, h4: { font: 'Calibri', size: 12, color: '#2f5496', i: true }, h5: { font: 'Calibri', size: 11, color: '#2e75b5' },
    h6: { font: 'Calibri', size: 11, color: '#2e75b5', i: true }, PageTitle: { font: 'Calibri Light', size: 20 }, PageDateTime: { font: 'Calibri', size: 10, color: '#767676' },
    cite: { font: 'Calibri', size: 9, color: '#595959' }, quote: { font: 'Calibri', size: 11, color: '#595959', i: true }, code: { font: 'Consolas', size: 11 },
  };

  /* ISF: vorzeichenbehaftete Mehrbyte-Zahlen */
  function isfPath(chans) {
    const o = new Out(64);
    const put = (v) => { let u = v < 0 ? (-v) * 2 + 1 : v * 2; do { let b = u % 128; u = Math.floor(u / 128); if (u) b |= 0x80; o.u8(b); } while (u); };
    const total = chans.reduce((a, c) => a + c.length, 0);
    put(total);
    for (const c of chans) { let prev = 0; for (const v of c) { put(v - prev); prev = v; } }
    return o.done();
  }
  function metric(withPressure) {
    const o = new Out(96);
    o.guid(GUID_X).u32(0x80000000).u32(0x7FFFFFFF).u32(2).bytes(f32(1000));
    o.guid(GUID_Y).u32(0x80000000).u32(0x7FFFFFFF).u32(2).bytes(f32(1000));
    if (withPressure) o.guid(GUID_P).u32(0).u32(32767).u32(0).bytes(f32(0));
    return o.done();
  }

  /* Seite (Zwischenformat) -> Objektraum
   * page = { title, created, modified, level, items: [
   *   { kind:'outline', x, y, w, paras:[{ depth, style, align, runs:[{text,b,i,u,s,sup,sub,color,hl,font,size,href,math}], image? }] },
   *   { kind:'image', x, y, w, h, fileGuid, ext, name },
   *   { kind:'ink', strokes:[{ pts:[{x,y,p}], w, color, marker }] } ] }   (Koordinaten in px, Seitenursprung) */
  function buildPage(page, files) {
    const sp = new Space();
    const now = page.modified || Date.now();
    const T32 = time32(now), created = page.created || now;
    const author = sp.add(J.Author, [[P.AuthorInitials, utf16z(INITIALS)], [P.AuthorName, utf16z(AUTHOR)], [P.X1C001E30, new Uint8Array(2)]]);
    const manifest = sp.add(J.PageManifestNode);
    const meta = sp.add(J.PageMetaData, [
      [P.CachedTitleString, utf16z(page.title || '')], [P.NotebookManagementEntityGuid, guidBytes(newGuid())], [P.PageLevel, u32b((page.level || 0) + 1)],
      [P.SchemaRevisionInOrderToRead, u32b(40)], [P.X1400348B, u32b(40)], [P.TopologyCreationTimeStamp, fileTime(created)],
    ]);
    const revMeta = sp.add(J.RevisionMetaData, [[P.AuthorMostRecent, author], [P.LastModifiedTimeStamp, fileTime(now)]]);
    const styles = new Map(), runFmts = new Map();
    const paraStyle = (id, fmt = {}) => {
      const d = { ...(PARA_STYLES[id] || PARA_STYLES.p), ...fmt };
      const key = id + JSON.stringify(d);
      if (styles.has(key)) return styles.get(key);
      const o = sp.add(J.ParagraphStyleObject, [
        [P.ParagraphStyleId, utf16z(id)], [P.Bold, !!d.b], [P.Italic, !!d.i], [P.Underline, false], [P.FontColor, colorRef(d.color)],
        [P.ParagraphSpaceBefore, f32(d.before || 0)], [P.ParagraphSpaceAfter, f32(d.after || 0)], [P.ParagraphLineSpacingExact, f32(d.lineExact || 0)],
        [P.Strikethrough, false], [P.Highlight, colorRef(null)], [P.Subscript, false], [P.Superscript, false],
        [P.Font, utf16z(d.font || 'Calibri')], [P.FontSize, Math.round((d.size || 11) * 2)],
      ]);
      styles.set(key, o);
      return o;
    };
    const runFmt = (r) => {
      const props = [[P.Hidden, false], [P.X080034AA, false], [P.Hyperlink, !!r.href], [P.HyperlinkProtected, false], [P.LanguageID, u32b(LANG)], [P.Charset, 0], [P.X0C003452, 0], [P.MathFormatting, false], [P.X08003405, false], [P.X08003406, false]];
      if (r.b != null) props.push([P.Bold, !!r.b]);
      if (r.i != null) props.push([P.Italic, !!r.i]);
      if (r.u) props.push([P.Underline, true]);
      if (r.s) props.push([P.Strikethrough, true]);
      if (r.sup) props.push([P.Superscript, true]);
      if (r.sub) props.push([P.Subscript, true]);
      if (r.color) props.push([P.FontColor, colorRef(r.color)]);
      if (r.hl) props.push([P.Highlight, colorRef(r.hl)]);
      if (r.font) props.push([P.Font, utf16z(r.font)]);
      if (r.size) props.push([P.FontSize, Math.round(r.size * 2)]);
      const key = JSON.stringify(props.map(([k, v]) => [k, v instanceof Uint8Array ? [...v] : v]));
      if (runFmts.has(key)) return runFmts.get(key);
      const o = sp.add(J.ParagraphStyleObject, props);
      runFmts.set(key, o);
      return o;
    };
    const richText = (para, extra = []) => {
      // Hyperlinks als Feld: U+FDDF HYPERLINK "adresse" + angezeigter Text
      const runs = [];
      for (const r0 of para.runs) {
        if (!r0.text) continue;
        // Zeilenumbruch im Absatz = U+000B wie bei OneNote (LF ist in RichEditTextUnicode verboten, [MS-ONE] 2.2.20)
        const r = /[\r\n]/.test(r0.text) ? { ...r0, text: r0.text.replace(/\r\n?|\n/g, '\u000B') } : r0;
        if (r.href) runs.push({ ...r, text: `﷟HYPERLINK "${r.href}"` });
        runs.push(r);
      }
      const text = runs.map(r => r.text).join('');
      const props = [[P.LastModifiedTime, T32], [P.ParagraphStyle, paraStyle(para.style || 'p', para.styleFmt)], ...extra];
      if (para.align === 'center') props.push([P.ParagraphAlignment, 1]);
      else if (para.align === 'right') props.push([P.ParagraphAlignment, 2]);
      props.push([P.RichEditTextLangID, LANG]);
      if (runs.length > 1) {
        const idx = new Out(runs.length * 4);
        let pos = 0;
        for (let i = 0; i < runs.length - 1; i++) { pos += runs[i].text.length; idx.u32(pos); }
        props.push([P.TextRunIndex, idx.done()]);
      }
      props.push([P.TextRunFormatting, (runs.length ? runs : [{}]).map(runFmt)]);
      const cp = toCp1252(text);
      if (cp && !/[﷟]/.test(text)) props.push([P.TextExtendedAscii, cp]);
      else props.push([P.RichEditTextUnicode, utf16(text)]);
      props.push([P.X080034DD, true]);
      return sp.add(J.RichTextOENode, props);
    };
    // gleiche Bilddaten (Symbolbilder, Platzhalter) nur einmal im FileDataStore – wie OneNote
    const shared = (key, make) => {
      const m = files.shared || (files.shared = new Map());
      if (!m.has(key)) { const g = newGuid(); files.push({ guid: g, data: make() }); m.set(key, g); }
      return m.get(key);
    };
    const picture = (guid, ext) => { const pc = sp.add(J.PictureContainer14); pc.file = { ref: `<ifndf>${guid}`, ext }; return pc; };
    const imageNode = (im, pos) => {
      // [MS-ONE] 2.2.24: LanguageID und PictureContainer MÜSSEN gesetzt sein; Lage nur direkt auf der Seite
      const props = [[P.LastModifiedTime, T32], [P.LanguageID, u32b(LANG)]];
      if (pos) props.push([P.OffsetFromParentHoriz, f32(im.x / HI)], [P.OffsetFromParentVert, f32(im.y / HI)]);
      const pr = im.print && (im.print.xpsGuid || im.print.srcGuid || im.print.page != null) ? im.print : null;
      if (pr) {
        // Ausdruck wie OneNote: Seitennummer, Kennung, Quelldatei (0x80060); das Druckdokument (.xps) steht im
        // PictureContainer, das Seitenbild dann im WebPictureContainer14
        if (pr.idx != null) props.push([P.PrintPageIndex, u32b(pr.idx)]);
        if (pr.page != null) props.push([P.DisplayedPageNumber, u32b(pr.page)]);
        if (/^[0-9a-f]{32}$/.test(pr.group || '')) props.push([P.PrintGroup, new Uint8Array(pr.group.match(/../g).map(x => parseInt(x, 16)))]);
        props.push([P.IsPrintout, true]);
        if (pr.srcGuid) { const so = sp.add(J.PrintSourceFile); so.file = { ref: `<ifndf>${pr.srcGuid}`, ext: pr.srcExt || '.pdf' }; props.push([P.PrintSource, so]); }
      }
      const main = im.fileGuid ? picture(im.fileGuid, im.ext || '.png') : picture(shared('missing', missingPicture), '.png');
      if (pr && pr.xpsGuid) {
        const xo = sp.add(J.XpsContainer); xo.file = { ref: `<ifndf>${pr.xpsGuid}`, ext: '.xps' };
        props.push([P.PictureContainer, xo]);
      } else props.push([P.PictureContainer, main]);
      props.push([P.LayoutMaxWidth, f32(im.w / HI)], [P.LayoutMaxHeight, f32(im.h / HI)], [P.PictureWidth, f32(im.w / HI)], [P.PictureHeight, f32(im.h / HI)]);
      if (im.name) props.push([P.ImageFilename, utf16z(im.name)]);
      if (im.alt) props.push([P.ImageAltText, utf16z(im.alt)]);
      if (im.background && pos) props.push([P.IsBackground, true]);   // KnowledgeTree-Hintergrund = OneNote „Bild als Hintergrund“
      if (im.ocr) props.push([P.RichEditTextUnicode, utf16z(im.ocr)]);   // erkannter Bildtext (OCR) zurück an OneNote
      if (pr && pr.xpsGuid) props.push([P.WebPictureContainer14, main]);
      if (im.video) {
        // wie OneNote: Bild mit Kind-Objekt 0x00060058 (Adresse), Titel am Bild
        if (im.title) props.push([0x1C00360A, utf16z(im.title)]);
        const v = sp.add(0x00060058, [[P.LastModifiedTime, T32], [0x1C0035F3, utf16z(im.video)], [0x140035F2, u32b(1)], [0x08003622, false], [0x0800353E, false]]);
        props.push([P.ContentChildNodes, [v]]);
      }
      return sp.add(J.ImageNode, props);
    };
    // Dateianhang (verlustfrei, seit 1.13): EmbeddedFileNode → EmbeddedFileContainer mit den Bytes im FileDataStore
    // [MS-ONE] 2.2.34: Symbolbild (PictureContainer), LanguageID und RichEditTextUnicode (ohne CR/LF) MÜSSEN gesetzt sein –
    // Aufbau wie bei OneNote (64-px-Symbol, Name als Text, Ausrichtung 1 in einer Gliederung)
    const fileNode = (f, pos) => {
      const name = String(f.name || 'Anhang').replace(/[\r\n]+/g, ' ');
      const ext = f.ext || (/\.[^.\\/]+$/.exec(name) || [''])[0];
      const props = [[P.LastModifiedTime, T32]];
      if (pos) props.push([P.OffsetFromParentHoriz, f32((f.x || 0) / HI)], [P.OffsetFromParentVert, f32((f.y || 0) / HI)]);
      if (f.fileGuid) {
        const ec = sp.add(J.EmbeddedFileContainer);
        ec.file = { ref: `<ifndf>${f.fileGuid}`, ext: f.ext || '' };
        props.push([P.EmbeddedFileContainer, ec]);
      }
      const icon = picture(shared('icon' + String(ext).toLowerCase(), () => fileIcon(ext)), '.png');
      props.push([P.PictureWidth, f32(64 / HI)], [P.PictureHeight, f32(64 / HI)], [P.PictureContainer, icon],
        [P.EmbeddedFileName, utf16z(name)], [P.RichEditTextUnicode, utf16z(name)], [P.SourceFilepath, utf16z(name)], [P.LanguageID, u32b(LANG)]);
      if (!pos) props.push([P.LayoutAlignmentInParent, u32b(1)], [P.LayoutAlignmentSelf, u32b(1)]);
      return sp.add(J.EmbeddedFileNode, props);
    };
    const oe = (content, kids, extra = []) => {
      const props = [[P.LastModifiedTime, T32], [P.AuthorMostRecent, author], [P.AuthorOriginal, author], [P.CreationTimeStamp, time32(created)], [P.OutlineElementChildLevel, 1]];
      if (content) props.push([P.ContentChildNodes, [content]]);
      if (kids && kids.length) props.push([P.ElementChildNodes, kids]);
      props.push(...extra, [P.OutlineElementRTL, false]);
      return sp.add(J.OutlineElementNode, props);
    };
    const indents = new Uint8Array([4, 3, 0, 0, ...f32(0.5), ...f32(0), ...f32(0.75), ...f32(0.75)]);
    /* echte OneNote-Tabelle: t = { cols: [px], rows: [[{ paras: [...], shade }]], borders } */
    // [MS-ONE] 2.2.22/2.3.x: 1–255 Spalten, mindestens eine Zeile, jede Zeile genau so viele Zellen wie Spalten,
    // Spaltenbreite mindestens 1.0 (halbe Zoll = 48 px)
    const COL_MIN = 48;
    const tableNode = (t) => {
      const n = Math.max(1, Math.min(255, (t.cols || []).length || Math.max(1, ...(t.rows || []).map(r => r.length))));
      const cols = Array.from({ length: n }, (_, i) => (t.cols || [])[i] || 60);
      const rowsIn = (t.rows && t.rows.length ? t.rows : [[]]).map(r => Array.from({ length: n }, (_, i) => r[i] || { paras: [] }));
      const rows = rowsIn.map(row => sp.add(J.TableRowNode, [[P.LastModifiedTime, T32], [P.ElementChildNodes, row.map((cell, ci) => {
        const ps = cell.paras && cell.paras.length ? cell.paras : [{ runs: [] }];
        const props = [[P.LastModifiedTime, T32], [P.ElementChildNodes, ps.map(pp => oe(richText(pp)))], [P.EnforceOutlineStructure, true], [P.OutlineElementChildLevel, 1],
          [P.LayoutMaxWidth, f32(Math.max(COL_MIN, cols[ci]) / HI)], [P.RgOutlineIndentDistance, indents]];
        if (cell.shade) props.push([P.CellShadingColor, colorRef(cell.shade)]);
        return sp.add(J.TableCellNode, props);
      })]]));
      const widths = new Uint8Array(1 + 4 * n);
      widths[0] = n;
      cols.forEach((w, i) => widths.set(f32(Math.max(COL_MIN, w) / HI), 1 + 4 * i));
      const locked = new Uint8Array(1 + Math.ceil(n / 8));
      locked[0] = n;
      for (let i = 0; i < n; i++) locked[1 + (i >> 3)] |= 1 << (i % 8);   // Spaltenbreiten fest wie in KnowledgeTree
      return sp.add(J.TableNode, [[P.LastModifiedTime, T32], [P.ElementChildNodes, rows], [P.RowCount, u32b(rows.length)], [P.ColumnCount, u32b(n)],
        [P.TableColumnsLocked, locked], [P.TableColumnWidths, widths], [P.TableBordersVisible, t.borders !== false]]);
    };
    // Titel
    const titleOE = oe(richText({ style: 'PageTitle', runs: [{ text: page.title || '' }] }, [[P.IsTitleText, true]]), null, [[P.CannotBeSelected, true], [P.IsTitleText, true]]);
    const titleOutline = sp.add(J.OutlineNode, [
      [P.LastModifiedTime, T32], [P.ElementChildNodes, [titleOE]], [P.RgOutlineIndentDistance, indents], [P.OutlineElementChildLevel, 1],
      [P.LayoutMaxHeight, f32(0.6)], [P.DescendantsCannotBeMoved, true], [P.CannotBeSelected, true], [P.IsTitleText, true], [P.EnforceOutlineStructure, true],
      [P.LayoutMinimumOutlineWidth, f32(4.5)], [P.LayoutTightAlignment, true], [P.LayoutAlignmentInParent, u32b(0)], [P.LayoutAlignmentSelf, u32b(12)], [P.LayoutMaxWidth, f32(8.3125)],
    ]);
    const d = new Date(created);
    const dateTxt = d.toLocaleDateString('de-CH', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    const timeTxt = d.toLocaleTimeString('de-CH', { hour: '2-digit', minute: '2-digit' });
    const boiler = (flag) => [[P.IsReadOnly, true], [P.LayoutAlignmentInParent, u32b(1)], [P.LayoutAlignmentSelf, u32b(12)], [P.LayoutTightLayout, true], [P.IsBoilerText, true], [P.Deletable, true], [flag, true]];
    const dateOE = oe(richText({ style: 'PageDateTime', runs: [{ text: dateTxt }] }, boiler(P.IsTitleDate)), null, [[P.CannotBeSelected, true], [P.Deletable, true]]);
    const timeOE = oe(richText({ style: 'PageDateTime', runs: [{ text: timeTxt }] }, boiler(P.IsTitleTime)), null, [[P.CannotBeSelected, true], [P.Deletable, true]]);
    const dateOutline = sp.add(J.OutlineNode, [
      [P.LastModifiedTime, T32], [P.ElementChildNodes, [dateOE, timeOE]], [P.RgOutlineIndentDistance, indents], [P.OutlineElementChildLevel, 1], [P.LayoutMaxHeight, f32(0.6)],
      [P.IsTitleDate, true], [P.LayoutTightLayout, true], [P.CannotBeSelected, true], [P.IsReadOnly, true], [P.Deletable, true],
      [P.LayoutAlignmentInParent, u32b(0)], [P.LayoutAlignmentSelf, u32b(12)], [P.LayoutMaxWidth, f32(8.3125)],
    ]);
    const title = sp.add(J.TitleNode, [
      [P.LastModifiedTime, T32], [P.OffsetFromParentHoriz, f32(0)], [P.OffsetFromParentVert, f32(0)], [P.LayoutAlignmentInParent, u32b(0x0009000C)],
      [P.LayoutAlignmentSelf, u32b(0)], [P.LayoutCollisionPriority, u32b(0)], [P.ElementChildNodes, [titleOutline, dateOutline]],
    ]);
    // Inhalte
    const elems = [];
    const inkProps = new Map();
    for (const it of page.items) {
      if (it.kind === 'outline') {
        // flache Absätze mit Tiefe -> verschachtelte Elemente
        const build = (list, i, depth) => {
          const out = [];
          while (i < list.length && list[i].depth >= depth) {
            const p = list[i];
            if (p.depth > depth) { const r = build(list, i, p.depth); if (out.length) { const last = out[out.length - 1]; last.kids.push(...r.out); } else out.push(...r.out); i = r.i; continue; }
            out.push({ p, kids: [] });
            i++;
          }
          return { out, i };
        };
        const tree = build(it.paras.map(p => ({ ...p, depth: Math.max(0, p.depth | 0) })), 0, 0).out;
        const mk = (nodes) => nodes.map(n => oe(n.p.image ? imageNode(n.p.image, false) : n.p.file ? fileNode(n.p.file, false) : n.p.table ? tableNode(n.p.table) : richText(n.p), mk(n.kids)));
        const kids = mk(tree);
        if (!kids.length) continue;
        elems.push(sp.add(J.OutlineNode, [
          [P.LastModifiedTime, T32], [P.ElementChildNodes, kids], [P.RgOutlineIndentDistance, indents], [P.OutlineElementChildLevel, 1],
          [P.OffsetFromParentHoriz, f32(it.x / HI)], [P.OffsetFromParentVert, f32(it.y / HI)],
          [P.LayoutMaxWidth, f32(Math.max(40, it.w) / HI)], [P.IsLayoutSizeSetByUser, true],
          [P.LayoutAlignmentInParent, u32b(0)], [P.LayoutAlignmentSelf, u32b(0)],
        ]));
      } else if (it.kind === 'image') {
        elems.push(imageNode(it, true));
      } else if (it.kind === 'file') {
        elems.push(fileNode(it, true));
      } else if (it.kind === 'ink' && it.strokes.length) {
        const strokes = [];
        for (const s of it.strokes) {
          if (!s.pts || s.pts.length < 1) continue;
          const pts = s.pts.length === 1 ? [s.pts[0], { ...s.pts[0], x: s.pts[0].x + 0.1 }] : s.pts;
          const withP = !s.marker && !s.np && pts.some(q => q.p != null);
          const xs = pts.map(q => Math.round(q.x * HIMETRIC)), ys = pts.map(q => Math.round(q.y * HIMETRIC));
          const chans = [xs, ys];
          if (withP) chans.push(pts.map(q => Math.round(Math.max(0.05, Math.min(1, (q.p ?? 0.5) * 1.5)) * 32767)));
          const w = Math.max(1, (s.w || 2) * HIMETRIC);
          // wie OneNote: geglättet zeichnen (FitToCurve), ohne Druck-Kanal „Druck ignorieren“, Textmarker = Raster-Op 9
          const pprops = [[P.InkMetric, metric(withP)], [P.InkFitToCurve, true], ...(withP ? [] : [[P.InkIgnorePressure, true]]), [P.InkColor, colorRef(s.color || '#000000')], [P.InkWidth, f32(w)], [P.InkHeight, f32(w)]];
          if (s.marker) pprops.push([P.InkTip, 1], [P.InkRasterOp, 9]);
          const pkey = JSON.stringify(pprops.map(([k, v]) => [k, v instanceof Uint8Array ? [...v] : v]));
          let pp = inkProps.get(pkey);
          if (!pp) { pp = sp.add(J.InkStrokeProperties, pprops); inkProps.set(pkey, pp); }
          strokes.push(sp.add(J.InkStroke, [[P.InkPath, isfPath(chans)], [P.InkLang, LANG], [P.InkX0C00341C, 0], [P.InkX0C003610, 0], [P.InkGuid, guidBytes(newGuid())], [P.InkTime, fileTime(s.t0 || now)], [P.InkProps, pp]]));
        }
        if (!strokes.length) continue;
        const data = sp.add(J.InkData, [[P.InkStrokes, strokes]]);
        elems.push(sp.add(J.InkContainer, [[P.LastModifiedTime, T32], [P.OffsetFromParentHoriz, f32(0)], [P.OffsetFromParentVert, f32(0)], [P.InkData, data], [P.InkKind, u32b(1)]]));
      }
    }
    const pageNode = sp.add(J.PageNode, [
      [P.LastModifiedTime, T32],
      ...(elems.length ? [[P.ElementChildNodes, elems]] : []),
      [P.StructureElementChildNodes, [title]], [P.LayoutResolveChildCollisions, true], [P.PortraitPage, true],
      [P.PageMarginTop, f32(1)], [P.PageMarginBottom, f32(1)], [P.PageMarginLeft, f32(2)], [P.PageMarginRight, f32(2)],
      [P.PageWidth, f32(20.944)], [P.PageHeight, f32(21.75)], [P.X14001C9E, f32(0.5)], [P.X14001C9F, f32(0.5)], [P.X14001CA0, f32(0.25)], [P.X14001CA1, f32(0.25)],
      [P.AuthorName, utf16z(AUTHOR)], [P.AuthorInitials, utf16z(INITIALS)], [P.AuthorOriginal, author], [P.AuthorMostRecent, author],
      [P.EditRootRTL, false], [P.PageMarginOriginX, f32(1)], [P.PageMarginOriginY, f32(0.4)], [P.X14001D5C, u32b(26)], [P.X14003653, u32b(16)],
      [P.X1C001D5D, new Uint8Array([0])], [P.NotebookManagementEntityGuid, guidBytes(newGuid())],
    ]);
    // Versionsverlauf der Seite: eigene Revision im Kontext (RevisionManifestStart7), wie OneNote sie bei jeder Seite
    // anlegt – leerer Inhalt (0x6003C) + Metadaten (0x20046); die Seite verweist darauf über den Kontext.
    // Kontext fest {7111497F-…}:1 – [MS-ONE] 2.1.18 schreibt ihn vor (auch in allen echten Dateien so)
    const ctx = { g: VH_CONTEXT, n: 1 };
    const vhContent = new Obj(null, J.VersionHistoryContent, []); vhContent.oid = { g: ctx.g, n: 2 };
    const vhMeta = new Obj(null, J.VersionHistoryMetaData, [[P.SchemaRevisionInOrderToRead, u32b(40)], [P.X1400348B, u32b(40)]]); vhMeta.oid = { g: ctx.g, n: 3 };
    sp.contexts = [{ ctx, objs: [vhContent, vhMeta], roots: [[1, vhContent], [2, vhMeta]] }];
    manifest.props.push([P.VersionHistoryGraphSpaceContextNodes, [ctx]], [P.ContentChildNodes, [pageNode]]);
    sp.root(1, manifest); sp.root(2, meta); sp.root(4, revMeta);
    return sp;
  }

  /* Abschnitt: pages -> .one */
  function buildSection(pages, opts = {}) {
    const files = [];
    const byKey = new Map();   // KnowledgeTree-Name → GUID im FileDataStore (jede Datei nur einmal je Abschnitt)
    const fileGuid = (key, data) => {
      if (key && byKey.has(key)) return byKey.get(key);
      const g = newGuid();
      files.push({ guid: g, data });
      if (key) byKey.set(key, g);
      return g;
    };
    const pageSpaces = [];
    for (const pg of pages) {
      for (const it of pg.items) {
        const imgs = it.kind === 'image' || it.kind === 'file' ? [it] : it.kind === 'outline' ? it.paras.filter(p => p.image || p.file).map(p => p.image || p.file) : [];
        if (it.kind === 'outline') for (const pp of it.paras) if (pp.table) for (const row of pp.table.rows) for (const cell of row) for (const cp of cell.paras || []) if (cp.image) imgs.push(cp.image);
        for (const im of imgs) {
          if (im.data && !im.fileGuid) im.fileGuid = fileGuid(im.key, im.data);
          // Ausdruck: Druckdokument und Quelldatei – gleiche Dateien (z.B. eine PDF für 13 Seitenbilder) nur einmal
          if (im.print && im.print.xps && !im.print.xpsGuid) im.print.xpsGuid = fileGuid(im.print.xpsKey, im.print.xps);
          if (im.print && im.print.src && !im.print.srcGuid) im.print.srcGuid = fileGuid(im.print.srcKey, im.print.src);
        }
      }
      pageSpaces.push(buildPage(pg, files));
    }
    const sec = new Space();
    const now = Date.now();
    // eine Seitenreihe braucht mindestens eine Seite ([MS-ONE] 2.3.19) – ein leerer Abschnitt hat gar keine
    const series = pageSpaces.length ? [sec.add(J.PageSeriesNode, [[P.ChildGraphSpaceElementNodes, pageSpaces.map(s => s.gosid)], [P.NotebookManagementEntityGuid, guidBytes(newGuid())], [P.TopologyCreationTimeStamp, fileTime(now)]])] : [];
    const node = sec.add(J.SectionNode, [[P.NotebookManagementEntityGuid, guidBytes(newGuid())], [P.TopologyCreationTimeStamp, fileTime(now)], ...(series.length ? [[P.ElementChildNodes, series]] : [])]);
    // Abschnittsfarbe auch in den Metadaten (NotebookColor, wie OneNote beim Paket-Export)
    const meta = sec.add(J.SectionMetaData, [[P.SchemaRevisionInOrderToRead, u32b(40)], [P.X1400348B, u32b(40)], ...(opts.color ? [[P.TocColor, colorRef(opts.color)]] : [])]);
    sec.root(1, node); sec.root(2, meta);
    const fb = new FileBuilder(false);
    return fb.finish(sec, [sec, ...pageSpaces], files, '{7B5C52E4-D88C-4DA7-AEB1-5378D02996D3}');
  }

  /* Inhaltsverzeichnis: entries = [{ file, color }] in Reihenfolge */
  function buildToc(entries, color) {
    const sp = new Space();
    const kids = entries.map((e, i) => {
      const props = [[P.TocGuid, guidBytes(newGuid())], [P.TocOrder, u32b(i + 1)], [P.TocFileName, utf16z(e.file)]];
      if (e.color) props.push([P.TocColor, colorRef(e.color)]);
      return sp.add(J.TocEntry, props);
    });
    const rootProps = [[P.TocChildren, kids]];
    if (color) rootProps.push([P.TocColor, colorRef(color)]);
    const root = sp.add(J.TocEntry, rootProps);
    sp.root(1, root);
    const fb = new FileBuilder(true);
    return fb.finish(sp, [sp], [], '{43FF2FA1-EFD9-4C76-9EE2-10EA5722765F}');
  }

  /* CAB ohne Kompression: files = [{ name ('Ordner\\Datei'), data: Uint8Array | Blob }].
   * Seit 1.18 ohne Zusammenkopieren: die Datenblöcke verweisen auf Stücke der Dateien (Blob.slice/subarray).
   * Ergebnis: Uint8Array, wenn alles Bytes sind (und opts.blob nicht gesetzt), sonst Blob. */
  function buildCab(files, opts = {}) {
    const enc = new TextEncoder();
    const names = files.map(f => enc.encode(f.name.replace(/\//g, '\\')));
    const sizes = files.map(f => sizeOf(f.data));
    const total = sizes.reduce((a, b) => a + b, 0);
    const offs = []; { let o = 0; for (const z of sizes) { offs.push(o); o += z; } }
    const BLK = 32768;
    const nData = Math.max(1, Math.ceil(total / BLK));
    if (nData > 65535) throw new Error('OneNote-Paket zu gross (mehr als 2 GB) – bitte in kleineren Teilen exportieren');
    const hdrLen = 36, folderLen = 8;
    const filesLen = files.reduce((a, f, i) => a + 16 + names[i].length + 1, 0);
    const dataStart = hdrLen + folderLen + filesLen;
    const cabLen = dataStart + nData * 8 + total;
    const o = new Out(dataStart + 16);
    o.bytes(new Uint8Array([0x4D, 0x53, 0x43, 0x46])).u32(0).u32(cabLen).u32(0).u32(hdrLen + folderLen).u32(0).u8(3).u8(1).u16(1).u16(files.length).u16(0).u16(0x1234).u16(0);
    o.u32(dataStart).u16(nData).u16(0);
    const d = new Date();
    const dosDate = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
    const dosTime = (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2);
    files.forEach((f, i) => {
      const utf8 = /[^\x00-\x7F]/.test(f.name);
      o.u32(sizes[i]).u32(offs[i]).u16(0).u16(dosDate).u16(dosTime).u16(0x20 | (utf8 ? 0x80 : 0)).bytes(names[i]).u8(0);
    });
    const parts = [o.done()];
    // Datenblöcke à 32 KB über die Dateigrenzen hinweg
    let fi = 0, fo = 0;
    for (let i = 0; i < nData; i++) {
      const len = Math.min(BLK, total - i * BLK);
      const bh = new Uint8Array(8); bh[4] = len & 255; bh[5] = len >> 8; bh[6] = len & 255; bh[7] = len >> 8;
      parts.push(bh);
      let need = len;
      while (need > 0 && fi < files.length) {
        const take = Math.min(need, sizes[fi] - fo);
        if (take > 0) { const x = files[fi].data; parts.push(x instanceof Uint8Array ? x.subarray(fo, fo + take) : x.slice(fo, fo + take)); need -= take; fo += take; }
        if (fo >= sizes[fi]) { fi++; fo = 0; }
      }
    }
    if (!opts.blob && parts.every(x => x instanceof Uint8Array)) {
      const out = new Uint8Array(cabLen); let q = 0;
      for (const x of parts) { out.set(x, q); q += x.length; }
      return out;
    }
    return new Blob(parts);
  }

  /* ================================================================ Teil 2: KnowledgeTree -> OneNote (im Browser) */
  const ON_TITLE = 56; // Platz für Titel und Datum oben auf der OneNote-Seite (wie beim Import)
  const hex2 = (n) => Math.round(n).toString(16).padStart(2, '0');
  const cssHex = (c) => {
    const m = /rgba?\(\s*([\d.]+)[ ,]+([\d.]+)[ ,]+([\d.]+)(?:[ ,/]+([\d.]+%?))?/.exec(c || '');
    if (!m) return /^#[0-9a-f]{6}$/i.test(c || '') ? c.toLowerCase() : null;
    if (m[4] !== undefined && parseFloat(m[4]) === 0) return null;
    return '#' + hex2(+m[1]) + hex2(+m[2]) + hex2(+m[3]);
  };
  const firstFont = (ff) => {
    const f = (ff || '').split(',')[0].trim().replace(/^["']|["']$/g, '');
    if (!f || /^(sans-serif|serif|system-ui|-apple-system|ui-sans-serif|monospace)$/i.test(f)) return 'Calibri';
    return /^carlito$/i.test(f) ? 'Calibri' : f;
  };
  const ptOf = (px) => Math.round(parseFloat(px) * 0.75 * 2) / 2;

  /* Bilddaten holen; Formate, die OneNote nicht kennt, als PNG */
  /* Bytes eines gespeicherten Anhangs (unverändert) */
  /* gespeicherte Datei als Blob (seit 1.18 direkt aus dem Speicher, ohne Objekt-URL und ohne Kopie) */
  const storedBlob = (name) => Export.assetBlob(name);   // gespeichertes Bild/Datei als Blob (wie beim übrigen Export)
  async function fileBytes(name) { return storedBlob(name); }
  async function imageBytes(name) {
    let blob = await storedBlob(name), converted = false;
    if (!blob) return null;
    let type = blob.type || '';
    if (!/^image\/(png|jpeg|gif|bmp)$/.test(type)) {
      try {
        let src, w, h;
        if (/svg/.test(type)) {
          // SVG (z. B. Strukturformeln): über ein <img> rastern, doppelte Auflösung
          const u = URL.createObjectURL(blob);
          try {
            src = await new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = u; });
          } finally { setTimeout(() => URL.revokeObjectURL(u), 1000); }
          w = (src.naturalWidth || 300) * 2; h = (src.naturalHeight || 150) * 2;
        } else { src = await createImageBitmap(blob); w = src.width; h = src.height; }
        const c = document.createElement('canvas');
        c.width = w; c.height = h;
        const g = c.getContext('2d');
        if (/svg/.test(type)) { g.fillStyle = '#fff'; g.fillRect(0, 0, w, h); }
        g.drawImage(src, 0, 0, w, h);
        blob = await new Promise(res => c.toBlob(res, 'image/png'));
        type = 'image/png';
        converted = true;
      } catch (e) { return null; }
    }
    const ext = { 'image/png': '.png', 'image/jpeg': '.jpg', 'image/gif': '.gif', 'image/bmp': '.bmp' }[type] || '.png';
    return { data: blob, ext, converted };   // Blob: wird beim Schreiben nur als Teil vermerkt
  }
  /* Ausdruck (1.22): Druckdokument und Quelldatei aus dem Speicher holen (beim Import am Bild vermerkt) */
  async function printBytes(pr) {
    if (!pr || typeof pr !== 'object') return null;
    const out = { page: pr.page, idx: pr.idx, group: pr.group, srcExt: pr.srcExt ? (pr.srcExt.startsWith('.') ? pr.srcExt : '.' + pr.srcExt) : '' };
    if (pr.xps) { const b = await storedBlob(pr.xps); if (b) { out.xps = b; out.xpsKey = pr.xps; } }
    if (pr.src) { const b = await storedBlob(pr.src); if (b) { out.src = b; out.srcKey = pr.src; if (!out.srcExt) out.srcExt = '.' + String(pr.src).split('.').pop(); } }
    return out;
  }

  /* ---- Tabellen und Diagramme (1.8): sichtbar wie in KnowledgeTree, Formeln/Formate versteckt im Alternativtext
   * eines 1×1-Bildes (Tabelle) bzw. des Diagrammbildes -> beim Rückimport wieder vollständig */
  const KT_SHEET = 'KnowledgeTree-Tabelle', KT_CHART = 'KnowledgeTree-Diagramm', KT_META = 'KTDATA:';
  /* Farbe als #rrggbb, halbtransparente auf Weiss gemischt (Zellhintergrund) */
  const solidHex = (c) => {
    let m = /rgba?\(\s*([\d.]+)[ ,]+([\d.]+)[ ,]+([\d.]+)(?:[ ,/]+([\d.]+)(%?))?/.exec(c || '');
    let r, g, b, a = 1;
    if (m) { r = +m[1]; g = +m[2]; b = +m[3]; if (m[4] !== undefined) a = m[5] ? +m[4] / 100 : +m[4]; }
    else if ((m = /color\(srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+)(%?))?/.exec(c || ''))) { r = +m[1] * 255; g = +m[2] * 255; b = +m[3] * 255; if (m[4] !== undefined) a = m[5] ? +m[4] / 100 : +m[4]; }
    else return /^#[0-9a-f]{6}$/i.test(c || '') ? c.toLowerCase() : null;
    if (a <= 0.01) return null;
    const mix = (v) => Math.round(v * a + 255 * (1 - a));
    return '#' + hex2(mix(r)) + hex2(mix(g)) + hex2(mix(b));
  };
  let carrier = null;
  async function carrierPng() {
    if (carrier) return carrier;
    const c = document.createElement('canvas'); c.width = c.height = 1;
    const blob = await new Promise(res => c.toBlob(res, 'image/png'));
    carrier = { data: new Uint8Array(await blob.arrayBuffer()), ext: '.png' };
    return carrier;
  }
  async function svgPng(svg, scale = 2) {
    const u = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
    try {
      const im = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = u; });
      const c = document.createElement('canvas');
      c.width = Math.round((im.naturalWidth || 400) * scale); c.height = Math.round((im.naturalHeight || 300) * scale);
      const g = c.getContext('2d');
      g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
      g.drawImage(im, 0, 0, c.width, c.height);
      const blob = await new Promise(res => c.toBlob(res, 'image/png'));
      return { data: new Uint8Array(await blob.arrayBuffer()), ext: '.png' };
    } finally { setTimeout(() => URL.revokeObjectURL(u), 1000); }
  }
  async function sheetItem(b, e, W) {
    const t = e.querySelector('.xl-grid');
    if (!t) return null;
    const r0 = W(t.getBoundingClientRect());
    const cols = (e._cols || []).map(c => c[1]);
    const ink = cssHex(getComputedStyle(t).color) || '#252423';   // automatische Schriftfarbe der Tabelle
    const rows = [], vals = [];
    for (const tr of t.rows) {
      const row = [], vrow = [];
      for (const td of tr.cells) {
        const cs = getComputedStyle(td);
        const text = td.textContent;
        vrow.push(text);
        const cf = ((b.sheet.cells || {})[XL.key(td.cellIndex, tr.rowIndex)] || {}).f || {};
        const color = cf.bg && !cf.c ? null : cssHex(cs.color);   // automatisch zur Füllfarbe = keine feste Farbe
        const base = { font: firstFont(cs.fontFamily), size: ptOf(cs.fontSize), color: color && color !== ink ? color : null, b: parseInt(cs.fontWeight, 10) >= 600, i: cs.fontStyle === 'italic' };
        const dl = cs.textDecorationLine || '';
        const align = cs.textAlign === 'center' ? 'center' : (cs.textAlign === 'right' || cs.textAlign === 'end') ? 'right' : null;
        const extra = { ...(/underline/.test(dl) ? { u: true } : {}), ...(/line-through/.test(dl) ? { s: true } : {}) };
        const paras = text.split('\n').map(line => ({ depth: 0, style: 'p', styleFmt: { ...base }, align, runs: line ? [{ text: line, ...extra }] : [] }));
        const bg = solidHex(cs.backgroundColor);
        row.push({ paras, shade: bg && bg !== '#ffffff' ? bg : null });
      }
      rows.push(row); vals.push(vrow);
    }
    const meta = { kt: 'sheet', v: 1, id: b.id, dx: r0.x - b.x, dy: r0.y - b.y, w: b.w, style: b.style || {}, sheet: b.sheet, vals };
    const cimg = await carrierPng();
    const alt = `${KT_SHEET} „${b.sheet.name}“ – Formeln und Formate für den Rückimport in KnowledgeTree (bitte nicht löschen)\n${KT_META}${JSON.stringify(meta)}`;
    return { kind: 'outline', x: r0.x, y: r0.y, w: cols.reduce((a, c) => a + c, 0), paras: [{ depth: 0, table: { cols, rows, borders: b.sheet.grid !== false } }, { depth: 0, image: { ...cimg, w: 1, h: 1, alt, name: 'kt-tabelle.png' } }] };
  }
  async function chartItem(b, e, W) {
    const svgEl = e.querySelector('.ch-wrap svg');
    if (!svgEl || typeof Chart === 'undefined') return null;
    const r = W(svgEl.getBoundingClientRect());
    const png = await svgPng(Chart.svgFor(b), 2);
    const data = Chart.data(b);
    const meta = { kt: 'chart', v: 1, id: b.id, dx: r.x - b.x, dy: r.y - b.y, w: b.w, style: b.style || {}, chart: b.chart };
    const title = b.chart.title || (data.series[0] && data.series[0].name) || 'Diagramm';
    const alt = `${KT_CHART}: ${title} (${data.series.map(s => s.name).join(', ')})\n${KT_META}${JSON.stringify(meta)}`;
    return { kind: 'image', x: r.x, y: r.y, w: r.w, h: r.h, ...png, alt, name: 'diagramm.png' };
  }

  /* Text eines Feldes (gerendert) -> Absätze mit Läufen */
  async function htmlParas(root) {
    const paras = [];
    const rootCs = getComputedStyle(root);
    const inkColor = cssHex(rootCs.color);
    let cur = null;
    const blockFmt = (el) => {
      const cs = getComputedStyle(el);
      const color = cssHex(cs.color);
      const f = { font: firstFont(cs.fontFamily), size: ptOf(cs.fontSize), color: color && color !== inkColor ? color : null, b: parseInt(cs.fontWeight, 10) >= 600, i: cs.fontStyle === 'italic' };
      // Zeilenhöhe wie in KnowledgeTree (OneNote: genauer Zeilenabstand in pt), Abstände vor/nach dem Absatz
      const lh = parseFloat(cs.lineHeight);
      if (lh > 0 && cs.lineHeight !== 'normal') f.lineExact = Math.round(lh * 0.75 * 100) / 100;
      const mt = parseFloat(cs.marginTop) || 0, mb = parseFloat(cs.marginBottom) || 0;
      if (mt > 0.5 && el !== root) f.before = Math.round(mt * 0.75 * 100) / 100;
      if (mb > 0.5 && el !== root) f.after = Math.round(mb * 0.75 * 100) / 100;
      return f;
    };
    const styleOf = (el) => { const t = el.tagName; return /^H[1-6]$/.test(t) ? t.toLowerCase() : t === 'PRE' ? 'code' : t === 'BLOCKQUOTE' ? 'quote' : 'p'; };
    const open = (el, depth, prefix) => {
      flush();
      const cs = getComputedStyle(el);
      const ml = parseFloat(cs.marginLeft) || 0;
      cur = { depth: depth + (el.tagName === 'DIV' && ml > 18 ? Math.round(ml / 36) || 1 : 0), style: styleOf(el), styleFmt: blockFmt(el), align: cs.textAlign === 'center' ? 'center' : cs.textAlign === 'right' || cs.textAlign === 'end' ? 'right' : null, runs: [], block: el };
      if (prefix) cur.runs.push({ text: prefix, prefix: true });
    };
    const flush = () => { if (cur) { paras.push(cur); cur = null; } };
    const ensure = (el, depth) => { if (!cur) open(el.closest('div, p, h1, h2, h3, h4, h5, h6, li, pre, blockquote, td') || root, depth); };
    const runOf = (textEl, text) => {
      const cs = getComputedStyle(textEl);
      const r = { text };
      const base = cur.styleFmt;
      const font = firstFont(cs.fontFamily), size = ptOf(cs.fontSize), color = cssHex(cs.color);
      const b = parseInt(cs.fontWeight, 10) >= 600, i = cs.fontStyle === 'italic';
      if (font !== base.font) r.font = font;
      if (size !== base.size) r.size = size;
      if (color && color !== inkColor && color !== base.color) r.color = color;
      if (b !== base.b) r.b = b;
      if (i !== base.i) r.i = i;
      for (let e = textEl; e && e !== root && e !== cur.block; e = e.parentElement) {
        const ecs = getComputedStyle(e);
        const dl = ecs.textDecorationLine || '';
        if (/underline/.test(dl) && e.tagName !== 'A') r.u = true;
        if (/line-through/.test(dl)) r.s = true;
        if (e.tagName === 'SUP' || ecs.verticalAlign === 'super') r.sup = true;
        if (e.tagName === 'SUB' || ecs.verticalAlign === 'sub') r.sub = true;
        if (!r.hl) { const bg = cssHex(ecs.backgroundColor); if (bg) r.hl = bg; }
      }
      const a = textEl.closest('a[href]');
      if (a && root.contains(a) && !a.classList.contains('kt-file') && /^(https?:|mailto:)/i.test(a.getAttribute('href'))) r.href = a.getAttribute('href');
      return r;
    };
    const walk = async (node, depth) => {
      for (const n of [...node.childNodes]) {
        if (n.nodeType === 3) {
          const t = n.nodeValue.replace(/​/g, '').replace(/[\r\n]+/g, ' ');
          if (!t) continue;
          ensure(n.parentElement, depth);
          cur.runs.push(runOf(n.parentElement, t));
          continue;
        }
        if (n.nodeType !== 1) continue;
        const tag = n.tagName;
        if (n.classList.contains('kt-math')) { ensure(node, depth); cur.runs.push({ text: n.dataset.tex || n.textContent, font: 'Cambria Math' }); continue; }
        if (n.classList.contains('kt-file')) {
          const fname = n.dataset.name || n.textContent.replace(/^📎\s*/, '').trim() || 'Anhang';
          const fd = n.dataset.ktFile ? await fileBytes(n.dataset.ktFile) : null;
          if (fd) {
            // verlustfrei: echter OneNote-Dateianhang (EmbeddedFileNode) als eigener Absatz
            const d0 = cur ? cur.depth : depth;
            if (cur && !cur.runs.length) cur = null; else flush();
            const m = /\.[A-Za-z0-9]{1,8}$/.exec(fname);
            paras.push({ depth: d0, file: { name: fname, data: fd, ext: m ? m[0] : '' } });
          } else { ensure(node, depth); cur.runs.push({ text: '📎 ' + fname }); }
          continue;
        }
        if (tag === 'BR') {
          if (cur && n.nextSibling && !(n.nextSibling.nodeType === 1 && /^(DIV|P|UL|OL|TABLE|H\d)$/.test(n.nextSibling.tagName))) cur.runs.push({ text: '\u000b' });
          continue;
        }
        if (tag === 'IMG') {
          const name = n.dataset.ktSrc;
          const im = name ? await imageBytes(name) : null;
          if (im) {
            const d0 = cur ? cur.depth : depth;
            if (cur && !cur.runs.length) cur = null; else flush();
            const r = n.getBoundingClientRect(), z = Canvas.view.z || 1;
            const vw = n.closest('.kt-video');
            let pr = null;
            try { pr = n.dataset.ktPrint ? await printBytes(JSON.parse(n.dataset.ktPrint)) : null; } catch (e) { pr = null; }
            paras.push({ depth: d0, image: { ...im, key: im.converted ? null : name, w: Math.max(4, r.width / z), h: Math.max(4, r.height / z), alt: n.alt || '', ...(n.dataset.ocr ? { ocr: n.dataset.ocr } : {}), ...(vw ? { video: vw.dataset.video, title: vw.dataset.title || '' } : {}), ...(pr ? { print: pr } : {}) } });
          }
          continue;
        }
        if (tag === 'HR') { flush(); open(n, depth); cur.runs.push({ text: '────────────────', color: '#a19f9d' }); flush(); continue; }
        if (tag === 'UL' || tag === 'OL') { flush(); await walk(n, depth); flush(); continue; }
        if (tag === 'LI') {
          const list = n.parentElement;
          let lv = -1;
          for (let e = n.parentElement; e && e !== root; e = e.parentElement) if (e.tagName === 'UL' || e.tagName === 'OL') lv++;
          lv = Math.max(0, lv);
          let prefix = '• ';
          if (list.classList.contains('checklist')) prefix = n.classList.contains('done') ? '☑ ' : '☐ ';
          else if (list.tagName === 'OL') prefix = ([...list.children].filter(c => c.tagName === 'LI').indexOf(n) + 1) + '. ';
          else if (lv % 2 === 1) prefix = '◦ ';
          open(n, depth + lv, prefix);
          await walk(n, depth + lv);
          flush();
          continue;
        }
        if (tag === 'TABLE') {
          // echte OneNote-Tabelle (seit 1.8): Zellen mit formatierten Absätzen, Breiten wie angezeigt
          flush();
          const z = Canvas.view.z || 1;
          const trs = [...n.rows];
          const ncol = Math.max(1, ...trs.map(tr => tr.cells.length));
          const first = trs.find(tr => tr.cells.length === ncol) || trs[0];
          const cols = [];
          for (let i = 0; i < ncol; i++) cols.push(first && first.cells[i] ? Math.max(12, first.cells[i].getBoundingClientRect().width / z) : 60);
          const rows = [];
          for (const tr of trs) {
            const row = [];
            for (let i = 0; i < ncol; i++) {
              const td = tr.cells[i];
              if (!td) { row.push({ paras: [] }); continue; }
              // Zellen tragen nur Text: ein Anhang in einer Zelle bleibt als Hinweis „📎 Name“ stehen
              const ps = (await htmlParas(td)).map(p => p.file ? { depth: p.depth, style: 'p', runs: [{ text: '📎 ' + p.file.name }] } : p).filter(p => !p.image && !p.table);
              const bg = solidHex(getComputedStyle(td).backgroundColor);
              row.push({ paras: ps, shade: bg && bg !== '#ffffff' ? bg : null });
            }
            rows.push(row);
          }
          const bc = getComputedStyle(n.rows[0] && n.rows[0].cells[0] || n).borderTopColor;
          paras.push({ depth, table: { cols, rows, borders: !/transparent|rgba\(0, 0, 0, 0\)/.test(bc || '') } });
          continue;
        }
        if (/^(DIV|P|H[1-6]|PRE|BLOCKQUOTE)$/.test(tag)) {
          // Block direkt nach dem Aufzählungszeichen gehört zum selben Absatz
          if (cur && cur.runs.length && cur.runs.every(r => r.prefix)) { await walk(n, cur.depth); continue; }
          open(n, depth); await walk(n, depth); flush(); continue;
        }
        await walk(n, depth);
      }
    };
    await walk(root, 0);
    flush();
    // leere Absätze am Ende weglassen, Leerzeichen-Läufe zusammenfassen
    for (const p of paras) if (p.runs) { p.runs = p.runs.filter(r => r.text !== '').map(r => { delete r.prefix; return r; }); delete p.block; }
    while (paras.length && !paras[paras.length - 1].image && !paras[paras.length - 1].file && !paras[paras.length - 1].table && !(paras[paras.length - 1].runs || []).some(r => r.text.trim())) paras.pop();
    return paras;
  }

  /* SVG-Pfad (Verbindung) abtasten */
  const samplePath = (path, step = 6) => {
    try {
      const L = path.getTotalLength();
      const n = Math.max(2, Math.min(400, Math.ceil(L / step) + 1));
      const out = [];
      for (let i = 0; i < n; i++) { const p = path.getPointAtLength(L * i / (n - 1)); out.push({ x: p.x, y: p.y }); }
      return out;
    } catch (e) { return []; }
  };
  const roundRect = (x, y, w, h, r) => {
    const pts = [];
    const arc = (cx, cy, a0) => { for (let k = 0; k <= 4; k++) { const a = a0 + k * Math.PI / 8; pts.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) }); } };
    arc(x + w - r, y + r, -Math.PI / 2); arc(x + w - r, y + h - r, 0); arc(x + r, y + h - r, Math.PI / 2); arc(x + r, y + r, Math.PI);
    pts.push({ ...pts[0] });
    return pts;
  };
  const arrowHead = (a, b, w) => {
    const L = Math.hypot(b.x - a.x, b.y - a.y) || 1, ux = (b.x - a.x) / L, uy = (b.y - a.y) / L;
    const s = Math.max(8, w * 3.5);
    return [{ x: b.x - ux * s - uy * s * 0.5, y: b.y - uy * s + ux * s * 0.5 }, b, { x: b.x - ux * s + uy * s * 0.5, y: b.y - uy * s - ux * s * 0.5 }];
  };

  /* gerenderte Seite (Canvas zeigt sie gerade) -> Zwischenformat */
  async function pageModel(page) {
    const z = Canvas.view.z || 1;
    const wr = $('#world').getBoundingClientRect();
    const W = (r) => ({ x: (r.left - wr.left) / z, y: (r.top - wr.top) / z, w: r.width / z, h: r.height / z });
    const items = [];
    const frames = [];
    const dense = (pts, step = 4) => {
      const out = [];
      pts.forEach((q, i) => {
        if (i) { const a = pts[i - 1], L = Math.hypot(q.x - a.x, q.y - a.y), n = Math.floor(L / step); for (let k = 1; k < n; k++) out.push({ x: a.x + (q.x - a.x) * k / n, y: a.y + (q.y - a.y) * k / n, p: q.p }); }
        out.push(q);
      });
      return out;
    };
    const ink = (pts, color, w, opts = {}) => { if (pts.length) frames.push({ pts: (opts.raw ? pts : dense(pts)).map(p => ({ x: p.x, y: p.y, p: p.p })), color: color || '#000000', w, marker: !!opts.marker, np: !!opts.np, t0: opts.t0 }); };
    // Pakete (Rahmen + Titel)
    for (const k of page.pkgs) {
      const r = Canvas.rects.get(k.id);
      if (!r) continue;
      ink(roundRect(r.x, r.y, r.w, r.h, 8), k.color || '#6b4fbb', 2);
      items.push({ kind: 'outline', x: r.x + 10, y: r.y + 3, w: Math.max(60, r.w - 20), paras: [{ depth: 0, style: 'p', styleFmt: { font: 'Calibri', size: 10, b: true, color: k.color || null }, runs: [{ text: k.title || 'Paket' }] }] });
    }
    // Verbindungen
    for (const path of document.querySelectorAll('#links-g path.link')) {
      const cs = getComputedStyle(path);
      const col = cssHex(cs.stroke) || '#8e8aa0';
      ink(samplePath(path), col, parseFloat(path.getAttribute('stroke-width')) || 2);
    }
    for (const path of document.querySelectorAll('#links-g path.link-arrow')) {
      const pts = samplePath(path, 3);
      ink(pts, cssHex(getComputedStyle(path).fill) || '#8e8aa0', 2);
    }
    for (const t of document.querySelectorAll('#links-g text.link-label')) {
      const r = W(t.getBoundingClientRect());
      items.push({ kind: 'outline', x: r.x, y: r.y, w: Math.max(30, r.w + 8), paras: [{ depth: 0, style: 'p', styleFmt: { size: 10 }, runs: [{ text: t.textContent }] }] });
    }
    // Textfelder
    for (const b of [...page.boxes].sort((a, c) => (!!c.bg - !!a.bg) || a.z - c.z)) {   // Hintergrund zuerst
      const e = Canvas.els.get(b.id);
      if (!e) continue;
      if (b.sheet) { const it = await sheetItem(b, e, W); if (it) items.push(it); continue; }
      if (b.chart) { const it = await chartItem(b, e, W); if (it) items.push(it); continue; }
      const st = b.style || {};
      const r = Canvas.rects.get(b.id) || { x: b.x, y: b.y, w: b.w, h: e.offsetHeight };
      if (st.bg !== 'transparent') ink(roundRect(r.x, r.y, r.w, r.h, 7), st.border || (st.bg && st.bg !== 'transparent' ? st.bg : '#c8c6c4'), 1);
      const paras = await htmlParas(e.querySelector('.box-text'));
      if (paras.length) items.push({ kind: 'outline', x: b.x + 11, y: b.y + 13, w: b.w - 22, paras });
      for (const f of e.querySelectorAll('.fimg')) {
        const im = b.images.find(q => q.id === f.dataset.img);
        const data = im && await imageBytes(im.src);
        if (!data) continue;
        const fr = W(f.getBoundingClientRect());
        items.push({ kind: 'image', x: fr.x, y: fr.y, w: fr.w, h: fr.h, ...data, key: data.converted ? null : im.src, ...(im.video ? { video: im.video, title: im.title || '' } : {}), ...(im.ocr ? { ocr: im.ocr } : {}), ...(b.bg && Canvas.isPictureBox(b) ? { background: true } : {}), ...(im.print ? { print: await printBytes(im.print) } : {}) });
      }
    }
    // Zeichnungen
    for (const d of page.drawings) {
      const color = /^#[0-9a-f]{6}$/i.test(d.color || '') ? d.color : d.kind === 'rainbow' ? '#bf5af2' : d.kind === 'glitter' ? '#c9a227' : '#1f1f1f';
      if (d.type === 'ink') { ink(DG.inkPts(d), color, d.w, { marker: d.kind === 'marker', t0: d.t0, raw: true, np: !!d.np }); continue; }
      const { lines } = DG.lines(d);
      for (const l of lines) ink(l, color, d.w, { t0: d.t0 });
      const heads = [];
      if (d.shape === 'arrow' || d.shape === 'darrow') heads.push(arrowHead({ x: d.x1, y: d.y1 }, { x: d.x2, y: d.y2 }, d.w));
      if (d.shape === 'darrow') heads.push(arrowHead({ x: d.x2, y: d.y2 }, { x: d.x1, y: d.y1 }, d.w));
      if (d.shape === 'axes') { const l = lines; heads.push(arrowHead(l[0][0], l[0][1], d.w), arrowHead(l[1][0], l[1][1], d.w)); }
      for (const h of heads) ink(h, color, d.w, { t0: d.t0 });
    }
    if (frames.length) items.unshift({ kind: 'ink', strokes: frames });
    // Lage: Titelbereich oben frei lassen, nichts links/oben aus der Seite
    let minX = Infinity, minY = Infinity;
    for (const it of items) {
      if (it.kind === 'ink') for (const s of it.strokes) for (const p of s.pts) { minX = Math.min(minX, p.x - s.w); minY = Math.min(minY, p.y - s.w); }
      else { minX = Math.min(minX, it.x); minY = Math.min(minY, it.y); }
    }
    const dx = minX < 0 ? -minX : 0, dy = ON_TITLE + (minY < 0 ? -minY : 0);
    for (const it of items) {
      if (it.kind === 'ink') for (const s of it.strokes) for (const p of s.pts) { p.x += dx; p.y += dy; }
      else { it.x += dx; it.y += dy; }
    }
    return { title: page.title || 'Unbenannte Seite', created: page.created, modified: page.modified, level: page.level || 0, items };
  }

  /* Auswahl (beschnittener Baum) -> Dateien.
   * Seit 1.18 Abschnitt für Abschnitt: die Seiten eines Abschnitts werden dargestellt und umgesetzt, dann wird der
   * Abschnitt geschrieben (als Blob, Bilder ohne Kopie) und die Seitenmodelle werden freigegeben. Pakete (.onepkg)
   * werden aus den Abschnitts-Blobs zusammengesetzt. opts.blob = Ergebnis als Blob (Export), sonst Uint8Array. */
  async function exportTree(tree, name, progress, opts = {}) {
    const safe = (s) => String(s || 'Unbenannt').replace(/[<>:"/\\|?*\u0000-\u001f]+/g, '_').replace(/[. ]+$/, '').trim().slice(0, 80) || 'Unbenannt';
    const sections = [];
    const findSecs = (list) => { for (const g of list) { if (g.pages.length) sections.push(g); findSecs(g.groups); } };
    findSecs(tree);
    const owner = new Map(), left = new Map();
    for (const g of sections) { left.set(g, g.pages.length); for (const pid of g.pages) owner.set(pid, g); }
    const models = new Map(), built = new Map();
    const build = (g) => { built.set(g, buildSection(g.pages.map(pid => models.get(pid)).filter(Boolean), { color: g.color })); for (const pid of g.pages) models.delete(pid); };
    await Export.renderEach(sections.flatMap(g => g.pages.map(pid => ({ pid }))), { set: (t, f) => progress('OneNote: ' + t, f * 0.9) }, async (page, pid) => {
      models.set(pid, await pageModel(page));
      const g = owner.get(pid);
      left.set(g, left.get(g) - 1);
      if (left.get(g) <= 0 && !built.has(g)) build(g);
    });
    for (const g of sections) if (!built.has(g)) build(g);   // Seiten, die es nicht mehr gab
    progress('OneNote-Dateien werden geschrieben …', 0.95);
    const section = (g) => built.get(g);
    const finish = async (list) => {
      for (const f of list) {
        if (opts.blob) { if (f.data instanceof Uint8Array) f.data = new Blob([f.data]); }
        else if (!(f.data instanceof Uint8Array)) f.data = new Uint8Array(await f.data.arrayBuffer());
      }
      return list;
    };
    // ein einzelner Abschnitt -> .one
    if (sections.length === 1) return finish([{ name: safe(sections[0].name) + '.one', data: section(sections[0]) }]);
    // sonst je Notizbuch ein Paket (.onepkg); einzelne Abschnitte oben (z. B. Schnellnotizen) als .one
    const out = [];
    for (const top of tree) {
      if (top.kind === 'section' || top.kind === 'quick') { out.push({ name: safe(top.name) + '.one', data: section(top) || buildSection([], { color: top.color }) }); continue; }
      const files = [];
      const folder = (g, path) => {
        const entries = [];
        const used = new Set();
        const uniq = (n) => { let x = n, i = 2; while (used.has(x.toLowerCase())) x = `${n} (${i++})`; used.add(x.toLowerCase()); return x; };
        for (const c of g.groups) {
          if (c.kind === 'group' || c.kind === 'notebook') { const n = uniq(safe(c.name)); entries.push({ file: n }); folder(c, path + n + '\\'); }
          else { const n = uniq(safe(c.name)); entries.push({ file: n + '.one', color: c.color || null }); files.push({ name: path + n + '.one', data: section(c) || buildSection([], { color: c.color }) }); }
        }
        if (g.pages.length) { const n = uniq(safe(g.name)); entries.push({ file: n + '.one', color: g.color || null }); files.push({ name: path + n + '.one', data: section(g) }); }
        files.push({ name: path + 'Open Notebook.onetoc2', data: buildToc(entries, path ? null : (g.color || null)) });
      };
      folder(top, '');
      out.push({ name: safe(top.name) + '.onepkg', data: buildCab(files, { blob: true }) });
    }
    return finish(out);
  }

  return { buildSection, buildToc, buildCab, buildPage, newGuid, guidBytes, crc32, md5, isfPath, Space, FileBuilder, P, J, exportTree, pageModel, htmlParas, KT_SHEET, KT_CHART, KT_META };
})();

if (typeof module !== 'undefined') module.exports = OneWrite;
