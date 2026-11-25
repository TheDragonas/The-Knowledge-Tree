'use strict';
/* Browser-Test 1.73: Office-Konzept – gemeinsame Oberfläche wie Word/Excel/PowerPoint
 *   node tests/browser/office-173.js [url] [ordner mit Testdateien]   (Testdateien: python3 tests/browser/formate-fixtures.py <ordner>)
 *  - Excel-Start wie Excel (Schriftart/-grad, Einzug, Zellen = Einfügen/Löschen/Format, Bearbeiten), ohne Einstellungen,
 *    die nicht in die Datei gehen; Arbeitsmappenschutz; Designs (Farben, Schriftarten) in der Datei
 *  - Datei → Informationen: Eigenschaften (core.xml), Dokument prüfen, Kompatibilität
 *  - Schnellzugriff (Rechtsklick im Menüband), Ansichten in der Statusleiste
 *  - Kontextregister „Tabellenlayout“ (Word), Lesemodus; PowerPoint: Gliederung, Leseansicht, Laser/Stift */
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const { chromium } = require('playwright');
const url = process.argv[2] || 'http://127.0.0.1:8800/index.html';
const DIR = process.argv[3] || '/tmp/kt-formate';
const OUT = fs.mkdtempSync('/tmp/kt173-');
(async () => {
  if (!fs.existsSync(path.join(DIR, 'f.xlsx'))) { console.log('Testdateien fehlen – zuerst: python3 tests/browser/formate-fixtures.py ' + DIR); process.exit(2); }
  const br = await chromium.launch();
  let ok = 0, bad = 0;
  const check = (n, c, info) => { if (c) ok++; else { bad++; console.log('FALSCH', n, info === undefined ? '' : typeof info === 'string' ? info : JSON.stringify(info)); } };
  const pg = await br.newPage({ viewport: { width: 1500, height: 900 } });
  const errs = [];
  pg.on('pageerror', e => errs.push(e.message));
  pg.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push(m.text()); });
  await pg.goto(url);
  await pg.waitForFunction(() => typeof OfficeUI !== 'undefined' && Store.loaded && Canvas.page, null, { timeout: 20000 });
  await pg.waitForTimeout(800);
  const imp = (f) => pg.evaluate(async ([b, name]) => {
    const s = atob(b), u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i);
    const p = await OfficePages.importOne(new File([u], name)); await new Promise(r => setTimeout(r, 1000));
    document.querySelectorAll('.toast').forEach(t => t.remove());
    return p.id;
  }, [fs.readFileSync(path.join(DIR, f)).toString('base64'), f]);
  const save = async (name) => {
    const b64 = await pg.evaluate(async () => { const blob = (await OfficePages.current(Canvas.page)).blob; const u = new Uint8Array(await blob.arrayBuffer()); let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(s); });
    const f = path.join(OUT, name); fs.writeFileSync(f, Buffer.from(b64, 'base64')); return f;
  };
  const py = (code, ...args) => { try { return JSON.parse(execFileSync('python3', ['-c', code, ...args], { encoding: 'utf8' })); } catch (e) { return { err: String(e.stderr || e.message).slice(-600) }; } };
  const answer = (vals) => pg.evaluate((vals) => { window._ans = vals.slice(); const P = UI.prompt.bind(UI); UI.prompt = async (...a) => window._ans.length ? window._ans.shift() : P(...a); }, vals);
  const groups = () => pg.evaluate(() => [...document.querySelectorAll('#panel .rgroup > .rg-label')].map(x => x.textContent));
  const views = () => pg.evaluate(() => [...document.querySelectorAll('#sb-views .sb-view')].map(b => b.title.split(/[:(]/)[0].trim() + (b.classList.contains('on') ? '*' : '')));

  /* ============================================================ Excel */
  await imp('f.xlsx');
  await pg.evaluate(() => Ribbon.show('start')); await pg.waitForTimeout(200);
  const gx = await groups();
  check('Excel-Start wie Excel: Gruppen', gx.join('|') === 'Zwischenablage|Schriftart|Ausrichtung|Zahl|Formatvorlagen|Zellen|Bearbeiten', gx);
  const sx = await pg.evaluate(() => { const t = document.getElementById('panel').textContent; return { band: /Gebänderte Zeilen/.test(t), head: /Kopfzeile/.test(t), font: document.querySelector('#panel [data-combo="font"]').value, umb: /Umbenennen/.test(t) }; });
  check('Excel-Start: Schriftart der Zelle, keine Tabellen-Optionen, die nicht in die Datei gehen', sx.font === 'Calibri' && !sx.band && !sx.head && !sx.umb, sx);
  const sid = await pg.evaluate(() => OfficeView.curSheet(Canvas.page));
  await pg.evaluate((id) => { Sheet.activate(id, 0, 3); Cmd.run('font', 'Arial'); Cmd.run('size', 14); Cmd.run('grow'); Cmd.run('xlIndent', 1); }, sid);
  const fx = await pg.evaluate((id) => Sheet.data(id).cells.A4.f, sid);
  const nx = await pg.evaluate(() => FONT_SIZES.find(s => s > 14));
  check('Schriftart, Schriftgrad (14 → nächstgrösser), Einzug für die Zelle', fx && fx.fn === 'Arial' && fx.fs === nx && fx.in === 1, fx);
  check('Zellen: Einfügen/Löschen/Format als Menüs, Sortieren und Filtern', await pg.evaluate(() => { OfficeXT.insertMenu(document.body); const a = document.querySelectorAll('.popup .mi, .pop .mi').length; UI.closePopup(); OfficeXT.sortMenu(document.body); const b = [...document.querySelectorAll('.mi-label')].map(x => x.textContent); UI.closePopup(); return a >= 5 && b.includes('Benutzerdefiniertes Sortieren …') && b.includes('Filtern'); }));
  check('Statusleiste Excel: Normal / Umbruchvorschau', JSON.stringify(await views()) === JSON.stringify(['Normal*', 'Umbruchvorschau']), await views());
  // Arbeitsmappe schützen
  await answer(['']);
  await pg.evaluate(() => OfficeXT.protectBook()); await pg.waitForTimeout(200);
  const wb = await pg.evaluate(() => { const n0 = OfficeView.sheets(Canvas.page).length; OfficeXl.addSheet(); return { on: OfficeXT.wbOn(), same: OfficeView.sheets(Canvas.page).length === n0 }; });
  check('Arbeitsmappe geschützt: kein neues Blatt', wb.on && wb.same, wb);
  // Eigenschaften
  await pg.evaluate(() => OfficeUI.setProps(Canvas.page, { title: 'Monitore 2026', subject: 'Vergleich', keywords: 'OLED; Test' }));
  const xf = await save('mappe.xlsx');
  const xr = py(`import openpyxl,json,sys
wb=openpyxl.load_workbook(sys.argv[1]); ws=wb.worksheets[0]
print(json.dumps({'lock':bool(wb.security and wb.security.lockStructure),'title':wb.properties.title,'subj':wb.properties.subject,'kw':wb.properties.keywords,'a4':[ws['A4'].font.name, ws['A4'].font.sz, ws['A4'].alignment.indent]}))`, xf);
  check('xlsx: Arbeitsmappenschutz, Eigenschaften, Schrift/Einzug der Zelle', xr.lock === true && xr.title === 'Monitore 2026' && xr.subj === 'Vergleich' && xr.kw === 'OLED; Test' && xr.a4 && xr.a4[0] === 'Arial' && xr.a4[1] === nx && xr.a4[2] === 1, xr);
  // Designs: Farben und Schriftarten → in der Datei, Seite neu eingelesen
  await pg.evaluate(async () => { await OfficeUI.setTheme('c', 'Grün'); await new Promise(r => setTimeout(r, 1200)); await OfficeUI.setTheme('f', 'Georgia'); await new Promise(r => setTimeout(r, 1200)); });
  const tn = await pg.evaluate(() => ({ n: Canvas.page.office.themeName, wb: OfficeXT.wbOn(), t: (Canvas.page.office.props || {}).title }));
  check('Design Grün / Georgia übernommen, Schutz und Titel bleiben (neu eingelesen)', tn.n && tn.n.c === 'Grün' && tn.n.f === 'Georgia' && tn.wb && tn.t === 'Monitore 2026', tn);
  const tf = await save('design.xlsx');
  const tr = py(`import zipfile,json,sys,re
z=zipfile.ZipFile(sys.argv[1]); t=[z.read(n).decode() for n in z.namelist() if re.match(r'xl/theme/theme\\d+\\.xml',n)][0]
print(json.dumps({'a1':'549E39' in t,'name':'name="Grün"' in t,'font':'typeface="Georgia"' in t}))`, tf);
  check('xlsx: Designfarben und -schriften im Theme', tr.a1 && tr.name && tr.font, tr);
  // Dokument prüfen, Kompatibilität
  await pg.evaluate(() => { const b = OfficeView.sheets(Canvas.page)[0]; b.sheet.notes = { B2: { t: 'x', a: 'y' } }; });
  const fi = await pg.evaluate(() => OfficeUI.findings(Canvas.page).map(f => f.k + ':' + f.n));
  check('Dokument prüfen: Eigenschaften und Notizen gefunden', fi.some(x => /^props:[3-9]/.test(x)) && fi.includes('xlNotes:1'), fi);
  await pg.evaluate(() => { OfficeUI.fix(Canvas.page, 'xlNotes'); OfficeUI.fix(Canvas.page, 'props'); });
  check('Dokument prüfen: entfernt', await pg.evaluate(() => OfficeUI.findings(Canvas.page).filter(f => f.n && (f.k === 'props' || f.k === 'xlNotes')).length === 0));
  const cr = await pg.evaluate(() => OfficeUI.compatRows(Canvas.page, 'xls').map(r => r[0] + '=' + r[1]));
  check('Kompatibilität .xls: Formeln teilweise, verbundene Zellen bleiben, Schutz geht verloren', cr.includes('Formeln=teils') && cr.includes('Verbundene Zellen=true') && cr.some(x => /Arbeitsmappenschutz=false/.test(x)), cr);
  // Datei → Informationen zeigt alles
  await pg.evaluate(() => Backstage.open('info')); await pg.waitForTimeout(300);
  const bs = await pg.evaluate(() => [...document.querySelectorAll('.bs-section h2, .bs-sec h2, .bs-main h2, .bs-main h3')].map(h => h.textContent).join('|'));
  check('Informationen: Eigenschaften, Arbeitsmappe schützen, prüfen', /Eigenschaften/.test(bs) && /Arbeitsmappe schützen/.test(bs) && /Arbeitsmappe prüfen/.test(bs), bs);
  await pg.evaluate(() => Backstage.close());

  /* ============================================================ Schnellzugriff */
  await pg.evaluate(() => { Store.ui.qat = []; OfficeUI.qat(); Ribbon.show('start'); });
  await pg.waitForTimeout(200);
  await pg.evaluate(() => { const b = document.querySelector('#panel [data-cmd="xlFmtDlg"]'); const r = b.getBoundingClientRect(); b.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: r.x + 5, clientY: r.y + 5 })); });
  await pg.waitForTimeout(150);
  await pg.evaluate(() => { const m = [...document.querySelectorAll('.mi')].find(x => /Schnellzugriff hinzufügen/.test(x.textContent)); m.click(); });
  const q = await pg.evaluate(() => ({ n: document.querySelectorAll('#qat-own .qat').length, svg: !!document.querySelector('#qat-own .qat svg'), st: Store.ui.qat }));
  check('Schnellzugriff: Rechtsklick im Menüband fügt den Knopf oben links ein (mit Symbol)', q.n === 1 && q.svg && q.st[0].cmd === 'xlFmtDlg', q);
  await pg.evaluate(() => OfficeUI.qatRemove(0));
  check('Schnellzugriff: entfernen', await pg.evaluate(() => document.querySelectorAll('#qat-own .qat').length === 0));
  check('Schnellzugriff: gesäuberte SVG (kein Skript)', await pg.evaluate(() => !/onload|script/i.test(OfficeUI.cleanSvg('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><script>x</script><path d="M0 0"/></svg>'))));

  /* ============================================================ Word: Tabellenlayout, Lesemodus */
  await pg.evaluate(async () => { await OfficePages.newTyped('docx'); await new Promise(r => setTimeout(r, 900)); });
  check('Statusleiste Word: Lesemodus / Drucklayout', JSON.stringify(await views()) === JSON.stringify(['Lesemodus', 'Drucklayout*', 'Seitenansicht']), await views());
  await pg.evaluate(() => { const b = Canvas.page.boxes.find(x => x.ox && x.ox.k === 'w'); Canvas.focusText(b.id, true); const t = Canvas.textEl(b.id); t.innerHTML = '<div>Liste</div><table><tbody><tr><td>Name</td><td>Wert</td></tr><tr><td>Beta</td><td>2</td></tr><tr><td>Alpha</td><td>1</td></tr></tbody></table><div><br></div>'; t.dispatchEvent(new Event('input', { bubbles: true })); const td = t.querySelectorAll('td')[2]; const rg = document.createRange(); rg.selectNodeContents(td); rg.collapse(true); getSelection().removeAllRanges(); getSelection().addRange(rg); });
  await pg.waitForTimeout(400);
  const tabs = await pg.evaluate(() => [...document.querySelectorAll('#tabs .tab')].filter(t => !t.hidden).map(t => t.textContent));
  check('Kontextregister „Tabellenlayout“ nur in der Tabelle', tabs.includes('Tabellenlayout'), tabs);
  await pg.evaluate(() => { Cmd.run('tbl', 'head'); });
  await pg.evaluate(() => { const t = Canvas.textEl(Canvas.editing); const td = t.querySelectorAll('tr')[1].children[0]; const rg = document.createRange(); rg.selectNodeContents(td); rg.collapse(true); getSelection().removeAllRanges(); getSelection().addRange(rg); Cmd.run('tbl', 'sortAsc'); });
  await pg.evaluate(() => { Cmd.run('tbl', 'rowBelow'); Cmd.run('tbl', 'colRight'); });
  const tb = await pg.evaluate(() => { const t = Canvas.textEl(Canvas.editing), tbl = t.querySelector('table'); return { rows: tbl.rows.length, cols: tbl.rows[0].children.length, th: tbl.rows[0].children[0].tagName, first: tbl.rows[1].children[0].textContent }; });
  check('Tabellenlayout: Kopfzeile, sortiert (Alpha zuerst), Zeile und Spalte eingefügt', tb.rows === 4 && tb.cols === 3 && tb.th === 'TH' && tb.first === 'Alpha', tb);
  await pg.evaluate(() => { const t = Canvas.textEl(Canvas.editing); const td = t.querySelectorAll('tr')[3].children[0]; const rg = document.createRange(); rg.selectNodeContents(td); rg.collapse(true); getSelection().removeAllRanges(); getSelection().addRange(rg); Cmd.run('tbl', 'merge'); });
  check('Tabellenlayout: Zellen verbinden (colspan 2)', await pg.evaluate(() => Canvas.textEl(Canvas.editing).querySelectorAll('tr')[3].children[0].colSpan === 2));
  await pg.evaluate(() => Canvas.stopEditing()); await pg.waitForTimeout(300);
  const wf = await save('tabelle.docx');
  const wr = py(`import docx,json,sys
d=docx.Document(sys.argv[1]); t=d.tables[0]
print(json.dumps({'rows':len(t.rows),'first':t.rows[1].cells[0].text,'head':t.rows[0].cells[0].text}))`, wf);
  check('docx: Tabelle mit 4 Zeilen, sortiert', wr.rows === 4 && wr.first === 'Alpha' && wr.head === 'Name', wr);
  await pg.evaluate(() => Cmd.run('wRead')); await pg.waitForTimeout(300);
  const rd = await pg.evaluate(() => { const o = document.querySelector('.ui-read'); return o ? { txt: /Alpha/.test(o.textContent) && /Liste/.test(o.textContent), tbl: !!o.querySelector('table') } : null; });
  check('Lesemodus: Text und Tabelle in einer Spalte', rd && rd.txt && rd.tbl, rd);
  await pg.keyboard.press('Escape'); await pg.waitForTimeout(150);
  check('Lesemodus: Esc schliesst', await pg.evaluate(() => !document.querySelector('.ui-read')));

  /* ============================================================ PowerPoint: Gliederung, Leseansicht, Laser/Stift */
  await imp('test.pptx');
  const pv = await views();
  check('Statusleiste PowerPoint: fünf Ansichten', pv.length === 5 && /Foliensortierung/.test(pv.join()) && /Leseansicht/.test(pv.join()), pv);
  await pg.evaluate(() => OfficeUI.outline()); await pg.waitForTimeout(600);
  const ol = await pg.evaluate(() => [...document.querySelectorAll('.ui-oslide .ui-otitle')].map(x => x.textContent));
  check('Gliederungsansicht: Titel aller Folien', ol.join('|') === 'Erste Folie|Zweite Folie', ol);
  await pg.evaluate(() => OfficeUI.outline());
  await pg.evaluate(() => Show.start('begin', { window: true })); await pg.waitForTimeout(400);
  const sh = await pg.evaluate(() => { const w = !!document.querySelector('.kt-show.windowed'); Show.setTool('pen'); const pen = document.querySelector('.kt-show').classList.contains('tool-pen'); const i0 = Show.i; document.querySelector('.sh-main').click(); const stay = Show.i === i0; Show.setTool('laser'); const las = !document.querySelector('.sh-laser').hidden; Show.erase(); Show.end(); return { w, pen, stay, las, fs: !!document.fullscreenElement }; });
  check('Leseansicht im Fenster, Stift (Klick blättert nicht), Laserpointer', sh.w && sh.pen && sh.stay && sh.las && !sh.fs, sh);

  if (errs.length) console.log('Fehler im Browser:', errs.slice(0, 5));
  check('keine Fehler im Browser', !errs.length, errs);
  console.log(`office-173: ${ok} ok, ${bad} falsch`);
  await br.close();
  process.exit(bad ? 1 : 0);
})();
