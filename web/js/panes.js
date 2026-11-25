'use strict';
/* Mehrere Tabs und geteilte Bereiche (seit 1.35, wie Obsidian)
 *
 * Store.ui.panes = { root, active }: ein Baum aus Bereichen und Teilungen
 *   Bereich: { t: 'pane', id, tabs: [Seiten-ID | null, …], cur }     cur = Index des sichtbaren Tabs
 *   Teilung: { t: 'split', dir: 'h' | 'v', kids: [Knoten, …], sizes: [Gewichte] }   h = nebeneinander, v = untereinander
 *
 * Es gibt nur EINE echte Zeichenfläche (Canvas mit #page-frame). Sie hängt im aktiven Bereich. Die anderen Bereiche
 * zeigen eine Momentaufnahme ihrer Seite: eine Kopie des DOM von #page-frame in einem Shadow-Root – dort stören die
 * gleichen IDs nicht, und die App-Styles gelten als gemeinsames Stylesheet (Regeln für body/:root gelten dort für
 * .pv-root, das die Klassen und das Design von <body> übernimmt). Klick/Tippen auf einen anderen Bereich macht ihn
 * aktiv: vom bisherigen wird die Momentaufnahme gemacht, die Zeichenfläche wandert hinüber und lädt dessen Seite.
 * Seiten, die noch nie in der Zeichenfläche waren (Programmstart) oder die sich geändert haben, werden in einer
 * Ruhepause kurz in die Zeichenfläche geladen, kopiert und sofort zurückgetauscht (synchron, also ohne sichtbares Bild).
 *
 * Schmale Fenster/Handy: nur der aktive Bereich ist sichtbar; seine Tableiste zeigt die Tabs aller Bereiche.
 *
 * Seit 1.36: Der Seitentitel steht nur noch im Tab (der grosse Titel über der Seite ist ausgeblendet, solange eine
 * Tableiste da ist – Einstellungen → Allgemein → „Seitentitel über der Seite“ holt ihn zurück). Doppelklick auf den
 * Tab = umbenennen. Die Tableiste lässt sich wie das Menüband einklappen (Store.ui.tabsMin): übrig bleibt ein Strich
 * mit einem Pfeilchen; seit 1.40 klappt nur dieses Pfeilchen sie wieder auf (auch im Vollbild).
 *
 * Seit 1.37 – Vollbild mit allen Tabs: F11 zeigt jeden offenen Tab (aller Bereiche) als Kachel in einem Raster, oben
 * rechts an jeder Kachel ein Pfeil ⤢ = nur diesen Tab im Vollbild; dort führt ⤡ zurück zur Übersicht. Das Raster ist
 * ein eigener Baum (this._fs, gleiche Darstellung wie geteilte Bereiche), Store.ui.panes bleibt unberührt; beim
 * Verlassen werden die Seiten der Kacheln und der aktive Tab in die echten Tabs zurückgeschrieben.
 * Mausrad über einer Vorschau verschiebt sie (Strg = Zoom), ohne den Bereich zu wechseln.
 *
 * Seit 1.49 – schwebende Fenster (wie Fenster auf dem Windows-Desktop): ein Tab lässt sich lösen (Tab auf die Mitte
 * einer Seite ziehen, Rechtsklick → „Als Fenster lösen“). Store.ui.panes.floats = [{ pane, x, y, w, h }] (Lage und
 * Grösse als Anteil der Fläche 0…1, so passt es sich jeder Fenstergrösse an). Ein Fenster ist ein ganz normaler
 * Bereich (eigene Tableiste, Vorschau, die Zeichenfläche wandert hinein, wenn es aktiv ist) – nur frei verschiebbar
 * (Tableiste ziehen), in der Grösse änderbar (Ränder/Ecke), mit „Andocken“ (zurück in die Tableiste) und Schliessen.
 * Beliebig viele. Auch im Vollbild: eine Kachel an ihrer Kopfzeile wegziehen = frei verschiebbares Fenster.
 * Handy/schmal: das aktive Fenster füllt die Fläche.
 */
const Panes = {
  shots: new Map(),     // Bereich-ID → { pid, frame, view, dirty }
  els: new Map(),       // Bereich-ID → { wrap, strip, body, host, pv }
  queue: new Set(),     // Bereiche, deren Vorschau (neu) gemacht werden muss
  inactivePids: new Set(),
  narrow: false,
  _inner: false,        // openPage kommt von hier (Tabs nicht umschreiben)
  _forceNew: false,     // nächstes openPage in einem neuen Tab

  // im Vollbild mit mehreren Tabs (1.37) gilt ein eigenes, nur vorübergehendes Raster (wird nicht gespeichert)
  get S() { return this._fs || (Store.ui && Store.ui.panes); },

  /* ------------------------------------------------------------ Baum */
  norm() {
    const u = Store.ui;
    let S = u.panes;
    const seen = new Set();
    const fix = (n) => {
      if (!n || typeof n !== 'object') return null;
      if (n.t === 'split') {
        const kids = [], sizes = [];
        (Array.isArray(n.kids) ? n.kids : []).forEach((k, i) => { const f = fix(k); if (f) { kids.push(f); sizes.push(Math.max(0.05, +(n.sizes || [])[i] || 1)); } });
        if (!kids.length) return null;
        if (kids.length === 1) return kids[0];
        return { t: 'split', dir: n.dir === 'v' ? 'v' : 'h', kids, sizes };
      }
      let id = typeof n.id === 'string' && n.id ? n.id : uid('pn');
      if (seen.has(id)) id = uid('pn');
      seen.add(id);
      const tabs = (Array.isArray(n.tabs) ? n.tabs : []).filter(t => t === null || (typeof t === 'string' && Store.has(t)));
      if (!tabs.length) return null;
      return { t: 'pane', id, tabs, cur: clamp(Math.round(+n.cur || 0), 0, tabs.length - 1) };
    };
    const root = S && fix(S.root);
    const fl = (S && Array.isArray(S.floats) ? S.floats : []).map(f => {
      const pane = f && fix(f.pane);
      if (!pane || pane.t !== 'pane') return null;
      const n = (v, d, a, b) => clamp(isFinite(+v) ? +v : d, a, b);
      return { pane, x: n(f.x, 0.1, -0.5, 0.95), y: n(f.y, 0.1, 0, 0.95), w: n(f.w, 0.5, 0.1, 1), h: n(f.h, 0.6, 0.1, 1) };
    }).filter(Boolean);
    if (!root) S = { root: { t: 'pane', id: uid('pn'), tabs: [u.currentPage && Store.has(u.currentPage) ? u.currentPage : null], cur: 0 }, active: null, floats: fl };
    else S = { root, active: S.active, floats: fl };
    const all = [...this.leaves(S.root), ...S.floats.map(f => f.pane)];   // Fenster (1.49) zählen mit
    if (!all.some(p => p.id === S.active)) S.active = all[0].id;
    u.panes = S;
    // die aktive Seite gehört in den aktiven Bereich
    const a = all.find(p => p.id === S.active), cp = u.currentPage;
    if (cp && Store.has(cp) && a.tabs[a.cur] !== cp) { const i = a.tabs.indexOf(cp); if (i >= 0) a.cur = i; else a.tabs[a.cur] = cp; }
    return S;
  },
  /* alle Bereiche: ohne Argument der Baum UND die schwebenden Fenster, mit Knoten nur dieser Teilbaum */
  leaves(n, out = []) {
    if (n === undefined) {
      const S = this.S;
      if (!S) return out;
      this.leaves(S.root, out);
      for (const f of S.floats || []) out.push(f.pane);
      return out;
    }
    if (!n) return out;
    if (n.t === 'pane') out.push(n); else for (const k of n.kids) this.leaves(k, out);
    return out;
  },
  find(id) { return this.leaves().find(p => p.id === id) || null; },
  parentOf(node, n = this.S.root, par = null) {
    if (n === node) return par;
    if (n.t === 'split') for (const k of n.kids) { const r = this.parentOf(node, k, n); if (r !== undefined) return r; }
    return undefined;
  },
  active() { return this.S ? this.find(this.S.active) : null; },
  floatOf(id) { const S = this.S; return S && S.floats ? S.floats.find(f => f.pane.id === id) || null : null; },
  treeLeaves() { return this.S ? this.leaves(this.S.root) : []; },
  count() { return this.leaves().length; },
  tabCount() { return this.leaves().reduce((a, p) => a + p.tabs.length, 0); },
  /* Knoten old durch nw ersetzen (Wurzel oder in der Teilung darüber) */
  replace(old, nw) {
    const par = this.parentOf(old);
    if (!par) this.S.root = nw;
    else par.kids[par.kids.indexOf(old)] = nw;
  },

  /* ------------------------------------------------------------ Start */
  init() {
    this.box = $('#panes');
    this.frame = $('#page-frame');
    this.norm();
    // Tableiste: Klicks, Mittelklick, Kontextmenü, Ziehen (Maus) – alles über Delegation
    const box = this.box;
    box.addEventListener('click', (e) => this.onClick(e));
    box.addEventListener('auxclick', (e) => { const t = e.target.closest('.ptab'); if (t && e.button === 1) { e.preventDefault(); this.closeTab(t.dataset.pane, +t.dataset.i); } });
    box.addEventListener('mousedown', (e) => { if (e.button === 1 && e.target.closest('.ptab')) e.preventDefault(); });   // kein Auto-Scroll beim Mittelklick
    box.addEventListener('contextmenu', (e) => this.onMenu(e));
    box.addEventListener('pointerdown', (e) => this.onDown(e));
    // + (neue Seite): länger darüber halten = Auswahl Word / Excel / PowerPoint (1.65)
    box.addEventListener('pointerover', (e) => {
      const add = e.target.closest('.pt-add');
      if (!add || e.pointerType === 'touch' || this._hoverAdd === add) return;
      this._hoverAdd = add;
      clearTimeout(this._hoverT);
      this._hoverT = setTimeout(() => { if (this._hoverAdd === add && add.isConnected && add.matches(':hover')) this.typeMenu(add, add.dataset.pane); }, 450);
    });
    box.addEventListener('pointerout', (e) => { const add = e.target.closest('.pt-add'); if (add && !add.contains(e.relatedTarget)) { this._hoverAdd = null; clearTimeout(this._hoverT); } });
    box.addEventListener('dblclick', (e) => {
      const tab = e.target.closest('.ptab');
      if (tab && !e.target.closest('.pt-x, .pt-in')) { e.preventDefault(); this.activate(tab.dataset.pane, +tab.dataset.i); this.rename(); return; }
      // Doppelklick auf die freie Fläche der Tableiste = ein-/ausklappen (wie ein Register beim Menüband)
      if (!tab && e.target.closest('.ptabs') && !e.target.closest('button, .pt-in')) this.toggleMin();
    });
    // eingeklappte Tableiste (1.40): aufklappen nur mit dem Pfeilchen (kein Ausfahren mehr, wenn die Maus in die Nähe
    // kommt); das Aufklappen über der Seite (peek) gibt es nur noch kurz zum Umbenennen. Tippen/Klicken daneben → zu
    box.addEventListener('pointerleave', () => { if (this._peek) this.peekOffSoon(); });
    addEventListener('pointerdown', (e) => {
      if (!this._peek || this._renaming) return;
      if (e.target.closest && e.target.closest('.pane.peek .ptabs, .popup')) return;
      this.peek(null);
    }, true);
    // Ruhepausen erkennen: solange ein Zeiger gedrückt ist, wird keine Vorschau getauscht
    addEventListener('pointerdown', () => { this._down = true; }, true);
    addEventListener('pointerup', () => { this._down = false; this.pumpSoon(); }, true);
    addEventListener('pointercancel', () => { this._down = false; }, true);
    // Design/Layout-Klassen von <body> auch in den Vorschauen (Shadow-Root)
    new MutationObserver(() => {
      for (const r of this.els.values()) if (r.pv) this.syncRoot(r.pv);
      this.checkNarrow();
      // anderes Design: lesbare Schriftfarben (Contrast) stehen in der Kopie fest → neu aufnehmen
      const th = document.body.dataset.theme;
      if (this._theme && th !== this._theme && !(typeof Export !== 'undefined' && Export.rendering)) this.refreshAll();
      if (!(typeof Export !== 'undefined' && Export.rendering)) this._theme = th;
    }).observe(document.body, { attributes: true, attributeFilter: ['class', 'data-theme'] });
    // schmal: nur der aktive Bereich
    new ResizeObserver(() => this.checkNarrow()).observe(box);
    this._theme = document.body.dataset.theme;
    this.checkNarrow(true);
    this.render();
  },
  checkNarrow(silent) {
    const w = this.box.clientWidth;
    // Vollbild: Übersicht aller Tabs (auch auf dem Handy) – nur ein Tab oder ⤢: ein Bereich
    const fs = document.body.classList.contains('fullscreen');
    const n = fs ? !this._fs || !!this._fsSolo : document.body.classList.contains('lay-phone') || (w > 0 && w < 520);
    if (n === this.narrow) return;
    this.narrow = n;
    this.box.classList.toggle('one', n);
    if (silent) return;
    this.renderStrips();
    if (!n) { for (const p of this.leaves()) if (p.id !== this.S.active) this.showShot(p.id); }
  },

  /* ------------------------------------------------------------ Vollbild mit allen Tabs (1.37) */
  fsChanged(on) {
    if (!this.box || !Store.ui || !Store.ui.panes) return;
    if (on) this.enterFs(); else this.exitFs();
  },
  enterFs() {
    if (this._fs) return;
    const R = Store.ui.panes, list = [];
    for (const p of [...this.leaves(R.root), ...(R.floats || []).map(f => f.pane)]) p.tabs.forEach((pid, i) => list.push({ pane: p.id, i, pid, act: p.id === R.active && i === p.cur }));
    if (list.length < 2) { this.checkNarrow(); return; }   // nur ein Tab: Vollbild wie bisher
    if (App.preview) App.endPreview(true);
    this.snap();   // Momentaufnahme der Zeichenfläche für ihre Kachel
    const live = this.shots.get(R.active);
    // Raster: Spalten so, dass die Kacheln etwa 4:3 werden (schmal/hoch: eine Spalte)
    const W = Math.max(1, innerWidth), H = Math.max(1, innerHeight), n = list.length;
    let cols = 1, best = Infinity;
    for (let c = 1; c <= n; c++) { const r = Math.ceil(n / c), q = Math.abs(Math.log((W / c) / (H / r) / 1.33)) + 0.3 * (r * c - n) / c; if (q < best - 1e-9) { best = q; cols = c; } }   // leere Felder im Raster kosten etwas (4 Tabs: 2 × 2 statt 3 + 1)
    const tiles = list.map((t, k) => ({ t: 'pane', id: 'fs' + k + '-' + uid('x'), tabs: [t.pid], cur: 0, from: { pane: t.pane, i: t.i } }));
    const rows = [];
    for (let k = 0; k < n; k += cols) rows.push(tiles.slice(k, k + cols));
    const row = (r) => r.length === 1 ? r[0] : { t: 'split', dir: 'h', kids: r, sizes: r.map(() => 1) };
    const root = rows.length === 1 ? row(rows[0]) : { t: 'split', dir: 'v', kids: rows.map(row), sizes: rows.map(() => 1) };
    const act = tiles[Math.max(0, list.findIndex(t => t.act))];
    // vorhandene Vorschauen übernehmen (Kopie), die übrigen entstehen in Ruhepausen
    tiles.forEach((t, k) => {
      const src = list[k];
      const sh = src.pane === R.active && src.act ? live : (this.shots.get(src.pane) && this.shots.get(src.pane).pid === src.pid ? this.shots.get(src.pane) : null);
      if (sh && sh.frame && t !== act) this.shots.set(t.id, { ...sh, frame: sh.frame.cloneNode(true), dirty: false });
    });
    this._fs = { root, active: act.id, floats: [] };
    this._fsSolo = null;
    document.body.classList.add('fs-grid');
    this.narrow = null;   // neu bestimmen
    this.checkNarrow(true);
    this.render();
  },
  exitFs() {
    const F = this._fs;
    if (!F) { this.checkNarrow(); return; }
    const R = Store.ui.panes, tiles = [...this.leaves(F.root), ...(F.floats || []).map(f => f.pane)], act = tiles.find(t => t.id === F.active);
    const realPanes = () => [...this.leaves(R.root), ...(R.floats || []).map(f => f.pane)];
    // Seiten der Kacheln zurück in die echten Tabs (dort im Vollbild geöffnete Seiten bleiben)
    const byPane = new Map();
    for (const t of tiles) { if (!t.from) continue; if (!byPane.has(t.from.pane)) byPane.set(t.from.pane, []); byPane.get(t.from.pane).push(t); }
    for (const [pid, ts] of byPane) {
      const p = realPanes().find(q => q.id === pid);
      if (!p) continue;
      ts.sort((a, b) => b.from.i - a.from.i);
      for (const t of ts) if (t.from.i < p.tabs.length) p.tabs.splice(t.from.i, 1, ...t.tabs.filter(x => x === null || Store.has(x)));
      if (!p.tabs.length) p.tabs = [null];
    }
    if (act && act.from) {
      const p = realPanes().find(q => q.id === act.from.pane);
      if (p) {
        const before = (byPane.get(p.id) || []).filter(t => t.from.i < act.from.i).reduce((a, t) => a + t.tabs.length - 1, 0);
        R.active = p.id;
        p.cur = clamp(act.from.i + before + act.cur, 0, p.tabs.length - 1);
      }
    }
    for (const t of tiles) { this.shots.delete(t.id); this.queue.delete(t.id); this.els.delete(t.id); }
    this._fs = null; this._fsSolo = null;
    document.body.classList.remove('fs-grid', 'fs-solo');
    this.narrow = null;
    this.checkNarrow(true);
    this.render();
    const a = this.active();
    if (a && a.tabs[a.cur] !== Canvas.pageId) this.openCur(a);
    for (const p of this.leaves()) if (p.id !== Store.ui.panes.active) { const sh = this.shots.get(p.id); if (sh) sh.dirty = true; this.want(p.id); }
    UiState.saveSoon();
  },
  /* ⤢ nur diese Kachel im Vollbild / ⤡ zurück zu allen */
  fsSolo(id) {
    if (!this._fs) return;
    this._fsSolo = id || null;
    document.body.classList.toggle('fs-solo', !!id);
    if (id && id !== this._fs.active) this.activate(id);
    this.narrow = null;
    this.checkNarrow(true);
    this.render();
    if (!id) for (const p of this.leaves()) if (p.id !== this._fs.active) this.showShot(p.id);
  },

  /* ------------------------------------------------------------ Aufbau */
  render() {
    const S = this.S;
    if (!S || !this.box) return;
    // geteilt (mehrere Bereiche oder Fenster): aktiver Bereich dezent markiert (1.59)
    this.box.classList.toggle('pn-multi', this.leaves().length > 1);
    const keep = new Set();
    const build = (n) => {
      if (n.t === 'pane') {
        keep.add(n.id);
        const w = this.paneEl(n);
        // war es ein Fenster (eingegliedert, 1.50): Fenster-Eigenschaften weg
        if (w.classList.contains('pfloat')) {
          w.classList.remove('pfloat', 'pf-moving');
          for (const k of ['left', 'top', 'width', 'height', 'zIndex']) w.style[k] = '';
          for (const h of w.querySelectorAll(':scope > .pf-rs')) h.remove();
        }
        return w;
      }
      const d = el('div', { class: 'psplit ' + n.dir });
      const tot = n.sizes.reduce((a, b) => a + b, 0) || 1;
      n.kids.forEach((k, i) => {
        if (i) d.append(el('div', { class: 'psash ' + n.dir, title: 'Ziehen: Grösse ändern · Doppelklick: gleich gross', dataset: { i: String(i) } }));
        const c = build(k);
        c.style.flex = `${(n.sizes[i] / tot).toFixed(4)} 1 0px`;
        d.append(c);
      });
      d._node = n;
      return d;
    };
    const tree = build(S.root);
    tree.style.flex = '';   // ganz oben: ganze Fläche (Gewicht stammt evtl. noch aus einer Teilung)
    // schwebende Fenster (1.49) über der Fläche, das zuletzt benutzte zuoberst
    const layer = el('div', { class: 'pfloats' });
    (S.floats || []).forEach((f, k) => {
      keep.add(f.pane.id);
      const w = this.paneEl(f.pane);
      w.classList.add('pfloat');
      w.style.flex = '';
      this.placeFloat(w, f, k);
      if (!w.querySelector('.pf-rs')) for (const d of ['e', 's', 'se', 'w', 'sw']) w.append(el('div', { class: 'pf-rs ' + d, dataset: { rs: d } }));
      layer.append(w);
    });
    this.box.replaceChildren(tree, layer);
    for (const id of [...this.els.keys()]) if (!keep.has(id)) { this.els.delete(id); this.shots.delete(id); this.queue.delete(id); }
    this.box.classList.toggle('multi', this.count() > 1);
    this.box.classList.toggle('one', this.narrow);
    this.calcInactive();
    for (const p of this.leaves()) {
      const r = this.els.get(p.id);
      r.wrap.classList.toggle('active', p.id === S.active);
      if (p.id === S.active) { if (this.frame.parentNode !== r.body) r.body.replaceChildren(this.frame); }
      else this.showShot(p.id);
    }
    this.renderStrips();
    Canvas.layoutSoon && Canvas.layoutSoon();
  },
  calcInactive() { this.inactivePids = new Set(this.leaves().filter(p => p.id !== this.S.active).map(p => p.tabs[p.cur]).filter(Boolean)); },
  placeFloat(w, f, k) {
    Object.assign(w.style, { left: (f.x * 100).toFixed(3) + '%', top: (f.y * 100).toFixed(3) + '%', width: (f.w * 100).toFixed(3) + '%', height: (f.h * 100).toFixed(3) + '%', zIndex: String(20 + k) });
  },
  paneEl(p) {
    let r = this.els.get(p.id);
    if (!r) {
      const wrap = el('div', { class: 'pane', dataset: { pane: p.id } });
      const strip = el('div', { class: 'ptabs', role: 'tablist' });
      const body = el('div', { class: 'pane-body' });
      wrap.append(strip, body);
      r = { wrap, strip, body, host: null, pv: null };
      this.els.set(p.id, r);
    }
    r.wrap.dataset.pane = p.id;
    return r.wrap;
  },
  title(pid) {
    if (!pid) return 'Leer';
    const m = Store.meta(pid);
    return (m && m.title) || 'Unbenannte Seite';
  },
  renderStrips() {
    const S = this.S;
    if (!S || !this.box) return;
    const all = this.leaves();
    const multi = all.length > 1;
    for (const p of all) {
      const r = this.els.get(p.id);
      if (!r) continue;
      const act = p.id === S.active;
      const list = this.narrow ? (act ? all : []) : [p];
      const sc = el('div', { class: 'pt-scroll' });
      list.forEach((q, qi) => {
        if (qi) sc.append(el('span', { class: 'pt-gap', 'aria-hidden': 'true' }));
        q.tabs.forEach((pid, i) => {
          const sec = pid ? Tree.groupOfPage(pid) : null;
          const on = i === q.cur, here = q.id === S.active;
          const t = el('div', { class: 'ptab' + (on ? ' on' : '') + (on && here ? ' act' : ''), role: 'tab', dataset: { pane: q.id, i: String(i) }, title: this.tip(pid, sec) });
          t.setAttribute('aria-selected', on ? 'true' : 'false');
          if (sec && sec.color) t.style.setProperty('--tc', sec.color);
          t.append(el('span', { class: 'pt-dot' }), el('span', { class: 'pt-t', text: this.title(pid) }));
          if (q.tabs.length > 1 || multi) t.append(el('button', { class: 'pt-x', type: 'button', title: 'Tab schliessen', html: icon('x', 13), tabindex: '-1' }));
          sc.append(t);
        });
      });
      const add = el('button', { class: 'pt-btn pt-add', type: 'button', title: 'Neue Seite (in neuem Tab)\nDarüber halten: Word, Excel oder PowerPoint\nRechtsklick: Seitentypen, diese Seite in neuem Tab, zuletzt geöffnete …', html: icon('plus', 16), dataset: { pane: p.id } });
      const more = el('button', { class: 'pt-btn pt-more', type: 'button', title: 'Teilen, Tabs schliessen …', html: icon('moreV', 16), dataset: { pane: p.id } });
      const min = !!Store.ui.tabsMin;
      const fold = el('button', { class: 'pt-btn pt-fold', type: 'button', title: min ? 'Tableiste aufklappen' : 'Tableiste einklappen (wieder aufklappen mit dem Pfeilchen am Strich)', html: icon(min ? 'chevDown' : 'chevUp', 15), dataset: { pane: p.id } });
      // eingeklappt: nur ein Strich mit Pfeilchen
      const grip = el('button', { class: 'pt-grip', type: 'button', title: 'Tableiste aufklappen', html: icon('chevDown', 12), dataset: { pane: p.id }, tabindex: '-1' });
      if (this._renaming && this._renaming.pane === p.id) continue;   // Tab wird gerade umbenannt
      // schwebendes Fenster (1.49): Tableiste = Titelleiste; rechts Maximieren, Andocken, Schliessen
      if (this.floatOf(p.id)) {
        const f = this.floatOf(p.id);
        const btn = (cls, ic, title) => el('button', { class: 'pt-btn ' + cls, type: 'button', html: icon(ic, 15), title, dataset: { pane: p.id } });
        r.strip.replaceChildren(sc, this._fs ? el('span') : add, btn('pf-max', f.max ? 'restoreTiles' : 'maximize', f.max ? 'Wiederherstellen' : 'Maximieren'),
          btn('pf-dock', 'tabs', this._fs ? 'Zurück ins Raster' : 'Andocken – zurück in die Tableiste'), this._fs ? el('span') : btn('pf-close', 'x', 'Fenster schliessen'));
        continue;
      }
      if (this._fs) {   // Vollbild mit allen Tabs: rechts oben ⤢ (nur dieser) bzw. ⤡ (zurück zu allen)
        const solo = this._fsSolo === p.id;
        // auch im Vollbild ein-/ausklappbar (1.40): Pfeilchen in der Kopfzeile, eingeklappt der Strich mit Pfeilchen
        r.strip.replaceChildren(sc, fold, el('button', { class: 'pt-btn pt-max' + (solo ? ' on' : ''), type: 'button', html: icon(solo ? 'restoreTiles' : 'maximize', 16), dataset: { pane: p.id },
          title: solo ? 'Zurück zu allen Tabs' : 'Nur diesen Tab im Vollbild' }), grip);   // ⤢ bleibt ganz rechts oben
        continue;
      }
      r.strip.replaceChildren(sc, add, more, fold, grip);
      // aktiven Tab sichtbar halten
      const on = sc.querySelector('.ptab.act') || sc.querySelector('.ptab.on');
      if (on) requestAnimationFrame(() => {
        const L = on.offsetLeft, R = L + on.offsetWidth;
        if (L < sc.scrollLeft) sc.scrollLeft = L - 8; else if (R > sc.scrollLeft + sc.clientWidth) sc.scrollLeft = R - sc.clientWidth + 8;
      });
    }
    document.body.classList.toggle('has-panes', all.length > 1 || this.tabCount() > 1);
    this.box.classList.toggle('tmin', !!Store.ui.tabsMin);
  },
  tip(pid, sec) {
    const m = pid && Store.meta(pid);
    return this.title(pid) + (sec ? '\n' + Tree.path(sec.id).map(g => g.name).join(' › ') : '') + (m && m.created ? '\nErstellt: ' + fmtDate(m.created) : '') +
      '\nDoppelklick: umbenennen · Mittelklick: schliessen · Ziehen: verschieben oder teilen';
  },
  /* ------------------------------------------------------------ Tableiste einklappen (1.36) */
  toggleMin(on) {
    Store.ui.tabsMin = on ?? !Store.ui.tabsMin;
    this.peek(null);
    this.renderStrips();
    UiState.saveSoon();
    Canvas.layoutSoon && Canvas.layoutSoon();
    if (typeof Ribbon !== 'undefined') Ribbon.refreshSoon();
  },
  /* eingeklappte Tableiste eines Bereichs über der Seite aufklappen (id) bzw. wieder zu (null) */
  peek(id) {
    clearTimeout(this._peekT);
    if (this._peek === id) return;
    if (this._peek) { const r = this.els.get(this._peek); if (r) r.wrap.classList.remove('peek'); }
    this._peek = id && Store.ui.tabsMin ? id : null;
    if (this._peek) { const r = this.els.get(this._peek); if (r) r.wrap.classList.add('peek'); }
  },
  peekOffSoon() {
    if (!this._peek || this._peekT) return;
    this._peekT = setTimeout(() => {
      this._peekT = null;
      if (this._renaming || (UI.popupOpen && UI.popupOpen()) || document.querySelector('.pt-ghost')) return;
      this.peek(null);
    }, 350);
  },
  /* ------------------------------------------------------------ Tab umbenennen (Doppelklick, neue Seite) */
  rename(paneId) {
    const S = this.S;
    if (!S) return false;
    const id = paneId || S.active;
    if (id !== S.active) this.activate(id);
    const r = this.els.get(S.active);
    if (this._renaming || !r || !Canvas.page || Store.readOnly || getComputedStyle(r.strip).display === 'none') return false;
    const tab = r.strip.querySelector(`.ptab[data-pane="${S.active}"][data-i="${this.active().cur}"]`);
    if (!tab) return false;
    if (Store.ui.tabsMin) this.peek(S.active);
    const T = $('#page-title'), lab = tab.querySelector('.pt-t');
    const inp = el('input', { class: 'pt-in', value: Canvas.page.title, spellcheck: 'false', 'aria-label': 'Seitentitel' });
    this._renaming = { pane: S.active };
    lab.replaceWith(inp);
    // dieselbe Logik wie der Titel über der Seite (Verlauf, Bezüge in Tabellen anderer Seiten): dessen Ereignisse nutzen
    T.dispatchEvent(new Event('focus'));
    inp.addEventListener('input', () => { T.value = inp.value; T.dispatchEvent(new Event('input')); });
    let done = false;
    const end = (keep) => {
      if (done) return;
      done = true;
      if (!keep) { T.value = this._was; T.dispatchEvent(new Event('input')); }
      T.dispatchEvent(new Event('blur'));
      this._renaming = null;
      this.renderStrips();
      this.peekOffSoon();
    };
    this._was = Canvas.page.title;
    inp.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') { e.preventDefault(); end(true); }
      else if (e.key === 'Escape') { e.preventDefault(); end(false); }
    });
    inp.addEventListener('blur', () => end(true));
    for (const ev of ['pointerdown', 'mousedown', 'click', 'dblclick']) inp.addEventListener(ev, (e) => e.stopPropagation());
    inp.focus(); inp.select();
    return true;
  },
  syncSoon: debounce(() => Panes.sync(), 80),
  /* nach Änderungen an Seiten (gelöscht, umbenannt, verschoben): Tabs ohne Seite entfernen, Titel nachführen */
  sync() {
    const S = this.S;
    if (!S || !this.box) return;
    let changed = false;
    for (const p of this.leaves()) {
      const n = p.tabs.filter(t => t === null || Store.has(t));
      if (n.length !== p.tabs.length) {
        const curPid = p.tabs[p.cur];
        p.tabs = n.length ? n : [p.id === S.active ? Canvas.pageId || null : null];
        p.cur = Math.max(0, p.tabs.indexOf(curPid));
        if (p.cur >= p.tabs.length) p.cur = p.tabs.length - 1;
        changed = true;
      }
    }
    // leere Bereiche (keine Seite mehr) schliessen, solange es noch andere gibt
    for (const p of this.leaves()) if (this.count() > 1 && p.id !== S.active && p.tabs.length === 1 && p.tabs[0] === null) { this.removePane(p); changed = true; }
    if (changed) { this.render(); UiState.saveSoon(); } else this.renderStrips();
  },

  /* ------------------------------------------------------------ Seitenwechsel (App.openPage) */
  opened(pid, opts = {}) {
    const S = this.S;
    if (!S || !this.box) return;
    const p = this.active();
    if (!p) return;
    if (!this._inner) {
      const i = pid ? p.tabs.indexOf(pid) : -1;
      if (i >= 0) p.cur = i;   // schon in einem Tab dieses Bereichs offen → dorthin
      else if ((opts.newTab || this._forceNew) && pid) { p.tabs.splice(p.cur + 1, 0, pid); p.cur++; }
      else p.tabs[p.cur] = pid;
    }
    this._forceNew = false;
    // dieselbe Seite in einem anderen Bereich: Vorschau dort nachführen
    if (pid && this.inactivePids.has(pid)) this.touched(pid);
    this.renderStrips();
    UiState.saveSoon();
  },
  openCur(p) {
    const pid = p.tabs[p.cur];
    this._inner = true;
    try {
      if (pid && Store.has(pid)) App.openPage(pid);
      else App.openPage(null, { group: Store.ui.currentGroup });
    } finally { this._inner = false; }
    this.renderStrips();
  },
  /* Bereich aktiv machen (und darin Tab idx zeigen) */
  activate(id, idx) {
    const S = this.S, p = this.find(id);
    if (!p) return;
    const prev = p.cur;
    if (idx != null) p.cur = clamp(idx, 0, p.tabs.length - 1);
    if (id === S.active) {
      if (p.tabs[p.cur] !== Canvas.pageId || (!p.tabs[p.cur] && idx != null)) this.openCur(p);
      else if (prev !== p.cur) this.renderStrips();   // schon sichtbar: Leiste nicht neu bauen (Doppelklick bleibt auf dem Tab)
      return;
    }
    if (App.preview) App.endPreview(true);
    this.snap();
    S.active = id;
    this.raiseFloat(id);
    if (!this.floatOf(id)) this._lastTree = id;
    if (this._fsSolo) this._fsSolo = id;   // Vollbild „nur dieser Tab“: der gewählte Tab ist jetzt der einzelne
    this.render();
    this.openCur(p);
    UiState.saveSoon();
  },
  selectTab(id, i) { this.activate(id, i); },
  /* Fenster nach vorne (zuletzt in der Liste = zuoberst) */
  raiseFloat(id) {
    const S = this.S, f = this.floatOf(id);
    if (!f || S.floats[S.floats.length - 1] === f) return;
    S.floats.splice(S.floats.indexOf(f), 1); S.floats.push(f);
  },

  /* ------------------------------------------------------------ Schwebende Fenster (1.49) */
  /* Tab i von Bereich id als eigenes Fenster lösen (at: Bildschirmpunkt, wo die Titelleiste hin soll) */
  detach(id, i, at) {
    const S = this.S, from = this.find(id);
    if (!from) return;
    if (i == null) i = from.cur;
    const pid = from.tabs[i];
    const inTree = !this.floatOf(id);
    // der Hauptbereich behält mindestens einen Tab
    if (inTree && from.tabs.length <= 1 && this.treeLeaves().length <= 1) { UI.toast('Der letzte Tab im Hauptbereich bleibt – öffne zuerst einen weiteren Tab (+)', 3000); return; }
    if (!inTree && from.tabs.length <= 1) return;   // schon ein eigenes Fenster
    const B = this.box.getBoundingClientRect(), W = Math.max(1, B.width), H = Math.max(1, B.height);
    const w = clamp(Math.max(340, W * 0.46), 220, W) / W, h = clamp(Math.max(260, H * 0.55), 160, H) / H;
    const n = (S.floats || []).length;
    let x = at ? (at.x - B.left) / W - 0.08 : 0.08 + 0.04 * (n % 6), y = at ? (at.y - B.top) / H - 0.02 : 0.08 + 0.05 * (n % 6);
    x = clamp(x, 0, 1 - w); y = clamp(y, 0, 1 - h);
    const pane = { t: 'pane', id: uid('pn'), tabs: [pid], cur: 0 };
    from.tabs.splice(i, 1);
    if (i < from.cur || from.cur >= from.tabs.length) from.cur = Math.max(0, from.cur - 1);
    if (!from.tabs.length) { if (S.active === from.id) S.active = pane.id; this.removePane(from); }
    (S.floats = S.floats || []).push({ pane, x, y, w, h });
    if (S.active === from.id && this.find(from.id)) { this.snap(); }
    this.activate(pane.id);
    this.render();
    UiState.saveSoon();
    return pane.id;
  },
  /* Fenster zurück in die Tableiste (des aktiven Bereichs im Baum bzw. into) */
  dock(id, into, j) {
    const S = this.S, f = this.floatOf(id);
    if (!f) return;
    if (this._fs) {   // Vollbild: wieder als Kachel ins Raster
      S.floats.splice(S.floats.indexOf(f), 1);
      const last = this.treeLeaves().pop();
      this.insertBeside(last, f.pane, 'h', true);
      this.render(); this.activate(f.pane.id);
      return;
    }
    const tree = this.treeLeaves();
    const to = (into && tree.find(p => p.id === into)) || tree.find(p => p.id === this._lastTree) || tree[0];
    const pids = f.pane.tabs.filter(x => x === null || Store.has(x)), cur = f.pane.tabs[f.pane.cur];
    S.floats.splice(S.floats.indexOf(f), 1);
    j = clamp(j == null ? to.tabs.length : j, 0, to.tabs.length);
    for (const pid of pids) { const ex = to.tabs.indexOf(pid); if (ex >= 0) { to.tabs.splice(ex, 1); if (ex < j) j--; } }
    to.tabs.splice(j, 0, ...pids);
    if (S.active === id) S.active = to.id;
    this.els.delete(id); this.shots.delete(id); this.queue.delete(id);
    this.render();
    this.activate(to.id, Math.max(0, to.tabs.indexOf(cur)));
    if (to.tabs[to.cur] !== Canvas.pageId && S.active === to.id) this.openCur(to);
    UiState.saveSoon();
  },
  maxFloat(id) {
    const f = this.floatOf(id);
    if (!f) return;
    if (f.max) { Object.assign(f, f.max); delete f.max; }
    else { f.max = { x: f.x, y: f.y, w: f.w, h: f.h }; Object.assign(f, { x: 0, y: 0, w: 1, h: 1 }); }
    this.render(); UiState.saveSoon();
  },
  /* Fenster an der Titelleiste verschieben; über einer Tableiste losgelassen = dort andocken */
  floatDrag(e, id) {
    const f = this.floatOf(id), r = this.els.get(id);
    if (!f || !r) return;
    e.preventDefault();
    const B = this.box.getBoundingClientRect(), x0 = e.clientX, y0 = e.clientY, fx = f.x, fy = f.y;
    let moved = false, mark = null, target = null;
    if (f.max) { delete f.max; }
    const move = (ev) => {
      const dx = ev.clientX - x0, dy = ev.clientY - y0;
      if (!moved && Math.hypot(dx, dy) < 5) return;
      if (!moved) { moved = true; r.wrap.classList.add('pf-moving'); }
      f.x = clamp(fx + dx / B.width, -f.w + 80 / B.width, 1 - 80 / B.width);
      f.y = clamp(fy + dy / B.height, 0, 1 - 28 / B.height);
      this.placeFloat(r.wrap, f, (this.S.floats || []).indexOf(f));
      // Andock-Ziele (1.50): Tableiste = als Tab, Rand eines Bereichs = daneben/darüber/darunter (geteilter
      // Bildschirm), Rand der ganzen Fläche = ganze Hälfte; Mitte eines Bereichs = als Tab hinein
      if (mark) { mark.remove(); mark = null; }
      r.wrap.style.pointerEvents = 'none';
      target = this.dockTarget(ev.clientX, ev.clientY, 'window', id);
      r.wrap.style.pointerEvents = '';
      mark = this.showDock(target);
    };
    const up = () => {
      removeEventListener('pointermove', move, true); removeEventListener('pointerup', up, true); removeEventListener('pointercancel', up, true);
      if (mark) mark.remove();
      r.wrap.classList.remove('pf-moving');
      if (!moved) return;
      this._dragged = true; setTimeout(() => { this._dragged = false; }, 0);
      if (target && target.kind !== 'none') { this.dockFloat(id, target); return; }
      UiState.saveSoon(); Canvas.layoutSoon && Canvas.layoutSoon();
    };
    addEventListener('pointermove', move, true); addEventListener('pointerup', up, true); addEventListener('pointercancel', up, true);
  },
  /* Andock-Ziel an (x, y) (1.50). mode 'tab' (ein Tab wird gezogen) oder 'window' (ein Fenster wird gezogen).
   *   { kind: 'tab', pane, j, rect }           in eine Tableiste an Stelle j
   *   { kind: 'split', pane, dir, after, rect } an den Rand eines Bereichs: links/rechts (h) bzw. oben/unten (v)
   *   { kind: 'edge', dir, after, rect }        an den Rand der ganzen Fläche: ganze Hälfte (geteilter Bildschirm)
   *   { kind: 'into', pane, rect }              Mitte eines Bereichs (Fenster): als Tab hinein
   *   { kind: 'float', at, rect }               Mitte einer Seite (Tab): als Fenster lösen */
  dockTarget(x, y, mode, self) {
    const B = this.box.getBoundingClientRect();
    if (x < B.left || x > B.right || y < B.top || y > B.bottom) return null;
    const hit = document.elementFromPoint(x, y);
    const strip = hit && hit.closest && hit.closest('#panes .ptabs');
    // Tableiste: Einfügestelle zwischen den Tabs
    if (strip && !(self && strip.parentNode.dataset.pane === self)) {
      const tabs = [...strip.querySelectorAll('.ptab')];
      let ref = null;
      for (const t of tabs) { const r = t.getBoundingClientRect(); if (x < r.left + r.width / 2) { ref = t; break; } }
      const last = tabs[tabs.length - 1];
      const pane = ref ? ref.dataset.pane : last ? last.dataset.pane : strip.parentNode.dataset.pane;
      const j = ref ? +ref.dataset.i : last ? +last.dataset.i + 1 : 0;
      const r = (ref || last || strip).getBoundingClientRect();
      return { kind: 'tab', pane, j, mark: 'line', rect: { left: (ref ? r.left : r.right) - 1, top: r.top, width: 3, height: r.height } };
    }
    // Rand der ganzen Fläche (nicht im Kachel-Vollbild): ganze Hälfte
    const E = 26;
    if (!this.narrow) {
      const d = [['h', false, x - B.left], ['h', true, B.right - x], ['v', false, y - B.top], ['v', true, B.bottom - y]].sort((a, b) => a[2] - b[2])[0];
      if (d[2] < E) {
        const [dir, after] = d, half = dir === 'h' ? { left: after ? B.left + B.width / 2 : B.left, top: B.top, width: B.width / 2, height: B.height } : { left: B.left, top: after ? B.top + B.height / 2 : B.top, width: B.width, height: B.height / 2 };
        return { kind: 'edge', dir, after, rect: half };
      }
    }
    const pn = hit && hit.closest && hit.closest('#panes .pane');
    if (!pn || (self && pn.dataset.pane === self)) return null;
    const isFloat = pn.classList.contains('pfloat');
    const body = pn.querySelector('.pane-body'), r = body.getBoundingClientRect();
    const fx = (x - r.left) / r.width, fy = (y - r.top) / r.height;
    // Fenster ziehen: andocken nur über dem Kompass in der Mitte des Bereichs (sonst bleibt es frei schwebend –
    // wie beim Andocken von Fenstern in Visual Studio); Mitte = als Tab, Pfeile = daneben/darüber/darunter
    if (mode === 'window') {
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2, dx = x - cx, dy = y - cy, S2 = 24, F = 82;
      let hot = null;
      if (Math.abs(dx) < S2 && Math.abs(dy) < S2) hot = 'c';
      else if (!isFloat && !this.narrow && Math.abs(dy) < S2 && dx <= -S2 && dx > -F) hot = 'l';
      else if (!isFloat && !this.narrow && Math.abs(dy) < S2 && dx >= S2 && dx < F) hot = 'r';
      else if (!isFloat && !this.narrow && Math.abs(dx) < S2 && dy <= -S2 && dy > -F) hot = 't';
      else if (!isFloat && !this.narrow && Math.abs(dx) < S2 && dy >= S2 && dy < F) hot = 'b';
      const compass = { cx, cy, hot, split: !isFloat && !this.narrow };
      if (!hot) return { kind: 'none', compass };
      if (hot === 'c') return { kind: 'into', pane: pn.dataset.pane, compass, rect: { left: r.left, top: r.top, width: r.width, height: r.height } };
      const dir = hot === 'l' || hot === 'r' ? 'h' : 'v', after = hot === 'r' || hot === 'b';
      const rect = dir === 'h' ? { left: after ? r.left + r.width / 2 : r.left, top: r.top, width: r.width / 2, height: r.height } : { left: r.left, top: after ? r.top + r.height / 2 : r.top, width: r.width, height: r.height / 2 };
      return { kind: 'split', pane: pn.dataset.pane, dir, after, compass, rect };
    }
    // Ränder eines Bereichs im Baum: der nächste Rand innerhalb von 28 %
    if (!isFloat && !this.narrow) {
      const d = [['h', false, fx], ['h', true, 1 - fx], ['v', false, fy], ['v', true, 1 - fy]].sort((a, b) => a[2] - b[2])[0];
      if (d[2] < 0.28) {
        const [dir, after] = d;
        const rect = dir === 'h' ? { left: after ? r.left + r.width / 2 : r.left, top: r.top, width: r.width / 2, height: r.height } : { left: r.left, top: after ? r.top + r.height / 2 : r.top, width: r.width, height: r.height / 2 };
        return { kind: 'split', pane: pn.dataset.pane, dir, after, rect };
      }
    }
    if (mode === 'window') return { kind: 'into', pane: pn.dataset.pane, rect: { left: r.left, top: r.top, width: r.width, height: r.height } };
    return { kind: 'float', at: { x, y }, rect: { left: x - 30, top: y - 10, width: Math.min(r.width * 0.5, 360), height: Math.min(r.height * 0.5, 260) } };
  },
  /* Ziel anzeigen: Linie in der Tableiste bzw. die Fläche, die danach belegt wird (mit Hinweis) */
  showDock(t) {
    if (!t) return null;
    // Kompass (Fenster ziehen): fünf Felder in der Mitte des Bereichs, das getroffene hervorgehoben
    let cp = null;
    if (t.compass) {
      const { cx, cy, hot, split } = t.compass, sq = (k, dx, dy, ic) => el('div', { class: 'pd-sq' + (hot === k ? ' hot' : ''), style: { left: (cx + dx - 20) + 'px', top: (cy + dy - 20) + 'px' }, html: icon(ic, 18) });
      cp = el('div', { class: 'pd-compass' }, sq('c', 0, 0, 'tabs'), ...(split ? [sq('l', -50, 0, 'arrowLeft'), sq('r', 50, 0, 'arrowRight'), sq('t', 0, -50, 'arrowUp'), sq('b', 0, 50, 'arrowDown')] : []));
      document.body.append(cp);
      if (t.kind === 'none') return cp;
    }
    const R = t.rect;
    if (t.mark === 'line') { const m = el('div', { class: 'pt-mark', style: { left: R.left + 'px', top: R.top + 'px', height: R.height + 'px' } }); document.body.append(m); return m; }
    const lab = { tab: '', into: 'Als Tab hinzufügen', float: 'Als Fenster lösen', split: t.dir === 'h' ? (t.after ? 'Rechts daneben' : 'Links daneben') : (t.after ? 'Darunter' : 'Darüber'),
      edge: t.dir === 'h' ? (t.after ? 'Rechte Hälfte' : 'Linke Hälfte') : (t.after ? 'Untere Hälfte' : 'Obere Hälfte') }[t.kind];
    const m = el('div', { class: 'pt-zone' + (t.kind === 'float' ? ' float' : '') + (t.kind === 'edge' ? ' edge' : ''), style: { left: R.left + 'px', top: R.top + 'px', width: R.width + 'px', height: R.height + 'px' } },
      lab ? el('span', { class: 'pt-zone-l', text: lab }) : null);
    if (cp) { cp.prepend(m); return cp; }
    document.body.append(m);
    return m;
  },
  /* Fenster an einem Andock-Ziel eingliedern (1.50) */
  dockFloat(id, t) {
    const S = this.S, f = this.floatOf(id);
    if (!f || !t) return;
    if (t.kind === 'tab' || t.kind === 'into') {
      if (this._fs) { this.dock(id); return; }   // im Kachel-Vollbild: zurück ins Raster
      this.dock(id, t.pane, t.kind === 'tab' ? t.j : null);
      return;
    }
    S.floats.splice(S.floats.indexOf(f), 1);
    if (t.kind === 'split') {
      const to = this.find(t.pane);
      if (!to || this.floatOf(to.id)) { S.floats.push(f); return; }
      this.insertBeside(to, f.pane, t.dir, t.after);
    } else this.wrapRoot(f.pane, t.dir, t.after);
    this.render();
    this.activate(f.pane.id);
    UiState.saveSoon();
  },
  /* neuer Bereich n an den Rand der ganzen Fläche */
  wrapRoot(n, dir, after) {
    const S = this.S, r = S.root;
    if (r.t === 'split' && r.dir === dir) {
      const w = r.sizes.reduce((a, b) => a + b, 0) / r.sizes.length;
      if (after) { r.kids.push(n); r.sizes.push(w); } else { r.kids.unshift(n); r.sizes.unshift(w); }
    } else S.root = { t: 'split', dir, kids: after ? [r, n] : [n, r], sizes: [1, 1] };
  },
  /* Tab an den Rand der ganzen Fläche ziehen: eigener Bereich dort */
  tabToEdge(fromId, i, dir, after) {
    const S = this.S, from = this.find(fromId);
    if (!from) return;
    if (from.tabs.length <= 1 && this.treeLeaves().length <= 1 && !this.floatOf(fromId)) return;   // einziger Tab: nichts zu tun
    const pid = from.tabs[i];
    from.tabs.splice(i, 1);
    if (i < from.cur || from.cur >= from.tabs.length) from.cur = Math.max(0, from.cur - 1);
    const n = { t: 'pane', id: uid('pn'), tabs: [pid], cur: 0 };
    if (!from.tabs.length) { if (S.active === from.id) S.active = n.id; this.removePane(from); }
    this.wrapRoot(n, dir, after);
    this.render();
    this.activate(n.id);
    UiState.saveSoon();
  },
  floatResize(e, id, d) {
    const f = this.floatOf(id), r = this.els.get(id);
    if (!f || !r) return;
    e.preventDefault(); e.stopPropagation();
    if (f.max) delete f.max;
    const B = this.box.getBoundingClientRect(), x0 = e.clientX, y0 = e.clientY, o = { ...f };
    const mw = 220 / B.width, mh = 150 / B.height;
    const move = (ev) => {
      const dx = (ev.clientX - x0) / B.width, dy = (ev.clientY - y0) / B.height;
      if (d.includes('e')) f.w = clamp(o.w + dx, mw, 1.2);
      if (d.includes('s')) f.h = clamp(o.h + dy, mh, 1 - o.y);
      if (d.includes('w')) { const w = clamp(o.w - dx, mw, o.x + o.w + 0.5); f.x = o.x + o.w - w; f.w = w; }
      this.placeFloat(r.wrap, f, (this.S.floats || []).indexOf(f));
      if (this.S.active === id) Canvas.layoutSoon && Canvas.layoutSoon();
    };
    const up = () => {
      removeEventListener('pointermove', move, true); removeEventListener('pointerup', up, true); removeEventListener('pointercancel', up, true);
      UiState.saveSoon(); Canvas.layoutSoon && Canvas.layoutSoon();
      if (this.S.active !== id) { const sh = this.shots.get(id); if (sh) sh.dirty = true; this.want(id); }
    };
    addEventListener('pointermove', move, true); addEventListener('pointerup', up, true); addEventListener('pointercancel', up, true);
  },
  /* Vollbild: Kachel an der Kopfzeile wegziehen → frei verschiebbares Fenster */
  fsTileDrag(e, id) {
    const x0 = e.clientX, y0 = e.clientY;
    const move = (ev) => {
      if (Math.hypot(ev.clientX - x0, ev.clientY - y0) < 10) return;
      removeEventListener('pointermove', move, true); removeEventListener('pointerup', up, true);
      const S = this._fs, p = this.find(id);
      if (!S || !p || this.floatOf(id)) return;
      if (this.treeLeaves().length <= 1) return;   // die letzte Kachel bleibt im Raster
      const r = this.els.get(id), b = r.wrap.getBoundingClientRect(), B = this.box.getBoundingClientRect();
      this.removePane(p);
      const f = { pane: p, x: (b.left - B.left) / B.width, y: (b.top - B.top) / B.height, w: Math.max(0.25, b.width / B.width), h: Math.max(0.25, b.height / B.height) };
      S.floats.push(f);
      this.activate(id);
      this.render();
      this.floatDrag({ clientX: x0, clientY: y0, preventDefault() { } }, id);
    };
    const up = () => { removeEventListener('pointermove', move, true); removeEventListener('pointerup', up, true); };
    addEventListener('pointermove', move, true); addEventListener('pointerup', up, true);
  },

  /* ------------------------------------------------------------ Tabs und Bereiche */
  newTab(pid, paneId) {
    if (this._fs) { this.fsBlocked(); return; }
    const p = this.find(paneId || this.S.active);
    if (!p) return;
    if (p.id !== this.S.active) this.activate(p.id);
    if (pid === undefined) pid = Canvas.pageId;
    if (!pid) return;
    p.tabs.splice(p.cur + 1, 0, pid);
    p.cur++;
    this.openCur(p);
    UiState.saveSoon();
  },
  fsBlocked() { UI.toast('Im Vollbild mit allen Tabs nicht möglich – F11 beendet das Vollbild', 2500); },
  /* fn (z.B. Ops.newPage) öffnet seine Seite in einem neuen Tab */
  inNewTab(fn) { this._forceNew = true; try { fn(); } finally { setTimeout(() => { this._forceNew = false; }, 0); } },
  openIn(pid, where) {
    if (!pid) return;
    if (where === 'tab') return Store.gate(() => { this.newTab(pid); });
    this.split(where === 'down' ? 'v' : 'h', pid);
  },
  closeTab(id, i) {
    if (this._fs) { this.fsBlocked(); return; }
    const S = this.S, p = this.find(id);
    if (!p) return;
    if (i == null) i = p.cur;
    if (p.tabs.length <= 1) { if (this.count() > 1) this.closePane(id); return; }
    const wasCur = i === p.cur;
    p.tabs.splice(i, 1);
    if (i < p.cur || p.cur >= p.tabs.length) p.cur = Math.max(0, p.cur - 1);
    if (wasCur) { if (id === S.active) this.openCur(p); else { this.render(); } }
    else this.renderStrips();
    UiState.saveSoon();
  },
  closeOthers(id, i) {
    const p = this.find(id);
    if (!p) return;
    if (i == null) i = p.cur;
    const keep = p.tabs[i];
    p.tabs = [keep]; p.cur = 0;
    if (id === this.S.active && keep !== Canvas.pageId) this.openCur(p); else this.render();
    UiState.saveSoon();
  },
  removePane(p) {
    const fl = this.floatOf(p.id);
    if (fl) { this.S.floats.splice(this.S.floats.indexOf(fl), 1); this.els.delete(p.id); this.shots.delete(p.id); this.queue.delete(p.id); return true; }
    const par = this.parentOf(p);
    if (!par) return false;
    const i = par.kids.indexOf(p);
    par.kids.splice(i, 1); par.sizes.splice(i, 1);
    if (par.kids.length === 1) {
      const only = par.kids[0];
      const gp = this.parentOf(par);
      // gleiche Richtung wie darüber: zusammenfassen
      if (gp && only.t === 'split' && only.dir === gp.dir) {
        const j = gp.kids.indexOf(par), w = gp.sizes[j], tot = only.sizes.reduce((a, b) => a + b, 0) || 1;
        gp.kids.splice(j, 1, ...only.kids); gp.sizes.splice(j, 1, ...only.sizes.map(s => s / tot * w));
      } else this.replace(par, only);
    }
    this.els.delete(p.id); this.shots.delete(p.id); this.queue.delete(p.id);
    return true;
  },
  closePane(id) {
    if (this._fs) { this.fsBlocked(); return; }
    const S = this.S, p = this.find(id);
    if (!p || this.count() <= 1) return;
    // Nachbar, der danach aktiv wird
    const all = this.leaves(), k = all.indexOf(p), next = all[k + 1] || all[k - 1];
    const wasActive = id === S.active;
    this.removePane(p);
    if (wasActive) { S.active = next.id; this.render(); this.openCur(next); }
    else this.render();
    UiState.saveSoon();
  },
  /* Bereich teilen: neuer Bereich rechts (h) bzw. unten (v) mit Seite pid (sonst die aktuelle) */
  split(dir, pid, fromId) {
    if (this._fs) { this.fsBlocked(); return; }
    const S = this.S, src = this.find(fromId || S.active);
    if (!src) return;
    if (pid === undefined) pid = src.tabs[src.cur];
    // aus einem Fenster heraus: neben dem zuletzt benutzten Bereich im Baum teilen
    const p = this.floatOf(src.id) ? (this.treeLeaves().find(q => q.id === this._lastTree) || this.treeLeaves()[0]) : src;
    const n = { t: 'pane', id: uid('pn'), tabs: [pid || null], cur: 0 };
    this.insertBeside(p, n, dir, true);
    this.activate(n.id);
    if (this.narrow) UI.toast(dir === 'h' ? 'Rechts geteilt – auf dem schmalen Bildschirm siehst du die Bereiche nacheinander (Tabs oben)' : 'Unten geteilt – auf dem schmalen Bildschirm siehst du die Bereiche nacheinander (Tabs oben)', 3500);
  },
  insertBeside(p, n, dir, after) {
    const par = this.parentOf(p);
    if (par && par.dir === dir) {
      const i = par.kids.indexOf(p), w = par.sizes[i] / 2;
      par.sizes[i] = w;
      par.kids.splice(i + (after ? 1 : 0), 0, n); par.sizes.splice(i + (after ? 1 : 0), 0, w);
    } else {
      const s = { t: 'split', dir, kids: after ? [p, n] : [n, p], sizes: [1, 1] };
      this.replace(p, s);
    }
  },
  /* Tab verschieben: in Bereich toId an Stelle j (oder als neuer Bereich neben toId, wenn dir gesetzt) */
  moveTab(fromId, i, toId, j, dir, after = true) {
    if (this._fs) { this.fsBlocked(); return; }
    const S = this.S, from = this.find(fromId);
    let to = this.find(toId);
    if (!from || !to) return;
    const pid = from.tabs[i];
    if (dir && this.floatOf(to.id)) to = this.treeLeaves().find(q => q.id === this._lastTree) || this.treeLeaves()[0];   // Teilen geht nur im Baum
    if (dir) {
      if (from === to && from.tabs.length <= 1) return;   // einziger Tab neben sich selbst: nichts zu tun
      from.tabs.splice(i, 1);
      if (from.cur >= from.tabs.length || i < from.cur) from.cur = Math.max(0, from.cur - (i < from.cur ? 1 : 0));
      if (from.cur >= from.tabs.length) from.cur = from.tabs.length - 1;
      const n = { t: 'pane', id: uid('pn'), tabs: [pid], cur: 0 };
      this.insertBeside(to, n, dir, after);
      if (!from.tabs.length) { if (S.active === from.id) S.active = n.id; this.removePane(from); }
      this.activate(n.id);
      if (this.find(from.id) && from.id !== S.active) this.showShot(from.id);
      UiState.saveSoon();
      return;
    }
    if (from === to) {
      if (j > i) j--;
      if (j === i) return;
      const curPid = from.tabs[from.cur];
      from.tabs.splice(i, 1); from.tabs.splice(j, 0, pid);
      from.cur = from.tabs.indexOf(curPid);
      this.renderStrips(); UiState.saveSoon();
      return;
    }
    from.tabs.splice(i, 1);
    if (i < from.cur || from.cur >= from.tabs.length) from.cur = Math.max(0, from.cur - 1);
    const ex = to.tabs.indexOf(pid);
    if (ex >= 0) to.tabs.splice(ex, 1);   // dort schon offen: nicht doppelt
    j = clamp(j, 0, to.tabs.length);
    to.tabs.splice(j, 0, pid);
    if (!from.tabs.length) { if (S.active === from.id) S.active = to.id; this.removePane(from); this.render(); }
    else if (from.id !== S.active) this.showShot(from.id);
    this.activate(to.id, j);
    if (from.id === S.active && this.find(from.id)) this.openCur(from);
    UiState.saveSoon();
  },
  equalize(splitNode) { splitNode.sizes = splitNode.sizes.map(() => 1); this.render(); UiState.saveSoon(); },

  /* ------------------------------------------------------------ Menüs */
  /* neue Seite eines Typs in neuem Tab (Freiform, Word, Excel, PowerPoint) */
  async newTyped(fmt, paneId) {
    if (this._fs) { this.fsBlocked(); return; }
    if (Store.readOnly) return;
    const id = paneId || this.S.active;
    if (id !== this.S.active) this.activate(id);
    this._forceNew = true;
    try { if (fmt === 'frei' || typeof OfficePages === 'undefined') Ops.newPage(); else await OfficePages.newTyped(fmt); }
    catch (e) { UI.toast(e.message, 5000); }
    finally { setTimeout(() => { this._forceNew = false; }, 0); }
  },
  /* Auswahl beim Darüberhalten: Word / Excel / PowerPoint */
  typeMenu(anchor, paneId) {
    UI.menu([{ head: 'Neue Seite als …' },
      { label: 'Word', icon: 'officeDoc', action: () => this.newTyped('docx', paneId) },
      { label: 'Excel', icon: 'table', action: () => this.newTyped('xlsx', paneId) },
      { label: 'PowerPoint', icon: 'slides', action: () => this.newTyped('pptx', paneId) },
      '-', { label: 'Leere Seite', icon: 'pagePlus', action: () => this.newTyped('frei', paneId) }], 0, 0, { anchor });
  },
  addMenu(anchor, paneId) {
    const id = paneId || this.S.active;
    const recent = (Store.ui.recent || []).filter(x => Store.has(x)).slice(0, 8);
    UI.menu([
      { head: 'Neue Seite' },
      { label: 'Leere Seite', icon: 'pagePlus', action: () => this.newTyped('frei', id) },
      { label: 'Word', icon: 'officeDoc', action: () => this.newTyped('docx', id) },
      { label: 'Excel', icon: 'table', action: () => this.newTyped('xlsx', id) },
      { label: 'PowerPoint', icon: 'slides', action: () => this.newTyped('pptx', id) },
      '-',
      { label: 'Diese Seite in neuem Tab', icon: 'tabPlus', disabled: !Canvas.pageId && !(this.find(id) || {}).tabs, action: () => { const p = this.find(id); this.newTab(p ? p.tabs[p.cur] : Canvas.pageId, id); } },
      recent.length ? { head: 'Zuletzt geöffnet' } : null,
      ...recent.map(pid => ({ label: this.title(pid), icon: 'page', action: () => this.newTab(pid, id) })),
    ], 0, 0, { anchor });
  },
  paneMenu(anchor, id, x, y) {
    const p = this.find(id);
    if (!p) return;
    const multi = this.count() > 1;
    UI.menu([
      { label: 'Rechts teilen', icon: 'splitH', action: () => this.split('h', p.tabs[p.cur], id) },
      { label: 'Unten teilen', icon: 'splitV', action: () => this.split('v', p.tabs[p.cur], id) },
      '-',
      { label: 'Tab schliessen', icon: 'x', disabled: p.tabs.length <= 1 && !multi, action: () => this.closeTab(id) },
      { label: 'Andere Tabs schliessen', icon: 'x', disabled: p.tabs.length <= 1, action: () => this.closeOthers(id) },
      { label: this.floatOf(id) ? 'Fenster schliessen' : 'Bereich schliessen', icon: 'paneClose', disabled: !multi, action: () => this.closePane(id) },
      { label: 'Als Fenster lösen', icon: 'popout', disabled: !!this.floatOf(id) && p.tabs.length <= 1, action: () => this.detach(id, p.cur) },
      this.floatOf(id) ? { label: 'Andocken', icon: 'tabs', action: () => this.dock(id) } : null,
      '-',
      { label: Store.ui.tabsMin ? 'Tableiste aufklappen' : 'Tableiste einklappen', icon: Store.ui.tabsMin ? 'chevDown' : 'chevUp', action: () => this.toggleMin() },
      multi ? '-' : null,
      multi ? { label: 'Alle Bereiche gleich gross', icon: 'distH', action: () => { const eq = (n) => { if (n.t === 'split') { n.sizes = n.sizes.map(() => 1); n.kids.forEach(eq); } }; eq(this.S.root); this.render(); UiState.saveSoon(); } } : null,
      multi ? { label: 'Nur diesen Bereich behalten', icon: 'fullscreen', action: () => this.only(id) } : null,
    ], anchor ? 0 : x, anchor ? 0 : y, anchor ? { anchor } : {});
  },
  tabMenu(id, i, x, y) {
    const p = this.find(id);
    if (!p) return;
    const pid = p.tabs[i], multi = this.count() > 1;
    const others = this.leaves().filter(q => q.id !== id);
    UI.menu([
      { label: 'Umbenennen', icon: 'pencil', key: 'Doppelklick', disabled: !pid || Store.readOnly, action: () => { this.activate(id, i); this.rename(); } },
      { label: 'Datum ändern …', icon: 'calendar', disabled: !pid || Store.readOnly, action: () => Ops.editCreated(pid) },
      '-',
      { label: 'Tab schliessen', icon: 'x', disabled: p.tabs.length <= 1 && !multi, action: () => this.closeTab(id, i) },
      { label: 'Andere Tabs schliessen', icon: 'x', disabled: p.tabs.length <= 1, action: () => this.closeOthers(id, i) },
      '-',
      { label: 'Rechts daneben öffnen', icon: 'splitH', disabled: !pid, action: () => this.moveTab(id, i, id, 0, 'h') },
      { label: 'Unten öffnen', icon: 'splitV', disabled: !pid, action: () => this.moveTab(id, i, id, 0, 'v') },
      { label: 'Kopie in neuem Tab', icon: 'tabPlus', disabled: !pid, action: () => { this.activate(id, i); this.newTab(pid, id); } },
      { label: 'Als Fenster lösen', icon: 'popout', disabled: this.floatOf(id) && p.tabs.length <= 1, action: () => this.detach(id, i) },
      this.floatOf(id) ? { label: 'Andocken (zurück in die Tableiste)', icon: 'tabs', action: () => this.dock(id) } : null,
      '-',
      { label: 'Nach links', icon: 'arrowLeft', disabled: i === 0, action: () => this.moveTab(id, i, id, i - 1) },
      { label: 'Nach rechts', icon: 'arrowRight', disabled: i >= p.tabs.length - 1, action: () => this.moveTab(id, i, id, i + 2) },
      ...(others.length ? [{ head: 'In anderen Bereich verschieben' }, ...others.map((q, k) => ({ label: `Bereich ${this.leaves().indexOf(q) + 1}: ${this.title(q.tabs[q.cur])}`, icon: 'arrowRight', action: () => this.moveTab(id, i, q.id, q.tabs.length) }))] : []),
    ], x, y);
  },
  only(id) {
    const p = this.find(id);
    if (!p || this.floatOf(id)) return;
    this.S.floats = [];
    this.S.root = p;
    this.render();
    if (this.S.active !== id) { this.S.active = id; this.render(); this.openCur(p); }
    UiState.saveSoon();
  },

  /* ------------------------------------------------------------ Ereignisse */
  onClick(e) {
    const t = e.target;
    const mx = t.closest('.pt-max');
    if (mx) { this.fsSolo(this._fsSolo === mx.dataset.pane ? null : mx.dataset.pane); return; }
    if (t.closest('.pt-grip')) { this.toggleMin(false); return; }   // eingeklappt: Pfeilchen = wieder aufklappen (1.40)
    const b = t.closest('.pt-btn');
    if (b && b.classList.contains('pf-dock')) { this.dock(b.dataset.pane); return; }
    if (b && b.classList.contains('pf-close')) { this.closePane(b.dataset.pane); return; }
    if (b && b.classList.contains('pf-max')) { this.maxFloat(b.dataset.pane); return; }
    if (b) {
      if (b.classList.contains('pt-add')) { clearTimeout(this._hoverT); UI.closePopup && UI.closePopup(); this.newTyped('frei', b.dataset.pane); }   // Klick: neue Seite in neuem Tab (1.65; bis 1.64: Kopie des Tabs)
      else if (b.classList.contains('pt-fold')) this.toggleMin();
      else this.paneMenu(b, b.dataset.pane);
      return;
    }
    const tab = t.closest('.ptab');
    if (!tab) {
      const pane = t.closest('.pane');
      if (pane && !pane.classList.contains('active') && t.closest('.pane-body')) this.activate(pane.dataset.pane);
      return;
    }
    if (this._dragged) { this._dragged = false; return; }
    const id = tab.dataset.pane, i = +tab.dataset.i;
    if (t.closest('.pt-x')) { e.stopPropagation(); this.closeTab(id, i); return; }
    // zweimal kurz nacheinander auf denselben Tab = umbenennen (der erste Klick kann die Leiste neu bauen)
    const now = performance.now(), last = this._lastTap;
    this._lastTap = { id, i, t: now };
    if (last && last.id === id && last.i === i && now - last.t < 450 && !Store.readOnly) { this._lastTap = null; this.activate(id, i); this.rename(); return; }
    this.selectTab(id, i);
  },
  onMenu(e) {
    const add = e.target.closest('.pt-add');
    if (add) { e.preventDefault(); this.addMenu(add, add.dataset.pane); return; }   // Rechtsklick/langes Drücken auf +: Auswahl
    const tab = e.target.closest('.ptab');
    if (tab) { e.preventDefault(); this.tabMenu(tab.dataset.pane, +tab.dataset.i, e.clientX, e.clientY); return; }
    const strip = e.target.closest('.ptabs');
    const pane = e.target.closest('.pane');
    if (strip || (pane && !pane.classList.contains('active'))) { e.preventDefault(); this.paneMenu(null, pane.dataset.pane, e.clientX, e.clientY); }
  },
  onDown(e) {
    const sash = e.target.closest('.psash');
    if (sash) return this.sashDrag(e, sash);
    // schwebende Fenster (1.49): Ränder = Grösse, Titelleiste (leere Stelle oder einziger Tab) = verschieben
    const rs = e.target.closest('.pf-rs');
    if (rs) return this.floatResize(e, rs.parentNode.dataset.pane, rs.dataset.rs);
    const fw = e.target.closest('.pfloat');
    if (fw && e.button === 0) {
      const id = fw.dataset.pane, f = this.floatOf(id);
      const onTab = e.target.closest('.ptab'), onBtn = e.target.closest('button, .pt-in');
      if (f && e.target.closest('.ptabs') && !onBtn && (!onTab || f.pane.tabs.length === 1 || this._fs)) {
        if (this.S.active !== id) this.activate(id); else if (this.S.floats[this.S.floats.length - 1] !== f) { this.raiseFloat(id); this.render(); }
        return this.floatDrag(e, id);
      }
    }
    // Vollbild: Kachel an der Kopfzeile wegziehen = Fenster
    if (this._fs && e.button === 0 && e.target.closest('.ptab') && !e.target.closest('.pt-max, .pt-x')) {
      const pn = e.target.closest('.pane');
      if (pn && !this.floatOf(pn.dataset.pane)) this.fsTileDrag(e, pn.dataset.pane);
    }
    const tab = e.target.closest('.ptab');
    if (tab && !this._fs && !e.target.closest('.pt-x') && e.button === 0 && e.pointerType === 'mouse') return this.tabDrag(e, tab);
    // Vorschau eines anderen Bereichs: Bereich aktiv machen (Maus/Stift sofort; Finger beim Loslassen – so bleibt
    // langes Drücken das Kontextmenü des Bereichs und Wischen nichts)
    const pane = e.target.closest('.pane');
    // Fläche ziehen in der Vorschau (1.59): mittlere Maustaste oder Leertaste + Ziehen – ohne den Bereich zu wechseln
    if (pane && !pane.classList.contains('active') && e.target.closest('.pane-body') && e.pointerType !== 'touch' && (e.button === 1 || (e.button === 0 && Canvas.spaceDown))) {
      const r = this.els.get(pane.dataset.pane);
      if (r && this.shots.get(pane.dataset.pane)) { e.preventDefault(); return this.previewPan(e, r); }
    }
    if (pane && !pane.classList.contains('active') && e.target.closest('.pane-body') && e.button === 0 && e.pointerType !== 'touch') {
      e.preventDefault();
      const id = pane.dataset.pane;
      this.activate(id);
      this.clickThrough(e, id);
    }
  },
  /* Vorschau verschieben (1.59): wie das Mausrad, nur gezogen */
  previewPan(e, r) {
    const id = r.wrap.dataset.pane, shot = this.shots.get(id);
    if (!shot || !shot.frame) return;
    let lx = e.clientX, ly = e.clientY;
    document.body.classList.add('pv-panning');
    const mv = (ev) => {
      const v = shot.view;
      v.x += ev.clientX - lx; v.y += ev.clientY - ly; lx = ev.clientX; ly = ev.clientY;
      this.applyShotView(shot.frame, Store.pages[shot.pid], v);
    };
    const up = () => {
      window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up);
      document.body.classList.remove('pv-panning');
      const v = shot.view;
      Store.ui.views[shot.pid] = { x: Math.round(v.x), y: Math.round(v.y), z: v.z };
      UiState.saveSoon();
      const C = shot.cull;
      if (C) { const b = r.host.getBoundingClientRect(), x1 = -v.x / v.z, y1 = -v.y / v.z, x2 = (b.width - v.x) / v.z, y2 = (b.height - v.y) / v.z; if (x1 < C.x1 || y1 < C.y1 || x2 > C.x2 || y2 > C.y2) { shot.dirty = true; this.want(id); } }
    };
    window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up);
  },
  /* Klick durchreichen (1.57): der erste Klick in einen anderen Bereich macht ihn aktiv UND wirkt sofort dort (Textfeld
   * wählen, ziehen, Auswahlrahmen …) – man muss nicht erst „hineinklicken“. Die Zeichenfläche ist nach activate()
   * schon im Bereich (gleicher Sichtbereich wie die Vorschau); derselbe Zeigerdruck wird an das Element unter dem
   * Zeiger weitergegeben. Seiten, die erst geladen werden müssen, bekommen den Klick nicht (nur aktivieren). */
  clickThrough(e, id) {
    if (Store.ui.paneClickThrough === false) return;
    const p = this.find(id);
    if (!p || this.S.active !== id || !p.tabs[p.cur] || Canvas.pageId !== p.tabs[p.cur]) return;
    const t = document.elementFromPoint(e.clientX, e.clientY);
    const vp = $('#viewport');
    if (!t || !vp || !vp.contains(t)) return;
    const init = { bubbles: true, cancelable: true, composed: true, pointerId: e.pointerId, pointerType: e.pointerType, isPrimary: e.isPrimary, button: e.button, buttons: e.buttons,
      clientX: e.clientX, clientY: e.clientY, screenX: e.screenX, screenY: e.screenY, shiftKey: e.shiftKey, ctrlKey: e.ctrlKey, altKey: e.altKey, metaKey: e.metaKey, pressure: e.pressure, detail: e.detail };
    this._through = true;
    try { t.dispatchEvent(new PointerEvent('pointerdown', init)); } catch (err) { console.warn('Klick durchreichen', err); } finally { this._through = false; }
    // 1.59: auch den Klick (Link, Checkliste, Anhang, Video) – das Drücken ging an die ersetzte Vorschau, deshalb
    // schickt der Browser selbst keinen click. Kommt doch einer (gleiche Aufgabe), wird nichts doppelt ausgelöst.
    const x0 = e.clientX, y0 = e.clientY;
    let native = false;
    const onClick = () => { native = true; };
    document.addEventListener('click', onClick, true);
    const up = (ev) => {
      window.removeEventListener('pointerup', up, true);
      setTimeout(() => {
        document.removeEventListener('click', onClick, true);
        if (native || Math.hypot(ev.clientX - x0, ev.clientY - y0) > 5) return;
        const t2 = document.elementFromPoint(ev.clientX, ev.clientY);
        if (t2 && vp.contains(t2)) t2.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, composed: true, clientX: ev.clientX, clientY: ev.clientY, button: 0, ctrlKey: ev.ctrlKey, shiftKey: ev.shiftKey, altKey: ev.altKey, metaKey: ev.metaKey, detail: 1 }));
      }, 0);
    };
    window.addEventListener('pointerup', up, true);
  },
  sashDrag(e, sash) {
    e.preventDefault();
    const box = sash.parentNode, n = box._node, i = +sash.dataset.i;
    if (!n) return;
    const a = sash.previousElementSibling, b = sash.nextElementSibling;
    const h = n.dir === 'h';
    const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
    const start = h ? e.clientX : e.clientY, sa = h ? ra.width : ra.height, sb = h ? rb.width : rb.height;
    const tot = n.sizes[i - 1] + n.sizes[i], min = 120;
    sash.classList.add('on');
    sash.setPointerCapture(e.pointerId);
    const move = (ev) => {
      const d = (h ? ev.clientX : ev.clientY) - start;
      const na = clamp(sa + d, Math.min(min, sa), sa + sb - Math.min(min, sb));
      n.sizes[i - 1] = tot * na / (sa + sb); n.sizes[i] = tot - n.sizes[i - 1];
      const all = n.sizes.reduce((x, y) => x + y, 0);
      a.style.flex = `${(n.sizes[i - 1] / all).toFixed(4)} 1 0px`; b.style.flex = `${(n.sizes[i] / all).toFixed(4)} 1 0px`;
    };
    const up = () => {
      sash.classList.remove('on');
      sash.removeEventListener('pointermove', move); sash.removeEventListener('pointerup', up); sash.removeEventListener('pointercancel', up);
      UiState.saveSoon(); Canvas.layoutSoon && Canvas.layoutSoon();
    };
    sash.addEventListener('pointermove', move); sash.addEventListener('pointerup', up); sash.addEventListener('pointercancel', up);
    if (!sash._dbl) { sash._dbl = true; sash.addEventListener('dblclick', () => this.equalize(n)); }
  },
  /* Tab ziehen (Maus): in eine Tableiste = umsortieren/verschieben, auf den Rand eines Bereichs = dort teilen */
  tabDrag(e, tab) {
    const x0 = e.clientX, y0 = e.clientY, from = tab.dataset.pane, i = +tab.dataset.i;
    let ghost = null, mark = null, target = null;
    const clear = () => { if (mark) mark.remove(); mark = null; };
    const move = (ev) => {
      if (!ghost) {
        if (Math.hypot(ev.clientX - x0, ev.clientY - y0) < 6) return;
        ghost = el('div', { class: 'pt-ghost', text: tab.querySelector('.pt-t').textContent });
        document.body.append(ghost);
        tab.classList.add('dragging');
      }
      ghost.style.left = (ev.clientX + 12) + 'px'; ghost.style.top = (ev.clientY + 8) + 'px';
      clear();
      target = this.dockTarget(ev.clientX, ev.clientY, 'tab', null);
      mark = this.showDock(target);
    };
    const up = () => {
      removeEventListener('pointermove', move, true); removeEventListener('pointerup', up, true); removeEventListener('pointercancel', cancel, true);
      clear();
      if (!ghost) return;
      ghost.remove(); tab.classList.remove('dragging');
      this._dragged = true; setTimeout(() => { this._dragged = false; }, 0);
      if (!target) return;
      if (target.kind === 'float') { this.detach(from, i, target.at); return; }
      if (target.kind === 'edge') { this.tabToEdge(from, i, target.dir, target.after); return; }
      if (target.kind === 'split') this.moveTab(from, i, target.pane, 0, target.dir, target.after);
      else if (target.pane !== from || target.j !== i) this.moveTab(from, i, target.pane, target.j);
    };
    const cancel = () => { target = null; up(); };
    addEventListener('pointermove', move, true); addEventListener('pointerup', up, true); addEventListener('pointercancel', cancel, true);
  },

  /* ------------------------------------------------------------ Vorschau anderer Bereiche */
  styleSheet() {
    if (this._css) return this._css;
    // App-Styles einmal einsammeln; body/html/:root gelten in der Vorschau für .pv-root
    let txt = '';
    for (const sh of document.styleSheets) {
      let rules;
      try { rules = sh.cssRules; } catch (e) { continue; }
      for (const r of rules) txt += r.cssText + '\n';
    }
    txt = txt.replace(/:root\b/g, '.pv-root').replace(/(^|[\s,>+~(}])(html|body)(?=[\s.,:\[#>+~{)])/g, '$1.pv-root');
    txt += `
:host { display: block; position: relative; overflow: hidden; contain: strict; }
.pv-root { position: absolute; inset: 0; height: auto; display: flex; flex-direction: column; overflow: hidden; background: var(--canvas); cursor: default; }
.pv-root > * { pointer-events: none; }
.pv-root #page-frame { flex: 1; border-top-width: 0; }
.pv-ph { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; padding: 16px; color: var(--ink-3); font-size: 13px; text-align: center; }
.pv-ph b { color: var(--ink); font-size: 20px; font-weight: 300; }
`;
    if (typeof CSSStyleSheet === 'function' && 'adoptedStyleSheets' in Document.prototype) {
      try { const s = new CSSStyleSheet(); s.replaceSync(txt); this._css = { sheet: s }; return this._css; } catch (e) { /* älterer Browser */ }
    }
    this._css = { text: txt };
    return this._css;
  },
  syncRoot(pv) {
    pv.className = 'pv-root ' + document.body.className;
    if (document.body.dataset.theme) pv.dataset.theme = document.body.dataset.theme;
  },
  ensureHost(r) {
    if (r.host) return;
    const host = el('div', { class: 'pane-pv' });
    const root = host.attachShadow({ mode: 'open' });
    const css = this.styleSheet();
    if (css.sheet) root.adoptedStyleSheets = [css.sheet];
    else root.append(el('style', { text: css.text }));
    const pv = el('div', { class: 'pv-root' });
    root.append(pv);
    this.syncRoot(pv);
    host.addEventListener('wheel', (e) => this.onWheel(e, r), { passive: false });
    r.host = host; r.pv = pv;
  },
  showShot(id) {
    const r = this.els.get(id), p = this.find(id);
    if (!r || !p) return;
    this.ensureHost(r);
    if (r.host.parentNode !== r.body) r.body.replaceChildren(r.host);
    const pid = p.tabs[p.cur], shot = this.shots.get(id);
    r.wrap.dataset.pid = pid || '';
    this.calcInactive();
    if (shot && shot.pid === pid && shot.frame) {
      if (shot.frame.parentNode !== r.pv) r.pv.replaceChildren(shot.frame);
      if (shot.dirty) this.want(id);
      return;
    }
    const sec = pid && Tree.groupOfPage(pid);
    r.pv.replaceChildren(el('div', { class: 'pv-ph' },
      el('b', { text: pid ? this.title(pid) : 'Leerer Tab' }),
      el('span', { text: pid ? (sec ? sec.name + ' · ' : '') + 'Klicken, um hier zu arbeiten' : 'Klicken, um hier eine Seite zu öffnen' })));
    if (pid) this.want(id);
  },
  want(id) { this.queue.add(id); this.pumpSoon(); },
  pumpSoon() {
    if (this._pumpT || !this.queue.size) return;
    this._pumpT = setTimeout(() => { this._pumpT = null; this.pump(); }, 180);
  },
  /* Ruhe: nichts in Bearbeitung, nichts ausgewählt, kein Zeiger gedrückt */
  quiet() {
    if (!Store.loaded || App.preview || this._down || document.hidden) return false;
    if (typeof Export !== 'undefined' && Export.rendering) return false;
    if (Canvas.editing || Canvas.drag || Canvas.sel.size || Canvas.selLink || Canvas.selImg || Canvas.linkDrag) return false;
    if (typeof Draw !== 'undefined' && Draw.sel && Draw.sel.size) return false;
    if (typeof Sheet !== 'undefined' && Sheet.active) return false;
    if (document.activeElement && document.activeElement.id === 'page-title') return false;
    return true;
  },
  pump() {
    if (this.narrow) return;   // unsichtbar – später
    const S = this.S;
    for (const id of [...this.queue]) {
      const p = this.find(id);
      if (!p || id === S.active) { this.queue.delete(id); continue; }
      const pid = p.tabs[p.cur];
      if (!pid) { this.queue.delete(id); continue; }
      if (!Store.pages[pid]) {
        if (!Store.has(pid)) { this.queue.delete(id); continue; }
        Lazy.need([pid]).then(() => this.pumpSoon());
        continue;
      }
      if (!this.quiet()) { setTimeout(() => this.pumpSoon(), 700); return; }
      this.queue.delete(id);
      // dieselbe Seite wie die Zeichenfläche (ohne Sichtbereich): einfach kopieren; sonst kurz tauschen
      const shot = this.shots.get(id);
      const view = shot && shot.pid === pid ? shot.view : null;
      if (pid === Canvas.pageId && !Draw._cull) this.shots.set(id, { pid, view: view || { ...Canvas.view }, frame: this.cloneLive(true, view), cull: null });
      else this.swapShot(id, pid, view);
      this.showShot(id);
      if (this.queue.size) this.pumpSoon();
      return;   // je Durchgang höchstens eine Seite – das Programm bleibt bedienbar
    }
  },
  /* Seite pid kurz in der Zeichenfläche zeigen, kopieren und zurücktauschen (ohne Bild dazwischen) */
  swapShot(id, pid, view) {
    const page = Store.pages[pid];
    if (!page) return;
    const cur = Canvas.page, curView = { ...Canvas.view };
    const es = $('#empty-state'), esHidden = es.hidden;
    const v = view || Store.ui.views[pid];
    Canvas.view = v ? { x: +v.x || 0, y: +v.y || 0, z: clamp(+v.z || 1, ZOOM_MIN, ZOOM_MAX) } : { x: 40, y: 30, z: 1 };
    let frame = null;
    try {
      Canvas.showPage(page);
      if (!v) {   // wie beim ersten Öffnen: Anfang der Seite oben links
        const C = Canvas.contentRect && Canvas.contentRect();
        if (C) { Canvas.view = { z: 1, x: 40 - C.x, y: 30 - C.y }; Canvas.applyView(); }
      }
      es.hidden = true;
      frame = this.cloneLive(false);
      this.shots.set(id, { pid, view: { ...Canvas.view }, frame, cull: this.cullNow() });
    } finally {
      Canvas.view = curView;
      Canvas.showPage(cur);
      es.hidden = esHidden;
      if (Canvas.pageId) Store.ui.views[Canvas.pageId] = { x: Math.round(curView.x), y: Math.round(curView.y), z: curView.z };
    }
  },
  /* Momentaufnahme des aktiven Bereichs, bevor die Zeichenfläche in einen anderen wandert */
  snap() {
    const id = this.S.active;
    if (!Canvas.pageId || !Canvas.page) { this.shots.delete(id); return; }
    this.shots.set(id, { pid: Canvas.pageId, view: { ...Canvas.view }, frame: this.cloneLive(false), cull: this.cullNow() });
  },
  cullNow() { return typeof Draw !== 'undefined' && Draw._cull ? { ...Draw._cull } : null; },
  /* Kopie von #page-frame. Zeichnungen: auf Seiten mit sehr vielen Strichen liegt nur der Sichtbereich (und ein
   * Bildschirm ringsum) im DOM (1.30) – die Kopie bekommt genau diese, aber vollständig ('view'); wird die Vorschau
   * darüber hinaus verschoben, wird sie neu aufgenommen (onWheel). Alle 2700 Striche einer OneNote-Seite in jeder
   * Vorschau kosteten beim Aufnehmen ~350 ms und machten jedes Bild langsamer. */
  cloneLive(restore, view) {
    if (typeof Draw !== 'undefined' && Draw._cull) Draw.render('view');
    const c = this.frame.cloneNode(true);
    c.removeAttribute('id'); c.id = 'page-frame';
    for (const n of c.querySelectorAll('#fs-exit, #preview-glass, #marquee, #anchors, #hscroll, #vscroll, #scroll-corner, #version-bar, #xl-bar, #layer-handles, .box-rs, .sock, .box-grip, .kt-tool, .xl-sel, .xl-fill')) n.remove();
    for (const n of c.querySelectorAll('[contenteditable]')) n.removeAttribute('contenteditable');
    for (const n of c.querySelectorAll('.sel, .editing, .hover')) n.classList.remove('sel', 'editing', 'hover');
    for (const n of c.querySelectorAll('[id]')) if (/^(sb-|qat-)/.test(n.id)) n.removeAttribute('id');
    const t = c.querySelector('#page-title');
    if (t) { t.setAttribute('value', Canvas.page ? Canvas.page.title : ''); t.disabled = true; t.style.opacity = '1'; }
    // Bilder, die noch laden (Webseite: aus IndexedDB), in der Kopie selbst laden
    for (const im of c.querySelectorAll('img')) {
      if (im.getAttribute('src')) continue;
      const n = im.dataset.ktImg || im.dataset.ktSrc;
      if (n) Backend.setImg(im, n);
    }
    c.inert = true;
    if (view) this.applyShotView(c, Canvas.page, view);
    return c;
  },
  applyShotView(frame, page, v) {
    const st = viewStyle(page, v);
    const w = frame.querySelector('#world'), vp = frame.querySelector('#viewport');
    if (w) w.style.transform = st.transform;
    if (vp) { vp.style.backgroundPosition = st.bgPos; vp.style.backgroundImage = st.bgImage; vp.style.backgroundSize = st.bgSize; vp.style.backgroundColor = st.bgColor; }
  },
  /* Mausrad über einer Vorschau: verschieben (Strg: zoomen), gemerkt für das nächste Öffnen */
  onWheel(e, r) {
    const id = r.wrap.dataset.pane, shot = this.shots.get(id);
    if (!shot || !shot.frame) return;
    e.preventDefault();
    const v = shot.view;
    if (e.ctrlKey || e.metaKey) {
      const vp = shot.frame.querySelector('#viewport'), b = (vp || r.host).getBoundingClientRect();
      const f = Math.exp(-e.deltaY * 0.0022), z = clamp(v.z * f, ZOOM_MIN, ZOOM_MAX);
      const wx = (e.clientX - b.left - v.x) / v.z, wy = (e.clientY - b.top - v.y) / v.z;
      v.z = z; v.x = e.clientX - b.left - wx * z; v.y = e.clientY - b.top - wy * z;
    } else {
      const k = e.deltaMode === 1 ? 16 : 1;
      v.x -= (e.shiftKey ? e.deltaY : e.deltaX) * k; if (!e.shiftKey) v.y -= e.deltaY * k;
    }
    this.applyShotView(shot.frame, Store.pages[shot.pid], v);
    Store.ui.views[shot.pid] = { x: Math.round(v.x), y: Math.round(v.y), z: v.z };
    UiState.saveSoon();
    // aus dem aufgenommenen Bereich der Zeichnungen hinaus: neu aufnehmen
    const C = shot.cull;
    if (C) {
      const b = r.host.getBoundingClientRect(), x1 = -v.x / v.z, y1 = -v.y / v.z, x2 = (b.width - v.x) / v.z, y2 = (b.height - v.y) / v.z;
      if (x1 < C.x1 || y1 < C.y1 || x2 > C.x2 || y2 > C.y2) { shot.dirty = true; clearTimeout(this._wheelT); this._wheelT = setTimeout(() => this.want(id), 250); }
    }
  },
  /* Seite geändert (Hist.touchPage): Vorschauen anderer Bereiche mit dieser Seite später auffrischen */
  touched(pid) {
    if (!this.inactivePids.has(pid)) return;
    for (const p of this.leaves()) {
      if (p.id === this.S.active || p.tabs[p.cur] !== pid) continue;
      const s = this.shots.get(p.id);
      if (s) s.dirty = true;
      this.queue.add(p.id);
    }
    // grosse Seiten (viele Striche: alle müssen in die Kopie) seltener auffrischen
    const pg = Store.pages[pid], big = pg && (pg.drawings.length > 300 || pg.boxes.length > 300);
    clearTimeout(this._touchT);
    this._touchT = setTimeout(() => this.pumpSoon(), big ? 3000 : 900);
  },
  refreshAll() {
    for (const p of this.leaves()) {
      if (p.id === this.S.active) continue;
      const s = this.shots.get(p.id);
      if (s) s.dirty = true;
      this.queue.add(p.id);
    }
    this.pumpSoon();
  },
  /* Bilder der Vorschau-Seiten (die Webseite gibt sonst ihre Objekt-URLs frei) */
  keepNames() {
    const out = [];
    if (!this.S) return out;
    for (const pid of this.inactivePids) {
      const p = Store.pages[pid];
      if (p) out.push(...(JSON.stringify([p.boxes, p.drawings]).match(/[0-9a-f]{40}\.[a-z0-9]{1,8}/g) || []));
    }
    return out;
  },
};
