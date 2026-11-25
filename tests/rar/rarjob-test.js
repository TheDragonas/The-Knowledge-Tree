// RAR-Ablauf (seit 1.19): ein Durchgang, Nachzügler, Fehler je Datei, Rückstau-Signale, Freigeben, Schliessen.
// Prüft OneImport.rarJob ohne Browser (der Entpacker selbst wird durch eine Attrappe ersetzt).
const fs = require('fs'), path = require('path'), vm = require('vm');
const src = fs.readFileSync(path.join(__dirname, '../../web/js/onenote-import.js'), 'utf8');
const notes = [];
const ctx = { console, Blob, setTimeout, clearTimeout, UI: { toast: (t) => notes.push(t) } };
vm.createContext(ctx);
vm.runInContext(src + '\nthis.OneImport = OneImport; this.rarWorkerMain = rarWorkerMain;', ctx);
const OI = ctx.OneImport;
let ok = 0, fail = 0;
const check = (name, cond, info) => { if (cond) ok++; else { fail++; console.log('FEHLER:', name, info === undefined ? '' : info); } };
const tick = () => new Promise(r => setTimeout(r, 5));
let finished = false;   // ein nie erfülltes Promise beendet Node still mit 0 – das wäre ein Hänger
process.on('exit', () => { if (!finished) { console.log('FEHLER: Test hängt (ein Zugriff wird nie erfüllt)'); process.exitCode = 1; } });

(async () => {
  // Attrappe: Archiv-Reihenfolge a, b, c, d; b ist kaputt; „foto.png“ gehört nicht zum Durchgang
  const order = ['a.one', 'b.one', 'c.one', 'd.one', 'foto.png'];
  const passes = [], needs = [], acks = [];
  let closed = 0;
  const run = async (names, onFile, onFail, onProgress) => {
    passes.push([...names]);
    let i = 0;
    for (const n of order) {
      if (!names.includes(n)) continue;
      await tick();
      if (n === 'b.one') { const e = new Error('Archive header or data are damaged'); e.reason = 'ERAR_BAD_DATA'; onFail(n, e); continue; }
      onFile(n, new Blob([n.repeat(10)]));
      onProgress(++i / names.length);
    }
  };
  const job = OI.rarJob(order.map(n => ({ name: n, size: 10, dir: false })), run, () => closed++, { need: (n) => needs.push(n), ack: (b) => acks.push(b) });
  job.passNames = order.filter(n => OI.wanted(n)); job.passSet = new Set(job.passNames);
  check('Durchgang nur gebrauchte Dateien', JSON.stringify(job.passNames) === JSON.stringify(['a.one', 'b.one', 'c.one', 'd.one']), job.passNames);
  // zuerst d (hinten im Archiv), dann a
  const pd = job.get('d.one'), pa = job.get('a.one');
  const [bd, ba] = await Promise.all([pd, pa]);
  check('d geliefert', (await bd.text()) === 'd.one'.repeat(10));
  check('a geliefert', (await ba.text()) === 'a.one'.repeat(10));
  check('ein einziger Durchgang', passes.length === 1, passes);
  check('need für Wartende gemeldet', needs.includes('d.one') && needs.includes('a.one'), needs);
  check('ack mit Grösse', acks.length === 2 && acks.every(x => x === 50), acks);
  // kaputte Datei: deutscher Grund, Rest unbeeinflusst
  let err = null;
  try { await job.get('b.one'); } catch (e) { err = e; }
  check('b abgelehnt', !!err);
  check('b: deutscher Grund', err && /beschädigt/.test(err.message) && err.reason === 'ERAR_BAD_DATA', err && err.message);
  check('c danach da', (await (await job.get('c.one')).text()) === 'c.one'.repeat(10));
  // Nachzügler (nicht im Durchgang): eigener Durchgang danach
  const bf = await job.get('foto.png');
  check('Nachzügler geliefert', (await bf.text()) === 'foto.png'.repeat(10));
  check('Nachzügler-Durchgang', passes.length === 2 && JSON.stringify(passes[1]) === '["foto.png"]', passes);
  // freigeben → erneuter Zugriff holt nach
  job.forget('a.one');
  check('vergessen', !job.results.has('a.one'));
  const again = await job.get('a.one');
  check('nach Vergessen erneut geholt', (await again.text()) === 'a.one'.repeat(10) && passes.length === 3, passes);
  // Fortschritt nur, wenn jemand wartet
  check('Fortschritt gemeldet', notes.some(t => /RAR wird entpackt … \d+ %/.test(t)), notes);
  // schliessen: Wartende abgelehnt, Aufräumen aufgerufen
  const run2 = () => new Promise(() => {});   // hängt
  const job2 = OI.rarJob([{ name: 'x.one', size: 1, dir: false }], run2, () => closed++);
  job2.passNames = ['x.one']; job2.passSet = new Set(job2.passNames);
  const px = job2.get('x.one').then(() => 'ok', (e) => e.message);
  OI._jobs = new Set([job, job2]);
  OI.closeArchives();
  check('Wartende beim Schliessen abgelehnt', (await px) === 'Import beendet', await px);
  check('Aufräumen beider Archive', closed === 2, closed);
  check('nach dem Schliessen keine Daten mehr', job.results.size === 0);
  let late = null; try { await job.get('c.one'); } catch (e) { late = e.message; }
  check('nach dem Schliessen kein Zugriff', late === 'Archiv bereits geschlossen', late);
  // Fehlermeldungen fürs ganze Archiv
  check('Passwort-Hinweis', /passwortgeschützt/.test(OI.rarError({ reason: 'ERAR_MISSING_PASSWORD', message: 'x' }).message));
  check('zu gross ohne Worker', /zu gross/.test(OI.rarError({ reason: 'ERAR_TOO_BIG', message: 'x' }).message));
  // Worker-Quelltext ist eigenständig (wird als Text in den Worker gegeben)
  const wsrc = ctx.rarWorkerMain.toString();
  check('Worker: kein Zugriff auf OneImport', !/OneImport|Store\.|UI\./.test(wsrc));
  check('Worker: liest stückweise', /FileReaderSync/.test(wsrc) && /file\.slice\(/.test(wsrc));
  check('Worker: Durchgänge laufen bis zum Ende', !/\bbreak;\s*\n\s*}\s*\n\s*}\s*catch/.test(wsrc));
  finished = true;
  console.log(`${ok} von ${ok + fail} Prüfungen bestanden (RAR-Ablauf)`);
  process.exit(fail ? 1 : 0);
})();
