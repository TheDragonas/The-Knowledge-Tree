'use strict';
/* Word-Import wie Word (1.74) – was office-doc.js beim Lesen eines .docx braucht, damit die Seite aussieht wie in Word:
 *
 *  Formatvorlagen:  docDefaults → Absatzvorlage (mit basedOn-Kette) → Zeichenvorlage → direkte Formatierung; daraus
 *                   Schriftgrad, Schriftart (auch Designschriften), Farbe, Hervorhebung, fett/kursiv/…, Abstand vor/nach,
 *                   Zeilenabstand, Einzüge, Ausrichtung, Seitenumbruch oberhalb. Als Inline-Stil am Absatz bzw. Lauf.
 *  Verzeichnis:     Inhaltsverzeichnis (Inhaltssteuerelement oder TOC-Feld) als eigenes, gesperrtes Feld – Einträge mit
 *                   Ebene, Füllpunkten und Seitenzahl; Klick springt zur Überschrift (Textmarke). Die Seitenzahlen
 *                   rechnet die Ansicht neu (tocPages, nach jedem Fluss). Das XML bleibt unverändert.
 *  Bilder:          Grösse aus wp:extent (bzw. VML-Stil), Drehung, Spiegeln, Zuschnitt (a:srcRect) und EXIF-Ausrichtung
 *                   werden in ein neues Bild „eingebrannt“; verankerte Bilder je nach Umbruch als Umfliessen (Float),
 *                   oben/unten (Block) oder vor/hinter dem Text (eigenes Feld an Absatz bzw. Seite).
 *  Textfelder:      wps:txbx bzw. v:textbox (mc:Fallback wird übersprungen) als eigenes Feld mit Rahmen/Füllung an der
 *                   Stelle aus Word; Text im Absatz umfliesst es (unsichtbarer Platzhalter).
 *  Tabellen:        verbundene Zellen (vMerge → rowspan, gridSpan → colspan), Zellschattierung, Breiten. */
const OfficeWI = {
  get W() { return Ooxml.NS.w; }, get A() { return Ooxml.NS.a; }, get R() { return Ooxml.NS.r; },
  get X() { return OfficePages; },
  WP: 'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing',
  V: 'urn:schemas-microsoft-com:vml',
  MC: 'http://schemas.openxmlformats.org/markup-compatibility/2006',
  WPS: 'http://schemas.microsoft.com/office/word/2010/wordprocessingShape',
  PIC: 'http://schemas.openxmlformats.org/drawingml/2006/picture',
  W10: 'urn:schemas-microsoft-com:office:word',

  /* ================================================================ Formatvorlagen */
  async styles(pkg) {
    const X = this.X, W = this.W, A = this.A;
    const S = { map: new Map(), defP: null, defR: null, normal: null, fonts: { minor: 'Calibri', major: 'Calibri Light' }, num: new Map() };
    const rels = await pkg.rels(pkg.main);
    const sr = rels.find(r => /\/styles$/.test(r.type) && pkg.has(r.path));
    if (sr) {
      try {
        const d = await pkg.xml(sr.path), root = d.documentElement;
        const dd = X.kid(root, W, 'docDefaults');
        const rd = dd && X.kid(dd, W, 'rPrDefault'), pd = dd && X.kid(dd, W, 'pPrDefault');
        S.defR = rd && X.kid(rd, W, 'rPr'); S.defP = pd && X.kid(pd, W, 'pPr');
        for (const s of X.kids(root, W, 'style')) {
          const id = X.at(s, W, 'styleId'), type = X.at(s, W, 'type'), nm = X.kid(s, W, 'name'), bo = X.kid(s, W, 'basedOn');
          S.map.set(id, { id, type, name: nm ? X.at(nm, W, 'val') : '', based: bo ? X.at(bo, W, 'val') : '', pPr: X.kid(s, W, 'pPr'), rPr: X.kid(s, W, 'rPr'), tblPr: X.kid(s, W, 'tblPr') });
          if (type === 'paragraph' && /^(1|true)$/.test(X.at(s, W, 'default'))) S.normal = id;
        }
      } catch (e) { /* ohne Formatvorlagen */ }
    }
    const tr = rels.find(r => /\/theme$/.test(r.type) && pkg.has(r.path));
    if (tr) {
      try {
        const d = await pkg.xml(tr.path);
        const lat = (e) => { const l = e && X.kid(e, A, 'latin'); return l && l.getAttribute('typeface'); };
        S.fonts.major = lat(X.q(d, A, 'majorFont')[0]) || S.fonts.major;
        S.fonts.minor = lat(X.q(d, A, 'minorFont')[0]) || S.fonts.minor;
      } catch (e) { /* */ }
    }
    const nr = rels.find(r => /\/numbering$/.test(r.type) && pkg.has(r.path));
    if (nr) {
      try {
        const d = await pkg.xml(nr.path);
        const abs = new Map(X.q(d, W, 'abstractNum').map(a => [X.at(a, W, 'abstractNumId'), a]));
        for (const n of X.kids(d.documentElement, W, 'num')) {
          const a = abs.get(X.at(X.kid(n, W, 'abstractNumId'), W, 'val'));
          if (!a) continue;
          const lv = {};
          for (const l of X.kids(a, W, 'lvl')) { const f = X.kid(l, W, 'numFmt'); lv[X.at(l, W, 'ilvl')] = f ? X.at(f, W, 'val') : 'decimal'; }
          S.num.set(X.at(n, W, 'numId'), lv);
        }
      } catch (e) { /* */ }
    }
    await this.notes(pkg, S);
    return S;
  },
  chain(S, id) {
    const out = [], seen = new Set();
    let s = S.map.get(id);
    while (s && !seen.has(s.id)) { seen.add(s.id); out.unshift(s); s = s.based ? S.map.get(s.based) : null; }
    return out;
  },
  on(e) { return !!e && !/^(0|false|none|off)$/.test(this.X.at(e, this.W, 'val')); },
  n(e, k) { const v = this.X.at(e, this.W, k); return v === '' || isNaN(+v) ? null : +v; },
  mergeP(o, pPr) {
    if (!pPr) return o;
    const X = this.X, W = this.W;
    for (const c of pPr.children) {
      if (c.namespaceURI !== W) continue;
      const k = c.localName;
      if (k === 'jc') o.jc = X.at(c, W, 'val');
      else if (k === 'spacing') {
        for (const a of ['before', 'after', 'line']) { const v = this.n(c, a); if (v != null) o[a] = v; }
        const lr = X.at(c, W, 'lineRule');
        if (lr) o.lineRule = lr; else if (this.n(c, 'line') != null) o.lineRule = 'auto';
        if (/^(1|true|on)$/.test(X.at(c, W, 'beforeAutospacing'))) o.before = 280;
        if (/^(1|true|on)$/.test(X.at(c, W, 'afterAutospacing'))) o.after = 280;
      } else if (k === 'ind') {
        const l = this.n(c, 'left') ?? this.n(c, 'start'); if (l != null) o.left = l;
        const r = this.n(c, 'right') ?? this.n(c, 'end'); if (r != null) o.right = r;
        const f = this.n(c, 'firstLine'); if (f != null) o.first = f;
        const h = this.n(c, 'hanging'); if (h != null) o.first = -h;
      } else if (k === 'pageBreakBefore') o.pbb = this.on(c);
      else if (k === 'keepNext') o.keepNext = this.on(c);
      else if (k === 'shd') { const f = X.at(c, W, 'fill'); if (/^[0-9A-Fa-f]{6}$/.test(f)) o.shd = f.toLowerCase(); else if (f === 'auto') delete o.shd; }
      else if (k === 'outlineLvl') o.outline = this.n(c, 'val');
      else if (k === 'contextualSpacing') o.ctx = this.on(c);
    }
    return o;
  },
  HL: { yellow: 'ffff00', green: '00ff00', cyan: '00ffff', magenta: 'ff00ff', blue: '0000ff', red: 'ff0000', darkBlue: '000080', darkCyan: '008080', darkGreen: '008000', darkMagenta: '800080', darkRed: '800000', darkYellow: '808000', darkGray: '808080', lightGray: 'c0c0c0', black: '000000', white: 'ffffff' },
  mergeR(o, rPr, S) {
    if (!rPr) return o;
    const X = this.X, W = this.W;
    for (const c of rPr.children) {
      if (c.namespaceURI !== W) continue;
      const k = c.localName;
      if (k === 'rFonts') {
        const f = X.at(c, W, 'ascii') || X.at(c, W, 'hAnsi'), th = X.at(c, W, 'asciiTheme') || X.at(c, W, 'hAnsiTheme');
        if (th) o.font = /^major/.test(th) ? S.fonts.major : S.fonts.minor; else if (f) o.font = f;
      } else if (k === 'sz') { const v = this.n(c, 'val'); if (v) o.sz = v / 2; }
      else if (k === 'color') { const v = X.at(c, W, 'val'); if (/^[0-9A-Fa-f]{6}$/.test(v)) o.color = v.toLowerCase(); else if (v === 'auto') delete o.color; }
      else if (k === 'b') o.b = this.on(c);
      else if (k === 'i') o.i = this.on(c);
      else if (k === 'strike' || k === 'dstrike') o.s = this.on(c);
      else if (k === 'u') o.u = X.at(c, W, 'val') !== 'none' && X.at(c, W, 'val') !== '';
      else if (k === 'vertAlign') o.va = X.at(c, W, 'val');
      else if (k === 'highlight') { const v = this.HL[X.at(c, W, 'val')]; if (v) o.bg = v; else delete o.bg; }
      else if (k === 'shd') { const f = X.at(c, W, 'fill'); if (/^[0-9A-Fa-f]{6}$/.test(f) && !o.bg) o.bg = f.toLowerCase(); }
      else if (k === 'vanish') o.hide = this.on(c);
      else if (k === 'caps') o.caps = this.on(c);
    }
    return o;
  },
  /* Absatz → { sid, P (Absatzformat), R (Zeichenformat des Absatzes) } */
  para(S, p) {
    const X = this.X, W = this.W;
    const pPr = X.kid(p, W, 'pPr'), ps = pPr && X.kid(pPr, W, 'pStyle');
    const sid = ps ? X.at(ps, W, 'val') : S.normal;
    const ch = this.chain(S, sid || S.normal);
    const P = this.mergeP({}, S.defP), R = this.mergeR({}, S.defR, S);
    for (const s of ch) { this.mergeP(P, s.pPr); this.mergeR(R, s.rPr, S); }
    this.mergeP(P, pPr);
    return { sid, P, R, name: (ch.length ? ch[ch.length - 1].name : '') || sid || '' };
  },
  run(S, R, r) {
    const X = this.X, W = this.W;
    const pr = X.kid(r, W, 'rPr');
    const o = { ...R };
    const rs = pr && X.kid(pr, W, 'rStyle');
    if (rs) for (const s of this.chain(S, X.at(rs, W, 'val'))) this.mergeR(o, s.rPr, S);
    return this.mergeR(o, pr, S);
  },
  /* Grundschrift des Dokuments (Formatvorlage „Standard“) – Anzeige als CSS-Variable (office-word.js applyDesign) */
  base(S) {
    if (S._base) return S._base;
    const R = this.mergeR({}, S.defR, S);
    for (const s of this.chain(S, S.normal)) this.mergeR(R, s.rPr, S);
    return (S._base = { font: R.font || 'Calibri', sz: R.sz || 11 });
  },

  /* ---------------------------------------------------------------- CSS */
  fontCss(f) {
    const g = /mono|courier|consol/i.test(f) ? 'monospace' : (/times|georgia|garamond|cambria|book|palatino|minion|serif/i.test(f) && !/sans/i.test(f)) ? 'serif' : 'sans-serif';
    // einfache Anführungszeichen: steht im style-Attribut (style="…")
    const extra = /^calibri/i.test(f) ? ', Calibri, Carlito' : /^(arial|helvetica)/i.test(f) ? ", Arial, 'Liberation Sans'" : /^times/i.test(f) ? ", 'Liberation Serif'" : /^cambria/i.test(f) ? ', Caladea' : /^courier/i.test(f) ? ", 'Liberation Mono'" : '';
    return `'${String(f).replace(/["'<>;&\\]/g, '')}'${extra}, ${g}`;
  },
  lineK(f) { return /calibri|carlito|aptos/i.test(f || '') ? 1.22 : 1.15; },
  /* Absatzformat → Inline-Stil (gegenüber der Anzeige: 11 pt, Grundschrift, Abstand 0) */
  pCss(P, R, tag, base, li = false) {
    const css = [], h = /^h\d$/.test(tag);
    const sz = R.sz || 11;
    if (h || Math.abs(sz - 11) > 0.01) css.push(`font-size:${+sz.toFixed(2)}pt`);
    if (R.font && (h || R.font !== base.font)) css.push(`font-family:${this.fontCss(R.font)}`);
    if (R.color) css.push(`color:#${R.color}`);
    if (h) css.push(`font-weight:${R.b ? 'bold' : 'normal'}`); else if (R.b) css.push('font-weight:bold');
    if (R.i) css.push('font-style:italic');
    const tw = (v) => +((v || 0) / 20).toFixed(2);
    if (P.before) css.push(`padding-top:${tw(P.before)}pt`);
    if (P.after) css.push(`padding-bottom:${tw(P.after)}pt`);
    if (P.line) {
      if (P.lineRule === 'exact') css.push(`line-height:${tw(P.line)}pt`);
      else if (P.lineRule === 'atLeast') css.push(`line-height:${+Math.max(tw(P.line), sz * this.lineK(R.font || base.font)).toFixed(2)}pt`);
      else css.push(`line-height:${+(P.line / 240 * this.lineK(R.font || base.font)).toFixed(3)}`);
    }
    if (!li && P.left) css.push(`padding-left:${tw(P.left)}pt`);
    if (P.right) css.push(`padding-right:${tw(P.right)}pt`);
    if (!li && P.first) css.push(`text-indent:${tw(P.first)}pt`);
    const al = { center: 'center', right: 'right', end: 'right', both: 'justify', distribute: 'justify' }[P.jc];
    if (al) css.push(`text-align:${al}`);
    if (P.shd) css.push(`background-color:#${P.shd}`);
    if (P.pbb) css.push('break-before:page');
    return css.join(';');
  },
  /* Lauf: Unterschiede zum Absatz */
  wrapRun(t, o, R) {
    const css = [];
    if (o.sz && Math.abs(o.sz - (R.sz || 11)) > 0.01) css.push(`font-size:${+o.sz.toFixed(2)}pt`);
    if (o.font && o.font !== R.font) css.push(`font-family:${this.fontCss(o.font)}`);
    if (o.color && o.color !== R.color) css.push(`color:#${o.color}`);
    if (o.bg) css.push(`background-color:#${o.bg}`);
    if (!o.b && R.b) css.push('font-weight:normal');
    if (!o.i && R.i) css.push('font-style:normal');
    if (css.length) t = `<span style="${css.join(';')}">${t}</span>`;
    if (o.va === 'superscript') t = `<sup>${t}</sup>`; else if (o.va === 'subscript') t = `<sub>${t}</sub>`;
    if (o.s) t = `<s>${t}</s>`;
    if (o.u && !R.u) t = `<u>${t}</u>`;
    if (o.i && !R.i) t = `<i>${t}</i>`;
    if (o.b && !R.b) t = `<b>${t}</b>`;
    return t;
  },
  /* Läufe eines Absatzes (Felder: nur das Ergebnis; ausgeblendeter Text, Zeichnungen und Fallbacks werden übersprungen) */
  runs(S, R, p, relOf, pics) {
    const X = this.X, W = this.W;
    let s = '';
    const walk = (n) => {
      for (const c of n.children) {
        if (c.namespaceURI === this.MC) continue;   // Textfelder/Bilder: eigene Felder
        if (c.namespaceURI !== W) continue;
        const k = c.localName;
        if (k === 'r') {
          const o = this.run(S, R, c);
          if (o.hide) continue;
          let t = '';
          for (const x of c.children) {
            if (x.namespaceURI !== W) continue;
            if (x.localName === 't') t += escapeHtml(o.caps ? x.textContent.toUpperCase() : x.textContent);
            else if (x.localName === 'tab' || x.localName === 'ptab') t += '&emsp;';
            else if ((x.localName === 'br' && X.at(x, W, 'type') !== 'page' && X.at(x, W, 'type') !== 'column') || x.localName === 'cr') t += '<br>';
            else if (x.localName === 'noBreakHyphen') t += '-';
            else if (x.localName === 'footnoteReference' || x.localName === 'endnoteReference') t += this.noteRef(S, x.localName[0] === 'f' ? 'fn' : 'en', X.at(x, W, 'id'), !o.va);
            else if (x.localName === 'footnoteRef' || x.localName === 'endnoteRef') t += this._noteCur != null ? String(this._noteCur) : '';
            else if (pics && /^(drawing|pict|object)$/.test(x.localName) && pics.has(x)) t += pics.get(x);
          }
          if (pics) for (const ac of c.children) if (ac.namespaceURI === this.MC) { const dr = X.q(ac, W, 'drawing')[0]; if (dr && pics.has(dr)) t += pics.get(dr); }
          if (t) s += this.wrapRun(t, o, R);
        } else if (k === 'hyperlink') {
          const save = s; s = ''; walk(c); const inner = s; s = save;
          const anc = X.at(c, W, 'anchor'), r = relOf(X.at(c, this.R, 'id'));
          if (anc && /^[\w.:-]+$/.test(anc)) s += `<a href="#${escapeHtml(anc)}">${inner}</a>`;
          else s += r && r.mode === 'External' && /^(https?:|mailto:)/i.test(r.target) ? `<a href="${escapeHtml(r.target)}">${inner}</a>` : inner;
        } else if (/^(ins|smartTag|fldSimple|customXml|sdt|sdtContent|moveTo)$/.test(k)) walk(c);
      }
    };
    walk(p);
    return s;
  },

  /* ================================================================ Fuss- und Endnoten (1.75) */
  async notes(pkg, S) {
    const X = this.X, W = this.W;
    S.notes = { fn: new Map(), en: new Map() }; S.noteNo = { fn: new Map(), en: new Map() };
    const rels = await pkg.rels(pkg.main);
    for (const [k, re, tag] of [['fn', /\/footnotes$/, 'footnote'], ['en', /\/endnotes$/, 'endnote']]) {
      const r = rels.find(x => re.test(x.type) && pkg.has(x.path));
      if (!r) continue;
      try { const d = await pkg.xml(r.path); for (const n of X.kids(d.documentElement, W, tag)) if (!X.at(n, W, 'type') || X.at(n, W, 'type') === 'normal') S.notes[k].set(X.at(n, W, 'id'), n); } catch (e) { /* */ }
    }
  },
  ROMAN: ['i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii', 'viii', 'ix', 'x', 'xi', 'xii', 'xiii', 'xiv', 'xv', 'xvi', 'xvii', 'xviii', 'xix', 'xx'],
  noteRef(S, k, id, sup) {
    if (!S || !S.noteNo) return '';
    const m = S.noteNo[k];
    if (!m.has(id)) m.set(id, m.size + 1);
    const n = m.get(id), lab = k === 'en' ? (this.ROMAN[n - 1] || String(n)) : String(n);
    const a = `<a href="#_kt${k}${escapeHtml(id)}">${lab}</a>`;
    return sup ? `<sup>${a}</sup>` : a;
  },
  /* Fussnoten und Endnoten am Ende des Dokuments (wie Word „Endnoten“): Nummer, Text; Klick auf die Nummer im Text springt hierher */
  notesHtml(S, relOf) {
    if (!S || !S.noteNo) return '';
    let html = '';
    for (const [k, head] of [['fn', 'Fussnoten'], ['en', 'Endnoten']]) {
      if (!S.noteNo[k].size) continue;
      html += `<div class="kt-fn-h">${head}</div>`;
      for (const [id, n] of S.noteNo[k]) {
        const el0 = S.notes[k].get(id);
        if (!el0) continue;
        this._noteCur = k === 'en' ? (this.ROMAN[n - 1] || n) : n;
        html += `<div class="kt-fn-e" data-n="${n}">${[...el0.children].map(c => this.blockHtml(S, c, relOf)).join('')}</div>`;
      }
      this._noteCur = null;
    }
    return html ? `<div class="kt-fn">${html}</div>` : '';
  },

  /* ================================================================ Inhaltsverzeichnis */
  /* Knoten i beginnt ein Verzeichnis? → Ende (exklusiv) oder 0 */
  tocRange(nodes, i) {
    const X = this.X, W = this.W, n = nodes[i];
    if (n.namespaceURI !== W) return 0;
    if (n.localName === 'sdt') {
      const pr = X.kid(n, W, 'sdtPr'), g = pr && X.q(pr, W, 'docPartGallery')[0];
      if (g && /table of contents|inhaltsverzeichnis/i.test(X.at(g, W, 'val'))) return i + 1;
      if (X.q(n, W, 'instrText').some(t => /^\s*TOC\b/.test(t.textContent))) return i + 1;
      return 0;
    }
    if (n.localName !== 'p' || !X.q(n, W, 'instrText').some(t => /^\s*TOC\b/.test(t.textContent))) return 0;
    // TOC-Feld über mehrere Absätze: bis zum passenden fldChar end
    let depth = 0, started = false;
    for (let j = i; j < nodes.length; j++) {
      if (nodes[j].localName !== 'p') return started ? j : 0;
      for (const f of X.q(nodes[j], W, 'fldChar')) {
        const t = X.at(f, W, 'fldCharType');
        if (t === 'begin') { depth++; started = true; } else if (t === 'end') { depth--; if (started && depth <= 0) return j + 1; }
      }
    }
    return nodes.length;
  },
  tocEntries(S, paras) {
    const X = this.X, W = this.W, out = [];
    for (const p of paras) {
      const d = this.para(S, p);
      const lvM = /(?:toc|verzeichnis)\s*(\d)/i.exec(d.name) || /^(?:Verzeichnis|TOC)(\d)$/i.exec(d.sid || '');
      let anchor = '';
      const hl = X.q(p, W, 'hyperlink').find(h => X.at(h, W, 'anchor'));
      if (hl) anchor = X.at(hl, W, 'anchor');
      if (!anchor) { const m = X.q(p, W, 'instrText').map(t => /PAGEREF\s+(\S+)/.exec(t.textContent)).find(Boolean); if (m) anchor = m[1]; }
      // sichtbarer Text: Feldergebnisse ja, Feldbefehle nein; der letzte Tabulator trennt die Seitenzahl ab
      let txt = '';
      const walk = (n) => {
        for (const c of n.children) {
          if (c.namespaceURI === this.MC) continue;
          if (c.namespaceURI !== W) continue;
          if (c.localName === 'r') {
            if (this.run(S, d.R, c).hide) continue;
            for (const x of c.children) { if (x.localName === 't') txt += x.textContent; else if (x.localName === 'tab' || x.localName === 'ptab') txt += '\t'; }
          } else if (/^(hyperlink|ins|smartTag|fldSimple|customXml|sdt|sdtContent)$/.test(c.localName)) walk(c);
        }
      };
      walk(p);
      let title = txt, page = '';
      const t = txt.lastIndexOf('\t');
      if (t >= 0) { title = txt.slice(0, t); page = txt.slice(t + 1).trim(); }
      else { const m = /^(.*?)(\s*\d+|\s*[ivxlc]+)$/i.exec(txt); if (m && anchor) { title = m[1]; page = m[2].trim(); } }
      title = title.replace(/\t+/g, ' ').trim();
      if (!title && !page) continue;
      out.push({ lvl: lvM ? +lvM[1] : 0, head: !lvM && !anchor, title, page, anchor, css: this.pCss(d.P, d.R, lvM || anchor ? 'div' : 'h1', this.base(S)) });
    }
    return out;
  },
  tocHtml(list) {
    const rows = list.map(e => {
      if (e.head) return `<div class="kt-toc-h" style="${e.css}">${escapeHtml(e.title)}</div>`;
      const pad = e.lvl > 1 ? `;padding-left:${(e.lvl - 1) * 11}pt` : '';
      const a = e.anchor ? ` href="#${escapeHtml(e.anchor)}"` : '';
      return `<div class="kt-toc-e" style="${e.css.replace(/(^|;)(padding-left|text-indent):[^;]*/g, '')}${pad}"><a class="kt-toc-a"${a}><span class="kt-toc-t">${escapeHtml(e.title)}</span><span class="kt-toc-d"></span><span class="kt-toc-p"${e.anchor ? ` data-bm="${escapeHtml(e.anchor)}"` : ''}>${escapeHtml(e.page)}</span></a></div>`;
    });
    return `<div class="kt-toc">${rows.join('')}</div>`;
  },
  /* Textmarken: Name → Knotenindex (Marke zwischen Absätzen → folgender Knoten) */
  bookmarks(nodes) {
    const X = this.X, W = this.W, bm = {};
    nodes.forEach((n, i) => {
      const own = n.namespaceURI === W && n.localName === 'bookmarkStart' ? [n] : X.q(n, W, 'bookmarkStart');
      for (const b of own) { const nm = X.at(b, W, 'name'); if (nm && !(nm in bm) && nm !== '_GoBack') bm[nm] = n.localName === 'bookmarkStart' ? i + 1 : i; }
    });
    return bm;
  },

  /* ---------------------------------------------------------------- Seitenzahlen und Sprünge (Anzeige) */
  kids(t) { const out = []; for (const c of t.children) { if (/^(UL|OL)$/.test(c.tagName)) out.push(...c.querySelectorAll(':scope > li')); else out.push(c); } return out; },
  /* Ziel einer Textmarke: { el (Absatz bzw. Textbereich), y (Seiten-px) } oder null */
  bmTarget(p, name) {
    const o = p.office, idx = o.bm && o.bm[name];
    if (idx == null || !o.map) return null;
    const seg = o.map.find(m => m.box && !m.fl && m.i0 <= idx && idx < m.i1) || o.map.find(m => m.box && !m.fl && m.i0 >= idx);
    const b = seg && p.boxes.find(q => q.id === seg.box);
    if (!b) return null;
    const e = Canvas.els.get(b.id), t = e && e.querySelector('.box-text');
    if (!t || !b.ox || b.ox.k !== 'w') return { el: t, y: b.y };
    const ks = this.kids(t), j = idx - b.ox.i0, z = Canvas.view.z || 1;
    const c = ks.length === (b.ox.hs || []).length ? ks[j] : null;
    if (!c) return { el: t, y: b.y };
    return { el: c, y: this.effY(p, b.y + (c.getBoundingClientRect().top - e.getBoundingClientRect().top) / z - 13) };
  },
  bmY(p, name) { const t = this.bmTarget(p, name); return t ? t.y : null; },
  /* liegt y in der Lücke zwischen zwei Blättern bzw. im Rand → Beginn des nächsten Inhaltsbereichs */
  effY(p, y) {
    const P = OfficeView.paper(p), G = OfficeView.GAP, top0 = p.office.paperY;
    const k = Math.max(0, Math.floor((y - top0) / (P.H + G)));
    const cBot = top0 + k * (P.H + G) + P.H - P.b;
    return y > cBot + 0.5 ? top0 + (k + 1) * (P.H + G) + P.t : y;
  },
  pageAt(p, y) { const P = OfficeView.paper(p); return Math.max(0, Math.floor((y - p.office.paperY) / (P.H + OfficeView.GAP))) + 1; },
  tocPages(p) {
    if (!p || !p.office || !p.office.bm) return;
    for (const b of p.boxes) {
      if (!b.ox || b.ox.k !== 'wtoc') continue;
      const e = Canvas.els.get(b.id);
      if (!e) continue;
      for (const s of e.querySelectorAll('.kt-toc-p[data-bm]')) {
        const y = this.bmY(p, s.dataset.bm);
        if (y == null) continue;
        const v = String(this.pageAt(p, y));
        if (s.textContent !== v) s.textContent = v;
      }
    }
  },
  /* Klick auf einen Verweis (Inhaltsverzeichnis, „siehe …“) → zur Textmarke */
  jump(name) {
    const p = Canvas.page;
    if (!p || p.type !== 'dok' || !p.office || !p.office.map) return false;
    let y = this.bmY(p, name);
    if (y == null) {   // Verweis ohne Textmarke: gleichnamige Überschrift
      const want = String(name).toLowerCase();
      for (const b of p.boxes) { const t = Canvas.textEl(b.id); const h = t && [...t.querySelectorAll('h1,h2,h3,h4,h5,h6')].find(x => x.textContent.trim().toLowerCase() === want); if (h) { y = b.y + (h.getBoundingClientRect().top - Canvas.els.get(b.id).getBoundingClientRect().top) / (Canvas.view.z || 1) - 13; break; } }
    }
    if (y == null) { UI.toast('Sprungziel nicht gefunden'); return true; }
    const z = Canvas.view.z || 1;
    Canvas.view.y = 40 - (y + 13 - 6) * z;   // y wie b.y, Text 13 px tiefer
    Canvas.applyView();
    return true;
  },

  /* ================================================================ Zeichnungsobjekte (Bilder, Textfelder, Formen) */
  /* Objekte eines Absatzes in Dokumentreihenfolge – ohne mc:Fallback-Doppel und ohne Objekte in Textfeldern */
  objects(n) {
    const X = this.X, W = this.W, out = [];
    const skip = (e) => { for (let a = e.parentNode; a && a !== n; a = a.parentNode) { if (a.localName === 'txbxContent') return true; if (a.namespaceURI === this.MC && a.localName === 'Fallback') return true; } return false; };
    for (const d of X.q(n, W, 'drawing')) if (!skip(d)) { const o = this.dml(d); if (o) out.push(o); }
    for (const pc of [...X.q(n, W, 'pict'), ...X.q(n, W, 'object')]) if (!skip(pc) && !X.q(pc, W, 'drawing').length) { const o = this.vml(pc); if (o) out.push(o); }
    out.sort((a, b) => (a.el.compareDocumentPosition(b.el) & 4) ? -1 : 1);
    return out;
  },
  has(n) { const X = this.X, W = this.W; return X.q(n, W, 'drawing').length > 0 || X.q(n, W, 'pict').length > 0 || X.q(n, W, 'object').length > 0; },
  px(emu) { return (+emu || 0) / 9525; },
  SCHEME: { accent1: '4472c4', accent2: 'ed7d31', accent3: 'a5a5a5', accent4: 'ffc000', accent5: '5b9bd5', accent6: '70ad47', tx1: '000000', dk1: '000000', bg1: 'ffffff', lt1: 'ffffff', tx2: '44546a', dk2: '44546a', bg2: 'e7e6e6', lt2: 'e7e6e6' },
  dmlColor(sf) {
    if (!sf) return null;
    const A = this.A, X = this.X;
    const s = X.kid(sf, A, 'srgbClr'); if (s) return (s.getAttribute('val') || '').toLowerCase() || null;
    const c = X.kid(sf, A, 'schemeClr'); if (c) return this.SCHEME[c.getAttribute('val')] || null;
    const y = X.kid(sf, A, 'sysClr'); if (y) return (y.getAttribute('lastClr') || '').toLowerCase() || null;
    return null;
  },
  dml(d) {
    const X = this.X, W = this.W, A = this.A, WP = this.WP;
    const fr = X.kids(d, WP).find(e => e.localName === 'inline' || e.localName === 'anchor');
    if (!fr) return null;
    const ex = X.kid(fr, WP, 'extent');
    const o = { el: d, inline: fr.localName === 'inline', w: this.px(ex && ex.getAttribute('cx')), h: this.px(ex && ex.getAttribute('cy')), wrap: 'inline' };
    if (!o.inline) {
      const wr = X.kids(fr, WP).find(e => /^wrap/.test(e.localName));
      o.wrap = wr ? ({ wrapSquare: 'square', wrapTight: 'square', wrapThrough: 'square', wrapTopAndBottom: 'tb', wrapNone: 'none' }[wr.localName] || 'none') : 'none';
      o.behind = /^(1|true)$/.test(fr.getAttribute('behindDoc') || '');
      const pos = (e, dflt) => {
        if (!e) return { rel: dflt, off: 0, align: '' };
        const of = X.kid(e, WP, 'posOffset'), al = X.kid(e, WP, 'align');
        return { rel: e.getAttribute('relativeFrom') || dflt, off: of ? this.px(of.textContent) : 0, align: al ? al.textContent.trim() : '' };
      };
      if (fr.getAttribute('simplePos') === '1') { const sp = X.kid(fr, WP, 'simplePos'); o.ph = { rel: 'page', off: this.px(sp && sp.getAttribute('x')), align: '' }; o.pv = { rel: 'page', off: this.px(sp && sp.getAttribute('y')), align: '' }; }
      else { o.ph = pos(X.kid(fr, WP, 'positionH'), 'column'); o.pv = pos(X.kid(fr, WP, 'positionV'), 'paragraph'); }
    }
    const gd = X.q(fr, A, 'graphicData')[0], uri = gd ? gd.getAttribute('uri') || '' : '';
    const pic = gd && X.kid(gd, this.PIC, 'pic');
    const xf = (sp) => { const x = sp && X.kid(sp, A, 'xfrm'); if (x) { o.rot = (+x.getAttribute('rot') || 0) / 60000; o.flipH = x.getAttribute('flipH') === '1'; o.flipV = x.getAttribute('flipV') === '1'; } };
    if (pic) {
      const bl = X.q(pic, A, 'blip')[0];
      o.kind = 'pic'; o.rid = bl ? X.at(bl, this.R, 'embed') : '';
      const sr = X.q(pic, A, 'srcRect')[0];
      if (sr) o.crop = { l: (+sr.getAttribute('l') || 0) / 1e5, t: (+sr.getAttribute('t') || 0) / 1e5, r: (+sr.getAttribute('r') || 0) / 1e5, b: (+sr.getAttribute('b') || 0) / 1e5 };
      xf(X.kid(pic, this.PIC, 'spPr'));
      return o;
    }
    const wsp = gd && X.kid(gd, this.WPS, 'wsp');
    if (wsp) {
      o.kind = 'tb';
      o.txbx = X.q(wsp, W, 'txbxContent')[0] || null;
      const sp = X.kid(wsp, this.WPS, 'spPr'), st = X.kid(wsp, this.WPS, 'style');
      xf(sp);
      const nf = sp && X.kid(sp, A, 'noFill');
      o.fill = nf ? 'none' : this.dmlColor(sp && X.kid(sp, A, 'solidFill')) || (st ? 'ffffff' : 'none');
      const ln = sp && X.kid(sp, A, 'ln');
      o.line = ln && X.kid(ln, A, 'noFill') ? 'none' : this.dmlColor(ln && X.kid(ln, A, 'solidFill')) || (st || ln ? '000000' : 'none');
      return o;
    }
    if (/chart/.test(uri) && typeof OfficeObj !== 'undefined') { const ce = X.q(gd, OfficeObj.C, 'chart')[0]; o.kind = 'chart'; o.cid = ce ? X.at(ce, this.R, 'id') : ''; return o; }
    if (/wordprocessingGroup|wordprocessingCanvas/.test(uri) && gd.firstElementChild && typeof OfficeObj !== 'undefined') { o.kind = 'grp'; o.root = gd.firstElementChild; return o; }
    if (/diagram/.test(uri) && typeof OfficeObj !== 'undefined') { o.kind = 'smart'; o.gd = gd; return o; }
    o.kind = 'ph';
    o.label = /chart/.test(uri) ? 'Diagramm' : /diagram/.test(uri) ? 'SmartArt' : /Group|Canvas/i.test(uri) ? 'Zeichnung' : 'Grafik';
    o.txbxs = X.q(fr, W, 'txbxContent');
    return o;
  },
  cssMap(s) { const m = {}; for (const part of String(s || '').split(';')) { const i = part.indexOf(':'); if (i > 0) m[part.slice(0, i).trim().toLowerCase()] = part.slice(i + 1).trim(); } return m; },
  len(v) {
    const m = /^(-?[\d.]+)\s*(pt|in|cm|mm|px|pc|emu)?$/i.exec(String(v || '').trim());
    if (!m) return 0;
    const n = +m[1];
    return { pt: n * 4 / 3, in: n * 96, cm: n * 96 / 2.54, mm: n * 96 / 25.4, px: n, pc: n * 16, emu: n / 9525 }[(m[2] || 'px').toLowerCase()];
  },
  vmlColor(c) { const m = /#?([0-9a-f]{6})/i.exec(c || ''); if (m) return m[1].toLowerCase(); return { black: '000000', white: 'ffffff', red: 'ff0000', blue: '0000ff', green: '008000', yellow: 'ffff00', gray: '808080' }[String(c || '').split(/\s/)[0]] || null; },
  vml(pc) {
    const X = this.X, W = this.W, V = this.V;
    const sh = [...pc.getElementsByTagNameNS(V, '*')].find(e => /^(shape|rect|roundrect|oval|image)$/.test(e.localName));
    if (!sh) return null;
    const st = this.cssMap(sh.getAttribute('style'));
    const o = { el: pc, w: this.len(st.width), h: this.len(st.height), inline: st.position !== 'absolute', rot: parseFloat(st.rotation) || 0, flipH: /x/.test(st.flip || ''), flipV: /y/.test(st.flip || ''), wrap: 'inline', vml: true };
    if (!o.inline) {
      const wr = X.q(sh, this.W10, 'wrap')[0], ty = wr ? wr.getAttribute('type') : '';
      o.wrap = /^(square|tight|through)$/.test(ty) ? 'square' : ty === 'topAndBottom' ? 'tb' : 'none';
      o.behind = (parseFloat(st['z-index']) || 0) < 0;
      const rh = { text: 'column', char: 'character', margin: 'margin', page: 'page' }[st['mso-position-horizontal-relative']] || 'column';
      const rv = { text: 'paragraph', line: 'line', margin: 'margin', page: 'page' }[st['mso-position-vertical-relative']] || 'paragraph';
      const ah = st['mso-position-horizontal'], av = st['mso-position-vertical'];
      o.ph = { rel: rh, off: this.len(st['margin-left']) + this.len(st.left), align: ah && ah !== 'absolute' ? ah : '' };
      o.pv = { rel: rv, off: this.len(st['margin-top']) + this.len(st.top), align: av && av !== 'absolute' ? av : '' };
    }
    const im = X.q(sh, V, 'imagedata')[0];
    if (im) {
      o.kind = 'pic'; o.rid = X.at(im, this.R, 'id') || X.at(im, this.R, 'pict');
      const fr = (a) => { const v = im.getAttribute(a); if (!v) return 0; return /f$/.test(v) ? parseFloat(v) / 65536 : parseFloat(v) || 0; };
      if (['cropleft', 'croptop', 'cropright', 'cropbottom'].some(a => im.getAttribute(a))) o.crop = { l: fr('cropleft'), t: fr('croptop'), r: fr('cropright'), b: fr('cropbottom') };
      return o;
    }
    const tb = X.q(sh, V, 'textbox')[0];
    if (tb) {
      o.kind = 'tb'; o.txbx = X.q(tb, W, 'txbxContent')[0] || null;
      o.fill = sh.getAttribute('filled') === 'f' ? 'none' : this.vmlColor(sh.getAttribute('fillcolor')) || 'ffffff';
      o.line = sh.getAttribute('stroked') === 'f' ? 'none' : this.vmlColor(sh.getAttribute('strokecolor')) || '000000';
      return o;
    }
    if (!o.w || !o.h || /PowerPlusWaterMark/.test(sh.getAttribute('id') || '')) return null;
    o.kind = 'tb'; o.txbx = null;
    o.fill = sh.getAttribute('filled') === 'f' ? 'none' : this.vmlColor(sh.getAttribute('fillcolor')) || 'none';
    o.line = sh.getAttribute('stroked') === 'f' ? 'none' : this.vmlColor(sh.getAttribute('strokecolor')) || 'none';
    return o;
  },
  /* x relativ zum Textbereich (px) */
  hx(o, P, w) {
    const cw = P.W - P.l - P.r, h = o.ph || { rel: 'column', off: 0, align: '' };
    let base = 0, span = cw;
    if (h.rel === 'page') { base = -P.l; span = P.W; }
    else if (/^(leftMargin|insideMargin)$/.test(h.rel)) { base = -P.l; span = P.l; }
    else if (/^(rightMargin|outsideMargin)$/.test(h.rel)) { base = cw; span = P.r; }
    if (h.align) return base + ({ left: 0, inside: 0, center: (span - w) / 2, right: span - w, outside: span - w }[h.align] ?? 0);
    return base + h.off;
  },
  /* y: { page: true, y } relativ zum Blatt oder { y } relativ zum Absatz */
  vy(o, P, h) {
    const v = o.pv || { rel: 'paragraph', off: 0, align: '' };
    const al = (top, span) => v.align ? top + ({ top: 0, inside: 0, center: (span - h) / 2, bottom: span - h, outside: span - h }[v.align] ?? 0) : top + v.off;
    if (v.rel === 'page') return { page: true, y: al(0, P.H) };
    if (/^(margin|topMargin|insideMargin)$/.test(v.rel)) return { page: true, y: v.rel === 'topMargin' ? al(0, P.t) : al(P.t, P.H - P.t - P.b) };
    if (/^(bottomMargin|outsideMargin)$/.test(v.rel)) return { page: true, y: al(P.H - P.b, P.b) };
    return { page: false, y: v.align ? 0 : v.off };
  },

  /* ---------------------------------------------------------------- Bilder einbrennen */
  TYPES: { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', bmp: 'image/bmp', webp: 'image/webp', svg: 'image/svg+xml' },
  /* f: { w, h (Rahmen in px), rot (Grad), flipH, flipV, crop {l,t,r,b} } → { name, w, h } (w/h = umschliessendes Rechteck) */
  async picture(pkg, path, f) {
    const X = this.X;
    const ext = path.split('.').pop().toLowerCase(), type = this.TYPES[ext];
    if (!type) return null;   // EMF/WMF/TIFF: Platzhalter
    if (!(f.w > 0 && f.h > 0) || ext === 'svg') {
      const m = await X.media(pkg, path);
      if (!m) return null;
      const w = f.w > 0 ? f.w : f.h > 0 ? m.w * f.h / m.h : m.w, h = f.h > 0 ? f.h : m.h * w / m.w;
      return { name: m.name, w, h };
    }
    let blob;
    try { blob = new Blob([await pkg.bytes(path)], { type }); } catch (e) { return null; }
    let raw = null, ori = null;
    try { ori = await createImageBitmap(blob); } catch (e) { /* */ }
    try { raw = await createImageBitmap(blob, { imageOrientation: 'none' }); } catch (e) { /* */ }
    const bm0 = ori || raw;
    if (!bm0) return null;
    const crop = f.crop || {}, cl = (v) => Math.max(0, Math.min(0.99, v || 0));
    // EXIF: Word richtet Fotos meist nach EXIF aus, manche Programme nicht – es gilt die Ausrichtung, die zum Rahmen passt
    let bm = bm0;
    if (raw && ori && (raw.width !== ori.width || raw.height !== ori.height)) {
      const want = f.w / f.h, d = (b) => Math.abs(Math.log((b.width * (1 - cl(crop.l) - cl(crop.r))) / (b.height * (1 - cl(crop.t) - cl(crop.b))) / want));
      bm = d(raw) < d(ori) ? raw : ori;
    }
    const rot = (((f.rot || 0) % 360) + 360) % 360;
    const hasCrop = ['l', 't', 'r', 'b'].some(k => cl(crop[k]) > 0.0005);
    if (!rot && !f.flipH && !f.flipV && !hasCrop && bm === bm0) {
      const m = await X.media(pkg, path);
      return m ? { name: m.name, w: f.w, h: f.h } : null;
    }
    const sx = cl(crop.l) * bm.width, sy = cl(crop.t) * bm.height;
    const sw = bm.width * (1 - cl(crop.l) - cl(crop.r)), sh = bm.height * (1 - cl(crop.t) - cl(crop.b));
    if (sw < 1 || sh < 1) return null;
    const th = rot * Math.PI / 180, c = Math.abs(Math.cos(th)), s = Math.abs(Math.sin(th));
    const BW = f.w * c + f.h * s, BH = f.w * s + f.h * c;
    let k = Math.max(1, Math.min(4, sw / f.w));
    k = Math.min(k, 4096 / Math.max(BW, BH));
    const cv = document.createElement('canvas');
    cv.width = Math.max(1, Math.round(BW * k)); cv.height = Math.max(1, Math.round(BH * k));
    const g = cv.getContext('2d');
    g.imageSmoothingQuality = 'high';
    g.translate(cv.width / 2, cv.height / 2); g.rotate(th); g.scale(f.flipH ? -1 : 1, f.flipV ? -1 : 1);
    g.drawImage(bm, sx, sy, sw, sh, -f.w * k / 2, -f.h * k / 2, f.w * k, f.h * k);
    const jpg = /^jpe?g$/.test(ext) && rot % 90 === 0;
    let out = await new Promise(r => cv.toBlob(r, jpg ? 'image/jpeg' : 'image/png', 0.92));
    if (!out) return null;
    if (!jpg && typeof ImgPack !== 'undefined') out = await ImgPack.lossless(out);
    return { name: await Backend.saveImage(out), w: BW, h: BH };
  },

  /* ---------------------------------------------------------------- Absatz mit Objekten → Felder
     c: { S, relOf, P (Papier px), y, PLAIN, XX, cw, html } → [{ i0, i1, box, fl? }] (erstes = Absatzfeld) */
  async objPara(pkg, p, n, i, c) {
    const X = this.X, P = c.P, cw = c.cw;
    const objs = this.objects(n);
    const floats = [], over = [], after = [];
    let iy = 0;
    const al = (() => { const d = this.para(c.S, n); return d.P.jc; })();
    const clear = async () => p.office.clear || (p.office.clear = await X.solid('rgba(0,0,0,0)'));
    for (const o of objs) {
      if (!(o.w > 0) && !(o.h > 0) && o.kind !== 'pic') continue;
      if (o.kind === 'pic') {
        const r = o.rid && c.relOf(o.rid);
        const pic = r && r.path && pkg.has(r.path) ? await this.picture(pkg, r.path, o) : null;
        let w = pic ? pic.w : (o.w || 200), h = pic ? pic.h : (o.h || 120);
        if (w > cw && (o.inline || o.wrap !== 'none')) { h = h * cw / w; w = cw; }   // nicht breiter als der Textbereich
        const im = { id: uid('i'), src: pic ? pic.name : await clear(), x: 0, y: 0, w: Math.round(w), h: Math.round(h) };
        if (!pic) im.miss = true;
        if (o.inline) {
          im.x = Math.round(al === 'center' ? (cw - w) / 2 : al === 'right' || al === 'end' ? cw - w : 0);
          im.y = iy; iy += im.h + 4;
          floats.push(im);
        } else if (o.wrap === 'none') over.push({ o, im });
        else {
          im.x = Math.round(Math.max(0, Math.min(cw - w, this.hx(o, P, w))));
          const v = this.vy(o, P, h);
          im.y = v.page ? 0 : Math.max(0, Math.round(v.y));
          if (o.wrap === 'tb') im.blk = true;
          floats.push(im);
        }
        continue;
      }
      // Textfeld, Form, Diagramm, Gruppe, SmartArt (1.75)
      if (o.inline) { after.push({ o }); continue; }
      const x = this.hx(o, P, o.w), v = this.vy(o, P, o.h);
      if (o.wrap === 'square' || o.wrap === 'tb') {
        // unsichtbarer Platzhalter, damit der Absatztext das Textfeld umfliesst
        floats.push({ id: uid('i'), src: await clear(), x: Math.round(Math.max(0, Math.min(cw - o.w, x))), y: v.page ? 0 : Math.max(0, Math.round(v.y)), w: Math.round(Math.min(cw, o.w)), h: Math.round(o.h), ghost: true, ...(o.wrap === 'tb' ? { blk: true } : {}) });
      }
      over.push({ o, x, v });
    }
    // Feld für ein Objekt ohne Bild: Diagramm (Chart), Gruppe/Zeichenbereich/SmartArt (rohes HTML), Textfeld/Form
    const make = async (o, x, y, ox) => {
      if (o.kind === 'chart') {
        const r = o.cid && c.relOf(o.cid), spec = r && r.path && pkg.has(r.path) ? await OfficeObj.chart(pkg, r.path) : null;
        if (spec) return OfficeObj.chartBox(spec, x, y, Math.max(140, o.w - 14), Math.max(120, o.h - 22), { ox });
      }
      if (o.kind === 'grp' || o.kind === 'smart') {
        const html = o.kind === 'grp'
          ? await OfficeObj.groupHtml(o.root, o.w, o.h, { pic: (rid, f) => { const r = c.relOf(rid); return r && r.path && pkg.has(r.path) ? this.picture(pkg, r.path, f) : null; }, wText: (tx) => [...tx.children].map(k => this.blockHtml(c.S, k, c.relOf)).join('') })
          : await OfficeObj.smartArtHtml(pkg, o.gd, c.rels || [], o.w, o.h);
        if (html) return X.addBox(x, y, o.w + 22, html, { raw: true, office: null, style: { bg: 'transparent', under: c.PLAIN.under }, ox });
      }
      if (o.kind === 'chart' || o.kind === 'grp' || o.kind === 'smart') o = { ...o, kind: 'ph', label: { chart: 'Diagramm', grp: 'Zeichnung', smart: 'SmartArt' }[o.kind], fill: 'f3f3f3', line: 'dddddd' };
      // Textfeld: Höhe wie in Word (mindestens), Inhalt formatiert
      const html = `<div class="kt-tbx" style="min-height:${Math.max(0, Math.round(o.h - 30))}px">${this.boxHtml(c.S, o, c.relOf)}</div>`;
      return X.addBox(x, y, Math.max(40, o.w), html, { raw: true, office: null, style: this.tbStyle(o, c.PLAIN), ox });
    };
    const segs = [];
    const b = X.addBox(c.XX, c.y, cw + 22, c.html || '', { images: floats, office: null, style: { ...c.PLAIN }, ox: { k: 'wimg', i0: i, i1: i + 1 } });
    if (!floats.length && !(c.html || '').replace(/<[^>]+>/g, '').trim()) b.html = '<div><br></div>';
    segs.push({ i0: i, i1: i + 1, box: b.id });
    for (const a of after) {
      const t = await make(a.o, c.XX, c.y, { k: 'wfb', of: b.id });
      segs.push({ i0: i + 1, i1: i + 1, box: t.id });
    }
    for (const v of over) {
      const o = v.o;
      let nb;
      if (v.im) {
        const x = this.hx(o, P, v.im.w), vy = this.vy(o, P, v.im.h);
        v.im.x = 0; v.im.y = 0;
        nb = X.addBox(c.XX, c.y, v.im.w + 22, '', { images: [v.im], office: null, style: { bg: 'transparent', under: c.PLAIN.under }, ox: { k: 'wfl', of: b.id, rx: Math.round(x) - 11, ry: Math.round(vy.y) - 13, pg: vy.page, pic: true } });
      } else nb = await make(o, c.XX, c.y, { k: 'wfl', of: b.id, rx: Math.round(v.x), ry: Math.round(v.v.y), pg: v.v.page });
      if (o.behind) nb.z = 1; else nb.front = true;
      segs.push({ i0: i + 1, i1: i + 1, box: nb.id, fl: true });
    }
    return segs;
  },
  tbStyle(o, PLAIN) {
    const fill = o.fill && o.fill !== 'none' ? '#' + o.fill : 'transparent';
    return { bg: fill, under: fill !== 'transparent' ? fill : PLAIN.under, border: o.line && o.line !== 'none' ? '#' + o.line : 'transparent' };
  },
  boxHtml(S, o, relOf) {
    const list = o.txbx ? [o.txbx] : o.txbxs || [];
    let html = '';
    for (const tx of list) for (const n of tx.children) html += this.blockHtml(S, n, relOf);
    if (!html && o.kind === 'ph') html = `<div style="color:#8a8a8a;text-align:center">${escapeHtml(o.label)} – nur in Word sichtbar</div>`;
    return html || '<div><br></div>';
  },
  /* Absatz/Tabelle im Textfeld bzw. Inhaltssteuerelement → HTML (nur Text) */
  blockHtml(S, n, relOf) {
    const W = this.W;
    if (n.namespaceURI !== W) return '';
    if (n.localName === 'p') { const d = this.para(S, n); const tag = this.tag(S, d); const inner = this.runs(S, d.R, n, relOf); return `<${tag} style="${this.pCss(d.P, d.R, tag, this.base(S))}">${inner || '<br>'}</${tag}>`; }
    if (n.localName === 'tbl') return this.tableHtml(S, n, relOf);
    if (n.localName === 'sdt') { const c = this.X.kid(n, W, 'sdtContent'); return c ? [...c.children].map(k => this.blockHtml(S, k, relOf)).join('') : ''; }
    return '';
  },
  tag(S, d) {
    const nm = (d.name || '').toLowerCase();
    const m = /^(heading|überschrift|berschrift)\s*(\d)/.exec(nm) || /^(heading|berschrift)(\d)$/i.exec(d.sid || '');
    if (m) return 'h' + Math.min(6, +m[2]);
    if (/^(title|titel)$/.test(nm)) return 'h1';
    return 'div';
  },
  /* Tabelle: verbundene Zellen, Schattierung, Breiten */
  tableHtml(S, n, relOf, pics) {
    const X = this.X, W = this.W;
    const rows = X.kids(n, W, 'tr');
    const grid = X.q(X.kid(n, W, 'tblGrid'), W, 'gridCol').map(g => this.n(g, 'w') || 0);
    const tw = grid.reduce((a, b) => a + b, 0);
    // vMerge: Zeilen je Spaltenposition zählen
    const cells = rows.map(tr => { let col = 0; return X.kids(tr, W, 'tc').map(tc => { const pr = X.kid(tc, W, 'tcPr'), gs = pr && X.kid(pr, W, 'gridSpan'), vm = pr && X.kid(pr, W, 'vMerge'); const span = gs ? Math.max(1, this.n(gs, 'val') || 1) : 1; const o = { tc, pr, col, span, vm: vm ? (X.at(vm, W, 'val') === 'restart' ? 'r' : 'c') : '', rows: 1 }; col += span; return o; }); });
    cells.forEach((row, r) => row.forEach(c => {
      if (c.vm !== 'r') return;
      for (let k = r + 1; k < cells.length; k++) { const d = cells[k].find(x => x.col === c.col); if (d && d.vm === 'c') { c.rows++; d.skip = true; } else break; }
    }));
    const tblPr = X.kid(n, W, 'tblPr'), tw0 = tblPr && X.kid(tblPr, W, 'tblW');
    const width = tw0 && X.at(tw0, W, 'type') === 'dxa' && this.n(tw0, 'w') ? this.n(tw0, 'w') : tw0 && X.at(tw0, W, 'type') === 'pct' ? null : tw;
    let s = `<table style="border-collapse:collapse${width ? `;width:${+(width / 20).toFixed(1)}pt` : ''}">`;
    for (const row of cells) {
      s += '<tr>';
      for (const c of row) {
        if (c.skip) continue;
        const shd = c.pr && X.kid(c.pr, W, 'shd'), fill = shd && X.at(shd, W, 'fill');
        const w = c.pr && X.kid(c.pr, W, 'tcW');
        const cwd = w && X.at(w, W, 'type') === 'dxa' && this.n(w, 'w') ? this.n(w, 'w') : grid.slice(c.col, c.col + c.span).reduce((a, b) => a + b, 0);
        const css = [];
        if (/^[0-9A-Fa-f]{6}$/.test(fill || '')) css.push(`background-color:#${fill.toLowerCase()}`);
        if (cwd) css.push(`width:${+(cwd / 20).toFixed(1)}pt`);
        const lines = X.kids(c.tc, W, 'p').map(p => { const d = this.para(S, p); return this.runs(S, d.R, p, relOf, pics); });
        s += `<td${c.span > 1 ? ` colspan="${c.span}"` : ''}${c.rows > 1 ? ` rowspan="${c.rows}"` : ''}${css.length ? ` style="${css.join(';')}"` : ''}>${lines.join('<br>') || '<br>'}</td>`;
      }
      s += '</tr>';
    }
    return s + '</table>';
  },
};
if (typeof module !== 'undefined') module.exports = { OfficeWI };
