'use strict';
/* Tabellen (wie Excel) auf der Seite: Darstellung, Auswahl, Bearbeiten mit Formeln, Formate, Ausfüllen,
 * Sortieren, Zwischenablage, Zeilen/Spalten. Das Rechnen steckt in sheet-calc.js (XL).
 * Seit 1.54 wie Excel: Auswahl am Rand ziehen = verschieben (Strg = kopieren), markierte Zeilen/Spalten an den Köpfen
 * ziehen = an neuer Stelle einfügen (auch Alt+Umschalt+Pfeil), Bezüge in allen Formeln wandern mit; beim Schreiben einer
 * Formel fügt ein Klick auf Zelle, Bereich, Zeilen- oder Spaltenkopf den Bezug ein (Hinweisfenster blockiert nicht mehr).
 * Datenmodell: Feld b mit b.sheet = { v, name, cells: { 'A1': { v: 'Rohtext', f: { b, i, u, s, al, c, bg, nf, d, cur, fs } } },
 *   nrows, ncols, cols: [Breiten px], head, band, grid, color } */

const XL_STYLE_COLORS = [null, '#2f6fd0', '#3a8f5a', '#c0504d', '#8064a2', '#e07b24', '#2a9db5', '#595959'];
const XL_REF_COLORS = ['#2f6fd0', '#c0392b', '#8e44ad', '#1e8449', '#d35400', '#117a65', '#b03a7a'];
const XL_FORMATS = [['std', 'Standard', '1234.5'], ['num', 'Zahl', '1’234.50'], ['cur', 'Währung', 'CHF 1’234.50'], ['pct', 'Prozent', '12%'],
  ['sci', 'Wissenschaftlich', '1.23E+03'], ['frac', 'Bruch', '1 1/4'], ['date', 'Datum kurz', '13.10.2026'], ['datel', 'Datum lang', '13. Oktober 2026'],
  ['time', 'Uhrzeit', '14:30'], ['text', 'Text', 'Text']];

const Sheet = {
  ver: 1, _book: null, _bookVer: 0, _bookPage: null,
  active: null,   // { id, c, r, c2, r2 }: aktive Zelle (c, r) und zweite Ecke der Auswahl
  edit: null,     // { id, c, r, text, orig, mode: 'enter'|'edit', point: { p, e } | null }
  clip: null,
  ac: null,       // Autovervollständigen { items, i, from, to }

  init() {
    this.kb = el('textarea', { class: 'xl-kb ui-only', tabindex: '-1', spellcheck: 'false', 'aria-label': 'Tabelle' });
    this.kb.addEventListener('keydown', e => this.onKey(e));
    this.kb.addEventListener('input', () => { const v = this.kb.value.replace(/^ /, ''); this.kb.value = ' '; if (v && this.active && !this.edit) this.startEdit('enter', v); });
    this.kb.addEventListener('copy', e => this.onCopy(e, false));
    this.kb.addEventListener('cut', e => this.onCopy(e, true));
    this.kb.addEventListener('paste', e => this.onPaste(e));
    // Bearbeitungsleiste
    const bar = $('#xl-bar');
    if (bar) {
      this.bar = bar;
      this.barIn = $('#xl-input'); this.nameBox = $('#xl-name');
      this.barIn.addEventListener('focus', () => { if (!this.active) return; if (!this.edit) this.startEdit('edit', undefined, true); else this.edit.inBar = true; });
      this.barIn.addEventListener('input', () => { if (!this.edit) return; this.edit.text = this.barIn.value; this.edit.point = null; this.syncEditor('bar'); });
      this.barIn.addEventListener('keydown', e => this.onEditKey(e, this.barIn));
      this.barIn.addEventListener('keyup', () => this.edit && this.afterCaret(this.barIn));
      this.barIn.addEventListener('click', () => this.edit && this.afterCaret(this.barIn));
      $('#xl-ok').addEventListener('mousedown', e => e.preventDefault());
      $('#xl-ok').addEventListener('click', () => this.commit());
      $('#xl-cancel').addEventListener('mousedown', e => e.preventDefault());
      $('#xl-cancel').addEventListener('click', () => this.cancel());
      $('#xl-fx').addEventListener('mousedown', e => e.preventDefault());
      $('#xl-fx').addEventListener('click', () => this.functionDialog());
      this.nameBox.addEventListener('keydown', (e) => {
        e.stopPropagation();
        if (e.key === 'Enter') { e.preventDefault(); this.goTo(this.nameBox.value); }
        if (e.key === 'Escape') { e.preventDefault(); this.refreshUi(); this.focusKb(); }
      });
      this.nameBox.addEventListener('focus', () => this.nameBox.select());
    }
  },

  /* ---------------------------------------------------------- Daten */
  box(id) { return Canvas.box(id); },
  data(id) { const b = this.box(id); return b && b.sheet; },
  sel() { const a = this.active; if (!a) return null; return { c1: Math.min(a.c, a.c2), r1: Math.min(a.r, a.r2), c2: Math.max(a.c, a.c2), r2: Math.max(a.r, a.r2) }; },
  /* ---------------------------------------------------------- Arbeitsmappe (seit 1.26 über alle Seiten)
   * Wie Excel mit mehreren Mappen: =[Seite]Tabelle1!A1 liest eine Tabelle einer anderen Seite. Jede Tabelle heisst in
   * der Mappe „Seite/Feld“ (Feld-IDs können sich auf importierten Seiten wiederholen). Die Mappe bleibt bestehen:
   * gemerkte Werte werden nur dort vergessen, wo sich etwas geändert hat (XL.Book.changed: geänderte Zellen + alle
   * Formeln, die – auch über andere Seiten – davon lesen, + die flüchtigen wie HEUTE). Gezeichnet werden danach nur
   * die betroffenen Tabellen und Diagramme der offenen Seite; andere Seiten rechnen erst, wenn man sie öffnet. */
  sid(id, pid = this.curPid()) { return pid + '/' + id; },
  curPid() { const p = Canvas.page; return p ? (p.id || Canvas.pageId) : null; },
  /* neu einlesen (Aufbau, Seite oder Rückgängig geändert) – rechnet nur neu, was sich wirklich geändert hat */
  bump() { this.ver++; this._scan = true; },
  /* alles neu rechnen (Strg+Alt+F9, Tabelle umbenannt …) */
  reset() { this.bump(); this._hard = true; },
  _scan: true,
  book() {
    if (!this._book) this._book = new XL.Book([], { resolve: (from, path, sheet) => this.resolvePage(from, path, sheet) });
    if (this._scan) this.rescan();
    return this._book;
  },
  rescan() {
    const book = this._book;
    this._scan = false;
    const list = [], seen = new Set(), cur = Canvas.page, curId = this.curPid();
    // Seitenverzeichnis für [Seite]-Bezüge: Titel → Seiten (in Baumreihenfolge) mit Pfad (Notizbuch, Gruppen, Abschnitt)
    const byTitle = new Map(), info = new Map(), sheets = new Map();
    const addPage = (p, path, sec) => {
      if (!p || seen.has(p.id)) return;
      seen.add(p.id);
      const pg = p.id === curId && cur ? cur : p;   // offene Seite (auch eine ältere Version in der Vorschau)
      let names = null;
      for (const b of pg.boxes) {
        if (!b.sheet) continue;
        list.push({ id: pg.id + '/' + b.id, name: b.sheet.name, d: b.sheet, page: pg.id, box: b.id });
        (names || (names = new Set())).add(String(b.sheet.name).toLowerCase());
      }
      if (!names) return;
      sheets.set(p.id, names);
      const e = { pid: p.id, path, sec, nb: path[0] || '' };
      info.set(p.id, e);
      const t = String(pg.title || '').trim().toLowerCase();
      if (!t) return;
      if (!byTitle.has(t)) byTitle.set(t, []);
      byTitle.get(t).push(e);
    };
    const walk = (gs, path) => {
      for (const g of gs) {
        const pp = [...path, String(g.name || '').trim().toLowerCase()];
        for (const pid of g.pages) addPage(Store.pages[pid], pp, g.id);
        walk(g.groups, pp);
      }
    };
    walk(Store.groups || [], []);
    if (cur && curId && !seen.has(curId)) addPage(cur, [], null);
    // Fingerabdruck: Tabellen-IDs, Namen, Titel und Pfade – ändert sich etwas davon, können Bezüge anders zeigen
    let sig = '';
    for (const x of list) sig += x.id + '\u0001' + x.name + '\u0002';
    for (const [t, es] of byTitle) sig += t + '\u0003' + es.map(e => e.pid + '>' + e.path.join('/')).join('|');
    this._pix = { byTitle, info, sheets };
    this._rcache = new Map();
    if (this._hard || sig !== this._sig) {
      book.setSheets(list);
      book.reset();
      this._hard = false;
      this._sig = sig;
      this._pending = null;
      this._moved = true;
      return;
    }
    // gleicher Aufbau: nur Tabellen mit neuem Inhalt (Rückgängig, Neu laden, Versionen) vergessen + flüchtige
    const changed = [];
    for (const x of list) { const o = book.byId.get(x.id); if (!o || o.d !== x.d) changed.push({ id: x.id }); }
    book.setSheets(list);
    if (changed.length) { book.changed(changed); this._moved = true; }
    book.volatile();
  },
  /* nach jeder Änderung (Hist.commit): Seiten gelöscht, verschoben, umbenannt, Tabellen entfernt … → beim nächsten
   * Rechnen neu einlesen; zeigt die offene Seite dadurch andere Werte, wird sie neu gezeichnet */
  touch() {
    this._scan = true;
    if (this._touchT) return;
    this._touchT = setTimeout(() => {
      this._touchT = null;
      if (!this._scan || !this._book) return;
      this._moved = false;
      this.book();
      if (this._moved) { this._moved = false; this.ver++; this.redrawAll(); }
    }, 0);
  },
  /* alle Tabellen und Diagramme der offenen Seite neu zeichnen (nur geänderte Zellen werden im DOM ersetzt) */
  redrawAll() {
    const p = Canvas.page;
    if (!p) return;
    for (const b of p.boxes) { const e = Canvas.els.get(b.id); if (e && (b.sheet || (b.chart && b.chart.src))) Canvas.updateBox(b, e); }
    Canvas.layout();
    if (this.active) this.refreshUi();
  },
  /* [Seite]-Bezug auflösen. pfad: „Seite“, „Abschnitt/Seite“ oder „Notizbuch/…/Abschnitt/Seite“ (Gross/klein egal).
   * Gleichnamige Seiten: zuerst die mit dieser Tabelle, dann die im selben Abschnitt, im selben Notizbuch, sonst die
   * erste im Baum. Ergebnis: Seiten-ID oder null (#BEZUG!) */
  resolvePage(from, path, sheet) {
    const ix = this._pix;
    if (!ix) return null;
    const ck = from + '\u0001' + path + '\u0001' + sheet;
    if (this._rcache.has(ck)) return this._rcache.get(ck);
    const p = String(path).trim().toLowerCase();
    let cand = ix.byTitle.get(p), quals = [];
    if (!cand) {
      const parts = p.split('/').map(x => x.trim()).filter(Boolean);
      cand = ix.byTitle.get(parts.pop() || '');
      quals = parts;
    }
    let res = null;
    if (cand) {
      // Pfad: der letzte Teil ist der Abschnitt, die übrigen müssen davor (in dieser Reihenfolge) vorkommen
      if (quals.length) cand = cand.filter(e => {
        if (e.path[e.path.length - 1] !== quals[quals.length - 1]) return false;
        let j = e.path.length - 2;
        for (let i = quals.length - 2; i >= 0; i--) { while (j >= 0 && e.path[j] !== quals[i]) j--; if (j < 0) return false; j--; }
        return true;
      });
      if (sheet != null) { const w = cand.filter(e => ix.sheets.get(e.pid).has(String(sheet).toLowerCase())); if (w.length) cand = w; }
      const f = from != null && ix.info.get(from);
      const pick = cand.length > 1 && f ? cand.find(e => e.sec && e.sec === f.sec) || cand.find(e => e.nb === f.nb) : null;
      res = (pick || cand[0] || {}).pid || null;
    }
    this._rcache.set(ck, res);
    return res;
  },
  /* kürzester Pfad, mit dem eine Formel auf Seite „from“ die Seite pid eindeutig findet (für Bezug kopieren, Verknüpfung) */
  pathFor(pid, from, sheet) {
    this.book();
    const p = Store.pages[pid] || (Canvas.page && Canvas.page.id === pid ? Canvas.page : null), e = this._pix.info.get(pid);
    const t = p && String(p.title || '').trim();
    if (!t || !e || t.includes(']')) return null;
    const names = Tree.path(e.sec).map(g => String(g.name || '').trim());
    const tries = [t];
    for (let i = names.length - 1; i >= 0; i--) tries.push([...names.slice(i)].join('/') + '/' + t);
    for (const x of tries) if (!/\]/.test(x) && this.resolvePage(from, x, sheet) === pid) return x;
    return null;
  },
  /* Bezugstext für eine Formel auf Seite „from“: A1, Tabelle2!A1:B3 oder [Seite]Tabelle2!A1:B3 */
  refText(pid, boxId, from, fromBox, c1, r1, c2, r2, abs) {
    const p = pid === this.curPid() && Canvas.page ? Canvas.page : Store.pages[pid];
    const b = p && p.boxes.find(x => x.id === boxId);
    if (!b || !b.sheet) return null;
    const cell = (c, r) => abs ? '$' + XL.colName(c) + '$' + (r + 1) : XL.key(c, r);
    const rng = c1 === c2 && r1 === r2 ? cell(c1, r1) : cell(c1, r1) + ':' + cell(c2, r2);
    if (pid === from) return (boxId === fromBox ? '' : XL.sheetPrefix(b.sheet.name)) + rng;
    const path = this.pathFor(pid, from, b.sheet.name);
    return path == null ? null : XL.sheetPrefix(b.sheet.name, path) + rng;
  },
  /* geänderte Zellen melden: cells = [[c, r], …] oder { c1, r1, c2, r2 }; ohne = ganze Tabelle */
  markDirty(id, cells, pid) {
    if (!id) return;
    const m = this._dirty || (this._dirty = new Map()), k = this.sid(id, pid || this.curPid());
    let o = m.get(k);
    if (o === true) return;
    if (!cells) { m.set(k, true); return; }
    if (!o) m.set(k, o = { cells: [], rngs: [] });
    if (Array.isArray(cells)) for (const x of cells) o.cells.push(x); else o.rngs.push(cells);
  },
  sh(id) { return this.book().byId.get(this.sid(id)) || null; },
  value(id, c, r) { const sh = this.sh(id); return sh ? this.book().val(sh, c, r) : null; },
  /* Berechnung wie Excel: automatisch (Standard) oder manuell (F9 = jetzt berechnen) */
  manual() { return Store.ui.berechnung === 'manuell'; },
  pendingCalc() { return !!(this._pending && this._pending.length); },
  /* F9: ausstehende Änderungen durchrechnen; full (Strg+Alt+F9): alles neu */
  recalc(full) {
    if (full) this.reset();
    else {
      const book = this.book(), list = this._pending || [];
      this._pending = null;
      book.changed(list);
      book.volatile();
      this.ver++;
    }
    this._pending = null;
    if (Canvas.page) { Canvas.render(); Canvas.layout(); }
    this.refreshUi();
    UI.toast(full ? 'Alles neu berechnet' : 'Neu berechnet');
  },
  cellF(d, c, r) { const x = d.cells[XL.key(c, r)]; return (x && x.f) || {}; },
  raw(d, c, r) { const x = d.cells[XL.key(c, r)]; return x ? x.v : ''; },
  display(id, c, r) { const d = this.data(id); return XL.format(this.value(id, c, r), this.cellF(d, c, r)); },
  width(d) { return d.cols.reduce((s, w) => s + w, 0) + 1 + 2 * BORDER; },
  uniqueName(base, page = Canvas.page, except = null) {
    const used = new Set((page ? page.boxes : []).filter(b => b.sheet && b.id !== except).map(b => b.sheet.name.toLowerCase()));
    if (!used.has(base.toLowerCase())) return base;
    const m = /^(.*?)(\d+)$/.exec(base);
    const stem = m ? m[1] : base;
    for (let i = m ? +m[2] + 1 : 2; ; i++) if (!used.has((stem + i).toLowerCase())) return stem + i;
  },
  locked(id, c, r) { const b = this.box(id); return !b || Canvas.isLocked(b) || Store.readOnly || !!App.preview || (typeof OfficeXT !== 'undefined' && OfficeXT.protLocked(id, c, r)); },   // 1.72: Blattschutz (entsperrte Zellen mit c, r)

  /* neue Tabelle auf der Seite */
  create(pt, opts = {}) {
    if (!Canvas.page) return null;
    Canvas.stopEditing();
    const ncols = opts.ncols || 4, nrows = opts.nrows || 5;
    const d = XL.normSheet({ name: this.uniqueName(opts.name || 'Tabelle1'), cells: opts.cells || {}, nrows, ncols, cols: opts.cols || Array(ncols).fill(opts.colW || 96), head: !!opts.head, band: !!opts.band, grid: true, color: opts.color || null });
    const b = {
      id: uid('b'), x: Canvas.snapV(pt.x), y: Canvas.snapV(pt.y), w: this.width(d), html: '', images: [], z: Canvas.maxZ() + 1,
      style: { bg: 'transparent' }, locked: false, pkg: opts.pkg || null, sheet: d,
    };
    Canvas.page.boxes.push(b);
    this.bump();
    Canvas.render();
    Hist.touchPage(Canvas.pageId);
    Hist.commit(opts.label || 'Tabelle eingefügt');
    this.activate(b.id, 0, 0);
    return b;
  },

  /* ---------------------------------------------------------- Darstellung */
  make(b) {
    const e = el('div', { class: 'box xl', dataset: { id: b.id } });
    e.innerHTML = `<div class="box-bar" title="Ziehen zum Verschieben · Doppelklick auf den Namen = umbenennen"><span class="xl-title"></span><span class="box-grip"></span><span class="box-lock">${icon('lock', 10)}</span></div>` +
      `<div class="box-body"><div class="xl-wrap"><table class="xl-grid"></table><div class="xl-ov ui-only"></div></div></div>` +
      `<div class="xl-colhead ui-only"></div><div class="xl-rowhead ui-only"></div><div class="xl-corner ui-only" title="Alles markieren"></div>` +
      `<button class="xl-add xl-add-c ui-only" type="button" title="Spalte anfügen">+</button><button class="xl-add xl-add-r ui-only" type="button" title="Zeile anfügen">+</button>` +
      `<div class="sock l" title="Ziehen zum Verbinden"></div><div class="sock r" title="Ziehen zum Verbinden"></div>`;
    return e;
  },
  update(b, e, force) {
    const d = b.sheet;
    const w = this.width(d);
    if (b.w !== w) { b.w = w; e.style.width = w + 'px'; }
    e.querySelector('.xl-title').textContent = d.name;
    e.classList.toggle('xl-nogrid', !d.grid);
    e.classList.toggle('noheads', d.heads === false);
    // Excel-Blatt (1.71): Schrift und Zeilenhöhe der Mappe
    const xs = d.xl ? `${d.xl.fn}|${d.xl.fs}|${d.xl.rh}` : '';
    if (e._xs !== xs) {
      e._xs = xs; e.classList.toggle('xlx', !!d.xl);
      e.style.setProperty('--xl-font', d.xl ? `"${String(d.xl.fn).replace(/"/g, '')}", var(--font-note)` : '');
      e.style.setProperty('--xl-fs', d.xl ? d.xl.fs + 'pt' : '');
      e.style.setProperty('--xl-rh', d.xl ? d.xl.rh + 'px' : '');
    }
    e.style.setProperty('--xl-acc', d.color || 'var(--xl-accent)');
    // Schriftfarbe passend zum Hintergrund: Seite, Kopfzeile, gebänderte Zeilen, Füllfarben der Zellen
    const base = Canvas.inkBg(b), acc = (d.color && Contrast.rgb(d.color)) || Contrast.themeColor('--xl-accent');
    const dark = Contrast.dark();
    this._ink = { base, hd: acc, band: Contrast.mix(base, acc, 0.12), dark, fix: Contrast.fixOn() };
    const hdInk = Contrast.auto(acc, true, Contrast.MIN);   // Kopfzeile: wie bisher eher hell, solange lesbar
    if (e._xlHd !== hdInk) { e.style.setProperty('--xl-hd-ink', hdInk); e._xlHd = hdInk; }
    const ink = Contrast.key() + Contrast.hex(base) + Contrast.hex(acc);
    if (force || e._xlVer !== this.ver || e._xlSig !== this.sigOf(d) || e._xlInk !== ink) { e._xlInk = ink; this.renderGrid(b, e); }
    this.overlay(b, e);
  },
  sigOf(d) { return d.ncols + 'x' + d.nrows + '|' + d.cols.join(',') + '|' + (d.head ? 1 : 0) + (d.band ? 1 : 0) + (d.grid ? 1 : 0) + d.color + (d.freeze ? '|fz' + d.freeze.r + ',' + d.freeze.c : '') + (d.cf ? '|cf' + JSON.stringify(d.cf).length + ':' + d.cf.length : '') +
    (d.rowh ? '|rh' + JSON.stringify(d.rowh) : '') + (d.hideR ? '|hr' + d.hideR.join(',') : '') + (d.hideC ? '|hc' + d.hideC.join(',') : '') + (d.merges ? '|mg' + d.merges.join(',') : '') + (d.xl ? '|x' : '') +
    (d.hideF ? '|hf' + d.hideF.join(',') : '') + (d.af ? '|af' + JSON.stringify(d.af) : '') + (d.notes ? '|nt' + JSON.stringify(d.notes) : '') + (d.showF ? '|sf' : '') + (d.ps ? '|ps' + JSON.stringify(d.ps) : '') + (d.prot && d.prot.on ? '|pr' : ''); },
  cellStyle(f, hd, band, orig) {   // orig = gespeicherte Farben (Kopieren nach Word/Excel)
    let s = '';
    if (f.b || hd) s += 'font-weight:700;';
    if (f.b === false && hd) s += 'font-weight:400;';
    if (f.i) s += 'font-style:italic;';
    if (f.u || f.s) s += `text-decoration:${f.u ? 'underline ' : ''}${f.s ? 'line-through' : ''};`;
    const k = orig ? null : this._ink;
    if (k && (f.c || f.bg)) {
      // fest gewählte Schriftfarbe bleibt (nur bei zu wenig Kontrast heller/dunkler), sonst automatisch zur Füllfarbe
      let bg = f.bg && Contrast.rgb(f.bg);
      bg = bg && bg[3] >= 26 ? (bg[3] >= 250 ? bg : Contrast.over(bg, k.base)) : hd ? k.hd : band ? k.band : k.base;
      const c = f.c ? (k.fix && Contrast.readable(f.c, bg, k.dark)) || f.c : Contrast.auto(bg, hd || k.dark);
      s += `color:${c};`;
    } else if (f.c) s += `color:${f.c};`;
    if (f.bg) s += `background:${f.bg};`;
    if (f.fs) s += `font-size:${f.fs}pt;`;
    if (f.fn) s += `font-family:"${String(f.fn).replace(/["<>;]/g, '')}",var(--font-note);`;   // Schriftart der Zelle (1.71)
    if (f.va) s += `vertical-align:${f.va === 't' ? 'top' : 'middle'};`;
    if (f.in) s += `padding-left:${5 + f.in * 9}px;`;
    if (f.bd && typeof OfficeGrid !== 'undefined') s += OfficeGrid.borderCss(f.bd);   // Rahmenlinien (1.67)
    return s;
  },
  /* Tabelle zeichnen. Gleicher Aufbau wie vorher: nur die Zellen anfassen, deren Anzeige sich geändert hat (schont den Browser) */
  renderGrid(b, e) {
    const d = b.sheet, book = this.book(), sh = this.sh(b.id);
    const sig = this.sigOf(d);
    // 1.67: fixierte Zeilen/Spalten und bedingte Formatierung (office-grid.js)
    const G = typeof OfficeGrid !== 'undefined' ? OfficeGrid : null;
    const cfx = G && d.cf ? G.cfPrep(d, (c, r) => sh ? book.val(sh, c, r) : null) : null;
    // verbundene Zellen (1.71): Text steht in der Fläche darüber, nicht in der Zelle oben links
    const mga = d.merges && d.merges.length ? new Set(d.merges.map(m => { const g = XL.parseRange(m); return g ? XL.key(g.c1, g.r1) : ''; })) : null;
    const cellOf = (c, r, hd) => {
      const fz = d.freeze && G ? G.fzClass(d, c, r) : '';
      const cell = d.cells[XL.key(c, r)];
      if (!cell) return [fz.trim(), '', ''];
      const f = cell.f || (d.xl && d.xl.f0) || {};
      const v = sh ? book.val(sh, c, r) : null;
      const disp = d.showF && XL.isFormula(cell.v) ? { t: String(cell.v), al: 'l' } : XL.format(v, f);   // Formeln anzeigen (1.72)
      const al = f.al || disp.al;
      const band = !hd && d.band && r % 2 === (d.head ? 0 : 1);
      let st = this.cellStyle(f, hd, band);
      if (cfx) st += cfx(c, r, v);
      // Excel-Blatt (1.71): ohne Zeilenumbruch einzeilig; linksbündiger Text läuft wie in Excel in leere Nachbarzellen
      let x = '';
      if (d.xl) {
        if (f.wr) x = ' xl-wr';
        else if (al === 'l' && disp.t && typeof v !== 'number') { const nb = d.cells[XL.key(c + 1, r)]; x = !nb || nb.v === '' ? ' xl-of' : ' xl-nw'; }
        else x = ' xl-nw';
      }
      return ['xl-' + al + (disp.err ? ' xl-err' : '') + (typeof v === 'number' ? ' xl-n' : '') + x + fz, st, mga && mga.has(XL.key(c, r)) ? '' : disp.t];
    };
    const t = e.querySelector('.xl-grid');
    if (e._xlSig === sig && e._cells && e._cells.length === d.nrows && t.rows.length === d.nrows) {
      let n = 0;
      for (let r = 0; r < d.nrows; r++) {
        const hd = d.head && r === 0, row = e._cells[r];
        for (let c = 0; c < d.ncols; c++) {
          const nv = cellOf(c, r, hd), ov = row[c];
          if (ov[0] === nv[0] && ov[1] === nv[1] && ov[2] === nv[2]) continue;
          const td = t.rows[r].cells[c];
          if (ov[0] !== nv[0]) td.className = nv[0];
          if (ov[1] !== nv[1]) td.style.cssText = nv[1];
          if (ov[2] !== nv[2]) td.textContent = nv[2];
          row[c] = nv; n++;
        }
      }
      e._xlVer = this.ver;
      if (n) { this.measure(e); this.mergeLayer(b, e); }
      return;
    }
    const cells = [];
    const hc = d.hideC ? new Set(d.hideC) : null, hr = d.hideR || d.hideF ? new Set([...(d.hideR || []), ...(d.hideF || [])]) : null;   // 1.72: + vom Filter ausgeblendete
    let h = '<colgroup>' + d.cols.map((w, c) => `<col style="width:${hc && hc.has(c) ? 0 : w}px"${hc && hc.has(c) ? ' class="xl-hidc"' : ''}>`).join('') + '</colgroup><tbody>';
    for (let r = 0; r < d.nrows; r++) {
      const hd = d.head && r === 0, row = [];
      const rh = d.rowh && d.rowh[r];
      h += `<tr class="${hd ? 'xl-hd' : d.band && r % 2 === (d.head ? 0 : 1) ? 'xl-bd' : ''}${hr && hr.has(r) ? ' xl-hidr' : ''}"${rh ? ` style="height:${rh}px"` : ''}>`;
      for (let c = 0; c < d.ncols; c++) {
        const cv = cellOf(c, r, hd);
        row.push(cv);
        h += cv[0] || cv[1] || cv[2] ? `<td class="${cv[0]}" style="${cv[1]}">${escapeHtml(cv[2])}</td>` : '<td></td>';
      }
      cells.push(row);
      h += '</tr>';
    }
    t.innerHTML = h + '</tbody>';
    // feste Breite = Summe der Spalten: sonst gilt table-layout:fixed nicht und einzeilige Texte (Excel, 1.71) machen Spalten breiter
    t.style.width = d.cols.reduce((n, w, c) => n + (hc && hc.has(c) ? 0 : w), 0) + 'px';
    e._cells = cells;
    e._xlVer = this.ver; e._xlSig = sig;
    this.measure(e);
    this.mergeLayer(b, e);
  },
  /* verbundene Zellen (1.71): über dem Raster eine Fläche je Bereich mit Inhalt und Format der Zelle oben links */
  mergeLayer(b, e) { this.mergeLayer0(b, e); if (typeof OfficeXT !== 'undefined') OfficeXT.decor(b, e); },   // 1.72: Notizen, Filterknöpfe, Seitenumbrüche
  mergeLayer0(b, e) {
    const d = b.sheet, wrap = e.querySelector('.xl-wrap');
    let L = wrap.querySelector('.xl-mgl');
    if (!d.merges || !d.merges.length) { if (L) L.remove(); e._merges = null; return; }
    if (!L) { L = el('div', { class: 'xl-mgl' }); wrap.querySelector('.xl-ov').before(L); }
    const t = e.querySelector('.xl-grid'), C = e._cols || [], R = e._rows || [];
    e._merges = [];
    let h = '';
    for (const ref of d.merges) {
      const g = XL.parseRange(ref);
      if (!g || g.r1 >= R.length || g.c1 >= C.length) continue;
      const c2 = Math.min(g.c2, C.length - 1), r2 = Math.min(g.r2, R.length - 1);
      e._merges.push({ c1: g.c1, r1: g.r1, c2, r2 });
      const td = t.rows[g.r1] && t.rows[g.r1].cells[g.c1];
      if (!td) continue;
      const x = C[g.c1][0], y = R[g.r1][0], w = C[c2][0] + C[c2][1] - x, hh = R[r2][0] + R[r2][1] - y;
      // ganz in fixierten Zeilen/Spalten: steht mit; nur teilweise: über den fixierten Zellen
      const fz = d.freeze ? (g.r2 < d.freeze.r ? ' xl-fzr' : '') + (g.c2 < d.freeze.c ? ' xl-fzc' : '') + ((g.r1 < d.freeze.r && g.r2 >= d.freeze.r) || (g.c1 < d.freeze.c && g.c2 >= d.freeze.c) ? ' xl-fzx' : '') : '';
      const cf = (d.cells[XL.key(g.c1, g.r1)] || {}).f || (d.xl && d.xl.f0) || {};
      const txt = this.display(b.id, g.c1, g.r1).t;
      h += `<div class="xl-mg ${td.className.replace(/xl-(of|nw|fz\w*)/g, '')}${fz}${cf.va ? ' xl-va-' + cf.va : ''}" style="left:${x}px;top:${y}px;width:${w}px;height:${hh}px;${td.style.cssText}">${escapeHtml(txt)}</div>`;
    }
    L.innerHTML = h;
  },
  measure(e) {
    const t = e.querySelector('.xl-grid');
    const rows = t.rows;
    e._rows = Array.from(rows, tr => [tr.offsetTop, tr.offsetHeight]);
    e._cols = rows.length ? Array.from(rows[0].cells, td => [td.offsetLeft, td.offsetWidth]) : [];
    e._gy = BAR;   // Tabelle beginnt unter der Leiste
    const b = this.box(e.dataset.id);
    e._fz = b && b.sheet && b.sheet.freeze && typeof OfficeGrid !== 'undefined' && OfficeGrid.endless(b.id) ? b.sheet.freeze : null;
  },
  /* Zellrechteck im Feld (px, innerhalb des Rahmens) */
  rectOf(e, c1, r1, c2 = c1, r2 = r1) {
    const C = e._cols || [], R = e._rows || [];
    if (!C.length || !R.length) return null;
    c1 = clamp(c1, 0, C.length - 1); c2 = clamp(c2, 0, C.length - 1); r1 = clamp(r1, 0, R.length - 1); r2 = clamp(r2, 0, R.length - 1);
    let x = C[c1][0], y = e._gy + R[r1][0];
    const out = { x, y, w: C[c2][0] + C[c2][1] - x, h: e._gy + R[r2][0] + R[r2][1] - y };
    // fixierte Zeilen/Spalten (1.71): dort, wo sie gerade stehen
    const fz = e._fz;
    if (fz) { if (r2 < fz.r) out.y += e._hy || 0; if (c2 < fz.c) out.x += e._hx || 0; }
    return out;
  },
  /* Datenüberprüfung „Liste“ (1.71, aus Excel): Eintrag für eine Zelle → { ref, src } oder null */
  dvAt(b, c, r) {
    const d = b && b.sheet;
    if (!d || !d.dv) return null;
    for (const v of d.dv) { if (v.drop === false || (v.t && v.t !== 'list')) continue; const g = XL.parseRange(v.ref); if (g && c >= g.c1 && c <= g.c2 && r >= g.r1 && r <= g.r2) return v; }
    return null;
  },
  /* Werte der Liste: "a,b,c" oder Bezug (auch auf ein anderes, ausgeblendetes Blatt) */
  dvValues(b, v) {
    let src = String(v.src || '').trim();
    if (/^".*"$/.test(src)) return src.slice(1, -1).split(',').map(x => x.trim()).filter(Boolean);
    src = src.replace(/^=/, '');
    const m = /^(?:'((?:[^']|'')+)'|([^!]+))!(.+)$/.exec(src);
    let box = b, rg = src;
    if (m) {
      const name = (m[1] || m[2]).replace(/''/g, "'");
      box = Canvas.page.boxes.find(x => x.sheet && (x.sheet.name === name || (x.ox && x.ox.name === name)));
      rg = m[3];
    }
    const g = box && XL.parseRange(rg.replace(/\$/g, ''));
    if (!g) return [];
    const out = [], sh = this.sh(box.id), book = this.book();
    for (let r = g.r1; r <= Math.min(g.r2, g.r1 + 500); r++) for (let c = g.c1; c <= Math.min(g.c2, g.c1 + 50); c++) {
      const val = sh ? book.val(sh, c, r) : null;
      const t = val == null || val === '' ? '' : XL.format(val, ((box.sheet.cells[XL.key(c, r)] || {}).f) || {}).t;
      if (t !== '') out.push(t);
    }
    return out;
  },
  dvMenu(anchor) {
    const a = this.active, b = a && this.box(a.id), v = b && this.dvAt(b, a.c, a.r);
    if (!v) return;
    const list = this.dvValues(b, v);
    const cur = (b.sheet.cells[XL.key(a.c, a.r)] || {}).v || '';
    const ro = this.locked(a.id, a.c, a.r);
    const items = [{ head: 'Auswahlliste' }, ...(list.length ? list.map(x => ({ label: x, checked: x === cur, disabled: ro, action: () => this.setCells(a.id, [[a.c, a.r, x]], 'Aus der Liste gewählt') })) : [{ label: '(Liste leer)', disabled: true }])];
    if (cur && !ro) items.push('-', { label: 'Leeren', icon: 'x', action: () => this.setCells(a.id, [[a.c, a.r, '']], 'Zelle geleert') });
    if (anchor) UI.menu(items, 0, 0, { anchor });
    else { const e = Canvas.els.get(a.id), r = e && this.rectOf(e, a.c, a.r), vr = e && e.getBoundingClientRect(), z = Canvas.view.z; UI.menu(items, vr ? vr.left + (r.x + BORDER) * z : 200, vr ? vr.top + (r.y + r.h + BORDER) * z : 200); }
  },
  /* verbundener Bereich, der die Zelle enthält (oder null) */
  mergeAt(e, c, r) { for (const m of (e && e._merges) || []) if (c >= m.c1 && c <= m.c2 && r >= m.r1 && r <= m.r2) return m; return null; },
  /* Punkt (Fensterkoordinaten) -> Zelle; out = ausserhalb (dann die nächste) */
  cellAt(id, cx, cy) {
    const b = this.box(id), e = Canvas.els.get(id);
    if (!b || !e || !e._cols) return null;
    const w = Canvas.toWorld(cx, cy);
    let lx = w.x - b.x - BORDER, ly = w.y - b.y - BORDER - e._gy;
    let c = 0, r = 0;
    const C = e._cols, R = e._rows;
    // fixierte Zeilen/Spalten (1.71): stehen um --hx/--hy verschoben – Klick dort meint sie
    const fz = e._fz;
    if (fz && fz.r && R[fz.r - 1]) { const hy = e._hy || 0, fh = R[fz.r - 1][0] + R[fz.r - 1][1]; if (ly >= hy && ly < hy + fh) ly -= hy; }
    if (fz && fz.c && C[fz.c - 1]) { const hx = e._hx || 0, fw = C[fz.c - 1][0] + C[fz.c - 1][1]; if (lx >= hx && lx < hx + fw) lx -= hx; }
    while (c < C.length - 1 && lx >= C[c][0] + C[c][1]) c++;
    while (r < R.length - 1 && ly >= R[r][0] + R[r][1]) r++;
    const out = lx < 0 || ly < 0 || lx > C[C.length - 1][0] + C[C.length - 1][1] || ly > R[R.length - 1][0] + R[R.length - 1][1];
    const m = this.mergeAt(e, c, r);   // verbundene Zellen: immer die Zelle oben links
    if (m) { c = m.c1; r = m.r1; }
    return { c, r, out, lx, ly };
  },
  /* Auswahl, aktive Zelle, Ausfüllkästchen, Kopf, Bezüge beim Bearbeiten */
  overlay(b, e) {
    e = e || Canvas.els.get(b.id);
    if (!e) return;
    const ov = e.querySelector('.xl-ov');
    const a = this.active && this.active.id === b.id ? this.active : null;
    e.classList.toggle('xl-on', !!a);
    let h = '';
    if (a) {
      const d = b.sheet;
      a.c = clamp(a.c, 0, d.ncols - 1); a.c2 = clamp(a.c2, 0, d.ncols - 1); a.r = clamp(a.r, 0, d.nrows - 1); a.r2 = clamp(a.r2, 0, d.nrows - 1);
      const s = this.sel();
      const mg = this.mergeAt(e, a.c, a.r);
      const rs = this.rectOf(e, s.c1, s.r1, Math.max(s.c2, mg && s.c1 === s.c2 && s.r1 === s.r2 ? mg.c2 : 0), Math.max(s.r2, mg && s.c1 === s.c2 && s.r1 === s.r2 ? mg.r2 : 0)), rc = mg ? this.rectOf(e, mg.c1, mg.r1, mg.c2, mg.r2) : this.rectOf(e, a.c, a.r);
      if (rs && (s.c1 !== s.c2 || s.r1 !== s.r2)) h += `<div class="xl-selr" style="left:${rs.x}px;top:${rs.y - e._gy}px;width:${rs.w}px;height:${rs.h}px"></div>`;
      if (rc) h += `<div class="xl-cur" style="left:${rc.x}px;top:${rc.y - e._gy}px;width:${rc.w}px;height:${rc.h}px"></div>`;
      // Dropdown-Liste der Zelle (Datenüberprüfung, 1.71): Pfeil rechts neben der aktiven Zelle
      if (rc && !this.edit && this.dvAt(b, a.c, a.r)) h += `<button class="xl-dv" type="button" title="Auswahlliste (Alt+↓)" style="left:${rc.x + rc.w + 1}px;top:${rc.y - e._gy + rc.h - 18}px">${icon('chevDown', 12)}</button>`;
      // Rand der Auswahl: ziehen = verschieben (wie Excel), Strg = kopieren (1.54)
      if (rs && !this.edit && !this.locked(b.id)) {
        const x = rs.x, y = rs.y - e._gy, w = rs.w, hh = rs.h, t = 'Ziehen = verschieben · mit Strg = kopieren · ganze Zeilen/Spalten werden an der neuen Stelle eingefügt';
        h += `<div class="xl-mv" title="${t}" style="left:${x - 3}px;top:${y - 3}px;width:${w + 6}px;height:6px"></div><div class="xl-mv" title="${t}" style="left:${x - 3}px;top:${y + hh - 3}px;width:${w - 6}px;height:6px"></div>` +
          `<div class="xl-mv" title="${t}" style="left:${x - 3}px;top:${y - 3}px;width:6px;height:${hh + 6}px"></div><div class="xl-mv" title="${t}" style="left:${x + w - 3}px;top:${y - 3}px;width:6px;height:${hh - 6}px"></div>`;
      }
      if (rs && !this.edit && !this.locked(b.id)) h += `<div class="xl-fill" title="Ziehen = Ausfüllen (Reihe fortsetzen, Formeln kopieren)" style="left:${rs.x + rs.w - 4}px;top:${rs.y - e._gy + rs.h - 4}px"></div>`;
      if (this.movePrev && this.movePrev.id === b.id) {
        const mp = this.movePrev;
        if (mp.line) {
          const R = e._rows, C = e._cols;
          if (mp.line === 'r') { const yy = mp.at < R.length ? R[mp.at][0] : R[R.length - 1][0] + R[R.length - 1][1]; h += `<div class="xl-mvline" style="left:0;top:${yy - 1.5}px;width:${C[C.length - 1][0] + C[C.length - 1][1]}px;height:3px"></div>`; }
          else { const xx = mp.at < C.length ? C[mp.at][0] : C[C.length - 1][0] + C[C.length - 1][1]; h += `<div class="xl-mvline" style="left:${xx - 1.5}px;top:0;width:3px;height:${R[R.length - 1][0] + R[R.length - 1][1]}px"></div>`; }
        } else { const r = this.rectOf(e, mp.c1, mp.r1, mp.c2, mp.r2); if (r) h += `<div class="xl-mvprev${mp.copy ? ' copy' : ''}" style="left:${r.x}px;top:${r.y - e._gy}px;width:${r.w}px;height:${r.h}px"></div>`; }
      }
      if (this.fillPrev) { const p = this.fillPrev, r = this.rectOf(e, p.c1, p.r1, p.c2, p.r2); if (r) h += `<div class="xl-fillprev" style="left:${r.x}px;top:${r.y - e._gy}px;width:${r.w}px;height:${r.h}px"></div>`; }
      this.heads(b, e, s);
    } else if (typeof OfficeGrid !== 'undefined' && OfficeGrid.endless(b.id)) this.heads(b, e, { c1: -1, c2: -1, r1: -1, r2: -1 });   // Excel: Köpfe immer sichtbar
    if (this.clip && this.clip.id === b.id && !this.clip.done) { const c = this.clip, r = this.rectOf(e, c.c1, c.r1, c.c2, c.r2); if (r) h += `<div class="xl-copy" style="left:${r.x}px;top:${r.y - e._gy}px;width:${r.w}px;height:${r.h}px"></div>`; }
    // farbige Bezüge der Formel, die gerade bearbeitet wird
    if (this.edit && XL.isFormula(this.edit.text)) {
      const refs = XL.refsIn(this.edit.text);
      const from = this.sh(this.edit.id), sid = this.sid(b.id);
      refs.forEach((rf, i) => {
        const target = rf.sheet ? this.book().sheet(rf.sheet, from, rf.page) : from;   // auch [Seite]-Bezüge auf diese Seite
        if (!target || !from || target.id !== sid) return;
        const r = this.rectOf(e, rf.c1, rf.r1, rf.c2 === Infinity ? 999 : rf.c2, rf.r2 === Infinity ? 99999 : rf.r2);
        if (r) h += `<div class="xl-ref" style="--rc:${XL_REF_COLORS[i % XL_REF_COLORS.length]};left:${r.x}px;top:${r.y - e._gy}px;width:${r.w}px;height:${r.h}px"></div>`;
      });
    }
    if (typeof OfficeXT !== 'undefined' && OfficeXT.on(b.id)) h += OfficeXT.overlayHtml(b, e, a);
    ov.innerHTML = h;
  },
  heads(b, e, s) {
    const d = b.sheet, ch = e.querySelector('.xl-colhead'), rh = e.querySelector('.xl-rowhead');
    let hc = '', hr = '';
    const fz = d.freeze || null;   // fixierte Zeilen/Spalten: ihre Köpfe stehen mit (1.71)
    (e._cols || []).forEach(([x, w], c) => { if (!w) return; hc += `<div class="xl-ch${c >= s.c1 && c <= s.c2 ? ' on' : ''}${fz && c < fz.c ? ' fz' : ''}" data-c="${c}" style="left:${x}px;width:${w}px">${XL.colName(c)}<i class="xl-cr" data-c="${c}"></i></div>`; });
    (e._rows || []).forEach(([y, hh], r) => { if (!hh) return; hr += `<div class="xl-rh${r >= s.r1 && r <= s.r2 ? ' on' : ''}${fz && r < fz.r ? ' fz' : ''}" data-r="${r}" style="top:${y}px;height:${hh}px">${r + 1}</div>`; });
    ch.innerHTML = hc; rh.innerHTML = hr;
    ch.style.width = (this.width(d) - 2 * BORDER) + 'px';
  },
  /* nach einer Änderung neu rechnen und zeichnen – wie Excel nur, was davon abhängt: die geänderten Zellen, Formeln, die
   * (auch auf anderen Seiten und über Umwege) davon lesen, und Diagramme, deren Bereich etwas davon zeigt.
   * Ohne gemeldete Zellen (Aufbau geändert): alles neu einlesen. Manuelle Berechnung: nur die Zellen selbst, Rest mit F9. */
  refresh() {
    const p = Canvas.page;
    const dirty = this._dirty;
    this._dirty = null;
    if (!dirty || !p) { this.bump(); Canvas.render(); this.refreshUi(); return; }
    const book = this.book(), list = [];
    for (const [id, o] of dirty) {
      if (o === true) { list.push({ id }); continue; }
      if (o.cells.length) list.push({ id, cells: o.cells });
      for (const g of o.rngs) list.push({ id, rng: g });
    }
    const manual = this.manual();
    const aff = book.changed(list, !manual);
    if (manual) { (this._pending || (this._pending = [])).push(...list); if (this._pending.length > 2000) this._pending = [...new Map(this._pending.map(x => [x.id, { id: x.id }])).values()]; }
    this.ver++;
    const pid = this.curPid();
    const hits = (sid, rg) => {   // Rechteck rg (Diagrammbereich) von einer Änderung betroffen?
      const o = aff.get(sid);
      if (!o) return false;
      if (o === true || !rg) return true;
      return o.some(x => x[0] <= rg.c2 && x[2] >= rg.c1 && x[1] <= rg.r2 && x[3] >= rg.r1);
    };
    for (const b of p.boxes) {
      const e = Canvas.els.get(b.id);
      if (!e) continue;
      if (b.sheet) { if (aff.has(pid + '/' + b.id)) Canvas.updateBox(b, e); }
      else if (b.chart && b.chart.src) { const sb = Chart.srcBox(b); if (sb && hits(pid + '/' + sb.id, XL.parseRange(b.chart.src.range))) Chart.update(b, e); }
    }
    Canvas.layout();   // Grössen, Verbindungen und Statusleiste
    this.refreshUi();
  },

  /* ---------------------------------------------------------- Aktiv / inaktiv */
  activate(id, c = 0, r = 0, extend = false) {
    if (Canvas.editing) Canvas.stopEditing();
    const b = this.box(id);
    if (!b || !b.sheet) return;
    if (this.edit && this.edit.id !== id) this.commit();
    if (this.active && this.active.id === id && extend) { this.active.c2 = c; this.active.r2 = r; }
    else this.active = { id, c, r, c2: c, r2: r };
    if (!(Canvas.sel.size === 1 && Canvas.sel.has(id))) {
      Canvas.sel = new Set([id]); Canvas.selLink = null; Canvas.selImg = null;
      Draw.clearSel(true);
      this._sync = true; Canvas.refreshSel(); this._sync = false;
    }
    this.focusKb();
    this.refreshUi();
  },
  deactivate() {
    if (this.edit) this.commit(false, true);
    const a = this.active;
    this.active = null;
    this.closeAc();
    if (document.activeElement === this.kb) { this.kb.blur(); Canvas.vp.focus({ preventScroll: true }); }
    if (a) { const b = this.box(a.id); if (b) this.overlay(b); }
    if (Ribbon.tab === 'tabelle') Ribbon.show(this.prevTab && this.prevTab !== 'tabelle' ? this.prevTab : 'start');
    this.refreshUi();
  },
  /* Canvas-Auswahl hat sich geändert */
  syncActive() {
    if (this._sync || !this.active) return;
    if (!(Canvas.sel.size === 1 && Canvas.sel.has(this.active.id)) || !this.box(this.active.id)) this.deactivate();
  },
  focusKb() {
    const a = this.active;
    const e = a && Canvas.els.get(a.id);
    if (!e) return;
    if (this.kb.parentElement !== e) e.append(this.kb);
    this.kb.value = ' ';
    if (document.activeElement !== this.kb) this.kb.focus({ preventScroll: true });
    this.kb.select();
  },
  /* Bearbeitungsleiste ein-/ausblenden, ohne dass die Seite springt – gehört zur Seite: aktive Tabelle oder Excel-Seite
     (1.68: auch beim Verlassen der Seite, OfficeView.sync ruft das bei jedem Seitenwechsel) */
  barSync(noShift) {
    if (!this.bar) return;
    const a = this.active && Canvas.box(this.active.id) ? this.active : null;
    const show = !!a || (typeof OfficeGrid !== 'undefined' && !!OfficeGrid.page());
    if (!show && !a) { this.barIn.value = ''; this.nameBox.value = ''; }
    if (this.bar.hidden !== show) return;
    const before = Canvas.vp.getBoundingClientRect().top;
    this.bar.hidden = !show;
    const dy = Canvas.vp.getBoundingClientRect().top - before;
    if (dy && Canvas.page && !noShift) { Canvas.view.y -= dy; Canvas.applyView(); }
  },
  refreshUi() {
    const a = this.active;
    if (a) { const b = this.box(a.id); if (b) this.overlay(b); }
    if (this.bar) {
      this.barSync();
      if (a) {
        const s = this.sel();
        if (document.activeElement !== this.nameBox) this.nameBox.value = s.c1 === s.c2 && s.r1 === s.r2 ? XL.key(a.c, a.r) : XL.rangeText(s.c1, s.r1, s.c2, s.r2);
        if (!this.edit && document.activeElement !== this.barIn) { const d = this.data(a.id); this.barIn.value = d ? this.raw(d, a.c, a.r) : ''; this.autoH(this.barIn); }
        this.barIn.readOnly = this.locked(a.id, a.c, a.r);
      }
    }
    this.status();
    Ribbon.refreshSoon();
  },
  /* Statusleiste: Summe/Mittelwert/Anzahl der Auswahl wie Excel */
  status() {
    const a = this.active, hint = $('#sb-hint');
    if (!a) { if (this._statusOn) { hint.textContent = ''; this._statusOn = false; } return; }
    const s = this.sel();
    const calc = this.pendingCalc() ? 'Berechnen (F9) · ' : '';
    if (s.c1 === s.c2 && s.r1 === s.r2) { hint.textContent = `${calc}${this.data(a.id).name}!${XL.key(a.c, a.r)} · Enter/Tab = weiter · F2 = bearbeiten · = für Formeln`; this._statusOn = true; return; }
    let n = 0, cnt = 0, sum = 0;
    for (let r = s.r1; r <= s.r2; r++) for (let c = s.c1; c <= s.c2; c++) { const v = this.value(a.id, c, r); if (v !== null && v !== '') cnt++; if (typeof v === 'number') { n++; sum += v; } }
    const f = (v) => XL.format(v, {}).t;
    hint.textContent = calc + (n ? `Mittelwert: ${f(sum / n)}   Anzahl: ${cnt}   Summe: ${f(sum)}` : `Anzahl: ${cnt}`);
    this._statusOn = true;
  },

  /* ---------------------------------------------------------- Maus */
  onDown(ev) {
    const t = ev.target;
    const boxEl = t.closest && t.closest('.box.xl');
    if (!boxEl) {
      // Zeigen-Modus: Klick in eine andere Tabelle fügt deren Bezug ein – hier nicht; Klick daneben beendet die Bearbeitung
      return false;
    }
    const id = boxEl.dataset.id, b = this.box(id);
    if (!b || !b.sheet) return false;
    if (ev.altKey || t.closest('.box-bar, .sock, .box-rs')) return false;   // Leiste: verschieben wie jedes Feld (Doppelklick auf den Namen: Canvas.onDbl)
    if (t.closest('.xl-afb') && ev.button === 0 && typeof OfficeXT !== 'undefined' && b.sheet.af) { ev.preventDefault(); OfficeXT.filterMenu(id, +t.closest('.xl-afb').dataset.c, t.closest('.xl-afb')); return true; }   // Filter (1.72)
    if (t.closest('.xl-dv') && ev.button === 0) { ev.preventDefault(); this.dvMenu(t.closest('.xl-dv')); return true; }   // Auswahlliste (1.71)
    const add = t.closest('.xl-add');
    if (add && ev.button === 0) { ev.preventDefault(); if (!this.locked(id)) { if (add.classList.contains('xl-add-c')) this.insertCols(b.sheet.ncols, 1, id); else this.insertRows(b.sheet.nrows, 1, id); } return true; }
    const base = { sx: ev.clientX, sy: ev.clientY, moved: false, pid: ev.pointerId, type: 'sheet', id };
    // Spaltenkopf / Spaltenbreite
    const cr = t.closest('.xl-cr');
    if (cr && ev.button === 0) {
      ev.preventDefault();
      const c = +cr.dataset.c;
      // Doppelklick selbst erkennen (pointerdown.detail ist in Chrome immer 0)
      const now = Date.now();
      if (this._lastCr && this._lastCr.c === c && this._lastCr.id === id && now - this._lastCr.t < 450) { this._lastCr = null; this.autofit(id, c); return true; }
      this._lastCr = { c, id, t: now };
      if (this.locked(id)) return true;
      Canvas.drag = { ...base, mode: 'colw', c, w0: b.sheet.cols[c] };
      Canvas.capture(ev);
      return true;
    }
    const chd = t.closest('.xl-ch'), rhd = t.closest('.xl-rh');
    if ((chd || rhd || t.closest('.xl-corner')) && (ev.button === 0 || ev.button === 2)) {
      ev.preventDefault();
      // Formel schreiben: Klick auf einen Spalten-/Zeilenkopf fügt „B:B“ bzw. „3:3“ ein (wie Excel), ziehen = mehrere
      if (this.edit && ev.button === 0 && this.pointable() && (chd || rhd)) {
        const k = chd ? 'c' : 'r', i = chd ? +chd.dataset.c : +rhd.dataset.r;
        this.pointWhole(id, k, i, i);
        Canvas.drag = { ...base, mode: 'pointw', k, i0: i };
        Canvas.capture(ev);
        return true;
      }
      const d = b.sheet;
      if (t.closest('.xl-corner')) { this.activate(id, 0, 0); this.active.c2 = d.ncols - 1; this.active.r2 = d.nrows - 1; this.refreshUi(); return true; }
      if (chd) {
        const c = +chd.dataset.c;
        if (ev.button === 2 && this.active && this.active.id === id && this.isColSel() && c >= this.sel().c1 && c <= this.sel().c2) { this.contextMenu(ev, 'col'); return true; }
        // schon markierte Spalten am Kopf ziehen = verschieben (1.54)
        if (ev.button === 0 && !ev.shiftKey && this.active && this.active.id === id && this.isColSel() && c >= this.sel().c1 && c <= this.sel().c2 && !this.locked(id) && !this.edit) {
          Canvas.drag = { ...base, mode: 'move', src: this.sel(), k: 'c', off: c - this.sel().c1 }; Canvas.capture(ev); return true;
        }
        if (ev.shiftKey && this.active && this.active.id === id) { this.active.c2 = c; this.active.r = 0; this.active.r2 = d.nrows - 1; }
        else { this.activate(id, c, 0); this.active.r2 = d.nrows - 1; }
        this.refreshUi();
        if (ev.button === 2) { this.contextMenu(ev, 'col'); return true; }
        Canvas.drag = { ...base, mode: 'cols' }; Canvas.capture(ev);
      } else {
        const r = +rhd.dataset.r;
        if (ev.button === 2 && this.active && this.active.id === id && this.isRowSel() && r >= this.sel().r1 && r <= this.sel().r2) { this.contextMenu(ev, 'row'); return true; }
        // schon markierte Zeilen am Kopf ziehen = verschieben (1.54)
        if (ev.button === 0 && !ev.shiftKey && this.active && this.active.id === id && this.isRowSel() && r >= this.sel().r1 && r <= this.sel().r2 && !this.locked(id) && !this.edit) {
          Canvas.drag = { ...base, mode: 'move', src: this.sel(), k: 'r', off: r - this.sel().r1 }; Canvas.capture(ev); return true;
        }
        if (ev.shiftKey && this.active && this.active.id === id) { this.active.r2 = r; this.active.c = 0; this.active.c2 = d.ncols - 1; }
        else { this.activate(id, 0, r); this.active.c2 = d.ncols - 1; }
        this.refreshUi();
        if (ev.button === 2) { this.contextMenu(ev, 'row'); return true; }
        Canvas.drag = { ...base, mode: 'rows' }; Canvas.capture(ev);
      }
      return true;
    }
    if (t.closest('.xl-mv') && ev.button === 0 && this.active && this.active.id === id) {
      ev.preventDefault();
      const s0 = this.sel(), hit0 = this.cellAt(id, ev.clientX, ev.clientY) || { c: s0.c1, r: s0.r1 };
      const k = this.isRowSel() && !this.isColSel() ? 'r' : this.isColSel() && !this.isRowSel() ? 'c' : '';
      Canvas.drag = { ...base, mode: 'move', src: s0, k, offc: clamp(hit0.c, s0.c1, s0.c2) - s0.c1, offr: clamp(hit0.r, s0.r1, s0.r2) - s0.r1 };
      Canvas.capture(ev);
      return true;
    }
    if (t.closest('.xl-fill') && ev.button === 0) {
      ev.preventDefault();
      Canvas.drag = { ...base, mode: 'fill', src: this.sel() };
      Canvas.capture(ev);
      return true;
    }
    if (!t.closest('.xl-wrap')) return false;
    if (ev.button === 1) return false;
    const hit = this.cellAt(id, ev.clientX, ev.clientY);
    if (!hit) return false;
    ev.preventDefault();
    // Formel bearbeiten: Klick auf eine Zelle fügt ihren Bezug ein (Zeigen-Modus wie Excel)
    if (this.edit && ev.button === 0 && this.pointable()) {
      this.pointAt(id, hit.c, hit.r, hit.c, hit.r);
      Canvas.drag = { ...base, mode: 'point', c0: hit.c, r0: hit.r };
      Canvas.capture(ev);
      return true;
    }
    if (ev.button === 2) {
      const s = this.active && this.active.id === id ? this.sel() : null;
      if (!s || hit.c < s.c1 || hit.c > s.c2 || hit.r < s.r1 || hit.r > s.r2) this.activate(id, hit.c, hit.r);
      else this.focusKb();
      this.contextMenu(ev, 'cell');
      return true;
    }
    if (this.edit) { if (!this.commit()) return true; }
    const dbl = this._lastDown && Date.now() - this._lastDown.t < 450 && this._lastDown.id === id && this._lastDown.c === hit.c && this._lastDown.r === hit.r;
    this._lastDown = { t: Date.now(), id, c: hit.c, r: hit.r };
    this.activate(id, hit.c, hit.r, ev.shiftKey && this.active && this.active.id === id);
    if (dbl && !ev.shiftKey) { this._lastDown = null; this.startEdit('edit'); return true; }
    Canvas.drag = { ...base, mode: 'sel' };
    Canvas.capture(ev);
    return true;
  },
  onDragMove(ev, d) {
    const b = this.box(d.id);
    if (!b) return;
    if (!d.moved) { if (Math.hypot(ev.clientX - d.sx, ev.clientY - d.sy) < 3) return; d.moved = true; }
    if (d.mode === 'colw') {
      const dx = (ev.clientX - d.sx) / Canvas.view.z;
      b.sheet.cols[d.c] = Math.max(16, Math.round(d.w0 + dx));
      const e = Canvas.els.get(b.id);
      this.update(b, e, true);
      Canvas.layout();
      return;
    }
    const hit = this.cellAt(d.id, ev.clientX, ev.clientY);
    if (!hit) return;
    const a = this.active;
    if (d.mode === 'sel') { if (a && (a.c2 !== hit.c || a.r2 !== hit.r)) { a.c2 = hit.c; a.r2 = hit.r; this.refreshUi(); } }
    else if (d.mode === 'cols') { a.c2 = hit.c; this.refreshUi(); }
    else if (d.mode === 'rows') { a.r2 = hit.r; this.refreshUi(); }
    else if (d.mode === 'point') this.pointAt(d.id, d.c0, d.r0, hit.c, hit.r);
    else if (d.mode === 'pointw') this.pointWhole(d.id, d.k, d.i0, d.k === 'c' ? hit.c : hit.r);
    else if (d.mode === 'move') {
      // Vorschau: ganze Zeilen/Spalten → Einfügelinie; sonst gestrichelter Zielbereich (Strg = kopieren)
      const s = d.src, e = Canvas.els.get(d.id);
      if (d.k === 'r') {
        const R = e._rows, mid = (i) => R[i][0] + R[i][1] / 2;
        let at = 0; while (at < R.length && hit.ly > mid(at)) at++;
        if (at >= s.r1 && at <= s.r2 + 1) at = null;
        d.target = at; this.movePrev = at == null ? null : { id: d.id, line: 'r', at };
      } else if (d.k === 'c') {
        const C = e._cols, mid = (i) => C[i][0] + C[i][1] / 2;
        let at = 0; while (at < C.length && hit.lx > mid(at)) at++;
        if (at >= s.c1 && at <= s.c2 + 1) at = null;
        d.target = at; this.movePrev = at == null ? null : { id: d.id, line: 'c', at };
      } else {
        const c1 = Math.max(0, hit.c - d.offc), r1 = Math.max(0, hit.r - d.offr);
        d.target = c1 === s.c1 && r1 === s.r1 && !(ev.ctrlKey || ev.metaKey) ? null : { c: c1, r: r1 };
        d.copy = ev.ctrlKey || ev.metaKey;
        this.movePrev = { id: d.id, c1, r1, c2: c1 + s.c2 - s.c1, r2: r1 + s.r2 - s.r1, copy: d.copy };
      }
      const p = this.movePrev;
      $('#sb-hint').textContent = !p ? 'Verschieben: Ziel wählen' : p.line ? `${p.line === 'r' ? 'Zeilen' : 'Spalten'} einfügen vor ${p.line === 'r' ? p.at + 1 : XL.colName(p.at)}` : `${d.copy ? 'Kopieren' : 'Verschieben'} nach ${XL.rangeText(p.c1, p.r1, p.c2, p.r2)}`;
      this.overlay(b);
    }
    else if (d.mode === 'fill') {
      const s = d.src;
      const dn = hit.r - s.r2, up = s.r1 - hit.r, rt = hit.c - s.c2, lf = s.c1 - hit.c;
      const m = Math.max(dn, up, rt, lf);
      let p = null;
      if (m > 0) {
        if (m === dn) p = { c1: s.c1, r1: s.r2 + 1, c2: s.c2, r2: hit.r, dir: 'd' };
        else if (m === up) p = { c1: s.c1, r1: hit.r, c2: s.c2, r2: s.r1 - 1, dir: 'u' };
        else if (m === rt) p = { c1: s.c2 + 1, r1: s.r1, c2: hit.c, r2: s.r2, dir: 'r' };
        else p = { c1: hit.c, r1: s.r1, c2: s.c1 - 1, r2: s.r2, dir: 'l' };
      }
      // über den Rand hinaus: Tabelle wächst beim Loslassen
      if (p && hit.out) {
        const e = Canvas.els.get(d.id);
        const R = e._rows, C = e._cols;
        const lastH = R[R.length - 1][1] || 24, lastW = C[C.length - 1][1] || 96;
        if (p.dir === 'd' && hit.ly > R[R.length - 1][0] + R[R.length - 1][1]) p.r2 = R.length - 1 + Math.ceil((hit.ly - R[R.length - 1][0] - R[R.length - 1][1]) / lastH);
        if (p.dir === 'r' && hit.lx > C[C.length - 1][0] + C[C.length - 1][1]) p.c2 = C.length - 1 + Math.ceil((hit.lx - C[C.length - 1][0] - C[C.length - 1][1]) / lastW);
      }
      d.target = p;
      this.fillPrev = p ? { ...p, r2: Math.min(p.r2, b.sheet.nrows - 1), c2: Math.min(p.c2, b.sheet.ncols - 1) } : null;
      const extra = p ? Math.max(0, p.r2 - (b.sheet.nrows - 1)) + Math.max(0, p.c2 - (b.sheet.ncols - 1)) : 0;
      $('#sb-hint').textContent = p ? `Ausfüllen: ${XL.rangeText(p.c1, p.r1, p.c2, p.r2)}${extra ? ' (Tabelle wird erweitert)' : ''}` : '';
      this.overlay(b);
    }
  },
  onDragUp(ev, d) {
    const b = this.box(d.id);
    if (!b) return;
    if (d.mode === 'colw') { if (d.moved) { this.bump(); Canvas.render(); Hist.touchPage(Canvas.pageId); Hist.commit('Spaltenbreite'); } return; }
    if (d.mode === 'fill') {
      this.fillPrev = null;
      if (d.target) this.fill(d.id, d.src, d.target);
      else this.overlay(b);
      return;
    }
    if (d.mode === 'point' || d.mode === 'pointw') { const ed = this.edit; if (ed) this.focusEditor(); return; }
    if (d.mode === 'move') {
      this.movePrev = null;
      if (d.moved && d.target != null) {
        const s = d.src;
        if (d.k === 'r') this.moveRows(d.id, s.r1, s.r2, d.target);
        else if (d.k === 'c') this.moveCols(d.id, s.c1, s.c2, d.target);
        else this.moveBlock(d.id, s, d.target.c - s.c1, d.target.r - s.r1, d.copy);
      } else this.overlay(b);
      this.focusKb();
      return;
    }
    this.focusKb();
  },
  isColSel() { const s = this.sel(), d = this.active && this.data(this.active.id); return !!d && s.r1 === 0 && s.r2 === d.nrows - 1; },
  isRowSel() { const s = this.sel(), d = this.active && this.data(this.active.id); return !!d && s.c1 === 0 && s.c2 === d.ncols - 1; },

  /* ---------------------------------------------------------- Tastatur (Zelle ausgewählt) */
  onKey(e) {
    const a = this.active;
    if (!a || this.edit) return;
    const ctrl = e.ctrlKey || e.metaKey, k = e.key;
    const done = () => { e.preventDefault(); e.stopPropagation(); };
    if (typeof OfficeXT !== 'undefined' && OfficeXT.key(e)) { done(); return; }   // Excel-Tasten (1.72): Strg+1, Strg+9/0, Umsch+F2 …
    const ro = this.locked(a.id, a.c, a.r);
    if (k === 'ArrowDown' && e.altKey && !e.shiftKey && !ctrl && this.dvAt(this.box(a.id), a.c, a.r)) { done(); this.dvMenu(null); return; }   // Auswahlliste (1.71)
    if (k.startsWith('Arrow') && e.altKey && e.shiftKey && !ro) {   // Zeilen/Spalten verschieben (1.54)
      done();
      if (k === 'ArrowUp' || k === 'ArrowDown') { if (!this.isRowSel()) { a.c = 0; a.c2 = this.data(a.id).ncols - 1; } this.nudge(k === 'ArrowUp' ? 'up' : 'down'); }
      else { if (!this.isColSel()) { a.r = 0; a.r2 = this.data(a.id).nrows - 1; } this.nudge(k === 'ArrowLeft' ? 'left' : 'right'); }
      return;
    }
    if (k.startsWith('Arrow')) { done(); const dc = k === 'ArrowLeft' ? -1 : k === 'ArrowRight' ? 1 : 0, dr = k === 'ArrowUp' ? -1 : k === 'ArrowDown' ? 1 : 0; this.move(dc, dr, e.shiftKey, ctrl); return; }
    if (k === 'Tab') { done(); this.move(e.shiftKey ? -1 : 1, 0, false, false, true); return; }
    if (k === 'Enter') { done(); if (ctrl && !ro) { this.startEdit('edit'); return; } this.move(0, e.shiftKey ? -1 : 1, false, false, true); return; }
    if (k === 'Home') { done(); if (ctrl) { a.c = a.r = 0; } else a.c = 0; if (!e.shiftKey) { a.c2 = a.c; a.r2 = a.r; } this.afterMove(); return; }
    if (k === 'End' && ctrl) { done(); const u = this.usedRange(a.id); a.c = u.c2; a.r = u.r2; if (!e.shiftKey) { a.c2 = a.c; a.r2 = a.r; } this.afterMove(); return; }
    if (k === 'PageDown' || k === 'PageUp') { done(); this.move(0, k === 'PageDown' ? 10 : -10, e.shiftKey); return; }
    if (k === 'F2') { done(); if (!ro) this.startEdit('edit'); return; }
    if (k === 'Escape') {
      done();
      if (this.clip && !this.clip.done) { this.clip = null; this.refreshUi(); return; }
      const id = a.id; this.deactivate(); Canvas.select([id]); Canvas.vp.focus({ preventScroll: true });
      return;
    }
    if (k === 'Delete') { done(); if (!ro) this.clear('v'); return; }
    if (k === 'Backspace') { done(); if (!ro) this.startEdit('enter', ''); return; }
    if (ctrl && !e.altKey) {
      const kl = k.toLowerCase();
      if (kl === 'z' && !e.shiftKey) { done(); Cmd.run('undo'); return; }
      if (kl === 'y' || (kl === 'z' && e.shiftKey)) { done(); Cmd.run('redo'); return; }
      if (kl === 'c' || kl === 'x' || kl === 'v') { e.stopPropagation(); this.kb.value = ' '; this.kb.select(); return; }   // native Ereignisse copy/cut/paste
      if (kl === 'a') { done(); const d = this.data(a.id); a.c = 0; a.r = 0; a.c2 = d.ncols - 1; a.r2 = d.nrows - 1; this.refreshUi(); return; }
      if (ro) return;
      if (kl === 'b' || kl === 'i' || kl === 'u') { done(); this.toggle(kl); return; }
      if (kl === 'd') { done(); this.fillDir('d'); return; }
      if (kl === 'r') { done(); this.fillDir('r'); return; }
      if (k === '.' || e.code === 'Period') { done(); const n = new Date(); this.startEdit('enter', e.shiftKey ? `${String(n.getHours()).padStart(2, '0')}:${String(n.getMinutes()).padStart(2, '0')}` : n.toLocaleDateString('de-CH', { day: '2-digit', month: '2-digit', year: 'numeric' })); return; }
      if (k === 'Enter') return;
      return;
    }
    if (e.altKey && !ctrl && (k === '=' || (e.shiftKey && e.code === 'Digit0'))) { done(); if (!ro) this.autoSum('SUMME'); return; }
    const printable = k.length === 1 && ((!ctrl && !e.altKey) || (ctrl && e.altKey));
    if (printable) { done(); if (!ro) this.startEdit('enter', k); return; }
  },
  move(dc, dr, extend, jump, wrapSel) {
    const a = this.active, d = this.data(a.id);
    if (!d) return;
    let c = extend ? a.c2 : a.c, r = extend ? a.r2 : a.r;
    // Tab … Tab, dann Enter: zurück in die Spalte, in der man angefangen hat (wie Excel)
    if (wrapSel && dc && !dr) { if (this.tabStart == null || this.tabStart.r !== r) this.tabStart = { c, r }; }
    else if (wrapSel && dr > 0 && !dc && this.tabStart && this.tabStart.r === r) { c = this.tabStart.c; this.tabStart = null; }
    else this.tabStart = null;
    if (jump) {
      const filled = (cc, rr) => this.raw(d, cc, rr) !== '';
      const lim = (cc, rr) => cc >= 0 && rr >= 0 && cc < d.ncols && rr < d.nrows;
      if (lim(c + dc, r + dr) && filled(c, r) && filled(c + dc, r + dr)) { while (lim(c + dc, r + dr) && filled(c + dc, r + dr)) { c += dc; r += dr; } }
      else { c += dc; r += dr; while (lim(c, r) && !filled(c, r) && lim(c + dc, r + dr)) { c += dc; r += dr; } }
    } else {
      c += dc; r += dr;
      // ausgeblendete Zeilen/Spalten (auch vom Filter) überspringen (1.72)
      if (d.hideR || d.hideF || d.hideC) { const hr = new Set([...(d.hideR || []), ...(d.hideF || [])]), hc = new Set(d.hideC || []); while (dr && hr.has(r) && r > 0 && r < d.nrows - 1) r += dr; while (dc && hc.has(c) && c > 0 && c < d.ncols - 1) c += dc; }
    }
    // Tabelle wächst beim Weitergehen mit Tab/Enter über den Rand (wie OneNote)
    if (wrapSel && !this.locked(a.id)) {
      if (dc > 0 && c >= d.ncols) { c = 0; r += 1; this.tabStart = null; }
      if (r >= d.nrows && dr >= 0 && (dc > 0 || dr > 0) && this.rowFilled(d, d.nrows - 1)) { this.insertRows(d.nrows, 1, a.id, true); }
    }
    // Excel-Seite: das Raster ist „unendlich“ – weitergehen über den Rand lässt es wachsen (1.67)
    if (typeof OfficeGrid !== 'undefined' && OfficeGrid.endless(a.id) && !Store.readOnly) { if (r >= d.nrows) OfficeGrid.grow(a.id, r - d.nrows + 30, 0); if (c >= d.ncols) OfficeGrid.grow(a.id, 0, c - d.ncols + 4); }
    c = clamp(c, 0, d.ncols - 1); r = clamp(r, 0, d.nrows - 1);
    if (extend) { a.c2 = c; a.r2 = r; } else { a.c = a.c2 = c; a.r = a.r2 = r; }
    this.afterMove();
  },
  rowFilled(d, r) { for (let c = 0; c < d.ncols; c++) if (this.raw(d, c, r) !== '') return true; return false; },
  afterMove() { this.refreshUi(); this.reveal(); },
  /* aktive Zelle sichtbar machen (Ansicht verschieben) */
  reveal() {
    const a = this.active, b = a && this.box(a.id), e = a && Canvas.els.get(a.id);
    if (!e) return;
    const r = this.rectOf(e, a.c2, a.r2);
    if (!r) return;
    const z = Canvas.view.z, W = Canvas.vp.clientWidth, H = Canvas.vp.clientHeight;
    const sx = (b.x + BORDER + r.x) * z + Canvas.view.x, sy = (b.y + BORDER + r.y) * z + Canvas.view.y;
    // Excel-Seite: Platz für die stehenden Köpfe, fixierte Bereiche und das Blattregister unten
    const xg = typeof OfficeGrid !== 'undefined' && OfficeGrid.endless(a.id), d = b.sheet, fz = xg && d.freeze;
    const ML = xg ? (36 + (fz && fz.c ? (e._cols[Math.min(fz.c, e._cols.length) - 1] || [0, 0]).reduce((p, q) => p + q, 0) : 0)) * z + 4 : 20;
    const MT = xg ? (20 + (fz && fz.r ? (e._rows[Math.min(fz.r, e._rows.length) - 1] || [0, 0]).reduce((p, q) => p + q, 0) : 0)) * z + 4 : 24;
    const MB = xg ? 40 : 24;
    let moved = false;
    if (!(fz && a.c2 < fz.c)) { if (sx < ML) { Canvas.view.x += ML - sx; moved = true; } else if (sx + r.w * z > W - 24) { Canvas.view.x -= sx + r.w * z - (W - 24); moved = true; } }
    if (!(fz && a.r2 < fz.r)) { if (sy < MT) { Canvas.view.y += MT - sy; moved = true; } else if (sy + r.h * z > H - MB) { Canvas.view.y -= sy + r.h * z - (H - MB); moved = true; } }
    if (moved) Canvas.applyView();
  },
  goTo(txt) {
    const a = this.active;
    if (!a) return;
    const s = String(txt).trim();
    // [Seite]Tabelle!A1 (1.26): zur Zelle auf der anderen Seite springen
    const ref = /^'?\[/.test(s) ? XL.refsIn('=' + s)[0] : null;
    if (ref && ref.page) {
      this.book();
      const pid = this.resolvePage(this.curPid(), ref.page, ref.sheet);
      const pg = pid && Store.pages[pid], b = pg && pg.boxes.find(x => x.sheet && x.sheet.name.toLowerCase() === String(ref.sheet).toLowerCase());
      if (!b) { UI.toast('Seite oder Tabelle nicht gefunden'); return; }
      this.deactivate();
      if (pid !== Canvas.pageId) App.openPage(pid);
      setTimeout(() => {
        if (!Canvas.box(b.id)) return;
        Canvas.scrollToBox(b.id);
        this.activate(b.id, Math.min(ref.c1, b.sheet.ncols - 1), Math.min(ref.r1, b.sheet.nrows - 1));
        this.active.c2 = Math.min(ref.c2, b.sheet.ncols - 1); this.active.r2 = Math.min(ref.r2, b.sheet.nrows - 1);
        this.afterMove();
      }, 30);
      return;
    }
    const m = /^(?:(.+)!)?(.+)$/.exec(s);
    let id = a.id;
    if (m && m[1]) { const nm = m[1].replace(/^'|'$/g, ''); const b = Canvas.page.boxes.find(x => x.sheet && x.sheet.name.toLowerCase() === nm.toLowerCase()); if (b) id = b.id; }
    const rg = XL.parseRange(m ? m[2] : s);
    if (!rg) { UI.toast('Ungültiger Bezug – z.B. B5 oder A1:C4'); return; }
    const d = this.data(id);
    if (rg.c2 >= d.ncols || rg.r2 >= d.nrows) { if (this.locked(id)) { UI.toast('Ausserhalb der Tabelle'); return; } d.ncols = Math.max(d.ncols, rg.c2 + 1); d.nrows = Math.max(d.nrows, rg.r2 + 1); XL.normSheet(d); this.refresh(); Hist.touchPage(Canvas.pageId); Hist.commit('Tabelle erweitert'); }
    this.activate(id, rg.c1, rg.r1);
    this.active.c2 = rg.c2; this.active.r2 = rg.r2;
    this.afterMove();
  },
  usedRange(id) {
    const d = this.data(id);
    let c2 = 0, r2 = 0;
    for (const [k, x] of Object.entries(d.cells)) if (x.v !== '') { const p = XL.parseKey(k); c2 = Math.max(c2, p.c); r2 = Math.max(r2, p.r); }
    return { c1: 0, r1: 0, c2, r2 };
  },

  /* ---------------------------------------------------------- Bearbeiten */
  startEdit(mode, initial, inBar) {
    const a = this.active;
    if (a && typeof OfficeXT !== 'undefined' && OfficeXT.protLocked(a.id, a.c, a.r) && !Store.readOnly) UI.toast('Die Zelle ist geschützt – Überprüfen → Blattschutz aufheben', 3000);
    if (!a || this.locked(a.id, a.c, a.r)) return;
    const b = this.box(a.id), e = Canvas.els.get(a.id), d = b.sheet;
    if (this.edit) this.commit();
    const orig = this.raw(d, a.c, a.r);
    // Text-Format: Eingabe so lassen
    const text = initial !== undefined ? initial : orig;
    this.edit = { id: a.id, c: a.c, r: a.r, text, orig, mode, point: null, inBar: !!inBar };
    const r = this.rectOf(e, a.c, a.r);
    const f = this.cellF(d, a.c, a.r);
    const ta = el('textarea', { class: 'xl-ed ui-only', spellcheck: 'false', rows: 1 });
    ta.value = text;
    Object.assign(ta.style, { left: r.x + 'px', top: r.y + 'px', minWidth: r.w + 'px', minHeight: r.h + 'px', fontWeight: f.b || (d.head && a.r === 0) ? '700' : '', fontStyle: f.i ? 'italic' : '', fontSize: f.fs ? f.fs + 'pt' : '', textAlign: f.al === 'c' ? 'center' : f.al === 'r' ? 'right' : '', color: f.c || f.bg ? (/color:([^;]+);/.exec(this.cellStyle(f, false)) || [])[1] || '' : '', background: f.bg || '' });
    ta.addEventListener('input', () => { if (!this.edit) return; this.edit.text = ta.value; this.edit.point = null; this.syncEditor('cell'); });
    ta.addEventListener('keydown', ev => this.onEditKey(ev, ta));
    ta.addEventListener('keyup', () => this.edit && this.afterCaret(ta));
    ta.addEventListener('mousedown', () => { if (this.edit) this.edit.mode = 'edit'; });
    ta.addEventListener('click', () => this.edit && this.afterCaret(ta));
    ta.addEventListener('blur', () => setTimeout(() => this.onEditBlur(), 0));
    e.append(ta);
    this.ed = ta;
    this.autoSize();
    if (!inBar) { ta.focus({ preventScroll: true }); ta.setSelectionRange(text.length, text.length); }
    if (this.bar) { this.barIn.value = text; this.autoH(this.barIn); }
    this.overlay(b, e);
    this.afterCaret(inBar ? this.barIn : ta);
  },
  focusEditor() {
    const ed = this.edit;
    if (!ed) return;
    const t = ed.inBar ? this.barIn : this.ed;
    if (t && document.activeElement !== t) { t.focus({ preventScroll: true }); }
    if (t && ed.caret != null) t.setSelectionRange(ed.caret, ed.caret);
  },
  onEditBlur() {
    const ed = this.edit;
    if (!ed) return;
    const ae = document.activeElement;
    if (ae === this.ed || ae === this.barIn || (ae && ae.closest && ae.closest('.xl-acpop, .dlg-back, #ribbon, .popup, #xl-bar'))) return;
    if (Canvas.drag && Canvas.drag.type === 'sheet') return;
    this.commit(false, true);
  },
  syncEditor(from) {
    const ed = this.edit;
    if (from !== 'cell' && this.ed) { this.ed.value = ed.text; }
    if (from !== 'bar' && this.bar) { this.barIn.value = ed.text; this.autoH(this.barIn); }
    this.autoSize();
    const b = this.box(ed.id);
    if (b) for (const x of Canvas.page.boxes) if (x.sheet) this.overlay(x);
    this.afterCaret(from === 'bar' ? this.barIn : this.ed);
  },
  autoSize() {
    const ta = this.ed;
    if (!ta) return;
    ta.style.width = '0px'; ta.style.height = '0px';
    ta.style.width = Math.min(600, ta.scrollWidth + 4) + 'px';
    ta.style.height = ta.scrollHeight + 'px';
  },
  autoH(t) { t.style.height = '0px'; t.style.height = Math.min(120, Math.max(24, t.scrollHeight)) + 'px'; },
  /* Zeigen-Modus möglich? (Formel und Cursor nach einem Operator, oder gerade gezeigt) */
  pointable() {
    const ed = this.edit;
    if (!ed || !(XL.isFormula(ed.text) || ed.text === '=')) return false;   // auch gleich nach dem „=“ (1.54)
    if (ed.point) return true;
    if (ed.text === '=') return true;
    const t = ed.inBar ? this.barIn : this.ed;
    const caret = t ? t.selectionStart : ed.text.length;
    return XL.wantsRef(ed.text, caret);
  },
  /* Bezug an der Schreibmarke einfügen bzw. den zuletzt gezeigten ersetzen */
  pointAt(id, c1, r1, c2, r2, refText) {
    const ed = this.edit;
    if (!ed) return;
    const t = ed.inBar ? this.barIn : this.ed;
    let ref = refText || XL.rangeText(Math.min(c1, c2), Math.min(r1, r2), Math.max(c1, c2), Math.max(r1, r2));
    if (id !== ed.id) ref = XL.sheetPrefix(this.data(id).name) + ref;
    let p, e2;
    if (ed.point) { p = ed.point.p; e2 = ed.point.e; }
    else { p = e2 = t ? t.selectionStart : ed.text.length; }
    ed.text = ed.text.slice(0, p) + ref + ed.text.slice(e2);
    ed.point = { p, e: p + ref.length };
    ed.caret = p + ref.length;
    if (this.ed) this.ed.value = ed.text;
    if (this.bar) this.barIn.value = ed.text;
    this.autoSize();
    for (const x of Canvas.page.boxes) if (x.sheet) this.overlay(x);
    if (this.ac) this.closeAc();   // Hinweisfenster zu – die Formel hat jetzt einen Bezug
    setTimeout(() => this.focusEditor(), 0);
  },
  /* ganze Spalten (k = 'c') bzw. Zeilen (k = 'r') als Bezug: B:D, 3:5 (1.54) */
  pointWhole(id, k, i1, i2) {
    const a = Math.min(i1, i2), z = Math.max(i1, i2);
    const ref = k === 'c' ? XL.colName(a) + ':' + XL.colName(z) : (a + 1) + ':' + (z + 1);
    this.pointAt(id, 0, 0, 0, 0, ref);
  },
  onEditKey(e, ta) {
    const ed = this.edit;
    if (!ed) return;
    const k = e.key, ctrl = e.ctrlKey || e.metaKey;
    const done = () => { e.preventDefault(); e.stopPropagation(); };
    e.stopPropagation();
    // Autovervollständigen
    if (this.ac) {
      if ((k === 'ArrowDown' || k === 'ArrowUp') && this.ac.sel && this.ac.items.length) { done(); this.ac.i = (this.ac.i + (k === 'ArrowDown' ? 1 : -1) + this.ac.items.length) % this.ac.items.length; this.drawAc(); return; }
      if ((k === 'Tab' && !e.shiftKey && this.ac.sel) || (k === 'Enter' && this.ac.sel)) { done(); this.acceptAc(ta); return; }
      if (k === 'ArrowRight' && this.ac.sel && ta.selectionStart === ta.value.length && this._ghost && !this._ghost.hidden) { done(); this.acceptAc(ta); return; }
      if (k === 'Escape') { done(); this.closeAc(); return; }
    }
    if (k === 'Enter' && e.altKey) { done(); const p = ta.selectionStart; ed.text = ed.text.slice(0, p) + '\n' + ed.text.slice(ta.selectionEnd); ta.value = ed.text; ta.setSelectionRange(p + 1, p + 1); this.syncEditor(ta === this.barIn ? 'bar' : 'cell'); return; }
    if (k === 'Enter') { done(); if (ctrl) { this.commitAll(); return; } if (this.commit()) this.move(0, e.shiftKey ? -1 : 1, false, false, true); return; }
    if (k === 'Tab') { done(); if (this.commit()) this.move(e.shiftKey ? -1 : 1, 0, false, false, true); return; }
    if (k === 'Escape') { done(); this.cancel(); return; }
    if (k === 'F2') { done(); ed.mode = ed.mode === 'edit' ? 'enter' : 'edit'; $('#sb-hint').textContent = ed.mode === 'edit' ? 'Bearbeiten: Pfeiltasten bewegen die Schreibmarke' : 'Eingeben: Pfeiltasten wechseln die Zelle'; return; }
    if (k === 'F4') {
      done();
      const r = XL.toggleAbs(ed.text, ta.selectionStart);
      if (r) { ed.text = r.raw; ta.value = r.raw; ta.setSelectionRange(r.caret, r.caret); ed.point = null; this.syncEditor(ta === this.barIn ? 'bar' : 'cell'); }
      return;
    }
    if (k.startsWith('Arrow') && ed.mode === 'enter' && ta !== this.barIn) {
      // Formel: Pfeile zeigen auf Zellen (wie Excel); sonst Eingabe übernehmen und weiter
      if (this.pointable()) {
        done();
        const dc = k === 'ArrowLeft' ? -1 : k === 'ArrowRight' ? 1 : 0, dr = k === 'ArrowUp' ? -1 : k === 'ArrowDown' ? 1 : 0;
        const d = this.data(ed.id);
        const pc = ed.pc || { c: ed.c, r: ed.r, c2: ed.c, r2: ed.r };
        if (!ed.point) { pc.c = pc.c2 = ed.c; pc.r = pc.r2 = ed.r; }
        if (e.shiftKey) { pc.c2 = clamp(pc.c2 + dc, 0, d.ncols - 1); pc.r2 = clamp(pc.r2 + dr, 0, d.nrows - 1); }
        else { pc.c = pc.c2 = clamp(pc.c + dc, 0, d.ncols - 1); pc.r = pc.r2 = clamp(pc.r + dr, 0, d.nrows - 1); }
        ed.pc = pc;
        this.pointAt(ed.id, pc.c, pc.r, pc.c2, pc.r2);
        return;
      }
      if (!XL.isFormula(ed.text) || k === 'ArrowUp' || k === 'ArrowDown') {
        done();
        if (this.commit()) this.move(k === 'ArrowLeft' ? -1 : k === 'ArrowRight' ? 1 : 0, k === 'ArrowUp' ? -1 : k === 'ArrowDown' ? 1 : 0);
        return;
      }
    }
    if (ctrl && (k === 'z' || k === 'y')) return;   // Rückgängig im Eingabefeld selbst
  },
  afterCaret(ta) {
    const ed = this.edit;
    if (!ed || !ta) return;
    ed.caret = ta.selectionStart;
    if (ed.point && (ed.caret < ed.point.p || ed.caret > ed.point.e)) ed.point = null;
    this.updateAc(ta);
  },
  /* Eingabe übernehmen; false = Formel fehlerhaft (Bearbeitung bleibt offen) */
  commit(move, quiet) {
    const ed = this.edit;
    if (!ed) return true;
    let raw = ed.text;
    const d = this.data(ed.id);
    if (!d) { this.closeEditor(); return true; }
    if (XL.isFormula(raw) && this.cellF(d, ed.c, ed.r).nf !== 'text') {
      // fehlende schliessende Klammern ergänzen (wie Excel)
      let open = 0, q = false;
      for (const ch of raw) { if (ch === '"') q = !q; else if (!q && ch === '(') open++; else if (!q && ch === ')') open--; }
      if (open > 0 && !q) raw += ')'.repeat(open);
      const err = XL.check(raw);
      if (err) {
        if (quiet) { raw = "'" + ed.text; UI.toast('Formel fehlerhaft – als Text gespeichert: ' + err.msg); }
        else {
          UI.toast('Die Formel enthält einen Fehler: ' + err.msg + ' (Esc = abbrechen)', 3500);
          const t = ed.inBar ? this.barIn : this.ed;
          if (t) { t.focus({ preventScroll: true }); t.setSelectionRange(err.pos, err.pos); }
          return false;
        }
      } else raw = XL.normalize(raw);
    }
    // Datenüberprüfung (1.72): Eingabe ausserhalb der Regel ablehnen
    const bad = !quiet && raw !== ed.orig && typeof OfficeXT !== 'undefined' ? OfficeXT.validate(ed.id, ed.c, ed.r, raw) : null;
    if (bad) { UI.toast(bad + ' (Esc = abbrechen)', 4500); const t = ed.inBar ? this.barIn : this.ed; if (t) t.focus({ preventScroll: true }); return false; }
    this.closeEditor();
    if (raw !== ed.orig) this.setCells(ed.id, [[ed.c, ed.r, raw]], 'Zelle bearbeitet');
    else this.refreshUi();
    if (!quiet) this.focusKb();
    return true;
  },
  /* Strg+Enter: Eingabe in alle markierten Zellen (Formeln relativ) */
  commitAll() {
    const ed = this.edit, s = this.sel();
    let raw = ed.text;
    if (XL.isFormula(raw)) { const err = XL.check(raw); if (err) { UI.toast('Die Formel enthält einen Fehler: ' + err.msg); return; } raw = XL.normalize(raw); }
    this.closeEditor();
    const list = [];
    for (let r = s.r1; r <= s.r2; r++) for (let c = s.c1; c <= s.c2; c++) list.push([c, r, XL.isFormula(raw) ? XL.shiftFormula(raw, c - ed.c, r - ed.r) : raw]);
    this.setCells(ed.id, list, 'Zellen ausgefüllt');
    this.focusKb();
  },
  cancel() {
    if (!this.edit) return;
    this.closeEditor();
    this.refreshUi();
    this.focusKb();
  },
  closeEditor() {
    const ed = this.edit;
    this.edit = null;
    this.closeAc();
    if (this.ed) { this.ed.remove(); this.ed = null; }
    if (this.bar && document.activeElement === this.barIn) this.barIn.blur();
    if (ed) for (const x of (Canvas.page ? Canvas.page.boxes : [])) if (x.sheet) this.overlay(x);
  },

  /* ---------------------------------------------------------- Autovervollständigen + Funktionshilfe (1.9 überarbeitet)
   * Beim Tippen einer Formel: Liste passender Funktionen (häufige zuerst, auch englische Namen und Wortteile, Tabellennamen),
   * grauer Textvorschlag direkt hinter der Schreibmarke (Tab übernimmt), Signatur und Beschreibung der gewählten Funktion.
   * Nur „=“ getippt: häufige Funktionen als Schnellwahl. */
  AC_POP: ['SUMME', 'MITTELWERT', 'WENN', 'ANZAHL', 'MAX', 'MIN', 'RUNDEN', 'SVERWEIS', 'XVERWEIS', 'SUMMEWENN', 'ZÄHLENWENN', 'ANZAHL2', 'WENNFEHLER', 'HEUTE', 'JETZT', 'DATUM',
    'VERKETTEN', 'TEXT', 'UND', 'ODER', 'INDEX', 'VERGLEICH', 'ABS', 'WURZEL', 'POTENZ', 'PRODUKT', 'MEDIAN', 'STABW.S', 'LINKS', 'RECHTS', 'LÄNGE', 'GROSS', 'KLEIN', 'GLÄTTEN',
    'AUFRUNDEN', 'ABRUNDEN', 'GANZZAHL', 'REST', 'MITTELWERTWENN', 'SUMMEWENNS', 'ZÄHLENWENNS', 'MITTELWERTWENNS', 'SUMMENPRODUKT'],
  updateAc(ta) {
    const ed = this.edit;
    if (!ed || !ta || !(XL.isFormula(ed.text) || ed.text.trim() === '=')) { this.closeAc(); return; }
    const caret = ta.selectionStart, before = ed.text.slice(0, caret);
    let m = /(^|[=(;,+\-*/^&<> ])([A-Za-zÄÖÜäöüß_][A-Za-z0-9ÄÖÜäöüß._]*)$/.exec(before);
    // [Seite → Tabellen anderer Seiten vorschlagen (1.26)
    const mp = !m && /(^|[=(;,+\-*/^&<> ])('?\[[^\]'"]*)$/.exec(before);
    let items = [], quick = false;
    const rank = (de) => { const i = this.AC_POP.indexOf(de); return i < 0 ? 999 : i; };
    if (m && !/^[A-Za-z]{1,3}\d+$/.test(m[2])) {
      const pre = m[2].toUpperCase();
      const seen = new Set();
      const add = (f, extra) => { if (seen.has(f.de)) return; seen.add(f.de); items.push(extra ? { ...f, ...extra } : f); };
      const byRank = (a, b) => rank(a.de) - rank(b.de) || a.de.length - b.de.length || a.de.localeCompare(b.de);
      XL.FN_INFO.filter(f => f.de.startsWith(pre)).sort(byRank).forEach(f => add(f));
      XL.FN_INFO.filter(f => f.en && f.en.startsWith(pre)).sort(byRank).forEach(f => add(f, { viaEn: true }));
      // Tabellen dieser Seite (für Bezüge wie Tabelle2!A1)
      for (const b of Canvas.page ? Canvas.page.boxes : []) if (b.sheet && b.id !== ed.id && b.sheet.name.toUpperCase().startsWith(pre)) items.push({ de: b.sheet.name, sheet: true, desc: 'Tabelle auf dieser Seite – Bezug einfügen' });
      if (pre.length >= 3) XL.FN_INFO.filter(f => f.de.includes(pre) && !f.de.startsWith(pre)).sort(byRank).forEach(f => add(f, { part: true }));
      items = items.slice(0, 12);
    } else if (mp) {
      m = mp;
      items = this.pageSuggestions(mp[2].replace(/^'?\[/, ''));
    } else if (/^=\s*$/.test(before) && ed.text.trim() === '=') {
      quick = true;
      items = this.AC_POP.slice(0, 8).map(n => XL.FN_INFO.find(f => f.de === n)).filter(Boolean);
    }
    // aktuelle Funktion und Argument (Signatur-Hilfe)
    let q = false, fn = null, argi = 0;
    const stack = [];
    for (let i = 0; i < before.length; i++) {
      const ch = before[i];
      if (ch === '"') { q = !q; continue; }
      if (q) continue;
      if (ch === '(') { const nm = /([A-Za-zÄÖÜäöüß][A-Za-z0-9ÄÖÜäöüß.]*)\s*$/.exec(before.slice(0, i)); stack.push({ name: nm ? nm[1] : null, arg: 0 }); }
      else if (ch === ')') stack.pop();
      else if ((ch === ';' || ch === ',') && stack.length) stack[stack.length - 1].arg++;
    }
    const top = stack.length ? stack[stack.length - 1] : null;
    if (top && top.name) { const inf = XL.fnInfo(top.name); if (inf) { fn = inf; argi = top.arg; } }
    if (!items.length && !fn) { this.closeAc(); return; }
    const keepI = this.ac && this.ac.ta === ta && this.ac.from === (m ? caret - m[2].length : caret) && this.ac.items.length === items.length ? this.ac.i : 0;
    this.ac = { items, i: Math.min(keepI, Math.max(0, items.length - 1)), from: m ? caret - m[2].length : caret, to: caret, ta, fn, argi, sel: items.length > 0 && !quick, quick, pre: m ? m[2] : '' };
    this.drawAc();
  },
  drawAc() {
    const ac = this.ac;
    if (!ac) return;
    let pop = this._acEl;
    if (!pop) {
      pop = this._acEl = el('div', { class: 'xl-acpop' });
      document.body.append(pop);
      pop.addEventListener('mousedown', e => e.preventDefault());
      pop.addEventListener('click', e => { const x = e.target.closest('[data-i]'); if (x && this.ac) { this.ac.i = +x.dataset.i; this.acceptAc(this.ac.ta); } });
    }
    let h = '';
    const sigHtml = (f, argi) => {
      const args = f.sig ? f.sig.split(/;\s*/) : [];
      return `<b>${escapeHtml(f.de)}</b>(${args.map((x, i) => argi != null && i === Math.min(argi, args.length - 1) ? `<u>${escapeHtml(x)}</u>` : escapeHtml(x)).join('; ')})`;
    };
    if (ac.fn && !ac.items.length) h += `<div class="xl-sig">${sigHtml(ac.fn, ac.argi)}${ac.fn.desc ? `<div class="xl-sigd">${escapeHtml(ac.fn.desc)}</div>` : ''}</div>`;
    else if (ac.fn) h += `<div class="xl-sig xl-sig-s">${sigHtml(ac.fn, ac.argi)}</div>`;
    if (ac.quick) {
      h += `<div class="xl-ach">Funktion tippen (z.B. <b>su</b> → SUMME) oder Zelle anklicken. Häufig:</div><div class="xl-chips">${ac.items.map((f, i) => `<span class="xl-chip" data-i="${i}" title="${escapeHtml(f.desc)}">${escapeHtml(f.de)}</span>`).join('')}</div>`;
    } else if (ac.items.length) {
      ac.items.forEach((f, i) => {
        const nm = f.ins ? escapeHtml(f.de) : f.sheet ? escapeHtml(f.de) + '!' : escapeHtml(f.de);
        h += `<div class="xl-aci${i === ac.i ? ' on' : ''}${f.sheet ? ' sh' : ''}" data-i="${i}"><b>${nm}</b>${f.viaEn ? ` <span>(${escapeHtml(f.en)})</span>` : ''}<em>${escapeHtml(f.desc || '')}</em></div>`;
      });
      const cur = ac.items[ac.i];
      if (cur && !cur.sheet) h += `<div class="xl-acf"><code>${sigHtml(cur)}</code><span>${escapeHtml(cur.cat || '')}</span><div>${escapeHtml(cur.desc || '')}</div><small>Tab oder Enter = übernehmen · ↑ ↓ = wählen · Esc = schliessen</small></div>`;
    }
    pop.innerHTML = h;
    const r = ac.ta.getBoundingClientRect();
    pop.hidden = false;
    pop.classList.toggle('quick', !!ac.quick);
    if (ac.quick) {
      // Schnellwahl NEBEN die ganze Tabelle (1.54) – sonst deckt sie Nachbarzellen zu und ein Klick darauf fügt keinen
      // Bezug ein; kein Platz rechts → darunter, sonst darüber
      const te = this.edit && Canvas.els.get(this.edit.id), tr = te ? te.getBoundingClientRect() : r;
      const W = pop.offsetWidth, H = pop.offsetHeight;
      let x, y;
      if (tr.right + 10 + W < innerWidth - 4) { x = tr.right + 10; y = clamp(r.top, 4, innerHeight - H - 4); }
      else if (tr.bottom + 8 + H < innerHeight - 4) { x = clamp(r.left, 4, innerWidth - W - 4); y = tr.bottom + 8; }
      else if (tr.left - 10 - W > 4) { x = tr.left - 10 - W; y = clamp(r.top, 4, innerHeight - H - 4); }
      else { x = clamp(r.left, 4, innerWidth - W - 4); y = Math.max(4, tr.top - H - 8); }
      pop.style.left = x + 'px'; pop.style.top = y + 'px';
      this.drawGhost();
      return;
    }
    pop.style.left = Math.max(4, Math.min(innerWidth - pop.offsetWidth - 8, r.left)) + 'px';
    const below = r.bottom + 2;
    pop.style.top = (below + pop.offsetHeight > innerHeight - 8 ? Math.max(4, r.top - pop.offsetHeight - 2) : below) + 'px';
    this.drawGhost();
  },
  /* grauer Textvorschlag: Rest des gewählten Funktionsnamens direkt hinter dem Getippten */
  drawGhost() {
    const ac = this.ac, ta = ac && ac.ta;
    let g = this._ghost;
    const cur = ac && ac.sel && ac.items[ac.i];
    const show = cur && !cur.part && !cur.viaEn && ta && ta.selectionStart === ta.value.length && cur.de.toUpperCase().startsWith(ac.pre.toUpperCase()) && document.activeElement === ta;
    if (!show) { if (g) g.hidden = true; return; }
    if (!g || g.parentNode !== ta.parentNode) {
      if (g) g.remove();
      g = this._ghost = el('div', { class: 'xl-ghost ui-only' });
      ta.parentNode.append(g);
    }
    const cs = getComputedStyle(ta);
    Object.assign(g.style, { left: ta.offsetLeft + 'px', top: ta.offsetTop + 'px', font: cs.font, padding: cs.padding, borderStyle: 'solid', borderColor: 'transparent', borderWidth: cs.borderWidth, lineHeight: cs.lineHeight, letterSpacing: cs.letterSpacing, zIndex: 7 });
    const rest = (cur.sheet ? cur.de + '!' : cur.de + '(').slice(ac.pre.length);
    g.innerHTML = `<span class="g0">${escapeHtml(ta.value)}</span><span class="g1">${escapeHtml(rest)}</span>`;
    g.hidden = false;
  },
  acceptAc(ta) {
    const ac = this.ac, ed = this.edit;
    if (!ac || !ed || !ac.items.length) { this.closeAc(); return; }
    const f = ac.items[ac.i];
    const ins = f.ins || (f.sheet ? XL.sheetPrefix(f.de) : f.de + '(');
    ed.text = ed.text.slice(0, ac.from) + ins + ed.text.slice(ac.to);
    ta.value = ed.text;
    const p = ac.from + ins.length;
    ta.setSelectionRange(p, p);
    this.closeAc();
    this.syncEditor(ta === this.barIn ? 'bar' : 'cell');
    ta.focus({ preventScroll: true });
    ta.setSelectionRange(p, p);
    this.afterCaret(ta);
  },
  /* Vorschläge für [Seite]Tabelle!: Seiten mit Tabellen, deren Titel den Text enthält (Anfang zuerst, eigener Abschnitt
   * zuerst); eingefügt wird der kürzeste eindeutige Pfad, z.B. [Rezepte]Tabelle1! oder '[Daten/Übersicht]Tabelle 1'! */
  pageSuggestions(q) {
    this.book();
    const pid = this.curPid(), ql = q.trim().toLowerCase();
    const me = this._pix.info.get(pid), out = [];
    for (const [t, es] of this._pix.byTitle) {
      const at = t.indexOf(ql);
      if (ql && at < 0) continue;
      for (const e of es) {
        if (e.pid === pid) continue;
        const pg = Store.pages[e.pid];
        if (!pg) continue;
        for (const b of pg.boxes) {
          if (!b.sheet) continue;
          const path = this.pathFor(e.pid, pid, b.sheet.name);
          if (path == null) continue;
          out.push({ de: `[${path}]${b.sheet.name}!`, ins: XL.sheetPrefix(b.sheet.name, path), sheet: true, part: true, desc: Tree.path(e.sec).map(g => g.name).join(' › ') || 'Seite',
            _r: (at === 0 ? 0 : 2) + (me && e.sec === me.sec ? 0 : 1), _t: t });
        }
      }
      if (out.length > 200) break;
    }
    return out.sort((a, b) => a._r - b._r || a._t.localeCompare(b._t)).slice(0, 12);
  },
  closeAc() { this.ac = null; if (this._acEl) this._acEl.hidden = true; if (this._ghost) this._ghost.hidden = true; },

  /* ---------------------------------------------------------- Daten ändern */
  writeRaw(d, c, r, raw) {
    const k = XL.key(c, r);
    let cell = d.cells[k];
    if (raw === '' || raw == null) { if (cell) { cell.v = ''; if (!cell.f || !Object.keys(cell.f).length) delete d.cells[k]; } return; }
    if (!cell) cell = d.cells[k] = { v: '' };
    cell.v = raw;
    if (!cell.f || !cell.f.nf) {
      let p = null;
      if (!XL.isFormula(raw)) p = XL.parseInput(raw);
      else p = this.formulaFormat(d, raw);
      if (p && p.nf) { cell.f = { ...(cell.f || {}), nf: p.nf }; if (p.d != null) cell.f.d = p.d; if (p.cur) cell.f.cur = p.cur; if (p.secs) cell.f.secs = 1; }
    }
    if (r >= d.nrows) d.nrows = r + 1;
    if (c >= d.ncols) { d.ncols = c + 1; XL.normSheet(d); }
  },
  /* Zahlenformat einer Formel vorschlagen (Datum-Funktionen, sonst wie der erste Bezug bei Summen) */
  formulaFormat(d, raw) {
    const u = raw.toUpperCase();
    if (/^=(HEUTE|TODAY|DATUM|DATE|EDATUM|EDATE|MONATSENDE|EOMONTH|ARBEITSTAG|WORKDAY|DATWERT|DATEVALUE)\(/.test(u)) return { nf: 'date' };
    if (/^=(JETZT|NOW)\(/.test(u)) return { nf: 'dt' };
    if (/^=(ZEIT|TIME|ZEITWERT|TIMEVALUE)\(/.test(u)) return { nf: 'time' };
    if (/[*/^&]/.test(u) && !/^=(SUMME|SUM|MITTELWERT|AVERAGE|MIN|MAX|RUNDEN|ROUND)\(/.test(u)) return null;
    const refs = XL.refsIn(raw);
    const r0 = refs[0];
    if (!r0) return null;
    let td = d;   // Bezug auf eine andere Tabelle (auch [Seite]Tabelle!A1): deren Format übernehmen
    if (r0.sheet) { const book = this.book(), from = book.sheets.find(x => x.d === d), t = from && book.sheet(r0.sheet, from, r0.page); if (!t) return null; td = t.d; }
    const f = this.cellF(td, r0.c1, r0.r1 === Infinity ? 0 : r0.r1);
    if (['cur', 'num', 'date', 'time', 'pct'].includes(f.nf) && !/^=(ANZAHL|COUNT)/.test(u)) return { nf: f.nf, d: f.d, cur: f.cur };
    return null;
  },
  setCells(id, list, label) {
    const d = this.data(id);
    if (!d || (this.locked(id) && list.some(([c, r]) => this.locked(id, c, r)))) return;
    for (const [c, r, raw] of list) this.writeRaw(d, c, r, raw);
    this.markDirty(id, list.map(x => [x[0], x[1]]));
    this.changed(label);
    if (typeof Plugins !== 'undefined') Plugins.cellsChanged(id, list, label);   // Add-Ins, Makro-Aufzeichnung (1.66)
  },
  /* nach einer Änderung: nur die betroffene Tabelle (+ abhängige Tabellen und Diagramme) neu rechnen und zeichnen.
   * _full = Aufbau geändert (Zeilen/Spalten, Umbenennen) → alles */
  changed(label) {
    const full = this._full;
    this._full = false;
    if (full) { this._dirty = null; this.reset(); }
    else if (!this._dirty && this.active) this.markDirty(this.active.id, this.sel());
    this.refresh();
    Hist.touchPage(Canvas.pageId);
    Hist.commit(label);
  },
  /* Format der Auswahl ändern: fn(f) bekommt das Formatobjekt der Zelle */
  formatSel(fn, label) {
    const a = this.active;
    if (!a || this.locked(a.id)) return;
    const d = this.data(a.id), s = this.sel();
    for (let r = s.r1; r <= s.r2; r++) for (let c = s.c1; c <= s.c2; c++) {
      const k = XL.key(c, r);
      const cell = d.cells[k] || (d.cells[k] = { v: '' });
      const f = { ...(cell.f || (d.xl && d.xl.f0) || {}) };   // Excel: Zellformat 0 der Mappe als Ausgang (1.71)
      fn(f, c, r);
      for (const x of Object.keys(f)) if (f[x] == null || f[x] === false || f[x] === '') delete f[x];
      if (Object.keys(f).length) cell.f = f; else delete cell.f;
      if (!cell.v && !cell.f) delete d.cells[k];
    }
    this.changed(label || 'Zellen formatiert');
  },
  toggle(prop) {
    const a = this.active, d = this.data(a.id);
    const cur = !!this.cellF(d, a.c, a.r)[prop] || (prop === 'b' && d.head && a.r === 0 && this.cellF(d, a.c, a.r).b !== false);
    this.formatSel(f => { if (prop === 'b' && d.head && this.sel().r1 === 0) f.b = cur ? false : true; else f[prop] = !cur; }, { b: 'Fett', i: 'Kursiv', u: 'Unterstrichen', s: 'Durchgestrichen' }[prop]);
  },
  fmtActive(prop) {
    const a = this.active;
    if (!a) return undefined;
    const d = this.data(a.id);
    if (!d) return undefined;
    const f = this.cellF(d, a.c, a.r);
    if (prop === 'b') return !!f.b || (d.head && a.r === 0 && f.b !== false);
    return f[prop];
  },
  setNumFmt(nf, extra = {}) {
    this.formatSel(f => {
      if (nf === 'std') { delete f.nf; delete f.d; delete f.cur; return; }
      f.nf = nf;
      if (extra.d !== undefined) f.d = extra.d; else if (nf === 'num' || nf === 'cur') f.d = f.d ?? 2; else if (nf === 'pct') f.d = f.d ?? 0; else if (nf === 'sci') f.d = f.d ?? 2; else delete f.d;
      if (extra.cur) f.cur = extra.cur;
    }, 'Zahlenformat');
  },
  decimals(delta) {
    const a = this.active;
    if (!a) return;
    const d = this.data(a.id);
    this.formatSel((f, c, r) => {
      let cur = f.d;
      if (cur == null) {
        const v = this.value(a.id, c, r);
        if (typeof v === 'number') { const t = XL.format(v, f).t; const m = /\.(\d+)/.exec(t.replace(/E.*$/, '')); cur = m ? m[1].length : 0; }
        else cur = 0;
        if (!f.nf) f.nf = 'num';
        if (f.nf === 'num' && f.ts === undefined && !this.cellF(d, c, r).nf) f.ts = false;
      }
      f.d = clamp(cur + delta, 0, 15);
    }, delta > 0 ? 'Dezimalstelle hinzufügen' : 'Dezimalstelle entfernen');
  },
  clear(what = 'v') {
    const a = this.active;
    if (!a || this.locked(a.id)) return;
    const d = this.data(a.id), s = this.sel();
    for (let r = s.r1; r <= s.r2; r++) for (let c = s.c1; c <= s.c2; c++) {
      const k = XL.key(c, r), cell = d.cells[k];
      if (!cell) continue;
      if (what === 'v' || what === 'all') cell.v = '';
      if (what === 'f' || what === 'all') delete cell.f;
      if (!cell.v && !cell.f) delete d.cells[k];
    }
    this.changed(what === 'f' ? 'Formate gelöscht' : 'Inhalte gelöscht');
  },

  /* ---------------------------------------------------------- Zeilen und Spalten */
  /* jede Formel aller Seiten umschreiben: fn(roh, tabelle) → neuer Text (tabelle: { id, name, d, page }).
   * Geänderte Seiten kommen in denselben Verlaufsschritt (Rückgängig stellt alle wieder her). */
  eachFormula(fn) {
    const touched = new Set();
    for (const x of this.book().sheets) {
      for (const cell of Object.values(x.d.cells)) {
        if (!XL.isFormula(cell.v)) continue;
        const nv = fn(cell.v, x);
        if (nv != null && nv !== cell.v) { cell.v = nv; touched.add(x.page); }
      }
    }
    for (const pid of touched) Hist.touchPage(pid);
    return touched;
  },
  /* Seite oder Abschnitt umbenennen, ohne dass Bezüge brechen (wie Excel beim Umbenennen einer Mappe): apply() benennt
   * um; danach zeigt jeder [Pfad]-Bezug wieder auf dieselbe Seite wie vorher (Pfad neu, so kurz wie möglich).
   * Ergebnis: Set der geänderten Seiten (schon für den Verlauf vorgemerkt) */
  keepRefs(apply) {
    const jobs = [];
    this.bump();   // Verzeichnis mit den alten Namen
    for (const x of this.book().sheets) for (const cell of Object.values(x.d.cells)) {
      if (typeof cell.v !== 'string' || !cell.v.includes('[') || !XL.isFormula(cell.v)) continue;
      const rs = XL.refsIn(cell.v).filter(t => t.page);
      if (rs.length) jobs.push({ x, cell, old: rs.map(t => this.resolvePage(x.page, t.page, t.sheet)) });
    }
    apply();
    this.bump();
    const touched = new Set();
    if (!jobs.length) return touched;
    this.book();
    for (const j of jobs) {
      let i = 0;
      const nv = XL.rewrite(j.cell.v, (t) => {
        if (!t.page) return undefined;
        const pid = j.old[i++];
        if (pid == null || this.resolvePage(j.x.page, t.page, t.sheet) === pid) return undefined;
        const np = this.pathFor(pid, j.x.page, t.sheet);
        if (np == null) return undefined;
        t.page = np;
        return t;
      });
      if (nv !== j.cell.v) { j.cell.v = nv; touched.add(j.x.page); }
    }
    for (const pid of touched) Hist.touchPage(pid);
    if (touched.size) this.reset();
    return touched;
  },
  /* zeigt der Bezug t (aus einer Formel der Tabelle x) auf die Tabelle „name“ der Seite pid? */
  pointsTo(t, x, name, pid) {
    const sn = t.sheet == null ? x.name : t.sheet;
    if (String(sn).toLowerCase() !== String(name).toLowerCase()) return false;
    return t.page ? this.resolvePage(x.page, t.page, sn) === pid : x.page === pid;
  },
  /* Zeilen/Spalten eingefügt oder gelöscht: Bezüge in allen Formeln (auch auf anderen Seiten) und Diagrammen anpassen */
  adjustAll(name, axis, at, n) {
    const pid = this.curPid();
    const nl = String(name).toLowerCase();
    this.eachFormula((raw, x) => (x.page === pid && x.name.toLowerCase() === nl) || raw.toLowerCase().includes(nl) ? XL.adjustRefs(raw, (t) => this.pointsTo(t, x, name, pid), x.name, axis, at, n) : null);
    for (const b of Canvas.page.boxes) if (b.chart && b.chart.src && typeof Chart !== 'undefined') Chart.adjustSrc(b, name, axis, at, n);
  },
  remap(d, fn) {
    const out = {};
    for (const [k, cell] of Object.entries(d.cells)) { const p = XL.parseKey(k); const q = fn(p.c, p.r); if (q) out[XL.key(q.c, q.r)] = cell; }
    d.cells = out;
  },
  insertRows(at, n = 1, id = this.active && this.active.id, quiet) {
    const d = this.data(id);
    if (!d || this.locked(id)) return;
    this.adjustAll(d.name, 'r', at, n);
    this.remap(d, (c, r) => ({ c, r: r >= at ? r + n : r }));
    if (typeof OfficeXT !== 'undefined') OfficeXT.shift(d, 'r', at, n);
    d.nrows += n;
    if (this.active && this.active.id === id && !quiet) { if (this.active.r >= at) this.active.r += n; if (this.active.r2 >= at) this.active.r2 += n; }
    this._full = true;
    this.changed(n > 1 ? 'Zeilen eingefügt' : 'Zeile eingefügt');
  },
  deleteRows(at, n = 1, id = this.active && this.active.id) {
    const d = this.data(id);
    if (!d || this.locked(id)) return;
    n = Math.min(n, d.nrows - at);
    if (n >= d.nrows) { UI.toast('Die letzte Zeile kann nicht gelöscht werden – Tabelle löschen: Leiste anklicken und Entf'); return; }
    this.adjustAll(d.name, 'r', at, -n);
    this.remap(d, (c, r) => r < at ? { c, r } : r >= at + n ? { c, r: r - n } : null);
    if (typeof OfficeXT !== 'undefined') OfficeXT.shift(d, 'r', at, -n);
    d.nrows -= n;
    if (this.active) { this.active.r = this.active.r2 = Math.min(at, d.nrows - 1); }
    this._full = true;
    this.changed(n > 1 ? 'Zeilen gelöscht' : 'Zeile gelöscht');
  },
  insertCols(at, n = 1, id = this.active && this.active.id) {
    const d = this.data(id);
    if (!d || this.locked(id)) return;
    this.adjustAll(d.name, 'c', at, n);
    this.remap(d, (c, r) => ({ c: c >= at ? c + n : c, r }));
    if (typeof OfficeXT !== 'undefined') OfficeXT.shift(d, 'c', at, n);
    d.ncols += n;
    d.cols.splice(at, 0, ...Array(n).fill(d.cols[Math.max(0, at - 1)] || 96));
    if (this.active && this.active.id === id) { if (this.active.c >= at) this.active.c += n; if (this.active.c2 >= at) this.active.c2 += n; }
    this._full = true;
    this.changed(n > 1 ? 'Spalten eingefügt' : 'Spalte eingefügt');
  },
  deleteCols(at, n = 1, id = this.active && this.active.id) {
    const d = this.data(id);
    if (!d || this.locked(id)) return;
    n = Math.min(n, d.ncols - at);
    if (n >= d.ncols) { UI.toast('Die letzte Spalte kann nicht gelöscht werden'); return; }
    this.adjustAll(d.name, 'c', at, -n);
    this.remap(d, (c, r) => c < at ? { c, r } : c >= at + n ? { c: c - n, r } : null);
    if (typeof OfficeXT !== 'undefined') OfficeXT.shift(d, 'c', at, -n);
    d.ncols -= n;
    d.cols.splice(at, n);
    if (this.active) { this.active.c = this.active.c2 = Math.min(at, d.ncols - 1); }
    this._full = true;
    this.changed(n > 1 ? 'Spalten gelöscht' : 'Spalte gelöscht');
  },
  /* ---------------------------------------------------------- Verschieben (1.54, wie Excel)
   * Bezüge in allen Formeln (auch auf anderen Seiten) werden angepasst: map(t) bekommt jeden Bezug auf diese Tabelle. */
  moveRefs(name, map) {
    const pid = this.curPid(), nl = String(name).toLowerCase();
    this.eachFormula((raw, x) => (x.page === pid && x.name.toLowerCase() === nl) || raw.toLowerCase().includes(nl)
      ? XL.rewrite(raw, (t) => this.pointsTo(t, x, name, pid) ? map(t) : undefined) : null);
  },
  /* Bereich s um dc/dr verschieben (oder kopieren): Ziel wird überschrieben; Bezüge, die ganz im Bereich liegen,
   * wandern mit (wie Excel); beim Kopieren werden relative Bezüge der kopierten Formeln verschoben. */
  moveBlock(id, s, dc, dr, copy) {
    const d = this.data(id);
    if (!d || this.locked(id) || (!dc && !dr && !copy)) return;
    const src = [];
    for (let r = s.r1; r <= s.r2; r++) for (let c = s.c1; c <= s.c2; c++) { const k = XL.key(c, r); if (d.cells[k]) src.push([c, r, d.cells[k]]); }
    const t = { c1: s.c1 + dc, r1: s.r1 + dr, c2: s.c2 + dc, r2: s.r2 + dr };
    if (!copy) {
      // Bezüge auf den Bereich zeigen danach auf die neue Stelle
      this.moveRefs(d.name, (tk) => {
        if (tk.kind === 'row' || tk.kind === 'col') return undefined;
        const a = tk.a, z = tk.b || tk.a;
        const in1 = (p) => p.c >= s.c1 && p.c <= s.c2 && p.r >= s.r1 && p.r <= s.r2;
        if (!in1(a) || !in1(z)) return undefined;
        a.c += dc; a.r += dr; if (tk.b) { tk.b.c += dc; tk.b.r += dr; }
        return tk;
      });
      // die Zellen selbst (Formeltext ist schon angepasst – jetzt aus d.cells neu lesen)
      for (const it of src) it[2] = d.cells[XL.key(it[0], it[1])];
      for (const [c, r] of src) delete d.cells[XL.key(c, r)];
    }
    for (let r = t.r1; r <= t.r2; r++) for (let c = t.c1; c <= t.c2; c++) delete d.cells[XL.key(c, r)];
    for (const [c, r, cell] of src) {
      const nc = JSON.parse(JSON.stringify(cell));
      if (copy && XL.isFormula(nc.v)) nc.v = XL.shiftFormula(nc.v, dc, dr);
      d.cells[XL.key(c + dc, r + dr)] = nc;
    }
    d.nrows = Math.max(d.nrows, t.r2 + 1);
    if (t.c2 + 1 > d.ncols) { d.ncols = t.c2 + 1; XL.normSheet(d); }
    if (this.active && this.active.id === id) Object.assign(this.active, { c: t.c1, r: t.r1, c2: t.c2, r2: t.r2 });
    this._full = true;
    this.changed(copy ? 'Zellen kopiert' : 'Zellen verschoben');
  },
  /* Zeilen r1…r2 vor Zeile „at“ (alte Zählung) einfügen; Bezüge folgen den Zeilen */
  moveRows(id, r1, r2, at) {
    const d = this.data(id);
    if (!d || this.locked(id) || (at >= r1 && at <= r2 + 1)) return;
    const n = r2 - r1 + 1;
    const perm = (r) => r === Infinity || r < 0 ? r : (r >= r1 && r <= r2) ? (at > r2 ? at - n + (r - r1) : at + (r - r1)) : (at > r2 && r > r2 && r < at) ? r - n : (at < r1 && r >= at && r < r1) ? r + n : r;
    this.permRefs(d.name, 'r', perm, (lo, hi) => r1 >= lo && r2 <= hi && at >= lo && at <= hi + 1);
    this.remap(d, (c, r) => ({ c, r: perm(r) }));
    const nr1 = perm(r1);
    if (this.active && this.active.id === id) Object.assign(this.active, { c: 0, c2: d.ncols - 1, r: nr1, r2: nr1 + n - 1 });
    this._full = true;
    this.changed(n > 1 ? 'Zeilen verschoben' : 'Zeile verschoben');
  },
  moveCols(id, c1, c2, at) {
    const d = this.data(id);
    if (!d || this.locked(id) || (at >= c1 && at <= c2 + 1)) return;
    const n = c2 - c1 + 1;
    const perm = (c) => c === Infinity || c < 0 ? c : (c >= c1 && c <= c2) ? (at > c2 ? at - n + (c - c1) : at + (c - c1)) : (at > c2 && c > c2 && c < at) ? c - n : (at < c1 && c >= at && c < c1) ? c + n : c;
    this.permRefs(d.name, 'c', perm, (lo, hi) => c1 >= lo && c2 <= hi && at >= lo && at <= hi + 1);
    this.remap(d, (c, r) => ({ c: perm(c), r }));
    // Spaltenbreiten mitnehmen
    const w = d.cols.slice(), nw = w.slice();
    for (let c = 0; c < w.length; c++) nw[perm(c)] = w[c];
    d.cols = nw;
    const nc1 = perm(c1);
    if (this.active && this.active.id === id) Object.assign(this.active, { r: 0, r2: d.nrows - 1, c: nc1, c2: nc1 + n - 1 });
    this._full = true;
    this.changed(n > 1 ? 'Spalten verschoben' : 'Spalte verschoben');
  },
  /* Bezüge nach Umordnung von Zeilen/Spalten: jede Ecke einzeln umrechnen, Bereich wieder ordnen */
  permRefs(name, k, perm, inside) {
    this.moveRefs(name, (t) => {
      if ((k === 'r' && t.kind === 'col') || (k === 'c' && t.kind === 'row')) return undefined;
      // Bereich, in dem nur umsortiert wird (=SUMME(A1:A4), Zeile 1 nach 3): bleibt gleich
      if (t.b && inside && inside(Math.min(t.a[k], t.b[k]), Math.max(t.a[k], t.b[k]))) return undefined;
      t.a[k] = perm(t.a[k]);
      if (t.b) {
        t.b[k] = perm(t.b[k]);
        if (t.b[k] !== Infinity && t.a[k] > t.b[k]) { const x = t.a[k]; t.a[k] = t.b[k]; t.b[k] = x; }
      }
      return t;
    });
  },
  /* Zeilen bzw. Spalten der Auswahl um eins verschieben (Alt+Umschalt+Pfeil, Kontextmenü) */
  nudge(dir) {
    const a = this.active;
    if (!a) return;
    const s = this.sel(), d = this.data(a.id);
    if (dir === 'up' && s.r1 > 0) this.moveRows(a.id, s.r1, s.r2, s.r1 - 1);
    else if (dir === 'down' && s.r2 < d.nrows - 1) this.moveRows(a.id, s.r1, s.r2, s.r2 + 2);
    else if (dir === 'left' && s.c1 > 0) this.moveCols(a.id, s.c1, s.c2, s.c1 - 1);
    else if (dir === 'right' && s.c2 < d.ncols - 1) this.moveCols(a.id, s.c1, s.c2, s.c2 + 2);
  },
  /* Spaltenbreite an den Inhalt anpassen (Doppelklick auf den Rand) */
  autofit(id, c) {
    const b = this.box(id), e = Canvas.els.get(id);
    if (!b || !e || this.locked(id)) return;
    const meas = el('span', { class: 'xl-meas' });
    e.querySelector('.xl-wrap').append(meas);
    let w = 24;
    const t = e.querySelector('.xl-grid');
    for (const tr of t.rows) {
      const td = tr.cells[c];
      if (!td || !td.textContent) continue;
      const cs = getComputedStyle(td);
      meas.style.font = cs.font;
      for (const line of td.textContent.split('\n')) { meas.textContent = line; w = Math.max(w, meas.offsetWidth + 14); }
    }
    meas.remove();
    b.sheet.cols[c] = Math.min(600, Math.ceil(w));
    this.markDirty(id);
    this.changed('Spaltenbreite angepasst');
  },
  async rename(id) {
    const d = this.data(id);
    if (!d || this.locked(id) || (typeof OfficeXT !== 'undefined' && OfficeXT.on(id) && !OfficeXT.wbGuard())) return;
    const v = await UI.prompt('Tabelle umbenennen', d.name, { text: 'Mit dem Namen kannst du in Formeln auf diese Tabelle verweisen, z.B. =SUMME(' + XL.sheetPrefix(d.name) + 'A1:A5)' });
    if (v == null || !v.trim() || v.trim() === d.name) return;
    const nn = this.uniqueName(v.trim(), Canvas.page, id);
    // Bezüge darauf umbenennen – auf dieser Seite (Tabelle1!A1) und auf anderen ([Seite]Tabelle1!A1), wie Excel
    const pid = this.curPid(), old = d.name;
    this.eachFormula((raw, x) => !raw.toLowerCase().includes(old.toLowerCase()) ? null : XL.rewrite(raw, (t) => { if (t.sheet != null && this.pointsTo(t, x, old, pid)) { t.sheet = nn; return t; } return undefined; }));
    d.name = nn;
    this._full = true;
    this.changed('Tabelle umbenannt');
  },

  /* ---------------------------------------------------------- Ausfüllen, Sortieren, AutoSumme */
  fill(id, src, tgt) {
    const d = this.data(id);
    if (!d || this.locked(id)) return;
    const vert = tgt.dir === 'd' || tgt.dir === 'u', back = tgt.dir === 'u' || tgt.dir === 'l';
    if (tgt.r2 >= d.nrows) d.nrows = tgt.r2 + 1;
    if (tgt.c2 >= d.ncols) { d.ncols = tgt.c2 + 1; XL.normSheet(d); }
    const lines = vert ? [src.c1, src.c2] : [src.r1, src.r2];
    for (let L = lines[0]; L <= lines[1]; L++) {
      const srcCells = [];
      if (vert) for (let r = src.r1; r <= src.r2; r++) srcCells.push({ c: L, r });
      else for (let c = src.c1; c <= src.c2; c++) srcCells.push({ c, r: L });
      const raws = srcCells.map(p => this.raw(d, p.c, p.r));
      const targets = [];
      if (vert) { if (back) for (let r = tgt.r2; r >= tgt.r1; r--) targets.push({ c: L, r }); else for (let r = tgt.r1; r <= tgt.r2; r++) targets.push({ c: L, r }); }
      else { if (back) for (let c = tgt.c2; c >= tgt.c1; c--) targets.push({ c, r: L }); else for (let c = tgt.c1; c <= tgt.c2; c++) targets.push({ c, r: L }); }
      const k = srcCells.length;
      const anyFormula = raws.some(XL.isFormula);
      const ser = !anyFormula ? XL.series(raws, targets.length, back) : null;
      targets.forEach((t, i) => {
        const si = back ? (k - 1 - (i % k)) : (i % k);
        const sp = srcCells[si];
        const raw = ser ? ser[i] : XL.isFormula(raws[si]) ? XL.shiftFormula(raws[si], t.c - sp.c, t.r - sp.r) : raws[si];
        const sf = d.cells[XL.key(sp.c, sp.r)] && d.cells[XL.key(sp.c, sp.r)].f;
        const key = XL.key(t.c, t.r);
        if (!raw && !sf) { delete d.cells[key]; return; }
        d.cells[key] = { v: raw || '', ...(sf ? { f: { ...sf } } : {}) };
      });
    }
    const a = this.active;
    if (a && a.id === id) { a.c = Math.min(src.c1, tgt.c1); a.r = Math.min(src.r1, tgt.r1); a.c2 = Math.max(src.c2, tgt.c2); a.r2 = Math.max(src.r2, tgt.r2); }
    this.markDirty(id);
    this.changed('Ausgefüllt');
  },
  /* Strg+D / Strg+R: erste Zeile/Spalte der Auswahl nach unten/rechts kopieren */
  fillDir(dir) {
    const a = this.active;
    if (!a) return;
    const s = this.sel();
    if (dir === 'd') {
      if (s.r1 === s.r2) { if (s.r1 === 0) return; this.fill(a.id, { c1: s.c1, r1: s.r1 - 1, c2: s.c2, r2: s.r1 - 1 }, { c1: s.c1, r1: s.r1, c2: s.c2, r2: s.r2, dir: 'd', copy: true }); return; }
      this.copyFill(a.id, { c1: s.c1, r1: s.r1, c2: s.c2, r2: s.r1 }, { c1: s.c1, r1: s.r1 + 1, c2: s.c2, r2: s.r2 });
    } else {
      if (s.c1 === s.c2) { if (s.c1 === 0) return; this.fill(a.id, { c1: s.c1 - 1, r1: s.r1, c2: s.c1 - 1, r2: s.r2 }, { c1: s.c1, r1: s.r1, c2: s.c2, r2: s.r2, dir: 'r', copy: true }); return; }
      this.copyFill(a.id, { c1: s.c1, r1: s.r1, c2: s.c1, r2: s.r2 }, { c1: s.c1 + 1, r1: s.r1, c2: s.c2, r2: s.r2 });
    }
  },
  copyFill(id, src, tgt) {
    const d = this.data(id);
    for (let r = tgt.r1; r <= tgt.r2; r++) for (let c = tgt.c1; c <= tgt.c2; c++) {
      const sc = src.c1 === src.c2 ? src.c1 : c, sr = src.r1 === src.r2 ? src.r1 : r;
      const cell = d.cells[XL.key(sc, sr)];
      if (!cell) { delete d.cells[XL.key(c, r)]; continue; }
      d.cells[XL.key(c, r)] = { v: XL.isFormula(cell.v) ? XL.shiftFormula(cell.v, c - sc, r - sr) : cell.v, ...(cell.f ? { f: { ...cell.f } } : {}) };
    }
    this.markDirty(id);
    this.changed('Ausgefüllt');
  },
  /* zusammenhängender Datenbereich um die aktive Zelle */
  region(id, c, r) {
    const d = this.data(id);
    const filled = (cc, rr) => cc >= 0 && rr >= 0 && cc < d.ncols && rr < d.nrows && this.raw(d, cc, rr) !== '';
    let s = { c1: c, r1: r, c2: c, r2: r }, grew = true;
    while (grew) {
      grew = false;
      const tryAdd = (dc1, dr1, dc2, dr2) => {
        const n = { c1: s.c1 + dc1, r1: s.r1 + dr1, c2: s.c2 + dc2, r2: s.r2 + dr2 };
        if (n.c1 < 0 || n.r1 < 0 || n.c2 >= d.ncols || n.r2 >= d.nrows) return;
        let any = false;
        if (dr1) for (let cc = n.c1; cc <= n.c2; cc++) any = any || filled(cc, n.r1);
        if (dr2) for (let cc = n.c1; cc <= n.c2; cc++) any = any || filled(cc, n.r2);
        if (dc1) for (let rr = n.r1; rr <= n.r2; rr++) any = any || filled(n.c1, rr);
        if (dc2) for (let rr = n.r1; rr <= n.r2; rr++) any = any || filled(n.c2, rr);
        if (any) { s = n; grew = true; }
      };
      tryAdd(0, -1, 0, 0); tryAdd(0, 0, 0, 1); tryAdd(-1, 0, 0, 0); tryAdd(0, 0, 1, 0);
    }
    return s;
  },
  sort(desc) {
    const a = this.active;
    if (!a || this.locked(a.id)) return;
    const d = this.data(a.id);
    let s = this.sel();
    if (s.r1 === s.r2) s = this.region(a.id, a.c, a.r);
    let r1 = s.r1;
    if (d.head && r1 === 0) r1 = 1;
    else if (s.r1 === this.sel().r1 && s.r2 !== this.sel().r2) {
      // Kopfzeile erkennen: erste Zeile Text, darunter Zahlen in der Sortierspalte
      const v0 = this.value(a.id, a.c, s.r1), v1 = this.value(a.id, a.c, s.r1 + 1);
      if (typeof v0 === 'string' && typeof v1 === 'number') r1 = s.r1 + 1;
    }
    if (r1 >= s.r2) return;
    const rows = [];
    for (let r = r1; r <= s.r2; r++) {
      const cells = [];
      for (let c = s.c1; c <= s.c2; c++) cells.push(d.cells[XL.key(c, r)] || null);
      rows.push({ r, cells, key: this.value(a.id, a.c, r) });
    }
    rows.sort((x, y) => XL.sortCompare(x.key, y.key, desc) || x.r - y.r);
    rows.forEach((row, i) => {
      const nr = r1 + i;
      row.cells.forEach((cell, j) => {
        const k = XL.key(s.c1 + j, nr);
        if (!cell) { delete d.cells[k]; return; }
        d.cells[k] = { ...cell, v: XL.isFormula(cell.v) ? XL.shiftFormula(cell.v, 0, nr - row.r) : cell.v };
      });
    });
    a.c = s.c1; a.r = r1; a.c2 = s.c2; a.r2 = s.r2;
    this.changed(desc ? 'Absteigend sortiert' : 'Aufsteigend sortiert');
  },
  autoSum(fn = 'SUMME') {
    const a = this.active;
    if (!a || this.locked(a.id)) return;
    const d = this.data(a.id), s = this.sel();
    const isNum = (c, r) => typeof this.value(a.id, c, r) === 'number';
    if (s.c1 === s.c2 && s.r1 === s.r2) {
      // nach oben Zahlen suchen, sonst nach links
      let r = a.r - 1;
      while (r >= 0 && this.raw(d, a.c, r) === '') r--;
      let rng = null;
      if (r >= 0 && isNum(a.c, r)) { let r0 = r; while (r0 - 1 >= 0 && (isNum(a.c, r0 - 1) || this.raw(d, a.c, r0 - 1) === '' && r0 - 2 >= 0 && isNum(a.c, r0 - 2))) r0--; rng = XL.rangeText(a.c, r0, a.c, r); }
      else {
        let c = a.c - 1;
        while (c >= 0 && this.raw(d, c, a.r) === '') c--;
        if (c >= 0 && isNum(c, a.r)) { let c0 = c; while (c0 - 1 >= 0 && isNum(c0 - 1, a.r)) c0--; rng = XL.rangeText(c0, a.r, c, a.r); }
      }
      this.startEdit('edit', `=${fn}(${rng || ''})`);
      if (!rng && this.ed) { const p = this.ed.value.length - 1; this.ed.setSelectionRange(p, p); this.edit.caret = p; }
      return;
    }
    // Bereich: Ergebnis unter jede Spalte (bzw. rechts neben jede Zeile, wenn eine Zeile markiert ist)
    const list = [];
    if (s.r1 === s.r2) {
      const c = s.c2 + 1;
      list.push([c, s.r1, `=${fn}(${XL.rangeText(s.c1, s.r1, s.c2, s.r2)})`]);
    } else {
      let rowOut = s.r2 + 1;
      let lastEmpty = true;
      for (let c = s.c1; c <= s.c2; c++) if (this.raw(d, c, s.r2) !== '') lastEmpty = false;
      if (lastEmpty) rowOut = s.r2;
      for (let c = s.c1; c <= s.c2; c++) {
        let any = false;
        for (let r = s.r1; r < rowOut; r++) if (isNum(c, r)) any = true;
        if (any) list.push([c, rowOut, `=${fn}(${XL.rangeText(c, s.r1, c, rowOut - 1)})`]);
      }
    }
    if (!list.length) { UI.toast('Keine Zahlen in der Auswahl'); return; }
    this.setCells(a.id, list, 'AutoSumme');
  },

  /* ---------------------------------------------------------- Zwischenablage */
  onCopy(e, cut) {
    const a = this.active;
    if (!a || this.edit) return;
    e.preventDefault();
    const d = this.data(a.id), s = this.sel();
    const tsv = [], cells = [];
    let html = '<table style="border-collapse:collapse">';
    for (let r = s.r1; r <= s.r2; r++) {
      const row = [], crow = [];
      html += '<tr>';
      for (let c = s.c1; c <= s.c2; c++) {
        const disp = this.display(a.id, c, r), cell = d.cells[XL.key(c, r)];
        const t = disp.t;
        row.push(/[\t\n"]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t);
        crow.push(cell ? JSON.parse(JSON.stringify(cell)) : null);
        const f = (cell && cell.f) || {};
        html += `<td style="border:1px solid #c8c6c4;padding:2px 6px;${this.cellStyle(f, d.head && r === 0, false, true)}${disp.al === 'r' || f.al === 'r' ? 'text-align:right;' : f.al === 'c' || disp.al === 'c' ? 'text-align:center;' : ''}">${escapeHtml(t)}</td>`;
      }
      html += '</tr>';
      tsv.push(row.join('\t'));
      cells.push(crow);
    }
    html += '</table>';
    const text = tsv.join('\r\n');
    e.clipboardData.setData('text/plain', text);
    e.clipboardData.setData('text/html', html);
    this.clip = { text, id: a.id, page: this.curPid(), name: d.name, ...s, cells, cut, done: false };
    UI.toast(cut ? 'Ausgeschnitten – Zielzelle wählen und Strg+V' : `${(s.r2 - s.r1 + 1) * (s.c2 - s.c1 + 1)} Zelle(n) kopiert`);
    this.refreshUi();
  },
  onPaste(e) {
    const a = this.active;
    if (!a || this.edit) return;
    e.preventDefault();
    if (this.locked(a.id)) return;
    const dt = e.clipboardData;
    const text = (dt.getData('text/plain') || '');
    const html = dt.getData('text/html') || '';
    const norm = (t) => t.replace(/\r\n?/g, '\n').replace(/\n$/, '');
    if (this.clip && norm(text) === norm(this.clip.text)) { this.pasteInternal(); return; }
    let grid = null;
    if (/<table/i.test(html)) {
      const doc = new DOMParser().parseFromString(html, 'text/html');
      const t = doc.querySelector('table');
      grid = [...t.rows].map(tr => [...tr.cells].map(td => td.innerText !== undefined && td.innerText !== '' ? td.innerText.replace(/ /g, ' ').trim() : td.textContent.replace(/ /g, ' ').trim()));
    } else if (text) grid = this.parseTsv(text);
    if (!grid || !grid.length) return;
    this.pasteGrid(a.id, grid.map(r => r.map(v => ({ v }))), 'Eingefügt');
  },
  parseTsv(text) {
    const rows = [];
    let row = [], f = '', q = false;
    const t = text.replace(/\r\n?/g, '\n');
    const sep = t.includes('\t') ? '\t' : (/;/.test(t) && !/,/.test(t.split('\n')[0]) ? ';' : t.split('\n')[0].includes(';') ? ';' : '\t');
    for (let i = 0; i < t.length; i++) {
      const ch = t[i];
      if (q) { if (ch === '"') { if (t[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += ch; continue; }
      if (ch === '"' && f === '') { q = true; continue; }
      if (ch === sep) { row.push(f); f = ''; continue; }
      if (ch === '\n') { row.push(f); rows.push(row); row = []; f = ''; continue; }
      f += ch;
    }
    if (f !== '' || row.length) { row.push(f); rows.push(row); }
    return rows;
  },
  /* grid: [[{ v, f? }]] ab der aktiven Zelle einsetzen; 1×1 in eine grössere Auswahl = alle füllen */
  pasteGrid(id, grid, label, shift) {
    const d = this.data(id), s = this.sel();
    const gh = grid.length, gw = Math.max(...grid.map(r => r.length));
    let h = gh, w = gw;
    const selH = s.r2 - s.r1 + 1, selW = s.c2 - s.c1 + 1;
    if (selH % gh === 0 && selW % gw === 0 && (selH > gh || selW > gw)) { h = selH; w = selW; }
    for (let i = 0; i < h; i++) for (let j = 0; j < w; j++) {
      const src = grid[i % gh][j % gw];
      const c = s.c1 + j, r = s.r1 + i;
      const k = XL.key(c, r);
      if (!src) { delete d.cells[k]; continue; }
      let v = src.v == null ? '' : String(src.v);
      if (shift && XL.isFormula(v)) v = XL.shiftFormula(v, c - shift.c - (j % gw), r - shift.r - (i % gh));
      if (src.f) { d.cells[k] = { v, f: { ...src.f } }; if (!v && !Object.keys(src.f).length) delete d.cells[k]; }
      else { const old = d.cells[k]; if (old) { delete old.f; } this.writeRaw(d, c, r, v); }
      if (r >= d.nrows) d.nrows = r + 1;
      if (c >= d.ncols) { d.ncols = c + 1; XL.normSheet(d); }
    }
    this.active.c2 = s.c1 + w - 1; this.active.r2 = s.r1 + h - 1;
    this.markDirty(id);
    this.changed(label);
  },
  pasteInternal() {
    const c = this.clip, a = this.active, pid = this.curPid();
    const same = !c.page || c.page === pid;
    let grid = c.cells.map(row => row.map(cell => cell ? JSON.parse(JSON.stringify(cell)) : null));
    // von einer anderen Seite: Bezüge auf andere Tabellen der Quellseite bekommen deren Seite davor (wie Excel zwischen Mappen)
    if (!same) grid = grid.map(row => row.map(cell => cell && XL.isFormula(cell.v) ? { ...cell, v: this.qualify(cell.v, c.page, c.name) } : cell));
    const sp = same ? Canvas.page : Store.pages[c.page];
    const srcBox = sp && sp.boxes.find(x => x.id === c.id && x.sheet);
    if (c.cut && srcBox) {
      // Ausschneiden: Formeln unverändert verschieben, Quelle leeren
      const sd = srcBox.sheet;
      for (let r = c.r1; r <= c.r2; r++) for (let cc = c.c1; cc <= c.c2; cc++) delete sd.cells[XL.key(cc, r)];
      this.markDirty(c.id, { c1: c.c1, r1: c.r1, c2: c.c2, r2: c.r2 }, c.page || pid);
      if (!same) Hist.touchPage(c.page);
      this.pasteGrid(a.id, grid, 'Verschoben');
      this.clip = null;
      return;
    }
    this.pasteGrid(a.id, grid, 'Eingefügt', { c: c.c1, r: c.r1 });
  },
  /* Formel von Seite srcPid (Tabelle srcName) auf diese Seite bringen: Tabelle2!A1 → [Quellseite]Tabelle2!A1 */
  qualify(raw, srcPid, srcName) {
    if (!/!/.test(raw)) return raw;
    const pid = this.curPid();
    return XL.rewrite(raw, (t) => {
      if (t.page || t.sheet == null || t.sheet.toLowerCase() === String(srcName).toLowerCase()) return undefined;
      const path = this.pathFor(srcPid, pid, t.sheet);
      if (path == null) return undefined;
      t.page = path;
      return t;
    });
  },
  /* Verknüpfung einfügen (wie Excel „Inhalte einfügen → Verknüpfen“): Formeln, die auf die kopierten Zellen zeigen –
   * auch auf einer anderen Seite. Eine Zelle: absolut ($A$1), ein Bereich: Zelle für Zelle */
  pasteLink() {
    const c = this.clip, a = this.active;
    if (!c || !a || this.locked(a.id)) return;
    const pid = this.curPid(), one = c.c1 === c.c2 && c.r1 === c.r2;
    const grid = [];
    for (let r = c.r1; r <= c.r2; r++) {
      const row = [];
      for (let cc = c.c1; cc <= c.c2; cc++) {
        const t = this.refText(c.page || pid, c.id, pid, a.id, cc, r, cc, r, one);
        if (t == null) { UI.toast('Die Quelltabelle gibt es nicht mehr (oder ihre Seite hat keinen Titel)'); return; }
        row.push({ v: '=' + t });
      }
      grid.push(row);
    }
    this.pasteGrid(a.id, grid, 'Verknüpfung eingefügt');
  },
  /* Bezug der Auswahl als Text kopieren – zum Einsetzen in Formeln auf anderen Seiten, z.B. [Rezepte]Tabelle1!B2:B9 */
  async copyRef() {
    const a = this.active;
    if (!a) return;
    const s = this.sel(), pid = this.curPid();
    const t = this.refText(pid, a.id, null, null, s.c1, s.r1, s.c2, s.r2, false);
    if (t == null) { UI.toast('Die Seite braucht einen Titel, damit andere Seiten darauf verweisen können'); return; }
    try { await navigator.clipboard.writeText(t); UI.toast(`Bezug kopiert: ${t} – in einer Formel mit Strg+V einfügen`); }
    catch (e) { UI.prompt('Bezug kopieren', t, { text: 'Markieren und mit Strg+C kopieren:' }); }
    this.focusKb();
  },

  /* ---------------------------------------------------------- Kontextmenü */
  contextMenu(ev, kind) {
    const a = this.active;
    if (!a) return;
    const ro = this.locked(a.id), s = this.sel();
    const nr = s.r2 - s.r1 + 1, nc = s.c2 - s.c1 + 1;
    const items = [
      { label: 'Ausschneiden', icon: 'cut', key: 'Strg+X', disabled: ro, action: () => { this.focusKb(); document.execCommand('cut'); } },
      { label: 'Kopieren', icon: 'copy', key: 'Strg+C', action: () => { this.focusKb(); document.execCommand('copy'); } },
      { label: 'Einfügen', icon: 'paste', key: 'Strg+V', disabled: ro, action: () => this.pasteButton() },
      { label: 'Verknüpfung einfügen', icon: 'link', disabled: ro || !this.clip || this.clip.cut, title: 'Formeln, die auf die kopierten Zellen zeigen – Werte bleiben aktuell (auch von anderen Seiten)', action: () => this.pasteLink() },
      { label: 'Bezug kopieren', icon: 'copy', title: 'z.B. [Seite]Tabelle1!A1 – für Formeln auf anderen Seiten', action: () => this.copyRef() },
      '-',
      kind !== 'col' ? { label: nr > 1 ? `${nr} Zeilen oberhalb einfügen` : 'Zeile oberhalb einfügen', icon: 'rowAbove', disabled: ro, action: () => this.insertRows(s.r1, nr) } : null,
      kind !== 'col' ? { label: 'Zeile unterhalb einfügen', icon: 'rowBelow', disabled: ro, action: () => this.insertRows(s.r2 + 1, nr) } : null,
      kind !== 'row' ? { label: nc > 1 ? `${nc} Spalten links einfügen` : 'Spalte links einfügen', icon: 'colLeft', disabled: ro, action: () => this.insertCols(s.c1, nc) } : null,
      kind !== 'row' ? { label: 'Spalte rechts einfügen', icon: 'colRight', disabled: ro, action: () => this.insertCols(s.c2 + 1, nc) } : null,
      kind !== 'col' ? { label: nr > 1 ? `${nr} Zeilen löschen` : 'Zeile löschen', icon: 'trash', disabled: ro, action: () => this.deleteRows(s.r1, nr) } : null,
      kind !== 'row' ? { label: nc > 1 ? `${nc} Spalten löschen` : 'Spalte löschen', icon: 'trash', disabled: ro, action: () => this.deleteCols(s.c1, nc) } : null,
      kind === 'row' ? { label: (nr > 1 ? 'Zeilen' : 'Zeile') + ' nach oben verschieben', key: 'Alt+Umschalt+↑', disabled: ro || s.r1 === 0, action: () => this.nudge('up') } : null,
      kind === 'row' ? { label: (nr > 1 ? 'Zeilen' : 'Zeile') + ' nach unten verschieben', key: 'Alt+Umschalt+↓', disabled: ro || s.r2 >= this.data(a.id).nrows - 1, action: () => this.nudge('down') } : null,
      kind === 'col' ? { label: (nc > 1 ? 'Spalten' : 'Spalte') + ' nach links verschieben', key: 'Alt+Umschalt+←', disabled: ro || s.c1 === 0, action: () => this.nudge('left') } : null,
      kind === 'col' ? { label: (nc > 1 ? 'Spalten' : 'Spalte') + ' nach rechts verschieben', key: 'Alt+Umschalt+→', disabled: ro || s.c2 >= this.data(a.id).ncols - 1, action: () => this.nudge('right') } : null,
      '-',
      { label: 'Inhalte löschen', icon: 'eraser', key: 'Entf', disabled: ro, action: () => this.clear('v') },
      { label: 'Formate löschen', icon: 'clearFormat', disabled: ro, action: () => this.clear('f') },
      '-',
      { label: 'Aufsteigend sortieren (A → Z)', icon: 'sortAsc', disabled: ro, action: () => this.sort(false) },
      { label: 'Absteigend sortieren (Z → A)', icon: 'sortDesc', disabled: ro, action: () => this.sort(true) },
      '-',
      { label: 'Diagramm aus Auswahl …', icon: 'chart', disabled: ro, action: () => Chart.insertFromSheet() },
      { label: 'Funktion einfügen …', icon: 'formula', disabled: ro, action: () => this.functionDialog() },
      kind === 'col' ? { label: 'Spaltenbreite automatisch', icon: 'sameWidth', disabled: ro, action: () => { for (let c = s.c1; c <= s.c2; c++) this.autofit(a.id, c); } } : null,
    ];
    if (typeof OfficeXT !== 'undefined' && OfficeXT.on(a.id)) items.push(...OfficeXT.ctxItems(kind));   // 1.72: Notiz, Zellen formatieren, aus-/einblenden
    UI.menu(items, ev.clientX, ev.clientY);
  },
  async pasteButton() {
    try {
      const items = await navigator.clipboard.read();
      let html = '', text = '';
      for (const it of items) for (const type of it.types) {
        if (type === 'text/html' && !html) html = await (await it.getType(type)).text();
        else if (type === 'text/plain' && !text) text = await (await it.getType(type)).text();
      }
      this.onPaste({ preventDefault() {}, clipboardData: { getData: (t) => t === 'text/html' ? html : t === 'text/plain' ? text : '' } });
    } catch (err) { UI.toast('Bitte Strg+V verwenden (Zugriff auf die Zwischenablage wurde nicht erlaubt)'); }
    this.focusKb();
  },

  /* ---------------------------------------------------------- Funktion einfügen (fx) */
  functionDialog(cat0) {
    const a = this.active;
    if (!a || this.locked(a.id)) return;
    const restore = () => this.focusKb();
    UI.dialog((dlg, close) => {
      dlg.classList.add('xl-fdlg');
      dlg.append(el('h2', { text: 'Funktion einfügen' }));
      const q = el('input', { type: 'text', class: 'xl-fq', placeholder: 'Suchen: z.B. Summe, Datum, verweis …', autofocus: true });
      const cats = el('div', { class: 'xl-fcats' });
      const list = el('div', { class: 'xl-flist' });
      const info = el('div', { class: 'xl-finfo' });
      let cat = cat0 && XL.CATS.includes(cat0) ? cat0 : 'Alle', pick = null;
      const draw = () => {
        const s = q.value.trim().toUpperCase();
        list.innerHTML = '';
        const fs = XL.FN_INFO.filter(f => (cat === 'Alle' || f.cat === cat) && (!s || f.de.includes(s) || (f.en || '').includes(s) || f.desc.toUpperCase().includes(s)));
        for (const f of fs) {
          const it = el('div', { class: 'xl-fi' + (pick === f ? ' on' : '') }, el('b', { text: f.de }), el('span', { text: f.desc }));
          it.addEventListener('click', () => { pick = f; draw(); });
          it.addEventListener('dblclick', () => go(f));
          list.append(it);
        }
        if (!pick && fs.length) pick = fs[0];
        info.innerHTML = pick ? `<b>${escapeHtml(pick.de)}(${escapeHtml(pick.sig)})</b><br>${escapeHtml(pick.desc)}${pick.en && pick.en !== pick.de ? `<br><span class="xl-muted">Englisch: ${escapeHtml(pick.en)}</span>` : ''}` : '';
      };
      for (const c of ['Alle', ...XL.CATS]) {
        const b = el('button', { class: 'chem-chip' + (c === cat ? ' on' : ''), text: c, type: 'button' });
        b.addEventListener('click', () => { cat = c; pick = null; cats.querySelectorAll('.chem-chip').forEach(x => x.classList.toggle('on', x === b)); draw(); });
        cats.append(b);
      }
      const go = (f) => { close(true); setTimeout(() => { const ed = this.edit; if (ed && XL.isFormula(ed.text)) { const t = ed.inBar ? this.barIn : this.ed; const p = t ? t.selectionStart : ed.text.length; ed.text = ed.text.slice(0, p) + f.de + '(' + ed.text.slice(p); if (t) t.value = ed.text; this.syncEditor(ed.inBar ? 'bar' : 'cell'); if (t) { t.focus(); t.setSelectionRange(p + f.de.length + 1, p + f.de.length + 1); } } else { this.startEdit('edit', '=' + f.de + '('); } $('#sb-hint').textContent = `${f.de}(${f.sig}) – Bereich mit der Maus markieren oder eintippen, Enter = fertig`; }, 30); };
      q.addEventListener('input', () => { pick = null; draw(); });
      q.addEventListener('keydown', (e) => { if (e.key === 'Enter' && pick) { e.preventDefault(); go(pick); } });
      dlg.append(q, cats, list, info, el('div', { class: 'dlg-btns' },
        el('button', { class: 'btn', text: 'Abbrechen', onclick: () => close(null) }),
        el('button', { class: 'btn primary', text: 'Einfügen', onclick: () => pick && go(pick) })));
      draw();
    }, { wide: true }).then((v) => { if (!v) restore(); });
  },

  /* ---------------------------------------------------------- CSV */
  exportCsv() {
    const a = this.active;
    if (!a) return;
    const d = this.data(a.id), u = this.usedRange(a.id);
    const lines = [];
    for (let r = 0; r <= u.r2; r++) {
      const row = [];
      for (let c = 0; c <= u.c2; c++) { const t = this.display(a.id, c, r).t; row.push(/[;"\n]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t); }
      lines.push(row.join(';'));
    }
    const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const link = el('a', { href: URL.createObjectURL(blob), download: (d.name || 'Tabelle').replace(/[<>:"/\\|?*]+/g, '_') + '.csv' });
    document.body.append(link); link.click();
    setTimeout(() => { URL.revokeObjectURL(link.href); link.remove(); }, 2000);
    UI.toast('Als CSV gespeichert (Ordner „Downloads“) – öffnet sich in Excel');
  },
  async importCsv(file, pt) {
    let text = await file.text();
    text = text.replace(/^﻿/, '');
    const grid = this.parseTsv(text).filter(r => r.some(x => x !== ''));
    if (!grid.length) { UI.toast('Die Datei enthält keine Daten'); return; }
    this.fromGrid(grid, pt || Canvas.viewCenter(), file.name.replace(/\.(csv|tsv|txt)$/i, ''));
  },
  /* neue Tabelle aus Rohdaten (Liste von Zeilen mit Texten) */
  fromGrid(grid, pt, name) {
    const nrows = grid.length, ncols = Math.max(...grid.map(r => r.length));
    const cells = {};
    const d0 = XL.normSheet({ cells: {}, nrows, ncols });
    grid.forEach((row, r) => row.forEach((v, c) => { if (v !== '' && v != null) this.writeRaw(d0, c, r, String(v)); }));
    Object.assign(cells, d0.cells);
    const head = grid.length > 1 && grid[0].every(v => typeof XL.parseInput(v).v === 'string' || v === '') && grid[1].some(v => typeof XL.parseInput(v).v === 'number');
    const cols = [];
    for (let c = 0; c < ncols; c++) { let w = 6; for (const row of grid.slice(0, 200)) w = Math.max(w, String(row[c] ?? '').length); cols.push(clamp(Math.round(w * 7.5 + 16), 56, 260)); }
    return this.create(pt, { name: name ? this.uniqueName(name.slice(0, 40)) : undefined, cells, nrows, ncols, cols, head, label: 'Tabelle aus Daten' });
  },

  /* einfache Tabelle in einem Textfeld (z.B. aus OneNote) in eine Rechentabelle umwandeln */
  fromHtmlTable(boxId) {
    const b = Canvas.box(boxId);
    if (!b || Canvas.isLocked(b)) return;
    const tpl = document.createElement('template');
    tpl.innerHTML = b.html;
    const t = tpl.content.querySelector('table');
    if (!t) return;
    const cellText = (td) => { const c = td.cloneNode(true); c.querySelectorAll('br').forEach(x => x.replaceWith('\n')); c.querySelectorAll('div,p,li').forEach(x => x.append('\n')); return c.textContent.replace(/\u00a0/g, ' ').replace(/\n+$/, '').trim(); };
    const grid = [...t.rows].map(tr => [...tr.cells].map(cellText));
    const cols = t.rows[0] ? [...t.rows[0].cells].map(td => parseFloat(td.style.width) || 0) : [];
    t.remove();
    const rest = tpl.innerHTML;
    const at = { x: b.x, y: b.y };
    if (isEmptyHtml(rest) && !b.images.length) Canvas.page.boxes = Canvas.page.boxes.filter(x => x.id !== b.id);
    else { b.html = rest; at.y = b.y + (Canvas.rects.get(b.id) || { h: 60 }).h + 16; }
    const nb = this.fromGrid(grid, at, 'Tabelle1');
    if (nb && cols.length === nb.sheet.ncols && cols.every(w => w > 10)) { nb.sheet.cols = cols.map(w => Math.round(w)); this.refresh(); }
    UI.toast('In eine Rechentabelle umgewandelt – Formeln mit = eingeben');
  },

  /* ---------------------------------------------------------- Suchen */
  texts(b) {
    const d = b.sheet;
    const out = [];
    for (const cell of Object.values(d.cells)) if (cell.v !== '') out.push(XL.isFormula(cell.v) ? cell.v : cell.v);
    return out.join(' ');
  },
};
