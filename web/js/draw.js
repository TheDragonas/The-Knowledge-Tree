'use strict';
/* Zeichnen wie in OneNote: Stifte, Radierer, Lasso, Formen, Lineal und Winkelmesser,
 * Formerkennung, Freihand → Form / Text (die Freihand-Wiedergabe ist seit 1.27 entfernt).
 *
 * Gespeichert in page.drawings:
 *   Freihand: { id, type:'ink', kind:'pen|pencil|marker|rainbow|glitter', color, w, pts:[x,y,p, …], t0, dur, layer:'oben|unten' }
 *   Form:     { id, type:'shape', shape:'line|arrow|darrow|rect|ellipse|triangle|diamond|axes|poly', x1,y1,x2,y2 | pts:[x,y,…], color, w, fill, t0, layer } */

const SHAPES = [
  { id: 'line', label: 'Linie', icon: 'shLine' },
  { id: 'arrow', label: 'Pfeil', icon: 'shArrow' },
  { id: 'darrow', label: 'Doppelpfeil', icon: 'shDArrow' },
  { id: 'rect', label: 'Rechteck', icon: 'shRect' },
  { id: 'ellipse', label: 'Ellipse / Kreis', icon: 'shEllipse' },
  { id: 'triangle', label: 'Dreieck', icon: 'shTriangle' },
  { id: 'diamond', label: 'Raute', icon: 'shDiamond' },
  { id: 'axes', label: 'Koordinatenachsen', icon: 'shAxes' },
];
const PEN_KINDS = { pen: 'Kugelschreiber', pencil: 'Bleistift', marker: 'Textmarker', rainbow: 'Regenbogen', glitter: 'Glitzer' };
const INK_COLORS = ['#1f1f1f', '#605e5c', '#a19f9d', '#ffffff', '#2f5fd0', '#0aa2c0', '#038387', '#3b8a3b', '#7cc242', '#d13438',
  '#e8590c', '#e8a302', '#FFE600', '#7CFC7C', '#5ee1ff', '#ff8fd0', '#c239b3', '#6b4fbb', '#8b5a2b', '#ff8fb1'];
const PEN_WIDTHS = { pen: [0.8, 1.4, 2.2, 3.5, 5, 8], pencil: [0.8, 1.2, 1.6, 2.5, 4], marker: [6, 10, 16, 24, 34], rainbow: [2, 4, 7, 11, 16], glitter: [3, 5, 8, 12, 18] };
const CULL_MIN = 300;   // ab so vielen Zeichnungen je Seite nur den Sichtbereich ins DOM legen (Draw.render, 1.30)
const TESSERACT_URL = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';

/* ---------------------------------------------------------------- Geometrie */
const DG = {
  inkPts(d) {
    const out = [];
    for (let i = 0; i + 2 < d.pts.length; i += 3) out.push({ x: d.pts[i], y: d.pts[i + 1], p: d.pts[i + 2] });
    return out;
  },
  smooth(pts) {
    if (pts.length < 3) return pts;
    const out = [pts[0]];
    for (let i = 1; i < pts.length - 1; i++) {
      const a = pts[i - 1], b = pts[i], c = pts[i + 1];
      out.push({ x: (a.x + 2 * b.x + c.x) / 4, y: (a.y + 2 * b.y + c.y) / 4, p: b.p });
    }
    out.push(pts[pts.length - 1]);
    return out;
  },
  dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); },
  segDist(p, a, b) {
    const dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy;
    const t = l2 ? clamp(((p.x - a.x) * dx + (p.y - a.y) * dy) / l2, 0, 1) : 0;
    return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
  },
  polyDist(p, line) {
    if (line.length === 1) return this.dist(p, line[0]);
    let m = Infinity;
    for (let i = 1; i < line.length; i++) m = Math.min(m, this.segDist(p, line[i - 1], line[i]));
    return m;
  },
  inside(p, poly) {
    let c = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const a = poly[i], b = poly[j];
      if ((a.y > p.y) !== (b.y > p.y) && p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x) c = !c;
    }
    return c;
  },
  box(d) {
    const n = this.norm(d);
    return { minx: Math.min(d.x1, d.x2), maxx: Math.max(d.x1, d.x2), miny: Math.min(d.y1, d.y2), maxy: Math.max(d.y1, d.y2), ...n };
  },
  norm(d) { return { cx: (d.x1 + d.x2) / 2, cy: (d.y1 + d.y2) / 2 }; },
  /* Linienzüge einer Zeichnung (für Treffer, Rahmen, Radierer) */
  lines(d) {
    if (d.type === 'ink') return { lines: [this.inkPts(d)], closed: false };
    const P = (x, y) => ({ x, y });
    if (d.shape === 'poly' || d.shape === 'polyline') {
      const pts = [];
      for (let i = 0; i + 1 < d.pts.length; i += 2) pts.push(P(d.pts[i], d.pts[i + 1]));
      return d.shape === 'poly' ? { lines: [[...pts, pts[0]]], closed: true } : { lines: [pts], closed: false };
    }
    const b = this.box(d);
    switch (d.shape) {
      case 'rect': return { lines: [[P(b.minx, b.miny), P(b.maxx, b.miny), P(b.maxx, b.maxy), P(b.minx, b.maxy), P(b.minx, b.miny)]], closed: true };
      case 'ellipse': {
        const rx = (b.maxx - b.minx) / 2, ry = (b.maxy - b.miny) / 2, pts = [];
        for (let i = 0; i <= 48; i++) { const a = i / 48 * Math.PI * 2; pts.push(P(b.cx + rx * Math.cos(a), b.cy + ry * Math.sin(a))); }
        return { lines: [pts], closed: true };
      }
      case 'triangle': { const t = [P(b.cx, d.y1), P(b.maxx, d.y2), P(b.minx, d.y2)]; return { lines: [[...t, t[0]]], closed: true }; }
      case 'diamond': { const t = [P(b.cx, b.miny), P(b.maxx, b.cy), P(b.cx, b.maxy), P(b.minx, b.cy)]; return { lines: [[...t, t[0]]], closed: true }; }
      case 'axes': return { lines: [[P(b.minx, b.maxy), P(b.maxx, b.maxy)], [P(b.minx, b.maxy), P(b.minx, b.miny)]], closed: false };
      default: return { lines: [[P(d.x1, d.y1), P(d.x2, d.y2)]], closed: false };
    }
  },
  /* Rahmen je Zeichnung zwischengespeichert (1.30): Bildlaufbereich, Sichtbarkeit und Export fragen ihn oft für alle
   * Striche ab; neu gerechnet wird nur, wenn sich die Zeichnung ändert (gleiche Kennung wie beim Zeichnen: Draw.sig). */
  _bb: new WeakMap(),
  bbox(d) {
    const key = typeof Draw !== 'undefined' ? Draw.sig(d) : null, c = key && this._bb.get(d);
    if (c && c.key === key) return { ...c.r };
    const r = this.bboxNow(d);
    if (key) this._bb.set(d, { key, r: { ...r } });
    return r;
  },
  bboxNow(d) {
    const { lines } = this.lines(d);
    let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
    for (const l of lines) for (const p of l) { minx = Math.min(minx, p.x); maxx = Math.max(maxx, p.x); miny = Math.min(miny, p.y); maxy = Math.max(maxy, p.y); }
    const pad = d.w / 2 + (d.type === 'shape' && /arrow|axes/.test(d.shape) ? d.w * 3 + 6 : 0);
    return { x: minx - pad, y: miny - pad, w: maxx - minx + 2 * pad, h: maxy - miny + 2 * pad };
  },
  union(list) {
    if (!list.length) return null;
    let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
    for (const r of list) { x1 = Math.min(x1, r.x); y1 = Math.min(y1, r.y); x2 = Math.max(x2, r.x + r.w); y2 = Math.max(y2, r.y + r.h); }
    return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
  },
  hit(d, p, tol) {
    const { lines, closed } = this.lines(d);
    const r = d.w / 2 + tol;
    for (const l of lines) if (this.polyDist(p, l) <= r) return true;
    if (closed && d.fill && this.inside(p, lines[0])) return true;
    return false;
  },
  /* alle Koordinaten einer Zeichnung umrechnen */
  map(d, fn) {
    if (d.type === 'ink') {
      for (let i = 0; i + 2 < d.pts.length; i += 3) { const q = fn(d.pts[i], d.pts[i + 1]); d.pts[i] = r1(q.x); d.pts[i + 1] = r1(q.y); }
    } else if (d.shape === 'poly' || d.shape === 'polyline') {
      for (let i = 0; i + 1 < d.pts.length; i += 2) { const q = fn(d.pts[i], d.pts[i + 1]); d.pts[i] = r1(q.x); d.pts[i + 1] = r1(q.y); }
    } else {
      const a = fn(d.x1, d.y1), b = fn(d.x2, d.y2);
      d.x1 = r1(a.x); d.y1 = r1(a.y); d.x2 = r1(b.x); d.y2 = r1(b.y);
    }
  },
};
function r1(n) { return Math.round(n * 10) / 10; }
const n1 = (n) => Math.round(n * 10) / 10;

/* Kompakter SVG-Pfad (seit 1.26): dieselben Punkte auf dem 0.1-px-Raster wie bisher, aber relativ (q, l, a), ohne
 * wiederholte Befehlsbuchstaben und ohne führende Nullen – gleiche Form mit gut halb so viel Text. Das zählt bei
 * Freihand aus OneNote (zehntausende Punkte je Seite): Anzeige, Export „Webseite“ und Drucken werden kleiner und
 * schneller. Gerechnet wird in ganzen Zehnteln, damit sich beim Relativ-Schreiben keine Rundungsfehler aufsummieren. */
const T10 = (v) => Math.round(v * 10);
function num10(t) { const neg = t < 0, a = neg ? -t : t, i = (a / 10) | 0, f = a % 10; return (neg ? '-' : '') + (f ? (i ? i + '.' + f : '.' + f) : String(i)); }
function pathW() {
  let s = '', cx = 0, cy = 0, last = '', sep = false;
  const put = (t) => { const v = num10(t); if (sep && v.charCodeAt(0) !== 45) s += ','; s += v; sep = true; };
  const cmd = (c) => { if (c !== last) { s += c; sep = false; last = c; } };
  return {
    M(x, y) { const X = T10(x), Y = T10(y); s += 'M'; last = 'M'; sep = false; put(X); put(Y); cx = X; cy = Y; return this; },
    q(x1, y1, x, y) { const X1 = T10(x1), Y1 = T10(y1), X = T10(x), Y = T10(y); cmd('q'); put(X1 - cx); put(Y1 - cy); put(X - cx); put(Y - cy); cx = X; cy = Y; return this; },
    l(x, y) { const X = T10(x), Y = T10(y); cmd('l'); put(X - cx); put(Y - cy); cx = X; cy = Y; return this; },
    a(r, x, y) { const R = T10(r), X = T10(x), Y = T10(y); cmd('a'); put(R); put(R); s += ',0,0,0'; put(X - cx); put(Y - cy); cx = X; cy = Y; return this; },
    z() { s += 'Z'; last = 'Z'; sep = false; return this; },
    toString() { return s; },
  };
}
/* Pfad durch Punkte (für Linien mit fester Breite) */
function centerPath(pts) {
  if (!pts.length) return '';
  if (pts.length === 1) return `M${n1(pts[0].x)},${n1(pts[0].y)}l0.01,0`;
  const w = pathW().M(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length - 1; i++) { const a = pts[i], b = pts[i + 1]; w.q(a.x, a.y, (a.x + b.x) / 2, (a.y + b.y) / 2); }
  const l = pts[pts.length - 1];
  return w.l(l.x, l.y).toString();
}
/* Umriss eines Strichs mit variabler Breite (Druck) als gefüllte Fläche */
function outlinePath(pts, w, kind) {
  const n = pts.length;
  const width = (p, i) => {
    let f = 1;
    if (kind === 'pen' || kind === 'exact') f = clamp(0.35 + 1.15 * (p || 0.5), 0.3, 1.5);
    else if (kind === 'pencil') f = clamp(0.6 + 0.6 * (p || 0.5), 0.5, 1.3);
    if (kind === 'pen' && n > 6) { const t = Math.min(1, (i + 1) / 4, (n - i) / 4); f *= 0.55 + 0.45 * t; }
    return Math.max(0.35, w * f / 2);
  };
  let len = 0;
  for (let i = 1; i < n; i++) len += DG.dist(pts[i - 1], pts[i]);
  if (n === 1 || len < 0.6) {
    const p = pts[0], r = Math.max(0.6, width(p.p, 0) * 1.1);
    return `M${n1(p.x - r)},${n1(p.y)}a${n1(r)},${n1(r)} 0 1,0 ${n1(2 * r)},0a${n1(r)},${n1(r)} 0 1,0 ${n1(-2 * r)},0Z`;
  }
  const L = [], R = [], rs = [];
  for (let i = 0; i < n; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)], P = pts[i];
    let dx = b.x - a.x, dy = b.y - a.y;
    const l = Math.hypot(dx, dy) || 1;
    const nx = -dy / l, ny = dx / l, r = width(P.p, i);
    rs.push(r);
    L.push({ x: P.x + nx * r, y: P.y + ny * r });
    R.push({ x: P.x - nx * r, y: P.y - ny * r });
  }
  const pw = pathW();
  const curve = (arr) => {
    for (let i = 1; i < arr.length - 1; i++) { const a = arr[i], b = arr[i + 1]; pw.q(a.x, a.y, (a.x + b.x) / 2, (a.y + b.y) / 2); }
    const l = arr[arr.length - 1];
    pw.l(l.x, l.y);
  };
  const re = rs[n - 1], r0 = rs[0];
  const Rr = R.slice().reverse();
  pw.M(L[0].x, L[0].y); curve(L);
  pw.a(re, R[n - 1].x, R[n - 1].y); curve(Rr);
  pw.a(r0, L[0].x, L[0].y);
  return pw.z().toString();
}
/* sehr dunkle Farben werden im dunklen Design hell dargestellt (wie in OneNote) */
function isInkDark(c) {
  const m = /^#?([0-9a-f]{6})$/i.exec(c || '');
  if (!m) return false;
  const n = parseInt(m[1], 16);
  return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255 < 0.22;
}
/* Dunkle Tinte im dunklen Design (1.49): Schwarz/Grau wird Mittelgrau (#8e8e8e – lesbar auf dem dunklen Hintergrund
 * UND auf weissen Bildern/PDF-Seiten; bis 1.48 fast weiss), farbige dunkle Tinte (Dunkelblau …) wird in ihrem Farbton
 * aufgehellt statt grau. Die Farbe steht als --kd am Strich, gilt nur im dunklen Design (CSS .kbf/.kbs). */
const _kd = new Map();
function inkDarkShown(c) {
  if (_kd.has(c)) return _kd.get(c);
  let out = null;
  const v = typeof Contrast !== 'undefined' && Contrast.rgb(c);
  if (v) {
    const [h, s, l] = Contrast.hsl(v);
    if (s >= 0.18) {
      const B = [31, 31, 31];
      for (let x = Math.max(l, 0.3); x < 0.8; x += 0.02) { const t = Contrast.fromHsl(h, s, x); if (Contrast.ratio(t, B) >= 4.6) { out = Contrast.hex(t); break; } }
    }
  }
  _kd.set(c, out);
  return out;
}
const kb = (c, which) => { if (!isInkDark(c)) return ''; const k = inkDarkShown(c); return ` class="kb${which}"` + (k ? ` style="--kd:${k}"` : ''); };
function arrowHead(ax, ay, bx, by, w, color) {
  const len = Math.hypot(bx - ax, by - ay) || 1, ux = (bx - ax) / len, uy = (by - ay) / len;
  const h = Math.max(9, w * 3.6), hw = h * 0.42;
  const px = bx - ux * h, py = by - uy * h;
  return `<path${isInkDark(color) ? ' class="kbf kbs"' + (inkDarkShown(color) ? ` style="--kd:${inkDarkShown(color)}"` : '') : ''} d="M${n1(bx)},${n1(by)}L${n1(px - uy * hw)},${n1(py + ux * hw)}L${n1(px + uy * hw)},${n1(py - ux * hw)}Z" fill="${color}" stroke="${color}" stroke-width="${n1(Math.min(w, 2))}" stroke-linejoin="round"/>`;
}

/* ---------------------------------------------------------------- Formerkennung */
const Recog = {
  rdp(pts, eps) {
    if (pts.length < 3) return pts.slice();
    let idx = -1, max = 0;
    const a = pts[0], b = pts[pts.length - 1];
    for (let i = 1; i < pts.length - 1; i++) { const d = DG.segDist(pts[i], a, b); if (d > max) { max = d; idx = i; } }
    if (max <= eps) return [a, b];
    const l = this.rdp(pts.slice(0, idx + 1), eps), r = this.rdp(pts.slice(idx), eps);
    return [...l.slice(0, -1), ...r];
  },
  length(pts) { let s = 0; for (let i = 1; i < pts.length; i++) s += DG.dist(pts[i - 1], pts[i]); return s; },
  bbox(pts) {
    let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
    for (const p of pts) { x1 = Math.min(x1, p.x); y1 = Math.min(y1, p.y); x2 = Math.max(x2, p.x); y2 = Math.max(y2, p.y); }
    return { x1, y1, x2, y2, w: x2 - x1, h: y2 - y1 };
  },
  angleAt(a, b, c) {
    const v1 = { x: a.x - b.x, y: a.y - b.y }, v2 = { x: c.x - b.x, y: c.y - b.y };
    const d = Math.hypot(v1.x, v1.y) * Math.hypot(v2.x, v2.y) || 1;
    return Math.acos(clamp((v1.x * v2.x + v1.y * v2.y) / d, -1, 1)) * 180 / Math.PI;
  },
  /* Punkte -> {shape, …} oder null */
  detect(raw) {
    const pts = [];
    for (const p of raw) if (!pts.length || DG.dist(pts[pts.length - 1], p) > 0.8) pts.push({ x: p.x, y: p.y });
    if (pts.length < 2) return null;
    const bb = this.bbox(pts), diag = Math.hypot(bb.w, bb.h);
    if (diag < 14) return null;
    const len = this.length(pts);
    const first = pts[0], last = pts[pts.length - 1];
    const gap = DG.dist(first, last);
    const closed = gap < Math.max(16, 0.2 * len) && len > 1.7 * diag;
    if (!closed) {
      let dev = 0;
      for (const p of pts) dev = Math.max(dev, DG.segDist(p, first, last));
      if (dev < Math.max(5, 0.07 * len) && len < 1.25 * DG.dist(first, last) + 8) return { shape: 'line', x1: first.x, y1: first.y, x2: last.x, y2: last.y };
      return null;
    }
    // geschlossene Form
    const ring = pts.slice();
    const eps = Math.max(5, 0.045 * len);
    let poly = this.rdp([...ring, ring[0]], eps).slice(0, -1);
    // fast gerade Ecken entfernen (auch am Anfang/Ende)
    let changed = true;
    while (changed && poly.length > 3) {
      changed = false;
      for (let i = 0; i < poly.length; i++) {
        const a = poly[(i - 1 + poly.length) % poly.length], b = poly[i], c = poly[(i + 1) % poly.length];
        if (this.angleAt(a, b, c) > 150 || DG.dist(a, b) < eps * 0.9) { poly.splice(i, 1); changed = true; break; }
      }
    }
    const polyErr = (() => {
      let s = 0;
      const ln = [...poly, poly[0]];
      for (const p of pts) s += DG.polyDist(p, ln);
      return s / pts.length / diag;
    })();
    const cx = (bb.x1 + bb.x2) / 2, cy = (bb.y1 + bb.y2) / 2, rx = bb.w / 2 || 1, ry = bb.h / 2 || 1;
    let eErr = 0;
    for (const p of pts) eErr += Math.abs(Math.hypot((p.x - cx) / rx, (p.y - cy) / ry) - 1);
    eErr /= pts.length;
    const n = poly.length;
    if (n >= 3 && n <= 4 && polyErr < 0.035) {
      if (n === 3) return { shape: 'poly', pts: poly.flatMap(p => [p.x, p.y]) };
      // Rechteck (achsenparallel)?
      const axis = poly.every((p, i) => {
        const q = poly[(i + 1) % 4];
        const ang = Math.abs(Math.atan2(q.y - p.y, q.x - p.x) * 180 / Math.PI) % 90;
        return ang < 12 || ang > 78;
      });
      if (axis) {
        const xs = poly.map(p => p.x).sort((a, b) => a - b), ys = poly.map(p => p.y).sort((a, b) => a - b);
        return { shape: 'rect', x1: (xs[0] + xs[1]) / 2, y1: (ys[0] + ys[1]) / 2, x2: (xs[2] + xs[3]) / 2, y2: (ys[2] + ys[3]) / 2 };
      }
      const pb = this.bbox(poly);
      const mids = [{ x: (pb.x1 + pb.x2) / 2, y: pb.y1 }, { x: pb.x2, y: (pb.y1 + pb.y2) / 2 }, { x: (pb.x1 + pb.x2) / 2, y: pb.y2 }, { x: pb.x1, y: (pb.y1 + pb.y2) / 2 }];
      const diamond = poly.every(p => mids.some(m => DG.dist(m, p) < 0.16 * Math.hypot(pb.w, pb.h)));
      if (diamond) return { shape: 'diamond', x1: pb.x1, y1: pb.y1, x2: pb.x2, y2: pb.y2 };
      return { shape: 'poly', pts: poly.flatMap(p => [p.x, p.y]) };
    }
    if (eErr < 0.1) {
      let w = rx, h = ry;
      if (Math.abs(rx / ry - 1) < 0.12) { w = h = (rx + ry) / 2; }
      return { shape: 'ellipse', x1: cx - w, y1: cy - h, x2: cx + w, y2: cy + h };
    }
    if (n >= 5 && n <= 8 && polyErr < 0.03) return { shape: 'poly', pts: poly.flatMap(p => [p.x, p.y]) };
    return null;
  },
};

/* ---------------------------------------------------------------- Zeichnen */
const Draw = {
  tool: 'select',
  shape: 'line',
  sel: new Set(),
  drag: null,
  touches: new Map(),

  init() {
    this.gUnder = $('#layer-draw-under > g');
    this.gMark = $('#layer-draw-mark > g');
    this.gOver = $('#layer-draw-over > g');
    this.tools = $('#layer-tools');
    this.selSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    this.selSvg.setAttribute('class', 'dsel-svg');
    this.tools.append(this.selSvg);
    this.buildTools();
  },

  /* ---------------------------------------------------------- Werkzeuge */
  setTool(t, opt) {
    if (t === 'shape' && opt) this.shape = opt;
    if (t === 'pen' && opt != null) Store.ui.activePen = clamp(+opt || 0, 0, Store.ui.pens.length - 1);
    this.tool = t;
    if (t !== 'select') { this._lastTool = t; Canvas.stopEditing(); }
    this.updateToggle();
    const vp = Canvas.vp;
    vp.classList.remove('tool-pen', 'tool-eraser', 'tool-lasso', 'tool-shape');
    if (t !== 'select') vp.classList.add('tool-' + t);
    if (t === 'eraser') this.updateEraserCursor();
    document.body.classList.toggle('drawing-mode', t !== 'select');
    UiState.saveSoon();
    this.hint();
    if (Ribbon.tab === 'start') Ribbon.show('start'); else Ribbon.refreshSoon();
  },
  activePen() { return Store.ui.pens[Store.ui.activePen] || Store.ui.pens[0]; },
  /* Knopf rechts in der Registerzeile (1.49): zwischen „Auswählen“ und dem zuletzt benutzten Stift/Werkzeug wechseln */
  toggleSelect() {
    if (this.tool === 'select') this.setTool(this._lastTool || 'pen');
    else this.setTool('select');
  },
  updateToggle() {
    const sel = this.tool === 'select', last = this._lastTool || 'pen';
    const ic = sel ? (last === 'eraser' ? 'eraser' : last === 'lasso' ? 'lasso' : last === 'shape' ? 'shapes' : 'pen') : 'pointer';
    const tip = sel ? 'Zum Stift wechseln (zuletzt benutzt)' : 'Zu „Auswählen“ wechseln (Esc)';
    for (const b of [$('#rb-draw'), $('#fs-draw')]) {
      if (!b) continue;
      b.innerHTML = icon(ic, 20) + `<span>${sel ? 'Stift' : 'Auswählen'}</span>`;   // seit 1.50 grösser
      b.title = tip;
      b.classList.toggle('on', !sel);
      if (!sel) { const p = this.activePen(); b.style.setProperty('--pc', last === 'pen' && p ? p.color : 'var(--accent)'); }
    }
  },
  hint() {
    const h = $('#sb-hint');
    if (!h) return;
    const map = {
      pen: 'Zeichnen: ziehen = Strich · am Lineal entlang = gerade Linie · Esc = Auswählen' + (Store.ui.recognize ? ' · Formerkennung an' : ''),
      eraser: Store.ui.eraserMode === 'punkt' ? 'Punkt-Radierer: über Striche fahren radiert nur diese Stelle · Esc = Auswählen' : 'Strich-Radierer: über einen Strich fahren löscht ihn ganz · Esc = Auswählen',
      lasso: 'Lasso: um Striche, Formen und Textfelder herumfahren, um sie auszuwählen',
      shape: 'Form: ziehen · Umschalt = gerade / gleichmässig · Esc = Auswählen',
    };
    if (map[this.tool]) h.textContent = map[this.tool];
    else Canvas.updateStatus();
  },
  updateEraserCursor() {
    const r = Store.ui.eraserMode === 'punkt' ? clamp(Store.ui.eraserSize || 14, 6, 60) / 2 : 7;
    const s = Math.ceil(r * 2 + 4);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}"><circle cx="${s / 2}" cy="${s / 2}" r="${r}" fill="rgba(255,255,255,.6)" stroke="#444" stroke-width="1.2"/></svg>`;
    Canvas.vp.style.setProperty('--eraser-cursor', `url("data:image/svg+xml,${encodeURIComponent(svg)}") ${s / 2} ${s / 2}, crosshair`);
  },

  /* ---------------------------------------------------------- Darstellung */
  sig(d) {
    if (d.type === 'ink') { const p = d.pts, n = p.length; return `i|${d.sharp ? 's' : ''}${d.fit ? 'f' : ''}${d.np ? 'n' : ''}${d.kind}|${d.color}|${d.w}|${n}|${p[0]}|${p[1]}|${p[n - 3]}|${p[n - 2]}|${p[(n / 2 | 0) - ((n / 2 | 0) % 3)]}`; }
    return `s|${d.shape}|${d.color}|${d.w}|${d.fill}|${d.x1}|${d.y1}|${d.x2}|${d.y2}|${d.pts ? d.pts.join(',') : ''}`;
  },
  markup(d) {
    const c = d.color || '#1f1f1f', w = d.w || 2;
    if (d.type === 'ink') {
      // aus OneNote: jeden Punkt genau übernehmen (keine Glättung, keine Verjüngung an den Enden)
      if (d.fit && !d.sharp) {
        const q = DG.inkPts(d);
        if (d.kind === 'marker') return `<path class="ink-marker" d="${centerPath(q)}" fill="none" stroke="${c}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;
        if (d.np) return `<path${kb(c, 's')} d="${centerPath(q)}" fill="none" stroke="${c}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;
        return `<path${kb(c, 'f')} d="${outlinePath(q, w, 'exact')}" fill="${c}"/>`;
      }
      const pts = d.sharp ? DG.inkPts(d) : DG.smooth(DG.inkPts(d));
      if (d.sharp) {
        const pw = pathW().M(pts[0].x, pts[0].y);
        for (let i = 1; i < pts.length; i++) pw.l(pts[i].x, pts[i].y);
        const path = pw.toString();
        return `<path${d.kind === 'marker' ? ' class="ink-marker"' : kb(c, 's')} d="${path}" fill="none" stroke="${c}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;
      }
      switch (d.kind) {
        case 'marker': return `<path class="ink-marker" d="${centerPath(pts)}" fill="none" stroke="${c}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;
        case 'pencil': return `<path${kb(c, 'f')} d="${outlinePath(pts, w, 'pencil')}" fill="${c}" opacity=".85" filter="url(#kt-pencil)"/>`;
        case 'rainbow': return `<path d="${outlinePath(pts, w, 'rainbow')}" fill="url(#kt-rainbow)"/>`;
        case 'glitter': { const o = outlinePath(pts, w, 'glitter'); return `<path d="${o}" fill="url(#kt-gold)"/><path d="${o}" fill="url(#kt-glitter)"/>`; }
        default: return `<path${kb(c, 'f')} d="${outlinePath(pts, w, 'pen')}" fill="${c}"/>`;
      }
    }
    const sw = `stroke="${c}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"${kb(c, 's')}`;
    const fill = d.fill ? `fill="${d.fill}"` : 'fill="none"';
    const b = DG.box(d);
    switch (d.shape) {
      case 'line': return `<line x1="${n1(d.x1)}" y1="${n1(d.y1)}" x2="${n1(d.x2)}" y2="${n1(d.y2)}" ${sw}/>`;
      case 'arrow': case 'darrow': {
        const len = Math.hypot(d.x2 - d.x1, d.y2 - d.y1) || 1, ux = (d.x2 - d.x1) / len, uy = (d.y2 - d.y1) / len;
        const h = Math.min(len * 0.45, Math.max(9, w * 3.6) * 0.75);
        const a = d.shape === 'darrow' ? { x: d.x1 + ux * h, y: d.y1 + uy * h } : { x: d.x1, y: d.y1 };
        const e = { x: d.x2 - ux * h, y: d.y2 - uy * h };
        return `<line x1="${n1(a.x)}" y1="${n1(a.y)}" x2="${n1(e.x)}" y2="${n1(e.y)}" ${sw}/>` + arrowHead(d.x1, d.y1, d.x2, d.y2, w, c) +
          (d.shape === 'darrow' ? arrowHead(d.x2, d.y2, d.x1, d.y1, w, c) : '');
      }
      case 'rect': return `<rect x="${n1(b.minx)}" y="${n1(b.miny)}" width="${n1(b.maxx - b.minx)}" height="${n1(b.maxy - b.miny)}" ${sw} ${fill}/>`;
      case 'ellipse': return `<ellipse cx="${n1(b.cx)}" cy="${n1(b.cy)}" rx="${n1((b.maxx - b.minx) / 2)}" ry="${n1((b.maxy - b.miny) / 2)}" ${sw} ${fill}/>`;
      case 'triangle': case 'diamond': case 'poly': {
        const l = DG.lines(d).lines[0].slice(0, -1);
        return `<polygon points="${l.map(p => n1(p.x) + ',' + n1(p.y)).join(' ')}" ${sw} ${fill}/>`;
      }
      case 'polyline': {
        const l = DG.lines(d).lines[0];
        return `<polyline points="${l.map(p => n1(p.x) + ',' + n1(p.y)).join(' ')}" ${sw} fill="none"/>`;
      }
      case 'axes': {
        const o = { x: b.minx, y: b.maxy };
        const h = Math.max(9, w * 3.6) * 0.75;
        return `<path d="M${n1(o.x)},${n1(o.y)}H${n1(b.maxx - h)}M${n1(o.x)},${n1(o.y)}V${n1(b.miny + h)}" ${sw} fill="none"/>` +
          arrowHead(o.x, o.y, b.maxx, o.y, w, c) + arrowHead(o.x, o.y, o.x, b.miny, w, c);
      }
    }
    return '';
  },
  /* Bereich (Seitenkoordinaten), dessen Striche im DOM liegen: sichtbarer Ausschnitt plus pad Bildschirme ringsum */
  cullRect(pad) {
    const v = Canvas.view, z = v.z || 1, W = Canvas.vp.clientWidth, H = Canvas.vp.clientHeight, m = pad * Math.max(W, H) / z;
    return { x1: -v.x / z - m, y1: -v.y / z - m, x2: (W - v.x) / z + m, y2: (H - v.y) / z + m };
  },
  renderSoon() {
    if (this._cullT) return;
    this._cullT = requestAnimationFrame(() => { this._cullT = null; this.render(); });
  },
  /* Zeichnungen in die drei SVG-Ebenen (seit 1.30 schrittweise statt jedes Mal alles neu als Text):
   * jedes <g data-d> bleibt bestehen, solange sich die Zeichnung nicht ändert; neu gebaut werden nur geänderte, neue
   * werden ergänzt, die Reihenfolge wird nur korrigiert, wo sie nicht stimmt. Beim Öffnen einer Seite mit sehr vielen
   * Strichen (OneNote-Freihand: tausende) kommen höchstens 1200 neue je Bild dazu, der Rest in den nächsten Bildern –
   * so bleibt das Programm bedienbar. all = alles sofort (Export, Drucken).
   * Sichtbereich (1.30): auf Seiten mit vielen Zeichnungen liegen nur die im Bild und einen Bildschirm ringsum im DOM.
   * Chrome rechnet sonst bei jeder Änderung alle Striche durch (Layerize, bei 2700 Strichen ~200 ms je Bild); beim
   * Verschieben kommen die nächsten dazu, bevor sie sichtbar werden (onView). Ausgewählte bleiben immer im DOM. */
  render(all) {
    const p = Canvas.page;
    if (!this.gOver) return;
    if (Canvas.scrollSoon) Canvas.scrollSoon();
    const els = this.els || (this.els = new Map());
    if (!p) { this.gUnder.innerHTML = this.gMark.innerHTML = this.gOver.innerHTML = ''; els.clear(); this.sel.clear(); this.renderSel(); this.renderTools(); return; }
    if (this._elsPage !== p) { this._elsPage = p; for (const r of els.values()) r.g.remove(); els.clear(); }
    const R = all !== true && p.drawings.length > CULL_MIN && Canvas.vp.clientWidth > 0 ? this.cullRect(1) : null;
    this._cull = R;
    const show = (d) => { if (!R || this.sel.has(d.id)) return true; const b = DG.bbox(d); return b.x <= R.x2 && b.x + b.w >= R.x1 && b.y <= R.y2 && b.y + b.h >= R.y1; };
    const U = [], M = [], O = [];
    for (const d of p.drawings) if (d.bg && show(d)) U.push(d);
    for (const d of p.drawings) { if (d.bg || !show(d)) continue; if (d.layer === 'unten') U.push(d); else if (d.type === 'ink' && d.kind === 'marker') M.push(d); else O.push(d); }
    let budget = all === true || all === 'view' ? Infinity : 1200, more = false;   // 'view': Sichtbereich, aber sofort ganz (Vorschau, 1.35)
    const seen = new Set(), fresh = [];
    const prep = (list, box) => list.map(d => {
      seen.add(d.id);
      const key = this.sig(d);
      let r = els.get(d.id);
      if (r && r.key === key && r.box === box) return r;
      if (!r && budget <= 0) { more = true; return null; }
      if (!r) budget--;
      if (r) r.g.remove();
      r = { key, box, g: null, html: `<g data-d="${d.id}">${this.markup(d)}</g>` };
      els.set(d.id, r);
      fresh.push(r);
      return r;
    }).filter(Boolean);
    const want = [[this.gUnder, prep(U, 'u')], [this.gMark, prep(M, 'm')], [this.gOver, prep(O, 'o')]];
    for (const [id, r] of els) if (!seen.has(id)) { r.g && r.g.remove(); els.delete(id); }
    // neue/geänderte auf einmal einlesen (ein Parser-Durchgang)
    if (fresh.length) {
      const tmp = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      tmp.innerHTML = fresh.map(r => r.html).join('');
      const kids = tmp.children;
      fresh.forEach((r, i) => { r.g = kids[i]; delete r.html; });
      // (kids ist live – erst nach dem Zuordnen einhängen)
    }
    for (const [box, list] of want) {
      let cur = box.firstElementChild;
      while (cur && !cur.hasAttribute('data-d')) cur = cur.nextElementSibling;
      for (const r of list) {
        if (r.g === cur) { cur = cur.nextElementSibling; while (cur && !cur.hasAttribute('data-d')) cur = cur.nextElementSibling; continue; }
        box.insertBefore(r.g, cur);
      }
    }
    for (const [id, r] of els) { const on = this.sel.has(id); if (r.g.classList.contains('dsel') !== on) r.g.classList.toggle('dsel', on); }
    if (this.sel.size) { const ids = new Set(p.drawings.map(d => d.id)); for (const id of [...this.sel]) if (!ids.has(id)) this.sel.delete(id); }
    this.renderSel();
    this.renderTools();
    if (more && !this._moreT) this._moreT = requestAnimationFrame(() => { this._moreT = null; this.render(); });
  },
  drawing(id) { return Canvas.page ? Canvas.page.drawings.find(d => d.id === id) : null; },
  selected() { return Canvas.page ? Canvas.page.drawings.filter(d => this.sel.has(d.id)) : []; },
  onView() {
    if (this.sel.size) this.renderSel();
    // Sichtbereich: nachladen, bevor der Rand ins Bild kommt; nach starkem Hineinzoomen wieder verkleinern
    const R = this._cull;
    if (!R || !Canvas.page) return;
    const V = this.cullRect(0.25);
    if (V.x1 < R.x1 || V.y1 < R.y1 || V.x2 > R.x2 || V.y2 > R.y2 || (R.x2 - R.x1) > 6 * (V.x2 - V.x1)) this.renderSoon();
  },

  /* Auswahlrahmen mit Eckpunkten zum Skalieren */
  renderSel() {
    const svg = this.selSvg;
    if (!svg) return;
    const list = this.selected();
    if (!list.length) { svg.innerHTML = ''; return; }
    const r = DG.union(list.map(d => DG.bbox(d)));
    const z = Canvas.view.z, hs = 9 / z, pad = 4 / z;
    const x = r.x - pad, y = r.y - pad, w = r.w + 2 * pad, h = r.h + 2 * pad;
    const corners = [[x, y, 'nw'], [x + w, y, 'ne'], [x + w, y + h, 'se'], [x, y + h, 'sw']];
    svg.innerHTML = `<rect class="dsel-frame" data-dh="move" x="${x}" y="${y}" width="${w}" height="${h}"/>` +
      corners.map(([cx, cy, k], i) => `<rect class="dsel-h ${k}" data-dh="${i}" x="${cx - hs / 2}" y="${cy - hs / 2}" width="${hs}" height="${hs}"/>`).join('');
    this.selBox = { x, y, w, h };
  },
  select(ids, additive) {
    if (!additive) this.sel.clear();
    for (const id of ids) this.sel.add(id);
    this.render();
    this.selInfo();
    Ribbon.refreshSoon();
  },
  clearSel(silent) {
    if (!this.sel.size) return;
    this.sel.clear();
    if (!silent) { this.render(); Ribbon.refreshSoon(); }
    else { for (const g of $$('#world g.dsel')) g.classList.remove('dsel'); this.renderSel(); }
  },
  selInfo() {
    if (!this.sel.size) return;
    $('#sb-hint').textContent = `${this.sel.size} Zeichnung${this.sel.size === 1 ? '' : 'en'} ausgewählt · ziehen = verschieben · Ecken = Grösse · Entf = löschen · Rechtsklick = Optionen`;
  },
  selectInRect(r) {
    const ids = [];
    for (const d of Canvas.page.drawings) {
      const b = DG.bbox(d);
      if (b.x >= r.x && b.y >= r.y && b.x + b.w <= r.x + r.w && b.y + b.h <= r.y + r.h) ids.push(d.id);
    }
    if (ids.length) this.select(ids, true);
  },
  /* includeBg: auch Hintergrund-Zeichnungen (sonst nur, wenn sie schon ausgewählt sind – zum Verschieben) */
  hitAt(w, includeUnder, skipMarker, includeBg) {
    const p = Canvas.page;
    if (!p) return null;
    const tol = 5 / Canvas.view.z;
    for (let i = p.drawings.length - 1; i >= 0; i--) {
      const d = p.drawings[i];
      if (d.layer === 'unten' || d.bg) continue;
      if (skipMarker && d.type === 'ink' && d.kind === 'marker') continue;
      if (DG.hit(d, w, tol)) return d;
    }
    if (includeUnder) {
      for (let i = p.drawings.length - 1; i >= 0; i--) {
        const d = p.drawings[i];
        if (d.layer === 'unten' && !d.bg && DG.hit(d, w, tol)) return d;
      }
    }
    for (let i = p.drawings.length - 1; i >= 0; i--) {
      const d = p.drawings[i];
      if (d.bg && (includeBg || this.sel.has(d.id)) && DG.hit(d, w, tol)) return d;
    }
    return null;
  },
  /* oberste Hintergrund-Zeichnung an dieser Stelle (Klick auf die Fläche wählt sie aus) */
  hitBg(w) {
    const p = Canvas.page;
    if (!p) return null;
    const tol = 5 / Canvas.view.z;
    for (let i = p.drawings.length - 1; i >= 0; i--) { const d = p.drawings[i]; if (d.bg && DG.hit(d, w, tol)) return d; }
    return null;
  },

  /* ---------------------------------------------------------- Maus / Stift / Finger */
  onDown(ev) {
    if (!Canvas.page || App.preview) return false;
    if (ev.pointerType === 'touch' && this.touchDown(ev)) return true;
    const eraserBtn = ev.pointerType === 'pen' && (ev.buttons & 32);
    if (ev.button !== 0 && !eraserBtn) return false;
    if (Canvas.spaceDown) return false;
    const t = ev.target;
    const w = Canvas.toWorld(ev.clientX, ev.clientY);
    const base = { pid: ev.pointerId, ptype: ev.pointerType, sx: ev.clientX, sy: ev.clientY, w0: w, moved: false };

    // Auswahlrahmen
    const dh = t.closest && t.closest('[data-dh]');
    if (dh && this.sel.size && !(ev.altKey && dh.dataset.dh === 'move')) {
      ev.preventDefault();
      Canvas.stopEditing();
      const orig = new Map(this.selected().filter(d => !d.bg).map(d => [d.id, JSON.parse(JSON.stringify(d))]));   // Hintergrund verankert (1.45)
      if (dh.dataset.dh === 'move') {
        this.drag = { ...base, type: 'move', orig, boxes: this.movableBoxes() };
      } else {
        const r = this.selBox, i = +dh.dataset.dh;
        const corners = [[r.x, r.y], [r.x + r.w, r.y], [r.x + r.w, r.y + r.h], [r.x, r.y + r.h]];
        const a = corners[(i + 2) % 4], c = corners[i];
        this.drag = { ...base, type: 'scale', orig, ax: a[0], ay: a[1], cx: c[0], cy: c[1] };
      }
      Canvas.capture(ev);
      return true;
    }
    // Lineal / Winkelmesser
    const tl = t.closest && t.closest('.kt-tool');
    let snap = null;
    if (tl) {
      const which = tl.dataset.tool;
      if (t.closest('.kt-rot')) { ev.preventDefault(); this.drag = { ...base, type: 'toolRot', which }; Canvas.capture(ev); return true; }
      if (t.closest('.kt-size')) {   // Grösse ändern (1.27): Lineal – das linke Ende bleibt, Winkelmesser – der Mittelpunkt
        ev.preventDefault();
        // zweimal schnell drücken = wieder an den Bildschirm anpassen (dblclick kommt wegen der Zeiger-Erfassung nicht an)
        const now = Date.now();
        if (this._sizeTap && this._sizeTap.w === which && now - this._sizeTap.t < 450) { this._sizeTap = null; this.fitTool(which); this.renderTools(); UiState.saveSoon(); return true; }
        this._sizeTap = { w: which, t: now };
        const st = Store.ui[which], g = this.geomOf(which), an = st.angle * Math.PI / 180;
        this.drag = { ...base, type: 'toolSize', which, lx: st.x - Math.cos(an) * g.W / 2, ly: st.y - Math.sin(an) * g.W / 2 };
        Canvas.capture(ev);
        return true;
      }
      if (which === 'ruler' && (this.tool === 'pen' && !eraserBtn)) snap = this.rulerSnap(w);
      if (!snap) {
        ev.preventDefault();
        const st = Store.ui[which];
        this.drag = { ...base, type: 'toolMove', which, ox: st.x, oy: st.y };
        Canvas.capture(ev);
        return true;
      }
    }
    if (!snap && this.tool === 'pen' && Store.ui.ruler.visible) snap = this.rulerSnap(w);

    let mode = eraserBtn ? 'eraser' : this.tool;
    if (mode === 'select') return this.selectDown(ev, base, w);
    if (Store.ui.penOnly && ev.pointerType === 'touch') return false;
    ev.preventDefault();
    Canvas.stopEditing();
    if (document.activeElement && document.activeElement !== document.body && document.activeElement !== Canvas.vp) document.activeElement.blur();
    if (Canvas.sel.size || Canvas.selLink) Canvas.clearSel();
    if (mode !== 'lasso') this.clearSel();
    Canvas.capture(ev);
    if (mode === 'pen') {
      const pen = this.activePen();
      const pr = this.pressure(ev);
      const q = snap ? snap.project(w) : w;
      this.drag = { ...base, type: 'ink', pen: { ...pen }, pts: [r1(q.x), r1(q.y), pr], t0: Date.now(), snap };
      this.live = this.liveEl(pen.kind === 'marker' ? this.gMark : this.gOver);
      this.renderLive();
    } else if (mode === 'eraser') {
      this.drag = { ...base, type: 'erase', point: Store.ui.eraserMode === 'punkt' && !eraserBtn, removed: 0, changed: false, last: w };
      this.eraseAt(w);
    } else if (mode === 'lasso') {
      this.drag = { ...base, type: 'lasso', pts: [w], additive: ev.shiftKey || ev.ctrlKey };
    } else if (mode === 'shape') {
      this.drag = { ...base, type: 'shape', shape: this.shape, x1: w.x, y1: w.y, x2: w.x, y2: w.y };
      this.live = this.liveEl(this.gOver);
    }
    return true;
  },
  selectDown(ev, base, w) {
    const t = ev.target;
    // Alt+Klick: Objekte an dieser Stelle der Reihe nach auswählen (auch hinter/vor Bildern)
    if (ev.altKey && !t.closest('.sock, .link-handle, .box-rs, .fimg-rs, .fimg-play') && Canvas.cycleAt(ev, base, w)) return true;
    if (t.closest('.box-text') && Canvas.editing && t.closest('.box')?.dataset.id === Canvas.editing) return false;
    // Schrift/Zeichnung vor einem Bild hat Vorrang vor dem Bild
    const onImg = !!t.closest('.fimg') && !t.closest('.fimg-rs, .fimg-play');
    // Felder vor den Zeichnungen (1.46) verdecken die Zeichnungen; Bilder (#layer-pics) liegen unter ALLEN Zeichnungen
    const front = !!t.closest('#layer-front'), inPics = !!t.closest('#layer-pics');
    if (front || t.closest('.sock, .link-handle, .box-rs, .fimg-rs, .fimg-play, .pkg-head, [data-link]') || (onImg && !this.hitAt(w, inPics, false))) { if (!ev.shiftKey && !ev.ctrlKey) this.clearSel(true); return false; }
    const inText = !!t.closest('.box-text');
    // ein nicht ausgewähltes Hintergrund-Objekt zählt wie die freie Fläche (Zeichnungen darüber sind treffbar)
    const onNode = !!t.closest('.box, .pkg') && !t.closest('.box.bg:not(.sel)');
    const d = this.hitAt(w, !onNode || inPics, inText);
    if (!d) { if (!ev.shiftKey && !ev.ctrlKey) this.clearSel(true); return false; }
    ev.preventDefault();
    Canvas.stopEditing();
    if (ev.shiftKey || ev.ctrlKey) {
      if (this.sel.has(d.id)) this.sel.delete(d.id); else this.sel.add(d.id);
      this.render();
    } else if (!this.sel.has(d.id)) {
      if (Canvas.sel.size || Canvas.selLink) { Canvas.sel.clear(); Canvas.selLink = null; Canvas.refreshSel(); }
      this.select([d.id]);
    }
    this.selInfo();
    Ribbon.refreshSoon();
    const orig = new Map(this.selected().filter(x => !x.bg).map(x => [x.id, JSON.parse(JSON.stringify(x))]));   // Hintergrund verankert (1.45)
    this.drag = { ...base, type: 'move', orig, boxes: this.movableBoxes() };
    Canvas.capture(ev);
    return true;
  },
  movableBoxes() { return Canvas.selectedBoxes().filter(b => !Canvas.isLocked(b)).map(b => ({ b, x: b.x, y: b.y })); },
  pressure(ev) {
    if (ev.pointerType !== 'pen') return 0.5;
    return Math.round(clamp(ev.pressure || 0.5, 0.05, 1) * 100) / 100;
  },
  liveEl(parent) {
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.setAttribute('class', 'live');
    parent.append(g);
    return g;
  },

  onMove(ev) {
    if (ev.pointerType === 'touch' && this.touches.has(ev.pointerId)) {
      this.touches.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
      if (this.drag && (this.drag.type === 'pinch' || this.drag.type === 'tpan')) { this.touchMove(); return true; }
    }
    const d = this.drag;
    if (!d || d.pid !== ev.pointerId) return !!d && (d.type === 'pinch');
    const z = Canvas.view.z;
    if (!d.moved && Math.hypot(ev.clientX - d.sx, ev.clientY - d.sy) >= 3) d.moved = true;
    const w = Canvas.toWorld(ev.clientX, ev.clientY);
    switch (d.type) {
      case 'ink': {
        const evs = ev.getCoalescedEvents ? ev.getCoalescedEvents() : [ev];
        for (const e of (evs.length ? evs : [ev])) {
          let q = Canvas.toWorld(e.clientX, e.clientY);
          if (d.snap) q = d.snap.project(q);
          const n = d.pts.length;
          if (Math.hypot(q.x - d.pts[n - 3], q.y - d.pts[n - 2]) < 0.9 / z) continue;
          if (d.snap && n >= 6) { d.pts.splice(3, n - 3); }
          d.pts.push(r1(q.x), r1(q.y), this.pressure(e));
        }
        this.renderLive();
        break;
      }
      case 'erase': {
        const steps = Math.max(1, Math.ceil(DG.dist(d.last, w) / (4 / z)));
        for (let i = 1; i <= steps; i++) this.eraseAt({ x: d.last.x + (w.x - d.last.x) * i / steps, y: d.last.y + (w.y - d.last.y) * i / steps });
        d.last = w;
        break;
      }
      case 'lasso': {
        const l = d.pts[d.pts.length - 1];
        if (DG.dist(l, w) > 3 / z) d.pts.push(w);
        Canvas.ov.innerHTML = `<path class="lasso-line" d="M${d.pts.map(p => n1(p.x) + ',' + n1(p.y)).join('L')}Z"/>`;
        break;
      }
      case 'shape': {
        let x2 = w.x, y2 = w.y;
        if (ev.shiftKey) {
          const dx = x2 - d.x1, dy = y2 - d.y1;
          if (['line', 'arrow', 'darrow'].includes(d.shape)) {
            const a = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4), L = Math.hypot(dx, dy);
            x2 = d.x1 + Math.cos(a) * L; y2 = d.y1 + Math.sin(a) * L;
          } else { const s = Math.max(Math.abs(dx), Math.abs(dy)); x2 = d.x1 + Math.sign(dx || 1) * s; y2 = d.y1 + Math.sign(dy || 1) * s; }
        }
        d.x2 = x2; d.y2 = y2;
        const sh = this.newShape(d);
        this.live.innerHTML = this.markup(sh);
        break;
      }
      case 'move': {
        const dx = (ev.clientX - d.sx) / z, dy = (ev.clientY - d.sy) / z;
        for (const [id, o] of d.orig) {
          const cur = this.drawing(id);
          if (!cur) continue;
          const copy = JSON.parse(JSON.stringify(o));
          DG.map(copy, (x, y) => ({ x: x + dx, y: y + dy }));
          Object.assign(cur, copy);
        }
        for (const it of d.boxes) {
          it.b.x = Math.round(it.x + dx); it.b.y = Math.round(it.y + dy);
          const e = Canvas.els.get(it.b.id);
          if (e) { e.style.left = it.b.x + 'px'; e.style.top = it.b.y + 'px'; }
        }
        if (d.boxes.length) Canvas.layout();
        this.render();
        break;
      }
      case 'scale': {
        let sx = (w.x - d.ax) / ((d.cx - d.ax) || 1), sy = (w.y - d.ay) / ((d.cy - d.ay) || 1);
        if (!ev.shiftKey) { const s = Math.max(Math.abs(sx), Math.abs(sy)); sx = Math.sign(sx || 1) * s; sy = Math.sign(sy || 1) * s; }
        if (Math.abs(sx) < 0.05) sx = 0.05 * Math.sign(sx || 1);
        if (Math.abs(sy) < 0.05) sy = 0.05 * Math.sign(sy || 1);
        for (const [id, o] of d.orig) {
          const cur = this.drawing(id);
          if (!cur) continue;
          const copy = JSON.parse(JSON.stringify(o));
          DG.map(copy, (x, y) => ({ x: d.ax + (x - d.ax) * sx, y: d.ay + (y - d.ay) * sy }));
          Object.assign(cur, copy);
        }
        this.render();
        break;
      }
      case 'toolMove': {
        const st = Store.ui[d.which];
        st.x = Math.round(d.ox + (ev.clientX - d.sx) / z); st.y = Math.round(d.oy + (ev.clientY - d.sy) / z);
        this.renderTools();
        break;
      }
      case 'toolSize': {
        const st = Store.ui[d.which], cm = this.cmPx().px, an = st.angle * Math.PI / 180, ux = Math.cos(an), uy = Math.sin(an);
        if (d.which === 'ruler') {
          const along = (w.x - d.lx) * ux + (w.y - d.ly) * uy;
          st.len = clamp(Math.round((along - 16) / cm), 3, 200);
          const W = st.len * cm + 16;
          st.x = Math.round(d.lx + ux * W / 2); st.y = Math.round(d.ly + uy * W / 2);
        } else st.r = clamp(Math.round(Math.hypot(w.x - st.x, w.y - st.y) / cm * 2) / 2, 2, 100);
        st.fix = true;
        this.renderTools();
        break;
      }
      case 'toolRot': {
        const st = Store.ui[d.which];
        let a = Math.atan2(w.y - st.y, w.x - st.x) * 180 / Math.PI;
        a = Math.round(a);
        for (const s of [0, 45, 90, 135, 180, -45, -90, -135, -180]) if (Math.abs(a - s) <= 2) a = s;
        st.angle = ((a % 360) + 360) % 360;
        this.renderTools();
        break;
      }
    }
    return true;
  },

  onUp(ev, cancel) {
    if (ev.pointerType === 'touch' && this.touches.has(ev.pointerId)) {
      this.touches.delete(ev.pointerId);
      if (this.drag && (this.drag.type === 'pinch' || this.drag.type === 'tpan')) {
        if (this.touches.size === 0) this.drag = null;
        else if (this.drag.type === 'pinch') this.drag = { type: 'tpan-wait' };
        return true;
      }
      if (this.drag && this.drag.type === 'tpan-wait') { if (!this.touches.size) this.drag = null; return true; }
    }
    const d = this.drag;
    if (!d || d.pid !== ev.pointerId) return false;
    this.drag = null;
    try { Canvas.vp.releasePointerCapture(ev.pointerId); } catch (e) { /* */ }
    const p = Canvas.page;
    if (this.live) { this.live.remove(); this.live = null; }
    if (cancel || !p) { this.render(); return true; }
    switch (d.type) {
      case 'ink': {
        const pen = d.pen;
        const ink = { id: uid('d'), type: 'ink', kind: pen.kind, color: pen.color, w: pen.w, pts: d.pts, t0: d.t0, dur: Date.now() - d.t0, layer: 'oben' };
        let label = 'Freihand';
        if (Store.ui.recognize && !d.snap && (pen.kind === 'pen' || pen.kind === 'pencil')) {
          const sh = Recog.detect(DG.inkPts(ink));
          if (sh) { p.drawings.push(this.shapeFromRecog(sh, ink)); label = 'Form erkannt'; break; }
        }
        p.drawings.push(ink);
        Hist.touchPage(Canvas.pageId); Hist.commit(label);
        this.render();
        return true;
      }
      case 'erase':
        if (d.changed) { Hist.touchPage(Canvas.pageId); Hist.commit('Radiert'); }
        return true;
      case 'lasso': {
        Canvas.ov.innerHTML = '';
        if (d.pts.length < 3) { this.clearSel(); Canvas.clearSel(); return true; }
        const poly = d.pts;
        const ids = [];
        for (const dr of p.drawings) {
          const pts = DG.lines(dr).lines.flat();
          const inside = pts.filter(q => DG.inside(q, poly)).length;
          if (inside >= Math.max(1, pts.length * 0.6)) ids.push(dr.id);
        }
        const nodes = [];
        for (const k of p.pkgs) { const r = Canvas.rects.get(k.id); if (r && DG.inside(rectCenter(r), poly)) nodes.push(k.id); }
        for (const b of p.boxes) { if (b.pkg && nodes.includes(b.pkg)) continue; const r = Canvas.rects.get(b.id); if (r && DG.inside(rectCenter(r), poly)) nodes.push(b.id); }
        if (!d.additive) { Canvas.sel.clear(); Canvas.selLink = null; }
        for (const id of nodes) Canvas.sel.add(id);
        Canvas.refreshSel();
        this.select(ids, d.additive);
        if (!ids.length && !nodes.length) UI.toast('Nichts eingefangen – einfach um die Striche herumfahren');
        else $('#sb-hint').textContent = `${ids.length + nodes.length} Element(e) ausgewählt · verschieben: Rahmen ziehen · Entf = löschen · Rechtsklick = Optionen`;
        return true;
      }
      case 'shape': {
        if (Math.hypot(d.x2 - d.x1, d.y2 - d.y1) * Canvas.view.z < 4) { this.render(); return true; }
        const sh = this.newShape(d);
        p.drawings.push(sh);
        Hist.touchPage(Canvas.pageId); Hist.commit((SHAPES.find(s => s.id === d.shape) || {}).label || 'Form');
        this.render();
        return true;
      }
      case 'move':
        if (d.moved) { Hist.touchPage(Canvas.pageId); Hist.commit('Verschieben'); }
        this.render();
        return true;
      case 'scale':
        if (d.moved) { Hist.touchPage(Canvas.pageId); Hist.commit('Grösse geändert'); }
        this.render();
        return true;
      case 'toolMove': case 'toolRot':
        UiState.saveSoon();
        return true;
    }
    Hist.touchPage(Canvas.pageId); Hist.commit('Form erkannt');
    this.render();
    return true;
  },
  newShape(d) {
    const pen = this.activePen();
    const color = pen.kind === 'rainbow' || pen.kind === 'glitter' ? '#1f1f1f' : pen.color;
    const w = pen.kind === 'marker' ? 2.5 : clamp(pen.w, 1, 8);
    return { id: uid('d'), type: 'shape', shape: d.shape, x1: r1(d.x1), y1: r1(d.y1), x2: r1(d.x2), y2: r1(d.y2), color, w, fill: Store.ui.shapeFill || null, t0: Date.now(), layer: 'oben' };
  },
  shapeFromRecog(sh, ink) {
    const out = { id: ink.id, type: 'shape', shape: sh.shape, color: ink.kind === 'marker' ? '#1f1f1f' : ink.color, w: Math.max(1, ink.w), fill: null, t0: ink.t0, layer: ink.layer };
    if (sh.pts) out.pts = sh.pts.map(r1);
    else { out.x1 = r1(sh.x1); out.y1 = r1(sh.y1); out.x2 = r1(sh.x2); out.y2 = r1(sh.y2); }
    return out;
  },
  renderLive() {
    const d = this.drag;
    if (!d || !this.live) return;
    const ink = { type: 'ink', kind: d.pen.kind, color: d.pen.color, w: d.pen.w, pts: d.pts };
    this.live.innerHTML = this.markup(ink);
  },

  /* Radierer */
  eraseAt(w) {
    const p = Canvas.page, d = this.drag;
    const z = Canvas.view.z;
    const r = d.point ? clamp(Store.ui.eraserSize || 14, 6, 60) / 2 / z : 6 / z;
    let changed = false;
    const next = [];
    for (const dr of p.drawings) {
      if (dr.bg || !DG.hit(dr, w, r)) { next.push(dr); continue; }   // Hintergrund radiert man nicht weg
      changed = true;
      if (!d.point || dr.type !== 'ink') continue;
      // Punkt-Radierer: Strich an dieser Stelle teilen
      const pts = DG.inkPts(dr);
      const parts = [];
      let cur = [];
      for (const q of pts) {
        if (DG.dist(q, w) <= r + dr.w / 2) { if (cur.length) parts.push(cur); cur = []; }
        else cur.push(q);
      }
      if (cur.length) parts.push(cur);
      parts.forEach((part, i) => {
        if (part.length < 2) return;
        next.push({ ...dr, id: i === 0 ? dr.id : uid('d'), pts: part.flatMap(q => [q.x, q.y, q.p]) });
      });
    }
    if (changed) { p.drawings = next; d.changed = true; this.render(); }
  },

  /* Lineal: Projektion auf die Kante */
  rulerSnap(w) {
    const st = Store.ui.ruler;
    if (!st.visible) return null;
    const a = st.angle * Math.PI / 180, ux = Math.cos(a), uy = Math.sin(a);
    const g = this.geomOf('ruler'), L = g.W, H = g.H;
    // obere Kante: Mitte - Normale * H/2
    const nx = -uy, ny = ux;
    const ex = st.x - nx * H / 2, ey = st.y - ny * H / 2;
    const rx = w.x - ex, ry = w.y - ey;
    const along = rx * ux + ry * uy, across = rx * nx + ry * ny;
    const tol = 22 / Canvas.view.z;
    if (Math.abs(along) > L / 2 + 10 || across < -tol || across > tol) return null;
    const off = -2 / Canvas.view.z; // knapp ausserhalb der Kante zeichnen
    return { project: (q) => { const t = (q.x - ex) * ux + (q.y - ey) * uy; return { x: ex + ux * t + nx * off, y: ey + uy * t + ny * off }; } };
  },

  /* ---------------------------------------------------------- Finger */
  touchDown(ev) {
    if (this.drag && this.drag.ptype && this.drag.ptype !== 'touch') return true; // Handballen beim Zeichnen mit dem Stift ignorieren
    this.touches.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
    Canvas.capture(ev);
    if (this.touches.size >= 2) {
      // zweiter Finger: laufende Aktion abbrechen, zoomen
      if (this.drag && this.drag.type === 'ink' && this.live) { this.live.remove(); this.live = null; }
      if (Canvas.drag) { Canvas.drag = null; $('#marquee').hidden = true; Canvas.ov.innerHTML = ''; }
      const [a, b] = [...this.touches.values()];
      this.drag = { type: 'pinch', d0: Math.hypot(a.x - b.x, a.y - b.y) || 1, m0: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, z0: Canvas.view.z, vx: Canvas.view.x, vy: Canvas.view.y };
      ev.preventDefault();
      return true;
    }
    if ((Store.ui.penOnly && this.tool !== 'select') || this.tool === 'select' && Store.ui.penOnly) {
      this.drag = { type: 'tpan', pid: ev.pointerId, sx: ev.clientX, sy: ev.clientY, vx: Canvas.view.x, vy: Canvas.view.y };
      ev.preventDefault();
      return true;
    }
    return false;
  },
  touchMove() {
    const d = this.drag;
    const pts = [...this.touches.values()];
    if (d.type === 'pinch' && pts.length >= 2) {
      const [a, b] = pts;
      const dist = Math.hypot(a.x - b.x, a.y - b.y) || 1, m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const z = clamp(d.z0 * dist / d.d0, ZOOM_MIN, ZOOM_MAX);
      const r = Canvas.vp.getBoundingClientRect();
      const wx = (d.m0.x - r.left - d.vx) / d.z0, wy = (d.m0.y - r.top - d.vy) / d.z0;
      Canvas.view.z = z;
      Canvas.view.x = m.x - r.left - wx * z;
      Canvas.view.y = m.y - r.top - wy * z;
      Canvas.applyView();
    } else if (d.type === 'tpan' && pts.length) {
      const p = this.touches.get(d.pid) || pts[0];
      Canvas.view.x = d.vx + p.x - d.sx; Canvas.view.y = d.vy + p.y - d.sy;
      Canvas.applyView();
    }
  },

  /* ---------------------------------------------------------- Lineal & Winkelmesser
   * Seit 1.27 in der Grösse verstellbar (Griff am Ende ziehen; Doppelklick darauf = wieder an den Bildschirm anpassen).
   * Die Teilung zeigt Zentimeter so, wie sie **auf dem gedruckten Blatt** herauskommen (Datei → Drucken mit den
   * Vorgaben aus Store.ui.drucken): passt die Seite ohne Verkleinern aufs Blatt, ist 1 cm = 37.8 px der Seite (bei
   * 100 % Zoom etwa ein echter Zentimeter am Bildschirm); wird sie zum Drucken verkleinert, werden die Zentimeter
   * entsprechend grösser. Standardgrösse: so lang bzw. gross, dass das Werkzeug den sichtbaren Bereich ausfüllt.
   * Store.ui.ruler { visible, x, y, angle, len (cm), fix (von Hand) }, Store.ui.protractor { …, r (cm), fix }. */
  CM: 96 / 2.54,
  /* Massstab: Seiten-px je gedrucktem Zentimeter (gemerkt je Seite und Druck-Vorgaben) */
  cmPx(refresh) {
    const key = Canvas.pageId + '|' + JSON.stringify(typeof Print !== 'undefined' ? Print.opts() : {});
    if (!refresh && this._cm && this._cm.key === key) return this._cm;
    let z = 1;
    const C = Canvas.contentRect && Canvas.contentRect();
    if (C && typeof Print !== 'undefined') { const o = Print.opts(); z = Print.layout(C.w + 32, C.h + 32, o, Print.geom(o)).z; }
    this._cm = { key, px: this.CM / z, z, papier: typeof Print !== 'undefined' ? Print.opts().papier : 'A4' };
    return this._cm;
  },
  /* Standardgrösse: sichtbarer Bereich (in Seiten-px) → ganze Zentimeter */
  fitTool(which) {
    const st = Store.ui[which], cm = this.cmPx(true).px, r = Canvas.vp.getBoundingClientRect(), z = Canvas.view.z;
    const vw = r.width / z, vh = r.height / z;
    if (which === 'ruler') st.len = clamp(Math.floor((vw * 0.86 - 16) / cm), 3, 200);
    else st.r = clamp(Math.floor(Math.min(vw * 0.86 / 2 - 10, vh * 0.8 - 14) / cm * 2) / 2, 2, 100);
    st.fix = false;
  },
  geomOf(which) {
    const st = Store.ui[which], cm = this.cmPx().px;
    if (which === 'ruler') { const L = Math.max(3, st.len || 16) * cm; return { W: Math.round(L + 16), H: 72, ox: Math.round(L + 16) / 2, oy: 36, L, cm }; }
    const R = Math.max(2, st.r || 5.3) * cm;
    return { W: Math.round(2 * R + 20), H: Math.round(R + 14), ox: Math.round(R + 10), oy: Math.round(R + 6), R, cm };
  },
  buildTools() {
    this.ruler = el('div', { class: 'kt-tool ruler', dataset: { tool: 'ruler' }, hidden: true });
    this.prot = el('div', { class: 'kt-tool protractor', dataset: { tool: 'protractor' }, hidden: true });
    this.tools.append(this.ruler, this.prot);
    for (const t of [this.ruler, this.prot]) {
      t.addEventListener('wheel', (e) => {
        e.preventDefault(); e.stopPropagation();
        const st = Store.ui[t.dataset.tool];
        const step = e.shiftKey ? 15 : 1;
        st.angle = ((Math.round((st.angle + Math.sign(e.deltaY || e.deltaX) * step) / step) * step) % 360 + 360) % 360;
        this.renderTools();
        UiState.saveSoon();
      }, { passive: false });
      t.addEventListener('dblclick', (e) => {
        e.stopPropagation();
        const which = t.dataset.tool;
        if (e.target.closest('.kt-size')) this.fitTool(which); else Store.ui[which].angle = 0;
        this.renderTools(); UiState.saveSoon();
      });
    }
  },
  /* Teilung neu zeichnen, wenn sich Länge/Radius oder Massstab geändert haben */
  drawTool(which, g) {
    const elx = which === 'ruler' ? this.ruler : this.prot;
    const sig = `${g.W}|${g.H}|${n1(g.cm)}`;
    if (elx._sig === sig) return;
    elx._sig = sig;
    const cm = this._cm, note = cm && Math.abs(cm.z - 1) > 0.005 ? ` · Druck ${cm.papier} ${Math.round(cm.z * 100)} %` : '';
    const size = `<span class="kt-size" title="Ziehen = ${which === 'ruler' ? 'Länge' : 'Grösse'} ändern · Doppelklick = an den Bildschirm anpassen"></span>`;
    if (which === 'ruler') {
      let ticks = '';
      const n = Math.round(g.L / g.cm * 10);
      for (let i = 0; i <= n; i++) {
        const x = 8 + i * g.cm / 10, major = i % 10 === 0, half = i % 5 === 0;
        if (g.cm < 20 && !half) continue;   // stark verkleinert: nur halbe Zentimeter
        ticks += `<line x1="${n1(x)}" y1="0" x2="${n1(x)}" y2="${major ? 18 : half ? 12 : 7}"/>`;
        if (major) ticks += `<text x="${n1(x)}" y="30">${i / 10}</text>`;
      }
      elx.innerHTML = `<svg width="${g.W}" height="72" viewBox="0 0 ${g.W} 72"><g class="ticks">${ticks}</g></svg><span class="kt-unit">cm${note}</span>` +
        `<span class="kt-angle"></span><span class="kt-rot" title="Drehen (oder Mausrad über dem Lineal)">${icon('restore', 14)}</span>${size}`;
    } else {
      let pt = '';
      const R = g.R, cx = g.ox, cy = g.oy, lab = R >= 150 ? 10 : R >= 90 ? 30 : 45;
      for (let a = 0; a <= 180; a++) {
        const rad = Math.PI - a * Math.PI / 180, len = a % 10 === 0 ? 16 : a % 5 === 0 ? 11 : 6;
        if (R < 90 && a % 5) continue;
        pt += `<line x1="${n1(cx + Math.cos(rad) * R)}" y1="${n1(cy - Math.sin(rad) * R)}" x2="${n1(cx + Math.cos(rad) * (R - len))}" y2="${n1(cy - Math.sin(rad) * (R - len))}"/>`;
        if (a % lab === 0) pt += `<text x="${n1(cx + Math.cos(rad) * (R - 30))}" y="${n1(cy - Math.sin(rad) * (R - 30) + 4)}">${a}</text>`;
        if (a % 30 === 0 && a && a < 180 && R > 70) pt += `<line class="ray" x1="${cx}" y1="${cy}" x2="${n1(cx + Math.cos(rad) * (R - 46))}" y2="${n1(cy - Math.sin(rad) * (R - 46))}"/>`;
      }
      // Grundlinie mit Zentimetern (vom Mittelpunkt aus)
      for (let i = -Math.floor(R / g.cm * 2) / 2; i <= R / g.cm + 1e-9; i += 0.5) {
        const x = cx + i * g.cm, major = Math.abs(i % 1) < 1e-9;
        pt += `<line x1="${n1(x)}" y1="${cy}" x2="${n1(x)}" y2="${cy - (major ? 8 : 5)}"/>`;
      }
      elx.innerHTML = `<svg width="${g.W}" height="${g.H}" viewBox="0 0 ${g.W} ${g.H}"><path class="body" d="M10,${cy} A${n1(R)},${n1(R)} 0 0 1 ${n1(2 * R + 10)},${cy} Z"/><g class="ticks">${pt}</g><circle cx="${cx}" cy="${cy}" r="3"/></svg>` +
        `<span class="kt-unit">${(R / g.cm).toFixed(1).replace('.0', '')} cm${note}</span><span class="kt-angle"></span><span class="kt-rot" title="Drehen (oder Mausrad)">${icon('restore', 14)}</span>${size}`;
    }
  },
  renderTools() {
    if (!this.ruler || !Store.ui.ruler) return;
    const show = !!Canvas.page && !App.preview;
    for (const which of ['ruler', 'protractor']) {
      const elx = which === 'ruler' ? this.ruler : this.prot, st = Store.ui[which];
      elx.hidden = !(show && st.visible);
      if (elx.hidden) continue;
      if (!st.fix && (which === 'ruler' ? !st.len : !st.r)) this.fitTool(which);
      const g = this.geomOf(which);
      this.drawTool(which, g);
      elx.style.width = g.W + 'px';
      elx.style.height = g.H + 'px';
      elx.style.left = (st.x - g.ox) + 'px';
      elx.style.top = (st.y - g.oy) + 'px';
      elx.style.transformOrigin = `${g.ox}px ${g.oy}px`;
      elx.style.transform = `rotate(${st.angle}deg)`;
      const a = st.angle > 180 ? st.angle - 360 : st.angle;
      elx.querySelector('.kt-angle').textContent = Math.abs(a) + '°';
      if (which === 'protractor') elx.querySelector('.kt-angle').style.top = Math.round(g.oy - Math.min(56, g.R * 0.3)) + 'px';
    }
  },
  toggleTool(which) {
    const st = Store.ui[which];
    st.visible = !st.visible;
    if (st.visible) {
      const c = Canvas.viewCenter();
      const r = Canvas.vp.getBoundingClientRect();
      const vis = (x, y) => { const sx = x * Canvas.view.z + Canvas.view.x, sy = y * Canvas.view.z + Canvas.view.y; return sx > 24 && sy > 24 && sx < r.width - 24 && sy < r.height - 24; };
      if (!st.fix) this.fitTool(which); else this.cmPx(true);
      // ganz sichtbar? sonst in die Mitte (Lineal etwas oberhalb, Winkelmesser mit der Grundlinie unten)
      const g = this.geomOf(which), an = st.angle * Math.PI / 180, hx = Math.abs(Math.cos(an)) * g.W / 2, hy = Math.abs(Math.sin(an)) * g.W / 2;
      if (!vis(st.x - hx, st.y - hy) || !vis(st.x + hx, st.y + hy) || !vis(st.x, st.y)) {
        st.x = Math.round(c.x);
        st.y = Math.round(c.y + (which === 'protractor' ? Math.min(g.R / 2, r.height / Canvas.view.z * 0.4) : -r.height / Canvas.view.z * 0.2));
      }
      if (which === 'ruler' && this.tool !== 'pen') this.setTool('pen');
    }
    this.renderTools();
    UiState.saveSoon();
    Ribbon.refreshSoon();
    if (st.visible) UI.toast(which === 'ruler' ? 'Lineal: verschieben = ziehen · drehen = Mausrad oder Pfeil-Knopf · Länge = Griff am Ende ziehen · mit dem Stift an der Kante entlang zeichnen' : 'Winkelmesser: verschieben = ziehen · drehen = Mausrad · Grösse = Griff unten links ziehen', 4500);
  },

  /* ---------------------------------------------------------- Auswahl bearbeiten */
  removeSelected() {
    const p = Canvas.page;
    if (!p || !this.sel.size) return 0;
    // Hintergrund-Zeichnungen sind verankert (1.45): Entf löscht sie nicht – erst lösen (Rechtsklick → Häkchen weg)
    const n = this.selected().filter(d => !d.bg).length;
    p.drawings = p.drawings.filter(d => !this.sel.has(d.id) || d.bg);
    this.sel.clear();
    this.render();
    return n;
  },
  nudge(dx, dy) {
    for (const d of this.selected()) if (!d.bg) DG.map(d, (x, y) => ({ x: x + dx, y: y + dy }));   // Hintergrund verankert (1.45)
    this.render();
  },
  selectAll() { if (Canvas.page) this.select(Canvas.page.drawings.map(d => d.id), true); },   // seit 1.47 auch Hintergrund
  /* Stift auf die Auswahl anwenden (1.51): nur Striche DIESER Stiftart (Kugelschreiber, Bleistift, Textmarker …)
   * bekommen seine Farbe – z. B. Schrift und Markierungen ausgewählt, Kugelschreiber geklickt: nur die Schrift.
   * Ergebnis: Anzahl geänderter Striche (0 = keiner dieser Art ausgewählt) */
  applyPen(pen) {
    if (!pen || !this.sel.size) return 0;
    const list = this.selected().filter(d => d.type === 'ink' && (d.kind || 'pen') === pen.kind);
    if (!list.length) return 0;
    const fixed = pen.kind === 'rainbow' || pen.kind === 'glitter';
    let n = 0;
    for (const d of list) { if (!fixed && d.color !== pen.color) { d.color = pen.color; n++; } else if (fixed) n++; }
    this.render();
    if (n) { Hist.touchPage(Canvas.pageId); Hist.commit('Farbe geändert'); }
    UI.toast(`${list.length} ${PEN_KINDS[pen.kind] || 'Stift'}-${list.length === 1 ? 'Strich' : 'Striche'}${fixed ? '' : ' in der neuen Farbe'} – andere Stiftarten bleiben`, 2600);
    return list.length;
  },
  recolor(color) {
    const list = this.selected();
    if (!list.length) return false;
    for (const d of list) { if (d.type === 'ink' && (d.kind === 'rainbow' || d.kind === 'glitter')) d.kind = 'pen'; d.color = color; }
    this.render();
    Hist.touchPage(Canvas.pageId); Hist.commit('Farbe geändert');
    return true;
  },
  setFill(color) {
    const list = this.selected().filter(d => d.type === 'shape' && !['line', 'arrow', 'darrow', 'axes'].includes(d.shape));
    if (!list.length) return false;
    for (const d of list) d.fill = color || null;
    this.render();
    Hist.touchPage(Canvas.pageId); Hist.commit('Füllung geändert');
    return true;
  },
  order(front) {
    const p = Canvas.page, list = this.selected();
    if (!list.length) return false;
    const rest = p.drawings.filter(d => !this.sel.has(d.id));
    for (const d of list) { d.layer = front ? 'oben' : 'unten'; if (front) delete d.bg; }   // nach vorne holen hebt „Hintergrund“ auf
    p.drawings = front ? [...rest, ...list] : [...list, ...rest];
    this.render();
    Hist.touchPage(Canvas.pageId); Hist.commit(front ? 'Zeichnung vor den Text' : 'Zeichnung hinter den Text');
    UI.toast(front ? 'Liegt jetzt über den Textfeldern' : 'Liegt jetzt hinter den Textfeldern');
    return true;
  },
  contextMenu(x, y) {
    const list = this.selected();
    const shapes = list.filter(d => d.type === 'shape');
    UI.menu([
      { head: `${list.length} Zeichnung${list.length === 1 ? '' : 'en'}` },
      { label: 'Ausschneiden', icon: 'cut', key: 'Strg+X', action: () => Canvas.copySelection(true) },
      { label: 'Kopieren', icon: 'copy', key: 'Strg+C', action: () => Canvas.copySelection(false) },
      { label: 'Duplizieren', icon: 'duplicate', key: 'Strg+D', action: () => Canvas.duplicate() },
      '-',
      { head: 'Farbe' }, { colors: INK_COLORS.slice(0, 14), action: (c) => this.recolor(c) },
      shapes.length ? { head: 'Füllung' } : null,
      shapes.length ? { colors: [null, '#ffffff', '#FFF4C2', '#DCEBFF', '#DDF3E0', '#FDE2E4', '#EDE4FF', '#1f1f1f', '#2f5fd0', '#d13438'], action: (c) => this.setFill(c) } : null,
      '-',
      { label: 'Vor den Text', icon: 'layerUp', action: () => this.order(true) },
      { label: 'Hinter den Text', icon: 'layerDown', action: () => this.order(false) },
      // für alle markierten Objekte (1.45): auch mitmarkierte Felder/Bilder (Strg+A)
      // „als Hintergrund“ getrennt nach Bild / Text / Zeichnung (1.48), auch für mitmarkierte Felder
      ...Canvas.bgMenuItems(Canvas.selectedBoxes().filter(b => !b.sheet), list),
      list.some(d => d.type === 'ink') ? { label: 'Freihand → Form', icon: 'inkShape', action: () => this.inkToShape() } : null,
      list.some(d => d.type === 'ink') ? { label: 'Freihand → Text (Beta)', icon: 'inkText', action: () => this.inkToText() } : null,
      list.some(d => d.type === 'ink') ? { label: 'Fotomath: Rechnung erkennen', icon: 'fotomath', action: () => Fotomath.start() } : null,
      '-',
      { label: 'Löschen', icon: 'trash', danger: true, key: 'Entf', action: () => Canvas.deleteSelection() },
    ], x, y);
  },

  /* ---------------------------------------------------------- Umwandeln */
  inkToShape() {
    const p = Canvas.page;
    const inks = this.selected().filter(d => d.type === 'ink');
    if (!inks.length) { UI.toast('Zuerst Freihand-Striche auswählen (Auswählen oder Lasso)'); return; }
    let n = 0;
    for (const ink of inks) {
      const sh = Recog.detect(DG.inkPts(ink));
      if (!sh) continue;
      const i = p.drawings.indexOf(ink);
      p.drawings[i] = this.shapeFromRecog(sh, ink);
      n++;
    }
    if (!n) { UI.toast('Keine Form erkannt – Linien, Rechtecke, Dreiecke, Rauten, Kreise und Vielecke gehen am besten'); return; }
    this.render();
    Hist.touchPage(Canvas.pageId); Hist.commit(n === 1 ? 'Freihand → Form' : `Freihand → ${n} Formen`);
    UI.toast(`${n} von ${inks.length} Strich${inks.length === 1 ? '' : 'en'} in Formen umgewandelt`);
  },
  loadScript(src) {
    return new Promise((res, rej) => {
      if (document.querySelector(`script[data-src="${src}"]`)) { res(); return; }
      const s = el('script', { src, dataset: { src } });
      s.onload = () => res();
      s.onerror = () => { s.remove(); rej(new Error('Laden fehlgeschlagen – ist das Internet verbunden?')); };
      document.head.append(s);
    });
  },
  async inkToText() {
    const inks = this.selected().filter(d => d.type === 'ink');
    if (!inks.length) { UI.toast('Zuerst die handgeschriebenen Striche auswählen (z.B. mit dem Lasso)'); return; }
    const r = DG.union(inks.map(d => DG.bbox(d)));
    const scale = clamp(110 / Math.max(30, Math.min(r.h, 400)), 0.6, 3);
    const pad = 24;
    const cv = el('canvas');
    cv.width = Math.min(3000, Math.ceil(r.w * scale + pad * 2));
    cv.height = Math.min(3000, Math.ceil(r.h * scale + pad * 2));
    const ctx = cv.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cv.width, cv.height);
    ctx.strokeStyle = '#000'; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (const d of [...inks].sort((a, b) => (a.t0 || 0) - (b.t0 || 0))) {
      const pts = DG.smooth(DG.inkPts(d));
      ctx.lineWidth = Math.max(3, Math.min(d.w, 6) * scale);
      ctx.beginPath();
      pts.forEach((q, i) => { const x = (q.x - r.x) * scale + pad, y = (q.y - r.y) * scale + pad; if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); });
      if (pts.length === 1) ctx.lineTo((pts[0].x - r.x) * scale + pad + 0.1, (pts[0].y - r.y) * scale + pad);
      ctx.stroke();
    }
    UI.toast('Handschrift wird erkannt … (beim ersten Mal wird die Texterkennung geladen, das kann etwas dauern)', 8000);
    let text = '';
    try {
      if (!window.Tesseract) await this.loadScript(TESSERACT_URL);
      const worker = await Tesseract.createWorker('deu');
      const res = await worker.recognize(cv);
      await worker.terminate();
      text = (res && res.data && res.data.text || '').trim();
    } catch (e) {
      UI.toast('Texterkennung nicht verfügbar: ' + e.message, 4500);
      return;
    }
    const out = await UI.dialog((dl, close) => {
      dl.append(el('h2', { text: 'Freihand → Text (Beta)' }));
      dl.append(el('p', { text: text ? 'Erkannter Text – bei Bedarf korrigieren:' : 'Es wurde kein Text erkannt. Deutlich und gross schreiben hilft. Du kannst den Text auch selbst eintippen:' }));
      const ta = el('textarea', { style: { width: '100%', minHeight: '110px', font: '13px var(--font-note)', padding: '8px', border: '1px solid var(--line-2)', borderRadius: '5px', background: 'var(--chrome-2)', color: 'var(--ink)', resize: 'vertical' } });
      ta.value = text;
      const keep = el('input', { type: 'checkbox' });
      dl.append(ta, el('label', { style: { display: 'flex', gap: '6px', alignItems: 'center', marginTop: '8px', color: 'var(--ink-2)' } }, keep, 'Handschrift behalten'));
      dl.append(el('div', { class: 'dlg-btns' },
        el('button', { class: 'btn', text: 'Abbrechen', onclick: () => close(null) }),
        el('button', { class: 'btn primary', text: 'Als Textfeld einfügen', onclick: () => close({ text: ta.value, keep: keep.checked }) })));
      setTimeout(() => ta.focus(), 30);
    });
    if (!out || !out.text.trim()) return;
    const p = Canvas.page;
    const html = out.text.trim().split(/\r?\n/).map(l => `<div>${l.trim() ? escapeHtml(l) : '<br>'}</div>`).join('');
    if (!out.keep) { p.drawings = p.drawings.filter(d => !inks.includes(d)); this.sel.clear(); }
    const b = Canvas.createBoxAt({ x: r.x + PADX, y: r.y + BAR + 11 }, { html, w: clamp(Math.round(r.w + 30), 160, 640), noFocus: true, label: 'Freihand → Text' });
    this.render();
    if (b) Canvas.select([b.id]);
  },

  /* ---------------------------------------------------------- Stifte einstellen */
  penMenu(i, anchor) {
    const pens = Store.ui.pens;
    const pen = pens[i];
    if (!pen) return;
    const box = el('div', { class: 'pen-pop' });
    // mit Auswahl (1.51): die geänderte Farbe gilt auch für die ausgewählten Striche derselben Stiftart
    const apply = () => { UiState.saveSoon(); if (this.sel.size && this.applyPen(pen)) { Ribbon.show(Ribbon.tab); return; } this.setTool('pen', i); Ribbon.show(Ribbon.tab); };
    box.append(el('div', { class: 'mhead', text: 'Art' }));
    const kinds = el('div', { class: 'pen-kinds' });
    for (const [k, label] of Object.entries(PEN_KINDS)) {
      const b = el('button', { class: 'pen-kind' + (pen.kind === k ? ' on' : ''), title: label, html: this.penIcon({ ...pen, kind: k }, 26) + `<span>${label}</span>` });
      b.addEventListener('click', () => {
        pen.kind = k;
        const ws = PEN_WIDTHS[k];
        if (!ws.includes(pen.w)) pen.w = ws[Math.floor(ws.length / 2)];
        if (k === 'marker' && !['#FFE600', '#7CFC7C', '#5ee1ff', '#ff8fd0'].includes(pen.color)) pen.color = '#FFE600';
        if (k !== 'marker' && ['#FFE600', '#7CFC7C', '#5ee1ff', '#ff8fd0'].includes(pen.color)) pen.color = '#1f1f1f';
        UI.closePopup(); apply(); this.penMenu(i, $(`#panel .pen-btn[data-pen="${i}"]`) || anchor);
      });
      kinds.append(b);
    }
    box.append(kinds);
    if (pen.kind !== 'rainbow' && pen.kind !== 'glitter') {
      box.append(el('div', { class: 'mhead', text: 'Farbe' }));
      const row = el('div', { class: 'mcolors', style: { maxWidth: '260px' } });
      for (const c of INK_COLORS) {
        const b = el('button', { class: 'sw' + (c === pen.color ? ' cur' : ''), title: c, style: { background: c } });
        b.addEventListener('click', () => { pen.color = c; UI.closePopup(); apply(); });
        row.append(b);
      }
      const more = el('button', { class: 'sw wheel', title: 'Eigene Farbe (Farbrad) …' });
      more.addEventListener('click', () => UI.colorWheel(anchor, pen.color, (c) => { pen.color = c; apply(); }, { title: 'Stiftfarbe' }));
      row.append(more);
      box.append(row);
    }
    box.append(el('div', { class: 'mhead', text: 'Stärke' }));
    const ws = el('div', { class: 'pen-widths' });
    for (const w of PEN_WIDTHS[pen.kind] || PEN_WIDTHS.pen) {
      const b = el('button', { class: 'pen-w' + (w === pen.w ? ' on' : ''), title: String(w).replace('.', ',') + ' px' });
      b.innerHTML = `<i style="width:${Math.min(26, Math.max(2, w * (pen.kind === 'marker' ? 0.8 : 1.6)))}px;height:${Math.min(26, Math.max(2, w * (pen.kind === 'marker' ? 0.8 : 1.6)))}px;background:${pen.kind === 'rainbow' ? 'linear-gradient(45deg,#ff2d55,#ffcc00,#34c759,#0a84ff,#bf5af2)' : pen.kind === 'glitter' ? 'linear-gradient(45deg,#8a6d1d,#f5d76e,#c9a227)' : pen.color}"></i>`;
      b.addEventListener('click', () => { pen.w = w; UI.closePopup(); apply(); });
      ws.append(b);
    }
    box.append(ws);
    const reset = el('div', { class: 'mi', html: `<span class="mi-ic">${icon('restore', 15)}</span><span class="mi-label">Alle Stifte zurücksetzen</span>` });
    reset.addEventListener('click', () => { Store.ui.pens = JSON.parse(JSON.stringify(DEFAULT_PENS)); UI.closePopup(); UiState.saveSoon(); Ribbon.show(Ribbon.tab); });
    box.append(el('div', { class: 'msep' }), reset);
    UI.showPopup(box, 0, 0, { anchor });
  },
  penIcon(pen, size = 30) {
    const c = pen.kind === 'rainbow' ? 'url(#pi-rb)' : pen.kind === 'glitter' ? 'url(#pi-gd)' : pen.color;
    const defs = '<defs><linearGradient id="pi-rb" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ff2d55"/><stop offset=".3" stop-color="#ffcc00"/><stop offset=".55" stop-color="#34c759"/><stop offset=".8" stop-color="#0a84ff"/><stop offset="1" stop-color="#bf5af2"/></linearGradient><linearGradient id="pi-gd" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#8a6d1d"/><stop offset=".45" stop-color="#f5d76e"/><stop offset="1" stop-color="#9c7a1e"/></linearGradient></defs>';
    const body = pen.kind === 'marker'
      ? `<path d="M9 4h6v9l-3 3-3-3z" fill="${c}" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/><rect x="8.5" y="15.5" width="7" height="5" rx="1" fill="${c}" opacity=".55"/>`
      : pen.kind === 'pencil'
        ? `<path d="M9.5 3h5v12l-2.5 5-2.5-5z" fill="#e9c46a" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/><path d="M10.6 17.3 12 20l1.4-2.7z" fill="${c}"/>`
        : `<path d="M9.5 3h5v11l-2.5 6-2.5-6z" fill="${c}" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/><path d="M11 14h2" stroke="#fff" stroke-width="1" opacity=".7"/>`;
    return `<svg class="pen-ic" viewBox="6.5 1.5 11 21" width="${Math.round(size * 0.62)}" height="${size}">${pen.kind === 'rainbow' || pen.kind === 'glitter' ? defs : ''}${body}</svg>`;
  },
};
