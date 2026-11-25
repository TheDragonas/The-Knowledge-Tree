'use strict';
/* Fotomath „nach einer Unbekannten auflösen“ (1.27, MathInk.solveFor): Formeln umstellen und prüfen, dass die Lösung
 * die Gleichung erfüllt (Zufallswerte für die übrigen Buchstaben). Aufruf: node tests/mathink/aufloesen-test.js */
const { MathInk } = require('../../web/js/mathink.js');
let ok = 0, fail = 0;
const check = (label, cond, info = '') => { if (cond) ok++; else { fail++; console.log('  FEHLER:', label, info); } };
let seed = 11; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
/* text, Unbekannte, erwartete Textform (oder null = nur numerisch prüfen), Anzahl Lösungen */
const CASES = [
  ['U = R·I', 'I', 'I = U/R'],
  ['U = R·I', 'R', 'R = U/I'],
  ['2x + 3y = 12', 'y', null],
  ['2x + 3y = 12', 'x', 'x = (12 − 3·y)/2'],
  ['a·x + b = c', 'x', null],
  ['a·x^2 + b·x + c = 0', 'x', null],
  ['x^2 = a', 'x', 'x = ± √(a)'],
  ['F = m·a', 'm', 'm = F/a'],
  ['v = s/t', 't', 't = s/v'],
  ['E = m·c^2', 'c', null],
  ['p·V = n·R·T', 'T', null],
  ['A = π·r^2', 'r', null],
  ['y = m·x + q', 'm', null],
  ['y = m·x + q', 'x', null],
  ['1/f = 1/b + 1/g', 'g', null],
  ['k = 2^n', 'n', null],
  ['y = e^(k·t)', 't', null],
  ['√(x) − a = b', 'x', 'x = (b + a)^2'],
  ['3x − 7 = x + a', 'x', 'x = (a + 7)/2'],
  ['W = 1/2·m·v^2', 'v', null],
  ['s = 1/2·a·t^2 + v·t', 't', null],
  ['(x + a)^2 = b', 'x', null],
  ['ln(x) = a', 'x', 'x = e^a'],
  ['x/a + x/b = 1', 'x', null],
  ['a/(x + b) = c', 'x', null],
];
for (const [txt, v, want] of CASES) {
  const r = MathInk.fromText(txt);
  const res = MathInk.solveFor(r.left, r.right, v);
  if (res.error || !res.sols || !res.sols.length) { check(txt + ' nach ' + v, false, res.error || 'keine Lösung'); continue; }
  if (want) check(`${txt} nach ${v} → ${want}`, res.sols[0].text === want, res.sols[0].text);
  // numerisch prüfen: Zufallswerte (positiv, damit Wurzeln/Logarithmen gehen)
  const L = MathInk.symParse(r.left), R = MathInk.symParse(r.right);
  const vars = MathInk.varsIn(r.left, r.right).filter(x => x !== v);
  let good = 0, tries = 0;
  for (let k = 0; k < 20 && tries < 6; k++) {
    const env = {}; for (const x of vars) env[x] = 0.5 + rnd() * 3;
    for (const s of res.sols) for (const sg of [1, -1]) {
      let val;
      try { val = MathInk.symEval(s.node, env, sg); } catch (e) { continue; }
      if (!isFinite(val)) continue;
      const e2 = { ...env, [v]: val };
      const a = MathInk.symEval(L, e2), b = MathInk.symEval(R, e2);
      tries++;
      if (Math.abs(a - b) <= 1e-7 * Math.max(1, Math.abs(a), Math.abs(b))) good++;
      else if (!s.node || !/±/.test(s.text)) console.log('    weicht ab', txt, s.text, env, a, b);
    }
  }
  check(`${txt} nach ${v}: Lösung erfüllt die Gleichung (${res.sols.map(s => s.text).join(' ; ')})`, good > 0 && good >= tries * 0.5, `${good}/${tries}`);
}
// TeX ist lesbar (Formel-Darstellung)
const r1 = MathInk.fromText('a·x^2 + b·x + c = 0'), s1 = MathInk.solveFor(r1.left, r1.right, 'x');
check('Mitternachtsformel als TeX', /\\frac\{-b \\pm \\sqrt\{b\^\{2\} - 4 a c\}\}\{2 a\}/.test(s1.sols[0].tex), s1.sols[0].tex);
const r2 = MathInk.fromText('2x + 3 = 7'), s2 = MathInk.solveFor(r2.left, r2.right, 'x');
check('nur Zahlen: x = 2', s2.sols[0].text === 'x = 2', s2.sols[0].text);
const r3 = MathInk.fromText('x^2 + 1 = 0'), s3 = MathInk.solveFor(r3.left, r3.right, 'x');
check('keine reelle Lösung', s3.sols && s3.sols.length === 0, JSON.stringify(s3));
const r4 = MathInk.fromText('a + b = c'), s4 = MathInk.solveFor(r4.left, r4.right, 'x');
check('Unbekannte kommt nicht vor → Hinweis', /kommt in der Gleichung nicht vor/.test(s4.error || ''), s4.error);
check('Buchstaben in Reihenfolge x, y, dann alphabetisch', MathInk.varsIn(MathInk.fromText('b + y = x·a').left, MathInk.fromText('b + y = x·a').right).join() === 'x,y,a,b');
check('Text mit Buchstaben: sin bleibt Funktion', JSON.stringify(MathInk.fromText('sin(a) = b').left).includes('sin('));
console.log(`${ok} von ${ok + fail} Prüfungen bestanden (nach einer Unbekannten auflösen)`);
process.exit(fail ? 1 : 0);
