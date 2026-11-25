'use strict';
/* Taschenrechner (seit 1.8, überarbeitet 1.9)
 * Zwei Arten, mit einem Knopf umschaltbar (wie auf dem Handy oder unter Windows „Standard ↔ Wissenschaftlich“):
 *  - Wissenschaftlich: TI-30X Plus MathPrint, Europa-Ausführung, Tastenfeld genau nach der Vorlage. Eingabe mit Vorlagen wie
 *    im Schulbuch (Bruch, gemischte Zahl, Kehrwert, Wurzel, Hochzahl, logBASE …), exakte Ergebnisse (Bruch, Wurzel, π) mit ◄►≈,
 *    2nd-Funktionen (beim Drücken von 2nd tauschen die Beschriftungen), Mehrfachtasten (ln log, e□ 10□, π e i, ! nCr nPr,
 *    sin sin⁻¹, x yzt abcd), komplexe Zahlen, Zahlensysteme (base n), Umrechnungen (convert), DMS, op/set op,
 *    Statistik und Regressionen, Verteilungen, Wertetabelle und expr-eval.
 *  - Standard: Taschenrechner wie Windows „Standard“ (Speicher, %, CE/C, ⌫, ¹⁄ₓ, x², √, +/−) mit Vorschau des Ergebnisses.
 * Verlauf wird gezeichnet, Klick auf Rechnung oder Ergebnis fügt sie wieder ein. Fenster: verschiebbar, minimierbar,
 * Grösse per Ecke ziehen (oder Strg+Mausrad). */

const CALC_SLOTS = { frac: ['a', 'b'], sqrt: ['a'], root: ['n', 'a'], pow: ['a'], exp: ['a'], ten: ['a'], logb: ['b', 'a'], mixed: ['w', 'a', 'b'], abs: ['a'], sum: ['lo', 'hi', 'a'], prod: ['lo', 'hi', 'a'] };
const CALC_VARS = ['x', 'y', 'z', 't', 'a', 'b', 'c', 'd'];
const CALC_CONST = [
  ['c', 'Lichtgeschwindigkeit', 299792458, 'm/s'], ['g', 'Erdbeschleunigung', 9.80665, 'm/s²'], ['h', 'Plancksches Wirkungsquantum', 6.62607015e-34, 'J·s'],
  ['Nₐ', 'Avogadro-Konstante', 6.02214076e23, '1/mol'], ['R', 'Gaskonstante', 8.314462618, 'J/(mol·K)'], ['mₑ', 'Elektronenmasse', 9.1093837015e-31, 'kg'],
  ['mₚ', 'Protonenmasse', 1.67262192369e-27, 'kg'], ['mₙ', 'Neutronenmasse', 1.67492749804e-27, 'kg'], ['μ', 'Atomare Masseneinheit', 1.66053906660e-27, 'kg'],
  ['G', 'Gravitationskonstante', 6.67430e-11, 'N·m²/kg²'], ['F', 'Faraday-Konstante', 96485.33212, 'C/mol'], ['a₀', 'Bohrscher Radius', 5.29177210903e-11, 'm'],
  ['rₑ', 'Klass. Elektronenradius', 2.8179403262e-15, 'm'], ['k', 'Boltzmann-Konstante', 1.380649e-23, 'J/K'], ['e⁻', 'Elementarladung', 1.602176634e-19, 'C'],
  ['u', 'Atommassenkonstante', 1.66053906660e-27, 'kg'], ['ε₀', 'Elektrische Feldkonstante', 8.8541878128e-12, 'F/m'], ['μ₀', 'Magnetische Feldkonstante', 1.25663706212e-6, 'N/A²'],
  ['Vₘ', 'Molvolumen (0 °C, 1 atm)', 22.41396954e-3, 'm³/mol'], ['σ', 'Stefan-Boltzmann-Konstante', 5.670374419e-8, 'W/(m²·K⁴)'],
];
/* Umrechnungen (convert, 2nd 8): [id, Beschriftung, Funktion] – als nachgestellter Operator: 5 in▸cm */
const CALC_CONV = [
  ['in>cm', 'in▸cm', v => v * 2.54], ['cm>in', 'cm▸in', v => v / 2.54], ['ft>m', 'ft▸m', v => v * 0.3048], ['m>ft', 'm▸ft', v => v / 0.3048],
  ['yd>m', 'yd▸m', v => v * 0.9144], ['m>yd', 'm▸yd', v => v / 0.9144], ['mi>km', 'mile▸km', v => v * 1.609344], ['km>mi', 'km▸mile', v => v / 1.609344],
  ['acre>m2', 'acre▸m²', v => v * 4046.8564224], ['m2>acre', 'm²▸acre', v => v / 4046.8564224],
  ['galus>l', 'gal US▸L', v => v * 3.785411784], ['l>galus', 'L▸gal US', v => v / 3.785411784], ['galuk>l', 'gal UK▸L', v => v * 4.54609], ['l>galuk', 'L▸gal UK', v => v / 4.54609],
  ['oz>g', 'oz▸g', v => v * 28.349523125], ['g>oz', 'g▸oz', v => v / 28.349523125], ['lb>kg', 'lb▸kg', v => v * 0.45359237], ['kg>lb', 'kg▸lb', v => v / 0.45359237],
  ['f>c', '°F▸°C', v => (v - 32) * 5 / 9], ['c>f', '°C▸°F', v => v * 9 / 5 + 32], ['c>k', '°C▸K', v => v + 273.15], ['k>c', 'K▸°C', v => v - 273.15],
  ['kmh>ms', 'km/h▸m/s', v => v / 3.6], ['ms>kmh', 'm/s▸km/h', v => v * 3.6], ['atm>kpa', 'atm▸kPa', v => v * 101.325], ['kpa>atm', 'kPa▸atm', v => v / 101.325],
  ['cal>j', 'cal▸J', v => v * 4.184], ['j>cal', 'J▸cal', v => v / 4.184], ['kwh>mj', 'kWh▸MJ', v => v * 3.6], ['ps>kw', 'PS▸kW', v => v * 0.73549875], ['kw>ps', 'kW▸PS', v => v / 0.73549875],
];

/* ================================================================ Rechenwerk (ohne DOM) */
const CalcEngine = (() => {
  class CErr extends Error { constructor(m, pos) { super(m); this.pos = pos; } }
  const gcd = (a, b) => { a = Math.abs(a); b = Math.abs(b); while (b) [a, b] = [b, a % b]; return a; };
  /* komplexe Zahlen als { re, im }; reelle Ergebnisse bleiben gewöhnliche Zahlen */
  const isC = (v) => v !== null && typeof v === 'object';
  const C = (re, im) => {
    if (im === 0 || Math.abs(im) <= 1e-12 * Math.abs(re)) return re;
    if (Math.abs(re) <= 1e-12 * Math.abs(im)) re = 0;
    return { re, im };
  };
  const RE = (v) => isC(v) ? v.re : v, IM = (v) => isC(v) ? v.im : 0;
  const cadd = (a, b) => !isC(a) && !isC(b) ? a + b : C(RE(a) + RE(b), IM(a) + IM(b));
  const csub = (a, b) => !isC(a) && !isC(b) ? a - b : C(RE(a) - RE(b), IM(a) - IM(b));
  const cmul = (a, b) => !isC(a) && !isC(b) ? a * b : C(RE(a) * RE(b) - IM(a) * IM(b), RE(a) * IM(b) + IM(a) * RE(b));
  const cdiv = (a, b) => {
    if (!isC(a) && !isC(b)) return a / b;
    const d = RE(b) * RE(b) + IM(b) * IM(b);
    return C((RE(a) * RE(b) + IM(a) * IM(b)) / d, (IM(a) * RE(b) - RE(a) * IM(b)) / d);
  };
  const cabs = (a) => isC(a) ? Math.hypot(a.re, a.im) : Math.abs(a);
  const carg = (a) => Math.atan2(IM(a), RE(a));
  const cexp = (a) => { const r = Math.exp(RE(a)); return C(r * Math.cos(IM(a)), r * Math.sin(IM(a))); };
  const cln = (a) => C(Math.log(cabs(a)), carg(a));
  const cpow = (a, b) => {
    if (!isC(a) && !isC(b)) return Math.pow(a, b);
    if (cabs(a) === 0) return 0;
    if (!isC(b) && Number.isInteger(b) && Math.abs(b) <= 64) {
      let r = 1, base = a, n = Math.abs(b);
      while (n) { if (n & 1) r = cmul(r, base); base = cmul(base, base); n = Math.floor(n / 2); }
      return b < 0 ? cdiv(1, r) : r;
    }
    return cexp(cmul(b, cln(a)));
  };
  const FUN = new Set(['sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'sinh', 'cosh', 'tanh', 'asinh', 'acosh', 'atanh', 'ln', 'log', 'sqrt', 'root', 'exp', 'ten', 'logb', 'abs',
    'round', 'ipart', 'fpart', 'int', 'min', 'max', 'mod', 'lcm', 'gcd', 'normalpdf', 'normalcdf', 'invnorm', 'binompdf', 'binomcdf', 'poissonpdf', 'poissoncdf', 'randint', 'f',
    'conj', 'real', 'imag', 'angle', 'not', 'rpr', 'rpt', 'prx', 'pry']);
  const BASES = { 'ʰ': 16, 'ᵇ': 2, 'ᵒ': 8, 'ᵈ': 10 };
  function tokenize(s) {
    const out = [];
    let i = 0;
    while (i < s.length) {
      const ch = s[i], rest = s.slice(i);
      if (ch === ' ') { i++; continue; }
      if (s.startsWith('Ans', i)) { out.push({ t: 'ans', p: i }); i += 3; continue; }
      // Zahl mit Zahlensystem: 1Fʰ, 101ᵇ, 17ᵒ, 25ᵈ
      let m = /^([0-9A-F]+)([ʰᵇᵒᵈ])/.exec(rest);
      if (m) {
        const base = BASES[m[2]];
        if ([...m[1]].some(d => parseInt(d, 16) >= base)) throw new CErr('Ziffer passt nicht zum Zahlensystem', i);
        out.push({ t: 'num', v: parseInt(m[1], base), p: i, base: true }); i += m[0].length; continue;
      }
      // Winkel in Grad-Minuten-Sekunden: 30°15′20″
      m = /^(\d+\.?\d*|\.\d+)°(?:(\d+\.?\d*)′)?(?:(\d+\.?\d*)″)?/.exec(rest)
        || /^()(\d+\.?\d*|\.\d+)′(?:(\d+\.?\d*)″)?/.exec(rest)
        || /^()()(\d+\.?\d*|\.\d+)″/.exec(rest);
      if (m) { out.push({ t: 'num', v: (+m[1] || 0) + (+m[2] || 0) / 60 + (+m[3] || 0) / 3600, p: i, deg: true, dec: true }); i += m[0].length; continue; }
      m = /^(\d+\.?\d*|\.\d+)(E~?-?\d+)?/.exec(rest);
      if (m) {
        const txt = m[0].replace('E~', 'E-');
        if (/E-?$/.test(txt)) throw new CErr('Syntax', i);
        out.push({ t: 'num', v: parseFloat(txt), p: i, dec: m[1].includes('.') || !!m[2] }); i += m[0].length; continue;
      }
      if (/[A-F]/.test(ch)) throw new CErr(ch === 'E' ? 'Syntax' : 'Hex-Ziffern brauchen ʰ (base n)', i);
      if (s.startsWith('nCr', i) || s.startsWith('nPr', i)) { out.push({ t: 'op', v: s.slice(i, i + 3), p: i }); i += 3; continue; }
      if (s.startsWith('⁻¹', i)) { out.push({ t: 'post', v: 'inv', p: i }); i += 2; continue; }
      if (ch === '\u0003') { const j = s.indexOf('\u0004', i); out.push({ t: 'post', v: 'cv', id: s.slice(i + 1, j), p: i }); i = j + 1; continue; }
      if (ch === '\u0005') { const j = s.indexOf('\u0006', i); out.push({ t: 'disp', v: s.slice(i + 1, j), p: i }); i = j + 1; continue; }
      if (ch === '\u0001') { const j = s.indexOf('\u0002', i); out.push({ t: 'const', v: +s.slice(i + 1, j), p: i }); i = j + 1; continue; }
      m = /^[a-z][a-z0-9]*/i.exec(rest);
      if (m && m[0].length > 1 && FUN.has(m[0].toLowerCase()) && s[i + m[0].length] === '(') { out.push({ t: 'fn', v: m[0].toLowerCase(), p: i }); i += m[0].length; continue; }
      if (m && m[0] === 'f' && s[i + 1] === '(') { out.push({ t: 'fn', v: 'f', p: i }); i += 1; continue; }
      if (CALC_VARS.includes(ch)) { out.push({ t: 'var', v: ch, p: i }); i++; continue; }
      if (ch === 'π') { out.push({ t: 'const', v: Math.PI, p: i, pi: true }); i++; continue; }
      if (ch === 'e') { out.push({ t: 'const', v: Math.E, p: i }); i++; continue; }
      if (ch === 'i') { out.push({ t: 'const', v: { re: 0, im: 1 }, p: i, cx: true }); i++; continue; }
      if ('!%°ʳᵍ'.includes(ch)) { out.push({ t: 'post', v: ch, p: i }); i++; continue; }
      if ('+-*/^(),~→∠&¦⊕⊙'.includes(ch)) { out.push({ t: 'op', v: ch, p: i }); i++; continue; }
      throw new CErr('Syntax', i);
    }
    return out;
  }
  /* Ausdruck auswerten. env: { ang: 'DEG'|'RAD'|'GRAD', vars, ans, cplx?: 'REAL'|'a+bi'|'r∠θ', pocket?: true (50+10% = 55), f?: (x) => Wert }
   * Ergebnis: { v: Zahl oder {re, im}, pi, root, dec, invTrig, base, disp } */
  function evaluate(src, env) {
    const toks = tokenize(src);
    let i = 0;
    const peek = () => toks[i];
    const isOp = (v) => toks[i] && toks[i].t === 'op' && toks[i].v === v;
    const unit = env.ang || 'DEG';
    const toRad = (x) => unit === 'DEG' ? x * Math.PI / 180 : unit === 'GRAD' ? x * Math.PI / 200 : x;
    const fromRad = (x) => unit === 'DEG' ? x * 180 / Math.PI : unit === 'GRAD' ? x * 200 / Math.PI : x;
    const fromDeg = (x) => fromRad(x * Math.PI / 180);
    const allowC = (env.cplx && env.cplx !== 'REAL') || toks.some(t => (t.t === 'const' && t.cx) || (t.t === 'op' && t.v === '∠'));
    const R = (v, p) => { if (isC(v)) throw new CErr('Komplexe Zahl hier nicht möglich', p); return v; };
    const chk = (v, p) => {
      if (isC(v)) {
        if (Number.isNaN(v.re) || Number.isNaN(v.im)) throw new CErr('Bereich', p);
        if (!isFinite(v.re) || !isFinite(v.im)) throw new CErr('Überlauf', p);
        return v;
      }
      if (Number.isNaN(v)) throw new CErr('Bereich', p);
      if (!isFinite(v)) throw new CErr('Überlauf', p);
      return v;
    };
    const nonReal = (p) => { throw new CErr(allowC ? 'Bereich' : 'Nicht reell (komplex: mode → a+bi)', p); };
    const int32 = (v, p) => { v = R(v, p); if (Math.abs(v - Math.round(v)) > 1e-9) throw new CErr('Nur ganze Zahlen', p); return Math.round(v) | 0; };
    const startsPrimary = (t) => t && (t.t === 'num' || t.t === 'const' || t.t === 'var' || t.t === 'ans' || t.t === 'fn' || (t.t === 'op' && t.v === '('));
    const fact = (n, p) => { if (n < 0 || !Number.isInteger(+n.toFixed(10)) || n > 170) throw new CErr('Bereich', p); n = Math.round(n); let r = 1; for (let k = 2; k <= n; k++) r *= k; return r; };
    const comb = (n, k, perm, p) => { if (!Number.isInteger(n) || !Number.isInteger(k) || n < 0 || k < 0 || k > n) throw new CErr('Bereich', p); let r = 1; for (let q = 0; q < k; q++) r = perm ? r * (n - q) : r * (n - q) / (q + 1); return Math.round(r); };
    const erf = (x) => { const s = Math.sign(x); x = Math.abs(x); if (x < 3) { let sum = x, term = x, k = 0; while (Math.abs(term) > 1e-17 * Math.abs(sum) && k < 200) { k++; term *= -x * x / k; sum += term / (2 * k + 1); } return s * 2 / Math.sqrt(Math.PI) * sum; } let f = 0; for (let k = 60; k >= 1; k--) f = k / 2 / (x + f); return s * (1 - Math.exp(-x * x) / Math.sqrt(Math.PI) / (x + f)); };
    const ncdf = (z) => 0.5 * (1 + erf(z / Math.SQRT2));
    let usedPi = false, usedRoot = false, usedDec = false, usedInvTrig = false, usedBase = false;
    const takeDisp = () => { while (peek() && peek().t === 'disp') env.disp = toks[i++].v; };
    const expr = () => {
      let v = logic();
      takeDisp();
      if (isOp('→')) { const p = toks[i].p; i++; const t = toks[i++]; if (!t || t.t !== 'var') throw new CErr('Syntax', p); env.vars[t.v] = v; env.stored = t.v; }
      takeDisp();
      return v;
    };
    const logic = () => {
      let v = add();
      while (isOp('&') || isOp('¦') || isOp('⊕') || isOp('⊙')) {
        const t = toks[i++];
        const a = int32(v, t.p), b = int32(add(), t.p);
        v = t.v === '&' ? a & b : t.v === '¦' ? a | b : t.v === '⊕' ? a ^ b : ~(a ^ b);
        usedBase = true;
      }
      return v;
    };
    const add = () => {
      let v = mul();
      while (isOp('+') || isOp('-')) {
        const op = toks[i++].v;
        let w = mul();
        // Taschenrechner-Prozent (einfacher Rechner): 50 + 10 % = 55
        if (env.pocket && toks[i - 1] && toks[i - 1].t === 'post' && toks[i - 1].v === '%' && !isC(v) && !isC(w)) w = v * w;
        v = chk(op === '+' ? cadd(v, w) : csub(v, w));
      }
      return v;
    };
    const mul = () => {
      let v = perm();
      for (;;) {
        if (isOp('*') || isOp('/')) {
          const t = toks[i++]; const w = perm();
          if (t.v === '/' && cabs(w) === 0) throw new CErr('Division durch 0', t.p);
          v = chk(t.v === '*' ? cmul(v, w) : cdiv(v, w), t.p);
        } else if (startsPrimary(peek())) { v = chk(cmul(v, perm())); }   // implizite Multiplikation: 2π, 3(4+5), 2sin(30), 3i
        else break;
      }
      return v;
    };
    const perm = () => {
      let v = neg();
      while (isOp('nCr') || isOp('nPr') || isOp('∠')) {
        const t = toks[i++]; const w = neg();
        if (t.v === '∠') { const th = toRad(R(w, t.p)), r = R(v, t.p); v = C(r * Math.cos(th), r * Math.sin(th)); }
        else v = comb(R(v, t.p), R(w, t.p), t.v === 'nPr', t.p);
      }
      return v;
    };
    const neg = () => { if (isOp('~') || isOp('-')) { i++; const v = neg(); return isC(v) ? C(-v.re, -v.im) : -v; } return pow(); };
    const power = (b, e, p) => {
      if (!isC(b) && !isC(e)) {
        if (b === 0 && e < 0) throw new CErr('Division durch 0', p);
        if (b < 0 && !Number.isInteger(e)) {
          // ungerade Wurzel aus negativer Zahl bleibt reell: (−8)^(1/3) = −2 (wie TI)
          const f = frac(e, 100);
          if (f && Math.abs(f.d) % 2 === 1 && Math.abs(e - f.n / f.d) < 1e-12) { const r = Math.pow(-b, Math.abs(f.n) / f.d); return chk((Math.abs(f.n) % 2 ? -1 : 1) * (f.n < 0 ? 1 / r : r), p); }
          if (!allowC) nonReal(p);
          return chk(cpow(b, e), p);
        }
        return chk(Math.pow(b, e), p);
      }
      return chk(cpow(b, e), p);
    };
    const pow = () => {
      const base = post();
      if (isOp('^')) { const t = toks[i++]; const e = neg(); return power(base, e, t.p); }
      return base;
    };
    const post = () => {
      let v = primary();
      for (;;) {
        const t = peek();
        if (!t || t.t !== 'post') break;
        i++;
        if (t.v === '!') v = fact(R(v, t.p), t.p);
        else if (t.v === '%') v = isC(v) ? C(v.re / 100, v.im / 100) : v / 100;
        else if (t.v === 'inv') { if (cabs(v) === 0) throw new CErr('Division durch 0', t.p); v = cdiv(1, v); }
        else if (t.v === '°') v = fromDeg(R(v, t.p));
        else if (t.v === 'ʳ') v = fromRad(R(v, t.p));
        else if (t.v === 'ᵍ') v = fromRad(R(v, t.p) * Math.PI / 200);
        else if (t.v === 'cv') { const c = CALC_CONV.find(x => x[0] === t.id); if (!c) throw new CErr('Syntax', t.p); v = chk(c[2](R(v, t.p)), t.p); usedDec = true; }
      }
      return v;
    };
    const args = () => {
      const out = [];
      if (!isOp('(')) throw new CErr('Syntax', peek() ? peek().p : src.length);
      i++;
      if (isOp(')')) { i++; return out; }
      for (;;) { out.push(expr()); if (isOp(',')) { i++; continue; } if (isOp(')')) { i++; break; } if (!peek()) break; throw new CErr('Syntax', peek().p); }
      return out;
    };
    const primary = () => {
      const t = toks[i++];
      if (!t) throw new CErr('Syntax', src.length);
      if (t.t === 'num') { if (t.dec) usedDec = true; if (t.base) usedBase = true; return t.deg ? fromDeg(t.v) : t.v; }
      if (t.t === 'const') { if (t.pi) usedPi = true; return t.cx ? { re: 0, im: 1 } : t.v; }
      if (t.t === 'var') { const v = env.vars[t.v]; return isC(v) ? { re: +v.re || 0, im: +v.im || 0 } : (+v || 0); }
      if (t.t === 'ans') { const v = env.ans; return isC(v) ? { re: v.re, im: v.im } : (+v || 0); }
      if (t.t === 'op' && t.v === '(') { const v = expr(); if (isOp(')')) i++; return v; }
      if (t.t === 'fn') {
        const a = args();
        const n = (k) => { if (a.length < k) throw new CErr('Argument', t.p); };
        const r = (k) => R(a[k], t.p);
        const f = t.v;
        switch (f) {
          case 'sin': case 'cos': case 'tan': { n(1); const x = toRad(r(0)); let v = Math[f](x); if (Math.abs(v) < 1e-15) v = 0; if (f === 'tan' && Math.abs(Math.cos(x)) < 1e-15) throw new CErr('Bereich', t.p); return v; }
          case 'asin': case 'acos': { n(1); if (Math.abs(r(0)) > 1) throw new CErr('Bereich', t.p); usedInvTrig = true; return fromRad(Math[f](a[0])); }
          case 'atan': n(1); usedInvTrig = true; return fromRad(Math.atan(r(0)));
          case 'sinh': case 'cosh': case 'tanh': n(1); return chk(Math[f](r(0)), t.p);
          case 'asinh': n(1); return Math.asinh(r(0));
          case 'acosh': n(1); if (r(0) < 1) throw new CErr('Bereich', t.p); return Math.acosh(a[0]);
          case 'atanh': n(1); if (Math.abs(r(0)) >= 1) throw new CErr('Bereich', t.p); return Math.atanh(a[0]);
          case 'ln': case 'log': {
            n(1); const x = a[0];
            if (cabs(x) === 0) throw new CErr('Bereich', t.p);
            if (isC(x) || x < 0) { if (!allowC) nonReal(t.p); const l = cln(x); return f === 'ln' ? l : cdiv(l, Math.LN10); }
            return f === 'ln' ? Math.log(x) : Math.log10(x);
          }
          case 'logb': n(2); if (r(1) <= 0 || r(0) <= 0 || a[0] === 1) throw new CErr('Bereich', t.p); return Math.log(a[1]) / Math.log(a[0]);
          case 'sqrt': {
            n(1); usedRoot = true; const x = a[0];
            if (isC(x)) return cpow(x, 0.5);
            if (x < 0) { if (!allowC) nonReal(t.p); return C(0, Math.sqrt(-x)); }
            return Math.sqrt(x);
          }
          case 'root': {
            n(2); usedRoot = true; const k = r(0), x = a[1];
            if (k === 0) throw new CErr('Bereich', t.p);
            if (isC(x)) return cpow(x, 1 / k);
            if (x < 0) { if (Number.isInteger(k) && k % 2) return -Math.pow(-x, 1 / k); if (!allowC) nonReal(t.p); return cpow(x, 1 / k); }
            return Math.pow(x, 1 / k);
          }
          case 'exp': n(1); return chk(isC(a[0]) ? cexp(a[0]) : Math.exp(a[0]), t.p);
          case 'ten': n(1); return chk(isC(a[0]) ? cpow(10, a[0]) : Math.pow(10, a[0]), t.p);
          case 'abs': n(1); return cabs(a[0]);
          case 'conj': n(1); return isC(a[0]) ? C(a[0].re, -a[0].im) : a[0];
          case 'real': n(1); return RE(a[0]);
          case 'imag': n(1); return IM(a[0]);
          case 'angle': n(1); return fromRad(carg(a[0]));
          case 'round': n(1); { const d = a.length > 1 ? Math.round(r(1)) : 0; const p = Math.pow(10, d); return Math.sign(r(0)) * Math.round(+(Math.abs(a[0]) * p).toPrecision(15)) / p; }
          case 'ipart': n(1); return Math.trunc(r(0));
          case 'fpart': n(1); return +(r(0) - Math.trunc(a[0])).toPrecision(14);
          case 'int': n(1); return Math.floor(r(0));
          case 'min': n(2); return Math.min(...a.map((x, k) => r(k)));
          case 'max': n(2); return Math.max(...a.map((x, k) => r(k)));
          case 'mod': n(2); if (r(1) === 0) throw new CErr('Division durch 0', t.p); return r(0) - a[1] * Math.floor(a[0] / a[1]);
          case 'lcm': n(2); { const x = Math.round(r(0)), y = Math.round(r(1)); return x && y ? Math.abs(x / gcd(x, y) * y) : 0; }
          case 'gcd': n(2); return gcd(Math.round(r(0)), Math.round(r(1)));
          case 'not': n(1); usedBase = true; return ~int32(a[0], t.p);
          case 'rpr': n(2); return Math.hypot(r(0), r(1));
          case 'rpt': n(2); return fromRad(Math.atan2(r(1), r(0)));
          case 'prx': n(2); { const v = r(0) * Math.cos(toRad(r(1))); return Math.abs(v) < 1e-14 * Math.abs(a[0]) ? 0 : v; }
          case 'pry': n(2); { const v = r(0) * Math.sin(toRad(r(1))); return Math.abs(v) < 1e-14 * Math.abs(a[0]) ? 0 : v; }
          case 'normalpdf': { n(1); const m = a[1] ?? 0, s = a[2] ?? 1; if (s <= 0) throw new CErr('Bereich', t.p); const z = (r(0) - m) / s; return Math.exp(-z * z / 2) / (s * Math.sqrt(2 * Math.PI)); }
          case 'normalcdf': { n(2); const m = a[2] ?? 0, s = a[3] ?? 1; if (s <= 0) throw new CErr('Bereich', t.p); return ncdf((r(1) - m) / s) - ncdf((r(0) - m) / s); }
          case 'invnorm': {
            n(1); const p = r(0), m = a[1] ?? 0, s = a[2] ?? 1;
            if (p <= 0 || p >= 1 || s <= 0) throw new CErr('Bereich', t.p);
            let lo = -40, hi = 40; for (let k = 0; k < 200; k++) { const mid = (lo + hi) / 2; if (ncdf(mid) < p) lo = mid; else hi = mid; }
            return m + s * (lo + hi) / 2;
          }
          case 'binompdf': case 'binomcdf': {
            n(3); const N = Math.round(r(0)), p = r(1), k = Math.round(r(2));
            if (p < 0 || p > 1 || N < 0) throw new CErr('Bereich', t.p);
            const pmf = (q) => q < 0 || q > N ? 0 : comb(N, q, false, t.p) * Math.pow(p, q) * Math.pow(1 - p, N - q);
            if (f === 'binompdf') return pmf(k);
            let s = 0; for (let q = 0; q <= k; q++) s += pmf(q); return Math.min(1, s);
          }
          case 'poissonpdf': case 'poissoncdf': {
            n(2); const l = r(0), k = Math.round(r(1));
            if (l <= 0 || k < 0) throw new CErr('Bereich', t.p);
            const pmf = (q) => Math.exp(-l + q * Math.log(l) - Math.log(fact(Math.min(q, 170), t.p)));
            if (f === 'poissonpdf') return pmf(k);
            let s = 0; for (let q = 0; q <= k; q++) s += pmf(q); return Math.min(1, s);
          }
          case 'randint': n(2); { const lo = Math.ceil(Math.min(r(0), r(1))), hi = Math.floor(Math.max(a[0], a[1])); return lo + Math.floor(Math.random() * (hi - lo + 1)); }
          case 'f': n(1); if (!env.f) throw new CErr('Syntax', t.p); return env.f(r(0));
        }
      }
      throw new CErr('Syntax', t.p);
    };
    if (!toks.length) throw new CErr('Syntax', 0);
    const v = expr();
    if (i < toks.length) throw new CErr('Syntax', toks[i].p);
    return { v: chk(v), pi: usedPi, root: usedRoot, dec: usedDec, invTrig: usedInvTrig, base: usedBase, disp: env.disp || null };
  }

  /* ---- exakte Formen */
  function frac(v, maxDen = 10000) {
    if (!isFinite(v)) return null;
    const s = Math.sign(v); const x = Math.abs(v);
    let h0 = 0, h1 = 1, k0 = 1, k1 = 0, y = x;
    for (let it = 0; it < 40; it++) {
      const a = Math.floor(y);
      const h2 = a * h1 + h0, k2 = a * k1 + k0;
      if (k2 > maxDen) break;
      h0 = h1; h1 = h2; k0 = k1; k1 = k2;
      if (Math.abs(x - h1 / k1) <= 1e-10 * Math.max(1, x)) return { n: s * h1, d: k1 };
      const r = y - a; if (r < 1e-15) break; y = 1 / r;
    }
    return null;
  }
  function surd(v) {
    if (!isFinite(v) || v === 0) return null;
    const f2 = frac(v * v, 1000);
    if (!f2 || f2.n <= 0) return null;
    let rad = f2.n * f2.d, k = 1;
    for (let p = 2; p * p <= rad; p++) while (rad % (p * p) === 0) { rad /= p * p; k *= p; }
    if (rad === 1 || rad > 10000) return null;
    const g = gcd(k, f2.d);
    const out = { c: k / g, m: rad, q: f2.d / g, s: Math.sign(v) };
    if (Math.abs(out.s * out.c * Math.sqrt(out.m) / out.q - v) > 1e-9 * Math.max(1, Math.abs(v))) return null;
    return out;
  }
  function piForm(v) {
    if (!isFinite(v) || v === 0) return null;
    const f = frac(v / Math.PI, 100);
    if (!f || Math.abs(f.n) > 1000) return null;
    return f;
  }
  return { evaluate, frac, surd, piForm, CErr, gcd, isC, cabs, carg, C };
})();

/* ================================================================ Oberfläche */
const CK_BOX = '<i class="kbx"></i>';
const CK_FR = (a, b) => `<span class="kfr"><span>${a}</span><span>${b}</span></span>`;
/* Kontrast ◄◐ / ◐►: Dreieck + halb gefüllter Kreis */
const CK_CON = (dir) => `<svg class="kcon" viewBox="0 0 22 10" aria-hidden="true">${dir < 0 ? '<path d="M1 5 7 1.5v7z" fill="currentColor"/>' : '<path d="M21 5 15 1.5v7z" fill="currentColor"/>'}<circle cx="${dir < 0 ? 14 : 8}" cy="5" r="3.6" fill="none" stroke="currentColor" stroke-width="1.2"/><path d="M${dir < 0 ? 14 : 8} 1.4a3.6 3.6 0 0 1 0 7.2z" fill="currentColor"/></svg>`;
/* Tastenfelder: [id, Beschriftung, 2nd-Beschriftung, Klasse, Tooltip]. 'pad' = Pfeil-Wippe (2×2 Felder). */
const CALC_KEYS = {
  sci: [
    ['2nd', '2nd', '', 'k2nd', '2nd: Zweitfunktion (blau) – die Beschriftungen tauschen, solange 2nd aktiv ist'],
    ['mode', 'mode', 'quit', 'kf', 'mode: Winkel, Stellen, Darstellung, komplexe Zahlen · 2nd: quit (zurück zur Rechnung)'],
    ['del', 'delete', 'insert', 'kf', 'delete: Zeichen löschen · 2nd: insert (Überschreiben ein/aus)'],
    ['pad'],
    ['lnlog', 'ln log', '', 'kf', 'ln( – nochmals drücken: log('],
    ['math', 'math', '', 'kf', 'math: Bruch ↔ gemischt, kgV, ggT, Primfaktoren, logBASE, Betrag, DMS, Polar, Hyperbelfunktionen'],
    ['data', 'data', 'stat-reg/distr', 'kf', 'data: Listen L1–L3 · 2nd: Statistik, Regressionen, Verteilungen'],
    ['exp10', `e<sup>${CK_BOX}</sup>10<sup>${CK_BOX}</sup>`, '', 'kf', 'e hoch □ – nochmals drücken: 10 hoch □'],
    ['EE', 'EE', '', 'kf', 'EE: mal 10 hoch n (wissenschaftliche Schreibweise)'],
    ['prb', '<span class="kst"><b>!</b><span>nCr<br>nPr</span></span>', 'random', 'kf', '! (Fakultät) – nochmals: nCr, nPr · 2nd: random (Zufallszahlen)'],
    ['table', 'table', 'expr-eval', 'kf', 'table: Wertetabelle f(x) · 2nd: expr-eval (Ausdruck mit Variablen auswerten)'],
    ['clear', 'clear', '', 'kf', 'clear: Eingabe löschen · nochmals: Anzeige leeren'],
    ['pi', '<span class="kst"><i>π</i><span><i>e</i><br><i>i</i></span></span>', 'complex', 'kf', 'π – nochmals: e, i · 2nd: complex (komplexe Zahlen)'],
    ['sin', '<span class="k2l">sin<br>sin<sup>-1</sup></span>', '', 'kf', 'sin( – nochmals: sin⁻¹('],
    ['cos', '<span class="k2l">cos<br>cos<sup>-1</sup></span>', '', 'kf', 'cos( – nochmals: cos⁻¹('],
    ['tan', '<span class="k2l">tan<br>tan<sup>-1</sup></span>', '', 'kf', 'tan( – nochmals: tan⁻¹('],
    ['÷', '÷', '%', 'kop', 'geteilt · 2nd: % (Prozent)'],
    ['xpow', `<i>x</i><sup>${CK_BOX}</sup>`, `<sup>${CK_BOX}</sup>√`, 'kf', 'x hoch □ · 2nd: □-te Wurzel'],
    ['n/d', CK_FR(CK_BOX, CK_BOX), CK_FR('1', CK_BOX), 'kf', 'Bruch-Vorlage n/d (eine Zahl davor wird der Zähler; ▲ ▼ wechselt) · 2nd: Kehrwert 1/□'],
    ['(', '(', 'constants', 'kf', 'Klammer auf · 2nd: constants (Naturkonstanten)'],
    [')', ')', 'op', 'kf', 'Klammer zu · 2nd: op (gespeicherte Operation anwenden)'],
    ['×', '×', 'set op', 'kop', 'mal · 2nd: set op (Operation festlegen, z.B. ×2+3)'],
    ['x²', '<i>x</i>²', '√', 'kf', 'Quadrat · 2nd: Quadratwurzel'],
    ['7', '7', CK_BOX + CK_FR(CK_BOX, CK_BOX), 'kn', '7 · 2nd: gemischte Zahl (U n/d)'],
    ['8', '8', 'convert', 'kn', '8 · 2nd: convert (Einheiten umrechnen)'],
    ['9', '9', 'base n', 'kn', '9 · 2nd: base n (Hex, Bin, Oct, Logik)'],
    ['−', '−', CK_CON(-1), 'kop', 'minus · 2nd: Kontrast schwächer'],
    ['xyzt', '<span class="kst"><i>x</i><span><i>yzt</i><br><i>abcd</i></span></span>', 'clear var', 'kf', 'Variable x – nochmals: y z t a b c d · 2nd: clear var (alle Variablen löschen)'],
    ['4', '4', 'D', 'kn', '4 · 2nd: Hex-Ziffer D'], ['5', '5', 'E', 'kn', '5 · 2nd: Hex-Ziffer E'], ['6', '6', 'F', 'kn', '6 · 2nd: Hex-Ziffer F'],
    ['+', '+', CK_CON(1), 'kop', 'plus · 2nd: Kontrast stärker'],
    ['sto', 'sto→', 'recall', 'kf', 'sto→: Wert speichern (z.B. 5 sto→ x) · 2nd: recall (Speicher abrufen)'],
    ['1', '1', 'A', 'kn', '1 · 2nd: Hex-Ziffer A'], ['2', '2', 'B', 'kn', '2 · 2nd: Hex-Ziffer B'], ['3', '3', 'C', 'kn', '3 · 2nd: Hex-Ziffer C'],
    ['tog', '◄►≈', 'f◄►d', 'kop', 'Ergebnis umschalten: exakt (Bruch, Wurzel, π) ↔ Dezimal · 2nd: Bruch ↔ Dezimal'],
    ['on', 'on', 'off', 'kf', 'on: Eingabe und Fehler löschen · 2nd: off (Rechner minimieren)'],
    ['0', '0', 'reset', 'kn', '0 · 2nd: reset (Rechner zurücksetzen)'],
    ['.', '.', ',', 'kn', 'Dezimalpunkt · 2nd: Komma (trennt Argumente)'],
    ['neg', '(−)', 'answer', 'kn', '(−) negatives Vorzeichen · 2nd: answer (letztes Ergebnis Ans)'],
    ['enter', 'enter', '', 'kop kent', 'enter: ausrechnen (Enter oder =)'],
  ],
  simple: [
    ['MC', 'MC', '', 'km', 'Speicher löschen'], ['MR', 'MR', '', 'km', 'Speicher abrufen'], ['M+', 'M+', '', 'km', 'Wert zum Speicher addieren'], ['M−', 'M−', '', 'km', 'Wert vom Speicher abziehen'],
    ['%', '%', '', 'kf', 'Prozent (50 + 10 % = 55, 50 × 10 % = 5)'], ['CE', 'CE', '', 'kf', 'CE: letzte Zahl löschen'], ['C', 'C', '', 'kf', 'C: alles löschen (Esc)'], ['⌫', '⌫', '', 'kf', 'Zeichen löschen (Rücktaste)'],
    ['inv', '¹⁄ₓ', '', 'kf', 'Kehrwert'], ['sq', '<i>x</i>²', '', 'kf', 'Quadrat'], ['sqrt', '²√<i>x</i>', '', 'kf', 'Quadratwurzel'], ['÷', '÷', '', 'kop', 'geteilt (/ oder :)'],
    ['7', '7', '', 'kn'], ['8', '8', '', 'kn'], ['9', '9', '', 'kn'], ['×', '×', '', 'kop', 'mal (*)'],
    ['4', '4', '', 'kn'], ['5', '5', '', 'kn'], ['6', '6', '', 'kn'], ['−', '−', '', 'kop', 'minus'],
    ['1', '1', '', 'kn'], ['2', '2', '', 'kn'], ['3', '3', '', 'kn'], ['+', '+', '', 'kop', 'plus'],
    ['pm', '+/−', '', 'kn', 'Vorzeichen wechseln'], ['0', '0', '', 'kn'], ['.', '.', '', 'kn', 'Dezimalpunkt'], ['enter', '=', '', 'kent', 'ausrechnen (Enter oder =)'],
  ],
};
/* Menüs (Bildschirm-Listen) und welche Register eine Taste öffnet */
const CALC_MENUS = {
  math: [['▸n/d◂▸Un/d  Brüche gemischt/unecht', 'mixed'], ['lcm(  kleinstes gem. Vielfaches', 'lcm('], ['gcd(  grösster gem. Teiler', 'gcd('], ['▸Pfactor  Primfaktoren', 'pfactor'], ['sum(  Σ Summe über x', 'tpl:sum'], ['prod(  ∏ Produkt über x', 'tpl:prod'], ['logBASE(', 'tpl:logb'], ['ˣ√  x-te Wurzel', 'tpl:root'], ['|x|  Betrag', 'tpl:abs']],
  num: [['abs(', 'abs('], ['round(', 'round('], ['iPart(', 'iPart('], ['fPart(', 'fPart('], ['int(', 'int('], ['min(', 'min('], ['max(', 'max('], ['mod(', 'mod(']],
  dms: [['°  Grad', '°'], ['′  Minuten', '′'], ['″  Sekunden', '″'], ['ʳ  Bogenmass', 'ʳ'], ['ᵍ  Neugrad', 'ᵍ'], ['▸DMS  Ergebnis in Grad/Min/Sek', 'disp:DMS']],
  'r◂▸p': [['R▸Pr(x,y)', 'R▸Pr('], ['R▸Pθ(x,y)', 'R▸Pθ('], ['P▸Rx(r,θ)', 'P▸Rx('], ['P▸Ry(r,θ)', 'P▸Ry(']],
  hyp: [['sinh(', 'sinh('], ['cosh(', 'cosh('], ['tanh(', 'tanh('], ['sinh⁻¹(', 'sinh⁻¹('], ['cosh⁻¹(', 'cosh⁻¹('], ['tanh⁻¹(', 'tanh⁻¹(']],
  stats: [['1-Var Stats (L1)', 'stat1'], ['2-Var Stats (L1, L2)', 'stat2'], ['LinReg  y = ax + b', 'reg:lin'], ['QuadReg  y = ax² + bx + c', 'reg:quad'], ['ExpReg  y = a·bˣ', 'reg:exp'], ['LnReg  y = a + b·ln x', 'reg:ln'], ['PwrReg  y = a·xᵇ', 'reg:pwr'], ['StatVars (letzte Auswertung)', 'statvars']],
  distr: [['normalpdf(x,μ,σ)', 'normalpdf('], ['normalcdf(a,b,μ,σ)', 'normalcdf('], ['invNorm(p,μ,σ)', 'invNorm('], ['binompdf(n,p,k)', 'binompdf('], ['binomcdf(n,p,k)', 'binomcdf('], ['poissonpdf(λ,k)', 'poissonpdf('], ['poissoncdf(λ,k)', 'poissoncdf(']],
  random: [['rand  Zufallszahl 0…1', 'rand'], ['randint(a,b)  ganze Zufallszahl', 'randint(']],
  complex: [['i  imaginäre Einheit', 'i'], ['∠  Polarform r∠θ eingeben', '∠'], ['conj(  konjugiert', 'conj('], ['real(  Realteil', 'real('], ['imag(  Imaginärteil', 'imag('], ['angle(  Argument', 'angle('], ['abs(  Betrag', 'abs('], ['▸r∠θ  Ergebnis polar', 'disp:POL'], ['▸a+bi  Ergebnis kartesisch', 'disp:RECT']],
  constants: CALC_CONST.map(c => [`${c[0]} = ${c[2]} ${c[3]} – ${c[1]}`, 'k:' + c[2]]),
  convert: CALC_CONV.map(c => [c[1], 'cv:' + c[0]]),
  'base n': [['▸Hex', 'disp:HEX'], ['▸Bin', 'disp:BIN'], ['▸Oct', 'disp:OCT'], ['▸Dec', 'disp:DEC'], ['ʰ  Hex-Zahl (z.B. 1Fʰ)', 'ʰ'], ['ᵇ  Binärzahl', 'ᵇ'], ['ᵒ  Oktalzahl', 'ᵒ'], ['ᵈ  Dezimalzahl', 'ᵈ'], ['and', 'and'], ['or', 'or'], ['xor', 'xor'], ['xnor', 'xnor'], ['not(', 'not(']],
  recall: [],
};
const CALC_GROUPS = { math: ['math', 'num', 'dms', 'r◂▸p', 'hyp'], stat: ['stats', 'distr'], random: ['random'], complex: ['complex'], constants: ['constants'], convert: ['convert'], base: ['base n'], recall: ['recall'] };
const CALC_DISP = { HEX: '▸Hex', BIN: '▸Bin', OCT: '▸Oct', DEC: '▸Dec', DMS: '▸DMS', POL: '▸r∠θ', RECT: '▸a+bi' };
const CALC_DIG = /^[\dA-F.]$/;

const Calc = {
  line: [], cur: null, hist: [], hsel: -1, second: false, lastKey: null, view: 'home', menu: null,
  vars: Object.fromEntries(CALC_VARS.map(v => [v, 0])), ans: 0, mem: 0, overwrite: false, opDef: null, opEdit: null,
  mode: { ang: 'DEG', fix: -1, not: 'NORM', ans: 'AUTO', mixed: false, cplx: 'REAL', contrast: 0 },
  lists: [[], [], []], stats: null, tbl: { fsrc: '', start: 0, step: 1 }, ev: { src: '', vals: {} },

  /* ---------------------------------------------------------- Zustand */
  st() { if (!Store.ui.calc || typeof Store.ui.calc !== 'object') Store.ui.calc = {}; return Store.ui.calc; },
  get kind() { return this.st().kind === 'simple' ? 'simple' : 'sci'; },
  load() {
    const s = this.st();
    if (s.mode) Object.assign(this.mode, s.mode);
    if (s.vars) for (const v of CALC_VARS) { const x = s.vars[v]; this.vars[v] = CalcEngine.isC(x) ? { re: +x.re || 0, im: +x.im || 0 } : (+x || 0); }
    if (Array.isArray(s.hist)) this.hist = s.hist.filter(h => h && Array.isArray(h.expr) && Array.isArray(h.forms)).slice(-60);
    if (Array.isArray(s.lists)) this.lists = [0, 1, 2].map(k => (s.lists[k] || []).map(Number).filter(isFinite));
    if (typeof s.ans === 'number' || CalcEngine.isC(s.ans)) this.ans = s.ans;
    if (typeof s.mem === 'number') this.mem = s.mem;
    if (Array.isArray(s.opDef)) this.opDef = s.opDef;
    if (s.tbl) Object.assign(this.tbl, s.tbl);
    if (s.ev) Object.assign(this.ev, s.ev);
    this.line = []; this.cur = { slot: this.line, i: 0 };
  },
  save: debounce(function () {
    const s = Calc.st();
    Object.assign(s, { mode: { ...Calc.mode }, vars: { ...Calc.vars }, hist: Calc.hist.slice(-60), lists: Calc.lists, ans: Calc.ans, mem: Calc.mem, opDef: Calc.opDef, tbl: { ...Calc.tbl }, ev: { ...Calc.ev } });
    UiState.saveSoon();
  }, 400),

  /* ---------------------------------------------------------- Fenster */
  toggle() { if (!this.win) this.build(); if (this.win.hidden || this.st().min) this.show(); else this.close(); },
  show() {
    if (!this.win) this.build();
    const s = this.st();
    s.open = true; s.min = false;
    this.win.hidden = false; this.pill.hidden = true;
    this.applyScale();
    this.place();
    this.render();
    this.win.focus({ preventScroll: true });
    UiState.saveSoon();
  },
  close() { if (!this.win) return; this.win.hidden = true; this.pill.hidden = true; this.st().open = false; UiState.saveSoon(); },
  minimize() {
    const s = this.st();
    s.min = true;
    this.win.hidden = true; this.pill.hidden = false;
    this.renderPill();
    this.placePill();
    UiState.saveSoon();
  },
  place() {
    const s = this.st(), W = this.win.offsetWidth || 330, H = this.win.offsetHeight || 620;
    const vh = window.visualViewport ? visualViewport.height : innerHeight;
    // kleines Fenster/Handy: ganz sichtbar (beim Öffnen unten in der Mitte); sonst darf er teilweise hinausragen
    const tight = document.body.classList.contains('lay-phone') || W > innerWidth - 80 || H > vh - 40;
    let x = s.x ?? (tight ? (innerWidth - W) / 2 : innerWidth - W - 40), y = s.y ?? (tight ? vh - H - 6 : 120);
    if (tight) { x = clamp(x, 0, Math.max(0, innerWidth - W)); y = clamp(y, 0, Math.max(0, vh - H)); }
    else {
      x = clamp(x, -W + 80, Math.max(0, innerWidth - 80)); y = clamp(y, 0, Math.max(0, innerHeight - 40));
      if (y + Math.min(H, 200) > innerHeight) y = Math.max(0, innerHeight - Math.min(H, innerHeight));
    }
    this.win.style.left = x + 'px'; this.win.style.top = y + 'px';
  },
  placePill() {
    const s = this.st();
    const x = clamp(s.px ?? (s.x ?? innerWidth - 260) + 20, 0, innerWidth - 120), y = clamp(s.py ?? (s.y ?? 120), 0, innerHeight - 36);
    this.pill.style.left = x + 'px'; this.pill.style.top = y + 'px';
  },
  scale() { const v = +this.st().scale; return v >= 0.5 && v <= 3 ? v : 1; },
  /* Grösse: gewählte Stufe, aber nie grösser als das Fenster (Handy, kleines Fenster) */
  applyScale() {
    if (!this.body) return;
    const vh = (window.visualViewport ? visualViewport.height : innerHeight);
    // zweimal: mit dem Finger bleibt die Kopfzeile gleich gross (--cz), dadurch ändert sich die Höhe leicht mit dem Zoom
    for (let i = 0; i < 2; i++) {
      const cur = parseFloat(this.body.style.zoom) || 1;
      const r = this.body.getBoundingClientRect();
      const W1 = r.width / cur, H1 = r.height / cur;
      const fit = W1 && H1 ? Math.min((innerWidth - 12) / W1, (vh - 12) / H1) : 1;
      this.fitScale = fit;
      const z = Math.max(0.45, Math.min(this.scale(), fit));
      if (Math.abs(z - cur) < 0.002 && i) break;
      this.body.style.zoom = String(z);
      this.win.style.setProperty('--cz', String(z));   // für Knöpfe, die mit dem Finger immer gleich gross bleiben sollen
    }
  },
  build() {
    this.load();
    const w = el('div', { class: 'calc', tabindex: '-1', hidden: true, role: 'dialog', 'aria-label': 'Taschenrechner' });
    w.innerHTML = `<div class="calc-body"><div class="calc-head"><span class="calc-logo">${icon('calc', 14)}</span><span class="calc-name"></span>
        <button class="calc-kind" data-act="kind"></button>
        <button class="calc-hb" data-act="ins" title="Ergebnis in die Seite einfügen (an der Schreibmarke, in die gewählte Zelle oder als neues Textfeld)">${icon('paste', 14)}</button>
        <button class="calc-hb" data-act="hist" title="Rechenverlauf als Text in die Seite einfügen">${icon('versions', 14)}</button>
        <button class="calc-hb" data-act="min" title="Minimieren (2nd on = off)">–</button><button class="calc-hb" data-act="close" title="Schliessen (Alt+R)">×</button></div>
      <div class="calc-lcd"><div class="calc-ind"></div><div class="calc-screen"></div></div>
      <div class="calc-keys"></div></div>
      ${['nw', 'ne', 'sw', 'se'].map(c => `<div class="calc-grip g-${c}" data-c="${c}" title="Ecke ziehen = Grösse ändern · Doppelklick = Standardgrösse · auch Strg+Mausrad"></div>`).join('')}`;
    document.body.append(w);
    this.win = w;
    this.body = w.querySelector('.calc-body');
    this.screen = w.querySelector('.calc-screen');
    this.ind = w.querySelector('.calc-ind');
    this.keysBox = w.querySelector('.calc-keys');
    this.pill = el('div', { class: 'calc-pill', hidden: true, title: 'Rechner wieder öffnen · ziehen = verschieben' });
    document.body.append(this.pill);
    this.buildKeys();
    const head = w.querySelector('.calc-head');
    head.title = 'Ziehen = verschieben · Doppelklick = Standardgrösse';
    head.addEventListener('pointerdown', (e) => { if (!e.target.closest('button')) this.dragStart(e, w, 'x', 'y'); });
    // Doppelklick auf den oberen Rand: Grösse zurück auf 100 % (Ecke oben links bleibt stehen)
    head.addEventListener('dblclick', (e) => { if (!e.target.closest('button')) this.resetScale(); });
    w.addEventListener('click', (e) => {
      const b = e.target.closest('.calc-hb, .calc-kind');
      if (!b) return;
      const a = b.dataset.act;
      if (a === 'min') this.minimize(); else if (a === 'close') this.close(); else if (a === 'ins') this.insertResult(); else if (a === 'hist') this.insertHistory(); else if (a === 'kind') this.setKind(this.kind === 'sci' ? 'simple' : 'sci');
    });
    this.keysBox.addEventListener('click', (e) => { const b = e.target.closest('[data-k]'); if (b) this.press(b.dataset.k); });
    w.addEventListener('keydown', (e) => this.onKey(e));
    w.addEventListener('mousedown', (e) => { if (!e.target.closest('input, select, textarea')) { e.preventDefault(); w.focus({ preventScroll: true }); } });
    w.addEventListener('wheel', (e) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      this.st().scale = Math.round(clamp(this.scale() * (e.deltaY < 0 ? 1.08 : 1 / 1.08), 0.6, 2.2) * 100) / 100;
      this.applyScale(); UiState.saveSoon();
    }, { passive: false });
    for (const grip of w.querySelectorAll('.calc-grip')) {
      grip.addEventListener('pointerdown', (e) => this.gripStart(e, grip.dataset.c));
      grip.addEventListener('dblclick', () => this.resetScale());
    }
    this.screen.addEventListener('click', (e) => this.onScreenClick(e));
    this.screen.addEventListener('input', (e) => { if (e.target.classList.contains('calc-li')) this.readLists(); if (e.target.matches('.calc-evx, .calc-evv')) this.readEval(false); });
    this.screen.addEventListener('change', (e) => { if (e.target.matches('.calc-tf, .calc-ts, .calc-tst')) { this.readTable(); this.render(); } if (e.target.matches('.calc-evx')) { this.readEval(true); } });
    this.pill.addEventListener('pointerdown', (e) => this.dragStart(e, this.pill, 'px', 'py', () => this.show()));
    window.addEventListener('resize', () => { if (!this.win.hidden) this.place(); if (!this.pill.hidden) this.placePill(); });
  },
  dragStart(e, elx, kx, ky, onClick) {
    e.preventDefault();
    const r = elx.getBoundingClientRect(), sx = e.clientX, sy = e.clientY;
    let moved = false;
    const mv = (ev) => {
      if (!moved && Math.hypot(ev.clientX - sx, ev.clientY - sy) < 4) return;
      moved = true;
      const x = clamp(r.left + ev.clientX - sx, -r.width + 60, innerWidth - 60), y = clamp(r.top + ev.clientY - sy, 0, innerHeight - 30);
      elx.style.left = x + 'px'; elx.style.top = y + 'px';
      this.st()[kx] = Math.round(x); this.st()[ky] = Math.round(y);
    };
    const up = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); if (moved) UiState.saveSoon(); else if (onClick) onClick(); };
    addEventListener('pointermove', mv); addEventListener('pointerup', up);
  },
  /* Grösse: an einer der vier Ecken ziehen – der ganze Rechner wird gleichmässig grösser/kleiner,
   * die gegenüberliegende Ecke bleibt dabei stehen (wie bei einem Fenster) */
  gripStart(e, corner = 'se') {
    e.preventDefault(); e.stopPropagation();
    const r = this.win.getBoundingClientRect(), sx = e.clientX, sy = e.clientY, s0 = this.scale();
    const west = corner[1] === 'w', north = corner[0] === 'n';
    const mv = (ev) => {
      const gx = (ev.clientX - sx) * (west ? -1 : 1), gy = (ev.clientY - sy) * (north ? -1 : 1);
      const k = ((r.width + gx) / r.width + (r.height + gy) / r.height) / 2;
      this.st().scale = Math.round(clamp(s0 * k, 0.6, 2.2) * 100) / 100;
      this.applyScale();
      this.keepCorner(r, west, north);
    };
    const up = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); this.place(); UiState.saveSoon(); };
    addEventListener('pointermove', mv); addEventListener('pointerup', up);
  },
  /* nach einer Grössenänderung: die festgehaltene Ecke (gegenüber der gezogenen) an ihrem Platz lassen */
  keepCorner(r, west, north) {
    const n = this.win.getBoundingClientRect();
    const x = west ? r.right - n.width : r.left, y = north ? r.bottom - n.height : r.top;
    this.win.style.left = x + 'px'; this.win.style.top = y + 'px';
    this.st().x = Math.round(x); this.st().y = Math.round(y);
  },
  resetScale() {
    if (this.scale() === 1) return;
    const r = this.win.getBoundingClientRect();
    this.st().scale = 1;
    this.applyScale();
    this.keepCorner(r, false, false);
    this.place();
    UiState.saveSoon();
    UI.toast('Rechner: Standardgrösse');
  },
  setKind(k) {
    this.st().kind = k;
    this.second = false; this.view = 'home'; this.error = null; this.opEdit = null;
    this.buildKeys();
    this.render();
    this.place();
    UiState.saveSoon();
  },

  /* ---------------------------------------------------------- Tastenfeld */
  buildKeys() {
    const kind = this.kind, box = this.keysBox;
    this.win.classList.toggle('simple', kind === 'simple');
    this.win.classList.toggle('sci', kind === 'sci');
    this.win.querySelector('.calc-name').textContent = kind === 'sci' ? 'TI-30X Plus' : 'Standard';
    const kb = this.win.querySelector('.calc-kind');
    kb.innerHTML = kind === 'sci' ? '⇄ Standard' : '⇄ Wissenschaftlich';
    kb.title = kind === 'sci' ? 'Zum einfachen Taschenrechner wechseln (wie Handy/Windows „Standard“)' : 'Zum wissenschaftlichen Rechner wechseln (TI-30X Plus MathPrint)';
    box.innerHTML = '';
    this.keyDef = {};
    for (const [id, main, sec, cls, title] of CALC_KEYS[kind]) {
      if (id === 'pad') {
        const pad = el('div', { class: 'ck-pad' });
        pad.innerHTML = ['up:▲:nach oben (Zähler, Verlauf)', 'down:▼:nach unten (Nenner, Verlauf)', 'left:◄:Schreibmarke nach links', 'right:►:Schreibmarke nach rechts']
          .map(s => { const [k, sym, t] = s.split(':'); return `<button type="button" class="ck-pd ck-${k}" data-k="${k}" title="${t}"><span>${sym}</span></button>`; }).join('');
        box.append(pad);
        continue;
      }
      this.keyDef[id] = { main, sec, title };
      const cell = el('div', { class: 'ckw' });
      cell.innerHTML = `<span class="ck-2">${sec}</span><button type="button" class="ck ${cls || ''}" data-k="${id}" title="${escapeHtml(title || '')}"><span class="ck-m">${main}</span></button>`;
      box.append(cell);
    }
    this._keysSec = null;
    this.renderKeys();
  },
  /* 2nd aktiv: Zweitfunktion wird die Hauptbeschriftung, die normale wandert klein darüber (Tasten ohne 2nd werden blass) */
  renderKeys() {
    const sec = this.second && this.kind === 'sci';
    if (this._keysSec === sec) return;
    this._keysSec = sec;
    this.keysBox.classList.toggle('second', sec);
    for (const cell of this.keysBox.querySelectorAll('.ckw')) {
      const b = cell.querySelector('.ck'), d = this.keyDef[b.dataset.k];
      if (!d) continue;
      const swap = sec && !!d.sec;
      b.classList.toggle('ck-sw', swap);
      cell.classList.toggle('dim', sec && !d.sec && b.dataset.k !== '2nd');
      b.querySelector('.ck-m').innerHTML = swap ? d.sec : d.main;
      cell.querySelector('.ck-2').innerHTML = swap ? d.main : d.sec;
      const txt = (swap ? d.sec : d.main).replace(/<[^>]+>/g, '');
      b.classList.toggle('long', swap && txt.length > 5);
      b.classList.toggle('mid', swap && txt.length > 1 && txt.length <= 5);
    }
  },

  /* ---------------------------------------------------------- Eingabe-Modell (Vorlagen) */
  parentOf(slot, list = this.line) {
    for (let i = 0; i < list.length; i++) {
      const t = list[i];
      if (typeof t !== 'object') continue;
      for (const k of CALC_SLOTS[t.t]) {
        if (t[k] === slot) return { tpl: t, key: k, owner: list, idx: i };
        const r = this.parentOf(slot, t[k]);
        if (r) return r;
      }
    }
    return null;
  },
  ins(tok) {
    const c = this.cur;
    if (this.overwrite && c.i < c.slot.length && typeof c.slot[c.i] === 'string') c.slot.splice(c.i, 1, tok);
    else c.slot.splice(c.i, 0, tok);
    c.i++;
  },
  /* Beginn des Operanden direkt vor Position i (Zahl, Variable, Klammergruppe, Vorlage, Ans, Konstante) */
  operandStart(slot, i) {
    if (i <= 0) return i;
    const t = slot[i - 1];
    if (typeof t === 'string' && CALC_DIG.test(t)) { let j = i; while (j > 0 && typeof slot[j - 1] === 'string' && CALC_DIG.test(slot[j - 1])) j--; return j; }
    if (t === ')') {
      let d = 0;
      for (let k = i - 1; k >= 0; k--) { const x = slot[k]; if (x === ')') d++; else if (typeof x === 'string' && x.endsWith('(')) { d--; if (d === 0) return k; } }
      return i;
    }
    if (typeof t === 'object') return t.t === 'pow' ? Math.min(i - 1, this.operandStart(slot, i - 1)) : i - 1;
    if (['!', '%', '⁻¹', '°', 'ʳ', 'ᵍ', 'ʰ', 'ᵇ', 'ᵒ', 'ᵈ'].includes(t)) { const j = this.operandStart(slot, i - 1); return j < i - 1 ? j : i; }
    if (['Ans', 'π', 'e', 'i', ...CALC_VARS].includes(t) || (typeof t === 'string' && t.startsWith('k:'))) return i - 1;
    return i;
  },
  /* Vorlage einfügen; take: Operand vor der Schreibmarke wird das erste Feld (Bruch: Zähler) */
  insTpl(t, take) {
    const tpl = { t };
    for (const k of CALC_SLOTS[t]) tpl[k] = [];
    const c = this.cur;
    if (take) {
      const j = this.operandStart(c.slot, c.i);
      if (j < c.i) {
        let part = c.slot.splice(j, c.i - j);
        // ganze Klammergruppe ohne Funktion: Klammern weglassen ((2+3)/4 → Zähler 2+3)
        if (part[0] === '(' && part[part.length - 1] === ')') part = part.slice(1, -1);
        tpl[CALC_SLOTS[t][0]] = part; c.i = j; c.slot.splice(c.i, 0, tpl);
        this.cur = { slot: tpl[CALC_SLOTS[t][1]], i: 0 };
        return tpl;
      }
    }
    c.slot.splice(c.i, 0, tpl);
    this.cur = { slot: tpl[CALC_SLOTS[t][0]], i: 0 };
    return tpl;
  },
  right() {
    const { slot, i } = this.cur;
    if (i < slot.length) { const t = slot[i]; if (typeof t === 'object') this.cur = { slot: t[CALC_SLOTS[t.t][0]], i: 0 }; else this.cur.i++; return true; }
    const p = this.parentOf(slot);
    if (!p) return false;
    const ks = CALC_SLOTS[p.tpl.t], k = ks.indexOf(p.key);
    this.cur = k + 1 < ks.length ? { slot: p.tpl[ks[k + 1]], i: 0 } : { slot: p.owner, i: p.idx + 1 };
    return true;
  },
  left() {
    const { slot, i } = this.cur;
    if (i > 0) { const t = slot[i - 1]; if (typeof t === 'object') { const ks = CALC_SLOTS[t.t], s = t[ks[ks.length - 1]]; this.cur = { slot: s, i: s.length }; } else this.cur.i--; return true; }
    const p = this.parentOf(slot);
    if (!p) return false;
    const ks = CALC_SLOTS[p.tpl.t], k = ks.indexOf(p.key);
    this.cur = k > 0 ? { slot: p.tpl[ks[k - 1]], i: p.tpl[ks[k - 1]].length } : { slot: p.owner, i: p.idx };
    return true;
  },
  vert(dir) {
    // im Bruch zwischen Zähler und Nenner wechseln (gemischte Zahl: ganze Zahl ↔ Bruch)
    let s = this.cur.slot;
    for (let p = this.parentOf(s); p; p = this.parentOf(p.owner)) {
      if (p.tpl.t === 'frac' || p.tpl.t === 'mixed') {
        if (dir < 0 && p.key === 'b') { this.cur = { slot: p.tpl.a, i: Math.min(this.cur.i, p.tpl.a.length) }; return true; }
        if (dir > 0 && (p.key === 'a' || p.key === 'w')) { this.cur = { slot: p.tpl.b, i: Math.min(this.cur.i, p.tpl.b.length) }; return true; }
      }
      if (p.tpl.t === 'pow' && dir > 0) { this.cur = { slot: p.owner, i: p.idx + 1 }; return true; }
      if (p.tpl.t === 'sum' || p.tpl.t === 'prod') {
        if (dir < 0 && p.key === 'lo') { this.cur = { slot: p.tpl.hi, i: p.tpl.hi.length }; return true; }
        if (dir > 0 && p.key === 'hi') { this.cur = { slot: p.tpl.lo, i: p.tpl.lo.length }; return true; }
      }
      s = p.owner;
    }
    return false;
  },
  back() {
    const { slot, i } = this.cur;
    if (i > 0) {
      const t = slot[i - 1];
      if (typeof t === 'object') { const flat = CALC_SLOTS[t.t].flatMap(k => t[k]); slot.splice(i - 1, 1, ...flat); this.cur.i = i - 1 + flat.length; }
      else { slot.splice(i - 1, 1); this.cur.i--; }
      return;
    }
    const p = this.parentOf(slot);
    if (!p) return;
    const ks = CALC_SLOTS[p.tpl.t];
    const before = ks.slice(0, ks.indexOf(p.key)).reduce((n, k) => n + p.tpl[k].length, 0);
    const flat = ks.flatMap(k => p.tpl[k]);
    p.owner.splice(p.idx, 1, ...flat);
    this.cur = { slot: p.owner, i: p.idx + before };
  },
  /* delete wie TI: Zeichen an der Schreibmarke (rechts) löschen, am Ende das Zeichen davor */
  delKey() {
    const { slot, i } = this.cur;
    if (i < slot.length) {
      const t = slot[i];
      if (typeof t === 'object') { const flat = CALC_SLOTS[t.t].flatMap(k => t[k]); slot.splice(i, 1, ...flat); }
      else slot.splice(i, 1);
      return;
    }
    this.back();
  },
  clone(x) { return JSON.parse(JSON.stringify(x)); },
  isEmpty() { return !this.line.length; },
  ser(slot) {
    let s = '';
    for (const t of slot) {
      if (typeof t === 'string') s += this.tokSer(t);
      else switch (t.t) {
        case 'frac': s += `((${this.ser(t.a)})/(${this.ser(t.b)}))`; break;
        case 'mixed': { const w = this.ser(t.w) || '0'; s += `((${w})+(${/^[-~]/.test(w) ? '-' : ''}(${this.ser(t.a)})/(${this.ser(t.b)})))`; break; }
        case 'sqrt': s += `sqrt(${this.ser(t.a)})`; break;
        case 'root': s += `root(${this.ser(t.n)},${this.ser(t.a)})`; break;
        case 'pow': s += `^(${this.ser(t.a)})`; break;
        case 'exp': s += `exp(${this.ser(t.a)})`; break;
        case 'ten': s += `ten(${this.ser(t.a)})`; break;
        case 'logb': s += `logb(${this.ser(t.b)},${this.ser(t.a)})`; break;
        case 'abs': s += `abs(${this.ser(t.a)})`; break;
        case 'sum': case 'prod': s += this.serSum(t); break;
      }
    }
    return s;
  },
  /* Σ / ∏ über x = lo … hi (wie TI sum( / prod( ): Wert vorab ausrechnen, exakt als Bruch, wenn möglich */
  serSum(t) {
    const env = this.env(true);
    const lo = CalcEngine.evaluate(this.ser(t.lo) || 'x', env).v, hi = CalcEngine.evaluate(this.ser(t.hi) || 'x', env).v;
    if (CalcEngine.isC(lo) || CalcEngine.isC(hi) || !Number.isInteger(+(+lo).toPrecision(12)) || !Number.isInteger(+(+hi).toPrecision(12))) throw new CalcEngine.CErr('Grenzen müssen ganze Zahlen sein', 0);
    const a = Math.round(lo), b = Math.round(hi);
    if (b - a > 100000) throw new CalcEngine.CErr('Zu viele Glieder (höchstens 100 000)', 0);
    const inner = this.ser(t.a);
    if (!inner) throw new CalcEngine.CErr('Syntax', 0);
    let acc = t.t === 'sum' ? 0 : 1;
    for (let x = a; x <= b; x++) {
      const v = CalcEngine.evaluate(inner, { ...env, vars: { ...env.vars, x } }).v;
      if (CalcEngine.isC(v)) throw new CalcEngine.CErr('Nicht reell', 0);
      acc = t.t === 'sum' ? acc + v : acc * v;
    }
    if (!isFinite(acc)) throw new CalcEngine.CErr('Überlauf', 0);
    const f = Number.isInteger(acc) ? null : CalcEngine.frac(acc, 10000);
    if (f && f.d !== 1 && Math.abs(f.n / f.d - acc) <= 1e-12 * Math.max(1, Math.abs(acc))) return `((${f.n})/(${f.d}))`;
    const num = (v) => { const a2 = Math.abs(v); if (a2 !== 0 && (a2 >= 1e15 || a2 < 1e-9)) { const [m, e] = a2.toExponential(14).split('e'); return `${m}E${+e}`; } return String(+a2.toPrecision(15)); };
    return acc < 0 ? `(-${num(acc)})` : `(${num(acc)})`;
  },
  SER: { '×': '*', '÷': '/', '−': '-', '(−)': '~', '×10ⁿ': 'E', 'sto→': '→', and: '&', or: '¦', xor: '⊕', xnor: '⊙' },
  FN: { 'sin⁻¹(': 'asin(', 'cos⁻¹(': 'acos(', 'tan⁻¹(': 'atan(', 'sinh⁻¹(': 'asinh(', 'cosh⁻¹(': 'acosh(', 'tanh⁻¹(': 'atanh(', 'R▸Pr(': 'rpr(', 'R▸Pθ(': 'rpt(', 'P▸Rx(': 'prx(', 'P▸Ry(': 'pry(' },
  tokSer(t) {
    if (this.SER[t] !== undefined) return this.SER[t];
    if (t.startsWith('k:')) return '\u0001' + t.slice(2) + '\u0002';
    if (t.startsWith('cv:')) return '\u0003' + t.slice(3) + '\u0004';
    if (t.startsWith('disp:')) return '\u0005' + t.slice(5) + '\u0006';
    if (this.FN[t]) return this.FN[t];
    if (/^[a-zA-Z]+\($/.test(t)) return t.toLowerCase();
    return t;
  },

  /* ---------------------------------------------------------- Tasten */
  press(k) {
    const sec = this.second;
    this.second = false;
    const last = this.lastKey;
    this.lastKey = k;
    if (k === '2nd') { this.second = !sec; this.lastKey = null; this.render(); return; }
    if (this.kind === 'simple') { this.pressSimple(k); this.render(); return; }
    if (this.view !== 'home') { if (this.menuKey(k, sec)) { this.render(); return; } }
    if (this.error) { this.error = null; if (['clear', 'on', 'left', 'right', 'del'].includes(k)) { this.render(); return; } }
    const startOp = (op) => { if (this.autoAns()) this.ins('Ans'); this.ins(op); };
    const cycle = (list) => {
      // Mehrfachtaste: nochmals drücken ersetzt das eben Eingefügte durch das nächste
      const c = this.cur;
      if (last === k && this._cyc && this._cyc.slot === c.slot && this._cyc.i === c.i && this._cyc.k === k) {
        const ov = this.overwrite; this.overwrite = false;
        this.cur = this._cyc.at ? { ...this._cyc.at } : this.cur;
        this.removeLast(this._cyc);
        const n = (this._cyc.n + 1) % list.length;
        list[n]();
        this.overwrite = ov;
        this._cyc = { slot: this.cur.slot, i: this.cur.i, n, k, at: this._cyc.at, owner: this._cyc.owner, pos: this._cyc.pos };
        return;
      }
      const at = { slot: c.slot, i: c.i };
      list[0]();
      this._cyc = { slot: this.cur.slot, i: this.cur.i, n: 0, k, at, owner: at.slot, pos: at.i };
    };
    const tok = (x) => () => this.ins(x);
    const tpl = (t) => () => this.insTpl(t);
    if (!['up', 'down', 'enter'].includes(k)) this.hsel = -1;
    const hex = { 4: 'D', 5: 'E', 6: 'F', 1: 'A', 2: 'B', 3: 'C' };
    switch (k) {
      case 'mode': if (sec) { this.view = 'home'; break; } this.view = 'mode'; this.menuSel = 0; break;
      case 'del': if (sec) { this.overwrite = !this.overwrite; break; } this.delKey(); break;
      case 'left': this.left(); break;
      case 'right': this.right(); break;
      case 'up': if (!this.vert(-1)) this.histMove(-1); break;
      case 'down': if (!this.vert(1)) this.histMove(1); break;
      case 'lnlog': cycle([tok('ln('), tok('log(')]); break;
      case 'math': this.openMenu('math'); break;
      case 'data': if (sec) this.openMenu('stat'); else this.view = 'data'; break;
      case 'exp10': cycle([tpl('exp'), tpl('ten')]); break;
      case 'EE': this.ins('×10ⁿ'); break;
      case 'prb': if (sec) { this.openMenu('random'); break; } if (this.autoAns() && last !== 'prb') this.ins('Ans'); cycle([tok('!'), tok('nCr'), tok('nPr')]); break;
      case 'table': if (sec) { this.view = 'eval'; break; } this.view = 'table'; break;
      case 'clear': case 'on':
        if (sec && k === 'on') { this.minimize(); break; }
        if (this.opEdit) { this.cancelOpEdit(); break; }
        if (this.isEmpty() && k === 'clear') this.cleared = this.hist.length;
        this.line.length = 0; this.cur = { slot: this.line, i: 0 };
        break;
      case 'pi': if (sec) { this.openMenu('complex'); break; } cycle([tok('π'), tok('e'), tok('i')]); break;
      case 'sin': case 'cos': case 'tan': cycle([tok(k + '('), tok(k + '⁻¹(')]); break;
      case '÷': if (sec) { startOp('%'); break; } startOp('÷'); break;
      case 'xpow': if (sec) { this.insTpl('root'); break; } if (this.autoAns()) this.ins('Ans'); this.insTpl('pow'); break;
      case 'n/d': if (sec) { const t = this.insTpl('frac'); t.a.push('1'); this.cur = { slot: t.b, i: 0 }; break; } this.insTpl('frac', true); break;
      case '(': if (sec) { this.openMenu('constants'); break; } this.ins('('); break;
      case ')': if (sec) { this.applyOp(); break; } this.ins(')'); break;
      case '×': if (sec) { this.startOpEdit(); break; } startOp('×'); break;
      case 'x²': if (sec) { this.insTpl('sqrt'); break; } if (this.autoAns()) this.ins('Ans'); { const t = this.insTpl('pow'); t.a.push('2'); this.cur = this.locateAfter(t); } break;
      case '7': if (sec) { this.insTpl('mixed', true); break; } this.ins('7'); break;
      case '8': if (sec) { this.openMenu('convert'); break; } this.ins('8'); break;
      case '9': if (sec) { this.openMenu('base'); break; } this.ins('9'); break;
      case '−': if (sec) { this.contrast(-1); break; } startOp('−'); break;
      case '+': if (sec) { this.contrast(1); break; } startOp('+'); break;
      case 'xyzt': if (sec) { this.view = 'confirm'; this.confirmAct = 'clrvar'; break; } cycle(CALC_VARS.map(v => tok(v))); break;
      case 'sto': if (sec) { this.openMenu('recall'); break; } if (this.autoAns()) this.ins('Ans'); this.ins('sto→'); break;
      case 'tog': this.toggleResult(sec ? 'fd' : undefined); break;
      case '0': if (sec) { this.view = 'confirm'; this.confirmAct = 'reset'; break; } this.ins('0'); break;
      case '.': this.ins(sec ? ',' : '.'); break;
      case 'neg': this.ins(sec ? 'Ans' : '(−)'); break;
      case 'enter': if (this.opEdit) this.finishOpEdit(); else this.enter(); break;
      default:
        if (/^[1-6]$/.test(k) && sec) this.ins(hex[k]);
        else if (/^[0-9]$/.test(k)) this.ins(k);
    }
    this.render();
  },
  /* Mehrfachtaste: das zuletzt Eingefügte (Zeichen oder Vorlage) an der gemerkten Stelle entfernen */
  removeLast(cy) {
    const slot = cy.owner;
    if (slot && slot.length > cy.pos) slot.splice(cy.pos, 1);
    this.cur = { slot, i: cy.pos };
  },
  autoAns() { return this.isEmpty() && this.hist.length > 0 && !this.opEdit; },
  locateAfter(tpl) {
    const p = this.parentOf(tpl.a);
    return p ? { slot: p.owner, i: p.idx + 1 } : this.cur;
  },
  contrast(d) { this.mode.contrast = clamp((this.mode.contrast || 0) + d, -4, 4); this.save(); },
  openMenu(group) { this.view = 'menu'; this.menu = { group, tab: 0, sel: 0 }; },
  reset() {
    this.line.length = 0; this.cur = { slot: this.line, i: 0 };
    this.hist = []; this.ans = 0; this.cleared = 0; this.mem = 0; this.opDef = null; this.overwrite = false;
    for (const v of CALC_VARS) this.vars[v] = 0;
    this.mode = { ang: 'DEG', fix: -1, not: 'NORM', ans: 'AUTO', mixed: false, cplx: 'REAL', contrast: 0 };
    this.save();
    UI.toast('Rechner zurückgesetzt');
  },
  histMove(d) {
    const n = this.hist.length;
    if (!n) return;
    if (this.hsel < 0) this.hsel = d < 0 ? n - 1 : -1;
    else this.hsel = this.hsel + d;
    if (this.hsel >= n) this.hsel = -1;
    if (this.hsel < -1) this.hsel = 0;
  },

  /* ---------------------------------------------------------- op / set op */
  startOpEdit() {
    this.opEdit = { saved: this.line, cur: this.cur };
    this.line = this.opDef ? this.clone(this.opDef) : [];
    this.cur = { slot: this.line, i: this.line.length };
  },
  cancelOpEdit() { const o = this.opEdit; this.opEdit = null; this.line = o.saved; this.cur = { slot: this.line, i: this.line.length }; },
  finishOpEdit() {
    const def = this.clone(this.line);
    this.cancelOpEdit();
    if (!def.length) { this.opDef = null; UI.toast('op gelöscht'); this.save(); return; }
    this.opDef = def; this.opCount = 0; this.opBase = null;
    this.save();
    UI.toast('op = ' + this.exprText(def) + ' gespeichert – 2nd ) wendet sie an');
  },
  applyOp() {
    if (!this.opDef) { this.error = { msg: 'Keine op festgelegt (2nd × = set op)' }; return; }
    let base;
    const lastH = this.hist[this.hist.length - 1];
    if (!this.isEmpty()) { base = this.clone(this.line); this.opCount = 1; }
    else if (lastH && lastH.opN && this.opCount) { base = this.valueTokens(lastH); this.opCount++; }
    else { base = lastH ? this.valueTokens(lastH) : ['0']; this.opCount = 1; }
    this.line.length = 0; this.cur = { slot: this.line, i: 0 };
    for (const t of base) this.ins(t);
    const needParen = base.length > 1 && !base.every(t => typeof t === 'string' && CALC_DIG.test(t));
    if (needParen) { this.line.unshift('('); this.line.push(')'); }
    this.line.push(...this.clone(this.opDef));
    this.cur = { slot: this.line, i: this.line.length };
    this.enter();
    const h = this.hist[this.hist.length - 1];
    if (h && !this.error) { h.opN = this.opCount; this.save(); }
  },
  valueTokens(h) {
    const keep = this.line, kc = this.cur;
    this.line = []; this.cur = { slot: this.line, i: 0 };
    this.insertValue(h);
    const out = this.line;
    this.line = keep; this.cur = kc;
    return out;
  },

  /* ---------------------------------------------------------- einfacher Rechner */
  pressSimple(k) {
    if (this.error) { this.error = null; if (k === 'C' || k === 'CE' || k === '⌫') return; }
    const lastH = this.hist[this.hist.length - 1];
    // nach einem Ergebnis geht es mit dem Ergebnis weiter (wie Windows / Handy)
    const startOp = (op) => { if (this.isEmpty() && lastH) this.insertValue(lastH); this.ins(op); };
    const operand = () => {
      if (this.isEmpty() && lastH) this.insertValue(lastH);
      this.cur = { slot: this.line, i: this.line.length };
      const j = this.operandStart(this.line, this.line.length);
      return j;
    };
    switch (k) {
      case 'C': this.line.length = 0; this.cur = { slot: this.line, i: 0 }; break;
      case 'CE': { const j = this.operandStart(this.line, this.line.length); this.line.splice(j < this.line.length ? j : 0); if (this.line[this.line.length - 1] === '(−)') this.line.pop(); this.cur = { slot: this.line, i: this.line.length }; break; }
      case '⌫': this.back(); break;
      case '%': if (this.isEmpty() && lastH) this.insertValue(lastH); this.ins('%'); break;
      case 'inv': { const j = operand(); if (j >= this.line.length) break; const part = this.line.splice(j); this.line.push({ t: 'frac', a: ['1'], b: part }); this.cur = { slot: this.line, i: this.line.length }; break; }
      case 'sq': { const j = operand(); if (j >= this.line.length) break; this.line.push({ t: 'pow', a: ['2'] }); this.cur = { slot: this.line, i: this.line.length }; break; }
      case 'sqrt': { const j = operand(); if (j >= this.line.length) { this.insTpl('sqrt'); break; } const part = this.line.splice(j); this.line.push({ t: 'sqrt', a: part[0] === '(' && part[part.length - 1] === ')' ? part.slice(1, -1) : part }); this.cur = { slot: this.line, i: this.line.length }; break; }
      case 'pm': {
        if (this.isEmpty() && lastH) this.insertValue(lastH);
        this.cur = { slot: this.line, i: this.line.length };
        const j = this.operandStart(this.line, this.line.length);
        if (j >= this.line.length) { this.ins('(−)'); break; }
        if (this.line[j - 1] === '(−)') this.line.splice(j - 1, 1); else this.line.splice(j, 0, '(−)');
        this.cur = { slot: this.line, i: this.line.length };
        break;
      }
      case 'MC': this.mem = 0; this.save(); break;
      case 'MR': this.insertNumber(this.mem); break;
      case 'M+': case 'M−': {
        const v = this.currentValue();
        if (v === null) break;
        this.mem = +(this.mem + (k === 'M+' ? v : -v)).toPrecision(13);
        this.save();
        UI.toast('Speicher M = ' + this.plainNum(this.mem));
        break;
      }
      case '÷': case '×': case '−': case '+': startOp(k); break;
      case 'enter': this.enter(); break;
      default:
        if (/^[0-9.]$/.test(k)) this.ins(k);
        else if (k === '(' || k === ')') this.ins(k);
    }
  },
  /* aktueller Wert: Eingabe (falls rechenbar) sonst letztes Ergebnis */
  currentValue() {
    if (!this.isEmpty()) { try { const v = CalcEngine.evaluate(this.ser(this.line), this.env(true)).v; return CalcEngine.isC(v) ? null : v; } catch (e) { return null; } }
    const h = this.hist[this.hist.length - 1];
    return h && !CalcEngine.isC(h.val) ? h.val : null;
  },
  env(quiet) { return { ang: this.mode.ang, vars: quiet ? { ...this.vars } : this.vars, ans: this.ans, cplx: this.mode.cplx, pocket: this.kind === 'simple', f: (x) => { const fn = this.tableFn(); if (!fn) throw new CalcEngine.CErr('f(x) in table festlegen', 0); return fn(x); } }; },

  /* ---------------------------------------------------------- Rechnen */
  enter(approx) {
    // Verlaufseintrag gewählt: Enter fügt ihn ein (wie TI)
    if (this.hsel >= 0 && this.hsel < this.hist.length) {
      const h = this.hist[this.hsel];
      this.hsel = -1;
      this.insertTree(this.clone(h.expr));
      return;
    }
    if (this.isEmpty()) {
      if (!this.hist.length) return;
      const last = this.hist[this.hist.length - 1];
      if (this.kind === 'simple') {
        // = nochmals: letzte Operation wiederholen (2 + 3 = = → 8)
        const e = last.expr;
        let k = -1;
        for (let j = e.length - 1; j > 0; j--) if (['+', '−', '×', '÷'].includes(e[j])) { k = j; break; }
        if (k < 0) return;
        this.insertValue(last);
        this.line.push(...this.clone(e.slice(k)));
      } else this.line.push(...this.clone(last.expr)); // Enter auf leerer Zeile: letzte Rechnung wiederholen
    }
    const src = this.ser(this.line);
    const env = this.env(false);
    try {
      const r = CalcEngine.evaluate(src, env);
      let v = r.v;
      if (CalcEngine.isC(v)) v = { re: +v.re.toPrecision(13), im: +v.im.toPrecision(13) };
      else { if (Math.abs(v) < 1e-300) v = 0; v = +v.toPrecision(13); }
      const entry = { expr: this.clone(this.line), val: v, forms: this.forms(v, r, approx || this.kind === 'simple'), f: 0, stored: env.stored || null };
      if (r.disp) entry.disp = r.disp;
      this.hist.push(entry);
      if (this.hist.length > 60) this.hist.shift();
      this.ans = v;
      this.line.length = 0; this.cur = { slot: this.line, i: 0 };
      this.cleared = 0;
      this.save();
      this.renderPill();
    } catch (e) {
      if (e instanceof CalcEngine.CErr) { this.error = { msg: e.message }; }
      else { console.error(e); this.error = { msg: 'Fehler' }; }
    }
  },
  /* mögliche Darstellungen eines Ergebnisses: exakte zuerst (wie MathPrint), Dezimal immer */
  forms(v, r, approx) {
    if (CalcEngine.isC(v)) return [{ k: 'cplx' }];
    const out = [];
    const dec = { k: 'dec' };
    if (approx || this.mode.ans === 'DEC' || !isFinite(v) || r.disp || r.base) return [dec];
    if (Number.isInteger(v) || Math.abs(v) >= 1e10) return [dec];
    const f = r.dec ? null : CalcEngine.frac(v, 10000);
    if (f && f.d !== 1) out.push({ k: 'frac', n: f.n, d: f.d });
    if (!f && !r.dec && r.root) { const s = CalcEngine.surd(v); if (s) out.push({ k: 'surd', ...s }); }
    if (!r.dec && (r.pi || (r.invTrig && this.mode.ang === 'RAD'))) { const p = CalcEngine.piForm(v); if (p && !out.length) out.push({ k: 'pi', n: p.n, d: p.d }); }
    out.push(dec);
    return out;
  },
  /* ◄►≈: exakt ↔ Dezimal; f◄►d: Bruch ↔ Dezimal – auch für Dezimal-Eingaben (0.75 → 3/4) */
  toggleResult(kind) {
    const h = this.hist[this.hist.length - 1];
    if (!h || CalcEngine.isC(h.val) || h.note) return;
    const cur = h.forms[h.f] || { k: 'dec' };
    if (kind === 'fd') {
      if (!h.forms.some(x => x.k === 'frac')) { const f = CalcEngine.frac(h.val, 10000); if (f && f.d !== 1) h.forms.unshift({ k: 'frac', n: f.n, d: f.d }); }
      const fi = h.forms.findIndex(x => x.k === 'frac');
      if (fi < 0) { this.error = { msg: 'Kein Bruch mit Nenner ≤ 10000' }; return; }
      h.f = cur.k === 'frac' ? h.forms.findIndex(x => x.k === 'dec') : fi;
      this.save();
      return;
    }
    if (h.forms.length < 2) {
      const f = CalcEngine.frac(h.val, 10000), s = CalcEngine.surd(h.val), p = CalcEngine.piForm(h.val);
      if (f && f.d !== 1) h.forms.unshift({ k: 'frac', n: f.n, d: f.d });
      else if (s) h.forms.unshift({ k: 'surd', ...s });
      else if (p) h.forms.unshift({ k: 'pi', n: p.n, d: p.d });
      if (h.forms.length < 2) return;
      h.f = h.forms.findIndex(x => x !== cur);   // gleich die neue Darstellung zeigen
    } else h.f = (h.f + 1) % h.forms.length;
    this.save();
  },

  /* ---------------------------------------------------------- Anzeige (MathPrint) */
  numHtml(v) {
    if (!isFinite(v)) return 'Überlauf';
    const m = this.mode;
    const a = Math.abs(v);
    const sci = m.not !== 'NORM' || (a !== 0 && (a >= 1e10 || a < 1e-9)) || (m.fix < 0 && /e/.test(String(+v.toPrecision(10))));
    const neg = (s) => s.replace(/^-/, '<span class="cn">−</span>');
    if (sci) {
      let e = a === 0 ? 0 : Math.floor(Math.log10(a));
      if (m.not === 'ENG') e = Math.floor(e / 3) * 3;
      let mant = v / Math.pow(10, e);
      mant = m.fix >= 0 ? +mant.toFixed(m.fix) : +mant.toPrecision(10);
      if (Math.abs(mant) >= 10 && m.not !== 'ENG') { mant /= 10; e++; }
      const ms = m.fix >= 0 ? mant.toFixed(m.fix) : String(mant);
      return neg(ms) + `<span class="cx">×10<sup>${e < 0 ? '−' + -e : e}</sup></span>`;
    }
    let s = m.fix >= 0 ? v.toFixed(m.fix) : String(+v.toPrecision(10));
    if (/e/.test(s)) s = v.toFixed(12).replace(/\.?0+$/, '');
    return neg(s);
  },
  angDeg(v) { const a = this.mode.ang; return a === 'RAD' ? v * 180 / Math.PI : a === 'GRAD' ? v * 0.9 : v; },
  cplxHtml(v, polar) {
    if (polar) {
      const r = CalcEngine.cabs(v), th = CalcEngine.carg(v), a = this.mode.ang;
      const t = a === 'RAD' ? th : a === 'GRAD' ? th * 200 / Math.PI : th * 180 / Math.PI;
      return `${this.numHtml(+r.toPrecision(10))}<span class="cang">∠</span>${this.numHtml(+t.toPrecision(10))}`;
    }
    const re = v.re, im = v.im, ai = Math.abs(im);
    let s = re !== 0 ? this.numHtml(re) : '';
    if (re !== 0) s += im < 0 ? ' − ' : ' + '; else if (im < 0) s += '<span class="cn">−</span>';
    return s + (ai === 1 ? '' : this.numHtml(ai)) + '<i>i</i>';
  },
  baseText(v, base) {
    if (base === 'DEC') return String(Math.round(v));
    const n = Math.round(v);
    return (n < 0 ? (n >>> 0) : n).toString({ HEX: 16, BIN: 2, OCT: 8 }[base]).toUpperCase();
  },
  dmsText(v) {
    const neg = v < 0;
    const x = Math.abs(this.angDeg(v));
    let d = Math.floor(x), m = Math.floor((x - d) * 60), s = +(((x - d) * 60 - m) * 60).toFixed(2);
    if (s >= 60) { s = 0; m++; }
    if (m >= 60) { m = 0; d++; }
    return `${neg ? '−' : ''}${d}°${m}′${s}″`;
  },
  formHtml(h) {
    const v = h.val;
    if (h.disp === 'HEX' || h.disp === 'BIN' || h.disp === 'OCT' || h.disp === 'DEC') {
      if (CalcEngine.isC(v)) return this.cplxHtml(v, false);
      return this.baseText(v, h.disp) + (h.disp !== 'DEC' ? `<span class="cbase">${{ HEX: 'ʰ', BIN: 'ᵇ', OCT: 'ᵒ' }[h.disp]}</span>` : '');
    }
    if (h.disp === 'DMS' && !CalcEngine.isC(v)) return escapeHtml(this.dmsText(v));
    if (CalcEngine.isC(v)) return this.cplxHtml(v, h.disp === 'POL' || (h.disp !== 'RECT' && this.mode.cplx === 'r∠θ'));
    const f = h.forms[h.f] || { k: 'dec' };
    const neg = (n) => n < 0 ? '<span class="cn">−</span>' : '';
    if (f.k === 'frac') {
      if (this.mode.mixed && Math.abs(f.n) > f.d) { const w = Math.trunc(Math.abs(f.n) / f.d), r = Math.abs(f.n) % f.d; return `${neg(f.n)}${w}<span class="cf"><span>${r}</span><span>${f.d}</span></span>`; }
      return `${neg(f.n)}<span class="cf"><span>${Math.abs(f.n)}</span><span>${f.d}</span></span>`;
    }
    if (f.k === 'surd') {
      const num = `${f.c > 1 ? f.c : ''}<span class="cr"><span class="cr-s">√</span><span class="cr-a">${f.m}</span></span>`;
      return neg(f.s) + (f.q > 1 ? `<span class="cf"><span>${num}</span><span>${f.q}</span></span>` : num);
    }
    if (f.k === 'pi') {
      const nn = Math.abs(f.n);
      const num = `${nn === 1 ? '' : nn}π`;
      return neg(f.n) + (f.d > 1 ? `<span class="cf"><span>${num}</span><span>${f.d}</span></span>` : num);
    }
    return this.numHtml(v);
  },
  tokHtml(t) {
    const map = { '×': '×', '÷': '÷', '−': '−', '(−)': '<span class="cneg">−</span>', 'Ans': '<span class="cans">Ans</span>', '×10ⁿ': '<span class="cee">E</span>', 'sto→': '<span class="csto">→</span>', 'nCr': '<span class="cfn"> nCr </span>', 'nPr': '<span class="cfn"> nPr </span>', '⁻¹': '<sup>−1</sup>', ',': ', ', i: '<i>i</i>', '∠': '<span class="cang">∠</span>', and: '<span class="cfn"> and </span>', or: '<span class="cfn"> or </span>', xor: '<span class="cfn"> xor </span>', xnor: '<span class="cfn"> xnor </span>' };
    if (map[t] !== undefined) return map[t];
    if ('ʰᵇᵒᵈ'.includes(t)) return `<span class="cbase">${t}</span>`;
    if (t.startsWith('k:')) { const c = CALC_CONST.find(x => String(x[2]) === t.slice(2)); return `<span class="cconst">${c ? escapeHtml(c[0]) : 'k'}</span>`; }
    if (t.startsWith('cv:')) { const c = CALC_CONV.find(x => x[0] === t.slice(3)); return `<span class="cfn cconv">${escapeHtml(c ? c[1] : '▸')}</span>`; }
    if (t.startsWith('disp:')) return `<span class="cfn cconv">${escapeHtml(CALC_DISP[t.slice(5)] || '▸')}</span>`;
    if (t.endsWith('(') && t.length > 1) return `<span class="cfn">${escapeHtml(t)}</span>`;
    return escapeHtml(t);
  },
  /* Vorlagenbaum -> HTML; caret: aktuelle Schreibmarke markieren */
  treeHtml(slot, caret) {
    let h = '';
    const c = caret ? this.cur : null;
    const mark = `<span class="cc${this.overwrite ? ' ov' : ''}"></span>`;
    const top = slot === this.line;
    if (!slot.length) h += (c && c.slot === slot ? mark : '') + (top ? '' : '<span class="cbox"></span>');
    slot.forEach((t, i) => {
      if (c && c.slot === slot && c.i === i) h += mark;
      if (typeof t === 'string') { h += this.tokHtml(t); return; }
      const S = (k) => this.treeHtml(t[k], caret);
      switch (t.t) {
        case 'frac': h += `<span class="cf"><span>${S('a')}</span><span>${S('b')}</span></span>`; break;
        case 'mixed': h += `${S('w')}<span class="cf"><span>${S('a')}</span><span>${S('b')}</span></span>`; break;
        case 'sqrt': h += `<span class="cr"><span class="cr-s">√</span><span class="cr-a">${S('a')}</span></span>`; break;
        case 'root': h += `<span class="cr crn"><span class="cr-n">${S('n')}</span><span class="cr-s">√</span><span class="cr-a">${S('a')}</span></span>`; break;
        case 'pow': h += `<sup class="cpw">${S('a')}</sup>`; break;
        case 'exp': h += `e<sup class="cpw">${S('a')}</sup>`; break;
        case 'ten': h += `10<sup class="cpw">${S('a')}</sup>`; break;
        case 'logb': h += `<span class="cfn">log</span><sub class="cb">${S('b')}</sub>(${S('a')})`; break;
        case 'abs': h += `<span class="cabs">|${S('a')}|</span>`; break;
        case 'sum': case 'prod': h += `<span class="csum"><span class="csum-op"><span class="csum-hi">${S('hi')}</span><span class="csum-s">${t.t === 'sum' ? 'Σ' : '∏'}</span><span class="csum-lo"><i>x</i>=${S('lo')}</span></span><span class="csum-a">(${S('a')})</span></span>`; break;
      }
    });
    if (c && c.slot === slot && c.i === slot.length && slot.length) h += mark;
    return h;
  },
  render() {
    if (!this.win || this.win.hidden || this._rendering) return;
    this._rendering = true;
    try { this.renderNow(); } finally { this._rendering = false; }
  },
  renderNow() {
    const m = this.mode, simple = this.kind === 'simple';
    this.renderKeys();
    const ind = [];
    if (this.second) ind.push('<span class="on">2nd</span>');
    if (!simple) {
      ind.push(`<span>${m.ang}</span>`);
      if (m.fix >= 0) ind.push(`<span>FIX ${m.fix}</span>`);
      if (m.not !== 'NORM') ind.push(`<span>${m.not}</span>`);
      if (m.ans === 'DEC') ind.push('<span>DEZ</span>');
      if (m.cplx !== 'REAL') ind.push(`<span>${m.cplx}</span>`);
      if (this.overwrite) ind.push('<span>ÜBERSCHR.</span>');
      if (this.opEdit) ind.push('<span class="on">SET OP</span>');
    } else if (this.mem) ind.push('<span>M</span>');
    if (this.hsel >= 0) ind.push('<span class="r">▲▼ enter = einfügen</span>');
    this.ind.innerHTML = ind.join('');
    const lcd = this.screen.parentNode;
    const ct = m.contrast || 0;
    lcd.style.filter = !simple && ct ? `contrast(${1 + ct * 0.12}) brightness(${1 - ct * 0.035})` : '';
    let h = '';
    if (this.view === 'home' || simple) {
      h += '<div class="calc-hist">';
      const from = this.cleared || 0;
      if (from && from === this.hist.length) h += `<div class="calc-empty">Verlauf ausgeblendet – ${simple ? 'C drücken oder Rechnung eingeben' : '▲ zeigt frühere Rechnungen'}</div>`;
      else if (!this.hist.length) h += `<div class="calc-empty">${simple ? 'Der Verlauf erscheint hier. Klick auf eine Rechnung oder ein Ergebnis fügt es wieder ein.' : 'Rechnung eingeben, enter rechnet. Der Verlauf bleibt hier stehen – Klick fügt Rechnung oder Ergebnis wieder ein.'}</div>`;
      this.hist.forEach((e, i) => {
        if (i < from && this.hsel !== i) return;
        h += `<div class="calc-e${this.hsel === i ? ' sel' : ''}" data-i="${i}"><div class="calc-ex" title="Klick: Rechnung in die Eingabe übernehmen">${this.treeHtml(e.expr, false)}${simple ? ' =' : ''}</div><div class="calc-res" title="Klick: Ergebnis einfügen${e.forms.length > 1 ? ' · ◄►≈ schaltet die Darstellung um' : ''}">${e.opN ? `<span class="calc-op">op ${e.opN}</span>` : ''}${e.stored ? `<span class="calc-sto">${e.stored} = </span>` : ''}${e.note ? escapeHtml(e.note) : this.formHtml(e)}</div></div>`;
      });
      h += '</div>';
      const err = this.error ? `<div class="calc-errmsg">FEHLER: ${escapeHtml(this.error.msg)}<br><small>${simple ? 'C = weiter' : 'clear oder ◄ ► = zurück zur Eingabe'}</small></div>` : '';
      let line = this.treeHtml(this.line, true);
      let prev = '';
      if (simple) {
        const lastH = this.hist[this.hist.length - 1];
        if (this.isEmpty()) line = `<span class="calc-big0">${lastH && from < this.hist.length ? this.formHtml(lastH) : '0'}</span>`;
        else {
          try {
            const r = CalcEngine.evaluate(this.ser(this.line), this.env(true));
            let v = r.v;
            if (!CalcEngine.isC(v)) v = +v.toPrecision(12);
            prev = '= ' + this.formHtml({ val: v, forms: this.forms(v, r, true), f: 0, disp: r.disp });
          } catch (e) { prev = ''; }
        }
      }
      h += `<div class="calc-in${this.error ? ' err' : ''}">${err}<div class="calc-line">${this.opEdit ? '<span class="calc-opl">op = </span>' : ''}${line}</div>${simple ? `<div class="calc-prev">${prev}</div>` : ''}</div>`;
    } else h += this.viewHtml();
    this.screen.innerHTML = h;
    const hist = this.screen.querySelector('.calc-hist');
    if (hist) { const sel = hist.querySelector('.calc-e.sel'); if (sel) sel.scrollIntoView({ block: 'nearest' }); else hist.scrollTop = hist.scrollHeight; }
    const ln = this.screen.querySelector('.calc-line');
    if (ln) { const cc = ln.querySelector('.cc'); if (cc) { const lr = ln.getBoundingClientRect(), cr = cc.getBoundingClientRect(); if (cr.right > lr.right - 4) ln.scrollLeft += cr.right - lr.right + 12; else if (cr.left < lr.left) ln.scrollLeft -= lr.left - cr.left + 12; } }
  },
  renderPill() {
    if (!this.pill) return;
    const h = this.hist[this.hist.length - 1];
    this.pill.innerHTML = `${icon('calc', 14)}<span>${h ? 'Ans = ' + escapeHtml(this.resultText(h)) : 'Rechner'}</span>`;
  },
  plainNum(v) {
    if (CalcEngine.isC(v)) { const d = document.createElement('div'); d.innerHTML = this.cplxHtml(v, false); return d.textContent.replace(/−/g, '-'); }
    const t = this.numHtml(v); const d = document.createElement('div'); d.innerHTML = t.replace(/<sup>/g, '^').replace(/<\/sup>/g, ''); return d.textContent.replace('×10^', 'E').replace(/−/g, '-');
  },
  /* Klick in den Verlauf: Rechnung bzw. Ergebnis an der Schreibmarke einfügen */
  onScreenClick(e) {
    const it = e.target.closest('.calc-e');
    if (it) {
      const h = this.hist[+it.dataset.i];
      if (!h) return;
      this.error = null;
      if (this.opEdit) { /* in set op: nur einfügen */ }
      if (e.target.closest('.calc-res')) this.insertValue(h);
      else this.insertTree(this.clone(h.expr));
      this.hsel = -1;
      this.render();
      return;
    }
    const pick = e.target.closest('[data-val]');
    if (pick) { this.view = 'home'; this.insertNumber(+pick.dataset.val); this.render(); return; }
    const act = e.target.closest('[data-act]');
    if (act) this.viewAct(act.dataset.act);
  },
  insertTree(tree) { for (const t of tree) this.ins(t); },
  insertValue(h) {
    const v = h.val;
    if (CalcEngine.isC(v)) {
      this.ins('(');
      if (v.re) { this.insertNumber(v.re); this.ins(v.im < 0 ? '−' : '+'); } else if (v.im < 0) this.ins('(−)');
      if (Math.abs(v.im) !== 1) this.insertNumber(Math.abs(v.im));
      this.ins('i'); this.ins(')');
      return;
    }
    if (h.disp === 'HEX' || h.disp === 'BIN' || h.disp === 'OCT') {
      for (const ch of this.baseText(v, h.disp)) this.ins(ch);
      this.ins({ HEX: 'ʰ', BIN: 'ᵇ', OCT: 'ᵒ' }[h.disp]);
      return;
    }
    const f = h.forms[h.f] || { k: 'dec' };
    const digits = (n) => String(n).split('');
    // exakte Formen als Vorlage einfügen (wie angezeigt), sonst die Dezimalzahl
    const wrap = (num) => { const neg = (f.k === 'surd' ? f.s : f.n) < 0; if (neg) this.ins('(−)'); const den = f.k === 'surd' ? f.q : f.d; if (den > 1) this.ins({ t: 'frac', a: num, b: digits(den) }); else for (const t of num) this.ins(t); };
    if (f.k === 'frac') { wrap(digits(Math.abs(f.n))); return; }
    if (f.k === 'surd') { wrap([...(f.c > 1 ? digits(f.c) : []), { t: 'sqrt', a: digits(f.m) }]); return; }
    if (f.k === 'pi') { wrap([...(Math.abs(f.n) !== 1 ? digits(Math.abs(f.n)) : []), 'π']); return; }
    this.insertNumber(v);
  },
  insertNumber(v) {
    if (CalcEngine.isC(v)) { this.insertValue({ val: v, forms: [{ k: 'cplx' }], f: 0 }); return; }
    const s = String(+(+v).toPrecision(13));
    if (/e/i.test(s)) { const [mm, ee] = s.split(/e/i); if (mm.startsWith('-')) this.ins('(−)'); for (const ch of mm.replace('-', '')) this.ins(ch); this.ins('×10ⁿ'); if (ee.startsWith('-')) this.ins('(−)'); for (const ch of ee.replace(/^[+-]/, '')) this.ins(ch); return; }
    if (s.startsWith('-')) this.ins('(−)');
    for (const ch of s.replace('-', '')) this.ins(ch);
  },

  /* ---------------------------------------------------------- Menüs und weitere Bildschirme */
  menuTabs() { return this.menu ? CALC_GROUPS[this.menu.group] : []; },
  menuItems() {
    if (this.view !== 'menu' || !this.menu) return [];
    const name = this.menuTabs()[this.menu.tab];
    if (name === 'recall') return CALC_VARS.map(v => [`${v} = ${this.plainNum(this.vars[v])}`, 'rcl:' + v]);
    return CALC_MENUS[name] || [];
  },
  viewHtml() {
    const m = this.mode;
    if (this.view === 'menu') {
      const tabs = this.menuTabs().map((n, i) => `<span class="calc-tab${i === this.menu.tab ? ' on' : ''}" data-act="tab:${i}">${escapeHtml(n)}</span>`).join('');
      const items = this.menuItems().map(([l], i) => `<div class="calc-mi${i === this.menu.sel ? ' on' : ''}" data-act="mi:${i}"><b>${i < 9 ? i + 1 : ''}</b> ${escapeHtml(l)}</div>`).join('');
      return `<div class="calc-menu"><div class="calc-tabs">${tabs}</div><div class="calc-mlist">${items}</div><div class="calc-hint">${this.menuTabs().length > 1 ? '◄ ► Register · ' : ''}▲ ▼ wählen · enter oder Ziffer · clear = zurück</div></div>`;
    }
    if (this.view === 'mode') {
      const rows = this.modeRows();
      return `<div class="calc-mode">${rows.map(([k, l, opts], ri) => `<div class="calc-mrow${ri === this.menuSel ? ' on' : ''}"><span>${l}</span>${opts.map(([v, t]) => `<b class="${m[k] === v ? 'on' : ''}" data-act="mode:${k}:${escapeHtml(JSON.stringify(v))}">${t}</b>`).join('')}</div>`).join('')}<div class="calc-hint">Klick wählt · ▲ ▼ ◄ ► · clear oder 2nd mode (quit) = zurück</div></div>`;
    }
    if (this.view === 'confirm') {
      const q = this.confirmAct === 'reset' ? 'Rechner zurücksetzen?<br><small>Verlauf, Speicher und Einstellungen werden gelöscht.</small>' : 'Alle Variablen löschen?<br><small>x y z t a b c d = 0</small>';
      return `<div class="calc-menu calc-conf"><div class="calc-sth">${q}</div><div class="calc-mi" data-act="conf:no"><b>1</b> Nein</div><div class="calc-mi" data-act="conf:yes"><b>2</b> Ja</div></div>`;
    }
    if (this.view === 'data') {
      const L = this.lists, n = Math.max(L[0].length, L[1].length, L[2].length) + 1;
      let rows = '';
      for (let i = 0; i < Math.max(n, 6); i++) rows += `<tr><th>${i + 1}</th>${[0, 1, 2].map(k => `<td><input class="calc-li" data-l="${k}" data-r="${i}" value="${L[k][i] !== undefined ? L[k][i] : ''}" inputmode="decimal"></td>`).join('')}</tr>`;
      return `<div class="calc-data"><table><tr><th></th><th>L1</th><th>L2</th><th>L3</th></tr>${rows}</table>
        <div class="calc-btns"><button data-act="stat1">1-Var</button><button data-act="stat2">2-Var</button><button data-act="reg:lin">LinReg</button><button data-act="reg:quad">QuadReg</button><button data-act="reg:exp">ExpReg</button><button data-act="reg:ln">LnReg</button><button data-act="reg:pwr">PwrReg</button><button data-act="fromsheet" title="Markierte Zellen der aktiven Tabelle übernehmen (Spalten → L1, L2, L3)">aus Tabelle</button><button data-act="clrlists">Leeren</button></div></div>`;
    }
    if (this.view === 'stat') {
      const s = this.stats;
      if (!s) return `<div class="calc-menu"><div class="calc-hint" style="padding:12px">Zuerst Daten in L1 (und L2) eingeben: <b data-act="go:data">data</b> öffnen, dann 1-Var, 2-Var oder eine Regression.</div></div>`;
      return `<div class="calc-stats"><div class="calc-sth">${escapeHtml(s.title)}</div>${s.rows.map(([n, v]) => `<div class="calc-sv" data-val="${v}" title="Klick: Wert in die Eingabe"><span>${n}</span><b>${isFinite(v) ? this.numHtml(+(+v).toPrecision(10)) : '–'}</b></div>`).join('')}<div class="calc-hint">Klick auf einen Wert = in die Rechnung einfügen · clear = zurück</div></div>`;
    }
    if (this.view === 'table') {
      const t = this.tbl;
      let rows = '';
      let fn = null;
      try { fn = this.tableFn(); } catch (e) { fn = null; }
      for (let i = 0; i < 12; i++) {
        const x = +(t.start + i * t.step).toPrecision(12);
        let y = '–';
        if (fn) { try { y = fn(x); } catch (e) { y = 'Fehler'; } }
        const ok = typeof y === 'number';
        rows += `<tr><td data-val="${x}">${this.numHtml(x)}</td><td ${ok ? `data-val="${y}"` : ''}>${ok ? this.numHtml(+y.toPrecision(10)) : y}</td></tr>`;
      }
      return `<div class="calc-table"><label>f(x) = <input class="calc-tf" value="${escapeHtml(t.fsrc || '')}" placeholder="z.B. x^2-3x+1 oder sin(x)"></label>
        <label>Start <input class="calc-ts" value="${t.start}" inputmode="decimal"></label><label>Schritt <input class="calc-tst" value="${t.step}" inputmode="decimal"></label>
        <table><tr><th>x</th><th>f(x)</th></tr>${rows}</table><div class="calc-hint">Klick auf einen Wert = einfügen · f(x) auch in Rechnungen: f(2)</div></div>`;
    }
    if (this.view === 'eval') {
      const used = this.evalVars();
      let res = '';
      try { const v = this.evalValue(); res = v === null ? '' : `<div class="calc-sv" data-val="${CalcEngine.isC(v) ? '' : v}"><span>Ergebnis</span><b>${CalcEngine.isC(v) ? this.cplxHtml(v, false) : this.numHtml(+v.toPrecision(10))}</b></div>`; } catch (e) { res = `<div class="calc-errmsg">${escapeHtml(e.message || 'Fehler')}</div>`; }
      return `<div class="calc-table calc-eval"><label>Ausdruck <input class="calc-evx" value="${escapeHtml(this.ev.src || '')}" placeholder="z.B. a·x²+b oder 2πr"></label>
        <div class="calc-evvars">${used.map(v => `<label>${v} = <input class="calc-evv" data-v="${v}" value="${escapeHtml(String(this.ev.vals[v] ?? (CalcEngine.isC(this.vars[v]) ? 0 : this.vars[v])))}" inputmode="decimal"></label>`).join('') || '<span class="calc-hint">Variablen x y z t a b c d werden hier abgefragt.</span>'}</div>
        ${res}<div class="calc-hint">expr-eval: Ausdruck mit Variablen auswerten · Klick auf das Ergebnis = einfügen · clear = zurück</div></div>`;
    }
    return '';
  },
  modeRows() {
    return [
      ['ang', 'Winkel', [['DEG', 'DEG'], ['RAD', 'RAD'], ['GRAD', 'GRAD']]],
      ['fix', 'Stellen', [[-1, 'FLOAT'], [0, '0'], [1, '1'], [2, '2'], [3, '3'], [4, '4'], [5, '5'], [6, '6'], [7, '7'], [8, '8'], [9, '9']]],
      ['not', 'Darstellung', [['NORM', 'NORM'], ['SCI', 'SCI'], ['ENG', 'ENG']]],
      ['ans', 'Ergebnis', [['AUTO', 'AUTO (exakt)'], ['DEC', 'DEZIMAL']]],
      ['mixed', 'Brüche', [[false, 'n/d'], [true, 'U n/d']]],
      ['cplx', 'Komplex', [['REAL', 'REAL'], ['a+bi', 'a+bi'], ['r∠θ', 'r∠θ']]],
    ];
  },
  menuKey(k, sec) {
    if (k === 'clear' || k === 'on' || (k === 'mode' && sec)) { this.view = 'home'; return true; }
    if (this.view === 'menu') {
      const items = this.menuItems(), tabs = this.menuTabs().length, m = this.menu;
      if (k === 'left') { m.tab = (m.tab + tabs - 1) % tabs; m.sel = 0; return true; }
      if (k === 'right') { m.tab = (m.tab + 1) % tabs; m.sel = 0; return true; }
      if (k === 'up') { m.sel = (m.sel + items.length - 1) % items.length; return true; }
      if (k === 'down') { m.sel = (m.sel + 1) % items.length; return true; }
      if (k === 'enter') { this.menuPick(m.sel); return true; }
      if (/^[1-9]$/.test(k)) { this.menuPick(+k - 1); return true; }
      return true;
    }
    if (this.view === 'mode') {
      const rows = this.modeRows();
      const [key, , opts] = rows[this.menuSel] || rows[0];
      if (k === 'up') { this.menuSel = (this.menuSel + rows.length - 1) % rows.length; return true; }
      if (k === 'down') { this.menuSel = (this.menuSel + 1) % rows.length; return true; }
      if (k === 'left' || k === 'right') { const o = opts.map(x => x[0]), i = o.indexOf(this.mode[key]); this.mode[key] = o[(i + (k === 'right' ? 1 : o.length - 1)) % o.length]; this.save(); return true; }
      if (k === 'enter') { this.view = 'home'; return true; }
      return true;
    }
    if (this.view === 'confirm') {
      if (k === '2') this.viewAct('conf:yes'); else if (k === '1' || k === 'enter') this.viewAct('conf:no');
      return true;
    }
    if (this.view === 'stat' && k === 'enter') { this.view = 'home'; return true; }
    if (this.view === 'eval' && k === 'enter') { const v = this.evalValue(); if (v !== null && !CalcEngine.isC(v)) { this.view = 'home'; this.insertNumber(v); } return true; }
    if (this.view === 'data' || this.view === 'stat' || this.view === 'table' || this.view === 'eval') return true;
    return false;
  },
  menuPick(i) {
    const it = this.menuItems()[i];
    if (!it) return;
    const v = it[1];
    this.view = 'home';
    const startOp = (op) => { if (this.autoAns()) this.ins('Ans'); this.ins(op); };
    if (v === 'mixed') { this.mode.mixed = !this.mode.mixed; this.save(); UI.toast(this.mode.mixed ? 'Brüche als gemischte Zahl (U n/d)' : 'Brüche als unechter Bruch (n/d)'); return; }
    if (v === 'pfactor') { this.pfactor(); return; }
    if (v.startsWith('tpl:')) { this.insTpl(v.slice(4)); return; }
    if (v === 'rand') { this.insertNumber(Math.random()); return; }
    if (v.startsWith('rcl:')) { this.insertNumber(this.vars[v.slice(4)]); return; }
    if (v === 'stat1' || v === 'stat2' || v.startsWith('reg:')) { this.computeStats(v); this.view = 'stat'; return; }
    if (v === 'statvars') { this.view = 'stat'; return; }
    if (['!', 'nCr', 'nPr', 'and', 'or', 'xor', 'xnor', '∠'].includes(v) || v.startsWith('cv:') || v.startsWith('disp:')) { startOp(v); return; }
    this.ins(v);
  },
  pfactor() {
    let n = Math.round(this.ans);
    if (CalcEngine.isC(this.ans) || !Number.isInteger(this.ans) || n < 2 || n > 1e12) { this.error = { msg: 'Pfactor braucht eine ganze Zahl ≥ 2 (Ans)' }; return; }
    const fs = [];
    for (let p = 2; p * p <= n; p++) while (n % p === 0) { fs.push(p); n /= p; }
    if (n > 1) fs.push(n);
    const cnt = new Map(); for (const p of fs) cnt.set(p, (cnt.get(p) || 0) + 1);
    const text = [...cnt].map(([p, e]) => p + (e > 1 ? '^' + e : '')).join(' · ');
    this.hist.push({ expr: ['Ans', '▸Pfactor'], val: this.ans, forms: [{ k: 'dec' }], f: 0, note: text });
    this.save();
  },
  viewAct(a) {
    if (a.startsWith('tab:')) { this.menu.tab = +a.slice(4); this.menu.sel = 0; this.render(); return; }
    if (a.startsWith('mi:')) { this.menuPick(+a.slice(3)); this.render(); return; }
    if (a.startsWith('mode:')) { const i = a.indexOf(':', 5); const k = a.slice(5, i), v = a.slice(i + 1); this.mode[k] = JSON.parse(v); this.save(); this.render(); return; }
    if (a.startsWith('go:')) { this.view = a.slice(3); this.render(); return; }
    if (a === 'conf:yes') { if (this.confirmAct === 'reset') this.reset(); else { for (const v of CALC_VARS) this.vars[v] = 0; this.save(); UI.toast('Variablen gelöscht'); } this.view = 'home'; this.render(); return; }
    if (a === 'conf:no') { this.view = 'home'; this.render(); return; }
    if (a === 'clrlists') { this.lists = [[], [], []]; this.save(); this.render(); return; }
    if (a === 'fromsheet') { this.fromSheet(); return; }
    if (a === 'stat1' || a === 'stat2' || a.startsWith('reg:')) { this.readLists(); this.computeStats(a); this.view = 'stat'; this.render(); }
  },
  readLists() {
    if (!this.screen) return;
    const L = [[], [], []];
    for (const inp of this.screen.querySelectorAll('.calc-li')) { const v = inp.value.trim().replace(',', '.'); if (v !== '' && isFinite(+v)) L[+inp.dataset.l][+inp.dataset.r] = +v; }
    this.lists = L.map(l => l.filter(v => v !== undefined));
    this.save();
  },
  readTable() {
    const q = (s) => this.screen.querySelector(s);
    if (!q('.calc-tf')) return;
    this.tbl.fsrc = q('.calc-tf').value; this.tbl.start = +q('.calc-ts').value.replace(',', '.') || 0; this.tbl.step = +q('.calc-tst').value.replace(',', '.') || 1;
    this.save();
  },
  fromSheet() {
    const a = typeof Sheet !== 'undefined' && Sheet.active;
    if (!a) { UI.toast('Zuerst in einer Tabelle Zellen markieren (z.B. zwei Spalten mit x- und y-Werten)'); return; }
    const s = Sheet.sel();
    const L = [[], [], []];
    for (let c = s.c1; c <= Math.min(s.c2, s.c1 + 2); c++) for (let r = s.r1; r <= s.r2; r++) { const v = Sheet.value(a.id, c, r); if (typeof v === 'number') L[c - s.c1].push(v); }
    this.lists = L;
    this.save();
    this.render();
    UI.toast(`${L[0].length} Werte nach L1${L[1].length ? ', ' + L[1].length + ' nach L2' : ''} übernommen`);
  },
  computeStats(kind) {
    const X = this.lists[0], Y = this.lists[1];
    const n = X.length;
    if (!n) { this.stats = null; return; }
    const sum = (a) => a.reduce((s, v) => s + v, 0);
    const mean = sum(X) / n;
    const sx = n > 1 ? Math.sqrt(sum(X.map(v => (v - mean) ** 2)) / (n - 1)) : NaN, px = Math.sqrt(sum(X.map(v => (v - mean) ** 2)) / n);
    const srt = [...X].sort((a, b) => a - b);
    const med = (a) => a.length % 2 ? a[(a.length - 1) / 2] : (a[a.length / 2 - 1] + a[a.length / 2]) / 2;
    const half = Math.floor(n / 2);
    const rows = [['n', n], ['x̄', mean], ['Sx', sx], ['σx', px], ['Σx', sum(X)], ['Σx²', sum(X.map(v => v * v))], ['min', srt[0]], ['Q1', n > 1 ? med(srt.slice(0, half)) : srt[0]], ['Med', med(srt)], ['Q3', n > 1 ? med(srt.slice(n - half)) : srt[0]], ['max', srt[n - 1]]];
    if (kind === 'stat1') { this.stats = { title: '1-Var Stats (L1)', rows }; return; }
    const m = Math.min(n, Y.length);
    if (m < 2) { this.stats = { title: 'Für 2-Var und Regressionen werden L1 und L2 gebraucht', rows }; return; }
    const xs = X.slice(0, m), ys = Y.slice(0, m);
    const fit = (fx, fy) => {
      const P = xs.map((x, i) => [fx(x), fy(ys[i])]).filter(p => isFinite(p[0]) && isFinite(p[1]));
      const k = P.length, mx = sum(P.map(p => p[0])) / k, my = sum(P.map(p => p[1])) / k;
      let sxy = 0, sxx = 0, syy = 0; for (const [a, b] of P) { sxy += (a - mx) * (b - my); sxx += (a - mx) ** 2; syy += (b - my) ** 2; }
      const a = sxy / sxx; return { a, b: my - a * mx, r: sxy / Math.sqrt(sxx * syy) };
    };
    const my = sum(ys) / m;
    const base2 = [['n', m], ['x̄', sum(xs) / m], ['ȳ', my], ['Sx', Math.sqrt(sum(xs.map(v => (v - sum(xs) / m) ** 2)) / (m - 1))], ['Sy', Math.sqrt(sum(ys.map(v => (v - my) ** 2)) / (m - 1))], ['Σx', sum(xs)], ['Σy', sum(ys)], ['Σx²', sum(xs.map(v => v * v))], ['Σy²', sum(ys.map(v => v * v))], ['Σxy', sum(xs.map((x, i) => x * ys[i]))]];
    if (kind === 'stat2') { const l = fit(x => x, y => y); this.stats = { title: '2-Var Stats (L1, L2)', rows: [...base2, ['a', l.a], ['b', l.b], ['r', l.r], ['r²', l.r * l.r]] }; return; }
    const t = kind.slice(4);
    let res;
    if (t === 'lin') { const l = fit(x => x, y => y); res = { title: 'LinReg  y = ax + b', rows: [['a', l.a], ['b', l.b], ['r²', l.r * l.r], ['r', l.r]] }; }
    else if (t === 'exp') { const l = fit(x => x, y => Math.log(y)); res = { title: 'ExpReg  y = a·bˣ', rows: [['a', Math.exp(l.b)], ['b', Math.exp(l.a)], ['r²', l.r * l.r], ['r', l.r]] }; }
    else if (t === 'ln') { const l = fit(x => Math.log(x), y => y); res = { title: 'LnReg  y = a + b·ln(x)', rows: [['a', l.b], ['b', l.a], ['r²', l.r * l.r], ['r', l.r]] }; }
    else if (t === 'pwr') { const l = fit(x => Math.log(x), y => Math.log(y)); res = { title: 'PwrReg  y = a·xᵇ', rows: [['a', Math.exp(l.b)], ['b', l.a], ['r²', l.r * l.r], ['r', l.r]] }; }
    else if (t === 'quad') {
      const s = [0, 0, 0, 0, 0], q = [0, 0, 0];
      for (let i = 0; i < m; i++) { let p = 1; for (let k = 0; k <= 4; k++) { s[k] += p; if (k <= 2) q[k] += p * ys[i]; p *= xs[i]; } }
      const M = [[s[4], s[3], s[2], q[2]], [s[3], s[2], s[1], q[1]], [s[2], s[1], s[0], q[0]]];
      for (let i = 0; i < 3; i++) { let pv = i; for (let k = i + 1; k < 3; k++) if (Math.abs(M[k][i]) > Math.abs(M[pv][i])) pv = k; [M[i], M[pv]] = [M[pv], M[i]]; for (let k = 0; k < 3; k++) if (k !== i && M[i][i]) { const f = M[k][i] / M[i][i]; for (let j = i; j < 4; j++) M[k][j] -= f * M[i][j]; } }
      const a = M[0][3] / M[0][0], b = M[1][3] / M[1][1], c = M[2][3] / M[2][2];
      let ssr = 0, sst = 0; for (let i = 0; i < m; i++) { ssr += (ys[i] - (a * xs[i] * xs[i] + b * xs[i] + c)) ** 2; sst += (ys[i] - my) ** 2; }
      res = { title: 'QuadReg  y = ax² + bx + c', rows: [['a', a], ['b', b], ['c', c], ['R²', 1 - ssr / sst]] };
    }
    this.stats = res;
    // Koeffizienten auch in den Speicher a, b (c) wie beim TI
    for (const [nme, v] of res.rows) if (['a', 'b', 'c'].includes(nme) && isFinite(v)) this.vars[nme] = +v.toPrecision(13);
    this.save();
  },
  /* Text-Eingabe (table, expr-eval) in Rechenwerk-Syntax */
  linear(src) {
    return src.replace(/×|·/g, '*').replace(/÷|:/g, '/').replace(/−/g, '-').replace(/√\(/g, 'sqrt(').replace(/√(\d+(?:\.\d+)?)/g, 'sqrt($1)')
      .replace(/²/g, '^2').replace(/³/g, '^3').replace(/\bpi\b/gi, 'π').replace(/,(?=\d)/g, '.')
      .replace(/(\d)\s*([xyztabcdπ(])/g, '$1*$2');
  },
  tableFn() {
    const src = (this.tbl.fsrc || '').trim();
    if (!src) return null;
    const expr = this.linear(src);
    return (x) => { const v = CalcEngine.evaluate(expr, { ang: this.mode.ang, vars: { ...this.vars, x }, ans: this.ans }).v; if (CalcEngine.isC(v)) throw new CalcEngine.CErr('komplex', 0); return v; };
  },
  evalVars() { const s = this.ev.src || ''; return CALC_VARS.filter(v => new RegExp(`(^|[^a-z])${v}(?![a-z(])`, 'i').test(s.replace(/\b(sin|cos|tan|ln|log|sqrt|abs|exp|round|int|max|min|mod|lcm|gcd)\b/g, ''))); },
  evalValue() {
    const src = (this.ev.src || '').trim();
    if (!src) return null;
    const vars = { ...this.vars };
    for (const v of this.evalVars()) { const x = this.ev.vals[v]; if (x !== undefined && x !== '') vars[v] = +String(x).replace(',', '.'); }
    return CalcEngine.evaluate(this.linear(src), { ang: this.mode.ang, vars, ans: this.ans, cplx: this.mode.cplx }).v;
  },
  readEval(rerender) {
    const x = this.screen.querySelector('.calc-evx');
    if (x) this.ev.src = x.value;
    for (const inp of this.screen.querySelectorAll('.calc-evv')) this.ev.vals[inp.dataset.v] = inp.value;
    this.save();
    if (rerender) { this.render(); const nx = this.screen.querySelector('.calc-evv') || this.screen.querySelector('.calc-evx'); if (nx) nx.focus(); }
  },

  /* ---------------------------------------------------------- Tastatur */
  onKey(e) {
    const t = e.target;
    if (t.matches && t.matches('input')) {
      e.stopPropagation();
      if (t.classList.contains('calc-li')) { if (e.key === 'Enter') { e.preventDefault(); this.readLists(); this.render(); const n2 = this.screen.querySelector(`.calc-li[data-l="${t.dataset.l}"][data-r="${+t.dataset.r + 1}"]`); n2?.focus(); } if (e.key === 'Escape') { this.readLists(); this.view = 'home'; this.render(); this.win.focus(); } return; }
      if (t.matches('.calc-tf, .calc-ts, .calc-tst')) {
        if (e.key === 'Enter' || e.key === 'Tab') { this.readTable(); if (e.key === 'Enter') { e.preventDefault(); this.render(); } }
        if (e.key === 'Escape') { this.view = 'home'; this.render(); this.win.focus(); }
      }
      if (t.matches('.calc-evx, .calc-evv')) {
        if (e.key === 'Enter') { e.preventDefault(); this.readEval(t.matches('.calc-evx')); if (!t.matches('.calc-evx')) this.render(); }
        if (e.key === 'Escape') { this.view = 'home'; this.render(); this.win.focus(); }
      }
      return;
    }
    const k = e.key, ctrl = e.ctrlKey || e.metaKey, simple = this.kind === 'simple';
    const stop = () => { e.preventDefault(); e.stopPropagation(); };
    if (k === 'Escape' && (this.view === 'home' || simple) && this.isEmpty() && !this.error && !this.opEdit) { stop(); this.minimize(); return; }
    if (ctrl && (k === 'c' || k === 'C')) { const h = this.hist[this.hist.length - 1]; if (h) { navigator.clipboard?.writeText(this.resultText(h).replace(/−/g, '-')); UI.toast('Ergebnis kopiert'); } stop(); return; }
    if (ctrl && (k === 'v' || k === 'V')) { stop(); navigator.clipboard?.readText().then(txt => { const v = parseFloat(String(txt).replace(/[’'\s]/g, '').replace(',', '.')); if (isFinite(v)) { this.insertNumber(v); this.render(); } }).catch(() => {}); return; }
    if (e.altKey && (k === 'r' || k === 'R')) { stop(); this.toggle(); return; }
    if (ctrl || e.altKey) return;
    const direct = (fn) => { stop(); if (this.view !== 'home' && !simple) this.view = 'home'; this.error = null; fn(); this.render(); };
    if (simple) {
      const map = { Enter: 'enter', '=': 'enter', Backspace: '⌫', Delete: 'CE', Escape: 'C', '+': '+', '-': '−', '*': '×', '/': '÷', ':': '÷', '.': '.', ',': '.', '%': '%', '(': '(', ')': ')' };
      const key = map[k] || (/^[0-9]$/.test(k) ? k : null);
      if (!key) return;
      stop();
      this.press(key);
      return;
    }
    const map = {
      Enter: 'enter', '=': 'enter', Delete: 'del', Escape: 'clear', ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down',
      '+': '+', '-': '−', '*': '×', ':': '÷', '(': '(', ')': ')', '^': 'xpow', '.': '.',
    };
    if (k === 'Backspace') { direct(() => this.back()); return; }
    if (k === '/') { direct(() => this.insTpl('frac', true)); return; }      // Schrägstrich = Bruch (Zahl davor wird Zähler)
    if (k === ',') { direct(() => this.ins(',')); return; }
    if (k === '!' || k === '%') { direct(() => { if (this.isEmpty() && this.hist.length) this.ins('Ans'); this.ins(k); }); return; }
    if (CALC_VARS.includes(k)) { direct(() => this.ins(k)); return; }
    if (/^[A-F]$/.test(k) && e.shiftKey) { direct(() => this.ins(k)); return; }
    if (k === 'e' || k === 'i') { direct(() => this.ins(k)); return; }
    if (k === 'p') { direct(() => this.ins('π')); return; }
    if (k === 'r') { direct(() => this.insTpl('sqrt')); return; }
    if (k === 's' || k === 'l' || k === 'g') { direct(() => this.ins(k === 's' ? 'sin(' : k === 'l' ? 'ln(' : 'log(')); return; }
    let key = map[k];
    if (!key && /^[0-9]$/.test(k)) key = k;
    if (!key) return;
    stop();
    if (key === '−' && this.isEmpty() && !this.hist.length && this.view === 'home') { this.press('neg'); return; }
    this.press(key);
  },

  /* ---------------------------------------------------------- In die Seite einfügen */
  resultText(h) {
    const v = h.val;
    if (h.note) return h.note;
    if (h.disp === 'HEX' || h.disp === 'BIN' || h.disp === 'OCT') return this.baseText(v, h.disp) + { HEX: 'ʰ', BIN: 'ᵇ', OCT: 'ᵒ' }[h.disp];
    if (h.disp === 'DMS' && !CalcEngine.isC(v)) return this.dmsText(v);
    if (CalcEngine.isC(v)) { const d = document.createElement('div'); d.innerHTML = this.cplxHtml(v, h.disp === 'POL' || (h.disp !== 'RECT' && this.mode.cplx === 'r∠θ')); return d.textContent; }
    const f = h.forms[h.f] || { k: 'dec' };
    if (f.k === 'frac') return (f.n < 0 ? '−' : '') + Math.abs(f.n) + '/' + f.d;
    if (f.k === 'surd') return (f.s < 0 ? '−' : '') + (f.c > 1 ? f.c : '') + '√' + f.m + (f.q > 1 ? '/' + f.q : '');
    if (f.k === 'pi') return (f.n < 0 ? '−' : '') + (Math.abs(f.n) === 1 ? '' : Math.abs(f.n)) + 'π' + (f.d > 1 ? '/' + f.d : '');
    return this.plainNum(v).replace(/^-/, '−');
  },
  exprText(tree) {
    let s = '';
    for (const t of tree) {
      if (typeof t === 'string') {
        if (t.startsWith('k:')) { s += (CALC_CONST.find(c => String(c[2]) === t.slice(2)) || ['k'])[0]; continue; }
        if (t.startsWith('cv:')) { s += ' ' + ((CALC_CONV.find(c => c[0] === t.slice(3)) || [0, '▸'])[1]); continue; }
        if (t.startsWith('disp:')) { s += ' ' + (CALC_DISP[t.slice(5)] || ''); continue; }
        s += ({ '(−)': '−', '×10ⁿ': 'E', 'sto→': '→', 'nCr': ' nCr ', 'nPr': ' nPr ', '⁻¹': '⁻¹', and: ' and ', or: ' or ', xor: ' xor ', xnor: ' xnor ' })[t] ?? t;
        continue;
      }
      const S = (k) => this.exprText(t[k]);
      const wrap = (x) => x.length > 1 && !/^[\w.]+$/.test(x) ? '(' + x + ')' : x;
      switch (t.t) {
        case 'frac': s += wrap(S('a')) + '/' + wrap(S('b')); break;
        case 'mixed': s += S('w') + ' ' + S('a') + '/' + S('b'); break;
        case 'sqrt': s += '√' + wrap(S('a')); break;
        case 'root': s += S('n') + '√' + wrap(S('a')); break;
        case 'pow': s += S('a') === '2' ? '²' : S('a') === '3' ? '³' : '^' + wrap(S('a')); break;
        case 'exp': s += 'e^' + wrap(S('a')); break;
        case 'ten': s += '10^' + wrap(S('a')); break;
        case 'logb': s += 'log_' + S('b') + '(' + S('a') + ')'; break;
        case 'abs': s += '|' + S('a') + '|'; break;
        case 'sum': case 'prod': s += (t.t === 'sum' ? 'Σ' : '∏') + '(x=' + S('lo') + '…' + S('hi') + ': ' + S('a') + ')'; break;
      }
    }
    return s;
  },
  insertResult() {
    const h = this.hist[this.hist.length - 1];
    if (!h) { UI.toast('Noch kein Ergebnis'); return; }
    const txt = this.resultText(h);
    if (typeof Sheet !== 'undefined' && Sheet.active && !Sheet.locked(Sheet.active.id)) {
      const a = Sheet.active;
      Sheet.setCells(a.id, [[a.c, a.r, CalcEngine.isC(h.val) ? txt : XL.numText(h.val)]], 'Ergebnis aus dem Rechner');
      UI.toast(`In ${Sheet.data(a.id).name}!${XL.key(a.c, a.r)} eingefügt`);
      return;
    }
    if (Canvas.editing && Canvas.restoreRange()) { document.execCommand('insertText', false, txt); Canvas.syncEditing(); Hist.commit('Ergebnis eingefügt'); return; }
    if (!Canvas.page) { UI.toast('Zuerst eine Seite öffnen'); return; }
    const c = Canvas.viewCenter();
    const b = Canvas.createBoxAt({ x: c.x - 100, y: c.y }, { html: `<div>${escapeHtml(this.exprText(h.expr))} = ${escapeHtml(txt)}</div>`, noFocus: true, w: 260, label: 'Ergebnis eingefügt' });
    if (b) Canvas.select([b.id]);
  },
  insertHistory() {
    if (!this.hist.length) { UI.toast('Der Verlauf ist leer'); return; }
    if (!Canvas.page) { UI.toast('Zuerst eine Seite öffnen'); return; }
    const lines = this.hist.map(h => `<div>${escapeHtml(this.exprText(h.expr))} = <b>${escapeHtml(this.resultText(h))}</b></div>`).join('');
    if (Canvas.editing && Canvas.restoreRange()) { document.execCommand('insertHTML', false, lines); Canvas.syncEditing(); Hist.commit('Rechenverlauf eingefügt'); return; }
    const c = Canvas.viewCenter();
    const b = Canvas.createBoxAt({ x: c.x - 140, y: c.y - 60 }, { html: `<h3>Rechenverlauf</h3>${lines}`, noFocus: true, w: 320, label: 'Rechenverlauf eingefügt' });
    if (b) Canvas.select([b.id]);
  },
  /* von aussen (Fotomath): Rechnung als Vorlagenbaum übernehmen und ausrechnen */
  loadExpression(tree, run) {
    this.show();
    if (this.kind !== 'sci') this.setKind('sci');
    this.view = 'home'; this.error = null;
    this.line = this.clone(tree); this.cur = { slot: this.line, i: this.line.length };
    if (run) this.enter();
    this.render();
  },
  init() {
    const b = $('#qat-calc');
    if (b) { b.innerHTML = icon('calc', 16); b.addEventListener('click', () => this.toggle()); }
    const s = this.st();
    if (s.open) setTimeout(() => { this.build(); if (s.min) this.minimize(); else this.show(); }, 0);
  },
};

if (typeof module !== 'undefined') module.exports = { CalcEngine, CALC_CONV };
