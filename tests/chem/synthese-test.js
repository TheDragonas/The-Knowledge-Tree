'use strict';
/* Syntheseplanung (1.56, chem-rxn.js): Regeln, Strahlsuche, Weg Edukt → Produkt, Mengen.
 * Aufruf: node tests/chem/synthese-test.js [-v] */
const fs = require('fs');
const src = ['chem.js', 'chem-layout.js', 'chem-name.js', 'chem-db.js', 'chem-models.js', 'chem-props.js', 'chem-rxn.js'].map(f => fs.readFileSync(__dirname + '/../../web/js/' + f, 'utf8')).join('\n');
const ctx = { clamp: (v, a, b) => Math.max(a, Math.min(b, v)) };
new Function('clamp', src + '\nObject.assign(this,{ChemSmiles,ChemRxn,ChemMatch});').call(ctx, ctx.clamp);
const { ChemSmiles: S, ChemRxn: X } = ctx;
const V = process.argv.includes('-v');
let ok = 0, fail = 0;
const check = (label, cond, info = '') => { if (cond) ok++; else { fail++; console.log('  FEHLER:', label, info); } };
const mol = (s) => S.toMol(s, { layout: false });
const key = (s) => X.key(X.fromSmiles(s));
const sm = (m) => X.smiles(m);
// eine Stufe: erwartete Regel mit erwarteten Edukten (Schlüssel)
const one = (prod, rule, pres) => {
  const r = X.retro(mol(prod));
  const hit = r.find(o => o.id === rule && pres.every(p => o.keys.includes(key(p))));
  if (V) console.log(prod, '→', r.slice(0, 6).map(o => `${o.id}[${o.pre.map(sm).join(' + ')}] ${o.score.toFixed(2)}`).join(' | '));
  check(`${rule}: ${prod} ⇐ ${pres.join(' + ')}`, !!hit, r.filter(o => o.id === rule).map(o => o.pre.map(sm).join(' + ')).join(' | ') || 'keine Regel');
  return hit;
};
one('CCOC(C)=O', 'est_fischer', ['CC(=O)O', 'CCO']);
one('CCOC(C)=O', 'est_acid', ['CC(=O)Cl', 'CCO']);
one('CC(=O)Nc1ccccc1', 'amid_cl', ['CC(=O)Cl', 'Nc1ccccc1']);
one('CC(=O)NCc1ccccc1', 'amid_edc', ['CC(=O)O', 'NCc1ccccc1']);
one('CC(C)(C)OC(=O)NCc1ccccc1', 'carb_pg', ['NCc1ccccc1']);
one('CCOc1ccccc1', 'ether_w', ['Oc1ccccc1', 'CCBr']);
one('CC(O)c1ccccc1', 'oh_nabh4', ['CC(=O)c1ccccc1']);
one('CC(O)c1ccccc1', 'oh_grignard', ['O=Cc1ccccc1', 'CBr']);
one('OCc1ccccc1', 'oh_lah', ['COC(=O)c1ccccc1']);
one('CC(=O)c1ccccc1', 'co_dmp', ['CC(O)c1ccccc1']);
one('CC(=O)c1ccccc1', 'co_fc', ['c1ccccc1', 'CC(=O)Cl']);
one('O=C(C=Cc1ccccc1)c1ccccc1', 'co_aldol', ['O=Cc1ccccc1', 'CC(=O)c1ccccc1']);
one('OC(=O)c1ccccc1', 'acid_ester', ['COC(=O)c1ccccc1']);
one('OC(=O)c1ccccc1', 'acid_kmno4', ['Cc1ccccc1']);
one('CCCC(=O)O', 'acid_cn', ['CCCC#N']);
one('CCCNCc1ccccc1', 'am_redam', ['O=Cc1ccccc1', 'CCCN']);
one('Nc1ccccc1', 'am_nitro', ['O=[N+]([O-])c1ccccc1']);
one('CCOC(=O)C=Cc1ccccc1', 'ene_hwe', ['O=Cc1ccccc1']);
one('c1ccc(cc1)-c1ccccc1'.replace('-', ''), 'ar_suzuki', ['Brc1ccccc1', 'OB(O)c1ccccc1']);
one('O=[N+]([O-])c1ccccc1', 'ar_nitr', ['c1ccccc1']);
one('Brc1ccc(O)cc1', 'ar_brom', ['Oc1ccccc1']);
one('BrCCCc1ccccc1', 'rx_oh', ['OCCCc1ccccc1']);
one('C1=CCC(CC1)C(=O)OC', 'da', ['C=CC=C', 'C=CC(=O)OC']);
one('CC1(C)OC1', 'epox', ['C=C(C)C'].map(() => 'CC(C)=C'));
one('CC1(C)OCCO1', 'acetal', ['CC(C)=O']);
one('CC(=O)Nc1ccc(O)cc1', 'acetyl_ac2o', ['Nc1ccc(O)cc1']);
check('Paracetamol: Ac₂O-Acetylierung an erster Stelle', X.retro(mol('CC(=O)Nc1ccc(O)cc1'))[0].id === 'acetyl_ac2o');
one('O=C(Cl)c1ccccc1', 'acyl_cl', ['O=C(O)c1ccccc1']);
one('CCN(CC)Cc1ccccc1', 'am_amidred', ['CCN(CC)C(=O)c1ccccc1']);
one('Cc1ccc(cc1)S(=O)(=O)NCc1ccccc1', 'sulfonamid', ['Cc1ccc(cc1)S(=O)(=O)Cl', 'NCc1ccccc1']);
// Toxikologie/Ökologie (1.57): einfache, ungiftige Wege zuerst
check('Ethylacetat: Fischer-Veresterung vor DCC-Kupplung', (() => { const r = X.retro(mol('CCOC(C)=O')); const f = r.findIndex(o => o.id === 'est_fischer'), d = r.findIndex(o => o.id === 'est_steglich'); return f === 0 && d > f; })());
check('Gefahren-Bewertung: DCC/DCM bedenklicher als H₂SO₄ kat./Ethanol', (() => { const r = X.retro(mol('CCOC(C)=O')); return r.find(o => o.id === 'est_steglich').hz.green < r.find(o => o.id === 'est_fischer').hz.green - 0.3; })());
// Flags / Empfehlung
const r1 = X.retro(mol('c1ccc(cc1)c1ccccc1')).find(o => o.id === 'ar_suzuki');
check('Suzuki: Katalysator → nicht empfohlen', r1 && !r1.rec && r1.flags.metal);
check('nur empfohlene: Suzuki fällt weg', !X.retro(mol('c1ccc(cc1)c1ccccc1'), { recOnly: true }).some(o => o.id === 'ar_suzuki'));
const g = X.retro(mol('OCCCC(O)c1ccccc1')).find(o => o.id === 'oh_grignard');
check('Grignard mit zweiter OH: Abzug (Schutzgruppe)', g && /Schutzgruppe/.test(g.note), g && g.note);
// Planung mehrstufig
const t0 = Date.now();
const routes = X.plan(mol('CC(=O)Nc1ccc(O)cc1'), { maxSteps: 3 });
if (V) for (const r of routes) console.log('Paracetamol', r.score.toFixed(3), X.steps(r.root).map(n => n.step.opt.id).join(' → '), '| Start:', X.leaves(r.root).map(l => sm(l.mol)).join(', '));
check('Paracetamol: Routen gefunden', routes.length >= 3, routes.length);
check('Paracetamol: Acetylierung von 4-Aminophenol unter den besten 3', routes.slice(0, 3).some(r => X.steps(r.root).some(n => /amid/.test(n.step.opt.id)) && X.leaves(r.root).some(l => l.key === key('Nc1ccc(O)cc1'))));
check('Planung schnell (< 6 s)', Date.now() - t0 < 6000, Date.now() - t0);
// Edukt → Produkt
const w = X.route(mol('Cc1ccccc1'), mol('CCOC(=O)c1ccccc1'), { maxSteps: 3 });
if (V) for (const r of w.routes.slice(0, 3)) console.log('Toluol→Ethylbenzoat', X.steps(r.root).map(n => n.step.opt.id).join(' → '));
check('Toluol → Ethylbenzoat (Oxidation, Veresterung)', w.found && X.steps(w.routes[0].root).length === 2, JSON.stringify({ f: w.found, n: w.routes.length }));
const w2 = X.route(mol('O=Cc1ccccc1'), mol('CC(O)c1ccccc1'), { maxSteps: 2 });
check('Benzaldehyd → 1-Phenylethanol (Grignard)', w2.found && X.steps(w2.routes[0].root).some(n => n.step.opt.id === 'oh_grignard'));
// Mengen
const est = X.retro(mol('CCOC(C)=O')).find(o => o.id === 'est_steglich');
const am = X.amounts(est, 10);
check('Mengen: 10 mmol, Edukte und Reagenzien mit Masse', am.length >= 4 && am.every(r => r.n > 0) && am.filter(r => r.m != null).length >= 3, JSON.stringify(am.map(r => [r.name, r.eq, r.m && r.m.toFixed(3)])));
check('Vorschrift-Text', /DCC/.test(X.procedure(est, 10, 'Ethylacetat')));
// alle Regeln liefern gültige Moleküle (Valenz) – über viele Stoffe
let bad = 0, tot = 0;
for (const s of ['CC(C)Cc1ccc(cc1)C(C)C(=O)O', 'CC(=O)Oc1ccccc1C(=O)O', 'COc1ccc(C=CC(=O)OC)cc1', 'CCN(CC)C(=O)c1ccccc1', 'OC1CCCCC1', 'CC(C)(C)OC(=O)NC(C)C(=O)O', 'C=CCOc1ccccc1', 'N#CCc1ccccc1', 'CC(=O)CCc1ccccc1'])
  for (const o of X.retro(mol(s))) { tot++; if (!o.pre.every(p => X.valid(p))) bad++; }
check('alle Edukte valenzrichtig', bad === 0 && tot > 20, `${bad}/${tot}`);
console.log(`${ok} von ${ok + fail} Prüfungen bestanden (Syntheseplanung)`);
process.exitCode = fail ? 1 : 0;
