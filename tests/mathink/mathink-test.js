'use strict';
/* Fotomath-Erkennung prüfen: node tests/mathink/mathink-test.js
 * Erzeugt künstliche Handschrift (Vorlagen mit zufälliger Verzerrung, Schräglage, Zittern) und prüft Gruppierung,
 * Zeichen und 2D-Aufbau (Brüche, Hochzahlen, Wurzeln, Dezimal-/Malpunkt, Gleichungen). */
const { MathInk } = require('../../web/js/mathink.js');
let seed = 7;
const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
const R = (a, b) => a + (b - a) * rnd();
/* Zeichen als Striche in ein Kästchen (x, y, w, h) zeichnen – mit Verzerrung */
function glyph(cls, x, y, w, h, v) {
  const vars = MathInk.RAW[cls];
  const tpl = vars[v != null ? v % vars.length : Math.floor(rnd() * vars.length)];
  const sx = R(0.85, 1.15), shear = R(-0.18, 0.12), rot = R(-0.06, 0.06), j = 0.015;
  let all = tpl.flat(); let x1 = Math.min(...all.map(p => p[0])), x2 = Math.max(...all.map(p => p[0])), y1 = Math.min(...all.map(p => p[1])), y2 = Math.max(...all.map(p => p[1]));
  const bw = Math.max(x2 - x1, 0.001), bh = Math.max(y2 - y1, 0.001);
  return tpl.map(st => {
    const pts = [];
    for (let k = 0; k < st.length; k++) {
      const [px, py] = st[k];
      const nx = (px - x1) / bh, ny = (py - y1) / bh;   // gleiche Skalierung (Seitenverhältnis bleibt)
      const qx = (nx * sx + ny * shear) , qy = ny;
      const rx = qx * Math.cos(rot) - qy * Math.sin(rot), ry = qx * Math.sin(rot) + qy * Math.cos(rot);
      pts.push({ x: x + rx * h + R(-j, j) * h, y: y + ry * h + R(-j, j) * h });
      // Zwischenpunkte wie beim echten Schreiben
      if (k + 1 < st.length) { const [ax, ay] = st[k + 1]; for (let t = 1; t < 4; t++) { const mx = ((px + (ax - px) * t / 4) - x1) / bh, my = ((py + (ay - py) * t / 4) - y1) / bh; const qx2 = mx * sx + my * shear; pts.push({ x: x + (qx2 * Math.cos(rot) - my * Math.sin(rot)) * h, y: y + (qx2 * Math.sin(rot) + my * Math.cos(rot)) * h }); } }
    }
    return pts;
  }).map(pts => ({ pts }));
}
const line = (x1, y1, x2, y2) => { const pts = []; for (let i = 0; i <= 10; i++) pts.push({ x: x1 + (x2 - x1) * i / 10 + R(-0.4, 0.4), y: y1 + (y2 - y1) * i / 10 + R(-0.5, 0.5) }); return [{ pts }]; };
const dot = (x, y) => [{ pts: [{ x, y }, { x: x + 0.8, y: y + 0.6 }] }];
/* einfache Zeilen-Schrift: Folge von Elementen, gibt Striche zurück */
const H = 30;
function write(items, x0 = 0, y0 = 0, h = H) {
  let x = x0; const out = [];
  for (const it of items) {
    if (typeof it === 'string') {
      for (const ch of it) {
        if (ch === ' ') { x += h * 0.3; continue; }
        if (ch === '+') { out.push(...glyph('+', x, y0 + h * 0.25, 0, h * 0.5)); x += h * 0.75; continue; }
        if (ch === '-') { out.push(...line(x, y0 + h * 0.5, x + h * 0.5, y0 + h * 0.52)); x += h * 0.75; continue; }
        if (ch === '=') { out.push(...line(x, y0 + h * 0.38, x + h * 0.55, y0 + h * 0.38)); out.push(...line(x, y0 + h * 0.64, x + h * 0.55, y0 + h * 0.64)); x += h * 0.8; continue; }
        if (ch === '.') { out.push(...dot(x + 1, y0 + h * 0.95)); x += h * 0.3; continue; }
        if (ch === '*') { out.push(...dot(x + 2, y0 + h * 0.5)); x += h * 0.4; continue; }
        if (ch === 'X') { out.push(...glyph('x', x, y0 + h * 0.3, 0, h * 0.42)); x += h * 0.65; continue; }
        if (ch === ':') { out.push(...dot(x + 2, y0 + h * 0.3)); out.push(...dot(x + 2, y0 + h * 0.72)); x += h * 0.45; continue; }
        if (ch === '÷') { out.push(...line(x, y0 + h * 0.5, x + h * 0.5, y0 + h * 0.5)); out.push(...dot(x + h * 0.25, y0 + h * 0.28)); out.push(...dot(x + h * 0.25, y0 + h * 0.74)); x += h * 0.75; continue; }
        const cls = ch === 'p' ? 'π' : ch;
        const st = glyph(cls, x, y0 + (ch === 'x' ? h * 0.3 : 0), 0, ch === 'x' ? h * 0.7 : h);
        out.push(...st);
        const w = Math.max(...st.flatMap(s => s.pts.map(p => p.x))) - x;
        x += w + h * R(0.18, 0.32);
      }
    } else if (it.frac) {
      const a = write([it.frac[0]], 0, 0, h), b = write([it.frac[1]], 0, 0, h);
      const wa = Math.max(...a.flatMap(s => s.pts.map(p => p.x))), wb = Math.max(...b.flatMap(s => s.pts.map(p => p.x)));
      const W = Math.max(wa, wb) + h * 0.4;
      const shift = (arr, dx, dy) => arr.map(s => ({ pts: s.pts.map(p => ({ x: p.x + dx, y: p.y + dy })) }));
      out.push(...shift(a, x + (W - wa) / 2, y0 - h * 0.75));
      out.push(...line(x, y0 + h * 0.5, x + W, y0 + h * 0.5));
      out.push(...shift(b, x + (W - wb) / 2, y0 + h * 0.75));
      x += W + h * 0.35;
    } else if (it.pow) {
      const e = write([it.pow], x - h * 0.05, y0 - h * 0.45, h * 0.6);
      out.push(...e);
      x = Math.max(...e.flatMap(s => s.pts.map(p => p.x))) + h * 0.3;
    } else if (it.sqrt) {
      const inner = write([it.sqrt], x + h * 0.75, y0, h);
      const iw = Math.max(...inner.flatMap(s => s.pts.map(p => p.x))) + h * 0.2;
      const pts = [{ x, y: y0 + h * 0.55 }, { x: x + h * 0.15, y: y0 + h * 0.45 }, { x: x + h * 0.35, y: y0 + h * 1.05 }, { x: x + h * 0.6, y: y0 - h * 0.15 }];
      for (let t = 1; t <= 12; t++) pts.push({ x: x + h * 0.6 + (iw - x - h * 0.6) * t / 12, y: y0 - h * 0.15 + R(-0.4, 0.4) });
      out.push({ pts });
      out.push(...inner);
      x = iw + h * 0.2;
    }
  }
  return out;
}
const flat = (tree) => (tree || []).map(t => typeof t === 'string' ? t : t.t === 'frac' ? `[${flat(t.a)}/${flat(t.b)}]` : t.t === 'pow' ? `^(${flat(t.a)})` : t.t === 'sqrt' ? `√(${flat(t.a)})` : '?').join('');
module.exports = { write, glyph, flat, line, dot };
if (require.main === module) {
let ok = 0, bad = 0;
function check(name, strokes, want) {
  const r = MathInk.recognize(strokes.map((s, i) => ({ ...s, id: i })));
  const got = flat(r.left) + (r.right ? '=' + flat(r.right) : '');
  if (got === want) ok++; else { bad++; console.log('FALSCH', name, '→', got, 'erwartet', want, '|', r.syms.map(s => s.cls + '(' + s.alts.slice(0, 3).join('') + ')').join(' ')); }
}
for (let rep = 0; rep < 6; rep++) {
  check('12+34', write(['12+34']), '12+34');
  check('7-5', write(['7-5']), '7−5');
  check('3/4+1', write([{ frac: ['3', '4'] }, '+1']), '[3/4]+1');
  check('2^10', write(['2', { pow: '10' }]), '2^(10)');
  check('√16', write([{ sqrt: '16' }]), '√(16)');
  check('2x+3=7', write(['2x+3=7']), '2x+3=7');
  check('6.5*2', write(['6.5*2']), '6.5×2');
  check('(1+2)X3', write(['(1+2)X3']), '(1+2)×3');
  check('8÷2', write(['8÷2']), '8÷2');
  check('9:3', write(['9:3']), '9÷3');
  check('frac groß', write([{ frac: ['10*6', '64'] }, '=']), '[10×6/64]=');
  check('5^2-9', write(['5', { pow: '2' }, '-9']), '5^(2)−9');
}
// einzelne Ziffern mit starker Verzerrung
const digits = '0123456789';
let dok = 0, dn = 0;
const conf = {};
for (let k = 0; k < 400; k++) {
  const d = digits[k % 10];
  const r = MathInk.recognize(glyph(d, 0, 0, 0, H).map((s, i) => ({ ...s, id: i })));
  const got = r.syms.length === 1 ? r.syms[0].cls : r.syms.map(s => s.cls).join('');
  dn++; if (got === d) dok++; else conf[d + '→' + got] = (conf[d + '→' + got] || 0) + 1;
}
console.log(`Ziffern einzeln: ${dok}/${dn} (${(100 * dok / dn).toFixed(1)} %)`, JSON.stringify(conf));
console.log(`${ok} von ${ok + bad} Ausdrücke richtig`);
process.exitCode = bad > (ok + bad) * 0.1 ? 1 : 0;
}
