'use strict';
/* Browser-Test 1.67: Word/Excel/PowerPoint-Seiten überarbeitet – node tests/browser/office-167.js [url]
 *  - Word: Klick aufs Blatt setzt die Schreibmarke (Rand, Lücke, unter dem Text), Ziehen markiert, kein neues Textfeld;
 *    Formatierungszeichen ¶, Seitenumbruch beginnt neue Seite, Statusleiste Wörter/Zeichen (auch „x von y Wörtern“),
 *    Lineale oben/links, Rand ziehen → w:pgMar, Navigationsbereich, Entwurf (Absatzabstand, Schriftart, Seitenränder)
 *  - Excel: unendliches Raster (wächst beim Scrollen und mit Pfeiltasten), Köpfe bleiben stehen, nicht über A1 hinaus,
 *    Tabelle nicht löschbar, Textfeld darüber, Bearbeitungsleiste bleibt, Formate/Rahmen/bedingte Formatierung/
 *    Fenster fixieren → Datei (openpyxl), Formate und Regeln aus einer Datei lesen (unverändert = byte-gleich),
 *    Duplikate entfernen, Text in Spalten
 *  - PowerPoint: Lernansicht (Notizen links, Animationsbereich mit Reihenfolge/Auslöser rechts) und Normal (nur die Folie,
 *    Notizspalte, Mausrad = Folie), Ansicht je Seite gespeichert, alte Anordnung wird umgestellt, Folienlayouts mit
 *    Platzhaltern (leere nicht in die Datei), Textfeld aufziehen, an Folie ausrichten, Führungslinien/Raster
 * Microsoft Office selbst: ungetestet (python-docx/-pptx, openpyxl, LibreOffice). */
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const { chromium } = require('playwright');
const url = process.argv[2] || 'http://127.0.0.1:8800/index.html';
const OUT = '/tmp/kt-office-167';
fs.rmSync(OUT, { recursive: true, force: true }); fs.mkdirSync(OUT, { recursive: true });
const has = (cmd) => { try { execFileSync('sh', ['-c', 'command -v ' + cmd], { stdio: 'ignore' }); return true; } catch (e) { return false; } };
const pyOk = (() => { try { execFileSync('python3', ['-c', 'import pptx, docx, openpyxl'], { stdio: 'ignore' }); return true; } catch (e) { return false; } })();
const py = (code) => JSON.parse(execFileSync('python3', ['-c', code], { encoding: 'utf8' }));
const unzipText = (file, part) => { try { return execFileSync('unzip', ['-p', file, part], { encoding: 'utf8' }); } catch (e) { return ''; } };
(async () => {
  const br = await chromium.launch();
  const pg = await br.newPage({ viewport: { width: 1440, height: 900 } });
  const errs = [];
  pg.on('pageerror', e => errs.push(e.message));
  pg.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push(m.text()); });
  await pg.goto(url);
  await pg.waitForFunction(() => typeof OfficeSlides !== 'undefined' && Store.loaded && Canvas.page, null, { timeout: 20000 });
  await pg.waitForTimeout(800);
  let ok = 0, bad = 0;
  const check = (n, c, info) => { if (c) ok++; else { bad++; console.log('FALSCH', n, info === undefined ? '' : typeof info === 'string' ? info : JSON.stringify(info)); } };
  const save = async (pid, name) => { const b = await pg.evaluate(async (pid) => { const c = await OfficePages.current(Store.pages[pid]); const a = new Uint8Array(await c.blob.arrayBuffer()); let s = ''; for (let i = 0; i < a.length; i += 0x8000) s += String.fromCharCode.apply(null, a.subarray(i, i + 0x8000)); return btoa(s); }, pid); fs.writeFileSync(path.join(OUT, name), Buffer.from(b, 'base64')); return path.join(OUT, name); };
  const sel = () => pg.evaluate(() => { const s = getSelection(); return { text: s.toString(), node: s.anchorNode && s.anchorNode.textContent, off: s.anchorOffset, ed: Canvas.editing }; });

  // ================================================================ 1) Word
  const wd = await pg.evaluate(async () => {
    const p = await OfficePages.newTyped('docx'); await new Promise(r => setTimeout(r, 700));
    document.activeElement && document.activeElement.blur();
    const w = p.boxes.find(b => b.ox && b.ox.k === 'w');
    w.html = '<h1>Bericht</h1><p>Erster Absatz mit Text.</p><p>Zweiter Absatz, etwas länger als der erste.</p><hr><h2>Teil zwei</h2><p>Nach dem Umbruch.</p>';
    Canvas.render(); await new Promise(r => setTimeout(r, 500));
    const t = Canvas.textEl(w.id), r = t.getBoundingClientRect(), ps = [...t.querySelectorAll('p')].map(e => { const q = e.getBoundingClientRect(); return { y: q.top + q.height / 2, r: q.right }; });
    const n = p.boxes.filter(b => b.ox && b.ox.k === 'blatt').length;
    return { pid: p.id, wid: w.id, l: r.left, r: r.right, ps, pages: n, pm: !!t.querySelector('h2[data-kt-pm]'), boxes: p.boxes.length };
  });
  check('Word: Seitenumbruch – „Teil zwei“ beginnt auf Seite 2', wd.pm && wd.pages === 2, wd);
  await pg.mouse.click(wd.r + 60, wd.ps[1].y); await pg.waitForTimeout(150);
  let s1 = await sel();
  check('Klick in den rechten Rand: Schreibmarke ans Zeilenende', s1.ed === wd.wid && /^Zweiter Absatz/.test(s1.node) && s1.off === s1.node.length, s1);
  await pg.keyboard.type(' XYZ'); await pg.waitForTimeout(150);
  check('… und dort weiterschreiben', await pg.evaluate((id) => /erste\. XYZ/.test(Canvas.textEl(id).textContent), wd.wid));
  await pg.mouse.click(wd.l - 50, wd.ps[0].y); await pg.waitForTimeout(150);
  s1 = await sel();
  check('Klick in den linken Rand: Schreibmarke an den Zeilenanfang', /^Erster Absatz/.test(s1.node) && s1.off === 0, s1);
  await pg.mouse.move(wd.l - 40, wd.ps[0].y); await pg.mouse.down(); await pg.mouse.move(wd.r + 40, wd.ps[1].y, { steps: 6 }); await pg.mouse.up(); await pg.waitForTimeout(250);
  const st = await pg.evaluate(() => ({ s: getSelection().toString(), sb: document.querySelector('#sb-left').textContent }));
  check('Ziehen über den Rand markiert Text', /Erster Absatz mit Text\.[\s\S]*Zweiter Absatz/.test(st.s), st.s);
  check('Statusleiste: „x von y Wörtern“ und Zeichen', /^Seite 1 von 2 · \d+ von \d+ Wörtern · [\d’']+ Zeichen/.test(st.sb.replace(/\s+·\s+/g, ' · ')), st.sb);
  const nb0 = await pg.evaluate(() => Canvas.page.boxes.length);
  const gap = await pg.evaluate((id) => { const b = Canvas.box(id), P = OfficeView.paper(Canvas.page); const y = Canvas.view.y + (OfficeView.pageTop(Canvas.page, 0) + 13 + P.H - 120) * Canvas.view.z + Canvas.vp.getBoundingClientRect().top; return { x: Canvas.vp.getBoundingClientRect().left + Canvas.view.x + (OfficeView.PX + 11 + P.W / 2) * Canvas.view.z, y }; }, wd.wid);
  await pg.mouse.dblclick(gap.x, Math.min(gap.y, 880)); await pg.waitForTimeout(250);
  const nb1 = await pg.evaluate(() => Canvas.page.boxes.length);
  check('Doppelklick aufs Blatt: kein neues Textfeld', nb1 === nb0, [nb0, nb1]);
  await pg.evaluate(() => Cmd.run('wMarks')); await pg.waitForTimeout(400);
  const mk = await pg.evaluate((id) => { const t = Canvas.textEl(id); const h = CSS.highlights.get('kt-marks'); return { body: document.body.classList.contains('kt-marks'), ranges: h ? h.size : 0, pil: getComputedStyle(t.querySelector('p'), '::after').content, hr: getComputedStyle(t.querySelector('hr'), '::after').content }; }, wd.wid);
  check('Formatierungszeichen: ¶, Leerzeichen markiert, Seitenumbruch beschriftet', mk.body && mk.ranges > 5 && /¶/.test(mk.pil) && /Seitenumbruch/.test(mk.hr), mk);
  await pg.evaluate(() => Cmd.run('wMarks'));
  const ru = await pg.evaluate(() => ({ h: !!document.querySelector('.ofv-ruler .or-page.h'), v: !!document.querySelector('.ofv-vruler .or-page.v'), mh: document.querySelectorAll('.or-mh').length }));
  check('Lineale oben und links mit ziehbaren Rändern', ru.h && ru.v && ru.mh === 4, ru);
  const mh = await pg.evaluate(() => { const m = document.querySelector('.ofv-ruler .or-mh[data-side="l"]').getBoundingClientRect(); return { x: m.left + m.width / 2, y: m.top + m.height / 2, l: Canvas.page.office.pg.l }; });
  await pg.mouse.move(mh.x, mh.y); await pg.mouse.down(); await pg.mouse.move(mh.x + 50, mh.y, { steps: 4 }); await pg.mouse.up(); await pg.waitForTimeout(400);
  const l2 = await pg.evaluate(() => Canvas.page.office.pg.l);
  check('Linken Rand im Lineal ziehen ändert den Seitenrand', l2 > mh.l + 300, [mh.l, l2]);
  await pg.evaluate(() => Cmd.run('wNav')); await pg.waitForTimeout(400);
  const nv = await pg.evaluate(() => [...document.querySelectorAll('.ofv-nav .on-it')].map(b => b.textContent));
  check('Navigationsbereich: Überschriften', nv.join('|') === 'Bericht|Teil zwei', nv);
  const y0 = await pg.evaluate(() => Canvas.view.y);
  await pg.evaluate(() => document.querySelectorAll('.ofv-nav .on-it')[1].click()); await pg.waitForTimeout(300);
  const jm = await pg.evaluate(() => ({ y: Canvas.view.y, sb: document.querySelector('#sb-left').textContent }));
  check('Klick auf „Teil zwei“ springt zur Seite 2', jm.y < y0 - 300 && /^Seite 2 von 2/.test(jm.sb), [y0, jm]);
  await pg.evaluate(() => Cmd.run('wNav'));
  await pg.evaluate(() => { Cmd.run('wSpacing', 'offen'); Cmd.run('wFont', 'Liberation Serif'); Cmd.run('wBorder', 'doppelt'); }); await pg.waitForTimeout(400);
  const ds = await pg.evaluate((id) => { const p = getComputedStyle(Canvas.textEl(id).querySelector('p')); const f = document.querySelector('.box.oblatt .fimg'); return { mb: p.marginBottom, ff: getComputedStyle(Canvas.textEl(id)).fontFamily, bd: getComputedStyle(f, '::after').borderTopStyle }; }, wd.wid);
  check('Entwurf in der Anzeige: Absatzabstand, Schriftart, Seitenrand', parseFloat(ds.mb) > 12 && /Liberation Serif/.test(ds.ff) && ds.bd === 'double', ds);
  const fW = await save(wd.pid, 'wort.docx');
  const dx = unzipText(fW, 'word/document.xml'), sx = unzipText(fW, 'word/styles.xml');
  check('Datei: w:pgMar links, w:pgBorders doppelt', new RegExp(`w:left="${l2}"`).test(dx) && /<w:pgBorders w:offsetFrom="page"><w:top w:val="double"/.test(dx), dx.slice(-600));
  check('Datei: docDefaults Abstand 10 pt / 1,15 und Schriftart', /<w:spacing[^>]*w:after="200"[^>]*w:line="276"/.test(sx) && /w:ascii="Liberation Serif"/.test(sx));
  check('Datei: Seitenumbruch als w:br type=page', /<w:br w:type="page"\/>/.test(dx));
  if (pyOk) {
    const r = py(`import json, docx\nd=docx.Document(${JSON.stringify(fW)})\nprint(json.dumps([p.text for p in d.paragraphs]))`);
    check('python-docx öffnet, Text da', r.includes('Bericht') && r.some(x => /erste\. XYZ/.test(x)), r);
  }
  if (has('soffice')) {
    try { execFileSync('soffice', ['--headless', '--convert-to', 'pdf', '--outdir', OUT, fW], { stdio: 'ignore', timeout: 120000 }); const info = execFileSync('pdfinfo', [path.join(OUT, 'wort.pdf')], { encoding: 'utf8' }); check('LibreOffice: 2 Seiten (Umbruch)', /Pages:\s+2/.test(info), info); } catch (e) { check('LibreOffice: PDF', false, e.message); }
  }

  // ================================================================ 2) Excel
  const xl = await pg.evaluate(async () => {
    const p = await OfficePages.newTyped('xlsx'); await new Promise(r => setTimeout(r, 800));
    document.activeElement && document.activeElement.blur();
    const sh = p.boxes.find(b => b.sheet);
    Sheet.setCells(sh.id, [[0, 0, 'Name'], [1, 0, 'Wert'], [0, 1, 'A'], [1, 1, '5'], [0, 2, 'B'], [1, 2, '12'], [0, 3, 'A'], [1, 3, '7'], [0, 4, 'C'], [1, 4, '20'], [3, 0, 'x;y;z'], [3, 1, '1;2;3']]);
    return { pid: p.id, sid: sh.id, n: sh.sheet.nrows };
  });
  const vr = await pg.evaluate(() => Canvas.vp.getBoundingClientRect());
  await pg.mouse.move(vr.left + 500, vr.top + 300);
  for (let i = 0; i < 15; i++) { await pg.mouse.wheel(0, 500); await pg.waitForTimeout(25); }
  await pg.waitForTimeout(500);
  const sc = await pg.evaluate((id) => { const e = Canvas.els.get(id); return { n: Canvas.box(id).sheet.nrows, ch: e.querySelector('.xl-colhead').getBoundingClientRect().top, vp: Canvas.vp.getBoundingClientRect().top, rh: e.querySelector('.xl-rowhead').getBoundingClientRect().left, vl: Canvas.vp.getBoundingClientRect().left }; }, xl.sid);
  check('Excel: Raster wächst beim Scrollen', sc.n > xl.n + 100, [xl.n, sc.n]);
  check('Spaltenköpfe bleiben oben stehen', Math.abs(sc.ch - sc.vp) <= 2, sc);
  for (let i = 0; i < 40; i++) { await pg.mouse.wheel(0, -800); await pg.waitForTimeout(10); }
  await pg.waitForTimeout(300);
  const tp = await pg.evaluate((id) => { const e = Canvas.els.get(id); return { ch: e.querySelector('.xl-colhead').getBoundingClientRect().top, vp: Canvas.vp.getBoundingClientRect().top, a1: e.querySelector('.xl-grid td').getBoundingClientRect().top }; }, xl.sid);
  check('Nicht über A1 hinaus: Köpfe am oberen Rand, A1 direkt darunter', Math.abs(tp.ch - tp.vp) <= 2 && tp.a1 - tp.vp < 30, tp);
  const ar = await pg.evaluate(async (id) => { const d = Canvas.box(id).sheet; Sheet.activate(id, 1, d.nrows - 1); Sheet.move(0, 1); Sheet.move(0, 1); return { n0: d.nrows, r: Sheet.active.r }; }, xl.sid);
  check('Pfeiltaste über die letzte Zeile: Raster wächst mit', ar.r > 0 && ar.n0 > ar.r, ar);
  await pg.evaluate(() => Cmd.run('newBox')); await pg.waitForTimeout(250); await pg.keyboard.type('Notiz über der Tabelle'); await pg.keyboard.press('Escape'); await pg.waitForTimeout(250);
  const tb = await pg.evaluate((id) => { const p = Canvas.page, b = p.boxes.find(x => /Notiz über der Tabelle/.test(x.html)); const bar = document.querySelector('#xl-bar'); Canvas.select([id]); Canvas.deleteSelection(); return { z: b && [+getComputedStyle(Canvas.els.get(b.id)).zIndex, +getComputedStyle(Canvas.els.get(id)).zIndex], still: !!Canvas.box(id), bar: bar && !bar.hidden }; }, xl.sid);
  check('Textfeld liegt über der Tabelle', tb.z && tb.z[0] > tb.z[1], tb);
  check('Tabelle lässt sich auf der Excel-Seite nicht löschen', tb.still, tb);
  check('Bearbeitungsleiste bleibt sichtbar', tb.bar, tb);
  await pg.evaluate((id) => {
    Sheet.activate(id, 0, 0); Sheet.active.c2 = 1; Sheet.toggle('b'); Cmd.run('xlBg', '#ffff00'); Cmd.run('xlBorder', 'all');
    Sheet.activate(id, 1, 1); Sheet.active.r2 = 4; Cmd.run('xlNumFmt', 'num'); OfficeGrid.cfAdd({ t: 'gt', a: '10', st: 'rot' }); OfficeGrid.cfAdd({ t: 'bar', s: 'blau' });
    Sheet.activate(id, 0, 1); Sheet.active.r2 = 4; OfficeGrid.cfAdd({ t: 'dup', st: 'gelb' });
    Sheet.activate(id, 0, 1); Cmd.run('xlFreeze', 'row');
  }, xl.sid);
  await pg.waitForTimeout(300);
  const cfv = await pg.evaluate((id) => { const t = Canvas.els.get(id).querySelector('.xl-grid'); const c = (r, cc) => t.rows[r].cells[cc]; return { b3: getComputedStyle(c(2, 1)).color, b2: c(1, 1).textContent, a2: getComputedStyle(c(1, 0)).backgroundColor, fz: c(0, 0).className, bar: c(4, 1).style.background }; }, xl.sid);
  check('Bedingte Formatierung in der Anzeige (> 10 rot, Duplikate gelb, Balken)', cfv.b3 === 'rgb(156, 0, 6)' && cfv.a2 === 'rgb(255, 235, 156)' && /gradient/.test(cfv.bar) && cfv.b2 === '5.00', cfv);
  check('Oberste Zeile fixiert', /xl-fzr/.test(cfv.fz), cfv.fz);
  const fX = await save(xl.pid, 'tabelle.xlsx');
  if (pyOk) {
    const r = py(`import json, openpyxl\nwb=openpyxl.load_workbook(${JSON.stringify(fX)})\nws=wb.active\ncf=[(str(k.sqref),[x.type for x in v]) for k,v in ws.conditional_formatting._cf_rules.items()]\nprint(json.dumps({'b':ws['A1'].font.b,'fill':ws['A1'].fill.fgColor.rgb,'bd':ws['A1'].border.left.style,'nf':ws['B2'].number_format,'fz':ws.freeze_panes,'cf':cf}))`);
    check('openpyxl: fett, Füllung, Rahmen, Zahlenformat', r.b === true && r.fill === 'FFFFFF00' && r.bd === 'thin' && r.nf === '#,##0.00', r);
    check('openpyxl: fixiert A2, bedingte Formate', r.fz === 'A2' && JSON.stringify(r.cf).includes('cellIs') && JSON.stringify(r.cf).includes('dataBar') && JSON.stringify(r.cf).includes('duplicateValues'), r);
    // Datei mit Formaten → einlesen
    const src = path.join(OUT, 'formate.xlsx');
    execFileSync('python3', ['-c', `import openpyxl\nfrom openpyxl.styles import Font, PatternFill\nfrom openpyxl.formatting.rule import CellIsRule\nwb=openpyxl.Workbook(); ws=wb.active; ws.title='Daten'\nws['A1']='Titel'; ws['A1'].font=Font(bold=True, color='FFC00000', size=14)\nws['B2']=0.25; ws['B2'].number_format='0.0%'\nws['C3']='gelb'; ws['C3'].fill=PatternFill('solid', fgColor='FFFFFF00')\nfor i in range(2,6): ws.cell(row=i, column=1, value=i*3)\nws.conditional_formatting.add('A2:A5', CellIsRule(operator='greaterThan', formula=['8'], fill=PatternFill('solid', bgColor='FFFFC7CE'), font=Font(color='FF9C0006')))\nws.freeze_panes='B2'\nwb.save(${JSON.stringify(src)})`]);
    const b64 = fs.readFileSync(src).toString('base64');
    const im = await pg.evaluate(async (b64) => {
      const s = atob(b64), u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i);
      const p = await OfficePages.importOne(new File([u], 'formate.xlsx')); await new Promise(r => setTimeout(r, 800));
      const sh = p.boxes.find(b => b.sheet), d = sh.sheet;
      const t = Canvas.els.get(sh.id).querySelector('.xl-grid');
      const c = await OfficePages.current(p);
      return { pid: p.id, a1: d.cells.A1.f, b2: d.cells.B2.f, b2t: t.rows[1].cells[1].textContent, c3: d.cells.C3.f, cf: d.cf, fz: d.freeze, same: !c.changed, a3: getComputedStyle(t.rows[2].cells[0]).backgroundColor };
    }, b64);
    check('Formate aus der Datei: fett/rot/14 pt, Prozent, Füllung', im.a1 && im.a1.b && im.a1.c === '#c00000' && im.a1.fs === 14 && im.b2.nf === 'pct' && im.b2.d === 1 && im.b2t === '25.0%' && im.c3.bg === '#ffff00', im);
    check('Bedingte Formatierung und Fixierung aus der Datei', im.cf && im.cf[0].t === 'gt' && im.cf[0].a === '8' && im.fz && im.fz.r === 1 && im.fz.c === 1 && im.a3 === 'rgb(255, 199, 206)', im);
    check('unverändert = Original (byte-gleich)', im.same, im);
    await pg.evaluate((id) => App.openPage(id), xl.pid); await pg.waitForTimeout(400);
  }
  const dp = await pg.evaluate(async (id) => { Sheet.activate(id, 0, 1); await OfficeGrid.removeDuplicates(); document.querySelector('.dlg-back .btn') && document.querySelector('.dlg-back .btn').click(); const d = Canvas.box(id).sheet; return [1, 2, 3, 4].map(r => Sheet.raw(d, 0, r) + '/' + Sheet.raw(d, 1, r)); }, xl.sid);
  check('Duplikate entfernen (Zeilen mit gleichen Werten)', dp.join(',') === 'A/5,B/12,A/7,C/20' || dp.join(',').startsWith('A/5,B/12'), dp);
  pg.once('dialog', d => d.accept());
  const sp = pg.evaluate(async (id) => { Sheet.activate(id, 3, 0); Sheet.active.r2 = 1; const p = OfficeGrid.textToColumns(); return p; }, xl.sid);
  await pg.waitForTimeout(300); await pg.keyboard.press('Enter'); await sp; await pg.waitForTimeout(300);
  const tc = await pg.evaluate((id) => { const d = Canvas.box(id).sheet; return [3, 4, 5].map(c => Sheet.raw(d, c, 0) + Sheet.raw(d, c, 1)); }, xl.sid);
  check('Text in Spalten (;)', tc.join(',') === 'x1,y2,z3', tc);

  // ================================================================ 3) PowerPoint
  const pp = await pg.evaluate(async () => {
    const p = await OfficePages.newTyped('pptx'); await new Promise(r => setTimeout(r, 800));
    document.activeElement && document.activeElement.blur();
    await OfficeSlides.newSlide('title'); await new Promise(r => setTimeout(r, 300));
    await OfficeSlides.newSlide('content'); await new Promise(r => setTimeout(r, 300));
    const fr = OfficePpt.frames(p);
    return { pid: p.id, n: fr.length, view: OfficeSlides.view(p), lay: p.office.lay, ph: p.boxes.filter(b => b.ph).map(b => b.ph.t), f: fr.map(f => f.id) };
  });
  check('PowerPoint: Lernansicht ist Standard', pp.view === 'lern' && pp.lay === 2, pp);
  check('Folienlayouts: Titelfolie und Titel und Inhalt mit Platzhaltern', pp.n === 3 && pp.ph.join('|') === 'Titel hinzufügen|Untertitel hinzufügen|Titel hinzufügen|Text hinzufügen', pp.ph);
  const ln = await pg.evaluate(async (pp) => {
    const p = Store.pages[pp.pid];
    OfficePpt.focusSlide(pp.f[1]); await new Promise(r => setTimeout(r, 300));
    const title = p.boxes.find(b => b.ph && b.ph.t === 'Titel hinzufügen' && OfficePpt.frameOf(b, p).id === pp.f[1]);
    Canvas.focusText(title.id, true); document.execCommand('insertText', false, 'Mein Vortrag'); Canvas.stopEditing();
    Canvas.select([title.id]); OfficeAnim.setAnim('fade'); const sub = p.boxes.find(b => b.ph && b.ph.t === 'Untertitel hinzufügen'); Canvas.focusText(sub.id, true); document.execCommand('insertText', false, 'Untertitel'); Canvas.stopEditing(); Canvas.select([sub.id]); OfficeAnim.setAnim('fly'); Canvas.select([]);
    await new Promise(r => setTimeout(r, 1500));
    OfficePpt.focusSlide(pp.f[1]); await new Promise(r => setTimeout(r, 400));
    const ap = document.querySelector(`.ofv-ap[data-f="${pp.f[1]}"]`);
    return { ap: !!ap, rows: ap ? [...ap.querySelectorAll('.ap-it')].map(r => r.querySelector('.ap-fx').textContent + '|' + r.querySelector('.ap-lbl').textContent) : [], nadd: !!document.querySelector(`.ofv-nadd[data-f="${pp.f[1]}"]`), badge: document.querySelectorAll('body.ppt-lern .box[data-anim]').length };
  }, pp);
  check('Animationsbereich rechts der Folie: Reihenfolge, Effekt, Feld', ln.ap && ln.rows.join(',') === 'Verblassen|Mein Vortrag,Hineinfliegen|Untertitel', ln);
  check('Lernansicht: Nummern an den Feldern, „Notizen hinzufügen“ links', ln.badge === 2 && ln.nadd, ln);
  await pg.evaluate((pp) => { document.querySelectorAll(`.ofv-ap[data-f="${pp.f[1]}"] .ap-it`)[1].querySelector('.ap-mv').click(); }, pp); await pg.waitForTimeout(300);
  const ord = await pg.evaluate((pp) => [...document.querySelectorAll(`.ofv-ap[data-f="${pp.f[1]}"] .ap-it .ap-lbl`)].map(e => e.textContent), pp);
  check('Animationsbereich: „Früher“ ändert die Reihenfolge', ord.join(',') === 'Untertitel,Mein Vortrag', ord);
  await pg.evaluate((pp) => { document.querySelector(`.ofv-ap[data-f="${pp.f[1]}"] .ap-trg`).click(); }, pp); await pg.waitForTimeout(200);
  await pg.evaluate(() => { const it = [...document.querySelectorAll('.mi')].find(m => /Nach Vorherigem/.test(m.textContent)); it && it.click(); }); await pg.waitForTimeout(300);
  const trg = await pg.evaluate((pp) => Store.pages[pp.pid].boxes.filter(b => b.anim).sort((a, b) => a.anim.n - b.anim.n).map(b => b.anim.start), pp);
  check('Animationsbereich: Auslöser „Nach Vorherigem“', trg[0] === 'after', trg);
  await pg.evaluate((pp) => document.querySelector(`.ofv-nadd[data-f="${pp.f[1]}"]`).click(), pp); await pg.waitForTimeout(250);
  await pg.keyboard.type('Lernnotiz'); await pg.keyboard.press('Escape'); await pg.waitForTimeout(300);
  const nt = await pg.evaluate((pp) => { const p = Store.pages[pp.pid], f = Canvas.box(pp.f[1]); const nb = p.boxes.find(b => b.ox && b.ox.k === 'notiz' && b.ox.f === f.id); return nb && { left: nb.x + nb.w <= f.x, top: Math.abs(nb.y - f.y - 13) < 2, html: nb.html }; }, pp);
  check('Notizen stehen links neben der Folie', nt && nt.left && nt.top && /Lernnotiz/.test(nt.html), nt);
  // Normal
  await pg.evaluate((pp) => { OfficeSlides.setView('normal'); OfficePpt.focusSlide(pp.f[1]); }, pp); await pg.waitForTimeout(400);
  const nm = await pg.evaluate((pp) => ({ v: OfficeSlides.view(), store: (Store.ui.pptView || {})[pp.pid], mask: document.querySelectorAll('.ofv-mask > i').length, ncol: document.querySelector('.ofv-ncol .ofv-ned') && document.querySelector('.ofv-ncol .ofv-ned').textContent, ap: document.querySelectorAll('.ofv-ap').length, notesHidden: Canvas.els.get(Store.pages[pp.pid].boxes.find(b => b.ox && b.ox.k === 'notiz').id).classList.contains('off') }), pp);
  check('Normal: nur die Folie (Abdeckung), Notizspalte zeigt die Notiz, kein Animationsbereich', nm.v === 'normal' && nm.store === 'normal' && nm.mask === 4 && /Lernnotiz/.test(nm.ncol) && nm.ap === 0 && nm.notesHidden, nm);
  const vr2 = await pg.evaluate(() => { const r = Canvas.vp.getBoundingClientRect(); return { x: r.right - 150, y: r.top + r.height / 2 }; });
  await pg.mouse.move(vr2.x, vr2.y); await pg.mouse.wheel(0, 200); await pg.waitForTimeout(400);
  const wi = await pg.evaluate((pp) => OfficePpt.frames(Store.pages[pp.pid]).indexOf(OfficePpt.currentFrame()), pp);
  check('Normal: Mausrad = nächste Folie', wi === 2, wi);
  await pg.evaluate(() => OfficeSlides.setView('lern')); await pg.waitForTimeout(300);
  const vy = await pg.evaluate(() => Canvas.view.y);
  await pg.mouse.move(vr2.x - 300, vr2.y); await pg.mouse.wheel(0, 300); await pg.waitForTimeout(300);
  const vy2 = await pg.evaluate(() => Canvas.view.y);
  check('Lernansicht: Mausrad scrollt frei', vy2 < vy - 100, [vy, vy2]);
  await pg.evaluate(() => OfficeSlides.setView('normal'));
  // Ansicht je Seite: andere PowerPoint-Seite bleibt in der Lernansicht, nach Neuladen bleibt „normal“
  const other = await pg.evaluate(async () => { const p = await OfficePages.newTyped('pptx'); await new Promise(r => setTimeout(r, 600)); return OfficeSlides.view(p); });
  check('Ansicht gilt je Seite (neue Präsentation: Lernansicht)', other === 'lern', other);
  await pg.evaluate(async () => { await Save.flushAll(); UiState.save && (await UiState.save()); }); await pg.waitForTimeout(600);
  await pg.reload(); await pg.waitForFunction(() => typeof OfficeSlides !== 'undefined' && Store.loaded, null, { timeout: 20000 }); await pg.waitForTimeout(1000);
  const rl = await pg.evaluate(async (pid) => { if (typeof Lazy !== 'undefined' && Lazy.has && Lazy.has(pid)) await Lazy.need([pid]); App.openPage(pid); await new Promise(r => setTimeout(r, 900)); return { v: OfficeSlides.view(Store.pages[pid]), mask: document.querySelectorAll('.ofv-mask > i').length }; }, pp.pid);
  check('Nach Neuladen: Normalansicht dieser Seite bleibt', rl.v === 'normal' && rl.mask === 4, rl);
  // Textfeld aufziehen, ausrichten, Führungslinien
  await pg.evaluate(() => OfficeSlides.setView('lern')); await pg.waitForTimeout(300);
  await pg.evaluate((pp) => OfficePpt.focusSlide(pp.f[2]), pp); await pg.waitForTimeout(300);
  await pg.evaluate(() => Cmd.run('slideTextbox'));
  const fr = await pg.evaluate((pp) => { const r = Canvas.els.get(pp.f[2]).querySelector('.fimg').getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; }, pp);
  await pg.mouse.move(fr.x + fr.w * 0.55, fr.y + fr.h * 0.62); await pg.mouse.down(); await pg.mouse.move(fr.x + fr.w * 0.9, fr.y + fr.h * 0.8, { steps: 5 }); await pg.mouse.up(); await pg.waitForTimeout(250);
  await pg.keyboard.type('Aufgezogen'); await pg.keyboard.press('Escape'); await pg.waitForTimeout(250);
  const tbx = await pg.evaluate((pp) => { const p = Store.pages[pp.pid], b = p.boxes.find(x => /Aufgezogen/.test(x.html)), f = Canvas.box(pp.f[2]); const z = Canvas.view.z; Canvas.select([b.id]); OfficeSlides.align('c'); const rf = Canvas.rects.get(f.id), rb = Canvas.rects.get(b.id); return { w: b.w, want: (0.35 * OfficePpt.size(p).w), style: b.style, centered: Math.abs((b.x + rb.w / 2) - (f.x + rf.w / 2)) < 1.5, inFrame: OfficePpt.frameOf(b, p) === f, z }; }, pp);
  check('Textfeld aufziehen: Breite wie gezogen, ohne Rahmen/Füllung, auf der Folie', Math.abs(tbx.w - tbx.want) < 30 && tbx.style.bg === 'transparent' && tbx.inFrame, tbx);
  check('An Folie ausrichten (zentriert)', tbx.centered, tbx);
  await pg.evaluate(() => { Cmd.run('pptToggle', 'pptGuides'); Cmd.run('pptToggle', 'pptGrid'); }); await pg.waitForTimeout(300);
  const gd = await pg.evaluate(() => ({ n: document.querySelectorAll('.ofv-guide.c.g').length }));
  check('Führungslinien und Gitternetz auf den Folien', gd.n >= 1, gd);
  await pg.evaluate(() => { Cmd.run('pptToggle', 'pptGuides'); Cmd.run('pptToggle', 'pptGrid'); });
  const fP = await save(pp.pid, 'folien.pptx');
  if (pyOk) {
    const r = py(`import json\nfrom pptx import Presentation\np=Presentation(${JSON.stringify(fP)})\nprint(json.dumps([[sh.text_frame.text for sh in s.shapes if sh.has_text_frame] for s in p.slides]))`);
    check('Datei: getippte Platzhalter und Textfeld drin, leere Platzhalter nicht', JSON.stringify(r[1]) === JSON.stringify(['Mein Vortrag', 'Untertitel']) && r[2].length === 1 && r[2][0] === 'Aufgezogen', r);
  }
  // Umstellung alter Seiten (Notizen rechts, wenig Abstand) auf die Lernansicht
  const mig = await pg.evaluate(async (pid) => {
    const p = Store.pages[pid], fr = OfficePpt.frames(p), f = fr[1];
    const nb = p.boxes.find(b => b.ox && b.ox.k === 'notiz');
    nb.x = f.x + 1000; p.office.lay = 1;
    OfficeView.sync(true); await new Promise(r => setTimeout(r, 300));
    const g = OfficePpt.frames(p);
    return { lay: p.office.lay, notesLeft: nb.x < g[1].x, gap: g[2].y - g[1].y - OfficePpt.size(p).h };
  }, pp.pid);
  check('Ältere PowerPoint-Seiten: Notizen nach links, viel Abstand', mig.lay === 2 && mig.notesLeft && mig.gap > 200, mig);

  check('keine Skriptfehler', errs.length === 0, errs.join(' | '));
  await br.close();
  console.log(`${ok} von ${ok + bad} Prüfungen bestanden (Office-Seiten 1.67: Word-Klick, ¶, Lineale, Entwurf; Excel unendlich, Formate, bedingte Formatierung; PowerPoint Lern-/Normalansicht, Layouts) – Microsoft Office selbst: ungetestet`);
  process.exit(bad ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
