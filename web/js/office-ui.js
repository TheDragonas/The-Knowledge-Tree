'use strict';
/* Office-Konzept 1.73 – gemeinsame Oberfläche wie in Word, Excel und PowerPoint (nach dem Konzept des Users
 * „Microsoft Office – Funktionen & Struktur“): Menüband mit Kontextregistern, Backstage „Informationen“
 * (Eigenschaften, Schützen, Prüfen), Symbolleiste für den Schnellzugriff, Statusleiste mit Ansichten, Designs
 * (Farb- und Schriftschema für alle drei Programme) und die fehlenden Ansichten (Word: Lesemodus; PowerPoint:
 * Gliederung, Leseansicht, Laserpointer/Stift beim Vortragen).
 *
 *   Schnellzugriff: Store.ui.qat = [{ cmd, arg, title, svg }] – Rechtsklick auf einen Knopf im Menüband
 *   Kontextregister „Tabellenlayout“: erscheint, wenn die Schreibmarke in einer Tabelle im Text steht
 *   Eigenschaften: docProps/core.xml (p.office.props / props0), Design: theme1.xml (p.office.theme → neu einlesen) */
const OfficeUI = {
  init() { this.qat(); this.panelMenu(); },

  /* ================================================================ Symbolleiste für den Schnellzugriff */
  SVG_OK: new Set(['svg', 'path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'g', 'text', 'tspan']),
  /* nur Zeichnungs-Elemente und -Attribute (die Knöpfe stammen aus dem eigenen Menüband) */
  cleanSvg(s) {
    try {
      const d = new DOMParser().parseFromString(String(s || ''), 'image/svg+xml'), r = d.documentElement;
      if (!r || r.nodeName !== 'svg') return '';
      const walk = (n) => { for (const c of [...n.children]) { if (!this.SVG_OK.has(c.nodeName)) { c.remove(); continue; } for (const a of [...c.attributes]) if (/^on|href/i.test(a.name)) c.removeAttribute(a.name); walk(c); } };
      for (const a of [...r.attributes]) if (/^on|href/i.test(a.name)) r.removeAttribute(a.name);
      walk(r);
      return new XMLSerializer().serializeToString(r);
    } catch (e) { return ''; }
  },
  qat() {
    const left = document.querySelector('#titlebar .tb-left');
    if (!left) return;
    let host = document.getElementById('qat-own');
    if (!host) {
      host = el('span', { id: 'qat-own' });
      const more = el('button', { class: 'qat drop', id: 'qat-more', type: 'button', title: 'Symbolleiste für den Schnellzugriff anpassen', html: icon('chevDown', 10) });
      more.addEventListener('click', () => this.qatMenu(more));
      left.append(host, more);
    }
    host.innerHTML = '';
    for (const [i, q] of (Store.ui.qat || []).entries()) {
      const b = el('button', { class: 'qat', type: 'button', title: q.title + ' (Schnellzugriff · Rechtsklick = entfernen)' });
      b.innerHTML = this.cleanSvg(q.svg) || `<span class="qat-txt">${escapeHtml((q.title || '?').slice(0, 2))}</span>`;
      b.addEventListener('click', () => Cmd.run(q.cmd, q.arg));
      b.addEventListener('contextmenu', (e) => { e.preventDefault(); UI.menu([{ label: 'Aus der Symbolleiste für den Schnellzugriff entfernen', icon: 'x', action: () => this.qatRemove(i) }], e.clientX, e.clientY); });
      host.append(b);
    }
  },
  QAT_STD: [['newPage', 'Neue Seite', 'pagePlus'], ['officeOpen', 'Office-Datei öffnen', 'import'], ['print', 'Drucken', 'print'], ['spellToggle', 'Rechtschreibung', 'check'], ['symbol', 'Symbol', 'symbol'], ['xlSortAsc', 'Aufsteigend sortieren', 'sortAsc'], ['showStart', 'Von Beginn an vorführen', 'play'], ['macroList', 'Makros', 'play']],
  qatHas(cmd, arg) { return (Store.ui.qat || []).findIndex(q => q.cmd === cmd && JSON.stringify(q.arg ?? null) === JSON.stringify(arg ?? null)); },
  qatAdd(cmd, arg, title, svg) {
    if (this.qatHas(cmd, arg) >= 0) return;
    Store.ui.qat = [...(Store.ui.qat || []), { cmd, ...(arg !== undefined ? { arg } : {}), title: String(title || cmd).slice(0, 80), svg: this.cleanSvg(svg) }].slice(0, 24);
    UiState.saveSoon(); this.qat();
    UI.toast('In der Symbolleiste für den Schnellzugriff (oben links)');
  },
  qatRemove(i) { const l = (Store.ui.qat || []).slice(); l.splice(i, 1); Store.ui.qat = l; UiState.saveSoon(); this.qat(); },
  qatMenu(anchor) {
    const items = [{ head: 'Symbolleiste für den Schnellzugriff' }];
    for (const [cmd, label, ic] of this.QAT_STD) {
      if (!COMMANDS[cmd]) continue;
      const i = this.qatHas(cmd);
      items.push({ label, checked: i >= 0, action: () => i >= 0 ? this.qatRemove(i) : this.qatAdd(cmd, undefined, label, icon(ic, 16)) });
    }
    items.push('-', { label: 'Weitere Befehle: Rechtsklick auf einen Knopf im Menüband', disabled: true });
    if ((Store.ui.qat || []).length) items.push({ label: 'Zurücksetzen (alle eigenen entfernen)', icon: 'restore', action: () => { Store.ui.qat = []; UiState.saveSoon(); this.qat(); } });
    UI.menu(items, 0, 0, { anchor });
  },
  /* Rechtsklick auf einen Knopf im Menüband */
  panelMenu() {
    const panel = document.getElementById('panel');
    if (!panel || panel._qat) return;
    panel._qat = true;
    panel.addEventListener('contextmenu', (e) => {
      const b = e.target.closest && e.target.closest('[data-cmd]');
      if (!b || e.target.closest('input')) return;
      e.preventDefault();
      const cmd = b.dataset.cmd, arg = b.dataset.arg !== undefined ? JSON.parse(b.dataset.arg) : undefined;
      const title = (b.title || b.textContent || cmd).split(/ – | \(/)[0].trim();
      const i = this.qatHas(cmd, arg);
      const svg = b.querySelector('svg');
      UI.menu([{ head: title }, i >= 0 ? { label: 'Aus der Symbolleiste für den Schnellzugriff entfernen', icon: 'x', action: () => this.qatRemove(i) } : { label: 'Zur Symbolleiste für den Schnellzugriff hinzufügen', icon: 'plus', action: () => this.qatAdd(cmd, arg, title, svg ? svg.outerHTML : '') }], e.clientX, e.clientY);
    });
  },

  /* ================================================================ Statusleiste: Ansichten (unten rechts wie in Office) */
  views(p) {
    const host = document.getElementById('sb-views');
    if (!host) return;
    const kind = p && p.office && p.office.asset ? p.type : '';
    let list = [];
    if (kind === 'dok') list = [['wRead', null, 'book', 'Lesemodus', false], ['wPrintView', null, 'page', 'Drucklayout', true], ['wPages', null, 'pages', 'Seitenansicht: eine, zwei oder mehrere Seiten wie ein PDF-Reader', false]];
    else if (kind === 'tab') list = [['xlNormalView', null, 'table', 'Normal', !Store.ui.xlBreaks], ['xlBreaks', null, 'hr', 'Umbruchvorschau', !!Store.ui.xlBreaks]];
    else if (kind === 'folie') { const v = OfficeSlides.view(p); list = [['pptView', 'lern', 'notes', 'Lernansicht: alle Folien, Notizen links, Animationen rechts', v === 'lern'], ['pptView', 'normal', 'slides', 'Normal: nur die aktuelle Folie', v === 'normal'], ['pSorter', null, 'grid', 'Foliensortierung', false], ['pRead', null, 'book', 'Leseansicht (Vorführen im Fenster)', false], ['showHere', null, 'play', 'Bildschirmpräsentation ab dieser Folie', false]]; }
    const key = kind + JSON.stringify(list.map(x => x[4]));
    if (host._v === key && host.children.length === list.length) return;
    host._v = key; host.innerHTML = '';
    for (const [cmd, arg, ic, t, on] of list) {
      const b = el('button', { class: 'sb-btn sb-view' + (on ? ' on' : ''), type: 'button', html: icon(ic, 14), title: t });
      b.addEventListener('click', () => Cmd.run(cmd, arg));
      host.append(b);
    }
  },
  refreshViews() { const h = document.getElementById('sb-views'); if (h) h._v = null; this.views(Canvas.page); },

  /* ================================================================ Kontextregister „Tabellenlayout“ (Tabellen im Text) */
  cell() {
    if (!Canvas.editing) return null;
    const t = Canvas.textEl(Canvas.editing), s = getSelection();
    if (!t || !s.rangeCount) return null;
    let n = s.anchorNode;
    if (n && n.nodeType === 3) n = n.parentNode;
    const td = n && n.closest && n.closest('td, th');
    if (!td || !t.contains(td)) return null;
    const tr = td.parentElement, table = td.closest('table');
    return { t, td, tr, table, ci: [...tr.children].indexOf(td), ri: [...table.rows].indexOf(tr) };
  },
  inTable() { return !!this.cell(); },
  tbl(op) {
    const c = this.cell();
    if (!c || Store.readOnly) return;
    const { t, td, tr, table, ci } = c;
    const empty = (tag = 'td') => { const x = document.createElement(tag); x.innerHTML = '<br>'; return x; };
    const caret = (x) => { if (!x) return; const r = document.createRange(); r.selectNodeContents(x); r.collapse(true); const s = getSelection(); s.removeAllRanges(); s.addRange(r); };
    let focus = null;
    // Spalte im Raster (colspan beachten)
    const colOf = (row, i) => { let k = 0; for (const x of row.children) { const sp = +x.colSpan || 1; if (i < k + sp) return x; k += sp; } return null; };
    const gi = (() => { let k = 0; for (const x of tr.children) { if (x === td) return k; k += +x.colSpan || 1; } return 0; })();
    if (op === 'rowAbove' || op === 'rowBelow') {
      const nr = document.createElement('tr');
      for (const x of tr.children) { const n = empty(x.tagName.toLowerCase() === 'th' ? 'th' : 'td'); if (x.colSpan > 1) n.colSpan = x.colSpan; nr.append(n); }
      if (op === 'rowAbove') tr.before(nr); else tr.after(nr);
      focus = nr.children[Math.min(ci, nr.children.length - 1)];
    } else if (op === 'colLeft' || op === 'colRight') {
      for (const row of table.rows) { const x = colOf(row, gi) || row.lastElementChild; const n = empty(x && x.tagName.toLowerCase() === 'th' ? 'th' : 'td'); if (!x) row.append(n); else if (op === 'colLeft') x.before(n); else x.after(n); if (row === tr) focus = n; }
    } else if (op === 'delRow') {
      focus = (tr.nextElementSibling || tr.previousElementSibling || {}).children?.[ci] || null;
      if (table.rows.length <= 1) { table.remove(); focus = null; } else tr.remove();
    } else if (op === 'delCol') {
      const maxc = Math.max(...[...table.rows].map(r => [...r.children].reduce((n, x) => n + (+x.colSpan || 1), 0)));
      if (maxc <= 1) table.remove();
      else for (const row of table.rows) { const x = colOf(row, gi); if (!x) continue; if (x.colSpan > 1) x.colSpan -= 1; else x.remove(); }
      focus = tr.isConnected ? (tr.children[Math.max(0, ci - 1)] || tr.children[0]) : null;
    } else if (op === 'delTable') table.remove();
    else if (op === 'merge') {
      const nx = td.nextElementSibling;
      if (!nx) { UI.toast('Rechts daneben ist keine Zelle'); return; }
      const txt = nx.textContent.trim() ? nx.innerHTML : '';
      if (txt) td.innerHTML = (td.textContent.trim() ? td.innerHTML + ' ' : '') + txt;
      td.colSpan = (+td.colSpan || 1) + (+nx.colSpan || 1); nx.remove(); focus = td;
    } else if (op === 'split') {
      if ((+td.colSpan || 1) < 2) { UI.toast('Die Zelle ist nicht verbunden'); return; }
      td.colSpan -= 1; td.after(empty(td.tagName.toLowerCase())); focus = td;
    } else if (op === 'head') {
      const first = table.rows[0];
      const toTh = first && first.children[0] && first.children[0].tagName !== 'TH';
      if (first) for (const x of [...first.children]) { const n = document.createElement(toTh ? 'th' : 'td'); n.innerHTML = x.innerHTML; if (x.colSpan > 1) n.colSpan = x.colSpan; x.replaceWith(n); }
      focus = first && first.children[0];
    } else if (op === 'sortAsc' || op === 'sortDesc') {
      const rows = [...table.rows], head = rows[0] && rows[0].children[0] && rows[0].children[0].tagName === 'TH' ? 1 : 0;
      const body = rows.slice(head), host = body[0] && body[0].parentElement;
      const key = (r) => (colOf(r, gi) || { textContent: '' }).textContent.trim();
      body.sort((a, b) => { const x = key(a), y = key(b), nx = parseFloat(x.replace(/’|'/g, '').replace(',', '.')), ny = parseFloat(y.replace(/’|'/g, '').replace(',', '.')); const q = isFinite(nx) && isFinite(ny) ? nx - ny : x.localeCompare(y, 'de', { numeric: true }); return op === 'sortDesc' ? -q : q; });
      for (const r of body) host.append(r);
      focus = td;
    }
    t.dispatchEvent(new Event('input', { bubbles: true }));
    caret(focus && focus.isConnected ? focus : null);
    Ribbon.refresh();
  },
  textToTable() {
    if (!Canvas.editing) { UI.toast('Zuerst Text markieren (Zeilen, Spalten mit Tabstopp oder ;)'); return; }
    const s = getSelection(), t = Canvas.textEl(Canvas.editing);
    const txt = s.toString();
    if (!txt.trim() || !t) { UI.toast('Zuerst die Zeilen markieren, die eine Tabelle werden sollen'); return; }
    const lines = txt.split(/\r?\n/).filter(l => l.trim());
    const sep = lines.some(l => l.includes('\t')) ? '\t' : lines.some(l => l.includes(';')) ? ';' : ',';
    const rows = lines.map(l => l.split(sep).map(x => x.trim()));
    const n = Math.max(...rows.map(r => r.length));
    const html = '<table><tbody>' + rows.map(r => '<tr>' + Array.from({ length: n }, (_, i) => `<td>${escapeHtml(r[i] || '') || '<br>'}</td>`).join('') + '</tr>').join('') + '</tbody></table><div><br></div>';
    document.execCommand('insertHTML', false, html);
    t.dispatchEvent(new Event('input', { bubbles: true }));
  },

  /* ================================================================ Word: Lesemodus */
  readMode() {
    const p = OfficePages.page('docx'); if (!p) return;
    if (Canvas.editing) Canvas.stopEditing();
    const st = Store.ui.wordRead || (Store.ui.wordRead = { w: 'std', bg: 'weiss', fs: 0 });
    const ov = el('div', { class: 'ui-read', tabindex: '-1' });
    const doc = el('article', { class: 'ui-rdoc' });
    for (const m of p.office.map || []) {
      const b = m.box && p.boxes.find(x => x.id === m.box);
      if (!b) continue;
      if (b.images && b.images.length && b.ox && b.ox.k === 'wimg') { for (const im of b.images) { const i2 = el('img', { alt: '' }); i2.style.maxWidth = Math.min(im.w, 900) + 'px'; Backend.setImg(i2, im.src); doc.append(el('p', { class: 'ui-rimg' }, i2)); } if (b.html) { const d = el('div'); d.innerHTML = b.html; doc.append(d); } continue; }
      const d = el('div', { class: b.ox && b.ox.k === 'wlock' ? 'ui-rlock' : '' });
      d.innerHTML = b.html;
      hydrateBox(d);
      doc.append(d);
    }
    const apply = () => { ov.dataset.w = st.w; ov.dataset.bg = st.bg; doc.style.fontSize = (17 + st.fs * 2) + 'px'; };
    const btn = (label, fn, title) => { const b = el('button', { class: 'btn small', type: 'button', text: label, title: title || label }); b.addEventListener('click', () => { fn(); apply(); UiState.saveSoon(); }); return b; };
    const sel = (k, opts, label) => { const s = el('select', { title: label }, ...opts.map(([v, l]) => el('option', { value: v, text: l }))); s.value = st[k]; s.addEventListener('change', () => { st[k] = s.value; apply(); UiState.saveSoon(); }); return s; };
    const close = () => { ov.remove(); document.removeEventListener('keydown', key, true); };
    const key = (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); } };
    const bar = el('div', { class: 'ui-rbar' }, el('b', { text: p.title || 'Dokument' }), el('span', { class: 'ui-rgrow' }),
      sel('w', [['schmal', 'Spaltenbreite: schmal'], ['std', 'Spaltenbreite: Standard'], ['breit', 'Spaltenbreite: breit']], 'Spaltenbreite'),
      sel('bg', [['weiss', 'Seitenfarbe: keine'], ['sepia', 'Seitenfarbe: Sepia'], ['invert', 'Seitenfarbe: invertiert']], 'Seitenfarbe'),
      btn('A−', () => { st.fs = Math.max(-3, st.fs - 1); }, 'Schrift kleiner'), btn('A+', () => { st.fs = Math.min(8, st.fs + 1); }, 'Schrift grösser'),
      el('button', { class: 'btn primary', type: 'button', text: 'Dokument bearbeiten', title: 'Lesemodus schliessen (Esc)', onclick: close }));
    ov.append(bar, el('div', { class: 'ui-rscroll' }, doc));
    document.body.append(ov);
    document.addEventListener('keydown', key, true);
    apply();
    ov.focus();
  },

  /* ================================================================ PowerPoint: Gliederungsansicht, Leseansicht */
  async outline() {
    const p = OfficePages.page('pptx'); if (!p) return;
    if (this._outline) { this._outline.remove(); this._outline = null; Ribbon.refresh(); return; }
    if (Canvas.editing) Canvas.stopEditing();
    const deck = await OfficeSaveAs.deckOf(await OfficePages.current(p));
    const frames = OfficePpt.frames(p);
    const ov = el('div', { class: 'px-sort ui-outline', tabindex: '-1' });
    const close = () => { ov.remove(); this._outline = null; Ribbon.refresh(); OfficeView.sync(true); };
    ov.append(el('div', { class: 'px-sbar' }, el('b', { text: 'Gliederung' }), el('span', { class: 'bs-note', text: 'Text aller Folien · Klick = Folie zeigen' }), el('button', { class: 'btn', type: 'button', text: 'Normal', onclick: close })));
    const list = el('div', { class: 'ui-olist' });
    deck.slides.forEach((s, i) => {
      const items = s.items.filter(x => x.paras).sort((a, b) => (b.title - a.title) || a.y - b.y || a.x - b.x);
      const t = items.find(x => x.title);
      const row = el('div', { class: 'ui-oslide' + (s.hidden ? ' hid' : '') });
      row.append(el('span', { class: 'ui-on', text: String(i + 1) }), el('span', { class: 'ui-oic', html: icon('slides', 16) }));
      const body = el('div', { class: 'ui-obody' });
      body.append(el('div', { class: 'ui-otitle', text: t ? t.paras.map(q => q.runs.map(r => r.t).join('')).join(' ').trim() || '(ohne Titel)' : '(ohne Titel)' }));
      for (const it of items) if (it !== t) for (const q of it.paras) { const txt = q.runs.map(r => r.t).join(''); if (txt.trim()) body.append(el('div', { class: 'ui-opara', style: { paddingLeft: (q.lvl * 18 + (q.bullet ? 14 : 0)) + 'px' }, text: (q.bullet ? '• ' : '') + txt })); }
      row.append(body);
      row.addEventListener('click', () => { const f = frames[i]; close(); if (f) OfficePpt.focusSlide(f.id, true); });
      list.append(row);
    });
    ov.append(list);
    for (const ev of ['pointerdown', 'mousedown', 'click', 'dblclick', 'wheel', 'contextmenu']) ov.addEventListener(ev, (e) => e.stopPropagation(), { passive: ev !== 'contextmenu' && ev !== 'wheel' });
    ov.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } });
    OfficeView.host().append(ov);
    this._outline = ov;
    ov.focus();
    Ribbon.refresh();
  },

  /* ================================================================ Eigenschaften (docProps/core.xml) und Design (theme) */
  NS: { cp: 'http://schemas.openxmlformats.org/package/2006/metadata/core-properties', dc: 'http://purl.org/dc/elements/1.1/', dcterms: 'http://purl.org/dc/terms/' },
  PROPS: [['title', 'dc', 'Titel'], ['subject', 'dc', 'Thema'], ['creator', 'dc', 'Autor'], ['keywords', 'cp', 'Stichwörter'], ['category', 'cp', 'Kategorie'], ['description', 'dc', 'Kommentare'], ['lastModifiedBy', 'cp', 'Zuletzt geändert von']],
  async coreOf(pkg) { const r = (await pkg.rels(null)).find(x => /\/core-properties$/.test(x.type) && pkg.has(x.path)); return r ? r.path : null; },
  async readProps(pkg, p) {
    const props = {};
    const path = await this.coreOf(pkg);
    if (path) {
      const d = await pkg.xml(path);
      for (const [k, ns] of this.PROPS) { const e = d.getElementsByTagNameNS(this.NS[ns], k)[0]; if (e && e.textContent) props[k] = e.textContent; }
      for (const k of ['created', 'modified']) { const e = d.getElementsByTagNameNS(this.NS.dcterms, k)[0]; if (e && e.textContent) props['_' + k] = e.textContent; }
    }
    p.office.props = props; p.office.props0 = JSON.stringify(props);
    // Design: Namen des Farb- und Schriftschemas
    const th = await this.themes(pkg);
    if (th.length) { const d = await pkg.xml(th[0]), A = Ooxml.NS.a; const cs = d.getElementsByTagNameNS(A, 'clrScheme')[0], fs = d.getElementsByTagNameNS(A, 'fontScheme')[0]; p.office.themeName = { c: cs ? cs.getAttribute('name') : '', f: fs ? fs.getAttribute('name') : '' }; }
  },
  async writeProps(pkg, p) {
    const o = p.office;
    if (!o.props || JSON.stringify(o.props) === (o.props0 || '{}')) return;
    let path = await this.coreOf(pkg);
    if (!path) {
      path = 'docProps/core.xml';
      await pkg.addPart(path, `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n<cp:coreProperties xmlns:cp="${this.NS.cp}" xmlns:dc="${this.NS.dc}" xmlns:dcterms="${this.NS.dcterms}" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"/>`, 'application/vnd.openxmlformats-package.core-properties+xml');
      await pkg.addRel(null, 'http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties', path);
    }
    const d = await pkg.xml(path), root = d.documentElement;
    for (const [k, ns] of this.PROPS) {
      let e = d.getElementsByTagNameNS(this.NS[ns], k)[0];
      const v = o.props[k] || '';
      if (!v) { if (e) e.remove(); continue; }
      if (!e) { const pre = root.lookupPrefix(this.NS[ns]) || ns; e = d.createElementNS(this.NS[ns], pre + ':' + k); root.append(e); }
      e.textContent = v;
    }
    pkg.setXml(path, d);
  },
  propsDirty(p) { return JSON.stringify(p.office.props || {}) !== (p.office.props0 || '{}'); },
  setProps(p, props, label) { p.office.props = { ...(p.office.props || {}), ...props }; for (const k of Object.keys(p.office.props)) if (!p.office.props[k]) delete p.office.props[k]; Hist.touchPage(p.id); Hist.commit(label || 'Eigenschaften'); },

  /* Designs: Farbschema (dk1, lt1, dk2, lt2, Akzent 1–6, Link, besuchter Link) und Schriftschema (Überschriften, Text) */
  COLORS: [
    ['Office', ['000000', 'FFFFFF', '44546A', 'E7E6E6', '4472C4', 'ED7D31', 'A5A5A5', 'FFC000', '5B9BD5', '70AD47', '0563C1', '954F72']],
    ['Office 2023', ['000000', 'FFFFFF', '0E2841', 'E8E8E8', '156082', 'E97132', '196B24', '0F9ED5', 'A02B93', '4EA72E', '467886', '96607D']],
    ['Blau', ['000000', 'FFFFFF', '17406D', 'DBEFF9', '0F6FC6', '009DD9', '0BD0D9', '10CF9B', '7CCA62', 'A5C249', 'F49100', '85DFD0']],
    ['Grün', ['000000', 'FFFFFF', '455F51', 'E3DED1', '549E39', '8AB833', 'C0CF3A', '029676', '4AB5C4', '0989B1', '6B9F25', 'BA6906']],
    ['Rot-Orange', ['000000', 'FFFFFF', '505046', 'EEECE1', 'E84C22', 'FFBD47', 'B64926', 'FF8427', 'CC9900', 'B22600', 'CC9900', '666699']],
    ['Violett', ['000000', 'FFFFFF', '373545', 'DCD8DC', 'AD84C6', '8784C7', '5D739A', '6997AF', '84ACB6', '6F8183', '69A020', '8C8C8C']],
    ['Graustufen', ['000000', 'FFFFFF', '000000', 'F8F8F8', 'DDDDDD', 'B2B2B2', '969696', '808080', '5F5F5F', '4D4D4D', '5F5F5F', '919191']],
    ['Papier', ['000000', 'FFFFFF', '444D26', 'FEFAC9', 'A5B592', 'F3A447', 'E7BC29', 'D092A7', '9C85C0', '809EC2', '8E58B6', '7F6F6F']],
  ],
  FONTS: [['Office', 'Calibri Light', 'Calibri'], ['Office 2023', 'Aptos Display', 'Aptos'], ['Arial', 'Arial', 'Arial'], ['Segoe UI', 'Segoe UI Light', 'Segoe UI'], ['Georgia', 'Georgia', 'Georgia'], ['Cambria', 'Cambria', 'Cambria'], ['Times New Roman', 'Times New Roman', 'Times New Roman'], ['Verdana', 'Verdana', 'Verdana']],
  SLOTS: ['dk1', 'lt1', 'dk2', 'lt2', 'accent1', 'accent2', 'accent3', 'accent4', 'accent5', 'accent6', 'hlink', 'folHlink'],
  async themes(pkg) {
    const out = new Set();
    const main = (await pkg.rels(pkg.main)).filter(r => /\/theme$/.test(r.type) && pkg.has(r.path)).map(r => r.path);
    main.forEach(x => out.add(x));
    for (const m of (await pkg.rels(pkg.main)).filter(r => /slideMaster$/.test(r.type) && pkg.has(r.path))) for (const r of (await pkg.rels(m.path)).filter(x => /\/theme$/.test(x.type) && pkg.has(x.path))) out.add(r.path);
    return [...out];
  },
  async writeTheme(pkg, p) {
    const t = p.office.theme;
    if (!t || (!t.c && !t.f)) return;
    const A = Ooxml.NS.a, X = OfficePages;
    const col = t.c && this.COLORS.find(x => x[0] === t.c), fnt = t.f && this.FONTS.find(x => x[0] === t.f);
    for (const path of await this.themes(pkg)) {
      const d = await pkg.xml(path);
      const cs = d.getElementsByTagNameNS(A, 'clrScheme')[0];
      if (col && cs) {
        cs.setAttribute('name', col[0]);
        this.SLOTS.forEach((k, i) => { const e = X.kid(cs, A, k); if (!e) return; e.textContent = ''; for (const c of [...e.children]) c.remove(); e.append(X.mk(d, A, 'srgbClr', { val: col[1][i] })); });
      }
      const fs = d.getElementsByTagNameNS(A, 'fontScheme')[0];
      if (fnt && fs) {
        fs.setAttribute('name', fnt[0]);
        for (const [tag, face] of [['majorFont', fnt[1]], ['minorFont', fnt[2]]]) { const e = X.kid(fs, A, tag), l = e && X.kid(e, A, 'latin'); if (l) { l.setAttribute('typeface', face); l.removeAttribute('panose'); } }
      }
      pkg.setXml(path, d);
    }
  },
  async setTheme(kind, name) {
    const p = OfficePages.page(); if (!p || Store.readOnly) return;
    p.office.theme = { ...(p.office.theme || {}), [kind]: name };
    try { await OfficePages.rebuild(); UI.toast('Design übernommen: ' + name, 2500); }
    catch (e) { console.error(e); UI.toast(e.message, 5000); }
  },
  themeMenu(kind, anchor) {
    const p = OfficePages.page(); if (!p) return;
    const cur = (p.office.themeName || {})[kind];
    const box = el('div', { class: 'ui-thm' });
    box.append(el('div', { class: 'mhead', text: kind === 'c' ? 'Designfarben' : 'Designschriftarten' }));
    for (const it of kind === 'c' ? this.COLORS : this.FONTS) {
      const b = el('button', { class: 'ui-thi' + (cur === it[0] ? ' on' : ''), type: 'button' });
      if (kind === 'c') b.append(el('span', { class: 'ui-sw', html: it[1].slice(2, 10).map(c => `<i style="background:#${c}"></i>`).join('') }), el('span', { text: it[0] }));
      else b.append(el('span', { class: 'ui-fa', text: 'Aa', style: { fontFamily: `"${it[1]}"` } }), el('span', { class: 'ui-fn' }, el('b', { text: it[0] }), el('small', { text: it[1] + ' / ' + it[2] })));
      b.addEventListener('click', () => { UI.closePopup(); this.setTheme(kind, it[0]); });
      box.append(b);
    }
    box.append(el('div', { class: 'bs-note', text: 'Gilt für die ganze Datei (Designfarben/-schriften wie in Office); die Seite wird danach neu eingelesen.' }));
    UI.showPopup(box, 0, 0, { anchor });
  },

  /* ================================================================ Datei → Informationen (Office-Seite) */
  infoSections(p, B) {
    const o = p.office, out = [];
    // Eigenschaften
    const props = o.props || {};
    const form = el('div', { class: 'ui-props' });
    const ins = {};
    for (const [k, , label] of this.PROPS) {
      const inp = k === 'description' ? el('textarea', { rows: 2, class: 'sa-name' }) : el('input', { type: 'text', class: 'sa-name' });
      inp.value = props[k] || ''; ins[k] = inp;
      form.append(el('label', { class: 'sa-row' }, el('span', { text: label }), inp));
    }
    const st = this.stats(p);
    const save = el('button', { class: 'btn primary', type: 'button', text: 'Eigenschaften übernehmen' });
    save.addEventListener('click', () => { const v = {}; for (const k of Object.keys(ins)) v[k] = ins[k].value.trim(); this.setProps(p, v); UI.toast('Eigenschaften gespeichert – stehen beim nächsten Speichern in der Datei'); });
    if (Store.readOnly) save.disabled = true;
    out.push(B.section('Eigenschaften', form, el('div', { class: 'oio-row' }, save, el('p', { class: 'bs-note', text: st + (props._created ? ` · erstellt ${new Date(props._created).toLocaleString('de-CH')}` : '') + (props._modified ? ` · geändert ${new Date(props._modified).toLocaleString('de-CH')}` : '') }))));
    // Schützen
    const tiles = [];
    if (o.fmt === 'xlsx') {
      const c = typeof OfficeXT !== 'undefined' && OfficeXT.cur && OfficeXT.cur();
      const sp = c && c.d.prot && c.d.prot.on;
      tiles.push(B.tile('lock', sp ? 'Blattschutz aufheben' : 'Aktuelles Blatt schützen', sp ? 'Das Blatt ist geschützt – gesperrte Zellen lassen sich nicht ändern' : 'Gesperrte Zellen vor Änderungen schützen (optional mit Kennwort)', () => { B.close(); Cmd.run('xlProtect'); }));
      const wb = o.wbProt && o.wbProt.on;
      tiles.push(B.tile('lock', wb ? 'Arbeitsmappenschutz aufheben' : 'Arbeitsmappenstruktur schützen', wb ? 'Blätter lassen sich zurzeit nicht einfügen, löschen, umbenennen oder aus-/einblenden' : 'Blätter vor Einfügen, Löschen, Umbenennen und Aus-/Einblenden schützen', () => OfficeXT.protectBook()));
      out.push(B.section('Arbeitsmappe schützen', B.tiles(...tiles)));
    }
    // Prüfen
    out.push(B.section('Arbeitsmappe/Dokument prüfen'.replace('Arbeitsmappe/Dokument', o.fmt === 'xlsx' ? 'Arbeitsmappe' : o.fmt === 'pptx' ? 'Präsentation' : 'Dokument'), B.tiles(
      B.tile('search', 'Dokument prüfen …', 'Notizen, ausgeblendete Inhalte, Kopf-/Fusszeilen, persönliche Angaben finden und entfernen', () => this.inspect()),
      B.tile('alert', 'Kompatibilität prüfen …', 'Was beim Speichern in einem älteren oder anderen Format verloren geht', () => this.compat()))));
    return out;
  },
  stats(p) {
    const o = p.office;
    if (o.fmt === 'docx' && typeof OfficeWord !== 'undefined') { try { const c = OfficeWord.counts(p); return `${o.pages || 1} Seite(n) · ${c.words} Wörter · ${c.chars} Zeichen`; } catch (e) { return ''; } }
    if (o.fmt === 'xlsx') { const sh = OfficeView.sheets(p); const n = sh.reduce((s, b) => s + Object.values(b.sheet.cells).filter(c => c.v !== '' && c.v != null).length, 0); return `${sh.length} Blatt/Blätter · ${n} gefüllte Zellen`; }
    if (o.fmt === 'pptx') { const fr = OfficePpt.frames(p); return `${fr.length} Folie(n)${fr.some(f => f.ox.hide) ? ` · ${fr.filter(f => f.ox.hide).length} ausgeblendet` : ''}`; }
    return '';
  },
  /* Dokumentprüfung: was gibt es, und mit einem Klick entfernen bzw. einblenden */
  findings(p) {
    const o = p.office, out = [];
    const props = o.props || {};
    const pk = Object.keys(props).filter(k => !k.startsWith('_') && props[k]);
    out.push({ k: 'props', label: 'Dokumenteigenschaften und persönliche Angaben', n: pk.length, info: pk.length ? pk.map(k => (this.PROPS.find(x => x[0] === k) || [k, '', k])[2]).join(', ') : 'Keine gefunden', act: 'Alle entfernen' });
    if (o.fmt === 'xlsx') {
      const sh = OfficeView.sheets(p);
      const notes = sh.reduce((s, b) => s + Object.keys(b.sheet.notes || {}).length, 0);
      out.push({ k: 'xlNotes', label: 'Notizen (Kommentare)', n: notes, info: notes ? `${notes} Notiz(en)` : 'Keine gefunden', act: 'Alle entfernen' });
      const hs = sh.filter(b => b.ox.hid);
      out.push({ k: 'xlHidSheets', label: 'Ausgeblendete Blätter', n: hs.length, info: hs.length ? hs.map(b => b.sheet.name).join(', ') : 'Keine gefunden', act: 'Alle einblenden' });
      const hrc = sh.reduce((s, b) => s + (b.sheet.hideR || []).length + (b.sheet.hideC || []).length, 0);
      out.push({ k: 'xlHidRC', label: 'Ausgeblendete Zeilen und Spalten', n: hrc, info: hrc ? `${hrc} ausgeblendet (ohne Filter)` : 'Keine gefunden', act: 'Alle einblenden' });
      const hf = sh.filter(b => b.sheet.ps && b.sheet.ps.hf);
      out.push({ k: 'xlHF', label: 'Kopf- und Fusszeilen', n: hf.length, info: hf.length ? hf.map(b => b.sheet.name).join(', ') : 'Keine gefunden', act: 'Alle entfernen' });
    }
    if (o.fmt === 'docx') {
      const hf = o.hf && (o.hf.h.t.trim() || o.hf.f.t.trim());
      out.push({ k: 'wHF', label: 'Kopf- und Fusszeilen', n: hf ? 1 : 0, info: hf ? [o.hf.h.t, o.hf.f.t].filter(Boolean).join(' · ').slice(0, 80) : 'Keine gefunden', act: 'Entfernen' });
      out.push({ k: 'wWm', label: 'Wasserzeichen', n: o.wm ? 1 : 0, info: o.wm || 'Keines gefunden', act: 'Entfernen' });
    }
    if (o.fmt === 'pptx') {
      const nb = p.boxes.filter(b => b.ox && b.ox.k === 'notiz' && OfficeWord.textOf(b.html).trim());
      out.push({ k: 'pNotes', label: 'Referentennotizen', n: nb.length, info: nb.length ? `${nb.length} Folie(n) mit Notizen` : 'Keine gefunden', act: 'Alle entfernen' });
      const hid = OfficePpt.frames(p).filter(f => f.ox.hide);
      out.push({ k: 'pHidden', label: 'Ausgeblendete Folien', n: hid.length, info: hid.length ? hid.map(f => 'Folie ' + f.ox.n).join(', ') : 'Keine gefunden', act: 'Alle einblenden' });
      const pf = p.boxes.filter(b => b.pf);
      out.push({ k: 'pHF', label: 'Kopf- und Fusszeilen (Datum, Nummer, Fusszeile)', n: pf.length, info: pf.length ? `${pf.length} Feld(er)` : 'Keine gefunden', act: 'Alle entfernen' });
    }
    return out;
  },
  fix(p, k) {
    const o = p.office;
    if (k === 'props') o.props = Object.fromEntries(Object.entries(o.props || {}).filter(([x]) => x.startsWith('_')));
    else if (k === 'xlNotes') for (const b of OfficeView.sheets(p)) delete b.sheet.notes;
    else if (k === 'xlHidSheets') for (const b of OfficeView.sheets(p)) delete b.ox.hid;
    else if (k === 'xlHidRC') for (const b of OfficeView.sheets(p)) { delete b.sheet.hideR; delete b.sheet.hideC; }
    else if (k === 'xlHF') for (const b of OfficeView.sheets(p)) if (b.sheet.ps) delete b.sheet.ps.hf;
    else if (k === 'wHF') o.hf = { h: { t: '', al: 'c' }, f: { t: '', al: 'c' } };
    else if (k === 'wWm') { o.wm = null; o.wmImg = null; }
    else if (k === 'pNotes') for (const b of p.boxes.filter(b => b.ox && b.ox.k === 'notiz')) b.html = '';
    else if (k === 'pHidden') for (const f of OfficePpt.frames(p)) delete f.ox.hide;
    else if (k === 'pHF') p.boxes = p.boxes.filter(b => !b.pf);
    if (typeof Sheet !== 'undefined') { Sheet._full = true; Sheet.bump(); }
    Canvas.render(true); Hist.touchPage(p.id); Hist.commit('Dokument geprüft'); OfficeView.sync(true);
  },
  async inspect() {
    const p = OfficePages.page(); if (!p) return;
    await UI.dialog((dlg, close) => {
      dlg.classList.add('kt-saveas');
      dlg.append(el('h2', { text: 'Dokument prüfen' }), el('p', { class: 'bs-note', text: 'Vor dem Weitergeben: versteckte oder persönliche Inhalte finden. „Entfernen“ lässt sich mit Strg+Z rückgängig machen.' }));
      const list = el('div', { class: 'ui-insp' });
      const draw = () => {
        list.innerHTML = '';
        for (const f of this.findings(p)) {
          const b = el('button', { class: 'btn small', type: 'button', text: f.act, disabled: !f.n || Store.readOnly });
          b.addEventListener('click', () => { this.fix(p, f.k); draw(); });
          list.append(el('div', { class: 'ui-irow' + (f.n ? ' hit' : '') }, el('span', { class: 'ui-iic', html: icon(f.n ? 'alert' : 'check', 16) }), el('div', {}, el('b', { text: f.label }), el('small', { text: f.info })), b));
        }
      };
      draw();
      dlg.append(list, el('div', { class: 'dlg-btns' }, el('button', { class: 'btn primary', type: 'button', text: 'Schliessen', onclick: () => close(true) })));
    }, { wide: true });
    if (Backstage.isOpen()) Backstage.show('info');
  },
  /* Kompatibilität: was bleibt beim Speichern in einem anderen Format */
  compatRows(p, type) {
    const o = p.office, rows = [];
    const R = (label, used, kept) => { if (used) rows.push([label, kept]); };   // kept: true | false | 'teils'
    if (o.fmt === 'xlsx') {
      const sh = OfficeView.sheets(p), any = (f) => sh.some(b => f(b.sheet, b));
      const formulas = any(d => Object.values(d.cells).some(c => XL.isFormula(c.v)));
      R('Mehrere Blätter', sh.length > 1, /^(csv|csvu|txt)$/.test(type) ? false : true);
      R('Formeln', formulas, type === 'xls' ? 'teils' : type === 'ods' ? true : type === 'html' ? 'teils' : false);
      R('Zellformate (Schrift, Farben, Rahmen, Zahlenformat)', any(d => Object.values(d.cells).some(c => c.f)), /^(xls|ods|html)$/.test(type) ? true : false);
      R('Verbundene Zellen', any(d => (d.merges || []).length), /^(xls|ods|html)$/.test(type));
      R('Bedingte Formatierung', any(d => (d.cf || []).length), false);
      R('Datenüberprüfung (Auswahllisten)', any(d => (d.dv || []).length), false);
      R('Filter', any(d => !!d.af), false);
      R('Notizen', any(d => d.notes && Object.keys(d.notes).length), false);
      R('Blattschutz / Arbeitsmappenschutz', any(d => d.prot && d.prot.on) || (o.wbProt && o.wbProt.on), false);
      R('Seite einrichten, Druckbereich, Kopf-/Fusszeile', any(d => !!d.ps), false);
      R('Fixierte Zeilen/Spalten', any(d => !!d.freeze), /^(xls|ods)$/.test(type));
      R('Diagramme und Grafiken aus Excel', p.boxes.some(b => b.ox && b.ox.k === 'label'), false);
    } else if (o.fmt === 'docx') {
      R('Überschriften, Listen, Tabellen', true, type === 'txt' ? 'teils' : true);
      R('Schrift, Farben, fett/kursiv', true, /^(txt|md)$/.test(type) ? false : true);
      R('Bilder', p.boxes.some(b => b.ox && b.ox.k === 'wimg'), false);
      R('Kopf- und Fusszeile, Seitenzahlen', !!(o.hf && (o.hf.h.t || o.hf.f.t)), false);
      R('Wasserzeichen', !!o.wm, false);
      R('Seitenfarbe, Seitenränder', !!o.pageColor || !!o.pgBorder, false);
      R('Inhaltssteuerelemente, Felder, Verzeichnisse', p.boxes.some(b => b.ox && b.ox.k === 'wlock'), 'teils');
    } else if (o.fmt === 'pptx') {
      const fr = OfficePpt.frames(p);
      R('Folien mit Texten', true, true);
      R('Bilder', p.boxes.some(b => b.ox && b.ox.k === 'pic'), type === 'odp' || type === 'html');
      R('Hintergrundfarben', fr.some(f => f.ox.bg), type === 'odp' || type === 'html');
      R('Übergänge', fr.some(f => f.ox.tr && f.ox.tr.type !== 'none'), false);
      R('Animationen', p.boxes.some(b => b.anim), false);
      R('Referentennotizen', p.boxes.some(b => b.ox && b.ox.k === 'notiz' && OfficeWord.textOf(b.html).trim()), false);
      R('Ausgeblendete Folien', fr.some(f => f.ox.hide), type === 'odp' ? true : 'teils');
      R('Formen, Diagramme, SmartArt', true, 'teils');
    }
    return rows;
  },
  async compat() {
    const p = OfficePages.page(); if (!p) return;
    const fmt = p.office.fmt;
    const types = OfficeSaveAs.TYPES[fmt].filter(t => !OfficeSaveAs.MAIN[t[0]] && t[0] !== 'pdf');
    await UI.dialog((dlg, close) => {
      dlg.classList.add('kt-saveas');
      dlg.append(el('h2', { text: 'Kompatibilität prüfen' }));
      const sel = el('select', { class: 'sa-type' }, ...types.map(([k, l]) => el('option', { value: k, text: l })));
      const tbl = el('div', { class: 'ui-insp' });
      const draw = () => {
        tbl.innerHTML = '';
        const rows = this.compatRows(p, sel.value);
        for (const [label, kept] of rows) tbl.append(el('div', { class: 'ui-irow' + (kept === true ? '' : ' hit') }, el('span', { class: 'ui-iic', html: icon(kept === true ? 'check' : kept === 'teils' ? 'alert' : 'x', 16) }), el('div', {}, el('b', { text: label }), el('small', { text: kept === true ? 'bleibt erhalten' : kept === 'teils' ? 'teilweise (vereinfacht)' : 'geht verloren' }))));
        if (!rows.length) tbl.append(el('p', { class: 'bs-note', text: 'Nichts gefunden.' }));
      };
      sel.addEventListener('change', draw); draw();
      dlg.append(el('label', { class: 'sa-row' }, el('span', { text: 'Speichern als' }), sel), tbl,
        el('p', { class: 'bs-note', text: 'Die Office-Formate (.docx/.xlsx/.pptx und ihre Varianten) behalten alles.' }),
        el('div', { class: 'dlg-btns' }, el('button', { class: 'btn primary', type: 'button', text: 'Schliessen', onclick: () => close(true) })));
    }, { wide: true });
  },
};
if (typeof module !== 'undefined') module.exports = { OfficeUI };
