'use strict';
/* Fotomath-Werkzeuge (1.52, wie Derive/Photomath) prüfen: node tests/mathink/werkzeuge-test.js
 * Ableiten, Integrieren (unbestimmt/bestimmt), Faktorisieren, Ausmultiplizieren, Gleichungssysteme, Ungleichungen,
 * Kurvendiskussion, Taylorpolynom, Primfaktoren, ggT/kgV – Ergebnisse als Text verglichen und numerisch geprüft;
 * jeder Rechenweg muss als LaTeX fehlerfrei in MathML umgewandelt werden können. */
global.MathInk = require('../../web/js/mathink.js').MathInk;
global.MathSteps = require('../../web/js/mathsteps.js').MathSteps;
const { MathCAS: C } = require('../../web/js/mathcas.js');
// Formel-Darstellung (ohne DOM) zum Prüfen der LaTeX-Ausgabe
global.escapeHtml = (s) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
let Formula = null;
try { const src = require('fs').readFileSync(require('path').join(__dirname, '../../web/js/formula.js'), 'utf8'); Formula = new Function(src + '\nreturn Formula;')(); } catch (e) { Formula = null; }

const T = (s) => { const r = MathInk.fromText(s); return { L: MathInk.symParse(r.left), R: r.right ? MathInk.symParse(r.right) : null }; };
let ok = 0, bad = 0;
const norm = (s) => String(s).replace(/\s+/g, '').replace(/−/g, '-').replace(/·/g, '');   // Malpunkt egal
function check(name, got, want) {
  if (norm(got) === norm(want)) ok++;
  else { bad++; console.log('FALSCH', name, '→', got, '| erwartet', want); }
}
function texOk(name, res) {
  if (!Formula) return;
  for (const s of [...res.steps.map(x => x.tex).filter(Boolean), res.tex].filter(Boolean)) {
    try { const m = Formula.toMathML(s, false); if (!m || /undefined|NaN/.test(m)) throw new Error('leer'); ok++; } catch (e) { bad++; console.log('LaTeX FALSCH', name, s, e.message); }
  }
}
// Ableiten: Text + numerischer Vergleich mit dem Differenzenquotienten
const D = [
  ['3x^2+2x-5', '6x + 2'], ['x^3*sin(x)', '3x^2·sin(x) + x^3·cos(x)'], ['sin(2x+1)', '2·cos(2x + 1)'],
  ['e^(3x)', '3·e^(3x)'], ['ln(x^2+1)', '2x/(x^2 + 1)'], ['1/x', '−1/x^2'], ['x*e^x', 'e^x + x·e^x'], ['5', '0'], ['2^x', '2^x·ln(2)'],
  ['(x^2+1)/(x-1)', '(x^2 − 2x − 1)/(x − 1)^2'], ['sqrt(x)', '1/(2·√(x))'], ['tan(x)', '1/cos(x)^2'], ['(2x+1)^3', '6·(2x + 1)^2'],
];
for (const [f, want] of D) {
  const r = C.diff(T(f).L, 'x');
  check('d/dx ' + f, r.text.replace(/·(?=[a-z(√e])/g, (m, i, s) => /\d/.test(s[i - 1]) ? '' : m), want);
  const F = (x) => MathInk.symEval(T(f).L, { x }), dF = (x) => MathInk.symEval(r.result, { x });
  for (const x of [0.7, 1.9, 2.6]) { const h = 1e-5, num = (F(x + h) - F(x - h)) / (2 * h); if (Math.abs(num - dF(x)) > 1e-4 * Math.max(1, Math.abs(num))) { bad++; console.log('ABLEITUNG NUMERISCH FALSCH', f, x, num, dF(x)); } else ok++; }
  texOk('d ' + f, r);
}
// Integrieren: Stammfunktion abgeleitet = Funktion (macht integrate selbst, hier nochmals mit festen Ergebnissen)
const I = [
  ['3x^2+2x-5', 'x^3 + x^2 − 5x + C'], ['x*e^x', 'x·e^x − e^x + C'], ['1/x', 'ln(|x|) + C'], ['ln(x)', 'x·ln(x) − x + C'],
  ['(2x+1)^3', '(2x + 1)^4/8 + C'], ['1/(2x+3)', 'ln(|2x + 3|)/2 + C'], ['2x/(x^2+1)', 'ln(|x^2 + 1|) + C'], ['x^2*cos(x)', 'x^2·sin(x) + 2x·cos(x) − 2·sin(x) + C'],
  ['x*ln(x)', 'x^2·ln(x)/2 − x^2/4 + C'], ['cos(3x)', 'sin(3x)/3 + C'],
];
for (const [f, want] of I) { const r = C.integrate(T(f).L, 'x'); check('∫ ' + f, (r.text || r.error).replace(/(\d)·(?=[a-z(])/g, '$1'), want); texOk('∫ ' + f, r); }
check('∫ e^(x²) ohne Stammfunktion', !!C.integrate(T('e^(x^2)').L, 'x').error, true);
const B = (a, b) => [MathInk.symParse(MathInk.fromText(a).left), MathInk.symParse(MathInk.fromText(b).left)];
check('∫0..3 x²', C.integrate(T('x^2').L, 'x', B('0', '3')).text, '9');
check('∫1..2 1/x', C.integrate(T('1/x').L, 'x', B('1', '2')).text, 'ln(2) ≈ 0.693147');
check('∫0..π sin', C.integrate(T('sin(x)').L, 'x', B('0', 'π')).text, '2');
check('∫−1..1 1/x Polstelle', !!C.integrate(T('1/x').L, 'x', B('−1', '1')).error, true);
check('∫0..1 e^(x²) numerisch', C.integrate(T('e^(x^2)').L, 'x', B('0', '1')).text, '≈ 1.46265');
// Faktorisieren (+ Probe)
const F = [
  ['x^2-5x+6', '(x − 2)·(x − 3)'], ['x^3-6x^2+11x-6', '(x − 1)·(x − 2)·(x − 3)'], ['2x^2-8', '2·(x + 2)·(x − 2)'], ['x^2+6x+9', '(x + 3)^2'],
  ['4a^2-9b^2', '(2a − 3b)·(2a + 3b)'], ['6ab+9a', '3·a·(2b + 3)'], ['x^4-1', '(x + 1)·(x − 1)·(x^2 + 1)'], ['x^2+1', 'x^2 + 1'],
  ['2x^3-3x^2-2x', 'x·(2x + 1)·(x − 2)'], ['3x^2+12x+12', '3·(x + 2)^2'], ['a^2+2ab+b^2', '(a + b)^2'], ['x^3+x^2+x+1', '(x + 1)·(x^2 + 1)'],
];
for (const [f, want] of F) { const r = C.factor(T(f).L, 'x'); check('Faktor ' + f, r.text.replace(/(\d)·(?=[a-z])/g, '$1'), want); check('Probe ' + f, r.ok, true); texOk('F ' + f, r); }
check('Ausmultiplizieren', C.expandSteps(T('(x+2)(x-3)').L).text.replace(/(\d)·(?=[a-z])/g, '$1'), 'x^2 − x − 6');
{ const e = C.expandSteps(T('(a+b)^3').L); check('Ausmultiplizieren (a+b)^3', e.result.k === '+' && e.result.a.length === 4 && Math.abs(MathInk.symEval(e.result, { a: 1.3, b: 0.4 }) - Math.pow(1.7, 3)) < 1e-9, true); }
// Gleichungssysteme
const sys = (s) => C.system(s.split(';').map(x => { const t = T(x); return { L: t.L, R: t.R }; }));
check('LGS 2×2', sys('2x+3y=7; x-y=1').text, 'x = 2;  y = 1');
check('LGS 3×3', sys('x+y+z=6; 2x-y+z=3; x+2y-z=2').text, 'x = 1;  y = 2;  z = 3');
check('LGS Brüche', sys('3x+2y=1; 2x-y=3').text, 'x = 1;  y = −1');
check('LGS Widerspruch', sys('x+y=2; 2x+2y=5').text, 'keine Lösung');
check('LGS unendlich', sys('x+y=2; 2x+2y=4').text, 'x = 2 − y;  y beliebig');
check('LGS nicht linear', (() => { try { sys('x*y=2; x+y=3'); return 'kein Fehler'; } catch (e) { return e.cas ? 'Fehler' : e.message; } })(), 'Fehler');
texOk('LGS', sys('x+y+z=6; 2x-y+z=3; x+2y-z=2'));
// Ungleichungen
const iq = (a, r, b) => C.inequality(T(a).L, r, T(b).L, 'x');
check('Ungl. linear', iq('3x-5', '<', '7').text, 'x < 4');
check('Ungl. Zeichen dreht', iq('-2x+4', '>=', '10').text, 'x ≤ −3');
check('Ungl. quadratisch >', iq('x^2-4', '>', '0').text, 'L = ]−∞; −2[ ∪ ]2; ∞[');
check('Ungl. quadratisch ≤', iq('x^2-4', '<=', '0').text, 'L = [−2; 2]');
check('Ungl. Berührpunkt', iq('(x-1)^2', '<=', '0').text, 'L = {1}');
check('Ungl. Bruch', iq('1/(x-2)', '>', '0').text, 'L = ]2; ∞[');
check('Ungl. nie', iq('x^2+1', '<', '0').text, 'L = { }');
check('Ungl. kubisch', iq('x^3-x', '>=', '0').text, 'L = [−1; 0] ∪ [1; ∞[');
texOk('Ungl', iq('x^3-x', '>=', '0'));
// Kurvendiskussion
const kd = C.curve(T('x^3-3x').L, 'x');
check('KD Hochpunkt', kd.pts.filter(p => p.kind === 'H').map(p => p.label).join(), 'Hochpunkt (−1 | 2)');
check('KD Tiefpunkt', kd.pts.filter(p => p.kind === 'T').map(p => p.label).join(), 'Tiefpunkt (1 | −2)');
check('KD Wendepunkt', kd.pts.filter(p => p.kind === 'W').map(p => p.label).join(), 'Wendepunkt (0 | 0)');
check('KD Nullstellen', kd.steps.find(s => s.title === 'Nullstellen').text, 'x1 = −√3, x2 = 0, x3 = √3');
check('KD Symmetrie', /punktsymmetrisch/.test(kd.steps.find(s => s.title === 'Symmetrie').note), true);
const kd2 = C.curve(T('x*e^(-x)').L, 'x');
check('KD x·e^−x', kd2.pts.filter(p => p.kind === 'H' || p.kind === 'W').map(p => p.label).join(' / '), 'Hochpunkt (1 | 1/e) / Wendepunkt (2 | 2/e^2)');
check('KD Verhalten', kd2.steps.find(s => s.title === 'Verhalten im Unendlichen').note, 'x → +∞: f(x) → 0;  x → −∞: f(x) → −∞');
const kd3 = C.curve(T('sin(x)').L, 'x');
check('KD sin (eine Periode)', kd3.pts.filter(p => p.kind === 'H' || p.kind === 'T').map(p => p.label).join(' / '), 'Hochpunkt (π/2 | 1) / Tiefpunkt (3·π/2 | −1)');
const kd4 = C.curve(T('1/(x-1)').L, 'x');
check('KD Polstelle', kd4.steps.find(s => s.title === 'Definitionsbereich').note, 'D = ℝ ohne { 1 }');
texOk('KD', kd); texOk('KD2', kd2);
const pl = C.plot([T('x^3-3x').L], 'x', kd.pts);
check('Graph Fenster', pl.x0 < -2 && pl.x1 > 2 && pl.y0 < -2 && pl.y1 > 2 && pl.series[0].length > 100, true);
// Taylor, Zahlen
check('Taylor e^x', C.taylor(T('e^x').L, 'x', 0, 4).text, 'T4(x) = 1 + x + x^2/2 + x^3/6 + x^4/24');
check('Taylor sin', C.taylor(T('sin(x)').L, 'x', 0, 5).text, 'T5(x) = x − x^3/6 + x^5/120');
check('Primfaktoren', C.primes(360).text, '360 = 2³ · 3² · 5');
check('Primzahl', C.primes(97).prime, true);
check('ggT', C.gcdLcm([12, 18], 'ggT').text, 'ggT = 6');
check('kgV', C.gcdLcm([4, 6, 10], 'kgV').text, 'kgV = 60');
// Text der Schritte (Einfügen)
const ln = C.lines(C.diff(T('x^2*sin(x)').L, 'x'), { steps: true });
check('Rechenweg-Text', ln.length >= 3 && /Produktregel/.test(ln.join('\n')), true);
check('Tastaturzeichen', /[−·²√]/.test(C.lines(C.diff(T('x^2*sin(x)').L, 'x'), { steps: true, ascii: true }).join('')), false);
// fremde Rechnungen bleiben gleich (Ausmultiplizieren repariert: (x+1)² endete früher in einer Endlosschleife)
check('expand (x+1)^2', MathInk.symText(MathInk.sym.expand(MathInk.symParse(MathInk.fromText('(x+1)^2').left))), 'x^2 + 2·x + 1');
console.log(`${ok} von ${ok + bad} Prüfungen bestanden (Fotomath-Werkzeuge)`);
process.exitCode = bad ? 1 : 0;
