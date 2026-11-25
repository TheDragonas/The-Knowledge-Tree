'use strict';
/* Exportieren: Seiten, Abschnitte und Notizbücher gezielt auswählen.
 * Formate: PDF (über den Druckdialog), Webseite (eine HTML-Datei), KnowledgeTree-Datei (verlustfrei, wie ein Backup),
 * OneNote (.one für einen Abschnitt, .onepkg für ein Notizbuch – Beta, siehe onenote-write.js). */

const EXPORT_FORMATS = [
  { id: 'pdf', label: 'PDF', icon: 'filePdf', text: 'Zum Drucken und Weitergeben. Es öffnet sich der Druckdialog – dort „Als PDF speichern“ wählen.' },
  { id: 'html', label: 'Webseite (HTML)', icon: 'globe', text: 'Eine einzige Datei für jeden Browser, mit Inhaltsverzeichnis, Bildern und Anhängen – nur zum Ansehen, frei zoombar (1–1000 %, Strg + Mausrad oder Knöpfe unten rechts). Zum Wieder-Einlesen „KnowledgeTree-Datei → Interaktiv (.html)“ wählen.' },
  { id: 'kt', label: 'KnowledgeTree-Datei', icon: 'archive', text: 'Verlustfrei mit allen Bildern und Anhängen. Im Browser und im Windows-Programm mit „Datei → Importieren“ wieder als Notizbuch einlesen.' },
  { id: 'office', label: 'Office-Datei', icon: 'page', text: 'Word-, Excel- und PowerPoint-Seiten als ihre Datei – Dateityp je Programm wählbar (voreingestellt das neueste: .docx/.xlsx/.pptx, verlustfrei, Unverändertes Byte für Byte wie importiert). Eine Seite = die Datei, mehrere = ein ZIP. Andere Seiten werden übersprungen (als KnowledgeTree-Seite: Format „KnowledgeTree-Datei“).' },
  { id: 'one', label: 'OneNote', icon: 'oneNote', text: 'Ein Abschnitt wird zur .one-Datei, mehrere zu einem Notizbuch (.onepkg). Beta – bitte in OneNote prüfen.' },
];
const KIND_ICON = { notebook: 'book', group: 'folder', section: 'page', quick: 'bolt' };

const Export = {
  sel: new Set(),
  open: false,

  /* ---------------------------------------------------------- Dialog */
  show(preset = {}) {
    if (!Store.complete) return Store.gate(() => this.show(preset));   // alle Seiten nötig (Laden in Stufen, 1.30)
    if (Store.readOnly) return;
    Canvas.stopEditing();
    Hist.flushPending();
    const curPid = Canvas.pageId;
    const curSec = curPid ? Tree.groupOfPage(curPid) : Tree.group(Store.ui.currentGroup);
    const curNb = curSec ? Tree.notebookOf(curSec.id) : null;
    this.sel = new Set();
    if (preset.pages) preset.pages.forEach(p => this.sel.add(p));
    else if (preset.group) { const g = Tree.group(preset.group); if (g) Tree.pagesDeep(g).forEach(p => this.sel.add(p)); }
    else if (curPid) this.sel.add(curPid);
    let format = Store.ui.exportFormat || 'pdf';
    const open = new Set(); // aufgeklappte Knoten
    for (const g of Store.groups) if (g.kind === 'notebook' && !g.closed) open.add(g.id);
    if (curSec) for (const g of Tree.path(curSec.id)) open.add(g.id);
    if (preset.group) for (const g of Tree.path(preset.group)) open.add(g.id);

    return UI.dialog((d, close) => {
      d.classList.add('ex-dlg');
      d.append(el('h2', { text: 'Exportieren' }));
      // Format
      const fmts = el('div', { class: 'ex-fmts' });
      const fmtText = el('div', { class: 'ex-fmt-text' });
      const opts = el('div', { class: 'ex-opts' });
      const renderFormats = () => {
        fmts.innerHTML = '';
        for (const f of EXPORT_FORMATS) {
          const b = el('button', { class: 'ex-fmt' + (f.id === format ? ' on' : ''), type: 'button', html: icon(f.icon, 22) + `<span>${escapeHtml(f.label)}</span>` });
          b.addEventListener('click', () => { format = f.id; renderFormats(); renderOpts(); });
          fmts.append(b);
        }
        fmtText.textContent = EXPORT_FORMATS.find(f => f.id === format).text;
      };
      const o = { paper: Store.ui.exportPaper || 'a4-hoch', fit: Store.ui.exportFit || 'breite', head: Store.ui.exportHead !== false, bg: !!Store.ui.exportBg, kt: Store.ui.exportKt || 'html' };
      const renderOpts = () => {
        opts.innerHTML = '';
        if (format === 'pdf') {
          const paper = el('select', {}, ...[['a4-hoch', 'A4 hoch'], ['a4-quer', 'A4 quer'], ['a3-hoch', 'A3 hoch'], ['a3-quer', 'A3 quer'], ['letter-hoch', 'Letter hoch']].map(([v, l]) => el('option', { value: v, text: l, selected: v === o.paper })));
          paper.addEventListener('change', () => { o.paper = paper.value; });
          const fit = el('select', {}, ...[['breite', 'an Blattbreite anpassen'], ['blatt', 'ganze Seite auf ein Blatt'], ['original', 'Originalgrösse (100 %)']].map(([v, l]) => el('option', { value: v, text: l, selected: v === o.fit })));
          fit.addEventListener('change', () => { o.fit = fit.value; });
          opts.append(el('label', { class: 'ex-opt' }, 'Papier ', paper), el('label', { class: 'ex-opt' }, 'Grösse ', fit));
        }
        if (format === 'pdf' || format === 'html') {
          const head = el('input', { type: 'checkbox' }); head.checked = o.head;
          head.addEventListener('change', () => { o.head = head.checked; });
          const bg = el('input', { type: 'checkbox' }); bg.checked = o.bg;
          bg.addEventListener('change', () => { o.bg = bg.checked; });
          opts.append(el('label', { class: 'ex-opt' }, head, 'Titel und Datum'), el('label', { class: 'ex-opt' }, bg, 'Punkte/Linien der Seite'));
        }
        if (format === 'kt') {
          // seit 1.25: Interaktiv (ganzes KnowledgeTree als eine HTML-Datei), kompakt (.zip) oder .json wie bis 1.23
          const KT = [['html', 'Interaktiv (.html)', 'Ein vollständiges KnowledgeTree mit nur dieser Auswahl – öffnet sich per Doppelklick im Browser (ansehen, suchen, bearbeiten, wieder speichern).'],
            ['zip', 'Kompakt (.zip)', 'Kleinste Datei – gleiches Format wie die Abschnitte in einem Backup.'],
            ['json', 'JSON (.json)', 'Wie bis Version 1.23 – auch für ältere KnowledgeTree-Versionen (grösser).']];
          const note = el('div', { class: 'ex-note' });
          const name = uid('kt');
          const box = el('div', { class: 'ex-kt' }, el('span', { class: 'ex-opt-l', text: 'Speichern als' }), ...KT.map(([v, l]) => {
            const r = el('input', { type: 'radio', name, value: v });
            r.checked = o.kt === v;
            r.addEventListener('change', () => { if (r.checked) { o.kt = v; note.textContent = KT.find(x => x[0] === v)[2]; } });
            return el('label', { class: 'ex-opt' }, r, l);
          }));
          note.textContent = (KT.find(x => x[0] === o.kt) || KT[0])[2];
          opts.append(box, note);
        }
        if (format === 'office' && typeof OfficeIO !== 'undefined') opts.append(OfficeIO.exportOpts(o));
        if (format === 'one') opts.append(el('div', { class: 'ex-note', html: 'Text mit Formatierung, Überschriften, Listen, Bilder, Freihand und Formen kommen an derselben Stelle an. Verbindungen, Pakete und Feldrahmen gibt es in OneNote nicht – sie werden zu Zeichnungen. Tabellen werden echte OneNote-Tabellen (Rechentabellen mit den angezeigten Werten; Formeln, Formate und Diagrammdaten stecken versteckt im Alternativtext und kommen beim Rückimport wieder), Diagramme werden Bilder, Formeln LaTeX-Text, Anhänge ihr Name.<br>Öffnen: <b>.one</b> bzw. <b>.onepkg</b> doppelklicken (OneNote für Windows).' }));
      };
      // Auswahl
      const presets = el('div', { class: 'ex-presets' });
      const P = (label, fn, ok = true) => { const b = el('button', { class: 'btn small', type: 'button', text: label, disabled: !ok }); b.addEventListener('click', () => { fn(); refresh(); }); presets.append(b); };
      const setAll = (ids, on) => ids.forEach(p => on ? this.sel.add(p) : this.sel.delete(p));
      P('Diese Seite', () => { this.sel.clear(); if (curPid) this.sel.add(curPid); }, !!curPid);
      P('Dieser Abschnitt', () => { this.sel.clear(); setAll(curSec.pages, true); open.add(curSec.id); }, !!curSec);
      P('Dieses Notizbuch', () => { this.sel.clear(); setAll(Tree.pagesDeep(curNb), true); }, !!curNb);
      P('Alles', () => { this.sel.clear(); Store.groups.forEach(g => setAll(Tree.pagesDeep(g), true)); });
      P('Nichts', () => this.sel.clear());
      const treeEl = el('div', { class: 'ex-tree' });
      const sum = el('div', { class: 'ex-sum' });
      const state = (ids) => { let n = 0; for (const p of ids) if (this.sel.has(p)) n++; return n === 0 ? 0 : n === ids.length ? 2 : 1; };
      const childPages = (sec, i) => { const out = [sec.pages[i]]; const L = Store.pages[sec.pages[i]].level || 0; for (let j = i + 1; j < sec.pages.length && (Store.pages[sec.pages[j]].level || 0) > L; j++) out.push(sec.pages[j]); return out; };
      const row = (depth, html, ids, onToggle, extra) => {
        const r = el('div', { class: 'ex-row', style: { paddingLeft: (8 + depth * 18) + 'px' } });
        const cb = el('input', { type: 'checkbox' });
        const st = state(ids);
        cb.checked = st === 2; cb.indeterminate = st === 1; cb.disabled = !ids.length;
        cb.addEventListener('change', () => { setAll(ids, st !== 2); refresh(); });
        r.append(extra || el('span', { class: 'ex-tw' }), cb, el('span', { class: 'ex-name', html }));
        r.addEventListener('click', (e) => { if (e.target === cb || e.target.closest('.ex-tw')) return; if (onToggle) onToggle(); else if (ids.length) { setAll(ids, st !== 2); refresh(); } });
        return r;
      };
      const renderNode = (g, depth) => {
        const ids = Tree.pagesDeep(g);
        const hasKids = g.groups.length || g.pages.length;
        const tw = el('span', { class: 'ex-tw' + (hasKids ? '' : ' none'), html: hasKids ? icon(open.has(g.id) ? 'chevDown' : 'chevRight', 12) : '' });
        tw.addEventListener('click', () => { if (open.has(g.id)) open.delete(g.id); else open.add(g.id); refresh(); });
        const dot = g.kind === 'section' || g.kind === 'quick' ? `<i class="ex-dot" style="background:${escapeHtml(g.color || '#8a8886')}"></i>` : icon(KIND_ICON[g.kind] || 'folder', 14);
        treeEl.append(row(depth, `${dot}<b>${escapeHtml(g.name)}</b><small>${ids.length ? ids.length + ' Seite' + (ids.length === 1 ? '' : 'n') : 'leer'}${g.closed ? ' · geschlossen' : ''}</small>`, ids, () => tw.click(), tw));
        if (!open.has(g.id)) return;
        for (const c of g.groups) renderNode(c, depth + 1);
        g.pages.forEach((pid, i) => {
          const p = Store.pages[pid];
          if (!p) return;
          const lv = p.level || 0;
          const ids2 = childPages(g, i);
          treeEl.append(row(depth + 1 + lv, `${icon('page', 13)}<span>${escapeHtml(p.title || 'Unbenannte Seite')}</span>${ids2.length > 1 ? `<small>+${ids2.length - 1} Unterseite${ids2.length > 2 ? 'n' : ''}</small>` : ''}`, ids2, null));
        });
      };
      const refresh = () => {
        const top = treeEl.scrollTop;
        treeEl.innerHTML = '';
        for (const g of Store.groups) renderNode(g, 0);
        treeEl.scrollTop = top;
        const secs = Tree.sections().filter(s => s.pages.some(p => this.sel.has(p)));
        const nbs = new Set(secs.map(s => (Tree.notebookOf(s.id) || s).id));
        sum.textContent = this.sel.size ? `Ausgewählt: ${this.sel.size} Seite${this.sel.size === 1 ? '' : 'n'} aus ${secs.length} Abschnitt${secs.length === 1 ? '' : 'en'}${nbs.size > 1 ? ` in ${nbs.size} Notizbüchern` : ''}` : 'Nichts ausgewählt';
        go.disabled = !this.sel.size;
      };
      const go = el('button', { class: 'btn primary', text: 'Exportieren', autofocus: true, onclick: () => close({ format, o }) });
      d.append(el('div', { class: 'ex-label', text: 'Format' }), fmts, fmtText, opts,
        el('div', { class: 'ex-label', text: 'Was soll exportiert werden?' }), presets, treeEl, sum,
        el('div', { class: 'dlg-btns' }, el('button', { class: 'btn', text: 'Abbrechen', onclick: () => close(null) }), go));
      renderFormats(); renderOpts(); refresh();
    }, { wide: true }).then(async (res) => {
      if (!res) return;
      Store.ui.exportFormat = res.format;
      Object.assign(Store.ui, { exportPaper: res.o.paper, exportFit: res.o.fit, exportHead: res.o.head, exportBg: res.o.bg, exportKt: res.o.kt });
      if (res.o.officeTypes) Store.ui.exportOfficeTypes = res.o.officeTypes;
      UiState.saveSoon();
      await this.run(res.format, res.o);
    });
  },

  /* Auswahl als beschnittener Baum (nur Knoten mit ausgewählten Seiten) */
  pruned(list = Store.groups) {
    const out = [];
    for (const g of list) {
      const pages = g.pages.filter(p => this.sel.has(p) && Store.pages[p]);
      const groups = this.pruned(g.groups);
      if (!pages.length && !groups.length) continue;
      out.push({ id: g.id, name: g.name, color: g.color || '', kind: g.kind, pages, groups });
    }
    return out;
  },
  /* Seiten der Auswahl in Baum-Reihenfolge, mit Pfad */
  ordered(tree) {
    const out = [];
    const walk = (list, path) => { for (const g of list) { for (const p of g.pages) out.push({ pid: p, path: [...path, g] }); walk(g.groups, [...path, g]); } };
    walk(tree, []);
    return out;
  },
  exportName(tree) {
    if (this.sel.size === 1) return Store.pages[[...this.sel][0]].title || 'Seite';
    let t = tree;
    const names = [];
    while (t.length === 1) { names.push(t[0].name); if (t[0].pages.length) break; t = t[0].groups; }
    return names.length ? names[names.length - 1] : 'KnowledgeTree-Export';
  },
  safe(name) { return String(name || 'Export').replace(/[<>:"/\\|?*\u0000-\u001f]+/g, '_').replace(/\s+/g, ' ').trim().slice(0, 80) || 'Export'; },
  download(name, blob) {
    const a = el('a', { href: URL.createObjectURL(blob), download: name });
    document.body.append(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
  },

  /* ---------------------------------------------------------- Ablauf */
  async run(format, o) {
    if (!Store.complete) return Store.gate(() => this.run(format, o));   // alle Seiten nötig (Laden in Stufen, 1.30)
    await Save.flushAll();
    const tree = this.pruned();
    const list = this.ordered(tree);
    if (!list.length) return;
    const name = this.exportName(tree);
    const prog = this.progress('Exportieren …');
    try {
      if (format === 'kt') await this.toKt(tree, name, prog, o.kt || Store.ui.exportKt || 'html');
      else if (format === 'html') await this.toHtml(tree, list, name, o, prog);
      else if (format === 'pdf') await this.toPdf(list, name, o, prog);
      else if (format === 'one') await this.toOneNote(tree, name, prog);
      else if (format === 'office') await OfficePages.exportPages(list.map(x => x.pid), name, false, o.officeTypes || Store.ui.exportOfficeTypes || null);
    } catch (e) {
      if (e && e.cancelled) UI.toast('Export abgebrochen', 3000);
      else { console.error(e); UI.toast('Export fehlgeschlagen: ' + e.message, 5000); }
    } finally { prog.close(); this.cancelled = false; }
  },
  /* Fortschritt mit „Abbrechen“ (seit 1.22): setzt Export.cancelled – die Schleifen (renderEach, Bilder, PDF-Teile)
     prüfen das über checkCancel() und brechen mit einem Fehler { cancelled: true } ab, ohne etwas herunterzuladen. */
  cancelled: false,
  checkCancel() { if (this.cancelled) throw Object.assign(new Error('Export abgebrochen'), { cancelled: true }); },
  progress(title) {
    this.cancelled = false;
    const back = el('div', { class: 'dlg-back ex-busy' });
    const txt = el('div', { class: 'ex-busy-text', text: title });
    const bar = el('div', { class: 'ex-bar' }, el('i'));
    const stop = el('button', { class: 'btn', text: 'Abbrechen', onclick: () => { this.cancelled = true; stop.disabled = true; stop.textContent = 'Wird abgebrochen …'; } });
    back.append(el('div', { class: 'dlg' }, el('h2', { text: title }), txt, bar, el('div', { class: 'dlg-btns' }, stop)));
    document.body.append(back);
    return {
      set(t, f) { txt.textContent = t; if (f != null) bar.firstChild.style.width = Math.round(f * 100) + '%'; },
      close() { back.remove(); },
      hide(on) { back.style.display = on ? 'none' : ''; },
    };
  },

  /* ---------------------------------------------------------- Dateien (Bilder, Anhänge) */
  assetNames(obj) {
    const s = typeof obj === 'string' ? obj : JSON.stringify(obj);
    return [...new Set(s.match(/[0-9a-f]{40}\.[a-z0-9]{1,8}/g) || [])];
  },
  async assetBlob(name) {
    try {
      if (Backend.imgBlob) { const b = await Backend.imgBlob(name); if (b) return b; }   // ohne Objekt-URL (1.18)
      const r = await fetch(await Backend.imgURL(name)); if (!r.ok) return null; return await r.blob();
    } catch (e) { return null; }
  },
  async assetData(name, cache) {
    if (cache && cache.has(name)) return cache.get(name);
    const b = await this.assetBlob(name);
    const u = b ? await blobToDataURL(b) : null;
    if (cache) cache.set(name, u);
    return u;
  },

  /* ---------------------------------------------------------- KnowledgeTree-Datei (ktfile.js)
   * fmt 'html': interaktive Datei (ganzes Programm + Daten, seit 1.25), 'zip': ZIP im Format des Saves-Ordners
   * (seit 1.24), 'json': wie bis 1.23. Alle drei lassen sich mit „Importieren“ oder „Backup laden“ einlesen. */
  async toKt(tree, name, prog, fmt = 'html') {
    const r = await KtFile.writeAs(fmt, { groups: tree, art: 'export', name, prog, check: () => this.checkCancel() });
    this.download(KtFile.exportName(name, fmt), r.blob);
    UI.toast(`${r.pages} Seite(n) als KnowledgeTree-Datei exportiert (${fmt === 'html' ? 'interaktiv, ' : ''}${KtFile.size(r.blob.size)}${r.missing ? `, ${r.missing} Bild(er) fehlten` : ''})`, 4000);
  },

  /* ---------------------------------------------------------- Seiten als statisches HTML */
  /* jede Seite der Reihe nach im Canvas darstellen (hell), danach alles wie vorher */
  async renderEach(list, prog, fn) {
    const origPid = Canvas.pageId;
    const origView = origPid && Store.ui.views[origPid] ? { ...Store.ui.views[origPid] } : null;
    const origTheme = document.body.dataset.theme;
    document.body.dataset.theme = 'hell';
    Contrast.raw = true;   // Originalfarben exportieren (keine Anzeige-Korrekturen)
    this.rendering = true;  // Vorschauen anderer Bereiche warten (Panes, 1.35)
    try {
      let k = 0;
      for (const it of list) {
        this.checkCancel();
        const page = Store.pages[it.pid];
        if (!page) continue;
        prog.set(`Seite ${++k} von ${list.length}: ${page.title || ''}`, (k - 1) / list.length);
        if (Backend.trimURLs) Backend.trimURLs(new Set(), 0);   // Bilder der vorigen Seite freigeben (1.18)
        Canvas.showPage(page);
        await this.waitImages($('#world'));
        Canvas.layout();
        Draw.render(true);   // alle Striche sofort (sonst kämen sie schrittweise)
        await nextFrame();
        await fn(page, it.pid, it);
      }
    } finally {
      Contrast.raw = false;
      document.body.dataset.theme = origTheme;
      if (origPid && origView) Store.ui.views[origPid] = origView;
      Canvas.load(origPid);
      this.rendering = false;
      if (typeof Panes !== 'undefined') Panes.refreshAll();   // ihre Bilder wurden eben freigegeben
    }
  },
  async waitImages(root, maxMs = 3000) {
    for (let t0 = Date.now(); Date.now() - t0 < maxMs;) {
      const imgs = [...root.querySelectorAll('img')];
      if (imgs.every(i => i.getAttribute('src') && i.complete)) return;
      await new Promise(r => setTimeout(r, 75));
    }
  },
  async snapshot(page, cache, opts = {}) {
    let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
    const add = (r) => { if (!r) return; x1 = Math.min(x1, r.x); y1 = Math.min(y1, r.y); x2 = Math.max(x2, r.x + r.w); y2 = Math.max(y2, r.y + r.h); };
    // opts.only (Drucken → Auswahl, 1.26): nur diese Felder/Gruppen, ohne Zeichnungen und Verbindungen
    const only = opts.only && opts.only.size ? opts.only : null;
    for (const [id, r] of Canvas.rects) if (!only || only.has(id)) add(r);
    if (!only) {
      for (const d of page.drawings) { const b = DG.bbox(d); add({ x: b.x - d.w, y: b.y - d.w, w: b.w + 2 * d.w, h: b.h + 2 * d.w }); }
      for (const pts of Canvas.linkGeo ? Canvas.linkGeo.values() : []) for (const q of pts || []) add({ x: q.x - 6, y: q.y - 6, w: 12, h: 12 });
    }
    if (x1 === Infinity) { x1 = y1 = 0; x2 = 300; y2 = 100; }
    const M = 16;
    x1 = Math.floor(x1 - M); y1 = Math.floor(y1 - M); x2 = Math.ceil(x2 + M); y2 = Math.ceil(y2 + M);
    // Druckbereich (Drucken, 1.30): Kanten nach innen (+) oder aussen (−) verschoben, in Seiten-px
    if (opts.crop && typeof Print !== 'undefined' && Print.hasCrop(opts.crop)) { const c = Print.cropBox(x1, y1, x2 - x1, y2 - y1, opts.crop); x1 = c.x1; y1 = c.y1; x2 = x1 + c.W; y2 = y1 + c.H; }
    // PDF: Blattaufteilung erst jetzt bekannt (Grösse der Seite) – opts.slices(W, H) → [[von, bis], …] in Seiten-px
    const slices = typeof opts.slices === 'function' ? opts.slices(x2 - x1, y2 - y1) : null;
    // Kopie ohne Bildquellen anlegen (die Bilder sollen in der Kopie nicht noch einmal geladen werden)
    const live = $('#world');
    const srcs = [...live.querySelectorAll('img[src]')].map(i => [i, i.getAttribute('src')]);
    for (const [i] of srcs) i.removeAttribute('src');
    const world = live.cloneNode(true);
    for (const [i, u] of srcs) i.setAttribute('src', u);
    world.removeAttribute('id');
    world.className = 'kt-world';
    world.style.transform = `translate(${-x1}px, ${-y1}px)`;
    world.querySelectorAll('#layer-tools, #layer-handles, #layer-overlay, .sock, .box-rs, .fimg-rs, .link-hit, .box-lock, .pkg-lock, .ui-only, .xl-title, .ch-guide').forEach(x => x.remove());
    world.querySelectorAll('.xl-on').forEach(x => x.classList.remove('xl-on'));
    if (only) {
      world.querySelectorAll('.box[data-id], .pkg[data-id]').forEach(x => { if (!only.has(x.dataset.id)) x.remove(); });
      world.querySelectorAll('#layer-links, #layer-draw-under, #layer-draw-mark, #layer-draw-over').forEach(x => x.remove());
    }
    if (opts.prep) opts.prep(world, live);   // Seitenansicht einer Word-Seite (1.74): Ebenen ohne id, ohne Blätter
    world.querySelectorAll('[contenteditable]').forEach(x => x.removeAttribute('contenteditable'));
    world.querySelectorAll('[spellcheck]').forEach(x => x.removeAttribute('spellcheck'));
    world.querySelectorAll('[title]').forEach(x => x.removeAttribute('title'));
    world.querySelectorAll('.sel, .editing').forEach(x => x.classList.remove('sel', 'editing'));
    // Bilder einbetten
    const emb = [];
    for (const img of world.querySelectorAll('img')) {
      let name = img.dataset.ktSrc;
      if (!name) {
        const f = img.closest('.fimg'), bx = img.closest('.box');
        const b = bx && page.boxes.find(q => q.id === bx.dataset.id);
        const im = b && f && b.images.find(q => q.id === f.dataset.img);
        name = im && im.src;
      }
      // Webseite (1.26): Bilder, die auf mehreren Seiten vorkommen, nur einmal in die Datei (opts.shared)
      const sh = name && opts.shared && opts.shared.uses.get(name) > 1 ? await opts.shared.ref(name) : null;
      const u = sh != null ? null : name ? (opts.urls ? await this.assetURL(name, opts.urls) : await this.assetData(name, cache)) : null;
      // nicht als src setzen: sonst lädt (und entschlüsselt) der Browser jedes Bild der Kopie und hält es im
      // Speicher – erst im fertigen Text einsetzen (1.18)
      img.removeAttribute('src');
      if (sh != null) img.setAttribute('data-kt-i', String(sh));
      else if (u) { img.setAttribute('data-kt-emb', String(emb.length)); emb.push(u); }
      img.removeAttribute('data-kt-src');
    }
    // Videos: Vorschaubild öffnet das Video
    for (const f of world.querySelectorAll('.fimg.is-video')) {
      const bx = f.closest('.box'), b = bx && page.boxes.find(q => q.id === bx.dataset.id);
      const im = b && b.images.find(q => q.id === f.dataset.img);
      if (!im || !im.video) continue;
      const a = document.createElement('a');
      a.href = im.video; a.target = '_blank'; a.rel = 'noopener'; a.className = 'kt-vlink'; a.title = im.title || im.video;
      f.querySelector('.fimg-play')?.remove();
      a.append(...f.childNodes, Object.assign(document.createElement('i'), { className: 'kt-play' }));
      f.append(a);
    }
    for (const v of world.querySelectorAll('.kt-video[data-video]')) {
      const a = document.createElement('a');
      a.href = v.dataset.video; a.target = '_blank'; a.rel = 'noopener'; a.className = 'kt-video'; a.title = v.dataset.title || v.dataset.video;
      a.append(...v.childNodes);
      v.replaceWith(a);
    }
    // Anhänge als Download-Link
    for (const a of world.querySelectorAll('a.kt-file')) {
      const n = a.dataset.ktFile;
      const sh = n && opts.attachments !== false && opts.shared && opts.shared.uses.get(n) > 1 ? await opts.shared.ref(n, 25e6) : null;
      const b = sh == null && n && opts.attachments !== false ? await this.assetBlob(n) : null;
      if (sh != null) { a.setAttribute('data-kt-i', String(sh)); a.setAttribute('download', a.dataset.name || n); }
      else if (b && b.size < 25e6) { a.setAttribute('href', await blobToDataURL(b)); a.setAttribute('download', a.dataset.name || n); }
      a.removeAttribute('data-kt-file');
    }
    for (const a of world.querySelectorAll('.box-text a[href]:not(.kt-file)')) { a.setAttribute('target', '_blank'); a.setAttribute('rel', 'noopener'); }
    const fill = (h) => h.replace(/data-kt-emb="(\d+)"/g, (m, k) => `src="${emb[+k]}"`);
    if (slices) return { parts: this.sliceWorld(world, page, slices, x1, y1).map(fill), slices, x1, y1, W: x2 - x1, H: y2 - y1 };
    return { html: fill(world.outerHTML), x1, y1, W: x2 - x1, H: y2 - y1 };
  },
  /* PDF (seit 1.22): die Seite selbst in Blätter schneiden. Vorher teilte der Druck die lange Seite auf – dabei
     schiebt Chrome Bilder und Textzeilen, die über einen Blattrand gingen, aufs nächste Blatt, die Freihand-Ebene
     (ein SVG) aber nicht: von Blatt zu Blatt lagen Text, Bilder und Freihand weiter auseinander. Jetzt ist jedes Blatt
     ein eigener Ausschnitt (überlaufend abgeschnitten) – alles bleibt genau übereinander, wie im Canvas.
     Je Blatt bleiben nur Textfelder und Striche, die hineinragen (die Bilder kommen über Objekt-URLs, nicht doppelt). */
  sliceWorld(world, page, slices, x1, y1) {
    const rect = (id) => Canvas.rects && Canvas.rects.get(id);
    const dbox = new Map();
    for (const d of page.drawings) { try { const b = DG.bbox(d); const w = d.w || 2; dbox.set(d.id, { y: b.y - w, h: b.h + 2 * w }); } catch (e) { /* */ } }
    return slices.map(([a, b]) => {
      const lo = y1 + a - 4, hi = y1 + b + 4;
      const w = world.cloneNode(true);
      for (const bx of w.querySelectorAll('#layer-boxes > .box[data-id], .box[data-id]')) {
        const r = rect(bx.dataset.id);
        if (r && (r.y + r.h < lo || r.y > hi)) bx.remove();
      }
      for (const g of w.querySelectorAll('g[data-d]')) {
        const r = dbox.get(g.getAttribute('data-d'));
        if (r && (r.y + r.h < lo || r.y > hi)) g.remove();
      }
      w.style.transform = `translate(${-x1}px, ${-(y1 + a)}px)`;
      return w.outerHTML;
    });
  },
  /* Bild für den Druck als Objekt-URL (einmal je Bild, nach dem Drucken freigegeben) */
  async assetURL(name, urls) {
    if (urls.has(name)) return urls.get(name);
    const b = await this.assetBlob(name);
    const u = b ? URL.createObjectURL(b) : null;
    urls.set(name, u);
    return u;
  },
  pageBg(p, s, withLines) {
    const css = [`background-color:${p.color || '#ffffff'}`];
    if (!withLines) return css.join(';');
    const [kind, size] = (p.bg || 'keiner').split('-');
    const step = { punkte: 20, raster: { s: 12, m: 20, l: 32 }[size || 'm'], linien: { s: 16, m: 24, l: 36 }[size || 'm'] }[kind];
    if (!step) return css.join(';');
    css.push(`background-position:${-s.x1}px ${-s.y1}px`);
    if (kind === 'punkte') css.push(`background-image:radial-gradient(circle at ${step / 2}px ${step / 2}px, var(--dot) 1.15px, transparent 1.75px)`, `background-size:${step}px ${step}px`);
    if (kind === 'raster') css.push('background-image:linear-gradient(to right, var(--gridline) 1px, transparent 1px), linear-gradient(to bottom, var(--gridline) 1px, transparent 1px)', `background-size:${step}px ${step}px`);
    if (kind === 'linien') css.push('background-image:linear-gradient(to bottom, var(--gridline) 1px, transparent 1px)', `background-size:100% ${step}px`);
    return css.join(';');
  },
  async appCss() {
    const inline = document.getElementById('kt-css');
    let css = inline ? inline.textContent : '';
    if (!css) { try { css = await (await fetch('app.css')).text(); } catch (e) { /* */ } }
    return css.replace(/url\((['"]?)[^)'"]*icon\.svg\1\)/g, 'none').replace(/url\('data:image\/svg\+xml[^']*'\)/g, 'none');
  },
  pageHtml(s, o, extraStyle = '') {
    const p = s.page;
    const head = o.head ? `<header class="kt-head"><h1>${escapeHtml(p.title || 'Unbenannte Seite')}</h1><div class="kt-meta">${escapeHtml(fmtDate(p.created))}</div></header>` : '';
    return `<section class="kt-page" id="s-${escapeHtml(s.pid)}" data-title="${escapeHtml(p.title || '')}">${head}` +
      `<div class="kt-sheet" style="${this.pageBg(p, s, o.bg)};${extraStyle}"><div class="kt-wrap" style="width:${s.W}px;height:${s.H}px">${s.html}</div></div></section>`;
  },
  /* eine Word-Seite als Webseite mit Seitenansicht (Speichern unter → Webseite, 1.74) – die Seite muss offen sein */
  async docHtml(page) {
    const css = await this.appCss();
    const geo = OfficeReader.geo(page);
    let sn;
    try { OfficeReader.annotate(page); sn = await this.snapshot(page, new Map(), { prep: (w, live) => OfficeReader.prep(w, live) }); } finally { OfficeReader.cleanup(page); }
    return `<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(geo.title)}</title>
<meta name="generator" content="KnowledgeTree"><style>${css}${this.EXPORT_CSS}${OfficeReader.CSS}body.kt-export{overflow:hidden!important;height:100vh!important}</style></head>
<body class="kt-export" data-theme="hell">${OfficeReader.section(geo, sn.html)}<script>${OfficeReader.script()}</script></body></html>`;
  },
  EXPORT_CSS: `
html,body{overflow:visible!important;height:auto!important;user-select:text;-webkit-user-select:text}
body.kt-export{background:#fff;color:var(--ink);margin:0;display:block}
.kt-world{position:absolute;left:0;top:0;transform-origin:0 0}
.kt-world .box-grip{display:none}
.kt-world .box-text,.kt-world .box-bar,.kt-world .fimg,.kt-world .pkg-head{cursor:auto}
.kt-world .box.plain:hover{border-color:transparent}
.kt-world .box-text a.kt-file{cursor:pointer}
.kt-vlink{display:block;position:relative;width:100%;height:100%;line-height:0}.kt-vlink img{width:100%;height:100%}
.kt-vlink .kt-play,a.kt-video .kt-play{position:absolute;left:50%;top:50%;width:56px;height:40px;margin:-20px 0 0 -28px;border-radius:10px;background:rgba(0,0,0,.62)}
.kt-vlink .kt-play::after,a.kt-video .kt-play::after{content:"";position:absolute;left:22px;top:11px;border-style:solid;border-width:9px 0 9px 15px;border-color:transparent transparent transparent #fff}
a.kt-video{position:relative;display:inline-block;line-height:0}
.kt-wrap{position:relative;overflow:hidden}
.kt-head{padding:22px 32px 8px}
.kt-head h1{font:300 26px var(--font-ui);margin:0 0 4px;color:var(--ink)}
.kt-meta{color:var(--ink-3);font:12px var(--font-ui)}
.kt-sheet{display:inline-block;min-width:100%}`,

  /* ---------------------------------------------------------- Zoomen in der Webseite (seit 1.29)
   * Wie im Programm 1 % bis 1000 %: Knöpfe unten rechts (−, Prozent = 100 %, +, an die Breite anpassen), Strg+Mausrad
   * bzw. Zwei-Finger-Geste auf dem Touchpad (um den Mauszeiger), Strg+Plus/Minus/0, Zwei Finger auf dem Handy.
   * Gezoomt werden die Seitenflächen (CSS zoom), Titel und Navigation bleiben gleich gross; Drucken immer 100 %. */
  ZOOM_CSS: `
.kt-zoom{position:fixed;right:14px;bottom:14px;z-index:50;display:flex;align-items:center;gap:2px;padding:3px;background:rgba(255,255,255,.95);border:1px solid #d2d0ce;border-radius:8px;box-shadow:0 2px 10px rgba(0,0,0,.15);font:12px var(--font-ui)}
.kt-zoom button{min-width:30px;height:28px;border:0;border-radius:5px;background:transparent;color:#323130;font:inherit;font-size:15px;cursor:pointer}
.kt-zoom button[data-z=val]{min-width:58px;font-size:12px}
.kt-zoom button:hover{background:#edebe9}
@media (pointer:coarse){.kt-zoom{right:10px;bottom:calc(10px + env(safe-area-inset-bottom,0px))}.kt-zoom button{min-width:42px;height:40px;font-size:18px}.kt-zoom button[data-z=val]{min-width:64px;font-size:13px}}
.kt-main,body.kt-export{touch-action:pan-x pan-y}
@media print{.kt-zoom{display:none}.kt-sheet{zoom:1!important}}`,
  ZOOM_JS: `(function(){var Z=1,MIN=0.01,MAX=10,main=document.querySelector('.kt-main'),multi=!!document.querySelector('.kt-nav');
function box(){return multi&&main&&main.scrollHeight>=main.clientHeight&&getComputedStyle(main).overflowY!=='visible'?main:(document.scrollingElement||document.documentElement);}
var bar=document.createElement('div');bar.className='kt-zoom';
bar.innerHTML='<button data-z="out" title="Verkleinern (Strg + Minus)">\u2212</button><button data-z="val" title="Zur\u00fcck auf 100 % (Strg + 0)">100 %</button><button data-z="in" title="Vergr\u00f6ssern (Strg + Plus, Strg + Mausrad)">+</button><button data-z="fit" title="An die Fensterbreite anpassen">\u2922</button>';
document.body.appendChild(bar);var val=bar.querySelector('[data-z=val]');
function set(z,cx,cy){z=Math.min(MAX,Math.max(MIN,z));var s=box(),r=s===main?main.getBoundingClientRect():{left:0,top:0};
if(cx==null){cx=r.left+s.clientWidth/2;cy=r.top+s.clientHeight/2;}
var px=s.scrollLeft+cx-r.left,py=s.scrollTop+cy-r.top,k=z/Z;Z=z;
[].forEach.call(document.querySelectorAll('.kt-sheet'),function(e){e.style.zoom=z;});
s.scrollLeft=px*k-(cx-r.left);s.scrollTop=py*k-(cy-r.top);val.textContent=Math.round(z*100)+' %';}
function fit(){var w=null;[].forEach.call(document.querySelectorAll('.kt-wrap'),function(e){if(w==null&&e.offsetParent)w=parseFloat(e.style.width);});if(w)set((box().clientWidth-32)/w);}
window.ktFit=function(){if(innerWidth>760)return;var w=null;[].forEach.call(document.querySelectorAll('.kt-wrap'),function(e){if(w==null&&e.offsetParent)w=parseFloat(e.style.width);});if(w&&w*Z>box().clientWidth-8)fit();};
if(document.readyState==='complete')window.ktFit();else window.addEventListener('load',function(){window.ktFit();});
bar.addEventListener('click',function(e){var b=e.target.closest('button');if(!b)return;var a=b.getAttribute('data-z');if(a==='in')set(Z*1.25);else if(a==='out')set(Z/1.25);else if(a==='val')set(1);else fit();});
window.addEventListener('wheel',function(e){if(!e.ctrlKey&&!e.metaKey)return;e.preventDefault();set(Z*Math.exp(-e.deltaY*(e.deltaMode?0.05:0.002)),e.clientX,e.clientY);},{passive:false});
window.addEventListener('keydown',function(e){if(!e.ctrlKey&&!e.metaKey)return;var k=e.key;if(k==='+'||k==='='){e.preventDefault();set(Z*1.25);}else if(k==='-'){e.preventDefault();set(Z/1.25);}else if(k==='0'){e.preventDefault();set(1);}});
var pts={},p0=null;function two(){var v=Object.keys(pts).map(function(k){return pts[k];});return v.length===2?v:null;}
window.addEventListener('pointerdown',function(e){if(e.pointerType!=='touch')return;pts[e.pointerId]={x:e.clientX,y:e.clientY};var t=two();if(t)p0={d:Math.hypot(t[0].x-t[1].x,t[0].y-t[1].y)||1,z:Z};});
window.addEventListener('pointermove',function(e){if(!pts[e.pointerId])return;pts[e.pointerId]={x:e.clientX,y:e.clientY};var t=two();if(t&&p0){set(p0.z*(Math.hypot(t[0].x-t[1].x,t[0].y-t[1].y)||1)/p0.d,(t[0].x+t[1].x)/2,(t[0].y+t[1].y)/2);}});
function up(e){delete pts[e.pointerId];if(!two())p0=null;}window.addEventListener('pointerup',up);window.addEventListener('pointercancel',up);
})();`,

  /* ---------------------------------------------------------- Webseite */
  async toHtml(tree, list, name, o, prog) {
    // seit 1.18: jede Seite sofort als Blob-Teil (Bilder je Seite eingebettet) – nicht alle Seiten auf einmal
    const css = await this.appCss();
    const multi = list.length > 1;
    let nav = '';
    if (multi) {
      const walk = (gs) => gs.map(g => `<li class="k-${g.kind}"><span class="kt-g">${g.kind === 'section' || g.kind === 'quick' ? `<i style="background:${escapeHtml(g.color || '#8a8886')}"></i>` : ''}${escapeHtml(g.name)}</span>` +
        (g.pages.length ? `<ul class="kt-pages">${g.pages.map(pid => `<li class="lv${Store.pages[pid].level || 0}"><a href="#s-${escapeHtml(pid)}">${escapeHtml(Store.pages[pid].title || 'Unbenannte Seite')}</a></li>`).join('')}</ul>` : '') +
        (g.groups.length ? `<ul>${walk(g.groups)}</ul>` : '') + '</li>').join('');
      nav = `<nav class="kt-nav"><div class="kt-brand">${escapeHtml(name)}</div><ul class="kt-tree">${walk(tree)}</ul><div class="kt-foot">Exportiert aus KnowledgeTree · ${escapeHtml(fmtShortDate(Date.now()))}</div></nav>`;
    }
    const navCss = multi ? `
body.kt-export{display:flex;min-height:100vh}
.kt-nav{position:sticky;top:0;align-self:flex-start;width:260px;flex:none;height:100vh;overflow:auto;background:#faf9f8;border-right:1px solid var(--line);font:13px var(--font-ui);padding:14px 10px;box-sizing:border-box}
.kt-brand{font-weight:600;font-size:15px;padding:2px 8px 10px}
.kt-nav ul{list-style:none;margin:0;padding:0 0 0 12px}.kt-tree{padding:0!important}
.kt-g{display:flex;align-items:center;gap:6px;padding:4px 8px;font-weight:600;color:var(--ink-2)}
.kt-g i{width:10px;height:10px;border-radius:2px;flex:none}
.kt-pages a{display:block;padding:4px 8px;border-radius:4px;color:var(--ink);text-decoration:none;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.kt-pages a:hover{background:var(--hover)}.kt-pages a.on{background:var(--accent-soft);color:var(--accent-ink);font-weight:600}
.kt-pages .lv1 a{padding-left:22px}.kt-pages .lv2 a{padding-left:36px}
.kt-foot{color:var(--ink-3);font-size:11px;padding:16px 8px 4px}
.kt-main{flex:1;min-width:0;overflow:auto}
.kt-page{display:none}.kt-page.on{display:block}
/* Handy (1.30): Navigation als Schublade (☰ oben links), oben der Titel der Seite; die Seite nutzt die ganze Breite */
.kt-top,.kt-back{display:none}
@media (max-width:760px){
html{height:100%!important;overflow:hidden!important}
body.kt-export{display:flex;flex-direction:column;height:100vh!important;height:100dvh!important;min-height:0;overflow:hidden!important}
.kt-top{display:flex;align-items:center;gap:8px;flex:none;height:48px;padding:0 8px;background:#faf9f8;border-bottom:1px solid var(--line);font:600 15px var(--font-ui)}
.kt-top button{width:42px;height:40px;border:0;border-radius:8px;background:transparent;font-size:22px;color:var(--ink);flex:none}
.kt-top button:active{background:var(--hover)}
.kt-cur{flex:1;min-width:0;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
.kt-nav{position:fixed;left:0;top:0;bottom:0;z-index:60;width:min(84vw,320px);height:100vh;height:100dvh;transform:translateX(-102%);transition:transform .2s;box-shadow:2px 0 16px rgba(0,0,0,.2);font-size:15px}
body.nav-open .kt-nav{transform:none}
body.nav-open .kt-back{display:block;position:fixed;inset:0;z-index:55;background:rgba(0,0,0,.3)}
.kt-pages a{padding:9px 8px}.kt-g{padding:8px}
.kt-main{flex:1;min-height:0;-webkit-overflow-scrolling:touch}
.kt-page>h1,.kt-page .kt-meta{padding-left:14px;padding-right:14px}}
@media print{.kt-nav{display:none}.kt-page{display:block!important;break-after:page}}` : '';
    const script = multi ? `<script>
(function(){var secs=[].slice.call(document.querySelectorAll('.kt-page')),links=[].slice.call(document.querySelectorAll('.kt-nav a'));
function show(){var id=(location.hash||'').slice(1);var s=document.getElementById(id)||secs[0];secs.forEach(function(x){x.classList.toggle('on',x===s)});
links.forEach(function(a){a.classList.toggle('on',a.getAttribute('href')==='#'+s.id)});document.title=(s.getAttribute('data-title')||'')+' – ${escapeHtml(name).replace(/'/g, "\\'")}';
var cur=document.querySelector('.kt-cur');if(cur)cur.textContent=s.getAttribute('data-title')||'';window.scrollTo(0,0);var m=document.querySelector('.kt-main');if(m)m.scrollTop=m.scrollLeft=0;
document.body.classList.remove('nav-open');if(window.ktFit)window.ktFit();}
var mb=document.querySelector('.kt-menu');if(mb)mb.addEventListener('click',function(){document.body.classList.toggle('nav-open');});
var bk=document.querySelector('.kt-back');if(bk)bk.addEventListener('click',function(){document.body.classList.remove('nav-open');});
window.addEventListener('hashchange',show);show();})();
</script>` : '';
    const parts = [new Blob([`<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(name)}</title>
<meta name="generator" content="KnowledgeTree"><style>${css}${this.EXPORT_CSS}${navCss}${this.ZOOM_CSS}</style></head>
<body class="kt-export" data-theme="hell">${multi ? '<header class="kt-top"><button type="button" class="kt-menu" aria-label="Seiten" title="Seiten">☰</button><span class="kt-cur"></span></header><div class="kt-back"></div>' : ''}${nav}<main class="kt-main">`])];
    let n = 0;
    // Bilder/Anhänge, die auf mehreren Seiten vorkommen, nur einmal einbetten (1.26): beim ersten Vorkommen als
    // KTI[i] = "data:…" vor der Seite, die Seiten verweisen mit data-kt-i; ein kleines Skript am Ende setzt src/href.
    const uses = new Map();
    for (const it of list) { const p = Store.pages[it.pid]; if (p) for (const nm of this.assetNames(p)) uses.set(nm, (uses.get(nm) || 0) + 1); }
    const reg = new Map();
    let pending = [];
    const shared = {
      uses,
      async ref(nm, max) {
        if (reg.has(nm)) return reg.get(nm);
        const b = await this.assetBlob(nm);
        if (!b || (max && b.size >= max)) { reg.set(nm, null); return null; }
        const i = reg.size;
        reg.set(nm, i);
        pending.push(`KTI[${i}]="${await blobToDataURL(b)}";`);
        return i;
      },
      assetBlob: (nm) => this.assetBlob(nm),
    };
    parts.push(new Blob(['<script>var KTI=[];</script>']));
    let docs = 0;
    await this.renderEach(list, prog, async (page, pid, it) => {
      // Word-Seite (1.74): Seitenansicht wie ein PDF-Reader (eine/zwei/mehrere Seiten, Zoom, Suche) statt einer langen Fläche
      if (typeof OfficeReader !== 'undefined' && OfficeReader.isDoc(page)) {
        const geo = OfficeReader.geo(page);
        let sn;
        try { OfficeReader.annotate(page); sn = await this.snapshot(page, new Map(), { shared, prep: (w, live) => OfficeReader.prep(w, live) }); } finally { OfficeReader.cleanup(page); }
        if (pending.length) { parts.push(new Blob(['<script>' + pending.join('\n') + '</script>\n'])); pending = []; }
        parts.push(new Blob([`<section class="kt-page kt-docp" id="s-${escapeHtml(pid)}" data-title="${escapeHtml(page.title || '')}">${OfficeReader.section(geo, sn.html)}</section>\n`]));
        n++; docs++;
        return;
      }
      const sn = await this.snapshot(page, new Map(), { shared });
      if (pending.length) { parts.push(new Blob(['<script>' + pending.join('\n') + '</script>\n'])); pending = []; }
      parts.push(new Blob([this.pageHtml({ pid, path: it.path, page, ...sn }, o) + '\n']));
      n++;
    });
    prog.set('Webseite wird erstellt …', 1);
    const fillShared = reg.size ? `<script>[].forEach.call(document.querySelectorAll('[data-kt-i]'),function(e){var u=KTI[+e.getAttribute('data-kt-i')];if(!u)return;if(e.tagName==='A')e.setAttribute('href',u);else e.setAttribute('src',u);});</script>` : '';
    const rd = docs ? `<style>${OfficeReader.CSS}${multi ? '.kt-docp .kt-rd-exp{height:100vh;height:100dvh}@media (max-width:760px){.kt-docp .kt-rd-exp{height:calc(100dvh - 49px)}}' : ''}</style><script>${OfficeReader.script()}</script>` : '';
    parts.push(new Blob([`</main>${fillShared}${rd}${script}${docs < n ? `<script>${this.ZOOM_JS}</script>` : ''}</body></html>`]));
    this.download(`${this.safe(name)}.html`, new Blob(parts, { type: 'text/html' }));
    UI.toast(`${n} Seite(n) als Webseite exportiert`, 3500);
  },

  /* ---------------------------------------------------------- PDF (Druckdialog) */
  PAPER: { 'a4-hoch': [210, 297], 'a4-quer': [297, 210], 'a3-hoch': [297, 420], 'a3-quer': [420, 297], 'letter-hoch': [216, 279] },
  /* Seit 1.18 in Teilen: viele Seiten bzw. viele Bilder kommen in mehrere Druckaufträge („Teil 1 von 3“),
   * damit die Druckansicht nicht alle Bilder auf einmal laden muss. */
  PDF_PART_PAGES: 40, PDF_PART_BYTES: 60e6,
  /* Teile: höchstens 40 Seiten bzw. ~60 MB Bilder je Druckauftrag (Grösse aus dem Bildspeicher, ohne zu laden) */
  async pdfParts(list) {
    const parts = [];
    let cur = [], bytes = 0;
    const sizes = new Map();
    for (const it of list) {
      const p = Store.pages[it.pid];
      let n = 0;
      for (const nm of p ? this.assetNames(p) : []) {
        if (!sizes.has(nm)) { let z = 500e3; try { const b = Backend.imgBlob ? await Backend.imgBlob(nm) : null; if (b) z = b.size; } catch (e) { /* */ } sizes.set(nm, z); }
        n += sizes.get(nm);
      }
      if (cur.length && (cur.length >= this.PDF_PART_PAGES || bytes + n > this.PDF_PART_BYTES)) { parts.push(cur); cur = []; bytes = 0; }
      cur.push(it); bytes += n;
    }
    if (cur.length) parts.push(cur);
    return parts;
  },
  async toPdf(list, name, o, prog) {
    const parts = await this.pdfParts(list);
    for (let k = 0; k < parts.length; k++) {
      // zwischen den Teilen fragen – „Abbrechen“ im Druckdialog lässt sich nicht erkennen, und ohne Rückfrage
      // ging gleich der nächste Druckdialog auf (wirkte wie ein Neustart)
      if (k > 0) {
        prog.hide(true);
        const go = await UI.confirm(`Teil ${k} von ${parts.length} ist fertig`, `Weiter mit Teil ${k + 1} von ${parts.length} (je Teil ein eigenes PDF)?`, { ok: 'Weiter' });
        prog.hide(false);
        if (!go) { this.cancelled = true; this.checkCancel(); }
      }
      const label = parts.length > 1 ? `${name} (Teil ${k + 1} von ${parts.length})` : name;
      await this.toPdfPart(parts[k], label, o, { set: (t, f) => prog.set((parts.length > 1 ? `Teil ${k + 1} von ${parts.length}: ` : '') + t, f) });
    }
    if (parts.length > 1) UI.toast(`${list.length} Seiten in ${parts.length} Teilen gedruckt (je Teil ein PDF)`, 5000);
  },
  async toPdfPart(list, name, o, prog) {
    const css = await this.appCss();
    const [pw, ph] = this.PAPER[o.paper] || this.PAPER['a4-hoch'];
    const MARGIN = 12, PX = 96 / 25.4, HEAD = 64;
    // Blattmasse in CSS-px; etwas Luft, damit Chrome ein Blatt nie wegen Rundung auf zwei Blätter verteilt
    const availW = Math.floor((pw - 2 * MARGIN) * PX) - 2, fullH = Math.floor((ph - 2 * MARGIN) * PX) - 6;
    const urls = new Map();
    const body = [];
    try {
      await this.renderEach(list, prog, async (page, pid, it) => {
        let z = 1;
        const slices = (W, H) => {
          const first = fullH - (o.head ? HEAD : 0);
          if (o.fit === 'breite') z = Math.min(1, availW / W);
          if (o.fit === 'blatt') z = Math.min(1, availW / W, first / H);
          const out = [];
          for (let y = 0, k = 0; y < H - 0.5 || !out.length; k++) { const h = (k ? fullH : first) / z; out.push([y, Math.min(H, y + h)]); y += h; }
          return out;
        };
        const s = await this.snapshot(page, null, { slices, urls, attachments: false });
        body.push(this.pdfPageHtml({ pid, page, ...s }, o, z));
      });
      prog.set('Druckansicht wird vorbereitet …', 1);
      const html = `<!doctype html><html lang="de"><head><meta charset="utf-8"><title>${escapeHtml(name)}</title><style>${css}${this.EXPORT_CSS}
@page{size:${pw}mm ${ph}mm;margin:${MARGIN}mm}
body.kt-export{-webkit-print-color-adjust:exact;print-color-adjust:exact}
.kt-head{padding:0;height:${HEAD}px;box-sizing:border-box;overflow:hidden}.kt-head h1{font-size:22px}
.kt-page{break-after:page}.kt-page:last-child{break-after:auto}
.kt-slice{position:relative;overflow:hidden;break-inside:avoid;contain:strict}.kt-slice+.kt-slice{break-before:page}
.kt-slice>.kt-wrap{position:absolute;left:0;top:0;transform-origin:0 0}
.kt-world .box{box-shadow:none}
</style></head><body class="kt-export" data-theme="hell">${body.join('\n')}</body></html>`;
      body.length = 0;
      await this.printHtml(html, name);
    } finally {
      setTimeout(() => { for (const u of urls.values()) if (u) URL.revokeObjectURL(u); }, 2000);
    }
  },
  /* eine Seite als Folge von Blättern: Kopf (Titel, Datum) auf dem ersten, dann je Blatt ein Ausschnitt */
  pdfPageHtml(s, o, z) {
    const p = s.page;
    const head = o.head ? `<header class="kt-head"><h1>${escapeHtml(p.title || 'Unbenannte Seite')}</h1><div class="kt-meta">${escapeHtml(fmtDate(p.created))}</div></header>` : '';
    const W = s.W;
    const sheets = s.parts.map((html, k) => {
      const [a, b] = s.slices[k];
      const bg = this.pageBg(p, { x1: s.x1, y1: s.y1 + a }, o.bg);
      return `<div class="kt-slice" style="width:${(W * z).toFixed(2)}px;height:${((b - a) * z).toFixed(2)}px">` +
        `<div class="kt-wrap" style="width:${W}px;height:${(b - a).toFixed(2)}px;transform:scale(${z.toFixed(5)});${bg}">${html}</div></div>`;
    });
    return `<section class="kt-page" id="s-${escapeHtml(s.pid)}" data-title="${escapeHtml(p.title || '')}">${head}${sheets.join('')}</section>`;
  },
  printHtml(html, name) {
    return new Promise((resolve) => {
      const ifr = el('iframe', { class: 'ex-print', title: 'Druckansicht' });
      document.body.append(ifr);
      let done = false;
      const finish = () => { if (done) return; done = true; document.title = oldTitle; setTimeout(() => ifr.remove(), 500); resolve(); };
      const oldTitle = document.title;
      ifr.addEventListener('load', async () => {
        const w = ifr.contentWindow;
        try { await w.document.fonts.ready; } catch (e) { /* */ }
        // alle Bilder geladen und entschlüsselt, bevor gedruckt wird (vorher höchstens 3 s → bei vielen Bildern fehlten welche)
        await this.waitImages(w.document.body, 120000);
        await Promise.all([...w.document.images].map(i => (i.decode ? i.decode().catch(() => {}) : null)));
        document.title = this.safe(name);
        w.addEventListener('afterprint', finish);
        w.focus();
        w.print();
        // Chrome blockiert bis der Dialog zu ist; andere Browser nicht -> Rahmen erst später entfernen
        setTimeout(finish, /firefox/i.test(navigator.userAgent) ? 120000 : 1000);
      }, { once: true });
      ifr.srcdoc = html;
    });
  },

  /* ---------------------------------------------------------- OneNote */
  async toOneNote(tree, name, prog) {
    if (typeof OneWrite === 'undefined') throw new Error('OneNote-Export nicht verfügbar');
    const files = await OneWrite.exportTree(tree, name, (t, f) => prog.set(t, f), { blob: true });   // Blobs: kein Zusammenkopieren
    for (const f of files) this.download(f.name, f.data instanceof Blob ? f.data : new Blob([f.data], { type: 'application/octet-stream' }));
    UI.toast(files.length === 1 ? `Als ${files[0].name} exportiert (OneNote, Beta)` : `${files.length} OneNote-Dateien exportiert (Beta)`, 5000);
  },
};
