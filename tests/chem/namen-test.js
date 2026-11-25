// Namenstest: node tests/chem/namen-test.js tests/chem/namen-de-1.txt [de|en]
const fs = require('fs');
const src = ['chem.js', 'chem-layout.js', 'chem-name.js'].map(f => fs.readFileSync(__dirname + '/../../web/js/' + f, 'utf8')).join('\n');
const ctx = {};
new Function(src + '\nObject.assign(this,{ChemFormula,ChemMol,ChemSmiles,ChemLayout,ChemMatch,ChemName,BL});').call(ctx);
const { ChemSmiles: S, ChemName: N } = ctx;
const T = fs.readFileSync(process.argv[2] || 'names.txt', 'utf8').split('\n').filter(l => l.trim() && !l.startsWith('#')).map(l => l.split(/\s+=>\s+/));
let ok = 0, bad = 0;
const lang = process.argv[3] || 'de';
for (const [smi, exp] of T) {
  let got;
  try { const m = S.toMol(smi.trim()); const r = N.of(m, { lang }); got = r.name || ('FEHLT: ' + r.error); } catch (e) { got = 'EXC ' + e.message + ' ' + (e.stack || '').split('\n')[1]; }
  if (got === (exp || '').trim()) ok++; else { bad++; console.log(smi.trim().padEnd(44), '|', got, '  ≠  ', (exp || '').trim()); }
}
console.log(`${ok} ok, ${bad} falsch`);
