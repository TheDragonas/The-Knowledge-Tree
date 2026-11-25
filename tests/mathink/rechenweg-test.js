/* Rechenweg (1.38, mathsteps.js): Schritte und Ergebnis für Rechnungen und Gleichungen, Text mit Zeichen und Tastatur */
const { MathInk } = require('../../web/js/mathink.js');
global.MathInk = MathInk;
const { MathSteps } = require('../../web/js/mathsteps.js');
let ok = 0, bad = 0;
const check = (name, cond, info) => { if (cond) ok++; else { bad++; console.log('FEHLER:', name, info ?? ''); } };
const run = (src, v) => { const t = MathInk.fromText(src); return MathSteps.solve(t.left, t.right, { v }); };
const last = (src, o = {}) => { const L = MathSteps.lines(run(src), o); return L[L.length - 1]; };
const titles = (src) => run(src).steps.map(s => s.title);
// Rechnungen
check('Punkt vor Strich', last('2 + 3·4') === '2 + 3·4 = 14', last('2 + 3·4'));
check('Titel Punkt vor Strich', titles('2+3*4')[1].startsWith('Punkt vor Strich'));
check('Klammer zuerst', titles('(2+3)*4')[1].startsWith('In der Klammer'));
check('Brüche: gemeinsamer Nenner, zusammenfassen', JSON.stringify(titles('3/4+1/2').slice(1)) === JSON.stringify(['Auf den gemeinsamen Nenner 4 bringen', 'Zähler zusammenfassen']), titles('3/4+1/2'));
check('Brüche: Ergebnis mit gemischter Zahl und Dezimal', last('3/4+1/2') === '3/4 + 1/2 = 5/4 = 1 1/4 = 1.25', last('3/4+1/2'));
check('Kürzen', titles('2/6 + 1/6').includes('Kürzen (durch 3)'), titles('2/6 + 1/6'));
check('Durch Bruch teilen = Kehrwert', titles('3/4 : 1/2')[1].startsWith('Durch einen Bruch teilen'));
check('Potenz und Wurzel', last('√9 + 2^2') === '√9 + 2² = 7', last('√9 + 2^2'));
check('Wurzel teilweise + Näherung', last('√12') === '√12 = 2√3 ≈ 3.464101615', last('√12'));
check('Dezimalzahlen bleiben dezimal', last('1.5 + 2.25*2') === '1.5 + 2.25·2 = 6', last('1.5 + 2.25*2'));
check('Division durch 0', /Division durch 0/.test(last('7/0')), last('7/0'));
check('Tastaturzeichen', last('√9 + 2^2', { ascii: true }) === 'sqrt(9) + 2^2 = 7', last('√9 + 2^2', { ascii: true }));
check('π genähert', last('2·π') === '2·π ≈ 6.283185307', last('2·π'));
// Gleichungen
const eq = (src, o = {}) => MathSteps.lines(run(src), { steps: true, ...o });
check('linear: Schritte', JSON.stringify(eq('2x+3=11')) === JSON.stringify(['2x + 3 = 11', '2x = 8      | −3      (3 auf beiden Seiten abziehen)', 'x = 4      | :2      (Durch 2 teilen)', '⇒ x = 4']), eq('2x+3=11'));
check('linear: x auf beiden Seiten', last('3x-5=x+7') === '3x − 5 = x + 7   ⇒   x = 6', last('3x-5=x+7'));
check('linear: Seiten tauschen', titles('5=2x-1')[1] === 'Seiten tauschen');
check('Klammern auflösen', titles('2(x+3)=4x')[1] === 'Klammern auflösen und zusammenfassen');
check('Mitternachtsformel', last('x^2-5x+6=0') === 'x² − 5x + 6 = 0   ⇒   x₁ = 2,  x₂ = 3', last('x^2-5x+6=0'));
check('Diskriminante als Schritt', titles('x^2-5x+6=0').includes('Diskriminante berechnen'));
check('reinquadratisch ±', last('x^2=9') === 'x² = 9   ⇒   x₁ = −3,  x₂ = 3', last('x^2=9'));
check('ausklammern', titles('2x^2+4x=0').includes('x ausklammern'));
check('keine reelle Lösung', /keine Lösung/.test(last('x^2+1=0')));
check('Formel umstellen U = R·I nach I', last('U=R*I') === 'U = R·I   ⇒   I = U/R', last('U=R*I'));
check('Tastatur bei Gleichung', last('x^2=9', { ascii: true }) === 'x^2 = 9   =>   x1 = -3,  x2 = 3', last('x^2=9', { ascii: true }));
// getippte Rechnungen (fromText)
check('Text: 3x4 = mal', JSON.stringify(MathInk.fromText('3x4').left) === JSON.stringify(['3', '×', '4']));
check('Text: hochgestellte Zahlen', last('2³ + 1') === '2³ + 1 = 9', last('2³ + 1'));
check('Text: Dezimalkomma', last('3,5 + 1') === '3.5 + 1 = 4.5', last('3,5 + 1'));
console.log(`${ok} von ${ok + bad} Prüfungen bestanden (Rechenweg)`);
process.exit(bad ? 1 : 0);
