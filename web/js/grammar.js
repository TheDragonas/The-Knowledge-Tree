'use strict';
/* Grammatik-Hinweise (1.66) – wie die blaue Doppellinie in Word: einfache, sichere Regeln, keine KI, kein Internet.
 *
 * Läuft zusammen mit der Rechtschreibprüfung (Spell.scanBox ruft Grammar.scanBox) über denselben Text der Felder
 * (Spell.textMap) und markiert Treffer mit einer eigenen Hervorhebung (CSS Custom Highlight „kt-grammar“).
 * Rechtsklick auf eine Markierung zeigt die Erklärung und – wo eindeutig – den Vorschlag zum Übernehmen.
 * Regeln: doppeltes Wort, mehrere Leerzeichen, Leerzeichen vor / fehlend nach Satzzeichen, Satzanfang klein,
 * Klammern/Anführungszeichen ohne Gegenstück; Deutsch: Komma vor „dass/weil/obwohl …“, „seid“/„seit“,
 * Deppenapostroph; Englisch: a/an, „i“, could of, alot, their is. Sprache je Absatz geschätzt (häufige Wörter). */
const Grammar = {
  boxes: new Map(),          // Feld-ID → [{ range, msg, fix, s, e }]
  hlOK: typeof CSS !== 'undefined' && !!CSS.highlights && typeof Highlight === 'function',
  on() { return Store.ui.grammar !== false; },
  init() {
    if (this._init || !this.hlOK) return;
    this._init = true;
    this.hl = new Highlight();
    CSS.highlights.set('kt-grammar', this.hl);
  },
  toggle() { Store.ui.grammar = !this.on(); UiState.saveSoon(); if (!this.on()) this.clear(); if (typeof Spell !== 'undefined') Spell.rescanAll(); Ribbon.refreshSoon(); },
  clear() { if (this.hl) this.hl.clear(); this.boxes.clear(); },
  ABBR: /(?:^|[\s(])(?:z|d|u|o|s|v|bzw|ca|usw|etc|evtl|ggf|vgl|Nr|Dr|Prof|St|Hr|Fr|inkl|exkl|bspw|resp|zB|e\.g|i\.e|vs|Mr|Mrs|Ms|No|Jan|Feb|Mär|Apr|Jun|Jul|Aug|Sep|Sept|Okt|Nov|Dez|S|Abb|Kap|Tab|Bd|Aufl|Hrsg|Jh|Mio|Mrd|ff|f)\.\s*$/,
  lang(text) {
    const w = text.toLowerCase().match(/\p{L}+/gu) || [];
    let de = 0, en = 0;
    const D = new Set(['der', 'die', 'das', 'und', 'ist', 'nicht', 'ein', 'eine', 'ich', 'mit', 'auf', 'für', 'von', 'zu', 'den', 'dem', 'sie', 'wir', 'es', 'auch', 'sich', 'dass', 'wie', 'aber', 'oder', 'wird', 'sind', 'im']);
    const E = new Set(['the', 'and', 'is', 'not', 'a', 'an', 'i', 'with', 'on', 'for', 'of', 'to', 'it', 'we', 'you', 'are', 'that', 'this', 'be', 'was', 'have', 'or', 'but', 'in', 'they', 'will']);
    for (const x of w) { if (D.has(x)) de++; if (E.has(x)) en++; }
    return en > de ? 'en' : 'de';
  },
  /* Treffer in einem Text: [{ s, e, msg, fix }] (fix = Ersatz für text.slice(s, e)) */
  check(text) {
    const out = [];
    const add = (s, e, msg, fix) => { if (!out.some(o => s < o.e && e > o.s)) out.push({ s, e, msg, fix }); };
    let m;
    // Absatzweise (Zeilen der Feld-Textkarte sind Blöcke)
    let base = 0;
    for (const para of text.split('\n')) {
      const P = para, L = this.lang(P);
      const at = (i) => base + i;
      const rx = (re, fn) => { re.lastIndex = 0; while ((m = re.exec(P))) fn(m); };
      // doppeltes Wort
      rx(/(?<![\p{L}\d])(\p{L}{2,})(\s+)(\1)(?![\p{L}\d])/giu, (x) => { if (/^(die|das|der|dass|had|that)$/i.test(x[1])) return; add(at(x.index), at(x.index + x[0].length), `Doppeltes Wort „${x[1]}“`, x[1]); });
      // mehrere Leerzeichen zwischen Wörtern
      rx(/(?<=\S)( {2,})(?=\S)/g, (x) => add(at(x.index), at(x.index + x[0].length), 'Mehrere Leerzeichen', ' '));
      // Leerzeichen vor Satzzeichen
      rx(/(?<=[\p{L}\d)])( +)([,.;:!?])(?![.\d])/gu, (x) => { if (x[2] === ':' && L === 'fr') return; add(at(x.index), at(x.index + x[0].length), 'Leerzeichen vor dem Satzzeichen', x[2]); });
      // fehlendes Leerzeichen nach Satzzeichen
      rx(/(?<=\p{Ll}{2})([,;!?])(?=\p{L})/gu, (x) => add(at(x.index), at(x.index + 1), 'Leerzeichen nach dem Satzzeichen fehlt', x[1] + ' '));
      rx(/(?<=\p{Ll}{3})(\.)(?=\p{Lu}\p{Ll})/gu, (x) => add(at(x.index), at(x.index + 1), 'Leerzeichen nach dem Punkt fehlt', '. '));
      rx(/(?<=\p{Ll}{3})(\.)(?=(?:der|die|das|den|dem|ich|du|wir|ihr|er|sie|es|und|aber|dann|the|and|but|it|we|this|then)\s)/gu, (x) => add(at(x.index), at(x.index + 1), 'Leerzeichen nach dem Punkt fehlt (neuer Satz?)', '. '));
      // Satzanfang klein
      rx(/([.!?])(\s+)(\p{Ll})/gu, (x) => {
        const before = P.slice(0, x.index + 1);
        if (this.ABBR.test(before) || /\d\.$/.test(before) || /\.\.\.$|…$/.test(before) || /\b\p{L}\.$/u.test(before)) return;
        const s = x.index + x[1].length + x[2].length;
        add(at(s), at(s + 1), 'Satzanfang: Grossbuchstabe', x[3].toUpperCase());
      });
      // Klammern ohne Gegenstück
      const opens = (P.match(/\(/g) || []).length, closes = (P.match(/\)/g) || []).length;
      if (opens !== closes && !/\d\)\s/.test(P) && !/^\s*\p{L}\)/u.test(P)) { const i = opens > closes ? P.lastIndexOf('(') : P.indexOf(')'); if (i >= 0) add(at(i), at(i + 1), opens > closes ? 'Klammer wird nicht geschlossen' : 'Schliessende Klammer ohne öffnende', null); }
      if (L === 'de') {
        // Komma vor Nebensatz-Konjunktionen
        rx(/(?<=[\p{L}\d])( )(dass|weil|obwohl|damit|sodass|nachdem|bevor|falls|sobald|solange|während dessen)(?![\p{L}])/gu, (x) => {
          const prev = (P.slice(0, x.index).match(/(\p{L}+)$/u) || [])[1] || '';
          if (/^(so|als|ohne|statt|anstatt|und|oder|aber|sondern|denn|auch|nur|gerade|erst|eben|vor|bis|nicht)$/i.test(prev)) return;
          if (x.index < 3) return;
          add(at(x.index), at(x.index + 1), `Komma vor „${x[2]}“?`, ', ');
        });
        rx(/(?<![\p{L}])(seid)(\s+)(gestern|heute|wann|langem|kurzem|jahren|monaten|wochen|tagen|stunden|damals|anfang|beginn|letzter|letztem|dem|der|einiger|einigen|vielen|immer)(?![\p{L}])/giu, (x) => add(at(x.index), at(x.index + 4), '„seit“ (Zeit) statt „seid“ (Verb)?', x[1][0] === 'S' ? 'Seit' : 'seit'));
        rx(/(?<![\p{L}])(seit)(\s+)(ihr)(?![\p{L}])/giu, (x) => add(at(x.index), at(x.index + 4), '„seid ihr“ (Verb) statt „seit“?', x[1][0] === 'S' ? 'Seid' : 'seid'));
        rx(/(?<![\p{L}])(\p{Lu}\p{Ll}+)'s(?![\p{L}])/gu, (x) => add(at(x.index), at(x.index + x[0].length), 'Genitiv ohne Apostroph (z.B. „Peters Buch“)', x[1] + 's'));
      } else {
        rx(/(?<![\p{L}])([Aa])(\s+)([aeio]\p{L}+)/gu, (x) => { if (/^(one|once|uni|use|usu|euro|eu)/i.test(x[3])) return; add(at(x.index), at(x.index + 1), '„an“ vor Vokal', x[1] === 'A' ? 'An' : 'an'); });
        rx(/(?<![\p{L}])([Aa]n)(\s+)([bcdfgjklmnpqrstvwxz]\p{L}+)/gu, (x) => { if (/^(hour|honest|hon|heir|herb)/i.test(x[3])) return; add(at(x.index), at(x.index + 2), '„a“ vor Konsonant', x[1][0] === 'A' ? 'A' : 'a'); });
        rx(/(?<![\p{L}'])(i)(?![\p{L}'.])/gu, (x) => add(at(x.index), at(x.index + 1), '„I“ wird gross geschrieben', 'I'));
        rx(/(?<![\p{L}])(could|should|would|must|might)(\s+)of(?![\p{L}])/giu, (x) => add(at(x.index), at(x.index + x[0].length), '„have“ statt „of“', x[1] + ' have'));
        rx(/(?<![\p{L}])alot(?![\p{L}])/giu, (x) => add(at(x.index), at(x.index + 4), '„a lot“', 'a lot'));
        rx(/(?<![\p{L}])([Tt])heir(\s+)(is|are|was|were)(?![\p{L}])/gu, (x) => add(at(x.index), at(x.index + 5), '„there“ statt „their“?', x[1] + 'here'));
        rx(/(?<![\p{L}])([Ii])ts(\s+)(a|an|the|not|been|very)(?![\p{L}])/gu, (x) => add(at(x.index), at(x.index + 3), '„it’s“ (it is) statt „its“?', x[1] + 't’s'));
      }
      base += para.length + 1;
    }
    return out.sort((a, b) => a.s - b.s);
  },
  /* von Spell.scanBox aufgerufen (Text + Zuordnung schon da) */
  scanBox(id, t, map, caret) {
    this.init();
    const old = this.boxes.get(id);
    if (old && this.hl) for (const x of old) this.hl.delete(x.range);
    this.boxes.delete(id);
    if (!this.on() || !this.hl || !t) return;
    const list = [];
    for (const g of this.check(map.text)) {
      if (caret >= g.s && caret <= g.e + 1) continue;   // gerade am Schreiben
      const r = Spell.rangeOf(map, g.s, g.e);
      if (r) list.push({ ...g, range: r });
    }
    if (list.length) { this.boxes.set(id, list); for (const x of list) this.hl.add(x.range); }
  },
  drop(id) { const old = this.boxes.get(id); if (old && this.hl) for (const x of old) this.hl.delete(x.range); this.boxes.delete(id); },
  hitAt(pos, boxId) {
    const ids = boxId ? [boxId] : [...this.boxes.keys()];
    for (const id of ids) for (const it of this.boxes.get(id) || []) { try { if (it.range.isPointInRange(pos[0], pos[1]) || (it.range.toString().trim() === '' && it.range.comparePoint(pos[0], pos[1]) === 0)) return { ...it, box: id }; } catch (e) { /* */ } }
    return null;
  },
  /* Kontextmenü-Einträge bei Rechtsklick auf eine Markierung (oder null) */
  menuFor(pos, boxId) {
    if (!this.on() || !pos) return null;
    const hit = this.hitAt(pos, boxId);
    if (!hit) return null;
    const items = [{ head: '✎ ' + hit.msg }];
    if (hit.fix != null) items.push({ label: hit.fix.trim() ? `Ändern in „${hit.fix}“` : 'Entfernen', icon: 'check', action: () => this.apply(hit) });
    items.push({ label: 'Ignorieren', icon: 'x', action: () => { this.drop(hit.box); } });
    items.push({ label: 'Grammatikprüfung ausschalten', icon: 'spellcheck', action: () => this.toggle() });
    return items;
  },
  apply(hit) {
    const b = Canvas.box(hit.box);
    if (!b || Canvas.isLocked(b)) return;
    try {
      const r = hit.range;
      r.deleteContents();
      if (hit.fix) r.insertNode(document.createTextNode(hit.fix));
      const t = Canvas.textEl(hit.box);
      if (t) { b.html = sanitizeHtml(t.innerHTML); const e = Canvas.els.get(b.id); if (e) e._html = b.html; }
      Hist.touchPage(Canvas.pageId); Hist.commit('Grammatik korrigiert');
      Spell.queue.add(hit.box); Spell.pumpSoon();
    } catch (e) { UI.toast('Konnte nicht ersetzt werden'); }
  },
};
if (typeof module !== 'undefined') module.exports = { Grammar };
