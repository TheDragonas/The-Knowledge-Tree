'use strict';
/* Browser-Test Chem-Draw 1.53: node tests/browser/chem-spektren.js [url]
 * Spektren zoomen (Mausrad, Bereich ziehen, Knöpfe, Doppelklick), NMR-Auswahl (Kern gemerkt nach erneutem Öffnen),
 * Export (PNG/SVG-Download, in die Seite), H entfernen → Ladung (auch nach Speichern/Öffnen und in Keil/Strich),
 * GESTIS-Stoffliste laden (Test-XLSX) → direkter Link, neue Vorlagen. Bildschirmfotos /tmp/kt-spek-*.png. */
const { chromium } = require('playwright');
const { execSync } = require('child_process');
const fs = require('fs');
const url = process.argv[2] || 'http://127.0.0.1:8800/index.html';
(async () => {
  // kleine Test-Stoffliste im Format der DGUV-Liste (Kopfzeile, ZVG, CAS, Name)
  const xl = '/tmp/kt-gestis-test.xlsx';
  execSync(`python3 -c "import openpyxl;wb=openpyxl.Workbook();ws=wb.active;ws.append(['Liste ZVG/CAS']);ws.append(['ZVG-Nr','CAS-Nr','Stoffname']);ws.append(['10060','71-43-2','Benzol']);ws.append(['12345','76-05-1','Trifluoressigsäure']);ws.append(['23456','68-12-2','N,N-Dimethylformamid']);wb.save('${xl}')"`);
  const br = await chromium.launch();
  const ctx = await br.newContext({ viewport: { width: 1400, height: 950 }, acceptDownloads: true });
  const pg = await ctx.newPage();
  const errs = [];
  pg.on('pageerror', e => errs.push(e.message));
  pg.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push(m.text()); });
  await pg.goto(url);
  await pg.waitForFunction(() => typeof Chem !== 'undefined' && typeof Canvas !== 'undefined', null, { timeout: 20000 });
  await pg.waitForTimeout(1200);
  let ok = 0, bad = 0;
  const check = (n, c, info) => { if (c) ok++; else { bad++; console.log('FALSCH', n, info || ''); } };
  const load = async (smi) => { await pg.evaluate(() => Chem.setTab('analyse')); await pg.fill('.chem-import', smi); await pg.click('.chem-loadbtn'); await pg.waitForTimeout(250); await pg.evaluate(() => Chem.setTab('analyse')); await pg.waitForTimeout(150); };
  await pg.evaluate(() => { try { localStorage.removeItem('kt-chem-opts'); } catch (e) { } Chem.open(null); });
  await pg.waitForTimeout(300);
  await load('CCOC(C)=O');
  // NMR-Reiter mit Auswahl, Standard ¹H
  check('Reiter IR | Massenspektrum | NMR', (await pg.$$eval('.chem-specseg button', b => b.map(x => x.textContent).join('|'))) === 'IR|Massenspektrum|NMR');
  check('NMR-Auswahl Standard ¹H', (await pg.inputValue('.chem-nmrsel')) === 'H');
  await pg.click('.chem-specseg button[data-k="nmr"]');
  const sv = () => pg.evaluate(() => { const s = document.querySelector('.chem-specsvg svg'); return s ? { x0: +s.dataset.x0, x1: +s.dataset.x1, html: s.outerHTML.length } : null; });
  let v0 = await sv();
  check('¹H-Spektrum sichtbar', v0 && v0.x0 > v0.x1, JSON.stringify(v0));
  // Mausrad zoomt um den Mauszeiger
  await pg.$eval('.chem-specsvg svg', s => s.scrollIntoView({ block: 'center' }));   // 1.54: Tabelle/Steuerung höher → Spektrum ggf. unter dem Rand
  const bx = await pg.$eval('.chem-specsvg svg', s => { const r = s.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; });
  await pg.mouse.move(bx.x + bx.w * 0.6, bx.y + bx.h * 0.5);
  for (let i = 0; i < 4; i++) { await pg.mouse.wheel(0, -200); await pg.waitForTimeout(120); }
  let v1 = await sv();
  check('Mausrad zoomt hinein', v1 && Math.abs(v1.x0 - v1.x1) < Math.abs(v0.x0 - v0.x1) * 0.6, JSON.stringify(v1));
  await pg.dblclick('.chem-specsvg svg');
  v1 = await sv();
  check('Doppelklick = ganzes Spektrum', Math.abs(v1.x0 - v0.x0) < 1e-6);
  // Bereich ziehen: 4,3 … 3,9 ppm (Quartett)
  const X = (d) => { const G = { W: 560, l: 44, r: 14 }; return bx.x + (G.l + (d - v0.x0) / (v0.x1 - v0.x0) * (G.W - G.l - G.r)) * bx.w / G.W; };
  await pg.mouse.move(X(4.4), bx.y + bx.h * 0.4); await pg.mouse.down(); await pg.mouse.move(X(4.1), bx.y + bx.h * 0.4, { steps: 4 }); await pg.mouse.move(X(3.8), bx.y + bx.h * 0.4, { steps: 4 }); await pg.mouse.up();
  await pg.waitForTimeout(100);
  v1 = await sv();
  check('Bereich ziehen = Ausschnitt', v1 && v1.x0 < 4.5 && v1.x1 > 3.7 && v1.x0 > v1.x1, JSON.stringify(v1));
  check('Quartett-Linien im Ausschnitt einzeln (Text mit Aufspaltung)', await pg.evaluate(() => /2H/.test(document.querySelector(".chem-specsvg svg").textContent) && /\d\.\d\d q · \d/.test(document.querySelector('.chem-specsvg svg').textContent)));
  await pg.screenshot({ path: '/tmp/kt-spek-zoom.png' });
  await pg.click('.chem-spectools button:has-text("↺ ganzes Spektrum")');
  await pg.click('.chem-spectools button[title="Hineinzoomen"]');
  v1 = await sv();
  check('Knopf + zoomt', Math.abs(v1.x0 - v1.x1) < Math.abs(v0.x0 - v0.x1));
  // Kern wechseln: ¹³C, gemerkt nach Schliessen/Öffnen
  await pg.selectOption('.chem-nmrsel', 'C');
  await pg.waitForTimeout(100);
  check('¹³C gewählt', (await pg.evaluate(() => Chem.opts.nmrNuc)) === 'C' && /Ester C=O/.test(await pg.evaluate(() => document.querySelector('.chem-spectab').textContent)));
  await pg.evaluate(() => Chem.close());
  await pg.evaluate(() => { Chem.open(null); });
  await pg.waitForTimeout(300);
  await load('OC(=O)C(F)(F)F');
  check('Auswahl bleibt nach erneutem Öffnen (NMR, ¹³C)', (await pg.inputValue('.chem-nmrsel')) === 'C' && (await pg.evaluate(() => Chem.opts.specKind)) === 'nmr');
  await pg.selectOption('.chem-nmrsel', 'F');
  await pg.waitForTimeout(100);
  check('¹⁹F TFA −76,5', /−76[.,]5|-76[.,]5/.test(await pg.evaluate(() => document.querySelector('.chem-spectab').textContent)));
  await pg.screenshot({ path: '/tmp/kt-spek-f.png' });
  // Export
  const [dl] = await Promise.all([pg.waitForEvent('download'), pg.click('.chem-spectools button:has-text("PNG speichern")')]);
  const pth = await dl.path();
  const head = fs.readFileSync(pth).slice(0, 8).toString('hex');
  check('PNG gespeichert', head === '89504e470d0a1a0a', dl.suggestedFilename());   // Dateiname: headless Chromium meldet bei Umlauten „download“
  const [dl2] = await Promise.all([pg.waitForEvent('download'), pg.click('.chem-spectools button:has-text("SVG speichern")')]);
  check('SVG gespeichert', /<svg/.test(fs.readFileSync(await dl2.path(), 'utf8')) && !/currentColor/.test(fs.readFileSync(await dl2.path(), 'utf8')));
  // GESTIS-Stoffliste laden → direkter Link (TFA in der Testliste)
  await pg.setInputFiles('.chem-atab input[type=file][accept=".xlsx"]', xl);
  await pg.waitForTimeout(500);
  const gtxt = await pg.evaluate(() => Chem.E.atab.innerText);
  check('Stoffliste geladen, TFA verlinkt', /Stoffliste geladen \(3 Stoffe/.test(gtxt) && /ZVG 012345/.test(gtxt), gtxt.slice(gtxt.indexOf('Sicherheit'), gtxt.indexOf('Sicherheit') + 300));
  check('Link-URL', (await pg.evaluate(() => Chem.gestisUrl(Chem.gestisFind().zvg))) === 'https://gestis.dguv.de/data?name=012345');
  await load('CN(C)C=O');
  check('DMF über „N,N-Dimethylformamid“ gefunden', (await pg.evaluate(() => (Chem.gestisFind() || {}).zvg)) === '23456');
  // Spektrum in die Seite
  const nb = await pg.evaluate(() => Canvas.page.boxes.length);
  await pg.click('.chem-spectools button:has-text("In die Seite einfügen")');
  await pg.waitForTimeout(800);
  check('Spektrum in die Seite eingefügt', (await pg.evaluate(() => Canvas.page.boxes.length)) === nb + 1);
  // H entfernen in Lewis → Ladung
  await pg.evaluate(() => { Chem.open(null); Chem.setTab('analyse'); });
  await pg.waitForTimeout(200);
  await load('CCO');
  const r = await pg.evaluate(() => {
    Chem.setTab('struktur'); Chem.setModel('lewis');
    const O = Chem.E.mol.atoms.find(a => a.el === 'O');
    Chem.change(() => Chem.removeH(O, 'p'));
    const q1 = O.q, txt1 = Chem.E.an.hill.text || Chem.E.an.hill.html.replace(/<[^>]+>/g, '');
    Chem.setModel('skelett');
    const svg = Chem.E.molG.innerHTML;
    const packed = Chem.unpack(Chem.pack(Chem.E.mol));
    const C = Chem.E.mol.atoms.find(a => a.el === 'C' && !Chem.E.mol.bonds.some(b => (b.a === a.id || b.b === a.id) && Chem.E.mol.atoms.find(x => x.id === (b.a === a.id ? b.b : b.a)).el === 'O'));
    Chem.change(() => Chem.removeH(C, 'r'));
    const rad = /•/.test(Chem.E.molG.innerHTML);
    Chem.change(() => Chem.restoreH(O));
    return { q1, txt1, minus: /−/.test(svg), packedQ: packed.atoms.find(a => a.el === 'O').q, packedHq: packed.atoms.find(a => a.el === 'O').hq, rad, qBack: O.q || 0 };
  });
  check('Lewis: H⁺ entfernt → O⁻ (Ethanolat)', r.q1 === -1 && /C2H5O/.test(r.txt1), JSON.stringify(r));
  check('Keil/Strich zeigt die Ladung', r.minus);
  check('Ladung bleibt beim Speichern (pack/unpack)', r.packedQ === -1 && r.packedHq === 1);
  check('H· abspalten → Radikal-Punkt in Keil/Strich', r.rad);
  check('Wiederherstellen nimmt Ladung zurück', r.qBack === 0);
  // alte Zeichnung mit hd (1.49–1.52) → beim Öffnen als Ladung
  const old = await pg.evaluate(() => { Chem.close(); const m = ChemSmiles.toMol('CC(=O)O'); const O = m.atoms.find(a => a.el === 'O' && !m.bonds.some(b => (b.a === a.id || b.b === a.id) && b.o === 2)); O.hd = 1; Chem.chargeOldH(m); return { q: O.q, hd: O.hd || 0 }; });
  check('ältere entfernte H → Ladung (Acetat)', old.q === -1 && !old.hd, JSON.stringify(old));
  // neue Vorlagen in der Suche
  await pg.evaluate(() => { Chem.open(null, 'vorlagen'); });
  await pg.waitForTimeout(300);
  const found = await pg.evaluate(() => ['HOBt', 'Oxyma', 'DMAP', 'DCU', 'Trifluoressigsäure', 'DMT-dT-Phosphoramidit', 'Fmoc-Alanin', 'd(TpT)'].map(n => ChemDB.search(n).some(e => e.name === n)).every(Boolean));
  check('neue Vorlagen auffindbar', found);
  const cats = await pg.evaluate(() => Chem.E.ttab.innerText);
  check('neue Kategorien sichtbar', /Peptid- & Oligosynthese/.test(cats) && /Nukleoside & Nukleotide/.test(cats));
  await pg.screenshot({ path: '/tmp/kt-spek-vorlagen.png' });
  check('keine Fehler in der Konsole', !errs.length, errs.slice(0, 4).join(' | '));
  console.log(`${ok} von ${ok + bad} Browser-Prüfungen bestanden (Chem-Draw 1.53)`);
  await br.close();
  process.exitCode = bad ? 1 : 0;
})();
