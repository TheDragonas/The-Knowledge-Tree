'use strict';
/* Kontrast: Schriftfarbe passend zum Hintergrund (seit 1.14)

   Automatisch (keine Farbe gewählt):
     helle bzw. dunkle Tönung der Hintergrundfarbe – nie reines Weiss oder Schwarz.
     Das Design gibt die Tendenz vor: dunkles Design -> hell, helles Design -> dunkel.
     Nur wenn das auf diesem Hintergrund nicht gut lesbar wäre, wird die Gegenseite genommen
     (z.B. dunkle Schrift auf einem hellgelben Feld im dunklen Design).
   Fest gewählte Farben:
     bleiben gespeichert wie gewählt. Nur wenn sie auf dem Hintergrund kaum zu erkennen sind
     (Kontrast unter 3:1), wird die ANZEIGE in derselben Farbe heller bzw. dunkler gemacht.
   Die Anzeige-Korrektur steht als CSS-Variable --kt-ink im style-Attribut und wird beim Speichern
   wieder entfernt (boxHtml). */
const Contrast = {
  MIN: 3,        // darunter gilt eine Farbe als kaum lesbar
  GOOD: 4.5,     // so viel Kontrast bekommt eine korrigierte bzw. automatische Farbe mindestens
  raw: false,    // beim Export: keine Anzeige-Korrekturen im Text (Originalfarben)
  _c: new Map(), _a: new Map(), _ctx: null, _theme: new Map(),

  /* fest gewählte Farben bei zu wenig Kontrast anpassen? (Ansicht -> Lesbare Farben) */
  fixOn() { return !this.raw && !(typeof Store !== 'undefined' && Store.ui && Store.ui.inkFix === false); },
  dark() { return typeof document !== 'undefined' && !!document.body && document.body.dataset.theme === 'dunkel'; },
  key() { return (this.raw ? 'r' : this.fixOn() ? 'f' : 'a') + (this.dark() ? 'd' : 'h'); },

  /* Farbe -> [r, g, b, a] (0..255) oder null */
  rgb(c) {
    if (Array.isArray(c)) return c;
    if (!c || typeof c !== 'string') return null;
    const k = c.trim().toLowerCase();
    if (this._c.has(k)) return this._c.get(k);
    let v = null, m;
    if ((m = /^#([0-9a-f]{3,4})$/.exec(k))) v = [...m[1]].map(h => parseInt(h + h, 16));
    else if ((m = /^#([0-9a-f]{6}|[0-9a-f]{8})$/.exec(k))) v = m[1].match(/../g).map(h => parseInt(h, 16));
    else if ((m = /^rgba?\(([^)]+)\)$/.exec(k))) {
      v = m[1].split(/[\s,/]+/).filter(Boolean).map((x, i) => {
        const n = parseFloat(x), pc = x.endsWith('%');
        return i < 3 ? (pc ? n * 2.55 : n) : (pc ? n * 2.55 : n * 255);
      });
    } else if ((m = /^color\(srgb\s+([^)]+)\)$/.exec(k))) {   // so liefert der Browser color-mix() zurück
      v = m[1].split(/[\s/]+/).filter(Boolean).map(x => (x.endsWith('%') ? parseFloat(x) / 100 : parseFloat(x)) * 255);
    } else if (k === 'transparent') v = [0, 0, 0, 0];
    else if (!/^(var|color-mix|calc|inherit|initial|unset|revert|currentcolor|none)\b/.test(k)) v = this.named(k);
    if (v && (v.length < 3 || v.slice(0, 3).some(x => !isFinite(x)))) v = null;
    if (v) { v = v.slice(0, 4); if (v.length === 3 || !isFinite(v[3])) v[3] = 255; v = v.map(x => Math.max(0, Math.min(255, x))); }
    if (this._c.size > 4000) this._c.clear();
    this._c.set(k, v);
    return v;
  },
  /* Farbnamen (red, gold, …) über den Browser auflösen */
  named(k) {
    if (typeof document === 'undefined') return null;
    try {
      if (!this._ctx) this._ctx = document.createElement('canvas').getContext('2d');
      const g = this._ctx;
      g.fillStyle = '#000'; g.fillStyle = k; const a = g.fillStyle;
      g.fillStyle = '#fff'; g.fillStyle = k; const b = g.fillStyle;
      if (a !== b) return null;   // ungültig
      return /^(#|rgba?\()/.test(a) ? this.rgb(a) : null;
    } catch (e) { return null; }
  },
  hex(v) { v = this.rgb(v); return v ? '#' + v.slice(0, 3).map(x => Math.round(x).toString(16).padStart(2, '0')).join('') : ''; },
  lum(v) {
    const f = (x) => { x /= 255; return x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(v[0]) + 0.7152 * f(v[1]) + 0.0722 * f(v[2]);
  },
  ratio(a, b) { const x = this.lum(a), y = this.lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); },
  mix(a, b, t) { return [0, 1, 2].map(i => a[i] + (b[i] - a[i]) * t).concat(255); },
  /* halbtransparente Farbe über einen Hintergrund legen */
  over(fg, bg) { const t = (fg[3] == null ? 255 : fg[3]) / 255; return [0, 1, 2].map(i => bg[i] + (fg[i] - bg[i]) * t).concat(255); },

  /* Automatische Schriftfarbe für einen Hintergrund (Tendenz: dunkles Design -> hell, helles -> dunkel) */
  auto(bg, dark, min = this.GOOD) {
    const B = this.rgb(bg);
    if (!B) return null;
    const k = this.hex(B) + (dark ? 'd' : 'h') + min;
    if (this._a.has(k)) return this._a.get(k);
    const tone = (light) => {
      const T = light ? [255, 255, 255] : [0, 0, 0];
      let c = null;
      // Tönung: 84–86 % Richtung Weiss/Schwarz, bei mittleren Farben weiter bis gut lesbar – höchstens 94 %, nie ganz weiss oder schwarz
      for (let t = light ? 0.86 : 0.84; t <= 0.945; t += 0.02) { c = this.mix(B, T, t); if (this.ratio(c, B) >= this.GOOD) break; }
      return c;
    };
    const a = tone(dark), b = tone(!dark);
    const ra = this.ratio(a, B), rb = this.ratio(b, B);
    const out = this.hex(ra >= min || ra >= rb ? a : b);
    if (this._a.size > 2000) this._a.clear();
    this._a.set(k, out);
    return out;
  },

  /* Fest gewählte Farbe: null = gut lesbar (unverändert), sonst dieselbe Farbe heller/dunkler */
  readable(color, bg, dark) {
    const C = this.rgb(color), B = this.rgb(bg);
    if (!C || !B || C[3] < 128) return null;
    if (this.ratio(C, B) >= this.MIN) return null;
    const [h, s, l] = this.hsl(C);
    // Schwarz im dunklen Design (1.49): Mittelgrau statt fast weiss – gut lesbar auf dem dunklen Hintergrund UND auf
    // weissen Bildern (importierte PDF-Seiten), wie die schwarze Tinte (draw.js)
    if (dark && s < 0.1 && l < 0.16) {
      for (let x = 0.52; x < 0.9; x += 0.02) { const g = this.fromHsl(0, 0, x); if (this.ratio(g, B) >= this.GOOD) return this.hex(g); }
      return this.auto(B, dark);
    }
    // Weiss (bzw. fast) wie automatische Schrift behandeln
    if (s < 0.1 && (l < 0.16 || l > 0.84)) return this.auto(B, dark);
    let best = null, bd = 2;
    for (const dir of [1, -1]) {
      for (let x = l + dir * 0.02; x > 0.03 && x < 0.97; x += dir * 0.02) {
        const c = this.fromHsl(h, s, x);
        if (this.ratio(c, B) >= this.GOOD) {
          const d = Math.abs(x - l) - ((dir > 0) === !!dark ? 0.001 : 0);   // bei Gleichstand: Richtung des Designs
          if (d < bd) { bd = d; best = c; }
          break;
        }
      }
    }
    return best ? this.hex(best) : this.auto(B, dark);
  },
  hsl(v) {
    const r = v[0] / 255, g = v[1] / 255, b = v[2] / 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
    if (mx === mn) return [0, 0, l];
    const d = mx - mn, s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
    const h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return [h / 6, s, l];
  },
  fromHsl(h, s, l) {
    if (!s) return [l * 255, l * 255, l * 255, 255];
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
    const f = (t) => { t = (t + 1) % 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; };
    return [f(h + 1 / 3) * 255, f(h) * 255, f(h - 1 / 3) * 255, 255];
  },

  /* Farbe einer CSS-Variablen des aktuellen Designs (z.B. --box-bg) */
  themeColor(name) {
    const k = (this.dark() ? 'd' : 'h') + name;
    if (this._theme.has(k)) return this._theme.get(k);
    let v = null;
    try { v = this.rgb(getComputedStyle(document.body).getPropertyValue(name)); } catch (e) { /* */ }
    v = v || (this.dark() ? [42, 42, 42, 255] : [255, 255, 255, 255]);
    this._theme.set(k, v);
    return v;
  },

  /* Schriftfarbe eines Textfelds (style.color). Frühere Versionen setzten bei Fülleffekt und
     Schnellformatvorlagen fest #252423 bzw. #F3F3F3 – das war als "automatisch" gemeint. */
  LEGACY: new Set(['#252423', '#f3f3f3']),
  boxColor(st) {
    const c = st && st.color;
    if (!c) return null;
    return st.bg && this.LEGACY.has(String(c).toLowerCase()) ? null : c;
  },

  /* gespeicherte Farbe (nicht die angezeigte) eines Elements im Text */
  declared(e, root) {
    for (let x = e; x && x !== root && x.nodeType === 1; x = x.parentElement) {
      if (x.classList && x.classList.contains('box-text')) break;
      if (x.style && x.style.color) return x.style.color;
      if (x.tagName === 'FONT' && x.getAttribute('color')) return x.getAttribute('color');
    }
    return null;
  },

  /* Text eines Feldes durchgehen: Hervorhebungen (eigener Hintergrund) und fest gewählte Farben.
     base = { bg: Hintergrund des Feldes, declared: Feldfarbe oder null, shown: angezeigte Farbe } */
  adapt(root, base) {
    if (!root) return;
    const stale = root.querySelectorAll('[style*="--kt-ink"]');
    if (!base || this.raw) { for (const x of stale) this.clear(x); return; }
    if (!stale.length && !root.querySelector('[style*="color"], [style*="background"], font[color]')) return;
    const fix = this.fixOn(), dark = this.dark();
    const walk = (el, bg, declared, shown) => {
      for (const c of el.children) {
        const st = c.style;
        if (!st) continue;
        let want = null, B = bg;
        const ob = st.backgroundColor ? this.rgb(st.backgroundColor) : null;
        if (ob && ob[3] >= 26) B = ob[3] >= 250 ? ob : this.over(ob, bg);
        const own = st.color || (c.tagName === 'FONT' ? c.getAttribute('color') || '' : '');
        const decl = own || declared;
        let now = shown;
        if (own) {
          const f = fix ? this.readable(own, B, dark) : null;
          now = f || this.hex(own) || own;
          if (f) want = f;
        } else if (B !== bg) {
          // eigener Hintergrund (Texthervorhebung): geerbte Farbe neu prüfen
          if (decl) { const f = fix ? this.readable(decl, B, dark) : null; now = f || this.hex(decl) || decl; }
          else now = this.auto(B, dark);
          if (now !== shown) want = now;
        }
        if (want) { if (st.getPropertyValue('--kt-ink') !== want) st.setProperty('--kt-ink', want); } else if (st.getPropertyValue('--kt-ink')) this.clear(c);
        if (c.namespaceURI === 'http://www.w3.org/1999/xhtml') walk(c, B, decl, now);
      }
    };
    walk(root, this.rgb(base.bg), base.declared || null, base.shown);
  },
  clear(x) {
    x.style.removeProperty('--kt-ink');
    if (!x.getAttribute('style')) x.removeAttribute('style');
  },
  /* Anzeige-Korrektur aus gespeichertem HTML entfernen */
  strip(html) {
    if (html.indexOf('--kt-ink') < 0) return html;
    return html.replace(/\s*--kt-ink:\s*[^;"]*;?/g, '').replace(/\sstyle="\s*"/g, '');
  },
};
if (typeof module !== 'undefined') module.exports = { Contrast };
