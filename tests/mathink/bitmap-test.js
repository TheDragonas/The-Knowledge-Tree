'use strict';
/* Fotomath in Bildern prüfen: node tests/mathink/bitmap-test.js
 * Künstliche Handschrift (wie mathink-test.js) wird in ein Graustufenbild gemalt – verschiedene Strichbreiten, Rauschen,
 * Schatten, Häuschenpapier – und über MathInk.fromBitmap (Pixel → Striche) erkannt. */
const { MathInk } = require('../../web/js/mathink.js');
const { write, flat } = require('./mathink-test.js');
let seed = 99;
const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
/* Striche als dicke Linien malen (Scheiben entlang der Strecken) */
function paint(strokes, opt = {}) {
  const pad = 14, sc = opt.scale || 1.6;
  const all = strokes.flatMap(s => s.pts);
  const x1 = Math.min(...all.map(p => p.x)), y1 = Math.min(...all.map(p => p.y)), x2 = Math.max(...all.map(p => p.x)), y2 = Math.max(...all.map(p => p.y));
  const w = Math.ceil((x2 - x1) * sc) + 2 * pad, h = Math.ceil((y2 - y1) * sc) + 2 * pad;
  const g = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let v = opt.paper || 245;
    if (opt.shadow) v -= opt.shadow * x / w;                     // Schatten von links nach rechts
    if (opt.grid && (x % opt.grid === 3 || y % opt.grid === 3)) v = Math.min(v, 175);   // Häuschenpapier
    g[y * w + x] = v;
  }
  const r = (opt.pen || 2.6) / 2;
  const stamp = (cx, cy) => {
    for (let y = Math.floor(cy - r - 1); y <= cy + r + 1; y++) for (let x = Math.floor(cx - r - 1); x <= cx + r + 1; x++) {
      if (x < 0 || y < 0 || x >= w || y >= h) continue;
      const d = Math.hypot(x - cx, y - cy);
      const a = Math.max(0, Math.min(1, r + 0.5 - d));
      const ink = (opt.ink || 40);
      g[y * w + x] = Math.min(g[y * w + x], g[y * w + x] * (1 - a) + ink * a);
    }
  };
  for (const s of strokes) {
    const P = s.pts.map(p => ({ x: (p.x - x1) * sc + pad, y: (p.y - y1) * sc + pad }));
    if (P.length === 1) stamp(P[0].x, P[0].y);
    for (let i = 1; i < P.length; i++) {
      const L = Math.hypot(P[i].x - P[i - 1].x, P[i].y - P[i - 1].y), n = Math.max(1, Math.ceil(L / 0.5));
      for (let k = 0; k <= n; k++) stamp(P[i - 1].x + (P[i].x - P[i - 1].x) * k / n, P[i - 1].y + (P[i].y - P[i - 1].y) * k / n);
    }
  }
  if (opt.noise) for (let i = 0; i < g.length; i++) g[i] = Math.max(0, Math.min(255, g[i] + (rnd() - 0.5) * opt.noise));
  return { g, w, h };
}
let ok = 0, bad = 0;
function check(name, strokes, want, opt) {
  const { g, w, h } = paint(strokes, opt);
  const b = MathInk.fromBitmap(g, w, h);
  const r = MathInk.recognize(b.strokes.map((pts, i) => ({ pts, id: 'p' + i, comp: b.comp[i] })));
  const got = r ? flat(r.left) + (r.right ? '=' + flat(r.right) : '') : '';
  if (got !== want && process.env.DUMP) require('fs').writeFileSync(`${process.env.DUMP}/f${bad}.json`, JSON.stringify({ name, opt, got, w, h, g: Array.from(g, v => Math.round(v)), strokes: b.strokes }));
  if (got === want) ok++; else { bad++; console.log('FALSCH', name, JSON.stringify(opt || {}), '→', got, 'erwartet', want, '|', r ? r.syms.map(s => s.cls + '(' + s.alts.slice(0, 3).join('') + ')').join(' ') : '-'); }
}
const looks = [{}, { pen: 4.5 }, { pen: 1.6, scale: 1.2 }, { noise: 40 }, { shadow: 90 }, { grid: 16 }, { pen: 3.5, scale: 2.4, noise: 25, shadow: 50 }];
for (const opt of looks) {
  for (let rep = 0; rep < 3; rep++) {
    check('12+34', write(['12+34']), '12+34', opt);
    check('3/4+1', write([{ frac: ['3', '4'] }, '+1']), '[3/4]+1', opt);
    check('2^10', write(['2', { pow: '10' }]), '2^(10)', opt);
    check('√16', write([{ sqrt: '16' }]), '√(16)', opt);
    check('2x+3=7', write(['2x+3=7']), '2x+3=7', opt);
    check('6.5*2', write(['6.5*2']), '6.5×2', opt);
    check('8÷2', write(['8÷2']), '8÷2', opt);
    check('5^2-9', write(['5', { pow: '2' }, '-9']), '5^(2)−9', opt);
  }
}
console.log(`${ok} von ${ok + bad} Bild-Ausdrücke richtig`);
process.exitCode = bad > (ok + bad) * 0.25 ? 1 : 0;
