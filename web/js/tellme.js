'use strict';
/* Suche oben wie in Office/OneNote (1.75, „Was möchten Sie tun?“, Alt+Q): das Suchfeld in der Titelleiste findet beim
 * Tippen
 *   – Aktionen:      alle Knöpfe und Menüs des Menübands im aktuellen Programm (Freiform/OneNote, Word, Excel,
 *                    PowerPoint, auch Register der Add-Ins) – Klick führt den Befehl aus bzw. öffnet das Menü
 *   – Datei:         die Bereiche im Datei-Fenster (Informationen, Öffnen, Speichern, Exportieren, Drucken, Hilfe …)
 *   – Einstellungen: jede Einstellung (Settings.index) – öffnet die Einstellungen an dieser Stelle
 *   – Seiten:        Seitentitel im Notizbuch
 * und zuletzt „… im Notizbuch suchen“ (wie bisher Enter = Suchen im Inhalt). Pfeiltasten wählen, Enter führt aus,
 * Esc schliesst. Der Index der Knöpfe wird je Programm (Seitentyp) und Add-In-Stand einmal aufgebaut. */
const TellMe = {
  _idx: null, _key: '',
  norm(s) { return String(s || '').replace(/­/g, '').replace(/\s+/g, ' ').trim(); },
  low(s) { return this.norm(s).toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss'); },
  /* Beschriftung eines Knopfs (letzter Text-Span; Symbol-Glyphen und Häkchen zählen nicht), sonst Tooltip */
  labelOf(b) {
    const sp = [...b.children].filter(x => x.tagName === 'SPAN' && !/\b(cbx|caret|glyph|bs-drop)\b/.test(x.className)).pop();
    return this.norm(sp ? sp.textContent : '') || this.norm(b.getAttribute('title')).split(/[(:–]/)[0].trim();
  },
  /* alle Knöpfe des Menübands im aktuellen Programm – auch die Einträge der Menüs (▾): beim Aufbau werden die Menüs
     „trocken“ geöffnet (UI.menu/showPopup/dialog nur mitgeschrieben, nichts erscheint) */
  async actions() {
    const mode = Ribbon.modeNow ? Ribbon.modeNow() : Ribbon.mode;
    const key = mode + '|' + (typeof Plugins !== 'undefined' && Plugins.all ? Plugins.all().map(a => a.id + (a.on === false ? '0' : '1')).join(',') : '');
    if (this._idx && this._key === key) return this._idx;
    if (this._p && this._pkey === key) return this._p;   // läuft schon (schnelles Tippen): nicht zweimal die UI-Funktionen ersetzen
    this._pkey = key;
    this._p = this._build(key, mode).finally(() => { this._p = null; });
    return this._p;
  },
  async _build(key, mode) {
    const out = [], seen = new Set();
    const prevMode = Ribbon.mode;
    Ribbon.mode = mode;
    const keep = { menu: UI.menu, show: UI.showPopup, dialog: UI.dialog, prompt: UI.prompt, info: UI.info };
    let cap = null;
    UI.menu = (items) => { cap = items; return el('div'); };
    UI.showPopup = () => el('div');
    UI.dialog = () => new Promise(() => {}); UI.prompt = () => new Promise(() => {}); UI.info = () => {};
    const menus = [];
    for (const t of Ribbon.TABS || []) {
      if (t.id === 'datei') continue;
      let frag;
      try { if (t.ctx && !t.ctx()) continue; frag = Ribbon.buildTab(t.id); } catch (e) { continue; }
      const host = el('div');
      for (const x of frag || []) if (x) host.append(x);
      for (const b of host.querySelectorAll('button.rb')) {
        if (b.classList.contains('drop') && b.dataset.for) continue;   // Pfeil eines geteilten Knopfs: der Knopf selbst zählt
        const label = this.labelOf(b);
        if (!label || label.length > 60) continue;
        const g = b.closest('.rgroup'), gl = g ? this.norm((g.querySelector(':scope > .rg-label') || {}).textContent) : '';
        const cmd = b.dataset.cmd || '', arg = b.dataset.arg;
        const k = label + '|' + cmd + '|' + (arg || '');
        if (seen.has(k)) continue;
        seen.add(k);
        const it = { kind: 'cmd', label, title: this.norm(b.getAttribute('title')), tab: t.id, tabLabel: t.label, group: gl, cmd, arg: arg ? JSON.parse(arg) : undefined, drop: !cmd, icon: (b.querySelector('svg') || {}).outerHTML || '' };
        out.push(it);
        // Menü des Knopfs: Einträge mitschreiben
        const opener = !cmd ? b : (b.querySelector('.bs-drop') || null);
        if (opener) menus.push({ opener, it });
      }
    }
    for (const { opener, it } of menus) {
      cap = null;
      try { opener.click(); } catch (e) { /* */ }
      await new Promise(r => setTimeout(r, 0));
      for (const m of cap || []) {
        if (!m || m === '-' || m.head || m.colors || !m.label) continue;
        const label = this.norm(m.label);
        if (!label || label.length > 70 || seen.has(it.label + '>' + label)) continue;
        seen.add(it.label + '>' + label);
        out.push({ kind: 'menu', label, title: this.norm(m.title || ''), tab: it.tab, tabLabel: it.tabLabel, group: it.group, parent: it.label, icon: it.icon, disabled: !!m.disabled });
      }
    }
    Object.assign(UI, { menu: keep.menu, showPopup: keep.show, dialog: keep.dialog, prompt: keep.prompt, info: keep.info });
    Ribbon.mode = prevMode;
    this._idx = out; this._key = key;
    return out;
  },
  fileItems() {
    const out = typeof Backstage !== 'undefined' ? Backstage.pages().map(([id, label, , title]) => ({ kind: 'file', label: label, title: title, page: id })) : [];
    out.push({ kind: 'file', label: 'Optionen', title: 'Einstellungen öffnen', page: 'optionen' });
    if (OfficePages.page && Canvas.page && Canvas.page.office && Canvas.page.office.asset) out.push({ kind: 'file', label: 'Speichern unter', title: 'Office-Datei mit Dateityp speichern', page: 'info' });
    return out;
  },
  /* Treffer bewerten: Anfang der Beschriftung > Wortanfang > enthalten > Tooltip/Gruppe/Register */
  score(q, it) {
    const L = this.low(it.label), T = this.low(it.title), G = this.low((it.group || '') + ' ' + (it.parent || '') + ' ' + (it.tabLabel || it.catLabel || '') + ' ' + (it.hint || ''));
    let s = 0;
    for (const w of q.split(' ').filter(Boolean)) {
      let v = 0;
      if (L.startsWith(w)) v = 10; else if (new RegExp('(^|[\\s/(-])' + w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).test(L)) v = 7; else if (L.includes(w)) v = 5;
      else if (T.includes(w)) v = 3; else if (G.includes(w)) v = 1.5;
      if (!v) return 0;
      s += v;
    }
    return s - Math.min(2, L.length / 40);
  },
  async results(raw) {
    const q = this.low(raw);
    if (!q) return [];
    const pick = (list, n) => list.map(it => ({ it, s: this.score(q, it) })).filter(x => x.s > 0).sort((a, b) => b.s - a.s).slice(0, n).map(x => x.it);
    const sets = await Settings.index().catch(() => []);
    const pages = Object.values(Store.pages || {}).filter(p => p && !p.deleted).map(p => ({ kind: 'page', label: p.title || 'Unbenannte Seite', title: '', pid: p.id }));
    return [
      ...pick(await this.actions(), 9).map(x => ({ ...x, sec: 'Aktionen' })),
      ...pick(this.fileItems(), 3).map(x => ({ ...x, sec: 'Datei' })),
      ...pick(sets.map(x => ({ ...x, kind: 'set' })), 5).map(x => ({ ...x, sec: 'Einstellungen' })),
      ...pick(pages, 5).map(x => ({ ...x, sec: 'Seiten' })),
      { kind: 'find', label: `„${this.norm(raw)}“ im Notizbuch suchen`, sec: 'Inhalt', q: raw },
    ];
  },
  /* ausführen */
  run(it) {
    this.close(true);
    if (it.kind === 'find') { Find.open('find', it.q); return; }
    if (it.kind === 'page') { App.openPage(it.pid); return; }
    if (it.kind === 'set') { Settings.show(it.cat, { find: it.label }); return; }
    if (it.kind === 'file') { if (it.page === 'optionen') Settings.show(); else Backstage.open(it.page); return; }
    if (it.kind === 'menu') {
      // Register zeigen, Menü öffnen, Eintrag wählen
      if (document.body.classList.contains('rb-min') && typeof Layout !== 'undefined') Layout.peek(true);
      Ribbon.show(it.tab);
      requestAnimationFrame(() => {
        const b = [...document.querySelectorAll('#panel button.rb')].find(x => this.labelOf(x) === it.parent);
        if (!b) { UI.toast(`„${it.label}“: Register ${it.tabLabel} → ${it.parent}`); return; }
        b.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        (b.dataset.cmd ? b.querySelector('.bs-drop') || b : b).click();
        setTimeout(() => {
          const mi = [...document.querySelectorAll('.popup .mi')].find(m => this.norm((m.querySelector('.mi-label') || {}).textContent) === it.label);
          if (mi && !mi.classList.contains('dis')) mi.click();
        }, 30);
      });
      return;
    }
    if (it.kind === 'cmd') {
      if (it.cmd && !it.drop) {
        if (Cmd.enabled && Cmd.enabled(it.cmd) === false) { UI.toast(`„${it.label}“ ist hier gerade nicht möglich`); return; }
        Cmd.run(it.cmd, it.arg);
        return;
      }
      // Menü: Register zeigen und den Knopf öffnen (das Menü hängt am Knopf)
      if (document.body.classList.contains('rb-min') && typeof Layout !== 'undefined') Layout.peek(true);
      Ribbon.show(it.tab);
      requestAnimationFrame(() => {
        const b = [...document.querySelectorAll('#panel button.rb')].find(x => this.labelOf(x) === it.label);
        if (b) { b.scrollIntoView({ block: 'nearest', inline: 'nearest' }); b.click(); } else UI.toast(`„${it.label}“ im Register ${it.tabLabel}`);
      });
    }
  },
  /* ---------------------------------------------------------------- Liste unter dem Suchfeld */
  init() {
    const ts = $('#tb-search');
    if (!ts) return;
    ts.placeholder = 'Suchen – Befehle, Einstellungen, Seiten (Alt+Q)';
    ts.title = 'Was möchten Sie tun? Befehle, Einstellungen und Seiten finden · Enter im leeren Ergebnis = im Inhalt suchen';
    ts.setAttribute('aria-autocomplete', 'list');
    let t = 0;
    ts.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => this.update(ts.value), 90); });
    ts.addEventListener('focus', () => { this.warm(); if (ts.value.trim()) this.update(ts.value); else this.hint(); });
    ts.addEventListener('blur', () => setTimeout(() => { if (document.activeElement !== ts) this.close(); }, 160));
    // vor dem bisherigen Enter (= im Inhalt suchen): gewählten Treffer ausführen
    ts.addEventListener('keydown', (e) => {
      if (!this.el) return;
      const its = [...this.el.querySelectorAll('.tm-it')];
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault(); e.stopImmediatePropagation();
        let i = its.findIndex(x => x.classList.contains('on'));
        i = e.key === 'ArrowDown' ? Math.min(its.length - 1, i + 1) : Math.max(-1, i - 1);
        its.forEach((x, k) => x.classList.toggle('on', k === i));
        if (its[i]) its[i].scrollIntoView({ block: 'nearest' });
      } else if (e.key === 'Enter') {
        const on = its.find(x => x.classList.contains('on'));
        if (on) { e.preventDefault(); e.stopImmediatePropagation(); const it = this._res[+on.dataset.i]; ts.value = ''; ts.blur(); this.run(it); }
        else this.close(true);
      } else if (e.key === 'Escape') this.close(true);
    }, true);
    document.addEventListener('keydown', (e) => {
      // Alt+Q wie Office (Microsoft Search)
      if (e.altKey && !e.ctrlKey && !e.metaKey && (e.key === 'q' || e.key === 'Q' || e.code === 'KeyQ')) {
        e.preventDefault(); e.stopPropagation();
        if (typeof Layout !== 'undefined' && document.body.classList.contains('lay-phone')) Layout.openSearch(); else ts.focus();
        ts.select();
      }
    }, true);
  },
  box() {
    if (this.el && this.el.isConnected) return this.el;
    this.el = el('div', { class: 'tm-pop', role: 'listbox' });
    this.el.addEventListener('mousedown', (e) => e.preventDefault());
    document.body.append(this.el);
    return this.el;
  },
  place() {
    const ts = $('#tb-search'), r = (ts.closest('.tb-search') || ts).getBoundingClientRect();
    const w = Math.max(r.width, Math.min(440, innerWidth - 16));
    this.el.style.left = Math.max(8, Math.min(innerWidth - w - 8, r.left)) + 'px';
    this.el.style.top = (r.bottom + 4) + 'px';
    this.el.style.width = w + 'px';
  },
  hint() {
    const b = this.box();
    const mode = { dok: 'Word', tab: 'Excel', folie: 'PowerPoint' }[Ribbon.modeNow ? Ribbon.modeNow() : ''] || 'KnowledgeTree';
    b.innerHTML = `<div class="tm-hint">Was möchten Sie tun? Tippen Sie z. B. <b>Tabelle</b>, <b>Seitenrand</b>, <b>Design</b> oder <b>Sicherung</b> – gesucht wird in allen Befehlen von ${mode}, in den Einstellungen und in den Seiten.</div>`;
    this._res = [];
    this.place();
  },
  async update(v) {
    if (!v.trim()) { this.hint(); return; }
    const res = await this.results(v);
    if ($('#tb-search').value !== v) return;
    this._res = res;
    const b = this.box();
    b.innerHTML = '';
    let sec = '';
    res.forEach((it, i) => {
      if (it.sec !== sec) { sec = it.sec; b.append(el('div', { class: 'tm-sec', text: sec })); }
      const dis = (it.kind === 'cmd' && it.cmd && !it.drop && Cmd.enabled && Cmd.enabled(it.cmd) === false) || it.disabled;
      const ic = it.kind === 'cmd' || it.kind === 'menu' ? (it.icon || icon('bolt', 16)) : icon({ file: 'page', set: 'settings', page: 'page', find: 'search' }[it.kind] || 'search', 16);
      const where = it.kind === 'cmd' ? `${it.tabLabel}${it.group ? ' › ' + it.group : ''}` : it.kind === 'menu' ? `${it.tabLabel} › ${it.parent}` : it.kind === 'set' ? `Einstellungen › ${it.catLabel}` : it.kind === 'file' ? 'Datei' : '';
      const row = el('div', { class: 'tm-it' + (dis ? ' dis' : '') + (it.drop ? ' drop' : ''), role: 'option', dataset: { i }, title: it.title || it.hint || '' });
      row.innerHTML = `<span class="tm-ic">${ic}</span><span class="tm-l">${escapeHtml(it.label)}${it.drop ? ' ▾' : ''}</span><span class="tm-w">${escapeHtml(where)}</span>`;
      row.addEventListener('click', () => { const ts = $('#tb-search'); ts.value = ''; ts.blur(); this.run(it); });
      row.addEventListener('mousemove', () => { for (const x of b.querySelectorAll('.tm-it.on')) x.classList.remove('on'); row.classList.add('on'); });
      b.append(row);
    });
    this.place();
  },
  close(clear) {
    if (this.el) { this.el.remove(); this.el = null; }
    if (clear) this._res = [];
  },
  /* Menüband neu (Add-In an/aus): Index verwerfen */
  reset() { this._idx = null; this._key = ''; },
  /* Liste vorab aufbauen (Fokus im Suchfeld), damit das erste Tippen sofort Treffer zeigt */
  warm() { this.actions(); Settings.index(); },
};
if (typeof module !== 'undefined') module.exports = { TellMe };
