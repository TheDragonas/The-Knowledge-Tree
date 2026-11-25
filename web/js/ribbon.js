'use strict';
/* Menüband im PowerPoint-Stil */

const PAGE_COLORS = [null, '#FFFBEA', '#FDF3D1', '#E9F5E4', '#E3F0FB', '#EEE8F8', '#FCE9EE', '#E5F5F3', '#FBEBDF', '#F1F1F1'];
const BG_KINDS = [['punkte', 'Punkte', 'dots'], ['raster-s', 'Karos klein', 'grid'], ['raster', 'Karos mittel', 'grid'], ['raster-l', 'Karos gross', 'grid'],
  ['linien-s', 'Linien schmal', 'lines'], ['linien', 'Linien mittel', 'lines'], ['linien-l', 'Linien weit', 'lines'], ['keiner', 'Keine', 'blank']];

const Ribbon = {
  lastColors: { fontColor: '#C00000', highlight: '#FFFF00', boxFill: '#FFF4C2', boxBorder: '#6AA3E8', linkColor: '#6b4fbb', pkgColor: '#0078d4', shapeFill: '#DCEBFF', drawColor: '#d13438', xlBg: '#FFF2CC', xlColor: '#C00000' },

  /* ---------------------------------------------------------- Bausteine */
  btn(cls, cmd, inner, title, arg) {
    const b = el('button', { class: 'rb ' + cls, title: title || '', type: 'button' });
    b.innerHTML = inner;
    if (cmd) {
      b.dataset.cmd = cmd;
      if (arg !== undefined) b.dataset.arg = JSON.stringify(arg);
      b.addEventListener('click', () => Cmd.run(cmd, arg));
    }
    return b;
  },
  big(cmd, label, ic, title, arg) { return this.btn('big', cmd, icon(ic, 28) + `<span>${label}</span>`, title || label.replace(/­/g, ''), arg); },
  small(cmd, label, ic, title, arg) { return this.btn('small', cmd, icon(ic, 16) + `<span>${label}</span>`, title || label, arg); },
  /* Häkchen (1.69): Kästchen + Beschriftung, angehakt wenn der Befehl aktiv ist (Cmd.active) */
  check(cmd, label, title, arg) { const b = this.btn('small chk', cmd, `<span class="cbx" aria-hidden="true"></span><span>${label}</span>`, title || label, arg); b.setAttribute('role', 'checkbox'); return b; },
  ico(cmd, inner, title, arg) { return this.btn('ico', cmd, inner.startsWith('<') ? inner : icon(inner, 16), title, arg); },
  glyph(cmd, text, cls, title) { return this.btn('ico', cmd, `<span class="glyph ${cls || ''}">${text}</span>`, title); },
  row(...kids) { return el('div', { class: 'rrow' }, ...kids); },
  col(...kids) { return el('div', { class: 'rcol' }, ...kids); },
  group(label, ...kids) {
    const compact = ['Zwischenablage', 'Bearbeiten', 'Ordner', 'Reihenfolge', 'Hilfen', 'Seite', 'Notizbuch', 'Text', 'Pfeile', 'Ebene', 'Fenster', 'Tabs'].includes(label);
    return el('div', { class: 'rgroup' + (compact ? ' compactable' : '') }, el('div', { class: 'rg-body' }, ...kids), el('div', { class: 'rg-label', text: label }));
  },
  /* Knopf mit Pfeil für ein Aufklappmenü */
  dropBtn(kind, inner, label, title, openFn) {
    const b = el('button', { class: 'rb ' + kind, title: title || label || '', type: 'button' });
    // zweizeilige Beschriftung (Leerzeichen oder weiches Trennzeichen): Pfeil am Ende der Zeile wie in Office (1.68)
    const two = kind === 'big' && /[\s\u00ad]/.test(label || '');
    const cut = two ? Math.max(label.lastIndexOf(' '), label.lastIndexOf('\u00ad')) + 1 : 0;   // letztes Wort + Pfeil bleiben zusammen
    b.innerHTML = kind === 'big' ? (two ? inner + `<span>${label.slice(0, cut)}<span class="nw">${label.slice(cut)}${icon('chevDown', 10, 'caret inl')}</span></span>` : inner + `<span>${label}</span>` + icon('chevDown', 10, 'caret')) : inner + (label ? `<span>${label}</span>` : '') + icon('chevDown', 10);
    b.addEventListener('click', () => openFn(b));
    return b;
  },
  /* grosser Knopf mit eigenem Pfeil unten: Klick = Befehl, Pfeil = Menü (wie „Einfügen“ in Office) */
  bigSplit(cmd, label, ic, title, openFn) {
    const b = this.btn('big', cmd, icon(ic, 28) + `<span>${label}</span>`, title);
    b.classList.add('bsplit');
    const dr = el('span', { class: 'bs-drop', title: 'Weitere Möglichkeiten', html: icon('chevDown', 10) });
    dr.addEventListener('click', (e) => { e.stopPropagation(); e.preventDefault(); openFn(b); });
    b.append(dr);
    return b;
  },
  /* geteilter Knopf: links ausführen, rechts Menü */
  split(cmd, inner, title, openFn, arg) {
    const main = this.btn('ico', cmd, inner, title, arg);
    const drop = el('button', { class: 'rb drop', title: title + ' – Optionen', type: 'button', html: icon('chevDown', 10) });
    drop.dataset.for = cmd;
    const s = el('span', { class: 'split' }, main, drop);
    drop.addEventListener('click', () => openFn(s));
    return s;
  },
  colorSplit(cmd, ic, title, opts = {}) {
    const inner = `<span class="colorbar">${icon(ic, 15)}<i data-bar="${cmd}" style="background:${this.lastColors[cmd]}"></i></span>`;
    const main = el('button', { class: 'rb ico', title, type: 'button', html: inner });
    main.dataset.cmd = cmd;
    main.addEventListener('click', () => Cmd.run(cmd, this.lastColors[cmd]));
    const drop = el('button', { class: 'rb drop', title: title + ' – Farbe wählen', type: 'button', html: icon('chevDown', 10) });
    drop.dataset.cmd = cmd;
    const s = el('span', { class: 'split' }, main, drop);
    drop.addEventListener('click', () => {
      const pick = (c) => {
        if (c) { this.lastColors[cmd] = c; $$(`[data-bar="${cmd}"]`).forEach(x => x.style.background = c); }
        Cmd.run(cmd, c);
      };
      if (opts.palette) UI.menu([{ head: title }, { colors: opts.palette, action: pick }], 0, 0, { anchor: s });
      else UI.colorPicker(s, opts, pick);
    });
    return s;
  },
  penGallery() {
    const g = el('div', { class: 'pen-gallery' });
    (Store.ui.pens || DEFAULT_PENS).forEach((p, i) => {
      const b = el('button', { class: 'rb pen-btn', type: 'button', title: `${PEN_KINDS[p.kind] || 'Stift'} · ${String(p.w).replace('.', ',')} px\nNochmals klicken (oder Rechtsklick) = Farbe, Stärke und Art ändern`, html: Draw.penIcon(p, 30) });
      b.dataset.cmd = 'pen'; b.dataset.arg = JSON.stringify(i); b.dataset.pen = i;
      b.addEventListener('click', () => Cmd.run('pen', i));
      b.addEventListener('contextmenu', (e) => { e.preventDefault(); Draw.penMenu(i, b); });
      g.append(b);
    });
    return g;
  },
  textGlyph(txt, extra = '') { return `<span class="glyph sm" style="${extra}">${txt}</span>`; },

  combo(kind, width) {
    const inp = el('input', { style: { width: width + 'px' }, spellcheck: 'false', title: kind === 'font' ? 'Schriftart' : 'Schriftgrad' });
    inp.dataset.combo = kind;
    const drop = el('button', { class: 'rb drop', type: 'button', html: icon('chevDown', 10) });
    const c = el('span', { class: 'combo' }, inp, drop);
    const apply = () => {
      const v = inp.value.trim();
      if (!v) return;
      if (kind === 'font') Cmd.run('font', v); else Cmd.run('size', parseFloat(v.replace(',', '.')));
    };
    inp.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') { e.preventDefault(); apply(); Canvas.restoreRange(); }
      if (e.key === 'Escape') { Canvas.restoreRange(); }
    });
    inp.addEventListener('focus', () => inp.select());
    drop.addEventListener('mousedown', e => e.preventDefault());
    drop.addEventListener('click', () => {
      const box = el('div', { class: 'list-pop' });
      const cur = inp.value;
      const list = kind === 'font' ? FONTS : FONT_SIZES;
      for (const v of list) {
        const m = el('div', { class: 'mi' + (String(v) === cur ? ' cur' : ''), style: kind === 'font' ? { fontFamily: `"${v}"`, fontSize: '14px' } : {} });
        m.textContent = String(v);
        m.addEventListener('click', () => { UI.closePopup(); inp.value = v; Cmd.run(kind === 'font' ? 'font' : 'size', v); });
        box.append(m);
      }
      if (kind === 'font' && typeof Fonts !== 'undefined') {
        // eigene Schriftarten (1.66)
        box.append(el('div', { class: 'msep' }));
        const a = el('div', { class: 'mi', text: '＋ Schriftart hinzufügen …' }); a.addEventListener('click', () => { UI.closePopup(); Fonts.add(); }); box.append(a);
        if (Fonts.list().length) { const m = el('div', { class: 'mi', text: 'Eigene Schriftarten verwalten …' }); m.addEventListener('click', () => { UI.closePopup(); setTimeout(() => Fonts.manage(), 0); }); box.append(m); }
      }
      UI.showPopup(box, 0, 0, { anchor: c, cls: '' });
      box.parentElement.style.minWidth = kind === 'font' ? '220px' : '70px';
      box.querySelector('.cur')?.scrollIntoView({ block: 'center' });
    });
    return c;
  },
  gallery(items, cols = 4) {
    const g = el('div', { class: 'gallery', style: { '--cols': cols } });
    for (const it of items) {
      const b = el('button', { class: 'gal-item ' + (it.cls || ''), title: it.title || it.label || '', type: 'button' });
      if (it.html) b.innerHTML = it.html; else b.textContent = it.label;
      if (it.style) Object.assign(b.style, it.style);
      b.dataset.cmd = it.cmd;
      if (it.arg !== undefined) b.dataset.arg = JSON.stringify(it.arg);
      b.addEventListener('click', () => Cmd.run(it.cmd, it.arg));
      g.append(b);
    }
    return g;
  },

  /* Effekt-Katalog (1.72): eine Reihe zum Blättern, Pfeil = alle als Raster (wie die Kataloge in PowerPoint) */
  fxGal(items, n) {
    const g = this.gallery(items, items.length);
    g.classList.add('fx-scroll');
    g.style.maxWidth = (n * 68) + 'px';
    const more = el('button', { class: 'rb fx-more', type: 'button', title: 'Alle anzeigen', html: icon('chevDown', 12) });
    more.addEventListener('click', () => { const pop = this.gallery(items, 7); pop.classList.add('fx-pop'); pop.addEventListener('click', () => UI.closePopup()); UI.showPopup(pop, 0, 0, { anchor: more }); });
    return el('div', { class: 'fx-wrap' }, g, more);
  },

  /* ---------------------------------------------------------- Registerkarten */
  TABS_FREI: [
    { id: 'datei', label: 'Datei' },
    { id: 'start', label: 'Start' },
    { id: 'einfuegen', label: 'Einfügen' },
    { id: 'zeichnen', label: 'Zeichnen' },
    { id: 'anordnen', label: 'Anordnen' },
    { id: 'verbindungen', label: 'Verbindungen' },
    { id: 'ueberpruefen', label: 'Überprüfen' },
    { id: 'ansicht', label: 'Ansicht' },
    { id: 'addins', label: 'Add-Ins' },
    { id: 'tbl', label: 'Tabellenlayout', ctx: () => typeof OfficeUI !== 'undefined' && OfficeUI.inTable() },   // Kontextregister (1.73): Schreibmarke in einer Tabelle im Text
    { id: 'tabelle', label: 'Tabelle', ctx: () => !!Sheet.active },
    { id: 'diagramm', label: 'Diagramm', ctx: () => !!Chart.selected() },
  ],
  /* Office-Seiten (1.65): Register wie im Original-Programm */
  TABS_MODE: {
    dok: [{ id: 'datei', label: 'Datei' }, { id: 'start', label: 'Start' }, { id: 'einfuegen', label: 'Einfügen' }, { id: 'zeichnen', label: 'Zeichnen' },
      { id: 'w-design', label: 'Entwurf' }, { id: 'w-layout', label: 'Layout' }, { id: 'w-ref', label: 'Referenzen' }, { id: 'ueberpruefen', label: 'Überprüfen' }, { id: 'ansicht', label: 'Ansicht' },
      { id: 'addins', label: 'Add-Ins' }, { id: 'tbl', label: 'Tabellenlayout', ctx: () => typeof OfficeUI !== 'undefined' && OfficeUI.inTable() }],
    tab: [{ id: 'datei', label: 'Datei' }, { id: 'start', label: 'Start' }, { id: 'einfuegen', label: 'Einfügen' }, { id: 'zeichnen', label: 'Zeichnen' },
      { id: 'x-layout', label: 'Seitenlayout' }, { id: 'x-formeln', label: 'Formeln' }, { id: 'x-daten', label: 'Daten' }, { id: 'ueberpruefen', label: 'Überprüfen' }, { id: 'ansicht', label: 'Ansicht' },
      { id: 'x-dev', label: 'Entwicklertools' }, { id: 'addins', label: 'Add-Ins' }, { id: 'diagramm', label: 'Diagramm', ctx: () => !!Chart.selected() }],
    folie: [{ id: 'datei', label: 'Datei' }, { id: 'start', label: 'Start' }, { id: 'einfuegen', label: 'Einfügen' }, { id: 'zeichnen', label: 'Zeichnen' },
      { id: 'p-entwurf', label: 'Entwurf' }, { id: 'p-trans', label: 'Übergänge' }, { id: 'p-anim', label: 'Animationen' }, { id: 'p-show', label: 'Bildschirmpräsentation' },
      { id: 'ueberpruefen', label: 'Überprüfen' }, { id: 'ansicht', label: 'Ansicht' }, { id: 'addins', label: 'Add-Ins' }, { id: 'tbl', label: 'Tabellenlayout', ctx: () => typeof OfficeUI !== 'undefined' && OfficeUI.inTable() }],
  },
  mode: 'frei',
  get TABS() {
    const base = this.TABS_MODE[this.mode] || this.TABS_FREI;
    if (typeof Plugins === 'undefined' || !Plugins.tabs.length) return base;
    // eigene Register der Add-Ins (1.69): nach „after“, sonst vor „Add-Ins“
    const out = base.slice();
    for (const t of Plugins.tabsFor(this.mode)) {
      if (out.some(x => x.id === t.id)) continue;
      let i = t.after ? out.findIndex(x => x.id === t.after) + 1 : 0;
      if (i <= 0) i = out.findIndex(x => x.id === 'addins');
      if (i < 0) i = out.length;
      out.splice(i, 0, { id: t.id, label: t.label, plugin: t.plugin });
    }
    return out;
  },
  modeNow() { const p = Canvas.page; return p && p.office && p.office.asset && this.TABS_MODE[p.type] ? p.type : 'frei'; },
  /* Seitentyp beim Erstellen (1.61) */
  pageTypes() {
    return [{ head: 'Neue Seite' },
      { label: 'Freiform-Seite', icon: 'pagePlus', key: 'Alt+N', action: () => Cmd.run('newTypedPage', 'frei') },
      '-',
      { label: 'Dokument (Word, .docx)', icon: 'officeDoc', action: () => Cmd.run('newTypedPage', 'docx') },
      { label: 'Tabelle (Excel, .xlsx)', icon: 'table', action: () => Cmd.run('newTypedPage', 'xlsx') },
      { label: 'Präsentation (PowerPoint, .pptx)', icon: 'slides', action: () => Cmd.run('newTypedPage', 'pptx') }];
  },

  /* Gruppen eines Freiform-Registers (zum Wiederverwenden in den Office-Registern), optional umbenannt */
  baseGroups(id, labels) {
    this._forceFrei = true;
    let frag;
    try { frag = this.buildTab(id); } finally { this._forceFrei = false; }
    const gs = frag.filter(x => x.classList && x.classList.contains('rgroup'));
    return labels.map(l => { const [from, to] = Array.isArray(l) ? l : [l, l]; const g = gs.find(x => x.querySelector('.rg-label').textContent === from); if (g && to !== from) g.querySelector('.rg-label').textContent = to; return g; }).filter(Boolean);
  },
  /* Register der Office-Seiten (Word / Excel / PowerPoint) – Aufbau und Namen wie im Original */
  buildOffice(id) {
    const B = this, m = this.mode;
    const out = [];
    const G = (...a) => out.push(B.group(...a));
    const add = (...gs) => out.push(...gs);
    const menuOf = (items) => (anchor) => UI.menu(items, 0, 0, { anchor });
    const shapesMenu = menuOf([{ head: 'Formen' }, ...SHAPES.map(sh => ({ label: sh.label, icon: sh.icon, action: () => Cmd.run('shapeTool', sh.id) }))]);
    const zoomMenu = menuOf([{ head: 'Zoom' }, ...[50, 75, 100, 125, 150, 200].map(z => ({ label: z + ' %', checked: Math.round(Canvas.view.z * 100) === z, action: () => Cmd.run('zoomTo', z) }))]);
    const fenster = () => B.baseGroups('ansicht', [['Tabs', 'Fenster'], 'Design']);
    if (id === 'start') {
      if (m === 'dok') {
        const gs = B.baseGroups('start', ['Zwischenablage', 'Schriftart', 'Absatz', 'Formatvorlagen', 'Bearbeiten']);
        const abs = gs.find(g => g.querySelector('.rg-label').textContent === 'Absatz'), rows = abs && abs.querySelectorAll('.rrow');
        if (rows && rows.length) rows[rows.length - 1].append(B.ico('wMarks', B.textGlyph('¶', 'font-size:15px;font-weight:600'), 'Alle anzeigen: Absatzmarken, Leerzeichen und Seitenumbrüche (Strg+*)'),
          B.dropBtn('ico', icon('sortAsc', 16), '', 'Sortieren: markierte Absätze alphabetisch (1.72)', menuOf([{ head: 'Absätze sortieren' }, { label: 'Aufsteigend (A → Z)', icon: 'sortAsc', action: () => Cmd.run('wSort', 'asc') }, { label: 'Absteigend (Z → A)', icon: 'sortDesc', action: () => Cmd.run('wSort', 'desc') }])));
        add(...gs);
      }
      else if (m === 'folie') {
        add(...B.baseGroups('start', ['Zwischenablage']));
        G('Folien', B.bigSplit('slideLayout', 'Neue Folie', 'slidePlus', 'Neue Folie „Titel und Inhalt“ nach der aktuellen – Pfeil: Layout wählen (Strg+M = leer)', menuOf([{ head: 'Neue Folie mit Layout' }, ...OfficeSlides.LAYOUTS.map(([k, l]) => ({ label: l, icon: k === 'blank' ? 'slidePlus' : 'layout', action: () => Cmd.run('slideLayout', k) })), '-', { label: 'Ausgewählte Folie duplizieren', icon: 'duplicate', action: () => Cmd.run('slideDup') }]), 'content'),
          B.col(B.small('slideDup', 'Duplizieren', 'duplicate'), B.small('slideDel', 'Löschen', 'trash'), B.small('slideNotes', 'Notizen', 'notes', 'Notizen zur Folie (links neben der Folie)')));
        add(...B.baseGroups('start', ['Schriftart', 'Absatz']));
        G('Zeichnung', B.gallery(SHAPES.slice(0, 8).map(sh => ({ cmd: 'shapeTool', arg: sh.id, html: icon(sh.icon, 16), title: sh.label + ' zeichnen', cls: 'shape-item' })), 4),
          B.col(B.colorSplit('shapeFill', 'bucket', 'Fülleffekt (Formen)', { palette: [null, '#ffffff', '#FFF4C2', '#DCEBFF', '#DDF3E0', '#FDE2E4', '#EDE4FF', '#F2F2F2', '#1f1f1f', '#2f5fd0', '#d13438', '#e8a302'] }), B.colorSplit('boxFill', 'bucket', 'Fülleffekt (Textfeld)', { noneLabel: 'Keine' }), B.colorSplit('boxBorder', 'outline', 'Formkontur (Textfeld)', { noneLabel: 'Keine' })));
        G('Anordnen', B.dropBtn('big', icon('alCenter', 28), 'Ausrichten', 'Markierte Felder an der Folie ausrichten', menuOf([{ head: 'An Folie ausrichten' }, ...[['l', 'Linksbündig', 'alLeft'], ['c', 'Horizontal zentrieren', 'alCenter'], ['r', 'Rechtsbündig', 'alRight'], '-', ['t', 'Oben ausrichten', 'alTop'], ['m', 'Vertikal zentrieren', 'alMiddle'], ['b', 'Unten ausrichten', 'alBottom']].map(x => x === '-' ? '-' : { label: x[1], icon: x[2], action: () => Cmd.run('slideAlign', x[0]) })])),
          B.col(B.small('front', 'In den Vordergrund', 'front'), B.small('back', 'In den Hintergrund', 'back')));
        add(...B.baseGroups('start', ['Bearbeiten']));
      } else {
        // Excel-Start wie Excel (1.73): Zwischenablage · Schriftart · Ausrichtung · Zahl · Formatvorlagen · Zellen · Bearbeiten
        add(...B.baseGroups('start', ['Zwischenablage']));
        G('Schriftart', B.col(
          B.row(B.combo('font', 118), B.combo('size', 40), B.ico('grow', B.textGlyph('A▲', 'font-size:11px'), 'Schriftgrad vergrössern'), B.ico('shrink', B.textGlyph('A▼', 'font-size:11px'), 'Schriftgrad verkleinern')),
          B.row(B.glyph('bold', 'F', '', 'Fett (Strg+B)'), B.glyph('italic', 'K', 'i', 'Kursiv (Strg+I)'), B.glyph('underline', 'U', 'u', 'Unterstrichen (Strg+U)'), B.glyph('strike', 'abc', 's', 'Durchgestrichen'),
            B.dropBtn('ico', icon('border', 16), '', 'Rahmenlinien', menuOf([{ head: 'Rahmen' }, ...OfficeGrid.BORDERS.map(x => x === '-' ? '-' : { label: x[1], icon: x[2], action: () => Cmd.run('xlBorder', x[0]) }), '-', { label: 'Weitere Rahmen …', icon: 'settings', action: () => Cmd.run('xlFmtDlg', 'Rahmen') }])),
            B.colorSplit('xlBg', 'bucket', 'Füllfarbe der Zellen', { noneLabel: 'Keine Füllung' }), B.colorSplit('xlColor', 'textbox', 'Schriftfarbe', { noneLabel: 'Automatisch' }))));
        G('Ausrichtung', B.col(
          B.row(B.ico('xlVa', 'alTop', 'Oben ausrichten', 't'), B.ico('xlVa', 'alMiddle', 'Zentriert ausrichten (vertikal)', 'm'), B.ico('xlVa', 'alBottom', 'Unten ausrichten', 'b')),
          B.row(B.ico('xlAlign', 'alignLeft', 'Linksbündig', 'l'), B.ico('xlAlign', 'alignCenter', 'Zentriert', 'c'), B.ico('xlAlign', 'alignRight', 'Rechtsbündig', 'r'), B.ico('xlIndent', 'outdent', 'Einzug verkleinern', -1), B.ico('xlIndent', 'indent', 'Einzug vergrössern', 1))),
          B.col(B.small('xlWrap', 'Zeilenumbruch', 'wrapText', 'Text in der Zelle umbrechen (mehrere Zeilen) – sonst einzeilig, läuft in leere Nachbarzellen'),
            B.row(B.small('xlMerge', 'Verbinden und zentrieren', 'merge', 'Verbinden und zentrieren (nochmals = aufheben)', 'center'), B.dropBtn('ico xt-drop', '', '', 'Verbinden über, Zellen verbinden, Zellverbund aufheben', (a) => OfficeXT.mergeMenu(a))),
            B.small('xlFmtDlg', 'Zellen formatieren …', 'settings', 'Zahl, Ausrichtung, Schrift, Rahmen, Ausfüllen, Schutz (Strg+1)', 'Ausrichtung')));
        add(...B.baseGroups('tabelle', ['Zahl']));
        G('Formatvorlagen', B.dropBtn('big', icon('condFmt', 28), 'Bedingte Formatierung', 'Zellen nach Regeln hervorheben, Farbskalen, Datenbalken', (a) => OfficeGrid.cfMenu(a)),
          B.dropBtn('big', icon('table', 28), 'Als Tabelle formatieren', 'Kopfzeile, gebänderte Zeilen und Filter in einem Schritt', (a) => OfficeXT.tableMenu(a)),
          B.dropBtn('big', icon('brush', 28), 'Zellenformat­vorlagen', 'Gut, Schlecht, Neutral, Eingabe, Berechnung, Überschriften, Ergebnis, Akzente …', (a) => OfficeXT.stylesMenu(a)));
        G('Zellen', B.dropBtn('big', icon('rowAbove', 28), 'Einfügen', 'Zeilen, Spalten oder ein Blatt einfügen', (a) => OfficeXT.insertMenu(a)),
          B.dropBtn('big', icon('rowDel', 28), 'Löschen', 'Zeilen, Spalten oder das Blatt löschen', (a) => OfficeXT.deleteMenu(a)),
          B.dropBtn('big', icon('settings', 28), 'Format', 'Zeilenhöhe, Spaltenbreite, Aus- und Einblenden, Blatt, Schutz', (a) => OfficeXT.formatMenu(a)));
        G('Bearbeiten', B.col(
          B.dropBtn('small', icon('sigma', 16), 'AutoSumme', 'AutoSumme (Alt+=): Summe, Mittelwert, Anzahl, Max, Min', menuOf([['SUMME', 'Summe', 'Alt+='], ['MITTELWERT', 'Mittelwert'], ['ANZAHL', 'Anzahl Zahlen'], ['MAX', 'Maximum'], ['MIN', 'Minimum']].map(([f, l, key]) => ({ label: l, key, action: () => Cmd.run('xlSum', f) })).concat(['-', { label: 'Weitere Funktionen …', icon: 'fx', action: () => Cmd.run('xlFx') }]))),
          B.dropBtn('small', icon('fillDown', 16), 'Füllbereich', 'Auswahl nach unten oder rechts füllen – oder das Kästchen unten rechts ziehen', menuOf([{ head: 'Füllbereich' }, { label: 'Unten', key: 'Strg+D', action: () => Cmd.run('xlFillDown') }, { label: 'Rechts', key: 'Strg+R', action: () => Cmd.run('xlFillRight') }])),
          B.dropBtn('small', icon('eraser', 16), 'Löschen', 'Alles, Formate, Inhalte oder Notizen löschen', (a) => OfficeXT.clearMenu(a))),
          B.dropBtn('big', icon('sortAsc', 28), 'Sortieren', 'Sortieren und Filtern: A → Z, Z → A, benutzerdefiniert sortieren, Filter', (a) => OfficeXT.sortMenu(a)),
          B.dropBtn('big', icon('search', 28), 'Suchen', 'Suchen und Auswählen: Suchen, Ersetzen, Gehe zu, Notizen, Fehler', (a) => OfficeXT.findMenu(a)));
      }
      return out;
    }
    if (id === 'einfuegen') {
      if (m === 'folie') G('Folien', B.bigSplit('slideLayout', 'Neue Folie', 'slidePlus', 'Neue Folie „Titel und Inhalt“ – Pfeil: Layout wählen', menuOf([{ head: 'Neue Folie mit Layout' }, ...OfficeSlides.LAYOUTS.map(([k, l]) => ({ label: l, icon: k === 'blank' ? 'slidePlus' : 'layout', action: () => Cmd.run('slideLayout', k) }))]), 'content'));
      if (m === 'dok') {
        G('Seiten', B.big('wPageBreak', 'Seiten­umbruch', 'hr', 'Text danach beginnt auf einer neuen Seite (Strg+Enter)'));
        G('Kopf- und Fusszeile', B.big('wHF', 'Kopfzeile', 'header', 'Kopfzeile auf jedem Blatt (Doppelklick in die Kopfzeile = bearbeiten)', 'h'), B.big('wHF', 'Fusszeile', 'footer', 'Fusszeile auf jedem Blatt', 'f'),
          B.dropBtn('big', icon('numbering', 28), 'Seitenzahl', 'Seitenzahlen oben oder unten, links, Mitte oder rechts', (a) => OfficeWX.pageNumberMenu(a)));
        G('Tabellen', B.big('wTable', 'Tabelle', 'table', 'Tabelle in den Text einfügen'), B.col(B.small('textToTable', 'Text in Tabelle', 'table', 'Markierte Zeilen (Spalten getrennt mit Tabstopp, ; oder ,) in eine Tabelle umwandeln')));
      }
      G('Illustrationen', B.big('insertImage', 'Bilder', 'image', m === 'dok' ? 'Bild in den Text (an der Schreibmarke bzw. im markierten Absatzblock)' : 'Bild einfügen (auch per Ziehen oder Strg+V)'), B.dropBtn('big', icon('shapes', 28), 'Formen', 'Form zeichnen', shapesMenu));
      if (m === 'tab') add(...B.baseGroups('tabelle', [['Diagramm', 'Diagramme']]));
      G('Links', B.big('insertLink', 'Link', 'link', 'Link einfügen (Strg+K)'));
      if (m === 'tab') G('Notizen', B.big('xlNote', 'Notiz', 'notes', 'Notiz zur aktiven Zelle (Umsch+F2)'));
      if (m === 'folie') G('Text', B.big('slideTextbox', 'Textfeld', 'textbox', 'Textfeld auf der Folie aufziehen (klicken und ziehen)'), B.big('pHF', 'Kopf- und Fusszeile', 'footer', 'Datum, Foliennummer und Fusszeile – für diese oder alle Folien'), B.col(B.small('slideField', 'Foliennummer', 'numbering', 'Nummer der Folie unten rechts', 'num'), B.small('slideField', 'Datum', 'calendar', 'Datum unten links', 'date'), B.small('insertDate', 'Datum (im Text)', 'calendar', 'Heutiges Datum an der Schreibmarke', false)));
      else G('Text', B.big('newBox', 'Textfeld', 'textbox', m === 'dok' ? 'Textfeld neben dem Dokument (Notiz, nicht Teil der Datei)' : 'Textfeld über der Tabelle (wie in Excel)'), B.col(B.small('insertDate', 'Datum', 'calendar', 'Heutiges Datum einfügen', false), B.small('insertDate', 'Datum & Uhrzeit', 'calendar', 'Datum und Uhrzeit einfügen', true), ...(m === 'tab' ? [B.small('xlHF', 'Kopf- und Fusszeile', 'header', 'Kopf- und Fusszeile beim Drucken (Seite, Blattname, Datum …)')] : [])));
      add(...B.baseGroups('einfuegen', [['Formeln', 'Symbole'], 'Symbole']));
      // Symbol (1.72): Sonderzeichen wie in Word/Excel/PowerPoint
      { const sy = out.filter(g => g.querySelector && g.querySelector('.rg-label') && g.querySelector('.rg-label').textContent === 'Symbole').pop(); if (sy) sy.querySelector('.rg-body').append(B.big('symbol', 'Symbol', 'symbol', 'Sonderzeichen: Griechisch, Mathematik, Pfeile, Währungen, hoch/tief …')); else G('Symbole', B.big('symbol', 'Symbol', 'symbol', 'Sonderzeichen einfügen')); }
      return out;
    }
    if (id === 'w-layout') {
      const pg0 = (OfficePages.page('docx') || { office: {} }).office;
      const pg = pg0.pg || {};
      const cm = (tw) => (tw / 567).toFixed(2).replace('.', ',') + ' cm';
      G('Seite einrichten',
        B.dropBtn('big', icon('pageColor', 28), 'Seiten­ränder', 'Seitenränder', menuOf([{ head: 'Seitenränder' }, ...OfficeDoc.MARGINS.map(([k, l, v]) => ({ label: `${l}  –  oben ${cm(v[0])} · unten ${cm(v[1])} · links ${cm(v[2])} · rechts ${cm(v[3])}`, checked: pg.t === v[0] && pg.b === v[1] && pg.l === v[2] && pg.r === v[3], action: () => Cmd.run('wMargins', k) }))])),
        B.dropBtn('big', icon('page', 28), 'Ausrichtung', 'Hoch- oder Querformat', menuOf([{ head: 'Ausrichtung' }, { label: 'Hochformat', checked: !(pg.w > pg.h), action: () => Cmd.run('wOrient', 'hoch') }, { label: 'Querformat', checked: pg.w > pg.h, action: () => Cmd.run('wOrient', 'quer') }])),
        B.dropBtn('big', icon('file', 28), 'Format', 'Papierformat', menuOf([{ head: 'Format' }, ...OfficeDoc.PAPERS.map(([k, l, w, h]) => ({ label: `${l}  –  ${(w / 567).toFixed(1).replace('.', ',')} × ${(h / 567).toFixed(1).replace('.', ',')} cm`, checked: Math.min(pg.w, pg.h) === w && Math.max(pg.w, pg.h) === h, action: () => Cmd.run('wPaper', k) }))])),
        B.dropBtn('big', icon('hr', 28), 'Umbrüche', 'Seiten- und Zeilenumbruch', menuOf([{ head: 'Umbrüche' }, { label: 'Seitenumbruch', key: 'Strg+Enter', action: () => Cmd.run('wPageBreak') }])),
        B.dropBtn('big', icon('hyphen', 28), 'Silben­trennung', 'Wörter am Zeilenende trennen', menuOf([{ head: 'Silbentrennung' }, { label: 'Keine', checked: !pg0.hyph, action: () => Cmd.run('wHyph', '0') }, { label: 'Automatisch', checked: !!pg0.hyph, action: () => Cmd.run('wHyph', '1') }])));
      G('Absatz', B.col(B.small('indent', 'Einzug vergrössern', 'indent'), B.small('outdent', 'Einzug verkleinern', 'outdent')),
        B.col(B.dropBtn('small', icon('lineSpacing', 16), 'Abstand', 'Zeilenabstand', menuOf(['1.0', '1.15', '1.45', '1.8', '2.0', '2.5', '3.0'].map(v => ({ label: v, action: () => Cmd.run('lineSpacing', v) })))), B.small('alignJustify', 'Blocksatz', 'alignJustify')));
      return out;
    }
    if (id === 'x-layout') {
      const XT = OfficeXT;
      G('Designs', B.dropBtn('big', icon('palette', 28), 'Farben', 'Designfarben der Arbeitsmappe', (a) => OfficeUI.themeMenu('c', a)), B.dropBtn('big', B.textGlyph('Aa', 'font-size:20px;font-weight:600'), 'Schrift­arten', 'Designschriftarten', (a) => OfficeUI.themeMenu('f', a)));
      G('Seite einrichten',
        B.dropBtn('big', icon('pageColor', 28), 'Seiten­ränder', 'Seitenränder', menuOf([{ head: 'Seitenränder (Zoll, wie Excel)' }, ...XT.MARG.map(([k, l, v]) => ({ label: `${l}  –  links/rechts ${v[0]}″ · oben/unten ${v[2]}″`, checked: XT.psGet('m', k), action: () => Cmd.run('xlPs', 'm:' + k) }))])),
        B.dropBtn('big', icon('page', 28), 'Ausrichtung', 'Hoch- oder Querformat', menuOf([{ head: 'Ausrichtung' }, { label: 'Hochformat', checked: XT.psGet('or', 'portrait'), action: () => Cmd.run('xlPs', 'or:portrait') }, { label: 'Querformat', checked: XT.psGet('or', 'landscape'), action: () => Cmd.run('xlPs', 'or:landscape') }])),
        B.dropBtn('big', icon('file', 28), 'Format', 'Papierformat', menuOf([{ head: 'Format' }, ...XT.PAPERS.map(([k, l, t]) => ({ label: `${l}  –  ${t}`, checked: XT.psGet('paper', k), action: () => Cmd.run('xlPs', 'paper:' + k) }))])),
        B.dropBtn('big', icon('print', 28), 'Druck­bereich', 'Nur einen Bereich drucken', menuOf([{ head: 'Druckbereich' }, { label: 'Druckbereich festlegen (Auswahl)', action: () => Cmd.run('xlPrintArea', 'on') }, { label: 'Druckbereich aufheben', action: () => Cmd.run('xlPrintArea', 'off') }])),
        B.col(B.small('xlPrintTitles', 'Drucktitel …', 'rowAbove', 'Zeilen, die oben auf jedem Blatt wiederholt werden'), B.small('xlHF', 'Kopf-/Fusszeile …', 'header', 'Seitenzahl, Blattname, Datum …'), B.small('print', 'Seitenansicht …', 'print', 'Drucken mit Vorschau (Strg+P)')));
      G('An Seite anpassen', B.col(
        B.dropBtn('small', icon('colRight', 16), 'Breite', 'Auf so viele Seiten Breite verkleinern', menuOf([{ head: 'Breite' }, ...[[0, 'Automatisch'], [1, '1 Seite'], [2, '2 Seiten'], [3, '3 Seiten']].map(([v, l]) => ({ label: l, checked: XT.psGet('fitw', v), action: () => Cmd.run('xlPs', 'fitw:' + v) }))])),
        B.dropBtn('small', icon('rowBelow', 16), 'Höhe', 'Auf so viele Seiten Höhe verkleinern', menuOf([{ head: 'Höhe' }, ...[[0, 'Automatisch'], [1, '1 Seite'], [2, '2 Seiten'], [3, '3 Seiten']].map(([v, l]) => ({ label: l, checked: XT.psGet('fith', v), action: () => Cmd.run('xlPs', 'fith:' + v) }))])),
        B.dropBtn('small', icon('zoomIn', 16), 'Skalierung', 'Massstab beim Drucken', menuOf([{ head: 'Skalierung' }, ...[50, 75, 90, 100, 110, 125, 150, 200].map(v => ({ label: v + ' %', checked: XT.psGet('scale', v), action: () => Cmd.run('xlPs', 'scale:' + v) }))]))));
      G('Blattoptionen', B.col(el('div', { class: 'rg-mini', text: 'Gitternetzlinien' }), B.check('xlOpt', 'Anzeigen', 'Linien zwischen den Zellen', 'grid'), B.check('xlPs', 'Drucken', 'Gitternetzlinien mitdrucken', 'pg')),
        B.col(el('div', { class: 'rg-mini', text: 'Überschriften' }), B.check('xlHeads', 'Anzeigen', 'Spalten- und Zeilenköpfe'), B.check('xlPs', 'Drucken', 'Spalten- und Zeilenköpfe mitdrucken', 'ph')));
      G('Ansicht', B.big('xlBreaks', 'Seiten­umbrüche', 'hr', 'Seitenumbrüche und Druckbereich gestrichelt anzeigen'));
      return out;
    }
    if (id === 'x-formeln') {
      G('Funktionsbibliothek', B.big('xlFx', 'Funktion einfügen', 'fx', 'Funktion einfügen (alle Funktionen mit Beschreibung)'),
        B.dropBtn('big', icon('sigma', 28), 'AutoSumme', 'AutoSumme (Alt+=)', menuOf([['SUMME', 'Summe', 'Alt+='], ['MITTELWERT', 'Mittelwert'], ['ANZAHL', 'Anzahl Zahlen'], ['MAX', 'Maximum'], ['MIN', 'Minimum']].map(([f, l, key]) => ({ label: l, key, action: () => Cmd.run('xlSum', f) })))),
        ...[0, 3, 6].map(i => B.col(...XL.CATS.slice(i, i + 3).map(c => B.small('xlFxCat', c, 'fx', 'Funktionen: ' + c, c)))));
      add(...B.baseGroups('tabelle', [['Bezüge', 'Bezüge und Berechnung']]));
      G('Formelüberwachung', B.col(B.small('xlTrace', 'Spur zum Vorgänger', 'arrowRight', 'Zellen markieren, aus denen die Formel der aktiven Zelle liest', 'pre'), B.small('xlTrace', 'Spur zum Nachfolger', 'arrowLeft', 'Formeln markieren, die die aktive Zelle lesen', 'post'), B.small('xlTrace', 'Pfeile entfernen', 'x', 'Markierungen ausblenden', 'off')),
        B.col(B.check('xlShowF', 'Formeln anzeigen', 'Formeln statt Ergebnisse in den Zellen (Strg+`)'), B.small('xlErrCheck', 'Fehlerüberprüfung', 'warning', 'Zur nächsten Zelle mit Fehler (#WERT!, #DIV/0! …)')));
      return out;
    }
    if (id === 'x-daten') {
      G('Daten abrufen', B.big('importCsv', 'Aus Text/CSV', 'download', 'CSV-Datei als neue Tabelle einlesen'));
      G('Sortieren und Filtern', B.col(B.small('xlSortAsc', 'A → Z', 'sortAsc', 'Aufsteigend sortieren'), B.small('xlSortDesc', 'Z → A', 'sortDesc', 'Absteigend sortieren')), B.big('xlSortDlg', 'Sortieren', 'sortAsc', 'Benutzerdefiniert sortieren: mehrere Ebenen, Überschriften'),
        B.big('xlFilter', 'Filtern', 'filter', 'Filterknöpfe in der Kopfzeile ein/aus (Strg+Umsch+L)'), B.col(B.small('xlFilterClear', 'Löschen', 'x', 'Alle Filter aufheben'), B.small('xlFilterRe', 'Erneut anwenden', 'restore', 'Filter nach Änderungen neu anwenden')));
      G('Datentools', B.big('xlSplit', 'Text in Spalten', 'colRight', 'Text einer Spalte an einem Trennzeichen auf mehrere Spalten verteilen'), B.big('xlDup', 'Duplikate entfernen', 'trash', 'Doppelte Zeilen im markierten Bereich (bzw. zusammenhängenden Bereich) entfernen'),
        B.big('xlDv', 'Daten­überprüfung', 'check', 'Erlaubte Eingaben: Liste (Dropdown), ganze Zahl, Dezimal, Datum, Textlänge'),
        B.col(B.small('xlFillDown', 'Nach unten ausfüllen', 'fillDown', 'Strg+D'), B.small('xlToCalc', 'In den Rechner', 'calc', 'Markierte Zahlen als Listen in den Taschenrechner (Statistik, Regression)')));
      G('Prognose', B.dropBtn('big', icon('fx', 28), 'Was-wäre-wenn', 'Was-wäre-wenn-Analyse: Zielwertsuche', menuOf([{ head: 'Was-wäre-wenn-Analyse' }, { label: 'Zielwertsuche …', icon: 'fx', action: () => Cmd.run('xlGoal') }])));
      G('Exportieren', B.big('xlCsv', 'Blatt als CSV', 'csv', 'Aktuelles Blatt als CSV-Datei'));
      return out;
    }
    if (id === 'p-entwurf') {
      const o = (OfficePages.page('pptx') || { office: {} }).office;
      G('Designs', B.dropBtn('big', icon('palette', 28), 'Farben', 'Designfarben der Präsentation', (a) => OfficeUI.themeMenu('c', a)), B.dropBtn('big', B.textGlyph('Aa', 'font-size:20px;font-weight:600'), 'Schrift­arten', 'Designschriftarten (Titel und Text)', (a) => OfficeUI.themeMenu('f', a)));
      G('Anpassen', B.dropBtn('big', icon('slides', 28), 'Foliengrösse', 'Foliengrösse', menuOf([{ head: 'Foliengrösse' }, { label: 'Standard (4:3)', checked: o.cx === 9144000, action: () => Cmd.run('slideSize', '4:3') }, { label: 'Breitbild (16:9)', checked: o.cx === 12192000 && o.cy === 6858000, action: () => Cmd.run('slideSize', '16:9') }])),
        B.dropBtn('big', icon('pageColor', 28), 'Hintergrund formatieren', 'Farbe des Folienhintergrunds', menuOf([{ head: 'Hintergrund dieser Folie' }, { colors: ['#ffffff', '#f2f2f2', '#fff8e1', '#e8f1fb', '#e9f5e9', '#fdecef', '#1f1f1f', '#22314a', '#0b3d2e', '#5b1f3a'], wheel: true, action: (c) => Cmd.run('slideBg', c) }, '-', { label: 'Farbe der aktuellen Folie für alle übernehmen', icon: 'check', action: () => Cmd.run('slideBgAll') }])));
      return out;
    }
    if (id === 'p-trans') {
      const f = OfficePpt.currentFrame(), tr = (f && f.ox.tr) || { type: 'none', dur: 700 };
      G('Vorschau', B.big('transPreview', 'Vorschau', 'play', 'Übergang dieser Folie ansehen'));
      G('Übergang zu dieser Folie', B.fxGal(OfficeAnim.TRANS.map(([k, l, ic]) => ({ cmd: 'transSet', arg: k, html: icon(ic, 22) + `<span>${l}</span>`, title: l, cls: 'fx-item' + (tr.type === k ? ' on' : '') })), 9));
      const dirs = OfficeAnim.DIRS[tr.type];
      G('Effektoptionen', B.dropBtn('big', icon('arrowRight', 28), 'Effekt­optionen', dirs ? 'Richtung des Übergangs' : 'Für diesen Übergang gibt es keine Optionen', menuOf(dirs ? [{ head: 'Richtung' }, ...dirs.map(([k, l], i) => ({ label: l, checked: (tr.dir || dirs[0][0]) === k, action: () => Cmd.run('transOpt', 'dir:' + (i ? k : '')) }))] : [{ head: 'Keine Optionen für diesen Übergang' }])));
      G('Anzeigedauer', B.col(B.dropBtn('small', icon('clock', 16), `Dauer: ${((tr.dur || 700) / 1000).toFixed(2).replace('.', ',')} s`, 'Dauer des Übergangs', menuOf([500, 700, 1000, 1500, 2000].map(ms => ({ label: (ms / 1000).toFixed(2).replace('.', ',') + ' s', checked: tr.dur === ms, action: () => Cmd.run('transDur', ms) })))),
        B.small('transAll', 'Für alle übernehmen', 'check', 'Diesen Übergang auf alle Folien anwenden')),
        B.col(el('div', { class: 'rg-mini', text: 'Nächste Folie' }), B.check('transOpt', 'Bei Mausklick', 'Weiter mit Klick oder Taste', 'click:true'),
          B.dropBtn('small', icon('clock', 16), 'Nach: ' + (tr.adv ? (tr.adv / 1000).toLocaleString('de-CH') + ' s' : '–'), 'Automatisch weiter nach dieser Zeit', menuOf([{ head: 'Automatisch weiter nach' }, ...[0, 2000, 3000, 5000, 10000, 15000, 30000, 60000].map(ms => ({ label: ms ? (ms / 1000) + ' s' : 'Aus', checked: (tr.adv || 0) === ms, action: () => Cmd.run('transOpt', 'adv:' + ms) }))]))));
      return out;
    }
    if (id === 'p-anim') {
      const fx = OfficeAnim.current('fx'), st = OfficeAnim.current('start'), du = OfficeAnim.current('dur');
      G('Vorschau', B.big('animPreview', 'Vorschau', 'play', 'Animationen dieser Folie ansehen'));
      G('Animation', B.fxGal(OfficeAnim.FX.map(([k, l, ic]) => ({ cmd: 'animSet', arg: k, html: icon(ic, 22) + `<span>${l}</span>`, title: (/^e:/.test(k) ? 'Hervorheben: ' : /^x:/.test(k) ? 'Beenden: ' : k === 'none' ? '' : 'Eingang: ') + l + ' – für die ausgewählten Felder', cls: 'fx-item' + (/^e:/.test(k) ? ' fx-e' : /^x:/.test(k) ? ' fx-x' : '') + (fx === k || (!fx && k === 'none' && OfficeAnim.selected().length) ? ' on' : '') })), 7));
      G('Anzeigedauer', B.col(
        B.dropBtn('small', icon('play', 16), 'Start: ' + ((OfficeAnim.START.find(x => x[0] === st) || [0, '–'])[1]), 'Wann die Animation beginnt', menuOf(OfficeAnim.START.map(([k, l]) => ({ label: l, checked: st === k, action: () => Cmd.run('animStart', k) })))),
        B.dropBtn('small', icon('clock', 16), 'Dauer: ' + (du ? (du / 1000).toFixed(2).replace('.', ',') + ' s' : '–'), 'Dauer der Animation', menuOf([250, 500, 750, 1000, 2000].map(ms => ({ label: (ms / 1000).toFixed(2).replace('.', ',') + ' s', checked: du === ms, action: () => Cmd.run('animDur', ms) }))))),
        B.col(B.small('animEarlier', 'Früher', 'arrowUp', 'In der Reihenfolge nach vorne'), B.small('animLater', 'Später', 'arrowDown', 'In der Reihenfolge nach hinten')));
      return out;
    }
    if (id === 'w-design') {
      const pc = (OfficePages.page('docx') || { office: {} }).office.pageColor;
      G('Designs', B.dropBtn('big', icon('palette', 28), 'Farben', 'Designfarben der Datei (Akzentfarben, Text, Hintergrund)', (a) => OfficeUI.themeMenu('c', a)), B.dropBtn('big', B.textGlyph('Aa', 'font-size:20px;font-weight:600'), 'Schrift­arten', 'Designschriftarten (Überschriften und Text)', (a) => OfficeUI.themeMenu('f', a)));
      G('Seitenhintergrund', B.dropBtn('big', B.textGlyph('A', 'font-size:22px;font-weight:700;color:#a0a0a0;transform:rotate(-35deg);display:inline-block;width:28px;text-align:center'), 'Wasser­zeichen', 'Schräger Text hinter jedem Blatt (VERTRAULICH, ENTWURF …)', (a) => OfficeWX.watermarkMenu(a)), B.dropBtn('big', icon('pageColor', 28), 'Seiten­farbe', 'Hintergrundfarbe der Seiten', menuOf([{ head: 'Seitenfarbe' }, { colors: [null, '#ffffff', '#fdf6e3', '#f2f2f2', '#eaf2fb', '#eaf6ec', '#fff4e5', '#fdeef0', '#f3eefc'], wheel: true, action: (c) => Cmd.run('wPageColor', c) }])),
        B.col(B.small('wPageColor', 'Keine Farbe', 'x', 'Weisse Seiten', null)));
      const o = (OfficePages.page('docx') || { office: {} }).office;
      G('Dokumentformatierung', B.gallery([['div', 'Standard'], ['h1', 'Überschrift 1'], ['h2', 'Überschrift 2'], ['h3', 'Überschrift 3'], ['blockquote', 'Zitat']].map(([a, l]) => ({ label: l, cmd: 'style', arg: a, cls: a === 'h1' ? 'st-h1' : a === 'h2' ? 'st-h2' : a === 'blockquote' ? 'st-q' : '' })), 3),
        B.col(B.dropBtn('small', icon('lineSpacing', 16), 'Absatzabstand', 'Abstand nach jedem Absatz und Zeilenabstand für das ganze Dokument', menuOf([{ head: 'Absatzabstand' }, ...OfficeWord.SPACING.map(([k, l, v]) => ({ label: v ? `${l}  –  nach ${v[0]} pt · Zeilen ${String(v[1]).replace('.', ',')}` : l, checked: (o.spacing || '') === k, action: () => Cmd.run('wSpacing', k) }))])),
          B.dropBtn('small', B.textGlyph('Aa', 'font-size:12px;font-weight:600'), 'Schriftarten', 'Schriftart des Dokuments (Standard-Text)', menuOf([{ head: 'Schriftart des Dokuments' }, { label: 'Wie im Dokument', checked: !o.font, action: () => Cmd.run('wFont', null) }, '-', ...FONTS.map(f => ({ label: f, checked: o.font === f, action: () => Cmd.run('wFont', f) }))]))));
      G('Seitenhintergrund (Rahmen)', B.dropBtn('big', icon('page', 28), 'Seiten­ränder', 'Rahmen um jede Seite (24 pt vom Papierrand)', menuOf([{ head: 'Seitenränder' }, ...OfficeWord.BORDERS.map(([k, l]) => ({ label: l, checked: ((o.pgBorder && o.pgBorder.key) || '') === k, action: () => Cmd.run('wBorder', k) })), '-', { head: 'Farbe' }, { colors: [null, '#000000', '#2b579a', '#c00000', '#548235', '#7030a0', '#bf9000', '#7f7f7f'], wheel: true, action: (c) => Cmd.run('wBorderColor', c) }])));
      // wie Word: Dokumentformatierung, dann Seitenhintergrund (Seitenfarbe, Seitenränder) in einer Gruppe
      { const L = (g) => g.querySelector('.rg-label').textContent; const sh = out.find(g => L(g) === 'Seitenhintergrund'), rr = out.find(g => L(g) === 'Seitenhintergrund (Rahmen)');
        if (sh && rr) { sh.querySelector('.rg-body').append(...rr.querySelector('.rg-body').children); out.splice(out.indexOf(rr), 1); out.splice(out.indexOf(sh), 1); out.push(sh); } }
      void pc;
      return out;
    }
    if (id === 'w-ref') {
      G('Inhaltsverzeichnis', B.big('wToc', 'Inhalts­verzeichnis', 'numbering', 'Inhaltsverzeichnis aus den Überschriften an der Schreibmarke einfügen'));
      G('Beschriftungen', B.col(B.small('insertDate', 'Datum einfügen', 'calendar', 'Heutiges Datum', false), B.small('wWordCount', 'Wörter zählen', 'sigma')));
      return out;
    }
    if (id === 'x-dev') {
      G('Code', B.big('macroList', 'Makros', 'play', 'Makros dieser Arbeitsmappe ausführen, bearbeiten, löschen'), B.big('macroRec', Macros.rec ? 'Aufzeichnung beenden' : 'Makro aufzeichnen', Macros.rec ? 'x' : 'pencil', 'Zelländerungen als Makro aufzeichnen'),
        B.col(B.small('macroNew', 'Neues Makro', 'plus', 'Skript-Editor (JavaScript mit kt.get/kt.set …)'), B.small('xlFx', 'Funktionen', 'fx', 'Alle Funktionen, auch die der Add-Ins')));
      G('Add-Ins', B.big('addins', 'Add-Ins', 'sparkle', 'Add-Ins verwalten: eigene Funktionen und Knöpfe als JavaScript-Datei'), B.col(B.small('addinGuide', 'Anleitung', 'help', 'Wie man mit einer KI ein eigenes Add-In erstellt'), B.small('addinTemplate', 'KI-Vorlage', 'robot', 'Anleitung für eine KI und Gerüst in einer .js-Datei')));
      return out;
    }
    if (id === 'p-show') {
      G('Bildschirmpräsentation starten', B.big('showStart', 'Von Beginn an', 'play', 'Ab der ersten Folie (F5)'), B.big('showHere', 'Ab aktueller Folie', 'slides', 'Ab der aktuellen Folie (Umsch+F5)'));
      G('Einrichten', B.big('pSetup', 'Einrichten', 'settings', 'Bildschirmpräsentation einrichten: Endlosschleife, Referentenansicht'), B.big('pHide', 'Folie ausblenden', 'eye', 'Aktuelle Folie beim Vorführen überspringen (nochmals = einblenden)'));
      G('Monitore', B.big('showPresenter', 'Referenten­ansicht', 'presenter', 'Beim Vorführen: nächste Folie, Notizen und Zeit daneben'));
      return out;
    }
    if (id === 'ueberpruefen') {
      add(...B.baseGroups('ueberpruefen', [['Rechtschreibung', 'Dokumentprüfung'], 'Wörterbuch']));
      G('Sprache', B.big('grammarToggle', 'Grammatik', 'check', 'Grammatik-Hinweise (blaue Doppellinie): doppelte Wörter, Leerzeichen, Satzanfang, Komma vor „dass“ …'), B.col(B.small('dictAdd', 'Wörterbuch hinzufügen', 'bookPlus', 'Eigene Sprache: Hunspell .aff + .dic oder LibreOffice-Erweiterung .oxt'), B.small('fontAdd', 'Schriftart hinzufügen', 'textbox', '.ttf, .otf, .woff, .woff2')));
      if (m === 'dok') G('Statistik', B.big('wWordCount', 'Wörter zählen', 'sigma', 'Seiten, Wörter, Zeichen und Absätze des Dokuments'));
      if (m === 'tab') {
        G('Notizen', B.big('xlNote', 'Neue Notiz', 'notes', 'Notiz zur aktiven Zelle (Umsch+F2) – vorhandene bearbeiten'), B.col(B.small('xlNoteDel', 'Löschen', 'trash', 'Notizen der Auswahl löschen'), B.small('xlNoteStep', 'Vorherige', 'arrowUp', 'Vorherige Notiz', -1), B.small('xlNoteStep', 'Nächste', 'arrowDown', 'Nächste Notiz', 1)),
          B.col(B.check('xlNotesAll', 'Alle Notizen anzeigen', 'Alle Notizen neben ihren Zellen zeigen')));
        G('Schützen', B.big('xlProtect', 'Blatt schützen', 'lock', 'Gesperrte Zellen vor Änderungen schützen (optional mit Kennwort) – nochmals: Schutz aufheben'), B.big('xlProtectBook', 'Mappe schützen', 'lock', 'Struktur schützen: Blätter nicht einfügen, löschen, umbenennen, aus-/einblenden'));
      }
      return out;
    }
    if (id === 'ansicht') {
      if (m === 'dok') {
        G('Ansichten', B.big('wRead', 'Lese­modus', 'book', 'Nur lesen: Text in einer ruhigen Spalte, Schrift grösser/kleiner, Sepia (Esc = zurück)'), B.big('wPrintView', 'Druck­layout', 'page', 'Seiten wie gedruckt (Standard)'), B.big('wPages', 'Seiten­ansicht', 'pages', 'Wie ein PDF-Reader: eine, zwei oder mehrere Seiten nebeneinander, Zoom, Seitenminiaturen, Suche, Drucken (Esc = zurück)'));
        G('Anzeigen', B.col(B.small('wRuler', 'Lineal', 'ruler', 'Lineale oben und links (Ränder durch Ziehen ändern)'), B.small('wNav', 'Navigationsbereich', 'sidebar', 'Überschriften des Dokuments links, Klick springt hin'), B.small('wMarks', 'Formatierungszeichen', 'pilcrow', 'Absatzmarken ¶, Leerzeichen und Seitenumbrüche anzeigen')));
        G('Zoom', B.dropBtn('big', icon('zoomIn', 28), 'Zoom', 'Zoomstufe', zoomMenu), B.big('zoom100', '100 %', 'zoom100'), B.col(B.small('wZoom', 'Eine Seite', 'page', 'Eine ganze Seite im Fenster', 'page'), B.small('wZoom', 'Seitenbreite', 'fit', 'Seite auf die Fensterbreite', 'width'), B.small('wPages', 'Mehrere Seiten', 'pages', 'Mehrere Seiten nebeneinander (Seitenansicht)', 'n')));
      } else if (m === 'folie') {
        G('Präsentationsansichten', B.big('pptView', 'Lern­ansicht', 'notes', 'Alle Folien mit viel Platz: Notizen links, Animationsbereich rechts (zum Lernen und Gestalten)', 'lern'), B.big('pptView', 'Normal', 'slides', 'Wie PowerPoint: nur die aktuelle Folie, Notizen links daneben', 'normal'),
          B.big('pOutline', 'Gliederung', 'numbering', 'Text aller Folien untereinander'), B.big('pSorter', 'Folien­sortierung', 'grid', 'Alle Folien als Raster – ziehen = Reihenfolge ändern'), B.big('pRead', 'Lese­ansicht', 'book', 'Vorführen im Fenster (Esc = zurück)'));
        G('Anzeigen', B.col(B.small('pptToggle', 'Animationsbereich', 'animPane', 'Animationsliste rechts neben jeder Folie (Lernansicht)', 'pptAnimPane'), B.small('pptToggle', 'Führungslinien', 'guides', 'Mittellinien auf den Folien', 'pptGuides'), B.small('pptToggle', 'Gitternetzlinien', 'grid', 'Raster auf den Folien', 'pptGrid')));
        G('Zoom', B.dropBtn('big', icon('zoomIn', 28), 'Zoom', 'Zoomstufe', zoomMenu), B.big('slideFit', 'An Fenster anpassen', 'fit'));
      } else {
        G('Arbeitsmappenansichten', B.big('xlBreaks', 'Umbruch­vorschau', 'hr', 'Seitenumbrüche und Druckbereich gestrichelt anzeigen'));
        G('Anzeigen', B.col(B.small('xlOpt', 'Gitternetzlinien', 'gridOn', 'Linien zwischen den Zellen', 'grid'), B.small('xlHeads', 'Überschriften', 'headRow', 'Spalten- und Zeilenköpfe (A, B, C … / 1, 2, 3 …)'), B.small('xlBreaks', 'Seitenumbrüche', 'hr', 'Seitenumbrüche gestrichelt')), B.col(B.check('xlShowF', 'Formeln', 'Formeln statt Ergebnisse (Strg+`)'), B.check('xlNotesAll', 'Notizen', 'Alle Notizen anzeigen')));
        G('Zoom', B.dropBtn('big', icon('zoomIn', 28), 'Zoom', 'Zoomstufe', zoomMenu), B.big('zoom100', '100 %', 'zoom100'));
        const fz = B.dropBtn('big', icon('freeze', 28), 'Fenster fixieren', 'Zeilen und Spalten beim Scrollen stehen lassen', menuOf([{ head: 'Fenster fixieren' }, { label: 'Fenster fixieren (oberhalb und links der Zelle)', action: () => Cmd.run('xlFreeze', 'cell') }, { label: 'Oberste Zeile fixieren', action: () => Cmd.run('xlFreeze', 'row') }, { label: 'Erste Spalte fixieren', action: () => Cmd.run('xlFreeze', 'col') }, '-', { label: 'Fixierung aufheben', action: () => Cmd.run('xlFreeze', 'off') }]));
        const fg = fenster(), wg = fg.find(g => g.querySelector('.rg-label').textContent === 'Fenster');
        if (wg) wg.querySelector('.rg-body').prepend(fz); else G('Fenster', fz);
        add(...fg);
        return out;
      }
      add(...fenster());
      return out;
    }
    return null;
  },

  buildTab(id) {
    let frag = id === 'addins' && !this._forceFrei ? this.buildAddins() : this.buildTab0(id);
    // Gruppen und Knöpfe der Add-Ins (1.66, 1.69: auch vor/nach einer bestimmten Gruppe) in ihrem Register
    if (this._forceFrei || typeof Plugins === 'undefined') return frag;
    const extra = Plugins.groupsFor(this.mode, id);
    if (!extra.length) return frag;
    const gs = frag.filter(x => x.classList && x.classList.contains('rgroup'));
    const L = (g) => (g.querySelector(':scope > .rg-label') || {}).textContent;
    for (const x of extra) {
      const ref = x.before || x.after ? gs.find(g => L(g) === (x.before || x.after)) : null;
      if (ref) gs.splice(gs.indexOf(ref) + (x.before ? 0 : 1), 0, x.el); else gs.push(x.el);
    }
    frag = [];
    gs.forEach((g, i) => { if (i) frag.push(el('div', { class: 'rsep' })); frag.push(g); });
    return frag;
  },
  /* Register „Add-Ins“ (1.69, 1.70): links die Häkchen aller Add-Ins – je 4 untereinander, weitere Spalten nach rechts
     (CSS-Raster .ai-checks), dann Verwalten und Eigene Add-Ins (Anleitung, KI-Vorlage) */
  buildAddins() {
    const B = this, out = [];
    const all = typeof Plugins !== 'undefined' ? Plugins.all().filter(a => !a.broken) : [];
    const checks = all.map(a => {
      const c = B.check('addinToggle', a.name, `${a.name}${a.version ? ' ' + a.version : ''} (${Plugins.SOURCE[a.source]})${a.desc ? ' – ' + a.desc : ''}${a.err ? ' · Fehler: ' + a.err : ''} · Häkchen = eingeschaltet`, a.id);
      c.dataset.addin = a.id;
      if (a.err) c.classList.add('bad');
      return c;
    });
    const grid = el('div', { class: 'ai-checks' }, ...(checks.length ? checks : [el('div', { class: 'hintcard', html: 'Noch keine Add-Ins' })]));
    out.push(B.group('Ein / aus', grid));
    out.push(B.group('Verwalten', B.big('addinAdd', 'Add-In hinzufügen', 'plus', Backend.addinFolder ? 'JavaScript-Datei wählen – wird in den Ordner „Add-Ins“ neben dem Programm kopiert und eingeschaltet' : 'JavaScript-Datei wählen – wird im Speicher abgelegt und eingeschaltet'),
      B.big('addins', 'Verwalten', 'puzzle', 'Alle Add-Ins mit Herkunft, Inhalt und Fehlern; entfernen'),
      B.col(...(Backend.addinFolder ? [B.small('addinFolder', 'Ordner öffnen', 'folder', 'Ordner „Add-Ins“ neben KnowledgeTree.exe: *.js-Dateien darin werden beim Start geladen (ausser mit „_“ am Anfang)')] : []),
        B.small('addinReload', 'Neu laden', 'restore', Backend.addinFolder ? 'Add-Ins-Ordner neu einlesen (nach Änderungen an einer Datei)' : 'Add-Ins neu laden'))));
    out.push(B.group('Eigene Add-Ins', B.big('addinGuide', 'Anleitung', 'help', 'Wie man mit einer KI ein eigenes Add-In erstellt – Schritt für Schritt'),
      B.big('addinTemplate', 'KI-Vorlage', 'robot', 'Vorlage speichern: EINE .js-Datei mit Anleitung für die KI (Kommentar) und lauffähigem Gerüst – einer KI geben, damit sie ein passendes Add-In schreibt')));
    const frag = [];
    out.forEach((g, i) => { if (i) frag.push(el('div', { class: 'rsep' })); frag.push(g); });
    return frag;
  },
  buildTab0(id) {
    if (!this._forceFrei && this.mode !== 'frei') {
      const r = this.buildOffice(id);
      if (r) { const frag = []; r.forEach((g, i) => { if (i) frag.push(el('div', { class: 'rsep' })); frag.push(g); }); return frag; }
    }
    const B = this;
    const out = [];
    const G = (...a) => out.push(B.group(...a));
    const menuOf = (items) => (anchor) => UI.menu(items, 0, 0, { anchor });
    // Kontextregister „Tabellenlayout“ (1.73, wie Word/PowerPoint): Zeilen und Spalten, Zellen verbinden, Sortieren
    if (id === 'tbl') {
      G('Zeilen und Spalten', B.col(B.small('tbl', 'Darüber einfügen', 'rowAbove', 'Zeile oberhalb einfügen', 'rowAbove'), B.small('tbl', 'Darunter einfügen', 'rowBelow', 'Zeile unterhalb einfügen', 'rowBelow')),
        B.col(B.small('tbl', 'Links einfügen', 'colLeft', 'Spalte links einfügen', 'colLeft'), B.small('tbl', 'Rechts einfügen', 'colRight', 'Spalte rechts einfügen', 'colRight')),
        B.dropBtn('big', icon('trash', 28), 'Löschen', 'Zeile, Spalte oder Tabelle löschen', menuOf([{ head: 'Löschen' }, { label: 'Zeile löschen', icon: 'rowDel', action: () => Cmd.run('tbl', 'delRow') }, { label: 'Spalte löschen', icon: 'colDel', action: () => Cmd.run('tbl', 'delCol') }, { label: 'Tabelle löschen', icon: 'trash', danger: true, action: () => Cmd.run('tbl', 'delTable') }])));
      G('Zusammenführen', B.col(B.small('tbl', 'Mit rechter Zelle verbinden', 'merge', 'Zelle mit der rechten Nachbarzelle verbinden', 'merge'), B.small('tbl', 'Zelle teilen', 'splitH', 'Verbundene Zelle wieder teilen', 'split')));
      G('Tabellenformat', B.col(B.small('tbl', 'Kopfzeile', 'headRow', 'Erste Zeile als Überschrift (wird in Word auf jeder Seite wiederholt)', 'head')));
      G('Daten', B.col(B.small('tbl', 'Aufsteigend sortieren', 'sortAsc', 'Zeilen nach der Spalte der Schreibmarke sortieren (A → Z)', 'sortAsc'), B.small('tbl', 'Absteigend sortieren', 'sortDesc', 'Zeilen nach der Spalte der Schreibmarke sortieren (Z → A)', 'sortDesc')));
      const frag = []; out.forEach((g, i) => { if (i) frag.push(el('div', { class: 'rsep' })); frag.push(g); }); return frag;
    }
    const guideMenu = () => [{ head: 'Erste Schritte – Beispielseiten' }, { label: 'Tabellen & Formeln', icon: 'table', action: () => Cmd.run('guide', 'tabellen') }, { label: 'Diagramme', icon: 'chartCol', action: () => Cmd.run('guide', 'diagramme') }, { label: 'Rechner & Fotomath', icon: 'calc', action: () => Cmd.run('guide', 'rechner') }];

    // „Datei“ ist seit 1.34 kein Menüband-Register mehr, sondern ein eigenes Fenster wie in OneNote (backstage.js)

    if (id === 'start') {
      G('Zwischenablage',
        B.dropBtn('big', icon('paste', 28), 'Einfügen', 'Einfügen (Strg+V)', menuOf([
          { label: 'Einfügen', icon: 'paste', key: 'Strg+V', action: () => Cmd.run('paste') },
          { label: 'Nur den Text übernehmen', icon: 'textbox', key: 'Strg+Umsch+V', action: () => Cmd.run('pastePlain') },
        ])),
        B.col(B.small('cut', 'Ausschneiden', 'cut', 'Ausschneiden (Strg+X)'), B.small('copy', 'Kopieren', 'copy', 'Kopieren (Strg+C)'), B.small('painter', 'Format übertragen', 'brush', 'Format übertragen: Format von markiertem Text oder Textfeld auf anderes übertragen')));
      G('Seiten', B.bigSplit('newPage', 'Neue Seite', 'pagePlus', 'Neue Seite (Alt+N) – Pfeil: Seitentyp wählen', menuOf(B.pageTypes())), B.big('newBox', 'Textfeld', 'textbox', 'Neues Textfeld in der Mitte – oder einfach auf die Fläche klicken'));
      if (Draw.tool !== 'select') G('Zeichnen', B.big('drawTool', 'Auswählen', 'pointer', 'Zurück zum Auswählen und Schreiben (Esc)', 'select'));
      G('Schriftart', B.col(
        B.row(B.combo('font', 118), B.combo('size', 38), B.ico('grow', B.textGlyph('A<sup style="font-size:8px">▲</sup>', 'font-size:13px'), 'Schrift vergrössern (Strg+Umsch+>)'), B.ico('shrink', B.textGlyph('A<sup style="font-size:8px">▼</sup>', 'font-size:11px'), 'Schrift verkleinern (Strg+Umsch+<)'),
          B.dropBtn('ico', B.textGlyph('Aa'), '', 'Gross-/Kleinschreibung', menuOf([
            { label: 'Satzanfang gross.', action: () => Cmd.run('case', 'sentence') },
            { label: 'kleinbuchstaben', action: () => Cmd.run('case', 'lower') },
            { label: 'GROSSBUCHSTABEN', action: () => Cmd.run('case', 'upper') },
            { label: 'Erster Buchstabe Im Wort Gross', action: () => Cmd.run('case', 'title') },
            { label: 'gROSS-/kLEINSCHREIBUNG umkehren', action: () => Cmd.run('case', 'toggle') },
          ])), B.ico('clearFormat', 'eraser', 'Alle Formatierungen löschen')),
        B.row(B.glyph('bold', 'F', '', 'Fett (Strg+B)'), B.glyph('italic', 'K', 'i', 'Kursiv (Strg+I)'), B.glyph('underline', 'U', 'u', 'Unterstrichen (Strg+U)'), B.glyph('strike', 'abc', 's', 'Durchgestrichen'),
          B.ico('sup', B.textGlyph('x<sup style="font-size:8px">2</sup>'), 'Hochgestellt'), B.ico('sub', B.textGlyph('x<sub style="font-size:8px">2</sub>'), 'Tiefgestellt'),
          el('span', { style: { width: '6px' } }),
          B.colorSplit('highlight', 'highlighter', 'Texthervorhebungsfarbe', { highlight: true }),
          B.colorSplit('fontColor', 'textbox', 'Schriftfarbe', { noneLabel: 'Automatisch' }))));
      G('Absatz', B.col(
        B.row(
          B.split('bullets', icon('bullets', 16), 'Aufzählungszeichen', menuOf([
            { label: '● Punkt', action: () => Cmd.run('bullets', 'disc') }, { label: '○ Kreis', action: () => Cmd.run('bullets', 'circle') },
            { label: '■ Quadrat', action: () => Cmd.run('bullets', 'square') }, { label: '– Strich', action: () => Cmd.run('bullets', '"– "') },
            { label: '➜ Pfeil', action: () => Cmd.run('bullets', '"➜ "') }, { label: '✓ Häkchen', action: () => Cmd.run('bullets', '"✓ "') },
          ])),
          B.split('numbering', icon('numbering', 16), 'Nummerierung', menuOf([
            { label: '1. 2. 3.', action: () => Cmd.run('numbering', 'decimal') }, { label: 'a. b. c.', action: () => Cmd.run('numbering', 'lower-alpha') },
            { label: 'A. B. C.', action: () => Cmd.run('numbering', 'upper-alpha') }, { label: 'i. ii. iii.', action: () => Cmd.run('numbering', 'lower-roman') },
            { label: 'I. II. III.', action: () => Cmd.run('numbering', 'upper-roman') },
          ])),
          B.ico('outdent', 'outdent', 'Einzug verkleinern'), B.ico('indent', 'indent', 'Einzug vergrössern'),
          B.dropBtn('ico', icon('lineSpacing', 16), '', 'Zeilenabstand', menuOf(['1.0', '1.15', '1.45', '1.8', '2.0', '2.5', '3.0'].map(v => ({ label: v === '1.45' ? '1.45 (Standard)' : v, action: () => Cmd.run('lineSpacing', v) }))))),
        B.row(B.ico('alignLeft', 'alignLeft', 'Linksbündig (Strg+L)'), B.ico('alignCenter', 'alignCenter', 'Zentriert (Strg+E)'), B.ico('alignRight', 'alignRight', 'Rechtsbündig (Strg+R)'), B.ico('alignJustify', 'alignJustify', 'Blocksatz (Strg+J)'),
          B.ico('checklist', 'checklist', 'Checkliste (Aufgaben zum Abhaken)'))));
      G('Formatvorlagen', B.gallery([
        { label: 'Standard', cmd: 'style', arg: 'div', title: 'Normaler Text' },
        { label: 'Überschrift 1', cmd: 'style', arg: 'h1', cls: 'st-h1' },
        { label: 'Überschrift 2', cmd: 'style', arg: 'h2', cls: 'st-h2' },
        { label: 'Überschrift 3', cmd: 'style', arg: 'h3', cls: 'st-h3' },
        { label: 'Zitat', cmd: 'style', arg: 'blockquote', cls: 'st-q' },
        { label: 'Code', cmd: 'style', arg: 'pre', cls: 'st-code' },
      ], 3));
      const presets = BOX_PRESETS.map((p, i) => ({
        cmd: 'boxPreset', arg: i, cls: 'swatch', title: 'Schnellformatvorlage: ' + p.name, html: 'Abc',
        style: { background: p.sw || p.style.bg, borderColor: p.bd || p.style.border, color: p.style.color || (p.style.bg && p.style.bg !== 'transparent' ? Contrast.auto(p.style.bg, Contrast.dark()) : 'var(--ink)'), borderStyle: p.dash ? 'dashed' : 'solid', borderWidth: '1.5px' },
      }));
      G('Zeichnung', B.gallery(presets), B.col(B.colorSplit('boxFill', 'bucket', 'Fülleffekt (Hintergrund des Textfelds)', { noneLabel: 'Standard' }), B.colorSplit('boxBorder', 'outline', 'Formkontur (Rahmenfarbe)', { noneLabel: 'Standard' })));
      G('Bearbeiten', B.col(B.small('find', 'Suchen', 'search', 'Suchen (Strg+F)'), B.small('replace', 'Ersetzen', 'replace', 'Ersetzen (Strg+H)'), B.small('selectAll', 'Markieren', 'selectAll', 'Alles markieren (Strg+A)')));
    }

    if (id === 'einfuegen') {
      G('Seiten', B.bigSplit('newPage', 'Neue Seite', 'pagePlus', 'Neue Seite (Alt+N) – Pfeil: Seitentyp wählen', menuOf(B.pageTypes())), B.col(B.small('newSubpage', 'Unterseite', 'subpage', 'Strg+Alt+N'), B.small('newSection', 'Abschnitt', 'tabPlus'), B.small('quickNote', 'Schnellnotiz', 'bolt', 'Alt+Umsch+N')));
      G('Elemente', B.big('newBox', 'Textfeld', 'textbox'), B.big('insertImage', 'Bild', 'image', 'Bild in das ausgewählte Textfeld einfügen (oder neues Feld). Bilder kannst du auch hineinziehen oder mit Strg+V einfügen.'),
        B.big('insertFile', 'Datei', 'file', 'Datei anhängen (PDF, Word, PowerPoint …). Rechtsklick auf den Anhang → „Seiten als Bilder aufklappen“ (wie Dateiausdruck in OneNote). Auch per Ziehen.'));
      G('Rechnen', B.dropBtn('big', icon('table', 28), 'Tabelle', 'Tabelle wie in Excel: Zahlen, Formeln (=SUMME(A1:A5) …), Formate, Ausfüllen, Sortieren', (a) => this.tableMenu(a)),
        B.dropBtn('big', icon('chart', 28), 'Diagramm', 'Diagramm aus Tabellendaten (Säulen, Linie, Punkte, Kreis …) – mit markierten Zellen oder Beispieldaten', (a) => this.chartMenu(a, 'insertChart')),
        B.big('calculator', 'Rechner', 'calc', 'Taschenrechner (TI-30X Plus oder Standard) mit Rechenverlauf – Alt+R'), B.big('fotomath', 'Fotomath', 'fotomath', 'Handgeschriebene Rechnung (Stift oder Bild) einrahmen: erkennen, darstellen und ausrechnen (auch Gleichungen mit x) – Alt+M'));
      G('Text', B.col(B.small('insertLink', 'Link', 'link', 'Link einfügen (Strg+K)'), B.small('unlink', 'Link entfernen', 'unlink'), B.small('checklist', 'Checkliste', 'checklist')),
        B.col(B.small('insertDate', 'Datum', 'calendar', 'Heutiges Datum einfügen', false), B.small('insertDate', 'Datum & Uhrzeit', 'calendar', 'Datum und Uhrzeit einfügen', true), B.small('insertHr', 'Trennlinie', 'hr')));
      G('Formeln', B.dropBtn('big', icon('formula', 28), 'Formel', 'Formel einfügen (Alt+=): Brüche, Wurzeln, Exponenten, Summen, Integrale, Matrizen und Symbole wie in Office', (a) => Formula.gallery(a)));
      G('Symbole', B.dropBtn('big', icon('omega', 28), 'Symbol', 'Sonderzeichen und Emojis einfügen', (anchor) => {
        const g = el('div', { class: 'sym-grid' });
        for (const s of SYMBOLS) g.append(el('button', { text: s, title: s, onclick: () => { UI.closePopup(); Cmd.run('insertSymbol', s); } }));
        if (!Canvas.editing) { UI.toast('Zuerst in ein Textfeld klicken'); return; }
        UI.showPopup(g, 0, 0, { anchor });
      }));
    }

    if (id === 'zeichnen') {
      G('Werkzeuge', B.big('drawTool', 'Auswählen', 'pointer', 'Auswählen, verschieben und Text schreiben (Esc)', 'select'), B.big('drawTool', 'Lasso', 'lasso', 'Lasso: um Striche, Formen und Textfelder herumfahren', 'lasso'),
        B.big('eraserMode', 'Radierer', 'eraser', 'Strich-Radierer: löscht ganze Striche', 'strich'),
        B.col(B.small('eraserMode', 'Strich', 'eraser', 'Löscht ganze Striche', 'strich'), B.small('eraserMode', 'Punkt', 'eraserPoint', 'Löscht nur die überfahrene Stelle', 'punkt'),
          B.dropBtn('small', icon('weight', 16), 'Grösse', 'Grösse des Punkt-Radierers', menuOf([['Klein', 8], ['Mittel', 14], ['Gross', 26], ['Sehr gross', 44]].map(([l, s]) => ({ label: l, checked: (Store.ui.eraserSize || 14) === s, action: () => Cmd.run('eraserSize', s) }))))));
      G('Stifte', B.penGallery(), B.col(B.dropBtn('small', icon('palette', 16), 'Anpassen', 'Farbe, Stärke und Art des aktiven Stifts', (a) => Cmd.run('penSettings', a)),
        B.colorSplit('drawColor', 'brush', 'Farbe (ändert die Auswahl oder den aktiven Stift)', { palette: INK_COLORS })));
      G('Formen', B.gallery(SHAPES.map(s => ({ cmd: 'shapeTool', arg: s.id, html: icon(s.icon, 16), title: s.label + ' zeichnen (Umschalt = gerade/gleichmässig)', cls: 'shape-item' })), 4),
        B.col(B.colorSplit('shapeFill', 'bucket', 'Füllung (für die Auswahl oder neue Formen)', { palette: [null, '#ffffff', '#FFF4C2', '#DCEBFF', '#DDF3E0', '#FDE2E4', '#EDE4FF', '#F2F2F2', '#1f1f1f', '#2f5fd0', '#d13438', '#e8a302'] })));
      // Chemie und Reaktion (bis 1.68 hier fest): kommen seit 1.69 vom eingebauten Add-In Chem-Draw (addon-chemdraw.js)
      G('Hilfsmittel', B.big('ruler', 'Lineal', 'ruler', 'Lineal einblenden: mit dem Stift an der Kante entlang ergibt gerade Linien'), B.big('protractor', 'Winkel­messer', 'protractor', 'Winkelmesser einblenden'),
        B.col(B.small('penOnly', 'Nur mit Stift', 'stylus', 'Touch: Finger verschieben und zoomen, gezeichnet wird nur mit dem Stift')));
      G('Umwandeln', B.big('recognize', 'Form­erkennung', 'wand', 'Gezeichnete Formen automatisch sauber machen (Linie, Rechteck, Kreis, Dreieck …)'), B.big('fotomath', 'Foto­math', 'fotomath', 'Handgeschriebene Rechnung einrahmen: erkennen, darstellen und ausrechnen (ohne Internet) – Alt+M'),
        B.col(B.small('inkToShape', 'Freihand → Form', 'inkShape', 'Ausgewählte Striche in saubere Formen umwandeln'), B.small('inkToText', 'Freihand → Text', 'inkText', 'Beta: Handschrift erkennen und als Textfeld einfügen (lädt beim ersten Mal die Texterkennung aus dem Internet)')));
      G('Ebene', B.col(B.small('drawFront', 'Vor den Text', 'layerUp', 'Ausgewählte Zeichnungen über die Textfelder legen'), B.small('drawBack', 'Hinter den Text', 'layerDown', 'Ausgewählte Zeichnungen hinter die Textfelder legen')));
    }

    if (id === 'anordnen') {
      G('Paket', B.big('group', 'Gruppieren', 'group', 'Ausgewählte Felder zu einem Paket verbinden (Strg+G)'), B.big('ungroup', 'Gruppierung aufheben', 'ungroup', 'Strg+Umsch+G'),
        B.col(B.small('pkgRename', 'Umbenennen', 'pencil'), B.colorSplit('pkgColor', 'palette', 'Paketfarbe', { palette: PKG_COLORS })));
      G('Schutz', B.big('lock', 'Sperren', 'lock', 'Fixieren: kann nicht mehr verschoben oder bearbeitet werden (Strg+Umsch+L)'), B.big('unlock', 'Entsperren', 'unlock'));
      G('Reihenfolge', B.col(B.small('front', 'In den Vordergrund', 'front'), B.small('back', 'In den Hintergrund', 'back')));
      G('Ausrichten', B.col(
        B.row(B.ico('align', 'alLeft', 'Linksbündig ausrichten', 'left'), B.ico('align', 'alCenter', 'Horizontal zentrieren', 'center'), B.ico('align', 'alRight', 'Rechtsbündig ausrichten', 'right'), B.ico('align', 'distH', 'Horizontal verteilen', 'distH')),
        B.row(B.ico('align', 'alTop', 'Oben ausrichten', 'top'), B.ico('align', 'alMiddle', 'Vertikal zentrieren', 'middle'), B.ico('align', 'alBottom', 'Unten ausrichten', 'bottom'), B.ico('align', 'distV', 'Vertikal verteilen', 'distV')),
        B.row(B.small('sameWidth', 'Gleiche Breite', 'sameWidth'))));
    }

    if (id === 'verbindungen') {
      G('Verbinden', B.big('connect', 'Verbinden', 'connect', 'Ausgewählte Elemente der Reihe nach verbinden'), B.big('disconnect', 'Trennen', 'disconnect', 'Verbindung(en) der Auswahl entfernen'));
      G('Linienform', B.col(B.small('linkStyle', 'Kurve', 'curve', 'Geschwungene Linie wie bei Blender-Nodes', 'kurve'), B.small('linkStyle', 'Gerade', 'straight', 'Gerade Linie', 'gerade'), B.small('linkStyle', 'Winkel', 'angled', 'Rechtwinklige Linie', 'winkel')), B.col(B.small('linkRoute', 'Ausweichen', 'detour', 'Linien führen um Textfelder, Bilder, Strukturformeln, Tabellen und Diagramme herum (alle Verbindungen)')));
      G('Pfeile', B.col(B.small('arrow', 'Pfeil am Ende', 'arrowEnd', null, 'ende'), B.small('arrow', 'Beide Enden', 'arrowBoth', null, 'beide'), B.small('arrow', 'Ohne Pfeil', 'arrowNone', null, 'keiner')), B.col(B.small('reverse', 'Richtung umkehren', 'swap')));
      G('Aussehen', B.col(
        B.row(B.colorSplit('linkColor', 'palette', 'Linienfarbe', { palette: [null, '#6b4fbb', '#0078d4', '#038387', '#498205', '#e8a302', '#ca5010', '#d13438', '#c239b3', '#605e5c', '#000000', '#8e8aa0'] }), el('span', { style: { width: '4px' } }),
          B.dropBtn('small', icon('weight', 16), 'Stärke', 'Linienstärke', menuOf([1, 1.5, 2, 3, 4, 6].map(w => ({ label: w + ' pt', action: () => Cmd.run('linkWidth', w) }))))),
        B.small('dash', 'Gestrichelt', 'dashed'), B.small('label', 'Beschriftung', 'tag', 'Text an der Verbindung (oder Doppelklick auf die Linie)')),
        B.col(B.small('resetLink', 'Linie zurücksetzen', 'undo', 'Verschobene Ansatzpunkte und Biegung der ausgewählten Verbindung(en) entfernen')));
      G('Knowledge Tree', B.big('treeLayout', 'Als Baum anordnen', 'tree', 'Verbundene Elemente automatisch als Baum von links nach rechts anordnen'),
        el('div', { class: 'hintcard', html: '<b>Rechtsklick halten + ziehen</b> = verbinden<br><b>Linie anklicken</b> → Punkte/Linie ziehen<br><b>Strg + Rechtsklick</b> ziehen = schneiden' }));
    }

    if (id === 'ueberpruefen') {   // wie OneNote (1.38)
      G('Rechtschreibung', B.big('spellPanel', 'Rechtschreibung', 'spellcheck', 'Die Seite Wort für Wort prüfen (F7) – Vorschläge, Ändern, Ignorieren, Hinzufügen'),
        B.col(B.small('spellOn', 'Fehler anzeigen', 'spellcheck', 'Unbekannte Wörter rot unterwellen (Rechtsklick = Vorschläge)'),
          B.dropBtn('small', icon('globe', 16), 'Sprachen', 'Deutsch (Schweiz/Deutschland) und Englisch (USA/GB) – auch mehrere gleichzeitig', (a) => Spell.langMenu(a)),
          B.small('spellFach', 'Fachwörter', 'chem', 'Naturwissenschaften, Mathematik, Medizin, Informatik, Element- und Molekülnamen')));
      G('Wörterbuch', B.col(B.small('spellUser', 'Eigenes Wörterbuch …', 'bookPlus', 'Eigene Wörter ansehen, ergänzen, löschen'), B.small('spellReload', 'Wörterbücher neu laden', 'restore', 'Wörterbücher frisch aus dem Netz laden')));
      G('Sprache', B.big('grammarToggle', 'Grammatik', 'check', 'Grammatik-Hinweise (blaue Doppellinie): doppelte Wörter, Leerzeichen, Satzanfang, Komma vor „dass“ …'), B.col(B.small('dictAdd', 'Wörterbuch hinzufügen', 'bookPlus', 'Eigene Sprache: Hunspell .aff + .dic oder LibreOffice-Erweiterung .oxt'), B.small('fontAdd', 'Schriftart hinzufügen', 'textbox', '.ttf, .otf, .woff, .woff2')));
      G('Rechnen', B.big('fotomath', 'Fotomath', 'fotomath', 'Handschrift erkennen und ausrechnen – mit Rechenweg (Alt+M)'));
    }

    if (id === 'ansicht') {
      G('Zoom', B.big('zoom100', '100 %', 'zoom100', 'Zoom zurücksetzen (Strg+0)'), B.big('fit', 'Alles anzeigen', 'fit'), B.col(B.small('zoomIn', 'Vergrössern', 'zoomIn', 'Strg + Plus / Strg + Mausrad'), B.small('zoomOut', 'Verkleinern', 'zoomOut', 'Strg + Minus / Strg + Mausrad')));
      G('Seite', B.dropBtn('big', icon('pageColor', 28), 'Seiten­farbe', 'Hintergrundfarbe der Seite', (a) => UI.menu([{ head: 'Seitenfarbe' }, { colors: PAGE_COLORS, action: (c) => Cmd.run('pageColor', c) }], 0, 0, { anchor: a })),
        B.dropBtn('big', icon('ruled', 28), 'Linien', 'Punkte, Karos oder Linien auf der Seite', (a) => UI.menu([{ head: 'Linien der Seite' }, ...BG_KINDS.map(([v, l, ic]) => ({ label: l, icon: ic, checked: !!Canvas.page && Canvas.page.bg === v, action: () => Cmd.run('bg', v) }))], 0, 0, { anchor: a })));
      G('Fenster', B.big('fullscreen', 'Vollbild', 'fullscreen', 'Nur die Seite anzeigen (F11)'),
        B.col(B.small('sidebar', 'Navigation', 'sidebar', 'Notizbücher und Seitenliste anzeigen'), B.small('pageListSide', 'Seiten links', 'alignLeft', 'Seitenliste links neben der Seite', 'links'), B.small('pageListSide', 'Seiten rechts', 'alignRight', 'Seitenliste rechts (wie OneNote)', 'rechts')),
        B.col(B.small('foldNav', 'Notizbücher eingeklappt', 'foldLeft', 'Notizbuch-Spalte zu einem schmalen Streifen einklappen (Klick auf den Streifen klappt sie wieder auf)', 'groups'), B.small('foldNav', 'Seitenliste eingeklappt', 'foldLeft', 'Seitenliste zu einem schmalen Streifen einklappen', 'pages')));
      G('Tabs', B.bigSplit('tabNew', 'Neuer Tab', 'tabPlus', 'Die aktuelle Seite in einem neuen Tab öffnen (Pfeil: neue Seite, zuletzt geöffnete …; Mittelklick auf eine Seite in der Liste = neuer Tab)', (a) => Panes.addMenu(a)),
        B.col(B.small('splitRight', 'Rechts teilen', 'splitH', 'Bereich teilen: die Seite zusätzlich rechts daneben anzeigen (wie Obsidian)'), B.small('splitDown', 'Unten teilen', 'splitV', 'Bereich teilen: die Seite zusätzlich darunter anzeigen'), B.small('tabClose', 'Tab schliessen', 'x', 'Aktiven Tab schliessen (auch: Mittelklick auf den Tab)')),
        B.col(B.small('tabsMin', 'Tableiste einklappen', 'chevUp', 'Nur ein Strich mit Pfeilchen bleibt – das Pfeilchen klappt die Tabs wieder auf')));
      G('Hilfen', B.col(B.small('snap', 'Am Raster ausrichten', 'magnet'), B.small('scrollbars', 'Bildlaufleisten', 'scrollbars', 'Bildlaufleisten unten und rechts (Bereich = Rechteck um alle Objekte, wächst beim Verschieben mit)'), B.small('showAnchors', 'Ankerpunkte', 'anchor', 'Ecken des Rechtecks um alle Objekte immer anzeigen (sonst nur beim Scrollen)')),
        B.col(B.small('goAnchor', 'Zum Anfang', 'cornerUp', 'Ecke oben links aller Objekte anzeigen (Strg+Pos1)', 'tl'), B.small('goAnchor', 'Zum Ende', 'down', 'Ecke unten rechts aller Objekte anzeigen (Strg+Ende)', 'br')));
      G('Design', B.big('theme', 'Hell', 'sun', 'Helles Design', 'hell'), B.big('theme', 'Dunkel', 'moon', 'Dunkles Design', 'dunkel'),
        B.big('inkFix', 'Lesbare Farben', 'contrast', 'Schrift passt sich dem Hintergrund an. Ist dies eingeschaltet, werden auch fest gewählte Schriftfarben, die auf dem Hintergrund kaum zu erkennen sind, heller bzw. dunkler angezeigt (gespeichert bleibt die gewählte Farbe).'));
    }

    if (id === 'tabelle') {
      G('Zellen', B.col(B.small('xlRowAbove', 'Zeile oberhalb', 'rowAbove', 'Zeile(n) oberhalb einfügen'), B.small('xlRowBelow', 'Zeile unterhalb', 'rowBelow', 'Zeile(n) unterhalb einfügen'), B.small('xlDelRow', 'Zeile löschen', 'rowDel')),
        B.col(B.small('xlColLeft', 'Spalte links', 'colLeft', 'Spalte(n) links einfügen'), B.small('xlColRight', 'Spalte rechts', 'colRight', 'Spalte(n) rechts einfügen'), B.small('xlDelCol', 'Spalte löschen', 'colDel')));
      G('Schrift', B.col(
        B.row(B.glyph('bold', 'F', '', 'Fett (Strg+B)'), B.glyph('italic', 'K', 'i', 'Kursiv (Strg+I)'), B.glyph('underline', 'U', 'u', 'Unterstrichen (Strg+U)'), B.glyph('strike', 'abc', 's', 'Durchgestrichen')),
        B.row(B.colorSplit('xlBg', 'bucket', 'Füllfarbe der Zellen', { noneLabel: 'Keine Füllung' }), B.colorSplit('xlColor', 'textbox', 'Schriftfarbe', { noneLabel: 'Automatisch' })),
        B.row(B.ico('xlAlign', 'alignLeft', 'Linksbündig', 'l'), B.ico('xlAlign', 'alignCenter', 'Zentriert', 'c'), B.ico('xlAlign', 'alignRight', 'Rechtsbündig', 'r'))));
      G('Zahl', B.col(
        B.dropBtn('small', B.textGlyph('123', 'font-size:10px;font-weight:700'), 'Zahlenformat', 'Zahlenformat der markierten Zellen', menuOf(XL_FORMATS.map(([v, l, ex]) => ({ label: `${l}  –  ${ex}`, checked: !!Sheet.active && (Sheet.fmtActive('nf') || 'std') === v, action: () => Cmd.run('xlNumFmt', v) })))),
        B.row(B.split('xlCur', icon('currency', 16), 'Währung (CHF)', menuOf([['CHF', 'CHF 1’234.50'], ['€', '1’234.50 €'], ['$', '$ 1’234.50'], ['£', '£ 1’234.50']].map(([c, l]) => ({ label: l, action: () => Cmd.run('xlCur', c) })))),
          B.ico('xlPct', 'percent', 'Prozent'), B.ico('xlThousands', B.textGlyph('’000'), 'Tausendertrennzeichen ein/aus'), B.ico('xlDec', 'decInc', 'Dezimalstelle hinzufügen', 1), B.ico('xlDec', 'decDec', 'Dezimalstelle entfernen', -1))));
      G('Bearbeiten', B.dropBtn('big', icon('sigma', 28), 'AutoSumme', 'AutoSumme (Alt+=): Summe, Mittelwert, Anzahl, Max, Min', menuOf([['SUMME', 'Summe', 'Alt+='], ['MITTELWERT', 'Mittelwert'], ['ANZAHL', 'Anzahl Zahlen'], ['MAX', 'Maximum'], ['MIN', 'Minimum']].map(([f, l, key]) => ({ label: l, key, action: () => Cmd.run('xlSum', f) })))),
        B.col(B.small('xlFillDown', 'Nach unten füllen', 'fillDown', 'Erste Zeile der Auswahl nach unten kopieren (Strg+D) – oder das Kästchen unten rechts ziehen'), B.small('xlSortAsc', 'A → Z sortieren', 'sortAsc'), B.small('xlSortDesc', 'Z → A sortieren', 'sortDesc')),
        B.col(B.small('xlFx', 'Funktion', 'fx', 'Funktion einfügen (alle Funktionen mit Beschreibung)'), B.dropBtn('small', icon('eraser', 16), 'Löschen', 'Inhalte oder Formate der Auswahl löschen', menuOf([{ label: 'Inhalte löschen (Entf)', action: () => Cmd.run('xlClear', 'v') }, { label: 'Formate löschen', action: () => Cmd.run('xlClear', 'f') }, { label: 'Alles löschen', action: () => Cmd.run('xlClear', 'all') }])), B.small('xlRename', 'Umbenennen', 'pencil', 'Name der Tabelle (für Bezüge wie Tabelle1!A1)')));
      G('Tabellenformat', B.col(B.small('xlOpt', 'Kopfzeile', 'headRow', 'Erste Zeile als Überschrift (fett, farbig)', 'head'), B.small('xlOpt', 'Gebänderte Zeilen', 'banded', 'Jede zweite Zeile hinterlegt', 'band'), B.small('xlOpt', 'Gitternetz', 'gridOn', 'Linien zwischen den Zellen', 'grid')),
        B.dropBtn('big', icon('palette', 28), 'Farbe', 'Farbe der Kopfzeile und Bänder', menuOf([{ head: 'Tabellenfarbe' }, { colors: XL_STYLE_COLORS, wheel: false, action: (c) => Cmd.run('xlStyle', c) }])));
      G('Diagramm', B.gallery(CH_TYPES.map(([t, l, ic]) => ({ cmd: 'xlChart', arg: t, html: icon(ic, 20), title: l + ' aus der Auswahl (eine Zelle = zusammenhängender Bereich)', cls: 'shape-item' })), 4));
      G('Bezüge', B.col(B.small('xlPasteLink', 'Verknüpfung einfügen', 'link', 'Kopierte Zellen als Formeln einsetzen, die aktuell bleiben – auch von einer anderen Seite (=[Seite]Tabelle1!A1)'),
        B.small('xlCopyRef', 'Bezug kopieren', 'copy', 'Bezug der Auswahl kopieren, z.B. [Rezepte]Tabelle1!B2:B9 – zum Einsetzen in Formeln auf anderen Seiten'),
        B.dropBtn('small', icon('calc', 16), 'Berechnung', 'Wie Excel: automatisch oder manuell (dann mit F9 berechnen)', menuOf([{ label: 'Automatisch', checked: Store.ui.berechnung !== 'manuell', action: () => Cmd.run('xlCalcMode', 'auto') }, { label: 'Manuell (F9 = berechnen)', checked: Store.ui.berechnung === 'manuell', action: () => Cmd.run('xlCalcMode', 'manuell') }, '-', { label: 'Jetzt berechnen', key: 'F9', action: () => Cmd.run('xlRecalc') }, { label: 'Alles neu berechnen', key: 'Strg+Alt+F9', action: () => Cmd.run('xlRecalc', true) }]))));
      G('Daten', B.col(B.small('xlCsv', 'Als CSV speichern', 'csv', 'Tabelle als CSV-Datei (öffnet sich in Excel)'), B.small('importCsv', 'CSV importieren', 'download', 'CSV-Datei als neue Tabelle einlesen (auch per Ziehen auf die Seite)'), B.small('xlToCalc', 'In den Rechner', 'calc', 'Markierte Zahlen als Listen L1–L3 in den Taschenrechner (Statistik, Regression)'))), G('Hilfe', B.big('guide', 'Erste Schritte', 'help', 'Beispielseite: Tabellen und Formeln zum Ausprobieren', 'tabellen'));
    }

    if (id === 'diagramm') {
      G('Typ', B.gallery(CH_TYPES.map(([t, l, ic]) => ({ cmd: 'chType', arg: t, html: icon(ic, 20), title: l, cls: 'shape-item' })), 4));
      G('Beschriftung', B.col(B.small('chTitle', 'Titel', 'textbox', 'Diagrammtitel', 'title'), B.small('chTitle', 'Achse x', 'textbox', 'Titel der x-Achse', 'xTitle'), B.small('chTitle', 'Achse y', 'textbox', 'Titel der y-Achse', 'yTitle')),
        B.col(B.dropBtn('small', icon('legend', 16), 'Legende', 'Legende', menuOf([['r', 'Rechts'], ['b', 'Unten'], ['t', 'Oben'], ['none', 'Keine']].map(([v, l]) => ({ label: l, checked: !!Chart.selected() && Chart.selected().chart.legend === v, action: () => Cmd.run('chLegend', v) })))),
          B.small('chFlag', 'Datenbeschriftung', 'dataLabel', 'Werte an den Punkten/Säulen anzeigen', 'labels'), B.small('chFlag', 'Gitternetz', 'gridOn', 'Gitternetzlinien', 'grid')));
      G('Darstellung', B.col(B.small('chFlag', 'Punkte', 'chartScatter', 'Punkte auf Linien', 'markers'), B.small('chFlag', 'Geglättet', 'curve', 'Linien glätten', 'smooth'), B.small('chFlag', 'Gestapelt', 'chartCol', 'Säulen/Balken/Flächen stapeln', 'stacked')),
        B.dropBtn('big', icon('palette', 28), 'Farben', 'Farbschema', menuOf(CH_PALETTES.map(([n], i) => ({ label: n, checked: !!Chart.selected() && Chart.selected().chart.pal === i, action: () => Cmd.run('chPal', i) })))));
      G('Analyse', B.dropBtn('big', icon('trend', 28), 'Trendlinie', 'Regression mit Gleichung und R² (wie Excel)', menuOf(CH_TRENDS.map(([v, l]) => ({ label: l, checked: !!Chart.selected() && (Chart.selected().chart.trend || '') === v, action: () => Cmd.run('chTrend', v) })))),
        el('div', { class: 'hintcard', html: '<b>Werte ablesen:</b> Zeiger auf das Diagramm<br>(Linie/Punkte: auch zwischen den Punkten)<br><b>Klick auf einen Punkt</b> = Zelle zeigen' }));
      G('Daten', B.big('chEdit', 'Bearbeiten', 'pencil', 'Typ, Datenbereich, Beschriftungen, Trend (oder Doppelklick auf das Diagramm)'),
        B.col(B.small('chSwap', 'Zeile/Spalte wechseln', 'swap', 'Reihen aus Zeilen statt Spalten'), B.small('chSource', 'Daten markieren', 'table', 'Quellbereich in der Tabelle zeigen'), B.small('chData', 'Werte anzeigen', 'readout', 'Alle Werte des Diagramms als Liste (auch Trend-Gleichung)')),
        B.col(B.small('chToSheet', 'Als Tabelle', 'table', 'Die Werte des Diagramms als neue Tabelle einfügen')));
      G('Hilfe', B.big('guide', 'Erste Schritte', 'help', 'Beispielseite: Diagramme zum Ausprobieren', 'diagramme'));
    }

    const frag = [];
    out.forEach((g, i) => { if (i) frag.push(el('div', { class: 'rsep' })); frag.push(g); });
    return frag;
  },
  /* Einfügen → Tabelle: Raster zum Wählen der Grösse (wie Office) */
  tableMenu(anchor) {
    const box = el('div', { class: 'xl-pick' });
    const lab = el('div', { class: 'mhead', text: 'Tabelle (wie Excel)' });
    const grid = el('div', { class: 'xl-pickg' });
    const R = 8, C = 10;
    for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) grid.append(el('div', { class: 'xl-pc', dataset: { r, c } }));
    grid.addEventListener('mousemove', (e) => {
      const t = e.target.closest('.xl-pc'); if (!t) return;
      const rr = +t.dataset.r, cc = +t.dataset.c;
      grid.querySelectorAll('.xl-pc').forEach(x => x.classList.toggle('on', +x.dataset.r <= rr && +x.dataset.c <= cc));
      lab.textContent = `Tabelle ${cc + 1} × ${rr + 1}`;
    });
    grid.addEventListener('click', (e) => { const t = e.target.closest('.xl-pc'); if (!t) return; UI.closePopup(); Cmd.run('insertSheet', { ncols: +t.dataset.c + 1, nrows: +t.dataset.r + 1 }); });
    const it = (label, ic, fn) => { const m = el('div', { class: 'mi' }); m.innerHTML = `<span class="mi-ic">${icon(ic, 15)}</span><span class="mi-label"></span>`; m.querySelector('.mi-label').textContent = label; m.addEventListener('click', () => { UI.closePopup(); fn(); }); return m; };
    box.append(lab, grid, el('div', { class: 'msep' }),
      it('CSV-Datei importieren …', 'download', () => Cmd.run('importCsv')),
      it('Einfache Tabelle im Textfeld', 'textbox', () => { if (!canText()) { UI.toast('Zuerst in ein Textfeld klicken'); return; } Cmd.run('insertTable'); }));
    UI.showPopup(box, 0, 0, { anchor });
  },
  chartMenu(anchor, cmd) {
    UI.menu([{ head: Sheet.active ? 'Diagramm aus der Auswahl' : 'Diagramm einfügen' }, ...CH_TYPES.map(([t, l, ic]) => ({ label: l, icon: ic, action: () => Cmd.run(cmd, t) }))], 0, 0, { anchor });
  },

  build() {
    this.mode = this.modeNow();
    this.buildStrip();
    const tabs = $('#tabs');
    tabs.append(el('div', { class: 'tabs-right' }, el('span', { class: 'tabs-hint', text: 'Rechtsklick halten + ziehen = verbinden' })));
    // Stift ↔ Auswählen (1.49): fest rechts oben in der Registerzeile, auf jedem Register (im Vollbild oben links)
    const dt = el('button', { class: 'tab-draw', id: 'rb-draw', type: 'button' });
    dt.addEventListener('mousedown', e => e.preventDefault());
    dt.addEventListener('click', () => Draw.toggleSelect());
    tabs.append(dt);
    Draw.updateToggle();
    const pin = el('button', { class: 'tab-pin', id: 'rb-pin', type: 'button' });
    pin.addEventListener('mousedown', e => e.preventDefault());
    // im Vollbild blendet das Pfeilchen das ganze Menüband aus (1.40), sonst ein-/ausklappen
    pin.addEventListener('click', () => { Layout.peek(false); if (document.body.classList.contains('fullscreen')) App.fsRibbon(false); else Layout.toggleRibbon(); });
    tabs.append(pin);
    const panel = $('#panel');
    panel.addEventListener('mousedown', (e) => { if (!e.target.closest('input')) e.preventDefault(); });
    panel.addEventListener('wheel', (e) => { if (e.deltaY && !e.ctrlKey) { panel.scrollLeft += e.deltaY; } }, { passive: true });
    this.show(Store.ui.tab || 'start');
  },
  /* Registerleiste (je nach Seitentyp andere Register, 1.65) */
  buildStrip() {
    const tabs = $('#tabs');
    for (const x of [...tabs.querySelectorAll('.tab')]) x.remove();
    const right = tabs.querySelector('.tabs-right');
    for (const k of ['frei', 'dok', 'tab', 'folie']) tabs.classList.toggle('mode-' + k, this.mode === k);
    for (const t of this.TABS) {
      const b = el('button', { class: 'tab' + (t.id === 'datei' ? ' file' : '') + (t.ctx ? ' ctx' : ''), text: t.label, type: 'button' });
      if (t.ctx) b.hidden = true;
      b.dataset.tab = t.id;
      b.addEventListener('mousedown', e => e.preventDefault());
      b.addEventListener('click', () => {
        if (t.id === 'datei') { if (document.body.classList.contains('rb-peek')) Layout.peek(false); Backstage.open(); return; }   // Datei-Fenster (1.34)
        // eingeklapptes Menüband (1.41): ein Register antippen klappt es vorübergehend herunter, bis der Mauszeiger das
        // Menüband wieder verlässt (Finger: bis man daneben tippt); nochmals dasselbe Register = wieder zu. Dauerhaft
        // aufklappen nur mit dem Pfeilchen rechts bzw. Strg+F1.
        if (document.body.classList.contains('rb-min') && !document.body.classList.contains('fullscreen')) {
          if (document.body.classList.contains('rb-peek') && this.tab === t.id) { Layout.peek(false); return; }
          this.show(t.id);
          Layout.peek(true);
          return;
        }
        this.show(t.id);
      });
      // Doppelklick klappt nur EIN (wie OneNote); wieder auf nur mit dem Pfeilchen
      b.addEventListener('dblclick', () => { if (!Layout.ribbonMin() && !document.body.classList.contains('fullscreen')) Layout.toggleRibbon(); });
      if (right) right.before(b); else tabs.append(b);
    }
  },
  show(id) {
    // „Datei“ öffnet das Datei-Fenster (1.34); darunter bleibt das bisherige Register
    let bs = false;
    if (id === 'datei') {
      bs = typeof Backstage !== 'undefined' && Store.loaded;
      id = this.tab && this.tab !== 'datei' ? this.tab : 'start';
      if (this.tab === id && $('#panel').childElementCount) { if (bs) Backstage.open(); return; }
    } else if (typeof Backstage !== 'undefined') Backstage.close();
    const tt = this.TABS.find(t => t.id === id);
    if (!tt || (tt.ctx && !tt.ctx())) id = 'start';
    this.tab = id;
    document.body.classList.toggle('show-anim', id === 'p-anim');
    $$('#tabs .tab').forEach(t => t.classList.toggle('on', t.dataset.tab === id));
    const panel = $('#panel');
    panel.innerHTML = '';
    panel.append(...this.buildTab(id));
    if (Store.ui.tab !== id) { Store.ui.tab = id; UiState.saveSoon(); }
    this.refresh();
    // schmales Fenster: gewähltes Register (z.B. „Tabelle“ ganz rechts) in den sichtbaren Bereich scrollen
    const tabs = $('#tabs'), on = $('#tabs .tab.on');
    if (on && tabs.scrollWidth > tabs.clientWidth + 2) {
      const a = on.getBoundingClientRect(), t = tabs.getBoundingClientRect();
      if (a.left < t.left) tabs.scrollLeft -= t.left - a.left + 8;
      else if (a.right > t.right - 40) tabs.scrollLeft += a.right - t.right + 48;
    }
    if (bs) Backstage.open();
  },
  refreshSoon() {
    if (this._raf) return;
    this._raf = requestAnimationFrame(() => { this._raf = null; this.refresh(); });
  },
  refresh() {
    // Seitentyp gewechselt (Freiform ↔ Word/Excel/PowerPoint): andere Register
    const m = this.modeNow();
    // Übergänge/Animationen: Angaben der Auswahl bzw. Folie neu zeigen (1.66)
    if (m === 'folie' && (this.tab === 'p-anim' || this.tab === 'p-trans') && typeof OfficePpt !== 'undefined') {
      const f = OfficePpt.currentFrame(), key = [...Canvas.sel].join() + '|' + (f ? f.id + JSON.stringify(f.ox.tr || '') : '');
      if (key !== this._fxKey) { this._fxKey = key; this.show(this.tab); return; }
    }
    if (m !== this.mode) {
      const was = this.tab;
      this.mode = m;
      this.buildStrip();
      this.show(this.TABS.some(t => t.id === was && !t.ctx) ? was : 'start');
      return;
    }
    // Kontextregister (Tabelle, Diagramm) ein-/ausblenden
    for (const t of this.TABS) {
      if (!t.ctx) continue;
      const on = t.ctx();
      const b = $(`#tabs .tab[data-tab="${t.id}"]`);
      if (b) b.hidden = !on;
      if (!on && this.tab === t.id) { this.show(t.id === 'tabelle' ? (Sheet.prevTab && Sheet.prevTab !== 'tabelle' ? Sheet.prevTab : 'start') : t.id === 'diagramm' ? (Chart.prevTab && Chart.prevTab !== 'diagramm' ? Chart.prevTab : 'start') : 'start'); return; }
    }
    if (this.tab === 'diagramm' && this._chartFor !== (Chart.selected() || {}).id) { this._chartFor = (Chart.selected() || {}).id; }
    for (const b of $$('#panel [data-cmd]')) {
      if (b.dataset.for) continue;
      const cmd = b.dataset.cmd;
      const arg = b.dataset.arg !== undefined ? JSON.parse(b.dataset.arg) : undefined;
      b.disabled = Store.readOnly || !Cmd.enabled(cmd);
      b.classList.toggle('on', Cmd.active(cmd, arg));
    }
    for (const d of $$('#panel .rb.drop[data-for]')) d.disabled = !Cmd.enabled(d.dataset.for);
    const xl = !!Sheet.active;
    const t = canText() || xl;
    for (const inp of $$('#panel [data-combo]')) {
      const xd = xl && Sheet.data(Sheet.active.id), xx = xd && xd.xl;   // Excel-Seite (1.73): Schrift der Zelle bzw. der Mappe
      inp.disabled = !t || (xl && inp.dataset.combo === 'font' && !xx);
      if (document.activeElement === inp) continue;
      inp.value = !t ? '' : xl ? (inp.dataset.combo === 'font' ? (xx ? Sheet.fmtActive('fn') || xx.fn || 'Calibri' : '') : String(Sheet.fmtActive('fs') || (xx && xx.fs) || 11).replace('.', ',')) : inp.dataset.combo === 'font' ? Fmt.currentFont() : String(Fmt.currentSize()).replace('.', ',');
    }
  },
};
