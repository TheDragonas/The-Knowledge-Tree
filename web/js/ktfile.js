'use strict';
/* KnowledgeTree-Datei (seit 1.24): EIN Format für Backup und Export – im Browser und im Windows-Programm gleich.
 *
 * Eine ZIP-Datei mit dem Saves-Ordner genau so, wie ihn das Windows-Programm neben der EXE anlegt:
 *   KnowledgeTree.json                 Beschreibung { typ: 'KnowledgeTree-Datei', version: 3, art: 'backup'|'export',
 *                                      name, erstellt, programm, quelle, seiten, bilder }
 *   Saves/_struktur.json               Reihenfolge der obersten Gruppen (Notizbücher)
 *   Saves/<Gruppe>/_gruppe.json        ID, Name, Farbe, Art, Reihenfolge der Untergruppen und Seiten
 *   Saves/<Gruppe>/<Seite>.seite.json  eine Seite (kompaktes JSON, gepackt)
 *   Saves/_Bilder/<sha1>.<ext>         Bilder und Anhänge (unverändert übernommen – sie sind schon gepackt)
 * Entpackt ist das ein fertiger Saves-Ordner für das Windows-Programm. Gegenüber dem JSON bis 1.23 fällt das
 * Base64 der Bilder weg (+33 %) und die Seiten werden gepackt: 81 MB → rund 47 MB.
 *
 * Gelesen werden ausserdem: Sicherungen und KT-Dateien bis 1.23 (.json / .knowledgetree.json mit Bildern als
 * Daten-URL), EXE-Backups bis 1.23 (Saves_….zip, ohne Bilder) und ein gezippter Saves- oder Notizbuch-Ordner.
 *
 * Seit 1.25 zusätzlich:
 *   • Interaktive KnowledgeTree-Datei (.knowledgetree.html): das ganze Programm (Webseiten-Fassung) mit der
 *     KT-Datei als Base-122 (bis 1.25 Base64) in <script type="application/x-knowledgetree" id="kt-datei" data-bytes="…"
 *     data-enc="b122" data-groesse="…"> im Kopf (data-bytes = Länge des Blocks in Bytes, data-groesse = Grösse des ZIP).
 *     Geöffnet läuft sie als eigenes kleines KnowledgeTree (backend-browser.js → fileBackend); eingelesen wird
 *     sie wie jede KT-Datei (nur dieser Block wird gelesen).
 *   • .json wie bis 1.23 (writeJson) – für ältere Versionen.
 *   • Sicherung wie bei OneNote (writeFolder/readFolder): ein Ordner je Notizbuch und Abschnittsgruppe, eine
 *     KT-Datei je Abschnitt („<Abschnitt>.knowledgetree.zip“, art 'abschnitt'), dazu je Ordner _gruppe.json und
 *     oben KnowledgeTree.json (typ 'KnowledgeTree-Sicherung', Reihenfolge der Notizbücher) – wie die Ordner,
 *     .one-Dateien und „Open Notebook.onetoc2“ von OneNote. Bilder, die mehrere Abschnitte brauchen, liegen
 *     einmal in _Bilder/ oben im Backup. Als Ordner oder als ZIP dieses Ordners lesbar.
 * Alles stückweise: geschrieben wird Eintrag für Eintrag in Blob-Teile, gelesen nur das Inhaltsverzeichnis und
 * dann jede Seite einzeln (openZip aus filepages.js) – nie die ganze Datei als ein Stück im Speicher. */

const KtFile = (() => {
  const NAME_RE = /[0-9a-f]{40}\.[a-z0-9]{1,8}/g;
  const ASSET = /^[0-9a-f]{40}\.[a-z0-9]{1,8}$/;
  const PAGE_SUFFIX = '.seite.json';
  const enc = new TextEncoder();
  const MIME = {
    png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml', bmp: 'image/bmp',
    pdf: 'application/pdf', txt: 'text/plain', csv: 'text/csv', json: 'application/json', html: 'text/html', htm: 'text/html', xml: 'application/xml',
    mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime', mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg', m4a: 'audio/mp4',
    doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ppt: 'application/vnd.ms-powerpoint', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  };
  // diese Formate sind ungepackt (Text, Vektor, Rohbild) – alle anderen (PNG, JPEG, PDF, Office …) bleiben, wie sie sind
  const PACK = /^(svg|bmp|txt|csv|tsv|json|xml|html?|rtf|md|tex|log|ini|wmf|emf|tiff?|ico|ps|eps|ttf|otf|wav)$/;
  const extOf = (name) => String(name).split('.').pop().toLowerCase();
  const mime = (name) => MIME[extOf(name)] || 'application/octet-stream';

  /* ---------------------------------------------------------- CRC-32 und Packen */
  let table = null;
  function crc32(u8, crc = 0) {
    if (!table) { table = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; table[n] = c >>> 0; } }
    let c = (crc ^ 0xFFFFFFFF) >>> 0;
    for (let i = 0; i < u8.length; i++) c = table[(c ^ u8[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }
  async function deflate(u8) {
    if (typeof CompressionStream === 'undefined') return null;
    return new Uint8Array(await new Response(new Blob([u8]).stream().pipeThrough(new CompressionStream('deflate-raw'))).arrayBuffer());
  }

  /* ---------------------------------------------------------- ZIP schreiben
   * Ohne Datenbeschreibung (Grösse und Prüfsumme stehen vorne), UTF-8-Namen, ZIP64 erst wenn nötig (> 4 GB oder
   * > 65535 Einträge). Ergebnis ist ein Blob aus Teilen: Bilder bleiben die Blobs aus dem Speicher (keine Kopie). */
  function zipWriter() {
    const parts = [], central = [];
    let off = 0, count = 0;
    const d = new Date();
    const dosTime = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
    const dosDate = ((Math.max(1980, d.getFullYear()) - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
    const BIG = 0xFFFFFFFF;
    return {
      /* data: Zeichenkette, Uint8Array oder Blob; opts.pack: packen (wenn es kleiner wird) */
      async add(name, data, opts = {}) {
        let raw = typeof data === 'string' ? enc.encode(data) : data;
        let usize, crc, body, method = 0;
        if (raw instanceof Blob) {
          usize = raw.size;
          const buf = new Uint8Array(await raw.arrayBuffer());
          crc = crc32(buf);
          const z = opts.pack && usize > 64 ? await deflate(buf) : null;
          if (z && z.length < usize) { body = z; method = 8; } else body = raw;   // Original-Blob behalten, nicht die Kopie
        } else {
          usize = raw.length;
          crc = crc32(raw);
          const z = opts.pack && usize > 64 ? await deflate(raw) : null;
          if (z && z.length < usize) { body = z; method = 8; } else body = raw;
        }
        raw = null;
        const csize = body instanceof Blob ? body.size : body.length;
        const nm = enc.encode(name);
        const z64 = usize >= BIG || csize >= BIG;
        const lh = new DataView(new ArrayBuffer(30 + nm.length + (z64 ? 20 : 0)));
        lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, z64 ? 45 : 20, true); lh.setUint16(6, 0x0800, true); lh.setUint16(8, method, true);
        lh.setUint16(10, dosTime, true); lh.setUint16(12, dosDate, true); lh.setUint32(14, crc, true);
        lh.setUint32(18, z64 ? BIG : csize, true); lh.setUint32(22, z64 ? BIG : usize, true);
        lh.setUint16(26, nm.length, true); lh.setUint16(28, z64 ? 20 : 0, true);
        new Uint8Array(lh.buffer).set(nm, 30);
        if (z64) { const x = 30 + nm.length; lh.setUint16(x, 1, true); lh.setUint16(x + 2, 16, true); lh.setBigUint64(x + 4, BigInt(usize), true); lh.setBigUint64(x + 12, BigInt(csize), true); }
        parts.push(new Uint8Array(lh.buffer), body);
        central.push({ nm, crc, csize, usize, method, off });
        off += lh.byteLength + csize;
        count++;
      },
      finish(type = 'application/zip') {
        const cdStart = off;
        let cdSize = 0;
        for (const e of central) {
          const need = [e.usize >= BIG, e.csize >= BIG, e.off >= BIG];
          const xl = need.some(Boolean) ? 4 + 8 * need.filter(Boolean).length : 0;
          const c = new DataView(new ArrayBuffer(46 + e.nm.length + xl));
          c.setUint32(0, 0x02014b50, true); c.setUint16(4, 45, true); c.setUint16(6, xl ? 45 : 20, true); c.setUint16(8, 0x0800, true);
          c.setUint16(10, e.method, true); c.setUint16(12, dosTime, true); c.setUint16(14, dosDate, true); c.setUint32(16, e.crc, true);
          c.setUint32(20, need[1] ? BIG : e.csize, true); c.setUint32(24, need[0] ? BIG : e.usize, true);
          c.setUint16(28, e.nm.length, true); c.setUint16(30, xl, true); c.setUint32(42, need[2] ? BIG : e.off, true);
          new Uint8Array(c.buffer).set(e.nm, 46);
          if (xl) {
            let x = 46 + e.nm.length;
            c.setUint16(x, 1, true); c.setUint16(x + 2, xl - 4, true); x += 4;
            if (need[0]) { c.setBigUint64(x, BigInt(e.usize), true); x += 8; }
            if (need[1]) { c.setBigUint64(x, BigInt(e.csize), true); x += 8; }
            if (need[2]) { c.setBigUint64(x, BigInt(e.off), true); x += 8; }
          }
          parts.push(new Uint8Array(c.buffer));
          cdSize += c.byteLength;
        }
        const z64 = count > 0xFFFF || cdStart >= BIG || cdSize >= BIG;
        if (z64) {
          const r = new DataView(new ArrayBuffer(56 + 20));
          r.setUint32(0, 0x06064b50, true); r.setBigUint64(4, 44n, true); r.setUint16(12, 45, true); r.setUint16(14, 45, true);
          r.setBigUint64(24, BigInt(count), true); r.setBigUint64(32, BigInt(count), true); r.setBigUint64(40, BigInt(cdSize), true); r.setBigUint64(48, BigInt(cdStart), true);
          r.setUint32(56, 0x07064b50, true); r.setBigUint64(64, BigInt(cdStart + cdSize), true); r.setUint32(72, 1, true);
          parts.push(new Uint8Array(r.buffer));
        }
        const e = new DataView(new ArrayBuffer(22));
        e.setUint32(0, 0x06054b50, true);
        e.setUint16(8, z64 ? 0xFFFF : count, true); e.setUint16(10, z64 ? 0xFFFF : count, true);
        e.setUint32(12, z64 ? BIG : cdSize, true); e.setUint32(16, z64 ? BIG : cdStart, true);
        parts.push(new Uint8Array(e.buffer));
        return new Blob(parts, { type });
      },
      get count() { return count; },
    };
  }

  /* ---------------------------------------------------------- Namen wie im Saves-Ordner (gleiche Regeln wie store.go) */
  const RESERVED = new Set(['CON', 'PRN', 'AUX', 'NUL', ...[1, 2, 3, 4, 5, 6, 7, 8, 9].flatMap(i => ['COM' + i, 'LPT' + i])]);
  function safeName(s) {
    let out = '';
    for (const ch of String(s == null ? '' : s).trim()) {
      const c = ch.codePointAt(0);
      if (c < 32 || c === 127) continue;
      out += '<>:"/\\|?*'.includes(ch) ? '_' : ch;
    }
    out = out.replace(/[. ]+$/, '').trim();
    const cps = [...out];
    if (cps.length > 80) out = cps.slice(0, 80).join('').replace(/[. ]+$/, '');
    while (out.startsWith('_') || out.startsWith('.')) out = '-' + out.slice(1);
    if (!out) out = 'Unbenannt';
    if (RESERVED.has(out.split('.')[0].toUpperCase())) out += '-';
    return out;
  }
  function uniqueName(base, suffix, used) {
    let name = base + suffix;
    for (let i = 2; used.has(name.toLowerCase()); i++) name = `${base} (${i})${suffix}`;
    used.add(name.toLowerCase());
    return name;
  }
  const json2 = (v) => JSON.stringify(v, null, 2);

  /* ---------------------------------------------------------- Schreiben
   * o.groups: Baum (Knoten { id, name, color, kind, closed, groups, pages }); Seiten aus Store.pages.
   * o.art 'backup' | 'export', o.name, o.prog (Fortschritt), o.check (wirft bei Abbruch), o.images (Standard: ja).
   * Ergebnis { blob, pages, images, missing }. */
  async function write(o) {
    const zw = zipWriter();
    const names = new Set();
    const prog = o.prog || null, check = o.check || (() => { });
    const total = (function n(l) { return l.reduce((a, g) => a + g.pages.filter(p => Store.pages[p]).length + n(g.groups || []), 0); })(o.groups);
    let done = 0, pages = 0;
    const files = [];   // [Pfad, Inhalt, pack]
    const walk = async (list, dir) => {
      const used = new Set();
      for (const g of list) {
        if (!g || !g.id) continue;
        const folder = dir + uniqueName(safeName(g.name), '', used) + '/';
        const usedP = new Set(), pids = [];
        for (const pid of g.pages || []) {
          const p = Store.pages[pid];
          if (!p) continue;
          check();
          const s = serPage(p);
          for (const m of s.match(NAME_RE) || []) names.add(m);
          await zw.add(folder + uniqueName(safeName(p.title), PAGE_SUFFIX, usedP), s, { pack: true });
          pids.push(pid); pages++;
          if (prog && (++done % 5 === 0 || done === total)) prog.set(`Seiten … (${done}/${total})`, total ? 0.5 * done / total : 0);
        }
        const meta = { typ: 'KnowledgeTree-Gruppe', id: g.id, name: g.name, farbe: g.color || '' };
        if (g.kind) meta.art = g.kind;
        if (g.closed) meta.geschlossen = true;
        meta.reihenfolgeGruppen = (g.groups || []).map(x => x.id);
        meta.reihenfolgeSeiten = pids;
        files.push([folder + '_gruppe.json', json2(meta)]);
        await walk(g.groups || [], folder);
      }
    };
    await zw.add('Saves/_struktur.json', json2({ typ: 'KnowledgeTree-Saves', version: 1, reihenfolgeGruppen: o.groups.filter(Boolean).map(g => g.id) }));
    await walk(o.groups, 'Saves/');
    for (const [p, s] of files) await zw.add(p, s, { pack: true });
    let images = 0, missing = 0, i = 0;
    let shared = 0;
    if (o.images !== false) {
      for (const n of names) {
        check();
        if (o.skip && o.skip.has(n)) { shared++; continue; }   // liegt im gemeinsamen _Bilder-Ordner des Backups
        if (prog) prog.set(`Bilder und Anhänge … (${++i}/${names.size})`, 0.5 + 0.5 * i / names.size);
        const b = await Export.assetBlob(n);
        if (!b || !b.size) { missing++; continue; }   // fehlend oder leer (z.B. beschädigter Import) – nie ein leerer Eintrag
        await zw.add('Saves/_Bilder/' + n, b, { pack: PACK.test(extOf(n)) });
        images++;
      }
    }
    // Beschreibung zuletzt schreiben (Zählung bekannt) – die Reihenfolge der Einträge spielt beim Lesen keine Rolle
    await zw.add('KnowledgeTree.json', json2({
      typ: 'KnowledgeTree-Datei', version: 3, art: o.art || 'export', name: o.name || 'KnowledgeTree', erstellt: new Date().toISOString(),
      programm: 'KnowledgeTree ' + ((Store.info && Store.info.version) || ''), quelle: typeof Backend !== 'undefined' ? Backend.kind : '',
      seiten: pages, bilder: images, ...(o.images === false ? { ohneBilder: true } : {}), ...(missing ? { fehlend: missing } : {}), ...(shared ? { geteilteBilder: shared } : {}),
    }));
    return { blob: zw.finish(), pages, images, missing };
  }

  /* ---------------------------------------------------------- Lesen */
  /* Ist das ZIP (Inhaltsverzeichnis) eine KnowledgeTree-Datei? */
  function isKtZip(entries) {
    return entries.some(e => /(^|\/)(_struktur\.json|KnowledgeTree\.json)$/i.test(e.name) || /\.seite\.json$/i.test(e.name));
  }
  /* Datei (Blob/File) lesen – ZIP oder JSON. Ergebnis wie die alten Sicherungen ({ typ, erstellt, name, gruppen,
   * seiten }) plus: bilder (ZIP: [{ name, size, blob() }] – gespeichert wird erst mit storeAssets), refs (genannte
   * Bilder), format ('zip' | 'json'), art, quelle, ohneBilder. JSON: Bilder werden wie bisher beim Lesen gespeichert. */
  async function read(src) {
    if (src && src.entries) return isKtFolder(src.entries) ? readFolder(src.entries) : readZip({ name: src.name || '' }, src.entries);   // gewählter Ordner
    const h = new Uint8Array(await src.slice(0, 64).arrayBuffer());
    if (h[0] === 0x50 && h[1] === 0x4B) {
      const entries = await openZip(src);
      return isKtFolder(entries) ? readFolder(entries) : readZip(src, entries);
    }
    const t = latin1(h[0] === 0xEF && h[1] === 0xBB && h[2] === 0xBF ? h.subarray(3) : h).trimStart();
    if (t.startsWith('<')) return readHtml(src);
    return readJson(src);
  }
  const latin1 = (u8) => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return s; };
  async function readJson(file) {
    const ren = {}, lost = [];
    const data = await readJsonStream(file, {
      bilder: async (name, type, raw) => {
        if (!raw || !raw.size) { lost.push(name); return; }   // leeres Bild: überspringen statt abbrechen
        try {
          const nn = await putAsset(name, new Blob([raw], { type: type || mime(name) }));
          if (nn && nn !== name) ren[name] = nn;
        } catch (e) { console.warn('[KnowledgeTree] Bild nicht übernommen:', name, e); lost.push(name); }
      },
    });
    if (!data || data.typ !== 'KnowledgeTree-Backup' || !data.seiten) throw new Error('Das ist keine KnowledgeTree-Datei.');
    renameRefs(data, ren);
    data.format = 'json';
    data.bilder = [];
    data.fehlend = lost;
    data.art = data.name ? 'export' : 'backup';
    return data;
  }
  async function readZip(file, entries) {
    if (!isKtZip(entries)) throw new Error('Diese ZIP-Datei enthält keine KnowledgeTree-Daten (keine .seite.json).');
    const text = async (e) => new TextDecoder('utf-8').decode(await e.read()).replace(/^﻿/, '');
    const parse = async (e) => { try { return JSON.parse(await text(e)); } catch (err) { return null; } };
    const files = entries.map(e => ({ e, path: e.name.replace(/\\/g, '/').replace(/^\/+/, '') }));
    // Wurzel des Saves-Ordners: wo _struktur.json liegt, sonst ein Ordner „Saves/“, sonst der gemeinsame Anfang
    let base = '';
    const st = files.filter(f => /(^|\/)_struktur\.json$/i.test(f.path)).sort((a, b) => a.path.length - b.path.length)[0];
    if (st) base = st.path.slice(0, st.path.length - '_struktur.json'.length);
    else {
      const sv = files.find(f => /(^|\/)Saves\/.*\.seite\.json$/i.test(f.path));
      const m = sv && /(^|\/)Saves\//i.exec(sv.path);
      if (m) base = sv.path.slice(0, m.index + m[0].length);
    }
    const metaFile = files.find(f => /(^|\/)KnowledgeTree\.json$/i.test(f.path) && base.startsWith(f.path.slice(0, -'KnowledgeTree.json'.length)));
    const meta = (metaFile && await parse(metaFile.e)) || {};
    // Ordnerbaum aus den Pfaden
    const dirs = new Map();   // rel. Ordner ('' = Wurzel) → { subs: Set, pages: [], meta }
    const dir = (p) => { if (!dirs.has(p)) dirs.set(p, { subs: new Set(), pages: [], meta: null }); return dirs.get(p); };
    dir('');
    const bilder = [];
    for (const f of files) {
      if (!f.path.startsWith(base) || f.path.endsWith('/')) continue;
      const rel = f.path.slice(base.length);
      const parts = rel.split('/');
      const fn = parts.pop();
      if (parts[0] === '_Bilder') { if (ASSET.test(fn.toLowerCase()) && parts.length === 1) bilder.push({ name: fn.toLowerCase(), size: f.e.size, blob: () => f.e.blob() }); continue; }
      if (parts.some(x => x.startsWith('_') || x.startsWith('.'))) continue;
      for (let i = 0; i < parts.length; i++) dir(parts.slice(0, i).join('/')).subs.add(parts.slice(0, i + 1).join('/'));
      const d = dir(parts.join('/'));
      if (/\.seite\.json$/i.test(fn)) d.pages.push({ fn, e: f.e });
      else if (fn === '_gruppe.json') d.meta = f.e;
    }
    const seen = new Set(), seiten = {}, refs = new Set();
    const order = (list, ids, idOf) => {
      const pos = new Map((ids || []).map((id, i) => [id, i]));
      return list.sort((a, b) => { const pa = pos.has(idOf(a)), pb = pos.has(idOf(b)); return pa && pb ? pos.get(idOf(a)) - pos.get(idOf(b)) : pa ? -1 : pb ? 1 : 0; });
    };
    const byName = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
    const readPage = async (pg) => {
      let p = null;
      try { const t = await text(pg.e); for (const m of t.match(NAME_RE) || []) refs.add(m); p = JSON.parse(t); } catch (err) { p = null; }
      if (!p || typeof p !== 'object' || Array.isArray(p)) return null;
      if (!p.id || seen.has(p.id)) p.id = uid('p');
      if (typeof p.title !== 'string' || !p.title) p.title = pg.fn.replace(/\.seite\.json$/i, '');
      seen.add(p.id);
      seiten[p.id] = p;
      return p.id;
    };
    const scan = async (rel) => {
      const d = dirs.get(rel);
      const m = (d.meta && await parse(d.meta)) || {};
      let id = typeof m.id === 'string' && m.id ? m.id : '';
      if (!id || seen.has(id)) id = uid('g');
      seen.add(id);
      const g = { id, name: String(m.name || '').trim() ? m.name : rel.split('/').pop(), color: m.farbe || '', groups: [], pages: [] };
      if (m.art) g.kind = m.art;
      if (m.geschlossen) g.closed = true;
      const pids = [];
      for (const pg of d.pages.sort((a, b) => byName(a.fn, b.fn))) { const pid = await readPage(pg); if (pid) pids.push(pid); }
      g.pages = order(pids, m.reihenfolgeSeiten, x => x);
      const subs = [];
      for (const s of [...d.subs].sort(byName)) subs.push(await scan(s));
      g.groups = order(subs, m.reihenfolgeGruppen, x => x.id);
      return g;
    };
    const root = dirs.get('');
    const sm = st ? (await parse(st.e)) || {} : {};
    const groups = [];
    for (const s of [...root.subs].sort(byName)) groups.push(await scan(s));
    const gruppen = order(groups, sm.reihenfolgeGruppen, x => x.id);
    if (root.pages.length) {   // Seiten direkt im Saves-Ordner → „Unsortiert“ (wie store.go)
      const pids = [];
      for (const pg of root.pages.sort((a, b) => byName(a.fn, b.fn))) { const pid = await readPage(pg); if (pid) pids.push(pid); }
      gruppen.push({ id: uid('g'), name: 'Unsortiert', color: '', groups: [], pages: pids });
    }
    if (!Object.keys(seiten).length && !gruppen.length) throw new Error('Diese ZIP-Datei enthält keine KnowledgeTree-Seiten.');
    const stamp = /Saves_(\d{4}-\d\d-\d\d)_(\d\d)-(\d\d)-(\d\d)/.exec(file.name || '');
    const erstellt = meta.erstellt || (stamp ? new Date(`${stamp[1]}T${stamp[2]}:${stamp[3]}:${stamp[4]}`).toISOString() : new Date(file.lastModified || Date.now()).toISOString());
    const have = new Set(bilder.map(b => b.name));
    return {
      typ: 'KnowledgeTree-Backup', format: 'zip', version: meta.version || 3, art: meta.art || 'backup', name: meta.name || '', erstellt,
      quelle: meta.quelle || (meta.typ ? '' : 'exe'), gruppen, seiten, bilder: bilder.filter(b => refs.has(b.name)), refs,
      fehlend: [...refs].filter(n => !have.has(n)), ohneBilder: !!meta.ohneBilder || (!bilder.length && refs.size > 0),
    };
  }

  /* ---------------------------------------------------------- .json wie bis 1.23 (für ältere Versionen)
   * typ 'KnowledgeTree-Backup', version 2: Baum, Seiten und Bilder als Daten-URL – stückweise in Blob-Teile. */
  async function writeJson(o) {
    const prog = o.prog || null, check = o.check || (() => { });
    const parts = [JSON.stringify({ typ: 'KnowledgeTree-Backup', version: 2, erstellt: new Date().toISOString(), name: o.name || undefined, gruppen: o.groups }).slice(0, -1) + ',"seiten":{'];
    const names = new Set();
    let pages = 0;
    const walk = (list) => { for (const g of list) { for (const pid of g.pages || []) { const p = Store.pages[pid]; if (!p) continue; check(); const sp = serPage(p); for (const m of sp.match(NAME_RE) || []) names.add(m); parts.push((pages++ ? ',' : '') + JSON.stringify(pid) + ':' + sp); } walk(g.groups || []); } };
    walk(o.groups);
    parts.push('},"bilder":{');
    let images = 0, missing = 0, i = 0;
    for (const n of names) {
      check();
      if (prog) prog.set(`Bilder und Anhänge … (${++i}/${names.size})`, i / names.size);
      const b = await Export.assetBlob(n);
      if (!b || !b.size) { missing++; continue; }
      parts.push((images++ ? ',' : '') + JSON.stringify(n) + ':"' + await blobToDataURL(b) + '"');
    }
    parts.push('}}');
    return { blob: new Blob(parts, { type: 'application/json' }), pages, images, missing };
  }

  /* ---------------------------------------------------------- Interaktive Datei (.knowledgetree.html)
   * Vorlage = die Webseiten-Fassung selbst: im Programm vom Server (kt-app.html = eingebettete dist/index.html),
   * im Browser aus der laufenden Seite zusammengesetzt (build_web.py legt ein Gerüst ohne Code als JSON in
   * #kt-shell ab; Code und CSS kommen aus den <script data-kt="…">- und <style id="kt-css">-Elementen). So geht
   * es auch aus einer geöffneten interaktiven Datei oder aus einer index.html direkt von der Festplatte. */
  const MARK = '<!-' + '-kt-datei-->';   // so geschrieben, damit im Code nie ein HTML-Kommentaranfang steht
  async function appTemplate() {
    if (typeof Backend !== 'undefined' && Backend.kind === 'server') {
      const r = await fetch('kt-app.html', { cache: 'no-store' });
      if (!r.ok) throw new Error('Die Programmvorlage fehlt (kt-app.html)');
      return r.text();
    }
    const sh = document.getElementById('kt-shell');
    if (!sh || !sh.textContent.trim()) throw new Error('Eine interaktive Datei lässt sich nur aus der Webseiten-Fassung (index.html) erstellen.');
    const shellJson = sh.textContent.trim();
    const css = (document.getElementById('kt-css') || {}).textContent || '';
    return JSON.parse(shellJson)
      .replace(/<script data-kt="([^"]+)"><\/script>/g, (m, n) => {
        const el = [...document.scripts].find(x => x.dataset && x.dataset.kt === n);
        if (!el) throw new Error('Programmteil fehlt: ' + n);
        return `<script data-kt="${n}">${el.textContent}</script>`;
      })
      .replace('<style id="kt-css"></style>', () => `<style id="kt-css">${css}</style>`)
      .replace('<script type="application/json" id="kt-shell"></script>', () => `<script type="application/json" id="kt-shell">${shellJson}</script>`);
  }
  /* Base-122 (seit 1.26): Binärdaten als UTF-8-Text mit nur rund 14 % Aufschlag statt 33 % bei Base64 – je 7 Bit ein
   * Zeichen; Werte, die im HTML stören würden (\0 \n \r " & \ <), kommen zusammen mit den nächsten 7 Bit in ein
   * Zwei-Byte-Zeichen (110sss1b 10bbbbbb, sss = welcher Wert; 111 = „nur noch die letzten 7 Bit“). Nach Kevin
   * Albertsons Base-122, ergänzt um „<“, damit im Datenblock nie „</script“ stehen kann. Genaue Grösse im Attribut. */
  const B122_ILL = [0, 10, 13, 34, 38, 92, 60], B122_SHORT = 7;
  const B122_IDX = (() => { const t = new Int8Array(128).fill(-1); B122_ILL.forEach((v, i) => { t[v] = i; }); return t; })();
  function b122Writer() {
    let acc = 0, n = 0, pend = -1;
    return (u8, last) => {
      const out = new Uint8Array(Math.ceil(u8.length * 8 / 7) * 2 + 8);
      let o = 0;
      const emit = (g) => {
        if (pend >= 0) { out[o++] = 0xC2 | (pend << 2) | (g >> 6); out[o++] = 0x80 | (g & 0x3F); pend = -1; return; }
        const i = B122_IDX[g];
        if (i >= 0) pend = i; else out[o++] = g;
      };
      for (let k = 0; k < u8.length; k++) {
        acc = (acc << 8) | u8[k]; n += 8;
        while (n >= 7) { n -= 7; emit((acc >> n) & 0x7F); }
        acc &= (1 << n) - 1;
      }
      if (last) {
        if (n > 0) { emit((acc << (7 - n)) & 0x7F); n = 0; acc = 0; }
        if (pend >= 0) { const g = B122_ILL[pend]; out[o++] = 0xC2 | (B122_SHORT << 2) | (g >> 6); out[o++] = 0x80 | (g & 0x3F); pend = -1; }
      }
      return out.subarray(0, o);
    };
  }
  async function b122Parts(blob) {
    const parts = [], CH = 3 << 20, w = b122Writer();
    let n = 0;
    for (let o = 0; o < blob.size; o += CH) { const p = w(new Uint8Array(await blob.slice(o, o + CH).arrayBuffer()), o + CH >= blob.size); parts.push(p); n += p.length; }
    if (!blob.size) { const p = w(new Uint8Array(0), true); parts.push(p); n += p.length; }
    return { parts, bytes: n };
  }
  /* Base-122 lesen: src = UTF-8-Bytes (Datei) oder Text (Datenblock der geöffneten Seite); size = Grösse der Daten */
  function b122Decode(src, size) {
    const out = new Uint8Array(size), str = typeof src === 'string';
    let o = 0, acc = 0, n = 0;
    const put = (g) => { acc = (acc << 7) | g; n += 7; if (n >= 8) { n -= 8; if (o < size) out[o++] = (acc >> n) & 0xFF; acc &= (1 << n) - 1; } };
    for (let i = 0, L = src.length; i < L && o < size; i++) {
      let c = str ? src.charCodeAt(i) : src[i];
      if (c < 0x80) { put(c); continue; }
      let idx, hi, lo;
      if (str) { idx = (c >> 8) & 7; hi = (c >> 6) & 1; lo = c & 0x3F; }
      else { const c2 = src[++i]; idx = (c >> 2) & 7; hi = c & 1; lo = c2 & 0x3F; }
      if (idx !== B122_SHORT) put(B122_ILL[idx]);
      put((hi << 6) | lo);
    }
    if (o !== size) throw new Error('Die KnowledgeTree-Daten in dieser Datei sind unvollständig');
    return out;
  }
  /* Blob → Base64 in Stücken (je 3 MB → 4 MB Text), nie als ein grosser Text (bis 1.25; Lesen bleibt) */
  async function base64Parts(blob) {
    const parts = [], CH = 3 << 20;
    for (let o = 0; o < blob.size; o += CH) parts.push(btoa(latin1(new Uint8Array(await blob.slice(o, o + CH).arrayBuffer()))));
    return parts;
  }
  /* Base64 (Text oder Blob mit Text) → Blob, stückweise */
  async function fromBase64(src) {
    const parts = [], CH = 4 << 20;
    const text = typeof src === 'string' ? src.replace(/\s+/g, '') : null;
    const len = text != null ? text.length : src.size;
    for (let o = 0; o < len; o += CH) {
      const t = text != null ? text.slice(o, o + CH) : (await src.slice(o, o + CH).text()).replace(/\s+/g, '');
      const bin = atob(t);
      const u = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
      parts.push(u);
    }
    return new Blob(parts, { type: 'application/zip' });
  }
  const escAttr = (v) => String(v == null ? '' : v).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  async function writeHtml(o) {
    const tpl = await appTemplate();
    const k = tpl.indexOf(MARK);
    if (k < 0) throw new Error('Die Programmvorlage hat keinen Platz für die Daten');
    const r = await write({ ...o, art: o.art || 'export' });
    if (o.prog) o.prog.set('Interaktive Datei wird zusammengestellt …', 1);
    const enc = await b122Parts(r.blob);   // seit 1.26 Base-122 (rund 15 % kleiner als Base64)
    const name = o.name || 'KnowledgeTree';
    const tag = `<script type="application/x-knowledgetree" id="kt-datei" data-bytes="${enc.bytes}" data-enc="b122" data-groesse="${r.blob.size}" data-name="${escAttr(name)}" data-erstellt="${new Date().toISOString()}">`;
    const after = tpl.slice(k + MARK.length).replace(/<title>[^<]*<\/title>/, `<title>${escAttr(name)} – KnowledgeTree</title>`);
    return { ...r, zip: r.blob, blob: new Blob([tpl.slice(0, k), tag, ...enc.parts, '</script>', after], { type: 'text/html' }) };
  }
  /* KT-Daten aus einer interaktiven Datei lesen: nur den Kopf durchsuchen, dann genau den Base64-Block */
  async function readHtml(file) {
    const head = new Uint8Array(await file.slice(0, 1 << 16).arrayBuffer());
    const t = latin1(head);
    const i = t.indexOf('id="kt-datei"');
    if (i < 0) {
      if (/<meta name="generator" content="KnowledgeTree">/.test(t)) throw new Error('Diese HTML-Datei ist eine Webseite zum Ansehen (Export „Webseite“) und enthält keine KnowledgeTree-Daten. Zum Wieder-Einlesen beim Exportieren „KnowledgeTree-Datei → Interaktiv (.html)“ wählen.');
      throw new Error('Diese HTML-Datei ist keine KnowledgeTree-Datei.');
    }
    const s0 = t.lastIndexOf('<script', i), e0 = t.indexOf('>', i);
    const tag = new TextDecoder('utf-8').decode(head.subarray(s0, e0 + 1));
    const attr = (k2) => { const m = new RegExp(k2 + '="([^"]*)"').exec(tag); return m ? m[1].replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&') : ''; };
    const n = +attr('data-bytes');
    if (!n) throw new Error('Die KnowledgeTree-Daten in dieser HTML-Datei sind leer.');
    const zip = attr('data-enc') === 'b122'
      ? new Blob([b122Decode(new Uint8Array(await file.slice(e0 + 1, e0 + 1 + n).arrayBuffer()), +attr('data-groesse'))], { type: 'application/zip' })
      : await fromBase64(file.slice(e0 + 1, e0 + 1 + n));   // bis 1.25: Base64
    const data = await readZip({ name: file.name, lastModified: file.lastModified }, await openZip(zip));
    data.format = 'html';
    if (!data.name) data.name = attr('data-name');
    return data;
  }

  /* ---------------------------------------------------------- Sicherung wie bei OneNote (Ordner)
   * Ein Ordner je Notizbuch/Abschnittsgruppe (mit _gruppe.json), eine KT-Datei je Abschnitt, oben KnowledgeTree.json.
   * Ergebnis { files: [{ path, blob }], pages, images, missing, sections } – Pfade relativ zum Sicherungsordner. */
  const SECTION_SUFFIX = '.knowledgetree.zip';
  const isSectionNode = (g) => g.kind === 'section' || g.kind === 'quick' || (!(g.groups || []).length && (g.pages || []).length > 0);
  async function writeFolder(o) {
    const prog = o.prog || null, check = o.check || (() => { });
    const files = [];
    let pages = 0, images = 0, missing = 0, sections = 0, n = 0;
    const total = (function c(l) { return l.reduce((a, g) => a + (isSectionNode(g) ? 1 : c(g.groups || [])), 0); })(o.groups);
    // Bilder, die in mehreren Abschnitten vorkommen (kopierte Seiten, Ausdrucke), liegen nur einmal im Ordner
    // _Bilder des Backups – jede Abschnitt-Datei enthält nur ihre eigenen (gemessen: 70 → 48 MB)
    const use = new Map();
    (function c(l) {
      for (const g of l) {
        if (!g || !g.id) continue;
        if (!isSectionNode(g)) { c(g.groups || []); continue; }
        const set = new Set();
        (function pg(x) { for (const pid of x.pages || []) { const p = Store.pages[pid]; if (p) for (const m of serPage(p).match(NAME_RE) || []) set.add(m); } (x.groups || []).forEach(pg); })(g);
        for (const m of set) use.set(m, (use.get(m) || 0) + 1);
      }
    })(o.groups);
    const skip = new Set(o.images === false ? [] : [...use].filter(([, k]) => k > 1).map(([m]) => m));
    const walk = async (list, dir) => {
      const used = new Set();
      for (const g of list) {
        if (!g || !g.id) continue;
        if (isSectionNode(g)) {
          check();
          if (prog) prog.set(`Abschnitt ${++n} von ${total}: ${g.name}`, n / Math.max(1, total));
          const r = await write({ groups: [g], art: 'abschnitt', name: g.name, images: o.images, check, skip });
          files.push({ path: dir + uniqueName(safeName(g.name), SECTION_SUFFIX, used), blob: r.blob });
          pages += r.pages; images += r.images; missing += r.missing; sections++;
        } else {
          const folder = dir + uniqueName(safeName(g.name), '', used) + '/';
          const meta = { typ: 'KnowledgeTree-Gruppe', id: g.id, name: g.name, farbe: g.color || '' };
          if (g.kind) meta.art = g.kind;
          if (g.closed) meta.geschlossen = true;
          meta.reihenfolgeGruppen = (g.groups || []).map(x => x.id);
          meta.reihenfolgeSeiten = [];
          files.push({ path: folder + '_gruppe.json', blob: new Blob([json2(meta)], { type: 'application/json' }) });
          await walk(g.groups || [], folder);
        }
      }
    };
    await walk(o.groups, '');
    for (const m of skip) {
      check();
      const b = await Export.assetBlob(m);
      if (!b || !b.size) { missing++; continue; }
      files.push({ path: '_Bilder/' + m, blob: b });
      images++;
    }
    files.unshift({ path: 'KnowledgeTree.json', blob: new Blob([json2({
      typ: 'KnowledgeTree-Sicherung', version: 4, art: o.art || 'backup', name: o.name || 'KnowledgeTree', erstellt: new Date().toISOString(),
      programm: 'KnowledgeTree ' + ((Store.info && Store.info.version) || ''), quelle: typeof Backend !== 'undefined' ? Backend.kind : '',
      seiten: pages, bilder: images, abschnitte: sections, geteilteBilder: skip.size, reihenfolgeGruppen: o.groups.filter(Boolean).map(g => g.id),
      ...(o.images === false ? { ohneBilder: true } : {}), ...(missing ? { fehlend: missing } : {}),
    })], { type: 'application/json' }) });
    return { files, pages, images, missing, sections };
  }
  /* Ordner als eine ZIP-Datei (Download im Browser): die Abschnitt-Dateien unverändert darin */
  async function zipFiles(files) {
    const zw = zipWriter();
    for (const f of files) await zw.add(f.path, f.blob, { pack: f.path.startsWith('_Bilder/') ? PACK.test(extOf(f.path)) : !/\.zip$/i.test(f.path) });
    return zw.finish();
  }
  /* Ist das (Ordner-/ZIP-Inhalt) eine Sicherung wie bei OneNote? – Abschnitt-Dateien, aber keine .seite.json */
  function isKtFolder(entries) {
    return entries.some(e => /\.knowledgetree\.zip$/i.test(e.name)) && !entries.some(e => /\.seite\.json$/i.test(e.name));
  }
  async function readFolder(entries) {
    const files = entries.map(e => ({ e, path: e.name.replace(/\\/g, '/').replace(/^\/+/, '') })).filter(f => !/(^|\/)(__MACOSX\/|\.)/.test(f.path));
    const parse = async (e) => { try { return JSON.parse(new TextDecoder('utf-8').decode(await e.read()).replace(/^﻿/, '')); } catch (err) { return null; } };
    // Wurzel: Ordner der obersten KnowledgeTree.json einer Sicherung, sonst ganz oben
    let base = '', meta = {};
    for (const f of files.filter(x => /(^|\/)KnowledgeTree\.json$/i.test(x.path)).sort((a, b) => a.path.split('/').length - b.path.split('/').length)) {
      const j = await parse(f.e);
      if (j && j.typ === 'KnowledgeTree-Sicherung') { base = f.path.slice(0, -'KnowledgeTree.json'.length); meta = j; break; }
    }
    const dirs = new Map();
    const dir = (p) => { if (!dirs.has(p)) dirs.set(p, { subs: new Set(), secs: [], meta: null }); return dirs.get(p); };
    dir('');
    const rootImgs = [];
    for (const f of files) {
      if (!f.path.startsWith(base) || f.path.endsWith('/')) continue;
      const parts = f.path.slice(base.length).split('/');
      const fn = parts.pop();
      if (parts.length === 1 && parts[0] === '_Bilder' && ASSET.test(fn.toLowerCase())) { rootImgs.push({ name: fn.toLowerCase(), size: f.e.size, blob: () => f.e.blob() }); continue; }   // geteilte Bilder
      if (parts.some(x => x.startsWith('_'))) continue;
      for (let i = 0; i < parts.length; i++) dir(parts.slice(0, i).join('/')).subs.add(parts.slice(0, i + 1).join('/'));
      const d = dir(parts.join('/'));
      if (/\.knowledgetree\.zip$/i.test(fn)) d.secs.push({ fn, e: f.e });
      else if (fn === '_gruppe.json') d.meta = f.e;
    }
    const seiten = {}, bilder = new Map(), refs = new Set(), seenG = new Set();
    let ohne = false;
    const byName = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
    const order = (list, ids) => { const pos = new Map((ids || []).map((id, i) => [id, i])); return list.sort((a, b) => { const pa = pos.has(a.id), pb = pos.has(b.id); return pa && pb ? pos.get(a.id) - pos.get(b.id) : pa ? -1 : pb ? 1 : 0; }); };
    const fixIds = (g) => {   // IDs über alle Abschnitt-Dateien eindeutig halten
      if (seenG.has(g.id)) g.id = uid('g');
      seenG.add(g.id);
      g.groups = (g.groups || []).map(fixIds);
      return g;
    };
    const readSection = async (sec) => {
      const blob = await sec.e.blob();
      const d = await readZip({ name: sec.fn }, await openZip(blob));
      const ren = new Map();
      for (const [id, p] of Object.entries(d.seiten)) { let nid = id; if (seiten[nid]) { nid = uid('p'); p.id = nid; ren.set(id, nid); } seiten[nid] = p; }
      const fixPages = (g) => { g.pages = (g.pages || []).map(x => ren.get(x) || x); (g.groups || []).forEach(fixPages); };
      d.gruppen.forEach(fixPages);
      for (const b of d.bilder) if (!bilder.has(b.name)) bilder.set(b.name, b);
      for (const r of d.refs) refs.add(r);
      if (d.ohneBilder) ohne = true;
      return d.gruppen.map(fixIds);
    };
    const scan = async (rel, depth) => {
      const d = dirs.get(rel);
      const m = (d.meta && await parse(d.meta)) || {};
      const g = fixIds({ id: typeof m.id === 'string' && m.id ? m.id : uid('g'), name: String(m.name || '').trim() ? m.name : rel.split('/').pop(), color: m.farbe || '', kind: m.art || (depth ? 'group' : 'notebook'), groups: [], pages: [] });
      if (m.geschlossen) g.closed = true;
      const kids = [];
      for (const s2 of [...d.subs].sort(byName)) kids.push(await scan(s2, depth + 1));
      for (const sec of d.secs.sort((a, b) => byName(a.fn, b.fn))) kids.push(...await readSection(sec));
      g.groups = order(kids, m.reihenfolgeGruppen);
      return g;
    };
    for (const b of rootImgs) if (!bilder.has(b.name)) bilder.set(b.name, b);
    const root = dirs.get(''), top = [];
    for (const s2 of [...root.subs].sort(byName)) top.push(await scan(s2, 0));
    for (const sec of root.secs.sort((a, b) => byName(a.fn, b.fn))) top.push(...await readSection(sec));
    const gruppen = order(top, meta.reihenfolgeGruppen);
    if (!Object.keys(seiten).length && !gruppen.length) throw new Error('In diesem Ordner sind keine KnowledgeTree-Abschnitte.');
    const have = new Set(bilder.keys());
    return {
      typ: 'KnowledgeTree-Backup', format: 'ordner', version: meta.version || 4, art: meta.art || 'backup', name: meta.name || '',
      erstellt: meta.erstellt || new Date().toISOString(), quelle: meta.quelle || '', gruppen, seiten, bilder: [...bilder.values()].filter(b => refs.has(b.name)), refs,
      fehlend: [...refs].filter(n => !have.has(n)), ohneBilder: !!meta.ohneBilder || ohne,
    };
  }
  /* Kurz in eine ZIP-KT-Datei schauen (nur KnowledgeTree.json): ist es ein einzelner Abschnitt? */
  async function peekMeta(file) {
    try {
      const h = new Uint8Array(await file.slice(0, 4).arrayBuffer());
      if (!(h[0] === 0x50 && h[1] === 0x4B)) return null;
      const m = (await openZip(file)).find(e => e.name === 'KnowledgeTree.json');
      return m ? JSON.parse(new TextDecoder('utf-8').decode(await m.read())) : null;
    } catch (e) { return null; }
  }

  /* ---------------------------------------------------------- Bilder in den Speicher übernehmen */
  /* ein Bild/Anhang mit seinem Namen speichern (Browser: unter dem Namen, Programm: der Server bildet ihn neu) */
  async function putAsset(name, blob) {
    if (Backend.putAsset) return Backend.putAsset(name, blob);
    const typed = blob.type ? blob : new Blob([blob], { type: mime(name) });
    return /^image\/(png|jpeg|gif|webp|bmp|svg\+xml)$/.test(typed.type) ? Backend.saveImage(typed) : Backend.saveFile(typed, extOf(name));
  }
  /* Bilder aus dem ZIP speichern – vorhandene werden übersprungen (gleicher Name = gleicher Inhalt). Danach sind
   * data.fehlend nur noch Bilder, die weder in der Datei noch im Speicher sind. */
  async function storeAssets(data, prog, check = () => { }) {
    const list = data.bilder || [];
    const want = [...new Set([...list.map(b => b.name), ...(data.fehlend || [])])];
    const have = want.length && Backend.hasAssets ? await Backend.hasAssets(want) : new Set();
    const ren = {}, failed = [];
    let i = 0, stored = 0, existing = 0;
    for (const b of list) {
      check();
      i++;
      if (have.has(b.name)) { existing++; continue; }
      if (prog) prog.set(`Bilder und Anhänge … (${i}/${list.length})`, i / list.length);
      // Ein einzelnes kaputtes oder leeres Bild darf nicht alles aufhalten (1.24: „kein Bild“ brach das Laden ab)
      try {
        const raw = await b.blob();
        if (!raw || !raw.size) { failed.push(b.name); continue; }
        const nn = await putAsset(b.name, new Blob([await raw.arrayBuffer()], { type: mime(b.name) }));
        if (nn && nn !== b.name) ren[b.name] = nn;
        stored++;
      } catch (e) { console.warn('[KnowledgeTree] Bild nicht übernommen:', b.name, e); failed.push(b.name); }
    }
    data.fehlend = [...(data.fehlend || []).filter(n => !have.has(n)), ...failed];
    renameRefs(data, ren);
    return { stored, existing, failed: failed.length, missing: data.fehlend.length };
  }
  function renameRefs(data, ren) {
    if (!Object.keys(ren).length) return;
    let s = JSON.stringify(data.seiten);
    for (const [a, b] of Object.entries(ren)) s = s.split(a).join(b);
    data.seiten = JSON.parse(s);
  }

  /* ---------------------------------------------------------- Dateinamen */
  const stamp = (withTime) => {
    const d = new Date(), p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}` + (withTime ? `_${p(d.getHours())}-${p(d.getMinutes())}` : '');
  };
  const backupName = () => `KnowledgeTree-Backup_${stamp(true)}`;   // Ordner (bzw. + .zip als Download)
  const EXT = { html: '.knowledgetree.html', zip: '.knowledgetree.zip', json: '.knowledgetree.json' };
  const exportName = (name, fmt = 'zip') => `${String(name || 'Export').replace(/[<>:"/\\|?*\u0000-\u001f]+/g, '_').replace(/\s+/g, ' ').trim().slice(0, 80) || 'Export'}_${stamp(false)}${EXT[fmt] || EXT.zip}`;
  /* Export in einem der drei Formate (Export-Dialog, Notizbuch als Datei, Speichern einer interaktiven Datei) */
  const writeAs = (fmt, o) => (fmt === 'html' ? writeHtml(o) : fmt === 'json' ? writeJson(o) : write(o));
  const ACCEPT = '.zip,.json,.html,.htm,application/zip,application/json,text/html';
  const size = (b) => (b >= 1e9 ? (b / 1e9).toFixed(2) + ' GB' : b >= 1e6 ? (b / 1e6).toFixed(1) + ' MB' : Math.max(1, Math.round((b || 0) / 1e3)) + ' KB').replace('.', ',');

  return {
    write, writeJson, writeHtml, writeAs, writeFolder, zipFiles, read, readZip, readHtml, readFolder, isKtZip, isKtFolder, peekMeta,
    storeAssets, putAsset, zipWriter, crc32, fromBase64, base64Parts, b122Writer, b122Parts, b122Decode, appTemplate, safeName, uniqueName, mime, backupName, exportName,
    ACCEPT, NAME_RE, SECTION_SUFFIX, size,
  };
})();

if (typeof module !== 'undefined') module.exports = Object.assign(module.exports || {}, { KtFile });
