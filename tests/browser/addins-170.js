'use strict';
/* Browser-Test 1.70: Add-Ins überarbeitet – node tests/browser/addins-170.js [url]
 *  - Register „Add-Ins“: Häkchen links je 4 untereinander, ab dem 5. eine neue Spalte rechts; alles innerhalb des Bands,
 *    Kästchen und Schrift auf einer Linie; Gruppen Verwalten und Eigene Add-Ins (Anleitung, KI-Vorlage)
 *  - EINE Vorlage (.js): Anleitung als Kommentar + lauffähiges Gerüst; die Vorlage als Add-In hinzufügen wird erklärt,
 *    nicht geladen; das Gerüst selbst läuft
 *  - Anleitung (Info) mit 5 Schritten und Beispiel-Auftrag; Verwalten mit Herkunft, Inhalt, Fehler; Knopftexte
 *    brechen nicht um (auch schmales Fenster) */
const { chromium } = require('playwright');
const url = process.argv[2] || 'http://127.0.0.1:8800/index.html';
(async () => {
  const br = await chromium.launch();
  let ok = 0, bad = 0;
  const check = (n, c, info) => { if (c) ok++; else { bad++; console.log('FALSCH', n, info === undefined ? '' : typeof info === 'string' ? info : JSON.stringify(info)); } };
  const errs = [];
  const pg = await br.newPage({ viewport: { width: 1400, height: 860 } });
  pg.on('pageerror', e => errs.push(e.message));
  pg.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push(m.text()); });
  await pg.goto(url);
  await pg.waitForFunction(() => typeof Plugins !== 'undefined' && Store.loaded && Canvas.page, null, { timeout: 20000 });
  await pg.waitForTimeout(900);
  const grid = () => pg.evaluate(() => {
    Ribbon.show('addins');
    const g = document.querySelector('#panel .ai-checks'), body = g.closest('.rg-body').getBoundingClientRect();
    const cs = [...g.querySelectorAll('.rb.chk')].map(b => { const r = b.getBoundingClientRect(), bx = b.querySelector('.cbx').getBoundingClientRect(), t = b.querySelector('span:last-child').getBoundingClientRect(); return { n: b.textContent, x: Math.round(r.left), y: Math.round(r.top), b: r.bottom, mid: Math.abs((bx.top + bx.bottom) / 2 - (t.top + t.bottom) / 2), wrap: t.height > 20 }; });
    return { cs, top: body.top, bottom: body.bottom, label: g.closest('.rgroup').querySelector('.rg-label').textContent };
  });

  // ---------------------------------------------------------------- 1) Häkchen-Raster
  let g = await grid();
  check('Ein / aus: Chem-Draw allein, eine Spalte', g.label === 'Ein / aus' && g.cs.length === 1 && g.cs[0].n === 'Chem-Draw', g);
  await pg.evaluate(() => {
    const c = ['Einheiten', 'Stempel', 'Datumsfeld', 'Notenrechner', 'Quiz', 'Vokabeln'].map((n, i) => `KnowledgeTree.register({ id: 'r${i}', name: '${n}', version: '1.0', setup(api) {} });`).join('\n');
    for (const d of Plugins.parse(c)) Plugins.activate(d, { source: 'notizbuch' });
    Plugins.changed();
  });
  g = await grid();
  const cols = [...new Set(g.cs.map(c => c.x))];
  check('7 Add-Ins: 4 in der ersten Spalte, 3 in der zweiten (rechts)', g.cs.length === 7 && cols.length === 2 && g.cs.filter(c => c.x === cols[0]).length === 4 && cols[1] > cols[0], g.cs);
  check('zweite Spalte beginnt oben', g.cs[4].y === g.cs[0].y, [g.cs[0], g.cs[4]]);
  check('alle Häkchen innerhalb des Bands', g.cs.every(c => c.y >= g.top - 1 && c.b <= g.bottom + 1), g);
  check('Kästchen und Schrift auf einer Linie, kein Umbruch', g.cs.every(c => c.mid <= 1.5 && !c.wrap), g.cs);
  await pg.evaluate(() => { for (let i = 6; i < 9; i++) for (const d of Plugins.parse(`KnowledgeTree.register({ id: 'r${i}', name: 'Zusatz ${i}', setup(api) {} });`)) Plugins.activate(d, { source: 'notizbuch' }); Plugins.changed(); });
  g = await grid();
  check('10 Add-Ins: drei Spalten (4 · 4 · 2)', new Set(g.cs.map(c => c.x)).size === 3, g.cs.map(c => c.x));
  const groups = await pg.evaluate(() => [...document.querySelectorAll('#panel .rgroup > .rg-label')].map(x => x.textContent));
  check('Gruppen: Ein / aus, Verwalten, Eigene Add-Ins', groups.slice(0, 3).join('|') === 'Ein / aus|Verwalten|Eigene Add-Ins', groups);
  check('Knöpfe Anleitung und KI-Vorlage (kein „Beispiel“ mehr)', await pg.evaluate(() => !!document.querySelector('#panel [data-cmd="addinGuide"]') && !!document.querySelector('#panel [data-cmd="addinTemplate"]') && !document.querySelector('#panel [data-cmd="addinExample"]')));
  await pg.evaluate(() => { for (let i = 0; i < 9; i++) Plugins.unregister('r' + i); Plugins.changed(); });

  // ---------------------------------------------------------------- 2) EINE Vorlage
  const t = await pg.evaluate(async () => {
    const s = await Plugins.templateText();
    const o = { len: s.length, file: Plugins.TEMPLATE_FILE, head: s.slice(0, 2) === '/*', eine: /EINE Datei/.test(s), unter: /mit „_“ beginnt/.test(s), wirklich: /In Wirklichkeit/.test(s) };
    // die ganze Vorlage ist JavaScript: das Gerüst unten läuft
    const defs = Plugins.parse(s);
    o.ids = defs.map(d => d.id);
    const d = Plugins.activate(defs[0], { source: 'notizbuch' }, true);
    o.runs = !!d && !!COMMANDS.meinAddinHallo && Plugins.buttons.some(b => b.plugin === 'mein-addin' && b.tab === 'addins');
    Plugins.unregister('mein-addin');
    // die Vorlage selbst „hinzufügen“: erklärt, nicht gespeichert
    const n = (Store.ui.plugins || []).length;
    o.added = await Plugins.addCode(s, '_Add-In-Vorlage_KI.js');
    await new Promise(r => setTimeout(r, 150));
    o.info = /Das ist die Vorlage/.test(document.body.innerText);
    document.querySelectorAll('.dlg-back').forEach(x => x.remove());
    o.stored = (Store.ui.plugins || []).length === n && !Plugins.defs.has('mein-addin');
    return o;
  });
  check('Vorlage: eine .js-Datei mit „_“, Anleitung als Kommentar (EINE Datei, „_“-Regel, „In Wirklichkeit“)', t.file === '_Add-In-Vorlage_KI.js' && t.head && t.eine && t.unter && t.wirklich && t.len > 10000, t);
  check('Vorlage ist gültiges JavaScript, Gerüst läuft (Knopf im Register Add-Ins)', t.ids.join() === 'mein-addin' && t.runs, t);
  check('Vorlage als Add-In hinzufügen: erklärt statt geladen', t.added === false && t.info && t.stored, t);
  // ein echtes Add-In hinzufügen (Browser: im Speicher)
  const add = await pg.evaluate(async () => {
    const ok1 = await Plugins.addCode("// Datum – Knopf im Register Einfügen\nKnowledgeTree.register({ id: 'datum', name: 'Datum', version: '1.0', requires: '1.69', desc: 'Heutiges Datum', setup(api) { api.addButton({ tab: 'einfuegen', group: 'Datum', label: 'Datum', icon: 'calendar', run: () => api.canvas.insertText(new Date().toLocaleDateString('de-CH')) }); } });", 'datum.js');
    const bad1 = await Plugins.addCode("KnowledgeTree.register({ id: 'fehler', name: 'Fehler', setup(api) { api.nichtVorhanden(); } });", 'fehler.js');
    await new Promise(r => setTimeout(r, 200));
    document.querySelectorAll('.dlg-back').forEach(x => x.remove());
    return { ok1, bad1, on: Plugins.defs.has('datum'), stored: (Store.ui.plugins || []).some(p => p.id === 'datum' && p.asset) || Plugins.folder.some(f => f.datei === 'datum.js'), failed: Plugins.failed.get('fehler') || '' };
  });
  check('echtes Add-In hinzugefügt und eingeschaltet', add.ok1 && add.on && add.stored, add);
  check('fehlerhaftes Add-In: Fehler gemerkt', /nichtVorhanden/.test(add.failed), add);

  // ---------------------------------------------------------------- 3) Verwalten
  const man = await pg.evaluate(async () => {
    Plugins.manage(); await new Promise(r => setTimeout(r, 200));
    const d = document.querySelector('.kt-addins');
    const rows = [...d.querySelectorAll('.ai-row')].map(r => ({ t: r.innerText.replace(/\s+/g, ' '), bad: r.classList.contains('bad'), cb: r.querySelector('.ai-cb').checked }));
    const btns = [...d.querySelectorAll('.dlg-btns .btn, .ai-help')].map(b => ({ t: b.textContent, h: b.getBoundingClientRect().height, over: b.scrollWidth > b.clientWidth + 1 }));
    return { rows, btns, help: !!d.querySelector('.ai-help') };
  });
  const rd = man.rows.find(r => /Datum/.test(r.t)), rf = man.rows.find(r => /Fehler/.test(r.t)), rc = man.rows.find(r => /Chem-Draw/.test(r.t));
  check('Verwalten: Chem-Draw eingebaut mit Gruppen', rc && /eingebaut/.test(rc.t) && /Gruppen „Chemie“, „Reaktion“/.test(rc.t) && rc.cb, rc);
  check("Verwalten: Datum (im Speicher bzw. Add-Ins-Ordner) mit Gruppe", rd && /im Speicher|Add-Ins-Ordner/.test(rd.t) && /Gruppen „Datum“/.test(rd.t) && rd.cb, rd);
  check('Verwalten: fehlerhaftes Add-In rot mit Meldung, nicht angehakt', rf && rf.bad && /Fehler:/.test(rf.t) && !rf.cb, rf);
  check('Verwalten: Knopf „Anleitung“, Knopftexte einzeilig', man.help && man.btns.every(b => b.h <= 36 && !b.over), man.btns);
  // Anleitung über den Knopf im Dialog
  await pg.click('.kt-addins .ai-help'); await pg.waitForTimeout(250);
  const gd = await pg.evaluate(() => { const d = document.querySelector('.kt-ai-guide'); return d && { steps: d.querySelectorAll('.ai-steps > li').length, ask: !!d.querySelector('.ai-ask'), txt: d.innerText, btns: [...d.querySelectorAll('.dlg-btns .btn')].map(b => ({ t: b.textContent, h: b.getBoundingClientRect().height })) }; });
  check('Anleitung: 5 Schritte, Beispiel-Auftrag', gd && gd.steps === 5 && gd.ask && /KI-Vorlage/.test(gd.txt) && /Warum nur eine Datei/.test(gd.txt), gd);
  check('Anleitung: Knöpfe einzeilig', gd && gd.btns.every(b => b.h <= 36), gd && gd.btns);
  await pg.screenshot({ path: '/tmp/claude-0/kt-addins-170-anleitung.png' });
  await pg.evaluate(() => document.querySelectorAll('.dlg-back').forEach(x => x.remove()));
  // Anleitung über das Register
  await pg.evaluate(() => { Ribbon.show('addins'); document.querySelector('#panel [data-cmd="addinGuide"]').click(); });
  await pg.waitForTimeout(250);
  check('Register Add-Ins → Anleitung öffnet die Anleitung', await pg.evaluate(() => !!document.querySelector('.kt-ai-guide')));
  await pg.evaluate(() => document.querySelectorAll('.dlg-back').forEach(x => x.remove()));
  // schmales Fenster: Knöpfe brechen in eine neue Zeile, nicht im Text um
  await pg.setViewportSize({ width: 560, height: 800 });
  const nar = await pg.evaluate(async () => { Plugins.manage(); await new Promise(r => setTimeout(r, 200)); const d = document.querySelector('.kt-addins'); const o = [...d.querySelectorAll('.dlg-btns .btn')].map(b => ({ t: b.textContent, h: b.getBoundingClientRect().height, over: b.scrollWidth > b.clientWidth + 1 })); d.closest('.dlg-back').remove(); return o; });
  check('schmal: Knopftexte weiter einzeilig', nar.every(b => b.h <= 36), nar);
  await pg.setViewportSize({ width: 1400, height: 860 });
  await pg.evaluate(async () => { await Plugins.remove('datum'); await Plugins.remove('fehler'); });

  check('keine Fehler in der Konsole', errs.length === 0, errs.slice(0, 5));
  console.log(`addins-170: ${ok}/${ok + bad}`);
  await br.close();
  process.exit(bad ? 1 : 0);
})();
