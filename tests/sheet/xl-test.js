'use strict';
/* Tests für die Formel-Engine (web/js/sheet-calc.js): node tests/sheet/xl-test.js */
const path = require('path');
const XL = require(path.join(__dirname, '../../web/js/sheet-calc.js'));

let fails = 0, n = 0;
const eq = (a, b) => {
  if (typeof a === 'number' && typeof b === 'number') return Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(b));
  if (XL.isErr(a)) return a.e === b;
  return a === b;
};
function check(label, got, want) {
  n++;
  if (!eq(got, want)) { fails++; console.log('FEHLER', label, '→', XL.isErr(got) ? got.e : JSON.stringify(got), 'erwartet', JSON.stringify(want)); }
}

/* Mappe mit zwei Tabellen */
const t1 = XL.normSheet({ name: 'Tabelle1', cells: {} });
const t2 = XL.normSheet({ name: 'Daten 2', cells: {} });
const set = (d, k, v) => { d.cells[k] = { v: String(v) }; const p = XL.parseKey(k); d.nrows = Math.max(d.nrows, p.r + 1); d.ncols = Math.max(d.ncols, p.c + 1); };
// A: Zahlen, B: Text, C: gemischt
[[1, 'Apfel'], [2, 'Birne'], [3, 'Apfel'], [4, 'Kiwi'], [5, 'Apfel']].forEach(([a, b], i) => { set(t1, 'A' + (i + 1), a); set(t1, 'B' + (i + 1), b); });
set(t1, 'C1', '10%'); set(t1, 'C2', '13.10.2026'); set(t1, 'C3', 'WAHR'); set(t1, 'C4', "'123"); set(t1, 'C5', '1’234.5');
set(t2, 'A1', 100); set(t2, 'A2', 200);
const book = () => new XL.Book([{ id: 's1', name: t1.name, d: t1 }, { id: 's2', name: t2.name, d: t2 }]);
const f = (src, c = 5, r = 9) => { const b = book(); const sh = b.sheets[0]; t1.cells['Z99'] = { v: '=' + src }; const v = b.val(sh, 25, 98); delete t1.cells['Z99']; return v; };

// Grundrechenarten und Vorrang wie Excel
check('1+2*3', f('1+2*3'), 7);
check('-2^2 (Excel = 4)', f('-2^2'), 4);
check('2^3^2 (links, Excel = 64)', f('2^3^2'), 64);
check('10%', f('10%'), 0.1);
check('50%*200', f('50%*200'), 100);
check('1/0', f('1/0'), '#DIV/0!');
check('"a"&1&WAHR', f('"a"&1&WAHR'), 'a1WAHR');
check('0.1+0.2=0.3', f('0.1+0.2=0.3'), true);
check('"abc"="ABC"', f('"abc"="ABC"'), true);
check('1<"a"', f('1<"a"'), true);
check('"3"+4', f('"3"+4'), 7);
check('"x"+1', f('"x"+1'), '#WERT!');
check('leer+1', f('Y50+1'), 1);
check('A1+A2', f('A1+A2'), 3);
check('$A$5*2', f('$A$5*2'), 10);
check('Tabelle1!A3', f('Tabelle1!A3'), 3);
check("'Daten 2'!A2", f("'Daten 2'!A2"), 200);
check('SUMME Daten 2', f("SUMME('Daten 2'!A1:A2)"), 300);
check('Prozent-Zelle', f('C1*100'), 10);
check('Datum-Zelle', f('JAHR(C2)'), 2026);
check('WAHR-Zelle', f('C3'), true);
check("Text '123", f('ISTTEXT(C4)'), true);
check('1’234.5', f('C5+0.5'), 1235);
check('unbekannt', f('FOO(1)'), '#NAME?');
check('Name', f('abc+1'), '#NAME?');

// Funktionen
check('SUMME', f('SUMME(A1:A5)'), 15);
check('SUM englisch', f('SUM(A1:A5;10)'), 25);
check('SUMME mit Komma', f('SUM(A1:A5,10)'), 25);
check('MITTELWERT', f('MITTELWERT(A1:A5)'), 3);
check('ANZAHL', f('ANZAHL(A1:C5)'), 8);
check('ANZAHL2', f('ANZAHL2(A1:C5)'), 15);
check('ANZAHLLEEREZELLEN', f('ANZAHLLEEREZELLEN(A1:D5)'), 5);
check('MIN/MAX', f('MAX(A1:A5)-MIN(A1:A5)'), 4);
check('MEDIAN', f('MEDIAN(1;5;3;9)'), 4);
check('PRODUKT', f('PRODUKT(A1:A5)'), 120);
check('RUNDEN 2.5', f('RUNDEN(2.5;0)'), 3);
check('RUNDEN -2.5', f('RUNDEN(-2.5;0)'), -3);
check('RUNDEN 1.005', f('RUNDEN(1.005;2)'), 1.01);
check('RUNDEN -2', f('RUNDEN(1234.5;-2)'), 1200);
check('AUFRUNDEN', f('AUFRUNDEN(1.21;1)'), 1.3);
check('ABRUNDEN', f('ABRUNDEN(-1.29;1)'), -1.2);
check('GANZZAHL', f('GANZZAHL(-1.5)'), -2);
check('REST negativ', f('REST(-3;2)'), 1);
check('VRUNDEN Rappen', f('VRUNDEN(1.23;0.05)'), 1.25);
check('WURZEL', f('WURZEL(16)'), 4);
check('WURZEL(-1)', f('WURZEL(-1)'), '#ZAHL!');
check('LOG', f('LOG(1000)'), 3);
check('LOG Basis 2', f('LOG(8;2)'), 3);
check('FAKULTÄT', f('FAKULTÄT(5)'), 120);
check('KOMBINATIONEN', f('KOMBINATIONEN(49;6)'), 13983816);
check('GGT', f('GGT(24;36)'), 12);
check('KGV', f('KGV(4;6)'), 12);
check('SUMMENPRODUKT', f('SUMMENPRODUKT(A1:A3;A3:A5)'), 1 * 3 + 2 * 4 + 3 * 5);
check('SUMMENPRODUKT Bedingung', f('SUMMENPRODUKT((B1:B5="Apfel")*A1:A5)'), 9);
check('SUMMEWENN', f('SUMMEWENN(B1:B5;"Apfel";A1:A5)'), 9);
check('SUMMEWENN >2', f('SUMMEWENN(A1:A5;">2")'), 12);
check('SUMMEWENNS', f('SUMMEWENNS(A1:A5;B1:B5;"Apfel";A1:A5;">1")'), 8);
check('ZÄHLENWENN Joker', f('ZÄHLENWENN(B1:B5;"A*")'), 3);
check('ZÄHLENWENN <>', f('ZÄHLENWENN(B1:B5;"<>Apfel")'), 2);
check('ZÄHLENWENNS', f('ZÄHLENWENNS(B1:B5;"Apfel";A1:A5;"<5")'), 2);
check('MITTELWERTWENN', f('MITTELWERTWENN(B1:B5;"Apfel";A1:A5)'), 3);
check('STABW.S', f('STABW.S(2;4;4;4;5;5;7;9)'), 2.138089935299395);
check('STABW.N', f('STABW.N(2;4;4;4;5;5;7;9)'), 2);
check('KGRÖSSTE', f('KGRÖSSTE(A1:A5;2)'), 4);
check('RANG', f('RANG(4;A1:A5)'), 2);
check('QUANTIL', f('QUANTIL(A1:A5;0.25)'), 2);
check('KORREL', f('KORREL(A1:A5;A1:A5)'), 1);
check('STEIGUNG', f('STEIGUNG({2;4;6};{1;2;3})'), 2);
check('PROGNOSE', f('PROGNOSE(4;{2;4;6};{1;2;3})'), 8);
check('NORM.S.VERT', f('NORM.S.VERT(1.96;WAHR)'), 0.9750021048517795);
check('NORM.INV', f('NORM.INV(0.975;0;1)'), 1.959963984540054);
check('BINOM.VERT', f('BINOM.VERT(3;10;0.5;FALSCH)'), 0.1171875);
// Logik
check('WENN', f('WENN(A1>0;"ja";"nein")'), 'ja');
check('WENN ohne Sonst', f('WENN(A1<0;"ja")'), false);
check('WENN fauler Zweig', f('WENN(WAHR;1;1/0)'), 1);
check('WENNS', f('WENNS(A3=1;"a";A3=3;"c")'), 'c');
check('WENNFEHLER', f('WENNFEHLER(1/0;"x")'), 'x');
check('UND/ODER', f('UND(WAHR;ODER(FALSCH;1))'), true);
check('NICHT', f('NICHT(A1=1)'), false);
check('ERSTERWERT', f('ERSTERWERT(2;1;"eins";2;"zwei";"?")'), 'zwei');
check('WAHL', f('WAHL(2;"a";"b";"c")'), 'b');
// Text
check('VERKETTEN', f('VERKETTEN(B1;" ";A1)'), 'Apfel 1');
check('TEXTKETTE Bereich', f('TEXTKETTE(A1:A3)'), '123');
check('TEXTVERKETTEN', f('TEXTVERKETTEN(", ";WAHR;B1:B3)'), 'Apfel, Birne, Apfel');
check('LÄNGE', f('LÄNGE("Hallo")'), 5);
check('LINKS/RECHTS/TEIL', f('LINKS("Hallo";2)&RECHTS("Hallo";2)&TEIL("Hallo";2;3)'), 'Haloall');
check('GROSS2', f('GROSS2("hallo welt")'), 'Hallo Welt');
check('GLÄTTEN', f('GLÄTTEN("  a   b ")'), 'a b');
check('WECHSELN', f('WECHSELN("a-b-c";"-";"+")'), 'a+b+c');
check('WECHSELN 2.', f('WECHSELN("a-b-c";"-";"+";2)'), 'a-b+c');
check('FINDEN', f('FINDEN("l";"Hallo")'), 3);
check('SUCHEN Joker', f('SUCHEN("l?o";"HALLO")'), 3);
check('TEXT 0.00', f('TEXT(1234.567;"#’##0.00")'), '1’234.57');
check('TEXT %', f('TEXT(0.256;"0.0%")'), '25.6%');
check('TEXT Datum', f('TEXT(DATUM(2026;10;13);"TT.MM.JJJJ")'), '13.10.2026');
check('TEXT Wochentag', f('TEXT(DATUM(2026;10;13);"TTTT")'), 'Dienstag');
check('WERT', f('WERT("12.5")+1'), 13.5);
check('Zahl als Text', f('1/3&""'), '0.333333333333333');
// Nachschlagen
check('SVERWEIS genau', f('SVERWEIS("Kiwi";{"Apfel",1;"Kiwi",4};2;FALSCH)'), 4);
check('SVERWEIS Bereich', f('SVERWEIS(3;A1:B5;2;FALSCH)'), 'Apfel');
check('SVERWEIS ungefähr', f('SVERWEIS(3.7;A1:B5;2)'), 'Apfel');
check('SVERWEIS fehlt', f('SVERWEIS(9;A1:B5;2;FALSCH)'), '#NV');
check('VERGLEICH', f('VERGLEICH("Kiwi";B1:B5;0)'), 4);
check('INDEX', f('INDEX(A1:B5;4;2)'), 'Kiwi');
check('INDEX+VERGLEICH', f('INDEX(A1:A5;VERGLEICH("Kiwi";B1:B5;0))'), 4);
check('XVERWEIS', f('XVERWEIS("Birne";B1:B5;A1:A5)'), 2);
check('XVERWEIS rückwärts', f('XVERWEIS("Apfel";B1:B5;A1:A5;"-";0;-1)'), 5);
check('XVERWEIS nicht gefunden', f('XVERWEIS("Zitrone";B1:B5;A1:A5;"keine")'), 'keine');
check('ZEILE', f('ZEILE(B7)'), 7);
check('SPALTEN', f('SPALTEN(A1:C1)'), 3);
check('INDIREKT', f('INDIREKT("A"&4)'), 4);
check('BEREICH.VERSCHIEBEN', f('SUMME(BEREICH.VERSCHIEBEN(A1;1;0;3;1))'), 9);
// Datum
check('DATUM', f('DATUM(2026;10;13)'), XL.toSerial(2026, 10, 13));
check('DATUM Überlauf', f('MONAT(DATUM(2026;13;1))'), 1);
check('WOCHENTAG Typ 2', f('WOCHENTAG(DATUM(2026;10;13);2)'), 2);
check('ISOKALENDERWOCHE', f('ISOKALENDERWOCHE(DATUM(2026;1;1))'), 1);
check('KALENDERWOCHE 21', f('KALENDERWOCHE(DATUM(2021;1;3);21)'), 53);
check('DATEDIF Y', f('DATEDIF(DATUM(2000;5;20);DATUM(2026;5;19);"Y")'), 25);
check('EDATUM', f('TAG(EDATUM(DATUM(2026;1;31);1))'), 28);
check('MONATSENDE', f('TAG(MONATSENDE(DATUM(2024;2;10);0))'), 29);
check('NETTOARBEITSTAGE', f('NETTOARBEITSTAGE(DATUM(2026;10;12);DATUM(2026;10;18))'), 5);
check('ARBEITSTAG', f('WOCHENTAG(ARBEITSTAG(DATUM(2026;10;16);1);2)'), 1);
check('ZEIT', f('STUNDE(ZEIT(14;30;0))'), 14);
// Finanzen
check('RMZ', f('RMZ(0.05/12;360;-200000)'), 1073.643246024279);
check('ZW', f('ZW(0.06/12;10;-200;-500;1)'), 2581.4033740601185);
check('BW', f('BW(0.08/12;240;500)'), -59777.14585118638);
check('ZINS', f('ZINS(48;-200;8000)'), 0.007701472488);
check('IKV', f('IKV({-70000;12000;15000;18000;21000;26000})'), 0.08663094803653171);
// Fehler, Zirkel
t1.cells['E1'] = { v: '=E2' }; t1.cells['E2'] = { v: '=E1+1' };
check('Zirkelbezug', book().val(book().sheets[0], 4, 0), '#ZIRKEL!');
delete t1.cells['E1']; delete t1.cells['E2'];
check('Fehler-Literal', f('ISTNV(#NV)'), true);
check('Matrixkonstante', f('SUMME({1,2;3,4})'), 10);
check('fehlende Klammer ergänzt', f('SUMME(A1:A3'), 6);

// Anzeigeformate
const fm = (v, fo) => XL.format(v, fo).t;
check('Standard 1/3', fm(1 / 3), '0.333333333');
check('Standard gross', fm(123456789012), '1.23457E+11');
check('Standard 0.1+0.2', fm(0.1 + 0.2), '0.3');
check('Standard -0.5', fm(-0.5), '-0.5');
check('Zahl 2', fm(1234567.891, { nf: 'num', d: 2 }), '1’234’567.89');
check('Währung', fm(-1234.5, { nf: 'cur' }), 'CHF -1’234.50');
check('Euro', fm(12, { nf: 'cur', cur: '€' }), '12.00 €');
check('Prozent', fm(0.125, { nf: 'pct', d: 1 }), '12.5%');
check('Wiss.', fm(12345, { nf: 'sci', d: 2 }), '1.23E+04');
check('Datum', fm(XL.toSerial(2026, 10, 13), { nf: 'date' }), '13.10.2026');
check('Datum lang', fm(XL.toSerial(2026, 3, 5), { nf: 'datel' }), '5. März 2026');
check('Zeit', fm(0.6041666666666666, { nf: 'time' }), '14:30');
check('Bruch', fm(1.25, { nf: 'frac' }), '1 1/4');
check('WAHR', fm(true), 'WAHR');

// Eingaben
const pi = (s) => XL.parseInput(s);
check('Eingabe 3,5', pi('3,5').v, 3.5);
check('Eingabe 13.10', pi('13.10').v, 13.1);
check('Eingabe 13.10.', pi('13.10.').nf, 'date');
check('Eingabe 12.5%', pi('12.5%').v, 0.125);
check('Eingabe CHF 5', pi('CHF 5').nf, 'cur');
check('Eingabe 7:45', pi('7:45').nf, 'time');
check('Eingabe 31.02.2026 ist Text', typeof pi('31.02.2026').v, 'string');

// Bezüge umschreiben
check('kopieren', XL.shiftFormula('=A1+$B$2+B$3+$C4+SUMME(A1:A5)', 1, 2), '=B3+$B$2+C$3+$C6+SUMME(B3:B7)');
check('kopieren aus dem Rand', XL.shiftFormula('=A1', -1, 0), '=#BEZUG!');
check('Tabelle beibehalten', XL.shiftFormula("='Daten 2'!A1*2", 0, 1), "='Daten 2'!A2*2");
check('Zeile einfügen', XL.adjustRefs('=SUMME(A1:A5)+A6+A2', 'Tabelle1', 'Tabelle1', 'r', 2, 1), '=SUMME(A1:A6)+A7+A2');
check('Zeile löschen', XL.adjustRefs('=SUMME(A1:A5)+A3+A6', 'Tabelle1', 'Tabelle1', 'r', 2, -1), '=SUMME(A1:A4)+#BEZUG!+A5');
check('Spalte löschen fremd', XL.adjustRefs("='Daten 2'!C1+C1", 'Daten 2', 'Tabelle1', 'c', 1, -1), "='Daten 2'!B1+C1");
check('umbenennen', XL.renameSheetRefs("='Daten 2'!A1+Tabelle1!B2", 'Daten 2', 'Werte'), '=Werte!A1+Tabelle1!B2');
check('normalisieren', XL.normalize('=summe(a1:b2)+wenn(c1>1;"x";"y")'), '=SUMME(A1:B2)+WENN(C1>1;"x";"y")');
check('F4', XL.toggleAbs('=A1+B2', 2).raw, '=$A$1+B2');
check('F4 zweimal', XL.toggleAbs('=$A$1', 3).raw, '=A$1');
check('Zeigen-Modus', XL.wantsRef('=SUMME(', 7), true);
check('kein Zeigen-Modus', XL.wantsRef('=A1', 3), false);
check('Syntaxfehler', !!XL.check('=1+*2'), true);
check('Syntax ok', XL.check('=SUMME(A1:A3)'), null);

// Ausfüllen
check('Reihe 1,2', XL.series(['1', '2'], 3).join(','), '3,4,5');
check('Reihe Kopie', XL.series(['7'], 2).join(','), '7,7');
check('Reihe Datum', XL.series(['13.10.2026'], 2).join(','), '14.10.2026,15.10.2026');
check('Reihe Monate', XL.series(['15.01.2026', '15.02.2026'], 2).join(','), '15.03.2026,15.04.2026');
check('Reihe Monatsname', XL.series(['Januar'], 3).join(','), 'Februar,März,April');
check('Reihe Wochentag kurz', XL.series(['Fr'], 3).join(','), 'Sa,So,Mo');
check('Reihe Text+Zahl', XL.series(['Woche 1'], 2).join(','), 'Woche 2,Woche 3');
check('Reihe rückwärts', XL.series(['5', '10'], 2, true).join(','), '0,-5');
check('Reihe Prozent', XL.series(['10%', '20%'], 1).join(','), '30%');

console.log(`${n - fails} von ${n} Tests bestanden`);
process.exit(fails ? 1 : 0);
