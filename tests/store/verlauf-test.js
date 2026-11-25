// Verlauf/Speicher (seit 1.20): Ein-Byte-Schnappschüsse, Altlasten im gespeicherten Verlauf, Namen für das Aufräumen
const fs = require('fs'), path = require('path'), vm = require('vm');
const ctx = { console, setTimeout, clearTimeout, TextEncoder, TextDecoder, document: { createElement: () => ({ content: { firstChild: null }, innerHTML: '', style: {} }) }, UI: { updateUndo() {}, toast() {} }, Canvas: { pageId: null }, Backend: {}, Store: { pages: {}, groups: [], loaded: false } };
vm.createContext(ctx);
for (const f of ['util.js', 'store.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, '../../web/js', f), 'utf8').replace(/^'use strict';/, ''), ctx);
vm.runInContext('this.Hist = Hist; this.oneByte = oneByte; this.snapPage = snapPage; this.refsInMemory = refsInMemory; this.Store = Store;', ctx);
let ok = 0, fail = 0;
const check = (n, c, info) => { if (c) ok++; else { fail++; console.log('FEHLER:', n, info === undefined ? '' : info); } };
const { Hist, oneByte } = ctx;
// 1) Ein-Byte-Schnappschuss: gleiche Daten, nur Zeichen über U+00FF als \uXXXX
const page = { id: 'p1', title: '„Grüsse“ – Übung …', boxes: [{ id: 'b', html: '<div>Ä ö ü € 😀</div>', images: [{ src: 'a'.repeat(40) + '.png' }] }], drawings: [{ type: 'ink', pts: Array.from({ length: 3000 }, (_, i) => i * 0.5) }], links: [] };
const raw = JSON.stringify(page), snap = oneByte(raw);
check('gleiche Daten', JSON.stringify(JSON.parse(snap)) === raw);
check('nur noch Latin-1', !/[Ā-￿]/.test(snap));
check('Umlaute bleiben direkt', snap.includes('Grüsse') && snap.includes('Übung'));
check('kurzer Text unverändert', oneByte('{"a":1}') === '{"a":1}');
check('Nicht-Text unverändert', oneByte(null) === null);
check('Ersatzzeichen-Paar (Emoji)', JSON.parse(oneByte(JSON.stringify({ e: '😀' }))).e === '😀');
// 2) gespeicherter Verlauf aus älteren Versionen: riesige Schritte (und alles davor) fallen beim Laden weg
const big = { label: 'Import (alt)', patches: [{ k: 'p', id: 'x', b: null, a: 'x'.repeat(Hist.persistLimit + 10) }] };
const small = (l) => ({ label: l, patches: [{ k: 'p', id: l, b: null, a: '{}' }] });
Hist.load({ undo: [small('vorher'), big, small('danach1'), small('danach2')], redo: [small('r1')] });
check('Riesenschritt weg', Hist.undo.map(e => e.label).join(',') === 'danach1,danach2', Hist.undo.map(e => e.label));
check('Redo bleibt', Hist.redo.length === 1);
check('neu speichern vorgemerkt', Hist._dropped === true);
Hist._dropped = false;
Hist.load({ undo: [small('a'), small('b')], redo: [] });
check('normaler Verlauf unverändert', Hist.undo.length === 2 && !Hist._dropped);
// 1.32: Verlauf kommt nach den ersten Änderungen (Laden in Stufen) – alte Schritte davor, kein „Wiederholen“ mehr
Hist.undo = [small('neu')]; Hist.redo = [];
Hist.load({ undo: [small('alt1'), small('alt2')], redo: [small('r')] }, true);
check('nachgeladener Verlauf: alt vor neu', Hist.undo.map(e => e.label).join(',') === 'alt1,alt2,neu' && Hist.redo.length === 0, Hist.undo.map(e => e.label));
// 3) Namen im Speicher (Seiten + Verlauf), ohne die Freihand-Punkte zu durchsuchen
ctx.Store.pages = { p1: page, p2: { id: 'p2', title: '', boxes: [{ id: 'c', html: `<a class="kt-file" data-kt-file="${'b'.repeat(40)}.pdf">x</a>`, images: [] }], drawings: [], links: [] } };
Hist.undo = [{ label: 'x', patches: [{ k: 'p', id: 'p3', b: JSON.stringify({ boxes: [{ images: [{ src: 'c'.repeat(40) + '.jpg' }] }] }), a: null }] }];
Hist.redo = [];
const refs = ctx.refsInMemory();
check('Bild der Seite', refs.has('a'.repeat(40) + '.png'));
check('Anhang im Text', refs.has('b'.repeat(40) + '.pdf'));
check('Bild nur im Verlauf (Strg+Z)', refs.has('c'.repeat(40) + '.jpg'));
check('genau 3 Namen', refs.size === 3, [...refs]);
// 4) Schnappschuss und Commit benutzen dieselbe Form (sonst entstünden leere Verlaufsschritte)
ctx.Store.pages = { p1: page };
Hist.init();
Hist.ensureAll();   // seit 1.30 im Leerlauf bzw. vor der ersten Eingabe – hier sofort
check('Schnappschuss = snapPage', Hist.pageSnap.p1 === ctx.snapPage(page));
// 4b) 1.30: Schnappschuss in Stücken (grosse Freihand-Seiten) ist Zeichen für Zeichen gleich
vm.runInContext('this.snapSteps = snapSteps;', ctx);
const many = { id: 'p9', title: 'Viele – Striche …', modified: 5, boxes: [{ id: 'b', html: '<div><img src="x"> "modified":1 “x”</div>', images: [] }], links: [], pkgs: [],
  drawings: Array.from({ length: 700 }, (_, i) => ({ id: 'd' + i, type: 'ink', kind: 'pen', color: '#123', w: 1, pts: [i, i + 0.5, 0.5, i + 1, i + 2, 0.5, i + 3, i, 0.5], t: i % 7 ? 'ä' : '€' })) };
const g = ctx.snapSteps(many); let r, steps = 0; do { r = g.next(); steps++; } while (!r.done);
check('Stück-Schnappschuss = snapPage', r.value === ctx.snapPage(many) && steps > 3, steps);
// 4c) commit ändert nur das Datum im Text (ohne die Seite neu zu schreiben) – gleich wie ganz neu geschrieben
ctx.Store.pages = { p9: many }; Hist.init(); Hist.ensureAll(); Hist.undo = []; ctx.Save = { dirty: new Set(), schedule() {} };
vm.runInContext('Hist.commitSoon = { cancel() {}, flush() {} }; Hist.persistSoon = () => {};', ctx);
many.boxes[0].html = '<div><img src="y"></div>'; Hist.touchPage('p9'); Hist.commit('x');
check('commit: Schnappschuss mit neuem Datum = snapPage', Hist.pageSnap.p9 === ctx.snapPage(many) && many.modified > 5 && Hist.undo.length === 1);
// 5) Textfeld nur mit eingebettetem Bild/Anhang/Formel ist NICHT leer (bis 1.21 fiel es beim Speichern/Laden weg –
//    Bilder aus OneNote-Gliederungen waren nach dem Neuladen verschwunden)
vm.runInContext('this.cleanPage = cleanPage; this.isEmptyHtml = isEmptyHtml;', ctx);
const img = 'd'.repeat(40) + '.png';
const pg5 = { id: 'p5', title: '', links: [], drawings: [], boxes: [
  { id: 'i', html: `<div><img data-kt-src="${img}" style="width:200px"></div>`, images: [] },
  { id: 'f', html: `<div><a class="kt-file" data-kt-file="${'e'.repeat(40)}.pdf"></a></div>`, images: [] },
  { id: 'm', html: '<div><span class="kt-math" data-tex="x^2"></span></div>', images: [] },
  { id: 's', html: '<div><svg width="10" height="10"></svg></div>', images: [] },
  { id: 'b', html: '', images: [{ src: img }] }] };
const kept = ctx.cleanPage(pg5).boxes.map(b => b.id).join('');
check('Textfelder mit Bild/Anhang/Formel/SVG bleiben beim Speichern', kept === 'ifmsb', kept);
check('isEmptyHtml: nur Bild = nicht leer', ctx.isEmptyHtml(`<img data-kt-src="${img}">`) === false);
check('isEmptyHtml: leer bleibt leer', ctx.isEmptyHtml('') === true);
console.log(`${ok} von ${ok + fail} Prüfungen bestanden (Verlauf, Ein-Byte-Schnappschüsse, Aufräumen, leere Textfelder)`);
process.exit(fail ? 1 : 0);
