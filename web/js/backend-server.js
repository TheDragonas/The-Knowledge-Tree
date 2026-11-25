'use strict';
/* Speicher-Anbindung für das Desktop-Programm: lokaler Server, Ordner "Saves" und "Cache" */

const Backend = {
  kind: 'server',
  token: new URLSearchParams(location.search).get('t') || '',
  session: '',

  async call(path, body, opts = {}) {
    if (Store.readOnly) throw new Error('schreibgeschützt');
    const headers = { 'X-Token': this.token, 'X-Sitzung': this.session };
    let payload;
    if (body instanceof Blob) { payload = body; headers['Content-Type'] = body.type || 'application/octet-stream'; }
    else { payload = JSON.stringify(body ?? {}); headers['Content-Type'] = 'application/json'; }
    const r = await fetch(path, { method: 'POST', headers, body: payload, keepalive: !!opts.keepalive });
    if (r.status === 409) { UI.conflict(); throw new Error('Konflikt'); }
    if (!r.ok) throw new Error((await r.text()) || r.statusText);
    return r.json();
  },

  /* opts.stufen (1.30): ohne Seiteninhalte, dafür Kennungen und Titel aller Seiten – Inhalte über loadPages */
  async load(opts = {}) {
    const r = await fetch('api/laden' + (opts.stufen ? '?stufen=1' : ''), { method: 'POST', headers: { 'X-Token': this.token } });
    if (!r.ok) throw new Error(r.status === 403 ? 'Kein Zugriff – bitte das Programm über KnowledgeTree.exe starten.' : r.statusText);
    const d = await r.json();
    this.session = d.session;
    return d;
  },
  async loadVerlauf() {
    const r = await fetch('api/verlauf-laden', { method: 'POST', headers: { 'X-Token': this.token } });
    return r.ok ? r.json() : null;
  },
  async loadPages(ids) {
    const r = await fetch('api/seiten', { method: 'POST', headers: { 'X-Token': this.token, 'Content-Type': 'application/json' }, body: JSON.stringify({ ids }) });
    if (!r.ok) throw new Error(r.statusText);
    return (await r.json()).pages || {};
  },
  /* Speichern in Teilen (seit 1.24): jede Seite wird einmal zu Text, und höchstens ~16 MB gehen in eine Anfrage.
     Vorher ging bei einem grossen Import alles in EINE Anfrage (Server-Grenze 200 MB, doppelter Speicher). Die
     Teile davor tragen "teil": true – der Server legt dann nur an und räumt erst beim letzten Teil auf. */
  SYNC_PART: 16e6,
  async sync(payload) {
    const head = '{"groups":' + JSON.stringify(payload.groups) + ',"titles":' + JSON.stringify(payload.titles);
    let parts = [], size = 0;
    const send = (last) => this.call('/api/sync', new Blob([head, last ? '' : ',"teil":true', ',"pages":{', ...parts, '}}'], { type: 'application/json' }));
    for (const [id, p] of Object.entries(payload.pages || {})) {
      const s = JSON.stringify(id) + ':' + JSON.stringify(p);
      if (size && size + s.length > this.SYNC_PART) { await send(false); parts = []; size = 0; }
      parts.push((parts.length ? ',' : '') + s);
      size += s.length;
    }
    return send(true);
  },
  beacon(payload) {
    try {
      fetch('/api/sync', {
        method: 'POST', keepalive: true,
        headers: { 'X-Token': this.token, 'X-Sitzung': this.session, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    } catch (e) { /* ignorieren */ }
  },
  saveVerlauf(v) { return this.call('/api/verlauf', v); },
  saveZustand(z) { return this.call('/api/zustand', z); },
  async saveImage(blob) { return (await this.call('/api/bild', blob)).name; },
  /* Bild/Anhang aus einer KnowledgeTree-Datei übernehmen – der Server bildet den Namen aus dem Inhalt neu */
  async putAsset(name, blob) {
    const ext = String(name).split('.').pop().toLowerCase();
    const buf = await blob.arrayBuffer();   // Inhalt sicher lesen (nicht als Ausschnitt einer grossen Datei schicken)
    if (!buf.byteLength) throw new Error('leeres Bild');
    const typed = new Blob([buf], { type: KtFile.mime(name) });
    return /^(png|jpe?g|gif|webp|bmp|svg)$/.test(ext) ? this.saveImage(typed) : this.saveFile(typed, ext);
  },
  /* welche dieser Bilder/Anhänge schon da sind (Saves/_Bilder, auch aus dem Papierkorb zurückgeholt) */
  async hasAssets(names) {
    const out = new Set();
    for (let i = 0; i < names.length; i += 5000) for (const n of (await this.call('/api/vorhanden', { namen: names.slice(i, i + 5000) })).vorhanden || []) out.add(n);
    return out;
  },
  async saveFile(blob, ext) { return (await this.call('/api/datei?ext=' + encodeURIComponent(String(ext || 'bin')), blob)).name; },
  setImg(img, name) { img.src = 'bilder/' + encodeURIComponent(name); },
  async imgURL(name) { return 'bilder/' + encodeURIComponent(name); },
  openLink(url) { this.call('/api/link', { url }).catch(() => UI.toast('Link konnte nicht geöffnet werden')); },
  async ping() {
    const r = await this.call('/api/ping');
    return !(r.session && r.session !== this.session);
  },
  async quit() { try { await this.call('/api/beenden'); } catch (e) { /* */ } },
  openFolder(which) { this.call('/api/ordner?w=' + which).catch(() => { }); },
  /* Add-Ins-Ordner neben der EXE (1.69): *.js laden, hineinkopieren, nach _entfernt verschieben, KI-Vorlage */
  addinFolder: true,
  async addinList() { return (await this.call('/api/addins', { a: 'liste' })).liste || []; },
  async addinSave(datei, code) { return (await this.call('/api/addins', { a: 'speichern', datei, code })).datei; },
  async addinRemove(datei) { return this.call('/api/addins', { a: 'entfernen', datei }); },
  async addinTemplate() {
    const r = await fetch('/api/addins', { method: 'POST', headers: { 'X-Token': this.token, 'Content-Type': 'application/json' }, body: '{"a":"vorlage"}' });
    return r.ok ? r.text() : '';
  },
  /* Backup = ZIP des Saves-Ordners in Cache/Backups (seit 1.24 mit Bildern, gleiches Format wie im Browser) */
  async backup() {
    const r = await this.call('/api/backup?immer=1');
    return r.name ? `Backup erstellt (wie bei OneNote: Ordner je Notizbuch, Datei je Abschnitt): Cache/Backups/${r.name} (${KtFile.size(r.groesse)})` : 'Nichts zu sichern – noch keine Seiten';
  },
  /* Backups in Cache/Backups: Ordner wie bei OneNote (1.25) → { name, entries } (jede Datei wird erst beim Lesen
     geholt), ältere ZIP-Backups → File */
  async listBackups() {
    return ((await this.call('/api/backups')).liste || []).map(b => ({ ...b, get: () => (b.ordner ? this.backupFolder(b.name) : this.backupBlob(b.name)) }));
  },
  async backupBlob(name, pfad) {
    const r = await fetch('/api/backup-datei?name=' + encodeURIComponent(name) + (pfad ? '&pfad=' + encodeURIComponent(pfad) : ''), { method: 'POST', headers: { 'X-Token': this.token } });
    if (!r.ok) throw new Error((await r.text()) || r.statusText);
    const b = await r.blob();
    const fn = pfad ? pfad.split('/').pop() : name;
    try { return new File([b], fn, { type: b.type }); } catch (e) { b.name = fn; return b; }
  },
  async backupFolder(name) {
    const list = (await this.call('/api/backup-dateien?name=' + encodeURIComponent(name))).dateien || [];
    return { name, entries: list.map(f => ({ name: f.pfad, size: f.groesse, blob: () => this.backupBlob(name, f.pfad), read: async () => new Uint8Array(await (await this.backupBlob(name, f.pfad)).arrayBuffer()) })) };
  },
  async storage() { return this.call('/api/speicher'); },
  async optimize() { return this.call('/api/optimieren', {}); },   // Speicher optimieren (1.39)
  aboutHtml(i) {
    return `<p><b>Deine Daten (Saves):</b><br><span class="path">${escapeHtml(i.saves || '')}</span></p>
      <p><b>Zwischenspeicher (Cache):</b><br><span class="path">${escapeHtml(i.cache || '')}</span></p>`;
  },
};
