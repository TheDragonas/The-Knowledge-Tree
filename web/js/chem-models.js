'use strict';
/* Chem-Draw: Darstellungen (seit 1.28) – dieselbe gezeichnete Struktur als
 *   Keil/Strich  Skelettformel mit Keilen (chem.js, zum Zeichnen)
 *   Lewis        alle Atome und Wasserstoffe, Bindungen als Striche, freie Elektronenpaare als Striche (oder Punkte),
 *                Radikale als Punkt, Ladungen umkreist
 *   Bohr         jedes Atom mit seinen Schalen (K, L, M …) und Elektronen; gemeinsame Elektronenpaare liegen in der
 *                Überlappung der äussersten Schalen, freie Paare aussen auf der Schale
 *   Orbitale     Orbitalmodell: Hybridorbitale (sp³, sp², sp) entlang der σ-Bindungen, s-Orbitale der H-Atome,
 *                freie Paare als eigene Keulen, p-Orbitale der π-Bindungen; darunter die Kästchenschreibweise
 *                (↑↓ nach Hund und Pauli) und die Formen der besetzten Orbitale (s, p, d)
 *   3D           räumliches Modell (aus der Zeichnung, Keile = vorn/hinten, Winkel nach Hybridisierung), drehbar;
 *                Kugel-Stab, Kalotten oder Elektronenwolke (Partialladungen δ−/δ+ farbig)
 * Alles ohne DOM ausser der Textbreite (ChemRender.width) – geprüft mit tests/chem/modelle-test.js. */

const ChemModels = {
  LIST: [
    ['skelett', 'Keil/Strich', 'Skelettformel mit Keilen (vorn/hinten) – zum Zeichnen'],
    ['lewis', 'Lewis', 'Lewis-Schreibweise: alle Atome, Bindungs- und freie Elektronenpaare'],
    ['bohr', 'Bohr', 'Bohrsches Atommodell: Schalen mit Elektronen, gemeinsame Paare in der Überlappung'],
    ['orbital', 'Orbitale', 'Orbitalmodell (Hybridorbitale, π-Bindungen) und Kästchenschreibweise'],
    ['3d', '3D', 'Räumliches Modell – mit der Maus drehen; Kugel-Stab, Kalotten oder Elektronenwolke'],
  ],
  editable(model) { return !model || model === 'skelett' || model === 'lewis'; },

  /* ---------------------------------------------------------- Elektronenkonfiguration */
  ORDER: ['1s', '2s', '2p', '3s', '3p', '4s', '3d', '4p', '5s', '4d', '5p', '6s', '4f', '5d', '6p', '7s', '5f', '6d', '7p'],
  CAP: { s: 2, p: 6, d: 10, f: 14 },
  // Ausnahmen von der Aufbau-Regel (neutrale Atome)
  EXC: {
    Cr: { '4s': 1, '3d': 5 }, Cu: { '4s': 1, '3d': 10 }, Nb: { '5s': 1, '4d': 4 }, Mo: { '5s': 1, '4d': 5 }, Ru: { '5s': 1, '4d': 7 },
    Rh: { '5s': 1, '4d': 8 }, Pd: { '5s': 0, '4d': 10 }, Ag: { '5s': 1, '4d': 10 }, Pt: { '6s': 1, '5d': 9 }, Au: { '6s': 1, '5d': 10 },
    La: { '4f': 0, '5d': 1 }, Ce: { '4f': 1, '5d': 1 }, Gd: { '4f': 7, '5d': 1 }, Ac: { '5f': 0, '6d': 1 }, Th: { '5f': 0, '6d': 2 },
    Pa: { '5f': 2, '6d': 1 }, U: { '5f': 3, '6d': 1 }, Np: { '5f': 4, '6d': 1 }, Cm: { '5f': 7, '6d': 1 },
  },
  fill(count) {
    const out = [];
    let r = count;
    for (const o of this.ORDER) { if (r <= 0) break; const c = Math.min(r, this.CAP[o[1]]); out.push({ o, n: +o[0], l: o[1], e: c }); r -= c; }
    return out;
  },
  /* Konfiguration [{ o:'2p', n:2, l:'p', e:4 }] in Energie-Reihenfolge; Ionen: Kationen geben die äussersten ab */
  config(el, q = 0) {
    const E = CHEM_BY_SYM[el];
    if (!E || E.iso) return el === 'D' ? [{ o: '1s', n: 1, l: 's', e: 1 }] : [];
    let cfg = this.fill(E.z);
    const ex = this.EXC[el];
    if (ex) for (const [o, e] of Object.entries(ex)) { const s = cfg.find(x => x.o === o); if (s) s.e = e; else cfg.push({ o, n: +o[0], l: o[1], e }); }
    const L = { s: 0, p: 1, d: 2, f: 3 };
    for (let k = 0; k < q; k++) {   // Kation: höchstes n zuerst, darin höchstes l
      let best = null;
      for (const s of cfg) if (s.e > 0 && (!best || s.n > best.n || (s.n === best.n && L[s.l] > L[best.l]))) best = s;
      if (best) best.e--;
    }
    for (let k = 0; k < -q; k++) {   // Anion: nächstes freies Orbital
      let s = cfg.find(x => x.e < this.CAP[x.l]);
      if (!s) { const o = this.ORDER.find(x => !cfg.some(c => c.o === x)); if (!o) break; s = { o, n: +o[0], l: o[1], e: 0 }; cfg.push(s); }
      s.e++;
    }
    cfg.sort((a, b) => this.ORDER.indexOf(a.o) - this.ORDER.indexOf(b.o));
    return cfg.filter(x => x.e > 0);
  },
  SUP: '⁰¹²³⁴⁵⁶⁷⁸⁹',
  sup(n) { return String(n).replace(/\d/g, d => this.SUP[d]); },
  /* Text, z.B. „[He] 2s² 2p⁴“ (kurz) oder „1s² 2s² 2p⁴“ */
  configText(el, q = 0, short = true) {
    const cfg = this.config(el, q);
    let core = null, rest = cfg;
    if (short) {
      for (const [g, z] of [['Rn', 86], ['Xe', 54], ['Kr', 36], ['Ar', 18], ['Ne', 10], ['He', 2]]) {
        const c = this.fill(z);
        if (c.length >= cfg.length) continue;
        if (c.every((x, i) => cfg[i] && cfg[i].o === x.o && cfg[i].e === x.e)) { core = g; rest = cfg.slice(c.length); break; }
      }
    }
    return (core ? `[${core}] ` : '') + rest.map(x => x.o + this.sup(x.e)).join(' ');
  },
  /* Elektronen je Schale (K, L, M …) */
  shells(el, q = 0) {
    const out = [];
    for (const s of this.config(el, q)) out[s.n - 1] = (out[s.n - 1] || 0) + s.e;
    for (let i = 0; i < out.length; i++) out[i] = out[i] || 0;
    return out;
  },
  /* Valenzelektronen: Elektronen der äussersten Schale (Hauptgruppen) bzw. die s-Elektronen (Nebengruppen) */
  valence(el, q = 0) {
    const cfg = this.config(el, q);
    if (!cfg.length) return 0;
    const nmax = Math.max(...cfg.map(s => s.n));
    return cfg.filter(s => s.n === nmax).reduce((a, s) => a + s.e, 0);
  },

  /* ---------------------------------------------------------- vollständige Struktur (alle Atome, alle H) */
  full(m) {
    const G = ChemMol.expand(m);
    const atoms = [], bonds = [];
    for (let i = 0; i < G.n; i++) atoms.push({ i, el: G.el[i], q: G.q[i] || 0, x: G.x[i], y: G.y[i], src: G.src[i], h: G.h[i] });
    for (let i = 0; i < G.n; i++) for (const [j, o] of G.adj[i]) if (i < j) bonds.push({ a: i, b: j, o, s: '' });
    // Keile übernehmen (Richtung: schmales Ende a → breites Ende b)
    for (const b of m.bonds) {
      if (!b.s) continue;
      const ia = G.of.get(b.a), ib = G.of.get(b.b);
      const fb = bonds.find(x => (x.a === ia && x.b === ib) || (x.a === ib && x.b === ia));
      if (fb) { fb.s = b.s; fb.from = ia; fb.to = ib; }
    }
    // Kurzschreibweisen (COOH, Ph …) liegen alle auf einem Punkt → neu anordnen, an der alten Stelle
    if (m.atoms.some(a => a.ab && CHEM_ABBR[a.ab]) && typeof ChemLayout !== 'undefined') {
      const cx = atoms.reduce((s, a) => s + a.x, 0) / (atoms.length || 1), cy = atoms.reduce((s, a) => s + a.y, 0) / (atoms.length || 1);
      const lm = { atoms: atoms.map(a => ({ id: a.i, el: a.el, x: a.x, y: a.y })), bonds: bonds.map((b, k) => ({ id: 1e6 + k, a: b.a, b: b.b, o: b.o })), nid: 1 };
      ChemLayout.layout(lm);
      const nx = lm.atoms.reduce((s, a) => s + a.x, 0) / (lm.atoms.length || 1), ny = lm.atoms.reduce((s, a) => s + a.y, 0) / (lm.atoms.length || 1);
      lm.atoms.forEach((a, k) => { atoms[k].x = a.x - nx + cx; atoms[k].y = a.y - ny + cy; });
    }
    const adj = atoms.map(() => []);
    for (const b of bonds) { adj[b.a].push([b.b, b]); adj[b.b].push([b.a, b]); }
    // Wasserstoffe dazu (in den freien Richtungen)
    const n0 = atoms.length;
    for (let i = 0; i < n0; i++) {
      const a = atoms[i];
      if (!a.h) continue;
      const dirs = adj[i].map(([j]) => { const o = atoms[j]; const dx = o.x - a.x, dy = o.y - a.y, l = Math.hypot(dx, dy) || 1; return [dx / l, dy / l]; });
      for (let k = 0; k < a.h; k++) {
        const d = ChemRender.freeDir(dirs);
        dirs.push(d);
        const hi = atoms.length;
        atoms.push({ i: hi, el: 'H', q: 0, x: a.x + d[0] * BL * 0.8, y: a.y + d[1] * BL * 0.8, src: null, h: 0, implicit: true, parent: i });
        const b = { a: i, b: hi, o: 1, s: '' };
        bonds.push(b);
        adj[i].push([hi, b]); adj.push([[i, b]]);
      }
      a.h = 0;
    }
    // Elektronen: Valenz − Bindungen = freie Elektronen (Paare + ein Radikal)
    for (const a of atoms) {
      const V = this.valence(a.el, a.q), B = adj[a.i].reduce((s, [, b]) => s + b.o, 0);
      const free = Math.max(0, V - B);
      a.val = V; a.bonds = B; a.deg = adj[a.i].length; a.lp = Math.floor(free / 2); a.rad = free % 2;
      a.pi = adj[a.i].reduce((s, [, b]) => s + b.o - 1, 0);
      const sn = a.deg + a.lp + a.rad;
      a.hyb = a.el === 'H' || a.el === 'He' ? 's' : sn >= 6 ? 'sp³d²' : sn === 5 ? 'sp³d' : sn === 4 ? 'sp³' : sn === 3 ? 'sp²' : sn === 2 ? 'sp' : '';
    }
    return { atoms, bonds, adj };
  },
  /* Chemische Regeln (1.49) für Hinweise im Editor: Oktettregel (2. Periode), Formalladung, Radikale, Hückel.
   * Ergebnis: [{ k: 'warn'|'info', t: Text, ids: [Atom-IDs der Zeichnung] }] */
  rules(m) {
    if (!m.atoms.length) return [];
    let F;
    try { F = this.full(m); } catch (e) { return []; }
    const out = [], name = (a) => (CHEM_BY_SYM[a.el] ? CHEM_BY_SYM[a.el].name : a.el);
    const P2 = new Set(['B', 'C', 'N', 'O', 'F']);
    const oct = [], fc = new Map(), rad = [];
    for (const a of F.atoms) {
      if (a.src == null) continue;
      const e = 2 * a.bonds + 2 * a.lp + a.rad;
      if (P2.has(a.el) && e > 8) {
        oct.push(a.src);
        // Vorschlag: so viel positive Ladung, bis das Oktett passt (N mit 4 Bindungen → N⁺, O mit 3 → O⁺)
        const need = Math.ceil((e - 8) / 1);
        if (a.bonds <= 4 && !a.q) fc.set(a.src, `${a.el}${need > 1 ? need : ''}⁺`);
      }
      if (a.rad && a.el !== 'H' && !oct.includes(a.src)) rad.push(a);
    }
    if (oct.length) out.push({ k: 'warn', t: `Oktettregel verletzt (mehr als 8 Elektronen an ${[...new Set(oct.map(id => { const a = F.atoms.find(x => x.src === id); return a.el; }))].join(', ')})` + (fc.size ? ` – Formalladung setzen: ${[...fc.values()].join(', ')}?` : ''), ids: oct });
    if (rad.length) out.push({ k: 'info', t: `Radikal: ungepaartes Elektron an ${[...new Set(rad.map(name))].join(', ')}` + (rad.some(a => a.el === 'C') ? ' (oder Ladung: Carbokation C⁺ / Carbanion C⁻)' : ''), ids: rad.map(a => a.src) });
    for (const a of F.atoms) if (a.src != null && P2.has(a.el) && a.el !== 'B' && !a.rad && 2 * a.bonds + 2 * a.lp < 8 && a.el !== 'H') { out.push({ k: 'info', t: `Elektronenmangel: ${name(a)} hat nur ${2 * a.bonds + 2 * a.lp} Valenzelektronen (Elektronensextett)`, ids: [a.src] }); break; }
    // Hückel-Regel für Ringe aus sp²-Atomen (4n+2 π-Elektronen = aromatisch, 4n = antiaromatisch)
    const bond = (i, j) => F.adj[i].find(([x]) => x === j);
    for (const r of this.rings(F)) {
      if (r.length < 3 || r.length > 8) continue;
      let pi = 0, ok = true, anyDouble = false;
      for (let k = 0; k < r.length; k++) {
        const i = r[k], a = F.atoms[i], prev = r[(k + r.length - 1) % r.length], next = r[(k + 1) % r.length];
        const inDouble = [prev, next].some(j => { const b = bond(i, j); return b && b[1].o === 2; });
        const exoDouble = F.adj[i].some(([j, b]) => b.o >= 2 && !r.includes(j));
        if (inDouble) { pi += 1; anyDouble = true; }
        else if (exoDouble) pi += 0;
        else if (a.q > 0 && a.el === 'C') pi += 0;
        else if (a.lp > 0) pi += 2;
        else { ok = false; break; }
      }
      if (!ok || !anyDouble) continue;
      if (pi % 4 === 2) out.push({ k: 'info', t: `Ring mit ${r.length} Atomen: aromatisch nach Hückel (${pi} π-Elektronen = 4n+2, n = ${(pi - 2) / 4})`, ids: r.map(i => F.atoms[i].src).filter(x => x != null) });
      else if (pi % 4 === 0) out.push({ k: 'info', t: `Ring mit ${r.length} Atomen: antiaromatisch (${pi} π-Elektronen = 4n), wenn eben`, ids: r.map(i => F.atoms[i].src).filter(x => x != null) });
    }
    return out;
  },
  dirs(F, a) {
    return F.adj[a.i].map(([j]) => { const o = F.atoms[j]; const dx = o.x - a.x, dy = o.y - a.y, l = Math.hypot(dx, dy) || 1; return [dx / l, dy / l]; });
  },
  /* freie Richtungen für k Elektronenpaare: zuerst die grössten Lücken, bei einem Nachbarn im 90°-Raster */
  freeDirs(F, a, k) {
    const dirs = this.dirs(F, a), out = [];
    if (dirs.length === 1 && k >= 2) {
      const t = Math.atan2(dirs[0][1], dirs[0][0]);
      const cand = k === 2 ? [t + Math.PI * 2 / 3, t - Math.PI * 2 / 3] : [t + Math.PI, t + Math.PI / 2, t - Math.PI / 2];
      for (const c of cand.slice(0, k)) out.push([Math.cos(c), Math.sin(c)]);
      return out;
    }
    if (!dirs.length && k) { const base = [[0, -1], [1, 0], [0, 1], [-1, 0]]; return base.slice(0, Math.min(4, k)); }
    for (let j = 0; j < k; j++) { const d = ChemRender.freeDir([...dirs, ...out]); out.push(d); }
    return out;
  },
  color(el, opts) { return opts.color === false ? '#000' : (CHEM_COLORS[el] || '#000'); },

  /* ---------------------------------------------------------- Lewis */
  lewis(m, opts) {
    const F = this.full(m), FS = ChemRender.FS, out = [], txt = [], labels = new Map();
    const box = this.boxer();
    const R = FS * 0.58;
    const LW = ChemRender.LW;
    for (const b of F.bonds) {
      const A = F.atoms[b.a], B = F.atoms[b.b];
      const dx = B.x - A.x, dy = B.y - A.y, l = Math.hypot(dx, dy) || 1, ux = dx / l, uy = dy / l, nx = -uy, ny = ux;
      const ra = R * (A.el.length > 1 ? 1.25 : 1), rb = R * (B.el.length > 1 ? 1.25 : 1);
      const x1 = A.x + ux * ra, y1 = A.y + uy * ra, x2 = B.x - ux * rb, y2 = B.y - uy * rb;
      const offs = b.o === 2 ? [-2.6, 2.6] : b.o === 3 ? [-4.2, 0, 4.2] : [0];
      for (const o of offs) out.push(`<line x1="${cmF2(x1 + nx * o)}" y1="${cmF2(y1 + ny * o)}" x2="${cmF2(x2 + nx * o)}" y2="${cmF2(y2 + ny * o)}"/>`);
    }
    for (const a of F.atoms) {
      const w = ChemRender.width(a.el, FS);
      const col = this.color(a.el, opts);
      txt.push(`<text font-family='${ChemRender.FONT}' font-size="${FS}" fill="${col}" x="${cmF2(a.x - w / 2)}" y="${cmF2(a.y + FS * 0.36)}">${chemEsc(a.el)}</text>`);
      box.add(a.x - w / 2 - 2, a.y - FS * 0.6, a.x + w / 2 + 2, a.y + FS * 0.6);
      if (a.src != null) labels.set(a.src, [{ x0: a.x - w / 2, x1: a.x + w / 2, y0: a.y - FS * 0.55, y1: a.y + FS * 0.45 }]);
      const free = this.freeDirs(F, a, a.lp + a.rad);
      const rr = R * (a.el.length > 1 ? 1.3 : 1.08);
      free.forEach((d, k) => {
        const cx = a.x + d[0] * rr, cy = a.y + d[1] * rr, px = -d[1], py = d[0];
        if (k < a.lp) {
          if (opts.lewisDots) out.push(`<circle cx="${cmF2(cx + px * 2.6)}" cy="${cmF2(cy + py * 2.6)}" r="1.5" fill="#000" stroke="none"/><circle cx="${cmF2(cx - px * 2.6)}" cy="${cmF2(cy - py * 2.6)}" r="1.5" fill="#000" stroke="none"/>`);
          else out.push(`<line x1="${cmF2(cx + px * FS * 0.3)}" y1="${cmF2(cy + py * FS * 0.3)}" x2="${cmF2(cx - px * FS * 0.3)}" y2="${cmF2(cy - py * FS * 0.3)}"/>`);
        } else out.push(`<circle cx="${cmF2(cx)}" cy="${cmF2(cy)}" r="1.6" fill="#000" stroke="none"/>`);
        box.add(cx - 6, cy - 6, cx + 6, cy + 6);
      });
      if (a.q) {
        const d = ChemRender.freeDir([...this.dirs(F, a), ...free], [[0, 1]]);
        const cx = a.x + d[0] * FS * 0.95, cy = a.y + d[1] * FS * 0.95;
        out.push(`<circle cx="${cmF2(cx)}" cy="${cmF2(cy)}" r="${cmF2(FS * 0.36)}" fill="#fff" stroke="#000" stroke-width="0.9"/>`);
        const t = (Math.abs(a.q) > 1 ? Math.abs(a.q) : '') + (a.q > 0 ? '+' : '−');
        const tw = ChemRender.width(t, FS * 0.55);
        txt.push(`<text font-family='${ChemRender.FONT}' font-size="${cmF2(FS * 0.55)}" x="${cmF2(cx - tw / 2)}" y="${cmF2(cy + FS * 0.2)}">${t}</text>`);
        box.add(cx - FS * 0.4, cy - FS * 0.4, cx + FS * 0.4, cy + FS * 0.4);
      }
    }
    // Wasserstoffe als eigene Elemente (1.49): Lage und Atom, an dem sie hängen – im Editor anklickbar
    const hpos = F.atoms.filter(a => a.implicit && F.atoms[a.parent].src != null).map(a => ({ pid: F.atoms[a.parent].src, x: a.x, y: a.y }));
    return { body: `<g stroke="#000" stroke-width="${LW}" stroke-linecap="round">${out.join('')}</g>${txt.join('')}`, box: box.get(), labels, hpos };
  },

  /* ---------------------------------------------------------- Bohr */
  bohr(m, opts) {
    const F = this.full(m);
    const K = 6, DR = 8.5;   // Kernradius, Schalenabstand
    const info = F.atoms.map(a => { const sh = this.shells(a.el, a.q); return { sh, R: K + DR * Math.max(1, sh.length) }; });
    // Abstände: gebundene Atome überlappen mit ihren äussersten Schalen
    let s = 1;
    for (const b of F.bonds) {
      const A = F.atoms[b.a], B = F.atoms[b.b], d = Math.hypot(B.x - A.x, B.y - A.y) || 1;
      s = Math.max(s, (info[b.a].R + info[b.b].R - DR * 1.2) / d);
    }
    const cx = F.atoms.reduce((t, a) => t + a.x, 0) / (F.atoms.length || 1), cy = F.atoms.reduce((t, a) => t + a.y, 0) / (F.atoms.length || 1);
    const P = F.atoms.map(a => [cx + (a.x - cx) * s, cy + (a.y - cy) * s]);
    const box = this.boxer(), shellsSvg = [], el = [], nuc = [];
    const E_OWN = '#1f6fd1', E_BOND = '#b0388f';
    const dot = (x, y, c) => el.push(`<circle cx="${cmF2(x)}" cy="${cmF2(y)}" r="2.1" fill="${c}"/>`);
    F.atoms.forEach((a, k) => {
      const [x, y] = P[k], { sh, R } = info[k];
      for (let n = 1; n <= sh.length; n++) {
        const r = K + DR * n;
        shellsSvg.push(`<circle cx="${cmF2(x)}" cy="${cmF2(y)}" r="${cmF2(r)}" fill="none" stroke="${n === sh.length ? '#8d939a' : '#c2c6cb'}" stroke-width="${n === sh.length ? 1 : 0.8}"/>`);
      }
      box.add(x - R - 4, y - R - 4, x + R + 4, y + R + 4);
      // innere Schalen: gleichmässig
      for (let n = 1; n < sh.length; n++) {
        const cnt = sh[n - 1], r = K + DR * n;
        for (let e = 0; e < cnt; e++) { const t = -Math.PI / 2 + n * 0.35 + e * 2 * Math.PI / cnt; dot(x + Math.cos(t) * r, y + Math.sin(t) * r, E_OWN); }
      }
      // äusserste Schale: freie Elektronen (Paare/einzeln) in den freien Richtungen
      const r = K + DR * sh.length;
      if (!F.adj[a.i].length) {
        const V = sh[sh.length - 1] || 0, pos = [[0, -1], [1, 0], [0, 1], [-1, 0]];
        const per = [0, 0, 0, 0];
        for (let e = 0; e < Math.min(V, 8); e++) per[e % 4]++;
        if (V > 8) for (let e = 8; e < V; e++) { const t = e * 2 * Math.PI / V; dot(x + Math.cos(t) * r, y + Math.sin(t) * r, E_OWN); }
        pos.forEach((d, j) => { const t = Math.atan2(d[1], d[0]); if (per[j] === 1) dot(x + d[0] * r, y + d[1] * r, E_OWN); if (per[j] === 2) for (const dt of [-0.17, 0.17]) dot(x + Math.cos(t + dt) * r, y + Math.sin(t + dt) * r, E_OWN); });
      } else {
        const free = this.freeDirs(F, a, a.lp + a.rad);
        free.forEach((d, j) => {
          const t = Math.atan2(d[1], d[0]);
          if (j < a.lp) for (const dt of [-0.16, 0.16]) dot(x + Math.cos(t + dt) * r, y + Math.sin(t + dt) * r, E_OWN);
          else dot(x + d[0] * r, y + d[1] * r, E_OWN);
        });
      }
      const col = a.el === 'H' ? '#9aa3ad' : (CHEM_COLORS[a.el] || '#555');
      nuc.push(`<circle cx="${cmF2(x)}" cy="${cmF2(y)}" r="${K + 1}" fill="${col}"/>`);
      const lab = a.el + (a.q ? (Math.abs(a.q) > 1 ? Math.abs(a.q) : '') + (a.q > 0 ? '+' : '−') : '');
      const fs = lab.length > 2 ? 6.2 : 7.6, w = ChemRender.width(lab, fs);
      nuc.push(`<text font-family='${ChemRender.FONT}' font-size="${fs}" font-weight="700" fill="#fff" x="${cmF2(x - w / 2)}" y="${cmF2(y + fs * 0.36)}">${chemEsc(lab)}</text>`);
    });
    // gemeinsame Elektronenpaare in der Überlappung
    for (const b of F.bonds) {
      const [ax, ay] = P[b.a], [bx, by] = P[b.b];
      const d = Math.hypot(bx - ax, by - ay) || 1, ux = (bx - ax) / d, uy = (by - ay) / d, nx = -uy, ny = ux;
      const ra = info[b.a].R, rb = info[b.b].R;
      const t = Math.min(d, Math.max(0, (ra + (d - rb)) / 2));   // Mitte der Überlappung auf der Achse
      const mx = ax + ux * t, my = ay + uy * t;
      for (let k = 0; k < b.o; k++) {
        const o = (k - (b.o - 1) / 2) * 6.2;
        dot(mx + nx * o - ux * 2.4, my + ny * o - uy * 2.4, E_BOND);
        dot(mx + nx * o + ux * 2.4, my + ny * o + uy * 2.4, E_BOND);
      }
    }
    // Legende
    const bb = box.get();
    const lx = bb.x0, ly = bb.y1 + 11, fs = 7.5;
    const leg = `<circle cx="${cmF2(lx + 4)}" cy="${cmF2(ly - 3)}" r="2.1" fill="${E_BOND}"/><text font-family='${ChemRender.FONT}' font-size="${fs}" fill="#444" x="${cmF2(lx + 10)}" y="${cmF2(ly)}">gemeinsame Elektronenpaare</text>` +
      `<circle cx="${cmF2(lx + 118)}" cy="${cmF2(ly - 3)}" r="2.1" fill="${E_OWN}"/><text font-family='${ChemRender.FONT}' font-size="${fs}" fill="#444" x="${cmF2(lx + 124)}" y="${cmF2(ly)}">eigene Elektronen</text>`;
    if (F.bonds.length) box.add(lx, ly - 9, lx + 200, ly + 3);
    return { body: shellsSvg.join('') + el.join('') + nuc.join('') + (F.bonds.length ? leg : ''), box: box.get(), labels: new Map() };
  },

  /* ---------------------------------------------------------- Orbitale */
  orbital(m, opts) {
    const F = this.full(m);
    const S = 1.55;
    const cx = F.atoms.reduce((t, a) => t + a.x, 0) / (F.atoms.length || 1), cy = F.atoms.reduce((t, a) => t + a.y, 0) / (F.atoms.length || 1);
    const P = F.atoms.map(a => [cx + (a.x - cx) * S, cy + (a.y - cy) * S]);
    const box = this.boxer(), back = [], mid = [], front = [];
    const tint = (el) => el === 'H' ? '#7fb2ec' : el === 'C' ? '#8a96a3' : (CHEM_COLORS[el] || '#8a96a3');
    // Keule (Hybridorbital) von (x,y) in Richtung t, Länge L, Breite W
    const lobe = (x, y, t, L, W, fill, op, small) => {
      const c = Math.cos(t), s2 = Math.sin(t), px = -s2, py = c;
      const tipx = x + c * L, tipy = y + s2 * L;
      const path = `M${cmF2(x)},${cmF2(y)} C${cmF2(x + c * L * 0.25 + px * W)},${cmF2(y + s2 * L * 0.25 + py * W)} ${cmF2(tipx + px * W * 0.9)},${cmF2(tipy + py * W * 0.9)} ${cmF2(tipx)},${cmF2(tipy)} C${cmF2(tipx - px * W * 0.9)},${cmF2(tipy - py * W * 0.9)} ${cmF2(x + c * L * 0.25 - px * W)},${cmF2(y + s2 * L * 0.25 - py * W)} ${cmF2(x)},${cmF2(y)}Z`;
      box.add(tipx - W, tipy - W, tipx + W, tipy + W);
      return `<path d="${path}" fill="${fill}" fill-opacity="${op}" stroke="${fill}" stroke-opacity=".9" stroke-width="0.8"/>` + (small ? lobe(x, y, t + Math.PI, L * 0.22, W * 0.45, fill, op * 0.8, false) : '');
    };
    F.atoms.forEach((a, k) => {
      const [x, y] = P[k];
      box.add(x - 12, y - 12, x + 12, y + 12);
      if (a.el === 'H') { mid.push(`<circle cx="${cmF2(x)}" cy="${cmF2(y)}" r="10" fill="#7fb2ec" fill-opacity=".42" stroke="#5a8fd0" stroke-width=".8"/>`); return; }
      const col = tint(a.el);
      // σ-Keulen zu den Nachbarn
      for (const [j] of F.adj[a.i]) {
        const [x2, y2] = P[j], d = Math.hypot(x2 - x, y2 - y) || 1, t = Math.atan2(y2 - y, x2 - x);
        mid.push(lobe(x, y, t, F.atoms[j].el === 'H' ? d * 0.62 : d * 0.56, 8.5, col, 0.36, true));
      }
      // freie Elektronenpaare: eigene Keulen mit ↑↓
      const free = this.freeDirs(F, a, a.lp + a.rad);
      free.forEach((d, j) => {
        const t = Math.atan2(d[1], d[0]);
        mid.push(lobe(x, y, t, 23, 9, '#f0b44c', 0.42, true));
        const ex = x + d[0] * 15, ey = y + d[1] * 15;
        front.push(j < a.lp ? `<text font-family='${ChemRender.FONT}' font-size="8" fill="#7a4e00" x="${cmF2(ex - 4.2)}" y="${cmF2(ey + 3)}">↑↓</text>` : `<circle cx="${cmF2(ex)}" cy="${cmF2(ey)}" r="1.7" fill="#7a4e00"/>`);
      });
      // p-Orbitale der π-Bindungen (senkrecht zur Ebene → oben/unten gezeichnet; zweites π quer dazu)
      if (a.pi > 0) {
        const piB = F.adj[a.i].filter(([, b]) => b.o > 1);
        const bt = piB.length ? Math.atan2(P[piB[0][0]][1] - y, P[piB[0][0]][0] - x) : 0;
        back.push(lobe(x, y, -Math.PI / 2, 22, 7.5, '#3d7bd9', 0.4, false), lobe(x, y, Math.PI / 2, 22, 7.5, '#d9533d', 0.32, false));
        if (a.pi > 1) back.push(lobe(x, y, bt + Math.PI / 2, 17, 6, '#3d7bd9', 0.3, false), lobe(x, y, bt - Math.PI / 2, 17, 6, '#d9533d', 0.25, false));
      }
    });
    // π-Überlappung andeuten
    for (const b of F.bonds) {
      if (b.o < 2) continue;
      const [ax, ay] = P[b.a], [bx, by] = P[b.b];
      for (const s of [-1, 1]) back.push(`<path d="M${cmF2(ax)},${cmF2(ay + s * 18)} Q${cmF2((ax + bx) / 2)},${cmF2((ay + by) / 2 + s * 24)} ${cmF2(bx)},${cmF2(by + s * 18)}" fill="none" stroke="#3d7bd9" stroke-width="1" stroke-dasharray="3 2" opacity=".7"/>`);
    }
    // Atomsymbole und Hybridisierung
    F.atoms.forEach((a, k) => {
      const [x, y] = P[k];
      const fs = a.el === 'H' ? 9 : 11, w = ChemRender.width(a.el, fs);
      front.push(`<text font-family='${ChemRender.FONT}' font-size="${fs}" font-weight="700" fill="${a.el === 'H' ? '#1d4f8f' : this.color(a.el, opts)}" x="${cmF2(x - w / 2)}" y="${cmF2(y + fs * 0.36)}">${chemEsc(a.el)}</text>`);
      if (a.el !== 'H' && a.hyb && (a.deg || a.lp)) { const hw = ChemRender.width(a.hyb, 7.5); front.push(`<text font-family='${ChemRender.FONT}' font-size="7.5" fill="#555" x="${cmF2(x + 4)}" y="${cmF2(y + 13)}">${a.hyb}</text>`); box.add(x, y, x + 4 + hw, y + 15); }
    });
    let body = back.join('') + mid.join('') + front.join('');
    let bb = box.get();
    // Kästchenschreibweise und Orbitalformen darunter
    if (opts.orbBoxes !== false) {
      const kinds = [], seen = new Set();
      for (const a of F.atoms) { const key = a.el + '|' + a.q; if (!seen.has(key)) { seen.add(key); kinds.push([a.el, a.q]); } }
      let y = bb.y1 + 16;
      for (const [e, q] of kinds) { const r = this.boxDiagram(e, q, bb.x0, y); body += r.svg; y = r.y1 + 8; box.add(bb.x0, y - 8, r.x1, r.y1); }
      const sh = this.shapesRow(kinds, bb.x0, y + 4);
      body += sh.svg; box.add(bb.x0, y, sh.x1, sh.y1);
      bb = box.get();
    }
    return { body, box: bb, labels: new Map() };
  },
  /* Kästchenschreibweise eines Elements ab (x, y): Pfeile nach Hund (erst einzeln ↑, dann ↓) */
  boxDiagram(el, q, x, y) {
    const cfg = this.config(el, q), W = 12, H = 14, FS = 9;
    const lab = el + (q ? (Math.abs(q) > 1 ? Math.abs(q) : '') + (q > 0 ? '+' : '−') : '');
    let s = `<text font-family='${ChemRender.FONT}' font-size="10" font-weight="700" x="${cmF2(x)}" y="${cmF2(y + 11)}">${chemEsc(lab)}</text>`;
    const txt = this.configText(el, q, true);
    s += `<text font-family='${ChemRender.FONT}' font-size="${FS}" fill="#444" x="${cmF2(x + 26)}" y="${cmF2(y + 11)}">${chemEsc(txt)}</text>`;
    let cx = x + 26, x1 = x + 26 + ChemRender.width(txt, FS);
    const yb = y + 17;
    // lange Konfigurationen: nur die Valenzschale (+ d) als Kästchen
    let list = cfg;
    if (cfg.length > 6) { const nmax = Math.max(...cfg.map(c => c.n)); list = cfg.filter(c => c.n === nmax || (c.l === 'd' && c.n === nmax - 1) || (c.l === 'f' && c.n === nmax - 2)); }
    for (const sub of list) {
      const nb = this.CAP[sub.l] / 2;
      const up = Math.min(sub.e, nb), dn = Math.max(0, sub.e - nb);
      for (let k = 0; k < nb; k++) {
        const bx = cx + k * W;
        s += `<rect x="${cmF2(bx)}" y="${cmF2(yb)}" width="${W}" height="${H}" fill="#fff" stroke="#555" stroke-width=".8"/>`;
        if (k < up) s += `<path d="M${cmF2(bx + W * 0.36)},${cmF2(yb + H - 2.5)}V${cmF2(yb + 3)}m-2.4,2.6l2.4,-2.6 2.4,2.6" fill="none" stroke="#1f6fd1" stroke-width="1.1"/>`;
        if (k < dn) s += `<path d="M${cmF2(bx + W * 0.66)},${cmF2(yb + 2.5)}V${cmF2(yb + H - 3)}m-2.4,-2.6l2.4,2.6 2.4,-2.6" fill="none" stroke="#d1341d" stroke-width="1.1"/>`;
      }
      const lw = ChemRender.width(sub.o, 8);
      s += `<text font-family='${ChemRender.FONT}' font-size="8" fill="#444" x="${cmF2(cx + nb * W / 2 - lw / 2)}" y="${cmF2(yb + H + 9)}">${sub.o}</text>`;
      cx += nb * W + 7;
    }
    x1 = Math.max(x1, cx);
    return { svg: s, x1, y1: yb + H + 11 };
  },
  /* Formen der besetzten Orbitaltypen (s Kugel, p Hantel in x/y/z, d Rosette) */
  shapesRow(kinds, x, y) {
    const types = new Set();
    for (const [e, q] of kinds) for (const c of this.config(e, q)) types.add(c.l);
    let s = `<text font-family='${ChemRender.FONT}' font-size="9" fill="#444" x="${cmF2(x)}" y="${cmF2(y + 22)}">Orbitalformen:</text>`;
    let cx = x + 72;
    const lab = (t, xx) => { const w = ChemRender.width(t, 8); s += `<text font-family='${ChemRender.FONT}' font-size="8" font-style="italic" fill="#444" x="${cmF2(xx - w / 2)}" y="${cmF2(y + 44)}">${t}</text>`; };
    const lobe = (x0, y0, t, L, W, c1) => { const c = Math.cos(t), sn = Math.sin(t), px = -sn, py = c, tx = x0 + c * L, ty = y0 + sn * L; return `<path d="M${cmF2(x0)},${cmF2(y0)} C${cmF2(x0 + c * L * .2 + px * W)},${cmF2(y0 + sn * L * .2 + py * W)} ${cmF2(tx + px * W)},${cmF2(ty + py * W)} ${cmF2(tx)},${cmF2(ty)} C${cmF2(tx - px * W)},${cmF2(ty - py * W)} ${cmF2(x0 + c * L * .2 - px * W)},${cmF2(y0 + sn * L * .2 - py * W)} ${cmF2(x0)},${cmF2(y0)}Z" fill="${c1}" fill-opacity=".45" stroke="${c1}" stroke-width=".7"/>`; };
    const B = '#3d7bd9', R = '#d9533d';
    if (types.has('s')) { s += `<circle cx="${cmF2(cx)}" cy="${cmF2(y + 20)}" r="12" fill="${B}" fill-opacity=".35" stroke="${B}" stroke-width=".7"/>`; lab('s', cx); cx += 36; }
    if (types.has('p')) {
      const axes = [['pₓ', 0], ['p_y', Math.PI / 2], ['p_z', -Math.PI / 4]];
      for (const [t, a] of axes) { s += lobe(cx, y + 20, a, 15, 6, B) + lobe(cx, y + 20, a + Math.PI, 15, 6, R); lab(t.replace('_y', 'ᵧ').replace('_z', 'z'), cx); cx += 38; }
    }
    if (types.has('d')) {
      for (const k of [0, 1, 2, 3]) s += lobe(cx, y + 20, Math.PI / 4 + k * Math.PI / 2, 14, 5, k % 2 ? R : B);
      lab('d', cx); cx += 36;
      s += lobe(cx, y + 20, -Math.PI / 2, 16, 5, B) + lobe(cx, y + 20, Math.PI / 2, 16, 5, B) + `<ellipse cx="${cmF2(cx)}" cy="${cmF2(y + 20)}" rx="10" ry="3.2" fill="${R}" fill-opacity=".45" stroke="${R}" stroke-width=".7"/>`;
      lab('d_z²'.replace('_z²', 'z²'), cx); cx += 36;
    }
    if (types.has('f')) { s += `<text font-family='${ChemRender.FONT}' font-size="8" fill="#444" x="${cmF2(cx - 6)}" y="${cmF2(y + 24)}">f …</text>`; cx += 30; }
    return { svg: s, x1: cx, y1: y + 48 };
  },

  /* ---------------------------------------------------------- 3D */
  RCOV: { H: 0.31, C: 0.76, N: 0.71, O: 0.66, F: 0.57, Cl: 1.02, Br: 1.2, I: 1.39, S: 1.05, P: 1.07, B: 0.84, Si: 1.11, Se: 1.2, Na: 1.66, K: 2.03, Li: 1.28, Mg: 1.41, Ca: 1.76, Al: 1.21 },
  RVDW: { H: 1.2, C: 1.7, N: 1.55, O: 1.52, F: 1.47, Cl: 1.75, Br: 1.85, I: 1.98, S: 1.8, P: 1.8, B: 1.92, Si: 2.1, Se: 1.9, Na: 2.27, K: 2.75 },
  CPK: { H: '#f4f4f4', C: '#4a4a4a', N: '#3050f8', O: '#ff2a1a', F: '#62d04f', Cl: '#2fc32f', Br: '#a62929', I: '#940094', S: '#f2d22a', P: '#ff8000', B: '#ffb5b5', Si: '#d0b080', Na: '#ab5cf2', K: '#8f40d4' },
  _cache: new Map(),
  /* Ringe (kleinste, bis 8 Atome) der schweren Atome: zu jeder Bindung der kürzeste andere Weg zwischen ihren Enden */
  rings(F) {
    const A = F.atoms, out = [], seen = new Set();
    const heavy = (i) => A[i].el !== 'H';
    for (const b of F.bonds) {
      if (!heavy(b.a) || !heavy(b.b)) continue;
      const prev = new Map([[b.a, -1]]), qu = [b.a];
      while (qu.length && !prev.has(b.b)) {
        const v = qu.shift();
        for (const [w] of F.adj[v]) {
          if (!heavy(w) || prev.has(w) || (v === b.a && w === b.b)) continue;
          prev.set(w, v); qu.push(w);
        }
      }
      if (!prev.has(b.b)) continue;
      const ring = [];
      for (let v = b.b; v !== -1; v = prev.get(v)) ring.push(v);
      if (ring.length < 3 || ring.length > 8) continue;
      const k = [...ring].sort((x, y) => x - y).join(',');
      if (!seen.has(k)) { seen.add(k); out.push(ring); }
    }
    return out;
  },
  /* 3D-Koordinaten (Å): Startwerte aus der Zeichnung, dann Längen, Winkel, Abstossung und ebene sp²-Zentren
   * wie mit Federn entspannen (positionsbasiert, stabil, ~1 ms für 50 Atome × 600 Schritte).
   * Seit 1.49 realistischere Konformationen: gesättigte Sechsringe starten als SESSEL (abwechselnd ±0,25 Å, axiale H
   * senkrecht, äquatoriale nach aussen), Fünfringe als Briefumschlag, aromatische/sp²-Ringe werden in eine Ebene
   * gezwungen, und an Einfachbindungen zwischen sp³-Atomen sorgen 1-4-Mindestabstände für gestaffelte Stellungen. */
  embed(m) {
    const key = JSON.stringify([m.atoms.map(a => [a.el, a.x, a.y, a.q, a.ab]), m.bonds.map(b => [b.a, b.b, b.o, b.s])]);
    if (this._cache.has(key)) return this._cache.get(key);
    const F = this.full(m), A = F.atoms, n = A.length, K = 1.5 / BL;
    const X = new Float64Array(n), Y = new Float64Array(n), Z = new Float64Array(n);
    // kleine Startauslenkung nur bei sp³ (Ringe sollen sich falten), sp²/sp bleiben eben
    const flat = (a) => a.hyb === 'sp²' || a.hyb === 'sp' || (a.parent != null && (A[a.parent].hyb === 'sp²' || A[a.parent].hyb === 'sp'));
    for (const a of A) { X[a.i] = a.x * K; Y[a.i] = a.y * K; Z[a.i] = flat(a) ? 0 : Math.sin(a.i * 12.9898 + 1) * 0.25; }
    // Ringe: Startkonformation (Sessel, Briefumschlag) – sp²-Ringe bleiben eben
    const rings = this.rings(F);
    const ringOf = new Map();
    for (const r of rings) for (const i of r) if (!ringOf.has(i) || ringOf.get(i).length > r.length) ringOf.set(i, r);
    const flatRings = rings.filter(r => r.every(i => A[i].hyb === 'sp²' || A[i].hyb === 'sp'));
    // gesättigte Ringe: Nachbarn im Ring abwechselnd oben/unten (zweifarbig über alle Ringbindungen – so passen auch
    // anellierte Sechsringe wie Decalin als zwei Sessel zusammen); ungerade Ringe: Briefumschlag
    const sat = (r) => r.every(i => A[i].hyb === 'sp³');
    const side = new Map();
    for (const r of rings.filter(r => sat(r) && r.length % 2 === 0)) {
      if (r.some(i => side.has(i))) continue;
      const stack = [[r[0], 1]];
      while (stack.length) {
        const [v, sg] = stack.pop();
        if (side.has(v)) continue;
        side.set(v, sg);
        for (const rr of rings) {
          if (!sat(rr) || rr.length % 2 || !rr.includes(v)) continue;
          const k = rr.indexOf(v);
          for (const w of [rr[(k + 1) % rr.length], rr[(k + rr.length - 1) % rr.length]]) if (!side.has(w)) stack.push([w, -sg]);
        }
      }
    }
    for (const [i, sg] of side) Z[i] = sg * 0.25;
    for (const r of rings) if (sat(r) && r.length % 2) r.forEach((i, k) => { if (!side.has(i)) Z[i] = k === 0 ? 0.62 : 0; });
    // Substituenten an Ringatomen (sp³): ein H axial (senkrecht, auf der Seite, zu der das Atom ausweicht), alles
    // andere äquatorial (nach aussen) – grosse Reste also äquatorial wie im energieärmsten Sessel
    const placed = new Set();
    for (const [p, r] of ringOf) {
      if (A[p].hyb !== 'sp³') continue;
      const subs = F.adj[p].map(([j]) => j).filter(j => !r.includes(j) && !(ringOf.has(j) && ringOf.get(j).includes(p)) && !placed.has(j));
      if (!subs.length) continue;
      const cx = r.reduce((t, i) => t + X[i], 0) / r.length, cy = r.reduce((t, i) => t + Y[i], 0) / r.length;
      const up = Z[p] >= 0 ? 1 : -1, ox = X[p] - cx, oy = Y[p] - cy, ol = Math.hypot(ox, oy) || 1;
      const ax = subs.find(j => A[j].el === 'H') ?? (subs.length > 1 ? subs[1] : null);
      for (const j of subs) {
        const L = A[j].el === 'H' ? 1.09 : 1.52;
        if (j === ax) { X[j] = X[p]; Y[j] = Y[p]; Z[j] = Z[p] + up * L; }
        else { X[j] = X[p] + ox / ol * L * 0.94; Y[j] = Y[p] + oy / ol * L * 0.94; Z[j] = Z[p] - up * L * 0.33; }
        placed.add(j);
        if (A[j].implicit) A[j].ringH = true;
      }
    }
    for (const b of F.bonds) if (b.s === 'w' || b.s === 'h') Z[b.to] += b.s === 'w' ? 1.1 : -1.1;
    // H an einem Zentrum mit Keilen: auf die andere Seite
    for (const a of A) {
      if (!a.implicit || a.ringH) continue;
      const p = a.parent, wz = F.adj[p].reduce((s2, [j]) => s2 + (A[j].implicit ? 0 : Z[j] - Z[p]), 0);
      Z[a.i] = Z[p] + (Math.abs(wz) > 0.3 ? -Math.sign(wz) * 0.9 : (a.i % 2 ? 0.8 : -0.8));
    }
    const rc = (e) => this.RCOV[e] || 1.3;
    const cons = [];   // [i, j, Länge, Steifigkeit]
    for (const b of F.bonds) cons.push([b.a, b.b, rc(A[b.a].el) + rc(A[b.b].el) - (b.o === 2 ? 0.2 : b.o === 3 ? 0.34 : 0), 0.9]);
    const ang = (a) => a.hyb === 'sp' ? 180 : a.hyb === 'sp²' ? 120 : a.hyb === 's' ? 0 : 109.47;
    const near = new Set();
    for (const a of A) {
      const nb = F.adj[a.i];
      for (let p = 0; p < nb.length; p++) for (let q = p + 1; q < nb.length; q++) {
        const j = nb[p][0], k = nb[q][0];
        const L1 = rc(a.el) + rc(A[j].el), L2 = rc(a.el) + rc(A[k].el), t = ang(a) * Math.PI / 180;
        const th = nb.length > 4 ? 90 * Math.PI / 180 : t;
        cons.push([j, k, Math.sqrt(L1 * L1 + L2 * L2 - 2 * L1 * L2 * Math.cos(th)), 0.35]);
        near.add(Math.min(j, k) + ',' + Math.max(j, k));
      }
      for (const [j] of nb) near.add(Math.min(a.i, j) + ',' + Math.max(a.i, j));
    }
    // 1-4-Paare über Einfachbindungen zwischen sp³-Atomen: Mindestabstand → gestaffelt statt verdeckt
    const d14 = [];
    for (const b of F.bonds) {
      if (b.o !== 1 || A[b.a].hyb !== 'sp³' || A[b.b].hyb !== 'sp³') continue;
      for (const [i] of F.adj[b.a]) for (const [j] of F.adj[b.b]) {
        if (i === b.b || j === b.a || i === j) continue;
        const key = Math.min(i, j) + ',' + Math.max(i, j);
        if (near.has(key)) continue;
        const hi = A[i].el === 'H', hj = A[j].el === 'H';
        d14.push([i, j, hi && hj ? 2.5 : hi || hj ? 2.68 : 2.95]);
      }
    }
    const step = (i, j, L, k) => {
      const dx = X[j] - X[i], dy = Y[j] - Y[i], dz = Z[j] - Z[i], d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-6;
      const c = k * (d - L) / d / 2;
      X[i] += dx * c; Y[i] += dy * c; Z[i] += dz * c; X[j] -= dx * c; Y[j] -= dy * c; Z[j] -= dz * c;
    };
    const vdw = (e) => (this.RVDW[e] || 1.9);
    for (let it = 0; it < 600; it++) {
      for (const c of cons) step(c[0], c[1], c[2], c[3]);
      if (it % 3 === 0) for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
        if (near.has(i + ',' + j)) continue;
        const min = (vdw(A[i].el) + vdw(A[j].el)) * 0.62;
        const dx = X[j] - X[i], dy = Y[j] - Y[i], dz = Z[j] - Z[i], d2 = dx * dx + dy * dy + dz * dz;
        if (d2 < min * min) step(i, j, min, 0.25);
      }
      for (const [i, j, L] of d14) {
        const dx = X[j] - X[i], dy = Y[j] - Y[i], dz = Z[j] - Z[i];
        if (dx * dx + dy * dy + dz * dz < L * L) step(i, j, L, 0.3);
      }
      // ebene Ringe (Aromaten, sp²): Ringatome samt direkten Nachbarn in die beste Ebene (Newell-Normale)
      for (const r of flatRings) {
        let nx = 0, ny = 0, nz = 0, cx = 0, cy = 0, cz = 0;
        for (let k = 0; k < r.length; k++) {
          const i = r[k], j = r[(k + 1) % r.length];
          nx += (Y[i] - Y[j]) * (Z[i] + Z[j]); ny += (Z[i] - Z[j]) * (X[i] + X[j]); nz += (X[i] - X[j]) * (Y[i] + Y[j]);
          cx += X[i]; cy += Y[i]; cz += Z[i];
        }
        const nl = Math.hypot(nx, ny, nz) || 1; nx /= nl; ny /= nl; nz /= nl; cx /= r.length; cy /= r.length; cz /= r.length;
        const pts = new Set(r);
        for (const i of r) for (const [j] of F.adj[i]) pts.add(j);
        for (const i of pts) {
          const dd = (X[i] - cx) * nx + (Y[i] - cy) * ny + (Z[i] - cz) * nz, w = r.includes(i) ? 0.5 : 0.3;
          X[i] -= nx * dd * w; Y[i] -= ny * dd * w; Z[i] -= nz * dd * w;
        }
      }
      // sp²/sp-Zentren mit drei Nachbarn: in die Ebene der Nachbarn
      for (const a of A) {
        if (a.hyb !== 'sp²' || F.adj[a.i].length !== 3) continue;
        const [p, q, r] = F.adj[a.i].map(x => x[0]);
        const ux = X[q] - X[p], uy = Y[q] - Y[p], uz = Z[q] - Z[p], vx = X[r] - X[p], vy = Y[r] - Y[p], vz = Z[r] - Z[p];
        let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
        const nl = Math.hypot(nx, ny, nz) || 1; nx /= nl; ny /= nl; nz /= nl;
        const dd = (X[a.i] - X[p]) * nx + (Y[a.i] - Y[p]) * ny + (Z[a.i] - Z[p]) * nz;
        // Zentrum zur Ebene, Nachbarn ein Drittel entgegen (hält auch Ringe aus sp²-Atomen eben)
        X[a.i] -= nx * dd * 0.6; Y[a.i] -= ny * dd * 0.6; Z[a.i] -= nz * dd * 0.6;
        for (const j of [p, q, r]) { X[j] += nx * dd * 0.2; Y[j] += ny * dd * 0.2; Z[j] += nz * dd * 0.2; }
      }
    }
    let mx = 0, my = 0, mz = 0;
    for (let i = 0; i < n; i++) { mx += X[i]; my += Y[i]; mz += Z[i]; }
    mx /= n || 1; my /= n || 1; mz /= n || 1;
    const out = { F, P: A.map(a => [X[a.i] - mx, Y[a.i] - my, Z[a.i] - mz]), q: this.charges(F) };
    if (this._cache.size > 6) this._cache.clear();
    this._cache.set(key, out);
    return out;
  },
  /* Partialladungen (vereinfacht nach der Elektronegativität der Bindungspartner, + Formalladung) */
  charges(F) {
    const en = (e) => CHEM_EN[e] || 2.0;
    const q = F.atoms.map(a => a.q || 0);
    for (const b of F.bonds) {
      const d = (en(F.atoms[b.b].el) - en(F.atoms[b.a].el)) * 0.16 * (b.o > 1 ? 1.2 : 1);
      q[b.a] += d; q[b.b] -= d;
    }
    // einmal glätten (Induktion über einen Nachbarn)
    return q.map((v, i) => v + F.adj[i].reduce((s, [j]) => s + q[j] * 0.12, 0));
  },
  /* Startansicht: schräg von oben; bei gefalteten Ringen (Sessel, 1.49) flacher von der Seite, damit man die Form sieht */
  rotDefault(m) {
    if (m && m.atoms && m.atoms.length) {
      try {
        const E = this.embed(m), F = E.F, P = E.P;
        const r = this.rings(F).find(x => x.length === 6 && x.every(i => F.atoms[i].hyb === 'sp³')) || this.rings(F).find(x => x.length >= 5 && x.every(i => F.atoms[i].hyb === 'sp³'));
        if (r) {
          // Ring von der Seite, leicht von oben (20°), die Achse C1–C4 waagrecht: so erkennt man den Sessel
          const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], cr = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
          const nrm = (a) => { const l = Math.hypot(...a) || 1; return a.map(x => x / l); }, dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
          const c = [0, 1, 2].map(k => r.reduce((t, i) => t + P[i][k], 0) / r.length);
          let n = [0, 0, 0];
          r.forEach((i, k) => { n = n.map((x, q) => x + cr(sub(P[i], c), sub(P[r[(k + 1) % r.length]], c))[q]); });
          n = nrm(n);
          let u = sub(P[r[Math.floor(r.length / 2)]], P[r[0]]);
          u = nrm(sub(u, n.map(x => x * dot(u, n))));
          // etwas um die Ringnormale gedreht (vordere/hintere Atome überdecken sich nicht) und 16° von oben
          const t0 = cr(n, u), b = 18 * Math.PI / 180, a = 16 * Math.PI / 180;
          const t = nrm([0, 1, 2].map(k => t0[k] * Math.cos(b) + u[k] * Math.sin(b)));
          u = nrm(cr(t, n));
          const w = nrm([0, 1, 2].map(k => t[k] * Math.cos(a) + n[k] * Math.sin(a)));
          const up = nrm(cr(w, u));   // senkrecht zu Blickrichtung und Achse
          const R = [...u, ...up.map(x => -x), ...w];
          return R.map(v => Math.round(v * 1e5) / 1e5);
        }
      } catch (e) { /* */ }
    }
    return this.mul(this.rx(-0.45), this.ry(0.55));
  },
  rx(t) { const c = Math.cos(t), s = Math.sin(t); return [1, 0, 0, 0, c, -s, 0, s, c]; },
  ry(t) { const c = Math.cos(t), s = Math.sin(t); return [c, 0, s, 0, 1, 0, -s, 0, c]; },
  mul(a, b) { const r = []; for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) r[i * 3 + j] = a[i * 3] * b[j] + a[i * 3 + 1] * b[3 + j] + a[i * 3 + 2] * b[6 + j]; return r; },
  /* Drehen um dx/dy Bildpunkte (Ziehen mit der Maus) */
  rotate(R, dx, dy) { return this.mul(this.mul(this.ry(dx * 0.01), this.rx(-dy * 0.01)), R || this.rotDefault()).map(v => Math.round(v * 1e5) / 1e5); },
  three(m, opts) {
    const { F, P, q } = this.embed(m);
    const R = Array.isArray(opts.rot3d) && opts.rot3d.length === 9 ? opts.rot3d : this.rotDefault(m);
    const K = BL / 1.5, D = 14;
    const cx = m.atoms.reduce((t, a) => t + a.x, 0) / (m.atoms.length || 1), cy = m.atoms.reduce((t, a) => t + a.y, 0) / (m.atoms.length || 1);
    const pr = P.map(([x, y, z]) => {
      const X = R[0] * x + R[1] * y + R[2] * z, Y = R[3] * x + R[4] * y + R[5] * z, Z = R[6] * x + R[7] * y + R[8] * z;
      const f = D / (D - Z);
      return { x: cx + X * K * f, y: cy + Y * K * f, z: Z, f };
    });
    const style = opts.style3d || 'stab';
    const box = this.boxer(), items = [], defs = new Set();
    const grad = (id, c) => { defs.add(`<radialGradient id="${id}" cx="35%" cy="32%" r="68%"><stop offset="0" stop-color="#fff" stop-opacity=".95"/><stop offset=".28" stop-color="${c}"/><stop offset="1" stop-color="${cmShade(c, -0.55)}"/></radialGradient>`); return `url(#${id})`; };
    const cpk = (e) => this.CPK[e] || '#e07fd0';
    const vdw = (e) => this.RVDW[e] || 1.9;
    // Stäbe (1.52): Atome nur so dick wie die Bindungen; Draht: nur farbige Linien (wie MolView „Wireframe“)
    const rAtom = (e) => style === 'kalotte' ? vdw(e) * 0.95 : style === 'wolke' ? (e === 'H' ? 0.22 : 0.3) : style === 'stick' ? 0.13 : style === 'draht' ? 0.05 : (e === 'H' ? 0.26 : 0.38) * (vdw(e) / 1.6);
    if (style !== 'kalotte') {
      for (const b of F.bonds) {
        const A = pr[b.a], B = pr[b.b];
        const dx = B.x - A.x, dy = B.y - A.y, l = Math.hypot(dx, dy) || 1, nx = -dy / l, ny = dx / l;
        const mx = (A.x + B.x) / 2, my = (A.y + B.y) / 2, w = (style === 'wolke' ? 3 : style === 'stick' ? 0.26 * K : style === 'draht' ? 1.6 : 4.4) * (A.f + B.f) / 2;
        const offs = style === 'stick' ? [0] : b.o === 2 ? [-2.6, 2.6] : b.o === 3 ? [-3.6, 0, 3.6] : [0];
        const ww = b.o > 1 && style !== 'stick' ? w * 0.55 : w;
        let svg = '';
        for (const o of offs) {
          for (const [P1, P2, e] of [[A, { x: mx, y: my }, F.atoms[b.a].el], [{ x: mx, y: my }, B, F.atoms[b.b].el]]) {
            if (style !== 'draht') svg += `<line x1="${cmF2(P1.x + nx * o)}" y1="${cmF2(P1.y + ny * o)}" x2="${cmF2(P2.x + nx * o)}" y2="${cmF2(P2.y + ny * o)}" stroke="${cmShade(cpk(e), -0.5)}" stroke-width="${cmF2(ww + 1.4)}" stroke-linecap="round"/>`;
            svg +=
              `<line x1="${cmF2(P1.x + nx * o)}" y1="${cmF2(P1.y + ny * o)}" x2="${cmF2(P2.x + nx * o)}" y2="${cmF2(P2.y + ny * o)}" stroke="${e === 'H' ? '#d8d8d8' : cpk(e)}" stroke-width="${cmF2(ww)}" stroke-linecap="round"/>`;
          }
        }
        items.push({ z: (A.z + B.z) / 2 - 0.01, svg });
      }
    }
    F.atoms.forEach((a, i) => {
      const p = pr[i], r = rAtom(a.el) * K * p.f;
      const fog = clamp(0.62 + (p.z + 4) * 0.08, 0.55, 1);
      let svg = style === 'draht' ? '' : `<circle cx="${cmF2(p.x)}" cy="${cmF2(p.y)}" r="${cmF2(r)}" fill="${grad('k3' + a.el, cpk(a.el))}" opacity="${cmF2(fog)}"/>`;
      if (opts.labels3d !== false && a.el !== 'C' && a.el !== 'H' && style !== 'wolke' && style !== 'stick' && style !== 'draht') {
        const fs = clamp(r * 0.9, 7, 13), w = ChemRender.width(a.el, fs);
        svg += `<text font-family='${ChemRender.FONT}' font-size="${cmF2(fs)}" font-weight="700" fill="${a.el === 'S' || a.el === 'F' || a.el === 'Cl' ? '#222' : '#fff'}" x="${cmF2(p.x - w / 2)}" y="${cmF2(p.y + fs * 0.36)}">${chemEsc(a.el)}</text>`;
      }
      items.push({ z: p.z, svg });
      box.add(p.x - r, p.y - r, p.x + r, p.y + r);
    });
    // Elektronenwolke: durchscheinende Kugeln (van-der-Waals) nach Partialladung gefärbt
    if (style === 'wolke') {
      const qmax = Math.max(0.15, ...q.map(Math.abs));
      F.atoms.forEach((a, i) => {
        const p = pr[i], r = vdw(a.el) * K * p.f * 1.02, t = clamp(q[i] / qmax, -1, 1);
        const c = t < 0 ? cmMix('#f2f2f2', '#e3262b', -t) : cmMix('#f2f2f2', '#2a5bd8', t);
        const id = 'kw' + i;
        defs.add(`<radialGradient id="${id}"><stop offset="0" stop-color="${c}" stop-opacity=".55"/><stop offset=".7" stop-color="${c}" stop-opacity=".38"/><stop offset="1" stop-color="${c}" stop-opacity=".08"/></radialGradient>`);
        items.push({ z: p.z + 0.5, svg: `<circle cx="${cmF2(p.x)}" cy="${cmF2(p.y)}" r="${cmF2(r)}" fill="url(#${id})"/>` });
        box.add(p.x - r, p.y - r, p.x + r, p.y + r);
        if (opts.delta !== false && Math.abs(t) > 0.5 && a.el !== 'H') {
          const s2 = t < 0 ? 'δ−' : 'δ+', fs = 10, w = ChemRender.width(s2, fs);
          items.push({ z: 99, svg: `<text font-family='${ChemRender.FONT}' font-size="${fs}" font-weight="700" fill="${t < 0 ? '#a3141a' : '#183f9e'}" x="${cmF2(p.x - w / 2)}" y="${cmF2(p.y - r * 0.55)}">${s2}</text>` });
        }
      });
    }
    // Messen (1.52, wie MolView): gewählte Atome markieren, verbinden und den Wert anschreiben
    const meas = Array.isArray(opts.meas3d) ? opts.meas3d.filter(i => pr[i]) : [];
    if (meas.length) {
      let svg = meas.map(i => `<circle cx="${cmF2(pr[i].x)}" cy="${cmF2(pr[i].y)}" r="${cmF2(Math.max(6, rAtom(F.atoms[i].el) * K * pr[i].f + 3))}" fill="none" stroke="#f59f00" stroke-width="2.2"/>`).join('');
      if (meas.length > 1) svg += `<polyline points="${meas.map(i => cmF2(pr[i].x) + ',' + cmF2(pr[i].y)).join(' ')}" fill="none" stroke="#f59f00" stroke-width="1.6" stroke-dasharray="5 3"/>`;
      const r = meas.length > 1 && typeof ChemProps !== 'undefined' ? ChemProps.measure(P, meas) : null;
      if (r) {
        const c = meas.length === 2 ? { x: (pr[meas[0]].x + pr[meas[1]].x) / 2, y: (pr[meas[0]].y + pr[meas[1]].y) / 2 } : pr[meas[1]];
        const t = r.text, fs = 12, w = ChemRender.width(t, fs) + 8;
        svg += `<rect x="${cmF2(c.x - w / 2)}" y="${cmF2(c.y - 24)}" width="${cmF2(w)}" height="17" rx="4" fill="#f59f00"/><text font-family='${ChemRender.FONT}' font-size="${fs}" font-weight="700" fill="#fff" x="${cmF2(c.x - w / 2 + 4)}" y="${cmF2(c.y - 11)}">${chemEsc(t)}</text>`;
      }
      items.push({ z: 999, svg });
    }
    items.sort((a, b) => a.z - b.z);
    let body = `<defs>${[...defs].join('')}</defs>` + items.map(x => x.svg).join('');
    let bb = box.get();
    if (style === 'wolke') {
      const lx = bb.x0, ly = bb.y1 + 14;
      body += `<defs><linearGradient id="kwl"><stop offset="0" stop-color="#e3262b"/><stop offset=".5" stop-color="#f2f2f2"/><stop offset="1" stop-color="#2a5bd8"/></linearGradient></defs>` +
        `<rect x="${cmF2(lx + 64)}" y="${cmF2(ly - 8)}" width="90" height="9" fill="url(#kwl)" stroke="#999" stroke-width=".5"/>` +
        `<text font-family='${ChemRender.FONT}' font-size="9" fill="#444" x="${cmF2(lx)}" y="${cmF2(ly)}">Elektronen:</text>` +
        `<text font-family='${ChemRender.FONT}' font-size="9" fill="#a3141a" x="${cmF2(lx + 64)}" y="${cmF2(ly + 11)}">viel (δ−)</text>` +
        `<text font-family='${ChemRender.FONT}' font-size="9" fill="#183f9e" x="${cmF2(lx + 118)}" y="${cmF2(ly + 11)}">wenig (δ+)</text>`;
      box.add(lx, ly - 10, lx + 160, ly + 13);
      bb = box.get();
    }
    return { body, box: bb, labels: new Map(), pts3: pr.map((p, i) => ({ x: p.x, y: p.y, z: p.z, i, el: F.atoms[i].el })) };
  },

  /* ---------------------------------------------------------- gemeinsamer Einstieg */
  draw(m, opts, an) {
    const fn = { lewis: 'lewis', bohr: 'bohr', orbital: 'orbital', '3d': 'three' }[opts.model];
    if (!m.atoms.length || !fn) return { body: '', box: { x0: 0, y0: 0, x1: 1, y1: 1 }, labels: new Map() };
    const r = this[fn](m, opts);
    // Reaktionsschema (1.54) auch in der Lewis-Schreibweise (Elektronenpfeile an freien Paaren)
    let body = r.body, box = r.box;
    if (fn === 'lewis' && m.objs && m.objs.length) {
      const ob = ChemRender.objects({ ...m, atoms: m.atoms.map(a => ({ ...a, lpv: 0, pc: a.pc })) }, opts, ChemMol.index(m), r.labels);
      body += ob.html;
      if (ob.box) box = { x0: Math.min(box.x0, ob.box.x0), y0: Math.min(box.y0, ob.box.y0), x1: Math.max(box.x1, ob.box.x1), y1: Math.max(box.y1, ob.box.y1) };
    }
    const cap = ChemRender.caption(an, opts, box);
    return { body: body + cap.html, box: cap.box, labels: r.labels, hpos: r.hpos || [], pts3: r.pts3 || null };
  },
  boxer() {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    return {
      add(a, b, c, d) { x0 = Math.min(x0, a); y0 = Math.min(y0, b); x1 = Math.max(x1, c); y1 = Math.max(y1, d); },
      get() { return isFinite(x0) ? { x0, y0, x1, y1 } : { x0: 0, y0: 0, x1: 1, y1: 1 }; },
    };
  },
};
const cmF2 = (v) => (Math.round(v * 100) / 100).toString();
/* Farbe heller (+) / dunkler (−) */
function cmShade(hex, k) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const ch = [n >> 16, (n >> 8) & 255, n & 255].map(c => Math.round(k < 0 ? c * (1 + k) : c + (255 - c) * k));
  return '#' + ch.map(c => clamp(c, 0, 255).toString(16).padStart(2, '0')).join('');
}
function cmMix(a, b, t) {
  const p = (h) => { const n = parseInt(h.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; };
  const A = p(a), B = p(b);
  return '#' + A.map((c, i) => Math.round(c + (B[i] - c) * t).toString(16).padStart(2, '0')).join('');
}
if (typeof module !== 'undefined') module.exports = { ChemModels };
