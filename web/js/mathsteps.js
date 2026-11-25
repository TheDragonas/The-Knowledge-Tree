'use strict';
/* Rechenweg für Fotomath (seit 1.38, wie die App Photomath): aus der erkannten Rechnung (Vorlagenbaum des Taschenrechners)
 * Schritt für Schritt zum Ergebnis – jede Zeile mit kurzer Erklärung.
 *
 *  - Rechnungen: Klammern zuerst, Potenzen und Wurzeln, Punkt vor Strich, Brüche (gemeinsamer Nenner, Zähler
 *    zusammenfassen, Kürzen, mit dem Kehrwert multiplizieren), Dezimalzahlen; am Schluss andere Formen (gemischte Zahl,
 *    Dezimalzahl, Näherung bei Wurzeln und π).
 *  - Gleichungen mit einer Unbekannten: vereinfachen, Seiten tauschen, Terme mit der Unbekannten nach links, Zahlen
 *    nach rechts, durch den Faktor teilen (Umformungen „| −3“, „| :2“ wie im Unterricht); quadratisch: Ausklammern,
 *    Wurzel ziehen oder Mitternachtsformel mit Diskriminante. Formeln (U = R·I nach I) mit Buchstaben als Faktoren.
 *  - Ausgabe als Text in zwei Schreibweisen: mit mathematischen Zeichen (·, −, ², √, π, ±, ≈) oder nur mit Zeichen
 *    der Tastatur (*, -, ^, sqrt(), pi, +-, ~), und als LaTeX für die schöne Darstellung.
 * Rechnet exakt mit Brüchen (Ganzzahlen bis 10^15); was nicht exakt geht, wird am Ende genähert. Ohne DOM testbar. */
const MathSteps = (() => {
  const gcd = (a, b) => { a = Math.abs(a); b = Math.abs(b); while (b) [a, b] = [b, a % b]; return a || 1; };
  const lcm = (a, b) => Math.abs(a / gcd(a, b) * b);
  const BIG = 1e15;
  const Q = (p, q = 1, dec = false) => {
    if (q < 0) { p = -p; q = -q; }
    if (!Number.isFinite(p) || !Number.isFinite(q) || q === 0) throw new Error('Division durch 0 ist nicht definiert');
    if (!Number.isInteger(p) || !Number.isInteger(q) || Math.abs(p) > BIG || q > BIG) return { k: 'num', p: p / q, q: 1, dec: true, approx: !Number.isInteger(p / q) };
    const g = gcd(p, q);
    return { k: 'num', p: p / g, q: q / g, dec };
  };
  const isNum = (n) => n.k === 'num';
  const isFracLit = (n) => n.k === 'frac' && isInt(n.a) && isInt(n.b);
  const isInt = (n) => n.k === 'num' && n.q === 1 && Number.isInteger(n.p) && !n.approx;
  const negNum = (n) => n.k === 'neg' && isNum(n.a);
  const atom = (n) => isNum(n) || isFracLit(n) || (n.k === 'neg' && atom(n.a));
  const val = (n) => isNum(n) ? n : n.k === 'neg' ? (() => { const v = val(n.a); return { ...v, p: -v.p }; })() : Q(n.a.p * 1, n.b.p);   // Bruch-Literal
  const anyDec = (n) => n && (n.dec || (typeof n === 'object' && Object.values(n).some(x => (x && typeof x === 'object') ? Array.isArray(x) ? x.some(y => anyDec(y.t || y)) : anyDec(x) : false)));

  /* ---------------------------------------------------------- Vorlagenbaum → Rechenbaum (Bruchstrich ≠ geteilt) */
  function parse(T) {
    T = T || [];
    let i = 0;
    const starts = (t) => t != null && (typeof t === 'object' ? ['frac', 'sqrt'].includes(t.t) : /^[0-9.]$|^[A-Za-zπ]$|^\($/.test(t));
    const sum = () => {
      const a = [{ s: 1, t: term() }];
      while (T[i] === '+' || T[i] === '−' || T[i] === '-') { const s = T[i++] === '+' ? 1 : -1; a.push({ s, t: term() }); }
      return a.length === 1 && a[0].s === 1 ? a[0].t : { k: 'add', a };
    };
    const term = () => {
      let n = unary();
      for (;;) {
        const t = T[i];
        if (t === '×' || t === '·' || t === '*') { i++; n = mulOf(n, unary()); }
        else if (t === '÷' || t === ':' || t === '/') { i++; n = { k: 'div', a: n, b: unary() }; }
        else if (starts(t)) n = mulOf(n, post(), true);
        else break;
      }
      return n;
    };
    const mulOf = (a, b, implicit) => a.k === 'mul' && !a.closed ? { k: 'mul', a: [...a.a, b], imp: [...a.imp, !!implicit] } : { k: 'mul', a: [a, b], imp: [false, !!implicit] };
    const unary = () => { if (T[i] === '−' || T[i] === '-') { i++; return { k: 'neg', a: unary() }; } if (T[i] === '+') { i++; return unary(); } return post(); };
    const post = () => { let a = prim(); while (T[i] && typeof T[i] === 'object' && T[i].t === 'pow') a = { k: 'pow', a, b: parse(T[i++].a) }; return a; };
    const prim = () => {
      const t = T[i];
      if (t == null) throw new Error('unvollständig');
      if (typeof t === 'object') {
        i++;
        if (t.t === 'frac') return { k: 'frac', a: parse(t.a), b: parse(t.b) };
        if (t.t === 'sqrt') return { k: 'sqrt', a: parse(t.a) };
        throw new Error('nicht unterstützt');
      }
      if (/^[0-9.]$/.test(t)) {
        let s = '';
        while (/^[0-9.]$/.test(T[i] || '')) s += T[i++];
        if (s.split('.').length > 2) throw new Error('Zahl ' + s);
        const [w, f = ''] = s.split('.');
        return Q(+((w || '0') + f), Math.pow(10, f.length), f.length > 0);
      }
      if (t === '(') { i++; const a = sum(); if (T[i] === ')') i++; return { k: 'par', a }; }
      if (t === 'π') { i++; return { k: 'pi' }; }
      if (/^[A-Za-z]$/.test(t)) { i++; return { k: 'var', n: t }; }
      throw new Error('Zeichen ' + t);
    };
    if (!T.length) throw new Error('leer');
    const r = sum();
    if (i < T.length) throw new Error('nicht verstanden');
    return r;
  }

  /* ---------------------------------------------------------- Darstellung: Text (Zeichen 'u' / Tastatur 'a') und LaTeX */
  const SUP = { 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹', '-': '⁻' };
  function numText(n, m) {
    if (n.dec || n.q === 1) {
      const v = n.p / n.q;
      let s = String(+v.toPrecision(12));
      if (/e/.test(s)) s = v.toPrecision(6);
      return v < 0 ? (m === 'a' ? '-' : '−') + s.slice(1) : s;
    }
    const s = `${Math.abs(n.p)}/${n.q}`;
    return n.p < 0 ? (m === 'a' ? '-' : '−') + s : s;
  }
  // Vorrang: 0 Summe, 1 Produkt, 2 Potenzbasis
  function text(n, m = 'u', ctx = 0) {
    const neg = m === 'a' ? '-' : '−', dot = m === 'a' ? '*' : '·';
    const par = (s, need) => need ? `(${s})` : s;
    switch (n.k) {
      case 'num': { const s = numText(n, m); return par(s, (ctx >= 2 && (n.p < 0 || n.q !== 1 && !n.dec)) || (ctx >= 1 && n.q !== 1 && !n.dec && ctx > 1)); }
      case 'var': return n.n;
      case 'pi': return m === 'a' ? 'pi' : 'π';
      case 'par': return `(${text(n.a, m, 0)})`;
      case 'add': return par(n.a.map((x, i) => {
        let t = x.t, s = x.s;
        if (negNum(t)) { t = t.a; s = -s; } else if (isNum(t) && t.p < 0 && i) { t = { ...t, p: -t.p }; s = -s; }
        const body = text(t, m, 1);
        return i ? (s < 0 ? ` ${neg} ` : ' + ') + body : (s < 0 ? neg : '') + body;
      }).join(''), ctx >= 1);
      case 'mul': return par(n.a.map((f, i) => {
        const s = text(f, m, 1.5);
        if (!i) return s;
        const implicit = n.imp && n.imp[i] && (f.k === 'var' || f.k === 'pi' || f.k === 'par' || f.k === 'sqrt') && m !== 'a';
        return (implicit ? '' : dot) + s;
      }).join(''), ctx >= 2);
      case 'div': return par(`${text(n.a, m, 1)} ${m === 'a' ? '/' : ':'} ${text(n.b, m, 1.5)}`, ctx >= 1.5);
      case 'frac': { const a = text(n.a, m, 2), b = text(n.b, m, 2); return par(`${a}/${b}`, ctx >= 1.5); }
      case 'pow': {
        const b = text(n.a, m, 2);
        if (m !== 'a' && isInt(n.b) && n.b.p >= 0 && n.b.p < 100) return b + String(n.b.p).split('').map(d => SUP[d]).join('');
        const e = text(n.b, m, 2);
        return `${b}^${/^[\w.]+$/.test(e) ? e : '(' + e + ')'}`;
      }
      case 'sqrt': { const a = text(n.a, m, 0); return m === 'a' ? `sqrt(${a})` : (/^[\w.]+$/.test(a) ? '√' + a : `√(${a})`); }
      case 'neg': return par(neg + text(n.a, m, 1.5), ctx >= 1);
    }
    return '?';
  }
  function tex(n, ctx = 0) {
    const par = (s, need) => need ? `\\left(${s}\\right)` : s;
    switch (n.k) {
      case 'num': {
        if (n.dec || n.q === 1) { const s = numText(n, 'a'); return par(s, ctx >= 2 && n.p < 0); }
        return par(`${n.p < 0 ? '-' : ''}\\frac{${Math.abs(n.p)}}{${n.q}}`, ctx >= 2 && n.p < 0);
      }
      case 'var': return n.n;
      case 'pi': return '\\pi ';
      case 'par': return `\\left(${tex(n.a)}\\right)`;
      case 'add': return par(n.a.map((x, i) => {
        let t = x.t, s = x.s;
        if (negNum(t)) { t = t.a; s = -s; } else if (isNum(t) && t.p < 0 && i) { t = { ...t, p: -t.p }; s = -s; }
        return (i ? (s < 0 ? ' - ' : ' + ') : s < 0 ? '-' : '') + tex(t, 1);
      }).join(''), ctx >= 1);
      case 'mul': return par(n.a.map((f, i) => (i ? (n.imp && n.imp[i] && ['var', 'pi', 'par', 'sqrt'].includes(f.k) ? '' : ' \\cdot ') : '') + tex(f, 1.5)).join(''), ctx >= 2);
      case 'div': return par(`${tex(n.a, 1)} : ${tex(n.b, 1.5)}`, ctx >= 1.5);
      case 'frac': return `\\frac{${tex(n.a)}}{${tex(n.b)}}`;
      case 'pow': return `${tex(n.a, 2)}^{${tex(n.b)}}`;
      case 'sqrt': return `\\sqrt{${tex(n.a)}}`;
      case 'neg': return par('-' + tex(n.a, 1.5), ctx >= 1);
    }
    return '';
  }
  /* Rationalzahl als Bruch (nicht als Dezimalzahl) darstellen */
  const asNode = (v, dec) => {
    if (dec || v.dec) return { ...v, dec: true };
    if (v.q === 1) return v;
    const f = { k: 'frac', a: Q(Math.abs(v.p)), b: Q(v.q) };
    return v.p < 0 ? { k: 'neg', a: f } : f;
  };
  const decStr = (v) => String(+(v.p / v.q).toPrecision(10));
  const approxStr = (x) => String(+x.toPrecision(10));

  /* ---------------------------------------------------------- ein Rechenschritt */
  function evalNum(n) {
    switch (n.k) {
      case 'num': return n.p / n.q;
      case 'pi': return Math.PI;
      case 'par': return evalNum(n.a);
      case 'add': return n.a.reduce((s, x) => s + x.s * evalNum(x.t), 0);
      case 'mul': return n.a.reduce((s, x) => s * evalNum(x), 1);
      case 'div': case 'frac': return evalNum(n.a) / evalNum(n.b);
      case 'pow': return Math.pow(evalNum(n.a), evalNum(n.b));
      case 'sqrt': return Math.sqrt(evalNum(n.a));
      case 'neg': return -evalNum(n.a);
      case 'var': throw new Error('Variable');
    }
    return NaN;
  }
  const perfectRoot = (x, k = 2) => { if (x < 0 || !Number.isInteger(x)) return null; const r = Math.round(Math.pow(x, 1 / k)); return Math.pow(r, k) === x ? r : null; };
  /* Wurzel teilweise ziehen: √12 = 2√3 */
  const surd = (x) => { let c = 1, m = x; for (let f = 2; f * f <= m; f++) while (m % (f * f) === 0) { m /= f * f; c *= f; } return [c, m]; };

  /* reduce(n, dec, inSum) → { n, title, note } für genau eine Umformung, oder null */
  function reduce(n, dec, ctx = '') {
    const R = (nn, title, note) => ({ n: nn, title, note });
    switch (n.k) {
      case 'num': case 'var': case 'pi': return null;
      case 'par': {
        if (atom(n.a)) return R(n.a, null);   // Klammer um eine Zahl: still weglassen
        const r = reduce(n.a, dec, 'par');
        return r && R({ k: 'par', a: r.n }, r.title && (r.title.startsWith('In der Klammer') ? r.title : 'In der Klammer: ' + r.title[0].toLowerCase() + r.title.slice(1)), r.note);
      }
      case 'neg': {
        if (isNum(n.a)) return R(Q(-n.a.p, n.a.q, n.a.dec), null);
        if (n.a.k === 'neg') return R(n.a.a, null);
        const r = reduce(n.a, dec, ctx); return r && R({ k: 'neg', a: r.n }, r.title, r.note);
      }
      case 'pow': {
        for (const key of ['a', 'b']) if (!atom(n[key])) { const r = reduce(n[key], dec, 'pow'); if (r) return R({ ...n, [key]: r.n }, r.title, r.note); return null; }
        const b = val(n.a), e = val(n.b);
        if (e.q !== 1) return null;
        const k = e.p;
        if (Math.abs(k) > 64) return null;
        const pw = (x) => Math.pow(x, Math.abs(k));
        let v = k >= 0 ? Q(pw(b.p), pw(b.q), b.dec) : Q(pw(b.q), pw(b.p), b.dec);
        if (v.approx) return null;
        const bt = text(n.a, 'u', 2);
        const expl = k === 0 ? 'Hoch 0 ergibt 1' : k < 0 ? `negative Hochzahl = Kehrwert: ${bt}${text(n.b, 'u', 2) === '-1' ? '⁻¹' : '^' + text(n.b, 'u', 2)}` : k <= 4 && k > 1 ? Array(k).fill(bt).join(' · ') + ' = ' + text(asNode(v, dec)) : null;
        return R(asNode(v, dec), 'Potenz berechnen' + (ctx === 'sum' || ctx === 'prod' ? ' (Potenz vor Punkt und Strich)' : ''), expl);
      }
      case 'sqrt': {
        if (!atom(n.a)) { const r = reduce(n.a, dec, 'root'); return r && R({ k: 'sqrt', a: r.n }, r.title && 'Unter der Wurzel: ' + r.title[0].toLowerCase() + r.title.slice(1), r.note); }
        const v = val(n.a);
        if (v.p < 0) throw new Error('Wurzel aus einer negativen Zahl ist (reell) nicht definiert');
        const a = perfectRoot(v.p), b = perfectRoot(v.q);
        if (a !== null && b !== null) return R(asNode(Q(a, b, v.dec), dec), 'Wurzel ziehen', `${text(n, 'u')} = ${text(asNode(Q(a, b, v.dec), dec))}, denn ${text(asNode(Q(a, b, v.dec), dec), 'u', 2)}² = ${text(asNode(v, dec))}`);
        if (v.q === 1 && !v.dec) {
          const [c, m] = surd(v.p);
          if (c > 1) { const nn = { k: 'mul', a: [Q(c), { k: 'sqrt', a: Q(m) }], imp: [false, true], closed: true }; return R(nn, 'Wurzel teilweise ziehen', `${v.p} = ${c * c} · ${m}, also √${v.p} = √${c * c} · √${m} = ${c}√${m}`); }
        }
        return null;
      }
      case 'frac': {
        for (const key of ['a', 'b']) if (!atom(n[key])) { const r = reduce(n[key], dec, 'frac'); if (r) return R({ ...n, [key]: r.n }, r.title && (key === 'a' ? 'Zähler: ' : 'Nenner: ') + r.title[0].toLowerCase() + r.title.slice(1), r.note); return null; }
        const a = val(n.a), b = val(n.b);
        if (b.p === 0) throw new Error('Division durch 0 ist nicht definiert');
        if (isInt(n.a) && isInt(n.b)) {
          const g = gcd(n.a.p, n.b.p);
          if (n.b.p === 1) return R(n.a, 'Durch 1 teilen', null);
          if (g > 1) { const v = Q(n.a.p, n.b.p); return R(asNode(v, false), `Kürzen (durch ${g})`, `${n.a.p}/${n.b.p} = ${n.a.p / g}/${n.b.p / g}`); }
          if (n.b.p < 0) return R(asNode(Q(n.a.p, n.b.p)), 'Vorzeichen in den Zähler', null);
          return null;   // fertiger Bruch
        }
        const v = Q(a.p * b.q, a.q * b.p, a.dec || b.dec);
        return R(asNode(v, dec), 'Bruch ausrechnen', null);
      }
      case 'div': {
        for (const key of ['a', 'b']) if (!atom(n[key])) { const r = reduce(n[key], dec, 'prod'); if (r) return R({ ...n, [key]: r.n }, r.title, r.note); return null; }
        const a = val(n.a), b = val(n.b);
        if (b.p === 0) throw new Error('Division durch 0 ist nicht definiert');
        if (!dec && (b.q !== 1 || a.q !== 1) && !b.dec) {
          // durch einen Bruch teilen = mit dem Kehrwert multiplizieren
          if (b.q !== 1) return R({ k: 'mul', a: [n.a, asNode(Q(b.q, b.p))], imp: [false, false] }, 'Durch einen Bruch teilen = mit dem Kehrwert malnehmen', `Kehrwert von ${text(n.b, 'u', 2)} ist ${text(asNode(Q(b.q, b.p)), 'u', 2)}`);
          return R(asNode(Q(a.p, a.q * b.p)), 'Bruch durch ganze Zahl teilen: Nenner malnehmen', null);
        }
        const v = Q(a.p * b.q, a.q * b.p, a.dec || b.dec);
        const pre = ctx === 'sum' ? 'Punkt vor Strich: ' : '';
        return R(asNode(v, dec), pre + 'Dividieren', `${text(n.a, 'u', 1)} : ${text(n.b, 'u', 1.5)} = ${text(asNode(v, dec))}`);
      }
      case 'mul': {
        for (let i = 0; i < n.a.length; i++) if (!atom(n.a[i])) {
          const r = reduce(n.a[i], dec, 'prod');
          if (r) { const a = n.a.slice(); a[i] = r.n; return R({ ...n, a }, r.title, r.note); }
          return null;   // z.B. Wurzel, π: so stehen lassen
        }
        const vs = n.a.map(val);
        let v = Q(1);
        for (const x of vs) v = Q(v.p * x.p, v.q * x.q, v.dec || x.dec);
        const fr = !dec && vs.some(x => x.q !== 1);
        const pre = ctx === 'sum' ? 'Punkt vor Strich: ' : '';
        if (fr) {
          const zp = vs.map(x => Math.abs(x.p)).join(' · '), np = vs.map(x => x.q).join(' · ');
          return R(asNode(v, dec), pre + 'Brüche malnehmen: Zähler mal Zähler, Nenner mal Nenner', `(${zp}) / (${np}) = ${text(asNode(v, dec))}`);
        }
        return R(asNode(v, dec), pre + 'Multiplizieren', `${n.a.map(x => text(x, 'u', 1.5)).join(' · ')} = ${text(asNode(v, dec))}`);
      }
      case 'add': {
        for (let i = 0; i < n.a.length; i++) if (!atom(n.a[i].t)) {
          const r = reduce(n.a[i].t, dec, 'sum');
          if (r) { const a = n.a.slice(); a[i] = { ...a[i], t: r.n }; return R({ k: 'add', a }, r.title, r.note); }
          return null;
        }
        // Bruch-Literale ungekürzt (sonst wird 2/4 sofort wieder zu 1/2 und der gemeinsame Nenner geht verloren)
        const raw = (t) => isFracLit(t) ? { p: t.a.p, q: t.b.p, dec: false } : t.k === 'neg' ? (() => { const r = raw(t.a); return { ...r, p: -r.p }; })() : val(t);
        const vs = n.a.map(x => { const v = raw(x.t); return { ...v, p: v.p * x.s }; });
        const fr = !dec && vs.some(x => x.q !== 1);
        if (fr) {
          const L = vs.reduce((m, x) => lcm(m, x.q), 1);
          if (vs.some(x => x.q !== L)) {
            // auf den gemeinsamen Nenner bringen (unechte Brüche, nicht gekürzt)
            const a = vs.map(x => ({ s: x.p < 0 ? -1 : 1, t: { k: 'frac', a: Q(Math.abs(x.p) * (L / x.q)), b: Q(L) } }));
            return R({ k: 'add', a }, `Auf den gemeinsamen Nenner ${L} bringen`, `kgV der Nenner ${[...new Set(vs.map(x => x.q))].join(', ')} = ${L}`);
          }
          const z = vs.reduce((s, x) => s + x.p, 0);
          const parts = vs.map((x, i) => (i ? (x.p < 0 ? ' − ' : ' + ') : x.p < 0 ? '−' : '') + Math.abs(x.p)).join('');
          return R({ k: 'frac', a: Q(z), b: Q(L) }, 'Zähler zusammenfassen', `(${parts}) / ${L} = ${z}/${L}`);
        }
        let v = Q(0);
        for (const x of vs) v = Q(v.p * x.q + x.p * v.q, v.q * x.q, v.dec || x.dec);
        const ops = new Set(n.a.slice(1).map(x => x.s));
        return R(asNode(v, dec), ops.size > 1 ? 'Addieren und Subtrahieren (von links nach rechts)' : ops.has(-1) ? 'Subtrahieren' : 'Addieren', null);
      }
    }
    return null;
  }

  /* ---------------------------------------------------------- Rechnung ohne Unbekannte */
  function arith(T) {
    let n = parse(T);
    const dec = anyDec(n);
    const steps = [{ title: 'Aufgabe', n }];
    for (let guard = 0; guard < 60; guard++) {
      let r;
      try { r = reduce(n, dec); } catch (e) { return { kind: 'arith', steps, n, error: e.message, alt: [] }; }
      if (!r) break;
      n = r.n;
      if (r.title) steps.push({ title: r.title, note: r.note, n });
      else steps[steps.length - 1].n = n;   // stille Umformung (Klammer um Zahl, doppeltes Minus)
    }
    const out = { kind: 'arith', steps, n };
    // fertig? sonst nähern (Wurzeln, π)
    if (atom(n)) {
      const v = val(n);
      out.value = v;
      out.alt = [];
      if (!dec && v.q !== 1) {
        if (Math.abs(v.p) > v.q) { const w = Math.trunc(v.p / v.q), r = Math.abs(v.p % v.q); out.alt.push({ label: 'Gemischte Zahl', u: `${w < 0 ? '−' : ''}${Math.abs(w)} ${r}/${v.q}`, a: `${w} ${r}/${v.q}` }); }
        out.alt.push({ label: 'Dezimalzahl', u: decStr(v).replace('-', '−'), a: decStr(v), approx: !Number.isInteger(v.p * 1e9 / v.q) });
      }
    } else {
      let x;
      try { x = evalNum(n); } catch (e) { x = NaN; }
      if (Number.isFinite(x)) { out.approx = x; out.alt = [{ label: 'Näherung', u: '≈ ' + approxStr(x).replace('-', '−'), a: '~ ' + approxStr(x), approx: true }]; }
    }
    if (steps.length === 1 && !out.alt?.length) out.trivial = true;
    return out;
  }

  /* ---------------------------------------------------------- Gleichung mit einer Unbekannten v */
  function equation(L, R, v) {
    const S = MathInk.sym;
    if (!S) return null;
    const { simp, expand, poly, N, has, symText, symTex, symParse } = S;
    const isN = (n, p) => n.k === 'n' && (p === undefined || (n.p === p && n.q === 1));
    const add = (...a) => simp({ k: '+', a }), sub = (a, b) => simp({ k: '+', a: [a, { k: 'neg', a: b }] }), mul = (...a) => simp({ k: '*', a }), div = (a, b) => simp({ k: '/', a, b }), neg = (a) => simp({ k: 'neg', a });
    const lhs = symParse(L), rhs = symParse(R);
    const T = (n) => symText(n), X = (n) => symTex(n);
    const steps = [];
    const line = (title, l, r, op, note) => steps.push({ title, eq: [l, r], op, note, text: `${T(l)} = ${T(r)}`, tex: `${X(l)} = ${X(r)}` });
    line('Aufgabe', lhs, rhs);
    const V = { k: 'v', n: v };
    const term = (c, k) => k === 0 ? c : mul(c, k === 1 ? V : { k: '^', a: V, b: N(2) });
    // geordnet zum Anzeigen (a·x² + b·x + c), ohne erneutes Vereinfachen (das sortiert anders)
    const rawTerm = (c, k) => { const pv = k === 2 ? { k: '^', a: V, b: N(2) } : V; if (k === 0) return c; if (isN(c, 1)) return pv; if (isN(c, -1)) return { k: 'neg', a: pv }; return { k: '*', a: [c, pv] }; };
    const ord = (c2, c1, c0) => { const a = [[c2, 2], [c1, 1], [c0, 0]].filter(([c]) => !isN(c, 0)).map(([c, k]) => rawTerm(c, k)); return !a.length ? N(0) : a.length === 1 ? a[0] : { k: '+', a }; };
    const opTxt = (sign, n) => { const t = T(n); return `| ${sign}${/^[-−]/.test(t) || /[ +−]/.test(t.slice(1)) ? '(' + t + ')' : t}`; };
    const l = simp(expand(lhs)), r = simp(expand(rhs));
    const pl = poly(l, v), pr = poly(r, v);
    if (!pl || !pr) return null;
    const co = (p, i) => simp(expand(p[i] || N(0)));
    { const ol = ord(co(pl, 2), co(pl, 1), co(pl, 0)), or = ord(co(pr, 2), co(pr, 1), co(pr, 0)); if (T(ol) + '=' + T(or) !== T(lhs) + '=' + T(rhs)) line(/\(/.test(T(lhs) + T(rhs)) ? 'Klammern auflösen und zusammenfassen' : 'Zusammenfassen und ordnen', ol, or); }
    const deg = Math.max(...[0, 1, 2].map(i => (!isN(co(pl, i), 0) || !isN(co(pr, i), 0)) ? i : 0));
    if (deg <= 1) {
      let aL = co(pl, 1), bL = co(pl, 0), aR = co(pr, 1), bR = co(pr, 0);
      // Unbekannte nur rechts – oder rechts mehr davon (dann bleibt der Faktor positiv): Seiten tauschen
      if ((isN(aL, 0) && !isN(aR, 0)) || (aL.k === 'n' && aR.k === 'n' && aR.p / aR.q > aL.p / aL.q && !isN(aR, 0))) { [aL, bL, aR, bR] = [aR, bR, aL, bL]; line('Seiten tauschen', ord(N(0), aL, bL), ord(N(0), aR, bR)); }
      if (!isN(aR, 0)) { const t = term(aR, 1); aL = sub(aL, aR); aR = N(0); line(`${T(t)} auf beiden Seiten abziehen`, ord(N(0), aL, bL), bR, opTxt('−', t)); }
      if (isN(aL, 0)) {
        const ok = isN(sub(bL, bR), 0);
        return { kind: 'eq', steps, sols: ok ? 'alle' : [], note: ok ? 'Die Gleichung stimmt für jede Zahl.' : 'Widerspruch – keine Lösung.' };
      }
      if (!isN(bL, 0)) { const t = bL; bR = sub(bR, bL); bL = N(0); const neg0 = t.k === 'n' && t.p < 0; line(neg0 ? `${T(neg(t))} auf beiden Seiten addieren` : `${T(t)} auf beiden Seiten abziehen`, ord(N(0), aL, N(0)), bR, neg0 ? opTxt('+', neg(t)) : opTxt('−', t)); }
      if (!isN(aL, 1)) {
        const a = aL;
        const res = div(bR, a);
        line(isN(a, -1) ? 'Mit −1 malnehmen' : `Durch ${T(a)} teilen`, V, res, isN(a, -1) ? '| ·(−1)' : opTxt(':', a));
        return { kind: 'eq', steps, sols: [res], v };
      }
      return { kind: 'eq', steps, sols: [bR], v };
    }
    // quadratisch: alles nach links
    let c2 = sub(co(pl, 2), co(pr, 2)), c1 = sub(co(pl, 1), co(pr, 1)), c0 = sub(co(pl, 0), co(pr, 0));
    if (c2.k === 'n' && c2.p < 0) { c2 = neg(c2); c1 = neg(c1); c0 = neg(c0); }
    const rightZero = isN(co(pr, 2), 0) && isN(co(pr, 1), 0) && isN(co(pr, 0), 0);
    if (isN(c1, 0)) {
      // reinquadratisch: nach x² auflösen, dann Wurzel ziehen
      const q = div(neg(c0), c2);
      const isPlain = isN(co(pl, 2), 1) && isN(co(pl, 0), 0) && isN(co(pr, 2), 0);
      if (!isPlain) line(`Nach ${v}² auflösen`, { k: '^', a: V, b: N(2) }, q);
      if (q.k === 'n' && q.p < 0) return { kind: 'eq', steps, sols: [], note: `Ein Quadrat ist nie negativ – keine reelle Lösung.` };
      if (isN(q, 0)) return { kind: 'eq', steps, sols: [N(0)], v };
      const w = simp({ k: 'fn', f: 'sqrt', a: q });
      line('Wurzel ziehen (zwei Lösungen: + und −)', V, { k: '±', a: N(0), b: w });
      return { kind: 'eq', steps, sols: [neg(w), w], v };
    }
    if (!rightZero) line('Alles auf eine Seite bringen', ord(c2, c1, c0), N(0), opTxt('−', ord(co(pr, 2), co(pr, 1), co(pr, 0))));
    if (isN(c0, 0)) {
      line(`${v} ausklammern`, { k: '*', a: [V, ord(N(0), c2, c1)] }, N(0), null, 'Ein Produkt ist 0, wenn ein Faktor 0 ist');
      return { kind: 'eq', steps, sols: [N(0), div(neg(c1), c2)].sort((a, b) => S.symEval(a, {}) - S.symEval(b, {})), v };
    }
    const D = simp(expand(add(mul(c1, c1), mul(N(-4), c2, c0))));
    steps.push({ title: 'Mitternachtsformel', text: `${v}₁,₂ = (−b ± √(b² − 4ac)) / (2a)   mit a = ${T(c2)}, b = ${T(c1)}, c = ${T(c0)}`, tex: `${v}_{1,2} = \\frac{-b \\pm \\sqrt{b^2-4ac}}{2a}`, note: `a = ${T(c2)}, b = ${T(c1)}, c = ${T(c0)}` });
    steps.push({ title: 'Diskriminante berechnen', text: `D = b² − 4ac = ${T(D)}`, tex: `D = b^2-4ac = ${X(D)}` });
    if (D.k === 'n' && D.p < 0) return { kind: 'eq', steps, sols: [], note: 'D < 0 – keine reelle Lösung.' };
    if (isN(D, 0)) { const x = div(neg(c1), mul(N(2), c2)); steps.push({ title: 'D = 0: genau eine Lösung', text: `${v} = −b / (2a) = ${T(x)}`, tex: `${v} = ${X(x)}` }); return { kind: 'eq', steps, sols: [x], v }; }
    const w = simp({ k: 'fn', f: 'sqrt', a: D });
    const x1 = div(add(neg(c1), neg(w)), mul(N(2), c2)), x2 = div(add(neg(c1), w), mul(N(2), c2));
    const both = [x1, x2];
    try { both.sort((a, b) => S.symEval(a, {}) - S.symEval(b, {})); } catch (e) { /* Buchstaben */ }
    steps.push({ title: 'Einsetzen: zwei Lösungen', text: `${v}₁ = ${T(both[0])},  ${v}₂ = ${T(both[1])}`, tex: `${v}_1 = ${X(both[0])},\\quad ${v}_2 = ${X(both[1])}` });
    return { kind: 'eq', steps, sols: both, v };
  }

  /* ---------------------------------------------------------- Einstieg */
  function solve(left, right, opts = {}) {
    try {
      const vars = MathInk.varsIn(left, right);
      if (right && right.length && vars.length) {
        const v = vars.includes(opts.v) ? opts.v : vars[0];
        return equation(left, right, v);
      }
      if (vars.length) return null;
      return arith(left && left.length ? left : right);
    } catch (e) { return { kind: 'error', error: e.message, steps: [] }; }
  }

  /* ---------------------------------------------------------- Text zum Einfügen */
  const keyb = (s) => s.replace(/·/g, '*').replace(/−/g, '-').replace(/÷/g, '/').replace(/×/g, '*').replace(/π/g, 'pi').replace(/±/g, '+-').replace(/≈/g, '~').replace(/⇒/g, '=>').replace(/→/g, '->')
    .replace(/√\(/g, 'sqrt(').replace(/√([\w.]+)/g, 'sqrt($1)').replace(/([⁰¹²³⁴⁵⁶⁷⁸⁹⁻]+)/g, (m) => '^' + [...m].map(c => '⁰¹²³⁴⁵⁶⁷⁸⁹⁻'.indexOf(c) < 10 ? '⁰¹²³⁴⁵⁶⁷⁸⁹'.indexOf(c) : '-').join('')).replace(/₁/g, '1').replace(/₂/g, '2').replace(/,₂/g, ',2');
  const pretty = (s) => s.replace(/\^(\d+)/g, (m, d) => d.split('').map(c => SUP[c]).join('')).replace(/sqrt\(([\w.]+)\)/g, '√$1').replace(/sqrt\(/g, '√(');
  // 2·x → 2x, −5 statt -5 (Zeichenschreibweise)
  const symLine = (s) => pretty(s).replace(/(\d)·(?=[A-Za-zπ√(])/g, '$1').replace(/(^|[\s(=,:|±])-(?=[\d\w(√])/g, '$1−');
  /* Zeilen: [{ expr, note }] → Text; steps: Rechenweg oder nur Ergebnis; ascii: nur Tastaturzeichen */
  function lines(res, opts = {}) {
    if (!res || !res.steps) return [];
    const out = [];
    const fmt = (s) => opts.ascii ? keyb(s) : s;
    if (res.kind === 'arith') {
      const A = (n) => text(n, 'u');
      const last = res.steps[res.steps.length - 1];
      const alt = (res.alt || []).map(a => a.u).filter(Boolean);
      if (!opts.steps) {
        if (res.error) { out.push(fmt(A(res.steps[0].n)) + '   → ' + res.error); return out; }
        const parts = [A(res.steps[0].n), A(last.n), ...alt.filter(a => !a.startsWith('≈'))].filter((x, i, arr) => !i || x !== arr[i - 1]);
        const ap = alt.find(a => a.startsWith('≈'));
        out.push(fmt(parts.join(' = ') + (ap ? ' ' + ap : '')));
        return out;
      }
      res.steps.forEach((s, i) => out.push(fmt((i ? '= ' : '') + A(s.n)) + (i && s.title ? `      (${s.title}${s.note ? ': ' + fmt(s.note) : ''})` : '')));
      if (res.error) out.push('→ ' + res.error);
      for (const a of res.alt || []) out.push(fmt((a.u.startsWith('≈') ? '' : (a.approx ? '≈ ' : '= ')) + a.u) + `      (${a.label})`);
      return out;
    }
    if (res.kind === 'eq') {
      const solTxt = res.sols === 'alle' ? `${res.v || 'x'} beliebig (alle Zahlen)` : !res.sols.length ? 'keine Lösung' + (res.note ? ' (' + res.note + ')' : '') : res.sols.map((s, i) => `${res.v}${res.sols.length > 1 ? (i ? '₂' : '₁') : ''} = ${symLine(MathInk.sym.symText(s))}`).join(',  ');
      const approx = Array.isArray(res.sols) && res.sols.length ? res.sols.map(s => { try { const x = MathInk.sym.symEval(s, {}); return Number.isFinite(x) ? approxStr(x) : null; } catch (e) { return null; } }) : [];
      const exact = Array.isArray(res.sols) && res.sols.every(s => s.k === 'n' && s.q === 1);
      const apx = !exact && approx.length && approx.every(x => x !== null) ? '  ≈ ' + approx.map(x => x.replace('-', '−')).join(';  ') : '';
      if (!opts.steps) { out.push(fmt(symLine(res.steps[0].text) + '   ⇒   ' + solTxt + apx)); return out; }
      for (const s of res.steps) out.push(fmt(symLine(s.text)) + (s.op ? '      ' + fmt(symLine(s.op)) : '') + (s.title !== 'Aufgabe' ? `      (${symLine(s.title)}${s.note ? ': ' + fmt(symLine(s.note)) : ''})` : ''));
      out.push(fmt('⇒ ' + solTxt + apx));
      return out;
    }
    return out;
  }
  return { parse, solve, arith, equation, lines, text, tex, keyb, pretty };
})();

if (typeof module !== 'undefined') module.exports = { MathSteps };
