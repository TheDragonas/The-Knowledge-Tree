'use strict';
/* Chem-Draw-Darstellungen (1.28, chem-models.js): Elektronenkonfiguration, Valenz, freie Paare, Hybridisierung,
 * Lewis/Bohr/Orbitale/3D zeichnen (gültiges SVG, Elektronen gezählt), 3D-Geometrie (Bindungslängen, Winkel).
 * Aufruf: node tests/chem/modelle-test.js */
const fs = require('fs');
const src = ['chem.js', 'chem-layout.js', 'chem-models.js'].map(f => fs.readFileSync(__dirname + '/../../web/js/' + f, 'utf8')).join('\n');
const ctx = { clamp: (v, a, b) => Math.max(a, Math.min(b, v)) };
new Function('clamp', src + '\nObject.assign(this,{ChemMol,ChemSmiles,ChemRender,ChemModels,BL,ChemLayout});').call(ctx, ctx.clamp);
const { ChemSmiles: S, ChemRender: R, ChemModels: M, ChemMol } = ctx;
let ok = 0, fail = 0;
const check = (label, cond, info = '') => { if (cond) ok++; else { fail++; console.log('  FEHLER:', label, info); } };

// Konfigurationen
const C = (el, q, want) => check(`Konfiguration ${el}${q ? q : ''}`, M.configText(el, q, true) === want, M.configText(el, q, true));
C('H', 0, '1s¹'); C('C', 0, '[He] 2s² 2p²'); C('O', 0, '[He] 2s² 2p⁴'); C('Na', 0, '[Ne] 3s¹'); C('Cl', -1, '[Ne] 3s² 3p⁶');
C('Fe', 0, '[Ar] 4s² 3d⁶'); C('Cr', 0, '[Ar] 4s¹ 3d⁵'); C('Cu', 0, '[Ar] 4s¹ 3d¹⁰'); C('Fe', 2, '[Ar] 3d⁶'); C('Na', 1, '[He] 2s² 2p⁶');
check('Schalen Cl: 2 8 7', M.shells('Cl').join() === '2,8,7', M.shells('Cl').join());
check('Schalen K: 2 8 8 1', M.shells('K').join() === '2,8,8,1');
check('Valenz O 6, N⁺ 4, Cl⁻ 8, Fe 2', M.valence('O') === 6 && M.valence('N', 1) === 4 && M.valence('Cl', -1) === 8 && M.valence('Fe') === 2);

// Strukturen mit allen H, freie Paare, Hybridisierung
const F = (smi) => M.full(S.toMol(smi));
const at = (f, el) => f.atoms.filter(a => a.el === el);
const w = F('O');   // Wasser
check('Wasser: 2 H dazu, O mit 2 freien Paaren, sp³', at(w, 'H').length === 2 && at(w, 'O')[0].lp === 2 && at(w, 'O')[0].hyb === 'sp³');
const am = F('N');
check('Ammoniak: N 1 freies Paar', at(am, 'N')[0].lp === 1 && at(am, 'H').length === 3);
const eth = F('C=C');
check('Ethen: C sp², je 1 π', at(eth, 'C').every(a => a.hyb === 'sp²' && a.pi === 1) && at(eth, 'H').length === 4);
const co2 = F('O=C=O');
check('CO₂: C sp, O sp² mit 2 Paaren', at(co2, 'C')[0].hyb === 'sp' && at(co2, 'O').every(a => a.lp === 2 && a.hyb === 'sp²'));
const nh4 = F('[NH4+]');
check('NH₄⁺: kein freies Paar', at(nh4, 'N')[0].lp === 0 && at(nh4, 'H').length === 4);
const no = F('[N]=O');   // Stickstoffmonoxid-Radikal: N mit 3 Bindungen? – hier N=O ohne H
check('O in N=O: 2 freie Paare', at(no, 'O')[0].lp === 2);
// Elektronen insgesamt (Lewis): Σ Valenz = 2·Bindungen + freie Elektronen
for (const smi of ['CCO', 'O=C(O)C', 'c1ccccc1', 'C#N', 'OS(=O)(=O)O', '[O-]C=O']) {
  const f = F(smi);
  const V = f.atoms.reduce((s, a) => s + a.val, 0), used = 2 * f.bonds.reduce((s, b) => s + b.o, 0) + f.atoms.reduce((s, a) => s + 2 * a.lp + a.rad, 0);
  check(`Elektronenbilanz ${smi}`, V === used, `${V} vs ${used}`);
}
// Zeichnen: alle Darstellungen geben SVG mit sinnvoller Grösse
for (const model of ['lewis', 'bohr', 'orbital', '3d']) {
  for (const smi of ['CCO', 'c1ccccc1', 'C[C@H](N)C(=O)O', 'Cl', '[Na+].[Cl-]']) {
    const m = S.toMol(smi), an = ChemMol.analyze(m);
    let r = null, err = null;
    try { r = R.draw(m, { model, caption: true, style3d: model === '3d' ? 'wolke' : undefined }, an); } catch (e) { err = e; }
    const okSvg = r && r.body.length > 100 && isFinite(r.box.x0) && r.box.x1 > r.box.x0 && !/NaN|undefined/.test(r.body);
    check(`${model}: ${smi}`, !err && okSvg, err ? err.stack.split('\n').slice(0, 2).join(' ') : r && (r.body.match(/NaN|undefined/) || [''])[0]);
    if (!err && model !== '3d') { const svg = R.toSVG(m, { model }, an).svg; check(`${model}: eigenständiges SVG ${smi}`, /^<svg xmlns/.test(svg) && svg.endsWith('</svg>')); }
  }
}
// Bohr: Elektronen gezählt = Summe aller Elektronen
{
  const m = S.toMol('O'), r = R.draw(m, { model: 'bohr' }, ChemMol.analyze(m));
  const n = (r.body.match(/r="2.1"/g) || []).length - 2;   // minus 2 Punkte der Legende
  check('Bohr Wasser: 10 Elektronen', n === 10, n);
  const c = S.toMol('[Cl-]'), rc = R.draw(c, { model: 'bohr' }, ChemMol.analyze(c));
  check('Bohr Cl⁻: 18 Elektronen, 3 Schalen', (rc.body.match(/r="2.1"/g) || []).length === 18 && (rc.body.match(/fill="none" stroke=/g) || []).length === 3);
}
// Orbitale: Kästchen mit Pfeilen nach Hund (C: 2p mit zwei ↑)
{
  const b = M.boxDiagram('C', 0, 0, 0).svg;
  const up = (b.match(/stroke="#1f6fd1"/g) || []).length, dn = (b.match(/stroke="#d1341d"/g) || []).length;
  check('Kästchen C: 4 ↑ (1s, 2s, 2× 2p), 2 ↓', up === 4 && dn === 2, [up, dn]);
  const n = M.boxDiagram('N', 0, 0, 0).svg;
  check('Kästchen N: 2p mit drei ↑', (n.match(/stroke="#1f6fd1"/g) || []).length === 5 && (n.match(/stroke="#d1341d"/g) || []).length === 2);
}
// 3D-Geometrie
const dist = (P, i, j) => Math.hypot(P[i][0] - P[j][0], P[i][1] - P[j][1], P[i][2] - P[j][2]);
const angle = (P, i, c, j) => { const a = P[i].map((v, k) => v - P[c][k]), b = P[j].map((v, k) => v - P[c][k]); return Math.acos((a[0] * b[0] + a[1] * b[1] + a[2] * b[2]) / Math.hypot(...a) / Math.hypot(...b)) * 180 / Math.PI; };
{
  const e = M.embed(S.toMol('C'));   // Methan
  const c = e.F.atoms.findIndex(a => a.el === 'C'), hs = e.F.atoms.map((a, i) => i).filter(i => e.F.atoms[i].el === 'H');
  const L = hs.map(h => dist(e.P, c, h)), A = [];
  for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) A.push(angle(e.P, hs[i], c, hs[j]));
  check('Methan: C–H ≈ 1.07 Å', L.every(l => Math.abs(l - 1.07) < 0.08), L.map(l => l.toFixed(2)));
  check('Methan: Tetraeder ≈ 109.5°', A.every(a => Math.abs(a - 109.5) < 7), A.map(a => a.toFixed(0)));
  const w3 = M.embed(S.toMol('O')); const o = w3.F.atoms.findIndex(a => a.el === 'O'), h = w3.F.atoms.map((a, i) => i).filter(i => w3.F.atoms[i].el === 'H');
  const aw = angle(w3.P, h[0], o, h[1]);
  check('Wasser: gewinkelt (~105–110°)', aw > 100 && aw < 115, aw.toFixed(1));
  const b = M.embed(S.toMol('c1ccccc1')); const cs = b.F.atoms.map((a, i) => i).filter(i => b.F.atoms[i].el === 'C');
  const zs = cs.map(i => b.P[i][2]), zr = Math.max(...zs) - Math.min(...zs);
  // Ebene: Abstand der C-Atome zu ihrer besten Ebene klein (Hauptachsen grob über Kreuzprodukt dreier Atome)
  const [p, q, r] = [cs[0], cs[2], cs[4]].map(i => b.P[i]);
  const u = q.map((v, k) => v - p[k]), v2 = r.map((v, k) => v - p[k]);
  const nrm = [u[1] * v2[2] - u[2] * v2[1], u[2] * v2[0] - u[0] * v2[2], u[0] * v2[1] - u[1] * v2[0]], nl = Math.hypot(...nrm);
  const off = cs.map(i => Math.abs(b.P[i].reduce((s, val, k) => s + (val - p[k]) * nrm[k] / nl, 0)));
  check('Benzol: eben (sp²)', Math.max(...off) < 0.15, off.map(x => x.toFixed(2)));
  const cy = M.embed(S.toMol('C1CCCCC1')); const cc = cy.F.atoms.map((a, i) => i).filter(i => cy.F.atoms[i].el === 'C');
  const ac = cc.map((c0, k) => angle(cy.P, cc[(k + 5) % 6], c0, cc[(k + 1) % 6]));
  check('Cyclohexan: Winkel nahe 109.5° (nicht eben)', ac.every(a => a > 103 && a < 116), ac.map(a => a.toFixed(0)));
  void zr;
}
// Drehen: Matrix bleibt orthonormal
{ let Rm = M.rotDefault(); for (let i = 0; i < 40; i++) Rm = M.rotate(Rm, 13, -7); const d = Rm[0] * Rm[0] + Rm[1] * Rm[1] + Rm[2] * Rm[2]; check('Drehmatrix bleibt normiert', Math.abs(d - 1) < 1e-3, d); }
// 1.49: realistische Konformationen (Sessel, Briefumschlag, ebene Aromaten, äquatoriale Substituenten)
{
  const tors = (P, a, b, c, d) => {
    const s = (u, v) => [u[0] - v[0], u[1] - v[1], u[2] - v[2]], cr = (u, v) => [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]], dt = (u, v) => u[0] * v[0] + u[1] * v[1] + u[2] * v[2];
    const b1 = s(P[b], P[a]), b2 = s(P[c], P[b]), b3 = s(P[d], P[c]), n1 = cr(b1, b2), n2 = cr(b2, b3), l = Math.hypot(...b2), m1 = cr(n1, b2.map(x => x / l));
    return Math.atan2(dt(m1, n2), dt(n1, n2)) * 180 / Math.PI;
  };
  const ringT = (smi, size) => {
    const mol = S.toMol(smi); if (ctx.ChemLayout) ctx.ChemLayout.layout(mol);
    const E = M.embed(mol), r = M.rings(E.F).find(x => x.length === size);
    return { E, r, t: r.map((_, k) => tors(E.P, r[k], r[(k + 1) % size], r[(k + 2) % size], r[(k + 3) % size])) };
  };
  const ch = ringT('C1CCCCC1', 6);
  check('Cyclohexan: Sessel (Torsionen abwechselnd ±50–65°)', ch.t.every((x, k) => Math.abs(Math.abs(x) - 57) < 9 && Math.sign(x) !== Math.sign(ch.t[(k + 1) % 6])), ch.t.map(Math.round).join());
  const dec = ringT('C1CCC2CCCCC2C1', 6);
  check('Decalin: beide Ringe Sessel', M.rings(dec.E.F).filter(r => r.length === 6).every(r => r.every((_, k) => Math.abs(Math.abs(tors(dec.E.P, r[k], r[(k + 1) % 6], r[(k + 2) % 6], r[(k + 3) % 6])) - 57) < 10)));
  const bz = ringT('c1ccccc1', 6);
  check('Benzol: eben (Torsionen < 3°)', bz.t.every(x => Math.abs(x) < 3), bz.t.map(Math.round).join());
  const cp = ringT('C1CCCC1', 5);
  check('Cyclopentan: Briefumschlag (eine Torsion ~0, grösste 30–50°)', Math.min(...cp.t.map(Math.abs)) < 6 && Math.max(...cp.t.map(Math.abs)) > 30, cp.t.map(Math.round).join());
  // Methylcyclohexan: Methyl äquatorial (Winkel zur Ringnormalen > 55°)
  const mc = ringT('CC1CCCCC1', 6), P = mc.E.P, A = mc.E.F.atoms;
  const me = A.find(a => a.el === 'C' && !mc.r.includes(a.i)), c1 = mc.r.find(i => mc.E.F.adj[i].some(([j]) => j === me.i));
  const cen = [0, 1, 2].map(k => mc.r.reduce((t, i) => t + P[i][k], 0) / 6);
  let N = [0, 0, 0];
  mc.r.forEach((i, k) => { const a = P[i].map((x, q) => x - cen[q]), b = P[mc.r[(k + 1) % 6]].map((x, q) => x - cen[q]); N = [N[0] + a[1] * b[2] - a[2] * b[1], N[1] + a[2] * b[0] - a[0] * b[2], N[2] + a[0] * b[1] - a[1] * b[0]]; });
  const v = [0, 1, 2].map(k => P[me.i][k] - P[c1][k]), cosA = Math.abs(v.reduce((t, x, k) => t + x * N[k], 0)) / Math.hypot(...N) / Math.hypot(...v);
  check('Methylcyclohexan: Methyl äquatorial', Math.acos(cosA) * 180 / Math.PI > 55, Math.round(Math.acos(cosA) * 180 / Math.PI));
  // Butan: gestaffelt (Torsion C-C-C-C nicht verdeckt, |τ| > 50°)
  const bu = S.toMol('CCCC'); if (ctx.ChemLayout) ctx.ChemLayout.layout(bu);
  const Eb = M.embed(bu), Cs = Eb.F.atoms.filter(a => a.el === 'C').map(a => a.i);
  check('Butan: gestaffelt', Math.abs(tors(Eb.P, ...Cs)) > 50, Math.round(tors(Eb.P, ...Cs)));
}
// 1.49: Regeln und entfernte H (Lewis)
{
  const R = (smi) => M.rules(S.toMol(smi)).map(r => r.t).join(' | ');
  check('Hückel: Benzol aromatisch (6 π)', /aromatisch nach Hückel \(6/.test(R('c1ccccc1')), R('c1ccccc1'));
  check('Hückel: Pyrrol aromatisch (freies Paar am N zählt)', /aromatisch nach Hückel \(6/.test(R('c1cc[nH]c1')));
  check('Hückel: Cyclobutadien antiaromatisch', /antiaromatisch \(4/.test(R('C1=CC=C1')));
  check('Oktett: N mit 4 Bindungen → N⁺ vorgeschlagen', /Oktettregel.*N⁺/.test(R('CN(C)(C)C')), R('CN(C)(C)C'));
  check('Methylkation: Elektronensextett', /sextett/i.test(R('[CH3+]')));
  check('Wasser: keine Hinweise', R('O') === '');
  const mol = S.toMol('CC'); mol.atoms[0].hd = 1;
  const f = M.full(mol), c0 = f.atoms.find(a => a.src === mol.atoms[0].id);
  check('H entfernt (hd): CH₂ mit Radikal', f.atoms.filter(a => a.parent === c0.i).length === 2 && c0.rad === 1);
  const lw = M.lewis(S.toMol('CO'), { color: true });
  check('Lewis liefert anklickbare H (4 H mit Atom)', lw.hpos && lw.hpos.length === 4 && lw.hpos.every(h => h.pid != null), lw.hpos && lw.hpos.length);
}
console.log(`${ok} von ${ok + fail} Prüfungen bestanden (Chem-Darstellungen)`);
process.exit(fail ? 1 : 0);
