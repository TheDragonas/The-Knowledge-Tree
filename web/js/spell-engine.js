'use strict';
/* Rechtschreibprüfung (seit 1.38): eigener, kleiner Hunspell-Leser – liest die üblichen Wörterbücher (.aff/.dic, wie
 * LibreOffice/OneNote-Ersatz: de_CH_frami, de_DE_frami, en_US, en_GB) und prüft Wörter ohne fremde Bibliothek.
 *
 * Unterstützt: SET (Zeichensatz), FLAG (Zeichen, long, num, UTF-8), AF (Flag-Aliase), PFX/SFX mit Bedingung, Abtrennen
 * und Fortsetzungsklassen (zweistufige Endungen, Vorsilbe + Endung), NEEDAFFIX, ONLYINCOMPOUND, FORBIDDENWORD, KEEPCASE,
 * COMPOUNDFLAG/BEGIN/MIDDLE/END, COMPOUNDPERMITFLAG, COMPOUNDMIN, COMPOUNDWORDMAX, REP, TRY, ICONV, KEY, WORDCHARS.
 * Für Deutsch zusätzlich zusammengesetzte Wörter mit Fugen (s, es, n, en, e, er) als Rückfalllösung – lieber ein
 * richtiges Wort nicht anstreichen als ein richtiges als Fehler zeigen.
 *
 * Alle Flags werden beim Einlesen auf je ein Zeichen aus dem privaten Unicode-Bereich abgebildet; die Flags eines
 * Wortes sind dann ein kurzer String und „hat Flag f“ ist ein includes(). Ohne DOM, in Node testbar. */
const SpellEngine = (() => {
  const yieldNow = () => new Promise(r => setTimeout(r, 0));

  /* aff/dic als Bytes → Text im angegebenen Zeichensatz (SET in der aff-Datei) */
  function decode(buf, set) {
    if (typeof buf === 'string') return buf;
    const enc = /^(ISO8859-1|ISO-8859-1|LATIN1)$/i.test(set || '') ? 'iso-8859-1' : /8859-15/.test(set || '') ? 'iso-8859-15' : 'utf-8';
    return new TextDecoder(enc).decode(buf);
  }
  function setOf(buf) {
    if (typeof buf === 'string') return 'UTF-8';
    const head = new TextDecoder('iso-8859-1').decode(buf.slice ? buf.slice(0, 4096) : buf);
    const m = /^\s*SET\s+(\S+)/m.exec(head);
    return m ? m[1] : 'UTF-8';
  }

  async function build(affBuf, dicBuf, opts = {}) {
    const set = setOf(affBuf);
    const affText = decode(affBuf, set), dicText = decode(dicBuf, set);
    const E = new Engine(opts);
    E.parseAff(affText);
    await E.parseDic(dicText, opts.chunk || 25000);
    return E;
  }

  class Engine {
    constructor(opts) {
      this.lang = opts.lang || '';
      this.german = /^de/i.test(this.lang);
      this.flagType = 'char';
      this.fmap = new Map(); this.fnext = 0xE000;
      this.alias = null;
      this.pfx = new Map(); this.sfx = new Map(); this.maxP = 0; this.maxS = 0;
      this.words = new Map();
      this.rep = []; this.iconv = []; this.tryChars = ''; this.key = 'qwertzuiopü|asdfghjklöä|yxcvbnm';
      this.cmin = 3; this.cmax = 4; this.F = {};
      this.twofold = false;
      this.cache = new Map();
    }
    /* Flag-Kennung → ein Zeichen */
    fl(id) { let c = this.fmap.get(id); if (!c) { c = String.fromCharCode(this.fnext++); this.fmap.set(id, c); } return c; }
    flags(s) {
      if (!s) return '';
      if (this.alias && /^\d+$/.test(s)) return this.alias[+s] || '';
      return this.flagsRaw(s);
    }
    flagsRaw(s) {
      let ids;
      if (this.flagType === 'long') { ids = []; for (let i = 0; i < s.length; i += 2) ids.push(s.slice(i, i + 2)); }
      else if (this.flagType === 'num') ids = s.split(',').filter(Boolean);
      else ids = [...s];
      return ids.map(x => this.fl(x)).join('');
    }
    parseAff(text) {
      const lines = text.split(/\r?\n/);
      const one = {};
      let aliasPending = 0;
      for (let k = 0; k < lines.length; k++) {
        const line = lines[k].replace(/^﻿/, '');
        if (!line || line[0] === '#') continue;
        const p = line.trim().split(/\s+/);
        const cmd = p[0];
        if (cmd === 'FLAG') this.flagType = p[1] === 'long' ? 'long' : p[1] === 'num' ? 'num' : 'char';
        else if (cmd === 'AF') {
          if (!this.alias) { this.alias = ['']; aliasPending = +p[1] || 0; continue; }
          this.alias.push(this.flagsRaw(p[1] || ''));
        } else if (cmd === 'TRY') this.tryChars = p[1] || '';
        else if (cmd === 'KEY') this.key = p[1] || this.key;
        else if (cmd === 'REP' && p.length >= 3) this.rep.push([p[1].replace(/_/g, ' '), p[2].replace(/_/g, ' ')]);
        else if (cmd === 'ICONV' && p.length >= 3) this.iconv.push([p[1], p[2]]);
        else if (cmd === 'COMPOUNDMIN') this.cmin = Math.max(1, +p[1] || 3);
        else if (cmd === 'COMPOUNDWORDMAX') this.cmax = Math.max(2, +p[1] || 4);
        else if (['COMPOUNDFLAG', 'COMPOUNDBEGIN', 'COMPOUNDMIDDLE', 'COMPOUNDEND', 'ONLYINCOMPOUND', 'COMPOUNDPERMITFLAG', 'COMPOUNDFORBIDFLAG', 'NEEDAFFIX', 'FORBIDDENWORD', 'KEEPCASE', 'NOSUGGEST', 'CIRCUMFIX'].includes(cmd) && p[1]) one[cmd] = p[1];
        else if ((cmd === 'PFX' || cmd === 'SFX') && p.length >= 4) {
          // Kopfzeile: PFX A Y 3 – danach 3 Regeln
          if (p.length === 4 && /^\d+$/.test(p[3]) && /^[YN]$/.test(p[2])) { this['_cross_' + cmd + p[1]] = p[2] === 'Y'; continue; }
          const flag = this.fl(this.flagType === 'num' || this.flagType === 'long' ? p[1] : p[1]);
          const strip = p[2] === '0' ? '' : p[2];
          let add = p[3] || '', cont = '';
          const sl = add.indexOf('/');
          if (sl >= 0) { cont = this.flags(add.slice(sl + 1)); add = add.slice(0, sl); }
          if (add === '0') add = '';
          const cond = p[4] || '.';
          const r = { flag, strip, add, cont, cross: !!this['_cross_' + cmd + p[1]], re: this.cond(cond, cmd === 'SFX') };
          const idx = cmd === 'PFX' ? this.pfx : this.sfx;
          if (!idx.has(add)) idx.set(add, []);
          idx.get(add).push(r);
          if (cmd === 'PFX') this.maxP = Math.max(this.maxP, add.length); else this.maxS = Math.max(this.maxS, add.length);
        }
        void aliasPending;
      }
      for (const [k, v] of Object.entries(one)) this.F[k] = this.flags(v);
      // zweistufige Endungen: verweist eine Endung auf eine andere Endungsklasse?
      const sfxFlags = new Set();
      for (const rs of this.sfx.values()) for (const r of rs) sfxFlags.add(r.flag);
      for (const rs of this.sfx.values()) for (const r of rs) if ([...r.cont].some(c => sfxFlags.has(c))) this.twofold = true;
      this.compound = !!(this.F.COMPOUNDFLAG || this.F.COMPOUNDBEGIN);
    }
    cond(c, suffix) {
      if (!c || c === '.') return null;
      const src = c.replace(/[\\(){}*+?|$]/g, '\\$&');
      try { return new RegExp(suffix ? '(?:' + src + ')$' : '^(?:' + src + ')', 'u'); } catch (e) { return null; }
    }
    async parseDic(text, chunk) {
      const lines = text.split(/\r?\n/);
      let start = 1;
      if (!/^\d+\s*$/.test(lines[0] || '')) start = 0;
      for (let k = start; k < lines.length; k++) {
        if (chunk && k % chunk === 0) await yieldNow();
        let line = lines[k];
        if (!line || line[0] === '#' || line[0] === '\t') continue;
        // Wort/Flags, danach evtl. morphologische Angaben (durch Leer- oder Tabulatorzeichen getrennt)
        let w = line, f = '';
        const sp = line.search(/[\t ]/);
        if (sp > 0) w = line.slice(0, sp);
        let sl = -1;
        for (let i = 0; i < w.length; i++) { if (w[i] === '\\' && w[i + 1] === '/') { i++; continue; } if (w[i] === '/') { sl = i; break; } }
        if (sl >= 0) { f = w.slice(sl + 1); w = w.slice(0, sl); }
        w = w.replace(/\\\//g, '/');
        if (!w) continue;
        this.addWord(w, this.flags(f));
      }
    }
    addWord(w, flags = '') {
      const a = this.words.get(w);
      if (a) { if (!a.includes(flags)) a.push(flags); } else this.words.set(w, [flags]);
    }
    has(F, k) { const f = this.F[k]; return !!f && F.includes(f); }

    /* ---------------------------------------------------------- Zerlegen in Stamm + Vor-/Nachsilben
     * accept(info) entscheidet; info = { flags (Wort + Fortsetzungsklassen), entry, pfx, sfx, sfx2 } */
    find(word, accept) {
      for (const F of this.words.get(word) || []) if (accept({ flags: F, entry: F })) return true;
      if (this.sfxFind(word, null, accept, null, null)) return true;
      const n = word.length;
      for (let i = 1; i <= Math.min(n - 1, this.maxP); i++) {
        const rs = this.pfx.get(word.slice(0, i));
        if (!rs) continue;
        for (const r of rs) {
          const stem = r.strip + word.slice(i);
          if (r.re && !r.re.test(stem)) continue;
          for (const F of this.words.get(stem) || []) if (F.includes(r.flag) && accept({ flags: F + r.cont, entry: F, pfx: r })) return true;
          if (r.cross && this.sfxFind(stem, null, accept, r, null)) return true;
        }
      }
      return false;
    }
    sfxFind(word, need, accept, pfx, outer) {
      const n = word.length;
      for (let i = 0; i <= Math.min(n - 1, this.maxS); i++) {
        const rs = this.sfx.get(i ? word.slice(n - i) : '');
        if (!rs) continue;
        const base = word.slice(0, n - i);
        for (const r of rs) {
          if (need && !r.cont.includes(need)) continue;
          if (pfx && !r.cross) continue;
          const stem = base + r.strip;
          if (!stem || (r.re && !r.re.test(stem))) continue;
          for (const F of this.words.get(stem) || []) {
            if (!F.includes(r.flag)) continue;
            if (pfx && !F.includes(pfx.flag) && !r.cont.includes(pfx.flag)) continue;
            if (accept({ flags: F + r.cont + (outer ? outer.cont : '') + (pfx ? pfx.cont : ''), entry: F, sfx: outer || r, sfx2: outer ? r : null, pfx })) return true;
          }
          // zweistufig: r ist die äussere Endung, der Stamm trägt selbst eine Endung, die auf r verweist
          if (!outer && !need && this.twofold && this.sfxFind(stem, r.flag, accept, pfx, r)) return true;
        }
      }
      return false;
    }
    okNormal(i) {
      if (this.has(i.flags, 'ONLYINCOMPOUND') || this.has(i.entry, 'FORBIDDENWORD')) return false;
      if (this.has(i.entry, 'NEEDAFFIX') && !i.pfx && !i.sfx) return false;
      if (i.sfx && this.has(i.sfx.cont, 'NEEDAFFIX') && !i.pfx && !i.sfx2) return false;
      return true;
    }
    plain(w) { return this.find(w, (i) => this.okNormal(i)); }
    forbidden(w) { return (this.words.get(w) || []).some(F => this.has(F, 'FORBIDDENWORD')); }

    /* ---------------------------------------------------------- Zusammensetzungen (Hunspell-Regeln) */
    part(p, role) {
      return this.find(p, (i) => {
        if (this.has(i.entry, 'FORBIDDENWORD') || this.has(i.flags, 'COMPOUNDFORBIDFLAG')) return false;
        const R = this.has(i.flags, 'COMPOUNDFLAG') || (role === 'b' && this.has(i.flags, 'COMPOUNDBEGIN')) || (role === 'm' && this.has(i.flags, 'COMPOUNDMIDDLE')) || (role === 'e' && this.has(i.flags, 'COMPOUNDEND'));
        if (!R) return false;
        const perm = (a) => !a || this.has(a.cont, 'COMPOUNDPERMITFLAG') || this.has(a.cont, 'ONLYINCOMPOUND');
        if (role !== 'b' && !perm(i.pfx)) return false;
        if (role !== 'e' && !perm(i.sfx)) return false;
        return true;
      });
    }
    compoundStrict(w, depth = 0) {
      if (!this.compound) return false;
      const n = w.length, m = this.cmin;
      for (let i = m; i <= n - m; i++) {
        const a = w.slice(0, i);
        if (!this.part(a, depth ? 'm' : 'b')) continue;
        const b = w.slice(i);
        if (this.part(b, 'e')) return true;
        if (depth + 2 < this.cmax && this.compoundStrict(b, depth + 1)) return true;
      }
      return false;
    }
    /* ---------------------------------------------------------- Rückfall für Deutsch: Teil + Fuge + Teil */
    word3(w) { return this.plainLoose(w) || this.plainLoose(w[0].toUpperCase() + w.slice(1)) || this.plainLoose(w[0].toLowerCase() + w.slice(1)); }
    plainLoose(w) { return this.find(w, (i) => !this.has(i.entry, 'FORBIDDENWORD') && !(this.has(i.entry, 'NEEDAFFIX') && !i.pfx && !i.sfx)) || (this.extra && this.extra(w)); }
    compoundLoose(w, depth = 0) {
      const n = w.length;
      if (n < 6) return false;
      for (let i = 3; i <= n - 3; i++) {
        const a = w.slice(0, i), b = w.slice(i);
        let ok = false;
        for (const fuge of ['', 's', 'es', 'n', 'en', 'e', 'er', 'ns']) {
          if (fuge && !a.endsWith(fuge)) continue;
          const base = fuge ? a.slice(0, -fuge.length) : a;
          if (base.length < 3) continue;
          if (this.word3(base) || (!fuge && this.word3(base + 'e'))) { ok = true; break; }   // auch ohne End-e (Schul|haus)
        }
        if (!ok) continue;
        if (b.length >= 3 && this.word3(b)) return true;
        if (depth < 1 && this.compoundLoose(b[0].toUpperCase() + b.slice(1), depth + 1)) return true;
      }
      return false;
    }

    /* ---------------------------------------------------------- Prüfen */
    check(word, loose = true) {
      const key = (loose ? '1' : '0') + word;
      const c = this.cache.get(key);
      if (c !== undefined) return c;
      const r = this.check0(word, loose);
      if (this.cache.size > 50000) this.cache.clear();
      this.cache.set(key, r);
      return r;
    }
    check0(word, loose) {
      for (const [a, b] of this.iconv) if (word.includes(a)) word = word.split(a).join(b);
      if (this.forbidden(word)) return false;
      if (this.plain(word) || (this.extra && this.extra(word))) return true;
      const low = word[0].toLowerCase() + word.slice(1);
      const capStart = low !== word && word.slice(1) === word.slice(1).toLowerCase();
      // grosser Anfangsbuchstabe (Satzanfang) – nicht bei Wörtern, die klein geschrieben bleiben müssen (KEEPCASE)
      if (capStart && this.find(low, (i) => this.okNormal(i) && !this.has(i.entry, 'KEEPCASE'))) return true;
      if (capStart && this.extra && this.extra(low)) return true;
      if (this.compoundStrict(word) || (capStart && this.compoundStrict(low))) return true;
      if (loose && this.german && (this.compoundLoose(word) || (capStart && this.compoundLoose(low)))) return true;
      return false;
    }

    /* ---------------------------------------------------------- Vorschläge */
    suggest(word, max = 6) {
      const out = new Map();
      const cap = word[0] !== word[0].toLowerCase();
      const add = (w, s) => { if (w === word || out.has(w) && out.get(w) <= s) return; if (this.forbidden(w)) return; out.set(w, s); };
      const ok = (w) => w.length > 1 && this.check(w, false);
      let budget = 60000;
      const test = (w, s) => { if (budget-- <= 0) return; if (!out.has(w) && ok(w)) add(w, s); };
      // Gross-/Kleinschreibung (Nomen klein geschrieben, Satzanfang)
      test(word[0].toUpperCase() + word.slice(1), 0.2);
      test(word.toLowerCase(), 0.3);
      // REP-Tabelle (typische Verwechslungen) und Umlaute
      const reps = this.rep.concat(this.german ? [['ae', 'ä'], ['oe', 'ö'], ['ue', 'ü'], ['ss', 'ß'], ['ß', 'ss'], ['ä', 'e'], ['e', 'ä'], ['dt', 't'], ['t', 'dt'], ['z', 'tz'], ['k', 'ck'], ['ie', 'i'], ['i', 'ie'], ['h', ''], ['th', 't']] : []);
      for (const [a, b] of reps) {
        let i = word.indexOf(a);
        while (i >= 0) { test(word.slice(0, i) + b + word.slice(i + a.length), 0.5); i = word.indexOf(a, i + 1); }
      }
      const T = (this.tryChars || 'esianrtolcdugmphbyfvkwz').slice(0, 44);
      const lowT = [...new Set([...T].filter(ch => ch !== ch.toUpperCase() || /[äöüß]/.test(ch)))].join('') || T;
      const e1 = this.edits(word, lowT);
      for (const [w, s] of e1) test(w, 1 + s);
      // in zwei Wörter teilen
      for (let i = 2; i <= word.length - 2; i++) { const a = word.slice(0, i), b = word.slice(i); if (ok(a) && ok(b)) add(a + ' ' + b, 1.6); }
      // zwei Fehler (nur bei wenigen Treffern und nicht zu langen Wörtern)
      if (out.size < 3 && word.length <= 14) {
        let n = 0;
        for (const [w1] of e1) {
          if (++n > 400 || budget <= 0) break;
          for (const [w2, s2] of this.edits(w1, lowT.slice(0, 26))) test(w2, 2 + s2);
        }
      }
      const res = [...out].sort((a, b) => a[1] - b[1] || Math.abs(a[0].length - word.length) - Math.abs(b[0].length - word.length) || a[0].localeCompare(b[0])).map(x => x[0]);
      const fix = (w) => cap && w[0] === w[0].toLowerCase() ? w[0].toUpperCase() + w.slice(1) : w;
      return [...new Set(res.map(fix))].slice(0, max);
    }
    /* alle Wörter mit einem Fehler weniger (löschen, vertauschen, ersetzen, einfügen) – mit Tastatur-Nähe als Wert */
    edits(w, T) {
      const out = new Map(), n = w.length;
      const put = (x, s) => { if (x && x !== w && (!out.has(x) || out.get(x) > s)) out.set(x, s); };
      for (let i = 0; i < n; i++) put(w.slice(0, i) + w.slice(i + 1), 0.1);
      for (let i = 0; i < n - 1; i++) put(w.slice(0, i) + w[i + 1] + w[i] + w.slice(i + 2), 0);
      for (let i = 0; i < n; i++) for (const ch of T) if (ch !== w[i]) put(w.slice(0, i) + ch + w.slice(i + 1), this.near(w[i], ch) ? 0.05 : 0.3);
      for (let i = 0; i <= n; i++) for (const ch of T) put(w.slice(0, i) + ch + w.slice(i), 0.2);
      return out;
    }
    near(a, b) {
      a = a.toLowerCase(); b = b.toLowerCase();
      for (const row of this.key.split('|')) { const i = row.indexOf(a); if (i >= 0 && (row[i - 1] === b || row[i + 1] === b)) return true; }
      return false;
    }
  }
  return { build, Engine, decode, setOf };
})();

if (typeof module !== 'undefined') module.exports = { SpellEngine };
