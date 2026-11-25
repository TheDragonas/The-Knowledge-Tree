'use strict';
/* Chem-Draw-Analyse (1.52, chem-props.js): SMILES/Molfile, Kennzahlen, funktionelle Gruppen, Isotopenmuster, IR, NMR,
 * 3D-Messen. Aufruf: node tests/chem/analyse-test.js */
const fs = require('fs');
const src = ['chem.js', 'chem-layout.js', 'chem-models.js', 'chem-props.js'].map(f => fs.readFileSync(__dirname + '/../../web/js/' + f, 'utf8')).join('\n');
const ctx = { clamp: (v, a, b) => Math.max(a, Math.min(b, v)) };
new Function('clamp', src + '\nObject.assign(this,{ChemMol,ChemSmiles,ChemProps,ChemModels,ChemLayout});').call(ctx, ctx.clamp);
const { ChemSmiles: S, ChemProps: P, ChemModels: M, ChemMol } = ctx;
let ok = 0, fail = 0;
const check = (label, cond, info = '') => { if (cond) ok++; else { fail++; console.log('  FEHLER:', label, info); } };
const mol = (smi) => S.toMol(smi);
const formula = (m) => ChemMol.analyze(m).hill.text || JSON.stringify(ChemMol.analyze(m).counts);
const same = (a, b) => JSON.stringify(ChemMol.analyze(a).counts) === JSON.stringify(ChemMol.analyze(b).counts) && a.bonds.length === b.bonds.length;

// SMILES schreiben und wieder lesen (gleiche Summenformel, gleich viele Bindungen, gleiche Bindungsordnungen)
for (const smi of ['CCO', 'CC(=O)Oc1ccccc1C(=O)O', 'c1ccc2ccccc2c1', 'C1CCCCC1', 'O=[N+]([O-])c1ccccc1', 'CC(C)CC(C)(C)C', 'C#N', 'OCC1OC(O)C(O)C(O)C1O', '[NH4+].[Cl-]', 'CC(C)Cc1ccc(cc1)C(C)C(=O)O', 'C1CC2CCC1CC2']) {
  const m = mol(smi), w = P.smiles(m);
  let back = null;
  try { back = mol(w); } catch (e) { back = null; }
  const ords = (x) => x.bonds.map(b => b.o).sort().join('');
  check('SMILES ' + smi, back && same(m, back) && ords(m) === ords(back), w);
}
check('SMILES Ethanol kurz', P.smiles(mol('OCC')) === 'CCO' || P.smiles(mol('OCC')) === 'OCC', P.smiles(mol('OCC')));
// Molfile hin und zurück
for (const smi of ['CC(=O)O', 'c1ccccc1O', '[O-][N+](=O)C', 'C[C@H](N)C(=O)O']) {
  const m = mol(smi), t = P.molfile(m, 'Test');
  const back = P.parseMolfile(t);
  check('Molfile ' + smi, same(m, back) && /V2000/.test(t) && /M {2}END/.test(t), formula(back));
}
check('Molfile Ladung', /M {2}CHG/.test(P.molfile(mol('[O-][N+](=O)C'))));
check('Molfile Fehler erkannt', (() => { try { P.parseMolfile('kein molfile'); return false; } catch (e) { return true; } })());
// Kennzahlen
const pr = (smi) => P.props(mol(smi));
const e = pr('CCO');
check('Ethanol DBE 0, Donor 1, Akzeptor 1, TPSA 20,23', e.dbe === 0 && e.hbd === 1 && e.hba === 1 && Math.abs(e.tpsa - 20.23) < 0.01, JSON.stringify(e));
check('Benzol DBE 4', pr('c1ccccc1').dbe === 4);
const asp = pr('CC(=O)Oc1ccccc1C(=O)O');
check('Aspirin TPSA 63,6, 1 Donor, 4 Akzeptoren, 3 drehbare Bindungen', Math.abs(asp.tpsa - 63.6) < 0.1 && asp.hbd === 1 && asp.hba === 4 && asp.rot === 3, JSON.stringify(asp));
const ibu = pr('CC(C)Cc1ccc(cc1)C(C)C(=O)O');
check('Ibuprofen TPSA 37,3, 4 drehbare, Lipinski ok', Math.abs(ibu.tpsa - 37.3) < 0.1 && ibu.rot === 4 && ibu.lipOk, JSON.stringify(ibu));
check('Paracetamol TPSA 49,33', Math.abs(pr('CC(=O)Nc1ccc(O)cc1').tpsa - 49.33) < 0.1, pr('CC(=O)Nc1ccc(O)cc1').tpsa);
check('logP Hexan > Ethanol > Glucose', pr('CCCCCC').logp > pr('CCO').logp && pr('CCO').logp > pr('OCC1OC(O)C(O)C(O)C1O').logp);
check('logP Benzol ≈ 2,1', Math.abs(pr('c1ccccc1').logp - 2.13) < 0.5, pr('c1ccccc1').logp);
// funktionelle Gruppen
const gr = (smi) => P.groups(mol(smi)).map(g => g.k).sort().join(',');
check('Gruppen Essigsäureethylester', gr('CCOC(C)=O') === 'ester', gr('CCOC(C)=O'));
check('Gruppen Essigsäure', gr('CC(=O)O') === 'acid', gr('CC(=O)O'));
check('Gruppen Aceton', gr('CC(C)=O') === 'ketone');
check('Gruppen Alkohole prim/sek/tert', gr('CCO') === 'alc1' && gr('CC(C)O') === 'alc2' && gr('CC(C)(C)O') === 'alc3');
check('Gruppen Anilin', gr('Nc1ccccc1') === 'aniline,arene', gr('Nc1ccccc1'));
check('Gruppen Benzonitril', gr('N#Cc1ccccc1') === 'arene,nitrile', gr('N#Cc1ccccc1'));
check('Gruppen Paracetamol', gr('CC(=O)Nc1ccc(O)cc1') === 'amide,arene,phenol', gr('CC(=O)Nc1ccc(O)cc1'));
check('Gruppen Diethylether, Ethanal, Ethen', gr('CCOCC') === 'ether' && gr('CC=O') === 'aldehyde' && gr('C=C') === 'alkene');
check('Gruppen Nitrobenzol, Chlorethan, Pyridin', gr('O=[N+]([O-])c1ccccc1') === 'arene,nitro' && gr('CCCl') === 'alkhal' && gr('c1ccncc1') === 'pyridine', gr('c1ccncc1'));
// Isotopenmuster
const iso = (smi) => P.isotopes(ChemMol.analyze(mol(smi)).counts);
const dcm = iso('ClCCl');
const at = (pk, n) => (pk.find(p => p.nom === n) || { rel: 0 }).rel;
check('CH₂Cl₂: 84 : 86 : 88 ≈ 100 : 64 : 10', Math.abs(at(dcm, 84) - 100) < 0.5 && Math.abs(at(dcm, 86) - 64) < 2 && Math.abs(at(dcm, 88) - 10.2) < 1, dcm.map(p => p.nom + ':' + p.rel.toFixed(1)).join(' '));
const brb = iso('Brc1ccccc1');
check('Brombenzol 156/158 fast gleich', Math.abs(at(brb, 158) - 97.3) < 2 && at(brb, 156) > 95, brb.map(p => p.nom + ':' + p.rel.toFixed(1)).join(' '));
const bz = iso('c1ccccc1');
check('Benzol M+1 ≈ 6,5 %', Math.abs(at(bz, 79) - 6.5) < 0.3 && Math.abs(bz[0].m - 78.047) < 0.01, at(bz, 79));
check('Bruchstücke Toluol: 91 (Tropylium)', P.fragments(mol('Cc1ccccc1'), P.groups(mol('Cc1ccccc1')), 92).some(f => f.mz === 91));
// IR
const ir = (smi) => P.ir(mol(smi), P.groups(mol(smi))).map(b => b.t);
check('IR Aceton: C=O Keton', ir('CC(C)=O').some(t => /C=O Keton/.test(t)));
check('IR Ethanol: O–H breit', ir('CCO').some(t => /O–H/.test(t)));
check('IR Essigsäure: Säure-OH + C=O', ir('CC(=O)O').some(t => /Säure \(sehr breit/.test(t)) && ir('CC(=O)O').some(t => /C=O Säure/.test(t)));
check('IR-Kurve Aceton: Minimum bei ~1715', (() => { const B = P.ir(mol('CC(C)=O'), P.groups(mol('CC(C)=O'))); let best = 4000, bv = 2; for (let nu = 400; nu <= 4000; nu += 5) { const v = P.irCurve(B, nu); if (v < bv) { bv = v; best = nu; } } return Math.abs(best - 1715) < 15; })());
// IR-Fingerprint aus Normalschwingungen (1.54)
const md = (smi) => P.irModes(mol(smi));
const near = (ms, lo, hi, re) => ms.some(x => x.nu >= lo && x.nu <= hi && re.test(x.label));
check('IR berechnet: Aceton C=O 1690–1750', near(md('CC(C)=O'), 1690, 1750, /C=O/), JSON.stringify(md('CC(C)=O').filter(x => /C=O/.test(x.label)).map(x => Math.round(x.nu))));
check('IR berechnet: Ester C=O 1725–1770, Amid 1650–1700', near(md('CCOC(C)=O'), 1725, 1770, /C=O/) && near(md('CC(N)=O'), 1650, 1700, /C=O/));
check('IR berechnet: Benzol C–H aus der Ebene 640–720 (stark)', md('c1ccccc1').some(x => x.nu > 640 && x.nu < 720 && x.rel > 0.5));
check('IR berechnet: CH₂Cl₂ C–Cl 690–800', near(md('ClCCl'), 690, 800, /Cl/));
check('IR berechnet: Nitril C≡N 2200–2280', near(md('CC#N'), 2200, 2280, /C≡N/));
check('IR berechnet: keine unsinnigen Wellenzahlen', ['C#CC', 'C=CC=C', 'CC(C)(C)O'].every(s2 => md(s2).every(x => x.nu > 150 && x.nu < 4000)));
check('IR-Spektrum mit Fingerprint-Hinweis', /◀ Fingerprint/.test(P.svgIR(P.ir(mol('CCO'), P.groups(mol('CCO'))), null, md('CCO'))));
// ¹H-NMR
const h = (smi) => P.nmrH(mol(smi));
const et = h('CCO');
check('¹H Ethanol: 3 Signale, CH₃ t 3H, CH₂ q 2H, OH s', et.length === 3 && et.some(s => s.n === 3 && s.mult === 't') && et.some(s => s.n === 2 && s.mult === 'q' && s.d > 3.2 && s.d < 4) && et.some(s => s.broad), JSON.stringify(et.map(s => [s.d, s.n, s.mult])));
const ea = h('CCOC(C)=O');
check('¹H Ethylacetat: s 3H ~2,1, q 2H ~4,1, t 3H ~1,2', ea.length === 3 && ea.some(s => s.mult === 's' && s.n === 3 && Math.abs(s.d - 2.1) < 0.3) && ea.some(s => s.mult === 'q' && Math.abs(s.d - 4.1) < 0.4) && ea.some(s => s.mult === 't' && s.n === 3), JSON.stringify(ea.map(s => [s.d, s.n, s.mult])));
const bzh = h('c1ccccc1');
check('¹H Benzol: 1 Signal s 6H 7,27', bzh.length === 1 && bzh[0].n === 6 && bzh[0].mult === 's' && Math.abs(bzh[0].d - 7.27) < 0.05, JSON.stringify(bzh));
const tol = h('Cc1ccccc1');
check('¹H Toluol: CH₃ s 3H ~2,3', tol.some(s => s.n === 3 && s.mult === 's' && Math.abs(s.d - 2.3) < 0.3), JSON.stringify(tol.map(s => [s.d, s.n, s.mult])));
check('¹H Isopropyl: sept + d', (() => { const x = h('CC(C)Cl'); return x.some(s => s.mult === 'sept' && s.n === 1) && x.some(s => s.mult === 'd' && s.n === 6); })());
check('¹H Ethanal: CHO ~9,7 q', h('CC=O').some(s => s.d > 9.5 && s.mult === 'q'));
// 1. Ordnung, einzigartige Signale, Dacheffekt (1.54)
const sty = h('C=Cc1ccccc1');
const vin = sty.filter(s => s.d > 5 && s.d < 7);
check('¹H Styrol: 3 Vinyl-Signale je 1H (dd), =CH₂ getrennt (cis/trans)', vin.length === 3 && vin.every(s => s.n === 1 && s.mult === 'dd'), JSON.stringify(vin.map(s => [s.d, s.mult, s.J])));
check('¹H Styrol: J trans 17 und cis 10,5 Hz am =CH', vin.some(s => s.J.includes(17) && s.J.includes(10.5)), JSON.stringify(vin.map(s => s.J)));
const tolA = h('Cc1ccccc1').filter(s => s.d > 6.5);
check('¹H Toluol: 3 aromatische Signale (o/m/p), Inkremente < 7,26', tolA.length === 3 && tolA.every(s => s.d < 7.26) && tolA.reduce((t, s) => t + s.n, 0) === 5, JSON.stringify(tolA.map(s => [s.d, s.n, s.mult])));
const nb = h('O=[N+]([O-])c1ccccc1').filter(s => s.d > 6.5);
check('¹H Nitrobenzol: ortho-H am tiefsten Feld (~8,2)', Math.max(...nb.map(s => s.d)) > 8.1, JSON.stringify(nb.map(s => s.d)));
const ala = h('C[C@@H](C(=O)O)CC');   // 2-Methylbutansäure: CH₂ neben Stereozentrum
check('¹H diastereotope CH₂ neben Stereozentrum: zwei Signale', ala.filter(s => /diastereotop/.test(s.env)).length === 2, JSON.stringify(ala.map(s => [s.d, s.env])));
const prc = h('CCCCl');
check('¹H 1-Chlorpropan: CH₂ in der Mitte Sextett (gleiche J vereint)', prc.some(s => s.mult === 'sext' && s.n === 2), JSON.stringify(prc.map(s => [s.d, s.mult])));
const etc = h('CCO').find(s => s.mult === 'q');
const L60 = P.lines(etc, 60), L600 = P.lines(etc, 600);
check('Dacheffekt: Linien zum Partner (CH₃, hochfeld) höher, bei 60 MHz stärker', L60[0].w > L60[3].w && (L60[0].w / L60[3].w) > (L600[0].w / L600[3].w), JSON.stringify(L60.map(l => l.w.toFixed(3))));
check('Linienabstand = J/MHz', Math.abs((L600[1].o - L600[0].o) * 600 - 7) < 0.01);
const hr = P.svgNMR(h('CCO'), 'H', { x0: 3.8, x1: 3.6 }, 1, 600);
check('hochaufgelöstes Spektrum als Kurve, Integral standardmässig aus', /stroke="#7048e8"/.test(hr) && !/stroke="#2b8a3e"/.test(hr) && /600 MHz/.test(hr));
check('Integral einschaltbar', /stroke="#2b8a3e"/.test(P.svgNMR(h('CCO'), 'H', null, 1, 600, { integral: true })));
// Beschriftung (1.55): Buchstaben, verteilt ohne Überlappung, Striche zum Peak (abschaltbar)
const ibuH = h('CC(C)Cc1ccc(cc1)C(C)C(=O)O'), sv = P.svgNMR(ibuH, 'H', null, 1, 600);
const labX = [...sv.matchAll(/<text x="([\d.]+)" y="(\d+)" font-size="9" text-anchor="middle" fill="currentColor" font-weight="600">([^<]*)</g)].map(m => ({ x: +m[1], y: +m[2], t: m[3] }));
const overl = labX.some((a, i) => labX.some((b, j) => j > i && a.y === b.y && Math.abs(a.x - b.x) < (a.t.length + b.t.length) * 9 * 0.52 / 2));
check('Ibuprofen ¹H: alle Signale beschriftet, nichts überdeckt', labX.length === ibuH.length && !overl, JSON.stringify(labX));
check('Zuordnungs-Striche an / aus', (sv.match(/stroke-width=".6" opacity=".45"/g) || []).length === ibuH.length && !/stroke-width=".6" opacity=".45"/.test(P.svgNMR(ibuH, 'H', null, 1, 600, { leaders: false })));
check('Buchstaben a, b, c … nach Verschiebung', /a · 1H/.test(sv) && P.nmrLetter(0) === 'a' && P.nmrLetter(2) === 'c');
// ¹³C-NMR
const c = (smi) => P.nmrC(mol(smi));
check('¹³C Ethanol: 2 Signale (~58, ~18)', (() => { const x = c('CCO'); return x.length === 2 && Math.abs(x[0].d - 58) < 8 && Math.abs(x[1].d - 18) < 8; })(), JSON.stringify(c('CCO')));
check('¹³C Benzol: 1 Signal 128', c('c1ccccc1').length === 1 && Math.abs(c('c1ccccc1')[0].d - 128) < 2);
check('¹³C Aceton: 2 Signale, C=O > 200', c('CC(C)=O').length === 2 && c('CC(C)=O')[0].d > 200);
check('¹³C Toluol: 5 Signale', c('Cc1ccccc1').length === 5, c('Cc1ccccc1').length);
check('¹³C p-Xylol: 3 Signale (Symmetrie)', c('Cc1ccc(C)cc1').length === 3);
// weitere Kerne (1.53): ¹⁹F, ³¹P, ¹⁵N
const X = (smi, k) => P.nmr(mol(smi), k);
check('¹⁹F TFA ≈ −76,5', X('OC(=O)C(F)(F)F', 'F').length === 1 && X('OC(=O)C(F)(F)F', 'F')[0].d === -76.5 && X('OC(=O)C(F)(F)F', 'F')[0].n === 3);
check('¹⁹F Fluorbenzol ≈ −113', X('Fc1ccccc1', 'F')[0].d === -113);
const atp = X('C1=NC(=C2C(=N1)N(C=N2)[C@H]3[C@@H]([C@@H]([C@H](O3)COP(=O)(O)OP(=O)(O)OP(=O)(O)O)O)O)N', 'P');
check('³¹P ATP: 3 Signale, β ≈ −21', atp.length === 3 && atp.some(s => s.d === -21), JSON.stringify(atp.map(s => s.d)));
check('³¹P Phosphoramidit ≈ 149', X('ClP(OCCC#N)N(C(C)C)C(C)C', 'P')[0].d === 180 && X('CC1=CN(C(=O)NC1=O)C2CC(OP(N(C(C)C)C(C)C)OCCC#N)C(CO)O2', 'P')[0].d === 149);
const pybop = X('C1CCN(C1)[P+](N2CCCC2)(N3CCCC3)ON4N=NC5=CC=CC=C54.F[P-](F)(F)(F)(F)F', 'P');
check('³¹P PyBOP: Phosphonium + PF₆⁻ (−144)', pybop.length === 2 && pybop.some(s => s.d === -144), JSON.stringify(pybop.map(s => s.d)));
check('Valenz PF₆⁻ ohne Fehler', !ChemMol.analyze(mol('F[P-](F)(F)(F)(F)F')).valErr.length);
const dmap = X('CN(C)c1ccncc1', 'N');
check('¹⁵N DMAP: Pyridin-N ≈ 310 und Amin-N', dmap.length === 2 && dmap[0].d === 310, JSON.stringify(dmap.map(s => s.d)));
check('¹⁵N DCC: Carbodiimid', X('C1CCC(CC1)N=C=NC2CCCCC2', 'N').length === 1 && /Carbodiimid/.test(X('C1CCC(CC1)N=C=NC2CCCCC2', 'N')[0].env));
check('hasNuc', P.hasNuc(P.graph(mol('CCO')), 'H') && !P.hasNuc(P.graph(mol('CCO')), 'F'));
// Zoom-Ausschnitt und Bild
const zs = P.svgNMR(h('CCO'), 'H', { x0: 4, x1: 3 });
check('NMR-Ausschnitt: Bereich im SVG, Linien aufgespalten sichtbar', /data-x0="4"/.test(zs) && /data-x1="3"/.test(zs) && /3\.\d\d q · 7 Hz/.test(zs), zs.slice(0, 200));
check('IR-Ausschnitt', /data-x0="1800"/.test(P.svgIR(P.ir(mol('CC(C)=O'), P.groups(mol('CC(C)=O'))), { x0: 1800, x1: 1600 })));
check('MS Höhe ×10', /Höhe ×10/.test(P.svgMS(iso('ClCCl'), [], null, 10)));
const st = P.standalone(P.svgIR(P.ir(mol('CCO'), P.groups(mol('CCO')))), 'Ethanol – IR');
check('eigenständiges Bild: weisser Grund, keine currentColor', /fill="#fff"/.test(st) && !/currentColor/.test(st) && /Ethanol – IR/.test(st));
// 3D messen
const E3 = (smi) => M.embed(mol(smi));
const eth = E3('CC');
const ci = eth.F.atoms.filter(a => a.el === 'C').map(a => a.i);
const dCC = P.measure(eth.P, ci);
check('3D Ethan C–C ≈ 1,53 Å', Math.abs(dCC.value - 1.53) < 0.08, dCC.text);
const me = E3('C');
const hs = me.F.atoms.filter(a => a.el === 'H').map(a => a.i), c0 = me.F.atoms.find(a => a.el === 'C').i;
const ang = P.measure(me.P, [hs[0], c0, hs[1]]);
check('3D Methan H–C–H ≈ 109,5°', Math.abs(ang.value - 109.5) < 4, ang.text);
const bu = E3('CCCC');
const cc = bu.F.atoms.filter(a => a.el === 'C').map(a => a.i);
const dh = P.measure(bu.P, cc);
check('3D Butan Diederwinkel gestaffelt (|φ| > 50°)', Math.abs(dh.value) > 50, dh.text);
// Diagramme
for (const [k, svg] of [['IR', P.svgIR(P.ir(mol('CCO'), P.groups(mol('CCO'))))], ['MS', P.svgMS(iso('ClCCl'), [])], ['NMR', P.svgNMR(h('CCOC(C)=O'), 'H')], ['C', P.svgNMR(c('CCO'), 'C')]]) check('SVG ' + k, /^<svg[\s\S]*<\/svg>$/.test(svg) && !/NaN|undefined/.test(svg));
// Massenspektrum (1.54): simulierte EI-Bruchstücke – Basispeaks bekannter Spektren
const ms = (smi) => P.msSim(mol(smi));
const basePk = (smi) => { const r = ms(smi); return r.peaks.reduce((a, b) => b.rel > a.rel ? b : a).nom; };
const pkRel = (smi, mz) => { const p = ms(smi).peaks.find(x => x.nom === mz); return p ? p.rel : 0; };
check('MS Ethanol Basispeak 31 (α-Spaltung)', basePk('CCO') === 31, basePk('CCO'));
check('MS Toluol Basispeak 91 (Tropylium)', basePk('Cc1ccccc1') === 91, basePk('Cc1ccccc1'));
check('MS Propylamin Basispeak 30 (Iminium)', basePk('CCCN') === 30, basePk('CCCN'));
check('MS 2-Pentanon 43 Acylium + McLafferty 58', basePk('CCCC(=O)C') === 43 && pkRel('CCCC(=O)C', 58) > 30);
check('MS Ethylacetat Basispeak 43', basePk('CC(=O)OCC') === 43, basePk('CC(=O)OCC'));
check('MS Paracetamol 109 (Keten-Verlust)', basePk('CC(=O)Nc1ccc(O)cc1') === 109, basePk('CC(=O)Nc1ccc(O)cc1'));
check('MS Aspirin 120 (ortho-Effekt) + 138', basePk('CC(=O)Oc1ccccc1C(=O)O') === 120 && pkRel('CC(=O)Oc1ccccc1C(=O)O', 138) > 30);
check('MS Hexan: C₃/C₄-Kationen stärker als M⁺', pkRel('CCCCCC', 57) > pkRel('CCCCCC', 86) && pkRel('CCCCCC', 43) > pkRel('CCCCCC', 86));
check('MS tert-Butanol: M⁺ fast weg, 59 Basispeak', basePk('CC(C)(C)O') === 59 && pkRel('CC(C)(C)O', 74) < 5);
check('MS Bromethan: M/M+2 ≈ 1:1 und Bruchstück mit ⁸¹Br-Partner', Math.abs(pkRel('CCBr', 93) - pkRel('CCBr', 95)) < 5 && Math.abs(pkRel('CCBr', 108) / pkRel('CCBr', 110) - 1.03) < 0.08);
check('MS SVG mit Bruchstücken', (() => { const svg = P.svgMS(ms('CCCC(=O)C').peaks, []); return /#e8590c/.test(svg) && !/NaN|undefined/.test(svg); })());
check('MS Benzol: nur M⁺ (+¹³C)', basePk('c1ccccc1') === 78);
// 1.55: weitere Zerfallswege und Bruchstück-Strukturen
check('MS Triethylamin 86 (α) und 58 (− C₂H₄)', basePk('CCN(CC)CC') === 86 && pkRel('CCN(CC)CC', 58) > 20);
check('MS Nitrobenzol 77 (− NO₂), 93 (− NO)', basePk('O=[N+]([O-])c1ccccc1') === 77 && pkRel('O=[N+]([O-])c1ccccc1', 93) > 5);
check('MS Benzophenon 105 Basispeak, 77', basePk('O=C(c1ccccc1)c1ccccc1') === 105 && pkRel('O=C(c1ccccc1)c1ccccc1', 77) > 25);
check('MS Cyclohexan 56 (− C₂H₄)', basePk('C1CCCCC1') === 56);
check('MS Cyclohexen Retro-Diels-Alder 54', pkRel('C1=CCCCC1', 54) > 30);
check('MS Butanal McLafferty 44', basePk('CCCC=O') === 44);
check('MS Anisol 78 (− CH₂O)', pkRel('COc1ccccc1', 78) > 20);
{
  const sim = ms('CC(=O)c1ccccc1'), i77 = sim.ions.find(x => x.mz === 77), ch = P.msChain(sim, i77);
  check('MS Abbruchfolge Acetophenon: 120 → 105 → 77', ch.map(x => x.mz).join('→') === '120→105→77', ch.map(x => x.mz).join('→'));
  check('MS Ion trägt Atome und Bruchstelle', i77.set.size === 6 && sim.ions.find(x => x.mz === 105).cut.length === 1);
}
// IR (1.55): Carbonyl- und andere Lagen gegen Messwerte (±15 cm⁻¹)
const irB = (smi) => { const m0 = mol(smi); return P.ir(m0, P.groups(m0)); };
const coAt = (smi) => { const x = irB(smi).filter(b => /^C=O/.test(b.t)).sort((a, b) => b.s - a.s)[0]; return x ? x.c : 0; };
for (const [smi, nu, name] of [['CC(C)=O', 1715, 'Aceton'], ['O=C1CCCC1', 1745, 'Cyclopentanon'], ['O=C1CCCCC1', 1715, 'Cyclohexanon'], ['CC(=O)c1ccccc1', 1686, 'Acetophenon'],
  ['O=Cc1ccccc1', 1703, 'Benzaldehyd'], ['CCC=O', 1730, 'Propanal'], ['CCOC(C)=O', 1742, 'Ethylacetat'], ['CC(=O)Oc1ccccc1', 1765, 'Phenylacetat'], ['COC(=O)c1ccccc1', 1724, 'Methylbenzoat'],
  ['O=C1CCCO1', 1770, 'γ-Butyrolacton'], ['CC(=O)O', 1712, 'Essigsäure'], ['OC(=O)c1ccccc1', 1690, 'Benzoesäure'], ['CC(Cl)=O', 1806, 'Acetylchlorid'], ['CN(C)C=O', 1675, 'DMF'],
  ['CNC(C)=O', 1660, 'N-Methylacetamid'], ['C=CC(C)=O', 1685, 'Methylvinylketon']])
  check(`IR ${name} C=O ≈ ${nu}`, Math.abs(coAt(smi) - nu) <= 15, coAt(smi));
check('IR Acetanhydrid 1822 + 1758', ['sym.', 'asym.'].every((k, q) => Math.abs((irB('CC(=O)OC(C)=O').find(b => b.t === 'C=O Anhydrid (' + k + ')') || {}).c - [1822, 1758][q]) <= 10));
const bandAt = (smi, re) => (irB(smi).find(b => re.test(b.t)) || {}).c || 0;
check('IR Acetonitril C≡N 2250, Benzonitril 2228', Math.abs(bandAt('CC#N', /C≡N/) - 2250) <= 10 && Math.abs(bandAt('N#Cc1ccccc1', /C≡N/) - 2228) <= 10);
check('IR Toluol: monosubstituiert 750 + 700', Math.abs(bandAt('Cc1ccccc1', /monosubstituiert/) - 752) <= 10 && /Ring-Deform/.test(irB('Cc1ccccc1').map(b => b.t).join()));
check('IR p-Xylol: para 820', Math.abs(bandAt('Cc1ccc(C)cc1', /para/) - 822) <= 10);
check('IR 1-Hexen: Vinyl 990 + 910', bandAt('C=CCCCC', /Vinyl/) > 900);
check('IR Nitrobenzol 1525 / 1348', Math.abs(bandAt('O=[N+]([O-])c1ccccc1', /NO₂ asym/) - 1525) <= 10 && Math.abs(bandAt('O=[N+]([O-])c1ccccc1', /NO₂ sym/) - 1348) <= 10);
check('IR Anisol C–O–C 1250', Math.abs(bandAt('COc1ccccc1', /Aryl-\/Vinylether/) - 1250) <= 10);
console.log(`${ok} von ${ok + fail} Prüfungen bestanden (Chem-Draw-Analyse)`);
process.exitCode = fail ? 1 : 0;
