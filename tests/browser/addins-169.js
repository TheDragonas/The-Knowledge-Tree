'use strict';
/* Browser-Test 1.69: Add-Ins – node tests/browser/addins-169.js [url]
 *  - Register „Add-Ins“ in allen Seitentypen, Häkchen je Add-In (Klick schaltet ein/aus, bleibt nach Neuladen)
 *  - Chem-Draw als eingebautes Add-In: Gruppen Chemie/Reaktion im Register Zeichnen (alle Seitentypen, vor „Hilfsmittel“),
 *    Befehle, Doppelklick/Rechtsklick auf Strukturformeln, Fachwörter, Hilfe – ausgeschaltet alles weg, Bilder bleiben
 *  - Schnittstelle 2: addTab, addGroup (before), addButton (check, menu, small), addIcon, addMenuItem, addShortcut,
 *    addStyle, addWords, addHelp, addFunction, Ereignisse, canvas.insertText/insertImage, commit; Ausschalten räumt
 *    alles weg und stellt überschriebene Befehle wieder her; Fehler im setup hinterlassen nichts
 *  - die Beispiele aus der KI-Vorlage laufen (seit 1.70 eine .js-Datei, Beispiele im Kommentar); Add-In im Stil von 1.66 */
const { chromium } = require('playwright');
const url = process.argv[2] || 'http://127.0.0.1:8800/index.html';
(async () => {
  const br = await chromium.launch();
  let ok = 0, bad = 0;
  const check = (n, c, info) => { if (c) ok++; else { bad++; console.log('FALSCH', n, info === undefined ? '' : typeof info === 'string' ? info : JSON.stringify(info)); } };
  const errs = [];
  const ctx = await br.newContext({ viewport: { width: 1440, height: 900 } });
  const pg = await ctx.newPage();
  pg.on('pageerror', e => errs.push(e.message));
  pg.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push(m.text()); });
  const boot = async () => { await pg.waitForFunction(() => typeof Plugins !== 'undefined' && Store.loaded && Canvas.page, null, { timeout: 20000 }); await pg.waitForTimeout(900); };
  await pg.goto(url); await boot();
  const labels = (tab) => pg.evaluate((t) => { Ribbon.show(t); return [...document.querySelectorAll('#panel .rgroup > .rg-label')].map(x => x.textContent); }, tab);

  // ---------------------------------------------------------------- 1) Register und Chem-Draw in allen Seitentypen
  const pages = await pg.evaluate(async () => {
    const out = { frei: Canvas.pageId };
    for (const t of ['docx', 'xlsx', 'pptx']) { const p = await OfficePages.newTyped(t); await new Promise(r => setTimeout(r, 700)); out[t] = p.id; }
    return out;
  });
  for (const [k, pid] of Object.entries(pages)) {
    await pg.evaluate((id) => App.openPage(id), pid); await pg.waitForTimeout(500);
    const tabs = await pg.evaluate(() => [...document.querySelectorAll('#tabs .tab')].map(t => t.dataset.tab));
    check(`${k}: Register „Add-Ins“`, tabs.includes('addins'), tabs);
    const z = await labels('zeichnen');
    const iC = z.indexOf('Chemie'), iR = z.indexOf('Reaktion'), iH = z.indexOf('Hilfsmittel');
    check(`${k}: Zeichnen → Chemie, Reaktion vor Hilfsmittel`, iC >= 0 && iR === iC + 1 && iH === iR + 1, z);
  }
  await pg.evaluate((id) => App.openPage(id), pages.frei); await pg.waitForTimeout(400);

  // Strukturformel auf die Seite (Chem-Draw → Übernehmen)
  await pg.evaluate(() => { Chem.open(null); const m = ChemSmiles.toMol('CCO'); Chem.change(() => { Chem.E.mol = m; }); Chem.fit(); Chem.applyView(); });
  await pg.waitForTimeout(300);
  await pg.evaluate(() => Chem.ok()); await pg.waitForTimeout(900);
  const chem = await pg.evaluate(() => { const b = Canvas.page.boxes.find(x => x.images.some(i => i.chem)); return b && { box: b.id, img: b.images.find(i => i.chem).id }; });
  check('Strukturformel eingefügt', !!chem);
  const isChemEl = () => pg.evaluate((c) => { const e = document.querySelector(`.box[data-id="${c.box}"] .fimg[data-img="${c.img}"]`); return e ? e.classList.contains('is-chem') : null; }, chem);
  check('Strukturformel gekennzeichnet (imageRender)', await isChemEl() === true);
  const dbl = async () => {
    const r = await pg.evaluate((c) => { const e = document.querySelector(`.box[data-id="${c.box}"] .fimg[data-img="${c.img}"]`); const q = e.getBoundingClientRect(); return { x: q.left + q.width / 2, y: q.top + q.height / 2 }; }, chem);
    await pg.mouse.dblclick(r.x, r.y); await pg.waitForTimeout(600);
    const res = await pg.evaluate(() => ({ editor: !!(typeof Chem !== 'undefined' && Chem.E), lightbox: !!document.querySelector('.lightbox, .lb-back, .kt-lightbox') }));
    await pg.evaluate(() => { if (Chem.E) Chem.close(); }); await pg.keyboard.press('Escape'); await pg.waitForTimeout(200);
    await pg.evaluate(() => document.querySelectorAll('.lightbox, .lb-back, .kt-lightbox').forEach(x => x.remove()));
    return res;
  };
  check('Doppelklick öffnet Chem-Draw', (await dbl()).editor);
  const ctxMenu = async () => {
    await pg.evaluate((c) => { Canvas.select([c.box]); Canvas.selImg = { box: c.box, img: c.img }; }, chem);
    const r = await pg.evaluate((c) => { const e = document.querySelector(`.box[data-id="${c.box}"] .fimg[data-img="${c.img}"]`); const q = e.getBoundingClientRect(); return { x: q.left + q.width / 2, y: q.top + q.height / 2 }; }, chem);
    await pg.mouse.click(r.x, r.y, { button: 'right' }); await pg.waitForTimeout(300);
    const t = await pg.evaluate(() => [...document.querySelectorAll('.popup .mi, .menu .mi, .popup button')].map(x => x.textContent.trim()).join('|'));
    await pg.keyboard.press('Escape'); await pg.evaluate(() => UI.closePopup && UI.closePopup()); await pg.waitForTimeout(150);
    return t;
  };
  check('Rechtsklick: „Struktur bearbeiten (Chem-Draw)“', /Struktur bearbeiten/.test(await ctxMenu()));
  const fach = () => pg.evaluate(() => { Spell._fach = null; Spell.fachSet(); return Plugins.allWords().length > 100; });
  check('Fachwörter aus Chem-Draw (Element- und Molekülnamen)', await fach());
  const help = () => pg.evaluate(() => Plugins.helpRows().some(r => r[0] === 'h' && /Chem-Draw/.test(r[1])));
  check('Hilfe: Abschnitt Chem-Draw', await help());

  // ---------------------------------------------------------------- 2) Häkchen im Register „Add-Ins“
  await labels('addins');
  const chk = '#panel .rb.chk[data-addin="chemdraw"]';
  check('Häkchen „Chem-Draw“ angehakt', await pg.evaluate((s) => { const b = document.querySelector(s); return !!b && b.classList.contains('on') && /Chem-Draw/.test(b.textContent); }, chk));
  await pg.click(chk); await pg.waitForTimeout(500);
  check('ausgeschaltet: Häkchen leer', await pg.evaluate((s) => { const b = document.querySelector(s); return !!b && !b.classList.contains('on'); }, chk));
  check('ausgeschaltet: gespeichert', await pg.evaluate(() => Store.ui.addins.chemdraw === false));
  check('ausgeschaltet: Befehle weg', await pg.evaluate(() => !COMMANDS.chemDraw && !COMMANDS.chemTool && !COMMANDS.chemPse && !COMMANDS.chemFormula));
  let z = await labels('zeichnen');
  check('ausgeschaltet: keine Chemie/Reaktion im Register Zeichnen', !z.includes('Chemie') && !z.includes('Reaktion') && z.includes('Hilfsmittel'), z);
  check('ausgeschaltet: Bild bleibt, ohne Kennzeichnung', await isChemEl() === false);
  const d2 = await dbl();
  check('ausgeschaltet: Doppelklick = Grossansicht statt Editor', !d2.editor, d2);
  check('ausgeschaltet: kein Rechtsklick-Eintrag', !/Struktur bearbeiten/.test(await ctxMenu()));
  check('ausgeschaltet: keine Chem-Fachwörter', !(await fach()));
  check('ausgeschaltet: kein Hilfe-Abschnitt', !(await help()));
  // neu laden: bleibt aus (auch das frühe Menüband)
  await pg.evaluate(() => UiState.saveSoon.flush && UiState.saveSoon.flush()); await pg.waitForTimeout(600);
  await pg.reload(); await boot();
  check('nach Neuladen: weiter aus', await pg.evaluate(() => !Plugins.defs.has('chemdraw') && !COMMANDS.chemDraw));
  z = await labels('zeichnen');
  check('nach Neuladen: Register Zeichnen ohne Chemie', !z.includes('Chemie'), z);
  await labels('addins');
  await pg.click(chk); await pg.waitForTimeout(500);
  z = await labels('zeichnen');
  check('wieder eingeschaltet: Chemie und Reaktion zurück', z.includes('Chemie') && z.includes('Reaktion') && !!(await pg.evaluate(() => COMMANDS.chemDraw)), z);
  await pg.evaluate((id) => App.openPage(id), pages.frei); await pg.waitForTimeout(400);
  check('wieder eingeschaltet: Struktur gekennzeichnet', await isChemEl() === true);
  check('wieder eingeschaltet: Doppelklick = Editor', (await dbl()).editor);
  check('Zeichnen → Chem-Draw-Knopf öffnet den Editor', await pg.evaluate(async () => { Ribbon.show('zeichnen'); document.querySelector('#panel [data-cmd="chemDraw"]').click(); await new Promise(r => setTimeout(r, 300)); const o = !!Chem.E; Chem.close(); return o; }));

  // ---------------------------------------------------------------- 3) Schnittstelle 2
  pages.leer = await pg.evaluate(async () => { Cmd.run('newTypedPage', 'frei'); await new Promise(r => setTimeout(r, 700)); return Canvas.pageId; });
  const api = await pg.evaluate(async () => {
    const out = {}, log = [];
    COMMANDS.testAlt = { run: () => log.push('alt') };
    const code = `KnowledgeTree.register({ id: 'test-voll', name: 'Testvoll', version: '2.0', requires: '1.69', desc: 'Test',
      setup(api) {
        api.addIcon('testIcon', '<circle cx="12" cy="12" r="8"/>');
        api.addCommand('testAlt', { run: () => window.__log.push('neu') });
        api.addCommand('testCheck', { run: () => api.store.set('an', !api.store.get('an')), active: () => !!api.store.get('an') });
        api.addTab({ id: 'test-reg', label: 'Testregister', after: 'einfuegen' });
        api.addButton({ tab: 'test-reg', group: 'G1', label: 'Gross', icon: 'testIcon', run: () => window.__log.push('gross') });
        api.addButton({ tab: 'test-reg', group: 'G1', label: 'Klein1', small: true, run: () => {} });
        api.addButton({ tab: 'test-reg', group: 'G1', label: 'Klein2', small: true, run: () => {} });
        api.addButton({ tab: 'test-reg', group: 'G1', label: 'Häkchen', check: true, cmd: 'testCheck' });
        api.addButton({ tab: 'test-reg', group: 'G2', label: 'Menü', menu: [{ label: 'Eins', run: () => window.__log.push('menü') }] });
        api.addGroup({ tab: 'zeichnen', label: 'TestVor', before: 'Formen', build: (R) => [R.big('testAlt', 'X', 'testIcon')] });
        api.addGroup({ tab: 'start', mode: 'dok', label: 'NurWord', build: (R) => R.small('testAlt', 'W', 'testIcon') });
        api.addMenuItem({ where: 'canvas', label: 'Testeintrag Fläche', run: (c) => window.__log.push('fläche') });
        api.addMenuItem({ where: 'box', label: 'Testeintrag Feld', when: (c) => !!c.box, run: (c) => window.__log.push('feld') });
        api.addShortcut('Strg+Alt+Q', () => window.__log.push('taste'), 'Test');
        api.addStyle('.test-voll-x { color: rgb(1, 2, 3); }');
        api.addWords(['Quarkwortzz']);
        api.addHelp('Testhilfe', [['A', 'B']]);
        api.addFunction('TESTDOPPEL', (x) => x * 2, { min: 1, max: 1 });
        api.on('pageOpen', (e) => window.__log.push('seite:' + e.type));
        api.on('selectionChange', (e) => window.__log.push('auswahl:' + e.ids.length));
        api.on('imageRender', ({ image, el }) => { if (image['test-voll']) el.classList.add('test-voll-bild'); });
        api.on('imageOpen', ({ image }) => { if (!image['test-voll']) return false; window.__log.push('bild-offen'); return true; });
        const t = setInterval(() => {}, 100000);
        return () => { clearInterval(t); window.__log.push('aufgeräumt'); };
      } });`;
    window.__log = log;
    for (const d of Plugins.parse(code)) Plugins.activate(d, { source: 'notizbuch' });
    await new Promise(r => setTimeout(r, 100));
    out.active = Plugins.defs.has('test-voll');
    out.tabs = Ribbon.TABS.map(t => t.id);
    Ribbon.buildStrip(); Ribbon.show('test-reg');
    const P = document.querySelector('#panel');
    out.groups = [...P.querySelectorAll('.rgroup > .rg-label')].map(x => x.textContent);
    out.smallInCol = !!P.querySelector('.rcol .rb.small');
    out.icon = !!P.querySelector('.rb.big svg circle');
    const ck = P.querySelector('.rb.chk'); out.chk0 = ck.classList.contains('on'); ck.click(); await new Promise(r => setTimeout(r, 50)); Ribbon.refresh(); out.chk1 = P.querySelector('.rb.chk').classList.contains('on');
    [...P.querySelectorAll('.rb.big')].find(b => /Gross/.test(b.textContent)).click();
    [...P.querySelectorAll('.rb')].find(b => /Menü/.test(b.textContent)).click(); await new Promise(r => setTimeout(r, 100));
    const mi = [...document.querySelectorAll('.popup .mi, .popup button')].find(x => /Eins/.test(x.textContent)); if (mi) mi.click();
    Ribbon.show('zeichnen');
    const zl = [...document.querySelectorAll('#panel .rgroup > .rg-label')].map(x => x.textContent);
    out.before = zl.indexOf('TestVor') === zl.indexOf('Formen') - 1;
    Ribbon.show('start'); out.nurWordFrei = [...document.querySelectorAll('#panel .rg-label')].some(x => x.textContent === 'NurWord');
    Cmd.run('testAlt');
    out.style = getComputedStyle(Object.assign(document.body.appendChild(document.createElement('span')), { className: 'test-voll-x' })).color;
    Spell._fach = null; out.word = Spell.fachSet().has('quarkwortzz');
    out.help = Plugins.helpRows().some(r => r[1] === 'Testhilfe');
    out.fn = XL.F.TESTDOPPEL && XL.F.TESTDOPPEL.fn([21]);
    out.fnInfo = XL.FN_INFO.some(f => f.en === 'TESTDOPPEL');
    // Text und Bild einfügen
    const b = Plugins.defs.get('test-voll').api.canvas.insertText('<b>Hallo Add-In</b>');
    out.text = !!b && /Hallo Add-In/.test(b.html);
    const svg = new Blob(['<svg xmlns="http://www.w3.org/2000/svg" width="240" height="140"><rect width="240" height="140" fill="red"/></svg>'], { type: 'image/svg+xml' });
    const cc = Canvas.viewCenter(); const r = await Plugins.defs.get('test-voll').api.canvas.insertImage(svg, { at: { x: cc.x + 260, y: cc.y + 160 }, data: { 'test-voll': { a: 1 } } });
    out.img = !!(r && r.image && r.image['test-voll']);
    out.imgId = r && { box: r.box.id, img: r.image.id };
    await new Promise(r2 => setTimeout(r2, 300));
    out.imgEl = !!document.querySelector('.fimg.test-voll-bild');
    return out;
  });
  check('API: Add-In aktiv', api.active);
  check('API: eigenes Register nach „Einfügen“', api.tabs.indexOf('test-reg') === api.tabs.indexOf('einfuegen') + 1, api.tabs);
  check('API: Gruppen im eigenen Register', api.groups.join() === 'G1,G2', api.groups);
  check('API: kleine Knöpfe untereinander, eigenes Symbol', api.smallInCol && api.icon);
  check('API: Häkchen-Knopf folgt active', api.chk0 === false && api.chk1 === true, api);
  check('API: addGroup vor „Formen“', api.before);
  check('API: mode dok nicht auf Freiform', !api.nurWordFrei);
  check('API: Stil, Wörter, Hilfe, Funktion', api.style === 'rgb(1, 2, 3)' && api.word && api.help && api.fn === 42 && api.fnInfo, api);
  check('API: insertText, insertImage (+ eigene Angaben), imageRender', api.text && api.img && api.imgEl, api);
  // Tastenkürzel, Ereignisse, Kontextmenüs
  await pg.evaluate(() => { document.activeElement && document.activeElement.blur(); Canvas.select([]); });
  await pg.keyboard.press('Control+Alt+q'); await pg.waitForTimeout(100);
  await pg.evaluate((id) => App.openPage(id), pages.docx); await pg.waitForTimeout(500);
  const wordStart = await labels('start');
  check('API: Gruppe nur auf Word-Seiten', wordStart.includes('NurWord'), wordStart);
  await pg.evaluate((id) => App.openPage(id), pages.leer); await pg.waitForTimeout(500);
  await pg.evaluate(() => Canvas.select([Canvas.page.boxes[0].id]));
  // Doppelklick auf das eigene Bild
  const ir = await pg.evaluate((c) => { Canvas.select([c.box]); const e = document.querySelector(`.box[data-id="${c.box}"] .fimg[data-img="${c.img}"]`); if (!e) return null; const q = e.getBoundingClientRect(); const x = q.left + q.width / 2, y = q.top + q.height / 2; const top = document.elementFromPoint(x, y); return { x, y, top: top && top.className, tag: top && top.tagName, par: top && top.parentElement && top.parentElement.className, tool: Draw.tool, ed: Canvas.editing }; }, api.imgId);
  if (!ir || (!/fimg/.test(ir.top) && ir.tag !== 'IMG')) console.log('Bild für Doppelklick:', ir);
  if (ir) { await pg.mouse.dblclick(ir.x, ir.y); await pg.waitForTimeout(300); }
  // Rechtsklick freie Fläche
  await pg.keyboard.press('Escape'); await pg.waitForTimeout(100);
  const vp = await pg.evaluate(() => { const r = Canvas.vp.getBoundingClientRect(); for (let y = r.bottom - 40; y > r.top + 40; y -= 30) for (let x = r.left + 40; x < r.right - 40; x += 30) { const e = document.elementFromPoint(x, y); if (e === Canvas.vp || (e && e.closest && e.closest('#viewport') && !e.closest('.box, .fimg, svg, .pkg'))) return { x, y }; } return { x: r.left + 40, y: r.bottom - 40 }; });
  await pg.mouse.click(vp.x, vp.y, { button: 'right' }); await pg.waitForTimeout(250);
  const flMenu = await pg.evaluate(() => { const it = [...document.querySelectorAll('.popup .mi, .popup button')].find(x => /Testeintrag Fläche/.test(x.textContent)); if (it) it.click(); return !!it; });
  await pg.waitForTimeout(150);
  const log = await pg.evaluate(() => window.__log.slice());
  check('API: überschriebener Befehl ruft das Add-In', log.includes('neu') && !log.includes('alt'), log);
  check('API: Knopf und Aufklappmenü', log.includes('gross') && log.includes('menü'), log);
  check('API: Tastenkürzel Strg+Alt+Q', log.includes('taste'), log);
  check('API: Ereignisse pageOpen (dok) und selectionChange', log.includes('seite:dok') && log.some(x => /^auswahl:/.test(x)), log);
  check('API: imageOpen für das eigene Bild', log.includes('bild-offen'), log);
  check('API: Rechtsklick-Eintrag auf der freien Fläche', flMenu && log.includes('fläche'), log);
  // Ausschalten: alles weg, alter Befehl zurück
  const off = await pg.evaluate(async () => {
    await Plugins.setOn('test-voll', false);
    const o = {};
    o.cleanup = window.__log.includes('aufgeräumt');
    o.tab = !Ribbon.TABS.some(t => t.id === 'test-reg') && !document.querySelector('#tabs .tab[data-tab="test-reg"]');
    Ribbon.show('zeichnen'); o.group = ![...document.querySelectorAll('#panel .rg-label')].some(x => x.textContent === 'TestVor');
    window.__log.length = 0; Cmd.run('testAlt'); o.restored = window.__log.join() === 'alt';
    o.check = !COMMANDS.testCheck && !Object.keys(COMMANDS).some(k => k.startsWith('plugin:test-voll:'));
    o.icon = !ICONS.testIcon;
    o.style = !document.querySelector('style[data-addin="test-voll"]');
    Spell._fach = null; o.word = !Spell.fachSet().has('quarkwortzz');
    o.help = !Plugins.helpRows().some(r => r[1] === 'Testhilfe');
    o.fn = !XL.F.TESTDOPPEL && !XL.FN_INFO.some(f => f.en === 'TESTDOPPEL');
    o.menus = !Plugins.menus.some(m => m.plugin === 'test-voll') && !Plugins.keys.some(m => m.plugin === 'test-voll');
    o.hooks = !Object.values(Plugins.hooks).some(l => l.some(h => h.plugin === 'test-voll'));
    o.img = !document.querySelector('.fimg.test-voll-bild') && Canvas.page.boxes.some(b => b.images.some(i => i['test-voll']));
    return o;
  });
  check('Ausschalten räumt alles weg (Register, Gruppen, Befehle, Symbol, Stil, Wörter, Hilfe, Funktion, Menüs, Ereignisse)', Object.values(off).every(Boolean), off);
  await pg.keyboard.press('Escape');

  // Fehler im setup: nichts bleibt zurück
  const fail = await pg.evaluate(() => {
    const n0 = Object.keys(COMMANDS).length;
    const d = Plugins.parse(`KnowledgeTree.register({ id: 'kaputt', name: 'Kaputt', setup(api) { api.addCommand('kaputtCmd', { run() {} }); api.addButton({ label: 'K', run() {} }); throw new Error('absichtlich'); } });`)[0];
    const r = Plugins.activate(d, { source: 'notizbuch' }, true);
    return { r: r === null, n: Object.keys(COMMANDS).length === n0, def: !Plugins.defs.has('kaputt'), btn: !Plugins.buttons.some(b => b.plugin === 'kaputt'), err: Plugins.errors.some(e => /Kaputt: absichtlich/.test(e)) };
  });
  check('Fehler im setup: gemeldet, nichts bleibt', Object.values(fail).every(Boolean), fail);
  check('requires: zu neue Version wird abgelehnt', await pg.evaluate(() => { try { Plugins.register({ id: 'zukunft', requires: '9.0', setup() {} }); return false; } catch (e) { return /9\.0/.test(e.message) && !Plugins.defs.has('zukunft'); } }));
  check('ohne register: Fehlermeldung', await pg.evaluate(() => { try { Plugins.parse('var x = 1;'); return false; } catch (e) { return /register/.test(e.message); } }));

  // ---------------------------------------------------------------- 4) Vorlagen: Beispiele laufen
  const tpl = await pg.evaluate(async () => {
    const md = await Plugins.templateText();
    const blocks = [...md.matchAll(/```js\n([\s\S]*?)```/g)].map(m => m[1]).filter(c => /KnowledgeTree\.register/.test(c));
    const o = { md: md.length, blocks: blocks.length, ids: [] };
    for (const c of blocks) { for (const d of Plugins.parse(c)) { const r = Plugins.activate(d, { source: 'notizbuch' }, true); o.ids.push(d.id + ':' + !!r); } }
    o.kmh = XL.F.KMH && XL.F.KMH.fn([10]);
    o.stempelTab = Ribbon.TABS.some(t => t.id === 'stempel');
    // Stempel einfügen
    const n0 = Canvas.page.boxes.length;
    Ribbon.buildStrip(); Ribbon.show('stempel');
    const btn = [...document.querySelectorAll('#panel .rb.big')].find(b => /Erledigt/.test(b.textContent));
    if (btn) btn.click();
    await new Promise(r => setTimeout(r, 900));
    o.stempel = Canvas.page.boxes.length === n0 + 1 && Canvas.page.boxes[Canvas.page.boxes.length - 1].images.some(i => i.stempel && i.stempel.text === 'Erledigt');
    o.farbe = (() => { const c = [...document.querySelectorAll('#panel .rb.chk')]; return c.length === 3 && c.filter(x => x.classList.contains('on')).length === 1; })();
    for (const id of ['einheiten', 'stempel']) await Plugins.setOn(id, false);
    o.offClean = !XL.F.KMH && !Ribbon.TABS.some(t => t.id === 'stempel') && !COMMANDS.stempelFarbe && !COMMANDS.einheitenUmrechnen;
    // Add-In im Stil von 1.66 (Knopf im Register Entwicklertools, nur Excel)
    const old = Plugins.parse(`KnowledgeTree.register({ id: 'alt166', name: 'Alt', version: '1.0', setup(api) { api.addButton({ tab: 'x-dev', mode: 'tab', group: 'Alt', label: 'Alt-Knopf', run() {} }); api.addFunction('ALTF', () => 7, {}); api.on('cellChange', () => {}); } });`)[0];
    o.old = !!Plugins.activate(old, { source: 'notizbuch' }, true) && Plugins.buttons.some(b => b.plugin === 'alt166' && b.tab === 'x-dev' && b.mode === 'tab');
    return o;
  });
  check('KI-Vorlage vorhanden und mit Beispielen', tpl.md > 8000 && tpl.blocks === 2, tpl);
  check('Beispiele der KI-Vorlage laden ohne Fehler', tpl.ids.length === 2 && tpl.ids.every(x => /:true$/.test(x)), tpl.ids);
  check('Beispiel 1: Tabellenfunktion =KMH', Math.abs(tpl.kmh - 36) < 1e-9, tpl.kmh);
  check('Beispiel 2: eigenes Register, Stempel eingefügt, Häkchen-Farben', tpl.stempelTab && tpl.stempel && tpl.farbe, tpl);
  check('Beispiele ausgeschaltet: sauber weg', tpl.offClean);
  check('Add-In im Stil von 1.66 läuft', tpl.old);
  await pg.evaluate((id) => App.openPage(id), pages.xlsx); await pg.waitForTimeout(500);
  const dev = await labels('x-dev');
  check('1.66-Knopf im Register Entwicklertools (Excel)', dev.includes('Alt'), dev);
  const ai = await labels('addins');
  const names = await pg.evaluate(() => [...document.querySelectorAll('#panel .rb.chk')].map(b => b.textContent));
  check('Register Add-Ins (Excel): Häkchen für alle bekannten Add-Ins', ai.includes('Ein / aus') && names.includes('Chem-Draw'), names);
  // Verwalten-Dialog
  const dlg = await pg.evaluate(async () => { Plugins.manage(); await new Promise(r => setTimeout(r, 200)); const d = document.querySelector('.kt-addins'); const o = { rows: d.querySelectorAll('.ai-row').length, chem: /Chem-Draw/.test(d.textContent) && /eingebaut/.test(d.textContent), cb: !!d.querySelector('input[data-addin="chemdraw"]') }; d.closest('.dlg-back').remove(); return o; });
  check('Verwalten: alle Add-Ins mit Herkunft und Häkchen', dlg.rows >= 2 && dlg.chem && dlg.cb, dlg);
  await pg.screenshot({ path: '/tmp/claude-0/kt-addins-169.png' });

  check('keine Fehler in der Konsole', errs.length === 0, errs.slice(0, 5));
  console.log(`addins-169: ${ok}/${ok + bad}`);
  await br.close();
  process.exit(bad ? 1 : 0);
})();
