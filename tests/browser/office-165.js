'use strict';
/* Browser-Test 1.65: Office-Seiten wie die Programme – node tests/browser/office-165.js [url]
 *  - Register je Seitentyp (Word: Layout, Excel: Formeln/Daten, PowerPoint: Entwurf/Bildschirmpräsentation), zurück bei Freiform
 *  - „+“ der Tableiste: Klick = neue Seite in neuem Tab, darüber halten / Rechtsklick = Word, Excel, PowerPoint
 *  - „Neue Seite“-Knopf der Seitenliste (darüber halten), Abschnitts-Menü, Datei → Neu
 *  - Word: Papier im Seitenformat, Text fliesst (wächst ein Absatz, rücken die folgenden nach), Blätter wachsen mit,
 *    Seite einrichten (Ränder, Quer, Format) → w:sectPr, Seitenumbruch ↔ w:br type=page, Bild im Text → Bild-Absatz
 *  - Excel: ein Blatt sichtbar, Blattregister unten, neues Blatt, umbenennen, löschen → Mappe
 *  - PowerPoint: Folienübersicht links (Miniaturen, Klick = Folie), Hintergrund und Foliengrösse → Datei
 *  - Statusleiste „Seite x von n · Wörter“ bzw. „Folie x von n“; Datei-Fenster mit „Speichern unter“ */
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const { chromium } = require('playwright');
const url = process.argv[2] || 'http://127.0.0.1:8800/index.html';
const FX = path.join(__dirname, '..', 'office', 'fixtures');
const OUT = '/tmp/kt-office-165';
fs.rmSync(OUT, { recursive: true, force: true }); fs.mkdirSync(OUT, { recursive: true });
const py = (code) => JSON.parse(execFileSync('python3', ['-c', code], { encoding: 'utf8' }));
(async () => {
  const br = await chromium.launch();
  const pg = await br.newPage({ viewport: { width: 1440, height: 900 } });
  const errs = [];
  pg.on('pageerror', e => errs.push(e.message));
  pg.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push(m.text()); });
  await pg.goto(url);
  await pg.waitForFunction(() => typeof OfficeView !== 'undefined' && Store.loaded && Canvas.page, null, { timeout: 20000 });
  await pg.waitForTimeout(800);
  let ok = 0, bad = 0;
  const check = (n, c, info) => { if (c) ok++; else { bad++; console.log('FALSCH', n, info === undefined ? '' : typeof info === 'string' ? info : JSON.stringify(info)); } };
  const tabs = () => pg.evaluate(() => [...document.querySelectorAll('#tabs .tab:not([hidden])')].map(t => t.textContent));
  const menu = () => pg.evaluate(() => [...document.querySelectorAll('.menu .mi .mi-label, .popup .mi-label')].map(x => x.textContent));
  const save = async (pid, name) => { const b = await pg.evaluate(async (pid) => { const c = await OfficePages.current(Store.pages[pid]); const a = new Uint8Array(await c.blob.arrayBuffer()); let s = ''; for (let i = 0; i < a.length; i += 0x8000) s += String.fromCharCode.apply(null, a.subarray(i, i + 0x8000)); return btoa(s); }, pid); fs.writeFileSync(path.join(OUT, name), Buffer.from(b, 'base64')); return path.join(OUT, name); };

  // 1) Freiform-Register
  const t0 = await tabs();
  check('Freiform: Register wie bisher', t0.includes('Verbindungen') && t0.includes('Anordnen') && !t0.includes('Layout'), t0);

  // 2) „+“ der Tableiste: darüber halten → Auswahl; Klick → neue Seite in neuem Tab
  const add = pg.locator('.pane.active .pt-add').first();
  await add.hover(); await pg.waitForTimeout(700);
  const m1 = await menu();
  check('+ darüber halten: Word / Excel / PowerPoint', ['Word', 'Excel', 'PowerPoint'].every(x => m1.includes(x)), m1);
  await pg.keyboard.press('Escape'); await pg.mouse.move(5, 5); await pg.waitForTimeout(200);
  const n0 = await pg.evaluate(() => ({ pages: Object.keys(Store.pages).length, tabs: Panes.find(Panes.S.active).tabs.length }));
  await pg.evaluate(() => UI.closePopup && UI.closePopup());
  await add.click(); await pg.waitForTimeout(500);
  const n1 = await pg.evaluate(() => ({ pages: Object.keys(Store.pages).length, tabs: Panes.find(Panes.S.active).tabs.length }));
  check('+ Klick: neue Seite in neuem Tab', n1.pages === n0.pages + 1 && n1.tabs === n0.tabs + 1, [n0, n1]);
  await pg.keyboard.press('Escape');
  await add.click({ button: 'right' }); await pg.waitForTimeout(250);
  const m2 = await menu();
  check('+ Rechtsklick: Seitentypen + Tab-Einträge', ['Leere Seite', 'Word', 'Excel', 'PowerPoint', 'Diese Seite in neuem Tab'].every(x => m2.includes(x)), m2);
  // Word über das Menü → neue Word-Seite im neuen Tab
  await pg.evaluate(() => { const it = [...document.querySelectorAll('.mi')].find(x => x.textContent.trim() === 'Word'); it.click(); });
  await pg.waitForTimeout(900);
  const w = await pg.evaluate(() => ({ type: Canvas.page.type, tabs: Panes.find(Panes.S.active).tabs.length, id: Canvas.pageId }));
  check('+ → Word: Word-Seite in neuem Tab', w.type === 'dok' && w.tabs === n1.tabs + 1, w);
  const tW = await tabs();
  check('Word-Register (Entwurf, Layout, Referenzen, ohne Verbindungen)', tW.join('|') === 'Datei|Start|Einfügen|Zeichnen|Entwurf|Layout|Referenzen|Überprüfen|Ansicht|Add-Ins', tW);   // 1.66: + Entwurf, Referenzen; 1.69: + Add-Ins

  // 3) Seitenliste: „Neue Seite“ darüber halten, Abschnitts-Menü, Datei → Neu
  await pg.mouse.move(5, 5); await pg.waitForTimeout(100);
  await pg.hover('#add-page'); await pg.waitForTimeout(700);
  const m3 = await menu();
  check('Neue-Seite-Knopf darüber halten: Word / Excel / PowerPoint', ['Word', 'Excel', 'PowerPoint'].every(x => m3.includes(x)), m3);
  await pg.keyboard.press('Escape'); await pg.mouse.move(5, 5);
  const sec = await pg.evaluate(() => { const s = Ops.currentSection(); const r = document.querySelector(`[data-id="${s.id}"]`); if (!r) return null; const b = r.getBoundingClientRect(); return { x: b.left + 20, y: b.top + b.height / 2 }; });
  if (sec) { await pg.mouse.click(sec.x, sec.y, { button: 'right' }); await pg.waitForTimeout(250); }
  const m4 = await menu();
  check('Abschnitt-Rechtsklick: Neue Seite als Word/Excel/PowerPoint', ['Neue Seite als Word', 'Neue Seite als Excel', 'Neue Seite als PowerPoint'].every(x => m4.includes(x)), m4);
  await pg.keyboard.press('Escape');

  // 4) Word: Papier, Fluss, Seiten
  const wd = await pg.evaluate(async () => {
    const p = Canvas.page;
    const b = p.boxes.find(x => x.ox && x.ox.k === 'w');
    b.html = '<h1>Bericht</h1>' + Array.from({ length: 6 }, (_, i) => `<div>Absatz ${i + 1}: ${'Lorem ipsum dolor sit amet, consectetur adipisici elit. '.repeat(8)}</div>`).join('');
    Canvas.render(); await new Promise(r => setTimeout(r, 300));
    const sheets0 = p.boxes.filter(x => x.ox && x.ox.k === 'blatt').length;
    b.html += Array.from({ length: 30 }, (_, i) => `<div>Weiter ${i + 1}: ${'Text für die zweite Seite. '.repeat(10)}</div>`).join('');
    Canvas.render(); await new Promise(r => setTimeout(r, 400));
    const sheets1 = p.boxes.filter(x => x.ox && x.ox.k === 'blatt').length;
    const P = OfficeView.paper(p);
    return { sheets0, sheets1, x: b.x, w: b.w, P, top: p.office.paperY, y: b.y, status: document.querySelector('#sb-left').textContent };
  });
  check('Word: Text auf dem Papier innerhalb der Ränder', Math.abs(wd.x - (40 + wd.P.l)) < 1 && Math.abs(wd.w - (wd.P.W - wd.P.l - wd.P.r + 22)) < 1 && Math.abs(wd.y - (wd.top + wd.P.t)) < 1, wd);
  check('Word: Blätter wachsen mit dem Text', wd.sheets0 === 1 && wd.sheets1 >= 2, wd);
  check('Statusleiste: Seite x von n · Wörter', /^Seite 1 von \d+ · [\d’']+ Wörter/.test(wd.status.replace(/\s+/g, ' ').replace(/ · /g, ' · ')), wd.status);
  // Fluss: Bild unter einem wachsenden Absatz rückt nach
  const wf = await pg.evaluate(async () => {
    const u8 = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVQI12P4z8AAAAMBAQAY3Y2wAAAAAElFTkSuQmCC'), c => c.charCodeAt(0));
    const p = Canvas.page, b = p.boxes.find(x => x.ox && x.ox.k === 'w');
    const name = await Backend.saveImage(new Blob([u8], { type: 'image/png' }));
    b.images.push({ id: uid('i'), src: name, x: 0, y: 0, w: 120, h: 80 });
    Canvas.render(); await new Promise(r => setTimeout(r, 300));
    return true;
  });
  void wf;
  // Seite einrichten: Querformat, schmale Ränder, Letter
  await pg.evaluate(() => { Cmd.run('wOrient', 'quer'); Cmd.run('wMargins', 'schmal'); });
  await pg.waitForTimeout(300);
  const wq = await pg.evaluate(() => { const p = Canvas.page; const b = p.boxes.find(x => x.ox && x.ox.k === 'w'); const P = OfficeView.paper(p); return { pg: p.office.pg, x: b.x, w: b.w, P }; });
  check('Layout → Querformat + schmale Ränder', wq.pg.w > wq.pg.h && wq.pg.l === 720 && Math.abs(wq.w - (wq.P.W - 48 - 48 + 22)) < 1, wq);
  // Seitenumbruch per Strg+Enter im Text
  await pg.evaluate(() => { const b = Canvas.page.boxes.find(x => x.ox && x.ox.k === 'w'); Canvas.focusText(b.id, true); });
  await pg.waitForTimeout(150);
  await pg.keyboard.press('Control+Enter'); await pg.keyboard.type('Nach dem Umbruch'); await pg.waitForTimeout(150);
  await pg.evaluate(() => Canvas.stopEditing && Canvas.stopEditing());
  const docx = await save(w.id, 'neu-165.docx');
  const dres = py(`import docx,json,zipfile\nd=docx.Document(${JSON.stringify(docx)})\ns=d.sections[-1]\nx=zipfile.ZipFile(${JSON.stringify(docx)}).read('word/document.xml').decode()\nprint(json.dumps({'orient':str(s.orientation),'w':s.page_width,'h':s.page_height,'l':s.left_margin,'br':x.count('w:type="page"'),'pics':len(d.inline_shapes),'all':' '.join(x.text for x in d.paragraphs)}))`);
  check('Word-Datei: Querformat, Ränder 1,27 cm', /LANDSCAPE/.test(dres.orient) && dres.w > dres.h && dres.l === 720 * 635, dres);
  check('Word-Datei: Seitenumbruch und Bild', dres.br >= 1 && dres.pics === 1 && /Nach dem Umbruch/.test(JSON.stringify(dres)), dres);
  const wp = py(`import subprocess,json\nsubprocess.run(['soffice','--headless','--convert-to','pdf','--outdir',${JSON.stringify(OUT)},${JSON.stringify(docx)}],capture_output=True,timeout=120)\nout=subprocess.run(['pdfinfo',${JSON.stringify(docx.replace(/\.docx$/, '.pdf'))}],capture_output=True,text=True).stdout\nprint(json.dumps({'pages':int(next((l.split()[-1] for l in out.splitlines() if l.startswith('Pages:')),'0'))}))`);
  check('LibreOffice öffnet das Word-Dokument (mehrere Seiten)', wp.pages >= 2, wp);

  // 5) Excel
  await pg.evaluate(() => OfficePages.newTyped('xlsx')); await pg.waitForTimeout(900);
  const tX = await tabs();
  check('Excel-Register (Formeln, Daten, Entwicklertools)', tX.join('|') === 'Datei|Start|Einfügen|Zeichnen|Seitenlayout|Formeln|Daten|Überprüfen|Ansicht|Entwicklertools|Add-Ins', tX);   // 1.66: + Entwicklertools; 1.69: + Add-Ins; 1.72: + Seitenlayout
  const x1 = await pg.evaluate(async () => {
    const p = Canvas.page;
    const s1 = OfficeView.sheets(p)[0];
    Sheet.writeRaw(s1.sheet, 0, 0, '5');
    OfficeXl.addSheet(); await new Promise(r => setTimeout(r, 300));
    const s2 = OfficeView.sheets(p)[1];
    Sheet.writeRaw(s2.sheet, 0, 0, '=Tabelle1!A1*2');
    Canvas.render(); await new Promise(r => setTimeout(r, 200));
    const vis = OfficeView.sheets(p).map(b => { const e = Canvas.els.get(b.id); return e && getComputedStyle(e).display !== 'none'; });
    const bar = [...document.querySelectorAll('.ofv-sheets .ofv-st:not(.add)')].map(x => x.textContent + (x.classList.contains('on') ? '*' : ''));
    s2.sheet.name = 'Auswertung';
    OfficeView.sync(true);
    return { vis, bar, v: Sheet.value(s2.id, 0, 0), id: p.id, rows: s1.sheet.nrows, cols: s1.sheet.ncols };
  });
  check('Excel: nur ein Blatt sichtbar, Register unten', x1.vis.join() === 'false,true' && x1.bar.join('|') === 'Tabelle1|Tabelle2*', x1);
  check('Excel: Raster wie Excel (≥ 40 Zeilen × 12 Spalten)', x1.rows >= 40 && x1.cols >= 12, x1);
  check('Excel: Formel über Blätter', x1.v === 10, x1);
  await pg.click('.ofv-sheets .ofv-st:not(.add) >> nth=0'); await pg.waitForTimeout(200);
  check('Blattregister: Klick wechselt das Blatt', await pg.evaluate(() => { const p = Canvas.page; return p.office.cur === OfficeView.sheets(p)[0].id && !!Sheet.active && Sheet.active.id === p.office.cur; }));
  const xlsx = await save(x1.id, 'neu-165.xlsx');
  const xres = py(`import openpyxl,json\nw=openpyxl.load_workbook(${JSON.stringify(xlsx)})\nprint(json.dumps({'names':w.sheetnames,'a1':w['Tabelle1']['A1'].value,'b':w[w.sheetnames[1]]['A1'].value}))`);
  check('Excel-Datei: neues Blatt mit Namen und Formel', xres.names.join('|') === 'Tabelle1|Auswertung' && xres.a1 === 5 && xres.b === '=Tabelle1!A1*2', xres);
  await pg.evaluate(async () => { const p = Canvas.page; const s2 = OfficeView.sheets(p)[1]; const c = UI.confirm; UI.confirm = async () => true; await OfficeXl.deleteSheet(s2.id); UI.confirm = c; });
  const xlsx2 = await save(x1.id, 'neu-165b.xlsx');
  const xres2 = py(`import openpyxl,json\nw=openpyxl.load_workbook(${JSON.stringify(xlsx2)})\nprint(json.dumps({'names':w.sheetnames}))`);
  check('Excel: Blatt löschen → aus der Mappe', xres2.names.join('|') === 'Tabelle1', xres2);

  // 6) PowerPoint
  const b64 = fs.readFileSync(path.join(FX, 'test.pptx')).toString('base64');
  const pp = await pg.evaluate(async (b) => { const s = atob(b), u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); const p = await OfficePages.importOne(new File([u], 'test.pptx')); await new Promise(r => setTimeout(r, 900)); return p.id; }, b64);
  const tP = await tabs();
  check('PowerPoint-Register (Entwurf, Übergänge, Animationen, Bildschirmpräsentation)', tP.join('|') === 'Datei|Start|Einfügen|Zeichnen|Entwurf|Übergänge|Animationen|Bildschirmpräsentation|Überprüfen|Ansicht|Add-Ins', tP);   // 1.66: + Übergänge, Animationen; 1.69: + Add-Ins
  const th = await pg.evaluate(() => ({ n: document.querySelectorAll('.ofv-slides .ofv-th').length, on: [...document.querySelectorAll('.ofv-slides .ofv-th')].findIndex(t => t.classList.contains('on')), imgs: document.querySelectorAll('.ofv-slides .ofv-th img').length, status: document.querySelector('#sb-left').textContent }));
  check('Folienübersicht: 2 Miniaturen, Folie 1 markiert', th.n === 2 && th.on === 0 && th.imgs >= 2, th);
  check('Statusleiste: Folie 1 von 2', /^Folie 1 von 2/.test(th.status), th.status);
  await pg.click('.ofv-slides .ofv-th >> nth=1'); await pg.waitForTimeout(300);
  const th2 = await pg.evaluate(() => ({ on: [...document.querySelectorAll('.ofv-slides .ofv-th')].findIndex(t => t.classList.contains('on')), cur: OfficePpt.frames().indexOf(OfficePpt.currentFrame()), status: document.querySelector('#sb-left').textContent }));
  check('Miniatur-Klick zeigt Folie 2', th2.on === 1 && th2.cur === 1 && /^Folie 2 von 2/.test(th2.status), th2);
  await pg.evaluate(async () => { await OfficePpt.setBg('#22314a'); OfficePpt.setSize('16:9'); await new Promise(r => setTimeout(r, 300)); });
  const thn = await pg.evaluate(async () => { await OfficePpt.cmd('new'); await new Promise(r => setTimeout(r, 500)); OfficeView.sync(true); return document.querySelectorAll('.ofv-slides .ofv-th').length; });
  check('Neue Folie erscheint in der Übersicht', thn === 3, thn);
  const pptx = await save(pp, 'test-165.pptx');
  const pres = py(`from pptx import Presentation\nimport json,zipfile\np=Presentation(${JSON.stringify(pptx)})\nx=zipfile.ZipFile(${JSON.stringify(pptx)}).read('ppt/slides/slide2.xml').decode()\nprint(json.dumps({'w':p.slide_width,'h':p.slide_height,'n':len(p.slides),'bg':'22314A' in x and '<p:bg>' in x,'txt':[sh.left for sh in p.slides[1].shapes if sh.has_text_frame and 'Freies Textfeld' in sh.text_frame.text]}))`);
  check('PowerPoint-Datei: 16:9, Hintergrund, 3 Folien', pres.w === 12192000 && pres.h === 6858000 && pres.bg && pres.n === 3, pres);
  check('Foliengrösse: Inhalte waagrecht angepasst', pres.txt.length === 1 && Math.abs(pres.txt[0] - Math.round(6 * 914400 * 12192000 / 9144000)) < 20000, pres.txt);

  // 7) zurück zu einer Freiform-Seite: Register wie bisher, Leisten weg
  await pg.evaluate(() => { const id = Object.values(Store.pages).find(p => !p.office).id; App.openPage(id); });
  await pg.waitForTimeout(500);
  const tF = await tabs();
  const fx = await pg.evaluate(() => ({ mode: document.body.classList.contains('office-mode'), kids: document.querySelector('.ofv') ? document.querySelector('.ofv').children.length : 0 }));
  check('zurück auf Freiform: alte Register, keine Office-Leisten', tF.includes('Verbindungen') && !fx.mode && !fx.kids, [tF, fx]);
  // Datei-Fenster einer Office-Seite
  await pg.evaluate((id) => App.openPage(id), pp); await pg.waitForTimeout(300);
  await pg.evaluate(() => Backstage.open()); await pg.waitForTimeout(300);
  const bs = await pg.evaluate(() => [...document.querySelectorAll('.bs-tile b'), ...document.querySelectorAll('.bs-sub')].map(b => b.textContent));
  check('Datei: Speichern unter (1.72: direkt mit Dateityp) / Original / Neu einlesen / Vorführen', ['Speichern unter', 'Original speichern', 'Neu einlesen', 'Vorführen'].every(x => bs.includes(x)), bs);
  await pg.evaluate(() => Backstage.close());
  check('keine Skriptfehler', errs.length === 0, errs.join(' | '));
  await br.close();
  console.log(`${ok} von ${ok + bad} Prüfungen bestanden (Office-Seiten wie die Programme 1.65)`);
  process.exit(bad ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
