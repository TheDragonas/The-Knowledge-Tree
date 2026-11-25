'use strict';
/* Speicher-Anbindung für die Webseiten-Version: alles bleibt in diesem Browser (IndexedDB).
 *
 *   Datenbank "KnowledgeTree"
 *     saves_struktur   Notizbücher, Abschnittsgruppen und Abschnitte (Reihenfolge, Namen, Farben)
 *     saves_seiten     alle Seiten mit Textfeldern, Zeichnungen, Paketen, Verbindungen
 *     saves_bilder     eingefügte Bilder
 *     cache            Rückgängig-Verlauf (100 Schritte), Ansicht (Zoom, letzte Seite …), Sicherungsordner
 *     papierkorb       gelöschte Seiten (bis 1.19; seit 1.20 wird Gelöschtes restlos entfernt – Strg+Z genügt)
 *     versionen        frühere Stände der Seiten (Standard: höchstens alle 10 Minuten, max. 50 pro Seite)
 */

/* Bild-/Dateiname = SHA-1 des Inhalts + Endung (beide Fassungen) */
const KT_EXT = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp', 'image/svg+xml': 'svg', 'image/bmp': 'bmp' };
async function ktHashName(buf, type, forceExt) {
  let hex;
  try {
    const h = await crypto.subtle.digest('SHA-1', buf);
    hex = [...new Uint8Array(h)].map(b => b.toString(16).padStart(2, '0')).join('');
  } catch (e) {
    hex = Array.from({ length: 40 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
  }
  return hex + '.' + (forceExt || KT_EXT[(type || '').toLowerCase()] || 'png');
}
function ktDownload(name, blob) {
  const a = el('a', { href: URL.createObjectURL(blob), download: name });
  document.body.append(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
}
/* Dateien eines Ordner-Handles (File System Access) als Einträge { name: Pfad, size, read(), blob() } */
async function ktDirEntries(dir, prefix = '', out = []) {
  for await (const [n, h] of dir.entries()) {
    if (h.kind === 'directory') await ktDirEntries(h, prefix + n + '/', out);
    else { const f = await h.getFile(); out.push({ name: prefix + n, size: f.size, blob: async () => f, read: async () => new Uint8Array(await f.arrayBuffer()) }); }
  }
  return out;
}

/* ---------------------------------------------------------------- Interaktive KnowledgeTree-Datei (seit 1.25)
 * Enthält die Seite einen Datenblock <script id="kt-datei"> (Export „KnowledgeTree-Datei → Interaktiv“), läuft sie
 * als eigenes kleines KnowledgeTree: alles im Arbeitsspeicher, nichts in IndexedDB – deine Notizen im Browser
 * bleiben unberührt (auch wenn die Datei von der Festplatte geöffnet wird und dort dieselbe Datenbank sähe).
 * „Speichern“ lädt die geänderte Datei neu herunter (wie „Speichern unter“). */
function ktFileBackend(block) {
  const assets = new Map(), urls = new Map();
  const name = block.dataset.name || 'KnowledgeTree-Datei';
  let raw = block.textContent;
  block.textContent = '';   // den grossen Text nicht doppelt im Speicher halten
  const be = {
    kind: 'datei', session: uid('datei'), dirty: false, fileName: name,
    async load() {
      const zip = block.dataset.enc === 'b122' ? new Blob([KtFile.b122Decode(raw, +block.dataset.groesse)], { type: 'application/zip' }) : await KtFile.fromBase64(raw);
      raw = null;
      const data = await KtFile.readZip({ name: name + '.zip' }, await openZip(zip));
      for (const b of data.bilder) assets.set(b.name, await b.blob());
      window.addEventListener('beforeunload', (e) => { if (be.dirty || (typeof Save !== 'undefined' && Save.hasWork())) { e.preventDefault(); e.returnValue = ''; } });
      return {
        session: be.session, groups: data.gruppen, pages: data.seiten, zustand: null, verlauf: null,
        info: { version: '1.76', author: 'TheDragonas', datei: { name, erstellt: block.dataset.erstellt || data.erstellt },
          warnung: `Interaktive KnowledgeTree-Datei „${name}“: Änderungen bleiben nur in diesem Fenster, bis du sie mit Datei → Datei speichern als neue Datei herunterlädst. In dein KnowledgeTree übernehmen: dort Datei → Importieren.` },
      };
    },
    async sync() { if (typeof App !== 'undefined' && App.booted) be.dirty = true; return { ok: true }; },   // Ergänzungen beim Start (Schnellnotizen) zählen nicht
    beacon() { },
    async saveVerlauf() { }, async saveZustand() { },
    async saveImage(blob) { const n = await ktHashName(await blob.arrayBuffer(), blob.type || 'image/png'); if (!assets.has(n)) assets.set(n, blob); return n; },
    async saveFile(blob, ext) { const e = String(ext || '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 8) || 'bin'; const n = await ktHashName(await blob.arrayBuffer(), blob.type, KT_EXT[(blob.type || '').toLowerCase()] || e); if (!assets.has(n)) assets.set(n, blob); return n; },
    async putAsset(n, blob) { if (!/^[0-9a-f]{40}\.[a-z0-9]{1,8}$/.test(n)) return this.saveFile(blob, n.split('.').pop()); assets.set(n, blob.type ? blob : new Blob([blob], { type: KtFile.mime(n) })); return n; },
    async hasAssets(names) { return new Set(names.filter(n => assets.has(n))); },
    async imgBlob(n) { return assets.get(n) || null; },
    async imgURL(n) { if (!urls.has(n) && assets.has(n)) urls.set(n, URL.createObjectURL(new Blob([assets.get(n)], { type: KtFile.mime(n) }))); return urls.get(n) || ''; },
    setImg(img, n) { this.imgURL(n).then(u => { if (u) img.src = u; else img.alt = 'Bild fehlt'; }); },
    trimURLs() { },
    openLink(url) { window.open(url, '_blank', 'noopener,noreferrer'); },
    async ping() { return true; },
    /* „Datei speichern“: alles als neue interaktive Datei herunterladen */
    async backup(opts = {}) {
      await Save.flushAll();
      const r = await KtFile.writeHtml({ groups: Store.groups, name, prog: opts.prog, check: opts.check });
      ktDownload(KtFile.exportName(name, 'html'), r.blob);
      be.dirty = false;
      UI.saveState('saved');
      return `Datei gespeichert (heruntergeladen): ${r.pages} Seiten, ${KtFile.size(r.blob.size)}`;
    },
    aboutHtml(i) {
      return `<p><b>Interaktive KnowledgeTree-Datei:</b> „${escapeHtml(name)}“${i.datei && i.datei.erstellt ? ` vom ${escapeHtml(new Date(i.datei.erstellt).toLocaleString('de-CH'))}` : ''}.</p>
      <p>Diese Datei ist ein eigenes kleines KnowledgeTree. Änderungen bleiben in diesem Fenster, bis du <b>Datei → Datei speichern</b> wählst (lädt die geänderte Datei herunter). In dein KnowledgeTree übernehmen: dort <b>Datei → Importieren</b> und diese Datei wählen.</p>`;
    },
  };
  return be;
}

const Backend = (typeof document !== 'undefined' && document.getElementById('kt-datei')) ? ktFileBackend(document.getElementById('kt-datei')) : (() => {
  const DB_NAME = 'KnowledgeTree';
  // Kopfangaben je Seite im Bereich „cache“ unter „meta:<id>“ (1.32, ohne neue Datenbank-Version)
  const headRange = () => IDBKeyRange.bound('meta:', 'meta:\uffff');
  const STORES = ['saves_struktur', 'saves_seiten', 'saves_bilder', 'cache', 'papierkorb', 'versionen'];
  /* Seitenversionen: Abstand und Anzahl (seit 1.24 in den Einstellungen; Standard 10 Minuten, 50 pro Seite) */
  const verCfg = () => { const v = (typeof Store !== 'undefined' && Store.ui && Store.ui.versionen) || {}; return { gap: clamp(+v.abstand || 10, 1, 1440) * 60000, max: clamp(Math.round(+v.max || 50), 1, 500) }; };
  const lastVer = new Map();
  let db = null;
  const urls = new Map();
  const loading = new Map();
  const myId = uid('tab');
  let channel = null;

  const req = (r) => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  const done = (t) => new Promise((res, rej) => { t.oncomplete = () => res(); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error || new Error('Speichern abgebrochen')); });

  function open() {
    return new Promise((res, rej) => {
      if (!window.indexedDB) { rej(new Error('Dieser Browser kann keine Daten speichern (IndexedDB fehlt).')); return; }
      const r = indexedDB.open(DB_NAME, 2);
      r.onupgradeneeded = () => {
        const d = r.result;
        for (const s of STORES) {
          if (d.objectStoreNames.contains(s)) continue;
          const st = d.createObjectStore(s, s === 'papierkorb' || s === 'versionen' ? { keyPath: 'id' } : undefined);
          if (s === 'versionen') st.createIndex('seite', ['page', 'saved']);
        }
      };
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error || new Error('Speicher konnte nicht geöffnet werden (privates Fenster?)'));
      r.onblocked = () => rej(new Error('Speicher ist blockiert – bitte andere Tabs mit KnowledgeTree schliessen und die Seite neu laden.'));
    });
  }

  function pageIds(groups, out = new Set()) {
    for (const g of groups || []) { for (const p of g.pages || []) out.add(p); pageIds(g.groups, out); }
    return out;
  }
  const EXT = KT_EXT, hashName = ktHashName;

  let track = null;   // während eines Imports: Namen der NEU gespeicherten Bilder/Dateien (zum restlosen Zurücknehmen)
  async function putImage(name, blob) {
    const t = db.transaction(['saves_bilder'], 'readwrite');
    const st = t.objectStore('saves_bilder');
    const exists = await req(st.getKey(name));
    if (exists === undefined) { st.put({ blob, t: Date.now() }, name); if (track) track.add(name); }
    await done(t);
  }

  /* Alle Einträge eines Speichers einzeln durchgehen (Cursor) – nie alles auf einmal laden (getAll holte früher
     beim Start sämtliche Seiten, Versionen und den ganzen Papierkorb gleichzeitig in den Speicher). */
  function each(store, fn, mode = 'readonly') {
    return new Promise((res, rej) => {
      const t = db.transaction([store], mode);
      const r = t.objectStore(store).openCursor();
      r.onsuccess = () => { const c = r.result; if (!c) return; try { fn(c); } catch (e) { /* weiter */ } c.continue(); };
      r.onerror = () => rej(r.error);
      t.oncomplete = () => res();
      t.onerror = () => rej(t.error);
    });
  }
  const NAMES = /[0-9a-f]{40}\.[a-z0-9]{1,8}/g;
  const skipPts = (k, v) => (k === 'pts' ? undefined : v);
  const scanInto = (set, x) => { const t = typeof x === 'string' ? x : JSON.stringify(x, skipPts); if (t) for (const m of t.match(NAMES) || []) set.add(m); };

  /* Speicher aufräumen (seit 1.20, ersetzt collectGarbage): löscht Bilder/Dateien, auf die nichts mehr verweist
     (Seiten und Verlauf im Speicher = opts.refs, ältere Papierkorb-Einträge, Versionen), Versionen gelöschter Seiten
     und Papierkorb-Einträge über 30 Tage (bis 1.41: 60). opts.pageIds: vorhandene Seiten; opts.grace: Bilder, die jünger sind,
     bleiben (Einfügen läuft evtl. noch); opts.only: nur diese Namen prüfen. Ergebnis: Zählung + freigegebene Bytes. */
  async function cleanup(opts = {}) {
    const res = { bilder: 0, bytes: 0, versionen: 0, papierkorb: 0 };
    const used = new Set(opts.refs || []);
    const grace = opts.grace == null ? 10 * 60 * 1000 : opts.grace;
    const now = Date.now();
    const pages = opts.pageIds || null;
    // Papierkorb (nur noch ältere Einträge): über 30 Tage → weg, sonst deren Namen behalten
    const trashIds = new Set();
    await each('papierkorb', (c) => {
      const x = c.value;
      if (now - (x.deletedAt || 0) > 30 * 24 * 3600 * 1000) { c.delete(); res.papierkorb++; return; }
      if (x.page) { trashIds.add(x.page.id); scanInto(used, x.page); }
    }, 'readwrite');
    // Versionen: von gelöschten Seiten → weg; sonst deren Namen behalten
    await each('versionen', (c) => {
      const v = c.value;
      if (pages && !pages.has(v.page) && !trashIds.has(v.page)) { c.delete(); res.versionen++; return; }
      scanInto(used, v.data);
    }, 'readwrite');
    // Bilder/Dateien: nur die Schlüssel lesen; was keiner braucht und alt genug ist → löschen
    const keys = await req(db.transaction(['saves_bilder'], 'readonly').objectStore('saves_bilder').getAllKeys());
    const cand = keys.filter(k => !used.has(k) && (!opts.only || opts.only.has(k)));
    for (let i = 0; i < cand.length; i += 200) {
      const t = db.transaction(['saves_bilder'], 'readwrite');
      const st = t.objectStore('saves_bilder');
      for (const k of cand.slice(i, i + 200)) {
        const v = await req(st.get(k));
        if (!v || now - (v.t || 0) < grace) continue;
        res.bytes += (v.blob && v.blob.size) || 0;
        st.delete(k);
        res.bilder++;
      }
      await done(t);
    }
    return res;
  }

  const download = ktDownload;

  return {
    kind: 'browser',
    session: myId,

    /* Laden in Stufen (seit 1.30, opts.stufen): zuerst nur Baum, Einstellungen, Verlauf und die Liste der Seiten –
     * die Inhalte holt danach loadPages(ids) in kleinen Stücken (Store.lazy), die gewünschte Seite zuerst. */
    async load(opts = {}) {
      db = await open();
      const t = db.transaction(['saves_struktur', 'saves_seiten', 'cache'], 'readonly');
      const cs = t.objectStore('cache'), st = !!opts.stufen;
      // in Stufen (1.32): Kopfangaben der Seiten statt Inhalte, der Verlauf kommt später (loadVerlauf)
      const [groups, keys, vals, zustand, verlauf, hkeys, hvals] = await Promise.all([
        req(t.objectStore('saves_struktur').get('gruppen')),
        // Schlüssel der Seiten zu lesen kostet so viel wie die Seiten zu durchlaufen (bei 2500 Seiten ~45 ms) – in Stufen
        // genügen die Seiten im Baum plus die Kopfangaben; was fehlt, nimmt das Nachladen aus dem Baum (wie früher)
        st ? null : req(t.objectStore('saves_seiten').getAllKeys()),
        st ? null : req(t.objectStore('saves_seiten').getAll()),
        req(cs.get('zustand')),
        st ? undefined : req(cs.get('verlauf')),
        st ? req(cs.getAllKeys(headRange())) : null,
        st ? req(cs.getAll(headRange())) : null,
      ]);
      const pages = {}, meta = {};
      if (vals) keys.forEach((k, i) => { pages[k] = vals[i]; });
      if (hkeys) hkeys.forEach((k, i) => { meta[String(k).slice(5)] = hvals[i]; });
      // Nur ein Tab darf speichern: ein neuer Tab übernimmt, der alte wird schreibgeschützt
      try {
        channel = new BroadcastChannel('knowledgetree');
        channel.onmessage = (e) => { if (e.data && e.data.t === 'hallo' && e.data.id !== myId) UI.conflict(); };
        channel.postMessage({ t: 'hallo', id: myId });
      } catch (e) { /* ältere Browser */ }
      let persisted = false;
      try { persisted = navigator.storage && navigator.storage.persist ? await navigator.storage.persist() : false; } catch (e) { /* */ }
      return {
        session: myId, groups: groups || [], pages, pageIds: st ? [...pageIds(groups, new Set(Object.keys(meta)))] : undefined, meta, zustand: zustand || null, verlauf: st ? undefined : verlauf || null,
        info: { version: '1.76', author: 'TheDragonas', persisted },
      };
    },
    async loadVerlauf() { return (await req(db.transaction(['cache'], 'readonly').objectStore('cache').get('verlauf'))) || null; },
    /* Kopfangaben nachtragen (Daten von vor 1.32 oder von einem älteren Tab geschrieben) */
    async writeHeads(map) {
      const t = db.transaction(['cache'], 'readwrite'), cs = t.objectStore('cache');
      for (const [id, h] of Object.entries(map)) cs.put(h, 'meta:' + id);
      await done(t);
    },
    /* Seiteninhalte nach Kennung (eine Lese-Transaktion je Stück) */
    async loadPages(ids) {
      const st = db.transaction(['saves_seiten'], 'readonly').objectStore('saves_seiten');
      const vals = await Promise.all(ids.map(id => req(st.get(id))));
      const out = {};
      ids.forEach((id, i) => { if (vals[i]) out[id] = vals[i]; });
      return out;
    },

    async sync({ groups, pages }) {
      let removed = 0;
      const t = db.transaction(['saves_struktur', 'saves_seiten', 'papierkorb', 'versionen', 'cache'], 'readwrite');
      const ps = t.objectStore('saves_seiten'), hs = t.objectStore('cache');
      const vs = t.objectStore('versionen');
      t.objectStore('saves_struktur').put(groups, 'gruppen');
      const now = Date.now();
      const { gap: VERSION_GAP, max: VERSION_MAX } = verCfg();
      for (const [id, p] of Object.entries(pages)) {
        // früheren Stand als Version behalten (höchstens alle 10 Minuten)
        try {
          if (!lastVer.has(id)) {
            const cur = await req(vs.index('seite').openCursor(IDBKeyRange.bound([id, 0], [id, Infinity]), 'prev'));
            lastVer.set(id, cur ? cur.value.saved : 0);
          }
          if (now - lastVer.get(id) > VERSION_GAP) {
            const old = await req(ps.get(id));
            if (old && JSON.stringify(old.boxes) + JSON.stringify(old.drawings || []) + old.title !== JSON.stringify(p.boxes) + JSON.stringify(p.drawings || []) + p.title &&
              ((old.boxes && old.boxes.length) || (old.drawings && old.drawings.length))) {
              vs.put({ id: uid('v'), page: id, saved: now, t: old.modified || old.created || now, title: old.title || '', data: old });
              lastVer.set(id, now);
              const range = IDBKeyRange.bound([id, 0], [id, Infinity]);
              const n = await req(vs.index('seite').count(range));
              if (n > VERSION_MAX) {
                let extra = n - VERSION_MAX;
                const keys = await req(vs.index('seite').getAllKeys(range, extra));
                for (const k of keys) { if (extra-- <= 0) break; vs.delete(k); }
              }
            }
          }
        } catch (e) { /* Versionen sind nicht wichtig */ }
        ps.put(p, id);
        hs.put(pageHead(p), 'meta:' + id);   // Kopfangaben für das Laden in Stufen (1.32)
      }
      // Gelöschte Seiten restlos entfernen (seit 1.20 kein Papierkorb mehr – zurückholen geht mit Strg+Z; die Bilder
      // räumt cleanup() weg, sobald auch der Verlauf sie nicht mehr braucht), samt ihren Versionen
      const keep = pageIds(groups);
      const keys = await req(ps.getAllKeys());
      for (const k of keys) {
        if (keep.has(k)) continue;
        ps.delete(k);
        hs.delete('meta:' + k);
        lastVer.delete(k);
        try { for (const vk of await req(vs.index('seite').getAllKeys(IDBKeyRange.bound([k, 0], [k, Infinity])))) vs.delete(vk); } catch (e) { /* */ }
        removed++;
      }
      await done(t);
      return { ok: true, removed };
    },
    beacon(payload) { if (db) this.sync(payload).catch(() => { }); },

    async saveVerlauf(v) {
      const t = db.transaction(['cache'], 'readwrite');
      t.objectStore('cache').put(v, 'verlauf');
      await done(t);
    },
    async saveZustand(z) {
      const t = db.transaction(['cache'], 'readwrite');
      t.objectStore('cache').put(JSON.parse(JSON.stringify(z)), 'zustand');
      await done(t);
    },

    /* Bild/Datei speichern. Seit 1.18 ohne sofortige Objekt-URL (die hielt jedes importierte Bild für immer im
       Speicher) – die URL entsteht erst, wenn das Bild angezeigt wird (imgURL). Der Blob wird nicht kopiert. */
    async saveImage(blob) {
      if (blob.size > 40 * 1024 * 1024) throw new Error('Bild ist zu gross (max. 40 MB)');
      const type = blob.type || 'image/png';
      const name = await hashName(await blob.arrayBuffer(), type);
      await putImage(name, blob.type ? blob : new Blob([blob], { type }));
      return name;
    },
    /* beliebige Datei (Anhang) – gleicher Speicher wie Bilder */
    async saveFile(blob, ext) {
      if (blob.size > 100 * 1024 * 1024) throw new Error('Datei ist zu gross (max. 100 MB)');
      const type = blob.type || 'application/octet-stream';
      const e = String(ext || '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 8) || 'bin';
      const name = await hashName(await blob.arrayBuffer(), type, EXT[type.toLowerCase()] || e);
      await putImage(name, blob.type ? blob : new Blob([blob], { type }));
      return name;
    },
    /* gespeicherte Datei direkt als Blob (Export) – ohne Objekt-URL */
    async imgBlob(name) {
      const t = db.transaction(['saves_bilder'], 'readonly');
      const v = await req(t.objectStore('saves_bilder').get(name));
      return v && v.blob ? v.blob : null;
    },
    async imgURL(name) {
      if (urls.has(name)) return urls.get(name);
      if (!loading.has(name)) {
        loading.set(name, (async () => {
          const t = db.transaction(['saves_bilder'], 'readonly');
          const v = await req(t.objectStore('saves_bilder').get(name));
          const u = v && v.blob ? URL.createObjectURL(v.blob) : '';
          if (u) urls.set(name, u);
          return u;
        })());
      }
      return loading.get(name);
    },
    /* Objekt-URLs freigeben, die nicht mehr gebraucht werden (ab 120 Stück; die URL entsteht bei Bedarf neu) */
    trimURLs(keep, limit = 120) {
      if (urls.size <= limit) return;
      if (typeof keep === 'function') keep = keep();   // seit 1.35: Liste erst bei Bedarf
      for (const [n, u] of urls) if (!keep.has(n)) { URL.revokeObjectURL(u); urls.delete(n); loading.delete(n); }
    },
    setImg(img, name) {
      if (urls.has(name)) { img.src = urls.get(name); return; }
      this.imgURL(name).then(u => { if (u) img.src = u; else img.alt = 'Bild fehlt'; });
    },
    openLink(url) { window.open(url, '_blank', 'noopener,noreferrer'); },
    async ping() { return true; },

    /* ---------------------------------------------- Sicherung
     * Seit 1.25 wie bei OneNote: ein Ordner „KnowledgeTree-Backup_<Datum>“ mit einem Unterordner je Notizbuch und
     * Abschnittsgruppe und einer KT-Datei je Abschnitt (KtFile.writeFolder). opts.folder: in diesen Ordner
     * schreiben (File System Access, Chrome/Edge) und dort nur die neuesten opts.keep Sicherungen behalten; sonst
     * den Sicherungsordner als eine ZIP-Datei herunterladen. Das Lesen übernimmt KtFile.read. */
    async backup(opts = {}) {
      await Save.flushAll();
      const r = await KtFile.writeFolder({ groups: Store.groups, art: 'backup', name: 'KnowledgeTree', prog: opts.prog, check: opts.check });
      const name = KtFile.backupName();
      let bytes = 0;
      for (const f of r.files) bytes += f.blob.size;
      if (opts.folder) {
        const dir = await opts.folder.getDirectoryHandle(name, { create: true });
        try {
          for (const f of r.files) {
            const parts = f.path.split('/');
            let d = dir;
            for (const p of parts.slice(0, -1)) d = await d.getDirectoryHandle(p, { create: true });
            const w = await (await d.getFileHandle(parts[parts.length - 1], { create: true })).createWritable();
            await w.write(f.blob);
            await w.close();
          }
        } catch (e) { try { await opts.folder.removeEntry(name, { recursive: true }); } catch (e2) { /* */ } throw e; }
        // aufbewahren: Sicherungsordner (1.25) und ZIP-Backups (1.24) zusammen, die ältesten zuerst weg
        const list = [];
        for await (const [n, h] of opts.folder.entries()) if (/^KnowledgeTree-Backup_\d{4}-\d\d-\d\d_\d\d-\d\d/.test(n) && (h.kind === 'directory' || /\.zip$/.test(n))) list.push(n);
        list.sort((a, b) => a.replace(/\.zip$/, '').localeCompare(b.replace(/\.zip$/, '')));
        while (list.length > Math.max(1, opts.keep || 10)) { try { await opts.folder.removeEntry(list.shift(), { recursive: true }); } catch (e) { /* gesperrt → nächstes Mal */ } }
      } else {
        const zip = await KtFile.zipFiles(r.files);
        bytes = zip.size;
        download(name + '.zip', zip);
      }
      return `Backup ${opts.folder ? 'im Sicherungsordner gespeichert' : 'heruntergeladen'}: ${name}${opts.folder ? '' : '.zip'} (${r.sections} Abschnitte, ${r.pages} Seiten, ${r.images} Bilder, ${KtFile.size(bytes)})`;
    },
    /* Bild/Anhang aus einer KnowledgeTree-Datei unter seinem Namen ablegen (Name = SHA-1 des Inhalts) */
    async putAsset(name, blob) {
      const ext = String(name).split('.').pop().toLowerCase();
      const type = blob.type || KtFile.mime(name);
      if (!/^[0-9a-f]{40}\.[a-z0-9]{1,8}$/.test(name)) return type.startsWith('image/') ? this.saveImage(new Blob([blob], { type })) : this.saveFile(new Blob([blob], { type }), ext);
      await putImage(name, blob.type === type ? blob : new Blob([blob], { type }));
      return name;
    },
    async hasAssets(names) {
      const st = db.transaction(['saves_bilder'], 'readonly').objectStore('saves_bilder');
      const out = new Set();
      await Promise.all(names.map(async (n) => { if (await req(st.getKey(n)) !== undefined) out.add(n); }));
      return out;
    },
    /* kleine Einträge im Bereich „cache“ (z.B. der gewählte Sicherungsordner – ein Ordner-Handle lässt sich speichern) */
    async cacheGet(key) { return req(db.transaction(['cache'], 'readonly').objectStore('cache').get(key)); },
    async cachePut(key, v) {
      const t = db.transaction(['cache'], 'readwrite');
      if (v === undefined) t.objectStore('cache').delete(key); else t.objectStore('cache').put(v, key);
      await done(t);
    },

    /* ---------------------------------------------- Seitenversionen */
    async versionList(pid) {
      const t = db.transaction(['versionen'], 'readonly');
      const all = await req(t.objectStore('versionen').index('seite').getAll(IDBKeyRange.bound([pid, 0], [pid, Infinity])));
      return all.reverse().map(v => ({ id: v.id, t: v.t, saved: v.saved, title: v.title }));
    },
    async versionGet(vid) {
      const t = db.transaction(['versionen'], 'readonly');
      const v = await req(t.objectStore('versionen').get(vid));
      return v ? v.data : null;
    },
    async versionDelete(ids) {
      const t = db.transaction(['versionen'], 'readwrite');
      for (const id of ids) t.objectStore('versionen').delete(id);
      await done(t);
    },

    /* ---------------------------------------------- Papierkorb */
    /* nur Titel/Pfad/Datum (Cursor) – die Seiten selbst erst beim Wiederherstellen (trashGet) */
    async trashList() {
      const out = [];
      await each('papierkorb', (c) => { const x = c.value; out.push({ id: x.id, title: (x.page && x.page.title) || '', path: x.path || [], deletedAt: x.deletedAt || 0 }); });
      return out.sort((a, b) => b.deletedAt - a.deletedAt);
    },
    async trashGet(id) {
      const v = await req(db.transaction(['papierkorb'], 'readonly').objectStore('papierkorb').get(id));
      return v ? v.page : null;
    },
    async trashRemove(ids) {
      const t = db.transaction(['papierkorb'], 'readwrite');
      for (const id of ids) t.objectStore('papierkorb').delete(id);
      await done(t);
    },

    cleanup,
    /* Import: neu gespeicherte Bilder/Dateien mitschreiben (für restloses Zurücknehmen) */
    trackStart() { track = new Set(); },
    trackStop() { const t = track; track = null; return t || new Set(); },
    async storageInfo() {
      try {
        const e = await navigator.storage.estimate();
        const p = navigator.storage.persisted ? await navigator.storage.persisted() : false;
        return { usage: e.usage || 0, quota: e.quota || 0, persisted: p };
      } catch (e) { return null; }
    },
    aboutHtml() {
      return `<p><b>Wo sind meine Daten?</b><br>Alles wird <b>nur in diesem Browser</b> auf diesem Gerät gespeichert (IndexedDB: Bereiche „Saves“ und „Cache“). Niemand sonst sieht deine Notizen – auch nicht, wenn die Webseite öffentlich ist.</p>
      <p id="kt-storage" style="color:var(--ink-3)">Speicher wird geprüft …</p>
      <p><b>Wichtig:</b> Wenn du die Browserdaten löschst, sind die Notizen weg. Mach deshalb regelmässig unter <b>Datei → Backup erstellen</b> eine Sicherung (unter <b>Datei → Optionen → Sicherung</b> auch automatisch). Mit „Backup laden“ holst du sie zurück – auch auf einem anderen Computer oder im Windows-Programm.</p>`;
    },
  };
})();
