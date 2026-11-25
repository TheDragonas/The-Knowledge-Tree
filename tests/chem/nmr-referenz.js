'use strict';
/* NMR-Genauigkeit (1.55): berechnete ¹H-/¹³C-Verschiebungen gegen Literaturwerte (CDCl₃; SDBS/Lehrbuchwerte).
 * Aufruf: node tests/chem/nmr-referenz.js [-v]   – Paarung nach Grösse sortiert, OH/NH (breit) ausgenommen.
 * Ziel: mittlerer Fehler ¹H ≤ 0,15 ppm, ¹³C ≤ 3 ppm, Signalzahl stimmt. */
const fs = require('fs');
const src = ['chem.js', 'chem-layout.js', 'chem-models.js', 'chem-props.js'].map(f => fs.readFileSync(__dirname + '/../../web/js/' + f, 'utf8')).join('\n');
const ctx = { clamp: (v, a, b) => Math.max(a, Math.min(b, v)) };
new Function('clamp', src + '\nObject.assign(this,{ChemSmiles,ChemProps});').call(ctx, ctx.clamp);
const { ChemSmiles: S, ChemProps: P } = ctx;
const V = process.argv.includes('-v');
const H = {
  'CCO': [3.69, 1.22], 'CCOC(C)=O': [4.12, 2.04, 1.26], 'Cc1ccccc1': [7.25, 7.17, 7.15, 2.35], 'COc1ccccc1': [7.29, 6.94, 6.90, 3.80],
  'CC(=O)c1ccccc1': [7.96, 7.56, 7.46, 2.60], 'O=[N+]([O-])c1ccccc1': [8.23, 7.71, 7.56], 'CC(C)=O': [2.17], 'CCOCC': [3.48, 1.21],
  'BrCCCC': [3.41, 1.85, 1.47, 0.94], 'CC(C)O': [4.03, 1.20], 'CCC=O': [9.79, 2.46, 1.13], 'CC(=O)O': [2.10], 'CCN(CC)CC': [2.53, 1.03],
  'COC(=O)c1ccccc1': [8.04, 7.54, 7.43, 3.91], 'O=Cc1ccccc1': [10.0, 7.88, 7.62, 7.52], 'C=Cc1ccccc1': [7.40, 7.32, 7.25, 6.72, 5.75, 5.24],
  'C=CC(=O)OC': [6.40, 6.13, 5.82, 3.76], 'C=CCCCC': [5.81, 4.99, 4.93, 2.04, 1.37, 1.33, 0.90], 'C1CCCCC1': [1.43], 'ClCCl': [5.30], 'ClC(Cl)Cl': [7.26],
  'CC#N': [2.00], 'CN(C)C=O': [8.02, 2.96, 2.88], 'c1ccncc1': [8.62, 7.68, 7.29], 'Oc1ccccc1': [7.25, 6.93, 6.84], 'Nc1ccccc1': [7.16, 6.77, 6.68],
  'OCc1ccccc1': [7.35, 7.33, 7.28, 4.67], 'c1ccc2ccccc2c1': [7.84, 7.47], 'c1ccoc1': [7.42, 6.38], 'c1ccsc1': [7.33, 7.12], 'CCc1ccccc1': [7.28, 7.20, 7.17, 2.65, 1.24],
  'COC(C)(C)C': [3.22, 1.19], 'CCC(C)=O': [2.44, 2.14, 1.06], 'C[N+](=O)[O-]': [4.29], 'CI': [2.16], 'C1COCCO1': [3.71], 'C1CCOC1': [3.76, 1.85],
  'CC(C)(C)O': [1.28], 'Cc1ccc(C)cc1': [7.05, 2.31], 'NCc1ccccc1': [7.32, 7.30, 7.24, 3.85], 'CCCO': [3.58, 1.57, 0.94], 'CCCC': [1.31, 0.90],
  'CCCCCC': [1.29, 1.27, 0.88], 'ClCCCl': [3.73], 'CC(=O)Cl': [2.66], 'C#Cc1ccccc1': [7.48, 7.32, 7.30, 3.06], 'CCOC(=O)C=C': [6.40, 6.12, 5.82, 4.21, 1.30],
  'CC(=O)Nc1ccccc1': [7.50, 7.30, 7.10, 2.17], 'CC1=CC(=O)CC(C)(C)C1': [5.87, 2.18, 2.14, 1.93, 1.03], 'O=C1CCCCC1': [2.33, 1.86, 1.72], 'CS(C)=O': [2.62],
  'FCc1ccccc1': [7.37, 7.36, 7.35, 5.36], 'CC(=O)OC': [3.67, 2.05], 'CCCCO': [3.64, 1.56, 1.39, 0.94], 'CC=O': [9.80, 2.20], 'O=C(O)c1ccccc1': [8.12, 7.62, 7.48],
  'CCN': [2.74, 1.11], 'CCC(=O)O': [2.38, 1.16], 'CN(C)C': [2.12], 'COc1ccc(C=O)cc1': [9.88, 7.84, 7.00, 3.88], 'Cc1ccc(N)cc1': [6.97, 6.62, 2.24], 'Clc1ccccc1': [7.33, 7.28, 7.22], 'Brc1ccccc1': [7.50, 7.27, 7.23], 'N#Cc1ccccc1': [7.65, 7.60, 7.47],
};
const C = {
  'CCO': [58.3, 18.4], 'CCOC(C)=O': [171.1, 60.5, 21.0, 14.2], 'Cc1ccccc1': [137.9, 129.1, 128.3, 125.4, 21.5], 'COc1ccccc1': [159.7, 129.5, 120.7, 114.0, 55.1],
  'CC(=O)c1ccccc1': [198.1, 137.1, 133.1, 128.6, 128.3, 26.6], 'CC(C)=O': [206.6, 30.8], 'CCOCC': [65.9, 15.4], 'BrCCCC': [34.8, 33.4, 21.4, 13.2],
  'CC(C)O': [64.2, 25.3], 'CCC=O': [202.8, 37.3, 6.0], 'CC(=O)O': [178.0, 20.8], 'CCN(CC)CC': [46.5, 11.8], 'COC(=O)c1ccccc1': [167.1, 132.9, 130.2, 129.6, 128.4, 52.1],
  'O=Cc1ccccc1': [192.4, 136.4, 134.5, 129.7, 129.0], 'C=Cc1ccccc1': [137.6, 136.9, 128.5, 127.8, 126.2, 113.8], 'C=CCCCC': [139.2, 114.2, 33.6, 31.1, 22.4, 14.0],
  'C1CCCCC1': [27.0], 'ClCCl': [53.8], 'ClC(Cl)Cl': [77.2], 'CC#N': [116.4, 1.8], 'CN(C)C=O': [162.6, 36.5, 31.4], 'c1ccncc1': [149.9, 135.9, 123.7],
  'Oc1ccccc1': [155.0, 129.7, 121.0, 115.3], 'Nc1ccccc1': [146.4, 129.3, 118.6, 115.2], 'c1ccc2ccccc2c1': [133.5, 128.0, 125.9], 'C1CCOC1': [67.9, 25.7],
  'CC(C)(C)O': [69.1, 31.2], 'CCC(C)=O': [209.3, 36.9, 29.4, 7.9], 'OCc1ccccc1': [140.9, 128.6, 127.6, 127.0, 65.2], 'O=[N+]([O-])c1ccccc1': [148.3, 134.7, 129.4, 123.5],
  'N#Cc1ccccc1': [132.8, 132.1, 129.1, 118.8, 112.4], 'Clc1ccccc1': [134.3, 129.7, 128.6, 126.4], 'C=CC(=O)OC': [166.6, 130.6, 128.2, 51.6],
  'COC(C)(C)C': [72.7, 49.4, 27.0], 'CCCO': [64.2, 25.9, 10.1], 'CCCC': [25.0, 13.4], 'CCCCCC': [31.9, 22.9, 14.1], 'c1ccoc1': [142.8, 109.7], 'c1ccsc1': [127.3, 125.6],
  'CCc1ccccc1': [144.3, 128.4, 127.9, 125.7, 29.0, 15.6], 'C1COCCO1': [67.2], 'CC(=O)Nc1ccccc1': [168.5, 138.0, 129.0, 124.3, 120.0, 24.5],
  'O=C1CCCCC1': [211.9, 42.0, 27.1, 25.1], 'CCC(=O)O': [181.5, 27.6, 8.9], 'CCCCO': [62.4, 35.0, 19.1, 13.9], 'O=C(O)c1ccccc1': [172.6, 133.9, 130.3, 129.4, 128.5],
  'CC(=O)OC': [171.4, 51.6, 20.7], 'CCN': [36.9, 19.0], 'CN(C)C': [47.5], 'CC=O': [200.5, 31.2], 'COc1ccc(C=O)cc1': [190.8, 164.6, 132.0, 130.0, 114.3, 55.6], 'CS(C)=O': [41.0], 'CC#CC': [74.6, 3.3], 'CCCCCl': [44.7, 34.7, 20.2, 13.4],
};
let tot = 0, err = 0, cnt = 0, bad = 0;
const run = (tab, nuc, lim) => {
  let e = 0, n = 0, wrongN = 0;
  for (const [smi, ref] of Object.entries(tab)) {
    let sig;
    try { sig = P.nmr(S.toMol(smi), nuc).filter(s => !s.broad); } catch (x) { console.log('Fehler', smi, x.message); wrongN++; continue; }
    const pr = sig.map(s => s.d).sort((a, b) => b - a), rf = [...ref].sort((a, b) => b - a);
    if (pr.length !== rf.length) { wrongN++; if (V) console.log(`  ${nuc} ${smi}: ${pr.length} statt ${rf.length} Signale`, pr.map(x => x.toFixed(2)).join(' '), '|', rf.join(' ')); }
    const k = Math.min(pr.length, rf.length);
    let me = 0;
    for (let i = 0; i < k; i++) { me += Math.abs(pr[i] - rf[i]); }
    e += me; n += k;
    if (V && k && me / k > lim) console.log(`  ${nuc} ${smi}: Ø ${(me / k).toFixed(2)}`, pr.map(x => x.toFixed(2)).join(' '), '|', rf.join(' '));
  }
  console.log(`${nuc}: mittlerer Fehler ${(e / n).toFixed(3)} ppm über ${n} Signale, ${wrongN} Stoffe mit falscher Signalzahl`);
  return { m: e / n, wrongN };
};
const h = run(H, 'H', 0.2), c = run(C, 'C', 4);
const ok = h.m <= 0.15 && c.m <= 3 && h.wrongN <= 3 && c.wrongN <= 3;
console.log(ok ? 'NMR-Referenz: Ziel erreicht' : 'NMR-Referenz: Ziel NICHT erreicht');
process.exitCode = ok ? 0 : 1;
