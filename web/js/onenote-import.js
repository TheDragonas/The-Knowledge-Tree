'use strict';
/* OneNote importieren: .one (Abschnitt) und .onepkg (Notizbuch) -> Notizbücher, Abschnitte, Seiten in KnowledgeTree */

const TAG_SYMBOLS = [
  [/wichtig|important/i, '⭐'], [/frage|question/i, '❓'], [/idee|idea/i, '💡'], [/kritisch|critical/i, '❗'],
  [/merken|später|remember|later/i, '📌'], [/definition/i, '📖'], [/hervorheb|highlight/i, '🖍'], [/kontakt|contact/i, '👤'],
  [/adresse|address/i, '🏠'], [/telefon|phone/i, '📞'], [/website|webseite/i, '🔗'], [/zitat|quote/i, '💬'],
  [/projekt|project/i, '📁'], [/film|movie|musik|music|buch|book/i, '🎬'], [/passwort|password/i, '🔑'],
  [/besprech|discuss|diskut/i, '🗨'], [/termin|meeting|besprechung/i, '📅'], [/kunde|client/i, '🤝'],
];
const TODO_RE = /aufgabe|to ?do|task|erledig|anruf|call|kauf|buy|e-?mail/i;
/* Standard-Formatvorlagen von OneNote (gelten, wenn die Datei selbst nichts angibt) */
const ON_STYLES = {
  h1: { font: 'Calibri Light', size: 16, color: '#1e4e79' }, h2: { font: 'Calibri Light', size: 14, color: '#2e75b5' },
  h3: { font: 'Calibri', size: 12, color: '#1f3763' }, h4: { font: 'Calibri', size: 12, color: '#2f5496', i: true },
  h5: { font: 'Calibri', size: 11, color: '#2e75b5' }, h6: { font: 'Calibri', size: 11, color: '#2e75b5', i: true },
  pagetitle: { font: 'Calibri Light', size: 20 }, cite: { size: 9, color: '#595959' }, quote: { i: true, color: '#595959' },
  blockquote: { i: true, color: '#595959' }, code: { font: 'Consolas' }, p: { font: 'Calibri', size: 11 },
};
/* Platz, den Titel und Datum oben auf einer OneNote-Seite belegen (bei KnowledgeTree stehen sie über der Fläche) */
const ON_TITLE_SPACE = 56;
const fontCss = (f) => `font-family:&quot;${escapeHtml(f)}&quot;${/^calibri/i.test(f) ? ',Carlito' : ''},var(--font-note)`;

/* Import-Journal (seit 1.20): steht während eines Imports im localStorage (übersteht einen Absturz). Findet der
 * nächste Start ein Journal ohne Lebenszeichen, ist der Browser mitten im Import abgestürzt („Out of Memory“):
 * dann werden die halb importierten Notizbücher/Abschnitte samt Seiten restlos entfernt (OneImport.removeCreated)
 * und die letzten Angaben (Datei, Abschnitt, Seite, Speicher) angezeigt – als Hinweis auf die Ursache. */
const ImportJournal = {
  // interaktive Datei (1.25): eigener Schlüssel je Fenster – sonst sähe sie (von der Festplatte geöffnet) das Journal des echten KnowledgeTree
  get KEY() { return typeof Backend !== 'undefined' && Backend.kind === 'datei' ? 'kt-import-journal-' + Backend.session : 'kt-import-journal'; },
  cur: null, timer: null, wrote: 0,
  read() { try { return JSON.parse(localStorage.getItem(this.KEY) || 'null'); } catch (e) { return null; } },
  write(j) { try { localStorage.setItem(this.KEY, JSON.stringify(j)); this.wrote = Date.now(); } catch (e) { /* voll oder gesperrt */ } },
  clear() { try { localStorage.removeItem(this.KEY); } catch (e) { /* */ } },
  heap() { try { return performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1e6) : null; } catch (e) { return null; } },
  start(files, before) {
    this.cur = { v: 1, start: Date.now(), beat: Date.now(), files, before: [...before], phase: { heap: this.heap() } };
    this.write(this.cur);
    clearInterval(this.timer);
    this.timer = setInterval(() => this.beat(), 5000);
  },
  /* Lebenszeichen + Stand (höchstens alle 2 s geschrieben, ausser force) */
  beat(phase, force) {
    const j = this.cur;
    if (!j) return;
    j.beat = Date.now();
    if (phase) Object.assign(j.phase, phase);
    j.phase.heap = this.heap();
    j.phase.maxHeap = Math.max(j.phase.maxHeap || 0, j.phase.heap || 0);
    if (force || phase === undefined || Date.now() - this.wrote > 2000) this.write(j);
  },
  done() { clearInterval(this.timer); this.timer = null; this.cur = null; this.clear(); },
  /* beim Start: abgestürzter Import? (ohne Lebenszeichen seit 30 s – sonst importiert evtl. gerade ein anderer Tab) */
  crashed() {
    const j = this.read();
    if (!j || !Array.isArray(j.before)) { if (j) this.clear(); return null; }
    return Date.now() - (j.beat || 0) > 30000 ? j : null;
  },
};

const OneImport = {
  /* ---------------------------------------------------------- Importieren: EIN Knopf für alles (seit 1.17)
   * Entscheidet selbst – nach dem Inhalt der Datei (Signatur), nicht nur nach der Endung:
   *   .one / .onetoc2   OneNote-Abschnitt (Ziel wählen), mit Begleitdateien (.onebin, „…_onefiles“)
   *   .onepkg (CAB)     OneNote-Notizbuch → neues Notizbuch
   *   ZIP / RAR (7z)    entpacken → Notizbücher mit Ordnerstruktur (OneNote- und KnowledgeTree-Dateien darin)
   *   Ordner            wie ein entpacktes Archiv (gewählt oder hineingezogen)
   *   KT-Datei          KnowledgeTree-Datei/Backup (ZIP seit 1.24, .json bis 1.23) oder ein Saves-/Notizbuch-Ordner des
   *                     Windows-Programms → als neue Notizbücher hinzufügen (ersetzen: „Backup laden“)
   *   Bilder, PDF, Word/Excel/PowerPoint, CSV, alles andere → auf die aktuelle Seite (wie Hineinziehen)
   * Gleicher Weg für den Knopf, das Hineinziehen auf die Fläche und auf das übrige Fenster. */
  async pick(folder) {
    if (!Store.complete) return Store.gate(() => this.pick(folder));   // alle Seiten nötig (Laden in Stufen, 1.30)
    const files = await new Promise((res) => {
      const inp = el('input', { type: 'file', multiple: true, style: { display: 'none' } });
      if (folder) { inp.webkitdirectory = true; inp.setAttribute('webkitdirectory', ''); inp.setAttribute('directory', ''); }
      inp.addEventListener('change', () => { res([...inp.files]); inp.remove(); });
      document.body.append(inp);
      inp.click();
    });
    if (files.length) await this.auto(files.map(f => ({ file: f, path: f.webkitRelativePath || f.name })));
  },
  // frühere Einzel-Knöpfe (bleiben als Befehle erhalten, führen jetzt alle über auto())
  start() { return this.pick(false); },
  importFolder() { return this.pick(true); },

  /* Art einer Datei bestimmen: 'one' | 'toc' | 'onepkg' | 'archive' | 'companion' | 'ktbackup' | 'image' | 'csv' | 'file' */
  async kindOf(file, path) {
    const name = (file.name || '').toLowerCase();
    path = String(path || name).replace(/\\/g, '/');
    if (this.isCompanion(path)) return 'companion';
    let h;
    try { h = new Uint8Array(await file.slice(0, 64).arrayBuffer()); } catch (e) { h = new Uint8Array(0); }
    if (h.length >= 16) {
      const g = ON.guidStr(h, 0);
      if (g === ON.FT_ONE) return 'one';
      if (g === ON.FT_TOC) return 'toc';
    }
    const sig = String.fromCharCode(...h.slice(0, 4));
    if (sig === 'MSCF') return 'onepkg';
    if (sig === 'Rar!' || (h[0] === 0x37 && h[1] === 0x7A && h[2] === 0xBC && h[3] === 0xAF) || /\.(7z|tar|tgz|tar\.gz)$/.test(name)) return 'archive';
    if (h[0] === 0x50 && h[1] === 0x4B) {
      // ZIP – aber Word/Excel/PowerPoint/OpenDocument sind auch ZIPs: die gehören auf die Seite
      if (/\.zip$/.test(name)) return 'archive';
      if (/\.(docx|docm|dotx|xlsx|xlsm|pptx|pptm|odt|ods|odp|epub|xps|oxps|jar|apk|vsdx)$/.test(name)) return 'file';
      try { const m = await openZip(file); if (!m.some(e => /^\[Content_Types\]\.xml$|^mimetype$/i.test(e.name))) return 'archive'; } catch (e) { /* */ }   // nur das Inhaltsverzeichnis lesen
      return 'file';
    }
    if (/\.(one|onetoc2)$/.test(name)) return name.endsWith('.onetoc2') ? 'toc' : 'one';   // Endung stimmt, Kopf beschädigt → Leser meldet es
    if (/\.onepkg$/.test(name)) return 'onepkg';
    if (/\.(zip|rar)$/.test(name)) return 'archive';
    if (/\.json$/.test(name)) {
      try { const t = await file.slice(0, 4000).text(); if (/"typ"\s*:\s*"KnowledgeTree-(Backup|Seite)"/.test(t)) return 'ktbackup'; } catch (e) { /* */ }
      return 'file';
    }
    if (/\.html?$/.test(name) || (file.type || '') === 'text/html') {
      // interaktive KnowledgeTree-Datei (1.25) – sonst eine normale HTML-Datei (Anhang) bzw. die KT-Webseite zum Ansehen
      try { const t = await file.slice(0, 8000).text(); if (/id="kt-datei"/.test(t)) return 'ktbackup'; if (/<meta name="generator" content="KnowledgeTree">/.test(t)) return 'ktweb'; } catch (e) { /* */ }
      return 'file';
    }
    if ((file.type || '').startsWith('image/') || /\.(png|jpe?g|gif|webp|bmp|svg)$/.test(name)) return 'image';
    if (/\.(csv|tsv)$/.test(name) || file.type === 'text/csv') return 'csv';
    return 'file';
  },

  /* list: File[] oder [{ file, path }]; opts.pt / opts.box: wohin Bilder & Co. auf der Seite kommen */
  async auto(list, opts = {}) {
    if (!Store.complete) return Store.gate(() => this.auto(list, opts));   // alle Seiten nötig (Laden in Stufen, 1.30)
    // Archive (RAR-Worker, entpackte Blobs) nach dem Import immer freigeben – auch bei Abbruch oder Fehler
    try { return await this.autoRun(list, opts); }
    finally { this.closeArchives(); }
  },
  async autoRun(list, opts = {}) {
    const items = list.map(x => x instanceof Blob ? { file: x, path: x.webkitRelativePath || x.name } : x).filter(x => x && x.file);
    if (!items.length) return;
    if (Store.readOnly) { UI.toast('Nur lesen – Import nicht möglich'); return; }
    UI.toast('Dateien werden geprüft …', 60000);
    await new Promise(r => setTimeout(r, 30));
    const plan = this.newPlan();
    plan._files = items.map(it => `${it.path || it.file.name} (${Math.round((it.file.size || 0) / 1e6)} MB)`);
    const kinds = new Map();
    for (const it of items) kinds.set(it, await this.kindOf(it.file, it.path));
    // Seit 1.18 wird hier nichts mehr ganz gelesen: jede Datei, jeder Archiv-Eintrag ist ein „Eintrag“
    // { name: Pfad, size, read() } und wird erst beim Umwandeln geladen – Abschnitt für Abschnitt.
    // 1) Ordner (Pfade mit „/“): je oberstem Ordner ein Notizbuch – wie ein entpacktes Archiv
    const tops = new Map(), loose = [];
    for (const it of items) {
      const k = kinds.get(it);
      if (!/[\\/]/.test(it.path || '')) { loose.push(it); continue; }
      // aus einem Ordner nur, was zu OneNote/KnowledgeTree gehört – Fotos o.ä. im Ordner landen nicht auf der Seite
      if (!(k === 'one' || k === 'toc' || k === 'companion' || k === 'onepkg' || this.wanted(it.path))) { plan._skipped++; continue; }
      const path = it.path.replace(/\\/g, '/').replace(/^\/+/, '');
      const top = path.split('/')[0] || 'Ordner';
      if (!tops.has(top)) tops.set(top, []);
      tops.get(top).push(this.fileEntry(it.file, path));
    }
    for (const [name, entries] of tops) {
      // Saves-Ordner des Windows-Programms (oder ein Notizbuch-Ordner daraus): direkt als KnowledgeTree-Daten lesen
      if (KtFile.isKtZip(entries) || KtFile.isKtFolder(entries)) { plan._ktBackups.push({ name, entries }); plan._sources.add('KnowledgeTree'); }
      else { await this.addEntrySet(plan, { name, entries }); plan._sources.add('Ordner'); }
    }
    // 2) einzelne Dateien
    const sections = [], comps = [], page = [];
    for (const it of loose) {
      const k = kinds.get(it), f = it.file;
      try {
        if (k === 'archive') {
          const entries = await this.openArchive(f);
          if (KtFile.isKtZip(entries) || KtFile.isKtFolder(entries)) {   // KT-Datei/Backup (1.24), Sicherungsordner als ZIP (1.25)
            const meta = await KtFile.peekMeta(f);
            // ein einzelner Abschnitt aus einer Sicherung (wie eine .one-Datei): Ziel fragen wie bei OneNote-Abschnitten
            if (meta && meta.art === 'abschnitt') plan.sections.push({ lazy: true, kt: true, name: meta.name || f.name.replace(/\.knowledgetree\.zip$|\.zip$/i, ''), file: f.name, blob: f });
            else plan._ktBackups.push({ name: f.name, blob: f });
            plan._sources.add('KnowledgeTree');
          }
          else { await this.addEntrySet(plan, { name: f.name.replace(/\.(zip|rar|7z|tar|tgz|tar\.gz)$/i, ''), entries }); plan._sources.add('Archiv'); }
        }
        else if (k === 'onepkg') { plan.notebooks.push({ lazy: true, kind: 'cab', name: f.name.replace(/\.onepkg$/i, ''), open: () => ON.openCab(f) }); plan._sources.add('OneNote'); }
        else if (k === 'one') sections.push(it);
        else if (k === 'toc') plan._skipped++;   // Inhaltsverzeichnis allein: nur Reihenfolge, nichts zu importieren
        else if (k === 'companion') comps.push(it);
        else if (k === 'ktbackup') { plan._ktBackups.push({ name: f.name, blob: f }); plan._sources.add('KnowledgeTree'); }
        else if (k === 'ktweb') (plan._ktWeb || (plan._ktWeb = [])).push(f.name);
        else page.push(f);
      } catch (e) { console.error(e); plan.errors.push(`${f.name}: ${e.message}`); }
    }
    if (sections.length) {
      plan._sources.add('OneNote');
      // mitgewählte Dateien dienen als Begleitdateien (<file>-Verweise) – gelesen nur, wenn ein Abschnitt sie braucht
      const compEntries = [...comps.map(it => this.fileEntry(it.file, it.path || it.file.name)), ...page.filter(f => f.size < 300e6).map(f => this.fileEntry(f, f.name))];
      for (const it of sections) plan.sections.push({ lazy: true, name: it.file.name.replace(/\.one$/i, ''), file: it.file.name, entry: this.fileEntry(it.file, it.file.name), comps: compEntries });
    }
    UI.toast('', 1);
    const nSec = plan.sections.length + plan.notebooks.length;
    // 3) Bilder, PDF, Office, CSV … auf die aktuelle Seite – nur wenn sonst nichts zu importieren ist
    //    (zusammen mit OneNote-Dateien gewählt, dienen sie als Begleitdateien für <file>-Verweise)
    const forPage = nSec || plan._ktBackups.length ? [] : page;
    // 1.60: Word/Excel/PowerPoint über „Importieren“ (oder in die Navigation gezogen) → eigene Office-Seite (Datei
    //       bleibt verlustfrei als Datei im Notizbuch); auf die Seite gezogen → 📎-Anhang wie bisher
    const office = !opts.pt && typeof OfficePages !== 'undefined' ? forPage.filter(f => OfficePages.isOffice(f.name)) : [];
    const rest = forPage.filter(f => !office.includes(f));
    if (rest.length) await Canvas.insertFiles(rest, opts.pt || null, opts.box || null);
    if (office.length) await OfficePages.importFiles(office);
    if (plan._ktWeb) UI.info('Webseite zum Ansehen', `<p><b>${plan._ktWeb.map(escapeHtml).join(', ')}</b> ist eine mit KnowledgeTree exportierte <b>Webseite zum Ansehen</b> (Export „Webseite (HTML)“). Sie enthält nur die Darstellung, nicht die KnowledgeTree-Daten, und lässt sich darum nicht wieder einlesen.</p><p>Zum Weitergeben <b>und</b> Wieder-Einlesen beim Exportieren <b>KnowledgeTree-Datei → Interaktiv (.html)</b> wählen: die Datei öffnet sich ebenfalls im Browser (sogar zum Bearbeiten) und lässt sich jederzeit hier importieren.</p>`);
    if (!nSec && !plan._ktBackups.length) {
      if (plan._ktWeb && !plan.errors.length && !forPage.length) return;
      if (plan.errors.length || !forPage.length) {
        UI.info('Importieren', `<p>Keine OneNote- oder KnowledgeTree-Inhalte gefunden (gesucht wird nach <b>.one</b>, <b>.onepkg</b>, <b>ZIP/RAR</b> und Ordnern mit solchen Dateien).</p>${plan._skipped ? `<p style="color:var(--ink-3)">${plan._skipped} andere Datei(en) übersprungen.</p>` : ''}${plan.errors.length ? '<ul>' + plan.errors.map(e => `<li>${escapeHtml(e)}</li>`).join('') + '</ul>' : ''}`);
      }
      return;
    }
    plan._title = (plan._sources.size === 1 ? { OneNote: 'OneNote-Import', Archiv: 'Archiv-Import', Ordner: 'Ordner-Import', KnowledgeTree: 'KnowledgeTree-Import' }[[...plan._sources][0]] : 'Import') + ' abgeschlossen';
    plan._archive = plan._sources.has('Archiv') || plan._sources.has('Ordner');
    // lose Abschnitte: Ziel fragen (neues Notizbuch oder vorhandenes); Notizbücher werden immer neu angelegt
    const target = plan.sections.length ? await this.askTarget(plan) : { container: '__neu' };
    if (!target) return;
    await this.apply(plan, target);
  },
  /* Datei als Eintrag – gelesen erst bei read() */
  fileEntry(file, path) { return { name: path, size: file.size, read: async () => new Uint8Array(await file.arrayBuffer()), blob: async () => file }; },
  entryBlob: async (e) => e.blob ? e.blob() : new Blob([await e.read()]),
  newPlan() { return { notebooks: [], sections: [], errors: [], report: new Map(), warnings: 0, missing: [], _ktBackups: [], _skipped: 0, _sources: new Set() }; },
  /* Dateien, die für den Import gebraucht werden (alles andere wird gar nicht erst gelesen) */
  wanted(path) {
    return /\.(one|onetoc2|onepkg|onebin|knowledgetree\.json|knowledgetree\.zip|knowledgetree\.html|json)$/i.test(path) || this.isCompanion(path) || /(^|\/)_Bilder\/[0-9a-f]{40}\.[a-z0-9]{1,8}$/i.test(path);
  },
  isRecycled(path) { return /(^|\/)OneNote_RecycleBin(\/|$)/i.test(path) || /OneNote_DeletedPages/i.test(path); },
  isCompanion(path) { return /_onefiles\//i.test(path) || /\.onebin$/i.test(path); },

  /* ---------------------------------------------------------- Archiv (ZIP/RAR) mit OneNote-/KnowledgeTree-Sicherung
   * Ein ZIP/RAR enthält meist die Ordnerstruktur einer OneNote-Sicherung (.one-Abschnitte, .onetoc2 für die
   * Reihenfolge) oder KnowledgeTree-Dateien (.knowledgetree.json). Daraus werden neue Notizbücher mit derselben
   * Ordnerstruktur erstellt. ZIP wird im Browser selbst entpackt; RAR/7z braucht eine Zusatz-Bibliothek. */
  /* Archiv öffnen (seit 1.18): ZIP direkt aus der Datei (nur das Inhaltsverzeichnis), RAR über den WASM-Entpacker
   * Eintrag für Eintrag. Ergebnis: Einträge { name, size, read() } – entpackt wird erst beim Umwandeln. */
  async openArchive(file) {
    const h = new Uint8Array(await file.slice(0, 8).arrayBuffer());
    // ZIP erkennt man an der Signatur „PK“ – das kann der Browser selbst (auch bei falscher Endung)
    if ((h[0] === 0x50 && h[1] === 0x4B) || /\.zip$/i.test(file.name)) {
      const list = await openZip(file);   // aus filepages.js
      return list.map(e => ({ name: e.name, size: e.size, read: () => e.read(), blob: () => e.blob() }));
    }
    // RAR (Signatur „Rar!“) – eigener WASM-Entpacker ohne Worker
    if ((h[0] === 0x52 && h[1] === 0x61 && h[2] === 0x72 && h[3] === 0x21) || /\.rar$/i.test(file.name)) return await this.openRar(file);
    // 7z/TAR: im Browser nicht direkt möglich
    throw new Error('Dieses Archivformat kann der Browser nicht entpacken. Bitte als ZIP (oder RAR) speichern und erneut importieren.');
  },
  /* RAR-Entpacker: node-unrar-js (das offizielle unrar 6.1.7 als WASM), fester Stand, bei Bedarf von jsDelivr.
   * Das Modul kommt per import(), die .wasm-Datei holen wir selbst per fetch() und geben die Bytes hinein. */
  UNRAR_V: '2.0.2',
  RAR_AHEAD: 192e6,   // so viel darf der Entpacker dem Import vorauslaufen (Rückstau in Bytes)
  RAR_INLINE_MAX: 400e6,   // grösser: kein Notweg im Hauptfenster (das ganze Archiv müsste in den Speicher)
  async loadUnrar() {
    if (this._unrar) return this._unrar;
    const V = this.UNRAR_V;
    let mod, url;
    for (const u of [`https://cdn.jsdelivr.net/npm/node-unrar-js@${V}/+esm`, `https://cdn.jsdelivr.net/npm/node-unrar-js@${V}/esm/index.js`]) {
      try { mod = await import(/* @vite-ignore */ u); if (mod) { url = u; break; } } catch (e) { console.warn('[KnowledgeTree] node-unrar-js Modul:', u, e); }
    }
    const create = mod && (mod.createExtractorFromData || (mod.default && mod.default.createExtractorFromData));
    if (!create) throw new Error('node-unrar-js nicht ladbar');
    const wasmBinary = await (await fetch(`https://cdn.jsdelivr.net/npm/node-unrar-js@${V}/dist/js/unrar.wasm`)).arrayBuffer();
    this._unrar = { create, wasmBinary, url, mod };
    return this._unrar;
  },
  /* RAR öffnen (seit 1.19). Bis 1.17 wurde das ganze Archiv in den Speicher kopiert (zweimal) und alles auf einmal
   * entpackt; 1.18 entpackte Datei für Datei, brach jeden Durchlauf aber nach dem Treffer ab – node-unrar-js
   * verlangt, dass jeder Durchlauf bis zum Ende läuft, sonst bleibt das C++-Objekt samt Wörterbuch-Fenster
   * (WinRAR: meist 32 MB) im WASM-Speicher, und das nächste Öffnen liest ab der alten Stelle („File read error“).
   * Jetzt: ein Worker liest die Datei stückweise (FileReaderSync), entpackt in EINEM Durchgang nur die gebrauchten
   * Dateien (OneNote, KnowledgeTree, Begleitdateien) und gibt jede als Blob zurück (grosse Blobs lagert der
   * Browser auf die Festplatte aus). Ohne Worker: im Hauptfenster, das Archiv einmal im Speicher, ebenfalls in
   * einem Durchgang und ohne die entpackten Daten festzuhalten. */
  async openRar(file) {
    let lib;
    try { lib = await this.loadUnrar(); }
    catch (e) {
      console.error('[KnowledgeTree] RAR-Entpacker konnte nicht geladen werden:', e);
      throw new Error('Der RAR-Entpacker aus dem Internet konnte nicht geladen werden (Details in der Browser-Konsole, F12). Tipp: das Archiv als ZIP speichern und das ZIP importieren.');
    }
    let job = null, why = this.RAR_NO_WORKER ? 'abgeschaltet' : '';
    if (!this.RAR_NO_WORKER) {
      try { job = await this.rarWorkerJob(file, lib); this._rarInfo = 'im Hintergrund (Worker)'; }
      catch (e) {
        if (e && e.rar) { console.error('[KnowledgeTree] RAR konnte nicht gelesen werden:', e); throw this.rarError(e); }   // Archiv kaputt, Passwort …
        console.warn('[KnowledgeTree] RAR im Hintergrund (Worker) nicht möglich – entpacke im Hauptfenster:', e);
        why = (e && e.message) || String(e);
      }
    }
    if (!job) {
      // Notweg im Hauptfenster: das ganze Archiv kommt in den Speicher – bei grossen Archiven lieber klar abbrechen
      // als den Browser abstürzen lassen
      if (file.size > this.RAR_INLINE_MAX) {
        throw new Error(`Das RAR-Archiv (${Math.round(file.size / 1e6)} MB) kann in diesem Browser nicht stückweise entpackt werden (Hintergrund-Entpacker: ${why || 'nicht verfügbar'}). Im Notweg müsste das ganze Archiv in den Arbeitsspeicher – dafür ist es zu gross. Tipp: als ZIP speichern und das ZIP importieren (ZIP wird immer stückweise gelesen), oder einen anderen Browser (Chrome, Edge, Firefox) verwenden.`);
      }
      this._rarInfo = 'im Hauptfenster (' + (why || 'ohne Worker') + ')';
      try { job = await this.rarInlineJob(file, lib); }
      catch (e) { console.error('[KnowledgeTree] RAR konnte nicht gelesen werden:', e); throw this.rarError(e); }
    }
    (this._jobs || (this._jobs = new Set())).add(job);
    // OneNote-Papierkorb wird ohnehin nicht übernommen → gar nicht erst entpacken
    const inPass = (n) => this.wanted(n) && !/(^|\/)(__MACOSX\/|\._)/i.test(n) && !/(^|\/)OneNote_RecycleBin(\/|$)|OneNote_DeletedPages/i.test(n);
    job.passNames = job.heads.filter(h => !h.dir && inPass(h.name)).map(h => h.name);
    job.passSet = new Set(job.passNames);
    return job.heads.filter(h => !h.dir).map(h => ({
      name: String(h.name || '').replace(/\\/g, '/'), size: h.size || 0,
      blob: () => job.get(h.name),
      read: async () => {
        const b = await job.get(h.name);
        if (/\.one$/i.test(h.name)) job.forget(h.name);   // ein Abschnitt wird genau einmal gelesen
        return new Uint8Array(await b.arrayBuffer());
      },
    }));
  },
  rarError(e) {
    const r = e && e.reason;
    const why = r === 'ERAR_MISSING_PASSWORD' || r === 'ERAR_BAD_PASSWORD' ? 'Sie ist passwortgeschützt – bitte ohne Passwort (oder als ZIP) speichern.'
      : r === 'ERAR_BAD_ARCHIVE' || r === 'ERAR_UNKNOWN_FORMAT' ? 'Es ist kein gültiges RAR-Archiv.'
      : r === 'ERAR_BAD_DATA' ? 'Das Archiv ist beschädigt.'
      : r === 'ERAR_NO_MEMORY' ? 'Der Entpacker hatte zu wenig Speicher.'
      : r === 'ERAR_TOO_BIG' ? 'Das Archiv ist zu gross, um es ohne Hintergrund-Entpacker im Browser-Speicher zu öffnen.'
      : 'Ist sie evtl. passwortgeschützt?';
    return new Error(`Die RAR-Datei konnte nicht gelesen werden (${(e && e.message) || e}). ${why} Tipp: als ZIP speichern und das ZIP importieren.`);
  },
  /* gemeinsamer Ablauf: Einträge warten auf ihren Blob; der erste Zugriff startet den Durchgang über alle
   * gebrauchten Dateien, Nachzügler (nicht im Durchgang) werden danach eigens geholt. */
  rarJob(heads, runPass, close, hooks = {}) {
    // need(name): jemand wartet auf eine noch nicht entpackte Datei → Entpacker darf nicht pausieren
    // ack(bytes): entpackte Daten wurden abgeholt → Rückstau kleiner (Entpacker läuft dem Import höchstens ~200 MB voraus)
    const job = { heads, results: new Map(), waiters: new Map(), extra: new Set(), seen: new Set(), busy: null, mainDone: false, closed: false, passNames: [], passSet: new Set() };
    const deliver = (w, r) => { if (r.err) w.rej(r.err); else { w.res(r.blob); if (hooks.ack) hooks.ack(r.blob.size || 0); } };
    const settle = (name, r) => {
      job.results.set(name, r); job.seen.add(name);
      const ws = job.waiters.get(name);
      if (ws) { job.waiters.delete(name); for (const w of ws) deliver(w, r); }
    };
    const pass = async (names) => {
      const open = new Set(names);
      const onFile = (n, blob) => { open.delete(n); settle(n, { blob }); };
      const onFail = (n, err) => { open.delete(n); settle(n, { err: OneImport.rarFileError(err) }); };
      const onProgress = (frac) => { if (job.waiters.size) OneImport.unpackNote(frac); };
      try { if (names.length) await runPass(names, onFile, onFail, onProgress); }
      catch (e) { for (const n of open) settle(n, { err: e }); open.clear(); }
      for (const n of open) settle(n, { err: new Error('nicht im Archiv gefunden') });
    };
    const kick = () => {
      if (job.busy || job.closed) return;
      job.busy = (async () => {
        if (!job.mainDone) { job.mainDone = true; await pass(job.passNames); }
        while (job.extra.size && !job.closed) { const names = [...job.extra]; job.extra.clear(); await pass(names); }
        job.busy = null;
        if (job.extra.size && !job.closed) kick();
      })();
    };
    job.get = (name) => new Promise((res, rej) => {
      const r = job.results.get(name);
      if (r) return deliver({ res, rej }, r);
      if (job.closed) return rej(new Error('Archiv bereits geschlossen'));
      if (!job.waiters.has(name)) job.waiters.set(name, []);
      job.waiters.get(name).push({ res, rej });
      if (!job.passSet.has(name) || job.seen.has(name)) job.extra.add(name);   // nicht im Durchgang (z.B. Foto) oder schon freigegeben → eigens holen
      else if (hooks.need) hooks.need(name);   // (auch vor dem Start: die Nachricht wartet im Worker)
      kick();
    });
    job.forget = (name) => { job.results.delete(name); };   // Abschnitt gelesen → Blob freigeben
    job.close = () => {
      if (job.closed) return;
      job.closed = true;
      for (const [, ws] of job.waiters) for (const w of ws) w.rej(new Error('Import beendet'));
      job.waiters.clear(); job.results.clear();
      try { close && close(); } catch (e) { /* */ }
    };
    return job;
  },
  /* Fehler einer einzelnen Datei im Archiv auf Deutsch (node-unrar-js meldet englisch) */
  rarFileError(err) {
    const r = err && err.reason, m = (err && err.message) || String(err);
    const t = { ERAR_BAD_DATA: 'im Archiv beschädigt (Prüfsumme stimmt nicht)', ERAR_MISSING_PASSWORD: 'passwortgeschützt', ERAR_BAD_PASSWORD: 'passwortgeschützt',
      ERAR_NO_MEMORY: 'zu wenig Speicher zum Entpacken', ERAR_EREAD: 'Archivdatei nicht lesbar', ERAR_UNKNOWN_FORMAT: 'unbekanntes Packverfahren',
      ERAR_ECREATE: 'konnte nicht entpackt werden', ERAR_EWRITE: 'konnte nicht entpackt werden' }[r];
    const e = new Error(t ? `${t} (${m})` : m);
    e.reason = r;
    return e;
  },
  closeArchives() {
    if (!this._jobs) return;
    for (const j of this._jobs) j.close();
    this._jobs.clear();
  },
  unpackNote(frac) {
    const t = `RAR wird entpackt … ${Math.round(Math.min(1, frac) * 100)} %`;
    if (this._ui) this._ui.set(null, t, null); else UI.toast(t, 5000);
  },
  /* Worker: eigener Extractor auf node-unrar-js, liest die Datei stückweise (kein ganzes Archiv im Speicher) */
  async rarWorkerJob(file, lib) {
    const Base = lib.mod && (lib.mod.Extractor || (lib.mod.default && lib.mod.default.Extractor));
    if (typeof Worker === 'undefined' || !lib.url || !Base) throw new Error('kein Worker bzw. Extractor');
    const wurl = URL.createObjectURL(new Blob([`(${rarWorkerMain.toString()})();`], { type: 'text/javascript' }));
    let w;
    try { w = new Worker(wurl, { type: 'module', name: 'KnowledgeTree RAR' }); }
    finally { setTimeout(() => URL.revokeObjectURL(wurl), 60000); }
    let cur = null;   // laufende Anfrage { want, res, rej, timer, onFile, onFail, onProgress }
    const fail = (e) => { if (cur) { const c = cur; cur = null; clearTimeout(c.timer); c.rej(e); } };
    w.onerror = (ev) => { if (ev.preventDefault) ev.preventDefault(); fail(new Error('Worker-Fehler: ' + (ev.message || 'unbekannt'))); };
    w.onmessageerror = () => fail(new Error('Worker-Nachricht unlesbar'));
    w.onmessage = (ev) => {
      const m = ev.data || {}, c = cur;
      if (!c) return;
      if (m.type === 'file') { if (c.onFile) c.onFile(m.name, m.blob); return; }
      if (m.type === 'fail') { const e = new Error(m.message || 'nicht entpackbar'); e.reason = m.reason; if (c.onFail) c.onFail(m.name, e); return; }
      if (m.type === 'progress') { if (c.onProgress) c.onProgress(m.frac); return; }
      if (m.type === 'error') { const e = new Error(m.message || 'Fehler im Worker'); e.reason = m.reason; e.rar = !!m.reason; fail(e); return; }
      if (m.type === c.want) { cur = null; clearTimeout(c.timer); c.res(m); }
    };
    const ask = (msg, want, ms, hooks = {}) => new Promise((res, rej) => {
      cur = { want, res, rej, ...hooks, timer: ms ? setTimeout(() => fail(new Error('Zeitüberschreitung im Worker (' + want + ')')), ms) : 0 };
      w.postMessage(msg);
    });
    let list;
    try {
      await ask({ cmd: 'init', url: lib.url, wasm: lib.wasmBinary.slice(0) }, 'ready', 30000);
      list = await ask({ cmd: 'list', file }, 'list', 0);
    } catch (e) { w.terminate(); throw e; }
    return this.rarJob(list.heads, (names, onFile, onFail, onProgress) => ask({ cmd: 'extract', file, names }, 'done', 0, { onFile, onFail, onProgress }), () => w.terminate(),
      { need: (name) => w.postMessage({ cmd: 'go', name }), ack: (bytes) => w.postMessage({ cmd: 'ack', bytes }) });
  },
  /* ohne Worker: Archiv einmal im Speicher (ohne Kopie), EIN Durchgang, entpackte Daten sofort als Blob abgegeben */
  async rarInlineJob(file, lib) {
    let data;
    try { data = await file.arrayBuffer(); }
    catch (e) { const err = new Error((e && e.message) || String(e)); err.reason = 'ERAR_TOO_BIG'; throw err; }
    let ex = await lib.create({ wasmBinary: lib.wasmBinary, data });
    data = null;
    const heads = [...ex.getFileList().fileHeaders].map(h => ({ name: h.name, size: h.unpSize, dir: !!(h.flags && h.flags.directory) }));   // ganz durchlaufen
    const flow = { pending: 0, need: new Set(), go: null };
    const resume = () => { if (flow.go) { const g = flow.go; flow.go = null; g(); } };
    const run = async (names, onFile, onFail, onProgress) => {
      // node-unrar-js hat EIN Modul für alle Archive: Durchgänge nacheinander, nie verschränkt
      const prev = OneImport._rarLock || Promise.resolve();
      let unlock;
      OneImport._rarLock = new Promise(r => { unlock = r; });
      await prev;
      try {
        if (!ex) throw new Error('Archiv bereits geschlossen');
        if (ex.unrar) ex.unrar.extractor = ex;
        const want = new Set(names);
        let done = 0;
        for (let round = 0; want.size && round < 1000; round++) {
          let failed = null;
          try {
            // bis zum Ende durchlaufen lassen – sonst bleibt das C++-Objekt im WASM-Speicher
            for (const f of ex.extract({ files: (h) => !(h.flags && h.flags.directory) && want.has(h.name) }).files) {
              const n = f.fileHeader.name;
              want.delete(n);
              const blob = new Blob([f.extraction || new Uint8Array(0)]);
              f.extraction = null;
              if (ex.dataFiles) delete ex.dataFiles['*Extracted*/' + n];   // node-unrar-js hielte sonst jede Datei fest
              flow.pending += blob.size; flow.need.delete(n);
              onFile(n, blob);
              onProgress(++done / names.length);
              await new Promise(r => setTimeout(r, 0));
              if (flow.pending > OneImport.RAR_AHEAD && !flow.need.size) await new Promise(r => { flow.go = r; });
            }
          } catch (e) { failed = e; }
          if (!failed) break;
          if (failed.file && want.has(failed.file)) { want.delete(failed.file); flow.need.delete(failed.file); onFail(failed.file, failed); continue; }
          for (const n of want) onFail(n, failed);
          want.clear();
        }
      } finally { unlock(); }
    };
    return this.rarJob(heads, run, () => { ex = null; resume(); }, {
      need: (name) => { flow.need.add(name); resume(); },
      ack: (bytes) => { flow.pending = Math.max(0, flow.pending - bytes); if (flow.pending <= OneImport.RAR_AHEAD) resume(); },
    });
  },

  // ältere Einstiege (Tests, frühere Aufrufer) – alle über auto()
  fromArchives(files) { return this.auto(files); },
  fromFolder(list) { return this.auto(list); },
  fromFiles(files) { return this.auto(files); },
  /* Archiv bzw. Ordner { name, entries: [{ name: Pfad, size, read() } oder { name, data }] } in den Plan aufnehmen.
   * Gelesen werden hier nur KnowledgeTree-Dateien (klein); OneNote-Abschnitte erst beim Umwandeln. */
  async addEntrySet(plan, set) {
    const ent = (e) => e.read ? e : { name: e.name, size: e.data.length, read: async () => e.data };
    // junk aussortieren (macOS-Beiwerk, Papierkorb)
    const entries = set.entries.map(ent).filter(e => !/(^|\/)(__MACOSX\/|\.DS_Store$|Thumbs\.db$|\._)/i.test(e.name));
    const nbEntries = [];
    for (const e of entries) {
      const nm = e.name;
      if (/\.onepkg$/i.test(nm)) plan.notebooks.push({ lazy: true, kind: 'cab', name: nm.split('/').pop().replace(/\.onepkg$/i, ''), open: async () => ON.openCab(e.blob ? await e.blob() : await e.read()) });
      else if (/\.(one|onetoc2)$/i.test(nm) || this.isCompanion(nm)) nbEntries.push(e);   // samt Begleitordnern
      else if (/\.(knowledgetree\.json|json)$/i.test(nm)) {
        // KnowledgeTree-Datei im Archiv: nur den Anfang prüfen, gelesen wird sie beim Importieren (als Strom, mit Bildern)
        try { const b = await this.entryBlob(e); const t = await b.slice(0, 4000).text(); if (/"typ"\s*:\s*"KnowledgeTree-Backup"/.test(t)) plan._ktBackups.push({ name: nm.split('/').pop(), blob: b }); else plan._skipped++; }
        catch (err) { plan._skipped++; }
      } else plan._skipped++;
    }
    if (nbEntries.some(e => /\.one$/i.test(e.name))) plan.notebooks.push(this.entriesNotebook(nbEntries, set.name));
  },
  /* Notizbuch aus Einträgen: gemeinsamen obersten Ordner abziehen (Paket/Sicherung hat oft den Notizbuchnamen oben) */
  entriesNotebook(entries, name) {
    const main = entries.filter(e => /\.(one|onetoc2)$/i.test(e.name));
    const tops = new Set(main.map(e => e.name.includes('/') ? e.name.split('/')[0] : ''));
    const strip = tops.size === 1 && !tops.has('') ? [...tops][0] + '/' : '';
    return { lazy: true, kind: 'entries', name: strip ? strip.slice(0, -1) || name : name, entries: entries.map(e => ({ ...e, path: e.name.startsWith(strip) ? e.name.slice(strip.length) : e.name })) };
  },

  /* KnowledgeTree-Datei lesen (ktfile.js): ZIP, JSON bis 1.23 oder Ordner-Einträge; Bilder werden gespeichert
     (vorhandene übersprungen). prog: { set(text, anteil) } */
  async readKt(b, prog) {
    const data = await KtFile.read(b.entries ? { name: b.name, entries: b.entries } : b.blob);
    await KtFile.storeAssets(data, prog);
    return data;
  },
  /* einzelner KnowledgeTree-Abschnitt (Datei aus einer Sicherung, seit 1.25) → in das gewählte Notizbuch */
  async importKtSection(sec, parent, ctx) {
    const { ui, stats, plan } = ctx;
    ui.set(`KnowledgeTree-Abschnitt „${sec.name}“ …`, '');
    let data;
    try { data = await this.readKt({ name: sec.file, blob: sec.blob }, { set: (t, f) => ui.set(null, t, f) }); }
    catch (e) { plan.errors.push(`${sec.file}: ${e.message}`); return; }
    const { pages, groups } = Tree.fromBackup(data);
    for (const p of Object.values(pages)) { Store.pages[p.id] = p; Save.dirty.add(p.id); stats.pages++; if (!ctx.first) ctx.first = p.id; }
    for (const g of groups) { if (g.kind === 'quick') g.kind = 'section'; if (!g.color) g.color = Ops.nextColor(); parent.groups.push(g); stats.sections++; }
    Store.groups = Tree.norm(Store.groups);
    ui.secDone++;
  },
  /* KnowledgeTree-Backup (aus dem Archiv) als neues Notizbuch einlesen – gleiche Logik wie „Backup laden → hinzufügen“ */
  applyKtBackup(data, stats) {
    const { pages, groups } = Tree.fromBackup(data);
    for (const p of Object.values(pages)) { Store.pages[p.id] = p; Save.dirty.add(p.id); stats.pages++; if (!stats._first) stats._first = p.id; }
    Store.groups.push(...groups);
    stats.notebooks += groups.filter(g => g.kind === 'notebook').length || 1;
  },

  /* ---------------------------------------------------------- Lesen */
  readSection(u8, name, plan, external) {
    const store = new ON.OneStore(u8, name);
    if (store.type !== 'one') return null;
    if (external) store.external = external;
    const model = new ON.Model(store);
    const sec = model.section(name);
    for (const m of sec.missing || []) (plan.missing || (plan.missing = [])).push({ ...m, section: sec.name || name });
    for (const [k, v] of model.report) plan.report.set(k, (plan.report.get(k) || 0) + v);
    plan.warnings += store.warnings.length;
    if (store.warnings.length) console.warn('OneNote', name, store.warnings);
    return { name: sec.name || name, pages: sec.pages, orphans: sec.orphans || [], color: null };
  },
  toc(u8) { return ON.readToc(new ON.OneStore(u8, 'toc')); },
  /* <file>-Verweise auflösen. OneNote legt grosse Bilder/Dateien teils in einen Begleitordner neben die .one-Datei:
   * „Abschnitt.one“ → „Abschnitt_onefiles/<Name>“ ([MS-ONESTORE] „onefiles folder“). Gesucht wird zuerst genau dort,
   * dann in jedem „…_onefiles“-Ordner, dann irgendwo nach dem Dateinamen (mit/ohne Endung, .onebin, ohne Klammern). */
  companions(list) {
    const byPath = new Map(), byBase = new Map();
    for (const e of list) {
      const p = e.name.replace(/\\/g, '/').toLowerCase();
      byPath.set(p, e.data);
      const b = p.split('/').pop();
      if (!byBase.has(b)) byBase.set(b, []);
      byBase.get(b).push({ p, data: e.data });
    }
    return (sectionPath) => (name, ext) => {
      const sp = String(sectionPath || '').replace(/\\/g, '/').toLowerCase();
      const dir = sp.includes('/') ? sp.slice(0, sp.lastIndexOf('/') + 1) : '';
      const sec = sp.split('/').pop().replace(/\.one$/i, '');
      const n = String(name || '').replace(/\\/g, '/').split('/').pop().toLowerCase(), x = String(ext || '').toLowerCase();
      const bare = n.replace(/[{}]/g, '');
      const cands = [...new Set([n, n + x, n + '.onebin', bare, bare + x, bare + '.onebin', n.replace(/\.[^.]*$/, '') + '.onebin'])];
      for (const c of cands) { const d = byPath.get(dir + sec + '_onefiles/' + c); if (d) return d; }
      for (const c of cands) { const hit = (byBase.get(c) || []).find(h => /_onefiles\//.test(h.p)); if (hit) return hit.data; }
      for (const c of cands) { const hit = byBase.get(c); if (hit && hit.length) return hit[0].data; }
      return null;
    };
  },
  countSections(g) { return g.children.reduce((a, c) => a + (c.kind === 'section' ? 1 : this.countSections(c)), 0); },
  countPages(g) { return g.children.reduce((a, c) => a + (c.kind === 'section' ? c.pages.length : this.countPages(c)), 0); },

  /* ---------------------------------------------------------- Ziel wählen */
  askTarget(plan) {
    const nb = plan.notebooks.length, ns = plan.sections.length;
    // Seitenzahl nur, wenn schon gelesen (seit 1.18 wird erst beim Importieren gelesen – Abschnitt für Abschnitt)
    const known = plan.sections.every(s => s.pages) && plan.notebooks.every(n => n.tree);
    const pages = known ? plan.sections.reduce((a, s) => a + s.pages.length, 0) + plan.notebooks.reduce((a, n) => a + this.countPages(n.tree), 0) : null;
    return UI.dialog((d, close) => {
      d.append(el('h2', { text: 'Importieren' }));
      const parts = [];
      if (nb) parts.push(`${nb} Notizbuch${nb === 1 ? '' : 'bücher'} (${plan.notebooks.map(n => '„' + n.name + '“').join(', ')})`);
      if (ns) parts.push(`${ns} Abschnitt${ns === 1 ? '' : 'e'}`);
      d.append(el('p', { text: `Gefunden: ${parts.join(' und ')}${pages != null ? ` mit insgesamt ${pages} Seite${pages === 1 ? '' : 'n'}` : ''}.` }));
      let sel = null;
      if (ns) {
        d.append(el('p', { text: nb ? 'Die einzelnen Abschnitte kommen nach:' : 'Wohin sollen die Abschnitte?' }));
        sel = el('select', { style: { width: '100%', height: '32px', borderRadius: '5px', border: '1px solid var(--line-2)', background: 'var(--chrome-2)', padding: '0 8px' } });
        sel.append(el('option', { value: '__neu', text: `Neues Notizbuch „${plan.sections.every(x => x.kt) ? 'KnowledgeTree-Import' : 'OneNote-Import'}“` }));
        const cur = Ops.currentContainer();
        const walk = (list, depth) => {
          for (const g of list) {
            if (g.closed || !Tree.isContainer(g)) continue;
            sel.append(el('option', { value: g.id, text: '  '.repeat(depth) + (g.kind === 'notebook' ? '📓 ' : '📁 ') + g.name }));
            walk(g.groups, depth + 1);
          }
        };
        walk(Store.groups, 0);
        if (cur) sel.value = cur.id;
        d.append(sel);
      }
      if (nb) d.append(el('p', { style: { marginTop: '10px' }, text: 'Jedes Notizbuch wird als neues Notizbuch mit allen Abschnittsgruppen, Abschnitten und Unterseiten angelegt.' }));
      if (plan.errors.length) d.append(el('p', { style: { color: 'var(--danger)' }, text: 'Nicht lesbar: ' + plan.errors.join(' · ') }));
      d.append(el('div', { class: 'dlg-btns' },
        el('button', { class: 'btn', text: 'Abbrechen', onclick: () => close(null) }),
        el('button', { class: 'btn primary', text: 'Importieren', onclick: () => close({ container: sel ? sel.value : null }) })));
    }, { wide: true });
  },

  /* ---------------------------------------------------------- Übernehmen
   * Seit 1.18 stückweise: Notizbuch für Notizbuch, Abschnitt für Abschnitt, Seite für Seite. Jede Datei wird erst
   * hier gelesen, jede Seite sofort umgewandelt und gespeichert (Bilder in den Bildspeicher), danach wird alles
   * wieder freigegeben. So liegt nie mehr als ein Abschnitt im Speicher. Fortschritt mit „Abbrechen“. */
  async apply(plan, target) {
    Canvas.stopEditing();
    Hist.flushPending();
    const stats = { notebooks: 0, sections: 0, pages: 0, images: 0, files: 0 };
    const ui = this.progressUI(plan);
    this._ui = ui;
    const ctx = { plan, stats, rep: plan.report, ui, first: null, meta: new Map(), savedAt: 0, last: performance.now() };
    // Was es vorher gab: alles andere hat dieser Import angelegt (zum restlosen Zurücknehmen, auch nach Absturz)
    const before = this.groupIds();
    ImportJournal.start((plan._files || []).slice(0, 12), before);
    if (Backend.trackStart) Backend.trackStart();
    this.busy = true;
    let failed = null;
    try {
      for (const nb of plan.notebooks) {
        if (ui.cancelled) break;
        if (nb.lazy) await this.importNotebook(nb, ctx);
        else await this.importTree(nb, ctx);   // schon gelesen (ältere Aufrufer, Tests)
      }
      if (plan.sections.length && !ui.cancelled) {
        let parent = target.container && target.container !== '__neu' ? Tree.group(target.container) : null;
        if (!Tree.isContainer(parent)) {
          parent = { id: uid('g'), name: plan.sections.every(x => x.kt) ? 'KnowledgeTree-Import' : 'OneNote-Import', color: Ops.nextColor(), kind: 'notebook', groups: [], pages: [] };
          Store.groups.push(parent);
          stats.notebooks++;
        }
        for (const sec of plan.sections) {
          if (ui.cancelled) break;
          if (!sec.lazy) { await this.importParsed(sec, parent, ctx); continue; }
          if (sec.kt) { await this.importKtSection(sec, parent, ctx); continue; }
          let data;
          try { data = await sec.entry.read(); } catch (e) { plan.errors.push(`${sec.file}: ${e.message}`); continue; }
          await this.importSection(data, sec.name, parent, ctx, { file: sec.file, comps: sec.comps, path: sec.file });
          data = null;
        }
      }
      // KnowledgeTree-Sicherungen aus einem Archiv (als neue Notizbücher)
      if (plan._ktBackups && plan._ktBackups.length && !ui.cancelled) {
        stats._first = ctx.first;
        for (const b of plan._ktBackups) {
          try {
            ui.set(`KnowledgeTree-Datei „${b.name}“ …`, '');
            this.applyKtBackup(b.data || await this.readKt(b, { set: (t, f) => ui.set(null, t, f) }), stats);
          } catch (e) { plan.errors.push(`${b.name}: ${e.message}`); }
        }
        ctx.first = stats._first;
        Store.groups = Tree.norm(Store.groups);
        for (const sx of Tree.sections()) Tree.normLevels(sx);
      }
    } catch (e) {
      console.error(e);
      failed = e;
      plan.errors.push('Import unterbrochen: ' + e.message);
    } finally {
      ui.close();
      this._ui = null;
    }
    // Fehlgeschlagen (Ausnahme) oder Speicher voll: halb Importiertes restlos wieder entfernen
    const tracked = Backend.trackStop ? Backend.trackStop() : null;
    if (failed || ctx.quota) {
      plan._rolledBack = this.removeCreated(before);
      ctx.first = null;
    }
    Hist.touchTree();
    Hist.commit(plan._archive ? 'Archiv importiert' : plan._sources && plan._sources.has('KnowledgeTree') ? 'KnowledgeTree-Datei importiert' : 'OneNote importiert');
    await Save.flushAll();
    ImportJournal.done();
    this.busy = false;
    if (plan._rolledBack && Backend.cleanup) {
      // die dabei neu gespeicherten Bilder/Dateien gleich mit (nur die, auf die nichts mehr verweist)
      try { const r = await Backend.cleanup({ refs: refsInMemory(), pageIds: new Set(Object.keys(Store.pages)), grace: 0, only: tracked || new Set() }); plan._rolledBack.bilder = r.bilder; plan._rolledBack.bytes = r.bytes; } catch (e) { console.warn(e); }
      if (!Store.pages[Canvas.pageId]) App.openFirstPage();
    }
    if (ctx.first) App.openPage(ctx.first);
    Sidebar.render();
    plan._cancelled = ui.cancelled && !ctx.quota;
    if (ctx.quota) {
      const si = Backend.storageInfo ? await Backend.storageInfo() : null;
      plan._quota = si && si.quota ? `${Math.round(si.usage / 1e6)} von ${Math.round(si.quota / 1e6)} MB belegt` : '';
    }
    this.showReport(stats, plan);
  },
  /* alle Gruppen-IDs (Notizbücher, Abschnittsgruppen, Abschnitte) */
  groupIds() { const out = new Set(); const walk = (gs) => { for (const g of gs || []) { out.add(g.id); walk(g.groups); } }; walk(Store.groups); return out; },
  /* alles, was nicht in „before“ war (vom Import angelegt), samt Seiten aus dem Baum und dem Speicher nehmen */
  removeCreated(before) {
    const keep = before instanceof Set ? before : new Set(before);
    const res = { pages: 0, groups: 0, names: [] };
    const strip = (list) => (list || []).filter(g => {
      if (keep.has(g.id)) { g.groups = strip(g.groups); return true; }
      res.groups++;
      if (res.names.length < 8) res.names.push(g.name);
      for (const pid of Tree.pagesDeep(g)) if (Store.pages[pid]) { delete Store.pages[pid]; res.pages++; }
      return false;
    });
    Store.groups = strip(Store.groups);
    Save.treeDirty = true;
    return res;
  },
  isQuota(e) { return !!e && (e.name === 'QuotaExceededError' || /quota|QuotaExceeded|Speicherplatz/i.test(String(e.message || e))); },
  /* kurz Luft holen: Oberfläche zeichnen, Speicher aufräumen lassen (höchstens alle 40 ms) */
  async breathe(ctx) {
    if (performance.now() - ctx.last < 40) return;
    await new Promise(r => setTimeout(r, 0));
    ctx.last = performance.now();
  },
  /* Fortschritt: Notizbuch · Abschnitt · Seite, Balken, Abbrechen (bricht nach der aktuellen Seite ab) */
  progressUI(plan) {
    const back = el('div', { class: 'dlg-back ex-busy' });
    const txt = el('div', { class: 'ex-busy-text', text: 'Wird vorbereitet …' });
    const sub = el('div', { class: 'ex-busy-text', style: { color: 'var(--ink-3)', fontSize: '12px' } });
    const bar = el('div', { class: 'ex-bar' }, el('i'));
    const ui = { cancelled: false, secDone: 0, secTotal: 0 };
    const stop = el('button', { class: 'btn', text: 'Abbrechen', onclick: () => { ui.cancelled = true; stop.disabled = true; sub.textContent = 'Wird nach der aktuellen Seite beendet – das bisher Importierte bleibt.'; } });
    back.append(el('div', { class: 'dlg' }, el('h2', { text: 'Importieren …' }), txt, sub, bar, el('div', { class: 'dlg-btns' }, stop)));
    document.body.append(back);
    for (const nb of plan.notebooks) ui.secTotal += nb.kind === 'entries' ? nb.entries.filter(e => /\.one$/i.test(e.path)).length : nb.tree ? this.countSections(nb.tree) : 1;
    ui.secTotal += plan.sections.length;
    ui.set = (head, line, frac) => {
      if (head != null) txt.textContent = head;
      if (line != null && !ui.cancelled) sub.textContent = line;
      if (frac != null) bar.firstChild.style.width = Math.round(Math.min(1, frac) * 100) + '%';
    };
    ui.page = (secName, i, n) => ui.set(`Abschnitt ${Math.min(ui.secDone + 1, ui.secTotal || 1)} von ${ui.secTotal || 1}: ${secName}`, `Seite ${i} von ${n}`, (ui.secDone + (n ? i / n : 1)) / (ui.secTotal || 1));
    ui.close = () => back.remove();
    return ui;
  },
  /* Notizbuch aus einer Quelle: Einträge (Ordner, ZIP, RAR) oder CAB-Strom (.onepkg) */
  async importNotebook(nb, ctx) {
    const { plan, stats, rep, ui } = ctx;
    const node = { id: uid('g'), name: nb.name, color: Ops.nextColor(), kind: 'notebook', groups: [], pages: [] };
    Store.groups.push(node);
    stats.notebooks++;
    const groups = new Map([['', node]]), tocs = new Map();
    const groupFor = (dir) => {
      if (groups.has(dir)) return groups.get(dir);
      const i = dir.lastIndexOf('/');
      const parent = groupFor(i < 0 ? '' : dir.slice(0, i));
      const g = { id: uid('g'), name: dir.slice(i + 1), color: '', kind: 'group', groups: [], pages: [] };
      parent.groups.push(g);
      groups.set(dir, g);
      ctx.meta.set(g, { name: g.name });
      return g;
    };
    const handle = async (path, data, comps) => {
      if (/(^|\/)OneNote_RecycleBin(\/|$)/i.test(path) || /OneNote_DeletedPages/i.test(path)) { rep.set('Papierkorb von OneNote (nicht übernommen)', 1); return; }
      const i = path.lastIndexOf('/');
      const dir = i < 0 ? '' : path.slice(0, i), base = path.slice(i + 1);
      if (/\.onetoc2$/i.test(base)) {
        try { const toc = this.toc(data); tocs.set(dir, toc.entries); if (!dir && toc.color) node.color = toc.color; } catch (err) { /* nur Reihenfolge */ }
        return;
      }
      if (/\.one$/i.test(base)) await this.importSection(data, base.replace(/\.one$/i, ''), groupFor(dir), ctx, { file: base, comps, path });
    };
    if (nb.kind === 'cab') {
      ui.set(`Notizbuch „${nb.name}“ wird geöffnet …`, '');
      const cab = await nb.open();
      const names = cab.files.map(f => f.name).filter(n => /\.(one|onetoc2)$/i.test(n));
      const tops = new Set(names.map(n => n.includes('/') ? n.split('/')[0] : ''));
      const strip = tops.size === 1 && !tops.has('') ? [...tops][0] + '/' : '';
      if (strip) node.name = strip.slice(0, -1) || node.name;
      ui.secTotal += names.filter(n => /\.one$/i.test(n)).length - 1;
      const comps = [];
      for await (const f of cab.iterate()) {
        if (ui.cancelled) break;
        const path = f.name.startsWith(strip) ? f.name.slice(strip.length) : f.name;
        if (this.isCompanion(path) && !/\.(one|onetoc2)$/i.test(path)) { const d = f.data; comps.push({ name: path, size: d.length, read: async () => d }); continue; }
        if (/\.(one|onetoc2)$/i.test(path)) await handle(path, f.data, comps);
      }
    } else {
      const main = nb.entries.filter(e => /\.(one|onetoc2)$/i.test(e.path));
      const comps = nb.entries.filter(e => this.isCompanion(e.path) && !/\.(one|onetoc2)$/i.test(e.path)).map(e => ({ ...e, name: e.path }));
      // Inhaltsverzeichnisse zuerst (klein), dann die Abschnitte – jeder erst jetzt gelesen und gleich wieder freigegeben
      for (const e of main.filter(e => /\.onetoc2$/i.test(e.path))) { try { await handle(e.path, await e.read()); } catch (err) { /* nur Reihenfolge */ } }
      for (const e of main.filter(e => /\.one$/i.test(e.path))) {
        if (ui.cancelled) break;
        if (this.isRecycled(e.path)) { rep.set('Papierkorb von OneNote (nicht übernommen)', 1); ui.secDone++; continue; }   // gar nicht erst lesen
        let data;
        try { data = await e.read(); } catch (err) { plan.errors.push(`${e.path}: ${err.message}`); ui.secDone++; continue; }
        await handle(e.path, data, comps);
        data = null;
      }
    }
    this.sortTree(node, '', tocs, ctx.meta);
    if (!node.groups.length) { Store.groups.splice(Store.groups.indexOf(node), 1); stats.notebooks--; }
  },
  /* Reihenfolge wie in OneNote (aus dem Inhaltsverzeichnis), sonst alphabetisch; leere Gruppen weg */
  sortTree(g, dir, tocs, meta) {
    const ord = tocs.get(dir) || [];
    const find = (c) => { const m = meta.get(c) || {}; const nm = (m.file || '').toLowerCase(); return ord.findIndex(o => { const n = o.name.toLowerCase(); return (nm && n === nm) || n === c.name.toLowerCase() || n === c.name.toLowerCase() + '.one'; }); };
    const key = new Map();
    for (const c of g.groups) { const i = find(c); key.set(c, i < 0 ? 1e6 : i); if (i >= 0 && ord[i].color) c.color = ord[i].color; }
    g.groups.sort((a, b) => key.get(a) - key.get(b) || a.name.localeCompare(b.name, 'de'));
    for (const c of [...g.groups]) if (c.kind === 'group') { this.sortTree(c, (dir ? dir + '/' : '') + ((meta.get(c) || {}).name || c.name), tocs, meta); if (!c.groups.length) g.groups.splice(g.groups.indexOf(c), 1); }
  },
  /* einen Abschnitt lesen und Seite für Seite umwandeln */
  async importSection(data, name, parent, ctx, src = {}) {
    const { plan, stats, rep, ui } = ctx;
    let st;
    try { st = new ON.OneStore(data, name); } catch (e) { plan.errors.push(`${src.file || name}: ${e.message}`); ui.secDone++; return; }
    if (st.type !== 'one') { ui.secDone++; return; }
    // Begleitdateien (<file>-Verweise) nur laden, wenn der Abschnitt welche braucht
    if (src.comps && src.comps.length) {
      const ext = st.externalNames();
      if (ext.length) st.external = await this.loadCompanions(src.path || src.file || name, ext, src.comps);
    }
    const model = new ON.Model(st);
    let s0;
    try { s0 = model.sectionStart(name); } catch (e) { plan.errors.push(`${src.file || name}: ${e.message}`); ui.secDone++; return; }
    const node = { id: uid('g'), name: s0.name || name, color: Ops.nextColor(), kind: 'section', groups: [], pages: [] };
    parent.groups.push(node);
    ctx.meta.set(node, { file: src.file || '' });
    for (let i = 0; i < s0.refs.length; i++) {
      if (ui.cancelled) break;
      const ref = s0.refs[i];
      let pg = model.readPage(ref);
      if (pg) {
        try {
          const p = await this.convertPage(pg, rep, stats);
          Store.pages[p.id] = p;
          node.pages.push(p.id);
          Hist.touchPage(p.id);
          stats.pages++;
          if (!ctx.first) ctx.first = p.id;
        } catch (e) {
          console.error(e);
          // Browser-Speicher voll: sofort aufhören statt jede weitere Seite scheitern zu lassen
          if (this.isQuota(e)) { ctx.quota = true; ui.cancelled = true; }
          else rep.set('Seiten mit Fehlern beim Umwandeln', (rep.get('Seiten mit Fehlern beim Umwandeln') || 0) + 1);
        }
      }
      pg = null;
      st.release(ref.osid);   // zwischengespeicherte Eigenschaften dieser Seite freigeben
      ui.page(node.name, i + 1, s0.refs.length);
      ImportJournal.beat({ section: node.name, file: src.file || src.path || '', page: i + 1, pages: s0.refs.length, rar: this._rarInfo || undefined });
      await this.breathe(ctx);
    }
    const end = model.sectionEnd();
    // Absicherung: was im FileDataStore keinem Element zugeordnet war, auf einer eigenen Seite sammeln
    if (end.orphans.length && !ui.cancelled) {
      try {
        const p = await this.orphanPage(end.orphans, stats);
        Store.pages[p.id] = p;
        node.pages.push(p.id);
        Hist.touchPage(p.id);
        stats.pages++;
        stats.orphans = (stats.orphans || 0) + end.orphans.length;
      } catch (e) { console.error(e); }
    }
    for (const m of end.missing) plan.missing.push({ ...m, section: node.name });
    for (const [k, v] of model.report) rep.set(k, (rep.get(k) || 0) + v);
    plan.warnings += st.warnings.length;
    if (st.warnings.length) console.warn('OneNote', name, st.warnings);
    if (!node.pages.length && ui.cancelled) parent.groups.splice(parent.groups.indexOf(node), 1);
    else { Tree.normLevels(node); stats.sections++; }
    ui.secDone++;
    // zwischendurch speichern: stürzt der Browser ab, bleibt das bisher Importierte erhalten
    if (stats.pages - ctx.savedAt >= 40) { ctx.savedAt = stats.pages; await Save.flush(); }
  },
  /* Begleitdateien für die <file>-Verweise eines Abschnitts laden: nur, was dazu passt */
  async loadCompanions(sectionPath, names, comps) {
    const want = new Set();
    for (const n of names) {
      const b = String(n).replace(/\\/g, '/').split('/').pop().toLowerCase();
      want.add(b); want.add(b.replace(/[{}]/g, '')); want.add(b.replace(/\.[^.]*$/, ''));
    }
    const sp = String(sectionPath).replace(/\\/g, '/').toLowerCase();
    const own = (sp.includes('/') ? sp.slice(0, sp.lastIndexOf('/') + 1) : '') + sp.split('/').pop().replace(/\.one$/i, '') + '_onefiles/';
    const loaded = [];
    for (const c of comps) {
      const p = c.name.replace(/\\/g, '/').toLowerCase(), b = p.split('/').pop();
      const bare = b.replace(/[{}]/g, ''), stem = bare.replace(/\.[^.]*$/, '');
      if (!(p.startsWith(own) || want.has(b) || want.has(bare) || want.has(stem))) continue;
      try { loaded.push({ name: c.name, data: await c.read() }); } catch (e) { /* fehlt eben */ }
    }
    return loaded.length ? this.companions(loaded)(sectionPath) : null;
  },
  /* schon gelesener Abschnitt / Baum (ältere Aufrufer, Tests) */
  async importParsed(s, parent, ctx) {
    const { stats, rep } = ctx;
    const node = { id: uid('g'), name: s.name || 'Abschnitt', color: s.color || Ops.nextColor(), kind: 'section', groups: [], pages: [] };
    parent.groups.push(node);
    for (const pg of s.pages) {
      try {
        const p = await this.convertPage(pg, rep, stats);
        Store.pages[p.id] = p;
        node.pages.push(p.id);
        Hist.touchPage(p.id);
        stats.pages++;
        if (!ctx.first) ctx.first = p.id;
      } catch (e) { console.error(e); rep.set('Seiten mit Fehlern beim Umwandeln', (rep.get('Seiten mit Fehlern beim Umwandeln') || 0) + 1); }
      await this.breathe(ctx);
    }
    if (s.orphans && s.orphans.length) {
      try {
        const p = await this.orphanPage(s.orphans, stats);
        Store.pages[p.id] = p;
        node.pages.push(p.id);
        Hist.touchPage(p.id);
        stats.pages++;
        stats.orphans = (stats.orphans || 0) + s.orphans.length;
      } catch (e) { console.error(e); }
    }
    Tree.normLevels(node);
    stats.sections++;
    ctx.ui.secDone++;
  },
  async importTree(nb, ctx) {
    const node = { id: uid('g'), name: nb.name, color: nb.color || Ops.nextColor(), kind: 'notebook', groups: [], pages: [] };
    Store.groups.push(node);
    ctx.stats.notebooks++;
    const walk = async (g, parent) => {
      for (const c of g.children) {
        if (c.kind === 'section') await this.importParsed(c, parent, ctx);
        else {
          const grp = { id: uid('g'), name: c.name, color: c.color || '', kind: 'group', groups: [], pages: [] };
          parent.groups.push(grp);
          await walk(c, grp);
          if (!grp.groups.length) parent.groups.splice(parent.groups.indexOf(grp), 1);
        }
      }
    };
    await walk(nb.tree, node);
  },

  showReport(stats, plan) {
    const rows = [];
    rows.push(`<p><b>Importiert:</b> ${stats.notebooks ? stats.notebooks + ' ' + (stats.notebooks === 1 ? 'Notizbuch' : 'Notizbücher') + ', ' : ''}${stats.sections} Abschnitt${stats.sections === 1 ? '' : 'e'}, ${stats.pages} Seite${stats.pages === 1 ? '' : 'n'}, ${stats.images} Bild${stats.images === 1 ? '' : 'er'}${stats.videos ? `, ${stats.videos} Video${stats.videos === 1 ? '' : 's'}` : ''}, ${stats.files} ${stats.files === 1 ? 'Anhang' : 'Anhänge'}.</p>`);
    if (stats.orphans) rows.push(`<p style="color:var(--ink-3)">${stats.orphans} Datei(en) aus dem Speicher der OneNote-Datei gehörten zu keinem sichtbaren Element (z.B. XPS-Druckdokumente von Ausdrucken, Symbolbilder von Anhängen) – sie liegen auf der Seite <b>„Nicht zugeordnete Inhalte“</b>, damit nichts verloren geht.</p>`);
    if (plan.missing && plan.missing.length) rows.push(this.missingReport(plan.missing));
    const rep = [...plan.report].filter(([, v]) => v);
    if (rep.length) rows.push('<p><b>Angepasst oder ersetzt:</b></p><ul>' + rep.map(([k, v]) => `<li>${escapeHtml(k)}: ${v}</li>`).join('') + '</ul>');
    if (plan.errors.length) rows.push('<p style="color:var(--danger)"><b>Nicht lesbar:</b></p><ul>' + plan.errors.map(e => `<li>${escapeHtml(e)}</li>`).join('') + '</ul>');
    if (plan._skipped) rows.push(`<p style="color:var(--ink-3)">${plan._skipped} Datei(en) waren weder OneNote noch KnowledgeTree und wurden übersprungen.</p>`);
    if (plan.warnings) rows.push(`<p style="color:var(--ink-3)">${plan.warnings} technische Hinweise beim Lesen (Details in der Browser-Konsole).</p>`);
    if (plan._cancelled) rows.unshift('<p style="color:var(--danger)"><b>Abgebrochen</b> – importiert ist, was bis dahin fertig war (Strg+Z nimmt es zurück).</p>');
    if (plan._rolledBack) rows.unshift(`<p style="color:var(--danger)"><b>Der Import ist fehlgeschlagen – das halb Importierte wurde restlos wieder entfernt</b> (${plan._rolledBack.pages} Seiten${plan._rolledBack.bilder ? `, ${plan._rolledBack.bilder} Bilder/Anhänge, ${Math.round((plan._rolledBack.bytes || 0) / 1e6)} MB` : ''}). Es bleiben keine Reste im Speicher.</p>`);
    if (plan._quota !== undefined) rows.unshift(`<p style="color:var(--danger)"><b>Der Speicher dieses Browsers ist voll</b>${plan._quota ? ' (' + escapeHtml(plan._quota) + ')' : ''} – der Import wurde angehalten. Abhilfe: Platz auf dem Gerät schaffen, nicht benötigte Notizbücher löschen und unter <b>Datei → Papierkorb</b> den Speicher aufräumen, oder die Desktop-Version (speichert im Ordner) verwenden.</p>`);
    rows.push('<p style="color:var(--ink-3)">Mit Strg+Z lässt sich der ganze Import rückgängig machen.</p>');
    let title = plan._title || (plan._archive ? 'Archiv-Import abgeschlossen' : 'OneNote-Import abgeschlossen');
    if (plan._cancelled || plan._quota !== undefined || plan._rolledBack) title = title.replace(/ abgeschlossen$/, plan._rolledBack ? ' fehlgeschlagen' : plan._cancelled ? ' abgebrochen' : ' angehalten');
    UI.info(title, rows.join(''), { wide: true });
  },

  /* ---------------------------------------------------------- Seite umwandeln */
  /* Ausdruck (seit 1.22): Druckdokument (.xps) und Quelldatei (z.B. .pdf) je Datei nur einmal speichern und am Bild
     vermerken – so gehen sie nicht mehr auf „Nicht zugeordnete Inhalte“ und kommen beim OneNote-Export zurück. */
  async printInfo(pr, stats) {
    const cache = stats._printCache || (stats._printCache = new Map());
    const MIME = { '.pdf': 'application/pdf', '.xps': 'application/vnd.ms-xpsdocument', '.oxps': 'application/oxps' };
    const save = (f, def) => {
      if (!f || !f.data) return Promise.resolve(null);
      const ext = (f.ext || def).toLowerCase();
      const key = (f.guid || '') + ':' + f.data.length + ':' + ext;
      if (!cache.has(key)) cache.set(key, this.saveBlob(f.data, MIME[ext] || 'application/octet-stream', ext.replace('.', ''), false).catch(() => null));
      return cache.get(key);
    };
    const out = {};
    const x = await save(pr.xps, '.xps');
    if (x) out.xps = x;
    const s = await save(pr.src, '.pdf');
    if (s) { out.src = s; out.srcExt = (pr.src.ext || '').toLowerCase(); }
    for (const k of ['page', 'idx', 'group', 'flag']) if (pr[k] !== undefined) out[k] = pr[k];
    return out;
  },
  async saveBlob(data, type, ext, isImage) {
    const blob = new Blob([data], { type: type || 'application/octet-stream' });
    if (isImage && /^image\/(png|jpeg|gif|webp|bmp|svg\+xml)$/.test(type)) return Backend.saveImage(blob);
    return Backend.saveFile ? Backend.saveFile(blob, ext) : Backend.saveImage(blob);
  },
  /* Seite „Nicht zugeordnete Inhalte“: Bilder als Bild, alles andere (z.B. XPS-Druckdokumente) als 📎-Anhang */
  async orphanPage(orphans, stats) {
    const p = newPage('Nicht zugeordnete Inhalte');
    p.bg = 'keiner';
    const note = '<div><b>Nicht zugeordnete Inhalte</b></div><div>Diese Dateien lagen in der OneNote-Datei, gehörten aber zu keinem sichtbaren Element – z.&nbsp;B. das XPS-Druckdokument eines Ausdrucks (die Seitenbilder sind auf den Seiten) oder das Symbolbild eines Anhangs. Sie sind hier gesammelt, damit nichts verloren geht.</div>';
    p.boxes.push({ id: uid('b'), x: 20, y: 0, w: 520, html: note, images: [], z: 1, style: {}, locked: false, pkg: null });
    let x = 20, y = 110, rowH = 0, z = 2;
    for (const o of orphans) {
      const isImg = /^image\/(png|jpeg|gif|webp|bmp|svg\+xml)$/.test(o.mime || '');
      const ext = (o.ext || '').replace(/^\./, '') || (isImg ? (o.mime.split('/')[1] || 'png').replace('jpeg', 'jpg').replace('svg+xml', 'svg') : 'bin');
      const name = await this.saveBlob(o.data, o.mime, ext, isImg);
      if (isImg) {
        stats.images++;
        let w = 160, h = 120;
        try { const d = await loadImageSize(await Backend.imgURL(name)); const k = Math.min(1, 320 / (d.w || 1)); w = Math.max(16, Math.round(d.w * k)); h = Math.max(16, Math.round(d.h * k)); } catch (e) { /* */ }
        if (x + w > 760) { x = 20; y += rowH + 24; rowH = 0; }
        p.boxes.push({ id: uid('b'), x, y, w: w + 22, html: '', images: [{ id: uid('i'), src: name, x: 0, y: 0, w, h }], z: z++, style: {}, locked: false, pkg: null });
        x += w + 40; rowH = Math.max(rowH, h + 30);
      } else {
        stats.files++;
        const label = (/xps/i.test(ext) ? 'Druckdokument' : 'Datei') + ' ' + o.guid.slice(1, 9).toLowerCase() + '.' + ext;
        if (x + 300 > 760) { x = 20; y += rowH + 24; rowH = 0; }
        p.boxes.push({ id: uid('b'), x, y, w: 280, html: this.fileChip(name, label), images: [], z: z++, style: {}, locked: false, pkg: null });
        x += 320; rowH = Math.max(rowH, 50);
      }
    }
    return p;
  },
  async convertPage(pg, rep, stats) {
    const p = newPage(pg.title || 'Unbenannte Seite');
    if (pg.created) p.created = pg.created;
    p.modified = pg.modified || p.created;
    p.level = pg.level || 0;
    p.bg = 'keiner';
    const items = pg.items.filter(it => it.kind !== 'unknown');
    // Gleiche Lage wie in OneNote: alle Elemente behalten ihre Koordinaten (1 px = 1/96 Zoll).
    // Nur der Titelbereich oben wird abgezogen, weil der Titel hier über der Fläche steht.
    let minX = Infinity, minY = Infinity;
    for (const it of items) {
      if (it.kind === 'ink') { for (const st of it.strokes || []) for (const v of st.pts) { if (v.x < minX) minX = v.x; if (v.y < minY) minY = v.y; } }
      else { minX = Math.min(minX, it.x || 0); minY = Math.min(minY, it.y || 0); }
    }
    if (minX === Infinity) minX = minY = 0;
    const offX = Math.min(0, minX), offY = Math.min(ON_TITLE_SPACE, minY);
    let z = 1;
    const pad = PADX + BORDER;
    const onStyle = { bg: 'transparent', lh: 'normal', on: 1 };
    const idMap = new Map();   // alte Tabellen-ID (aus KnowledgeTree) -> neue
    for (let it of items) {
      const x = Math.round(((it.x || 0) - offX) * 10) / 10, y = Math.round(((it.y || 0) - offY) * 10) / 10;
      // Tabelle aus KnowledgeTree: Formeln und Formate aus dem versteckten Träger zurückholen
      if (it.kind === 'outline') {
        const kt = this.ktSheet(it);
        if (kt) {
          const box = this.sheetFrom(kt, x, y, rep);
          if (box) { box.z = z++; p.boxes.push(box); idMap.set(kt.meta.id, box.id); }
          if (!kt.rest.length) continue;
          it = { ...it, blocks: kt.rest };
        }
      }
      if (it.kind === 'image' && it.alt && it.alt.includes(this.KT_META)) {
        const m = this.ktMeta(it.alt);
        if (m && m.kt === 'chart' && m.chart && typeof Chart !== 'undefined') {
          p.boxes.push({ id: uid('b'), x: Math.round(x - (m.dx || 0)), y: Math.round(y - (m.dy || 0)), w: Math.max(200, Math.round(m.w || it.w + 14)), html: '', images: [], z: z++, style: m.style || {}, locked: false, pkg: null, chart: Chart.norm(JSON.parse(JSON.stringify(m.chart))) });
          rep.set('Diagramme aus KnowledgeTree wiederhergestellt', (rep.get('Diagramme aus KnowledgeTree wiederhergestellt') || 0) + 1);
          continue;
        }
      }
      if (it.kind === 'outline') {
        const ctx = { maxImg: 0 };
        const html = await this.blocksHtml(it.blocks, it, rep, stats, ctx);
        if (isEmptyHtml(html) && !/<img|kt-file|kt-math/.test(html)) continue;
        const w = Math.round(Math.max(it.w || 0, ctx.maxImg, 40) || 480) + 2 * pad;
        p.boxes.push({ id: uid('b'), x: x - pad, y: y - BAR - BORDER, w, html, images: [], z: z++, style: { ...onStyle }, locked: false, pkg: null });
      } else if (it.kind === 'image') {
        if (it.missing) {
          // Bildverweis nicht auflösbar (Daten nicht in dieser .one-Datei, z.B. in OneDrive ausgelagert).
          // Ausdrucke sind das NICHT mehr: deren Seitenbild liest image() seit 1.13 aus 0x200034C8.
          // (OneDrive/SharePoint). Statt es wegzulassen: sichtbarer Hinweis mit dem Weg über „Datei anhängen → aufklappen“.
          stats.missingImages = (stats.missingImages || 0) + 1;
          const mw = Math.round(Math.max(it.w || 0, 260));
          p.boxes.push({ id: uid('b'), x: x - pad, y: y - BAR - BORDER, w: mw + 2 * pad, html: this.missingHtml('Bild', it), images: [], z: z++, style: { ...onStyle }, locked: false, pkg: null });
          continue;
        }
        const name = await this.saveBlob(it.data, it.mime, (it.ext || '').replace('.', ''), true);
        stats.images++;
        const w = Math.round(it.w || 200), h = Math.round(it.h || 150);
        if (/^image\/(png|jpeg|gif|webp|bmp|svg\+xml)$/.test(it.mime)) {
          const img = { id: uid('i'), src: name, x: 0, y: 0, w, h };
          if (it.ocr) img.ocr = it.ocr;   // von OneNote erkannter Bildtext (Suche)
          if (it.printout) img.print = await this.printInfo(it.printout, stats);   // Ausdruck: Druckdokument + Quelldatei (1.22)
          if (it.video) { img.video = it.video; if (it.videoTitle) img.title = it.videoTitle; stats.videos = (stats.videos || 0) + 1; }
          p.boxes.push({ id: uid('b'), x: x - pad, y: y - BAR - BORDER, w: w + 2 * pad, html: '', images: [img], z: it.background ? 1 : z++, style: { ...onStyle }, locked: false, pkg: null, ...(it.background ? { bg: true } : {}) });   // OneNote „Bild als Hintergrund“ → Hintergrund (1.10)
        } else {
          p.boxes.push({ id: uid('b'), x: x - pad, y: y - BAR - BORDER, w: 260, html: this.fileChip(name, (it.name || 'Bild') + (it.ext && !/\.\w+$/.test(it.name || '') ? it.ext : '')), images: [], z: z++, style: { ...onStyle }, locked: false, pkg: null });
        }
      } else if (it.kind === 'file') {
        if (it.missing) {
          stats.missingFiles = (stats.missingFiles || 0) + 1;
          p.boxes.push({ id: uid('b'), x: x - pad, y: y - BAR - BORDER, w: 320, html: this.missingHtml('Anhang', it), images: [], z: z++, style: { ...onStyle }, locked: false, pkg: null });
          continue;
        }
        const name = await this.saveBlob(it.data, it.mime, (it.name.split('.').pop() || 'bin'), false);
        stats.files++;
        p.boxes.push({ id: uid('b'), x: x - pad, y: y - BAR - BORDER, w: 280, html: this.fileChip(name, it.name), images: [], z: z++, style: { ...onStyle }, locked: false, pkg: null });
      } else if (it.kind === 'ink' && Array.isArray(it.strokes)) {
        for (const s of it.strokes) {
          const X = (v) => Math.round((v - offX) * 10) / 10, Y = (v) => Math.round((v - offY) * 10) / 10;
          const color = s.color || '#1f1f1f', w = Math.max(0.5, s.w || 2);
          if (it.shape && !s.marker && s.pts.length >= 2) {
            // OneNote-Form: Ecken bleiben scharf
            const q = s.pts;
            const closed = q.length > 2 && Math.hypot(q[0].x - q[q.length - 1].x, q[0].y - q[q.length - 1].y) < 0.5;
            const use = closed ? q.slice(0, -1) : q;
            if (use.length === 2) p.drawings.push({ id: uid('d'), type: 'shape', shape: 'line', x1: X(use[0].x), y1: Y(use[0].y), x2: X(use[1].x), y2: Y(use[1].y), color, w, fill: null, t0: s.t0 || Date.now(), layer: 'oben' });
            else p.drawings.push({ id: uid('d'), type: 'shape', shape: closed ? 'poly' : 'polyline', pts: use.flatMap(v => [X(v.x), Y(v.y)]), color, w, fill: null, t0: s.t0 || Date.now(), layer: 'oben' });
            continue;
          }
          const pts = [];
          for (const v of s.pts) pts.push(X(v.x), Y(v.y), v.p ?? 0.5);
          // fit = genau wie OneNote zeichnen (alle Punkte, keine Glättung/Verjüngung); np = ohne Druck (gleich breit)
          if (pts.length >= 3) p.drawings.push({ id: uid('d'), type: 'ink', kind: s.marker ? 'marker' : 'pen', color, w, pts, t0: s.t0 || Date.now(), dur: 0, layer: 'oben', fit: 1, ...(s.pressure ? {} : { np: 1 }), ...(it.shape ? { sharp: true } : {}) });
        }
      }
    }
    // Diagramme wieder mit den neu angelegten Tabellen verknüpfen
    for (const b of p.boxes) if (b.chart && b.chart.src && idMap.has(b.chart.src.id)) b.chart.src.id = idMap.get(b.chart.src.id);
    return normPage(p);
  },
  /* ---- Tabellen und Diagramme aus KnowledgeTree (Rückimport) */
  KT_META: 'KTDATA:',
  ktMeta(alt) {
    const i = String(alt || '').indexOf(this.KT_META);
    if (i < 0) return null;
    try { return JSON.parse(alt.slice(i + this.KT_META.length)); } catch (e) { return null; }
  },
  ktSheet(it) {
    let carrier = -1, meta = null, table = -1;
    it.blocks.forEach((b, i) => {
      for (const c of b.content) {
        if (c.type === 'img' && c.alt && c.alt.includes(this.KT_META)) { const m = this.ktMeta(c.alt); if (m && m.kt === 'sheet' && m.sheet) { carrier = i; meta = m; } }
        if (c.type === 'table' && table < 0) table = i;
      }
    });
    if (!meta || table < 0) return null;
    const rest = it.blocks.filter((b, i) => i !== table && i !== carrier);
    return { meta, table: it.blocks[table].content.find(c => c.type === 'table'), rest };
  },
  /* Tabelle wiederherstellen; Zellen, die in OneNote geändert wurden, als Wert übernehmen */
  sheetFrom(kt, x, y, rep) {
    const m = kt.meta;
    const d = XL.normSheet(JSON.parse(JSON.stringify(m.sheet)));
    const cellText = (cell) => cell.blocks.map(b => b.content.filter(c => c.type === 'p').map(c => c.runs.map(r => r.text).join('')).join('')).join('\n');
    const texts = kt.table.rows.map(row => row.map(cellText));
    const norm = (t) => String(t ?? '').replace(/[\s\u00a0]+/g, ' ').trim();
    const vals = Array.isArray(m.vals) ? m.vals : [];
    const H = texts.length, Wd = Math.max(0, ...texts.map(r => r.length));
    let changed = 0;
    for (let r = 0; r < H; r++) for (let c = 0; c < Wd; c++) {
      const got = texts[r][c] ?? '';
      const want = vals[r] ? vals[r][c] : undefined;
      if (want !== undefined && norm(want) === norm(got)) continue;
      if (want === undefined && got === '') continue;
      const k = XL.key(c, r), old = d.cells[k];
      const f = old && old.f;
      if (got === '') { if (f) d.cells[k] = { v: '', f }; else delete d.cells[k]; }
      else { d.cells[k] = { v: XL.isFormula(got) ? "'" + got : got, ...(f ? { f } : {}) }; if (!f) { const pi = XL.parseInput(got); if (pi.nf) d.cells[k].f = { nf: pi.nf, ...(pi.d != null ? { d: pi.d } : {}), ...(pi.cur ? { cur: pi.cur } : {}) }; } }
      changed++;
    }
    // Zeilen/Spalten, die in OneNote gelöscht wurden
    if (H && H < d.nrows) { for (const k of Object.keys(d.cells)) if (XL.parseKey(k).r >= H) delete d.cells[k]; d.nrows = H; }
    if (Wd && Wd < d.ncols) { for (const k of Object.keys(d.cells)) if (XL.parseKey(k).c >= Wd) delete d.cells[k]; d.ncols = Wd; d.cols.length = Wd; }
    d.nrows = Math.max(d.nrows, H); d.ncols = Math.max(d.ncols, Wd);
    XL.normSheet(d);
    if (kt.table.cols && kt.table.cols.length === d.ncols && changed) kt.table.cols.forEach((w, i) => { if (w > 8) d.cols[i] = Math.round(w); });
    rep.set('Tabellen aus KnowledgeTree wiederhergestellt (mit Formeln)', (rep.get('Tabellen aus KnowledgeTree wiederhergestellt (mit Formeln)') || 0) + 1);
    if (changed) rep.set('In OneNote geänderte Tabellenzellen (als Wert übernommen)', (rep.get('In OneNote geänderte Tabellenzellen (als Wert übernommen)') || 0) + changed);
    return { id: uid('b'), x: Math.round(x - (m.dx || 0)), y: Math.round(y - (m.dy || 0)), w: m.w || 200, html: '', images: [], z: 1, style: m.style || { bg: 'transparent' }, locked: false, pkg: null, sheet: d };
  },
  /* Platzhalter für ein Bild/einen Anhang, dessen Daten nicht in der OneNote-Datei stecken – mit Grund und Abhilfe */
  MISSING_WHY: {
    invfdo: 'OneNote hat die Daten in dieser Datei als „ungültig“ markiert – sie sind nicht enthalten (möglicherweise war das Bild beim Sichern noch nicht aus OneDrive heruntergeladen).',
    extern: 'OneNote hat die Daten in einen Begleitordner neben die .one-Datei gelegt („<i>Abschnitt</i>_onefiles“), der nicht mit importiert wurde.',
    fehlt: 'Die Datei verweist auf Daten, die nicht in ihr enthalten sind (unvollständige Datei).',
  },
  missingHtml(what, it) {
    // kurz (steht an der Stelle des Bildes); die ausführliche Erklärung steht im Import-Bericht und im Tooltip
    const why = it.why || 'fehlt';
    const nm = it.name ? ` „${escapeHtml(it.name)}“` : '';
    const short = {
      extern: 'liegt im Begleitordner „…_onefiles“ neben der .one-Datei – den ganzen Ordner importieren (Datei → Importieren → Ordner).',
      invfdo: 'in der OneNote-Datei als „ungültig“ markiert (keine Daten) – in OneNote die Seite öffnen und Datei → Exportieren verwenden.',
      fehlt: 'Verweis ohne Daten (Datei unvollständig) – in OneNote Datei → Exportieren verwenden.',
    }[why] || '';
    const tip = escapeHtml((this.MISSING_WHY[why] || this.MISSING_WHY.fehlt).replace(/<[^>]+>/g, '') + (it.external ? ' Datei: ' + it.external : ''));
    const mh = it.h > 40 ? ` style="min-height:${Math.round(Math.min(it.h, 600))}px"` : '';
    return `<div class="kt-missing" data-why="${why}" title="${tip}"${mh}>🧩 ${what}${nm} fehlt: ${short}</div>`;
  },
  /* Bericht: fehlende Bilder/Anhänge nach Grund, mit betroffenen Seiten */
  missingReport(list) {
    const groups = new Map();
    for (const m of list) { if (!groups.has(m.why)) groups.set(m.why, []); groups.get(m.why).push(m); }
    const parts = [];
    const head = { invfdo: 'Daten in OneNote als „ungültig“ markiert', extern: 'im Begleitordner „…_onefiles“ (nicht mit importiert)', fehlt: 'Verweis ohne Daten' };
    for (const [why, ms] of groups) {
      const img = ms.filter(m => m.kind === 'Bild').length, fil = ms.length - img;
      const what = [img ? `${img} Bild${img === 1 ? '' : 'er'}` : '', fil ? `${fil} ${fil === 1 ? 'Anhang' : 'Anhänge'}` : ''].filter(Boolean).join(' und ');
      const pages = [...new Set(ms.map(m => (m.section ? m.section + ' › ' : '') + (m.page || 'Seite ohne Titel')))];
      parts.push(`<li><b>${what}</b> – ${head[why] || head.fehlt}. ${this.MISSING_WHY[why] || this.MISSING_WHY.fehlt}<br><span style="color:var(--ink-3)">Betroffen: ${pages.slice(0, 6).map(escapeHtml).join(' · ')}${pages.length > 6 ? ` · … (+${pages.length - 6})` : ''}</span></li>`);
    }
    const anyExt = groups.has('extern'), anyOther = [...groups.keys()].some(k => k !== 'extern');
    return `<p><b>Nicht in der Datei enthalten:</b> an ihrer Stelle steht ein Hinweis.</p><ul>${parts.join('')}</ul>` +
      (anyExt ? '<p style="color:var(--ink-3)">Für den Begleitordner: den ganzen Notizbuch-Ordner importieren (<b>Datei → Importieren → Ordner wählen</b>, oder den Ordner auf das Fenster ziehen) bzw. ihn als ZIP importieren.</p>' : '') +
      (anyOther ? '<p style="color:var(--ink-3)">Sonst: in OneNote die Seiten öffnen, bis alle Bilder angezeigt werden, und dann <b>Datei → Exportieren</b> (Abschnitt bzw. Notizbuch). Automatische OneNote-Sicherungen enthalten unter Umständen nicht alle Bilder.</p>' : '');
  },
  fileChip(name, fileName) {
    return `<div><a class="kt-file" contenteditable="false" data-kt-file="${escapeHtml(name)}" data-name="${escapeHtml(fileName)}">📎 ${escapeHtml(fileName)}</a></div>`;
  },

  /* Gliederung -> HTML (Absätze, Listen, Checklisten, Tabellen, Bilder) */
  async blocksHtml(blocks, outline, rep, stats, ctx) {
    let out = '';
    const stack = []; // offene Listen {tag, depth, cls}
    const closeTo = (depth, tag, cls) => {
      while (stack.length) {
        const top = stack[stack.length - 1];
        if (top.depth > depth || (top.depth === depth && (top.tag !== tag || top.cls !== cls))) { out += `</${top.tag}>`; stack.pop(); }
        else break;
      }
    };
    for (const b of blocks) {
      const todo = b.tags.find(t => TODO_RE.test(t.label || '') || t.type != null && t.type < 100);
      const others = b.tags.filter(t => t !== todo);
      let prefix = '';
      for (const t of others) {
        const sym = (TAG_SYMBOLS.find(([re]) => re.test(t.label || '')) || [null, '🏷'])[1];
        prefix += `<span class="kt-tag" title="${escapeHtml(t.label || 'Markierung')}">${sym}</span> `;
        rep.set('Markierungen (Tags) als Symbol', (rep.get('Markierungen (Tags) als Symbol') || 0) + 1);
      }
      let inner = '';
      for (const c of b.content) inner += await this.contentHtml(c, outline, rep, stats, ctx);
      if (!inner) inner = '<br>';
      if (prefix) inner = inner.replace(/^(<(?:h[1-6]|div|blockquote|pre)[^>]*>)?/, (m) => (m || '') + prefix);
      if (todo) {
        closeTo(b.depth, 'ul', 'checklist');
        if (!stack.length || stack[stack.length - 1].depth < b.depth || stack[stack.length - 1].cls !== 'checklist') { out += '<ul class="checklist">'; stack.push({ tag: 'ul', depth: b.depth, cls: 'checklist' }); }
        out += `<li${todo.done ? ' class="done"' : ''}>${this.unwrap(inner)}</li>`;
        continue;
      }
      if (b.list) {
        const tag = b.list.numbered ? 'ol' : 'ul';
        closeTo(b.depth, tag, '');
        if (!stack.length || stack[stack.length - 1].depth < b.depth) { out += `<${tag}>`; stack.push({ tag, depth: b.depth, cls: '' }); }
        out += `<li>${this.unwrap(inner)}</li>`;
        continue;
      }
      closeTo(-1, '', '');
      let ind = 0;
      for (let k = 1; k <= b.depth; k++) ind += outline.indents[k] > 0 ? outline.indents[k] : 36;
      out += ind ? `<div style="margin-left:${Math.round(ind)}px">${inner}</div>` : inner;
    }
    closeTo(-1, '', '');
    return out;
  },
  unwrap(html) {
    const m = /^<div>([\s\S]*)<\/div>$/.exec(html);
    return m && !/<div/.test(m[1]) ? m[1] : html;
  },
  async contentHtml(c, outline, rep, stats, ctx) {
    if (c.type === 'p') return this.paraHtml(c);
    if (c.type === 'img') {
      if (c.missing || !c.data) { stats.missingImages = (stats.missingImages || 0) + 1; return this.missingHtml('Bild', c); }
      if (!/^image\/(png|jpeg|gif|webp|bmp|svg\+xml)$/.test(c.mime || '')) {
        const fname = (c.name || 'Bild') + (c.ext && !/\.\w+$/.test(c.name || '') ? c.ext : '');
        const fn = await this.saveBlob(c.data, c.mime, (c.ext || '.bin').replace('.', ''), false);
        stats.files++;
        return this.fileChip(fn, fname);
      }
      const name = await this.saveBlob(c.data, c.mime, (c.ext || '').replace('.', ''), true).catch(() => null);
      if (name && c.printout) c._print = await this.printInfo(c.printout, stats);
      return name ? this.imgHtml(name, c, ctx, stats) : '';
    }
    if (c.type === 'file') {
      if (c.missing) { stats.missingFiles = (stats.missingFiles || 0) + 1; return this.missingHtml('Anhang', c); }
      const name = await this.saveBlob(c.data, c.mime, (c.name.split('.').pop() || 'bin'), false);
      stats.files++;
      return this.fileChip(name, c.name);
    }
    if (c.type === 'table') {
      let h = '<table><tbody>';
      for (const row of c.rows) {
        h += '<tr>';
        row.forEach((cell, i) => {
          const css = [];
          if (c.cols[i]) css.push(`width:${Math.round(c.cols[i])}px`);
          if (cell.shade) css.push(`background-color:${cell.shade}`);
          if (!c.borders) css.push('border-color:transparent');
          h += `<td${css.length ? ` style="${css.join(';')}"` : ''}>__CELL__</td>`;
        });
        h += '</tr>';
      }
      h += '</tbody></table>';
      for (const row of c.rows) for (const cell of row) h = h.replace('__CELL__', (await this.blocksHtml(cell.blocks, { indents: [] }, rep, stats, ctx)) || '<br>');
      const tw = c.cols.reduce((a, b) => a + b, 0);
      ctx.maxImg = Math.max(ctx.maxImg, tw);
      return h + '<div><br></div>';
    }
    return '';
  },
  imgHtml(name, c, ctx, stats) {
    stats.images++;
    const w = Math.round(c.w || 0), h = Math.round(c.h || 0);
    ctx.maxImg = Math.max(ctx.maxImg, w);
    const css = w ? `width:${w}px${h ? `;height:${h}px` : ''}` : '';
    const img = `<img data-kt-src="${escapeHtml(name)}" alt="${escapeHtml(c.alt || '')}"${c.ocr ? ` data-ocr="${escapeHtml(c.ocr)}"` : ''}${c._print ? ` data-kt-print="${escapeHtml(JSON.stringify(c._print))}"` : ''}${css ? ` style="${css}"` : ''}>`;
    if (c.video) { stats.videos = (stats.videos || 0) + 1; return `<div>${Video.wrapHtml(img, c.video, c.videoTitle)}</div>`; }
    return `<div>${img}</div>`;
  },
  paraHtml(p) {
    const style = (p.style || '').toLowerCase();
    const hm = /^h([1-6])$/.exec(style);
    const tag = hm ? 'h' + hm[1] : style === 'code' ? 'pre' : 'div';
    // Absatzformat = OneNote-Standard der Vorlage, überschrieben durch die Angaben in der Datei
    const def = ON_STYLES[style] || ON_STYLES.p;
    const base = { ...def };
    for (const [k, v] of Object.entries(p.base || {})) if (v !== undefined && v !== '' && (v !== null || k === 'color')) base[k] = v;
    const pcss = [];
    if (base.font && !/^calibri$/i.test(base.font)) pcss.push(fontCss(base.font));
    if (base.size && base.size !== 11) pcss.push(`font-size:${base.size}pt`);
    if (base.color) pcss.push(`color:${base.color}`);
    if (base.b) pcss.push('font-weight:bold');
    if (base.i) pcss.push('font-style:italic');
    if (p.before) pcss.push(`margin-top:${+p.before.toFixed(2)}pt`);
    if (p.after) pcss.push(`margin-bottom:${+p.after.toFixed(2)}pt`);
    if (p.lineExact) pcss.push(`line-height:${+p.lineExact.toFixed(2)}pt`);
    if (p.align === 1) pcss.push('text-align:center');
    if (p.align === 2) pcss.push('text-align:right');
    let inner = '';
    for (const r of p.runs) {
      let t = escapeHtml(r.text).replace(/\r\n|\r|\n|\u000b/g, '<br>').replace(/\t/g, '&emsp;');
      const css = [];
      if (r.font && r.font !== base.font) css.push(fontCss(r.font));
      if (r.size && r.size !== base.size) css.push(`font-size:${r.size}pt`);
      if (r.color && r.color !== base.color) css.push(`color:${r.color}`);
      if (r.hl) css.push(`background-color:${r.hl}`);
      if (r.math) css.push('font-family:&quot;Cambria Math&quot;,&quot;STIX Two Math&quot;,serif');
      if (css.length) t = `<span style="${css.join(';')}">${t}</span>`;
      if (r.b && !base.b) t = `<b>${t}</b>`;
      if (r.b === false && base.b) t = `<span style="font-weight:normal">${t}</span>`;
      if (r.i && !base.i) t = `<i>${t}</i>`;
      if (r.u) t = `<u>${t}</u>`;
      if (r.s) t = `<strike>${t}</strike>`;
      if (r.sup) t = `<sup>${t}</sup>`;
      if (r.sub) t = `<sub>${t}</sub>`;
      if (r.href) t = `<a href="${escapeHtml(r.href)}">${t}</a>`;
      inner += t;
    }
    if (!inner) inner = '<br>';
    return `<${tag}${pcss.length ? ` style="${pcss.join(';')}"` : ''}>${inner}</${tag}>`;
  },
};

/* RAR-Worker (seit 1.19) – wird als Text in einen Modul-Worker gegeben, darum völlig eigenständig (benutzt nichts
 * von aussen). Er lädt node-unrar-js selbst, ersetzt dessen „Archiv im Speicher“ durch einen Extractor, der die
 * Archivdatei mit FileReaderSync stückweise liest, und schickt jede entpackte Datei als Blob zurück. */
function rarWorkerMain() {
  const CHUNK = 4 << 20;     // so viel wird auf einmal aus der Datei gelesen
  const PART = 16 << 20;     // entpackte Daten alle 16 MB als Blob-Teil abgeben (Worker-Speicher bleibt klein)
  const AHEAD = 192e6;       // höchstens so viel entpackt, aber noch nicht abgeholt – dann warten
  let unrar = null, Ext = null;
  const flow = { pending: 0, need: new Set(), sent: new Set(), go: null };
  const resume = () => { if (flow.go) { const g = flow.go; flow.go = null; g(); } };
  const post = (m) => self.postMessage(m);
  const text = (e) => (e && (e.message || e.reason)) || String(e);
  const make = (Base) => class extends Base {
    constructor(u, file) {
      super(u, '');
      this._filePath = '_knowledgetree_.rar';
      this.file = file; this.len = file.size; this.rd = new FileReaderSync();
      this.fds = new Map(); this.nextFd = 1; this.buf = null; this.bufAt = 0; this.last = null; this.noted = 0; this.ioError = null;
    }
    open(name) { if (name !== this._filePath) return 0; const fd = this.nextFd++; this.fds.set(fd, { arc: true, pos: 0 }); return fd; }
    create(name) { const fd = this.nextFd++; this.fds.set(fd, { arc: false, name, pos: 0, size: 0, chunks: [], n: 0, parts: [] }); return fd; }
    closeFile(fd) {
      const f = this.fds.get(fd);
      if (!f) return;
      this.fds.delete(fd);
      if (!f.arc) { if (f.chunks.length) f.parts.push(new Blob(f.chunks)); this.last = new Blob(f.parts); }
    }
    bytes(pos, n) {
      if (this.buf && pos >= this.bufAt && pos + n <= this.bufAt + this.buf.length) return this.buf.subarray(pos - this.bufAt, pos - this.bufAt + n);
      if (n >= CHUNK) return new Uint8Array(this.rd.readAsArrayBuffer(this.file.slice(pos, pos + n)));
      this.bufAt = pos;
      this.buf = new Uint8Array(this.rd.readAsArrayBuffer(this.file.slice(pos, Math.min(this.len, pos + CHUNK))));
      return this.buf.subarray(0, n);
    }
    read(fd, ptr, size) {
      const f = this.fds.get(fd);
      if (!f || !f.arc) return -1;
      const n = Math.max(0, Math.min(size, this.len - f.pos));
      if (!n) return 0;
      let b;
      try { b = this.bytes(f.pos, n); } catch (e) { this.ioError = e; return -1; }
      this.unrar.HEAPU8.set(b, ptr);
      f.pos += n;
      if (f.pos - this.noted >= PART || f.pos === this.len) { this.noted = f.pos; post({ type: 'progress', frac: f.pos / (this.len || 1) }); }
      return n;
    }
    write(fd, ptr, size) {
      const f = this.fds.get(fd);
      if (!f || f.arc) return false;
      f.chunks.push(this.unrar.HEAPU8.slice(ptr, ptr + size));
      f.n += size; f.size += size; f.pos += size;
      if (f.n >= PART) { f.parts.push(new Blob(f.chunks)); f.chunks = []; f.n = 0; }
      return true;
    }
    tell(fd) { const f = this.fds.get(fd); return f ? f.pos : -1; }
    seek(fd, pos, method) {
      const f = this.fds.get(fd);
      if (!f) return false;
      const len = f.arc ? this.len : f.size;
      const p = method === 'SET' ? pos : method === 'CUR' ? f.pos + pos : len + pos;
      if (p < 0 || p > len) return false;
      f.pos = p;
      return true;
    }
  };
  const open = (file) => { const ex = new Ext(unrar, file); unrar.extractor = ex; return ex; };
  self.onmessage = async (ev) => {
    const d = ev.data || {};
    if (d.cmd === 'ack') { flow.pending = Math.max(0, flow.pending - (d.bytes || 0)); if (flow.pending <= AHEAD) resume(); return; }
    if (d.cmd === 'go') { if (!flow.sent.has(d.name)) flow.need.add(d.name); resume(); return; }
    try {
      if (d.cmd === 'init') {
        const mod = await import(d.url);
        const create = mod.createExtractorFromData || (mod.default && mod.default.createExtractorFromData);
        const Base = mod.Extractor || (mod.default && mod.default.Extractor);
        if (!create || !Base) throw new Error('node-unrar-js ohne Extractor');
        const probe = await create({ wasmBinary: d.wasm, data: new ArrayBuffer(0) });
        unrar = probe.unrar;
        if (!unrar || !unrar.HEAPU8 || !unrar.RarArchive) throw new Error('node-unrar-js: Modul nicht erreichbar');
        if (typeof FileReaderSync === 'undefined') throw new Error('FileReaderSync fehlt');
        Ext = make(Base);
        post({ type: 'ready' });
      } else if (d.cmd === 'list') {
        const ex = open(d.file);
        const heads = [];
        for (const h of ex.getFileList().fileHeaders) heads.push({ name: h.name, size: h.unpSize, dir: !!(h.flags && h.flags.directory) });   // ganz durchlaufen
        post({ type: 'list', heads });
      } else if (d.cmd === 'extract') {
        const want = new Set(d.names);
        for (let round = 0; want.size && round < 1000; round++) {
          const ex = open(d.file);
          let failed = null;
          try {
            // bis zum Ende durchlaufen – sonst bliebe das C++-Objekt samt Wörterbuch im WASM-Speicher
            for (const f of ex.extract({ files: (h) => !(h.flags && h.flags.directory) && want.has(h.name) }).files) {
              const name = f.fileHeader.name, blob = ex.last || new Blob([]);
              want.delete(name);
              ex.last = null;
              flow.sent.add(name); flow.need.delete(name); flow.pending += blob.size;
              post({ type: 'file', name, blob });
              // Rückstau: nicht beliebig weit vorauslaufen (Blobs belegen Speicher, bis der Import sie abholt)
              if (flow.pending > AHEAD && !flow.need.size && want.size) await new Promise(r => { flow.go = r; });
            }
          } catch (e) {
            failed = e;
            if (ex.ioError) failed = Object.assign(new Error('Datei nicht lesbar: ' + text(ex.ioError)), { reason: 'ERAR_EREAD', file: e && e.file });
          }
          if (!failed) break;
          // einzelne Datei kaputt/verschlüsselt: melden und mit dem Rest weitermachen
          if (failed.file && want.has(failed.file)) { want.delete(failed.file); flow.need.delete(failed.file); post({ type: 'fail', name: failed.file, message: text(failed), reason: failed.reason || '' }); continue; }
          for (const n of want) post({ type: 'fail', name: n, message: text(failed), reason: failed.reason || '' });
          want.clear();
        }
        for (const n of want) post({ type: 'fail', name: n, message: 'nicht im Archiv gefunden' });
        post({ type: 'done' });
      }
    } catch (e) {
      post({ type: 'error', message: text(e), reason: (e && e.reason) || '' });
    }
  };
}
