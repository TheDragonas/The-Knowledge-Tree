'use strict';
/* Formeln wie in Office: Eingabe mit Bausteinen und Symbolen (LaTeX-ähnlich), Anzeige als MathML.
 * Im Textfeld: <span class="kt-math" contenteditable="false" data-tex="…"><math>…</math></span> */

const MATH_SYMBOLS = {
  alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', epsilon: 'ε', varepsilon: 'ε', zeta: 'ζ', eta: 'η', theta: 'θ', vartheta: 'ϑ', iota: 'ι', kappa: 'κ',
  lambda: 'λ', mu: 'μ', nu: 'ν', xi: 'ξ', pi: 'π', varpi: 'ϖ', rho: 'ρ', sigma: 'σ', varsigma: 'ς', tau: 'τ', upsilon: 'υ', phi: 'φ', varphi: 'φ',
  chi: 'χ', psi: 'ψ', omega: 'ω', Gamma: 'Γ', Delta: 'Δ', Theta: 'Θ', Lambda: 'Λ', Xi: 'Ξ', Pi: 'Π', Sigma: 'Σ', Upsilon: 'Υ', Phi: 'Φ', Psi: 'Ψ', Omega: 'Ω',
  infty: '∞', partial: '∂', nabla: '∇', hbar: 'ℏ', ell: 'ℓ', emptyset: '∅', aleph: 'ℵ', Re: 'ℜ', Im: 'ℑ', degree: '°', prime: '′',
  N: 'ℕ', Z: 'ℤ', Q: 'ℚ', R: 'ℝ', C: 'ℂ', square: '□',
};
const MATH_OPS = {
  pm: '±', mp: '∓', times: '×', div: '÷', cdot: '·', ast: '∗', circ: '∘', bullet: '•', leq: '≤', le: '≤', geq: '≥', ge: '≥', neq: '≠', ne: '≠',
  approx: '≈', equiv: '≡', sim: '∼', simeq: '≃', cong: '≅', propto: '∝', ll: '≪', gg: '≫', in: '∈', notin: '∉', ni: '∋', subset: '⊂', supset: '⊃',
  subseteq: '⊆', supseteq: '⊇', cup: '∪', cap: '∩', setminus: '∖', forall: '∀', exists: '∃', neg: '¬', land: '∧', lor: '∨', wedge: '∧', vee: '∨',
  to: '→', rightarrow: '→', leftarrow: '←', leftrightarrow: '↔', Rightarrow: '⇒', Leftarrow: '⇐', Leftrightarrow: '⇔', mapsto: '↦', implies: '⇒', iff: '⇔',
  uparrow: '↑', downarrow: '↓', perp: '⊥', parallel: '∥', angle: '∠', triangle: '△', ldots: '…', cdots: '⋯', vdots: '⋮', ddots: '⋱', dots: '…',
  langle: '⟨', rangle: '⟩', lfloor: '⌊', rfloor: '⌋', lceil: '⌈', rceil: '⌉', mid: '∣', vert: '|', Vert: '‖', colon: ':', therefore: '∴', because: '∵',
};
const MATH_BIG = { sum: '∑', prod: '∏', coprod: '∐', int: '∫', iint: '∬', iiint: '∭', oint: '∮', bigcup: '⋃', bigcap: '⋂' };
const MATH_FUNCS = ['sin', 'cos', 'tan', 'cot', 'sec', 'csc', 'arcsin', 'arccos', 'arctan', 'sinh', 'cosh', 'tanh', 'log', 'ln', 'lg', 'exp', 'lim', 'max', 'min', 'sup', 'inf', 'det', 'dim', 'ker', 'deg', 'gcd', 'arg', 'mod'];
const MATH_ACCENTS = { vec: '→', bar: '¯', overline: '¯', hat: '^', widehat: '^', tilde: '~', dot: '˙', ddot: '¨', overrightarrow: '→' };

const Formula = {
  /* ---------------------------------------------------------- LaTeX -> MathML */
  toMathML(tex, display) {
    let i = 0;
    const s = String(tex || '');
    let fnFlag = false;
    const esc = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const peek = () => s[i];
    const skipWs = () => { while (i < s.length && /\s/.test(s[i])) i++; };
    const readCmd = () => { // nach dem Backslash
      let n = '';
      if (/[a-zA-Z]/.test(s[i])) { while (i < s.length && /[a-zA-Z]/.test(s[i])) n += s[i++]; }
      else n = s[i++] || '';
      return n;
    };
    const group = () => { // {…} oder ein einzelnes Element
      skipWs();
      if (peek() === '{') { i++; const r = expr('}'); if (peek() === '}') i++; return `<mrow>${r}</mrow>`; }
      return atom() || '<mrow></mrow>';
    };
    const rawGroup = () => {
      skipWs();
      if (peek() !== '{') { const c = s[i++] || ''; return c; }
      i++;
      let depth = 1, out = '';
      while (i < s.length && depth) { const c = s[i++]; if (c === '{') depth++; else if (c === '}') { depth--; if (!depth) break; } out += c; }
      return out;
    };
    const optArg = () => {
      skipWs();
      if (peek() !== '[') return null;
      i++;
      const r = expr(']');
      if (peek() === ']') i++;
      return `<mrow>${r}</mrow>`;
    };
    const fence = (d) => {
      if (d === '.' || !d) return '';
      const map = { '\\{': '{', '\\}': '}', '\\langle': '⟨', '\\rangle': '⟩', '\\|': '‖', '\\vert': '|', '\\lfloor': '⌊', '\\rfloor': '⌋', '\\lceil': '⌈', '\\rceil': '⌉' };
      return `<mo fence="true" stretchy="true">${esc(map[d] || d)}</mo>`;
    };
    const readDelim = () => {
      skipWs();
      if (peek() === '\\') { i++; const n = readCmd(); return '\\' + n; }
      return s[i++] || '.';
    };
    const atom = () => {
      skipWs();
      const c = peek();
      if (c === undefined) return '';
      if (c === '{') { i++; const r = expr('}'); if (peek() === '}') i++; return `<mrow>${r}</mrow>`; }
      if (c === '\\') {
        i++;
        const n = readCmd();
        if (n === 'frac' || n === 'dfrac' || n === 'tfrac') { const a = group(), b = group(); return `<mfrac>${a}${b}</mfrac>`; }
        if (n === 'binom') { const a = group(), b = group(); return `<mrow><mo>(</mo><mfrac linethickness="0">${a}${b}</mfrac><mo>)</mo></mrow>`; }
        if (n === 'sqrt') { const o = optArg(); const a = group(); return o ? `<mroot>${a}${o}</mroot>` : `<msqrt>${a}</msqrt>`; }
        if (n === 'text' || n === 'mathrm' || n === 'textrm' || n === 'operatorname') { const t = rawGroup(); return n === 'text' ? `<mtext>${esc(t)}</mtext>` : `<mi mathvariant="normal">${esc(t)}</mi>`; }
        if (n === 'mathbf' || n === 'textbf') { return `<mstyle mathvariant="bold">${group()}</mstyle>`; }
        if (n === 'mathit') { return `<mstyle mathvariant="italic">${group()}</mstyle>`; }
        if (n === 'mathbb') { const t = rawGroup(); return `<mi mathvariant="double-struck">${esc(t)}</mi>`; }
        if (n === 'underline') return `<munder accentunder="true">${group()}<mo>_</mo></munder>`;
        if (MATH_ACCENTS[n]) { const a = group(); return `<mover accent="true">${a}<mo stretchy="${n === 'overline' || n === 'widehat' || n === 'overrightarrow' ? 'true' : 'false'}">${MATH_ACCENTS[n]}</mo></mover>`; }
        if (n === 'left') { const d = readDelim(); const r = expr('\\right'); let d2 = '.'; if (s.startsWith('\\right', i)) { i += 6; d2 = readDelim(); } return `<mrow>${fence(d)}${r}${fence(d2)}</mrow>`; }
        if (n === 'right') return '';
        if (n === 'begin') {
          const env = rawGroup();
          const rows = [[]];
          let cell = '';
          for (;;) {
            if (i >= s.length) break;
            if (s.startsWith('\\end', i)) { i += 4; rawGroup(); break; }
            if (peek() === '&') { i++; rows[rows.length - 1].push(cell); cell = ''; continue; }
            if (s.startsWith('\\\\', i)) { i += 2; rows[rows.length - 1].push(cell); cell = ''; rows.push([]); continue; }
            cell += expr('&');
          }
          rows[rows.length - 1].push(cell);
          if (rows.length > 1 && rows[rows.length - 1].every(x => !x)) rows.pop();
          const tbl = `<mtable${env === 'cases' ? ' columnalign="left left"' : ''}>${rows.map(r => `<mtr>${r.map(x => `<mtd><mrow>${x}</mrow></mtd>`).join('')}</mtr>`).join('')}</mtable>`;
          const f = { pmatrix: ['(', ')'], bmatrix: ['[', ']'], Bmatrix: ['{', '}'], vmatrix: ['|', '|'], Vmatrix: ['‖', '‖'], cases: ['{', ''] }[env];
          return f ? `<mrow><mo fence="true" stretchy="true">${esc(f[0])}</mo>${tbl}${f[1] ? `<mo fence="true" stretchy="true">${esc(f[1])}</mo>` : ''}</mrow>` : tbl;
        }
        if (n === ',' ) return '<mspace width="0.17em"/>';
        if (n === ';' || n === ':') return '<mspace width="0.28em"/>';
        if (n === 'quad') return '<mspace width="1em"/>';
        if (n === 'qquad') return '<mspace width="2em"/>';
        if (n === '!') return '<mspace width="-0.17em"/>';
        if (n === ' ') return '<mspace width="0.25em"/>';
        if (n === '\\') return '';
        if ('{}%$#&_'.includes(n)) return `<mo>${esc(n)}</mo>`;
        if (MATH_SYMBOLS[n]) return `<mi${/^[A-Z]/.test(n) && n.length > 1 ? ' mathvariant="normal"' : ''}>${MATH_SYMBOLS[n]}</mi>`;
        if (MATH_OPS[n]) return `<mo>${MATH_OPS[n]}</mo>`;
        if (MATH_BIG[n]) return `<mo largeop="true" movablelimits="${n.includes('int') ? 'false' : 'true'}"${n.includes('int') ? '' : ''} data-big="${n}">${MATH_BIG[n]}</mo>`;
        if (MATH_FUNCS.includes(n)) { fnFlag = true; return `<mi data-fn="${n}">${n}</mi>`; }
        return `<mtext>\\${esc(n)}</mtext>`;
      }
      if (/[0-9.]/.test(c)) { let n = ''; while (i < s.length && /[0-9.,]/.test(s[i]) && !(s[i] === ',' && !/[0-9]/.test(s[i + 1] || ''))) n += s[i++]; return `<mn>${esc(n)}</mn>`; }
      if (/[a-zA-ZÀ-ɏͰ-Ͽ]/.test(c)) { i++; return `<mi>${esc(c)}</mi>`; }
      if (c === '^' || c === '_' || c === '}' || c === '&') return '';
      i++;
      if (c === '□') return '<mi class="fx-slot">□</mi>';
      if ('()[]|'.includes(c)) return `<mo stretchy="false">${esc(c)}</mo>`;
      if ('+-=<>/!,;:?*'.includes(c) || /[←-⋿±×÷·]/.test(c)) return `<mo>${esc(c === '-' ? '−' : c === '*' ? '·' : c)}</mo>`;
      if (c === "'") return '<mo>′</mo>';
      return `<mi>${esc(c)}</mi>`;
    };
    const scripts = (base) => {
      let sub = null, sup = null, primes = '';
      for (;;) {
        skipWs();
        if (peek() === '^' && sup === null) { i++; sup = group(); continue; }
        if (peek() === '_' && sub === null) { i++; sub = group(); continue; }
        if (peek() === "'" && sup === null) { i++; primes += '′'; continue; }
        break;
      }
      if (primes) {
        if (sup === null && sub === null) return `<mrow>${base}<mo lspace="0" rspace="0">${primes}</mo></mrow>`;
        if (sup === null) return `<mrow><msub>${base}${sub}</msub><mo lspace="0" rspace="0">${primes}</mo></mrow>`;
        sup = `<mrow><mo lspace="0" rspace="0">${primes}</mo>${sup}</mrow>`;
      }
      if (sub === null && sup === null) return base;
      const big = /data-big="(sum|prod|coprod|bigcup|bigcap)"|data-fn="(lim|max|min|sup|inf)"/.test(base);
      if (big) {
        if (sub !== null && sup !== null) return `<munderover>${base}${sub}${sup}</munderover>`;
        if (sub !== null) return `<munder>${base}${sub}</munder>`;
        return `<mover>${base}${sup}</mover>`;
      }
      if (sub !== null && sup !== null) return `<msubsup>${base}${sub}${sup}</msubsup>`;
      if (sub !== null) return `<msub>${base}${sub}</msub>`;
      return `<msup>${base}${sup}</msup>`;
    };
    function expr(stop) {
      let out = '';
      let guard = 0;
      while (i < s.length && guard++ < 10000) {
        skipWs();
        if (i >= s.length) break;
        if (stop === '}' && peek() === '}') break;
        if (stop === ']' && peek() === ']') break;
        if (stop === '&' && (peek() === '&' || s.startsWith('\\\\', i) || s.startsWith('\\end', i))) break;
        if (stop === '\\right' && s.startsWith('\\right', i)) break;
        if (peek() === '}' && stop !== '}') { i++; continue; }
        const start = i;
        fnFlag = false;
        let a = atom();
        const isFn = fnFlag;
        if (i === start) { i++; continue; }
        a = scripts(a);
        out += a;
        if (isFn) { skipWs(); if (i < s.length && !'(^_'.includes(peek())) out += '<mspace width="0.17em"/>'; }
      }
      return out;
    }
    let body = '';
    try { body = expr(null); } catch (e) { body = `<mtext>${esc(s)}</mtext>`; }
    return `<math${display ? ' display="block"' : ' displaystyle="true"'}><mrow>${body}</mrow></math>`;
  },
  spanHtml(tex, display) {
    const t = String(tex || '').trim();
    return `<span class="kt-math${display ? ' block' : ''}" contenteditable="false" data-tex="${escapeHtml(t)}"${display ? ' data-display="1"' : ''}>${this.toMathML(t, display)}</span>`;
  },

  /* ---------------------------------------------------------- Vorlagen und Bausteine */
  TEMPLATES: [
    ['Satz des Pythagoras', 'a^2+b^2=c^2'],
    ['Quadratische Formel', 'x=\\frac{-b\\pm\\sqrt{b^2-4ac}}{2a}'],
    ['Kreisfläche', 'A=\\pi r^2'],
    ['Binomischer Lehrsatz', '(x+a)^n=\\sum_{k=0}^{n}\\binom{n}{k}x^k a^{n-k}'],
    ['Ableitung', "f'(x)=\\lim_{h\\to 0}\\frac{f(x+h)-f(x)}{h}"],
    ['Integral', '\\int_{a}^{b} f(x)\\,dx=F(b)-F(a)'],
    ['Taylorreihe', 'e^x=\\sum_{n=0}^{\\infty}\\frac{x^n}{n!}'],
    ['Mitternachtsformel (Diskriminante)', 'D=b^2-4ac'],
    ['Ideales Gasgesetz', 'pV=nRT'],
    ['Energie', 'E=mc^2'],
    ['Matrix 2×2', 'A=\\begin{pmatrix}a & b\\\\ c & d\\end{pmatrix}'],
    ['Fallunterscheidung', '|x|=\\begin{cases}x & x\\geq 0\\\\ -x & x<0\\end{cases}'],
  ],
  STRUCTS: [
    ['Bruch', '\\frac{□}{□}', 'frac'], ['Hochgestellt', '□^{□}', 'sup'], ['Tiefgestellt', '□_{□}', 'sub'], ['Hoch und tief', '□_{□}^{□}', 'subsup'],
    ['Wurzel', '\\sqrt{□}', 'sqrt'], ['n-te Wurzel', '\\sqrt[□]{□}', 'root'], ['Summe', '\\sum_{□}^{□} □', 'sum'], ['Produkt', '\\prod_{□}^{□} □', 'prod'],
    ['Integral', '\\int_{□}^{□} □\\,d□', 'int'], ['Grenzwert', '\\lim_{□\\to □} □', 'lim'], ['Klammern ( )', '\\left( □ \\right)', 'paren'],
    ['Eckige Klammern [ ]', '\\left[ □ \\right]', 'brack'], ['Betrag | |', '\\left| □ \\right|', 'abs'], ['Matrix 2×2', '\\begin{pmatrix}□ & □\\\\ □ & □\\end{pmatrix}', 'matrix'],
    ['Vektor', '\\vec{□}', 'vec'], ['Querstrich', '\\overline{□}', 'bar'], ['Dach', '\\hat{□}', 'hat'], ['Text', '\\text{□}', 'text'],
    ['Fallunterscheidung', '\\begin{cases}□ & □\\\\ □ & □\\end{cases}', 'cases'], ['Binomialkoeffizient', '\\binom{□}{□}', 'binom'],
    ['sin', '\\sin □', 'fn'], ['cos', '\\cos □', 'fn'], ['log', '\\log_{□} □', 'fn'], ['ln', '\\ln □', 'fn'],
  ],
  SYMS: [
    ['Griechisch', ['alpha', 'beta', 'gamma', 'delta', 'epsilon', 'zeta', 'eta', 'theta', 'lambda', 'mu', 'nu', 'xi', 'pi', 'rho', 'sigma', 'tau', 'phi', 'chi', 'psi', 'omega', 'Gamma', 'Delta', 'Theta', 'Lambda', 'Pi', 'Sigma', 'Phi', 'Psi', 'Omega']],
    ['Operatoren', ['pm', 'mp', 'times', 'div', 'cdot', 'circ', 'leq', 'geq', 'neq', 'approx', 'equiv', 'sim', 'propto', 'll', 'gg']],
    ['Mengen & Logik', ['in', 'notin', 'subset', 'subseteq', 'cup', 'cap', 'setminus', 'emptyset', 'forall', 'exists', 'neg', 'land', 'lor', 'N', 'Z', 'Q', 'R', 'C']],
    ['Pfeile', ['to', 'leftarrow', 'leftrightarrow', 'Rightarrow', 'Leftarrow', 'Leftrightarrow', 'mapsto', 'uparrow', 'downarrow']],
    ['Weitere', ['infty', 'partial', 'nabla', 'hbar', 'ell', 'degree', 'prime', 'perp', 'parallel', 'angle', 'ldots', 'cdots', 'therefore', 'because']],
  ],

  /* ---------------------------------------------------------- Editor */
  open(existing, preset) {
    if (!existing && !Canvas.page) { UI.toast('Bitte zuerst eine Seite öffnen'); return Promise.resolve(); }
    if (!existing && Canvas.editing) Formula.grabRange();
    const startTex = existing ? existing.dataset.tex || '' : (preset || '');
    const startDisplay = existing ? existing.dataset.display === '1' : false;
    const range = Canvas.editing && Canvas.lastRange ? Canvas.lastRange.cloneRange() : null;
    const editBox = Canvas.editing;
    return UI.dialog((d, close) => {
      d.classList.add('fx-dlg');
      d.append(el('h2', { text: existing ? 'Formel bearbeiten' : 'Formel einfügen' }));
      const ta = el('textarea', { class: 'fx-in', spellcheck: 'false', placeholder: 'z.B. x^2 + y^2 = r^2   oder Bausteine unten anklicken' });
      ta.value = startTex;
      const prev = el('div', { class: 'fx-prev' });
      const disp = el('input', { type: 'checkbox' });
      disp.checked = startDisplay;
      const upd = () => { prev.innerHTML = ta.value.trim() ? this.toMathML(ta.value, true) : '<span class="fx-empty">Vorschau</span>'; };
      ta.addEventListener('input', upd);
      ta.addEventListener('keydown', (e) => {
        if (e.key === 'Tab' && ta.value.includes('□')) { e.preventDefault(); this.nextSlot(ta, e.shiftKey); }
      });
      d.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') return;
        e.stopPropagation();
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); done(); }
      });
      const insert = (snippet) => {
        const a = ta.selectionStart, b = ta.selectionEnd;
        const sel = ta.value.slice(a, b);
        let snip = snippet;
        if (sel && snip.includes('□')) snip = snip.replace('□', sel);
        const before = ta.value.slice(0, a);
        const needSpace = /\\[a-zA-Z]+$/.test(before) && /^[a-zA-Z]/.test(snip);
        ta.value = before + (needSpace ? ' ' : '') + snip + ta.value.slice(b);
        const pos = before.length + (needSpace ? 1 : 0);
        const slot = ta.value.indexOf('□', pos);
        ta.focus();
        if (slot >= 0 && slot < pos + snip.length) ta.setSelectionRange(slot, slot + 1);
        else ta.setSelectionRange(pos + snip.length, pos + snip.length);
        upd();
      };
      const tabsEl = el('div', { class: 'fx-tabs' });
      const pane = el('div', { class: 'fx-pane' });
      const tabs = [['Strukturen', () => {
        for (const [label, snip] of this.STRUCTS) {
          const b = el('button', { class: 'fx-btn', title: label + '\n' + snip.replace(/□/g, '…') });
          b.innerHTML = this.toMathML(snip, false).replace('<math', '<math class="fx-mini"');
          b.addEventListener('click', () => insert(snip));
          pane.append(b);
        }
      }], ...this.SYMS.map(([name, list]) => [name, () => {
        for (const n of list) {
          const ch = MATH_SYMBOLS[n] || MATH_OPS[n] || n;
          const b = el('button', { class: 'fx-sym', title: '\\' + n, text: ch });
          b.addEventListener('click', () => insert('\\' + n + ' '));
          pane.append(b);
        }
      }]), ['Vorlagen', () => {
        for (const [label, tex] of this.TEMPLATES) {
          const b = el('button', { class: 'fx-tpl', title: label });
          b.innerHTML = this.toMathML(tex, false) + `<span>${escapeHtml(label)}</span>`;
          b.addEventListener('click', () => { ta.value = tex; ta.focus(); upd(); });
          pane.append(b);
        }
      }]];
      const show = (k) => {
        pane.innerHTML = '';
        [...tabsEl.children].forEach((t, j) => t.classList.toggle('on', j === k));
        tabs[k][1]();
        try { localStorage.setItem('kt-fx-tab', k); } catch (e) { /* */ }
      };
      tabs.forEach(([name], k) => tabsEl.append(el('button', { class: 'fx-tab', text: name, onclick: () => show(k) })));
      d.append(tabsEl, pane, ta, prev,
        el('div', { class: 'fx-foot' },
          el('label', { class: 'fx-chk' }, disp, 'Eigene Zeile (zentriert)'),
          el('span', { class: 'fx-hint', text: 'Tab = nächstes Feld □ · Strg+Enter = einfügen · ^ hoch, _ tief, \\frac{a}{b}, \\sqrt{x}' })));
      const done = () => {
        const tex = ta.value.replace(/□/g, '').trim();
        close(tex ? { tex, display: disp.checked } : null);
      };
      d.append(el('div', { class: 'dlg-btns' },
        existing ? el('button', { class: 'btn danger', text: 'Formel entfernen', onclick: () => close({ remove: true }) }) : null,
        el('button', { class: 'btn', text: 'Abbrechen', onclick: () => close(null) }),
        el('button', { class: 'btn primary', text: existing ? 'Übernehmen' : 'Einfügen', onclick: done })));
      let k0 = 0;
      try { k0 = +localStorage.getItem('kt-fx-tab') || 0; } catch (e) { /* */ }
      show(Math.min(k0, tabs.length - 1));
      upd();
      setTimeout(() => { ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); }, 30);
    }, { wide: true }).then((res) => {
      if (!res) return;
      if (existing) this.replace(existing, res);
      else this.insertNew(res, range, editBox);
    });
  },
  /* aktuelle Schreibmarke merken (selectionchange kommt verzögert) */
  grabRange() {
    const t = Canvas.textEl(Canvas.editing), sel = getSelection();
    if (t && sel.rangeCount && t.contains(sel.anchorNode)) { Canvas.lastRange = sel.getRangeAt(0).cloneRange(); Canvas.lastRangeBox = Canvas.editing; }
    else Canvas.restoreRange();
  },
  /* Menüband: Formel-Galerie wie in Office */
  gallery(anchor) {
    if (!Canvas.page) { UI.toast('Bitte zuerst eine Seite öffnen'); return; }
    if (Canvas.editing) this.grabRange();
    const box = el('div', { class: 'fx-gal' });
    box.append(el('div', { class: 'fx-gal-head', text: 'Integriert' }));
    const grid = el('div', { class: 'fx-gal-grid' });
    for (const [label, tex] of this.TEMPLATES) {
      const b = el('button', { class: 'fx-gal-item', title: 'Bearbeiten und einfügen: ' + label });
      b.innerHTML = `<span class="fx-gal-name">${escapeHtml(label)}</span>` + this.toMathML(tex, true);
      b.addEventListener('mousedown', e => e.preventDefault());
      b.addEventListener('click', () => { UI.closePopup(); this.open(null, tex); });
      grid.append(b);
    }
    box.append(grid, el('div', { class: 'fx-gal-sep' }),
      el('button', { class: 'fx-gal-new', html: icon('formula', 16) + '<span>Neue Formel einfügen …</span><kbd>Alt+=</kbd>', onmousedown: e => e.preventDefault(), onclick: () => { UI.closePopup(); this.open(null); } }));
    UI.showPopup(box, 0, 0, { anchor });
  },
  nextSlot(ta, back) {
    const v = ta.value, pos = back ? ta.selectionStart - 1 : ta.selectionEnd;
    const i = back ? v.lastIndexOf('□', pos - 1) : v.indexOf('□', pos);
    const j = i >= 0 ? i : (back ? v.lastIndexOf('□') : v.indexOf('□'));
    if (j >= 0) ta.setSelectionRange(j, j + 1);
  },
  insertNew(res, range, editBox) {
    const html = this.spanHtml(res.tex, res.display) + (res.display ? '' : '\u200B');
    if (editBox && Canvas.box(editBox) && Canvas.textEl(editBox)) {
      if (Canvas.editing !== editBox) Canvas.focusText(editBox, true);
      if (range && Canvas.textEl(editBox).contains(range.startContainer)) { Canvas.lastRange = range; Canvas.lastRangeBox = editBox; }
      let atEnd = true;
      const t = Canvas.textEl(editBox), r = Canvas.lastRangeBox === editBox ? Canvas.lastRange : null;
      if (r && t.contains(r.endContainer)) {
        const tail = document.createRange();
        tail.setStart(r.endContainer, r.endOffset);
        tail.setEnd(t, t.childNodes.length);
        atEnd = !tail.toString().replace(/[\u200B\s]/g, '');
      }
      Fmt.apply(() => Fmt.exec('insertHTML', res.display ? `<div>${html}</div>${atEnd ? '<div><br></div>' : ''}` : html), 'Formel eingefügt');
      return;
    }
    if (!Canvas.page) { UI.toast('Bitte zuerst eine Seite öffnen'); return; }
    const c = Canvas.viewCenter();
    const b = Canvas.createBoxAt({ x: c.x - 120, y: c.y - 30 }, { html: `<div>${html}</div>`, noFocus: true, label: 'Formel eingefügt', w: 320 });
    if (b) Canvas.select([b.id]);
  },
  replace(span, res) {
    const t = span.closest('.box-text');
    const boxEl = span.closest('.box');
    const b = boxEl && Canvas.box(boxEl.dataset.id);
    if (!t || !b) return;
    Hist.flushPending();
    if (res.remove) span.remove();
    else {
      const tmp = document.createElement('div');
      tmp.innerHTML = this.spanHtml(res.tex, res.display);
      span.replaceWith(tmp.firstChild);
    }
    b.html = boxHtml(t);
    Canvas.els.get(b.id)._html = b.html;
    Hist.touchPage(Canvas.pageId);
    Hist.commit(res.remove ? 'Formel entfernt' : 'Formel geändert');
    Canvas.layoutSoon();
  },
};
