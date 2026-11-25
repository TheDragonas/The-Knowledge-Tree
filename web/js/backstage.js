'use strict';
/* Datei-Fenster (seit 1.34) – aufgebaut wie die Backstage-Ansicht von OneNote: links eine farbige Leiste mit Zurück-Pfeil
 * und den Bereichen (Informationen, Neu, Öffnen, Speichern & Sichern, Exportieren, Drucken, Hilfe; unten Optionen und
 * – im Programm – Beenden), rechts der gewählte Bereich mit grossem Titel. Bis 1.33 war „Datei“ ein Menüband-Register.
 * Alle Funktionen von dort sind geblieben, nur nach Bereichen geordnet:
 *   Informationen   Notizbücher (Abschnitte/Seiten, Speicherort, Schliessen/Öffnen, als Datei, exportieren),
 *                   aktuelle Seite (umbenennen, duplizieren, verschieben, Seitenversionen, löschen), Speicher & Ordner
 *   Neu             Seite, Unterseite, Abschnitt, Abschnittsgruppe, Notizbuch, Schnellnotiz
 *   Öffnen          geschlossene Notizbücher, Importieren (Dateien, Ordner), Backup laden
 *   Speichern       Jetzt speichern bzw. Datei speichern, Backup erstellen/laden, Papierkorb, Backups-Ordner
 *   Exportieren     wie in OneNote in zwei Schritten: was (Seite, Abschnitt, Notizbuch) und Format → Exportieren …
 *   Drucken         Drucken (Vorschau) und Druckeinstellungen
 *   Hilfe           Erste Schritte, Tastenkürzel, Info
 *   Optionen        öffnet die Einstellungen; Beenden (Programm)
 * Öffnen: Register „Datei“ (oder Ribbon.show('datei')); schliessen: Zurück-Pfeil, Esc. Eine Aktion schliesst das
 * Fenster und führt dann den Befehl aus (Cmd.run – gleiche Prüfungen wie im Menüband). */

const Backstage = {
  page: 'info',
  isOpen() { return !!(this.el && !this.el.hidden); },

  /* Bereiche: [id, Titel in der Leiste, Symbol, Titel rechts] */
  pages() {
    const file = Backend.kind === 'datei';
    return [
      ['info', 'Informationen', 'info', file ? 'Informationen zur Datei' : 'Notizbuchinformationen'],
      ['neu', 'Neu', 'plus', 'Neu'],
      ['oeffnen', 'Öffnen', 'book', 'Öffnen und Importieren'],
      ['speichern', file ? 'Speichern' : 'Speichern & Sichern', 'save', file ? 'Speichern' : 'Speichern und Sichern'],
      ['exportieren', 'Exportieren', 'export', 'Exportieren'],
      ['drucken', 'Drucken', 'print', 'Drucken'],
      ['hilfe', 'Hilfe', 'help', 'Hilfe'],
    ];
  },

  build() {
    const bs = el('div', { id: 'backstage', class: 'bs', hidden: true, role: 'dialog', 'aria-label': 'Datei' });
    const nav = el('nav', { class: 'bs-nav' });
    const back = el('button', { class: 'bs-back', type: 'button', title: 'Zurück (Esc)', html: icon('arrowLeft', 22) });
    back.addEventListener('click', () => this.close());
    nav.append(back);
    for (const [id, label, ic] of this.pages()) nav.append(this.navBtn(id, label, ic));
    nav.append(el('div', { class: 'bs-grow' }));
    nav.append(this.navBtn('optionen', 'Optionen', 'settings', () => this.run('settings')));
    if (Backend.kind === 'server') nav.append(this.navBtn('beenden', 'Beenden', 'power', () => this.run('quit')));
    this.main = el('main', { class: 'bs-main' });
    bs.append(nav, this.main);
    // Esc schliesst (auch wenn der Fokus nicht im Fenster liegt) – Dialoge darüber schliessen zuerst sich selbst
    window.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape' || !this.isOpen() || document.querySelector('.dlg-back') || (UI.popupOpen && UI.popupOpen())) return;
      e.preventDefault(); e.stopPropagation(); this.close();
    }, true);
    $('#app').append(bs);
    this.el = bs;
    this.nav = nav;
  },
  navBtn(id, label, ic, onClick) {
    const b = el('button', { class: 'bs-item', type: 'button', dataset: { p: id }, html: `${icon(ic, 18)}<span></span>` });
    b.querySelector('span').textContent = label;
    b.addEventListener('click', onClick || (() => this.show(id)));
    return b;
  },

  open(page) {
    if (!this.el) this.build();
    if (Store.readOnly && page !== 'hilfe') page = 'info';
    Canvas.stopEditing();
    Hist.flushPending();
    UI.closePopup && UI.closePopup();
    // Titelleiste bleibt sichtbar (Fensterknöpfe, Rückgängig) – das Fenster liegt darunter
    const tb = $('#titlebar');
    this.el.style.top = (tb && tb.offsetParent ? Math.round(tb.getBoundingClientRect().bottom) : 0) + 'px';
    this.el.hidden = false;
    document.body.classList.add('bs-open');
    $$('#tabs .tab').forEach(t => t.classList.toggle('on', t.dataset.tab === 'datei'));
    this.show(page || this.page);
    if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur();   // Tasten nicht in die Seite
  },
  close() {
    if (!this.isOpen()) return;
    this.el.hidden = true;
    document.body.classList.remove('bs-open');
    $$('#tabs .tab').forEach(t => t.classList.toggle('on', t.dataset.tab === Ribbon.tab));
  },
  /* Aktion: Fenster zu, dann Befehl (wie aus dem Menüband) */
  run(cmd, arg) { this.close(); setTimeout(() => (typeof cmd === 'function' ? cmd() : Cmd.run(cmd, arg)), 0); },

  show(id) {
    const p = this.pages().find(x => x[0] === id) || this.pages()[0];
    this.page = p[0];
    for (const b of this.nav.querySelectorAll('.bs-item')) b.classList.toggle('on', b.dataset.p === this.page);
    // schmal (Leiste oben, waagrecht scrollbar): gewählten Bereich ins Bild holen
    const on = this.nav.querySelector('.bs-item.on');
    if (on && this.nav.scrollWidth > this.nav.clientWidth) on.scrollIntoView({ block: 'nearest', inline: 'center' });
    const m = this.main;
    m.innerHTML = '';
    m.append(el('h1', { class: 'bs-title', text: p[3] }));
    this['page_' + this.page](m);
    m.scrollTop = 0;
  },

  /* ---------------------------------------------------------- Bausteine */
  // grosse Kachel (Symbol, Titel, Beschreibung) wie in OneNote unter „Neu“/„Drucken“
  tile(ic, title, desc, act, opts = {}) {
    const b = el('button', { class: 'bs-tile' + (opts.danger ? ' danger' : ''), type: 'button', html: `<span class="bs-ic">${icon(ic, 26)}</span><span class="bs-tt"><b></b><small></small></span>` });
    b.querySelector('b').textContent = title;
    b.querySelector('small').textContent = desc || '';
    const cmd = typeof act === 'string' ? act : null;
    if (cmd && (Store.readOnly || !Cmd.enabled(cmd))) b.disabled = true;
    if (opts.disabled) b.disabled = true;
    b.addEventListener('click', () => (cmd ? this.run(cmd, opts.arg) : act(b)));
    return b;
  },
  tiles(...list) { return el('div', { class: 'bs-tiles' }, ...list.filter(Boolean)); },
  section(title, ...kids) { return el('section', { class: 'bs-sec' }, el('h2', { text: title }), ...kids.filter(Boolean)); },
  note(text) { return el('p', { class: 'bs-note', text }); },
  btn(text, act, opts = {}) {
    const b = el('button', { class: 'btn' + (opts.primary ? ' primary' : ''), type: 'button', text });
    if (opts.disabled) b.disabled = true;
    b.addEventListener('click', act);
    return b;
  },
  counts(g) {
    const secs = [], walk = (x) => { for (const s of x.groups) { if (Tree.isSection(s)) secs.push(s); walk(s); } };
    walk(g);
    return { sections: secs.length, pages: Tree.pagesDeep(g).length };
  },
  where() {
    if (Backend.kind === 'server') return Store.info.saves ? 'Ordner „Saves“: ' + Store.info.saves : 'Ordner „Saves“ neben dem Programm';
    if (Backend.kind === 'datei') return 'Interaktive Datei „' + (Backend.fileName || 'KnowledgeTree-Datei') + '“ – Änderungen bleiben in diesem Fenster, bis du die Datei speicherst';
    return 'In diesem Browser gespeichert (IndexedDB)';
  },

  /* ---------------------------------------------------------- Informationen */
  page_info(m) {
    // Office-Seite (1.65): wie „Datei“ in Word/Excel/PowerPoint – Speichern unter, Original, neu einlesen
    const op = typeof OfficePages !== 'undefined' && OfficePages.page();
    if (op) {
      const o = op.office, what = { docx: 'Word-Dokument (.docx)', xlsx: 'Excel-Arbeitsmappe (.xlsx)', pptx: 'PowerPoint-Präsentation (.pptx)' }[o.fmt];
      // 1.72: Speichern unter direkt hier – Dateiname, Dateityp (Auswahlliste, voreingestellt das neueste Format), Speichern
      m.append(this.section(OfficePages.ICON[o.fmt] + ' ' + OfficePages.LABEL[o.fmt] + ' – ' + o.name, el('div', { class: 'bs-sub', text: 'Speichern unter' }), OfficeIO.savePanel(op),
        this.note('Voreingestellt ' + what + ' – mit allen Änderungen; Unverändertes bleibt Byte für Byte wie im Original.'), this.tiles(
        this.tile('file', 'Original speichern', o.src ? 'Die Datei, wie sie importiert wurde (' + o.src.name + ')' : 'Die importierte bzw. erstellte Datei unverändert', 'officeOriginal'),
        this.tile('print', 'Drucken / PDF …', 'Mit Vorschau drucken oder als PDF speichern (Strg+P)', 'print'),
        this.tile('restore', 'Neu einlesen', 'Inhalt aus der Datei (mit deinen Änderungen) neu aufbauen – eigene Notizen bleiben', 'officeRebuild'),
        o.fmt === 'pptx' ? this.tile('play', 'Vorführen', 'Bildschirmpräsentation von Beginn an (F5)', 'showStart') : null), this.note('Die Seite ist die Datei: alles auf dem Papier, in den Blättern bzw. auf den Folien gehört dazu, Felder daneben sind eigene Notizen.')));
      // 1.73: wie „Informationen“ in Office – Eigenschaften, Schützen, Prüfen
      if (typeof OfficeUI !== 'undefined') m.append(...OfficeUI.infoSections(op, this));
    }
    const cur = Canvas.pageId && Tree.groupOfPage(Canvas.pageId), curNb = cur ? Tree.notebookOf(cur.id) : null;
    const list = el('div', { class: 'bs-list' });
    for (const nb of Store.groups.filter(g => g.kind === 'notebook')) {
      const c = this.counts(nb);
      const row = el('div', { class: 'bs-row' + (nb === curNb ? ' cur' : '') + (nb.closed ? ' closed' : '') });
      const ic = el('span', { class: 'bs-book', html: icon(nb.closed ? 'bookClosed' : 'book', 30) });
      ic.style.color = nb.color || 'var(--accent)';
      const txt = el('div', { class: 'bs-rtxt' }, el('b', { text: nb.name }), el('small', { text: `${c.sections} ${c.sections === 1 ? 'Abschnitt' : 'Abschnitte'} · ${c.pages} ${c.pages === 1 ? 'Seite' : 'Seiten'}${nb.closed ? ' · geschlossen' : ''}` }));
      const set = this.btn('Einstellungen', () => UI.menu([
        { head: nb.name },
        nb.closed ? { label: 'Öffnen', icon: 'book', action: () => { Ops.reopenNotebook(nb.id); this.show('info'); } } : { label: 'Schliessen', icon: 'bookClosed', action: () => { Ops.closeNotebook(nb.id); this.show('info'); } },
        { label: 'Als KnowledgeTree-Datei speichern …', icon: 'archive', action: () => this.run(() => App.exportNotebook(nb.id)) },
        { label: 'Exportieren …', icon: 'export', action: () => this.run(() => Export.show({ group: nb.id })) },
      ], 0, 0, { anchor: set }));
      if (Store.readOnly) set.disabled = true;
      row.append(ic, txt, set);
      list.append(row);
    }
    m.append(this.section('Notizbücher', list, this.note(this.where())));
    // aktuelle Seite (früher Datei → Seite)
    const p = Canvas.page;
    if (p) {
      m.append(this.section('Aktuelle Seite',
        el('div', { class: 'bs-page' }, el('b', { text: p.title || 'Unbenannte Seite' }), el('small', { text: `Erstellt ${fmtDate(p.created)} · geändert ${fmtDate(p.modified)}${cur ? ' · Abschnitt „' + cur.name + '“' : ''}` })),
        this.tiles(
          this.tile('pencil', 'Umbenennen', 'Titel der Seite ändern (F2)', 'renamePage'),
          this.tile('duplicate', 'Duplizieren', 'Kopie dieser Seite im selben Abschnitt', 'dupPage'),
          this.tile('folder', 'Verschieben nach …', 'Seite (mit Unterseiten) in einen anderen Abschnitt', 'movePage'),
          this.tile('versions', 'Seitenversionen', 'Ältere Stände ansehen und wiederherstellen', 'versions'),
          this.tile('trash', 'Löschen', 'Seite löschen (Strg+Z holt sie zurück)', 'deletePage', { danger: true }))));
    }
    // Speicher und Ordner
    const extra = [this.tile('info', Backend.kind === 'browser' ? 'Info & Speicher' : 'Info', 'Version, Speicherplatz, Datenstand', 'about')];
    if (Backend.kind === 'server') extra.push(
      this.tile('folder', 'Saves-Ordner öffnen', 'Deine Daten: Notizbücher als Ordner, je Abschnitt mit seinen Bildern', 'openSaves'),
      this.tile('folder', 'Cache-Ordner öffnen', 'Verlauf, Zustand, Log', 'openCache'),
      this.tile('trash', 'Papierkorb öffnen', 'Gelöschte Seiten und Abschnitte', 'openTrash'));
    if (Backend.kind === 'browser') extra.push(this.tile('trash', 'Papierkorb', 'Früher gelöschte Seiten wiederherstellen, Speicher aufräumen', 'trash'));
    m.append(this.section('Speicher', this.tiles(...extra)));
  },

  /* ---------------------------------------------------------- Neu */
  page_neu(m) {
    m.append(this.section('Erstellen', this.tiles(
      this.tile('bookPlus', 'Notizbuch', 'Neues Notizbuch mit einem ersten Abschnitt', 'newNotebook'),
      this.tile('tabPlus', 'Abschnitt', 'Neuer Abschnitt im aktuellen Notizbuch', 'newSection'),
      this.tile('folderPlus', 'Abschnittsgruppe', 'Ordner für mehrere Abschnitte', 'newSectionGroup'),
      this.tile('pagePlus', 'Seite', 'Neue Seite im aktuellen Abschnitt (Alt+N)', 'newPage'),
      this.tile('officeDoc', 'Word-Dokument', 'Neue Seite als Word-Dokument (.docx)', 'newTypedPage', { arg: 'docx' }),
      this.tile('table', 'Excel-Arbeitsmappe', 'Neue Seite als Excel-Arbeitsmappe (.xlsx)', 'newTypedPage', { arg: 'xlsx' }),
      this.tile('slides', 'PowerPoint-Präsentation', 'Neue Seite als PowerPoint-Präsentation (.pptx)', 'newTypedPage', { arg: 'pptx' }),
      this.tile('import', 'Office-Datei öffnen …', 'Word, Excel, PowerPoint – auch .csv, .xls, .doc, .ppt, .rtf, .ods, .odt, .odp, .txt (wird in das neueste Format umgewandelt)', 'officeOpen'),
      this.tile('subpage', 'Unterseite', 'Unter der aktuellen Seite (Strg+Alt+N)', 'newSubpage'),
      this.tile('bolt', 'Schnellnotiz', 'Rasch etwas notieren (Alt+Umsch+N)', 'quickNote'))));
  },

  /* ---------------------------------------------------------- Öffnen */
  page_oeffnen(m) {
    const closed = Store.groups.filter(g => g.kind === 'notebook' && g.closed);
    const list = el('div', { class: 'bs-list' });
    for (const nb of closed) {
      const c = this.counts(nb);
      const row = el('div', { class: 'bs-row closed' });
      const ic = el('span', { class: 'bs-book', html: icon('bookClosed', 30) });
      ic.style.color = nb.color || 'var(--accent)';
      row.append(ic, el('div', { class: 'bs-rtxt' }, el('b', { text: nb.name }), el('small', { text: `${c.sections} Abschnitte · ${c.pages} Seiten` })),
        this.btn('Öffnen', () => { Ops.reopenNotebook(nb.id); this.close(); }, { primary: true, disabled: Store.readOnly }));
      list.append(row);
    }
    // 1.72: Office-Dateien mit Dateityp-Auswahl (filtert die Dateiauswahl) und Ablagefläche
    if (typeof OfficeIO !== 'undefined') m.append(this.section('Office-Datei öffnen', OfficeIO.openPanel(() => this.close())));
    m.append(this.section('Geschlossene Notizbücher', closed.length ? list : this.note('Keine geschlossenen Notizbücher – geschlossene erscheinen hier (Informationen → Einstellungen → Schliessen).')));
    m.append(this.section('Importieren',
      this.tiles(
        this.tile('import', 'Dateien wählen …', 'KnowledgeTree-Datei oder Backup, OneNote (.one, .onepkg), ZIP/RAR einer OneNote-Sicherung, Bilder, PDF, Word/Excel, CSV – wird selbst erkannt', 'importAuto'),
        this.tile('folderImport', 'Ordner wählen …', 'Backup-Ordner, Notizbuch-Ordner, OneNote-Sicherung, Saves-Ordner', 'importFolder'),
        this.tile('restore', 'Backup laden …', 'Backup oder KnowledgeTree-Datei – hinzufügen oder alles ersetzen', 'restore')),
      this.note('Dateien lassen sich auch einfach auf das Fenster ziehen.')));
  },

  /* ---------------------------------------------------------- Speichern & Sichern */
  page_speichern(m) {
    if (Backend.kind === 'datei') {
      m.append(this.section('Datei', this.tiles(
        this.tile('save', 'Datei speichern', 'Diese interaktive Datei mit allen Änderungen neu herunterladen (Strg+S)', 'backup'),
        this.tile('restore', 'Backup laden …', 'Backup oder KnowledgeTree-Datei einlesen', 'restore')),
      this.note(Backend.dirty ? 'Es gibt Änderungen, die noch nicht in einer Datei gespeichert sind.' : 'Keine ungespeicherten Änderungen.')));
      return;
    }
    m.append(this.section('Speichern', this.tiles(
      this.tile('save', 'Jetzt speichern', 'Alles sofort speichern (Strg+S) – passiert sonst automatisch', 'save')),
    this.note(Save.state === 'saved' ? 'Alle Änderungen sind gespeichert.' : Save.state === 'error' ? 'Speichern fehlgeschlagen – siehe Statusleiste.' : 'Wird gespeichert …')));
    const bk = [
      this.tile('archive', 'Backup erstellen', Backend.kind === 'browser'
        ? 'Wie bei OneNote: ein Ordner je Notizbuch, eine Datei je Abschnitt (mit Bildern) – in den Sicherungsordner oder als ZIP'
        : 'Wie bei OneNote in Cache/Backups: ein Ordner je Notizbuch, eine Datei je Abschnitt mit seinen Bildern', 'backup'),
      this.tile('restore', 'Backup laden …', 'Ein Backup (Ordner oder ZIP) oder eine KnowledgeTree-Datei – hinzufügen oder alles ersetzen', 'restore'),
    ];
    if (Backend.kind === 'server') bk.push(this.tile('archive', 'Backups öffnen', 'Ordner Cache/Backups im Explorer', 'openBackups'));
    bk.push(this.tile('settings', 'Automatische Sicherung …', 'Wann und wie viele Backups (Einstellungen → Sicherung)', () => this.run(() => Settings.show('sicherung'))));
    m.append(this.section('Sichern', this.tiles(...bk)));
  },

  /* ---------------------------------------------------------- Exportieren (zwei Schritte wie in OneNote) */
  page_exportieren(m) {
    const pid = Canvas.pageId, sec = pid ? Tree.groupOfPage(pid) : Tree.group(Store.ui.currentGroup), nb = sec ? Tree.notebookOf(sec.id) : null;
    const whats = [['seite', 'Seite', 'page', pid ? (Canvas.page.title || 'Unbenannte Seite') : 'keine Seite offen', !!pid],
      ['abschnitt', 'Abschnitt', 'tabPlus', sec ? sec.name : '–', !!sec], ['notizbuch', 'Notizbuch', 'book', nb ? nb.name : '–', !!nb]];
    const fmts = [['pdf', 'PDF', 'filePdf', 'Zum Drucken und Weitergeben'], ['html', 'Webseite (HTML)', 'globe', 'Nur zum Ansehen, im Browser zoombar, auch auf dem Handy'],
      ['kt', 'KnowledgeTree-Datei', 'archive', 'Zum Weiterbearbeiten: interaktiv (.html), ZIP oder JSON'], ['office', 'Office-Datei', 'officeDoc', 'Word/Excel/PowerPoint-Seiten – Dateityp wählbar'], ['one', 'OneNote', 'oneNote', 'Als OneNote-Abschnitt bzw. -Notizbuch']];
    let what = this._what && whats.find(w => w[0] === this._what && w[4]) ? this._what : (whats.find(w => w[4]) || whats[0])[0];
    let fmt = typeof OfficePages !== 'undefined' && OfficePages.page() ? 'office' : fmts.some(f => f[0] === Store.ui.exportFormat) ? Store.ui.exportFormat : 'pdf';
    const pick = (list, cur, onPick) => {
      const box = el('div', { class: 'bs-pick' });
      for (const [id, label, ic, desc, ok = true] of list) {
        const b = el('button', { class: 'bs-opt' + (id === cur ? ' on' : ''), type: 'button', html: `${icon(ic, 22)}<span><b></b><small></small></span>` });
        b.querySelector('b').textContent = label;
        b.querySelector('small').textContent = desc;
        if (!ok) b.disabled = true;
        b.addEventListener('click', () => { for (const x of box.children) x.classList.toggle('on', x === b); onPick(id); });
        box.append(b);
      }
      return box;
    };
    const go = this.btn('Exportieren …', () => {
      this._what = what;
      Store.ui.exportFormat = fmt;
      UiState.saveSoon();
      const preset = what === 'seite' ? { pages: [pid] } : what === 'abschnitt' ? { group: sec.id } : { group: nb.id };
      this.run(() => Export.show(preset));
    }, { primary: true, disabled: Store.readOnly || !whats.find(w => w[0] === what)[4] });
    m.append(el('div', { class: 'bs-steps' },
      this.section('1. Was exportieren?', pick(whats, what, (id) => { what = id; })),
      this.section('2. Format auswählen', pick(fmts, fmt, (id) => { fmt = id; }), el('div', { class: 'bs-go' }, go),
        this.note('Im nächsten Fenster lässt sich die Auswahl noch ändern (mehrere Seiten, Abschnitte, Notizbücher).'))));
    m.append(this.section('Notizbuch als Datei', this.tiles(this.tile('archive', 'Aktuelles Notizbuch als Datei', 'Als KnowledgeTree-Datei (.knowledgetree.zip) speichern – zum Weitergeben oder Sichern', 'exportNotebook'))));
  },

  /* ---------------------------------------------------------- Drucken */
  page_drucken(m) {
    m.append(this.section('Drucken', this.tiles(
      this.tile('print', 'Drucken …', 'Mit Vorschau: Seite, Abschnitt, Notizbuch, Auswahl oder Tabelle – Papier, Ränder, Massstab, Druckbereich (Strg+P)', 'print'),
      this.tile('settings', 'Druckeinstellungen', 'Vorgaben für Papier, Ränder, Skalierung, Kopf- und Fusszeile', () => this.run(() => Settings.show('drucken'))))));
  },

  /* ---------------------------------------------------------- Hilfe */
  page_hilfe(m) {
    // Erste Schritte (1.36): eine Seite je Bereich – fehlt sie, wird sie im Abschnitt „Erste Schritte“ angelegt
    m.append(this.section('Erste Schritte', this.tiles(
      this.tile('sparkle', 'Alle Erste-Schritte-Seiten', 'Fehlende ergänzen, unveränderte auffrischen – bearbeitete Seiten bleiben', () => this.run(() => Store.gate(() => Guide.openAll()))),
      ...Guide.ORDER.map(k => this.tile(Guide.ICONS[k], Guide.TITLES[k], Guide.INFO[k], 'guide', { arg: k })))));
    m.append(this.section('Weitere Hilfe', this.tiles(
      this.tile('keyboard', 'Tastenkürzel', 'Alle Tasten und Gesten auf einen Blick', 'shortcuts'),
      this.tile('info', Backend.kind === 'datei' ? 'Über diese Datei' : 'Über KnowledgeTree', `Version ${Store.info.version || ''} · by ${Store.info.author || 'TheDragonas'}`, 'about'))));
  },
};
