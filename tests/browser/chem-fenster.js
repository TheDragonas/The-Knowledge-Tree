'use strict';
/* Browser-Test Chem-Draw-Fenster (1.57): node tests/browser/chem-fenster.js [url]
 * Grösse an der Ecke ziehen (gemerkt), gross, neben der Seite (Bildschirm geteilt, Seite daneben bedienbar), Breite am
 * linken Rand, Schliessen gibt die volle Breite zurück. Bilder: /tmp/kt-chem-fenster-*.png */
const { chromium } = require('playwright');
const url = process.argv[2] || 'http://127.0.0.1:8800/index.html';
(async () => {
  const br = await chromium.launch();
  const pg = await br.newPage({ viewport: { width: 1400, height: 900 } });
  const errs = [];
  pg.on('pageerror', e => errs.push(e.message));
  pg.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push(m.text()); });
  await pg.goto(url);
  await pg.waitForFunction(() => typeof Chem !== 'undefined' && Store.loaded, null, { timeout: 20000 });
  await pg.waitForTimeout(1200);
  let ok = 0, bad = 0;
  const check = (n, c, info) => { if (c) ok++; else { bad++; console.log('FALSCH', n, info || ''); } };
  const rect = (sel) => pg.$eval(sel, e => { const r = e.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height, r: r.right }; });
  await pg.evaluate(() => { try { localStorage.removeItem('kt-chem-win'); } catch (e) { } Chem.open(null); });
  await pg.waitForTimeout(400);
  const r0 = await rect('.chem-dlg');
  const se = await rect('.chem-rs-se');
  await pg.mouse.move(se.x + 5, se.y + 5); await pg.mouse.down(); await pg.mouse.move(se.x - 95, se.y - 75, { steps: 5 }); await pg.mouse.up();
  await pg.waitForTimeout(150);
  const r1 = await rect('.chem-dlg');
  check('Ecke ziehen verkleinert das Fenster', r1.w < r0.w - 120 && r1.h < r0.h - 90, JSON.stringify([r0, r1]));
  check('Grösse gemerkt', await pg.evaluate(() => { const w = JSON.parse(localStorage.getItem('kt-chem-win')); return w.w > 500 && w.h > 400; }));
  await pg.click('.chem-maxb'); await pg.waitForTimeout(150);
  const r2 = await rect('.chem-dlg');
  check('Gross füllt das Fenster', r2.w > 1350 && r2.h > 850, JSON.stringify(r2));
  await pg.click('.chem-maxb'); await pg.waitForTimeout(150);
  // neben der Seite
  await pg.click('.chem-dockb'); await pg.waitForTimeout(300);
  const app = await rect('#app'), dlg = await rect('.chem-dlg');
  check('angedockt: Chem-Draw rechts, Seite links daneben', Math.abs(dlg.r - 1400) < 2 && Math.abs(app.r - dlg.x) < 3 && app.w > 500, JSON.stringify({ app, dlg }));
  const hitPage = await pg.evaluate(() => { const e = document.elementFromPoint(300, 500); return !!(e && e.closest('#app')); });
  check('Seite daneben ist bedienbar (kein Abdunkeln/Blockieren)', hitPage);
  const wl = await rect('.chem-rs-w');
  await pg.mouse.move(wl.x + 3, wl.y + 200); await pg.mouse.down(); await pg.mouse.move(wl.x - 150, wl.y + 200, { steps: 5 }); await pg.mouse.up();
  await pg.waitForTimeout(200);
  const dlg2 = await rect('.chem-dlg'), app2 = await rect('#app');
  check('linker Rand ändert die Breite (Seite wird schmaler)', dlg2.w > dlg.w + 120 && app2.w < app.w - 120, JSON.stringify({ dlg2, app2 }));
  await pg.screenshot({ path: '/tmp/kt-chem-fenster-dock.png' });
  // Zeichnen geht weiter
  await pg.evaluate(() => { Chem.setTool('b1'); });
  const sv = await rect('.chem-svg');
  await pg.mouse.click(sv.x + sv.w / 2, sv.y + sv.h / 2); await pg.waitForTimeout(150);
  check('im angedockten Fenster zeichnen', await pg.evaluate(() => Chem.E.mol.atoms.length >= 2));
  await pg.evaluate(() => { Chem.E.mol = ChemMol.empty(); Chem.E.start = JSON.stringify(Chem.E.mol); Chem.close(); });
  await pg.waitForTimeout(200);
  const app3 = await rect('#app');
  check('Schliessen: Seite wieder volle Breite', app3.w > 1395 && !(await pg.evaluate(() => document.body.classList.contains('chem-docked'))), JSON.stringify(app3));
  await pg.evaluate(() => Chem.open(null)); await pg.waitForTimeout(300);
  check('wieder öffnen: angedockt gemerkt', await pg.evaluate(() => document.body.classList.contains('chem-docked')));
  await pg.evaluate(() => { Chem.setWin({ dock: false }); Chem.close(); });
  check('keine Fehler in der Konsole', !errs.length, errs.slice(0, 3).join(' | '));
  console.log(`${ok} von ${ok + bad} Browser-Prüfungen bestanden (Chem-Draw-Fenster)`);
  await br.close();
  process.exitCode = bad ? 1 : 0;
})();
