'use strict';
/* Browser-Test Chem-Draw-Analyse (1.52): node tests/browser/chem-analyse.js [url]
 * Voraussetzung: dist/ über python3 -m http.server 8800 --bind 127.0.0.1. Öffnet Chem-Draw, lädt Aspirin per SMILES,
 * prüft Register „Analyse & Spektren“ (Kennzahlen, Gruppen, alle vier Spektren, SMILES, GESTIS-Link), 3D-Stile, Messen,
 * Drehen und Molfile-Import. Bildschirmfotos nach /tmp/kt-chem-*.png. */
const { chromium } = require('playwright');
const url = process.argv[2] || 'http://127.0.0.1:8800/index.html';
(async () => {
  const br = await chromium.launch();
  const pg = await br.newPage({ viewport: { width: 1400, height: 920 } });
  const errs = [];
  pg.on('pageerror', e => errs.push(e.message));
  pg.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push(m.text()); });
  await pg.goto(url);
  await pg.waitForFunction(() => typeof Chem !== 'undefined' && typeof Canvas !== 'undefined', null, { timeout: 20000 });
  await pg.waitForTimeout(1200);
  let ok = 0, bad = 0;
  const check = (n, c, info) => { if (c) ok++; else { bad++; console.log('FALSCH', n, info || ''); } };
  await pg.evaluate(() => { Chem.open(null); });
  await pg.waitForTimeout(300);
  // SMILES laden über das Analyse-Register
  await pg.evaluate(() => Chem.setTab('analyse'));
  await pg.fill('.chem-import', 'CC(=O)Oc1ccccc1C(=O)O');
  await pg.click('.chem-loadbtn');
  await pg.waitForTimeout(300);
  check('Aspirin geladen', await pg.evaluate(() => Chem.E.mol.atoms.length === 13));
  await pg.evaluate(() => Chem.setTab('analyse'));
  await pg.waitForTimeout(200);
  const txt = await pg.evaluate(() => Chem.E.atab.innerText);
  check('Kennzahlen', /Polare Oberfläche/.test(txt) && /63[.,]6/.test(txt), txt.slice(0, 300));
  check('Gruppen Ester + Säure', /Ester/.test(txt) && /Carbonsäure/.test(txt));
  check('GESTIS-Knopf', /In GESTIS suchen|GESTIS-Stoffblatt öffnen/.test(txt));
  for (const k of ['ir', 'ms', 'h', 'c']) {
    // seit 1.53: Reiter IR | Massenspektrum | NMR, Kern im Auswahlfeld
    // seit 1.56 ist das Kern-Feld nur im Reiter NMR sichtbar
    if (k === 'h' || k === 'c') { await pg.click('.chem-aspec .chem-seg button[data-k="nmr"]'); await pg.waitForTimeout(60); await pg.selectOption('.chem-nmrsel', k.toUpperCase()); }
    else await pg.click(`.chem-aspec .chem-seg button[data-k="${k}"]`);
    await pg.waitForTimeout(80);
    check('Spektrum ' + k, await pg.evaluate(() => !!document.querySelector('.chem-specsvg svg') && document.querySelectorAll('.chem-spectab tr').length > 0));
    if (k === 'h') await pg.screenshot({ path: '/tmp/kt-chem-nmr.png' });
  }
  check('SMILES-Feld', (await pg.inputValue('.chem-smiles')).length > 10);
  // GESTIS: Link mit ZVG-Nummer
  const link = await pg.evaluate(() => { Chem.gestisZvg('10520'); return Chem.gestisUrl(Chem.gestisZvg()); });
  check('GESTIS ZVG-Link', link === 'https://gestis.dguv.de/data?name=010520', link);
  await pg.evaluate(() => Chem.gestisZvg(''));
  check('GESTIS Startseite ohne ZVG', (await pg.evaluate(() => Chem.gestisUrl(''))) === 'https://www.dguv.de/ifa/stoffdatenbank/');
  await pg.screenshot({ path: '/tmp/kt-chem-analyse.png' });
  // 3D: Stile, Messen
  await pg.evaluate(() => { Chem.setTab('struktur'); Chem.setModel('3d'); });
  await pg.waitForTimeout(200);
  for (const st of ['stick', 'draht', 'stab']) {
    await pg.evaluate((st) => { Chem.opts.style3d = st; Chem.render(); }, st);
    check('3D-Stil ' + st, await pg.evaluate(() => Chem.E.molG.innerHTML.length > 500));
  }
  const meas = await pg.evaluate(() => {
    const E = Chem.E; E.measure = true;
    const F = ChemModels.embed(E.mol).F;
    const c = F.atoms.findIndex(a => a.el === 'C'), nb = F.adj[c].map(([j]) => j)[0];
    E.meas = [c, nb]; Chem.render();
    return { side: E.side.innerText, svg: /f59f00/.test(E.molG.innerHTML) };
  });
  check('3D messen: Abstand angezeigt', meas.svg && /Abstand .*Å/.test(meas.side), meas.side.slice(-200));
  // Klick im Modell wählt ein Atom (echter Mausklick)
  await pg.evaluate(() => { Chem.E.meas = []; Chem.render(); });
  const pt = await pg.evaluate(() => { const E = Chem.E, q = E.pts3.find(p => p.el === 'O'); const r = E.svg.getBoundingClientRect(); const s = E.view.s; return { x: r.left + E.view.ox + q.x * s, y: r.top + E.view.oy + q.y * s }; });
  await pg.mouse.click(pt.x, pt.y);
  await pg.waitForTimeout(150);
  check('Klick wählt Atom zum Messen', (await pg.evaluate(() => (Chem.E.meas || []).length)) === 1, JSON.stringify(pt));
  await pg.screenshot({ path: '/tmp/kt-chem-3d.png' });
  await pg.evaluate(() => Chem.spin3d(true));
  const r0 = await pg.evaluate(() => JSON.stringify(Chem.opts.rot3d));
  await pg.waitForTimeout(400);
  check('3D drehen lassen', (await pg.evaluate(() => JSON.stringify(Chem.opts.rot3d))) !== r0);
  await pg.evaluate(() => Chem.spin3d(false));
  // Molfile-Import
  await pg.evaluate(() => { Chem.setModel('skelett'); Chem.setTab('analyse'); });
  const mf = await pg.evaluate(() => ChemProps.molfile(ChemSmiles.toMol('c1ccccc1O'), 'Phenol'));
  await pg.fill('.chem-import', mf);
  await pg.click('.chem-loadbtn');
  await pg.waitForTimeout(200);
  check('Molfile geladen (Phenol)', await pg.evaluate(() => Chem.E.mol.atoms.length === 7 && /C6H6O|C₆H₆O/.test(Chem.E.an.hill.text || Chem.E.an.hill.html.replace(/<[^>]+>/g, ''))));
  // Einfügen in die Seite geht weiterhin
  const nb = await pg.evaluate(() => Canvas.page.boxes.length);
  await pg.evaluate(() => Chem.ok());
  await pg.waitForTimeout(800);
  check('Struktur eingefügt', (await pg.evaluate(() => Canvas.page.boxes.length)) === nb + 1);
  check('keine Fehler in der Konsole', !errs.length, errs.slice(0, 4).join(' | '));
  console.log(`${ok} von ${ok + bad} Browser-Prüfungen bestanden (Chem-Draw-Analyse)`);
  await br.close();
  process.exitCode = bad ? 1 : 0;
})();
