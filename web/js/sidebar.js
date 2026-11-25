'use strict';
/* Navigation wie in OneNote:
 *   links  Notizbücher › Abschnittsgruppen › Abschnitte
 *   oben   farbige Register (Abschnitte des aktuellen Notizbuchs / der Abschnittsgruppe)
 *   rechts Seitenliste mit Unterseiten (oder links, einstellbar)                        */

const Ops = {
  nextColor() {
    const used = Tree.all().map(x => x.g.color);
    return GROUP_COLORS.find(c => !used.includes(c)) || GROUP_COLORS[used.length % GROUP_COLORS.length];
  },
  currentSection() { const g = Tree.group(Store.ui.currentGroup); return Tree.isSection(g) ? g : null; },
  /* Container für neue Abschnitte: Eltern des aktuellen Abschnitts, sonst offener Container, sonst erstes Notizbuch */
  currentContainer() {
    const s = this.currentSection();
    if (s && s.kind !== 'quick') return Tree.parentOf(s.id);
    const c = Tree.group(Store.ui.currentContainer);
    if (Tree.isContainer(c)) return c;
    return Store.groups.find(g => g.kind === 'notebook' && !g.closed) || null;
  },
  makeNode(kind, name, parent) {
    const g = { id: uid('g'), name, color: kind === 'group' ? '' : this.nextColor(), kind, groups: [], pages: [] };
    if (parent) { parent.groups.push(g); delete Store.ui.collapsed[parent.id]; }
    else Store.groups.push(g);
    return g;
  },
  addFirstPage(section) {
    const p = newPage('Unbenannte Seite');
    Store.pages[p.id] = p;
    section.pages.push(p.id);
    Hist.touchPage(p.id);
    return p;
  },

  /* ---------------------------------------------------------- Notizbücher, Gruppen, Abschnitte */
  async newNotebook() {
    const name = await UI.prompt('Neues Notizbuch', 'Neues Notizbuch', { ok: 'Erstellen' });
    if (!name || !name.trim()) return;
    Hist.flushPending();
    const nb = this.makeNode('notebook', name.trim(), null);
    const s = this.makeNode('section', 'Neuer Abschnitt', nb);
    const p = this.addFirstPage(s);
    Hist.touchTree(); Hist.commit('Notizbuch erstellt');
    App.openPage(p.id);
  },
  async newSection(containerId) {
    let parent = Tree.group(containerId) || this.currentContainer();
    if (!parent) { await this.newNotebook(); return; }
    if (Tree.isSection(parent)) parent = Tree.parentOf(parent.id) || this.currentContainer();
    const name = await UI.prompt(`Neuer Abschnitt in „${parent.name}“`, 'Neuer Abschnitt', { ok: 'Erstellen' });
    if (!name || !name.trim()) return;
    Hist.flushPending();
    const s = this.makeNode('section', name.trim(), parent);
    const p = this.addFirstPage(s);
    Hist.touchTree(); Hist.commit('Abschnitt erstellt');
    App.openPage(p.id);
  },
  async newSectionGroup(containerId) {
    let parent = Tree.group(containerId) || this.currentContainer();
    if (!parent) { await this.newNotebook(); return; }
    if (Tree.isSection(parent)) parent = Tree.parentOf(parent.id) || this.currentContainer();
    const name = await UI.prompt(`Neue Abschnittsgruppe in „${parent.name}“`, 'Neue Abschnittsgruppe', { ok: 'Erstellen' });
    if (!name || !name.trim()) return;
    Hist.flushPending();
    const g = this.makeNode('group', name.trim(), parent);
    const s = this.makeNode('section', 'Neuer Abschnitt', g);
    const p = this.addFirstPage(s);
    Hist.touchTree(); Hist.commit('Abschnittsgruppe erstellt');
    App.openPage(p.id);
  },
  renameNode(id) {
    const g = Tree.group(id);
    if (!g || g.kind === 'quick') return;
    const apply = (v) => {
      if (!v || !v.trim() || v.trim() === g.name) return;
      Sheet.keepRefs(() => { g.name = v.trim(); });   // [Abschnitt/Seite]-Bezüge gehen mit
      Hist.touchTree(); Hist.commit(KIND_NAMES[g.kind] + ' umbenannt');
      Sidebar.render();
    };
    if ($(`.g-row[data-id="${id}"] .g-name`)) Sidebar.inlineRename(`.g-row[data-id="${id}"] .g-name`, g.name, apply);
    else UI.prompt(KIND_NAMES[g.kind] + ' umbenennen', g.name).then(apply);
  },
  setNodeColor(id, color) {
    const g = Tree.group(id);
    if (!g) return;
    g.color = color || '';
    Hist.touchTree(); Hist.commit('Farbe geändert');
    Sidebar.render();
  },
  /* Hinweis beim Löschen: Webseite seit 1.20 restlos (Strg+Z), Desktop weiter mit Papierkorb-Ordner */
  deleteNote() {
    return Backend.kind !== 'server'
      ? 'Mit Strg+Z kannst du das rückgängig machen. Danach wird alles restlos entfernt – Seiten samt Bildern und Anhängen.'
      : 'Mit Strg+Z kannst du das rückgängig machen – zusätzlich landen die Seiten im Papierkorb-Ordner.';
  },
  async deleteNode(id) {
    const r = Tree.find(id);
    if (!r || r.g.kind === 'quick') return;
    const pages = Tree.pagesDeep(r.g);
    const what = KIND_NAMES[r.g.kind];
    const ok = await UI.confirm(`${what} „${r.g.name}“ löschen?`,
      `${what} mit ${pages.length} Seite(n) wird gelöscht. ${Ops.deleteNote()}`,
      { ok: 'Löschen', danger: true });
    if (!ok) return;
    Hist.flushPending();
    r.list.splice(r.list.indexOf(r.g), 1);
    for (const pid of pages) { delete Store.pages[pid]; Hist.touchPage(pid); }
    Hist.touchTree();
    Hist.commit(what + ' gelöscht');
    if (!Store.pages[Canvas.pageId] || !Tree.group(Store.ui.currentGroup)) App.openFirstPage();
    Sidebar.render();
    App.cleanupSoon();
  },
  canMove(id, targetParentId) {
    const g = Tree.group(id);
    if (!g || g.kind === 'quick') return false;
    if (g.kind === 'notebook') return targetParentId == null;
    const t = Tree.group(targetParentId);
    if (!Tree.isContainer(t)) return false;
    return id !== targetParentId && !Tree.isDescendant(targetParentId, id);
  },
  moveNode(id, targetParentId, index) {
    if (!this.canMove(id, targetParentId)) return;
    const r = Tree.find(id);
    const dest = targetParentId ? Tree.group(targetParentId).groups : Store.groups;
    const from = r.list.indexOf(r.g);
    r.list.splice(from, 1);
    if (dest === r.list && index > from) index--;
    let i = clamp(index ?? dest.length, 0, dest.length);
    if (!targetParentId && Tree.quick() && i === 0) i = 1; // Schnellnotizen bleiben oben
    Sheet.keepRefs(() => dest.splice(i, 0, r.g));   // [Abschnitt/Seite]-Bezüge gehen mit (1.26)
    if (targetParentId) delete Store.ui.collapsed[targetParentId];
    Hist.touchTree(); Hist.commit(KIND_NAMES[r.g.kind] + ' verschoben');
    Sidebar.render();
  },
  closeNotebook(id) {
    const nb = Tree.group(id);
    if (!nb || nb.kind !== 'notebook') return;
    nb.closed = true;
    Hist.touchTree(); Hist.commit('Notizbuch geschlossen');
    if (Tree.notebookOf(Store.ui.currentGroup)?.id === id) App.openFirstPage();
    Sidebar.render();
    UI.toast('Notizbuch geschlossen – über „Datei → Öffnen“ wieder anzeigen');
  },
  openNotebookMenu(anchorOrXY) {
    const closed = Store.groups.filter(g => g.kind === 'notebook' && g.closed);
    const items = closed.length ? closed.map(nb => ({ label: nb.name, icon: 'book', action: () => this.reopenNotebook(nb.id) })) : [{ label: 'Keine geschlossenen Notizbücher', disabled: true }];
    if (anchorOrXY && anchorOrXY.nodeType) UI.menu([{ head: 'Geschlossene Notizbücher' }, ...items], 0, 0, { anchor: anchorOrXY });
    else UI.menu([{ head: 'Geschlossene Notizbücher' }, ...items], anchorOrXY?.x || 200, anchorOrXY?.y || 120);
  },
  reopenNotebook(id) {
    const nb = Tree.group(id);
    if (!nb) return;
    delete nb.closed;
    Hist.touchTree(); Hist.commit('Notizbuch geöffnet');
    Sidebar.openNode(id);
  },

  /* ---------------------------------------------------------- Seiten */
  newPage(sectionId, opts = {}) {
    Hist.flushPending();
    let s = Tree.group(sectionId) || this.currentSection();
    if (!Tree.isSection(s)) s = Tree.firstSection(s) || Tree.firstSection(this.currentContainer());
    if (!s) {
      const nb = Store.groups.find(g => g.kind === 'notebook' && !g.closed) || this.makeNode('notebook', 'Mein Notizbuch', null);
      s = this.makeNode('section', 'Neuer Abschnitt', nb);
    }
    const p = newPage('Unbenannte Seite');
    p.level = clamp(opts.level || 0, 0, 2);
    Store.pages[p.id] = p;
    if (opts.after && s.pages.includes(opts.after)) {
      const blk = Tree.block(s, opts.after);
      s.pages.splice(s.pages.indexOf(blk[blk.length - 1]) + 1, 0, p.id);
    } else s.pages.push(p.id);
    Tree.normLevels(s);
    Hist.touchPage(p.id);
    Hist.touchTree();
    Hist.commit(p.level ? 'Unterseite erstellt' : 'Seite erstellt');
    App.openPage(p.id);
    App.focusTitle();   // im Tab oder über der Seite (1.36)
    setTimeout(() => { const a = document.activeElement; if (Canvas.pageId === p.id && !(a && (a.id === 'page-title' || a.classList.contains('pt-in')))) App.focusTitle(); }, 30);
    return p;
  },
  newSubpage() {
    const cur = Store.pages[Canvas.pageId];
    const s = this.currentSection();
    if (!cur || !s) { this.newPage(); return; }
    this.newPage(s.id, { after: cur.id, level: Math.min(2, (cur.level || 0) + 1) });
  },
  quickNote() {
    Tree.ensureQuick();
    const q = Tree.quick();
    this.newPage(q.id);
  },
  renamePage(id) {
    if (Lazy.has(id)) return Lazy.need([id]).then(() => this.renamePage(id));
    if (id !== Canvas.pageId) App.openPage(id);
    setTimeout(() => App.focusTitle(), 30);
  },
  duplicatePage(id) {
    const src = Store.pages[id];
    const g = Tree.groupOfPage(id);
    if (!src || !g) return;
    Hist.flushPending();
    const p = this.clonePage(serPage(src));
    p.title = src.title + ' (Kopie)';
    p.created = p.modified = Date.now();
    Store.pages[p.id] = p;
    const blk = Tree.block(g, id);
    g.pages.splice(g.pages.indexOf(blk[blk.length - 1]) + 1, 0, p.id);
    Hist.touchPage(p.id); Hist.touchTree(); Hist.commit('Seite dupliziert');
    App.openPage(p.id);
  },
  /* Seite aus ihrem Text neu anlegen: neue IDs für Seite, Felder, Gruppen, Verbindungen, Zeichnungen; Diagramme zeigen
   * auf die mitkopierte Tabelle. Bilder und Anhänge bleiben geteilt (gleicher Inhalt = gleiche Datei). */
  clonePage(json) {
    const p = normPage(JSON.parse(json));
    const map = {};
    p.id = uid('p');
    p.modified = Date.now();
    for (const k of p.pkgs) { map[k.id] = uid('k'); k.id = map[k.id]; }
    for (const b of p.boxes) { map[b.id] = uid('b'); b.id = map[b.id]; if (b.pkg) b.pkg = map[b.pkg] || null; }
    for (const b of p.boxes) if (b.chart && b.chart.src && map[b.chart.src.id]) b.chart.src.id = map[b.chart.src.id];
    p.links = p.links.filter(l => map[l.a] && map[l.b]);
    for (const l of p.links) { l.id = uid('l'); l.a = map[l.a]; l.b = map[l.b]; }
    for (const d of p.drawings) d.id = uid('d');
    return p;
  },

  /* ---------------------------------------------------------- Kopieren / Einfügen (1.26), wie OneNote
   * Rechtsklick auf Abschnitt, Abschnittsgruppe, Notizbuch oder Seite(n) → Kopieren; Rechtsklick auf das Ziel → Einfügen.
   * Kopiert wird der Stand beim Kopieren. Einfügen: Abschnitt/Gruppe auf einen Abschnitt → danach, auf ein Notizbuch
   * oder eine Gruppe → hinein; ein Notizbuch auf ein Notizbuch → als neues Notizbuch danach, sonst als Abschnittsgruppe;
   * Seiten auf einen Abschnitt → ans Ende, auf eine Seite → danach. Bilder werden nicht verdoppelt. */
  clip: null,
  copyNode(id) {
    const g = Tree.group(id);
    if (!g) return;
    Hist.flushPending();
    const pages = {};
    for (const pid of Tree.pagesDeep(g)) if (Store.pages[pid]) pages[pid] = serPage(Store.pages[pid]);
    const n = Object.keys(pages).length;
    this.clip = { type: 'node', kind: g.kind === 'quick' ? 'section' : g.kind, name: g.name, tree: JSON.stringify(g), pages, n };
    UI.toast(`${KIND_NAMES[g.kind]} „${g.name}“ kopiert (${n} Seite${n === 1 ? '' : 'n'}) – Rechtsklick auf das Ziel → Einfügen`, 3500);
  },
  copyPages(ids) {
    ids = ids.filter(id => Store.pages[id]);
    if (!ids.length) return;
    Hist.flushPending();
    const s = Tree.groupOfPage(ids[0]);
    if (s) ids = s.pages.filter(id => ids.includes(id));   // Reihenfolge wie in der Seitenliste
    this.clip = { type: 'pages', pages: ids.map(id => serPage(Store.pages[id])), n: ids.length, name: Store.pages[ids[0]].title };
    UI.toast(ids.length === 1 ? `Seite „${Store.pages[ids[0]].title}“ kopiert – Rechtsklick auf einen Abschnitt oder eine Seite → Einfügen` : `${ids.length} Seiten kopiert`, 3000);
  },
  /* Name, den es unter den Geschwistern noch nicht gibt: „Name (Kopie)“, „Name (Kopie 2)“ … */
  freeName(list, name) {
    const used = new Set(list.map(g => String(g.name).toLowerCase()));
    if (!used.has(name.toLowerCase())) return name;
    for (let i = 1; ; i++) { const n = `${name} (Kopie${i > 1 ? ' ' + i : ''})`; if (!used.has(n.toLowerCase())) return n; }
  },
  /* was „Einfügen“ an diesem Ziel tun würde: { label, run } oder null */
  pasteInfo(targetId, pagePid) {
    const c = this.clip, t = Tree.find(targetId);
    if (!c || !t) return null;
    if (c.type === 'pages') {
      if (!Tree.isSection(t.g)) return null;
      return { label: c.n === 1 ? `Einfügen (Seite „${c.name}“)` : `Einfügen (${c.n} Seiten)`, run: () => this.pastePages(t.g, pagePid) };
    }
    if (t.g.kind === 'quick') return null;
    const what = c.kind === 'notebook' && !(t.g.kind === 'notebook') ? 'als Abschnittsgruppe' : '';
    return { label: `Einfügen (${KIND_NAMES[c.kind]} „${c.name}“${what ? ' ' + what : ''})`, run: () => this.pasteNode(t) };
  },
  pasteNode(t) {
    const c = this.clip;
    if (!c || c.type !== 'node') return;
    Hist.flushPending();
    const map = {};
    for (const [pid, json] of Object.entries(c.pages)) { const p = this.clonePage(json); map[pid] = p.id; Store.pages[p.id] = p; Hist.touchPage(p.id); }
    const reid = (g) => { const n = { ...g, id: uid('g'), pages: g.pages.filter(pid => map[pid]).map(pid => map[pid]), groups: g.groups.map(reid) }; delete n.closed; if (n.kind === 'quick') n.kind = 'section'; return n; };
    const g = reid(JSON.parse(c.tree));
    let list, at;
    if (c.kind === 'notebook' && t.g.kind === 'notebook') { list = Store.groups; at = list.indexOf(t.g) + 1; }
    else if (Tree.isSection(t.g)) { list = t.list; at = list.indexOf(t.g) + 1; }
    else { list = t.g.groups; at = list.length; delete Store.ui.collapsed[t.g.id]; }
    if (g.kind === 'notebook' && list !== Store.groups) { g.kind = 'group'; g.color = ''; }
    g.name = this.freeName(list, g.name);
    list.splice(at, 0, g);
    Hist.touchTree();
    Hist.commit(KIND_NAMES[g.kind] + ' eingefügt');
    Sidebar.render();
    const first = Tree.pagesDeep(g)[0];
    if (first) App.openPage(first); else Sidebar.openNode && Sidebar.openNode(g.id);
    UI.toast(`${KIND_NAMES[g.kind]} „${g.name}“ eingefügt (${c.n} Seite${c.n === 1 ? '' : 'n'})`);
  },
  pastePages(section, afterPid) {
    const c = this.clip;
    if (!c || c.type !== 'pages' || !Tree.isSection(section)) return;
    Hist.flushPending();
    const ps = c.pages.map(json => this.clonePage(json));
    let at = section.pages.length;
    if (afterPid && section.pages.includes(afterPid)) { const blk = Tree.block(section, afterPid); at = section.pages.indexOf(blk[blk.length - 1]) + 1; }
    for (const p of ps) { Store.pages[p.id] = p; Hist.touchPage(p.id); }
    section.pages.splice(at, 0, ...ps.map(p => p.id));
    for (const pid of Tree.normLevels(section)) Hist.touchPage(pid);
    Hist.touchTree();
    Hist.commit(ps.length === 1 ? 'Seite eingefügt' : 'Seiten eingefügt');
    App.openPage(ps[0].id);
    UI.toast(ps.length === 1 ? `Seite „${ps[0].title}“ eingefügt` : `${ps.length} Seiten eingefügt`);
  },
  async deletePages(ids) {
    ids = ids.filter(id => Store.pages[id]);
    if (!ids.length) return;
    const title = ids.length === 1 ? `Seite „${Store.pages[ids[0]].title}“ löschen?` : `${ids.length} Seiten löschen?`;
    const ok = await UI.confirm(title, Ops.deleteNote(), { ok: 'Löschen', danger: true });
    if (!ok) return;
    Hist.flushPending();
    const s = Tree.groupOfPage(Canvas.pageId);
    const curIdx = s ? s.pages.indexOf(Canvas.pageId) : -1;
    const sections = new Set();
    for (const id of ids) {
      const g = Tree.groupOfPage(id);
      if (!g) continue;
      g.pages.splice(g.pages.indexOf(id), 1);
      sections.add(g);
      delete Store.pages[id];
      Hist.touchPage(id);
    }
    for (const g of sections) for (const pid of Tree.normLevels(g)) Hist.touchPage(pid);
    Hist.touchTree();
    Hist.commit(ids.length === 1 ? 'Seite gelöscht' : 'Seiten gelöscht');
    App.cleanupSoon();
    Sidebar.pageSel.clear();
    if (!Store.pages[Canvas.pageId]) {
      const next = s && s.pages[Math.min(Math.max(0, curIdx), s.pages.length - 1)];
      if (next) App.openPage(next); else App.openPage(null, { group: s ? s.id : null });
    }
    Sidebar.render();
  },
  /* Seiten (mit ihren Unterseiten) an eine Stelle in einem Abschnitt verschieben */
  movePages(ids, sectionId, index, level) {
    const to = Tree.group(sectionId);
    if (!Tree.isSection(to)) return;
    // betroffene Abschnitte müssen geladen sein (Ebenen werden angepasst) – sonst zuerst vorziehen (1.32)
    const inv = [...to.pages, ...ids.flatMap(id => (Tree.groupOfPage(id) || { pages: [id] }).pages)];
    if (inv.some(id => Lazy.has(id))) return Lazy.need(inv).then(() => this.movePages(ids, sectionId, index, level));
    Hist.flushPending();
    const moving = [];
    for (const id of ids) {
      const g = Tree.groupOfPage(id);
      if (!g) continue;
      for (const pid of Tree.block(g, id)) if (!moving.includes(pid)) moving.push(pid);
    }
    if (!moving.length) return;
    // Einfügen vor "anchor" – wird der Anker selbst verschoben, den nächsten nicht verschobenen nehmen
    let anchor = null;
    if (index != null) for (let i = index; i < to.pages.length; i++) if (!moving.includes(to.pages[i])) { anchor = to.pages[i]; break; }
    const from = new Set();
    Sheet.keepRefs(() => {   // [Abschnitt/Seite]-Bezüge zeigen danach weiter auf dieselben Seiten (1.26)
      for (const pid of moving) { const g = Tree.groupOfPage(pid); g.pages.splice(g.pages.indexOf(pid), 1); from.add(g); }
      const at = anchor ? to.pages.indexOf(anchor) : to.pages.length;
      // Ebenen relativ anpassen
      if (level != null) {
        const base = Tree.pageLevel(moving[0]);
        for (const pid of moving) { const p = Store.pages[pid]; p.level = clamp((p.level || 0) - base + level, 0, 2); Hist.touchPage(pid); }
      }
      to.pages.splice(at, 0, ...moving);
    });
    for (const g of new Set([...from, to])) for (const pid of Tree.normLevels(g)) Hist.touchPage(pid);
    Hist.touchTree(); Hist.commit(moving.length === 1 ? 'Seite verschoben' : 'Seiten verschoben');
    if (moving.includes(Canvas.pageId)) { Store.ui.currentGroup = to.id; App.openPage(Canvas.pageId, { nav: true }); }
    Sidebar.render();
  },
  async movePagesDialog(ids) {
    const target = await Sidebar.pickSection(ids.length === 1 ? `„${Store.pages[ids[0]].title}“ verschieben nach …` : `${ids.length} Seiten verschieben nach …`);
    if (!target) return;
    this.movePages(ids, target, null, 0);
    UI.toast('Verschoben nach „' + Tree.path(target).map(g => g.name).join(' › ') + '“');
  },
  setLevel(ids, delta) {
    const s = this.currentSection();
    if (!s) return;
    if (s.pages.some(id => Lazy.has(id))) return Lazy.need(s.pages).then(() => this.setLevel(ids, delta));
    Hist.flushPending();
    const order = ids.filter(id => s.pages.includes(id)).sort((a, b) => s.pages.indexOf(a) - s.pages.indexOf(b));
    for (const id of order) {
      const i = s.pages.indexOf(id);
      const p = Store.pages[id];
      const prev = i > 0 ? Tree.pageLevel(s.pages[i - 1]) : -1;
      const nl = clamp((p.level || 0) + delta, 0, Math.min(2, prev + 1));
      if (nl !== (p.level || 0)) {
        // Unterseiten wandern mit
        for (const pid of Tree.block(s, id)) { const q = Store.pages[pid]; q.level = clamp((q.level || 0) + (nl - (p.level || 0)), 0, 2); Hist.touchPage(pid); }
      }
    }
    for (const pid of Tree.normLevels(s)) Hist.touchPage(pid);
    Hist.touchTree();
    if (!Hist.commit(delta > 0 ? 'Seite eingerückt' : 'Seite ausgerückt')) UI.toast(delta > 0 ? 'Weiter einrücken geht hier nicht (max. 2 Ebenen, nur unter einer anderen Seite)' : 'Die Seite ist schon ganz links');
    Sidebar.renderPages();
  },
  sortPages(sectionId, key) {
    const s = Tree.group(sectionId) || this.currentSection();
    if (!s || s.pages.length < 2) return;
    if (s.pages.some(id => Lazy.has(id))) return Lazy.need(s.pages).then(() => this.sortPages(sectionId, key));
    Hist.flushPending();
    const blocks = [];
    let i = 0;
    while (i < s.pages.length) { const b = Tree.block(s, s.pages[i]); blocks.push(b); i += b.length; }
    const val = (pid) => { const p = Store.pages[pid]; return key === 'titel' ? (p.title || '').toLowerCase() : key === 'geaendert' ? -(p.modified || 0) : (p.created || 0); };
    blocks.sort((a, b) => { const x = val(a[0]), y = val(b[0]); return typeof x === 'string' ? x.localeCompare(y, 'de') : x - y; });
    s.pages = blocks.flat();
    Hist.touchTree();
    Hist.commit('Seiten sortiert');
    Sidebar.renderPages();
    UI.toast({ titel: 'Nach Titel sortiert', geaendert: 'Nach Änderungsdatum sortiert (neueste oben)', erstellt: 'Nach Erstelldatum sortiert' }[key]);
  },
  async editCreated(pid) {
    const p = Store.pages[pid];
    if (!p) return;
    const pad = (n) => String(n).padStart(2, '0');
    const d = new Date(p.created);
    const val = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    const v = await UI.dialog((dl, close) => {
      dl.append(el('h2', { text: 'Datum und Uhrzeit der Seite' }));
      dl.append(el('p', { text: 'Zuletzt geändert: ' + fmtDate(p.modified) }));
      const inp = el('input', { type: 'datetime-local', value: val, style: { height: '32px', padding: '0 8px', width: '100%', border: '1px solid var(--line-2)', borderRadius: '5px', background: 'var(--chrome-2)', color: 'var(--ink)' } });
      inp.value = val;
      dl.append(inp);
      dl.append(el('div', { class: 'dlg-btns' },
        el('button', { class: 'btn', text: 'Abbrechen', onclick: () => close(null) }),
        el('button', { class: 'btn primary', text: 'Übernehmen', onclick: () => close(inp.value) })));
    });
    if (!v) return;
    const t = new Date(v).getTime();
    if (!t) return;
    p.created = t;
    Hist.touchPage(pid); Hist.commit('Seitendatum geändert');
    Canvas.updateHeader();
    Sidebar.renderPages();
  },
};

const Sidebar = {
  pageSel: new Set(),
  pageAnchor: null,

  init() {
    $('#add-group').innerHTML = icon('bookPlus', 17);
    $('#add-page').innerHTML = icon('pagePlus', 17);
    $('#sort-pages').innerHTML = icon('sort', 16);
    $('#add-group').addEventListener('click', (e) => this.addMenu(e.currentTarget));
    // Spalten ein-/ausklappen: eingeklappt bleibt ein schmaler Streifen zum Wiederaufklappen
    for (const b of $$('[data-fold]')) {
      b.addEventListener('mousedown', e => e.preventDefault());
      b.addEventListener('click', () => this.fold(b.dataset.fold));
    }
    // Doppelklick auf Kopf, Streifen oder freie Fläche einer Spalte: ein-/ausklappen
    for (const [col, which, rows] of [['#nav-groups', 'groups', '.g-row'], ['#nav-pages', 'pages', '.p-row']]) {
      // erster Klick auf den Streifen klappt schon auf -> der Doppelklick soll nicht gleich wieder zuklappen
      $(col).addEventListener('mousedown', (e) => { if (e.detail <= 1) this._downStrip = !!e.target.closest('.nav-strip'); }, true);
      $(col).addEventListener('dblclick', (e) => {
        if (e.target.closest('button, input, ' + rows)) return;
        if (this._downStrip) return;
        e.preventDefault();
        try { getSelection().removeAllRanges(); } catch (er) { /* */ }
        this.fold(which);
      });
    }
    // unten in der Notizbuch-Spalte: Abschnitt / Abschnittsgruppe hinzufügen
    const foot = $('#nav-groups-foot');
    if (foot) {
      foot.append(
        el('button', { class: 'nav-foot-btn', dataset: { add: 'section' }, title: 'Neuer Abschnitt', html: icon('tabPlus', 15) + '<span>Abschnitt</span>' }),
        el('button', { class: 'nav-foot-btn', dataset: { add: 'group' }, title: 'Neue Abschnittsgruppe', html: icon('folderPlus', 15) + '<span>Gruppe</span>' }));
      foot.addEventListener('mousedown', e => { if (e.target.closest('button')) e.preventDefault(); });
      foot.addEventListener('click', (e) => {
        const b = e.target.closest('[data-add]');
        if (!b) return;
        const c = Ops.currentContainer();
        if (b.dataset.add === 'section') Ops.newSection(c && c.id); else Ops.newSectionGroup(c && c.id);
      });
      foot.addEventListener('contextmenu', (e) => { e.preventDefault(); this.addMenu(null, e.clientX, e.clientY); });
    }
    $('#add-page').addEventListener('click', () => Ops.newPage());
    if (typeof OfficePages !== 'undefined') OfficePages.attachTypeMenu($('#add-page'), (fmt) => Cmd.run('newTypedPage', fmt));   // 1.65: Word / Excel / PowerPoint
    $('#sort-pages').addEventListener('click', (e) => UI.menu([
      { head: 'Seiten sortieren' },
      { label: 'Nach Erstelldatum', icon: 'calendar', action: () => Ops.sortPages(null, 'erstellt') },
      { label: 'Nach Änderungsdatum', icon: 'history', action: () => Ops.sortPages(null, 'geaendert') },
      { label: 'Alphabetisch (A–Z)', icon: 'sort', action: () => Ops.sortPages(null, 'titel') },
    ], 0, 0, { anchor: e.currentTarget, alignRight: true }));
    const gt = $('#group-tree'), pl = $('#page-list'), tabs = $('#section-tabs');

    /* ---- Notizbuch-Liste */
    gt.addEventListener('click', (e) => {
      const row = e.target.closest('.g-row');
      if (!row) return;
      const id = row.dataset.id;
      if (e.target.closest('.g-caret')) {
        Store.ui.collapsed[id] = !Store.ui.collapsed[id];
        UiState.saveSoon();
        this.renderTree();
        return;
      }
      const g = Tree.group(id);
      if (this.isDouble('g' + id)) {
        // Doppelklick = umbenennen; das Auf-/Zuklappen des ersten Klicks wieder zurücknehmen
        if (g && g.kind === 'group' && this._grpToggle && this._grpToggle.id === id) { if (this._grpToggle.was) Store.ui.collapsed[id] = true; else delete Store.ui.collapsed[id]; UiState.saveSoon(); this.renderTree(); }
        this._grpToggle = null;
        Ops.renameNode(id);
        return;
      }
      // Abschnittsgruppe (1.27): einfacher Klick klappt auf/zu wie der Pfeil; beim Aufklappen öffnet sie sich wie bisher
      if (g && g.kind === 'group') {
        const was = !!Store.ui.collapsed[id];
        this._grpToggle = { id, was };
        if (was) { this.openNode(id); delete Store.ui.collapsed[id]; }
        else Store.ui.collapsed[id] = true;
        UiState.saveSoon();
        this.renderTree();
        return;
      }
      this.openNode(id);
    });
    gt.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      const row = e.target.closest('.g-row');
      if (!row) {
        const c = Ops.currentContainer();
        UI.menu([
          c ? { head: c.name } : null,
          c ? { label: 'Neuer Abschnitt', icon: 'tabPlus', action: () => Ops.newSection(c.id) } : null,
          c ? { label: 'Neue Abschnittsgruppe', icon: 'folderPlus', action: () => Ops.newSectionGroup(c.id) } : null,
          c ? '-' : null,
          { label: 'Neues Notizbuch', icon: 'bookPlus', action: () => Ops.newNotebook() },
          { label: 'Geschlossenes Notizbuch öffnen …', icon: 'book', action: () => Ops.openNotebookMenu({ x: e.clientX, y: e.clientY }) },
          '-',
          { label: 'Alle ausklappen', icon: 'chevDown', action: () => this.collapseAll(false) },
          { label: 'Alle einklappen', icon: 'chevRight', action: () => this.collapseAll(true) },
        ], e.clientX, e.clientY);
        return;
      }
      this.nodeMenu(row.dataset.id, e.clientX, e.clientY);
    });

    /* ---- Register */
    tabs.addEventListener('click', (e) => {
      const t = e.target.closest('.s-tab');
      if (!t) return;
      if (t.dataset.act === 'add') { this.addMenu(t); return; }
      if (t.dataset.act === 'up') { this.openContainerUp(t.dataset.id); return; }
      const id = t.dataset.id;
      if (this.isDouble('t' + id)) { Ops.renameNode(id); return; }
      this.openNode(id);
    });
    tabs.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      const t = e.target.closest('.s-tab[data-id]:not([data-act])');
      if (!t) { this.addMenu(null, e.clientX, e.clientY); return; }
      this.nodeMenu(t.dataset.id, e.clientX, e.clientY);
    });
    tabs.addEventListener('wheel', (e) => { if (e.deltaY) { tabs.scrollLeft += e.deltaY; e.preventDefault(); } }, { passive: false });

    /* ---- Seitenliste */
    pl.addEventListener('mouseover', (e) => {
      const row = e.target.closest && e.target.closest('.p-row');
      if (!row || row.title) return;
      const p = Store.meta(row.dataset.id);
      if (p) row.title = p.title + '\nErstellt: ' + fmtDate(p.created) + '\nGeändert: ' + fmtDate(p.modified);
    });
    pl.addEventListener('click', (e) => {
      const row = e.target.closest('.p-row');
      if (!row) return;
      const id = row.dataset.id;
      if (e.target.closest('.p-caret')) {
        Store.ui.collapsedPages[id] = !Store.ui.collapsedPages[id];
        UiState.saveSoon();
        this.renderPages();
        return;
      }
      const s = Ops.currentSection();
      if (e.ctrlKey || e.metaKey) {
        if (this.pageSel.has(id)) this.pageSel.delete(id); else this.pageSel.add(id);
        if (!this.pageSel.size) this.pageSel.add(Canvas.pageId);
        this.pageAnchor = id;
        this.renderPages();
        return;
      }
      if (e.shiftKey && s && this.pageAnchor && s.pages.includes(this.pageAnchor)) {
        const a = s.pages.indexOf(this.pageAnchor), b = s.pages.indexOf(id);
        this.pageSel = new Set(s.pages.slice(Math.min(a, b), Math.max(a, b) + 1));
        this.renderPages();
        return;
      }
      if (this.isDouble('p' + id)) { Ops.renamePage(id); return; }
      this.pageSel = new Set([id]);
      this.pageAnchor = id;
      if (id !== Canvas.pageId) App.openPage(id); else this.renderPages();
    });
    // Mittelklick: Seite in neuem Tab (1.35, wie im Browser und in Obsidian)
    pl.addEventListener('mousedown', (e) => { if (e.button === 1 && e.target.closest('.p-row')) e.preventDefault(); });
    pl.addEventListener('auxclick', (e) => {
      const row = e.button === 1 && e.target.closest('.p-row');
      if (row) { e.preventDefault(); Panes.openIn(row.dataset.id, 'tab'); }
    });
    pl.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      const row = e.target.closest('.p-row');
      if (!row) {
        UI.menu([
          { label: 'Neue Seite', icon: 'pagePlus', key: 'Alt+N', action: () => Ops.newPage() },
          ...(typeof OfficePages !== 'undefined' ? OfficePages.typeItems((fmt) => Cmd.run('newTypedPage', fmt)).map(x => ({ ...x, label: 'Neue Seite als ' + x.label })) : []),
          { label: 'Seiten sortieren …', icon: 'sort', action: () => $('#sort-pages').click() },
        ], e.clientX, e.clientY);
        return;
      }
      const id = row.dataset.id;
      if (!this.pageSel.has(id)) { this.pageSel = new Set([id]); this.pageAnchor = id; this.renderPages(); }
      this.pageMenu([...this.pageSel], e.clientX, e.clientY);
    });

    this.initDnD(gt, pl, tabs);
    this.initSplitters();
  },

  collapseAll(on) {
    for (const { g } of Tree.all()) if (g.groups.length) { if (on) Store.ui.collapsed[g.id] = true; else delete Store.ui.collapsed[g.id]; }
    if (on && Store.ui.currentGroup) for (const anc of Tree.path(Store.ui.currentGroup).slice(0, -1)) delete Store.ui.collapsed[anc.id];
    UiState.saveSoon();
    this.renderTree();
  },
  isDouble(key) {
    const now = Date.now();
    const hit = this._lastClick && this._lastClick.key === key && now - this._lastClick.t < 450;
    this._lastClick = hit ? null : { key, t: now };
    return hit;
  },

  /* ---------------------------------------------------------- Öffnen */
  openNode(id) {
    const g = Tree.group(id);
    if (!g) return;
    if (Tree.isSection(g)) { this.openSection(id); return; }
    if (g.kind === 'notebook') {
      delete Store.ui.collapsed[id];
      const last = Tree.group(Store.ui.lastSection[id]);
      const s = last && Tree.notebookOf(last.id)?.id === id ? last : Tree.firstSection(g);
      if (s) this.openSection(s.id);
      else { Store.ui.currentContainer = id; App.openPage(null, { group: null, container: id }); }
      return;
    }
    this.openContainer(id);
  },
  openSection(id) {
    const s = Tree.group(id);
    if (!Tree.isSection(s)) return;
    if (Store.ui.currentGroup === id && Canvas.pageId && s.pages.includes(Canvas.pageId)) { this.render(); return; }
    const last = Store.ui.lastPage[id];
    const pid = s.pages.includes(last) ? last : s.pages[0];
    App.openPage(pid || null, { group: id });
  },
  /* Abschnittsgruppe öffnen: ihre Abschnitte erscheinen als Register */
  openContainer(id) {
    const g = Tree.group(id);
    if (!Tree.isContainer(g)) return;
    delete Store.ui.collapsed[id];
    const direct = g.groups.find(c => Tree.isSection(c));
    const s = direct || Tree.firstSection(g);
    if (s) this.openSection(s.id);
    else { Store.ui.currentContainer = id; App.openPage(null, { group: null, container: id }); }
  },
  openContainerUp(parentId) {
    const p = Tree.group(parentId);
    if (!p) return;
    const direct = p.groups.find(c => Tree.isSection(c));
    if (direct) this.openSection(direct.id);
    else { Store.ui.currentContainer = p.id; App.openPage(null, { group: null, container: p.id }); }
  },

  /* ---------------------------------------------------------- Menüs */
  nodeMenu(id, x, y) {
    const g = Tree.group(id);
    if (!g) return;
    const colorItems = [{ head: 'Farbe' }, { colors: GROUP_COLORS, action: (c) => Ops.setNodeColor(id, c) }];
    let items;
    const pi = Ops.pasteInfo(id);
    const clipItems = [{ label: 'Kopieren', icon: 'copy', action: () => Ops.copyNode(id) },
      { label: pi ? pi.label : 'Einfügen', icon: 'paste', disabled: !pi, action: () => pi && pi.run() }];
    if (g.kind === 'quick') {
      items = [{ label: 'Neue Schnellnotiz', icon: 'bolt', key: 'Alt+Umsch+N', action: () => Ops.quickNote() }, '-', ...clipItems, '-', { label: 'Schnellnotizen exportieren …', icon: 'download', action: () => Export.show({ group: id }) }];
    } else if (g.kind === 'section') {
      items = [
        { label: 'Neue Seite', icon: 'pagePlus', action: () => Ops.newPage(id) },
        ...(typeof OfficePages !== 'undefined' ? OfficePages.typeItems((fmt) => OfficePages.newTyped(fmt, { section: id }).catch(e => UI.toast(e.message, 5000))).map(x => ({ ...x, label: 'Neue Seite als ' + x.label })) : []),
        '-',
        ...clipItems,
        '-',
        { label: 'Umbenennen', icon: 'pencil', key: 'Doppelklick', action: () => Ops.renameNode(id) },
        ...colorItems, '-',
        { label: 'Abschnitt exportieren …', icon: 'download', action: () => Export.show({ group: id }) },
        { label: 'Abschnitt löschen', icon: 'trash', danger: true, action: () => Ops.deleteNode(id) },
      ];
    } else {
      items = [
        { label: 'Neuer Abschnitt', icon: 'tabPlus', action: () => Ops.newSection(id) },
        { label: 'Neue Abschnittsgruppe', icon: 'folderPlus', action: () => Ops.newSectionGroup(id) },
        '-',
        ...clipItems,
        '-',
        { label: 'Umbenennen', icon: 'pencil', key: 'Doppelklick', action: () => Ops.renameNode(id) },
        ...colorItems, '-',
        g.kind === 'notebook' ? { label: 'Notizbuch schliessen', icon: 'x', action: () => Ops.closeNotebook(id) } : null,
        { label: KIND_NAMES[g.kind] + ' exportieren …', icon: 'download', action: () => Export.show({ group: id }) },
        { label: KIND_NAMES[g.kind] + ' löschen', icon: 'trash', danger: true, action: () => Ops.deleteNode(id) },
      ];
    }
    UI.menu(items, x, y);
  },
  addMenu(anchor, x, y) {
    const c = Ops.currentContainer();
    const items = [
      { label: 'Neuer Abschnitt', icon: 'tabPlus', action: () => Ops.newSection(c && c.id) },
      { label: 'Neue Abschnittsgruppe', icon: 'folderPlus', action: () => Ops.newSectionGroup(c && c.id) },
      '-',
      { label: 'Neues Notizbuch', icon: 'bookPlus', action: () => Ops.newNotebook() },
    ];
    if (anchor) UI.menu(items, 0, 0, { anchor }); else UI.menu(items, x, y);
  },
  pageMenu(ids, x, y) {
    const one = ids.length === 1 ? ids[0] : null;
    UI.menu([
      { label: 'Neue Seite', icon: 'pagePlus', key: 'Alt+N', action: () => Ops.newPage() },
      ...(typeof OfficePages !== 'undefined' ? OfficePages.typeItems((fmt) => Cmd.run('newTypedPage', fmt)).map(x => ({ ...x, label: 'Neue Seite als ' + x.label })) : []),
      { label: 'Neue Unterseite', icon: 'subpage', key: 'Strg+Alt+N', action: () => { if (one) App.openPage(one); Ops.newSubpage(); } },
      '-',
      // mehrere Tabs und geteilte Bereiche (1.35)
      one ? { label: 'In neuem Tab öffnen', icon: 'tabPlus', key: 'Mittelklick', action: () => Panes.openIn(one, 'tab') } : null,
      one ? { label: 'Rechts daneben öffnen', icon: 'splitH', action: () => Panes.openIn(one, 'right') } : null,
      one ? { label: 'Unten öffnen', icon: 'splitV', action: () => Panes.openIn(one, 'down') } : null,
      one ? '-' : null,
      { label: 'Unterseite machen (einrücken)', icon: 'indent', key: 'Strg+Alt+]', action: () => Ops.setLevel(ids, +1) },
      { label: 'Ausrücken', icon: 'outdent', key: 'Strg+Alt+[', action: () => Ops.setLevel(ids, -1) },
      '-',
      one ? { label: 'Umbenennen', icon: 'pencil', key: 'F2', action: () => Ops.renamePage(one) } : null,
      one ? { label: 'Duplizieren', icon: 'duplicate', action: () => Ops.duplicatePage(one) } : null,
      { label: ids.length === 1 ? 'Kopieren' : `${ids.length} Seiten kopieren`, icon: 'copy', action: () => Ops.copyPages(ids) },
      (() => { const s = Tree.groupOfPage(ids[ids.length - 1]), pi = s && Ops.clip && Ops.clip.type === 'pages' ? Ops.pasteInfo(s.id, ids[ids.length - 1]) : null; return { label: pi ? pi.label : 'Einfügen', icon: 'paste', disabled: !pi, action: () => pi && pi.run() }; })(),
      { label: 'Verschieben nach …', icon: 'folder', action: () => Ops.movePagesDialog(ids) },
      one && Backend.versionList ? { label: 'Seitenversionen …', icon: 'history', action: () => App.showVersions(one) } : null,
      one ? { label: 'Datum ändern …', icon: 'calendar', action: () => Ops.editCreated(one) } : null,
      { label: ids.length === 1 ? 'Exportieren …' : `${ids.length} Seiten exportieren …`, icon: 'download', action: () => Export.show({ pages: ids }) },
      '-',
      { label: ids.length === 1 ? 'Seite löschen' : `${ids.length} Seiten löschen`, icon: 'trash', danger: true, key: 'Entf', action: () => Ops.deletePages(ids) },
    ], x, y);
  },
  /* Abschnitt auswählen (für „Verschieben nach“) */
  pickSection(title) {
    return UI.dialog((d, close) => {
      d.append(el('h2', { text: title }));
      const box = el('div', { class: 'pick-list' });
      const cur = Store.ui.currentGroup;
      const walk = (list, depth) => {
        for (const g of list) {
          if (g.closed) continue;
          const row = el('div', { class: 'pick-row k-' + g.kind + (Tree.isSection(g) ? ' pickable' : '') + (g.id === cur ? ' cur' : ''), style: { paddingLeft: (8 + depth * 16) + 'px' } });
          row.innerHTML = this.nodeIcon(g) + '<span></span>';
          row.querySelector('span').textContent = g.name + (g.id === cur ? '  (aktuell)' : '');
          if (Tree.isSection(g)) row.addEventListener('click', () => close(g.id));
          box.append(row);
          walk(g.groups, depth + 1);
        }
      };
      walk(Store.groups, 0);
      d.append(box);
      d.append(el('div', { class: 'dlg-btns' }, el('button', { class: 'btn', text: 'Abbrechen', onclick: () => close(null) })));
    }, { wide: true });
  },
  nodeIcon(g) {
    if (g.kind === 'notebook') return `<span class="g-ic" style="color:${g.color || 'var(--accent)'}">${icon('book', 15)}</span>`;
    if (g.kind === 'group') return `<span class="g-ic" style="color:${g.color || 'var(--ink-3)'}">${icon('folder', 15)}</span>`;
    if (g.kind === 'quick') return `<span class="g-ic" style="color:var(--accent)">${icon('bolt', 15)}</span>`;
    return `<span class="g-tab" style="background:${g.color || 'var(--line-2)'}"></span>`;
  },

  /* ---------------------------------------------------------- Zeichnen */
  render() {
    if (this.inlineActive) { this.renderPending = true; return; }
    this.renderTree();
    this.renderTabs();
    this.renderPages();
    this.applyFrame();
  },

  renderTree() {
    const gt = $('#group-tree');
    gt.innerHTML = '';
    const foot = $('#nav-groups-foot'), fc = Ops.currentContainer();
    if (foot) { foot.title = fc ? `Neu in „${fc.name}“ (Doppelklick auf freie Fläche: Spalte einklappen)` : ''; foot.hidden = !fc; }
    const visible = Store.groups.filter(g => !g.closed);
    if (!visible.some(g => g.kind === 'notebook')) {
      gt.append(el('div', { class: 'nav-empty' }, 'Noch kein Notizbuch.', el('br'),
        el('button', { class: 'btn primary', text: '+ Neues Notizbuch', onclick: () => Ops.newNotebook() })));
    }
    const cur = Store.ui.currentGroup;
    const curPath = new Set(cur ? Tree.path(cur).map(g => g.id) : []);
    if (!cur && Store.ui.currentContainer) for (const g of Tree.path(Store.ui.currentContainer)) curPath.add(g.id);
    const build = (list, depth, parentEl) => {
      for (const g of list) {
        if (g.closed) continue;
        const open = !Store.ui.collapsed[g.id];
        const hasKids = g.groups.length > 0;
        const row = el('div', {
          class: 'g-row k-' + g.kind + (g.id === cur ? ' sel' : '') + (curPath.has(g.id) && g.id !== cur ? ' inpath' : ''),
          draggable: g.kind === 'quick' ? 'false' : 'true', dataset: { id: g.id, kind: g.kind }, style: { paddingLeft: (4 + depth * 14) + 'px' },
        });
        row.innerHTML = `<span class="g-caret ${hasKids ? (open ? 'open' : '') : 'none'}">${icon('chevRight', 12)}</span>` +
          this.nodeIcon(g) + `<span class="g-name"></span><span class="g-count">${Tree.isSection(g) && g.pages.length ? g.pages.length : ''}</span>`;
        row.querySelector('.g-name').textContent = g.name;
        row.title = Tree.path(g.id).map(x => x.name).join(' › ');
        parentEl.append(row);
        if (g.kind === 'quick') parentEl.append(el('div', { class: 'g-sep' }));
        if (open && hasKids) build(g.groups, depth + 1, parentEl);
      }
    };
    build(Store.groups, 0, gt);
  },

  /* Register über der Seite: Geschwister des aktuellen Abschnitts */
  renderTabs() {
    if (!Store.ui.showTabs) return; // Layout wie zu Beginn: alles links, keine Register oben
    const tabs = $('#section-tabs');
    tabs.innerHTML = '';
    const cur = Tree.group(Store.ui.currentGroup);
    let container = cur ? Tree.parentOf(cur.id) : Tree.group(Store.ui.currentContainer);
    if (cur && cur.kind === 'quick') container = null;
    const add = (node) => tabs.append(node);
    if (container && container.kind === 'group') {
      const up = Tree.parentOf(container.id);
      const t = el('div', { class: 's-tab up', dataset: { act: 'up', id: up ? up.id : '' }, title: 'Zurück zu „' + (up ? up.name : '') + '“' });
      t.innerHTML = icon('cornerUp', 14) + '<span></span>';
      t.querySelector('span').textContent = container.name;
      add(t);
    }
    const list = container ? container.groups : (cur ? [cur] : []);
    for (const g of list) {
      const isSec = Tree.isSection(g);
      const t = el('div', { class: 's-tab' + (isSec ? '' : ' grp') + (cur && g.id === cur.id ? ' on' : ''), draggable: g.kind === 'quick' ? 'false' : 'true', dataset: { id: g.id } });
      t.style.setProperty('--tc', g.color || (isSec ? 'var(--line-2)' : 'var(--ink-3)'));
      t.innerHTML = (isSec ? '' : icon('folder', 14)) + (g.kind === 'quick' ? icon('bolt', 14) : '') + '<span></span>';
      t.querySelector('span').textContent = g.name;
      t.title = isSec ? `${g.name} · ${g.pages.length} Seite(n)` : `Abschnittsgruppe „${g.name}“ öffnen`;
      add(t);
    }
    if (container || !cur || cur.kind !== 'quick') {
      const plus = el('div', { class: 's-tab add', dataset: { act: 'add' }, title: 'Neuer Abschnitt …', html: icon('plus', 15) });
      add(plus);
    }
    const on = tabs.querySelector('.s-tab.on');
    if (on) on.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  },
  applyFrame() {
    const s = Tree.group(Store.ui.currentGroup);
    $('#page-frame').style.setProperty('--sc', (s && s.color) || 'var(--line-2)');
  },

  renderPages() {
    if (typeof Panes !== 'undefined') Panes.syncSoon();   // Tab-Titel, gelöschte Seiten (1.35)
    { const lab = $('#pages-strip-label'), sec = Tree.group(Store.ui.currentGroup); if (lab) lab.textContent = sec ? 'Seiten · ' + sec.name : 'Seiten'; }
    const pl = $('#page-list');
    pl.innerHTML = '';
    const s = Tree.group(Store.ui.currentGroup);
    const head = $('#pages-head');
    head.textContent = s ? s.name : 'Seiten';
    head.title = s ? Tree.path(s.id).map(x => x.name).join(' › ') : '';
    if (!Tree.isSection(s)) {
      pl.append(el('div', { class: 'nav-empty' }, 'Kein Abschnitt geöffnet.', el('br'),
        el('button', { class: 'btn primary', text: '+ Neuer Abschnitt', onclick: () => Ops.newSection() })));
      return;
    }
    if (!s.pages.length) {
      pl.append(el('div', { class: 'nav-empty' }, 'Dieser Abschnitt hat noch keine Seiten.', el('br'),
        el('button', { class: 'btn primary', text: '+ Seite hinzufügen', onclick: () => Ops.newPage(s.id) })));
      return;
    }
    for (const id of [...this.pageSel]) if (!s.pages.includes(id)) this.pageSel.delete(id);
    if (!this.pageSel.size && Canvas.pageId) this.pageSel.add(Canvas.pageId);
    // als ein Text aufgebaut und einmal eingelesen (1.32): 500 Seiten in ~5 statt ~22 ms; der Hinweis (title) mit den
    // langen Datumsangaben entsteht erst beim Darüberfahren (mouseover unten)
    let hideBelow = Infinity, html = '';
    const caret = icon('chevRight', 11), multi = this.pageSel.size > 1;
    for (const pid of s.pages) {
      const p = Store.meta(pid);   // noch nicht geladen: Kopfangaben (Titel, Ebene, Datum) reichen für die Liste
      if (!p) continue;
      const lv = p.level || 0;
      if (lv > hideBelow) continue;
      hideBelow = Infinity;
      const kids = Tree.hasChildren(s, pid);
      const collapsed = kids && Store.ui.collapsedPages[pid];
      if (collapsed) hideBelow = lv;
      html += `<div class="p-row lv${lv}${pid === Canvas.pageId ? ' sel' : ''}${multi && this.pageSel.has(pid) ? ' msel' : ''}" draggable="true" data-id="${escapeHtml(pid)}" data-level="${lv}">` +
        `<span class="p-caret ${kids ? (collapsed ? '' : 'open') : 'none'}">${caret}</span><div class="p-main"><div class="p-title">${p.office && typeof OfficePages !== 'undefined' ? `<span class="p-office" title="${escapeHtml(OfficePages.LABEL[p.office.fmt] || 'Office-Datei')}: ${escapeHtml(p.office.name || '')}">${OfficePages.ICON[p.office.fmt] || '📎'}</span> ` : ''}${escapeHtml(p.title || 'Unbenannte Seite')}</div>` +
        `<div class="p-date">${fmtShortDate(p.created)}${collapsed ? ` · ${Tree.block(s, pid).length - 1} Unterseite(n)` : ''}</div></div></div>`;
    }
    pl.insertAdjacentHTML('beforeend', html);
    // Laden in Stufen: fehlen noch Kopfangaben (Daten von vor 1.32), wird der Abschnitt vorgezogen und ergänzt
    if (s.pages.some(id => Lazy.has(id) && !Lazy.metaOf(id))) {
      pl.append(el('div', { class: 'p-loading', text: 'Seiten werden geladen …' }));
      Lazy.need(s.pages).then(() => App.navSoon());
    }
  },

  inlineRename(selector, value, done) {
    const span = $(selector);
    if (!span) return;
    const inp = el('input', { class: 'inline-edit', value });
    inp.value = value;
    span.replaceWith(inp);
    inp.focus(); inp.select();
    let finished = false;
    this.inlineActive = true;
    const fin = (ok) => { if (finished) return; finished = true; this.inlineActive = false; if (ok) done(inp.value); this.render(); };
    inp.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') fin(true); if (e.key === 'Escape') fin(false); });
    inp.addEventListener('blur', () => fin(true));
    inp.addEventListener('mousedown', e => e.stopPropagation());
  },

  /* ---------------------------------------------------------- Ziehen & Ablegen
   * Seit 1.49 nach Koordinaten statt nach dem Element unter der Maus: es zählt die NÄCHSTE Zeile (auch in den Lücken
   * zwischen den Zeilen, links/rechts daneben und bis 28 px über/unter der Liste), die Einfüge-Linie ist dick, und
   * zwischen Geschwistern wird lieber getauscht (davor/danach) als hineingelegt (nur das mittlere Drittel = hinein).
   * Mit dem Finger/Stift: kurz halten (0,3 s), dann ziehen – mit einer schwebenden Vorschau. */
  initDnD(gt, pl, tabs) {
    let drag = null;
    const TOL = 28;
    const clear = () => $$('.drop-before,.drop-after,.drop-into,.drop-sub').forEach(x => x.classList.remove('drop-before', 'drop-after', 'drop-into', 'drop-sub'));
    const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 ? r : null; };
    /* nächste Zeile zu (x, y) in einer Liste; horiz: Register nebeneinander */
    const nearest = (box, sel, x, y, horiz) => {
      const R = vis(box);
      if (!R || x < R.left - TOL || x > R.right + TOL || y < R.top - TOL || y > R.bottom + TOL) return null;
      let best = null, bd = Infinity;
      for (const row of box.querySelectorAll(sel)) {
        const r = vis(row);
        if (!r) continue;
        const d = horiz ? (x < r.left ? r.left - x : x > r.right ? x - r.right : 0) + Math.max(0, r.top - y, y - r.bottom) * 0.2
          : (y < r.top ? r.top - y : y > r.bottom ? y - r.bottom : 0);
        if (d < bd) { bd = d; best = row; }
      }
      return best;
    };
    /* Wo landet ein Knoten? -> {parent, index} oder null */
    const nodeTarget = (targetId, z) => {
      const t = Tree.find(targetId);
      if (!t) return null;
      if (z === 'into') return Tree.isContainer(t.g) ? { parent: t.g.id, index: null } : null;
      return { parent: t.parent ? t.parent.id : null, index: t.list.indexOf(t.g) + (z === 'after' ? 1 : 0) };
    };
    const zone = (row, y, g) => {
      const r = row.getBoundingClientRect();
      const f = (y - r.top) / r.height;
      if (!Tree.isContainer(g)) return f < 0.5 ? 'before' : 'after';
      // Geschwister (gleicher Elternknoten): breitere Tausch-Zonen; sonst wie bisher
      const a = Tree.find(drag.id), b = Tree.find(g.id);
      const sib = a && b && a.parent === b.parent;
      const lo = sib ? 0.36 : 0.28, hi = 1 - lo;
      return f < lo ? 'before' : f > hi ? 'after' : 'into';
    };
    const pageDrop = (row, x, y) => {
      const r = row.getBoundingClientRect();
      const before = (y - r.top) < r.height / 2;
      const lv = +row.dataset.level;
      const sub = !before && (x - r.left) > 70 + lv * 16;
      return { before, sub, level: before ? lv : (sub ? Math.min(2, lv + 1) : lv) };
    };
    const intoSection = (el, g) => Tree.isSection(g) ? { el, cls: 'drop-into', run: () => { Ops.movePages(drag.ids, g.id, null, 0); UI.toast('Verschoben nach „' + g.name + '“'); } } : null;
    /* Ziel an der Stelle (x, y): { el, cls, run } oder null */
    const hitAt = (x, y) => {
      if (!drag) return null;
      // Notizbuch-Baum
      let row = nearest(gt, '.g-row', x, y);
      if (row) {
        const g = Tree.group(row.dataset.id);
        if (!g) return null;
        if (drag.kind === 'pages') return intoSection(row, g);
        if (g.kind === 'quick' || g.id === drag.id) return null;
        // unter der letzten Zeile: ans Ende der obersten Ebene
        const last = [...gt.querySelectorAll('.g-row')].filter(vis).pop();
        if (row === last && y > row.getBoundingClientRect().bottom + 4) {
          const n = Store.groups.length;
          if (Ops.canMove(drag.id, null)) return { el: row, cls: 'drop-after', run: () => Ops.moveNode(drag.id, null, n) };
        }
        const z = zone(row, y, g), tgt = nodeTarget(g.id, z);
        if (!tgt || !Ops.canMove(drag.id, tgt.parent)) return null;
        return { el: row, cls: 'drop-' + z, run: () => Ops.moveNode(drag.id, tgt.parent, tgt.index) };
      }
      // Abschnitt-Register (nebeneinander)
      row = nearest(tabs, '.s-tab[data-id]:not([data-act])', x, y, true);
      if (row) {
        const g = Tree.group(row.dataset.id);
        if (!g) return null;
        if (drag.kind === 'pages') return intoSection(row, g);
        if (g.kind === 'quick' || drag.id === g.id) return null;
        const r = row.getBoundingClientRect(), z = x < r.left + r.width / 2 ? 'before' : 'after', tgt = nodeTarget(g.id, z);
        if (!tgt || !Ops.canMove(drag.id, tgt.parent)) return null;
        return { el: row, cls: 'drop-' + z, run: () => Ops.moveNode(drag.id, tgt.parent, tgt.index) };
      }
      // Seitenliste
      if (drag.kind !== 'pages') return null;
      row = nearest(pl, '.p-row', x, y);
      const s = Ops.currentSection();
      if (!s) return null;
      if (!row) {
        const R = vis(pl);
        return R && x >= R.left && x <= R.right && y >= R.top && y <= R.bottom ? { el: pl, cls: '', run: () => Ops.movePages(drag.ids, s.id, null, 0) } : null;
      }
      if (drag.block.has(row.dataset.id)) return null;
      const z = pageDrop(row, x, y);
      return { el: row, cls: z.before ? 'drop-before' : z.sub ? 'drop-sub' : 'drop-after', run: () => {
        let idx;
        if (z.before) idx = s.pages.indexOf(row.dataset.id);
        else { const blk = Tree.block(s, row.dataset.id); idx = s.pages.indexOf(blk[blk.length - 1]) + 1; }
        Ops.movePages(drag.ids, s.id, idx, z.level);
      } };
    };
    const show = (h) => { clear(); if (h && h.cls) h.el.classList.add(h.cls); };
    const begin = (el) => {
      if (el.classList.contains('g-row') || el.classList.contains('s-tab')) {
        const g = Tree.group(el.dataset.id);
        if (!g || g.kind === 'quick') return false;
        drag = { kind: 'node', id: g.id };
        return true;
      }
      const id = el.dataset.id;
      const ids = this.pageSel.has(id) ? [...this.pageSel] : [id];
      const sec = Ops.currentSection();
      const block = new Set(ids);
      if (sec) for (const pid of ids) for (const q of Tree.block(sec, pid)) block.add(q);
      drag = { kind: 'pages', ids, block };
      return true;
    };
    // Maus: HTML-Ziehen (ganzes Dokument hört zu – so zählen auch die Ränder und Lücken)
    const onStart = (sel) => (e) => {
      const row = e.target.closest(sel);
      if (!row || !row.dataset.id || !begin(row)) { if (row) e.preventDefault(); return; }
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', '');
    };
    gt.addEventListener('dragstart', onStart('.g-row'));
    tabs.addEventListener('dragstart', onStart('.s-tab'));
    pl.addEventListener('dragstart', onStart('.p-row'));
    document.addEventListener('dragover', (e) => {
      if (!drag) return;
      const h = hitAt(e.clientX, e.clientY);
      show(h);
      if (h) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }
    });
    document.addEventListener('drop', (e) => {
      if (!drag) return;
      const h = hitAt(e.clientX, e.clientY);
      clear();
      if (h) { e.preventDefault(); h.run(); }
      drag = null;
    });
    document.addEventListener('dragend', () => { drag = null; clear(); });

    // Finger/Stift: kurz halten, dann ziehen (HTML-Ziehen gibt es dort kaum)
    let tp = null;
    const ROWS = '.g-row, .s-tab[data-id], .p-row';
    const endTouch = (ok, x, y) => {
      if (!tp) return;
      if (tp.ghost) tp.ghost.remove();
      if (tp.timer) clearTimeout(tp.timer);
      if (tp.active && ok) { const h = hitAt(x, y); if (h) h.run(); }
      if (tp.active) { this._dndSwallow = performance.now() + 400; }
      tp = null; drag = null; clear();
      document.body.classList.remove('nav-dragging');
    };
    for (const box of [gt, tabs, pl]) box.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse' || !e.isPrimary || tp) return;
      const row = e.target.closest(ROWS);
      if (!row || !row.dataset.id || e.target.closest('input, .g-caret, .p-caret')) return;
      tp = { row, x: e.clientX, y: e.clientY, id: e.pointerId, armed: false, active: false };
      tp.timer = setTimeout(() => { if (tp) { tp.armed = true; row.classList.add('dnd-armed'); setTimeout(() => row.classList.remove('dnd-armed'), 250); } }, 300);
    });
    addEventListener('pointermove', (e) => {
      if (!tp || e.pointerId !== tp.id) return;
      const dist = Math.hypot(e.clientX - tp.x, e.clientY - tp.y);
      if (!tp.armed) { if (dist > 8) endTouch(false); return; }   // vor dem Halten bewegt: normal scrollen
      if (!tp.active) {
        if (dist < 6) return;
        if (!begin(tp.row)) { endTouch(false); return; }
        tp.active = true;
        document.body.classList.add('nav-dragging');
        const t = (tp.row.querySelector('.g-name, .s-name, .p-title') || tp.row).textContent.trim();
        tp.ghost = el('div', { class: 'nav-ghost', text: drag.kind === 'pages' && drag.ids.length > 1 ? `${drag.ids.length} Seiten` : t });
        document.body.append(tp.ghost);
        if (navigator.vibrate) try { navigator.vibrate(10); } catch (er) { /* */ }
      }
      tp.ghost.style.transform = `translate(${e.clientX + 14}px, ${e.clientY - 28}px)`;
      show(hitAt(e.clientX, e.clientY));
    }, true);
    // solange gezogen wird, nicht scrollen
    addEventListener('touchmove', (e) => { if (tp && tp.armed && e.cancelable) e.preventDefault(); }, { passive: false, capture: true });
    addEventListener('pointerup', (e) => { if (tp && e.pointerId === tp.id) endTouch(true, e.clientX, e.clientY); }, true);
    addEventListener('pointercancel', (e) => { if (tp && e.pointerId === tp.id) endTouch(false); }, true);
    // das Loslassen nach dem Ziehen öffnet nichts
    addEventListener('click', (e) => { if (this._dndSwallow && performance.now() < this._dndSwallow) { this._dndSwallow = 0; e.preventDefault(); e.stopPropagation(); } }, true);
    this._dnd = { hitAt, begin: (el) => begin(el), end: () => { drag = null; clear(); } };   // für Tests
  },

  initSplitters() {
    for (const sp of $$('.splitter')) {
      sp.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        const isGroups = sp.dataset.for === 'groups';
        const target = isGroups ? $('#nav-groups') : $('#nav-pages');
        const key = isGroups ? 'groupsW' : 'pagesW';
        const dir = (!isGroups && Store.ui.pageListSide === 'rechts') ? -1 : 1;
        const w0 = target.offsetWidth, x0 = e.clientX;
        sp.classList.add('drag');
        sp.setPointerCapture(e.pointerId);
        const move = (ev) => { const w = clamp(w0 + dir * (ev.clientX - x0), 140, 480); target.style.width = w + 'px'; Store.ui[key] = w; };
        const up = () => { sp.classList.remove('drag'); sp.removeEventListener('pointermove', move); sp.removeEventListener('pointerup', up); UiState.saveSoon(); };
        sp.addEventListener('pointermove', move);
        sp.addEventListener('pointerup', up);
      });
    }
  },
  fold(which, on) {
    const f = Store.ui.navFold || (Store.ui.navFold = {});
    f[which] = on === undefined ? !f[which] : !!on;
    UiState.saveSoon();
    this.applyWidths();
    Ribbon.refreshSoon();
    if (typeof Canvas !== 'undefined') requestAnimationFrame(() => Canvas.layout && Canvas.layout());
  },
  applyWidths() {
    const f = Store.ui.navFold || {};
    const right = Store.ui.pageListSide === 'rechts';
    const set = (id, which, w) => {
      const col = $(id);
      col.classList.toggle('folded', !!f[which]);
      col.style.width = f[which] ? '' : w + 'px';
      document.body.classList.toggle('fold-' + which, !!f[which]);
      const toRight = which === 'pages' && right;
      const btn = col.querySelector('.nav-fold'), strip = col.querySelector('.nav-strip-ic');
      if (btn) btn.innerHTML = icon(toRight ? 'foldRight' : 'foldLeft', 16);
      if (strip) strip.innerHTML = icon(toRight ? 'foldLeft' : 'foldRight', 16);
    };
    set('#nav-groups', 'groups', Store.ui.groupsW || 230);
    set('#nav-pages', 'pages', Store.ui.pagesW || 220);
    const sec = Tree.group(Store.ui.currentGroup);
    const lab = $('#pages-strip-label');
    if (lab) lab.textContent = sec ? 'Seiten · ' + sec.name : 'Seiten';
    document.body.classList.toggle('no-side', Store.ui.sidebar === false);
    document.body.classList.toggle('pages-left', !right);
  },
};
