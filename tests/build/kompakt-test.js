'use strict';
/* Verkleinerung beim Bauen (seit 1.23): build_web.py entfernt Kommentare und Leerraum mit einem eigenen kleinen
 * Zerleger. Dieser Test prüft, dass sich dabei am Programm NICHTS ändert: jede verkleinerte JS-Datei muss denselben
 * Syntaxbaum ergeben wie das Original (ohne Lage/Kommentare). Braucht Python 3 und das npm-Paket „acorn“
 * (nur zum Prüfen, nicht für KnowledgeTree selbst) – fehlt es, wird der Test übersprungen.
 * Aufruf: node tests/build/kompakt-test.js */
const fs = require('fs'), path = require('path'), os = require('os'), { execFileSync } = require('child_process');
let acorn = null;
for (const p of ['acorn', '/opt/npm-tools/node_modules/acorn', '/opt/node-tools/node_modules/acorn']) { try { acorn = require(p); break; } catch (e) { /* weiter */ } }
if (!acorn) { console.log('übersprungen: npm-Paket „acorn“ nicht gefunden (npm install acorn)'); process.exit(0); }
const ROOT = path.join(__dirname, '../..'), JS = path.join(ROOT, 'web/js');
const out = fs.mkdtempSync(path.join(os.tmpdir(), 'kt-kompakt-'));
// die Verkleinerer aus build_web.py laden (ohne zu bauen) und jede Datei verkleinert schreiben
const py = `
import sys, pathlib
src = open(sys.argv[1], encoding='utf-8').read().split('# ---------------------------------------------------------------- Zusammenbauen')[0]
ns = {'__file__': sys.argv[1]}
exec(src, ns)
for f in sorted(pathlib.Path(sys.argv[2]).glob('*.js')):
    pathlib.Path(sys.argv[3], f.name).write_text(ns['compact_js'](f.read_text(encoding='utf-8')), encoding='utf-8')
`;
execFileSync('python3', ['-c', py, path.join(ROOT, 'build_web.py'), JS, out]);
const tree = (code) => JSON.stringify(acorn.parse(code, { ecmaVersion: 'latest' }), (k, v) => (k === 'start' || k === 'end' || (k === 'raw' && typeof v === 'string' && !/[`$]/.test(v)) ? undefined : typeof v === 'bigint' ? v + 'n' : v));
let ok = 0, fail = 0, a0 = 0, b0 = 0;
for (const f of fs.readdirSync(JS).filter(f => f.endsWith('.js'))) {
  const a = fs.readFileSync(path.join(JS, f), 'utf8'), b = fs.readFileSync(path.join(out, f), 'utf8');
  a0 += a.length; b0 += b.length;
  let same = false;
  try { same = tree(a) === tree(b); } catch (e) { console.log('  FEHLER:', f, e.message); }
  if (same) ok++; else { fail++; console.log('  FEHLER: anderer Syntaxbaum nach dem Verkleinern:', f); }
}
fs.rmSync(out, { recursive: true, force: true });
console.log(`${ok} von ${ok + fail} Dateien unverändert im Ablauf (JS ${Math.round(a0 / 1024)} → ${Math.round(b0 / 1024)} KB)`);
process.exit(fail ? 1 : 0);
