'use strict';
/* Browser-Test 1.59: geteilte Ansicht und verlustfreie Bilder – node tests/browser/geteilt-159.js [url]
 *  - Vorschau des inaktiven Bereichs mit mittlerer Maustaste ziehen (ohne Wechsel), Mausrad/Strg+Rad (ohne Wechsel)
 *  - erster Klick auf eine Checkliste im inaktiven Bereich hakt sofort ab (Klick wird durchgereicht) und aktiviert
 *  - aktiver Bereich dezent markiert, Tastatur geht an den zuletzt angeklickten Bereich
 *  - ImgPack: deckendes PNG → kleineres WebP mit identischen Pixeln; transparentes PNG bleibt; Einfügen nutzt es */
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
  // rechts eine Seite mit Checkliste, links eine andere Seite aktiv
  const info = await pg.evaluate(async () => {
    const a = Canvas.pageId;
    const b = Object.keys(Store.pages).find(id => id !== a && Store.pages[id].boxes);
    Panes.split('h', b);
    await new Promise(r => setTimeout(r, 400));
    const bx = Canvas.createBoxAt({ x: 120, y: 120 }, { noFocus: true, w: 260 });
    bx.html = '<ul class="checklist"><li>Erste Aufgabe</li><li>Zweite Aufgabe</li></ul>';
    Canvas.render(); Hist.touchPage(Canvas.pageId); Hist.commit('Test-Checkliste');
    Canvas.view = { x: 0, y: 0, z: 1 }; Canvas.applyView();
    Panes.activate(Panes.treeLeaves()[0].id);
    await new Promise(r => setTimeout(r, 1800));
    return { a, b, bid: bx.id, panes: Panes.treeLeaves().map(p => p.id) };
  });
  const right = info.panes[1];
  check('geteilt: aktiver Bereich dezent markiert', await pg.evaluate(() => { const p = document.querySelector('#panes.pn-multi .pane.active'); return !!p && getComputedStyle(p, '::after').borderTopWidth === '2px'; }));
  const li = await pg.evaluate(({ id, bid }) => {
    const r = Panes.els.get(id), root = r && r.host && r.host.shadowRoot;
    const l = root && root.querySelector(`.box[data-id="${bid}"] ul.checklist > li`);
    if (!l) return null;
    const q = l.getBoundingClientRect();
    return { x: q.left + 6, y: q.top + q.height / 2 };
  }, { id: right, bid: info.bid });
  check('Checkliste in der Vorschau', !!li);
  // Ziehen mit mittlerer Maustaste: Vorschau verschiebt sich, Bereich bleibt inaktiv
  const v0 = await pg.evaluate((id) => ({ ...Panes.shots.get(id).view }), right);
  await pg.mouse.move(li.x + 200, li.y + 200); await pg.mouse.down({ button: 'middle' }); await pg.mouse.move(li.x + 260, li.y + 240, { steps: 4 }); await pg.mouse.up({ button: 'middle' });
  await pg.waitForTimeout(150);
  const v1 = await pg.evaluate((id) => ({ ...Panes.shots.get(id).view, active: Panes.S.active }), right);
  check('Vorschau ziehen (mittlere Taste) ohne Wechsel', Math.round(v1.x - v0.x) === 60 && Math.round(v1.y - v0.y) === 40 && v1.active !== right, JSON.stringify([v0, v1]));
  // zurückschieben, damit die Checkliste wieder unter den Koordinaten liegt
  await pg.mouse.move(li.x + 260, li.y + 240); await pg.mouse.down({ button: 'middle' }); await pg.mouse.move(li.x + 200, li.y + 200, { steps: 4 }); await pg.mouse.up({ button: 'middle' });
  await pg.mouse.move(li.x + 100, li.y + 100); await pg.mouse.wheel(0, 40); await pg.waitForTimeout(100); await pg.mouse.wheel(0, -40); await pg.waitForTimeout(150);
  check('Mausrad in der Vorschau ohne Wechsel', await pg.evaluate((id) => Panes.S.active !== id, right));
  // erster Klick hakt ab und aktiviert
  await pg.mouse.click(li.x, li.y); await pg.waitForTimeout(350);
  const st = await pg.evaluate(({ bid }) => { const b = Canvas.box(bid); return { active: Panes.S.active, html: b && b.html }; }, { bid: info.bid });
  check('ein Klick: Bereich aktiv', st.active === right, JSON.stringify(st));
  check('derselbe Klick hakt die Aufgabe ab (Klick durchgereicht)', /class="done"/.test(st.html || ''), st.html);
  // nur einmal ausgelöst (nicht doppelt umgeschaltet): nochmal klicken = wieder offen
  await pg.mouse.click(li.x, li.y); await pg.waitForTimeout(250);
  check('zweiter Klick schaltet zurück (kein Doppelauslösen)', !/class="done"/.test(await pg.evaluate((bid) => Canvas.box(bid).html, info.bid)));
  // Tastatur geht an den zuletzt angeklickten Bereich: Strg+Z wirkt auf diese Seite
  check('Tastatur/Menüband gehören zum aktiven Bereich', await pg.evaluate((b) => Canvas.pageId === b, info.b));
  await pg.screenshot({ path: '/tmp/kt-geteilt-159.png' });
  // ImgPack
  const ip = await pg.evaluate(async () => {
    const mk = (alpha) => { const c = document.createElement('canvas'); c.width = 640; c.height = 400; const g = c.getContext('2d');
      if (!alpha) { g.fillStyle = '#fff'; g.fillRect(0, 0, 640, 400); }
      g.fillStyle = '#2f6fd6'; g.fillRect(40, 40, 300, 120); g.fillStyle = alpha ? 'rgba(200,30,30,.5)' : '#c81e1e'; g.beginPath(); g.arc(450, 250, 110, 0, 7); g.fill();
      g.font = '28px sans-serif'; g.fillStyle = '#222'; for (let i = 0; i < 6; i++) g.fillText('KnowledgeTree Bildschirmfoto ' + i, 30, 210 + i * 30);
      return new Promise(r => c.toBlob(r, 'image/png')); };
    const decode = async (b) => { const im = new Image(); im.src = URL.createObjectURL(b); await im.decode(); const c = document.createElement('canvas'); c.width = im.width; c.height = im.height; const g = c.getContext('2d'); g.drawImage(im, 0, 0); return g.getImageData(0, 0, c.width, c.height).data; };
    const png = await mk(false), w = await ImgPack.lossless(png);
    const A = await decode(png), B = await decode(w);
    let same = A.length === B.length; for (let i = 0; same && i < A.length; i++) if (A[i] !== B[i]) same = false;
    const tp = await mk(true), t2 = await ImgPack.lossless(tp);
    const n0 = Canvas.page.boxes.length;
    await Canvas.insertImage(null, png, { x: 300, y: 300 });
    const box = Canvas.page.boxes[Canvas.page.boxes.length - 1];
    return { pngSize: png.size, type: w.type, size: w.size, same, transparent: t2 === tp, inserted: Canvas.page.boxes.length === n0 + 1 ? box.images[0].src : '' };
  });
  check('deckendes PNG → WebP, deutlich kleiner', ip.type === 'image/webp' && ip.size < ip.pngSize * 0.9, JSON.stringify(ip));
  check('WebP Pixel für Pixel gleich (unabhängig dekodiert)', ip.same);
  check('transparentes PNG bleibt unverändert', ip.transparent);
  check('Einfügen speichert das verlustfreie WebP', /\.webp$/.test(ip.inserted), ip.inserted);
  check('keine Fehler in der Konsole', !errs.length, errs.slice(0, 3).join(' | '));
  console.log(`${ok} von ${ok + bad} Browser-Prüfungen bestanden (geteilte Ansicht 1.59, Bilder)`);
  await br.close();
  process.exitCode = bad ? 1 : 0;
})();
