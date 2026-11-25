'use strict';
/* Word-Seiten (1.63) – .docx lesen, als Textfelder bearbeiten, Änderungen verlustfrei zurückschreiben.
 *
 * Der Dokumentkörper (w:body) wird in Abschnitte aufgeteilt: aufeinanderfolgende Absätze/Tabellen = ein
 * bearbeitbares Textfeld, Absätze mit Bildern = Bildfeld, alles andere (Inhaltssteuerelemente, Verzeichnisse …) =
 * gesperrter Platzhalter. p.office.map = [{ i0, i1, box }] deckt alle Knoten ab (box null = bleibt wie es ist).
 * Je Textfeld merkt sich b.ox.hs das HTML jedes Original-Knotens. Export: unverändertes Feld → Knoten unberührt;
 * geändertes Feld → längste gemeinsame Folge alter/neuer Absätze: gleiche Absätze bleiben die Original-Knoten
 * (mit allen Feldern, Lesezeichen, Kommentaren …), nur neue/geänderte werden erzeugt (Absatzformat vom Nachbarn).
 * Gelöschtes Feld → seine Knoten fallen weg. Felder ohne Herkunft = eigene Notizen (nicht im Dokument). */
const OfficeDoc = {
  get W() { return Ooxml.NS.w; }, get R() { return Ooxml.NS.r; }, get A() { return Ooxml.NS.a; },
  get X() { return OfficePages; },
  WP: 'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing',
  WIDTH: 680,

  /* Seite einrichten (Twips: oben, unten, links, rechts) – Werte wie Word (de) */
  MARGINS: [['normal', 'Normal', [1417, 1134, 1417, 1417]], ['schmal', 'Schmal', [720, 720, 720, 720]], ['mittel', 'Mittel', [1440, 1440, 1080, 1080]], ['breit', 'Breit', [1440, 1440, 2880, 2880]]],
  PAPERS: [['a4', 'A4', 11906, 16838], ['a5', 'A5', 8391, 11906], ['a3', 'A3', 16838, 23811], ['letter', 'Letter', 12240, 15840], ['legal', 'Legal', 12240, 20160]],
  setPage(kind, arg) {
    const p = OfficePages.page('docx');
    if (!p || Store.readOnly) return;
    const g = OfficeView.pg(p);
    if (kind === 'margins') { const m = this.MARGINS.find(x => x[0] === arg); if (!m) return; [g.t, g.b, g.l, g.r] = m[2]; }
    else if (kind === 'orient') { const quer = arg === 'quer'; if ((g.w > g.h) !== quer) [g.w, g.h] = [g.h, g.w]; }
    else if (kind === 'paper') { const f = this.PAPERS.find(x => x[0] === arg); if (!f) return; const quer = g.w > g.h; g.w = quer ? f[3] : f[2]; g.h = quer ? f[2] : f[3]; }
    else if (kind === 'margin' && arg && { l: 1, r: 1, t: 1, b: 1 }[arg.side]) g[arg.side] = Math.max(0, Math.round(arg.tw));   // Lineal ziehen (1.67)
    Canvas.render(true);
    Hist.touchPage(p.id); Hist.commit('Seite einrichten');
    Ribbon.show(Ribbon.tab);
  },
  /* Schreibmarke in den Dokumenttext (zuletzt bearbeitetes bzw. letztes Textfeld) */
  ensureEdit() {
    const p = OfficePages.page('docx');
    if (!p) return false;
    const cur = Canvas.editing && Canvas.box(Canvas.editing);
    if (cur && cur.ox && cur.ox.k === 'w') return true;
    const ws = p.office.map.map(m => m.box && Canvas.box(m.box)).filter(b => b && b.ox && b.ox.k === 'w');
    const b = ws[ws.length - 1];
    if (!b) { UI.toast('Zuerst in den Text klicken'); return false; }
    Canvas.focusText(b.id, true);
    return true;
  },
  pageBreak() { if (this.ensureEdit()) Cmd.run('insertHr'); },
  /* Entwurf → Seitenfarbe (w:background) */
  async setPageColor(c) {
    const p = OfficePages.page('docx');
    if (!p || Store.readOnly) return;
    p.office.pageColor = c || null;
    p.office.white = await OfficePages.solid(c || '#ffffff');
    for (const b of p.boxes) if (b.style && b.style.under && b.ox && /^(w|wimg|wlock|hf)$/.test(b.ox.k)) b.style.under = c || '#ffffff';
    Canvas.render(true);
    Hist.touchPage(p.id); Hist.commit('Seitenfarbe');
  },
  /* Referenzen → Inhaltsverzeichnis aus den Überschriften (mit Seitenzahl der Ansicht) */
  toc() {
    const p = OfficePages.page('docx');
    if (!p || !this.ensureEdit()) return;
    const P = OfficeView.paper(p), z = Canvas.view.z || 1;
    const rows = [];
    for (const m of p.office.map) {
      const b = m.box && Canvas.box(m.box), e = b && Canvas.els.get(b.id), t = e && e.querySelector('.box-text');
      if (!b || !t || !b.ox || b.ox.k !== 'w') continue;
      const tr = t.getBoundingClientRect();
      for (const h of t.querySelectorAll('h1, h2, h3')) {
        const y = b.y + 13 + (h.getBoundingClientRect().top - tr.top) / z;
        rows.push({ lvl: +h.tagName[1], text: h.textContent.trim(), page: Math.max(1, Math.floor((y - p.office.paperY) / (P.H + OfficeView.GAP)) + 1) });
      }
    }
    if (!rows.length) { UI.toast('Keine Überschriften gefunden – zuerst Text als „Überschrift 1–3“ formatieren'); return; }
    // wie Word: Punkte als Füllzeichen bis zur Seitenzahl am rechten Rand (mit der Schrift des Textes ausgemessen)
    const wb = p.boxes.find(b => b.ox && b.ox.k === 'w'), we = wb && Canvas.els.get(wb.id), wt = we && we.querySelector('.box-text');
    const cs = wt ? getComputedStyle(wt) : null;
    const ctx = document.createElement('canvas').getContext('2d');
    ctx.font = cs ? `${cs.fontSize} ${cs.fontFamily}` : '15px sans-serif';
    const avail = (wt ? wt.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) : (P.W - P.l - P.r)) - 4;
    const dot = ctx.measureText(' .').width || 5, em = ctx.measureText('\u2003').width || 15;
    const line = (r) => {
      const ind = '\u2003'.repeat(r.lvl - 1), num = String(r.page);
      const used = em * (r.lvl - 1) + ctx.measureText(r.text + ' ' + num).width;
      const n = Math.max(2, Math.floor((avail - used) / dot) - 1);
      return `<div>${ind}${escapeHtml(r.text)} ${' .'.repeat(n).trim()} ${num}</div>`;
    };
    const html = '<div><b>Inhalt</b></div>' + rows.filter(r => r.text).map(line).join('') + '<div><br></div>';
    Fmt.apply(() => Fmt.exec('insertHTML', html), 'Inhaltsverzeichnis');
  },
  table() { if (this.ensureEdit()) Cmd.run('insertTable'); },
  wordCount() {
    const p = OfficePages.page('docx');
    if (!p) return;
    let text = '', paras = 0;
    for (const b of p.boxes) if (b.ox && b.ox.k === 'w') { const bl = OfficeHtml.blocks(b.html); paras += bl.filter(x => OfficeHtml.text(x).trim()).length; text += ' ' + bl.map(x => OfficeHtml.text(x)).join(' '); }
    const words = (text.match(/[\p{L}\p{N}][\p{L}\p{N}'’.-]*/gu) || []).length;
    UI.info('Wörter zählen', `<table class="wc"><tr><td>Seiten</td><td>${p.office.pages || 1}</td></tr><tr><td>Wörter</td><td>${words.toLocaleString('de-CH')}</td></tr><tr><td>Zeichen (ohne Leerzeichen)</td><td>${text.replace(/\s/g, '').length.toLocaleString('de-CH')}</td></tr><tr><td>Zeichen (mit Leerzeichen)</td><td>${text.trim().length.toLocaleString('de-CH')}</td></tr><tr><td>Absätze</td><td>${paras}</td></tr></table>`);
  },
  /* Ansicht → Eine Seite / Seitenbreite */
  zoom(kind) {
    const p = OfficePages.page('docx');
    if (!p || p.office.paperY == null) return;
    const P = OfficeView.paper(p), vp = Canvas.vp, c = Canvas.viewCenter();
    const i = Math.max(0, Math.min((p.office.pages || 1) - 1, Math.floor((c.y - p.office.paperY) / (P.H + OfficeView.GAP))));
    // links: Navigationsbereich und senkrechtes Lineal (1.67)
    const L = typeof OfficeWord !== 'undefined' ? OfficeWord.leftW() : 0, narrow = typeof OfficeView !== 'undefined' && OfficeView.narrow();
    const W = vp.clientWidth - L - (narrow ? 12 : 48), H = vp.clientHeight - 32;
    if (typeof OfficeWord !== 'undefined') OfficeWord._fitW = kind === 'width';
    const z = kind === 'width-keep' ? Canvas.view.z : kind === 'page' ? Math.min(W / P.W, H / P.H) : W / P.W;
    Canvas.view.z = Math.max(0.1, Math.min(4, z));
    Canvas.view.x = L + (vp.clientWidth - L - P.W * Canvas.view.z) / 2 - (OfficeView.PX + 11) * Canvas.view.z;
    Canvas.view.y = (kind === 'page' ? (vp.clientHeight - P.H * Canvas.view.z) / 2 + 10 : narrow ? 10 : 34) - (OfficeView.pageTop(p, i) + 13) * Canvas.view.z;
    Canvas.applyView();
  },
  nodes(body) { return [...body.children].filter(n => !(n.namespaceURI === this.W && n.localName === 'sectPr')); },
  isOn(rPr, tag) { const e = rPr && this.X.kid(rPr, this.W, tag); return !!e && !/^(0|false|none)$/.test(this.X.at(e, this.W, 'val')); },
  runsHtml(p, relOf) {
    const X = this.X, W = this.W, R = this.R;
    let s = '';
    const walk = (n) => {
      for (const c of n.children) {
        if (c.namespaceURI === W && c.localName === 'r') {
          const pr = X.kid(c, W, 'rPr');
          let t = '';
          for (const x of c.children) {
            if (x.localName === 't') t += escapeHtml(x.textContent);
            else if (x.localName === 'tab') t += '&emsp;';
            else if (x.localName === 'br' || x.localName === 'cr') t += '<br>';
            else if (x.localName === 'noBreakHyphen') t += '-';
          }
          if (!t) continue;
          const col = pr && X.kid(pr, W, 'color') && X.at(X.kid(pr, W, 'color'), W, 'val');
          if (col && /^[0-9A-Fa-f]{6}$/.test(col) && col !== '000000') t = `<span style="color:#${col.toLowerCase()}">${t}</span>`;
          const va = pr && X.kid(pr, W, 'vertAlign') && X.at(X.kid(pr, W, 'vertAlign'), W, 'val');
          if (va === 'superscript') t = `<sup>${t}</sup>`; else if (va === 'subscript') t = `<sub>${t}</sub>`;
          if (this.isOn(pr, 'strike')) t = `<s>${t}</s>`;
          if (pr && X.kid(pr, W, 'u') && X.at(X.kid(pr, W, 'u'), W, 'val') !== 'none') t = `<u>${t}</u>`;
          if (this.isOn(pr, 'i')) t = `<i>${t}</i>`;
          if (this.isOn(pr, 'b')) t = `<b>${t}</b>`;
          s += t;
        } else if (c.namespaceURI === W && c.localName === 'hyperlink') {
          const save = s; s = ''; walk(c); const inner = s; s = save;
          const r = relOf(X.at(c, R, 'id'));
          s += r && r.mode === 'External' && /^(https?:|mailto:)/i.test(r.target) ? `<a href="${escapeHtml(r.target)}">${inner}</a>` : inner;
        } else if (c.namespaceURI === W && /^(ins|smartTag|fldSimple|customXml|sdt|sdtContent)$/.test(c.localName)) walk(c);
      }
    };
    walk(p);
    return s;
  },
  hasImage(p) { return this.X.q(p, this.A, 'blip').length > 0 || this.X.q(p, 'urn:schemas-microsoft-com:vml', 'imagedata').length > 0; },
  styleOf(p) { const X = this.X, W = this.W; const pr = X.kid(p, W, 'pPr'), st = pr && X.kid(pr, W, 'pStyle'); return st ? X.at(st, W, 'val') : ''; },
  headingLevel(styleId, styles) {
    const nm = (styles.get(styleId) || styleId || '').toLowerCase();
    const m = /^(heading|überschrift|berschrift)\s*(\d)/.exec(nm) || /^(heading|berschrift)(\d)$/i.exec(styleId || '');
    if (m) return Math.min(6, +m[2]);
    if (/^(title|titel)$/.test(nm)) return 1;
    return 0;
  },
  async styleNames(pkg) {
    const X = this.X, W = this.W, map = new Map();
    const r = (await pkg.rels(pkg.main)).find(x => /\/styles$/.test(x.type));
    if (!r || !pkg.has(r.path)) return map;
    const d = await pkg.xml(r.path);
    for (const s of X.q(d, W, 'style')) { const n = X.kid(s, W, 'name'); map.set(X.at(s, W, 'styleId'), n ? X.at(n, W, 'val') : ''); }
    return map;
  },
  /* ein Knoten → { kind, html }. Mit S (Formatvorlagen, office-wordimport.js, 1.74): Schrift, Abstände, Einzüge,
     Zeilenabstand wie in Word; Seitenumbrüche im Absatz (am Ende bzw. Abschnittswechsel) → brAfter */
  nodeHtml(n, styles, relOf, S) {
    const X = this.X, W = this.W, WI = typeof OfficeWI !== 'undefined' && S ? OfficeWI : null;
    if (n.namespaceURI === W && n.localName === 'p') {
      const pr = X.kid(n, W, 'pPr');
      const brs = X.q(n, W, 'br').filter(b => X.at(b, W, 'type') === 'page');
      const sp = pr && X.kid(pr, W, 'sectPr'), stp = sp && X.kid(sp, W, 'type');
      const secBrk = !!sp && !/^continuous$/.test(stp ? X.at(stp, W, 'val') : 'nextPage');
      if (WI) {
        const d = WI.para(S, n);
        const tag0 = WI.tag(S, d);
        const num = pr && X.kid(pr, W, 'numPr'), numId = num && X.kid(num, W, 'numId');
        const li = (num && !(numId && X.at(numId, W, 'val') === '0')) || /^(list|liste|aufz)/i.test(d.name || '');
        const il = num && X.kid(num, W, 'ilvl') ? +X.at(X.kid(num, W, 'ilvl'), W, 'val') : 0;
        const fmt = numId && S.num.get(X.at(numId, W, 'val')), nf = fmt && fmt[String(il)];
        const ol = !!nf && nf !== 'bullet' && nf !== 'none';
        const tag = li ? 'li' : tag0;
        // Umbruch vor dem ersten Text → oberhalb, sonst nach dem Absatz
        let before = false;
        if (brs.length) { const first = X.q(n, W, 't').find(t => t.textContent.trim()); before = !first || !!(brs[0].compareDocumentPosition(first) & 4); }
        const P = before ? { ...d.P, pbb: true } : d.P;
        const css = WI.pCss(P, d.R, tag, WI.base(S), li);
        const inner = WI.runs(S, d.R, n, relOf);
        const brAfter = (brs.length && !before) || secBrk;
        if (WI.has(n) && WI.objects(n).length) return { kind: 'img', html: `<${tag0} style="${css}">${inner || '<br>'}</${tag0}>`, brAfter };
        if (!inner.replace(/<br>|&emsp;/g, '').trim() && brs.length) return { kind: 'p', html: '<hr>' };
        const st = css ? ` style="${css}"` : '';
        if (li) return { kind: 'p', li: true, ol, lvl: il, html: `<li${st}>${inner || '<br>'}</li>`, brAfter };
        return { kind: 'p', html: `<${tag}${st}>${inner || '<br>'}</${tag}>`, empty: tag === 'div' && !inner.replace(/<[^>]+>|&emsp;/g, '').trim() && !brAfter && !P.pbb, brAfter };
      }
      if (this.hasImage(n)) return { kind: 'img' };
      const st = this.styleOf(n);
      const num = pr && X.kid(pr, W, 'numPr');
      const jc = pr && X.kid(pr, W, 'jc') && X.at(X.kid(pr, W, 'jc'), W, 'val');
      const al = { center: 'center', right: 'right', end: 'right', both: 'justify', distribute: 'justify' }[jc] || '';
      const inner = this.runsHtml(n, relOf);
      // reiner Seitenumbruch-Absatz → Trennlinie (wird beim Speichern wieder ein Seitenumbruch)
      if (!inner.replace(/<br>|&emsp;/g, '').trim() && brs.length) return { kind: 'p', html: '<hr>' };
      const lv = this.headingLevel(st, styles);
      const sa = al ? ` style="text-align:${al}"` : '';
      if (num || /^(list|liste|aufz)/i.test(styles.get(st) || st)) {
        const il = num && X.kid(num, W, 'ilvl') ? +X.at(X.kid(num, W, 'ilvl'), W, 'val') : 0;
        return { kind: 'p', li: true, lvl: il, html: `<li${sa}>${inner || '<br>'}</li>` };
      }
      if (lv) return { kind: 'p', html: `<h${Math.min(6, lv)}${sa}>${inner || '<br>'}</h${Math.min(6, lv)}>` };
      return { kind: 'p', html: `<div${sa}>${inner || '<br>'}</div>`, empty: !inner.replace(/<[^>]+>|&emsp;/g, '').trim() };
    }
    if (n.namespaceURI === W && n.localName === 'tbl') {
      if (WI && WI.has(n) && WI.objects(n).some(o => o.kind === 'pic')) return { kind: 'tblimg' };   // Tabelle mit Bildern (1.75): eigenes, gesperrtes Feld
      if (WI) return { kind: 'p', html: WI.tableHtml(S, n, relOf), tbl: true };
      let s = '<table style="border-collapse:collapse">';
      for (const tr of X.kids(n, W, 'tr')) {
        s += '<tr>';
        for (const tc of X.kids(tr, W, 'tc')) {
          const tcPr = X.kid(tc, W, 'tcPr'), gs = tcPr && X.kid(tcPr, W, 'gridSpan');
          const span = gs ? +X.at(gs, W, 'val') : 1;
          const cell = X.kids(tc, W, 'p').map(p => this.runsHtml(p, relOf)).join('<br>');
          s += `<td${span > 1 ? ` colspan="${span}"` : ''}>${cell || '<br>'}</td>`;
        }
        s += '</tr>';
      }
      return { kind: 'p', html: s + '</table>', tbl: true };
    }
    if (n.namespaceURI === W && /^(bookmarkStart|bookmarkEnd|proofErr|permStart|permEnd|commentRangeStart|commentRangeEnd)$/.test(n.localName)) return { kind: 'mark' };
    // Inhaltssteuerelement u. ä.: Inhalt formatiert anzeigen (gesperrt, bleibt unverändert im Dokument)
    if (WI && n.namespaceURI === W && n.localName === 'sdt') { const html = WI.blockHtml(S, n, relOf); if (html.replace(/<[^>]+>/g, '').trim()) return { kind: 'lock', html }; }
    return { kind: 'lock', text: X.q(n, W, 't').map(t => t.textContent).join(' ').trim() };
  },

  /* ---------------------------------------------------------------- Import */
  async read(pkg, p, y0) {
    const X = this.X, W = this.W;
    const doc = await pkg.xml(pkg.main);
    const rels = await pkg.rels(pkg.main);
    const relOf = (id) => rels.find(r => r.id === id);
    const styles = await this.styleNames(pkg);
    const WI = typeof OfficeWI !== 'undefined' ? OfficeWI : null;
    const S = WI ? await WI.styles(pkg) : null;   // Formatvorlagen wie Word (1.74)
    const body = X.q(doc, W, 'body')[0];
    const nodes = body ? this.nodes(body) : [];
    const info = nodes.map(n => this.nodeHtml(n, styles, relOf, S));
    const map = [];
    // Seite einrichten (letzter w:sectPr): Format und Ränder in Twips
    const sect = body && X.kid(body, W, 'sectPr');
    const sz = sect && X.kid(sect, W, 'pgSz'), mar = sect && X.kid(sect, W, 'pgMar');
    const tw = (e, k, d) => { const v = e && +X.at(e, W, k); return v > 0 ? v : d; };
    p.office.pg = { w: tw(sz, 'w', 11906), h: tw(sz, 'h', 16838), t: tw(mar, 'top', 1417), b: tw(mar, 'bottom', 1134), l: tw(mar, 'left', 1417), r: tw(mar, 'right', 1417) };
    p.office.pg0 = { ...p.office.pg };
    p.office.pgBorder = p.office.pgBorder0 = typeof OfficeWord !== 'undefined' ? OfficeWord.readBorders(sect) : null;   // Seitenränder (1.67)
    p.office.paperY = y0;
    if (WI) { p.office.wbase = WI.base(S); p.office.bm = WI.bookmarks(nodes); }   // Grundschrift, Textmarken (1.74)
    const bgEl = X.kid(doc.documentElement, W, 'background'), bgc = bgEl && X.at(bgEl, W, 'color');
    p.office.pageColor = p.office.pageColor0 = bgc && /^[0-9A-Fa-f]{6}$/.test(bgc) ? '#' + bgc.toLowerCase() : null;
    p.office.white = await X.solid(p.office.pageColor || '#ffffff');
    const PLAIN = { bg: 'transparent', under: p.office.pageColor || '#ffffff' };
    const XX = 40;
    const P = OfficeView.paper(p), cw = Math.round(P.W - P.l - P.r);
    let y = y0;
    const place = (b) => { y = X.bottom(b) + 10; };
    // Seitenumbruch am Ende des vorigen Absatzes bzw. Abschnittswechsel → nächster Absatz oben auf der neuen Seite
    let brk = false;
    const brkHtml = (h) => h.replace(/^<(\w+)( style="([^"]*)")?/, (m, t, x, css) => `<${t} style="${css ? css.replace(/;?$/, ';') : ''}break-before:page"`);
    const brkBox = (b) => { if (brk && b) { b.ox.brk = true; brk = false; } };
    let i = 0;
    while (i < nodes.length) {
      // Inhaltsverzeichnis (1.74): Einträge mit Füllpunkten, Seitenzahl aus der Ansicht, Klick = Sprung
      const te = WI ? WI.tocRange(nodes, i) : 0;
      if (te) {
        const n = nodes[i];
        const paras = n.localName === 'sdt' ? X.q(X.kid(n, W, 'sdtContent') || n, W, 'p') : nodes.slice(i, te);
        const list = WI.tocEntries(S, paras);
        const b = X.addBox(XX, y, cw + 22, WI.tocHtml(list), { raw: true, office: null, style: { ...PLAIN }, ox: { k: 'wtoc', i0: i, i1: te } });
        brkBox(b);
        if (info.slice(i, te).some(s => s.brAfter)) brk = true;
        map.push({ i0: i, i1: te, box: b.id });
        place(b);
        i = te;
        continue;
      }
      const k = info[i].kind;
      if (k === 'p' || k === 'mark') {
        let j = i;
        while (j < nodes.length && (info[j].kind === 'p' || info[j].kind === 'mark') && !(WI && WI.tocRange(nodes, j))) j++;
        const seg = info.slice(i, j);
        if (seg.every(s => s.kind === 'mark' || s.empty) && !seg.some(s => s.brAfter)) { map.push({ i0: i, i1: j, box: null }); i = j; continue; }
        // Marken (Lesezeichen …) zwischen Absätzen: eigene, unveränderliche Abschnitte
        let a = i;
        while (a < j) {
          if (info[a].kind === 'mark') { let e = a; while (e < j && info[e].kind === 'mark') e++; map.push({ i0: a, i1: e, box: null }); a = e; continue; }
          let e = a; while (e < j && info[e].kind === 'p') e++;
          let html = '';
          const stack = [];
          for (let q = a; q < e; q++) {
            const s = info[q];
            const want = s.li ? s.lvl + 1 : 0, lt = s.ol ? 'ol' : 'ul';
            while (stack.length > want) html += `</${stack.pop()}>`;
            if (stack.length === want && want && stack[want - 1] !== lt) html += `</${stack.pop()}>`;
            while (stack.length < want) { const t = stack.length === want - 1 ? lt : 'ul'; html += `<${t}>`; stack.push(t); }
            html += brk ? brkHtml(s.html) : s.html;
            brk = !!s.brAfter;
          }
          while (stack.length) html += `</${stack.pop()}>`;
          const b = X.addBox(XX, y, this.WIDTH + 22, html, { locked: false, office: null, style: { ...PLAIN } });
          const bl = OfficeHtml.blocks(b.html);
          if (bl.length === e - a) b.ox = { k: 'w', i0: a, i1: e, hs: bl.map(x => OfficeHtml.key(x.html)), h: OfficeHtml.key(b.html) };
          else { b.locked = true; b.ox = { k: 'wlock', i0: a, i1: e }; }
          map.push({ i0: a, i1: e, box: b.id });
          place(b);
          a = e;
        }
        i = j;
        continue;
      }
      if (k === 'img') {
        const n = nodes[i];
        if (WI) {
          // Bilder, Textfelder, Formen (1.74): Grösse, Drehung, Zuschnitt, Verankerung wie in Word
          const segs = await WI.objPara(pkg, p, n, i, { S, relOf, rels, P, y, PLAIN, XX, cw, html: brk ? brkHtml(info[i].html) : info[i].html });
          brk = !!info[i].brAfter;
          for (const sg of segs) {
            map.push(sg);
            const b = p.boxes.find(q => q.id === sg.box);
            if (b && !sg.fl) place(b);
          }
          i++;
          continue;
        }
        const parts = [];
        for (const bl of X.q(n, this.A, 'blip')) {
          const r = relOf(X.at(bl, this.R, 'embed'));
          const m = r && r.path ? await X.media(pkg, r.path) : null;
          const exE = (() => { let e = bl; while (e && !(e.localName === 'inline' || e.localName === 'anchor')) e = e.parentNode; return e && X.q(e, this.WP, 'extent')[0]; })();
          const w = Math.min(this.WIDTH, exE ? Ooxml.emu2px(+exE.getAttribute('cx')) : m ? m.w : 200);
          const h = exE ? Ooxml.emu2px(+exE.getAttribute('cy')) * (w / Ooxml.emu2px(+exE.getAttribute('cx') || 1)) : m ? m.h * w / m.w : 120;
          if (m) parts.push({ id: uid('i'), src: m.name, x: 0, y: parts.reduce((s, q) => s + q.h + 10, 0), w: Math.round(w), h: Math.round(h) });
        }
        const text = this.runsHtml(n, relOf);
        const b = parts.length ? X.addBox(XX, y, Math.max(...parts.map(q => q.w)) + 22, text ? `<div>${text}</div>` : '', { images: parts, office: null, style: { ...PLAIN }, ox: { k: 'wimg', i0: i, i1: i + 1 } })
          : X.addBox(XX, y, 300, '<div style="color:#777">🔒 Grafik – nur in Word sichtbar (bleibt im Dokument)</div>', { office: null, style: { ...PLAIN }, ox: { k: 'wimg', i0: i, i1: i + 1 } });
        map.push({ i0: i, i1: i + 1, box: b.id });
        place(b);
        i++;
        continue;
      }
      // Tabelle mit Bildern in den Zellen (1.75): Bilder eingebettet (data-kt-src), gesperrt – bleibt unverändert im Dokument
      if (k === 'tblimg') {
        const pics = new Map();
        for (const o of WI.objects(nodes[i])) {
          if (o.kind !== 'pic') continue;
          const r = o.rid && relOf(o.rid), im = r && r.path && pkg.has(r.path) ? await WI.picture(pkg, r.path, o) : null;
          if (im) { const w = Math.min(im.w, cw - 20), h = im.h * w / im.w; pics.set(o.el, `<img data-kt-src="${escapeHtml(im.name)}" alt="" style="width:${w.toFixed(1)}px;height:${h.toFixed(1)}px;vertical-align:bottom">`); }
        }
        const b = X.addBox(XX, y, cw + 22, WI.tableHtml(S, nodes[i], relOf, pics), { raw: true, office: null, ox: { k: 'wlock', i0: i, i1: i + 1 }, style: { ...PLAIN } });
        brkBox(b);
        map.push({ i0: i, i1: i + 1, box: b.id }); place(b); i++; continue;
      }
      // gesperrt (Inhaltssteuerelement …): formatiert (1.74) bzw. grau als Text
      if (info[i].html) {
        const b = X.addBox(XX, y, cw + 22, info[i].html, { office: null, ox: { k: 'wlock', i0: i, i1: i + 1 }, style: { ...PLAIN } });
        brkBox(b);
        map.push({ i0: i, i1: i + 1, box: b.id }); place(b); i++; continue;
      }
      const t = info[i].text;
      if (t) { const b = X.addBox(XX, y, this.WIDTH + 22, `<div style="color:#777">🔒 ${escapeHtml(t.slice(0, 400))}${t.length > 400 ? ' …' : ''}</div>`, { office: null, ox: { k: 'wlock', i0: i, i1: i + 1 }, style: { ...PLAIN } }); brkBox(b); map.push({ i0: i, i1: i + 1, box: b.id }); place(b); }
      else map.push({ i0: i, i1: i + 1, box: null });
      i++;
    }
    // Fuss- und Endnoten (1.75): am Ende des Dokuments, Nummern im Text springen hierher
    const notes = WI ? WI.notesHtml(S, relOf) : '';
    if (notes) {
      const b = X.addBox(XX, y, cw + 22, notes, { raw: true, office: null, style: { ...PLAIN }, ox: { k: 'wfn' } });
      map.push({ i0: nodes.length, i1: nodes.length, box: b.id });
      for (const k of ['fn', 'en']) for (const id of S.noteNo[k].keys()) p.office.bm['_kt' + k + id] = nodes.length;
    }
    p.office.map = map;
    p.office.n = nodes.length;
    // Kopf- und Fusszeile (1.72): bearbeitbar, auf jedem Blatt (office-wordtools.js)
    if (typeof OfficeWX !== 'undefined') await OfficeWX.readHF(pkg, p, body);
    const hf = [];
    if (typeof OfficeWX === 'undefined')
    for (const r of rels.filter(r => /\/(header|footer)$/.test(r.type))) {
      try { const d = await pkg.xml(r.path); const t = X.q(d, W, 't').map(x => x.textContent).join(' ').trim(); if (t) hf.push(`${/header$/.test(r.type) ? 'Kopfzeile' : 'Fusszeile'}: ${escapeHtml(t)}`); } catch (e) { /* */ }
    }
    // im Rand des ersten Blatts (grau, gesperrt – bleiben unverändert im Dokument) – nur ohne office-wordtools.js
    const hd = [...new Set(hf.filter(t => t.startsWith('Kopf')).map(t => t.replace(/^Kopfzeile: /, '')))], ft = [...new Set(hf.filter(t => t.startsWith('Fuss')).map(t => t.replace(/^Fusszeile: /, '')))];
    if (hd.length) X.addBox(XX, y0, this.WIDTH, `<div style="color:#8a8a8a;font-size:12px">${hd.join(' · ')}</div>`, { style: { ...PLAIN }, ox: { k: 'hf', pos: 'h' } });
    if (ft.length) X.addBox(XX, y0, this.WIDTH, `<div style="color:#8a8a8a;font-size:12px">${ft.join(' · ')}</div>`, { style: { ...PLAIN }, ox: { k: 'hf', pos: 'f' } });
    if (!nodes.length || map.every(m => !m.box)) {
      // leeres Dokument (nur leere Absätze): ein Textfeld zum Schreiben – ersetzt beim Export die leeren Absätze
      const empty = info.every(s => s.kind === 'mark' || s.empty);
      const i1 = empty ? nodes.length : nodes.length, i0 = empty ? 0 : nodes.length;
      const b = X.addBox(XX, y, this.WIDTH + 22, '', { locked: false, office: null, style: { ...PLAIN }, ox: { k: 'w', i0, i1, hs: empty ? info.map(s => OfficeHtml.key(s.html || '')) : [], h: '' } });
      if (empty) map.length = 0;
      map.push({ i0, i1, box: b.id });
    }
  },

  /* ---------------------------------------------------------------- Export */
  async write(pkg, p) {
    const X = this.X, W = this.W;
    const o = p.office;
    if (!o.map) return {};
    const doc = await pkg.xml(pkg.main);
    const body = X.q(doc, W, 'body')[0];
    if (!body) return {};
    const nodes = this.nodes(body);
    if (nodes.length !== o.n) throw new Error('Word-Dokument passt nicht zur Seite');
    // nur wenn etwas geändert wurde: Formatvorlagen/Nummerierung nachschlagen (Nummerierung nur ergänzen, wenn nötig)
    const newImgs = (b) => b && b.ox && b.ox.k === 'w' ? b.images.filter(im => !(b.ox.imgs || []).includes(im.id)) : [];
    const dirty = o.map.filter(seg => seg.box && (() => { const b = p.boxes.find(x => x.id === seg.box); return !b || (b.ox && b.ox.k === 'w' && (OfficeHtml.key(b.html) !== b.ox.h || newImgs(b).length)); })());
    const pgChanged = o.pg && o.pg0 && ['w', 'h', 't', 'b', 'l', 'r'].some(k => o.pg[k] !== o.pg0[k]);
    if (pgChanged) this.writePage(doc, body, o.pg);
    let colChanged = (o.pageColor || null) !== (o.pageColor0 || null);
    if (colChanged) {
      const old = X.kid(doc.documentElement, W, 'background'); if (old) old.remove();
      if (o.pageColor) {
        doc.documentElement.prepend(X.mk(doc, W, 'background', { 'w:color': o.pageColor.slice(1).toUpperCase() }));
        let sr = (await pkg.rels(pkg.main)).find(r => /\/settings$/.test(r.type) && pkg.has(r.path));
        if (!sr) {   // ohne settings.xml zeigt Word die Seitenfarbe nicht an
          const sp = pkg.has('word/settings.xml') ? pkg.freeName('word/settings%.xml') : 'word/settings.xml';
          await pkg.addPart(sp, '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n<w:settings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"/>', 'application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml');
          await pkg.addRel(pkg.main, 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings', sp.replace(/^word\//, ''));
          sr = { path: sp };
        }
        const sd = await pkg.xml(sr.path);
        if (!X.kid(sd.documentElement, W, 'displayBackgroundShape')) {   // Reihenfolge laut Schema: nach writeProtection … doNotDisplayPageBoundaries
          const e = X.mk(sd, W, 'displayBackgroundShape');
          const before = ['writeProtection', 'view', 'zoom', 'removePersonalInformation', 'removeDateAndTime', 'doNotDisplayPageBoundaries'].map(n => X.kid(sd.documentElement, W, n)).filter(Boolean).pop();
          if (before) before.after(e); else sd.documentElement.prepend(e);
          pkg.setXml(sr.path, sd);
        }
      }
    }
    // Entwurf (1.67): Seitenränder, Absatzabstand, Schriftart
    const bdChanged = JSON.stringify(o.pgBorder || null) !== JSON.stringify(o.pgBorder0 || null);
    if (bdChanged) OfficeWord.writeBorders(doc, body, o.pgBorder);
    const defChanged = (o.spacing || null) !== (o.spacing0 || null) || (o.font || null) !== (o.font0 || null);
    if (defChanged) await OfficeWord.writeDefaults(pkg, o);
    // Kopf-/Fusszeile, Seitenzahl, Wasserzeichen, Silbentrennung (1.72)
    if (typeof OfficeWX !== 'undefined' && await OfficeWX.write(pkg, doc, body, p)) colChanged = true;
    if (bdChanged) colChanged = true;
    if (!dirty.length) { if (pgChanged || colChanged) pkg.setXml(pkg.main, doc); return { changed: pgChanged || colChanged || defChanged ? 1 : 0 }; }
    const lists = dirty.some(seg => { const b = p.boxes.find(x => x.id === seg.box); return b && /<li[\s>]/i.test(b.html); });
    const ctx = await this.ctx(pkg, doc, lists);
    let changed = 0;
    const sect = X.kid(body, W, 'sectPr');
    for (const seg of o.map) {
      if (!seg.box) continue;
      const b = p.boxes.find(x => x.id === seg.box);
      const old = nodes.slice(seg.i0, seg.i1);
      const anchor = nodes[seg.i1] || sect || null;
      if (!b) { old.forEach(n => n.remove()); changed++; continue; }
      if (!b.ox || b.ox.k !== 'w') continue;
      const imgs = newImgs(b);
      if (OfficeHtml.key(b.html) === b.ox.h && !imgs.length) continue;
      const nb = OfficeHtml.blocks(isEmptyHtml(b.html) ? '' : b.html);
      const pairs = OfficeHtml.lcs(b.ox.hs, nb.map(x => OfficeHtml.key(x.html)));
      const keep = new Map(pairs.map(([i, j]) => [j, i]));
      const out = [];
      nb.forEach((blk, j) => {
        if (keep.has(j)) { out.push(old[keep.get(j)]); return; }
        if (blk.tag === 'hr') { out.push(...X.xml(doc, W, '<w:p><w:r><w:br w:type="page"/></w:r></w:p>')); return; }
        // Vorlage: alter Knoten an derselben Stelle (gleiche Art), sonst Nachbar
        const tmpl = old[Math.min(j, old.length - 1)];
        out.push(blk.tag === 'table' ? this.makeTable(doc, blk, ctx, old.find(n => n.localName === 'tbl')) : this.makePara(doc, blk, ctx, tmpl && tmpl.localName === 'p' && this.sameKind(tmpl, blk, ctx) ? tmpl : null));
      });
      // neue Bilder im Feld: als Bild-Absätze dahinter (Reihenfolge von oben nach unten)
      for (const im of imgs.sort((a, b) => a.y - b.y)) { const n = await this.picPara(pkg, doc, im); if (n) out.push(n); }
      old.forEach(n => n.remove());
      for (const n of out) anchor ? anchor.before(n) : body.append(n);
      changed++;
    }
    if (changed || pgChanged || colChanged) pkg.setXml(pkg.main, doc);
    return { changed };
  },
  /* Format/Ränder in den letzten Abschnitt (w:sectPr) schreiben – Hoch/Quer folgt aus Breite > Höhe */
  writePage(doc, body, g) {
    const X = this.X, W = this.W;
    let sect = X.kid(body, W, 'sectPr');
    if (!sect) { sect = X.mk(doc, W, 'sectPr'); body.append(sect); }
    const pre = doc.documentElement.lookupPrefix(W) || 'w';
    const att = (e, k, v) => e.setAttributeNS(W, pre + ':' + k, String(Math.round(v)));
    let sz = X.kid(sect, W, 'pgSz');
    if (!sz) { sz = X.mk(doc, W, 'pgSz'); sect.prepend(sz); }
    att(sz, 'w', g.w); att(sz, 'h', g.h);
    if (g.w > g.h) sz.setAttributeNS(W, pre + ':orient', 'landscape'); else sz.removeAttributeNS(W, 'orient');
    let mar = X.kid(sect, W, 'pgMar');
    if (!mar) { mar = X.mk(doc, W, 'pgMar', { 'w:header': '708', 'w:footer': '708', 'w:gutter': '0' }); sz.after(mar); }
    att(mar, 'top', g.t); att(mar, 'bottom', g.b); att(mar, 'left', g.l); att(mar, 'right', g.r);
  },
  /* KnowledgeTree-Bild → Absatz mit eingebettetem Bild (wp:inline) */
  async picPara(pkg, doc, im) {
    const img = await OfficePages.imageForOffice(im.src);
    if (!img) return null;
    const dir = pkg.main.replace(/[^/]+$/, '');
    const path = pkg.freeName(dir + 'media/ktbild%.' + img.ext);
    await pkg.addPart(path, img.u8, img.type);
    const rid = await pkg.addRel(pkg.main, Ooxml.REL.img, 'media/' + path.split('/').pop());
    const cx = Math.round(im.w * 9525), cy = Math.round(im.h * 9525), id = 9000 + Math.floor(Math.random() * 90000);
    const [p] = this.X.xml(doc, this.W, `<w:p><w:r><w:drawing><wp:inline xmlns:wp="${this.WP}" distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="${id}" name="Bild ${id}"/><a:graphic xmlns:a="${Ooxml.NS.a}"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="${id}" name="Bild ${id}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${rid}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`);
    return p;
  },
  async ctx(pkg, doc, lists = false) {
    const X = this.X, W = this.W;
    const styles = await this.styleNames(pkg);
    const byName = (re) => { for (const [id, nm] of styles) if (re.test(nm)) return id; return null; };
    const heading = [1, 2, 3, 4, 5, 6].map(n => byName(new RegExp('^heading ' + n + '$', 'i')) || (styles.has('Heading' + n) ? 'Heading' + n : styles.has('berschrift' + n) ? 'berschrift' + n : null));
    // Aufzählung: vorhandene Nummerierung eines Listenabsatzes übernehmen
    let numId = null, numIdOl = null;
    for (const np of X.q(doc, W, 'numPr')) { const id = X.kid(np, W, 'numId'); if (id && X.at(id, W, 'val') !== '0') { numId = numId || X.at(id, W, 'val'); } }
    const numRel = (await pkg.rels(pkg.main)).find(r => /\/numbering$/.test(r.type));
    if (!numId && numRel && pkg.has(numRel.path)) {
      const nd = await pkg.xml(numRel.path);
      const nums = X.q(nd, W, 'num');
      const abs = new Map(X.q(nd, W, 'abstractNum').map(a => [X.at(a, W, 'abstractNumId'), a]));
      for (const n of nums) {
        const a = abs.get(X.at(X.kid(n, W, 'abstractNumId'), W, 'val'));
        const f = a && X.q(a, W, 'numFmt')[0];
        const fmt = f ? X.at(f, W, 'val') : '';
        if (fmt === 'bullet' && !numId) numId = X.at(n, W, 'numId');
        if (fmt === 'decimal' && !numIdOl) numIdOl = X.at(n, W, 'numId');
      }
    }
    if (lists && !numId && !numRel) {
      // Dokument ohne Nummerierung: Teil aus der leeren Vorlage ergänzen (Aufzählung = 1, Nummerierung = 2)
      const parts = Ooxml.blankParts('docx');
      const path = (pkg.main.replace(/[^/]+$/, '') || '') + 'numbering.xml';
      if (!pkg.has(path)) {
        await pkg.addPart(path, parts['word/numbering.xml'], 'application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml');
        await pkg.addRel(pkg.main, 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering', 'numbering.xml');
        numId = '1'; numIdOl = '2';
      }
    }
    const listStyle = byName(/^list paragraph$/i) || (styles.has('ListParagraph') ? 'ListParagraph' : null);
    return { styles, heading, numId, numIdOl: numIdOl || numId, listStyle };
  },
  sameKind(n, blk, ctx) {
    const st = this.styleOf(n), lv = this.headingLevel(st, ctx.styles);
    const pr = this.X.kid(n, this.W, 'pPr'), num = pr && this.X.kid(pr, this.W, 'numPr');
    if (blk.tag === 'li') return !!num;
    if (/^h\d$/.test(blk.tag)) return lv === +blk.tag[1];
    return !lv && !num;
  },
  makePara(doc, blk, ctx, tmpl) {
    const X = this.X, W = this.W;
    const p = X.mk(doc, W, 'p');
    let pPr = tmpl && X.kid(tmpl, W, 'pPr') ? X.kid(tmpl, W, 'pPr').cloneNode(true) : null;
    if (pPr) for (const k of [...pPr.children]) if (k.localName === 'rPr' || k.localName === 'sectPr' || k.localName === 'pPrChange') k.remove();
    const ensure = () => { if (!pPr) pPr = X.mk(doc, W, 'pPr'); return pPr; };
    const setChild = (tag, attrs, first = false) => { const pr = ensure(); let e = X.kid(pr, W, tag); if (!e) { e = X.mk(doc, W, tag); if (first) pr.prepend(e); else pr.append(e); } for (const [k, v] of Object.entries(attrs)) e.setAttributeNS(W, (doc.documentElement.lookupPrefix(W) || 'w') + ':' + k, v); return e; };
    if (/^h\d$/.test(blk.tag)) { const sid = ctx.heading[+blk.tag[1] - 1]; if (sid) setChild('pStyle', { val: sid }, true); }
    if (blk.tag === 'li' && !(tmpl && X.q(tmpl, W, 'numPr').length)) {
      const id = blk.list === 'ol' ? ctx.numIdOl : ctx.numId;
      if (ctx.listStyle && !X.kid(ensure(), W, 'pStyle')) setChild('pStyle', { val: ctx.listStyle }, true);
      if (id) { const np = setChild('numPr', {}); np.textContent = ''; np.append(X.mk(doc, W, 'ilvl', { 'w:val': String(blk.lvl || 0) }), X.mk(doc, W, 'numId', { 'w:val': id })); }
    } else if (blk.tag === 'li') { const np = X.q(pPr, W, 'numPr')[0]; const il = np && X.kid(np, W, 'ilvl'); if (il) il.setAttributeNS(W, (doc.documentElement.lookupPrefix(W) || 'w') + ':val', String(blk.lvl || 0)); }
    if (blk.align) { const v = { left: 'left', center: 'center', right: 'right', justify: 'both' }[blk.align]; if (v) setChild('jc', { val: v }); }
    else if (pPr && X.kid(pPr, W, 'jc')) X.kid(pPr, W, 'jc').remove();
    if (pPr) { this.orderPPr(pPr); p.append(pPr); }
    const r0 = tmpl && X.q(tmpl, W, 'r')[0], rPr0 = r0 && X.kid(r0, W, 'rPr');
    const noBullet = blk.tag === 'li' && !ctx.numId;
    if (noBullet) blk.runs.unshift({ text: '• ' });
    for (const run of blk.runs) p.append(this.makeRun(doc, run, rPr0));
    return p;
  },
  PPR_ORDER: ['pStyle', 'keepNext', 'keepLines', 'pageBreakBefore', 'framePr', 'widowControl', 'numPr', 'suppressLineNumbers', 'pBdr', 'shd', 'tabs', 'suppressAutoHyphens', 'kinsoku', 'wordWrap', 'overflowPunct', 'topLinePunct', 'autoSpaceDE', 'autoSpaceDN', 'bidi', 'adjustRightInd', 'snapToGrid', 'spacing', 'ind', 'contextualSpacing', 'mirrorIndents', 'suppressOverlap', 'jc', 'textDirection', 'textAlignment', 'textboxTightWrap', 'outlineLvl', 'divId', 'cnfStyle', 'rPr', 'sectPr', 'pPrChange'],
  RPR_ORDER: ['rStyle', 'rFonts', 'b', 'bCs', 'i', 'iCs', 'caps', 'smallCaps', 'strike', 'dstrike', 'outline', 'shadow', 'emboss', 'imprint', 'noProof', 'snapToGrid', 'vanish', 'webHidden', 'color', 'spacing', 'w', 'kern', 'position', 'sz', 'szCs', 'highlight', 'u', 'effect', 'bdr', 'shd', 'fitText', 'vertAlign', 'rtl', 'cs', 'em', 'lang', 'eastAsianLayout', 'specVanish', 'oMath'],
  orderPPr(pr) { this.order(pr, this.PPR_ORDER); },
  order(el, ord) { const kids = [...el.children]; kids.sort((a, b) => (ord.indexOf(a.localName) + 1 || 99) - (ord.indexOf(b.localName) + 1 || 99)); for (const k of kids) el.append(k); },
  makeRun(doc, run, rPr0) {
    const X = this.X, W = this.W;
    const r = X.mk(doc, W, 'r');
    const rPr = rPr0 ? rPr0.cloneNode(true) : X.mk(doc, W, 'rPr');
    const pre = doc.documentElement.lookupPrefix(W) || 'w';
    const set = (tag, on, val) => { let e = X.kid(rPr, W, tag); if (!on) { if (e) e.remove(); return; } if (!e) { e = X.mk(doc, W, tag); rPr.append(e); } if (val != null) e.setAttributeNS(W, pre + ':val', val); else e.removeAttributeNS(W, 'val'); };
    set('b', !!run.b); set('bCs', !!run.b && !!X.kid(rPr, W, 'bCs')); set('i', !!run.i);
    set('strike', !!run.s); set('u', !!run.u, 'single');
    set('vertAlign', !!(run.sup || run.sub), run.sup ? 'superscript' : 'subscript');
    if (run.color) set('color', true, run.color.slice(1).toUpperCase());
    if (run.px) { const hp = String(Math.round(run.px * 0.75 * 2)); set('sz', true, hp); if (X.kid(rPr, W, 'szCs')) set('szCs', true, hp); }
    if (run.font) { let f = X.kid(rPr, W, 'rFonts'); if (!f) { f = X.mk(doc, W, 'rFonts'); rPr.append(f); } for (const k of ['ascii', 'hAnsi', 'cs']) f.setAttributeNS(W, pre + ':' + k, run.font); for (const k of ['asciiTheme', 'hAnsiTheme', 'cstheme']) f.removeAttributeNS(W, k); }
    this.order(rPr, this.RPR_ORDER);
    if (rPr.children.length) r.append(rPr);
    if (run.br) r.append(X.mk(doc, W, 'br'));
    else if (run.tab) r.append(X.mk(doc, W, 'tab'));
    else { const t = X.mk(doc, W, 't'); t.setAttribute('xml:space', 'preserve'); t.textContent = run.text || ''; r.append(t); }
    return r;
  },
  makeTable(doc, blk, ctx, tmpl) {
    const X = this.X, W = this.W;
    const tbl = X.mk(doc, W, 'tbl');
    const tp = tmpl && X.kid(tmpl, W, 'tblPr');
    if (tp) tbl.append(tp.cloneNode(true));
    else tbl.append(...X.xml(doc, W, '<w:tblPr><w:tblStyle w:val="TableGrid"/><w:tblW w:w="0" w:type="auto"/><w:tblBorders><w:top w:val="single" w:sz="4" w:space="0" w:color="auto"/><w:left w:val="single" w:sz="4" w:space="0" w:color="auto"/><w:bottom w:val="single" w:sz="4" w:space="0" w:color="auto"/><w:right w:val="single" w:sz="4" w:space="0" w:color="auto"/><w:insideH w:val="single" w:sz="4" w:space="0" w:color="auto"/><w:insideV w:val="single" w:sz="4" w:space="0" w:color="auto"/></w:tblBorders><w:tblLook w:val="04A0"/></w:tblPr>'));
    const ncol = Math.max(1, ...blk.rows.map(r => r.reduce((s, c) => s + c.span, 0)));
    const cw = Math.floor(9000 / ncol);
    const grid = X.mk(doc, W, 'tblGrid');
    for (let c = 0; c < ncol; c++) grid.append(X.mk(doc, W, 'gridCol', { 'w:w': String(cw) }));
    tbl.append(grid);
    for (const row of blk.rows) {
      const tr = X.mk(doc, W, 'tr');
      for (const cell of row) {
        const tc = X.mk(doc, W, 'tc');
        const pr = X.mk(doc, W, 'tcPr');
        pr.append(X.mk(doc, W, 'tcW', { 'w:w': String(cw * cell.span), 'w:type': 'dxa' }));
        if (cell.span > 1) pr.append(X.mk(doc, W, 'gridSpan', { 'w:val': String(cell.span) }));
        tc.append(pr);
        const lines = [[]];
        for (const r of cell.runs) { if (r.br) lines.push([]); else lines[lines.length - 1].push(r); }
        for (const ln of lines) { const p = X.mk(doc, W, 'p'); for (const r of ln) p.append(this.makeRun(doc, r, null)); tc.append(p); }
        tr.append(tc);
      }
      tbl.append(tr);
    }
    return tbl;
  },
};
if (typeof module !== 'undefined') module.exports = { OfficeDoc };
