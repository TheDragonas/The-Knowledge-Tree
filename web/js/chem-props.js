'use strict';
/* Chem-Draw: Analyse (seit 1.52) – angelehnt an MolView, ChemDraw („Analysis“, „Chemical Properties“, „Predict NMR“)
 * und die Art, wie das NIST WebBook Spektren zeigt. Alles wird LOKAL aus der gezeichneten Struktur berechnet
 * (keine Daten aus fremden Datenbanken – Sicherheitsdaten nur als Link zur GESTIS-Stoffdatenbank, siehe chem.js):
 *  - Austausch: SMILES (Kekulé-Schreibweise) schreiben, Molfile (MDL V2000) schreiben und lesen
 *  - Kennzahlen: Doppelbindungsäquivalente, H-Brücken-Donoren/-Akzeptoren, drehbare Bindungen, polare Oberfläche
 *    (TPSA nach Ertl, Atombeiträge), logP-Schätzung (eigenes Atombeitrags-Modell), Lipinski-Regel (Rule of Five)
 *  - funktionelle Gruppen (Alkohol prim./sek./tert., Phenol, Ether, Aldehyd, Keton, Säure, Ester, Amid, Amin, Nitril …)
 *  - Spektren (Schätzungen für den Unterricht): IR-Banden nach Gruppen, Massenspektrum (Isotopenmuster des
 *    Molekül-Ions exakt aus den natürlichen Isotopenhäufigkeiten + typische Bruchstücke), ¹H-NMR (chemisch
 *    gleichwertige H, Verschiebung nach Inkrementen, Aufspaltung nach der n+1-Regel, Integral), ¹³C-NMR
 *  - 3D-Messen: Abstand (Å), Winkel, Diederwinkel
 *  - seit 1.53: NMR auch für ¹⁹F, ³¹P, ¹⁵N; Spektren mit Ausschnitt (Zoom) und als eigenständiges Bild
 * Ohne DOM – geprüft mit tests/chem/analyse-test.js. */
const carbonylAt = (A, k) => A[k].el === 'C' && A[k].nb.some(([x, o]) => o === 2 && A[x].el === 'O');
const ChemProps = {
  /* ---------------------------------------------------------- Graph (schwere Atome, H als Anzahl) */
  graph(m) {
    const G = ChemMol.expand(m);
    const keep = [], map = new Map();
    for (let i = 0; i < G.n; i++) if (!G.plainH[i]) { map.set(i, keep.length); keep.push(i); }
    const A = keep.map(i => ({ el: G.el[i], q: G.q[i] || 0, h: G.h[i], nb: [], arom: false, ring: false, src: G.src[i] }));
    for (const i of keep) {
      const a = A[map.get(i)];
      for (const [j, o] of G.adj[i]) { if (G.plainH[j]) { a.h++; continue; } a.nb.push([map.get(j), o]); }
    }
    // Ringe (SSSR) und Aromaten: Sechsring aus C/N mit je einer Doppelbindung zu einem Ringatom; Fünfring mit zwei
    // Doppelbindungen und einem O, S oder N(H) (Furan, Thiophen, Pyrrol)
    const adj = A.map(a => a.nb.map(([j]) => j));
    let rings = [];
    try { rings = A.length ? ChemRings.sssr(A.length, adj) : []; } catch (e) { rings = []; }
    const inRing = new Set(rings.flat());
    A.forEach((a, i) => { a.ring = inRing.has(i); });
    const bo = (i, j) => { const x = A[i].nb.find(([k]) => k === j); return x ? x[1] : 0; };
    const aromRings = [];
    for (const r of rings) {
      const dbl = r.filter((v, k) => bo(v, r[(k + 1) % r.length]) === 2).length;
      if (r.length === 6 && r.every(v => /^[CN]$/.test(A[v].el) && A[v].nb.some(([j, o]) => o === 2 && inRing.has(j)))) aromRings.push(r);
      else if (r.length === 5 && dbl === 2 && r.filter(v => /^[OSN]$/.test(A[v].el) && !A[v].nb.some(([j, o]) => o === 2 && r.includes(j))).length === 1) aromRings.push(r);
    }
    for (const r of aromRings) for (const v of r) A[v].arom = true;
    return { A, rings, aromRings, G };
  },

  /* ---------------------------------------------------------- SMILES (Kekulé, ohne Stereo) */
  ORG: { B: [3], C: [4], N: [3, 5], O: [2], P: [3, 5], S: [2, 4, 6], F: [1], Cl: [1], Br: [1], I: [1] },
  smiles(m) {
    const { A } = this.graph(m);
    if (!A.length) return '';
    const n = A.length, seen = new Array(n).fill(false), parts = [];
    const bsym = (o) => o === 2 ? '=' : o === 3 ? '#' : o === 4 ? '$' : '';
    const atomTxt = (a) => {
      const bs = a.nb.reduce((s, [, o]) => s + o, 0);
      const std = this.ORG[a.el];
      const impl = std && !a.q ? (std.find(v => v >= bs) ?? bs) - bs : -1;
      if (std && !a.q && impl === a.h) return a.el;
      const hh = a.h ? 'H' + (a.h > 1 ? a.h : '') : '';
      const qq = a.q ? (a.q > 0 ? '+' : '-') + (Math.abs(a.q) > 1 ? Math.abs(a.q) : '') : '';
      return `[${a.el}${hh}${qq}]`;
    };
    for (let s0 = 0; s0 < n; s0++) {
      if (seen[s0]) continue;
      // Start: Atom mit wenigen Nachbarn (Kettenende) – so wird die SMILES kurz und lesbar
      let s = s0;
      const comp = [], st = [s0], vis = new Set([s0]);
      while (st.length) { const v = st.pop(); comp.push(v); for (const [w] of A[v].nb) if (!vis.has(w)) { vis.add(w); st.push(w); } }
      s = comp.reduce((b, v) => (A[v].nb.length < A[b].nb.length || (A[v].nb.length === A[b].nb.length && v < b)) ? v : b, s0);
      // 1. Tiefensuche: Baumkanten und Ringschlüsse
      const parent = new Map([[s, -1]]), order = [], closures = [];
      const visit = (v) => {
        seen[v] = true; order.push(v);
        for (const [w, o] of A[v].nb) {
          if (w === parent.get(v)) continue;
          if (!seen[w]) { parent.set(w, v); visit(w); }
          else if (!closures.some(c => (c[0] === w && c[1] === v))) closures.push([v, w, o]);
        }
      };
      visit(s);
      // Ringschluss-Ziffern: am früheren Atom öffnen, am späteren schliessen
      const pos = new Map(order.map((v, k) => [v, k]));
      const ringAt = new Map();
      const free = [];
      let next = 1;
      const opens = closures.map(([a, b, o]) => pos.get(a) < pos.get(b) ? [a, b, o] : [b, a, o]);
      const events = new Map();
      for (const c of opens) { if (!events.has(c[0])) events.set(c[0], []); events.get(c[0]).push({ open: c }); if (!events.has(c[1])) events.set(c[1], []); events.get(c[1]).push({ close: c }); }
      const out = [];
      const write = (v) => {
        let t = atomTxt(A[v]);
        for (const e of events.get(v) || []) {
          if (e.close) { const d = ringAt.get(e.close); t += (d > 9 ? '%' : '') + d; free.push(d); free.sort((x, y) => x - y); }
        }
        for (const e of events.get(v) || []) {
          if (e.open) { const d = free.length ? free.shift() : next++; ringAt.set(e.open, d); t += bsym(e.open[2]) + (d > 9 ? '%' : '') + d; }
        }
        out.push(t);
        const kids = A[v].nb.filter(([w]) => parent.get(w) === v && w !== parent.get(v));
        kids.forEach(([w, o], k) => {
          if (k < kids.length - 1) { out.push('(' + bsym(o)); write(w); out.push(')'); }
          else { out.push(bsym(o)); write(w); }
        });
      };
      write(s);
      parts.push(out.join(''));
    }
    return parts.join('.');
  },

  /* ---------------------------------------------------------- Molfile (MDL V2000) */
  molfile(m, title = '') {
    let mol = m;
    if (m.atoms.some(a => a.ab)) { try { mol = ChemSmiles.toMol(this.smiles(m)); } catch (e) { mol = m; } }   // Kurzschreibweisen ausschreiben
    const atoms = mol.atoms, bonds = mol.bonds, K = 1.5 / BL;
    const idx = new Map(atoms.map((a, i) => [a.id, i + 1]));
    const f = (v, w) => v.toFixed(4).padStart(w);
    const p3 = (v) => String(v).padStart(3);
    const L = [String(title || '').slice(0, 80), '  KnowledgeTree 2D', '', `${p3(atoms.length)}${p3(bonds.length)}  0  0  0  0  0  0  0  0999 V2000`];
    const cx = atoms.reduce((s, a) => s + a.x, 0) / (atoms.length || 1), cy = atoms.reduce((s, a) => s + a.y, 0) / (atoms.length || 1);
    for (const a of atoms) L.push(`${f((a.x - cx) * K, 10)}${f(-(a.y - cy) * K, 10)}${f(0, 10)} ${(a.el + '   ').slice(0, 3)} 0  0  0  0  0  0  0  0  0  0  0  0`);
    for (const b of bonds) L.push(`${p3(idx.get(b.a))}${p3(idx.get(b.b))}${p3(b.o)}${p3(b.s === 'w' ? 1 : b.s === 'h' ? 6 : b.s === 'y' ? 4 : 0)}`);
    const ch = atoms.map((a, i) => [i + 1, a.q || 0]).filter(([, q]) => q);
    for (let k = 0; k < ch.length; k += 8) { const part = ch.slice(k, k + 8); L.push(`M  CHG${p3(part.length)}${part.map(([i, q]) => ' ' + p3(i) + ' ' + p3(q)).join('')}`); }
    L.push('M  END');
    return L.join('\n') + '\n';
  },
  parseMolfile(text) {
    const L = String(text || '').replace(/\r/g, '').split('\n');
    const ci = L.findIndex(l => /V2000\s*$/.test(l));
    if (ci < 0) throw new Error('Kein Molfile (V2000) erkannt');
    const na = parseInt(L[ci].slice(0, 3), 10), nb = parseInt(L[ci].slice(3, 6), 10);
    if (!(na >= 0) || !(nb >= 0)) throw new Error('Kopfzeile des Molfiles unlesbar');
    const K = BL / 1.5, m = ChemMol.empty();
    for (let k = 0; k < na; k++) {
      const l = L[ci + 1 + k] || '';
      const x = parseFloat(l.slice(0, 10)), y = parseFloat(l.slice(10, 20)), el = l.slice(31, 34).trim();
      if (!CHEM_BY_SYM[el]) throw new Error(`Unbekanntes Element «${el}» in Zeile ${ci + 2 + k}`);
      const cc = parseInt(l.slice(36, 39), 10) || 0;   // alte Ladungsangabe: 1 = +3 … 7 = −3
      m.atoms.push({ id: k + 1, el, x: x * K, y: -y * K, q: cc ? 4 - cc : 0 });
    }
    for (let k = 0; k < nb; k++) {
      const l = L[ci + 1 + na + k] || '';
      const a = parseInt(l.slice(0, 3), 10), b = parseInt(l.slice(3, 6), 10), o = parseInt(l.slice(6, 9), 10), s = parseInt(l.slice(9, 12), 10) || 0;
      if (!m.atoms[a - 1] || !m.atoms[b - 1]) throw new Error('Bindung zu einem fehlenden Atom');
      m.bonds.push({ id: 1000 + k, a, b, o: o >= 1 && o <= 3 ? o : 1, s: s === 1 ? 'w' : s === 6 ? 'h' : s === 4 ? 'y' : '' });
    }
    for (const l of L.slice(ci + 1 + na + nb)) {
      if (/^M {2}CHG/.test(l)) { const n = parseInt(l.slice(6, 9), 10); for (let k = 0; k < n; k++) { const i = parseInt(l.slice(10 + 8 * k, 13 + 8 * k), 10), q = parseInt(l.slice(14 + 8 * k, 17 + 8 * k), 10); if (m.atoms[i - 1]) m.atoms[i - 1].q = q; } }
      if (/^M {2}END/.test(l)) break;
    }
    // explizite H-Atome an C wieder weglassen (Gerüstformel), Koordinaten auf Bindungslänge BL bringen
    const ds = m.bonds.map(b => Math.hypot(m.atoms[b.a - 1].x - m.atoms[b.b - 1].x, m.atoms[b.a - 1].y - m.atoms[b.b - 1].y)).filter(d => d > 0).sort((x, y) => x - y);
    const med = ds[Math.floor(ds.length / 2)];
    if (med) for (const a of m.atoms) { a.x *= BL / med; a.y *= BL / med; }
    m.nid = 1000 + nb + 1;
    return m;
  },

  /* ---------------------------------------------------------- funktionelle Gruppen */
  groups(m, Gr) {
    const { A, aromRings } = Gr || this.graph(m);
    const out = new Map();
    const add = (k, label) => { const g = out.get(k); if (g) g.n++; else out.set(k, { k, label, n: 1 }); };
    const nbs = (i) => A[i].nb;
    const dblO = (i) => nbs(i).some(([j, o]) => o === 2 && A[j].el === 'O');
    const carbonyl = (i) => A[i].el === 'C' && dblO(i);
    for (let i = 0; i < A.length; i++) {
      const a = A[i];
      if (a.el === 'C' && dblO(i)) {
        const others = nbs(i).filter(([j, o]) => !(o === 2 && A[j].el === 'O'));
        const ohs = others.filter(([j]) => A[j].el === 'O' && A[j].h > 0);
        const ors = others.filter(([j]) => A[j].el === 'O' && A[j].h === 0 && A[j].nb.length === 2);
        const oneg = others.filter(([j]) => A[j].el === 'O' && A[j].q < 0);
        const ns = others.filter(([j]) => A[j].el === 'N');
        const cl = others.filter(([j]) => A[j].el === 'Cl' || A[j].el === 'Br');
        if (ohs.length) add('acid', 'Carbonsäure (–COOH)');
        else if (oneg.length) add('carboxylate', 'Carboxylat (–COO⁻)');
        else if (ors.length) { const o = ors[0][0]; const other = A[o].nb.find(([j]) => j !== i)[0]; add(carbonyl(other) ? 'anhydride' : 'ester', carbonyl(other) ? 'Säureanhydrid' : 'Ester (–COO–)'); }
        else if (ns.length) add('amide', 'Amid (–CONH–)');
        else if (cl.length) add('acylhalide', 'Säurehalogenid');
        else if (a.h >= 1) add('aldehyde', 'Aldehyd (–CHO)');
        else add('ketone', 'Keton (C=O)');
      }
      if (a.el === 'O' && a.h >= 1 && a.nb.length === 1) {
        const [c] = a.nb[0];
        if (A[c].el === 'C' && !carbonyl(c)) {
          if (A[c].arom) add('phenol', 'Phenol (Ar–OH)');
          else if (A[c].nb.some(([j, o]) => o === 2 && A[j].el === 'C')) add('enol', 'Enol');
          else { const k = A[c].nb.filter(([j]) => A[j].el === 'C').length; add(['alc1', 'alc1', 'alc2', 'alc3'][Math.min(3, k)], ['primärer Alkohol', 'primärer Alkohol', 'sekundärer Alkohol', 'tertiärer Alkohol'][Math.min(3, k)]); }
        }
      }
      if (a.el === 'O' && a.h === 0 && a.nb.length === 2 && !a.arom && a.nb.every(([j, o]) => o === 1 && A[j].el === 'C' && !carbonyl(j))) add('ether', 'Ether (C–O–C)');
      if (a.el === 'N' && !a.arom) {
        if (a.nb.some(([j, o]) => o === 3)) add('nitrile', 'Nitril (–C≡N)');
        else if (a.q > 0 && a.nb.filter(([j]) => A[j].el === 'O').length === 2) add('nitro', 'Nitro (–NO₂)');
        else if (!a.nb.some(([j]) => carbonyl(j)) && a.nb.every(([, o]) => o === 1) && a.nb.length) {
          const cs = a.nb.filter(([j]) => A[j].el === 'C').length;
          const ar = a.nb.some(([j]) => A[j].arom);
          if (a.q > 0) add('ammonium', 'Ammonium-Ion');
          else add(ar ? 'aniline' : ['am1', 'am1', 'am2', 'am3'][Math.min(3, cs)], ar ? 'aromatisches Amin' : ['primäres Amin', 'primäres Amin', 'sekundäres Amin', 'tertiäres Amin'][Math.min(3, cs)]);
        } else if (a.nb.some(([j, o]) => o === 2 && A[j].el === 'C')) add('imine', 'Imin (C=N)');
      }
      if (a.el === 'N' && a.arom) add(a.h ? 'pyrrole' : 'pyridine', a.h ? 'Heteroaromat (Pyrrol-N)' : 'Heteroaromat (Pyridin-N)');
      if (/^(F|Cl|Br|I)$/.test(a.el) && a.nb.length === 1 && A[a.nb[0][0]].el === 'C' && !carbonyl(a.nb[0][0]) && !A[a.nb[0][0]].nb.some(([j]) => j < i && /^(F|Cl|Br|I)$/.test(A[j].el))) add(A[a.nb[0][0]].arom ? 'arhal' : 'alkhal', A[a.nb[0][0]].arom ? 'Halogenaromat' : 'Halogenalkan');
      if (a.el === 'S') {
        if (a.h) add('thiol', 'Thiol (–SH)');
        else if (a.nb.filter(([j, o]) => A[j].el === 'O' && o === 2).length === 2) add(a.nb.some(([j]) => A[j].el === 'O' && (A[j].h || A[j].q < 0)) ? 'sulfonic' : 'sulfone', a.nb.some(([j]) => A[j].el === 'O' && (A[j].h || A[j].q < 0)) ? 'Sulfonsäure' : 'Sulfon');
        else if (a.nb.length === 2 && !a.arom) add('thioether', 'Thioether (C–S–C)');
      }
      if (a.el === 'C' && !a.arom) for (const [j, o] of a.nb) if (j > i && A[j].el === 'C' && !A[j].arom) { if (o === 2) add('alkene', 'Alken (C=C)'); if (o === 3) add('alkyne', 'Alkin (C≡C)'); }
    }
    const benz = aromRings.filter(r => r.length === 6 && r.every(v => A[v].el === 'C')).length;
    if (benz) out.set('arene', { k: 'arene', label: 'Aromat (Benzolring)', n: benz });
    return [...out.values()];
  },

  /* ---------------------------------------------------------- Kennzahlen */
  props(m) {
    const Gr = this.graph(m), { A } = Gr;
    const an = ChemMol.analyze(m), c = an.counts;
    const n = (e) => c[e] || 0;
    const X = n('F') + n('Cl') + n('Br') + n('I');
    const dbe = 1 + n('C') + n('Si') + (n('N') + n('P') - n('H') - X) / 2;
    let hbd = 0, hba = 0, rot = 0, tpsa = 0;
    for (const a of A) {
      if (a.el === 'N' || a.el === 'O') { hba++; hbd += a.h; }
      tpsa += this.psa(a, A);
    }
    // drehbare Bindungen: Einfachbindung, nicht im Ring, beide Atome mit weiteren schweren Nachbarn, nicht an C≡,
    // keine Amidbindung C(=O)–N
    const amideCN = (i, j) => A[i].el === 'C' && A[j].el === 'N' && A[i].nb.some(([k, o]) => o === 2 && A[k].el === 'O');
    for (let i = 0; i < A.length; i++) for (const [j, o] of A[i].nb) {
      if (j <= i || o !== 1) continue;
      if (A[i].ring && A[j].ring && this.sameRing(Gr, i, j)) continue;
      if (A[i].nb.length < 2 || A[j].nb.length < 2) continue;
      if (A[i].nb.some(([, x]) => x === 3) || A[j].nb.some(([, x]) => x === 3)) continue;
      if (amideCN(i, j) || amideCN(j, i)) continue;
      rot++;
    }
    const logp = this.logp(m, Gr);
    const lip = [
      { t: 'Molare Masse ≤ 500 g/mol', ok: an.mass <= 500 },
      { t: 'logP ≤ 5 (Schätzung)', ok: logp <= 5 },
      { t: 'H-Brücken-Donoren ≤ 5', ok: hbd <= 5 },
      { t: 'H-Brücken-Akzeptoren ≤ 10', ok: hba <= 10 },
    ];
    return { dbe, hbd, hba, rot, tpsa: Math.round(tpsa * 100) / 100, logp: Math.round(logp * 100) / 100, lipinski: lip, lipOk: lip.filter(x => !x.ok).length <= 1, heavy: A.length, rings: Gr.rings.length, arom: Gr.aromRings.length, mass: an.mass, counts: c };
  },
  sameRing(Gr, i, j) { return Gr.rings.some(r => r.includes(i) && r.includes(j)); },
  /* polare Oberfläche (TPSA, Ertl 2000) – Beiträge der N- und O-Typen in Å² */
  psa(a, A) {
    if (a.el !== 'N' && a.el !== 'O') return 0;
    const sb = a.nb.filter(([, o]) => o === 1).length, db = a.nb.filter(([, o]) => o === 2).length, tb = a.nb.filter(([, o]) => o === 3).length;
    if (a.el === 'O') {
      if (a.arom) return 13.14;
      if (a.q < 0) return 23.06;
      if (db === 1) return 17.07;
      if (a.h === 1) return 20.23;
      if (a.h === 2) return 20.23 * 1.5;   // Wasser (nicht im Original, nur damit H₂O nicht 0 hat)
      return 9.23;
    }
    if (a.arom) return a.h ? 15.79 : sb + db === 3 ? 4.41 : 12.89;
    if (a.q > 0) {
      if (a.nb.filter(([j]) => A[j].el === 'O').length === 2) return 11.68;   // Nitro
      return [0, 4.36, 16.61, 27.64][Math.min(3, a.h)] || 0;
    }
    if (tb) return 23.79;
    if (db) return a.h ? 23.85 : 12.36;
    return [3.24, 12.03, 26.02, 26.02][Math.min(3, a.h)];
  },
  /* logP (Octanol/Wasser) – grobe Schätzung mit einem eigenen Atombeitrags-Modell: Atomtypen gezählt, Beiträge an
   * bekannten Messwerten einfacher Stoffe angepasst (tests/chem/logp-anpassen.js). Typische Abweichung ±0,5. */
  logpTypes(Gr) {
    const { A } = Gr;
    const t = {};
    const inc = (k, v = 1) => { t[k] = (t[k] || 0) + v; };
    const carbonyl = (i) => A[i].el === 'C' && A[i].nb.some(([j, o]) => o === 2 && A[j].el === 'O');
    A.forEach((a, i) => {
      const het = a.nb.filter(([j]) => A[j].el !== 'C').length;
      if (a.el === 'C') {
        if (a.arom) inc(het ? 'cArX' : 'cAr');
        else if (carbonyl(i)) inc('cCO');
        else if (a.nb.some(([, o]) => o >= 2)) inc(het ? 'cSp2X' : 'cSp2');
        else inc(het ? 'cX' : 'c');
        inc(a.arom || a.nb.some(([, o]) => o >= 2) ? 'hC2' : 'hC', a.h);
      } else if (a.el === 'O') {
        if (a.h) inc(a.nb.some(([j]) => A[j].arom) ? 'oHar' : a.nb.some(([j]) => carbonyl(j)) ? 'oHacid' : 'oH');
        else if (a.nb.some(([, o]) => o === 2)) inc('oDbl');
        else if (a.q < 0) inc('oNeg');
        else inc(a.arom ? 'oAr' : 'oEther');
      } else if (a.el === 'N') {
        if (a.arom) inc('nAr');
        else if (a.q > 0 && a.nb.filter(([j]) => A[j].el === 'O').length === 2) inc('nNitro');
        else if (a.nb.some(([, o]) => o === 3)) inc('nTriple');
        else if (a.nb.some(([j]) => carbonyl(j))) inc('nAmide');
        else inc(a.nb.some(([j]) => A[j].arom) ? 'nArAm' : 'nAm');
        inc('hN', a.h);
      } else if (/^(F|Cl|Br|I|S)$/.test(a.el)) inc(a.el + (a.nb.some(([j]) => A[j].arom) ? 'ar' : ''));
      else inc('other');
      if (a.q && a.el !== 'N') inc('charge', Math.abs(a.q));
    });
    return t;
  },
  logp(m, Gr) {
    Gr = Gr || this.graph(m);
    const t = this.logpTypes(Gr), W = this.LOGP_W;
    let s = W.k0 || 0;
    for (const [k, v] of Object.entries(t)) s += (W[k] != null ? W[k] : 0) * v;
    return s;
  },
  // Beiträge (angepasst mit tests/chem/logp-anpassen.js an Messwerten, Ridge-Regression)
  LOGP_W: { k0: -0.33, Br: 1.13, Brar: 1.05, Cl: 0.9, Clar: 0.92, F: 0.2, Far: 0.43, I: 1.2, Iar: 1.28, S: 0.6, Sar: 0.7, c: 0.1, cAr: 0.25, cArX: 0.13, cCO: -0.62, cSp2: 0.4, cSp2X: -0.27, cX: -0.56, charge: 0.17, hC: 0.22, hC2: 0.14, hN: -0.38, nAm: 0.15, nAmide: 0.41, nAr: 0.15, nArAm: -0.1, nNitro: 0.17, nTriple: -0.27, oAr: 0.29, oDbl: -0.45, oEther: 0.41, oH: -0.39, oHacid: 0.43, oHar: -0.5, oNeg: 0.17, other: -0.5 },

  /* ---------------------------------------------------------- Massenspektrum: Isotopenmuster */
  ISO: {
    H: [[1.0078250, 99.9885], [2.0141018, 0.0115]], C: [[12, 98.93], [13.0033548, 1.07]], N: [[14.0030740, 99.636], [15.0001089, 0.364]],
    O: [[15.9949146, 99.757], [16.9991317, 0.038], [17.9991610, 0.205]], F: [[18.9984032, 100]], Na: [[22.9897693, 100]],
    Si: [[27.9769265, 92.223], [28.9764947, 4.685], [29.9737702, 3.092]], P: [[30.9737615, 100]],
    S: [[31.9720707, 94.99], [32.9714585, 0.75], [33.9678669, 4.25], [35.9670808, 0.01]], Cl: [[34.9688527, 75.76], [36.9659026, 24.24]],
    Br: [[78.9183376, 50.69], [80.9162910, 49.31]], I: [[126.904473, 100]], B: [[10.0129370, 19.9], [11.0093054, 80.1]],
    K: [[38.9637069, 93.2581], [39.9639987, 0.0117], [40.9618260, 6.7302]], Li: [[6.0151223, 7.59], [7.0160041, 92.41]], Mg: [[23.9850419, 78.99], [24.9858370, 10], [25.9825930, 11.01]],
  },
  isotopes(counts) {
    let dist = new Map([[0, { p: 1, m: 0 }]]);
    for (const [el, n] of Object.entries(counts)) {
      const iso = this.ISO[el] || (CHEM_MONO[el] ? [[CHEM_MONO[el], 100]] : null);
      if (!iso) return null;
      for (let k = 0; k < n; k++) {
        const nd = new Map();
        for (const [nm, d] of dist) for (const [m, ab] of iso) {
          const p = d.p * ab / 100;
          if (p < 1e-10) continue;
          const key = nm + Math.round(m);
          const e = nd.get(key);
          if (e) { e.m = (e.m * e.p + (d.m + m) * p) / (e.p + p); e.p += p; } else nd.set(key, { p, m: d.m + m });
        }
        dist = nd;
      }
    }
    const peaks = [...dist.entries()].map(([nom, d]) => ({ nom, m: d.m, p: d.p }));
    const max = Math.max(...peaks.map(x => x.p));
    return peaks.map(x => ({ ...x, rel: 100 * x.p / max })).filter(x => x.rel >= 0.05).sort((a, b) => a.nom - b.nom);
  },
  /* typische Bruchstücke (Elektronenstoss) – Hinweise nach den Gruppen */
  fragments(m, groups, M) {
    const g = new Set(groups.map(x => x.k));
    const { A } = this.graph(m);
    const methyl = A.some(a => a.el === 'C' && a.h === 3);
    const out = [];
    const f = (mz, t) => { if (mz > 0 && mz < M) out.push({ mz: Math.round(mz), t }); };
    if (methyl) f(M - 15, '−CH₃ (Methyl abgespalten)');
    if (g.has('alc1') || g.has('alc2') || g.has('alc3')) { f(M - 18, '−H₂O (Alkohol)'); if (g.has('alc1')) f(31, 'CH₂=OH⁺ (primärer Alkohol)'); }
    if (g.has('acid')) { f(M - 17, '−OH'); f(M - 45, '−COOH'); }
    if (g.has('aldehyde')) { f(M - 1, '−H (Aldehyd)'); f(M - 29, '−CHO'); }
    if (g.has('ketone') || g.has('ester')) if (A.some((a, i) => a.el === 'C' && a.h === 3 && a.nb.some(([j]) => A[j].nb.some(([k, o]) => o === 2 && A[k].el === 'O')))) f(43, 'CH₃CO⁺ (Acylium)');
    if (g.has('ester')) { f(M - 31, '−OCH₃'); f(M - 45, '−OC₂H₅'); }
    if (g.has('arene')) { f(77, 'C₆H₅⁺ (Phenyl)'); if (A.some(a => a.el === 'C' && !a.arom && a.h === 2 && a.nb.some(([j]) => A[j].arom)) || A.some(a => a.el === 'C' && a.h === 3 && a.nb.some(([j]) => A[j].arom))) f(91, 'C₇H₇⁺ (Tropylium)'); if (g.has('ketone') || g.has('aldehyde') || g.has('ester') || g.has('acid')) f(105, 'C₆H₅CO⁺ (Benzoyl)'); }
    if (g.has('am1')) f(30, 'CH₂=NH₂⁺ (Amin)');
    if (g.has('alkhal') || g.has('arhal')) { if (A.some(a => a.el === 'Cl')) f(M - 35, '−Cl'); if (A.some(a => a.el === 'Br')) f(M - 79, '−Br'); if (A.some(a => a.el === 'I')) f(M - 127, '−I'); }
    if (A.filter(a => a.el === 'C').length >= 3 && !g.has('arene')) f(29, 'C₂H₅⁺ / CHO⁺');
    const seen = new Set();
    return out.filter(x => { if (seen.has(x.mz)) return false; seen.add(x.mz); return true; }).sort((a, b) => b.mz - a.mz);
  },

  /* ---------------------------------------------------------- Massenspektrum (EI, 70 eV) simuliert (1.54)
   * Molekül-Ion und Bruchstücke aus Bindungsbrüchen: jede Einfachbindung ausserhalb von Ringen wird gespalten, die
   * Ladung bleibt auf der Seite mit dem stabileren Kation (α-Spaltung neben O/N → Oxonium/Iminium, Acylium, benzylisch
   * (→ Tropylium m/z 91), allylisch, tertiär > sekundär > primär, Halogen-Verlust); dazu Umlagerungen (McLafferty mit
   * γ-H, H₂O-Abspaltung aus Alkoholen, CO aus Acylium, Phenyl 77). Höhe = Stabilität (Schätzung), normiert auf den
   * Basispeak 100 %; jedes Ion mit seinem Isotopenmuster (¹³C, ³⁷Cl, ⁸¹Br …). */
  NOM: { H: 1, C: 12, N: 14, O: 16, F: 19, Si: 28, P: 31, S: 32, Cl: 35, Br: 79, I: 127, B: 11, Na: 23, K: 39, Se: 80, Li: 7, Mg: 24 },
  msSim(m, Gr) {
    Gr = Gr || this.graph(m);
    const { A } = Gr, n = A.length;
    if (!n) return null;
    /* 1.55: jedes Ion trägt seine Struktur – Atome (set), gebrochene Bindungen (cut), Ladungsort (site), H-Verschiebungen
     * (dh), geänderte Bindungsordnungen (bo), Herkunft (from = m/z des Vorläufers) und Verlust (loss). Daraus zeichnet
     * die Analyse die Bruchstücke als Moleküle und die Abbruchfolge M⁺· → … → Ion. */
    const ringBond = (i, j) => Gr.rings.some(r => { const a = r.indexOf(i), b = r.indexOf(j); return a >= 0 && b >= 0 && (Math.abs(a - b) === 1 || Math.abs(a - b) === r.length - 1); });
    const carbonyl = (i) => carbonylAt(A, i);
    const counts = (set, dh) => { const c = {}; for (const i of set) { c[A[i].el] = (c[A[i].el] || 0) + 1; const h = A[i].h + ((dh && dh[i]) || 0); if (h) c.H = (c.H || 0) + h; } if (c.H <= 0) delete c.H; return c; };
    const nom = (c) => Object.entries(c).reduce((t, [e, k]) => t + (this.NOM[e] || Math.round((CHEM_BY_SYM[e] || { mass: 0 }).mass)) * k, 0);
    const side = (start, cuts) => { const cut = (v, w) => cuts.some(([a, b]) => (a === v && b === w) || (a === w && b === v)); const seen = new Set([start]), st = [start]; while (st.length) { const v = st.pop(); for (const [w] of A[v].nb) { if (cut(v, w)) continue; if (!seen.has(w)) { seen.add(w); st.push(w); } } } return seen; };
    const all = new Set(A.map((_, i) => i));
    const Mc = counts(all), Mn = nom(Mc);
    const grp = new Set(this.groups(m, Gr).map(g => g.k));
    const ht = (c) => this.hillText(c);
    // Stabilität eines Kations am Atom c (Ladungsseite S)
    const cationScore = (c, S) => {
      const a = A[c];
      let sc = 0.1;
      const why = [];
      const nbS = a.nb.filter(([j]) => S.has(j));
      if (carbonyl(c)) {
        // echtes Acylium R–C≡O⁺ nur, wenn am Carbonyl-C kein O/N mehr hängt; sonst (Alkoxycarbonyl, COOH⁺) schwächer
        const het = nbS.some(([j, o]) => o === 1 && (A[j].el === 'O' || A[j].el === 'N'));
        if (het) { sc += 1.0; why.push(nbS.some(([j]) => A[j].el === 'N') ? 'Carbamoyl-Ion' : 'Carboxyl-/Alkoxycarbonyl-Ion'); }
        else if (S.size === 2) { sc += 1.4; why.push('Formyl-Kation HC≡O⁺'); }
        else { sc += 2.6 + (nbS.some(([j]) => A[j].arom) ? 0.9 : 0); why.push(nbS.some(([j]) => A[j].arom) ? 'Acylium-Ion Ar–C≡O⁺ (Benzoyl-Typ)' : 'Acylium-Ion R–C≡O⁺'); }
      }
      if (a.el === 'C' && nbS.some(([j]) => A[j].el === 'N') && !carbonyl(c)) { sc += 2.7; why.push('α-Spaltung → Iminium-Ion'); }
      else if (a.el === 'C' && !carbonyl(c) && nbS.some(([j]) => A[j].el === 'O' || A[j].el === 'S')) { sc += 2.0; why.push('α-Spaltung → Oxonium-Ion'); }
      if (a.el === 'C' && !a.arom && !carbonyl(c) && nbS.some(([j]) => A[j].arom)) { sc += 2.3; why.push('benzylisch'); }
      else if (a.el === 'C' && !a.arom && !carbonyl(c) && nbS.some(([j]) => !A[j].arom && A[j].nb.some(([k, o]) => o === 2 && A[k].el === 'C' && k !== c))) { sc += 1.2; why.push('allylisch'); }
      if (a.el === 'C' && !a.arom && !carbonyl(c)) { const cs = nbS.filter(([j]) => A[j].el === 'C').length; sc += [0, 0.15, 0.7, 1.3][Math.min(3, cs)]; if (cs >= 3) why.push('tertiäres Kation'); else if (cs === 2 && !why.length) why.push('sekundäres Kation'); }
      if (a.arom) { sc += 0.5; why.push('Aryl-Kation'); }
      if (a.el !== 'C') sc -= 1.0;
      if (a.el === 'C' && !a.arom && !carbonyl(c) && a.nb.some(([, o]) => o >= 2)) sc -= 0.8;   // Vinyl-/Alkinyl-Kation ungünstig
      // reine Alkyl-Kationen: C₃/C₄ (nach Umlagerung sekundär/tertiär) sind in Alkanspektren am häufigsten
      if ((!why.length || /sekundär|tertiär/.test(why[0])) && [...S].every(v => A[v].el === 'C' && !A[v].arom)) { const nc = S.size; sc += nc === 3 || nc === 4 ? 1.0 : nc === 2 || nc === 5 ? 0.5 : 0; if (!why.length) why.push('Alkyl-Kation'); }
      return { sc, why: why.join(', ') || 'Bindungsbruch' };
    };
    const ions = new Map();
    const M = { mz: Mn, I: 0, sc: 0, why: 'Molekül-Ion M⁺·', c: Mc, kind: 'M', set: all, cut: [], site: null, oe: true, dh: null, bo: [], from: null, loss: '' };
    // Ion eintragen; gleiche m/z: Häufigkeit addieren (halb), Struktur des stärksten Wegs behalten
    const add = (o) => {
      const c = o.c || counts(o.set, o.dh), mz = nom(c);
      if (mz < 12 || mz >= Mn) return null;
      const I = Math.exp(o.sc);
      const prev = ions.get(mz);
      const ion = { ...o, approx: !!o.c && !o.exact, c, mz, I, best: I, kind: 'F', cut: o.cut || [], bo: o.bo || [], dh: o.dh || null, from: o.from == null ? Mn : o.from };
      if (prev) { prev.I += I * 0.5; if (I > prev.best) { Object.assign(prev, ion, { I: prev.I, best: I }); } return prev; }
      ions.set(mz, ion);
      return ion;
    };
    /* 1. Einfache Bindungsbrüche (nicht im Ring): Ladung bleibt beim stabileren Kation */
    for (let i = 0; i < n; i++) for (const [j, o] of A[i].nb) {
      if (j <= i || o !== 1 || ringBond(i, j)) continue;
      const Si = side(i, [[i, j]]);
      if (Si.has(j)) continue;
      const Sj = new Set([...all].filter(x => !Si.has(x)));
      for (const [S, c, other, lost] of [[Si, i, j, Sj], [Sj, j, i, Si]]) {
        const r = cationScore(c, S);
        let sc = r.sc;
        if (/^(Cl|Br|I)$/.test(A[other].el) && S.size > 1) sc += A[other].el === 'Cl' ? 0.6 : 1.3;
        if (S.size === 1 && A[c].el === 'C' && A[c].h === 3) sc -= 1.2;   // CH₃⁺ selten
        // Stevenson/«grösster Rest geht»: das grössere Radikal wird bevorzugt abgespalten; Arylradikal ungünstig
        sc += Math.min(0.5, 0.08 * lost.size);
        if (A[other].arom) sc -= carbonyl(c) ? 0.9 : 1.3;
        if (lost.size === 1 && A[other].el === 'C' && A[other].h === 3) sc -= 0.3;   // CH₃·-Verlust weniger begünstigt
        add({ set: S, sc, why: r.why, cut: [[i, j]], site: c, oe: false, loss: ht(counts(lost)) + '·' });
      }
    }
    /* 2. H-Verluste und kleine Neutralteile aus M⁺· */
    // H₂O aus Alkoholen (C=C mit dem Nachbar-C, das ein H abgibt)
    for (let i = 0; i < n; i++) {
      const a = A[i];
      if (a.el !== 'O' || !a.h || a.nb.length !== 1) continue;
      const c = a.nb[0][0];
      if (A[c].el !== 'C' || A[c].arom || carbonyl(c)) continue;
      const nb = A[c].nb.find(([k]) => k !== i && A[k].el === 'C' && A[k].h && !A[k].arom);
      if (!nb) continue;
      const k = A[c].nb.filter(([x]) => A[x].el === 'C').length;
      add({ set: new Set([...all].filter(x => x !== i)), dh: { [nb[0]]: -1 }, bo: [[c, nb[0], 2]], sc: k >= 2 ? 1.0 : 0.4, why: 'Abspaltung von H₂O (Alkohol) → Alken-Radikalkation', oe: true, site: c, loss: 'H₂O' });
    }
    // α-Spaltung mit Verlust von H· (C–H neben O/N → Oxonium/Iminium M−1)
    for (let i = 0; i < n; i++) {
      const a = A[i];
      if (a.el !== 'C' || a.arom || !a.h || carbonyl(i) || !a.nb.some(([j]) => A[j].el === 'O' || A[j].el === 'N')) continue;
      add({ set: all, dh: { [i]: -1 }, sc: 1.2, why: 'α-Spaltung, Verlust von H·', oe: false, site: i, loss: 'H·' });
      break;
    }
    // Aldehyd: H· → Acylium (aromatisch sehr stark)
    for (let i = 0; i < n; i++) if (carbonyl(i) && A[i].h === 1 && A[i].nb.some(([j]) => A[j].el === 'C')) add({ set: all, dh: { [i]: -1 }, sc: Gr.aromRings.length ? 3.3 : 1.1, why: 'Verlust von H· (Aldehyd → Acylium)', oe: false, site: i, loss: 'H·' });
    // Halogenalkane: HX-Abspaltung
    for (let i = 0; i < n; i++) {
      if (!/^(Cl|Br|I)$/.test(A[i].el) || !A[i].nb.length) continue;
      const c = A[i].nb[0][0];
      if (A[c].arom) continue;
      const nb = A[c].nb.find(([k]) => k !== i && A[k].el === 'C' && A[k].h);
      if (nb) add({ set: new Set([...all].filter(x => x !== i)), dh: { [nb[0]]: -1 }, bo: [[c, nb[0], 2]], sc: 0.7, why: `Abspaltung von H${A[i].el}`, oe: true, site: c, loss: 'H' + A[i].el });
    }
    /* 3. Umlagerungen */
    // McLafferty: C=O (auch Nitril/Ester/Amid) mit γ-H → Enol-Radikalkation, Verlust eines Alkens
    for (let c0 = 0; c0 < n; c0++) {
      if (!carbonyl(c0)) continue;
      const oDbl = A[c0].nb.find(([j, o]) => o === 2 && A[j].el === 'O')[0];
      for (const [al] of A[c0].nb) {
        if (A[al].el !== 'C' || A[al].arom) continue;
        for (const [be] of A[al].nb) {
          if (be === c0 || A[be].el !== 'C' || ringBond(al, be)) continue;
          if (!A[be].nb.some(([ga]) => ga !== al && A[ga].el === 'C' && A[ga].h > 0)) continue;
          const S = side(al, [[al, be]]);
          if (S.has(be)) continue;
          add({ set: S, dh: { [oDbl]: 1 }, bo: [[c0, oDbl, 1], [c0, al, 2]], cut: [[al, be]], sc: 2.4, why: 'McLafferty-Umlagerung (γ-H wandert zum O, Alken wird abgespalten)', oe: true, site: oDbl, loss: ht(counts(new Set([...all].filter(x => !S.has(x))))) });
        }
      }
      // Ester mit Ethyl- oder grösserem Alkoxyrest: Alken-Verlust aus dem Alkohol-Teil (→ Säure-Radikalkation)
      const oS = A[c0].nb.find(([j, o]) => o === 1 && A[j].el === 'O' && !A[j].h);
      if (oS) {
        const r1 = A[oS[0]].nb.find(([k]) => k !== c0);
        if (r1 && A[r1[0]].el === 'C' && !A[r1[0]].arom && A[r1[0]].nb.some(([k]) => k !== oS[0] && A[k].el === 'C' && A[k].h)) {
          const lostR = side(r1[0], [[oS[0], r1[0]]]);
          const S = new Set([...all].filter(x => !lostR.has(x)));
          add({ set: S, dh: { [oS[0]]: 1 }, cut: [[oS[0], r1[0]]], sc: 1.4, why: 'H-Wanderung aus dem Alkohol-Teil, Alken-Verlust (→ Säure-Radikalkation)', oe: true, site: oS[0], loss: ht(counts(lostR, { [[...lostR].find(x => A[x].h && x !== r1[0]) ?? r1[0]]: -1 })) });
        }
      }
    }
    // Aromaten: Tropylium C₇H₇⁺ (m/z 91) aus Benzyl-Verbindungen, Phenyl-Kation 77
    const benzRings = Gr.aromRings.filter(r => r.length === 6 && r.every(v => A[v].el === 'C'));
    for (const r of benzRings) {
      const subs = r.flatMap(v => A[v].nb.filter(([j]) => !r.includes(j)).map(([j]) => [v, j]));
      const benzyl = subs.find(([, j]) => A[j].el === 'C' && !A[j].arom && !carbonyl(j) && (A[j].h > 0 || A[j].nb.length >= 2));
      if (benzyl && Mn > 91) {
        const [v, j] = benzyl, set = new Set([...r, j]);
        const cuts = A[j].nb.filter(([k]) => k !== v).map(([k]) => [j, k]);
        const lost = new Set([...all].filter(x => !set.has(x)));
        const dhj = A[j].h - 2;   // Benzyl-Kation CH₂⁺
        add({ set, dh: { [j]: -dhj }, cut: cuts, site: j, oe: false, sc: subs.length === 1 ? 3.7 : 2.6, why: 'Benzyl-Kation → Tropylium-Ion C₇H₇⁺ (Ringerweiterung)', exact: true, loss: lost.size ? ht(counts(lost, Object.fromEntries([...lost].filter(x => A[j].h === 3).map(x => [x, 0])))) + '·' : 'H·', c: subs.length === 1 ? { C: 7, H: 7 } : null });
      }
      if (subs.length === 1 && Mn > 78) {
        const [v, j] = subs[0], lost = side(j, [[v, j]]);
        const p = add({ set: new Set(r), cut: [[v, j]], site: v, oe: false, sc: 1.2 + (carbonyl(j) ? 0.6 : 0), why: 'Phenyl-Kation C₆H₅⁺', loss: ht(counts(lost)) + '·' });
        void p;
      }
    }
    // Keten-Abspaltung (CH₂=C=O, −42) aus Acetyl an O/N (Aryl-/Enolacetate, Acetanilide) – oft Basispeak
    for (let c0 = 0; c0 < n; c0++) {
      if (!carbonyl(c0)) continue;
      const me = A[c0].nb.find(([j]) => A[j].el === 'C' && A[j].h >= 1 && !A[j].arom), x = A[c0].nb.find(([j, o]) => o === 1 && (A[j].el === 'O' || A[j].el === 'N'));
      if (!me || !x || !A[x[0]].nb.some(([k]) => k !== c0 && A[k].arom)) continue;
      const oDbl = A[c0].nb.find(([j, o]) => o === 2 && A[j].el === 'O')[0];
      const set = new Set([...all].filter(v => v !== c0 && v !== oDbl && v !== me[0]));
      add({ set, dh: { [x[0]]: 1 }, cut: [[c0, x[0]]], site: x[0], oe: true, sc: 3.6, why: 'Abspaltung von Keten CH₂=C=O (Acetyl an Aryl-O/N)', loss: 'C₂H₂O' });
    }
    // ortho-Effekt: Aryl-COOH mit O/N-Substituent daneben → H₂O-Verlust (Salicylsäure/Aspirin m/z 120)
    for (let c0 = 0; c0 < n; c0++) {
      if (!carbonyl(c0)) continue;
      const oh = A[c0].nb.find(([j, o]) => o === 1 && A[j].el === 'O' && A[j].h);
      const ar = A[c0].nb.find(([j]) => A[j].arom);
      if (!oh || !ar) continue;
      const ortho = A[ar[0]].nb.map(([k]) => k).filter(k => k !== c0 && A[k].arom).map(k => A[k].nb.find(([x]) => (A[x].el === 'O' || A[x].el === 'N') && !A[x].arom)).find(Boolean);
      if (!ortho) continue;
      for (const base of [Mn, Mn - 42]) {
        const src = base === Mn ? M : ions.get(base);
        if (!src) continue;
        const set = new Set([...src.set].filter(v => v !== oh[0]));
        const dh = { ...(src.dh || {}) }; dh[ortho[0]] = (dh[ortho[0]] || 0) - 1;
        add({ set, dh, cut: [...(src.cut || [])], bo: [...(src.bo || [])], site: c0, oe: true, sc: base === Mn ? 2.6 : 3.8, why: 'ortho-Effekt: Verlust von H₂O → Keten-Radikalkation', from: base, loss: 'H₂O' });
      }
    }
    // Phenole (−CO), Aryl-methylether (−CH₂O), Nitroaromaten (−NO₂, −NO)
    for (let i = 0; i < n; i++) {
      const a = A[i];
      const arN = a.el === 'O' ? a.nb.find(([j]) => A[j].arom) : null;
      if (arN && !a.nb.some(([j]) => carbonyl(j))) {
        if (a.h) add({ set: new Set([...all].filter(x => x !== i && x !== arN[0])), dh: {}, c: { ...Mc, C: Mc.C - 1, O: Mc.O - 1 }, site: null, oe: true, sc: 2.3, why: 'Phenol: Verlust von CO (Ringverengung → C₅H₆⁺·)', loss: 'CO', cut: [] });
        else { const me = a.nb.find(([j]) => A[j].el === 'C' && !A[j].arom && A[j].h === 3); if (me) add({ set: new Set([...all].filter(x => x !== i && x !== me[0])), dh: { [arN[0]]: 1 }, c: { ...Mc, C: Mc.C - 1, H: Mc.H - 2, O: Mc.O - 1 }, cut: [[i, arN[0]]], site: null, oe: true, sc: 2.4, why: 'Aryl-methylether: Verlust von CH₂O (Formaldehyd)', loss: 'CH₂O' }); }
      }
      if (a.el === 'N' && a.q > 0 && a.nb.filter(([j]) => A[j].el === 'O').length === 2) {
        const ar = a.nb.find(([j]) => A[j].el === 'C');
        if (ar && A[ar[0]].arom) {
          const os = a.nb.filter(([j]) => A[j].el === 'O').map(([j]) => j);
          add({ set: new Set([...all].filter(x => x !== i && !os.includes(x))), cut: [[i, ar[0]]], site: ar[0], oe: false, sc: 3.4, why: 'Nitroaromat: Verlust von ·NO₂ → Aryl-Kation', loss: 'NO₂·' });
          add({ set: new Set([...all].filter(x => x !== i && x !== os[0])), c: { ...Mc, N: (Mc.N || 1) - 1, O: Mc.O - 1 }, site: os[1], oe: true, sc: 1.6, why: 'Nitroaromat: Verlust von NO (Umlagerung zum Phenoxy-Ion)', loss: 'NO', cut: [] });
        }
      }
    }
    // Retro-Diels-Alder: Cyclohexen → Dien-Radikalkation + Alken
    for (const r of Gr.rings) {
      if (r.length !== 6 || r.some(v => A[v].arom || A[v].el !== 'C')) continue;
      const L = r.length;
      const k = r.findIndex((v, q) => { const w = r[(q + 1) % L]; return A[v].nb.some(([x, o]) => x === w && o === 2); });
      if (k < 0) continue;
      const C1 = r[k], C2 = r[(k + 1) % L], C3 = r[(k + 2) % L], C4 = r[(k + 3) % L], C5 = r[(k + 4) % L], C6 = r[(k + 5) % L];
      const cuts = [[C3, C4], [C5, C6]];
      const dien = side(C1, cuts), ene = side(C4, cuts);
      if (dien.has(C4)) continue;
      add({ set: dien, cut: cuts, bo: [[C6, C1, 2], [C1, C2, 1], [C2, C3, 2]], site: C1, oe: true, sc: 2.2 + (dien.size >= ene.size ? 0.4 : 0), why: 'Retro-Diels-Alder (Dien-Radikalkation)', loss: ht(counts(ene)) });
      add({ set: ene, cut: cuts, bo: [[C4, C5, 2]], site: C4, oe: true, sc: 1.4 + (ene.size > dien.size ? 0.4 : 0) - (ene.size <= 2 ? 1.2 : 0), why: 'Retro-Diels-Alder (Alken-Radikalkation)', loss: ht(counts(dien)) });
    }
    // gesättigte Ringe ohne Heteroatom: Ringöffnung, Verlust von C₂H₄ (Cyclohexan m/z 56)
    for (const r of Gr.rings) {
      if (r.length < 5 || r.length > 7 || r.some(v => A[v].arom || A[v].el !== 'C' || A[v].nb.some(([, o]) => o > 1))) continue;
      const pair = [r[0], r[1]];
      if (!pair.every(v => A[v].h === 2)) continue;
      const set = new Set([...all].filter(x => !pair.includes(x)));
      add({ set, cut: [[r[r.length - 1], r[0]], [r[1], r[2]]], site: r[2], oe: true, sc: 2.8, why: 'Ringöffnung, Verlust von Ethen C₂H₄', loss: 'C₂H₄' });
      break;
    }
    /* 4. Folge-Zerfälle der gebildeten Ionen */
    for (const io of [...ions.values()]) {
      // Acylium → −CO
      if (/Acylium/.test(io.why) && io.site != null && carbonyl(io.site) && io.c.O >= 1) {
        const oDbl = A[io.site].nb.find(([j, o]) => o === 2 && A[j].el === 'O')[0];
        const R = A[io.site].nb.find(([j]) => io.set.has(j) && j !== oDbl);
        if (R && io.mz - 28 >= 14) add({ set: new Set([...io.set].filter(x => x !== io.site && x !== oDbl)), dh: io.dh, cut: [...io.cut, [io.site, R[0]]], site: R[0], oe: false, sc: Math.log(io.I) - 1.0 + (A[R[0]].arom ? 0.6 : 0) - (A[R[0]].nb.length === 1 ? 1.2 : 0), why: 'Acylium-Ion − CO' + (A[R[0]].arom ? ' → Phenyl-/Aryl-Kation' : ' → Alkyl-Kation'), from: io.mz, loss: 'CO' });
      }
      // Iminium/Oxonium mit Alkylrest am Heteroatom: Alken-Verlust (Triethylamin 86 → 58, Diethylether 59 → 31)
      if (/Iminium|Oxonium/.test(io.why) && io.site != null) {
        const X = A[io.site].nb.find(([j]) => io.set.has(j) && (A[j].el === 'N' || A[j].el === 'O'));
        if (X) for (const [R] of A[X[0]].nb) {
          if (R === io.site || !io.set.has(R) || A[R].el !== 'C' || A[R].arom || carbonyl(R)) continue;
          if (!A[R].nb.some(([k]) => k !== X[0] && A[k].el === 'C' && A[k].h)) continue;
          const lostR = side(R, [[X[0], R], ...io.cut]);
          const set = new Set([...io.set].filter(x => !lostR.has(x)));
          const dh = { ...(io.dh || {}) }; dh[X[0]] = (dh[X[0]] || 0) + 1;
          add({ set, dh, cut: [...io.cut, [X[0], R]], site: io.site, oe: false, sc: Math.log(io.I) - 0.7, why: (A[X[0]].el === 'N' ? 'Iminium' : 'Oxonium') + '-Ion − Alken (H-Wanderung)', from: io.mz, loss: ht(counts(lostR)).replace(/H(\d|₀|₁|₂|₃|₄|₅|₆|₇|₈|₉)+$/, (h) => h) });
          break;
        }
      }
      // Phenyl-Kation C₆H₅⁺ → C₄H₃⁺ (m/z 51, Verlust von Ethin)
      if (io.mz === 77 && io.c.C === 6 && io.c.H === 5) add({ set: io.set, c: { C: 4, H: 3 }, cut: io.cut, site: io.site, oe: false, sc: Math.log(io.I) - 1.1, why: 'Phenyl-Kation − C₂H₂ (Ethin)', from: 77, loss: 'C₂H₂', partial: true });
      // Alkyl-Kation − H₂ → Alkenyl-Kation (Alkan-Reihen 27, 41, 55 …)
      if (io.site != null && [...io.set].every(v => A[v].el === 'C' && !A[v].arom) && io.set.size >= 2 && io.set.size <= 7 && !io.oe) {
        const nb = A[io.site].nb.find(([j]) => io.set.has(j) && A[j].h);
        if (nb && (io.c.H || 0) >= 3) add({ set: io.set, dh: { ...(io.dh || {}), [io.site]: ((io.dh || {})[io.site] || 0), [nb[0]]: ((io.dh || {})[nb[0]] || 0) - 1, __h2: 0 }, c: { ...io.c, H: io.c.H - 2 }, bo: [...io.bo, [io.site, nb[0], 2]], cut: io.cut, site: io.site, oe: false, sc: Math.log(io.I) - 0.85, why: 'Alkyl-Kation − H₂ → Alkenyl-Kation', from: io.mz, loss: 'H₂' });
      }
    }
    // Molekül-Ion: Aromaten/Konjugation stabil, Alkohole/Amine/verzweigte Alkane schwach
    let mSc = 1.6;
    if (Gr.aromRings.length) mSc = 3.4;
    else if (grp.has('ketone') || grp.has('ester')) mSc = 2.0;
    else if (grp.has('alkene')) mSc = 1.3;
    else if (A.every(a => a.el === 'C')) mSc = Gr.rings.length ? 2.4 : 0.9;   // gesättigte Kohlenwasserstoffe: M⁺ klein (Ringe stabiler)
    if (grp.has('alc1') || grp.has('alc2') || grp.has('alc3') || grp.has('am1') || grp.has('am2') || grp.has('am3')) mSc = Math.min(mSc, 0.8);
    if (grp.has('alc3') || (!Gr.aromRings.length && A.some(a => a.el === 'C' && a.nb.filter(([j]) => A[j].el === 'C').length === 4))) mSc = Math.min(mSc, 0.1);
    if (grp.has('nitro') && Gr.aromRings.length) mSc = 2.9;
    if (Gr.aromRings.length && (grp.has('ketone') || grp.has('ester'))) mSc = 2.4;
    M.I = Math.exp(mSc);
    const list = [M, ...ions.values()];
    const Imax = Math.max(...list.map(x => x.I));
    const out = [];
    for (const io of list) {
      io.rel = 100 * io.I / Imax;
      if (io.rel < 2.5 && io.kind !== 'M') continue;
      const iso = this.isotopes(io.c) || [{ nom: io.mz, p: 1, m: io.mz }];
      const pmax = iso.reduce((t, q) => Math.max(t, q.p), 0) || 1;
      for (const p of iso) {
        const r2 = io.rel * p.p / pmax;
        if (r2 < 0.3) continue;
        out.push({ nom: p.nom, m: p.m, rel: r2, kind: io.kind, iso: p.nom !== iso[0].nom, why: io.why, formula: this.hillText(io.c), ion: io });
      }
    }
    // gleiche m/z zusammenfassen
    const by = new Map();
    for (const p of out) { const q = by.get(p.nom); if (!q) by.set(p.nom, { ...p }); else { if (!p.iso && q.iso) { q.why = p.why; q.formula = p.formula; q.iso = false; q.kind = p.kind; q.ion = p.ion; } q.rel += p.rel; } }
    const peaks = [...by.values()];
    const top = Math.max(...peaks.map(p => p.rel));
    for (const p of peaks) p.rel = Math.min(100, 100 * p.rel / top);
    // Ionenliste (ohne Isotope) mit relativer Höhe des Hauptpeaks, für Tabelle und Strukturbilder
    const ionList = list.filter(io => io.kind === 'M' || io.rel >= 2.5).map(io => { const pk = by.get(io.mz); return Object.assign(io, { relPk: pk ? pk.rel : 0, formula: this.hillText(io.c) }); }).sort((a, b) => b.relPk - a.relPk);
    return { M: Mn, peaks: peaks.sort((a, b) => a.nom - b.nom), ions: ionList, Mion: M };
  },
  /* Abbruchfolge eines Ions: [M, …, Ion] über from (1.55) */
  msChain(sim, ion) {
    const chain = [ion];
    let cur = ion;
    for (let k = 0; k < 6 && cur.from != null && cur.kind !== 'M'; k++) {
      const p = cur.from === sim.M ? sim.Mion : sim.ions.find(x => x.mz === cur.from);
      if (!p || chain.includes(p)) break;
      chain.unshift(p); cur = p;
    }
    if (chain[0].kind !== 'M') chain.unshift(sim.Mion);
    return chain;
  },
  hillText(c) { return (ChemFormula.hill(c).text || Object.entries(c).map(([e, k]) => e + (k > 1 ? k : '')).join('')).replace(/\d/g, d => '₀₁₂₃₄₅₆₇₈₉'[d]); },   // Ziffern tiefgestellt

  /* ---------------------------------------------------------- IR: typische Banden */
  /* IR-Banden aus Tabellenwerten (1.55 überarbeitet; Quellen: Pretsch/Silverstein, Tabellen der Uni Boulder und
   * Cengage, an Messwerten geprüft – tests/chem/analyse-test.js). Jede Carbonylgruppe einzeln nach Art, Ringgrösse,
   * Konjugation und Nachbarn (Aceton 1715, Cyclopentanon 1745, Acetophenon 1686, Ethylacetat 1742, Phenylacetat 1765,
   * Säure-Dimer 1710, Amide 1650–1690, Säurechlorid 1800, Anhydrid 1820/1760). Dazu die kennzeichnenden Banden im
   * Fingerprint (fp): C–O, C–N, C–Hal, NO₂, SO₂, CH₃-Schirm 1375, Substitutionsmuster des Benzols (oop), Alken-oop.
   * s = Tiefe 0–1 (stark ≈ 0,9), w = halbe Breite in cm⁻¹. */
  ir(m, groups, Gr) {
    Gr = Gr || this.graph(m);
    const { A } = Gr;
    const g = new Set(groups.map(x => x.k));
    const B = [];
    const b = (lo, hi, s, t, w, fp) => B.push({ lo, hi, c: (lo + hi) / 2, s, t, w: w || (hi - lo) / 2 + 12, fp: !!fp });
    const at = (c, s, t, w, fp) => b(c - 5, c + 5, s, t, w || 12, fp);
    const carbonyl = (i) => carbonylAt(A, i);
    const ringSize = (i) => Gr.rings.filter(r => r.includes(i)).map(r => r.length).sort((x, y) => x - y)[0] || 0;
    const conjAt = (i) => A[i].nb.some(([j]) => A[j].arom || (A[j].el === 'C' && !carbonyl(j) && A[j].nb.some(([k, o]) => o === 2 && A[k].el === 'C')));
    /* C–H-Streckschwingungen */
    let nMe = 0, nCH2 = 0, nCH = 0;
    for (const a of A) if (a.el === 'C' && !a.arom && a.nb.every(([, o]) => o === 1)) { if (a.h === 3) nMe++; else if (a.h === 2) nCH2++; else if (a.h === 1) nCH++; }
    const sp3 = nMe + nCH2 + nCH;
    if (sp3) {
      const tot = nMe * 3 + nCH2 * 2 + nCH;
      const f = Math.min(1, 0.45 + tot / 22);
      if (nMe) { at(2962, 0.55 * f * (0.5 + nMe * 3 / tot), 'C–H (CH₃ asym.)', 14); at(2872, 0.35 * f * (0.5 + nMe * 3 / tot), 'C–H (CH₃ sym.)', 12); }
      if (nCH2) { at(2926, 0.6 * f * (0.5 + nCH2 * 2 / tot), 'C–H (CH₂ asym.)', 14); at(2853, 0.4 * f * (0.5 + nCH2 * 2 / tot), 'C–H (CH₂ sym.)', 12); }
      if (nCH && !nMe && !nCH2) at(2890, 0.35, 'C–H (CH)', 15);
      // Deformation (Fingerprint, aber typisch): CH₂-Schere 1465, CH₃ 1460/1375 (Schirm), gem-Dimethyl/tert-Butyl als Doppelbande
      if (nCH2 || nMe) at(1462, 0.35, 'C–H Deformation', 12, true);
      if (nMe) {
        const gem = A.some(a => a.el === 'C' && a.nb.filter(([j]) => A[j].el === 'C' && A[j].h === 3).length >= 2);
        if (gem) { at(1385, 0.3, 'gem-Dimethyl (Doppelbande)', 6, true); at(1367, 0.3, 'gem-Dimethyl', 6, true); }
        else at(1377, 0.3, 'CH₃-Schirmschwingung', 8, true);
      }
      // lange CH₂-Kette (≥ 4): Pendelschwingung 720
      const chain = A.some((a, i) => a.el === 'C' && a.h === 2 && !a.ring && a.nb.filter(([j]) => A[j].h === 2 && A[j].el === 'C').length === 2 && a.nb.every(([j]) => A[j].nb.filter(([k]) => A[k].el === 'C' && A[k].h === 2).length >= 1));
      if (chain && nCH2 >= 4) at(722, 0.25, '(CH₂)ₙ-Pendel (n ≥ 4)', 8, true);
    }
    /* Aromaten */
    const benz = Gr.aromRings.filter(r => r.length === 6);
    if (Gr.aromRings.length) {
      at(3060, 0.22, 'C–H (aromatisch)', 25); at(3030, 0.18, 'C–H (aromatisch)', 15);
      at(1600, 0.4, 'C=C (Aromat)', 8); at(1582, 0.25, 'C=C (Aromat)', 7); at(1495, 0.42, 'C=C (Aromat)', 8, true); at(1452, 0.35, 'C=C (Aromat)', 8, true);
      if (benz.length) b(1660, 2000, 0.06, 'Oberton-Muster (Aromat)', 30);
      // Substitutionsmuster aus benachbarten Ring-H (oop): 5 → 750 + 700, 4 → 750, 3 → 780 + 690 (+880), 2 → 820, 1 → 880
      for (const r of benz) {
        const hasH = r.map(v => A[v].h > 0);
        const runs = [];
        if (hasH.every(Boolean)) runs.push(6);
        else {
          const k0 = hasH.findIndex(x => !x);
          let run = 0;
          for (let q = 1; q <= 6; q++) { const v = hasH[(k0 + q) % 6]; if (v) run++; else { if (run) runs.push(run); run = 0; } }
        }
        for (const n of runs) {
          if (n === 6) at(675, 0.8, 'C–H oop (Benzol)', 12, true);
          else if (n === 5) { at(752, 0.8, 'C–H oop (monosubstituiert)', 12, true); at(697, 0.75, 'Ring-Deform. (monosubstituiert)', 10, true); }
          else if (n === 4) at(750, 0.8, 'C–H oop (ortho-disubst.)', 12, true);
          else if (n === 3) { at(780, 0.7, 'C–H oop (meta / 3 benachb. H)', 12, true); at(690, 0.6, 'Ring-Deform. (meta)', 10, true); }
          else if (n === 2) at(822, 0.75, 'C–H oop (para / 2 benachb. H)', 12, true);
          else if (n === 1) at(880, 0.45, 'C–H oop (isoliertes H)', 12, true);
        }
      }
    }
    /* Alkene (nicht aromatisch, nicht C=O) */
    for (let i = 0; i < A.length; i++) for (const [j, o] of A[i].nb) {
      if (j <= i || o !== 2 || A[i].el !== 'C' || A[j].el !== 'C' || A[i].arom) continue;
      const nH = A[i].h + A[j].h, conj = conjAt(i) || conjAt(j);
      const subs = (k, other) => A[k].nb.filter(([x]) => x !== other).length;
      const si = subs(i, j), sj = subs(j, i);
      if (nH) at(3080, 0.25, '=C–H', 18);
      let nu = 1650, s = 0.35, t = 'C=C';
      if (nH === 3) { nu = 1642; s = 0.4; at(992, 0.6, '=C–H oop (Vinyl)', 10, true); at(912, 0.75, '=CH₂ oop (Vinyl)', 10, true); }
      else if (nH === 2 && (A[i].h === 2 || A[j].h === 2)) { nu = 1650; s = 0.4; at(890, 0.75, '=CH₂ oop (1,1-disubst.)', 10, true); }
      else if (nH === 2) {
        // cis/trans aus der Zeichnung
        let trans = true;
        try { const an = ChemMol.analyze(m); const e = an.ez.find(x => { const bd = m.bonds.find(y => y.id === x.id); return bd && ((bd.a === A[i].src && bd.b === A[j].src) || (bd.b === A[i].src && bd.a === A[j].src)); }); if (e) trans = e.ez === 'E'; } catch (e) { /* */ }
        if (Gr.rings.some(r => r.includes(i) && r.includes(j))) trans = false;
        if (trans) { nu = 1670; s = 0.12; at(965, 0.7, '=C–H oop (trans)', 10, true); t = 'C=C (trans, schwach)'; }
        else { nu = 1655; s = 0.3; at(700, 0.5, '=C–H oop (cis)', 18, true); }
      } else if (nH === 1) { nu = 1670; s = 0.2; at(820, 0.45, '=C–H oop (trisubst.)', 12, true); }
      else { nu = 1675; s = 0.06; t = 'C=C (tetrasubst., sehr schwach)'; }
      if (si + sj === 2 && A[i].nb.concat(A[j].nb).every(([x]) => A[x].el === 'C')) { /* symmetrisch: schwach */ }
      if (A[i].nb.concat(A[j].nb).some(([x]) => A[x].el === 'O' && !carbonyl(x))) { nu = 1625; s = 0.6; t = 'C=C (Enolether, stark)'; }
      if (conj) { nu -= 30; s = Math.max(s, 0.45); t += ' (konjugiert)'; }
      at(nu, s, t, 10);
    }
    /* Alkine, Nitrile */
    for (let i = 0; i < A.length; i++) for (const [j, o] of A[i].nb) {
      if (j <= i || o !== 3) continue;
      if (A[i].el === 'N' || A[j].el === 'N') { const c = A[i].el === 'C' ? i : j; at(conjAt(c) ? 2228 : 2250, conjAt(c) ? 0.55 : 0.4, 'C≡N' + (conjAt(c) ? ' (konjugiert)' : ''), 8); continue; }
      const term = A[i].h || A[j].h;
      if (term) { at(3300, 0.75, '≡C–H (scharf)', 9); at(2120, 0.3, 'C≡C (terminal)', 8); at(635, 0.6, '≡C–H Deformation', 16, true); }
      else { const sym = A[i].nb.length === A[j].nb.length; at(2230, sym ? 0.04 : 0.15, 'C≡C (intern, ' + (sym ? 'kaum sichtbar' : 'schwach') + ')', 10); }
    }
    /* Carbonylgruppen – jede einzeln */
    const COseen = new Set();
    for (let c = 0; c < A.length; c++) {
      if (!carbonyl(c) || COseen.has(c)) continue;
      const nb = A[c].nb.filter(([j, o]) => !(o === 2 && A[j].el === 'O')).map(([j]) => j);
      const O = nb.filter(j => A[j].el === 'O'), N = nb.filter(j => A[j].el === 'N'), X = nb.filter(j => /^(Cl|Br)$/.test(A[j].el));
      const conj = nb.some(j => A[j].arom || (A[j].el === 'C' && !carbonyl(j) && A[j].nb.some(([k, o]) => o === 2 && A[k].el === 'C')));
      const rs = Gr.rings.some(r => r.includes(c) && !r.every(v => A[v].arom)) ? ringSize(c) : 0;
      const ringInc = { 3: 100, 4: 65, 5: 30, 6: 0, 7: -10 }[rs] || 0;
      const aHal = nb.some(j => A[j].el === 'C' && A[j].nb.some(([k]) => /^(Cl|Br|F)$/.test(A[k].el)));
      let nu, t, s = 0.95, w = 13;
      if (O.length === 2) { nu = 1750; t = 'C=O Carbonat'; }
      else if (O.length && N.length) { nu = 1700; t = 'C=O Carbamat (Urethan)'; at(1530, 0.5, 'Amid II (N–H)', 12, true); }
      else if (N.length === 2) { nu = 1660; t = 'C=O Harnstoff'; }
      else if (O.length) {
        const oo = A[O[0]];
        if (oo.q < 0) { at(1580, 0.9, 'COO⁻ asym. (Carboxylat)', 22); at(1410, 0.6, 'COO⁻ sym. (Carboxylat)', 18, true); continue; }
        if (oo.h) {
          nu = conj ? 1690 : 1712; t = 'C=O Säure (Dimer)' + (conj ? ', konjugiert' : '');
          b(2500, 3300, 0.55, 'O–H Säure (sehr breit)', 300); at(1290, 0.6, 'C–O Säure', 22, true); at(935, 0.4, 'O–H Deformation (Säure-Dimer)', 30, true);
        } else {
          const other = oo.nb.find(([k]) => k !== c);
          const anh = other && carbonyl(other[0]);
          if (anh) { if (c < other[0]) { at((rs === 5 ? 1860 : 1822) + (conj ? -25 : 0), 0.8, 'C=O Anhydrid (sym.)', 10); at((rs === 5 ? 1782 : 1758) + (conj ? -25 : 0), 0.95, 'C=O Anhydrid (asym.)', 10); at(1045, 0.7, 'C–O–C Anhydrid', 20, true); } COseen.add(other[0]); continue; }
          const arO = other && (A[other[0]].arom || A[other[0]].nb.some(([k, o]) => o === 2 && A[k].el === 'C'));
          nu = 1742 + (conj ? -22 : 0) + (arO ? 25 : 0) + (rs ? ringInc + (rs === 5 ? 10 : 0) : 0) + (aHal ? 15 : 0);
          if (!nb.some(j => A[j].el === 'C')) nu = 1725;   // Formiat
          t = (rs ? 'C=O Lacton' : 'C=O Ester') + (conj ? ' (konjugiert)' : '') + (arO ? ' (Aryl-/Vinylester)' : '');
          // C–O-Banden: Acetat 1240, Benzoat 1275 + 1110, sonst 1180
          const acetate = nb.some(j => A[j].el === 'C' && A[j].h === 3);
          if (acetate) at(1240, 0.9, 'C–O Ester (Acetat)', 20, true);
          else if (conj) { at(1275, 0.9, 'C–O Ester (konjugiert)', 18, true); at(1110, 0.7, 'O–C–C Ester', 18, true); }
          else at(1180, 0.85, 'C–O Ester', 25, true);
          at(1050, 0.55, 'O–C–C Ester', 18, true);
        }
      } else if (N.length) {
        const nH = A[N[0]].h;
        nu = (nH >= 2 ? 1680 : nH === 1 ? 1665 : 1650) + (rs ? ringInc * 0.8 : 0) + (conj ? -10 : 0) + (A[c].h ? 25 : 0); w = 18;   // Formamide (DMF 1675) höher
        t = 'C=O Amid (Amid I)' + (nH >= 2 ? ', primär' : nH === 1 ? ', sekundär' : ', tertiär') + (rs ? ', Lactam' : '');
        if (nH >= 2) { at(3350, 0.5, 'N–H Amid (asym.)', 35); at(3180, 0.45, 'N–H Amid (sym.)', 35); at(1620, 0.45, 'N–H Deformation (Amid II)', 14); }
        else if (nH === 1) { at(3300, 0.5, 'N–H Amid', 40); if (!rs) at(1545, 0.6, 'Amid II (N–H/C–N)', 14); }
        at(nH ? 1280 : 1400, 0.4, 'C–N Amid (Amid III)', 20, true);
      } else if (X.length) { nu = (conj ? 1775 : 1802); t = 'C=O Säurechlorid'; }
      else if (A[c].h) { nu = conj ? 1702 : 1730; t = 'C=O Aldehyd' + (conj ? ' (konjugiert)' : ''); at(2820, 0.35, 'C–H Aldehyd (Fermi-Dublett)', 12); at(2720, 0.35, 'C–H Aldehyd (Fermi-Dublett)', 12); }
      else {
        const cross = nb.filter(j => A[j].arom || (A[j].el === 'C' && A[j].nb.some(([k, o]) => o === 2 && A[k].el === 'C'))).length;
        nu = 1715 + ringInc + (cross >= 2 ? -50 : conj ? -28 : 0) + (aHal ? 20 : 0);
        t = 'C=O Keton' + (rs ? ` (${rs}-Ring)` : '') + (conj ? ' (konjugiert)' : '');
        if (nb.some(j => A[j].el === 'C' && A[j].h === 3)) at(1360, 0.45, 'C–H δ (CH₃–C=O)', 10, true);
      }
      at(nu, s, t, w);
    }
    /* O–H, N–H */
    if (g.has('alc1') || g.has('alc2') || g.has('alc3') || g.has('phenol') || g.has('enol')) {
      b(3200, 3500, 0.8, 'O–H (breit, H-Brücken)', 120); at(3625, 0.12, 'O–H frei (scharf, verdünnt)', 8);
      if (g.has('phenol')) { at(1230, 0.75, 'C–O Phenol', 18, true); at(1360, 0.4, 'O–H Deformation', 25, true); }
      if (g.has('alc1')) at(1050, 0.8, 'C–O prim. Alkohol', 20, true);
      if (g.has('alc2')) at(1100, 0.8, 'C–O sek. Alkohol', 20, true);
      if (g.has('alc3')) at(1150, 0.8, 'C–O tert. Alkohol', 20, true);
    }
    if (g.has('am1') || g.has('aniline')) {
      const ar = g.has('aniline');
      at(ar ? 3440 : 3380, 0.4, 'N–H asym. (prim. Amin)', 22); at(ar ? 3360 : 3300, 0.4, 'N–H sym. (prim. Amin)', 22); at(1620, 0.45, 'N–H Deformation', 14);
      if (A.some(a => a.el === 'N' && a.h === 2 && !a.nb.some(([j]) => A[j].arom || carbonyl(j)))) at(800, 0.5, 'N–H Wippen (prim. Amin)', 50, true);
    }
    if (g.has('am2')) at(3310, 0.25, 'N–H (sek. Amin, schwach)', 20);
    if (g.has('aniline')) at(1280, 0.7, 'C–N (aromatisches Amin)', 18, true);
    else if (g.has('am1') || g.has('am2') || g.has('am3')) at(1130, 0.45, 'C–N (aliphatisches Amin)', 25, true);
    if (g.has('ammonium')) b(2800, 3200, 0.6, 'N⁺–H (breit)', 150);
    if (g.has('pyrrole')) at(3400, 0.5, 'N–H (Pyrrol/Indol)', 30);
    if (g.has('imine')) at(1660, 0.45, 'C=N', 12);
    /* Ether, Nitro, Schwefel, Halogene, Phosphor */
    for (let i = 0; i < A.length; i++) {
      const a = A[i];
      if (a.el === 'O' && !a.h && a.nb.length === 2 && !a.arom && a.nb.every(([j, o]) => o === 1 && A[j].el === 'C' && !carbonyl(j))) {
        const ar = a.nb.filter(([j]) => A[j].arom || A[j].nb.some(([k, o]) => o === 2 && A[k].el === 'C')).length;
        if (ar) { at(1250, 0.85, 'C–O–C asym. (Aryl-/Vinylether)', 18, true); at(1040, 0.6, 'C–O–C sym. (Aryl-/Vinylether)', 16, true); }
        else if (Gr.rings.some(r => r.includes(i) && r.length === 3)) { at(1250, 0.5, 'Epoxid-Ring (sym.)', 10, true); at(850, 0.6, 'Epoxid-Ring', 15, true); }
        else at(1115, 0.9, 'C–O–C asym. (Ether)', 22, true);
      }
    }
    if (g.has('nitro')) { const ar = A.some(a => a.el === 'N' && a.q > 0 && a.nb.some(([j]) => A[j].arom)); at(ar ? 1525 : 1553, 0.9, 'NO₂ asym.', 14); at(ar ? 1348 : 1378, 0.8, 'NO₂ sym.', 14, true); at(ar ? 852 : 880, 0.4, 'C–N (Nitro)', 12, true); }
    if (g.has('sulfonic') || g.has('sulfone') || A.some(a => a.el === 'S' && a.nb.filter(([j, o]) => o === 2 && A[j].el === 'O').length === 2)) { at(1340, 0.85, 'SO₂ asym.', 16, true); at(1155, 0.85, 'SO₂ sym.', 14, true); }
    else if (A.some(a => a.el === 'S' && a.nb.filter(([j, o]) => o === 2 && A[j].el === 'O').length === 1)) at(1050, 0.85, 'S=O (Sulfoxid)', 16, true);
    if (g.has('thiol')) at(2565, 0.25, 'S–H', 10);
    for (let i = 0; i < A.length; i++) {
      const a = A[i];
      if (a.el === 'P') { if (a.nb.some(([j, o]) => o === 2 && A[j].el === 'O')) at(1260, 0.85, 'P=O', 20, true); if (a.nb.some(([j]) => A[j].el === 'O' && A[j].nb.some(([k]) => A[k].el === 'C'))) at(1030, 0.85, 'P–O–C', 25, true); }
    }
    const nF = A.filter(a => a.el === 'F').length;
    if (nF) { const cf3 = A.some(a => a.el === 'C' && a.nb.filter(([j]) => A[j].el === 'F').length === 3); if (cf3) { at(1320, 0.8, 'C–F (CF₃)', 15, true); at(1165, 0.9, 'C–F (CF₃)', 18, true); at(1125, 0.85, 'C–F (CF₃)', 15, true); } else at(A.some(a => a.el === 'F' && A[a.nb[0] ? a.nb[0][0] : 0].arom) ? 1225 : 1100, 0.8, 'C–F', 30, true); }
    if (A.some(a => a.el === 'Cl' && a.nb.length && !carbonyl(a.nb[0][0]))) at(A.some(a => a.el === 'Cl' && a.nb.length && A[a.nb[0][0]].arom) ? 1090 : 730, 0.6, A.some(a => a.el === 'Cl' && a.nb.length && A[a.nb[0][0]].arom) ? 'C–Cl (Aryl, gekoppelt)' : 'C–Cl', 30, true);
    if (A.some(a => a.el === 'Br')) at(600, 0.55, 'C–Br', 30, true);
    if (A.some(a => a.el === 'I')) at(500, 0.5, 'C–I', 25, true);
    if (A.some(a => a.el === 'Si' && a.nb.some(([j]) => A[j].el === 'C' && A[j].h === 3))) { at(1255, 0.8, 'Si–CH₃', 8, true); at(840, 0.8, 'Si–C', 20, true); }
    if (A.some(a => a.el === 'O' && a.h === 2)) { b(3200, 3550, 0.85, 'O–H (Wasser)', 150); at(1640, 0.5, 'H–O–H Deformation', 18); }
    if (A.some(a => a.el === 'C' && a.nb.filter(([j, o]) => o === 2 && A[j].el === 'O').length === 2)) { at(2349, 0.95, 'O=C=O asym.', 10); at(667, 0.6, 'O=C=O Biegung', 8, true); }
    return B.sort((x, y) => y.c - x.c);
  },
  /* ---------------------------------------------------------- IR aus Normalschwingungen (1.54)
   * Einfaches Valenzkraftfeld auf dem 3D-Modell (ChemModels.embed, Å): Bindungsstreckungen (Kraftkonstanten in mdyn/Å
   * nach Bindungsart), Winkelbiegungen, Bewegung aus der Ebene an sp²-Zentren und Torsion um Doppel-/Aromatenbindungen.
   * Hesse-Matrix über die Wilson-B-Matrix (numerische Ableitungen), massengewichtet, Eigenwerte mit Jacobi →
   * Wellenzahlen ν = 1302,8·√λ. Intensität ~ |Dipoländerung|² aus Partialladungen. Zuordnung jeder Schwingung über
   * die potentielle Energie der inneren Koordinaten (z. B. „C=O-Streck“, „C–H-Deform.“, „Ring“). So entsteht ein
   * Fingerprint-Bereich, der zur Struktur gehört – eine Rechnung, keine Messung (typische Abweichung ±50 cm⁻¹). */
  _irCache: new Map(),
  kStretch(A, i, j, o, F) {
    const e1 = A[i].el, e2 = A[j].el, pair = [e1, e2].sort().join('');
    const arom = this._arom && this._arom.has(i) && this._arom.has(j);
    const carbonylC = (k) => A[k].el === 'C' && F.adj[k].some(([x, b]) => b.o === 2 && A[x].el === 'O');
    const H = e1 === 'H' ? j : e2 === 'H' ? i : -1;
    if (H >= 0) {
      const X = A[H];
      if (X.el === 'C') return carbonylC(H) ? 4.15 : F.adj[H].some(([, b]) => b.o === 3) ? 5.85 : X.hyb === 'sp²' ? 5.1 : 4.75;
      if (X.el === 'O') { const acid = F.adj[H].some(([x]) => carbonylC(x)); return acid ? 5.4 : F.adj[H].length <= 1 ? 7.5 : 6.4; }
      if (X.el === 'N') return 6.35;
      if (X.el === 'S') return 4.0;
      if (X.el === 'Si') return 2.9;
      return 4.5;
    }
    if (pair === 'CC') return arom ? 7.1 : o === 3 ? 15.2 : o === 2 ? 9.4 : 4.4;
    if (pair === 'CO') {
      if (o === 2) {
        const c = e1 === 'C' ? i : j, nbs = F.adj[c].filter(([x, b]) => b.o === 1).map(([x]) => A[x].el);
        const conj = F.adj[c].some(([x]) => this._arom.has(x) || F.adj[x].some(([y, b]) => b.o === 2 && A[y].el === 'C'));
        // abgestimmt auf Aceton 1715, Ester 1740, Säure 1710, Amid 1670, Aldehyd 1730 cm⁻¹ (Kopplung mit dem Gerüst eingerechnet)
        const acid = F.adj[c].some(([x, b]) => b.o === 1 && A[x].el === 'O' && F.adj[x].some(([y]) => A[y].el === 'H'));
        let k = nbs.includes('N') ? 9.0 : acid ? 9.9 : nbs.includes('O') ? 10.2 : nbs.includes('H') ? 10.1 : 9.9;
        return conj ? k - 0.45 : k;
      }
      return 5.0;
    }
    if (pair === 'CN') return o === 3 ? 17.4 : o === 2 ? 10.4 : arom ? 6.6 : 5.0;
    if (pair === 'NO') return o === 2 ? 9.5 : 7.5;
    if (pair === 'OS' || pair === 'OP') return o === 2 ? 9.8 : 4.6;
    if (pair === 'CF') return 5.8; if (pair === 'CCl') return 3.3; if (pair === 'BrC') return 2.8; if (pair === 'CI') return 2.3;
    if (pair === 'CS') return o === 2 ? 6.5 : 3.0; if (pair === 'CSi') return 2.9; if (pair === 'OSi') return 4.5; if (pair === 'CP') return 3.2;
    if (pair === 'NN') return o === 3 ? 22 : o === 2 ? 10 : 4.5; if (pair === 'OO') return 3.5; if (pair === 'BF' || pair === 'FP') return 5.0;
    return 4.0;
  },
  irModes(m) {
    if (typeof ChemModels === 'undefined') return null;
    let emb;
    try { emb = ChemModels.embed(m); } catch (e) { return null; }
    const { F, P } = emb, A = F.atoms, n = A.length;
    if (!n || n > 70) return null;
    const key = JSON.stringify(P.map(p => p.map(v => Math.round(v * 100)))) + A.map(a => a.el).join('');
    if (this._irCache.has(key)) return this._irCache.get(key);
    // aromatische Atome (Ringe aus sp²-C/N mit wechselnden Bindungen)
    this._arom = new Set();
    try { for (const r of ChemModels.rings(F)) if (r.length >= 5 && r.length <= 6 && r.every(i => A[i].hyb === 'sp²')) for (const i of r) this._arom.add(i); } catch (e) { /* */ }
    const mass = A.map(a => (CHEM_BY_SYM[a.el] || { mass: 12 }).mass);
    const ics = [];   // { atoms, f(P) → Wert, k, kind, label }
    const d3 = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
    const sub = (p, q) => [p[0] - q[0], p[1] - q[1], p[2] - q[2]];
    const cr = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
    const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    const ang = (p, c, q) => { const u = sub(p, c), v = sub(q, c); return Math.acos(Math.max(-1, Math.min(1, dot(u, v) / (Math.hypot(...u) * Math.hypot(...v) || 1)))); };
    const lab = (i) => A[i].el;
    for (const b of F.bonds) {
      const o = b.o, sym = o === 3 ? '≡' : o === 2 ? '=' : '–';
      const L = this._arom.has(b.a) && this._arom.has(b.b) && A[b.a].el !== 'H' && A[b.b].el !== 'H' ? 'Ring C–C' : [lab(b.a), lab(b.b)].sort((x, y) => (x === 'H') - (y === 'H') || (x === 'C' ? -1 : y === 'C' ? 1 : 0)).join(sym);
      ics.push({ atoms: [b.a, b.b], f: (Q) => d3(Q[0], Q[1]), k: this.kStretch(A, b.a, b.b, o, F), kind: 's', label: L + '-Streck', xh: A[b.a].el === 'H' || A[b.b].el === 'H' ? (A[b.a].el === 'H' ? A[b.b].el : A[b.a].el) : null });
    }
    for (let c = 0; c < n; c++) {
      const nb = F.adj[c].map(([j]) => j);
      for (let x = 0; x < nb.length; x++) for (let y = x + 1; y < nb.length; y++) {
        const i = nb[x], j = nb[y];
        const th = ang(P[i], P[c], P[j]);
        if (th > 2.97) continue;   // linear: Biegung so nicht beschreibbar
        const hh = (A[i].el === 'H') + (A[j].el === 'H');
        const k = hh === 2 ? 0.5 : hh === 1 ? (A[c].el === 'O' || A[c].el === 'N' ? 0.72 : 0.62) : A[c].hyb === 'sp²' ? 1.15 : 1.0;
        ics.push({ atoms: [i, c, j], f: (Q) => ang(Q[0], Q[1], Q[2]), k, kind: 'b', label: hh === 2 ? `H–${lab(c)}–H-Deform.` : hh === 1 ? `${lab(c)}–H-Deform.` : (this._arom.has(c) ? 'Ring-Deform.' : 'Gerüst-Deform.') });
      }
      // aus der Ebene (sp²-Zentrum mit 3 Nachbarn): Abstand des Zentrums von der Ebene der Nachbarn
      if (nb.length === 3 && (A[c].hyb === 'sp²' || this._arom.has(c))) {
        const hasH = nb.some(j => A[j].el === 'H');
        ics.push({ atoms: [c, nb[0], nb[1], nb[2]], f: (Q) => { const nrm = cr(sub(Q[2], Q[1]), sub(Q[3], Q[1])), L = Math.hypot(...nrm) || 1; return dot(sub(Q[0], Q[1]), nrm) / L; }, k: hasH ? (this._arom.has(c) ? 1.45 : 2.0) : 0.9, kind: 'o', label: hasH ? (this._arom.has(c) ? 'Ar–H aus der Ebene' : '=C–H aus der Ebene') : 'aus der Ebene' });
      }
    }
    // Torsion um Doppel- und Aromatenbindungen
    for (const b of F.bonds) {
      if (!(b.o === 2 || (this._arom.has(b.a) && this._arom.has(b.b)))) continue;   // nicht um Dreifachbindungen (linear)
      const i = F.adj[b.a].map(([x]) => x).find(x => x !== b.b), l = F.adj[b.b].map(([x]) => x).find(x => x !== b.a);
      if (i == null || l == null) continue;
      ics.push({ atoms: [i, b.a, b.b, l], f: (Q) => { const b1 = sub(Q[1], Q[0]), b2 = sub(Q[2], Q[1]), b3 = sub(Q[3], Q[2]); const n1 = cr(b1, b2), n2 = cr(b2, b3); const m1 = cr(n1, b2.map(v => v / (Math.hypot(...b2) || 1))); return Math.atan2(dot(m1, n2), dot(n1, n2)); }, k: 0.28, kind: 't', label: 'Torsion' });
    }
    // B-Matrix numerisch, Hesse-Matrix aufbauen
    const N = 3 * n, Hm = new Float64Array(N * N), h = 1e-4;
    const grads = [];
    for (const ic of ics) {
      const Q = ic.atoms.map(i => P[i].slice());
      const v0 = ic.f(Q);
      const g = [];
      for (let a = 0; a < Q.length; a++) for (let x = 0; x < 3; x++) {
        Q[a][x] += h; let vp = ic.f(Q); Q[a][x] -= 2 * h; let vm = ic.f(Q); Q[a][x] += h;
        if (ic.kind === 't') { while (vp - vm > Math.PI) vp -= 2 * Math.PI; while (vm - vp > Math.PI) vm -= 2 * Math.PI; }
        g.push((vp - vm) / (2 * h));
      }
      void v0;
      grads.push(g);
      const at = ic.atoms;
      for (let a = 0; a < at.length; a++) for (let x = 0; x < 3; x++) for (let b2 = 0; b2 < at.length; b2++) for (let y = 0; y < 3; y++) {
        const I = 3 * at[a] + x, J = 3 * at[b2] + y;
        Hm[I * N + J] += ic.k * g[3 * a + x] * g[3 * b2 + y];
      }
    }
    for (let I = 0; I < N; I++) for (let J = 0; J < N; J++) Hm[I * N + J] /= Math.sqrt(mass[Math.floor(I / 3)] * mass[Math.floor(J / 3)]);
    const { val, vec } = this.jacobi(Hm, N);
    const ENV = { H: 2.2, C: 2.55, N: 3.04, O: 3.44, F: 3.98, Cl: 3.16, Br: 2.96, I: 2.66, S: 2.58, P: 2.19, Si: 1.9, B: 2.04, Na: 0.93, K: 0.82, Li: 0.98, Se: 2.55 };
    const en = (i) => ENV[A[i].el] || 2.2;
    const modes = [];
    for (let k = 0; k < N; k++) {
      if (val[k] <= 0) continue;
      let nu = 1302.8 * Math.sqrt(val[k]);
      if (nu < 180 || nu > 4000) continue;
      // Auslenkung (kartesisch), Dipoländerung, Zuordnung (potentielle Energie je innerer Koordinate)
      const x = new Float64Array(N);
      for (let I = 0; I < N; I++) x[I] = vec[I * N + k] / Math.sqrt(mass[Math.floor(I / 3)]);
      // Dipoländerung aus Bindungsdipolen (∝ Elektronegativitätsdifferenz · Bindungsvektor; C=O/C=N/N=O verstärkt):
      // Streckung ändert die Länge, Biegung die Richtung – numerisch entlang der Schwingung
      const dip = (eps) => { const mu = [0, 0, 0]; for (const bb of F.bonds) { const pa = P[bb.a].map((v, c) => v + eps * x[3 * bb.a + c]), pb = P[bb.b].map((v, c) => v + eps * x[3 * bb.b + c]); const de = (en(bb.b) - en(bb.a)) * (bb.o === 2 && (A[bb.a].el !== 'C' || A[bb.b].el !== 'C') ? 1.9 : 1); for (let c = 0; c < 3; c++) mu[c] += de * (pb[c] - pa[c]); } for (let i = 0; i < n; i++) for (let c = 0; c < 3; c++) mu[c] += 0.25 * (A[i].q || 0) * (P[i][c] + eps * x[3 * i + c]); return mu; };
      const mp = dip(0.01), mm = dip(-0.01), dmu = [0, 1, 2].map(c => (mp[c] - mm[c]) / 0.02);
      const inten = dot(dmu, dmu);
      let best = null, bv = 0, tot = 0;
      const ped = ics.map((ic, idx) => { const g = grads[idx]; let ds = 0; ic.atoms.forEach((a, t) => { for (let c = 0; c < 3; c++) ds += g[3 * t + c] * x[3 * a + c]; }); const e = ic.k * ds * ds; tot += e; return e; });
      ped.forEach((e, idx) => { if (e > bv) { bv = e; best = ics[idx]; } });
      // X–H-Streckschwingungen mit H-Brücken: breit (Alkohol, Säure, Amin)
      let w = 9;
      if (best && best.kind === 's' && best.xh === 'O') w = /O–H|H–O/.test(best.label) && nu < 3200 ? 260 : 110;
      if (best && best.kind === 's' && best.xh === 'N') w = 45;
      modes.push({ nu, I: inten, label: best ? best.label.replace('H–', '').replace(/^(.)–H/, '$1–H') : '', share: tot ? bv / tot : 0, w });
    }
    const Im = Math.max(1e-9, ...modes.map(md => md.I));
    for (const md of modes) md.rel = md.I / Im;
    const r = modes.sort((a, b) => b.nu - a.nu);
    this._irCache.set(key, r);
    if (this._irCache.size > 40) this._irCache.delete(this._irCache.keys().next().value);
    return r;
  },
  /* Eigenwerte/-vektoren einer symmetrischen Matrix (zyklisches Jacobi-Verfahren) */
  jacobi(A0, N) {
    const A = Float64Array.from(A0), V = new Float64Array(N * N);
    for (let i = 0; i < N; i++) V[i * N + i] = 1;
    for (let sweep = 0; sweep < 60; sweep++) {
      let off = 0;
      for (let p = 0; p < N; p++) for (let q = p + 1; q < N; q++) off += A[p * N + q] * A[p * N + q];
      if (off < 1e-14) break;
      for (let p = 0; p < N; p++) for (let q = p + 1; q < N; q++) {
        const apq = A[p * N + q];
        if (Math.abs(apq) < 1e-12) continue;
        const app = A[p * N + p], aqq = A[q * N + q];
        const tau = (aqq - app) / (2 * apq), t = Math.sign(tau || 1) / (Math.abs(tau) + Math.sqrt(1 + tau * tau));
        const c = 1 / Math.sqrt(1 + t * t), s = t * c;
        for (let k = 0; k < N; k++) { const akp = A[k * N + p], akq = A[k * N + q]; A[k * N + p] = c * akp - s * akq; A[k * N + q] = s * akp + c * akq; }
        for (let k = 0; k < N; k++) { const apk = A[p * N + k], aqk = A[q * N + k]; A[p * N + k] = c * apk - s * aqk; A[q * N + k] = s * apk + c * aqk; }
        for (let k = 0; k < N; k++) { const vkp = V[k * N + p], vkq = V[k * N + q]; V[k * N + p] = c * vkp - s * vkq; V[k * N + q] = s * vkp + c * vkq; }
      }
    }
    const val = new Float64Array(N);
    for (let i = 0; i < N; i++) val[i] = A[i * N + i];
    return { val, vec: V };
  },
  // Durchlässigkeit aus berechneten Schwingungen (Lorentz, stärkste Bande ≈ 6 % Transmission)
  irCurveModes(modes, nu) {
    let a = 0;
    for (const md of modes) { const d = (nu - md.nu) / md.w; a += md.rel * (md.w > 50 ? 0.7 : 1) / (1 + d * d); }
    return Math.max(0.02, Math.exp(-2.8 * a));
  },
  /* Spektrum (1.54): oberhalb ~1500 cm⁻¹ die typischen Banden der Gruppen (Tabellenwerte, zuverlässig), darunter der
   * Fingerprint aus den berechneten Normalschwingungen (fliessender Übergang 1450–1550 cm⁻¹) */
  irHybrid(B, modes, nu) {
    // 1.55: die kennzeichnenden Tabellen-Banden gelten überall (auch im Fingerprint: C–O, oop-Muster …); die berechneten
    // Normalschwingungen ergänzen unter 1500 cm⁻¹ die Feinstruktur mit halbem Gewicht
    if (!modes || !modes.length) return this.irCurve(B, nu);
    const wM = nu <= 1450 ? 0.5 : nu >= 1550 ? 0 : 0.5 * (1550 - nu) / 100;
    const tG = this.irCurve(B, nu), tM = this.irCurveModes(modes, nu);
    const aG = -Math.log(Math.max(0.02, tG)), aM = -Math.log(tM) * wM;
    return Math.max(0.02, Math.exp(-(aG + aM)));
  },
  // Durchlässigkeit (0–1) bei einer Wellenzahl: jede Bande als Lorentz-Senke
  irCurve(B, nu) {
    let a = 0;
    for (const x of B) { const d = (nu - x.c) / x.w; a += x.s / (1 + d * d); }
    return Math.max(0.02, 1 - Math.min(0.98, a));
  },

  /* ---------------------------------------------------------- NMR */
  // chemisch gleichwertige Atome (Morgan-Verfeinerung der Nachbarschaft)
  classes(A) {
    // Bindungen im Aromaten gleichwertig („a“) – sonst bricht die Kekulé-Form die Symmetrie (Toluol: 5 statt 7 C-Signale)
    const bl = (a, j, o) => a.arom && A[j].arom ? 'a' : String(o);
    let cls = A.map(a => [a.el, a.nb.length, a.h, a.q, a.arom ? 1 : 0, a.nb.map(([j, o]) => bl(a, j, o)).sort().join('')].join('|'));
    for (let it = 0; it < A.length + 2; it++) {
      const sig = A.map((a, i) => cls[i] + '/' + a.nb.map(([j, o]) => bl(a, j, o) + ':' + cls[j]).sort().join(','));
      const ids = new Map(); const nc = sig.map(s => { if (!ids.has(s)) ids.set(s, 'k' + ids.size); return ids.get(s); });
      const before = new Set(cls).size, after = new Set(nc).size;
      cls = nc;
      if (after === before && it > 0) break;
    }
    return cls;
  },
  /* ¹H-NMR (seit 1.54 hochaufgelöst nach der 1. Ordnung):
   *  - chemisch äquivalente H (Symmetrieklassen) = ein Signal; einzigartige H: diastereotope CH₂ neben einem
   *    Stereozentrum und die beiden H einer =CH₂-Gruppe (cis/trans) sind eigene Signale
   *  - Verschiebung: Alkyl nach Shoolery-Inkrementen, Aromaten mit Substituenten-Inkrementen (ortho/meta/para),
   *    Heteroaromaten nach Ringlage, Alkene nach Pascual–Meier–Simon (cis/trans aus der Zeichnung)
   *  - Kopplung 1. Ordnung: jede Gruppe nicht äquivalenter Nachbar-H mit eigener Kopplungskonstante J (³J 7 Hz,
   *    Alken cis 10,5 / trans 17 / geminal 1,5, Aromat ortho 7,8 / meta 1,8, Aldehyd 2,8, geminal diastereotop 14 Hz);
   *    gleiche J (±1 Hz) zusammengefasst → d, t, q …, sonst dd, dt, ddd …; Dacheffekt beim Zeichnen (lines()) */
  ARO_INC: {   // Substituent: [ortho, meta, para] (Benzol 7,26 ppm)
    alkyl: [-0.18, -0.11, -0.21], ch2x: [0, 0, -0.05], vinyl: [0.06, -0.03, -0.1], aryl: [0.37, 0.2, 0.1], cho: [0.56, 0.22, 0.29], cor: [0.62, 0.14, 0.21],
    cooh: [0.85, 0.18, 0.27], coor: [0.71, 0.1, 0.21], conr: [0.61, 0.1, 0.17], cn: [0.36, 0.18, 0.28], oh: [-0.56, -0.12, -0.45], or: [-0.48, -0.09, -0.44],
    ocor: [-0.25, 0.03, -0.13], nh2: [-0.75, -0.25, -0.65], nr2: [-0.66, -0.18, -0.67], nhcor: [0.12, -0.07, -0.28], no2: [0.95, 0.26, 0.38],
    yne: [0.2, 0.05, 0.05], cf3: [0.32, 0.14, 0.2], cocl: [0.84, 0.22, 0.36], nplus: [0.69, 0.36, 0.31],
    f: [-0.26, 0, -0.2], cl: [0.03, -0.02, -0.09], br: [0.18, -0.08, -0.04], i: [0.39, -0.21, 0], sr: [-0.08, -0.1, -0.24], so2: [0.6, 0.25, 0.33],
  },
  ALK_INC: {   // Substituent am Alken: [geminal, cis, trans] (Ethen 5,25 ppm)
    alkyl: [0.45, -0.22, -0.28], ch2x: [0.64, -0.01, -0.02], aryl: [1.38, 0.36, -0.07], vinyl: [1.0, -0.09, -0.23], cooh: [0.97, 1.41, 0.71], coor: [0.8, 1.18, 0.55],
    cho: [1.02, 0.95, 1.17], cor: [1.1, 1.12, 0.87], conr: [1.37, 0.98, 0.46], cn: [0.27, 0.75, 0.55], or: [1.22, -1.07, -1.21], ocor: [2.11, -0.35, -0.64],
    nr2: [0.8, -1.26, -1.21], f: [1.54, -0.4, -1.02], cl: [1.08, 0.18, 0.13], br: [1.07, 0.45, 0.55], i: [1.14, 0.81, 0.88], oh: [1.22, -1.07, -1.21], nh2: [0.8, -1.26, -1.21], sr: [1.11, -0.29, -0.13], no2: [1.87, 1.32, 0.62], so2: [1.55, 1.16, 0.93], nhcor: [2.08, -0.57, -0.72],
  },
  /* Art eines Substituenten (Atom j an Atom i) für die Inkremente */
  subType(A, i, j) {
    const b = A[j];
    const carbonyl = (k) => A[k].el === 'C' && A[k].nb.some(([x, o]) => o === 2 && A[x].el === 'O');
    if (b.el === 'C') {
      if (carbonyl(j)) {
        const o1 = b.nb.filter(([k, o]) => o === 1 && k !== i);
        if (o1.some(([k]) => A[k].el === 'O' && A[k].h)) return 'cooh';
        if (o1.some(([k]) => A[k].el === 'O')) return 'coor';
        if (o1.some(([k]) => A[k].el === 'N')) return 'conr';
        if (o1.some(([k]) => A[k].el === 'Cl' || A[k].el === 'Br')) return 'cocl';
        return b.h ? 'cho' : 'cor';
      }
      if (b.nb.some(([k, o]) => o === 3 && A[k].el === 'N')) return 'cn';
      if (b.nb.some(([, o]) => o === 3)) return 'yne';
      if (b.nb.filter(([k]) => A[k].el === 'F').length >= 2) return 'cf3';
      if (b.arom) return 'aryl';
      if (b.nb.some(([k, o]) => o === 2 && A[k].el === 'C')) return 'vinyl';
      if (b.nb.some(([k]) => k !== i && (/^(O|N|Cl|Br|I|F|S)$/.test(A[k].el) || carbonylAt(A, k) || A[k].nb.some(([x, o]) => o === 3 && x !== j)))) return 'ch2x';
      return 'alkyl';
    }
    if (b.el === 'O') { if (b.h) return 'oh'; if (b.nb.some(([k]) => k !== i && carbonyl(k))) return 'ocor'; return 'or'; }
    if (b.el === 'N') {
      if (b.q > 0 && b.nb.filter(([k]) => A[k].el === 'O').length === 2) return 'no2';
      if (b.nb.some(([k]) => k !== i && carbonyl(k))) return 'nhcor';
      return b.h >= 2 ? 'nh2' : 'nr2';
    }
    if (b.el === 'S') return b.nb.filter(([k, o]) => o === 2 && A[k].el === 'O').length >= 1 ? 'so2' : 'sr';
    return { F: 'f', Cl: 'cl', Br: 'br', I: 'i' }[b.el] || 'alkyl';
  },
  /* Art des Nachbarn j eines sp³-C i (1.55) – Schlüssel für die Inkrement-Tabellen ¹H (ALPHA_H/BETA_H) und ¹³C */
  xType(A, i, j) {
    const b = A[j];
    const carbonyl = (k) => A[k].el === 'C' && A[k].nb.some(([x, o]) => o === 2 && A[x].el === 'O');
    if (b.el === 'C') {
      if (b.arom) return 'ar';
      if (carbonyl(j)) {
        const o1 = b.nb.filter(([k, o]) => o === 1 && k !== i);
        if (o1.some(([k]) => A[k].el === 'O' && A[k].q < 0)) return 'coo';
        if (o1.some(([k]) => A[k].el === 'O' && A[k].h)) return 'cooh';
        if (o1.some(([k]) => A[k].el === 'O')) return 'coor';
        if (o1.some(([k]) => A[k].el === 'N')) return 'conr';
        if (o1.some(([k]) => A[k].el === 'Cl' || A[k].el === 'Br')) return 'cocl';
        if (o1.some(([k]) => A[k].arom)) return 'coar';
        return b.h ? 'cho' : 'cor';
      }
      if (b.nb.some(([k, o]) => o === 3 && A[k].el === 'N')) return 'cn';
      if (b.nb.some(([, o]) => o === 3)) return 'yne';
      if (b.nb.some(([k, o]) => o === 2 && (A[k].el === 'C' || A[k].el === 'N'))) return 'ene';
      return 'alk';
    }
    if (b.el === 'O') {
      if (b.h) return 'oh';
      if (b.q < 0) return 'or';
      const o = b.nb.find(([k]) => k !== i);
      if (!o) return 'or';
      if (carbonyl(o[0])) return A[o[0]].nb.some(([k]) => A[k].arom) ? 'ocoar' : 'ocor';
      if (A[o[0]].el === 'P' || A[o[0]].el === 'S') return 'op';   // Phosphat-/Sulfonat-Ester
      if (A[o[0]].arom || A[o[0]].nb.some(([k, x]) => x === 2 && A[k].el === 'C')) return 'oar';
      return 'or';
    }
    if (b.el === 'N') {
      if (b.q > 0 && b.nb.filter(([k]) => A[k].el === 'O').length === 2) return 'no2';
      if (b.q > 0) return 'nplus';
      if (b.nb.some(([k]) => k !== i && carbonyl(k))) return 'ncor';
      if (b.arom || b.nb.some(([k]) => A[k].arom)) return 'nar';
      if (b.nb.some(([, o]) => o === 2)) return 'ene';
      return b.h >= 2 ? 'nh2' : b.h === 1 ? 'nhr' : 'nr2';
    }
    if (b.el === 'S') { const so = b.nb.filter(([k, o]) => o === 2 && A[k].el === 'O').length; return so >= 2 ? 'so2' : so === 1 ? 'so' : b.h ? 'sh' : 'sr'; }
    return { F: 'f', Cl: 'cl', Br: 'br', I: 'i', Si: 'si', P: 'p', B: 'alk' }[b.el] || 'alk';
  },
  /* ¹H: Inkremente für CH₃/CH₂/CH (Basis 0,88 / 1,25 / 1,55 ppm) nach Curphy–Morrison bzw. Pretsch, an Messwerten
   * (CDCl₃) nachgeprüft: α = Substituent direkt am C, β = am Nachbar-C (tests/chem/nmr-referenz.js) */
  ALPHA_H: {
    alk: [0, 0, 0], ene: [0.82, 0.8, 0.75], yne: [0.9, 0.95, 0.9], ar: [1.47, 1.4, 1.3], cho: [1.32, 1.2, 1.1], cor: [1.27, 1.2, 1.0],
    coar: [1.7, 1.7, 1.9], cooh: [1.2, 1.1, 1.0], coo: [1.0, 0.95, 0.9], coor: [1.15, 1.07, 1.0], conr: [1.1, 1.0, 1.0], cocl: [1.78, 1.65, 1.6],
    cn: [1.12, 1.1, 1.2], oh: [2.5, 2.35, 2.45], or: [2.35, 2.22, 2.05], oar: [2.9, 2.75, 2.95], ocor: [2.77, 2.87, 3.42], ocoar: [3.02, 3.12, 3.6], op: [2.85, 2.95, 3.4],
    nh2: [1.55, 1.45, 1.4], nhr: [1.5, 1.35, 1.35], nr2: [1.35, 1.28, 1.3], nar: [1.95, 1.85, 2.0], ncor: [1.9, 2.0, 2.5], nplus: [2.4, 2.2, 2.0],
    no2: [3.4, 3.12, 3.2], f: [3.35, 3.2, 3.3], cl: [2.17, 2.3, 2.6], br: [1.8, 2.16, 2.65], i: [1.28, 1.95, 2.7], sh: [1.1, 1.3, 1.4],
    sr: [1.22, 1.3, 1.3], so: [1.72, 1.6, 1.5], so2: [1.95, 1.8, 1.7], si: [-0.88, -0.7, -0.6], p: [0.6, 0.6, 0.6],
  },
  BETA_H: { alk: 0, ene: 0.1, yne: 0.15, ar: 0.32, cho: 0.2, cor: 0.15, coar: 0.2, cooh: 0.25, coo: 0.2, coor: 0.2, conr: 0.2, cocl: 0.3, cn: 0.4,
    oh: 0.27, or: 0.3, oar: 0.45, ocor: 0.36, ocoar: 0.45, op: 0.4, nh2: 0.15, nhr: 0.12, nr2: 0.12, nar: 0.25, ncor: 0.25, nplus: 0.4, no2: 0.65,
    f: 0.35, cl: 0.5, br: 0.62, i: 0.78, sh: 0.4, sr: 0.3, so: 0.4, so2: 0.4, si: -0.2, p: 0.3 },
  // Ringgrösse: Cyclopropan stark abgeschirmt, Cyclobutan entschirmt (1.55)
  RING_H: { 3: -1.0, 4: 0.7, 5: 0.27, 6: 0.18 },
  alkH(Gr, i) {
    const { A } = Gr, a = A[i];
    const col = a.h === 3 ? 0 : a.h === 2 ? 1 : 2;
    let d = a.h === 4 ? 0.23 : [0.88, 1.25, 1.55][col];
    const near = [], al = [];
    for (const [j] of a.nb) {
      const t = this.xType(A, i, j);
      const v = (this.ALPHA_H[t] || [0, 0, 0])[col];
      if (v) al.push({ v, t });
      // β: Substituenten am Nachbar-C (nur sp³-C, sonst steckt es im α-Inkrement)
      if (A[j].el === 'C' && t === 'alk') for (const [k] of A[j].nb) { if (k === i) continue; const t2 = this.xType(A, j, k); d += this.BETA_H[t2] || 0; }
    }
    // mehrere α-Substituenten: abnehmende Wirkung (CH₂Cl₂ 5,30, CHCl₃ 7,26), zwei O am selben C (Acetal) noch schwächer
    al.sort((x, y) => y.v - x.v);
    const nO = al.filter(x => /^o/.test(x.t)).length;
    al.forEach((x, k) => { d += x.v * (k === 0 ? 1 : k === 1 ? (nO >= 2 ? 0.55 : 0.8) : 0.45); });
    const NAME = { ene: 'allylisch', yne: 'neben C≡', ar: 'benzylisch', cho: 'neben CHO', cor: 'neben C=O', coar: 'neben Ar–C=O', cooh: 'neben COOH', coo: 'neben COO⁻', coor: 'neben COOR', conr: 'neben CONR', cocl: 'neben COCl', cn: 'neben C≡N',
      oh: 'neben OH', or: 'neben O (Ether)', oar: 'neben O–Ar', ocor: 'neben O–C=O (Ester)', ocoar: 'neben O–C=O (Ester)', op: 'neben O–P/S', nh2: 'neben N', nhr: 'neben N', nr2: 'neben N', nar: 'neben N–Ar', ncor: 'neben N (Amid)', nplus: 'neben N⁺', no2: 'neben NO₂',
      f: 'neben F', cl: 'neben Cl', br: 'neben Br', i: 'neben I', sh: 'neben S', sr: 'neben S', so: 'neben S=O', so2: 'neben SO₂', si: 'neben Si', p: 'neben P' };
    for (const x of al) near.push(NAME[x.t] || '');
    const ring = Gr.rings.filter(r => r.includes(i)).map(r => r.length).sort((x, y) => x - y)[0];
    if (ring && this.RING_H[ring]) d += this.RING_H[ring];
    const env = (a.h === 3 ? 'CH₃' : a.h === 2 ? 'CH₂' : a.h === 4 ? 'CH₄' : 'CH') + (near.length ? ' ' + [...new Set(near.filter(Boolean))].join(', ') : '') + (ring ? ` (${ring}-Ring)` : '');
    return { d: Math.max(-0.5, Math.min(d, 8)), env };
  },
  /* Amid mit zwei gleichen Resten am N: 'Z' (cis zu O) bzw. 'E' für das Atom i, sonst '' (1.55) */
  amideRot(A, cls, i) {
    for (const [n] of A[i].nb) {
      if (A[n].el !== 'N' || A[n].q) continue;
      const co = A[n].nb.find(([k]) => A[k].el === 'C' && A[k].nb.some(([x, o]) => o === 2 && A[x].el === 'O'));
      if (!co) continue;
      const oth = A[n].nb.filter(([k]) => k !== co[0]).map(([k]) => k);
      if (oth.length !== 2 || cls[oth[0]] !== cls[oth[1]]) continue;
      return i === Math.min(...oth) ? 'Z' : 'E';
    }
    return '';
  },
  nmrH(m, Gr) {
    Gr = Gr || this.graph(m);
    const { A } = Gr, cls = this.classes(A);
    const carbonyl = (i) => A[i].el === 'C' && A[i].nb.some(([j, o]) => o === 2 && A[j].el === 'O');
    const esterO = (i) => A[i].el === 'O' && A[i].nb.some(([j]) => carbonyl(j));
    // Koordinaten der Zeichnung (für cis/trans) und Stereozentren (für diastereotope CH₂)
    const pos = new Map(m.atoms.map(a => [a.id, a]));
    const xy = (i) => A[i].src != null ? pos.get(A[i].src) : null;
    let centers = new Set();
    try { centers = new Set(ChemMol.analyze(m).centers.map(c => c.id)); } catch (e) { /* */ }
    const isCenter = (i) => A[i].src != null && centers.has(A[i].src);
    const side = (c1, c2, p) => { const P1 = xy(c1), P2 = xy(c2), Q = xy(p); if (!P1 || !P2 || !Q) return 0; return Math.sign((P2.x - P1.x) * (Q.y - P1.y) - (P2.y - P1.y) * (Q.x - P1.x)); };
    const dblPartner = (i) => { const x = A[i].nb.find(([j, o]) => o === 2 && A[j].el === 'C' && !A[i].arom); return x ? x[0] : -1; };
    /* 1. Protonensätze: { i, n, sub ('' | 'a' | 'b'), hs (Seite bei =CH₂), d, env, broad } */
    const sets = [];
    A.forEach((a, i) => {
      if (!a.h) return;
      let d, env, broad = false;
      const c2 = a.el === 'C' ? dblPartner(i) : -1;
      if (a.el === 'C' && carbonyl(i)) {
        // Formyl-H: an N/O (DMF, Formiat) 8,05; aromatisch 9,95; α,β-ungesättigt 9,55; aliphatisch 9,77
        const het = a.nb.some(([j, o]) => o === 1 && (A[j].el === 'N' || A[j].el === 'O'));
        const ar = a.nb.some(([j]) => A[j].arom), conj = a.nb.some(([j]) => A[j].el === 'C' && A[j].nb.some(([k, o]) => o === 2 && A[k].el === 'C'));
        d = het ? 8.05 : ar ? 9.97 : conj ? 9.55 : 9.77; env = het ? 'Formyl-H (an N/O)' : 'Aldehyd-H';
      }
      else if (a.el === 'C' && a.arom) { const r = this.aroShift(Gr, i); d = r.d; env = r.env; }
      else if (a.el === 'C' && a.nb.some(([, o]) => o === 3)) {
        const c2 = a.nb.find(([, o]) => o === 3)[0], R = A[c2].nb.find(([k]) => k !== i);
        const t = R ? this.xType(A, c2, R[0]) : 'alk';
        d = t === 'ar' ? 3.06 : /^co/.test(t) || t === 'cho' ? 2.9 : t === 'ene' ? 2.85 : 1.93; env = 'Alkin-H (≡C–H)';
      }
      else if (a.el === 'C' && c2 >= 0) {
        // Alken: Pascual–Meier–Simon, für =CH₂ beide H einzeln
        const gem = a.nb.filter(([j]) => j !== c2).map(([j]) => j), oth = A[c2].nb.filter(([j]) => j !== i).map(([j]) => j);
        const hSides = a.h === 2 ? [1, -1] : [gem.length ? -side(i, c2, gem[0]) || 1 : 1];
        for (let k = 0; k < hSides.length; k++) {
          const hs = hSides[k];
          let dd = 5.25;
          for (const g of gem) dd += (this.ALK_INC[this.subType(A, i, g)] || this.ALK_INC.alkyl)[0];
          for (const t of oth) { const inc = this.ALK_INC[this.subType(A, c2, t)] || this.ALK_INC.alkyl, sd = side(i, c2, t) || -hs; dd += sd === hs ? inc[1] : inc[2]; }
          sets.push({ i, n: 1 * (a.h === 2 ? 1 : a.h), sub: a.h === 2 ? (k ? 'b' : 'a') : '', hs, d: dd, env: a.h === 2 ? (k ? '=CH₂ (H trans zu …)' : '=CH₂ (H cis zu …)') : 'Alken-H', broad: false, c2 });
        }
        return;
      }
      else if (a.el === 'C') {
        const r = this.alkH(Gr, i); d = r.d; env = r.env;
        // gehinderte Amid-Rotation (DMF, DMA): zwei gleiche Reste am Amid-N sind verschieden (cis/trans zu O) → zwei Signale
        const rot = this.amideRot(A, cls, i);
        if (rot) { sets.push({ i, n: a.h, sub: rot, d: d + (rot === 'Z' ? 0.09 : 0), env: env + (rot === 'Z' ? ' (cis zu O, Amid-Rotation gehindert)' : ' (trans zu O)'), broad: false }); return; }
        // diastereotop: CH₂ neben einem Stereozentrum → zwei Signale
        if (a.h === 2 && a.nb.some(([j]) => isCenter(j)) && !isCenter(i)) {
          sets.push({ i, n: 1, sub: 'a', d: d + 0.06, env: env + ' (diastereotop Hₐ)', broad: false, dia: true }, { i, n: 1, sub: 'b', d: d - 0.06, env: env + ' (diastereotop H_b)', broad: false, dia: true });
          return;
        }
      } else if (a.el === 'O') {
        broad = true;
        if (a.nb.some(([j]) => carbonyl(j))) { d = 11.5; env = 'COOH'; }
        else if (a.nb.some(([j]) => A[j].arom)) { d = 5.5; env = 'Phenol-OH'; }
        else if (!a.nb.length) { d = 4.8; env = 'H₂O'; }
        else { d = 2.5; env = 'OH (Lage schwankt 1–5)'; }
      } else if (a.el === 'N') {
        broad = true;
        if (a.arom) { d = 8.0; env = 'NH (Heteroaromat)'; } else if (a.nb.some(([j]) => carbonyl(j))) { d = 6.8; env = 'Amid-NH'; } else if (a.nb.some(([j]) => A[j].arom)) { d = 3.6; env = 'Ar–NH'; } else { d = 1.5; env = 'NH (Lage schwankt)'; }
      } else if (a.el === 'S') { d = 1.5; env = 'SH'; }
      else { d = 1; env = a.el + '–H'; }
      sets.push({ i, n: a.h, sub: '', d, env, broad });
    });
    const keyOf = (st) => cls[st.i] + st.sub;
    /* 2. Kopplungspartner je Satz: Map(Schlüssel → { n, J }) */
    const ringOf = (i) => Gr.aromRings.find(r => r.includes(i) && r.length === 6) || Gr.aromRings.find(r => r.includes(i));
    const partners = (st) => {
      const out = new Map();
      const add = (st2, n, J) => { if (keyOf(st2) === keyOf(st) || !J) return; const k = keyOf(st2) + '|' + J; const o = out.get(k); if (o) o.n += n; else out.set(k, { key: keyOf(st2), n, J, d: st2.d }); };
      if (st.broad) return [];
      const i = st.i, a = A[i];
      const setsAt = (j) => sets.filter(x => x.i === j && !x.broad);
      // geminal (=CH₂ a/b, diastereotop)
      for (const x of setsAt(i)) if (x !== st) add(x, x.n, st.dia ? 14 : 1.5);
      // Kopplung zu ¹⁹F und ³¹P (100 % Häufigkeit, Spin ½): geminal ²J(HF) 47, vicinal ³J(HF) 22, Aromat ortho 8,8 / meta 5,5 Hz;
      // ²J(PH) 13, ³J(POCH) 7 Hz – kein Dacheffekt (heteronuklear)
      const hetero = new Map();
      const addX = (x, J) => { const k = 'X' + cls[x] + '|' + J; const o = hetero.get(k); if (o) { if (!o.at.has(x)) { o.at.add(x); o.n++; } } else hetero.set(k, { key: 'X' + cls[x], n: 1, J, d: st.d + 1000, at: new Set([x]) }); };
      for (const [j] of a.nb) {
        if (A[j].el === 'F') addX(j, a.arom ? 0 : 47);
        if (A[j].el === 'P') addX(j, 13);
        for (const [k] of A[j].nb) { if (k === i) continue; if (A[k].el === 'F') addX(k, a.arom && A[j].arom ? 8.8 : 22); if (A[k].el === 'P' && A[j].el === 'O') addX(k, 7); }
      }
      if (a.arom) { const r = ringOf(i); if (r) { const k0 = r.indexOf(i); r.forEach((v, k) => { const dd = Math.min(Math.abs(k - k0), r.length - Math.abs(k - k0)); if (dd === 2) for (const [f] of A[v].nb) if (A[f].el === 'F') addX(f, 5.5); }); } }
      for (const h of hetero.values()) if (h.J) { const k = h.key + '|' + h.J; out.set(k, { key: h.key, n: h.n, J: h.J, d: h.d }); }
      if (a.arom) {
        const r = ringOf(i);
        if (r) {
          const k0 = r.indexOf(i), L = r.length;
          const het = r.filter(v => A[v].el !== 'C'), hetEl = het.length ? A[het[0]].el : '';
          const isAlpha = (v) => A[v].nb.some(([w]) => r.includes(w) && A[w].el !== 'C');
          for (let k = 0; k < L; k++) {
            const dist = Math.min(Math.abs(k - k0), L - Math.abs(k - k0));
            let J = 0;
            if (L === 6) J = dist === 1 ? (het.length && (isAlpha(i) || isAlpha(r[k])) ? 4.9 : 7.7) : dist === 2 ? 1.8 : 0;
            else if (L === 5) {
              const T = { O: [1.8, 3.4, 0.9, 1.5], S: [4.9, 3.5, 1.0, 2.8], N: [2.6, 3.4, 1.4, 2.0] }[hetEl] || [3.5, 3.5, 1.5, 1.5];
              const both = isAlpha(i) && isAlpha(r[k]);
              J = dist === 1 ? (isAlpha(i) || isAlpha(r[k]) ? T[0] : T[1]) : dist === 2 ? (both ? T[3] : T[2]) : 0;
            }
            if (J) for (const x of setsAt(r[k])) add(x, x.n, J);
          }
        }
        return [...out.values()];
      }
      for (const [j, o] of a.nb) {
        const b = A[j];
        if (b.arom) continue;
        for (const x of setsAt(j)) {
          let J = 7.0;
          if (o === 2 && st.c2 === j) J = (st.hs != null && x.hs != null) ? (st.hs === x.hs ? 10.5 : 17) : 10.5;   // cis / trans
          else if (carbonyl(i) || carbonyl(j)) J = (A[carbonyl(i) ? j : i].h === 3 ? 2.9 : 1.8);   // CHO–CH₃ 2,9, CHO–CH₂ 1,5–2
          else if (st.c2 != null || x.c2 != null) J = 6.5;
          add(x, x.n, J);
        }
      }
      return [...out.values()];
    };
    /* 3. Signale: gleiche Schlüssel zusammen, Gruppen mit gleichem J (±1 Hz) vereinen */
    const sig = new Map();
    for (const st of sets) {
      const k = keyOf(st);
      const s = sig.get(k);
      if (s) { s.n += st.n; s.atoms.push(st.i); continue; }
      let groups = partners(st).sort((x, y) => y.J - x.J);
      const merged = [];
      for (const g of groups) { const f = merged.find(x => Math.abs(x.J - g.J) <= 1.0); if (f) { f.J = (f.J * f.n + g.J * g.n) / (f.n + g.n); f.d = (f.d * f.n + g.d * g.n) / (f.n + g.n); f.n += g.n; } else merged.push({ ...g }); }
      groups = merged.sort((x, y) => y.J - x.J);
      const nLines = groups.reduce((t, g) => t * (g.n + 1), 1);
      let mult = st.broad ? 's (breit)' : !groups.length ? 's' : groups.length === 1 ? this.multName(groups[0].n) : groups.length <= 3 && groups.every(g => g.n <= 3) && nLines <= 24 ? groups.map(g => this.multName(g.n)).join('') : 'm';
      sig.set(k, { d: Math.round(st.d * 100) / 100, n: st.n, mult, split: groups.length === 1 ? groups[0].n : 0, groups: groups.map(g => ({ n: g.n, J: Math.round(g.J * 10) / 10, dp: g.d })), J: groups.map(g => Math.round(g.J * 10) / 10), env: st.env, atoms: [st.i], broad: st.broad, unique: !!(st.dia || st.sub), multi: mult === 'm' });
    }
    const out = [...sig.values()].sort((x, y) => y.d - x.d);
    for (const s of out) s.eq = s.n;   // Anzahl chemisch äquivalenter H in diesem Signal
    return out;
  },
  /* Aromaten-H: Benzol 7,26 + Inkremente aller Substituenten (ortho/meta/para); Heteroaromaten nach Ringlage */
  aroShift(Gr, i) {
    const { A } = Gr;
    const r = Gr.aromRings.find(x => x.includes(i) && x.length === 6) || Gr.aromRings.find(x => x.includes(i));
    if (!r) return { d: 7.3, env: 'aromatisch' };
    const k0 = r.indexOf(i), L = r.length;
    const het = r.map((v, k) => [v, k]).filter(([v]) => A[v].el !== 'C');
    const dist = (k) => Math.min(Math.abs(k - k0), L - Math.abs(k - k0));
    const fused = Gr.aromRings.filter(x => x !== r && x.some(v => r.includes(v))).length;
    if (L === 5 && het.length) {
      const h = A[het[0][0]].el, near = dist(het[0][1]) === 1;
      const tab = { O: [7.4, 6.35], S: [7.3, 7.1], N: [6.7, 6.2] };
      const [al, be] = tab[h] || [7.0, 6.5];
      return { d: near ? al : be, env: (near ? 'α-' : 'β-') + 'H im Fünfring-Heteroaromaten' };
    }
    if (het.length) {
      const k = dist(het[0][1]);
      return { d: k === 1 ? 8.6 : k === 2 ? 7.28 : 7.68, env: (k === 1 ? 'α' : k === 2 ? 'β' : 'γ') + '-H (Pyridin-Typ)' };
    }
    let d = fused ? 7.6 : 7.26;
    const subs = [];
    r.forEach((v, k) => {
      for (const [j] of A[v].nb) {
        if (r.includes(j) || (A[j].arom && Gr.aromRings.some(x => x !== r && x.includes(j) && x.includes(v)))) continue;
        const t = this.subType(A, v, j), inc = this.ARO_INC[t];
        const dd = dist(k);
        if (inc && dd >= 1 && dd <= 3) { d += inc[dd - 1]; subs.push(t); }
      }
    });
    return { d, env: 'aromatisch' + (subs.length ? ' (' + [...new Set(subs)].join(', ') + ')' : '') + (fused ? ', kondensiert' : '') };
  },
  /* Linien eines ¹H-Signals bei MHz: Aufspaltung 1. Ordnung, Intensitäten mit Dacheffekt (Linien zum Partner hin
   * höher: Faktor 1 ± J/√(Δν² + J²)). → [{ o: Versatz in ppm, w: Höhe }] */
  lines(s, MHz = 400) {
    let L = [{ o: 0, w: 1 }];
    for (const g of s.groups || []) {
      const co = [1]; for (let k = 0; k < g.n; k++) { for (let q = co.length - 1; q > 0; q--) co[q] += co[q - 1]; co.push(1); }
      const tot = co.reduce((a, b) => a + b, 0);
      const dnu = ((g.dp != null ? g.dp : s.d) - s.d) * MHz, sgn = Math.sign(dnu) || 1;
      const roof = Math.min(0.95, g.J / Math.sqrt(dnu * dnu + g.J * g.J));
      const nl = [];
      for (const l of L) co.forEach((c, k) => {
        const pos = g.n ? (k - g.n / 2) / (g.n / 2) : 0;
        nl.push({ o: l.o + (k - g.n / 2) * g.J / MHz, w: l.w * c / tot * (1 + roof * pos * sgn) });
      });
      L = nl;
    }
    // zusammenfallende Linien vereinen
    L.sort((a, b) => a.o - b.o);
    const out = [];
    for (const l of L) { const p = out[out.length - 1]; if (p && Math.abs(p.o - l.o) < 1e-6) p.w += l.w; else out.push({ ...l }); }
    const tot = out.reduce((a, b) => a + b.w, 0) || 1;
    return out.map(l => ({ o: l.o, w: l.w / tot * s.n }));
  },
  multName(n) { return ['s', 'd', 't', 'q', 'quint', 'sext', 'sept'][n] || 'm'; },
  /* ¹³C-NMR (1.55 überarbeitet, an Messwerten in CDCl₃ geprüft – tests/chem/nmr-referenz.js):
   *  - sp³-C: Grant–Paul (−2,3 + Σ α/β/γ/δ-Beiträge der Atome nach Abstand) mit eigenen Werten für O/N/S/Halogene und
   *    für Gruppen-C (C=O, C≡N, Aryl, Alken), Verzweigungs-Korrekturen und Ringgrösse
   *  - Aromaten: Benzol 128,5 + Substituenten-Inkremente ipso/ortho/meta/para (Pretsch/wiredchemist); Naphthalin,
   *    Pyridin, Furan, Thiophen, Pyrrol mit eigenen Grundwerten
   *  - Alkene: 123,3 + α/β/γ- und α′/β′/γ′-Inkremente bzw. Gruppen-Inkremente (Ph, C=O, OR, Cl …)
   *  - C=O, C≡N, C≡C nach Art und Umgebung; Amide mit zwei gleichen N-Resten zeigen zwei Signale (Rotation gehindert)
   *  - Höhe: quartäre C ohne H kleiner (kein NOE, lange Relaxation) */
  C13_ARO: {   // [ipso, ortho, meta, para]
    me: [8.9, 0.7, -0.1, -2.9], et: [15.6, -0.4, 0, -2.6], ipr: [20.2, -2.5, 0.1, -2.4], tbu: [22.0, -3.4, -0.4, -3.1], ch2x: [12.4, -1.2, 0.2, -1.1],
    vinyl: [9.5, -2.0, 0.2, -0.5], aryl: [13.1, -1.1, 0.4, -0.2], yne: [-6.1, 3.8, 0.4, -0.2], cf3: [2.6, -3.3, -0.3, 3.2], oh: [26.9, -12.7, 1.4, -7.3],
    or: [31.4, -14.4, 1.0, -7.7], ocor: [22.4, -7.1, -0.4, -3.2], oar: [27.6, -11.2, -0.3, -6.9], cho: [9.0, 1.2, 1.2, 6.0], cooh: [2.1, 1.5, 0, 5.1], coo: [7.6, 0.8, 0, 2.8],
    coor: [2.0, 1.2, -0.1, 4.3], cor: [9.1, 0.1, 0, 4.2], coar: [9.4, 1.7, -0.2, 3.6], conr: [5.0, -1.2, 0.1, 3.4], cocl: [4.7, 2.9, 0.6, 7.0], cn: [-15.4, 3.6, 0.6, 3.9],
    nh2: [18.0, -13.3, 0.9, -9.8], nhr: [21.4, -16.2, 0.8, -11.6], nr2: [22.6, -15.6, 1.0, -11.5], nhcor: [11.1, -9.9, 0.2, -5.6], nplus: [19.9, -7.4, 1.4, 1.4],
    no2: [20.0, -4.8, 0.9, 5.8], f: [34.8, -12.9, 1.4, -4.5], cl: [6.2, 0.4, 1.3, -1.9], br: [-5.5, 3.4, 1.7, -1.6], i: [-32.0, 10.2, 2.9, 1.0],
    sr: [10.2, -1.8, 0.4, -3.6], sh: [2.1, 0.7, 0.3, -3.2], so2: [15.6, -1.7, 1.2, 5.6], so: [17.6, -5.0, 1.1, 2.4], si: [13.4, 4.4, -1.1, -1.1], p: [8.7, 5.1, -0.1, 0.4],
  },
  // Substituent am Aromaten (Atom j am Ringatom v) → Schlüssel für C13_ARO
  aroSub13(A, v, j) {
    const t = this.subType(A, v, j), b = A[j];
    if (t === 'alkyl') { const c = b.nb.filter(([k]) => k !== v && A[k].el !== 'H').length; return b.el === 'C' ? ['me', 'et', 'ipr', 'tbu'][Math.min(3, c)] : b.el === 'Si' ? 'si' : b.el === 'P' ? 'p' : 'me'; }
    if (t === 'or') { const o = b.nb.find(([k]) => k !== v); return o && A[o[0]].arom ? 'oar' : 'or'; }
    if (t === 'nh2' || t === 'nr2') return b.h >= 2 ? 'nh2' : b.h === 1 ? 'nhr' : 'nr2';
    if (t === 'cooh' && b.nb.some(([k]) => A[k].el === 'O' && A[k].q < 0)) return 'coo';
    if (t === 'cor' && b.nb.some(([k]) => k !== v && A[k].arom)) return 'coar';
    if (t === 'sr' && b.h) return 'sh';
    if (t === 'so2') return b.nb.filter(([k, o]) => o === 2 && A[k].el === 'O').length >= 2 ? 'so2' : 'so';
    if (b.el === 'N' && b.q > 0 && t !== 'no2') return 'nplus';
    return t;
  },
  // sp³-C: Beiträge je Abstand [α, β, γ] für Heteroatome (nach Art) und Gruppen-C
  C13_X: {
    oh: [49, 10.1, -6.2], or: [52.2, 9.0, -5.5], oar: [48.0, 9.0, -5.0], ocor: [44.3, 7.0, -6.0], ocoar: [44.5, 7.0, -6.0], op: [56.9, 7.0, -5.0],
    nh2: [30, 11.3, -5.1], nhr: [27.5, 9.0, -4.8], nr2: [26, 7.0, -4.6], nar: [24, 8, -4.5], ncor: [19.2, 8.0, -4.5], nplus: [30.7, 5.4, -7.2], no2: [63.5, 3.1, -4.6],
    f: [70.1, 7.8, -6.8], cl: [31.0, 10.0, -5.1], br: [19.8, 10.6, -3.8], i: [-6.0, 11.0, -1.5], sh: [10.6, 11.4, -3.6], sr: [11.0, 9.0, -3.0], so: [33.9, 6.5, -3.0], so2: [35.5, 6.5, -3.0],
    si: [2.5, 2.7, -0.5], p: [10, 2, -2],
    ene: [20.5, 6.9, -2.1], yne: [4.4, 5.6, -3.4], ar: [23.0, 9.3, -2.6], cho: [30.5, -0.6, -2.7], cor: [31.0, 1.5, -2.8], coar: [28.9, 1.5, -2.8], cooh: [22.0, 2.0, -2.8],
    coo: [25.5, 3.5, -2.5], coor: [22.6, 2.0, -2.8], conr: [22.5, 2.6, -3.2], cocl: [33.1, 2.3, -3.6], cn: [3.6, 2.4, -3.3],
  },
  C13_ENE: {   // Substituent am Alken-C: [eigenes C, anderes C]
    ar: [12.5, -11.0], cho: [13.1, 12.7], cor: [13.8, 4.7], coar: [13.8, 4.7], cooh: [5.0, 9.8], coo: [8, 2], coor: [6.3, 7.0], conr: [9, 5], cocl: [8.1, 14.0], cn: [-15.1, 14.2],
    or: [29.4, -38.9], oh: [29.4, -38.9], oar: [28, -30], ocor: [18.4, -26.7], ocoar: [18.4, -26.7], nr2: [28, -32], nh2: [28, -32], nhr: [28, -32], ncor: [6.5, -29.2], nar: [28, -32],
    f: [24.9, -34.3], cl: [2.8, -6.1], br: [-8.6, -0.9], i: [-38.1, 7.0], ene: [13.6, -7.0], yne: [-13.9, 4.4], no2: [22.3, -0.9], sr: [9.0, -12.9], so2: [14, 5], si: [16.9, 6.7],
  },
  nmrC(m, Gr) {
    Gr = Gr || this.graph(m);
    const { A } = Gr, cls = this.classes(A);
    const carbonyl = (i) => A[i].el === 'C' && A[i].nb.some(([j, o]) => o === 2 && A[j].el === 'O');
    const heavyDeg = (i) => A[i].nb.length;
    const isGroupC = (i) => A[i].el === 'C' && (A[i].arom || A[i].nb.some(([, o]) => o >= 2));
    const sig = new Map();
    A.forEach((a, i) => {
      if (a.el !== 'C') return;
      let d, env;
      const nb = a.nb.map(([j, o]) => ({ j, o, b: A[j] }));
      if (carbonyl(i)) ({ d, env } = this.c13Carbonyl(A, i));
      else if (nb.some(x => x.o === 3)) {
        const n3 = nb.find(x => x.o === 3);
        if (n3.b.el === 'N') { const R = nb.find(x => x.o !== 3); const t = R ? this.xType(A, i, R.j) : 'alk'; d = t === 'ar' ? 118.8 : !R ? 112 : (R.b.el === 'C' && R.b.nb.length > 1 ? 120.5 : 116.6); env = 'Nitril C≡N'; }
        else {
          const R = nb.find(x => x.o !== 3);
          if (!R) { const R2 = A[n3.j].nb.find(([k]) => k !== i); const t2 = R2 ? this.xType(A, n3.j, R2[0]) : 'alk'; d = t2 === 'ar' ? 77.2 : /^co/.test(t2) ? 75 : 68.3; env = 'Alkin ≡CH'; }
          else { const t = this.xType(A, i, R.j); d = t === 'ar' ? 83.7 + (A[n3.j].h ? 0 : 6) : /^co/.test(t) ? 75 : 74.6 + 5.0 * Math.min(2, R.b.nb.length - 1) + (A[n3.j].h ? 0 : 0); if (A[n3.j].h && t !== 'ar') d = 84.6 - (R.b.nb.length <= 1 ? 4.5 : 0); env = 'Alkin ≡C–R'; }
        }
      } else if (a.arom) ({ d, env } = this.c13Aro(Gr, i));
      else if (nb.some(x => x.o === 2 && (x.b.el === 'C' || x.b.el === 'N'))) ({ d, env } = this.c13Ene(A, i));
      else ({ d, env } = this.c13Sp3(Gr, i, isGroupC, heavyDeg));
      const rot = this.amideRot(A, cls, i);
      if (rot) { d += rot === 'Z' ? 5.0 : 0; env += rot === 'Z' ? ' (cis zu O)' : ' (trans zu O)'; }
      const key = cls[i] + rot;
      const s = sig.get(key);
      if (s) { s.n++; s.atoms.push(i); } else sig.set(key, { d: Math.round(d * 10) / 10, n: 1, env, atoms: [i], h: a.h, q: !a.h });
    });
    return [...sig.values()].sort((x, y) => y.d - x.d);
  },
  c13Carbonyl(A, i) {
    const a = A[i], nb = a.nb.filter(([j, o]) => !(o === 2 && A[j].el === 'O')).map(([j]) => j);
    const el = (j) => A[j].el;
    const conjAr = nb.some(j => A[j].arom), conjEn = nb.some(j => A[j].el === 'C' && !A[j].arom && A[j].nb.some(([k, o]) => o === 2 && A[k].el === 'C'));
    // Verzweigung am α-C erhöht die Verschiebung (Aceton 206,6 → Butanon 209,3 → Cyclohexanon 211,9)
    const alphaHeavy = nb.filter(j => A[j].el === 'C' && !A[j].arom).reduce((t, j) => t + Math.min(2, A[j].nb.length - 1), 0);
    const O = nb.filter(j => el(j) === 'O'), N = nb.filter(j => el(j) === 'N');
    if (O.length === 2) return { d: 155.0, env: 'Carbonat C=O' };
    if (O.length && N.length) return { d: 156.5, env: 'Carbamat C=O' };
    if (N.length === 2) return { d: 158.5, env: 'Harnstoff C=O' };
    if (O.length) {
      const oo = A[O[0]];
      if (oo.q < 0) return { d: 177.5 + (conjAr ? -6 : 0), env: 'Carboxylat COO⁻' };
      if (oo.h) return { d: conjAr ? 172.0 : conjEn ? 171.5 : 177.5 + 2.0 * Math.min(2, alphaHeavy), env: 'Carbonsäure C=O' };
      const other = oo.nb.find(([k]) => k !== i);
      const anh = other && A[other[0]].el === 'C' && A[other[0]].nb.some(([x, o]) => o === 2 && A[x].el === 'O');
      if (anh) return { d: conjAr ? 162.5 : 166.8, env: 'Anhydrid C=O' };
      if (!nb.some(j => el(j) === 'C')) return { d: 161.0, env: 'Formiat C=O' };
      const arO = other && A[other[0]].arom;
      return { d: (conjAr ? 166.5 : conjEn ? 166.5 : 171.0 + 1.7 * Math.min(2, alphaHeavy)) - (arO ? 1.6 : 0), env: 'Ester C=O' };
    }
    if (N.length) {
      if (!nb.some(j => el(j) === 'C')) return { d: 162.6, env: 'Formamid C=O' };
      const nAr = A[N[0]].nb.some(([k]) => A[k].arom);
      return { d: conjAr ? 168.0 : (nAr ? 168.5 : 170.5) + 1.8 * Math.min(2, alphaHeavy), env: 'Amid C=O' };
    }
    if (nb.some(j => el(j) === 'Cl' || el(j) === 'Br')) return { d: conjAr ? 168.6 : 170.4 + 2 * Math.min(2, alphaHeavy), env: 'Säurechlorid C=O' };
    if (a.h) return { d: conjAr ? 192.2 : conjEn ? 193.8 : 200.5 + 2.3 * Math.min(2, alphaHeavy), env: 'Aldehyd C=O' };
    const nAr = nb.filter(j => A[j].arom).length;
    if (nAr === 2) return { d: 196.7, env: 'Diarylketon C=O' };
    if (nAr === 1) return { d: 198.1 + 2.5 * Math.min(2, alphaHeavy), env: 'Arylketon C=O' };
    if (conjEn) return { d: 198.6 + 1.2 * Math.min(2, alphaHeavy), env: 'α,β-ungesättigtes Keton C=O' };
    return { d: 206.6 + 2.65 * Math.min(3, alphaHeavy), env: 'Keton C=O' };
  },
  c13Aro(Gr, i) {
    const { A } = Gr;
    const rings = Gr.aromRings.filter(r => r.includes(i));
    const r = rings.find(x => x.length === 6) || rings[0];
    if (!r) return { d: 128.5, env: 'aromatisch' };
    const fusion = Gr.aromRings.filter(x => x.includes(i)).length > 1;
    const L = r.length, k0 = r.indexOf(i);
    const dist = (k) => Math.min(Math.abs(k - k0), L - Math.abs(k - k0));
    const het = r.map((v, k) => [v, k]).filter(([v]) => A[v].el !== 'C');
    let d, env;
    if (L === 5 && het.length) {
      const h = A[het[0][0]].el, near = dist(het[0][1]) === 1;
      const tab = { O: [142.8, 109.7], S: [125.6, 127.3], N: [118.2, 108.0] };
      d = (tab[h] || [125, 110])[near ? 0 : 1];
      if (fusion) d = h === 'N' ? (near ? 136 : 128) : h === 'O' ? (near ? 155 : 127.5) : (near ? 139.7 : 139.6);
      env = (near ? 'α' : 'β') + '-C im Fünfring-Heteroaromaten';
    } else if (het.length) {
      const k = dist(het[0][1]);
      d = [0, 149.9, 123.7, 135.9][k] || 128; env = (k === 1 ? 'α' : k === 2 ? 'β' : 'γ') + '-C (Pyridin-Typ)';
      if (het.length >= 2) d += k === 1 ? 7 : -2;
    } else if (fusion) { d = 133.5; env = 'Ring-Verknüpfung (kondensiert)'; }
    else {
      const fusedNb = r.some(v => v !== i && Gr.aromRings.filter(x => x.includes(v)).length > 1);
      if (fusedNb) { const nf = A[i].nb.some(([j]) => Gr.aromRings.filter(x => x.includes(j)).length > 1); d = nf ? 128.0 : 125.9; env = nf ? 'α-C (Naphthalin-Typ)' : 'β-C (Naphthalin-Typ)'; }
      else { d = 128.5; env = 'aromatisch'; }
    }
    // Substituenten aller Ringatome: ipso/ortho/meta/para
    const subs = [];
    r.forEach((v, k) => {
      for (const [j] of A[v].nb) {
        if (r.includes(j) || (A[j].arom && Gr.aromRings.some(x => x !== r && x.includes(j) && x.includes(v)))) continue;
        const t = this.aroSub13(A, v, j), inc = this.C13_ARO[t];
        if (!inc) continue;
        const dd = dist(k);
        if (dd <= 3) { d += inc[dd] * (L === 6 ? 1 : 0.7); if (dd === 0) subs.push(t); }
      }
    });
    const T = { oh: 'OH', or: 'OR', oar: 'OAr', ocor: 'OC(O)R', nh2: 'NH₂', nhr: 'NHR', nr2: 'NR₂', nhcor: 'NHC(O)R', no2: 'NO₂', f: 'F', cl: 'Cl', br: 'Br', i: 'I', cn: 'CN', cho: 'CHO', cooh: 'COOH', coor: 'COOR', cor: 'C(O)R', coar: 'C(O)Ar', conr: 'CONR₂', me: 'CH₃', et: 'Alkyl', ipr: 'Alkyl', tbu: 'Alkyl', aryl: 'Aryl', vinyl: 'Vinyl', cf3: 'CF₃', ch2x: 'CH₂X', yne: 'C≡C', so2: 'SO₂', sr: 'SR' };
    if (subs.length) env = `aromatisch, ipso (${subs.map(t => T[t] || t).join(', ')})`;
    else if (env === 'aromatisch') env = 'aromatisch CH';
    return { d, env };
  },
  c13Ene(A, i) {
    const a = A[i];
    const dbl = a.nb.find(([j, o]) => o === 2);
    if (A[dbl[0]].el === 'N') {   // Imin C=N
      return { d: 160 + (a.h ? 0 : 6), env: 'Imin C=N' };
    }
    const c2 = dbl[0];
    let d = 123.3;
    // Alkyl-Beiträge entlang der Ketten (α, β, γ) für eigene Seite und andere Seite (α′, β′, γ′)
    const chain = (start, from, w) => {
      let t = 0;
      for (const [j] of A[start].nb) {
        if (j === from) continue;
        const ty = this.xType(A, start, j);
        if (ty === 'alk' && A[j].el === 'C') {
          t += w[0];
          for (const [k] of A[j].nb) { if (k === start) continue; const t2 = this.xType(A, j, k); t += t2 === 'alk' ? w[1] : w[1] * 0.6; for (const [l] of A[k].nb) if (l !== j && A[l].el !== 'H') t += w[2]; }
        } else {
          const inc = this.C13_ENE[ty] || this.C13_ENE[ty === 'nh2' ? 'nr2' : 'ene'];
          if (inc) t += w === W1 ? inc[0] : inc[1];
        }
      }
      return t;
    };
    const W1 = [10.6, 7.2, -1.5], W2 = [-7.9, -1.8, 1.5];
    d += chain(i, c2, W1) + chain(c2, i, W2);
    // Enol-Ether/Enamin-Ketten wurden über C13_ENE abgedeckt; Ringe (Cyclohexen 127,3) nahe genug
    return { d, env: a.h === 2 ? 'Alken =CH₂' : a.h === 1 ? 'Alken =CH' : 'Alken =C<' };
  },
  c13Sp3(Gr, i, isGroupC, heavyDeg) {
    const { A } = Gr, a = A[i];
    let d = -2.3;
    // Breitensuche: α/β/γ/δ-Atome; Gruppen-C (C=O, Aryl, Alken, Nitril) zählen als Ganzes und werden nicht weiter verfolgt
    const seen = new Map([[i, 0]]);
    let front = [i];
    const hetAlpha = [];
    for (let dist = 1; dist <= 4 && front.length; dist++) {
      const nx = [];
      for (const v of front) {
        if (v !== i && isGroupC(v)) continue;
        for (const [w] of A[v].nb) {
          if (seen.has(w)) continue;
          seen.set(w, dist);
          // Atom w im Abstand dist: Beitrag
          let c;
          if (A[w].el === 'C' && !isGroupC(w)) c = [9.1, 9.4, -2.5, 0.3][dist - 1];
          else if (A[w].el === 'C') {
            if (dist >= 2 && seen.get(v) >= 1 && A[v].el !== 'C') c = [9.1, 9.4, -2.5, 0.3][dist - 1];   // Gruppen-C hinter einem Heteroatom (Ester-O–C=O)
            else { const t = this.xType(A, v, w); const inc = this.C13_X[t]; c = inc ? (dist <= 3 ? inc[dist - 1] : 0) : [9.1, 9.4, -2.5, 0.3][dist - 1]; }
          } else if (A[w].el === 'H') c = 0;
          else {
            const t = this.xType(A, v, w);
            const inc = this.C13_X[t] || [20, 9, -3];
            c = dist <= 3 ? inc[dist - 1] : 0;
            if (dist === 1) hetAlpha.push(c);
            else if (dist >= 2 && A[v].el !== 'C') c = 0;   // Heteroatom hinter Heteroatom (z. B. O von NO₂) steckt im α-Wert
          }
          nx.push(w);
          if (dist === 1 && A[w].el !== 'C') continue;   // α-Heteroatome unten mit abnehmender Wirkung
          if (dist === 1 && isGroupC(w)) { hetAlpha.push(c); continue; }   // Gruppen-C ebenso (CH mit Aryl und COOH)
          d += c;
        }
      }
      front = nx;
    }
    // mehrere Heteroatome am selben C: abnehmend (CH₂Cl₂ 53,8; CHCl₃ 77,2; Acetale)
    const nO = a.nb.filter(([w]) => A[w].el === 'O').length;
    hetAlpha.sort((x, y) => y - x).forEach((c, k) => { d += c * (k === 0 ? 1 : k === 1 ? (nO >= 2 ? 0.7 : 0.81) : 0.77); });
    // Verzweigungs-Korrekturen (Grant–Paul) nach Zahl der schweren Nachbarn
    const deg = heavyDeg(i);
    const CORR = { '1-3': -1.1, '1-4': -3.4, '2-3': -2.5, '2-4': -7.2, '3-2': -3.7, '3-3': -9.5, '3-4': -15, '4-1': -1.5, '4-2': -8.4, '4-3': -15, '4-4': -25 };
    for (const [w] of a.nb) if (A[w].el === 'C' && !isGroupC(w)) d += CORR[Math.min(4, deg) + '-' + Math.min(4, heavyDeg(w))] || 0;
    // Ringgrösse
    const ring = Gr.rings.filter(r => r.includes(i)).map(r => r.length).sort((x, y) => x - y)[0];
    if (ring) d += { 3: -28, 4: -2.9, 5: -8.9, 6: -5.2 }[ring] ?? -4;
    const near = a.nb.map(([w]) => A[w].el).filter(e => e !== 'C' && e !== 'H');
    const env = ['C (quartär)', 'CH', 'CH₂', 'CH₃', 'CH₄'][a.h] + (near.includes('O') ? ' neben O' : near.includes('N') ? ' neben N' : near.some(e => /^(Cl|Br|I|F)$/.test(e)) ? ' neben Halogen' : near.includes('S') ? ' neben S' : a.nb.some(([w]) => A[w].arom) ? ' benzylisch' : a.nb.some(([w]) => carbonylAt(A, w)) ? ' neben C=O' : '') + (ring ? ` (${ring}-Ring)` : '');
    return { d: Math.max(-5, Math.min(d, 110)), env };
  },

  /* ---------------------------------------------------------- 3D messen: P = 3D-Koordinaten (Å), ids = Atomnummern */
  measure(P, ids) {
    const v = (a, b) => [P[b][0] - P[a][0], P[b][1] - P[a][1], P[b][2] - P[a][2]];
    const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    const cr = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
    const len = (a) => Math.hypot(...a);
    const deg = (r) => r * 180 / Math.PI;
    if (ids.length === 2) { const d = len(v(ids[0], ids[1])); return { kind: 'Abstand', value: d, text: d.toFixed(3) + ' Å' }; }
    if (ids.length === 3) { const a = v(ids[1], ids[0]), b = v(ids[1], ids[2]); const w = deg(Math.acos(Math.max(-1, Math.min(1, dot(a, b) / (len(a) * len(b) || 1))))); return { kind: 'Winkel', value: w, text: w.toFixed(1) + '°' }; }
    if (ids.length === 4) {
      const b1 = v(ids[0], ids[1]), b2 = v(ids[1], ids[2]), b3 = v(ids[2], ids[3]);
      const n1 = cr(b1, b2), n2 = cr(b2, b3), m1 = cr(n1, b2.map(x => x / (len(b2) || 1)));
      const w = deg(Math.atan2(dot(m1, n2), dot(n1, n2)));
      return { kind: 'Diederwinkel', value: w, text: w.toFixed(1) + '°' };
    }
    return null;
  },

  /* ---------------------------------------------------------- NMR weiterer Kerne (1.53): ¹⁹F, ³¹P, ¹⁵N
   * Verschiebungen grob nach Tabellenwerten (Bezug: ¹⁹F CFCl₃, ³¹P 85 % H₃PO₄, ¹⁵N flüssiges NH₃), ¹H-entkoppelt. */
  NUCLEI: [
    { k: 'H', label: '¹H-NMR', el: 'H', range: [12, -0.5] },
    { k: 'C', label: '¹³C-NMR', el: 'C', range: [220, -5] },
    { k: 'F', label: '¹⁹F-NMR', el: 'F', range: [20, -240] },
    { k: 'P', label: '³¹P-NMR', el: 'P', range: [200, -60] },
    { k: 'N', label: '¹⁵N-NMR', el: 'N', range: [400, -10] },
  ],
  nmr(m, nuc, Gr) {
    Gr = Gr || this.graph(m);
    if (nuc === 'C') return this.nmrC(m, Gr);
    if (nuc === 'F' || nuc === 'P' || nuc === 'N') return this.nmrX(Gr, nuc);
    return this.nmrH(m, Gr);
  },
  /* hat das Molekül Kerne dieser Art? (H: auch implizite) */
  hasNuc(Gr, nuc) { return nuc === 'H' ? Gr.A.some(a => a.h > 0 || a.el === 'H') : Gr.A.some(a => a.el === nuc); },
  nmrX(Gr, nuc) {
    const { A } = Gr, cls = this.classes(A);
    const carbonyl = (i) => A[i].el === 'C' && A[i].nb.some(([j, o]) => o === 2 && A[j].el === 'O');
    const nbEl = (i, e) => A[i].nb.filter(([j]) => A[j].el === e);
    const sig = new Map();
    A.forEach((a, i) => {
      if (a.el !== nuc) return;
      let d = 0, env = '';
      if (nuc === 'F') {
        const [x] = a.nb[0] || [-1];
        const X = A[x];
        if (!X) { d = -120; env = 'Fluorid-Ion'; }
        else if (X.el === 'P') { d = -72; env = 'PF₆⁻ (Dublett, ¹J(P,F) ≈ 710 Hz)'; }
        else if (X.el === 'B') { d = -151; env = 'BF₄⁻'; }
        else if (X.el === 'S') { d = 50; env = 'S–F'; }
        else if (X.el === 'Si') { d = -130; env = 'Si–F'; }
        else if (X.el === 'C') {
          const nF = nbEl(x, 'F').length, other = X.nb.filter(([j]) => A[j].el !== 'F').map(([j]) => j);
          if (carbonyl(x)) { d = 45; env = 'Säurefluorid C(=O)F'; }
          else if (X.arom) { d = -113; env = 'Ar–F'; }
          else if (nF === 3) {
            const y = other[0];
            if (y != null && carbonyl(y)) { d = -76.5; env = 'CF₃–C=O (z. B. TFA)'; }
            else if (y != null && A[y].arom) { d = -63; env = 'Ar–CF₃'; }
            else if (y != null && A[y].el === 'O') { d = -58; env = 'O–CF₃'; }
            else if (y != null && A[y].el === 'C' && A[y].nb.some(([k]) => A[k].el === 'O' || A[k].el === 'N')) { d = -77; env = 'CF₃–CH₂–X'; }
            else { d = -66; env = 'CF₃ (Alkyl)'; }
          } else if (nF === 2) { d = X.h ? -125 : -115; env = X.h ? 'CHF₂' : 'CF₂'; }
          else { d = X.h === 2 ? -220 : X.h === 1 ? -185 : -150; env = X.h === 2 ? 'CH₂F' : X.h === 1 ? 'CHF' : 'C–F (tertiär)'; }
        } else { d = -100; env = X.el + '–F'; }
      } else if (nuc === 'P') {
        const O = a.nb.filter(([j]) => A[j].el === 'O'), dblO = a.nb.some(([j, o]) => o === 2 && A[j].el === 'O');
        const N = nbEl(i, 'N').length, C = nbEl(i, 'C').length, Cl = nbEl(i, 'Cl').length, F = nbEl(i, 'F').length;
        const S = a.nb.some(([j]) => A[j].el === 'S');
        const bridge = O.filter(([j]) => A[j].nb.some(([k]) => k !== i && A[k].el === 'P')).length;
        const val = a.nb.reduce((t, [, o]) => t + o, 0);
        if (F === 6) { d = -144; env = 'PF₆⁻ (Septett, ¹J(P,F) ≈ 710 Hz)'; }
        else if (Cl === 3 && !dblO) { d = 219; env = 'PCl₃'; }
        else if (Cl === 3 && dblO) { d = 2; env = 'POCl₃'; }
        else if (S && val >= 4) { d = 55; env = 'Thiophosphat (P=S / P–S)'; }
        else if (val === 3 && Cl === 1 && N) { d = 180; env = 'Chlorphosphoramidit P(III)'; }
        else if (val === 3 && O.length === 2 && N) { d = 149; env = 'Phosphoramidit P(III) (2 Diastereomere ~149)'; }
        else if (val === 3 && O.length === 3) { d = 140; env = 'Phosphit P(OR)₃'; }
        else if (val === 3 && C === 3) { const ar = a.nb.filter(([j]) => A[j].arom).length; d = ar >= 2 ? -6 : -40; env = ar >= 2 ? 'Arylphosphin (z. B. PPh₃)' : 'Alkylphosphin'; }
        else if (a.q > 0 && N >= 3) { d = 44; env = 'Aminophosphonium (z. B. PyBOP)'; }
        else if (a.q > 0 && C === 4) { d = 23; env = 'Phosphonium R₄P⁺'; }
        else if (dblO && C === 3) { d = 30; env = 'Phosphinoxid R₃P=O'; }
        else if (dblO && C === 1) { d = 25; env = 'Phosphonat'; }
        else if (dblO && N >= 3) { d = 24; env = 'Phosphorsäuretriamid'; }
        else if (dblO && bridge >= 2) { d = -21; env = 'Phosphat, mittleres P (z. B. ATP β)'; }
        else if (dblO && bridge === 1) { d = -10; env = 'Phosphat, Anhydrid-P (z. B. ATP α/γ)'; }
        else if (dblO && O.length >= 4) {
          const est = O.filter(([j]) => A[j].nb.some(([k]) => k !== i && A[k].el === 'C')).length;
          d = est >= 2 ? -1 : est === 1 ? 1 : 0; env = est >= 2 ? 'Phosphodiester (z. B. DNA-Rückgrat)' : est === 1 ? 'Phosphatmonoester' : 'Phosphorsäure/Phosphat';
        } else { d = 10; env = 'P(V)'; }
      } else if (nuc === 'N') {
        const Os = nbEl(i, 'O').length;
        if (a.q > 0 && Os === 2) { d = 370; env = 'Nitro'; }
        else if (a.nb.some(([, o]) => o === 3)) { d = 240; env = 'Nitril'; }
        else if (a.arom && !a.h && a.nb.length === 2) { d = 310; env = 'Pyridin-N (sp², freies Paar in der Ebene)'; }
        else if (a.arom) { d = 160; env = 'Pyrrol-/Imidazol-N–H bzw. N–R im Aromaten'; }
        else if (a.nb.some(([j, o]) => o === 2 && A[j].el === 'C' && A[j].nb.some(([k, p]) => p === 2 && k !== i && A[k].el === 'N'))) { d = 105; env = 'Carbodiimid N=C=N'; }
        else if (a.nb.some(([, o]) => o === 2)) { d = 320; env = 'Imin / Oxim C=N'; }
        else if (a.nb.some(([j]) => A[j].el === 'O' && A[j].h) || (Os && a.nb.some(([j]) => carbonyl(j)))) { d = 200; env = 'N–O (Hydroxylamin-Typ)'; }
        else if (a.nb.some(([j]) => carbonyl(j))) {
          const c = a.nb.find(([j]) => carbonyl(j))[0];
          const urea = A[c].nb.filter(([j]) => A[j].el === 'N').length >= 2, carb = A[c].nb.some(([j, o]) => o === 1 && A[j].el === 'O');
          d = urea ? 80 : carb ? 85 : 120; env = urea ? 'Harnstoff-N' : carb ? 'Carbamat-N (z. B. Boc, Fmoc)' : 'Amid-N';
        }
        else if (a.q > 0) { d = 35; env = 'Ammonium-N'; }
        else if (a.nb.some(([j]) => A[j].arom)) { d = 55; env = 'aromatisches Amin'; }
        else { d = [25, 25, 35, 30][Math.min(3, a.nb.length)]; env = ['Ammoniak/primäres Amin', 'primäres Amin', 'sekundäres Amin', 'tertiäres Amin'][Math.min(3, a.nb.length)]; }
      }
      const key = cls[i];
      const s = sig.get(key);
      if (s) { s.n++; s.atoms.push(i); } else sig.set(key, { d, n: 1, mult: 's', split: 0, env, atoms: [i] });
    });
    return [...sig.values()].sort((x, y) => y.d - x.d);
  },

  /* ---------------------------------------------------------- Diagramme (SVG), seit 1.53 mit Ausschnitt (Zoom)
   * view = { x0, x1 } (Datenwerte, links → rechts; bei IR und NMR fällt die Achse nach rechts ab), y = Höhe × (1–20).
   * Jedes SVG trägt data-Attribute (Ränder, Bereich), damit der Editor Mausrad/Ziehen in Werte umrechnen kann. */
  GEO: { W: 560, l: 44, r: 14, t: 16, b: 34 },
  niceStep(span, n = 8) { const r = Math.abs(span) / n, p = Math.pow(10, Math.floor(Math.log10(r || 1))), m = r / p; return (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * p; },
  fmtTick(v, st) { const dec = Math.max(0, -Math.floor(Math.log10(st) + 1e-9)); return (Math.abs(v) < st / 1e6 ? 0 : v).toFixed(dec).replace('-', '−'); },
  axisX(x0, x1, X, H, b, unit) {
    const st = this.niceStep(x1 - x0);
    let g = '';
    const lo = Math.min(x0, x1), hi = Math.max(x0, x1);
    for (let v = Math.ceil(lo / st) * st; v <= hi + st * 1e-9; v += st) g += `<line x1="${X(v).toFixed(1)}" y1="${H - b}" x2="${X(v).toFixed(1)}" y2="${H - b + 4}" stroke="currentColor"/><text x="${X(v).toFixed(1)}" y="${H - b + 15}" font-size="10" text-anchor="middle" fill="currentColor">${this.fmtTick(v, st)}</text>`;
    return g + `<text x="${(this.GEO.W + this.GEO.l) / 2}" y="${H - 3}" font-size="10" text-anchor="middle" fill="currentColor">${unit}</text>`;
  },
  wrapSvg(H, g, x0, x1, kind) {
    const { W, l, r } = this.GEO;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" class="chem-spec" font-family="Segoe UI, Arial, sans-serif" data-l="${l}" data-r="${r}" data-w="${W}" data-x0="${x0}" data-x1="${x1}" data-kind="${kind}"><defs><clipPath id="spc${kind}"><rect x="${l}" y="0" width="${W - l - r}" height="${H}"/></clipPath></defs>${g}</svg>`;
  },
  svgIR(B, view, modes) {
    const { W, l, r, t, b } = this.GEO, H = 230;
    const x0 = view ? view.x0 : 4000, x1 = view ? view.x1 : 400;
    const X = (nu) => l + (nu - x0) / (x1 - x0) * (W - l - r), Y = (T) => t + (1 - T) * (H - t - b);
    const n = 700;
    let d = '';
    const T = (nu) => this.irHybrid(B, modes, nu);
    for (let k = 0; k <= n; k++) { const nu = x0 + (x1 - x0) * k / n; d += (k ? 'L' : 'M') + X(nu).toFixed(1) + ',' + Y(T(nu)).toFixed(1); }
    let g = `<rect x="${l}" y="${t}" width="${W - l - r}" height="${H - t - b}" fill="none" stroke="currentColor" stroke-opacity=".35"/>` + this.axisX(x0, x1, X, H, b, 'Wellenzahl in cm⁻¹');
    for (const T of [0, 0.5, 1]) g += `<text x="${l - 4}" y="${Y(T) + 3}" font-size="9" text-anchor="end" fill="currentColor">${T * 100}</text>`;
    g += `<text x="10" y="${t + 60}" font-size="10" fill="currentColor" transform="rotate(-90 10 ${t + 60})">Transmission %</text>`;
    g += `<path d="${d}" fill="none" stroke="#c0392b" stroke-width="1.4" clip-path="url(#spcir)"/>`;
    const lo = Math.min(x0, x1), hi = Math.max(x0, x1);
    // Beschriftung (1.55): stärkste Banden zuerst, Textkästen dürfen sich nicht überdecken (sonst etwas tiefer/höher oder weglassen)
    // nur die kennzeichnenden Banden (übersichtlich): Stärke ≥ 0,4, jeder Text einmal, höchstens 9
    const labs = B.filter(x => x.s >= 0.4 && !/Oberton/.test(x.t)).map(x => ({ c: x.c, s: x.s + (/C=O|O–H|N–H|C≡|NO₂|C–O|oop/.test(x.t) ? 0.3 : 0), t: x.t.split(' (')[0] }));
    const boxes = [], seenTxt = new Set();
    let nLab = 0;
    if (lo < 1500) { const fx = X(Math.min(hi, 1490)); g += `<text x="${fx.toFixed(1)}" y="${t + 10}" font-size="8" fill="currentColor" opacity=".55">◀ Fingerprint</text>`; boxes.push({ x0: fx, x1: fx + 48, y0: t + 2, y1: t + 12 }); }
    const seenT = new Set();
    for (const x of labs.sort((p, q) => q.s - p.s)) {
      if (x.c < lo || x.c > hi) continue;
      const key = x.t + '|' + Math.round(x.c / 40);
      if (seenT.has(key)) continue;
      const px = X(x.c), w = x.t.length * 8 * 0.55 + 4;
      const y0 = Math.min(H - b - 6, Math.max(t + 10, Y(T(x.c)) + 12));
      let placed = null;
      for (const dy of [0, 11, -11, 22]) {
        const y = y0 + dy;
        if (y > H - b - 3 || y < t + 8) continue;
        const bx = { x0: px - w / 2, x1: px + w / 2, y0: y - 8, y1: y + 2 };
        if (!boxes.some(q => bx.x0 < q.x1 && bx.x1 > q.x0 && bx.y0 < q.y1 && bx.y1 > q.y0)) { placed = { y, bx }; break; }
      }
      if (!placed || seenTxt.has(x.t) || nLab >= 9) continue;
      boxes.push(placed.bx); seenT.add(key); seenTxt.add(x.t); nLab++;
      g += `<text x="${px.toFixed(1)}" y="${placed.y.toFixed(1)}" font-size="8" text-anchor="middle" fill="currentColor" opacity=".85">${chemEsc(x.t)}</text>`;
    }
    return this.wrapSvg(H, g, x0, x1, 'ir');
  },
  msRange(peaks, frags) { const lo = Math.max(0, Math.min(...peaks.map(p => p.nom), ...frags.map(f => f.mz)) - 10), hi = Math.max(...peaks.map(p => p.nom)) + 6; return [lo, hi]; },
  svgMS(peaks, frags, view, ys = 1) {
    const { W, l, r, t, b } = this.GEO, H = 210;
    const [d0, d1] = this.msRange(peaks, frags);
    const x0 = view ? view.x0 : d0, x1 = view ? view.x1 : d1;
    const X = (mz) => l + (mz - x0) / (x1 - x0 || 1) * (W - l - r), Y = (p) => t + (1 - Math.min(1, p * ys / 100)) * (H - t - b);
    let g = `<line x1="${l}" y1="${H - b}" x2="${W - r}" y2="${H - b}" stroke="currentColor"/><line x1="${l}" y1="${t}" x2="${l}" y2="${H - b}" stroke="currentColor"/>` + this.axisX(x0, x1, X, H, b, 'm/z');
    for (const p of [0, 50, 100]) g += `<text x="${l - 4}" y="${(t + (1 - p / 100) * (H - t - b) + 3).toFixed(1)}" font-size="9" text-anchor="end" fill="currentColor">${+(p / ys).toPrecision(3)}</text>`;
    if (ys > 1) g += `<text x="${l + 4}" y="${t + 10}" font-size="9" fill="currentColor" opacity=".7">Höhe ×${ys}</text>`;
    const narrow = Math.abs(x1 - x0) < 25;
    let inner = '';
    for (const f of frags) inner += `<line x1="${X(f.mz).toFixed(1)}" y1="${H - b}" x2="${X(f.mz).toFixed(1)}" y2="${Y(18 / ys).toFixed(1)}" stroke="currentColor" stroke-opacity=".35" stroke-dasharray="3 2" stroke-width="2"/><text x="${X(f.mz).toFixed(1)}" y="${(Y(18 / ys) - 3).toFixed(1)}" font-size="8.5" text-anchor="middle" fill="currentColor" opacity=".7">${f.mz}</text>`;
    // 1.54: simulierte Bruchstücke (kind 'F') orange, Molekül-Ion blau; Beschriftung nur bei genug Höhe und Abstand
    const sim = peaks.some(p => p.kind), lab = [];
    for (const p of peaks) {
      const col = p.kind === 'F' ? '#e8590c' : '#2f6fd6', x = X(p.nom);
      inner += `<line x1="${x.toFixed(1)}" y1="${H - b}" x2="${x.toFixed(1)}" y2="${Y(p.rel).toFixed(1)}" stroke="${col}" stroke-width="${sim && !narrow ? 2 : 3}"/>`;
      if (p.rel * ys > (sim && !narrow ? 8 : 3)) lab.push({ x, p });
    }
    lab.sort((a2, b2) => b2.p.rel - a2.p.rel);
    const used = [];
    for (const { x, p } of lab) {
      if (used.some(u => Math.abs(u - x) < (narrow ? 60 : 16))) continue;
      used.push(x);
      inner += `<text x="${x.toFixed(1)}" y="${(Y(p.rel) - 3).toFixed(1)}" font-size="9" text-anchor="middle" fill="currentColor">${narrow ? p.m.toFixed(3) + ' (' + p.rel.toFixed(1) + ' %)' : p.nom}</text>`;
    }
    g += `<g clip-path="url(#spcms)">${inner}</g>`;
    return this.wrapSvg(H, g, x0, x1, 'ms');
  },
  nmrRange(sig, nuc) {
    const N = this.NUCLEI.find(x => x.k === nuc) || this.NUCLEI[0];
    let [a, z] = N.range;
    for (const s of sig) { a = Math.max(a, s.d + Math.abs(a - z) * 0.05); z = Math.min(z, s.d - Math.abs(a - z) * 0.05); }
    return [a, z];
  },
  /* Buchstaben der Signale (a = höchste Verschiebung) – gleich in Spektrum, Tabelle und Strukturbild (1.55) */
  nmrLetter(k) { return k < 26 ? 'abcdefghijklmnopqrstuvwxyz'[k] : 'a' + (k - 25); },
  /* Beschriftungen ohne Überlappung verteilen: gewünschte x (Peaks), Breiten w; bei Platzmangel zweite Zeile.
   * Rückgabe je Eintrag { x, row } (1.55) */
  spreadLabels(items, x0, x1, gap = 4) {
    const order = items.map((it, k) => ({ ...it, k })).sort((a, b) => a.x - b.x);
    const total = order.reduce((t, it) => t + it.w + gap, 0);
    const rows = total > (x1 - x0) * 0.95 ? 2 : 1;
    const out = new Array(items.length);
    for (let r = 0; r < rows; r++) {
      const L = order.filter((_, k) => k % rows === r);
      const pos = L.map(it => it.x);
      for (let it = 0; it < 80; it++) {
        let moved = false;
        for (let k = 1; k < L.length; k++) {
          const need = (L[k - 1].w + L[k].w) / 2 + gap, ov = pos[k - 1] + need - pos[k];
          if (ov > 0.01) { pos[k - 1] -= ov / 2; pos[k] += ov / 2; moved = true; }
        }
        for (let k = 0; k < L.length; k++) pos[k] = Math.max(x0 + L[k].w / 2, Math.min(x1 - L[k].w / 2, pos[k]));
        if (!moved) break;
      }
      L.forEach((it, k) => { out[it.k] = { x: pos[k], row: r }; });
    }
    return out;
  },
  /* NMR-Spektrum. o.integral: grüne Integral-Stufen (Standard aus), o.leaders: Zuordnungs-Striche Beschriftung → Peak
   * (Standard an). Jedes Signal bekommt einen Buchstaben; die Beschriftung steht oben in einer eigenen Zeile und
   * wird so verteilt, dass sich nichts überdeckt (1.55). */
  svgNMR(sig, nuc, view, ys = 1, MHz = 400, o = {}) {
    const H1 = nuc === 'H';
    const showInt = !!o.integral, lead = o.leaders !== false;
    const { W, l, r, b } = this.GEO;
    const t = 16 + 40, H = (H1 ? 220 : 200) + 40;   // oben Platz für zwei Beschriftungszeilen
    const [d0, d1] = this.nmrRange(sig, nuc);
    const x0 = view ? view.x0 : d0, x1 = view ? view.x1 : d1;
    const X = (d) => l + (d - x0) / (x1 - x0) * (W - l - r), Y = (p) => t + (1 - Math.min(1, p * ys)) * (H - t - b);
    let g = `<line x1="${l}" y1="${H - b}" x2="${W - r}" y2="${H - b}" stroke="currentColor"/>` + this.axisX(x0, x1, X, H, b, 'δ in ppm' + (H1 ? ` (${MHz} MHz, CDCl₃)` : ' (¹H-entkoppelt, CDCl₃)'));
    if (ys > 1) g += `<text x="${l + 4}" y="${H - b - 6}" font-size="9" fill="currentColor" opacity=".7">Höhe ×${ys}</text>`;
    const lo = Math.min(x0, x1), hi = Math.max(x0, x1);
    const span = hi - lo, fine = H1 && span < 1.5;
    let inner = '';
    const tops = new Map();   // Signal → y der Spitze (für die Striche)
    if (H1 && sig.length && sig[0].groups) {
      // hochaufgelöst (1.54): Lorentz-Linien (Halbwertsbreite 0,8 Hz, breite Signale 15 Hz), Dacheffekt
      const all = [];
      for (const s of sig) { const hw = (s.broad ? 15 : 0.4) / MHz; for (const ln of this.lines(s, MHz)) all.push({ x: s.d + ln.o, w: ln.w, hw, s }); }
      const xs = [];
      const N = 1400;
      for (let k = 0; k <= N; k++) xs.push(lo + span * k / N);
      for (const p of all) if (p.x > lo - p.hw * 6 && p.x < hi + p.hw * 6) for (const f of [-6, -3, -1.5, -0.7, -0.3, 0, 0.3, 0.7, 1.5, 3, 6]) { const v = p.x + f * p.hw; if (v >= lo && v <= hi) xs.push(v); }
      xs.sort((a2, b2) => a2 - b2);
      // nur Linien in der Nähe aufsummieren (schneller bei grossen Molekülen)
      const near = all.filter(p => p.x > lo - p.hw * 400 && p.x < hi + p.hw * 400).sort((p, q) => p.x - q.x);
      const yv = xs.map(x => { let y = 0; for (const p of near) { const dx = (x - p.x) / p.hw; if (dx > 400) continue; if (dx < -400) break; y += p.w * (1 / (1 + dx * dx)) / (p.hw * MHz); } return y; });
      const ymax = Math.max(1e-9, ...yv);
      let dp = '';
      xs.forEach((x, k) => { dp += (k ? 'L' : 'M') + X(x).toFixed(2) + ',' + Y(yv[k] / ymax * 0.92).toFixed(2); });
      inner += `<path d="${dp}" fill="none" stroke="#7048e8" stroke-width="1.1" stroke-linejoin="round"/>`;
      for (const s of sig) {
        const ls = all.filter(p => p.s === s), a2 = Math.min(...ls.map(p => p.x)) - 2 / MHz, b2 = Math.max(...ls.map(p => p.x)) + 2 / MHz;
        let best = 0; xs.forEach((x, k) => { if (x >= a2 && x <= b2 && yv[k] > best) best = yv[k]; });
        tops.set(s, Y(best / ymax * 0.92));
      }
      if (showInt) {
        // Integral (Stufen) – Höhe ~ Anzahl H
        const totH = sig.reduce((a2, s) => a2 + s.n, 0) || 1;
        let acc = 0, ip = `M${X(hi).toFixed(1)},${Y(0.02).toFixed(1)}`;
        for (const s of [...sig].sort((p, q) => q.d - p.d)) {
          if (s.d > hi || s.d < lo) { if (s.d > hi) acc += s.n; continue; }
          const wpx = Math.max(0.02 * span, 0.06);
          ip += `L${X(s.d + wpx).toFixed(1)},${Y(0.02 + 0.5 * acc / totH).toFixed(1)}`;
          acc += s.n;
          ip += `L${X(s.d - wpx).toFixed(1)},${Y(0.02 + 0.5 * acc / totH).toFixed(1)}`;
        }
        ip += `L${X(lo).toFixed(1)},${Y(0.02 + 0.5 * acc / totH).toFixed(1)}`;
        inner += `<path d="${ip}" fill="none" stroke="#2b8a3e" stroke-width="1" opacity=".6"/>`;
      }
    } else {
      // ¹³C & Co.: Strich je Signal; quartäre C (kein H) kleiner – wie im echten Spektrum (kein NOE)
      const hOf = (s) => (s.q && nuc === 'C' ? 0.4 : 1) * s.n;
      const nmax = Math.max(...sig.map(hOf), 1);
      for (const s of sig) {
        const h = 0.2 + 0.72 * hOf(s) / nmax;
        inner += `<line x1="${X(s.d).toFixed(2)}" y1="${H - b}" x2="${X(s.d).toFixed(2)}" y2="${Y(h).toFixed(1)}" stroke="#7048e8" stroke-width="1.6"/>`;
        tops.set(s, Y(h));
      }
    }
    // Beschriftung: Buchstabe + Anzahl (¹H) bzw. Buchstabe + δ; darunter δ und Multiplett – verteilt, mit Strich zum Peak
    const vis = sig.map((s, k) => ({ s, k })).filter(({ s }) => s.d >= lo && s.d <= hi);
    const fs = 9;
    const txt = vis.map(({ s, k }) => {
      const L = this.nmrLetter(k);
      const l1 = H1 ? `${L} · ${s.n}H` : nuc === 'C' ? `${L} · ${s.d.toFixed(1)}` : `${L} · ${s.d.toFixed(1)}${s.n > 1 ? ' (' + s.n + ')' : ''}`;
      const l2 = H1 ? `${s.d.toFixed(2)} ${s.mult.replace(' (breit)', ' br')}` + (fine && s.J && s.J.length ? ` · ${s.J.join(', ')} Hz` : '') : '';
      return { l1, l2, w: Math.max(l1.length, l2.length) * fs * 0.52 + 4 };
    });
    const pl = this.spreadLabels(vis.map(({ s }, k) => ({ x: X(s.d), w: txt[k].w })), l, W - r);
    let labs = '';
    vis.forEach(({ s }, k) => {
      const p = pl[k], T = txt[k], rowY = 14 + p.row * 20;   // Zeile 1: y 14–30, Zeile 2: 34–50
      labs += `<text x="${p.x.toFixed(1)}" y="${rowY + 8}" font-size="${fs}" text-anchor="middle" fill="currentColor" font-weight="600">${chemEsc(T.l1)}</text>`;
      if (T.l2) labs += `<text x="${p.x.toFixed(1)}" y="${rowY + 17}" font-size="${fs - 1}" text-anchor="middle" fill="currentColor" opacity=".75">${chemEsc(T.l2)}</text>`;
      if (lead) {
        const px = X(s.d), yb = rowY + (T.l2 ? 20 : 11), yp = Math.max(yb + 8, (tops.get(s) || t) - 3);
        const yk = Math.min(yp - 2, Math.max(yb + 3, t - 4));
        labs += `<path d="M${p.x.toFixed(1)},${yb}L${p.x.toFixed(1)},${(yb + 2).toFixed(1)}L${px.toFixed(1)},${yk.toFixed(1)}L${px.toFixed(1)},${yp.toFixed(1)}" fill="none" stroke="currentColor" stroke-width=".6" opacity=".45"/>`;
      }
    });
    g += `<g clip-path="url(#spcnmr)">${inner}</g>${labs}`;
    return this.wrapSvg(H, g, x0, x1, 'nmr');
  },
  /* Strukturbild mit den Signal-Buchstaben an den Atomen (1.55) – m: Molekül, Gr: Graph, sig: Signale, nuc: 'H'/'C' … */
  assignSvg(m, Gr, sig) {
    if (typeof ChemRender === 'undefined' || !m.atoms.length) return '';
    const r = ChemRender.draw(m, { caption: false, stars: false, nameCap: false });
    const byAtom = new Map();
    sig.forEach((s, k) => { for (const i of s.atoms || []) { const id = Gr.A[i] && Gr.A[i].src; if (id == null) continue; const L = this.nmrLetter(k); const arr = byAtom.get(id) || []; if (!arr.includes(L)) arr.push(L); byAtom.set(id, arr); } });
    const pos = new Map(m.atoms.map(a => [a.id, a]));
    let tx = '', box = { ...r.box };
    for (const [id, Ls] of byAtom) {
      const a = pos.get(id); if (!a) continue;
      const dirs = m.bonds.filter(bd => bd.a === id || bd.b === id).map(bd => { const o = pos.get(bd.a === id ? bd.b : bd.a); const dx = o.x - a.x, dy = o.y - a.y, L = Math.hypot(dx, dy) || 1; return [dx / L, dy / L]; });
      const lr = r.labels && r.labels.get(id);
      const d = ChemRender.freeDir(dirs, lr ? [[1, 0]] : []);
      const t2 = Ls.join(','), w = t2.length * 6.2 + 6;
      const dist = lr ? 15 : 11;
      const cx = a.x + d[0] * (dist + w * 0.35 * Math.abs(d[0])), cy = a.y + d[1] * dist;
      tx += `<rect x="${(cx - w / 2).toFixed(1)}" y="${(cy - 7).toFixed(1)}" width="${w.toFixed(1)}" height="13" rx="6" fill="#7048e8" opacity=".14"/><text x="${cx.toFixed(1)}" y="${(cy + 3.5).toFixed(1)}" font-size="10.5" font-weight="700" text-anchor="middle" fill="#5f3dc4" font-family="Segoe UI, Arial, sans-serif">${chemEsc(t2)}</text>`;
      box.x0 = Math.min(box.x0, cx - w / 2); box.x1 = Math.max(box.x1, cx + w / 2); box.y0 = Math.min(box.y0, cy - 8); box.y1 = Math.max(box.y1, cy + 8);
    }
    const pad = 6, x = box.x0 - pad, y = box.y0 - pad, w = box.x1 - box.x0 + 2 * pad, h = box.y1 - box.y0 + 2 * pad;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x.toFixed(1)} ${y.toFixed(1)} ${w.toFixed(1)} ${h.toFixed(1)}" width="${Math.round(w * 1.1)}" height="${Math.round(h * 1.1)}" class="chem-assign">${r.body}${tx}</svg>`;
  },
  /* Spektrum als eigenständiges Bild (weisser Grund, feste Farben) – zum Speichern und Einfügen */
  standalone(svg, title) {
    const m = /viewBox="0 0 (\d+) (\d+)"/.exec(svg);
    const W = m ? +m[1] : 560, H = m ? +m[2] : 220;
    const head = title ? `<text x="${W / 2}" y="13" font-size="11" font-weight="600" text-anchor="middle" fill="#222" font-family="Segoe UI, Arial, sans-serif">${chemEsc(title)}</text>` : '';
    return svg.replace(/currentColor/g, '#222').replace(/(<svg[^>]*>)/, `$1<rect width="${W}" height="${H}" fill="#fff"/>${head}`);
  },
};
if (typeof module !== 'undefined') module.exports = { ChemProps };
