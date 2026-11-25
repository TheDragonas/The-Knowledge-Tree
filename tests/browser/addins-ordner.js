'use strict';
/* Test 1.69/1.70 mit dem Programm (Server): Add-Ins-Ordner neben der EXE
 *   node tests/browser/addins-ordner.js <kt-Programm (Linux-Build)> [Testordner]
 *  - Ordner „Add-Ins“ wird angelegt, KI-Vorlage (EINE .js-Datei, „_“ = nicht geladen) liegt darin und wird erneuert,
 *    wenn sie fehlt oder verändert ist; die alte .md-Vorlage von 1.69 wird entfernt, Dateien mit „_“ nicht geladen
 *  - *.js im Ordner werden beim Start geladen und eingeschaltet (Hinweis), Häkchen aus bleibt nach Neustart aus
 *  - „Add-In hinzufügen“ kopiert in den Ordner, „Entfernen“ verschiebt nach _entfernt, ungültige Namen abgelehnt
 *  - Register „Add-Ins“: Ordner öffnen, Neu laden; Vorlage auch über die Webseite abrufbar */
const fs = require('fs'), path = require('path'), { spawn } = require('child_process');
const { chromium } = require('playwright');
const EXE = process.argv[2] || '/tmp/claude-0/kt-linux';
const DIR = process.argv[3] || '/tmp/claude-0/kt-addins-srv';
const PORT = 8792, TOKEN = 'testaddins169';
const VORLAGE = '_Add-In-Vorlage_KI.js';
const SRC = fs.readFileSync(path.join(__dirname, '..', '..', 'web', 'addins', VORLAGE), 'utf8');
let ok = 0, bad = 0;
const check = (n, c, info) => { if (c) ok++; else { bad++; console.log('FALSCH', n, info === undefined ? '' : typeof info === 'string' ? info : JSON.stringify(info)); } };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const start = async () => {
  const p = spawn(EXE, ['--nowindow', '--dir', DIR, '--port', String(PORT), '--token', TOKEN], { stdio: 'ignore' });
  for (let i = 0; i < 50; i++) { await sleep(150); try { const r = await fetch(`http://127.0.0.1:${PORT}/`); if (r.ok) break; } catch (e) { /* */ } }
  return p;
};
const stop = async (p) => { p.kill(); await sleep(400); };
(async () => {
  fs.rmSync(DIR, { recursive: true, force: true });
  fs.mkdirSync(path.join(DIR, 'Add-Ins'), { recursive: true });
  fs.writeFileSync(path.join(DIR, 'Add-Ins', 'ordner-test.js'), `KnowledgeTree.register({ id: 'ordner-test', name: 'Ordner-Test', version: '1.0', requires: '1.69', desc: 'liegt im Ordner',
    setup(api) { api.addButton({ group: 'Ordner', label: 'Ordnerknopf', icon: 'folder', run: () => api.ui.toast('aus dem Ordner') }); api.addFunction('ORDNERF', () => 5, {}); } });`);
  fs.writeFileSync(path.join(DIR, 'Add-Ins', 'kaputt.js'), 'das ist kein JavaScript (');
  fs.writeFileSync(path.join(DIR, 'Add-Ins', '_privat.js'), "KnowledgeTree.register({ id: 'privat', name: 'Privat', setup(api) {} });");
  fs.writeFileSync(path.join(DIR, 'Add-Ins', 'Add-In-Vorlage_KI-Kontext.md'), '# KnowledgeTree – Add-In-Vorlage (KI-Kontext)\n\nalt (1.69)\n');
  let srv = await start();
  const AI = path.join(DIR, 'Add-Ins');
  const tpl = () => fs.existsSync(path.join(AI, VORLAGE)) ? fs.readFileSync(path.join(AI, VORLAGE), 'utf8') : null;
  check('Ordner Add-Ins mit KI-Vorlage (Windows-Zeilenenden)', tpl() === SRC.replace(/\r?\n/g, '\r\n'));
  const readme = fs.readFileSync(path.join(DIR, 'LIESMICH.txt'), 'utf8');
  check('LIESMICH erwähnt den Add-Ins-Ordner', /Add-Ins\\/.test(readme) && /_Add-In-Vorlage_KI\.js/.test(readme));
  check('alte .md-Vorlage (1.69) entfernt', !fs.existsSync(path.join(AI, 'Add-In-Vorlage_KI-Kontext.md')));

  const br = await chromium.launch();
  const pg = await br.newPage({ viewport: { width: 1400, height: 900 } });
  const errs = [];
  pg.on('pageerror', e => errs.push(e.message));
  const boot = async () => { await pg.waitForFunction(() => typeof Plugins !== 'undefined' && Store.loaded && Canvas.page, null, { timeout: 20000 }); await pg.waitForTimeout(1500); };
  await pg.goto(`http://127.0.0.1:${PORT}/?t=${TOKEN}`); await boot();
  let r = await pg.evaluate(() => ({
    folder: !!Backend.addinFolder, act: Plugins.defs.has('ordner-test'), src: Plugins.defs.get('ordner-test') && Plugins.defs.get('ordner-test').source,
    st: Store.ui.addins && Store.ui.addins['ordner-test'], fn: XL.F.ORDNERF && XL.F.ORDNERF.fn([]), err: Plugins.errors.join(' | '),
    chem: Plugins.defs.has('chemdraw'), toast: document.body.innerText.includes('Neues Add-In im Ordner'),
    skip: !Plugins.defs.has('privat') && !Plugins.defs.has('mein-addin') && !Plugins.all().some(a => a.id === 'privat' || a.id === 'mein-addin'),
    broken: Plugins.all().some(a => a.broken && a.datei === 'kaputt.js' && a.err),
  }));
  check('Ordner-Add-In beim Start geladen und eingeschaltet', r.folder && r.act && r.src === 'ordner' && r.st === true && r.fn === 5, r);
  check('Hinweis „Neues Add-In im Ordner“', r.toast);
  check('kaputte Datei: Fehler gemeldet (auch als Eintrag in Verwalten), Rest läuft', /kaputt\.js/.test(r.err) && r.chem && r.broken, r);
  check('Dateien mit „_“ (Vorlage, _privat.js) nicht geladen', r.skip, r);
  const tab = await pg.evaluate(() => { Ribbon.show('addins'); const P = document.querySelector('#panel'); return { chk: [...P.querySelectorAll('.rb.chk')].map(b => b.textContent + ':' + b.classList.contains('on')), folder: !!P.querySelector('[data-cmd="addinFolder"]') && !P.querySelector('[data-cmd="addinFolder"]').disabled, btn: /Ordnerknopf/.test(P.textContent) }; });
  check('Register Add-Ins: Häkchen Chem-Draw und Ordner-Test, „Ordner öffnen“, Knopf des Add-Ins', tab.chk.includes('Chem-Draw:true') && tab.chk.includes('Ordner-Test:true') && tab.folder && tab.btn, tab);
  const md = await pg.evaluate(() => Plugins.templateText());
  check('KI-Vorlage im Programm abrufbar', md.replace(/\r\n/g, '\n') === SRC.replace(/\r\n/g, '\n'));
  // ausschalten → nach Neustart weiter aus
  await pg.click('#panel .rb.chk[data-addin="ordner-test"]'); await pg.waitForTimeout(400);
  check('ausgeschaltet', await pg.evaluate(() => !Plugins.defs.has('ordner-test') && !XL.F.ORDNERF && Store.ui.addins['ordner-test'] === false));
  await pg.evaluate(() => UiState.saveSoon.flush && UiState.saveSoon.flush()); await pg.waitForTimeout(1200);
  await pg.close();
  await stop(srv);
  fs.writeFileSync(path.join(AI, VORLAGE), 'verändert');
  srv = await start();
  check('veränderte KI-Vorlage beim Start erneuert', tpl() === SRC.replace(/\r?\n/g, '\r\n'));
  const pg2 = await br.newPage({ viewport: { width: 1400, height: 900 } });
  pg2.on('pageerror', e => errs.push(e.message));
  await pg2.goto(`http://127.0.0.1:${PORT}/?t=${TOKEN}`);
  await pg2.waitForFunction(() => typeof Plugins !== 'undefined' && Store.loaded && Canvas.page, null, { timeout: 20000 }); await pg2.waitForTimeout(1500);
  r = await pg2.evaluate(() => ({ act: Plugins.defs.has('ordner-test'), listed: Plugins.all().some(a => a.id === 'ordner-test' && !a.on), toast: document.body.innerText.includes('Neues Add-In im Ordner') }));
  check('nach Neustart: weiter aus, aber aufgeführt, kein neuer Hinweis', !r.act && r.listed && !r.toast, r);
  // hinzufügen (wie „Add-In hinzufügen“), neu laden, entfernen
  r = await pg2.evaluate(async () => {
    const o = {};
    o.name = await Backend.addinSave('neu-hinzu.js', "KnowledgeTree.register({ id: 'neu-hinzu', name: 'Neu hinzu', setup(api) { api.addCommand('neuHinzu', { run() {} }); } });");
    try { await Backend.addinSave('../boese.js', 'x'); o.bad = false; } catch (e) { o.bad = true; }
    try { await Backend.addinSave('boese.exe', 'x'); o.bad2 = false; } catch (e) { o.bad2 = true; }
    try { await Backend.addinSave('_versteckt.js', 'x'); o.bad3 = false; } catch (e) { o.bad3 = true; }
    Plugins.st()['neu-hinzu'] = true;
    await Plugins.reload();
    o.act = Plugins.defs.has('neu-hinzu') && !!COMMANDS.neuHinzu;
    await Plugins.remove('neu-hinzu');
    o.gone = !Plugins.defs.has('neu-hinzu') && !COMMANDS.neuHinzu && !Plugins.all().some(a => a.id === 'neu-hinzu');
    return o;
  });
  check('hinzufügen: Datei im Ordner, nach „Neu laden“ aktiv', r.name === 'neu-hinzu.js' && r.act, r);
  check('ungültige Dateinamen abgelehnt (../, .exe, _ am Anfang)', r.bad && r.bad2 && r.bad3, r);
  check('entfernen: aus dem Programm weg', r.gone, r);
  check('entfernen: Datei in _entfernt verschoben', !fs.existsSync(path.join(AI, 'neu-hinzu.js')) && fs.existsSync(path.join(AI, '_entfernt', 'neu-hinzu.js')) && !fs.existsSync(path.join(DIR, 'boese.js')));
  check('keine Fehler in der Seite', errs.length === 0, errs);
  await br.close();
  await stop(srv);
  console.log(`addins-ordner: ${ok}/${ok + bad}`);
  process.exit(bad ? 1 : 0);
})();
