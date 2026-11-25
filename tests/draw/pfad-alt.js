'use strict';
/* Referenz für tests/draw/pfad-test.js: die absoluten Freihand-Pfade bis 1.25 (draw.js), unverändert kopiert. */
const DG = { dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); } };
function r1(n) { return Math.round(n * 10) / 10; }
const n1 = (n) => Math.round(n * 10) / 10;

/* Pfad durch Punkte (für Linien mit fester Breite) */
function centerPath(pts) {
  if (!pts.length) return '';
  if (pts.length === 1) return `M${n1(pts[0].x)},${n1(pts[0].y)}l0.01,0`;
  let s = `M${n1(pts[0].x)},${n1(pts[0].y)}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    s += `Q${n1(a.x)},${n1(a.y)} ${n1((a.x + b.x) / 2)},${n1((a.y + b.y) / 2)}`;
  }
  const l = pts[pts.length - 1];
  return s + `L${n1(l.x)},${n1(l.y)}`;
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
  const curve = (arr) => {
    let s = '';
    for (let i = 1; i < arr.length - 1; i++) { const a = arr[i], b = arr[i + 1]; s += `Q${n1(a.x)},${n1(a.y)} ${n1((a.x + b.x) / 2)},${n1((a.y + b.y) / 2)}`; }
    const l = arr[arr.length - 1];
    return s + `L${n1(l.x)},${n1(l.y)}`;
  };
  const re = rs[n - 1], r0 = rs[0];
  const Rr = R.slice().reverse();
  return `M${n1(L[0].x)},${n1(L[0].y)}` + curve(L) +
    `A${n1(re)},${n1(re)} 0 0,0 ${n1(R[n - 1].x)},${n1(R[n - 1].y)}` + curve(Rr) +
    `A${n1(r0)},${n1(r0)} 0 0,0 ${n1(L[0].x)},${n1(L[0].y)}Z`;
}
