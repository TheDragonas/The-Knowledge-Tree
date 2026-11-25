/* Rechtschreibprüfung (1.38): eigener Hunspell-Leser mit echtem en_US (falls vorhanden) und einem kleinen deutschen
 * Testwörterbuch (Endungen, Vorsilben mit Kleinschreibung in Zusammensetzungen, Fugen, verbotene Wörter, Vorschläge). */
const fs = require('fs'), path = require('path');
const { SpellEngine } = require('../../web/js/spell-engine.js');
let ok = 0, bad = 0;
const check = (name, cond, info) => { if (cond) ok++; else { bad++; console.log('FEHLER:', name, info ?? ''); } };
(async () => {
  const dir = __dirname;
  const de = await SpellEngine.build(fs.readFileSync(path.join(dir, 'mini_de.aff')), fs.readFileSync(path.join(dir, 'mini_de.dic')), { lang: 'de-CH', chunk: 0 });
  for (const w of ['Wasser', 'Wasserstoff', 'Wasserstoffen', 'Arbeitsweg', 'Titrationskurve', 'Schulhaus', 'rechnest', 'Rechnete', 'Stoffen', 'Weges', 'schnell']) check('de richtig: ' + w, de.check(w));
  for (const w of ['Wasserstof', 'rechnenst', 'Hauss', 'schnel', 'stoff', 'Arbeits']) check('de falsch: ' + w, !de.check(w));
  check('de Vorschlag Wasserstof', de.suggest('Wasserstof').includes('Wasserstoff'), de.suggest('Wasserstof'));
  check('de Vorschlag schnel', de.suggest('schnel')[0] === 'schnell', de.suggest('schnel'));
  check('de Grossschreibung am Satzanfang', de.check('Schnell'));
  // Fach-/eigene Wörter über extra()
  de.extra = (w) => ['enantiomer'].includes(w.toLowerCase()) || ['enantiomer'].some(b => w.toLowerCase() === b + 'e');
  check('extra: Fachwort', de.check('Enantiomere'));
  const aff = '/usr/share/hunspell/en_US.aff';
  if (fs.existsSync(aff)) {
    const en = await SpellEngine.build(fs.readFileSync(aff), fs.readFileSync(aff.replace('.aff', '.dic')), { lang: 'en-US', chunk: 0 });
    for (const w of ['houses', 'running', 'unhappy', 'reconsider', "don't", 'The', 'mitochondria', 'equilibrium', 'photosynthesis']) check('en richtig: ' + w, en.check(w));
    for (const w of ['teh', 'recieve', 'monday', 'accomodate']) check('en falsch: ' + w, !en.check(w));
    check('en Vorschlag recieve', en.suggest('recieve')[0] === 'receive', en.suggest('recieve'));
    check('en Vorschlag accomodate', en.suggest('accomodate')[0] === 'accommodate', en.suggest('accomodate'));
  } else console.log('(en_US nicht vorhanden – übersprungen)');
  // Zeichensatz ISO8859-1
  const latin = Buffer.from('SET ISO8859-1\nSFX P Y 1\nSFX P 0 er .\n', 'latin1'), ldic = Buffer.from('1\nMüll/P\n', 'latin1');
  const L = await SpellEngine.build(latin, ldic, { lang: 'de-DE', chunk: 0 });
  check('ISO8859-1 gelesen', L.check('Müll') && L.check('Müller'));
  // FLAG long + AF
  const lf = await SpellEngine.build('FLAG long\nAF 1\nAF AaBb\nSFX Aa Y 1\nSFX Aa 0 s .\n', '1\nhaus/1\n', { lang: 'de', chunk: 0 });
  check('FLAG long + AF', lf.check('haus') && lf.check('hauss'));
  console.log(`${ok} von ${ok + bad} Prüfungen bestanden (Rechtschreibung)`);
  process.exit(bad ? 1 : 0);
})();
