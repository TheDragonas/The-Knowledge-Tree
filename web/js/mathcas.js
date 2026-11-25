'use strict';
/* Fotomath-Werkzeuge (seit 1.52) – Algebra wie in Derive, erklärt wie in Photomath. Ohne DOM, ohne Internet.
 * Baut auf den Bausteinen von MathInk.sym auf (exakte Brüche, Vereinfachen, Ausmultiplizieren) und liefert zu jeder
 * Aufgabe das Ergebnis UND den Rechenweg (Schritte mit Titel, Erklärung, LaTeX und Text):
 *  - diff:      Ableiten (Summen-, Faktor-, Potenz-, Produkt-, Quotienten-, Kettenregel; e^x, ln, sin, cos, tan, √)
 *  - integrate: Stammfunktion (Grundintegrale, lineare Substitution, partielle Integration für xⁿ·eᵃˣ, xⁿ·sin, xⁿ·cos,
 *               ln x) mit Probe durch Ableiten; bestimmtes Integral mit Grenzen (exakt, Kontrolle mit Simpson-Regel)
 *  - factor:    Faktorisieren (ausklammern, binomische Formeln, Nullstellen raten + Polynomdivision, Vielfachheit)
 *  - expandSteps: Ausmultiplizieren
 *  - system:    Lineares Gleichungssystem (Gauss-Verfahren mit Brüchen; eindeutig, keine oder unendlich viele Lösungen)
 *  - inequality: Ungleichungen (linear mit Umdrehen des Zeichens; sonst Nullstellen + Vorzeichentabelle → Intervalle)
 *  - curve:     Kurvendiskussion (Definitionslücken, Symmetrie, Achsenschnittpunkte, Extrem- und Wendepunkte,
 *               Verhalten im Unendlichen) + Punkte für den Graphen
 *  - taylor:    Taylorpolynom um x₀
 *  - primes / gcdLcm: Primfaktorzerlegung, ggT und kgV mit Weg
 * Geprüft mit tests/mathink/werkzeuge-test.js. */
const MathCAS = (() => {
  const S = () => MathInk.sym;
  const N = (p, q) => S().N(p, q);
  const simp = (n) => S().simp(n);
  const expand = (n) => S().expand(n);
  const has = (n, v) => S().has(n, v);
  const tex = (n) => S().symTex(n);
  const txt = (n) => S().symText(n).replace(/(^|[^\w])-/g, '$1−').replace(/√\((\d+)\)/g, '√$1');   // Minuszeichen wie gedruckt, √3
  const V = (n) => ({ k: 'v', n });
  const E = { k: 'c', n: 'e' };
  const isN = (n, p) => n && n.k === 'n' && (p === undefined || (n.p === p && n.q === 1));
  const Err = (m) => Object.assign(new Error(m), { cas: true });
  const gcd = (a, b) => { a = Math.abs(a); b = Math.abs(b); while (b) [a, b] = [b, a % b]; return a || 1; };
  const lcm = (a, b) => Math.abs(a / gcd(a, b) * b);
  // rationale Zahlen ({k:'n', p, q})
  const qadd = (a, b) => N(a.p * b.q + b.p * a.q, a.q * b.q);
  const qsub = (a, b) => N(a.p * b.q - b.p * a.q, a.q * b.q);
  const qmul = (a, b) => N(a.p * b.p, a.q * b.q);
  const qdiv = (a, b) => { if (b.p === 0) throw Err('Division durch 0'); return N(a.p * b.q, a.q * b.p); };
  const qv = (a) => a.p / a.q;
  const qtex = (a) => tex(a), qtxt = (a) => txt(a);
  // Text eines Faktors – geklammert nur, wenn nötig (Summe, negativ)
  const ptxt = (n) => (n.k === '+' || n.k === 'neg' || (n.k === 'n' && n.p < 0)) ? `(${txt(n)})` : txt(n);

  /* ---------------------------------------------------------- Hilfen */
  // Term → [Zahlfaktor, übrige Faktoren]
  const coefOf = (t) => {
    if (t.k === 'n') return [t, []];
    if (t.k === 'neg') { const [c, r] = coefOf(t.a); return [N(-c.p, c.q), r]; }
    if (t.k === '/' && t.b.k === 'n' && t.b.p !== 0) { const [c, r] = coefOf(t.a); return [qdiv(c, t.b), r]; }   // x/2 = ½·x
    if (t.k === '*') { let c = N(1); const r = []; for (const f of t.a) { if (f.k === 'n') c = qmul(c, f); else if (f.k === 'neg') { c = N(-c.p, c.q); const [c2, r2] = coefOf(f.a); c = qmul(c, c2); r.push(...r2); } else r.push(f); } return [c, r]; }
    return [N(1), [t]];
  };
  const termsOf = (n) => n.k === '+' ? n.a : [n];
  /* Wert einsetzen: v → Knoten, danach vereinfachen und bekannte Werte falten (sin 0 = 0, |−3| = 3 …) */
  function subst(n, v, w) {
    if (!n || typeof n !== 'object') return n;
    if (n.k === 'v') return n.n === v ? w : n;
    const o = { ...n };
    if (n.a) o.a = Array.isArray(n.a) ? n.a.map(x => subst(x, v, w)) : subst(n.a, v, w);
    if (n.b) o.b = subst(n.b, v, w);
    return o;
  }
  function fold(n) {
    if (!n || typeof n !== 'object') return n;
    const o = { ...n };
    if (n.a) o.a = Array.isArray(n.a) ? n.a.map(fold) : fold(n.a);
    if (n.b) o.b = fold(n.b);
    if (o.k === 'fn' && o.a.k === 'n') {
      const a = o.a;
      if (o.f === 'abs') return N(Math.abs(a.p), a.q);
      if (a.p === 0 && (o.f === 'sin' || o.f === 'tan' || o.f === 'arcsin' || o.f === 'arctan')) return N(0);
      if (a.p === 0 && o.f === 'cos') return N(1);
      if (o.f === 'arccos' && a.p === 1 && a.q === 1) return N(0);
    }
    if (o.k === 'fn' && (o.f === 'sin' || o.f === 'cos' || o.f === 'tan') && !lettersIn(o.a).size) { const t = trigExact(o.f, o.a); if (t) return t; }
    if (o.k === 'fn' && o.f === 'ln' && o.a.k === '^' && o.a.a.k === 'c' && o.a.a.n === 'e') return o.a.b;   // ln(e^u) = u
    return o;
  }
  /* sin/cos/tan bei Vielfachen von π/6 und π/4 exakt (sin(π/6) = 1/2, cos(π/4) = √2/2 …) */
  function trigExact(f, a) {
    const x = num(a);
    if (!Number.isFinite(x)) return null;
    const t = x / Math.PI;
    let deg = null;
    for (const q of [1, 2, 3, 4, 6]) { const k = Math.round(t * q); if (Math.abs(t * q - k) < 1e-11) { deg = ((k * 180 / q) % 360 + 360) % 360; break; } }
    if (deg === null) return null;
    const sq = (m) => ({ k: 'fn', f: 'sqrt', a: N(m) });
    const half = (n) => ({ k: '/', a: n, b: N(2) });
    const SIN = { 0: N(0), 30: N(1, 2), 45: half(sq(2)), 60: half(sq(3)), 90: N(1) };
    const sinD = (dg) => { dg = ((dg % 360) + 360) % 360; let sg = 1; if (dg >= 180) { sg = -1; dg -= 180; } if (dg > 90) dg = 180 - dg; const v = SIN[Math.round(dg)]; return v === undefined ? null : sg < 0 ? simp({ k: 'neg', a: v }) : v; };
    if (f === 'sin') return sinD(deg);
    if (f === 'cos') return sinD(deg + 90);
    const sn = sinD(deg), cs = sinD(deg + 90);
    if (!sn || !cs || isN(cs, 0)) return null;
    return simp({ k: '/', a: sn, b: cs });
  }
  const S2 = (n) => { let r = simp(fold(n)); r = simp(fold(r)); return r; };
  const at = (n, v, x) => S2(subst(n, v, typeof x === 'number' ? N(x) : x));
  const num = (n, env) => { try { const r = S().symEval(n, env || {}); return typeof r === 'number' ? r : NaN; } catch (e) { return NaN; } };
  const fnum = (n, v) => (x) => num(n, { [v]: x });
  const size = (n) => txt(n).length;
  const approxStr = (x) => { if (!Number.isFinite(x)) return String(x); const r = +x.toPrecision(6); return String(Math.abs(r) < 1e-12 ? 0 : r).replace('-', '−'); };
  const isExactInt = (n) => n.k === 'n' && n.q === 1 && Number.isInteger(n.p);
  // ist der Knoten eine exakte Zahl (ohne Näherung)?
  const exactNum = (n) => n.k === 'n' && Number.isInteger(n.p) && Number.isInteger(n.q);

  /* Polynom in v mit rationalen Koeffizienten → [a0, a1, …] oder null (bis Grad 12) */
  function polyQ(n, v) {
    let e;
    try { e = expand(n); } catch (x) { return null; }
    const out = [];
    for (const t of termsOf(e)) {
      const [c, r] = coefOf(t);
      if (!exactNum(c)) return null;
      let k = 0;
      if (r.length === 1) {
        const f = r[0];
        if (f.k === 'v' && f.n === v) k = 1;
        else if (f.k === '^' && f.a.k === 'v' && f.a.n === v && isExactInt(f.b) && f.b.p >= 0) k = f.b.p;
        else return null;
      } else if (r.length > 1) return null;
      if (k > 12) return null;
      out[k] = out[k] ? qadd(out[k], c) : c;
    }
    for (let i = 0; i < out.length; i++) if (!out[i]) out[i] = N(0);
    while (out.length > 1 && out[out.length - 1].p === 0) out.pop();
    return out.length ? out : [N(0)];
  }
  const deg = (P) => P.length - 1;
  /* Polynom → Knoten (absteigend: 2x² − 3x + 1) */
  function polyNode(P, v) {
    const ts = [];
    for (let k = P.length - 1; k >= 0; k--) {
      const c = P[k];
      if (c.p === 0) continue;
      const pv = k === 0 ? null : k === 1 ? V(v) : { k: '^', a: V(v), b: N(k) };
      if (!pv) { ts.push(c); continue; }
      if (c.p === c.q) ts.push(pv);
      else if (c.p === -c.q) ts.push({ k: 'neg', a: pv });
      else if (c.q !== 1) ts.push(c.p < 0 ? { k: 'neg', a: { k: '/', a: { k: '*', a: [N(-c.p), pv] }, b: N(c.q) } } : { k: '/', a: Math.abs(c.p) === 1 ? pv : { k: '*', a: [N(c.p), pv] }, b: N(c.q) });
      else ts.push(c.p < 0 ? { k: 'neg', a: { k: '*', a: [N(-c.p), pv] } } : { k: '*', a: [c, pv] });
    }
    return ts.length === 0 ? N(0) : ts.length === 1 ? ts[0] : { k: '+', a: ts };
  }
  const polyEval = (P, x) => P.reduceRight((s, c) => qadd(qmul(s, x), c), N(0));
  // ganzzahliges Polynom durch (q·x − p) teilen (Horner) → Quotient
  function divLin(B, p, q) {
    const n = B.length - 1, out = new Array(n);
    let r = B[n];
    for (let k = n - 1; k >= 0; k--) { out[k] = r / q; r = B[k] + r * p / q; }
    return out;
  }
  const divisors = (n) => { n = Math.abs(n); const d = []; if (n > 1e9) return [1]; for (let i = 1; i * i <= n; i++) if (n % i === 0) { d.push(i); if (i * i !== n) d.push(n / i); } return d.sort((a, b) => a - b); };

  /* ---------------------------------------------------------- Ableiten */
  const lnOf = (a) => a.k === 'c' && a.n === 'e' ? N(1) : { k: 'fn', f: 'ln', a };
  function d(n, v) {
    if (!has(n, v)) return N(0);
    switch (n.k) {
      case 'v': return N(1);
      case '+': return { k: '+', a: n.a.map(t => d(t, v)) };
      case 'neg': return { k: 'neg', a: d(n.a, v) };
      case '±': return { k: '±', a: d(n.a, v), b: d(n.b, v) };
      case '*': {
        const ts = n.a.map((f, i) => has(f, v) ? { k: '*', a: n.a.map((g, j) => i === j ? d(g, v) : g) } : null).filter(Boolean);
        return ts.length === 1 ? ts[0] : { k: '+', a: ts };
      }
      case '/': {
        if (!has(n.b, v)) return { k: '/', a: d(n.a, v), b: n.b };
        return { k: '/', a: { k: '+', a: [{ k: '*', a: [d(n.a, v), n.b] }, { k: 'neg', a: { k: '*', a: [n.a, d(n.b, v)] } }] }, b: { k: '^', a: n.b, b: N(2) } };
      }
      case '^': {
        const ba = has(n.a, v), ex = has(n.b, v);
        if (ba && !ex) return { k: '*', a: [n.b, { k: '^', a: n.a, b: { k: '+', a: [n.b, N(-1)] } }, d(n.a, v)] };
        if (!ba) return { k: '*', a: [n, lnOf(n.a), d(n.b, v)] };
        return { k: '*', a: [n, { k: '+', a: [{ k: '*', a: [d(n.b, v), lnOf(n.a)] }, { k: '/', a: { k: '*', a: [n.b, d(n.a, v)] }, b: n.a }] }] };
      }
      case 'fn': {
        const a = n.a, da = d(a, v);
        const o = {
          sqrt: () => ({ k: '/', a: da, b: { k: '*', a: [N(2), n] } }),
          ln: () => ({ k: '/', a: da, b: a }),
          log: () => ({ k: '/', a: da, b: { k: '*', a: [a, { k: 'fn', f: 'ln', a: N(10) }] } }),
          sin: () => ({ k: '*', a: [{ k: 'fn', f: 'cos', a }, da] }),
          cos: () => ({ k: 'neg', a: { k: '*', a: [{ k: 'fn', f: 'sin', a }, da] } }),
          tan: () => ({ k: '/', a: da, b: { k: '^', a: { k: 'fn', f: 'cos', a }, b: N(2) } }),
          abs: () => ({ k: '*', a: [{ k: '/', a, b: n }, da] }),
          arcsin: () => ({ k: '/', a: da, b: { k: 'fn', f: 'sqrt', a: { k: '+', a: [N(1), { k: 'neg', a: { k: '^', a, b: N(2) } }] } } }),
          arccos: () => ({ k: 'neg', a: { k: '/', a: da, b: { k: 'fn', f: 'sqrt', a: { k: '+', a: [N(1), { k: 'neg', a: { k: '^', a, b: N(2) } }] } } } }),
          arctan: () => ({ k: '/', a: da, b: { k: '+', a: [N(1), { k: '^', a, b: N(2) }] } }),
        }[n.f];
        if (!o) throw Err('„' + n.f + '“ kann ich nicht ableiten');
        return o();
      }
    }
    throw Err('Dieser Ausdruck lässt sich nicht ableiten');
  }
  /* schönste Form: ausmultipliziert, wenn das kürzer/gleich lang ist; bei Brüchen den Zähler ausmultiplizieren */
  function nice(n) {
    let a = S2(n);
    let b = null;
    try { b = S2(expand(a)); } catch (e) { b = null; }
    if (a.k === '/') { try { const c = S2({ k: '/', a: expand(a.a), b: a.b }); if (size(c) <= size(a)) a = c; } catch (e) { /* */ } }
    if (b && size(b) <= size(a) * 1.15 && !txt(b).includes('/(')) a = b;
    return ordered(a);
  }
  /* Polynom absteigend ordnen (x² − 4x + 3 statt x² + 3 − 4x), sonst unverändert */
  function ordered(n) {
    const ls = [...lettersIn(n)];
    if (ls.length !== 1 || n.k !== '+') return n;
    const P = polyQ(n, ls[0]);
    return P ? polyNode(P, ls[0]) : n;
  }
  const prime = (k) => "'".repeat(k);
  /* welche Regel braucht ein Glied? → { name, note, detail? } */
  function ruleOf(t, v) {
    const X = v;
    if (!has(t, v)) return { name: 'Konstante', note: 'Konstante fällt weg' };
    if (t.k === 'v') return { name: 'Grundregel', note: `${X}′ = 1` };
    if (t.k === 'neg') { const r = ruleOf(t.a, v); return { ...r, note: r.note }; }
    const [c, r] = coefOf(t);
    const core = r.length === 1 ? r[0] : r.length ? { k: '*', a: r } : t;
    const fac = !(c.p === 1 && c.q === 1) && r.length ? 'Faktorregel + ' : '';
    if (core.k === '*') {
      const vf = core.a.filter(f => has(f, v));
      if (vf.length === 1 && core.a.length > 1) return { ...ruleOf(vf[0], v), name: 'Faktorregel + ' + ruleOf(vf[0], v).name };
      return { name: fac + 'Produktregel', note: '(u·w)′ = u′·w + u·w′', prod: core };
    }
    if (core.k === '/') {
      if (!has(core.b, v)) return { ...ruleOf(core.a, v), name: 'Faktorregel + ' + ruleOf(core.a, v).name };
      return { name: fac + 'Quotientenregel', note: '(u/w)′ = (u′·w − u·w′) / w²', quot: core };
    }
    if (core.k === '^') {
      if (has(core.a, v) && !has(core.b, v)) return core.a.k === 'v' ? { name: fac + 'Potenzregel', note: `(${X}ⁿ)′ = n·${X}ⁿ⁻¹` } : { name: fac + 'Potenz- und Kettenregel', note: 'äussere · innere Ableitung', chain: core.a };
      if (!has(core.a, v)) return core.b.k === 'v' ? { name: fac + (core.a.k === 'c' && core.a.n === 'e' ? 'e-Funktion' : 'Exponentialfunktion'), note: core.a.k === 'c' && core.a.n === 'e' ? `(e^${X})′ = e^${X}` : `(a^${X})′ = a^${X}·ln(a)` } : { name: fac + 'Exponential- und Kettenregel', note: 'äussere · innere Ableitung', chain: core.b };
      return { name: fac + 'Exponentialregel', note: 'f^g = e^(g·ln f)' };
    }
    if (core.k === 'fn') {
      const base = { sqrt: `(√${X})′ = 1/(2√${X})`, ln: `(ln ${X})′ = 1/${X}`, log: `(log ${X})′ = 1/(${X}·ln 10)`, sin: `(sin ${X})′ = cos ${X}`, cos: `(cos ${X})′ = −sin ${X}`, tan: `(tan ${X})′ = 1/cos²${X}`, abs: `|${X}|′ = ${X}/|${X}|` }[core.f] || '';
      if (core.a.k === 'v') return { name: fac + 'Grundableitung', note: base };
      return { name: fac + 'Kettenregel', note: base + ' · innere Ableitung', chain: core.a };
    }
    return { name: 'Regel', note: '' };
  }
  const dTex = (v, inner) => `\\frac{d}{d${v}}\\left(${inner}\\right)`;
  /* f → { result, steps } ; name/k für die Schreibweise f′(x), f″(x) */
  function diff(f, v = 'x', opts = {}) {
    const fname = opts.name || null;
    const steps = [];
    const f0 = S2(f);
    const head = fname ? `${fname}${prime(opts.order ? opts.order - 1 : 0)}(${v})` : null;
    steps.push({ title: 'Aufgabe', note: fname ? `Ableitung von ${head} bilden` : `nach ${v} ableiten`, tex: fname ? `${head} = ${tex(f0)}` : dTex(v, tex(f0)), text: fname ? `${head} = ${txt(f0)}` : `d/d${v} (${txt(f0)})` });
    const ts = termsOf(f0);
    if (ts.length > 1) {
      const parts = ts.map((t, i) => { const [c, r] = coefOf(t); const neg = c.p < 0; const a = neg ? S2({ k: 'neg', a: t }) : t; return (i ? (neg ? ' - ' : ' + ') : neg ? '-' : '') + dTex(v, tex(a)); });
      steps.push({ title: 'Summenregel', note: 'Jedes Glied einzeln ableiten – Konstanten fallen weg.', tex: '= ' + parts.join(''), text: '= ' + ts.map(t => `(${txt(t)})′`).join(' + ') });
    }
    const dts = [];
    const notes = [];
    for (const t of ts) {
      const r = ruleOf(t, v);
      const dt = nice(d(t, v));
      dts.push(dt);
      if (r.prod) {
        const fs = r.prod.a, i = fs.findIndex(x => has(x, v));
        const u = fs[i], w = S2(fs.length === 2 ? fs[1 - i] : { k: '*', a: fs.filter((_, j) => j !== i) });
        const du = nice(d(u, v)), dw = nice(d(w, v));
        steps.push({ title: 'Produktregel', note: `u = ${txt(u)},  w = ${txt(w)}  ⇒  u′ = ${txt(du)},  w′ = ${txt(dw)}`, op: '(u·w)′ = u′·w + u·w′', tex: `\\left(${tex(r.prod)}\\right)' = ${tex(du)} \\cdot ${parenTex(w)} + ${parenTex(u)} \\cdot ${parenTex(dw)}`, text: `(${txt(r.prod)})′ = ${ptxt(du)}·${ptxt(w)} + ${ptxt(u)}·${ptxt(dw)}` });
      } else if (r.quot) {
        const u = r.quot.a, w = r.quot.b, du = nice(d(u, v)), dw = nice(d(w, v));
        steps.push({ title: 'Quotientenregel', note: `u = ${txt(u)},  w = ${txt(w)}  ⇒  u′ = ${txt(du)},  w′ = ${txt(dw)}`, op: '(u/w)′ = (u′·w − u·w′)/w²', tex: `\\left(${tex(r.quot)}\\right)' = \\frac{${parenTex(du)} \\cdot ${parenTex(w)} - ${parenTex(u)} \\cdot ${parenTex(dw)}}{${parenTex(w)}^{2}}`, text: `(${txt(r.quot)})′ = (${ptxt(du)}·${ptxt(w)} − ${ptxt(u)}·${ptxt(dw)})/(${txt(w)})²` });
      } else if (r.chain) {
        const di = nice(d(r.chain, v));
        steps.push({ title: 'Kettenregel', note: `innere Funktion ${txt(r.chain)}, innere Ableitung ${txt(di)}`, op: 'äussere · innere Ableitung', tex: `\\left(${tex(t)}\\right)' = ${tex(dt)}`, text: `(${txt(t)})′ = ${txt(dt)}` });
      }
      notes.push(`${txt(t)} → ${txt(dt)} (${r.name})`);
    }
    const raw = dts.filter(x => !isN(x, 0));
    const sumNode = raw.length === 0 ? N(0) : raw.length === 1 ? raw[0] : { k: '+', a: raw };
    steps.push({ title: 'Glieder ableiten', note: notes.join(';  '), tex: '= ' + tex(sumNode), text: '= ' + txt(sumNode) });
    const res = nice(sumNode);
    if (txt(res) !== txt(sumNode)) steps.push({ title: 'Zusammenfassen', tex: '= ' + tex(res), text: '= ' + txt(res) });
    const lhs = fname ? `${fname}${prime((opts.order || 1))}(${v})` : null;
    return { kind: 'cas', op: 'diff', v, steps, result: res, tex: (lhs ? lhs + ' = ' : '') + tex(res), text: (lhs ? lhs + ' = ' : '') + txt(res), problem: steps[0] };
  }
  const parenTex = (n) => (n.k === '+' || n.k === 'neg' || (n.k === 'n' && n.p < 0)) ? `\\left(${tex(n)}\\right)` : tex(n);

  /* ---------------------------------------------------------- Integrieren */
  // lineare innere Funktion a·v + b? → { a, b } (Zahlen)
  function linear(n, v) { const P = polyQ(n, v); return P && P.length === 2 && P[1].p !== 0 ? { a: P[1], b: P[0] } : null; }
  /* Grundintegral eines Faktors ohne Zahlfaktor; gibt { F, rule } oder null */
  function basic(t, v, depth) {
    const X = V(v);
    if (!has(t, v)) return { F: { k: '*', a: [t, X] }, rule: 'Konstante: ∫c dx = c·x' };
    if (t.k === 'v') return { F: { k: '/', a: { k: '^', a: X, b: N(2) }, b: N(2) }, rule: 'Potenzregel: ∫xⁿ dx = xⁿ⁺¹/(n+1)' };
    if (t.k === '^' && !has(t.b, v)) {
      const L = linear(t.a, v), e = S2(t.b);
      if (L && e.k === 'n') {
        if (e.p === -e.q) return { F: { k: '/', a: { k: 'fn', f: 'ln', a: { k: 'fn', f: 'abs', a: t.a } }, b: L.a }, rule: t.a.k === 'v' ? 'Grundintegral: ∫1/x dx = ln|x|' : 'lineare Substitution: ∫1/(ax+b) dx = ln|ax+b|/a' };
        const e1 = qadd(e, N(1));
        return { F: { k: '/', a: { k: '^', a: t.a, b: e1 }, b: qmul(e1, L.a) }, rule: t.a.k === 'v' ? 'Potenzregel: ∫xⁿ dx = xⁿ⁺¹/(n+1)' : 'Potenzregel mit linearer Substitution: ∫(ax+b)ⁿ dx = (ax+b)ⁿ⁺¹/(a(n+1))' };
      }
      return null;
    }
    if (t.k === '^' && !has(t.a, v)) {
      const L = linear(t.b, v);
      if (!L) return null;
      const isE = t.a.k === 'c' && t.a.n === 'e';
      return { F: { k: '/', a: t, b: isE ? L.a : { k: '*', a: [L.a, { k: 'fn', f: 'ln', a: t.a }] } }, rule: isE ? (t.b.k === 'v' ? 'Grundintegral: ∫eˣ dx = eˣ' : 'lineare Substitution: ∫e^(ax+b) dx = e^(ax+b)/a') : '∫aˣ dx = aˣ/ln(a)' };
    }
    if (t.k === '/' && !has(t.b, v)) { const b = basic(t.a, v, depth); return b && { F: { k: '/', a: b.F, b: t.b }, rule: b.rule }; }
    if (t.k === '/' && !has(t.a, v)) { const b = basic({ k: '^', a: t.b, b: N(-1) }, v, depth); return b && { F: { k: '*', a: [t.a, b.F] }, rule: b.rule }; }
    if (t.k === 'fn') {
      const L = linear(t.a, v);
      if (!L) return null;
      const sub = t.a.k === 'v' ? '' : ' (lineare Substitution: durch a teilen)';
      if (t.f === 'sin') return { F: { k: 'neg', a: { k: '/', a: { k: 'fn', f: 'cos', a: t.a }, b: L.a } }, rule: '∫sin x dx = −cos x' + sub };
      if (t.f === 'cos') return { F: { k: '/', a: { k: 'fn', f: 'sin', a: t.a }, b: L.a }, rule: '∫cos x dx = sin x' + sub };
      if (t.f === 'sqrt') return { F: { k: '/', a: { k: '*', a: [N(2), { k: '^', a: t.a, b: N(3, 2) }] }, b: { k: '*', a: [N(3), L.a] } }, rule: '∫√x dx = ⅔·x^(3/2)' + sub };
      if (t.f === 'ln') return { F: { k: '/', a: { k: '+', a: [{ k: '*', a: [t.a, { k: 'fn', f: 'ln', a: t.a }] }, { k: 'neg', a: t.a }] }, b: L.a }, rule: 'partielle Integration: ∫ln x dx = x·ln x − x' + sub };
      if (t.f === 'tan') return { F: { k: 'neg', a: { k: '/', a: { k: 'fn', f: 'ln', a: { k: 'fn', f: 'abs', a: { k: 'fn', f: 'cos', a: t.a } } }, b: L.a } }, rule: '∫tan x dx = −ln|cos x|' + sub };
      return null;
    }
    if (t.k === '/' && has(t.b, v)) {
      // 1/cos² → tan; sonst Bruch mit Zähler = Ableitung des Nenners: ln|Nenner|
      const db = S2(d(t.b, v));
      const q = S2({ k: '/', a: t.a, b: db });
      if (!has(q, v)) return { F: { k: '*', a: [q, { k: 'fn', f: 'ln', a: { k: 'fn', f: 'abs', a: t.b } }] }, rule: 'Zähler = Vielfaches der Ableitung des Nenners: ∫f′/f dx = ln|f|' };
      if (t.b.k === '^' && t.b.a.k === 'fn' && t.b.a.f === 'cos' && isN(S2(t.b.b), 2) && !has(t.a, v)) { const L = linear(t.b.a.a, v); if (L) return { F: { k: '*', a: [t.a, { k: '/', a: { k: 'fn', f: 'tan', a: t.b.a.a }, b: L.a }] }, rule: '∫1/cos²x dx = tan x' }; }
      return null;
    }
    if (t.k === '*' && depth < 6) {
      // partielle Integration: Polynom · (e^(ax+b) | sin | cos) oder Polynom · ln x
      const fs = t.a;
      const pi = fs.findIndex(f => polyQ(f, v) && has(f, v));
      if (pi < 0) return null;
      const P = fs[pi], rest = S2(fs.length === 2 ? fs[1 - pi] : { k: '*', a: fs.filter((_, j) => j !== pi) });
      if (rest.k === 'fn' && rest.f === 'ln' && rest.a.k === 'v') {
        // ∫P·ln x = Q·ln x − ∫Q/x  (Q Stammfunktion von P)
        const Q = integrateNode(P, v, depth + 1);
        if (!Q) return null;
        const inner = integrateNode(S2(expand({ k: '/', a: Q, b: V(v) })), v, depth + 1);
        if (!inner) return null;
        return { F: { k: '+', a: [{ k: '*', a: [Q, rest] }, { k: 'neg', a: inner }] }, rule: 'partielle Integration: ∫u′·w = u·w − ∫u·w′ (w = ln x)', parts: true };
      }
      const g = basic(rest, v, depth + 1);
      if (!g || has(S2(d(P, v)), v) && depth > 4) return null;
      // ∫P·g = P·G − ∫P′·G
      const dP = S2(d(P, v));
      const inner = isN(dP, 0) ? N(0) : integrateNode(S2({ k: '*', a: [dP, g.F] }), v, depth + 1);
      if (!inner) return null;
      return { F: { k: '+', a: [{ k: '*', a: [P, g.F] }, { k: 'neg', a: inner }] }, rule: 'partielle Integration: ∫u·w′ = u·w − ∫u′·w (u = ' + txt(P) + ')', parts: true };
    }
    return null;
  }
  /* Stammfunktion eines Knotens (linear zerlegen) oder null */
  function integrateNode(f, v, depth = 0) {
    f = S2(f);
    const pieces = [];
    for (const t of termsOf(f)) {
      const [c, r] = coefOf(t);
      const constF = r.filter(x => !has(x, v)), varF = r.filter(x => has(x, v));
      const core = varF.length === 0 ? N(1) : varF.length === 1 ? varF[0] : { k: '*', a: varF };
      let b = basic(core, v, depth);
      if (!b && core.k === '*') { const ex = S2(expand(core)); if (ex.k === '+') { const F = integrateNode(ex, v, depth + 1); if (F) b = { F }; } }
      if (!b) return null;
      pieces.push(S2({ k: '*', a: [c, ...constF, b.F] }));
    }
    return pieces.length === 1 ? pieces[0] : S2({ k: '+', a: pieces });
  }
  /* numerische Probe: F′ ≈ f an mehreren Stellen */
  function checkAnti(F, f, v) {
    const dF = d(F, v), a = fnum(dF, v), b = fnum(f, v);
    let ok = 0, n = 0;
    for (const x of [0.37, 1.3, 2.71, -0.83, 4.2, -2.4, 0.11]) {
      const p = a(x), q = b(x);
      if (!Number.isFinite(q) || !Number.isFinite(p)) continue;
      n++; if (Math.abs(p - q) <= 1e-6 * Math.max(1, Math.abs(q))) ok++;
    }
    return n >= 3 && ok === n;
  }
  function simpson(f, a, b, n = 2000) {
    const h = (b - a) / n;
    let s = f(a) + f(b);
    for (let i = 1; i < n; i++) s += (i % 2 ? 4 : 2) * f(a + i * h);
    return s * h / 3;
  }
  function integrate(f, v = 'x', bounds = null) {
    const f0 = S2(f);
    const steps = [];
    const bt = bounds ? `_{${tex(bounds[0])}}^{${tex(bounds[1])}}` : '';
    steps.push({ title: 'Aufgabe', note: bounds ? `bestimmtes Integral von ${txt(bounds[0])} bis ${txt(bounds[1])}` : 'Stammfunktion suchen', tex: `\\int${bt} ${parenTex(f0)} \\, d${v}`, text: `∫${bounds ? '[' + txt(bounds[0]) + '; ' + txt(bounds[1]) + ']' : ''} ${txt(f0)} d${v}` });
    let F = null;
    const ts = termsOf(f0);
    if (ts.length > 1) steps.push({ title: 'Summenregel', note: 'Jedes Glied einzeln integrieren, Zahlfaktoren bleiben stehen.', tex: '= ' + ts.map((t, i) => { const [c] = coefOf(t); const neg = c.p < 0; return (i ? (neg ? ' - ' : ' + ') : neg ? '-' : '') + `\\int ${parenTex(neg ? S2({ k: 'neg', a: t }) : t)} \\, d${v}`; }).join(''), text: '= ' + ts.map(t => `∫${txt(t)} d${v}`).join(' + ') });
    const notes = [];
    const parts = [];
    for (const t of ts) {
      const [c, r] = coefOf(t);
      const varF = r.filter(x => has(x, v));
      const core = varF.length === 0 ? N(1) : varF.length === 1 ? varF[0] : { k: '*', a: varF };
      let b = basic(core, v, 0);
      if (!b && core.k === '*') { const ex = S2(expand(core)); const G = ex.k === '+' ? integrateNode(ex, v, 1) : null; if (G) b = { F: G, rule: 'erst ausmultiplizieren, dann gliedweise' }; }
      if (!b) { F = null; parts.length = 0; break; }
      const Ft = nice({ k: '*', a: [c, ...r.filter(x => !has(x, v)), b.F] });
      parts.push(Ft);
      notes.push(`${txt(t)} → ${txt(Ft)} (${b.rule})`);
      if (b.parts) steps.push({ title: 'Partielle Integration', note: b.rule, tex: `\\int ${parenTex(t)} \\, d${v} = ${tex(Ft)}`, text: `∫${txt(t)} d${v} = ${txt(Ft)}` });
    }
    if (parts.length) F = nice(parts.length === 1 ? parts[0] : { k: '+', a: parts });
    if (!F) {
      // ganzer Ausdruck ausmultipliziert?
      const ex = S2(expand(f0));
      const G = txt(ex) !== txt(f0) ? integrateNode(ex, v, 0) : null;
      if (G) { F = nice(G); steps.push({ title: 'Ausmultiplizieren', note: 'Zuerst ausmultiplizieren, dann gliedweise integrieren.', tex: `= \\int ${parenTex(ex)} \\, d${v}`, text: `= ∫${txt(ex)} d${v}` }); }
    }
    if (!F || !checkAnti(F, f0, v)) {
      const res = { kind: 'cas', op: 'int', v, steps, error: 'Für diese Funktion kenne ich keine Stammfunktion (keine Grundregel passt).', problem: steps[0] };
      if (bounds) {
        const a = num(bounds[0]), b = num(bounds[1]), g = fnum(f0, v);
        const val = simpson(g, a, b);
        if (Number.isFinite(val)) { res.error = null; res.result = N(+val.toPrecision(10)); res.approx = true; res.tex = `\\approx ${approxStr(val).replace('−', '-')}`; res.text = '≈ ' + approxStr(val); steps.push({ title: 'Numerisch (Simpson-Regel)', note: 'Ohne Stammfunktion: Fläche näherungsweise mit 2000 Streifen.', tex: `\\approx ${approxStr(val).replace('−', '-')}`, text: '≈ ' + approxStr(val) }); }
      }
      return res;
    }
    steps.push({ title: 'Grundintegrale', note: notes.join(';  '), tex: '= ' + tex(F) + (bounds ? '' : ' + C'), text: '= ' + txt(F) + (bounds ? '' : ' + C') });
    steps.push({ title: 'Probe', note: `Ableiten ergibt wieder ${txt(f0)} ✓`, tex: `\\left(${tex(F)}\\right)' = ${tex(f0)}`, text: `(${txt(F)})′ = ${txt(f0)}` });
    if (!bounds) return { kind: 'cas', op: 'int', v, steps, result: F, anti: F, tex: `${tex(F)} + C`, text: `${txt(F)} + C`, problem: steps[0] };
    // bestimmtes Integral: [F] von a bis b
    const [A, B] = bounds;
    const g = fnum(f0, v), a = num(A), b = num(B);
    // Polstelle im Intervall? (nicht integrierbar)
    let pole = false;
    for (let i = 0; i <= 400; i++) { const y = g(a + (b - a) * i / 400); if (!Number.isFinite(y) || Math.abs(y) > 1e12) { pole = true; break; } }
    if (pole) return { kind: 'cas', op: 'int', v, steps, error: 'Die Funktion ist zwischen den Grenzen nicht überall definiert (Polstelle) – das Integral existiert so nicht.', problem: steps[0] };
    const FB = at(F, v, B), FA = at(F, v, A);
    let val = nice({ k: '+', a: [FB, { k: 'neg', a: FA }] });
    const dec = num(val), chk = simpson(g, a, b);
    const okExact = Number.isFinite(dec) && Math.abs(dec - chk) <= 1e-6 * Math.max(1, Math.abs(chk));
    if (!okExact) val = N(+chk.toPrecision(10));
    steps.push({ title: 'Grenzen einsetzen', note: 'Hauptsatz: F(b) − F(a)', tex: `\\left[${tex(F)}\\right]${bt} = ${parenTex(FB)} - ${parenTex(FA)}`, text: `[${txt(F)}] = (${txt(FB)}) − (${txt(FA)})` });
    const exactTxt = txt(val), decTxt = approxStr(okExact ? dec : chk);
    steps.push({ title: 'Ergebnis', tex: `= ${tex(val)}${val.k === 'n' && val.q === 1 ? '' : ' \\approx ' + decTxt.replace('−', '-')}`, text: `= ${exactTxt}${val.k === 'n' && val.q === 1 ? '' : ' ≈ ' + decTxt}` });
    return { kind: 'cas', op: 'int', v, steps, result: val, anti: F, bounds, tex: tex(val) + (val.k === 'n' && val.q === 1 ? '' : ` \\approx ${decTxt.replace('−', '-')}`), text: exactTxt + (val.k === 'n' && val.q === 1 ? '' : ' ≈ ' + decTxt), dec: okExact ? dec : chk, problem: steps[0] };
  }

  /* ---------------------------------------------------------- Ausmultiplizieren */
  function expandSteps(f) {
    const f0 = S2(f);
    const e = S2(expand(f0));
    const steps = [{ title: 'Aufgabe', note: 'Klammern auflösen', tex: tex(f0), text: txt(f0) }];
    if (f0.k === '*' || f0.k === '^' || f0.k === '+') steps.push({ title: 'Ausmultiplizieren', note: f0.k === '^' ? 'Binomische Formel bzw. Klammer mal Klammer' : 'Jedes Glied mit jedem multiplizieren', tex: '= ' + tex(e), text: '= ' + txt(e) });
    return { kind: 'cas', op: 'expand', steps, result: e, tex: tex(e), text: txt(e), problem: steps[0] };
  }

  /* ---------------------------------------------------------- Faktorisieren */
  const sqrtQ = (c) => { if (c.p < 0) return null; const a = Math.round(Math.sqrt(c.p)), b = Math.round(Math.sqrt(c.q)); return a * a === c.p && b * b === c.q ? N(a, b) : null; };
  // Quadratwurzel eines Monoms (Zahl·Basen mit geraden Hochzahlen) oder null
  function sqrtMono(t) {
    const [c, r] = coefOf(t);
    const s = sqrtQ(c);
    if (!s) return null;
    const fs = [];
    for (const f of r) {
      if (f.k === 'v') return null;
      if (f.k === '^' && isExactInt(f.b) && f.b.p % 2 === 0) fs.push(f.b.p === 2 ? f.a : { k: '^', a: f.a, b: N(f.b.p / 2) });
      else return null;
    }
    return S2({ k: '*', a: [s, ...fs] });
  }
  function factor(f, vPref) {
    const f0 = S2(expand(S2(f)));
    const steps = [{ title: 'Aufgabe', note: 'in Faktoren zerlegen', tex: tex(f0), text: txt(f0) }];
    const factors = [];   // { node, m }
    let rest = f0;
    // 1) gemeinsamer Faktor (Zahl und Buchstaben)
    if (rest.k === '+') {
      const ts = rest.a.map(coefOf);
      let g = 0, L = 1;
      for (const [c] of ts) { if (!exactNum(c)) { g = 1; break; } g = gcd(g, c.p); L = lcm(L, c.q); }
      const cg = N(g, L);
      const common = new Map();
      ts.forEach(([, r], i) => {
        const here = new Map();
        for (const x of r) { const [b, e] = x.k === '^' && isExactInt(x.b) ? [x.a, x.b.p] : [x, 1]; const k = txt(b); here.set(k, { b, e: (here.get(k)?.e || 0) + e }); }
        if (i === 0) for (const [k, o] of here) common.set(k, o);
        else for (const [k, o] of [...common]) { const h = here.get(k); if (!h) common.delete(k); else o.e = Math.min(o.e, h.e); }
      });
      // führendes Vorzeichen mit ausklammern, wenn alle Glieder negativ
      const allNeg = ts.every(([c]) => c.p < 0);
      const cs = allNeg ? N(-cg.p, cg.q) : cg;
      const cf = [...common.values()].filter(o => o.e > 0).map(o => o.e === 1 ? o.b : { k: '^', a: o.b, b: N(o.e) });
      if (cf.length || !(cs.p === 1 && cs.q === 1)) {
        const G = S2({ k: '*', a: [cs, ...cf] });
        const inner = S2({ k: '+', a: rest.a.map(t => S2({ k: '/', a: t, b: G })) });   // Glied für Glied teilen
        if (!(cs.p === 1 && cs.q === 1)) factors.push({ node: cs, m: 1, num: true });
        for (const x of cf) factors.push({ node: x, m: 1 });
        rest = inner;
        steps.push({ title: 'Ausklammern', note: `Gemeinsamer Faktor: ${txt(G)}`, tex: `= ${parenTex(G)} \\cdot \\left(${tex(inner)}\\right)`, text: `= ${txt(G)}·(${txt(inner)})` });
      }
    }
    // 2) Polynom in einer Unbekannten: Nullstellen raten, Polynomdivision
    const vars = [...lettersIn(rest)];
    const v = vars.includes(vPref) ? vPref : vars[0];
    const P = vars.length === 1 ? polyQ(rest, v) : null;
    if (P && deg(P) >= 2) {
      // ganzzahlig machen
      let L = 1; for (const c of P) L = lcm(L, c.q);
      let B = P.map(c => c.p * (L / c.q));
      let g = 0; for (const b of B) g = gcd(g, b);
      if (B[B.length - 1] < 0) g = -g;
      B = B.map(b => b / g);
      const pre = N(g, L);
      if (!(pre.p === 1 && pre.q === 1)) { factors.push({ node: pre, m: 1, num: true }); }
      const lin = [];
      let guard = 0;
      while (B.length > 3 && guard++ < 20) {
        if (B[0] === 0) { lin.push({ p: 0, q: 1 }); B = B.slice(1); continue; }
        let found = null;
        const ps = divisors(B[0]), qs = divisors(B[B.length - 1]);
        outer: for (const q of qs) for (const p0 of ps) for (const p of [p0, -p0]) {
          if (gcd(p, q) !== 1) continue;
          const r = polyEval(B.map(b => N(b)), N(p, q));
          if (r.p === 0) { found = { p, q }; break outer; }
        }
        if (!found) break;
        steps.push({ title: 'Nullstelle raten', note: `${v} = ${found.q === 1 ? found.p : found.p + '/' + found.q} ist eine Nullstelle (Teiler von ${Math.abs(B[0])}${found.q > 1 ? ' durch Teiler von ' + Math.abs(B[B.length - 1]) : ''}) ⇒ Polynomdivision durch (${linTxt(found, v)})`, tex: `${polyTexI(B, v)} = \\left(${linTex(found, v)}\\right) \\cdot \\left(${polyTexI(divLin(B, found.p, found.q), v)}\\right)`, text: `${polyTxtI(B, v)} = (${linTxt(found, v)})·(${polyTxtI(divLin(B, found.p, found.q), v)})` });
        B = divLin(B, found.p, found.q);
        lin.push(found);
      }
      if (B.length === 3) {
        const [c0, c1, c2] = B, D = c1 * c1 - 4 * c2 * c0;
        const sq = Math.round(Math.sqrt(Math.max(0, D)));
        if (D >= 0 && sq * sq === D) {
          // rationale Nullstellen (−b ± √D)/(2a) → Linearfaktoren (Gauss: ganzzahlig)
          const r1 = { p: -c1 + sq, q: 2 * c2 }, r2 = { p: -c1 - sq, q: 2 * c2 };
          for (const r of [r1, r2]) { const gg = gcd(r.p, r.q) * Math.sign(r.q); r.p /= gg; r.q /= gg; }
          const note = D === 0 ? 'Binomische Formel (Diskriminante 0 – doppelte Nullstelle)' : `Mitternachtsformel: D = ${D} = ${sq}² ⇒ ${v}₁ = ${fracTxt(r1)}, ${v}₂ = ${fracTxt(r2)}`;
          // Zahlfaktor, der bei (q1 x − p1)(q2 x − p2) übrig bleibt
          const k = c2 / (r1.q * r2.q);
          if (k !== 1) factors.push({ node: N(k), m: 1, num: true });
          lin.push(r1, r2);
          steps.push({ title: D === 0 ? 'Binomische Formel' : 'Quadratischer Rest', note, tex: `${polyTexI(B, v)} = ${k !== 1 ? k + ' \\cdot ' : ''}\\left(${linTex(r1, v)}\\right)\\left(${linTex(r2, v)}\\right)`, text: `${polyTxtI(B, v)} = ${k !== 1 ? k + '·' : ''}(${linTxt(r1, v)})·(${linTxt(r2, v)})` });
          B = [1];
        } else if (D < 0) steps.push({ title: 'Nicht weiter zerlegbar', note: `Diskriminante D = ${D} < 0 – keine reellen Nullstellen.` });
        else steps.push({ title: 'Nicht weiter zerlegbar (mit Brüchen)', note: `D = ${D} ist keine Quadratzahl – Nullstellen ${v} = (${-c1} ± √${D})/${2 * c2} sind irrational.` });
      } else if (B.length > 3) steps.push({ title: 'Kein weiterer Faktor', note: 'Keine rationale Nullstelle mehr – der Rest bleibt stehen.' });
      // gleiche Linearfaktoren zusammenfassen
      const grp = new Map();
      lin.sort((a, b) => a.p / a.q - b.p / b.q);
      for (const r of lin) { const k = r.p + '/' + r.q; grp.set(k, { r, m: (grp.get(k)?.m || 0) + 1 }); }
      for (const { r, m } of grp.values()) factors.push({ node: linNode(r, v), m });
      if (B.length > 1) factors.push({ node: polyNode(B.map(b => N(b)), v), m: 1 });
    } else if (rest.k === '+' && rest.a.length === 2) {
      // a² − b² = (a − b)(a + b)
      const [x, y] = rest.a, cy = coefOf(y)[0];
      const sx = sqrtMono(x), sy = cy.p < 0 ? sqrtMono(S2({ k: 'neg', a: y })) : null;
      if (sx && sy) {
        const A = { k: '+', a: [sx, { k: 'neg', a: sy }] }, Bn = { k: '+', a: [sx, sy] };
        factors.push({ node: A, m: 1 }, { node: Bn, m: 1 });
        steps.push({ title: '3. binomische Formel', note: 'a² − b² = (a − b)(a + b)', tex: `${tex(rest)} = \\left(${tex(A)}\\right)\\left(${tex(Bn)}\\right)`, text: `${txt(rest)} = (${txt(A)})·(${txt(Bn)})` });
        rest = null;
      }
    } else if (rest.k === '+' && rest.a.length === 3) {
      // a² ± 2ab + b² = (a ± b)²
      const sq = rest.a.map(sqrtMono);
      const i = sq.findIndex(s => !s);
      if (i >= 0 && sq.filter(Boolean).length === 2) {
        const [a, b] = sq.filter(Boolean), mid = rest.a[i];
        const two = S2({ k: '*', a: [N(2), a, b] });
        const sg = txt(S2(mid)) === txt(two) ? 1 : txt(S2({ k: 'neg', a: mid })) === txt(two) ? -1 : 0;
        if (sg) {
          const B2 = { k: '+', a: [a, sg > 0 ? b : { k: 'neg', a: b }] };
          factors.push({ node: B2, m: 2 });
          steps.push({ title: sg > 0 ? '1. binomische Formel' : '2. binomische Formel', note: sg > 0 ? 'a² + 2ab + b² = (a + b)²' : 'a² − 2ab + b² = (a − b)²', tex: `${tex(rest)} = \\left(${tex(B2)}\\right)^{2}`, text: `${txt(rest)} = (${txt(B2)})²` });
          rest = null;
        }
      }
      if (rest) factors.push({ node: rest, m: 1 });
    } else if (!(P && deg(P) < 2 && isN(rest, 1))) factors.push({ node: rest, m: 1 });
    if (P && deg(P) < 2 && !isN(rest, 1)) { /* linearer Rest bleibt */ if (!factors.some(o => o.node === rest)) factors.push({ node: rest, m: 1 }); }
    if (rest && rest.k === '+' && P == null && rest.a.length === 2 && !factors.some(o => o.node === rest)) factors.push({ node: rest, m: 1 });
    // Zahlfaktoren zusammenfassen
    let c = N(1);
    const fs = [];
    for (const o of factors) { if (o.num || o.node.k === 'n') c = qmul(c, o.node.k === 'n' ? o.node : N(1)); else if (!isN(o.node, 1)) fs.push(o); }
    const node = { k: '*', a: [...(c.p === c.q ? [] : [c]), ...fs.map(o => o.m === 1 ? o.node : { k: '^', a: o.node, b: N(o.m) })] };
    const res = node.a.length === 0 ? N(1) : node.a.length === 1 ? node.a[0] : node;
    const T = factTex(res), X = factTxt(res);
    const changed = X.replace(/\s/g, '') !== txt(f0).replace(/\s/g, '');
    steps.push({ title: changed ? 'Ergebnis' : 'Nicht zerlegbar', note: changed ? 'Probe: wieder ausmultiplizieren ergibt die Aufgabe.' : 'Der Ausdruck lässt sich mit ganzen Zahlen/Brüchen nicht weiter zerlegen.', tex: '= ' + T, text: '= ' + X });
    // Probe
    const back = S2(expand(res));
    const ok = txt(back) === txt(f0) || [0.7, 1.9, -1.3].every(x => { const env = {}; for (const l of lettersIn(f0)) env[l] = x + l.charCodeAt(0) / 97; const p = num(f0, env), q = num(res, env); return Math.abs(p - q) <= 1e-7 * Math.max(1, Math.abs(p)); });
    return { kind: 'cas', op: 'factor', steps, result: res, tex: T, text: X, ok, changed, problem: steps[0] };
  }
  const fracTxt = (r) => r.q === 1 ? String(r.p) : `${r.p}/${r.q}`;
  // (q·x − p) als Knoten/Text/TeX
  const linNode = (r, v) => { const xq = r.q === 1 ? V(v) : { k: '*', a: [N(r.q), V(v)] }; return r.p === 0 ? V(v) : { k: '+', a: [xq, N(-r.p)] }; };
  const linTxt = (r, v) => txt(linNode(r, v));
  const linTex = (r, v) => tex(linNode(r, v));
  const polyTexI = (B, v) => tex(polyNode(B.map(b => N(b)), v));
  const polyTxtI = (B, v) => txt(polyNode(B.map(b => N(b)), v));
  // Produkt so ausgeben, wie man es schreibt: 2·(x − 1)·(x + 3)² → 2(x − 1)(x + 3)²
  function factTex(n) {
    if (n.k !== '*') return tex(n);
    return n.a.map((f, i) => {
      if (f.k === 'n') return tex(f);
      if (f.k === '^' && f.a.k === '+') return `\\left(${tex(f.a)}\\right)^{${tex(f.b)}}`;
      return f.k === '+' ? `\\left(${tex(f)}\\right)` : (i && n.a[i - 1].k === 'n' ? '' : '') + tex(f);
    }).join(' ');
  }
  function factTxt(n) {
    if (n.k !== '*') return txt(n);
    return n.a.map(f => f.k === '^' && f.a.k === '+' ? `(${txt(f.a)})^${txt(f.b)}` : f.k === '+' ? `(${txt(f)})` : txt(f, 2)).join('·');
  }
  function lettersIn(n, out = new Set()) {
    if (!n || typeof n !== 'object') return out;
    if (n.k === 'v') out.add(n.n);
    for (const x of n.k === '+' || n.k === '*' ? n.a : [n.a, n.b]) if (x && typeof x === 'object') lettersIn(x, out);
    return out;
  }

  /* ---------------------------------------------------------- Lineares Gleichungssystem (Gauss) */
  const ROM = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII'];
  function linTerm(cs, vars, rhs, mode) {
    let s = '';
    vars.forEach((x, j) => {
      const c = cs[j];
      if (c.p === 0) return;
      const neg = c.p < 0, a = N(Math.abs(c.p), c.q);
      const coef = a.p === 1 && a.q === 1 ? '' : mode === 'tex' ? (a.q === 1 ? String(a.p) : `\\frac{${a.p}}{${a.q}}`) : (a.q === 1 ? String(a.p) : `(${a.p}/${a.q})`);
      s += (s ? (neg ? (mode === 'tex' ? ' - ' : ' − ') : ' + ') : neg ? (mode === 'tex' ? '-' : '−') : '') + coef + (mode === 'tex' || !coef ? '' : '') + x;
    });
    if (!s) s = '0';
    return s + ' = ' + (mode === 'tex' ? qtex(rhs) : qtxt(rhs));
  }
  const sysTex = (M, vars) => `\\begin{cases} ${M.map((r, i) => `\\text{${ROM[i] || i + 1}:}\\; ${linTerm(r.slice(0, -1), vars, r[r.length - 1], 'tex')}`).join(' \\\\ ')} \\end{cases}`;
  const sysTxt = (M, vars) => M.map((r, i) => `${ROM[i] || i + 1}: ${linTerm(r.slice(0, -1), vars, r[r.length - 1], 'txt')}`).join('   ');
  /* eqs: [{ L, R }] als Knoten → Matrix [a1 … an | b] */
  function toMatrix(eqs) {
    const vs = new Set();
    for (const e of eqs) { lettersIn(e.L, vs); lettersIn(e.R, vs); }
    const vars = [...vs].sort((a, b) => 'xyzuvw'.indexOf(a) >= 0 && 'xyzuvw'.indexOf(b) >= 0 ? 'xyzuvw'.indexOf(a) - 'xyzuvw'.indexOf(b) : a.localeCompare(b));
    const M = eqs.map((e, i) => {
      const f = S2(expand({ k: '+', a: [e.L, { k: 'neg', a: e.R }] }));
      const row = vars.map(() => N(0));
      let c = N(0);
      for (const t of termsOf(f)) {
        const [k, r] = coefOf(t);
        if (!exactNum(k)) throw Err('Nur exakte Zahlen im Gleichungssystem');
        if (r.length === 0) { c = qadd(c, k); continue; }
        if (r.length === 1 && r[0].k === 'v') { const j = vars.indexOf(r[0].n); row[j] = qadd(row[j], k); continue; }
        throw Err(`Gleichung ${ROM[i] || i + 1} ist nicht linear (${txt(t)}) – nur lineare Gleichungssysteme`);
      }
      return [...row, N(-c.p, c.q)];
    });
    return { M, vars };
  }
  function system(eqs) {
    const { M, vars } = toMatrix(eqs);
    const m = M.length, n = vars.length;
    const steps = [{ title: 'Aufgabe', note: `${m} Gleichungen, ${n} Unbekannte (${vars.join(', ')})`, tex: sysTex(M, vars), text: sysTxt(M, vars) }];
    if (!n) throw Err('Keine Unbekannte im Gleichungssystem');
    const A = M.map(r => r.slice());
    const piv = [];
    let row = 0;
    for (let col = 0; col < n && row < m; col++) {
      let p = -1;
      for (let i = row; i < m; i++) if (A[i][col].p !== 0) { p = i; break; }
      if (p < 0) continue;
      if (p !== row) { [A[p], A[row]] = [A[row], A[p]]; steps.push({ title: 'Gleichungen tauschen', note: `${ROM[row]} ↔ ${ROM[p]}, damit ${vars[col]} oben steht`, tex: sysTex(A, vars), text: sysTxt(A, vars) }); }
      const ops = [];
      for (let i = row + 1; i < m; i++) {
        if (A[i][col].p === 0) continue;
        const a = A[row][col], b = A[i][col];
        const ints = A[i].every(x => x.q === 1) && A[row].every(x => x.q === 1);
        if (ints) {
          // wie in der Schule ganzzahlig: (a/g)·II − (b/g)·I, danach durch den ggT der Zeile kürzen
          const g = gcd(a.p, b.p), ka = N(a.p / g), kb = N(b.p / g);
          const sg = ka.p < 0 ? -1 : 1;
          const KA = N(sg * ka.p), KB = N(sg * kb.p);
          A[i] = A[i].map((x, j) => qsub(qmul(KA, x), qmul(KB, A[row][j])));
          let rg = 0; for (const x of A[i]) rg = gcd(rg, x.p);
          if (rg > 1) A[i] = A[i].map(x => N(x.p / rg));
          const fa = KA.p === 1 ? '' : KA.p + '·', fb = Math.abs(KB.p) === 1 ? '' : Math.abs(KB.p) + '·';
          ops.push(`${fa}${ROM[i]} ${KB.p < 0 ? '+' : '−'} ${fb}${ROM[row]}${rg > 1 ? ' (gekürzt durch ' + rg + ')' : ''}`);
        } else {
          const f = qdiv(b, a);
          A[i] = A[i].map((x, j) => qsub(x, qmul(f, A[row][j])));
          const fa = N(Math.abs(f.p), f.q);
          ops.push(`${ROM[i]} ${f.p < 0 ? '+' : '−'} ${fa.p === 1 && fa.q === 1 ? '' : qtxt(fa) + '·'}${ROM[row]}`);
        }
      }
      if (ops.length) steps.push({ title: 'Eliminieren', note: `${vars[col]} aus den Gleichungen darunter entfernen`, op: ops.join(',  '), tex: sysTex(A, vars), text: sysTxt(A, vars) + '      | ' + ops.join(', ') });
      piv.push({ row, col });
      row++;
    }
    // Widerspruch? 0 = c
    for (let i = row; i < m; i++) if (A[i].slice(0, n).every(x => x.p === 0) && A[i][n].p !== 0) {
      steps.push({ title: 'Widerspruch', note: `Gleichung ${ROM[i]} lautet 0 = ${qtxt(A[i][n])} – das stimmt nie.` });
      return { kind: 'cas', op: 'system', vars, steps, sols: [], none: true, tex: '\\mathbb{L} = \\{\\}', text: 'keine Lösung', problem: steps[0] };
    }
    // rückwärts einsetzen (Gauss-Jordan)
    for (let k = piv.length - 1; k >= 0; k--) {
      const { row: r, col: c } = piv[k];
      const a = A[r][c];
      A[r] = A[r].map(x => qdiv(x, a));
      for (let i = 0; i < r; i++) { const f = A[i][c]; if (f.p !== 0) A[i] = A[i].map((x, j) => qsub(x, qmul(f, A[r][j]))); }
    }
    const free = vars.filter((_, j) => !piv.some(p => p.col === j));
    const sols = piv.map(({ row: r, col: c }) => {
      // x_c = b − Σ a_f · f
      const parts = [A[r][n]];
      free.forEach(fv => { const j = vars.indexOf(fv), a = A[r][j]; if (a.p !== 0) parts.push({ k: '*', a: [N(-a.p, a.q), V(fv)] }); });
      const node = S2({ k: '+', a: parts });
      return { v: vars[c], node, tex: `${vars[c]} = ${tex(node)}`, text: `${vars[c]} = ${txt(node)}` };
    });
    steps.push({ title: 'Rückwärts einsetzen', note: free.length ? `Unbekannte ${free.join(', ')} frei wählbar` : 'Von unten nach oben einsetzen und nach der Unbekannten auflösen', tex: sols.map(s => s.tex).join(',\\quad '), text: sols.map(s => s.text).join(',  ') });
    // Probe
    const env = {}; free.forEach((f, i) => { env[f] = 1.5 + i; }); for (const s of sols) env[s.v] = num(s.node, env);
    const ok = eqs.every(e => Math.abs(num(e.L, env) - num(e.R, env)) < 1e-7 * Math.max(1, Math.abs(num(e.R, env))));
    if (ok) steps.push({ title: 'Probe', note: 'Alle Gleichungen stimmen ✓' });
    const T = sols.map(s => s.tex).join(',\\; ') + (free.length ? `,\\; ${free.join(', ')} \\in \\mathbb{R}` : '');
    return { kind: 'cas', op: 'system', vars, steps, sols, free, ok, tex: T, text: sols.map(s => s.text).join(';  ') + (free.length ? `;  ${free.join(', ')} beliebig` : ''), problem: steps[0] };
  }

  // √n mit herausgezogener Quadratzahl: √12 = 2√3
  function sqrtInt(n) {
    let o = 1, r = n;
    for (let k = Math.floor(Math.sqrt(n)); k > 1; k--) if (r % (k * k) === 0) { o = k; r /= k * k; break; }
    if (r === 1) return N(o);
    const s = { k: 'fn', f: 'sqrt', a: N(r) };
    return o === 1 ? s : { k: '*', a: [N(o), s] };
  }
  /* ---------------------------------------------------------- Nullstellen (exakt, wenn möglich) */
  function roots(f, v, range = [-60, 60]) {
    const out = [];
    const P = polyQ(f, v);
    const push = (x, node, m) => { if (!out.some(r => Math.abs(r.x - x) < 1e-9 * Math.max(1, Math.abs(x)))) out.push({ x, node, m: m || 1, exact: !!node }); };
    if (P) {
      if (deg(P) === 0) return P[0].p === 0 ? null : [];
      let L = 1; for (const c of P) L = lcm(L, c.q);
      let B = P.map(c => c.p * (L / c.q));
      let guard = 0;
      while (B.length > 1 && guard++ < 24) {
        if (B[0] === 0) { push(0, N(0)); const r = out.find(o => o.x === 0); if (r && guard > 1 && r.node) r.m++; B = B.slice(1); continue; }
        if (B.length === 2) { push(-B[0] / B[1], N(-B[0], B[1])); B = [1]; break; }
        if (B.length === 3) {
          const [c0, c1, c2] = B, D = c1 * c1 - 4 * c2 * c0;
          if (D < 0) break;
          const sD = sqrtInt(D);
          for (const s of D === 0 ? [0] : [-1, 1]) {
            const node = S2({ k: '/', a: { k: '+', a: [N(-c1), s < 0 ? { k: 'neg', a: sD } : s > 0 ? sD : N(0)] }, b: N(2 * c2) });
            push((-c1 + s * Math.sqrt(D)) / (2 * c2), node, D === 0 ? 2 : 1);
          }
          B = [1]; break;
        }
        let found = null;
        const ps = divisors(B[0]), qs = divisors(B[B.length - 1]);
        outer: for (const q of qs) for (const p0 of ps) for (const p of [p0, -p0]) { if (gcd(p, q) !== 1) continue; if (polyEval(B.map(b => N(b)), N(p, q)).p === 0) { found = { p, q }; break outer; } }
        if (!found) break;
        const ex = out.find(o => Math.abs(o.x - found.p / found.q) < 1e-12);
        if (ex) ex.m++; else push(found.p / found.q, N(found.p, found.q));
        B = divLin(B, found.p, found.q);
      }
      if (B.length > 1) {
        // Rest numerisch
        const Pr = B.map(b => N(b));
        const g = (x) => qv(polyEval(Pr, N(x))) ;
        const h = (x) => B.reduceRight((s, c) => s * x + c, 0);
        void g;
        for (const x of numRoots(h, range)) push(x, null);
      }
      return out.sort((a, b) => a.x - b.x);
    }
    for (const x of numRoots(fnum(f, v), range)) push(x, exactGuess(f, v, x));
    return out.sort((a, b) => a.x - b.x);
  }
  // „schöne“ Zahl erkennen (ganz, einfache Brüche, Vielfache von π) und prüfen
  function exactGuess(f, v, x) {
    const cands = [];
    for (const q of [1, 2, 3, 4, 6]) { const p = Math.round(x * q); if (Math.abs(p / q - x) < 1e-9) cands.push(N(p, q)); }
    for (const q of [1, 2, 3, 4, 6]) { const p = Math.round(x * q / Math.PI); if (p && Math.abs(p * Math.PI / q - x) < 1e-9) cands.push(S2({ k: '/', a: { k: '*', a: [N(p), { k: 'c', n: 'π' }] }, b: N(q) })); }
    for (const c of cands) { const y = num(f, { [v]: num(c) }); if (Math.abs(y) < 1e-10) return c; }
    return null;
  }
  function numRoots(g, [lo, hi], n = 24000) {
    const out = [];
    let px = lo, pv = g(lo);
    for (let i = 1; i <= n; i++) {
      const x = lo + (hi - lo) * i / n, v = g(x);
      if (Number.isFinite(pv) && Number.isFinite(v) && (pv === 0 || pv * v < 0)) {
        let a = px, b = x, fa = pv;
        if (pv === 0) b = a;
        for (let k = 0; k < 90 && b - a > 1e-14 * Math.max(1, Math.abs(a)); k++) { const m = (a + b) / 2, fm = g(m); if (fa * fm <= 0) b = m; else { a = m; fa = fm; } }
        const r = (a + b) / 2;
        // Polstelle mit Vorzeichenwechsel ausschliessen
        if (Math.abs(g(r)) < 1e-6 * Math.max(1, Math.abs(g(r + 1e-3)) + Math.abs(g(r - 1e-3))) && !out.some(q => Math.abs(q - r) < 1e-7 * Math.max(1, Math.abs(r)))) out.push(+r.toPrecision(13));
      } else if (Number.isFinite(pv) && Number.isFinite(v) && i > 1) {
        // Berührpunkt (doppelte Nullstelle): |g| klein und Minimum
      }
      px = x; pv = v;
    }
    return out;
  }
  // Definitionslücken / Polstellen (Nenner = 0) und Bereiche ausserhalb (Wurzel, ln)
  function poles(f, v) {
    const dens = [];
    const walk = (n) => { if (!n || typeof n !== 'object') return; if (n.k === '/' && has(n.b, v)) dens.push(n.b); if (n.k === '^' && has(n.a, v) && n.b.k === 'n' && n.b.p < 0) dens.push(n.a); if (n.k === 'fn' && (n.f === 'tan')) dens.push({ k: 'fn', f: 'cos', a: n.a }); for (const x of n.k === '+' || n.k === '*' ? n.a : [n.a, n.b]) walk(x); };
    walk(f);
    const out = [];
    for (const dn of dens) for (const r of roots(dn, v, [-60, 60]) || []) if (!out.some(o => Math.abs(o.x - r.x) < 1e-9)) out.push(r);
    return out.sort((a, b) => a.x - b.x);
  }

  /* ---------------------------------------------------------- Ungleichungen */
  const REL = { '<': '<', '>': '>', '<=': '\\leq', '>=': '\\geq', '≤': '\\leq', '≥': '\\geq' };
  const RELT = { '<': '<', '>': '>', '<=': '≤', '>=': '≥', '≤': '≤', '≥': '≥' };
  const flip = { '<': '>', '>': '<', '≤': '≥', '≥': '≤', '<=': '>=', '>=': '<=' };
  function inequality(Ln, rel, Rn, v = 'x') {
    rel = RELT[rel] || rel;
    const L0 = S2(Ln), R0 = S2(Rn);
    const steps = [{ title: 'Aufgabe', tex: `${tex(L0)} ${REL[rel]} ${tex(R0)}`, text: `${txt(L0)} ${rel} ${txt(R0)}` }];
    const f = S2(expand({ k: '+', a: [L0, { k: 'neg', a: R0 }] }));
    const P = polyQ(f, v);
    const holds = (y) => rel === '<' ? y < 0 : rel === '>' ? y > 0 : rel === '≤' ? y <= 0 : y >= 0;
    const strict = rel === '<' || rel === '>';
    if (P && deg(P) === 0) {
      const ok = holds(qv(P[0]));
      steps.push({ title: ok ? 'Immer wahr' : 'Nie wahr', note: `${v} fällt weg: ${qtxt(P[0])} ${rel} 0 ist ${ok ? 'wahr' : 'falsch'}.` });
      return { kind: 'cas', op: 'ineq', v, steps, tex: ok ? `${v} \\in \\mathbb{R}` : '\\mathbb{L} = \\{\\}', text: ok ? `alle ${v}` : 'keine Lösung', problem: steps[0] };
    }
    if (P && deg(P) === 1) {
      // wie eine Gleichung umformen; beim Teilen durch eine negative Zahl dreht sich das Zeichen
      const a = P[1], b = P[0];
      steps.push({ title: 'Alles mit ' + v + ' nach links, Zahlen nach rechts', tex: `${tex(polyNode([N(0), a], v))} ${REL[rel]} ${qtex(N(-b.p, b.q))}`, text: `${txt(polyNode([N(0), a], v))} ${rel} ${qtxt(N(-b.p, b.q))}` });
      const r = qdiv(N(-b.p, b.q), a);
      const rel2 = a.p < 0 ? flip[rel] : rel;
      if (!(a.p === 1 && a.q === 1)) steps.push({ title: a.p < 0 ? 'Durch eine negative Zahl teilen – Zeichen dreht sich!' : 'Durch den Faktor teilen', op: `| : ${a.p < 0 ? '(' + qtxt(a) + ')' : qtxt(a)}`, tex: `${v} ${REL[rel2]} ${qtex(r)}`, text: `${v} ${rel2} ${qtxt(r)}` });
      const iv = rel2 === '<' ? `\\left]-\\infty;\\, ${qtex(r)}\\right[` : rel2 === '≤' ? `\\left]-\\infty;\\, ${qtex(r)}\\right]` : rel2 === '>' ? `\\left]${qtex(r)};\\, \\infty\\right[` : `\\left[${qtex(r)};\\, \\infty\\right[`;
      steps.push({ title: 'Lösungsmenge', tex: `\\mathbb{L} = ${iv}`, text: `L = ${iv.replace(/\\left|\\right|\\,/g, '').replace(/\\infty/g, '∞').replace(/-/g, '−')}` });
      return { kind: 'cas', op: 'ineq', v, steps, tex: `${v} ${REL[rel2]} ${qtex(r)}`, text: `${v} ${rel2} ${qtxt(r)}`, problem: steps[0] };
    }
    // allgemein: Nullstellen + Polstellen, Vorzeichen in jedem Bereich prüfen
    steps.push({ title: 'Alles auf eine Seite', tex: `${tex(f)} ${REL[rel]} 0`, text: `${txt(f)} ${rel} 0` });
    const rs = roots(f, v) || [];
    const ps = poles(f, v);
    const crit = [...rs.map(r => ({ ...r, pole: false })), ...ps.map(r => ({ ...r, pole: true }))].sort((a, b) => a.x - b.x);
    const show = (r) => r.node ? txt(r.node) : '≈ ' + approxStr(r.x);
    const showT = (r) => r.node ? tex(r.node) : approxStr(r.x).replace('−', '-');
    if (rs.length) steps.push({ title: 'Nullstellen', note: rs.map(r => `${v} = ${show(r)}`).join(',  ') + (ps.length ? `;  Polstellen: ${ps.map(show).join(', ')}` : ''), tex: rs.map((r, i) => `${v}_{${i + 1}} = ${showT(r)}`).join(',\\; '), text: rs.map((r, i) => `${v}${i + 1} = ${show(r)}`).join(', ') });
    const g = fnum(f, v);
    const xs = crit.map(c => c.x);
    const mids = [];
    if (!xs.length) mids.push(0);
    else { mids.push(xs[0] - 1); for (let i = 0; i + 1 < xs.length; i++) mids.push((xs[i] + xs[i + 1]) / 2); mids.push(xs[xs.length - 1] + 1); }
    const sign = mids.map(m => g(m));
    const table = mids.map((m, i) => `${i === 0 ? '−∞' : show(crit[i - 1])} … ${i === xs.length ? '∞' : show(crit[i])}: ${sign[i] > 0 ? '+' : sign[i] < 0 ? '−' : '0'}`);
    steps.push({ title: 'Vorzeichen prüfen', note: 'In jedem Bereich eine Zahl einsetzen: ' + table.join(';  ') });
    // Intervalle zusammensetzen
    const ivs = [];
    const same0 = (a, b) => a && b && Math.abs(a.x - b.x) < 1e-12;
    for (let i = 0; i < mids.length; i++) {
      if (!holds(sign[i]) || !Number.isFinite(sign[i])) continue;
      const lo = i === 0 ? null : crit[i - 1], hi = i === xs.length ? null : crit[i];
      const last = ivs[ivs.length - 1];
      if (last && same0(last.hi, lo) && lo && !lo.pole && !strict) { last.hi = hi; last.hiIn = hi && !hi.pole && !strict; continue; }
      ivs.push({ lo, hi, loIn: lo && !lo.pole && !strict, hiIn: hi && !hi.pole && !strict });
    }
    // einzelne Punkte (≤/≥ an Berührstellen)
    const same = (a, b) => a && b && Math.abs(a.x - b.x) < 1e-12;
    if (!strict) for (const r of rs) if (!ivs.some(iv => same(iv.lo, r) || same(iv.hi, r))) ivs.push({ lo: r, hi: r, loIn: true, hiIn: true, point: true });
    ivs.sort((a, b) => (a.lo ? a.lo.x : -Infinity) - (b.lo ? b.lo.x : -Infinity));
    const ivT = (iv) => iv.point ? `\\{${showT(iv.lo)}\\}` : `\\left${iv.loIn ? '[' : ']'}${iv.lo ? showT(iv.lo) : '-\\infty'};\\, ${iv.hi ? showT(iv.hi) : '\\infty'}\\right${iv.hiIn ? ']' : '['}`;
    const ivX = (iv) => iv.point ? `{${show(iv.lo)}}` : `${iv.loIn ? '[' : ']'}${iv.lo ? show(iv.lo) : '−∞'}; ${iv.hi ? show(iv.hi) : '∞'}${iv.hiIn ? ']' : '['}`;
    const T = ivs.length ? ivs.map(ivT).join(' \\cup ') : '\\{\\}';
    const X = ivs.length ? ivs.map(ivX).join(' ∪ ') : '{ }';
    steps.push({ title: 'Lösungsmenge', tex: `\\mathbb{L} = ${T}`, text: `L = ${X}` });
    return { kind: 'cas', op: 'ineq', v, steps, ivs, tex: `\\mathbb{L} = ${T}`, text: `L = ${X}`, problem: steps[0] };
  }

  /* ---------------------------------------------------------- Kurvendiskussion */
  function curve(f, v = 'x', name = 'f') {
    const f0 = ordered(S2(f));
    const F = fnum(f0, v);
    // periodisch (sin, cos …)? dann nur eine Periode untersuchen
    const isPoly = !!polyQ(f0, v);
    let period = null;
    if (!isPoly) for (const p of [2 * Math.PI, Math.PI]) { if ([0.3, 1.1, 2.2, -0.7, 3.9].every(x => { const a = F(x), b = F(x + p); return Number.isFinite(a) && Math.abs(a - b) < 1e-9 * Math.max(1, Math.abs(a)); })) period = p; }
    const range = isPoly ? [-60, 60] : period ? [-1e-9, period - 1e-6] : [-20, 20];
    const steps = [{ title: 'Funktion', tex: `${name}(${v}) = ${tex(f0)}`, text: `${name}(${v}) = ${txt(f0)}` }];
    let d1 = null, d2 = null;
    try { d1 = nice(d(f0, v)); d2 = nice(d(d1, v)); } catch (e) { /* nicht ableitbar */ }
    if (d1) steps.push({ title: 'Ableitungen', tex: `${name}'(${v}) = ${tex(d1)},\\quad ${name}''(${v}) = ${tex(d2)}`, text: `${name}′(${v}) = ${txt(d1)};  ${name}″(${v}) = ${txt(d2)}` });
    // Definitionsbereich
    const ps = poles(f0, v);
    let domNote = ps.length ? `ℝ ohne { ${ps.map(p => p.node ? txt(p.node) : approxStr(p.x)).join('; ')} }` : 'ℝ';
    const nanAt = []; for (let i = 0; i <= 400; i++) { const x = -20 + i / 10; if (Number.isNaN(F(x))) nanAt.push(x); }
    if (nanAt.length) domNote = ps.length ? domNote + ' (und eingeschränkt)' : `eingeschränkt (z. B. nicht definiert bei ${v} = ${approxStr(nanAt[0])})`;
    steps.push({ title: 'Definitionsbereich', note: `D = ${domNote}` });
    // Symmetrie
    const sx = [0.31, 1.7, 2.9, 0.77, 4.3];
    const even = sx.every(x => { const a = F(x), b = F(-x); return Number.isFinite(a) && Math.abs(a - b) < 1e-9 * Math.max(1, Math.abs(a)); });
    const odd = !even && sx.every(x => { const a = F(x), b = F(-x); return Number.isFinite(a) && Math.abs(a + b) < 1e-9 * Math.max(1, Math.abs(a)); });
    steps.push({ title: 'Symmetrie', note: even ? `${name}(−${v}) = ${name}(${v}) ⇒ achsensymmetrisch zur y-Achse` : odd ? `${name}(−${v}) = −${name}(${v}) ⇒ punktsymmetrisch zum Ursprung` : 'keine einfache Symmetrie' });
    // Achsenschnittpunkte
    const pts = [];
    const y0 = Number.isFinite(F(0)) ? at(f0, v, 0) : null;
    const zs = (roots(f0, v, range) || []).slice(0, 12);
    if (period) steps.splice(steps.length - 1, 0, { title: 'Periode', note: `${name}(${v} + ${period > 4 ? '2π' : 'π'}) = ${name}(${v}) – untersucht wird eine Periode ${period > 4 ? '[0; 2π[' : '[0; π['}` });
    const show = (r) => r.node ? txt(r.node) : approxStr(r.x);
    const showT = (r) => r.node ? tex(r.node) : approxStr(r.x).replace('−', '-');
    if (zs.length) steps.push({ title: 'Nullstellen', note: `${name}(${v}) = 0 lösen`, tex: zs.map((r, i) => `${v}_{${i + 1}} = ${showT(r)}${r.m > 1 ? `\\;(${r.m}\\text{-fach})` : ''}`).join(',\\; '), text: zs.map((r, i) => `${v}${i + 1} = ${show(r)}${r.m > 1 ? ' (' + r.m + '-fach)' : ''}`).join(', ') });
    else steps.push({ title: 'Nullstellen', note: `keine (im Bereich ${approxStr(range[0])} … ${approxStr(range[1])})` });
    for (const r of zs) pts.push({ x: r.x, y: 0, kind: 'N', label: `N(${show(r)} | 0)` });
    if (y0) { steps.push({ title: 'y-Achsenabschnitt', note: `${name}(0) = ${txt(y0)}`, tex: `S_y(0 \\mid ${tex(y0)})`, text: `Sy(0 | ${txt(y0)})` }); pts.push({ x: 0, y: num(y0), kind: 'S', label: `Sy(0 | ${txt(y0)})` }); }
    // Extrempunkte
    const ext = [];
    if (d1) {
      const r1 = (roots(d1, v, range) || []).slice(0, 12);
      const D1 = fnum(d1, v), D2 = fnum(d2, v);
      for (const r of r1) {
        if (ps.some(p => Math.abs(p.x - r.x) < 1e-9)) continue;
        const h = 1e-4 * Math.max(1, Math.abs(r.x));
        const l = D1(r.x - h), rr = D1(r.x + h);
        let kind = null;
        const s2 = D2(r.x);
        if (Math.abs(s2) > 1e-9) kind = s2 < 0 ? 'H' : 'T';
        else if (l > 0 && rr < 0) kind = 'H'; else if (l < 0 && rr > 0) kind = 'T'; else kind = 'S';
        const yN = r.node ? at(f0, v, r.node) : null, y = F(r.x);
        const yTxt = yN && size(yN) < 40 ? txt(yN) : approxStr(y);
        ext.push({ x: r.x, y, kind, label: `${kind === 'H' ? 'Hochpunkt' : kind === 'T' ? 'Tiefpunkt' : 'Sattelpunkt'} (${show(r)} | ${yTxt})`, xt: show(r), yt: yTxt, xT: showT(r), yT: yN && size(yN) < 40 ? tex(yN) : approxStr(y).replace('−', '-'), f2: s2 });
      }
      steps.push(ext.length ? { title: 'Extrempunkte', note: `${name}′(${v}) = 0 lösen, mit ${name}″ prüfen: ` + ext.map(e => `${name}″(${e.xt}) ${e.f2 < 0 ? '< 0' : e.f2 > 0 ? '> 0' : '= 0'} ⇒ ${e.label}`).join(';  '), tex: ext.map(e => `${e.kind === 'S' ? 'S' : e.kind}(${e.xT} \\mid ${e.yT})`).join(',\\; '), text: ext.map(e => e.label).join(', ') } : { title: 'Extrempunkte', note: `${name}′(${v}) = 0 hat keine Lösung – keine Extrempunkte` });
      for (const e of ext) pts.push({ x: e.x, y: e.y, kind: e.kind, label: e.label });
      // Wendepunkte
      const wp = [];
      const r2raw = roots(d2, v, range);
      const r2 = (r2raw || []).slice(0, 12);
      for (const r of r2) {
        if (ps.some(p => Math.abs(p.x - r.x) < 1e-9)) continue;
        const h = 1e-3 * Math.max(1, Math.abs(r.x));
        if (D2(r.x - h) * D2(r.x + h) >= 0) continue;   // kein Vorzeichenwechsel
        const yN = r.node ? at(f0, v, r.node) : null, y = F(r.x);
        const yTxt = yN && size(yN) < 40 ? txt(yN) : approxStr(y);
        wp.push({ x: r.x, y, label: `Wendepunkt (${show(r)} | ${yTxt})`, xT: showT(r), yT: yN && size(yN) < 40 ? tex(yN) : approxStr(y).replace('−', '-') });
      }
      if (r2raw === null) steps.push({ title: 'Wendepunkte', note: `${name}″ ist konstant 0 – keine Wendepunkte` });
      else steps.push(wp.length ? { title: 'Wendepunkte', note: `${name}″(${v}) = 0 mit Vorzeichenwechsel`, tex: wp.map(w => `W(${w.xT} \\mid ${w.yT})`).join(',\\; '), text: wp.map(w => w.label).join(', ') } : { title: 'Wendepunkte', note: 'keine' });
      for (const w of wp) pts.push({ x: w.x, y: w.y, kind: 'W', label: w.label });
    }
    // Verhalten im Unendlichen
    const P = polyQ(f0, v);
    let inf;
    if (P && deg(P) >= 1) {
      const lead = qv(P[P.length - 1]), n = deg(P);
      const pInf = lead > 0 ? '+∞' : '−∞', mInf = (n % 2 === 0) === (lead > 0) ? '+∞' : '−∞';
      inf = `${v} → +∞: ${name}(${v}) → ${pInf};  ${v} → −∞: ${name}(${v}) → ${mInf}`;
    } else {
      // numerisch: Werte weit draussen vergleichen (±∞ zählt als Ergebnis, NaN = nicht definiert)
      const lim = (x) => {
        const vals = [x, x * 10, x * 100].map(F);
        const [a, b, c] = vals;
        if (vals.every(y => y === Infinity || y > 1e8)) return '+∞';
        if (vals.every(y => y === -Infinity || y < -1e8)) return '−∞';
        if (vals.some(Number.isNaN)) return 'nicht definiert';
        if (Math.abs(b) > 1e4 && Math.abs(c) > Math.abs(b) * 2 && Math.sign(b) === Math.sign(c)) return c > 0 ? '+∞' : '−∞';
        if (Math.abs(b - c) <= Math.abs(a - b) * 0.5 + 1e-12 && Math.abs(b - c) < 1e-2 * Math.max(1, Math.abs(c))) return Math.abs(c) < 1e-3 ? '0' : approxStr(+c.toPrecision(4));
        if (period || Math.abs(b - c) > 1e-3) return 'kein Grenzwert (schwankt)';
        return 'unbestimmt';
      };
      inf = `${v} → +∞: ${name}(${v}) → ${lim(100)};  ${v} → −∞: ${name}(${v}) → ${lim(-100)}`;
    }
    steps.push({ title: 'Verhalten im Unendlichen', note: inf });
    return { kind: 'cas', op: 'curve', v, name, steps, f: f0, d1, d2, pts, poles: ps.map(p => p.x), tex: `${name}(${v}) = ${tex(f0)}`, text: steps.slice(1).map(s => s.title + ': ' + (s.text || s.note || '')).join(' · '), problem: steps[0] };
  }
  /* Punkte für den Graphen: Fenster so, dass alle besonderen Punkte drin sind; Linien an Polstellen trennen */
  function plot(fns, v = 'x', marks = [], view = null) {
    const xsOf = marks.map(m => m.x).filter(Number.isFinite);
    let x0, x1;
    if (view) [x0, x1] = view;
    else if (xsOf.length) { const a = Math.min(...xsOf, 0), b = Math.max(...xsOf, 0), m = Math.max(2, (b - a) * 0.35); x0 = a - m; x1 = b + m; }
    else { x0 = -6; x1 = 6; }
    const n = 480;
    const series = fns.map(f => {
      const g = fnum(f, v), pts = [];
      for (let i = 0; i <= n; i++) { const x = x0 + (x1 - x0) * i / n; pts.push([x, g(x)]); }
      return pts;
    });
    // y-Bereich robust (ohne Ausreisser an Polstellen)
    const ys = series.flat().map(p => p[1]).filter(Number.isFinite).sort((a, b) => a - b);
    let y0 = -5, y1 = 5;
    if (ys.length) { const q = (t) => ys[Math.min(ys.length - 1, Math.max(0, Math.round(t * (ys.length - 1))))]; y0 = q(0.03); y1 = q(0.97); }
    for (const m of marks) if (Number.isFinite(m.y)) { y0 = Math.min(y0, m.y); y1 = Math.max(y1, m.y); }
    y0 = Math.min(y0, 0); y1 = Math.max(y1, 0);
    if (y1 - y0 < 1e-9) { y0 -= 1; y1 += 1; }
    const pad = (y1 - y0) * 0.12; y0 -= pad; y1 += pad;
    return { x0, x1, y0, y1, series };
  }

  /* ---------------------------------------------------------- Taylorpolynom */
  function taylor(f, v = 'x', x0 = 0, order = 4) {
    const f0 = S2(f);
    const steps = [{ title: 'Aufgabe', note: `Taylorpolynom ${order}. Grades um ${v}₀ = ${approxStr(x0)}`, tex: `f(${v}) = ${tex(f0)}`, text: `f(${v}) = ${txt(f0)}` }];
    let g = f0, fact = 1;
    const terms = [];
    const X0 = N(x0);
    const notes = [];
    for (let k = 0; k <= order; k++) {
      if (k) { g = nice(d(g, v)); fact *= k; }
      const c = at(g, v, X0);
      notes.push(`f${prime(k)}(${approxStr(x0)}) = ${txt(c)}`);
      if (isN(c, 0)) continue;
      const pw = x0 === 0 ? (k === 0 ? N(1) : k === 1 ? V(v) : { k: '^', a: V(v), b: N(k) }) : (k === 0 ? N(1) : { k: '^', a: { k: '+', a: [V(v), N(-x0)] }, b: N(k) });
      terms.push(S2({ k: '*', a: [{ k: '/', a: c, b: N(fact) }, pw] }));
    }
    steps.push({ title: 'Ableitungen an der Stelle ' + approxStr(x0), note: notes.join(';  ') });
    const T = terms.length ? (terms.length === 1 ? terms[0] : { k: '+', a: terms }) : N(0);
    steps.push({ title: 'Einsetzen', note: 'T(x) = Σ f⁽ᵏ⁾(x₀)/k! · (x − x₀)ᵏ', tex: `T_{${order}}(${v}) = ${tex(T)}`, text: `T${order}(${v}) = ${txt(T)}` });
    return { kind: 'cas', op: 'taylor', v, steps, result: T, tex: `T_{${order}}(${v}) = ${tex(T)}`, text: `T${order}(${v}) = ${txt(T)}`, problem: steps[0] };
  }

  /* ---------------------------------------------------------- Zahlen: Primfaktoren, ggT, kgV */
  function pf(n) {
    n = Math.abs(Math.round(n));
    const out = [];
    for (let p = 2; p * p <= n && p < 1e7; p += p === 2 ? 1 : 2) { let e = 0; while (n % p === 0) { n /= p; e++; } if (e) out.push([p, e]); }
    if (n > 1) out.push([n, 1]);
    return out;
  }
  const SUP = (s) => String(s).replace(/\d/g, c => '⁰¹²³⁴⁵⁶⁷⁸⁹'[c]);
  const pfTxt = (f) => f.map(([p, e]) => p + (e > 1 ? SUP(e) : '')).join(' · ');
  const pfTex = (f) => f.map(([p, e]) => p + (e > 1 ? `^{${e}}` : '')).join(' \\cdot ');
  function primes(n) {
    if (!Number.isSafeInteger(n) || Math.abs(n) < 2) throw Err('Primfaktoren gibt es nur für ganze Zahlen ab 2');
    const steps = [{ title: 'Aufgabe', note: `${n} in Primfaktoren zerlegen`, tex: String(n), text: String(n) }];
    const f = pf(n);
    let m = Math.abs(n);
    const div = [];
    for (const [p, e] of f) for (let i = 0; i < e; i++) { div.push(`${m} : ${p} = ${m / p}`); m /= p; }
    steps.push({ title: 'Fortgesetzt teilen', note: div.join(';  ') });
    const nd = f.reduce((s, [, e]) => s * (e + 1), 1);
    const isP = f.length === 1 && f[0][1] === 1;
    steps.push({ title: isP ? 'Primzahl' : 'Primfaktorzerlegung', note: isP ? `${n} ist eine Primzahl.` : `${nd} Teiler`, tex: `${n} = ${n < 0 ? '-' : ''}${pfTex(f)}`, text: `${n} = ${n < 0 ? '−' : ''}${pfTxt(f)}` });
    return { kind: 'cas', op: 'primes', steps, factors: f, prime: isP, tex: `${n} = ${pfTex(f)}`, text: `${n} = ${pfTxt(f)}`, problem: steps[0] };
  }
  function gcdLcm(nums, which = 'ggT') {
    nums = nums.map(x => Math.abs(Math.round(x))).filter(x => x > 0);
    if (nums.length < 2) throw Err('Mindestens zwei ganze Zahlen angeben, z. B. ggT(12; 18)');
    const steps = [{ title: 'Aufgabe', tex: `\\text{${which}}(${nums.join(';\\, ')})`, text: `${which}(${nums.join('; ')})` }];
    const fs = nums.map(pf);
    steps.push({ title: 'Primfaktoren', note: nums.map((x, i) => `${x} = ${pfTxt(fs[i]) || '1'}`).join(';  ') });
    const ps = [...new Set(fs.flat().map(([p]) => p))].sort((a, b) => a - b);
    const pick = ps.map(p => [p, (which === 'ggT' ? Math.min : Math.max)(...fs.map(f => (f.find(q => q[0] === p) || [p, 0])[1]))]).filter(([, e]) => e > 0);
    const val = pick.reduce((s, [p, e]) => s * Math.pow(p, e), 1);
    steps.push({ title: which === 'ggT' ? 'Gemeinsame Faktoren, kleinste Hochzahl' : 'Alle Faktoren, grösste Hochzahl', tex: `= ${pfTex(pick) || '1'} = ${val}`, text: `= ${pfTxt(pick) || '1'} = ${val}` });
    return { kind: 'cas', op: which, steps, value: val, tex: `\\text{${which}} = ${val}`, text: `${which} = ${val}`, problem: steps[0] };
  }

  /* ---------------------------------------------------------- Text der Schritte (zum Einfügen/Kopieren) */
  function lines(res, opts = {}) {
    if (!res || !res.steps) return [];
    const fmt = (s) => opts.ascii && typeof MathSteps !== 'undefined' ? MathSteps.keyb(s) : s;
    const head = res.problem ? (res.problem.text || '') : '';
    if (!opts.steps) return [fmt(head + (res.text ? '   ⇒   ' + res.text : res.error ? '   → ' + res.error : ''))];
    const out = [];
    for (const s of res.steps) out.push(fmt((s.text || '') + (s.title && s.title !== 'Aufgabe' ? `${s.text ? '      ' : ''}(${s.title}${s.note ? ': ' + s.note : ''})` : '')));
    if (res.text) out.push(fmt('⇒ ' + res.text));
    else if (res.error) out.push('→ ' + res.error);
    return out;
  }

  /* ---------------------------------------------------------- Bequeme Einstiege mit dem Vorlagenbaum (Fotomath) */
  const P = (tree) => MathInk.symParse(tree || []);
  return {
    diff, integrate, factor, expandSteps, system, inequality, curve, plot, taylor, primes, gcdLcm, roots, lines,
    // intern, für Tests
    d, nice, polyQ, polyNode, subst, at, S2, toMatrix, pf, parse: P,
  };
})();

if (typeof module !== 'undefined') module.exports = { MathCAS };
