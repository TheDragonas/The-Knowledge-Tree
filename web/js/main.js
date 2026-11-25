'use strict';
/* Programmstart, Tastenkürzel, Seitenwechsel */

const App = {
  async boot() {
    if (typeof Plugins !== 'undefined') Plugins.syncBuiltins();   // eingebaute Add-Ins (Chem-Draw …) vor dem Menüband (1.69)
    Ribbon.build();
    Sidebar.init();
    Layout.init();
    Canvas.init();
    Draw.init();
    Sheet.init();
    this.initChrome();
    this.initKeys();
    UI.saveState('saved');
    this.earlyUi();   // Design, Menüband-Register, Breiten vom letzten Mal – noch bevor der Speicher antwortet (1.32)

    let data;
    try {
      data = await Backend.load({ stufen: true });
    } catch (e) {
      document.body.innerHTML = `<div style="padding:40px;font:14px Segoe UI"><h2>KnowledgeTree konnte nicht geladen werden</h2><p>${escapeHtml(e.message)}</p></div>`;
      return;
    }
    Store.info = data.info || {};
    // Einstellungen zuerst (Design, Breiten, Menüband) – sie stehen sofort, auch bevor eine Seite geladen ist (1.30)
    const early = this._early;
    Store.ui = this.normUi(data.zustand);
    const addinsChanged = typeof Plugins !== 'undefined' && Plugins.syncBuiltins();   // gespeicherte Häkchen der Add-Ins (1.69)
    if (addinsChanged) Ribbon.buildStrip();
    // nur neu zeichnen, was sich gegenüber dem früh gesetzten Stand geändert hat
    this.applyTheme();
    Sidebar.applyWidths();
    if (addinsChanged || !early || early.tab !== Store.ui.tab || JSON.stringify(early.pens) !== JSON.stringify(Store.ui.pens) || early.activePen !== Store.ui.activePen) Ribbon.show(Store.ui.tab || 'start');
    else Ribbon.refreshSoon();
    Layout.applyRibbon();
    this.rememberUi();

    // Seiten: Laden in Stufen (Browser und Programm) – sonst (interaktive Datei) alles wie bisher auf einmal
    const staged = Array.isArray(data.pageIds) && typeof Backend.loadPages === 'function';
    Store.pages = {};
    if (staged) Lazy.start(data.pageIds, data.meta || {});
    else {
      for (const [id, raw] of Object.entries(data.pages || {})) {
        const p = normPage(raw);
        if (p) { p.id = id; Store.pages[id] = p; }
      }
      for (const p of Object.values(Store.pages)) p.boxes = p.boxes.filter(b => !isEmptyBox(p, b));
    }
    const rawTree = JSON.stringify(data.groups || []);
    // Daten aus Version 1.1 (nur Gruppen, ohne Notizbücher/Abschnitte)?
    const legacy = Array.isArray(data.groups) && data.groups.length > 0 && !data.groups.some(g => g && g.kind);
    Store.groups = Tree.norm(data.groups || []);
    Settings.init();   // Sicherung, Seitenversionen (seit 1.24)
    const journal = (() => { try { return typeof ImportJournal !== 'undefined' ? ImportJournal.crashed() : null; } catch (e) { return null; } })();
    if (staged) {
      // Sonderfälle (alte Daten, abgestürzter Import) brauchen alle Seiten sofort; sonst nur die offene Seite und
      // ihren Abschnitt – der Rest kommt im Hintergrund
      // Reihenfolge im Hintergrund: aktuelles Notizbuch, dann die übrigen in Baumreihenfolge
      const curNb = Tree.notebookOf(Store.ui.currentGroup || '') || Tree.group(Store.ui.currentContainer || '');
      const all = [];
      for (const g of [curNb, ...Store.groups].filter(Boolean)) Tree.pagesDeep(g, all);
      if (legacy || journal) await Lazy.need(data.pageIds);
      else {
        // nur die offene Seite – Seitenlisten stehen dank der Kopfangaben schon (auch mit 500 Seiten); fehlen die
        // (Daten von vor 1.32), lädt die Seitenliste ihren Abschnitt selbst vor
        const cur = Store.ui.currentPage, sec = cur && Tree.groupOfPage(cur);
        const first = sec ? [cur] : ((Tree.group(Store.ui.currentGroup) || {}).pages || []).slice(0, 1);
        await Lazy.need(first);
        if (sec) all.unshift(...sec.pages);   // danach zuerst der offene Abschnitt
      }
      Lazy.order = all;
      // Verlauf (Rückgängig) erst nach dem ersten Bild – er kann gross sein
      if (data.verlauf === undefined && Backend.loadVerlauf) {
        Hist.waitLoad = true;
        Store.complete = false;
        Lazy.extra = new Promise(r => setTimeout(r, 0)).then(() => Backend.loadVerlauf()).catch(() => null).then((v) => {
          Hist.load(v, true);
          Hist.waitLoad = false;
          if (Hist._dropped || Hist.undo.length) Hist.persistSoon();
          UI.updateUndo();
        });
      }
    }

    let firstRun = false;
    if (!Store.groups.some(g => g.kind === 'notebook') && !Object.keys(Store.pages).length && !(Lazy.pending && Lazy.pending.size)) { Store.groups = []; this.createWelcome(); firstRun = true; }
    Tree.ensureQuick();
    // Ebenen der Unterseiten prüfen (Abschnitte mit fehlenden Seiten erst, wenn alles geladen ist)
    for (const s of Tree.sections()) if (!s.pages.some(id => Lazy.has(id))) Tree.normLevels(s);
    const migrated = !firstRun && JSON.stringify(Store.groups) !== rawTree;
    // Ist der letzte Import mittendrin abgestürzt? Dann das halb Importierte restlos entfernen (seit 1.20)
    let crash = null;
    try {
      if (journal) { crash = { j: journal, ...OneImport.removeCreated(journal.before) }; ImportJournal.clear(); }
    } catch (e) { console.warn('[KnowledgeTree] Import-Journal:', e); }

    // Verlauf aus Version 1.1 passt nicht zur neuen Struktur -> neu beginnen
    if (!legacy) Hist.load(data.verlauf);
    data = null;   // die geladenen Rohdaten nicht länger festhalten
    Hist.init();
    if (legacy || Hist._dropped) Hist.persistSoon();
    Store.loaded = true;

    UI.updateUndo();
    if (Store.info.warnung) { const w = $('#warnbar'); w.textContent = Store.info.warnung; w.hidden = false; }

    const pid = Store.pages[Store.ui.currentPage] ? Store.ui.currentPage : null;
    Panes.init();   // Tabs und geteilte Bereiche vom letzten Mal (1.35)
    if (pid) this.openPage(pid); else this.openFirstPage();
    Spell.init();   // Rechtschreibprüfung (1.38): Wörterbücher kommen nach dem Start
    if (typeof Grammar !== 'undefined') Grammar.init();   // Grammatik-Hinweise (1.66)
    if (typeof Fonts !== 'undefined') Fonts.init().catch(() => {});   // eigene Schriftarten (1.66)
    if (typeof Plugins !== 'undefined') Plugins.init().catch((e) => console.warn(e));   // Add-Ins (1.66)
    if (typeof OfficeWord !== 'undefined') OfficeWord.init();   // Word-Seiten: Statusleiste, Formatierungszeichen (1.67)
    Calc.init();
    if (typeof OfficeUI !== 'undefined') OfficeUI.init();   // Schnellzugriff, Rechtsklick im Menüband (1.73)

    // erster Start/Umzug: alles speichern – sofort, wenn alles geladen ist (interaktive Datei: noch vor „booted“,
    // sonst gälte die Datei gleich als geändert), beim Laden in Stufen danach
    const saveAll = () => { Save.treeDirty = true; for (const id of Object.keys(Store.pages)) Save.dirty.add(id); Save.flush(); };
    if (firstRun || migrated) { if (Store.complete) saveAll(); else Store.whenComplete().then(saveAll); }
    if (firstRun || migrated) {
      if (firstRun && Layout.mode !== 'phone') setTimeout(() => Canvas.fit(), 150);
      if (legacy) {
        setTimeout(() => UI.toast('Neu: Notizbücher, Abschnitte und Unterseiten – deine Gruppen wurden übernommen', 4500), 600);
      }
    }
    // übrige Seiten im Hintergrund nachladen; die Navigation zeigt sie, sobald sie da sind
    Lazy.onLoad = (ids) => this.pagesArrived(ids);
    Lazy.onComplete = () => this.allArrived();
    if (staged) { if (Lazy.pending.size) Lazy.kick(); else (Lazy.extra || Promise.resolve()).then(() => Lazy.finish()); }
    setInterval(() => this.ping(), 15000);
    this.ping();
    if (crash) this.afterCrash(crash);
    else setTimeout(() => this.cleanupStorage(), 8000);   // nicht mehr benutzte Bilder, Versionen gelöschter Seiten
    AutoBackup.init(firstRun);   // Browser: automatisches Backup bzw. Erinnerung (das Programm sichert selbst)
    this.booted = true;          // interaktive Datei: erst Änderungen danach gelten als „nicht gespeichert“
  },

  /* Einstellungen vervollständigen (gespeicherter Zustand oder früher Stand aus dem Browser) */
  normUi(z) {
    const u = { ...UI_DEFAULTS, ...(z && typeof z === 'object' ? z : {}) };
    if (u.tab === 'datei') u.tab = 'start';   // „Datei“ ist seit 1.34 ein eigenes Fenster
    for (const k of ['collapsed', 'lastPage', 'lastSection', 'views', 'collapsedPages']) if (typeof u[k] !== 'object' || !u[k] || Array.isArray(u[k])) u[k] = {};
    if (!Array.isArray(u.recent)) u.recent = [];
    if ((u.layoutV || 0) < 2) { u.pageListSide = 'links'; u.showTabs = false; u.layoutV = 2; }
    u.linkDefault = { ...UI_DEFAULTS.linkDefault, ...(u.linkDefault || {}) };
    u.ruler = { ...UI_DEFAULTS.ruler, ...(u.ruler || {}) };
    u.protractor = { ...UI_DEFAULTS.protractor, ...(u.protractor || {}) };
    if (!Array.isArray(u.pens) || u.pens.length !== DEFAULT_PENS.length) u.pens = JSON.parse(JSON.stringify(DEFAULT_PENS));
    return u;
  },
  /* Früher Stand (1.32): Design, Register, Breiten, Stifte vom letzten Mal aus localStorage – das Menüband ist so
   * schon bedienbar, bevor der Speicher (IndexedDB bzw. das Programm) antwortet. Danach gilt der gespeicherte Zustand. */
  EARLY_KEYS: ['theme', 'tab', 'ribbonMin', 'groupsW', 'pagesW', 'sidebar', 'pageListSide', 'showTabs', 'layoutV', 'pens', 'activePen', 'inkFix', 'pageHead', 'tabsMin', 'addins'],
  earlyUi() {
    let z = null;
    try { z = JSON.parse(localStorage.getItem('kt-ui') || 'null'); } catch (e) { z = null; }
    if (!z || typeof z !== 'object') return;
    Store.ui = this.normUi(z);
    this._early = Store.ui;
    if (typeof Plugins !== 'undefined' && Plugins.syncBuiltins()) Ribbon.buildStrip();
    this.applyTheme();
    Sidebar.applyWidths();
    Ribbon.show(Store.ui.tab || 'start');
    Layout.applyRibbon();
  },
  rememberUi() {
    try { const z = {}; for (const k of this.EARLY_KEYS) if (Store.ui[k] !== undefined) z[k] = Store.ui[k]; localStorage.setItem('kt-ui', JSON.stringify(z)); } catch (e) { /* privates Fenster */ }
  },
  /* Design sofort setzen und für den nächsten Start merken (index.html liest es vor dem ersten Bild, 1.30) */
  applyTheme() {
    const t = Store.ui.theme === 'hell' ? 'hell' : 'dunkel';   // Standard seit 1.42: dunkel
    document.body.dataset.theme = t;
    document.body.classList.toggle('show-head', !!Store.ui.pageHead);   // Seitentitel über der Seite (1.36, sonst nur im Tab)
    try { localStorage.setItem('kt-theme', t); } catch (e) { /* privates Fenster */ }
  },
  /* Laden in Stufen: Seiten sind angekommen – Seitenliste nachführen, wenn sie den offenen Abschnitt betreffen */
  pagesArrived(ids) {
    const s = Tree.group(Store.ui.currentGroup);
    if (s && s.pages && ids.some(id => s.pages.includes(id))) this.navSoon();
  },
  navSoon: debounce(() => Sidebar.render(), 60),
  allArrived() {
    for (const s of Tree.sections()) Tree.normLevels(s);
    // Kopfangaben nachtragen, wo sie fehlen oder veraltet sind (Daten von vor 1.32, ältere Tabs)
    if (Backend.writeHeads) {
      const fix = {};
      for (const [id, p] of Object.entries(Store.pages)) { const h = pageHead(p), o = Lazy.heads[id]; if (!o || o.t !== h.t || o.l !== h.l || o.c !== h.c || o.m !== h.m) fix[id] = h; }
      if (Object.keys(fix).length) Backend.writeHeads(fix).catch(() => { });
    }
    if (typeof Sheet !== 'undefined') Sheet.touch();   // Bezüge auf Tabellen anderer Seiten
    Sidebar.render();
    if (Save.treeDirty) Save.schedule();
  },

  /* Speicher aufräumen (Webseite): Bilder/Dateien, auf die nichts mehr verweist – Seiten und Verlauf im Speicher
     zählen mit, darum bleibt alles, was Strg+Z noch braucht. Nicht während eines Imports. */
  async cleanupStorage(opts = {}) {
    if (!Backend.cleanup || !Store.loaded || Store.readOnly) return null;
    await Store.whenComplete();   // nie aufräumen, solange noch Seiten fehlen (ihre Bilder würden fehlen)
    if (typeof OneImport !== 'undefined' && OneImport.busy) return null;
    try {
      await Save.flushAll();
      return await Backend.cleanup({ refs: refsInMemory(), pageIds: new Set(Object.keys(Store.pages)), ...opts });
    } catch (e) { console.warn('[KnowledgeTree] Aufräumen:', e); return null; }
  },
  cleanupSoon: debounce(() => App.cleanupStorage(), 20000),

  /* nach einem abgestürzten Import: Reste wegräumen und sagen, wo es zuletzt war */
  async afterCrash(c) {
    await Save.flushAll();
    const r = (await this.cleanupStorage({ grace: 0 })) || { bilder: 0, bytes: 0 };
    const ph = c.j.phase || {};
    const when = new Date(c.j.start || Date.now()).toLocaleString('de-CH');
    const last = [ph.file ? `Datei „${escapeHtml(ph.file)}“` : '', ph.section ? `Abschnitt „${escapeHtml(ph.section)}“` : '', ph.page ? `Seite ${ph.page} von ${ph.pages || '?'}` : ''].filter(Boolean).join(', ');
    UI.info('Import nicht fertig geworden', `<p>Der Import vom ${when}${(c.j.files || []).length ? ` (${(c.j.files || []).map(escapeHtml).join(', ')})` : ''} wurde nicht abgeschlossen – vermutlich ist die Seite dabei abgestürzt (z.&nbsp;B. „Out of Memory“).</p>
      <p><b>Die halb importierten Daten wurden restlos entfernt:</b> ${c.groups} ${c.groups === 1 ? 'Notizbuch/Abschnitt' : 'Notizbücher/Abschnitte'}${c.names && c.names.length ? ` (${c.names.map(escapeHtml).join(', ')})` : ''}, ${c.pages} Seiten, ${r.bilder} Bilder/Anhänge (${Math.round((r.bytes || 0) / 1e6)} MB).</p>
      <p style="color:var(--ink-3)">Zuletzt: ${last || 'noch vor dem ersten Abschnitt'}${ph.heap ? ` · Arbeitsspeicher der Seite zuletzt ${ph.heap} MB (höchstens ${ph.maxHeap || ph.heap} MB)` : ''}${ph.rar ? ` · RAR entpackt ${escapeHtml(ph.rar)}` : ''}. Diese Angaben helfen, die Ursache zu finden.</p>`, { wide: true });
    Sidebar.render();
  },

  async ping() {
    try {
      if (!(await Backend.ping())) UI.conflict();
    } catch (e) { /* Server evtl. beendet */ }
  },

  nav: { back: [], fwd: [] },
  preview: null,

  openPage(pid, opts = {}) {
    // noch nicht geladen (Laden in Stufen): diese Seite und ihren Abschnitt vorziehen, dann öffnen
    if (pid && !Store.pages[pid] && Lazy.has(pid)) {
      const sec = Tree.groupOfPage(pid);
      this._want = pid;
      Lazy.need([pid]).then(() => { if (this._want === pid) { this._want = null; this.openPage(pid, opts); } });
      if (sec) Lazy.prefer(sec.pages);   // danach der Rest dieses Abschnitts
      return;
    }
    this._want = null;
    if (this.preview) this.endPreview(true);
    if (pid && !Store.pages[pid]) pid = null;
    const prev = Canvas.pageId;
    if (prev && prev !== pid) Canvas.stopEditing();
    if (!opts.nav && prev && pid && prev !== pid && Store.pages[prev]) {
      this.nav.back.push(prev);
      if (this.nav.back.length > 60) this.nav.back.shift();
      this.nav.fwd = [];
    }
    let sec = null;
    if (pid) sec = Tree.groupOfPage(pid);
    else if (opts.group !== undefined) sec = Tree.group(opts.group);
    if (sec && Tree.isSection(sec)) {
      Store.ui.currentGroup = sec.id;
      const parent = Tree.parentOf(sec.id);
      Store.ui.currentContainer = parent ? parent.id : null;
      const nb = Tree.notebookOf(sec.id);
      if (nb && nb.kind === 'notebook') Store.ui.lastSection[nb.id] = sec.id;
      for (const anc of Tree.path(sec.id).slice(0, -1)) delete Store.ui.collapsed[anc.id];
      if (pid) Store.ui.lastPage[sec.id] = pid;
    } else {
      Store.ui.currentGroup = null;
      if (opts.container) Store.ui.currentContainer = opts.container;
    }
    if (pid) {
      Store.ui.recent = [pid, ...Store.ui.recent.filter(x => x !== pid && Store.has(x))].slice(0, 15);
      const p = Store.pages[pid];
      if (p && p.level) {
        // eingeklappte Elternseiten aufklappen
        const s = Tree.groupOfPage(pid);
        let lv = p.level;
        for (let i = s.pages.indexOf(pid) - 1; i >= 0 && lv > 0; i--) {
          const q = Store.meta(s.pages[i]);
          if ((q.level || 0) < lv) { delete Store.ui.collapsedPages[q.id]; lv = q.level || 0; }
        }
      }
    }
    if (!opts.keepSel) Sidebar.pageSel = new Set(pid ? [pid] : []);
    Store.ui.currentPage = pid;
    UiState.saveSoon();
    Canvas.load(pid);
    Panes.opened(pid, opts);   // Tab des aktiven Bereichs (1.35)
    Sidebar.render();
    this.updateTitle();
    this.updateNavButtons();
  },
  /* Titel der neuen/umzubenennenden Seite bearbeiten: im Tab (seit 1.36) oder – wenn eingeblendet – über der Seite */
  focusTitle() {
    if (!document.body.classList.contains('show-head') && typeof Panes !== 'undefined' && Panes.rename()) return;
    const t = $('#page-title');
    t.focus(); t.select();
  },
  openFirstPage() {
    const g = Tree.group(Store.ui.currentGroup);
    let s = Tree.isSection(g) ? g : null;
    if (!s) {
      const c = Tree.group(Store.ui.currentContainer);
      s = (c && !c.closed && Tree.firstSection(c)) || null;
    }
    if (!s) {
      for (const nb of Store.groups) { if (nb.kind === 'notebook' && !nb.closed) { s = Tree.firstSection(nb); if (s) break; } }
    }
    if (!s) s = Tree.quick();
    this.openPage(s && s.pages[0] ? s.pages[0] : null, { group: s ? s.id : null });
  },
  goBack() {
    while (this.nav.back.length) {
      const pid = this.nav.back.pop();
      if (Store.has(pid) && pid !== Canvas.pageId) { if (Canvas.pageId) this.nav.fwd.push(Canvas.pageId); this.openPage(pid, { nav: true }); return; }
    }
    this.updateNavButtons();
  },
  goForward() {
    while (this.nav.fwd.length) {
      const pid = this.nav.fwd.pop();
      if (Store.has(pid) && pid !== Canvas.pageId) { if (Canvas.pageId) this.nav.back.push(Canvas.pageId); this.openPage(pid, { nav: true }); return; }
    }
    this.updateNavButtons();
  },
  updateNavButtons() {
    $('#qat-back').disabled = !this.nav.back.some(id => Store.has(id));
    $('#qat-fwd').disabled = !this.nav.fwd.some(id => Store.has(id));
  },
  recentMenu(anchor) {
    const items = Store.ui.recent.filter(id => Store.meta(id)).map(id => {
      const p = Store.meta(id);
      const s = Tree.groupOfPage(id);
      return { label: (p.title || 'Unbenannte Seite') + (s ? '  ·  ' + s.name : ''), icon: 'page', action: () => this.openPage(id) };
    });
    UI.menu([{ head: 'Zuletzt verwendet' }, ...(items.length ? items : [{ label: 'Noch keine', disabled: true }])], 0, 0, { anchor });
  },
  /* Vollbild: Menüband nur über das Pfeilchen oben ein-/ausblenden (1.40; bis 1.39 fuhr es aus, wenn die Maus an den
   * oberen Rand kam). Eingeblendet steht es über der Seite im Fluss (verdeckt nichts), sein Pfeil ⌃ blendet es wieder
   * aus. Gemerkt in Store.ui.fsRibbon. */
  initFsPeek() {
    const B = document.body;
    const grip = el('button', { id: 'fs-rb', type: 'button', title: 'Menüband einblenden', html: icon('chevDown', 14) });
    for (const t of ['pointerdown', 'mousedown', 'touchstart', 'dblclick']) grip.addEventListener(t, (e) => e.stopPropagation(), { passive: t === 'touchstart' });
    grip.addEventListener('click', (e) => { e.stopPropagation(); this.fsRibbon(true); });
    $('#app').append(grip);
    // Stift ↔ Auswählen auch im Vollbild ohne Menüband (1.49)
    const fd = el('button', { id: 'fs-draw', class: 'tab-draw', type: 'button' });
    for (const t of ['pointerdown', 'mousedown', 'touchstart', 'dblclick']) fd.addEventListener(t, (e) => e.stopPropagation(), { passive: t === 'touchstart' });
    fd.addEventListener('click', (e) => { e.stopPropagation(); Draw.toggleSelect(); });
    $('#app').append(fd);
    if (typeof Draw !== 'undefined' && Draw.updateToggle) Draw.updateToggle();
    this.fsPeekHide = () => { };
  },
  fsRibbon(on) {
    Store.ui.fsRibbon = !!on;
    document.body.classList.toggle('fs-ribbon', !!on);
    UiState.saveSoon();
    if (on) Ribbon.refreshSoon();
    Canvas.layoutSoon();
  },
  toggleFullscreen(on) {
    const want = on ?? !document.body.classList.contains('fullscreen');
    if (this.fsPeekHide) this.fsPeekHide();
    document.body.classList.toggle('fullscreen', want);
    document.body.classList.toggle('fs-ribbon', want && !!Store.ui.fsRibbon);
    Layout.applyRibbon();   // Pfeilchen im Vollbild: ⌃ = ausblenden
    $('#fs-exit').hidden = !want;
    if (typeof Panes !== 'undefined') Panes.fsChanged(want);   // alle offenen Tabs als Kacheln (1.37)
    try {
      if (want && document.documentElement.requestFullscreen && !document.fullscreenElement) document.documentElement.requestFullscreen().catch(() => { });
      if (!want && document.fullscreenElement) document.exitFullscreen().catch(() => { });
    } catch (e) { /* */ }
    Canvas.layoutSoon();
  },
  updateTitle() {
    const p = Canvas.page;
    const s = Tree.group(Store.ui.currentGroup);
    const t = p ? `${p.title || 'Unbenannte Seite'}${s ? ' – ' + s.name : ''} – KnowledgeTree` : 'KnowledgeTree';
    document.title = t;
    $('#tb-title').textContent = t;
  },

  /* ---------------------------------------------------------- Titelleiste & Statusleiste */
  initChrome() {
    $('#qat-save').innerHTML = icon('save', 16);
    $('#qat-undo').innerHTML = icon('undo', 16);
    $('#qat-undo-list').innerHTML = icon('chevDown', 10);
    $('#qat-redo').innerHTML = icon('redo', 16);
    $('#tb-search-ic').innerHTML = icon('search', 14);
    for (const b of $$('.qat')) b.addEventListener('mousedown', e => e.preventDefault());
    $('#qat-save').addEventListener('click', () => Cmd.run('save'));
    $('#qat-undo').addEventListener('click', () => Cmd.run('undo'));
    $('#qat-redo').addEventListener('click', () => Cmd.run('redo'));
    $('#qat-undo-list').addEventListener('click', (e) => UI.historyList(e.currentTarget.closest('.qat-split')));
    $('#qat-back').innerHTML = icon('arrowLeft', 16);
    $('#qat-fwd').innerHTML = icon('arrowRight', 16);
    $('#qat-recent').innerHTML = icon('clock', 16);
    $('#qat-back').addEventListener('click', () => this.goBack());
    $('#qat-fwd').addEventListener('click', () => this.goForward());
    $('#qat-recent').addEventListener('click', (e) => this.recentMenu(e.currentTarget));
    // liegt auf der Seitenfläche: deren Zeiger-Handler (Textfeld anlegen, Verschieben, Zeigerfang) dürfen den Klick
    // nicht abfangen – sonst beendete ein Klick auf den Hinweis das Vollbild nicht (1.34)
    const fsx = $('#fs-exit');
    for (const t of ['pointerdown', 'mousedown', 'touchstart', 'dblclick']) fsx.addEventListener(t, (e) => e.stopPropagation(), { passive: t === 'touchstart' });
    fsx.addEventListener('click', (e) => { e.stopPropagation(); this.toggleFullscreen(false); });
    fsx.title = 'Klicken (oder F11), um das Vollbild zu beenden';
    this.initFsPeek();
    document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement && document.body.classList.contains('fullscreen')) this.toggleFullscreen(false); });
    $('#page-meta').addEventListener('click', () => { if (Canvas.page && !this.preview) Ops.editCreated(Canvas.pageId); });
    this.initPreviewGlass();
    const ts = $('#tb-search');
    ts.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') { Find.open('find', ts.value); ts.value = ''; ts.blur(); }
      if (e.key === 'Escape') { ts.value = ''; ts.blur(); }
    });
    if (typeof TellMe !== 'undefined') TellMe.init();   // Suche oben wie in Office: Befehle, Einstellungen, Seiten (1.75)
    $('#sb-zoom').addEventListener('input', (e) => { let z = sliderToZoom(e.target.value); if (Math.abs(z - 1) < 0.04) z = 1; Canvas.setZoom(z); });   // logarithmisch, rastet bei 100 % ein
    $('#sb-zoom-in').addEventListener('click', () => Cmd.run('zoomIn'));
    $('#sb-zoom-out').addEventListener('click', () => Cmd.run('zoomOut'));
    $('#sb-zoom-val').addEventListener('click', () => Cmd.run('zoom100'));
    // Browser-Zoom verhindern (Strg+Mausrad ausserhalb der Fläche)
    document.addEventListener('wheel', (e) => { if (e.ctrlKey) e.preventDefault(); }, { passive: false });
    document.addEventListener('contextmenu', (e) => { if (!e.target.closest('input, textarea') && !(e.shiftKey && e.target.closest('.box-text'))) e.preventDefault(); });
    const hasFiles = (e) => e.dataTransfer && [...e.dataTransfer.types].includes('Files');
    document.addEventListener('dragover', (e) => { if (hasFiles(e) && !e.target.closest('#viewport')) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; } });
    document.addEventListener('drop', (e) => {
      if (!hasFiles(e) || e.target.closest('#viewport')) return;
      e.preventDefault();
      // ausserhalb der Fläche (Navigation, Menüband …): gleicher Import, Bilder & Co. in die Mitte der Seite
      const dirs = [...(e.dataTransfer.items || [])].map(it => it.webkitGetAsEntry && it.webkitGetAsEntry()).filter(en => en && en.isDirectory);
      const files = [...e.dataTransfer.files];
      (async () => OneImport.auto(dirs.length ? [...await readDropDirs(dirs), ...files.filter(f => f.size || f.type).map(f => ({ file: f, path: f.name }))] : files))();
    });
    // Links nie im Programmfenster öffnen (ein Klick öffnet sie im Browser, siehe Canvas.onClick)
    document.addEventListener('click', (e) => { if (e.target.closest && e.target.closest('a[href]:not([download])')) e.preventDefault(); }, true);
    document.addEventListener('auxclick', (e) => { if (e.target.closest && e.target.closest('a[href]:not([download])')) e.preventDefault(); }, true);
    document.addEventListener('paste', (e) => this.onPaste(e));
    window.addEventListener('pagehide', () => { Hist.flushPending(); Save.beacon(); UiState.saveSoon.flush(); });
    window.addEventListener('beforeunload', () => { Hist.flushPending(); Save.beacon(); UiState.saveSoon.flush(); });
  },

  /* ---------------------------------------------------------- Einfügen */
  async onPaste(e) {
    const t = e.target;
    if (t.closest && t.closest('input, textarea')) return;
    const dt = e.clipboardData;
    if (!dt) return;
    const text = t.closest && t.closest('.box-text');
    e.preventDefault();
    if (Store.readOnly) return;
    if (text && Canvas.editing) {
      const imgs = [...dt.files].filter(f => f.type.startsWith('image/'));
      if (imgs.length) { for (const f of imgs) await Canvas.insertImage(Canvas.editing, f, null); return; }
      this.insertClipboardText(dt.getData('text/html'), dt.getData('text/plain'), this._plainNext);
      this._plainNext = false;
      return;
    }
    await Canvas.pasteToCanvas(dt);
  },
  insertClipboardText(html, plain, plainOnly) {
    Hist.flushPending();
    if (html && !plainOnly) {
      const clean = sanitizeHtml(html);
      document.execCommand('insertHTML', false, clean);
    } else if (plain) {
      document.execCommand('insertText', false, plain);
    }
    Canvas.syncEditing();
    Hist.commit('Eingefügt');
  },
  async pasteFromButton(plain) {
    if (!Canvas.page) return;
    let items;
    try { items = await navigator.clipboard.read(); }
    catch (e) {
      UI.toast('Bitte Strg+V verwenden (Zugriff auf die Zwischenablage wurde nicht erlaubt)');
      return;
    }
    let html = '', text = '', blob = null;
    for (const it of items) {
      for (const type of it.types) {
        if (type.startsWith('image/') && !blob) blob = await it.getType(type);
        else if (type === 'text/html' && !html) html = await (await it.getType(type)).text();
        else if (type === 'text/plain' && !text) text = await (await it.getType(type)).text();
      }
    }
    if (Canvas.editing && Canvas.restoreRange()) {
      if (blob && !text) { await Canvas.insertImage(Canvas.editing, blob, null); return; }
      this.insertClipboardText(plain ? '' : html, text, plain);
      return;
    }
    const dt = { files: blob ? [blob] : [], getData: (t) => t === 'text/html' ? (plain ? '' : html) : t === 'text/plain' ? text : '' };
    if (blob) { await Canvas.insertImage(null, blob, Canvas.viewCenter()); return; }
    await Canvas.pasteToCanvas(dt);
  },

  /* ---------------------------------------------------------- Tastatur */
  initKeys() {
    document.addEventListener('keydown', (e) => {
      const t = e.target;
      const inText = !!(t.closest && t.closest('.box-text'));
      const inInput = !!(t.matches && t.matches('input, textarea, select'));
      const inDialog = !!(t.closest && t.closest('.dlg-back, #findpanel, .calc'));
      const ctrl = e.ctrlKey || e.metaKey;
      const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;

      if (inDialog) return;
      if (typeof Plugins !== 'undefined' && Plugins.onKey(e)) return;   // Tastenkürzel der Add-Ins (1.69)
      if (this.preview) {
        if (e.key === 'Escape') { e.preventDefault(); this.endPreview(); return; }
        if (ctrl && ['+', '=', '-', '0'].includes(k)) { /* Zoom erlaubt */ }
        else if (ctrl || e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); return; }
      }
      // Office-Seiten (1.65): Strg+Enter = Seitenumbruch (Word), Strg+M = neue Folie, Umsch+F11 = neues Blatt (Excel)
      if (e.key === 'Escape' && typeof OfficeSlides !== 'undefined' && OfficeSlides.cancelTool()) { e.preventDefault(); return; }
      if (typeof OfficePages !== 'undefined' && OfficePages.page() && !inInput) {
        if (ctrl && !e.shiftKey && !e.altKey && e.key === 'Enter' && inText && OfficePages.page('docx')) { e.preventDefault(); Cmd.run('wPageBreak'); return; }
        if (ctrl && !e.shiftKey && !e.altKey && e.code === 'KeyM' && OfficePages.page('pptx') && !inText) { e.preventDefault(); Cmd.run('slideNew'); return; }
        if (e.shiftKey && !ctrl && e.key === 'F11' && OfficePages.page('xlsx')) { e.preventDefault(); Cmd.run('xlSheetAdd'); return; }
        if (ctrl && (e.key === '*' || (e.shiftKey && e.code === 'Digit8')) && OfficePages.page('docx')) { e.preventDefault(); Cmd.run('wMarks'); return; }   // ¶ (1.67)
      }
      // F5 / Umsch+F5 auf einer PowerPoint-Seite: vorführen (1.62)
      if (e.key === 'F5' && !ctrl && typeof Show !== 'undefined' && typeof OfficePages !== 'undefined' && OfficePages.page('pptx')) { e.preventDefault(); Show.start(e.shiftKey ? 'here' : 'begin'); return; }
      if (e.key === 'F11') { e.preventDefault(); this.toggleFullscreen(); return; }
      if (e.key === 'F7') { e.preventDefault(); Spell.panel(); return; }   // Rechtschreibung (1.38, wie OneNote)
      // wie Excel: F9 = berechnen (manuelle Berechnung), Strg+Alt+F9 = alles neu berechnen
      if (e.key === 'F9' && !inText) { e.preventDefault(); if (Sheet.edit) return; Sheet.recalc(ctrl && e.altKey); return; }
      if (e.key === 'F1' && ctrl) { e.preventDefault(); if (document.body.classList.contains('fullscreen')) this.fsRibbon(!Store.ui.fsRibbon); else Layout.toggleRibbon(); return; }
      if (e.altKey && !ctrl && (e.key === 'ArrowLeft' || e.key === 'ArrowRight') && !inText && !inInput) { e.preventDefault(); if (e.key === 'ArrowLeft') this.goBack(); else this.goForward(); return; }
      if (ctrl && e.altKey && !e.shiftKey) {
        if (e.code === 'KeyN') { e.preventDefault(); Ops.newSubpage(); return; }
        if (e.code === 'BracketRight' || e.key === ']') { e.preventDefault(); Ops.setLevel(Sidebar.pageSel.size ? [...Sidebar.pageSel] : [Canvas.pageId], +1); return; }
        if (e.code === 'BracketLeft' || e.key === '[') { e.preventDefault(); Ops.setLevel(Sidebar.pageSel.size ? [...Sidebar.pageSel] : [Canvas.pageId], -1); return; }
      }
      if (e.altKey && e.shiftKey && !ctrl) {
        if (e.code === 'KeyN') { e.preventDefault(); Ops.quickNote(); return; }
        if (inText && (e.code === 'KeyD' || e.code === 'KeyT' || e.code === 'KeyF')) {
          e.preventDefault();
          const d = new Date();
          const ds = d.toLocaleDateString('de-CH', { day: 'numeric', month: 'long', year: 'numeric' }), ts = d.toLocaleTimeString('de-CH', { hour: '2-digit', minute: '2-digit' });
          Cmd.run('insertSymbol', e.code === 'KeyD' ? ds : e.code === 'KeyT' ? ts : ds + ', ' + ts);
          return;
        }
      }
      if (e.key === 'Escape' && Draw.tool !== 'select' && !inText && !inInput) { e.preventDefault(); Draw.setTool('select'); return; }
      if (e.key === 'Escape') {
        if (Fmt.painter) { Fmt.cancelPainter(); e.preventDefault(); return; }
        if (UI.popupOpen()) { UI.closePopup(); e.preventDefault(); return; }
        if (Find.el && !Find.el.hidden) { Find.close(); return; }
      }
      if (ctrl && !e.altKey) {
        if (k === 'z' && !e.shiftKey) { e.preventDefault(); if (!inInput || t.id === 'page-title') { Hist.flushPending(); Cmd.run('undo'); } return; }
        if (k === 'y' || (k === 'z' && e.shiftKey)) { e.preventDefault(); if (!inInput || t.id === 'page-title') Cmd.run('redo'); return; }
        if (k === 's') { e.preventDefault(); Cmd.run('save'); return; }
        if (k === 'f' || (k === 'e' && !inText)) { e.preventDefault(); Cmd.run('find'); return; }
        if (k === 'h') { e.preventDefault(); Cmd.run('replace'); return; }
        if (k === 'n' && !e.shiftKey) { e.preventDefault(); Cmd.run('newPage'); return; }
        if (k === 'p') { e.preventDefault(); Cmd.run('print'); return; }
        if (k === '+' || k === '=' ) { e.preventDefault(); Cmd.run('zoomIn'); return; }
        if (k === '-') { e.preventDefault(); Cmd.run('zoomOut'); return; }
        if (k === '0') { e.preventDefault(); Cmd.run('zoom100'); return; }
        if (k === 'g') { e.preventDefault(); Cmd.run(e.shiftKey ? 'ungroup' : 'group'); return; }
        if (k === 'l' && e.shiftKey) { e.preventDefault(); Cmd.run('toggleLock'); return; }
        if ((e.key === 'Home' || e.key === 'End') && !inText && !inInput && Canvas.page) { e.preventDefault(); Canvas.goAnchor(e.key === 'Home' ? 'tl' : 'br'); return; }
        if (inText) {
          if (k === 'l') { e.preventDefault(); Cmd.run('alignLeft'); return; }
          if (k === 'e') { e.preventDefault(); Cmd.run('alignCenter'); return; }
          if (k === 'r') { e.preventDefault(); Cmd.run('alignRight'); return; }
          if (k === 'j') { e.preventDefault(); Cmd.run('alignJustify'); return; }
          if (k === 'k') { e.preventDefault(); Cmd.run('insertLink'); return; }
          if (e.shiftKey && (e.key === '>' || e.code === 'Period')) { e.preventDefault(); Cmd.run('grow'); return; }
          if (e.shiftKey && (e.key === '<' || e.code === 'Comma')) { e.preventDefault(); Cmd.run('shrink'); return; }
          if (k === 'v' && e.shiftKey) { this._plainNext = true; return; }
          if (k === 'b' || k === 'i' || k === 'u') { e.preventDefault(); Cmd.run(k === 'b' ? 'bold' : k === 'i' ? 'italic' : 'underline'); return; }
          return;
        }
        if (k === 'r') { e.preventDefault(); return; }
        if (!inInput) {
          if (k === 'c') { if (Canvas.copySelection(false)) e.preventDefault(); return; }
          if (k === 'x') { if (Canvas.copySelection(true)) e.preventDefault(); return; }
          if (k === 'd') { e.preventDefault(); Canvas.duplicate(); return; }
          if (k === 'a') { e.preventDefault(); Canvas.selectAll(); return; }
        }
        return;
      }
      if (e.altKey && !ctrl && !e.shiftKey && (k === 'n' || e.code === 'KeyN')) { e.preventDefault(); Cmd.run('newPage'); return; }
      if (e.altKey && !ctrl && e.key === '=' && !inInput) { e.preventDefault(); Cmd.run('insertFormula'); return; }
      if (e.altKey && !ctrl && !e.shiftKey && e.code === 'KeyR') { e.preventDefault(); Cmd.run('calculator'); return; }
      if (e.altKey && !ctrl && !e.shiftKey && e.code === 'KeyM') { e.preventDefault(); Cmd.run('fotomath'); return; }
      if (e.key === 'F5' && Backend.kind === 'server') { e.preventDefault(); return; }
      if (inText || inInput) return;
      if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); Canvas.deleteSelection(); return; }
      if (e.key === 'Escape') { Canvas.clearSel(); return; }
      if (e.key === 'F2') { e.preventDefault(); if (Canvas.page) Ops.renamePage(Canvas.pageId); return; }
      if ((e.key === 'Home' || e.key === 'End') && Canvas.page) { e.preventDefault(); Canvas.goAnchor(e.key === 'Home' ? 'tl' : 'br'); return; }
      if (e.key === 'Tab' && Canvas.page && !e.ctrlKey && !e.altKey && (t === document.body || t === Canvas.vp || (t.closest && t.closest('#viewport'))) && !UI.popupOpen()) { e.preventDefault(); Canvas.cycleAll(e.shiftKey ? -1 : 1); return; }
      if (e.key.startsWith('Arrow') && (Canvas.sel.size || Draw.sel.size || Canvas.selImg)) {
        e.preventDefault();
        const s = e.shiftKey ? 10 : 1;
        Canvas.nudge(e.key === 'ArrowLeft' ? -s : e.key === 'ArrowRight' ? s : 0, e.key === 'ArrowUp' ? -s : e.key === 'ArrowDown' ? s : 0);
        return;
      }
      if (e.key === ' ' && !e.repeat) { e.preventDefault(); Canvas.spaceDown = true; Canvas.vp.classList.add('space'); return; }
      if (e.key === 'Enter' && Canvas.sel.size === 1) {
        const id = [...Canvas.sel][0], b = Canvas.box(id);
        if (b && b.sheet) { e.preventDefault(); Sheet.activate(id, 0, 0); return; }
        if (b && b.chart) { e.preventDefault(); Chart.editDialog(b); return; }
        if (b && !Canvas.isLocked(b)) { e.preventDefault(); Canvas.focusText(id); }
      }
    });
    document.addEventListener('keyup', (e) => {
      if (e.key === ' ') { Canvas.spaceDown = false; Canvas.vp.classList.remove('space'); }
    });
    window.addEventListener('blur', () => { Canvas.spaceDown = false; Canvas.vp.classList.remove('space'); });
  },

  /* ---------------------------------------------------------- Dialoge */
  showShortcuts() {
    const touchRows = [
      ['h', 'Handy & Tablet (Finger)'],
      ['Antippen auf freie Fläche', 'neues Textfeld (ist gerade etwas ausgewählt: nur Auswahl aufheben)'],
      ['Ein Finger ziehen', 'Seite verschieben (auch auf Text, solange er nicht bearbeitet wird)'],
      ['Zwei Finger', 'zoomen und verschieben'],
      ['Lange drücken', 'Kontextmenü wie Rechtsklick – auf der Seite, bei Seiten, Notizbüchern und Registern'],
      ['Leiste oben am Feld ziehen', 'Feld verschieben'],
      ['Lange drücken → „Verbinden mit …“', 'danach das Ziel antippen'],
      ['☰ oben links', 'Notizbücher und Seiten (Schublade)'],
      ['Register antippen (Menüband eingeklappt)', 'Menüband kurz einblenden – ⌄ rechts hält es offen'],
    ];
    const rows = [
      ...(document.body.classList.contains('touch') || document.body.classList.contains('lay-drawer') ? touchRows : []),
      ['h', 'Zeichenfläche'],
      ['Klick auf freie Fläche', 'neues Textfeld an dieser Stelle'],
      ['Leiste oben am Feld ziehen', 'Feld verschieben (oder Alt + ziehen)'],
      ['Rechte Kante ziehen', 'Breite ändern'],
      ['Ziehen auf freier Fläche', 'Auswahlrahmen'],
      ['Umschalt + Klick', 'mehrere auswählen'],
      ['Mausrad / Umschalt + Mausrad', 'nach oben/unten / links/rechts'],
      ['Strg + Mausrad', 'zoomen'],
      ['Mittlere Maustaste / Leertaste + ziehen', 'Fläche verschieben'],
      ['Entf', 'Auswahl löschen'],
      ['h', 'Knowledge Tree'],
      ['Rechtsklick halten + ziehen', 'zwei Felder/Pakete verbinden'],
      ['Punkt am Rand ziehen', 'ebenfalls verbinden'],
      ['Strg + Rechtsklick ziehen', 'Verbindungen durchschneiden'],
      ['Mehrmals verbinden', 'beliebig viele Verbindungen, auch hin und zurück'],
      ['Verbindung anklicken + ziehen', 'Linie im Raum verschieben / biegen'],
      ['Endpunkt einer Verbindung ziehen', 'Ansatzpunkt am Feld verschieben oder an anderes Feld hängen'],
      ['Doppelklick auf einen Punkt', 'Linie / Ansatzpunkt zurücksetzen'],
      ['Doppelklick auf Verbindung', 'Beschriftung'],
      ['Strg + G / Strg + Umschalt + G', 'gruppieren / Gruppierung aufheben'],
      ['Strg + Umschalt + L', 'sperren / entsperren'],
      ['h', 'Text'],
      ['Strg + B / I / U', 'fett / kursiv / unterstrichen'],
      ['Strg + L / E / R / J', 'links / zentriert / rechts / Blocksatz'],
      ['Strg + Umschalt + > / <', 'Schrift grösser / kleiner'],
      ['Alt + =', 'Formel einfügen (Doppelklick auf eine Formel = bearbeiten)'],
      ['Klick auf einen Link', 'Link öffnen (Strg + Klick = Cursor in den Link setzen)'],
      ['h', 'Auswählen'],
      ['Alt + Klick', 'Objekte an dieser Stelle der Reihe nach auswählen (z.B. Schrift vor einem Bild)'],
      ['Tab / Umschalt + Tab', 'nächstes / voriges Objekt der Seite auswählen'],
      ['Umschalt/Strg + Klick', 'Objekt zur Auswahl hinzufügen oder entfernen'],
      ['Rechtsklick → „Bild als Hintergrund festlegen“', 'Bild (auch Textfeld, Diagramm, Zeichnung) ganz nach hinten: Auswahlrahmen, Lasso und Strg+A überspringen es, ziehen darauf = Auswahlrahmen · einzeln anklicken = auswählen · Doppelklick = Textfeld darauf · nochmals = wieder normal'],
      ['Pfeiltasten (+Umschalt)', 'Auswahl oder ausgewähltes Bild um 1 (10) px verschieben'],
      ['Strg + K', 'Link einfügen (Klick öffnet ihn)'],
      ['Tab / Umschalt + Tab', 'Einzug in Listen'],
      ['Esc', 'Textbearbeitung beenden'],
      ['Umschalt + Rechtsklick', 'Browser-Menü (z.B. Rechtschreibung)'],
      ['Alt + Umschalt + D / T / F', 'Datum / Uhrzeit / beides einfügen'],
      ['F7', 'Rechtschreibung: die Seite Wort für Wort prüfen (Rechtsklick auf ein rot unterwelltes Wort = Vorschläge)'],
      ['h', 'Zeichnen'],
      ['Esc', 'zurück zum Auswählen und Schreiben'],
      ['Stift nochmals anklicken', 'Farbe, Stärke und Art ändern'],
      ['Umschalt beim Zeichnen von Formen', 'gerade Linien (45°) / Quadrat / Kreis'],
      ['Radierer am Stift', 'radiert, ohne das Werkzeug zu wechseln'],
      ['Mausrad über Lineal / Winkelmesser', 'drehen (mit Umschalt in 15°-Schritten)'],
      ['Griff am Ende von Lineal / Winkelmesser ziehen', 'Länge bzw. Grösse ändern (Zentimeter wie auf dem gedruckten Blatt); zweimal schnell drücken = an den Bildschirm anpassen'],
      ['Klick auf eine Abschnittsgruppe', 'auf-/zuklappen (Doppelklick = umbenennen)'],
      ['Fotomath: „Auflösen nach“', 'Gleichung mit mehreren Buchstaben nach einer Unbekannten umstellen, z.B. U = R·I nach I'],
      ['Zwei Finger', 'zoomen und verschieben (Touch)'],
      ...(typeof Plugins !== 'undefined' ? Plugins.helpRows() : []),   // Abschnitte der Add-Ins, z.B. Chem-Draw (1.69)
      ['h', 'Tabellen (Einfügen → Tabelle)'],
      ['Klick in eine Zelle, tippen', 'Wert eingeben; Enter = nach unten, Tab = nach rechts (am Ende wächst die Tabelle)'],
      ['= am Anfang', 'Formel, z.B. =SUMME(A1:A5), =WENN(B2>10;"hoch";"tief"), =Tabelle2!B3*2 (deutsche und englische Namen)'],
      ['Beim Tippen eines Funktionsnamens', 'Vorschläge: grauer Text in der Zelle + Liste mit Beschreibung; Tab, Enter oder → übernimmt, ↑ ↓ wählt'],
      ['Beim Tippen einer Formel Zellen anklicken / Pfeiltasten', 'Bezug einfügen (Zeigen wie in Excel); F4 = $-Zeichen umschalten'],
      ['F2 / Doppelklick', 'Zelle bearbeiten; Alt + Enter = Zeilenumbruch in der Zelle'],
      ['Kästchen unten rechts ziehen', 'Ausfüllen: Reihen (1, 2, 3 · Mo, Di · Jan, Feb · Datum) fortsetzen, Formeln kopieren'],
      ['Strg + D / Strg + R', 'nach unten / nach rechts füllen'],
      ['Strg + Enter', 'Eingabe in alle markierten Zellen'],
      ['Alt + =', 'AutoSumme'],
      ['Strg + C / X / V', 'Zellen kopieren / ausschneiden / einfügen (auch aus und nach Excel)'],
      ['Strg + B / I / U, Strg + . ', 'Format · Strg + . = heutiges Datum'],
      ['Spaltenrand ziehen / doppelklicken', 'Spaltenbreite / automatisch anpassen'],
      ['Rechtsklick auf Zelle, Zeilen- oder Spaltenkopf', 'Zeilen/Spalten einfügen oder löschen, sortieren, Diagramm'],
      ['=[Seite]Tabelle1!A1', 'Zelle einer Tabelle auf einer anderen Seite (wie Excel zwischen Mappen); gleiche Titel: [Abschnitt/Seite]; nach [ werden Seiten vorgeschlagen'],
      ['Rechtsklick → Verknüpfung einfügen / Bezug kopieren', 'kopierte Zellen als Formeln einsetzen, die aktuell bleiben – auch auf einer anderen Seite'],
      ['F9 / Strg + Alt + F9', 'jetzt berechnen (bei manueller Berechnung, Einstellungen → Formeln) / alles neu berechnen'],
      ['h', 'Diagramme'],
      ['Doppelklick auf das Diagramm', 'Typ, Datenbereich, Titel, Trendlinie …'],
      ['Zeiger auf das Diagramm', 'Werte ablesen (Linie/Punkte auch zwischen den Punkten, inkl. Trend)'],
      ['Klick auf einen Datenpunkt', 'die zugehörige Zelle in der Tabelle zeigen'],
      ['Neue Zeile direkt unter den Daten', 'kommt automatisch ins Diagramm („Bereich wächst mit den Daten“)'],
      ['h', 'Taschenrechner (TI-30X Plus oder einfach)'],
      ['Alt + R oder Rechner-Knopf oben', 'Rechner öffnen/schliessen; Titelleiste ziehen = verschieben, – = minimieren'],
      ['⇄ Standard / Wissenschaftlich', 'zwischen einfachem Rechner (wie Handy/Windows) und TI-30X Plus wechseln'],
      ['Eine der vier Ecken ziehen / Strg + Mausrad', 'Grösse des Rechners ändern'],
      ['Doppelklick auf den oberen Rand des Rechners', 'Grösse zurück auf Standard (100 %)'],
      ['2nd', 'Zweitfunktionen – die Beschriftungen der Tasten tauschen'],
      ['Klick auf eine Rechnung / ein Ergebnis im Verlauf', 'in die Eingabe übernehmen'],
      ['▲ ▼ und enter', 'Verlauf durchgehen und Eintrag übernehmen; im Bruch zwischen Zähler und Nenner'],
      ['◄►≈ · 2nd ◄►≈ (f◄►d)', 'Ergebnis umschalten: exakt (Bruch / Wurzel / π) ↔ Dezimal · Bruch ↔ Dezimal'],
      ['Tastatur', 'Ziffern, + − * ( ), / = Bruch (Zahl davor wird Zähler), : = geteilt, ^ = Hochzahl, Enter = rechnen, Esc = löschen, p = π, r = Wurzel, i = komplex'],
      ['h', 'Fotomath (Einfügen → Fotomath)'],
      ['Alt + M, Rahmen um die Handschrift ziehen', 'Rechnung erkennen, schön darstellen und ausrechnen (Brüche, Hochzahlen, Wurzeln, Gleichungen mit x) – auch in Bildern/Fotos (Beta)'],
      ['Fotomath: Rechenweg', 'jeder Schritt mit Erklärung; „Als Text einfügen“: nur Ergebnis oder mit Rechenweg, Häkchen = nur Tastaturzeichen (* / ^ sqrt)'],
      ['Klick auf ein Etikett über einem Zeichen', 'andere Erkennung wählen – Fotomath lernt die eigene Handschrift'],
      ['Text im Fotomath-Fenster ändern + Enter', 'Rechnung von Hand korrigieren'],
      ['h', 'Seite: Bildlaufleisten und Ankerpunkte'],
      ['Bildlaufleisten unten und rechts', 'Bereich = Rechteck um alle Objekte (Ecken = Ankerpunkte); wächst beim Weiterschieben'],
      ['Pos1 / Ende (bzw. Strg + Pos1 / Ende)', 'zur Ecke oben links / unten rechts aller Objekte'],
      ['h', 'Seitenspalten'],
      ['Doppelklick auf Kopf, Streifen oder freie Fläche', 'Notizbuch- bzw. Seitenspalte ein-/ausklappen'],
      ['h', 'Seiten & Navigation'],
      ['Alt + N (im Programm auch Strg + N)', 'neue Seite'],
      ['Strg + Alt + N', 'neue Unterseite'],
      ['Strg + Alt + ] / [', 'Seite einrücken (Unterseite) / ausrücken'],
      ['Alt + Umschalt + N', 'neue Schnellnotiz'],
      ['Strg / Umschalt + Klick in der Seitenliste', 'mehrere Seiten auswählen'],
      ['Seite in der Liste nach rechts ziehen', 'zur Unterseite machen'],
      ['Alt + ← / Alt + →', 'zurück / vor (zuletzt besuchte Seiten)'],
      ['F5 / Umsch+F5', 'PowerPoint-Seite vorführen: ab Folie 1 bzw. ab der aktuellen Folie (Esc = beenden)'],
      ['F11', 'Vollbild: alle offenen Tabs als Kacheln, ⤢ oben rechts = nur dieser Tab, ⤡ = zurück (Pfeilchen oben links bzw. Strg+F1 = Menüband ein-/ausblenden)'],
      ['Strg + F1 / Doppelklick auf ein Register', 'Menüband ein-/ausklappen (eingeklappt: Register anklicken = herunterklappen, bis die Maus es verlässt; dauerhaft: Pfeilchen rechts)'],
      ['F2 / Doppelklick auf den Tab', 'Seite umbenennen'],
      ['h', 'Tabs und geteilte Bereiche'],
      ['Mittelklick auf eine Seite in der Liste', 'in neuem Tab öffnen (Rechtsklick: auch rechts daneben / unten)'],
      ['Klick auf + in der Tableiste', 'aktuelle Seite in neuem Tab · Rechtsklick auf + = neue Seite, zuletzt geöffnete'],
      ['Mittelklick / × auf einen Tab', 'Tab schliessen'],
      ['Tab ziehen', 'umsortieren, in einen anderen Bereich, an den rechten/unteren Rand = teilen'],
      ['⌃ rechts in der Tableiste', 'einklappen – Maus an den Strich (oder antippen) zeigt die Tabs'],
      ['Trennlinie ziehen / doppelklicken', 'Grösse der Bereiche / gleich gross'],
      ['h', 'Allgemein'],
      ['Strg + Z / Strg + Y', 'rückgängig / wiederholen (100 Schritte)'],
      ['Strg + C / X / V / D', 'kopieren / ausschneiden / einfügen / duplizieren'],
      ['Strg + F / Strg + H', 'suchen / ersetzen (alle Seiten; ausserhalb von Text auch Strg + E)'],
      ['Strg + P', 'Drucken (Seite, Abschnitt, Notizbuch oder Auswahl – mit Vorschau)'],
      ['Strg + S', 'sofort speichern (passiert sonst automatisch)'],
      ...(document.body.classList.contains('touch') || document.body.classList.contains('lay-drawer') ? [] : touchRows),
    ];
    const html = '<div class="keys">' + rows.map(([a, b]) => a === 'h' ? `<div class="kh">${b}</div>` : `<div><kbd>${escapeHtml(a)}</kbd></div><div class="kd">${escapeHtml(b)}</div>`).join('') + '</div>';
    UI.info('Tastenkürzel & Bedienung', html, { wide: true });
  },
  showAbout() {
    const i = Store.info || {};
    setTimeout(() => this.fillStorageInfo(), 30);
    UI.info('Über KnowledgeTree', `<div class="about-logo"></div>
      <p><b>KnowledgeTree ${escapeHtml(i.version || '')}</b> – by ${escapeHtml(i.author || 'TheDragonas')}<br>Ein digitales Freiform-Notizbuch zum Brainstormen: Notizbücher, Abschnitte, Seiten, freie Textfelder, Zeichnungen, Pakete und Verbindungen.</p>
      <p>Alles wird laufend automatisch gespeichert.</p>
      ${Backend.aboutHtml(i)}
      <p style="margin:0">Rückgängig-Verlauf: ${Hist.undo.length} / ${Hist.max} Schritte · ${Object.keys(Store.pages).length} Seiten in ${Tree.sections().length} Abschnitten und ${Store.groups.filter(g => g.kind === 'notebook').length} Notizbüchern</p>`);
  },
  /* ---------------------------------------------------------- Webseiten-Version: Sicherung & Papierkorb */
  async fillStorageInfo() {
    if (!Backend.storageInfo) return;
    const info = await Backend.storageInfo();
    const p = document.getElementById('kt-storage');
    if (!p) return;
    if (!info) { p.textContent = ''; return; }
    const mb = (b) => (b / 1024 / 1024).toFixed(1).replace('.', ',') + ' MB';
    p.textContent = `Belegt: ${mb(info.usage)} von ca. ${mb(info.quota)} · ` + (info.persisted ? 'dauerhaft gespeichert ✓' : 'Browser darf bei Platzmangel aufräumen – Backups machen!');
  },
  /* ---------------------------------------------------------- Backup erstellen / laden (seit 1.24 in beiden Versionen gleich)
   * Format: KnowledgeTree-Datei (ZIP im Format des Saves-Ordners, ktfile.js). Programm: ZIP in Cache/Backups (macht
   * der Server); Browser: in den Sicherungsordner (Einstellungen) oder als Download. */
  async createBackup(opts = {}) {
    if (Store.readOnly) return false;
    Canvas.stopEditing();
    Hist.flushPending();
    // Browser: die Erlaubnis für den Sicherungsordner zuerst erfragen – das geht nur kurz nach dem Klick
    const folder = Backend.kind === 'browser' && !opts.download ? await AutoBackup.folder(true) : null;
    await Save.flushAll();
    if (Backend.kind === 'server') {
      UI.toast('Backup wird erstellt …', 600000);
      try { UI.toast(await Backend.backup(), 4500); return true; } catch (e) { UI.toast('Backup fehlgeschlagen: ' + e.message, 5000); return false; }
    }
    const prog = Export.progress(Backend.kind === 'datei' ? 'Datei speichern …' : 'Backup erstellen …');
    try {
      const msg = await Backend.backup({ folder, keep: Store.ui.sicherung.anzahl, prog, check: () => Export.checkCancel() });
      if (Backend.kind === 'browser') AutoBackup.done();
      UI.toast(msg, 5000);
      return true;
    } catch (e) {
      UI.toast(e && e.cancelled ? 'Abgebrochen' : (Backend.kind === 'datei' ? 'Speichern fehlgeschlagen: ' : 'Backup fehlgeschlagen: ') + e.message, 5000);
      return false;
    } finally { prog.close(); Export.cancelled = false; }
  },
  pickFile(accept) {
    return new Promise((res) => {
      const inp = el('input', { type: 'file', accept, style: { display: 'none' } });
      inp.addEventListener('change', () => { res(inp.files[0] || null); inp.remove(); });
      document.body.append(inp);
      inp.click();
    });
  },
  /* Ordner wählen (Sicherungsordner wie bei OneNote, Saves-Ordner) → { name, entries } */
  pickFolder() {
    return new Promise((res) => {
      const inp = el('input', { type: 'file', multiple: true, style: { display: 'none' } });
      inp.webkitdirectory = true; inp.setAttribute('webkitdirectory', ''); inp.setAttribute('directory', '');
      inp.addEventListener('change', () => {
        const files = [...inp.files];
        inp.remove();
        if (!files.length) { res(null); return; }
        const top = (files[0].webkitRelativePath || files[0].name).split('/')[0];
        res({ name: top, entries: files.map(f => ({ name: f.webkitRelativePath || f.name, size: f.size, blob: async () => f, read: async () => new Uint8Array(await f.arrayBuffer()) })) });
      });
      document.body.append(inp);
      inp.click();
    });
  },
  /* Sicherung wählen: vorhandene Backups (Programm: Cache/Backups, Browser: Sicherungsordner), eine Datei oder
     einen Ordner (Sicherung wie bei OneNote, Saves-Ordner) */
  async chooseBackup() {
    let list = [];
    try { list = Backend.listBackups ? await Backend.listBackups() : Backend.kind === 'browser' ? await AutoBackup.folderList() : []; } catch (e) { list = []; }
    const v = await UI.dialog((d, close) => {
      d.append(el('h2', { text: 'Backup laden' }));
      if (list.length) {
        const rows = el('div', { class: 'bk-list' });
        list.slice(0, 60).forEach((b, i) => rows.append(el('button', {
          class: 'bk-row' + (i ? '' : ' first'), onclick: () => close({ item: b }),
          html: `<span class="bk-ic">${icon(b.ordner ? 'folder' : 'archive', 18)}</span><span class="bk-t"><b>${escapeHtml(new Date(b.zeit).toLocaleString('de-CH', { dateStyle: 'medium', timeStyle: 'short' }))}</b><span>${escapeHtml(b.name)}${b.ordner ? ' (Ordner)' : ''}</span></span><span class="bk-s">${KtFile.size(b.groesse)}</span>`,
        })));
        d.append(el('p', { text: Backend.kind === 'server' ? 'Backups in Cache/Backups (neueste zuerst):' : 'Backups im Sicherungsordner (neueste zuerst):' }), rows);
      }
      d.append(el('p', { class: list.length ? 'dlg-note' : '', html: 'Einlesen lassen sich: <b>Backup-Ordner</b> (wie bei OneNote: ein Ordner je Notizbuch, eine Datei je Abschnitt) und ihre ZIP-Datei, <b>KnowledgeTree-Dateien</b> (.knowledgetree.html, .zip oder .json – auch aus älteren Versionen), Backups des Windows-Programms und ein <b>Saves-Ordner</b>.' }),
        el('div', { class: 'dlg-btns' }, el('button', { class: 'btn', text: 'Abbrechen', onclick: () => close(null) }),
          el('button', { class: 'btn', text: 'Ordner wählen …', onclick: () => close({ file: this.pickFolder() }) }),
          el('button', { class: 'btn primary', text: 'Datei wählen …', onclick: () => close({ file: this.pickFile(KtFile.ACCEPT) }) })));
    }, { wide: true });
    if (!v) return null;
    if (v.file) return v.file;
    UI.toast('Sicherung wird geholt …', 120000);
    try { return await v.item.get(); } catch (e) { UI.toast('Sicherung konnte nicht geöffnet werden: ' + e.message, 5000); return null; }
  },
  async restoreBackup(file) {
    if (Store.readOnly) return;
    if (!file) file = await this.chooseBackup();
    if (!file) return;
    let data;
    UI.toast('Sicherung wird gelesen …', 600000);
    try { data = await KtFile.read(file); }
    catch (e) { UI.toast('Backup konnte nicht gelesen werden: ' + e.message, 5000); return; }
    UI.toast('', 1);
    const n = Object.keys(data.seiten).length, nb = (data.bilder || []).length;
    // Bilder, die weder in der Datei noch hier vorhanden sind (z.B. Backup ohne Bilder von einem anderen Computer)
    let lost = 0;
    if ((data.fehlend || []).length) { try { const have = Backend.hasAssets ? await Backend.hasAssets(data.fehlend) : new Set(); lost = data.fehlend.filter(x => !have.has(x)).length; } catch (e) { lost = data.fehlend.length; } }
    const res = await UI.dialog((d, close) => {
      const safe = el('input', { type: 'checkbox', checked: true });
      const when = new Date(data.erstellt);
      d.append(el('h2', { text: 'Backup laden' }),
        el('p', { html: `<b>${escapeHtml(file.name || 'Sicherung')}</b><br>${n} Seite(n)${nb ? `, ${nb} Bild(er)/Anhänge` : ''}${isNaN(when) ? '' : ' · vom ' + escapeHtml(when.toLocaleString('de-CH'))}` }),
        data.ohneBilder || lost ? el('p', { class: 'dlg-note', text: (data.ohneBilder ? 'Diese Sicherung enthält keine Bilder (Backup des Windows-Programms bis 1.23 oder mit „Bilder mitsichern“ aus) – vorhandene Bilder werden weiter verwendet. ' : '') + (lost ? `${lost} Bild(er)/Anhänge fehlen hier und erscheinen als „Bild fehlt“.` : 'Alle Bilder sind vorhanden.') }) : null,
        el('p', { html: '<b>Zusätzlich hinzufügen:</b> die Notizbücher der Sicherung kommen zu deinen dazu.<br><b>Alles ersetzen:</b> dein aktueller Stand wird durch die Sicherung ersetzt.' }),
        el('label', { class: 'dlg-check' }, safe, el('span', { text: { server: 'Vor dem Ersetzen ein Backup des aktuellen Stands in Cache/Backups anlegen', datei: 'Vor dem Ersetzen den aktuellen Stand als Datei speichern' }[Backend.kind] || 'Vor dem Ersetzen den aktuellen Stand als Backup speichern' })),
        el('div', { class: 'dlg-btns' },
          el('button', { class: 'btn', text: 'Abbrechen', onclick: () => close(null) }),
          el('button', { class: 'btn', text: 'Zusätzlich hinzufügen', onclick: () => close({ mode: 'add' }) }),
          el('button', { class: 'btn danger', text: 'Alles ersetzen', onclick: () => close({ mode: 'replace', safe: safe.checked }) })));
    });
    if (!res) return;
    const mode = res.mode;
    Canvas.stopEditing();
    Hist.flushPending();
    if (mode === 'replace' && res.safe && !(await this.createBackup())) {
      if (!(await UI.confirm('Backup laden', 'Der aktuelle Stand konnte nicht gesichert werden. Trotzdem alles ersetzen?', { danger: true, ok: 'Trotzdem ersetzen' }))) return;
    }
    // Bilder übernehmen (nur fehlende) – erst danach die Seiten, damit nichts auf ein fehlendes Bild zeigt
    const prog = Export.progress('Backup laden …');
    let st;
    try { st = await KtFile.storeAssets(data, prog, () => Export.checkCancel()); }
    catch (e) { UI.toast(e && e.cancelled ? 'Backup laden abgebrochen' : 'Bilder konnten nicht übernommen werden: ' + e.message, 5000); return; }
    finally { prog.close(); Export.cancelled = false; }
    if (mode === 'add') {
      const { pages, groups } = Tree.fromBackup(data);   // neue IDs; alte Sicherungen (nur Gruppen) als eigenes Notizbuch
      Object.assign(Store.pages, pages);
      Store.groups.push(...groups);
    } else {
      const pages = {};
      for (const [id, raw] of Object.entries(data.seiten)) { const p = normPage(raw); if (p) { p.id = id; pages[id] = p; } }
      Store.pages = pages;
      Store.groups = data.gruppen || [];
    }
    data = null;
    Store.groups = Tree.norm(Store.groups);
    Tree.ensureQuick();
    for (const s of Tree.sections()) Tree.normLevels(s);
    Hist.undo = []; Hist.redo = [];
    Hist.init();
    Hist.persistSoon();
    for (const id of Object.keys(Store.pages)) Save.dirty.add(id);
    Save.treeDirty = true;
    UI.toast('Wird gespeichert …', 600000);
    await Save.flushAll();
    UI.updateUndo();
    Store.ui.currentPage = null;
    this.openFirstPage();
    Sidebar.render();
    UI.toast((mode === 'add' ? `${n} Seite(n) hinzugefügt` : 'Backup geladen') + (st && st.missing ? ` · ${st.missing} Bild(er) fehlen${st.failed ? ` (${st.failed} leer oder beschädigt)` : ''}` : ''), st && st.missing ? 7000 : 4000);
  },
  /* einzelnes Notizbuch als KnowledgeTree-Datei (gleiches Format wie ein Backup) */
  async exportNotebook(id) {
    const nb = Tree.group(id);
    if (!nb || nb.kind !== 'notebook') { UI.toast('Zuerst ein Notizbuch öffnen'); return; }
    await Save.flushAll();
    const prog = Export.progress('Notizbuch exportieren …');
    try {
      const fmt = Store.ui.exportKt || 'html';
      const r = await KtFile.writeAs(fmt, { groups: [JSON.parse(JSON.stringify(nb))], art: 'export', name: nb.name, prog, check: () => Export.checkCancel() });
      Export.download(KtFile.exportName(nb.name, fmt), r.blob);
      UI.toast(`Notizbuch „${nb.name}“ exportiert (${r.pages} Seiten, ${KtFile.size(r.blob.size)})`, 4000);
    } catch (e) { UI.toast(e && e.cancelled ? 'Export abgebrochen' : 'Export fehlgeschlagen: ' + e.message, 5000); }
    finally { prog.close(); Export.cancelled = false; }
  },

  /* ---------------------------------------------------------- Seitenversionen */
  async showVersions(pid) {
    if (!Backend.versionList) return;
    pid = pid || Canvas.pageId;
    if (!Store.pages[pid]) return;
    if (Canvas.pageId !== pid) this.openPage(pid);
    await Save.flushAll();
    let list;
    try { list = await Backend.versionList(pid); } catch (e) { UI.toast('Versionen konnten nicht gelesen werden'); return; }
    if (!list.length) {
      UI.info('Seitenversionen', `<p>Für „${escapeHtml(Store.pages[pid].title)}“ gibt es noch keine älteren Versionen.</p>
        <p>KnowledgeTree merkt sich automatisch frühere Stände einer Seite, sobald du sie länger bearbeitest (höchstens alle 10 Minuten eine Version, bis zu 50 pro Seite).</p>`);
      return;
    }
    this.preview = { pid, list, idx: 0 };
    document.body.classList.add('previewing');
    await this.showPreview();
  },
  async showPreview() {
    const pv = this.preview;
    if (!pv) return;
    const v = pv.list[pv.idx];
    let data;
    try { data = await Backend.versionGet(v.id); } catch (e) { data = null; }
    if (!this.preview || this.preview !== pv) return;
    if (!data) { UI.toast('Diese Version ist nicht mehr vorhanden'); return; }
    const page = normPage(JSON.parse(JSON.stringify(data)));
    page.id = pv.pid;
    pv.page = page;
    Canvas.showPage(page);
    $('#preview-glass').hidden = false;
    this.renderVersionBar();
  },
  renderVersionBar() {
    const pv = this.preview, bar = $('#version-bar');
    bar.innerHTML = '';
    bar.hidden = false;
    const sel = el('select', { title: 'Version wählen' });
    pv.list.forEach((x, i) => sel.append(el('option', { value: i, text: new Date(x.t).toLocaleString('de-CH', { dateStyle: 'medium', timeStyle: 'short' }) + (x.title ? ' – ' + x.title : '') })));
    sel.value = pv.idx;
    sel.addEventListener('change', () => { pv.idx = +sel.value; this.showPreview(); });
    const b = (txt, ic, fn, cls = '', title = '') => { const x = el('button', { class: 'btn ' + cls, title, html: (ic ? icon(ic, 14) : '') + `<span>${txt}</span>` }); x.addEventListener('click', fn); return x; };
    bar.append(
      el('span', { class: 'vb-ic', html: icon('versions', 18) }),
      el('div', { class: 'vb-text' }, el('b', { text: 'Seitenversion' }), el('span', { text: `${pv.idx + 1} von ${pv.list.length} · nur ansehen` })),
      b('', 'chevRight', () => { if (pv.idx < pv.list.length - 1) { pv.idx++; this.showPreview(); } }, 'ico flip' + (pv.idx >= pv.list.length - 1 ? ' dis' : ''), 'Ältere Version'),
      sel,
      b('', 'chevRight', () => { if (pv.idx > 0) { pv.idx--; this.showPreview(); } }, 'ico' + (pv.idx <= 0 ? ' dis' : ''), 'Neuere Version'),
      el('span', { class: 'vb-gap' }),
      b('Wiederherstellen', 'restore', () => this.restoreVersion(false), 'primary', 'Die aktuelle Seite durch diese Version ersetzen (rückgängig machbar)'),
      b('Als Kopie', 'duplicate', () => this.restoreVersion(true), '', 'Diese Version als neue Seite unter der aktuellen einfügen'),
      b('', 'trash', () => this.deleteVersion(), 'ico', 'Diese Version löschen'),
      b('Schliessen', 'x', () => this.endPreview(), '', 'Zur aktuellen Seite zurück (Esc)'),
    );
  },
  endPreview(silent) {
    if (!this.preview) return;
    const pid = this.preview.pid;
    this.preview = null;
    document.body.classList.remove('previewing');
    $('#version-bar').hidden = true;
    $('#preview-glass').hidden = true;
    if (!silent && Store.pages[pid]) Canvas.showPage(Store.pages[pid]);
    Ribbon.refreshSoon();
  },
  restoreVersion(asCopy) {
    const pv = this.preview;
    if (!pv || !pv.page) return;
    const cur = Store.pages[pv.pid];
    const s = Tree.groupOfPage(pv.pid);
    if (!cur || !s) { this.endPreview(); return; }
    Hist.flushPending();
    const page = normPage(JSON.parse(JSON.stringify(pv.page)));
    const when = new Date(pv.list[pv.idx].t).toLocaleString('de-CH', { dateStyle: 'short', timeStyle: 'short' });
    this.endPreview(true);
    if (asCopy) {
      page.id = uid('p');
      page.title = (page.title || 'Seite') + ` (Version ${when})`;
      page.level = Math.min(2, (cur.level || 0) + 1);
      page.created = Date.now();
      const blk = Tree.block(s, cur.id);
      s.pages.splice(s.pages.indexOf(blk[blk.length - 1]) + 1, 0, page.id);
      Store.pages[page.id] = page;
      Tree.normLevels(s);
      Hist.touchPage(page.id); Hist.touchTree(); Hist.commit('Version als Kopie eingefügt');
      this.openPage(page.id);
    } else {
      page.id = cur.id;
      page.level = cur.level || 0;
      page.created = cur.created;
      Store.pages[cur.id] = page;
      Hist.touchPage(cur.id); Hist.commit('Seitenversion wiederhergestellt');
      Canvas.load(cur.id);
      Sidebar.render();
    }
    UI.toast(`Version vom ${when} wiederhergestellt` + (asCopy ? ' (als Kopie)' : ' – Strg+Z macht es rückgängig'), 3500);
  },
  async deleteVersion() {
    const pv = this.preview;
    if (!pv) return;
    const v = pv.list[pv.idx];
    if (!(await UI.confirm('Diese Version löschen?', 'Die Version vom ' + new Date(v.t).toLocaleString('de-CH') + ' wird endgültig entfernt. Die aktuelle Seite bleibt unverändert.', { ok: 'Löschen', danger: true }))) return;
    await Backend.versionDelete([v.id]);
    pv.list.splice(pv.idx, 1);
    if (!pv.list.length) { this.endPreview(); UI.toast('Keine weiteren Versionen'); return; }
    pv.idx = Math.min(pv.idx, pv.list.length - 1);
    this.showPreview();
  },
  initPreviewGlass() {
    const g = $('#preview-glass');
    let drag = null;
    g.addEventListener('wheel', (e) => Canvas.onWheel(e), { passive: false });
    g.addEventListener('pointerdown', (e) => { e.preventDefault(); drag = { x: e.clientX, y: e.clientY, vx: Canvas.view.x, vy: Canvas.view.y }; g.setPointerCapture(e.pointerId); g.classList.add('grab'); });
    g.addEventListener('pointermove', (e) => { if (!drag) return; Canvas.view.x = drag.vx + e.clientX - drag.x; Canvas.view.y = drag.vy + e.clientY - drag.y; Canvas.applyView(); });
    const up = () => { drag = null; g.classList.remove('grab'); };
    g.addEventListener('pointerup', up);
    g.addEventListener('pointercancel', up);
    g.addEventListener('contextmenu', (e) => e.preventDefault());
  },
  async showTrash() {
    if (!Backend.trashList) { Backend.openFolder('papierkorb'); return; }
    const list = await Backend.trashList();
    await UI.dialog((d, close) => {
      d.append(el('h2', { text: 'Papierkorb & Speicher' }));
      d.append(el('p', { style: { color: 'var(--ink-3)', fontSize: '12px' }, text: 'Seit Version 1.20 wird Gelöschtes restlos entfernt (zurückholen mit Strg+Z). Hier stehen nur noch Seiten, die früher gelöscht wurden.' }));
      if (!list.length) { d.append(el('p', { text: 'Der Papierkorb ist leer.' })); }
      const box = el('div', { style: { maxHeight: '50vh', overflow: 'auto', margin: '0 -6px' } });
      for (const it of list) {
        const row = el('div', { class: 'mi', style: { height: 'auto', padding: '6px 8px', alignItems: 'center' } });
        const info = el('div', { style: { flex: 1, minWidth: 0 } },
          el('div', { style: { fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis' }, text: it.title || (it.page && it.page.title) || 'Unbenannte Seite' }),
          el('div', { style: { fontSize: '11px', color: 'var(--ink-3)' }, text: (it.path || []).map(x => x.name).join(' › ') + ' · gelöscht ' + new Date(it.deletedAt).toLocaleString('de-CH') }));
        info.title = 'Wird in den ursprünglichen Abschnitt zurückgelegt (falls es ihn nicht mehr gibt: in die Schnellnotizen)';
        const restore = el('button', { class: 'btn', text: 'Wiederherstellen' });
        const del = el('button', { class: 'btn', title: 'Endgültig löschen', html: icon('trash', 14), style: { padding: '0 8px', marginLeft: '6px' } });
        restore.addEventListener('click', async () => {
          const raw = it.page || (Backend.trashGet ? await Backend.trashGet(it.id) : null);
          if (!raw) { UI.toast('Seite nicht mehr vorhanden'); row.remove(); return; }
          const p = normPage(JSON.parse(JSON.stringify(raw)));
          if (Store.pages[p.id]) p.id = uid('p');
          let g = null;
          for (const x of [...(it.path || [])].reverse()) { const c = Tree.group(x.id); if (Tree.isSection(c)) { g = c; break; } if (Tree.isContainer(c)) { g = Tree.firstSection(c); if (g) break; } }
          if (!g || Tree.notebookOf(g.id)?.closed) { Tree.ensureQuick(); g = Tree.quick(); }
          p.level = 0;
          Store.pages[p.id] = p;
          g.pages.push(p.id);
          Hist.touchPage(p.id); Hist.touchTree(); Hist.commit('Seite wiederhergestellt');
          await Backend.trashRemove([it.id]);
          close(true);
          this.openPage(p.id);
          UI.toast('Seite wiederhergestellt');
        });
        del.addEventListener('click', async () => { await Backend.trashRemove([it.id]); row.remove(); App.cleanupSoon(); });
        row.append(info, restore, del);
        box.append(row);
      }
      d.append(box);
      const info = el('p', { style: { color: 'var(--ink-3)', fontSize: '12px' }, text: 'Speicher wird geprüft …' });
      d.append(info);
      const showInfo = async () => { const si = Backend.storageInfo ? await Backend.storageInfo() : null; info.textContent = si && si.quota ? `Belegt: ${Math.round(si.usage / 1e6)} MB von ${Math.round(si.quota / 1e6)} MB, die der Browser dieser Seite erlaubt.` : ''; };
      showInfo();
      const tidy = async (emptyTrash) => {
        if (emptyTrash) await Backend.trashRemove(list.map(x => x.id));
        info.textContent = 'Wird aufgeräumt …';
        const r = await this.cleanupStorage({ grace: 0 });
        UI.toast(r ? `Aufgeräumt: ${r.bilder} Bilder/Anhänge (${Math.round(r.bytes / 1e6)} MB)${r.versionen ? `, ${r.versionen} alte Versionen` : ''}` : 'Aufräumen nicht möglich', 4500);
        if (emptyTrash) close(true); else showInfo();
      };
      d.append(el('div', { class: 'dlg-btns' },
        list.length ? el('button', { class: 'btn', text: 'Papierkorb leeren', onclick: async () => { if (await UI.confirm('Papierkorb leeren?', 'Die Seiten sind danach endgültig weg – samt ihren Bildern und Anhängen.', { ok: 'Leeren', danger: true })) await tidy(true); } }) : null,
        el('button', { class: 'btn', text: 'Speicher aufräumen', title: 'Bilder und Anhänge entfernen, die keine Seite (und kein Strg+Z) mehr braucht', onclick: () => tidy(false) }),
        el('button', { class: 'btn primary', text: 'Schliessen', onclick: () => close(true) })));
    }, { wide: true });
  },

  async quit() {
    UI.toast('Speichere …');
    await this.closeGracefully();
    window.close();
    setTimeout(() => {
      document.body.innerHTML = '<div style="display:flex;height:100vh;align-items:center;justify-content:center;font:16px Segoe UI;color:#666">KnowledgeTree wurde beendet. Du kannst dieses Fenster schliessen.</div>';
    }, 400);
  },
  async closeGracefully() {
    try {
      Canvas.stopEditing();
      await Save.flushAll();
      await Hist.persist();
      await UiState.save();
    } catch (e) { /* trotzdem beenden */ }
    if (Backend.quit) await Backend.quit();
  },

  /* ---------------------------------------------------------- Erste Schritte */
  createWelcome() {
    const sec = (name, color) => ({ id: uid('g'), name, color, kind: 'section', groups: [], pages: [] });
    const nb = { id: uid('g'), name: 'Mein Notizbuch', color: '#6b4fbb', kind: 'notebook', groups: [], pages: [] };
    const s1 = sec('Erste Schritte', '#6b4fbb'), s2 = sec('Ideen', '#038387');
    const arch = { id: uid('g'), name: 'Archiv', color: '', kind: 'group', groups: [], pages: [] };
    const s3 = sec('Beispiele', '#ca5010');
    arch.groups.push(s3);
    nb.groups.push(s1, s2, arch);
    Store.groups.push(nb);

    const b = (x, y, w, html, extra = {}) => ({ id: uid('b'), x, y, w, html, images: [], z: 1, style: {}, locked: false, pkg: null, ...extra });
    const yellow = { bg: '#FFF4C2', border: '#E8C547', color: '#252423' };
    const add = (s, p, level = 0) => { p.level = level; Store.pages[p.id] = p; s.pages.push(p.id); return p; };

    // Erste Schritte (seit 1.36 eine Seite je Bereich, mit kurzen Anleitungen und lebenden Beispielen – guide.js)
    let first = null;
    for (const k of Guide.ORDER) {
      try { const pg = add(s1, Guide.makePage(k), k === 'willkommen' ? 0 : 1); if (!first) first = pg; } catch (e) { console.warn('[KnowledgeTree] Erste Schritte:', k, e); }
    }
    const p = first;

    const pi = newPage('Brainstorming');
    pi.bg = 'raster';
    pi.boxes.push(b(0, 0, 300, '<h2>Ideen sammeln</h2><div>Hier ist Platz für deine nächsten Ideen.</div>', { style: yellow }));
    add(s2, pi);

    const p2 = newPage('Meine Notizen');
    p2.bg = 'linien';
    p2.boxes.push(b(0, 0, 380, '<h2>Abschnitt in einer Abschnittsgruppe</h2><div>Abschnittsgruppen sind wie Ordner für Abschnitte. Rechtsklick in der Liste links oder auf die Register oben für neue Abschnitte, Gruppen und Notizbücher.</div>'));
    add(s3, p2);

    Store.ui.currentGroup = s1.id;
    Store.ui.currentPage = p.id;
  },
};

/* Wird vom Programmfenster aufgerufen, bevor es schliesst */
window.KT_appClosing = () => App.closeGracefully();

window.addEventListener('error', (e) => { console.error(e.error || e.message); });
document.addEventListener('DOMContentLoaded', () => App.boot());
