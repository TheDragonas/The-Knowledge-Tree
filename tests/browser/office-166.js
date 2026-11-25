'use strict';
/* Browser-Test 1.66: Office-Seiten näher an Word/Excel/PowerPoint, Erweiterungen – node tests/browser/office-166.js [url]
 *  - PowerPoint: Register Übergänge/Animationen, Übergang + Eintrittseffekte → p:transition, p:timing/bldLst in der Datei,
 *    Vorführen in Schritten (animierte Felder erst nach Klick), Notizbereich → neue Notizenseite samt Notizenmaster
 *  - Word: Blätter mit Abstand (Seitenansicht), Lineal ab Rand, Schreibbereich ohne Feldrahmen, Seitenfarbe → w:background,
 *    Inhaltsverzeichnis mit Füllpunkten und Seitenzahlen, Register Entwurf/Referenzen
 *  - Excel: Entwicklertools, Add-In (Vorlage) mit eigenen Funktionen und Knopf, Makro ausführen/aufzeichnen, Statusleiste
 *  - Grammatik: Hervorhebung (CSS Highlight), Kontextmenü mit Vorschlag, Korrektur übernehmen
 *  - eigene Schriftart (.ttf, Name aus der Datei) und eigenes Wörterbuch (.aff/.dic)
 * python-pptx/python-docx/LibreOffice prüfen die Dateien, falls vorhanden. Microsoft Office selbst: ungetestet. */
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const { chromium } = require('playwright');
const url = process.argv[2] || 'http://127.0.0.1:8800/index.html';
const OUT = '/tmp/kt-office-166';
fs.rmSync(OUT, { recursive: true, force: true }); fs.mkdirSync(OUT, { recursive: true });
const FONT = ['/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf', '/usr/share/fonts/truetype/liberation/LiberationSerif-Regular.ttf'].find(f => fs.existsSync(f));
const has = (cmd) => { try { execFileSync('sh', ['-c', 'command -v ' + cmd], { stdio: 'ignore' }); return true; } catch (e) { return false; } };
const pyOk = (() => { try { execFileSync('python3', ['-c', 'import pptx, docx'], { stdio: 'ignore' }); return true; } catch (e) { return false; } })();
const py = (code) => JSON.parse(execFileSync('python3', ['-c', code], { encoding: 'utf8' }));
(async () => {
  const br = await chromium.launch();
  const pg = await br.newPage({ viewport: { width: 1440, height: 900 } });
  const errs = [];
  pg.on('pageerror', e => errs.push(e.message));
  pg.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push(m.text()); });
  await pg.goto(url);
  await pg.waitForFunction(() => typeof OfficeAnim !== 'undefined' && Store.loaded && Canvas.page, null, { timeout: 20000 });
  await pg.waitForTimeout(800);
  let ok = 0, bad = 0;
  const check = (n, c, info) => { if (c) ok++; else { bad++; console.log('FALSCH', n, info === undefined ? '' : typeof info === 'string' ? info : JSON.stringify(info)); } };
  const tabs = () => pg.evaluate(() => [...document.querySelectorAll('#tabs .tab:not([hidden])')].map(t => t.textContent));
  const menu = () => pg.evaluate(() => [...document.querySelectorAll('.menu .mi .mi-label, .popup .mi-label')].map(x => x.textContent));
  const save = async (pid, name) => { const b = await pg.evaluate(async (pid) => { const c = await OfficePages.current(Store.pages[pid]); const a = new Uint8Array(await c.blob.arrayBuffer()); let s = ''; for (let i = 0; i < a.length; i += 0x8000) s += String.fromCharCode.apply(null, a.subarray(i, i + 0x8000)); return btoa(s); }, pid); fs.writeFileSync(path.join(OUT, name), Buffer.from(b, 'base64')); return path.join(OUT, name); };
  const unzipText = (file, part) => { try { return execFileSync('unzip', ['-p', file, part], { encoding: 'utf8' }); } catch (e) { return ''; } };

  // ---------------------------------------------------------------- 1) PowerPoint
  const pp = await pg.evaluate(async () => {
    const p = await OfficePages.newTyped('pptx'); await new Promise(r => setTimeout(r, 700));
    document.activeElement && document.activeElement.blur();
    Cmd.run('slideNew'); await new Promise(r => setTimeout(r, 300));
    const fr = OfficePpt.frames(p);
    OfficePpt.focusSlide(fr[0].id);
    // zwei Felder auf Folie 1: Text + zweiter Text
    const f = fr[0];
    const a = OfficePages.addBox(f.x + 60, f.y + 60, 300, '<div>Erster Punkt</div>', { locked: false, office: null });
    const b = OfficePages.addBox(f.x + 60, f.y + 200, 300, '<div>Zweiter Punkt</div>', { locked: false, office: null });
    Canvas.render(); await new Promise(r => setTimeout(r, 200));
    return { pid: p.id, a: a.id, b: b.id, f: f.id };
  });
  await pg.evaluate(() => Ribbon.show('p-trans')); await pg.waitForTimeout(200);
  const tP = await tabs();
  check('PowerPoint-Register mit Übergänge und Animationen', tP.includes('Übergänge') && tP.includes('Animationen'), tP);
  const gal = await pg.evaluate(() => [...document.querySelectorAll('#ribbon .fx-item')].map(e => e.textContent.trim()));
  check('Übergänge: Galerie (Ohne, Schnitt, Verblassen, Schieben, Aufdecken, Bedecken, Form …)', gal.length >= 10 && gal.includes('Aufdecken') && gal.includes('Bedecken') && gal.some(x => /Verblassen/.test(x)) && gal.some(x => /Schieben/.test(x)), gal);
  await pg.evaluate((pp) => { OfficePpt.focusSlide(pp.f); OfficeAnim.setTransition('push'); OfficeAnim.setTransDur && Cmd.run('transDur', 1.0); }, pp);
  await pg.waitForTimeout(1300);
  await pg.evaluate((pp) => { Canvas.select([pp.a]); OfficeAnim.setAnim('fade'); Canvas.select([pp.b]); OfficeAnim.setAnim('fly'); Canvas.select([]); Ribbon.show('p-anim'); }, pp);
  await pg.waitForTimeout(1300);
  const an = await pg.evaluate((pp) => ({ a: Canvas.box(pp.a).anim, b: Canvas.box(pp.b).anim, badge: document.querySelectorAll('body.show-anim .box[data-anim]').length, tr: Canvas.box(pp.f) && Canvas.box(pp.f).ox.tr }), pp);
  check('Animationen: Reihenfolge 1, 2 und Nummern an den Feldern', an.a && an.b && an.a.fx === 'fade' && an.b.fx === 'fly' && an.a.n === 1 && an.b.n === 2 && an.badge === 2, an);
  // Notizbereich (seit 1.67: Normalansicht = Notizspalte links der Folie)
  await pg.evaluate((pp) => { OfficeSlides.setView('normal'); OfficePpt.focusSlide(pp.f); }, pp); await pg.waitForTimeout(400);
  const ned = await pg.$('.ofv-ncol .ofv-ned');
  check('Notizbereich neben der Folie', !!ned);
  if (ned) { await pg.click('.ofv-ncol .ofv-ned'); await pg.keyboard.type('Sprechernotiz eins'); await pg.waitForTimeout(900); }
  const nt = await pg.evaluate((pp) => Store.pages[pp.pid].boxes.filter(b => b.ox && b.ox.k === 'notiz').map(b => ({ f: b.ox.f, t: b.html })), pp);
  check('Notiz gehört zur Folie', nt.length === 1 && nt[0].f === pp.f && /Sprechernotiz eins/.test(nt[0].t), nt);
  const fP = await save(pp.pid, 'anim.pptx');
  const s1 = unzipText(fP, 'ppt/slides/slide1.xml');
  check('Datei: p:transition (Schieben)', /<p:transition[^>]*>\s*<p:push\b/.test(s1), s1.slice(0, 300));
  check('Datei: p:timing mit Eintrittseffekten und bldLst', /<p:timing>/.test(s1) && /presetClass="entr"/.test(s1) && /presetID="10"/.test(s1) && /presetID="2"/.test(s1) && /<p:bldLst>/.test(s1));
  const rels = unzipText(fP, 'ppt/slides/_rels/slide1.xml.rels'), pres = unzipText(fP, 'ppt/presentation.xml');
  check('Datei: neue Notizenseite samt Notizenmaster', /notesSlide/.test(rels) && /<p:notesMasterIdLst>/.test(pres) && /Sprechernotiz eins/.test(unzipText(fP, 'ppt/notesSlides/notesSlide1.xml')));
  if (pyOk) {
    const r = py(`import json; from pptx import Presentation\np=Presentation(${JSON.stringify(fP)})\nprint(json.dumps({'n':len(p.slides),'notes':p.slides[0].has_notes_slide and p.slides[0].notes_slide.notes_text_frame.text}))`);
    check('python-pptx: öffnet, Notiz lesbar', r.n === 2 && r.notes === 'Sprechernotiz eins', r);
  }
  if (has('soffice')) {
    try {
      execFileSync('soffice', ['--headless', '--convert-to', 'odp', '--outdir', OUT, fP], { stdio: 'ignore', timeout: 120000 });
      const c = unzipText(path.join(OUT, 'anim.odp'), 'content.xml');
      check('LibreOffice: Effekte und Übergang erkannt', /ooo-entrance-fade/.test(c) && /ooo-entrance-fly-in/.test(c) && /pushWipe|push/i.test(c), c.length);
    } catch (e) { check('LibreOffice: Umwandlung', false, e.message); }
  }
  // Vorführen in Schritten
  await pg.evaluate((pp) => { Store.ui.showPresenter = false; OfficePpt.focusSlide(pp.f); Show.start('begin'); }, pp); await pg.waitForTimeout(1500);
  const v0 = await pg.evaluate(() => ({ i: Show.i, steps: Show.steps.length, vis: [...document.querySelectorAll('.kt-show .sh-stage [data-bid]')].filter(e => e.style.visibility === 'hidden').length }));
  await pg.evaluate(() => Show.next()); await pg.waitForTimeout(900);
  await pg.evaluate(() => Show.next()); await pg.waitForTimeout(1200);
  const v1 = await pg.evaluate(() => ({ i: Show.i, step: Show.step, hidden: [...document.querySelectorAll('.kt-show .sh-stage [data-bid]')].filter(e => e.style.visibility === 'hidden').length }));
  await pg.evaluate(() => Show.next()); await pg.waitForTimeout(1400);
  const v2 = await pg.evaluate(() => Show.i);
  await pg.keyboard.press('Escape'); await pg.waitForTimeout(200);
  check('Vorführen: animierte Felder erst nach Klick, dann nächste Folie', v0.i === 0 && v0.steps === 2 && v0.vis === 2 && v1.i === 0 && v1.hidden === 0 && v2 === 1, { v0, v1, v2 });
  // Mausrad = nächste Folie (Normalansicht)
  await pg.evaluate((pp) => OfficePpt.focusSlide(pp.f), pp); await pg.waitForTimeout(200);
  const mid = await pg.evaluate(() => { const r = Canvas.vp.getBoundingClientRect(); return { x: r.right - 200, y: r.top + r.height / 2 }; });
  await pg.mouse.move(mid.x, mid.y); await pg.mouse.wheel(0, 200); await pg.waitForTimeout(500);
  const wh = await pg.evaluate(() => OfficePpt.frames(Canvas.page).indexOf(OfficePpt.currentFrame()));
  check('Mausrad blättert Folien', wh === 1, wh);

  // ---------------------------------------------------------------- 2) Word
  const wd = await pg.evaluate(async () => {
    const p = await OfficePages.newTyped('docx'); await new Promise(r => setTimeout(r, 700));
    document.activeElement && document.activeElement.blur();
    const w = p.boxes.find(b => b.ox && b.ox.k === 'w');
    let h = '<h1>Einleitung</h1>'; for (let i = 0; i < 40; i++) h += `<p>Absatz ${i} Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore.</p>`;
    h += '<h2>Zweiter Teil</h2><p>Schluss.</p>';
    w.html = h; Canvas.render(); await new Promise(r => setTimeout(r, 600));
    const P = OfficeView.paper(p);
    const ys = p.boxes.filter(b => b.ox && b.ox.k === 'blatt').map(b => b.y).sort((a, b) => a - b);
    const e = Canvas.els.get(w.id), cs = getComputedStyle(e);
    await new Promise(r => setTimeout(r, 300));
    const paper = Canvas.els.get(p.boxes.find(b => b.ox && b.ox.k === 'blatt').id).querySelector('.fimg').getBoundingClientRect(), rp = document.querySelector('.ofv-ruler .or-page').getBoundingClientRect();
    return { pid: p.id, w: w.id, notesLeft: !!document.querySelector('.ofv-notes, .ofv-slides'), align: [Math.round(paper.left - rp.left), Math.round(paper.width - rp.width)], H: P.H, ys, gap: OfficeView.GAP, ruler: !!document.querySelector('.ofv-ruler .or-page'), nums: [...document.querySelectorAll('.ofv-ruler span')].map(s => s.textContent).slice(0, 4), ow: e.classList.contains('ow'), border: cs.borderTopColor };
  });
  check('Word: Blätter mit Abstand wie in der Seitenansicht', wd.ys.length >= 2 && wd.ys.every((y, i) => !i || Math.abs(y - wd.ys[i - 1] - (wd.H + wd.gap)) < 1), wd);
  check('Word: keine PowerPoint-Leisten übrig, Lineal genau über dem Blatt', !wd.notesLeft && Math.abs(wd.align[0]) <= 1 && Math.abs(wd.align[1]) <= 2, wd);
  check('Word: Lineal zählt ab dem linken Rand', wd.ruler && wd.nums[0] === '2' && wd.nums[1] === '1' && wd.nums[2] === '1', wd.nums);
  check('Word: Schreibbereich ohne Feldrahmen', wd.ow && /rgba\(0, 0, 0, 0\)|transparent/.test(wd.border), wd.border);
  const tW = await tabs();
  check('Word-Register mit Entwurf und Referenzen', tW.includes('Entwurf') && tW.includes('Referenzen'), tW);
  const toc = await pg.evaluate(async (wd) => {
    Canvas.focusText(wd.w, true);
    const t = document.querySelector(`[data-id="${wd.w}"] .box-text`); const rg = document.createRange(); rg.setStart(t.firstChild, 0); rg.collapse(true); const s = getSelection(); s.removeAllRanges(); s.addRange(rg);
    Cmd.run('wToc'); await new Promise(r => setTimeout(r, 300));
    Cmd.run('wPageColor', '#fff4d6'); await new Promise(r => setTimeout(r, 400));
    document.activeElement && document.activeElement.blur();
    return Canvas.box(wd.w).html.slice(0, 900);
  }, wd);
  check('Inhaltsverzeichnis: Überschriften mit Füllpunkten und Seitenzahl', /Einleitung (\. )+\.? ?1</.test(toc) && /Zweiter Teil (\. )+\.? ?2</.test(toc), toc.slice(0, 400));
  const fW = await save(wd.pid, 'seite.docx');
  const dx = unzipText(fW, 'word/document.xml'), st = unzipText(fW, 'word/settings.xml');
  check('Datei: Seitenfarbe w:background + displayBackgroundShape', /<w:background w:color="FFF4D6"/i.test(dx) && /displayBackgroundShape/.test(st));
  if (pyOk) {
    const r = py(`import json, docx\nd=docx.Document(${JSON.stringify(fW)})\nprint(json.dumps([p.text for p in d.paragraphs][:4]))`);
    check('python-docx: öffnet, Verzeichnis vorne', r[0] === 'Inhalt' && /^Einleitung \. .* 1$/.test(r[1]), r);
  }

  // ---------------------------------------------------------------- 3) Excel: Add-Ins, Makros
  // Beispiel-Add-In aus 1.66 (Datei daneben) – läuft auch mit der Schnittstelle 2 (1.69) unverändert
  const old166 = require('fs').readFileSync(require('path').join(__dirname, 'addin-166-beispiel.js'), 'utf8');
  const xl = await pg.evaluate(async (old166) => {
    const p = await OfficePages.newTyped('xlsx'); await new Promise(r => setTimeout(r, 700));
    document.activeElement && document.activeElement.blur();
    Plugins.load(old166, {});
    const sh = p.boxes.find(b => b.sheet);
    Sheet.setCells(sh.id, [[0, 0, '100'], [1, 0, '=BRUTTO(A1)'], [0, 1, '2'], [0, 2, '0'], [0, 3, '4'], [1, 1, '=MITTELOHNENULL(A2:A4)']]);
    await new Promise(r => setTimeout(r, 200));
    const v = [Sheet.value(sh.id, 1, 0), Sheet.value(sh.id, 1, 1)];
    Macros.list(p).push({ name: 'Doppelt', code: "kt.set('D1', kt.get('A1') * 2); kt.setRange('D2', [[7, 8]]);" });
    await Macros.run(Macros.list(p)[0]);
    const m = [Sheet.value(sh.id, 3, 0), Sheet.value(sh.id, 3, 1), Sheet.value(sh.id, 4, 1)];
    Sheet.activate(sh.id, 0, 6); Macros.record();
    const st = document.querySelector('#sb-left').textContent;
    Sheet.setCells(sh.id, [[0, 6, 'Hallo']]);
    const lines = Macros.rec.lines.slice(); Macros.rec = null; Canvas.updateStatus();
    Ribbon.show('x-dev'); await new Promise(r => setTimeout(r, 200));
    const labels = [...document.querySelectorAll('#ribbon .rb-big, #ribbon .rb-small, #ribbon button')].map(e => e.textContent.trim()).filter(Boolean);
    const k = Object.keys(COMMANDS).find(k => k.startsWith('plugin:beispiel')); Cmd.run(k);
    return { pid: p.id, ruler: !!document.querySelector('.ofv-ruler'), frame: getComputedStyle(Canvas.els.get(sh.id)).borderTopColor, v, m, lines, st, st2: document.querySelector('#sb-left').textContent, labels, head: [0, 1, 2, 3].map(c => Sheet.value(sh.id, c, 0)), cat: XL.FN_INFO.filter(f => f.cat === 'Add-Ins').map(f => f.de) };
  }, old166);
  check('Add-In: eigene Funktionen =BRUTTO, =MITTELOHNENULL', Math.abs(xl.v[0] - 108.1) < 1e-9 && xl.v[1] === 3 && xl.cat.includes('BRUTTO'), xl.v);
  check('Makro: kt.get/kt.set/kt.setRange', xl.m[0] === 200 && xl.m[1] === 7 && xl.m[2] === 8, xl.m);
  check('Makro aufzeichnen: Zelländerung → kt.set', xl.lines.length === 1 && xl.lines[0] === 'kt.set("A7", "Hallo");' && /Makro wird aufgezeichnet/.test(xl.st), xl);
  check('Excel: kein Word-Lineal übrig, Blatt ohne Feldrahmen', !xl.ruler && /rgba\(0, 0, 0, 0\)|transparent/.test(xl.frame), [xl.ruler, xl.frame]);
  check('Statusleiste Excel: Bereit · Blatt 1 von 1', /^Bereit\s+·\s+Blatt 1 von 1/.test(xl.st2), xl.st2);
  check('Entwicklertools: Makros, Aufzeichnen, Add-Ins, Knopf des Add-Ins', ['Makros', 'Add-Ins', 'Kopfzeile'].every(x => xl.labels.some(l => l.includes(x))) && xl.labels.some(l => /aufzeichnen/.test(l)), xl.labels);
  check('Knopf des Add-Ins schreibt die Kopfzeile', xl.head.join('|') === 'Artikel|Menge|Preis|Summe', xl.head);
  const tX = await tabs();
  check('Excel-Register mit Entwicklertools', tX.includes('Entwicklertools'), tX);

  // ---------------------------------------------------------------- 4) Grammatik
  const gr = await pg.evaluate(async () => {
    Ops.newPage(); await new Promise(r => setTimeout(r, 300));
    document.activeElement && document.activeElement.blur();
    const p = Canvas.page, id = uid('b');
    p.boxes.push({ id, x: 120, y: 120, w: 520, html: 'Das ist ist ein Test.der Satz geht weiter ,und hier. Ich glaube dass das stimmt.', images: [] });
    Canvas.render(); await new Promise(r => setTimeout(r, 1200));
    const h = CSS.highlights && CSS.highlights.get('kt-grammar');
    return { id, size: h ? h.size : -1, hits: (Grammar.boxes.get(id) || []).map(x => x.msg) };
  });
  check('Grammatik: Fehler hervorgehoben (doppeltes Wort, Leerzeichen, Komma)', gr.size >= 4 && gr.hits.some(m => /Doppeltes Wort/.test(m)) && gr.hits.some(m => /Komma vor „dass“/.test(m)) && gr.hits.some(m => /Leerzeichen vor/.test(m)), gr);
  const at = await pg.evaluate((id) => { const t = document.querySelector(`[data-id="${id}"] .box-text`); const w = document.createTreeWalker(t, NodeFilter.SHOW_TEXT); const n = w.nextNode(); const r = document.createRange(); r.setStart(n, 8); r.setEnd(n, 10); const b = r.getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; }, gr.id);
  await pg.mouse.click(at.x, at.y, { button: 'right' }); await pg.waitForTimeout(300);
  const gm = await menu();
  check('Grammatik: Kontextmenü mit Vorschlag, Ignorieren, Ausschalten', gm.some(x => /Ändern in „ist“/.test(x)) && gm.includes('Ignorieren') && gm.some(x => /Grammatikprüfung ausschalten/.test(x)), gm.slice(0, 5));
  await pg.locator('.mi', { hasText: 'Ändern in' }).first().click();
  await pg.waitForTimeout(500);
  const fixed = await pg.evaluate((id) => Canvas.box(id).html, gr.id);
  check('Grammatik: Korrektur übernommen', /^Das ist ein Test/.test(fixed.replace(/<[^>]+>/g, '')), fixed);
  await pg.keyboard.press('Escape');

  // ---------------------------------------------------------------- 5) Schriftart, Wörterbuch
  if (FONT) {
    const fc = pg.waitForEvent('filechooser'); await pg.evaluate(() => { Fonts.add(); }); await (await fc).setFiles(FONT); await pg.waitForTimeout(900);
    const fo = await pg.evaluate(() => { const f = (Store.ui.fonts || [])[0]; return { f, inList: f && FONTS.includes(f.name), ok: f && document.fonts.check(`16px "${f.name}"`) }; });
    check('Schriftart hinzufügen: Name aus der Datei, in der Auswahl, geladen', fo.f && /^(DejaVu Serif|Liberation Serif)$/.test(fo.f.name) && fo.inList && fo.ok, fo);
  }
  fs.writeFileSync(path.join(OUT, 'Testisch.aff'), 'SET UTF-8\nTRY esianrtolcdugmphbyfvkwz\n\nSFX S Y 1\nSFX S 0 en .\n');
  fs.writeFileSync(path.join(OUT, 'Testisch.dic'), '3\nkatz/S\nhund\nbaum/S\n');
  const fc2 = pg.waitForEvent('filechooser'); await pg.evaluate(() => { window.__dp = Spell.addDictionary(); }); await (await fc2).setFiles([path.join(OUT, 'Testisch.aff'), path.join(OUT, 'Testisch.dic')]);
  await pg.waitForTimeout(500); await pg.keyboard.press('Enter'); await pg.waitForTimeout(1200);
  const dc = await pg.evaluate(async () => { await window.__dp; const e = Spell.engines.get('x-testisch'); return { langs: Spell.opts().langs, label: SPELL_LANGS['x-testisch'] && SPELL_LANGS['x-testisch'].label, ok: e ? [e.check('katzen'), e.check('hund'), e.check('hunden')] : null }; });
  check('Wörterbuch hinzufügen (.aff/.dic): Sprache eingeschaltet, Wörter geprüft', dc.langs.includes('x-testisch') && dc.label === 'Testisch' && dc.ok && dc.ok.join() === 'true,true,false', dc);
  await pg.evaluate(() => Ribbon.show('ueberpruefen')); await pg.waitForTimeout(200);
  const rv = await pg.evaluate(() => [...document.querySelectorAll('#ribbon button')].map(e => e.textContent.trim()));
  check('Überprüfen: Grammatik, Wörterbuch, Schriftart', rv.some(x => /Grammatik/.test(x)) && rv.some(x => /Wörterbuch/.test(x)) && rv.some(x => /Schriftart/.test(x)), rv);

  check('keine Skriptfehler', errs.length === 0, errs.join(' | '));
  await br.close();
  console.log(`${ok} von ${ok + bad} Prüfungen bestanden (Office-Seiten 1.66: Übergänge, Animationen, Notizen, Seitenansicht, Add-Ins, Makros, Grammatik, Schriftarten, Wörterbücher) – Microsoft Office selbst: ungetestet`);
  process.exit(bad ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
