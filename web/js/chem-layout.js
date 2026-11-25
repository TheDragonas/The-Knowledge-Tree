'use strict';
/* Chem-Draw: SMILES lesen, Ringe (SSSR), Kekulé-Form, 2D-Anordnung („schöne“ Strukturformeln),
 * Keile aus der Stereo-Information und Vergleich von Strukturen (für die Trivialnamen).
 * Selbst geschrieben, keine Bibliothek. Längeneinheit in der Anordnung: 1 = eine Bindung. */

/* ------------------------------------------------------------------ SMILES */
const ChemSmiles = {
  ORGANIC: ['Cl', 'Br', 'B', 'C', 'N', 'O', 'P', 'S', 'F', 'I'],
  /* -> {atoms:[{el, q, h (null = implizit), arom, chiral, order:[nachbar | 'H']}], bonds:[{a, b, o, arom, dir}]} */
  parse(smi) {
    const s = String(smi || '').trim();
    const atoms = [], bonds = [];
    const ring = {};
    const stack = [];
    let prev = -1, bo = null, dir = null, i = 0;
    const addBond = (a, b, o, d) => {
      const arom = o === null && atoms[a].arom && atoms[b].arom;
      bonds.push({ a, b, o: o === null ? (arom ? 1 : 1) : o, arom: o === ':' || arom, dir: d, aIdx: atoms[a].order.length });
      if (o === ':') bonds[bonds.length - 1].o = 1;
      return bonds.length - 1;
    };
    while (i < s.length) {
      const c = s[i];
      if (c === '(') { stack.push(prev); i++; continue; }
      if (c === ')') { prev = stack.pop(); i++; continue; }
      if (c === '.') { prev = -1; i++; continue; }
      if (c === '-') { bo = 1; i++; continue; }
      if (c === '=') { bo = 2; i++; continue; }
      if (c === '#') { bo = 3; i++; continue; }
      if (c === '$') { bo = 4; i++; continue; }
      if (c === ':') { bo = ':'; i++; continue; }
      if (c === '/' || c === '\\') { dir = c; i++; continue; }
      if (/\d|%/.test(c)) {
        let d;
        if (c === '%') { d = s.slice(i + 1, i + 3); i += 3; } else { d = c; i++; }
        const r = ring[d];
        if (r) {
          const o = bo !== null ? bo : r.o;
          const bi = addBond(r.a, prev, o, null);
          const b = bonds[bi];
          // Richtungszeichen am Ringschluss: von r.a nach prev gelesen
          b.dir = dir || (r.dir ? r.dir : null);
          if (!dir && r.dir) b.dirRev = false;
          atoms[r.a].order[r.slot] = prev;
          atoms[prev].order.push(r.a);
          delete ring[d];
        } else {
          ring[d] = { a: prev, o: bo, dir, slot: atoms[prev].order.length };
          atoms[prev].order.push(null);
        }
        bo = null; dir = null;
        continue;
      }
      let a;
      if (c === '[') {
        const j = s.indexOf(']', i);
        if (j < 0) throw new Error('Klammer ] fehlt');
        const t = s.slice(i + 1, j);
        i = j + 1;
        const m = t.match(/^(\d+)?([A-Z][a-z]?|[a-z][a-z]?|\*)(@@|@)?(?:H(\d*))?((?:[+-]\d*)|(?:\++)|(?:-+))?(?::\d+)?$/);
        if (!m) throw new Error('Atom [' + t + '] nicht lesbar');
        let el = m[2], arom = false;
        if (/^[a-z]/.test(el)) { arom = true; el = el[0].toUpperCase() + el.slice(1); }
        let q = 0;
        if (m[5]) {
          if (/^\++$/.test(m[5])) q = m[5].length;
          else if (/^-+$/.test(m[5])) q = -m[5].length;
          else q = (m[5][0] === '+' ? 1 : -1) * (m[5].length > 1 ? +m[5].slice(1) : 1);
        }
        a = { el, q, h: m[4] !== undefined ? (m[4] === '' ? 1 : +m[4]) : 0, arom, chiral: m[3] || null, order: [], br: true };
        if (a.h === 0 && t.includes('H') && m[4] === undefined) a.h = 0;
      } else {
        let el = null, arom = false;
        if (s.startsWith('Cl', i)) { el = 'Cl'; i += 2; }
        else if (s.startsWith('Br', i)) { el = 'Br'; i += 2; }
        else if (/[BCNOPSFI]/.test(c)) { el = c; i++; }
        else if (/[bcnops]/.test(c)) { el = c.toUpperCase(); arom = true; i++; }
        else throw new Error('Unerwartetes Zeichen «' + c + '» in SMILES');
        a = { el, q: 0, h: null, arom, chiral: null, order: [], br: false };
      }
      atoms.push(a);
      const idx = atoms.length - 1;
      if (prev >= 0) {
        const bi = addBond(prev, idx, bo, dir);
        atoms[prev].order.push(idx);
        a.order.push(prev);
        bonds[bi].dirFrom = prev;
      }
      if (a.br && a.h) a.order.push('H');
      prev = idx; bo = null; dir = null;
    }
    if (Object.keys(ring).length) throw new Error('Ringschluss ohne Partner');
    if (!atoms.length) throw new Error('Leere SMILES');
    return { atoms, bonds };
  },

  /* Kekulé-Form: Doppelbindungen in aromatischen Ringen verteilen */
  kekulize(P) {
    const n = P.atoms.length;
    const VAL = { C: 4, N: 3, O: 2, S: 2, P: 3, B: 3, Se: 2, As: 3 };
    const need = new Array(n).fill(false);
    for (let i = 0; i < n; i++) {
      const a = P.atoms[i];
      if (!a.arom) continue;
      let v = VAL[a.el] || 4;
      if (a.el === 'C') v -= Math.abs(a.q); else if (a.el === 'B') v -= a.q; else v += a.q;
      let sum = a.br ? a.h : 0;
      for (const b of P.bonds) if (b.a === i || b.b === i) sum += b.arom ? 1 : b.o;
      need[i] = v - sum >= 1;
    }
    const ab = P.bonds.filter(b => b.arom && need[b.a] && need[b.b]);
    const adj = Array.from({ length: n }, () => []);
    for (const b of ab) { adj[b.a].push(b); adj[b.b].push(b); }
    const mate = new Array(n).fill(null);
    const atomsNeed = [];
    for (let i = 0; i < n; i++) if (need[i]) atomsNeed.push(i);
    // Rückverfolgung, Atome mit wenigen Möglichkeiten zuerst
    let steps = 0;
    const solve = () => {
      if (++steps > 200000) return false;
      let best = -1, bestCnt = 99;
      for (const i of atomsNeed) {
        if (mate[i]) continue;
        let c = 0;
        for (const b of adj[i]) { const o = b.a === i ? b.b : b.a; if (!mate[o]) c++; }
        if (c < bestCnt) { bestCnt = c; best = i; }
        if (c === 0) return false;
      }
      if (best < 0) return true;
      for (const b of adj[best]) {
        const o = b.a === best ? b.b : b.a;
        if (mate[o]) continue;
        mate[best] = b; mate[o] = b;
        if (solve()) return true;
        mate[best] = null; mate[o] = null;
      }
      return false;
    };
    const ok = solve();
    for (const b of P.bonds) if (b.arom) b.o = 1;
    if (ok) for (const i of atomsNeed) if (mate[i]) mate[i].o = 2;
    return ok;
  },

  /* SMILES -> Molekül des Editors (Koordinaten über ChemLayout) */
  toMol(smi, opt = {}) {
    const P = this.parse(smi);
    this.kekulize(P);
    const m = ChemMol.empty();
    P.atoms.forEach((a, i) => {
      m.atoms.push({ id: i + 1, el: a.el, x: 0, y: 0, q: a.q || 0 });
    });
    P.bonds.forEach((b, k) => m.bonds.push({ id: 1000 + k, a: b.a + 1, b: b.b + 1, o: b.o, s: '' }));
    m.nid = 1000 + P.bonds.length + 1;
    // explizite H in Klammern, die nicht der Standardvalenz entsprechen, als H-Atome
    const idx = ChemMol.index(m);
    P.atoms.forEach((a, i) => {
      if (!a.br) return;
      const at = m.atoms[i];
      const implicit = ChemMol.implicitH(at.el, at.q, ChemMol.bondSum(idx, at.id));
      if (a.h > implicit && !a.chiral) {
        for (let k = implicit; k < a.h; k++) {
          const hid = m.nid++;
          m.atoms.push({ id: hid, el: 'H', x: 0, y: 0, q: 0 });
          m.bonds.push({ id: m.nid++, a: at.id, b: hid, o: 1, s: '' });
        }
      }
    });
    // Stereo-Vorgaben
    const chiral = [];
    P.atoms.forEach((a, i) => { if (a.chiral) chiral.push({ id: i + 1, sense: a.chiral, order: a.order.map(o => o === 'H' ? 'H' : o + 1) }); });
    const dbl = [];
    for (const b of P.bonds) {
      if (b.o !== 2 || b.arom) continue;
      const side = (atom, other) => {
        for (const d of P.bonds) {
          if (d === b || !d.dir) continue;
          if (d.a !== atom && d.b !== atom) continue;
          const nb = d.a === atom ? d.b : d.a;
          if (nb === other) continue;
          // geschrieben als links d.dir rechts; rechts liegt „oben“ bei '/'
          const left = d.dirFrom != null ? d.dirFrom : d.a, right = left === d.a ? d.b : d.a;
          const up = d.dir === '/';
          const nbUp = atom === right ? !up : up;
          return { nb: nb + 1, up: nbUp };
        }
        return null;
      };
      const sa = side(b.a, b.b), sb = side(b.b, b.a);
      if (sa && sb) dbl.push({ a: b.a + 1, b: b.b + 1, na: sa.nb, nb: sb.nb, cis: sa.up === sb.up });
    }
    if (opt.layout !== false) ChemLayout.layout(m, { chiral, dbl });
    return m;
  },
};

/* ------------------------------------------------------------------ Ringe */
const ChemRings = {
  /* kleinster Satz kleinster Ringe; adj[i] = [nachbarn]; -> [[atome in Ringfolge], …] */
  sssr(n, adj) {
    const edges = [], eid = new Map();
    for (let i = 0; i < n; i++) for (const j of adj[i]) if (i < j) { eid.set(i + ',' + j, edges.length); edges.push([i, j]); }
    const E = edges.length;
    // Anzahl Komponenten
    const comp = new Array(n).fill(-1);
    let C = 0;
    for (let s = 0; s < n; s++) {
      if (comp[s] >= 0) continue;
      const st = [s]; comp[s] = C;
      while (st.length) { const v = st.pop(); for (const w of adj[v]) if (comp[w] < 0) { comp[w] = C; st.push(w); } }
      C++;
    }
    const need = E - n + C;
    if (need <= 0) return [];
    const key = (i, j) => eid.get(Math.min(i, j) + ',' + Math.max(i, j));
    const cand = new Map();
    for (let r = 0; r < n; r++) {
      const par = new Array(n).fill(-1), dist = new Array(n).fill(-1);
      dist[r] = 0;
      const q = [r];
      for (let h = 0; h < q.length; h++) { const v = q[h]; for (const w of adj[v]) if (dist[w] < 0) { dist[w] = dist[v] + 1; par[w] = v; q.push(w); } }
      for (const [x, y] of edges) {
        if (dist[x] < 0 || dist[y] < 0 || par[x] === y || par[y] === x) continue;
        const px = [], py = [];
        for (let v = x; v >= 0; v = par[v]) px.push(v);
        for (let v = y; v >= 0; v = par[v]) py.push(v);
        const sx = new Set(px);
        let ok = true;
        for (const v of py) if (v !== r && sx.has(v)) { ok = false; break; }
        if (!ok) continue;
        const cyc = [...px.reverse(), ...py.slice(0, -1)];
        // px endet bei x (umgedreht beginnt bei r), py beginnt bei y und endet bei r
        const es = [];
        for (let k = 0; k < cyc.length; k++) es.push(key(cyc[k], cyc[(k + 1) % cyc.length]));
        if (es.some(e => e === undefined)) continue;
        const kk = [...es].sort((a, b) => a - b).join(',');
        if (!cand.has(kk)) cand.set(kk, { cyc, es });
      }
    }
    const list = [...cand.values()].sort((a, b) => a.cyc.length - b.cyc.length);
    const W = Math.ceil(E / 32);
    const basis = [];
    const out = [];
    for (const c of list) {
      const v = new Uint32Array(W);
      for (const e of c.es) v[e >> 5] ^= (1 << (e & 31));
      for (const b of basis) if (v[b.p >> 5] & (1 << (b.p & 31))) for (let k = 0; k < W; k++) v[k] ^= b.v[k];
      let p = -1;
      for (let k = 0; k < W && p < 0; k++) if (v[k]) p = k * 32 + (31 - Math.clz32(v[k] & -v[k]));
      if (p < 0) continue;
      // Basis reduziert halten
      for (const b of basis) if (b.v[p >> 5] & (1 << (p & 31))) for (let k = 0; k < W; k++) b.v[k] ^= v[k];
      basis.push({ v, p });
      out.push(c.cyc);
      if (out.length >= need) break;
    }
    return out;
  },
  systems(rings) {
    const sys = [];
    for (const r of rings) {
      const set = new Set(r);
      const hits = sys.filter(s => r.some(a => s.atoms.has(a)));
      const merged = { rings: [r], atoms: set };
      for (const h of hits) { merged.rings.push(...h.rings); for (const a of h.atoms) merged.atoms.add(a); sys.splice(sys.indexOf(h), 1); }
      sys.push(merged);
    }
    return sys;
  },
};

/* ------------------------------------------------------------------ 2D-Anordnung */
const ChemLayout = {
  /* Molekül neu anordnen (Koordinaten in Welt-Einheiten). st.chiral / st.dbl: Vorgaben aus SMILES */
  layout(m, st = {}) {
    const ids = m.atoms.map(a => a.id);
    const ix = new Map(ids.map((id, i) => [id, i]));
    const n = ids.length;
    const adj = Array.from({ length: n }, () => []);
    const bo = new Map();
    for (const b of m.bonds) {
      const i = ix.get(b.a), j = ix.get(b.b);
      if (i == null || j == null || i === j) continue;
      adj[i].push(j); adj[j].push(i);
      bo.set(Math.min(i, j) + ',' + Math.max(i, j), b.o);
    }
    const order = (i, j) => bo.get(Math.min(i, j) + ',' + Math.max(i, j)) || 1;
    const pos = this.place(n, adj, order, m.atoms.map(a => a.el));
    m.atoms.forEach((a, i) => { a.x = pos[i][0] * BL; a.y = pos[i][1] * BL; });
    for (const b of m.bonds) { b.s = ''; delete b.ds; }
    // E/Z-Vorgaben: falsche Seite spiegeln
    for (const d of st.dbl || []) this.fixDouble(m, d.a, d.b, d.na, d.nb, d.cis);
    // Keile für Stereozentren
    const cset = new Set((st.chiral || []).map(c => c.id));
    for (const c of st.chiral || []) this.wedgeFromParity(m, c, cset);
    if (st.rs) this.wedgeFromRS(m, st.rs);
    return m;
  },

  /* Kern: Positionen für alle Atome (Einheit 1 = Bindung) */
  place(n, adj, order, els) {
    const pos = new Array(n).fill(null);
    if (!n) return pos;
    const rings = ChemRings.sssr(n, adj);
    const systems = ChemRings.systems(rings);
    const sysOf = new Array(n).fill(null);
    systems.forEach(s => { for (const a of s.atoms) sysOf[a] = s; });
    const inRing = new Array(n).fill(false);
    for (const r of rings) for (const a of r) inRing[a] = true;
    // Komponenten
    const comp = new Array(n).fill(-1), comps = [];
    for (let s = 0; s < n; s++) {
      if (comp[s] >= 0) continue;
      const list = [s], st = [s]; comp[s] = comps.length;
      while (st.length) { const v = st.pop(); for (const w of adj[v]) if (comp[w] < 0) { comp[w] = comps.length; st.push(w); list.push(w); } }
      comps.push(list);
    }
    const weight = (from, to) => { // Grösse des Astes hinter „to“
      const seen = new Set([from, to]), st = [to];
      let c = 0;
      while (st.length) { const v = st.pop(); c++; for (const w of adj[v]) if (!seen.has(w)) { seen.add(w); st.push(w); } }
      return c;
    };
    const linear = (i) => {
      let triple = false, dbl = 0;
      for (const j of adj[i]) { const o = order(i, j); if (o === 3) triple = true; if (o === 2) dbl++; }
      return adj[i].length === 2 && (triple || dbl === 2);
    };
    let offsetX = 0;
    for (const list of comps) {
      const P = new Map();
      const placed = (i) => P.has(i);
      const put = (i, x, y) => { P.set(i, [x, y]); };
      const queue = [];
      /* Ringsystem lokal anordnen und an Ort bringen */
      const layoutSystem = (sys) => this.ringSystem(sys, adj);
      const attachSystem = (sys, atom, at, fromPos) => {
        const loc = layoutSystem(sys);
        // Aussenrichtung des Ansatzatoms im System
        const rs = sys.rings.filter(r => r.includes(atom));
        let cx = 0, cy = 0, k = 0;
        for (const r of rs) for (const a of r) { cx += loc.get(a)[0]; cy += loc.get(a)[1]; k++; }
        cx /= k; cy /= k;
        const [ax, ay] = loc.get(atom);
        let ex = ax - cx, ey = ay - cy;
        const el = Math.hypot(ex, ey) || 1; ex /= el; ey /= el;
        // gewünscht: -e zeigt in Bindungsrichtung (von fromPos weg)
        const dx = at[0] - fromPos[0], dy = at[1] - fromPos[1], dl = Math.hypot(dx, dy) || 1;
        const tx = dx / dl, ty = dy / dl;
        let best = null;
        for (const mir of [1, -1]) {
          const sx = -ex, sy = -ey * mir;
          const ang = Math.atan2(ty, tx) - Math.atan2(sy, sx);
          const c = Math.cos(ang), s = Math.sin(ang);
          const tr = new Map();
          for (const [a, p] of loc) {
            const lx = p[0] - ax, ly = (p[1] - ay) * mir;
            tr.set(a, [at[0] + lx * c - ly * s, at[1] + lx * s + ly * c]);
          }
          let clash = 0;
          for (const [a, p] of tr) for (const [b, q] of P) if (a !== b) { const d = Math.hypot(p[0] - q[0], p[1] - q[1]); if (d < 0.8) clash += 0.8 - d; }
          if (!best || clash < best.clash) best = { clash, tr };
        }
        for (const [a, p] of best.tr) { put(a, p[0], p[1]); queue.push(a); }
      };
      /* Startpunkt */
      const sysInComp = systems.filter(s => list.includes([...s.atoms][0]));
      if (sysInComp.length) {
        const core = sysInComp.sort((a, b) => b.atoms.size - a.atoms.size || b.rings.length - a.rings.length)[0];
        const loc = layoutSystem(core);
        for (const [a, p] of loc) { put(a, p[0], p[1]); queue.push(a); }
      } else {
        // längste Kette als Zickzack
        const far = (s) => { const d = new Map([[s, 0]]), q = [s], par = new Map(); for (let h = 0; h < q.length; h++) { const v = q[h]; for (const w of adj[v]) if (!d.has(w)) { d.set(w, d.get(v) + 1); par.set(w, v); q.push(w); } } let b = s; for (const [v, dd] of d) if (dd > d.get(b)) b = v; return { b, par }; };
        const a0 = far(list[0]).b;
        const { b: a1, par } = far(a0);
        const path = [];
        for (let v = a1; v !== undefined; v = par.get(v)) path.push(v);
        let x = 0, y = 0, dirAng = -Math.PI / 6;
        put(path[0], 0, 0);
        for (let k = 1; k < path.length; k++) {
          const prev = path[k - 1];
          if (k > 1 && linear(prev)) { /* gerade weiter */ } else if (k > 1) dirAng = dirAng < 0 ? Math.PI / 6 : -Math.PI / 6;
          x += Math.cos(dirAng); y += Math.sin(dirAng);
          put(path[k], x, y);
        }
        for (const v of path) queue.push(v);
      }
      /* Ausbreiten */
      for (let h = 0; h < queue.length; h++) {
        const a = queue[h];
        const U = adj[a].filter(j => !placed(j));
        if (!U.length) continue;
        const pa = P.get(a);
        const placedNb = adj[a].filter(j => placed(j));
        const dirs = placedNb.map(j => { const q = P.get(j); return Math.atan2(q[1] - pa[1], q[0] - pa[0]); });
        // Reihenfolge: schwerster Ast zuerst
        U.sort((x, y) => weight(a, y) - weight(a, x));
        let angs = [];
        if (dirs.length === 1) {
          const din = dirs[0] + Math.PI; // Richtung „weiter“
          const p = placedNb[0];
          const gp = adj[p].filter(j => j !== a && placed(j));
          const away = (ang) => {
            if (!gp.length) return Math.sin(ang) < 0 ? 1 : 0; // ohne Vorgänger: nach oben
            const x = pa[0] + Math.cos(ang), y = pa[1] + Math.sin(ang);
            let mn = 1e9;
            for (const g of gp) { const q = P.get(g); mn = Math.min(mn, Math.hypot(q[0] - x, q[1] - y)); }
            return mn;
          };
          if (U.length === 1 && (linear(a) || (linear(p) && adj[a].length === 2 && false))) angs = [din];
          else if (U.length === 1) {
            const c = [din - Math.PI / 3, din + Math.PI / 3];
            c.sort((x, y) => away(y) - away(x));
            angs = [c[0]];
          } else if (U.length === 2) {
            const c = [din - Math.PI / 3, din + Math.PI / 3];
            c.sort((x, y) => away(y) - away(x));
            angs = c;
          } else if (U.length === 3) angs = [din, din - Math.PI / 2, din + Math.PI / 2];
          else for (let k = 0; k < U.length; k++) angs.push(dirs[0] + (k + 1) * 2 * Math.PI / (U.length + 1));
        } else if (dirs.length === 0) {
          for (let k = 0; k < U.length; k++) angs.push(-Math.PI / 6 + k * 2 * Math.PI / U.length);
        } else {
          const s = [...dirs].sort((x, y) => x - y);
          // Ringmitten an diesem Atom: Lücken, die ins Ringinnere zeigen, meiden
          const cents = [];
          if (inRing[a]) for (const r of rings) if (r.includes(a) && r.every(v => placed(v))) {
            let cx = 0, cy = 0;
            for (const v of r) { cx += P.get(v)[0]; cy += P.get(v)[1]; }
            cents.push(Math.atan2(cy / r.length - pa[1], cx / r.length - pa[0]));
          }
          let best = -1e9, g0 = 0, gs = 0;
          for (let k = 0; k < s.length; k++) {
            const x = s[k], y = k + 1 < s.length ? s[k + 1] : s[0] + 2 * Math.PI;
            const mid = (x + y) / 2;
            let sc = y - x;
            for (const c of cents) { let d = Math.abs(((mid - c) % (2 * Math.PI) + 3 * Math.PI) % (2 * Math.PI) - Math.PI); if (d < 0.9) sc -= 10; }
            if (sc > best) { best = sc; g0 = x; gs = y - x; }
          }
          for (let k = 0; k < U.length; k++) angs.push(g0 + gs * (k + 1) / (U.length + 1));
        }
        U.forEach((u, k) => {
          let ang = angs[k];
          // freien Platz suchen
          const free = (an) => { const x = pa[0] + Math.cos(an), y = pa[1] + Math.sin(an); let mn = 9; for (const [, q] of P) mn = Math.min(mn, Math.hypot(q[0] - x, q[1] - y)); return mn; };
          if (free(ang) < 0.55) {
            let bestA = ang, bestF = free(ang);
            for (let d = 1; d <= 6; d++) for (const sg of [1, -1]) { const an = ang + sg * d * Math.PI / 12; const f = free(an); if (f > bestF + 0.05) { bestF = f; bestA = an; } }
            ang = bestA;
          }
          const at = [pa[0] + Math.cos(ang), pa[1] + Math.sin(ang)];
          if (sysOf[u] && !placed(u)) attachSystem(sysOf[u], u, at, pa);
          else { put(u, at[0], at[1]); queue.push(u); }
        });
      }
      /* Überlappungen durch Spiegeln von Ästen verringern */
      this.untangle(P, adj, inRing, order);
      /* schönste Lage: Drehung in 60°-Schritten (bleibt auf dem Raster), evtl. gespiegelt */
      let pts = [...P.entries()];
      let best = null;
      for (let k = 0; k < 6; k++) for (const mir of [1, -1]) {
        const an = k * Math.PI / 3, c = Math.cos(an), s = Math.sin(an);
        let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
        for (const [, p] of pts) { const x = (p[0] * c - p[1] * s) * mir, y = p[0] * s + p[1] * c; x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
        const score = (x1 - x0) - (y1 - y0) * 1.2 + (mir === 1 ? 0.01 : 0) + (k === 0 ? 0.02 : 0);
        if (!best || score > best.score + 1e-6) best = { score, c, s, mir, x0, y0, y1 };
      }
      const cy = (best.y0 + best.y1) / 2;
      for (const [a, p] of pts) {
        const x = (p[0] * best.c - p[1] * best.s) * best.mir, y = p[0] * best.s + p[1] * best.c;
        pos[a] = [x - best.x0 + offsetX, y - cy];
      }
      let w = 0;
      for (const a of list) w = Math.max(w, pos[a][0] - offsetX);
      offsetX += w + 1.8;
    }
    // Gesamtbild auf den Ursprung zentrieren und auf das Sechseck-Raster legen
    let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
    for (const p of pos) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); }
    const g = this.snapPt(pos[0][0] - (x0 + x1) / 2, pos[0][1] - (y0 + y1) / 2, 1);
    const dx = g[0] - pos[0][0], dy = g[1] - pos[0][1];
    return pos.map(p => [p[0] + dx, p[1] + dy]);
  },

  /* Ringsystem in lokalen Koordinaten (Map atom -> [x, y]) */
  ringSystem(sys, adj) {
    const loc = new Map();
    const rings = [...sys.rings].map(r => [...r]);
    const poly = (r, cx, cy, a0, step) => r.map((_, k) => { const R = 1 / (2 * Math.sin(Math.PI / r.length)); return [cx + R * Math.cos(a0 + k * step), cy + R * Math.sin(a0 + k * step)]; });
    // Startring: meiste Nachbarringe, dann grösster (6er bevorzugt)
    const nbCount = (r) => rings.filter(o => o !== r && o.some(a => r.includes(a))).length;
    rings.sort((a, b) => nbCount(b) - nbCount(a) || (b.length === 6) - (a.length === 6) || b.length - a.length);
    let first = rings[0];
    // verbrückt (z.B. Norbornan, Campher): grossen Umfangsring zuerst, Brücke danach quer
    for (let i = 0; i < rings.length && first === rings[0]; i++) for (let j = i + 1; j < rings.length; j++) {
      const sh = rings[i].filter(a => rings[j].includes(a));
      if (sh.length < 3) continue;
      const big = this.mergeRings(rings[i], rings[j], adj);
      if (big) { first = big; rings.push(big); break; }
    }
    const n0 = first.length;
    const pts0 = poly(first, 0, 0, -Math.PI / 2 - (n0 % 2 ? 0 : 0), 2 * Math.PI / n0);
    first.forEach((a, k) => loc.set(a, pts0[k]));
    const done = new Set([first]);
    const centroidOf = (atoms) => { let x = 0, y = 0; for (const a of atoms) { x += loc.get(a)[0]; y += loc.get(a)[1]; } return [x / atoms.length, y / atoms.length]; };
    let guard = 0;
    while (done.size < rings.length && guard++ < 200) {
      // nächster Ring: teilt eine Kante > teilt mehrere Atome > teilt ein Atom
      let pick = null, kind = 0;
      for (const r of rings) {
        if (done.has(r)) continue;
        const shared = r.filter(a => loc.has(a));
        if (!shared.length) continue;
        let k = shared.length === 2 && this.adjacentInRing(r, shared[0], shared[1]) ? 3 : shared.length > 2 ? 2 : shared.length === 1 ? 1 : 0;
        if (k > kind) { kind = k; pick = r; }
      }
      if (!pick) break;
      done.add(pick);
      const r = pick, n = r.length, R = 1 / (2 * Math.sin(Math.PI / n)), ap = 1 / (2 * Math.tan(Math.PI / n));
      const shared = r.filter(a => loc.has(a));
      const placedRings = [...done].filter(o => o !== r);
      if (kind === 3) {
        // anelliert: über die gemeinsame Kante klappen
        let [u, v] = shared;
        const iu = r.indexOf(u), iv = r.indexOf(v);
        // Ringfolge so, dass v auf u folgt
        if ((iu + 1) % n !== iv) { const t = u; u = v; v = t; }
        const pu = loc.get(u), pv = loc.get(v);
        const mx = (pu[0] + pv[0]) / 2, my = (pu[1] + pv[1]) / 2;
        let nx = -(pv[1] - pu[1]), ny = pv[0] - pu[0];
        const nl = Math.hypot(nx, ny) || 1; nx /= nl; ny /= nl;
        const olds = placedRings.filter(o => o.includes(u) && o.includes(v));
        const oc = centroidOf(olds.length ? olds[0] : [...loc.keys()]);
        const side = (nx * (oc[0] - mx) + ny * (oc[1] - my)) > 0 ? -1 : 1;
        const cx = mx + nx * ap * side, cy = my + ny * ap * side;
        const a0 = Math.atan2(pu[1] - cy, pu[0] - cx), a1 = Math.atan2(pv[1] - cy, pv[0] - cx);
        let st = a1 - a0;
        while (st > Math.PI) st -= 2 * Math.PI;
        while (st < -Math.PI) st += 2 * Math.PI;
        const iu2 = r.indexOf(u);
        for (let k = 2; k < n; k++) {
          const a = r[(iu2 + k) % n];
          if (loc.has(a)) continue;
          loc.set(a, [cx + R * Math.cos(a0 + k * st), cy + R * Math.sin(a0 + k * st)]);
        }
      } else if (kind === 1) {
        // Spiro: Ring nach aussen
        const u = shared[0], pu = loc.get(u);
        const oc = centroidOf([...loc.keys()]);
        let ex = pu[0] - oc[0], ey = pu[1] - oc[1];
        const el = Math.hypot(ex, ey) || 1; ex /= el; ey /= el;
        const cx = pu[0] + ex * R, cy = pu[1] + ey * R;
        const a0 = Math.atan2(pu[1] - cy, pu[0] - cx), iu = r.indexOf(u);
        for (let k = 1; k < n; k++) loc.set(r[(iu + k) % n], [cx + R * Math.cos(a0 + k * 2 * Math.PI / n), cy + R * Math.sin(a0 + k * 2 * Math.PI / n)]);
      } else {
        // mehrere gemeinsame Atome (peri-anelliert oder verbrückt): fehlende Atome als Bogen
        const idxs = r.map((a, k) => loc.has(a) ? k : -1).filter(k => k >= 0);
        // Lücken (zusammenhängende Folgen nicht platzierter Atome) füllen
        for (let k = 0; k < n; k++) {
          if (!loc.has(r[k]) || loc.has(r[(k + 1) % n])) continue;
          const gap = [];
          let e = (k + 1) % n;
          while (!loc.has(r[e])) { gap.push(r[e]); e = (e + 1) % n; }
          const A = loc.get(r[k]), B = loc.get(r[e]);
          this.arc(loc, gap, A, B, centroidOf([...loc.keys()]), n, idxs.length);
        }
      }
    }
    // Atome, die in keinem behandelten Ring liegen (sollte nicht vorkommen)
    for (const a of sys.atoms) if (!loc.has(a)) loc.set(a, [0, 0]);
    return loc;
  },
  /* Umfang zweier Ringe mit gemeinsamem Pfad (symmetrische Differenz der Kanten) */
  mergeRings(r1, r2, adj) {
    const ek = (a, b) => Math.min(a, b) + ',' + Math.max(a, b);
    const edges = new Map();
    for (const r of [r1, r2]) for (let k = 0; k < r.length; k++) { const e = ek(r[k], r[(k + 1) % r.length]); edges.set(e, (edges.get(e) || 0) + 1); }
    const keep = [...edges].filter(([, c]) => c === 1).map(([e]) => e.split(',').map(Number));
    const nb = new Map();
    for (const [a, b] of keep) { if (!nb.has(a)) nb.set(a, []); if (!nb.has(b)) nb.set(b, []); nb.get(a).push(b); nb.get(b).push(a); }
    if ([...nb.values()].some(l => l.length !== 2)) return null;
    const start = keep[0][0], cyc = [start];
    let prev = -1, cur = start;
    for (let g = 0; g < keep.length; g++) {
      const nx = nb.get(cur).find(x => x !== prev);
      if (nx === start) break;
      cyc.push(nx); prev = cur; cur = nx;
    }
    return cyc.length === keep.length ? cyc : null;
  },
  adjacentInRing(r, a, b) { const i = r.indexOf(a), j = r.indexOf(b); return Math.abs(i - j) === 1 || Math.abs(i - j) === r.length - 1; },
  /* Atome einer Lücke zwischen A und B als Bogen (weg vom Schwerpunkt) */
  arc(loc, gap, A, B, away, ringN) {
    const m = gap.length + 1; // Anzahl Bindungen
    const dx = B[0] - A[0], dy = B[1] - A[1], d = Math.hypot(dx, dy) || 1e-6;
    const mx = (A[0] + B[0]) / 2, my = (A[1] + B[1]) / 2;
    let nx = -dy / d, ny = dx / d;
    if (nx * (mx - away[0]) + ny * (my - away[1]) < 0) { nx = -nx; ny = -ny; }
    if (d < 0.2) {
      gap.forEach((a, k) => loc.set(a, [mx + nx * (k + 1) * 0.8, my + ny * (k + 1) * 0.8]));
      return;
    }
    if (d >= m * 0.98) { gap.forEach((a, k) => loc.set(a, [A[0] + dx * (k + 1) / m, A[1] + dy * (k + 1) / m])); return; }
    // Kreisbogen mit m Sehnen der Länge 1: Winkel je Sehne t = 2 asin(1/(2r)), m·t = Bogenwinkel Θ, d = 2 r sin(Θ/2)
    let lo = d / 2 + 1e-6, hi = 50;
    const f = (r) => 2 * r * Math.sin(m * Math.asin(Math.min(1, 1 / (2 * r)))) - d;
    // f bei grossem r ≈ m - d > 0; bei kleinem r: Bogen über 180° möglich
    for (let it = 0; it < 60; it++) { const mid = (lo + hi) / 2; if (f(mid) > 0) hi = mid; else lo = mid; }
    let r = hi;
    const t = 2 * Math.asin(Math.min(1, 1 / (2 * r)));
    const Th = m * t;
    let big = Th > Math.PI;
    const h = Math.sqrt(Math.max(0, r * r - d * d / 4));
    // Mittelpunkt auf der Gegenseite (kleiner Bogen) bzw. gleichen Seite (grosser Bogen)
    const cx = mx - nx * h * (big ? -1 : 1), cy = my - ny * h * (big ? -1 : 1);
    const a0 = Math.atan2(A[1] - cy, A[0] - cx);
    // Drehsinn so, dass der Bogen durch die Aussenseite läuft
    const tryDir = (sg) => { const am = a0 + sg * Th / 2; return nx * (cx + r * Math.cos(am) - mx) + ny * (cy + r * Math.sin(am) - my); };
    const sg = tryDir(1) > tryDir(-1) ? 1 : -1;
    gap.forEach((a, k) => { const an = a0 + sg * t * (k + 1); loc.set(a, [cx + r * Math.cos(an), cy + r * Math.sin(an)]); });
  },
  /* Äste an Einfachbindungen spiegeln, wenn das Überlappungen verringert */
  untangle(P, adj, inRing, order) {
    const clash = () => {
      let s = 0;
      const arr = [...P.entries()];
      for (let i = 0; i < arr.length; i++) for (let j = i + 1; j < arr.length; j++) {
        const [a, p] = arr[i], [b, q] = arr[j];
        if (adj[a].includes(b)) continue;
        const d = Math.hypot(p[0] - q[0], p[1] - q[1]);
        if (d < 0.75) s += (0.75 - d) * 10;
      }
      return s;
    };
    let cur = clash();
    if (cur < 1e-6) return;
    const side = (a, b) => { const seen = new Set([a, b]), st = [b], out = [b]; while (st.length) { const v = st.pop(); for (const w of adj[v]) if (!seen.has(w)) { seen.add(w); st.push(w); out.push(w); } } return out; };
    for (let round = 0; round < 8 && cur > 1e-6; round++) {
      let best = null;
      for (const [a] of P) for (const b of adj[a]) {
        if (a > b || (inRing[a] && inRing[b] && false)) continue;
        if (order(a, b) !== 1) continue;
        // nur Bindungen, die nicht im Ring liegen
        const sA = side(a, b);
        if (sA.includes(a)) continue; // Ringbindung
        const sB = side(b, a);
        const move = sA.length <= sB.length ? sA : sB;
        const [p, q] = sA.length <= sB.length ? [P.get(a), P.get(b)] : [P.get(b), P.get(a)];
        const ux = q[0] - p[0], uy = q[1] - p[1], ul = Math.hypot(ux, uy) || 1;
        const saved = move.map(v => [v, P.get(v)]);
        for (const v of move) {
          const w = P.get(v), rx = w[0] - p[0], ry = w[1] - p[1];
          const t = (rx * ux + ry * uy) / (ul * ul);
          const fx = p[0] + ux * t, fy = p[1] + uy * t;
          P.set(v, [2 * fx - w[0], 2 * fy - w[1]]);
        }
        const sc = clash();
        if (sc < cur - 1e-6 && (!best || sc < best.sc)) best = { sc, after: move.map(v => [v, P.get(v)]) };
        for (const [v, w] of saved) P.set(v, w);
      }
      if (!best) break;
      for (const [v, w] of best.after) P.set(v, w);
      cur = best.sc;
    }
  },

  /* Sechseck-Raster: Punkte (k·√3, m) und ((k+½)·√3, m+½), Einheit u */
  snapPt(x, y, u = BL) {
    const W = Math.sqrt(3) * u;
    const ax = Math.round(x / W) * W, ay = Math.round(y / u) * u;
    const bx = (Math.round(x / W - 0.5) + 0.5) * W, by = (Math.round(y / u - 0.5) + 0.5) * u;
    return Math.hypot(ax - x, ay - y) <= Math.hypot(bx - x, by - y) ? [ax, ay] : [bx, by];
  },

  /* Doppelbindung: Substituent na (an a) und nb (an b) cis/trans wie verlangt */
  fixDouble(m, a, b, na, nb, cis) {
    const at = (id) => m.atoms.find(x => x.id === id);
    const A = at(a), B = at(b), NA = at(na), NB = at(nb);
    if (!A || !B || !NA || !NB) return;
    const ux = B.x - A.x, uy = B.y - A.y;
    const s1 = Math.sign(ux * (NA.y - A.y) - uy * (NA.x - A.x)), s2 = Math.sign(ux * (NB.y - B.y) - uy * (NB.x - B.x));
    if (!s1 || !s2 || (s1 === s2) === cis) return;
    // Seite von b (ohne a) spiegeln, falls kein Ring
    const nbs = (id) => m.bonds.filter(x => x.a === id || x.b === id).map(x => x.a === id ? x.b : x.a);
    const seen = new Set([a, b]), st = [b], side = [];
    while (st.length) { const v = st.pop(); for (const w of nbs(v)) if (!seen.has(w)) { seen.add(w); st.push(w); side.push(w); } }
    if (seen.has(a) && side.some(v => nbs(v).includes(a) && v !== b)) return; // Ring
    const ul = Math.hypot(ux, uy) || 1;
    for (const id of side) {
      const v = at(id), rx = v.x - A.x, ry = v.y - A.y;
      const t = (rx * ux + ry * uy) / (ul * ul);
      const fx = A.x + ux * t, fy = A.y + uy * t;
      v.x = 2 * fx - v.x; v.y = 2 * fy - v.y;
    }
  },

  /* Vorzeichen des Chiralitätssinns aus Lagen + Keilen (Reihenfolge ord: Atom-IDs oder 'H') */
  sense(m, center, ord) {
    const at = (id) => m.atoms.find(x => x.id === id);
    const C = at(center);
    const vec = ord.map(o => {
      if (o === 'H') return null;
      const N = at(o);
      let dx = (N.x - C.x) / BL, dy = -(N.y - C.y) / BL;
      const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l;
      const b = m.bonds.find(x => (x.a === center && x.b === o) || (x.b === center && x.a === o));
      let dz = 0;
      if (b && b.a === center) dz = b.s === 'w' ? 1 : b.s === 'h' ? -1 : 0;
      return [dx, dy, dz];
    });
    const miss = vec.findIndex(v => !v);
    if (miss >= 0) {
      let sx = 0, sy = 0, sz = 0;
      for (const v of vec) if (v) { sx += v[0]; sy += v[1]; sz += v[2]; }
      const l = Math.hypot(sx, sy);
      vec[miss] = [l > 0.15 ? -sx / l : 0, l > 0.15 ? -sy / l : 0, sz > 0 ? -1 : sz < 0 ? 1 : 0];
    }
    if (vec.length !== 4) return 0;
    const [v0, v1, v2, v3] = vec;
    const a = [v1[0] - v0[0], v1[1] - v0[1], v1[2] - v0[2]], b = [v2[0] - v0[0], v2[1] - v0[1], v2[2] - v0[2]], d = [v3[0] - v0[0], v3[1] - v0[1], v3[2] - v0[2]];
    const det = a[0] * (b[1] * d[2] - b[2] * d[1]) - a[1] * (b[0] * d[2] - b[2] * d[0]) + a[2] * (b[0] * d[1] - b[1] * d[0]);
    return Math.abs(det) < 1e-3 ? 0 : Math.sign(det);
  },
  /* Bindung für einen Keil wählen (nicht im Ring, Nachbar kein Zentrum, möglichst endständig) */
  wedgeCandidates(m, center, avoid) {
    const nbs = (id) => m.bonds.filter(x => x.a === id || x.b === id);
    const ringBond = (b) => {
      // gibt es einen anderen Weg?
      const seen = new Set([b.a]), st = [b.a];
      while (st.length) { const v = st.pop(); for (const x of nbs(v)) { if (x === b) continue; const w = x.a === v ? x.b : x.a; if (w === b.b) return true; if (!seen.has(w)) { seen.add(w); st.push(w); } } }
      return false;
    };
    return nbs(center).filter(b => b.o === 1).map(b => {
      const o = b.a === center ? b.b : b.a;
      const oa = m.atoms.find(x => x.id === o);
      let score = 0;
      if (ringBond(b)) score += 10;
      if (avoid && avoid.has(o)) score += 5;
      if (b.s) score += 20;
      if (oa && oa.el === 'H') score -= 3;
      score += nbs(o).length;
      return { b, o, score };
    }).sort((x, y) => x.score - y.score);
  },
  setWedge(m, b, center, s) {
    if (b.a !== center) { const t = b.a; b.a = b.b; b.b = t; }
    b.s = s;
  },
  /* Keil so setzen, dass die SMILES-Angabe @/@@ stimmt ('@': Determinante < 0) */
  wedgeFromParity(m, c, centers = new Set()) {
    const want = c.sense === '@' ? -1 : 1;
    let cands = this.wedgeCandidates(m, c.id, centers);
    // nur H implizit und alle Nachbarn im Ring: explizites H mit Keil
    if (c.order.includes('H') && cands.every(k => k.score >= 10)) {
      const C = m.atoms.find(x => x.id === c.id);
      const nb = m.bonds.filter(x => x.a === c.id || x.b === c.id).map(x => m.atoms.find(a => a.id === (x.a === c.id ? x.b : x.a)));
      // Richtung: Mitte der Lücke mit dem meisten Platz
      const angs = nb.map(o => Math.atan2(o.y - C.y, o.x - C.x)).sort((a, b) => a - b);
      let ux = 0, uy = -1, bestCl = -1;
      for (let k = 0; k < angs.length; k++) {
        const a0 = angs[k], a1 = k + 1 < angs.length ? angs[k + 1] : angs[0] + 2 * Math.PI;
        const mid = (a0 + a1) / 2, dx = Math.cos(mid), dy = Math.sin(mid);
        const px = C.x + dx * BL * 0.8, py = C.y + dy * BL * 0.8;
        let cl = 1e9;
        for (const a of m.atoms) if (a !== C) cl = Math.min(cl, Math.hypot(a.x - px, a.y - py));
        if (cl > bestCl) { bestCl = cl; ux = dx; uy = dy; }
      }
      const hid = m.nid++;
      m.atoms.push({ id: hid, el: 'H', x: C.x + ux * BL * 0.8, y: C.y + uy * BL * 0.8, q: 0 });
      const hb = { id: m.nid++, a: c.id, b: hid, o: 1, s: '' };
      m.bonds.push(hb);
      c = { ...c, order: c.order.map(o => o === 'H' ? hid : o) };
      cands = [{ b: hb, o: hid, score: 0 }];
    }
    for (const k of cands.slice(0, 3)) {
      const old = k.b.s, oa = k.b.a, ob = k.b.b;
      this.setWedge(m, k.b, c.id, 'w');
      const s = this.sense(m, c.id, c.order);
      if (s === want) return true;
      if (s === -want) { k.b.s = 'h'; if (this.sense(m, c.id, c.order) === want) return true; }
      k.b.s = old; k.b.a = oa; k.b.b = ob;
    }
    return false;
  },
  /* Keile so setzen, dass (R)/(S) wie vorher sind: rs = Map(atomId -> 'R'|'S') */
  wedgeFromRS(m, rs) {
    for (const [id, want] of rs) {
      const cands = this.wedgeCandidates(m, id, new Set(rs.keys()));
      let ok = false;
      for (const k of cands.slice(0, 3)) {
        for (const s of ['w', 'h']) {
          const old = k.b.s, oa = k.b.a, ob = k.b.b;
          this.setWedge(m, k.b, id, s);
          const got = (ChemMol.stereo(m).centers.find(c => c.id === id) || {}).rs;
          if (got === want) { ok = true; break; }
          k.b.s = old; k.b.a = oa; k.b.b = ob;
        }
        if (ok) break;
      }
    }
  },
  /* „Aufräumen“: Teilmenge (ids) neu anordnen, Stereo bleibt erhalten */
  relayout(m, ids) {
    const sel = ids && ids.size ? ids : new Set(m.atoms.map(a => a.id));
    // ganze Fragmente der Auswahl
    const nbs = (id) => m.bonds.filter(x => x.a === id || x.b === id).map(x => x.a === id ? x.b : x.a);
    const frag = new Set();
    for (const id of sel) { if (frag.has(id)) continue; const st = [id]; frag.add(id); while (st.length) { const v = st.pop(); for (const w of nbs(v)) if (!frag.has(w)) { frag.add(w); st.push(w); } } }
    const an = ChemMol.analyze(m);
    const rs = new Map(an.centers.filter(c => c.rs && frag.has(c.id)).map(c => [c.id, c.rs]));
    const ezBefore = new Map(an.ez.map(e => [e.id, e.ez]));
    const sub = { atoms: m.atoms.filter(a => frag.has(a.id)), bonds: m.bonds.filter(b => frag.has(b.a) && frag.has(b.b)), nid: m.nid };
    let cx = 0, cy = 0;
    for (const a of sub.atoms) { cx += a.x; cy += a.y; }
    cx /= sub.atoms.length || 1; cy /= sub.atoms.length || 1;
    // Keile vorher entfernen, nach dem Anordnen neu setzen
    this.layout(sub, {});
    // E/Z wiederherstellen
    const anNow = ChemMol.analyze(m);
    for (const e of anNow.ez) {
      const want = ezBefore.get(e.id);
      if (!want || want === e.ez) continue;
      const b = m.bonds.find(x => x.id === e.id);
      // irgendeinen Substituenten an a und b nehmen
      const sa = nbs(b.a).find(x => x !== b.b), sb = nbs(b.b).find(x => x !== b.a);
      if (sa == null || sb == null) continue;
      const A = m.atoms.find(x => x.id === b.a), B = m.atoms.find(x => x.id === b.b), SA = m.atoms.find(x => x.id === sa), SB = m.atoms.find(x => x.id === sb);
      const ux = B.x - A.x, uy = B.y - A.y;
      const cis = Math.sign(ux * (SA.y - A.y) - uy * (SA.x - A.x)) === Math.sign(ux * (SB.y - B.y) - uy * (SB.x - B.x));
      this.fixDouble(m, b.a, b.b, sa, sb, !cis);
    }
    this.wedgeFromRS(m, rs);
    // an die alte Stelle (Schwerpunkt), auf dem Raster
    let nx = 0, ny = 0;
    for (const a of sub.atoms) { nx += a.x; ny += a.y; }
    nx /= sub.atoms.length || 1; ny /= sub.atoms.length || 1;
    const g = this.snapPt(cx + (sub.atoms[0].x - nx), cy + (sub.atoms[0].y - ny));
    const dx = g[0] - sub.atoms[0].x, dy = g[1] - sub.atoms[0].y;
    for (const a of sub.atoms) { a.x += dx; a.y += dy; }
    m.nid = Math.max(m.nid, sub.nid);
    // neu angelegte H-Atome (für Keile) übernehmen
    for (const a of sub.atoms) if (!m.atoms.includes(a)) m.atoms.push(a);
    for (const b of sub.bonds) if (!m.bonds.includes(b)) m.bonds.push(b);
  },
};

/* ------------------------------------------------------------------ Vergleich von Strukturen */
const ChemMatch = {
  _ids: new Map(),
  id(str) { let v = this._ids.get(str); if (v == null) { v = this._ids.size; this._ids.set(str, v); } return v; },
  /* Schlüssel unabhängig von Zeichnung und Nummerierung (Konstitution, ohne Stereo) */
  key(m) {
    const G = ChemMol.expand(m);
    const heavy = [];
    for (let i = 0; i < G.n; i++) if (!G.plainH[i]) heavy.push(i);
    const hi = new Map(heavy.map((v, k) => [v, k]));
    let cur = heavy.map(i => this.id(G.el[i] + ':' + G.q[i] + ':' + ChemMol.effH(G, i)));
    let classes = new Set(cur).size;
    for (let it = 0; it < heavy.length + 1; it++) {
      const next = heavy.map((i, k) => {
        const nb = [];
        for (const [j, o] of G.adj[i]) if (hi.has(j)) nb.push(o * 100000 + cur[hi.get(j)]);
        nb.sort((a, b) => a - b);
        return this.id(cur[k] + '[' + nb.join(',') + ']');
      });
      const c2 = new Set(next).size;
      cur = next;
      if (c2 === classes && it > 0) break;
      classes = c2;
    }
    const atoms = [...cur].sort((a, b) => a - b).join(',');
    const bonds = [];
    for (const i of heavy) for (const [j, o] of G.adj[i]) if (hi.has(j) && i < j) { const a = cur[hi.get(i)], b = cur[hi.get(j)]; bonds.push(Math.min(a, b) + '-' + Math.max(a, b) + '/' + o); }
    bonds.sort();
    return atoms + '#' + bonds.join(';');
  },
};
