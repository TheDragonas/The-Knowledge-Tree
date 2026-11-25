'use strict';
/* Rechenwerk des Taschenrechners prüfen: node tests/calc/calc-test.js */
global.debounce = (f) => f; global.Store = { ui: {} };
const { CalcEngine } = require('../../web/js/calc.js');
let ok = 0, bad = 0;
const env = (o = {}) => ({ ang: 'DEG', vars: { x: 2, y: 3, z: 0, t: 0, a: 0, b: 0, c: 0, d: 0 }, ans: 5, ...o });
const fmt = (v) => CalcEngine.isC(v) ? `${+v.re.toPrecision(10)}${v.im < 0 ? '' : '+'}${+v.im.toPrecision(10)}i` : String(+v.toPrecision(10));
function t(src, want, o) {
  let got;
  try { got = fmt(CalcEngine.evaluate(src, env(o)).v); } catch (e) { got = 'ERR:' + e.message; }
  const pass = typeof want === 'string' && want.startsWith('ERR') ? got.startsWith(want) : got === String(want);
  if (pass) ok++; else { bad++; console.log('FALSCH', JSON.stringify(src), '→', got, 'erwartet', want); }
}
t('1+2*3', 7); t('-2^2', -4); t('~2^2', -4); t('2^3^2', 512); t('2π', 6.283185307); t('3(4+5)', 27);
t('((3)/(4))+((1)/(4))', 1); t('sqrt(16)', 4); t('root(3,-8)', -2); t('(-8)^(1/3)', -2); t('sin(30)', 0.5);
t('sqrt(-4)', 'ERR:Nicht reell'); t('sqrt(-4)', '0+2i', { cplx: 'a+bi' }); t('i*i', -1); t('(1+2i)*(3-i)', '5+5i'); t('(1+2i)/(1-i)', '-0.5+1.5i');
t('abs(3+4i)', 5); t('angle(i)', 90); t('conj(2+3i)', '2-3i'); t('real(2+3i)', 2); t('imag(2+3i)', 3); t('2∠90', '0+2i'); t('i^2', -1); t('e^(iπ)', -1);
t('1Fʰ', 31); t('1Fʰ+1', 32); t('101ᵇ', 5); t('17ᵒ', 15); t('12ᵈ', 12); t('2ʰ', 2); t('1Gʰ', 'ERR'); t('FF', 'ERR');
t('12&10', 8); t('12¦3', 15); t('12⊕10', 6); t('not(0)', -1);
t('30°15′', 30.25); t('30°15′36″', 30.26); t('90°', 1.570796327, { ang: 'RAD' }); t('sin(30°)', 0.5, { ang: 'RAD' }); t('sin((π/6)ʳ)', 0.5); t('100ᵍ', 90);
t('5\u0003in>cm\u0004', 12.7); t('100\u0003c>f\u0004', 212); t('rpr(3,4)', 5); t('rpt(1,1)', 45); t('prx(2,60)', 1); t('pry(2,30)', 1);
t('50+10%', 50.1); t('50+10%', 55, { pocket: true }); t('50-10%', 45, { pocket: true }); t('50*10%', 5, { pocket: true }); t('200%', 2);
t('5!', 120); t('5nCr2', 10); t('5nPr2', 20); t('ln(-1)', 'ERR:Nicht reell'); t('ln(-1)', '0+3.141592654i', { cplx: 'a+bi' });
t('x+y', 5); t('Ans*2', 10); t('3→z', 3); t('log(1000)', 3); t('logb(2,8)', 3); t('lcm(4,6)', 12); t('gcd(12,18)', 6);
t('1/0', 'ERR:Division'); t('normalcdf(-1,1)', 0.6826894921); t('round(2.567,2)', 2.57);
t('5\u0005HEX\u0006', 5);
console.log(`${ok} von ${ok + bad} Tests bestanden`);
process.exitCode = bad ? 1 : 0;
