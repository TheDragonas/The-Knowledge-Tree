'use strict';
/* Datenhaltung, Rückgängig/Wiederholen (100 Schritte) und automatisches Speichern */

const GROUP_COLORS = ['#d13438', '#ca5010', '#e8a302', '#498205', '#038387', '#0078d4', '#5c2d91', '#c239b3', '#7a7574', '#2d7d9a'];
const PKG_COLORS = ['#6b4fbb', '#0078d4', '#038387', '#498205', '#ca5010', '#c239b3', '#d13438', '#7a7574'];

const Store = {
  groups: [],
  pages: {},
  ui: {},
  info: {},
  loaded: false,
  readOnly: false,
  complete: true,   // alle Seiteninhalte geladen (Laden in Stufen, 1.30: bis dahin false)
  /* gibt es die Seite (geladen oder noch unterwegs)? */
  has(id) { return !!this.pages[id] || Lazy.has(id); },
  /* Seite oder – solange sie noch lädt – ihre Kopfangaben (title, level, created, modified) für die Navigation */
  meta(id) { return this.pages[id] || Lazy.metaOf(id); },
  need(ids) { return Lazy.need(ids); },
  whenComplete() { return Lazy.whenComplete(); },
  /* Aktionen, die alle Seiten brauchen (Suchen, Exportieren, Drucken, Löschen ganzer Abschnitte, Rückgängig …),
   * warten, bis alles geladen ist – meist ist das nach einer Sekunde längst der Fall. */
  gate(fn) {
    if (this.complete) return fn();
    const t = setTimeout(() => { if (typeof UI !== 'undefined') UI.toast('Notizbücher werden noch geladen …', 1500); }, 250);
    return Lazy.whenComplete().then(() => { clearTimeout(t); return fn(); });
  },
};

/* Kopfangaben einer Seite (Navigation beim Laden in Stufen): Titel, Ebene, erstellt, geändert */
function pageHead(p) { return { t: p.title || '', l: p.level || 0, c: p.created || 0, m: p.modified || 0 }; }

/* ---------------------------------------------------------------- Laden in Stufen (seit 1.30)
 * Beim Start kommen zuerst Einstellungen (Design), Baum und Verlauf – dann die Seite, die offen war, mit ihrem
 * Abschnitt – dann die übrigen Seiten in kleinen Stücken im Hintergrund (aktuelles Notizbuch zuerst). Wählt man
 * einen Abschnitt oder eine Seite, die noch fehlt, wird sie vorgezogen (need). Jedes Stück ist so klein, dass das
 * Programm dazwischen bedienbar bleibt (Stückgrösse passt sich der Dauer an). */
const Lazy = {
  pending: null, heads: {}, prio: [], order: [], waits: [], doneWaits: [], running: false, n: 6, extra: null,
  onLoad: null, onComplete: null,
  /* heads: Kopfangaben je Seite { t, l, c, m } (seit 1.32) – damit stehen Seitenlisten sofort, auch mit 500 Seiten */
  start(ids, heads) {
    this.pending = new Set(ids);
    this.heads = heads || {};
    Store.complete = !this.pending.size;
  },
  has(id) { return !!(this.pending && this.pending.has(id)); },
  metaOf(id) {
    if (!this.has(id)) return null;
    const h = this.heads[id];
    return h ? { id, title: h.t || '', level: +h.l || 0, created: +h.c || 0, modified: +h.m || +h.c || 0, stub: true } : null;
  },
  /* fn sofort, wenn keine dieser Seiten mehr fehlt – sonst erst laden (vorgezogen) */
  ready(ids, fn) { return ids.some(id => this.has(id)) ? this.need(ids).then(fn) : fn(); },
  need(ids) {
    const miss = ids.filter(id => this.has(id));
    if (!miss.length) return Promise.resolve();
    this.prio.unshift(...miss);
    const p = new Promise(res => this.waits.push({ ids: new Set(miss), res }));
    this.kick();
    return p;
  },
  prefer(ids) { const miss = ids.filter(id => this.has(id)); if (miss.length) { this.prio.push(...miss); this.kick(); } },
  whenComplete() { return Store.complete ? Promise.resolve() : new Promise(res => this.doneWaits.push(res)); },
  run(order) { this.order = order; this.kick(); },
  kick() { if (!this.running && this.pending && this.pending.size) { this.running = true; this.loop(); } },
  next() {
    const batch = [], take = (list) => { while (batch.length < this.n && list.length) { const id = list.shift(); if (this.has(id) && !batch.includes(id)) batch.push(id); } };
    take(this.prio);
    if (!batch.length) take(this.order);
    if (!batch.length) for (const id of this.pending) { batch.push(id); if (batch.length >= this.n) break; }
    return batch;
  },
  async loop() {
    let fails = 0;
    while (this.pending.size) {
      const batch = this.next();
      let got;
      try { got = await Backend.loadPages(batch); fails = 0; }
      catch (e) {
        console.warn('[KnowledgeTree] Seiten laden:', e);
        if (++fails > 5) got = {};   // aufgeben: fehlende Seiten wie beim früheren Laden aus dem Baum nehmen
        else { await new Promise(r => setTimeout(r, 300 * fails)); continue; }
      }
      const t1 = performance.now();
      this.accept(batch, got || {});
      // Stückgrösse: das Verarbeiten eines Stücks soll höchstens ~12 ms den Ablauf belegen. Gemessen wird nur die
      // eigene Arbeit, nicht das Warten auf Platte/Server (sonst würden langsame Speicher zu winzigen Stücken führen).
      const dt = performance.now() - t1;
      this.n = dt > 24 ? Math.max(1, this.n >> 1) : dt < 8 ? Math.min(32, this.n * 2) : this.n;
      await new Promise(r => setTimeout(r, 0));
    }
    this.running = false;
    if (this.extra) { try { await this.extra; } catch (e) { /* */ } }   // z.B. der Verlauf (Rückgängig)
    this.finish();
  },
  accept(batch, got) {
    const loaded = [];
    for (const id of batch) {
      if (!this.has(id)) continue;
      this.pending.delete(id);
      if (Store.pages[id]) continue;                       // schon da (neu angelegt oder zurückgeholt)
      const sec = Tree.groupOfPage(id);
      if (!sec) continue;                                  // inzwischen gelöscht
      const p = got[id] ? normPage(got[id]) : null;
      if (!p) { sec.pages = sec.pages.filter(x => x !== id); Save.treeDirty = true; continue; }   // Datei fehlt/kaputt
      p.id = id;
      p.boxes = p.boxes.filter(b => !isEmptyBox(p, b));
      Store.pages[id] = p;
      loaded.push(id);
    }
    if (loaded.length) Hist.addPages(loaded);
    this.waits = this.waits.filter(w => { for (const id of w.ids) if (this.has(id)) return true; w.res(); return false; });
    if (this.onLoad && (loaded.length || batch.length)) this.onLoad(batch);
  },
  finish() {
    if (Store.complete) return;
    Store.complete = true;
    for (const w of this.waits) w.res();
    this.waits = [];
    if (this.onComplete) this.onComplete();
    for (const r of this.doneWaits) r();
    this.doneWaits = [];
  },
};

const DEFAULT_PENS = [
  { kind: 'pen', color: '#1f1f1f', w: 2.2 },
  { kind: 'pen', color: '#2f5fd0', w: 2.2 },
  { kind: 'pen', color: '#d13438', w: 2.2 },
  { kind: 'pencil', color: '#4a4a4a', w: 1.6 },
  { kind: 'marker', color: '#FFE600', w: 16 },
  { kind: 'marker', color: '#7CFC7C', w: 16 },
  { kind: 'rainbow', color: '#e33', w: 4 },
  { kind: 'glitter', color: '#c9a227', w: 5 },
];

const UI_DEFAULTS = {
  currentGroup: null, currentPage: null, currentContainer: null, collapsed: {}, lastPage: {}, lastSection: {}, views: {},
  groupsW: 230, pagesW: 220, snap: false, theme: 'dunkel', sidebar: true, tab: 'start', pageListSide: 'links', showTabs: false, layoutV: 2, navFold: {},
  recent: [], collapsedPages: {},
  boxDefault: {}, linkDefault: { style: 'kurve', arrow: 'ende', w: 2 },
  pens: null, activePen: 0, eraserMode: 'strich', eraserSize: 14, shapeFill: null, recognize: false, penOnly: false,
  ruler: { visible: false, x: 300, y: 300, angle: 0 }, protractor: { visible: false, x: 500, y: 400, angle: 0 },
  scrollbars: true, showAnchors: false, calc: {}, linkRoute: true, inkFix: true,
  berechnung: 'auto', drucken: null,   // Tabellen: automatisch/manuell (1.26), Druckeinstellungen (1.26, Print)
  sicherung: null, versionen: null, sicherungStand: null,   // Einstellungen → Sicherung/Speicher (seit 1.24, Settings.init)
};

/* ---------------------------------------------------------------- Seiten */

function newPage(title) {
  return {
    typ: 'KnowledgeTree-Seite', version: 1, id: uid('p'), title: title || 'Unbenannte Seite',
    created: Date.now(), modified: Date.now(), level: 0, bg: 'punkte', color: null, boxes: [], pkgs: [], links: [], drawings: [],
  };
}

function normPage(p) {
  if (!p || typeof p !== 'object') return null;
  p.typ = 'KnowledgeTree-Seite';
  p.version = 1;
  p.title = typeof p.title === 'string' ? p.title : 'Unbenannte Seite';
  // Titel aus OneNote-Importen vor 1.15: weiche Zeilenumbrüche (U+000B) erschienen als Kästchen → erste Zeile
  if (/[\u0000-\u0008\u000b-\u001f\u007f]/.test(p.title)) p.title = p.title.split(/[\u000b\r\n]+/).map(x => x.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim()).filter(Boolean)[0] || 'Unbenannte Seite';
  p.created = p.created || Date.now();
  p.bg = p.bg || 'punkte';
  p.color = p.color || null;
  p.modified = p.modified || p.created;
  p.level = clamp(Math.round(+p.level || 0), 0, 2);
  p.drawings = Array.isArray(p.drawings) ? p.drawings.filter(d => d && d.id && (d.type === 'ink' ? Array.isArray(d.pts) && d.pts.length >= 3 : d.type === 'shape')) : [];
  for (const d of p.drawings) { d.layer = d.layer === 'unten' ? 'unten' : 'oben'; d.w = +d.w || 2; d.color = d.color || '#1f1f1f'; if (d.bg) d.bg = true; else delete d.bg; }
  p.boxes = Array.isArray(p.boxes) ? p.boxes.filter(b => b && b.id) : [];
  p.pkgs = Array.isArray(p.pkgs) ? p.pkgs.filter(k => k && k.id) : [];
  p.links = Array.isArray(p.links) ? p.links.filter(l => l && l.id && l.a && l.b) : [];
  for (const b of p.boxes) {
    b.x = +b.x || 0; b.y = +b.y || 0; b.w = Math.max(60, +b.w || 280);
    b.html = typeof b.html === 'string' ? b.html : '';
    b.images = Array.isArray(b.images) ? b.images.filter(i => i && i.src) : [];
    for (const im of b.images) { im.id = im.id || uid('i'); im.x = +im.x || 0; im.y = +im.y || 0; im.w = +im.w || 120; im.h = +im.h || 90; }
    b.z = +b.z || 1;
    b.style = b.style && typeof b.style === 'object' ? b.style : {};
    b.locked = !!b.locked;
    b.pkg = b.pkg || null;
    if (b.bg) { b.bg = true; b.pkg = null; } else delete b.bg;   // Hintergrund (seit 1.10)
    if (b.front && !b.bg) b.front = true; else delete b.front;   // vor den Zeichnungen (seit 1.46)
    // Tabelle (wie Excel) bzw. Diagramm statt Text
    if (b.sheet && typeof b.sheet === 'object' && typeof XL !== 'undefined') { b.sheet = XL.normSheet(b.sheet); b.html = ''; delete b.bg; } else delete b.sheet;
    if (b.chart && typeof b.chart === 'object' && typeof Chart !== 'undefined') { b.chart = Chart.norm(b.chart); b.html = ''; } else delete b.chart;
  }
  // Tabellennamen pro Seite eindeutig (für Bezüge wie Tabelle1!A1)
  const names = new Set();
  for (const b of p.boxes) if (b.sheet) { let n = b.sheet.name, k = 2; while (names.has(n.toLowerCase())) n = b.sheet.name.replace(/\d+$/, '') + k++; b.sheet.name = n; names.add(n.toLowerCase()); }
  const pkgIds = new Set(p.pkgs.map(k => k.id));
  for (const b of p.boxes) if (b.pkg && !pkgIds.has(b.pkg)) b.pkg = null;
  const used = new Set(p.boxes.map(b => b.pkg).filter(Boolean));
  p.pkgs = p.pkgs.filter(k => used.has(k.id));
  for (const k of p.pkgs) { k.title = k.title || 'Paket'; k.color = k.color || PKG_COLORS[0]; k.locked = !!k.locked; }
  const ids = new Set([...p.boxes.map(b => b.id), ...p.pkgs.map(k => k.id)]);
  p.links = p.links.filter(l => ids.has(l.a) && ids.has(l.b) && l.a !== l.b);
  return p;
}

/* Leere Textfelder (kein Text, kein Bild, nicht verbunden) werden nie gespeichert */
function isEmptyBox(p, b) {
  if (b.images.length || b.locked || b.sheet || b.chart || b.ph) return false;   // Platzhalter einer Folie bleibt (1.67)
  if (b.ox && /^(w|sp|notiz)$/.test(b.ox.k)) return false;   // Teil einer Office-Datei (1.61): leer = Inhalt gelöscht, Feld bleibt
  if (!isEmptyHtml(b.html)) return false;
  return !p.links.some(l => l.a === b.id || l.b === b.id);
}
function cleanPage(p) {
  return { ...p, boxes: p.boxes.filter(b => !isEmptyBox(p, b)) };
}
function serPage(p) { return JSON.stringify(cleanPage(p)); }
/* Schnappschuss für den Verlauf (seit 1.20): JSON wie serPage, aber Zeichen über U+00FF als \uXXXX. So bleibt der
   Text in V8 ein Ein-Byte-String – ein einziges „…“ oder „–“ machte sonst die ganze Seite zweibytig (doppelter
   Speicher; bei 1350 Seiten mit Freihand 230 statt 115 MB). JSON.parse liest beides gleich. */
const ONE_TE = typeof TextEncoder !== 'undefined' ? new TextEncoder() : null, ONE_TD = typeof TextDecoder !== 'undefined' ? new TextDecoder() : null;
function oneByte(s) {
  if (typeof s !== 'string') return s;
  if (/[\u0100-\uffff]/.test(s)) s = s.replace(/[\u0100-\uffff]/g, (c) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'));
  // V8 legt das Ergebnis von JSON.stringify oft zweibytig an, auch wenn nur Latin-1 darin steht. Der Umweg über
  // UTF-8 (TextEncoder/TextDecoder) ergibt einen echten Ein-Byte-String – gemessen 231 → 116 MB bei 1350 Seiten.
  return s.length > 2048 && ONE_TE && ONE_TD ? ONE_TD.decode(ONE_TE.encode(s)) : s;
}
function snapPage(p) { return oneByte(serPage(p)); }
/* Derselbe Schnappschuss in Stücken (1.30): Freihand ist der grösste Teil grosser Seiten (2000 Striche ≈ 100 ms am
   Stück). Der Generator gibt nach je SNAP_STEP Strichen ab; das Ergebnis ist Zeichen für Zeichen gleich snapPage(p),
   denn JSON.stringify(array) ist '[' + Elemente.join(',') + ']' und das Maskieren geht Zeichen für Zeichen. */
const SNAP_STEP = 150, SNAP_MARK = '\u0000KT-D\u0000';
function* snapSteps(p) {
  const D = p.drawings || [];
  if (D.length <= SNAP_STEP) return snapPage(p);
  const shell = JSON.stringify(cleanPage({ ...p, drawings: SNAP_MARK })), at = shell.indexOf(JSON.stringify(SNAP_MARK));
  if (at < 0) return snapPage(p);
  const parts = [];
  for (let i = 0; i < D.length; i += SNAP_STEP) {
    yield;
    parts.push(oneByte(JSON.stringify(D.slice(i, i + SNAP_STEP)).slice(1, -1)));
  }
  return oneByte(shell.slice(0, at) + '[' + parts.join(',') + ']' + shell.slice(at + JSON.stringify(SNAP_MARK).length));
}
/* Bild-/Datei-Namen, auf die etwas im Speicher verweist (Seiten, Verlauf) – für das Aufräumen des Bildspeichers.
   Freihand-Punkte (pts) werden übersprungen: dort stehen nie Namen, sie sind aber der grösste Teil der Seiten. */
const NAME_RE = /[0-9a-f]{40}\.[a-z0-9]{1,8}/g;
function refsInMemory(out = new Set()) {
  const add = (t) => { if (t) for (const m of t.match(NAME_RE) || []) out.add(m); };
  const skip = (k, v) => (k === 'pts' ? undefined : v);
  for (const p of Object.values(Store.pages || {})) add(JSON.stringify(p, skip));
  for (const e of [...(Hist.undo || []), ...(Hist.redo || [])]) for (const pt of e.patches || []) { add(pt.a); add(pt.b); }
  return out;
}

/* ---------------------------------------------------------------- Gruppenbaum */

const NODE_KINDS = ['notebook', 'group', 'section', 'quick'];
const KIND_NAMES = { notebook: 'Notizbuch', group: 'Abschnittsgruppe', section: 'Abschnitt', quick: 'Schnellnotizen' };

/* Struktur wie in OneNote:
 *   Notizbuch (kind 'notebook', oberste Ebene)
 *     └ Abschnittsgruppe (kind 'group', beliebig tief) und Abschnitt (kind 'section')
 *         └ Seiten (nur Abschnitte enthalten Seiten; Unterseiten über page.level 0–2)
 *   Schnellnotizen (kind 'quick'): fester Abschnitt ganz oben
 * Jeder Knoten: { id, name, color, kind, groups: [...], pages: [...], closed? }  */
const Tree = {
  find(id, list = Store.groups, parent = null) {
    for (const g of list) {
      if (g.id === id) return { g, list, parent };
      const r = this.find(id, g.groups, g);
      if (r) return r;
    }
    return null;
  },
  group(id) { const r = id && this.find(id); return r ? r.g : null; },
  /* KnowledgeTree-Sicherung zum Hinzufügen vorbereiten: alle Seiten und Knoten bekommen neue IDs (damit sie neben dem
     Bestehenden Platz haben); alte Sicherungen (nur Gruppen) werden zu einem eigenen Notizbuch.
     Benutzt von „Backup laden → Zusätzlich hinzufügen“ und vom Import einer KT-Datei aus einem Archiv. */
  fromBackup(data) {
    const pages = {}, map = {};
    for (const [id, raw] of Object.entries(data.seiten || {})) { const p = normPage(raw); if (p) { map[id] = uid('p'); p.id = map[id]; pages[p.id] = p; } }
    const reid = (list) => list.map(g => { const n = { ...g, id: uid('g'), pages: (g.pages || []).filter(p => map[p]).map(p => map[p]), groups: reid(g.groups || []) }; delete n.closed; return n; });
    let groups = reid(data.gruppen || []);
    if (!groups.some(g => g.kind)) groups = [{ id: uid('g'), name: data.name || 'Wiederhergestellt', color: '', kind: 'notebook', groups, pages: [] }];
    return { pages, groups };
  },
  groupOfPage(pid, list = Store.groups) {
    for (const g of list) {
      if (g.pages.includes(pid)) return g;
      const r = this.groupOfPage(pid, g.groups);
      if (r) return r;
    }
    return null;
  },
  all(list = Store.groups, out = [], depth = 0) {
    for (const g of list) { out.push({ g, depth }); this.all(g.groups, out, depth + 1); }
    return out;
  },
  path(gid) {
    const out = [];
    let r = this.find(gid);
    while (r) { out.unshift(r.g); r = r.parent ? this.find(r.parent.id) : null; }
    return out;
  },
  parentOf(id) { const r = this.find(id); return r ? r.parent : null; },
  notebookOf(id) { const p = this.path(id); return p.length ? p[0] : null; },
  isSection(g) { return !!g && (g.kind === 'section' || g.kind === 'quick'); },
  isContainer(g) { return !!g && (g.kind === 'notebook' || g.kind === 'group'); },
  quick() { return Store.groups.find(g => g.kind === 'quick') || null; },
  firstSection(g) {
    if (!g) return null;
    if (this.isSection(g)) return g;
    for (const c of g.groups) { const s = this.firstSection(c); if (s) return s; }
    return null;
  },
  sections(list = Store.groups, out = []) {
    for (const g of list) { if (this.isSection(g)) out.push(g); this.sections(g.groups, out); }
    return out;
  },
  isDescendant(id, ancestorId) {
    const a = this.group(ancestorId);
    if (!a) return false;
    const walk = (g) => g.groups.some(s => s.id === id || walk(s));
    return walk(a);
  },
  pagesDeep(g, out = []) { out.push(...g.pages); for (const s of g.groups) this.pagesDeep(s, out); return out; },

  /* Baum prüfen und alte Daten (nur "Gruppen") in die neue Struktur überführen */
  norm(list) {
    const seenG = new Set(), seenP = new Set();
    let colorIdx = 0;
    const nextColor = () => GROUP_COLORS[(colorIdx++) % GROUP_COLORS.length];
    const base = (g) => {
      seenG.add(g.id);
      g.name = g.name || 'Unbenannt';
      g.color = g.color || '';
      g.pages = (Array.isArray(g.pages) ? g.pages : []).filter(pid => Store.has(pid) && !seenP.has(pid) && seenP.add(pid));
      g.groups = Array.isArray(g.groups) ? g.groups : [];
      return g;
    };
    const newSection = (name, pages) => {
      const s = { id: uid('g'), name, color: nextColor(), kind: 'section', groups: [], pages };
      seenG.add(s.id);
      return s;
    };
    const fixContainer = (g) => {
      const kids = [];
      for (const c of g.groups) {
        if (!c || !c.id || seenG.has(c.id)) continue;
        base(c);
        if (!NODE_KINDS.includes(c.kind)) c.kind = c.groups.length ? 'group' : 'section';
        else if (c.kind === 'notebook') c.kind = 'group';
        else if (c.kind === 'quick') c.kind = 'section';
        if (c.kind === 'section' && c.groups.length) c.kind = 'group';
        if (c.kind === 'group') fixContainer(c);
        else { c.groups = []; if (!c.color) c.color = nextColor(); }
        kids.push(c);
      }
      if (g.pages.length) kids.unshift(newSection('Allgemein', g.pages));
      g.pages = [];
      g.groups = kids;
    };
    const out = [];
    for (const g of (Array.isArray(list) ? list : [])) {
      if (!g || !g.id || seenG.has(g.id)) continue;
      if (g.kind === 'section' || g.kind === 'group') {
        const nb = { id: uid('g'), name: 'Notizbuch', color: '', kind: 'notebook', groups: [g], pages: [] };
        seenG.add(nb.id);
        fixContainer(nb);
        out.push(nb);
        continue;
      }
      base(g);
      if (g.kind === 'quick') { g.groups = []; out.push(g); continue; }
      g.kind = 'notebook';
      fixContainer(g);
      out.push(g);
    }
    // Schnellnotizen immer ganz oben, höchstens einmal
    const quick = out.filter(g => g.kind === 'quick');
    for (const q of quick.slice(1)) { quick[0].pages.push(...q.pages); out.splice(out.indexOf(q), 1); }
    out.sort((a, b) => (b.kind === 'quick') - (a.kind === 'quick'));
    return out;
  },
  ensureQuick() {
    if (this.quick()) return false;
    Store.groups.unshift({ id: uid('g'), name: 'Schnellnotizen', color: '#7a7574', kind: 'quick', groups: [], pages: [] });
    return true;
  },

  /* Unterseiten: eine Seite + alle direkt folgenden Seiten mit grösserer Ebene */
  pageLevel(pid) { const p = Store.meta(pid); return p ? (p.level || 0) : 0; },
  block(section, pid) {
    const i = section.pages.indexOf(pid);
    if (i < 0) return [];
    const lv = this.pageLevel(pid);
    const out = [pid];
    for (let j = i + 1; j < section.pages.length && this.pageLevel(section.pages[j]) > lv; j++) out.push(section.pages[j]);
    return out;
  },
  hasChildren(section, pid) {
    const i = section.pages.indexOf(pid);
    return i >= 0 && i + 1 < section.pages.length && this.pageLevel(section.pages[i + 1]) > this.pageLevel(pid);
  },
  /* Ebenen gültig halten: erste Seite 0, jede höchstens eine Ebene tiefer als die vorige */
  normLevels(section) {
    let prev = -1;
    const changed = [];
    for (const pid of section.pages) {
      const p = Store.pages[pid];
      if (!p) continue;
      const lv = clamp(Math.min(p.level || 0, prev + 1), 0, 2);
      if ((p.level || 0) !== lv) { p.level = lv; changed.push(pid); }
      prev = lv;
    }
    return changed;
  },
};

/* ---------------------------------------------------------------- Verlauf (Undo/Redo) */

const Hist = {
  max: 100,
  persistLimit: 8e6,   // Zeichen: grössere Schritte werden nicht gespeichert (nur in der Sitzung rückgängig)
  undo: [], redo: [],
  treeSnap: '', pageSnap: {},
  touched: new Set(), treeTouched: false,

  /* Schnappschüsse aller Seiten (Vorher-Stand für Rückgängig). Seit 1.30 nicht mehr alle beim Start (bei vielen Seiten
   * eine halbe Sekunde Stillstand), sondern in kleinen Stücken, wenn der Browser Zeit hat. Sicher ist das, weil jede
   * Änderung von einer Eingabe ausgeht: beim ersten Tastendruck/Zeigen/Ablegen/Einfügen werden die restlichen sofort
   * gemacht – noch bevor irgendein Handler etwas ändert (Fang-Phase am window, siehe ensureAll). Ändert Code ohne
   * Eingabe eine Seite ohne Schnappschuss (Aufräumen beim Start), gilt deren jetziger Stand als Ausgang (commit). */
  init() {
    this.treeSnap = JSON.stringify(Store.groups);
    this.pageSnap = {};
    this._todo = Object.keys(Store.pages);
    this._todoSet = new Set(this._todo);
    const cur = Store.ui && Store.ui.currentPage;
    if (cur && Store.pages[cur]) this.snapNow(cur);
    if (!this._inputHook && typeof window !== 'undefined') {
      this._inputHook = true;
      const all = () => this.ensureAll();
      for (const t of ['pointerdown', 'keydown', 'drop', 'paste', 'cut', 'beforeinput']) window.addEventListener(t, all, true);
    }
    this.idleSnaps();
  },
  snapNow(id) {
    if (!this._todoSet || !this._todoSet.has(id)) return;
    this._todoSet.delete(id);
    let g = this._gen && this._gen.id === id ? this._gen.it : null;
    this._gen = g ? null : this._gen;
    if (!Store.pages[id]) return;
    if (!g) { this.pageSnap[id] = snapPage(Store.pages[id]); return; }
    let r; do r = g.next(); while (!r.done);   // angefangenes Stück fertig machen
    this.pageSnap[id] = r.value;
  },
  /* alle noch fehlenden Schnappschüsse sofort (vor der ersten Änderung, auch vor Rückgängig/Speichern im Code) */
  ensureAll() {
    if (!this._todoSet || !this._todoSet.size) return;
    for (const id of this._todo) this.snapNow(id);
    if (this._gen) this.snapNow(this._gen.id);
    this._todo = []; this._todoSet.clear(); this._gen = null;
  },
  /* im Leerlauf: Seite für Seite, grosse Seiten in Stücken – nie mehr als die freie Zeit eines Bildes */
  /* Seiten, die beim Laden in Stufen nachkommen (1.30): Schnappschuss wie beim Start im Leerlauf */
  addPages(ids) {
    if (!this._todoSet) return;
    for (const id of ids) if (!this._todoSet.has(id) && this.pageSnap[id] === undefined) { this._todoSet.add(id); this._todo.unshift(id); }
    if (!this._idleOn && this._todoSet.size) this.idleSnaps();
  },
  idleSnaps() {
    const ric = typeof requestIdleCallback === 'function' ? requestIdleCallback : (f) => setTimeout(() => f({ timeRemaining: () => 8 }), 30);
    this._idleOn = true;
    const step = (dl) => {
      if (!this._todoSet || !this._todoSet.size) { this._todo = []; this._gen = null; this._idleOn = false; return; }
      const t0 = performance.now();
      while (dl.timeRemaining() > 3 && performance.now() - t0 < 12) {   // kurz halten: eine Eingabe wartet sonst bis 50 ms
        if (!this._gen) {
          let id; do id = this._todo.pop(); while (id && !this._todoSet.has(id));
          if (!id) break;
          if (!Store.pages[id]) { this._todoSet.delete(id); continue; }
          this._gen = { id, it: snapSteps(Store.pages[id]) };
        }
        const r = this._gen.it.next();
        if (r.done) { this._todoSet.delete(this._gen.id); this.pageSnap[this._gen.id] = r.value; this._gen = null; }
      }
      if (this._todoSet.size) ric(step); else { this._todo = []; this._gen = null; this._idleOn = false; }
    };
    ric(step);
  },
  load(v, merge) {
    if (!v || !Array.isArray(v.undo)) return;
    if (!merge) { this.undo = []; this.redo = []; }
    const ok = e => e && Array.isArray(e.patches) && e.patches.every(p => p && (p.k === 't' || p.k === 'p'));
    // seit 1.32 kann der gespeicherte Verlauf nach den ersten Änderungen ankommen (Laden in Stufen, merge): die alten
    // Schritte kommen vor die neuen; „Wiederholen“ gilt nur, solange in dieser Sitzung noch nichts geändert wurde
    const fresh = this.undo.length;
    const pu = this.cut(v.undo.filter(ok).slice(-this.max)), pr = !fresh && Array.isArray(v.redo) ? this.cut(v.redo.filter(ok).slice(-this.max)) : [];
    this.undo = [...pu, ...this.undo].slice(-this.max);
    if (!fresh) this.redo = pr;
    // Ältere Versionen (bis 1.17) speicherten auch riesige Schritte (ganze Importe) – die bremsten jeden Start
    // und hielten hunderte MB im Speicher. Weg damit, und den Verlauf gleich ohne sie neu speichern.
    if (pu.length + pr.length < v.undo.length + (!fresh && Array.isArray(v.redo) ? v.redo.length : 0)) this._dropped = true;
  },
  touchPage(id) {
    if (!id) return;
    if (this._gen && this._gen.id === id) this._gen = null;   // halber Schnappschuss passt nicht mehr (commit nimmt den Stand)
    this.touched.add(id);
    if (typeof Panes !== 'undefined') Panes.touched(id);   // Vorschau in anderen Bereichen nachführen (1.35)
    Save.dirty.add(id);
    Save.schedule();
  },
  touchTree() {
    this.treeTouched = true;
    Save.treeDirty = true;
    Save.schedule();
  },
  /* Änderungen seit dem letzten Schritt als einen Verlaufsschritt festhalten */
  commit(label) {
    this.commitSoon.cancel();
    if (typeof Sheet !== 'undefined') Sheet.touch();   // Tabellen-Bezüge über Seiten neu einlesen (1.26)
    const patches = [];
    if (this.treeTouched) {
      const s = JSON.stringify(Store.groups);
      if (s !== this.treeSnap) { patches.push({ k: 't', b: this.treeSnap, a: s }); this.treeSnap = s; }
      this.treeTouched = false;
    }
    for (const id of this.touched) {
      // ohne Schnappschuss (Änderung ohne Eingabe, z.B. beim Start aufgeräumt): der jetzige Stand gilt als Ausgang
      if (this._todoSet && this._todoSet.has(id)) this.snapNow(id);
      const p = Store.pages[id];
      let s = p ? snapPage(p) : null;
      const before = this.pageSnap[id] ?? null;
      if (s !== before) {
        // nur das Änderungsdatum ist anders: im Text ersetzen statt die ganze Seite nochmals zu schreiben (grosse Seiten
        // kosteten jede Änderung doppelt). "modified": kommt nur einmal vor – in Texten stehen Anführungszeichen als \".
        if (p) {
          const o = '"modified":' + JSON.stringify(p.modified), at = s.indexOf(o);
          p.modified = Date.now();
          s = at >= 0 && typeof p.modified === 'number' ? s.slice(0, at) + '"modified":' + p.modified + s.slice(at + o.length) : snapPage(p);
        }
        patches.push({ k: 'p', id, b: before, a: s });
        if (s === null) delete this.pageSnap[id]; else this.pageSnap[id] = s;
      }
    }
    this.touched.clear();
    if (!patches.length) return false;
    this.undo.push({ label: label || 'Änderung', patches, page: Canvas.pageId, t: Date.now() });
    while (this.undo.length > this.max) this.undo.shift();
    this.redo = [];
    this.persistSoon();
    UI.updateUndo();
    return true;
  },
  commitSoon: null,
  pendingLabel: 'Text bearbeiten',
  flushPending() { this.commitSoon.flush(); },

  // Rückgängig/Wiederholen erst, wenn alle Seiten da sind: ein Schritt kann Seiten betreffen, die noch laden (1.30)
  undoStep() { if (!Store.complete) return Store.gate(() => this.undoStep()); this.step(this.undo, this.redo, 'b', 'Rückgängig'); },
  redoStep() { if (!Store.complete) return Store.gate(() => this.redoStep()); this.step(this.redo, this.undo, 'a', 'Wiederholen'); },
  undoTo(index) { // mehrere Schritte auf einmal (aus der Verlaufsliste)
    if (!Store.complete) return Store.gate(() => this.undoTo(index));
    const n = this.undo.length - index;
    for (let i = 0; i < n; i++) this.step(this.undo, this.redo, 'b', null, true);
    this.after(null, 'Rückgängig: ' + n + ' Schritt' + (n === 1 ? '' : 'e'));
  },
  step(from, to, dir, verb, silent) {
    if (Store.readOnly) return;
    Canvas.stopEditing(true);
    this.flushPending();
    const e = from.pop();
    if (!e) return;
    const list = dir === 'b' ? [...e.patches].reverse() : e.patches;
    for (const pt of list) {
      const v = pt[dir];
      if (pt.k === 't') {
        Store.groups = JSON.parse(v);
        this.treeSnap = v;
        Save.treeDirty = true;
      } else {
        if (v === null) { delete Store.pages[pt.id]; delete this.pageSnap[pt.id]; }
        else { Store.pages[pt.id] = normPage(JSON.parse(v)); this.pageSnap[pt.id] = oneByte(v); }
        Save.dirty.add(pt.id);
        if (typeof Panes !== 'undefined') Panes.touched(pt.id);
      }
    }
    Save.treeDirty = true;
    to.push(e);
    if (!silent) this.after(e, verb + ': ' + e.label);
  },
  after(e, msg) {
    const target = e && e.page && Store.pages[e.page] ? e.page : (Store.pages[Canvas.pageId] ? Canvas.pageId : null);
    Sidebar.render();
    if (target && target !== Canvas.pageId) App.openPage(target, { keepHistory: true });
    else if (!target) App.openFirstPage();
    else Canvas.reload();
    Save.schedule(150);
    this.persistSoon();
    UI.updateUndo();
    if (msg) UI.toast(msg);
  },
  persistSoon: null,
  async persist() {
    if (!Store.loaded) return;
    if (this.waitLoad) { this.persistSoon(); return; }   // gespeicherter Verlauf noch nicht da – nicht überschreiben (1.32)
    if (Store.readOnly) return;
    // Sehr grosse Schritte (z.B. ein Import mit tausend Seiten) nicht bei jedem Speichern mitschreiben – das kostet
    // jedes Mal eine volle Kopie. Sie bleiben in dieser Sitzung rückgängig zu machen; gespeichert wird nur der
    // Verlauf danach (ältere Schritte davor gehen dann mit, damit die Kette stimmt).
    try { await Backend.saveVerlauf({ v: 1, undo: this.cut(this.undo), redo: this.cut(this.redo) }); } catch (e) { /* nächster Versuch beim nächsten Schritt */ }
  },
  size(e) { return e.patches.reduce((a, pt) => a + (pt.b ? pt.b.length : 0) + (pt.a ? pt.a.length : 0), 0); },
  /* ab dem jüngsten übergrossen Schritt (und alles davor) weglassen, damit die Kette stimmt */
  cut(list) { let j = -1; list.forEach((e, i) => { if (this.size(e) > this.persistLimit) j = i; }); return j < 0 ? list : list.slice(j + 1); },
};
Hist.commitSoon = debounce(() => Hist.commit(Hist.pendingLabel), 900);
Hist.persistSoon = debounce(() => Hist.persist(), 1500);

/* ---------------------------------------------------------------- Speichern */

const Save = {
  dirty: new Set(), treeDirty: false, busy: false, again: false, timer: null, state: 'saved', retry: null,
  schedule(ms = 450) {
    if (!Store.loaded || Store.readOnly) return;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.flush(), ms);
    if (this.state !== 'saving') this.setState('pending');
  },
  payload(ids) {
    const titles = {};
    for (const [id, p] of Object.entries(Store.pages)) titles[id] = p.title;
    if (Lazy.pending) for (const id of Lazy.pending) titles[id] = (Lazy.heads[id] || {}).t || '';   // noch nicht geladen (1.31)
    const pages = {};
    for (const id of ids) if (Store.pages[id]) pages[id] = cleanPage(Store.pages[id]);
    return { groups: Store.groups, titles, pages };
  },
  hasWork() { return this.dirty.size > 0 || this.treeDirty; },
  async flush() {
    clearTimeout(this.timer);
    if (!Store.loaded || Store.readOnly) return;
    if (this.busy) { this.again = true; return this.waitIdle(); }
    if (!this.hasWork()) { this.setState('saved'); return; }
    const ids = new Set(this.dirty);
    const body = this.payload(ids);
    this.dirty.clear();
    this.treeDirty = false;
    this.busy = true;
    this.setState('saving');
    try {
      await Backend.sync(body);
      this.setState(this.hasWork() ? 'pending' : 'saved');
    } catch (e) {
      for (const id of ids) this.dirty.add(id);
      this.treeDirty = true;
      this.setState('error', e.message);
      if (!Store.readOnly) { clearTimeout(this.retry); this.retry = setTimeout(() => this.flush(), 4000); }
    } finally {
      this.busy = false;
      if ((this.again || this.hasWork()) && this.state !== 'error') { this.again = false; this.schedule(250); }
    }
  },
  async waitIdle() {
    for (let i = 0; i < 100 && this.busy; i++) await new Promise(r => setTimeout(r, 50));
  },
  async flushAll() {
    Hist.flushPending();
    await this.waitIdle();
    await this.flush();
    await this.waitIdle();
    if (this.hasWork()) await this.flush();
  },
  /* beim Schliessen eines Browser-Tabs: letzter Versuch */
  beacon() {
    if (!Store.loaded || Store.readOnly || !this.hasWork()) return;
    Backend.beacon(this.payload(this.dirty));
  },
  setState(s, msg) {
    this.state = s;
    UI.saveState(s, msg);
  },
};

/* UI-Zustand (Cache/zustand.json) */
const UiState = {
  saveSoon: debounce(() => UiState.save(), 800),
  async save() {
    if (!Store.loaded || Store.readOnly) return;
    if (typeof App !== 'undefined') App.rememberUi();   // früher Stand für den nächsten Start (1.32)
    try { await Backend.saveZustand(Store.ui); } catch (e) { /* egal */ }
  },
};
