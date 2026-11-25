'use strict';
/* Browser-Test Gruppen (1.56): node tests/browser/chem-gruppen.js [url] – gruppieren, als Ganzes wählen/verschieben,
 * übereinanderlegen ohne Verschmelzen, Ausgewähltes gewinnt beim Klick, Alt = darunter, aufheben, speichern */
const { chromium } = require('playwright');
const url = process.argv[2] || 'http://127.0.0.1:8800/index.html';
(async () => {
  const br = await chromium.launch();
  const pg = await br.newPage({ viewport: { width: 1300, height: 900 } });
  const errs = [];
  pg.on('pageerror', e => errs.push(e.message));
  pg.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push(m.text()); });
  await pg.goto(url);
  await pg.waitForFunction(() => typeof Chem !== 'undefined', null, { timeout: 20000 });
  await pg.waitForTimeout(1000);
  let ok = 0, bad = 0;
  const check = (n, c, info) => { if (c) ok++; else { bad++; console.log('FALSCH', n, info || ''); } };
  await pg.evaluate(() => { Chem.open(null); });
  await pg.waitForTimeout(300);
  // drei Moleküle: Benzol, Ethanol (werden gruppiert), Aceton
  await pg.evaluate(() => { for (const s of ['c1ccccc1', 'CCO', 'CC(C)=O']) Chem.insertClip(ChemSmiles.toMol(s)); Chem.E.sel.clear(); Chem.render(); });
  const frags = () => pg.evaluate(() => ChemRender.fragments(Chem.E.mol).map(f => f.atoms.map(a => a.id)));
  const F = await frags();
  check('drei Moleküle', F.length === 3);
  await pg.evaluate((F) => { const E = Chem.E; E.sel = new Set([...F[0], ...F[1]].map(id => 'a:' + id)); Chem.groupSel(); }, F);
  const g = await pg.evaluate((F) => [...F[0], ...F[1]].map(id => Chem.atom(id).grp), F);
  check('Gruppe gesetzt', g.every(x => x === g[0] && x != null));
  // Klick auf ein Atom des Benzols wählt die ganze Gruppe (Benzol + Ethanol)
  const sv = await pg.$eval('.chem-svg', s => { const r = s.getBoundingClientRect(); return { x: r.left, y: r.top }; });
  const scr = (id) => pg.evaluate((id) => { const a = Chem.atom(id), E = Chem.E, r = E.svg.getBoundingClientRect(); const v = E.view; return { x: r.left + a.x * v.s + v.ox, y: r.top + a.y * v.s + v.oy }; }, id);
  void sv;
  await pg.evaluate(() => { Chem.E.sel.clear(); Chem.setTool('select'); Chem.renderOverlay(); });
  let p = await scr(F[0][0]);
  await pg.mouse.click(p.x, p.y); await pg.waitForTimeout(600);
  const nSel = await pg.evaluate(() => [...Chem.E.sel].filter(k => k.startsWith('a:')).length);
  check('Klick wählt die ganze Gruppe', nSel === F[0].length + F[1].length, nSel);
  check('Gruppenrahmen sichtbar', await pg.$$eval('.chem-grpbox', x => x.length) === 1);
  // Gruppe auf Aceton ziehen (übereinander) – nichts verschmilzt
  const pos0 = await pg.evaluate((id) => ({ ...Chem.atom(id) }), F[1][0]);
  const target = await scr(F[2][0]);
  p = await scr(F[0][0]);
  await pg.mouse.move(p.x, p.y); await pg.mouse.down(); await pg.mouse.move((p.x + target.x) / 2, (p.y + target.y) / 2, { steps: 5 }); await pg.mouse.move(target.x, target.y, { steps: 5 }); await pg.mouse.up();
  await pg.waitForTimeout(150);
  const pos1 = await pg.evaluate((id) => ({ ...Chem.atom(id) }), F[1][0]);
  check('Gruppe bewegt sich gemeinsam', Math.hypot(pos1.x - pos0.x, pos1.y - pos0.y) > 20);
  check('nichts verschmolzen (Atomzahl gleich)', await pg.evaluate(() => Chem.E.mol.atoms.filter(a => a.el !== 'H').length) === F.flat().length);
  // genau übereinanderlegen (Atom auf Atom)
  await pg.evaluate((F) => { const A = Chem.atom(F[0][0]), B = Chem.atom(F[2][0]), dx = B.x - A.x, dy = B.y - A.y; for (const a of Chem.E.mol.atoms) if (a.grp != null) { a.x += dx; a.y += dy; } Chem.render(); }, F);
  // übereinander: Klick auf die Stelle → die (ausgewählte) Gruppe gewinnt; Alt+Klick → Aceton darunter
  p = await scr(F[0][0]);
  await pg.mouse.move(p.x, p.y); await pg.mouse.down(); await pg.mouse.up(); await pg.waitForTimeout(600);
  check('Ausgewähltes liegt oben', await pg.evaluate((F) => Chem.E.sel.has('a:' + F[0][0]), F));
  await pg.keyboard.down('Alt'); await pg.mouse.click(p.x, p.y); await pg.keyboard.up('Alt'); await pg.waitForTimeout(600);
  check('Alt+Klick wählt das darunterliegende Molekül', await pg.evaluate((F) => F[2].some(id => Chem.E.sel.has('a:' + id)) && !Chem.E.sel.has('a:' + F[0][0]), F));
  // wieder wegziehen geht: Alt+Klick holt die Gruppe nach oben, dann ziehen
  await pg.keyboard.down('Alt'); await pg.mouse.click(p.x, p.y); await pg.keyboard.up('Alt'); await pg.waitForTimeout(600);
  check('nochmals Alt+Klick wählt wieder die Gruppe', await pg.evaluate((F) => Chem.E.sel.has('a:' + F[0][0]), F));
  await pg.mouse.move(p.x, p.y); await pg.mouse.down(); await pg.mouse.move(p.x + 150, p.y + 120, { steps: 8 }); await pg.mouse.up(); await pg.waitForTimeout(120);
  const ac = await pg.evaluate((F) => F[2].map(id => ({ ...Chem.atom(id) })), F);
  const gp = await pg.evaluate((F) => ({ ...Chem.atom(F[0][0]) }), F);
  check('Gruppe lässt sich wieder vom Aceton wegziehen', ac.every(a => Math.hypot(a.x - gp.x, a.y - gp.y) > 40));
  // speichern/laden
  const back = await pg.evaluate(() => { const m = Chem.unpack(Chem.pack(Chem.E.mol)); return m.atoms.filter(a => a.grp != null).length; });
  check('Gruppe wird gespeichert', back === F[0].length + F[1].length, back);
  // Strg+Umschalt+G
  await pg.keyboard.press('Control+Shift+g'); await pg.waitForTimeout(100);
  check('Gruppierung aufgehoben', await pg.evaluate(() => Chem.E.mol.atoms.every(a => a.grp == null)));
  await pg.keyboard.press('Control+z'); await pg.waitForTimeout(100);
  check('Rückgängig stellt die Gruppe her', await pg.evaluate(() => Chem.E.mol.atoms.some(a => a.grp != null)));
  check('keine Fehler in der Konsole', !errs.length, errs.slice(0, 3).join(' | '));
  console.log(`${ok} von ${ok + bad} Browser-Prüfungen bestanden (Gruppen)`);
  await br.close();
  process.exitCode = bad ? 1 : 0;
})();
