'use strict';
/* Browser-Test Fotomath-Werkzeuge (1.52): node tests/browser/fotomath-werkzeuge.js [url]
 * Voraussetzung: dist/ über einen lokalen Server (python3 -m http.server 8800 --bind 127.0.0.1 in dist).
 * Öffnet die App, legt eine Seite an, gibt Rechnungen in Fotomath ein, schaltet Werkzeuge und prüft Anzeige,
 * Rechenweg, Graph und Einfügen; Bildschirmfotos nach /tmp/kt-fm-*.png. */
const { chromium } = require('playwright');
const url = process.argv[2] || 'http://127.0.0.1:8800/index.html';
(async () => {
  const br = await chromium.launch();
  const pg = await br.newPage({ viewport: { width: 1300, height: 900 } });
  const errs = [];
  pg.on('pageerror', e => errs.push(e.message));
  pg.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push(m.text()); });   // CDN im Test ohne Internet
  await pg.goto(url);
  await pg.waitForFunction(() => typeof Canvas !== 'undefined' && typeof Fotomath !== 'undefined', null, { timeout: 20000 });
  await pg.waitForTimeout(1500);
  // eine Seite sicherstellen
  await pg.evaluate(async () => {
    if (!Canvas.page) { try { await Cmd.run('newPage'); } catch (e) { /* */ } }
  });
  await pg.waitForTimeout(500);
  const hasPage = await pg.evaluate(() => !!Canvas.page);
  console.log('Seite offen:', hasPage);
  let ok = 0, bad = 0;
  const check = (n, c) => { if (c) ok++; else { bad++; console.log('FALSCH', n); } };
  const run = async (txt) => pg.evaluate((t) => { Fotomath.runText(t, { x: 100, y: 100, w: 200, h: 40 }); return true; }, txt);
  const state = () => pg.evaluate(() => ({ out: Fotomath.panel.querySelector('.fm-out').innerText, tools: [...Fotomath.panel.querySelectorAll('.fm-tool')].map(b => b.textContent + (b.classList.contains('on') ? '*' : '')), steps: Fotomath.panel.querySelectorAll('.fm-steplist li').length, svg: !!Fotomath.panel.querySelector('.fm-graph svg') }));
  const tool = async (op) => { await pg.click(`.fm-tool[data-op="${op}"]`); await pg.waitForTimeout(150); };
  await run('x^3 - 3x');
  let s = await state();
  check('Werkzeuge bei Ausdruck', s.tools.join() === 'Ableiten,∫ Integrieren,Faktorisieren,Ausmultiplizieren,Kurvendiskussion,Taylor');
  await tool('diff'); s = await state();
  check('Ableiten aktiv + Rechenweg', s.tools[0] === 'Ableiten*' && s.steps >= 2 && s.svg);
  await tool('curve'); s = await state();
  check('Kurvendiskussion mit Graph', /Hochpunkt|H\(/.test(await pg.evaluate(() => Fotomath.panel.innerText)) && s.svg);
  await pg.screenshot({ path: '/tmp/kt-fm-kurve.png' });
  await tool('int'); s = await state();
  await pg.fill('.fm-in[data-b="0"]', '0'); await pg.fill('.fm-in[data-b="1"]', '2');
  await pg.click('[data-act="bounds"]'); await pg.waitForTimeout(150);
  const area = await pg.evaluate(() => Fotomath.cur.out.cas.text);
  check('bestimmtes Integral 0..2 von x³−3x = −2', area === '−2');
  await tool('factor'); s = await state();
  check('Faktorisieren', /x/.test(await pg.evaluate(() => Fotomath.cur.out.cas.text)));
  // Gleichungssystem getippt
  await pg.evaluate(() => Fotomath.fromText('2x+3y=7; x-y=1'));
  check('LGS', (await pg.evaluate(() => Fotomath.cur.out.cas && Fotomath.cur.out.cas.text)) === 'x = 2;  y = 1');
  await pg.screenshot({ path: '/tmp/kt-fm-lgs.png' });
  // Ungleichung, ggT, Befehle
  await pg.evaluate(() => Fotomath.fromText('x^2 - 4 > 0'));
  check('Ungleichung', (await pg.evaluate(() => Fotomath.cur.out.cas.text)) === 'L = ]−∞; −2[ ∪ ]2; ∞[');
  await pg.evaluate(() => Fotomath.fromText('ggT(12; 18)'));
  check('ggT', (await pg.evaluate(() => Fotomath.cur.out.cas.text)) === 'ggT = 6');
  await pg.evaluate(() => Fotomath.fromText('d/dx x^2*sin(x)'));
  check('d/dx Befehl', /cos/.test(await pg.evaluate(() => Fotomath.cur.out.cas.text)));
  await pg.evaluate(() => Fotomath.fromText('∫[0;3] x^2 dx'));
  check('∫ Befehl mit Grenzen', (await pg.evaluate(() => Fotomath.cur.out.cas.text)) === '9');
  await pg.evaluate(() => { Fotomath.cur.op = undefined; Fotomath.fromText('f(x) = x^2 - 4x + 3'); });
  check('Funktion → Kurvendiskussion', (await pg.evaluate(() => Fotomath.cur.op)) === 'curve' && (await state()).svg);
  await pg.screenshot({ path: '/tmp/kt-fm-funktion.png' });
  // Gleichung → Graph, Zahl → Primfaktoren
  await pg.evaluate(() => Fotomath.fromText('2x + 3 = 7'));
  await tool('graph'); s = await state();
  check('Graph zur Gleichung + Lösung bleibt', s.svg && (await pg.evaluate(() => Fotomath.cur.out.sols.length === 1 && Fotomath.cur.out.sols[0].num === 2)));
  await pg.evaluate(() => Fotomath.fromText('360 ='));
  await tool('primes');
  check('Primfaktoren', /2³/.test(await pg.evaluate(() => Fotomath.cur.out.cas.text)));
  // Einfügen: Ergebnis daneben, Graph als Bild
  await pg.evaluate(() => Fotomath.fromText('x^2'));
  await tool('diff');
  const nb = await pg.evaluate(() => Canvas.page.boxes.length);
  await pg.click('[data-act="next"]'); await pg.waitForTimeout(300);
  check('Ergebnis eingefügt', (await pg.evaluate(() => Canvas.page.boxes.length)) === nb + 1);
  await run('x^2 - 1');   // nach dem Einfügen ist Fotomath zu
  await tool('curve');
  const nb2 = await pg.evaluate(() => Canvas.page.boxes.length);
  await pg.click('[data-act="graphins"]'); await pg.waitForTimeout(1200);
  check('Graph als Bild eingefügt', (await pg.evaluate(() => Canvas.page.boxes.length)) === nb2 + 1);
  // Text mit Rechenweg
  await run('x^2*e^x');
  await tool('diff');
  const lines = await pg.evaluate(() => Fotomath.textLines(true));
  check('Rechenweg als Text', lines.length >= 3 && lines.some(l => /Produktregel/.test(l)));
  // Handschrift in zwei Zeilen → Gleichungssystem
  // Striche wie im Handschrift-Test erzeugen (Vorlagen mit Verzerrung), zweite Zeile 70 px tiefer
  global.MathInk = require('../../web/js/mathink.js').MathInk;
  const { write } = require('../mathink/mathink-test.js');
  const rowsStrokes = [...write(['2x+y=5']), ...write(['x-y=1']).map(st => ({ pts: st.pts.map(p => ({ x: p.x, y: p.y + 70 })) }))].map((st, i) => ({ ...st, id: 'r' + i }));
  const sysOk = await pg.evaluate((strokes) => {
    Fotomath.cur = { inks: [], strokes, rect: { x: 0, y: 0, w: 200, h: 100 }, bbox: { x: 0, y: 0, w: 200, h: 100 }, overrides: new Map(), text: null };
    Fotomath.recognize();
    return { sys: !!Fotomath.cur.sys, txt: Fotomath.cur.out.cas && Fotomath.cur.out.cas.text, rec: Fotomath.textOf() };
  }, rowsStrokes);
  console.log('   Handschrift-LGS:', JSON.stringify(sysOk));
  check('zwei Zeilen Handschrift → LGS', sysOk.sys && sysOk.txt === 'x = 2;  y = 1');
  await pg.screenshot({ path: '/tmp/kt-fm-hand-lgs.png' });
  check('keine Fehler in der Konsole', !errs.length);
  if (errs.length) console.log(errs.slice(0, 5));
  console.log(`${ok} von ${ok + bad} Browser-Prüfungen bestanden (Fotomath-Werkzeuge)`);
  await br.close();
  process.exitCode = bad ? 1 : 0;
})();
