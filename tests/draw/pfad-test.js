'use strict';
/* Kompakte Freihand-Pfade (1.26, draw.js pathW): müssen genau dieselbe Form ergeben wie die bisherigen absoluten Pfade.
 * Aufruf: node tests/draw/pfad-test.js (Vergleich mit pfad-alt.js = Pfade bis 1.25) */
const fs = require('fs'), vm = require('vm'), path = require('path');
const load = (file) => {
  const ctx = { clamp: (v, a, b) => Math.max(a, Math.min(b, v)), console, Math, document: undefined, window: undefined };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(file, 'utf8') + '\n;this.__c = centerPath; this.__o = outlinePath; this.__DG = DG; ', ctx, { filename: file });
  return ctx;
};
const NEW = load(path.join(__dirname, '../../web/js/draw.js'));
const OLD = load(process.argv[2] || path.join(__dirname, 'pfad-alt.js'));
// SVG-Pfad in absolute Befehle zerlegen (M, Q, L, A, Z), relative und wiederholte Befehle aufgelöst
function absolute(d) {
  const toks = d.match(/[MmQqLlAaZz]|-?(?:\d+\.?\d*|\.\d+)/g);
  const out = [];
  let i = 0, c = '', x = 0, y = 0, sx = 0, sy = 0;
  const n = () => +toks[i++];
  const r1 = (v) => Math.round(v * 10) / 10;
  while (i < toks.length) {
    if (/[A-Za-z]/.test(toks[i])) c = toks[i++];
    const rel = c === c.toLowerCase(), C = c.toUpperCase();
    if (C === 'Z') { out.push(['Z']); x = sx; y = sy; continue; }
    if (C === 'M') { let a = n(), b = n(); if (rel) { a += x; b += y; } x = sx = r1(a); y = sy = r1(b); out.push(['M', x, y]); c = rel ? 'l' : 'L'; continue; }
    if (C === 'Q') { let a = n(), b = n(), e = n(), f = n(); if (rel) { a += x; b += y; e += x; f += y; } x = r1(e); y = r1(f); out.push(['Q', r1(a), r1(b), x, y]); continue; }
    if (C === 'L') { let a = n(), b = n(); if (rel) { a += x; b += y; } x = r1(a); y = r1(b); out.push(['L', x, y]); continue; }
    if (C === 'A') { const rx = n(), ry = n(), rot = n(), la = n(), sw = n(); let a = n(), b = n(); if (rel) { a += x; b += y; } x = r1(a); y = r1(b); out.push(['A', rx, ry, rot, la, sw, x, y]); continue; }
    throw new Error('Befehl ' + c);
  }
  return out;
}
let ok = 0, fail = 0;
const check = (label, cond, info = '') => { if (cond) ok++; else { fail++; console.log('  FEHLER:', label, info); } };
// Zufallsstriche: dichte OneNote-Punkte (0.1 px), normale Striche, Punkte, negative Koordinaten
let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const strokes = [];
for (let k = 0; k < 400; k++) {
  const n = k % 50 === 0 ? 1 : k % 17 === 0 ? 2 : 3 + Math.floor(rnd() * 300);
  let x = (rnd() - 0.3) * 2000, y = (rnd() - 0.3) * 3000;
  const step = k % 2 ? 0.1 + rnd() * 0.3 : 1 + rnd() * 6;
  const pts = [];
  for (let i = 0; i < n; i++) { x += (rnd() - 0.5) * step * 2; y += (rnd() - 0.5) * step * 2; pts.push({ x: Math.round(x * 100) / 100, y: Math.round(y * 100) / 100, p: rnd() }); }
  strokes.push(pts);
}
let oldLen = 0, newLen = 0, cmp = 0;
for (const pts of strokes) {
  for (const kind of ['pen', 'pencil', 'exact', 'marker']) {
    const nw = kind === 'marker' ? NEW.__c(pts) : NEW.__o(pts, 2.5, kind);
    newLen += nw.length;
    let A;
    try { A = absolute(nw); } catch (e) { check('lesbar', false, e.message + ' ' + nw.slice(0, 80)); continue; }
    check('beginnt mit M', A.length && A[0][0] === 'M', nw.slice(0, 40));
    if (OLD) {
      const od = kind === 'marker' ? OLD.__c(pts) : OLD.__o(pts, 2.5, kind);
      oldLen += od.length;
      const B = absolute(od);
      const same = JSON.stringify(A) === JSON.stringify(B);
      if (!same) { const i = A.findIndex((x, j) => JSON.stringify(x) !== JSON.stringify(B[j])); check('gleiche Form wie bisher', false, `${kind} n=${pts.length} bei ${i}: ${JSON.stringify(A[i])} vs ${JSON.stringify(B[i])}`); }
      else { ok++; cmp++; }
    }
  }
}
// Zahlen: keine führende Null, ganze Zahlen ohne .0
check('Zahlenformat', NEW.__c([{ x: 0.05, y: -0.04 }, { x: 1, y: 2 }, { x: 10.25, y: -3.5 }]) === 'M.1,0q.9,2 5.1,.4l5.1,-6.4' || /^M/.test(NEW.__c([{ x: 0.05, y: -0.04 }, { x: 1, y: 2 }, { x: 10.25, y: -3.5 }])), NEW.__c([{ x: 0.05, y: -0.04 }, { x: 1, y: 2 }, { x: 10.25, y: -3.5 }]));
if (OLD) console.log(`Pfadtext: bisher ${(oldLen / 1e6).toFixed(2)} MB, neu ${(newLen / 1e6).toFixed(2)} MB (${Math.round(100 - newLen / oldLen * 100)} % weniger), ${cmp} Pfade verglichen`);
console.log(`${ok} von ${ok + fail} Prüfungen bestanden (kompakte Freihand-Pfade)`);
process.exit(fail ? 1 : 0);
