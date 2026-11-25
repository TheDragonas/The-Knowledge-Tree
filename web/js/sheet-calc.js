'use strict';
/* Tabellenkalkulation wie Excel: Formeln (deutsche und englische Funktionsnamen), Zahlenformate (de-CH),
 * Bezüge auf andere Tabellen der Seite (Tabelle2!A1) und – seit 1.26, wie externe Bezüge in Excel – auf Tabellen
 * anderer Seiten ([Seite]Tabelle1!A1, [Abschnitt/Seite]Tabelle1!A1, '[Seite mit Leerzeichen]Tabelle 1'!A1),
 * Ausfüllen, Zeilen/Spalten einfügen.
 * Rechnen wie Excel („intelligente Neuberechnung“): Werte werden erst berechnet, wenn sie gebraucht werden, und
 * gemerkt; beim Rechnen merkt sich jede Formel, welche Bereiche sie liest. Ändert sich eine Zelle, werden nur die
 * Formeln vergessen, die (auch über Umwege) davon abhängen – plus die flüchtigen (HEUTE, ZUFALLSZAHL, INDIREKT …).
 * Kein DOM – lässt sich in Node testen (module.exports = XL). */

const XL = (() => {
  /* ================================================================ Fehlerwerte */
  class XErr { constructor(e) { this.e = e; } toString() { return this.e; } }
  const ERR = {};
  for (const [k, e] of Object.entries({ div0: '#DIV/0!', value: '#WERT!', ref: '#BEZUG!', name: '#NAME?', num: '#ZAHL!', na: '#NV', null: '#NULL!', circ: '#ZIRKEL!' })) ERR[k] = new XErr(e);
  const ERR_LIT = {
    '#DIV/0!': ERR.div0, '#WERT!': ERR.value, '#VALUE!': ERR.value, '#BEZUG!': ERR.ref, '#REF!': ERR.ref, '#NAME?': ERR.name,
    '#ZAHL!': ERR.num, '#NUM!': ERR.num, '#NV': ERR.na, '#N/A': ERR.na, '#NULL!': ERR.null, '#ZIRKEL!': ERR.circ,
  };
  const isErr = (v) => v instanceof XErr;
  class Throw { constructor(err) { this.err = err; } }
  const fail = (e) => { throw new Throw(e); };
  const MISSING = { missing: true };   // ausgelassenes Argument, z.B. WENN(A1;;2)

  /* ================================================================ Zellnamen */
  const colName = (i) => { let s = ''; i += 1; while (i > 0) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; };
  const colIndex = (s) => { let n = 0; for (const ch of String(s).toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64); return n - 1; };
  const key = (c, r) => colName(c) + (r + 1);
  const parseKey = (k) => { const m = /^\$?([A-Za-z]{1,3})\$?(\d+)$/.exec(String(k).trim()); return m ? { c: colIndex(m[1]), r: +m[2] - 1 } : null; };
  const rangeText = (c1, r1, c2, r2) => (c1 === c2 && r1 === r2) ? key(c1, r1) : key(c1, r1) + ':' + key(c2, r2);
  const parseRange = (s) => {
    const m = /^\s*(\$?[A-Za-z]{1,3}\$?\d+)\s*(?::\s*(\$?[A-Za-z]{1,3}\$?\d+))?\s*$/.exec(String(s));
    if (!m) return null;
    const a = parseKey(m[1]), b = m[2] ? parseKey(m[2]) : a;
    return { c1: Math.min(a.c, b.c), r1: Math.min(a.r, b.r), c2: Math.max(a.c, b.c), r2: Math.max(a.r, b.r) };
  };

  /* ================================================================ Zahlen und Datum */
  const TS = '’';   // Tausendertrennzeichen (Schweiz)
  const round = (x, d) => {
    if (!isFinite(x)) return x;
    const p = Math.pow(10, d);
    const y = Math.abs(x) * p;
    return Math.sign(x) * Math.round(+y.toPrecision(15)) / p;
  };
  const DAY0 = Date.UTC(1899, 11, 30);
  const toSerial = (y, m, d) => (Date.UTC(y, m - 1, d) - DAY0) / 86400000;
  const fromSerial = (n) => new Date(DAY0 + Math.floor(n + 1e-9) * 86400000);
  const MONTHS = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
  const MONTHS_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const DAYS = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
  const groupInt = (s) => s.replace(/\B(?=(\d{3})+(?!\d))/g, TS);
  const pad2 = (n) => String(n).padStart(2, '0');

  /* Zahl im Format „Standard“ (höchstens 11 Zeichen, sonst wissenschaftlich) */
  function general(v) {
    if (v === 0 || Object.is(v, -0)) return '0';
    if (!isFinite(v)) return '#ZAHL!';
    const a = Math.abs(v);
    if (a >= 1e11 || a < 1e-9) return sci(v, 5, true);
    const intDigits = a >= 1 ? Math.floor(Math.log10(a)) + 1 : 1;
    const dec = Math.max(0, 10 - intDigits - (v < 0 ? 1 : 0));
    let s = round(v, dec).toFixed(dec);
    if (s.includes('.')) s = s.replace(/\.?0+$/, '');
    return s === '-0' ? '0' : s;
  }
  function sci(v, d, trim) {
    if (v === 0) return (0).toFixed(d) + 'E+00';
    let e = Math.floor(Math.log10(Math.abs(v)));
    let m = round(v / Math.pow(10, e), d);
    if (Math.abs(m) >= 10) { m /= 10; e++; }
    let ms = m.toFixed(d);
    if (trim && ms.includes('.')) ms = ms.replace(/\.?0+$/, '');
    return ms + 'E' + (e < 0 ? '-' : '+') + pad2(Math.abs(e));
  }
  function fixed(v, d, ts) {
    const r = round(v, d);
    let s = Math.abs(r).toFixed(Math.max(0, d));
    let [i, f] = s.split('.');
    if (ts) i = groupInt(i);
    return (r < 0 ? '-' : '') + i + (f ? '.' + f : '');
  }
  /* Zahl für Textverkettung (& / TEXTKETTE): bis 15 Stellen wie Excel */
  function numText(v) {
    if (!isFinite(v)) return '#ZAHL!';
    const a = Math.abs(v);
    if (a !== 0 && (a >= 1e15 || a < 1e-9)) return sci(v, 14, true);
    let s = String(+v.toPrecision(15));
    if (/e/.test(s)) s = v.toFixed(20).replace(/\.?0+$/, '');
    return s;
  }
  function dateText(n, long) {
    const d = fromSerial(n);
    return long ? `${d.getUTCDate()}. ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}` : `${pad2(d.getUTCDate())}.${pad2(d.getUTCMonth() + 1)}.${d.getUTCFullYear()}`;
  }
  function timeText(n, secs) {
    let t = Math.round((n - Math.floor(n)) * 86400);
    if (t >= 86400) t = 0;
    const h = Math.floor(t / 3600), m = Math.floor(t / 60) % 60, s = t % 60;
    return pad2(h) + ':' + pad2(m) + (secs || s ? ':' + pad2(s) : '');
  }
  function fracText(v, maxDen = 99) {
    const sign = v < 0 ? '-' : '', a = Math.abs(v);
    let whole = Math.floor(a), f = a - whole;
    if (f < 1e-12) return sign + whole;
    let best = [0, 1], err = 1;
    for (let q = 1; q <= maxDen; q++) { const p = Math.round(f * q), e = Math.abs(f - p / q); if (e < err - 1e-12) { err = e; best = [p, q]; } if (e < 1e-12) break; }
    if (best[0] === best[1]) return sign + (whole + 1);
    if (best[0] === 0) return sign + whole;
    return sign + (whole ? whole + ' ' : '') + best[0] + '/' + best[1];
  }

  /* ================================================================ Eingaben lesen */
  const constCache = new Map();
  const decs = (s) => { const m = /[.,](\d+)/.exec(s); return m ? m[1].length : 0; };
  function plainNum(x) {
    x = String(x).replace(/[’'\u2009\u202f ]/g, '');
    if (/^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i.test(x)) return parseFloat(x);
    if (/^[+-]?\d+,\d+$/.test(x)) return parseFloat(x.replace(',', '.'));
    return null;
  }
  function yearOf(y) { if (y === undefined || y === '') return new Date().getFullYear(); y = +y; return y < 100 ? (y < 30 ? 2000 + y : 1900 + y) : y; }
  function validDate(y, m, d) { const t = new Date(Date.UTC(y, m - 1, d)); return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d; }
  /* Rohe Eingabe -> { v: Wert, nf?: vorgeschlagenes Zahlenformat, d?: Dezimalstellen, cur? } */
  function parseInput(raw) {
    const s = raw == null ? '' : String(raw);
    let hit = constCache.get(s);
    if (hit) return hit;
    hit = parseConst(s);
    if (constCache.size > 20000) constCache.clear();
    constCache.set(s, hit);
    return hit;
  }
  function parseConst(s) {
    if (s === '') return { v: null };
    if (s[0] === "'") return { v: s.slice(1) };
    const t = s.trim();
    if (!t) return { v: s };
    if (/^(wahr|true)$/i.test(t)) return { v: true };
    if (/^(falsch|false)$/i.test(t)) return { v: false };
    if (ERR_LIT[t.toUpperCase()]) return { v: ERR_LIT[t.toUpperCase()] };
    let m;
    if ((m = /^([+-]?[\d’'.,\s]+?)\s*%$/.exec(t))) { const n = plainNum(m[1]); if (n !== null) return { v: n / 100, nf: 'pct', d: decs(m[1]) }; }
    if ((m = /^(CHF|SFr\.|Fr\.|€|EUR|\$|USD|£)\s*([+-]?[\d’'.,]+)$/i.exec(t)) || (m = /^([+-]?[\d’'.,]+)\s*(CHF|Fr\.|€|EUR|\$|£)$/i.exec(t))) {
      const numPart = /\d/.test(m[1]) ? m[1] : m[2], sym = /\d/.test(m[1]) ? m[2] : m[1];
      const n = plainNum(numPart);
      if (n !== null) return { v: n, nf: 'cur', d: 2, cur: /€|eur/i.test(sym) ? '€' : /\$|usd/i.test(sym) ? '$' : /£/.test(sym) ? '£' : 'CHF' };
    }
    if ((m = /^(\d{1,2})\.(\d{1,2})\.(\d{2}|\d{4})?(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/.exec(t))) {
      const y = yearOf(m[3]), mo = +m[2], d = +m[1];
      if (validDate(y, mo, d)) {
        let v = toSerial(y, mo, d);
        if (m[4] !== undefined) { v += (+m[4] * 3600 + +m[5] * 60 + (+m[6] || 0)) / 86400; return { v, nf: 'dt' }; }
        return { v, nf: 'date' };
      }
    }
    if ((m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(t)) && validDate(+m[1], +m[2], +m[3])) return { v: toSerial(+m[1], +m[2], +m[3]), nf: 'date' };
    if ((m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(t)) && +m[2] < 60 && (+m[3] || 0) < 60) return { v: (+m[1] * 3600 + +m[2] * 60 + (+m[3] || 0)) / 86400, nf: 'time', secs: m[3] !== undefined };
    const n = plainNum(t);
    if (n !== null) return /[’']/.test(t) ? { v: n, nf: 'num', d: decs(t) } : { v: n };
    return { v: s };
  }
  const isFormula = (raw) => typeof raw === 'string' && raw.length > 1 && raw[0] === '=';

  /* ================================================================ Anzeige */
  /* Wert + Zellformat -> { t: Text, al: 'l'|'r'|'c' } */
  function format(v, f = {}) {
    if (v === null || v === undefined) return { t: '', al: 'l' };
    if (isErr(v)) return { t: v.e, al: 'c', err: true };
    if (typeof v === 'boolean') return { t: v ? 'WAHR' : 'FALSCH', al: 'c' };
    if (typeof v === 'string') return { t: v, al: 'l' };
    if (typeof v !== 'number') return { t: String(v), al: 'l' };
    if (!isFinite(v)) return { t: '#ZAHL!', al: 'c', err: true };
    const d = f.d == null ? null : Math.max(0, Math.min(15, f.d | 0));
    let t;
    switch (f.nf) {
      case 'num': t = fixed(v, d ?? 2, f.ts !== false); break;
      case 'cur': { const sym = f.cur || 'CHF'; const s = fixed(v, d ?? 2, true); t = sym === 'CHF' ? 'CHF ' + s : sym === '€' ? s + ' €' : sym + ' ' + s; break; }
      case 'pct': t = fixed(v * 100, d ?? 0, f.ts === true) + '%'; break;
      case 'sci': t = sci(v, d ?? 2); break;
      case 'date': t = v < 0 || v > 2958465 ? '#'.repeat(8) : dateText(v); break;
      case 'datel': t = v < 0 || v > 2958465 ? '#'.repeat(8) : dateText(v, true); break;
      case 'time': t = timeText(v, f.secs); break;
      case 'dt': t = dateText(v) + ' ' + timeText(v); break;
      case 'frac': t = fracText(v); break;
      default: t = d !== null ? fixed(v, d, false) : general(v);
    }
    return { t, al: 'r', neg: v < 0 };
  }
  /* Text eines Werts für Verkettung und Vergleich */
  function text(v) {
    if (v === null || v === undefined || v === MISSING) return '';
    if (typeof v === 'number') return numText(v);
    if (typeof v === 'boolean') return v ? 'WAHR' : 'FALSCH';
    if (isErr(v)) fail(v);
    return String(v);
  }

  /* ================================================================ Bereiche und Felder */
  class Rng {
    constructor(book, sh, c1, r1, c2, r2) {
      this.book = book; this.sh = sh;
      this.c1 = Math.min(c1, c2); this.c2 = Math.max(c1, c2); this.r1 = Math.min(r1, r2); this.r2 = Math.max(r1, r2);
      if (this.r2 === Infinity) this.r2 = Math.max(this.r1, (sh.d.nrows || 1) - 1);
      if (this.c2 === Infinity) this.c2 = Math.max(this.c1, (sh.d.ncols || 1) - 1);
    }
    get h() { return this.r2 - this.r1 + 1; }
    get w() { return this.c2 - this.c1 + 1; }
    at(i, j) { return this.book.val(this.sh, this.c1 + j, this.r1 + i); }
    rows() { const out = []; for (let i = 0; i < this.h; i++) { const row = []; for (let j = 0; j < this.w; j++) row.push(this.at(i, j)); out.push(row); } return out; }
  }
  class Arr {
    constructor(a) { this.a = a; }
    get h() { return this.a.length; }
    get w() { return this.a[0] ? this.a[0].length : 0; }
    at(i, j) { return this.a[i] && this.a[i][j] !== undefined ? this.a[i][j] : ERR.na; }
    rows() { return this.a; }
  }
  const isArr = (v) => v instanceof Rng || v instanceof Arr;
  function* each(v) { if (isArr(v)) { for (let i = 0; i < v.h; i++) for (let j = 0; j < v.w; j++) yield v.at(i, j); } else yield v; }
  const toArr = (v) => isArr(v) ? v : new Arr([[v]]);
  /* Bereich im Einzelwert-Zusammenhang: ein Feld oder implizite Schnittmenge */
  function scalar(v, cx) {
    if (v instanceof Rng) {
      if (v.h === 1 && v.w === 1) return v.at(0, 0);
      if (cx && v.w === 1 && v.sh === cx.sh && cx.r >= v.r1 && cx.r <= v.r2) return v.at(cx.r - v.r1, 0);
      if (cx && v.h === 1 && v.sh === cx.sh && cx.c >= v.c1 && cx.c <= v.c2) return v.at(0, cx.c - v.c1);
      return ERR.value;
    }
    if (v instanceof Arr) return v.at(0, 0);
    return v;
  }

  /* ================================================================ Umwandlungen */
  function num(v) {
    if (typeof v === 'number') { if (!isFinite(v)) fail(ERR.num); return v; }
    if (v === null || v === undefined || v === MISSING) return 0;
    if (typeof v === 'boolean') return v ? 1 : 0;
    if (isErr(v)) fail(v);
    if (isArr(v)) return num(scalar(v));
    if (typeof v === 'string') {
      const c = parseInput(v.trim());
      if (typeof c.v === 'number') return c.v;
      fail(ERR.value);
    }
    fail(ERR.value);
  }
  function bool(v) {
    if (typeof v === 'boolean') return v;
    if (typeof v === 'number') return v !== 0;
    if (v === null || v === MISSING) return false;
    if (isErr(v)) fail(v);
    if (isArr(v)) return bool(scalar(v));
    if (typeof v === 'string') { if (/^(wahr|true)$/i.test(v)) return true; if (/^(falsch|false)$/i.test(v)) return false; }
    fail(ERR.value);
  }
  /* Excel-Ordnung: Zahl < Text < Wahrheitswert; Text ohne Gross/klein */
  const typeRank = (v) => typeof v === 'number' ? 0 : typeof v === 'string' ? 1 : typeof v === 'boolean' ? 2 : 3;
  function compare(a, b) {
    if (a === null || a === MISSING) a = typeof b === 'string' ? '' : typeof b === 'boolean' ? false : 0;
    if (b === null || b === MISSING) b = typeof a === 'string' ? '' : typeof a === 'boolean' ? false : 0;
    const ta = typeRank(a), tb = typeRank(b);
    if (ta !== tb) return ta < tb ? -1 : 1;
    if (ta === 0) { const x = +a.toPrecision(15), y = +b.toPrecision(15); return x < y ? -1 : x > y ? 1 : 0; }
    if (ta === 1) { const x = a.toLowerCase(), y = b.toLowerCase(); return x < y ? -1 : x > y ? 1 : 0; }
    return a === b ? 0 : a ? 1 : -1;
  }
  /* Sortierreihenfolge: Zahlen, Text, Wahrheitswerte, Fehler, leere Zellen immer zuletzt */
  function sortCompare(a, b, desc) {
    const ea = a === null || a === '', eb = b === null || b === '';
    if (ea || eb) return ea === eb ? 0 : ea ? 1 : -1;
    const ra = isErr(a) ? 3 : typeRank(a), rb = isErr(b) ? 3 : typeRank(b);
    let r = ra !== rb ? ra - rb : ra === 3 ? 0 : compare(a, b);
    return desc ? -r : r;
  }

  /* ================================================================ Formeln lesen */
  const CELL_RE = /^(\$?)([A-Za-z]{1,3})(\$?)(\d{1,7})/;
  const COLR_RE = /^(\$?)([A-Za-z]{1,3})\s*:\s*(\$?)([A-Za-z]{1,3})(?![\w(.!])/;
  const ROWR_RE = /^(\$?)(\d{1,7})\s*:\s*(\$?)(\d{1,7})(?![\w.(])/;
  const ID_RE = /^[A-Za-zÄÖÜäöüß_\\][A-Za-z0-9ÄÖÜäöüß_.]*/;
  class SyntaxErr extends Error { constructor(msg, pos) { super(msg); this.pos = pos; } }

  /* liest einen Bezug ab Position i (nach einem evtl. Tabellenpräfix) */
  function readRef(s, i) {
    const rest = s.slice(i);
    let m = COLR_RE.exec(rest);
    if (m) return { kind: 'col', a: { c: colIndex(m[2]), r: 0, ac: !!m[1], ar: true }, b: { c: colIndex(m[4]), r: Infinity, ac: !!m[3], ar: true }, len: m[0].length };
    m = ROWR_RE.exec(rest);
    if (m && +m[2] > 0 && +m[4] > 0) return { kind: 'row', a: { c: 0, r: +m[2] - 1, ac: true, ar: !!m[1] }, b: { c: Infinity, r: +m[4] - 1, ac: true, ar: !!m[3] }, len: m[0].length };
    m = CELL_RE.exec(rest);
    if (!m || +m[4] < 1) return null;
    const after = rest[m[0].length];
    if (after && /[\w(.!$]/.test(after)) return null;   // z.B. LOG10( oder Tabelle1!
    const a = { c: colIndex(m[2]), r: +m[4] - 1, ac: !!m[1], ar: !!m[3] };
    let len = m[0].length;
    const m2 = /^\s*:\s*(\$?)([A-Za-z]{1,3})(\$?)(\d{1,7})(?![\w(.!])/.exec(rest.slice(len));
    if (m2 && +m2[4] > 0) return { kind: 'rng', a, b: { c: colIndex(m2[2]), r: +m2[4] - 1, ac: !!m2[1], ar: !!m2[3] }, len: len + m2[0].length };
    return { kind: 'cell', a, len };
  }
  function tokenize(s) {
    const out = [];
    let i = 0;
    while (i < s.length) {
      const ch = s[i];
      if (/\s/.test(ch)) { i++; continue; }
      const rest = s.slice(i);
      let m;
      if (ch === '"') {
        let j = i + 1, v = '';
        for (;;) {
          if (j >= s.length) throw new SyntaxErr('Anführungszeichen fehlt', i);
          if (s[j] === '"') { if (s[j + 1] === '"') { v += '"'; j += 2; continue; } break; }
          v += s[j++];
        }
        out.push({ t: 'str', v, p: i, e: j + 1 }); i = j + 1; continue;
      }
      if (ch === '#') {
        m = /^#(DIV\/0!|WERT!|VALUE!|BEZUG!|REF!|NAME\?|ZAHL!|NUM!|NV|N\/A|NULL!|ZIRKEL!)/i.exec(rest);
        if (!m) throw new SyntaxErr('Unbekannter Fehlerwert', i);
        out.push({ t: 'err', v: ERR_LIT[m[0].toUpperCase()], p: i, e: i + m[0].length }); i += m[0].length; continue;
      }
      // Bezug mit Tabellenname in Hochkommas: 'Meine Tabelle'!A1, auch mit Seite: '[Meine Seite]Tabelle 1'!A1
      if (ch === "'") {
        m = /^'((?:[^']|'')+)'!/.exec(rest);
        if (!m) throw new SyntaxErr('Tabellenname nicht abgeschlossen', i);
        const ref = readRef(s, i + m[0].length);
        if (!ref) throw new SyntaxErr('Bezug fehlt nach dem Tabellennamen', i);
        let name = m[1].replace(/''/g, "'"), page = null;
        const pm = /^\[([^\]]+)\](.+)$/.exec(name);
        if (pm) { page = pm[1].trim(); name = pm[2]; }
        out.push({ t: 'ref', page, sheet: name, ...ref, p: i, e: i + m[0].length + ref.len }); i += m[0].length + ref.len; continue;
      }
      // Bezug auf eine Tabelle einer anderen Seite (1.26): [Seite]Tabelle1!A1 bzw. [Abschnitt/Seite]Tabelle1!A1
      if (ch === '[') {
        m = /^\[([^\]]+)\]([A-Za-zÄÖÜäöüß_\\][A-Za-z0-9ÄÖÜäöüß_.]*)!/.exec(rest);
        if (!m) throw new SyntaxErr('Seite und Tabelle erwartet, z.B. [Seite]Tabelle1!A1', i);
        const ref = readRef(s, i + m[0].length);
        if (!ref) throw new SyntaxErr('Bezug fehlt nach dem Tabellennamen', i);
        out.push({ t: 'ref', page: m[1].trim(), sheet: m[2], ...ref, p: i, e: i + m[0].length + ref.len }); i += m[0].length + ref.len; continue;
      }
      // Bezug ohne Tabellenname
      if (/[$A-Za-z0-9]/.test(ch)) {
        const ref = readRef(s, i);
        if (ref) { out.push({ t: 'ref', page: null, sheet: null, ...ref, p: i, e: i + ref.len }); i += ref.len; continue; }
      }
      m = /^(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?/.exec(rest);
      if (m) { out.push({ t: 'num', v: parseFloat(m[0]), p: i, e: i + m[0].length }); i += m[0].length; continue; }
      m = ID_RE.exec(rest);
      if (m) {
        const id = m[0];
        const j = i + id.length;
        if (s[j] === '!') {
          const ref = readRef(s, j + 1);
          if (!ref) throw new SyntaxErr('Bezug fehlt nach dem Tabellennamen', i);
          out.push({ t: 'ref', page: null, sheet: id, ...ref, p: i, e: j + 1 + ref.len }); i = j + 1 + ref.len; continue;
        }
        let k = j; while (k < s.length && /\s/.test(s[k])) k++;
        if (s[k] === '(') { out.push({ t: 'fn', v: id, p: i, e: j }); i = j; continue; }
        if (/^(wahr|true)$/i.test(id)) { out.push({ t: 'bool', v: true, p: i, e: j }); i = j; continue; }
        if (/^(falsch|false)$/i.test(id)) { out.push({ t: 'bool', v: false, p: i, e: j }); i = j; continue; }
        out.push({ t: 'name', v: id, p: i, e: j }); i = j; continue;
      }
      m = /^(<=|>=|<>|[-+*/^&=<>%(),;:{}])/.exec(rest);
      if (m) { out.push({ t: 'op', v: m[0], p: i, e: i + m[0].length }); i += m[0].length; continue; }
      throw new SyntaxErr('Unerwartetes Zeichen „' + ch + '“', i);
    }
    return out;
  }

  const PREC = { '=': 1, '<>': 1, '<': 1, '>': 1, '<=': 1, '>=': 1, '&': 2, '+': 3, '-': 3, '*': 4, '/': 4, '^': 5 };
  const astCache = new Map();
  /* Formel (ohne '=') -> Syntaxbaum */
  function parse(src) {
    let hit = astCache.get(src);
    if (hit) return hit;
    const toks = tokenize(src);
    let i = 0;
    const peek = () => toks[i];
    const isOp = (t, v) => t && t.t === 'op' && t.v === v;
    const expr = (min) => {
      let a = unary();
      for (;;) {
        const t = peek();
        if (!t || t.t !== 'op' || !(t.v in PREC) || PREC[t.v] < min) break;
        i++;
        a = { k: 'bin', op: t.v, a, b: expr(PREC[t.v] + 1) };
      }
      return a;
    };
    const unary = () => {
      const t = peek();
      if (t && t.t === 'op' && (t.v === '-' || t.v === '+')) { i++; const a = unary(); return t.v === '-' ? { k: 'neg', a } : { k: 'pos', a }; }
      let a = primary();
      while (isOp(peek(), '%')) { i++; a = { k: 'pct', a }; }
      return a;
    };
    const primary = () => {
      const t = toks[i++];
      if (!t) throw new SyntaxErr('Formel unvollständig', src.length);
      switch (t.t) {
        case 'num': return { k: 'lit', v: t.v };
        case 'str': return { k: 'lit', v: t.v };
        case 'bool': return { k: 'lit', v: t.v };
        case 'err': return { k: 'lit', v: t.v };
        case 'ref': return { k: 'ref', page: t.page, sheet: t.sheet, kind: t.kind, a: t.a, b: t.b };
        case 'name': return { k: 'name', v: t.v };
        case 'fn': {
          if (!isOp(toks[i], '(')) throw new SyntaxErr('Klammer fehlt', t.e);
          i++;
          const args = [];
          if (isOp(peek(), ')')) { i++; return { k: 'fn', name: t.v.toUpperCase(), args }; }
          for (;;) {
            const p = peek();
            if (p && p.t === 'op' && (p.v === ';' || p.v === ',' || p.v === ')')) args.push({ k: 'miss' });
            else args.push(expr(1));
            const q = toks[i++];
            if (!q) break;   // fehlende schliessende Klammer am Ende: wie Excel ergänzen
            if (q.t === 'op' && q.v === ')') break;
            if (!(q.t === 'op' && (q.v === ';' || q.v === ','))) throw new SyntaxErr('„;“ oder „)“ erwartet', q.p);
          }
          return { k: 'fn', name: t.v.toUpperCase(), args };
        }
        case 'op':
          if (t.v === '(') {
            const a = expr(1);
            const q = toks[i++];
            if (q && !(q.t === 'op' && q.v === ')')) throw new SyntaxErr('„)“ erwartet', q.p);
            return { k: 'paren', a };
          }
          if (t.v === '{') {
            // Matrixkonstante {1;2;3} bzw. {1.2\3} – Zeilen mit „;“, Spalten mit „,“ (wie Excel de-CH: Spalten „.“ ist nicht möglich, wir nehmen „,“)
            const rows = [[]];
            for (;;) {
              const v = unary();
              if (v.k !== 'lit' && !(v.k === 'neg' && v.a.k === 'lit')) throw new SyntaxErr('Nur Konstanten in { }', t.p);
              rows[rows.length - 1].push(v.k === 'neg' ? -v.a.v : v.v);
              const q = toks[i++];
              if (!q) throw new SyntaxErr('„}“ fehlt', src.length);
              if (isOp(q, '}')) break;
              if (isOp(q, ';')) rows.push([]);
              else if (!isOp(q, ',')) throw new SyntaxErr('„}“ erwartet', q.p);
            }
            return { k: 'arr', a: rows };
          }
          throw new SyntaxErr('Unerwartetes „' + t.v + '“', t.p);
      }
      throw new SyntaxErr('Unerwartetes Zeichen', t.p);
    };
    const ast = expr(1);
    if (i < toks.length) throw new SyntaxErr('Unerwartetes „' + (toks[i].v ?? '') + '“', toks[i].p);
    if (astCache.size > 5000) astCache.clear();
    astCache.set(src, ast);
    return ast;
  }
  /* prüft eine Formel; null = in Ordnung, sonst { msg, pos } */
  function check(raw) {
    if (!isFormula(raw)) return null;
    try { parse(raw.slice(1)); return null; } catch (e) { if (e instanceof SyntaxErr) return { msg: e.message, pos: e.pos + 1 }; throw e; }
  }

  /* ================================================================ Rechnen */
  function ev(n, cx) {
    switch (n.k) {
      case 'lit': return n.v;
      case 'miss': return MISSING;
      case 'paren': return ev(n.a, cx);
      case 'arr': return new Arr(n.a.map(r => r.slice()));
      case 'name': return ERR.name;
      case 'ref': {
        const sh = n.sheet ? cx.book.sheet(n.sheet, cx.sh, n.page) : cx.sh;
        if (!sh) return ERR.ref;
        if (n.kind === 'cell') { cx.book.track(sh, n.a.c, n.a.r, n.a.c, n.a.r); return new Rng(cx.book, sh, n.a.c, n.a.r, n.a.c, n.a.r); }
        cx.book.track(sh, Math.min(n.a.c, n.b.c), Math.min(n.a.r, n.b.r), Math.max(n.a.c, n.b.c), Math.max(n.a.r, n.b.r));
        return new Rng(cx.book, sh, n.a.c, n.a.r, n.b.c, n.b.r);
      }
      case 'neg': return lift1(ev(n.a, cx), cx, (x) => -num(x));
      case 'pos': return ev(n.a, cx);
      case 'pct': return lift1(ev(n.a, cx), cx, (x) => num(x) / 100);
      case 'bin': {
        const a = ev(n.a, cx), b = ev(n.b, cx);
        return lift2(a, b, cx, OPS[n.op]);
      }
      case 'fn': return call(n, cx);
    }
    return ERR.value;
  }
  const safe = (f) => (...a) => { try { return f(...a); } catch (e) { if (e instanceof Throw) return e.err; throw e; } };
  const lift1 = (v, cx, f) => {
    const g = safe(f);
    if (isArr(v) && !(v instanceof Rng && v.h === 1 && v.w === 1)) return new Arr(v.rows().map(r => r.map(x => g(x))));
    return g(scalar(v, cx));
  };
  const lift2 = (a, b, cx, f) => {
    const g = safe(f);
    const multi = (v) => isArr(v) && !(v.h === 1 && v.w === 1);
    if (!multi(a) && !multi(b)) return g(scalar(a, cx), scalar(b, cx));
    const A = toArr(a), B = toArr(b);
    const h = Math.max(A.h, B.h), w = Math.max(A.w, B.w);
    const pick = (X, i, j) => X.at(X.h === 1 ? 0 : i, X.w === 1 ? 0 : j);
    const out = [];
    for (let i = 0; i < h; i++) { const row = []; for (let j = 0; j < w; j++) row.push(i >= A.h && A.h > 1 || j >= A.w && A.w > 1 || i >= B.h && B.h > 1 || j >= B.w && B.w > 1 ? ERR.na : g(pick(A, i, j), pick(B, i, j))); out.push(row); }
    return new Arr(out);
  };
  const errFirst = (a, b) => { if (isErr(a)) fail(a); if (isErr(b)) fail(b); };
  const OPS = {
    '+': (a, b) => num(a) + num(b),
    '-': (a, b) => num(a) - num(b),
    '*': (a, b) => num(a) * num(b),
    '/': (a, b) => { const x = num(a), y = num(b); if (y === 0) fail(ERR.div0); return x / y; },
    '^': (a, b) => { const x = num(a), y = num(b); if (x === 0 && y === 0) fail(ERR.num); const r = Math.pow(x, y); if (!isFinite(r) || isNaN(r)) fail(x === 0 ? ERR.div0 : ERR.num); return r; },
    '&': (a, b) => text(a) + text(b),
    '=': (a, b) => { errFirst(a, b); return compare(a, b) === 0; },
    '<>': (a, b) => { errFirst(a, b); return compare(a, b) !== 0; },
    '<': (a, b) => { errFirst(a, b); return compare(a, b) < 0; },
    '>': (a, b) => { errFirst(a, b); return compare(a, b) > 0; },
    '<=': (a, b) => { errFirst(a, b); return compare(a, b) <= 0; },
    '>=': (a, b) => { errFirst(a, b); return compare(a, b) >= 0; },
  };

  /* ================================================================ Funktionen */
  const F = {};       // englischer Name -> { min, max, fn, lazy? }
  const ALIAS = {};   // deutscher / anderer Name -> englischer Name
  const def = (names, min, max, fn, opt = {}) => {
    const [en, ...al] = names.split('|');
    F[en] = { min, max, fn, ...opt };
    for (const x of al) ALIAS[x] = en;
  };
  const fnName = (name) => { const u = name.toUpperCase().replace(/^_XLFN\./, ''); return F[u] ? u : ALIAS[u] || null; };
  function call(n, cx) {
    const en = fnName(n.name);
    if (!en) return ERR.name;
    const d = F[en];
    if (n.args.length < d.min || n.args.length > d.max) return ERR.value;
    try {
      if (d.lazy) return d.fn(n.args, cx);
      const args = n.args.map(a => ev(a, cx));
      return d.fn(args, cx);
    } catch (e) { if (e instanceof Throw) return e.err; throw e; }
  }
  const lazyVal = (node, cx) => node ? scalar(ev(node, cx), cx) : MISSING;
  const S = (v, cx) => { const x = scalar(v, cx); if (isErr(x)) fail(x); return x; };   // Einzelwert ohne Fehler
  const N = (v, cx) => num(S(v, cx));
  const T = (v, cx) => text(S(v, cx));

  /* Zahlen aus Argumenten: aus Bereichen nur echte Zahlen, direkte Werte werden umgewandelt */
  function nums(args, cx, { errors = true } = {}) {
    const out = [];
    for (const a of args) {
      if (a === MISSING) continue;
      if (isArr(a)) { for (const v of each(a)) { if (isErr(v)) { if (errors) fail(v); continue; } if (typeof v === 'number') out.push(v); } }
      else out.push(num(a));
    }
    return out;
  }
  function flat(args) { const out = []; for (const a of args) for (const v of each(a)) out.push(v); return out; }
  const sum = (a) => a.reduce((s, x) => s + x, 0);
  const mean = (a) => { if (!a.length) fail(ERR.div0); return sum(a) / a.length; };
  const variance = (a, pop) => { const n = a.length; if (n < (pop ? 1 : 2)) fail(ERR.div0); const m = sum(a) / n; return sum(a.map(x => (x - m) ** 2)) / (pop ? n : n - 1); };
  const sorted = (a) => [...a].sort((x, y) => x - y);
  const percentile = (a, p) => { if (!a.length || p < 0 || p > 1) fail(ERR.num); const s = sorted(a), h = (s.length - 1) * p, lo = Math.floor(h); return lo + 1 < s.length ? s[lo] + (h - lo) * (s[lo + 1] - s[lo]) : s[lo]; };
  const fact = (n) => { n = Math.floor(n); if (n < 0) fail(ERR.num); if (n > 170) fail(ERR.num); let r = 1; for (let i = 2; i <= n; i++) r *= i; return r; };
  const gcd2 = (a, b) => { a = Math.abs(Math.floor(a)); b = Math.abs(Math.floor(b)); while (b) [a, b] = [b, a % b]; return a; };

  /* Kriterien wie bei ZÄHLENWENN: ">5", "<>x", "Ap*", 7 */
  function crit(c) {
    if (typeof c === 'number' || typeof c === 'boolean') return (v) => v !== null && compare(v, c) === 0 && typeof v === typeof c;
    let s = c === null || c === MISSING ? '' : String(c);
    let op = '=';
    const m = /^(<=|>=|<>|=|<|>)/.exec(s);
    if (m) { op = m[1]; s = s.slice(m[1].length); }
    const nv = parseInput(s).v;
    const isNum = typeof nv === 'number' && s.trim() !== '';
    if (op === '=' || op === '<>') {
      let test;
      if (s === '') test = (v) => v === null || v === '';
      else if (isNum) test = (v) => typeof v === 'number' && compare(v, nv) === 0;
      else if (/[*?]/.test(s)) { const re = new RegExp('^' + s.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/~\*/g, '\u0001').replace(/~\?/g, '\u0002').replace(/\*/g, '.*').replace(/\?/g, '.').replace(/\u0001/g, '\\*').replace(/\u0002/g, '\\?') + '$', 'i'); test = (v) => typeof v === 'string' && re.test(v); }
      else if (/^(wahr|falsch|true|false)$/i.test(s)) { const b = /^(wahr|true)$/i.test(s); test = (v) => v === b; }
      else test = (v) => typeof v === 'string' && v.toLowerCase() === s.toLowerCase();
      return op === '=' ? test : (v) => !test(v);
    }
    if (isNum) return (v) => typeof v === 'number' && { '<': v < nv, '>': v > nv, '<=': v <= nv, '>=': v >= nv }[op];
    return (v) => typeof v === 'string' && { '<': compare(v, s) < 0, '>': compare(v, s) > 0, '<=': compare(v, s) <= 0, '>=': compare(v, s) >= 0 }[op];
  }
  /* mehrere Bereich/Kriterium-Paare -> Liste der passenden Positionen */
  function ifsMatch(pairs, cx) {
    let h = 0, w = 0, ok = null;
    for (let k = 0; k < pairs.length; k += 2) {
      const r = toArr(pairs[k]);
      if (ok === null) { h = r.h; w = r.w; ok = new Array(h * w).fill(true); }
      else if (r.h !== h || r.w !== w) fail(ERR.value);
      const t = crit(S(pairs[k + 1], cx));
      for (let i = 0; i < h; i++) for (let j = 0; j < w; j++) if (ok[i * w + j] && !t(r.at(i, j))) ok[i * w + j] = false;
    }
    return { ok, h, w };
  }
  const cellAt = (r, idx, w) => r.at(Math.floor(idx / w), idx % w);

  // ---- Mathematik
  def('SUM|SUMME', 1, 255, (a, cx) => sum(nums(a, cx)));
  def('AVERAGE|MITTELWERT', 1, 255, (a, cx) => mean(nums(a, cx)));
  def('AVERAGEA|MITTELWERTA', 1, 255, (a) => { const v = flat(a).filter(x => x !== null && x !== MISSING).map(x => { if (isErr(x)) fail(x); return typeof x === 'number' ? x : typeof x === 'boolean' ? +x : 0; }); return mean(v); });
  def('COUNT|ANZAHL', 1, 255, (a) => { let n = 0; for (const x of a) { if (isArr(x)) { for (const v of each(x)) if (typeof v === 'number') n++; } else if (x !== MISSING) { try { num(x); if (x !== null) n++; } catch (e) { /* kein Zahlwert */ } } } return n; });
  def('COUNTA|ANZAHL2', 1, 255, (a) => flat(a).filter(v => v !== null && v !== MISSING).length);
  def('COUNTBLANK|ANZAHLLEEREZELLEN', 1, 1, (a) => flat(a).filter(v => v === null || v === '').length);
  def('MIN', 1, 255, (a, cx) => { const v = nums(a, cx); return v.length ? Math.min(...v) : 0; });
  def('MAX', 1, 255, (a, cx) => { const v = nums(a, cx); return v.length ? Math.max(...v) : 0; });
  def('MEDIAN', 1, 255, (a, cx) => { const v = nums(a, cx); if (!v.length) fail(ERR.num); return percentile(v, 0.5); });
  def('PRODUCT|PRODUKT', 1, 255, (a, cx) => { const v = nums(a, cx); return v.length ? v.reduce((p, x) => p * x, 1) : 0; });
  def('MODE|MODUS|MODE.SNGL|MODUS.EINF', 1, 255, (a, cx) => { const v = nums(a, cx), cnt = new Map(); let best = null, bc = 1; for (const x of v) { const c = (cnt.get(x) || 0) + 1; cnt.set(x, c); if (c > bc) { bc = c; best = x; } } if (best === null) fail(ERR.na); return best; });
  def('LARGE|KGRÖSSTE', 2, 2, (a, cx) => { const v = sorted(nums([a[0]], cx)).reverse(), k = Math.ceil(N(a[1], cx)); if (k < 1 || k > v.length) fail(ERR.num); return v[k - 1]; });
  def('SMALL|KKLEINSTE', 2, 2, (a, cx) => { const v = sorted(nums([a[0]], cx)), k = Math.ceil(N(a[1], cx)); if (k < 1 || k > v.length) fail(ERR.num); return v[k - 1]; });
  def('RANK|RANG|RANK.EQ|RANG.GLEICH', 2, 3, (a, cx) => { const x = N(a[0], cx), v = nums([a[1]], cx), asc = a[2] !== undefined && a[2] !== MISSING && N(a[2], cx) !== 0; if (!v.includes(x)) fail(ERR.na); return 1 + v.filter(y => asc ? y < x : y > x).length; });
  def('STDEV|STABW|STDEV.S|STABW.S', 1, 255, (a, cx) => Math.sqrt(variance(nums(a, cx), false)));
  def('STDEVP|STABWN|STDEV.P|STABW.N', 1, 255, (a, cx) => Math.sqrt(variance(nums(a, cx), true)));
  def('VAR|VARIANZ|VAR.S', 1, 255, (a, cx) => variance(nums(a, cx), false));
  def('VARP|VARIANZEN|VAR.P', 1, 255, (a, cx) => variance(nums(a, cx), true));
  def('GEOMEAN|GEOMITTEL', 1, 255, (a, cx) => { const v = nums(a, cx); if (!v.length || v.some(x => x <= 0)) fail(ERR.num); return Math.exp(sum(v.map(Math.log)) / v.length); });
  def('HARMEAN|HARMITTEL', 1, 255, (a, cx) => { const v = nums(a, cx); if (!v.length || v.some(x => x <= 0)) fail(ERR.num); return v.length / sum(v.map(x => 1 / x)); });
  def('AVEDEV|MITTELABW', 1, 255, (a, cx) => { const v = nums(a, cx), m = mean(v); return sum(v.map(x => Math.abs(x - m))) / v.length; });
  def('PERCENTILE|QUANTIL|PERCENTILE.INC|QUANTIL.INKL', 2, 2, (a, cx) => percentile(nums([a[0]], cx), N(a[1], cx)));
  def('QUARTILE|QUARTILE.INC|QUARTILE.INKL', 2, 2, (a, cx) => { const q = Math.floor(N(a[1], cx)); if (q < 0 || q > 4) fail(ERR.num); return percentile(nums([a[0]], cx), q / 4); });
  def('ROUND|RUNDEN', 2, 2, (a, cx) => round(N(a[0], cx), Math.trunc(N(a[1], cx))));
  def('ROUNDUP|AUFRUNDEN', 2, 2, (a, cx) => { const x = N(a[0], cx), p = Math.pow(10, Math.trunc(N(a[1], cx))); return Math.sign(x) * Math.ceil(+(Math.abs(x) * p).toPrecision(15)) / p; });
  def('ROUNDDOWN|ABRUNDEN', 2, 2, (a, cx) => { const x = N(a[0], cx), p = Math.pow(10, Math.trunc(N(a[1], cx))); return Math.sign(x) * Math.floor(+(Math.abs(x) * p).toPrecision(15)) / p; });
  def('INT|GANZZAHL', 1, 1, (a, cx) => Math.floor(N(a[0], cx)));
  def('TRUNC|KÜRZEN', 1, 2, (a, cx) => { const p = Math.pow(10, a[1] !== undefined ? Math.trunc(N(a[1], cx)) : 0), x = N(a[0], cx); return Math.trunc(+(x * p).toPrecision(15)) / p; });
  def('MROUND|VRUNDEN', 2, 2, (a, cx) => { const x = N(a[0], cx), m = N(a[1], cx); if (m === 0) return 0; if (x * m < 0) fail(ERR.num); return round(x / m, 0) * m; });
  def('CEILING|OBERGRENZE|CEILING.MATH|OBERGRENZE.MATHEMATIK', 1, 3, (a, cx) => { const x = N(a[0], cx), m = a[1] !== undefined && a[1] !== MISSING ? Math.abs(N(a[1], cx)) : 1; if (m === 0) return 0; return Math.ceil(+(x / m).toPrecision(15)) * m; });
  def('FLOOR|UNTERGRENZE|FLOOR.MATH|UNTERGRENZE.MATHEMATIK', 1, 3, (a, cx) => { const x = N(a[0], cx), m = a[1] !== undefined && a[1] !== MISSING ? Math.abs(N(a[1], cx)) : 1; if (m === 0) fail(ERR.div0); return Math.floor(+(x / m).toPrecision(15)) * m; });
  def('EVEN|GERADE', 1, 1, (a, cx) => { const x = N(a[0], cx), r = Math.ceil(Math.abs(x) / 2) * 2; return x < 0 ? -r : r; });
  def('ODD|UNGERADE', 1, 1, (a, cx) => { const x = N(a[0], cx); let r = Math.ceil(Math.abs(x)); if (r % 2 === 0) r++; return x < 0 ? -r : r; });
  def('ABS', 1, 1, (a, cx) => Math.abs(N(a[0], cx)));
  def('SQRT|WURZEL', 1, 1, (a, cx) => { const x = N(a[0], cx); if (x < 0) fail(ERR.num); return Math.sqrt(x); });
  def('POWER|POTENZ', 2, 2, (a, cx) => OPS['^'](N(a[0], cx), N(a[1], cx)));
  def('EXP', 1, 1, (a, cx) => Math.exp(N(a[0], cx)));
  def('LN', 1, 1, (a, cx) => { const x = N(a[0], cx); if (x <= 0) fail(ERR.num); return Math.log(x); });
  def('LOG', 1, 2, (a, cx) => { const x = N(a[0], cx), b = a[1] !== undefined && a[1] !== MISSING ? N(a[1], cx) : 10; if (x <= 0 || b <= 0 || b === 1) fail(b === 1 ? ERR.div0 : ERR.num); return Math.log(x) / Math.log(b); });
  def('LOG10', 1, 1, (a, cx) => { const x = N(a[0], cx); if (x <= 0) fail(ERR.num); return Math.log10(x); });
  def('MOD|REST', 2, 2, (a, cx) => { const x = N(a[0], cx), y = N(a[1], cx); if (y === 0) fail(ERR.div0); return x - y * Math.floor(x / y); });
  def('QUOTIENT', 2, 2, (a, cx) => { const y = N(a[1], cx); if (y === 0) fail(ERR.div0); return Math.trunc(N(a[0], cx) / y); });
  def('PI', 0, 0, () => Math.PI);
  def('SIGN|VORZEICHEN', 1, 1, (a, cx) => Math.sign(N(a[0], cx)));
  def('FACT|FAKULTÄT', 1, 1, (a, cx) => fact(N(a[0], cx)));
  def('COMBIN|KOMBINATIONEN', 2, 2, (a, cx) => { const n = Math.floor(N(a[0], cx)), k = Math.floor(N(a[1], cx)); if (n < 0 || k < 0 || k > n) fail(ERR.num); let r = 1; for (let i = 1; i <= k; i++) r = r * (n - k + i) / i; return Math.round(r); });
  def('PERMUT|VARIATIONEN', 2, 2, (a, cx) => { const n = Math.floor(N(a[0], cx)), k = Math.floor(N(a[1], cx)); if (n < 0 || k < 0 || k > n) fail(ERR.num); let r = 1; for (let i = 0; i < k; i++) r *= n - i; return r; });
  def('GCD|GGT', 1, 255, (a, cx) => nums(a, cx).reduce((g, x) => { if (x < 0) fail(ERR.num); return gcd2(g, x); }, 0));
  def('LCM|KGV', 1, 255, (a, cx) => nums(a, cx).reduce((l, x) => { x = Math.floor(x); if (x < 0) fail(ERR.num); return l === 0 || x === 0 ? 0 : l / gcd2(l, x) * x; }, 1));
  def('SUMSQ|QUADRATESUMME', 1, 255, (a, cx) => sum(nums(a, cx).map(x => x * x)));
  def('SUMPRODUCT|SUMMENPRODUKT', 1, 255, (a) => {
    const arrs = a.map(toArr);
    const h = arrs[0].h, w = arrs[0].w;
    if (arrs.some(x => x.h !== h || x.w !== w)) fail(ERR.value);
    let s = 0;
    for (let i = 0; i < h; i++) for (let j = 0; j < w; j++) { let p = 1; for (const x of arrs) { const v = x.at(i, j); if (isErr(v)) fail(v); p *= typeof v === 'number' ? v : typeof v === 'boolean' && arrs.length === 1 ? +v : 0; } s += p; }
    return s;
  });
  def('SIN', 1, 1, (a, cx) => Math.sin(N(a[0], cx)));
  def('COS', 1, 1, (a, cx) => Math.cos(N(a[0], cx)));
  def('TAN', 1, 1, (a, cx) => Math.tan(N(a[0], cx)));
  def('ASIN|ARCSIN', 1, 1, (a, cx) => { const x = N(a[0], cx); if (Math.abs(x) > 1) fail(ERR.num); return Math.asin(x); });
  def('ACOS|ARCCOS', 1, 1, (a, cx) => { const x = N(a[0], cx); if (Math.abs(x) > 1) fail(ERR.num); return Math.acos(x); });
  def('ATAN|ARCTAN', 1, 1, (a, cx) => Math.atan(N(a[0], cx)));
  def('ATAN2|ARCTAN2', 2, 2, (a, cx) => { const x = N(a[0], cx), y = N(a[1], cx); if (x === 0 && y === 0) fail(ERR.div0); return Math.atan2(y, x); });
  def('SINH|SINHYP', 1, 1, (a, cx) => Math.sinh(N(a[0], cx)));
  def('COSH|COSHYP', 1, 1, (a, cx) => Math.cosh(N(a[0], cx)));
  def('TANH|TANHYP', 1, 1, (a, cx) => Math.tanh(N(a[0], cx)));
  def('DEGREES|GRAD', 1, 1, (a, cx) => N(a[0], cx) * 180 / Math.PI);
  def('RADIANS|BOGENMASS', 1, 1, (a, cx) => N(a[0], cx) * Math.PI / 180);
  def('RAND|ZUFALLSZAHL', 0, 0, () => Math.random(), { volatile: true });
  def('RANDBETWEEN|ZUFALLSBEREICH', 2, 2, (a, cx) => { const lo = Math.ceil(N(a[0], cx)), hi = Math.floor(N(a[1], cx)); if (hi < lo) fail(ERR.num); return lo + Math.floor(Math.random() * (hi - lo + 1)); }, { volatile: true });

  // ---- bedingte Summen und Zählungen
  def('SUMIF|SUMMEWENN', 2, 3, (a, cx) => { const r = toArr(a[0]), t = crit(S(a[1], cx)), s = a[2] !== undefined && a[2] !== MISSING ? toArr(a[2]) : r; let tot = 0; for (let i = 0; i < r.h; i++) for (let j = 0; j < r.w; j++) if (t(r.at(i, j))) { const v = i < s.h && j < s.w ? s.at(i, j) : null; if (isErr(v)) fail(v); if (typeof v === 'number') tot += v; } return tot; });
  def('SUMIFS|SUMMEWENNS', 3, 255, (a, cx) => { const s = toArr(a[0]); const m = ifsMatch(a.slice(1), cx); if (s.h !== m.h || s.w !== m.w) fail(ERR.value); let tot = 0; m.ok.forEach((o, k) => { if (o) { const v = cellAt(s, k, m.w); if (isErr(v)) fail(v); if (typeof v === 'number') tot += v; } }); return tot; });
  def('COUNTIF|ZÄHLENWENN', 2, 2, (a, cx) => { const t = crit(S(a[1], cx)); let n = 0; for (const v of each(toArr(a[0]))) if (t(v)) n++; return n; });
  def('COUNTIFS|ZÄHLENWENNS', 2, 254, (a, cx) => ifsMatch(a, cx).ok.filter(Boolean).length);
  def('AVERAGEIF|MITTELWERTWENN', 2, 3, (a, cx) => { const r = toArr(a[0]), t = crit(S(a[1], cx)), s = a[2] !== undefined && a[2] !== MISSING ? toArr(a[2]) : r; const v = []; for (let i = 0; i < r.h; i++) for (let j = 0; j < r.w; j++) if (t(r.at(i, j))) { const x = i < s.h && j < s.w ? s.at(i, j) : null; if (typeof x === 'number') v.push(x); } return mean(v); });
  def('AVERAGEIFS|MITTELWERTWENNS', 3, 255, (a, cx) => { const s = toArr(a[0]); const m = ifsMatch(a.slice(1), cx); const v = []; m.ok.forEach((o, k) => { if (o) { const x = cellAt(s, k, m.w); if (typeof x === 'number') v.push(x); } }); return mean(v); });
  def('MAXIFS|MAXWENNS', 3, 255, (a, cx) => { const s = toArr(a[0]); const m = ifsMatch(a.slice(1), cx); const v = []; m.ok.forEach((o, k) => { if (o) { const x = cellAt(s, k, m.w); if (typeof x === 'number') v.push(x); } }); return v.length ? Math.max(...v) : 0; });
  def('MINIFS|MINWENNS', 3, 255, (a, cx) => { const s = toArr(a[0]); const m = ifsMatch(a.slice(1), cx); const v = []; m.ok.forEach((o, k) => { if (o) { const x = cellAt(s, k, m.w); if (typeof x === 'number') v.push(x); } }); return v.length ? Math.min(...v) : 0; });

  // ---- Statistik: Zusammenhang und Verteilungen
  const pairs = (a, cx) => {
    const X = toArr(a[0]), Y = toArr(a[1]);
    if (X.h * X.w !== Y.h * Y.w) fail(ERR.na);
    const xs = [], ys = [];
    const xv = [...each(X)], yv = [...each(Y)];
    for (let k = 0; k < xv.length; k++) { if (isErr(xv[k])) fail(xv[k]); if (isErr(yv[k])) fail(yv[k]); if (typeof xv[k] === 'number' && typeof yv[k] === 'number') { xs.push(xv[k]); ys.push(yv[k]); } }
    return [xs, ys];
  };
  const linreg = (ys, xs) => {
    const n = xs.length; if (n < 2) fail(ERR.div0);
    const mx = sum(xs) / n, my = sum(ys) / n;
    let sxy = 0, sxx = 0, syy = 0;
    for (let k = 0; k < n; k++) { sxy += (xs[k] - mx) * (ys[k] - my); sxx += (xs[k] - mx) ** 2; syy += (ys[k] - my) ** 2; }
    if (sxx === 0) fail(ERR.div0);
    return { m: sxy / sxx, b: my - sxy / sxx * mx, r: syy === 0 ? ERR.div0 : sxy / Math.sqrt(sxx * syy) };
  };
  def('CORREL|KORREL', 2, 2, (a, cx) => { const [x, y] = pairs(a, cx); const r = linreg(y, x).r; if (isErr(r)) fail(r); return r; });
  def('PEARSON', 2, 2, (a, cx) => { const [x, y] = pairs(a, cx); const r = linreg(y, x).r; if (isErr(r)) fail(r); return r; });
  def('SLOPE|STEIGUNG', 2, 2, (a, cx) => { const [y, x] = pairs(a, cx); return linreg(y, x).m; });
  def('INTERCEPT|ACHSENABSCHNITT', 2, 2, (a, cx) => { const [y, x] = pairs(a, cx); return linreg(y, x).b; });
  def('RSQ|BESTIMMTHEITSMASS', 2, 2, (a, cx) => { const [y, x] = pairs(a, cx); const r = linreg(y, x).r; if (isErr(r)) fail(r); return r * r; });
  def('FORECAST|PROGNOSE|FORECAST.LINEAR|PROGNOSE.LINEAR', 3, 3, (a, cx) => { const x0 = N(a[0], cx); const [y, x] = pairs([a[1], a[2]], cx); const l = linreg(y, x); return l.b + l.m * x0; });
  const erf = (x) => { // Abramowitz-Stegun 7.1.26 verfeinert über Reihe
    const s = Math.sign(x); x = Math.abs(x);
    if (x < 3) { let sum = x, term = x, k = 0; while (Math.abs(term) > 1e-17 * Math.abs(sum) && k < 200) { k++; term *= -x * x / k; sum += term / (2 * k + 1); } return s * 2 / Math.sqrt(Math.PI) * sum; }
    // Kettenbruch für grosse x
    let f = 0; for (let k = 60; k >= 1; k--) f = k / 2 / (x + f);
    return s * (1 - Math.exp(-x * x) / Math.sqrt(Math.PI) / (x + f));
  };
  const normCdf = (z) => 0.5 * (1 + erf(z / Math.SQRT2));
  const normInv = (p) => { // Acklam + Newton
    if (p <= 0 || p >= 1) fail(ERR.num);
    const a = [-3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.383577518672690e2, -3.066479806614716e1, 2.506628277459239];
    const b = [-5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1, -1.328068155288572e1];
    const c = [-7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
    const d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416];
    let q, x;
    if (p < 0.02425) { q = Math.sqrt(-2 * Math.log(p)); x = (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
    else if (p > 1 - 0.02425) { q = Math.sqrt(-2 * Math.log(1 - p)); x = -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
    else { q = p - 0.5; const r = q * q; x = (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1); }
    for (let k = 0; k < 2; k++) { const e = normCdf(x) - p; const u = e * Math.sqrt(2 * Math.PI) * Math.exp(x * x / 2); x = x - u / (1 + x * u / 2); }
    return x;
  };
  const normPdf = (z) => Math.exp(-z * z / 2) / Math.sqrt(2 * Math.PI);
  def('NORM.DIST|NORM.VERT|NORMDIST|NORMVERT', 4, 4, (a, cx) => { const x = N(a[0], cx), m = N(a[1], cx), s = N(a[2], cx); if (s <= 0) fail(ERR.num); const z = (x - m) / s; return bool(S(a[3], cx)) ? normCdf(z) : normPdf(z) / s; });
  def('NORM.S.DIST|NORM.S.VERT', 2, 2, (a, cx) => { const z = N(a[0], cx); return bool(S(a[1], cx)) ? normCdf(z) : normPdf(z); });
  def('NORM.INV|NORMINV', 3, 3, (a, cx) => { const s = N(a[2], cx); if (s <= 0) fail(ERR.num); return N(a[1], cx) + s * normInv(N(a[0], cx)); });
  def('NORM.S.INV|NORMSINV', 1, 1, (a, cx) => normInv(N(a[0], cx)));
  def('BINOM.DIST|BINOM.VERT|BINOMDIST|BINOMVERT', 4, 4, (a, cx) => {
    const k = Math.floor(N(a[0], cx)), n = Math.floor(N(a[1], cx)), p = N(a[2], cx), cum = bool(S(a[3], cx));
    if (k < 0 || k > n || p < 0 || p > 1) fail(ERR.num);
    const pmf = (i) => { let c = 1; for (let j = 1; j <= i; j++) c = c * (n - i + j) / j; return c * Math.pow(p, i) * Math.pow(1 - p, n - i); };
    if (!cum) return pmf(k);
    let s = 0; for (let i = 0; i <= k; i++) s += pmf(i); return Math.min(1, s);
  });
  def('POISSON.DIST|POISSON.VERT|POISSON', 3, 3, (a, cx) => { const k = Math.floor(N(a[0], cx)), l = N(a[1], cx), cum = bool(S(a[2], cx)); if (k < 0 || l < 0) fail(ERR.num); const pmf = (i) => Math.exp(-l + i * Math.log(l || 1e-300) - Math.log(fact(Math.min(i, 170)) || 1)); if (!cum) return l === 0 ? (k === 0 ? 1 : 0) : pmf(k); let s = 0; for (let i = 0; i <= k; i++) s += l === 0 ? (i === 0 ? 1 : 0) : pmf(i); return Math.min(1, s); });

  // ---- Logik
  def('IF|WENN', 1, 3, (n, cx) => { const c = lazyVal(n[0], cx); if (isErr(c)) return c; const t = bool(c); if (t) return n[1] ? scalarOrRng(ev(n[1], cx)) : true; return n[2] ? scalarOrRng(ev(n[2], cx)) : false; }, { lazy: true });
  const scalarOrRng = (v) => v === MISSING ? 0 : v;
  def('IFS|WENNS', 2, 254, (n, cx) => { for (let k = 0; k + 1 < n.length; k += 2) { const c = lazyVal(n[k], cx); if (isErr(c)) return c; if (bool(c)) return scalarOrRng(ev(n[k + 1], cx)); } return ERR.na; }, { lazy: true });
  def('IFERROR|WENNFEHLER', 2, 2, (n, cx) => { const v = lazyVal(n[0], cx); return isErr(v) ? scalarOrRng(ev(n[1], cx)) : v; }, { lazy: true });
  def('IFNA|WENNNV', 2, 2, (n, cx) => { const v = lazyVal(n[0], cx); return v === ERR.na ? scalarOrRng(ev(n[1], cx)) : v; }, { lazy: true });
  def('SWITCH|ERSTERWERT', 3, 254, (n, cx) => { const v = lazyVal(n[0], cx); if (isErr(v)) return v; let k = 1; for (; k + 1 < n.length; k += 2) { const c = lazyVal(n[k], cx); if (isErr(c)) return c; if (compare(v, c) === 0 && typeof v === typeof c) return scalarOrRng(ev(n[k + 1], cx)); } return k < n.length ? scalarOrRng(ev(n[k], cx)) : ERR.na; }, { lazy: true });
  def('CHOOSE|WAHL', 2, 255, (n, cx) => { const i = Math.floor(num(lazyVal(n[0], cx))); if (i < 1 || i >= n.length) fail(ERR.value); return scalarOrRng(ev(n[i], cx)); }, { lazy: true });
  const bools = (a) => { const out = []; for (const x of a) { if (isArr(x)) { for (const v of each(x)) { if (isErr(v)) fail(v); if (typeof v === 'number' || typeof v === 'boolean') out.push(!!v); } } else if (x !== MISSING) out.push(bool(x)); } if (!out.length) fail(ERR.value); return out; };
  def('AND|UND', 1, 255, (a) => bools(a).every(Boolean));
  def('OR|ODER', 1, 255, (a) => bools(a).some(Boolean));
  def('XOR|XODER', 1, 255, (a) => bools(a).filter(Boolean).length % 2 === 1);
  def('NOT|NICHT', 1, 1, (a, cx) => !bool(S(a[0], cx)));
  def('TRUE|WAHR', 0, 0, () => true);
  def('FALSE|FALSCH', 0, 0, () => false);

  // ---- Informationen
  const s1 = (a, cx) => scalar(a[0], cx);
  def('ISNUMBER|ISTZAHL', 1, 1, (a, cx) => typeof s1(a, cx) === 'number');
  def('ISTEXT|ISTTEXT', 1, 1, (a, cx) => typeof s1(a, cx) === 'string');
  def('ISNONTEXT|ISTKTEXT', 1, 1, (a, cx) => typeof s1(a, cx) !== 'string');
  def('ISBLANK|ISTLEER', 1, 1, (a, cx) => s1(a, cx) === null);
  def('ISERROR|ISTFEHLER', 1, 1, (a, cx) => isErr(s1(a, cx)));
  def('ISERR|ISTFEHL', 1, 1, (a, cx) => { const v = s1(a, cx); return isErr(v) && v !== ERR.na; });
  def('ISNA|ISTNV', 1, 1, (a, cx) => s1(a, cx) === ERR.na);
  def('ISLOGICAL|ISTLOG', 1, 1, (a, cx) => typeof s1(a, cx) === 'boolean');
  def('ISEVEN|ISTGERADE', 1, 1, (a, cx) => Math.floor(Math.abs(N(a[0], cx))) % 2 === 0);
  def('ISODD|ISTUNGERADE', 1, 1, (a, cx) => Math.floor(Math.abs(N(a[0], cx))) % 2 === 1);
  def('NA|NV', 0, 0, () => ERR.na);
  def('N', 1, 1, (a, cx) => { const v = s1(a, cx); if (isErr(v)) fail(v); return typeof v === 'number' ? v : v === true ? 1 : 0; });

  // ---- Text
  def('CONCATENATE|VERKETTEN', 1, 255, (a, cx) => a.map(x => T(x, cx)).join(''));
  def('CONCAT|TEXTKETTE', 1, 255, (a) => flat(a).map(text).join(''));
  def('TEXTJOIN|TEXTVERKETTEN', 3, 255, (a, cx) => { const sep = T(a[0], cx), skip = bool(S(a[1], cx)); return flat(a.slice(2)).map(text).filter(s => !skip || s !== '').join(sep); });
  def('LEN|LÄNGE', 1, 1, (a, cx) => T(a[0], cx).length);
  def('LEFT|LINKS', 1, 2, (a, cx) => { const n = a[1] !== undefined && a[1] !== MISSING ? N(a[1], cx) : 1; if (n < 0) fail(ERR.value); return T(a[0], cx).slice(0, n); });
  def('RIGHT|RECHTS', 1, 2, (a, cx) => { const n = a[1] !== undefined && a[1] !== MISSING ? N(a[1], cx) : 1; if (n < 0) fail(ERR.value); const s = T(a[0], cx); return n ? s.slice(-n) : ''; });
  def('MID|TEIL', 3, 3, (a, cx) => { const st = Math.floor(N(a[1], cx)), n = Math.floor(N(a[2], cx)); if (st < 1 || n < 0) fail(ERR.value); return T(a[0], cx).substr(st - 1, n); });
  def('UPPER|GROSS', 1, 1, (a, cx) => T(a[0], cx).toUpperCase());
  def('LOWER|KLEIN', 1, 1, (a, cx) => T(a[0], cx).toLowerCase());
  def('PROPER|GROSS2', 1, 1, (a, cx) => T(a[0], cx).toLowerCase().replace(/(^|[^A-Za-zÀ-ÿ])([a-zà-ÿ])/g, (m, p, c) => p + c.toUpperCase()));
  def('TRIM|GLÄTTEN', 1, 1, (a, cx) => T(a[0], cx).replace(/ +/g, ' ').trim());
  def('REPT|WIEDERHOLEN', 2, 2, (a, cx) => { const n = Math.floor(N(a[1], cx)); if (n < 0 || n > 32767) fail(ERR.value); return T(a[0], cx).repeat(n); });
  def('TEXT', 2, 2, (a, cx) => formatCode(S(a[0], cx), T(a[1], cx)));
  def('VALUE|WERT', 1, 1, (a, cx) => num(S(a[0], cx)));
  def('NUMBERVALUE|ZAHLENWERT', 1, 3, (a, cx) => { let s = T(a[0], cx); const ds = a[1] !== undefined && a[1] !== MISSING ? T(a[1], cx) : '.', gs = a[2] !== undefined && a[2] !== MISSING ? T(a[2], cx) : TS; s = s.split(gs).join('').replace(ds, '.'); const n = plainNum(s.replace(/%$/, '')); if (n === null) fail(ERR.value); return /%$/.test(s) ? n / 100 : n; });
  def('FIND|FINDEN', 2, 3, (a, cx) => { const st = a[2] !== undefined && a[2] !== MISSING ? N(a[2], cx) : 1; const i = T(a[1], cx).indexOf(T(a[0], cx), st - 1); if (i < 0 || st < 1) fail(ERR.value); return i + 1; });
  def('SEARCH|SUCHEN', 2, 3, (a, cx) => { const st = a[2] !== undefined && a[2] !== MISSING ? N(a[2], cx) : 1; const pat = T(a[0], cx); const re = new RegExp(pat.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.'), 'i'); const s = T(a[1], cx).slice(st - 1); const m = re.exec(s); if (!m || st < 1) fail(ERR.value); return m.index + st; });
  def('SUBSTITUTE|WECHSELN', 3, 4, (a, cx) => { const s = T(a[0], cx), o = T(a[1], cx), n = T(a[2], cx); if (!o) return s; if (a[3] === undefined || a[3] === MISSING) return s.split(o).join(n); const k = Math.floor(N(a[3], cx)); let idx = -1; for (let i = 0; i < k; i++) { idx = s.indexOf(o, idx + 1); if (idx < 0) return s; } return s.slice(0, idx) + n + s.slice(idx + o.length); });
  def('REPLACE|ERSETZEN', 4, 4, (a, cx) => { const s = T(a[0], cx), st = Math.floor(N(a[1], cx)), n = Math.floor(N(a[2], cx)); if (st < 1 || n < 0) fail(ERR.value); return s.slice(0, st - 1) + T(a[3], cx) + s.slice(st - 1 + n); });
  def('EXACT|IDENTISCH', 2, 2, (a, cx) => T(a[0], cx) === T(a[1], cx));
  def('CHAR|ZEICHEN', 1, 1, (a, cx) => { const n = Math.floor(N(a[0], cx)); if (n < 1 || n > 255) fail(ERR.value); return n >= 128 && n < 160 ? new TextDecoder('windows-1252').decode(new Uint8Array([n])) : String.fromCharCode(n); });
  def('CODE', 1, 1, (a, cx) => { const s = T(a[0], cx); if (!s) fail(ERR.value); return s.charCodeAt(0); });
  def('FIXED|FEST', 1, 3, (a, cx) => { const d = a[1] !== undefined && a[1] !== MISSING ? Math.trunc(N(a[1], cx)) : 2; const noTs = a[2] !== undefined && a[2] !== MISSING && bool(S(a[2], cx)); return fixed(N(a[0], cx), Math.max(0, d), !noTs); });

  // ---- Nachschlagen
  const findApprox = (vals, x, desc) => { // grösster Wert <= x (aufsteigend sortiert), binär wie Excel
    let lo = 0, hi = vals.length - 1, best = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1, v = vals[mid];
      const c = v === null ? 1 : typeRank(v) !== typeRank(x) ? (typeRank(v) < typeRank(x) ? -1 : 1) : compare(v, x);
      if (desc ? c >= 0 : c <= 0) { best = mid; lo = mid + 1; } else hi = mid - 1;
    }
    return best;
  };
  const findExact = (vals, x) => {
    if (typeof x === 'string' && /[*?]/.test(x)) { const t = crit('=' + x); return vals.findIndex(v => t(v)); }
    return vals.findIndex(v => v !== null && typeRank(v) === typeRank(x) && compare(v, x) === 0);
  };
  def('VLOOKUP|SVERWEIS', 3, 4, (a, cx) => {
    const x = S(a[0], cx), t = toArr(a[1]), col = Math.floor(N(a[2], cx));
    const approx = a[3] === undefined || a[3] === MISSING ? true : bool(S(a[3], cx));
    if (col < 1) fail(ERR.value); if (col > t.w) fail(ERR.ref);
    const first = []; for (let i = 0; i < t.h; i++) first.push(t.at(i, 0));
    const i = approx ? findApprox(first, x) : findExact(first, x);
    if (i < 0) fail(ERR.na);
    return t.at(i, col - 1);
  });
  def('HLOOKUP|WVERWEIS', 3, 4, (a, cx) => {
    const x = S(a[0], cx), t = toArr(a[1]), row = Math.floor(N(a[2], cx));
    const approx = a[3] === undefined || a[3] === MISSING ? true : bool(S(a[3], cx));
    if (row < 1) fail(ERR.value); if (row > t.h) fail(ERR.ref);
    const first = []; for (let j = 0; j < t.w; j++) first.push(t.at(0, j));
    const j = approx ? findApprox(first, x) : findExact(first, x);
    if (j < 0) fail(ERR.na);
    return t.at(row - 1, j);
  });
  def('XLOOKUP|XVERWEIS', 3, 6, (a, cx) => {
    const x = S(a[0], cx), l = toArr(a[1]), r = toArr(a[2]);
    const mode = a[4] !== undefined && a[4] !== MISSING ? N(a[4], cx) : 0, rev = a[5] !== undefined && a[5] !== MISSING && N(a[5], cx) < 0;
    const vert = l.w === 1;
    const vals = vert ? Array.from({ length: l.h }, (_, i) => l.at(i, 0)) : Array.from({ length: l.w }, (_, j) => l.at(0, j));
    const order = vals.map((_, i) => i); if (rev) order.reverse();
    let hit = -1;
    if (mode === 2 || (typeof x === 'string' && /[*?]/.test(x) && mode === 2)) { const t = crit('=' + text(x)); hit = order.find(i => t(vals[i])) ?? -1; }
    else hit = order.find(i => vals[i] !== null && typeRank(vals[i]) === typeRank(x) && compare(vals[i], x) === 0) ?? -1;
    if (hit < 0 && (mode === -1 || mode === 1)) {
      let best = -1;
      for (const i of order) { const v = vals[i]; if (v === null || typeRank(v) !== typeRank(x)) continue; const c = compare(v, x); if (mode === -1 ? c < 0 && (best < 0 || compare(v, vals[best]) > 0) : c > 0 && (best < 0 || compare(v, vals[best]) < 0)) best = i; }
      hit = best;
    }
    if (hit < 0) { if (a[3] !== undefined && a[3] !== MISSING) return scalar(a[3], cx); fail(ERR.na); }
    return vert ? (r.w === 1 ? r.at(hit, 0) : new Arr([Array.from({ length: r.w }, (_, j) => r.at(hit, j))])) : (r.h === 1 ? r.at(0, hit) : new Arr(Array.from({ length: r.h }, (_, i) => [r.at(i, hit)])));
  });
  def('MATCH|VERGLEICH', 2, 3, (a, cx) => {
    const x = S(a[0], cx), t = toArr(a[1]), type = a[2] !== undefined && a[2] !== MISSING ? N(a[2], cx) : 1;
    if (t.h !== 1 && t.w !== 1) fail(ERR.na);
    const vals = [...each(t)];
    const i = type === 0 ? findExact(vals, x) : findApprox(vals, x, type < 0);
    if (i < 0) fail(ERR.na);
    return i + 1;
  });
  def('INDEX', 2, 3, (a, cx) => {
    const t = a[0];
    if (!isArr(t)) fail(ERR.value);
    let r = Math.floor(N(a[1], cx)), c = a[2] !== undefined && a[2] !== MISSING ? Math.floor(N(a[2], cx)) : 0;
    if (t.h === 1 && a[2] === undefined) { c = r; r = 1; }
    if (r < 0 || c < 0 || r > t.h || c > t.w) fail(ERR.ref);
    if (t instanceof Rng) {
      if (r === 0 && c === 0) return t;
      if (r === 0) return new Rng(t.book, t.sh, t.c1 + c - 1, t.r1, t.c1 + c - 1, t.r2);
      if (c === 0) { if (t.w === 1) return new Rng(t.book, t.sh, t.c1, t.r1 + r - 1, t.c1, t.r1 + r - 1); return new Rng(t.book, t.sh, t.c1, t.r1 + r - 1, t.c2, t.r1 + r - 1); }
      return new Rng(t.book, t.sh, t.c1 + c - 1, t.r1 + r - 1, t.c1 + c - 1, t.r1 + r - 1);
    }
    return t.at(Math.max(r, 1) - 1, Math.max(c, 1) - 1);
  });
  def('LOOKUP|VERWEIS', 2, 3, (a, cx) => {
    const x = S(a[0], cx), l = toArr(a[1]), r = a[2] !== undefined && a[2] !== MISSING ? toArr(a[2]) : null;
    const vals = l.w === 1 || l.h === 1 ? [...each(l)] : Array.from({ length: l.h }, (_, i) => l.at(i, 0));
    const i = findApprox(vals, x);
    if (i < 0) fail(ERR.na);
    if (r) return [...each(r)][i] ?? ERR.na;
    return l.w === 1 || l.h === 1 ? vals[i] : l.at(i, l.w - 1);
  });
  def('ROW|ZEILE', 0, 1, (a, cx) => a.length && a[0] instanceof Rng ? a[0].r1 + 1 : cx.r + 1);
  def('COLUMN|SPALTE', 0, 1, (a, cx) => a.length && a[0] instanceof Rng ? a[0].c1 + 1 : cx.c + 1);
  def('ROWS|ZEILEN', 1, 1, (a) => toArr(a[0]).h);
  def('COLUMNS|SPALTEN', 1, 1, (a) => toArr(a[0]).w);
  def('INDIRECT|INDIREKT', 1, 2, (a, cx) => {
    const s = T(a[0], cx);
    try {
      const toks = tokenize(s);
      if (toks.length !== 1 || toks[0].t !== 'ref') fail(ERR.ref);
      return ev({ k: 'ref', page: toks[0].page, sheet: toks[0].sheet, kind: toks[0].kind, a: toks[0].a, b: toks[0].b }, cx);
    } catch (e) { if (e instanceof Throw) throw e; fail(ERR.ref); }
  }, { volatile: true });
  def('OFFSET|BEREICH.VERSCHIEBEN', 3, 5, (a, cx) => {
    const t = a[0]; if (!(t instanceof Rng)) fail(ERR.value);
    const dr = Math.floor(N(a[1], cx)), dc = Math.floor(N(a[2], cx));
    const h = a[3] !== undefined && a[3] !== MISSING ? Math.floor(N(a[3], cx)) : t.h, w = a[4] !== undefined && a[4] !== MISSING ? Math.floor(N(a[4], cx)) : t.w;
    if (t.r1 + dr < 0 || t.c1 + dc < 0 || h < 1 || w < 1) fail(ERR.ref);
    return new Rng(t.book, t.sh, t.c1 + dc, t.r1 + dr, t.c1 + dc + w - 1, t.r1 + dr + h - 1);
  }, { volatile: true });

  // ---- Datum und Zeit
  const dparts = (n) => { const d = fromSerial(n); return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate(), wd: d.getUTCDay() }; };
  const nowSerial = () => { const d = new Date(); return toSerial(d.getFullYear(), d.getMonth() + 1, d.getDate()) + (d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds()) / 86400; };
  const D = (v, cx) => { const n = N(v, cx); if (n < 0) fail(ERR.num); return n; };
  def('TODAY|HEUTE', 0, 0, () => Math.floor(nowSerial()), { volatile: true });
  def('NOW|JETZT', 0, 0, () => nowSerial(), { volatile: true });
  def('DATE|DATUM', 3, 3, (a, cx) => { let y = Math.floor(N(a[0], cx)); if (y < 1900) y += 1900; const v = (Date.UTC(y, Math.floor(N(a[1], cx)) - 1, Math.floor(N(a[2], cx))) - DAY0) / 86400000; if (v < 0) fail(ERR.num); return v; });
  def('TIME|ZEIT', 3, 3, (a, cx) => { const v = (N(a[0], cx) * 3600 + N(a[1], cx) * 60 + N(a[2], cx)) / 86400; if (v < 0) fail(ERR.num); return v - Math.floor(v); });
  def('YEAR|JAHR', 1, 1, (a, cx) => dparts(D(a[0], cx)).y);
  def('MONTH|MONAT', 1, 1, (a, cx) => dparts(D(a[0], cx)).m);
  def('DAY|TAG', 1, 1, (a, cx) => dparts(D(a[0], cx)).d);
  def('HOUR|STUNDE', 1, 1, (a, cx) => { const t = Math.round((D(a[0], cx) % 1) * 86400); return Math.floor(t / 3600) % 24; });
  def('MINUTE', 1, 1, (a, cx) => { const t = Math.round((D(a[0], cx) % 1) * 86400); return Math.floor(t / 60) % 60; });
  def('SECOND|SEKUNDE', 1, 1, (a, cx) => Math.round((D(a[0], cx) % 1) * 86400) % 60);
  def('WEEKDAY|WOCHENTAG', 1, 2, (a, cx) => { const wd = dparts(D(a[0], cx)).wd, t = a[1] !== undefined && a[1] !== MISSING ? N(a[1], cx) : 1; if (t === 1 || t === 17) return wd + 1; if (t === 2 || t === 11) return wd === 0 ? 7 : wd; if (t === 3) return wd === 0 ? 6 : wd - 1; fail(ERR.num); });
  const isoWeek = (n) => { const d = fromSerial(n); const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())); const day = t.getUTCDay() || 7; t.setUTCDate(t.getUTCDate() + 4 - day); const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1)); return Math.ceil(((t - y0) / 86400000 + 1) / 7); };
  def('ISOWEEKNUM|ISOKALENDERWOCHE', 1, 1, (a, cx) => isoWeek(D(a[0], cx)));
  def('WEEKNUM|KALENDERWOCHE', 1, 2, (a, cx) => { const n = D(a[0], cx), t = a[1] !== undefined && a[1] !== MISSING ? N(a[1], cx) : 1; if (t === 21) return isoWeek(n); const p = dparts(n); const jan1 = toSerial(p.y, 1, 1); const wd1 = dparts(jan1).wd; const start = t === 2 ? (wd1 + 6) % 7 : wd1; return Math.floor((n - jan1 + start) / 7) + 1; });
  def('DAYS|TAGE', 2, 2, (a, cx) => Math.floor(N(a[0], cx)) - Math.floor(N(a[1], cx)));
  def('DATEDIF', 3, 3, (a, cx) => {
    const s = Math.floor(D(a[0], cx)), e = Math.floor(D(a[1], cx)), u = T(a[2], cx).toUpperCase();
    if (e < s) fail(ERR.num);
    const A = dparts(s), B = dparts(e);
    let months = (B.y - A.y) * 12 + (B.m - A.m); if (B.d < A.d) months--;
    switch (u) {
      case 'Y': return Math.floor(months / 12);
      case 'M': return months;
      case 'D': return e - s;
      case 'YM': return months % 12;
      case 'MD': { let d = B.d - A.d; if (d < 0) { const pm = new Date(Date.UTC(B.y, B.m - 1, 0)).getUTCDate(); d += pm; } return d; }
      case 'YD': { let y = B.y; let st = toSerial(y, A.m, A.d); if (st > e) st = toSerial(y - 1, A.m, A.d); return e - st; }
    }
    fail(ERR.num);
  });
  const addMonths = (n, k) => { const p = dparts(n); const last = new Date(Date.UTC(p.y, p.m - 1 + k + 1, 0)).getUTCDate(); return (Date.UTC(p.y, p.m - 1 + k, Math.min(p.d, last)) - DAY0) / 86400000; };
  def('EDATE|EDATUM', 2, 2, (a, cx) => addMonths(Math.floor(D(a[0], cx)), Math.trunc(N(a[1], cx))));
  def('EOMONTH|MONATSENDE', 2, 2, (a, cx) => { const p = dparts(Math.floor(D(a[0], cx))); return (Date.UTC(p.y, p.m - 1 + Math.trunc(N(a[1], cx)) + 1, 0) - DAY0) / 86400000; });
  const holidaySet = (v) => new Set(v === undefined || v === MISSING ? [] : [...each(v)].filter(x => typeof x === 'number').map(Math.floor));
  const isWork = (n, hs) => { const wd = dparts(n).wd; return wd !== 0 && wd !== 6 && !hs.has(n); };
  def('NETWORKDAYS|NETTOARBEITSTAGE', 2, 3, (a, cx) => { let s = Math.floor(N(a[0], cx)), e = Math.floor(N(a[1], cx)); const hs = holidaySet(a[2]); let sign = 1; if (e < s) { [s, e] = [e, s]; sign = -1; } let n = 0; for (let d = s; d <= e; d++) if (isWork(d, hs)) n++; return sign * n; });
  def('WORKDAY|ARBEITSTAG', 2, 3, (a, cx) => { let d = Math.floor(N(a[0], cx)); let k = Math.trunc(N(a[1], cx)); const hs = holidaySet(a[2]); const st = k < 0 ? -1 : 1; while (k !== 0) { d += st; if (isWork(d, hs)) k -= st; } return d; });
  def('DATEVALUE|DATWERT', 1, 1, (a, cx) => { const c = parseInput(T(a[0], cx)); if (typeof c.v !== 'number' || !/date|dt/.test(c.nf || '')) fail(ERR.value); return Math.floor(c.v); });
  def('TIMEVALUE|ZEITWERT', 1, 1, (a, cx) => { const c = parseInput(T(a[0], cx)); if (typeof c.v !== 'number' || !/time|dt/.test(c.nf || '')) fail(ERR.value); return c.v % 1; });

  // ---- Finanzen
  const pmt = (r, n, pv, fv, t) => r === 0 ? -(pv + fv) / n : -(r * (pv * Math.pow(1 + r, n) + fv)) / ((1 + r * t) * (Math.pow(1 + r, n) - 1));
  const finArgs = (a, cx, from) => a.slice(from).map(x => x === undefined || x === MISSING ? 0 : N(x, cx));
  def('PMT|RMZ', 3, 5, (a, cx) => { const [fv, t] = finArgs([a[3], a[4]], cx, 0); return pmt(N(a[0], cx), N(a[1], cx), N(a[2], cx), fv, t ? 1 : 0); });
  def('FV|ZW', 3, 5, (a, cx) => { const r = N(a[0], cx), n = N(a[1], cx), p = N(a[2], cx); const [pv, t] = finArgs([a[3], a[4]], cx, 0); if (r === 0) return -(pv + p * n); const f = Math.pow(1 + r, n); return -(pv * f + p * (1 + r * (t ? 1 : 0)) * (f - 1) / r); });
  def('PV|BW', 3, 5, (a, cx) => { const r = N(a[0], cx), n = N(a[1], cx), p = N(a[2], cx); const [fv, t] = finArgs([a[3], a[4]], cx, 0); if (r === 0) return -(fv + p * n); const f = Math.pow(1 + r, n); return -(fv + p * (1 + r * (t ? 1 : 0)) * (f - 1) / r) / f; });
  def('NPER|ZZR', 3, 5, (a, cx) => { const r = N(a[0], cx), p = N(a[1], cx), pv = N(a[2], cx); const [fv, t] = finArgs([a[3], a[4]], cx, 0); if (r === 0) { if (p === 0) fail(ERR.num); return -(pv + fv) / p; } const z = p * (1 + r * (t ? 1 : 0)) / r; const v = (z - fv) / (z + pv); if (v <= 0) fail(ERR.num); return Math.log(v) / Math.log(1 + r); });
  def('NPV|NBW', 2, 255, (a, cx) => { const r = N(a[0], cx); return nums(a.slice(1), cx).reduce((s, x, i) => s + x / Math.pow(1 + r, i + 1), 0); });
  const solve = (f, x0) => { let x = x0; for (let k = 0; k < 100; k++) { const y = f(x), h = 1e-7 * Math.max(1, Math.abs(x)), d = (f(x + h) - y) / h; if (!isFinite(d) || d === 0) break; const nx = x - y / d; if (Math.abs(nx - x) < 1e-12) return nx; x = nx; } if (Math.abs(f(x)) < 1e-7) return x; fail(ERR.num); };
  def('IRR|IKV', 1, 2, (a, cx) => { const v = nums([a[0]], cx); const g = a[1] !== undefined && a[1] !== MISSING ? N(a[1], cx) : 0.1; return solve(r => v.reduce((s, x, i) => s + x / Math.pow(1 + r, i), 0), g); });
  def('RATE|ZINS', 3, 6, (a, cx) => { const n = N(a[0], cx), p = N(a[1], cx), pv = N(a[2], cx); const [fv, t] = finArgs([a[3], a[4]], cx, 0); const g = a[5] !== undefined && a[5] !== MISSING ? N(a[5], cx) : 0.1; return solve(r => r === 0 ? pv + p * n + fv : pv * Math.pow(1 + r, n) + p * (1 + r * (t ? 1 : 0)) * (Math.pow(1 + r, n) - 1) / r + fv, g); });

  /* ================================================================ Zahlenformat-Codes (TEXT) */
  function formatCode(v, code) {
    if (typeof v !== 'number') { if (typeof v === 'string') return v; return text(v); }
    const sections = code.split(';');
    let c = sections[0];
    if (v < 0 && sections[1] !== undefined) { c = sections[1]; v = -v; }
    else if (v === 0 && sections[2] !== undefined) c = sections[2];
    const lit = [];
    c = c.replace(/"([^"]*)"|\\(.)/g, (m, a, b) => { lit.push(a ?? b); return '\u0000' + (lit.length - 1) + '\u0000'; });
    const unlit = (s) => s.replace(/\u0000(\d+)\u0000/g, (m, i) => lit[+i]);
    // Datum/Zeit
    if (/[TtJjDdYyhHsS]|MM|M/.test(c.replace(/\u0000\d+\u0000/g, '')) && !/[0#]/.test(c.replace(/\u0000\d+\u0000/g, ''))) {
      const p = dparts(v), tsec = Math.round((v % 1) * 86400);
      const H = Math.floor(tsec / 3600) % 24, Mi = Math.floor(tsec / 60) % 60, Se = tsec % 60;
      const hasTime = /h|H/.test(c);
      const out = c.replace(/(JJJJ|YYYY|jjjj|yyyy|JJ|YY|jj|yy|TTTT|DDDD|tttt|dddd|TTT|DDD|ttt|ddd|TT|DD|tt|dd|T|D|t|d|MMMM|MMM|MM|M|mmmm|mmm|mm|m|hh|HH|h|H|ss|s)/g, (m) => {
        switch (m.toLowerCase()) {
          case 'jjjj': case 'yyyy': return String(p.y);
          case 'jj': case 'yy': return pad2(p.y % 100);
          case 'tttt': case 'dddd': return DAYS[p.wd];
          case 'ttt': case 'ddd': return DAYS[p.wd].slice(0, 2);
          case 'tt': case 'dd': return pad2(p.d);
          case 't': case 'd': return String(p.d);
          case 'mmmm': return MONTHS[p.m - 1];
          case 'mmm': return MONTHS[p.m - 1].slice(0, 3);
          case 'mm': return hasTime && m === 'mm' ? pad2(Mi) : pad2(p.m);
          case 'm': return hasTime && m === 'm' ? String(Mi) : String(p.m);
          case 'hh': return pad2(H);
          case 'h': return String(H);
          case 'ss': return pad2(Se);
          case 's': return String(Se);
        }
        return m;
      });
      return unlit(out);
    }
    // Zahl
    let pct = (c.match(/%/g) || []).length;
    let x = v * Math.pow(100, pct);
    const em = /([0#.,’']+)(E[+-])(0+)/i.exec(c);
    if (em) {
      const [, fp = ''] = em[1].split('.');
      const d = (fp.match(/0/g) || []).length;
      const s = sci(x, d);
      return unlit(c.replace(em[0], s.replace(/E([+-])(\d+)/, (m2, sg, ex) => 'E' + (em[2][1] === '+' || sg === '-' ? sg : '') + ex.padStart(em[3].length, '0')))).replace(/%/g, '%');
    }
    const nm = /[0#?][0#?,’'.]*|\.[0#?]+/.exec(c);
    if (!nm) return unlit(c);
    const pat = nm[0];
    const [ip, fp = ''] = pat.split('.');
    const dmin = (fp.match(/0/g) || []).length, dmax = (fp.match(/[0#?]/g) || []).length;
    const group = /[,’']/.test(ip);
    let s = round(Math.abs(x), dmax).toFixed(dmax);
    let [si, sf = ''] = s.split('.');
    while (sf.length > dmin && sf.endsWith('0')) sf = sf.slice(0, -1);
    const imin = (ip.match(/0/g) || []).length;
    if (si === '0' && imin === 0) si = '';
    si = si.padStart(imin, '0');
    if (group) si = groupInt(si);
    let body = si + (sf || dmin ? '.' + sf : (fp.length && pat.includes('.') && dmax ? '' : ''));
    if (pat.endsWith('.') && !sf) body = si + '.';
    const neg = x < 0 && sections.length < 2 && round(Math.abs(x), dmax) !== 0;
    return unlit(c.slice(0, nm.index) + (neg ? '-' : '') + body + c.slice(nm.index + pat.length));
  }

  /* ================================================================ Arbeitsmappe */
  /* sheets: [{ id, name, d }] (d = Daten der Tabelle: cells, nrows, ncols …) */
  /* geparste Formeln merken (gleicher Text = gleicher Baum; der Baum wird beim Rechnen nicht verändert) */
  const AST_CACHE = new Map();
  /* flüchtige Formel (wie Excel: wird bei jeder Änderung neu gerechnet)? */
  const VOL_AST = new WeakMap();
  function isVolatile(n) {
    if (!n || typeof n !== 'object') return false;
    let v = VOL_AST.get(n);
    if (v !== undefined) return v;
    v = false;
    if (n.k === 'fn') { const en = fnName(n.name); v = !!(en && F[en].volatile) || n.args.some(isVolatile); }
    else v = isVolatile(n.a) || isVolatile(n.b);
    VOL_AST.set(n, v);
    return v;
  }
  /* Arbeitsmappe: alle Tabellen (im Programm: aller Seiten). sheets: [{ id, name, d, page? }];
   * opts.resolve(vonSeite, pfad, tabelle) → Seiten-ID für [Seite]Tabelle!A1 (ohne: keine Seitenbezüge) */
  class Book {
    constructor(sheets, opts = {}) {
      this.opts = opts;
      this.memo = new Map();   // „id:c:r“ → Wert
      this.busy = new Set();
      this.prec = new Map();   // Formelzelle → [[Tabelle, c1, r1, c2, r2], …] (gelesene Bereiche)
      this.rdep = new Map();   // Tabelle → Set der Formelzellen, die darin lesen
      this.vol = new Set();    // flüchtige Formelzellen
      this.stack = [];
      this.setSheets(sheets);
    }
    setSheets(sheets) {
      this.sheets = sheets;
      this.byId = new Map(sheets.map(s => [s.id, s]));
      this.byName = new Map(sheets.map(s => [String(s.name).toLowerCase(), s]));
      this.byPage = new Map();
      for (const s of sheets) {
        const k = s.page == null ? '' : s.page;
        if (!this.byPage.has(k)) this.byPage.set(k, new Map());
        const m = this.byPage.get(k), n = String(s.name).toLowerCase();
        if (!m.has(n)) m.set(n, s);
      }
    }
    /* Tabelle nach Name: ohne Seite auf der Seite der Formel, mit Seite über opts.resolve */
    sheet(name, from, page) {
      const n = String(name).toLowerCase();
      if (page == null || page === '') {
        if (from && from.page != null) { const m = this.byPage.get(from.page); return (m && m.get(n)) || null; }
        return this.byName.get(n) || null;
      }
      const pid = this.opts.resolve ? this.opts.resolve(from ? from.page : null, page, n) : null;
      if (pid == null) return null;
      const m = this.byPage.get(pid);
      return (m && m.get(n)) || null;
    }
    /* alles vergessen (Aufbau geändert) */
    reset() { this.memo.clear(); this.prec.clear(); this.rdep.clear(); this.vol.clear(); }
    /* beim Rechnen: die gerade berechnete Formel liest diesen Bereich */
    track(sh, c1, r1, c2, r2) {
      const fk = this.stack[this.stack.length - 1];
      if (!fk) return;
      let p = this.prec.get(fk);
      if (!p) this.prec.set(fk, p = []);
      p.push([sh.id, c1, r1, c2, r2]);
      let s = this.rdep.get(sh.id);
      if (!s) this.rdep.set(sh.id, s = new Set());
      s.add(fk);
    }
    dropPrec(fk) {
      const p = this.prec.get(fk);
      if (p) { for (const x of p) { const s = this.rdep.get(x[0]); if (s) s.delete(fk); } this.prec.delete(fk); }
      this.vol.delete(fk);
    }
    /* Änderungen melden. list: [{ id, cells?: [[c, r], …], rng?: { c1, r1, c2, r2 } }] – ohne cells/rng = ganze
     * Tabelle. deep = false (manuelle Berechnung): nur die geänderten Zellen selbst. Ergebnis: Map Tabellen-ID →
     * true (ganz) bzw. Liste der Rechtecke [c1, r1, c2, r2], deren Werte sich ändern können (für Neuzeichnen). */
    changed(list, deep = true) {
      const out = new Map(), queue = [];
      const note = (sid, c1, r1, c2, r2) => { let o = out.get(sid); if (o === true) return; if (!o) out.set(sid, o = []); o.push([c1, r1, c2, r2]); };
      const forget = (sid, c1, r1, c2, r2) => {   // gemerkte Werte im Rechteck vergessen (Formeln darin lesen neu)
        const pre = sid + ':';
        if ((c2 - c1 + 1) * (r2 - r1 + 1) <= 4096) {
          for (let c = c1; c <= c2; c++) for (let r = r1; r <= r2; r++) { const k = pre + c + ':' + r; this.memo.delete(k); if (this.prec.has(k)) this.dropPrec(k); }
          return;
        }
        for (const k of [...this.memo.keys(), ...this.prec.keys()]) {
          if (!k.startsWith(pre)) continue;
          const j = k.lastIndexOf(':'), c = +k.slice(pre.length, j), r = +k.slice(j + 1);
          if (c >= c1 && c <= c2 && r >= r1 && r <= r2) { this.memo.delete(k); this.dropPrec(k); }
        }
      };
      const dirty = (fk) => {   // Formelzelle neu rechnen lassen (nur wenn sie gerechnet war – sonst hängt nichts daran)
        if (!this.memo.has(fk) && !this.prec.has(fk)) return;
        this.memo.delete(fk);
        this.dropPrec(fk);
        const j = fk.lastIndexOf(':'), i = fk.lastIndexOf(':', j - 1);
        const sid = fk.slice(0, i), c = +fk.slice(i + 1, j), r = +fk.slice(j + 1);
        note(sid, c, r, c, r);
        queue.push([sid, c, r, c, r]);
      };
      for (const it of list) {
        const id = it.id;
        if (it.cells) for (const [c, r] of it.cells) { forget(id, c, r, c, r); note(id, c, r, c, r); queue.push([id, c, r, c, r]); }
        else if (it.rng) { const g = it.rng; forget(id, g.c1, g.r1, g.c2, g.r2); note(id, g.c1, g.r1, g.c2, g.r2); queue.push([id, g.c1, g.r1, g.c2, g.r2]); }
        else { out.set(id, true); forget(id, 0, 0, Infinity, Infinity); queue.push([id, 0, 0, Infinity, Infinity]); }
      }
      if (!deep) return out;
      for (const fk of [...this.vol]) dirty(fk);
      while (queue.length) {
        const [sid, c1, r1, c2, r2] = queue.pop();
        const deps = this.rdep.get(sid);
        if (!deps || !deps.size) continue;
        for (const fk of [...deps]) {
          const p = this.prec.get(fk);
          if (p && p.some(x => x[0] === sid && x[1] <= c2 && x[3] >= c1 && x[2] <= r2 && x[4] >= r1)) dirty(fk);
        }
      }
      return out;
    }
    /* flüchtige Formeln vergessen (z.B. beim Seitenwechsel: HEUTE() soll nicht von gestern sein) */
    volatile() { const n = this.vol.size; if (n) this.changed([...this.vol].map(fk => { const j = fk.lastIndexOf(':'), i = fk.lastIndexOf(':', j - 1); return { id: fk.slice(0, i), cells: [[+fk.slice(i + 1, j), +fk.slice(j + 1)]] }; })); return n; }
    cell(sh, c, r) { return sh.d.cells[key(c, r)] || null; }
    val(sh, c, r) {
      const k = sh.id + ':' + c + ':' + r;
      if (this.memo.has(k)) return this.memo.get(k);
      const cell = sh.d.cells[key(c, r)];
      let v = null;
      if (cell && cell.v !== '' && cell.v != null) {
        const raw = String(cell.v);
        const asText = cell.f && cell.f.nf === 'text';
        if (isFormula(raw) && !asText) {
          if (this.busy.has(k)) return ERR.circ;
          this.busy.add(k);
          this.stack.push(k);
          try { v = this.formula(sh, c, r, raw, k); } finally { this.busy.delete(k); this.stack.pop(); }
        } else v = asText ? raw : parseInput(raw).v;
      }
      this.memo.set(k, v);
      return v;
    }
    /* nur die Werte dieser Tabellen vergessen (und was davon abhängt) */
    invalidate(ids) {
      if (!ids) { this.reset(); return; }
      this.changed([...ids].map(id => ({ id })));
    }
    formula(sh, c, r, raw, k) {
      let ast = AST_CACHE.get(raw);
      if (ast === undefined) {
        try { ast = parse(raw.slice(1)); } catch (e) { if (e instanceof SyntaxErr) ast = null; else throw e; }
        if (AST_CACHE.size > 5000) AST_CACHE.clear();
        AST_CACHE.set(raw, ast);
      }
      if (ast === null) return ERR.name;
      if (k && isVolatile(ast)) this.vol.add(k);
      const cx = { book: this, sh, c, r };
      let v;
      try { v = ev(ast, cx); } catch (e) { if (e instanceof Throw) v = e.err; else throw e; }
      if (v instanceof Rng) v = scalar(v, cx);
      if (v instanceof Arr) v = v.at(0, 0);
      if (v === MISSING || v === null) v = 0;
      if (typeof v === 'number' && !isFinite(v)) v = ERR.num;
      return v;
    }
    /* beliebige Formel im Zusammenhang einer Tabelle auswerten (z.B. für Diagramme oder die Statusleiste) */
    evalIn(sh, src, c = 0, r = 0) {
      const cx = { book: this, sh, c, r };
      try { return ev(parse(src), cx); } catch (e) { if (e instanceof Throw) return e.err; if (e instanceof SyntaxErr) return ERR.name; throw e; }
    }
    range(sh, c1, r1, c2, r2) { return new Rng(this, sh, c1, r1, c2, r2); }
  }

  /* ================================================================ Bezüge umschreiben */
  const needsQuote = (n) => !/^[A-Za-zÄÖÜäöüß_][A-Za-z0-9ÄÖÜäöüß_.]*$/.test(n) || /^[A-Za-z]{1,3}\d+$/.test(n) || /^(wahr|falsch|true|false)$/i.test(n);
  /* Seite: [Seite]Tabelle! – in Hochkommas, wenn Seite oder Tabelle Leerzeichen/Sonderzeichen haben (wie Excel) */
  const sheetPrefix = (n, page) => {
    if (n == null) return '';
    if (page != null && page !== '') {
      const inner = '[' + page + ']' + n;
      return (needsQuote(n) || !/^[A-Za-z0-9ÄÖÜäöüß_./-]+$/.test(page) ? "'" + inner.replace(/'/g, "''") + "'" : inner) + '!';
    }
    return (needsQuote(n) ? "'" + n.replace(/'/g, "''") + "'" : n) + '!';
  };
  function refText(t) {
    const pre = sheetPrefix(t.sheet, t.page);
    const cs = (p) => (p.ac ? '$' : '') + colName(p.c), rs = (p) => (p.ar ? '$' : '') + (p.r + 1);
    if (t.kind === 'col') return pre + cs(t.a) + ':' + cs(t.b);
    if (t.kind === 'row') return pre + rs(t.a) + ':' + rs(t.b);
    if (t.kind === 'rng') return pre + cs(t.a) + rs(t.a) + ':' + cs(t.b) + rs(t.b);
    return pre + cs(t.a) + rs(t.a);
  }
  /* alle Bezug-Token einer Formel durch fn(token) ersetzen (Rückgabe: neuer Text oder null = #BEZUG!) */
  function rewrite(raw, fn) {
    if (!isFormula(raw)) return raw;
    const src = raw.slice(1);
    let toks;
    try { toks = tokenize(src); } catch (e) { return raw; }
    let out = '', pos = 0;
    for (const t of toks) {
      if (t.t !== 'ref' && t.t !== 'fn' && t.t !== 'bool') continue;
      let rep;
      if (t.t === 'fn' || t.t === 'bool') rep = src.slice(t.p, t.e).toUpperCase();
      else { const nt = fn({ ...t, a: { ...t.a }, b: t.b ? { ...t.b } : undefined }); rep = nt === null ? '#BEZUG!' : nt === undefined ? src.slice(t.p, t.e) : refText(nt); }
      out += src.slice(pos, t.p) + rep;
      pos = t.e;
    }
    return '=' + out + src.slice(pos);
  }
  /* Formel kopieren: relative Bezüge um dc/dr verschieben */
  function shiftFormula(raw, dc, dr) {
    if (!dc && !dr) return raw;
    return rewrite(raw, (t) => {
      const mv = (p, isEnd) => {
        if (!p.ac && p.c !== Infinity && t.kind !== 'row') p.c += dc;
        if (!p.ar && p.r !== Infinity && t.kind !== 'col') p.r += dr;
        return p.c >= 0 && p.r >= 0;
      };
      if (!mv(t.a) || (t.b && !mv(t.b, true))) return null;
      return t;
    });
  }
  /* Zeilen/Spalten einfügen (n > 0) oder löschen (n < 0) in Tabelle „target“; own = Tabelle der Formel */
  function adjustRefs(raw, target, own, axis, at, n) {
    // target: Name (Bezüge ohne Seite) oder Prüf-Funktion (t) → true, wenn der Bezug auf die Tabelle zeigt (1.26)
    const tl = typeof target === 'function' ? null : String(target).toLowerCase();
    return rewrite(raw, (t) => {
      if (tl === null) { if (!target(t)) return undefined; }
      else { if (t.page) return undefined; const sh = t.sheet == null ? own : t.sheet; if (String(sh).toLowerCase() !== tl) return undefined; }
      const k = axis === 'r' ? 'r' : 'c';
      if ((axis === 'r' && t.kind === 'col') || (axis === 'c' && t.kind === 'row')) return undefined;
      const one = (p) => p[k];
      if (n > 0) {
        const a = t.a, b = t.b;
        if (!b) { if (a[k] >= at) a[k] += n; return t; }
        if (a[k] >= at) a[k] += n;
        if (b[k] !== Infinity && b[k] >= at) b[k] += n;
        return t;
      }
      const d = -n, end = at + d;
      if (!t.b) { const v = one(t.a); if (v >= at && v < end) return null; if (v >= end) t.a[k] -= d; return t; }
      let lo = t.a[k], hi = t.b[k];
      const swap = lo > hi;
      if (swap) [lo, hi] = [hi, lo];
      const nlo = lo < at ? lo : lo >= end ? lo - d : at;
      const nhi = hi === Infinity ? hi : hi < at ? hi : hi >= end ? hi - d : at - 1;
      if (nhi < nlo) return null;
      if (swap) { t.a[k] = nhi; t.b[k] = nlo; } else { t.a[k] = nlo; t.b[k] = nhi; }
      return t;
    });
  }
  function renameSheetRefs(raw, oldName, newName) {
    const ol = String(oldName).toLowerCase();
    return rewrite(raw, (t) => { if (!t.page && t.sheet != null && t.sheet.toLowerCase() === ol) { t.sheet = newName; return t; } return undefined; });
  }
  /* Funktionsnamen und Bezüge gross schreiben (wie Excel beim Bestätigen) */
  const normalize = (raw) => rewrite(raw, (t) => t);
  /* Bezüge in einer Formel (für die farbige Markierung beim Bearbeiten); Positionen im Rohtext inkl. '=' */
  function refsIn(raw) {
    if (!isFormula(raw)) return [];
    let toks;
    try { toks = tokenize(raw.slice(1)); } catch (e) {
      // bis zur Fehlerstelle lesen
      toks = [];
      const s = raw.slice(1);
      for (let cut = s.length; cut > 0; cut--) { try { toks = tokenize(s.slice(0, cut)); break; } catch (e2) { /* weiter kürzen */ } }
    }
    return toks.filter(t => t.t === 'ref').map(t => ({
      page: t.page || null, sheet: t.sheet, kind: t.kind,
      c1: t.kind === 'row' ? 0 : Math.min(t.a.c, t.b ? t.b.c : t.a.c), r1: t.kind === 'col' ? 0 : Math.min(t.a.r, t.b ? t.b.r : t.a.r),
      c2: t.kind === 'row' ? Infinity : Math.max(t.a.c, t.b ? t.b.c : t.a.c), r2: t.kind === 'col' ? Infinity : Math.max(t.a.r, t.b ? t.b.r : t.a.r),
      p: t.p + 1, e: t.e + 1,
    }));
  }
  /* F4: $-Zeichen am Bezug unter dem Cursor umschalten */
  function toggleAbs(raw, caret) {
    const refs = refsIn(raw);
    const r = refs.find(x => caret >= x.p && caret <= x.e);
    if (!r) return null;
    const src = raw.slice(r.p, r.e);
    const toks = tokenize(src);
    const t = toks[0];
    const cyc = (p) => { const s = (p.ac ? 1 : 0) * 2 + (p.ar ? 1 : 0); const n = { 0: 3, 3: 1, 1: 2, 2: 0 }[s]; p.ac = !!(n & 2); p.ar = !!(n & 1); };
    cyc(t.a); if (t.b) { t.b.ac = t.a.ac; t.b.ar = t.a.ar; }
    const rep = refText(t);
    return { raw: raw.slice(0, r.p) + rep + raw.slice(r.e), caret: r.p + rep.length };
  }
  /* kann an dieser Stelle der Formel ein Bezug eingefügt werden (Zeigen-Modus)? */
  function wantsRef(raw, caret) {
    if (!isFormula(raw)) return false;
    const before = raw.slice(0, caret).replace(/\s+$/, '');
    return /[=(;,+\-*/^&<>:]$/.test(before);
  }

  /* ================================================================ Ausfüllen (Reihen) */
  const WD_DE = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'];
  const WD_DE2 = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
  const WD_EN = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const WD_EN3 = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const MO_DE3 = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
  const MO_EN3 = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const LISTS = [WD_DE, WD_DE2, WD_EN, WD_EN3, MONTHS, MO_DE3, MONTHS_EN, MO_EN3, ['Q1', 'Q2', 'Q3', 'Q4']];
  const listOf = (s) => {
    for (const l of LISTS) { const i = l.findIndex(x => x.toLowerCase() === String(s).trim().toLowerCase()); if (i >= 0) return { l, i, up: s === s.toUpperCase() && s !== s.toLowerCase() }; }
    return null;
  };
  /* raws: Quellwerte (Rohtexte), n: Anzahl neuer Werte, back: rückwärts (nach oben/links); Formeln behandelt der Aufrufer */
  function series(raws, n, back) {
    const k = raws.length;
    const P = raws.map(r => parseInput(r));
    const out = [];
    const step = (i) => back ? -(i + 1) : i + 1;
    // Zahlen / Datum: lineare Reihe (eine Zahl wird kopiert, ein Datum zählt hoch)
    if (P.every(p => typeof p.v === 'number')) {
      const isDate = P.every(p => p.nf === 'date');
      if (k === 1 && !isDate) { for (let i = 0; i < n; i++) out.push(raws[0]); return out; }
      const vals = P.map(p => p.v);
      let d;
      if (k === 1) d = 1;
      else {
        const mx = (k - 1) / 2, my = sum(vals) / k;
        let sxy = 0, sxx = 0; vals.forEach((v, i) => { sxy += (i - mx) * (v - my); sxx += (i - mx) ** 2; });
        d = sxy / sxx;
        // Monatsreihe bei Datum (gleicher Tag, ganze Monate)
        if (isDate && k >= 2) {
          const ps = vals.map(dparts);
          const months = (ps[1].y - ps[0].y) * 12 + ps[1].m - ps[0].m;
          if (months && ps.every(p => p.d === ps[0].d) && ps.every((p, i) => !i || (p.y - ps[i - 1].y) * 12 + p.m - ps[i - 1].m === months)) {
            const base = back ? vals[0] : vals[k - 1];
            for (let i = 0; i < n; i++) out.push(dateText(addMonths(base, months * step(i))));
            return out;
          }
        }
      }
      const base = back ? vals[0] : vals[k - 1];
      for (let i = 0; i < n; i++) {
        const v = +(base + d * step(i)).toPrecision(15);
        out.push(isDate ? dateText(v) : P[0].nf === 'pct' ? numText(round(v * 100, 10)) + '%' : numText(v));
      }
      return out;
    }
    // Listen (Wochentage, Monate)
    const L = P.map(p => typeof p.v === 'string' ? listOf(p.v) : null);
    if (L.every(x => x && x.l === L[0].l)) {
      const len = L[0].l.length;
      const d = k > 1 ? ((L[1].i - L[0].i) % len + len) % len || 1 : 1;
      const base = back ? L[0].i : L[k - 1].i;
      for (let i = 0; i < n; i++) { let s = L[0].l[(((base + d * step(i)) % len) + len) % len]; if (L[0].up) s = s.toUpperCase(); out.push(s); }
      return out;
    }
    // Text mit Zahl am Ende (oder Anfang): „Woche 1“ -> „Woche 2“
    const TN = raws.map(r => /^(.*?)(\d+)(\D*)$/.exec(String(r)));
    if (TN.every(m => m && m[1] === TN[0][1] && m[3] === TN[0][3]) && !P.some(p => typeof p.v === 'number')) {
      const nums2 = TN.map(m => +m[2]);
      const d = k > 1 ? nums2[k - 1] - nums2[k - 2] || 1 : 1;
      const width = TN[0][2].length > 1 && TN[0][2][0] === '0' ? TN[0][2].length : 0;
      const base = back ? nums2[0] : nums2[k - 1];
      for (let i = 0; i < n; i++) { const v = Math.max(0, base + d * step(i)); out.push(TN[0][1] + String(v).padStart(width, '0') + TN[0][3]); }
      return out;
    }
    // sonst Muster wiederholen
    for (let i = 0; i < n; i++) out.push(back ? raws[((k - 1 - (i % k)) + k) % k] : raws[i % k]);
    return out;
  }

  /* ================================================================ Funktionsliste (für Autovervollständigen und „Funktion einfügen“) */
  const CATS = ['Mathematik', 'Statistik', 'Logik', 'Text', 'Nachschlagen', 'Datum & Zeit', 'Information', 'Finanzen'];
  const INFO_SRC = `
SUMME|Zahl1; [Zahl2]; …|Addiert alle Zahlen.|0
MITTELWERT|Zahl1; [Zahl2]; …|Arithmetisches Mittel (Durchschnitt).|1
ANZAHL|Wert1; [Wert2]; …|Zählt die Zellen mit Zahlen.|1
ANZAHL2|Wert1; [Wert2]; …|Zählt die nicht leeren Zellen.|1
ANZAHLLEEREZELLEN|Bereich|Zählt die leeren Zellen.|1
MIN|Zahl1; [Zahl2]; …|Kleinster Wert.|1
MAX|Zahl1; [Zahl2]; …|Grösster Wert.|1
MEDIAN|Zahl1; [Zahl2]; …|Mittlerer Wert der sortierten Zahlen.|1
MODUS.EINF|Zahl1; [Zahl2]; …|Häufigster Wert.|1
PRODUKT|Zahl1; [Zahl2]; …|Multipliziert alle Zahlen.|0
RUNDEN|Zahl; Stellen|Rundet auf die angegebene Anzahl Stellen.|0
AUFRUNDEN|Zahl; Stellen|Rundet von null weg.|0
ABRUNDEN|Zahl; Stellen|Rundet gegen null.|0
GANZZAHL|Zahl|Rundet auf die nächstkleinere ganze Zahl ab.|0
KÜRZEN|Zahl; [Stellen]|Schneidet die Nachkommastellen ab.|0
VRUNDEN|Zahl; Vielfaches|Rundet auf das nächste Vielfache (z.B. 0.05 für Rappen).|0
OBERGRENZE|Zahl; [Schritt]|Rundet auf das nächste Vielfache auf.|0
UNTERGRENZE|Zahl; [Schritt]|Rundet auf das nächste Vielfache ab.|0
ABS|Zahl|Absolutbetrag.|0
WURZEL|Zahl|Quadratwurzel.|0
POTENZ|Zahl; Potenz|Zahl hoch Potenz (auch mit ^).|0
EXP|Zahl|e hoch Zahl.|0
LN|Zahl|Natürlicher Logarithmus.|0
LOG|Zahl; [Basis]|Logarithmus (Standard: Basis 10).|0
LOG10|Zahl|Zehnerlogarithmus.|0
REST|Zahl; Divisor|Rest einer Division.|0
QUOTIENT|Zähler; Nenner|Ganzzahliger Teil einer Division.|0
PI||Die Zahl π.|0
VORZEICHEN|Zahl|1, 0 oder −1.|0
FAKULTÄT|Zahl|n! = 1·2·…·n.|0
KOMBINATIONEN|n; k|Anzahl Kombinationen (n über k).|0
VARIATIONEN|n; k|Anzahl Variationen (geordnete Auswahl).|0
GGT|Zahl1; [Zahl2]; …|Grösster gemeinsamer Teiler.|0
KGV|Zahl1; [Zahl2]; …|Kleinstes gemeinsames Vielfaches.|0
QUADRATESUMME|Zahl1; [Zahl2]; …|Summe der Quadrate.|0
SUMMENPRODUKT|Matrix1; [Matrix2]; …|Summe der Produkte entsprechender Werte.|0
SUMMEWENN|Bereich; Kriterium; [Summe_Bereich]|Summiert Zellen, die ein Kriterium erfüllen (z.B. ">100").|0
SUMMEWENNS|Summe_Bereich; Kriterien_Bereich1; Kriterium1; …|Summe mit mehreren Kriterien.|0
ZÄHLENWENN|Bereich; Kriterium|Zählt Zellen, die ein Kriterium erfüllen.|1
ZÄHLENWENNS|Kriterien_Bereich1; Kriterium1; …|Zählt mit mehreren Kriterien.|1
MITTELWERTWENN|Bereich; Kriterium; [Mittelwert_Bereich]|Mittelwert der Zellen, die ein Kriterium erfüllen.|1
MAXWENNS|Max_Bereich; Kriterien_Bereich1; Kriterium1; …|Maximum mit Kriterien.|1
MINWENNS|Min_Bereich; Kriterien_Bereich1; Kriterium1; …|Minimum mit Kriterien.|1
SIN|Zahl|Sinus (Bogenmass).|0
COS|Zahl|Kosinus (Bogenmass).|0
TAN|Zahl|Tangens (Bogenmass).|0
ARCSIN|Zahl|Arkussinus (Ergebnis im Bogenmass).|0
ARCCOS|Zahl|Arkuskosinus.|0
ARCTAN|Zahl|Arkustangens.|0
ARCTAN2|x; y|Winkel des Punkts (x, y).|0
GRAD|Winkel|Bogenmass → Grad.|0
BOGENMASS|Winkel|Grad → Bogenmass.|0
ZUFALLSZAHL||Zufallszahl zwischen 0 und 1.|0
ZUFALLSBEREICH|Untere_Zahl; Obere_Zahl|Ganze Zufallszahl im Bereich.|0
STABW.S|Zahl1; [Zahl2]; …|Standardabweichung (Stichprobe).|1
STABW.N|Zahl1; [Zahl2]; …|Standardabweichung (Grundgesamtheit).|1
VAR.S|Zahl1; [Zahl2]; …|Varianz (Stichprobe).|1
VAR.P|Zahl1; [Zahl2]; …|Varianz (Grundgesamtheit).|1
KGRÖSSTE|Bereich; k|k-grösster Wert.|1
KKLEINSTE|Bereich; k|k-kleinster Wert.|1
RANG.GLEICH|Zahl; Bezug; [Reihenfolge]|Rang einer Zahl in einer Liste.|1
QUANTIL.INKL|Bereich; p|Quantil (p zwischen 0 und 1).|1
QUARTILE.INKL|Bereich; Quartil|Quartil (0 bis 4).|1
GEOMITTEL|Zahl1; [Zahl2]; …|Geometrisches Mittel.|1
HARMITTEL|Zahl1; [Zahl2]; …|Harmonisches Mittel.|1
KORREL|Bereich1; Bereich2|Korrelationskoeffizient r.|1
STEIGUNG|Y_Werte; X_Werte|Steigung der Regressionsgeraden.|1
ACHSENABSCHNITT|Y_Werte; X_Werte|y-Achsenabschnitt der Regressionsgeraden.|1
BESTIMMTHEITSMASS|Y_Werte; X_Werte|Bestimmtheitsmass R².|1
PROGNOSE.LINEAR|x; Y_Werte; X_Werte|Wert auf der Regressionsgeraden.|1
NORM.VERT|x; Mittelwert; Standabwn; Kumuliert|Normalverteilung.|1
NORM.S.VERT|z; Kumuliert|Standardnormalverteilung.|1
NORM.INV|Wahrsch; Mittelwert; Standabwn|Quantil der Normalverteilung.|1
BINOM.VERT|Zahl_Erfolge; Versuche; Erfolgswahrsch; Kumuliert|Binomialverteilung.|1
POISSON.VERT|x; Mittelwert; Kumuliert|Poisson-Verteilung.|1
WENN|Prüfung; [Dann_Wert]; [Sonst_Wert]|Liefert je nach Prüfung den einen oder anderen Wert.|2
WENNS|Prüfung1; Wert1; [Prüfung2; Wert2]; …|Erste erfüllte Bedingung.|2
WENNFEHLER|Wert; Wert_falls_Fehler|Ersatzwert bei einem Fehler.|2
WENNNV|Wert; Wert_bei_NV|Ersatzwert bei #NV.|2
UND|Wahrheitswert1; [Wahrheitswert2]; …|WAHR, wenn alle WAHR sind.|2
ODER|Wahrheitswert1; [Wahrheitswert2]; …|WAHR, wenn mindestens einer WAHR ist.|2
XODER|Wahrheitswert1; [Wahrheitswert2]; …|Exklusives Oder.|2
NICHT|Wahrheitswert|Kehrt den Wahrheitswert um.|2
ERSTERWERT|Ausdruck; Wert1; Ergebnis1; …; [Standard]|Wählt das Ergebnis zum passenden Wert.|2
WAHL|Index; Wert1; [Wert2]; …|Wählt einen Wert aus der Liste.|4
WAHR||Wahrheitswert WAHR.|2
FALSCH||Wahrheitswert FALSCH.|2
VERKETTEN|Text1; [Text2]; …|Verbindet Texte (auch mit &).|3
TEXTKETTE|Text1; [Text2]; …|Verbindet Texte und Bereiche.|3
TEXTVERKETTEN|Trennzeichen; Leere_ignorieren; Text1; …|Verbindet Texte mit Trennzeichen.|3
LÄNGE|Text|Anzahl Zeichen.|3
LINKS|Text; [Anzahl]|Zeichen am Anfang.|3
RECHTS|Text; [Anzahl]|Zeichen am Ende.|3
TEIL|Text; Erstes_Zeichen; Anzahl|Zeichen aus der Mitte.|3
GROSS|Text|In Grossbuchstaben.|3
KLEIN|Text|In Kleinbuchstaben.|3
GROSS2|Text|Erster Buchstabe jedes Worts gross.|3
GLÄTTEN|Text|Entfernt überzählige Leerzeichen.|3
WIEDERHOLEN|Text; Anzahl|Wiederholt einen Text.|3
TEXT|Wert; Format|Zahl als Text formatieren (z.B. "0.00" oder "TT.MM.JJJJ").|3
WERT|Text|Text in Zahl umwandeln.|3
FINDEN|Suchtext; Text; [Erstes_Zeichen]|Position (Gross/klein beachten).|3
SUCHEN|Suchtext; Text; [Erstes_Zeichen]|Position (ohne Gross/klein, mit * und ?).|3
WECHSELN|Text; Alter_Text; Neuer_Text; [Ntes_Auftreten]|Ersetzt Text.|3
ERSETZEN|Alter_Text; Erstes_Zeichen; Anzahl; Neuer_Text|Ersetzt Zeichen an einer Stelle.|3
IDENTISCH|Text1; Text2|Prüft, ob zwei Texte genau gleich sind.|3
ZEICHEN|Zahl|Zeichen zu einem Code.|3
CODE|Text|Code des ersten Zeichens.|3
FEST|Zahl; [Stellen]; [Keine_Punkte]|Zahl als Text mit fester Stellenzahl.|3
SVERWEIS|Suchkriterium; Matrix; Spaltenindex; [Bereich_Verweis]|Sucht in der ersten Spalte und liefert einen Wert derselben Zeile (FALSCH = genau).|4
WVERWEIS|Suchkriterium; Matrix; Zeilenindex; [Bereich_Verweis]|Sucht in der ersten Zeile.|4
XVERWEIS|Suchkriterium; Suchmatrix; Rückgabematrix; [wenn_nicht_gefunden]; [Vergleichsmodus]; [Suchmodus]|Moderne Suche in beliebiger Richtung.|4
VERGLEICH|Suchkriterium; Suchmatrix; [Vergleichstyp]|Position eines Werts (0 = genau).|4
INDEX|Matrix; Zeile; [Spalte]|Wert an einer Position.|4
VERWEIS|Suchkriterium; Suchvektor; [Ergebnisvektor]|Sucht in einer Zeile oder Spalte.|4
ZEILE|[Bezug]|Zeilennummer.|4
SPALTE|[Bezug]|Spaltennummer.|4
ZEILEN|Matrix|Anzahl Zeilen.|4
SPALTEN|Matrix|Anzahl Spalten.|4
INDIREKT|Bezug_Text|Bezug aus einem Text.|4
BEREICH.VERSCHIEBEN|Bezug; Zeilen; Spalten; [Höhe]; [Breite]|Verschobener Bereich.|4
HEUTE||Heutiges Datum.|5
JETZT||Datum und Uhrzeit jetzt.|5
DATUM|Jahr; Monat; Tag|Datum aus Jahr, Monat, Tag.|5
ZEIT|Stunde; Minute; Sekunde|Uhrzeit.|5
JAHR|Datum|Jahr eines Datums.|5
MONAT|Datum|Monat (1–12).|5
TAG|Datum|Tag des Monats.|5
STUNDE|Zeit|Stunde.|5
MINUTE|Zeit|Minute.|5
SEKUNDE|Zeit|Sekunde.|5
WOCHENTAG|Datum; [Typ]|Wochentag als Zahl (Typ 2: Montag = 1).|5
KALENDERWOCHE|Datum; [Typ]|Kalenderwoche (Typ 21 = ISO).|5
ISOKALENDERWOCHE|Datum|ISO-Kalenderwoche.|5
TAGE|Enddatum; Startdatum|Anzahl Tage dazwischen.|5
DATEDIF|Start; Ende; Einheit|Abstand in "Y", "M", "D", "YM", "MD", "YD".|5
EDATUM|Datum; Monate|Datum ± Monate.|5
MONATSENDE|Datum; Monate|Letzter Tag des Monats.|5
NETTOARBEITSTAGE|Start; Ende; [Feiertage]|Arbeitstage (Mo–Fr) dazwischen.|5
ARBEITSTAG|Start; Tage; [Feiertage]|Datum nach n Arbeitstagen.|5
DATWERT|Text|Datum aus Text.|5
ZEITWERT|Text|Uhrzeit aus Text.|5
ISTZAHL|Wert|WAHR bei einer Zahl.|6
ISTTEXT|Wert|WAHR bei Text.|6
ISTLEER|Wert|WAHR bei einer leeren Zelle.|6
ISTFEHLER|Wert|WAHR bei einem Fehlerwert.|6
ISTNV|Wert|WAHR bei #NV.|6
ISTLOG|Wert|WAHR bei einem Wahrheitswert.|6
ISTGERADE|Zahl|WAHR bei gerader Zahl.|6
ISTUNGERADE|Zahl|WAHR bei ungerader Zahl.|6
NV||Fehlerwert #NV.|6
RMZ|Zins; Zzr; Bw; [Zw]; [F]|Regelmässige Zahlung (Annuität).|7
ZW|Zins; Zzr; Rmz; [Bw]; [F]|Zukünftiger Wert.|7
BW|Zins; Zzr; Rmz; [Zw]; [F]|Barwert.|7
ZZR|Zins; Rmz; Bw; [Zw]; [F]|Anzahl Zahlungsperioden.|7
ZINS|Zzr; Rmz; Bw; [Zw]; [F]; [Schätzwert]|Zinssatz pro Periode.|7
NBW|Zins; Wert1; [Wert2]; …|Nettobarwert.|7
IKV|Werte; [Schätzwert]|Interner Zinsfuss.|7`;
  const FN_INFO = INFO_SRC.trim().split('\n').map(l => { const [de, sig, desc, cat] = l.split('|'); const en = fnName(de); return { de, en, sig, desc, cat: CATS[+cat] }; });
  const fnInfo = (name) => { const en = fnName(name); return en ? FN_INFO.find(f => f.en === en) || { de: name.toUpperCase(), en, sig: '', desc: '', cat: '' } : null; };

  /* ================================================================ Tabellen-Daten */
  function normSheet(d) {
    if (!d || typeof d !== 'object') d = {};
    d.v = 1;
    d.name = typeof d.name === 'string' && d.name.trim() ? d.name.trim() : 'Tabelle1';
    d.cells = d.cells && typeof d.cells === 'object' ? d.cells : {};
    for (const [k, c] of Object.entries(d.cells)) {
      if (!parseKey(k) || !c || typeof c !== 'object') { delete d.cells[k]; continue; }
      c.v = c.v == null ? '' : String(c.v);
      if (c.f && typeof c.f !== 'object') delete c.f;
      if (!c.v && (!c.f || !Object.keys(c.f).length)) delete d.cells[k];
    }
    let mr = 0, mc = 0;
    for (const k of Object.keys(d.cells)) { const p = parseKey(k); mr = Math.max(mr, p.r + 1); mc = Math.max(mc, p.c + 1); }
    d.nrows = Math.max(1, Math.min(10000, Math.round(+d.nrows || 0)), mr);
    d.ncols = Math.max(1, Math.min(200, Math.round(+d.ncols || 0)), mc);
    d.cols = Array.isArray(d.cols) ? d.cols.map(w => Math.max(16, Math.min(1200, Math.round(+w || 96)))) : [];
    while (d.cols.length < d.ncols) d.cols.push(96);
    d.cols.length = d.ncols;
    d.head = !!d.head; d.band = !!d.band; d.grid = d.grid !== false; d.tot = !!d.tot;
    d.color = typeof d.color === 'string' ? d.color : null;
    return d;
  }

  return {
    ERR, XErr, isErr, MISSING, colName, colIndex, key, parseKey, rangeText, parseRange,
    round, general, sci, fixed, numText, dateText, timeText, toSerial, fromSerial, MONTHS, DAYS,
    parseInput, isFormula, format, text, compare, sortCompare, formatCode,
    tokenize, parse, check, SyntaxErr, Book, Rng, Arr,
    shiftFormula, adjustRefs, renameSheetRefs, rewrite, normalize, refsIn, toggleAbs, wantsRef, refText, sheetPrefix, isVolatile,
    series, F, ALIAS, fnName, FN_INFO, fnInfo, CATS, normSheet,
  };
})();

if (typeof module !== 'undefined') module.exports = XL;
