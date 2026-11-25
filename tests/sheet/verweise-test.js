'use strict';
/* Bezüge über Seiten und Neuberechnung wie Excel (seit 1.26, sheet-calc.js):
 *   [Seite]Tabelle1!A1, [Abschnitt/Seite]Tabelle1!A1, '[Seite mit Leerzeichen]Tabelle 1'!A1
 *   nur was von einer Änderung abhängt wird neu gerechnet (auch über Seiten und Umwege), flüchtige immer.
 * Aufruf: node tests/sheet/verweise-test.js */
const XL = require('../../web/js/sheet-calc.js');
let ok = 0, fail = 0;
const check = (label, cond, info = '') => { if (cond) ok++; else { fail++; console.log('  FEHLER:', label, info); } };
const sheet = (name, cells) => { const d = XL.normSheet({ name, cells: {}, nrows: 20, ncols: 8 }); for (const [k, v] of Object.entries(cells)) d.cells[k] = { v }; return d; };

// drei Seiten: „Rezepte“ (Abschnitt Daten), „Fabrik A“ und „Fabrik B“ (Abschnitt Planung), zweimal „Übersicht“
const pages = { pR: { title: 'Rezepte', sec: 'Daten' }, pA: { title: 'Fabrik A', sec: 'Planung' }, pB: { title: 'Fabrik B', sec: 'Planung' }, pU1: { title: 'Übersicht', sec: 'Daten' }, pU2: { title: 'Übersicht', sec: 'Planung' } };
const resolve = (from, path) => {
  const parts = path.split('/').map(x => x.trim().toLowerCase());
  const title = parts.pop();
  const cand = Object.entries(pages).filter(([, p]) => p.title.toLowerCase() === title && (!parts.length || p.sec.toLowerCase() === parts[parts.length - 1]));
  if (!cand.length) return null;
  const same = cand.find(([, p]) => from && pages[from] && p.sec === pages[from].sec);
  return (same || cand[0])[0];
};
const R = sheet('Rezepte', { A1: 'Eisenbarren', B1: '30', A2: 'Eisenplatte', B2: '20', C1: '=B1*2' });
const A = sheet('Tabelle1', { A1: '=[Rezepte]Rezepte!B1/2', A2: "=SUMME([Rezepte]Rezepte!B1:B2)", A3: "=SVERWEIS(\"Eisenplatte\";[Rezepte]Rezepte!A1:B2;2;FALSCH)", A4: '=[Rezepte]Rezepte!C1+1' });
const B2 = sheet('Plan 2', { A1: "='[Fabrik A]Tabelle1'!A2*10", A2: '=[Fabrik A]Tabelle1!A4', A3: '=[Daten/Übersicht]Tabelle1!A1', A4: '=[Übersicht]Tabelle1!A1', A5: '=ZUFALLSZAHL()', A6: '=[Gibt es nicht]Tabelle1!A1' });
const U1 = sheet('Tabelle1', { A1: '111' }), U2 = sheet('Tabelle1', { A1: '222' });
const sheets = [{ id: 'R', name: R.name, d: R, page: 'pR' }, { id: 'A', name: A.name, d: A, page: 'pA' }, { id: 'B', name: B2.name, d: B2, page: 'pB' }, { id: 'U1', name: 'Tabelle1', d: U1, page: 'pU1' }, { id: 'U2', name: 'Tabelle1', d: U2, page: 'pU2' }];
const book = new XL.Book(sheets, { resolve });
let evals = 0;
const orig = book.formula.bind(book);
book.formula = (...a) => { evals++; return orig(...a); };
const v = (id, k) => { const p = XL.parseKey(k); return book.val(book.byId.get(id), p.c, p.r); };

check('[Seite]Tabelle!A1', v('A', 'A1') === 15);
check('Bereich auf anderer Seite (SUMME)', v('A', 'A2') === 50);
check('SVERWEIS über Seiten', v('A', 'A3') === 20);
check('Formel auf anderer Seite', v('A', 'A4') === 61);
check("'[Seite mit Leerzeichen]Tabelle'!A1, über zwei Seiten", v('B', 'A1') === 500);
check('Umweg über zwei Seiten', v('B', 'A2') === 61);
check('[Abschnitt/Seite] wählt die richtige gleichnamige Seite', v('B', 'A3') === 111);
check('gleichnamige Seite: zuerst im eigenen Abschnitt', v('B', 'A4') === 222);
check('unbekannte Seite → #BEZUG!', XL.isErr(v('B', 'A6')) && v('B', 'A6').e === '#BEZUG!');
const r1 = v('B', 'A5');

// nur Abhängiges neu rechnen
evals = 0;
check('gemerkt: kein neues Rechnen', v('B', 'A1') === 500 && v('A', 'A2') === 50 && evals === 0, evals);
R.cells.B2.v = '40';
const aff = book.changed([{ id: 'R', cells: [[1, 1]] }]);
evals = 0;
check('B2 geändert → SUMME neu', v('A', 'A2') === 70);
check('… und über die Seite weiter', v('B', 'A1') === 700);
check('… SVERWEIS neu', v('A', 'A3') === 40);
const n1 = evals;
check('nicht betroffen: A1, A4, A2 der anderen Seite und C1 bleiben gemerkt', v('A', 'A1') === 15 && v('A', 'A4') === 61 && v('B', 'A2') === 61 && v('R', 'C1') === 60 && evals === n1, `evals ${evals} vs ${n1}`);
check('flüchtig: ZUFALLSZAHL bei jeder Änderung neu', v('B', 'A5') !== r1);
check('Meldung nennt betroffene Tabellen', aff.has('R') && aff.has('A') && aff.has('B') && !aff.has('U1'), [...aff.keys()].join());
R.cells.B1.v = '10';
book.changed([{ id: 'R', cells: [[1, 0]] }]);
check('Kette B1 → C1 → [Fabrik A]A4 → [Fabrik B]A2', v('R', 'C1') === 20 && v('A', 'A4') === 21 && v('B', 'A2') === 21 && v('A', 'A1') === 5);
// manuelle Berechnung: nur die Zelle selbst
R.cells.B1.v = '100';
book.changed([{ id: 'R', cells: [[1, 0]] }], false);
check('manuell: abhängige Werte bleiben stehen', v('R', 'B1') === 100 && v('R', 'C1') === 20);
book.changed([{ id: 'R', cells: [[1, 0]] }]);
check('… nach F9 (tief) neu', v('R', 'C1') === 200 && v('B', 'A2') === 201);
// ganze Tabelle (Zeilen eingefügt o.ä.)
U2.cells.A1.v = '333';
book.changed([{ id: 'U2' }]);
check('ganze Tabelle geändert', v('B', 'A4') === 333 && v('B', 'A3') === 111);
// Kreisbezug über Seiten
const X = sheet('X', { A1: '=[Fabrik B]Y!A1+1' }), Y = sheet('Y', { A1: '=[Fabrik A]X!A1+1' });
const b2 = new XL.Book([{ id: 'X', name: 'X', d: X, page: 'pA' }, { id: 'Y', name: 'Y', d: Y, page: 'pB' }], { resolve });
const cx = b2.val(b2.byId.get('X'), 0, 0);
check('Kreisbezug über Seiten → #ZIRKEL!', XL.isErr(cx) && cx.e === '#ZIRKEL!', String(cx));
// Bereich: Änderung ausserhalb ändert nichts
const S = sheet('S', { A1: '1', A2: '2', B1: '5', C1: '=SUMME(A:A)' });
const b3 = new XL.Book([{ id: 'S', name: 'S', d: S }]);
let e3 = 0; const o3 = b3.formula.bind(b3); b3.formula = (...a) => { e3++; return o3(...a); };
check('ganze Spalte', b3.val(b3.byId.get('S'), 2, 0) === 3);
S.cells.B1.v = '7'; b3.changed([{ id: 'S', cells: [[1, 0]] }]); e3 = 0; b3.val(b3.byId.get('S'), 2, 0);
check('Änderung in Spalte B rechnet SUMME(A:A) nicht neu', e3 === 0, e3);
S.cells.A9 = { v: '10' }; b3.changed([{ id: 'S', cells: [[0, 8]] }]);
check('neue Zahl in Spalte A zählt', b3.val(b3.byId.get('S'), 2, 0) === 13);

// Schreibweise und Umschreiben
check('Text: [Seite]Tabelle1!A1 bleibt', XL.normalize('=[Rezepte]rezepte!b1') === '=[Rezepte]rezepte!B1');
check('Text: Leerzeichen → in Hochkommas', XL.normalize('=[Fabrik A]Tabelle1!a2') === "='[Fabrik A]Tabelle1'!A2");
check('refsIn kennt die Seite', XL.refsIn("='[Fabrik A]Tabelle 1'!A2:B3")[0].page === 'Fabrik A' && XL.refsIn("='[Fabrik A]Tabelle 1'!A2:B3")[0].sheet === 'Tabelle 1');
check('Tabelle umbenennen trifft keine Bezüge auf andere Seiten', XL.renameSheetRefs('=Tabelle1!A1+[X]Tabelle1!A1', 'Tabelle1', 'T') === '=T!A1+[X]Tabelle1!A1');
const adj = XL.adjustRefs('=[Rezepte]Rezepte!B5+B5', (t) => t.page === 'Rezepte', 'Tabelle1', 'r', 2, 1);
check('Zeilen einfügen auf anderer Seite (Prüf-Funktion)', adj === '=[Rezepte]Rezepte!B6+B5', adj);
check('Seite umbenennen (rewrite)', XL.rewrite('=[Rezepte]Rezepte!B1*2', (t) => { if (t.page === 'Rezepte') { t.page = 'Alle Rezepte'; return t; } }) === "='[Alle Rezepte]Rezepte'!B1*2");
check('flüchtig erkannt', XL.isVolatile(XL.parse('1+HEUTE()')) && !XL.isVolatile(XL.parse('SUMME(A1:A3)')));
let se = null; try { XL.parse('[Seite]!A1'); } catch (e) { se = e; }
check('[Seite]!A1 ohne Tabelle → verständlicher Fehler', se && /Tabelle1/.test(se.message));

console.log(`${ok} von ${ok + fail} Prüfungen bestanden (Bezüge über Seiten, Neuberechnung)`);
process.exit(fail ? 1 : 0);
