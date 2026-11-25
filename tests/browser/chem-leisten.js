'use strict';
/* Browser-Test Chem-Draw-Leisten und Bildschirmgrössen (1.58): node tests/browser/chem-leisten.js [url]
 * Werkzeuge und Seitenleiste: Breite ziehen, zuklappen, gemerkt; Chem-Draw auf Desktop, kleinem Fenster, Tablet und
 * Handy (hoch/quer) ohne Überlauf, Zeichenfläche bleibt nutzbar. Bilder: /tmp/kt-leisten-*.png */
const { chromium, devices } = require('playwright');
const url = process.argv[2] || 'http://127.0.0.1:8800/index.html';
(async () => {
  const br = await chromium.launch();
  let ok = 0, bad = 0;
  const check = (n, c, info) => { if (c) ok++; else { bad++; console.log('FALSCH', n, info || ''); } };
  const open = async (ctxOpts) => {
    const ctx = await br.newContext(ctxOpts);
    const pg = await ctx.newPage();
    const errs = [];
    pg.on('pageerror', e => errs.push(e.message));
    await pg.goto(url);
    await pg.waitForFunction(() => typeof Chem !== 'undefined' && Store.loaded, null, { timeout: 20000 });
    await pg.waitForTimeout(1000);
    await pg.evaluate(() => { try { localStorage.removeItem('kt-chem-win'); } catch (e) { } Chem.open(null); });
    await pg.waitForTimeout(400);
    return { ctx, pg, errs };
  };
  const rect = (pg, sel) => pg.$eval(sel, e => { const r = e.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height, r: r.right, b: r.bottom }; });
  // Desktop
  {
    const { ctx, pg, errs } = await open({ viewport: { width: 1400, height: 900 } });
    const t0 = await rect(pg, '.chem-tools'), s0 = await rect(pg, '.chem-side'), st0 = await rect(pg, '.chem-stage');
    const sl = await rect(pg, '.chem-sash-l');
    await pg.mouse.move(sl.x + 3, sl.y + 60); await pg.mouse.down(); await pg.mouse.move(sl.x + 80, sl.y + 60, { steps: 5 }); await pg.mouse.up(); await pg.waitForTimeout(150);
    const t1 = await rect(pg, '.chem-tools');
    check('Werkzeuge breiter ziehen (mehr Spalten)', t1.w > t0.w + 60 && (await pg.$eval('.chem-tools', e => getComputedStyle(e).gridTemplateColumns.split(' ').length)) >= 4, JSON.stringify([t0.w, t1.w]));
    const sr = await rect(pg, '.chem-sash-r');
    await pg.mouse.move(sr.x + 3, sr.y + 60); await pg.mouse.down(); await pg.mouse.move(sr.x - 120, sr.y + 60, { steps: 5 }); await pg.mouse.up(); await pg.waitForTimeout(150);
    const s1 = await rect(pg, '.chem-side');
    check('Seitenleiste breiter ziehen', s1.w > s0.w + 100, JSON.stringify([s0.w, s1.w]));
    await pg.click('.chem-sash-l .chem-sash-btn'); await pg.click('.chem-sash-r .chem-sash-btn'); await pg.waitForTimeout(200);
    const st1 = await rect(pg, '.chem-stage');
    check('beide zuklappen: Zeichenfläche fast so breit wie das Fenster', !(await pg.$('.chem-tools:not([style*="none"])')) || (await pg.$eval('.chem-tools', e => getComputedStyle(e).display)) === 'none', '');
    check('zugeklappt: Zeichenfläche viel breiter', st1.w > st0.w + 350, JSON.stringify([st0.w, st1.w]));
    await pg.screenshot({ path: '/tmp/kt-leisten-zu.png' });
    await pg.evaluate(() => { Chem.close(); Chem.open(null); }); await pg.waitForTimeout(300);
    check('zugeklappt gemerkt', await pg.evaluate(() => Chem.E.dlg.classList.contains('tools-c') && Chem.E.dlg.classList.contains('side-c')));
    await pg.dblclick('.chem-sash-l'); await pg.waitForTimeout(150);
    check('Doppelklick auf Trennstrich klappt wieder auf', await pg.evaluate(() => !Chem.E.dlg.classList.contains('tools-c')));
    await pg.click('.chem-sash-r .chem-sash-btn'); await pg.waitForTimeout(150);
    check('Seitenleiste wieder auf, Breite gemerkt', Math.abs((await rect(pg, '.chem-side')).w - s1.w) < 3);
    // Planen-Modus hat eine eigene Breite
    await pg.click('.chem-modeseg button[data-mode="plan"]'); await pg.waitForTimeout(200);
    const p1 = await rect(pg, '.chem-side');
    check('Planen: eigene (breitere) Breite', p1.w >= 400, p1.w);
    await pg.click('.chem-modeseg button[data-mode="draw"]');
    check('Desktop: keine Fehler', !errs.length, errs.join(' | '));
    await ctx.close();
  }
  // verschiedene Bildschirme
  for (const [name, o] of [['klein 760×520', { viewport: { width: 760, height: 520 } }], ['Tablet 1024×768', { viewport: { width: 1024, height: 768 }, hasTouch: true }],
    ['Handy hoch', { ...devices['iPhone 13'] }], ['Handy quer', { ...devices['iPhone 13 landscape'] }]]) {
    const { ctx, pg, errs } = await open(o);
    const vw = await pg.evaluate(() => innerWidth), vh = await pg.evaluate(() => innerHeight);
    const d = await rect(pg, '.chem-dlg'), st = await rect(pg, '.chem-stage');
    const over = await pg.$eval('.chem-dlg', e => e.scrollWidth > e.clientWidth + 2);
    check(`${name}: Fenster passt (${Math.round(d.w)}×${Math.round(d.h)} in ${vw}×${vh})`, d.x >= -1 && d.r <= vw + 1 && d.y >= -1 && d.b <= vh + 1 && !over, JSON.stringify(d));
    check(`${name}: Zeichenfläche nutzbar (${Math.round(st.w)}×${Math.round(st.h)})`, st.w >= Math.min(300, vw * 0.5) && st.h >= 150, JSON.stringify(st));
    // Seitenleiste zuklappen vergrössert die Zeichenfläche
    await pg.click('.chem-sash-r .chem-sash-btn'); await pg.waitForTimeout(200);
    const st2 = await rect(pg, '.chem-stage');
    check(`${name}: Seitenleiste zuklappen gibt Platz`, st2.w * st2.h > st.w * st.h * 1.1, JSON.stringify([st, st2]));
    await pg.screenshot({ path: `/tmp/kt-leisten-${name.split(' ')[0].toLowerCase()}-${name.split(' ')[1]}.png` });
    check(`${name}: keine Fehler`, !errs.length, errs.join(' | '));
    await ctx.close();
  }
  console.log(`${ok} von ${ok + bad} Browser-Prüfungen bestanden (Chem-Draw-Leisten, Bildschirmgrössen)`);
  await br.close();
  process.exitCode = bad ? 1 : 0;
})();
