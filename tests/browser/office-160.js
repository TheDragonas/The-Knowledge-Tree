'use strict';
/* Browser-Test 1.60: Office-Dateien als Seiten – node tests/browser/office-160.js [url]
 *  - Word/Excel/PowerPoint (tests/office/fixtures) über den gemeinsamen Import → eigene Seite mit page.type/page.office
 *  - Datei-Karte (📎) + gesperrte Vorschau: Word-Text/Liste/Tabelle/Bild, Excel-Blätter als Rechentabellen
 *    (Formeln rechnen, auch blattübergreifend), PowerPoint-Folienrahmen, Textfelder, Bild, Diagramm-Platzhalter, Notizen
 *  - Export „Office-Datei“: Byte für Byte gleich wie importiert (eine Seite = Datei, mehrere = ZIP)
 *  - auf die Seite gezogen bleibt es ein 📎-Anhang; „Als Office-Seite öffnen“ macht daraus eine Seite
 *  - nach Neuladen: Seite, Datei und Vorschau noch da */
const fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const url = process.argv[2] || 'http://127.0.0.1:8800/index.html';
const FX = path.join(__dirname, '..', 'office', 'fixtures');
(async () => {
  const br = await chromium.launch();
  const ctx = await br.newContext({ viewport: { width: 1400, height: 900 } });
  const pg = await ctx.newPage();
  const errs = [];
  pg.on('pageerror', e => errs.push(e.message));
  pg.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push(m.text()); });
  await pg.goto(url);
  await pg.waitForFunction(() => typeof OfficePages !== 'undefined' && Store.loaded && Canvas.page, null, { timeout: 20000 });
  await pg.waitForTimeout(800);
  let ok = 0, bad = 0;
  const check = (n, c, info) => { if (c) ok++; else { bad++; console.log('FALSCH', n, info || ''); } };
  const files = {};
  for (const n of ['test.docx', 'test.xlsx', 'test.pptx']) files[n] = fs.readFileSync(path.join(FX, n)).toString('base64');
  await pg.evaluate((files) => {
    window.__fx = {};
    for (const [n, b] of Object.entries(files)) { const s = atob(b), u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); window.__fx[n] = u; }
    window.__dl = [];
    Export.download = (name, blob) => { window.__dl.push({ name, blob }); };
    window.__eq = async (blob, u) => { const a = new Uint8Array(await blob.arrayBuffer()); if (a.length !== u.length) return false; for (let i = 0; i < a.length; i++) if (a[i] !== u[i]) return false; return true; };
  }, files);

  // 1) gemeinsamer Import (wie „Datei → Importieren“): alle drei → drei Office-Seiten
  const imp = await pg.evaluate(async () => {
    const before = new Set(Object.keys(Store.pages));
    const list = Object.entries(window.__fx).map(([n, u]) => new File([u], n));
    await OneImport.auto(list);
    await new Promise(r => setTimeout(r, 300));
    const made = Object.values(Store.pages).filter(p => !before.has(p.id));
    return made.map(p => ({ id: p.id, title: p.title, type: p.type, office: p.office, charts: p.boxes.filter(b => b.chart).length, boxes: p.boxes.length, sheets: p.boxes.filter(b => b.sheet).length, locked: p.boxes.filter(b => b.locked).length, card: p.boxes.filter(b => b.office === 'karte' && b.locked).length, edit: p.boxes.filter(b => b.ox && !b.locked).length, drawings: p.boxes.filter(b => b.ox && b.ox.k === 'folie').length, pics: p.boxes.filter(b => b.ox && b.ox.k === 'pic').length,
      text: p.boxes.map(b => b.html).join('\n'), imgs: p.boxes.filter(b => !b.bg).reduce((n, b) => n + b.images.length, 0) }));
  });
  const by = Object.fromEntries(imp.map(p => [p.office && p.office.fmt, p]));
  check('drei Office-Seiten angelegt', imp.length === 3 && by.docx && by.xlsx && by.pptx, JSON.stringify(imp.map(p => [p.title, p.type])));
  check('Seitentypen dok/tab/folie', by.docx?.type === 'dok' && by.xlsx?.type === 'tab' && by.pptx?.type === 'folie');
  check('Titel = Dateiname ohne Endung', by.docx?.title === 'test');
  check('Original als Asset (SHA-1-Name)', imp.every(p => /^[0-9a-f]{40}\.[a-z0-9]+$/.test(p.office.asset) && p.office.size > 1000));
  check('Datei-Karte gesperrt, Inhalt bearbeitbar (1.61)', imp.every(p => p.card === 1 && p.edit >= 1), JSON.stringify(imp.map(p => [p.card, p.edit])));
  check('Datei-Karte mit 📎-Anhang', imp.every(p => /class="kt-file"[^>]*data-kt-file="[0-9a-f]{40}/.test(p.text)));
  // Word
  const W = by.docx || { text: '' };
  check('Word: Überschrift', /<h1[^>]*>Round-Trip-Dokument<\/h1>/.test(W.text), W.text.slice(0, 300));
  check('Word: fett/kursiv', /<b>fett<\/b>/.test(W.text) && /<i>kursiv<\/i>/.test(W.text));
  check('Word: Liste', /<ul><li[^>]*>Erster Punkt<\/li><li[^>]*>Zweiter Punkt<\/li><li[^>]*>Dritter Punkt<\/li><\/ul>/.test(W.text));
  check('Word: Tabelle', /<table[^>]*>.*Z1S1.*Z3S3.*<\/table>/s.test(W.text));
  check('Word: Bild', W.imgs === 1);
  check('Word: Kopf-/Fusszeile im Rand (1.65)', /Kopfzeile KnowledgeTree-Test/.test(W.text) && /Fusszeile – Seite/.test(W.text));
  check('Word: Reihenfolge (Bild vor letztem Absatz)', await pg.evaluate((id) => { const p = Store.pages[id]; const im = p.boxes.find(b => b.images.length), last = p.boxes.find(b => /Letzter Absatz/.test(b.html)); return im && last && im.y < last.y; }, W.id));
  // Excel
  const xl = await pg.evaluate(async (id) => {
    if (Canvas.pageId !== id) { App.openPage(id); await new Promise(r => setTimeout(r, 500)); }
    const p = Store.pages[id];
    const sh = p.boxes.filter(b => b.sheet);
    return { names: sh.map(b => b.sheet.name), d6: Sheet.value(sh[0].id, 3, 5), b1: sh[1] && Sheet.value(sh[1].id, 1, 0), raw: sh[0].sheet.cells[XL.key(3, 5)], a2: Sheet.value(sh[0].id, 0, 1), note: (p.boxes.some(b => /Diagramme/.test(b.html)) || p.boxes.some(b => b.chart && b.ox && b.ox.k === 'xlo')) && !!(sh[0].sheet.merges && sh[0].sheet.merges.length) };   // 1.71: verbundene Zellen werden gezeigt (kein Hinweis mehr)
  }, by.xlsx.id);
  check('Excel: zwei Blätter als Rechentabellen', xl.names.join('|') === 'Daten|Zweites Blatt', JSON.stringify(xl));
  check('Excel: Formel rechnet (=SUM → 12.6)', Math.abs(xl.d6 - 12.6) < 1e-9, JSON.stringify(xl));
  check('Excel: Bezug auf anderes Blatt', Math.abs(xl.b1 - 12.6) < 1e-9, JSON.stringify(xl));
  check('Excel: Text mit Umlaut', xl.a2 === 'Äpfel');
  check('Excel: Diagramm (seit 1.75 angezeigt), verbundene Zellen dargestellt (1.71)', xl.note);
  // PowerPoint
  const P = by.pptx || { text: '' };
  check('PowerPoint: zwei Folienrahmen', P.drawings === 2, P.drawings);
  check('PowerPoint: Titel/Untertitel', /Round-Trip-Präsentation/.test(P.text) && /Untertitel mit Umlauten äöü/.test(P.text));
  check('PowerPoint: Textfeld + Bild', /Freies Textfeld/.test(P.text) && P.pics === 1);
  check('PowerPoint: Diagramm (seit 1.75 als Diagramm aus den Werten der Datei)', P.charts === 1 || /Diagramm – nur in PowerPoint bearbeitbar/.test(P.text), P.charts);
  check('PowerPoint: Notizen', /Sprechernotiz zu Folie 1/.test(P.text));
  const pos = await pg.evaluate((id) => { const p = Store.pages[id]; const fr = p.boxes.filter(b => b.ox && b.ox.k === 'folie').sort((a, b) => a.y - b.y); const tb = p.boxes.find(b => /Freies Textfeld/.test(b.html)); return { fr: fr.map(f => [f.x, f.y, f.images[0].w, f.images[0].h]), tb: tb && [tb.x, tb.y] }; }, P.id);
  // Folie 10 in × 7.5 in = 960 × 720 px (Massstab 900/960); Textfeld bei 6 in / 4.5 in
  const f2 = pos.fr[1] || [0, 0, 0, 0], sc = 900 / 960;
  check('PowerPoint: Lage des Textfelds', pos.tb && Math.abs(pos.tb[0] - (f2[0] + 576 * sc)) < 2 && Math.abs(pos.tb[1] - (f2[1] + 432 * sc)) < 2, JSON.stringify(pos));
  check('PowerPoint: Seitenverhältnis 4:3', Math.abs(f2[2] / f2[3] - 4 / 3) < 0.01);

  // 2) Export „Office-Datei“: eine Seite → Datei, byte-gleich
  const ex1 = await pg.evaluate(async (id) => {
    window.__dl = [];
    Export.sel = new Set([id]);
    await Export.run('office', {});
    const d = window.__dl[0];
    return d ? { name: d.name, same: await window.__eq(d.blob, window.__fx['test.docx']) } : null;
  }, W.id);
  check('Export eine Seite: test.docx byte-gleich', ex1 && ex1.name === 'test.docx' && ex1.same, JSON.stringify(ex1));
  const ex3 = await pg.evaluate(async (ids) => {
    window.__dl = [];
    Export.sel = new Set(ids);
    await Export.run('office', {});
    const d = window.__dl[0];
    if (!d) return null;
    const z = Ooxml.readZip(new Uint8Array(await d.blob.arrayBuffer()));
    const out = { name: d.name, files: [], same: true };
    for (const e of z) { out.files.push(e.name); const orig = window.__fx[e.name]; if (!(e.method === 0 && orig && await window.__eq(new Blob([e.raw]), orig))) out.same = false; }
    return out;
  }, imp.map(p => p.id));
  check('Export mehrere Seiten: ZIP mit drei Dateien', ex3 && /\.zip$/.test(ex3.name) && ex3.files.sort().join('|') === 'test.docx|test.pptx|test.xlsx' && ex3.same, JSON.stringify(ex3));
  const ex0 = await pg.evaluate(async () => {
    window.__dl = [];
    const plain = Object.values(Store.pages).find(p => !p.office);
    Export.sel = new Set([plain.id]);
    const info = UI.info; let shown = false; UI.info = () => { shown = true; };
    await Export.run('office', {});
    UI.info = info;
    return { n: window.__dl.length, shown };
  });
  check('Export ohne Office-Seite: Hinweis, keine Datei', ex0.n === 0 && ex0.shown);
  check('Export-Dialog kennt „Office-Datei“', await pg.evaluate(() => EXPORT_FORMATS.some(f => f.id === 'office')));

  // 3) auf die Seite gezogen → 📎-Anhang; „Als Office-Seite öffnen“
  const att = await pg.evaluate(async () => {
    const plain = Object.values(Store.pages).find(p => !p.office);
    App.openPage(plain.id); await new Promise(r => setTimeout(r, 400));
    const nPages = Object.keys(Store.pages).length;
    await OneImport.auto([new File([window.__fx['test.pptx']], 'Vortrag.pptx')], { pt: { x: 300, y: 300 } });
    const chip = Canvas.page.boxes.map(b => b.html).join('').match(/data-kt-file="([0-9a-f]{40}\.[a-z0-9]+)"[^>]*data-name="Vortrag.pptx"/);
    const asChip = Object.keys(Store.pages).length === nPages && !!chip;
    const p = chip ? await OfficePages.fromAttachment(chip[1], 'Vortrag.pptx') : null;
    return { asChip, page: p && { type: p.type, title: p.title, same: p.office.asset === chip[1] } };
  });
  check('auf die Seite gezogen = 📎-Anhang (keine neue Seite)', att.asChip);
  check('„Als Office-Seite öffnen“', att.page && att.page.type === 'folie' && att.page.title === 'Vortrag' && att.page.same, JSON.stringify(att));
  check('Navigation zeigt Office-Symbol', await pg.evaluate(() => !!document.querySelector('.p-title .p-office')));

  check('keine Skriptfehler', errs.length === 0, errs.join(' | '));

  // 5) Neuladen: alles noch da
  await pg.evaluate(async () => { await Save.flushAll(); });
  await pg.waitForTimeout(600);
  await pg.reload();
  await pg.waitForFunction(() => typeof OfficePages !== 'undefined' && Store.loaded, null, { timeout: 20000 });
  await pg.waitForTimeout(1200);
  const re = await pg.evaluate(async (id) => {
    if (typeof Lazy !== 'undefined' && Lazy.has && Lazy.has(id)) await Lazy.need([id]);
    const p = Store.pages[id];
    if (!p) return null;
    const blob = await OfficePages.assetBlob(p.office.asset);
    return { type: p.type, boxes: p.boxes.length, same: blob ? blob.size : 0 };
  }, W.id);
  check('nach Neuladen: Office-Seite und Datei da', re && re.type === 'dok' && re.boxes >= 5 && re.same === Buffer.from(files['test.docx'], 'base64').length, JSON.stringify(re));
  check('keine Skriptfehler nach Neuladen', errs.length === 0, errs.join(' | '));
  await br.close();
  console.log(`${ok} von ${ok + bad} Prüfungen bestanden (Office-Seiten 1.60)`);
  process.exit(bad ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
