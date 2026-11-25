'use strict';
/* Browser-Test Tabellen 1.54: node tests/browser/tabelle-verschieben.js [url]
 * Formel zeigen (= tippen, Zelle/Bereich/Spaltenkopf anklicken – auch rechts neben der Zelle, wo das Hinweisfenster
 * war), Zeilen/Spalten an den Köpfen verschieben, Bereich am Rand verschieben/kopieren, Bezüge wandern mit,
 * Alt+Umschalt+Pfeil, Rückgängig. Bildschirmfoto /tmp/kt-xl-*.png */
const { chromium } = require('playwright');
const url = process.argv[2] || 'http://127.0.0.1:8800/index.html';
(async () => {
  const br = await chromium.launch();
  const pg = await br.newPage({ viewport: { width: 1300, height: 900 } });
  const errs = [];
  pg.on('pageerror', e => errs.push(e.message));
  pg.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push(m.text()); });
  await pg.goto(url);
  await pg.waitForFunction(() => typeof Sheet !== 'undefined' && Canvas.page, null, { timeout: 20000 });
  await pg.waitForTimeout(1200);
  let ok = 0, bad = 0;
  const check = (n, c, info) => { if (c) ok++; else { bad++; console.log('FALSCH', n, info || ''); } };
  const id = await pg.evaluate(() => Sheet.create(Canvas.viewCenter()).id);
  await pg.waitForTimeout(300);
  const xy = (c, r, fx = 0.5, fy = 0.5) => pg.evaluate(([id, c, r, fx, fy]) => { const td = Canvas.els.get(id).querySelector('.xl-grid').rows[r].cells[c]; const q = td.getBoundingClientRect(); return { x: q.left + q.width * fx, y: q.top + q.height * fy }; }, [id, c, r, fx, fy]);
  const click = async (c, r) => { const p = await xy(c, r); await pg.mouse.click(p.x, p.y); };
  const cell = (k) => pg.evaluate(([id, k]) => (Canvas.box(id).sheet.cells[k] || {}).v, [id, k]);
  const val = (c, r) => pg.evaluate(([id, c, r]) => Sheet.value(id, c, r), [id, c, r]);
  // Werte A1..A4 = 1..4, B1 = 10
  for (let r = 0; r < 4; r++) { await click(0, r); await pg.keyboard.type(String(r + 1)); await pg.keyboard.press('Enter'); }
  await click(1, 0); await pg.keyboard.type('10'); await pg.keyboard.press('Enter');
  // Formel zeigen: C1 „=“ → Klick B1 (rechts daneben, wo früher das Hinweisfenster lag) → „+“ → Klick A2
  await click(2, 0); await pg.keyboard.type('=');
  check('Hinweisfenster deckt keine Zelle der Tabelle', await pg.evaluate((id) => { const p = document.querySelector('.xl-acpop'); if (!p || p.hidden) return true; const a = p.getBoundingClientRect(), b = Canvas.els.get(id).getBoundingClientRect(); return a.left >= b.right || a.right <= b.left || a.top >= b.bottom || a.bottom <= b.top; }, id));
  await click(1, 0);
  check('Klick fügt Bezug ein', (await pg.evaluate(() => Sheet.edit && Sheet.edit.text)) === '=B1', await pg.evaluate(() => Sheet.edit && Sheet.edit.text));
  await pg.keyboard.type('+'); await click(0, 1);
  await pg.keyboard.press('Enter');
  check('C1 = B1 + A2 = 12', (await cell('C1')) === '=B1+A2' && (await val(2, 0)) === 12, await cell('C1'));
  // Bereich ziehen in die Formel: C2 =SUMME( A1:A4 )
  await click(2, 1); await pg.keyboard.type('=SUMME(');
  let p1 = await xy(0, 0), p2 = await xy(0, 3);
  await pg.mouse.move(p1.x, p1.y); await pg.mouse.down(); await pg.mouse.move(p2.x, p2.y, { steps: 5 }); await pg.mouse.up();
  await pg.keyboard.press('Enter');
  check('Bereich gezeigt: =SUMME(A1:A4) = 10', (await cell('C2')) === '=SUMME(A1:A4)' && (await val(2, 1)) === 10, await cell('C2'));
  // Spaltenkopf zeigen: D1 =SUMME( Kopf A )
  await click(3, 0); await pg.keyboard.type('=SUMME(');
  const hA = await pg.evaluate((id) => { const h = Canvas.els.get(id).querySelector('.xl-ch[data-c="0"]').getBoundingClientRect(); return { x: h.left + h.width / 2, y: h.top + h.height / 2 }; }, id);
  await pg.mouse.click(hA.x, hA.y);
  await pg.keyboard.press('Enter');
  check('Spaltenkopf gezeigt: =SUMME(A:A)', (await cell('D1')) === '=SUMME(A:A)' && (await val(3, 0)) === 10, await cell('D1'));
  // Bearbeitungsleiste: E1, = in der Leiste, Klick B1
  await click(1, 3); await pg.click('#xl-input'); await pg.keyboard.type('='); await click(1, 0);
  check('Leiste: Klick fügt Bezug ein', (await pg.evaluate(() => Sheet.edit && Sheet.edit.text)) === '=B1', await pg.evaluate(() => Sheet.edit && Sheet.edit.text));
  await pg.keyboard.press('Escape');
  await pg.screenshot({ path: '/tmp/kt-xl-formel.png' });
  // Zeile 1 auswählen (Kopf) und nach unten unter Zeile 3 ziehen
  const rh = async (r) => pg.evaluate(([id, r]) => { const h = Canvas.els.get(id).querySelector(`.xl-rh[data-r="${r}"]`).getBoundingClientRect(); return { x: h.left + h.width / 2, y: h.top + h.height / 2, h: h.height }; }, [id, r]);
  let h0 = await rh(0);
  await pg.mouse.click(h0.x, h0.y);
  check('Zeile markiert', await pg.evaluate(() => Sheet.isRowSel()));
  const h2 = await rh(2);
  await pg.mouse.move(h0.x, h0.y); await pg.mouse.down(); await pg.mouse.move(h2.x, h2.y + h2.h * 0.4, { steps: 6 });
  check('Einfügelinie sichtbar', await pg.evaluate(() => !!document.querySelector('.xl-mvline')));
  await pg.mouse.up(); await pg.waitForTimeout(100);
  // vorher: Zeile1 = 1,10,=B1+A2 ; danach Zeile 3
  check('Zeile verschoben: A3 = 1, A1 = 2', (await val(0, 2)) === 1 && (await val(0, 0)) === 2);
  check('Formel wandert mit und Bezüge angepasst (C3 = B3+A1 = 12)', (await cell('C3')) === '=B3+A1' && (await val(2, 2)) === 12, await cell('C3'));
  check('SUMME-Bereich bleibt korrekt (=SUMME(A1:A4) = 10)', (await cell('C1')) === '=SUMME(A1:A4)' && (await val(2, 0)) === 10, await cell('C1'));
  check('Auswahl folgt (Zeile 3)', await pg.evaluate(() => Sheet.active.r === 2 && Sheet.isRowSel()));
  // Rückgängig
  await pg.keyboard.press('Control+z'); await pg.waitForTimeout(200);
  check('Rückgängig', (await val(0, 0)) === 1 && (await cell('C1')) === '=B1+A2', await cell('C1'));
  // Alt+Umschalt+↓ verschiebt Zeile 1 nach unten
  await click(0, 0); await pg.keyboard.press('Alt+Shift+ArrowDown'); await pg.waitForTimeout(100);
  check('Alt+Umschalt+↓', (await val(0, 1)) === 1 && (await val(0, 0)) === 2 && (await cell('C2')) === '=B2+A1', await cell('C2'));
  await pg.keyboard.press('Control+z'); await pg.waitForTimeout(150);
  // Spalte B an den Kopf ziehen und vor A einfügen
  const ch = async (c) => pg.evaluate(([id, c]) => { const h = Canvas.els.get(id).querySelector(`.xl-ch[data-c="${c}"]`).getBoundingClientRect(); return { x: h.left + h.width / 2, y: h.top + h.height / 2, w: h.width }; }, [id, c]);
  const cB = await ch(1), cA = await ch(0);
  await pg.mouse.click(cB.x, cB.y);
  await pg.mouse.move(cB.x, cB.y); await pg.mouse.down(); await pg.mouse.move(cA.x - cA.w * 0.4, cA.y, { steps: 6 }); await pg.mouse.up(); await pg.waitForTimeout(100);
  check('Spalte verschoben: A1 = 10, B1 = 1, C1 =A1+B2', (await val(0, 0)) === 10 && (await val(1, 0)) === 1 && (await cell('C1')) === '=A1+B2', await cell('C1'));
  await pg.keyboard.press('Control+z'); await pg.waitForTimeout(150);
  // Bereich A1:B1 am Rand nach unten (A6) verschieben
  await click(0, 0); await pg.keyboard.down('Shift'); await click(1, 0); await pg.keyboard.up('Shift');
  const edge = await pg.evaluate(() => { const m = document.querySelector('.xl-mv'); const q = m.getBoundingClientRect(); return { x: q.left + q.width * 0.3, y: q.top + q.height / 2 }; });
  const tgt = await xy(0, 4, 0.3, 0.5);
  await pg.mouse.move(edge.x, edge.y); await pg.mouse.down(); await pg.mouse.move(tgt.x, tgt.y - 2, { steps: 8 });
  check('Vorschau Zielbereich', await pg.evaluate(() => !!document.querySelector('.xl-mvprev')));
  await pg.mouse.up(); await pg.waitForTimeout(100);
  check('Bereich verschoben nach A5:B5', (await val(0, 4)) === 1 && (await val(1, 4)) === 10 && (await cell('A1')) === undefined);
  check('Bezüge zeigen auf neue Stelle (C1 = B5+A2 = 12)', (await cell('C1')) === '=B5+A2' && (await val(2, 0)) === 12, await cell('C1'));
  // Strg+Ziehen = kopieren (relative Bezüge verschoben)
  await click(2, 0);
  const e2 = await pg.evaluate(() => { const m = document.querySelector('.xl-mv'); const q = m.getBoundingClientRect(); return { x: q.left + q.width * 0.5, y: q.top + q.height / 2 }; });
  const t2 = await xy(3, 2);
  await pg.keyboard.down('Control');
  await pg.mouse.move(e2.x, e2.y); await pg.mouse.down(); await pg.mouse.move(t2.x, t2.y, { steps: 8 }); await pg.mouse.up();
  await pg.keyboard.up('Control'); await pg.waitForTimeout(100);
  check('Strg+Ziehen kopiert (D3 = =C7+B4)', (await cell('D3')) === '=C7+B4' && (await cell('C1')) === '=B5+A2', await cell('D3'));
  await pg.screenshot({ path: '/tmp/kt-xl-move.png' });
  check('keine Fehler in der Konsole', !errs.length, errs.join(' | '));
  console.log(`${ok} von ${ok + bad} Browser-Prüfungen bestanden (Tabelle verschieben, Formel zeigen)`);
  await br.close();
  process.exitCode = bad ? 1 : 0;
})();
