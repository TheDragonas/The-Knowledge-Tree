'use strict';
/* Chem-Draw: Syntheseplanung (1.56) – eigene Reaktionsregeln (offline), keine Literaturdatenbank.
 *
 * Moleküle im Format der Zeichnung ({atoms:[{id, el, q, x, y}], bonds:[{id, a, b, o}]}, H implizit). Jede Regel ist
 * eine Retro-Transformation: find(ctx) sucht im Produkt die passende Stelle, apply(ctx, Treffer) liefert die Edukte
 * (als Moleküle), Reagenzien mit Äquivalenten, Bedingungen und Hinweise. Bewertung, Suche (Strahl), Weg vom Edukt
 * zum Produkt und Mengenrechnung stehen weiter unten. Ohne DOM – in Node testbar (tests/chem/synthese-test.js).
 *
 * Kennzeichnung (flags): metal = Metall-Katalysator (Pd, Cu, Os …) · extreme = unter −20 °C, über 150 °C oder Druck
 * · toxic = sehr giftig (NaCN, Cr(VI) …) · pyro = pyrophor bzw. heftig mit Wasser (LiAlH₄, NaH, n-BuLi).
 * „empfohlen“ = keines davon (Wunsch: Katalysatoren vorschlagen, aber nicht empfehlen; Ansatz bis 10 mol). */

// Reagenzien: Formel (SMILES) für die molare Masse, Dichte (g/mL) für Flüssigkeiten
const RXN_REAG = {
  'SOCl₂': { smi: 'O=S(Cl)Cl', d: 1.64 }, '(COCl)₂': { smi: 'O=C(Cl)C(=O)Cl', d: 1.48 }, 'DMF (kat.)': { smi: 'CN(C)C=O', d: 0.944 },
  'NEt₃': { smi: 'CCN(CC)CC', d: 0.726 }, 'DIPEA': { smi: 'CCN(C(C)C)C(C)C', d: 0.742 }, 'Pyridin': { smi: 'c1ccncc1', d: 0.982 },
  'DMAP': { smi: 'CN(C)c1ccncc1' }, 'DCC': { smi: 'C1CCC(CC1)N=C=NC1CCCCC1' }, 'EDC·HCl': { smi: 'CCN=C=NCCCN(C)C.Cl' }, 'HOBt': { smi: 'On1nnc2ccccc21' },
  'HATU': { smi: 'CN(C)C(=[N+](C)C)On1nnc2cccnc21.F[P-](F)(F)(F)(F)F' }, 'H₂SO₄ (konz.)': { smi: 'OS(=O)(=O)O', d: 1.84 }, 'TsOH·H₂O': { smi: 'Cc1ccc(cc1)S(=O)(=O)O.O' },
  'NaBH₄': { smi: '[Na+].[BH4-]' }, 'LiAlH₄': { smi: '[Li+].[AlH4-]' }, 'NaBH(OAc)₃': { smi: '[Na+].CC(=O)O[BH-](OC(C)=O)OC(C)=O' }, 'AcOH': { smi: 'CC(=O)O', d: 1.049 },
  'DMP': { smi: 'CC(=O)OI1(OC(C)=O)(OC(C)=O)OC(=O)c2ccccc12' }, 'PCC': { smi: '[O-][Cr](=O)(=O)Cl.c1cc[nH+]cc1' }, '(COCl)₂ / DMSO': { smi: 'O=C(Cl)C(=O)Cl', d: 1.48 },
  'NaH (60 % in Öl)': { smi: '[Na+].[H-]', f: 0.6 }, 'K₂CO₃': { smi: '[K+].[K+].[O-]C([O-])=O' }, 'Cs₂CO₃': { smi: '[Cs+].[Cs+].[O-]C([O-])=O' }, 'KOtBu': { smi: '[K+].CC(C)(C)[O-]' },
  'PBr₃': { smi: 'BrP(Br)Br', d: 2.85 }, 'Ac₂O': { smi: 'CC(=O)OC(C)=O', d: 1.08 }, 'Boc₂O': { smi: 'CC(C)(C)OC(=O)OC(=O)OC(C)(C)C' }, 'Fmoc-OSu': { smi: 'O=C(OCC1c2ccccc2-c2ccccc21)ON1C(=O)CCC1=O' },
  'Cbz-Cl': { smi: 'ClC(=O)OCc1ccccc1', d: 1.195 }, 'mCPBA (≈ 75 %)': { smi: 'OOC(=O)c1cccc(Cl)c1', f: 0.75 }, 'PPh₃': { smi: 'c1ccc(cc1)P(c1ccccc1)c1ccccc1' },
  'Mg (Späne)': { smi: '[Mg]' }, 'CO₂ (Trockeneis)': { smi: 'O=C=O' }, 'LiOH·H₂O': { smi: '[Li+].[OH-].O' }, 'NaOH': { smi: '[Na+].[OH-]' }, 'HCl (konz.)': { smi: 'Cl', d: 1.18, f: 0.37 },
  'HNO₃ (65 %)': { smi: 'O[N+](=O)[O-]', d: 1.39, f: 0.65 }, 'Br₂': { smi: 'BrBr', d: 3.10 }, 'FeBr₃': { smi: 'Br[Fe](Br)Br' }, 'NBS': { smi: 'O=C1CCC(=O)N1Br' }, 'NCS': { smi: 'O=C1CCC(=O)N1Cl' },
  'AlCl₃': { smi: 'Cl[Al](Cl)Cl' }, 'NaCN': { smi: '[Na+].[C-]#N' }, 'NaClO₂': { smi: '[Na+].[O-]Cl=O' }, 'NaH₂PO₄': { smi: '[Na+].OP(O)([O-])=O' }, '2-Methyl-2-buten': { smi: 'CC=C(C)C', d: 0.662 },
  'TEMPO (kat.)': { smi: 'CC1(C)CCCC(C)(C)N1[O]' }, 'NaOCl (Bleichlauge)': { smi: '[Na+].[O-]Cl' }, 'KMnO₄': { smi: '[K+].[O-][Mn](=O)(=O)=O' }, 'CrO₃ / H₂SO₄ (Jones)': { smi: 'O=[Cr](=O)=O' },
  'Triethylphosphonoacetat': { smi: 'CCOC(=O)CP(=O)(OCC)OCC', d: 1.13 }, 'MgSO₄': { smi: '[Mg+2].[O-]S([O-])(=O)=O' }, 'Ethylenglykol': { smi: 'OCCO', d: 1.11 },
  'Fe (Pulver)': { smi: '[Fe]' }, 'NH₄Cl': { smi: '[NH4+].[Cl-]' }, 'SnCl₂·2 H₂O': { smi: 'Cl[Sn]Cl.O.O' }, 'Pd/C (10 %)': { smi: '[Pd]' }, 'H₂ (Ballon)': { smi: '[H][H]' },
  'Pd(PPh₃)₄': { smi: '[Pd]' }, 'Pd(OAc)₂': { smi: 'CC(=O)O[Pd]OC(C)=O' }, 'CuI': { smi: '[Cu]I' }, 'Kaliumphthalimid': { smi: '[K+].O=C1[N-]C(=O)c2ccccc12' }, 'N₂H₄·H₂O': { smi: 'NN.O', d: 1.03 },
  'MeI': { smi: 'CI', d: 2.28 }, 'H₃PO₄ (85 %)': { smi: 'OP(O)(O)=O', d: 1.69, f: 0.85 }, 'OsO₄ (kat.)': { smi: 'O=[Os](=O)(=O)=O' }, 'NMO': { smi: 'C[N+]1([O-])CCOCC1' },
  'K₃PO₄': { smi: '[K+].[K+].[K+].[O-]P([O-])([O-])=O' }, 'Imidazol': { smi: 'c1cnc[nH]1' }, 'HBr (48 %)': { smi: 'Br', d: 1.49, f: 0.48 }, 'SO₃·Pyridin': { smi: 'O=S(=O)=O.c1ccncc1' },
};

/* Toxikologie und Ökologie (1.57): grobe Einstufung 0 (unbedenklich) … 3 (sehr bedenklich) nach den GHS-Angaben der
 * Sicherheitsdatenblätter (H-Sätze) – tox = Gesundheit (giftig, ätzend, sensibilisierend, CMR), eco = Umwelt/Abfall
 * (Wassergefährdung, Schwermetalle, schlechte Atomökonomie). Nur zum Vergleichen von Wegen, keine Sicherheitsbewertung. */
const RXN_HAZ = {
  'SOCl₂': [2, 1, 'ätzend, giftige Gase (SO₂, HCl)'], '(COCl)₂': [2.5, 1, 'giftig, CO-Entwicklung'], 'DMF (kat.)': [0.5, 0.3, ''], 'NEt₃': [1.2, 0.8, 'entzündlich, ätzend'],
  'DIPEA': [1.2, 0.8, 'entzündlich, ätzend'], 'Pyridin': [1.6, 1, 'gesundheitsschädlich, entzündlich'], 'DMAP': [2.5, 1, 'sehr giftig bei Hautkontakt'],
  'DCC': [2.5, 1.2, 'giftig, stark sensibilisierend; Abfall DCU'], 'EDC·HCl': [1.5, 0.8, 'reizend, sensibilisierend'], 'HOBt': [2, 1, 'explosionsfähig (trocken)'],
  'HATU': [2, 1.5, 'sensibilisierend, teuer, schlechte Atomökonomie'], 'H₂SO₄ (konz.)': [1, 0.3, 'ätzend'], 'TsOH·H₂O': [0.8, 0.3, 'reizend'],
  'NaBH₄': [1.5, 0.5, 'giftig, H₂ mit Wasser'], 'LiAlH₄': [2.5, 0.8, 'pyrophor, heftig mit Wasser'], 'NaBH(OAc)₃': [1, 0.5, ''], 'AcOH': [0.8, 0.2, 'ätzend'],
  'DMP': [1.5, 1.2, 'oxidierend, Iod-Abfall'], 'PCC': [3, 3, 'Chrom(VI): krebserzeugend, Schwermetall'], '(COCl)₂ / DMSO': [2.5, 1, 'giftig, −78 °C'],
  'NaH (60 % in Öl)': [2, 0.5, 'H₂ mit Wasser, selbstentzündlich'], 'K₂CO₃': [0.4, 0.1, ''], 'Cs₂CO₃': [1, 0.5, ''], 'KOtBu': [1.5, 0.3, 'ätzend, selbsterhitzend'],
  'PBr₃': [2, 1, 'ätzend, heftig mit Wasser'], 'Ac₂O': [1.2, 0.3, 'ätzend, entzündlich'], 'Boc₂O': [2, 0.5, 'giftig beim Einatmen'], 'Fmoc-OSu': [1, 1, ''],
  'Cbz-Cl': [2, 1, 'ätzend, krebsverdächtig'], 'mCPBA (≈ 75 %)': [1.5, 1, 'oxidierend, reizend'], 'PPh₃': [1, 1.5, 'sensibilisierend; Abfall Ph₃PO'],
  'Mg (Späne)': [0.5, 0.2, 'entzündlich'], 'CO₂ (Trockeneis)': [0.2, 0, 'Kälte'], 'LiOH·H₂O': [1, 0.3, 'ätzend'], 'NaOH': [1, 0.2, 'ätzend'], 'HCl (konz.)': [1, 0.3, 'ätzend'],
  'HNO₃ (65 %)': [2, 1, 'stark ätzend, oxidierend'], 'Br₂': [3, 2.5, 'sehr giftig, ätzend, umweltgefährlich'], 'FeBr₃': [1, 0.5, 'ätzend'], 'NBS': [1.3, 1, 'reizend'], 'NCS': [1.3, 1, 'reizend'],
  'AlCl₃': [1.5, 1, 'ätzend, heftig mit Wasser; viel Al-Abfall'], 'NaCN': [3, 3, 'sehr giftig, Blausäure'], 'NaClO₂': [1.5, 1, 'oxidierend'], 'NaH₂PO₄': [0, 0, ''], '2-Methyl-2-buten': [1, 1, 'entzündlich'],
  'TEMPO (kat.)': [1, 0.5, ''], 'NaOCl (Bleichlauge)': [1, 1.2, 'ätzend, wassergefährdend'], 'KMnO₄': [1.5, 2.5, 'oxidierend, sehr wassergefährdend; MnO₂-Abfall'], 'CrO₃ / H₂SO₄ (Jones)': [3, 3, 'Chrom(VI): krebserzeugend'],
  'Triethylphosphonoacetat': [0.8, 1, 'Phosphat-Abfall'], 'MgSO₄': [0, 0, ''], 'Ethylenglykol': [1, 0.3, ''], 'Fe (Pulver)': [0.3, 0.3, ''], 'NH₄Cl': [0.3, 0.2, ''], 'SnCl₂·2 H₂O': [2, 2, 'ätzend, Zinn-Abfall'],
  'Pd/C (10 %)': [1, 1.5, 'Edelmetall, pyrophor feucht'], 'H₂ (Ballon)': [1.5, 0, 'hochentzündlich'], 'Pd(PPh₃)₄': [1.5, 2, 'Schwermetall-Katalysator'], 'Pd(OAc)₂': [1.5, 2, 'Schwermetall-Katalysator'],
  'CuI': [1, 2.5, 'sehr wassergefährdend'], 'Kaliumphthalimid': [0.5, 0.8, 'Abfall Phthalhydrazid'], 'N₂H₄·H₂O': [3, 2.5, 'giftig, krebserzeugend'], 'MeI': [2.5, 1, 'giftig, krebsverdächtig'],
  'H₃PO₄ (85 %)': [1, 0.3, 'ätzend'], 'OsO₄ (kat.)': [3, 3, 'sehr giftig, flüchtig'], 'NMO': [1, 0.3, ''], 'K₃PO₄': [0.5, 0.1, ''], 'Imidazol': [1.5, 0.5, 'reproduktionstoxisch'],
  'HBr (48 %)': [1.5, 0.5, 'ätzend'], 'SO₃·Pyridin': [1.5, 0.8, ''], 'B(OH)₃ (kat.)': [1, 0.3, 'reproduktionstoxisch (gering, kat.)'], 'Dimethylcarbonat': [0.5, 0.2, 'grünes Methylierungsmittel'],
  'Diethylmalonat': [0.3, 0.2, ''], 'Ethylacetoacetat': [0.3, 0.2, ''], 'NaOEt': [1.5, 0.3, 'ätzend, feuchtigkeitsempfindlich'], 'Piperidin (kat.)': [1.5, 0.5, 'giftig, entzündlich'],
  'Epichlorhydrin': [3, 1, 'giftig, krebserzeugend'], 'NaOMe (kat.)': [1.5, 0.3, 'ätzend'], 'AIBN (kat.)': [1.5, 0.8, 'selbstzersetzlich'], 'ClSO₃H': [2.5, 1, 'stark ätzend, heftig mit Wasser'],
  'NH₂OH·HCl': [2, 1, 'gesundheitsschädlich, sensibilisierend'], 'NaOAc': [0, 0, ''],
};
// Lösungsmittel (CHEM21-Leitfaden: empfohlen / problematisch / gefährlich) → [tox, eco]
const RXN_SOLV = [
  [/Wasser|H₂O(?!₂)/, 0, 0], [/EtOH|Ethanol|Alkohol/, 0.2, 0.1], [/iPrOH|Isopropanol/, 0.3, 0.1], [/tBuOH/, 0.6, 0.2], [/EtOAc|Ethylacetat/, 0.4, 0.2], [/Aceton/, 0.5, 0.2],
  [/2-Me-THF/, 0.6, 0.3], [/MeOH|Methanol/, 1, 0.3], [/DMSO/, 0.4, 0.4], [/MeCN|Acetonitril/, 1, 0.5], [/THF/, 1.2, 0.6], [/Toluol/, 1.5, 1], [/Et₂O|Diethylether/, 1.5, 0.6],
  [/Dioxan/, 2, 1], [/DCM|Dichlormethan/, 2, 1.8], [/DCE|1,2-Dichlorethan/, 3, 2], [/DMF/, 2.5, 1], [/NMP/, 2.5, 1], [/Pyridin/, 1.6, 1], [/ohne (LM|Lösungsmittel)/, 0, 0],
];
const ChemRxn = {
  REAG: RXN_REAG,
  HAZ: RXN_HAZ,
  /* Gefahren einer Stufe: Reagenzien (gewichtet nach Äquivalenten, katalytisch gering) + Lösungsmittel (bei „oder“ die
   * günstigste Wahl, bei Gemischen „/“ das ungünstigste). green = e^(−0,15·Summe) ∈ (0, 1] – 1 = sehr grün. */
  hazard(opt) {
    let sum = 0;
    const why = [];
    for (const r of opt.reag || []) {
      const h = RXN_HAZ[r.n];
      if (!h) continue;
      const w = (r.eq || 0) < 0.2 ? 0.35 : Math.min(1.6, 0.6 + 0.4 * (r.eq || 1));
      sum += (h[0] + 0.6 * h[1]) * w;
      if (h[0] + h[1] >= 3 && h[2]) why.push(r.n + ': ' + h[2]);
    }
    const solv = String((opt.cond && opt.cond.solv) || '');
    const alts = solv.split(/\s+oder\s+|\s+bzw\.\s+/);
    const sv = (x) => { let worst = null; for (const [re, t, e] of RXN_SOLV) if (re.test(x)) { const v = t + 0.6 * e; if (worst == null || v > worst) worst = v; } return worst; };
    const vals = alts.map(sv).filter(v => v != null);
    if (vals.length) { const v = Math.min(...vals); sum += v; if (v >= 2) why.push('Lösungsmittel ' + alts[vals.indexOf(v)].trim() + ' (bedenklich)'); }
    const green = Math.exp(-0.15 * sum);
    return { sum, green, why, cls: green >= 0.72 ? 'grün' : green >= 0.5 ? 'mittel' : 'bedenklich' };
  },
  /* ---------------------------------------------------------------- Moleküle */
  // Kopie ohne explizite H-Atome und ohne Schema-Objekte; Ladungen bleiben
  clean(m) {
    const H = new Set(m.atoms.filter(a => a.el === 'H' && m.bonds.some(b => b.a === a.id || b.b === a.id)).map(a => a.id));
    const atoms = m.atoms.filter(a => !H.has(a.id)).map(a => ({ id: a.id, el: a.el, q: a.q || 0, x: a.x || 0, y: a.y || 0 }));
    const bonds = m.bonds.filter(b => !H.has(b.a) && !H.has(b.b)).map(b => ({ id: b.id, a: b.a, b: b.b, o: b.o, s: '' }));
    return { atoms, bonds, nid: Math.max(m.nid || 0, ...atoms.map(a => a.id), ...bonds.map(b => b.id)) + 1, objs: [] };
  },
  fromSmiles(smi, layout = false) { return this.clean(ChemSmiles.toMol(smi, { layout })); },
  smiles(m) { try { return ChemProps.smiles(m); } catch (e) { return ''; } },
  key(m) { try { return ChemMatch.key(m); } catch (e) { return this.smiles(m); } },
  heavy(m) { return m.atoms.filter(a => a.el !== 'H').length; },
  formula(m) { try { return ChemMol.analyze(m).hill.text; } catch (e) { return ''; } },
  mass(m) { try { return ChemMol.analyze(m).mass; } catch (e) { return 0; } },
  valid(m) { try { return !ChemMol.analyze(m).valErr.length; } catch (e) { return false; } },
  // Koordinaten fürs Zeichnen (über SMILES neu angeordnet)
  layout(m) { const s = this.smiles(m); try { return s ? ChemSmiles.toMol(s) : m; } catch (e) { return m; } },
  // Name: Vorlagen-Datenbank, sonst Namensgenerator, sonst Summenformel
  name(m) {
    try { const f = typeof ChemDB !== 'undefined' && ChemDB.find(m); if (f) return f.name; } catch (e) { /* */ }
    try { const r = typeof ChemName !== 'undefined' && ChemName.of(m, { lang: 'de' }); if (r && r.name && r.name.length < 60) return r.name; } catch (e) { /* */ }
    return this.formula(m);
  },
  inDB(m) { try { return !!(typeof ChemDB !== 'undefined' && ChemDB.find(m, { exact: true })); } catch (e) { return false; } },
  // zusammenhängende Teile → einzelne Moleküle
  split(m) {
    const adj = new Map(m.atoms.map(a => [a.id, []]));
    for (const b of m.bonds) { adj.get(b.a).push(b.b); adj.get(b.b).push(b.a); }
    const seen = new Set(), out = [];
    for (const a of m.atoms) {
      if (seen.has(a.id)) continue;
      const comp = new Set([a.id]), st = [a.id]; seen.add(a.id);
      while (st.length) { const v = st.pop(); for (const w of adj.get(v)) if (!seen.has(w)) { seen.add(w); comp.add(w); st.push(w); } }
      out.push({ atoms: m.atoms.filter(x => comp.has(x.id)), bonds: m.bonds.filter(b => comp.has(b.a)), nid: m.nid, objs: [] });
    }
    return out;
  },
  /* ---------------------------------------------------------------- Umgebung eines Produkts */
  ctx(m0) {
    const m = this.clean(m0);
    const G = ChemProps.graph(m), A = G.A;
    const id = A.map(a => a.src), ix = new Map(id.map((v, i) => [v, i]));
    const c = {
      m, G, A, id, ix,
      el: (i) => A[i].el, h: (i) => A[i].h, nb: (i) => A[i].nb.map(([j]) => j), bo: (i, j) => { const x = A[i].nb.find(([k]) => k === j); return x ? x[1] : 0; },
      arom: (i) => A[i].arom, ring: (i, j) => G.rings.some(r => { const p = r.indexOf(i), q = r.indexOf(j); return p >= 0 && q >= 0 && (Math.abs(p - q) === 1 || Math.abs(p - q) === r.length - 1); }),
      inRing: (i) => G.rings.some(r => r.includes(i)),
      carbonyl: (i) => carbonylAt(A, i),
      dblO: (i) => { const x = A[i].nb.find(([j, o]) => o === 2 && A[j].el === 'O'); return x ? x[0] : -1; },
      sp3: (i) => A[i].el === 'C' && !A[i].arom && A[i].nb.every(([, o]) => o === 1),
      cDeg: (i) => A[i].nb.filter(([j]) => A[j].el === 'C').length,
    };
    /* Bearbeiten: Kopie, Änderungen über Graph-Indizes (neue Atome bekommen neue Nummern) → Edukte (Teile) */
    c.edit = (fn) => {
      const x = JSON.parse(JSON.stringify(m));
      const bondOf = (a, b) => x.bonds.find(q => (q.a === a && q.b === b) || (q.a === b && q.b === a));
      const ed = {
        del: (i, j) => { const b = bondOf(id[i], id[j]); if (b) x.bonds = x.bonds.filter(q => q !== b); },
        order: (i, j, o) => { const b = bondOf(id[i], id[j]); if (b) b.o = o; else x.bonds.push({ id: x.nid++, a: id[i], b: id[j], o, s: '' }); },
        bond: (a, b, o = 1) => { x.bonds.push({ id: x.nid++, a, b, o, s: '' }); },
        add: (el, to, o = 1) => { const nid = x.nid++; x.atoms.push({ id: nid, el, q: 0, x: 0, y: 0 }); if (to != null) x.bonds.push({ id: x.nid++, a: typeof to === 'object' ? to.id : id[to], b: nid, o, s: '' }); return { id: nid }; },
        addTo: (el, newId, o = 1) => { const nid = x.nid++; x.atoms.push({ id: nid, el, q: 0, x: 0, y: 0 }); x.bonds.push({ id: x.nid++, a: newId.id, b: nid, o, s: '' }); return { id: nid }; },
        setEl: (i, el) => { const a = x.atoms.find(q => q.id === id[i]); if (a) a.el = el; },
        rm: (i) => { x.atoms = x.atoms.filter(q => q.id !== id[i]); x.bonds = x.bonds.filter(q => q.a !== id[i] && q.b !== id[i]); },
        q: (i, v) => { const a = x.atoms.find(q => q.id === id[i]); if (a) a.q = v; },
        idOf: (i) => ({ id: id[i] }),
      };
      fn(ed);
      return this.split(x);
    };
    return c;
  },
  /* ---------------------------------------------------------------- Regeln */
  RULES: [],
  rule(r) { this.RULES.push(r); return r; },
  /* alle Zerlegungen eines Produkts (eine Stufe), bewertet und sortiert */
  retro(m0, opt = {}) {
    const c = this.ctx(m0), out = [], seen = new Set();
    const pk = this.key(c.m);
    for (const r of this.RULES) {
      let hits = [];
      try { hits = r.find(c) || []; } catch (e) { hits = []; }
      for (const h of hits.slice(0, 6)) {
        let res;
        try { res = r.apply(c, h); } catch (e) { res = null; }
        if (!res || !res.pre || !res.pre.length) continue;
        const pre = res.pre.filter(p => p.atoms.length);
        if (!pre.length || !pre.every(p => this.valid(p))) continue;
        const keys = pre.map(p => this.key(p));
        if (keys.includes(pk)) continue;
        const sig = r.id + '|' + keys.slice().sort().join('+');
        if (seen.has(sig)) continue;
        seen.add(sig);
        const flags = { ...(r.flags || {}), ...(res.flags || {}) };
        const rec = !flags.metal && !flags.extreme && !flags.toxic && !flags.pyro;
        if (opt.recOnly && !rec) continue;
        // Bewertung: Zuverlässigkeit × empfohlen × Verträglichkeit × Vereinfachung (ausgewogene Zerlegung bevorzugt)
        const size = this.heavy(c.m), sizes = pre.map(p => this.heavy(p));
        const balance = pre.length > 1 ? Math.min(...sizes) / size : 0;
        // 1.57: Toxikologie/Ökologie fliesst ein – einfache, ungiftige Wege (Fischer, Ac₂O, Verseifung) vor Kupplungsreagenzien
        const hz = this.hazard({ reag: res.reag || [], cond: { ...(r.cond || {}), ...(res.cond || {}) } });
        let score = (r.rel || 0.6) * (rec ? 1 : 0.55) * (res.compat ?? 1) * (0.85 + 0.3 * balance) * (0.55 + 0.45 * hz.green);
        if (Math.max(...sizes) >= size && pre.length === 1) score *= 0.92;   // Umwandlung ohne Vereinfachung (FGI)
        out.push({ rule: r, id: r.id, name: r.name, cls: r.cls, pre, keys, reag: res.reag || [], cond: { ...(r.cond || {}), ...(res.cond || {}) }, yld: res.yld || r.yld || '', note: [r.note, res.note].filter(Boolean).join(' '), flags, rec, score, hz, main: sizes.indexOf(Math.max(...sizes)) });
      }
    }
    return out.sort((a, b) => b.score - a.score);
  },
  /* Ausgangsstoff? Vorlagen-Datenbank (bekannt/käuflich) oder klein und einfach */
  START_EL: new Set(['C', 'H', 'N', 'O', 'S', 'F', 'Cl', 'Br', 'I', 'B', 'P', 'Si']),
  startInfo(m) {
    if (this.inDB(m)) return { ok: true, why: 'bekannt (Vorlagen-Datenbank)', p: 1 };
    const n = this.heavy(m);
    let rings = 0; try { rings = ChemProps.graph(m).rings.length; } catch (e) { /* */ }
    const groups = (() => { try { return ChemProps.groups(m).filter(g => g.k !== 'arene').reduce((t, g) => t + g.n, 0); } catch (e) { return 9; } })();
    if (n <= 6) return { ok: true, why: 'klein – üblicherweise käuflich', p: 0.95 };
    if (n <= 10 && rings <= 1 && groups <= 2) return { ok: true, why: 'einfacher Baustein – vermutlich käuflich', p: 0.85 };
    if (n <= 13 && rings <= 2 && groups <= 1) return { ok: true, why: 'einfacher Baustein – vermutlich käuflich', p: 0.75 };
    return { ok: false, why: 'vermutlich selbst herstellen', p: 0.45 };
  },
  /* ---------------------------------------------------------------- Routen (Baum)
   * Knoten: { mol, key, step: null | { opt (aus retro), kids: [Knoten] } } – Ausführung von den Blättern zur Wurzel */
  node(mol) { return { mol, key: this.key(mol), step: null }; },
  setStep(node, opt) { node.step = { opt, kids: opt.pre.map(p => this.node(p)) }; return node; },
  steps(root) { const out = []; const walk = (n) => { if (!n.step) return; for (const k of n.step.kids) walk(k); out.push(n); }; walk(root); return out; },
  leaves(root) { const out = []; const walk = (n) => { if (!n.step) { out.push(n); return; } for (const k of n.step.kids) walk(k); }; walk(root); return out; },
  score(root, goal) {
    let s = 1;
    const st = this.steps(root);
    for (const n of st) s *= n.step.opt.score;
    for (const l of this.leaves(root)) s *= this.startInfo(l.mol).p;
    s *= Math.pow(0.9, st.length);
    if (goal && this.leaves(root).some(l => l.key === goal)) s *= 3;
    return s;
  },
  clone(n) { return { mol: n.mol, key: n.key, step: n.step ? { opt: n.step.opt, kids: n.step.kids.map(k => this.clone(k)) } : null }; },
  /* Strahlsuche: Hauptlinie über das grösste Edukt, das kein Ausgangsstoff ist (Nebenpartner bleiben Blätter und
   * lassen sich in der Ansicht „weiter zerlegen“). goal = Schlüssel eines vorgegebenen Edukts. */
  plan(target, opt = {}) {
    const maxSteps = Math.max(1, Math.min(5, opt.maxSteps || 3)), goal = opt.goal || null, width = opt.width || 10;
    const t0 = Date.now(), budget = opt.ms || 2500;
    const cache = new Map();
    const retro = (mol) => { const k = this.key(mol); if (!cache.has(k)) cache.set(k, this.retro(mol, opt).slice(0, opt.branch || 7)); return cache.get(k); };
    const root0 = this.node(this.clean(target));
    const goalFp = opt.goalMol ? this.fp(opt.goalMol) : null;
    let beams = [{ root: root0, open: root0, keys: new Set([root0.key]) }];
    const done = [];
    for (let d = 0; d < maxSteps && beams.length; d++) {
      const next = [];
      for (const b of beams) {
        if (Date.now() - t0 > budget) break;
        for (const o of retro(b.open.mol)) {
          if (o.keys.some(k => b.keys.has(k))) continue;   // keine Kreise
          const root = this.clone(b.root);
          // denselben offenen Knoten in der Kopie finden
          const find = (n) => { if (n.key === b.open.key && !n.step) return n; if (n.step) for (const k of n.step.kids) { const r = find(k); if (r) return r; } return null; };
          const open = find(root);
          if (!open) continue;
          this.setStep(open, o);
          const keys = new Set([...b.keys, ...o.keys]);
          // weiter zerlegen: ohne Ziel das grösste nicht käufliche Edukt; mit Ziel-Edukt (Weg A → B) das dem Ziel
          // ähnlichste Edukt – auch wenn es käuflich wäre –, solange das Ziel nicht erreicht ist
          let cand;
          if (goal) {
            if (!open.step.kids.some(k => k.key === goal) && !this.leaves(root).some(l => l.key === goal)) cand = open.step.kids.map(k => ({ k, s: this.tanimoto(goalFp, this.fp(k.mol)) })).sort((x, y) => y.s - x.s)[0]?.k;
          } else cand = open.step.kids.filter(k => !this.startInfo(k.mol).ok).sort((x, y) => this.heavy(y.mol) - this.heavy(x.mol))[0];
          const r = { root, keys, sc: this.score(root, goal) };
          done.push(r);
          if (cand) next.push({ root, open: cand, keys, sc: r.sc });
        }
      }
      beams = next.sort((x, y) => y.sc - x.sc).slice(0, width);
    }
    // gleiche Routen zusammenfassen, beste zuerst
    const sig = (n) => n.step ? n.step.opt.id + '(' + n.step.kids.map(sig).join(',') + ')' : n.key;
    const seen = new Set(), routes = [];
    for (const r of done.sort((x, y) => y.sc - x.sc)) { const s = sig(r.root); if (seen.has(s)) continue; seen.add(s); routes.push({ root: r.root, score: r.sc, goal: goal ? this.leaves(r.root).some(l => l.key === goal) : null }); }
    if (goal) routes.sort((a, b) => (b.goal - a.goal) || (b.score - a.score));
    return routes.slice(0, opt.max || 8);
  },
  /* Weg vom Edukt zum Produkt: Suche vom Produkt aus, das Edukt soll als Ausgangsstoff vorkommen. Ohne Treffer: die
   * Routen, deren Ausgangsstoffe dem Edukt am ähnlichsten sind (einfacher Fingerabdruck) */
  route(edukt, produkt, opt = {}) {
    const goal = this.key(this.clean(edukt));
    const routes = this.plan(produkt, { ...opt, goal, goalMol: this.clean(edukt), maxSteps: opt.maxSteps || 4, width: 14, ms: opt.ms || 4000 });
    if (routes.some(r => r.goal)) return { found: true, routes: routes.filter(r => r.goal) };
    const fe = this.fp(edukt);
    for (const r of routes) r.sim = Math.max(0, ...this.leaves(r.root).map(l => this.tanimoto(fe, this.fp(l.mol))));
    return { found: false, routes: routes.sort((a, b) => b.sim - a.sim || b.score - a.score) };
  },
  fp(m) {
    const s = new Set();
    try {
      const { A } = ChemProps.graph(this.clean(m));
      A.forEach((a) => { s.add(a.el + a.h + (a.arom ? 'a' : '')); s.add(a.el + ':' + a.nb.map(([j, o]) => o + A[j].el).sort().join('')); for (const [j, o] of a.nb) for (const [k, o2] of A[j].nb) if (k !== A.indexOf(a)) s.add([a.el, o, A[j].el, o2, A[k].el].join('')); });
    } catch (e) { /* */ }
    return s;
  },
  tanimoto(a, b) { let n = 0; for (const x of a) if (b.has(x)) n++; return n / ((a.size + b.size - n) || 1); },
  /* ---------------------------------------------------------------- Mengen: Ansatz n (mmol) auf das Haupt-Edukt */
  amounts(opt, nMmol, kids) {
    const rows = [];
    const main = opt.main || 0;
    opt.pre.forEach((p, k) => {
      const eq = k === main ? 1 : (opt.preEq && opt.preEq[k]) || 1.1;
      const M = this.mass(p), n = nMmol * eq;
      rows.push({ name: (kids && kids[k] && kids[k].label) || this.name(p), role: k === main ? 'Edukt (begrenzend)' : 'Edukt', eq, n, M, m: n * M / 1000, V: null });
    });
    for (const r of opt.reag) {
      const info = this.REAG[r.n] || {};
      let M = 0; try { if (info.smi) M = ChemMol.analyze(ChemSmiles.toMol(info.smi, { layout: false })).mass; } catch (e) { M = 0; }
      const n = nMmol * (r.eq || 0), f = info.f || 1;
      const m = M ? n * M / 1000 / f : null;
      rows.push({ name: r.n, role: r.role || 'Reagenz', eq: r.eq || 0, n, M, m, V: m != null && info.d ? m / info.d : null });
    }
    return rows;
  },
  /* Vorschrift als Text (Gerüst) */
  procedure(opt, nMmol, prodName) {
    const c = opt.cond || {};
    const am = this.amounts(opt, nMmol);
    const fmt = (r) => `${r.name} (${r.eq ? r.eq.toFixed(r.eq < 1 ? 2 : 1) + ' Äq., ' : ''}${r.n.toFixed(r.n < 1 ? 2 : 1)} mmol${r.m != null ? ', ' + (r.m < 1 ? (r.m * 1000).toFixed(0) + ' mg' : r.m.toFixed(2) + ' g') : ''}${r.V != null ? ', ' + (r.V < 1 ? (r.V * 1000).toFixed(0) + ' µL' : r.V.toFixed(2) + ' mL') : ''})`;
    return `${opt.name}: ${am.filter(r => /Edukt/.test(r.role)).map(fmt).join(' und ')} in ${c.solv || 'geeignetem Lösungsmittel'}; ${am.filter(r => !/Edukt/.test(r.role)).map(fmt).join(', ')}; ${c.T || ''}${c.t ? ', ' + c.t : ''}. ${c.work ? 'Aufarbeitung: ' + c.work + '. ' : ''}Produkt: ${prodName}${opt.yld ? ' (typisch ' + opt.yld + ')' : ''}.`;
  },
};

/* ==================================================================== Regel-Bibliothek
 * Schreibweise: find(c) → Treffer (Graph-Indizes), apply(c, h) → { pre, reag:[{n, eq, role}], cond, note, compat } */
(() => {
  const R = (r) => ChemRxn.rule(r);
  const has = (c, el) => c.A.some(a => a.el === el);
  // störende Gruppen für metallorganische Reagenzien (Grignard): acide H, weitere Carbonyle
  const protic = (c, skip = new Set()) => c.A.some((a, i) => !skip.has(i) && ((a.el === 'O' || a.el === 'N' || a.el === 'S') && a.h > 0));
  const otherCO = (c, skip = new Set()) => c.A.some((a, i) => !skip.has(i) && c.carbonyl(i));
  // Carbonyl-Arten
  const acylSites = (c) => c.A.map((a, i) => i).filter(i => c.carbonyl(i));
  const singles = (c, i) => c.A[i].nb.filter(([j, o]) => o === 1).map(([j]) => j);
  const esters = (c) => acylSites(c).flatMap(i => singles(c, i).filter(j => c.el(j) === 'O' && !c.h(j) && c.A[j].q === 0).map(o => ({ c: i, o, r: c.nb(o).find(k => k !== i) })).filter(e => e.r != null && c.el(e.r) === 'C' && !c.carbonyl(e.r) && singles(c, e.c).filter(j => c.el(j) === 'O' || c.el(j) === 'N').length === 1));
  const amides = (c) => acylSites(c).flatMap(i => singles(c, i).filter(j => c.el(j) === 'N' && !c.arom(j) && c.A[j].q === 0).map(n => ({ c: i, n })).filter(e => singles(c, e.c).filter(j => c.el(j) === 'O' || c.el(j) === 'N').length === 1 && !c.ring(e.c, e.n)));
  const tert = (c, i) => c.cDeg(i) >= 3;
  const isAryl = (c, i) => c.el(i) === 'C' && c.arom(i);
  const cond = (solv, T, t, work) => ({ solv, T, t, work });

  /* ---- Ester ---- */
  R({ id: 'est_acid', name: 'Veresterung mit Säurechlorid', cls: 'Ester', rel: 0.88, yld: '80–95 %',
    find: (c) => esters(c).filter(e => !c.ring(e.c, e.o)),
    apply: (c, e) => ({ pre: c.edit(x => { x.del(e.c, e.o); x.add('Cl', e.c); }), reag: [{ n: 'NEt₃', eq: 1.5, role: 'Base' }, { n: 'DMAP', eq: 0.05, role: 'Kat. (Acylierung)' }],
      cond: cond('DCM (trocken)', '0 °C → RT', '2–4 h', 'mit 1 M HCl, NaHCO₃-Lsg. und Sole waschen, trocknen, einengen'), note: 'Säurechlorid aus der Säure mit SOCl₂ (oder vorgeschlagen: Oxalylchlorid/DMF).' }) });
  R({ id: 'est_steglich', name: 'Steglich-Veresterung (DCC/DMAP)', cls: 'Ester', rel: 0.82, yld: '70–90 %',
    find: (c) => esters(c).filter(e => !c.ring(e.c, e.o)),
    apply: (c, e) => ({ pre: c.edit(x => { x.del(e.c, e.o); x.add('O', e.c); }), reag: [{ n: 'DCC', eq: 1.1, role: 'Kupplungsreagenz' }, { n: 'DMAP', eq: 0.1, role: 'Kat.' }],
      cond: cond('DCM', '0 °C → RT', '4–12 h', 'DCU abfiltrieren, Filtrat waschen (HCl, NaHCO₃), Säulenchromatographie'), note: 'Mild, auch für Phenole und tertiäre Alkohole. DCC sensibilisierend – Handschuhe.' }) });
  R({ id: 'est_fischer', name: 'Fischer-Veresterung', cls: 'Ester', rel: 0.75, yld: '60–90 %',
    find: (c) => esters(c).filter(e => !c.ring(e.c, e.o) && !isAryl(c, e.r) && !tert(c, e.r)),
    apply: (c, e) => ({ pre: c.edit(x => { x.del(e.c, e.o); x.add('O', e.c); }), reag: [{ n: 'H₂SO₄ (konz.)', eq: 0.1, role: 'Kat. (Säure)' }],
      cond: cond('Alkohol im Überschuss oder Toluol (Dean-Stark)', 'Rückfluss', '4–16 h', 'mit NaHCO₃-Lsg. neutralisieren, extrahieren, destillieren'), note: 'Gleichgewicht: Alkohol im Überschuss oder Wasser abscheiden. Nur für einfache Säuren/Alkohole.' }) });
  R({ id: 'est_alkyl', name: 'Ester durch Alkylierung des Carboxylats', cls: 'Ester', rel: 0.7, yld: '80–95 %',
    find: (c) => esters(c).filter(e => !c.ring(e.c, e.o) && c.sp3(e.r) && c.cDeg(e.r) <= 1 && c.h(e.r) >= 2),
    apply: (c, e) => ({ pre: c.edit(x => { x.del(e.c, e.o); x.add('O', e.c); x.setEl(e.o, 'Br'); }).map(p => p), reag: [{ n: 'K₂CO₃', eq: 1.5, role: 'Base' }],
      cond: cond('DMF', 'RT', '4–16 h', 'mit Wasser verdünnen, extrahieren (EtOAc), waschen'), note: 'Für Methyl-, Ethyl-, Benzylester (Alkylbromid bzw. MeI). Alkylhalogenide sind alkylierend – Abzug.' }) });
  /* ---- Amide, Carbamate ---- */
  // Acetylierung mit Acetanhydrid: Acetamide und Acetate (Paracetamol, Aspirin, Acetanilid) – einfachster Laborweg
  const acetyl = (c) => acylSites(c).filter(i => singles(c, i).some(j => c.el(j) === 'C' && c.h(j) === 3)).map(i => ({ i, x: singles(c, i).find(j => (c.el(j) === 'N' || c.el(j) === 'O') && c.nb(j).some(k => k !== i && !c.carbonyl(k))) })).filter(e => e.x != null && !c.ring(e.i, e.x));
  R({ id: 'acetyl_ac2o', name: 'Acetylierung mit Acetanhydrid', cls: 'Acetamid / Acetat', rel: 1.06, yld: '85–98 %',
    find: (c) => acetyl(c), apply: (c, e) => { const N = c.el(e.x) === 'N'; const ar = c.nb(e.x).some(k => k !== e.i && c.arom(k)); return { pre: c.edit(x => { const me = singles(c, e.i).find(j => c.el(j) === 'C' && c.h(j) === 3); x.del(e.i, e.x); x.rm(e.i); x.rm(me); x.rm(c.dblO(e.i)); }).filter(p => p.atoms.length), reag: [{ n: 'Ac₂O', eq: N ? 1.1 : 1.5, role: 'Acetylierung' }, ...(N ? [] : [{ n: 'Pyridin', eq: 2, role: 'Base / Kat. (oder H₂SO₄ kat. bei Phenolen)' }])],
      cond: N ? cond(ar ? 'Wasser oder EtOAc' : 'DCM', 'RT (bzw. kurz 50 °C)', '0,5–2 h', 'Produkt fällt aus: abfiltrieren, mit kaltem Wasser waschen, umkristallisieren') : cond('Pyridin oder DCM', 'RT', '2–12 h', 'mit 1 M HCl waschen, einengen'),
      note: N ? 'Amine reagieren schneller als Phenole/Alkohole (chemoselektiv, z. B. 4-Aminophenol → Paracetamol).' : 'Phenole/Alkohole; Aspirin aus Salicylsäure mit Ac₂O und kat. H₂SO₄ (85 °C).' }; } });
  R({ id: 'amid_cl', name: 'Amid aus Säurechlorid (Schotten–Baumann)', cls: 'Amid', rel: 0.9, yld: '80–95 %',
    find: (c) => amides(c), apply: (c, e) => ({ pre: c.edit(x => { x.del(e.c, e.n); x.add('Cl', e.c); }), reag: [{ n: 'NEt₃', eq: 1.5, role: 'Base' }],
      cond: cond('DCM (trocken)', '0 °C → RT', '1–3 h', 'waschen (1 M HCl, NaHCO₃), trocknen, einengen'), note: 'Robust und schnell. Säurechlorid aus der Säure mit SOCl₂.' }) });
  R({ id: 'amid_edc', name: 'Amidkupplung EDC/HOBt', cls: 'Amid', rel: 0.86, yld: '70–95 %',
    find: (c) => amides(c), apply: (c, e) => ({ pre: c.edit(x => { x.del(e.c, e.n); x.add('O', e.c); }), reag: [{ n: 'EDC·HCl', eq: 1.2, role: 'Kupplungsreagenz' }, { n: 'HOBt', eq: 1.2, role: 'Additiv' }, { n: 'DIPEA', eq: 2.5, role: 'Base' }],
      cond: cond('DMF oder DCM', '0 °C → RT', '4–16 h', 'Harnstoff ist wasserlöslich: waschen (HCl, NaHCO₃, Sole)'), note: 'Standard der Peptidchemie, wenig Racemisierung.' }) });
  R({ id: 'amid_hatu', name: 'Amidkupplung HATU', cls: 'Amid', rel: 0.84, yld: '80–98 %',
    find: (c) => amides(c), apply: (c, e) => ({ pre: c.edit(x => { x.del(e.c, e.n); x.add('O', e.c); }), reag: [{ n: 'HATU', eq: 1.1, role: 'Kupplungsreagenz' }, { n: 'DIPEA', eq: 3, role: 'Base' }],
      cond: cond('DMF', 'RT', '1–4 h', 'mit EtOAc verdünnen, waschen (LiCl-Lsg., HCl, NaHCO₃)'), note: 'Für schwierige (sterisch gehinderte) Kupplungen; teurer.' }) });
  const carbamates = (c) => acylSites(c).map(i => { const s = singles(c, i); const n = s.find(j => c.el(j) === 'N'), o = s.find(j => c.el(j) === 'O' && !c.h(j)); return n != null && o != null ? { c: i, n, o, r: c.nb(o).find(k => k !== i) } : null; }).filter(Boolean);
  const pgKind = (c, e) => { const r = e.r; if (c.el(r) === 'C' && c.cDeg(r) === 3 && c.nb(r).filter(k => c.el(k) === 'C').every(k => c.h(k) === 3)) return 'Boc'; const nbAr = c.nb(r).filter(k => c.arom(k)); if (c.h(r) === 2 && nbAr.length === 1) return 'Cbz'; const ch = c.nb(r).find(k => k !== e.o && c.el(k) === 'C' && c.nb(k).filter(q => c.arom(q)).length === 2); if (ch != null) return 'Fmoc'; return null; };
  R({ id: 'carb_pg', name: 'Schutzgruppe am Amin (Boc / Cbz / Fmoc)', cls: 'Carbamat', rel: 0.92, yld: '85–98 %',
    find: (c) => carbamates(c).filter(e => pgKind(c, e)),
    apply: (c, e) => { const k = pgKind(c, e); const pre = c.edit(x => { x.del(e.c, e.n); for (const v of [e.c, e.o, ...ChemRxn._side(c, e.o, e.c)]) x.rm(v); }); return { pre: pre.filter(p => p.atoms.some(a => a.el === 'N')), reag: [{ n: k === 'Boc' ? 'Boc₂O' : k === 'Cbz' ? 'Cbz-Cl' : 'Fmoc-OSu', eq: 1.1, role: k + '-Reagenz' }, { n: k === 'Boc' ? 'NEt₃' : 'K₂CO₃', eq: 1.5, role: 'Base' }],
      cond: cond(k === 'Boc' ? 'DCM oder THF/H₂O' : 'Dioxan/H₂O', k === 'Cbz' ? '0 °C → RT' : 'RT', '2–12 h', 'ansäuern (Zitronensäure), extrahieren'), name: k + '-Schutz', note: `${k}-Schutzgruppe; Abspaltung: ${k === 'Boc' ? 'TFA/DCM' : k === 'Cbz' ? 'H₂, Pd/C' : '20 % Piperidin/DMF'}.` }; } });
  /* ---- Ether ---- */
  const ethers = (c) => c.A.map((a, i) => i).filter(i => c.el(i) === 'O' && !c.h(i) && c.A[i].q === 0 && c.nb(i).length === 2 && c.nb(i).every(j => c.el(j) === 'C' && !c.carbonyl(j)) && !c.inRing(i));
  R({ id: 'ether_w', name: 'Williamson-Ethersynthese', cls: 'Ether', rel: 0.8, yld: '70–95 %',
    find: (c) => ethers(c).flatMap(o => c.nb(o).filter(r => c.sp3(r) && c.cDeg(r) <= 1 && !tert(c, r)).map(r => ({ o, r, other: c.nb(o).find(k => k !== r) }))),
    apply: (c, e) => { const phen = isAryl(c, e.other); return { pre: c.edit(x => { x.del(e.o, e.r); x.add('Br', e.r); }), reag: phen ? [{ n: 'K₂CO₃', eq: 2, role: 'Base' }] : [{ n: 'NaH (60 % in Öl)', eq: 1.2, role: 'Base' }],
      cond: phen ? cond('Aceton oder DMF', 'Rückfluss bzw. 60 °C', '4–12 h', 'filtrieren, einengen, extrahieren') : cond('THF oder DMF (trocken)', '0 °C → RT', '2–12 h', 'vorsichtig mit NH₄Cl-Lsg. löschen, extrahieren'),
      flags: phen ? {} : { pyro: true }, note: phen ? 'Phenolat + primäres Alkylhalogenid (SN2).' : 'Alkoholat mit NaH (H₂-Entwicklung, feuchtigkeitsempfindlich) – vorgeschlagen; Alternative: Phase-Transfer (NaOH, TBAB).' }; } });
  /* ---- Alkohole ---- */
  const alcohols = (c) => c.A.map((a, i) => i).filter(i => c.el(i) === 'O' && c.h(i) >= 1 && c.nb(i).length === 1 && c.sp3(c.nb(i)[0])).map(o => ({ o, c: c.nb(o)[0] }));
  R({ id: 'oh_nabh4', name: 'Reduktion mit NaBH₄', cls: 'Alkohol', rel: 0.92, yld: '85–98 %',
    find: (c) => alcohols(c).filter(e => c.h(e.c) >= 1),
    apply: (c, e) => ({ pre: c.edit(x => { x.order(e.c, e.o, 2); }), reag: [{ n: 'NaBH₄', eq: 1.0, role: 'Reduktionsmittel' }], compat: otherCO(c) ? 0.6 : 1,
      cond: cond('MeOH oder EtOH', '0 °C → RT', '1–2 h', 'mit verd. HCl oder NH₄Cl-Lsg. löschen, extrahieren'), note: 'Aldehyd → primärer, Keton → sekundärer Alkohol. Ester bleiben meist unberührt.' }) });
  R({ id: 'oh_grignard', name: 'Grignard-Addition an C=O', cls: 'Alkohol / C–C', rel: 0.78, yld: '60–85 %',
    find: (c) => alcohols(c).flatMap(e => c.nb(e.c).filter(r => r !== e.o && c.el(r) === 'C' && (c.sp3(r) || c.arom(r)) && !c.ring(e.c, r) && c.nb(r).every(k => k === e.c || c.el(k) === 'C')).map(r => ({ ...e, r }))),
    apply: (c, e) => { const skip = new Set([e.o]); return { pre: c.edit(x => { x.del(e.c, e.r); x.order(e.c, e.o, 2); x.add('Br', e.r); }), reag: [{ n: 'Mg (Späne)', eq: 1.3, role: 'für R–MgBr' }], compat: protic(c, skip) || otherCO(c) ? 0.35 : 1,
      cond: cond('Et₂O oder THF (trocken, Schutzgas)', '0 °C → RT', '1–3 h', 'mit ges. NH₄Cl-Lsg. löschen, extrahieren'), flags: {}, note: 'R–MgBr aus R–Br und Mg herstellen (Iod-Start). Wasser streng ausschliessen.' + (protic(c, skip) || otherCO(c) ? ' Achtung: OH/NH/weitere C=O im Molekül stören – Schutzgruppe nötig.' : '') }; } });
  R({ id: 'oh_lah', name: 'Ester-Reduktion mit LiAlH₄', cls: 'Alkohol', rel: 0.8, yld: '80–95 %',
    find: (c) => alcohols(c).filter(e => c.h(e.c) === 2 && c.nb(e.c).some(k => c.el(k) === 'C')),
    apply: (c, e) => ({ pre: c.edit(x => { x.order(e.c, e.o, 2); const o2 = x.add('O', e.c); x.addTo('C', o2); }), reag: [{ n: 'LiAlH₄', eq: 1.0, role: 'Reduktionsmittel' }], flags: { pyro: true },
      cond: cond('THF (trocken)', '0 °C → Rückfluss', '2–4 h', 'Fieser-Aufarbeitung (H₂O, 15 % NaOH, H₂O), filtrieren'), note: 'LiAlH₄ reagiert heftig mit Wasser – vorgeschlagen, nicht empfohlen. Alternative: Ester → Aldehyd/Alkohol mit NaBH₄/LiCl.' }) });
  /* ---- Aldehyde, Ketone ---- */
  const ketald = (c) => acylSites(c).filter(i => singles(c, i).every(j => c.el(j) === 'C') && !c.inRing(i) || (c.carbonyl(i) && singles(c, i).every(j => c.el(j) === 'C')));
  R({ id: 'co_dmp', name: 'Oxidation mit Dess–Martin-Periodinan', cls: 'Aldehyd/Keton', rel: 0.88, yld: '80–95 %',
    find: (c) => ketald(c), apply: (c, i) => ({ pre: c.edit(x => { x.order(i, c.dblO(i), 1); }), reag: [{ n: 'DMP', eq: 1.2, role: 'Oxidationsmittel' }],
      cond: cond('DCM', 'RT', '1–3 h', 'mit Na₂S₂O₃/NaHCO₃-Lsg. rühren, extrahieren'), note: 'Mild, kein Überoxidieren zur Säure. Alternative: Swern (−78 °C) oder PCC (Cr(VI), giftig).' }) });
  R({ id: 'co_pcc', name: 'Oxidation mit PCC', cls: 'Aldehyd/Keton', rel: 0.8, yld: '70–90 %', flags: { toxic: true },
    find: (c) => ketald(c), apply: (c, i) => ({ pre: c.edit(x => { x.order(i, c.dblO(i), 1); }), reag: [{ n: 'PCC', eq: 1.5, role: 'Oxidationsmittel' }],
      cond: cond('DCM, Celite', 'RT', '2–4 h', 'über Kieselgel filtrieren'), note: 'Chrom(VI) ist giftig/krebserzeugend – vorgeschlagen, nicht empfohlen.' }) });
  R({ id: 'co_swern', name: 'Swern-Oxidation', cls: 'Aldehyd/Keton', rel: 0.85, yld: '80–95 %', flags: { extreme: true },
    find: (c) => ketald(c), apply: (c, i) => ({ pre: c.edit(x => { x.order(i, c.dblO(i), 1); }), reag: [{ n: '(COCl)₂ / DMSO', eq: 1.5, role: 'Aktivierung' }, { n: 'NEt₃', eq: 5, role: 'Base' }],
      cond: cond('DCM (trocken)', '−78 °C', '1–2 h', 'waschen, einengen (Dimethylsulfid-Geruch)'), note: 'Sehr zuverlässig, braucht aber −78 °C – vorgeschlagen, nicht empfohlen.' }) });
  R({ id: 'co_fc', name: 'Friedel–Crafts-Acylierung', cls: 'Arylketon', rel: 0.78, yld: '60–90 %',
    find: (c) => acylSites(c).flatMap(i => { const s = singles(c, i); const ar = s.filter(j => isAryl(c, j)); const al = s.filter(j => c.el(j) === 'C'); return ar.length >= 1 && al.length === 2 ? ar.map(a => ({ i, a })) : []; }),
    apply: (c, e) => { const ring = c.G.aromRings.find(r => r.includes(e.a)) || []; const deact = ring.some(v => c.nb(v).some(k => !ring.includes(k) && k !== e.i && (c.carbonyl(k) || (c.el(k) === 'N' && c.A[k].q > 0) || c.A[k].nb.some(([q, o]) => o === 3)))); return {
      pre: c.edit(x => { x.del(e.i, e.a); x.add('Cl', e.i); }), reag: [{ n: 'AlCl₃', eq: 1.2, role: 'Lewis-Säure (stöchiometrisch)' }], compat: deact ? 0.2 : 1,
      cond: cond('DCM oder 1,2-Dichlorethan (trocken)', '0 °C → RT', '2–6 h', 'auf Eis/HCl giessen, extrahieren'), note: 'Para-Produkt bevorzugt bei aktivierten Aromaten.' + (deact ? ' Achtung: desaktivierter Ring – geht kaum.' : '') }; } });
  R({ id: 'co_aldol', name: 'Aldolkondensation (Claisen–Schmidt)', cls: 'Enon', rel: 0.75, yld: '60–90 %',
    find: (c) => { const out = []; for (const i of acylSites(c)) for (const a of singles(c, i).filter(j => c.el(j) === 'C' && !c.arom(j))) for (const [b, o] of c.A[a].nb) if (o === 2 && c.el(b) === 'C' && !c.inRing(b) && c.h(b) >= 1) out.push({ i, a, b }); return out; },
    apply: (c, e) => ({ pre: c.edit(x => { x.del(e.a, e.b); x.add('O', e.b, 2); }), reag: [{ n: 'NaOH', eq: 0.5, role: 'Base (kat.)' }],
      cond: cond('EtOH/H₂O', 'RT', '2–12 h', 'Produkt fällt oft aus: abfiltrieren, umkristallisieren'), note: 'Am besten mit einem Aldehyd ohne α-H (z. B. Benzaldehyd) und einem Methylketon.' }) });
  /* ---- Carbonsäuren ---- */
  const acids = (c) => acylSites(c).filter(i => singles(c, i).some(j => c.el(j) === 'O' && c.h(j) >= 1)).map(i => ({ i, o: singles(c, i).find(j => c.el(j) === 'O' && c.h(j) >= 1), r: singles(c, i).find(j => c.el(j) === 'C') }));
  R({ id: 'acid_ester', name: 'Esterverseifung', cls: 'Säure', rel: 0.95, yld: '90–99 %',
    find: (c) => acids(c), apply: (c, e) => ({ pre: c.edit(x => { x.addTo('C', x.idOf(e.o)); }), reag: [{ n: 'LiOH·H₂O', eq: 2, role: 'Base' }],
      cond: cond('THF/H₂O 3:1', 'RT', '2–12 h', 'ansäuern (1 M HCl, pH 2), extrahieren'), note: 'Methylester als bequemer Vorläufer (Schutz der Säure).' }) });
  R({ id: 'acid_pinnick', name: 'Pinnick-Oxidation (Aldehyd → Säure)', cls: 'Säure', rel: 0.88, yld: '80–95 %',
    find: (c) => acids(c).filter(e => e.r != null), apply: (c, e) => ({ pre: c.edit(x => { x.rm(e.o); }), reag: [{ n: 'NaClO₂', eq: 1.5, role: 'Oxidationsmittel' }, { n: 'NaH₂PO₄', eq: 1.5, role: 'Puffer' }, { n: '2-Methyl-2-buten', eq: 5, role: 'Fänger (HOCl)' }],
      cond: cond('tBuOH/H₂O', 'RT', '1–4 h', 'ansäuern, extrahieren'), note: 'Sehr mild und selektiv.' }) });
  R({ id: 'acid_jones', name: 'Jones-Oxidation (prim. Alkohol → Säure)', cls: 'Säure', rel: 0.75, yld: '60–85 %', flags: { toxic: true },
    find: (c) => acids(c).filter(e => e.r != null && !c.arom(e.r)), apply: (c, e) => ({ pre: c.edit(x => { x.order(e.i, c.dblO(e.i), 1); x.rm(c.dblO(e.i)); }), reag: [{ n: 'CrO₃ / H₂SO₄ (Jones)', eq: 2, role: 'Oxidationsmittel' }],
      cond: cond('Aceton', '0 °C → RT', '1–3 h', 'mit iPrOH löschen, extrahieren'), note: 'Chrom(VI) – vorgeschlagen, nicht empfohlen. Besser: TEMPO/NaOCl, dann Pinnick.' }) });
  R({ id: 'acid_kmno4', name: 'Seitenketten-Oxidation mit KMnO₄', cls: 'Säure', rel: 0.72, yld: '50–80 %',
    find: (c) => acids(c).filter(e => e.r != null && c.arom(e.r)), apply: (c, e) => ({ pre: c.edit(x => { x.rm(e.o); x.rm(c.dblO(e.i)); }), reag: [{ n: 'KMnO₄', eq: 3, role: 'Oxidationsmittel' }, { n: 'NaOH', eq: 0.5, role: 'Base' }],
      cond: cond('H₂O (Pyridin)', 'Rückfluss', '4–8 h', 'MnO₂ abfiltrieren, Filtrat ansäuern → Säure fällt aus'), note: 'Toluol-Derivat → Benzoesäure; andere oxidierbare Gruppen stören.' }) });
  R({ id: 'acid_co2', name: 'Grignard + CO₂', cls: 'Säure', rel: 0.7, yld: '50–80 %',
    find: (c) => acids(c).filter(e => e.r != null && !c.ring(e.i, e.r)), apply: (c, e) => ({ pre: c.edit(x => { x.del(e.i, e.r); x.add('Br', e.r); }).filter(p => p.atoms.some(a => a.el === 'Br')), reag: [{ n: 'Mg (Späne)', eq: 1.3, role: 'für R–MgBr' }, { n: 'CO₂ (Trockeneis)', eq: 5, role: 'C1-Baustein' }], compat: protic(c, new Set([e.o])) ? 0.3 : 1,
      cond: cond('Et₂O oder THF (trocken)', 'Grignard bei RT, dann auf Trockeneis', '2 h', 'ansäuern, extrahieren'), note: 'Verlängert um ein C-Atom.' }) });
  R({ id: 'acid_cn', name: 'Nitril-Hydrolyse', cls: 'Säure', rel: 0.7, yld: '70–90 %',
    find: (c) => acids(c).filter(e => e.r != null), apply: (c, e) => ({ pre: c.edit(x => { const o2 = c.dblO(e.i); x.rm(e.o); x.rm(o2); x.add('N', e.i, 3); }), reag: [{ n: 'H₂SO₄ (konz.)', eq: 3, role: 'Säure' }],
      cond: cond('H₂O/H₂SO₄ (1:1)', 'Rückfluss', '4–12 h', 'abkühlen, extrahieren'), note: 'Auch basisch (NaOH, EtOH/H₂O) möglich.' }) });
  /* ---- Amine ---- */
  const amineC = (c) => c.A.map((a, i) => i).filter(i => c.el(i) === 'N' && !c.arom(i) && c.A[i].q === 0 && c.nb(i).every(j => !c.carbonyl(j)) && c.A[i].nb.every(([, o]) => o === 1));
  R({ id: 'am_redam', name: 'Reduktive Aminierung', cls: 'Amin', rel: 0.88, yld: '70–95 %',
    find: (c) => amineC(c).flatMap(n => c.nb(n).filter(r => c.sp3(r) && c.h(r) >= 1 && !c.ring(n, r)).map(r => ({ n, r }))),
    apply: (c, e) => ({ pre: c.edit(x => { x.del(e.n, e.r); x.add('O', e.r, 2); }), reag: [{ n: 'NaBH(OAc)₃', eq: 1.5, role: 'Reduktionsmittel' }, { n: 'AcOH', eq: 1, role: 'Säure' }],
      cond: cond('DCE oder DCM', 'RT', '4–16 h', 'mit NaHCO₃-Lsg. basisch stellen, extrahieren'), note: 'Aldehyd/Keton + Amin, ein Topf; kaum Mehrfachalkylierung.' }) });
  R({ id: 'am_alk', name: 'N-Alkylierung (SN2)', cls: 'Amin', rel: 0.62, yld: '40–80 %',
    find: (c) => amineC(c).filter(n => c.h(n) <= 1).flatMap(n => c.nb(n).filter(r => c.sp3(r) && c.cDeg(r) <= 1 && c.h(r) >= 2 && !c.ring(n, r)).map(r => ({ n, r }))),
    apply: (c, e) => ({ pre: c.edit(x => { x.del(e.n, e.r); x.add('Br', e.r); }), reag: [{ n: 'K₂CO₃', eq: 2, role: 'Base' }],
      cond: cond('MeCN oder DMF', 'RT → 60 °C', '4–16 h', 'filtrieren, einengen, extrahieren'), note: 'Gefahr der Mehrfachalkylierung – reduktive Aminierung ist meist besser.' }) });
  R({ id: 'am_gabriel', name: 'Gabriel-Synthese (primäres Amin)', cls: 'Amin', rel: 0.75, yld: '60–85 %',
    find: (c) => amineC(c).filter(n => c.h(n) === 2 && c.nb(n).length === 1 && c.sp3(c.nb(n)[0]) && c.h(c.nb(n)[0]) >= 2).map(n => ({ n, r: c.nb(n)[0] })),
    apply: (c, e) => ({ pre: c.edit(x => { x.setEl(e.n, 'Br'); }), reag: [{ n: 'Kaliumphthalimid', eq: 1.1, role: 'N-Quelle' }, { n: 'N₂H₄·H₂O', eq: 2, role: 'Spaltung' }],
      cond: cond('DMF (Alkylierung), dann EtOH (Hydrazinolyse)', '80 °C, dann Rückfluss', '2 × 3–6 h', 'Phthalhydrazid abfiltrieren, Amin extrahieren'), note: 'Zwei Schritte in einer Stufe; Hydrazin ist giftig (Abzug).' }) });
  R({ id: 'am_nitro', name: 'Nitro-Reduktion (Fe/NH₄Cl)', cls: 'Anilin', rel: 0.9, yld: '80–95 %',
    find: (c) => c.A.map((a, i) => i).filter(i => c.el(i) === 'N' && c.h(i) === 2 && c.nb(i).length === 1 && isAryl(c, c.nb(i)[0])),
    apply: (c, n) => ({ pre: c.edit(x => { x.q(n, 1); const o1 = x.add('O', n, 2); void o1; const o2 = x.add('O', n, 1); x.q2 = o2; }).map(p => { const N = p.atoms.find(a => a.id === c.id[n]); const O = p.bonds.filter(b => b.a === N.id || b.b === N.id).map(b => b.a === N.id ? b.b : b.a).map(id => p.atoms.find(a => a.id === id)).filter(a => a.el === 'O'); const single = O.find(a => p.bonds.find(b => (b.a === a.id || b.b === a.id) && b.o === 1)); if (single) single.q = -1; return p; }),
      reag: [{ n: 'Fe (Pulver)', eq: 5, role: 'Reduktionsmittel' }, { n: 'NH₄Cl', eq: 5, role: 'Elektrolyt' }],
      cond: cond('EtOH/H₂O 4:1', 'Rückfluss', '1–3 h', 'über Celite filtrieren, extrahieren'), note: 'Robust; Alternativen: SnCl₂ (EtOH) oder H₂, Pd/C (Katalysator).' }) });
  /* ---- Alkene ---- */
  const alkenes = (c) => { const out = []; c.A.forEach((a, i) => { for (const [j, o] of a.nb) if (j > i && o === 2 && c.el(i) === 'C' && c.el(j) === 'C' && !c.arom(i) && !c.inRing(i) && !c.inRing(j)) out.push({ a: i, b: j }); }); return out; };
  const ewg = (c, i, other) => c.nb(i).some(k => k !== other && (c.carbonyl(k) || c.A[k].nb.some(([q, o]) => o === 3 && c.el(q) === 'N')));
  R({ id: 'ene_hwe', name: 'Horner–Wadsworth–Emmons (E-Alken)', cls: 'Alken', rel: 0.88, yld: '70–95 %',
    find: (c) => alkenes(c).flatMap(e => [[e.a, e.b], [e.b, e.a]]).filter(([p, q]) => ewg(c, q, p) && c.h(p) >= 1 && c.h(q) >= 1 && c.nb(q).some(k => k !== p && esters(c).some(x => x.c === k))),
    apply: (c, [p, q]) => ({ pre: c.edit(x => { x.del(p, q); x.add('O', p, 2); }).filter(m => m.atoms.some(a => a.el === 'O') && m.atoms.length < c.m.atoms.length - 2), reag: [{ n: 'Triethylphosphonoacetat', eq: 1.2, role: 'Phosphonat' }, { n: 'K₂CO₃', eq: 2, role: 'Base (mild) – oder NaH' }],
      cond: cond('THF bzw. EtOH', 'RT', '2–12 h', 'mit NH₄Cl-Lsg. löschen, extrahieren'), note: 'Aldehyd + Phosphonoacetat → (E)-α,β-ungesättigter Ester.' }) });
  R({ id: 'ene_wittig', name: 'Wittig-Reaktion', cls: 'Alken', rel: 0.8, yld: '60–90 %',
    find: (c) => alkenes(c).flatMap(e => [[e.a, e.b], [e.b, e.a]]).filter(([p, q]) => c.h(p) >= 1 && c.nb(q).length >= 1),
    apply: (c, [p, q]) => { const stab = ewg(c, q, p); return { pre: c.edit(x => { x.del(p, q); x.add('O', p, 2); x.add('Br', q); }), reag: [{ n: 'PPh₃', eq: 1.1, role: 'Phosphoniumsalz aus R–Br' }, { n: stab ? 'K₂CO₃' : 'KOtBu', eq: 1.2, role: 'Base' }],
      cond: cond('Toluol (Salz), dann THF', stab ? 'RT' : '0 °C → RT', '2 × 2–12 h', 'Ph₃PO durch Säule/Ausfällen abtrennen'), note: (stab ? 'Stabilisiertes Ylid → bevorzugt E-Alken.' : 'Nicht stabilisiertes Ylid → bevorzugt Z-Alken.') + ' Erst R–Br + PPh₃ zum Phosphoniumsalz.' }; } });
  R({ id: 'ene_dehyd', name: 'Dehydratisierung eines Alkohols', cls: 'Alken', rel: 0.55, yld: '50–85 %',
    find: (c) => alkenes(c).filter(e => c.h(e.a) + c.h(e.b) <= 2), apply: (c, e) => { const [p, q] = c.cDeg(e.a) >= c.cDeg(e.b) ? [e.a, e.b] : [e.b, e.a]; return { pre: c.edit(x => { x.order(p, q, 1); x.add('O', p); }), reag: [{ n: 'H₃PO₄ (85 %)', eq: 0.5, role: 'Säure' }],
      cond: cond('ohne Lösungsmittel (Destillation)', '150 °C (abdestillieren)', '1–2 h', 'Destillat waschen, trocknen'), note: 'Zaitsev-Produkt (höher substituiert); Umlagerungen möglich.' }; } });
  R({ id: 'ene_heck', name: 'Heck-Reaktion', cls: 'Alken / C–C', rel: 0.8, yld: '60–90 %', flags: { metal: true },
    find: (c) => alkenes(c).flatMap(e => [[e.a, e.b], [e.b, e.a]]).flatMap(([p, q]) => c.nb(p).filter(k => k !== q && isAryl(c, k)).map(ar => ({ p, q, ar }))).filter(e => c.h(e.p) === 1),
    apply: (c, e) => ({ pre: c.edit(x => { x.del(e.p, e.ar); x.add('Br', e.ar); }), reag: [{ n: 'Pd(OAc)₂', eq: 0.02, role: 'Katalysator' }, { n: 'PPh₃', eq: 0.04, role: 'Ligand' }, { n: 'NEt₃', eq: 2, role: 'Base' }],
      cond: cond('DMF oder MeCN', '80–100 °C', '6–16 h', 'filtrieren, extrahieren, Säule'), note: 'Palladium-Katalysator – vorgeschlagen, nicht empfohlen.' }) });
  /* ---- Aromaten: C–C-Kupplungen, Substitution ---- */
  R({ id: 'ar_suzuki', name: 'Suzuki-Kupplung', cls: 'Biaryl', rel: 0.88, yld: '70–95 %', flags: { metal: true },
    find: (c) => { const out = []; c.A.forEach((a, i) => { for (const [j, o] of a.nb) if (j > i && o === 1 && c.arom(i) && c.arom(j) && !c.ring(i, j) && !c.G.aromRings.some(r => r.includes(i) && r.includes(j))) out.push({ a: i, b: j }); }); return out; },
    apply: (c, e) => ({ pre: c.edit(x => { x.del(e.a, e.b); x.add('Br', e.a); const B = x.add('B', e.b); x.addTo('O', B); x.addTo('O', B); }), reag: [{ n: 'Pd(PPh₃)₄', eq: 0.03, role: 'Katalysator' }, { n: 'K₂CO₃', eq: 2, role: 'Base' }],
      cond: cond('Dioxan/H₂O 4:1 (entgast)', '80–90 °C', '4–12 h', 'extrahieren, Säule'), note: 'Arylbromid + Arylboronsäure; Pd-Katalysator – vorgeschlagen, nicht empfohlen.' }) });
  R({ id: 'ar_sono', name: 'Sonogashira-Kupplung', cls: 'Arylalkin', rel: 0.82, yld: '60–90 %', flags: { metal: true },
    find: (c) => { const out = []; c.A.forEach((a, i) => { if (!c.arom(i)) return; for (const [j] of a.nb) if (c.A[j].nb.some(([, o]) => o === 3) && c.el(j) === 'C') out.push({ ar: i, c: j }); }); return out; },
    apply: (c, e) => ({ pre: c.edit(x => { x.del(e.ar, e.c); x.add('I', e.ar); }), reag: [{ n: 'Pd(PPh₃)₄', eq: 0.02, role: 'Katalysator' }, { n: 'CuI', eq: 0.04, role: 'Co-Katalysator' }, { n: 'NEt₃', eq: 3, role: 'Base/LM' }],
      cond: cond('THF/NEt₃ (entgast)', 'RT → 50 °C', '4–12 h', 'filtrieren, Säule'), note: 'Pd/Cu-Katalyse – vorgeschlagen, nicht empfohlen.' }) });
  const arSub = (c, el) => c.A.map((a, i) => i).filter(i => c.el(i) === el && c.nb(i).length === 1 && isAryl(c, c.nb(i)[0]));
  const actRing = (c, ar) => { const ring = c.G.aromRings.find(r => r.includes(ar)) || []; return ring.some(v => c.nb(v).some(k => !ring.includes(k) && (c.el(k) === 'O' || (c.el(k) === 'N' && !c.A[k].q) || c.sp3(k)))); };
  R({ id: 'ar_nitr', name: 'Nitrierung', cls: 'Aromat', rel: 0.72, yld: '60–90 %',
    find: (c) => c.A.map((a, i) => i).filter(i => c.el(i) === 'N' && c.A[i].q > 0 && c.nb(i).filter(j => c.el(j) === 'O').length === 2 && c.nb(i).some(j => isAryl(c, j))),
    apply: (c, n) => { const ar = c.nb(n).find(j => isAryl(c, j)); return { pre: c.edit(x => { x.del(n, ar); }).filter(p => p.atoms.some(a => a.el === 'C')), reag: [{ n: 'HNO₃ (65 %)', eq: 1.1, role: 'Nitrierung' }, { n: 'H₂SO₄ (konz.)', eq: 2, role: 'Säure' }],
      cond: cond('H₂SO₄', '0–10 °C', '1–2 h', 'auf Eis giessen, Feststoff abfiltrieren'), note: 'Regioisomere (o/p bzw. m) möglich – trennen. Nitriersäure stark ätzend, exotherm.' }; } });
  R({ id: 'ar_brom', name: 'Aromaten-Bromierung', cls: 'Aromat', rel: 0.72, yld: '60–90 %',
    find: (c) => arSub(c, 'Br').concat(arSub(c, 'Cl')),
    apply: (c, x0) => { const ar = c.nb(x0)[0], act = actRing(c, ar), Br = c.el(x0) === 'Br'; return { pre: c.edit(x => { x.rm(x0); }), reag: act ? [{ n: Br ? 'NBS' : 'NCS', eq: 1.05, role: 'Halogenierung' }] : [{ n: Br ? 'Br₂' : 'NCS', eq: 1.05, role: 'Halogenierung' }, { n: 'FeBr₃', eq: 0.05, role: 'Lewis-Säure (kat.)' }],
      cond: act ? cond('MeCN oder DMF', 'RT', '1–4 h', 'mit Wasser fällen bzw. extrahieren') : cond('DCM', '0 °C → RT', '2–6 h', 'mit Na₂S₂O₃-Lsg. waschen'), note: act ? 'Aktivierter Ring: mild mit NBS/NCS.' : 'Br₂ ist sehr giftig/ätzend (Abzug).', compat: act ? 1 : 0.8 }; } });
  /* ---- Halogenalkane, Nitrile ---- */
  const alkX = (c, els) => c.A.map((a, i) => i).filter(i => els.includes(c.el(i)) && c.nb(i).length === 1 && c.sp3(c.nb(i)[0]));
  R({ id: 'rx_oh', name: 'Alkohol → Halogenalkan (PBr₃ / SOCl₂)', cls: 'Halogenalkan', rel: 0.82, yld: '70–90 %',
    find: (c) => alkX(c, ['Br', 'Cl']), apply: (c, i) => { const Br = c.el(i) === 'Br'; return { pre: c.edit(x => { x.setEl(i, 'O'); }), reag: [{ n: Br ? 'PBr₃' : 'SOCl₂', eq: Br ? 0.4 : 1.5, role: 'Halogenierung' }],
      cond: cond(Br ? 'Et₂O oder DCM' : 'DCM (kat. DMF)', '0 °C → RT', '2–4 h', 'auf Eis giessen, extrahieren'), note: 'Primäre/sekundäre Alkohole (SN2, Inversion).' }; } });
  R({ id: 'cn_sn2', name: 'Nitril aus Halogenalkan (NaCN)', cls: 'Nitril', rel: 0.75, yld: '70–90 %', flags: { toxic: true },
    find: (c) => c.A.map((a, i) => i).filter(i => c.el(i) === 'C' && c.A[i].nb.some(([j, o]) => o === 3 && c.el(j) === 'N') && c.nb(i).some(k => c.sp3(k))),
    apply: (c, i) => { const r = c.nb(i).find(k => c.sp3(k)); const n = c.A[i].nb.find(([j, o]) => o === 3)[0]; return { pre: c.edit(x => { x.rm(n); x.rm(i); x.add('Br', r); }), reag: [{ n: 'NaCN', eq: 1.2, role: 'Cyanid' }],
      cond: cond('DMSO', '60 °C', '2–6 h', 'mit Wasser verdünnen, extrahieren; Abwasser mit NaOCl entgiften'), note: 'Cyanid sehr giftig – vorgeschlagen, nicht empfohlen. Verlängert um ein C.' }; } });
  /* ---- Säurechlorid, Amid-Reduktion, Sulfonamid (1.56) ---- */
  R({ id: 'acyl_cl', name: 'Säurechlorid aus der Säure (SOCl₂)', cls: 'Säurechlorid', rel: 0.9, yld: '90–99 %',
    find: (c) => acylSites(c).map(i => ({ i, x: singles(c, i).find(j => c.el(j) === 'Cl') })).filter(e => e.x != null),
    apply: (c, e) => ({ pre: c.edit(x => { x.setEl(e.x, 'O'); }), reag: [{ n: 'SOCl₂', eq: 2, role: 'Chlorierung' }, { n: 'DMF (kat.)', eq: 0.02, role: 'Kat.' }],
      cond: cond('ohne LM oder Toluol', 'Rückfluss', '1–3 h', 'überschüssiges SOCl₂ abdestillieren, roh weiter'), note: 'SO₂ und HCl entweichen (Abzug, Gaswäsche). Feuchtigkeit ausschliessen.' }) });
  R({ id: 'am_amidred', name: 'Amid-Reduktion zum Amin (LiAlH₄)', cls: 'Amin', rel: 0.75, yld: '70–90 %', flags: { pyro: true },
    find: (c) => amineC(c).flatMap(n => c.nb(n).filter(r => c.sp3(r) && c.h(r) === 2 && !c.inRing(r) && c.nb(r).some(k => k !== n && c.el(k) === 'C')).map(r => ({ n, r }))),
    apply: (c, e) => ({ pre: c.edit(x => { x.add('O', e.r, 2); }), reag: [{ n: 'LiAlH₄', eq: 2, role: 'Reduktionsmittel' }],
      cond: cond('THF (trocken)', 'Rückfluss', '4–12 h', 'Fieser-Aufarbeitung, filtrieren, extrahieren'), note: 'LiAlH₄ heftig mit Wasser – vorgeschlagen, nicht empfohlen. Meist besser: reduktive Aminierung.' }) });
  R({ id: 'sulfonamid', name: 'Sulfonamid aus Sulfonylchlorid', cls: 'Sulfonamid', rel: 0.9, yld: '80–95 %',
    find: (c) => c.A.map((a, i) => i).filter(i => c.el(i) === 'S' && c.A[i].nb.filter(([j, o]) => o === 2 && c.el(j) === 'O').length === 2).flatMap(sx => c.nb(sx).filter(n => c.el(n) === 'N' && c.A[n].nb.every(([, o]) => o === 1) && !c.ring(sx, n)).map(n => ({ s: sx, n }))),
    apply: (c, e) => ({ pre: c.edit(x => { x.del(e.s, e.n); x.add('Cl', e.s); }), reag: [{ n: 'Pyridin', eq: 2, role: 'Base' }],
      cond: cond('DCM oder Pyridin', '0 °C → RT', '2–6 h', 'mit 1 M HCl waschen, einengen'), note: 'Wie Amid aus Säurechlorid; Tosyl-/Mesylchlorid für Schutz bzw. Aktivierung.' }) });
  /* ---- Ringe, Oxidationen, Schutz ---- */
  R({ id: 'da', name: 'Diels–Alder-Reaktion', cls: 'Cyclohexen', rel: 0.82, yld: '60–95 %',
    find: (c) => c.G.rings.filter(r => r.length === 6 && r.every(v => c.el(v) === 'C' && !c.arom(v))).flatMap(r => { const L = 6; const k = r.findIndex((v, q) => c.bo(v, r[(q + 1) % L]) === 2); if (k < 0 || r.filter((v, q) => c.bo(v, r[(q + 1) % L]) === 2).length !== 1) return []; return [{ C1: r[k], C2: r[(k + 1) % L], C3: r[(k + 2) % L], C4: r[(k + 3) % L], C5: r[(k + 4) % L], C6: r[(k + 5) % L] }]; }),
    apply: (c, e) => ({ pre: c.edit(x => { x.del(e.C3, e.C4); x.del(e.C5, e.C6); x.order(e.C1, e.C2, 1); x.order(e.C6, e.C1, 2); x.order(e.C2, e.C3, 2); x.order(e.C4, e.C5, 2); }), reag: [],
      cond: cond('Toluol oder ohne Lösungsmittel', '80–110 °C', '4–24 h', 'einengen, umkristallisieren'), note: 'Dien (s-cis) + Dienophil (am besten mit Elektronenzug, z. B. Acrylat, Maleinsäureanhydrid); endo-Produkt bevorzugt.' }) });
  R({ id: 'epox', name: 'Epoxidierung mit mCPBA', cls: 'Epoxid', rel: 0.88, yld: '70–95 %',
    find: (c) => c.G.rings.filter(r => r.length === 3 && r.filter(v => c.el(v) === 'O').length === 1 && r.filter(v => c.el(v) === 'C').length === 2),
    apply: (c, r) => { const O = r.find(v => c.el(v) === 'O'), [a, b] = r.filter(v => v !== O); return { pre: c.edit(x => { x.rm(O); x.order(a, b, 2); }), reag: [{ n: 'mCPBA (≈ 75 %)', eq: 1.2, role: 'Oxidationsmittel' }],
      cond: cond('DCM', '0 °C → RT', '2–6 h', 'mit Na₂SO₃- und NaHCO₃-Lsg. waschen'), note: 'Stereospezifisch (cis bleibt cis). Persäure – nicht erhitzen.' }; } });
  R({ id: 'diol_os', name: 'Dihydroxylierung (OsO₄/NMO)', cls: 'Diol', rel: 0.85, yld: '70–95 %', flags: { metal: true, toxic: true },
    find: (c) => { const out = []; c.A.forEach((a, i) => { for (const [j, o] of a.nb) if (j > i && o === 1 && c.sp3(i) && c.sp3(j) && c.nb(i).some(k => c.el(k) === 'O' && c.h(k)) && c.nb(j).some(k => c.el(k) === 'O' && c.h(k))) out.push({ a: i, b: j }); }); return out; },
    apply: (c, e) => ({ pre: c.edit(x => { x.rm(c.nb(e.a).find(k => c.el(k) === 'O' && c.h(k))); x.rm(c.nb(e.b).find(k => c.el(k) === 'O' && c.h(k))); x.order(e.a, e.b, 2); }), reag: [{ n: 'OsO₄ (kat.)', eq: 0.01, role: 'Katalysator' }, { n: 'NMO', eq: 1.5, role: 'Co-Oxidans' }],
      cond: cond('Aceton/H₂O', 'RT', '4–16 h', 'mit Na₂SO₃ löschen, extrahieren'), note: 'syn-Diol. OsO₄ sehr giftig – vorgeschlagen, nicht empfohlen; Alternative: KMnO₄ kalt/verdünnt (schlechtere Ausbeute).' }) });
  R({ id: 'acetal', name: 'Acetal-Schutz (Ethylenglykol)', cls: 'Acetal', rel: 0.88, yld: '80–95 %',
    find: (c) => c.G.rings.filter(r => r.length === 5 && r.filter(v => c.el(v) === 'O').length === 2).map(r => { const C = r.find(v => c.el(v) === 'C' && r.filter(w => c.el(w) === 'O').every(o => c.nb(v).includes(o))); return C != null ? { C, r } : null; }).filter(Boolean),
    apply: (c, e) => { const os = e.r.filter(v => c.el(v) === 'O'); return { pre: c.edit(x => { x.del(e.C, os[0]); x.del(e.C, os[1]); x.add('O', e.C, 2); }).filter(p => p.atoms.some(q => q.id === c.id[e.C])), reag: [{ n: 'Ethylenglykol', eq: 3, role: 'Diol' }, { n: 'TsOH·H₂O', eq: 0.05, role: 'Kat. (Säure)' }],
      cond: cond('Toluol (Dean-Stark)', 'Rückfluss', '4–12 h', 'mit NaHCO₃-Lsg. waschen, einengen'), note: 'Schützt Aldehyd/Keton gegen Basen, Grignard, Hydride; Abspaltung mit verd. Säure.' }; } });
  R({ id: 'imine', name: 'Imin-Bildung', cls: 'Imin', rel: 0.8, yld: '80–95 %',
    find: (c) => { const out = []; c.A.forEach((a, i) => { for (const [j, o] of a.nb) if (o === 2 && c.el(i) === 'C' && c.el(j) === 'N' && !c.arom(i) && !c.inRing(i) && c.nb(j).length === 2) out.push({ c: i, n: j }); }); return out; },
    apply: (c, e) => ({ pre: c.edit(x => { x.del(e.c, e.n); x.add('O', e.c, 2); }), reag: [{ n: 'MgSO₄', eq: 2, role: 'Trockenmittel' }],
      cond: cond('DCM oder MeOH', 'RT', '2–12 h', 'filtrieren, einengen (oft direkt weiter)'), note: 'Gleichgewicht – Wasser binden.' }) });
  R({ id: 'h2_ene', name: 'Hydrierung einer C=C-Bindung', cls: 'Alkan', rel: 0.85, yld: '90–99 %', flags: { metal: true },
    find: (c) => { const out = []; c.A.forEach((a, i) => { for (const [j, o] of a.nb) if (j > i && o === 1 && c.sp3(i) && c.sp3(j) && c.h(i) >= 1 && c.h(j) >= 1 && !c.inRing(i) && (c.nb(i).some(k => c.arom(k) || c.carbonyl(k)) || c.nb(j).some(k => c.arom(k) || c.carbonyl(k)))) out.push({ a: i, b: j }); }); return out.slice(0, 2); },
    apply: (c, e) => ({ pre: c.edit(x => { x.order(e.a, e.b, 2); }), reag: [{ n: 'Pd/C (10 %)', eq: 0.05, role: 'Katalysator' }, { n: 'H₂ (Ballon)', eq: 1, role: 'Wasserstoff' }],
      cond: cond('MeOH oder EtOAc', 'RT, 1 bar H₂', '2–16 h', 'über Celite filtrieren (Pd/C nicht trocken saugen – brennbar)'), note: 'Pd-Katalysator und H₂ – vorgeschlagen, nicht empfohlen.' }) });
})();

/* Hilfsfunktion: Atome auf der Seite von start, wenn die Bindung start–from gekappt ist (Graph-Indizes) */
ChemRxn._side = function (c, start, from) {
  const seen = new Set([start]), st = [start], out = [];
  while (st.length) { const v = st.pop(); for (const w of c.nb(v)) { if ((v === start && w === from) || seen.has(w)) continue; seen.add(w); st.push(w); out.push(w); } }
  return out;
};
if (typeof module !== 'undefined') module.exports = { ChemRxn };
