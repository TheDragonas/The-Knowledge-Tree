'use strict';
/* Schriftfarbe passend zum Hintergrund prüfen: node tests/contrast/contrast-test.js */
const { Contrast: C } = require('../../web/js/contrast.js');
let ok = 0, bad = 0;
const check = (name, cond, info) => { if (cond) ok++; else { bad++; console.log('FALSCH', name, info !== undefined ? info : ''); } };
const L = (c) => C.lum(C.rgb(c));
const R = (a, b) => C.ratio(C.rgb(a), C.rgb(b));
const notPure = (c) => c !== '#ffffff' && c !== '#000000';
const light = (c) => L(c) > 0.5, darkc = (c) => L(c) < 0.1;

// Farben lesen
check('hex3', C.hex('#abc') === '#aabbcc');
check('hex6', C.hex('#1E4E79') === '#1e4e79');
check('rgb()', C.hex('rgb(30, 78, 121)') === '#1e4e79');
check('rgba() Alpha', C.rgb('rgba(255, 255, 0, 0.5)')[3] === 127.5);
check('rgb mit Leerzeichen', C.hex('rgb(30 78 121)') === '#1e4e79');
check('var() = unbekannt', C.rgb('var(--ink)') === null);
check('Unsinn = unbekannt', C.rgb('blabla') === null);
check('transparent', C.rgb('transparent')[3] === 0);
check('color(srgb) aus color-mix()', C.hex('color(srgb 0.243 0.251 0.259)') === '#3e4042' && C.rgb('color(srgb 1 0 0 / 0.5)')[3] === 127.5);

// Standardfelder: nie reines Weiss/Schwarz, Tendenz je nach Design, gut lesbar
const dBox = '#2a2a2a', hBox = '#ffffff';
const aD = C.auto(dBox, true), aH = C.auto(hBox, false);
console.log('Standard dunkel', aD, R(aD, dBox).toFixed(1), '| hell', aH, R(aH, hBox).toFixed(1));
check('dunkel -> hell', light(aD), aD); check('hell -> dunkel', darkc(aH), aH);
check('nicht reinweiss/-schwarz', notPure(aD) && notPure(aH));
check('dunkel lesbar >= 7', R(aD, dBox) >= 7); check('hell lesbar >= 7', R(aH, hBox) >= 7);
check('nicht hart (unter 17:1)', R(aD, dBox) < 17 && R(aH, hBox) < 17);
// Tönung der Hintergrundfarbe (gleicher Farbton)
const blueBg = '#1f3763', aBlue = C.auto(blueBg, true);
const [hb] = C.hsl(C.rgb(blueBg)), [ha, sa] = C.hsl(C.rgb(aBlue));
check('Tönung behält Farbton', Math.abs(hb - ha) < 0.02 && sa > 0.05, aBlue);
// Gegenseite nur wenn nötig: hellgelbes Feld im dunklen Design -> dunkle Schrift
const yel = '#FFF4C2', aY = C.auto(yel, true);
check('hellgelb im dunklen Design -> dunkle Schrift', darkc(aY) && R(aY, yel) >= 4.5, aY);
const navy = '#2B2F36', aN = C.auto(navy, false);
check('dunkles Feld im hellen Design -> helle Schrift', light(aN) && R(aN, navy) >= 4.5, aN);
// mittlere Farbe: Tendenz, solange lesbar
for (const [bg, d] of [['#6AA3E8', true], ['#6AA3E8', false], ['#808080', true], ['#808080', false], ['#E06666', true], ['#5DB36A', false], ['#ff0000', true], ['#0000ff', false]]) {
  const a = C.auto(bg, d);
  check(`mittel ${bg} ${d ? 'dunkel' : 'hell'} lesbar`, R(a, bg) >= 4.5, a + ' ' + R(a, bg).toFixed(2));
  check(`mittel ${bg} nicht rein`, notPure(a), a);
}
// Seitenfarben (hell) und abgedunkelt im dunklen Design
for (const pc of ['#FFFBEA', '#FDF3D1', '#E9F5E4', '#E3F0FB', '#EEE8F8', '#FCE9EE', '#E5F5F3', '#FBEBDF', '#F1F1F1']) {
  const h = C.auto(pc, false), dk = C.mix([31, 31, 31, 255], C.rgb(pc), 0.16), d = C.auto(dk, true);
  check('Seitenfarbe hell ' + pc, darkc(h) && R(h, pc) >= 7, h);
  check('Seitenfarbe dunkel ' + pc, light(d) && R(d, dk) >= 7, d);
}

// fest gewählte Farben: bleiben, wenn lesbar
check('rot auf weiss bleibt', C.readable('#C00000', '#ffffff', false) === null);
check('hellblau auf dunkel bleibt', C.readable('#8ab4f8', '#2a2a2a', true) === null);
check('Orange auf weiss (2.8:1) wird nachgedunkelt', !!C.readable('#ED7D31', '#ffffff', false));
// ... sonst gleiche Farbe heller/dunkler
for (const [col, bg, d] of [['#1e4e79', dBox, true], ['#2f5496', dBox, true], ['#595959', dBox, true], ['#000000', dBox, true], ['#C00000', dBox, true], ['#FFFF00', hBox, false], ['#ffffff', hBox, false], ['#e1e1e1', hBox, false], ['#252423', '#2B2F36', false]]) {
  const f = C.readable(col, bg, d);
  check(`${col} auf ${bg} korrigiert`, !!f && R(f, bg) >= 4.5, f);
  if (!f) continue;
  const [h0, s0] = C.hsl(C.rgb(col)), [h1, s1] = C.hsl(C.rgb(f));
  if (s0 > 0.1) check(`${col} Farbton bleibt`, Math.abs(h0 - h1) < 0.03, f);
  else check(`${col} bleibt grau`, s1 < 0.05, f);
  console.log('  ', col, 'auf', bg, '->', f, R(f, bg).toFixed(2));
}
// dunkles Design: Korrektur Richtung hell
check('schwarz im dunklen Design -> hell', light(C.readable('#000000', dBox, true)));
check('weiss im hellen Design -> dunkel', darkc(C.readable('#ffffff', hBox, false)));

// Altdaten: Fülleffekt/Vorlage setzten feste #252423/#F3F3F3 = automatisch
check('alt #252423 mit Füllung = automatisch', C.boxColor({ bg: '#FFF4C2', color: '#252423' }) === null);
check('alt #F3F3F3 mit Füllung = automatisch', C.boxColor({ bg: '#2B2F36', color: '#F3F3F3' }) === null);
check('andere Feldfarbe bleibt', C.boxColor({ bg: '#FFF4C2', color: '#C00000' }) === '#C00000');
check('ohne Füllung bleibt', C.boxColor({ color: '#252423' }) === '#252423');

// Speichern: Anzeige-Korrektur entfernen
check('strip nur Variable', C.strip('<span style="color: rgb(30, 78, 121); --kt-ink: #8fb3d9;">x</span>') === '<span style="color: rgb(30, 78, 121);">x</span>');
check('strip leeres style', C.strip('<span style="--kt-ink: #8fb3d9;">x</span>') === '<span>x</span>');
check('strip mehrere', C.strip('<b style="--kt-ink:#111">a</b><i style="font-weight:bold; --kt-ink: #222">b</i>') === '<b>a</b><i style="font-weight:bold;">b</i>');
check('strip ohne Treffer gleich', C.strip('<p style="color:red">x</p>') === '<p style="color:red">x</p>');

console.log(`${ok} ok, ${bad} falsch`);
process.exit(bad ? 1 : 0);
