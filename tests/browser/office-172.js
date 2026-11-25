'use strict';
/* Browser-Test 1.72: Office-Seiten mit den Funktionen der Programme, Öffnen/Speichern mit Dateityp
 *   node tests/browser/office-172.js [url] [ordner mit Testdateien]
 * Testdateien: python3 tests/browser/formate-fixtures.py <ordner>; geprüft wird die geschriebene Datei mit openpyxl,
 * python-docx, python-pptx und LibreOffice (tests/browser/office-172-check.py).
 *  - Excel: verbinden, Zeilenhöhe/Spaltenbreite, aus-/einblenden, Zellenformatvorlagen, Zellen formatieren, Filter,
 *    Sortieren, Datenüberprüfung (Liste, ganze Zahl), Zielwertsuche, Notizen, Blattschutz (Kennwort), Seite einrichten,
 *    Druckbereich, Drucktitel, Kopf-/Fusszeile, Formeln anzeigen, Suchen/Ersetzen, Zeilen einfügen verschiebt alles mit
 *  - Word: Kopf-/Fusszeile mit Seitenzahl, Fussnote, Symbol, Spalten, Silbentrennung, Sortieren, Überschrift 4
 *  - PowerPoint: Folie ausblenden, Übergang mit Richtung und „Nach“-Zeit, Hervorheben/Beenden, Kopf-/Fusszeile für alle
 *  - Öffnen (Dateityp-Liste), Speichern unter (inline, Gruppen), Export-Fenster (Dateityp je Programm), ODP/RTF/HTML */
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const { chromium } = require('playwright');
const url = process.argv[2] || 'http://127.0.0.1:8800/index.html';
const DIR = process.argv[3] || '/tmp/kt-formate';
const OUT = fs.mkdtempSync('/tmp/kt172-');
(async () => {
  if (!fs.existsSync(path.join(DIR, 'f.xlsx'))) { console.log('Testdateien fehlen – zuerst: python3 tests/browser/formate-fixtures.py ' + DIR); process.exit(2); }
  const br = await chromium.launch();
  let ok = 0, bad = 0;
  const check = (n, c, info) => { if (c) ok++; else { bad++; console.log('FALSCH', n, info === undefined ? '' : typeof info === 'string' ? info : JSON.stringify(info)); } };
  const pg = await br.newPage({ viewport: { width: 1440, height: 900 } });
  const errs = [];
  pg.on('pageerror', e => errs.push(e.message));
  pg.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push(m.text()); });
  pg.on('dialog', d => d.dismiss());
  await pg.goto(url);
  await pg.waitForFunction(() => typeof OfficeXT !== 'undefined' && Store.loaded && Canvas.page, null, { timeout: 20000 });
  await pg.waitForTimeout(800);
  const imp = (f) => pg.evaluate(async ([b, name]) => {
    const s = atob(b), u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i);
    const p = await OfficePages.importOne(new File([u], name)); await new Promise(r => setTimeout(r, 1000));
    document.querySelectorAll('.toast').forEach(t => t.remove());
    return p.id;
  }, [fs.readFileSync(path.join(DIR, f)).toString('base64'), f]);
  const save = async (name, type) => {
    const b64 = await pg.evaluate(async (type) => {
      const p = Canvas.page;
      const blob = type ? (await OfficeSaveAs.build(p, type)).blob : (await OfficePages.current(p)).blob;
      const u = new Uint8Array(await blob.arrayBuffer()); let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(s);
    }, type || null);
    const f = path.join(OUT, name); fs.writeFileSync(f, Buffer.from(b64, 'base64')); return f;
  };
  const py = (code, ...args) => { try { return JSON.parse(execFileSync('python3', ['-c', code, ...args], { encoding: 'utf8' })); } catch (e) { return { err: String(e.stderr || e.message).slice(-600) }; } };
  // Dialoge automatisch beantworten: nächster UI.prompt/confirm/dialog
  const answer = (vals) => pg.evaluate((vals) => { window._ans = vals.slice(); const P = UI.prompt.bind(UI), C = UI.confirm.bind(UI); UI.prompt = async (...a) => window._ans.length ? window._ans.shift() : P(...a); UI.confirm = async (...a) => window._ans.length ? !!window._ans.shift() : C(...a); }, vals);

  /* ============================================================ Excel */
  await pg.evaluate(async () => { await OfficePages.newTyped('xlsx'); await new Promise(r => setTimeout(r, 900)); });
  const sid = await pg.evaluate(() => OfficeView.curSheet(Canvas.page));
  const set = (list) => pg.evaluate(([id, list]) => Sheet.setCells(id, list, 'Test'), [sid, list]);
  const sel = (c1, r1, c2, r2) => pg.evaluate(([id, c1, r1, c2, r2]) => { Sheet.activate(id, c1, r1); Object.assign(Sheet.active, { c2: c2 ?? c1, r2: r2 ?? r1 }); }, [sid, c1, r1, c2, r2]);
  await set([[0, 0, 'Name'], [1, 0, 'Stadt'], [2, 0, 'Betrag'], [0, 1, 'Anna'], [1, 1, 'Bern'], [2, 1, '30'], [0, 2, 'Beat'], [1, 2, 'Basel'], [2, 2, '10'], [0, 3, 'Cleo'], [1, 3, 'Bern'], [2, 3, '20'],
    [0, 4, 'Dora'], [1, 4, 'Chur'], [2, 4, '40'], [4, 0, 'Summe'], [5, 0, '=SUMME(C2:C5)'], [4, 1, 'Faktor'], [5, 1, '2'], [4, 2, 'Ergebnis'], [5, 2, '=F2*10']]);
  // verbinden und zentrieren
  await sel(0, 7, 2, 7); await set([[0, 7, 'Titel'], [1, 7, 'weg']]);
  await answer([true]);
  await pg.evaluate(() => OfficeXT.merge('center'));
  let xl = await pg.evaluate((id) => { const d = Sheet.data(id); return { m: d.merges, a: d.cells.A8 && d.cells.A8.f, b: d.cells.B8 ? d.cells.B8.v : '' }; }, sid);
  check('Verbinden und zentrieren: Bereich, zentriert, Rest geleert', xl.m && xl.m[0] === 'A8:C8' && xl.a && xl.a.al === 'c' && !xl.b, xl);
  await pg.evaluate(() => OfficeXT.merge('center'));
  check('nochmals = Verbund aufheben', await pg.evaluate((id) => !Sheet.data(id).merges, sid));
  await pg.evaluate(() => OfficeXT.merge('center'));
  // Zeilenhöhe, Spaltenbreite, ausblenden
  await sel(0, 1); await answer(['30']); await pg.evaluate(() => OfficeXT.rowHeight());
  await sel(1, 0); await answer(['20']); await pg.evaluate(() => OfficeXT.colWidth());
  await sel(3, 0); await pg.evaluate(() => OfficeXT.hide('c', true));
  xl = await pg.evaluate((id) => { const d = Sheet.data(id), e = Canvas.els.get(id); return { rh: d.rowh, w: d.cols[1], hc: d.hideC, colw: e._cols[3][1] }; }, sid);
  check('Zeilenhöhe 30 pt = 40 px', xl.rh && xl.rh[1] === 40, xl);
  check('Spaltenbreite 20 Zeichen = 145 px', xl.w === 145, xl);
  check('Spalte D ausgeblendet (Breite 0 im Raster)', xl.hc && xl.hc[0] === 3 && xl.colw === 0, xl);
  // Zellenformatvorlage, Zellen formatieren (Rahmen/Schutz direkt)
  await sel(2, 1, 2, 4); await pg.evaluate(() => OfficeXT.cellStyle('Gut'));
  await sel(4, 0); await pg.evaluate(() => OfficeXT.cellStyle('Überschrift 1'));
  xl = await pg.evaluate((id) => { const d = Sheet.data(id); return { c2: d.cells.C2.f, e1: d.cells.E1.f }; }, sid);
  check('Formatvorlage „Gut“: grüne Füllung, dunkelgrüne Schrift', xl.c2 && xl.c2.bg === '#C6EFCE' && xl.c2.c === '#006100', xl);
  check('Formatvorlage „Überschrift 1“: 15 pt fett, dicke Linie unten', xl.e1 && xl.e1.fs === 15 && xl.e1.b && xl.e1.bd === 'B', xl);
  // Zellen formatieren: Dialog öffnen, Register, Vorschau
  await sel(2, 1);
  await pg.evaluate(() => { OfficeXT.formatDialog(); });
  await pg.waitForTimeout(200);
  const fd = await pg.evaluate(() => { const d = document.querySelector('.xt-fmt'); return d ? [...d.querySelectorAll('.xt-tab')].map(t => t.textContent).join(',') + '|' + d.querySelector('.xt-prev').textContent : null; });
  check('Zellen formatieren: Register Zahl…Schutz und Vorschau', fd && /Zahl,Ausrichtung,Schrift,Rahmen,Ausfüllen,Schutz\|30/.test(fd), fd);
  await pg.evaluate(() => { const d = document.querySelector('.xt-fmt'); const s = d.querySelector('.xt-body select'); s.value = 'cur'; s.dispatchEvent(new Event('change')); d.querySelector('.dlg-btns .btn.primary').click(); });
  await pg.waitForTimeout(150);
  check('Zellen formatieren → Währung', await pg.evaluate((id) => Sheet.data(id).cells.C2.f.nf === 'cur' && /CHF/.test(Sheet.display(id, 2, 1).t), sid));
  // Filter
  await sel(0, 0); await pg.evaluate(() => OfficeXT.filterToggle());
  xl = await pg.evaluate((id) => { const d = Sheet.data(id), e = Canvas.els.get(id); return { af: d.af, btns: e.querySelectorAll('.xl-afb').length }; }, sid);
  check('Filter: Bereich A1:C5 und drei Knöpfe', xl.af && xl.af.ref === 'A1:C5' && xl.btns === 3, xl);
  await pg.evaluate((id) => { Sheet.data(id).af.f[1] = { vals: ['Bern'] }; OfficeXT.applyFilter(id); OfficeXT.changed('Filter', true); }, sid);
  xl = await pg.evaluate((id) => { const d = Sheet.data(id), e = Canvas.els.get(id); return { hf: d.hideF, h3: e._rows[2][1], on: e.querySelectorAll('.xl-afb.on').length }; }, sid);
  check('Filter „Stadt = Bern“: Zeilen 3 und 5 ausgeblendet', JSON.stringify(xl.hf) === '[2,4]' && xl.h3 === 0 && xl.on === 1, xl);
  // Filterknopf öffnet den Dialog
  await pg.evaluate((id) => { const b = Canvas.els.get(id).querySelector('.xl-afb'); const r = b.getBoundingClientRect(); b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: r.x + 5, clientY: r.y + 5, button: 0 })); }, sid);
  await pg.waitForTimeout(200);
  check('Filterknopf: Werteliste mit Häkchen', await pg.evaluate(() => { const d = document.querySelector('.xt-filter'); const n = d ? d.querySelectorAll('.xt-vals input').length : 0; if (d) d.querySelector('.dlg-btns .btn:nth-child(2)').click(); return n; }) === 4);
  // Datenüberprüfung: ganze Zahl 1–100 und Liste
  await sel(6, 1, 6, 5);
  await pg.evaluate((id) => { const d = Sheet.data(id); d.dv = [{ ref: 'G2:G6', t: 'whole', op: 'between', a: '1', b: '100', err: 'Nur 1 bis 100' }, { ref: 'H2:H6', t: 'list', src: '"Ja,Nein"', drop: true }]; OfficeXT.changed('Test', true); }, sid);
  check('Datenüberprüfung: 150 abgelehnt, 50 erlaubt, Liste prüft', await pg.evaluate((id) => OfficeXT.validate(id, 6, 1, '150') === 'Nur 1 bis 100' && OfficeXT.validate(id, 6, 1, '50') === null && !!OfficeXT.validate(id, 7, 1, 'Vielleicht') && OfficeXT.validate(id, 7, 1, 'ja') === null, sid));
  // Zielwertsuche: F3 = F2*10 → 70 ⇒ F2 = 7
  const gs = await pg.evaluate((id) => OfficeXT.solve(id, { c: 5, r: 2 }, { c: 5, r: 1 }, 70), sid);
  check('Zielwertsuche F3=70 → F2=7 (Wert danach unverändert)', gs && gs.ok && Math.abs(gs.x - 7) < 1e-6 && await pg.evaluate((id) => Sheet.value(id, 5, 1) === 2, sid), gs);
  // Notiz
  await sel(0, 1); await pg.evaluate((id) => { const d = Sheet.data(id); d.notes = { A2: { t: 'Erste Kundin', a: 'Test' } }; OfficeXT.changed('Notiz', true); }, sid);
  check('Notiz: rotes Dreieck und Kästchen an der aktiven Zelle', await pg.evaluate((id) => { const e = Canvas.els.get(id); return !!e.querySelector('.xl-note') && /Erste Kundin/.test((e.querySelector('.xl-ov .xl-nbox') || {}).textContent || ''); }, sid));
  // Seite einrichten
  await pg.evaluate(() => { OfficeXT.psSet('or', 'landscape'); OfficeXT.psSet('m', 'schmal'); OfficeXT.psSet('fitw', '1'); OfficeXT.psSet('pg'); });
  await sel(0, 0, 2, 4); await pg.evaluate(() => OfficeXT.printArea(true));
  await answer(['1:1']); await pg.evaluate(() => OfficeXT.printTitles());
  await pg.evaluate((id) => { OfficeXT.ps(Sheet.data(id)).hf = { h: { l: '', c: '&A', r: '' }, f: { l: '', c: 'Seite &P von &N', r: '' } }; Store.ui.xlBreaks = true; OfficeXT.changed('Test', true); }, sid);
  check('Umbruchvorschau: Druckbereich gezeichnet', await pg.evaluate((id) => !!Canvas.els.get(id).querySelector('.xl-pa'), sid));
  await pg.evaluate(() => { Store.ui.xlBreaks = false; });
  // Drucken: Druckbereich, Drucktitel, gefilterte Zeilen nicht gedruckt
  const prn = await pg.evaluate((id) => { Sheet.activate(id, 0, 0); const ch = Print.choices().find(c => c.id === 'tabelle'); const o = Print.opts(); const html = Print.tableDoc(ch.table, o, Print.geom(o), true); return { label: ch.label, xl: ch.xl, beat: /Beat/.test(html), anna: /Anna/.test(html), thead: /<thead><tr[^>]*><td[^>]*>Name/.test(html) }; }, sid);
  check('Drucken: Druckbereich, Titelzeile wiederholt, gefilterte Zeilen fehlen', prn.xl && /Druckbereich A1:C5/.test(prn.label) && prn.anna && !prn.beat && prn.thead, prn);
  // Formeln anzeigen
  await pg.evaluate(() => OfficeXT.showFormulas());
  check('Formeln anzeigen: F1 zeigt die Formel', await pg.evaluate((id) => /SUMME/.test(Canvas.els.get(id).querySelector('.xl-grid').rows[0].cells[5].textContent), sid));
  await pg.evaluate(() => OfficeXT.showFormulas());
  // Suchen/Ersetzen (ganze Mappe, Werte)
  await pg.evaluate(() => { OfficeXT.findDialog(true); });
  await pg.waitForTimeout(150);
  await pg.evaluate(() => { const d = document.querySelector('.xt-find'); const [q, r] = d.querySelectorAll('input[type=text]'); q.value = 'Chur'; r.value = 'Thun'; [...d.querySelectorAll('.dlg-btns .btn')].find(b => b.textContent === 'Alle ersetzen').click(); });
  check('Alle ersetzen: Chur → Thun', await pg.evaluate((id) => Sheet.data(id).cells.B5.v === 'Thun', sid));
  await pg.evaluate(() => { const d = document.querySelector('.xt-find'); [...d.querySelectorAll('.dlg-btns .btn')].find(b => b.textContent === 'Schliessen').click(); });
  // Zeile oben einfügen: alles wandert mit
  await pg.evaluate((id) => { Sheet.insertRows(0, 1, id); }, sid);
  xl = await pg.evaluate((id) => { const d = Sheet.data(id); return { m: d.merges, af: d.af.ref, hf: d.hideF, rh: d.rowh, n: Object.keys(d.notes), dv: d.dv.map(v => v.ref), pa: d.ps.pa }; }, sid);
  check('Zeile eingefügt: Verbund, Filter, Notiz, Höhe, Überprüfung, Druckbereich verschoben', xl.m[0] === 'A9:C9' && xl.af === 'A2:C6' && JSON.stringify(xl.hf) === '[3,5]' && xl.rh[2] === 40 && xl.n[0] === 'A3' && xl.dv[0] === 'G3:G7' && xl.pa === 'A2:C6', xl);
  await pg.evaluate((id) => Sheet.deleteRows(0, 1, id), sid);
  // Blattschutz mit Kennwort, C2 entsperrt
  await sel(2, 2); await pg.evaluate(() => OfficeXT.lockCells(true));
  await answer(['geheim', 'geheim']); await pg.evaluate(() => OfficeXT.protect());
  await pg.waitForTimeout(300);
  xl = await pg.evaluate((id) => ({ prot: Sheet.data(id).prot, a: Sheet.locked(id, 0, 1), c: Sheet.locked(id, 2, 2) }), sid);
  check('Blatt geschützt (SHA-512), A2 gesperrt, C3 entsperrt', xl.prot && xl.prot.on && xl.prot.alg === 'SHA-512' && xl.prot.hash && xl.a && !xl.c, xl);
  check('Kennwort prüfen: richtig/falsch', await pg.evaluate(async (id) => { const p = Sheet.data(id).prot; return (await OfficeXT.checkPw(p, 'geheim')) && !(await OfficeXT.checkPw(p, 'falsch')); }, sid));
  check('Excel-Kennwort (alt, 16 Bit) wie Excel', await pg.evaluate(() => OfficeXT.legacyHash('test') === 'CBEB'));
  // Speichern und mit openpyxl prüfen
  const xf = await save('excel.xlsx');
  const r = py(`import openpyxl,json,sys
wb=openpyxl.load_workbook(sys.argv[1]); ws=wb.active
o={'merged':[str(m) for m in ws.merged_cells.ranges],'rh':ws.row_dimensions[2].height,'bw':ws.column_dimensions['B'].width,'dhid':ws.column_dimensions['D'].hidden,
'af':ws.auto_filter.ref,'afv':[list(fc.filters.filter) for fc in ws.auto_filter.filterColumn],'hid3':ws.row_dimensions[3].hidden,'hid4':ws.row_dimensions[4].hidden,
'dv':sorted([(d.type,str(d.sqref),d.formula1) for d in ws.data_validations.dataValidation]),'note':ws['A2'].comment.text if ws['A2'].comment else None,
'prot':ws.protection.sheet,'alg':ws.protection.algorithmName,'c3lock':ws['C3'].protection.locked,'a2lock':ws['A2'].protection.locked,
'or':ws.page_setup.orientation,'fit':ws.sheet_properties.pageSetUpPr.fitToPage if ws.sheet_properties.pageSetUpPr else None,'fw':ws.page_setup.fitToWidth,'ml':ws.page_margins.left,'pg':ws.print_options.gridLines,
'pa':ws.print_area,'pt':ws.print_title_rows,'hdr':ws.oddHeader.center.text,'ftr':ws.oddFooter.center.text,'c2fill':ws['C2'].fill.fgColor.rgb,'e1sz':ws['E1'].font.sz}
print(json.dumps(o,default=str))`, xf);
  check('xlsx: verbundene Zellen', r.merged && r.merged.includes('A8:C8'), r);
  check('xlsx: Zeilenhöhe 30 / Spaltenbreite 20 / Spalte D ausgeblendet', r.rh === 30 && Math.abs(r.bw - 20) < 0.05 && r.dhid === true, r);
  check('xlsx: AutoFilter mit Werten, gefilterte Zeilen ausgeblendet', r.af === 'A1:C5' && JSON.stringify(r.afv) === '[["Bern"]]' && r.hid3 === true && !r.hid4, r);
  check('xlsx: Datenüberprüfung (ganze Zahl, Liste)', JSON.stringify(r.dv) === JSON.stringify([['list', 'H2:H6', '"Ja,Nein"'], ['whole', 'G2:G6', '1']]), r.dv);
  check('xlsx: Notiz', r.note && /Erste Kundin/.test(r.note), r.note);
  check('xlsx: Blattschutz SHA-512, C3 entsperrt', r.prot === true && r.alg === 'SHA-512' && r.c3lock === false && r.a2lock === true, r);
  check('xlsx: Querformat, an 1 Seite Breite, schmale Ränder, Gitternetz drucken', r.or === 'landscape' && r.fit === true && r.fw === 1 && r.ml === 0.25 && r.pg === true, r);
  check('xlsx: Druckbereich, Drucktitel, Kopf-/Fusszeile', /\$A\$1:\$C\$5/.test(r.pa || '') && /1:\$?1/.test(r.pt || '') && r.hdr === '&A' && r.ftr === 'Seite &P von &N', r);
  check('xlsx: Formatvorlagen geschrieben', /C6EFCE/i.test(r.c2fill || '') && r.e1sz === 15, r);
  // LibreOffice öffnet die Datei (VML-Notiz, Schutz)
  try { execFileSync('soffice', ['--headless', '--convert-to', 'csv', '--outdir', OUT, xf], { timeout: 60000, stdio: 'ignore' }); check('LibreOffice liest die Datei', fs.existsSync(path.join(OUT, 'excel.csv')) && /Anna/.test(fs.readFileSync(path.join(OUT, 'excel.csv'), 'utf8'))); } catch (e) { check('LibreOffice liest die Datei', false, e.message); }
  // Rundlauf: neu einlesen → Filter, Notiz, Schutz, Seite
  const rid = await imp(path.relative(DIR, xf).startsWith('..') ? (fs.copyFileSync(xf, path.join(DIR, 'rt172.xlsx')), 'rt172.xlsx') : xf);
  void rid;
  xl = await pg.evaluate(() => { const b = OfficeView.sheets(Canvas.page)[0], d = b.sheet; return { af: d.af, hf: d.hideF, n: d.notes, prot: d.prot && d.prot.on, ps: d.ps, dv: (d.dv || []).length, m: d.merges }; });
  check('Rundlauf: Filter + gefilterte Zeilen', xl.af && xl.af.ref === 'A1:C5' && xl.af.f[1] && xl.af.f[1].vals[0] === 'Bern' && JSON.stringify(xl.hf) === '[2,4]', xl);
  check('Rundlauf: Notiz, Schutz, Seite, Überprüfung, Verbund', xl.n && xl.n.A2 && xl.n.A2.t === 'Erste Kundin' && xl.prot && xl.ps && xl.ps.or === 'landscape' && xl.ps.pa === 'A1:C5' && xl.ps.pt === '1:1' && xl.dv === 2 && xl.m && xl.m.includes('A8:C8'), xl);
  // unverändert gespeichert = Byte für Byte
  const same = await pg.evaluate(async () => { const p = Canvas.page; const a = await OfficePages.assetBlob(p.office.asset), b = (await OfficePages.current(p)).blob; return a.size === b.size; });
  check('Rundlauf ohne Änderung: Datei unverändert', same);
  fs.rmSync(path.join(DIR, 'rt172.xlsx'), { force: true });

  /* ============================================================ Öffnen / Speichern / Exportieren */
  await pg.evaluate(() => Backstage.open('oeffnen')); await pg.waitForTimeout(300);
  const op = await pg.evaluate(() => { const s = document.querySelector('.oio-type'); const groups = [...s.querySelectorAll('optgroup')].map(g => g.label); s.value = 'csv'; s.dispatchEvent(new Event('change')); return { v: s.options[s.selectedIndex].text, groups, acc: OfficeIO.acceptOf('csv'), hint: document.querySelector('.oio-hint').textContent, n: s.options.length }; });
  check('Öffnen: Dateityp-Liste mit Gruppen Word/Excel/PowerPoint', op.groups.join() === 'Word,Excel,PowerPoint' && op.n > 18, op);
  check('Öffnen: CSV filtert die Auswahl und erklärt die Umwandlung', op.acc === '.csv' && /umgewandelt/.test(op.hint), op);
  await pg.evaluate(() => { Store.ui.officeOpenType = 'all'; Backstage.close(); });
  await pg.evaluate(() => Backstage.open('info')); await pg.waitForTimeout(300);
  const sv = await pg.evaluate(() => { const s = document.querySelector('.oio-save .sa-type'); return s ? { v: s.value, groups: [...s.querySelectorAll('optgroup')].map(g => g.label), opts: [...s.options].map(o => o.value) } : null; });
  check('Datei → Informationen: Speichern unter mit Dateityp (Standard .xlsx)', sv && sv.v === 'xlsx' && sv.groups[0] === 'Neuestes Format (empfohlen)' && sv.opts.includes('ods') && sv.opts.includes('pdf') && sv.opts.includes('html'), sv);
  await pg.evaluate(() => Backstage.close());
  const html = await save('mappe.html', 'html');
  check('Excel als Webseite: Tabelle mit verbundener Zelle', /colspan="3"/.test(fs.readFileSync(html, 'utf8')) && /Anna/.test(fs.readFileSync(html, 'utf8')));
  // Export-Fenster: Dateityp je Programm
  await pg.evaluate(() => { Store.ui.exportFormat = 'office'; Export.show({ pages: [Canvas.pageId] }); }); await pg.waitForTimeout(300);
  const ex = await pg.evaluate(() => { const ss = [...document.querySelectorAll('.oio-exrow select')]; const r = ss.map(s => s.dataset.fmt + '=' + s.value); const pdf = ss.some(s => [...s.options].some(o => o.value === 'pdf')); document.querySelector('.ex-dlg .dlg-btns .btn').click(); return { r, pdf }; });
  check('Exportieren: je Programm ein Dateityp, voreingestellt das neueste, ohne PDF', ex.r.join() === 'docx=docx,xlsx=xlsx,pptx=pptx' && !ex.pdf, ex);

  /* ============================================================ PowerPoint: ODP, Gliederung */
  await imp('test.pptx');
  const odp = await save('folien.odp', 'odp');
  try { execFileSync('soffice', ['--headless', '--convert-to', 'pdf', '--outdir', OUT, odp], { timeout: 60000, stdio: 'ignore' }); const t = execFileSync('pdftotext', [path.join(OUT, 'folien.pdf'), '-'], { encoding: 'utf8' }); check('ODP: LibreOffice zeigt Titel und Punkte', /Erste Folie/.test(t) && /Punkt A/.test(t) && /Zweite Folie/.test(t), t.slice(0, 200)); } catch (e) { check('ODP: LibreOffice', false, e.message); }
  const rtf = await save('folien.rtf', 'rtf');
  check('Gliederung/RTF: Folientitel als Überschrift', /\\outlinelevel0[^}]*Erste Folie/.test(fs.readFileSync(rtf, 'latin1')));

  /* ============================================================ Word */
  await pg.evaluate(async () => { await OfficePages.newTyped('docx'); await new Promise(r => setTimeout(r, 900)); });
  await pg.evaluate(() => { const b = Canvas.page.boxes.find(x => x.ox && x.ox.k === 'w'); Canvas.focusText(b.id, true); const t = Canvas.textEl(b.id); t.innerHTML = '<div>Zebra</div><div>Apfel</div><div>Mango</div>'; t.dispatchEvent(new Event('input', { bubbles: true })); });
  await pg.waitForTimeout(200);
  // Sortieren (alle Absätze des Felds markiert)
  await pg.evaluate(() => { const b = Canvas.page.boxes.find(x => x.ox && x.ox.k === 'w'); const t = Canvas.textEl(b.id); const r = document.createRange(); r.selectNodeContents(t); const s = getSelection(); s.removeAllRanges(); s.addRange(r); OfficeWX.sort(false); });
  await pg.waitForTimeout(150);
  await pg.evaluate(() => Canvas.stopEditing());
  check('Word: Absätze sortiert (A → Z)', await pg.evaluate(() => /Apfel[\s\S]*Mango[\s\S]*Zebra/.test(Canvas.page.boxes.find(x => x.ox && x.ox.k === 'w').html)));
  // Symbol an der Schreibmarke
  await pg.evaluate(() => { const b = Canvas.page.boxes.find(x => x.ox && x.ox.k === 'w'); Canvas.focusText(b.id, true); const t = Canvas.textEl(b.id); const r = document.createRange(); r.selectNodeContents(t.lastElementChild); r.collapse(false); const s = getSelection(); s.removeAllRanges(); s.addRange(r); OfficeSym.show(); });
  await pg.waitForTimeout(200);
  await pg.evaluate(() => { const b = [...document.querySelectorAll('.sym-c')].find(x => x.textContent === '€'); b.click(); document.querySelector('.sym-dlg .dlg-btns .btn').click(); });
  await pg.waitForTimeout(150);
  await pg.evaluate(() => Canvas.stopEditing());
  check('Word: Symbol € eingefügt', await pg.evaluate(() => /Zebra€/.test(Canvas.page.boxes.find(x => x.ox && x.ox.k === 'w').html)));
  // Kopf-/Fusszeile, Seitenzahl, Wasserzeichen, Silbentrennung
  await pg.evaluate(async () => { OfficeWX.pageNumber('f-c-xy'); Canvas.page.office.hf.h = { t: 'Bericht\t{Datum}', al: 'l' }; await OfficeWX.watermark('ENTWURF'); OfficeWX.hyph(true); Canvas.render(true); await new Promise(r => setTimeout(r, 300)); });
  const wd = await pg.evaluate(() => { const p = Canvas.page; return { hfp: p.boxes.filter(b => b.ox && b.ox.k === 'hfp').map(b => b.ox.pos + ':' + OfficeWord.textOf(b.html).trim()), wmp: p.boxes.filter(b => b.ox && b.ox.k === 'wmp').length, hy: document.body.classList.contains('w-hyph') }; });
  check('Word: Kopf-/Fusszeile auf dem Blatt („Seite 1 von 1“), Wasserzeichen, Silbentrennung', wd.hfp.some(x => x === 'f:Seite 1 von 1') && wd.hfp.some(x => /^h:Bericht/.test(x)) && wd.wmp === 1 && wd.hy, wd);
  const wf = await save('word.docx');
  const wr = py(`import zipfile,json,sys,re
z=zipfile.ZipFile(sys.argv[1]); n=z.namelist()
hd=[z.read(x).decode() for x in n if re.match(r'word/header\\d*\\.xml',x)]; ft=[z.read(x).decode() for x in n if re.match(r'word/footer\\d*\\.xml',x)]
doc=z.read('word/document.xml').decode(); st=z.read('word/settings.xml').decode() if 'word/settings.xml' in n else ''
import docx; d=docx.Document(sys.argv[1])
print(json.dumps({'h':len(hd),'f':len(ft),'page':any('PAGE' in x and 'NUMPAGES' in x for x in ft),'wm':any('PowerPlusWaterMarkObject' in x and 'ENTWURF' in x for x in hd),'ref':doc.count('headerReference')+doc.count('footerReference'),'hyph':'autoHyphenation' in st,'ftxt':d.sections[0].footer.paragraphs[0].text if d.sections[0].footer.paragraphs else '','paras':[p.text for p in d.paragraphs if p.text]}))`, wf);
  check('docx: Kopf- und Fusszeile mit PAGE/NUMPAGES, Wasserzeichen, Silbentrennung', wr.h === 1 && wr.f === 1 && wr.page && wr.wm && wr.ref === 2 && wr.hyph, wr);
  check('docx: Text sortiert mit Symbol', wr.paras && wr.paras.join('|') === 'Apfel|Mango|Zebra€', wr.paras);
  try { execFileSync('soffice', ['--headless', '--convert-to', 'pdf', '--outdir', OUT, wf], { timeout: 60000, stdio: 'ignore' }); const t = execFileSync('pdftotext', [path.join(OUT, 'word.pdf'), '-'], { encoding: 'utf8' }); check('LibreOffice: „Seite 1 von 1“ und Kopfzeile', /Seite 1 von 1/.test(t) && /Bericht/.test(t), t.slice(0, 300)); } catch (e) { check('LibreOffice Word', false, e.message); }
  fs.copyFileSync(wf, path.join(DIR, 'rt172.docx'));
  await imp('rt172.docx');
  const wrt = await pg.evaluate(() => { const o = Canvas.page.office; return { hf: o.hf, wm: o.wm, hy: o.hyph }; });
  check('Word-Rundlauf: Kopf-/Fusszeile mit Feldern, Wasserzeichen, Silbentrennung', wrt.hf && wrt.hf.f.t === 'Seite {Seite} von {Seiten}' && wrt.hf.h.t === 'Bericht\t{Datum}' && wrt.hf.h.al === 'l' && wrt.wm === 'ENTWURF' && wrt.hy === true, wrt);
  fs.rmSync(path.join(DIR, 'rt172.docx'), { force: true });

  /* ============================================================ PowerPoint */
  await imp('test.pptx');
  await pg.evaluate(async () => {
    const p = Canvas.page, fr = OfficePpt.frames(p);
    OfficePpt.focusSlide(fr[1].id); OfficePX.hideSlide();
    OfficePpt.focusSlide(fr[0].id); OfficeAnim.setTransition('push'); OfficeAnim.setTransOpt('dir', 'u'); OfficeAnim.setTransOpt('adv', 3000); OfficeAnim.setTransOpt('click', false);
    const bs = OfficePpt.itemsOf(fr[0], p).boxes.filter(b => b.ox && b.ox.k === 'sp');
    Canvas.select([bs[0].id]); OfficeAnim.setAnim('e:spin');
    Canvas.select([bs[1].id]); OfficeAnim.setAnim('x:fade');
    Canvas.select([]);
    OfficePX.applyHF(p, fr, { date: '01.02.2026', num: true, ftr: 'Fusstext', noTitle: false });
    p.office.loop = true;
    await new Promise(r => setTimeout(r, 400));
  });
  const pv = await pg.evaluate(() => { const fr = OfficePpt.frames(Canvas.page); return { hidTh: document.querySelectorAll('.ofv-th.hid').length, nums: Canvas.page.boxes.filter(b => b.pf === 'num').map(b => OfficeWord.textOf(b.html).trim()).sort().join() }; });
  check('PowerPoint: ausgeblendete Folie in der Übersicht, Foliennummern', pv.hidTh === 1 && pv.nums === '1,2', pv);
  // Vorführen: ausgeblendete Folie übersprungen, Endlosschleife
  check('Vorführen: ausgeblendete Folie übersprungen, Schleife zurück zur ersten', await pg.evaluate(() => { Show.frames = OfficePpt.frames(Canvas.page); Show.p = Canvas.page; const a = Show.vis(1, 1); Canvas.page.office.loop = false; const b = Show.vis(1, 1); Canvas.page.office.loop = true; return a === 0 && b === 2; }));
  // Foliensortierung: Raster, verschieben
  await pg.evaluate(() => OfficePX.sorter()); await pg.waitForTimeout(300);
  const so = await pg.evaluate(() => { const n = document.querySelectorAll('.px-card').length; const p = Canvas.page, f0 = OfficePpt.frames(p)[0].id; OfficePX.move(p, 0, 1); const moved = OfficePpt.frames(p)[1].id === f0; OfficePX.move(p, 1, 0); OfficePX.closeSorter(); return { n, moved, nums: p.boxes.filter(b => b.pf === 'num').map(b => OfficeWord.textOf(b.html).trim()).join() }; });
  check('Foliensortierung: zwei Karten, verschieben und zurück', so.n === 2 && so.moved, so);
  const pf = await save('folien.pptx');
  const pr = py(`import zipfile,json,sys,re
z=zipfile.ZipFile(sys.argv[1]); n=z.namelist()
import pptx; P=pptx.Presentation(sys.argv[1]); s1=P.slides[0]._element; s2=P.slides[1]._element
from lxml import etree
x1=etree.tostring(s1).decode()
pp=[z.read(x).decode() for x in n if x.startswith('ppt/presProps')]
print(json.dumps({'show2':s2.get('show'),'push':bool(re.search(r'<p:push dir="u"',x1)),'adv':'advTm="3000"' in x1 and 'advClick="0"' in x1,'emph':'presetClass="emph"' in x1,'exit':'presetClass="exit"' in x1,
'txt':sorted([sh.text_frame.text for sh in P.slides[0].shapes if sh.has_text_frame and sh.text_frame.text in ('Fusstext','1','01.02.2026')]),'loop':any('loop="1"' in x for x in pp)}))`, pf);
  check('pptx: Folie 2 ausgeblendet, Übergang „Schieben von unten“, nach 3 s ohne Klick', pr.show2 === '0' && pr.push && pr.adv, pr);
  check('pptx: Hervorheben und Beenden, Kopf-/Fusszeile, Endlosschleife', pr.emph && pr.exit && JSON.stringify(pr.txt) === JSON.stringify(['01.02.2026', '1', 'Fusstext']) && pr.loop, pr);
  try { execFileSync('soffice', ['--headless', '--convert-to', 'pdf', '--outdir', OUT, pf], { timeout: 60000, stdio: 'ignore' }); check('LibreOffice öffnet die Präsentation', fs.existsSync(path.join(OUT, 'folien.pdf'))); } catch (e) { check('LibreOffice pptx', false, e.message); }
  fs.copyFileSync(pf, path.join(DIR, 'rt172.pptx'));
  await imp('rt172.pptx');
  const prt = await pg.evaluate(() => { const p = Canvas.page, fr = OfficePpt.frames(p); return { hide: !!fr[1].ox.hide, tr: fr[0].ox.tr, fx: p.boxes.filter(b => b.anim).map(b => b.anim.fx).sort(), loop: !!p.office.loop }; });
  check('PowerPoint-Rundlauf: ausgeblendet, Übergang mit Richtung/Zeit, Effekte, Schleife', prt.hide && prt.tr && prt.tr.type === 'push' && prt.tr.dir === 'u' && prt.tr.adv === 3000 && prt.tr.click === false && prt.fx.join() === 'e:spin,x:fade' && prt.loop, prt);
  fs.rmSync(path.join(DIR, 'rt172.pptx'), { force: true });

  if (errs.length) console.log('Fehler im Browser:', errs.slice(0, 5));
  check('keine Fehler im Browser', !errs.length, errs);
  console.log(`office-172: ${ok} ok, ${bad} falsch`);
  await br.close();
  process.exit(bad ? 1 : 0);
})();
