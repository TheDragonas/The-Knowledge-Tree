'use strict';
/* Add-Ins und Makros – die Erweiterungsschnittstelle von KnowledgeTree (1.66, ausgebaut 1.69).
 *
 * ADD-IN = JavaScript, das sich mit KnowledgeTree.register({ id, name, version, desc, requires, setup(api) }) anmeldet.
 * Woher Add-Ins kommen (alle erscheinen im Register „Add-Ins“ mit einem Häkchen zum Ein-/Ausschalten):
 *   eingebaut   Plugins.builtin(def) – im Programm mitgeliefert (z.B. Chem-Draw, addon-chemdraw.js), standardmässig an
 *   Ordner      Desktop-Programm: Ordner „Add-Ins“ neben der EXE, jede *.js-Datei darin wird beim Start geladen
 *   Notizbuch   „Add-In hinzufügen“ in der Browser-Fassung: Datei im Speicher (Store.ui.plugins = [{ id, name, asset, on }])
 * Ein/aus: Store.ui.addins = { id: true|false } (eingebaut und Ordner), bei Notizbuch-Add-Ins das Feld on.
 *
 * Die Schnittstelle api (vollständig beschrieben in web/addins/_Add-In-Vorlage_KI.js – EINE Datei: Anleitung für
 * eine KI als Kommentar + lauffähiges Gerüst; liegt im Programm im Ordner „Add-Ins“, „_“ = wird dort nicht geladen):
 *   addCommand · addButton · addGroup · addTab · addIcon · addMenuItem · addShortcut · addStyle · addWords · addHelp
 *   addFunction · on(Ereignis) · ui · store · canvas · sheet · commit · h (el, icon, escapeHtml)
 * Alles, was ein Add-In anmeldet, wird beim Ausschalten wieder entfernt (auch Befehle, die es überschrieben hat:
 * die alten kommen zurück). Gibt setup eine Funktion zurück oder hat das Add-In teardown(), wird sie dabei aufgerufen.
 *
 * MAKRO = JavaScript in der Arbeitsmappe (p.office.macros = [{ name, code }]), Aufruf mit dem Objekt kt:
 *   kt.get('B2') · kt.set('B2', 5) · kt.range('A1:C3') → [[…]] · kt.setRange('A1', [[1, 2], [3, 4]])
 *   kt.sheet('Daten') · kt.sheets() · kt.selection() · kt.select('A1:B2') · kt.msg('…') · await kt.input('Frage')
 *   kt.recalc() · Bezüge auch mit Blatt: kt.get('Daten!B2')
 * Makro aufzeichnen schreibt jede Zelländerung als kt.set(…). VBA-Makros in .xlsm bleiben erhalten (nicht ausgeführt).
 * Makros und Add-Ins sind eigener Code und laufen mit allen Rechten der Seite – nur Vertrauenswürdiges laden. */
const Plugins = {
  API: 2,                   // Version der Schnittstelle (1 = 1.66, 2 = 1.69)
  defs: new Map(),          // aktive Add-Ins: id → { id, name, version, desc, source, def, api, undo: [] }
  builtins: new Map(),      // eingebaute: id → def
  folder: [],               // Add-Ins-Ordner (Programm): [{ datei, zeit, defs: [def], err }]
  buttons: [],              // { plugin, tab, mode, group, el() }
  groups: [],               // { plugin, tab, mode, label, before, after, build }
  tabs: [],                 // { plugin, id, label, modes, after }
  menus: [],                // { plugin, where, label, icon, key, when, disabled, run }
  keys: [],                 // { plugin, key, fn, desc }
  helps: [],                // { plugin, title, rows }
  words: [],                // { plugin, list: [] | () => [] }
  hooks: {},                // Ereignis → [{ plugin, fn }]
  errors: [],
  EVENTS: ['cellChange', 'pageOpen', 'selectionChange', 'imageRender', 'imageOpen', 'keydown', 'ready'],
  failed: new Map(),        // id → Fehlermeldung (setup fehlgeschlagen)
  TEMPLATE_FILE: '_Add-In-Vorlage_KI.js',   // 1.70: EINE Datei – Anleitung (Kommentar) + Gerüst; „_“ = im Ordner nie geladen
  TEMPLATE_TEXT: '%%KT_ADDIN_VORLAGE%%',   // Webseiten-Fassung: build_web.py setzt die Vorlage hier ein
  stored() { return Array.isArray(Store.ui.plugins) ? Store.ui.plugins.filter(p => p && p.asset) : []; },
  st() { const u = Store.ui; if (!u.addins || typeof u.addins !== 'object' || Array.isArray(u.addins)) u.addins = {}; return u.addins; },
  appVersion() { return (Store.info && Store.info.version) || '1.76'; },   // Fallback bei jeder Version nachführen

  /* ---------------------------------------------------------------- Laden */
  /* eingebautes Add-In anmelden (beim Laden der Skripte – aktiviert wird es in syncBuiltins) */
  builtin(def) { this.builtins.set(def.id, def); },
  isOn(id) {
    const s = this.stored().find(x => x.id === id);
    if (s) return s.on !== false;
    const v = this.st()[id];
    if (v !== undefined) return !!v;
    const b = this.builtins.get(id);
    return b ? b.defaultOn !== false : true;
  },
  /* Eingebaute nach dem gespeicherten Zustand ein-/ausschalten (früh beim Start, damit das Menüband gleich stimmt) */
  syncBuiltins() {
    let changed = false;
    for (const [id, def] of this.builtins) {
      const on = this.isOn(id), act = this.defs.get(id);
      if (on && !act) { this.activate(def, { source: 'eingebaut' }); changed = true; }
      else if (!on && act && act.source === 'eingebaut') { this.unregister(id); changed = true; }
    }
    return changed;
  },
  async init() {
    if (this.syncBuiltins()) this.changed();
    // Notizbuch-Add-Ins (Datei im Speicher)
    for (const s of this.stored()) {
      if (s.on === false) continue;
      try { const b = await OfficePages.assetBlob(s.asset); if (b) for (const d of this.parse(await b.text())) this.activate(d, { source: 'notizbuch', asset: s.asset }, true); }
      catch (e) { this.errors.push(`${s.name || s.id}: ${e.message}`); console.warn('[KnowledgeTree] Add-In', s.name, e); }
    }
    await this.loadFolder(true);
    this.changed();
    this.emit('ready', {});
  },
  /* Add-Ins-Ordner neben der EXE (1.69): jede *.js-Datei; neue werden eingeschaltet (mit Hinweis) */
  async loadFolder(first) {
    if (!Backend.addinFolder) return;
    let list;
    try { list = await Backend.addinList(); } catch (e) { console.warn('[KnowledgeTree] Add-Ins-Ordner', e); return; }
    for (const f of this.folder) for (const d of f.defs) { const a = this.defs.get(d.id); if (a && a.source === 'ordner') this.unregister(d.id); }
    this.folder = [];
    const neu = [];
    for (const f of list) {
      const e = { datei: f.datei, zeit: f.zeit, defs: [], err: '' };
      this.folder.push(e);
      try { e.defs = this.parse(f.code); } catch (er) { e.err = er.message; this.errors.push(`${f.datei}: ${er.message}`); continue; }
      for (const d of e.defs) {
        if (this.st()[d.id] === undefined && !this.stored().some(x => x.id === d.id)) { this.st()[d.id] = true; neu.push(d.name || d.id); }
        if (this.isOn(d.id)) this.activate(d, { source: 'ordner', datei: f.datei }, true);
      }
    }
    if (neu.length) { UiState.saveSoon(); if (first !== 'still') UI.toast(`Neues Add-In im Ordner: ${neu.map(n => '„' + n + '“').join(', ')} – eingeschaltet (Register „Add-Ins“)`, 5000); }
  },
  /* Code eines Add-Ins ausführen: es meldet sich mit KnowledgeTree.register an → Liste der Anmeldungen (noch ohne setup) */
  parse(code) {
    const found = [];
    const KnowledgeTree = { version: this.appVersion(), api: this.API, register: (def) => { if (!def || !def.id) throw new Error('Add-In ohne id'); found.push(def); } };
    new Function('KnowledgeTree', '"use strict";\n' + code)(KnowledgeTree);
    if (!found.length) throw new Error('Das Add-In meldet sich nicht an (KnowledgeTree.register fehlt)');
    return found;
  },
  /* 1.66: Code laden und gleich einschalten */
  load(code, meta = {}) { return this.parse(code).map(d => this.register(d, meta)); },
  /* einschalten, Fehler melden statt abbrechen */
  activate(def, meta, quiet) {
    try { const d = this.register(def, meta); this.failed.delete(def.id); return d; }
    catch (e) {
      this.failed.set(def.id, e.message);
      const msg = `${def.name || def.id}: ${e.message}`;
      if (!this.errors.includes(msg)) this.errors.push(msg);
      console.warn('[KnowledgeTree] Add-In', def.id, e);
      if (!quiet) UI.toast('Add-In ' + msg, 6000);
      return null;
    }
  },
  newer(a, b) { const x = String(a).split('.').map(Number), y = String(b).split('.').map(Number); for (let i = 0; i < Math.max(x.length, y.length); i++) { if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0); } return false; },
  register(def, meta = {}) {
    if (!def || !def.id) throw new Error('Add-In ohne id');
    if (def.requires && this.newer(def.requires, this.appVersion())) throw new Error(`braucht KnowledgeTree ${def.requires} (vorhanden: ${this.appVersion()})`);
    this.unregister(def.id);
    const d = { id: String(def.id), name: def.name || def.id, version: def.version || '', desc: def.desc || '', source: meta.source || 'notizbuch', meta, def, undo: [] };
    d.api = this.api(d);
    this.defs.set(d.id, d);
    try {
      if (typeof def.setup === 'function') { const r = def.setup(d.api); if (typeof r === 'function') d.undo.push(r); }
    } catch (e) { this.unregister(d.id); throw e; }
    return d;
  },
  unregister(id) {
    const d = this.defs.get(id);
    if (d) {
      for (const f of d.undo.splice(0).reverse()) { try { f(); } catch (e) { console.warn('[KnowledgeTree] Add-In', id, e); } }
      if (d.def && typeof d.def.teardown === 'function') { try { d.def.teardown(d.api); } catch (e) { console.warn(e); } }
    }
    for (const k of ['buttons', 'groups', 'tabs', 'menus', 'keys', 'helps', 'words']) this[k] = this[k].filter(x => x.plugin !== id);
    for (const k of Object.keys(this.hooks)) this.hooks[k] = this.hooks[k].filter(h => h.plugin !== id);
    if (typeof XL !== 'undefined') for (const [n, f] of Object.entries(XL.F)) if (f.plugin === id) { delete XL.F[n]; const i = XL.FN_INFO.findIndex(x => x.en === n && x.plugin === id); if (i >= 0) XL.FN_INFO.splice(i, 1); }
    for (const c of Object.keys(COMMANDS)) if (c.startsWith(`plugin:${id}:`)) delete COMMANDS[c];
    this.defs.delete(id);
  },
  /* nach Ein-/Ausschalten: Menüband, Seite und Wörter neu */
  changed() {
    if (typeof Spell !== 'undefined') Spell._fach = null;
    if (typeof Ribbon === 'undefined' || !Ribbon.tab) return;
    Ribbon.buildStrip();
    Ribbon.show(Ribbon.TABS.some(t => t.id === Ribbon.tab) ? Ribbon.tab : 'addins');
    if (typeof Canvas !== 'undefined' && Canvas.page && Canvas.els) { for (const [id, e] of Canvas.els) { const b = Canvas.box(id); if (b && b.images && b.images.length && e.querySelector('.fl')) Canvas.renderFloats(b, e); } }
  },

  /* ---------------------------------------------------------------- Schnittstelle */
  api(d) {
    const self = this;
    const guard = (fn, what) => (...a) => {
      try { const r = fn(...a); if (r && typeof r.catch === 'function') r.catch(e => UI.toast(`${d.name}: ${e.message}`, 5000)); return r; }
      catch (e) { console.warn('[KnowledgeTree] Add-In', d.id, what || '', e); UI.toast(`${d.name}: ${e.message}`, 5000); return undefined; }
    };
    const safe = (fn) => (...a) => { try { return fn(...a); } catch (e) { return false; } };
    let n = 0;
    const api = {
      id: d.id,
      version: this.appVersion(),
      apiVersion: this.API,
      /* Befehl (für Knöpfe, Menüs, Tastenkürzel: Cmd.run(name, arg)) – ein gleichnamiger Befehl kommt beim Ausschalten zurück */
      addCommand(name, c = {}) {
        const had = Object.prototype.hasOwnProperty.call(COMMANDS, name), prev = COMMANDS[name];
        COMMANDS[name] = { run: guard(c.run || (() => { }), name), enabled: c.enabled ? safe(c.enabled) : undefined, active: c.active ? safe(c.active) : undefined, plugin: d.id };
        d.undo.push(() => { if (COMMANDS[name] && COMMANDS[name].plugin === d.id) { if (had) COMMANDS[name] = prev; else delete COMMANDS[name]; } });
        return name;
      },
      /* Knopf im Menüband: { tab: 'addins', mode: '*', group, label, icon, title, big, check, cmd + arg | run, menu, enabled, active } */
      addButton(b = {}) {
        const cmd = b.cmd || api.addCommand(`plugin:${d.id}:${n++}`, { run: b.run, enabled: b.enabled, active: b.active });
        const make = (R) => {
          const label = b.label || 'Add-In', ic = b.icon || 'puzzle', title = b.title || '';
          if (b.menu) {
            const open = (anchor) => { const items = typeof b.menu === 'function' ? b.menu() : b.menu; UI.menu(self.menuItems(items), 0, 0, { anchor }); };
            return b.big === false ? R.dropBtn('small', icon(ic, 16), label, title, open) : R.dropBtn('big', icon(ic, 28), label, title, open);
          }
          if (b.check) return R.check(cmd, label, title, b.arg);
          return b.big === false || b.small ? R.small(cmd, label, ic, title, b.arg) : R.big(cmd, label, ic, title, b.arg);
        };
        self.buttons.push({ plugin: d.id, tab: b.tab || 'addins', mode: b.mode || '*', group: b.group || d.name, make, cmd });
        self.soon();
        return cmd;
      },
      /* ganze Gruppe: { tab, mode, label, before: 'Hilfsmittel' | after, build(R) → Element oder [Elemente] } (R = Ribbon-Bausteine) */
      addGroup(g = {}) {
        if (typeof g.build !== 'function') throw new Error('addGroup: build fehlt');
        self.groups.push({ plugin: d.id, tab: g.tab || 'addins', mode: g.mode || '*', label: g.label || d.name, before: g.before, after: g.after, build: g.build });
        self.soon();
      },
      /* eigenes Register: { id, label, modes: '*' | ['frei', 'dok', 'tab', 'folie'], after: 'ansicht' } */
      addTab(t = {}) {
        if (!t.id || !t.label) throw new Error('addTab: id und label nötig');
        self.tabs.push({ plugin: d.id, id: String(t.id), label: String(t.label), modes: t.modes || '*', after: t.after || null });
        self.soon(true);
        return t.id;
      },
      /* Symbol (SVG-Inhalt für viewBox 0 0 24 24, Linien mit currentColor) */
      addIcon(name, svg) {
        const had = Object.prototype.hasOwnProperty.call(ICONS, name), prev = ICONS[name];
        ICONS[name] = String(svg);
        d.undo.push(() => { if (had) ICONS[name] = prev; else delete ICONS[name]; });
      },
      /* Kontextmenü (Rechtsklick): where 'box' (Feld/Bild/Tabelle) | 'canvas' (freie Fläche) | 'page' (Seitenliste) */
      addMenuItem(m = {}) {
        self.menus.push({ plugin: d.id, where: m.where || 'box', label: m.label || d.name, icon: m.icon || 'puzzle', key: m.key, when: m.when ? safe(m.when) : () => true, disabled: m.disabled ? safe(m.disabled) : () => false, run: guard(m.run || (() => { }), 'Menü') });
      },
      /* Tastenkürzel 'Strg+Umschalt+K', 'Alt+K', 'F8' … → fn(e); Rückgabe false = nicht verbraucht */
      addShortcut(key, fn, desc) {
        self.keys.push({ plugin: d.id, key: self.normKey(key), label: String(key), fn: guard(fn, key), desc: desc || '' });
      },
      addStyle(css) {
        const s = el('style', { dataset: { addin: d.id } });
        s.textContent = String(css);
        document.head.append(s);
        d.undo.push(() => s.remove());
        return s;
      },
      /* Wörter für die Rechtschreibprüfung (Liste oder Funktion, die eine Liste liefert) */
      addWords(list) { self.words.push({ plugin: d.id, list }); if (typeof Spell !== 'undefined') Spell._fach = null; },
      /* Abschnitt in „Tastenkürzel & Bedienung“ (F1): rows = [['Taste/Geste', 'Wirkung'], …] */
      addHelp(title, rows) { self.helps.push({ plugin: d.id, title: String(title), rows: rows || [] }); },
      /* Tabellenfunktion =NAME(…) (Bereiche kommen als [[…]] an) */
      addFunction(name, fn, o = {}) {
        const N = String(name).toUpperCase();
        if (!/^[A-ZÄÖÜ][A-ZÄÖÜ0-9_.]*$/.test(N)) throw new Error('Ungültiger Funktionsname: ' + name);
        const conv = (v) => v && typeof v.rows === 'function' ? v.rows() : v === XL.MISSING ? undefined : v;
        const had = Object.prototype.hasOwnProperty.call(XL.F, N), prev = XL.F[N];
        XL.F[N] = {
          min: o.min ?? 0, max: o.max ?? 255, plugin: d.id,
          fn: (a) => {
            try {
              const r = fn(...a.map(conv));
              if (Array.isArray(r)) return new XL.Arr(Array.isArray(r[0]) ? r : [r]);
              if (r === undefined || r === null) return null;
              if (typeof r === 'number' && !isFinite(r)) return XL.ERR.num;
              return r;
            } catch (e) { return XL.ERR.value; }
          },
        };
        if (!XL.CATS.includes('Add-Ins')) XL.CATS.push('Add-Ins');
        XL.FN_INFO.push({ de: N, en: N, sig: o.sig || '…', desc: (o.desc || 'Funktion aus dem Add-In') + ` (${d.name})`, cat: 'Add-Ins', plugin: d.id });
        d.undo.push(() => {
          if (XL.F[N] && XL.F[N].plugin === d.id) { if (had) XL.F[N] = prev; else delete XL.F[N]; }
          const i = XL.FN_INFO.findIndex(x => x.en === N && x.plugin === d.id); if (i >= 0) XL.FN_INFO.splice(i, 1);
        });
        if (typeof Sheet !== 'undefined' && Sheet.recalc) try { Sheet.recalc(true); } catch (e) { /* */ }
      },
      /* Ereignisse: cellChange, pageOpen, selectionChange, imageRender, imageOpen (true = erledigt), keydown, ready */
      on(ev, fn) {
        if (!self.EVENTS.includes(ev)) console.warn('[KnowledgeTree] Add-In', d.id, 'unbekanntes Ereignis', ev);
        (self.hooks[ev] || (self.hooks[ev] = [])).push({ plugin: d.id, fn });
      },
      get sheet() { return Macros.api(); },
      ui: {
        toast: (t, ms) => UI.toast(String(t), ms || 3500),
        info: (t, html) => UI.info(String(t), html),
        prompt: (t, v) => UI.prompt(String(t), v == null ? '' : String(v)),
        confirm: (t, text) => UI.confirm(String(t), text ? String(text) : ''),
        dialog: (build, o) => UI.dialog(build, o || {}),
        menu: (items, anchor) => UI.menu(self.menuItems(items), anchor && anchor.x != null ? anchor.x : 0, anchor && anchor.y != null ? anchor.y : 0, anchor instanceof Element ? { anchor } : {}),
        download: (name, data, type) => Export.download(String(name), data instanceof Blob ? data : new Blob([data], { type: type || 'text/plain' })),
      },
      store: {
        get: (k) => ((Store.ui.pluginData || {})[d.id] || {})[k],
        set: (k, v) => { const all = Store.ui.pluginData || (Store.ui.pluginData = {}); (all[d.id] || (all[d.id] = {}))[k] = v; UiState.saveSoon(); },
      },
      /* Seite und Objekte */
      canvas: {
        page: () => Canvas.page,
        pageId: () => Canvas.pageId,
        box: (id) => Canvas.box(id),
        selection: () => [...Canvas.sel],
        center: () => Canvas.viewCenter(),
        select: (ids) => Canvas.select(ids),
        insertText(html, at) { if (!Canvas.page) return null; const c = at || Canvas.viewCenter(); return Canvas.createBoxAt({ x: c.x, y: c.y }, { html: String(html), noFocus: true, label: d.name }); },
        insertImage(blob, opts = {}) { if (!Canvas.page) return null; return Canvas.insertImage(opts.box || null, blob, opts.box ? null : (opts.at || Canvas.viewCenter()), opts.data || null, { tight: true, label: opts.label || d.name }); },
        render: () => Canvas.render(true),
      },
      /* Änderung an der Seite als ein Schritt (Rückgängig) speichern */
      commit(label) { Hist.touchPage(Canvas.pageId); Hist.commit(label || d.name); },
      run: (cmd, arg) => Cmd.run(cmd, arg),
      h: { el, icon, escapeHtml },
    };
    return api;
  },
  soon(strip) {
    if (typeof Ribbon === 'undefined' || !Ribbon.tab) return;
    clearTimeout(this._soon);
    this._strip = this._strip || strip;
    this._soon = setTimeout(() => { const s = this._strip; this._strip = false; if (s) Ribbon.buildStrip(); Ribbon.show(Ribbon.tab); }, 0);
  },
  /* Menüeinträge eines Add-Ins: { label, icon, run | action, checked, disabled } oder '-' */
  menuItems(items) { return (items || []).map(it => it && typeof it === 'object' && it.run && !it.action ? { ...it, action: it.run } : it); },

  /* ---------------------------------------------------------------- Ereignisse */
  emit(ev, data) {
    for (const h of this.hooks[ev] || []) { try { h.fn(data); } catch (e) { console.warn('[KnowledgeTree] Add-In', h.plugin, e); } }
  },
  /* erstes Add-In, das true zurückgibt, hat das Ereignis erledigt (z.B. imageOpen) */
  handle(ev, data) {
    for (const h of this.hooks[ev] || []) { try { if (h.fn(data) === true) return true; } catch (e) { console.warn('[KnowledgeTree] Add-In', h.plugin, e); } }
    return false;
  },
  has(ev) { return !!(this.hooks[ev] && this.hooks[ev].length); },
  /* von Sheet.setCells: Ereignis + Makro-Aufzeichnung */
  cellsChanged(id, list, label) {
    const b = Canvas.box(id);
    const name = b && b.sheet ? b.sheet.name : '';
    if (Macros.rec && label !== 'Makro') for (const [c, r, raw] of list) Macros.rec.lines.push(`kt.set(${JSON.stringify((name && name !== Macros.rec.sheet ? name + '!' : '') + XL.key(c, r))}, ${JSON.stringify(raw)});`);
    if (this.has('cellChange')) for (const [c, r, raw] of list) this.emit('cellChange', { sheet: name, ref: XL.key(c, r), raw, value: Sheet.value(id, c, r), page: Canvas.pageId });
  },
  /* Tastenkürzel: 'Strg+Umschalt+K' → 'ctrl+shift+k' */
  normKey(k) {
    const parts = String(k).toLowerCase().replace(/\s+/g, '').split('+').filter(Boolean);
    const key = parts.pop() || '';
    const mods = new Set(parts.map(m => ({ strg: 'ctrl', control: 'ctrl', cmd: 'ctrl', meta: 'ctrl', umschalt: 'shift', umsch: 'shift', shift: 'shift', alt: 'alt', option: 'alt' })[m] || m));
    return ['ctrl', 'alt', 'shift'].filter(m => mods.has(m)).concat(key).join('+');
  },
  keyOf(e) {
    // Buchstaben und Ziffern über die Taste (e.code): Strg+Alt (AltGr) und Umschalt ändern sonst e.key
    const c = /^Key([A-Z])$/.exec(e.code || '') || /^Digit(\d)$/.exec(e.code || '');
    const k = (c ? c[1] : e.key).toLowerCase();
    return [(e.ctrlKey || e.metaKey) && 'ctrl', e.altKey && 'alt', e.shiftKey && 'shift'].filter(Boolean).concat(k).join('+');
  },
  /* von App.initKeys: true = ein Add-In hat die Taste verbraucht */
  onKey(e) {
    if (this.has('keydown')) for (const h of this.hooks.keydown) { try { if (h.fn(e) === true) { e.preventDefault(); return true; } } catch (er) { console.warn(er); } }
    if (!this.keys.length) return false;
    const k = this.keyOf(e);
    for (const s of this.keys) if (s.key === k) { if (s.fn(e) !== false) { e.preventDefault(); return true; } }
    return false;
  },
  /* Rechtschreibung: Wörter aller aktiven Add-Ins */
  allWords() {
    const out = [];
    for (const w of this.words) { try { const l = typeof w.list === 'function' ? w.list() : w.list; if (l) for (const x of l) out.push(x); } catch (e) { /* */ } }
    return out;
  },
  /* Kontextmenü: Einträge der Add-Ins für where ('box' | 'canvas' | 'page') */
  menuFor(where, ctx) {
    const out = [];
    for (const m of this.menus) if (m.where === where && m.when(ctx)) out.push({ label: m.label, icon: m.icon, key: m.key, disabled: !!m.disabled(ctx), action: () => m.run(ctx) });
    return out;
  },
  helpRows() {
    const out = [];
    for (const h of this.helps) out.push(['h', h.title], ...h.rows);
    return out;
  },

  /* ---------------------------------------------------------------- Menüband */
  /* Register der Add-Ins für eine Ansicht (frei, dok, tab, folie) */
  tabsFor(mode) { return this.tabs.filter(t => t.modes === '*' || (Array.isArray(t.modes) ? t.modes.includes(mode) : t.modes === mode)); },
  /* Gruppen der Add-Ins in einem Register: [{ el, before, after }] */
  groupsFor(mode, tab) {
    const R = Ribbon, out = [];
    const fits = (x) => x.tab === tab && (x.mode === '*' || x.mode === mode || (Array.isArray(x.mode) && x.mode.includes(mode)));
    for (const g of this.groups.filter(fits)) {
      try {
        const kids = g.build(R);
        const arr = (Array.isArray(kids) ? kids : [kids]).filter(Boolean);
        out.push({ el: R.group(g.label, ...arr), before: g.before, after: g.after, plugin: g.plugin });
      } catch (e) { console.warn('[KnowledgeTree] Add-In', g.plugin, e); }
    }
    const byGroup = new Map();
    for (const b of this.buttons.filter(fits)) { const k = b.plugin + '\u0001' + b.group; if (!byGroup.has(k)) byGroup.set(k, { label: b.group, plugin: b.plugin, bs: [] }); byGroup.get(k).bs.push(b); }
    for (const { label, bs, plugin } of byGroup.values()) {
      const els = [];
      for (const b of bs) { try { els.push(b.make(R)); } catch (e) { console.warn(e); } }
      // kleine Knöpfe untereinander (wie Office), je drei in einer Spalte
      const out2 = [];
      let col = null;
      for (const x of els) {
        if (x.classList && x.classList.contains('small')) { if (!col || col.childElementCount >= 3) { col = R.col(); out2.push(col); } col.append(x); }
        else { col = null; out2.push(x); }
      }
      out.push({ el: R.group(label, ...out2), plugin });
    }
    return out;
  },

  /* ---------------------------------------------------------------- Übersicht */
  /* alle bekannten Add-Ins (aktive, ausgeschaltete und fehlerhafte) – für das Register „Add-Ins“ und „Verwalten“ */
  all() {
    const out = [], seen = new Set();
    const add = (d, source, extra = {}) => {
      if (seen.has(d.id)) return;
      seen.add(d.id);
      const act = this.defs.get(d.id);
      out.push({ id: d.id, name: d.name || d.id, version: d.version || '', desc: d.desc || '', source, on: this.isOn(d.id), active: !!act, err: this.failed.get(d.id) || '', ...extra });
    };
    for (const f of this.folder) {
      if (f.err) { out.push({ id: 'datei:' + f.datei, name: f.datei, version: '', desc: '', source: 'ordner', datei: f.datei, on: false, active: false, err: f.err, broken: true }); continue; }
      for (const d of f.defs) add(d, 'ordner', { datei: f.datei });
    }
    for (const s of this.stored()) add(this.defs.get(s.id) || s, 'notizbuch', { asset: s.asset });
    for (const d of this.builtins.values()) add(d, 'eingebaut');
    for (const d of this.defs.values()) add(d, d.source || 'notizbuch');   // sonst aktiv (z.B. direkt geladen)
    const order = { eingebaut: 0, ordner: 1, notizbuch: 2 };
    return out.sort((a, b) => order[a.source] - order[b.source] || a.name.localeCompare(b.name, 'de'));
  },
  SOURCE: { eingebaut: 'eingebaut', ordner: 'Add-Ins-Ordner', notizbuch: 'im Speicher' },
  /* was ein aktives Add-In beiträgt (für „Verwalten“) */
  parts(id) {
    if (!this.defs.has(id)) return [];
    const out = [];
    const fns = typeof XL !== 'undefined' ? Object.entries(XL.F).filter(([, f]) => f.plugin === id).map(([n]) => '=' + n) : [];
    const tabs = this.tabs.filter(t => t.plugin === id).map(t => '„' + t.label + '“');
    const grp = new Set([...this.buttons.filter(b => b.plugin === id).map(b => b.group), ...this.groups.filter(g => g.plugin === id).map(g => g.label)]);
    if (tabs.length) out.push('Register ' + tabs.join(', '));
    if (grp.size) out.push('Gruppen ' + [...grp].map(g => '„' + g + '“').join(', '));
    if (fns.length) out.push('Funktionen ' + fns.join(', '));
    const m = this.menus.filter(x => x.plugin === id).length, k = this.keys.filter(x => x.plugin === id);
    if (m) out.push(m === 1 ? '1 Menüeintrag' : m + ' Menüeinträge');
    if (k.length) out.push('Tasten ' + k.map(x => x.label).join(', '));
    return out;
  },
  /* Häkchen: ein-/ausschalten */
  async setOn(id, on) {
    const s = this.stored().find(x => x.id === id);
    const f = this.folder.find(x => x.defs.some(d => d.id === id));
    const b = this.builtins.get(id);
    if (s) s.on = on; else this.st()[id] = on;
    this.unregister(id);
    if (on) {
      if (f) this.activate(f.defs.find(d => d.id === id), { source: 'ordner', datei: f.datei });
      else if (s) { try { const bl = await OfficePages.assetBlob(s.asset); if (bl) for (const d of this.parse(await bl.text())) if (d.id === id) this.activate(d, { source: 'notizbuch', asset: s.asset }); } catch (e) { UI.toast('Add-In: ' + e.message, 5000); } }
      else if (b) this.activate(b, { source: 'eingebaut' });
    }
    UiState.saveSoon();
    if (typeof App !== 'undefined' && App.rememberUi) App.rememberUi();
    this.changed();
    const x = this.all().find(a => a.id === id);
    UI.toast(`Add-In „${x ? x.name : id}“ ${on && this.defs.has(id) ? 'eingeschaltet' : 'ausgeschaltet'}`, 2500);
  },
  toggle(id) { return this.setOn(id, !this.isOn(id)); },
  /* Add-In-Datei wählen: Programm → in den Add-Ins-Ordner kopieren, Browser → im Speicher ablegen */
  async addFile() {
    const f = await new Promise((res) => { const inp = el('input', { type: 'file', accept: '.js,text/javascript', style: { display: 'none' } }); inp.addEventListener('change', () => { res(inp.files[0]); inp.remove(); }); document.body.append(inp); inp.click(); });
    if (!f) return;
    return this.addCode(await f.text(), f.name);
  },
  async addCode(code, fileName) {
    // die Vorlage selbst ist kein Add-In (nur das Gerüst „Mein Add-In“) – erklären statt laden
    const tpl = await this.templateText();
    if (tpl && code.replace(/\r\n/g, '\n').trim() === tpl.replace(/\r\n/g, '\n').trim()) {
      UI.info('Das ist die Vorlage', '<p>Diese Datei ist die <b>KI-Vorlage</b> selbst – Anleitung und leeres Gerüst. Gib sie einer KI und beschreibe, was dein Add-In können soll; die Datei, die die KI zurückgibt, fügst du hier hinzu.</p>');
      return false;
    }
    let defs;
    try { defs = this.parse(code); } catch (e) { UI.info('Add-In', `<p>„${escapeHtml(fileName)}“ konnte nicht geladen werden:</p><p><code>${escapeHtml(e.message)}</code></p><p class="bs-note">Tipp: die Meldung der KI geben und um eine korrigierte Datei bitten.</p>`); return false; }
    if (Backend.addinFolder) {
      const name = String(fileName || defs[0].id + '.js').replace(/^[_.]+/, '') || defs[0].id + '.js';   // „_“ am Anfang = wird nicht geladen
      try { await Backend.addinSave(name, code); } catch (e) { UI.info('Add-In', `<p>Konnte nicht in den Add-Ins-Ordner kopiert werden:</p><p><code>${escapeHtml(e.message)}</code></p>`); return false; }
      for (const d of defs) this.st()[d.id] = true;
      await this.loadFolder('still');
    } else {
      const asset = await Backend.saveFile(new Blob([code], { type: 'text/javascript' }), 'js');
      const list = this.stored().filter(x => !defs.some(d => d.id === x.id));
      for (const d of defs) { list.push({ id: d.id, name: d.name, version: d.version, asset, on: true }); this.activate(d, { source: 'notizbuch', asset }); }
      Store.ui.plugins = list;
    }
    UiState.saveSoon();
    this.changed();
    const bad = defs.filter(d => !this.defs.has(d.id));
    UI.toast(bad.length ? `Add-In ${bad.map(d => '„' + (d.name || d.id) + '“').join(', ')} hat einen Fehler – siehe „Verwalten“` : `Add-In ${defs.map(d => '„' + (d.name || d.id) + '“').join(', ')} geladen und eingeschaltet`, bad.length ? 6000 : 3500);
    return true;
  },
  /* Add-Ins-Ordner neu einlesen (Programm) */
  async reload() {
    this.errors = []; this.failed.clear();
    if (Backend.addinFolder) await this.loadFolder();
    for (const s of this.stored()) if (s.on !== false) { try { const b = await OfficePages.assetBlob(s.asset); if (b) for (const d of this.parse(await b.text())) this.activate(d, { source: 'notizbuch', asset: s.asset }, true); } catch (e) { this.errors.push(`${s.name || s.id}: ${e.message}`); } }
    this.changed();
    UI.toast(this.errors.length ? 'Add-Ins neu geladen – Fehler: ' + this.errors.join(' · ') : `Add-Ins neu geladen (${this.defs.size} aktiv)`, this.errors.length ? 6000 : 2500);
  },
  async remove(id) {
    const x = this.all().find(a => a.id === id);
    if (!x || x.source === 'eingebaut') return;
    if (!x.broken) this.unregister(id);
    if (x.source === 'ordner') {
      try { await Backend.addinRemove(x.datei); } catch (e) { UI.toast('Entfernen fehlgeschlagen: ' + e.message, 5000); }
      if (!x.broken) delete this.st()[id];
      this.folder = this.folder.filter(f => f.datei !== x.datei);
    } else Store.ui.plugins = this.stored().filter(s => s.id !== id);
    this.failed.delete(id);
    UiState.saveSoon();
    this.changed();
  },
  openFolder() { if (Backend.addinFolder) Backend.openFolder('addins'); else UI.info('Add-Ins-Ordner', '<p>Den Ordner „Add-Ins“ gibt es im Desktop-Programm (neben KnowledgeTree.exe). In der Browser-Fassung: „Add-In hinzufügen“ wählt eine .js-Datei und legt sie im Speicher ab.</p>'); },
  /* KI-Vorlage (eine .js-Datei: Anleitung als Kommentar + lauffähiges Gerüst) */
  async templateText() {
    if (!this.TEMPLATE_TEXT.startsWith('%%')) return this.TEMPLATE_TEXT;
    if (this._tpl) return this._tpl;
    try { const r = await fetch('addins/' + encodeURIComponent(this.TEMPLATE_FILE)); if (r.ok) return (this._tpl = await r.text()); } catch (e) { /* */ }
    try { if (Backend.addinTemplate) return (this._tpl = await Backend.addinTemplate()); } catch (e) { /* */ }
    return '';
  },
  async saveTemplate() {
    const t = await this.templateText();
    if (!t) { UI.toast('Vorlage nicht gefunden'); return; }
    Export.download(this.TEMPLATE_FILE, new Blob([t], { type: 'text/javascript' }));
  },
  EXAMPLE_ASK: 'Schreibe mit dieser Vorlage ein KnowledgeTree-Add-In: Im Register „Einfügen“ ein Knopf „Datum“, der ein Textfeld mit dem heutigen Datum (TT.MM.JJJJ) in die Mitte der Seite setzt.',
  /* Anleitung (Register „Add-Ins“ → Anleitung): wie man ein Add-In erstellt */
  guide() {
    UI.dialog((dlg, close) => {
      dlg.classList.add('kt-addins', 'kt-ai-guide');
      const desk = !!Backend.addinFolder;
      dlg.append(el('h2', { text: 'Eigene Add-Ins erstellen' }),
        el('p', { html: 'Ein Add-In ist <b>eine JavaScript-Datei</b> (.js). Es fügt KnowledgeTree Knöpfe, eigene Register, Tabellenfunktionen, Menüeinträge oder Tastenkürzel hinzu – und verschwindet vollständig wieder, wenn du sein Häkchen entfernst. Programmieren musst du dafür nicht: das übernimmt eine KI.' }));
      const steps = [
        ['KI-Vorlage holen', desk ? 'Im Ordner „Add-Ins“ liegt <b>_Add-In-Vorlage_KI.js</b> (oder „KI-Vorlage“ speichern). Es ist <b>eine</b> Datei: oben die Anleitung für die KI, unten ein lauffähiges Gerüst.' : '„KI-Vorlage“ speichern: <b>_Add-In-Vorlage_KI.js</b> – <b>eine</b> Datei, oben die Anleitung für die KI, unten ein lauffähiges Gerüst.'],
        ['Einer KI geben', 'Die Datei einer KI geben (Claude, ChatGPT, Copilot …) und darunter in eigenen Worten schreiben, was das Add-In können soll.'],
        ['Antwort als Datei speichern', 'Die KI liefert eine neue Datei, z.B. <b>datum.js</b> – ohne „_“ am Anfang. Sie ist viel kürzer als die Vorlage: nur der Teil <code>KnowledgeTree.register(…)</code>, ohne die lange Anleitung.'],
        ['Einbinden', desk ? 'Datei in den Ordner „Add-Ins“ neben KnowledgeTree.exe legen und „Neu laden“ – oder „Add-In hinzufügen“ (kopiert sie dorthin).' : '„Add-In hinzufügen“ und die Datei wählen – sie wird im Speicher abgelegt.'],
        ['Ein- und ausschalten', 'Mit dem Häkchen links im Register „Add-Ins“. Klappt etwas nicht, zeigt „Verwalten“ die Fehlermeldung rot an – die Meldung der KI geben und um eine korrigierte Datei bitten.'],
      ];
      dlg.append(el('ol', { class: 'ai-steps' }, ...steps.map(([t, h]) => el('li', {}, el('b', { text: t }), el('span', { html: h })))));
      const ask = el('div', { class: 'ai-ask' }, el('small', { text: 'Beispiel-Auftrag an die KI' }), el('div', { class: 'ai-ask-t', text: this.EXAMPLE_ASK }));
      const cp = el('button', { class: 'btn small', type: 'button', text: 'Kopieren' });
      cp.addEventListener('click', () => { try { navigator.clipboard.writeText(this.EXAMPLE_ASK).then(() => UI.toast('Auftrag kopiert'), () => UI.toast('Kopieren nicht möglich')); } catch (e) { UI.toast('Kopieren nicht möglich'); } });
      ask.append(cp);
      dlg.append(ask, el('p', { class: 'bs-note', html: '<b>Warum nur eine Datei?</b> Vorlage und Add-In haben dasselbe Format – die Vorlage hat nur zusätzlich die lange Anleitung für die KI. Ihr Name beginnt mit „_“: solche Dateien lädt KnowledgeTree im Ordner „Add-Ins“ nicht, darum ist sie nie selbst aktiv. Im Programm wird sie bei jedem Start erneuert; Änderungen darum in einer Kopie machen.' }),
        el('p', { class: 'bs-note', text: 'Sicherheit: Add-Ins laufen mit allen Rechten von KnowledgeTree – nur Dateien aus vertrauenswürdiger Quelle einbinden.' }));
      const b = (t, cls, fn) => { const x = el('button', { class: 'btn ' + cls, type: 'button', text: t }); x.addEventListener('click', fn); return x; };
      dlg.append(el('div', { class: 'dlg-btns' },
        b('KI-Vorlage speichern', '', () => this.saveTemplate()),
        ...(desk ? [b('Ordner öffnen', '', () => this.openFolder())] : []),
        el('span', { class: 'grow' }),
        b('Add-In hinzufügen …', 'primary', () => { close(); this.addFile(); }),
        b('Schliessen', '', () => close())));
    }, { wide: true });
  },
  manage() {
    UI.dialog((dlg, close) => {
      dlg.classList.add('kt-addins');
      const info = el('button', { class: 'btn small ai-help', type: 'button', title: 'Wie man eigene Add-Ins erstellt', html: icon('help', 16) + '<span>Anleitung</span>' });
      info.addEventListener('click', () => { close(); this.guide(); });
      dlg.append(el('div', { class: 'ai-head' }, el('h2', { text: 'Add-Ins' }), info));
      const list = el('div', { class: 'ai-list' });
      const draw = () => {
        list.innerHTML = '';
        const all = this.all();
        if (!all.length) list.append(el('p', { class: 'ai-empty', text: 'Noch keine Add-Ins.' }));
        for (const a of all) {
          const row = el('div', { class: 'ai-row' + (a.err ? ' bad' : '') + (a.on && a.active ? ' on' : '') });
          const cb = el('input', { type: 'checkbox', class: 'ai-cb', title: a.broken ? 'Datei fehlerhaft – nicht ladbar' : 'Ein-/ausschalten' });
          cb.checked = !!(a.on && a.active); cb.disabled = !!a.broken || Store.readOnly;
          cb.dataset.addin = a.id;
          cb.addEventListener('change', () => this.setOn(a.id, cb.checked).then(draw));
          const t = el('div', { class: 'ai-t' },
            el('div', { class: 'ai-n' }, el('b', { text: a.name }), a.version ? el('span', { class: 'ai-v', text: a.version }) : '', el('span', { class: 'ai-src ' + a.source, text: this.SOURCE[a.source] })));
          if (a.desc) t.append(el('div', { class: 'ai-d', text: a.desc }));
          const parts = this.parts(a.id);
          if (parts.length || a.datei) t.append(el('small', { text: [...parts, a.datei ? 'Datei ' + a.datei : ''].filter(Boolean).join(' · ') }));
          if (a.err) t.append(el('div', { class: 'ai-e', text: 'Fehler: ' + a.err }));
          row.append(el('label', { class: 'ai-on' }, cb), t);
          if (a.source !== 'eingebaut') {
            const rm = el('button', { class: 'btn small', type: 'button', text: 'Entfernen', title: a.source === 'ordner' ? 'In den Unterordner „_entfernt“ verschieben' : 'Aus dem Speicher löschen' });
            rm.addEventListener('click', () => this.remove(a.id).then(draw));
            row.append(rm);
          }
          list.append(row);
        }
        const other = this.errors.filter(e => !all.some(a => a.err && e.includes(a.err)));
        if (other.length) list.append(el('p', { class: 'ai-err', text: 'Nicht geladen: ' + other.join(' · ') }));
      };
      draw();
      const b = (t, cls, fn, title) => { const x = el('button', { class: 'btn ' + cls, type: 'button', text: t, title: title || '' }); x.addEventListener('click', fn); return x; };
      dlg.append(list, el('p', { class: 'bs-note', text: (Backend.addinFolder ? 'Add-Ins liegen im Ordner „Add-Ins“ neben KnowledgeTree.exe (dort auch die KI-Vorlage). ' : '') + 'Add-Ins laufen mit allen Rechten von KnowledgeTree – nur Dateien aus vertrauenswürdiger Quelle laden.' }),
        el('div', { class: 'dlg-btns' },
          b('KI-Vorlage speichern', '', () => this.saveTemplate(), 'Anleitung für eine KI und Gerüst in einer Datei'),
          ...(Backend.addinFolder ? [b('Ordner öffnen', '', () => this.openFolder()), b('Neu laden', '', () => this.reload().then(draw))] : []),
          el('span', { class: 'grow' }),
          b('Add-In hinzufügen …', 'primary', () => this.addFile().then(draw)),
          b('Schliessen', '', () => close())));
    }, { wide: true });
  },
};

/* ==================================================================== Makros */
const Macros = {
  rec: null,
  page() { return OfficePages.page('xlsx') || (Canvas.page && Canvas.page.boxes.some(b => b.sheet) ? Canvas.page : null); },
  list(p = this.page()) { return p ? (p.office ? (p.office.macros || (p.office.macros = [])) : (p.macros || (p.macros = []))) : []; },
  /* Bezug „A1“, „B2:C5“ oder „Blatt!A1“ → { box, rg } */
  ref(s, base) {
    const p = Canvas.page;
    const m = /^(?:'?([^'!]+)'?!)?(.+)$/.exec(String(s).trim());
    let box = base;
    if (m[1]) box = p.boxes.find(b => b.sheet && b.sheet.name.toLowerCase() === m[1].toLowerCase());
    if (!box) throw new Error('Tabelle nicht gefunden: ' + (m[1] || '(aktiv)'));
    const rg = XL.parseRange(m[2]);
    if (!rg) throw new Error('Ungültiger Bezug: ' + s);
    return { box, rg };
  },
  api() {
    const cur = () => (Sheet.active && Canvas.box(Sheet.active.id)) || (Canvas.page && (Canvas.page.office && Canvas.box(Canvas.page.office.cur)) || Canvas.page.boxes.find(b => b.sheet));
    const self = this;
    const kt = {
      get(r) { const { box, rg } = self.ref(r, cur()); const v = Sheet.value(box.id, rg.c1, rg.r1); return v && v.err ? v.err : v; },
      raw(r) { const { box, rg } = self.ref(r, cur()); return Sheet.raw(box.sheet, rg.c1, rg.r1); },
      set(r, v) { const { box, rg } = self.ref(r, cur()); Sheet.setCells(box.id, [[rg.c1, rg.r1, v == null ? '' : String(v)]], 'Makro'); },
      range(r) { const { box, rg } = self.ref(r, cur()); const out = []; for (let i = rg.r1; i <= rg.r2; i++) { const row = []; for (let j = rg.c1; j <= rg.c2; j++) row.push(Sheet.value(box.id, j, i)); out.push(row); } return out; },
      setRange(r, rows) { const { box, rg } = self.ref(r, cur()); const list = []; rows.forEach((row, i) => (Array.isArray(row) ? row : [row]).forEach((v, j) => list.push([rg.c1 + j, rg.r1 + i, v == null ? '' : String(v)]))); Sheet.setCells(box.id, list, 'Makro'); },
      sheets() { return (Canvas.page ? Canvas.page.boxes.filter(b => b.sheet) : []).map(b => b.sheet.name); },
      sheet(name) { const b = Canvas.page.boxes.find(x => x.sheet && x.sheet.name.toLowerCase() === String(name).toLowerCase()); if (!b) throw new Error('Tabelle nicht gefunden: ' + name); if (Canvas.page.type === 'tab') OfficeView.showSheet(b.id); else Sheet.activate(b.id, 0, 0); return name; },
      selection() { const s = Sheet.sel(); return s ? XL.key(s.c1, s.r1) + (s.c1 !== s.c2 || s.r1 !== s.r2 ? ':' + XL.key(s.c2, s.r2) : '') : null; },
      select(r) { const { box, rg } = self.ref(r, cur()); Sheet.activate(box.id, rg.c1, rg.r1); if (Sheet.active) { Sheet.active.c2 = rg.c2; Sheet.active.r2 = rg.r2; Sheet.refreshUi && Sheet.refreshUi(); } },
      msg(t) { UI.info('Makro', `<p>${escapeHtml(String(t)).replace(/\n/g, '<br>')}</p>`); },
      toast(t) { UI.toast(String(t), 3500); },
      input(t, v) { return UI.prompt(String(t), v == null ? '' : String(v)); },
      recalc() { Sheet.recalc(true); },
    };
    return kt;
  },
  async run(m) {
    if (!m) return;
    const AsyncFunction = Object.getPrototypeOf(async function () { }).constructor;
    Hist.flushPending && Hist.flushPending();
    try {
      const fn = new AsyncFunction('kt', '"use strict";\n' + m.code);
      await fn(this.api());
      Hist.touchPage(Canvas.pageId); Hist.commit('Makro „' + m.name + '“');
    } catch (e) { UI.info('Makro-Fehler', `<p>„${escapeHtml(m.name)}“: <code>${escapeHtml(e.message)}</code></p>`); }
  },
  record() {
    if (this.rec) return this.stop();
    if (!this.page()) { UI.toast('Makros gibt es auf Seiten mit Tabellen (Excel)'); return; }
    this.rec = { lines: [], sheet: Sheet.active && Canvas.box(Sheet.active.id) ? Canvas.box(Sheet.active.id).sheet.name : '' };
    UI.toast('Makro wird aufgezeichnet – jede Zelländerung wird ein Schritt. Nochmals „Makro aufzeichnen“ = beenden.', 4500);
    Ribbon.refresh(); Canvas.updateStatus();
  },
  async stop() {
    const rec = this.rec; this.rec = null;
    Ribbon.refresh(); Canvas.updateStatus();
    if (!rec || !rec.lines.length) { UI.toast('Aufzeichnung beendet – keine Änderungen'); return; }
    const name = await UI.prompt('Name des Makros', 'Makro' + (this.list().length + 1));
    if (!name) return;
    const code = (rec.sheet ? `kt.sheet(${JSON.stringify(rec.sheet)});\n` : '') + rec.lines.join('\n') + '\n';
    this.list().push({ name, code });
    Hist.touchPage(Canvas.pageId); Hist.commit('Makro aufgezeichnet');
    UI.toast(`Makro „${name}“ gespeichert (Entwicklertools → Makros)`, 3500);
  },
  dialog() {
    const p = this.page();
    if (!p) { UI.toast('Makros gibt es auf Seiten mit Tabellen (Excel)'); return; }
    UI.dialog((dlg, close) => {
      dlg.classList.add('kt-macros');
      dlg.append(el('h2', { text: 'Makros' }));
      const list = el('div', { class: 'ai-list' });
      const draw = () => {
        list.innerHTML = '';
        const ms = this.list(p);
        if (!ms.length) list.append(el('p', { class: 'ai-empty', text: 'Noch keine Makros in dieser Arbeitsmappe. „Neu“ öffnet den Skript-Editor, „Makro aufzeichnen“ schreibt Zelländerungen mit.' }));
        ms.forEach((m, i) => {
          const row = el('div', { class: 'ai-row' });
          const run = el('button', { class: 'btn small primary', type: 'button', text: 'Ausführen' }); run.addEventListener('click', () => { close(); this.run(m); });
          const ed = el('button', { class: 'btn small', type: 'button', text: 'Bearbeiten' }); ed.addEventListener('click', () => { close(); this.editor(m); });
          const del = el('button', { class: 'btn small', type: 'button', text: 'Löschen' }); del.addEventListener('click', () => { ms.splice(i, 1); Hist.touchPage(p.id); Hist.commit('Makro gelöscht'); draw(); });
          row.append(el('div', { class: 'ai-t' }, el('b', { text: m.name }), el('small', { text: m.code.split('\n').length + ' Zeilen' })), run, ed, del);
          list.append(row);
        });
        if (p.office && /\.xlsm$/i.test(p.office.name || '')) list.append(el('p', { class: 'bs-note', text: 'Diese Datei enthält VBA-Makros (Excel). Sie bleiben beim Speichern erhalten, werden in KnowledgeTree aber nicht ausgeführt.' }));
      };
      draw();
      const nu = el('button', { class: 'btn primary', type: 'button', text: 'Neu …' }); nu.addEventListener('click', () => { close(); this.editor(null); });
      dlg.append(list, el('div', { class: 'dlg-btns' }, nu, el('button', { class: 'btn', type: 'button', text: 'Schliessen', onclick: () => close() })));
    }, { wide: true });
  },
  editor(m) {
    const p = this.page();
    if (!p) return;
    UI.dialog((dlg, close) => {
      dlg.classList.add('kt-macro-ed');
      dlg.append(el('h2', { text: m ? 'Makro bearbeiten' : 'Neues Makro' }));
      const name = el('input', { type: 'text', value: m ? m.name : 'Makro' + (this.list(p).length + 1), class: 'me-name' });
      const code = el('textarea', { class: 'me-code', spellcheck: 'false' });
      code.value = m ? m.code : "// Beispiel: Summe von B2:B10 nach B11\nconst werte = kt.range('B2:B10').flat().filter(v => typeof v === 'number');\nkt.set('B11', werte.reduce((s, v) => s + v, 0));\n";
      code.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Tab') { e.preventDefault(); const s = code.selectionStart; code.setRangeText('  ', s, code.selectionEnd, 'end'); } });
      const help = el('div', { class: 'me-help', html: '<b>kt.get</b>(\'B2\') · <b>kt.set</b>(\'B2\', 5) · <b>kt.range</b>(\'A1:C3\') · <b>kt.setRange</b>(\'A1\', [[1,2],[3,4]]) · <b>kt.sheet</b>(\'Name\') · <b>kt.sheets</b>() · <b>kt.selection</b>() · <b>kt.select</b>(\'A1\') · <b>kt.msg</b>(\'…\') · <b>await kt.input</b>(\'Frage\') · <b>kt.recalc</b>() – Bezüge auch „Blatt!A1“. JavaScript, läuft mit allen Rechten der Seite.' });
      const save = () => { const n = name.value.trim() || 'Makro'; if (m) { m.name = n; m.code = code.value; } else { m = { name: n, code: code.value }; this.list(p).push(m); } Hist.touchPage(p.id); Hist.commit('Makro gespeichert'); return m; };
      const ok = el('button', { class: 'btn', type: 'button', text: 'Speichern' }); ok.addEventListener('click', () => { save(); close(); });
      const run = el('button', { class: 'btn primary', type: 'button', text: 'Speichern und ausführen' }); run.addEventListener('click', () => { const x = save(); close(); this.run(x); });
      dlg.append(el('label', { class: 'ex-opt' }, 'Name ', name), code, help, el('div', { class: 'dlg-btns' }, el('button', { class: 'btn', type: 'button', text: 'Abbrechen', onclick: () => close() }), ok, run));
      setTimeout(() => code.focus(), 30);
    }, { wide: true });
  },
};
if (typeof module !== 'undefined') module.exports = { Plugins, Macros };
