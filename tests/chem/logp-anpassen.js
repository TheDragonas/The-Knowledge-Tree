'use strict';
/* logP-Modell von Chem-Draw (1.52) anpassen: node tests/chem/logp-anpassen.js
 * Atomtypen zählen (ChemProps.logpTypes) und die Beiträge per Ridge-Regression an bekannte Messwerte (Octanol/Wasser,
 * gerundete Literaturwerte einfacher Stoffe) anpassen. Gibt die Beiträge für ChemProps.LOGP_W und den mittleren
 * Fehler aus. Mit „--pruefen“ nur die aktuellen Beiträge prüfen. */
const fs = require('fs');
const src = ['chem.js', 'chem-layout.js', 'chem-models.js', 'chem-props.js'].map(f => fs.readFileSync(__dirname + '/../../web/js/' + f, 'utf8')).join('\n');
const ctx = { clamp: (v, a, b) => Math.max(a, Math.min(b, v)) };
new Function('clamp', src + '\nObject.assign(this,{ChemMol,ChemSmiles,ChemProps});').call(ctx, ctx.clamp);
const { ChemSmiles, ChemProps } = ctx;
const DATA = [
  ['C', 1.09], ['CC', 1.81], ['CCC', 2.36], ['CCCC', 2.89], ['CCCCCC', 3.9], ['C1CCCCC1', 3.44], ['c1ccccc1', 2.13], ['Cc1ccccc1', 2.73],
  ['CCc1ccccc1', 3.15], ['c1ccc2ccccc2c1', 3.3], ['CO', -0.77], ['CCO', -0.31], ['CCCO', 0.25], ['CCCCO', 0.88], ['CCCCCCCCO', 3.0],
  ['CC(C)O', 0.05], ['Oc1ccccc1', 1.46], ['CC(=O)O', -0.17], ['CCC(=O)O', 0.33], ['OC(=O)c1ccccc1', 1.87], ['CC(C)=O', -0.24], ['CCC(C)=O', 0.29],
  ['O=Cc1ccccc1', 1.48], ['CCOCC', 0.89], ['C1CCOC1', 0.46], ['CCOC(C)=O', 0.73], ['COC(C)=O', 0.18], ['ClC(Cl)Cl', 1.97], ['ClCCl', 1.25],
  ['ClC(Cl)(Cl)Cl', 2.83], ['Clc1ccccc1', 2.84], ['Brc1ccccc1', 2.99], ['Fc1ccccc1', 2.27], ['Ic1ccccc1', 3.25], ['CN', -0.57], ['CCN', -0.13],
  ['CCNCC', 0.58], ['CCN(CC)CC', 1.45], ['Nc1ccccc1', 0.9], ['c1ccncc1', 0.65], ['CC#N', -0.34], ['N#Cc1ccccc1', 1.56], ['O=[N+]([O-])c1ccccc1', 1.85],
  ['CC(N)=O', -1.26], ['CN(C)C=O', -1.01], ['NC(N)=O', -2.11], ['OCC(O)CO', -1.76], ['OCCO', -1.36], ['OCC1OC(O)C(O)C(O)C1O', -3.24],
  ['COc1ccccc1', 2.11], ['CC(=O)c1ccccc1', 1.58], ['Cn1cnc2c1c(=O)n(C)c(=O)n2C', -0.07], ['CC(=O)Oc1ccccc1C(=O)O', 1.19],
  ['CC(C)Cc1ccc(cc1)C(C)C(=O)O', 3.97], ['CC(=O)Nc1ccc(O)cc1', 0.46], ['C=C', 1.13], ['CC=C', 1.77], ['OC1CCCCC1', 1.23], ['O=C1CCCCC1', 0.81],
  ['c1ccoc1', 1.34], ['c1ccsc1', 1.81], ['c1cc[nH]c1', 0.75], ['O', -1.38], ['C=Cc1ccccc1', 2.95], ['CCCC(=O)O', 0.79], ['CCC(=O)CC', 0.99],
  ['CC(C)c1ccccc1', 3.66], ['Cc1ccc(C)cc1', 3.15], ['OCc1ccccc1', 1.1], ['CCCl', 1.43], ['CCBr', 1.61], ['CCCCCCCC', 5.18], ['CC(C)(C)O', 0.35],
];
const rows = [];
for (const [smi, y] of DATA) {
  let m;
  try { m = ChemSmiles.toMol(smi.replace(/c\(=O\)/g, 'C(=O)').replace(/n\(C\)c\(=O\)n/, 'N(C)C(=O)N')); } catch (e) { console.log('SMILES?', smi, e.message); continue; }
  rows.push({ smi, y, t: ChemProps.logpTypes(ChemProps.graph(m)), m });
}
const keys = [...new Set(rows.flatMap(r => Object.keys(r.t)))].sort();
if (process.argv.includes('--pruefen')) {
  let e = 0; for (const r of rows) e += Math.abs(ChemProps.logp(r.m) - r.y);
  console.log(`mittlerer Fehler ${(e / rows.length).toFixed(2)} (n = ${rows.length})`);
  process.exitCode = e / rows.length < 0.45 ? 0 : 1;
  return;
}
// Ridge: (XᵀX + λI) w = Xᵀy, mit Achsenabschnitt k0 (nicht bestraft)
const K = ['k0', ...keys], n = K.length, lam = 0.15;
const X = rows.map(r => K.map(k => k === 'k0' ? 1 : (r.t[k] || 0)));
const M = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => X.reduce((s, x) => s + x[i] * x[j], 0) + (i === j && i ? lam : 0)));
const b = K.map((_, i) => X.reduce((s, x, r) => s + x[i] * rows[r].y, 0));
for (let i = 0; i < n; i++) { let p = i; for (let r = i + 1; r < n; r++) if (Math.abs(M[r][i]) > Math.abs(M[p][i])) p = r; [M[i], M[p]] = [M[p], M[i]]; [b[i], b[p]] = [b[p], b[i]]; for (let r = 0; r < n; r++) { if (r === i) continue; const f = M[r][i] / M[i][i]; for (let c = i; c < n; c++) M[r][c] -= f * M[i][c]; b[r] -= f * b[i]; } }
const w = Object.fromEntries(K.map((k, i) => [k, Math.round(b[i] / M[i][i] * 100) / 100]));
let err = 0; const bad = [];
for (const r of rows) { const p = K.reduce((s, k) => s + w[k] * (k === 'k0' ? 1 : (r.t[k] || 0)), 0); err += Math.abs(p - r.y); if (Math.abs(p - r.y) > 0.8) bad.push(`${r.smi} ${p.toFixed(2)}/${r.y}`); }
console.log('LOGP_W:', JSON.stringify(w).replace(/"(\w+)":/g, '$1: ').replace(/,/g, ', '));
console.log(`mittlerer Fehler ${(err / rows.length).toFixed(2)} (n = ${rows.length})`, bad.length ? 'grösser 0,8: ' + bad.join(' · ') : '');
