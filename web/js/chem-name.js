'use strict';
/* Chem-Draw: IUPAC-Namen aus der Struktur (substitutive Nomenklatur nach den Regeln von 2013,
 * deutsch oder englisch). Unterstützt: Ketten und einzelne Ringe aus Kohlenstoff (auch Benzol),
 * Hauptgruppen Säure, Sulfonsäure, Ester, Säurehalogenid, Amid, Nitril, Aldehyd, Keton,
 * Alkohol/Phenol, Thiol, Amin (auch Ionen: -oat, -aminium) und viele Präfixe; Stereodeskriptoren
 * (R/S, E/Z). Kondensierte Ringe und Heterocyclen -> kein Name (dafür gibt es die Trivialnamen). */

const CHEM_NAME_VOC = {
  de: {
    stem: ['', 'meth', 'eth', 'prop', 'but', 'pent', 'hex', 'hept', 'oct', 'non', 'dec', 'undec', 'dodec', 'tridec', 'tetradec', 'pentadec', 'hexadec', 'heptadec', 'octadec', 'nonadec', 'icos', 'henicos', 'docos', 'tricos', 'tetracos', 'pentacos', 'hexacos', 'heptacos', 'octacos', 'nonacos', 'triacont', 'hentriacont', 'dotriacont', 'tritriacont', 'tetratriacont', 'pentatriacont', 'hexatriacont', 'heptatriacont', 'octatriacont', 'nonatriacont', 'tetracont'],
    an: 'an', en: 'en', yn: 'in', benzene: 'benzol', cyclo: 'cyclo', yl: 'yl', ylidene: 'yliden',
    halo: { F: 'fluor', Cl: 'chlor', Br: 'brom', I: 'iod' },
    halide: { F: 'fluorid', Cl: 'chlorid', Br: 'bromid', I: 'iodid' },
    p: { hydroxy: 'hydroxy', oxo: 'oxo', amino: 'amino', nitro: 'nitro', cyano: 'cyano', carboxy: 'carboxy', formyl: 'formyl', sulfanyl: 'sulfanyl', sulfo: 'sulfo', carboxylato: 'carboxylato', oxido: 'oxido', azaniumyl: 'azaniumyl', carbamoyl: 'carbamoyl', imino: 'imino', phenyl: 'phenyl', benzyl: 'benzyl', ethenyl: 'ethenyl', ethynyl: 'ethinyl', tbutyl: 'tert-butyl', anilino: 'anilino', acetyl: 'acetyl', benzoyl: 'benzoyl', acetamido: 'acetamido', benzamido: 'benzamido', oxy: 'oxy', carbonyl: 'carbonyl', oyl: 'oyl', thio: 'sulfanyl' },
    alkoxy: { 1: 'methoxy', 2: 'ethoxy', 3: 'propoxy', 4: 'butoxy' }, phenoxy: 'phenoxy', tbutoxy: 'tert-butoxy',
    suf: {
      acid: ['säure', 'carbonsäure'], carboxylate: ['oat', 'carboxylat'], ester: ['oat', 'carboxylat'], acylhalide: ['oyl', 'carbonyl'],
      amide: ['amid', 'carboxamid'], nitrile: ['nitril', 'carbonitril'], aldehyde: ['al', 'carbaldehyd'], ketone: ['on'], alcohol: ['ol'],
      thiol: ['thiol'], amine: ['amin'], sulfonic: ['sulfonsäure'], aminium: ['aminium'],
    },
    benz: { acid: 'benzoesäure', carboxylate: 'benzoat', ester: 'benzoat', amide: 'benzamid', nitrile: 'benzonitril', aldehyde: 'benzaldehyd', alcohol: 'phenol', amine: 'anilin', acylhalide: 'benzoyl' },
    sp: '', esterJoin: '', halideJoin: '',
    cation: { Na: 'natrium', K: 'kalium', Li: 'lithium', Ca: 'calcium', Mg: 'magnesium', Ba: 'barium', Al: 'aluminium', Zn: 'zink', Ag: 'silber', Cs: 'caesium', Rb: 'rubidium', Sr: 'strontium', NH4: 'ammonium' },
    anion: { F: 'fluorid', Cl: 'chlorid', Br: 'bromid', I: 'iodid', OH: 'hydroxid' },
    small: { H2O: 'Wasser', H3N: 'Ammoniak', H2O2: 'Wasserstoffperoxid', ClH: 'Chlorwasserstoff', BrH: 'Bromwasserstoff', FH: 'Fluorwasserstoff', IH: 'Iodwasserstoff', H2S: 'Schwefelwasserstoff', H2N2: 'Diazen', H4N2: 'Hydrazin', HNO3: 'Salpetersäure', H2O4S: 'Schwefelsäure', H3O4P: 'Phosphorsäure', HNO2: 'Salpetrige Säure', O2: 'Sauerstoff', N2: 'Stickstoff', H2: 'Wasserstoff', Cl2: 'Chlor', O3: 'Ozon', H2O3S: 'Schweflige Säure' },
  },
  en: {
    stem: ['', 'meth', 'eth', 'prop', 'but', 'pent', 'hex', 'hept', 'oct', 'non', 'dec', 'undec', 'dodec', 'tridec', 'tetradec', 'pentadec', 'hexadec', 'heptadec', 'octadec', 'nonadec', 'icos', 'henicos', 'docos', 'tricos', 'tetracos', 'pentacos', 'hexacos', 'heptacos', 'octacos', 'nonacos', 'triacont', 'hentriacont', 'dotriacont', 'tritriacont', 'tetratriacont', 'pentatriacont', 'hexatriacont', 'heptatriacont', 'octatriacont', 'nonatriacont', 'tetracont'],
    an: 'ane', en: 'ene', yn: 'yne', benzene: 'benzene', cyclo: 'cyclo', yl: 'yl', ylidene: 'ylidene',
    halo: { F: 'fluoro', Cl: 'chloro', Br: 'bromo', I: 'iodo' },
    halide: { F: 'fluoride', Cl: 'chloride', Br: 'bromide', I: 'iodide' },
    p: { hydroxy: 'hydroxy', oxo: 'oxo', amino: 'amino', nitro: 'nitro', cyano: 'cyano', carboxy: 'carboxy', formyl: 'formyl', sulfanyl: 'sulfanyl', sulfo: 'sulfo', carboxylato: 'carboxylato', oxido: 'oxido', azaniumyl: 'azaniumyl', carbamoyl: 'carbamoyl', imino: 'imino', phenyl: 'phenyl', benzyl: 'benzyl', ethenyl: 'ethenyl', ethynyl: 'ethynyl', tbutyl: 'tert-butyl', anilino: 'anilino', acetyl: 'acetyl', benzoyl: 'benzoyl', acetamido: 'acetamido', benzamido: 'benzamido', oxy: 'oxy', carbonyl: 'carbonyl', oyl: 'oyl', thio: 'sulfanyl' },
    alkoxy: { 1: 'methoxy', 2: 'ethoxy', 3: 'propoxy', 4: 'butoxy' }, phenoxy: 'phenoxy', tbutoxy: 'tert-butoxy',
    suf: {
      acid: ['oic acid', 'carboxylic acid'], carboxylate: ['oate', 'carboxylate'], ester: ['oate', 'carboxylate'], acylhalide: ['oyl', 'carbonyl'],
      amide: ['amide', 'carboxamide'], nitrile: ['nitrile', 'carbonitrile'], aldehyde: ['al', 'carbaldehyde'], ketone: ['one'], alcohol: ['ol'],
      thiol: ['thiol'], amine: ['amine'], sulfonic: ['sulfonic acid'], aminium: ['aminium'],
    },
    benz: { acid: 'benzoic acid', carboxylate: 'benzoate', ester: 'benzoate', amide: 'benzamide', nitrile: 'benzonitrile', aldehyde: 'benzaldehyde', alcohol: 'phenol', amine: 'aniline', acylhalide: 'benzoyl' },
    sp: ' ', esterJoin: ' ', halideJoin: ' ',
    cation: { Na: 'sodium', K: 'potassium', Li: 'lithium', Ca: 'calcium', Mg: 'magnesium', Ba: 'barium', Al: 'aluminium', Zn: 'zinc', Ag: 'silver', Cs: 'caesium', Rb: 'rubidium', Sr: 'strontium', NH4: 'ammonium' },
    anion: { F: 'fluoride', Cl: 'chloride', Br: 'bromide', I: 'iodide', OH: 'hydroxide' },
    small: { H2O: 'water', H3N: 'ammonia', H2O2: 'hydrogen peroxide', ClH: 'hydrogen chloride', BrH: 'hydrogen bromide', FH: 'hydrogen fluoride', IH: 'hydrogen iodide', H2S: 'hydrogen sulfide', H2N2: 'diazene', H4N2: 'hydrazine', HNO3: 'nitric acid', H2O4S: 'sulfuric acid', H3O4P: 'phosphoric acid', HNO2: 'nitrous acid', O2: 'oxygen', N2: 'nitrogen', H2: 'hydrogen', Cl2: 'chlorine', O3: 'ozone', H2O3S: 'sulfurous acid' },
  },
};
const CHEM_MULT = ['', '', 'di', 'tri', 'tetra', 'penta', 'hexa', 'hepta', 'octa', 'nona', 'deca', 'undeca', 'dodeca'];
const CHEM_MULTX = ['', '', 'bis', 'tris', 'tetrakis', 'pentakis', 'hexakis', 'heptakis', 'octakis', 'nonakis', 'decakis'];
/* Rangfolge der Hauptgruppen (kleiner = höher) */
const CHEM_RANK = { carboxylate: 1, aminium: 2, acid: 3, sulfonic: 4, ester: 5, acylhalide: 6, amide: 7, nitrile: 8, aldehyde: 9, ketone: 10, alcohol: 11, thiol: 12, amine: 13 };
const CHEM_TERMINAL = { acid: 1, carboxylate: 1, ester: 1, acylhalide: 1, amide: 1, nitrile: 1, aldehyde: 1 };

/* Ringsysteme mit fester Nummerierung: [deutsch, englisch, SMILES in Nummernfolge, Lokanten, gesättigt] */
const CHEM_RING_TPL = [
  ['naphthalin', 'naphthalene', 'c1cccc2ccccc12', '1,2,3,4,4a,5,6,7,8,8a'],
  ['inden', 'indene', 'C1C=Cc2ccccc12', '1,2,3,3a,4,5,6,7,7a'],
  ['azulen', 'azulene', 'c1ccc2cccccc12', '1,2,3,3a,4,5,6,7,8,8a'],
  ['fluoren', 'fluorene', 'c1cccc2c3ccccc3Cc12', '1,2,3,4,4a,4b,5,6,7,8,8a,9,9a'],
  ['anthracen', 'anthracene', 'c1cccc2cc3ccccc3cc12', '1,2,3,4,4a,10,10a,5,6,7,8,8a,9,9a'],
  ['phenanthren', 'phenanthrene', 'c1cccc2c3ccccc3ccc12', '1,2,3,4,4a,4b,5,6,7,8,8a,9,10,10a'],
  ['pyridin', 'pyridine', 'n1ccccc1'],
  ['pyrrol', 'pyrrole', '[nH]1cccc1'],
  ['furan', 'furan', 'o1cccc1'],
  ['thiophen', 'thiophene', 's1cccc1'],
  ['imidazol', 'imidazole', '[nH]1cncc1'],
  ['pyrazol', 'pyrazole', '[nH]1nccc1'],
  ['1,3-oxazol', '1,3-oxazole', 'o1cncc1'],
  ['1,2-oxazol', '1,2-oxazole', 'o1nccc1'],
  ['1,3-thiazol', '1,3-thiazole', 's1cncc1'],
  ['1,2-thiazol', '1,2-thiazole', 's1nccc1'],
  ['pyrimidin', 'pyrimidine', 'n1cnccc1'],
  ['pyrazin', 'pyrazine', 'n1ccncc1'],
  ['pyridazin', 'pyridazine', 'n1ncccc1'],
  ['1,3,5-triazin', '1,3,5-triazine', 'n1cncnc1'],
  ['pyran', 'pyran', 'O1CC=CC=C1'],
  ['indol', 'indole', '[nH]1ccc2ccccc12', '1,2,3,3a,4,5,6,7,7a'],
  ['isoindol', 'isoindole', 'c1[nH]cc2ccccc12', '1,2,3,3a,4,5,6,7,7a'],
  ['1-benzofuran', '1-benzofuran', 'o1ccc2ccccc12', '1,2,3,3a,4,5,6,7,7a'],
  ['2-benzofuran', '2-benzofuran', 'c1occ2ccccc12', '1,2,3,3a,4,5,6,7,7a'],
  ['1-benzothiophen', '1-benzothiophene', 's1ccc2ccccc12', '1,2,3,3a,4,5,6,7,7a'],
  ['benzimidazol', 'benzimidazole', '[nH]1cnc2ccccc12', '1,2,3,3a,4,5,6,7,7a'],
  ['chinolin', 'quinoline', 'n1cccc2ccccc12', '1,2,3,4,4a,5,6,7,8,8a'],
  ['isochinolin', 'isoquinoline', 'c1nccc2ccccc12', '1,2,3,4,4a,5,6,7,8,8a'],
  ['chinoxalin', 'quinoxaline', 'n1ccnc2ccccc12', '1,2,3,4,4a,5,6,7,8,8a'],
  ['chinazolin', 'quinazoline', 'n1cncc2ccccc12', '1,2,3,4,4a,5,6,7,8,8a'],
  ['chromen', 'chromene', 'O1CC=Cc2ccccc12', '1,2,3,4,4a,5,6,7,8,8a'],
  ['purin', 'purine', 'n1cnc2c(c1)nc[nH]2'],
  ['carbazol', 'carbazole', 'c1cccc2c3ccccc3[nH]c12', '1,2,3,4,4a,4b,5,6,7,8,8a,9,9a'],
  ['acridin', 'acridine', 'c1cccc2nc3ccccc3cc12', '1,2,3,4,4a,10,10a,5,6,7,8,8a,9,9a'],
  ['pyrrolidin', 'pyrrolidine', 'N1CCCC1', null, 1],
  ['piperidin', 'piperidine', 'N1CCCCC1', null, 1],
  ['piperazin', 'piperazine', 'N1CCNCC1', null, 1],
  ['morpholin', 'morpholine', 'O1CCNCC1', null, 1],
  ['imidazolidin', 'imidazolidine', 'N1CNCC1', null, 1],
  ['oxolan', 'oxolane', 'O1CCCC1', null, 1],
  ['oxan', 'oxane', 'O1CCCCC1', null, 1],
  ['thiolan', 'thiolane', 'S1CCCC1', null, 1],
  ['thian', 'thiane', 'S1CCCCC1', null, 1],
  ['oxiran', 'oxirane', 'O1CC1', null, 1],
  ['aziridin', 'aziridine', 'N1CC1', null, 1],
  ['oxetan', 'oxetane', 'O1CCC1', null, 1],
  ['azetidin', 'azetidine', 'N1CCC1', null, 1],
  ['1,4-dioxan', '1,4-dioxane', 'O1CCOCC1', null, 1],
  ['1,3-dioxolan', '1,3-dioxolane', 'O1COCC1', null, 1],
  ['azepan', 'azepane', 'N1CCCCCC1', null, 1],
];
let CHEM_RING_PREP = null;
function chemRingTemplates() {
  if (CHEM_RING_PREP) return CHEM_RING_PREP;
  CHEM_RING_PREP = CHEM_RING_TPL.map(([de, en, smi, labels, sat]) => {
    const P = ChemSmiles.parse(smi);
    const n = P.atoms.length;
    const adj = Array.from({ length: n }, () => []);
    for (const b of P.bonds) { adj[b.a].push(b.b); adj[b.b].push(b.a); }
    const el = P.atoms.map(a => a.el);
    const lab = labels ? labels.split(',').map(x => /^\d+$/.test(x) ? +x : x) : el.map((_, k) => k + 1);
    // Atome, die eine Ring-Doppelbindung tragen können (C immer, N mit höchstens 2 Ringbindungen)
    const elig = el.map((e, k) => e === 'C' || (e === 'N' && adj[k].length <= 2));
    const perfect = (excl) => {
      const used = new Array(n).fill(false);
      for (const k of excl) used[k] = true;
      for (let k = 0; k < n; k++) if (!elig[k]) used[k] = true;
      const rec = () => {
        let f = -1;
        for (let k = 0; k < n; k++) if (!used[k]) { f = k; break; }
        if (f < 0) return true;
        used[f] = true;
        for (const j of adj[f]) if (!used[j]) { used[j] = true; if (rec()) { used[j] = false; used[f] = false; return true; } used[j] = false; }
        used[f] = false;
        return false;
      };
      return rec();
    };
    // Anzahl „angezeigter Wasserstoffe“ des mancuden Stamms
    let k0 = 0;
    if (!sat) { const ne = elig.filter(Boolean).length; for (k0 = ne % 2; k0 <= ne; k0 += 2) { if (this_k0(k0)) break; } }
    function this_k0(k) {
      const idx = elig.map((e, i) => e ? i : -1).filter(i => i >= 0);
      const comb = (start, left, acc) => { if (!left) return perfect(acc); for (let i = start; i < idx.length; i++) if (comb(i + 1, left - 1, acc.concat(idx[i]))) return true; return false; };
      return comb(0, k, []);
    }
    return { de, en, n, adj, el, lab, elig, k0, sat: !!sat, perfect, rings: P.bonds.length - n + 1, het: el.some(e => e !== 'C'), hetN: el.includes('N'), nhet: el.filter(e => e !== 'C').length };
  });
  return CHEM_RING_PREP;
}
/* Lokant als Zahl zum Vergleichen: 4 < 4a < 4b < 5 */
const chemLabVal = (l) => typeof l === 'number' ? l : parseInt(l, 10) + ((String(l).match(/[a-z]$/) || [''])[0] ? (String(l).charCodeAt(String(l).length - 1) - 96) / 10 : 0) + (/'/.test(String(l)) ? 0.05 : 0);

class ChemNameError extends Error { }

const ChemName = {
  /* Name des ganzen Moleküls bzw. der Auswahl (ids). -> {name, error} */
  of(m, opts = {}) {
    const lang = opts.lang === 'en' ? 'en' : 'de';
    let mol = m;
    if (opts.ids && opts.ids.size) {
      mol = { atoms: m.atoms.filter(a => opts.ids.has(a.id)), bonds: m.bonds.filter(b => opts.ids.has(b.a) && opts.ids.has(b.b)), nid: m.nid };
    }
    if (!mol.atoms.length) return { name: null, error: 'Nichts ausgewählt' };
    const r = this.tryName(mol, lang);
    if (r.name) return r;
    // mehrere Teile: jeden einzeln benennen (sonst Trivialname aus der Datenbank)
    const comps = this.components(mol);
    if (comps.length > 1) {
      const parts = comps.map(c => {
        const rr = this.tryName(c, lang);
        if (rr.name) return rr.name;
        const t = lang === 'de' && typeof ChemDB !== 'undefined' ? ChemDB.find(c) : null;
        return t ? (t.iupac || t.name) : null;
      });
      if (parts.every(Boolean)) return { name: parts.join(' · ') };
    }
    return r;
  },
  tryName(mol, lang) {
    try {
      const N = new ChemNamer(mol, lang);
      return { name: N.run() };
    } catch (e) {
      if (e instanceof ChemNameError) return { name: null, error: e.message };
      console.warn('Name', e);
      return { name: null, error: 'Name konnte nicht bestimmt werden' };
    }
  },
  components(m) {
    const nb = new Map(m.atoms.map(a => [a.id, []]));
    for (const b of m.bonds) { if (nb.has(b.a) && nb.has(b.b)) { nb.get(b.a).push(b.b); nb.get(b.b).push(b.a); } }
    const seen = new Set(), out = [];
    for (const a of m.atoms) {
      if (seen.has(a.id)) continue;
      const ids = new Set([a.id]), st = [a.id];
      seen.add(a.id);
      while (st.length) { const v = st.pop(); for (const w of nb.get(v)) if (!seen.has(w)) { seen.add(w); ids.add(w); st.push(w); } }
      out.push({ atoms: m.atoms.filter(x => ids.has(x.id)), bonds: m.bonds.filter(b => ids.has(b.a)), nid: m.nid });
    }
    return out;
  },
};

class ChemNamer {
  constructor(mol, lang) {
    this.mol = mol;
    this.lang = lang;
    this.V = CHEM_NAME_VOC[lang];
    const G = this.G = ChemMol.expand(mol);
    this.n = G.n;
    this.heavy = [];
    for (let i = 0; i < G.n; i++) if (!G.plainH[i]) this.heavy.push(i);
    this.isHeavy = (i) => !G.plainH[i];
    this.nbs = (i) => G.adj[i].filter(([j]) => !G.plainH[j]);
    this.H = (i) => ChemMol.effH(G, i);
    this.el = (i) => G.el[i];
    this.q = (i) => G.q[i];
    this.order = (i, j) => { for (const [k, o] of G.adj[i]) if (k === j) return o; return 0; };
    // Stereo
    this.rs = new Map(); this.ez = new Map();
    try {
      const st = ChemMol.stereo(mol, G);
      for (const c of st.centers) if (c.rs) this.rs.set(G.of.get(c.id), c.rs);
      const idx = ChemMol.index(mol);
      for (const e of st.ez) { const b = idx.bondById.get(e.id); if (b) { const a = G.of.get(b.a), c = G.of.get(b.b); this.ez.set(Math.min(a, c) + ',' + Math.max(a, c), e.ez); } }
    } catch (e) { /* ohne Stereo */ }
    // Ringe
    const adj = Array.from({ length: G.n }, (_, i) => G.plainH[i] ? [] : this.nbs(i).map(([j]) => j));
    this.rings = ChemRings.sssr(G.n, adj);
    this.ringOf = new Map();
    this.rings.forEach((r, k) => r.forEach(a => { if (!this.ringOf.has(a)) this.ringOf.set(a, []); this.ringOf.get(a).push(k); }));
    this.systems = ChemRings.systems(this.rings);
    this.sysOf = new Map();
    for (const sy of this.systems) for (const a of sy.atoms) this.sysOf.set(a, sy);
    this.groupsCache = null;
  }
  fail(msg) { throw new ChemNameError(msg); }

  /* ---------------------------------------------------------- Hauptablauf */
  run() {
    // Fragmente
    const seen = new Set(), frags = [];
    for (const s of this.heavy) {
      if (seen.has(s)) continue;
      const list = [s], st = [s];
      seen.add(s);
      while (st.length) { const v = st.pop(); for (const [w] of this.nbs(v)) if (!seen.has(w)) { seen.add(w); st.push(w); list.push(w); } }
      frags.push(list);
    }
    const parts = frags.map(f => this.fragment(f));
    // Salze: Kationen + Anionen
    if (parts.length > 1 && parts.some(p => p.charge > 0) && parts.some(p => p.charge < 0)) {
      const cat = [...new Set(parts.filter(p => p.charge > 0).map(p => p.ion || p.name))];
      const an = [...new Set(parts.filter(p => p.charge < 0).map(p => p.ion || p.name))];
      if (parts.every(p => p.charge !== 0)) {
        const txt = cat.join(this.V.sp) + this.V.sp + an.map(a => this.lang === 'de' ? a.toLowerCase() : a).join(this.V.sp);
        return this.cap(txt.trim());
      }
    }
    return parts.map(p => this.cap(p.name)).join(' · ');
  }
  cap(s) {
    if (this.lang !== 'de') return s;
    // erster Buchstabe gross; Stereodeskriptoren, Lokanten, Klammern und kursive Vorsilben übergehen
    let i = 0;
    const st = s.match(/^\([\dRSEZ,]+\)-/);
    if (st) i = st[0].length;
    while (i < s.length) {
      const rest = s.slice(i);
      const it = rest.match(/^(tert|sec|cis|trans)-/) || rest.match(/^[NOS](?:'|\d+)?(?:,[NOS](?:'|\d+)?)*-/) || rest.match(/^\([\dRSEZ,]+\)-/) || rest.match(/^\d+[a-z]?H(?:,\d+[a-z]?H)*-/);
      if (it) { i += it[0].length; continue; }
      const ch = s[i];
      if (/[a-zäöü]/.test(ch)) return s.slice(0, i) + ch.toUpperCase() + s.slice(i + 1);
      if (/[A-ZÄÖÜ]/.test(ch)) return s;
      i++;
    }
    return s;
  }
  /* Sortierschlüssel: ohne Lokanten, Klammern, Stereo und kursive Vorsilben */
  keyOf(t) {
    return t.replace(/\([\dRSEZ,]+\)-/g, '').replace(/\d+[a-z]?H(?:,\d+[a-z]?H)*-/g, '').replace(/\(\d+[a-z]?H(?:,\d+[a-z]?H)*\)/g, '').replace(/(^|[^a-z])(tert|sec)-/g, '$1').replace(/(^|[^a-zäöü])[NOS](?:'|\d+)?(?:,[NOS](?:'|\d+)?)*-/g, '$1').replace(/[^a-zäöüß]/gi, '').toLowerCase();
  }

  /* ---------------------------------------------------------- ein Fragment */
  fragment(atoms) {
    const V = this.V;
    let charge = 0;
    const counts = {};
    for (const i of atoms) { charge += this.q(i); counts[this.el(i)] = (counts[this.el(i)] || 0) + 1; counts.H = (counts.H || 0) + this.H(i); }
    if (!counts.H) delete counts.H;
    // einatomige Ionen und kleine Teilchen
    if (atoms.length === 1) {
      const e = this.el(atoms[0]);
      if (charge > 0 && V.cation[e]) return { name: V.cation[e], ion: V.cation[e], charge };
      if (charge < 0 && V.anion[e]) return { name: V.anion[e], ion: V.anion[e], charge };
      if (e === 'N' && charge === 1 && this.H(atoms[0]) === 4) return { name: V.cation.NH4, ion: V.cation.NH4, charge };
      if (e === 'O' && charge === -1 && this.H(atoms[0]) === 1) return { name: V.anion.OH, ion: V.anion.OH, charge };
    }
    if (!counts.C) {
      const key = ChemFormula.hill(counts).text;
      if (V.small[key] && !charge) return { name: V.small[key], charge: 0 };
      this.fail('Anorganische Verbindung – nur Trivialname');
    }
    const r = this.organic(atoms);
    return { name: r.name, ion: r.ion, charge };
  }

  /* ---------------------------------------------------------- Gruppen erkennen */
  isHalo(i) { return ['F', 'Cl', 'Br', 'I'].includes(this.el(i)); }
  carbonylO(c) {
    for (const [j, o] of this.nbs(c)) if (o === 2 && this.el(j) === 'O' && this.nbs(j).length === 1 && !this.q(j)) return j;
    return -1;
  }
  /* Gruppe am Kohlenstoff c (Carbonyl-/Nitril-Gruppen) */
  carbonGroup(c) {
    if (this.el(c) !== 'C') return null;
    const nb = this.nbs(c);
    const nit = nb.find(([j, o]) => o === 3 && this.el(j) === 'N' && this.nbs(j).length === 1);
    if (nit) return { type: 'nitrile', f: c, het: [nit[0]] };
    const oO = this.carbonylO(c);
    if (oO < 0) return null;
    const others = nb.filter(([j]) => j !== oO);
    // Ring-Heteroatome gehören zum Gerüst (Lactam, Lacton -> Keton am Ring); N eines Rings am Carbonyl: wie C
    const skel = (j) => this.el(j) === 'C' || this.ringOf.has(j);
    if (this.ringOf.has(c)) return { type: 'ketone', c, het: [oO] };
    const het = others.filter(([j]) => !skel(j));
    const cs = others.filter(([j]) => skel(j));
    if (!het.length) {
      if (this.H(c) >= 1 && cs.length <= 1) return { type: 'aldehyde', f: c, het: [oO] };
      if (cs.length === 2) return { type: 'ketone', c, het: [oO] };
      return null;
    }
    if (het.length > 1 || cs.length > 1) return { type: 'unsupported', why: 'Kohlensäure-/Harnstoff-Derivat' };
    const [x, ox] = het[0];
    if (ox !== 1) return { type: 'unsupported', why: 'Doppelbindung zum Heteroatom' };
    if (this.el(x) === 'O') {
      if (this.q(x) === -1) return { type: 'carboxylate', f: c, het: [oO, x] };
      if (this.H(x) >= 1) return { type: 'acid', f: c, het: [oO, x] };
      const y = this.nbs(x).find(([j]) => j !== c);
      if (y && this.el(y[0]) === 'C' && this.carbonylO(y[0]) < 0 && !this.carbonGroupIsNitrile(y[0])) return { type: 'ester', f: c, het: [oO, x], x, rp: y[0] };
      return { type: 'unsupported', why: 'Anhydrid' };
    }
    if (this.el(x) === 'N' && !this.q(x) && this.nbs(x).every(([, o]) => o === 1)) {
      const ns = this.nbs(x).filter(([j]) => j !== c).map(([j]) => j);
      if (ns.some(j => this.el(j) !== 'C' || this.carbonylO(j) >= 0)) return { type: 'unsupported', why: 'Imid' };
      return { type: 'amide', f: c, het: [oO, x], x, ns };
    }
    if (this.isHalo(x)) return { type: 'acylhalide', f: c, het: [oO, x], hal: this.el(x) };
    return { type: 'unsupported', why: 'unbekannte Carbonylgruppe' };
  }
  carbonGroupIsNitrile(c) { return this.nbs(c).some(([j, o]) => o === 3 && this.el(j) === 'N'); }
  /* alle Gruppen eines Fragments */
  groups(atoms) {
    const out = [];
    for (const c of atoms) {
      const g = this.carbonGroup(c);
      if (!g) continue;
      if (g.type === 'unsupported') this.fail('Nicht unterstützt: ' + g.why);
      out.push(g);
    }
    const carbonylC = new Set(out.filter(g => g.f != null).map(g => g.f));
    for (const g of out) if (g.type === 'ketone') carbonylC.add(g.c);
    for (const x of atoms) {
      const e = this.el(x);
      const nb = this.nbs(x);
      if (e === 'O' && nb.length === 1 && nb[0][1] === 1 && this.el(nb[0][0]) === 'C' && !carbonylC.has(nb[0][0])) {
        if (this.H(x) >= 1 && !this.q(x)) out.push({ type: 'alcohol', c: nb[0][0], het: [x] });
      }
      if (e === 'S' && nb.length === 1 && nb[0][1] === 1 && this.el(nb[0][0]) === 'C' && this.H(x) >= 1) out.push({ type: 'thiol', c: nb[0][0], het: [x] });
      if (e === 'N' && !this.ringOf.has(x) && nb.every(([, o]) => o === 1) && nb.length && nb.every(([j]) => this.el(j) === 'C' && !carbonylC.has(j))) {
        if (!this.q(x)) out.push({ type: 'amine', cs: nb.map(([j]) => j), het: [x], x });
        else if (this.q(x) === 1 && nb.length + this.H(x) === 4) out.push({ type: 'aminium', cs: nb.map(([j]) => j), het: [x], x });
      }
      if (e === 'S' && nb.length === 4) {
        const dO = nb.filter(([j, o]) => o === 2 && this.el(j) === 'O');
        const oh = nb.filter(([j, o]) => o === 1 && this.el(j) === 'O' && this.H(j) >= 1);
        const cc = nb.filter(([j, o]) => o === 1 && this.el(j) === 'C');
        if (dO.length === 2 && oh.length === 1 && cc.length === 1) out.push({ type: 'sulfonic', c: cc[0][0], het: [x, dO[0][0], dO[1][0], oh[0][0]] });
      }
    }
    return out;
  }

  /* ---------------------------------------------------------- Stammsystem */
  organic(atoms) {
    // Ringe prüfen
    const fr = new Set(atoms);
    const myRings = this.rings.filter(r => fr.has(r[0]));
    const mySys = this.systems.filter(sy => fr.has([...sy.atoms][0]));
    for (const sy of mySys) if (!this.ringInfo(sy)) this.fail(sy.rings.length > 1 ? 'Ringsystem ohne bekannten Namen (kondensiert/verbrückt) – nur Trivialname' : 'Heterocyclus ohne bekannten Namen – nur Trivialname');
    for (const a of atoms) if (!['C', 'H', 'N', 'O', 'S', 'F', 'Cl', 'Br', 'I'].includes(this.el(a))) this.fail('Element ' + this.el(a) + ' wird nicht unterstützt');
    const groups = this.groups(atoms);
    let ptype = null;
    for (const g of groups) if (CHEM_RANK[g.type] && (!ptype || CHEM_RANK[g.type] < CHEM_RANK[ptype])) ptype = g.type;
    const principal = groups.filter(g => g.type === ptype);
    if (ptype === 'amine' || ptype === 'aminium') if (principal.filter(g => g.cs.length > 1).length > 1) this.fail('Mehrere substituierte Amine');
    // gesperrte C-Atome: Alkylteil der Ester
    const blocked = new Set();
    for (const g of principal) if (g.type === 'ester') { for (const a of this.branch(g.rp, g.x)) blocked.add(a); }
    // Nitril-C (nicht Hauptgruppe) und Carboxy-C gehören nie zur Kette
    const noChain = new Set();
    for (const g of groups) if (g.f != null && g.type !== ptype && (g.type === 'nitrile' || g.type === 'acid' || g.type === 'carboxylate')) noChain.add(g.f);
    const ringAtoms = new Set(myRings.flat());
    const carbons = atoms.filter(a => this.el(a) === 'C' && !blocked.has(a));
    // Kandidaten
    const cands = [];
    for (const sy of mySys) {
      if ([...sy.atoms].some(a => blocked.has(a))) continue;
      const ri = this.ringInfo(sy);
      if (ri.kind === 'mono') cands.push({ ring: true, atoms: ri.ring, benz: ri.benz });
      else cands.push({ ring: true, tpl: ri, atoms: ri.atoms });
    }
    const termF = new Set(principal.filter(g => CHEM_TERMINAL[g.type]).map(g => g.f));
    for (const mode of termF.size ? ['A', 'B'] : ['A']) {
      const pool = new Set(carbons.filter(a => !ringAtoms.has(a) && !noChain.has(a) && !(mode === 'B' && termF.has(a))));
      for (const path of this.paths(pool)) cands.push({ ring: false, atoms: path, mode });
    }
    if (!cands.length) this.fail('Kein Kohlenstoff-Gerüst');
    // Anzahl Hauptgruppen je Kandidat
    for (const c of cands) {
      const set = new Set(c.atoms);
      c.set = set;
      c.pg = [];
      for (const g of principal) {
        if (CHEM_TERMINAL[g.type]) {
          if (!c.ring && set.has(g.f)) { c.pg.push({ g, at: g.f, inChain: true }); continue; }
          const nb = this.nbs(g.f).find(([j]) => set.has(j));
          if (nb && (c.ring || c.mode === 'B')) c.pg.push({ g, at: nb[0], inChain: false });
        } else if (g.type === 'amine' || g.type === 'aminium') {
          const cc = g.cs.find(j => set.has(j));
          if (cc != null) c.pg.push({ g, at: cc });
        } else if (set.has(g.c)) c.pg.push({ g, at: g.c });
      }
      c.mult = 0; c.dbl = 0;
      if (c.tpl) { c.mult = 99; c.dbl = 99; }
      else if (!c.benz) for (const [a, b] of this.parentBonds(c)) { const o = this.order(a, b); if (o >= 2) c.mult++; if (o === 2) c.dbl++; }
      const T = c.tpl && c.tpl.T;
      c.hetN = T ? (T.hetN ? 1 : 0) : 0; c.het = T ? (T.het ? 1 : 0) : 0; c.nr = T ? T.rings : (c.ring ? 1 : 0); c.nh = T ? T.nhet : 0;
    }
    // Auswahl nach den Kriterien
    let pool = cands;
    const keep = (f) => { const best = Math.max(...pool.map(f)); pool = pool.filter(c => f(c) === best); };
    keep(c => c.pg.length);
    keep(c => c.ring ? 1 : 0);
    keep(c => c.hetN);
    keep(c => c.het);
    keep(c => c.nr);
    keep(c => c.atoms.length);
    keep(c => c.nh);
    keep(c => c.benz ? 3 : c.mult);
    keep(c => c.dbl);
    // Nummerierung je Kandidat, dann Lokanten vergleichen
    let best = null;
    for (const c of pool) {
      const num = this.bestNumbering(c, principal);
      if (!best || this.cmpKeys(num.key, best.num.key) < 0) best = { c, num };
    }
    return this.assemble(best.c, best.num, principal, ptype);
  }
  /* Ringsystem einordnen: einzelner C-Ring (mono) oder bekanntes Ringsystem (tpl) */
  ringInfo(sy) {
    if (sy.info !== undefined) return sy.info;
    const atoms = [...sy.atoms];
    if (sy.rings.length === 1 && atoms.every(a => this.el(a) === 'C')) {
      const r = sy.rings[0];
      return (sy.info = { kind: 'mono', ring: r, benz: this.isBenzene(r) });
    }
    const set = sy.atoms;
    const sb = [];
    for (const a of atoms) for (const [b] of this.nbs(a)) if (set.has(b) && a < b) sb.push([a, b]);
    const allSingle = sb.every(([a, b]) => this.order(a, b) === 1);
    const tpls = chemRingTemplates().slice().sort((x, y) => (allSingle ? (y.sat - x.sat) : 0));
    for (const T of tpls) {
      if (T.n !== atoms.length) continue;
      if (T.sat && !allSingle) continue;
      let tb = 0; for (const l of T.adj) tb += l.length;
      if (tb / 2 !== sb.length) continue;
      const isos = this.isoms(T, atoms, set);
      if (isos.length) return (sy.info = { kind: 'tpl', T, isos, atoms });
    }
    return (sy.info = null);
  }
  /* alle Abbildungen Vorlage -> Atome (gleiche Elemente, gleiche Ringbindungen) */
  isoms(T, atoms, set) {
    const nb = new Map(atoms.map(a => [a, this.nbs(a).filter(([b]) => set.has(b)).map(([b]) => b)]));
    const order = [];
    const seen = new Set([0]);
    const q = [0];
    for (let h = 0; h < q.length; h++) { order.push(q[h]); for (const j of T.adj[q[h]]) if (!seen.has(j)) { seen.add(j); q.push(j); } }
    const map = new Array(T.n).fill(-1), used = new Set(), out = [];
    const rec = (i) => {
      if (out.length >= 48) return;
      if (i === order.length) { out.push(map.slice()); return; }
      const k = order[i];
      for (const a of atoms) {
        if (used.has(a) || this.el(a) !== T.el[k] || nb.get(a).length !== T.adj[k].length) continue;
        let ok = true;
        for (const j of T.adj[k]) if (map[j] >= 0 && !nb.get(a).includes(map[j])) { ok = false; break; }
        if (!ok) continue;
        map[k] = a; used.add(a);
        rec(i + 1);
        map[k] = -1; used.delete(a);
      }
    };
    rec(0);
    return out;
  }
  /* angezeigter / hinzugefügter Wasserstoff und Hydro-Präfixe für eine Nummerierung */
  hydro(T, iso, ketones) {
    if (T.sat) return { ind: [], hydro: [], added: [] };
    const P = [];
    for (let k = 0; k < T.n; k++) {
      if (!T.elig[k]) continue;
      const a = iso[k];
      const dbl = T.adj[k].some(j => this.order(a, iso[j]) === 2);
      if (!dbl) P.push(k);
    }
    let I = null, Iv = null;
    const comb = (start, left, acc) => {
      if (!left) {
        if (!T.perfect(acc)) return;
        const v = acc.map(k => chemLabVal(T.lab[k])).sort((x, y) => x - y);
        if (!I || this.cmpArr(v, Iv) < 0) { I = acc.slice(); Iv = v; }
        return;
      }
      for (let i = start; i < P.length; i++) comb(i + 1, left - 1, acc.concat(P[i]));
    };
    if (T.k0) comb(0, T.k0, []);
    if (!I) I = P.slice(0, T.k0);
    const R = P.filter(k => !I.includes(k)).sort((x, y) => chemLabVal(T.lab[x]) - chemLabVal(T.lab[y]));
    const K = R.filter(k => ketones.has(iso[k]));
    const rest = R.filter(k => !ketones.has(iso[k]));
    const added = rest.splice(0, K.length);   // je Keton ein Wasserstoff aus dem Rest
    return { ind: I.map(k => T.lab[k]), hydro: rest.map(k => T.lab[k]), added: added.map(k => T.lab[k]) };
  }
  isBenzene(r) {
    if (r.length !== 6) return false;
    let d = 0;
    for (let k = 0; k < 6; k++) { const o = this.order(r[k], r[(k + 1) % 6]); if (o === 2) d++; else if (o !== 1) return false; }
    if (d !== 3) return false;
    for (let k = 0; k < 6; k++) if (this.order(r[k], r[(k + 1) % 6]) === this.order(r[(k + 1) % 6], r[(k + 2) % 6])) return false;
    return true;
  }
  /* Ast ab b (ohne über a zu gehen) */
  branch(b, a) {
    const seen = new Set([a, b]), st = [b], out = [b];
    while (st.length) { const v = st.pop(); for (const [w] of this.nbs(v)) if (!seen.has(w)) { seen.add(w); st.push(w); out.push(w); } }
    return out;
  }
  /* alle Blatt-zu-Blatt-Pfade im Wald pool */
  paths(pool) {
    const nb = (v) => this.nbs(v).filter(([w]) => pool.has(w)).map(([w]) => w);
    const leaves = [...pool].filter(v => nb(v).length <= 1);
    const out = [];
    const done = new Set();
    for (const u of leaves) {
      const par = new Map([[u, -1]]), q = [u];
      for (let h = 0; h < q.length; h++) { const v = q[h]; for (const w of nb(v)) if (!par.has(w)) { par.set(w, v); q.push(w); } }
      for (const v of leaves) {
        if (!par.has(v)) continue;
        const k = Math.min(u, v) + ',' + Math.max(u, v);
        if (done.has(k)) continue;
        done.add(k);
        const p = [];
        for (let x = v; x !== -1; x = par.get(x)) p.push(x);
        out.push(p);
        if (out.length > 5000) return out;
      }
    }
    return out;
  }
  parentBonds(c) {
    const a = c.atoms, out = [];
    for (let k = 0; k + 1 < a.length; k++) out.push([a[k], a[k + 1]]);
    if (c.ring) out.push([a[a.length - 1], a[0]]);
    return out;
  }

  /* ---------------------------------------------------------- Nummerierung */
  numberings(c) {
    const a = c.atoms, n = a.length, out = [];
    if (!c.ring) { out.push(a.slice()); if (n > 1) out.push(a.slice().reverse()); return out; }
    for (let s = 0; s < n; s++) for (const d of [1, -1]) { const r = []; for (let k = 0; k < n; k++) r.push(a[((s + d * k) % n + n) % n]); out.push(r); }
    return out;
  }
  /* Anhänge (Präfixe) an das Stammsystem */
  attachments(c, principal) {
    const set = c.set;
    const suffixAtoms = new Set();
    for (const p of c.pg) {
      const g = p.g;
      for (const h of g.het || []) suffixAtoms.add(h);
      if (!p.inChain && g.f != null) suffixAtoms.add(g.f);
    }
    const out = [];
    for (const at of c.atoms) for (const [j, o] of this.nbs(at)) {
      if (set.has(j) || suffixAtoms.has(j)) continue;
      out.push({ at, att: j, o });
    }
    // N-Substituenten (Amin/Amid) und Esterreste
    const nsub = [];
    for (const p of c.pg) {
      const g = p.g;
      if (g.type === 'amine' || g.type === 'aminium') for (const j of g.cs) if (j !== p.at) nsub.push({ att: j, from: g.x });
      if (g.type === 'amide') for (const j of g.ns) nsub.push({ att: j, from: g.x });
    }
    return { pre: out, nsub };
  }
  bestNumbering(c, principal) {
    if (c.tpl) return this.bestNumberingTpl(c, principal);
    const { pre, nsub } = this.attachments(c, principal);
    let best = null;
    for (const order of this.numberings(c)) {
      const loc = new Map(order.map((a, k) => [a, k + 1]));
      const n = order.length;
      const pl = c.pg.map(p => loc.get(p.at)).sort((x, y) => x - y);
      const ml = [], dl = [];
      if (!c.benz) for (const [a, b] of this.parentBonds({ atoms: order, ring: c.ring })) {
        const o = this.order(a, b);
        if (o < 2) continue;
        const la = loc.get(a), lb = loc.get(b);
        const l = (c.ring && Math.abs(la - lb) === n - 1) ? n : Math.min(la, lb);
        ml.push(l);
        if (o === 2) dl.push(l);
      }
      ml.sort((x, y) => x - y); dl.sort((x, y) => x - y);
      const prl = pre.map(p => loc.get(p.at)).sort((x, y) => x - y);
      const key = [pl, ml, dl, prl];
      const cand = { order, loc, key, pre, nsub };
      if (!best || this.cmpKeys(key, best.key) < 0) best = cand;
      else if (this.cmpKeys(key, best.key) === 0) {
        // Gleichstand: alphabetisch zuerst genannter Präfix bekommt den kleineren Lokanten
        best.ties = best.ties || [];
        best.ties.push(cand);
      }
    }
    if (best.ties && best.pre.length) {
      const all = [best, ...best.ties];
      let win = null, winKey = null;
      for (const cand of all) {
        const named = cand.pre.map(p => ({ l: cand.loc.get(p.at), n: this.subName(p.att, p.at, p.o) }));
        named.sort((x, y) => this.alphaCmp(x.n.key, y.n.key) || x.l - y.l);
        const k = named.map(x => x.l);
        // dazu Stereo: R vor S bei gleichem Rest (CIP-Regel für Nummerierung, vereinfacht)
        if (!win || this.cmpArr(k, winKey) < 0) { win = cand; winKey = k; }
      }
      best = win;
    }
    best.key = best.key.concat([[-best.pre.length]]);
    return best;
  }
  bestNumberingTpl(c, principal) {
    const { pre, nsub } = this.attachments(c, principal);
    const T = c.tpl.T;
    const ketones = new Set(c.pg.filter(p => p.g.type === 'ketone').map(p => p.at));
    let best = null;
    for (const iso of c.tpl.isos) {
      const loc = new Map(iso.map((a, k) => [a, T.lab[k]]));
      const hy = this.hydro(T, iso, ketones);
      const v = (arr) => arr.map(chemLabVal).sort((x, y) => x - y);
      const key = [v(hy.ind), v(c.pg.map(p => loc.get(p.at))), v(hy.hydro.concat(hy.added)), v(pre.map(p => loc.get(p.at)))];
      const cand = { order: iso, loc, key, pre, nsub, hy };
      if (!best || this.cmpKeys(key, best.key) < 0) best = cand;
      else if (this.cmpKeys(key, best.key) === 0) { best.ties = best.ties || []; best.ties.push(cand); }
    }
    if (best.ties && best.pre.length) {
      let win = null, winKey = null;
      for (const cand of [best, ...best.ties]) {
        const named = cand.pre.map(p => ({ l: chemLabVal(cand.loc.get(p.at)), n: this.subName(p.att, p.at, p.o) }));
        named.sort((x, y) => this.alphaCmp(x.n.key, y.n.key) || x.l - y.l);
        const k = named.map(x => x.l);
        if (!win || this.cmpArr(k, winKey) < 0) { win = cand; winKey = k; }
      }
      best = win;
    }
    best.key = best.key.concat([[-best.pre.length]]);
    return best;
  }
  /* Name eines Ringsystems mit Hydro-Präfixen und angezeigtem Wasserstoff: "2,3-dihydro-1H-inden" */
  tplCore(T, hy) {
    const stem = this.lang === 'en' ? T.en : T.de;
    let t = '';
    if (hy.hydro.length) t += hy.hydro.join(',') + '-' + CHEM_MULT[hy.hydro.length] + 'hydro';
    if (hy.ind.length) t += (t ? '-' : '') + hy.ind.map(l => l + 'H').join(',') + '-';
    return t + stem;
  }
  cmpArr(a, b) { for (let i = 0; i < Math.min(a.length, b.length); i++) if (a[i] !== b[i]) return a[i] - b[i]; return a.length - b.length; }
  cmpKeys(a, b) {
    for (let i = 0; i < Math.min(a.length, b.length); i++) {
      const x = a[i], y = b[i];
      for (let k = 0; k < Math.min(x.length, y.length); k++) if (x[k] !== y[k]) return x[k] - y[k];
      if (x.length !== y.length) return 0; // unterschiedliche Anzahl: kein Lokantenvergleich möglich
    }
    return 0;
  }
  alphaCmp(a, b) { return a < b ? -1 : a > b ? 1 : 0; }

  /* ---------------------------------------------------------- Präfix-Namen */
  /* Name eines Substituenten, der über att an from hängt (Bindungsordnung o).
   * -> {t: text, key: Sortierschlüssel, cx: zusammengesetzt (Klammern)} */
  subName(att, from, o) {
    this.depth = (this.depth || 0) + 1;
    try {
      if (this.depth > 60) this.fail('Struktur zu verschachtelt');
      return this.subName0(att, from, o);
    } finally { this.depth--; }
  }
  subName0(att, from, o) {
    const V = this.V, P = V.p, e = this.el(att);
    const S = (t, cx = false, key) => ({ t, cx, key: this.keyOf(key || t) });
    if (o === 2 && this.ringOf.has(att)) return this.ringSub(att, from, 'ylidene');
    if (o === 2) {
      if (e === 'O' && this.nbs(att).length === 1) return S(P.oxo);
      if (e === 'N' && this.nbs(att).length === 1 && this.H(att) === 1) return S(P.imino);
      if (e === 'C') return this.chainSub(att, from, 2);
      this.fail('Doppelt gebundener Substituent');
    }
    if (o === 3) {
      if (e === 'C') return this.chainSub(att, from, 3);
      this.fail('Dreifach gebundener Substituent');
    }
    if (this.ringOf.has(att)) return this.ringSub(att, from);
    if (this.isHalo(att)) return S(V.halo[e]);
    if (e === 'O') {
      if (this.q(att) === -1) return S(P.oxido);
      if (this.H(att) >= 1) return S(P.hydroxy);
      const y = this.nbs(att).find(([j]) => j !== from);
      if (!y) this.fail('Sauerstoff');
      const yc = y[0];
      if (this.el(yc) !== 'C') this.fail('O-' + this.el(yc) + '-Bindung');
      const cg = this.carbonGroup(yc);
      if (cg && (cg.type === 'ketone' || cg.type === 'aldehyde' || (cg.type === 'ester' && cg.x === att))) {
        const ac = this.acylName(yc, att);
        return S(this.paren(ac) + P.oxy, true, ac.t + P.oxy);
      }
      if (cg && cg.type !== 'nitrile') this.fail('Kohlensäure-Derivat');
      const r = this.subName(yc, att, 1);
      const base = r.t;
      // Kurzformen
      for (const [k, v] of Object.entries(V.alkoxy)) if (base === this.alkylPlain(+k)) return S(v);
      if (base === P.phenyl) return S(V.phenoxy);
      if (base === P.tbutyl) return S(V.tbutoxy);
      return S(this.paren(r) + P.oxy, true, r.t + P.oxy);
    }
    if (e === 'N') {
      const nb = this.nbs(att).filter(([j]) => j !== from);
      if (this.q(att) === 1) {
        const oo = nb.filter(([j]) => this.el(j) === 'O');
        if (oo.length === 2 && oo.some(([j, b]) => b === 2) && oo.some(([j]) => this.q(j) === -1)) return S(P.nitro);
        if (nb.every(([j, b]) => b === 1 && this.el(j) === 'C')) {
          if (!nb.length) return S(P.azaniumyl);
          const rs = nb.map(([j]) => this.subName(j, att, 1));
          return this.multiSub(rs, P.azaniumyl);
        }
        this.fail('Kation am Stickstoff');
      }
      if (nb.some(([, b]) => b === 2)) {
        const [x] = nb.find(([, b]) => b === 2);
        if (this.el(x) !== 'C') this.fail('N=' + this.el(x));
        const r = this.chainSub(x, att, 2);
        return S(this.paren(r) + P.amino, true, r.t + P.amino);
      }
      if (nb.some(([, b]) => b !== 1)) this.fail('Stickstoff-Mehrfachbindung');
      if (!nb.length) return S(P.amino);
      // Acylamino
      const acyl = nb.filter(([j]) => this.el(j) === 'C' && this.carbonylO(j) >= 0);
      if (acyl.length === 1 && nb.length === 1) {
        const ac = this.acylName(acyl[0][0], att);
        if (ac.t === P.acetyl) return S(P.acetamido);
        if (ac.t === P.benzoyl) return S(P.benzamido);
        return S(this.paren(ac) + P.amino, true, ac.t + P.amino);
      }
      if (acyl.length) this.fail('Imid');
      const rs = nb.map(([j]) => {
        if (this.el(j) !== 'C') this.fail('N-' + this.el(j));
        return this.subName(j, att, 1);
      });
      if (rs.length === 1 && rs[0].t === P.phenyl) return S(P.anilino);
      if (rs.length === 1 && rs[0].ph) return S(rs[0].ph.replace(new RegExp(P.phenyl + '$'), P.anilino), true);
      return this.multiSub(rs, P.amino);
    }
    if (e === 'S') {
      const nb = this.nbs(att).filter(([j]) => j !== from);
      if (!nb.length && this.H(att) >= 1) return S(P.sulfanyl);
      const dO = nb.filter(([j, b]) => b === 2 && this.el(j) === 'O');
      const oh = nb.filter(([j, b]) => b === 1 && this.el(j) === 'O' && this.H(j) >= 1);
      if (dO.length === 2 && oh.length === 1 && nb.length === 3) return S(P.sulfo);
      if (nb.length === 1 && nb[0][1] === 1 && this.el(nb[0][0]) === 'C') {
        const r = this.subName(nb[0][0], att, 1);
        return S(this.paren(r) + P.sulfanyl, true, r.t + P.sulfanyl);
      }
      this.fail('Schwefelgruppe');
    }
    if (e !== 'C') this.fail('Substituent mit ' + e);
    // Kohlenstoff-Substituenten
    const cg = this.carbonGroup(att);
    if (cg) {
      if (cg.type === 'nitrile') return S(P.cyano);
      if (cg.type === 'acid') return S(P.carboxy);
      if (cg.type === 'carboxylate') return S(P.carboxylato);
      if (cg.type === 'aldehyde' && this.nbs(att).filter(([j]) => this.el(j) === 'C').length === 1) return S(P.formyl);
      if (cg.type === 'ester') {
        const r = this.subName(cg.rp, cg.x, 1);
        const ox = this.alkoxyName(r);
        return S(ox + P.carbonyl, true, ox + P.carbonyl);
      }
      if (cg.type === 'amide') {
        if (!cg.ns.length) return S(P.carbamoyl);
        const rs = cg.ns.map(j => this.subName(j, cg.x, 1));
        const r = this.multiSub(rs, P.carbamoyl);
        return r;
      }
      if (cg.type === 'acylhalide') return S(V.halo[cg.hal] + P.carbonyl, true);
      if (cg.type === 'ketone') { const ac = this.acylName(att, from); return ac; }
    }
    if (this.ringOf.has(att)) return this.ringSub(att, from);
    return this.chainSub(att, from, 1);
  }
  alkylPlain(n) { return this.V.stem[n] + this.V.yl; }
  alkoxyName(r) {
    const V = this.V;
    for (const [k, v] of Object.entries(V.alkoxy)) if (r.t === this.alkylPlain(+k)) return v;
    if (r.t === V.p.phenyl) return V.phenoxy;
    if (r.t === V.p.tbutyl) return V.tbutoxy;
    return this.paren(r) + V.p.oxy;
  }
  paren(r) { return r.cx ? '\u0001' + r.t + '\u0002' : r.t; }
  /* mehrere Reste an einem Atom (N oder Azanium): „dimethylamino“, „ethyl(methyl)amino“ */
  multiSub(rs, tail) {
    const groups = new Map();
    for (const r of rs) { if (!groups.has(r.t)) groups.set(r.t, { r, n: 0 }); groups.get(r.t).n++; }
    const list = [...groups.values()].sort((a, b) => this.alphaCmp(a.r.key, b.r.key));
    let t = '';
    list.forEach((g, k) => {
      const mul = g.n > 1 ? (g.r.cx ? CHEM_MULTX[g.n] : CHEM_MULT[g.n]) : '';
      const body = g.r.cx || (k > 0 && list.length > 1) ? '\u0001' + g.r.t + '\u0002' : g.r.t;
      t += mul + (g.n > 1 && g.r.cx ? '\u0001' + g.r.t + '\u0002' : body);
    });
    return { t: t + tail, cx: true, key: this.keyOf(t + tail) };
  }
  /* Acylrest ab Carbonyl-C att (an from): acetyl, propanoyl, benzoyl … */
  acylName(att, from) {
    const V = this.V, P = V.p;
    const oO = this.carbonylO(att);
    const cs = this.nbs(att).filter(([j]) => j !== oO && j !== from && this.el(j) === 'C');
    const het = this.nbs(att).filter(([j]) => j !== oO && j !== from && this.el(j) !== 'C');
    if (het.length) this.fail('Acylgruppe');
    if (!cs.length) return { t: P.formyl, cx: false, key: P.formyl };
    const c1 = cs[0][0];
    if (this.ringOf.has(c1)) {
      const r = this.ringSub(c1, att, 'carbonyl');
      if (r.t === P.benzoyl) return { t: P.benzoyl, cx: false, key: P.benzoyl };
      return { t: r.t, cx: true, key: r.key };
    }
    // Kette ab att (att = C1)
    const r = this.chainSub(att, from, 1, { acyl: true });
    if (r.t === V.stem[2] + V.an.replace(/e$/, '') + P.oyl) return { t: P.acetyl, cx: false, key: P.acetyl };
    return r;
  }

  /* Ringsubstituent: Phenyl, Cyclohexyl … (att = Position 1) */
  ringSub(att, from, fvSuf) {
    const V = this.V, P = V.p;
    const sy = this.sysOf.get(att);
    const info = sy && this.ringInfo(sy);
    if (!info) this.fail('Ringsystem ohne bekannten Namen – nur Trivialname');
    if (info.kind === 'tpl') return this.tplSub(info, att, from, fvSuf);
    const r = info.ring;
    if (fvSuf === 'carbonyl') {
      if (info.benz && !this.nbs(att).some(([j]) => j !== from && !r.includes(j)) && r.every(a => a === att || this.nbs(a).every(([j]) => r.includes(j)))) return { t: P.benzoyl, cx: false, key: P.benzoyl };
    }
    const benz = this.isBenzene(r);
    const n = r.length;
    const i0 = r.indexOf(att);
    let best = null;
    for (const d of [1, -1]) {
      const order = []; for (let k = 0; k < n; k++) order.push(r[((i0 + d * k) % n + n) % n]);
      const loc = new Map(order.map((a, k) => [a, k + 1]));
      const set = new Set(order);
      const ml = [], dl = [];
      if (!benz) for (let k = 0; k < n; k++) { const a = order[k], b = order[(k + 1) % n]; const o = this.order(a, b); if (o >= 2) { const l = k + 1 === n ? n : k + 1; ml.push(l); if (o === 2) dl.push(l); } }
      const pre = [];
      for (const a of order) for (const [j, o] of this.nbs(a)) { if (set.has(j) || (a === att && j === from)) continue; pre.push({ at: a, att: j, o }); }
      const key = [[1], ml.sort((x, y) => x - y), dl.sort((x, y) => x - y), pre.map(p => loc.get(p.at)).sort((x, y) => x - y)];
      const cand = { order, loc, key, pre, ml, dl };
      if (!best || this.cmpKeys(key, best.key) < 0) best = cand;
      else if (this.cmpKeys(key, best.key) === 0 && pre.length) {
        const k1 = this.alphaLocs(cand), k2 = this.alphaLocs(best);
        if (this.cmpArr(k1, k2) < 0) best = cand;
      }
    }
    let core;
    if (fvSuf === 'carbonyl') {
      // Ring-carbonyl: cyclohexancarbonyl, benzoyl (substituiert: 4-chlorbenzoyl)
      if (benz) core = P.benzoyl;
      else {
        const un = this.unsat(n, best.ml, best.dl, true, true);
        core = V.cyclo + V.stem[n] + (un.any ? un.mid + '-1-' : V.an) + P.carbonyl;
        if (this.lang === 'en') core = core.replace(/ane(?=carbonyl)/, 'ane');
      }
    } else if (fvSuf === 'ylidene') {
      const un = this.unsat(n, best.ml, best.dl, true, true);
      core = V.cyclo + V.stem[n] + (un.any ? un.mid + '-1-' : '') + V.ylidene;
      if (this.lang === 'en' && un.any) core = core.replace(/ene-1-/, 'en-1-');
    } else if (benz) core = P.phenyl;
    else {
      const un = this.unsat(n, best.ml, best.dl, true, true);
      core = V.cyclo + this.V.stem[n] + un.mid + (un.any ? '-1-' + V.yl : V.yl);
      if (this.lang === 'en' && un.any) core = core.replace(/ene-1-yl$/, 'en-1-yl').replace(/yne-1-yl$/, 'yn-1-yl');
      if (!un.any) core = V.cyclo + V.stem[n] + V.yl;
    }
    const stereo = this.stereoTxt(best.loc, best.order, true);
    const preTxt = this.prefixText(best.pre, best.loc, false);
    const t = (stereo ? stereo + '-' : '') + preTxt + core;
    const cx = !!(preTxt || stereo || /\d/.test(core));
    const res = { t, cx, key: this.keyOf(t) };
    if (benz && preTxt) res.ph = t;
    return res;
  }
  /* Substituent aus einem Ringsystem: pyridin-3-yl, 1H-inden-2-yl, naphthalen-1-yl, morpholin-4-yl … */
  tplSub(info, att, from, fvSuf) {
    const T = info.T, set = new Set(info.atoms);
    let best = null;
    for (const iso of info.isos) {
      const loc = new Map(iso.map((a, k) => [a, T.lab[k]]));
      const hy = this.hydro(T, iso, new Set());
      const pre = [];
      for (const a of iso) for (const [j, o] of this.nbs(a)) { if (set.has(j) || (a === att && j === from)) continue; pre.push({ at: a, att: j, o }); }
      const v = (arr) => arr.map(chemLabVal).sort((x, y) => x - y);
      const key = [v(hy.ind), [chemLabVal(loc.get(att))], v(hy.hydro), v(pre.map(p => loc.get(p.at)))];
      const cand = { iso, loc, hy, pre, key };
      if (!best || this.cmpKeys(key, best.key) < 0) best = cand;
      else if (this.cmpKeys(key, best.key) === 0 && pre.length && this.cmpArr(this.alphaLocs(cand), this.alphaLocs(best)) < 0) best = cand;
    }
    const fv = best.loc.get(att);
    let core = this.tplCore(T, best.hy);
    if (this.lang === 'en') core = core.replace(/e$/, '');
    core += '-' + fv + '-' + (fvSuf === 'carbonyl' ? this.V.p.carbonyl : fvSuf === 'ylidene' ? this.V.ylidene : this.V.yl);
    if (fvSuf === 'carbonyl' && this.lang === 'en') core = core.replace(/-(\d+[a-z]?)-carbonyl$/, '-$1-carbonyl');
    const stereo = this.stereoTxt(best.loc, best.iso, true);
    const preTxt = this.prefixText(best.pre, best.loc, false);
    const t = (stereo ? stereo + '-' : '') + preTxt + (preTxt && /^\d/.test(core) ? '-' : '') + core;
    return { t, cx: true, key: this.keyOf(t) };
  }
  alphaLocs(cand) {
    const named = cand.pre.map(p => ({ l: chemLabVal(cand.loc.get(p.at)), n: this.subName(p.att, p.at, p.o) }));
    named.sort((x, y) => this.alphaCmp(x.n.key, y.n.key) || x.l - y.l);
    return named.map(x => x.l);
  }

  /* Kettensubstituent ab att (freie Valenz der Ordnung ov) */
  chainSub(att, from, ov, opt = {}) {
    const V = this.V, P = V.p;
    // erreichbare acyclische C (ohne Carboxy-/Nitril-C)
    const pool = new Set();
    const st = [att];
    pool.add(att);
    const okC = (j) => this.el(j) === 'C' && !this.ringOf.has(j) && !(this.carbonGroup(j) && ['acid', 'carboxylate', 'nitrile', 'ester', 'amide', 'acylhalide'].includes(this.carbonGroup(j).type) && j !== att);
    while (st.length) {
      const v = st.pop();
      for (const [w] of this.nbs(v)) if (w !== from && !pool.has(w) && okC(w)) { pool.add(w); st.push(w); }
    }
    // Pfade, die att enthalten: zwei Arme
    const nb = (v) => this.nbs(v).filter(([w]) => pool.has(w)).map(([w]) => w);
    const arms = (start, prev) => {
      // alle Pfade ab start (ohne prev) bis zu einem Blatt
      const out = [];
      const rec = (v, p, path) => {
        const nx = nb(v).filter(w => w !== p);
        if (!nx.length) { out.push(path); return; }
        for (const w of nx) rec(w, v, path.concat(w));
        if (out.length > 400) return;
      };
      rec(start, prev, [start]);
      return out;
    };
    const first = nb(att);
    const armList = [[]];
    for (const w of first) for (const p of arms(w, att)) armList.push(p.map(x => x).concat([]).length ? [w, ...p.slice(1)] : [w]);
    // armList: Arme beginnend beim Nachbarn von att
    const cands = [];
    for (let i = 0; i < armList.length; i++) for (let j = i; j < armList.length; j++) {
      const a1 = armList[i], a2 = armList[j];
      if (a1.length && a2.length && a1[0] === a2[0]) continue;
      if (i === j && a1.length) continue;
      const path = [...a1.slice().reverse(), att, ...a2];
      cands.push(path);
    }
    if (opt.acyl) {
      // Acyl: att muss Kettenende sein
      for (let k = cands.length - 1; k >= 0; k--) if (cands[k][0] !== att && cands[k][cands[k].length - 1] !== att) cands.splice(k, 1);
    }
    let best = null;
    for (const path of cands) {
      const n = path.length;
      let mult = 0, dbl = 0;
      for (let k = 0; k + 1 < n; k++) { const o = this.order(path[k], path[k + 1]); if (o >= 2) mult++; if (o === 2) dbl++; }
      const set = new Set(path);
      for (const order of n > 1 ? [path, path.slice().reverse()] : [path]) {
        const loc = new Map(order.map((a, k) => [a, k + 1]));
        const fv = loc.get(att);
        const ml = [], dl = [];
        for (let k = 0; k + 1 < n; k++) { const o = this.order(order[k], order[k + 1]); if (o >= 2) { ml.push(k + 1); if (o === 2) dl.push(k + 1); } }
        const pre = [];
        for (const a of order) for (const [j, o] of this.nbs(a)) {
          if (set.has(j) || (a === att && j === from)) continue;
          if (opt.acyl && a === att && this.el(j) === 'O' && o === 2) continue;
          pre.push({ at: a, att: j, o });
        }
        const key = [[-n], [-mult], [-dbl], [fv], ml, dl, [-pre.length], pre.map(p => loc.get(p.at)).sort((x, y) => x - y)];
        const cand = { order, loc, key, pre, ml, dl, fv, n };
        if (!best || this.cmpKeys2(key, best.key) < 0) best = cand;
        else if (this.cmpKeys2(key, best.key) === 0 && pre.length) {
          if (this.cmpArr(this.alphaLocs(cand), this.alphaLocs(best)) < 0) best = cand;
        }
      }
    }
    const { order, loc, pre, ml, dl, fv, n } = best;
    // Spezialfälle
    const plain = !pre.length && !ml.length;
    if (!opt.acyl && ov === 1 && n === 3 && plain && fv === 2) { /* propan-2-yl */ }
    if (!opt.acyl && ov === 1 && plain && fv === 2 && n === 3 && this.nbs(att).filter(([j]) => pool.has(j)).length === 3) { /* tert-butyl erkannt unten */ }
    // tert-Butyl: C(CH3)3
    if (!opt.acyl && ov === 1) {
      const cn = this.nbs(att).filter(([j]) => j !== from);
      if (cn.length === 3 && cn.every(([j, o]) => o === 1 && this.el(j) === 'C' && this.nbs(j).length === 1)) return { t: P.tbutyl, cx: false, key: 'butyl' };
      // Benzyl: CH2-Phenyl
      if (n === 1 && pre.length === 1 && this.H(att) === 2 && pre[0].o === 1) {
        const r = this.subName(pre[0].att, att, 1);
        if (r.t === P.phenyl) return { t: P.benzyl, cx: false, key: P.benzyl };
      }
    }
    const un = this.unsat(n, ml, dl, false, n > 2 || fv !== 1);
    let core;
    if (opt.acyl) {
      // …anoyl
      const an = this.lang === 'en' ? (un.any ? un.mid.replace(/e$/, '') : 'an') : (un.any ? un.mid : 'an');
      core = V.stem[n] + (un.any ? an : 'an') + P.oyl;
      if (this.lang === 'en' && !un.any) core = V.stem[n] + 'anoyl';
      if (this.lang === 'de' && !un.any) core = V.stem[n] + 'anoyl';
      if (un.any) core = V.stem[n] + un.mid.replace(/e$/, '') + 'oyl';
    } else {
      const suf = ov === 1 ? V.yl : ov === 2 ? V.ylidene : (this.lang === 'en' ? 'ylidyne' : 'ylidin');
      if (fv === 1 && !un.any) core = V.stem[n] + suf;
      else if (n === 2 && un.any && fv === 1) core = V.stem[n] + (ml.length && this.order(order[0], order[1]) === 3 ? V.yn : V.en).replace(/e$/, '') + suf;
      else {
        let mid = un.any ? un.mid : (this.lang === 'en' ? 'an' : 'an');
        if (this.lang === 'en') mid = mid.replace(/e$/, '');
        core = V.stem[n] + (un.any ? '' : '') + mid + '-' + fv + '-' + suf;
        if (un.any && un.euph) core = V.stem[n] + 'a' + mid + '-' + fv + '-' + suf;
      }
    }
    const stereo = this.stereoTxt(loc, order, true);
    const preTxt = this.prefixText(pre, loc, n === 1);
    const t = (stereo ? stereo + '-' : '') + preTxt + core;
    const cx = !!(preTxt || stereo || /\d/.test(core));
    return { t, cx, key: this.keyOf(t) };
  }
  cmpKeys2(a, b) {
    for (let i = 0; i < Math.min(a.length, b.length); i++) {
      const x = a[i], y = b[i];
      for (let k = 0; k < Math.min(x.length, y.length); k++) if (x[k] !== y[k]) return x[k] - y[k];
    }
    return 0;
  }
  /* Mehrfachbindungen: "-2-en", "a-1,3-dien", "-1-en-4-in" (mid ohne Stamm) */
  unsat(n, ml, dl, ring, withLoc) {
    const V = this.V;
    const tri = ml.slice();
    for (const d of dl) { const i = tri.indexOf(d); if (i >= 0) tri.splice(i, 1); }
    if (!ml.length) return { any: false, mid: V.an, euph: false };
    const loc = (arr) => withLoc ? '-' + arr.join(',') + '-' : '';
    let mid = '';
    const euph = dl.length > 1 || tri.length > 1;
    if (dl.length) mid += loc(dl) + CHEM_MULT[dl.length] + V.en;
    if (tri.length) {
      if (dl.length && this.lang === 'en') mid = mid.replace(/e$/, '');
      mid += loc(tri) + CHEM_MULT[tri.length] + V.yn;
    }
    return { any: true, mid, euph };
  }

  /* Präfixe gruppieren, alphabetisch: "2,3-dimethyl-4-ethyl" usw. */
  prefixText(pre, loc, noLoc, locOf) {
    const items = pre.map(p => ({ l: locOf ? locOf(p) : loc.get(p.at), r: this.subName(p.att, p.at, p.o) }));
    return this.prefixJoin(items, noLoc);
  }
  prefixJoin(items, noLoc) {
    const groups = new Map();
    for (const it of items) {
      const k = it.r.t;
      if (!groups.has(k)) groups.set(k, { r: it.r, ls: [] });
      groups.get(k).ls.push(it.l);
    }
    const list = [...groups.values()].sort((a, b) => this.alphaCmp(a.r.key, b.r.key));
    let out = '';
    list.forEach((g, k) => {
      g.ls.sort((x, y) => (x === 'N' ? -1 : chemLabVal(x)) - (y === 'N' ? -1 : chemLabVal(y)));
      const m = g.ls.length;
      const mul = m > 1 ? (g.r.cx ? CHEM_MULTX[m] || m + '×' : CHEM_MULT[m] || m + '×') : '';
      const body = g.r.cx ? '\u0001' + g.r.t + '\u0002' : g.r.t;
      const locs = noLoc ? '' : g.ls.join(',') + '-';
      if (k > 0 && locs) out += '-';
      out += locs + mul + body;
    });
    return out;
  }

  /* Stereodeskriptoren für Stammsystem bzw. Substituent: "(2R,3S)" */
  stereoTxt(loc, order, inner) {
    const items = [];
    for (const a of order) {
      const r = this.rs.get(a);
      if (r) items.push({ l: chemLabVal(loc.get(a)), t: loc.get(a) + r });
    }
    for (let k = 0; k + 1 < order.length; k++) {
      const a = order[k], b = order[k + 1];
      const e = this.ez.get(Math.min(a, b) + ',' + Math.max(a, b));
      if (e) { const la = loc.get(a), lb = loc.get(b); const l = chemLabVal(la) < chemLabVal(lb) ? la : lb; items.push({ l: chemLabVal(l), t: l + e }); }
    }
    if (!items.length) return '';
    items.sort((x, y) => x.l - y.l);
    return '(' + items.map(x => x.t).join(',') + ')';
  }

  /* ---------------------------------------------------------- Name zusammensetzen */
  assemble(c, num, principal, ptype) {
    const V = this.V, lang = this.lang;
    const { order, loc, pre, nsub } = num;
    const n = order.length;
    const pls = c.pg.map(p => loc.get(p.at)).sort((x, y) => chemLabVal(x) - chemLabVal(y));
    const np = c.pg.length;
    const ml = [], dl = [];
    if (!c.benz && !c.tpl) for (const [a, b] of this.parentBonds({ atoms: order, ring: c.ring })) {
      const o = this.order(a, b);
      if (o < 2) continue;
      const la = loc.get(a), lb = loc.get(b);
      const l = (c.ring && Math.abs(la - lb) === n - 1) ? n : Math.min(la, lb);
      ml.push(l); if (o === 2) dl.push(l);
    }
    ml.sort((x, y) => x - y); dl.sort((x, y) => x - y);
    // N-Präfixe
    const nItems = nsub.map(s => ({ l: 'N', r: this.subName(s.att, s.from, 1) }));
    const preItems = pre.map(p => ({ l: loc.get(p.at), r: this.subName(p.att, p.at, p.o) }));
    const totalSubs = preItems.length + np;
    // Lokanten weglassen? (Methan; Ethan/Ethen/Ethin mit nur einem Substituenten; symmetrischer Ring mit einem)
    const symRing = c.ring && (c.benz || !ml.length);
    let omit = !c.tpl && ((!c.ring && n === 1) || (!c.ring && n === 2 && totalSubs <= 1) || (symRing && totalSubs <= 1));
    // vollständig substituiert mit nur einer Präfixart (Tetrachlorethen, Hexachlorbenzol)
    if (!np && !nItems.length && preItems.length > 1 && new Set(preItems.map(p => p.r.t)).size === 1 && order.every(a => this.H(a) === 0)
      && (c.benz || !c.ring || !ml.length) && !c.tpl) omit = true;
    // Benzol mit Trivialstamm (Phenol, Benzoesäure …): Hauptgruppe = 1
    const benzRet = c.benz && np === 1 && V.benz[ptype] && !c.pg[0].inChain;
    const prefixOmit = omit && !benzRet ? true : (benzRet && preItems.length + nItems.length === 0);
    let preTxt = this.prefixJoin(preItems.concat(nItems), prefixOmit && !nItems.length);
    if (nItems.length && prefixOmit) preTxt = this.prefixJoin(preItems, true) + (preItems.length ? '-' : '') + this.prefixJoin(nItems, false).replace(/^-/, '');
    const stereo = this.stereoTxt(loc, order, false);
    // Stamm mit Mehrfachbindungen
    let core;
    const locUnsat = !(omit || (!c.ring && n === 2) || (c.ring && ml.length === 1 && totalSubs === 0));
    const un = this.unsat(n, ml, dl, c.ring, locUnsat);
    if (c.tpl) core = this.tplCore(c.tpl.T, num.hy);
    else if (c.benz) core = V.benzene;
    else {
      core = (c.ring ? V.cyclo : '') + V.stem[n] + (un.any && un.euph ? 'a' : '') + un.mid;
    }
    // Endung
    let suffix = '', esterPre = '';
    if (ptype) {
      const sv = V.suf[ptype];
      const term = CHEM_TERMINAL[ptype];
      const inChain = c.pg.length && c.pg[0].inChain;
      let s = term ? (inChain ? sv[0] : sv[1]) : sv[0];
      if (ptype === 'acylhalide') {
        const hal = c.pg[0].g.hal;
        if (inChain) s = sv[0];
        s = s + V.halideJoin + V.halide[hal];
        if (lang === 'de') s = s.replace(' ', '');
      }
      const mul = np > 1 ? CHEM_MULT[np] : '';
      let mulS = mul;
      if (mul && /^[ao]/.test(s) && lang === 'de' && /a$/.test(mul) && !/^a/.test(s)) mulS = mul.slice(0, -1);
      if (mul && /^o/.test(s) && /a$/.test(mul)) mulS = mul.slice(0, -1);
      let locs = (term && inChain) || omit || (benzRet) ? '' : '-' + pls.join(',') + '-';
      if (c.tpl && num.hy.added.length) locs = '-' + pls.join(',') + '(' + num.hy.added.slice().sort((x, y) => chemLabVal(x) - chemLabVal(y)).map(l => l + 'H').join(',') + ')-';
      if (benzRet) {
        core = V.benz[ptype];
        suffix = '';
        if (ptype === 'acylhalide') core = V.benz.acylhalide + V.halideJoin + V.halide[c.pg[0].g.hal];
      } else {
        suffix = (locs || '') + mulS + s;
      }
      if (ptype === 'ester') {
        // Alkylreste der Estergruppen
        const rs = c.pg.map(p => this.subName(p.g.rp, p.g.x, 1));
        const groups = new Map();
        for (const r of rs) { if (!groups.has(r.t)) groups.set(r.t, { r, n: 0 }); groups.get(r.t).n++; }
        const list = [...groups.values()].sort((a, b) => this.alphaCmp(a.r.key, b.r.key));
        esterPre = list.map(g => (g.n > 1 ? CHEM_MULT[g.n] + (g.r.cx ? '\u0001' + g.r.t + '\u0002' : g.r.t) : g.r.t)).join(lang === 'de' ? '' : ' ');
      }
    }
    // Englisch: Endungs-e von ane/ene/yne vor Vokal
    let body;
    if (lang === 'en' && suffix) {
      const first = suffix.replace(/^-[\d,a-zH()']+-/, '').replace(/^[-\d,]+/, '').charAt(0);
      body = /[aeiouy]/.test(first) ? core.replace(/e$/, '') + suffix : core + suffix;
      if (suffix.startsWith('-') && /[aeiouy]/.test(first)) body = core.replace(/e$/, '') + suffix;
    } else body = core + suffix;
    if (lang === 'de' && suffix && !suffix.startsWith('-') && /^[aeiou]/.test(suffix) && /[aeiou]$/.test(core)) body = core + suffix;
    let name = (stereo ? stereo + '-' : '') + preTxt + (preTxt && /^\d/.test(body) ? '-' : '') + body;
    if (esterPre) {
      const ep = this.brackets(esterPre);
      name = lang === 'de' ? ep + (/^[\d(]/.test(preTxt + body) || stereo ? '-' : '') + name : ep + ' ' + name;
    }
    name = this.brackets(name);
    return { name };
  }
  /* Klammern verschachteln: innen (), dann [], dann {} */
  brackets(s) {
    const out = [];
    const stack = [];
    for (const ch of s) {
      if (ch === '(' ) { stack.push({ lit: true, depth: 0 }); out.push(ch); continue; }
      if (ch === ')' ) {
        const top = stack.pop();
        if (stack.length && top) stack[stack.length - 1].depth = Math.max(stack[stack.length - 1].depth, top.depth + 1);
        out.push(ch);
        continue;
      }
      if (ch === '\u0001') { stack.push({ start: out.length, depth: 0 }); out.push(null); continue; }
      if (ch === '\u0002') {
        const top = stack.pop();
        const d = top.depth;
        const pairs = [['(', ')'], ['[', ']'], ['{', '}']];
        const [o, c] = pairs[d % 3];
        out[top.start] = o;
        out.push(c);
        if (stack.length) stack[stack.length - 1].depth = Math.max(stack[stack.length - 1].depth, d + 1);
        continue;
      }
      out.push(ch);
    }
    // bereits gesetzte Klammern (Stereodeskriptoren) zählen nicht
    return out.join('');
  }
}
