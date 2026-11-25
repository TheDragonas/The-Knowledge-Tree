'use strict';
/* Fotomath (1.52): unleserliche Handschrift – node tests/mathink/schlampig-test.js
 * Erzeugt bewusst „schlechte" Schrift aus den echten Handschrift-Vorlagen (HAND) und den Grundformen (RAW):
 * starke Schräglage, Drehung, gestauchte/gedehnte Zeichen, Zittern und wellige Linien, abgesetzte Striche
 * (Stift kurz abgehoben), Überschwinger am Ende, schwankende Grundlinie und Grösse, enge Abstände.
 * Gemessen wird die Erkennung einzelner Zeichen und ganzer Rechnungen (mit festem Zufall – vergleichbar). */
const { MathInk } = require('../../web/js/mathink.js');
let seed = 4242;
const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
const R = (a, b) => a + (b - a) * rnd();

/* ein Zeichen „schlampig" in ein Kästchen der Höhe h bei (x, y) */
function sloppy(cls, x, y, h, lvl = 1) {
  const src = [...(MathInk.HAND[cls] || []), ...(MathInk.RAW[cls] || [])];
  const tpl = src[Math.floor(rnd() * src.length)];
  const sx = R(1 - 0.32 * lvl, 1 + 0.32 * lvl), shear = R(-0.38 * lvl, 0.3 * lvl), rot = R(-0.16 * lvl, 0.16 * lvl), sy = R(1 - 0.12 * lvl, 1 + 0.12 * lvl);
  const jit = 0.03 * lvl, wob = 0.05 * lvl, wf = R(4, 9), wp = R(0, 6.28);
  const all = tpl.flat(), x1 = Math.min(...all.map(p => p[0])), y1 = Math.min(...all.map(p => p[1])), y2 = Math.max(...all.map(p => p[1]));
  const bh = Math.max(y2 - y1, 0.001);
  const map = (px, py, t) => {
    const nx = (px - x1) / bh, ny = (py - y1) / bh * sy;
    const qx = nx * sx + ny * shear, qy = ny;
    const rx = qx * Math.cos(rot) - qy * Math.sin(rot), ry = qx * Math.sin(rot) + qy * Math.cos(rot);
    const w = wob * Math.sin(t * wf + wp);   // wellige, unruhige Linie
    return { x: x + (rx + w + R(-jit, jit)) * h, y: y + (ry + w * 0.6 + R(-jit, jit)) * h };
  };
  const out = [];
  for (const st of tpl) {
    const pts = [];
    let t = 0;
    for (let k = 0; k < st.length; k++) {
      const [px, py] = st[k];
      pts.push(map(px, py, t)); t += 0.15;
      if (k + 1 < st.length) { const [ax, ay] = st[k + 1]; for (let s = 1; s < 4; s++) { pts.push(map(px + (ax - px) * s / 4, py + (ay - py) * s / 4, t)); t += 0.05; } }
    }
    // Überschwinger am Ende (Stift zu spät abgehoben)
    if (pts.length > 3 && rnd() < 0.35 * lvl) {
      const a = pts[pts.length - 2], b = pts[pts.length - 1], d = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      for (let s = 1; s <= 3; s++) pts.push({ x: b.x + (b.x - a.x) / d * h * 0.04 * s, y: b.y + (b.y - a.y) / d * h * 0.04 * s });
    }
    // Stift kurz abgehoben: Strich in zwei Teile mit kleiner Lücke
    if (pts.length > 14 && rnd() < 0.18 * lvl) {
      const c = Math.floor(R(0.35, 0.65) * pts.length);
      out.push({ pts: pts.slice(0, c) }, { pts: pts.slice(c + 1) });
    } else out.push({ pts });
  }
  return out;
}
const line = (x1, y1, x2, y2, lvl = 1) => { const pts = []; const bend = R(-0.06, 0.06) * lvl * (x2 - x1); for (let i = 0; i <= 12; i++) { const t = i / 12; pts.push({ x: x1 + (x2 - x1) * t + R(-0.8, 0.8) * lvl, y: y1 + (y2 - y1) * t + Math.sin(t * Math.PI) * bend + R(-0.9, 0.9) * lvl }); } return [{ pts }]; };
const dot = (x, y) => [{ pts: [{ x, y }, { x: x + R(0.5, 2), y: y + R(0.3, 1.8) }] }];

/* Zeile schreiben: Ziffern/Zeichen mit schwankender Grösse, Grundlinie und engen Abständen */
function write(str, lvl = 1, H = 30) {
  let x = 0; const out = []; let base = 0;
  for (const ch of str) {
    base += R(-2.5, 2.5) * lvl; base = Math.max(-8, Math.min(8, base));
    const h = H * R(1 - 0.22 * lvl, 1 + 0.22 * lvl), y0 = base + (H - h) * R(0.2, 0.8);
    if (ch === '+') { out.push(...line(x, y0 + h * 0.5, x + h * 0.5, y0 + h * R(0.45, 0.55), lvl), ...line(x + h * R(0.2, 0.3), y0 + h * 0.25, x + h * R(0.2, 0.3), y0 + h * 0.78, lvl)); x += h * R(0.6, 0.8); continue; }
    if (ch === '-') { out.push(...line(x, y0 + h * 0.5, x + h * 0.48, y0 + h * R(0.45, 0.56), lvl)); x += h * R(0.6, 0.78); continue; }
    if (ch === '=') { const w = h * R(0.45, 0.6); out.push(...line(x, y0 + h * 0.38, x + w, y0 + h * R(0.34, 0.42), lvl), ...line(x + R(-2, 2), y0 + h * 0.64, x + w * R(0.85, 1.1), y0 + h * R(0.6, 0.68), lvl)); x += h * R(0.7, 0.85); continue; }
    if (ch === '*') { out.push(...dot(x + 2, y0 + h * R(0.42, 0.58))); x += h * 0.38; continue; }
    if (ch === 'X') { out.push(...line(x, y0 + h * 0.3, x + h * 0.4, y0 + h * 0.72, lvl), ...line(x + h * 0.4, y0 + h * 0.3, x, y0 + h * 0.72, lvl)); x += h * 0.62; continue; }
    const st = sloppy(ch, x, y0 + (ch === 'x' ? h * 0.3 : 0), ch === 'x' ? h * 0.68 : h, lvl);
    out.push(...st);
    const w = Math.max(...st.flatMap(s => s.pts.map(p => p.x))) - x;
    x += w + H * R(0.08, 0.28);   // eng geschrieben
  }
  return out;
}
const flat = (tree) => (tree || []).map(t => typeof t === 'string' ? t : t.t === 'frac' ? `[${flat(t.a)}/${flat(t.b)}]` : t.t === 'pow' ? `^(${flat(t.a)})` : t.t === 'sqrt' ? `√(${flat(t.a)})` : '?').join('');
const norm = (s) => s.replace(/−/g, '-').replace(/×/g, '*').replace(/·/g, '*');

function run(lvl, quiet) {
  seed = 4242 + Math.round(lvl * 1000);
  // einzelne Zeichen
  const set = '0123456789+x()';
  let ok = 0, n = 0; const conf = {};
  for (let k = 0; k < 600; k++) {
    const c = set[k % set.length];
    const strokes = c === '+' ? write('+', lvl) : sloppy(c, 0, 0, 30, lvl);
    const r = MathInk.recognize(strokes.map((s, i) => ({ ...s, id: i })));
    // einzelnes Zeichen: die beste Lesart des Erkenners (ohne Zusammenhang – ein „+“ allein ist keine gültige Rechnung)
    const got = r.syms.map(s => s.alts[0] || s.cls).join('');
    n++; if (got === c) ok++; else conf[c + '→' + got] = (conf[c + '→' + got] || 0) + 1;
  }
  // ganze Rechnungen
  const exprs = ['12+34', '7-5', '2x+3=7', '45*3', '(1+2)X3', '908-17', '6x-4=20', '3x+1=10', '56+78', '100-9'];
  let eok = 0, en = 0; const bad = [];
  for (let rep = 0; rep < 12; rep++) for (const e of exprs) {
    const r = MathInk.recognize(write(e, lvl).map((s, i) => ({ ...s, id: i })));
    const got = norm(flat(r.left) + (r.right ? '=' + flat(r.right) : ''));
    const want = norm(e.replace(/X/g, '*'));
    en++; if (got === want) eok++; else if (bad.length < 6) bad.push(e + ' → ' + got);
  }
  if (!quiet) {
    const top = Object.entries(conf).sort((a, b) => b[1] - a[1]).slice(0, 10);
    console.log(`Stufe ${lvl}: Zeichen ${ok}/${n} (${(100 * ok / n).toFixed(1)} %) · Rechnungen ${eok}/${en} (${(100 * eok / en).toFixed(1)} %)`);
    console.log('   häufigste Fehler:', JSON.stringify(Object.fromEntries(top)));
    if (bad.length) console.log('   z. B.:', bad.join(' | '));
  }
  return { chars: ok / n, exprs: eok / en };
}
if (require.main === module) {
  const a = run(0.6), b = run(1), c = run(1.35);
  // Mindestwerte (1.52): bei mittlerer und starker Unordnung soll die Erkennung tragen
  const fail = a.chars < 0.93 || b.chars < 0.85 || b.exprs < 0.6;
  console.log(fail ? 'NICHT ERREICHT' : 'Ziel erreicht', '(Stufe 0,6 ≥ 93 % Zeichen, Stufe 1 ≥ 85 % Zeichen und ≥ 60 % Rechnungen)', `· Stufe 1,35: ${(100 * c.chars).toFixed(1)} % / ${(100 * c.exprs).toFixed(1)} %`);
  process.exitCode = fail ? 1 : 0;
}
module.exports = { run, sloppy, write };
