'use strict';
/* Browser-Test 1.61–1.64: Office-Seiten bearbeiten und verlustfrei speichern – node tests/browser/office-164.js [url] [ordner]
 *  [ordner] optional: weitere Testdateien hello.pptx/.docx/.xlsx (echte Office-Dateien des Users, nicht im Projekt)
 *  - Import (gemeinsamer Import) aller Dateien; unverändert speichern = Byte für Byte die Originaldatei
 *  - PowerPoint: Titel ändern (fett), Bild verschieben, Untertitel löschen, neues Textfeld, neue Folie, Folie
 *    duplizieren / löschen / verschieben, Notizen ändern; Register „Präsentation“; Vorführen (F5, Tasten, Referent)
 *  - Word: Absätze ändern/löschen/ergänzen, Überschrift, Liste, Tabelle – unveränderte Absätze bleiben Original
 *  - Excel: Zellen ändern (auch in geteilten Formeln), neue Formel (deutsch → Excel), Format/Diagramm bleiben
 *  - neue Seiten je Typ (Neue Seite ▾), Register „Office-Datei“, Neuladen: Zuordnung bleibt, Export gleich
 *  - Prüfung der Dateien: tests/office/check-edit.py (python-docx/-pptx, openpyxl, LibreOffice) */
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const { chromium } = require('playwright');
const url = process.argv[2] || 'http://127.0.0.1:8800/index.html';
const extra = process.argv[3] || '';
const FX = path.join(__dirname, '..', 'office', 'fixtures');
const OUT = '/tmp/kt-office-test';
fs.rmSync(OUT, { recursive: true, force: true }); fs.mkdirSync(OUT, { recursive: true });
(async () => {
  const br = await chromium.launch();
  const pg = await br.newPage({ viewport: { width: 1400, height: 860 } });
  const errs = [];
  pg.on('pageerror', e => errs.push(e.message));
  pg.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push(m.text()); });
  await pg.goto(url);
  await pg.waitForFunction(() => typeof OfficePages !== 'undefined' && Store.loaded && Canvas.page, null, { timeout: 20000 });
  await pg.waitForTimeout(800);
  let ok = 0, bad = 0;
  const check = (n, c, info) => { if (c) ok++; else { bad++; console.log('FALSCH', n, info === undefined ? '' : typeof info === 'string' ? info : JSON.stringify(info)); } };
  const files = {};
  for (const n of ['test.docx', 'test.xlsx', 'test.pptx']) files[n] = fs.readFileSync(path.join(FX, n)).toString('base64');
  if (extra) for (const n of ['hello.pptx', 'hello.docx', 'hello.xlsx']) if (fs.existsSync(path.join(extra, n))) { files[n] = fs.readFileSync(path.join(extra, n)).toString('base64'); fs.copyFileSync(path.join(extra, n), path.join(OUT, n)); }
  await pg.evaluate((files) => {
    window.__fx = {};
    for (const [n, b] of Object.entries(files)) { const s = atob(b), u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); window.__fx[n] = u; }
    window.__b64 = async (blob) => { const a = new Uint8Array(await blob.arrayBuffer()); let s = ''; for (let i = 0; i < a.length; i += 0x8000) s += String.fromCharCode.apply(null, a.subarray(i, i + 0x8000)); return btoa(s); };
    window.__eq = async (blob, u) => { const a = new Uint8Array(await blob.arrayBuffer()); if (a.length !== u.length) return false; for (let i = 0; i < a.length; i++) if (a[i] !== u[i]) return false; return true; };
    window.__dl = []; Export.download = (name, blob) => { window.__dl.push({ name, blob }); };
  }, files);
  const save = async (pid, name) => { const r = await pg.evaluate(async (pid) => { const c = await OfficePages.current(Store.pages[pid]); return { b: await window.__b64(c.blob), changed: c.changed }; }, pid); fs.writeFileSync(path.join(OUT, name), Buffer.from(r.b, 'base64')); return r.changed; };

  // 1) Import + unverändert = Original
  const imp = await pg.evaluate(async () => {
    const out = {};
    const before = new Set(Object.keys(Store.pages));
    await OneImport.auto(Object.entries(window.__fx).map(([n, u]) => new File([u], n)));
    for (const p of Object.values(Store.pages).filter(p => !before.has(p.id))) {
      const c = await OfficePages.current(p);
      out[p.office.name] = { id: p.id, type: p.type, same: await window.__eq(c.blob, window.__fx[p.office.name]), changed: c.changed, ox: p.boxes.filter(b => b.ox).map(b => b.ox.k) };
    }
    return out;
  });
  const names = Object.keys(files);
  check('alle Dateien importiert', names.every(n => imp[n]), Object.keys(imp));
  for (const n of names) check(`unverändert gespeichert = Original (${n})`, imp[n] && imp[n].same && !imp[n].changed, imp[n]);
  check('Seitentypen', imp['test.pptx'].type === 'folie' && imp['test.docx'].type === 'dok' && imp['test.xlsx'].type === 'tab');
  check('PowerPoint: Folien, Textfelder, Bild, Diagramm-Platzhalter, Notizen', ['folie', 'sp', 'pic', 'obj', 'notiz'].every(k => imp['test.pptx'].ox.includes(k)), imp['test.pptx'].ox);
  check('Word: Textfelder und Bild zugeordnet', imp['test.docx'].ox.includes('w') && imp['test.docx'].ox.includes('wimg'), imp['test.docx'].ox);
  check('Excel: zwei Blätter zugeordnet', imp['test.xlsx'].ox.filter(k => k === 'xl').length === 2, imp['test.xlsx'].ox);

  // 2) Testdateien bearbeiten
  await pg.evaluate(async (ids) => {
    App.openPage(ids.pptx); await new Promise(r => setTimeout(r, 300));
    let p = Store.pages[ids.pptx];
    const t = p.boxes.find(b => b.ox && b.ox.k === 'sp' && /Round-Trip-Präsentation/.test(b.html)); t.html = t.html.replace('Round-Trip-Präsentation', 'Neuer Titel');
    const nb = p.boxes.find(b => b.ox && b.ox.k === 'notiz' && /Sprechernotiz/.test(b.html)); nb.html = nb.html.replace('Sprechernotiz zu Folie 1', 'Notiz geändert');
    p = Store.pages[ids.docx];
    const w = p.boxes.find(b => b.ox && b.ox.k === 'w' && /Zweiter Punkt/.test(b.html));
    w.html = w.html.replace('Zweiter Punkt', 'Zweiter Punkt (geändert)').replace(/<li[^>]*>Dritter Punkt<\/li>/, '');
    p = Store.pages[ids.xlsx];
    const sh = p.boxes.find(b => b.sheet && b.sheet.name === 'Daten'); Sheet.writeRaw(sh.sheet, 1, 1, '10');
    for (const id of Object.values(ids)) Hist.touchPage(id);   // wie die Oberfläche: geänderte Seiten speichern (1.67)
    Hist.commit('Test');
  }, { pptx: imp['test.pptx'].id, docx: imp['test.docx'].id, xlsx: imp['test.xlsx'].id });
  for (const e of ['pptx', 'docx', 'xlsx']) check(`Testdatei .${e} geändert gespeichert`, await save(imp['test.' + e].id, 'test-ed.' + e) === true);

  // 3) Hello-World-Dateien (falls mitgegeben): wie ein User bearbeiten
  if (imp['hello.pptx']) {
    const r = await pg.evaluate(async (pid) => {
      App.openPage(pid); await new Promise(r => setTimeout(r, 300));
      const p = Store.pages[pid];
      const fr = OfficePpt.frames(p);
      const t = p.boxes.find(b => b.ox && b.ox.k === 'sp' && /Hello/.test(b.html)); t.html = t.html.replace('Hello', 'Hallo <b>Welt</b>');
      const cat = p.boxes.filter(b => b.ox && b.ox.k === 'pic')[1]; cat.x += 30; cat.y += 20;
      const sub = p.boxes.find(b => b.ox && b.ox.k === 'sp' && /World/.test(b.html)); p.boxes.splice(p.boxes.indexOf(sub), 1);
      const f2 = fr[1];
      const nb = Canvas.createBoxAt({ x: 0, y: 0 }, { noFocus: true, w: 300, html: '<div>Neu aus <b>KnowledgeTree</b></div><ul><li>Punkt eins</li><li>Punkt zwei</li></ul>' }); nb.x = f2.x + 60; nb.y = f2.y + 360;
      Canvas.select([f2.id]); await OfficePpt.cmd('new');
      const f3 = OfficePpt.frames(p)[2];
      const nb2 = Canvas.createBoxAt({ x: 0, y: 0 }, { noFocus: true, w: 400, html: '<h1>Dritte Folie</h1><div>Mit Text</div>' }); nb2.x = f3.x + 40; nb2.y = f3.y + 40;
      Canvas.select([fr[0].id]); await OfficePpt.cmd('dup');
      // Folie anlegen und wieder löschen, verschieben hin und zurück: ändert nichts
      Canvas.select([OfficePpt.frames(p)[3].id]); await OfficePpt.cmd('new'); const n5 = OfficePpt.frames(p).length;
      Canvas.select([OfficePpt.frames(p)[4].id]); await OfficePpt.cmd('del'); const n4 = OfficePpt.frames(p).length;
      const y2 = OfficePpt.frames(p)[2].y;
      Canvas.select([OfficePpt.frames(p)[2].id]); await OfficePpt.cmd('up'); const moved = OfficePpt.frames(p)[1].ox.part;
      Canvas.select([OfficePpt.frames(p)[1].id]); await OfficePpt.cmd('down');
      const labels = p.boxes.filter(b => b.ox && b.ox.k === 'label').map(b => b.html.replace(/<[^>]+>/g, '')).sort();
      return { n5, n4, moved, back: OfficePpt.frames(p)[2].y === y2 && OfficePpt.frames(p)[2].ox.part === 'ppt/slides/slide2.xml', labels, inside: OfficePpt.frameOf(nb, p) === OfficePpt.frames(p)[2] };
    }, imp['hello.pptx'].id);
    check('Folien: neu/löschen zählt', r.n5 === 5 && r.n4 === 4, r);
    check('Folie verschieben (hoch und wieder runter)', r.moved === 'ppt/slides/slide2.xml' && r.back, r);
    check('Folien-Beschriftung neu nummeriert', r.labels.join('|') === 'Folie 1|Folie 2|Folie 3|Folie 4', r.labels);
    check('Feld bleibt beim Verschieben auf seiner Folie', r.inside);
    check('hello.pptx geändert gespeichert', await save(imp['hello.pptx'].id, 'hello-ed.pptx') === true);
    // Register und Vorführmodus
    const tabs = await pg.evaluate(() => [...document.querySelectorAll('#tabs .tab:not([hidden])')].map(t => t.textContent));
    check('Register wie PowerPoint (Entwurf, Bildschirmpräsentation)', tabs.includes('Entwurf') && tabs.includes('Bildschirmpräsentation') && !tabs.includes('Layout'), tabs);
    await pg.evaluate(() => { Store.ui.showPresenter = false; Canvas.select([]); Canvas.view.y = 0; Canvas.applyView(); });
    await pg.keyboard.press('F5'); await pg.waitForTimeout(500);
    const s1 = await pg.evaluate(() => ({ on: Show.on, i: Show.i, n: document.querySelector('.kt-show .sh-n').textContent, imgs: document.querySelectorAll('.kt-show .sh-stage img').length, txt: document.querySelector('.kt-show .sh-stage').textContent }));
    check('F5: Vorführen ab Folie 1', s1.on && s1.i === 0 && s1.n === '1 / 4' && s1.imgs >= 3 && /Hallo/.test(s1.txt), s1);
    await pg.keyboard.press('ArrowRight'); await pg.keyboard.press('ArrowRight'); await pg.waitForTimeout(200);
    await pg.keyboard.press('ArrowLeft'); await pg.keyboard.press('End'); await pg.waitForTimeout(200);
    const s2 = await pg.evaluate(() => ({ i: Show.i, txt: document.querySelector('.kt-show .sh-stage').textContent }));
    check('Tasten: weiter/zurück/Ende', s2.i === 3 && /Dritte Folie/.test(s2.txt), s2);
    await pg.keyboard.press('2'); await pg.keyboard.press('Enter'); await pg.waitForTimeout(150);
    check('Zahl + Enter springt zur Folie', await pg.evaluate(() => Show.i === 1));
    await pg.keyboard.press('b'); await pg.waitForTimeout(100);
    const blank = await pg.evaluate(() => document.querySelector('.kt-show .sh-blank').className);
    await pg.keyboard.press('b');
    check('B = schwarzer Bildschirm', /on black/.test(blank), blank);
    await pg.evaluate(() => Show.act('pres')); await pg.waitForTimeout(300);
    const s3 = await pg.evaluate(() => ({ pres: document.querySelector('.kt-show').classList.contains('presenter'), next: document.querySelectorAll('.kt-show .sh-next .sh-slide').length, time: document.querySelector('.kt-show .sh-time').textContent }));
    check('Referentenansicht: nächste Folie und Zeit', s3.pres && s3.next === 1 && /^\d+:\d\d$/.test(s3.time), s3);
    await pg.keyboard.press('Escape'); await pg.waitForTimeout(200);
    check('Esc beendet', await pg.evaluate(() => !Show.on && !document.querySelector('.kt-show')));
    await pg.evaluate(() => { Store.ui.showPresenter = false; });
    // Neu einlesen: Änderungen werden Datei der Seite, danach unverändert
    const rb = await pg.evaluate(async (pid) => {
      App.openPage(pid); await new Promise(r => setTimeout(r, 200));
      await OfficePages.rebuild();
      const p = Store.pages[pid];
      const c = await OfficePages.current(p);
      return { frames: OfficePpt.frames(p).length, dritte: p.boxes.filter(b => /Dritte Folie/.test(b.html)).length, changed: c.changed, hallo: p.boxes.some(b => b.ox && /Hallo/.test(b.html)) };
    }, imp['hello.pptx'].id);
    check('Neu einlesen: Änderungen in der Datei, nichts doppelt', rb.frames === 4 && rb.dritte === 1 && !rb.changed && rb.hallo, rb);
  }
  if (imp['hello.docx']) {
    await pg.evaluate((pid) => { const p = Store.pages[pid]; const t = p.boxes.find(b => b.ox && b.ox.k === 'w'); t.html = '<div>Hallo <b>Welt</b> – geändert</div><h1>Neue Überschrift</h1><ul><li>Erster Punkt</li><li>Zweiter <i>Punkt</i></li></ul><table><tr><td>A</td><td>B</td></tr><tr><td>1</td><td>2</td></tr></table><div style="text-align:center">Zentriert</div>'; }, imp['hello.docx'].id);
    check('hello.docx geändert gespeichert', await save(imp['hello.docx'].id, 'hello-ed.docx') === true);
    await pg.evaluate((pid) => App.openPage(pid), imp['hello.docx'].id); await pg.waitForTimeout(300);
    const tabs = await pg.evaluate(() => [...document.querySelectorAll('#tabs .tab:not([hidden])')].map(t => t.textContent));
    check('Register wie Word (Layout) auf Word-Seite', tabs.includes('Layout') && !tabs.includes('Bildschirmpräsentation') && !tabs.includes('Verbindungen'), tabs);
  }
  if (imp['hello.xlsx']) {
    const v = await pg.evaluate(async (pid) => { App.openPage(pid); await new Promise(r => setTimeout(r, 300)); const p = Store.pages[pid]; const b = p.boxes.find(b => b.sheet); const before = Sheet.value(b.id, 8, 22); Sheet.writeRaw(b.sheet, 6, 21, '100'); Sheet.writeRaw(b.sheet, 0, 0, 'Neu aus KT'); Sheet.writeRaw(b.sheet, 0, 1, '=SUMME(G22;H22)'); return before; }, imp['hello.xlsx'].id);
    check('Excel: geteilte Formel (I23 = I22−J22) rechnet', v === 11, v);
    check('hello.xlsx geändert gespeichert', await save(imp['hello.xlsx'].id, 'hello-ed.xlsx') === true);
  }

  // 4) neue Seiten je Typ
  for (const fmt of ['pptx', 'docx', 'xlsx']) {
    const pid = await pg.evaluate(async (fmt) => {
      const p = await OfficePages.newTyped(fmt);
      if (fmt === 'pptx') { const f = OfficePpt.frames(p)[0]; const b = Canvas.createBoxAt({ x: 0, y: 0 }, { noFocus: true, w: 420, html: '<h1>Meine Präsentation</h1><div>Untertitel</div>' }); b.x = f.x + 60; b.y = f.y + 60; Canvas.select([f.id]); await OfficePpt.cmd('new'); }
      if (fmt === 'docx') { const b = p.boxes.find(b => b.ox && b.ox.k === 'w'); b.html = '<h1>Bericht</h1><div>Erster Absatz mit <b>fett</b>.</div><ul><li>a</li><li>b</li></ul>'; }
      if (fmt === 'xlsx') { const b = p.boxes.find(b => b.sheet); Sheet.writeRaw(b.sheet, 0, 0, 'Zahl'); Sheet.writeRaw(b.sheet, 0, 1, '5'); Sheet.writeRaw(b.sheet, 0, 2, '7'); Sheet.writeRaw(b.sheet, 0, 3, '=SUMME(A2:A3)'); }
      return p.id;
    }, fmt);
    await save(pid, 'neu.' + fmt);
  }
  const menu = await pg.evaluate(() => Ribbon.pageTypes().filter(x => x.label).map(x => x.label));
  check('Neue Seite ▾: vier Seitentypen', menu.length === 4 && /Dokument/.test(menu[1]) && /Tabelle/.test(menu[2]) && /Präsentation/.test(menu[3]), menu);

  // 5) Export-Dialog „Office-Datei“: mehrere Seiten → ZIP mit den geänderten Fassungen
  const ex = await pg.evaluate(async (ids) => {
    window.__dl = []; Export.sel = new Set(ids); await Export.run('office', {});
    const d = window.__dl[0]; if (!d) return null;
    return { name: d.name, files: Ooxml.readZip(new Uint8Array(await d.blob.arrayBuffer())).map(e => e.name).sort() };
  }, [imp['test.pptx'].id, imp['test.docx'].id]);
  check('Export mehrerer Office-Seiten als ZIP', ex && /\.zip$/.test(ex.name) && ex.files.join('|') === 'test.docx|test.pptx', ex);

  // 6) Neuladen: Zuordnung bleibt, gespeicherte Fassung gleich
  const before = fs.readFileSync(path.join(OUT, 'test-ed.docx'));
  await pg.evaluate(async () => { await Save.flushAll(); });
  await pg.waitForTimeout(500);
  await pg.reload();
  await pg.waitForFunction(() => typeof OfficePages !== 'undefined' && Store.loaded, null, { timeout: 20000 });
  await pg.waitForTimeout(1200);
  await pg.evaluate(async (pid) => {
    if (typeof Lazy !== 'undefined' && Lazy.has && Lazy.has(pid)) await Lazy.need([pid]);
    window.__b64 = async (blob) => { const a = new Uint8Array(await blob.arrayBuffer()); let s = ''; for (let i = 0; i < a.length; i += 0x8000) s += String.fromCharCode.apply(null, a.subarray(i, i + 0x8000)); return btoa(s); };
  }, imp['test.docx'].id);
  await save(imp['test.docx'].id, 'test-ed2.docx');
  const after = fs.readFileSync(path.join(OUT, 'test-ed2.docx'));
  const docOf = (buf) => { const t = '/tmp/kt-office-test/_z.docx'; fs.writeFileSync(t, buf); return execFileSync('unzip', ['-p', t, 'word/document.xml']).toString(); };
  check('nach Neuladen: Word-Export gleich', docOf(before) === docOf(after));
  check('keine Skriptfehler', errs.length === 0, errs.join(' | '));
  await br.close();

  // 7) Dateien prüfen (python-docx/-pptx, openpyxl, LibreOffice)
  const res = JSON.parse(execFileSync('python3', [path.join(__dirname, '..', 'office', 'check-edit.py'), OUT], { encoding: 'utf8', maxBuffer: 1 << 24 }));
  for (const [n, r] of Object.entries(res)) check(n, r.ok, r.info);
  console.log(`${ok} von ${ok + bad} Prüfungen bestanden (Office-Seiten bearbeiten 1.61–1.64) – Microsoft Office selbst: ungetestet`);
  process.exit(bad ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
