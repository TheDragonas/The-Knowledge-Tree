'use strict';
/* Fotomath (seit 1.9): Rahmen um eine handgeschriebene Rechnung ziehen → erkennen (MathInk), schön darstellen, ausrechnen
 * (exakt und dezimal), Gleichungen mit x lösen, seit 1.27 nach jeder Unbekannten auflösen (Formel umstellen, z.B. U = R·I
 * nach I), Ergebnis daneben/als Formel einfügen oder im Rechner weiterrechnen.
 * Über jedem erkannten Zeichen steht ein kleines Etikett – Klick = andere Erkennung wählen. Korrekturen werden als eigene
 * Vorlagen gemerkt (Store.ui.inkTpl), damit Fotomath die eigene Handschrift lernt. Alles ohne Internet.
 * Seit 1.38 wie die App Photomath: Rechenweg Schritt für Schritt (mathsteps.js), Ergebnis oder Rechenweg als Text
 * einfügen – mit mathematischen Zeichen oder (Häkchen) nur mit Tastaturzeichen; die Erkennung prüft den Zusammenhang
 * (ungültige Rechnung → nächstbeste Lesart unsicherer Zeichen, blau markiert).
 * Seit 1.52 Werkzeuge wie Derive/Photomath (mathcas.js): Ableiten, Integrieren (auch mit Grenzen), Faktorisieren,
 * Ausmultiplizieren, Kurvendiskussion mit Graph (als Bild einfügbar), Taylorpolynom, Primfaktoren; lineare
 * Gleichungssysteme (mehrere Zeilen Handschrift untereinander oder getippt mit „;“), Ungleichungen (getippt mit < > ≤ ≥),
 * ggT/kgV und Befehle wie in Derive: „d/dx …“, „∫ … dx“, „∫[0;2] … dx“, „faktor(…)“. */
const Fotomath = {
  cur: null,   // { inks, rect, overrides: Map, res, left, right, text }

  /* ---------------------------------------------------------- Start: Auswahl oder Rahmen ziehen */
  start() {
    if (!Canvas.page) { UI.toast('Zuerst eine Seite öffnen'); return; }
    const sel = typeof Draw !== 'undefined' ? Draw.selected().filter(d => d.type === 'ink' && d.kind !== 'marker') : [];
    if (sel.length) { this.run(sel); return; }
    this.capture();
  },
  capture() {
    this.close();
    const vp = Canvas.vp;
    const cap = el('div', { class: 'fm-cap' });
    const box = el('div', { class: 'fm-rect' });
    cap.append(box);
    vp.append(cap);
    UI.toast('Fotomath: Rahmen um die handgeschriebene Rechnung ziehen (Stift oder Bild/Foto) · Esc = abbrechen', 4000);
    let st = null;
    const vr = () => vp.getBoundingClientRect();
    const end = () => { cap.remove(); removeEventListener('keydown', key, true); };
    const key = (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); end(); } };
    addEventListener('keydown', key, true);
    for (const t of ['pointermove', 'pointerup', 'mousedown', 'click', 'dblclick', 'contextmenu', 'wheel']) cap.addEventListener(t, (e) => e.stopPropagation());
    cap.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      if (e.button !== 0) { end(); return; }
      e.preventDefault();
      cap.setPointerCapture(e.pointerId);
      st = { x: e.clientX, y: e.clientY };
      Object.assign(box.style, { display: 'block', left: (st.x - vr().left) + 'px', top: (st.y - vr().top) + 'px', width: '0px', height: '0px' });
    });
    cap.addEventListener('pointermove', (e) => {
      if (!st) return;
      const r = vr();
      Object.assign(box.style, { left: (Math.min(st.x, e.clientX) - r.left) + 'px', top: (Math.min(st.y, e.clientY) - r.top) + 'px', width: Math.abs(e.clientX - st.x) + 'px', height: Math.abs(e.clientY - st.y) + 'px' });
    });
    cap.addEventListener('pointerup', (e) => {
      if (!st) return;
      const a = Canvas.toWorld(Math.min(st.x, e.clientX), Math.min(st.y, e.clientY)), b = Canvas.toWorld(Math.max(st.x, e.clientX), Math.max(st.y, e.clientY));
      end();
      if (Math.abs(e.clientX - st.x) < 6 && Math.abs(e.clientY - st.y) < 6) return;
      const rect = { x: a.x, y: a.y, w: b.x - a.x, h: b.y - a.y };
      const inks = this.inksIn(rect);
      if (!inks.length) {
        const imgs = this.imagesIn(rect);
        if (imgs.length) { this.runImage(imgs, rect); return; }
        const texts = this.textIn(rect);
        if (texts) { this.runText(texts, rect); return; }
        UI.toast('Im Rahmen ist keine Handschrift – mit einem Stift (Register Zeichnen) schreiben oder ein Bild/Foto einrahmen', 4000);
        return;
      }
      this.run(inks, rect);
    });
  },
  /* Striche, die zum grössten Teil im Rahmen liegen */
  inksIn(r) {
    const p = Canvas.page;
    return p.drawings.filter(d => {
      if (d.type !== 'ink' || d.kind === 'marker') return false;
      let n = 0, k = 0;
      for (let i = 0; i + 2 < d.pts.length; i += 3) { k++; const x = d.pts[i], y = d.pts[i + 1]; if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) n++; }
      return k && n / k >= 0.6;
    });
  },
  /* Bilder (frei oder im Text), die den Rahmen schneiden – Lage aus der Darstellung (Weltkoordinaten) */
  imagesIn(r) {
    const out = [];
    for (const [id, e] of Canvas.els) {
      const b = Canvas.box(id);
      if (!b || b.sheet || b.chart) continue;
      for (const img of e.querySelectorAll('img')) {
        if (!img.complete || !img.naturalWidth || img.closest('.ui-only')) continue;
        const cr = img.getBoundingClientRect();
        if (cr.width < 4 || cr.height < 4) continue;
        const a = Canvas.toWorld(cr.left, cr.top), z = Canvas.toWorld(cr.right, cr.bottom);
        const ir = { x: a.x, y: a.y, w: z.x - a.x, h: z.y - a.y };
        if (ir.x < r.x + r.w && ir.x + ir.w > r.x && ir.y < r.y + r.h && ir.y + ir.h > r.y) out.push({ img, r: ir });
      }
    }
    return out;
  },
  /* Handschrift in einem Bild (Scan, Foto): Ausschnitt in Graustufen → MathInk.fromBitmap → wie Tinte weiter */
  runImage(imgs, rect) {
    let s = Math.min(4, Math.max(0.75, 260 / Math.max(1, rect.h)));
    if (rect.w * s > 2200) s = 2200 / rect.w;
    const W = Math.max(8, Math.round(rect.w * s)), H = Math.max(8, Math.round(rect.h * s));
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    const ctx = cv.getContext('2d', { willReadFrequently: true });
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H);
    ctx.imageSmoothingQuality = 'high';
    try {
      for (const { img, r } of imgs) ctx.drawImage(img, (r.x - rect.x) * s, (r.y - rect.y) * s, r.w * s, r.h * s);
    } catch (e) { UI.toast('Das Bild kann nicht gelesen werden'); return; }
    let data;
    try { data = ctx.getImageData(0, 0, W, H).data; } catch (e) { UI.toast('Das Bild kann nicht gelesen werden (fremde Quelle)'); return; }
    const gray = new Uint8ClampedArray(W * H);
    for (let i = 0, j = 0; i < gray.length; i++, j += 4) gray[i] = 0.299 * data[j] + 0.587 * data[j + 1] + 0.114 * data[j + 2];
    const res = MathInk.fromBitmap(gray, W, H);
    if (!res.strokes.length) { UI.toast('Im Bild wurde keine Schrift gefunden (dunkle Schrift auf hellem Grund klappt am besten)', 4000); return; }
    const strokes = res.strokes.map((pts, i) => ({ id: 'img' + i, comp: res.comp[i], pts: pts.map(q => ({ x: rect.x + (q.x + 0.5) / s, y: rect.y + (q.y + 0.5) / s })) }));
    let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
    for (const st of strokes) for (const q of st.pts) { x1 = Math.min(x1, q.x); y1 = Math.min(y1, q.y); x2 = Math.max(x2, q.x); y2 = Math.max(y2, q.y); }
    this.loadUser();
    this.cur = { inks: [], strokes, rect, bbox: { x: x1, y: y1, w: Math.max(1, x2 - x1), h: Math.max(1, y2 - y1) }, overrides: new Map(), text: null, image: true };
    this.recognize();
  },
  /* getippte Rechnung in Textfeldern im Rahmen (z.B. „3/4 + 1/2 =“) */
  textIn(r) {
    const p = Canvas.page;
    const hit = p.boxes.filter(b => !b.sheet && !b.chart && b.html && b.x < r.x + r.w && b.x + b.w > r.x && b.y < r.y + r.h && b.y + 40 > r.y);
    if (!hit.length) return '';
    const d = document.createElement('div');
    d.innerHTML = hit.map(b => b.html).join(' ');
    const t = d.textContent.trim();
    return /\d/.test(t) && /[+\-−×÷*/:^=√]/.test(t) && t.length < 200 ? t : '';
  },

  /* ---------------------------------------------------------- Erkennen */
  run(inks, rect) {
    if (!inks || !inks.length) { UI.toast('Keine Handschrift ausgewählt'); return; }
    this.loadUser();
    const sorted = [...inks].sort((a, b) => (a.t0 || 0) - (b.t0 || 0));
    const strokes = sorted.map(d => ({ id: d.id, pts: DG.inkPts(d).map(q => ({ x: q.x, y: q.y })) }));
    const bb = DG.union(sorted.map(d => DG.bbox(d)));
    this.cur = { inks: sorted, strokes, rect: rect || bb, bbox: bb, overrides: new Map(), text: null };
    this.recognize();
  },
  runText(text, rect) {
    this.cur = { inks: [], strokes: [], rect, bbox: rect, overrides: new Map(), text };
    const r = MathInk.fromText(text.replace(/=\s*$/, '='));
    this.cur.left = r.left; this.cur.right = r.right; this.cur.res = null;
    this.show();
  },
  /* Handschrift in Zeilen teilen (1.52): Striche nach Höhe ordnen, grosse senkrechte Lücke = neue Zeile */
  rows(strokes) {
    const bx = strokes.map(s => { let y1 = Infinity, y2 = -Infinity; for (const p of s.pts) { y1 = Math.min(y1, p.y); y2 = Math.max(y2, p.y); } return { s, y1, y2 }; });
    const hs = bx.map(b => b.y2 - b.y1).sort((a, b) => a - b);
    const tall = hs.filter(h => h >= 0.4 * hs[hs.length - 1]);
    const H = tall[Math.floor(tall.length / 2)] || 1;
    bx.sort((a, b) => a.y1 - b.y1);
    const rows = [];
    for (const b of bx) {
      const r = rows[rows.length - 1];
      if (r && b.y1 <= r.y2 + 0.45 * H) { r.items.push(b.s); r.y2 = Math.max(r.y2, b.y2); }
      else rows.push({ y2: b.y2, items: [b.s] });
    }
    // Schreibreihenfolge behalten (die Erkennung gruppiert Striche nach der Zeit)
    const ord = new Map(strokes.map((st, i) => [st, i]));
    return rows.map(r => r.items.sort((a, b) => ord.get(a) - ord.get(b)));
  },
  recognize() {
    const c = this.cur;
    c.sys = c.rel = c.cmd = null;
    // mehrere Zeilen, jede mit „=“ → Gleichungssystem (sonst wie bisher als eine Rechnung)
    const rows = c.strokes.length > 5 ? this.rows(c.strokes) : null;
    if (rows && rows.length >= 2 && rows.length <= 6) {
      const rs = rows.map(r => MathInk.recognize(r, c.overrides));
      if (rs.every(r => r && r.left && r.left.length && r.right && r.right.length)) {
        c.res = { syms: rs.flatMap(r => r.syms), H: rs[0].H, rows: rs };
        c.sys = rs.map(r => ({ left: r.left, right: r.right }));
        c.left = rs[0].left; c.right = rs[0].right;
        c.text = null;
        this.show();
        return;
      }
    }
    const res = MathInk.recognize(c.strokes, c.overrides);
    c.res = res;
    c.left = res ? res.left : []; c.right = res ? res.right : null;
    c.text = null;
    this.show();
  },
  loadUser() {
    const t = Store.ui.inkTpl;
    if (this._userSrc !== t) { MathInk.setUserTemplates(Array.isArray(t) ? t : []); this._userSrc = t; }
  },
  /* Korrektur merken: Zeichen als eigene Vorlage (höchstens 160, älteste fallen weg – hält den gespeicherten Zustand klein) */
  learn(sym, cls) {
    try {
      const v = MathInk.learnCloud({ ...sym, cls });
      const list = Array.isArray(Store.ui.inkTpl) ? Store.ui.inkTpl.slice() : [];
      list.push(v);
      Store.ui.inkTpl = list.slice(-160);
      UiState.saveSoon();
      this.loadUser();
    } catch (e) { console.warn(e); }
  },

  /* ---------------------------------------------------------- Rechnen */
  env(x) { return { ang: Calc.mode.ang, vars: { ...Calc.vars, x: x || 0, y: 0 }, ans: Calc.ans, cplx: 'REAL' }; },
  ev(tree, x) { return CalcEngine.evaluate(Calc.ser(tree), this.env(x)); },
  /* Rechnen (1.52): Gleichungssystem, Ungleichung, ggT/kgV; sonst wie bisher – dazu die passenden Werkzeuge */
  compute() {
    const c = this.cur;
    const P = (t) => MathInk.symParse(t || []);
    try {
      if (c.sys) return { kind: 'cas', cas: MathCAS.system(c.sys.map(e => ({ L: P(e.left), R: P(e.right) }))), tools: [] };
      if (c.rel) {
        const vars = MathInk.varsIn(c.left, c.right);
        if (vars.length !== 1) return { kind: 'error', msg: 'Ungleichungen mit genau einer Unbekannten (z. B. 3x − 5 < 7)' };
        return { kind: 'cas', cas: MathCAS.inequality(P(c.left), c.rel, P(c.right), vars[0]), tools: [] };
      }
      if (c.cmd) return { kind: 'cas', cas: MathCAS.gcdLcm(c.cmd.nums, c.cmd.k), tools: [] };
    } catch (e) { return { kind: 'error', msg: e.message || 'Fehler' }; }
    const out = this.compute0();
    out.tools = this.toolsFor(out);
    if (out.kind === 'func' && c.op === undefined) c.op = 'curve';   // Funktion: gleich Kurvendiskussion mit Graph
    if (c.op && out.tools.some(t => t.op === c.op)) {
      try { const r = this.runOp(c.op, out); if (r.extra) out.graph = r; else out.cas = r; } catch (e) { out.cas = { kind: 'cas', op: c.op, steps: [], error: e.message || 'Fehler' }; }
    }
    return out;
  },
  /* f(x) = … (Buchstabe, Klammer, Unbekannte, Klammer) → Funktion */
  funcOf(L, R) {
    if (!R || !R.length || !L || L.length !== 4 || L[1] !== '(' || L[3] !== ')' || !/^[a-zA-Z]$/.test(L[0]) || !/^[a-z]$/.test(L[2])) return null;
    const vr = MathInk.varsIn(R, null);
    if (vr.some(x => x !== L[2])) return null;
    return { name: L[0], v: L[2], tree: R };
  },
  /* Ausdruck, auf den die Werkzeuge wirken: { node, v, name, vars } oder null */
  exprOf(out) {
    const c = this.cur, L = c.left || [], R = c.right;
    let tree = null, name = null, v = null;
    if (out.kind === 'func') { tree = out.tree; name = out.name; v = out.v; }
    else if (out.kind === 'var') tree = L.length ? L : R;
    else if (out.kind === 'sym' && L.length === 1 && L[0] === 'y' && MathInk.varsIn(R, null).length === 1 && !MathInk.varsIn(R, null).includes('y')) { tree = R; name = 'y'; }
    if (!tree) return null;
    const vars = MathInk.varsIn(tree, null);
    if (!v) v = vars.includes(c.toolVar) ? c.toolVar : vars[0];
    if (!v) return null;
    return { node: MathInk.symParse(tree), v, name, vars, tree };
  },
  toolsFor(out) {
    const T = [];
    const ex = this.exprOf(out);
    if (ex) {
      T.push({ op: 'diff', label: 'Ableiten', title: 'Ableitung mit Regeln Schritt für Schritt' },
        { op: 'int', label: '∫ Integrieren', title: 'Stammfunktion, mit Grenzen auch die Fläche' },
        { op: 'factor', label: 'Faktorisieren', title: 'Ausklammern, binomische Formeln, Nullstellen raten' },
        { op: 'expand', label: 'Ausmultiplizieren', title: 'Klammern auflösen' });
      if (ex.vars.length === 1) T.push({ op: 'curve', label: 'Kurvendiskussion', title: 'Nullstellen, Extrem- und Wendepunkte, Symmetrie – mit Graph' }, { op: 'taylor', label: 'Taylor', title: 'Taylorpolynom (Näherung durch ein Polynom)' });
    } else if (out.kind === 'solve' && out.vars && out.vars.length === 1) T.push({ op: 'graph', label: 'Graph', title: 'Beide Seiten als Graph – die Lösungen sind die Schnittpunkte' });
    else if (out.kind === 'value' && Number.isSafeInteger(out.num) && Math.abs(out.num) >= 2) T.push({ op: 'primes', label: 'Primfaktoren', title: 'Zahl in Primfaktoren zerlegen' });
    return T;
  },
  runOp(op, out) {
    const c = this.cur, ex = this.exprOf(out);
    const P = (s) => { const r = MathInk.fromText(String(s)); return MathInk.symParse(r.left); };
    if (op === 'primes') return MathCAS.primes(out.num);
    if (op === 'graph') {
      const v = out.vars[0];
      const Ln = MathInk.symParse(c.left || []), Rn = MathInk.symParse(c.right || []);
      const xs = (out.sols || []).filter(s => Number.isFinite(s.num)).map(s => s.num);
      const marks = xs.map(x => ({ x, y: MathInk.symEval(Ln, { [v]: x }), kind: 'S', label: `${v} = ${String(+x.toPrecision(6)).replace('-', '−')}` }));
      return { kind: 'cas', op: 'graph', extra: true, v, steps: [], text: '', plot: { fns: [Ln, Rn], marks, v, legend: ['linke Seite', 'rechte Seite'] }, problem: { tex: this.texOf(), text: this.textOf() } };
    }
    if (!ex) throw new Error('Kein Ausdruck');
    const { node, v, name } = ex;
    if (op === 'diff') { const r = MathCAS.diff(node, v, { name }); r.plot = { fns: [node, r.result], v, legend: [name ? `${name}(${v})` : 'Funktion', 'Ableitung'] }; if (ex.vars.length > 1) delete r.plot; return r; }
    if (op === 'int') {
      let b = null;
      if (c.bounds) { try { b = [P(c.bounds[0]), P(c.bounds[1])]; } catch (e) { b = null; } }
      const r = MathCAS.integrate(node, v, b);
      if (ex.vars.length === 1) r.plot = { fns: [node], v, shade: b ? [MathInk.symEval(b[0], {}), MathInk.symEval(b[1], {})] : null, legend: ['Funktion'] };
      return r;
    }
    if (op === 'factor') return MathCAS.factor(node, v);
    if (op === 'expand') return MathCAS.expandSteps(node);
    if (op === 'curve') { const r = MathCAS.curve(node, v, name || 'f'); r.plot = { fns: [r.f], marks: r.pts, v, legend: [`${name || 'f'}(${v})`] }; return r; }
    if (op === 'taylor') {
      const n = clamp(parseInt(c.tn, 10) || 4, 1, 8), x0 = Number.isFinite(+c.tx0) ? +c.tx0 : 0;
      const r = MathCAS.taylor(node, v, x0, n);
      r.plot = { fns: [node, r.result], v, legend: ['Funktion', `Taylor ${n}. Grades`], view: [x0 - 4, x0 + 4] };
      return r;
    }
    throw new Error('Unbekanntes Werkzeug');
  },
  compute0() {
    const c = this.cur, L = c.left || [], R = c.right;
    if (!L.length && !(R && R.length)) return { kind: 'empty' };
    if (MathInk.hasUnknown(L) || (R && MathInk.hasUnknown(R))) return { kind: 'unknown' };
    // Unbekannte (1.27): jeder Buchstabe; Gleichung mit mehreren → nach der gewählten auflösen (Formel umstellen)
    const fdef = this.funcOf(L, R);
    if (fdef) return { kind: 'func', ...fdef, vars: [fdef.v] };
    const vars = MathInk.varsIn(L, R);
    if (R && R.length && vars.length) {
      const v = vars.includes(c.solveFor) ? c.solveFor : vars[0];
      try {
        if (vars.length === 1) {
          // nur eine Unbekannte: wie bisher genau bzw. numerisch (dafür heisst sie intern x)
          const ren = (tree) => (tree || []).map(t => typeof t === 'string' ? (t === v ? 'x' : t) : Object.fromEntries(Object.entries(t).map(([k, x]) => [k, Array.isArray(x) ? ren(x) : x])));
          return { kind: 'solve', v, vars, sols: this.solve(ren(L), ren(R)) };
        }
        const r = MathInk.solveFor(L, R, v);
        if (r.error) return { kind: 'sym', v, vars, sols: [], error: r.error };
        return { kind: 'sym', v, vars, sols: r.sols };
      } catch (e) { return { kind: 'error', msg: e.message || 'Fehler' }; }
    }
    const hasX = vars.length > 0;
    try {
      if (!R || !R.length) {
        const side = L.length ? L : R;
        if (hasX) return { kind: 'var' };
        const r = this.ev(side);
        return { kind: 'value', ...this.fmt(r.v, r) };
      }
      if (!hasX) {
        const a = this.ev(L).v, b = this.ev(R).v;
        const ok = Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));
        return { kind: 'check', ok, a: this.fmt(a), b: this.fmt(b) };
      }
      return { kind: 'solve', sols: this.solve(L, R) };
    } catch (e) {
      return { kind: 'error', msg: e.message || 'Fehler' };
    }
  },
  /* Zahl → { tex (exakt, falls möglich), dec (Dezimal), num } */
  fmt(v, r) {
    if (CalcEngine.isC(v)) { const t = Calc.cplxHtml(v, false).replace(/<[^>]+>/g, '').replace(/−/g, '-'); return { tex: t.replace(/i$/, '\\,i'), dec: t, num: NaN }; }
    v = +(+v).toPrecision(13);
    const forms = Calc.forms(v, r || { dec: false, root: true, pi: false });
    const f = forms[0];
    const sgn = (n) => n < 0 ? '-' : '';
    const a = Math.abs(v);
    let dec, tex;
    if (a !== 0 && (a < 1e-4 || a >= 1e10)) {
      const e = Math.floor(Math.log10(a));
      let m = +(v / Math.pow(10, e)).toPrecision(10);
      let ee = e;
      if (Math.abs(m) >= 10) { m /= 10; ee++; }
      const sup = String(ee).replace(/-/g, '⁻').replace(/\d/g, d => '⁰¹²³⁴⁵⁶⁷⁸⁹'[d]);
      dec = `${String(m).replace('-', '−')}·10${sup}`;
      tex = `${m}\\cdot 10^{${ee}}`;
    } else {
      dec = String(+v.toPrecision(12)).replace('-', '−');
      tex = dec.replace('−', '-');
    }
    if (f.k === 'frac') tex = `${sgn(f.n)}\\frac{${Math.abs(f.n)}}{${f.d}}`;
    else if (f.k === 'surd') { const num = `${f.c > 1 ? f.c : ''}\\sqrt{${f.m}}`; tex = sgn(f.s) + (f.q > 1 ? `\\frac{${num}}{${f.q}}` : num); }
    else if (f.k === 'pi') { const nn = Math.abs(f.n); const num = `${nn === 1 ? '' : nn}\\pi`; tex = sgn(f.n) + (f.d > 1 ? `\\frac{${num}}{${f.d}}` : num); }
    return { tex, dec, num: v, exact: f.k !== 'dec' };
  },
  /* Gleichung mit x: linear und quadratisch exakt, sonst numerisch (Vorzeichenwechsel + Halbierung) */
  solve(L, R) {
    const f = (x) => { const a = this.ev(L, x).v, b = this.ev(R, x).v; if (CalcEngine.isC(a) || CalcEngine.isC(b)) return NaN; return a - b; };
    const near = (a, b) => Math.abs(a - b) <= 1e-7 * Math.max(1, Math.abs(a), Math.abs(b));
    let f0, f1, f2, f3, f4;
    try { f0 = f(0); f1 = f(1); f2 = f(2); f3 = f(-3.5); f4 = f(5.25); } catch (e) { f0 = NaN; }
    if ([f0, f1, f2, f3, f4].every(isFinite)) {
      const k = f1 - f0;
      if (near(f2 - f1, k) && near(f3, f0 - 3.5 * k) && near(f4, f0 + 5.25 * k)) {
        if (Math.abs(k) < 1e-12) return Math.abs(f0) < 1e-12 ? [{ all: true }] : [];
        return [this.fmt(-f0 / k, { dec: false, root: false })];
      }
      const a = (f2 - 2 * f1 + f0) / 2, b = f1 - f0 - a, c = f0;
      if (Math.abs(a) > 1e-12 && near(f3, a * 12.25 - 3.5 * b + c) && near(f4, a * 27.5625 + 5.25 * b + c)) {
        const D = b * b - 4 * a * c;
        if (D < -1e-12) return [];
        if (Math.abs(D) <= 1e-12) return [this.fmt(-b / (2 * a), { dec: false, root: false })];
        const s = Math.sqrt(D);
        return [(-b - s) / (2 * a), (-b + s) / (2 * a)].sort((p, q) => p - q).map(x => this.fmt(x, { dec: false, root: true }));
      }
    }
    // numerisch
    const out = [];
    const scan = (lo, hi, n) => {
      let px = lo, pv = NaN;
      try { pv = f(lo); } catch (e) { /* */ }
      for (let i = 1; i <= n; i++) {
        const x = lo + (hi - lo) * i / n;
        let v = NaN;
        try { v = f(x); } catch (e) { /* */ }
        if (isFinite(pv) && isFinite(v) && (pv === 0 || pv * v < 0)) {
          let a = px, b = x, fa = pv;
          if (pv === 0) b = a;
          for (let k = 0; k < 80 && b - a > 1e-13 * Math.max(1, Math.abs(a)); k++) { const m = (a + b) / 2; const fm = f(m); if (fa * fm <= 0) b = m; else { a = m; fa = fm; } }
          const r = (a + b) / 2;
          if (!out.some(q => Math.abs(q - r) < 1e-7 * Math.max(1, Math.abs(r))) && Math.abs(f(r)) < 1e-6 * Math.max(1, Math.abs(f(r + 1)))) out.push(r);
        }
        px = x; pv = v;
      }
    };
    scan(-100, 100, 4000); scan(-10000, 10000, 4000);
    return out.sort((a, b) => a - b).slice(0, 8).map(x => this.fmt(+x.toPrecision(12), { dec: true }));
  },

  /* ---------------------------------------------------------- Anzeige */
  texOf() {
    const c = this.cur;
    if (c.sys) return `\\begin{cases} ${c.sys.map(e => `${MathInk.toTex(e.left)} = ${MathInk.toTex(e.right)}`).join(' \\\\ ')} \\end{cases}`;
    if (c.cmd) return `\\text{${c.cmd.k}}(${c.cmd.nums.join(';\\, ')})`;
    const l = MathInk.toTex(c.left || []), r = c.right ? MathInk.toTex(c.right) : null;
    if (c.rel) return `${l} ${{ '<': '<', '>': '>', '<=': '\\leq', '>=': '\\geq', '≤': '\\leq', '≥': '\\geq' }[c.rel]} ${r}`;
    return r === null ? l : `${l} = ${r}`;
  },
  textOf() {
    const c = this.cur;
    if (c.sys) return c.sys.map(e => `${Calc.exprText(e.left)} = ${Calc.exprText(e.right)}`).join('; ');
    if (c.cmd) return `${c.cmd.k}(${c.cmd.nums.join('; ')})`;
    const l = Calc.exprText(c.left || []), r = c.right ? Calc.exprText(c.right) : null;
    if (c.rel) return `${l} ${{ '<=': '≤', '>=': '≥' }[c.rel] || c.rel} ${r}`;
    return r === null ? l : `${l} = ${r}`;
  },
  resultTex(out) {
    if (!out) return '';
    if (out.cas) return out.cas.tex || '';
    if (out.kind === 'value') return out.tex;
    const v = out.v || 'x';
    if (out.kind === 'solve') return out.sols.map(s => s.all ? `${v} \\in \\mathbb{R}` : `${v} = ${s.tex}`).join(',\\quad ');
    if (out.kind === 'sym') return out.sols.map(s => s.tex).join(',\\quad ');
    return '';
  },
  show() {
    const c = this.cur;
    if (!c) return;
    if (!this.panel) this.build();
    const out = this.compute();
    c.out = out;
    const tex = this.texOf();
    const P = this.panel;
    P.hidden = false;
    P.querySelector('.fm-formula').innerHTML = tex ? Formula.toMathML(tex, true) : '<span class="fm-empty">Nichts erkannt</span>';
    const inp = P.querySelector('.fm-text');
    if (document.activeElement !== inp) inp.value = this.textOf();
    let h = '';
    if (out.cas) h = this.casHtml(out.cas);
    else if (out.kind === 'func') h = `<div class="fm-hint2">Funktion ${escapeHtml(out.name)}(${escapeHtml(out.v)}) – Werkzeug wählen.</div>`;
    else if (out.kind === 'value') h = `<div class="fm-res">${Formula.toMathML('= ' + out.tex, true)}</div>${out.exact ? `<div class="fm-dec">≈ ${escapeHtml(out.dec)}</div>` : ''}`;
    else if (out.kind === 'check') h = `<div class="fm-check ${out.ok ? 'ok' : 'no'}">${out.ok ? '✓ Die Gleichung stimmt.' : `✗ Stimmt nicht: links ${escapeHtml(out.a.dec)}, rechts ${escapeHtml(out.b.dec)}`}</div>`;
    else if (out.kind === 'solve') h = out.sols.length ? `<div class="fm-res">${Formula.toMathML(this.resultTex(out), true)}</div>${out.sols.some(s => s.exact) ? `<div class="fm-dec">${out.sols.filter(s => !s.all).map(s => '≈ ' + escapeHtml(s.dec)).join(' · ')}</div>` : ''}` : '<div class="fm-check no">Keine (reelle) Lösung gefunden.</div>';
    else if (out.kind === 'sym') h = out.sols.length ? `<div class="fm-res">${Formula.toMathML(this.resultTex(out), true)}</div>` : `<div class="fm-check no">${escapeHtml(out.error || 'Keine (reelle) Lösung gefunden.')}</div>`;
    else if (out.kind === 'var') h = '<div class="fm-hint2">Ausdruck mit Unbekannten – oben ein Werkzeug wählen (Ableiten, Integrieren …) oder für eine Gleichung „= …“ dazuschreiben.</div>';
    // Auflösen nach … (1.27): Knöpfe je Unbekannte
    if (!out.cas && (out.kind === 'solve' || out.kind === 'sym') && out.vars && out.vars.length) {
      h = `<div class="fm-for"><span>Auflösen nach</span>${out.vars.map(x => `<button class="fm-var${x === out.v ? ' on' : ''}" data-var="${escapeHtml(x)}" title="Gleichung nach ${escapeHtml(x)} umstellen">${escapeHtml(x)}</button>`).join('')}</div>` + h;
    }
    else if (out.kind === 'unknown') h = '<div class="fm-hint2">Nicht alles erkannt (?). Rot markierte Zeichen in der Handschrift anklicken oder den Text oben korrigieren.</div>';
    else if (out.kind === 'error') h = `<div class="fm-check no">Fehler: ${escapeHtml(out.msg)}</div>`;
    else if (!h) h = '<div class="fm-hint2">Keine Rechnung erkannt.</div>';
    if (out.graph) h += this.casHtml(out.graph);   // Graph zur Gleichung (Schnittpunkte = Lösungen)
    h = this.toolsHtml(out) + h;
    P.querySelector('.fm-out').innerHTML = h;
    this.renderSteps();
    const canRes = out.cas ? !!out.cas.tex : out.kind === 'value' || ((out.kind === 'solve' || out.kind === 'sym') && out.sols.length);
    P.querySelectorAll('[data-act="next"], [data-act="formula"], [data-act="replace"]').forEach(b => { b.disabled = !tex; });
    P.querySelector('[data-act="next"]').disabled = !canRes;
    P.querySelector('[data-act="calc"]').disabled = !c.left || !c.left.length || out.kind === 'unknown' || !!c.sys || !!c.rel || !!c.cmd;
    P.querySelector('[data-act="replace"]').hidden = !c.inks.length;
    this.place();
    // im Fenster halten, wenn der Inhalt gewachsen ist (Rechenweg, Graph – 1.52)
    const r = P.getBoundingClientRect();
    if (r.bottom > innerHeight - 8) P.style.top = Math.max(8, innerHeight - 8 - r.height) + 'px';
    this.drawLabels();
  },
  /* Werkzeuge (1.52): Knöpfe je nach Rechnung; aktiver Knopf = Ergebnis des Werkzeugs, nochmals klicken = aus */
  toolsHtml(out) {
    const c = this.cur, T = out.tools || [];
    if (!T.length) return '';
    const ex = this.exprOf(out);
    const vs = ex && ex.vars.length > 1 && ['diff', 'int', 'factor'].includes(c.op) ? `<span class="fm-tvar">nach</span>${ex.vars.map(x => `<button class="fm-var${x === ex.v ? ' on' : ''}" data-tvar="${escapeHtml(x)}">${escapeHtml(x)}</button>`).join('')}` : '';
    return `<div class="fm-tools">${T.map(t => `<button class="fm-tool${c.op === t.op ? ' on' : ''}" data-op="${t.op}" title="${escapeHtml(t.title)}">${escapeHtml(t.label)}</button>`).join('')}${vs}</div>`;
  },
  casHtml(r) {
    const c = this.cur;
    let h = '';
    if (r.tex) h += `<div class="fm-res">${Formula.toMathML(r.tex, true)}</div>`;
    if (r.error) h += `<div class="fm-check no">${escapeHtml(r.error)}</div>`;
    if (r.op === 'int') {
      const b = c.bounds || ['', ''];
      h += `<div class="fm-opt">Grenzen: von <input class="fm-in" data-b="0" value="${escapeHtml(b[0])}" placeholder="a"> bis <input class="fm-in" data-b="1" value="${escapeHtml(b[1])}" placeholder="b"><button class="btn" data-act="bounds" title="Bestimmtes Integral (Fläche) berechnen">Fläche</button>${c.bounds ? '<button class="btn" data-act="nobounds" title="Wieder unbestimmt">×</button>' : ''}</div>`;
    }
    if (r.op === 'taylor') h += `<div class="fm-opt">Grad <input class="fm-in" data-t="n" value="${escapeHtml(String(c.tn || 4))}"> um ${escapeHtml(r.v)}₀ = <input class="fm-in" data-t="x0" value="${escapeHtml(String(c.tx0 || 0))}"><button class="btn" data-act="taylor">Neu</button></div>`;
    if (r.plot) {
      try { h += `<div class="fm-graph">${this.graphSvg(r.plot, false)}</div><div class="fm-opt"><button class="btn" data-act="graphins" title="Den Graphen als Bild unter die Rechnung setzen">Graph einfügen</button></div>`; } catch (e) { /* Graph nicht möglich */ }
    }
    return h;
  },
  /* Graph als SVG (Achsen, Gitter, Kurven, besondere Punkte); light = feste Farben für das Bild */
  graphSvg(pl, light) {
    const W = 352, H = 220, pad = 22;
    const marks = (pl.marks || []).filter(m => Number.isFinite(m.x) && Number.isFinite(m.y));
    const D = MathCAS.plot(pl.fns, pl.v, marks, pl.view || (pl.shade ? [Math.min(pl.shade[0], pl.shade[1]) - 2, Math.max(pl.shade[0], pl.shade[1]) + 2] : null));
    const dark = !light && document.body.dataset.theme === 'dunkel';
    const ink = dark ? '#d0d0d0' : '#333', grid = dark ? '#3a3a3a' : '#e6e6e6', bg = light ? '#ffffff' : 'none';
    const cols = ['#2f6fd6', '#e8590c', '#2b8a3e'];
    const X = (x) => pad + (x - D.x0) / (D.x1 - D.x0) * (W - 2 * pad), Y = (y) => H - pad - (y - D.y0) / (D.y1 - D.y0) * (H - 2 * pad);
    const step = (a, b) => { const r = (b - a) / 8, p = Math.pow(10, Math.floor(Math.log10(r))); const m = r / p; return (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * p; };
    const fmt = (v) => String(+v.toPrecision(4)).replace('-', '−');
    let g = `<rect width="${W}" height="${H}" fill="${bg}"/>`;
    const sx = step(D.x0, D.x1), sy = step(D.y0, D.y1);
    for (let x = Math.ceil(D.x0 / sx) * sx; x <= D.x1; x += sx) g += `<line x1="${X(x)}" y1="${pad / 2}" x2="${X(x)}" y2="${H - pad}" stroke="${grid}"/>` + (Math.abs(x) > sx / 2 ? `<text x="${X(x)}" y="${H - 6}" font-size="9" text-anchor="middle" fill="${ink}">${fmt(x)}</text>` : '');
    for (let y = Math.ceil(D.y0 / sy) * sy; y <= D.y1; y += sy) g += `<line x1="${pad}" y1="${Y(y)}" x2="${W - pad / 2}" y2="${Y(y)}" stroke="${grid}"/>` + (Math.abs(y) > sy / 2 ? `<text x="${pad - 3}" y="${Y(y) + 3}" font-size="9" text-anchor="end" fill="${ink}">${fmt(y)}</text>` : '');
    if (D.y0 < 0 && D.y1 > 0) g += `<line x1="${pad}" y1="${Y(0)}" x2="${W - pad / 2}" y2="${Y(0)}" stroke="${ink}" stroke-width="1.1"/>`;
    if (D.x0 < 0 && D.x1 > 0) g += `<line x1="${X(0)}" y1="${pad / 2}" x2="${X(0)}" y2="${H - pad}" stroke="${ink}" stroke-width="1.1"/>`;
    // Fläche unter der Kurve (bestimmtes Integral)
    if (pl.shade && D.series[0]) {
      const [a, b] = [Math.min(...pl.shade), Math.max(...pl.shade)];
      const pts = D.series[0].filter(([x, y]) => x >= a && x <= b && Number.isFinite(y)).map(([x, y]) => [X(x), Y(clamp(y, D.y0, D.y1))]);
      if (pts.length > 1) g += `<path d="M${X(a)},${Y(0)} ${pts.map(p => 'L' + p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ')} L${X(b)},${Y(0)} Z" fill="${cols[0]}" fill-opacity=".22"/>`;
    }
    D.series.forEach((ser, i) => {
      let d = '', pen = false, py = null;
      for (const [x, y] of ser) {
        // Polstellen/Ausreisser: Linie unterbrechen
        if (!Number.isFinite(y) || y < D.y0 - (D.y1 - D.y0) * 3 || y > D.y1 + (D.y1 - D.y0) * 3 || (py !== null && Math.abs(y - py) > (D.y1 - D.y0) * 1.5)) { pen = false; py = Number.isFinite(y) ? y : null; continue; }
        d += (pen ? 'L' : 'M') + X(x).toFixed(1) + ',' + Y(y).toFixed(1) + ' ';
        pen = true; py = y;
      }
      g += `<path d="${d}" fill="none" stroke="${cols[i % 3]}" stroke-width="2" stroke-linejoin="round"/>`;
    });
    for (const m of marks) {
      if (m.x < D.x0 || m.x > D.x1 || m.y < D.y0 || m.y > D.y1) continue;
      const col = m.kind === 'H' || m.kind === 'T' ? '#c92a2a' : m.kind === 'W' ? '#7048e8' : m.kind === 'N' ? '#2b8a3e' : ink;
      g += `<circle cx="${X(m.x)}" cy="${Y(m.y)}" r="3.6" fill="${col}"><title>${escapeHtml(m.label || '')}</title></circle>`;
      if (m.kind && m.kind !== 'N' && m.kind !== 'S') g += `<text x="${X(m.x) + 5}" y="${Y(m.y) - 5}" font-size="10" font-weight="600" fill="${col}">${m.kind}</text>`;
    }
    if (pl.legend && pl.legend.length > 1) pl.legend.forEach((t, i) => { g += `<rect x="${W - 112}" y="${8 + i * 14}" width="10" height="3" fill="${cols[i % 3]}"/><text x="${W - 98}" y="${12 + i * 14}" font-size="9.5" fill="${ink}">${escapeHtml(t)}</text>`; });
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family="Segoe UI, Arial, sans-serif">${g}</svg>`;
  },
  /* Graph als Bild (PNG) unter die Rechnung */
  async insertGraph() {
    const c = this.cur, r = c && c.out && (c.out.cas || c.out.graph);
    if (!r || !r.plot) return;
    const svg = this.graphSvg(r.plot, true);
    const img = new Image();
    const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
    try {
      await new Promise((ok, no) => { img.onload = ok; img.onerror = no; img.src = url; });
      const cv = document.createElement('canvas');
      cv.width = 352 * 2; cv.height = 220 * 2;
      const ctx = cv.getContext('2d');
      ctx.scale(2, 2); ctx.drawImage(img, 0, 0);
      const blob = await new Promise(res => cv.toBlob(res, 'image/png'));
      const b = c.bbox;
      await Canvas.insertImage(null, blob, { x: b.x, y: b.y + b.h + 24 }, null, { tight: true, label: 'Fotomath: Graph eingefügt' });
      UI.toast('Graph eingefügt (Strg+Z = zurück)');
    } catch (e) { UI.toast('Der Graph konnte nicht eingefügt werden'); }
    finally { URL.revokeObjectURL(url); }
  },
  build() {
    const P = el('div', { class: 'fm-panel', hidden: true, role: 'dialog', 'aria-label': 'Fotomath' });
    P.innerHTML = `<div class="fm-head"><span class="fm-logo">${icon('fotomath', 15)}</span><b>Fotomath</b><span class="fm-sub">Handschrift → Rechnung</span><button class="fm-x" data-act="close" title="Schliessen (Esc)">×</button></div>
      <div class="fm-body"><div class="fm-formula"></div>
      <label class="fm-lab">Erkannt als Text – korrigieren und Enter:</label><input class="fm-text" spellcheck="false" placeholder="z.B. 3/4 + 2^2·√9 =  ·  2x + 3 = 7  ·  x+y=5; x−y=1  ·  3x < 9  ·  d/dx x²·sin(x)  ·  ∫[0;2] x² dx  ·  ggT(12;18)">
      <div class="fm-out"></div>
      <div class="fm-steps"></div>
      <div class="fm-ins"><span class="fm-ins-l">Als Text einfügen:</span><button class="btn" data-act="txtres" title="Nur die Rechnung mit dem Ergebnis als Text unter die Handschrift">Ergebnis</button><button class="btn" data-act="txtsteps" title="Den ganzen Rechenweg Zeile für Zeile als Text unter die Handschrift">Mit Rechenweg</button>
        <label class="fm-kb" title="Statt · − ² √ π ± ≈ nur Zeichen der Tastatur: * - ^ sqrt() pi +- ~"><input type="checkbox" class="fm-ascii"> nur Tastaturzeichen (* / ^ sqrt)</label></div>
      <div class="fm-btns"><button class="btn primary" data-act="next" title="„= Ergebnis“ rechts neben die Handschrift setzen">= Ergebnis daneben</button><button class="btn" data-act="formula" title="Die ganze Rechnung als schöne Formel unter die Handschrift setzen">Als Formel</button><button class="btn" data-act="replace" title="Handschrift durch die Formel ersetzen (Strg+Z macht es rückgängig)">Ersetzen</button><button class="btn" data-act="calc" title="Rechnung im Taschenrechner öffnen">Im Rechner</button><button class="btn" data-act="copy" title="Rechnung und Ergebnis als Text kopieren">Kopieren</button></div>
      <div class="fm-hint">Etikett über einem Zeichen anklicken = andere Erkennung wählen. Korrekturen merkt sich Fotomath und lernt so deine Handschrift.</div></div>`;
    document.body.append(P);
    this.panel = P;
    P.querySelector('.fm-head').addEventListener('pointerdown', (e) => { if (!e.target.closest('button')) this.drag(e); });
    // „Auflösen nach“ schon beim Drücken (sonst baut das Verlassen des Textfelds die Knöpfe neu, bevor der Klick ankommt)
    P.addEventListener('pointerdown', (e) => {
      if (!this.cur) return;
      const tb = e.target.closest('[data-op]'), tv = e.target.closest('[data-tvar]');
      if (tb) { e.preventDefault(); this.cur.op = this.cur.op === tb.dataset.op ? null : tb.dataset.op; this.show(); return; }   // Werkzeug an/aus (1.52)
      if (tv) { e.preventDefault(); this.cur.toolVar = tv.dataset.tvar; this.show(); return; }
      const vb = e.target.closest('[data-var]');
      if (!vb) return;
      e.preventDefault();
      this.cur.solveFor = vb.dataset.var;
      this.show();
    });
    // Eingabefelder der Werkzeuge (Grenzen, Taylor): Enter = rechnen, Tasten nicht an die Seite weitergeben
    P.addEventListener('keydown', (e) => {
      const f = e.target.closest('.fm-in');
      if (!f) return;
      e.stopPropagation();
      if (e.key === 'Enter') { e.preventDefault(); this.act(f.dataset.b != null ? 'bounds' : 'taylor'); }
    });
    P.addEventListener('click', (e) => { const b = e.target.closest('[data-act]'); if (b && !b.disabled) this.act(b.dataset.act); });
    const asc = P.querySelector('.fm-ascii');
    asc.checked = !!this.prefs().ascii;
    asc.addEventListener('change', () => { this.prefs().ascii = asc.checked; UiState.saveSoon(); this.renderSteps(); });
    const inp = P.querySelector('.fm-text');
    inp.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') { e.preventDefault(); this.fromText(inp.value); }
      if (e.key === 'Escape') { e.preventDefault(); this.close(); }
    });
    inp.addEventListener('change', () => this.fromText(inp.value));
    P.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); this.close(); } });
  },
  prefs() {
    const u = Store.ui;
    if (!u.fotomath || typeof u.fotomath !== 'object') u.fotomath = { steps: true, ascii: false };
    return u.fotomath;
  },
  /* Rechenweg (1.38): Schritte mit Erklärung, aufklappbar; andere Formen des Ergebnisses */
  renderSteps() {
    const c = this.cur, P = this.panel;
    if (!c || !P) return;
    const box = P.querySelector('.fm-steps');
    let res = null;
    const cas = c.out && c.out.cas;
    if (cas) res = cas.steps && cas.steps.length ? cas : null;   // Werkzeug (1.52): eigener Rechenweg
    else try { res = typeof MathSteps !== 'undefined' && c.out && !['unknown', 'empty', 'error', 'var', 'func'].includes(c.out.kind) ? MathSteps.solve(c.left || [], c.right, { v: c.out.v }) : null; } catch (e) { res = null; }
    c.steps = res && res.steps && res.steps.length ? res : null;
    P.querySelectorAll('[data-act="txtres"], [data-act="txtsteps"]').forEach(b => { b.disabled = !c.steps && !(c.out && (c.out.kind === 'value' || c.out.kind === 'solve' || c.out.kind === 'sym')); });
    if (cas) P.querySelectorAll('[data-act="txtres"]').forEach(b => { b.disabled = !cas.text; });
    P.querySelector('[data-act="txtsteps"]').disabled = !c.steps || c.steps.steps.length < 2;
    if (!c.steps || c.steps.steps.length < 2) { box.innerHTML = ''; return; }
    const open = this.prefs().steps !== false;
    const S = c.steps;
    const items = [];
    if (S.kind === 'cas') {
      for (const st of S.steps) items.push({ t: st.title, note: st.note, tex: st.tex, op: st.op });
    } else if (S.kind === 'arith') {
      S.steps.forEach((st, i) => items.push({ t: i ? st.title : 'Aufgabe', note: st.note, tex: (i ? '= ' : '') + MathSteps.tex(st.n) }));
      for (const a of S.alt || []) items.push({ t: a.label, tex: (a.u.startsWith('≈') ? '\\approx ' + a.u.slice(1).trim() : (a.approx ? '\\approx ' : '= ') + a.u).replace(/−/g, '-'), alt: true });
    } else {
      for (const st of S.steps) items.push({ t: st.title, note: st.note, tex: st.tex, op: st.op });
    }
    const n = items.length - 1;
    box.innerHTML = `<button class="fm-tog${open ? ' on' : ''}" data-act="steps" title="Rechenweg ein-/ausblenden">${icon(open ? 'chevDown' : 'chevRight', 12)}<span>Rechenweg</span><small>${n} ${n === 1 ? 'Schritt' : 'Schritte'}</small></button>` +
      (open ? `<ol class="fm-steplist">${items.map((it, i) => `<li class="${it.alt ? 'alt' : ''}"><span class="fm-st-n">${it.alt ? '=' : i ? i : '•'}</span><div class="fm-st-b"><div class="fm-st-t">${escapeHtml(MathSteps.pretty(it.t || ''))}${it.op ? `<span class="fm-op">${escapeHtml(it.op)}</span>` : ''}</div>${it.note ? `<div class="fm-st-note">${escapeHtml(it.note)}</div>` : ''}${it.tex ? `<div class="fm-st-e">${Formula.toMathML(it.tex, false)}</div>` : ''}</div></li>`).join('')}</ol>` : '');
  },
  /* Text der Rechnung: nur Ergebnis oder mit Rechenweg, mathematische oder Tastaturzeichen */
  textLines(steps) {
    const c = this.cur, ascii = !!this.prefs().ascii;
    if (c.out && c.out.cas) return MathCAS.lines(c.out.cas, { steps, ascii });
    if (c.steps) return MathSteps.lines(c.steps, { steps, ascii });
    const out = c.out || this.compute(), v = out.v || 'x';
    const res = out.kind === 'value' ? ' = ' + out.dec : out.kind === 'solve' ? '  ⇒  ' + out.sols.map(s => s.all ? 'alle ' + v : v + ' = ' + s.dec).join(', ') : out.kind === 'sym' ? '  ⇒  ' + out.sols.map(s => s.text).join(', ') : '';
    const line = this.textOf() + res;
    return [ascii ? MathSteps.keyb(line) : line];
  },
  insertText(steps) {
    const c = this.cur;
    const lines = this.textLines(steps);
    if (!lines.length) return;
    const html = lines.map(l => {
      const m = /^(.*?)(\s{3,}.*)$/.exec(l);
      return m ? `<div>${escapeHtml(m[1])}<span style="color: rgb(122, 122, 122);">${escapeHtml(m[2].replace(/\s{3,}/g, '   '))}</span></div>` : `<div>${escapeHtml(l)}</div>`;
    }).join('');
    const longest = Math.max(...lines.map(l => l.length));
    const b = c.bbox;
    const bx = Canvas.createBoxAt({ x: b.x, y: b.y + b.h + 24 }, { html, noFocus: true, w: clamp(Math.round(longest * 7.2) + 30, 220, 760), label: steps ? 'Fotomath: Rechenweg eingefügt' : 'Fotomath: Ergebnis eingefügt' });
    if (bx) Canvas.select([bx.id]);
    this.close();
    UI.toast((steps ? 'Rechenweg' : 'Ergebnis') + ' als Text eingefügt (Strg+Z = zurück)');
  },
  /* getippte Eingabe (seit 1.52 auch Gleichungssysteme mit „;“, Ungleichungen, ggT/kgV und Befehle wie in Derive) */
  fromText(t) {
    const c = this.cur;
    if (!c) return;
    c.sys = c.rel = c.cmd = null;
    c.text = t;
    const s = String(t || '').trim();
    let m, body = s, op = null, bounds = null;
    if ((m = /^(ggt|kgv|gcd|lcm)\s*\(([^)]*)\)\s*=?$/i.exec(s))) {
      c.cmd = { k: /^(ggt|gcd)$/i.test(m[1]) ? 'ggT' : 'kgV', nums: m[2].split(/[;,\s]+/).filter(Boolean).map(Number).filter(Number.isFinite) };
      c.left = []; c.right = null;
      this.show();
      return;
    }
    if ((m = /^d\s*\/\s*d([a-z])\s*(.+)$/i.exec(s))) { op = 'diff'; c.toolVar = m[1]; body = m[2]; }
    else if ((m = /^(?:∫|int\b)\s*(?:\[\s*([^;\]]+?)\s*[;|]\s*([^\]]+?)\s*\])?\s*(.+?)\s*(?:\bd([a-z]))?$/i.exec(s))) { op = 'int'; body = m[3]; if (m[4]) c.toolVar = m[4]; bounds = m[1] ? [m[1], m[2]] : null; }
    else if ((m = /^(?:faktor(?:isiere)?|factor)\s*\((.+)\)$/i.exec(s))) { op = 'factor'; body = m[1]; }
    else if ((m = /^(?:ausmultiplizieren|expand)\s*\((.+)\)$/i.exec(s))) { op = 'expand'; body = m[1]; }
    const parts = body.split(/\s*[;\n]\s*/).filter(Boolean);
    if (!op && parts.length >= 2 && parts.every(p => /=/.test(p))) {
      c.sys = parts.map(p => MathInk.fromText(p)).map(r => ({ left: r.left, right: r.right || [] }));
      c.left = c.sys[0].left; c.right = c.sys[0].right;
      this.show();
      return;
    }
    const rm = !op && /(<=|>=|≤|≥|<|>)/.exec(body);
    if (rm) {
      c.rel = rm[1];
      c.left = MathInk.fromText(body.slice(0, rm.index)).left;
      c.right = MathInk.fromText(body.slice(rm.index + rm[0].length)).left;
      this.show();
      return;
    }
    const r = MathInk.fromText(body);
    c.left = r.left; c.right = r.right;
    if (op) { c.op = op; c.bounds = bounds; }
    this.show();
  },
  place() {
    const P = this.panel, c = this.cur;
    if (this._placed) return;
    this._placed = true;
    const vr = Canvas.vp.getBoundingClientRect(), z = Canvas.view.z;
    const sx = vr.left + Canvas.view.x + (c.bbox.x + c.bbox.w) * z, sy = vr.top + Canvas.view.y + c.bbox.y * z;
    const W = P.offsetWidth || 360, H = P.offsetHeight || 300;
    let x = sx + 24, y = sy - 10;
    if (x + W > innerWidth - 8) x = Math.max(8, vr.left + Canvas.view.x + c.bbox.x * z - W - 24);
    if (x < 8) x = Math.max(8, innerWidth - W - 16);
    y = clamp(y, 60, Math.max(60, innerHeight - H - 16));
    P.style.left = x + 'px'; P.style.top = y + 'px';
  },
  drag(e) {
    e.preventDefault();
    const P = this.panel, r = P.getBoundingClientRect(), sx = e.clientX, sy = e.clientY;
    const mv = (ev) => { P.style.left = clamp(r.left + ev.clientX - sx, -r.width + 80, innerWidth - 80) + 'px'; P.style.top = clamp(r.top + ev.clientY - sy, 0, innerHeight - 40) + 'px'; };
    const up = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); };
    addEventListener('pointermove', mv); addEventListener('pointerup', up);
  },
  /* Etiketten über den erkannten Zeichen (in der Seite, zoomen mit) */
  drawLabels() {
    let ov = this.ov;
    if (!ov) { ov = this.ov = el('div', { class: 'fm-ov ui-only' }); ov.addEventListener('pointerdown', (e) => { const t = e.target.closest('.fm-lab2'); if (!t) return; e.stopPropagation(); e.preventDefault(); this.pick(t); }); }
    if (ov.parentNode !== Canvas.world) Canvas.world.append(ov);
    const c = this.cur;
    const b = c.bbox;
    let h = `<div class="fm-frame" style="left:${b.x - 6}px;top:${b.y - 6}px;width:${b.w + 12}px;height:${b.h + 12}px"></div>`;
    if (c.res && !c.text) {
      const fs = clamp(c.res.H * 0.55, 8, 16);
      c.res.syms.forEach((s, i) => {
        const lab = { '·': '·', '.': '.', '−': '−', '?': '?' }[s.cls] || s.cls;
        h += `<div class="fm-lab2${s.cls === '?' ? ' bad' : ''}${s.forced ? ' fixed' : ''}${s.auto && !s.forced ? ' auto' : ''}" data-i="${i}" style="left:${s.box.x + s.box.w / 2}px;top:${s.box.y - 2}px;font-size:${fs}px" title="Erkannt: ${escapeHtml(lab)}${s.auto ? ' (aus dem Zusammenhang – sonst ' + escapeHtml(s.alts[0]) + ')' : ''} – Klick = ändern">${escapeHtml(lab)}</div>`;
      });
    }
    ov.innerHTML = h;
  },
  pick(t) {
    const c = this.cur, s = c && c.res && c.res.syms[+t.dataset.i];
    if (!s) return;
    const r = t.getBoundingClientRect();
    const opts = [...new Set([...s.alts.filter(a => a !== '?'), '0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '+', '−', '×', '÷', '=', '(', ')', '.', 'x', 'y', 'π'])];
    UI.menu([{ head: 'Dieses Zeichen ist …' }, ...opts.slice(0, 26).map(o => ({ label: o === '×' ? '× (mal)' : o === '÷' ? '÷ (geteilt)' : o === '.' ? '. (Dezimalpunkt)' : o === 'x' ? 'x (Variable)' : o, checked: o === s.cls, action: () => this.override(s, o) })), '-', { label: 'Ignorieren (kein Zeichen)', action: () => this.override(s, '') }], r.left, r.bottom + 2);
  },
  override(s, cls) {
    const c = this.cur;
    const real = cls;
    if (cls === '') {
      // Zeichen weglassen: Striche aus der Erkennung nehmen
      const ids = new Set(s.strokes.map(q => q.id));
      c.strokes = c.strokes.filter(q => !ids.has(q.id));
    } else {
      c.overrides.set(s.key, real);
      if (/^[0-9()x+π]$/.test(real) && !s.kind && real !== s.cls) this.learn(s, real);
    }
    this.recognize();
  },

  /* ---------------------------------------------------------- Einfügen */
  act(a) {
    const c = this.cur;
    if (a === 'close') { this.close(); return; }
    if (!c) return;
    if (a === 'steps') { this.prefs().steps = this.prefs().steps === false; UiState.saveSoon(); this.renderSteps(); return; }
    if (a === 'txtres' || a === 'txtsteps') { this.insertText(a === 'txtsteps'); return; }
    // Werkzeug-Einstellungen (1.52)
    const P = this.panel;
    if (a === 'bounds') { const v = [...P.querySelectorAll('[data-b]')].map(i => i.value.trim()); c.bounds = v[0] && v[1] ? v : null; if (!c.bounds) UI.toast('Beide Grenzen eingeben, z. B. 0 und 2'); this.show(); return; }
    if (a === 'nobounds') { c.bounds = null; this.show(); return; }
    if (a === 'taylor') { c.tn = P.querySelector('[data-t="n"]')?.value; c.tx0 = (P.querySelector('[data-t="x0"]')?.value || '0').replace(',', '.').replace('−', '-'); this.show(); return; }
    if (a === 'graphins') { this.insertGraph(); return; }
    const out = c.out || this.compute();
    const resTex = out.cas ? out.cas.tex || '' : out.kind === 'value' ? out.tex : out.kind === 'solve' || out.kind === 'sym' ? this.resultTex(out) : '';
    const fullTex = () => {
      if (out.cas) return `${out.cas.problem && out.cas.problem.tex ? out.cas.problem.tex : this.texOf()} \quad\Rightarrow\quad ${resTex}`;
      const l = MathInk.toTex(c.left || []);
      if (out.kind === 'value') return `${l || MathInk.toTex(c.right || [])} = ${out.tex}`;
      if (out.kind === 'solve' || out.kind === 'sym') return `${this.texOf()} \\quad\\Rightarrow\\quad ${resTex}`;
      return this.texOf();
    };
    const box = (pt, tex, w) => Canvas.createBoxAt(pt, { html: `<div>${Formula.spanHtml(tex, false)}</div>`, noFocus: true, w: w || 260, label: 'Fotomath: Formel eingefügt' });
    const b = c.bbox;
    if (a === 'next') {
      if (!resTex) return;
      const bx = box({ x: b.x + b.w + 18, y: b.y + b.h / 2 - 12 }, !out.cas && out.kind === 'value' && !(c.right && c.right.length === 0) ? '= ' + resTex : resTex, out.cas ? 320 : 220);
      if (bx) { bx.style = { ...(bx.style || {}), bg: 'transparent' }; Canvas.render(); Canvas.select([bx.id]); }
      this.close();
      UI.toast('Ergebnis eingefügt (Strg+Z = zurück)');
    } else if (a === 'formula') {
      const bx = box({ x: b.x, y: b.y + b.h + 24 }, fullTex(), Math.max(240, Math.min(640, b.w + 40)));
      if (bx) Canvas.select([bx.id]);
      this.close();
    } else if (a === 'replace') {
      const p = Canvas.page;
      const ids = new Set(c.inks.map(d => d.id));
      p.drawings = p.drawings.filter(d => !ids.has(d.id));
      if (typeof Draw !== 'undefined') { Draw.sel.clear(); Draw.render(); }
      const bx = Canvas.createBoxAt({ x: b.x, y: b.y + Math.max(0, b.h / 2 - 14) }, { html: `<div>${Formula.spanHtml(fullTex(), false)}</div>`, noFocus: true, w: Math.max(240, Math.min(640, b.w + 60)), label: 'Fotomath: Handschrift ersetzt' });
      if (bx) Canvas.select([bx.id]);
      this.close();
      UI.toast('Handschrift durch die Formel ersetzt (Strg+Z = zurück)');
    } else if (a === 'calc') {
      Calc.loadExpression(c.left && c.left.length ? c.left : c.right || [], true);
    } else if (a === 'copy') {
      // Rechenweg mit, wenn er aufgeklappt ist; Zeichen wie beim Einfügen gewählt
      const txt = this.textLines(!!c.steps && this.prefs().steps !== false).join('\n');
      navigator.clipboard?.writeText(txt).then(() => UI.toast('Kopiert'), () => UI.toast('Kopieren nicht möglich'));
    }
  },
  close() {
    if (this.panel) this.panel.hidden = true;
    if (this.ov) this.ov.remove();
    this.cur = null;
    this._placed = false;
  },
};
