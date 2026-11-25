'use strict';
/* Browser-Test 1.71: Excel-Darstellung, alle Dateiformate, Speichern unter mit Dateityp
 *   node tests/browser/formate-171.js [url] [ordner mit Testdateien] [eigene .xlsx zum Ansehen]
 * Testdateien: python3 tests/browser/formate-fixtures.py <ordner> (openpyxl, python-docx, python-pptx, LibreOffice)
 *  - Excel: Designfarben mit Helligkeit, vertikal oben, Umbruch, Überlauf in leere Zellen, Schrift der Mappe,
 *    ausgeblendetes Blatt, Auswahlliste (Datenüberprüfung), verbundene Zellen, fixierte Zeilen/Spalten beim Zoomen und
 *    Scrollen (Köpfe stehen mit, Klick trifft die fixierte Zelle)
 *  - Import: .csv (; und Dezimalkomma) .xls (Formeln, geteilte Formeln, Formate) .ods .doc .odt .rtf .md .txt .ppt .odp
 *  - Speichern unter: Dateityp-Liste (voreingestellt das neueste Format), alle Formate erzeugen und wieder einlesen
 *    (Rundlauf) – .xlsm/.xltx/.docm/.dotx/.pptm/.ppsx/.potx mit dem richtigen Inhaltstyp */
const fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const url = process.argv[2] || 'http://127.0.0.1:8800/index.html';
const DIR = process.argv[3] || '/tmp/kt-formate';
const OWN = process.argv[4] || '';
(async () => {
  if (!fs.existsSync(path.join(DIR, 'f.xlsx'))) { console.log('Testdateien fehlen – zuerst: python3 tests/browser/formate-fixtures.py ' + DIR); process.exit(2); }
  const br = await chromium.launch();
  let ok = 0, bad = 0;
  const check = (n, c, info) => { if (c) ok++; else { bad++; console.log('FALSCH', n, info === undefined ? '' : typeof info === 'string' ? info : JSON.stringify(info)); } };
  const pg = await br.newPage({ viewport: { width: 1440, height: 900 } });
  const errs = [];
  pg.on('pageerror', e => errs.push(e.message));
  pg.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push(m.text()); });
  await pg.goto(url);
  await pg.waitForFunction(() => typeof OfficeConvert !== 'undefined' && Store.loaded && Canvas.page, null, { timeout: 20000 });
  await pg.waitForTimeout(800);
  const imp = (f) => pg.evaluate(async ([b, name]) => {
    const s = atob(b), u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i);
    const p = await OfficePages.importOne(new File([u], name)); await new Promise(r => setTimeout(r, 1000));
    document.querySelectorAll('.toast').forEach(t => t.remove());
    return p.id;
  }, [fs.readFileSync(path.join(DIR, f)).toString('base64'), f]);

  // ---------------------------------------------------------------- 1) Excel-Darstellung (f.xlsx)
  check('Helligkeit wie Excel: Akzent 1 40 % heller ≈ #8EA9DB', await pg.evaluate(() => { const c = OfficeGrid.tint('4472C4', 0.4); const d = [1, 3, 5].map(i => Math.abs(parseInt(c.slice(i, i + 2), 16) - parseInt('8EA9DB'.slice(i - 1, i + 1), 16))); return d.every(x => x <= 3); }));
  const pid = await imp('f.xlsx');
  const xl = await pg.evaluate(() => {
    const sh = Canvas.page.boxes.find(b => b.sheet && b.sheet.name === 'Daten'), d = sh.sheet, e = Canvas.els.get(sh.id);
    const td = (k) => { const p = XL.parseKey(k); return e.querySelector('.xl-grid').rows[p.r].cells[p.c]; };
    const cs = (k) => getComputedStyle(td(k));
    return {
      a9: d.cells.A9.f, a1: d.cells.A1.f, b9: d.cells.B9.f, xl: d.xl, dv: d.dv, merges: d.merges, freeze: d.freeze,
      tabs: [...document.querySelectorAll('.ofv-st:not(.add)')].map(x => x.textContent),
      hidden: Canvas.page.boxes.filter(b => b.sheet && b.ox.hid).map(b => b.sheet.name),
      va: cs('B9').verticalAlign, ws: cs('B9').whiteSpace, a10: td('A10').className, a10ws: cs('A10').whiteSpace, a10ov: cs('A10').overflow,
      font: getComputedStyle(e.querySelector('.xl-grid')).fontFamily, bg9: cs('A9').backgroundColor,
      mg: e.querySelector('.xl-mg') && e.querySelector('.xl-mg').textContent,
    };
  });
  check('Designfarbe mit Helligkeit gelesen (A9)', xl.a9 && /^#[0-9a-f]{6}$/.test(xl.a9.bg) && xl.a9.bg !== '#4472c4', xl.a9);
  check('Füllung + weisse fette Schrift (A1)', xl.a1 && xl.a1.bg === '#2f5597' && xl.a1.b && xl.a1.c === '#ffffff', xl.a1);
  check('oben + Umbruch (B9) – gelesen und gezeigt', xl.b9 && xl.b9.va === 't' && xl.b9.wr && xl.va === 'top' && xl.ws === 'pre-wrap', xl);
  check('ohne Umbruch: einzeilig, läuft in leere Nachbarzellen (A10)', /xl-of/.test(xl.a10) && xl.a10ws === 'pre' && xl.a10ov === 'visible', xl);
  check('Schrift der Mappe (Calibri 11)', xl.xl && xl.xl.fn === 'Calibri' && xl.xl.fs === 11 && /Calibri/.test(xl.font), xl.xl);
  check('ausgeblendetes Blatt: nicht im Register', xl.hidden.join() === 'Versteckt' && !xl.tabs.includes('Versteckt') && xl.tabs.includes('Zweites'), xl);
  check('verbundene Zellen A7:C7 als eine Fläche', xl.merges && xl.merges[0] === 'A7:C7' && xl.mg === 'Verbunden zentriert', xl);
  check('fixiert bei B2', xl.freeze && xl.freeze.r === 1 && xl.freeze.c === 1, xl.freeze);
  // Auswahlliste
  await pg.evaluate(() => { const id = Canvas.page.boxes.find(b => b.sheet && b.sheet.name === 'Daten').id; Sheet.activate(id, 5, 2); });
  await pg.waitForTimeout(200);
  const dvb = await pg.$('.xl-dv');
  check('Auswahlliste: Pfeil an der Zelle', !!dvb);
  if (dvb) {
    await dvb.click(); await pg.waitForTimeout(200);
    const items = await pg.evaluate(() => [...document.querySelectorAll('.popup .mi')].map(x => x.textContent));
    check('Auswahlliste: Werte rot, grün, blau', ['rot', 'grün', 'blau'].every(v => items.some(t => t.includes(v))), items);
    await pg.evaluate(() => { const it = [...document.querySelectorAll('.popup .mi')].find(x => x.textContent.includes('grün')); it && it.click(); });
    await pg.waitForTimeout(200);
    check('Auswahlliste: Wert gesetzt', await pg.evaluate(() => Canvas.page.boxes.find(b => b.sheet && b.sheet.name === 'Daten').sheet.cells.F3.v === 'grün'));
  }
  await pg.keyboard.press('Escape');
  // Klick auf die verbundene Fläche (B7) wählt A7
  const mgr = await pg.evaluate(() => { const r = document.querySelector('.xl-mg').getBoundingClientRect(); return { x: r.left + r.width * 0.6, y: r.top + r.height / 2 }; });
  await pg.mouse.click(mgr.x, mgr.y); await pg.waitForTimeout(150);
  check('Klick in verbundene Zellen wählt die Zelle oben links', await pg.evaluate(() => Sheet.active && Sheet.active.c === 0 && Sheet.active.r === 6), await pg.evaluate(() => Sheet.active && [Sheet.active.c, Sheet.active.r]));
  // Zoomen und Scrollen: fixierte Köpfe stehen über ihren Zellen, Klick trifft die fixierte Zelle
  for (const z of [100, 175, 250]) {
    await pg.evaluate((z) => { Canvas.view.z = z / 100; Canvas.view.x = -400; Canvas.view.y = -300; Canvas.applyView(); }, z);
    await pg.waitForTimeout(250);
    const g = await pg.evaluate(() => {
      const e = Canvas.els.get(Canvas.page.boxes.find(b => b.sheet && b.sheet.name === 'Daten').id);
      const t = e.querySelector('.xl-grid'), a1 = t.rows[0].cells[0].getBoundingClientRect(), b1 = t.rows[0].cells[1].getBoundingClientRect();
      const ha = e.querySelector('.xl-ch.fz[data-c="0"]').getBoundingClientRect(), h1 = e.querySelector('.xl-rh.fz[data-r="0"]').getBoundingClientRect();
      const vp = Canvas.vp.getBoundingClientRect();
      // erste Zelle der fixierten Zeile 1 rechts der fixierten Spalte A (die übrigen liegen darunter)
      let c = 1, r; for (; c < t.rows[0].cells.length; c++) { r = t.rows[0].cells[c].getBoundingClientRect(); if (r.left >= a1.right - 1) break; }
      void b1;
      return { dx: Math.abs(ha.left - a1.left), dy: Math.abs(h1.top - a1.top), inView: a1.left >= vp.left - 2 && a1.top >= vp.top - 2, c, b1: { x: r.left + r.width / 2, y: r.top + r.height / 2 } };
    });
    check(`Zoom ${z} %: fixierter Kopf über seiner Zelle, Zelle sichtbar`, g.dx < 2 * z / 100 + 0.5 && g.dy < 2 * z / 100 + 0.5 && g.inView, g);
    await pg.mouse.click(g.b1.x, g.b1.y); await pg.waitForTimeout(120);
    check(`Zoom ${z} %: Klick in die fixierte Zeile 1 trifft die Zelle`, await pg.evaluate((c) => Sheet.active && Sheet.active.c === c && Sheet.active.r === 0, g.c), [g.c, await pg.evaluate(() => Sheet.active && [Sheet.active.c, Sheet.active.r])]);
  }
  await pg.evaluate(() => { Canvas.view = { x: 0, y: 0, z: 1 }; Canvas.applyView(); });
  // Blatt einblenden über das Register-Menü
  await pg.evaluate(() => OfficeView.hideSheet(Canvas.page.boxes.find(b => b.sheet && b.sheet.name === 'Versteckt').id, false));
  await pg.waitForTimeout(250);
  check('Blatt einblenden', await pg.evaluate(() => [...document.querySelectorAll('.ofv-st')].some(x => x.textContent === 'Versteckt')));

  // ---------------------------------------------------------------- 2) Import aller Formate
  const expect = {
    'de.csv': (o) => o.type === 'tab' && o.cells.B2 === '1234.5' && o.cells.A4 === 'Text; mit Semikolon' && o.src === 'de.csv',
    'f.xls': (o) => o.type === 'tab' && o.cells.D2 === '=B2*C2' && o.cells.D5 === '=SUM(D2:D4)' && o.vals.D5 === 19.75 && o.fmt.A1 && o.fmt.A1.bg === '#2f5597' && o.fmt.A1.b && o.merges === 'A7:C7' && o.hidden === 'Versteckt',
    'f.ods': (o) => o.type === 'tab' && /^=B2\*C2$/i.test(o.cells.D2) && o.vals.D5 === 19.75 && o.fmt.A1 && o.fmt.A1.bg === '#2f5597' && o.fmt.A1.b && o.merges === 'A7:C7',
    'test.doc': (o) => o.type === 'dok' && /Testdokument Überschrift/.test(o.text) && /Z1S2/.test(o.text) && /«Anführungszeichen» äöü/.test(o.text),
    'test.odt': (o) => o.type === 'dok' && /<h1|Testdokument/.test(o.html) && /<b>fett<\/b>|font-weight: ?(bold|700)|<strong>fett/.test(o.html) && /Z1S2/.test(o.text),
    'test.rtf': (o) => o.type === 'dok' && /Testdokument/.test(o.text) && /<b>fett<\/b>|<strong>fett|bold/.test(o.html) && /Z1S2/.test(o.text),
    'notiz.md': (o) => o.type === 'dok' && /Titel/.test(o.text) && /zwei a/.test(o.text) && /<b>fett<\/b>|<strong>fett|bold/.test(o.html),
    'notiz.txt': (o) => o.type === 'dok' && /Zeile zwei äöü/.test(o.text),
    'test.ppt': (o) => o.type === 'folie' && o.slides === 2 && /Erste Folie/.test(o.text) && /Punkt A/.test(o.text) && /Inhalt zwei/.test(o.text),
    'test.odp': (o) => o.type === 'folie' && o.slides === 2 && /Erste Folie/.test(o.text) && /Punkt B/.test(o.text),
  };
  for (const [f, test] of Object.entries(expect)) {
    if (!fs.existsSync(path.join(DIR, f))) { check('Testdatei vorhanden: ' + f, false); continue; }
    const id = await imp(f);
    const o = await pg.evaluate((id) => {
      const p = Store.pages[id], o = { type: p.type, src: p.office.src && p.office.src.name, fmt: {}, cells: {}, vals: {} };
      if (p.type === 'tab') {
        const sh = OfficeView.sheets(p)[0];
        for (const [k, c] of Object.entries(sh.sheet.cells)) { o.cells[k] = c.v; if (c.f) o.fmt[k] = c.f; }
        for (const k of ['D2', 'D5']) { const pk = XL.parseKey(k); o.vals[k] = Sheet.value(sh.id, pk.c, pk.r); }
        o.merges = (sh.sheet.merges || []).join();
        o.hidden = OfficeView.sheets(p).filter(b => b.ox.hid).map(b => b.sheet.name).join();
      } else {
        o.html = p.boxes.filter(b => b.ox).map(b => b.html || '').join('\n');
        o.text = o.html.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ');
        if (p.type === 'folie') o.slides = OfficePpt.frames(p).length;
      }
      return o;
    }, id);
    check('Import ' + f, test(o), { ...o, html: undefined, fmt: o.fmt && o.fmt.A1, cells: o.cells && Object.fromEntries(Object.entries(o.cells).slice(0, 12)) });
  }
  // Original speichern gibt bei umgewandelten Dateien das echte Original zurück
  const orig = await pg.evaluate(async () => { const p = Object.values(Store.pages).find(x => x.office && x.office.src && x.office.src.name === 'de.csv'); const f = await OfficePages.fileOf(p.id, true); return { name: f.name, size: f.blob.size }; });
  check('Original speichern: die importierte .csv', orig.name === 'de.csv' && orig.size === fs.statSync(path.join(DIR, 'de.csv')).size, orig);

  // ---------------------------------------------------------------- 3) Speichern unter
  await pg.evaluate((id) => App.openPage(id), pid); await pg.waitForTimeout(500);
  await pg.evaluate(() => OfficeView.showSheet(Canvas.page.boxes.find(b => b.sheet && b.sheet.name === 'Daten').id)); await pg.waitForTimeout(200);
  await pg.evaluate(() => Cmd.run('officeSave')); await pg.waitForTimeout(300);
  const dlg = await pg.evaluate(() => { const d = document.querySelector('.kt-saveas'); const s = d.querySelector('.sa-type'); const o = { opts: [...s.options].map(x => x.value), val: s.value, hint: d.querySelector('.sa-hint').textContent }; d.closest('.dlg-back').remove(); return o; });
  check('Dateityp-Liste Excel, voreingestellt .xlsx', dlg.val === 'xlsx' && ['xlsx', 'xlsm', 'xltx', 'xls', 'ods', 'csv', 'csvu', 'txt'].every(t => dlg.opts.includes(t)), dlg);
  const round = await pg.evaluate(async (pid) => {
    const p = Store.pages[pid], out = {};
    const rd = async (t) => { const r = await OfficeSaveAs.build(p, t); return { r, u8: new Uint8Array(await r.blob.arrayBuffer()) }; };
    const ct = async (u8) => { const pkg = await Ooxml.open(u8); return (await pkg.text('[Content_Types].xml')).match(/PartName="\/xl\/workbook\.xml" ContentType="([^"]+)"/)[1]; };
    { const { u8 } = await rd('xls'); const b = OfficeConvert.readXls(u8, []); const d = b.sheets.find(s => s.name === 'Daten'); out.xls = { names: b.sheets.map(s => s.name + (s.hidden ? '(h)' : '')).join(), a1: d.cells.A1.v, bg: d.cells.A1.s && d.cells.A1.s.bg, bold: d.cells.A1.s && d.cells.A1.s.b, d5: d.cells.D5.v, f3: d.cells.F3.v, merge: d.merges.join(), freeze: d.freeze, w: Math.round(d.cols[0]) }; }
    { const { u8 } = await rd('ods'); const b = await OfficeConvert.readOds(u8, []); const d = b.sheets[0]; out.ods = { names: b.sheets.map(s => s.name + (s.hidden ? '(h)' : '')).join(), f: d.cells.D2.f, d5: d.cells.D5.v, bg: d.cells.A1.s && d.cells.A1.s.bg, bold: d.cells.A1.s && d.cells.A1.s.b, x: b.sheets[1].cells.A1.f, merge: d.merges.join() }; }
    { const { r, u8 } = await rd('csv'); const t = new TextDecoder().decode(u8); out.csv = { ext: r.ext, bom: u8[0] === 0xEF, line2: t.split('\r\n')[1], note: r.note }; }
    { const { u8 } = await rd('csvu'); out.csvu = new TextDecoder().decode(u8).split('\r\n')[1]; }
    { const { u8 } = await rd('txt'); out.txt = new TextDecoder().decode(u8).split('\r\n')[1]; }
    for (const t of ['xlsm', 'xltx']) { const { r, u8 } = await rd(t); out[t] = { ext: r.ext, ct: await ct(u8) }; }
    { const { r } = await rd('xlsx'); out.xlsx = r.ext; }
    return out;
  }, pid);
  check('.xls zurückgelesen: Blätter (auch ausgeblendet), Werte, Formate, verbunden, fixiert, Breite', round.xls.names === 'Daten,Zweites,Versteckt' && round.xls.a1 === 'Artikel' && round.xls.bg === '#2f5597' && round.xls.bold && round.xls.d5 === 19.75 && round.xls.f3 === 'grün' && round.xls.merge === 'A7:C7' && round.xls.freeze && round.xls.freeze.r === 1 && Math.abs(round.xls.w - 18) <= 1, round.xls);
  check('.ods zurückgelesen: Formeln, Formate, Blattbezug, verbunden', round.ods.f === 'B2*C2' && round.ods.d5 === 19.75 && round.ods.bg === '#2f5597' && round.ods.bold && round.ods.x === 'Daten!D5*2' && round.ods.merge === 'A7:C7', round.ods);
  check('.csv (;) mit BOM, Zahlen ohne Tausender-Trennzeichen', round.csv.ext === 'csv' && round.csv.bom && round.csv.line2 === 'Äpfel;3;1.5;4.5;gross;rot', round.csv);
  check('.csv UTF-8 (,) und .txt (Tab)', round.csvu === 'Äpfel,3,1.5,4.5,gross,rot' && round.txt === 'Äpfel\t3\t1.5\t4.5\tgross\trot', [round.csvu, round.txt]);
  check('.xlsm/.xltx mit passendem Inhaltstyp', /macroEnabled/.test(round.xlsm.ct) && /template\.main/.test(round.xltx.ct) && round.xlsx === 'xlsx', round);
  // Word
  const wid = await imp('test.docx');
  const wr = await pg.evaluate(async (id) => {
    const p = Store.pages[id], out = {};
    const txt = async (t) => new TextDecoder().decode(new Uint8Array(await (await OfficeSaveAs.build(p, t)).blob.arrayBuffer()));
    const u8 = async (t) => new Uint8Array(await (await OfficeSaveAs.build(p, t)).blob.arrayBuffer());
    const rtf = OfficeConvert.readRtf(await u8('rtf'));
    out.rtf = { h: rtf.blocks.filter(b => b.h).map(b => b.h + ':' + b.runs.map(r => r.t).join('')), bold: rtf.blocks.some(b => (b.runs || []).some(r => r.b && r.t === 'fett')), red: rtf.blocks.some(b => (b.runs || []).some(r => r.c === '#c00000')), table: rtf.blocks.filter(b => b.t === 'table').map(b => b.rows.length + 'x' + b.rows[0].length).join() };
    const odt = await OfficeConvert.readOdt(await u8('odt'));
    out.odt = { h: odt.blocks.filter(b => b.h).length, lists: odt.blocks.filter(b => b.list).map(b => (b.list.num ? 'n' : 'b')).join(''), bold: odt.blocks.some(b => (b.runs || []).some(r => r.b && r.t === 'fett')), table: odt.blocks.some(b => b.t === 'table') };
    out.md = await txt('md'); out.txt = await txt('txt'); out.html = await txt('htm');   // 1.74: .html = Seitenansicht, .htm = gefiltert
    for (const t of ['docm', 'dotx']) { const pkg = await Ooxml.open(await u8(t)); out[t] = (await pkg.text('[Content_Types].xml')).match(/PartName="\/word\/document\.xml" ContentType="([^"]+)"/)[1]; }
    return out;
  }, wid);
  check('.rtf zurückgelesen: Überschriften, fett, Farbe, Tabelle 2×3', wr.rtf.h.length === 2 && wr.rtf.bold && wr.rtf.red && wr.rtf.table === '2x3', wr.rtf);
  check('.odt zurückgelesen: Überschriften, Listen (Punkte/Nummern), fett, Tabelle', wr.odt.h === 2 && wr.odt.lists === 'bbnn' && wr.odt.bold && wr.odt.table, wr.odt);
  check('.md/.txt/.html', /^# Testdokument/.test(wr.md) && /- Punkt eins/.test(wr.md) && /1\. Erster/.test(wr.md) && /• Punkt eins/.test(wr.txt) && /2\. Zweiter/.test(wr.txt) && /<h1>Testdokument/.test(wr.html) && /<ul>/.test(wr.html) && /<ol>/.test(wr.html), wr);
  check('.docm/.dotx mit passendem Inhaltstyp', /macroEnabled/.test(wr.docm) && /template\.main/.test(wr.dotx), wr);
  // PowerPoint
  const pptid = await imp('test.pptx');
  const pr = await pg.evaluate(async (id) => {
    const p = Store.pages[id], out = { opts: OfficeSaveAs.TYPES.pptx.map(x => x[0]) };
    for (const t of ['pptm', 'ppsx', 'potx']) { const r = await OfficeSaveAs.build(p, t); const pkg = await Ooxml.open(new Uint8Array(await r.blob.arrayBuffer())); out[t] = (await pkg.text('[Content_Types].xml')).match(/PartName="\/ppt\/presentation\.xml" ContentType="([^"]+)"/)[1]; }
    return out;
  }, pptid);
  check('PowerPoint: Liste (pptx zuerst), .pptm/.ppsx/.potx mit passendem Inhaltstyp', pr.opts[0] === 'pptx' && /macroEnabled/.test(pr.pptm) && /slideshow\.main/.test(pr.ppsx) && /template\.main/.test(pr.potx), pr);
  // eigene Datei des Users (optional): Import ohne Fehler, Farben da
  if (OWN && fs.existsSync(OWN)) {
    const b64 = fs.readFileSync(OWN).toString('base64');
    const r = await pg.evaluate(async (b) => { const s = atob(b), u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); const p = await OfficePages.importOne(new File([u], 'eigen.xlsx')); await new Promise(r => setTimeout(r, 1200)); const sh = OfficeView.sheets(p)[0]; return { fills: Object.values(sh.sheet.cells).filter(c => c.f && c.f.bg).length, va: Object.values(sh.sheet.cells).filter(c => c.f && c.f.va).length }; }, b64);
    check('eigene Datei: Füllfarben und Ausrichtung übernommen', r.fills > 10 && r.va > 10, r);
    await pg.screenshot({ path: '/tmp/kt-formate-eigen.png' });
  }
  check('keine Fehler in der Konsole', errs.length === 0, errs.slice(0, 5));
  console.log(`formate-171: ${ok}/${ok + bad}`);
  await br.close();
  process.exit(bad ? 1 : 0);
})();
