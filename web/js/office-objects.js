'use strict';
/* Zeichnungsobjekte aus Office-Dateien (1.75) – gemeinsam für Word, PowerPoint und Excel:
 *  Diagramme:   chartN.xml (c:chartSpace) → KnowledgeTree-Diagramm (Chart, b.chart) mit den Werten aus dem Cache der
 *               Datei: Säulen/Balken (gruppiert/gestapelt), Linie, Fläche, Kreis, Ring, Punkte; Titel, Legende,
 *               Datenbeschriftungen. In Excel mit Bezug auf das Blatt (live), wenn die Reihen einen Block bilden.
 *  Gruppen:     wpg:wgp / Zeichenbereich (wpc) / SmartArt (Zeichnung dsp aus dem Datenmodell) → ein Feld mit den
 *               Formen an ihrer Stelle (Füllung, Rahmen, Text, Bilder; rohes HTML, gesperrt).
 * Die Datei bleibt dabei unverändert: die Felder sind Anzeige (gesperrt bzw. ohne Rückschreiben). */
const OfficeObj = {
  C: 'http://schemas.openxmlformats.org/drawingml/2006/chart',
  get A() { return Ooxml.NS.a; }, get R() { return Ooxml.NS.r; }, get X() { return OfficePages; },
  DSP: 'http://schemas.microsoft.com/office/drawing/2008/diagram',
  /* ---------------------------------------------------------------- Diagramme */
  TYPES: { barChart: 'col', bar3DChart: 'col', lineChart: 'line', line3DChart: 'line', stockChart: 'line', radarChart: 'line', areaChart: 'area', area3DChart: 'area', pieChart: 'pie', pie3DChart: 'pie', ofPieChart: 'pie', doughnutChart: 'doughnut', scatterChart: 'scatter', bubbleChart: 'scatter' },
  async chart(pkg, path) {
    const X = this.X, C = this.C, A = this.A;
    let d;
    try { d = await pkg.xml(path); } catch (e) { return null; }
    const ch = X.q(d, C, 'chart')[0];
    if (!ch) return null;
    const pa = X.kid(ch, C, 'plotArea');
    const te = pa && [...pa.children].find(e => e.namespaceURI === C && this.TYPES[e.localName]);
    if (!te) return null;
    let type = this.TYPES[te.localName];
    const bd = X.kid(te, C, 'barDir');
    if (type === 'col' && bd && bd.getAttribute('val') === 'bar') type = 'bar';
    const gr = X.kid(te, C, 'grouping');
    const stacked = !!gr && /stacked/i.test(gr.getAttribute('val') || '');
    const pts = (e) => {   // Cache → Werte nach idx
      if (!e) return [];
      const cache = X.q(e, C, 'numCache')[0] || X.q(e, C, 'strCache')[0] || X.q(e, C, 'lvl')[0];
      if (!cache) { const v = X.kid(e, C, 'v'); return v ? [v.textContent] : []; }
      const pc = X.kid(cache, C, 'ptCount'), n = pc ? +pc.getAttribute('val') || 0 : 0;
      const out = Array(n).fill(null);
      for (const p of X.kids(cache, C, 'pt')) { const v = X.kid(p, C, 'v'); out[+p.getAttribute('idx') || 0] = v ? v.textContent : null; }
      return out;
    };
    const ref = (e) => { const f = e && X.q(e, C, 'f')[0]; return f ? f.textContent.trim() : ''; };
    const series = [], refs = [];
    let cats = [];
    for (const s of X.kids(te, C, 'ser')) {
      const tx = X.kid(s, C, 'tx');
      const name = (pts(tx)[0] || '') + '';
      const cat = X.kid(s, C, 'cat') || X.kid(s, C, 'xVal'), val = X.kid(s, C, 'val') || X.kid(s, C, 'yVal');
      const cv = pts(cat).map(v => v == null ? '' : String(v));
      if (cv.length > cats.length) cats = cv;
      const vals = pts(val).map(v => v == null || v === '' || isNaN(+v) ? null : +v);
      const o = { name: name || `Reihe ${series.length + 1}`, vals };
      if (type === 'scatter') o.xs = cv.map(v => v === '' || isNaN(+v) ? null : +v);
      series.push(o);
      refs.push({ tx: ref(tx), cat: ref(cat), val: ref(val) });
    }
    if (!series.length) return null;
    const n = Math.max(cats.length, ...series.map(s => s.vals.length));
    if (cats.length < n) cats = cats.concat(Array.from({ length: n - cats.length }, (_, i) => String(cats.length + i + 1)));
    for (const s of series) while (s.vals.length < n) s.vals.push(null);
    const title = X.kid(ch, C, 'title'), adt = X.kid(ch, C, 'autoTitleDeleted');
    let tt = title ? X.q(title, A, 't').map(t => t.textContent).join('') : '';
    if (title && !tt && !(adt && adt.getAttribute('val') === '1') && series.length === 1) tt = series[0].name;
    const lg = X.kid(ch, C, 'legend'), lp = lg && X.kid(lg, C, 'legendPos');
    const legend = !lg ? 'none' : ({ b: 'b', t: 't', r: 'r', l: 'r', tr: 'r' }[lp ? lp.getAttribute('val') : 'r'] || 'r');
    const dl = X.q(te, C, 'showVal').some(e => e.getAttribute('val') === '1') || X.q(te, C, 'showPercent').some(e => e.getAttribute('val') === '1');
    const axTitle = (tag) => { const ax = X.kids(pa, C, tag); const t = ax.map(a => X.kid(a, C, 'title')).find(Boolean); return t ? X.q(t, A, 't').map(x => x.textContent).join('') : ''; };
    return { type, stacked, title: tt, legend, labels: dl, cats, series, xy: type === 'scatter', refs, xTitle: axTitle('catAx') || axTitle('dateAx'), yTitle: axTitle('valAx') };
  },
  /* Diagramm-Feld (w, h = Grösse des Diagramms in px) */
  chartBox(spec, x, y, w, h, extra = {}) {
    const c = Chart.norm({ type: spec.type, title: spec.title, legend: spec.legend, labels: spec.labels, stacked: spec.stacked, xTitle: spec.xTitle || '', yTitle: spec.yTitle || '', h: Math.round(Math.max(120, h)), src: spec.src || null, cache: { cats: spec.cats, series: spec.series.map(s => ({ name: s.name, vals: s.vals, ...(s.xs ? { xs: s.xs } : {}) })), xy: !!spec.xy } });
    const b = { id: uid('b'), x: Math.round(x), y: Math.round(y), w: Math.round(Math.max(140, w) + 2 * BORDER + 12), html: '', images: [], z: Canvas.maxZ() + 1, style: { bg: 'transparent', border: 'transparent' }, locked: true, pkg: null, office: null, chart: c, ...extra };
    Canvas.page.boxes.push(b);
    return b;
  },
  /* Excel: Reihen als zusammenhängender Block eines Blattes? → { name, range, byRow } */
  srcOf(spec) {
    const R = spec.refs || [];
    if (!R.length || R.some(r => !r.val)) return null;
    const parse = (f) => { const m = /^(?:'?(.+?)'?!)?\$?([A-Z]+)\$?(\d+)(?::\$?([A-Z]+)\$?(\d+))?$/.exec(f.replace(/''/g, "'")); if (!m) return null; const cn = (s) => [...s].reduce((a, ch) => a * 26 + ch.charCodeAt(0) - 64, 0) - 1; return { sh: m[1] || '', c1: cn(m[2]), r1: +m[3] - 1, c2: cn(m[4] || m[2]), r2: +(m[5] || m[3]) - 1 }; };
    const vs = R.map(r => parse(r.val)), cs = R[0].cat ? parse(R[0].cat) : null;
    if (vs.some(v => !v) || vs.some(v => v.sh !== vs[0].sh)) return null;
    const col = vs.every(v => v.c1 === v.c2 && v.r1 === vs[0].r1 && v.r2 === vs[0].r2);
    const row = vs.every(v => v.r1 === v.r2 && v.c1 === vs[0].c1 && v.c2 === vs[0].c2);
    const L = (c) => { let s = ''; c++; while (c > 0) { const m = (c - 1) % 26; s = String.fromCharCode(65 + m) + s; c = Math.floor((c - 1) / 26); } return s; };
    if (col) {
      const cMin = Math.min(...vs.map(v => v.c1)), cMax = Math.max(...vs.map(v => v.c1));
      if (cMax - cMin + 1 !== vs.length) return null;
      const c0 = cs && cs.c1 === cMin - 1 ? cs.c1 : cMin, r0 = Math.max(0, vs[0].r1 - (R[0].tx ? 1 : 0));
      return { name: vs[0].sh, range: `${L(c0)}${r0 + 1}:${L(cMax)}${vs[0].r2 + 1}`, byRow: false };
    }
    if (row) {
      const rMin = Math.min(...vs.map(v => v.r1)), rMax = Math.max(...vs.map(v => v.r1));
      if (rMax - rMin + 1 !== vs.length) return null;
      const r0 = cs && cs.r1 === rMin - 1 ? cs.r1 : rMin, c0 = Math.max(0, vs[0].c1 - (R[0].tx ? 1 : 0));
      return { name: vs[0].sh, range: `${L(c0)}${r0 + 1}:${L(vs[0].c2)}${rMax + 1}`, byRow: true };
    }
    return null;
  },

  /* ---------------------------------------------------------------- Formen, Gruppen, SmartArt → rohes HTML */
  SCHEME: { accent1: '4472c4', accent2: 'ed7d31', accent3: 'a5a5a5', accent4: 'ffc000', accent5: '5b9bd5', accent6: '70ad47', tx1: '000000', dk1: '000000', bg1: 'ffffff', lt1: 'ffffff', tx2: '44546a', dk2: '44546a', bg2: 'e7e6e6', lt2: 'e7e6e6' },
  color(e) {
    if (!e) return null;
    const X = this.X, A = this.A;
    const s = X.kid(e, A, 'srgbClr') || X.kid(e, A, 'schemeClr') || X.kid(e, A, 'sysClr') || X.kid(e, A, 'prstClr');
    if (!s) return null;
    let hex = s.localName === 'srgbClr' ? s.getAttribute('val') : s.localName === 'sysClr' ? s.getAttribute('lastClr') : s.localName === 'schemeClr' ? this.SCHEME[s.getAttribute('val')] : { black: '000000', white: 'ffffff', red: 'ff0000', blue: '0000ff' }[s.getAttribute('val')];
    if (!hex || !/^[0-9a-f]{6}$/i.test(hex)) return null;
    // lumMod/lumOff (heller/dunkler wie Office)
    let [r, g, b] = [0, 2, 4].map(i => parseInt(hex.slice(i, i + 2), 16));
    const lm = X.kid(s, A, 'lumMod'), lo = X.kid(s, A, 'lumOff'), tint = X.kid(s, A, 'tint'), shade = X.kid(s, A, 'shade');
    if (lm || lo) { const m = lm ? +lm.getAttribute('val') / 1e5 : 1, o = lo ? +lo.getAttribute('val') / 1e5 : 0; [r, g, b] = [r, g, b].map(v => Math.round(Math.min(255, Math.max(0, (v / 255 * m + o) * 255)))); }
    if (tint) { const t = +tint.getAttribute('val') / 1e5; [r, g, b] = [r, g, b].map(v => Math.round(255 - (255 - v) * t)); }
    if (shade) { const t = +shade.getAttribute('val') / 1e5; [r, g, b] = [r, g, b].map(v => Math.round(v * t)); }
    return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
  },
  /* spPr (+ Stil) → { fill, line, lw, round, rot } */
  look(spPr, style) {
    const X = this.X, A = this.A;
    const o = { fill: null, line: null, lw: 1, round: false, rot: 0, geom: '' };
    if (spPr) {
      if (X.kid(spPr, A, 'noFill')) o.fill = 'transparent'; else o.fill = this.color(X.kid(spPr, A, 'solidFill')) || (X.kid(spPr, A, 'gradFill') ? this.color(X.q(X.kid(spPr, A, 'gradFill'), A, 'gs')[0]) : null);
      const ln = X.kid(spPr, A, 'ln');
      if (ln) { o.line = X.kid(ln, A, 'noFill') ? 'transparent' : this.color(X.kid(ln, A, 'solidFill')); o.lw = Math.max(0.5, (+ln.getAttribute('w') || 9525) / 9525); }
      const pg = X.kid(spPr, A, 'prstGeom'); o.geom = pg ? pg.getAttribute('prst') || '' : '';
      const xf = X.kid(spPr, A, 'xfrm'); if (xf) o.rot = (+xf.getAttribute('rot') || 0) / 60000;
    }
    if (style) {
      if (o.fill == null) { const fr = X.kid(style, A, 'fillRef'); if (fr && fr.getAttribute('idx') !== '0') o.fill = this.color(fr); }
      if (o.line == null) { const lr = X.kid(style, A, 'lnRef'); if (lr && lr.getAttribute('idx') !== '0') o.line = this.color(lr); }
    }
    o.round = /^(ellipse|oval|flowChartConnector|donut)$/i.test(o.geom);
    return o;
  },
  /* Text einer Form (a:txBody bzw. Word-Textfeld als vorbereitetes HTML) */
  txHtml(tx) {
    if (!tx) return '';
    const X = this.X, A = this.A;
    return X.kids(tx, A, 'p').map(p => {
      const pPr = X.kid(p, A, 'pPr'), al = pPr && pPr.getAttribute('algn');
      const runs = X.kids(p, A).filter(r => r.localName === 'r' || r.localName === 'fld' || r.localName === 'br').map(r => {
        if (r.localName === 'br') return '<br>';
        const t = escapeHtml((X.kid(r, A, 't') || {}).textContent || ''), rp = X.kid(r, A, 'rPr');
        const css = [];
        if (rp) { const sz = +rp.getAttribute('sz'); if (sz) css.push(`font-size:${sz / 100}pt`); if (rp.getAttribute('b') === '1') css.push('font-weight:bold'); if (rp.getAttribute('i') === '1') css.push('font-style:italic'); const c = this.color(X.kid(rp, A, 'solidFill')); if (c) css.push(`color:${c}`); }
        return css.length ? `<span style="${css.join(';')}">${t}</span>` : t;
      }).join('');
      return `<div style="text-align:${{ ctr: 'center', r: 'right', just: 'justify' }[al] || 'inherit'}">${runs || '&nbsp;'}</div>`;
    }).join('');
  },
  frame(x, y, w, h, lk, inner, extra = '') {
    const css = [`left:${x.toFixed(1)}px`, `top:${y.toFixed(1)}px`, `width:${Math.max(1, w).toFixed(1)}px`, `height:${Math.max(1, h).toFixed(1)}px`];
    if (lk.fill && lk.fill !== 'transparent') css.push(`background:${lk.fill}`);
    if (lk.line && lk.line !== 'transparent') css.push(`border:${Math.max(1, Math.round(lk.lw))}px solid ${lk.line}`);
    if (lk.round) css.push('border-radius:50%'); else if (/roundRect/.test(lk.geom)) css.push('border-radius:12%');
    if (lk.rot) css.push(`transform:rotate(${lk.rot}deg)`);
    return `<div class="kt-shp" style="${css.join(';')}${extra}">${inner}</div>`;
  },
  /* Gruppe/Zeichenbereich (DrawingML): Kinder an ihrer Stelle; pic(rid, w, h, xfrm) → Bildname (async) */
  async groupHtml(root, W, H, ctx) {
    const X = this.X, A = this.A;
    const parts = [];
    const walk = async (g, T) => {
      for (const c of g.children) {
        const ln = c.localName;
        if (/^(grpSpPr|cNvGrpSpPr|cNvPr|nvGrpSpPr|whole|bg)$/.test(ln)) continue;
        const sp = [...c.children].find(k => /^(spPr|grpSpPr)$/.test(k.localName));
        const xf = sp && X.kid(sp, A, 'xfrm');
        const off = xf && X.kid(xf, A, 'off'), ext = xf && X.kid(xf, A, 'ext');
        if (!off || !ext) continue;
        const x = T.x + (+off.getAttribute('x') - T.cx) * T.sx, y = T.y + (+off.getAttribute('y') - T.cy) * T.sy;
        const w = +ext.getAttribute('cx') * T.sx, h = +ext.getAttribute('cy') * T.sy;
        if (ln === 'grpSp') {
          const co = X.kid(xf, A, 'chOff'), ce = X.kid(xf, A, 'chExt');
          const cw = ce ? +ce.getAttribute('cx') || 1 : +ext.getAttribute('cx') || 1, chh = ce ? +ce.getAttribute('cy') || 1 : +ext.getAttribute('cy') || 1;
          await walk(c, { x, y, sx: w / cw, sy: h / chh, cx: co ? +co.getAttribute('x') : +off.getAttribute('x'), cy: co ? +co.getAttribute('y') : +off.getAttribute('y') });
          continue;
        }
        const px = (v) => v / 9525;
        if (ln === 'pic') {
          const bl = X.q(c, A, 'blip')[0], sr = X.q(c, A, 'srcRect')[0];
          const im = bl && ctx.pic ? await ctx.pic(X.at(bl, this.R, 'embed'), { w: px(w), h: px(h), rot: (+xf.getAttribute('rot') || 0) / 60000, flipH: xf.getAttribute('flipH') === '1', flipV: xf.getAttribute('flipV') === '1', crop: sr ? { l: +sr.getAttribute('l') / 1e5 || 0, t: +sr.getAttribute('t') / 1e5 || 0, r: +sr.getAttribute('r') / 1e5 || 0, b: +sr.getAttribute('b') / 1e5 || 0 } : null }) : null;
          if (im) parts.push(`<img data-kt-src="${escapeHtml(im.name)}" alt="" style="position:absolute;left:${(px(x) - (im.w - px(w)) / 2).toFixed(1)}px;top:${(px(y) - (im.h - px(h)) / 2).toFixed(1)}px;width:${im.w.toFixed(1)}px;height:${im.h.toFixed(1)}px">`);
          continue;
        }
        // Form / Textfeld (wps:wsp, p:sp, dsp:sp)
        const style = [...c.children].find(k => k.localName === 'style');
        const lk = this.look(sp, style);
        const wtx = X.q(c, Ooxml.NS.w, 'txbxContent')[0];
        const atx = [...c.children].find(k => k.localName === 'txBody') || X.q(c, A, 'txBody')[0];
        const inner = wtx && ctx.wText ? ctx.wText(wtx) : this.txHtml(atx);
        if (!inner && (!lk.fill || lk.fill === 'transparent') && (!lk.line || lk.line === 'transparent')) continue;
        parts.push(this.frame(px(x), px(y), px(w), px(h), lk, inner ? `<div class="kt-shp-t">${inner}</div>` : ''));
      }
    };
    const gsp = [...root.children].find(k => k.localName === 'grpSpPr'), gx = gsp && X.kid(gsp, A, 'xfrm');
    const co = gx && X.kid(gx, A, 'chOff'), ce = gx && X.kid(gx, A, 'chExt'), ex = gx && X.kid(gx, A, 'ext');
    const cw = (ce && +ce.getAttribute('cx')) || (ex && +ex.getAttribute('cx')) || W * 9525, chh = (ce && +ce.getAttribute('cy')) || (ex && +ex.getAttribute('cy')) || H * 9525;
    await walk(root, { x: 0, y: 0, sx: (W * 9525) / (cw || 1), sy: (H * 9525) / (chh || 1), cx: co ? +co.getAttribute('x') : 0, cy: co ? +co.getAttribute('y') : 0 });
    return `<div class="kt-grp" style="position:relative;width:${W.toFixed(1)}px;height:${H.toFixed(1)}px">${parts.join('')}</div>`;
  },
  /* SmartArt: die von Office gespeicherte Zeichnung (diagrams/drawingN.xml) – rels: Beziehungen des Teils mit dgm:relIds */
  async smartArtHtml(pkg, gd, rels, W, H) {
    const X = this.X;
    const ids = X.q(gd, 'http://schemas.openxmlformats.org/drawingml/2006/diagram', 'relIds')[0];
    if (!ids) return '';
    const dm = rels.find(r => r.id === X.at(ids, this.R, 'dm'));
    let drawing = null;
    try {
      if (dm && pkg.has(dm.path)) {
        const d = await pkg.xml(dm.path);
        const ext = X.q(d, this.DSP, 'dataModelExt')[0], rid = ext && ext.getAttribute('relId');
        const r = rid && rels.find(x => x.id === rid);
        if (r && pkg.has(r.path)) drawing = await pkg.xml(r.path);
        // Text als Liste, falls keine Zeichnung gespeichert ist
        if (!drawing) {
          const txt = X.q(d, this.A, 't').map(t => escapeHtml(t.textContent)).filter(Boolean);
          return txt.length ? `<div class="kt-grp" style="width:${W.toFixed(1)}px"><ul>${txt.map(t => `<li>${t}</li>`).join('')}</ul></div>` : '';
        }
      }
    } catch (e) { return ''; }
    if (!drawing) return '';
    const tree = X.q(drawing, this.DSP, 'spTree')[0];
    return tree ? this.groupHtml(tree, W, H, {}) : '';
  },
};
if (typeof module !== 'undefined') module.exports = { OfficeObj };
