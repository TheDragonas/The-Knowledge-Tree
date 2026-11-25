'use strict';
/* Office-Seiten (seit 1.60) – Word-, Excel- und PowerPoint-Dateien wie in Obsidian als Datei im Notizbuch.
 *
 * Eine Office-Seite hat page.type ('dok' | 'tab' | 'folie') und page.office = { asset, fmt, name, size, at, tpl, … }.
 * Die Datei liegt unverändert (Byte für Byte) als Asset im Notizbuch – sie geht mit jedem Backup, jeder
 * KnowledgeTree-Datei und als Anhang auch nach OneNote mit.
 * Auf der Seite stehen oben die Datei-Karte (📎 = Original), darunter der Inhalt als bearbeitbare KnowledgeTree-Felder
 * (seit 1.61 PowerPoint, 1.63 Word, 1.64 Excel). Jedes Feld kennt seine Herkunft (b.ox = Teil + Form/Absätze/Zellen),
 * beim Export als Office-Datei wird NUR Geändertes ins Original zurückgeschrieben (office-ppt/-doc/-xl.js), alles
 * andere bleibt Byte für Byte – unverändert = die Originaldatei. Was KnowledgeTree nicht darstellen kann (Diagramme,
 * SmartArt, Formen-Geometrie, Felder …), bleibt unangetastet in der Datei; gesperrte Platzhalter zeigen es an.
 * Felder ohne Herkunft ausserhalb der Folien bzw. neben dem Dokument sind eigene Notizen und gehen nicht in die Datei.
 * Neue Office-Seiten (Seitentyp beim Erstellen) entstehen aus einem leeren, gültigen Paket (Ooxml.blank). */
const OfficePages = {
  TYPE: { docx: 'dok', xlsx: 'tab', pptx: 'folie' },
  LABEL: { docx: 'Word-Dokument', xlsx: 'Excel-Arbeitsmappe', pptx: 'PowerPoint-Präsentation' },
  ICON: { docx: '📄', xlsx: '📊', pptx: '📽' },
  NEW: { docx: 'Dokument', xlsx: 'Tabelle', pptx: 'Präsentation' },
  isOffice(name) { return !!Ooxml.kindOfName(name) || (typeof OfficeConvert !== 'undefined' && !!OfficeConvert.kindOf(name)); },
  /* Endungen für Dateiauswahl (1.71): alle Formate, die eine Office-Seite werden können */
  ACCEPT: '.xlsx,.xlsm,.xltx,.xltm,.xls,.xlt,.ods,.ots,.csv,.tsv,.tab,.docx,.docm,.dotx,.dotm,.doc,.dot,.rtf,.odt,.ott,.txt,.md,.pptx,.pptm,.ppsx,.ppsm,.potx,.potm,.ppt,.pps,.pot,.odp,.otp',
  mod(fmt) { return fmt === 'pptx' ? OfficePpt : fmt === 'docx' ? OfficeDoc : fmt === 'xlsx' ? OfficeXl : null; },
  /* Office-Seite, die gerade offen ist (oder null) */
  page(fmt) { const p = Canvas.page; return p && p.office && p.office.asset && (!fmt || p.office.fmt === fmt) ? p : null; },

  /* ---------------------------------------------------------------- Import: Datei → neue Office-Seite */
  async importFiles(files, opts = {}) {
    const made = [];
    for (const f of files) {
      try { made.push(await this.importOne(f, opts)); }
      catch (e) { console.error(e); UI.toast(`${f.name}: ${e.message}`, 5000); }
    }
    if (made.length && !opts.quiet) UI.toast(made.length === 1 ? `${made[0].title}: Office-Seite – die Datei bleibt unverändert im Notizbuch` : `${made.length} Office-Dateien als Seiten importiert`, 3500);
    return made;
  },
  async importOne(file, opts = {}) {
    if (Store.readOnly) throw new Error('Nur lesen');
    // andere Formate (CSV, Excel/Word/PowerPoint 97–2003, OpenDocument, RTF, Text …): erst ins neueste Format umwandeln,
    // das Original bleibt zusätzlich im Notizbuch (1.71)
    let src = null, cnotes = [];
    if (!Ooxml.kindOfName(file.name) && typeof OfficeConvert !== 'undefined' && OfficeConvert.kindOf(file.name)) {
      const ext0 = OfficeConvert.ext(file.name);
      const r = await OfficeConvert.convert(file);
      src = { asset: await Backend.saveFile(new Blob([file], { type: file.type || 'application/octet-stream' }), ext0), name: file.name, from: ext0, size: file.size };
      cnotes = r.notes;
      file = r.file;
    }
    const pkg = await Ooxml.open(file);
    const fmt = pkg.kind || Ooxml.kindOfName(file.name);
    if (!fmt) throw new Error('Keine Word-, Excel- oder PowerPoint-Datei');
    const ext = (file.name.split('.').pop() || fmt).toLowerCase();
    const asset = await Backend.saveFile(new Blob([file], { type: file.type || Ooxml.MIME[fmt] }), ext);
    // Seite anlegen (wie Ops.newPage, aber mit Titel und ohne Titel-Fokus)
    Hist.flushPending();
    let s = (opts.section && Tree.group(opts.section)) || Ops.currentSection();
    if (!Tree.isSection(s)) s = Tree.firstSection(Ops.currentContainer());
    if (!s) {
      const nb = Store.groups.find(g => g.kind === 'notebook' && !g.closed) || Ops.makeNode('notebook', 'Mein Notizbuch', null);
      s = Ops.makeNode('section', 'Neuer Abschnitt', nb);
    }
    const p = newPage(opts.title || file.name.replace(/\.[^.]+$/, ''));
    p.type = this.TYPE[fmt];
    p.bg = 'keiner';   // wie im Programm: Papier / Folien auf ruhigem Grund (1.65)
    p.office = { asset, fmt, name: file.name, size: file.size, at: Date.now(), tpl: Ooxml.isTemplate(file.name), v: 2 };
    if (src) p.office.src = src;
    Store.pages[p.id] = p;
    // nach der aktuellen Seite samt ihren Unterseiten (wie „Neue Seite“)
    if (opts.after && s.pages.includes(opts.after)) { const blk = Tree.block(s, opts.after); s.pages.splice(s.pages.indexOf(blk[blk.length - 1]) + 1, 0, p.id); }
    else s.pages.push(p.id);
    Tree.normLevels(s);
    Hist.touchPage(p.id); Hist.touchTree();
    App.openPage(p.id);
    await this.build(pkg, p, opts);
    Hist.touchPage(p.id);
    Hist.commit(opts.fresh ? 'Office-Seite erstellt' : 'Office-Datei importiert');
    if (typeof Ribbon !== 'undefined') Ribbon.refresh();
    if (src) UI.toast(`${src.name}: umgewandelt in ${this.LABEL[fmt]} (.${fmt})${cnotes.length ? ' – ' + cnotes.join(' ') : ''} · das Original bleibt im Notizbuch`, cnotes.length ? 8000 : 4500);
    return p;
  },
  /* „Office-Datei öffnen …“ (1.71): alle Formate, auch CSV, Excel/Word/PowerPoint 97–2003, OpenDocument, RTF */
  async openPicker() {
    const files = await new Promise((res) => { const inp = el('input', { type: 'file', multiple: true, accept: this.ACCEPT, style: { display: 'none' } }); inp.addEventListener('change', () => { res([...inp.files]); inp.remove(); }); document.body.append(inp); inp.click(); });
    if (files.length) await this.importFiles(files);
  },
  /* Anhang (📎) auf einer Seite als eigene Office-Seite öffnen */
  async fromAttachment(src, name) {
    const blob = await this.assetBlob(src);
    if (!blob) { UI.toast('Anhang nicht gefunden'); return null; }
    return this.importOne(new File([blob], name || src, { type: blob.type }));
  },
  /* neue Seite eines Typs (Seitentyp beim Erstellen): leeres, gültiges Paket als Datei */
  async newTyped(fmt, opts = {}) {
    if (!this.TYPE[fmt]) { Ops.newPage(opts.section); return null; }
    if (Store.readOnly) return null;
    const title = this.NEW[fmt];
    const u8 = await Ooxml.blank(fmt);
    const p = await this.importOne(new File([u8], title + '.' + fmt, { type: Ooxml.MIME[fmt] }), { fresh: true, title, after: opts.section ? null : Canvas.pageId, section: opts.section });
    if (p) setTimeout(() => App.focusTitle(), 30);
    return p;
  },

  /* Menüeinträge „Neue Seite als Word / Excel / PowerPoint“ */
  typeItems(make) {
    return [{ label: 'Word', icon: 'officeDoc', action: () => make('docx') }, { label: 'Excel', icon: 'table', action: () => make('xlsx') }, { label: 'PowerPoint', icon: 'slides', action: () => make('pptx') }];
  },
  /* Knopf „Neue Seite“: Klick = leere Seite, länger darüber halten oder Rechtsklick = Word / Excel / PowerPoint */
  attachTypeMenu(btn, make) {
    let t = null;
    const open = () => UI.menu([{ head: 'Neue Seite als …' }, ...this.typeItems(make), '-', { label: 'Leere Seite', icon: 'pagePlus', action: () => make('frei') }], 0, 0, { anchor: btn });
    btn.addEventListener('pointerenter', (e) => { if (e.pointerType === 'touch') return; clearTimeout(t); t = setTimeout(() => { if (btn.matches(':hover')) open(); }, 450); });
    btn.addEventListener('pointerleave', () => clearTimeout(t));
    btn.addEventListener('click', () => clearTimeout(t));
    btn.addEventListener('contextmenu', (e) => { e.preventDefault(); e.stopPropagation(); clearTimeout(t); open(); });
  },

  /* ---------------------------------------------------------------- Seite aufbauen */
  async build(pkg, p, opts = {}) {
    const o = p.office;
    // die Seite ist die Datei: oben nur eine schmale Zeile mit dem Original (📎, geht so auch nach OneNote/HTML)
    const card = this.addBox(40, 14, 560, this.cardHtml(o), { office: 'karte', ox: null, raw: true, style: { bg: 'transparent' } });
    Canvas.render();
    const y = this.bottom(card) + (o.fmt === 'pptx' ? 26 : 14);
    await this.mod(o.fmt).read(pkg, p, y, opts);
    if (typeof OfficeUI !== 'undefined') await OfficeUI.readProps(pkg, p);   // Eigenschaften, Design (1.73)
    if (typeof Sheet !== 'undefined') Sheet.deactivate();
    Canvas.select([]);
    Canvas.render();
    // Ansicht wie im Programm: Word = Seitenbreite, PowerPoint = erste Folie, Excel = Zelle A1
    requestAnimationFrame(() => {
      if (Canvas.page !== p) return;
      if (o.fmt === 'pptx') { const f = OfficePpt.frames(p)[0]; if (f) OfficePpt.focusSlide(f.id); }
      else if (o.fmt === 'docx') { OfficeDoc.zoom('width'); if (Canvas.view.z > 1.25) { Canvas.view.z = 1.25; OfficeDoc.zoom('width-keep'); } }
      else if (o.fmt === 'xlsx') { Canvas.view = { x: 0, y: 0, z: 1 }; Canvas.applyView(); const id = OfficeView.curSheet(p); if (id && !Store.readOnly) Sheet.activate(id, 0, 0); }
      OfficeView.sync(true);
    });
  },
  cardHtml(o) {
    const kb = (o.size / 1024 > 1024 ? (o.size / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(o.size / 1024)) + ' KB');
    const orig = o.src ? ` · umgewandelt aus <a class="kt-file" contenteditable="false" data-kt-file="${escapeHtml(o.src.asset)}" data-name="${escapeHtml(o.src.name)}">📎 ${escapeHtml(o.src.name)}</a>` : '';
    return `<div style="font-size:12px;color:#8a8a8a">${this.ICON[o.fmt]} ${escapeHtml(this.LABEL[o.fmt])}${o.tpl ? ' (Vorlage)' : ''} · ${o.src ? 'Datei' : 'Original'}: <a class="kt-file" contenteditable="false" data-kt-file="${escapeHtml(o.asset)}" data-name="${escapeHtml(o.name)}">📎 ${escapeHtml(o.name)}</a> · ${kb}${orig}</div>`;
  },
  bottom(b) { Canvas.render(); const r = Canvas.rects.get(b.id); return b.y + (r ? r.h : 60); },
  /* Feld direkt anlegen (ohne Verlaufseintrag je Feld – der Import ist ein Schritt) */
  addBox(x, y, w, html, extra = {}) {
    const b = { id: uid('b'), x: Math.round(x), y: Math.round(y), w: Math.max(60, Math.round(w)), html: html ? (extra.raw ? html : sanitizeHtml(html)) : '', images: [], z: Canvas.maxZ() + 1, style: {}, locked: true, pkg: null, office: 'vorschau' };
    Object.assign(b, extra);
    delete b.raw;
    Canvas.page.boxes.push(b);
    return b;
  },
  /* Bild aus dem Paket als KnowledgeTree-Bild (verlustfrei verkleinert) */
  async media(pkg, path) {
    try {
      const u8 = await pkg.bytes(path);
      const ext = path.split('.').pop().toLowerCase();
      const type = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', bmp: 'image/bmp', webp: 'image/webp', svg: 'image/svg+xml' }[ext];
      if (!type) return null;   // EMF/WMF/TIFF: Browser zeigt es nicht – Platzhalter
      let blob = new Blob([u8], { type });
      if (typeof ImgPack !== 'undefined') blob = await ImgPack.lossless(blob);
      const name = await Backend.saveImage(blob);
      const dim = await loadImageSize(await Backend.imgURL(name));
      return { name, w: dim.w, h: dim.h };
    } catch (e) { return null; }
  },
  /* einfarbiges Bild (Folienhintergrund) */
  async solid(color) {
    const c = document.createElement('canvas'); c.width = 16; c.height = 9;
    const g = c.getContext('2d'); g.fillStyle = color; g.fillRect(0, 0, 16, 9);
    const blob = await new Promise(r => c.toBlob(r, 'image/png'));
    return Backend.saveImage(blob);
  },
  /* KnowledgeTree-Bild für Office: PNG/JPEG/GIF bleiben, alles andere (WebP, BMP, SVG) verlustfrei als PNG */
  async imageForOffice(name) {
    let blob = await this.assetBlob(name);
    if (!blob) return null;
    let ext = (name.split('.').pop() || '').toLowerCase();
    if (!/^(png|jpe?g|gif)$/.test(ext)) {
      const bm = await createImageBitmap(blob);
      const c = document.createElement('canvas'); c.width = bm.width; c.height = bm.height;
      c.getContext('2d').drawImage(bm, 0, 0);
      blob = await new Promise(r => c.toBlob(r, 'image/png'));
      ext = 'png';
    }
    return { u8: new Uint8Array(await blob.arrayBuffer()), ext: ext === 'jpg' ? 'jpeg' : ext, type: ext === 'png' ? 'image/png' : ext === 'gif' ? 'image/gif' : 'image/jpeg' };
  },

  /* ---------------------------------------------------------------- XML-Helfer */
  q(el, ns, tag) { return el ? [...el.getElementsByTagNameNS(ns, tag)] : []; },
  kids(el, ns, tag) { return el ? [...el.childNodes].filter(n => n.nodeType === 1 && n.namespaceURI === ns && (!tag || n.localName === tag)) : []; },
  kid(el, ns, tag) { return this.kids(el, ns, tag)[0] || null; },
  at(el, ns, name) { return el ? (el.getAttributeNS(ns, name) || el.getAttribute((ns === Ooxml.NS.r ? 'r:' : ns === Ooxml.NS.w ? 'w:' : '') + name) || '') : ''; },
  /* Element im Namensraum mit dem Präfix, das das Dokument dafür verwendet */
  mk(doc, ns, tag, attrs = {}) {
    const pre = doc.documentElement.lookupPrefix(ns) || { [Ooxml.NS.a]: 'a', [Ooxml.NS.p]: 'p', [Ooxml.NS.w]: 'w', [Ooxml.NS.r]: 'r' }[ns] || '';
    const e = doc.createElementNS(ns, pre ? pre + ':' + tag : tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null) continue;
      const m = /^(\w+):(.+)$/.exec(k);
      if (m) { const nsx = m[1] === 'r' ? Ooxml.NS.r : m[1] === 'w' ? Ooxml.NS.w : null; if (nsx) e.setAttributeNS(nsx, (doc.documentElement.lookupPrefix(nsx) || m[1]) + ':' + m[2], v); else e.setAttribute(k, v); }
      else e.setAttribute(k, v);
    }
    return e;
  },
  xml(doc, ns, s) {
    // XML-Schnipsel mit den Namensräumen des Dokuments einlesen
    const decl = Object.entries(Ooxml.NS).map(([k, v]) => `xmlns:${doc.documentElement.lookupPrefix(v) || k}="${v}"`).filter((x, i, a) => a.indexOf(x) === i).join(' ');
    const def = ns && !doc.documentElement.lookupPrefix(ns) && doc.documentElement.namespaceURI === ns ? ` xmlns="${ns}"` : '';   // Standard-Namensraum (Excel)
    const d = new DOMParser().parseFromString(`<x${def} ${decl}>${s}</x>`, 'application/xml');
    if (d.getElementsByTagName('parsererror').length) throw new Error('XML-Baustein fehlerhaft');
    return [...d.documentElement.childNodes].filter(n => n.nodeType === 1).map(n => doc.importNode(n, true));
  },

  /* ---------------------------------------------------------------- Datei mit Änderungen */
  /* gespeicherte Datei als Blob – Browser direkt aus dem Speicher, Windows-Programm über den eigenen Server */
  async assetBlob(name) {
    if (Backend.imgBlob) return Backend.imgBlob(name);
    const u = await Backend.imgURL(name);
    if (!u) return null;
    const r = await fetch(u);
    return r.ok ? r.blob() : null;
  },
  /* aktuelle Fassung: Original + Änderungen der Seite (nichts geändert → Original, Byte für Byte) */
  async current(p) {
    const orig = await this.assetBlob(p.office.asset);
    if (!orig) throw new Error('Office-Datei fehlt im Notizbuch');
    const m = this.mod(p.office.fmt);
    if (!m || !p.office.v) return { blob: orig, changed: false };   // vor 1.61 importiert: nur Vorschau
    const pkg = await Ooxml.open(orig);
    const info = await m.write(pkg, p) || {};
    if (typeof OfficeUI !== 'undefined') { await OfficeUI.writeProps(pkg, p); await OfficeUI.writeTheme(pkg, p); }   // Eigenschaften, Design (1.73)
    const blob = await pkg.save();
    return { blob: new Blob([blob], { type: Ooxml.MIME[p.office.fmt] }), changed: pkg.dirty, info };
  },
  async fileOf(pid, original = false) {
    const p = Store.pages[pid];
    if (!p || !p.office || !p.office.asset) return null;
    let blob;
    if (original && p.office.src) { const b0 = await this.assetBlob(p.office.src.asset); return b0 ? { name: p.office.src.name, blob: b0 } : null; }   // umgewandelt (1.71): die Datei, wie sie importiert wurde
    if (original) blob = await this.assetBlob(p.office.asset);
    else blob = (await this.current(p)).blob;
    if (!blob) return null;
    // Dateiname = Seitentitel (umbenannte Seite → umbenannte Datei), Endung wie das Original; Original: alter Name
    const ext = ((p.office.name || '').match(/\.([^.]+)$/) || [0, p.office.fmt])[1];
    const name = original ? (p.office.name || p.title + '.' + ext) : (p.title || 'Office-Datei').replace(/[<>:"/\\|?*\u0000-\u001f]+/g, '_').trim() + '.' + ext;
    return { name, blob: new Blob([blob], { type: Ooxml.MIME[p.office.fmt] || blob.type }) };
  },
  async exportPages(pids, zipName, original = false, types = null) {
    const files = [];
    const skipped = [];
    const back = Canvas.pageId;
    for (const pid of pids) {
      // 1.72: Dateityp je Programm (Export-Fenster) – sonst wie bisher die Datei bzw. das Original
      const fmt = Store.pages[pid] && Store.pages[pid].office && Store.pages[pid].office.fmt;
      try { const f = types && fmt && typeof OfficeIO !== 'undefined' ? await OfficeIO.fileAs(pid, types[fmt]) : await this.fileOf(pid, original); if (f) files.push(f); else skipped.push(Store.pages[pid] ? Store.pages[pid].title : pid); }
      catch (e) { console.error(e); UI.toast(`${(Store.pages[pid] || {}).title || ''}: ${e.message}`, 5000); }
    }
    if (!files.length) { UI.info('Office-Export', '<p>Unter den gewählten Seiten ist keine Office-Seite. Office-Seiten entstehen mit <b>Neue Seite ▾ → Dokument / Tabelle / Präsentation</b>, beim Importieren einer Word-, Excel- oder PowerPoint-Datei (Datei → Importieren) oder aus einem 📎-Anhang (Rechtsklick → „Als Office-Seite öffnen“). Andere Seiten als KnowledgeTree-Seite: Format „KnowledgeTree-Datei“.</p>'); return 0; }
    if (files.length === 1) Export.download(Export.safe(files[0].name.replace(/\.[^.]+$/, '')) + files[0].name.slice(files[0].name.lastIndexOf('.')), files[0].blob);
    else {
      const zw = KtFile.zipWriter();
      const used = new Set();
      for (const f of files) { let n = f.name, k = 2; while (used.has(n)) n = f.name.replace(/(\.[^.]+)$/, ` (${k++})$1`); used.add(n); await zw.add(n, f.blob); }
      Export.download(Export.safe(zipName || 'Office-Dateien') + '.zip', zw.finish('application/zip'));
    }
    if (back && Canvas.pageId !== back) App.openPage(back);
    if (skipped.length) UI.toast(`${skipped.length} Seite(n) ohne Office-Datei übersprungen`, 3500);
    return files.length;
  },
  /* Inhalt der Seite aus der Datei neu aufbauen (eigene Notizen bleiben): Seiten aus 1.60 (nur Vorschau) werden
     bearbeitbar; sonst wird die aktuelle Fassung (Original + Änderungen) zur neuen Datei der Seite */
  async rebuild() {
    const p = this.page();
    if (!p || Store.readOnly) return;
    if (Canvas.editing) Canvas.stopEditing();
    if (typeof Sheet !== 'undefined' && Sheet.active) Sheet.deactivate();   // Excel: die Blätter werden neu angelegt (1.73)
    await Save.flushAll();
    const cur = p.office.v ? await this.current(p) : { blob: await this.assetBlob(p.office.asset), changed: false };
    if (!cur.blob) throw new Error('Office-Datei fehlt im Notizbuch');
    if (cur.changed) {
      const ext = (p.office.name.split('.').pop() || p.office.fmt).toLowerCase();
      p.office.asset = await Backend.saveFile(new Blob([cur.blob], { type: Ooxml.MIME[p.office.fmt] }), ext);
      p.office.size = cur.blob.size;
      p.office.at = Date.now();
    }
    const pkg = await Ooxml.open(cur.blob);
    // neue Felder auf Folien sind jetzt Teil der Datei → nicht doppelt behalten
    const onSlide = p.office.fmt === 'pptx' && p.office.v ? new Set(p.boxes.filter(b => !b.ox && !b.office && !b.bg && OfficePpt.frameOf(b, p)).map(b => b.id)) : new Set();
    p.boxes = p.boxes.filter(b => !(b.ox || b.office || onSlide.has(b.id)));
    p.drawings = p.drawings.filter(d => !d.office);
    for (const k of ['slides', 'map', 'n', 'sheets', 'cx', 'cy', 'scale', 'pg', 'pg0', 'paperY', 'white', 'pages', 'cur', 'y0', 'curSlide', 'pgBorder', 'pgBorder0', 'lay', 'hf', 'hf0', 'hfp', 'wm', 'wm0', 'wmImg', 'hyph', 'hyph0', 'titlePg', 'loop', 'loop0', 'wbProt', 'wbProt0', 'props', 'props0', 'theme', 'themeName']) delete p.office[k];   // 1.72/1.73: kommt neu aus der Datei
    if (cur.changed) { p.office.spacing0 = p.office.spacing; p.office.font0 = p.office.font; }   // Entwurf steht jetzt in der Datei
    p.office.v = 2;
    Canvas.render();
    await this.build(pkg, p);
    Hist.touchPage(p.id);
    Hist.commit('Office-Seite neu eingelesen');
    Ribbon.refresh();
    UI.toast(cur.changed ? 'Neu eingelesen – deine Änderungen sind jetzt in der Datei der Seite' : 'Neu eingelesen', 3500);
  },
  /* Register-Knöpfe: aktuelle Fassung bzw. Original der offenen Seite speichern */
  async saveCurrent(original = false) {
    const p = this.page();
    if (!p) return;
    await Save.flushAll();
    await this.exportPages([p.id], p.title, original);
  },
};

/* ==================================================================== HTML ↔ Absätze
 * Ein Textfeld (HTML) als Liste von Absätzen mit Läufen – gleich für Import (Vergleich) und Export. Absatz =
 * Block-Element (div/p/h1–h6/li/pre/blockquote) oder lose Inline-Inhalte; Tabellen sind eigene Blöcke. */
const OfficeHtml = {
  BLOCK: new Set(['DIV', 'P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'PRE', 'BLOCKQUOTE', 'LI']),
  blocks(html) {
    const root = document.createElement('template');
    root.innerHTML = html || '';
    const out = [];
    const walk = (node, depth, list) => {
      let loose = [];
      const flushLoose = () => {
        if (!loose.length) return;
        if (loose.some(n => n.nodeType === 1 || n.textContent.trim())) {
          const w = document.createElement('div'); loose.forEach(n => w.append(n.cloneNode(true)));
          out.push(this.block(w, 'p', depth, list, true));
        }
        loose = [];
      };
      for (const c of [...node.childNodes]) {
        if (c.nodeType === 3) { loose.push(c); continue; }
        if (c.nodeType !== 1) continue;
        const t = c.tagName;
        if (t === 'UL' || t === 'OL') { flushLoose(); walk(c, depth + 1, t === 'OL' ? 'ol' : 'ul'); continue; }
        if (t === 'HR') { flushLoose(); out.push({ tag: 'hr', html: '<hr>', runs: [] }); continue; }
        if (t === 'TABLE') { flushLoose(); out.push({ tag: 'table', html: c.outerHTML, rows: [...c.rows].map(r => [...r.cells].map(td => ({ text: td.innerText !== undefined ? td.textContent : '', span: +td.colSpan || 1, runs: this.runs(td) }))) }); continue; }
        if (this.BLOCK.has(t)) {
          // Block mit Unterblöcken (div in div) aufteilen
          if ([...c.children].some(k => this.BLOCK.has(k.tagName) || k.tagName === 'UL' || k.tagName === 'OL' || k.tagName === 'TABLE')) {
            flushLoose();
            if (t === 'LI') { const own = [...c.childNodes].filter(k => !(k.nodeType === 1 && /^(UL|OL)$/.test(k.tagName))); const w = document.createElement('li'); own.forEach(k => w.append(k.cloneNode(true))); out.push(this.block(w, 'li', depth, list)); for (const k of c.children) if (/^(UL|OL)$/.test(k.tagName)) walk(k, depth + 1, k.tagName === 'OL' ? 'ol' : 'ul'); continue; }
            walk(c, depth, list); continue;
          }
          flushLoose();
          out.push(this.block(c, t === 'LI' ? 'li' : /^H\d$/.test(t) ? t.toLowerCase() : 'p', depth, list));
          continue;
        }
        loose.push(c);
      }
      flushLoose();
    };
    walk(root.content, 0, null);
    return out;
  },
  block(el, tag, depth, list, loose = false) {
    const st = el.style || {};
    return { tag, lvl: Math.max(0, depth - 1), list: tag === 'li' ? list : null, align: st.textAlign || '', html: loose ? el.innerHTML : el.outerHTML, runs: this.runs(el), done: el.classList && el.classList.contains('done') };
  },
  /* Läufe eines Blocks: [{ text, b, i, u, s, sup, sub, color, px, font, href } | { br: true } | { tab: true }] */
  runs(el) {
    const out = [];
    const walk = (n, f) => {
      for (const c of n.childNodes) {
        if (c.nodeType === 3) {
          const parts = c.textContent.replace(/ /g, ' ').split(' ');
          parts.forEach((t, i) => { if (i) out.push({ tab: true }); if (t) out.push({ ...f, text: t }); });
          continue;
        }
        if (c.nodeType !== 1) continue;
        const t = c.tagName;
        if (t === 'BR') { out.push({ br: true }); continue; }
        if (t === 'UL' || t === 'OL' || t === 'TABLE') continue;
        const g = { ...f };
        if (t === 'B' || t === 'STRONG') g.b = true;
        if (t === 'I' || t === 'EM') g.i = true;
        if (t === 'U') g.u = true;
        if (t === 'S' || t === 'STRIKE' || t === 'DEL') g.s = true;
        if (t === 'SUP') g.sup = true;
        if (t === 'SUB') g.sub = true;
        if (t === 'A' && c.getAttribute('href')) g.href = c.getAttribute('href');
        if (t === 'FONT' && c.getAttribute('color')) g.color = this.hex(c.getAttribute('color'));
        const s = c.style;
        if (s) {
          if (s.color) g.color = this.hex(s.color);
          if (s.fontSize) { const px = this.px(s.fontSize); if (px) g.px = px; }
          if (s.fontFamily) g.font = s.fontFamily.split(',')[0].replace(/["']/g, '').trim();
          if (/^(bold|[6-9]00)$/.test(s.fontWeight)) g.b = true; else if (/^(normal|[1-4]00)$/.test(s.fontWeight)) g.b = false;
          if (s.fontStyle === 'italic') g.i = true; else if (s.fontStyle === 'normal') g.i = false;
          const td = s.textDecorationLine || s.textDecoration || '';
          if (/underline/.test(td)) g.u = true;
          if (/line-through/.test(td)) g.s = true;
          if (s.verticalAlign === 'super') g.sup = true; else if (s.verticalAlign === 'sub') g.sub = true;
        }
        walk(c, g);
      }
    };
    walk(el, {});
    // gleiche Nachbarn zusammenfassen
    const m = [];
    for (const r of out) {
      const l = m[m.length - 1];
      if (l && r.text != null && l.text != null && ['b', 'i', 'u', 's', 'sup', 'sub', 'color', 'px', 'font', 'href'].every(k => (l[k] || null) === (r[k] || null))) l.text += r.text;
      else m.push(r);
    }
    return m;
  },
  /* Vergleichsschlüssel: gleich bereinigt wie gespeichert, Leerraum/&nbsp; vereinheitlicht */
  key(html) { return sanitizeHtml(html || '').replace(/&nbsp;|\u00a0/g, ' ').replace(/\s+/g, ' ').replace(/ ?(<br>)? ?(<\/(div|li|h\d|p)>)/g, '$2').trim(); },
  text(b) { return b.runs.map(r => r.text || (r.br ? '\n' : r.tab ? '\t' : '')).join(''); },
  px(v) { const m = /^([\d.]+)(px|pt|em|rem)?$/.exec(String(v).trim()); if (!m) return 0; const n = +m[1]; return m[2] === 'pt' ? n * 4 / 3 : m[2] === 'em' || m[2] === 'rem' ? n * 16 : n; },
  hex(c) {
    if (!c) return null;
    const s = String(c).trim();
    if (/^#[0-9a-f]{6}$/i.test(s)) return s.toLowerCase();
    if (/^#[0-9a-f]{3}$/i.test(s)) return ('#' + s[1] + s[1] + s[2] + s[2] + s[3] + s[3]).toLowerCase();
    const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(s);
    if (m) return '#' + [m[1], m[2], m[3]].map(x => (+x).toString(16).padStart(2, '0')).join('');
    if (typeof Contrast !== 'undefined') { const r = Contrast.rgb(s); if (r) return '#' + r.slice(0, 3).map(x => x.toString(16).padStart(2, '0')).join(''); }
    return null;
  },
  /* längste gemeinsame Folge zweier Listen von Zeichenketten → Paare [i, j] */
  lcs(a, b) {
    const n = a.length, m = b.length;
    if (n * m > 4e6) { const out = []; for (let i = 0; i < Math.min(n, m); i++) if (a[i] === b[i]) out.push([i, i]); return out; }
    const L = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
    for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i][j] = a[i] === b[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
    const out = []; let i = 0, j = 0;
    while (i < n && j < m) { if (a[i] === b[j]) { out.push([i, j]); i++; j++; } else if (L[i + 1][j] >= L[i][j + 1]) i++; else j++; }
    return out;
  },
};
if (typeof module !== 'undefined') module.exports = { OfficePages, OfficeHtml };
