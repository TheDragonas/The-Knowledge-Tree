'use strict';
/* Diagramme aus Tabellendaten (wie Excel): Säulen, Balken, Linie, Fläche, Punkte (XY), Kreis, Ring.
 * Verknüpft mit einem Bereich einer Tabelle derselben Seite (live), letzte Daten im Diagramm gespeichert.
 * Werte ablesen: Zeiger zeigt die Werte (Linie/Punkte: auch dazwischen), Klick springt zur Zelle.
 * Datenmodell: b.chart = { v, type, src: { id, name, range }, byRow, title, xTitle, yTitle, legend, grid, labels,
 *   markers, smooth, stacked, trend, eq, pal, h, cache: { cats, series: [{ name, vals, xs?, cells? }], xy, fmt } } */

const CH_TYPES = [
  ['col', 'Säulen', 'chartCol'], ['bar', 'Balken', 'chartBar'], ['line', 'Linie', 'chartLine'], ['area', 'Fläche', 'chartArea'],
  ['scatter', 'Punkte (XY)', 'chartScatter'], ['pie', 'Kreis', 'chartPie'], ['doughnut', 'Ring', 'chartRing'],
];
const CH_PALETTES = [
  ['Farbig', ['#4472C4', '#ED7D31', '#A5A5A5', '#FFC000', '#5B9BD5', '#70AD47', '#264478', '#9E480E', '#636363', '#997300']],
  ['Blautöne', ['#1F4E79', '#2E75B6', '#5B9BD5', '#9DC3E6', '#BDD7EE', '#203864', '#4472C4', '#8FAADC']],
  ['Grüntöne', ['#375623', '#548235', '#70AD47', '#A9D18E', '#C5E0B4', '#2E5E4E', '#43A047', '#81C784']],
  ['Kräftig', ['#D13438', '#0078D4', '#107C10', '#FFB900', '#8764B8', '#00B7C3', '#E3008C', '#498205']],
  ['Graustufen', ['#262626', '#595959', '#7F7F7F', '#A6A6A6', '#BFBFBF', '#D9D9D9']],
];
const CH_TRENDS = [['', 'Keine'], ['lin', 'Linear'], ['exp', 'Exponentiell'], ['log', 'Logarithmisch'], ['poly2', 'Polynom (2. Grad)'], ['pow', 'Potenz']];

const Chart = {
  /* ---------------------------------------------------------- Daten */
  norm(c) {
    c = c && typeof c === 'object' ? c : {};
    c.v = 1;
    if (!CH_TYPES.some(t => t[0] === c.type)) c.type = 'col';
    c.legend = ['r', 'b', 't', 'none'].includes(c.legend) ? c.legend : 'r';
    c.h = clamp(Math.round(+c.h || 280), 120, 1600);
    c.pal = clamp(+c.pal || 0, 0, CH_PALETTES.length - 1);
    for (const k of ['title', 'xTitle', 'yTitle']) c[k] = typeof c[k] === 'string' ? c[k] : '';
    c.grid = c.grid !== false; c.markers = c.markers !== false; c.labels = !!c.labels; c.smooth = !!c.smooth; c.stacked = !!c.stacked; c.byRow = !!c.byRow; c.eq = c.eq !== false;
    c.trend = CH_TRENDS.some(t => t[0] === c.trend) ? c.trend : '';
    if (c.src && (typeof c.src !== 'object' || typeof c.src.range !== 'string')) c.src = null;
    if (c.cache && (!Array.isArray(c.cache.series) || !Array.isArray(c.cache.cats))) c.cache = null;
    return c;
  },
  srcBox(b, page = Canvas.page) {
    const s = b.chart.src;
    if (!s || !page) return null;
    return page.boxes.find(x => x.sheet && x.id === s.id) || page.boxes.find(x => x.sheet && s.name && x.sheet.name.toLowerCase() === s.name.toLowerCase()) || null;
  },
  /* Bereich einer Tabelle -> { cats, series, xy, fmt } (Kopfzeile/-spalte wie Excel erkannt) */
  fromRange(sb, rangeTxt, type, byRow) {
    const rg = XL.parseRange(rangeTxt);
    if (!rg) return null;
    const d = sb.sheet;
    rg.c2 = Math.min(rg.c2, d.ncols - 1); rg.r2 = Math.min(rg.r2, d.nrows - 1);
    if (rg.c1 > rg.c2 || rg.r1 > rg.r2) return null;
    const book = Sheet.book(), sh = Sheet.sh(sb.id);
    const cell = (c, r) => ({ v: sh ? book.val(sh, c, r) : null, f: Sheet.cellF(d, c, r), c, r });
    let g = [];
    for (let r = rg.r1; r <= rg.r2; r++) { const row = []; for (let c = rg.c1; c <= rg.c2; c++) row.push(cell(c, r)); g.push(row); }
    if (byRow) g = g[0].map((_, j) => g.map(row => row[j]));
    const isNum = (x) => typeof x.v === 'number' && !/date|time|dt/.test(x.f.nf || '');
    const isDate = (x) => typeof x.v === 'number' && /date|dt/.test(x.f.nf || '');
    const nonNum = (x) => x.v === null || x.v === '' || typeof x.v !== 'number' || isDate(x);
    const H = g.length, W = g[0].length;
    // Kopfzeile: erste Zeile ohne Zahlen (ausser Datum), darunter Zahlen
    let head = H > 1 && g[0].every(x => !isNum(x)) && g.slice(1).some(row => row.some(isNum));
    // Kategorien: erste Spalte ohne reine Zahlen (Text oder Datum); bei XY: erste Spalte Zahlen = x-Werte
    const body = g.slice(head ? 1 : 0);
    let catCol = W > 1 && body.every(row => nonNum(row[0])) && body.some(row => row[0].v !== null && row[0].v !== '');
    const xy = type === 'scatter' && W > 1 && !catCol && body.every(row => row[0].v === null || typeof row[0].v === 'number');
    if (xy) catCol = true;
    if (!head && H > 1 && catCol && g[0].slice(1).every(x => !isNum(x)) && g[0][0].v === null) head = true;
    const rows = g.slice(head ? 1 : 0);
    const cats = rows.map((row, i) => catCol ? (row[0].v === null ? '' : XL.format(row[0].v, row[0].f).t) : String(i + 1));
    const series = [];
    for (let j = catCol ? 1 : 0; j < W; j++) {
      const name = head ? (g[0][j].v === null ? '' : XL.format(g[0][j].v, g[0][j].f).t) : `Reihe ${series.length + 1}`;
      const s = { name: name || `Reihe ${series.length + 1}`, vals: rows.map(row => typeof row[j].v === 'number' ? row[j].v : null), cells: rows.map(row => XL.key(row[j].c, row[j].r)) };
      if (xy) s.xs = rows.map(row => typeof row[0].v === 'number' ? row[0].v : null);
      series.push(s);
    }
    // Zahlenformat der Werte (erste Zahl der ersten Reihe)
    let fmt = null;
    for (const row of rows) for (let j = catCol ? 1 : 0; j < W && !fmt; j++) if (typeof row[j].v === 'number' && row[j].f.nf) fmt = { nf: row[j].f.nf, d: row[j].f.d, cur: row[j].f.cur };
    let xfmt = null;
    if (xy) for (const row of rows) if (typeof row[0].v === 'number' && row[0].f.nf && !xfmt) xfmt = { nf: row[0].f.nf, d: row[0].f.d, cur: row[0].f.cur };
    return { cats, series, xy, fmt, xfmt, head: !!head, catCol: !!catCol };
  },
  data(b) {
    const c = b.chart;
    const sb = this.srcBox(b);
    if (sb) {
      // Bereich wächst mit den Daten (wie eine Excel-Tabelle): neue Zeilen/Spalten direkt anschliessend kommen dazu
      if (c.src.auto) {
        const rg = XL.parseRange(c.src.range);
        if (rg && rg.c1 < sb.sheet.ncols && rg.r1 < sb.sheet.nrows) {
          const reg = Sheet.region(sb.id, rg.c1, rg.r1);
          const txt = XL.rangeText(reg.c1, reg.r1, reg.c2, reg.r2);
          if (txt !== c.src.range && (reg.c2 > reg.c1 || reg.r2 > reg.r1)) c.src.range = txt;
        }
      }
      const dd = this.fromRange(sb, c.src.range, c.type, c.byRow);
      if (dd) {
        c.src.id = sb.id; c.src.name = sb.sheet.name;
        const cache = { cats: dd.cats, series: dd.series.map(s => ({ name: s.name, vals: s.vals, ...(s.xs ? { xs: s.xs } : {}) })), xy: dd.xy, fmt: dd.fmt, xfmt: dd.xfmt };
        if (JSON.stringify(cache) !== JSON.stringify(c.cache)) c.cache = cache;
        return { ...dd, live: true, sb };
      }
    }
    const cc = c.cache || { cats: [], series: [] };
    return { cats: cc.cats || [], series: cc.series || [], xy: !!cc.xy, fmt: cc.fmt || null, xfmt: cc.xfmt || null, live: false };
  },
  /* Bezug anpassen, wenn in der Quelltabelle Zeilen/Spalten eingefügt oder gelöscht werden */
  adjustSrc(b, name, axis, at, n) {
    const s = b.chart.src;
    if (!s || String(s.name).toLowerCase() !== String(name).toLowerCase()) return;
    const r = XL.adjustRefs('=' + s.range, name, name, axis, at, n);
    if (/#BEZUG!/.test(r)) { s.range = ''; return; }
    s.range = r.slice(1);
  },

  /* ---------------------------------------------------------- Rechnen: Achsen, Trend */
  nice(min, max, target = 6) {
    if (!isFinite(min) || !isFinite(max)) { min = 0; max = 1; }
    if (min === max) { if (min === 0) { max = 1; } else { const d = Math.abs(min) * 0.1; min -= d; max += d; } }
    const span = max - min;
    const raw = span / target, mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const step = [1, 2, 2.5, 5, 10].map(m => m * mag).find(s => span / s <= target + 0.5) || 10 * mag;
    const lo = Math.floor(min / step + 1e-9) * step, hi = Math.ceil(max / step - 1e-9) * step;
    const ticks = [];
    for (let v = lo; v <= hi + step * 1e-6; v += step) ticks.push(+v.toPrecision(12));
    return { lo, hi, step, ticks };
  },
  /* Regression -> { f(x), text, r2 } */
  trendFit(kind, xs, ys) {
    const P = [];
    xs.forEach((x, i) => { const y = ys[i]; if (typeof x === 'number' && typeof y === 'number' && isFinite(x) && isFinite(y)) P.push([x, y]); });
    if (P.length < 2) return null;
    const lin = (pts) => {
      const n = pts.length, mx = pts.reduce((s, p) => s + p[0], 0) / n, my = pts.reduce((s, p) => s + p[1], 0) / n;
      let sxy = 0, sxx = 0; for (const [x, y] of pts) { sxy += (x - mx) * (y - my); sxx += (x - mx) ** 2; }
      if (!sxx) return null;
      const m = sxy / sxx; return { m, b: my - m * mx };
    };
    const g = (v) => XL.general(+v.toPrecision(4));
    const sg = (v) => (v < 0 ? ' − ' : ' + ') + g(Math.abs(v));
    let f, text;
    if (kind === 'lin') { const l = lin(P); if (!l) return null; f = (x) => l.m * x + l.b; text = `y = ${g(l.m)}x${sg(l.b)}`; }
    else if (kind === 'exp') { const Q = P.filter(p => p[1] > 0).map(([x, y]) => [x, Math.log(y)]); const l = lin(Q); if (!l || Q.length < 2) return null; const a = Math.exp(l.b); f = (x) => a * Math.exp(l.m * x); text = `y = ${g(a)}e^(${g(l.m)}x)`; }
    else if (kind === 'log') { const Q = P.filter(p => p[0] > 0).map(([x, y]) => [Math.log(x), y]); const l = lin(Q); if (!l || Q.length < 2) return null; f = (x) => x > 0 ? l.m * Math.log(x) + l.b : NaN; text = `y = ${g(l.m)}·ln(x)${sg(l.b)}`; }
    else if (kind === 'pow') { const Q = P.filter(p => p[0] > 0 && p[1] > 0).map(([x, y]) => [Math.log(x), Math.log(y)]); const l = lin(Q); if (!l || Q.length < 2) return null; const a = Math.exp(l.b); f = (x) => x > 0 ? a * Math.pow(x, l.m) : NaN; text = `y = ${g(a)}x^${g(l.m)}`; }
    else if (kind === 'poly2') {
      if (P.length < 3) return null;
      let s = [0, 0, 0, 0, 0], t = [0, 0, 0];
      for (const [x, y] of P) { let p = 1; for (let k = 0; k <= 4; k++) { s[k] += p; if (k <= 2) t[k] += p * y; p *= x; } }
      const M = [[s[4], s[3], s[2], t[2]], [s[3], s[2], s[1], t[1]], [s[2], s[1], s[0], t[0]]];
      for (let i = 0; i < 3; i++) { let piv = i; for (let k = i + 1; k < 3; k++) if (Math.abs(M[k][i]) > Math.abs(M[piv][i])) piv = k; [M[i], M[piv]] = [M[piv], M[i]]; if (Math.abs(M[i][i]) < 1e-14) return null; for (let k = 0; k < 3; k++) if (k !== i) { const q = M[k][i] / M[i][i]; for (let j = i; j < 4; j++) M[k][j] -= q * M[i][j]; } }
      const a = M[0][3] / M[0][0], bb = M[1][3] / M[1][1], c = M[2][3] / M[2][2];
      f = (x) => a * x * x + bb * x + c; text = `y = ${g(a)}x²${sg(bb)}x${sg(c)}`;
    } else return null;
    const my = P.reduce((s, p) => s + p[1], 0) / P.length;
    let ssr = 0, sst = 0; for (const [x, y] of P) { ssr += (y - f(x)) ** 2; sst += (y - my) ** 2; }
    const r2 = sst ? 1 - ssr / sst : 1;
    return { f, text, r2 };
  },

  /* ---------------------------------------------------------- Zeichnen (SVG) */
  esc(s) { return escapeHtml(String(s)); },
  textW(s, size = 11) { return String(s).length * size * 0.56; },
  svg(c, data, W, H, { dark } = {}) {
    const pal = CH_PALETTES[c.pal][1];
    const col = (i) => pal[i % pal.length];
    const ink = dark ? '#e6e6e6' : '#404040', muted = dark ? '#a0a0a0' : '#6b6b6b', gridc = dark ? '#3a3a3a' : '#e3e3e3', axisc = dark ? '#777' : '#bfbfbf';
    const FONT = `font-family="Calibri, Carlito, 'Segoe UI', Arial, sans-serif"`;
    const series = data.series.filter(s => s.vals.some(v => v !== null));
    const geo = { pts: [], plot: null, kind: c.type, xy: data.xy };
    let out = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" ${FONT} font-size="11">`;
    out += `<rect width="${W}" height="${H}" fill="${dark ? '#1f1f1f' : '#ffffff'}" rx="0"/>`;
    let top = 10, bottom = H - 8, left = 10, right = W - 10;
    const title = c.title || (series.length === 1 && c.type !== 'pie' && c.type !== 'doughnut' ? series[0].name : '');
    if (title) { out += `<text x="${W / 2}" y="${top + 13}" text-anchor="middle" font-size="15" fill="${ink}">${this.esc(title)}</text>`; top += 26; }
    const fmtY = (v) => XL.format(v, data.fmt || {}).t;
    const fmtX = (v) => XL.format(v, data.xfmt || {}).t;
    if (!series.length) {
      out += `<text x="${W / 2}" y="${H / 2}" text-anchor="middle" fill="${muted}">Keine Zahlen im Bereich – Daten in der Tabelle eingeben</text></svg>`;
      return { svg: out, geo };
    }
    const pie = c.type === 'pie' || c.type === 'doughnut';
    // Legende
    const legItems = pie ? data.cats.map((n, i) => ({ name: n || String(i + 1), color: col(i) })) : series.map((s, i) => ({ name: s.name, color: col(data.series.indexOf(s)) }));
    if (c.legend !== 'none' && legItems.length && (legItems.length > 1 || pie)) {
      if (c.legend === 'r') {
        const lw = Math.min(W * 0.35, Math.max(...legItems.map(l => this.textW(l.name))) + 26);
        const lh = legItems.length * 17;
        let y = Math.max(top, (top + bottom) / 2 - lh / 2);
        for (const l of legItems) { out += `<rect x="${right - lw + 2}" y="${y + 3}" width="10" height="10" fill="${l.color}"/><text x="${right - lw + 17}" y="${y + 12}" fill="${ink}">${this.esc(this.clip(l.name, lw - 20))}</text>`; y += 17; }
        right -= lw + 8;
      } else {
        const items = legItems.map(l => ({ ...l, w: this.textW(this.clip(l.name, 140)) + 24 }));
        const lines = [[]]; let lw = 0;
        for (const it of items) { if (lw + it.w > right - left && lines[lines.length - 1].length) { lines.push([]); lw = 0; } lines[lines.length - 1].push(it); lw += it.w; }
        const total = lines.length * 17;
        let y = c.legend === 't' ? top : bottom - total;
        for (const ln of lines) {
          const tw = ln.reduce((s, it) => s + it.w, 0);
          let x = (left + right) / 2 - tw / 2;
          for (const it of ln) { out += `<rect x="${x}" y="${y + 3}" width="10" height="10" fill="${it.color}"/><text x="${x + 14}" y="${y + 12}" fill="${ink}">${this.esc(this.clip(it.name, 140))}</text>`; x += it.w; }
          y += 17;
        }
        if (c.legend === 't') top += total + 6; else bottom -= total + 6;
      }
    }
    // Kreis / Ring
    if (pie) {
      const s = series[0];
      const vals = s.vals.map(v => v !== null && v > 0 ? v : 0);
      const tot = vals.reduce((a, b) => a + b, 0) || 1;
      const cx = (left + right) / 2, cy = (top + bottom) / 2, R = Math.max(10, Math.min(right - left, bottom - top) / 2 - 18), r0 = c.type === 'doughnut' ? R * 0.55 : 0;
      let a0 = -Math.PI / 2;
      vals.forEach((v, i) => {
        if (!v) return;
        const a1 = a0 + v / tot * Math.PI * 2;
        const large = a1 - a0 > Math.PI ? 1 : 0;
        const p = (r, a) => `${(cx + r * Math.cos(a)).toFixed(2)},${(cy + r * Math.sin(a)).toFixed(2)}`;
        let d;
        if (v >= tot - 1e-12) d = r0 ? `M${p(R, 0)}A${R},${R} 0 1 1 ${p(R, Math.PI)}A${R},${R} 0 1 1 ${p(R, 0)}M${p(r0, 0)}A${r0},${r0} 0 1 0 ${p(r0, Math.PI)}A${r0},${r0} 0 1 0 ${p(r0, 0)}Z` : `M${p(R, 0)}A${R},${R} 0 1 1 ${p(R, Math.PI)}A${R},${R} 0 1 1 ${p(R, 0)}Z`;
        else d = r0 ? `M${p(R, a0)}A${R},${R} 0 ${large} 1 ${p(R, a1)}L${p(r0, a1)}A${r0},${r0} 0 ${large} 0 ${p(r0, a0)}Z` : `M${cx},${cy}L${p(R, a0)}A${R},${R} 0 ${large} 1 ${p(R, a1)}Z`;
        out += `<path d="${d}" fill="${col(i)}" stroke="${dark ? '#1f1f1f' : '#fff'}" stroke-width="1.5" fill-rule="evenodd"/>`;
        const am = (a0 + a1) / 2;
        geo.pts.push({ si: 0, i, x: cx + (r0 + R) / 2 * Math.cos(am), y: cy + (r0 + R) / 2 * Math.sin(am), a0, a1, cx, cy, R, r0, label: data.cats[i], value: s.vals[i], name: s.name, pct: v / tot });
        if (v / tot >= 0.04 || c.labels) {
          const lr = r0 ? (r0 + R) / 2 : R * 0.64;
          const txt = c.labels ? fmtY(s.vals[i]) : XL.format(v / tot, { nf: 'pct', d: 0 }).t;
          out += `<text x="${(cx + lr * Math.cos(am)).toFixed(1)}" y="${(cy + lr * Math.sin(am) + 4).toFixed(1)}" text-anchor="middle" fill="#fff" font-weight="700">${this.esc(txt)}</text>`;
        }
        a0 = a1;
      });
      geo.plot = { left, right, top, bottom, cx, cy, R, r0 };
      return { svg: out + '</svg>', geo };
    }
    // Achsentitel
    if (c.yTitle) { out += `<text transform="translate(${left + 9},${(top + bottom) / 2}) rotate(-90)" text-anchor="middle" fill="${muted}">${this.esc(c.yTitle)}</text>`; left += 18; }
    if (c.xTitle) { out += `<text x="${(left + right) / 2}" y="${bottom - 2}" text-anchor="middle" fill="${muted}">${this.esc(c.xTitle)}</text>`; bottom -= 18; }
    const horiz = c.type === 'bar';
    const n = data.cats.length;
    // Wertebereich
    let vmin = Infinity, vmax = -Infinity;
    if (c.stacked && (c.type === 'col' || c.type === 'bar' || c.type === 'area')) {
      for (let i = 0; i < n; i++) { let pos = 0, neg = 0; for (const s of series) { const v = s.vals[i]; if (v === null) continue; if (v >= 0) pos += v; else neg += v; } vmin = Math.min(vmin, neg); vmax = Math.max(vmax, pos); }
    } else for (const s of series) for (const v of s.vals) if (v !== null) { vmin = Math.min(vmin, v); vmax = Math.max(vmax, v); }
    const trends = [];
    let xmin = Infinity, xmax = -Infinity;
    if (data.xy) for (const s of series) for (const x of s.xs || []) if (x !== null) { xmin = Math.min(xmin, x); xmax = Math.max(xmax, x); }
    if (c.trend && c.type !== 'bar') {
      series.forEach((s) => {
        const xs = data.xy ? s.xs : s.vals.map((_, i) => i + 1);
        const t = this.trendFit(c.trend, xs, s.vals);
        if (t) { trends.push({ s, t }); }
      });
    }
    const zeroBased = c.type === 'col' || c.type === 'bar' || c.type === 'area' || !(vmin > 0 && (vmax - vmin) / vmax < 1 / 6);
    if (zeroBased) { vmin = Math.min(0, vmin); vmax = Math.max(0, vmax); }
    const ys = this.nice(vmin, vmax, Math.max(3, Math.min(8, Math.round((horiz ? right - left : bottom - top) / 45))));
    const yl = ys.ticks.map(fmtY);
    const ylw = Math.max(...yl.map(t => this.textW(t))) + 8;
    // Platz für Achsenbeschriftung
    let xs = null, xl = null;
    if (data.xy) {
      // etwas Rand, damit Punkte nicht am Achsenende kleben (wie Excel)
      const pad = (xmax - xmin) * 0.04;
      xs = this.nice(xmin > 0 && xmin - pad < 0 ? 0 : xmin - pad, xmax + pad, Math.max(3, Math.min(10, Math.round((right - left) / 70))));
      xl = xs.ticks.map(fmtX);
    }
    if (!horiz) left += ylw;
    const catLabels = horiz ? null : data.cats;
    let rot = false;
    if (!horiz && !data.xy) {
      const slot = (right - left) / Math.max(1, n);
      const maxw = Math.max(0, ...catLabels.map(t => this.textW(t)));
      rot = maxw > slot - 4 && n > 1;
      bottom -= rot ? Math.min(70, maxw * 0.72 + 8) : 18;
    } else if (!horiz) bottom -= 18;
    if (horiz) { const maxw = Math.max(0, ...data.cats.map(t => this.textW(this.clip(t, 120)))); left += Math.min(130, maxw + 8); bottom -= 18; }
    const P = { left, right, top: top + 4, bottom };
    geo.plot = P;
    const vy = (v) => P.bottom - (v - ys.lo) / (ys.hi - ys.lo) * (P.bottom - P.top);
    const vx = (v) => P.left + (v - ys.lo) / (ys.hi - ys.lo) * (P.right - P.left);
    // Gitter und Achsen
    if (horiz) {
      ys.ticks.forEach((t, k) => { const x = vx(t); if (c.grid) out += `<line x1="${x}" y1="${P.top}" x2="${x}" y2="${P.bottom}" stroke="${gridc}"/>`; out += `<text x="${x}" y="${P.bottom + 14}" text-anchor="middle" fill="${muted}">${this.esc(yl[k])}</text>`; });
    } else {
      ys.ticks.forEach((t, k) => { const y = vy(t); if (c.grid) out += `<line x1="${P.left}" y1="${y}" x2="${P.right}" y2="${y}" stroke="${gridc}"/>`; out += `<text x="${P.left - 6}" y="${y + 4}" text-anchor="end" fill="${muted}">${this.esc(yl[k])}</text>`; });
    }
    const zeroLine = horiz ? vx(Math.max(ys.lo, Math.min(ys.hi, 0))) : vy(Math.max(ys.lo, Math.min(ys.hi, 0)));
    // Kategorien-/x-Achse
    const band = (horiz ? P.bottom - P.top : P.right - P.left) / Math.max(1, n);
    const cpos = (i) => horiz ? P.top + band * (i + 0.5) : P.left + band * (i + 0.5);
    const xpos = data.xy ? (x) => P.left + (x - xs.lo) / (xs.hi - xs.lo) * (P.right - P.left) : null;
    if (data.xy) {
      xs.ticks.forEach((t, k) => { const x = xpos(t); if (c.grid) out += `<line x1="${x}" y1="${P.top}" x2="${x}" y2="${P.bottom}" stroke="${gridc}"/>`; out += `<text x="${x}" y="${P.bottom + 14}" text-anchor="middle" fill="${muted}">${this.esc(xl[k])}</text>`; });
      out += `<line x1="${P.left}" y1="${zeroLine}" x2="${P.right}" y2="${zeroLine}" stroke="${axisc}"/>`;
    } else if (horiz) {
      out += `<line x1="${zeroLine}" y1="${P.top}" x2="${zeroLine}" y2="${P.bottom}" stroke="${axisc}"/>`;
      data.cats.forEach((t, i) => { out += `<text x="${P.left - 6}" y="${cpos(i) + 4}" text-anchor="end" fill="${muted}">${this.esc(this.clip(t, 120))}</text>`; });
    } else {
      out += `<line x1="${P.left}" y1="${zeroLine}" x2="${P.right}" y2="${zeroLine}" stroke="${axisc}"/>`;
      const every = rot ? 1 : Math.max(1, Math.ceil(Math.max(0, ...catLabels.map(t => this.textW(t))) / Math.max(1, band - 4)));
      catLabels.forEach((t, i) => {
        if (i % every) return;
        const x = cpos(i);
        if (rot) out += `<text transform="translate(${x + 3},${P.bottom + 8}) rotate(-45)" text-anchor="end" fill="${muted}">${this.esc(this.clip(t, 90))}</text>`;
        else out += `<text x="${x}" y="${P.bottom + 14}" text-anchor="middle" fill="${muted}">${this.esc(t)}</text>`;
      });
    }
    // Reihen
    const sIdx = (s) => data.series.indexOf(s);
    if (c.type === 'col' || c.type === 'bar') {
      const k = c.stacked ? 1 : series.length;
      const bw = band * 0.72 / k, gap = band * 0.14;
      const posAcc = new Array(n).fill(0), negAcc = new Array(n).fill(0);
      series.forEach((s, si) => {
        s.vals.forEach((v, i) => {
          if (v === null) return;
          let a = 0, b2 = v;
          if (c.stacked) { if (v >= 0) { a = posAcc[i]; posAcc[i] += v; } else { a = negAcc[i]; negAcc[i] += v; } b2 = a + v; }
          const o = c.stacked ? 0 : si;
          const p0 = (horiz ? P.top : P.left) + band * i + gap + o * bw;
          if (horiz) {
            const x1 = vx(Math.min(a, b2)), x2 = vx(Math.max(a, b2));
            out += `<rect x="${x1.toFixed(1)}" y="${p0.toFixed(1)}" width="${Math.max(0.5, x2 - x1).toFixed(1)}" height="${(bw - 1).toFixed(1)}" fill="${col(sIdx(s))}"/>`;
            geo.pts.push({ si: sIdx(s), i, x: v >= 0 ? x2 : x1, y: p0 + bw / 2, box: { x: x1, y: p0, w: x2 - x1, h: bw }, label: data.cats[i], value: v, name: s.name });
            if (c.labels) out += `<text x="${(v >= 0 ? x2 + 3 : x1 - 3).toFixed(1)}" y="${(p0 + bw / 2 + 4).toFixed(1)}" text-anchor="${v >= 0 ? 'start' : 'end'}" fill="${ink}" font-size="10">${this.esc(fmtY(v))}</text>`;
          } else {
            const y1 = vy(Math.max(a, b2)), y2 = vy(Math.min(a, b2));
            out += `<rect x="${p0.toFixed(1)}" y="${y1.toFixed(1)}" width="${(bw - 1).toFixed(1)}" height="${Math.max(0.5, y2 - y1).toFixed(1)}" fill="${col(sIdx(s))}"/>`;
            geo.pts.push({ si: sIdx(s), i, x: p0 + bw / 2, y: v >= 0 ? y1 : y2, box: { x: p0, y: y1, w: bw, h: y2 - y1 }, label: data.cats[i], value: v, name: s.name });
            if (c.labels) out += `<text x="${(p0 + bw / 2).toFixed(1)}" y="${(v >= 0 ? y1 - 3 : y2 + 11).toFixed(1)}" text-anchor="middle" fill="${ink}" font-size="10">${this.esc(fmtY(v))}</text>`;
          }
        });
      });
    } else {
      const acc = new Array(n).fill(0);
      series.forEach((s) => {
        const color = col(sIdx(s));
        const pts = [];
        s.vals.forEach((v, i) => {
          if (v === null) { pts.push(null); return; }
          let yv = v;
          if (c.stacked && c.type === 'area') { yv = acc[i] + v; acc[i] = yv; }
          const x = data.xy ? (s.xs && s.xs[i] !== null ? xpos(s.xs[i]) : null) : cpos(i);
          if (x === null) { pts.push(null); return; }
          pts.push({ x, y: vy(yv), v, i, base: c.stacked && c.type === 'area' ? vy(yv - v) : zeroLine });
          geo.pts.push({ si: sIdx(s), i, x, y: vy(yv), label: data.xy ? fmtX(s.xs[i]) : data.cats[i], xv: data.xy ? s.xs[i] : null, value: v, name: s.name });
        });
        const runs = [];
        let cur = [];
        const ordered = data.xy ? pts.filter(Boolean).sort((p, q) => p.x - q.x) : pts;
        for (const p of ordered) { if (!p) { if (cur.length) runs.push(cur); cur = []; } else cur.push(p); }
        if (cur.length) runs.push(cur);
        const path = (r) => {
          if (!c.smooth || r.length < 3) return r.map((p, k) => (k ? 'L' : 'M') + p.x.toFixed(1) + ',' + p.y.toFixed(1)).join('');
          let d = `M${r[0].x.toFixed(1)},${r[0].y.toFixed(1)}`;
          for (let k = 0; k < r.length - 1; k++) {
            const p0 = r[k - 1] || r[k], p1 = r[k], p2 = r[k + 1], p3 = r[k + 2] || p2;
            const c1x = p1.x + (p2.x - p0.x) / 6, c1y = p1.y + (p2.y - p0.y) / 6, c2x = p2.x - (p3.x - p1.x) / 6, c2y = p2.y - (p3.y - p1.y) / 6;
            d += `C${c1x.toFixed(1)},${c1y.toFixed(1)} ${c2x.toFixed(1)},${c2y.toFixed(1)} ${p2.x.toFixed(1)},${p2.y.toFixed(1)}`;
          }
          return d;
        };
        if (c.type === 'area') {
          for (const r of runs) {
            const back = [...r].reverse().map(p => `L${p.x.toFixed(1)},${p.base.toFixed(1)}`).join('');
            out += `<path d="${path(r)}${back}Z" fill="${color}" fill-opacity="${c.stacked ? 0.85 : 0.55}" stroke="${color}" stroke-width="1.5"/>`;
          }
        } else {
          const lineOn = c.type === 'line' || (c.type === 'scatter' && c.smooth);
          if (lineOn) for (const r of runs) out += `<path d="${path(r)}" fill="none" stroke="${color}" stroke-width="2.25" stroke-linejoin="round" stroke-linecap="round"/>`;
          if (c.markers || c.type === 'scatter') for (const p of pts) if (p) out += `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="${c.type === 'scatter' ? 3.6 : 3}" fill="${c.type === 'scatter' ? color : (dark ? '#1f1f1f' : '#fff')}" stroke="${color}" stroke-width="1.6"/>`;
        }
        if (c.labels) for (const p of pts) if (p) out += `<text x="${p.x.toFixed(1)}" y="${(p.y - 7).toFixed(1)}" text-anchor="middle" fill="${ink}" font-size="10">${this.esc(fmtY(p.v))}</text>`;
      });
    }
    // Trendlinien
    trends.forEach(({ s, t }, k) => {
      const color = col(sIdx(s));
      const x0 = data.xy ? xs.lo : 1, x1 = data.xy ? xs.hi : n;
      let d = '';
      for (let q = 0; q <= 60; q++) {
        const xv = x0 + (x1 - x0) * q / 60, yv = t.f(xv);
        if (!isFinite(yv)) continue;
        const px = data.xy ? xpos(xv) : P.left + band * (xv - 0.5), py = vy(yv);
        if (py < P.top - 2 || py > P.bottom + 2) { if (d) d += ''; continue; }
        d += (d ? 'L' : 'M') + px.toFixed(1) + ',' + py.toFixed(1);
      }
      if (d) out += `<path d="${d}" fill="none" stroke="${color}" stroke-width="1.5" stroke-dasharray="6 4"/>`;
      if (c.eq) {
        const txt = `${t.text}   R² = ${XL.general(+t.r2.toPrecision(4))}`;
        const tw = this.textW(txt, 10.5) + 10;
        // steigender Trend: oben links (dort ist meist Platz), fallender: oben rechts
        const rising = t.f(x1) > t.f(x0);
        const tx = rising ? P.left + 6 : P.right - tw - 4;
        const ty = P.top + 6 + k * 18;
        out += `<rect x="${tx}" y="${ty}" width="${tw}" height="15" rx="3" fill="${dark ? '#1f1f1f' : '#fff'}" fill-opacity=".85"/><text x="${tx + tw - 5}" y="${ty + 11.5}" text-anchor="end" font-size="10.5" fill="${color}">${this.esc(txt)}</text>`;
      }
      geo.trends = geo.trends || [];
      geo.trends.push({ si: sIdx(s), f: t.f, text: t.text, r2: t.r2 });
    });
    geo.ys = ys; geo.xs = xs; geo.horiz = horiz; geo.band = band; geo.n = n;
    geo.inv = { vy: (py) => ys.lo + (P.bottom - py) / (P.bottom - P.top) * (ys.hi - ys.lo), vx: data.xy ? (px) => xs.lo + (px - P.left) / (P.right - P.left) * (xs.hi - xs.lo) : null };
    out += '</svg>';
    return { svg: out, geo };
  },
  clip(s, w, size = 11) { s = String(s); const max = Math.max(3, Math.floor(w / (size * 0.56))); return s.length > max ? s.slice(0, max - 1) + '…' : s; },

  /* ---------------------------------------------------------- Feld auf der Seite */
  make(b) {
    const e = el('div', { class: 'box ch', dataset: { id: b.id } });
    e.innerHTML = `<div class="box-bar" title="Ziehen zum Verschieben · Doppelklick auf das Diagramm = bearbeiten"><span class="box-grip"></span><span class="box-lock">${icon('lock', 10)}</span></div>` +
      `<div class="box-body"><div class="ch-wrap"></div></div>` +
      `<div class="box-rs" title="Breite ändern"></div><div class="ch-rs ui-only" title="Grösse ändern"></div><div class="sock l" title="Ziehen zum Verbinden"></div><div class="sock r" title="Ziehen zum Verbinden"></div>`;
    return e;
  },
  innerW(b) { return Math.max(120, b.w - 2 * BORDER - 12); },
  /* neu zeichnen nur, wenn sich Werte, Grösse oder Einstellungen wirklich geändert haben */
  update(b, e, force) {
    const c = b.chart;
    // Diagramme aus Office-Dateien (1.75) stehen auf weissem Papier/Folie/Raster: immer hell
    const dark = document.body.dataset.theme === 'dunkel' && !(b.ox && Canvas.page && Canvas.page.office && Canvas.page.office.asset);
    const W = this.innerW(b), H = c.h;
    const data = this.data(b);
    const sig = W + '|' + JSON.stringify({ ...c, cache: undefined }) + (dark ? 'd' : 'h') + '|' + JSON.stringify([data.cats, data.series.map(s => [s.name, s.vals, s.xs || null]), data.fmt, data.xfmt, data.live]);
    if (!force && e._chSig === sig) return;
    e._chSig = sig;
    const r = this.svg(c, data, W, H, { dark });
    const wrap = e.querySelector('.ch-wrap');
    wrap.innerHTML = r.svg;
    e._geo = r.geo; e._data = data;
    e.classList.toggle('ch-lost', !!c.src && !data.live);
    wrap.title = c.src && !data.live ? 'Die Quelltabelle fehlt – es werden die zuletzt gespeicherten Werte gezeigt' : '';
  },

  /* ---------------------------------------------------------- Werte ablesen */
  hover(ev) {
    const t = ev.target;
    const wrap = t && t.closest && t.closest('.box.ch .ch-wrap');
    if (!wrap) { this.hideTip(); return; }
    const e = wrap.closest('.box'), geo = e._geo, b = Canvas.box(e.dataset.id);
    if (!geo || !b || !geo.plot) { this.hideTip(); return; }
    const svgEl = wrap.querySelector('svg');
    const r = svgEl.getBoundingClientRect();
    const sx = (ev.clientX - r.left) * (svgEl.viewBox.baseVal.width / r.width), sy = (ev.clientY - r.top) * (svgEl.viewBox.baseVal.height / r.height);
    const P = geo.plot, c = b.chart, data = e._data;
    const fmtY = (v) => XL.format(v, data.fmt || {}).t;
    let html = '', guide = null, hitPt = null;
    if (geo.kind === 'pie' || geo.kind === 'doughnut') {
      const dx = sx - P.cx, dy = sy - P.cy, dist = Math.hypot(dx, dy);
      let a = Math.atan2(dy, dx); if (a < -Math.PI / 2) a += Math.PI * 2;
      const p = dist <= P.R && dist >= P.r0 && geo.pts.find(q => a >= q.a0 && a < q.a1);
      if (p) { hitPt = p; html = `<b>${escapeHtml(p.label || '')}</b><br>${escapeHtml(fmtY(p.value))} · ${XL.format(p.pct, { nf: 'pct', d: 1 }).t}`; }
    } else if (geo.kind === 'col' || geo.kind === 'bar') {
      const p = geo.pts.find(q => q.box && sx >= q.box.x - 1 && sx <= q.box.x + q.box.w + 1 && sy >= q.box.y - 1 && sy <= q.box.y + Math.max(2, q.box.h) + 1);
      if (p) { hitPt = p; html = `<b>${escapeHtml(p.name)}</b><br>${escapeHtml(p.label)}: ${escapeHtml(fmtY(p.value))}`; }
      else if (sx >= P.left && sx <= P.right && sy >= P.top && sy <= P.bottom) {
        const v = geo.horiz ? geo.ys.lo + (sx - P.left) / (P.right - P.left) * (geo.ys.hi - geo.ys.lo) : geo.inv.vy(sy);
        html = `<span class="ch-mut">Wert an der Stelle: ${escapeHtml(fmtY(+v.toPrecision(4)))}</span>`;
        guide = geo.horiz ? { x: sx } : { y: sy };
      }
    } else if (sx >= P.left - 4 && sx <= P.right + 4 && sy >= P.top - 4 && sy <= P.bottom + 4) {
      // Linie/Fläche/Punkte: nächster Punkt; dazwischen interpoliert ablesen
      let best = null, bd = 14;
      for (const q of geo.pts) { const dd = Math.hypot(q.x - sx, q.y - sy); if (dd < bd) { bd = dd; best = q; } }
      const lines = [];
      if (best) { hitPt = best; lines.push(`<b>${escapeHtml(best.name)}</b><br>${geo.xy ? 'x = ' : ''}${escapeHtml(best.label)}: ${escapeHtml(fmtY(best.value))}`); }
      else {
        const xVal = geo.xy ? geo.inv.vx(sx) : null;
        const yVal = geo.inv.vy(sy);
        if (geo.xy) lines.push(`<span class="ch-mut">x = ${escapeHtml(XL.format(+xVal.toPrecision(4), data.xfmt || {}).t)}, y = ${escapeHtml(fmtY(+yVal.toPrecision(4)))}</span>`);
        // Werte der Reihen an dieser x-Stelle (linear zwischen den Punkten)
        const bySeries = new Map();
        for (const q of geo.pts) { if (!bySeries.has(q.si)) bySeries.set(q.si, []); bySeries.get(q.si).push(q); }
        for (const [si, arr] of bySeries) {
          const s = arr.slice().sort((p, q) => p.x - q.x);
          for (let k = 0; k + 1 < s.length; k++) if (sx >= s[k].x && sx <= s[k + 1].x) {
            const f = (sx - s[k].x) / ((s[k + 1].x - s[k].x) || 1);
            const v = s[k].value + f * (s[k + 1].value - s[k].value);
            lines.push(`<i style="background:${CH_PALETTES[c.pal][1][si % CH_PALETTES[c.pal][1].length]}"></i>${escapeHtml(s[k].name)}: ≈ ${escapeHtml(fmtY(+v.toPrecision(4)))}`);
            break;
          }
        }
        if (geo.trends) for (const t of geo.trends) { const xv = geo.xy ? geo.inv.vx(sx) : 0.5 + (sx - P.left) / geo.band; const yv = t.f(xv); if (isFinite(yv)) lines.push(`<span class="ch-mut">Trend: ${escapeHtml(fmtY(+yv.toPrecision(4)))}</span>`); }
        if (!geo.xy) lines.push(`<span class="ch-mut">y = ${escapeHtml(fmtY(+yVal.toPrecision(4)))}</span>`);
        guide = { x: sx };
      }
      html = lines.join('<br>');
    }
    if (!html) { this.hideTip(); return; }
    let tip = this._tip;
    if (!tip) { tip = this._tip = el('div', { class: 'ch-tip' }); document.body.append(tip); }
    tip.innerHTML = html + (hitPt && data.live && hitPt.si !== undefined ? '<div class="ch-mut ch-tipk">Klick = Zelle in der Tabelle zeigen</div>' : '');
    tip.hidden = false;
    tip.style.left = Math.min(innerWidth - tip.offsetWidth - 8, ev.clientX + 14) + 'px';
    tip.style.top = Math.max(4, ev.clientY - tip.offsetHeight - 10) + 'px';
    // Hilfslinie
    let gl = svgEl.querySelector('.ch-guide');
    if (guide) {
      if (!gl) { gl = document.createElementNS('http://www.w3.org/2000/svg', 'line'); gl.setAttribute('class', 'ch-guide'); svgEl.append(gl); }
      if (guide.x !== undefined) { gl.setAttribute('x1', guide.x); gl.setAttribute('x2', guide.x); gl.setAttribute('y1', P.top); gl.setAttribute('y2', P.bottom); }
      else { gl.setAttribute('x1', P.left); gl.setAttribute('x2', P.right); gl.setAttribute('y1', guide.y); gl.setAttribute('y2', guide.y); }
    } else if (gl) gl.remove();
    this._hoverPt = hitPt ? { id: b.id, pt: hitPt } : null;
  },
  hideTip() {
    if (this._tip && !this._tip.hidden) this._tip.hidden = true;
    const g = document.querySelector('.ch-guide');
    if (g) g.remove();
    this._hoverPt = null;
  },
  /* Klick auf einen Datenpunkt: Quelle in der Tabelle zeigen */
  onClick(ev) {
    const h = this._hoverPt;
    const t = document.elementFromPoint(ev.clientX, ev.clientY);   // Pointer-Capture: ev.target ist die Fläche
    if (!h || !t || !t.closest || !t.closest('.box.ch .ch-wrap')) return false;
    const b = Canvas.box(h.id), e = Canvas.els.get(h.id);
    const data = e && e._data;
    if (!b || !data || !data.live) return false;
    const s = data.series[h.pt.si];
    const key = s && s.cells && s.cells[h.pt.i];
    const p = key && XL.parseKey(key);
    if (!p) return false;
    this.hideTip();
    Canvas.revealBox(data.sb.id);
    Sheet.activate(data.sb.id, p.c, p.r);
    Sheet.reveal();
    $('#sb-hint').textContent = `${s.name} · ${h.pt.label}: Wert in ${data.sb.sheet.name}!${key}`;
    return true;
  },

  /* ---------------------------------------------------------- Grösse ändern (Ecke) */
  onDown(ev) {
    const t = ev.target;
    if (!t.closest || !t.closest('.ch-rs') || ev.button !== 0) return false;
    const e = t.closest('.box.ch'), b = Canvas.box(e.dataset.id);
    if (!b || Canvas.isLocked(b)) return false;
    ev.preventDefault();
    if (!Canvas.sel.has(b.id)) Canvas.select([b.id]);
    Canvas.drag = { sx: ev.clientX, sy: ev.clientY, moved: false, type: 'chart', id: b.id, w0: b.w, h0: b.chart.h };
    Canvas.capture(ev);
    return true;
  },
  onDragMove(ev, d) {
    const b = Canvas.box(d.id);
    if (!b) return;
    d.moved = true;
    const z = Canvas.view.z;
    b.w = Math.max(200, Math.round(d.w0 + (ev.clientX - d.sx) / z));
    b.chart.h = Math.max(120, Math.round(d.h0 + (ev.clientY - d.sy) / z));
    Canvas.updateBox(b, Canvas.els.get(b.id));
    Canvas.layout();
  },
  onDragUp(ev, d) { if (d.moved) { Hist.touchPage(Canvas.pageId); Hist.commit('Diagrammgrösse'); } },

  /* ---------------------------------------------------------- Erstellen und Bearbeiten */
  /* passender Typ zu den Daten (wie Excels Empfehlung) */
  suggest(sb, range) {
    const dd = this.fromRange(sb, range, 'scatter', false);
    if (!dd) return 'col';
    if (dd.xy && dd.series.length) return 'scatter';
    const d0 = this.fromRange(sb, range, 'col', false);
    if (d0 && d0.cats.length > 12) return 'line';
    return 'col';
  },
  create(srcBox, range, type, pt, auto) {
    const c = this.norm({ type: type || this.suggest(srcBox, range), src: { id: srcBox.id, name: srcBox.sheet.name, range, ...(auto ? { auto: true } : {}) }, h: 280 });
    const sr = Canvas.rects.get(srcBox.id) || { x: srcBox.x, y: srcBox.y, w: srcBox.w, h: 100 };
    const b = {
      id: uid('b'), x: pt ? Canvas.snapV(pt.x) : Canvas.snapV(sr.x + sr.w + 30), y: pt ? Canvas.snapV(pt.y) : Canvas.snapV(sr.y), w: 460, html: '', images: [], z: Canvas.maxZ() + 1,
      style: {}, locked: false, pkg: null, chart: c,
    };
    Canvas.page.boxes.push(b);
    Canvas.render();
    Hist.touchPage(Canvas.pageId);
    Hist.commit('Diagramm eingefügt');
    if (Sheet.active) Sheet.deactivate();
    Canvas.select([b.id]);
    Canvas.revealBox(b.id);
    if (Ribbon.tab !== 'diagramm') { this.prevTab = Ribbon.tab === 'tabelle' ? 'einfuegen' : Ribbon.tab; Ribbon.show('diagramm'); }
    return b;
  },
  /* aus der Auswahl der aktiven Tabelle (eine Zelle = zusammenhängender Bereich) */
  insertFromSheet(type) {
    const a = Sheet.active;
    if (!a) return this.insert(type);
    const s = Sheet.sel();
    const rg = s.c1 === s.c2 && s.r1 === s.r2 ? Sheet.region(a.id, a.c, a.r) : s;
    const b = Sheet.box(a.id);
    if (Sheet.edit) Sheet.commit();
    this.create(b, XL.rangeText(rg.c1, rg.r1, rg.c2, rg.r2), type, null, s.c1 === s.c2 && s.r1 === s.r2);
  },
  /* Einfügen → Diagramm: aus der zuletzt benutzten Tabelle, sonst mit Beispieldaten (wie Excel/PowerPoint) */
  insert(type) {
    if (!Canvas.page) return;
    if (Sheet.active) { this.insertFromSheet(type); return; }
    const sel = Canvas.selectedBoxes().find(b => b.sheet);
    const sb = sel || Canvas.page.boxes.filter(b => b.sheet).slice(-1)[0];
    if (sb) { const u = Sheet.usedRange(sb.id); this.create(sb, XL.rangeText(0, 0, u.c2, u.r2), type, null, true); return; }
    const pt = Canvas.viewCenter();
    const grid = type === 'scatter'
      ? [['x', 'y'], ['1', '2.1'], ['2', '3.9'], ['3', '6.2'], ['4', '7.8'], ['5', '10.1'], ['6', '12.2']]
      : type === 'pie' || type === 'doughnut'
        ? [['Kategorie', 'Anteil'], ['A', '42'], ['B', '27'], ['C', '18'], ['D', '13']]
        : [['Monat', 'Umsatz', 'Kosten'], ['Jan', '120', '80'], ['Feb', '135', '90'], ['Mär', '150', '95'], ['Apr', '128', '88'], ['Mai', '170', '102']];
    const nb = Sheet.fromGrid(grid, { x: pt.x - 340, y: pt.y - 120 }, 'Daten');
    if (!nb) return;
    Sheet.deactivate();
    this.create(nb, XL.rangeText(0, 0, grid[0].length - 1, grid.length - 1), type || (grid[0].length === 2 ? 'scatter' : 'col'), null, true);
    UI.toast('Diagramm mit Beispieldaten – ändere die Zahlen in der Tabelle, das Diagramm passt sich an', 3500);
  },
  selected() { const bs = Canvas.selectedBoxes().filter(b => b.chart); return bs.length === 1 ? bs[0] : null; },
  set(prop, val, label) {
    const b = this.selected();
    if (!b || Canvas.isLocked(b)) return;
    b.chart[prop] = val;
    this.norm(b.chart);
    Canvas.updateBox(b, Canvas.els.get(b.id), true);
    Canvas.layout();
    Hist.touchPage(Canvas.pageId);
    Hist.commit(label || 'Diagramm geändert');
    Ribbon.refreshSoon();
  },
  /* Dialog: Typ, Daten, Beschriftungen, Trend (Vorschau live) */
  editDialog(b) {
    b = b || this.selected();
    if (!b) return;
    const ro = Canvas.isLocked(b);
    const c0 = JSON.parse(JSON.stringify(b.chart));
    const work = JSON.parse(JSON.stringify(b.chart));
    UI.dialog((dlg, close) => {
      dlg.classList.add('ch-dlg');
      dlg.append(el('h2', { text: 'Diagramm' }));
      const body = el('div', { class: 'ch-dlg-body' });
      const left = el('div', { class: 'ch-dlg-opts' }), prev = el('div', { class: 'ch-dlg-prev' });
      const draw = () => {
        this.norm(work);
        const tmp = { ...b, chart: work };
        const data = this.data(tmp);
        prev.innerHTML = this.svg(work, data, 420, 280, { dark: document.body.dataset.theme === 'dunkel' }).svg;
        info.textContent = work.src ? (data.live ? `${data.series.length} Reihe(n), ${data.cats.length} Werte aus ${work.src.name}!${work.src.range}` : 'Quelle nicht gefunden – zuletzt gespeicherte Werte') : 'Gespeicherte Werte (keine Tabelle verknüpft)';
      };
      const info = el('div', { class: 'ch-muted' });
      const types = el('div', { class: 'ch-types' });
      for (const [t, label, ic] of CH_TYPES) {
        const bt = el('button', { type: 'button', class: 'ch-type' + (work.type === t ? ' on' : ''), title: label, html: icon(ic, 26) + `<span>${label}</span>` });
        bt.addEventListener('click', () => { work.type = t; types.querySelectorAll('.ch-type').forEach(x => x.classList.toggle('on', x === bt)); draw(); });
        types.append(bt);
      }
      const row = (label, inp) => el('label', { class: 'ch-row' }, el('span', { text: label }), inp);
      const txt = (k, ph) => { const i = el('input', { type: 'text', class: 'ch-in', placeholder: ph || '' }); i.value = work[k] || ''; i.addEventListener('input', () => { work[k] = i.value; draw(); }); return i; };
      const chk = (k, label) => { const i = el('input', { type: 'checkbox' }); i.checked = !!work[k]; i.addEventListener('change', () => { work[k] = i.checked; draw(); }); return el('label', { class: 'ch-chk' }, i, ' ' + label); };
      const selOf = (k, opts) => { const s = el('select', { class: 'ch-in' }); for (const [v, l] of opts) s.append(el('option', { value: v, text: l })); s.value = String(work[k] ?? ''); s.addEventListener('change', () => { work[k] = k === 'pal' ? +s.value : s.value; draw(); }); return s; };
      // Datenquelle
      const sheets = Canvas.page.boxes.filter(x => x.sheet);
      const srcSel = el('select', { class: 'ch-in' });
      srcSel.append(el('option', { value: '', text: '(keine – gespeicherte Werte)' }));
      for (const s of sheets) srcSel.append(el('option', { value: s.id, text: s.sheet.name }));
      srcSel.value = work.src ? (this.srcBox({ chart: work }) || {}).id || '' : '';
      const rangeIn = el('input', { type: 'text', class: 'ch-in', placeholder: 'z.B. A1:C6' });
      rangeIn.value = work.src ? work.src.range : '';
      const setSrc = () => { const sb = sheets.find(x => x.id === srcSel.value); work.src = sb ? { id: sb.id, name: sb.sheet.name, range: rangeIn.value.trim() || (() => { const u = Sheet.usedRange(sb.id); return XL.rangeText(0, 0, u.c2, u.r2); })() } : null; if (sb && !rangeIn.value.trim()) rangeIn.value = work.src.range; draw(); };
      srcSel.addEventListener('change', setSrc);
      rangeIn.addEventListener('input', () => { if (work.src) { work.src.range = rangeIn.value.trim(); work.src.auto = false; autoChk.checked = false; draw(); } });
      const autoChk = el('input', { type: 'checkbox' });
      autoChk.checked = !!(work.src && work.src.auto);
      autoChk.addEventListener('change', () => { if (work.src) { work.src.auto = autoChk.checked; draw(); rangeIn.value = work.src.range; } });
      left.append(el('div', { class: 'ch-sec', text: 'Diagrammtyp' }), types,
        el('div', { class: 'ch-sec', text: 'Daten' }), row('Tabelle', srcSel), row('Bereich', rangeIn), el('label', { class: 'ch-chk', title: 'Neue Zeilen oder Spalten, die direkt an die Daten anschliessen, kommen automatisch ins Diagramm' }, autoChk, ' Bereich wächst mit den Daten'), chk('byRow', 'Reihen in Zeilen (statt Spalten)'),
        el('div', { class: 'ch-sec', text: 'Beschriftung' }), row('Titel', txt('title', 'automatisch')), row('Achse x', txt('xTitle')), row('Achse y', txt('yTitle')),
        row('Legende', selOf('legend', [['r', 'rechts'], ['b', 'unten'], ['t', 'oben'], ['none', 'keine']])), row('Farben', selOf('pal', CH_PALETTES.map((p, i) => [String(i), p[0]]))),
        el('div', { class: 'ch-flags' }, chk('grid', 'Gitternetz'), chk('labels', 'Datenbeschriftung'), chk('markers', 'Punkte auf Linien'), chk('smooth', 'Geglättet'), chk('stacked', 'Gestapelt')),
        el('div', { class: 'ch-sec', text: 'Trendlinie (Regression)' }), row('Typ', selOf('trend', CH_TRENDS)), chk('eq', 'Gleichung und R² anzeigen'),
        row('Höhe', (() => { const i = el('input', { type: 'number', class: 'ch-in', min: 120, max: 1600, step: 10 }); i.value = work.h; i.addEventListener('input', () => { work.h = +i.value || 280; }); return i; })()));
      body.append(left, el('div', {}, prev, info));
      dlg.append(body);
      dlg.append(el('div', { class: 'dlg-btns' },
        el('button', { class: 'btn', text: 'Daten als Tabelle', title: 'Die Werte des Diagramms als neue Tabelle auf die Seite legen', onclick: () => { close(null); this.toSheet(b); } }),
        el('span', { style: { flex: 1 } }),
        el('button', { class: 'btn', text: 'Abbrechen', onclick: () => close(null) }),
        el('button', { class: 'btn primary', text: 'Übernehmen', disabled: ro, onclick: () => close(true) })));
      draw();
    }, { wide: true }).then((ok) => {
      if (!ok || ro) return;
      b.chart = this.norm(work);
      if (JSON.stringify(b.chart) === JSON.stringify(c0)) return;
      Canvas.updateBox(b, Canvas.els.get(b.id), true);
      Canvas.layout();
      Hist.touchPage(Canvas.pageId);
      Hist.commit('Diagramm bearbeitet');
    });
  },
  /* Werte des Diagramms auslesen: als Tabelle auf die Seite */
  toSheet(b) {
    b = b || this.selected();
    if (!b) return;
    const data = this.data(b);
    if (!data.series.length) { UI.toast('Das Diagramm enthält keine Werte'); return; }
    const grid = [[data.xy ? 'x' : '', ...data.series.map(s => s.name)]];
    const n = Math.max(data.cats.length, ...data.series.map(s => s.vals.length));
    for (let i = 0; i < n; i++) grid.push([data.xy ? XL.numText(data.series[0].xs[i] ?? '') : (data.cats[i] ?? String(i + 1)), ...data.series.map(s => s.vals[i] === null || s.vals[i] === undefined ? '' : XL.numText(s.vals[i]))]);
    const r = Canvas.rects.get(b.id) || { x: b.x, y: b.y, h: b.chart.h };
    Sheet.fromGrid(grid, { x: r.x, y: r.y + r.h + 24 }, (b.chart.title || 'Diagrammdaten').slice(0, 30));
    UI.toast('Werte des Diagramms als Tabelle eingefügt');
  },
  /* Werte als Liste anzeigen (kopierbar) */
  showData(b) {
    b = b || this.selected();
    if (!b) return;
    const data = this.data(b);
    const fmtY = (v) => v === null || v === undefined ? '' : XL.format(v, data.fmt || {}).t;
    let h = '<table class="ch-dtab"><tr><th>' + (data.xy ? 'x' : '') + '</th>' + data.series.map(s => `<th>${escapeHtml(s.name)}</th>`).join('') + '</tr>';
    const n = Math.max(data.cats.length, ...data.series.map(s => s.vals.length), 0);
    for (let i = 0; i < n; i++) h += `<tr><td>${escapeHtml(data.xy ? XL.format(data.series[0].xs[i], data.xfmt || {}).t : data.cats[i] ?? '')}</td>` + data.series.map(s => `<td class="n">${escapeHtml(fmtY(s.vals[i]))}</td>`).join('') + '</tr>';
    h += '</table>';
    const e = Canvas.els.get(b.id);
    if (e && e._geo && e._geo.trends) h += e._geo.trends.map(t => `<p class="ch-muted">Trend ${escapeHtml(data.series[t.si] ? data.series[t.si].name : '')}: ${escapeHtml(t.text)} · R² = ${XL.general(+t.r2.toPrecision(4))}</p>`).join('');
    if (b.chart.src) h += `<p class="ch-muted">Quelle: ${escapeHtml(b.chart.src.name)}!${escapeHtml(b.chart.src.range)}${data.live ? '' : ' (nicht gefunden – gespeicherte Werte)'}</p>`;
    UI.info('Werte des Diagramms', h, { wide: true });
  },
  /* Diagramm als SVG-Text (für OneNote-Export als Bild) */
  svgFor(b, W, H) {
    const data = this.data(b);
    return this.svg(b.chart, data, W || this.innerW(b), H || b.chart.h, { dark: false }).svg;
  },
};
