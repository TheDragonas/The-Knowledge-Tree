'use strict';
/* Chem-Draw: Strukturformeln zeichnen (angelehnt an ChemDraw), Summenformeln schreiben,
 * Molare Masse, Elementaranalyse, chirale C-Atome (*) mit R/S, E/Z.
 * Alles selbst geschrieben, keine Bibliotheken.
 * Auf der Seite: SVG-Bild in einem Feld; die Struktur liegt im Bild-Objekt (im.chem) und
 * lässt sich per Doppelklick wieder bearbeiten. */

/* ------------------------------------------------------------------ Daten */
/* Symbol, deutscher Name, Atommasse (IUPAC, 3 Nachkommastellen wie im Schul-PSE; [x] = Massenzahl des stabilsten Isotops) */
const CHEM_ELEMENTS = (
  'H,Wasserstoff,1.008;He,Helium,4.003;Li,Lithium,6.941;Be,Beryllium,9.012;B,Bor,10.811;C,Kohlenstoff,12.011;N,Stickstoff,14.007;O,Sauerstoff,15.999;' +
  'F,Fluor,18.998;Ne,Neon,20.180;Na,Natrium,22.990;Mg,Magnesium,24.305;Al,Aluminium,26.982;Si,Silicium,28.086;P,Phosphor,30.974;S,Schwefel,32.065;' +
  'Cl,Chlor,35.453;Ar,Argon,39.948;K,Kalium,39.098;Ca,Calcium,40.078;Sc,Scandium,44.956;Ti,Titan,47.867;V,Vanadium,50.942;Cr,Chrom,51.996;' +
  'Mn,Mangan,54.938;Fe,Eisen,55.845;Co,Cobalt,58.933;Ni,Nickel,58.693;Cu,Kupfer,63.546;Zn,Zink,65.380;Ga,Gallium,69.723;Ge,Germanium,72.630;' +
  'As,Arsen,74.922;Se,Selen,78.971;Br,Brom,79.904;Kr,Krypton,83.798;Rb,Rubidium,85.468;Sr,Strontium,87.620;Y,Yttrium,88.906;Zr,Zirconium,91.224;' +
  'Nb,Niob,92.906;Mo,Molybdän,95.950;Tc,Technetium,[98];Ru,Ruthenium,101.070;Rh,Rhodium,102.906;Pd,Palladium,106.420;Ag,Silber,107.868;Cd,Cadmium,112.414;' +
  'In,Indium,114.818;Sn,Zinn,118.710;Sb,Antimon,121.760;Te,Tellur,127.600;I,Iod,126.904;Xe,Xenon,131.293;Cs,Caesium,132.905;Ba,Barium,137.327;' +
  'La,Lanthan,138.905;Ce,Cer,140.116;Pr,Praseodym,140.908;Nd,Neodym,144.242;Pm,Promethium,[145];Sm,Samarium,150.360;Eu,Europium,151.964;Gd,Gadolinium,157.250;' +
  'Tb,Terbium,158.925;Dy,Dysprosium,162.500;Ho,Holmium,164.930;Er,Erbium,167.259;Tm,Thulium,168.934;Yb,Ytterbium,173.045;Lu,Lutetium,174.967;Hf,Hafnium,178.490;' +
  'Ta,Tantal,180.948;W,Wolfram,183.840;Re,Rhenium,186.207;Os,Osmium,190.230;Ir,Iridium,192.217;Pt,Platin,195.084;Au,Gold,196.967;Hg,Quecksilber,200.592;' +
  'Tl,Thallium,204.383;Pb,Blei,207.200;Bi,Bismut,208.980;Po,Polonium,[209];At,Astat,[210];Rn,Radon,[222];Fr,Francium,[223];Ra,Radium,[226];' +
  'Ac,Actinium,[227];Th,Thorium,232.038;Pa,Protactinium,231.036;U,Uran,238.029;Np,Neptunium,[237];Pu,Plutonium,[244];Am,Americium,[243];Cm,Curium,[247];' +
  'Bk,Berkelium,[247];Cf,Californium,[251];Es,Einsteinium,[252];Fm,Fermium,[257];Md,Mendelevium,[258];No,Nobelium,[259];Lr,Lawrencium,[266];' +
  'Rf,Rutherfordium,[267];Db,Dubnium,[268];Sg,Seaborgium,[269];Bh,Bohrium,[270];Hs,Hassium,[277];Mt,Meitnerium,[278];Ds,Darmstadtium,[281];' +
  'Rg,Roentgenium,[282];Cn,Copernicium,[285];Nh,Nihonium,[286];Fl,Flerovium,[289];Mc,Moscovium,[290];Lv,Livermorium,[293];Ts,Tenness,[294];Og,Oganesson,[294]'
).split(';').map((r, i) => {
  const [sym, name, w] = r.split(',');
  return { z: i + 1, sym, name, mass: parseFloat(w.replace(/[[\]]/g, '')), radio: w[0] === '[' };
});
const CHEM_BY_SYM = Object.fromEntries(CHEM_ELEMENTS.map(e => [e.sym, e]));
/* Deuterium als eigenes „Element“ in Summenformeln (D2O) */
CHEM_BY_SYM.D = { z: 1, sym: 'D', name: 'Deuterium', mass: 2.014, radio: false, iso: true };

/* Monoisotopische Massen (häufigstes Isotop) für die exakte Masse */
const CHEM_MONO = {
  H: 1.0078250, D: 2.0141018, He: 4.0026033, Li: 7.0160040, Be: 9.0121822, B: 11.0093054, C: 12, N: 14.0030740, O: 15.9949146, F: 18.9984032,
  Ne: 19.9924402, Na: 22.9897693, Mg: 23.9850419, Al: 26.9815384, Si: 27.9769265, P: 30.9737615, S: 31.9720707, Cl: 34.9688527, Ar: 39.9623831,
  K: 38.9637069, Ca: 39.9625912, Sc: 44.9559102, Ti: 47.9479471, V: 50.9439637, Cr: 51.9405119, Mn: 54.9380496, Fe: 55.9349421, Co: 58.9332002,
  Ni: 57.9353479, Cu: 62.9296011, Zn: 63.9291466, Ga: 68.9255810, Ge: 73.9211782, As: 74.9215964, Se: 79.9165218, Br: 78.9183376, Kr: 83.9115070,
  Rb: 84.9117893, Sr: 87.9056143, Y: 88.9058479, Zr: 89.9047037, Nb: 92.9063775, Mo: 97.9054078, Ru: 101.9043495, Rh: 102.9055040, Pd: 105.9034830,
  Ag: 106.9050930, Cd: 113.9033581, In: 114.9038780, Sn: 119.9021966, Sb: 120.9038180, Te: 129.9062228, I: 126.9044680, Xe: 131.9041545,
  Cs: 132.9054470, Ba: 137.9052320, W: 183.9509326, Os: 191.9614790, Ir: 192.9629240, Pt: 194.9647740, Au: 196.9665520, Hg: 201.9706260,
  Tl: 204.9744120, Pb: 207.9766360, Bi: 208.9803830,
};
/* Elektronegativität (Pauling) – nur gut belegte Werte */
const CHEM_EN = {
  H: 2.20, Li: 0.98, Be: 1.57, B: 2.04, C: 2.55, N: 3.04, O: 3.44, F: 3.98, Na: 0.93, Mg: 1.31, Al: 1.61, Si: 1.90, P: 2.19, S: 2.58, Cl: 3.16,
  K: 0.82, Ca: 1.00, Sc: 1.36, Ti: 1.54, V: 1.63, Cr: 1.66, Mn: 1.55, Fe: 1.83, Co: 1.88, Ni: 1.91, Cu: 1.90, Zn: 1.65, Ga: 1.81, Ge: 2.01,
  As: 2.18, Se: 2.55, Br: 2.96, Kr: 3.00, Rb: 0.82, Sr: 0.95, Y: 1.22, Zr: 1.33, Nb: 1.6, Mo: 2.16, Ru: 2.2, Rh: 2.28, Pd: 2.20, Ag: 1.93,
  Cd: 1.69, In: 1.78, Sn: 1.96, Sb: 2.05, Te: 2.1, I: 2.66, Xe: 2.6, Cs: 0.79, Ba: 0.89, W: 2.36, Pt: 2.28, Au: 2.54, Hg: 2.00, Bi: 2.02,
};
/* Elementkategorien (Farben im Periodensystem) */
const CHEM_CAT = (() => {
  const c = {};
  const set = (k, list) => { for (const s of list.split(' ')) c[s] = k; };
  set('nm', 'H C N O P S Se');
  set('hal', 'F Cl Br I At Ts');
  set('eg', 'He Ne Ar Kr Xe Rn Og');
  set('am', 'Li Na K Rb Cs Fr');
  set('eam', 'Be Mg Ca Sr Ba Ra');
  set('hm', 'B Si Ge As Sb Te');
  set('me', 'Al Ga In Sn Tl Pb Bi Po Nh Fl Mc Lv');
  for (const e of CHEM_ELEMENTS) {
    const z = e.z;
    if (z >= 57 && z <= 71) c[e.sym] = 'la';
    else if (z >= 89 && z <= 103) c[e.sym] = 'ac';
    else if (!c[e.sym]) c[e.sym] = 'tm';
  }
  return c;
})();
const CHEM_CAT_NAMES = { nm: 'Nichtmetall', hal: 'Halogen', eg: 'Edelgas', am: 'Alkalimetall', eam: 'Erdalkalimetall', hm: 'Halbmetall', me: 'Metall', tm: 'Übergangsmetall', la: 'Lanthanoid', ac: 'Actinoid' };
/* Lage im Periodensystem: [Periode, Gruppe] bzw. f-Block-Zeile 8/9 */
function chemPos(z) {
  if (z === 1) return [1, 1];
  if (z === 2) return [1, 18];
  const starts = [[3, 2], [11, 3], [19, 4], [37, 5], [55, 6], [87, 7]];
  for (let k = starts.length - 1; k >= 0; k--) {
    const [s, per] = starts[k];
    if (z < s) continue;
    const o = z - s;
    if (per <= 3) return [per, o < 2 ? o + 1 : o + 11];
    if (per <= 5) return [per, o + 1];
    if (o < 2) return [per, o + 1];
    if (o <= 16) return [per + 3, o + 1]; // La–Lu / Ac–Lr in der f-Zeile (Spalte 3–17)
    return [per, o - 13];
  }
  return [0, 0];
}

/* Valenzen für implizite Wasserstoffe */
const CHEM_VAL = {
  H: [1], B: [3], C: [4], N: [3], O: [2], F: [1], Si: [4], P: [3, 5], S: [2, 4, 6], Cl: [1, 3, 5, 7], Ge: [4],
  As: [3, 5], Se: [2, 4, 6], Br: [1, 3, 5, 7], Te: [2, 4, 6], I: [1, 3, 5, 7], Al: [3],
};
/* Farben nach Element (wie üblich: O rot, N blau …) */
const CHEM_COLORS = { O: '#e0201b', N: '#2b52d9', S: '#b39200', P: '#e07000', F: '#1f9e3a', Cl: '#1f9e3a', Br: '#a33a1c', I: '#8a1f9e', B: '#c06a3a', Si: '#7a6a3a' };

/* Kurzschreibweisen (wie ChemDraw-„Nicknames“): Fragment als Mini-SMILES, erstes Atom = Bindungsatom.
 * rev = Schreibweise, wenn die Bindung von rechts kommt. */
const CHEM_ABBR = {
  OH: { smi: 'O', rev: 'HO' }, SH: { smi: 'S', rev: 'HS' }, NH2: { smi: 'N', rev: 'H2N' }, NHMe: { smi: 'NC', rev: 'MeHN' },
  NMe2: { smi: 'N(C)C', rev: 'Me2N' }, NO2: { smi: '[N+](=O)[O-]', rev: 'O2N' }, CN: { smi: 'C#N', rev: 'NC' },
  COOH: { smi: 'C(=O)O', rev: 'HOOC' }, CO2H: { smi: 'C(=O)O', rev: 'HO2C' }, 'COO-': { smi: 'C(=O)[O-]', rev: '-OOC' },
  CHO: { smi: 'C=O', rev: 'OHC' }, CONH2: { smi: 'C(N)=O', rev: 'H2NOC' }, COOMe: { smi: 'C(=O)OC', rev: 'MeOOC' }, CO2Me: { smi: 'C(=O)OC', rev: 'MeO2C' },
  COCl: { smi: 'C(Cl)=O', rev: 'ClOC' }, Me: { smi: 'C', rev: 'Me' }, Et: { smi: 'CC', rev: 'Et' }, Pr: { smi: 'CCC', rev: 'Pr' }, nPr: { smi: 'CCC', rev: 'nPr' },
  iPr: { smi: 'C(C)C', rev: 'iPr' }, Bu: { smi: 'CCCC', rev: 'Bu' }, nBu: { smi: 'CCCC', rev: 'nBu' }, tBu: { smi: 'C(C)(C)C', rev: 'tBu' },
  Ph: { smi: 'C1=CC=CC=C1', rev: 'Ph' }, Bn: { smi: 'CC1=CC=CC=C1', rev: 'Bn' }, Ac: { smi: 'C(C)=O', rev: 'Ac' },
  OMe: { smi: 'OC', rev: 'MeO' }, OEt: { smi: 'OCC', rev: 'EtO' }, OAc: { smi: 'OC(C)=O', rev: 'AcO' }, OPh: { smi: 'OC1=CC=CC=C1', rev: 'PhO' },
  CF3: { smi: 'C(F)(F)F', rev: 'F3C' }, CCl3: { smi: 'C(Cl)(Cl)Cl', rev: 'Cl3C' }, CH3: { smi: 'C', rev: 'H3C' }, CH2: { smi: 'C', rev: 'H2C' },
  SO3H: { smi: 'S(=O)(=O)O', rev: 'HO3S' }, 'SO3-': { smi: 'S(=O)(=O)[O-]', rev: '-O3S' }, 'NH3+': { smi: '[NH3+]', rev: '+H3N' },
  'O-': { smi: '[O-]', rev: '-O' }, Ts: { smi: 'S(=O)(=O)C1=CC=C(C)C=C1', rev: 'Ts' }, OTs: { smi: 'OS(=O)(=O)C1=CC=C(C)C=C1', rev: 'TsO' },
  Boc: { smi: 'C(=O)OC(C)(C)C', rev: 'Boc' }, TMS: { smi: '[Si](C)(C)C', rev: 'TMS' }, Vinyl: { smi: 'C=C', rev: 'Vinyl' },
};
const CHEM_ABBR_LC = Object.fromEntries(Object.keys(CHEM_ABBR).map(k => [k.toLowerCase(), k]));

/* ------------------------------------------------------------------ Hilfen */
const chemNum = (n, d) => (Math.round(n * 10 ** d) / 10 ** d).toFixed(d);
/* Molare Massen immer mit 3 Nachkommastellen */
const chemM = (n) => chemNum(n, 3);
const chemEsc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const chemChargeTxt = (q) => !q ? '' : (Math.abs(q) > 1 ? Math.abs(q) : '') + (q > 0 ? '+' : '−');

const ChemFormula = {
  /* Unicode-Tief-/Hochzahlen und Minuszeichen vereinheitlichen */
  normalize(s) {
    const SUB = '₀₁₂₃₄₅₆₇₈₉', SUP = '⁰¹²³⁴⁵⁶⁷⁸⁹';
    s = String(s || '').trim().replace(/[₀-₉]/g, c => String(SUB.indexOf(c))).replace(/[−–]/g, '-');
    s = s.replace(/([⁰¹²³⁴⁵⁶⁷⁸⁹]*)([⁺⁻])$/, (m, d, sg) => '^' + [...d].map(c => SUP.indexOf(c)).join('') + (sg === '⁺' ? '+' : '-'));
    return s;
  },
  /* Summenformel lesen: C6H12O6, Ca(OH)2, CuSO4·5H2O, [Fe(CN)6]4-, SO4^2-, NH4+, Fe3+ … */
  parse(input) {
    let s = this.normalize(input);
    if (!s) throw new Error('Leere Formel');
    let charge = 0, m;
    if ((m = s.match(/\s*\^\s*\{?\s*(\d*)\s*([+-])\s*\}?\s*$/)) || (m = s.match(/\s+(\d*)([+-])$/))) {
      s = s.slice(0, m.index);
      charge = (m[1] ? +m[1] : 1) * (m[2] === '+' ? 1 : -1);
    } else if ((m = s.match(/([+-]+)$/))) {
      let body = s.slice(0, m.index), n = m[1].length;
      const dm = body.match(/(\d+)$/);
      if (dm && n === 1) {
        // Fe3+, Ca2+ (ein Element), [Fe(CN)6]4-: Ladungszahl; SO42-, PO43-: letzte Ziffer ist die Ladung
        if (/^[A-Z][a-z]?\d+$/.test(body) || body[body.length - dm[1].length - 1] === ']') { n = +dm[1]; body = body.slice(0, -dm[1].length); }
        else if (dm[1].length >= 2) { n = +dm[1].slice(-1); body = body.slice(0, -1); }
      }
      s = body;
      charge = n * (m[1][0] === '+' ? 1 : -1);
    }
    const counts = {};
    const parts = s.split(/\s*[·•*.]\s*/);
    const htmlParts = [];
    for (const part of parts) {
      if (!part) throw new Error('Leerer Teil in der Formel');
      let i = 0;
      const pm = part.match(/^(\d+)\s*/);
      let coef = 1, html = '';
      if (pm) { coef = +pm[1]; i = pm[0].length; html += pm[1] + (/\s/.test(pm[0]) ? ' ' : ''); }
      const num = () => { let d = ''; while (i < part.length && /\d/.test(part[i])) d += part[i++]; return d ? +d : 0; };
      const seq = (close) => {
        const c = {}; let h = '';
        while (i < part.length) {
          const ch = part[i];
          if (ch === ')' || ch === ']') {
            if (ch !== close) throw new Error('Klammer «' + ch + '» passt nicht');
            i++;
            return { c, h };
          }
          if (ch === '(' || ch === '[') {
            i++;
            const inner = seq(ch === '(' ? ')' : ']');
            const n = num();
            for (const [k, v] of Object.entries(inner.c)) c[k] = (c[k] || 0) + v * (n || 1);
            h += ch + inner.h + (ch === '(' ? ')' : ']') + (n ? '<sub>' + n + '</sub>' : '');
            continue;
          }
          if (/[A-Z]/.test(ch)) {
            let sym = ch;
            i++;
            if (/[a-z]/.test(part[i] || '') && CHEM_BY_SYM[ch + part[i]]) sym += part[i++];
            if (!CHEM_BY_SYM[sym]) throw new Error('Unbekanntes Element «' + sym + (/[a-z]/.test(part[i] || '') ? part[i] : '') + '»');
            if (/[a-z]/.test(part[i] || '')) throw new Error('Unbekanntes Element «' + sym + part[i] + '»');
            const n = num();
            c[sym] = (c[sym] || 0) + (n || 1);
            h += sym + (n ? '<sub>' + n + '</sub>' : '');
            continue;
          }
          if (/\s/.test(ch)) { i++; continue; }
          throw new Error('Unerwartetes Zeichen «' + ch + '»');
        }
        if (close) throw new Error('Klammer nicht geschlossen');
        return { c, h };
      };
      const r = seq(null);
      if (!Object.keys(r.c).length) throw new Error('Keine Elemente gefunden');
      for (const [k, v] of Object.entries(r.c)) counts[k] = (counts[k] || 0) + v * coef;
      htmlParts.push(html + r.h);
    }
    const html = htmlParts.join('·') + (charge ? '<sup>' + chemChargeTxt(charge) + '</sup>' : '');
    return { counts, charge, html };
  },
  /* Hill-Reihenfolge: C, H, dann alphabetisch (ohne C: alles alphabetisch) */
  hill(counts, charge = 0) {
    const keys = Object.keys(counts).filter(k => counts[k] > 0);
    let order;
    if (counts.C) order = ['C', ...(counts.H ? ['H'] : []), ...keys.filter(k => k !== 'C' && k !== 'H').sort()];
    else order = keys.sort();
    const text = order.map(k => k + (counts[k] > 1 ? counts[k] : '')).join('') + (charge ? chemChargeTxt(charge) : '');
    const html = order.map(k => k + (counts[k] > 1 ? '<sub>' + counts[k] + '</sub>' : '')).join('') + (charge ? '<sup>' + chemChargeTxt(charge) + '</sup>' : '');
    return { text, html, order };
  },
  mass(counts) {
    let m = 0;
    for (const [k, v] of Object.entries(counts)) m += (CHEM_BY_SYM[k] ? CHEM_BY_SYM[k].mass : 0) * v;
    return m;
  },
  exact(counts) {
    let m = 0;
    for (const [k, v] of Object.entries(counts)) { if (CHEM_MONO[k] == null) return null; m += CHEM_MONO[k] * v; }
    return m;
  },
  composition(counts) {
    const M = this.mass(counts);
    if (!M) return [];
    return this.hill(counts).order.map(k => ({ sym: k, n: counts[k], pct: 100 * CHEM_BY_SYM[k].mass * counts[k] / M }));
  },
  radioactive(counts) { return Object.keys(counts).some(k => CHEM_BY_SYM[k] && CHEM_BY_SYM[k].radio); },
  /* Text (auch Reaktionsgleichungen) chemisch formatieren: 2 H2 + O2 -> 2 H2O  =>  2 H₂ + O₂ → 2 H₂O */
  formatText(text) {
    const ARROWS = { '->': '→', '-->': '→', '<-': '←', '<->': '↔', '<=>': '⇌', '⇌': '⇌', '→': '→', '⇄': '⇄', '↔': '↔', '=': '=', '+': '+' };
    const toks = String(text).split(/(\s+)/);
    let ok = 0;
    const out = toks.map(t => {
      if (!t) return '';
      if (/^\s+$/.test(t)) return t.replace(/\n/g, ' ');
      if (ARROWS[t]) return ARROWS[t];
      // Zustandsangaben (aq), (s), (l), (g) anhängen lassen
      const st = t.match(/^(.*?)(\((?:aq|s|l|g|fl)\))$/);
      const core = st ? st[1] : t;
      if (!core) return chemEsc(t);
      try {
        const r = this.parse(core);
        ok++;
        return r.html + (st ? '<sub>' + chemEsc(st[2]) + '</sub>' : '');
      } catch (e) { return chemEsc(t); }
    }).join('');
    return ok ? out : null;
  },
};

/* ------------------------------------------------------------------ Molekül-Modell
 * mol = { atoms: [{id, el, x, y, q, ab}], bonds: [{id, a, b, o, s, ds}], nid }
 *   q = Ladung, ab = Kurzschreibweise (OH, COOH, Ph …)
 *   o = Bindungsordnung 1–3, s = '' | 'w' (Keil) | 'h' (Strichkeil) | 'y' (Wellenlinie); Keil/Strichkeil beginnen bei a
 *   ds = Lage der Doppelbindung: undefined automatisch, 1 / -1 Seite, 0 zentriert
 * Koordinaten in Welt-Einheiten, Bindungslänge BL. */
const BL = 30;

const ChemMol = {
  empty() { return { atoms: [], bonds: [], nid: 1 }; },
  clone(m) { return JSON.parse(JSON.stringify(m)); },
  index(m) {
    const byId = new Map(), adj = new Map(), bondById = new Map();
    for (const a of m.atoms) { byId.set(a.id, a); adj.set(a.id, []); }
    for (const b of m.bonds) {
      bondById.set(b.id, b);
      if (adj.has(b.a)) adj.get(b.a).push({ nb: b.b, bond: b });
      if (adj.has(b.b)) adj.get(b.b).push({ nb: b.a, bond: b });
    }
    return { byId, adj, bondById };
  },
  bondSum(idx, id) { let s = 0; for (const { bond } of idx.adj.get(id) || []) s += bond.o; return s; },
  /* implizite Wasserstoffe nach Standardvalenz (mit Ladung) */
  implicitH(el, q, bondSum) {
    const base = CHEM_VAL[el];
    if (!base) return 0;
    if (el === 'H') return q ? 0 : Math.max(0, 1 - bondSum);
    const adj = (el === 'C' || el === 'Si' || el === 'Ge') ? -Math.abs(q) : (el === 'B' || el === 'Al') ? -q : q;
    for (const v of base) { const vv = v + adj; if (vv >= bondSum) return vv - bondSum; }
    return 0;
  },
  maxValence(el, q) {
    const base = CHEM_VAL[el];
    if (!base) return Infinity;
    if (el === 'H') return q ? 0 : 1;
    const top = Math.max(...base);
    if (el === 'C' || el === 'Si' || el === 'Ge') return top - Math.abs(q);
    if (el === 'B' || el === 'Al') return top - q;
    // hypervalente Anionen der 3.–5. Periode (PF₆⁻, SiF₆²⁻, SbF₆⁻ – 1.53)
    if (q < 0 && ['P', 'As', 'Sb', 'Si', 'Ge', 'Sn'].includes(el)) return top - q;
    return top + q;
  },
  hCount(idx, a) { return a.ab ? 0 : Math.max(0, this.implicitH(a.el, a.q || 0, this.bondSum(idx, a.id)) - (a.hd || 0)); },

  /* Mini-SMILES für Kurzschreibweisen (Kette, Äste, Ringschlüsse, [NH3+]) */
  _frag: {},
  fragment(key) {
    if (this._frag[key]) return this._frag[key];
    const smi = CHEM_ABBR[key].smi;
    const atoms = [], bonds = [], stack = [], rings = {};
    let i = 0, prev = -1, bo = 1;
    while (i < smi.length) {
      const c = smi[i];
      if (c === '(') { stack.push(prev); i++; continue; }
      if (c === ')') { prev = stack.pop(); i++; continue; }
      if (c === '=') { bo = 2; i++; continue; }
      if (c === '#') { bo = 3; i++; continue; }
      if (/\d/.test(c)) {
        const r = rings[c];
        if (r) { bonds.push([r.a, prev, Math.max(bo, r.o)]); delete rings[c]; } else rings[c] = { a: prev, o: bo };
        bo = 1; i++; continue;
      }
      let a;
      if (c === '[') {
        const j = smi.indexOf(']', i);
        const mm = smi.slice(i + 1, j).match(/^([A-Z][a-z]?)(H(\d*))?([+-])?(\d*)$/);
        i = j + 1;
        a = { el: mm[1], h: mm[2] ? (mm[3] ? +mm[3] : 1) : 0, q: mm[4] ? (mm[4] === '+' ? 1 : -1) * (mm[5] ? +mm[5] : 1) : 0 };
      } else {
        let el = c;
        if ((c === 'C' && smi[i + 1] === 'l') || (c === 'B' && smi[i + 1] === 'r')) { el += smi[i + 1]; i++; }
        i++;
        a = { el, h: null, q: 0 };
      }
      atoms.push(a);
      if (prev >= 0) bonds.push([prev, atoms.length - 1, bo]);
      bo = 1; prev = atoms.length - 1;
    }
    return (this._frag[key] = { atoms, bonds });
  },

  /* Rechen-Graph: Kurzschreibweisen aufgelöst, H gezählt */
  expand(m) {
    const idx = this.index(m);
    const G = { n: 0, el: [], z: [], q: [], h: [], x: [], y: [], src: [], adj: [], plainH: [], of: new Map() };
    const add = (el, q, x, y, src) => {
      const i = G.n++;
      G.el.push(el); G.z.push(CHEM_BY_SYM[el] ? CHEM_BY_SYM[el].z : 0); G.q.push(q || 0); G.h.push(0);
      G.x.push(x); G.y.push(y); G.src.push(src); G.adj.push([]); G.plainH.push(false);
      return i;
    };
    const link = (i, j, o) => { G.adj[i].push([j, o]); G.adj[j].push([i, o]); };
    const pending = [];
    for (const a of m.atoms) {
      if (a.ab && CHEM_ABBR[a.ab]) {
        const f = this.fragment(a.ab);
        const map = f.atoms.map((fa, k) => add(fa.el, fa.q, a.x, a.y, k === 0 ? a.id : null));
        for (const [p, q, o] of f.bonds) link(map[p], map[q], o);
        f.atoms.forEach((fa, k) => pending.push({ i: map[k], fixed: fa.h }));
        G.of.set(a.id, map[0]);
      } else {
        const i = add(a.el, a.q, a.x, a.y, a.id);
        G.of.set(a.id, i);
        pending.push({ i, fixed: null, hd: a.hd || 0 });   // hd (1.49): in der Lewis-Schreibweise entfernte H
      }
    }
    for (const b of m.bonds) {
      const i = G.of.get(b.a), j = G.of.get(b.b);
      if (i != null && j != null) link(i, j, b.o);
    }
    for (const { i, fixed, hd } of pending) {
      const sum = G.adj[i].reduce((s, [, o]) => s + o, 0);
      G.h[i] = fixed != null ? fixed : Math.max(0, this.implicitH(G.el[i], G.q[i], sum) - (hd || 0));
    }
    for (let i = 0; i < G.n; i++) G.plainH[i] = G.el[i] === 'H' && !G.q[i] && G.adj[i].length === 1 && G.el[G.adj[i][0][0]] !== 'H' && G.adj[i][0][1] === 1;
    G.idx = idx;
    return G;
  },
  effH(G, i) { let h = G.h[i]; for (const [n] of G.adj[i]) if (G.plainH[n]) h++; return h; },

  /* kleinster Ring pro Bindung (für die Lage von Doppelbindungen) */
  bondRings(m, idx) {
    idx = idx || this.index(m);
    const res = new Map();
    for (const b of m.bonds) {
      const prev = new Map([[b.a, null]]);
      const q = [b.a];
      let found = false;
      while (q.length && !found) {
        const cur = q.shift();
        for (const { nb, bond } of idx.adj.get(cur)) {
          if (bond === b || prev.has(nb)) continue;
          prev.set(nb, cur);
          if (nb === b.b) { found = true; break; }
          q.push(nb);
        }
      }
      if (!found) continue;
      const ring = [];
      for (let c = b.b; c != null; c = prev.get(c)) ring.push(c);
      if (ring.length <= 12) res.set(b.id, ring);
    }
    return res;
  },

  /* ---------------------------------------------- Stereochemie */
  stereo(m, G) {
    G = G || this.expand(m);
    const idx = G.idx;
    const D = Math.min(G.n + 2, 60);
    const intern = new Map(), memo = new Map();
    const lab = (i) => G.z[i] + ':' + G.q[i] + ':' + this.effH(G, i);
    const cid = (a, from, d) => {
      const key = a + '|' + from + '|' + d;
      const hit = memo.get(key);
      if (hit != null) return hit;
      let s = lab(a);
      if (d > 0) {
        const kids = [];
        for (const [n, o] of G.adj[a]) if (n !== from && !G.plainH[n]) kids.push(o + '>' + cid(n, a, d - 1));
        kids.sort();
        s += '[' + kids.join(',') + ']';
      }
      let id = intern.get(s);
      if (id == null) { id = intern.size; intern.set(s, id); }
      memo.set(key, id);
      return id;
    };
    /* CIP-Regel 1a: hierarchischer Digraph, Sphäre für Sphäre */
    const onPath = (dn, n) => { for (let p = dn; p; p = p.p) if (p.a === n) return true; return false; };
    const kidsOf = (dn) => {
      if (dn.k) return dn.k;
      const out = [];
      if (dn.a >= 0) {
        const pa = dn.p ? dn.p.a : -1;
        for (const [n, o] of G.adj[dn.a]) {
          if (n === pa) { for (let k = 1; k < o; k++) out.push({ z: G.z[n], a: -1, p: dn }); continue; }
          if (G.plainH[n]) { out.push({ z: 1, a: -1, p: dn }); continue; }
          if (onPath(dn, n)) { for (let k = 0; k < o; k++) out.push({ z: G.z[n], a: -1, p: dn }); continue; }
          out.push({ z: G.z[n], a: n, p: dn });
          for (let k = 1; k < o; k++) out.push({ z: G.z[n], a: -1, p: dn });
        }
        for (let k = 0; k < G.h[dn.a]; k++) out.push({ z: 1, a: -1, p: dn });
      }
      const sig = (x) => x.a < 0 ? [] : kidsOf(x).map(y => y.z);
      out.sort((x, y) => {
        if (x.z !== y.z) return y.z - x.z;
        const s1 = sig(x), s2 = sig(y);
        for (let i = 0; i < Math.max(s1.length, s2.length); i++) { const d = (s2[i] || 0) - (s1[i] || 0); if (d) return d; }
        return 0;
      });
      return (dn.k = out);
    };
    const cmp = (r1, r2) => {
      if (r1.z !== r2.z) return r1.z - r2.z;
      let F1 = [r1], F2 = [r2];
      for (let d = 0; d < 40; d++) {
        const K1 = F1.map(kidsOf), K2 = F2.map(kidsOf);
        for (let i = 0; i < Math.max(K1.length, K2.length); i++) {
          const l1 = K1[i] || [], l2 = K2[i] || [];
          for (let j = 0; j < Math.max(l1.length, l2.length); j++) {
            const z1 = l1[j] ? l1[j].z : 0, z2 = l2[j] ? l2[j].z : 0;
            if (z1 !== z2) return z1 - z2;
          }
        }
        F1 = K1.flat(); F2 = K2.flat();
        if (!F1.length && !F2.length) return 0;
        if (F1.length > 4000 || F2.length > 4000) return 0;
      }
      return 0;
    };
    const bondBetween = (i, j) => {
      const a = G.src[i], b = G.src[j];
      if (a == null || b == null) return null;
      for (const { nb, bond } of idx.adj.get(a) || []) if (nb === b) return bond;
      return null;
    };
    /* Substituenten eines Zentrums (ohne excl), nach CIP sortiert */
    const ranked = (c, excl) => {
      const cn = { z: G.z[c], a: c, p: null };
      const subs = [];
      for (const [n] of G.adj[c]) {
        if (n === excl) continue;
        subs.push({ n, r: G.plainH[n] ? { z: 1, a: -1, p: cn } : { z: G.z[n], a: n, p: cn } });
      }
      for (let k = 0; k < G.h[c]; k++) subs.push({ n: -1, r: { z: 1, a: -1, p: cn } });
      subs.sort((s1, s2) => cmp(s2.r, s1.r));
      let tie = false;
      for (let k = 1; k < subs.length; k++) if (cmp(subs[k - 1].r, subs[k].r) === 0) tie = true;
      return { subs, tie };
    };
    const centers = [];
    for (let c = 0; c < G.n; c++) {
      if (G.el[c] !== 'C' || G.src[c] == null) continue;
      const atom = idx.byId.get(G.src[c]);
      if (!atom || atom.ab) continue;
      if (G.adj[c].some(([, o]) => o !== 1)) continue;
      const heavy = G.adj[c].filter(([n]) => !G.plainH[n]).map(([n]) => n);
      const nH = this.effH(G, c);
      if (heavy.length + nH !== 4 || nH > 1) continue;
      const ids = heavy.map(n => cid(n, c, D));
      if (new Set(ids).size !== heavy.length) continue;
      /* Chiralitätssinn aus Keilen */
      let rs = null;
      const { subs, tie } = ranked(c, -1);
      if (!tie) {
        let anyZ = false, wavy = false;
        const vec = subs.map(s => {
          if (s.n < 0) return null;
          let dx = (G.x[s.n] - G.x[c]) / BL, dy = -(G.y[s.n] - G.y[c]) / BL;
          const l = Math.hypot(dx, dy) || 1;
          dx /= l; dy /= l;
          let dz = 0;
          const b = bondBetween(c, s.n);
          if (b && b.a === G.src[c]) { if (b.s === 'w') dz = 1; else if (b.s === 'h') dz = -1; else if (b.s === 'y') wavy = true; }
          if (dz) anyZ = true;
          return [dx, dy, dz];
        });
        const miss = vec.findIndex(v => !v);
        if (miss >= 0) {
          const others = vec.filter(Boolean);
          let sx = 0, sy = 0, sz = 0;
          for (const v of others) { sx += v[0]; sy += v[1]; sz += v[2]; }
          const l = Math.hypot(sx, sy);
          vec[miss] = [l > 0.15 ? -sx / l : 0, l > 0.15 ? -sy / l : 0, sz > 0 ? -1 : sz < 0 ? 1 : 0];
        }
        if (anyZ && !wavy) {
          const [v1, v2, v3, v4] = vec;
          const a = [v1[0] - v4[0], v1[1] - v4[1], v1[2] - v4[2]];
          const b = [v2[0] - v4[0], v2[1] - v4[1], v2[2] - v4[2]];
          const d = [v3[0] - v4[0], v3[1] - v4[1], v3[2] - v4[2]];
          const det = a[0] * (b[1] * d[2] - b[2] * d[1]) - a[1] * (b[0] * d[2] - b[2] * d[0]) + a[2] * (b[0] * d[1] - b[1] * d[0]);
          if (Math.abs(det) > 1e-3) rs = det < 0 ? 'R' : 'S';
        }
      }
      centers.push({ id: G.src[c], rs });
    }
    /* E/Z an Doppelbindungen (nicht in kleinen Ringen) */
    const ez = [];
    const rings = this.bondRings(m, idx);
    for (const b of m.bonds) {
      if (b.o !== 2) continue;
      const A = idx.byId.get(b.a), Bt = idx.byId.get(b.b);
      if (!A || !Bt || A.ab || Bt.ab) continue;
      const r = rings.get(b.id);
      if (r && r.length < 8) continue;
      const ga = G.of.get(b.a), gb = G.of.get(b.b);
      if (G.adj[ga].some(([n, o]) => n !== gb && o > 1) || G.adj[gb].some(([n, o]) => n !== ga && o > 1)) continue;
      const top = (c, other) => {
        const { subs, tie } = ranked(c, other);
        if (!subs.length || (subs.length > 1 && tie)) return null;
        if (subs.length === 1 && subs[0].n < 0) return null;
        if (subs.length > 1 && subs[0].n < 0) return null;
        return subs[0].n;
      };
      const ta = top(ga, gb), tb = top(gb, ga);
      if (ta == null || tb == null) continue;
      const ux = G.x[gb] - G.x[ga], uy = G.y[gb] - G.y[ga];
      const c1 = ux * (G.y[ta] - G.y[ga]) - uy * (G.x[ta] - G.x[ga]);
      const c2 = ux * (G.y[tb] - G.y[gb]) - uy * (G.x[tb] - G.x[gb]);
      if (Math.abs(c1) < 1 || Math.abs(c2) < 1) continue;
      ez.push({ id: b.id, ez: Math.sign(c1) === Math.sign(c2) ? 'Z' : 'E' });
    }
    return { centers, ez };
  },

  /* ---------------------------------------------- Auswertung */
  analyze(m) {
    const G = this.expand(m);
    const counts = {};
    let charge = 0;
    for (let i = 0; i < G.n; i++) {
      counts[G.el[i]] = (counts[G.el[i]] || 0) + 1;
      if (G.h[i]) counts.H = (counts.H || 0) + G.h[i];
      charge += G.q[i];
    }
    /* Fragmente (z. B. Salze) */
    const seen = new Array(G.n).fill(false), frags = [];
    for (let s = 0; s < G.n; s++) {
      if (seen[s]) continue;
      const c = {}, st = [s];
      let q = 0;
      seen[s] = true;
      while (st.length) {
        const i = st.pop();
        c[G.el[i]] = (c[G.el[i]] || 0) + 1;
        if (G.h[i]) c.H = (c.H || 0) + G.h[i];
        q += G.q[i];
        for (const [n] of G.adj[i]) if (!seen[n]) { seen[n] = true; st.push(n); }
      }
      frags.push({ counts: c, charge: q });
    }
    /* Valenzfehler */
    const valErr = [];
    for (const a of m.atoms) {
      if (a.ab) continue;
      if (this.bondSum(G.idx, a.id) > this.maxValence(a.el, a.q || 0)) valErr.push(a.id);
    }
    let st = { centers: [], ez: [] };
    try { st = this.stereo(m, G); } catch (e) { console.warn('Stereo', e); }
    const hill = ChemFormula.hill(counts, charge);
    return {
      empty: !G.n, counts, charge, hill, mass: ChemFormula.mass(counts), exact: ChemFormula.exact(counts),
      comp: ChemFormula.composition(counts), frags, valErr, centers: st.centers, ez: st.ez,
      radio: ChemFormula.radioactive(counts),
    };
  },
};

/* ------------------------------------------------------------------ Darstellung (SVG) */
const ChemRender = {
  FONT: 'Arial, Helvetica, "Liberation Sans", sans-serif',
  FS: 15, LW: 1.5, SP: 5.4, WW: 4.2, MARK: '#c2185b',
  _mc: null, _mcache: new Map(),
  width(t, size) {
    const key = size + '|' + t;
    let w = this._mcache.get(key);
    if (w != null) return w;
    try {
      if (!this._mc) this._mc = document.createElement('canvas').getContext('2d');
      this._mc.font = size + 'px ' + this.FONT;
      w = this._mc.measureText(t).width;
    } catch (e) { w = t.length * size * 0.6; }
    this._mcache.set(key, w);
    return w;
  },
  /* Text in Läufe zerlegen: Ziffern tief, +/− hoch (bei Kurzschreibweisen und Summenformeln) */
  runs(str) {
    const out = [];
    const s = String(str);
    for (let i = 0; i < s.length; i++) {
      const c = s[i];
      let k = 'n';
      if (/\d/.test(c)) k = 'sub';
      else if (c === '+' || c === '-' || c === '−') k = 'sup';
      const t = c === '-' ? '−' : c;
      if (out.length && out[out.length - 1].k === k) out[out.length - 1].t += t; else out.push({ t, k });
    }
    return out;
  },
  /* Läufe ab x (Grundlinie y) setzen -> tspans + Rechtecke */
  place(runs, x, y, fs, color, style) {
    let html = '';
    const rects = [];
    for (const r of runs) {
      const size = r.k === 'n' ? fs : fs * 0.7;
      const dy = r.k === 'sub' ? fs * 0.3 : r.k === 'sup' ? -fs * 0.45 : 0;
      const w = this.width(r.t, size);
      html += `<tspan x="${x.toFixed(2)}" y="${(y + dy).toFixed(2)}" font-size="${size.toFixed(2)}">${chemEsc(r.t)}</tspan>`;
      rects.push({ x0: x, x1: x + w, y0: y + dy - size * 0.74, y1: y + dy + size * 0.06 });
      x += w;
    }
    return { html: html ? `<text font-family='${this.FONT}'${color ? ` fill="${color}"` : ''}${style || ''}>${html}</text>` : '', rects, x };
  },
  hillRuns(counts, charge) {
    const out = [];
    for (const k of ChemFormula.hill(counts).order) {
      out.push({ t: k, k: 'n' });
      if (counts[k] > 1) out.push({ t: String(counts[k]), k: 'sub' });
    }
    if (charge) out.push({ t: chemChargeTxt(charge), k: 'sup' });
    return out;
  },
  runsWidth(runs, fs) { return runs.reduce((s, r) => s + this.width(r.t, r.k === 'n' ? fs : fs * 0.7), 0); },
  /* freie Richtung an einem Atom (Mitte der grössten Lücke) */
  freeDir(dirs, avoid) {
    const angs = [...dirs, ...(avoid || [])].map(d => Math.atan2(d[1], d[0])).sort((a, b) => a - b);
    if (!angs.length) return [Math.cos(-Math.PI / 4), Math.sin(-Math.PI / 4)];
    if (angs.length === 1) { const a = angs[0] + Math.PI; return [Math.cos(a), Math.sin(a)]; }
    let best = -1, ang = 0;
    for (let i = 0; i < angs.length; i++) {
      const a = angs[i], b = i + 1 < angs.length ? angs[i + 1] : angs[0] + 2 * Math.PI;
      if (b - a > best + 1e-6) { best = b - a; ang = (a + b) / 2; }
    }
    return [Math.cos(ang), Math.sin(ang)];
  },
  /* Schnittparameter einer Strecke mit Rechtecken (Liang-Barsky) */
  clip(px, py, qx, qy, rects, m) {
    let cut = 0;
    const dx = qx - px, dy = qy - py;
    for (const r of rects || []) {
      let t0 = 0, t1 = 1, ok = true;
      const x0 = r.x0 - m, x1 = r.x1 + m, y0 = r.y0 - m, y1 = r.y1 + m;
      for (const [p, q] of [[-dx, px - x0], [dx, x1 - px], [-dy, py - y0], [dy, y1 - py]]) {
        if (Math.abs(p) < 1e-9) { if (q < 0) { ok = false; break; } continue; }
        const t = q / p;
        if (p < 0) { if (t > t1) { ok = false; break; } if (t > t0) t0 = t; }
        else { if (t < t0) { ok = false; break; } if (t < t1) t1 = t; }
      }
      if (ok && t0 <= 0.5 && t1 > cut) cut = Math.min(t1, 0.48);
    }
    return cut;
  },

  /* Molekül zeichnen. opts: color, carbons, stars, rs, ez, caption. an = ChemMol.analyze(m) */
  draw(m, opts = {}, an) {
    an = an || ChemMol.analyze(m);
    // andere Darstellungen (Lewis, Bohr, Orbitale, 3D – seit 1.28, chem-models.js)
    if (opts.model && opts.model !== 'skelett' && typeof ChemModels !== 'undefined') return ChemModels.draw(m, opts, an);
    const idx = ChemMol.index(m);
    const FS = this.FS, out = [], lbl = [], marks = [];
    const labels = new Map();
    let bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity;
    const grow = (x0, y0, x1, y1) => { bx0 = Math.min(bx0, x0); by0 = Math.min(by0, y0); bx1 = Math.max(bx1, x1); by1 = Math.max(by1, y1); };
    const colorOf = (el) => opts.color === false ? '#000' : (CHEM_COLORS[el] || '#000');
    const dirsOf = (a) => (idx.adj.get(a.id) || []).map(({ nb }) => {
      const o = idx.byId.get(nb);
      const dx = o.x - a.x, dy = o.y - a.y, l = Math.hypot(dx, dy) || 1;
      return [dx / l, dy / l];
    });
    /* 1. Beschriftungen */
    for (const a of m.atoms) {
      const dirs = dirsOf(a);
      grow(a.x - 3, a.y - 3, a.x + 3, a.y + 3);
      const deg = dirs.length;
      const base = a.y + FS * 0.36;
      const col = colorOf(a.ab ? (CHEM_ABBR[a.ab] ? ChemMol.fragment(a.ab).atoms[0].el : 'C') : a.el);
      const meanX = deg ? dirs.reduce((s, d) => s + d[0], 0) / deg : 0;
      if (a.ab) {
        const rev = deg > 0 && meanX > 0.2;
        const txt = rev ? (CHEM_ABBR[a.ab] ? CHEM_ABBR[a.ab].rev : a.ab) : a.ab;
        const rs = this.runs(txt);
        const tot = this.runsWidth(rs, FS);
        const first = rs[0] ? this.width(rs[0].t[0], rs[0].k === 'n' ? FS : FS * 0.7) : 0;
        const lastR = rs[rs.length - 1];
        const last = lastR ? this.width(lastR.t[lastR.t.length - 1], lastR.k === 'n' ? FS : FS * 0.7) : 0;
        const x0 = rev ? a.x + last / 2 - tot : a.x - first / 2;
        const p = this.place(rs, x0, base, FS, col);
        lbl.push(p.html);
        labels.set(a.id, p.rects);
        continue;
      }
      const h = ChemMol.hCount(idx, a);
      const show = a.el !== 'C' || opts.carbons || deg === 0 || (a.q && deg <= 1);
      // Ladung und Radikal-Punkte (1.53: abgespaltenes H· bleibt so in Keil/Strich sichtbar)
      const qrad = (a.q ? chemChargeTxt(a.q) : '') + (a.rad ? '•'.repeat(Math.min(3, a.rad)) : '');
      if (!show) {
        if (qrad) {
          const d = this.freeDir(dirs);
          const t = qrad;
          const cx = a.x + d[0] * 9, cy = a.y + d[1] * 9;
          const w = this.width(t, FS * 0.8);
          lbl.push(`<text font-family='${this.FONT}' font-size="${(FS * 0.8).toFixed(2)}" x="${(cx - w / 2).toFixed(2)}" y="${(cy + FS * 0.28).toFixed(2)}">${t}</text>`);
          grow(cx - w / 2, cy - FS * 0.5, cx + w / 2, cy + FS * 0.5);
        }
        continue;
      }
      const symW = this.width(a.el, FS);
      const x0 = a.x - symW / 2;
      const chg = qrad ? [{ t: qrad, k: 'sup' }] : [];
      const hr = h ? [{ t: 'H', k: 'n' }, ...(h > 1 ? [{ t: String(h), k: 'sub' }] : [])] : [];
      /* Lage der H: rechts, links, unten, oben – wo am meisten Platz ist */
      let pos = 'r';
      // einzelnes Atom: H2O, H2S, HCl (H vorne) – aber NH3, CH4, OH-
      if (hr.length && !deg && !a.q && ['O', 'S', 'Se', 'Te', 'F', 'Cl', 'Br', 'I'].includes(a.el)) pos = 'l';
      if (hr.length && deg) {
        if (deg === 1) pos = dirs[0][0] > 0.3 ? 'l' : 'r';
        else {
          const cand = [['r', [1, 0]], ['l', [-1, 0]], ['d', [0, 1]], ['u', [0, -1]]];
          let best = -2;
          for (const [k, v] of cand) {
            const mx = Math.max(...dirs.map(d => d[0] * v[0] + d[1] * v[1]));
            if (-mx > best + 0.05) { best = -mx; pos = k; }
          }
        }
      }
      let html = '', rects = [];
      if (pos === 'r' || !hr.length) {
        const p = this.place([{ t: a.el, k: 'n' }, ...hr, ...chg], x0, base, FS, col);
        html = p.html; rects = p.rects;
      } else if (pos === 'l') {
        const hw = this.runsWidth(hr, FS);
        const p1 = this.place([...hr, { t: a.el, k: 'n' }, ...chg], x0 - hw, base, FS, col);
        html = p1.html; rects = p1.rects;
      } else {
        const p1 = this.place([{ t: a.el, k: 'n' }, ...chg], x0, base, FS, col);
        const hw = this.runsWidth(hr, FS);
        const p2 = this.place(hr, a.x - hw / 2 + (h > 1 ? this.width('H', FS) * 0.15 : 0), base + (pos === 'd' ? FS * 1.0 : -FS * 1.0), FS, col);
        html = p1.html + p2.html; rects = [...p1.rects, ...p2.rects];
      }
      lbl.push(html);
      labels.set(a.id, rects);
    }
    for (const rs of labels.values()) for (const r of rs) grow(r.x0, r.y0, r.x1, r.y1 + 2);

    /* 2. Bindungen */
    const rings = ChemMol.bondRings(m, idx);
    const M = 1.6; // Abstand Linie – Beschriftung
    const line = (x1, y1, x2, y2, extra) => `<line x1="${x1.toFixed(2)}" y1="${y1.toFixed(2)}" x2="${x2.toFixed(2)}" y2="${y2.toFixed(2)}"${extra || ''}/>`;
    const seg = (ax, ay, bx, by, la, lb, shortA, shortB) => {
      const ca = la ? this.clip(ax, ay, bx, by, la, M) : shortA || 0;
      const cb = lb ? this.clip(bx, by, ax, ay, lb, M) : shortB || 0;
      if (ca + cb >= 0.98) return '';
      return line(ax + (bx - ax) * ca, ay + (by - ay) * ca, bx + (ax - bx) * cb, by + (ay - by) * cb);
    };
    const bondInfo = new Map();
    for (const b of m.bonds) {
      const A = idx.byId.get(b.a), B = idx.byId.get(b.b);
      if (!A || !B) continue;
      const la = labels.get(A.id), lb = labels.get(B.id);
      const ux = B.x - A.x, uy = B.y - A.y, len = Math.hypot(ux, uy) || 1;
      const nx = -uy / len, ny = ux / len;
      const mx = (A.x + B.x) / 2, my = (A.y + B.y) / 2;
      let side = 0;
      if (b.o === 2) {
        if (b.ds === 0 || b.ds === 1 || b.ds === -1) side = b.ds;
        else {
          const ring = rings.get(b.id);
          if (ring) {
            let cx = 0, cy = 0;
            for (const id of ring) { const o = idx.byId.get(id); cx += o.x; cy += o.y; }
            cx /= ring.length; cy /= ring.length;
            side = Math.sign(nx * (cx - mx) + ny * (cy - my)) || 1;
          } else {
            let tot = 0, nA = 0, nB = 0;
            for (const [X, other, cnt] of [[A, B.id, 'a'], [B, A.id, 'b']]) {
              for (const { nb } of idx.adj.get(X.id)) {
                if (nb === other) continue;
                const o = idx.byId.get(nb);
                tot += Math.sign(nx * (o.x - mx) + ny * (o.y - my));
                if (cnt === 'a') nA++; else nB++;
              }
            }
            if ((!nA && la) || (!nB && lb) || (!nA && !nB) || tot === 0) side = 0;
            else side = Math.sign(tot);
          }
        }
      }
      bondInfo.set(b.id, { side, nx, ny });
      const sp = this.SP;
      if (b.s === 'w' || b.s === 'h' || b.s === 'y') {
        const ca = la ? this.clip(A.x, A.y, B.x, B.y, la, M) : 0;
        const cb = lb ? this.clip(B.x, B.y, A.x, A.y, lb, M) : 0;
        const px = A.x + ux * ca, py = A.y + uy * ca, qx = B.x - ux * cb, qy = B.y - uy * cb;
        const w = this.WW;
        if (b.s === 'w') {
          out.push(`<polygon points="${px.toFixed(2)},${py.toFixed(2)} ${(qx + nx * w).toFixed(2)},${(qy + ny * w).toFixed(2)} ${(qx - nx * w).toFixed(2)},${(qy - ny * w).toFixed(2)}" fill="#000" stroke="#000" stroke-width="0.6" stroke-linejoin="round"/>`);
        } else if (b.s === 'h') {
          const L = Math.hypot(qx - px, qy - py);
          const n = Math.max(4, Math.round(L / 3.4));
          for (let k = 0; k <= n; k++) {
            const t = k / n, ww = w * (0.12 + 0.88 * t);
            const cx = px + (qx - px) * t, cy = py + (qy - py) * t;
            out.push(line(cx + nx * ww, cy + ny * ww, cx - nx * ww, cy - ny * ww, ' stroke-width="1.2"'));
          }
        } else {
          const L = Math.hypot(qx - px, qy - py);
          const n = Math.max(3, Math.round(L / 6));
          const ex = (qx - px) / n, ey = (qy - py) / n;
          let d = `M${px.toFixed(2)},${py.toFixed(2)}`;
          for (let k = 0; k < n; k++) {
            const s = k % 2 ? -1 : 1;
            const cx = px + ex * (k + 0.5) + nx * 4 * s, cy = py + ey * (k + 0.5) + ny * 4 * s;
            d += ` Q${cx.toFixed(2)},${cy.toFixed(2)} ${(px + ex * (k + 1)).toFixed(2)},${(py + ey * (k + 1)).toFixed(2)}`;
          }
          out.push(`<path d="${d}" fill="none"/>`);
        }
        continue;
      }
      if (b.o === 1) { out.push(seg(A.x, A.y, B.x, B.y, la, lb)); continue; }
      if (b.o === 3) {
        out.push(seg(A.x, A.y, B.x, B.y, la, lb));
        for (const s of [1, -1]) out.push(seg(A.x + nx * sp * s, A.y + ny * sp * s, B.x + nx * sp * s, B.y + ny * sp * s, la, lb));
        continue;
      }
      if (side === 0) {
        for (const s of [0.5, -0.5]) out.push(seg(A.x + nx * sp * s, A.y + ny * sp * s, B.x + nx * sp * s, B.y + ny * sp * s, la, lb));
      } else {
        out.push(seg(A.x, A.y, B.x, B.y, la, lb));
        const ox = nx * sp * side, oy = ny * sp * side;
        out.push(seg(A.x + ox, A.y + oy, B.x + ox, B.y + oy, la, lb, 0.14, 0.14));
      }
      grow(Math.min(A.x, B.x) - sp, Math.min(A.y, B.y) - sp, Math.max(A.x, B.x) + sp, Math.max(A.y, B.y) + sp);
    }

    /* 3. Markierungen: chirale C-Atome, R/S, E/Z */
    const markAt = (x, y, d, txt, size, italic) => {
      const w = this.width(txt, size);
      const dist = 7;
      const cx = x + d[0] * (dist + w / 2 * Math.abs(d[0])), cy = y + d[1] * (dist + size * 0.45 * Math.abs(d[1]));
      const tx = cx - w / 2, ty = cy + size * 0.36;
      marks.push(`<text font-family='${this.FONT}' font-size="${size.toFixed(2)}" fill="${this.MARK}"${italic ? ' font-style="italic"' : ''} x="${tx.toFixed(2)}" y="${ty.toFixed(2)}">${chemEsc(txt)}</text>`);
      grow(tx, ty - size * 0.8, tx + w, ty + size * 0.25);
    };
    if (opts.stars !== false || opts.rs) {
      for (const c of an.centers) {
        const a = idx.byId.get(c.id);
        if (!a) continue;
        const txt = (opts.stars !== false ? '*' : '') + (opts.rs && c.rs ? '(' + c.rs + ')' : '');
        if (!txt) continue;
        const lr = labels.get(a.id);
        const avoid = lr ? [[1, 0]] : [];
        const d = this.freeDir(dirsOf(a), avoid);
        markAt(a.x + d[0] * (lr ? 6 : 0), a.y + d[1] * (lr ? 6 : 0), d, txt, FS * (txt.length > 1 ? 0.8 : 1.05), txt.length > 1);
      }
    }
    if (opts.ez) {
      for (const e of an.ez) {
        const b = m.bonds.find(x => x.id === e.id);
        const info = b && bondInfo.get(b.id);
        if (!info) continue;
        const A = idx.byId.get(b.a), B = idx.byId.get(b.b);
        const s = info.side ? -info.side : 1;
        const d = [info.nx * s, info.ny * s];
        markAt((A.x + B.x) / 2 + d[0] * 2, (A.y + B.y) / 2 + d[1] * 2, d, '(' + e.ez + ')', FS * 0.8, true);
      }
    }
    /* 3b. Reaktionsschema (1.54): Pfeile, Elektronenpfeile, Plus, Text, Klammern, freie Paare, δ+/δ− */
    const ob = this.objects(m, opts, idx, labels);
    if (ob.box) grow(ob.box.x0, ob.box.y0, ob.box.x1, ob.box.y1);
    if (!isFinite(bx0)) { bx0 = by0 = 0; bx1 = by1 = 1; }
    /* 4. Bildunterschrift: Summenformel und Molare Masse – bei mehreren Molekülen unter jedes einzeln (1.54) */
    const capR = this.captions(m, an, opts, { x0: bx0, y0: by0, x1: bx1, y1: by1 }, labels);
    const cap = capR.html;
    bx0 = capR.box.x0; by0 = capR.box.y0; bx1 = capR.box.x1; by1 = capR.box.y1;
    const body = `<g stroke="#000" stroke-width="${this.LW}" stroke-linecap="round">${out.join('')}</g>${lbl.join('')}${marks.join('')}${ob.html}${cap}`;
    return { body, box: { x0: bx0, y0: by0, x1: bx1, y1: by1 }, labels };
  },
  /* ---------------------------------------------------------- Moleküle (zusammenhängende Teile) einer Zeichnung (1.54) */
  fragments(m) {
    const idx = ChemMol.index(m), seen = new Set(), out = [];
    for (const a of m.atoms) {
      if (seen.has(a.id)) continue;
      const ids = [], st = [a.id];
      seen.add(a.id);
      while (st.length) { const v = st.pop(); ids.push(v); for (const { nb } of idx.adj.get(v) || []) if (!seen.has(nb)) { seen.add(nb); st.push(nb); } }
      const set = new Set(ids);
      out.push({ ids: set, rep: Math.min(...ids), atoms: m.atoms.filter(x => set.has(x.id)), bonds: m.bonds.filter(b => set.has(b.a) && set.has(b.b)) });
    }
    return out;
  },
  subMol(m, f) { return { atoms: f.atoms, bonds: f.bonds, nid: m.nid }; },
  fragName(m, f) {
    const rep = f.atoms.find(a => a.id === f.rep);
    if (rep && rep.nm) return rep.nm;
    const sub = this.subMol(m, f);
    try { const t = typeof ChemDB !== 'undefined' && ChemDB.find(sub); if (t) return t.name; } catch (e) { /* */ }
    try { const r = typeof ChemName !== 'undefined' && ChemName.of(sub, { lang: this._lang || 'de' }); if (r && r.name) return r.name; } catch (e) { /* */ }
    return '';
  },
  /* Bildunterschriften: ein Molekül → wie bisher (Name von aussen); mehrere → unter jedes Molekül einzeln, gesteuert
   * durch die Einstellung (nameCap/caption) oder je Molekül (Atom mit der kleinsten Nummer: cn/ci = 1 zeigen, 0 nicht) */
  captions(m, an, opts, box, labels) {
    const fr = m.atoms.length ? this.fragments(m) : [];
    if (fr.length <= 1) {
      const rep = fr[0] && fr[0].atoms.find(a => a.id === fr[0].rep);
      const o2 = { ...opts };
      if (rep && rep.cn != null) o2.nameCap = !!rep.cn;
      if (rep && rep.ci != null) o2.caption = !!rep.ci;
      if (o2.nameCap && !o2.nameText && fr[0]) o2.nameText = this.fragName(m, fr[0]);
      // nur das Molekül, nicht die Pfeile: Unterschrift unter die Atome
      return this.caption(an, o2, box);
    }
    let html = '', B = { ...box };
    for (const f of fr) {
      const rep = f.atoms.find(a => a.id === f.rep);
      const showN = rep && rep.cn != null ? !!rep.cn : !!opts.nameCap;
      const showI = rep && rep.ci != null ? !!rep.ci : !!opts.caption;
      if (!showN && !showI) continue;
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const a of f.atoms) {
        x0 = Math.min(x0, a.x - 6); y0 = Math.min(y0, a.y - 6); x1 = Math.max(x1, a.x + 6); y1 = Math.max(y1, a.y + 6);
        for (const r of (labels && labels.get(a.id)) || []) { x0 = Math.min(x0, r.x0); y0 = Math.min(y0, r.y0); x1 = Math.max(x1, r.x1); y1 = Math.max(y1, r.y1); }
      }
      const fan = ChemMol.analyze(this.subMol(m, f));
      const c = this.caption(fan, { nameCap: showN, nameText: showN ? this.fragName(m, f) : '', caption: showI }, { x0, y0, x1, y1 });
      html += c.html;
      B = { x0: Math.min(B.x0, c.box.x0), y0: Math.min(B.y0, c.box.y0), x1: Math.max(B.x1, c.box.x1), y1: Math.max(B.y1, c.box.y1) };
    }
    return { html, box: B };
  },

  /* ---------------------------------------------------------- Reaktionsschema (1.54, wie ChemDraw)
   * m.objs: { id, t: 'arrow', k: 'r'|'eq'|'retro'|'res'|'no', x1, y1, x2, y2, up, dn }  Reaktionspfeile mit Text darüber
   *         (Reagenzien) und darunter (Bedingungen) · { t: 'curve', k: 'e2'|'e1', a, b, bend } gebogener Elektronenpfeil
   *         (e2 = Elektronenpaar, e1 = einzelnes Elektron/Halbpfeil); a/b = { at: Atom } | { bd: Bindung } | { x, y } ·
   *         { t: 'plus', x, y } · { t: 'text', x, y, s } · { t: 'brk', x1, y1, x2, y2, s } Klammern (Übergangszustand ‡)
   * Atome: lpv = Anzahl gezeigter freier Elektronenpaare, pc = '+'/'-' Partialladung δ+/δ−. */
  objPos(m, e, idx) {
    if (!e) return { x: 0, y: 0 };
    if (e.at != null) { const a = (idx ? idx.byId.get(e.at) : m.atoms.find(x => x.id === e.at)); if (a) return { x: a.x, y: a.y, atom: a }; }
    if (e.bd != null) {
      const b = m.bonds.find(x => x.id === e.bd);
      const A = b && (idx ? idx.byId.get(b.a) : m.atoms.find(x => x.id === b.a)), B2 = b && (idx ? idx.byId.get(b.b) : m.atoms.find(x => x.id === b.b));
      if (A && B2) return { x: (A.x + B2.x) / 2, y: (A.y + B2.y) / 2, bond: true };
    }
    return { x: e.x || 0, y: e.y || 0 };
  },
  // Text mit chemischen Formeln: H2SO4 → H₂SO₄, Ladungen hochgestellt
  textRuns(str) {
    const out = [], s = String(str || '');
    const push = (t, k) => { if (out.length && out[out.length - 1].k === k) out[out.length - 1].t += t; else out.push({ t, k }); };
    for (let i = 0; i < s.length; i++) {
      const c = s[i], prev = s[i - 1] || ' ', next = s[i + 1] || ' ';
      if (/\d/.test(c) && /[A-Za-z)\]]/.test(prev) && !/[°]/.test(next)) push(c, 'sub');
      else if ((c === '+' || c === '-' || c === '−') && /[A-Za-z0-9)\]]/.test(prev) && /[\s,;)]/.test(next) && /[A-Z]/.test(s.slice(Math.max(0, i - 6), i))) push(c === '-' ? '−' : c, 'sup');
      else push(c, 'n');
    }
    return out;
  },
  objects(m, opts, idx, labels) {
    const objs = m.objs || [];
    const FS = this.FS;
    let html = '', x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    const grow = (a, b, c, d) => { x0 = Math.min(x0, a); y0 = Math.min(y0, b); x1 = Math.max(x1, c); y1 = Math.max(y1, d); };
    const f2 = (v) => v.toFixed(2);
    const head = (x, y, ux, uy, half, open) => {
      // Pfeilspitze bei (x, y), Richtung (ux, uy)
      const L = 8, W = 3.6, bx = x - ux * L, by = y - uy * L, nx = -uy, ny = ux;
      if (open) return `<path d="M${f2(bx + nx * W)},${f2(by + ny * W)} L${f2(x)},${f2(y)} L${f2(bx - nx * W)},${f2(by - ny * W)}" fill="none" stroke="#000" stroke-width="${this.LW}"/>`;
      if (half) return `<path d="M${f2(x)},${f2(y)} L${f2(bx + nx * W * half)},${f2(by + ny * W * half)} L${f2(bx + ux * 2)},${f2(by + uy * 2)} Z" fill="#000"/>`;
      return `<path d="M${f2(x)},${f2(y)} L${f2(bx + nx * W)},${f2(by + ny * W)} L${f2(bx + ux * 2)},${f2(by + uy * 2)} L${f2(bx - nx * W)},${f2(by - ny * W)} Z" fill="#000"/>`;
    };
    const line = (ax, ay, bx, by, w) => `<line x1="${f2(ax)}" y1="${f2(ay)}" x2="${f2(bx)}" y2="${f2(by)}" stroke="#000" stroke-width="${w || this.LW}" stroke-linecap="round"/>`;
    const text = (str, cx, y, fs, anchor) => {
      const lines = String(str || '').split(/\n/).filter(Boolean);
      let h2 = '';
      lines.forEach((ln, k) => {
        const rs = this.textRuns(ln), w = this.runsWidth(rs, fs);
        const xs = anchor === 'l' ? cx : cx - w / 2, yy = y + k * fs * 1.2;
        h2 += this.place(rs, xs, yy, fs, '#000').html;
        grow(xs, yy - fs, xs + w, yy + fs * 0.35);
      });
      return h2;
    };
    for (const o of objs) {
      if (o.t === 'arrow') {
        const dx = o.x2 - o.x1, dy = o.y2 - o.y1, L = Math.hypot(dx, dy) || 1, ux = dx / L, uy = dy / L, nx = -uy, ny = ux;
        let g = '';
        if (o.k === 'eq') {
          const d = 2.6;
          g += line(o.x1 + nx * -d, o.y1 + ny * -d, o.x2 + nx * -d - ux * 1, o.y2 + ny * -d - uy * 1) + head(o.x2 + nx * -d, o.y2 + ny * -d, ux, uy, -1);
          g += line(o.x2 + nx * d, o.y2 + ny * d, o.x1 + nx * d + ux * 1, o.y1 + ny * d + uy * 1) + head(o.x1 + nx * d, o.y1 + ny * d, -ux, -uy, -1);
        } else if (o.k === 'retro') {
          const d = 2.8;
          g += line(o.x1 + nx * d, o.y1 + ny * d, o.x2 - ux * 4 + nx * d, o.y2 - uy * 4 + ny * d) + line(o.x1 - nx * d, o.y1 - ny * d, o.x2 - ux * 4 - nx * d, o.y2 - uy * 4 - ny * d);
          g += `<path d="M${f2(o.x2 - ux * 9 + nx * 7)},${f2(o.y2 - uy * 9 + ny * 7)} L${f2(o.x2)},${f2(o.y2)} L${f2(o.x2 - ux * 9 - nx * 7)},${f2(o.y2 - uy * 9 - ny * 7)}" fill="none" stroke="#000" stroke-width="${this.LW}" stroke-linejoin="round"/>`;
        } else {
          g += line(o.x1 + (o.k === 'res' ? ux * 6 : 0), o.y1 + (o.k === 'res' ? uy * 6 : 0), o.x2 - ux * 6, o.y2 - uy * 6) + head(o.x2, o.y2, ux, uy);
          if (o.k === 'res') g += head(o.x1, o.y1, -ux, -uy);
          if (o.k === 'no') { const mx = (o.x1 + o.x2) / 2, my = (o.y1 + o.y2) / 2; g += line(mx - 5, my - 5, mx + 5, my + 5) + line(mx - 5, my + 5, mx + 5, my - 5); }
        }
        grow(Math.min(o.x1, o.x2) - 6, Math.min(o.y1, o.y2) - 6, Math.max(o.x1, o.x2) + 6, Math.max(o.y1, o.y2) + 6);
        const mx = (o.x1 + o.x2) / 2, my = (o.y1 + o.y2) / 2, fs = FS * 0.78;
        // Text immer waagrecht, über bzw. unter der Mitte (bei senkrechten Pfeilen links/rechts)
        const vert = Math.abs(uy) > 0.8;
        if (o.up) { const n = String(o.up).split('\n').length; g += vert ? text(o.up, mx - 8 - this.runsWidth(this.textRuns(String(o.up).split('\n')[0]), fs) / 2, my, fs) : text(o.up, mx, my - 6 - (n - 1) * fs * 1.2, fs); }
        if (o.dn) g += vert ? text(o.dn, mx + 8 + this.runsWidth(this.textRuns(String(o.dn).split('\n')[0]), fs) / 2, my, fs) : text(o.dn, mx, my + 6 + fs * 0.85, fs);
        html += `<g data-obj="${o.id}">${g}</g>`;
      } else if (o.t === 'curve') {
        const A = this.objPos(m, o.a, idx), B = this.objPos(m, o.b, idx);
        let ax = A.x, ay = A.y, bx = B.x, by = B.y;
        const dx = bx - ax, dy = by - ay, L = Math.hypot(dx, dy) || 1, nx = -dy / L, ny = dx / L, bend = o.bend || 1;
        const h = Math.max(14, L * 0.42) * bend;
        // vom Atom (freies Paar) etwas neben dem Atom starten; am Ziel-Atom vor dem Atom enden
        if (A.atom) { ax += nx * 7 * bend + (dx / L) * 3; ay += ny * 7 * bend + (dy / L) * 3; }
        if (B.atom) { bx -= (dx / L) * 9 - nx * 4 * bend; by -= (dy / L) * 9 - ny * 4 * bend; }
        const cx = (ax + bx) / 2 + nx * h, cy = (ay + by) / 2 + ny * h;
        const tx = bx - cx, ty = by - cy, tl = Math.hypot(tx, ty) || 1;
        const col = o.k === 'e1' ? '#000' : '#000';
        let g = `<path d="M${f2(ax)},${f2(ay)} Q${f2(cx)},${f2(cy)} ${f2(bx - tx / tl * 5)},${f2(by - ty / tl * 5)}" fill="none" stroke="${col}" stroke-width="${this.LW}"/>`;
        g += head(bx, by, tx / tl, ty / tl, o.k === 'e1' ? (bend > 0 ? 1 : -1) : 0);
        html += `<g data-obj="${o.id}">${g}</g>`;
        grow(Math.min(ax, bx, cx) - 4, Math.min(ay, by, cy) - 4, Math.max(ax, bx, cx) + 4, Math.max(ay, by, cy) + 4);
      } else if (o.t === 'plus') {
        const fs = FS * 1.25, w = this.width('+', fs);
        html += `<g data-obj="${o.id}"><text font-family='${this.FONT}' font-size="${f2(fs)}" x="${f2(o.x - w / 2)}" y="${f2(o.y + fs * 0.35)}">+</text></g>`;
        grow(o.x - w / 2 - 2, o.y - fs * 0.5, o.x + w / 2 + 2, o.y + fs * 0.5);
      } else if (o.t === 'text') {
        html += `<g data-obj="${o.id}">${text(o.s || '', o.x, o.y, FS * 0.85, 'l')}</g>`;
        grow(o.x - 2, o.y - FS, o.x + 6, o.y + 4);
      } else if (o.t === 'brk') {
        const xa = Math.min(o.x1, o.x2), xb = Math.max(o.x1, o.x2), ya = Math.min(o.y1, o.y2), yb = Math.max(o.y1, o.y2), t = 5;
        let g = `<path d="M${f2(xa + t)},${f2(ya)} L${f2(xa)},${f2(ya)} L${f2(xa)},${f2(yb)} L${f2(xa + t)},${f2(yb)} M${f2(xb - t)},${f2(ya)} L${f2(xb)},${f2(ya)} L${f2(xb)},${f2(yb)} L${f2(xb - t)},${f2(yb)}" fill="none" stroke="#000" stroke-width="${this.LW}"/>`;
        if (o.s) g += text(o.s, xb + 3, ya + FS * 0.5, FS * 0.85, 'l');
        html += `<g data-obj="${o.id}">${g}</g>`;
        grow(xa - 2, ya - 2, xb + 14, yb + 2);
      }
    }
    // freie Elektronenpaare und Partialladungen an Atomen (für Mechanismen)
    for (const a of m.atoms) {
      if (!a.lpv && !a.pc) continue;
      const dirs = (idx.adj.get(a.id) || []).map(({ nb }) => { const o = idx.byId.get(nb); const dx = o.x - a.x, dy = o.y - a.y, l = Math.hypot(dx, dy) || 1; return [dx / l, dy / l]; });
      const rr = (labels && labels.get(a.id)) ? 11.5 : 8;
      for (let k = 0; k < (a.lpv || 0); k++) {
        const d = this.freeDir(dirs); dirs.push(d);
        const px = a.x + d[0] * rr, py = a.y + d[1] * rr, nx = -d[1], ny = d[0];
        html += `<circle cx="${f2(px + nx * 2.4)}" cy="${f2(py + ny * 2.4)}" r="1.35"/><circle cx="${f2(px - nx * 2.4)}" cy="${f2(py - ny * 2.4)}" r="1.35"/>`;
        grow(px - 4, py - 4, px + 4, py + 4);
      }
      if (a.pc) {
        const d = this.freeDir(dirs), t = a.pc === '+' ? 'δ+' : 'δ−', fs = FS * 0.7, w = this.width(t, fs);
        const px = a.x + d[0] * (rr + 6), py = a.y + d[1] * (rr + 6);
        html += `<text font-family='${this.FONT}' font-size="${f2(fs)}" fill="${a.pc === '+' ? '#1c4fb8' : '#b8211c'}" x="${f2(px - w / 2)}" y="${f2(py + fs * 0.35)}">${t}</text>`;
        grow(px - w / 2, py - fs * 0.6, px + w / 2, py + fs * 0.5);
      }
    }
    return { html, box: isFinite(x0) ? { x0, y0, x1, y1 } : null };
  },
  /* Bildunterschrift (Name, Summenformel · Molare Masse) unter einen Bereich box – auch für die Darstellungen (1.28) */
  caption(an, opts, box) {
    let bx0 = box.x0, by0 = box.y0, bx1 = box.x1, by1 = box.y1;
    const grow = (x0, y0, x1, y1) => { bx0 = Math.min(bx0, x0); by0 = Math.min(by0, y0); bx1 = Math.max(bx1, x1); by1 = Math.max(by1, y1); };
    const FS = this.FS;
    let cap = '';
    const cx = (bx0 + bx1) / 2;
    let capY = by1;
    if (opts.nameCap && opts.nameText && !an.empty) {
      const fs = FS * 0.92;
      const maxW = Math.max(bx1 - bx0, 300);
      const lines = this.wrap(String(opts.nameText), fs, maxW);
      lines.forEach((ln, k) => {
        const w = this.width(ln, fs);
        const y = capY + fs * (k ? 1.25 : 1.7);
        cap += `<text font-family='${this.FONT}' font-size="${fs.toFixed(2)}" fill="#222" x="${(cx - w / 2).toFixed(2)}" y="${y.toFixed(2)}">${chemEsc(ln)}</text>`;
        grow(cx - w / 2, y - fs, cx + w / 2, y + fs * 0.3);
        capY = y;
      });
    }
    if (opts.caption && !an.empty) {
      const fs = FS * 0.92;
      const parts = this.hillRuns(an.counts, an.charge);
      parts.push({ t: '  ·  M = ' + chemM(an.mass) + ' g/mol', k: 'n' });
      const w = this.runsWidth(parts, fs);
      const y = capY + fs * (capY === by1 ? 1.6 : 1.45);
      cap += this.place(parts, cx - w / 2, y, fs, '#333').html;
      grow(cx - w / 2, y - fs, cx + w / 2, y + fs * 0.4);
    }
    return { html: cap, box: { x0: bx0, y0: by0, x1: bx1, y1: by1 } };
  },
  /* Text an Bindestrichen, Kommas und Leerzeichen umbrechen */
  wrap(text, fs, maxW) {
    const parts = text.match(/[^-,\s]+[-,]?\s*|[-,\s]/g) || [text];
    const lines = [];
    let cur = '';
    for (const p of parts) {
      if (cur && this.width(cur + p, fs) > maxW) { lines.push(cur.trimEnd()); cur = p.trimStart(); }
      else cur += p;
    }
    if (cur.trim()) lines.push(cur.trimEnd());
    return lines.length ? lines : [text];
  },
  /* eigenständiges SVG für die Seite */
  toSVG(m, opts, an) {
    const r = this.draw(m, opts, an);
    const pad = 6, S = 30 / BL;
    const x = r.box.x0 - pad, y = r.box.y0 - pad, w = r.box.x1 - r.box.x0 + 2 * pad, h = r.box.y1 - r.box.y0 + 2 * pad;
    const W = Math.max(8, Math.round(w * S)), H = Math.max(8, Math.round(h * S));
    return {
      svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="${x.toFixed(2)} ${y.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)}">${r.body}</svg>`,
      w: W, h: H,
    };
  },
};

/* ------------------------------------------------------------------ Editor */
const CHEM_ICONS = (() => {
  const st = 'fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"';
  const ring = (n, benz) => {
    const R = 7.2, pts = [];
    for (let k = 0; k < n; k++) { const a = -Math.PI / 2 + k * 2 * Math.PI / n; pts.push([10 + R * Math.cos(a), 10.5 + R * Math.sin(a)]); }
    let s = `<polygon points="${pts.map(p => p.map(v => v.toFixed(1)).join(',')).join(' ')}" ${st} stroke-width="1.5"/>`;
    if (benz) s += `<circle cx="10" cy="10.5" r="3.9" ${st} stroke-width="1.3"/>`;
    return s;
  };
  let hash = '';
  for (let k = 0; k <= 5; k++) {
    const t = k / 5, cx = 4 + 12 * t, cy = 16 - 12 * t, w = 0.6 + 3.2 * t;
    hash += `<path d="M${(cx - w * 0.707).toFixed(1)} ${(cy - w * 0.707).toFixed(1)}L${(cx + w * 0.707).toFixed(1)} ${(cy + w * 0.707).toFixed(1)}" ${st} stroke-width="1.3"/>`;
  }
  return {
    select: '<path d="M5 2.5l10.5 7.6-4.6.9 2.7 5.3-2.1 1.1-2.7-5.3L5 15.6z" fill="currentColor"/>',
    erase: `<path d="M3.5 12.5l7.5-7.8 5.5 5.3-6.3 6.5H6.9z M8 16.5h9" ${st} stroke-width="1.5"/>`,
    b1: `<path d="M4 16L16 4" ${st} stroke-width="1.8"/>`,
    b2: `<path d="M2.5 13.5L13.5 2.5M6.5 17.5L17.5 6.5" ${st} stroke-width="1.6"/>`,
    b3: `<path d="M2 12L12 2M4.9 14.9L14.9 4.9M7.8 17.8L17.8 7.8" ${st} stroke-width="1.4"/>`,
    bw: '<path d="M3.5 16.5L17.6 5.2 14.8 2.4z" fill="currentColor"/>',
    bh: hash,
    by: `<path d="M3 15c1.5-3 3 1 4.5-2s3 1 4.5-2 3 1 4.5-2" ${st} stroke-width="1.5"/>`,
    chain: `<path d="M1.5 13.5l4.25-7 4.25 7 4.25-7 4.25 7" ${st} stroke-width="1.6"/>`,
    r3: ring(3), r4: ring(4), r5: ring(5), r6: ring(6), r7: ring(7), r8: ring(8), benz: ring(6, true),
    text: '<text x="10" y="15.6" text-anchor="middle" font-size="14.5" font-weight="700" font-family="Arial, sans-serif" fill="currentColor">A</text>',
    qp: `<circle cx="10" cy="10" r="6.8" ${st} stroke-width="1.4"/><path d="M10 6.6v6.8M6.6 10h6.8" ${st} stroke-width="1.5"/>`,
    qm: `<circle cx="10" cy="10" r="6.8" ${st} stroke-width="1.4"/><path d="M6.6 10h6.8" ${st} stroke-width="1.5"/>`,
    undo: `<path d="M7 5L3.5 8.5 7 12M3.8 8.5h8.2a4.5 4.5 0 010 9H9" ${st} stroke-width="1.6"/>`,
    redo: `<path d="M13 5l3.5 3.5L13 12M16.2 8.5H8a4.5 4.5 0 000 9h3" ${st} stroke-width="1.6"/>`,
    rotL: `<path d="M4.5 4.5v4h4M5 8.2A6.2 6.2 0 1110 16.4" ${st} stroke-width="1.6"/>`,
    rotR: `<path d="M15.5 4.5v4h-4M15 8.2A6.2 6.2 0 1010 16.4" ${st} stroke-width="1.6"/>`,
    flipH: `<path d="M10 2.5v15M7.5 5.5L3 14h4.5zM12.5 5.5L17 14h-4.5z" ${st} stroke-width="1.4"/>`,
    flipV: `<path d="M2.5 10h15M5.5 7.5L14 3v4.5zM5.5 12.5L14 17v-4.5z" ${st} stroke-width="1.4"/>`,
    fit: `<path d="M3 7.5V3h4.5M12.5 3H17v4.5M17 12.5V17h-4.5M7.5 17H3v-4.5" ${st} stroke-width="1.6"/>`,
    clear: `<path d="M4.5 6h11M8 6V4h4v2M6 6l.8 11h6.4L14 6" ${st} stroke-width="1.5"/>`,
    clean: `<path d="M3 17l7-7M11.5 8.5l2-2 1 1-2 2zM14 3v2.5M12.75 4.25h2.5M17 8v2M16 9h2M6 4v2M5 5h2" ${st} stroke-width="1.5"/>`,
    grid: '<circle cx="4" cy="4" r="1.2" fill="currentColor"/><circle cx="10" cy="4" r="1.2" fill="currentColor"/><circle cx="16" cy="4" r="1.2" fill="currentColor"/><circle cx="7" cy="10" r="1.2" fill="currentColor"/><circle cx="13" cy="10" r="1.2" fill="currentColor"/><circle cx="4" cy="16" r="1.2" fill="currentColor"/><circle cx="10" cy="16" r="1.2" fill="currentColor"/><circle cx="16" cy="16" r="1.2" fill="currentColor"/>',
    magnet: `<path d="M5 3.5v7a5 5 0 0010 0v-7h-3.5v7a1.5 1.5 0 01-3 0v-7z" ${st} stroke-width="1.4"/><path d="M5 6.5h3.5M11.5 6.5H15" ${st} stroke-width="1.4"/>`,
    tpl: `<rect x="3" y="3" width="6" height="6" rx="1" ${st} stroke-width="1.4"/><rect x="11" y="3" width="6" height="6" rx="1" ${st} stroke-width="1.4"/><rect x="3" y="11" width="6" height="6" rx="1" ${st} stroke-width="1.4"/><path d="M14 11v6M11 14h6" ${st} stroke-width="1.5"/>`,
    pse: `<rect x="2.5" y="4" width="4" height="4" ${st} stroke-width="1.2"/><rect x="13.5" y="4" width="4" height="4" ${st} stroke-width="1.2"/><rect x="2.5" y="8" width="15" height="4" ${st} stroke-width="1.2"/><rect x="5" y="14" width="10" height="2.6" ${st} stroke-width="1.1"/>`,
  };
})();
/* Reaktions- und Mechanismus-Werkzeuge (1.54) */
Object.assign(CHEM_ICONS, (() => {
  const st = 'fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"';
  const hd = (x, y, d = 1) => `<path d="M${x - 4 * d} ${y - 3.5}L${x} ${y}L${x - 4 * d} ${y + 3.5}Z" fill="currentColor"/>`;
  const tx = (t, fs = 9, y = 14) => `<text x="10" y="${y}" font-size="${fs}" text-anchor="middle" font-family="Arial" font-weight="700" fill="currentColor">${t}</text>`;
  return {
    arr_r: `<path d="M2 10H14" ${st}/>${hd(18, 10)}`,
    arr_eq: `<path d="M2 8H16M13 5L17 8M18 12H4M7 15L3 12" ${st}/>`,
    arr_retro: `<path d="M2 8H14M2 12H14M12 4.5L17.5 10L12 15.5" ${st}/>`,
    arr_res: `<path d="M5 10H15" ${st}/>${hd(18, 10)}<path d="M2 10L6 6.5L6 13.5Z" fill="currentColor"/>`,
    arr_no: `<path d="M2 10H14" ${st}/>${hd(18, 10)}<path d="M6 6L10 14M10 6L6 14" ${st}/>`,
    e2: `<path d="M3 16Q6 2 15 11" ${st}/><path d="M17.5 14.5L12.3 12.6L16.4 9.3Z" fill="currentColor"/>`,
    e1: `<path d="M3 16Q6 2 15 11" ${st}/><path d="M17.5 14.5L12.3 12.6L15 12Z" fill="currentColor"/>`,
    plus: `<path d="M10 4V16M4 10H16" ${st} stroke-width="2"/>`,
    atext: tx('Abc', 8.5),
    brk: `<path d="M5 3H3V17H5M15 3H17V17H15" ${st}/>${tx('‡', 9, 13)}`,
    lp: `${tx('O', 10, 14)}<circle cx="5" cy="5" r="1.3" fill="currentColor"/><circle cx="8" cy="3.6" r="1.3" fill="currentColor"/>`,
    rad: `${tx('C', 10, 14)}<circle cx="16" cy="5" r="1.7" fill="currentColor"/>`,
    dp: tx('δ+', 9.5), dm: tx('δ−', 9.5),
    step: `<path d="M2 12H12" ${st}/>${hd(15, 12)}<path d="M15 3V9M12 6H18" ${st}/>`,
  };
})());
const chemIc = (k, sz = 20) => `<svg class="ic" width="${sz}" height="${sz}" viewBox="0 0 20 20" aria-hidden="true">${CHEM_ICONS[k] || ''}</svg>`;

const Chem = {
  E: null,
  opts: { color: true, carbons: false, stars: true, rs: true, ez: false, caption: true, nameCap: false, lang: 'de', model: 'skelett', style3d: 'stab', lewisDots: false, orbBoxes: true, rot3d: null },
  grid: { show: true, snap: true },
  TOOLS: [
    ['select', 'Auswählen und verschieben (Rechteck aufziehen; Doppelklick = ganzes Molekül)'],
    ['erase', 'Radierer: Atom oder Bindung anklicken / überfahren'],
    ['b1', 'Einfachbindung – Klick auf Atom: neue Bindung, auf Bindung: Ordnung erhöhen; ziehen für Richtung'],
    ['b2', 'Doppelbindung – nochmals anklicken: Lage wechseln'],
    ['b3', 'Dreifachbindung'],
    ['bw', 'Keil: Bindung nach vorn (Stereochemie) – nochmals anklicken: umdrehen'],
    ['bh', 'Strichkeil: Bindung nach hinten – nochmals anklicken: umdrehen'],
    ['by', 'Wellenbindung (unbestimmte Stereochemie)'],
    ['chain', 'Kette: vom Atom aus ziehen (Umschalt = Zickzack andersherum)'],
    ['text', 'Beschriftung: Element oder Kurzschreibweise (OH, NH2, COOH, Ph, Me …) eingeben'],
    ['r3', 'Cyclopropan'], ['r4', 'Cyclobutan'], ['r5', 'Cyclopentan'], ['r6', 'Cyclohexan'], ['r7', 'Cycloheptan'], ['r8', 'Cyclooctan'],
    ['benz', 'Benzol'], ['qp', 'Ladung + (Atom anklicken)'], ['qm', 'Ladung − (Atom anklicken)'],
  ],
  // Reaktionen und Mechanismen (1.54, wie ChemDraw)
  RTOOLS: [
    ['arr_r', 'Reaktionspfeil → – ziehen (Klick = Standardlänge) · Doppelklick: Reagenzien darüber, Bedingungen darunter'],
    ['arr_eq', 'Gleichgewichtspfeil ⇌'], ['arr_retro', 'Retrosynthese-Pfeil ⇒'], ['arr_res', 'Mesomeriepfeil ↔ (Grenzstrukturen)'], ['arr_no', 'Reaktion läuft nicht ab (→ mit ×)'],
    ['e2', 'Elektronenpaar-Pfeil (gebogen): von freiem Paar/Atom oder Bindung zum Ziel-Atom bzw. zur Bindung ziehen · Doppelklick = Bogen umkehren'],
    ['e1', 'Ein-Elektron-Pfeil (Halbpfeil, radikalisch)'],
    ['plus', 'Plus + (zwischen Edukten/Produkten)'], ['atext', 'Text: Reagenzien, Bedingungen, Stufe, Ausbeute …'],
    ['brk', 'Klammern [ ]‡ – Rechteck aufziehen (Übergangszustand, Zwischenstufe)'],
    ['lp', 'Freies Elektronenpaar zeigen (Atom anklicken; Umschalt = weniger)'], ['rad', 'Radikal • am Atom (nochmals = weg)'], ['dp', 'Partialladung δ+'], ['dm', 'Partialladung δ−'],
  ],
  ELEMS: ['C', 'H', 'N', 'O', 'S', 'P', 'F', 'Cl', 'Br', 'I'],
  KEYS: { c: 'C', h: 'H', n: 'N', o: 'O', s: 'S', p: 'P', f: 'F', l: 'Cl', b: 'Br', i: 'I' },

  loadOpts() {
    try { Object.assign(this.opts, JSON.parse(localStorage.getItem('kt-chem-opts') || '{}')); } catch (e) { /* */ }
    try { Object.assign(this.grid, JSON.parse(localStorage.getItem('kt-chem-grid') || '{}')); } catch (e) { /* */ }
  },
  /* ---------------------------------------------------------- Fenster (1.57): Grösse, gross, neben der Seite
   * Eigener Speicher (kt-chem-win), nicht in den Bild-Optionen – { w, h (px, schwebend), max, dock, dw (px, angedockt) } */
  win() { if (!this._win) { try { this._win = JSON.parse(localStorage.getItem('kt-chem-win') || '{}') || {}; } catch (e) { this._win = {}; } } return this._win; },
  setWin(ch) { Object.assign(this.win(), ch); try { localStorage.setItem('kt-chem-win', JSON.stringify(this._win)); } catch (e) { /* */ } this.applyWin(); },
  applyWin() {
    const E = this.E; if (!E) return;
    const w = this.win(), d = E.dlg, back = E.back;
    const phone = document.body.classList.contains('lay-phone');
    const dock = !!w.dock && !phone;
    back.classList.toggle('docked', dock);
    d.classList.toggle('max', !dock && !!w.max);
    document.body.classList.toggle('chem-docked', dock);
    if (dock) {
      const dw = Math.round(clamp(w.dw || window.innerWidth * 0.5, 420, window.innerWidth * 0.85));
      document.documentElement.style.setProperty('--chem-dock-w', dw + 'px');
      d.style.width = d.style.height = '';
    } else {
      document.documentElement.style.removeProperty('--chem-dock-w');
      d.style.width = !w.max && w.w ? Math.round(clamp(w.w, Math.min(560, window.innerWidth - 12), window.innerWidth - 12)) + 'px' : '';
      d.style.height = !w.max && w.h ? Math.round(clamp(w.h, Math.min(420, window.innerHeight - 12), window.innerHeight - 12)) + 'px' : '';
    }
    const db = d.querySelector('.chem-dockb'); if (db) { db.classList.toggle('on', dock); db.title = dock ? 'Wieder als Fenster über der Seite' : 'Neben der Seite öffnen (Bildschirm teilen) – die Seite bleibt daneben bedienbar'; }
    const mb = d.querySelector('.chem-maxb'); if (mb) mb.classList.toggle('on', !dock && !!w.max);
    this.applyPanels();
    // Seite und Zeichenfläche an die neue Breite anpassen
    this._inWin = true;
    try { window.dispatchEvent(new Event('resize')); } finally { this._inWin = false; }
  },
  /* Leisten (1.58): Breiten/Höhe und Zuklappen – win().tl (Werkzeuge px), sr (Seite px), sp (Seite im Planen px),
   * sh (Seite auf dem Handy hochkant: Höhe px), tc / sc (zugeklappt) */
  applyPanels() {
    const E = this.E; if (!E || !E.tools) return;
    const w = this.win(), d = E.dlg, dw = d.clientWidth || window.innerWidth, dh = d.clientHeight || window.innerHeight;
    const col = document.body.classList.contains('lay-phone') && window.matchMedia('(orientation: portrait)').matches;
    const plan = E.side.classList.contains('plan');
    d.classList.toggle('tools-c', !!w.tc); d.classList.toggle('side-c', !!w.sc);
    // Werkzeuge: Spalten passen sich der Breite an (34 px je Knopf)
    const phone = document.body.classList.contains('lay-phone');
    const tw = clamp(w.tl || 124, 52, Math.min(300, dw * 0.3));
    E.tools.style.width = phone || w.tc ? '' : Math.round(tw) + 'px';
    E.tools.style.gridTemplateColumns = phone ? '' : `repeat(${Math.max(1, Math.floor((tw - 16 + 4) / 38))}, 34px)`;
    if (col) { E.side.style.width = ''; E.side.style.height = w.sc ? '' : Math.round(clamp(w.sh || dh * 0.34, 90, dh * 0.7)) + 'px'; }
    else {
      E.side.style.height = '';
      const def = plan ? 440 : 280, cur = plan ? w.sp : w.sr;
      // nie mehr als 55 % der Fensterbreite – auch bei kleinen Fenstern bleibt Platz zum Zeichnen
      E.side.style.width = w.sc ? '' : Math.round(clamp(cur || def, 180, Math.max(180, dw * 0.55))) + 'px';
    }
  },
  togglePanel(k) {
    const w = this.win();
    if (k === 'l') w.tc = !w.tc; else w.sc = !w.sc;
    this.setWin({});
    this.applyPanels(); this.applyView();
  },
  sashDrag(e, k) {
    const E = this.E; if (!E || e.button > 0) return;
    if (e.target.closest('.chem-sash-btn')) return;
    e.preventDefault();
    const w = this.win(), x0 = e.clientX, y0 = e.clientY;
    const col = document.body.classList.contains('lay-phone') && window.matchMedia('(orientation: portrait)').matches;
    const plan = E.side.classList.contains('plan');
    const t0 = E.tools.getBoundingClientRect(), s0 = E.side.getBoundingClientRect();
    if (k === 'l' && w.tc) { w.tc = false; }
    if (k === 'r' && w.sc) { w.sc = false; }
    let moved = false;
    const mv = (ev) => {
      moved = true;
      if (k === 'l') { if (col) return; w.tl = t0.width + (ev.clientX - x0); }
      else if (col) w.sh = s0.height - (ev.clientY - y0);
      else { const v = s0.width - (ev.clientX - x0); if (plan) w.sp = v; else w.sr = v; }
      // ganz zusammengeschoben = zuklappen
      if (k === 'l' && w.tl < 40) { w.tc = true; w.tl = 124; }
      this.applyPanels(); this.applyView();
    };
    const up = () => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); if (moved) this.setWin({}); };
    window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up);
  },
  undock() {
    if (!document.body.classList.contains('chem-docked')) return;
    document.body.classList.remove('chem-docked');
    document.documentElement.style.removeProperty('--chem-dock-w');
    window.dispatchEvent(new Event('resize'));
  },
  // Ränder ziehen: schwebend e/s/se (Fenster bleibt mittig → doppelte Änderung), angedockt w (linker Rand)
  winDrag(e, k) {
    const E = this.E; if (!E || e.button > 0) return;
    e.preventDefault(); e.stopPropagation();
    const w = this.win(), d = E.dlg, r = d.getBoundingClientRect();
    const x0 = e.clientX, y0 = e.clientY;
    const mv = (ev) => {
      if (w.dock) { w.dw = clamp(r.width - (ev.clientX - x0), 420, window.innerWidth * 0.85); }
      else {
        w.max = false;
        if (k !== 's') w.w = clamp(r.width + (ev.clientX - x0) * (k === 'w' ? -2 : 2), 560, window.innerWidth - 12);
        if (k !== 'e' && k !== 'w') w.h = clamp(r.height + (ev.clientY - y0) * 2, 420, window.innerHeight - 12);
      }
      this.applyWin(); this.applyView();
    };
    const up = () => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); this.setWin({}); };
    window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up);
  },
  saveOpts() {
    try { localStorage.setItem('kt-chem-opts', JSON.stringify(this.opts)); localStorage.setItem('kt-chem-grid', JSON.stringify(this.grid)); } catch (e) { /* */ }
  },

  /* kompakt speichern (im Bild-Objekt) */
  pack(m) {
    return {
      // 7. Feld (1.53, nur wenn nötig): entfernte H – hd/rad (Radikal) und hq (als H⁺/H⁻ abgespalten, für „wiederherstellen“)
      // seit 1.54 auch: cn/ci (Name/Formel unter dieses Molekül), nm (eigener Name), lpv (freie Paare zeigen), pc (δ+/δ−)
      a: m.atoms.map(a => { const r = [a.id, a.el, Math.round(a.x * 10) / 10, Math.round(a.y * 10) / 10, a.q || 0, a.ab || '']; const ex = {}; for (const k of this.ATOM_EXTRA) if (a[k] != null && a[k] !== 0 && a[k] !== '') ex[k] = a[k]; if (Object.keys(ex).length) r.push(ex); return r; }),
      // Reaktionsschema (1.54): Pfeile, Elektronenpfeile, Plus, Text, Klammern
      ...(m.objs && m.objs.length ? { o: m.objs.map(o => JSON.parse(JSON.stringify(o, (k, v) => typeof v === 'number' ? Math.round(v * 10) / 10 : v))) } : {}),
      b: m.bonds.map(b => [b.id, b.a, b.b, b.o, b.s || '', b.ds == null ? '' : b.ds]),
    };
  },
  unpack(p) {
    const m = ChemMol.empty();
    if (!p) return m;
    m.atoms = (p.a || []).map(([id, el, x, y, q, ab, ex]) => { const a = { id, el, x, y, q: q || 0, ...(ab ? { ab } : {}) }; if (ex && typeof ex === 'object') for (const k of this.ATOM_EXTRA) if (ex[k] != null) a[k] = ex[k]; return a; });
    m.bonds = (p.b || []).map(([id, a, b, o, s, ds]) => ({ id, a, b, o, s: s || '', ...(ds === '' || ds == null ? {} : { ds }) }));
    if (Array.isArray(p.o)) m.objs = p.o.map(o => ({ ...o }));
    m.nid = Math.max(0, ...m.atoms.map(a => a.id), ...m.bonds.map(b => b.id), ...(m.objs || []).map(o => o.id || 0)) + 1;
    return m;
  },
  ATOM_EXTRA: ['hd', 'rad', 'hq', 'cn', 'ci', 'nm', 'lpv', 'pc', 'grp'],

  /* ---------------------------------------------------------- Öffnen */
  open(target, tab) {
    if (this.E) return;
    this.loadOpts();
    let mol = ChemMol.empty(), tgt = null, nameEdit = null;
    if (target && target.boxId) {
      const b = Canvas.box(target.boxId);
      const im = b && b.images.find(i => i.id === target.imgId);
      if (im && im.chem) {
        mol = this.unpack(im.chem.mol);
        tgt = { boxId: b.id, imgId: im.id };
        if (im.chem.opts) Object.assign(this.opts, im.chem.opts);
        if (im.chem.name) nameEdit = im.chem.name;
      }
    }
    if (!tgt && !ChemModels.editable(this.opts.model)) this.opts.model = 'skelett';   // Neues zeichnet man in Keil/Strich
    if (Canvas.editing && typeof Formula !== 'undefined') Formula.grabRange();
    const editBox = !tgt && Canvas.editing ? Canvas.editing : null;
    const range = editBox && Canvas.lastRangeBox === editBox && Canvas.lastRange ? Canvas.lastRange.cloneRange() : null;
    let lastTool = 'b1';
    try { lastTool = localStorage.getItem('kt-chem-tool') || 'b1'; } catch (e) { /* */ }
    this.chargeOldH(mol);   // ältere Zeichnungen: entfernte H → Ladung (1.53)
    const E = this.E = {
      mol, start: JSON.stringify(mol), undo: [], redo: [], tool: lastTool, elem: 'N', view: { s: 40 / BL, ox: 0, oy: 0 },
      hover: null, sel: new Set(), drag: null, an: null, labels: new Map(), box: null, target: tgt, editBox, range,
      tab: tab || 'struktur', space: false, preview: '', pseSel: 'C', nameEdit, tplCat: '', tplQ: '',
    };
    this.build();
    this.setTab(E.tab);
    requestAnimationFrame(() => {
      if (!this.E) return;
      if (mol.atoms.length) this.fit(); else this.center();
      this.render();
    });
  },

  build() {
    const E = this.E;
    const back = el('div', { class: 'dlg-back chem-back' });
    const d = el('div', { class: 'dlg chem-dlg', tabindex: '-1' });
    back.append(d);
    E.back = back; E.dlg = d;
    /* Kopf mit Registern */
    const tabs = el('div', { class: 'chem-tabs' });
    for (const [k, label] of [['struktur', 'Struktur zeichnen'], ['analyse', 'Analyse & Spektren'], ['vorlagen', 'Vorlagen & Trivialnamen'], ['formel', 'Summenformel'], ['pse', 'Periodensystem']]) {
      tabs.append(el('button', { class: 'chem-tab', dataset: { tab: k }, text: label, onclick: () => this.setTab(k) }));
    }
    d.append(el('div', { class: 'chem-head' }, el('h2', { text: 'Chem-Draw' }), tabs,
      // Fenster (1.57): neben der Seite (geteilter Bildschirm) bzw. gross – Grösse an den Rändern ziehen, wird gemerkt
      el('button', { class: 'chem-winb chem-dockb', title: 'Neben der Seite öffnen (Bildschirm teilen) – die Seite bleibt daneben bedienbar', html: '◧', onclick: () => this.setWin({ dock: !this.win().dock }) }),
      el('button', { class: 'chem-winb chem-maxb', title: 'Fenster gross / normal', html: '⛶', onclick: () => this.setWin({ max: !this.win().max, dock: false }) }),
      el('button', { class: 'chem-x', title: 'Schliessen (Esc)', html: '✕', onclick: () => this.tryClose() })));
    for (const k of ['e', 's', 'se', 'w']) d.append(el('div', { class: 'chem-rs chem-rs-' + k, dataset: { rs: k }, title: 'Ziehen = Grösse ändern', onpointerdown: (e) => this.winDrag(e, k) }));

    /* --- Register Struktur */
    const main = el('div', { class: 'chem-main', dataset: { pane: 'struktur' } });
    const tools = el('div', { class: 'chem-tools' });
    const sec = (title) => tools.append(el('div', { class: 'chem-tsec', text: title }));
    const tbtn = (k, title) => el('button', { class: 'chem-tb', dataset: { tool: k }, title, html: chemIc(k), onclick: () => this.setTool(k) });
    sec('Werkzeuge');
    for (const [k, t] of this.TOOLS.slice(0, 2)) tools.append(tbtn(k, t));
    sec('Bindungen');
    for (const [k, t] of this.TOOLS.slice(2, 10)) tools.append(tbtn(k, t));
    sec('Ringe');
    for (const [k, t] of this.TOOLS.slice(10, 17)) tools.append(tbtn(k, t));
    sec('Ladung');
    for (const [k, t] of this.TOOLS.slice(17)) tools.append(tbtn(k, t));
    sec('Reaktion');
    for (const [k, t] of this.RTOOLS.slice(0, 10)) tools.append(tbtn(k, t));
    sec('Elektronen');
    for (const [k, t] of this.RTOOLS.slice(10)) tools.append(tbtn(k, t));
    sec('Atome');
    for (const s of this.ELEMS) {
      tools.append(el('button', { class: 'chem-tb chem-elb', dataset: { tool: 'el', el: s }, title: `${CHEM_BY_SYM[s].name} – Atom anklicken oder von einem Atom aus ziehen`, style: { color: CHEM_COLORS[s] || '' }, text: s, onclick: () => { E.elem = s; this.setTool('el'); } }));
    }
    const pseBtn = el('button', { class: 'chem-tb chem-elb chem-pseb', dataset: { tool: 'elx' }, title: 'Anderes Element aus dem Periodensystem', html: chemIc('pse', 18) });
    pseBtn.addEventListener('click', () => this.psePopup(pseBtn));
    tools.append(pseBtn);
    E.pseBtn = pseBtn;

    const stage = el('div', { class: 'chem-stage' });
    const acts = el('div', { class: 'chem-acts' });
    const abtn = (k, title, fn) => el('button', { class: 'chem-ab', title, html: chemIc(k, 18), onclick: fn });
    acts.append(
      abtn('undo', 'Rückgängig (Strg+Z)', () => this.undo()), abtn('redo', 'Wiederholen (Strg+Y)', () => this.redo()), el('span', { class: 'chem-asep' }),
      abtn('rotL', 'Drehen −15° (Auswahl oder alles)', () => this.transform('rot', -15)), abtn('rotR', 'Drehen +15°', () => this.transform('rot', 15)),
      abtn('flipH', 'Horizontal spiegeln', () => this.transform('flipH')), abtn('flipV', 'Vertikal spiegeln', () => this.transform('flipV')), el('span', { class: 'chem-asep' }),
      abtn('clean', 'Aufräumen: Struktur neu und regelmässig anordnen (Auswahl oder alles; Stereochemie bleibt)', () => this.cleanUp()),
      E.gridBtn = abtn('grid', 'Sechseck-Raster anzeigen', () => { this.grid.show = !this.grid.show; this.saveOpts(); this.markGrid(); }),
      E.snapBtn = abtn('magnet', 'Am Raster ausrichten (Bindungen in 60°-Schritten; Alt = frei)', () => { this.grid.snap = !this.grid.snap; this.saveOpts(); this.markGrid(); }),
      el('span', { class: 'chem-asep' }),
      abtn('fit', 'Ansicht einpassen', () => { this.fit(); this.applyView(); this.renderOverlay(); }),
      abtn('tpl', 'Vorlagen & Trivialnamen …', () => this.setTab('vorlagen')),
      abtn('clear', 'Alles löschen', () => { if (E.mol.atoms.length || (E.mol.objs || []).length) this.change(() => { E.mol.atoms = []; E.mol.bonds = []; E.mol.objs = []; E.sel.clear(); }); }),
      el('span', { class: 'chem-asep' }),
      abtn('step', 'Nächste Stufe: Reaktionspfeil rechts anfügen (Reagenzien eintragen), danach das Produkt zeichnen', () => this.addStep()),
      abtn('plus', 'Plus rechts anfügen', () => this.addPlusRight()));
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'chem-svg');
    const GW = Math.sqrt(3) * BL, GH = BL;
    const dot = (x, y) => `<circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="1.15"/>`;
    svg.innerHTML = `<defs><pattern id="chemGridPat" patternUnits="userSpaceOnUse" width="${GW.toFixed(3)}" height="${GH}">${dot(0, 0) + dot(GW, 0) + dot(0, GH) + dot(GW, GH) + dot(GW / 2, GH / 2)}</pattern></defs>`
      + '<g class="vp"><rect class="chem-grid" x="-12000" y="-12000" width="24000" height="24000" fill="url(#chemGridPat)"/><g class="mol"></g><g class="ov"></g></g>';
    E.svg = svg; E.vpG = svg.querySelector('.vp'); E.molG = svg.querySelector('.mol'); E.ovG = svg.querySelector('.ov'); E.gridR = svg.querySelector('.chem-grid');
    const inp = el('input', { type: 'text', class: 'chem-label', spellcheck: 'false', autocomplete: 'off', hidden: true, title: 'Element (N, Cl, Na+ …) oder Kurzschreibweise (OH, NH2, COOH, CHO, CN, NO2, Me, Et, Ph, OMe, CF3 …) – Enter übernimmt, Esc bricht ab' });
    E.labelInp = inp;
    E.status = el('div', { class: 'chem-status' });
    E.zoomLbl = el('span', { class: 'chem-zoomlbl' });
    const zoom = el('div', { class: 'chem-zoom' },
      el('button', { text: '−', title: 'Verkleinern', onclick: () => this.zoomBy(1 / 1.2) }), E.zoomLbl,
      el('button', { text: '+', title: 'Vergrössern', onclick: () => this.zoomBy(1.2) }));
    // Darstellung wählen (1.28)
    E.modelBar = el('div', { class: 'chem-models' });
    for (const [k, label, title] of ChemModels.LIST) E.modelBar.append(el('button', { class: 'chem-mb' + (this.opts.model === k ? ' on' : ''), dataset: { model: k }, text: label, title, onclick: () => this.setModel(k) }));
    E.roNote = el('div', { class: 'chem-ronote', hidden: true });
    stage.append(acts, E.modelBar, svg, inp, E.status, zoom, E.roNote);
    E.stage = stage;
    const side = el('div', { class: 'chem-side' });
    E.side = side;
    // Leisten links/rechts (1.58): Grösse am Trennstrich ziehen, Pfeil bzw. Doppelklick klappt zu/auf (gemerkt)
    const sash = (k) => el('div', { class: 'chem-sash chem-sash-' + k, dataset: { k }, title: 'Ziehen = Breite ändern · Doppelklick = zu-/aufklappen', onpointerdown: (e) => this.sashDrag(e, k), ondblclick: () => this.togglePanel(k) },
      el('button', { class: 'chem-sash-btn', title: k === 'l' ? 'Werkzeuge zu-/aufklappen' : 'Seitenleiste zu-/aufklappen', onpointerdown: (e) => e.stopPropagation(), onclick: () => this.togglePanel(k) }));
    E.tools = tools;
    main.append(tools, sash('l'), stage, sash('r'), side);

    /* --- Register Vorlagen */
    const ttab = el('div', { class: 'chem-ttab', dataset: { pane: 'vorlagen' } });
    E.ttab = ttab;
    /* --- Register Summenformel */
    const ftab = el('div', { class: 'chem-ftab', dataset: { pane: 'formel' } });
    this.buildFormulaTab(ftab);
    /* --- Register Analyse & Spektren (1.52) */
    const atab = el('div', { class: 'chem-atab', dataset: { pane: 'analyse' } });
    E.atab = atab;
    /* --- Register Periodensystem */
    const ptab = el('div', { class: 'chem-ptab', dataset: { pane: 'pse' } });
    this.buildPseTab(ptab);

    /* --- Fuss */
    E.hint = el('div', { class: 'chem-hint' });
    E.okBtn = el('button', { class: 'btn primary', onclick: () => this.ok() });
    E.cancelBtn = el('button', { class: 'btn', text: 'Abbrechen', onclick: () => this.tryClose() });
    const foot = el('div', { class: 'chem-foot' }, E.hint, E.cancelBtn, E.okBtn);
    d.append(main, atab, ttab, ftab, ptab, foot);

    /* Ereignisse */
    svg.addEventListener('pointerdown', e => this.onDown(e));
    svg.addEventListener('pointermove', e => this.onMove(e));
    svg.addEventListener('pointerup', e => this.onUp(e));
    svg.addEventListener('pointercancel', () => { if (E.drag) { E.drag = null; E.preview = ''; this.render(); } });
    svg.addEventListener('pointerleave', () => { if (!E.drag && (E.hover || E.preview)) { E.hover = null; E.preview = ''; this.renderOverlay(); } });
    svg.addEventListener('wheel', e => { e.preventDefault(); const r = svg.getBoundingClientRect(); this.zoomBy(Math.exp(-e.deltaY * 0.0015), e.clientX - r.left, e.clientY - r.top); }, { passive: false });
    svg.addEventListener('contextmenu', e => this.onContext(e));
    d.addEventListener('keydown', e => this.onKey(e));
    d.addEventListener('keyup', e => { if (e.key === ' ') E.space = false; });
    back.addEventListener('keydown', e => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); if (E.drag) { this.cancelDrag(); return; } this.tryClose(); } });
    E.onResize = () => { if (this.E) { if (!this._inWin) this.applyWin(); this.applyView(); } };
    window.addEventListener('resize', E.onResize);
    document.body.append(back);
    this.applyWin();
    this.markTool();
    this.markGrid();
    d.classList.toggle('chem-ro', !this.editable());
    E.roNote.hidden = this.editable();
    if (!this.editable()) E.roNote.textContent = this.opts.model === '3d' ? 'Ziehen = drehen · Mausrad = Zoom · zum Zeichnen „Keil/Strich“ wählen' : 'Ziehen = verschieben · Mausrad = Zoom · zum Zeichnen „Keil/Strich“ wählen';
    setTimeout(() => { if (this.E && E.tab === 'struktur') d.focus({ preventScroll: true }); }, 30);
  },
  /* Darstellung (1.28): Keil/Strich und Lewis lassen sich bearbeiten, Bohr/Orbitale/3D nur ansehen (3D drehen) */
  editable() { return ChemModels.editable(this.opts.model); },
  setModel(k) {
    const E = this.E;
    if (!E) return;
    this.closeLabel(true);
    if (this.chargeOldH(E.mol)) UI.toast('Entfernte H als Ladung übernommen (H⁺ abgespalten)');
    this.opts.model = k;
    this.saveOpts();
    E.dlg.classList.toggle('chem-ro', !this.editable());
    for (const b of E.modelBar.children) b.classList.toggle('on', b.dataset.model === k);
    E.sel.clear();
    this.render();
    this.fit(); this.applyView(); this.renderOverlay();
    E.roNote.hidden = this.editable();
    E.roNote.textContent = k === '3d' ? 'Ziehen = drehen · Mausrad = Zoom · zum Zeichnen „Keil/Strich“ wählen' : 'Ziehen = verschieben · Mausrad = Zoom · zum Zeichnen „Keil/Strich“ wählen';
  },
  markGrid() {
    const E = this.E;
    E.gridBtn.classList.toggle('on', !!this.grid.show);
    E.snapBtn.classList.toggle('on', !!this.grid.snap);
    E.gridR.style.display = this.grid.show ? '' : 'none';
  },
  /* Raster-Punkt (nur wenn Ausrichten an und Alt nicht gedrückt) */
  snapP(p, free) {
    if (!this.grid.snap || free) return p;
    const [x, y] = ChemLayout.snapPt(p.x, p.y);
    return { x, y };
  },
  cleanUp() {
    const E = this.E;
    if (!E.mol.atoms.length) return;
    const ids = this.selAtomIds();
    this.change(() => ChemLayout.relayout(E.mol, ids));
    UI.toast(ids.size ? 'Auswahl aufgeräumt' : 'Struktur aufgeräumt');
  },

  setTab(k) {
    const E = this.E;
    E.tab = k;
    for (const t of E.dlg.querySelectorAll('.chem-tab')) t.classList.toggle('on', t.dataset.tab === k);
    for (const p of E.dlg.querySelectorAll('[data-pane]')) p.hidden = p.dataset.pane !== k;
    E.okBtn.hidden = k === 'pse' || k === 'vorlagen';
    E.cancelBtn.textContent = k === 'pse' || k === 'vorlagen' ? 'Schliessen' : 'Abbrechen';
    if (k === 'vorlagen') this.buildTplTab();
    if (k === 'analyse') this.buildAnalyse();
    E.okBtn.textContent = k === 'struktur' || k === 'analyse' ? (E.target ? 'Übernehmen' : 'Einfügen') : 'Formel einfügen';
    E.hint.innerHTML = k === 'struktur'
      ? 'Klick: Bindung anhängen · Ziehen: Richtung · Doppelklick: beschriften · Maus über Atom + Taste: <kbd>C</kbd> <kbd>N</kbd> <kbd>O</kbd> … <kbd>+</kbd> <kbd>−</kbd> <kbd>Entf</kbd> · über Bindung: <kbd>1</kbd> <kbd>2</kbd> <kbd>3</kbd> · Mausrad: Zoom'
      : k === 'formel' ? 'Beispiele: C6H12O6 · Ca(OH)2 · CuSO4·5H2O · SO4^2- · NH4+ · auch Reaktionsgleichungen: 2 H2 + O2 -> 2 H2O'
        : k === 'vorlagen' ? 'Klick auf eine Vorlage fügt sie in die Zeichnung ein (danach verschieben oder weiterzeichnen) · Suche nach Trivialname, IUPAC-Name oder Stichwort'
          : k === 'analyse' ? 'Alle Werte und Spektren werden aus der Zeichnung berechnet (Schätzungen für den Unterricht) · Sicherheitsdaten: Link zur GESTIS-Stoffdatenbank' : 'Element anklicken für Details';
    if (k === 'vorlagen') setTimeout(() => { if (this.E && E.tplInp) E.tplInp.focus(); }, 30);
    if (k === 'formel') setTimeout(() => { if (this.E && E.fInp) { E.fInp.focus(); } }, 30);
    if (k === 'struktur') setTimeout(() => { if (this.E) { this.applyView(); E.dlg.focus({ preventScroll: true }); } }, 30);
  },
  setTool(k) {
    const E = this.E;
    this.closeLabel(true);
    E.tool = k;
    if (k !== 'select') E.sel.clear();
    try { localStorage.setItem('kt-chem-tool', k); } catch (e) { /* */ }
    this.markTool();
    this.renderOverlay();
  },
  markTool() {
    const E = this.E;
    for (const b of E.dlg.querySelectorAll('.chem-tb')) {
      const on = b.dataset.tool === E.tool && (E.tool !== 'el' || b.dataset.el === E.elem);
      b.classList.toggle('on', on);
    }
    const custom = E.tool === 'el' && !this.ELEMS.includes(E.elem);
    E.pseBtn.classList.toggle('on', custom);
    E.pseBtn.innerHTML = custom ? `<b>${E.elem}</b>` : chemIc('pse', 18);
    E.svg.dataset.tool = E.tool;
  },

  /* ---------------------------------------------------------- Ansicht */
  stageSize() { const r = this.E.svg.getBoundingClientRect(); return { w: r.width || 600, h: r.height || 400, r }; },
  applyView() {
    const E = this.E, v = E.view;
    E.vpG.setAttribute('transform', `translate(${v.ox.toFixed(2)} ${v.oy.toFixed(2)}) scale(${v.s.toFixed(4)})`);
    E.zoomLbl.textContent = Math.round(v.s / (40 / BL) * 100) + ' %';
    if (!E.labelInp.hidden && E.labelAtom) this.placeLabel(E.labelAtom);
  },
  center() {
    const E = this.E, { w, h } = this.stageSize();
    E.view = { s: 40 / BL, ox: w / 2, oy: h / 2 };
    this.applyView();
  },
  fit() {
    const E = this.E;
    if (!E.mol.atoms.length) { this.center(); return; }
    const r = ChemRender.draw(E.mol, { ...this.opts, caption: false });
    const { w, h } = this.stageSize();
    const bw = r.box.x1 - r.box.x0 + 60, bh = r.box.y1 - r.box.y0 + 60;
    const s = clamp(Math.min(w / bw, (h - 40) / bh), 0.35, 2.2);
    E.view = { s, ox: w / 2 - (r.box.x0 + r.box.x1) / 2 * s, oy: h / 2 + 10 - (r.box.y0 + r.box.y1) / 2 * s };
    this.applyView();
  },
  zoomBy(f, sx, sy) {
    const E = this.E, v = E.view;
    const { w, h } = this.stageSize();
    if (sx == null) { sx = w / 2; sy = h / 2; }
    const ns = clamp(v.s * f, 0.3, 4);
    const k = ns / v.s;
    v.ox = sx - (sx - v.ox) * k; v.oy = sy - (sy - v.oy) * k; v.s = ns;
    this.applyView();
    this.renderOverlay();
  },
  toWorld(ev) {
    const E = this.E, r = E.svg.getBoundingClientRect();
    return { x: (ev.clientX - r.left - E.view.ox) / E.view.s, y: (ev.clientY - r.top - E.view.oy) / E.view.s };
  },

  /* ---------------------------------------------------------- Modell-Helfer */
  atom(id) { return this.E.mol.atoms.find(a => a.id === id); },
  bond(id) { return this.E.mol.bonds.find(b => b.id === id); },
  bondOf(a, b) { return this.E.mol.bonds.find(x => (x.a === a && x.b === b) || (x.a === b && x.b === a)); },
  neighbors(id) { const out = []; for (const b of this.E.mol.bonds) { if (b.a === id) out.push(b.b); else if (b.b === id) out.push(b.a); } return out; },
  addAtom(el, x, y) {
    const m = this.E.mol;
    const a = { id: m.nid++, el, x, y, q: 0 };
    m.atoms.push(a);
    return a;
  },
  addBond(a, b, o = 1, s = '') {
    if (a === b) return null;
    const ex = this.bondOf(a, b);
    if (ex) return ex;
    const m = this.E.mol;
    const bd = { id: m.nid++, a, b, o, s };
    m.bonds.push(bd);
    return bd;
  },
  atomNear(x, y, r = BL * 0.32, except) {
    let best = null, bd = r;
    for (const a of this.E.mol.atoms) {
      if (a.id === except) continue;
      const d = Math.hypot(a.x - x, a.y - y);
      if (d < bd) { bd = d; best = a; }
    }
    return best;
  },
  removeAtom(id) {
    const m = this.E.mol;
    const nbs = this.neighbors(id);
    m.bonds = m.bonds.filter(b => b.a !== id && b.b !== id);
    m.atoms = m.atoms.filter(a => a.id !== id);
    this.dropLoneCarbons(nbs);
    this.dropDangling();
  },
  // Elektronenpfeile, deren Anfang/Ende an einem gelöschten Atom oder einer gelöschten Bindung hing, mitlöschen (1.54)
  dropDangling() {
    const m = this.E.mol;
    if (!m.objs || !m.objs.length) return;
    const aid = new Set(m.atoms.map(a => a.id)), bid = new Set(m.bonds.map(b => b.id));
    const ok = (e) => !e || (e.at == null || aid.has(e.at)) && (e.bd == null || bid.has(e.bd));
    m.objs = m.objs.filter(o => ok(o.a) && ok(o.b));
  },
  removeBond(id) {
    const m = this.E.mol, b = this.bond(id);
    if (!b) return;
    m.bonds = m.bonds.filter(x => x.id !== id);
    this.dropLoneCarbons([b.a, b.b]);
    this.dropDangling();
  },
  /* wie ChemDraw: unbeschriftete C-Atome ohne Bindung verschwinden */
  dropLoneCarbons(ids) {
    const m = this.E.mol;
    for (const id of ids) {
      const a = this.atom(id);
      if (a && a.el === 'C' && !a.ab && !a.q && !this.neighbors(id).length) m.atoms = m.atoms.filter(x => x.id !== id);
    }
  },
  /* Richtung für eine neue Bindung (120°-Geometrie, Zickzack) */
  newDir(id) {
    const a = this.atom(id);
    const nbs = this.neighbors(id).map(n => this.atom(n));
    const dirs = nbs.map(o => Math.atan2(o.y - a.y, o.x - a.x));
    let cands = [];
    const deg = Math.PI / 180;
    if (!dirs.length) cands = [-30 * deg, 30 * deg, -150 * deg, 150 * deg];
    else if (dirs.length === 1) {
      const t = dirs[0];
      cands = [t + 120 * deg, t - 120 * deg];
      const nb = nbs[0];
      const far = this.neighbors(nb.id).filter(x => x !== id).map(x => this.atom(x));
      const score = (ang) => {
        const px = a.x + Math.cos(ang) * BL, py = a.y + Math.sin(ang) * BL;
        let mn = Infinity;
        for (const o of far) mn = Math.min(mn, Math.hypot(o.x - px, o.y - py));
        if (!far.length) mn = (Math.cos(ang) > 0.1 ? 2 : 0) + (Math.sin(ang) < 0 ? 1 : 0);
        return mn;
      };
      cands.sort((p, q) => score(q) - score(p));
      cands.push(t + 180 * deg, t + 60 * deg, t - 60 * deg);
    } else {
      const s = [...dirs].sort((p, q) => p - q);
      const gaps = s.map((v, i) => { const nx = i + 1 < s.length ? s[i + 1] : s[0] + 2 * Math.PI; return { g: nx - v, mid: (v + nx) / 2 }; });
      gaps.sort((p, q) => q.g - p.g);
      cands = gaps.map(g => g.mid);
    }
    for (const c of cands) {
      const px = a.x + Math.cos(c) * BL, py = a.y + Math.sin(c) * BL;
      const o = this.atomNear(px, py, BL * 0.45, id);
      if (!o || !this.bondOf(id, o.id)) return [Math.cos(c), Math.sin(c)];
    }
    return [Math.cos(cands[0]), Math.sin(cands[0])];
  },
  /* Endpunkt einer neuen Bindung: bestehendes Atom oder neues */
  endAt(x, y, el, from) {
    const o = this.atomNear(x, y, BL * 0.32, from);
    if (o) return o;
    return this.addAtom(el, x, y);
  },
  bondProps(tool) {
    return { b1: [1, ''], b2: [2, ''], b3: [3, ''], bw: [1, 'w'], bh: [1, 'h'], by: [1, 'y'], chain: [1, ''], el: [1, ''] }[tool] || [1, ''];
  },
  applyBondTool(b, tool) {
    if (tool === 'b1') { if (b.s) b.s = ''; else { b.o = b.o >= 3 ? 1 : b.o + 1; delete b.ds; } }
    else if (tool === 'b2') {
      if (b.o !== 2 || b.s) { b.o = 2; b.s = ''; delete b.ds; }
      else { const seq = [undefined, 1, -1, 0]; const i = seq.indexOf(b.ds); const n = seq[(i + 1) % seq.length]; if (n === undefined) delete b.ds; else b.ds = n; }
    } else if (tool === 'b3') { b.o = 3; b.s = ''; delete b.ds; }
    else if (tool === 'bw' || tool === 'bh' || tool === 'by') {
      const s = tool[1];
      if (b.s === s) { const t = b.a; b.a = b.b; b.b = t; } else { b.s = s; b.o = 1; delete b.ds; }
    }
  },

  /* Änderung mit Rückgängig */
  change(fn) {
    const E = this.E;
    const before = JSON.stringify(E.mol);
    fn();
    if (JSON.stringify(E.mol) !== before) { E.undo.push(before); if (E.undo.length > 200) E.undo.shift(); E.redo = []; E.meas = []; }
    this.render();
  },
  undo() {
    const E = this.E;
    if (!E.undo.length) return;
    E.redo.push(JSON.stringify(E.mol));
    E.mol = JSON.parse(E.undo.pop());
    E.sel.clear();
    this.render();
  },
  redo() {
    const E = this.E;
    if (!E.redo.length) return;
    E.undo.push(JSON.stringify(E.mol));
    E.mol = JSON.parse(E.redo.pop());
    E.sel.clear();
    this.render();
  },
  /* Drehen/Spiegeln (Auswahl oder alles) */
  transform(kind, deg) {
    const E = this.E;
    const ids = this.selAtomIds();
    const atoms = ids.size ? E.mol.atoms.filter(a => ids.has(a.id)) : E.mol.atoms;
    if (!atoms.length) return;
    let cx = 0, cy = 0;
    for (const a of atoms) { cx += a.x; cy += a.y; }
    cx /= atoms.length; cy /= atoms.length;
    this.change(() => {
      const t = (deg || 0) * Math.PI / 180, c = Math.cos(t), s = Math.sin(t);
      for (const a of atoms) {
        const dx = a.x - cx, dy = a.y - cy;
        if (kind === 'rot') { a.x = cx + dx * c - dy * s; a.y = cy + dx * s + dy * c; }
        else if (kind === 'flipH') a.x = cx - dx;
        else a.y = cy - dy;
      }
    });
  },
  selAtomIds() {
    const E = this.E, ids = new Set();
    for (const k of E.sel) {
      const [t, v] = k.split(':'), id = +v;
      if (t === 'a') ids.add(id);
      else if (t === 'b') { const b = this.bond(id); if (b) { ids.add(b.a); ids.add(b.b); } }
    }
    return ids;
  },
  deleteSel() {
    const E = this.E;
    if (!E.sel.size) return false;
    this.change(() => {
      const oids = new Set([...E.sel].filter(k => k.startsWith('o:')).map(k => +k.slice(2)));
      if (oids.size) E.mol.objs = (E.mol.objs || []).filter(o => !oids.has(o.id));
      for (const k of E.sel) {
        const [t, v] = k.split(':');
        if (t === 'b') this.removeBond(+v);
      }
      for (const k of E.sel) {
        const [t, v] = k.split(':');
        if (t === 'a' && this.atom(+v)) this.removeAtom(+v);
      }
      E.sel.clear();
    });
    return true;
  },

  /* ---------------------------------------------------------- Treffer */
  hit(p) {
    const E = this.E;
    const rA = Math.max(6, 11 / E.view.s);
    let best = null, bd = rA;
    // Lewis (1.49): die Wasserstoffe sind eigene, anklickbare Elemente – { t: 'h', id: Atom, an dem es hängt, x, y }
    if (this.opts.model === 'lewis' && E.hpos) {
      let hb = Math.max(5, 9 / E.view.s), hh = null;
      for (const q of E.hpos) { const d = Math.hypot(q.x - p.x, q.y - p.y); if (d < hb) { hb = d; hh = { t: 'h', id: q.pid, x: q.x, y: q.y }; } }
      if (hh) return hh;
    }
    // übereinanderliegende Moleküle (1.56): das Ausgewählte liegt „oben“ und gewinnt; mit Alt das darunterliegende
    const pref = (key) => { const on = E.sel.has(key); return E.altHit ? (on ? 1e3 : 0) : (on ? -rA * 0.8 : 0); };
    for (const a of E.mol.atoms) {
      let d = Math.hypot(a.x - p.x, a.y - p.y);
      const rs = E.labels.get(a.id);
      if (rs) for (const r of rs) if (p.x >= r.x0 - 1.5 && p.x <= r.x1 + 1.5 && p.y >= r.y0 - 1.5 && p.y <= r.y1 + 1.5) d = Math.min(d, 2);
      if (d < rA && d + pref('a:' + a.id) < bd) { bd = d + pref('a:' + a.id); best = { t: 'a', id: a.id }; }
    }
    if (best) return best;
    bd = Math.max(4, 7 / E.view.s);
    for (const b of E.mol.bonds) {
      const A = this.atom(b.a), B = this.atom(b.b);
      if (!A || !B) continue;
      const ux = B.x - A.x, uy = B.y - A.y, l2 = ux * ux + uy * uy || 1;
      const t = clamp(((p.x - A.x) * ux + (p.y - A.y) * uy) / l2, 0, 1);
      const d = Math.hypot(A.x + ux * t - p.x, A.y + uy * t - p.y);
      const lim = Math.max(4, 7 / E.view.s);
      if (d < lim && d + pref('b:' + b.id) * 0.5 < bd) { bd = d + pref('b:' + b.id) * 0.5; best = { t: 'b', id: b.id }; }
    }
    return best;
  },
  /* ---------------------------------------------------------- Gruppen (1.56): Atome/Objekte mit gleichem grp gehören
   * zusammen – Klick wählt die ganze Gruppe, Ziehen bewegt sie; übereinanderlegen ohne zu verschmelzen */
  grpOf(key) {
    const [t, v] = key.split(':'), id = +v;
    if (t === 'a') return (this.atom(id) || {}).grp;
    if (t === 'b') { const b = this.bond(id); return b ? (this.atom(b.a) || {}).grp : null; }
    if (t === 'o') return (this.obj(id) || {}).grp;
    return null;
  },
  groupKeys(g) {
    const m = this.E.mol, out = [];
    const ids = new Set(m.atoms.filter(a => a.grp === g).map(a => a.id));
    for (const id of ids) out.push('a:' + id);
    for (const b of m.bonds) if (ids.has(b.a) && ids.has(b.b)) out.push('b:' + b.id);
    for (const o of m.objs || []) if (o.grp === g) out.push('o:' + o.id);
    return out;
  },
  groupSel() {
    const E = this.E;
    const ids = this.selAtomIds(), objs = [...E.sel].filter(k => k.startsWith('o:')).map(k => +k.slice(2));
    // ganze Moleküle: angeschnittene Moleküle vollständig aufnehmen
    for (const f of ChemRender.fragments(E.mol)) if (f.atoms.some(a => ids.has(a.id))) for (const a of f.atoms) ids.add(a.id);
    if (ids.size + objs.length < 2) { UI.toast('Zum Gruppieren mindestens zwei Moleküle oder Objekte auswählen'); return; }
    const g = 1 + Math.max(0, ...E.mol.atoms.map(a => a.grp || 0), ...(E.mol.objs || []).map(o => o.grp || 0));
    this.change(() => { for (const id of ids) { const a = this.atom(id); if (a) a.grp = g; } for (const id of objs) { const o = this.obj(id); if (o) o.grp = g; } });
    E.sel = new Set(this.groupKeys(g));
    this.renderOverlay(); this.renderSide();
    UI.toast('Gruppiert – Klick wählt die ganze Gruppe (Strg+Umschalt+G hebt auf)');
  },
  ungroupSel() {
    const E = this.E;
    const gs = new Set([...E.sel].map(k => this.grpOf(k)).filter(g => g != null));
    if (!gs.size) { UI.toast('Keine Gruppe ausgewählt'); return; }
    this.change(() => { for (const a of E.mol.atoms) if (gs.has(a.grp)) delete a.grp; for (const o of E.mol.objs || []) if (gs.has(o.grp)) delete o.grp; });
    this.renderOverlay(); this.renderSide();
    UI.toast('Gruppierung aufgehoben');
  },
  selHasGroup() { return [...this.E.sel].some(k => this.grpOf(k) != null); },

  /* Objekte des Reaktionsschemas (1.54): Treffer über die gezeichnete Form (getBBox) bzw. Abstand zur Linie */
  obj(id) { return (this.E.mol.objs || []).find(o => o.id === id); },
  objBox(id) {
    const g = this.E.molG.querySelector(`[data-obj="${id}"]`);
    try { const b = g && g.getBBox(); return b ? { x0: b.x, y0: b.y, x1: b.x + b.width, y1: b.y + b.height } : null; } catch (e) { return null; }
  },
  hitObj(p) {
    const E = this.E, tol = Math.max(4, 7 / E.view.s);
    let best = null, bd = tol;
    const seg = (ax, ay, bx, by) => { const ux = bx - ax, uy = by - ay, l2 = ux * ux + uy * uy || 1, t = clamp(((p.x - ax) * ux + (p.y - ay) * uy) / l2, 0, 1); return Math.hypot(ax + ux * t - p.x, ay + uy * t - p.y); };
    for (const o of E.mol.objs || []) {
      let d = Infinity;
      if (o.t === 'arrow') d = seg(o.x1, o.y1, o.x2, o.y2);
      if (o.t === 'curve' || o.t === 'text' || o.t === 'plus' || o.t === 'brk' || (o.t === 'arrow' && d > tol)) {
        const b = this.objBox(o.id);
        if (b && p.x >= b.x0 - 2 && p.x <= b.x1 + 2 && p.y >= b.y0 - 2 && p.y <= b.y1 + 2) d = Math.min(d, o.t === 'brk' ? Math.min(Math.abs(p.x - b.x0), Math.abs(p.x - b.x1)) : 1);
      }
      if (d < bd) { bd = d; best = { t: 'o', id: o.id }; }
    }
    return best;
  },
  hitAll(p) { const h = this.hit(p); return h || this.hitObj(p); },
  /* Anker für Elektronenpfeile: Atom, Bindung oder freier Punkt */
  anchorAt(p, except) {
    const h = this.hit(p);
    if (h && h.t === 'a' && !(except && except.at === h.id)) return { at: h.id };
    if (h && h.t === 'b' && !(except && except.bd === h.id)) return { bd: h.id };
    return { x: p.x, y: p.y };
  },
  addObj(o) { const m = this.E.mol; if (!m.objs) m.objs = []; o.id = m.nid++; m.objs.push(o); return o; },
  /* Umfang der Zeichnung (für „nächste Stufe“) */
  extent() {
    const r = ChemRender.draw(this.E.mol, { ...this.opts, caption: false, nameCap: false });
    return r.box;
  },
  addStep() {
    const E = this.E;
    const b = E.mol.atoms.length || (E.mol.objs || []).length ? this.extent() : { x0: 0, y0: 0, x1: 0, y1: 0 };
    const cy = (b.y0 + b.y1) / 2, x = b.x1 + 18;
    let o;
    this.change(() => { o = this.addObj({ t: 'arrow', k: 'r', x1: x, y1: cy, x2: x + 3.2 * BL, y2: cy, up: '', dn: '' }); E.sel.clear(); E.sel.add('o:' + o.id); });
    if (E.tool !== 'select') this.setTool('select');
    E.sel.add('o:' + o.id);
    this.fit(); this.applyView(); this.renderOverlay();
    this.editArrow(o);
  },
  addPlusRight() {
    const E = this.E;
    if (!E.mol.atoms.length) return;
    const b = this.extent();
    this.change(() => this.addObj({ t: 'plus', x: b.x1 + 18, y: (b.y0 + b.y1) / 2 }));
    this.fit(); this.applyView();
  },
  async editArrow(o) {
    const r = await UI.dialog((d, close) => {
      d.append(el('h2', { text: 'Reaktionspfeil beschriften' }));
      const up = el('textarea', { rows: '2', placeholder: 'über dem Pfeil: Reagenzien, z. B. NaBH4, MeOH' }); up.value = o.up || '';
      const dn = el('textarea', { rows: '2', placeholder: 'unter dem Pfeil: Bedingungen, z. B. 0 °C, 2 h, 85 %' }); dn.value = o.dn || '';
      for (const t of [up, dn]) { t.style.width = '100%'; t.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) close({ up: up.value, dn: dn.value }); }); }
      const kind = el('select');
      for (const [k, t] of [['r', 'Reaktionspfeil →'], ['eq', 'Gleichgewicht ⇌'], ['retro', 'Retrosynthese ⇒'], ['res', 'Mesomerie ↔'], ['no', 'läuft nicht ab ↛']]) kind.append(el('option', { value: k, text: t }));
      kind.value = o.k || 'r';
      d.append(el('label', { text: 'Über dem Pfeil (Reagenzien)' }), up, el('label', { text: 'Unter dem Pfeil (Bedingungen)' }), dn, el('label', { text: 'Pfeilart' }), kind);
      d.append(el('p', { class: 'chem-muted', text: 'Zahlen in Formeln werden tiefgestellt (H2SO4 → H₂SO₄); neue Zeile mit Enter, übernehmen mit Strg+Enter.' }));
      d.append(el('div', { class: 'dlg-btns' }, el('button', { class: 'btn', text: 'Abbrechen', onclick: () => close(null) }), el('button', { class: 'btn primary', text: 'OK', onclick: () => close({ up: up.value, dn: dn.value, k: kind.value }) })));
      setTimeout(() => up.focus(), 30);
    });
    if (!r || !this.E) return;
    this.change(() => { const x = this.obj(o.id); if (x) { x.up = r.up.trim(); x.dn = r.dn.trim(); if (r.k) x.k = r.k; } });
  },
  async editObjText(o, title) {
    const v = await UI.prompt(title || 'Text', o.s || '', { placeholder: 'z. B. Stufe 1, 85 % Ausbeute, ‡' });
    if (v == null || !this.E) return;
    this.change(() => { const x = this.obj(o.id); if (x) { if (!v.trim() && x.t === 'text') this.E.mol.objs = this.E.mol.objs.filter(q => q !== x); else x.s = v; } });
  },
  /* Atome eines Moleküls und Objekte verschieben (Auswahl) */
  moveObj(o, orig, dx, dy) {
    for (const k of ['x', 'x1', 'x2']) if (orig[k] != null) o[k] = orig[k] + dx;
    for (const k of ['y', 'y1', 'y2']) if (orig[k] != null) o[k] = orig[k] + dy;
    for (const e of ['a', 'b']) if (orig[e] && orig[e].x != null) { o[e].x = orig[e].x + dx; o[e].y = orig[e].y + dy; }
  },

  /* ---------------------------------------------------------- Moleküle: welches ist gemeint? (1.54)
   * Ohne Auswahl: das einzige Molekül; bei mehreren keins (die Seitenleiste zeigt dann die Liste). Mit Auswahl: die
   * ganzen Moleküle, die die Auswahl berührt. → { mol, frags } oder null */
  focus() {
    const E = this.E, m = E.mol;
    if (!m.atoms.length) return null;
    const fr = ChemRender.fragments(m);
    const ids = this.selAtomIds();
    const pick = ids.size ? fr.filter(f => [...ids].some(i => f.ids.has(i))) : fr.length === 1 ? fr : [];
    if (!pick.length) return null;
    const set = new Set(pick.flatMap(f => [...f.ids]));
    return { mol: { atoms: m.atoms.filter(a => set.has(a.id)), bonds: m.bonds.filter(b => set.has(b.a) && set.has(b.b)), nid: m.nid }, frags: pick, all: fr.length };
  },
  selectFrag(f) {
    const E = this.E;
    E.sel.clear();
    for (const id of f.ids) E.sel.add('a:' + id);
    for (const b of f.bonds) E.sel.add('b:' + b.id);
    if (E.tool !== 'select') this.setTool('select');
    this.renderOverlay();
    this.renderSide();
  },

  /* ---------------------------------------------------------- Kopieren / Einfügen (1.54)
   * Auswahl (oder alles) als Moleküle + Objekte; im Programm gemerkt (auch nach dem Schliessen) und als SMILES in die
   * Zwischenablage (für ChemDraw, MolView …). Einfügen: eigene Kopie, sonst SMILES oder Molfile aus der Zwischenablage. */
  copySel(cut) {
    const E = this.E, m = E.mol;
    let ids = this.selAtomIds();
    const oids = new Set([...E.sel].filter(k => k.startsWith('o:')).map(k => +k.slice(2)));
    if (!ids.size && !oids.size) { ids = new Set(m.atoms.map(a => a.id)); for (const o of m.objs || []) oids.add(o.id); }
    const clip = { atoms: m.atoms.filter(a => ids.has(a.id)), bonds: m.bonds.filter(b => ids.has(b.a) && ids.has(b.b)), objs: (m.objs || []).filter(o => oids.has(o.id)) };
    clip.smi = '';
    try { clip.smi = ChemProps.smiles({ atoms: clip.atoms, bonds: clip.bonds, nid: m.nid }); } catch (e) { /* */ }
    this.clipMol = JSON.parse(JSON.stringify(clip));
    try { localStorage.setItem('kt-chem-clip', JSON.stringify(this.clipMol)); } catch (e) { /* */ }
    if (clip.smi) navigator.clipboard?.writeText(clip.smi).catch(() => {});
    if (cut) { E.sel = new Set([...[...ids].map(i => 'a:' + i), ...[...oids].map(i => 'o:' + i)]); this.deleteSel(); }
    UI.toast((cut ? 'Ausgeschnitten' : 'Kopiert') + (clip.atoms.length ? ` (${ChemRender.fragments({ atoms: clip.atoms, bonds: clip.bonds }).length} Molekül/e${clip.objs.length ? ', ' + clip.objs.length + ' Pfeile/Texte' : ''})` : '') + ' – Strg+V fügt ein');
  },
  async pasteClip() {
    const E = this.E;
    let txt = null;
    try { txt = await navigator.clipboard.readText(); } catch (e) { txt = null; }
    if (!this.E) return;
    let clip = this.clipMol;
    if (!clip) { try { clip = JSON.parse(localStorage.getItem('kt-chem-clip') || 'null'); } catch (e) { clip = null; } }
    const t = (txt || '').trim();
    if (t && (!clip || t !== clip.smi)) {
      try {
        const nm = /V2000/.test(t) ? ChemProps.parseMolfile(t) : ChemSmiles.toMol(t.split(/\s+/)[0]);
        clip = { atoms: nm.atoms, bonds: nm.bonds, objs: [] };
      } catch (e) { if (!clip) { UI.toast('In der Zwischenablage ist keine Struktur (SMILES, Molfile)'); return; } }
    }
    if (!clip || (!clip.atoms.length && !(clip.objs || []).length)) { UI.toast('Nichts zum Einfügen'); return; }
    this.insertClip(clip);
  },
  insertClip(clip) {
    const E = this.E, m = E.mol;
    // Lage: rechts neben die Zeichnung (oder an die Stelle der Kopie, um eine Bindungslänge versetzt)
    const xs = [...clip.atoms.map(a => a.x), ...(clip.objs || []).flatMap(o => [o.x, o.x1, o.x2].filter(v => v != null))];
    const ys = [...clip.atoms.map(a => a.y), ...(clip.objs || []).flatMap(o => [o.y, o.y1, o.y2].filter(v => v != null))];
    const cx0 = Math.min(...xs), cy0 = (Math.min(...ys) + Math.max(...ys)) / 2;
    let dx = BL, dy = BL;
    if (m.atoms.length && clip.atoms.length) { const b = this.extent(); dx = b.x1 + 2 * BL - cx0; dy = (b.y0 + b.y1) / 2 - cy0; }
    else if (!m.atoms.length) { dx = -cx0; dy = -cy0; }
    this.change(() => {
      const map = new Map();
      E.sel.clear();
      // Gruppen der Kopie bekommen neue Nummern (1.56)
      let gmax = Math.max(0, ...m.atoms.map(a => a.grp || 0), ...(m.objs || []).map(o => o.grp || 0));
      const gmap = new Map(), ng = (g) => { if (g == null) return undefined; if (!gmap.has(g)) gmap.set(g, ++gmax); return gmap.get(g); };
      for (const a of clip.atoms) { const id = m.nid++; map.set(a.id, id); const na = { ...JSON.parse(JSON.stringify(a)), id, x: a.x + dx, y: a.y + dy }; if (na.grp != null) na.grp = ng(na.grp); m.atoms.push(na); E.sel.add('a:' + id); }
      for (const b of clip.bonds) { const id = m.nid++; m.bonds.push({ ...b, id, a: map.get(b.a), b: map.get(b.b) }); E.sel.add('b:' + id); }
      for (const o0 of clip.objs || []) {
        const o = JSON.parse(JSON.stringify(o0));
        this.moveObj(o, JSON.parse(JSON.stringify(o0)), dx, dy);
        for (const e of ['a', 'b']) if (o[e] && o[e].at != null) { if (map.has(o[e].at)) o[e].at = map.get(o[e].at); else { delete o[e].at; } }
        delete o.id;
        if (o.grp != null) o.grp = ng(o.grp);
        const no = this.addObj(o);
        E.sel.add('o:' + no.id);
      }
    });
    if (E.tool !== 'select') { this.setTool('select'); }
    this.fit(); this.applyView(); this.renderOverlay();
  },

  /* ---------------------------------------------------------- Zeiger */
  onDown(ev) {
    const E = this.E;
    E.dlg.focus({ preventScroll: true });
    if (ev.button === 1 || (ev.button === 0 && E.space)) {
      ev.preventDefault();
      E.drag = { kind: 'pan', sx: ev.clientX, sy: ev.clientY, ox: E.view.ox, oy: E.view.oy };
      E.svg.setPointerCapture(ev.pointerId);
      return;
    }
    if (ev.button !== 0) return;
    if (!E.labelInp.hidden) { this.closeLabel(true); return; }
    // Bohr, Orbitale, 3D (1.28): nicht zeichnen – 3D dreht, sonst verschiebt Ziehen die Ansicht
    if (!this.editable()) {
      ev.preventDefault();
      E.drag = this.opts.model === '3d' ? { kind: 'rot3d', sx: ev.clientX, sy: ev.clientY, R: this.opts.rot3d || ChemModels.rotDefault(E.mol) } : { kind: 'pan', sx: ev.clientX, sy: ev.clientY, ox: E.view.ox, oy: E.view.oy };
      E.svg.setPointerCapture(ev.pointerId);
      return;
    }
    // zweiter Klick eines Doppelklicks: nichts tun (Doppelklick öffnet die Beschriftung)
    const now = Date.now(), lc = E.lastDown;
    E.lastDown = { t: now, x: ev.clientX, y: ev.clientY };
    // (eigene Erkennung: das native dblclick fällt aus, wenn der erste Klick die Grafik neu aufbaut)
    if (lc && now - lc.t < 450 && Math.hypot(ev.clientX - lc.x, ev.clientY - lc.y) < 6) {
      E.lastDown = null;
      E.drag = { kind: 'none' };
      E.svg.setPointerCapture(ev.pointerId);
      this.onDbl(ev);
      return;
    }
    E.dblBase = { mol: JSON.stringify(E.mol), undo: E.undo.length, t: now };
    const p = this.toWorld(ev);
    let h = this.hit(p);
    // ein Wasserstoff (Lewis): Radierer = entfernen, Element = ersetzen, Ladung = am Atom; Bindungen/Kette ziehen vom
    // Atom aus (Klick = in Richtung dieses H); Auswählen = das Atom wählen
    if (h && h.t === 'h') {
      const a = this.atom(h.id);
      if (!a) return;
      ev.preventDefault();
      if (E.tool === 'erase') { this.change(() => this.removeH(a)); E.drag = { kind: 'none' }; E.svg.setPointerCapture(ev.pointerId); return; }
      if (E.tool === 'qp' || E.tool === 'qm') { this.change(() => { a.q = clamp((a.q || 0) + (E.tool === 'qp' ? 1 : -1), -4, 4); }); E.drag = { kind: 'none' }; E.svg.setPointerCapture(ev.pointerId); return; }
      if (/^b[123why]$|^el$|^chain$/.test(E.tool)) {
        const d = E.drag = { kind: E.tool, start: { x: a.x, y: a.y }, p, h: { t: 'a', id: a.id }, hH: h, moved: false, shift: ev.shiftKey, before: JSON.stringify(E.mol) };
        d.start = { x: h.x, y: h.y };
        E.svg.setPointerCapture(ev.pointerId);
        return;
      }
      h = { t: 'a', id: a.id };
    }
    if (E.tool === 'select' && ev.altKey) { E.altHit = true; h = this.hit(p) || h; E.altHit = false; }
    if ((E.tool === 'select' || E.tool === 'erase') && !h) h = this.hitObj(p);
    const d = E.drag = { kind: E.tool, start: p, p, h, moved: false, shift: ev.shiftKey, before: JSON.stringify(E.mol) };
    E.svg.setPointerCapture(ev.pointerId);
    if (E.tool === 'e2' || E.tool === 'e1') d.anchor = this.anchorAt(p);
    if (E.tool === 'select') {
      if (h) {
        const key = h.t + ':' + h.id;
        if (ev.shiftKey || ev.ctrlKey) { const g = this.grpOf(key), ks = g != null ? this.groupKeys(g) : [key]; if (E.sel.has(key)) ks.forEach(k2 => E.sel.delete(k2)); else ks.forEach(k2 => E.sel.add(k2)); d.kind = 'none'; }
        else {
          if (!E.sel.has(key)) { E.sel.clear(); E.sel.add(key); }
          const g = this.grpOf(key);
          if (g != null) for (const k2 of this.groupKeys(g)) E.sel.add(k2);
          d.kind = 'move';
          const ids = this.selAtomIds();
          d.orig = new Map([...ids].map(id => { const a = this.atom(id); return [id, [a.x, a.y]]; }));
          d.origO = new Map([...E.sel].filter(k => k.startsWith('o:')).map(k => +k.slice(2)).map(id => [id, JSON.parse(JSON.stringify(this.obj(id) || {}))]));
        }
      } else {
        if (!ev.shiftKey && !ev.ctrlKey) E.sel.clear();
        d.kind = 'marquee';
      }
      this.renderOverlay();
    } else if (E.tool === 'erase') {
      this.eraseAt(h);
    }
  },
  onMove(ev) {
    const E = this.E;
    const p = this.toWorld(ev);
    const d = E.drag;
    if (!d && !this.editable()) return;
    if (!d) {
      const h = this.hit(p);
      const changed = JSON.stringify(h) !== JSON.stringify(E.hover);
      E.hover = h;
      if (/^r\d$|^benz$/.test(E.tool)) { this.ringPreview(p, h); this.renderOverlay(); }
      else if (changed || E.preview) { E.preview = ''; this.renderOverlay(); }
      this.status(h);
      return;
    }
    if (d.kind === 'pan') {
      E.view.ox = d.ox + ev.clientX - d.sx; E.view.oy = d.oy + ev.clientY - d.sy;
      this.applyView();
      return;
    }
    if (d.kind === 'rot3d') {
      this.opts.rot3d = ChemModels.rotate(d.R, ev.clientX - d.sx, ev.clientY - d.sy);
      if (!this._rotRaf) this._rotRaf = requestAnimationFrame(() => { this._rotRaf = null; if (this.E) this.renderQuick(); });
      return;
    }
    d.p = p;
    if (d.kind === 'none' || !d.start) return;   // z. B. nach einem Doppelklick: nichts ziehen
    if (!d.moved && Math.hypot(p.x - d.start.x, p.y - d.start.y) * E.view.s < 4) return;
    d.moved = true;
    d.alt = ev.altKey; d.shift = ev.shiftKey;
    const k = d.kind;
    if (k === 'move') {
      let dx = p.x - d.start.x, dy = p.y - d.start.y;
      if (this.grid.snap && !ev.altKey) {
        const anchor = d.h && d.h.t === 'a' && d.orig.has(d.h.id) ? d.orig.get(d.h.id) : d.orig.values().next().value;
        if (anchor) { const q = ChemLayout.snapPt(anchor[0] + dx, anchor[1] + dy); dx = q[0] - anchor[0]; dy = q[1] - anchor[1]; }
      }
      for (const [id, [x, y]] of d.orig) { const a = this.atom(id); if (a) { a.x = x + dx; a.y = y + dy; } }
      if (d.origO) for (const [id, o0] of d.origO) { const o = this.obj(id); if (o) this.moveObj(o, o0, dx, dy); }
      this.renderQuick();
    } else if (k === 'marquee') {
      const x0 = Math.min(d.start.x, p.x), y0 = Math.min(d.start.y, p.y);
      E.preview = `<rect x="${x0}" y="${y0}" width="${Math.abs(p.x - d.start.x)}" height="${Math.abs(p.y - d.start.y)}" class="chem-marq"/>`;
      this.renderOverlay();
    } else if (k === 'erase') {
      this.eraseAt(this.hitAll(p));
    } else if (/^arr_/.test(k)) {
      const q = this.arrowEnd(d.start, p, d.alt);
      E.preview = `<line x1="${d.start.x}" y1="${d.start.y}" x2="${q.x}" y2="${q.y}" class="chem-prev"/><circle cx="${q.x}" cy="${q.y}" r="3" class="chem-prev-at"/>`;
      this.renderOverlay();
    } else if (k === 'e2' || k === 'e1') {
      const A = ChemRender.objPos(E.mol, d.anchor), tgt = this.anchorAt(p, d.anchor), B = ChemRender.objPos(E.mol, tgt);
      const dx = B.x - A.x, dy = B.y - A.y, L = Math.hypot(dx, dy) || 1, h2 = Math.max(14, L * 0.42);
      E.preview = `<path d="M${A.x},${A.y} Q${(A.x + B.x) / 2 - dy / L * h2},${(A.y + B.y) / 2 + dx / L * h2} ${B.x},${B.y}" class="chem-prev" fill="none"/>` + (tgt.at != null || tgt.bd != null ? `<circle cx="${B.x}" cy="${B.y}" r="7" class="chem-prev-at"/>` : '');
      this.renderOverlay();
    } else if (k === 'brk') {
      const x0 = Math.min(d.start.x, p.x), y0 = Math.min(d.start.y, p.y);
      E.preview = `<rect x="${x0}" y="${y0}" width="${Math.abs(p.x - d.start.x)}" height="${Math.abs(p.y - d.start.y)}" class="chem-marq"/>`;
      this.renderOverlay();
    } else if (/^b[123why]$|^el$/.test(k)) {
      if (d.h && d.h.t === 'b') return;
      const s = d.h && d.h.t === 'a' ? this.atom(d.h.id) : this.snapP(d.start, d.alt);
      const end = this.dragEnd(s, p, d.h && d.h.t === 'a' ? d.h.id : null, d.alt);
      d.end = end;
      E.preview = `<line x1="${s.x}" y1="${s.y}" x2="${end.x}" y2="${end.y}" class="chem-prev"/>` + (end.atom ? `<circle cx="${end.x}" cy="${end.y}" r="7" class="chem-prev-at"/>` : '');
      this.renderOverlay();
    } else if (k === 'chain') {
      const s = d.h && d.h.t === 'a' ? this.atom(d.h.id) : this.snapP(d.start, d.alt);
      d.chain = this.chainPoints(s, p, d.shift, d.alt);
      const pts = [[s.x, s.y], ...d.chain];
      const last = pts[pts.length - 1];
      E.preview = `<polyline points="${pts.map(q => q.join(',')).join(' ')}" class="chem-prev"/><text x="${last[0] + 8}" y="${last[1] - 8}" class="chem-prev-n">${d.chain.length}</text>`;
      this.renderOverlay();
    }
  },
  onUp(ev) {
    const E = this.E, d = E.drag;
    if (!d) return;
    try { E.svg.releasePointerCapture(ev.pointerId); } catch (e) { /* */ }
    E.drag = null;
    E.preview = '';
    if (d.kind === 'pan' || d.kind === 'none') { this.renderOverlay(); return; }
    if (d.kind === 'rot3d') {
      // Klick ohne Drehen im Messmodus (1.52): Atom wählen – 2 = Abstand, 3 = Winkel, 4 = Diederwinkel
      if (E.measure && Math.hypot(ev.clientX - d.sx, ev.clientY - d.sy) < 5 && E.pts3) {
        this.opts.rot3d = d.R;
        const p = this.toWorld(ev);
        let best = null, bd = 14 / E.view.s;
        for (const q of E.pts3) { const dd = Math.hypot(q.x - p.x, q.y - p.y); if (dd < bd || (best && Math.abs(dd - bd) < 1 && q.z > best.z)) { bd = dd; best = q; } }
        if (best) {
          if (!E.meas || E.meas.length >= 4) E.meas = [];
          const k = E.meas.indexOf(best.i);
          if (k >= 0) E.meas.splice(k, 1); else E.meas.push(best.i);
        }
      }
      this.saveOpts(); this.render(); return;
    }
    const p = this.toWorld(ev);
    const tool = d.kind, h = d.h;
    const before = d.before;
    const commit = () => {
      if (JSON.stringify(E.mol) !== before) { E.undo.push(before); if (E.undo.length > 200) E.undo.shift(); E.redo = []; }
      this.render();
    };
    if (tool === 'move') {
      if (d.moved && d.orig.size === 1) {
        // einzelnes Atom auf ein anderes gezogen: verschmelzen
        const [id] = d.orig.keys();
        const a = this.atom(id), o = a && this.atomNear(a.x, a.y, BL * 0.3, id);
        if (o && !this.bondOf(id, o.id) && a.grp == null && o.grp == null) {
          for (const b of E.mol.bonds) { if (b.a === id) b.a = o.id; if (b.b === id) b.b = o.id; }
          E.mol.atoms = E.mol.atoms.filter(x => x.id !== id);
          const seen = new Set();
          E.mol.bonds = E.mol.bonds.filter(b => { const k = Math.min(b.a, b.b) + '-' + Math.max(b.a, b.b); if (b.a === b.b || seen.has(k)) return false; seen.add(k); return true; });
          E.sel.clear();
        }
      }
      commit();
      return;
    }
    if (tool === 'marquee') {
      if (d.moved) {
        const x0 = Math.min(d.start.x, p.x), x1 = Math.max(d.start.x, p.x), y0 = Math.min(d.start.y, p.y), y1 = Math.max(d.start.y, p.y);
        const inside = (a) => a.x >= x0 && a.x <= x1 && a.y >= y0 && a.y <= y1;
        for (const a of E.mol.atoms) if (inside(a)) E.sel.add('a:' + a.id);
        for (const b of E.mol.bonds) { const A = this.atom(b.a), B = this.atom(b.b); if (A && B && inside(A) && inside(B)) E.sel.add('b:' + b.id); }
        for (const o of E.mol.objs || []) { const bb = this.objBox(o.id); if (bb && bb.x0 >= x0 && bb.x1 <= x1 && bb.y0 >= y0 && bb.y1 <= y1) E.sel.add('o:' + o.id); }
      }
      this.renderOverlay();
      this.renderSide();
      return;
    }
    // Reaktionsschema (1.54)
    if (/^arr_/.test(tool)) {
      const q = d.moved ? this.arrowEnd(d.start, p, d.alt) : { x: d.start.x + 3.2 * BL, y: d.start.y };
      if (Math.hypot(q.x - d.start.x, q.y - d.start.y) > 8) this.addObj({ t: 'arrow', k: tool.slice(4), x1: d.start.x, y1: d.start.y, x2: q.x, y2: q.y, up: '', dn: '' });
      commit();
      return;
    }
    if (tool === 'e2' || tool === 'e1') {
      if (d.moved) {
        const b2 = this.anchorAt(p, d.anchor);
        const A = ChemRender.objPos(E.mol, d.anchor), B = ChemRender.objPos(E.mol, b2);
        const a2 = { ...d.anchor, x: A.x, y: A.y }, bb = { ...b2, x: B.x, y: B.y };
        if (Math.hypot(B.x - A.x, B.y - A.y) > 6) this.addObj({ t: 'curve', k: tool, a: a2, b: bb, bend: 1 });
      }
      commit();
      return;
    }
    if (tool === 'brk') {
      if (d.moved && Math.abs(p.x - d.start.x) > 10 && Math.abs(p.y - d.start.y) > 10) this.addObj({ t: 'brk', x1: d.start.x, y1: d.start.y, x2: p.x, y2: p.y, s: '‡' });
      commit();
      return;
    }
    if (tool === 'plus') { if (!d.moved) this.addObj({ t: 'plus', x: p.x, y: p.y }); commit(); return; }
    if (tool === 'atext') {
      if (d.moved) { this.render(); return; }
      const ho = this.hitObj(p), o = ho && this.obj(ho.id);
      if (o && o.t === 'text') { this.editObjText(o); return; }
      const nt = this.addObj({ t: 'text', x: p.x, y: p.y, s: '' });
      this.render();
      this.editObjText(nt, 'Text einfügen');
      return;
    }
    if (tool === 'lp' || tool === 'rad' || tool === 'dp' || tool === 'dm') {
      if (h && h.t === 'a') {
        const a = this.atom(h.id);
        if (tool === 'lp') { a.lpv = clamp((a.lpv || 0) + (ev.shiftKey ? -1 : 1), 0, 3); if (!a.lpv) delete a.lpv; }
        else if (tool === 'rad') {
          if (a.rad) { a.rad--; if (a.hd) a.hd--; if (!a.rad) delete a.rad; if (!a.hd) delete a.hd; }
          else { const h0 = ChemMol.hCount(ChemMol.index(E.mol), a); if (h0 > 0) this.removeH(a, 'r'); else a.rad = 1; }
        } else { const v = tool === 'dp' ? '+' : '-'; if (a.pc === v) delete a.pc; else a.pc = v; }
      }
      commit();
      return;
    }
    if (tool === 'erase') { commit(); return; }
    if (/^b[123why]$|^el$|^chain$/.test(tool)) {
      if (d.hH && (!d.moved || (tool === 'chain' && (!d.chain || !d.chain.length)))) {
        this.substituteH(this.atom(d.hH.id), d.hH, tool === 'el' ? E.elem : 'C', tool);
      } else if (!d.moved || (tool === 'chain' && (!d.chain || !d.chain.length))) {
        this.clickBond(tool, h, d.start);
      } else if (tool === 'chain') {
        const sp = this.snapP(d.start, d.alt);
        let prev = h && h.t === 'a' ? this.atom(h.id) : this.endAt(sp.x, sp.y, 'C', null);
        for (const [x, y] of d.chain) {
          const nx = this.endAt(x, y, 'C', prev.id);
          this.addBond(prev.id, nx.id, 1, '');
          prev = nx;
        }
      } else if (!(h && h.t === 'b')) {
        const sp = this.snapP(d.start, d.alt);
        const s = h && h.t === 'a' ? this.atom(h.id) : this.endAt(sp.x, sp.y, 'C', null);
        const end = d.end || this.dragEnd(s, p, s.id, d.alt);
        const t = end.atom ? this.atom(end.atom) : this.addAtom(tool === 'el' ? E.elem : 'C', end.x, end.y);
        const ex = this.bondOf(s.id, t.id);
        if (ex) this.applyBondTool(ex, tool);
        else { const [o, st] = this.bondProps(tool); this.addBond(s.id, t.id, o, st); }
      }
      commit();
      return;
    }
    if (d.moved) { this.render(); return; }
    if (/^r\d$|^benz$/.test(tool)) {
      const R = this.ringGeom(tool, p, h);
      if (R) this.commitRing(R, tool === 'benz');
      commit();
      return;
    }
    if (tool === 'text') {
      if (h && h.t === 'a') { this.openLabel(h.id); return; }
      if (!h) { const q = this.snapP(p); const a = this.addAtom('C', q.x, q.y); this.render(); this.openLabel(a.id, before); }
      return;
    }
    if (tool === 'qp' || tool === 'qm') {
      if (h && h.t === 'a') { const a = this.atom(h.id); a.q = clamp((a.q || 0) + (tool === 'qp' ? 1 : -1), -4, 4); }
      commit();
      return;
    }
    this.render();
  },
  cancelDrag() {
    const E = this.E, d = E.drag;
    if (!d) return;
    E.drag = null; E.preview = '';
    if (d.before) E.mol = JSON.parse(d.before);
    this.render();
  },
  /* Wasserstoffe in der Lewis-Schreibweise (1.49) */
  /* H entfernen (1.49, seit 1.53 mit Ladung): mode 'p' = als Proton H⁺ (Atom wird negativ, z. B. R–OH → R–O⁻),
   * 'h' = als Hydrid H⁻ (Atom wird positiv, z. B. CH₄ → CH₃⁺), 'r' = als Radikal H· (Atom behält die Ladung, a.rad).
   * Die Ladung steht damit in jeder Darstellung (auch Keil/Strich) – sie geht nicht verloren. a.hq merkt sich die
   * Zahl abgespaltener Protonen (+) bzw. Hydride (−), damit „wiederherstellen“ die Ladung zurücknimmt. Lässt sich
   * die Abspaltung nicht als Ion darstellen (H-Zahl würde nicht kleiner), wird sie zum Radikal. */
  removeH(a, mode = 'p', mol) {
    if (!a) return;
    const idx = ChemMol.index(mol || this.E.mol), h0 = ChemMol.hCount(idx, a);
    if (h0 <= 0) return;
    if (mode !== 'r') {
      const q0 = a.q || 0, dq = mode === 'h' ? 1 : -1;
      a.q = q0 + dq;
      if (Math.abs(a.q) <= 4 && ChemMol.hCount(idx, a) === h0 - 1) { a.hq = (a.hq || 0) - dq; if (!a.hq) delete a.hq; if (!a.q) delete a.q; return; }
      a.q = q0; if (!a.q) delete a.q;
    }
    a.hd = (a.hd || 0) + 1;
    a.rad = (a.rad || 0) + 1;
  },
  restoreH(a) {
    if (!a) return;
    if (a.hq) { a.q = (a.q || 0) + a.hq; if (!a.q) delete a.q; delete a.hq; }
    delete a.hd; delete a.rad;
  },
  removedH(a) { return (a.hd || 0) + Math.abs(a.hq || 0); },
  /* ältere Zeichnungen (1.49–1.52): entfernte H ohne Ladung (hd ohne rad) → als Protonen mit Ladung (beim Öffnen
   * bzw. spätestens beim Wechsel der Darstellung, damit Keil/Strich die Information zeigt) */
  chargeOldH(m) {
    let n = 0;
    for (const a of m.atoms) {
      if (!a.hd || a.rad) continue;
      const k = a.hd;
      delete a.hd;
      for (let i = 0; i < k; i++) this.removeH(a, 'p', m);
      n++;
    }
    return n;
  },
  /* H an Atom a (Lage hh) durch ein Element (bzw. eine Gruppe) ersetzen: neues Atom in Richtung dieses H */
  substituteH(a, hh, el, tool) {
    if (!a) return;
    const dx = hh.x - a.x, dy = hh.y - a.y, l = Math.hypot(dx, dy) || 1;
    const t = this.endAt(a.x + dx / l * BL, a.y + dy / l * BL, el === 'OH' || el === 'NH2' || el === 'CH3' ? el[0] : el, a.id);
    const [o, st] = tool ? this.bondProps(tool === 'el' || tool === 'chain' ? 'b1' : tool) : [1, ''];
    if (!this.bondOf(a.id, t.id)) this.addBond(a.id, t.id, o, st);
  },
  /* Klick (ohne Ziehen) mit Bindungs-, Ketten- oder Element-Werkzeug */
  clickBond(tool, h, p) {
    const E = this.E;
    if (h && h.t === 'b') { if (tool !== 'el' && tool !== 'chain') this.applyBondTool(this.bond(h.id), tool); return; }
    if (h && h.t === 'a') {
      const a = this.atom(h.id);
      if (tool === 'el' && (a.el !== E.elem || a.ab)) { a.el = E.elem; delete a.ab; return; }
      const dir = this.newDir(a.id);
      const t = this.endAt(a.x + dir[0] * BL, a.y + dir[1] * BL, tool === 'el' ? E.elem : 'C', a.id);
      const [o, st] = this.bondProps(tool);
      if (!this.bondOf(a.id, t.id)) this.addBond(a.id, t.id, o, st);
      return;
    }
    p = this.snapP(p);
    if (tool === 'el') { this.addAtom(E.elem, p.x, p.y); return; }
    const a = this.addAtom('C', p.x, p.y);
    const t = this.addAtom('C', p.x + Math.cos(-Math.PI / 6) * BL, p.y + Math.sin(-Math.PI / 6) * BL);
    const [o, st] = this.bondProps(tool);
    this.addBond(a.id, t.id, o, st);
  },
  dragEnd(s, p, fromId, free) {
    const o = this.atomNear(p.x, p.y, BL * 0.35, fromId);
    if (o) return { x: o.x, y: o.y, atom: o.id };
    let ang = Math.atan2(p.y - s.y, p.x - s.x);
    if (!free && this.grid.snap) { const st = Math.PI / 3, o = Math.PI / 6; ang = Math.round((ang - o) / st) * st + o; }
    else if (!free) { const st = Math.PI / 12; ang = Math.round(ang / st) * st; }
    const x = s.x + Math.cos(ang) * BL, y = s.y + Math.sin(ang) * BL;
    const o2 = this.atomNear(x, y, BL * 0.25, fromId);
    if (o2) return { x: o2.x, y: o2.y, atom: o2.id };
    return { x, y, atom: null };
  },
  chainPoints(s, p, flip, free) {
    let ang = Math.atan2(p.y - s.y, p.x - s.x);
    if (!free) { const st = this.grid.snap ? Math.PI / 3 : Math.PI / 6; ang = Math.round(ang / st) * st; }
    const dist = Math.hypot(p.x - s.x, p.y - s.y);
    const step = BL * Math.cos(Math.PI / 6);
    const n = clamp(Math.round(dist / step), 1, 40);
    const ux = Math.cos(ang), uy = Math.sin(ang);
    let vx = uy, vy = -ux; // „nach oben“ bei Ziehen nach rechts
    if (vy > 0.01 || (Math.abs(vy) <= 0.01 && vx < 0)) { vx = -vx; vy = -vy; }
    if (flip) { vx = -vx; vy = -vy; }
    const out = [];
    for (let k = 1; k <= n; k++) {
      const off = k % 2 ? BL * 0.5 : 0;
      out.push([s.x + ux * step * k + vx * off, s.y + uy * step * k + vy * off]);
    }
    return out;
  },
  eraseAt(h) {
    if (!h) return;
    if (h.t === 'o') { this.E.mol.objs = (this.E.mol.objs || []).filter(o => o.id !== h.id); this.E.hover = null; this.renderQuick(); return; }
    if (h.t === 'a') this.removeAtom(h.id); else this.removeBond(h.id);
    this.E.hover = null;
    this.renderQuick();
  },

  /* Pfeilende: auf 15°-Schritte einrasten (fast waagrecht = waagrecht), Alt = frei */
  arrowEnd(s, p, free) {
    if (free) return { x: p.x, y: p.y };
    const dx = p.x - s.x, dy = p.y - s.y, L = Math.hypot(dx, dy) || 1;
    const a = Math.round(Math.atan2(dy, dx) / (Math.PI / 12)) * (Math.PI / 12);
    return { x: s.x + Math.cos(a) * L, y: s.y + Math.sin(a) * L };
  },

  /* ---------------------------------------------------------- Ringe */
  ringGeom(tool, p, h) {
    const n = tool === 'benz' ? 6 : +tool.slice(1);
    const R = BL / (2 * Math.sin(Math.PI / n)), ap = BL / (2 * Math.tan(Math.PI / n));
    const step = 2 * Math.PI / n;
    let cx, cy, a0, dirSign = 1;
    if (h && h.t === 'b') {
      const b = this.bond(h.id), A = this.atom(b.a), B = this.atom(b.b);
      const mx = (A.x + B.x) / 2, my = (A.y + B.y) / 2;
      const ux = B.x - A.x, uy = B.y - A.y, l = Math.hypot(ux, uy) || 1;
      const nx = -uy / l, ny = ux / l;
      let tot = 0;
      for (const X of [A, B]) for (const id of this.neighbors(X.id)) { if (id === A.id || id === B.id) continue; const o = this.atom(id); tot += Math.sign(nx * (o.x - mx) + ny * (o.y - my)); }
      let side = tot > 0 ? -1 : tot < 0 ? 1 : (Math.sign(nx * (p.x - mx) + ny * (p.y - my)) || 1);
      cx = mx + nx * ap * side; cy = my + ny * ap * side;
      a0 = Math.atan2(A.y - cy, A.x - cx);
      const aB = Math.atan2(B.y - cy, B.x - cx);
      let dd = aB - a0;
      while (dd > Math.PI) dd -= 2 * Math.PI;
      while (dd < -Math.PI) dd += 2 * Math.PI;
      dirSign = dd > 0 ? 1 : -1;
      const sc = l / BL; // Bindung kann anders lang sein
      return { verts: Array.from({ length: n }, (_, k) => k === 0 ? [A.x, A.y] : k === 1 ? [B.x, B.y] : [cx + R * sc * Math.cos(a0 + dirSign * k * step), cy + R * sc * Math.sin(a0 + dirSign * k * step)]), n };
    }
    if (h && h.t === 'a') {
      const A = this.atom(h.id);
      const dir = this.neighbors(A.id).length ? this.newDir(A.id) : [0, -1];
      cx = A.x + dir[0] * R; cy = A.y + dir[1] * R;
      a0 = Math.atan2(A.y - cy, A.x - cx);
      return { verts: Array.from({ length: n }, (_, k) => k === 0 ? [A.x, A.y] : [cx + R * Math.cos(a0 + k * step), cy + R * Math.sin(a0 + k * step)]), n };
    }
    a0 = -Math.PI / 2;
    const c = this.snapP(p);
    return { verts: Array.from({ length: n }, (_, k) => [c.x + R * Math.cos(a0 + k * step), c.y + R * Math.sin(a0 + k * step)]), n };
  },
  ringPreview(p, h) {
    const R = this.ringGeom(this.E.tool, p, h);
    this.E.preview = R ? `<polygon points="${R.verts.map(v => v.map(x => x.toFixed(1)).join(',')).join(' ')}" class="chem-prev ring"/>` : '';
  },
  commitRing(R, aromatic) {
    const ids = R.verts.map(([x, y]) => this.endAt(x, y, 'C', null).id);
    const bonds = [];
    for (let k = 0; k < ids.length; k++) {
      const a = ids[k], b = ids[(k + 1) % ids.length];
      bonds.push(this.bondOf(a, b) || this.addBond(a, b, 1, ''));
    }
    if (!aromatic) return;
    const dbl = (id, except) => this.E.mol.bonds.filter(b => (b.a === id || b.b === id) && b.o >= 2 && !except.has(b)).length;
    let best = null;
    for (const ph of [0, 1]) {
      const set = new Set(bonds.filter((_, k) => k % 2 === ph));
      let conf = 0;
      for (const id of ids) {
        const mine = bonds.filter(b => set.has(b) && (b.a === id || b.b === id)).length;
        conf += Math.max(0, dbl(id, set) + mine - 1);
      }
      if (!best || conf < best.conf) best = { conf, set };
    }
    for (const b of best.set) {
      if (b.o >= 2) continue;
      const okA = dbl(b.a, new Set([b])) === 0, okB = dbl(b.b, new Set([b])) === 0;
      if (okA && okB) { b.o = 2; b.s = ''; }
    }
  },

  /* ---------------------------------------------------------- Beschriftung */
  openLabel(id, beforeNew) {
    const E = this.E, a = this.atom(id);
    if (!a) return;
    E.labelAtom = id;
    E.labelNew = beforeNew || null;
    const inp = E.labelInp;
    inp.value = a.ab || (a.el === 'C' && !a.q ? '' : a.el + (a.q ? chemChargeTxt(a.q).replace('−', '-') : ''));
    inp.hidden = false;
    inp.classList.remove('err');
    this.placeLabel(id);
    inp.onkeydown = (e) => {
      e.stopPropagation();
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); this.closeLabel(true); }
      else if (e.key === 'Escape') { e.preventDefault(); this.closeLabel(false); }
    };
    inp.onblur = () => setTimeout(() => { if (this.E && !E.labelInp.hidden && document.activeElement !== E.labelInp) this.closeLabel(true); }, 0);
    setTimeout(() => { inp.focus({ preventScroll: true }); inp.select(); }, 10);
  },
  placeLabel(id) {
    const E = this.E, a = this.atom(id);
    if (!a) return;
    E.labelInp.style.left = Math.round(a.x * E.view.s + E.view.ox - 34) + 'px';
    E.labelInp.style.top = Math.round(a.y * E.view.s + E.view.oy - 14) + 'px';
  },
  parseLabel(v) {
    v = v.trim().replace(/−/g, '-');
    if (!v) return { clear: true };
    if (CHEM_BY_SYM[v] && v !== 'D') return { el: v, q: 0 };
    if (CHEM_ABBR[v]) return { ab: v };
    const lc = CHEM_ABBR_LC[v.toLowerCase()];
    if (lc) return { ab: lc };
    const m = v.match(/^([A-Za-z]{1,2})\s*(?:(\d*)([+-])|([+-])(\d*))?$/);
    if (m) {
      const sym = m[1][0].toUpperCase() + m[1].slice(1).toLowerCase();
      if (CHEM_BY_SYM[sym] && sym !== 'D') {
        let q = 0;
        if (m[3]) q = (m[3] === '+' ? 1 : -1) * (m[2] ? +m[2] : 1);
        if (m[4]) q = (m[4] === '+' ? 1 : -1) * (m[5] ? +m[5] : 1);
        return { el: sym, q };
      }
    }
    return null;
  },
  closeLabel(apply) {
    const E = this.E;
    if (!E || E.labelInp.hidden) return;
    const inp = E.labelInp, id = E.labelAtom, a = this.atom(id);
    if (apply && a) {
      const r = this.parseLabel(inp.value);
      if (!r) {
        inp.classList.add('err');
        UI.toast('Unbekannt: «' + inp.value + '» – Element (N, Cl, Na+) oder Kurzschreibweise (OH, NH2, COOH, Ph …)');
        setTimeout(() => inp.focus(), 0);
        return;
      }
      const before = E.labelNew || JSON.stringify(E.mol);
      if (r.clear) {
        if (E.labelNew && a.el === 'C' && !this.neighbors(id).length) E.mol.atoms = E.mol.atoms.filter(x => x.id !== id);
        else { a.el = 'C'; a.q = 0; delete a.ab; }
      } else if (r.ab) { a.ab = r.ab; a.el = ChemMol.fragment(r.ab).atoms[0].el; a.q = 0; }
      else { a.el = r.el; a.q = r.q; delete a.ab; }
      if (JSON.stringify(E.mol) !== before) { E.undo.push(before); E.redo = []; }
    } else if (!apply && E.labelNew) {
      E.mol = JSON.parse(E.labelNew);
    }
    inp.hidden = true;
    inp.onblur = null;
    E.labelAtom = null; E.labelNew = null;
    E.dlg.focus({ preventScroll: true });
    this.render();
  },

  onDbl(ev) {
    const E = this.E;
    const p = this.toWorld(ev);
    // Reaktionsschema (1.54): Pfeil = beschriften, Text/Klammer = Text ändern, Elektronenpfeil = Bogen umkehren
    if (!this.hit(p)) {
      const ho = this.hitObj(p), o = ho && this.obj(ho.id);
      if (o) {
        if (o.t === 'arrow') this.editArrow(o);
        else if (o.t === 'text') this.editObjText(o);
        else if (o.t === 'brk') this.editObjText(o, 'Beschriftung der Klammer (z. B. ‡)');
        else if (o.t === 'curve') this.change(() => { o.bend = -(o.bend || 1); });
        return;
      }
    }
    const h = this.hit(p);
    if (!h) return;
    if (E.tool === 'select') {
      // ganzes Fragment auswählen
      const start = h.t === 'a' ? h.id : this.bond(h.id).a;
      const seen = new Set([start]), st = [start];
      while (st.length) { const c = st.pop(); for (const n of this.neighbors(c)) if (!seen.has(n)) { seen.add(n); st.push(n); } }
      for (const id of seen) E.sel.add('a:' + id);
      for (const b of E.mol.bonds) if (seen.has(b.a)) E.sel.add('b:' + b.id);
      this.renderOverlay();
      return;
    }
    if (E.tool === 'erase') return;
    // was der erste Klick angehängt hat, wieder entfernen
    const base = E.dblBase;
    if (base && Date.now() - base.t < 1500 && h.t === 'a' && JSON.stringify(E.mol) !== base.mol) {
      const m = JSON.parse(base.mol);
      if (m.atoms.some(a => a.id === h.id)) { E.mol = m; E.undo.length = Math.min(E.undo.length, base.undo); this.render(); }
    }
    E.dblBase = null;
    if (h.t === 'a' && this.atom(h.id)) { ev.preventDefault(); this.openLabel(h.id); }
  },
  onContext(ev) {
    ev.preventDefault();
    const E = this.E;
    const pw = this.toWorld(ev);
    let h = this.hit(pw);
    if (!h) {
      const ho = this.hitObj(pw), o = ho && this.obj(ho.id);
      if (!o) {
        UI.menu([{ head: 'Chem-Draw' }, { label: 'Einfügen', icon: 'paste', key: 'Strg+V', action: () => this.pasteClip() }, { label: 'Nächste Stufe (Pfeil anfügen)', action: () => this.addStep() }], ev.clientX, ev.clientY);
        return;
      }
      const it = [{ head: { arrow: 'Reaktionspfeil', curve: 'Elektronenpfeil', plus: 'Plus', text: 'Text', brk: 'Klammern' }[o.t] }];
      if (o.t === 'arrow') {
        it.push({ label: 'Beschriften (Reagenzien/Bedingungen) …', icon: 'pencil', action: () => this.editArrow(o) });
        for (const [k, t] of [['r', 'Reaktionspfeil →'], ['eq', 'Gleichgewicht ⇌'], ['retro', 'Retrosynthese ⇒'], ['res', 'Mesomerie ↔'], ['no', 'läuft nicht ab ↛']]) it.push({ label: t, checked: (o.k || 'r') === k, action: () => this.change(() => { o.k = k; }) });
        it.push({ label: 'Richtung umkehren', action: () => this.change(() => { [o.x1, o.x2] = [o.x2, o.x1]; [o.y1, o.y2] = [o.y2, o.y1]; }) });
      }
      if (o.t === 'curve') {
        it.push({ label: 'Bogen umkehren', action: () => this.change(() => { o.bend = -(o.bend || 1); }) });
        it.push({ label: 'Elektronenpaar (Vollpfeil)', checked: o.k === 'e2', action: () => this.change(() => { o.k = 'e2'; }) }, { label: 'Ein Elektron (Halbpfeil)', checked: o.k === 'e1', action: () => this.change(() => { o.k = 'e1'; }) });
      }
      if (o.t === 'text' || o.t === 'brk') it.push({ label: 'Text ändern …', icon: 'pencil', action: () => this.editObjText(o) });
      it.push('-', { label: 'Kopieren', icon: 'copy', action: () => { E.sel = new Set(['o:' + o.id]); this.copySel(); } }, { label: 'Löschen', icon: 'trash', danger: true, action: () => this.change(() => { E.mol.objs = E.mol.objs.filter(x => x !== o); }) });
      UI.menu(it, ev.clientX, ev.clientY);
      return;
    }
    const items = [];
    if (h.t === 'h') {
      const a = this.atom(h.id);
      if (!a) return;
      items.push({ head: 'Wasserstoff an ' + (CHEM_BY_SYM[a.el] ? CHEM_BY_SYM[a.el].name : a.el) });
      items.push({ label: 'H⁺ abspalten (Proton – Atom wird negativ)', icon: 'trash', key: 'Entf', action: () => this.change(() => this.removeH(a, 'p')) },
        { label: 'H⁻ abspalten (Hydrid – Atom wird positiv)', action: () => this.change(() => this.removeH(a, 'h')) },
        { label: 'H· abspalten (Radikal)', action: () => this.change(() => this.removeH(a, 'r')) });
      for (const [g, lab] of [['Cl', 'Chlor (Cl)'], ['Br', 'Brom (Br)'], ['F', 'Fluor (F)'], ['I', 'Iod (I)'], ['OH', 'Hydroxy (OH)'], ['NH2', 'Amino (NH₂)'], ['CH3', 'Methyl (CH₃)']])
        items.push({ label: 'Ersetzen durch ' + lab, action: () => this.change(() => this.substituteH(a, h, g)) });
      if (this.removedH(a)) items.push('-', { label: 'Entfernte H wiederherstellen (' + this.removedH(a) + ')', action: () => this.change(() => this.restoreH(a)) });
      UI.menu(items, ev.clientX, ev.clientY);
      return;
    }
    if (h.t === 'a') {
      const a = this.atom(h.id);
      items.push({ head: a.ab ? a.ab : (CHEM_BY_SYM[a.el] ? CHEM_BY_SYM[a.el].name : a.el) });
      for (const s of ['C', 'N', 'O', 'S', 'P', 'F', 'Cl', 'Br', 'I', 'H']) items.push({ label: s + ' – ' + CHEM_BY_SYM[s].name, checked: !a.ab && a.el === s, action: () => this.change(() => { a.el = s; delete a.ab; }) });
      items.push('-',
        { label: 'Beschriften …', icon: 'pencil', key: 'Enter', action: () => this.openLabel(a.id) },
        { label: 'Ladung +', action: () => this.change(() => { a.q = clamp((a.q || 0) + 1, -4, 4); }) },
        { label: 'Ladung −', action: () => this.change(() => { a.q = clamp((a.q || 0) - 1, -4, 4); }) },
        this.removedH(a) ? { label: 'Entfernte H wiederherstellen (' + this.removedH(a) + ')', action: () => this.change(() => this.restoreH(a)) } : null,
        '-', { label: 'Atom löschen', icon: 'trash', danger: true, key: 'Entf', action: () => this.change(() => this.removeAtom(a.id)) });
    } else {
      const b = this.bond(h.id);
      items.push({ head: 'Bindung' },
        { label: 'Einfach', checked: b.o === 1 && !b.s, action: () => this.change(() => { b.o = 1; b.s = ''; }) },
        { label: 'Doppel', checked: b.o === 2, action: () => this.change(() => { b.o = 2; b.s = ''; }) },
        { label: 'Dreifach', checked: b.o === 3, action: () => this.change(() => { b.o = 3; b.s = ''; }) },
        { label: 'Keil (nach vorn)', checked: b.s === 'w', action: () => this.change(() => { b.o = 1; b.s = 'w'; }) },
        { label: 'Strichkeil (nach hinten)', checked: b.s === 'h', action: () => this.change(() => { b.o = 1; b.s = 'h'; }) },
        { label: 'Wellenlinie', checked: b.s === 'y', action: () => this.change(() => { b.o = 1; b.s = 'y'; }) },
        b.s ? { label: 'Richtung umkehren', action: () => this.change(() => { const t = b.a; b.a = b.b; b.b = t; }) } : null,
        b.o === 2 ? { label: 'Lage der Doppelbindung wechseln', action: () => this.change(() => this.applyBondTool(b, 'b2')) } : null,
        '-', { label: 'Bindung löschen', icon: 'trash', danger: true, key: 'Entf', action: () => this.change(() => this.removeBond(b.id)) });
    }
    if (E.sel.size > 1) items.push('-', { label: 'Gruppieren', key: 'Strg+G', action: () => this.groupSel() });
    if (this.selHasGroup()) items.push({ label: 'Gruppierung aufheben', key: 'Strg+Umschalt+G', action: () => this.ungroupSel() });
    UI.menu(items, ev.clientX, ev.clientY);
  },
  onKey(ev) {
    const E = this.E;
    if (ev.target.matches && ev.target.matches('input, textarea')) return;
    const ctrl = ev.ctrlKey || ev.metaKey, k = ev.key;
    if (ctrl && !ev.altKey) {
      const kl = k.toLowerCase();
      if (kl === 'z' && !ev.shiftKey) { ev.preventDefault(); this.undo(); return; }
      if (kl === 'y' || (kl === 'z' && ev.shiftKey)) { ev.preventDefault(); this.redo(); return; }
      if (kl === 'a' && E.tab === 'struktur') {
        ev.preventDefault();
        if (E.tool !== 'select') this.setTool('select');
        for (const a of E.mol.atoms) E.sel.add('a:' + a.id);
        for (const b of E.mol.bonds) E.sel.add('b:' + b.id);
        for (const o of E.mol.objs || []) E.sel.add('o:' + o.id);
        this.renderOverlay();
        return;
      }
      if (kl === 'enter') { ev.preventDefault(); this.ok(); return; }
      // Kopieren, Ausschneiden, Einfügen, Duplizieren (1.54)
      if (E.tab === 'struktur' && this.editable()) {
        if (kl === 'c') { ev.preventDefault(); this.copySel(false); return; }
        if (kl === 'x') { ev.preventDefault(); this.copySel(true); return; }
        if (kl === 'v') { ev.preventDefault(); this.pasteClip(); return; }
        if (kl === 'd') { ev.preventDefault(); this.copySel(false); this.insertClip(this.clipMol); return; }
        if (kl === 'g') { ev.preventDefault(); if (ev.shiftKey) this.ungroupSel(); else this.groupSel(); return; }
      }
      return;
    }
    if (E.tab !== 'struktur' || ev.altKey) return;
    if (k === ' ') { E.space = true; ev.preventDefault(); return; }
    if (!this.editable()) return;
    if (k === 'Delete' || k === 'Backspace') {
      ev.preventDefault();
      if (this.deleteSel()) return;
      if (E.hover) { const h = E.hover; E.hover = null; this.change(() => { if (h.t === 'h') this.removeH(this.atom(h.id)); else if (h.t === 'a') this.removeAtom(h.id); else this.removeBond(h.id); }); }
      return;
    }
    const h = E.hover;
    if (!h) return;
    if (h.t === 'h') {   // über einem H (Lewis): Element-Taste = ersetzen
      const sym = this.KEYS[k.toLowerCase()], a = this.atom(h.id);
      if (a && sym && k.length === 1 && sym !== 'H') { ev.preventDefault(); this.change(() => this.substituteH(a, h, sym)); }
      return;
    }
    if (h.t === 'a') {
      const a = this.atom(h.id);
      if (!a) return;
      const sym = this.KEYS[k.toLowerCase()];
      if (sym && k.length === 1) { ev.preventDefault(); this.change(() => { a.el = sym; delete a.ab; }); return; }
      if (k === '+' || k === '-' || k === '−') { ev.preventDefault(); this.change(() => { a.q = clamp((a.q || 0) + (k === '+' ? 1 : -1), -4, 4); }); return; }
      if (k === 'Enter') { ev.preventDefault(); this.openLabel(a.id); return; }
    } else {
      const b = this.bond(h.id);
      if (!b) return;
      const map = { 1: () => { b.o = 1; b.s = ''; }, 2: () => { b.o = 2; b.s = ''; }, 3: () => { b.o = 3; b.s = ''; }, w: () => this.applyBondTool(b, 'bw'), h: () => this.applyBondTool(b, 'bh'), y: () => this.applyBondTool(b, 'by'), d: () => { if (b.o === 2) this.applyBondTool(b, 'b2'); } };
      const f = map[k.toLowerCase()];
      if (f) { ev.preventDefault(); this.change(f); }
    }
  },
  status(h) {
    const E = this.E;
    let t = '';
    if (h && h.t === 'h') t = 'Wasserstoff – Klick mit Bindung/Element: ersetzen · Radierer oder Entf: entfernen · Taste Cl/O/N …: ersetzen · Rechtsklick: mehr';
    else if (h && h.t === 'a') {
      const a = this.atom(h.id);
      if (a) t = a.ab ? `${a.ab} (Kurzschreibweise)` : `${CHEM_BY_SYM[a.el] ? CHEM_BY_SYM[a.el].name : a.el}${a.q ? ', Ladung ' + chemChargeTxt(a.q) : ''} – Tasten: C N O S … · + − · Entf`;
    } else if (h && h.t === 'b') {
      const b = this.bond(h.id);
      if (b) t = (b.s === 'w' ? 'Keil' : b.s === 'h' ? 'Strichkeil' : b.s === 'y' ? 'Wellenbindung' : ['', 'Einfach', 'Doppel', 'Dreifach'][b.o] + 'bindung') + ' – Tasten: 1 2 3 · W H Y · Entf';
    }
    E.status.textContent = t;
  },

  /* ---------------------------------------------------------- Zeichnen */
  render() {
    const E = this.E;
    if (!E) return;
    E.an = ChemMol.analyze(E.mol);
    const r = ChemRender.draw(E.mol, { ...this.opts, caption: false, meas3d: E.meas || [] }, E.an);
    E.labels = r.labels; E.box = r.box; E.hpos = r.hpos || []; E.pts3 = r.pts3 || null;
    E.molG.innerHTML = r.body;
    this.renderOverlay();
    this.renderSide();
  },
  /* während des Ziehens: nur Struktur, Seitenleiste später */
  renderQuick() {
    const E = this.E;
    const an = ChemMol.analyze(E.mol);
    E.an = an;
    const r = ChemRender.draw(E.mol, { ...this.opts, caption: false, meas3d: E.meas || [] }, an);
    E.labels = r.labels; E.hpos = r.hpos || []; E.pts3 = r.pts3 || null;
    E.molG.innerHTML = r.body;
    this.renderOverlay();
  },
  renderOverlay() {
    const E = this.E;
    if (!E) return;
    if (!this.editable()) { E.ovG.innerHTML = ''; return; }   // Bohr/Orbitale/3D: keine Markierungen auf dem Gerüst
    const out = [];
    const s = E.view.s;
    for (const id of (E.an && E.an.valErr) || []) {
      const a = this.atom(id);
      if (a) out.push(`<rect x="${a.x - 10}" y="${a.y - 10}" width="20" height="20" rx="3" class="chem-err" stroke-width="${1.4 / s}"/>`);
    }
    for (const k of E.sel) {
      const [t, v] = k.split(':'), id = +v;
      if (t === 'a') { const a = this.atom(id); if (a) out.push(`<circle cx="${a.x}" cy="${a.y}" r="7.5" class="chem-sel"/>`); }
      else if (t === 'o') { const bb = this.objBox(id); if (bb) out.push(`<rect x="${bb.x0 - 3}" y="${bb.y0 - 3}" width="${bb.x1 - bb.x0 + 6}" height="${bb.y1 - bb.y0 + 6}" rx="3" class="chem-osel"/>`); }
      else { const b = this.bond(id), A = b && this.atom(b.a), B = b && this.atom(b.b); if (A && B) out.push(`<line x1="${A.x}" y1="${A.y}" x2="${B.x}" y2="${B.y}" class="chem-selb"/>`); }
    }
    // ausgewählte Gruppen (1.56): gestrichelter Rahmen
    const gs = new Set([...E.sel].map(k => this.grpOf(k)).filter(g => g != null));
    for (const g of gs) {
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const a of E.mol.atoms) if (a.grp === g) { x0 = Math.min(x0, a.x); y0 = Math.min(y0, a.y); x1 = Math.max(x1, a.x); y1 = Math.max(y1, a.y); }
      for (const o of E.mol.objs || []) if (o.grp === g) { const bb = this.objBox(o.id); if (bb) { x0 = Math.min(x0, bb.x0); y0 = Math.min(y0, bb.y0); x1 = Math.max(x1, bb.x1); y1 = Math.max(y1, bb.y1); } }
      if (isFinite(x0)) out.push(`<rect x="${x0 - 14}" y="${y0 - 14}" width="${x1 - x0 + 28}" height="${y1 - y0 + 28}" rx="6" class="chem-grpbox" stroke-width="${1.2 / s}" stroke-dasharray="${5 / s} ${4 / s}"/>`);
    }
    const h = E.hover;
    if (h && !E.drag) {
      if (h.t === 'h') out.push(`<circle cx="${h.x}" cy="${h.y}" r="8" class="chem-hov" stroke-width="${1.5 / s}"/>`);
      else if (h.t === 'a') {
        const a = this.atom(h.id);
        if (a) {
          const rs = E.labels.get(a.id);
          let x0 = a.x - 7, y0 = a.y - 7, x1 = a.x + 7, y1 = a.y + 7;
          if (rs) for (const r of rs) { x0 = Math.min(x0, r.x0 - 2); y0 = Math.min(y0, r.y0 - 2); x1 = Math.max(x1, r.x1 + 2); y1 = Math.max(y1, r.y1 + 2); }
          out.push(`<rect x="${x0}" y="${y0}" width="${x1 - x0}" height="${y1 - y0}" rx="3" class="chem-hov" stroke-width="${1.5 / s}"/>`);
        }
      } else {
        const b = this.bond(h.id), A = b && this.atom(b.a), B = b && this.atom(b.b);
        if (A && B) out.push(`<line x1="${A.x}" y1="${A.y}" x2="${B.x}" y2="${B.y}" class="chem-hovb"/>`);
      }
    }
    if (E.preview) out.push(E.preview);
    E.ovG.innerHTML = out.join('');
    if (E.an && [...E.sel].sort().join() !== E.selSig && !E.drag) this.renderSide();
  },
  /* Name (IUPAC) der Auswahl bzw. des Ganzen, Trivialname aus der Datenbank */
  nameInfo(whole) {
    const E = this.E;
    if (!E.mol.atoms.length) return { auto: null, error: null, sel: false, triv: null };
    // seit 1.54: mehrere Moleküle → nur das ausgewählte (ganze Moleküle); Teil eines Moleküls markiert → Name der Auswahl
    const ids = whole ? new Set() : this.selAtomIds();
    const F = this.focus();
    let sel = false, sub = F ? F.mol : E.mol;
    if (ids.size && F && F.frags.length === 1 && ids.size < F.mol.atoms.length) {
      sel = true;
      sub = { atoms: E.mol.atoms.filter(a => ids.has(a.id)), bonds: E.mol.bonds.filter(b => ids.has(b.a) && ids.has(b.b)), nid: E.mol.nid };
    }
    const key = JSON.stringify([sub.atoms.map(a => [a.id, a.el, a.q, a.ab, Math.round(a.x), Math.round(a.y)]), sub.bonds.map(b => [b.a, b.b, b.o, b.s]), this.opts.lang]);
    if (E.nameCache && E.nameCache.key === key) return E.nameCache.val;
    let triv = null;
    try { triv = ChemDB.find(sub); } catch (e) { /* */ }
    const r = ChemName.of(sub, { lang: this.opts.lang });
    let auto = r.name;
    if (triv && triv.iupac && this.opts.lang !== 'en') auto = triv.iupac;
    const val = { auto, error: auto ? null : r.error, sel, triv };
    E.nameCache = { key, val };
    return val;
  },
  nameText() {
    const E = this.E;
    const F = this.focus();
    if (F && F.all > 1 && F.frags.length === 1) { const r = F.mol.atoms.find(a => a.id === F.frags[0].rep); if (r && r.nm) return r.nm; }
    if (E.nameEdit != null && !(F && F.all > 1)) return E.nameEdit;
    const ni = this.nameInfo(true);
    return ni.auto || (ni.triv ? ni.triv.name : '');
  },
  renderSide() {
    const E = this.E, side = E.side;
    let an = E.an;
    side.innerHTML = '';
    E.selSig = [...E.sel].sort().join();
    // Umschalter Zeichnen | Planen (1.56): im Planen-Modus zeigt die (breitere) Seitenleiste die Syntheseplanung
    if (typeof ChemPlan !== 'undefined') {
      const plan = this.opts.mode === 'plan';
      side.classList.toggle('plan', plan);
      if (side._plan !== plan) { side._plan = plan; this.applyPanels(); }
      const seg = el('div', { class: 'chem-seg chem-modeseg' });
      for (const [k, t, ti] of [['draw', 'Zeichnen', 'Name, Formel und Eigenschaften des Moleküls'], ['plan', 'Planen', 'Synthesewege vorschlagen, Weg vom Edukt zum Produkt']]) seg.append(el('button', { class: (plan ? k === 'plan' : k === 'draw') ? 'on' : '', text: t, title: ti, dataset: { mode: k }, onclick: () => { this.opts.mode = k; this.saveOpts(); this.renderSide(); } }));
      side.append(seg);
      if (plan) { try { ChemPlan.render(this, side); } catch (e) { console.warn('Planen', e); side.append(el('div', { class: 'chem-muted', text: 'Planen: ' + e.message })); } return; }
    }
    const sec = (t) => { const d = el('div', { class: 'chem-sh', text: t }); side.append(d); return d; };
    // mehrere Moleküle (1.54, wie ChemDraw/OneNote): Name und Infos nur für das ausgewählte Molekül
    const frs = E.mol.atoms.length ? ChemRender.fragments(E.mol) : [];
    const F = this.focus();
    const fRep = F && F.frags.length === 1 ? F.mol.atoms.find(a => a.id === F.frags[0].rep) : null;
    if (frs.length > 1) {
      sec(`${frs.length} Moleküle`);
      const list = el('div', { class: 'chem-flist' });
      frs.forEach((f, i) => {
        const fa = ChemMol.analyze(ChemRender.subMol(E.mol, f));
        const on = F && F.frags.includes(f);
        const nm = (f.atoms.find(a => a.id === f.rep) || {}).nm || '';
        const g = (f.atoms[0] || {}).grp;
        list.append(el('button', { class: 'chem-fitem' + (on ? ' on' : ''), title: 'Auswählen – Name und Infos dieses Moleküls zeigen', onclick: () => this.selectFrag(f) }, el('b', { html: `${i + 1}. ${nm ? chemEsc(nm) + ' · ' : ''}${fa.hill.html}` }), el('span', { text: (g != null ? '⛓ Gruppe ' + g + ' · ' : '') + chemM(fa.mass) + ' g/mol' })));
      });
      side.append(list);
      // Gruppieren (1.56): Moleküle zusammenhalten, übereinanderlegen, gemeinsam verschieben
      const gr = el('div', { class: 'chem-row' });
      if (E.sel.size > 1) gr.append(el('button', { class: 'chem-mini', text: 'Gruppieren (Strg+G)', title: 'Ausgewählte Moleküle/Pfeile zusammenhalten: Klick wählt alle, Ziehen bewegt alle', onclick: () => this.groupSel() }));
      if (this.selHasGroup()) gr.append(el('button', { class: 'chem-mini', text: 'Gruppierung aufheben', onclick: () => this.ungroupSel() }));
      if (gr.childNodes.length) side.append(gr);
      if (!F) {
        side.append(el('div', { class: 'chem-muted', text: 'Ein Molekül anklicken (Doppelklick oder Rahmen = ganzes Molekül) – dann erscheinen Name, Formel und Eigenschaften nur für dieses.' }));
        an = { empty: true, skipEmptyHint: true };
      } else an = ChemMol.analyze(F.mol);
    }
    if (!an.empty) {
      const ni = this.nameInfo();
      const h = sec(ni.sel ? 'Name der Auswahl' : 'Name (IUPAC)');
      const lang = el('span', { class: 'chem-lang' });
      for (const [k, t] of [['de', 'DE'], ['en', 'EN']]) lang.append(el('button', { class: this.opts.lang === k ? 'on' : '', text: t, title: k === 'de' ? 'Deutsche Namen' : 'English names', onclick: () => { this.opts.lang = k; this.saveOpts(); this.renderSide(); } }));
      h.append(lang);
      const ta = el('textarea', { class: 'chem-name', spellcheck: 'false', rows: '2' });
      ta.value = ni.sel ? (ni.auto || '') : (E.nameEdit != null ? E.nameEdit : (ni.auto || ''));
      ta.placeholder = ni.error ? 'Kein automatischer Name – hier selbst eintippen' : 'Name';
      const fitTa = () => { ta.style.height = 'auto'; ta.style.height = Math.min(140, ta.scrollHeight + 2) + 'px'; };
      const reset = el('button', { class: 'chem-mini', text: '↺ automatisch', title: 'Wieder den automatisch erzeugten Namen verwenden', hidden: ni.sel || E.nameEdit == null, onclick: () => { E.nameEdit = null; this.renderSide(); } });
      ta.addEventListener('input', () => {
        fitTa();
        if (ni.sel) return;
        if (frs.length > 1) { if (fRep) { const v = ta.value.trim(); if (v && v !== ni.auto) fRep.nm = v; else delete fRep.nm; } return; }   // Name dieses Moleküls (1.54)
        const v = ta.value.trim();
        E.nameEdit = v && v !== ni.auto ? v : (v ? null : '');
        if (!v) E.nameEdit = '';
        reset.hidden = E.nameEdit == null;
      });
      side.append(ta);
      requestAnimationFrame(fitTa);
      const note = ni.error && !ni.auto ? 'Automatisch nicht möglich: ' + ni.error + '.' : ni.sel ? 'Gilt für die markierten Atome (Rest abgeschnitten, fehlende Bindungen = H).' : E.nameEdit != null ? 'Von Hand geändert.' : '';
      if (note) side.append(el('div', { class: 'chem-muted', text: note }));
      if (ni.triv) side.append(el('div', { class: 'chem-kv' }, el('span', { text: 'Trivialname' }), el('b', { text: ni.triv.name })));
      // Unterschrift nur für dieses Molekül (1.54): Name / Formel & Masse darunter (auf der Seite und hier)
      if (F && !ni.sel) {
        const reps = F.frags.map(f => F.mol.atoms.find(a => a.id === f.rep)).filter(Boolean);
        const tri = (k, label, glob) => {
          const c = el('input', { type: 'checkbox' });
          c.checked = reps.every(r => (r[k] != null ? !!r[k] : !!glob));
          c.addEventListener('change', () => this.change(() => { for (const r of reps) { const a = this.atom(r.id); if (a) a[k] = c.checked ? 1 : 0; } }));
          side.append(el('label', { class: 'chem-chk', title: 'Gilt nur für ' + (reps.length > 1 ? 'die ausgewählten Moleküle' : 'dieses Molekül') }, c, label));
        };
        tri('cn', frs.length > 1 ? 'Name unter dieses Molekül' : 'Name unter die Struktur', this.opts.nameCap);
        tri('ci', frs.length > 1 ? 'Formel & Molare Masse unter dieses Molekül' : 'Formel & Molare Masse darunter', this.opts.caption);
      }
      side.append(el('div', { class: 'chem-row' }, reset,
        el('button', { class: 'chem-mini', text: 'Als Text einfügen', title: 'Den Namen als Text in die Seite schreiben', onclick: () => { if (ta.value.trim()) this.insertText(chemEsc(ta.value.trim())); } })));
    }
    if (!an.skipEmptyHint) sec('Summenformel');
    if (an.skipEmptyHint) { /* Liste oben */ }
    else if (an.empty) side.append(el('div', { class: 'chem-muted', text: 'Noch nichts gezeichnet. Wähle links ein Werkzeug und klicke auf die Fläche.' }));
    else {
      side.append(el('div', { class: 'chem-big', html: an.hill.html }));
      if (an.frags.length > 1) side.append(el('div', { class: 'chem-muted', html: 'Teile: ' + an.frags.map(f => ChemFormula.hill(f.counts, f.charge).html).join(' · ') }));
      const kv = (k, v, title) => side.append(el('div', { class: 'chem-kv', title: title || '' }, el('span', { text: k }), el('b', { html: v })));
      kv('Molare Masse', chemM(an.mass) + ' g/mol' + (an.radio ? '*' : ''), an.radio ? '* enthält radioaktive Elemente (Massenzahl des stabilsten Isotops)' : '');
      if (an.exact != null) kv('Exakte Masse', chemNum(an.exact, 4), 'Monoisotopische Masse (häufigstes Isotop)');
      const tb = el('div', { class: 'chem-comp' });
      for (const c of an.comp) tb.append(el('span', { text: c.sym }), el('i', { style: { width: Math.max(2, c.pct * 0.9) + 'px' } }), el('b', { text: chemNum(c.pct, 2) + ' %' }));
      side.append(el('div', { class: 'chem-sub', text: 'Elementaranalyse' }), tb);
      side.append(el('button', { class: 'btn chem-sbtn', text: 'Summenformel als Text einfügen', title: 'Die Summenformel (mit Molarer Masse) als Text in die Seite schreiben', onclick: () => this.insertText(an.hill.html + ` (M = ${chemM(an.mass)} g/mol)`) }));
      // Analyse & Sicherheitsdaten (1.52)
      side.append(el('div', { class: 'chem-row' },
        el('button', { class: 'chem-mini', text: 'Analyse & Spektren …', title: 'Eigenschaften, funktionelle Gruppen, IR, Massenspektrum, NMR, SMILES/Molfile', onclick: () => this.setTab('analyse') }),
        el('button', { class: 'chem-mini', text: 'GESTIS (Sicherheit)', title: 'Sicherheitsdaten in der GESTIS-Stoffdatenbank des IFA öffnen', onclick: () => this.gestis() })));
      sec('Stereochemie');
      const n = an.centers.length;
      const rs = an.centers.filter(c => c.rs);
      side.append(el('div', { class: 'chem-kv' }, el('span', { text: 'Chirale C-Atome' }), el('b', { text: String(n) })));
      if (n) {
        side.append(el('div', { class: 'chem-muted', text: rs.length ? `Bestimmt (Keile): ${rs.map(c => '(' + c.rs + ')').join(', ')}${rs.length < n ? ` · ohne Keil: ${n - rs.length}` : ''}` : 'Für (R)/(S) eine Bindung am Zentrum als Keil oder Strichkeil zeichnen.' }));
        if (n > 1) side.append(el('div', { class: 'chem-muted', text: `max. ${2 ** n} Stereoisomere (2ⁿ)` }));
      }
      if (an.ez.length) side.append(el('div', { class: 'chem-kv' }, el('span', { text: 'Doppelbindungen E/Z' }), el('b', { text: an.ez.map(e => '(' + e.ez + ')').join(' ') })));
      if (an.valErr.length) side.append(el('div', { class: 'chem-warn', text: `⚠ ${an.valErr.length === 1 ? 'Ein Atom hat' : an.valErr.length + ' Atome haben'} zu viele Bindungen (rot markiert).` }));
      // weitere Regeln (1.49): Oktett, Formalladung, Radikale, Elektronenmangel, Hückel
      if (typeof ChemModels !== 'undefined') for (const r of ChemModels.rules(F ? F.mol : this.E.mol)) side.append(el('div', { class: r.k === 'warn' ? 'chem-warn' : 'chem-muted chem-rule', text: (r.k === 'warn' ? '⚠ ' : 'ℹ ') + r.t }));
      const hd = this.E.mol.atoms.filter(a => this.removedH(a));
      if (hd.length) side.append(el('div', { class: 'chem-row' }, el('button', { class: 'chem-mini', text: `Entfernte H wiederherstellen (${hd.reduce((t, a) => t + this.removedH(a), 0)})`, onclick: () => this.change(() => hd.forEach(a => this.restoreH(a))) })));
    }
    const chk = (k, label, inv) => {
      const c = el('input', { type: 'checkbox' });
      c.checked = inv ? this.opts[k] !== false : !!this.opts[k];
      c.addEventListener('change', () => { this.opts[k] = c.checked; this.saveOpts(); this.render(); });
      side.append(el('label', { class: 'chem-chk' }, c, label));
    };
    const model = this.opts.model || 'skelett';
    if (model !== 'skelett' && !an.empty) {
      sec('Darstellung: ' + ChemModels.LIST.find(x => x[0] === model)[1]);
      if (model === 'lewis') chk('lewisDots', 'Freie Elektronenpaare als Punkte (statt Striche)');
      if (model === 'orbital') chk('orbBoxes', 'Kästchenschreibweise und Orbitalformen darunter', true);
      if (model === '3d') {
        const row = el('div', { class: 'chem-seg' });
        for (const [k, t, tt] of [['stab', 'Kugel-Stab', 'Atome als Kugeln, Bindungen als Stäbe'], ['stick', 'Stäbe', 'Nur Stäbe (wie MolView „Stick“)'], ['draht', 'Draht', 'Drahtmodell – nur Linien'], ['kalotte', 'Kalotten', 'Raumfüllend (van-der-Waals-Radien)'], ['wolke', 'Wolke', 'Elektronendichte: rot = viele Elektronen (δ−), blau = wenige (δ+)']]) {
          row.append(el('button', { class: (this.opts.style3d || 'stab') === k ? 'on' : '', text: t, title: tt, onclick: () => { this.opts.style3d = k; this.saveOpts(); this.render(); } }));
        }
        side.append(row);
        if (this.opts.style3d === 'wolke') chk('delta', 'δ+/δ− an den Atomen', true);
        else chk('labels3d', 'Heteroatome beschriften (O, N, Cl …)', true);
        side.append(el('div', { class: 'chem-row' }, el('button', { class: 'chem-mini', text: '↺ Ansicht zurücksetzen', onclick: () => { this.opts.rot3d = null; this.saveOpts(); this.render(); } }),
          el('button', { class: 'chem-mini' + (E.spin ? ' on' : ''), text: E.spin ? '■ Drehen aus' : '⟳ Drehen', title: 'Das Modell langsam drehen lassen', onclick: () => this.spin3d(!E.spin) }),
          el('button', { class: 'chem-mini', text: 'Bild speichern', title: 'Aktuelle Ansicht als PNG-Datei speichern', onclick: () => this.savePng() })));
        // Messen (1.52, wie MolView): Atome anklicken
        const mr = el('div', { class: 'chem-row' }, el('button', { class: 'chem-mini' + (E.measure ? ' on' : ''), text: E.measure ? '✓ Messen (Atome anklicken)' : '📏 Messen', title: '2 Atome = Abstand, 3 = Bindungswinkel, 4 = Diederwinkel', onclick: () => { E.measure = !E.measure; E.meas = []; this.render(); } }));
        side.append(mr);
        if (E.measure) {
          const ms = (E.meas || []), F3 = ms.length > 1 ? ChemModels.embed(E.mol) : null;
          const r = F3 ? ChemProps.measure(F3.P, ms) : null;
          side.append(el('div', { class: 'chem-muted', text: r ? `${r.kind} ${ms.map(i => F3.F.atoms[i].el).join('–')}: ${r.text}` : ms.length ? 'Weitere Atome anklicken …' : 'Atome im Modell anklicken (Ziehen dreht weiter).' }));
        }
        side.append(el('div', { class: 'chem-muted', text: 'Räumlich angeordnet aus der Zeichnung (Keil = vorn, Strichkeil = hinten), Winkel nach der Hybridisierung. Auf der Seite erscheint die aktuelle Ansicht.' }));
      }
      // Elektronenkonfiguration der Elemente (Bohr, Orbitale, Lewis)
      if (model !== '3d') {
        const G = ChemModels.full(E.mol), kinds = new Map();
        for (const a of G.atoms) { const k2 = a.el + '|' + a.q; if (!kinds.has(k2)) kinds.set(k2, a); }
        side.append(el('div', { class: 'chem-sub', text: 'Elektronenkonfiguration' }));
        for (const a of kinds.values()) {
          const lab = a.el + (a.q ? (Math.abs(a.q) > 1 ? Math.abs(a.q) : '') + (a.q > 0 ? '+' : '−') : '');
          side.append(el('div', { class: 'chem-kv', title: 'Schalen: ' + ChemModels.shells(a.el, a.q).join(' · ') + (a.el !== 'H' ? ` · Hybridisierung im Molekül: ${a.hyb || '–'}` : '') }, el('span', { text: lab }), el('b', { text: ChemModels.configText(a.el, a.q, true) })));
        }
      }
    }
    sec('Anzeige');
    chk('stars', 'Chirale C-Atome markieren (*)');
    chk('rs', '(R)/(S) anzeigen');
    chk('ez', '(E)/(Z) anzeigen');
    chk('color', 'Atome farbig');
    chk('carbons', 'C-Atome beschriften');
    chk('nameCap', 'Name unter die Struktur');
    chk('caption', 'Formel & Molare Masse unter die Struktur');
  },

  /* ---------------------------------------------------------- 3D: drehen lassen, Bild speichern (1.52) */
  spin3d(on) {
    const E = this.E;
    if (!E) return;
    E.spin = on;
    cancelAnimationFrame(E.spinRaf);
    if (on) {
      let last = performance.now();
      const step = (t) => {
        if (!this.E || !E.spin || this.opts.model !== '3d') { E.spin = false; return; }
        const dt = Math.min(60, t - last); last = t;
        if (!E.drag) { this.opts.rot3d = ChemModels.rotate(this.opts.rot3d || ChemModels.rotDefault(E.mol), dt * 0.04, 0); this.renderQuick(); }
        E.spinRaf = requestAnimationFrame(step);
      };
      E.spinRaf = requestAnimationFrame(step);
    } else this.saveOpts();
    this.renderSide();
  },
  async savePng() {
    const E = this.E;
    if (!E || !E.mol.atoms.length) return;
    const { svg, w, h } = ChemRender.toSVG(E.mol, { ...this.opts, caption: false, meas3d: E.meas || [] }, E.an);
    const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
    try {
      const img = new Image();
      await new Promise((ok, no) => { img.onload = ok; img.onerror = no; img.src = url; });
      const k = 3, cv = document.createElement('canvas');
      cv.width = w * k; cv.height = h * k;
      const ctx = cv.getContext('2d');
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cv.width, cv.height);
      ctx.drawImage(img, 0, 0, cv.width, cv.height);
      const blob = await new Promise(res => cv.toBlob(res, 'image/png'));
      const name = (this.nameText() || 'Struktur').replace(/[\\/:*?"<>|]+/g, '_').slice(0, 60) + '.png';
      this.download(blob, name);
    } catch (e) { UI.toast('Bild konnte nicht erstellt werden'); }
    finally { URL.revokeObjectURL(url); }
  },
  /* SVG-Text → PNG (Faktor k, weisser Grund) */
  async svgToPng(svg, k = 2) {
    const m = /width="(\d+(?:\.\d+)?)" height="(\d+(?:\.\d+)?)"/.exec(svg);
    const w = m ? +m[1] : 560, h = m ? +m[2] : 220;
    const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
    try {
      const img = new Image();
      await new Promise((ok, no) => { img.onload = ok; img.onerror = no; img.src = url; });
      const cv = document.createElement('canvas');
      cv.width = Math.round(w * k); cv.height = Math.round(h * k);
      const ctx = cv.getContext('2d');
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cv.width, cv.height);
      ctx.drawImage(img, 0, 0, cv.width, cv.height);
      return await new Promise(res => cv.toBlob(res, 'image/png'));
    } catch (e) { UI.toast('Bild konnte nicht erstellt werden'); return null; }
    finally { URL.revokeObjectURL(url); }
  },
  download(blob, name) {
    const a = el('a', { href: URL.createObjectURL(blob), download: name });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  },

  /* ---------------------------------------------------------- GESTIS (1.52): nur verlinken
   * Die GESTIS-Stoffdatenbank (IFA/DGUV) ist die Quelle für Sicherheitsdaten (GHS, Grenzwerte, Erste Hilfe). Ihre
   * Daten werden NICHT übernommen oder gespeichert – erlaubt und erwünscht ist das Verlinken (Startseite oder
   * Stoffblatt über die ZVG-Nummer). Da es keinen Such-Link gibt, wird der Name in die Zwischenablage gelegt. */
  GESTIS_START: 'https://www.dguv.de/ifa/stoffdatenbank/',
  gestisUrl(zvg) {
    const z = String(zvg || '').replace(/\D/g, '');
    if (!z) return this.opts.lang === 'en' ? 'https://www.dguv.de/ifa/gestis/gestis-stoffdatenbank/index-2.jsp' : this.GESTIS_START;
    return (this.opts.lang === 'en' ? 'https://gestis-database.dguv.de/data?name=' : 'https://gestis.dguv.de/data?name=') + z.padStart(6, '0');
  },
  /* Stoffliste der DGUV (ZVG-Nr., CAS-Nr., Name – vom IFA zum Verlinken angeboten, 1.53): der User lädt sie einmal
   * herunter und hier ein; gespeichert wird nur Name/CAS → ZVG-Nummer (für den Link), lokal im Browser-Speicher. */
  GESTIS_LIST_URL: 'https://dguv.de/medien/ifa/de/gestis/stoffdb/links/zvg-cas-list-d.xlsx',
  gestisNorm(s) { return String(s || '').toLowerCase().replace(/^\s*\((?:[rs]|[+−-])\)-|^\s*[dl]-/i, '').replace(/[^a-z0-9äöüß]+/g, ''); },
  gestisList() {
    if (this._gl !== undefined) return this._gl;
    try { this._gl = JSON.parse(localStorage.getItem('kt-gestis-list') || 'null'); } catch (e) { this._gl = null; }
    return this._gl;
  },
  /* XLSX lesen (ZIP + XML, ohne Bibliothek): Kopfzeile mit „ZVG“ suchen, Spalten ZVG, CAS und Name erkennen */
  async gestisImport(file) {
    const u8 = new Uint8Array(await file.arrayBuffer());
    const files = await unzip(u8);
    const txt = async (n) => { const g = files.get(n); return g ? new TextDecoder('utf-8').decode(await g()) : ''; };
    const xml = (t) => new DOMParser().parseFromString(t, 'application/xml');
    const ss = [...xml(await txt('xl/sharedStrings.xml')).getElementsByTagName('si')].map(si => [...si.getElementsByTagName('t')].map(t => t.textContent).join(''));
    const sheetName = [...files.keys()].filter(n => /^xl\/worksheets\/sheet\d+\.xml$/.test(n)).sort()[0];
    if (!sheetName) throw new Error('Keine Tabelle in der Datei');
    const rows = [];
    for (const r of xml(await txt(sheetName)).getElementsByTagName('row')) {
      const row = [];
      for (const c of r.getElementsByTagName('c')) {
        const ref = c.getAttribute('r') || '', col = ref.replace(/\d+/g, '').split('').reduce((t, ch) => t * 26 + ch.charCodeAt(0) - 64, 0) - 1;
        const v = c.getElementsByTagName('v')[0], is = c.getElementsByTagName('is')[0];
        const t = c.getAttribute('t');
        row[col >= 0 ? col : row.length] = t === 's' ? ss[+(v && v.textContent)] || '' : is ? is.textContent : v ? v.textContent : '';
      }
      rows.push(row);
    }
    // Kopfzeile: enthält „ZVG“ und dazu „CAS“ oder einen Namen (Titelzeilen darüber überspringen)
    const hi = rows.findIndex(r => r.some(x => /zvg/i.test(x || '')) && r.some(x => /cas|name|bezeichnung|stoff/i.test(x || '') && !/zvg/i.test(x || '')));
    if (hi < 0) throw new Error('Spalte „ZVG“ nicht gefunden – ist das die ZVG/CAS-Liste der DGUV?');
    const H = rows[hi].map(x => String(x || ''));
    const cz = H.findIndex(x => /zvg/i.test(x)), cc = H.findIndex(x => /cas/i.test(x));
    const cn = H.findIndex(x => /name|bezeichnung|stoff/i.test(x) && !/zvg|cas/i.test(x));
    const names = {}, cas = {};
    let n = 0;
    for (const r of rows.slice(hi + 1)) {
      let z = String(r[cz] || '').replace(/\D/g, '');
      if (!z) { const lk = r.map(x => /data\?name=(\d+)/.exec(String(x || ''))).find(Boolean); if (lk) z = lk[1]; }
      if (!z) continue;
      n++;
      if (cn >= 0 && r[cn]) { const k = this.gestisNorm(r[cn]); if (k && !names[k]) names[k] = z; }
      if (cc >= 0 && r[cc]) for (const c of String(r[cc]).split(/[;,\s]+/)) if (/^\d+-\d\d-\d$/.test(c) && !cas[c]) cas[c] = z;
    }
    if (!n) throw new Error('Keine ZVG-Nummern in der Liste');
    const list = { at: new Date().toISOString().slice(0, 10), n, names, cas };
    try { localStorage.setItem('kt-gestis-list', JSON.stringify(list)); } catch (e) { UI.toast('Liste zu gross für den Browser-Speicher – gilt nur bis zum Schliessen', 5000); }
    this._gl = list;
    return list;
  },
  /* ZVG-Nummer zum gezeichneten Stoff: selbst eingetragen > Stoffliste (Trivialname, weitere Namen, IUPAC-Name) */
  gestisFind() {
    const own = this.gestisZvg();
    if (own) return { zvg: own, how: 'selbst eingetragen' };
    const L = this.gestisList();
    if (!L || !this.E) return null;
    const ni = this.nameInfo(true) || {};
    const cands = [];
    if (ni.triv) { cands.push(ni.triv.name); const e = ni.triv.e || {}; cands.push(e.name, e.base, e.iupac, ...String(e.alias || '').split(',')); }
    cands.push(ni.auto, this.nameText());
    for (const c of cands) {
      const k = this.gestisNorm(c);
      const z = k && (L.names[k] || L.names['nn' + k] || L.names[k.replace(/^nn/, '')]);   // „Dimethylformamid“ = „N,N-Dimethylformamid“
      if (z) return { zvg: z, how: 'Stoffliste: „' + String(c).trim() + '“' };
    }
    return null;
  },
  gestisKey() { const ni = this.E && this.nameInfo(true); return ((ni && ni.triv && ni.triv.name) || (ni && ni.auto) || this.nameText() || '').trim(); },
  gestisZvg(set) {
    const k = this.gestisKey().toLowerCase();
    const map = (Store.ui.gestisZvg && typeof Store.ui.gestisZvg === 'object') ? Store.ui.gestisZvg : (Store.ui.gestisZvg = {});
    if (set !== undefined) { if (set) map[k] = set; else delete map[k]; UiState.saveSoon(); }
    return map[k] || '';
  },
  gestis() {
    const name = this.gestisKey(), f = this.gestisFind(), zvg = f ? f.zvg : '';
    if (!zvg && name) navigator.clipboard?.writeText(name).then(() => UI.toast(`„${name}“ kopiert – in GESTIS ins Suchfeld einfügen (Strg+V)`, 5000), () => {});
    window.open(this.gestisUrl(zvg), '_blank', 'noopener');
  },

  /* ---------------------------------------------------------- Register Analyse & Spektren (1.52) */
  /* ---------------------------------------------------------- Massenspektrum: Bruchstücke als Strukturen (1.55)
   * Karten der wichtigsten Ionen: oben das ganze Molekül mit hervorgehobenem Bruchstück und rot markierter Bruchstelle,
   * darunter das Ion als eigene Struktur (Ladung, Radikal). Klick auf eine Karte zeigt die Abbruchfolge M⁺· → … → Ion
   * mit den abgespaltenen Neutralteilen – so lassen sich die Zerfallswege vergleichen. */
  msGraphMaps(m, Gr) {
    const idOf = Gr.A.map(a => a.src);
    return { idOf, ixOf: new Map(idOf.map((id, i) => [id, i])) };
  },
  msHighlightSvg(m, Gr, ion, maps) {
    const r = ChemRender.draw(m, { ...this.opts, caption: false, stars: false, nameCap: false, rs: false, ez: false, model: 'skelett' });
    const pos = new Map(m.atoms.map(a => [a.id, a]));
    const inSet = (id) => { const i = maps.ixOf.get(id); return i != null && ion.set.has(i); };
    const isH = (id) => (pos.get(id) || {}).el === 'H';
    let halo = '', cuts = '';
    for (const b of m.bonds) {
      const A = pos.get(b.a), B = pos.get(b.b);
      if (!A || !B) continue;
      const ina = inSet(b.a) || (isH(b.a) && inSet(b.b)), inb = inSet(b.b) || (isH(b.b) && inSet(b.a));
      if (ina && inb) halo += `<line x1="${A.x.toFixed(1)}" y1="${A.y.toFixed(1)}" x2="${B.x.toFixed(1)}" y2="${B.y.toFixed(1)}"/>`;
    }
    for (const id of m.atoms.map(a => a.id)) if (inSet(id)) { const a = pos.get(id); halo += `<circle cx="${a.x.toFixed(1)}" cy="${a.y.toFixed(1)}" r="5.5"/>`; }
    for (const [i, j] of ion.cut || []) {
      const A = pos.get(maps.idOf[i]), B = pos.get(maps.idOf[j]);
      if (!A || !B) continue;
      const mx = (A.x + B.x) / 2, my = (A.y + B.y) / 2, L = Math.hypot(B.x - A.x, B.y - A.y) || 1, nx = -(B.y - A.y) / L, ny = (B.x - A.x) / L, tx = (B.x - A.x) / L, ty = (B.y - A.y) / L;
      let d = '';
      for (let k = -3; k <= 3; k++) { const f = k * 3, w = (k % 2 ? 2.4 : -2.4); d += (k === -3 ? 'M' : 'L') + (mx + nx * f + tx * w).toFixed(1) + ',' + (my + ny * f + ty * w).toFixed(1); }
      cuts += `<path d="${d}" fill="none" stroke="#e03131" stroke-width="2" stroke-linejoin="round"/>`;
    }
    const pad = 8, bx = r.box;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${(bx.x0 - pad).toFixed(1)} ${(bx.y0 - pad).toFixed(1)} ${(bx.x1 - bx.x0 + 2 * pad).toFixed(1)} ${(bx.y1 - bx.y0 + 2 * pad).toFixed(1)}" class="chem-msmol"><g stroke="#f59f00" fill="#f59f00" stroke-width="9" stroke-linecap="round" opacity=".28">${halo}</g>${r.body}${cuts}</svg>`;
  },
  /* Ion als eigenes Molekül (1.56): Atome des Bruchstücks mit Original-Koordinaten, gebrochene Bindungen entfernt,
   * geänderte Bindungsordnungen; Ladungsort q = +1, Radikalkation zusätzlich rad = 1; H-Zahl über hd (darf negativ
   * sein: dann kommen H dazu) genau wie berechnet */
  msIonMol(m, Gr, ion, maps) {
    const A = Gr.A;
    const ids = new Set([...ion.set].map(i => maps.idOf[i]).filter(id => id != null));
    const key = (a, b) => [a, b].sort().join('|');
    const cut = new Set((ion.cut || []).map(([i, j]) => key(maps.idOf[i], maps.idOf[j])));
    const bo = new Map((ion.bo || []).map(([i, j, o]) => [key(maps.idOf[i], maps.idOf[j]), o]));
    const atoms = m.atoms.filter(a => ids.has(a.id)).map(a => { const c = JSON.parse(JSON.stringify(a)); for (const k of ['hd', 'q', 'rad', 'hq', 'cn', 'ci', 'nm', 'grp']) delete c[k]; return c; });
    const bonds = m.bonds.filter(b => ids.has(b.a) && ids.has(b.b) && !cut.has(key(b.a, b.b))).map(b => { const k = key(b.a, b.b); return bo.has(k) ? { ...b, o: bo.get(k), s: '' } : { ...b }; });
    const sub = { atoms, bonds, nid: m.nid, objs: [] };
    const idx = ChemMol.index(sub);
    // Ladungsort: berechnet; sonst (Radikalkation ohne Ort) das erste Heteroatom mit freiem Elektronenpaar, sonst ein π-C
    let site = ion.site != null && ion.set.has(ion.site) ? maps.idOf[ion.site] : null;
    if (site == null) { const het = atoms.find(a => /^(O|N|S)$/.test(a.el)); const pi = atoms.find(a => sub.bonds.some(b => (b.a === a.id || b.b === a.id) && b.o >= 2)); site = (het || pi || atoms[0] || {}).id; }
    for (const a of atoms) {
      const i = maps.ixOf.get(a.id);
      if (i == null) continue;
      const target = Math.max(0, A[i].h + ((ion.dh && ion.dh[i]) || 0));
      a.q = A[i].q || 0;
      if (a.id === site) { a.q += 1; if (ion.oe) a.rad = 1; }
      const imp = ChemMol.implicitH(a.el, a.q, ChemMol.bondSum(idx, a.id));
      const hd = imp - target;
      if (hd) a.hd = hd;
    }
    return sub;
  },
  msIonSvg(m, Gr, ion, maps) {
    const sub = this.msIonMol(m, Gr, ion, maps);
    const r = ChemRender.draw(sub, { ...this.opts, caption: false, stars: false, nameCap: false, rs: false, ez: false, model: 'skelett' });
    const bx = r.box, pad = 8;
    // eckige Klammern mit Ladung: [ ]⁺ (gerade Elektronenzahl) bzw. [ ]⁺· (Radikalkation)
    const y0 = bx.y0 - 4, y1 = bx.y1 + 4, x0 = bx.x0 - 6, x1 = bx.x1 + 6;
    const br = `<path d="M${x0 + 4},${y0}L${x0},${y0}L${x0},${y1}L${x0 + 4},${y1}M${x1 - 4},${y0}L${x1},${y0}L${x1},${y1}L${x1 - 4},${y1}" fill="none" stroke="#222" stroke-width="1.2"/><text x="${x1 + 2}" y="${y0 + 9}" font-size="12" fill="#222">${ion.oe ? '+•' : '+'}</text>`;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${(x0 - pad).toFixed(1)} ${(y0 - pad).toFixed(1)} ${(x1 - x0 + 2 * pad + 14).toFixed(1)} ${(y1 - y0 + 2 * pad).toFixed(1)}" class="chem-msmol">${r.body}${br}</svg>`;
  },
  /* Name eines Bruchstücks (1.56) – kurz und verständlich, aus dem Zerfallsweg und der Formel */
  msName(io) {
    const f = io.c || {}, n = (e) => f[e] || 0, w = io.why || '';
    const hc = !n('O') && !n('N') && !n('S') && !n('Cl') && !n('Br') && !n('I') && !n('F');
    if (io.kind === 'M') return 'Molekül-Ion';
    if (/Tropylium/.test(w)) return n('C') === 7 && n('H') === 7 ? 'Tropylium-Ion' : 'Benzyl-/Tropylium-Ion';
    if (/Benzoyl/.test(w)) return n('C') === 7 && n('H') === 5 && n('O') === 1 ? 'Benzoyl-Kation' : 'Aroyl-Kation';
    if (/Formyl/.test(w)) return 'Formyl-Kation';
    if (/Acylium-Ion R/.test(w)) return ({ 'C2H3O': 'Acetyl-Kation', 'C3H5O': 'Propionyl-Kation', 'C4H7O': 'Butyryl-Kation' })[`C${n('C')}H${n('H')}O`] || 'Acylium-Ion';
    if (/Phenyl/.test(w) && n('C') === 6 && n('H') === 5 && hc) return 'Phenyl-Kation';
    if (/McLafferty/.test(w)) return 'Enol-Radikalkation (McLafferty)';
    if (/Retro-Diels/.test(w)) return /Dien/.test(w) ? 'Dien-Radikalkation (Retro-Diels-Alder)' : 'Alken-Radikalkation (Retro-Diels-Alder)';
    if (/Iminium/.test(w)) return 'Iminium-Ion';
    if (/Oxonium/.test(w)) return 'Oxonium-Ion';
    if (/Keten/.test(w)) return 'Radikalkation nach Keten-Verlust';
    if (/ortho-Effekt/.test(w)) return 'Keten-Radikalkation (ortho-Effekt)';
    if (hc && !io.oe) {
      const c = n('C'), h = n('H');
      const sat = { 1: 'Methyl', 2: 'Ethyl', 3: 'Propyl-/Isopropyl', 4: 'Butyl-/tert-Butyl', 5: 'Pentyl', 6: 'Hexyl' }[c];
      if (h === 2 * c + 1 && sat) return sat + '-Kation';
      if (h === 2 * c - 1) return ({ 2: 'Vinyl-Kation', 3: 'Allyl-Kation', 4: 'Butenyl-Kation', 5: 'Pentenyl-Kation' })[c] || 'Alkenyl-Kation';
      if (c === 4 && h === 3) return 'C₄H₃⁺ (aus Phenyl)';
    }
    if (/Nitroaromat: Verlust von ·NO₂/.test(w)) return 'Aryl-Kation';
    if (/NO \(/.test(w)) return 'Phenoxy-Kation';
    if (/H₂O/.test(w)) return 'Radikalkation nach H₂O-Verlust';
    if (/Verlust von H·/.test(w)) return 'Ion nach H-Verlust (M−1)';
    return (w.split(/[,(→]/)[0] || 'Bruchstück').trim();
  },
  /* MS-Bruchstücke (1.56): Auswahlfeld mit Namen statt Karten; Vorschau (Molekül mit Bruchstelle | Ion),
   * Abbruchfolge und „In die Zeichnung“ (Ion mit Ladung/Radikal rechts neben die Zeichnung) */
  msFragView(m, Gr, sim) {
    const maps = this.msGraphMaps(m, Gr);
    const wrap = el('section', { class: 'chem-msfrag' });
    const list = sim.ions.filter(io => io.kind !== 'M' && io.relPk >= 2.5).sort((a, b) => b.relPk - a.relPk);
    if (!list.length) { wrap.append(el('div', { class: 'chem-muted', text: 'Keine wesentlichen Bruchstücke – das Molekül-Ion ist sehr stabil.' })); return wrap; }
    const sel = el('select', { class: 'chem-mssel', title: 'Bruchstück wählen – Vorschau, Abbruchfolge und Einfügen in die Zeichnung' });
    for (const io of list) sel.append(el('option', { value: String(io.mz), text: `m/z ${io.mz} · ${this.msName(io)} · ${io.formula}${io.oe ? '⁺·' : '⁺'} · ${Math.round(io.relPk)} %` }));
    sel.addEventListener('keydown', e => e.stopPropagation());
    const ins = el('button', { class: 'btn primary chem-msins', text: 'In die Zeichnung', title: 'Dieses Bruchstück mit Ladung (und Radikal) rechts neben die Zeichnung setzen' });
    const prev = el('div', { class: 'chem-msprev' });
    const chainBox = el('div', { class: 'chem-mschain' });
    const why = el('div', { class: 'chem-muted chem-mswhy' });
    let cur = null;
    const select = (io) => {
      cur = io; sel.value = String(io.mz); this._msSel = io.mz;
      prev.innerHTML = '';
      const a = el('div', { class: 'chem-mscard-mol', title: 'Ganzes Molekül: Bruchstück orange, Bruchstelle rot' }), b = el('div', { class: 'chem-mscard-ion', title: 'Das Ion' });
      try { a.innerHTML = this.msHighlightSvg(m, Gr, io, maps); } catch (e) { /* */ }
      try { b.innerHTML = this.msIonSvg(m, Gr, io, maps); } catch (e) { /* */ }
      prev.append(a, b);
      chainBox.innerHTML = '';
      const row = el('div', { class: 'chem-mschain-row' });
      ChemProps.msChain(sim, io).forEach((x, k) => {
        if (k) row.append(el('div', { class: 'chem-mschain-arrow' }, el('span', { text: '− ' + (x.loss || '?') }), el('span', { class: 'chem-mschain-ar', text: '⟶' })));
        const f = el('div', { class: 'chem-mschain-step' });
        try { f.innerHTML = this.msIonSvg(m, Gr, x, maps); } catch (e) { /* */ }
        f.append(el('div', { class: 'chem-mschain-lab', text: `m/z ${x.mz}` + (x.kind === 'M' ? ' (M⁺·)' : '') }));
        row.append(f);
      });
      chainBox.append(el('div', { class: 'chem-sub', text: 'Abbruchfolge' }), row);
      why.textContent = io.why + (io.loss ? ` (− ${io.loss})` : '') + (io.approx ? ' · Struktur schematisch' : '');
    };
    sel.addEventListener('change', () => { const io = list.find(x => x.mz === +sel.value); if (io) select(io); });
    ins.addEventListener('click', () => {
      if (!cur) return;
      const sub = this.msIonMol(m, Gr, cur, maps);
      if (!sub.atoms.length) return;
      this.insertClip({ atoms: sub.atoms, bonds: sub.bonds, objs: [] });
      this.setTab('struktur');
      UI.toast(`${this.msName(cur)} (m/z ${cur.mz}) eingefügt – Strg+Z macht es rückgängig`);
    });
    this._msSelect = (mz) => { const io = list.find(x => x.mz === mz); if (io) select(io); };
    wrap.append(el('div', { class: 'chem-msbar' }, el('b', { text: 'Bruchstück:' }), sel, ins), prev, why, chainBox);
    select(list.find(x => x.mz === this._msSel) || list[0]);
    return wrap;
  },
  buildAnalyse() {
    const E = this.E, P = E.atab;
    // nur das ausgewählte Molekül (1.54); bei mehreren ohne Auswahl: Liste zum Wählen
    const FA = this.focus();
    const frsA = E.mol.atoms.length ? ChemRender.fragments(E.mol) : [];
    if (!FA && frsA.length > 1) {
      P.innerHTML = '';
      P.append(el('h3', { text: `${frsA.length} Moleküle – welches analysieren?` }));
      const list = el('div', { class: 'chem-flist' });
      frsA.forEach((f, i) => { const fa = ChemMol.analyze(ChemRender.subMol(E.mol, f)); list.append(el('button', { class: 'chem-fitem', onclick: () => { this.selectFrag(f); this.buildAnalyse(); } }, el('b', { html: `${i + 1}. ${fa.hill.html}` }), el('span', { text: chemM(fa.mass) + ' g/mol' }))); });
      P.append(list);
      this.buildImport(P);
      return;
    }
    const m = FA ? FA.mol : E.mol;
    P.innerHTML = '';
    const sec = (t, sub) => { const d = el('section', { class: 'chem-asec' }, el('h3', { text: t })); if (sub) d.append(el('div', { class: 'chem-muted', text: sub })); P.append(d); return d; };
    const kv = (box, k, v, title) => box.append(el('div', { class: 'chem-kv', title: title || '' }, el('span', { text: k }), el('b', { html: v })));
    if (!m.atoms.length) {
      P.append(el('div', { class: 'chem-muted chem-aempty', text: 'Noch keine Struktur – im Register „Struktur zeichnen“ zeichnen, eine Vorlage wählen oder unten SMILES/Molfile laden.' }));
      this.buildImport(P);
      return;
    }
    let pr, Gr, groups;
    try { Gr = ChemProps.graph(m); pr = ChemProps.props(m); groups = ChemProps.groups(m, Gr); } catch (e) { P.append(el('div', { class: 'chem-warn', text: 'Analyse nicht möglich: ' + e.message })); return; }
    const an = ChemMol.analyze(m);
    const head = el('div', { class: 'chem-ahead' });
    head.append(el('div', { class: 'chem-big', html: an.hill.html }), el('div', { class: 'chem-muted', text: (this.nameText() || '') + ` · M = ${chemM(an.mass)} g/mol` }));
    P.append(head);
    const grid = el('div', { class: 'chem-agrid' });
    P.append(grid);
    // Kennzahlen
    const k1 = el('section', { class: 'chem-asec' }, el('h3', { text: 'Kennzahlen' }));
    kv(k1, 'Exakte Masse', chemNum(an.exact, 4), 'Monoisotopische Masse');
    kv(k1, 'Doppelbindungsäquivalente', chemNum(pr.dbe, 1), 'Ringe + π-Bindungen: 1 + C + (N − H − X)/2');
    kv(k1, 'Ringe / davon aromatisch', `${pr.rings} / ${pr.arom}`);
    kv(k1, 'H-Brücken-Donoren', String(pr.hbd), 'H an N und O');
    kv(k1, 'H-Brücken-Akzeptoren', String(pr.hba), 'N- und O-Atome');
    kv(k1, 'Drehbare Bindungen', String(pr.rot));
    kv(k1, 'Polare Oberfläche (TPSA)', chemNum(pr.tpsa, 1) + ' Å²', 'Topologische polare Oberfläche nach Ertl (N und O)');
    kv(k1, 'logP (Schätzung)', chemNum(pr.logp, 2), 'Octanol/Wasser – eigenes Atombeitrags-Modell, typische Abweichung ±0,5');
    k1.append(el('div', { class: 'chem-sub', text: 'Lipinski-Regel (Rule of Five)' }));
    for (const r of pr.lipinski) k1.append(el('div', { class: 'chem-lip ' + (r.ok ? 'ok' : 'no'), text: (r.ok ? '✓ ' : '✗ ') + r.t }));
    k1.append(el('div', { class: 'chem-muted', text: pr.lipOk ? 'Erfüllt (höchstens eine Verletzung) – als Arzneistoff gut aufnehmbar.' : 'Mehr als eine Verletzung – als Tablette eher schlecht aufnehmbar.' }));
    grid.append(k1);
    // funktionelle Gruppen
    const k2 = el('section', { class: 'chem-asec' }, el('h3', { text: 'Funktionelle Gruppen' }));
    const chips = el('div', { class: 'chem-chips' });
    for (const g of groups) chips.append(el('span', { class: 'chem-chip', text: g.label + (g.n > 1 ? ' ×' + g.n : '') }));
    k2.append(groups.length ? chips : el('div', { class: 'chem-muted', text: 'Keine besonderen Gruppen (reiner Kohlenwasserstoff oder anorganisch).' }));
    // Sicherheit: GESTIS (1.53: direkter Link zum Stoffblatt über die Stoffliste der DGUV oder eine eingetragene ZVG-Nr.)
    k2.append(el('div', { class: 'chem-sub', text: 'Sicherheitsdaten (GHS, Grenzwerte, Erste Hilfe)' }));
    const found = this.gestisFind(), L = this.gestisList();
    const zvgIn = el('input', { class: 'chem-zvg', placeholder: 'ZVG-Nr.', value: this.gestisZvg(), title: 'ZVG-Nummer selbst eintragen (steht in der Adresse des Stoffblatts: …data?name=…); wird nur bei dir gespeichert' });
    zvgIn.addEventListener('keydown', e => e.stopPropagation());
    zvgIn.addEventListener('change', () => { this.gestisZvg(zvgIn.value.replace(/\D/g, '')); this.buildAnalyse(); });
    k2.append(el('div', { class: 'chem-row' }, el('button', { class: 'btn' + (found ? ' primary' : ''), text: found ? 'GESTIS-Stoffblatt öffnen' : 'In GESTIS suchen', title: found ? this.gestisUrl(found.zvg) : 'GESTIS-Stoffdatenbank öffnen, Name liegt in der Zwischenablage', onclick: () => { if (zvgIn.value.replace(/\D/g, '') !== this.gestisZvg()) this.gestisZvg(zvgIn.value.replace(/\D/g, '')); this.gestis(); } }), zvgIn));
    k2.append(el('div', { class: 'chem-muted', text: found ? `Direkter Link: ZVG ${found.zvg.padStart(6, '0')} (${found.how}).` : L ? 'Dieser Stoff steht nicht unter diesem Namen in der Stoffliste – der Knopf öffnet die Suche, der Name liegt in der Zwischenablage. Die ZVG-Nummer kannst du rechts eintragen.' : 'Für den direkten Link zum Stoffblatt einmal die Stoffliste der DGUV laden (siehe unten) – oder die ZVG-Nummer rechts eintragen.' }));
    const lf = el('input', { type: 'file', accept: '.xlsx', hidden: true });
    lf.addEventListener('change', async () => {
      const f = lf.files[0]; if (!f) return;
      try { const r = await this.gestisImport(f); UI.toast(`GESTIS-Stoffliste geladen: ${r.n} Stoffe`); this.buildAnalyse(); }
      catch (e) { UI.toast('Liste nicht lesbar: ' + e.message, 5000); }
    });
    k2.append(el('div', { class: 'chem-row' },
      el('button', { class: 'chem-mini', text: '1. Stoffliste herunterladen (DGUV)', title: 'ZVG/CAS-Liste der DGUV (Excel) – vom IFA zum Verlinken angeboten', onclick: () => window.open(this.GESTIS_LIST_URL, '_blank', 'noopener') }),
      el('button', { class: 'chem-mini', text: '2. Liste laden …', onclick: () => lf.click() }), lf));
    k2.append(el('div', { class: 'chem-muted', text: (L ? `Stoffliste geladen (${L.n} Stoffe, ${L.at}). ` : '') + 'Quelle ist die GESTIS-Stoffdatenbank (IFA/DGUV). Es werden keine Stoffdaten übernommen – nur verlinkt; aus der Liste merkt sich das Programm nur Name/CAS → ZVG-Nummer.' }));
    grid.append(k2);
    // Spektren (1.53): IR | Massenspektrum | NMR (Kern im Auswahlfeld, gemerkt) – zoombar, als Bild speicherbar
    const sp = el('section', { class: 'chem-asec chem-aspec' }, el('h3', { text: 'Spektren (berechnet)' }));
    const seg = el('div', { class: 'chem-seg chem-specseg' });
    const nmrSel = el('select', { class: 'chem-nmrsel', title: 'Welcher Kern? (wird gemerkt)' });
    const nmrOnly = [];
    for (const N of ChemProps.NUCLEI) {
      const has = ChemProps.hasNuc(Gr, N.k);
      nmrSel.append(el('option', { value: N.k, text: N.label + (has ? '' : ' – kein ' + N.el + ' im Molekül') }));
    }
    nmrSel.value = this.opts.nmrNuc || 'H';
    const box = el('div', { class: 'chem-specbox' });
    const title = () => (this.nameText() || an.hill.text || 'Struktur');
    let cur = null;   // { kind, svg (aktuelle Ansicht), full: [x0, x1], data }
    const makeData = (k) => {
      if (k === 'ir') { const B = ChemProps.ir(m, groups, Gr); let modes = null; try { modes = ChemProps.irModes(m); } catch (e) { modes = null; } return { B, modes, full: [4000, 400], minSpan: 20 }; }
      if (k === 'ms') {
        const pk = ChemProps.isotopes(an.counts) || [];
        const M0 = pk.length ? pk.reduce((x, y) => y.rel > x.rel ? y : x).nom : Math.round(an.mass);
        // 1.54: simuliertes EI-Spektrum (Bruchstücke mit geschätzter Höhe + Isotopenmuster); alte Hinweisliste als Rückfall
        let sim = null;
        try { sim = pk.length ? ChemProps.msSim(m, Gr) : null; } catch (e) { sim = null; }
        const fr = pk.length && !sim ? ChemProps.fragments(m, groups, pk[0].nom) : [];
        const peaks = sim ? sim.peaks : pk;
        return { pk, fr, sim, peaks, M0, full: pk.length ? ChemProps.msRange(peaks, fr) : [0, 1], minSpan: 2 };
      }
      const nuc = this.opts.nmrNuc || 'H';
      const sig = ChemProps.nmr(m, nuc, Gr);
      return { sig, nuc, full: ChemProps.nmrRange(sig, nuc), minSpan: nuc === 'H' ? 0.008 : 1 };
    };
    const svgOf = (c) => {
      const v = E.specView || null, ys = E.specY || 1;
      if (c.kind === 'ir') return ChemProps.svgIR(c.data.B, v, c.data.modes);
      if (c.kind === 'ms') return c.data.pk.length ? ChemProps.svgMS(c.data.peaks, c.data.fr, v, ys) : '';
      return ChemProps.svgNMR(c.data.sig, c.data.nuc, v, ys, +(this.opts.nmrMHz || 600), { integral: !!this.opts.nmrInt, leaders: this.opts.nmrLead !== false });
    };
    const label = (c) => c.kind === 'ir' ? 'IR-Spektrum' : c.kind === 'ms' ? 'Massenspektrum' : (ChemProps.NUCLEI.find(N => N.k === c.data.nuc) || {}).label;
    const svgBox = el('div', { class: 'chem-specsvg' });
    const band = el('div', { class: 'chem-specband', hidden: true });
    svgBox.append(band);
    const draw = () => { cur.svg = svgOf(cur); svgBox.innerHTML = ''; svgBox.append(band); if (cur.svg) svgBox.insertAdjacentHTML('afterbegin', cur.svg); };
    // Ausschnitt setzen (innerhalb des ganzen Spektrums, Mindestbreite)
    const setView = (x0, x1) => {
      const [f0, f1] = cur.data.full, dir = Math.sign(f1 - f0) || 1;
      const lo = Math.min(f0, f1), hi = Math.max(f0, f1);
      let a2 = Math.max(lo, Math.min(x0, x1)), b2 = Math.min(hi, Math.max(x0, x1));
      if (b2 - a2 < cur.data.minSpan) { const c = (a2 + b2) / 2; a2 = Math.max(lo, c - cur.data.minSpan / 2); b2 = Math.min(hi, a2 + cur.data.minSpan); }
      E.specView = b2 - a2 >= (hi - lo) * 0.999 ? null : dir > 0 ? { x0: a2, x1: b2 } : { x0: b2, x1: a2 };
      draw();
    };
    const view = () => E.specView ? [E.specView.x0, E.specView.x1] : cur.data.full;
    const valAt = (clientX) => {
      const sv = svgBox.querySelector('svg');
      const r = sv.getBoundingClientRect(), G = ChemProps.GEO, [x0, x1] = view();
      const px = (clientX - r.left) * G.W / r.width;
      return x0 + (px - G.l) / (G.W - G.l - G.r) * (x1 - x0);
    };
    const zoom = (f, at) => { const [x0, x1] = view(); const c = at != null ? at : (x0 + x1) / 2; setView(c + (x0 - c) * f, c + (x1 - c) * f); };
    const pan = (k) => { const [x0, x1] = view(); const d = (x1 - x0) * k; setView(x0 + d, x1 + d); };
    svgBox.addEventListener('wheel', (e) => { if (!cur || !cur.svg) return; e.preventDefault(); if (e.shiftKey) pan(Math.sign(e.deltaY || e.deltaX) * 0.15); else zoom(e.deltaY < 0 ? 0.8 : 1.25, valAt(e.clientX)); }, { passive: false });
    svgBox.addEventListener('dblclick', () => { if (cur) { E.specView = null; draw(); } });
    // Ziehen = Bereich wählen (Maus); zwei Finger = zoomen
    const ptr = new Map();
    let drag = null, pinch = null;
    svgBox.addEventListener('pointerdown', (e) => {
      if (!cur || !cur.svg || e.button > 0) return;
      ptr.set(e.pointerId, e.clientX);
      svgBox.setPointerCapture(e.pointerId);
      if (ptr.size === 2) { const xs = [...ptr.values()]; pinch = { d: Math.abs(xs[0] - xs[1]) || 1, v: view(), at: valAt((xs[0] + xs[1]) / 2) }; drag = null; band.hidden = true; return; }
      const r = svgBox.getBoundingClientRect();
      drag = { x: e.clientX, left: r.left };
    });
    svgBox.addEventListener('pointermove', (e) => {
      if (!ptr.has(e.pointerId)) return;
      ptr.set(e.pointerId, e.clientX);
      if (pinch && ptr.size === 2) {
        const xs = [...ptr.values()], d = Math.abs(xs[0] - xs[1]) || 1, f = pinch.d / d;
        const [x0, x1] = pinch.v, c = pinch.at;
        setView(c + (x0 - c) * f, c + (x1 - c) * f);
        return;
      }
      if (drag && Math.abs(e.clientX - drag.x) > 4) {
        const a2 = Math.min(drag.x, e.clientX) - drag.left, w = Math.abs(e.clientX - drag.x);
        Object.assign(band.style, { left: a2 + 'px', width: w + 'px' });
        band.hidden = false;
      }
    });
    const up = (e) => {
      if (!ptr.has(e.pointerId)) return;
      ptr.delete(e.pointerId);
      if (pinch) { if (!ptr.size) pinch = null; return; }
      if (drag && Math.abs(e.clientX - drag.x) > 6) { const v1 = valAt(drag.x), v2 = valAt(e.clientX); setView(Math.min(v1, v2), Math.max(v1, v2)); }
      else if (drag && cur.kind === 'ms' && cur.data.sim && this._msSelect) {
        // Klick auf einen Peak (1.55): passendes Bruchstück als Struktur zeigen
        const v = valAt(e.clientX), [x0, x1] = view(), tol = Math.abs(x1 - x0) / 60 + 0.5;
        const io = cur.data.sim.ions.filter(x => x.kind !== 'M' && Math.abs(x.mz - v) <= tol).sort((p, q) => Math.abs(p.mz - v) - Math.abs(q.mz - v))[0];
        if (io) { this._msSelect(io.mz); const c = box.querySelector('.chem-msfrag'); if (c) c.scrollIntoView({ block: 'nearest' }); }
      }
      drag = null; band.hidden = true;
    };
    svgBox.addEventListener('pointerup', up);
    svgBox.addEventListener('pointercancel', up);
    // Werkzeugleiste: Zoom, Verschieben, Höhe, Export
    const ysSel = el('select', { class: 'chem-ysel', title: 'Höhe vergrössern (kleine Signale, z. B. Isotopenpeaks M+1)' });
    for (const f of [1, 2, 5, 10, 20]) ysSel.append(el('option', { value: String(f), text: 'Höhe ×' + f }));
    ysSel.addEventListener('change', () => { E.specY = +ysSel.value; draw(); });
    const fileName = (ext) => (title() + ' - ' + label(cur)).replace(/[¹²³⁴⁵⁶⁷⁸⁹⁰]/g, c => '¹²³⁴⁵⁶⁷⁸⁹⁰'.indexOf(c) === 9 ? '0' : String('¹²³⁴⁵⁶⁷⁸⁹⁰'.indexOf(c) + 1)).replace(/[\\/:*?"<>|]+/g, '_').slice(0, 80) + '.' + ext;
    const imgSvg = () => ChemProps.standalone(cur.svg, `${title()} – ${label(cur)} (berechnet)`);
    const tbar = el('div', { class: 'chem-spectools' },
      el('button', { class: 'chem-mini', text: '−', title: 'Herauszoomen', onclick: () => zoom(1.5) }),
      el('button', { class: 'chem-mini', text: '+', title: 'Hineinzoomen', onclick: () => zoom(1 / 1.5) }),
      el('button', { class: 'chem-mini', text: '◀', title: 'Nach links verschieben', onclick: () => pan(-0.25) }),
      el('button', { class: 'chem-mini', text: '▶', title: 'Nach rechts verschieben', onclick: () => pan(0.25) }),
      el('button', { class: 'chem-mini', text: '↺ ganzes Spektrum', onclick: () => { E.specView = null; draw(); } }),
      ysSel,
      el('span', { class: 'chem-tsep' }),
      el('button', { class: 'chem-mini', text: 'PNG speichern', title: 'Aktuellen Ausschnitt als PNG-Bild speichern', onclick: async () => { const bl = await this.svgToPng(imgSvg(), 2); if (bl) this.download(bl, fileName('png')); } }),
      el('button', { class: 'chem-mini', text: 'SVG speichern', title: 'Als Vektorgrafik (SVG) speichern – beliebig vergrösserbar', onclick: () => this.download(new Blob([imgSvg()], { type: 'image/svg+xml' }), fileName('svg')) }),
      el('button', { class: 'chem-mini', text: 'In die Seite einfügen', title: 'Aktuellen Ausschnitt als Bild in die Seite', onclick: async () => {
        const blob = new Blob([imgSvg()], { type: 'image/svg+xml' });
        this.close();
        await Canvas.insertImage(null, blob, Canvas.viewCenter(), null, { tight: true, label: 'Spektrum eingefügt' });
      } }));
    // NMR (1.55): Integral (Standard aus) und Zuordnungs-Striche (Standard an) umschaltbar, gemerkt
    const tog = (key, text, title, def) => {
      const cb = el('input', { type: 'checkbox' });
      cb.checked = this.opts[key] == null ? def : !!this.opts[key];
      cb.addEventListener('change', () => { this.opts[key] = cb.checked; this.saveOpts(); if (cur) draw(); });
      return el('label', { class: 'chem-tog', title }, cb, el('span', { text }));
    };
    const nmrTogs = el('span', { class: 'chem-nmrtogs' },
      tog('nmrLead', 'Striche', 'Striche von der Beschriftung zum Peak – zeigen, welcher Peak zu welchem Signal gehört', true),
      tog('nmrInt', 'Integral', 'Grüne Integral-Stufen (Höhe ~ Anzahl H)', false));
    tbar.insertBefore(nmrTogs, tbar.querySelector('.chem-tsep'));
    const info = el('div', { class: 'chem-spechint chem-muted', text: 'Mausrad = zoomen · Ziehen = Bereich vergrössern · Umschalt+Mausrad = verschieben · Doppelklick = ganzes Spektrum · zwei Finger = zoomen' });
    const show = (k) => {
      this.opts.specKind = k; this.saveOpts();
      E.specView = null; E.specY = 1; ysSel.value = '1';
      for (const btn of seg.querySelectorAll('[data-k]')) btn.classList.toggle('on', btn.dataset.k === k);
      nmrSel.classList.toggle('on', k === 'nmr');
      nmrTogs.hidden = k !== 'nmr';
      for (const x of nmrOnly) x.hidden = k !== 'nmr';
      cur = { kind: k, data: makeData(k) };
      box.innerHTML = '';
      let rows = [], note = '';
      if (k === 'ir') {
        // 1.55: alle Tabellen-Banden (auch die kennzeichnenden im Fingerprint), dazu starke berechnete Schwingungen, die keine Tabellen-Bande erklärt
        const Bt = cur.data.B, md = (cur.data.modes || []).filter(x => x.nu < 1500 && x.nu >= 400 && x.rel > 0.3 && !Bt.some(b => Math.abs(b.c - x.nu) < 30));
        rows = [...Bt.map(x => ({ c: x.c, r: [x.hi - x.lo > 12 ? `${x.lo}–${x.hi} cm⁻¹` : `≈ ${Math.round(x.c)} cm⁻¹`, x.t, x.s > 0.75 ? 'stark' : x.s > 0.4 ? 'mittel' : 'schwach'] })),
          ...md.map(x => ({ c: x.nu, r: [`≈ ${Math.round(x.nu)} cm⁻¹`, x.label + ' (berechnet)', x.rel > 0.6 ? 'stark' : 'mittel'] }))].sort((a2, b2) => b2.c - a2.c).map(x => x.r);
        note = 'Banden nach Tabellenwerten für jede erkannte Gruppe einzeln (Art, Ringgrösse, Konjugation – z. B. Keton 1715, Cyclopentanon 1745, Arylketon 1686, Ester 1742, Arylester 1765, Amide 1650–1690), dazu die kennzeichnenden Fingerprint-Banden (C–O, NO₂, C–Hal, Substitutionsmuster des Benzols aus den C–H-oop-Banden, Alken-Typ). Die Feinstruktur unter 1500 cm⁻¹ kommt aus berechneten Normalschwingungen des 3D-Modells' + (cur.data.modes ? '' : ' (für dieses Molekül zu gross – nur Tabellenbanden)') + '. Typische Abweichung ±10–20 cm⁻¹ für die Tabellenbanden – kein gemessenes Spektrum.';
      } else if (k === 'ms') {
        rows = cur.data.pk.filter(x => x.rel >= 0.5).map(x => [`m/z ${x.nom}`, `M-Isotopenmuster · ${chemNum(x.m, 4)} u`, chemNum(x.rel, 1) + ' %']);
        if (cur.data.sim) {
          const base = cur.data.sim.peaks.reduce((a2, b2) => b2.rel > a2.rel ? b2 : a2);
          for (const f of cur.data.sim.peaks.filter(x => x.kind === 'F' && !x.iso && x.rel >= 5).sort((a2, b2) => b2.rel - a2.rel).slice(0, 14))
            rows.push([`m/z ${f.nom}`, `${f.formula}${f.ion && f.ion.oe ? '⁺·' : '⁺'} · ${f.why}${f.ion && f.ion.loss ? ' (− ' + f.ion.loss + ')' : ''}`, chemNum(f.rel, 0) + ' %' + (f === base ? ' (Basispeak)' : '')]);
          note = 'Simuliertes EI-Massenspektrum (70 eV): Molekül-Ion (blau) mit exaktem Isotopenmuster; Bruchstücke (orange) aus Bindungsbrüchen – die Ladung bleibt beim stabileren Kation (α-Spaltung neben O/N, Acylium, benzylisch → Tropylium m/z 91, allylisch, tertiär; der grössere Rest geht bevorzugt) – und Umlagerungen (McLafferty, H₂O-, Keten- und CO-Verlust, ortho-Effekt), je mit eigenem Isotopenmuster. Höhen sind Schätzungen aus Stabilitätsregeln, kein gemessenes Spektrum. Tipp: Höhe ×10 zeigt kleine Peaks.';
        } else rows.push(...cur.data.fr.map(f => [`m/z ${f.mz}`, f.t, 'Bruchstück']));
        if (!cur.data.sim) note = 'Molekül-Ion mit Isotopenmuster (exakt aus den natürlichen Isotopenhäufigkeiten, blau); gestrichelt: typische Bruchstücke bei Elektronenstoss-Ionisierung (Hinweise, Höhe nicht berechnet). Tipp: Höhe ×10 zeigt kleine Isotopenpeaks.';
      } else {
        const nuc = cur.data.nuc, sig = cur.data.sig;
        rows = sig.map((x, k) => [ChemProps.nmrLetter(k)].concat(nuc === 'H' ? [`δ ≈ ${chemNum(x.d, 2)} ppm`, `${x.n} H · ${x.mult}${x.J && x.J.length ? ' (J = ' + x.J.map(j => chemNum(j, 1)).join(', ') + ' Hz)' : ''}`, x.env + (x.unique ? ' · einzigartig' : x.n > 1 ? ` · ${x.n} chemisch äquivalente H` : '')] : [`δ ≈ ${chemNum(x.d, 1)} ppm`, `${x.n} ${nuc === 'C' ? 'C' : nuc}${x.n > 1 ? ' (gleichwertig)' : ''}`, x.env + (x.q && nuc === 'C' ? ' · quartär (kleiner)' : '')]));
        note = !sig.length ? `Keine ${nuc}-Kerne im Molekül.` : nuc === 'H' ? `${sig.length} Signale aus ${sig.reduce((t, x) => t + x.n, 0)} H (Buchstaben wie im Strukturbild). Chemisch äquivalente H (Symmetrie) geben ein Signal; einzigartige H – diastereotope CH₂ neben einem Stereozentrum, die zwei H einer =CH₂-Gruppe, die beiden N-Methylgruppen eines Amids (gehinderte Rotation) – eigene Signale. Verschiebung (CDCl₃) aus Inkrementen nach Curphy–Morrison/Pretsch (sp³-C), Aromaten-Substituenten, Pascual–Meier–Simon (Alkene) – an Messwerten geprüft, typisch ±0,1 ppm. Kopplung 1. Ordnung (n+1-Regel je Nachbargruppe mit eigenem J: dd, dt …), auch zu ¹⁹F und ³¹P; Dacheffekt; Linienbreite 0,8 Hz. Hineinzoomen zeigt die Multipletts. OH/NH breit, Lage schwankt.`
          : nuc === 'C' ? 'Ein Signal je Gruppe gleichwertiger C-Atome (Symmetrie), ¹H-entkoppelt, CDCl₃. Verschiebung: sp³-C nach Grant–Paul mit Substituenten-Beiträgen, Aromaten mit ipso/ortho/meta/para-Inkrementen, Alkene mit α/β/γ-Inkrementen, C=O nach Art – an Messwerten geprüft, typisch ±1–3 ppm. Quartäre C (ohne H) erscheinen kleiner, wie im echten Spektrum.'
            : nuc === 'F' ? 'Bezug CFCl₃ = 0 ppm; Verschiebung nach Tabellenwerten der Umgebung (Schätzung), ¹H-entkoppelt, F–F-Kopplungen nicht gezeigt.'
              : nuc === 'P' ? 'Bezug 85 % H₃PO₄ = 0 ppm; Verschiebung nach Tabellenwerten (Phosphat, Phosphit, Phosphoramidit, Phosphin …), ¹H-entkoppelt.'
                : 'Bezug flüssiges NH₃ = 0 ppm (Nitromethan-Skala: −380 ppm); grobe Tabellenwerte, ¹H-entkoppelt.';
      }
      if (cur.kind !== 'ms' || cur.data.pk.length) { box.append(tbar, svgBox, info); draw(); }
      const tb = el('table', { class: 'chem-spectab' + (k === 'nmr' ? ' chem-nmrtab' : '') });
      for (const r of rows) tb.append(el('tr', {}, ...r.map(c => el('td', { text: c }))));
      if (k === 'nmr' && cur.data.sig.length) {
        // Zuordnung (1.55): Strukturbild mit den Buchstaben der Signale neben der Tabelle
        let as = '';
        try { as = ChemProps.assignSvg(m, Gr, cur.data.sig); } catch (e) { as = ''; }
        const fig = el('div', { class: 'chem-assign-box', title: 'Welches Atom gehört zu welchem Signal (Buchstaben wie im Spektrum)' });
        fig.innerHTML = as;
        box.append(el('div', { class: 'chem-nmrrow' }, tb, fig));
      } else box.append(tb);
      if (k === 'ms' && cur.data.sim) box.append(this.msFragView(m, Gr, cur.data.sim));
      box.append(el('div', { class: 'chem-muted', text: note }));
    };
    seg.append(el('button', { text: 'IR', dataset: { k: 'ir' }, onclick: () => show('ir') }), el('button', { text: 'Massenspektrum', dataset: { k: 'ms' }, onclick: () => show('ms') }), el('button', { text: 'NMR', dataset: { k: 'nmr' }, onclick: () => show('nmr') }));
    nmrSel.addEventListener('change', () => { this.opts.nmrNuc = nmrSel.value; this.saveOpts(); show('nmr'); });
    nmrSel.addEventListener('keydown', e => e.stopPropagation());
    const mhzSel = el('select', { class: 'chem-ysel', title: 'Spektrometer-Frequenz (¹H): höher = Multipletts weiter getrennt, weniger Dacheffekt' });
    for (const f of [60, 90, 300, 400, 600, 800, 1000]) mhzSel.append(el('option', { value: String(f), text: f + ' MHz' }));
    mhzSel.value = String(this.opts.nmrMHz || 600);
    mhzSel.addEventListener('change', () => { this.opts.nmrMHz = +mhzSel.value; this.saveOpts(); if (cur && cur.kind === 'nmr') draw(); });
    mhzSel.addEventListener('keydown', e => e.stopPropagation());
    // Kern und Frequenz nur im Reiter NMR (1.56)
    const kernLab = el('label', { class: 'chem-nmrlab' }, el('span', { text: 'Kern:' }), nmrSel), mhzLab = el('label', { class: 'chem-nmrlab' }, el('span', { text: '¹H bei' }), mhzSel);
    nmrOnly.push(kernLab, mhzLab);
    sp.append(el('div', { class: 'chem-specnav' }, seg, kernLab, mhzLab), box);
    P.append(sp);
    show(['ir', 'ms', 'nmr'].includes(this.opts.specKind) ? this.opts.specKind : 'ir');
    // Austausch
    const ex = sec('Austausch (SMILES, Molfile)', 'Für andere Programme wie ChemDraw, MolView oder Avogadro.');
    let smi = '';
    try { smi = ChemProps.smiles(m); } catch (e) { smi = ''; }
    const sIn = el('input', { class: 'chem-smiles', value: smi, readonly: true, title: 'SMILES (Kekulé-Schreibweise, ohne Stereo-Angaben)' });
    ex.append(el('div', { class: 'chem-row' }, el('b', { text: 'SMILES' }), sIn,
      el('button', { class: 'chem-mini', text: 'Kopieren', onclick: () => navigator.clipboard?.writeText(smi).then(() => UI.toast('SMILES kopiert'), () => {}) })));
    ex.append(el('div', { class: 'chem-row' },
      el('button', { class: 'chem-mini', text: 'Molfile speichern (.mol)', onclick: () => this.download(new Blob([ChemProps.molfile(m, this.nameText())], { type: 'chemical/x-mdl-molfile' }), ((this.nameText() || 'Struktur').replace(/[\\/:*?"<>|]+/g, '_').slice(0, 60)) + '.mol') }),
      el('button', { class: 'chem-mini', text: 'Molfile kopieren', onclick: () => navigator.clipboard?.writeText(ChemProps.molfile(m, this.nameText())).then(() => UI.toast('Molfile kopiert'), () => {}) }),
      el('button', { class: 'chem-mini', text: 'Kennzahlen als Text einfügen', onclick: () => this.insertText(`${an.hill.html}: M = ${chemM(an.mass)} g/mol · DBE ${chemNum(pr.dbe, 1)} · H-Donoren ${pr.hbd} · H-Akzeptoren ${pr.hba} · TPSA ${chemNum(pr.tpsa, 1)} Å² · logP ≈ ${chemNum(pr.logp, 1)} · Gruppen: ${chemEsc(groups.map(g => g.label).join(', ') || '–')}`) })));
    this.buildImport(P);
  },
  /* SMILES oder Molfile einfügen → ersetzt die Zeichnung (Strg+Z holt sie zurück) */
  buildImport(P) {
    const ex = el('section', { class: 'chem-asec' }, el('h3', { text: 'Laden: SMILES oder Molfile' }));
    const ta = el('textarea', { class: 'chem-import', rows: '3', spellcheck: 'false', placeholder: 'SMILES (z. B. CC(=O)Oc1ccccc1C(=O)O) oder den Inhalt einer .mol-Datei einfügen' });
    ta.addEventListener('keydown', e => e.stopPropagation());
    const file = el('input', { type: 'file', accept: '.mol,.sdf,.smi,.txt', hidden: true });
    file.addEventListener('change', async () => { const f = file.files[0]; if (f) { ta.value = await f.text(); } });
    const load = () => {
      const t = ta.value.trim();
      if (!t) return;
      try {
        const nm = /V2000/.test(t) ? ChemProps.parseMolfile(t) : ChemSmiles.toMol(t.split(/\s+/)[0]);
        this.change(() => { this.E.mol = nm; this.E.sel.clear(); });
        this.setTab('struktur');
        this.fit(); this.applyView(); this.renderOverlay();
        UI.toast('Struktur geladen (Strg+Z = zurück)');
      } catch (e) { UI.toast('Nicht lesbar: ' + e.message, 4000); }
    };
    ex.append(ta, el('div', { class: 'chem-row' }, el('button', { class: 'btn primary chem-loadbtn', text: 'Laden', onclick: load }), el('button', { class: 'btn', text: 'Datei wählen …', onclick: () => file.click() }), file));
    P.append(ex);
  },

  /* ---------------------------------------------------------- Periodensystem */
  pseGrid(onPick, opts = {}) {
    const g = el('div', { class: 'pse-grid' + (opts.small ? ' small' : '') });
    for (const e of CHEM_ELEMENTS) {
      const [per, grp] = chemPos(e.z);
      const row = per <= 7 ? per : per + 1;
      const b = el('button', {
        class: 'pse-el cat-' + CHEM_CAT[e.sym] + (opts.sel === e.sym ? ' on' : ''), dataset: { sym: e.sym },
        style: { gridRow: String(row), gridColumn: String(grp) }, title: `${e.name} · Z = ${e.z} · ${e.radio ? '[' + e.mass + ']' : chemM(e.mass)} g/mol`,
      });
      b.innerHTML = opts.small ? `<b>${e.sym}</b>` : `<small>${e.z}</small><b>${e.sym}</b><span>${e.radio ? '[' + e.mass + ']' : chemM(e.mass)}</span>`;
      b.addEventListener('mousedown', ev => ev.preventDefault());
      b.addEventListener('click', () => onPick(e.sym, b));
      g.append(b);
    }
    g.append(el('div', { class: 'pse-ph', style: { gridRow: '6', gridColumn: '3' }, text: '57–71' }), el('div', { class: 'pse-ph', style: { gridRow: '7', gridColumn: '3' }, text: '89–103' }));
    return g;
  },
  psePopup(anchor) {
    const E = this.E;
    if (E.psePop) { E.psePop.remove(); E.psePop = null; return; }
    const pop = el('div', { class: 'chem-psepop' });
    pop.append(el('div', { class: 'chem-sh', text: 'Element wählen' }), this.pseGrid((sym) => {
      E.elem = sym; this.setTool('el');
      pop.remove(); E.psePop = null;
    }, { small: true, sel: E.elem }));
    E.dlg.append(pop);
    E.psePop = pop;
    const r = anchor.getBoundingClientRect(), dr = E.dlg.getBoundingClientRect();
    pop.style.left = (r.right - dr.left + 6) + 'px';
    pop.style.top = Math.max(8, Math.min(r.top - dr.top - 120, dr.height - 330)) + 'px';
    const off = (ev) => { if (!pop.contains(ev.target) && ev.target !== anchor && !anchor.contains(ev.target)) { pop.remove(); if (E.psePop === pop) E.psePop = null; document.removeEventListener('mousedown', off, true); } };
    setTimeout(() => document.addEventListener('mousedown', off, true), 0);
  },
  buildPseTab(pane) {
    const E = this.E;
    const info = el('div', { class: 'pse-info' });
    const show = (sym) => {
      E.pseSel = sym;
      const e = CHEM_BY_SYM[sym];
      const [per, grp] = chemPos(e.z);
      for (const b of pane.querySelectorAll('.pse-el')) b.classList.toggle('on', b.dataset.sym === sym);
      info.innerHTML = '';
      info.append(
        el('div', { class: 'pse-card cat-' + CHEM_CAT[sym] }, el('small', { text: String(e.z) }), el('b', { text: sym }), el('span', { text: e.radio ? '[' + e.mass + ']' : chemM(e.mass) })),
        el('div', { class: 'pse-txt' },
          el('h3', { text: e.name }),
          el('div', { text: `Ordnungszahl ${e.z} · ${CHEM_CAT_NAMES[CHEM_CAT[sym]]}` }),
          el('div', { text: `Atommasse ${e.radio ? '[' + e.mass + '] (radioaktiv)' : chemM(e.mass) + ' u'}` }),
          el('div', { text: per <= 7 ? `Periode ${per} · Gruppe ${grp}` : `Periode ${per - 3} · ${per === 9 ? 'Lanthanoide' : 'Actinoide'}` }),
          CHEM_EN[sym] != null ? el('div', { text: `Elektronegativität ${CHEM_EN[sym].toFixed(2)} (Pauling)` }) : null),
        el('div', { class: 'pse-acts' },
          el('button', { class: 'btn', text: 'Als Atom zeichnen', onclick: () => { E.elem = sym; this.setTool('el'); this.setTab('struktur'); } }),
          el('button', { class: 'btn', text: 'In Summenformel', onclick: () => { this.setTab('formel'); this.fAppend(sym); } }),
          el('button', { class: 'btn', text: 'Symbol einfügen', title: 'Das Elementsymbol als Text in die Seite schreiben', onclick: () => this.insertText(chemEsc(sym)) })));
    };
    const legend = el('div', { class: 'pse-legend' });
    for (const [k, n] of Object.entries(CHEM_CAT_NAMES)) legend.append(el('span', { class: 'cat-' + k, text: n }));
    pane.append(this.pseGrid((sym) => show(sym), {}), el('div', { class: 'pse-bottom' }, info, legend));
    show(E.pseSel);
  },

  /* ---------------------------------------------------------- Vorlagen & Trivialnamen */
  buildTplTab() {
    const E = this.E, pane = E.ttab;
    if (E.tplBuilt) return;
    E.tplBuilt = true;
    const inp = el('input', { type: 'text', class: 'chem-tsearch', placeholder: 'Suchen: Trivialname, IUPAC-Name, Stichwort (z.B. Zucker, Vitamin, Nylon) …', spellcheck: 'false' });
    E.tplInp = inp;
    const count = el('span', { class: 'chem-tcount' });
    const chips = el('div', { class: 'chem-tchips' });
    const grid = el('div', { class: 'chem-tgrid' });
    pane.append(el('div', { class: 'chem-trow' }, inp, count), chips, grid);
    const io = new IntersectionObserver((ents) => {
      for (const en of ents) {
        if (!en.isIntersecting) continue;
        io.unobserve(en.target);
        this.tplThumb(en.target);
      }
    }, { root: grid, rootMargin: '200px' });
    const fill = () => {
      grid.innerHTML = '';
      const list = ChemDB.search(E.tplQ, E.tplCat);
      count.textContent = list.length + ' Vorlagen';
      for (const e of list) {
        const card = el('button', { class: 'chem-tcard', title: (e.alias ? e.alias + ' · ' : '') + 'Klick: in die Zeichnung einfügen' });
        card._e = e;
        card.append(el('div', { class: 'chem-tthumb' }), el('b', { text: (e.pre && /^[DL]-$/.test(e.pre) ? e.pre : '') + e.name }), el('small', { class: 'chem-tsub', text: e.alias || e.iupac || '' }), el('small', { class: 'chem-tform' }));
        card.addEventListener('click', () => this.insertTemplate(e));
        grid.append(card);
        io.observe(card);
      }
      if (!list.length) grid.append(el('div', { class: 'chem-muted', text: 'Nichts gefunden.' }));
    };
    const chip = (label, cat) => {
      const b = el('button', { class: 'chem-chip' + (E.tplCat === cat ? ' on' : ''), text: label });
      b.addEventListener('click', () => { E.tplCat = cat; for (const c of chips.children) c.classList.toggle('on', c === b); fill(); });
      chips.append(b);
    };
    chip('Alle', '');
    for (const c of CHEM_DB_CATS) chip(c, c);
    inp.addEventListener('input', () => { E.tplQ = inp.value; fill(); });
    inp.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') { const first = grid.querySelector('.chem-tcard'); if (first) first.click(); } });
    fill();
  },
  tplThumb(card) {
    const e = card._e;
    const m = ChemDB.mol(e);
    const an = ChemMol.analyze(m);
    const { svg, w, h } = ChemRender.toSVG(m, { ...this.opts, model: 'skelett', stars: false, rs: false, ez: false, caption: false, nameCap: false }, an);
    const sc = Math.min(1, 150 / w, 104 / h);
    const img = el('img', { alt: '', draggable: 'false', src: 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg) });
    img.style.width = Math.round(w * sc) + 'px';
    img.style.height = Math.round(h * sc) + 'px';
    card.querySelector('.chem-tthumb').append(img);
    card.querySelector('.chem-tform').innerHTML = an.hill.html + ' · ' + chemM(an.mass) + ' g/mol';
  },
  insertTemplate(e) {
    const E = this.E;
    const t = ChemDB.mol(e);
    if (!t.atoms.length) return;
    let tx0 = Infinity, tx1 = -Infinity, ty0 = Infinity, ty1 = -Infinity;
    for (const a of t.atoms) { tx0 = Math.min(tx0, a.x); tx1 = Math.max(tx1, a.x); ty0 = Math.min(ty0, a.y); ty1 = Math.max(ty1, a.y); }
    let cx = 0, cy = 0;
    if (E.mol.atoms.length) {
      let x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
      for (const a of E.mol.atoms) { x1 = Math.max(x1, a.x); y0 = Math.min(y0, a.y); y1 = Math.max(y1, a.y); }
      cx = x1 + 2.5 * BL + (tx1 - tx0) / 2; cy = (y0 + y1) / 2;
    }
    let dx = cx - (tx0 + tx1) / 2, dy = cy - (ty0 + ty1) / 2;
    const g = ChemLayout.snapPt(t.atoms[0].x + dx, t.atoms[0].y + dy);
    dx = g[0] - t.atoms[0].x; dy = g[1] - t.atoms[0].y;
    const ids = [];
    this.change(() => {
      const map = new Map();
      for (const a of t.atoms) { const id = E.mol.nid++; map.set(a.id, id); E.mol.atoms.push({ ...a, id, x: a.x + dx, y: a.y + dy }); ids.push('a:' + id); }
      for (const b of t.bonds) { const id = E.mol.nid++; E.mol.bonds.push({ ...b, id, a: map.get(b.a), b: map.get(b.b) }); ids.push('b:' + id); }
    });
    E.tool = 'select';
    E.sel = new Set(ids);
    this.markTool();
    this.setTab('struktur');
    setTimeout(() => { if (!this.E) return; this.fit(); this.render(); }, 40);
    UI.toast(`„${(e.pre && /^[DL]-$/.test(e.pre) ? e.pre : '') + e.name}“ eingefügt – ziehen zum Verschieben, Entf zum Löschen`, 3200);
  },

  /* ---------------------------------------------------------- Summenformel-Register */
  buildFormulaTab(pane) {
    const E = this.E;
    const inp = el('input', { type: 'text', class: 'chem-finp', spellcheck: 'false', autocomplete: 'off', placeholder: 'Summenformel, z. B. C6H12O6 oder Ca(OH)2 – oder Reaktionsgleichung' });
    E.fInp = inp;
    const prev = el('div', { class: 'chem-fprev' });
    const res = el('div', { class: 'chem-fres' });
    const mass = el('input', { type: 'checkbox' });
    mass.checked = true;
    E.fMass = mass;
    const upd = () => {
      const v = inp.value;
      res.innerHTML = '';
      prev.classList.remove('err');
      E.fHtml = null;
      if (!v.trim()) { prev.innerHTML = '<span class="chem-muted">Vorschau</span>'; return; }
      try {
        const r = ChemFormula.parse(v);
        prev.innerHTML = r.html;
        const M = ChemFormula.mass(r.counts), X = ChemFormula.exact(r.counts), h = ChemFormula.hill(r.counts, r.charge);
        E.fHtml = r.html;
        E.fMassTxt = chemM(M);
        const kv = (k, val) => res.append(el('div', { class: 'chem-kv' }, el('span', { text: k }), el('b', { html: val })));
        kv('Molare Masse', chemM(M) + ' g/mol' + (ChemFormula.radioactive(r.counts) ? ' *' : ''));
        if (X != null) kv('Exakte Masse', chemNum(X, 4));
        kv('Hill-Schreibweise', h.html);
        kv('Atome gesamt', String(Object.values(r.counts).reduce((s, n) => s + n, 0)));
        const tb = el('div', { class: 'chem-comp' });
        for (const c of ChemFormula.composition(r.counts)) tb.append(el('span', { text: c.sym }), el('i', { style: { width: Math.max(2, c.pct * 1.4) + 'px' } }), el('b', { text: `${c.n} × ${chemM(CHEM_BY_SYM[c.sym].mass)} = ${chemNum(c.pct, 2)} %` }));
        res.append(el('div', { class: 'chem-sub', text: 'Massenanteile' }), tb);
      } catch (e) {
        const eq = ChemFormula.formatText(v);
        if (eq && /\s/.test(v.trim())) {
          prev.innerHTML = eq;
          E.fHtml = eq;
          E.fMassTxt = null;
          res.append(el('div', { class: 'chem-muted', text: 'Reaktionsgleichung – wird formatiert eingefügt (Pfeile: -> <=> )' }));
        } else {
          prev.classList.add('err');
          prev.textContent = e.message;
        }
      }
    };
    E.fUpd = upd;
    inp.addEventListener('input', upd);
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); this.ok(); } });
    const kb = el('div', { class: 'chem-fkeys' });
    for (const t of ['(', ')', '[', ']', '·', '^', '+', '-', '2', '3', '4', '5', '6', '→']) {
      kb.append(el('button', { class: 'btn', text: t, onmousedown: e => e.preventDefault(), onclick: () => this.fAppend(t === '→' ? ' -> ' : t) }));
    }
    kb.append(el('button', { class: 'btn', text: '⌫', title: 'Zeichen löschen', onmousedown: e => e.preventDefault(), onclick: () => { inp.value = inp.value.slice(0, -1); upd(); } }));
    pane.append(el('div', { class: 'chem-frow' }, inp), el('div', { class: 'chem-fgrid' }, el('div', {}, prev, res, el('label', { class: 'chem-chk' }, mass, 'Molare Masse mit einfügen')),
      el('div', {}, el('div', { class: 'chem-sub', text: 'Periodensystem (Klick fügt das Symbol ein)' }), this.pseGrid((sym) => this.fAppend(sym), { small: true }), kb)));
    upd();
  },
  fAppend(t) {
    const E = this.E, inp = E.fInp;
    const s = inp.selectionStart != null ? inp.selectionStart : inp.value.length, e = inp.selectionEnd != null ? inp.selectionEnd : s;
    inp.value = inp.value.slice(0, s) + t + inp.value.slice(e);
    inp.focus();
    inp.setSelectionRange(s + t.length, s + t.length);
    E.fUpd();
  },

  /* ---------------------------------------------------------- Abschluss */
  dirty() { const E = this.E; return E && JSON.stringify(E.mol) !== E.start; },
  async tryClose() {
    const E = this.E;
    if (!E) return;
    if (E.tab === 'struktur' && this.dirty() && E.mol.atoms.length) {
      const ok = await UI.confirm('Zeichnung verwerfen?', 'Die Struktur wurde noch nicht in die Seite übernommen.', { ok: 'Verwerfen', danger: true });
      if (!ok) { if (this.E) E.dlg.focus({ preventScroll: true }); return; }
    }
    this.close();
  },
  close() {
    const E = this.E;
    if (!E) return;
    window.removeEventListener('resize', E.onResize);
    this.undock();
    cancelAnimationFrame(E.spinRaf);   // 3D-Drehen (1.52) beenden
    if (E.spin) { E.spin = false; this.saveOpts(); }
    E.back.remove();
    this.E = null;
  },
  async ok() {
    const E = this.E;
    if (!E) return;
    if (E.tab === 'formel') {
      if (!E.fHtml) { UI.toast('Bitte zuerst eine gültige Formel eingeben'); return; }
      this.insertText(E.fHtml + (E.fMass.checked && E.fMassTxt ? ` (M = ${E.fMassTxt} g/mol)` : ''));
      return;
    }
    if (E.tab !== 'struktur' && E.tab !== 'analyse') return;
    this.closeLabel(true);
    if (!this.E || !E.labelInp.hidden) return;
    if (!E.mol.atoms.length) { UI.toast('Noch keine Struktur gezeichnet'); return; }
    const mol = E.mol, target = E.target, editBox = E.editBox, range = E.range;
    const opts = { ...this.opts };
    const nameText = this.nameText();
    const nameEdit = E.nameEdit;
    this.close();
    await this.toPage(mol, opts, target, editBox, range, nameText, nameEdit);
  },
  /* Struktur als SVG-Bild in die Seite (neu oder ersetzen) */
  async toPage(mol, opts, target, editBox, range, nameText, nameEdit) {
    if (!Canvas.page) { UI.toast('Bitte zuerst eine Seite öffnen'); return; }
    const an = ChemMol.analyze(mol);
    const { svg, w, h } = ChemRender.toSVG(mol, { ...opts, nameText }, an);
    const blob = new Blob([svg], { type: 'image/svg+xml' });
    const chem = { v: 1, mol: this.pack(mol), opts, nw: w, nh: h, f: an.hill.text, m: Math.round(an.mass * 1000) / 1000, n: nameText || '' };
    if (nameEdit != null) chem.name = nameEdit;
    if (target) {
      const b = Canvas.box(target.boxId);
      const im = b && b.images.find(i => i.id === target.imgId);
      if (!im) { UI.toast('Das Bild gibt es nicht mehr – die Struktur wird neu eingefügt'); return this.toPage(mol, opts, null, null, null, nameText, nameEdit); }
      let name;
      try { name = await Backend.saveImage(blob); } catch (e) { UI.toast('Bild konnte nicht gespeichert werden: ' + e.message); return; }
      Hist.flushPending();
      const k = im.chem && im.chem.nw ? im.w / im.chem.nw : 1;
      const wasPicture = Canvas.isPictureBox(b);
      im.src = name; im.chem = chem;
      im.w = Math.max(16, Math.round(w * k)); im.h = Math.max(12, Math.round(h * k));
      if (wasPicture) b.w = im.w + 2 * (PADX + BORDER);
      Canvas.render();
      Hist.touchPage(Canvas.pageId);
      Hist.commit('Struktur geändert');
      return;
    }
    if (editBox && range && Canvas.box(editBox)) { Canvas.lastRange = range; Canvas.lastRangeBox = editBox; }
    await Canvas.insertImage(editBox && Canvas.box(editBox) ? editBox : null, blob, editBox ? null : Canvas.viewCenter(), { chem }, { tight: true, label: 'Struktur eingefügt' });
  },
  insertText(html) {
    const E = this.E;
    const editBox = E && E.editBox, range = E && E.range;
    if (E) this.close();
    if (editBox && Canvas.box(editBox) && Canvas.textEl(editBox)) {
      if (Canvas.editing !== editBox) Canvas.focusText(editBox, true);
      if (range && Canvas.textEl(editBox).contains(range.startContainer)) { Canvas.lastRange = range; Canvas.lastRangeBox = editBox; }
      Fmt.apply(() => Fmt.exec('insertHTML', html + '​'), 'Summenformel eingefügt');
      return;
    }
    if (!Canvas.page) { UI.toast('Bitte zuerst eine Seite öffnen'); return; }
    const c = Canvas.viewCenter();
    const b = Canvas.createBoxAt({ x: c.x - 100, y: c.y - 20 }, { html: `<div>${html}</div>`, noFocus: true, label: 'Summenformel eingefügt', w: 260 });
    if (b) Canvas.select([b.id]);
  },

  /* Menüband „Summenformel“: Markierung formatieren oder Rechner öffnen */
  formatSelection() {
    if (Canvas.editing) {
      const t = Canvas.textEl(Canvas.editing), sel = getSelection();
      if (t && sel.rangeCount && !sel.isCollapsed && t.contains(sel.anchorNode)) {
        const txt = sel.toString();
        const html = ChemFormula.formatText(txt);
        if (html) { Fmt.apply(() => Fmt.exec('insertHTML', html), 'Als Summenformel formatiert'); return; }
        this.open(null, 'formel');
        if (this.E) { this.E.fInp.value = txt.trim(); this.E.fUpd(); }
        return;
      }
    }
    this.open(null, 'formel');
  },
  /* Bild auf der Seite bearbeiten */
  /* Register Zeichnen → Reaktion (1.54): ausgewählte Struktur bearbeiten (oder neu) und das Werkzeug wählen */
  openTool(k) {
    if (this.E) { if (k === 'step') this.addStep(); else this.setTool(k); return; }
    let target = null;
    if (Canvas.sel && Canvas.sel.size === 1) {
      const b = Canvas.box([...Canvas.sel][0]);
      const im = b && (b.images || []).find(i => i.chem);
      if (im && !Canvas.isLocked(b)) target = { boxId: b.id, imgId: im.id };
    }
    this.open(target);
    if (!this.E) return;
    if (k === 'step') { setTimeout(() => this.E && this.addStep(), 60); return; }
    this.setTool(k);
  },
  editImage(boxId, imgId) {
    const b = Canvas.box(boxId);
    if (!b || Canvas.isLocked(b)) return;
    this.open({ boxId, imgId });
  },
};
