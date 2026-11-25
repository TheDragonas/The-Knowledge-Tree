'use strict';
/* Browser-Test 1.75: Suche oben (Befehle, Einstellungen, Seiten) und Objekte aus Word/PowerPoint/Excel
 *   node tests/browser/office-175.js [url] [ordner]   (Testdateien: python3 tests/browser/office175-fixtures.py <ordner>)
 *  - Suche wie in Office (Alt+Q): Aktionen aus allen Registern (Freiform, Word, Excel, PowerPoint), Datei-Bereiche,
 *    Einstellungen (öffnet an der Stelle, hervorgehoben), Seiten, „im Notizbuch suchen“; Pfeiltasten + Enter
 *  - Word: Diagramm, Gruppe, SmartArt, Bild in Tabelle, Fuss-/Endnoten, Logo in der Kopfzeile, Textfeld mit Höhe;
 *    unverändert byte-gleich
 *  - PowerPoint: gedrehtes und zugeschnittenes Bild, Diagramm
 *  - Excel: Bild an der Zelle, Diagramm mit Bezug auf das Blatt (live), nur auf seinem Blatt */
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const { chromium } = require('playwright');
const url = process.argv[2] || 'http://127.0.0.1:8800/index.html';
const DIR = process.argv[3] || '/tmp/kt-word';
(async () => {
  if (!fs.existsSync(path.join(DIR, 'x175.xlsx'))) execFileSync('python3', [path.join(__dirname, 'office175-fixtures.py'), DIR]);
  const br = await chromium.launch();
  let ok = 0, bad = 0;
  const check = (n, c, info) => { if (c) ok++; else { bad++; console.log('FALSCH', n, info === undefined ? '' : typeof info === 'string' ? info : JSON.stringify(info)); } };
  const pg = await br.newPage({ viewport: { width: 1400, height: 950 } });
  const errs = [];
  pg.on('pageerror', e => errs.push(e.message));
  pg.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push(m.text()); });
  await pg.goto(url);
  await pg.waitForFunction(() => typeof TellMe !== 'undefined' && typeof OfficeObj !== 'undefined' && Store.loaded && Canvas.page, null, { timeout: 20000 });
  await pg.waitForTimeout(800);
  await pg.addStyleTag({ content: '.toast,#toasts{display:none!important}' });
  await pg.evaluate(() => { window.__eq = async (blob, u2) => { const a = new Uint8Array(await blob.arrayBuffer()); if (a.length !== u2.length) return false; for (let i = 0; i < a.length; i++) if (a[i] !== u2[i]) return false; return true; }; });
  const imp = (f) => pg.evaluate(async ([b, name]) => {
    const s = atob(b), u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i);
    window.__u = u;
    const p = await OfficePages.importOne(new File([u], name)); await new Promise(r => setTimeout(r, 1800));
    return p.id;
  }, [fs.readFileSync(path.join(DIR, f)).toString('base64'), f]);
  const pop = () => pg.evaluate(() => [...document.querySelectorAll('.tm-pop .tm-sec, .tm-pop .tm-it')].map(x => x.classList.contains('tm-sec') ? '#' + x.textContent : x.querySelector('.tm-l').textContent + ' @ ' + x.querySelector('.tm-w').textContent));
  const search = async (q) => { await pg.click('#tb-search'); await pg.fill('#tb-search', q); await pg.waitForTimeout(350); return pop(); };

  /* ============================================================ Suche oben (Freiform / OneNote) */
  await pg.keyboard.press('Escape');
  await pg.evaluate(() => document.activeElement && document.activeElement.blur());
  await pg.keyboard.press('Alt+q');
  check('Alt+Q setzt die Schreibmarke ins Suchfeld', await pg.evaluate(() => document.activeElement && document.activeElement.id === 'tb-search'));
  await pg.waitForTimeout(150);
  check('leeres Suchfeld: Hinweis „Was möchten Sie tun?“', await pg.evaluate(() => /Was möchten Sie tun/.test((document.querySelector('.tm-pop') || {}).textContent || '')));
  let r = await search('tabelle');
  check('Freiform: Aktion „Tabelle“ (Einfügen) und „im Notizbuch suchen“', r.some(x => /^Tabelle.* @ Einfügen/.test(x)) && /im Notizbuch suchen/.test(r[r.length - 1]), r);
  r = await search('sicherung');
  check('Einstellungen werden gefunden (Sicherung)', r.includes('#Einstellungen') && r.some(x => /@ Einstellungen › Sicherung/.test(x)), r);
  r = await search('seitenliste');
  check('Einstellung „Seitenliste“', r.some(x => /^Seitenliste @ Einstellungen › Allgemein/.test(x)), r);
  const steps = await pg.evaluate(() => [...document.querySelectorAll('.tm-pop .tm-it')].findIndex(x => /Einstellungen › Allgemein/.test(x.textContent) && x.querySelector('.tm-l').textContent === 'Seitenliste') + 1);
  for (let k = 0; k < steps; k++) await pg.keyboard.press('ArrowDown');
  const first = await pg.evaluate(() => (document.querySelector('.tm-pop .tm-it.on .tm-l') || {}).textContent);
  await pg.keyboard.press('Enter');
  await pg.waitForTimeout(500);
  const sj = await pg.evaluate(() => ({ dlg: !!document.querySelector('.opt-dlg'), cat: (document.querySelector('.opt-dlg .opt-cat.on') || {}).textContent, hit: (document.querySelector('.opt-dlg .opt-hit') || {}).textContent }));
  check('Pfeil + Enter öffnet die Einstellungen an der Stelle (hervorgehoben)', first === 'Seitenliste' && sj.dlg && /Allgemein/.test(sj.cat) && /Seitenliste/.test(sj.hit || ''), sj);
  await pg.keyboard.press('Escape'); await pg.waitForTimeout(200);
  r = await search('drucken');
  check('Datei-Bereich „Drucken“', r.some(x => /^Drucken @ Datei/.test(x)), r);
  r = await search('Diagramme');
  check('Seiten nach Titel', r.includes('#Seiten') && r.some(x => /^Diagramme @/.test(x)), r);
  // Befehl ausführen: „Neue Seite“ (Zahl der Seiten +1)
  const n0 = await pg.evaluate(() => Object.keys(Store.pages).length);
  r = await search('neue seite');
  await pg.evaluate(() => { const it = [...document.querySelectorAll('.tm-pop .tm-it')].find(x => /^Neue Seite/.test(x.querySelector('.tm-l').textContent)); it.click(); });
  await pg.waitForTimeout(500);
  check('Klick auf eine Aktion führt sie aus (Neue Seite)', (await pg.evaluate(() => Object.keys(Store.pages).length)) === n0 + 1, r);
  // Enter ohne Auswahl = wie bisher im Inhalt suchen
  await search('Willkommen');
  await pg.keyboard.press('Enter'); await pg.waitForTimeout(400);
  check('Enter ohne Auswahl sucht im Inhalt (wie bisher)', await pg.evaluate(() => !document.querySelector('.tm-pop') && !!document.querySelector('#findpanel:not([hidden])')));
  await pg.keyboard.press('Escape');

  /* ============================================================ Word */
  const wid = await imp('word175.docx');
  r = await search('seitenansicht');
  check('Word: Suche findet Word-Befehle (Seitenansicht im Register Ansicht)', r.some(x => /^Seiten.?ansicht @ Ansicht/.test(x)), r);
  r = await search('wasserzeichen');
  check('Word: Menü „Wasserzeichen“ (Entwurf)', r.some(x => /^Wasserzeichen.* @ Entwurf/.test(x)), r);
  await pg.keyboard.press('Escape');
  const w = await pg.evaluate(() => {
    const p = Canvas.page, B = p.boxes;
    const ch = B.find(b => b.chart);
    const grp = B.find(b => b.ox && b.ox.k === 'wfb' && /Text in der Gruppe/.test(b.html));
    const sa = B.find(b => b.ox && b.ox.k === 'wfb' && /Planen/.test(b.html));
    const tbl = B.find(b => b.ox && b.ox.k === 'wlock' && /<img data-kt-src/.test(b.html));
    const fn = B.find(b => b.ox && b.ox.k === 'wfn');
    const hf = B.find(b => b.ox && b.ox.k === 'hfp' && /<img data-kt-src/.test(b.html));
    const tb = B.find(b => b.ox && b.ox.k === 'wfl' && /Hohes Textfeld/.test(b.html));
    const tbe = tb && Canvas.els.get(tb.id);
    const img = tbl && Canvas.els.get(tbl.id) && Canvas.els.get(tbl.id).querySelector('img');
    const ref = B.map(b => b.html).join('').match(/<a href="#_ktfn1">1<\/a>/);
    return {
      chart: ch && [ch.chart.type, ch.chart.title, ch.chart.cache.cats.join(','), ch.chart.cache.series.map(s => s.name + ':' + s.vals.join('/')).join(' '), ch.chart.legend, !!Canvas.els.get(ch.id).querySelector('svg')],
      grp: grp && [/<img data-kt-src/.test(grp.html), /kt-shp/.test(grp.html)], sa: sa && [/Umsetzen/.test(sa.html), /background:#4472c4/i.test(sa.html)],
      tbl: !!tbl, img: img && img.complete && img.naturalWidth > 0, fn: fn && [/Text der Fussnote/.test(fn.html), /Text der Endnote/.test(fn.html)], ref: !!ref, bm: p.office.bm && p.office.bm._ktfn1 != null,
      hf: !!hf, tbh: tbe ? tbe.offsetHeight : 0,
    };
  });
  check('Word: Diagramm mit Werten aus der Datei (Säulen, Titel, 2 Reihen, Legende unten), gezeichnet', w.chart && w.chart[0] === 'col' && w.chart[1] === 'Umsatz je Quartal' && w.chart[2] === 'Q1,Q2,Q3' && w.chart[3] === '2025:4/6/5 2026:5/7/9' && w.chart[4] === 'b' && w.chart[5], w.chart);
  check('Word: Gruppe mit Form (Text) und Bild', w.grp && w.grp[0] && w.grp[1], w.grp);
  check('Word: SmartArt aus der gespeicherten Zeichnung (Formen mit Text und Farbe)', w.sa && w.sa[0] && w.sa[1], w.sa);
  check('Word: Bild in der Tabellenzelle sichtbar', w.tbl && w.img, w);
  check('Word: Fuss- und Endnoten (Nummer im Text springt zur Note)', w.fn && w.fn[0] && w.fn[1] && w.ref && w.bm, w);
  check('Word: Logo in der Kopfzeile', w.hf, w);
  check('Word: Textfeld so hoch wie in Word (160 px)', w.tbh >= 150, w.tbh);
  check('Word: unverändert gespeichert = byte-gleich', await pg.evaluate(async () => window.__eq((await OfficePages.current(Canvas.page)).blob, window.__u)));
  // Seitenansicht zeigt die Objekte
  const rd = await pg.evaluate(async () => { Cmd.run('wPages'); await new Promise(r => setTimeout(r, 500)); const o = document.querySelector('.kt-rd-ov'); const s = { svg: !!o.querySelector('.kt-rd-pages .ch-wrap svg'), grp: !!o.querySelector('.kt-rd-pages .kt-grp img') }; OfficeReader._ov.close(); return s; });
  check('Seitenansicht: Diagramm und Gruppe', rd.svg && rd.grp, rd);

  /* ============================================================ PowerPoint */
  await imp('p175.pptx');
  r = await search('übergang');
  check('PowerPoint: Suche findet Übergänge', r.some(x => /@ Übergänge/.test(x)), r);
  await pg.keyboard.press('Escape');
  const pp = await pg.evaluate(async () => {
    const p = Canvas.page;
    const px = async (src, fx, fy) => { const u = await Backend.imgURL(src); const i = new Image(); i.src = u; await i.decode(); const c = document.createElement('canvas'); c.width = i.naturalWidth; c.height = i.naturalHeight; const g = c.getContext('2d'); g.drawImage(i, 0, 0); const d = g.getImageData(Math.floor(fx * (c.width - 1)), Math.floor(fy * (c.height - 1)), 1, 1).data; return [d[0], d[1], d[2]]; };
    const pics = p.boxes.filter(b => b.ox && b.ox.k === 'pic');
    const rot = pics.find(b => b.images[0].h > b.images[0].w * 1.5), crop = pics.find(b => Math.abs(b.images[0].w - b.images[0].h) < 3);
    const ch = p.boxes.find(b => b.chart);
    return { rot: rot && [await px(rot.images[0].src, 0.5, 0.1), await px(rot.images[0].src, 0.5, 0.9), rot.ox.r90], crop: crop && [await px(crop.images[0].src, 0.05, 0.5), await px(crop.images[0].src, 0.95, 0.5)], chart: ch && [ch.chart.type, ch.chart.cache.series.length, ch.chart.cache.cats.join(',')] };
  });
  const near = (c, t) => c && Math.abs(c[0] - t[0]) < 40 && Math.abs(c[1] - t[1]) < 40 && Math.abs(c[2] - t[2]) < 40;
  check('PowerPoint: gedrehtes Bild hochkant (rot oben, blau unten)', pp.rot && near(pp.rot[0], [220, 30, 30]) && near(pp.rot[1], [30, 60, 220]) && pp.rot[2], pp.rot);
  check('PowerPoint: zugeschnittenes Bild nur gelb', pp.crop && near(pp.crop[0], [250, 200, 0]) && near(pp.crop[1], [250, 200, 0]), pp.crop);
  check('PowerPoint: Diagramm (Säulen, 2 Reihen)', pp.chart && pp.chart[0] === 'col' && pp.chart[1] === 2 && pp.chart[2] === 'Q1,Q2,Q3', pp.chart);
  check('PowerPoint: unverändert gespeichert = byte-gleich', await pg.evaluate(async () => window.__eq((await OfficePages.current(Canvas.page)).blob, window.__u)));

  /* ============================================================ Excel */
  await imp('x175.xlsx');
  check('Excel: unverändert gespeichert = byte-gleich (Bild und Diagramm bleiben in der Datei)', await pg.evaluate(async () => window.__eq((await OfficePages.current(Canvas.page)).blob, window.__u)));
  r = await search('zielwert');
  check('Excel: Suche findet Excel-Befehle auch in Menüs (Zielwertsuche unter Was-wäre-wenn)', r.some(x => /^Zielwert.* @ Daten › Was-wäre-wenn/.test(x)), r);
  await pg.evaluate(() => { const it = [...document.querySelectorAll('.tm-pop .tm-it')].find(x => /^Zielwert/.test(x.querySelector('.tm-l').textContent)); it.click(); });
  await pg.waitForTimeout(600);
  check('Menü-Eintrag ausführen: Zielwertsuche öffnet ihr Fenster; Menüs danach normal', await pg.evaluate(() => !!document.querySelector('.dlg') && /showPopup/.test(UI.menu.toString())));
  await pg.keyboard.press('Escape'); await pg.waitForTimeout(200);
  await pg.keyboard.press('Escape');
  const xl = await pg.evaluate(() => {
    const p = Canvas.page, sb = p.boxes.find(b => b.sheet), e = Canvas.els.get(sb.id);
    const im = p.boxes.find(b => b.ox && b.ox.k === 'xlo' && b.images.length), ch = p.boxes.find(b => b.ox && b.ox.k === 'xlo' && b.chart);
    const cell = Sheet.rectOf(e, 4, 1);
    return { img: im && [Math.round(im.x + 11 - sb.x - cell.x), Math.round(im.y + 13 - sb.y - cell.y), im.images[0].w, im.images[0].h], chart: ch && [ch.chart.src && ch.chart.src.range, ch.chart.type, Chart.data(ch).live, Chart.data(ch).series.map(s => s.vals.join('/')).join(' ')], vis: !!Canvas.els.get(im.id) };
  });
  check('Excel: Bild an Zelle E2 (120×60)', xl.img && Math.abs(xl.img[0]) <= 1 && Math.abs(xl.img[1]) <= 1 && xl.img[2] === 120 && xl.img[3] === 60, xl.img);
  check('Excel: Diagramm mit Bezug A1:C4, live', xl.chart && xl.chart[0] === 'A1:C4' && xl.chart[1] === 'col' && xl.chart[2] && xl.chart[3] === '4/6/5 5/7/9', xl.chart);
  const live = await pg.evaluate(() => { const p = Canvas.page, sb = p.boxes.find(b => b.sheet); Sheet.setCells(sb.id, [[1, 3, '12']], 'Test'); const ch = p.boxes.find(b => b.chart); return Chart.data(ch).series[0].vals.join('/'); });
  check('Excel: Diagramm folgt der Zelle (B4 = 12)', live === '4/6/12', live);
  const hid = await pg.evaluate(async () => { OfficeXl.addSheet(); await new Promise(r => setTimeout(r, 300)); const p = Canvas.page; const im = p.boxes.find(b => b.ox && b.ox.k === 'xlo'); return OfficeView.hidden(p, im); });
  check('Excel: Bilder/Diagramme nur auf ihrem Blatt', hid === true);
  check('Keine Fehler in der Konsole', !errs.length, errs);
  console.log(`office-175: ${ok} richtig, ${bad} falsch`);
  await br.close();
  process.exit(bad ? 1 : 0);
})();
