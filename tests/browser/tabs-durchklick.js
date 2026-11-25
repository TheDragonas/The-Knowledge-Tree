'use strict';
/* Browser-Test geteilte Bereiche (1.57): node tests/browser/tabs-durchklick.js [url]
 * Ein Klick in den anderen (inaktiven) Bereich macht ihn aktiv UND wirkt dort sofort (Textfeld wird gewählt bzw.
 * bearbeitet); Mausrad über der Vorschau verschiebt sie, ohne zu wechseln. Bild: /tmp/kt-tabs-durchklick.png */
const { chromium } = require('playwright');
const url = process.argv[2] || 'http://127.0.0.1:8800/index.html';
(async () => {
  const br = await chromium.launch();
  const pg = await br.newPage({ viewport: { width: 1400, height: 900 } });
  const errs = [];
  pg.on('pageerror', e => errs.push(e.message));
  pg.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push(m.text()); });
  await pg.goto(url);
  await pg.waitForFunction(() => typeof Panes !== 'undefined' && Store.loaded && Canvas.page, null, { timeout: 20000 });
  await pg.waitForTimeout(1500);
  let ok = 0, bad = 0;
  const check = (n, c, info) => { if (c) ok++; else { bad++; console.log('FALSCH', n, info || ''); } };
  // zweite Seite mit Textfeld neben der ersten öffnen
  const info = await pg.evaluate(async () => {
    const pids = Object.keys(Store.pages).filter(id => Store.pages[id].boxes && Store.pages[id].boxes.some(b => !b.sheet && !b.img));
    const a = Canvas.pageId, b = pids.find(id => id !== a) || a;
    Panes.split('h', b);
    await new Promise(r => setTimeout(r, 400));
    Panes.activate(Panes.treeLeaves()[0].id);   // linker Bereich aktiv, rechter zeigt die Vorschau
    await new Promise(r => setTimeout(r, 1500));
    return { a, b, panes: Panes.treeLeaves().map(p => p.id), active: Panes.S.active };
  });
  check('zwei Bereiche', info.panes.length === 2, JSON.stringify(info));
  const right = info.panes[1];
  // Textfeld in der Vorschau des rechten Bereichs suchen
  const pos = await pg.evaluate((id) => {
    const r = Panes.els.get(id); const root = r && r.host && r.host.shadowRoot;
    const bx = root && [...root.querySelectorAll('.box')].find(b => { const q = b.getBoundingClientRect(); return q.width > 30 && q.height > 14 && q.left > 0 && q.top > 0 && q.right < innerWidth && q.bottom < innerHeight; });
    if (!bx) return null;
    const q = bx.getBoundingClientRect();
    return { x: q.left + Math.min(20, q.width / 2), y: q.top + Math.min(12, q.height / 2), bid: bx.dataset.id };
  }, right);
  check('Textfeld in der Vorschau gefunden', !!pos);
  if (pos) {
    // Mausrad: Vorschau verschieben, Bereich bleibt inaktiv
    await pg.mouse.move(pos.x, pos.y);
    await pg.mouse.wheel(0, 0);
    check('vor dem Klick: rechter Bereich inaktiv', await pg.evaluate((id) => Panes.S.active !== id, right));
    await pg.mouse.click(pos.x, pos.y); await pg.waitForTimeout(300);
    const st = await pg.evaluate((bid) => ({ active: Panes.S.active, page: Canvas.pageId, sel: [...Canvas.sel], editing: Canvas.editing, bid }), pos.bid);
    check('ein Klick: Bereich aktiv', st.active === right, JSON.stringify(st));
    check('derselbe Klick wirkt: Textfeld gewählt/bearbeitet', st.editing === pos.bid || st.sel.includes(pos.bid), JSON.stringify(st));
    await pg.screenshot({ path: '/tmp/kt-tabs-durchklick.png' });
  }
  check('keine Fehler in der Konsole', !errs.length, errs.slice(0, 3).join(' | '));
  console.log(`${ok} von ${ok + bad} Browser-Prüfungen bestanden (geteilte Bereiche, Durchklick)`);
  await br.close();
  process.exitCode = bad ? 1 : 0;
})();
