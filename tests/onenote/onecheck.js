// Strenge Prüfung von .one/.onetoc2-Dateien nach [MS-ONESTORE] – das, was OneNote beim Öffnen verlangt (MUST-Regeln)
// und was echte OneNote-Dateien nachweislich erfüllen. Nutzung: node tests/onenote/onecheck.js datei.one …
// oder require(...).check(u8) → { errors: [...], warnings: [...], stats }
'use strict';
const ON = require('../../web/js/onenote.js');

const FT_ONE = '{7B5C52E4-D88C-4DA7-AEB1-5378D02996D3}', FT_TOC = '{43FF2FA1-EFD9-4C76-9EE2-10EA5722765F}';
const FF = '{109ADD3F-911B-49F5-A5D0-1791EDC8AED8}', NIL = '{00000000-0000-0000-0000-000000000000}';
const FDSO_H = '{BDE316E7-2665-4511-A4C4-8D4D0B7A9EAC}', FDSO_F = '{71FBA722-0F79-4A0B-BB13-899256426B24}';
const T1 = new Uint32Array(256); for (let i = 0; i < 256; i++) { let a = i; for (let k = 0; k < 8; k++) a = a & 1 ? 0xEDB88320 ^ (a >>> 1) : a >>> 1; T1[i] = a >>> 0; }
const crc32 = (u8) => { let c = 0xFFFFFFFF; for (let i = 0; i < u8.length; i++) c = T1[(c ^ u8[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
const TM = new Uint32Array(256); for (let i = 0; i < 256; i++) { let v = (i << 24) >>> 0; for (let k = 0; k < 8; k++) v = (v & 0x80000000) ? ((v << 1) ^ 0xAF) >>> 0 : (v << 1) >>> 0; TM[i] = v >>> 0; }
const mso = (u8) => { let c = 0; for (let i = 0; i < u8.length; i++) c = ((c << 8) ^ TM[((c >>> 24) ^ u8[i]) & 255]) >>> 0; return c >>> 0; };

// erlaubte Knoten in Revisionen ([MS-ONESTORE] 2.1.9)
const REV_ONE = new Set([0x0B0, 0x084, 0x022, 0x024, 0x028, 0x05A, 0x01C]);
const REV_TOC = new Set([0x059, 0x084, 0x021, 0x024, 0x025, 0x026, 0x028, 0x08C, 0x02D, 0x02E, 0x041, 0x042, 0x01C]);
const KNOWN = new Set([0x004, 0x008, 0x00C, 0x010, 0x014, 0x01B, 0x01C, 0x01E, 0x01F, 0x021, 0x022, 0x024, 0x025, 0x026, 0x028, 0x02D, 0x02E, 0x041, 0x042,
  0x059, 0x05A, 0x05C, 0x05D, 0x072, 0x073, 0x07C, 0x084, 0x08C, 0x090, 0x094, 0x0A4, 0x0A5, 0x0B0, 0x0B4, 0x0B8, 0x0C4, 0x0C5, 0x0FF]);

function check(u8, opts = {}) {
  const errors = [], warnings = [];
  const E = (m) => { if (errors.length < 200) errors.push(m); }, W = (m) => { if (warnings.length < 200) warnings.push(m); };
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  const g = (o) => ON.guidStr(u8, o);
  const u32 = (o) => dv.getUint32(o, true), u64 = (o) => Number(dv.getBigUint64(o, true));
  const stats = { lists: 0, nodes: 0, objects: 0, groups: 0, overrides: 0, tx: 0, fds: 0 };
  if (u8.length < 1024) return { errors: ['kürzer als 1024 Byte'], warnings, stats };
  // ---------------------------------------------------------------- Kopf
  const ft = g(0), isToc = ft === FT_TOC;
  if (ft !== FT_ONE && !isToc) E('guidFileType unbekannt: ' + ft);
  if (g(16) === NIL) E('guidFile ist leer');
  if (g(32) !== NIL) E('guidLegacyFileVersion muss leer sein');
  if (g(48) !== FF) E('guidFileFormat falsch');
  const ffv = isToc ? 0x1B : 0x2A;
  for (const o of [64, 68, 72, 76]) if (u32(o) !== ffv) E(`ffv an ${o} = 0x${u32(o).toString(16)} (erwartet 0x${ffv.toString(16)})`);
  if (u64(80) !== 0) E('fcrLegacyFreeChunkList muss null sein');
  if (u32(88) !== 0xFFFFFFFF || u32(92) !== 0) E('fcrLegacyTransactionLog muss fcrNil sein');
  const cTx = u32(96);
  if (!cTx) E('cTransactionsInLog = 0');
  if (u32(100) !== 0) E('cbLegacyExpectedFileLength muss 0 sein');
  if (u32(112) !== 0xFFFFFFFF || u32(116) !== 0) E('fcrLegacyFileNodeListRoot muss fcrNil sein');
  if (u64(196) !== u8.length) E(`cbExpectedFileLength ${u64(196)} ≠ Dateigrösse ${u8.length}`);
  if (g(212) === NIL) E('guidFileVersion ist leer');
  for (let i = 296; i < 1024; i++) if (u8[i]) { E('Kopf ab Byte 296 nicht leer'); break; }
  const ref12 = (o) => ({ stp: u64(o), cb: u32(o + 8) });
  const inFile = (r) => r.stp >= 0 && r.stp + r.cb <= u8.length;
  // ---------------------------------------------------------------- Transaktions-Log
  const counts = new Map();
  {
    let r = ref12(160), all = [], tx = 0, guard = 0;
    if (!inFile(r)) E('fcrTransactionLog zeigt ausserhalb der Datei');
    while (tx < cTx && r.cb && inFile(r) && guard++ < 100000) {
      let p = r.stp; const end = r.stp + r.cb - 12;
      while (p + 8 <= end && tx < cTx) {
        const src = u32(p), sw = u32(p + 4);
        if (src === 1) {
          const data = new Uint8Array(all.length * 8); all.forEach((e, i) => data.set(e, i * 8));
          const want = isToc ? mso(data) : crc32(data);
          if (sw !== want) E(`Transaktion ${tx}: Prüfsumme 0x${sw.toString(16)} ≠ 0x${want.toString(16)} (${isToc ? 'MsoCrc32' : 'CRC-32'} über alle Einträge davor)`);
          tx++;
        } else counts.set(src, sw);
        all.push(u8.subarray(p, p + 8));
        p += 8;
      }
      if (tx >= cTx) break;
      r = { stp: u64(p), cb: u32(p + 8) };
    }
    stats.tx = tx;
    if (tx !== cTx) E(`Transaktions-Log: ${tx} statt ${cTx} Transaktionen`);
  }
  // ---------------------------------------------------------------- Dateiknoten-Listen
  const listIds = new Map(), visited = new Set();
  const readList = (ref, where) => {
    const nodes = []; let id = null, seq = 0, frag = ref, guard = 0;
    if (!inFile(ref)) { E(`${where}: Liste ausserhalb der Datei (${ref.stp}/${ref.cb})`); return nodes; }
    if (visited.has(ref.stp)) { E(`${where}: Liste bei ${ref.stp} mehrfach verwendet`); return nodes; }
    visited.add(ref.stp);
    let max = Infinity;
    while (frag && frag.cb && guard++ < 10000) {
      if (!inFile(frag) || frag.cb < 36) { E(`${where}: Fragment ungültig`); break; }
      if (u32(frag.stp) !== 0xF5F7F4C4 || u32(frag.stp + 4) !== 0xA4567AB1) { E(`${where}: Listen-Kennung fehlt bei ${frag.stp}`); break; }
      const fid = u32(frag.stp + 8), fseq = u32(frag.stp + 12);
      if (id === null) { id = fid; if (listIds.has(id)) E(`Listen-ID 0x${id.toString(16)} doppelt`); listIds.set(id, ref.stp); if (id < 0x10) E(`Listen-ID 0x${id.toString(16)} < 0x10`); max = counts.has(id) ? counts.get(id) : (E(`Liste 0x${id.toString(16)} fehlt im Transaktions-Log`), Infinity); }
      else if (fid !== id) E(`${where}: Fragment mit fremder Listen-ID`);
      if (fseq !== seq) E(`${where}: nFragmentSequence ${fseq} statt ${seq}`);
      seq++;
      const endNodes = frag.stp + frag.cb - 20;
      if (u32(endNodes + 12) !== 0x8233BA4B || u32(endNodes + 16) !== 0x8BC215C3) E(`${where}: Fragment-Fussmarke fehlt`);
      let p = frag.stp + 16, more = false;
      while (p + 4 <= endNodes && nodes.length < max) {
        const h = u32(p), nid = h & 0x3FF, size = (h >>> 10) & 0x1FFF, stpF = (h >>> 23) & 3, cbF = (h >>> 25) & 3, base = (h >>> 27) & 15;
        if (nid === 0x0FF) { more = true; break; }
        if (!(h >>> 31)) E(`${where}: Knoten 0x${nid.toString(16)} bei ${p}: Reserved-Bit (31) ist 0 – MUSS 1 sein`);
        if (!KNOWN.has(nid)) E(`${where}: unbekannter Knoten 0x${nid.toString(16)} bei ${p}`);
        if (size < 4 || p + size > endNodes) { E(`${where}: Knoten 0x${nid.toString(16)} mit ungültiger Grösse ${size}`); break; }
        if (base > 2) E(`${where}: BaseType ${base}`);
        if (base === 0 && cbF !== 0) E(`${where}: Knoten 0x${nid.toString(16)}: CbFormat muss bei BaseType 0 null sein`);
        const n = { id: nid, at: p, size, base, h };
        if (base) {
          let q = p + 4, stp, cb;
          if (stpF === 0) { stp = u64(q); q += 8; } else if (stpF === 1) { stp = u32(q); q += 4; if (stp === 0xFFFFFFFF) stp = -1; } else if (stpF === 2) { stp = dv.getUint16(q, true) * 8; q += 2; if (stp === 0xFFFF * 8) stp = -1; } else { stp = u32(q) * 8; q += 4; }
          if (stpF === 0 && stp === 0xFFFFFFFFFFFFFFFF) stp = -1;
          if (cbF === 0) { cb = u32(q); q += 4; } else if (cbF === 1) { cb = u64(q); q += 8; } else if (cbF === 2) { cb = u8[q] * 8; q += 1; } else { cb = dv.getUint16(q, true) * 8; q += 2; }
          n.ref = { stp, cb }; n.body = q;
          if (stp !== -1 && !inFile(n.ref)) E(`${where}: Knoten 0x${nid.toString(16)} zeigt ausserhalb der Datei`);
        } else n.body = p + 4;
        nodes.push(n);
        stats.nodes++;
        p += size;
      }
      if (nodes.length >= max) break;
      const nx = { stp: u64(endNodes), cb: u32(endNodes + 8) };
      if (!more && (nx.stp === 0xFFFFFFFFFFFFFFFF || !nx.cb)) { if (max !== Infinity && nodes.length < max) E(`${where}: Liste 0x${id.toString(16)} hat ${nodes.length} statt ${max} Knoten`); break; }
      frag = nx;
    }
    stats.lists++;
    return nodes;
  };
  const eg = (o) => g(o) + ':' + u32(o + 16);
  // ---------------------------------------------------------------- Wurzel
  const root = readList(ref12(172), 'Wurzel');
  const spaces = new Map();
  let rootSpace = null, fdsList = null;
  for (const n of root) {
    if (n.id === 0x004) rootSpace = eg(n.body);
    else if (n.id === 0x008) spaces.set(eg(n.body), n.ref);
    else if (n.id === 0x090) fdsList = n.ref;
    else E(`Wurzel: unerwarteter Knoten 0x${n.id.toString(16)}`);
  }
  if (!rootSpace) E('ObjectSpaceManifestRootFND fehlt');
  else if (!spaces.has(rootSpace)) E('Wurzel-Objektraum nicht vorhanden');
  // ---------------------------------------------------------------- Dateidaten
  const fds = new Set();
  if (fdsList) for (const n of readList(fdsList, 'Dateidaten')) {
    if (n.id !== 0x094) { E('Dateidaten: unerwarteter Knoten'); continue; }
    stats.fds++;
    const guid = g(n.body); fds.add(guid);
    const r = n.ref;
    if (g(r.stp) !== FDSO_H) E('FileDataStoreObject: Kopf-GUID falsch');
    const len = u64(r.stp + 16);
    if (u32(r.stp + 24) !== 0 || u64(r.stp + 28) !== 0) E('FileDataStoreObject: unused/reserved nicht null');
    const end = r.stp + 36 + len, pad = (8 - ((end + 16 - r.stp) % 8)) % 8;
    if (r.stp + r.cb !== end + pad + 16) E(`FileDataStoreObject: Grösse passt nicht (cb ${r.cb}, Daten ${len})`);
    if (g(r.stp + r.cb - 16) !== FDSO_F) E('FileDataStoreObject: Fuss-GUID falsch');
  }
  // ---------------------------------------------------------------- Objekträume
  const st = new ON.OneStore(u8, 'prüfen');   // zum Lesen der Eigenschaften
  const allSpaces = new Set(spaces.keys());
  const osidRefs = [];
  for (const [gosid, ref] of spaces) {
    const where = 'Raum ' + gosid.slice(1, 9);
    const list = readList(ref, where);
    if (!list.length || list[0].id !== 0x00C || eg(list[0].body) !== gosid) E(`${where}: ObjectSpaceManifestListStart fehlt/passt nicht`);
    const revRefs = list.filter(n => n.id === 0x010);
    if (!revRefs.length) { E(`${where}: keine Revisionsliste`); continue; }
    const revs = readList(revRefs[revRefs.length - 1].ref, where + ' Revisionen');
    if (!revs.length || revs[0].id !== 0x014) E(`${where}: RevisionManifestListStart fehlt`);
    let i = 1, nRev = 0;
    while (i < revs.length) {
      const s = revs[i];
      if (s.id === 0x05C || s.id === 0x05D) { i++; continue; }   // RevisionRole(AndContext)Declaration zwischen Revisionen
      const okStart = isToc ? s.id === 0x01B : (s.id === 0x01E || s.id === 0x01F);
      if (!okStart) { E(`${where}: Revision beginnt mit 0x${s.id.toString(16)}`); break; }
      nRev++;
      let j = i + 1, table = null;
      const declared = new Map(), crefs = [], roots = [];
      const groupCrefs = [];
      const declare = (d, tbl) => {
        const body = d.body, coid = u32(body), idx = coid >>> 8, nn = coid & 0xFF;
        if (!tbl || !tbl.has(idx)) { E(`${where}: Objekt-ID mit unbekanntem GUID-Index ${idx}`); return; }
        const oid = tbl.get(idx) + ':' + nn;
        if (declared.has(oid)) E(`${where}: Objekt ${oid} doppelt deklariert`);
        let jcid, cRef, fl = 0;
        if (d.id === 0x0A4 || d.id === 0x0C4) { jcid = u32(body + 4); fl = u8[body + 8]; cRef = u8[body + 9]; }
        else if (d.id === 0x0A5 || d.id === 0x0C5) { jcid = u32(body + 4); fl = u8[body + 8]; cRef = u32(body + 9); }
        else if (d.id === 0x072) { jcid = u32(body + 4); cRef = u8[body + 8]; }
        else if (d.id === 0x073) { jcid = u32(body + 4); cRef = u32(body + 8); }
        else if (d.id === 0x02D || d.id === 0x02E) { jcid = 0x20000 | (dv.getUint16(body + 4, true) & 0x3FF); fl = u8[body + 6]; cRef = d.id === 0x02D ? u8[body + 10] : u32(body + 10); }
        if ((d.id === 0x0C4 || d.id === 0x0C5) && (!(jcid & 0x00100000) || !(jcid & 0x00020000))) E(`${where}: schreibgeschütztes Objekt ohne IsReadOnly/IsPropertySet (jcid 0x${jcid.toString(16)})`);
        if ((d.id === 0x0A4 || d.id === 0x0A5) && (jcid & 0x00100000)) E(`${where}: Objekt mit IsReadOnly in normaler Deklaration`);
        if (d.id === 0x072 || d.id === 0x073) {
          const cch = u32(body + 9), ref = Buffer.from(u8.subarray(body + 13, body + 13 + cch * 2)).toString('utf16le');
          const m = /^<ifndf>(\{[0-9A-F-]{36}\})$/i.exec(ref);
          if (m && !fds.has(m[1].toUpperCase())) E(`${where}: Dateiverweis ${ref} ohne Daten`);
        }
        declared.set(oid, { jcid, cRef, fl, node: d, tbl });
        crefs.push(cRef >>> 0);
        stats.objects++;
      };
      for (; j < revs.length && revs[j].id !== 0x01C; j++) {
        const n = revs[j];
        if (!(isToc ? REV_TOC : REV_ONE).has(n.id)) E(`${where}: Knoten 0x${n.id.toString(16)} in Revision nicht erlaubt`);
        if (n.id === 0x0B0) {
          stats.groups++;
          const gid = eg(n.body);
          if (!revs[j + 1] || revs[j + 1].id !== 0x084) E(`${where}: nach ObjectGroupListReferenceFND fehlt ObjectInfoDependencyOverridesFND (MUSS)`);
          const gl = readList(n.ref, where + ' Gruppe');
          if (!gl.length || gl[0].id !== 0x0B4 || eg(gl[0].body) !== gid) E(`${where}: ObjectGroupStart fehlt/passt nicht`);
          if (!gl.length || gl[gl.length - 1].id !== 0x0B8) E(`${where}: ObjectGroupEnd fehlt`);
          let tbl = null; const gc = [];
          for (const d of gl) {
            if (d.id === 0x022) tbl = new Map();
            else if (d.id === 0x024) { const idx = u32(d.body); if (tbl.has(idx)) E(`${where}: GUID-Index ${idx} doppelt`); tbl.set(idx, g(d.body + 4)); }
            else if ([0x0A4, 0x0A5, 0x0C4, 0x0C5, 0x072, 0x073].includes(d.id)) { const before = crefs.length; declare(d, tbl); if (crefs.length > before) gc.push(crefs[crefs.length - 1]); }
            else if (![0x0B4, 0x0B8, 0x028, 0x08C].includes(d.id)) E(`${where}: Knoten 0x${d.id.toString(16)} in Objektgruppe nicht erlaubt`);
          }
          groupCrefs.push(gc);
        } else if (n.id === 0x084) {
          stats.overrides++;
          const nil = n.ref && n.ref.stp === -1;
          const at = nil ? n.body : n.ref.stp;
          const c8 = u32(at), c32 = u32(at + 4), crc = u32(at + 8);
          const prev = revs[j - 1];
          const list = prev && prev.id === 0x0B0 ? groupCrefs[groupCrefs.length - 1] : (isToc ? crefs : []);
          const buf = new Uint8Array(list.length * 4 + c8 * 5 + c32 * 8); const bv = new DataView(buf.buffer);
          list.forEach((v, k) => bv.setUint32(k * 4, v, true));
          buf.set(u8.subarray(at + 12, at + 12 + c8 * 5 + c32 * 8), list.length * 4);
          const want = isToc ? mso(buf) : crc32(buf);
          if (crc !== want) E(`${where}: ObjectInfoDependencyOverrides-Prüfsumme 0x${crc.toString(16)} ≠ 0x${want.toString(16)}`);
          if (nil && (c8 * 5 + c32 * 8 + 12) >= 1024) E(`${where}: Überschreibungen ≥ 1024 Byte direkt im Knoten`);
        } else if (n.id === 0x021 || n.id === 0x022) table = new Map();
        else if (n.id === 0x024) { if (!table) E(`${where}: GUID-Eintrag ohne Tabelle`); else table.set(u32(n.body), g(n.body + 4)); }
        else if ([0x02D, 0x02E].includes(n.id)) declare(n, table);
        else if (n.id === 0x05A) roots.push(eg(n.body));
        else if (n.id === 0x059) { const c = u32(n.body), idx = c >>> 8; if (!table || !table.has(idx)) E(`${where}: Wurzel mit unbekanntem GUID-Index`); else roots.push(table.get(idx) + ':' + (c & 0xFF)); }
      }
      if (j >= revs.length) { E(`${where}: RevisionManifestEnd fehlt`); break; }
      // Wurzeln und Verweise prüfen
      for (const r of roots) if (!declared.has(r)) E(`${where}: Wurzel ${r} ist nicht deklariert`);
      const counted = new Map();
      for (const r of roots) counted.set(r, (counted.get(r) || 0) + 1);
      for (const [oid, o] of declared) {
        if (o.node.id === 0x072 || o.node.id === 0x073) continue;
        const { ids, nOid, nOsid, nCtx, osidPresent, bad } = streams(o.node, o.tbl, isToc);
        for (const m of bad || []) E(`${where}: ${oid}: ${m}`);
        if (ids === null) { E(`${where}: Eigenschaften von ${oid} nicht lesbar`); continue; }
        const hasOid = !!(o.fl & 1), hasOsid = !!(o.fl & 2);
        if (hasOid !== (nOid > 0)) E(`${where}: ${oid}: fHasOidReferences passt nicht zu den Verweisen`);
        if (ids && hasOsid !== !!osidPresent) E(`${where}: ${oid}: fHasOsidReferences passt nicht zum OSID-Strom`);
        for (const x of ids.oids) { if (!declared.has(x)) W(`${where}: ${oid} verweist auf nicht deklariertes Objekt ${x}`); counted.set(x, (counted.get(x) || 0) + 1); }
        for (const x of ids.osids) osidRefs.push([where, x]);
      }
      for (const [oid, o] of declared) { const c = counted.get(oid) || 0; if (o.node.id !== 0x072 && c && o.cRef !== c && !(c > 255 && o.cRef >= 255)) W(`${where}: ${oid} cRef ${o.cRef}, gezählt ${c}`); }
      i = j + 1;
    }
    if (!nRev) E(`${where}: keine Revision`);
  }
  for (const [where, x] of osidRefs) if (!allSpaces.has(x)) E(`${where}: verweist auf fehlenden Objektraum ${x}`);
  if (!isToc && !errors.length && opts.rules !== false) { const r = rules(u8); for (const e of r.errors) E('MS-ONE: ' + e); for (const w of r.warnings) W('MS-ONE: ' + w); stats.objects2 = r.n; }
  return { errors, warnings, stats };

  // Verweis-Ströme eines Objekts lesen (CompactIDs → ExtendedGUID)
  function streams(node, tbl, toc) {
    try {
      const r = node.ref; let p = r.stp; const end = r.stp + r.cb;
      const hdr = () => { const x = u32(p); p += 4; const c = x & 0xFFFFFF; const list = []; for (let k = 0; k < c; k++) { const v = u32(p); p += 4; const idx = v >>> 8; if (!tbl || !tbl.has(idx)) throw new Error('GUID-Index ' + idx); list.push(tbl.get(idx) + ':' + (v & 0xFF)); } return { x, list }; };
      const a = hdr(); let b = { x: 0, list: [] }, c = { x: 0, list: [] };
      const bad = [];
      if ((a.x & 0x3F000000) !== 0) throw new Error('Reserved-Bits im Strom-Kopf');
      const osidPresent = !(a.x & 0x80000000);
      if (osidPresent) {
        b = hdr();
        if (b.x & 0x3F000000) bad.push('Reserved-Bits im OSID-Kopf');
        if (b.x & 0x80000000) bad.push('OSID-Kopf mit OsidStreamNotPresent (MUSS 0 sein)');
        if (b.x & 0x40000000) { c = hdr(); if (c.x & 0xFF000000) bad.push('Kontext-Kopf mit gesetzten Bits (MÜSSEN 0 sein)'); }
      }
      // [MS-ONESTORE] 2.6.2: ExtendedStreamsPresent im OID-Kopf genau dann, wenn Kontexte folgen
      if (!!(a.x & 0x40000000) !== !!(osidPresent && (b.x & 0x40000000))) bad.push('ExtendedStreamsPresent im OID-Kopf passt nicht zu den Kontexten');
      if (p > end) throw new Error('Ströme länger als die Daten');
      void toc;
      return { ids: { oids: a.list, osids: b.list }, nOid: a.list.length, nOsid: b.list.length, nCtx: c.list.length, osidPresent, bad };
    } catch (e) { return { ids: null }; }
  }
}

/* Inhaltsregeln aus [MS-ONE] 2.1 und 2.2 (MUST → Fehler, SHOULD → Hinweis), nur für Abschnitte (.one).
 * An den echten OneNote-Dateien geprüft: dort keine Fehler. */
const VH_CTX = '{7111497F-1B6B-4209-9491-C98B04CF4C5A}:1';
const JC = {
  Section: 0x00060007, Series: 0x00060008, Page: 0x0006000B, Outline: 0x0006000C, OE: 0x0006000D, RichText: 0x0006000E, Image: 0x00060011,
  Ink: 0x00060014, Group: 0x00060019, Table: 0x00060022, Row: 0x00060023, Cell: 0x00060024, Title: 0x0006002C, File: 0x00060035,
  Manifest: 0x00060037, VhContent: 0x0006003C, PageMeta: 0x00020030, SectionMeta: 0x00020031, RevMeta: 0x00020044, VhMeta: 0x00020046,
  Style: 0x0012004D, Pic: 0x00080039,
};
function rules(u8) {
  const errors = [], warnings = [];
  const E = (m) => { if (errors.length < 200) errors.push(m); }, W = (m) => { if (warnings.length < 200) warnings.push(m); };
  const P = ON.P, NotebookColor = 0x14001CBE;
  let st;
  try { st = new ON.OneStore(u8, 'x'); } catch (e) { return { errors: ['nicht lesbar: ' + e.message], warnings, n: 0 }; }
  const u32v = (b) => (b instanceof Uint8Array && b.length >= 4) ? new DataView(b.buffer, b.byteOffset, 4).getUint32(0, true) : NaN;
  const f32v = (b, at = 0) => new DataView(b.buffer, b.byteOffset + at, 4).getFloat32(0, true);
  const has16 = (b, ...codes) => { if (!(b instanceof Uint8Array)) return false; for (let i = 0; i + 1 < b.length; i += 2) if (codes.includes(b[i] | (b[i + 1] << 8))) return true; return false; };
  const arr = (v) => Array.isArray(v) ? v : (v == null ? [] : [v]);
  const imgOk = (d) => d && d.length >= 4 && (
    (d[0] === 0x89 && d[1] === 0x50 && d[2] === 0x4E && d[3] === 0x47) || (d[0] === 0xFF && d[1] === 0xD8) ||        // PNG, JPEG
    (d[0] === 0x42 && d[1] === 0x4D) || (d[0] === 40 && !d[1] && !d[2] && !d[3]) ||                                    // BMP/DIB
    (d[0] === 1 && !d[1] && !d[2] && !d[3]) || (d[0] === 0xD7 && d[1] === 0xCD) || (d[0] <= 2 && d[1] === 0 && d[2] === 9 && d[3] === 0) ||   // EMF, WMF
    (d[0] === 0x49 && d[1] === 0x49 && d[2] === 0x2A) || (d[0] === 0x4D && d[1] === 0x4D && d[3] === 0x2A));          // TIFF
  let n = 0;
  for (const [sid, sp] of st.spaces) {
    for (const [key, rid] of sp.roles) {
      const [rRole, ctxRaw] = key.split('|'); const ctx = ctxRaw || null;
      const view = st.revisionView(sid, rid);
      const kind = sid === st.rootSpace ? 'section' : ctx === VH_CTX ? 'vh' : ctx ? 'other' : 'page';
      const where = `${kind === 'section' ? 'Abschnitt' : kind === 'vh' ? 'Versionsverlauf' : 'Seite'} ${sid.slice(1, 9)}`;
      if (kind === 'other') { W(`${where}: unbekannter Kontext ${ctx}`); continue; }
      if (kind === 'vh' && rRole !== '1') E(`${where}: Versionsverlauf nicht mit Rolle 1`);
      const objs = view.objects, jc = (oid) => { const o = objs.get(oid); return o ? o.jcid : 0; };
      const root = (r, want, must = true) => {
        const oid = view.roots.get(r);
        if (!oid) { if (must) E(`${where}: Wurzel-Rolle ${r} fehlt`); return; }
        if (jc(oid) !== want) E(`${where}: Wurzel-Rolle ${r} ist 0x${jc(oid).toString(16)}, verlangt 0x${want.toString(16)}`);
      };
      for (const r of view.roots.keys()) if (![1, 2, 4].includes(r)) E(`${where}: Wurzel-Rolle ${r} unzulässig`);
      if (kind === 'section') { root(1, JC.Section); root(2, JC.SectionMeta); }
      else if (kind === 'page') { root(1, JC.Manifest); root(2, JC.PageMeta); root(4, JC.RevMeta, false); }
      else { root(1, JC.VhContent); root(2, JC.VhMeta); }
      // Eltern und Verwendung der Formatobjekte
      const parent = new Map(), styleUse = new Map();
      for (const [oid, o] of objs) {
        const p = st.props(o);
        for (const id of [P.ContentChildNodes, P.ElementChildNodes, P.StructureElementChildNodes]) for (const c of arr(p.get(id))) if (c) parent.set(c, oid);
        if (p.has(P.ParagraphStyle)) styleUse.set(p.get(P.ParagraphStyle), 'para');
        for (const c of arr(p.get(P.TextRunFormatting))) if (!styleUse.has(c)) styleUse.set(c, 'text');
      }
      for (const [oid, o] of objs) {
        n++;
        const p = st.props(o), at = `${where} 0x${o.jcid.toString(16)} ${oid.slice(-4)}`;
        const kids = (id) => arr(p.get(id)).filter(Boolean);
        const is = (id) => p.get(id) === true;
        const allOf = (id, ok, what, should = false) => { for (const c of kids(id)) if (!ok.includes(jc(c))) (should ? W : E)(`${at}: ${what} verweist auf 0x${jc(c).toString(16)}`); };
        const par = jc(parent.get(oid));
        const offsets = () => {
          const h = p.has(P.OffsetFromParentHoriz) && p.has(P.OffsetFromParentVert);
          if (par === JC.Page && !h) E(`${at}: direkt auf der Seite ohne OffsetFromParent`);
          if (par === JC.OE && (p.has(P.OffsetFromParentHoriz) || p.has(P.OffsetFromParentVert))) E(`${at}: in einer Gliederung mit OffsetFromParent`);
        };
        const pic = (must) => {
          const pc = p.get(P.PictureContainer);
          if (!pc) { if (must) E(`${at}: PictureContainer fehlt`); return; }
          const t = objs.get(pc);
          if (t && t.jcid === 0x0008003A) return;   // zweite Bildablage (Ausdrucke), Format nicht festgelegt
          if (!t || t.jcid !== JC.Pic) { E(`${at}: PictureContainer ist kein jcidPictureContainer14 (${t ? "0x" + t.jcid.toString(16) : "fehlt " + pc})`); return; }
          const fb = st.fileBytes(t);
          if (fb && fb.data && !imgOk(fb.data)) E(`${at}: Bildformat nicht DIB/EMF/JPEG/PNG/TIFF/WMF (${Buffer.from(fb.data.subarray(0, 4)).toString('hex')})`);
        };
        switch (o.jcid) {
          case JC.Section: allOf(P.ElementChildNodes, [JC.Series], 'ElementChildNodes'); break;
          case JC.SectionMeta: if (!p.has(NotebookColor)) W(`${at}: NotebookColor fehlt`); break;
          case JC.PageMeta: if (!p.has(P.NotebookManagementEntityGuid)) E(`${at}: NotebookManagementEntityGuid fehlt`); break;
          case JC.Series: {
            const k = kids(P.ChildGraphSpaceElementNodes);
            if (!k.length) E(`${at}: ChildGraphSpaceElementNodes fehlt/leer`);
            for (const s of k) if (!st.spaces.has(s)) E(`${at}: Seitenraum ${s} fehlt`);
            break;
          }
          case JC.Manifest: {
            const k = kids(P.ContentChildNodes);
            if (k.length !== 1 || jc(k[0]) !== JC.Page) E(`${at}: ContentChildNodes muss genau ein jcidPageNode sein`);
            if (p.has(P.VersionHistoryGraphSpaceContextNodes)) {
              const c = arr(p.get(P.VersionHistoryGraphSpaceContextNodes));
              if (c.length !== 1) E(`${at}: VersionHistoryGraphSpaceContextNodes muss genau ein Element haben`);
              else if (c[0] !== VH_CTX) E(`${at}: Versionsverlauf-Kontext ${c[0]} statt ${VH_CTX}`);
              else if (!sp.roles.has('1|' + VH_CTX)) E(`${at}: Revision des Versionsverlaufs fehlt`);
            }
            break;
          }
          case JC.Page: {
            if (p.has(P.Deletable) && !is(P.IsConflictPage)) E(`${at}: Deletable auf normaler Seite`);
            const t = kids(P.StructureElementChildNodes);
            if (p.has(P.StructureElementChildNodes) && (t.length !== 1 || jc(t[0]) !== JC.Title)) E(`${at}: StructureElementChildNodes muss genau ein jcidTitleNode sein`);
            allOf(P.ElementChildNodes, [JC.Image, JC.Outline, JC.File, JC.Ink], 'ElementChildNodes', true);
            break;
          }
          case JC.Title: {
            const k = kids(P.ElementChildNodes);
            if (k.length < 1 || k.length > 2) E(`${at}: Titel mit ${k.length} Gliederungen`);
            allOf(P.ElementChildNodes, [JC.Outline], 'ElementChildNodes');
            if (!k.some(c => st.props(objs.get(c) || {}) && (st.props(objs.get(c)) || new Map()).get(P.IsTitleText) === true)) E(`${at}: keine Gliederung mit IsTitleText`);
            break;
          }
          case JC.Outline: {
            const k = kids(P.ElementChildNodes);
            if (!k.length) E(`${at}: Gliederung ohne ElementChildNodes`);
            allOf(P.ElementChildNodes, [JC.OE, JC.Group], 'ElementChildNodes');
            if (is(P.IsTitleText)) {
              if (!is(P.EnforceOutlineStructure)) E(`${at}: Titel-Gliederung ohne EnforceOutlineStructure`);
              if (!is(P.LayoutTightAlignment)) E(`${at}: Titel-Gliederung ohne LayoutTightAlignment`);
              if (par !== JC.Title) E(`${at}: IsTitleText ausserhalb des Titels`);
            }
            if (p.has(P.Deletable) !== is(P.IsTitleDate)) E(`${at}: Deletable passt nicht zu IsTitleDate`);
            offsets();
            break;
          }
          case JC.OE: {
            const k = kids(P.ContentChildNodes);
            if (k.length !== 1 && !(k.length === 0 && kids(P.ElementChildNodes).length)) E(`${at}: ContentChildNodes mit ${k.length} Elementen`);
            allOf(P.ContentChildNodes, [JC.RichText, JC.Table, JC.Image, JC.File], 'ContentChildNodes', true);
            allOf(P.ElementChildNodes, [JC.OE, JC.Group], 'ElementChildNodes');
            const po = objs.get(parent.get(oid)), dateOutline = po && po.jcid === JC.Outline && st.props(po).get(P.IsTitleDate) === true;
            if (p.has(P.Deletable) !== !!dateOutline) E(`${at}: Deletable passt nicht zur Datums-Gliederung`);
            break;
          }
          case JC.RichText: {
            if (has16(p.get(P.RichEditTextUnicode), 10)) E(`${at}: RichEditTextUnicode enthält Zeilenvorschub (LF)`);
            if (p.has(P.Deletable) !== (is(P.IsTitleTime) || is(P.IsTitleDate))) E(`${at}: Deletable passt nicht zu IsTitleTime/IsTitleDate`);
            if (!p.has(P.ParagraphStyle)) W(`${at}: ohne ParagraphStyle`);
            else if (jc(p.get(P.ParagraphStyle)) !== JC.Style) E(`${at}: ParagraphStyle ist kein jcidParagraphStyleObject`);
            break;
          }
          case JC.Style: {
            const use = styleUse.get(oid);
            if (use === 'para' && !p.has(P.ParagraphStyleId)) E(`${at}: Absatzformat ohne ParagraphStyleId`);
            if (use === 'text' && !p.has(P.LanguageID)) E(`${at}: Textformat ohne LanguageID`);
            break;
          }
          case JC.Image: {
            if (p.has(P.WebPictureContainer14)) { const t = objs.get(p.get(P.WebPictureContainer14)); if (!t || t.jcid !== JC.Pic) E(`${at}: WebPictureContainer14 ist kein jcidPictureContainer14`); }
            if (p.has(0x200035C1)) { const t = objs.get(p.get(0x200035C1)); if (!t || t.fileRef === undefined) E(`${at}: Quelldatei des Ausdrucks (0x200035C1) ist kein Dateiobjekt`); }
            const up = p.has(P.ImageUploadState) ? u32v(p.get(P.ImageUploadState)) : 0;
            if (!up) { if (!p.has(P.LanguageID)) E(`${at}: Bild ohne LanguageID`); pic(true); }
            else if (p.has(P.PictureContainer) || p.has(P.LanguageID)) E(`${at}: Bild im Upload mit PictureContainer/LanguageID`);
            offsets();
            if (p.has(P.IsBackground) && par !== JC.Page) E(`${at}: IsBackground ausserhalb der Seite`);
            break;
          }
          case JC.File: {
            pic(true);
            if (!p.has(P.LanguageID)) W(`${at}: Anhang ohne LanguageID`);   // MUSS laut Spezifikation, echtes OneNote lässt es aber weg
            if (!p.has(P.RichEditTextUnicode)) E(`${at}: Anhang ohne RichEditTextUnicode`);
            else if (has16(p.get(P.RichEditTextUnicode), 10, 13)) E(`${at}: RichEditTextUnicode des Anhangs mit CR/LF`);
            offsets();
            break;
          }
          case JC.Table: {
            const rows = u32v(p.get(P.RowCount)), cols = u32v(p.get(P.ColumnCount));
            if (!(rows > 0)) E(`${at}: RowCount ${rows}`);
            if (!(cols >= 1 && cols <= 255)) E(`${at}: ColumnCount ${cols}`);
            const w = p.get(P.TableColumnWidths);
            if (!(w instanceof Uint8Array)) E(`${at}: TableColumnWidths fehlt`);
            else if (w[0] !== cols || w.length < 1 + 4 * cols) E(`${at}: TableColumnWidths für ${w[0]} statt ${cols} Spalten`);
            else for (let i = 0; i < cols; i++) if (!(f32v(w, 1 + 4 * i) >= 1)) { E(`${at}: Spaltenbreite ${i} < 1.0 (${f32v(w, 1 + 4 * i)})`); break; }
            const lk = p.get(P.TableColumnsLocked);
            if (lk instanceof Uint8Array && lk[0] !== cols) E(`${at}: TableColumnsLocked für ${lk[0]} statt ${cols} Spalten`);
            const k = kids(P.ElementChildNodes);
            if (k.length !== rows) E(`${at}: ${k.length} Zeilen statt RowCount ${rows}`);
            allOf(P.ElementChildNodes, [JC.Row], 'ElementChildNodes');
            for (const r of k) { const rk = arr((st.props(objs.get(r) || {}) || new Map()).get(P.ElementChildNodes)).filter(Boolean); if (rk.length !== cols) { E(`${at}: Zeile mit ${rk.length} Zellen statt ${cols}`); break; } }
            break;
          }
          case JC.Row: allOf(P.ElementChildNodes, [JC.Cell], 'ElementChildNodes'); if (!kids(P.ElementChildNodes).length) E(`${at}: Zeile ohne Zellen`); break;
          case JC.Cell: {
            if (!is(P.EnforceOutlineStructure)) E(`${at}: Zelle ohne EnforceOutlineStructure`);
            if (p.get(P.OutlineElementChildLevel) !== 1) E(`${at}: Zelle mit OutlineElementChildLevel ${p.get(P.OutlineElementChildLevel)}`);
            if (!kids(P.ElementChildNodes).length) E(`${at}: Zelle ohne Inhalt`);
            allOf(P.ElementChildNodes, [JC.OE], 'ElementChildNodes');
            break;
          }
        }
      }
    }
  }
  return { errors, warnings, n };
}

if (require.main === module) {
  const fs = require('fs');
  let bad = 0;
  for (const f of process.argv.slice(2)) {
    const b = fs.readFileSync(f);
    const r = check(new Uint8Array(b.buffer, b.byteOffset, b.length));
    console.log(`${r.errors.length ? 'FEHLER' : 'ok    '} ${f.split('/').pop()} – ${JSON.stringify(r.stats)}${r.warnings.length ? ` (${r.warnings.length} Hinweise)` : ''}`);
    for (const e of r.errors.slice(0, 12)) console.log('   ✗ ' + e);
    for (const w of r.warnings.slice(0, 4)) console.log('   ! ' + w);
    if (r.errors.length) bad++;
  }
  process.exit(bad ? 1 : 0);
}
module.exports = { check };
