'use strict';
/* Rechtschreibprüfung wie in OneNote (seit 1.38): rote Wellenlinien unter unbekannten Wörtern, Rechtsklick = Vorschläge,
 * Ignorieren, Zum Wörterbuch hinzufügen; F7 (Überprüfen → Rechtschreibung) geht die Seite Wort für Wort durch.
 *
 * Sprachen: Deutsch (Schweiz/Deutschland) und Englisch (USA/Grossbritannien) gleichzeitig – ein Wort gilt als richtig,
 * wenn es eine der gewählten Sprachen kennt (gemischte Texte, englische Fachbegriffe in deutschen Notizen). Dazu
 * Fachwörter (spell-fach.js, Wörter der Add-Ins wie die Element- und Molekülnamen aus Chem-Draw) und das eigene Wörterbuch (Store.ui.spell.user).
 *
 * Wörterbücher: die Hunspell-Dateien von LibreOffice (de_CH_frami, de_DE_frami, en_US, en_GB) – beim ersten Gebrauch
 * einmal geladen (Webseite: aus dem Netz, danach im Browser gespeichert; Programm: über /api/woerterbuch, das sie in
 * Cache/Woerterbuch ablegt). Ohne Netz und noch nie geladen: die Rechtschreibprüfung des Browsers springt ein.
 *
 * Anzeige ohne Eingriff in den Text: CSS Custom Highlight API (::highlight(kt-spell)) – keine Spans im gespeicherten
 * HTML. Geprüft wird in Ruhepausen, Textfeld für Textfeld; das Wort, an dem gerade geschrieben wird, erst danach. */
const SPELL_LANGS = {
  'de-CH': { label: 'Deutsch (Schweiz)', lo: 'de/de_CH_frami', npm: 'dictionary-de-ch@3' },
  'de-DE': { label: 'Deutsch (Deutschland)', lo: 'de/de_DE_frami', npm: 'dictionary-de@3' },
  'en-US': { label: 'Englisch (USA)', lo: 'en/en_US', npm: 'dictionary-en@4' },
  'en-GB': { label: 'Englisch (Grossbritannien)', lo: 'en/en_GB', npm: 'dictionary-en-gb@3' },
  'fr-FR': { label: 'Französisch', lo: 'fr_FR/fr', npm: 'dictionary-fr@3' },   // 1.42
  'la': { label: 'Latein', lo: 'la/la', npm: 'dictionary-la@3' },              // 1.42
};

const Spell = {
  engines: new Map(), loading: new Map(), failed: new Map(),
  wrong: new Map(),          // Wort → true (falsch) / false
  boxes: new Map(),          // Textfeld-ID → [{ range, word, off }]
  ignoreAll: new Set(),      // diese Sitzung: „Alle ignorieren“
  ignoreOnce: new Set(),     // diese Sitzung: „Ignorieren“ (Feld|Wort|Stelle)
  queue: new Set(),
  hlOK: typeof CSS !== 'undefined' && !!CSS.highlights && typeof Highlight === 'function',

  /* eigene Wörterbücher (1.66): Hunspell-Dateien .aff + .dic, im Notizbuch-Speicher; Store.ui.spellCustom */
  registerCustom() {
    for (const d of Array.isArray(Store.ui.spellCustom) ? Store.ui.spellCustom : []) if (d && d.code && d.aff && d.dic) SPELL_LANGS[d.code] = { label: d.label || d.code, custom: d };
  },
  async addDictionary() {
    const files = await new Promise((res) => { const inp = el('input', { type: 'file', multiple: true, accept: '.aff,.dic,.oxt,.zip', style: { display: 'none' } }); inp.addEventListener('change', () => { res([...inp.files]); inp.remove(); }); document.body.append(inp); inp.click(); });
    if (!files.length) return;
    let aff = files.find(f => /\.aff$/i.test(f.name)), dic = files.find(f => /\.dic$/i.test(f.name));
    // LibreOffice-Erweiterung (.oxt) bzw. ZIP: .aff/.dic darin suchen
    const zip = files.find(f => /\.(oxt|zip)$/i.test(f.name));
    if (zip && (!aff || !dic)) {
      try { const z = Ooxml.readZip(new Uint8Array(await zip.arrayBuffer())); const pick = (re) => z.find(e => re.test(e.name)); const a = pick(/\.aff$/i), d = pick(/\.dic$/i);
        const bytes = async (e) => e.method === 0 ? e.raw : Ooxml.inflate(e.raw);
        if (a && d) { aff = new File([await bytes(a)], a.name.split('/').pop()); dic = new File([await bytes(d)], d.name.split('/').pop()); } } catch (e) { /* */ }
    }
    if (!aff || !dic) { UI.info('Wörterbuch hinzufügen', '<p>Bitte beide Dateien eines Hunspell-Wörterbuchs wählen: <b>.aff</b> und <b>.dic</b> (z.B. aus LibreOffice) – oder eine LibreOffice-Erweiterung <b>.oxt</b>.</p>'); return; }
    const base = aff.name.replace(/\.aff$/i, '');
    const label = (await UI.prompt('Name der Sprache (erscheint unter „Sprachen“)', base.replace(/[_-]/g, ' '))) || base;
    const code = 'x-' + base.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 24);
    const d = { code, label, aff: await Backend.saveFile(new Blob([aff], { type: 'application/octet-stream' }), 'aff'), dic: await Backend.saveFile(new Blob([dic], { type: 'application/octet-stream' }), 'dic') };
    Store.ui.spellCustom = [...(Store.ui.spellCustom || []).filter(x => x.code !== code), d];
    this.registerCustom();
    this.engines.delete(code); this.failed.delete(code);
    const o = this.opts();
    if (!o.langs.includes(code)) o.langs.push(code);
    UiState.saveSoon();
    await this.ensure();
    UI.toast(this.engines.has(code) ? `Wörterbuch „${label}“ hinzugefügt und eingeschaltet` : `Wörterbuch „${label}“ konnte nicht gelesen werden: ${this.failed.get(code) || ''}`, 5000);
  },
  removeDictionary(code) {
    Store.ui.spellCustom = (Store.ui.spellCustom || []).filter(x => x.code !== code);
    delete SPELL_LANGS[code];
    this.engines.delete(code);
    const o = this.opts(); o.langs = o.langs.filter(l => l !== code);
    UiState.saveSoon(); this.wrong.clear(); this.rescanAll();
  },
  opts() {
    if (!this._reg) { this._reg = true; this.registerCustom(); }
    const u = Store.ui;
    const s = u.spell && typeof u.spell === 'object' ? u.spell : {};
    u.spell = { on: s.on !== false, fach: s.fach !== false, langs: Array.isArray(s.langs) && s.langs.length ? s.langs.filter(l => SPELL_LANGS[l]) : ['de-CH', 'en-US'], user: Array.isArray(s.user) ? s.user : [] };
    if (!u.spell.langs.length) u.spell.langs = ['de-CH'];
    return u.spell;
  },
  active() { const o = this.opts(); return o.on && o.langs.some(l => this.engines.has(l)); },
  ready() { const o = this.opts(); return o.langs.every(l => this.engines.has(l) || this.failed.has(l)); },

  /* ---------------------------------------------------------- Start */
  init() {
    if (this._init) return;
    this._init = true;
    this.opts();
    if (this.hlOK) {
      this.hl = new Highlight(); this.cur = new Highlight();
      CSS.highlights.set('kt-spell', this.hl); CSS.highlights.set('kt-spell-cur', this.cur);
    }
    // Text geändert, Felder neu gezeichnet, Seite gewechselt → betroffene Felder neu prüfen
    const mo = new MutationObserver((list) => {
      if (!this.active() && !(typeof Grammar !== 'undefined' && Grammar.on())) return;
      for (const m of list) {
        const n = m.target.nodeType === 1 ? m.target : m.target.parentElement;
        const b = n && n.closest && n.closest('.box');
        if (b && b.dataset.id) this.queue.add(b.dataset.id);
        for (const a of m.addedNodes || []) if (a.nodeType === 1 && a.classList.contains('box') && a.dataset.id) this.queue.add(a.dataset.id);
        if (m.removedNodes && m.removedNodes.length) this._purge = true;
      }
      this.pumpSoon();
    });
    for (const layer of Canvas.boxLayers()) mo.observe(layer, { childList: true, subtree: true, characterData: true });
    // Schreibmarke verlässt das Wort, an dem geschrieben wurde → jetzt prüfen
    document.addEventListener('selectionchange', () => { if (this._skip && Canvas.editing) { clearTimeout(this._selT); this._selT = setTimeout(() => { if (this._skip) { this.queue.add(this._skip.box); this.pumpSoon(); } }, 250); } });
    // Wörterbücher erst nach dem Start (nicht beim Laden der Notizen stören)
    setTimeout(() => this.ensure(), 2500);
  },
  /* Wörterbücher der gewählten Sprachen laden (einmal) */
  async ensure(quiet) {
    const o = this.opts();
    if (!o.on) { this.applyNative(); return; }
    const todo = o.langs.filter(l => !this.engines.has(l));
    if (!todo.length) { this.rescanAll(); return; }
    let toast = null;
    if (!quiet) toast = setTimeout(() => UI.toast('Rechtschreibprüfung: Wörterbücher werden geladen …', 4000), 1200);
    for (const l of todo) await this.load(l);
    clearTimeout(toast);
    const bad = todo.filter(l => this.failed.has(l));
    if (bad.length && !quiet) UI.toast(`Wörterbuch ${bad.map(l => SPELL_LANGS[l].label).join(', ')} konnte nicht geladen werden (keine Internetverbindung?) – bis dahin prüft der Browser.`, 6000);
    this.wrong.clear();
    this.rescanAll();
    if (typeof Ribbon !== 'undefined') Ribbon.refreshSoon();
  },
  load(lang) {
    if (this.engines.has(lang)) return Promise.resolve(this.engines.get(lang));
    if (this.loading.has(lang)) return this.loading.get(lang);
    const p = (async () => {
      try {
        const [aff, dic] = await Promise.all([this.file(lang, 'aff'), this.file(lang, 'dic')]);
        const E = await SpellEngine.build(aff, dic, { lang, chunk: 20000 });
        E.extra = (w) => this.extra(w);
        this.engines.set(lang, E);
        this.failed.delete(lang);
        return E;
      } catch (e) {
        console.warn('[KnowledgeTree] Wörterbuch', lang, e);
        this.failed.set(lang, e.message || String(e));
        return null;
      } finally { this.loading.delete(lang); }
    })();
    this.loading.set(lang, p);
    return p;
  },
  urls(lang, ext) {
    const L = SPELL_LANGS[lang];
    return [`https://cdn.jsdelivr.net/gh/LibreOffice/dictionaries@master/${L.lo}.${ext}`, `https://raw.githubusercontent.com/LibreOffice/dictionaries/master/${L.lo}.${ext}`, `https://cdn.jsdelivr.net/npm/${L.npm}/index.${ext}`];
  },
  /* eine Wörterbuch-Datei als Bytes: Programm über den eigenen Server, Webseite aus dem Speicher des Browsers oder dem Netz */
  async file(lang, ext) {
    const C = SPELL_LANGS[lang] && SPELL_LANGS[lang].custom;
    if (C) { const b = await OfficePages.assetBlob(C[ext]); if (!b) throw new Error('Datei fehlt im Speicher'); return new Uint8Array(await b.arrayBuffer()); }
    if (Backend.kind === 'server') {
      const r = await fetch(`api/woerterbuch?l=${encodeURIComponent(lang)}&f=${ext}${this._fresh ? '&neu=1' : ''}`, { headers: { 'X-Token': Backend.token } });
      if (!r.ok) throw new Error((await r.text()) || r.statusText);
      return new Uint8Array(await r.arrayBuffer());
    }
    const key = `${lang}.${ext}`;
    const have = await this.idb('get', key);
    if (have) return have;
    let last = null;
    for (const u of this.urls(lang, ext)) {
      try {
        const r = await fetch(u, { cache: 'force-cache' });
        if (!r.ok) { last = new Error(r.status + ' ' + u); continue; }
        const b = new Uint8Array(await r.arrayBuffer());
        if (b.length < 500) { last = new Error('zu klein: ' + u); continue; }
        this.idb('put', key, b).catch(() => { });
        return b;
      } catch (e) { last = e; }
    }
    throw last || new Error('nicht erreichbar');
  },
  /* kleiner eigener IndexedDB-Speicher für die Wörterbücher (getrennt von den Notizen) */
  idb(op, key, val) {
    return new Promise((res) => {
      let rq;
      try { rq = indexedDB.open('KnowledgeTree-Woerterbuch', 1); } catch (e) { res(null); return; }
      rq.onupgradeneeded = () => rq.result.createObjectStore('f');
      rq.onerror = () => res(null);
      rq.onsuccess = () => {
        try {
          const db = rq.result, tx = db.transaction('f', op === 'get' ? 'readonly' : 'readwrite'), st = tx.objectStore('f');
          const r = op === 'get' ? st.get(key) : op === 'clear' ? st.clear() : st.put(val, key);
          r.onsuccess = () => { res(op === 'get' ? r.result || null : true); db.close(); };
          r.onerror = () => { res(null); db.close(); };
        } catch (e) { res(null); }
      };
    });
  },

  /* ---------------------------------------------------------- Wörter */
  fachSet() {
    if (this._fach) return this._fach;
    const s = new Set();
    for (const list of Object.values(typeof SPELL_FACH !== 'undefined' ? SPELL_FACH : {})) for (const w of list.split(/\s+/)) if (w) { s.add(w.toLowerCase()); for (const p of w.split('-')) if (p.length > 2) s.add(p.toLowerCase()); }
    // Wörter der Add-Ins (1.69; z.B. Element- und Molekülnamen aus Chem-Draw – ausgeschaltet: keine)
    const words = (str) => { for (const w of String(str || '').split(/[^\p{L}]+/u)) if (w.length > 2) s.add(w.toLowerCase()); };
    try { if (typeof Plugins !== 'undefined') for (const w of Plugins.allWords()) words(w); } catch (e) { /* */ }
    return (this._fach = s);
  },
  userSet() {
    const u = this.opts().user;
    if (this._userSrc !== u) { this._userSrc = u; this._user = new Set(u.map(w => w.toLowerCase())); }
    return this._user;
  },
  /* Fach- und eigene Wörter, auch mit üblichen Endungen (Enantiomer-e, Titration-en …) */
  extra(w) {
    const l = w.toLowerCase(), U = this.userSet(), F = this.opts().fach ? this.fachSet() : null;
    const has = (x) => U.has(x) || (F && F.has(x));
    if (has(l)) return true;
    for (const e of ['e', 'en', 'n', 's', 'es', 'er', 'ern', 'em', 'nen', 'ns']) if (l.length > e.length + 2 && l.endsWith(e) && has(l.slice(0, -e.length))) return true;
    return false;
  },
  isWrong(word) {
    let w = word.replace(/’/g, "'");
    if (this.ignoreAll.has(w.toLowerCase())) return false;
    const c = this.wrong.get(w);
    if (c !== undefined) return c;
    let bad = true;
    for (const E of this.engines.values()) if (this.opts().langs.includes(E.lang) && E.check(w)) { bad = false; break; }
    if (bad && this.extra(w)) bad = false;
    // geht's, don't …: Teil vor dem Apostroph
    if (bad && /'/.test(w)) { const a = w.split("'")[0]; if (a.length > 1) bad = this.isWrong(a); }
    // Französisch (1.42): Elision l'homme, d'accord, qu'il, aujourd'hui → Wort nach dem Apostroph
    if (bad && /^(?:[lLdDjJmMnNsStTcC]|[qQ]u|[jJ]usqu|[lL]orsqu|[pP]uisqu)'\p{L}{2,}/u.test(w)) bad = this.isWrong(w.slice(w.indexOf("'") + 1));
    if (this.wrong.size > 40000) this.wrong.clear();
    this.wrong.set(w, bad);
    return bad;
  },
  /* Wörter eines Textes: [{ w, s, e }] – nur, was geprüft werden soll */
  tokens(text) {
    const out = [];
    const re = /[\p{L}\p{M}]+(?:['’][\p{L}]+)?/gu;
    let m;
    while ((m = re.exec(text))) {
      const w = m[0], s = m.index, e = s + w.length;
      const pre = text[s - 1] || ' ', post = text[e] || ' ';
      if (w.length < 2) continue;
      if (/[\d_@#\\/$€%]/.test(pre) || /[\d_@\\/]/.test(post)) continue;            // Teil von Zahl, Adresse, Pfad
      if (post === '.' && /[\p{L}]/u.test(text[e + 1] || '')) continue;                  // Domain/Dateiname (bsp.ch)
      if (post === ':' && text[e + 1] === '/') continue;                                // https:
      if (w === w.toUpperCase()) continue;                                              // Abkürzungen (DNA, CHF)
      if (/\p{Ll}\p{Lu}/u.test(w)) continue;                                            // pH, mRNA, iPhone
      out.push({ w, s, e });
    }
    return out;
  },

  /* ---------------------------------------------------------- Textfelder prüfen */
  SKIP: '.kt-math, code, pre, a, .kt-file, .kt-video, [contenteditable="false"], .fimg, .xl-grid',
  BLOCK: /^(DIV|P|LI|UL|OL|BR|TD|TH|TR|TABLE|H1|H2|H3|H4|H5|H6|BLOCKQUOTE|HR)$/,
  /* Text eines Felds samt Zuordnung zu den Textknoten */
  textMap(root) {
    let text = '';
    const segs = [];
    const walk = (n) => {
      for (let c = n.firstChild; c; c = c.nextSibling) {
        if (c.nodeType === 3) { segs.push({ node: c, s: text.length }); text += c.data; }
        else if (c.nodeType === 1) {
          if (c.matches(this.SKIP)) { text += ' '; continue; }
          const blk = this.BLOCK.test(c.tagName);
          if (blk) text += '\n';
          walk(c);
          if (blk) text += '\n';
        }
      }
    };
    walk(root);
    return { text, segs };
  },
  rangeOf(map, s, e) {
    const at = (pos) => {
      let lo = 0, hi = map.segs.length - 1;
      while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (map.segs[mid].s <= pos) lo = mid; else hi = mid - 1; }
      const g = map.segs[lo];
      return g ? [g.node, Math.min(g.node.length, pos - g.s)] : null;
    };
    const a = at(s), b = at(e - 1);
    if (!a || !b) return null;
    const r = document.createRange();
    try { r.setStart(a[0], a[1]); r.setEnd(b[0], b[1] + 1); } catch (er) { return null; }
    return r;
  },
  scanBox(id) {
    const old = this.boxes.get(id);
    if (old && this.hl) for (const x of old) this.hl.delete(x.range);
    this.boxes.delete(id);
    const e = Canvas.els.get(id), b = Canvas.box(id);
    const t = e && e.isConnected && e.querySelector('.box-text');
    if (!t || !b || b.sheet || b.chart) return;
    this.applyNative(t);
    const map = this.textMap(t);
    // Schreibmarke im Wort: dieses Wort (noch) nicht anstreichen
    let caret = -1;
    this._skip = null;
    const sel = getSelection();
    if (Canvas.editing === id && sel.rangeCount && sel.isCollapsed && t.contains(sel.anchorNode)) {
      const g = map.segs.find(x => x.node === sel.anchorNode);
      if (g) caret = g.s + sel.anchorOffset;
    }
    if (typeof Grammar !== 'undefined') Grammar.scanBox(id, t, map, caret);   // 1.66: Grammatik-Hinweise (blau)
    if (!this.active()) return;
    const list = [];
    for (const tk of this.tokens(map.text)) {
      if (caret >= tk.s && caret <= tk.e) { this._skip = { box: id }; continue; }
      if (this.ignoreOnce.has(`${id}|${tk.w}|${tk.s}`)) continue;
      // Bindestrich-Wörter: Teile einzeln (Säure-Base-Titration)
      if (!this.isWrong(tk.w)) continue;
      const r = this.rangeOf(map, tk.s, tk.e);
      if (r) list.push({ range: r, word: tk.w, off: tk.s });
    }
    if (list.length) { this.boxes.set(id, list); if (this.hl) for (const x of list) this.hl.add(x.range); }
  },
  /* Browser-Prüfung nur, solange die eigene nicht arbeitet (sonst doppelte Wellenlinien) */
  applyNative(t) {
    const own = this.active() && this.hlOK;
    const want = !own && this.opts().on ? 'true' : 'false';
    const list = t ? [t] : [...document.querySelectorAll('#world .box-text')];
    for (const x of list) if (x.getAttribute('spellcheck') !== want) x.setAttribute('spellcheck', want);
  },
  rescanAll() {
    if (typeof Grammar !== 'undefined') Grammar.clear();
    if (this.hl) this.hl.clear();
    this.boxes.clear();
    if (!Canvas.page) return;
    for (const b of Canvas.page.boxes) this.queue.add(b.id);
    this.applyNative();
    this.pumpSoon();
  },
  pumpSoon() {
    if (this._pumpT) return;
    this._pumpT = setTimeout(() => { this._pumpT = null; this.pump(); }, 200);
  },
  /* in Ruhepausen, höchstens ~12 ms am Stück */
  pump() {
    if (this._purge) {
      this._purge = false;
      for (const [id, list] of [...this.boxes]) if (!Canvas.els.get(id) || !Canvas.els.get(id).isConnected) { if (this.hl) for (const x of list) this.hl.delete(x.range); this.boxes.delete(id); }
      if (typeof Grammar !== 'undefined') for (const id of [...Grammar.boxes.keys()]) if (!Canvas.els.get(id) || !Canvas.els.get(id).isConnected) Grammar.drop(id);
    }
    const t0 = performance.now();
    for (const id of [...this.queue]) {
      this.queue.delete(id);
      this.scanBox(id);
      if (performance.now() - t0 > 12) break;
    }
    if (this.queue.size) this._pumpT = setTimeout(() => { this._pumpT = null; this.pump(); }, 16);
    if (this.panelEl && !this.panelEl.hidden && !this._panelBusy) this.panelRefreshSoon();
  },

  /* ---------------------------------------------------------- Rechtsklick */
  hitAt(x, y, boxId) {
    let pos = null;
    if (document.caretRangeFromPoint) { const r = document.caretRangeFromPoint(x, y); if (r) pos = [r.startContainer, r.startOffset]; }
    else if (document.caretPositionFromPoint) { const p = document.caretPositionFromPoint(x, y); if (p) pos = [p.offsetNode, p.offset]; }
    if (!pos) return null;
    const ids = boxId ? [boxId] : [...this.boxes.keys()];
    for (const id of ids) for (const it of this.boxes.get(id) || []) {
      try { if (it.range.isPointInRange(pos[0], pos[1])) return { ...it, box: id }; } catch (e) { /* */ }
    }
    return null;
  },
  suggest(word) {
    const out = [];
    const lists = this.opts().langs.map(l => this.engines.get(l)).filter(Boolean).map(E => E.suggest(word, 6));
    for (let i = 0; i < 6; i++) for (const L of lists) if (L[i] && !out.includes(L[i])) out.push(L[i]);
    return out.slice(0, 6);
  },
  /* Einträge für das Kontextmenü der Seite (oder null) */
  posAt(x, y) {
    if (document.caretRangeFromPoint) { const r = document.caretRangeFromPoint(x, y); if (r) return [r.startContainer, r.startOffset]; }
    else if (document.caretPositionFromPoint) { const p = document.caretPositionFromPoint(x, y); if (p) return [p.offsetNode, p.offset]; }
    return null;
  },
  menuFor(x, y, boxId) {
    if (typeof Grammar !== 'undefined') { const g = Grammar.menuFor(this.posAt(x, y), boxId); if (g) return g; }   // 1.66
    if (!this.active()) return null;
    const hit = this.hitAt(x, y, boxId);
    if (!hit) return null;
    const sug = this.suggest(hit.word);
    return [
      { head: `„${hit.word}“ ist nicht im Wörterbuch` },
      ...(sug.length ? sug.map(s => ({ label: s, icon: 'spellcheck', action: () => this.replace(hit, s) })) : [{ label: '(keine Vorschläge)', disabled: true }]),
      { label: 'Ignorieren', icon: 'x', action: () => { this.ignoreOnce.add(`${hit.box}|${hit.word}|${hit.off}`); this.queue.add(hit.box); this.pump(); } },
      { label: 'Alle ignorieren', icon: 'x', action: () => this.ignoreWord(hit.word) },
      { label: 'Zum Wörterbuch hinzufügen', icon: 'bookPlus', action: () => this.addWord(hit.word) },
      { label: 'Rechtschreibprüfung …', icon: 'spellcheck', key: 'F7', action: () => this.panel() },
      '-',
    ];
  },
  /* Wort im Text ersetzen – Formatierung bleibt (nur der Text des Wortes ändert sich), Strg+Z macht es rückgängig */
  replace(hit, text, opts = {}) {
    const b = Canvas.box(hit.box), e = Canvas.els.get(hit.box), t = e && e.querySelector('.box-text');
    if (!b || !t || Canvas.isLocked(b) || Store.readOnly) return false;
    const r = hit.range;
    if (!t.contains(r.startContainer)) return false;
    if (r.startContainer === r.endContainer && r.startContainer.nodeType === 3) {
      const n = r.startContainer;
      n.data = n.data.slice(0, r.startOffset) + text + n.data.slice(r.endOffset);
    } else { r.deleteContents(); r.insertNode(document.createTextNode(text)); t.normalize(); }
    b.html = boxHtml(t);
    e._html = b.html;
    Hist.touchPage(Canvas.pageId);
    if (!opts.batch) Hist.commit('Rechtschreibung: „' + hit.word + '“ → „' + text + '“');
    Canvas.layoutSoon();
    this.queue.add(hit.box);
    this.pumpSoon();
    return true;
  },
  ignoreWord(w) { this.ignoreAll.add(w.toLowerCase()); this.wrong.clear(); this.rescanAll(); },
  addWord(w) {
    const o = this.opts();
    if (!o.user.some(x => x.toLowerCase() === w.toLowerCase())) o.user = [...o.user, w].sort((a, b) => a.localeCompare(b, 'de'));
    Store.ui.spell = o;
    UiState.saveSoon();
    for (const E of this.engines.values()) E.cache.clear();
    this.wrong.clear();
    this.rescanAll();
    UI.toast(`„${w}“ ist jetzt im eigenen Wörterbuch`, 2500);
  },

  /* ---------------------------------------------------------- F7: Seite Wort für Wort (wie OneNote) */
  async panel() {
    if (!Canvas.page) { UI.toast('Zuerst eine Seite öffnen'); return; }
    const o = this.opts();
    if (!o.on) { o.on = true; UiState.saveSoon(); }
    if (!this.panelEl) this.buildPanel();
    const P = this.panelEl;
    P.hidden = false;
    this._pos = null;
    if (!this.active()) {
      P.querySelector('.sp-body').innerHTML = '<div class="sp-msg">Wörterbücher werden geladen …</div>';
      await this.ensure(true);
      if (!this.active()) { P.querySelector('.sp-body').innerHTML = `<div class="sp-msg">Die Wörterbücher konnten nicht geladen werden (${escapeHtml([...this.failed.values()][0] || 'keine Verbindung')}). Beim ersten Mal braucht es eine Internetverbindung – danach geht es auch ohne.</div>`; return; }
    }
    Canvas.stopEditing();
    this.panelNext(true);
  },
  buildPanel() {
    const P = el('div', { class: 'sp-panel', role: 'dialog', 'aria-label': 'Rechtschreibung' });
    P.innerHTML = `<div class="sp-head"><span class="sp-ic">${icon('spellcheck', 15)}</span><b>Rechtschreibung</b><button class="sp-x" data-act="close" title="Schliessen (Esc)">×</button></div><div class="sp-body"></div>`;
    document.body.append(P);
    this.panelEl = P;
    P.addEventListener('click', (e) => { const b = e.target.closest('[data-act]'); if (b && !b.disabled) this.panelAct(b.dataset.act, b); });
    P.addEventListener('dblclick', (e) => { if (e.target.closest('.sp-sug')) this.panelAct('change'); });
    P.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Escape') this.panelClose(); if (e.key === 'Enter' && e.target.matches('.sp-in')) { e.preventDefault(); this.panelAct('change'); } });
    P.querySelector('.sp-head').addEventListener('pointerdown', (e) => {
      if (e.target.closest('button')) return;
      e.preventDefault();
      const r = P.getBoundingClientRect(), sx = e.clientX, sy = e.clientY;
      const mv = (ev) => { P.style.left = clamp(r.left + ev.clientX - sx, -r.width + 80, innerWidth - 80) + 'px'; P.style.top = clamp(r.top + ev.clientY - sy, 0, innerHeight - 40) + 'px'; P.style.right = 'auto'; };
      const up = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); };
      addEventListener('pointermove', mv); addEventListener('pointerup', up);
    });
  },
  /* alle Fehler der Seite in Lesereihenfolge (Felder von oben nach unten, links nach rechts) */
  pageList() {
    if (!Canvas.page) return [];
    for (const b of Canvas.page.boxes) this.scanBox(b.id);
    this.queue.clear();
    const order = Canvas.page.boxes.slice().sort((a, b) => (a.y - b.y) || (a.x - b.x)).map(b => b.id);
    const out = [];
    order.forEach((id, k) => { for (const it of this.boxes.get(id) || []) out.push({ ...it, box: id, k }); });
    return out;
  },
  panelNext(first) {
    const list = this.pageList();
    const pos = this._pos;
    const it = list.find(x => !pos || x.k > pos.k || (x.k === pos.k && x.off >= pos.off));
    this.panelShow(it || null, first);
  },
  panelShow(it, first) {
    const P = this.panelEl, body = P.querySelector('.sp-body');
    this._it = it;
    if (this.cur) this.cur.clear();
    const langs = this.opts().langs.map(l => SPELL_LANGS[l].label).join(' · ');
    if (!it) {
      body.innerHTML = `<div class="sp-done">${icon('check', 18)}<span>${first ? 'Keine Fehler auf dieser Seite.' : 'Die Rechtschreibprüfung ist abgeschlossen.'}</span></div><div class="sp-lang">Geprüft: ${escapeHtml(langs)}${this.opts().fach ? ' · Fachwörter' : ''}</div><div class="sp-btns"><button class="btn primary" data-act="close">Schliessen</button></div>`;
      return;
    }
    if (this.cur) this.cur.add(it.range);
    Canvas.revealBox(it.box);
    const sug = this.suggest(it.word);
    // Satz um das Wort herum
    const t = Canvas.els.get(it.box).querySelector('.box-text'), map = this.textMap(t);
    const a = Math.max(0, it.off - 40), z = Math.min(map.text.length, it.off + it.word.length + 40);
    const ctx = escapeHtml((a ? '…' : '') + map.text.slice(a, it.off).replace(/\s+/g, ' ')) + `<mark>${escapeHtml(it.word)}</mark>` + escapeHtml(map.text.slice(it.off + it.word.length, z).replace(/\s+/g, ' ') + (z < map.text.length ? '…' : ''));
    body.innerHTML = `<div class="sp-lab">Nicht im Wörterbuch:</div><div class="sp-ctx">${ctx}</div>
      <div class="sp-lab">Vorschläge:</div><div class="sp-sugs">${sug.length ? sug.map((s, i) => `<button class="sp-sug${i ? '' : ' on'}" data-act="pick" data-w="${escapeHtml(s)}">${escapeHtml(s)}</button>`).join('') : '<span class="sp-none">keine Vorschläge – unten selbst schreiben</span>'}</div>
      <input class="sp-in" spellcheck="false" value="${escapeHtml(sug[0] || it.word)}" aria-label="Ändern in">
      <div class="sp-btns"><button class="btn primary" data-act="change">Ändern</button><button class="btn" data-act="changeAll">Alle ändern</button><button class="btn" data-act="skip">Ignorieren</button><button class="btn" data-act="skipAll">Alle ignorieren</button><button class="btn" data-act="add">Hinzufügen</button></div>
      <div class="sp-lang">Sprachen: ${escapeHtml(langs)}${this.opts().fach ? ' · Fachwörter' : ''} · <button class="sp-link" data-act="settings">ändern</button></div>`;
    if (first || !P.contains(document.activeElement)) P.querySelector('.sp-in').focus({ preventScroll: true });
  },
  panelRefreshSoon() { clearTimeout(this._prT); this._prT = setTimeout(() => { if (this._it && !this._it.range.toString()) this.panelNext(); }, 200); },
  panelAct(a, btn) {
    const it = this._it, P = this.panelEl;
    if (a === 'close') { this.panelClose(); return; }
    if (a === 'settings') { this.panelClose(); Settings.show('sprache'); return; }
    if (!it) return;
    const inp = P.querySelector('.sp-in');
    this._panelBusy = true;
    try {
      if (a === 'pick') { P.querySelectorAll('.sp-sug').forEach(b => b.classList.toggle('on', b === btn)); inp.value = btn.dataset.w; return; }
      if (a === 'change') { const w = inp.value.trim(); if (w) this.replace(it, w); this._pos = { k: it.k, off: it.off + w.length }; }
      else if (a === 'changeAll') {
        const w = inp.value.trim();
        if (w) {
          let n = 0;
          for (const x of this.pageList().filter(x => x.word === it.word).reverse()) if (this.replace(x, w, { batch: true })) n++;
          Hist.commit(`Rechtschreibung: ${n}× „${it.word}“ → „${w}“`);
        }
        this._pos = { k: it.k, off: it.off + (w || it.word).length };
      } else if (a === 'skip') { this.ignoreOnce.add(`${it.box}|${it.word}|${it.off}`); this._pos = { k: it.k, off: it.off + 1 }; }
      else if (a === 'skipAll') { this.ignoreWord(it.word); this._pos = { k: it.k, off: it.off }; }
      else if (a === 'add') { this.addWord(it.word); this._pos = { k: it.k, off: it.off }; }
      this.panelNext();
    } finally { this._panelBusy = false; }
  },
  panelClose() { if (this.panelEl) this.panelEl.hidden = true; if (this.cur) this.cur.clear(); this._it = null; },

  /* ---------------------------------------------------------- Einstellungen */
  setOpts(ch) {
    const o = { ...this.opts(), ...ch };
    Store.ui.spell = o;
    UiState.saveSoon();
    this.wrong.clear();
    if (ch.fach !== undefined) for (const E of this.engines.values()) E.cache.clear();
    if (o.on) this.ensure(); else { this.rescanAll(); this.applyNative(); }
    if (typeof Ribbon !== 'undefined') Ribbon.refreshSoon();
  },
  toggleLang(l) {
    const o = this.opts();
    const langs = o.langs.includes(l) ? o.langs.filter(x => x !== l) : [...o.langs, l];
    if (!langs.length) { UI.toast('Mindestens eine Sprache muss gewählt sein'); return; }
    this.setOpts({ langs });
  },
  langMenu(anchor) {
    const o = this.opts();
    UI.menu([{ head: 'Prüfen in …' }, ...Object.entries(SPELL_LANGS).map(([k, v]) => ({ label: v.label + (v.custom ? ' (eigenes)' : '') + (this.failed.has(k) && o.langs.includes(k) ? ' (nicht geladen)' : ''), checked: o.langs.includes(k), action: () => this.toggleLang(k) })),
      '-', { label: 'Wörterbuch hinzufügen … (.aff + .dic / .oxt)', icon: 'bookPlus', action: () => this.addDictionary().catch(e => UI.toast(e.message, 5000)) },
      ...Object.entries(SPELL_LANGS).filter(([, v]) => v.custom).map(([k, v]) => ({ label: `„${v.label}“ entfernen`, icon: 'trash', action: () => this.removeDictionary(k) })),
      '-', { label: 'Fachwörter (Naturwissenschaften, Mathematik, Medizin, Informatik)', checked: o.fach, action: () => this.setOpts({ fach: !o.fach }) }], 0, 0, { anchor });
  },
  status() {
    const o = this.opts();
    return o.langs.map(l => `${SPELL_LANGS[l].label}: ${this.engines.has(l) ? `bereit (${this.engines.get(l).words.size.toLocaleString('de-CH')} Stämme)` : this.loading.has(l) ? 'wird geladen …' : this.failed.has(l) ? 'nicht geladen – ' + this.failed.get(l) : 'noch nicht geladen'}`).join('\n');
  },
  /* eigenes Wörterbuch bearbeiten */
  userDialog() {
    const o = this.opts();
    UI.dialog((d, close) => {
      const ta = el('textarea', { class: 'sp-user', spellcheck: 'false', rows: '12' });
      ta.value = o.user.join('\n');
      d.append(el('h2', { text: 'Eigenes Wörterbuch' }), el('p', { class: 'dlg-note', text: 'Ein Wort pro Zeile. Diese Wörter gelten in allen Sprachen als richtig (auch mit den üblichen Endungen).' }), ta,
        el('div', { class: 'dlg-btns' }, el('button', { class: 'btn', text: 'Abbrechen', onclick: () => close(false) }), el('button', { class: 'btn primary', text: 'Speichern', onclick: () => {
          const list = [...new Set(ta.value.split(/[\n,;]+/).map(x => x.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'de'));
          this.setOpts({ user: list });
          for (const E of this.engines.values()) E.cache.clear();
          close(true);
        } })));
      setTimeout(() => ta.focus(), 0);
    });
  },
  async reload() {
    await this.idb('clear');
    this._fresh = true;
    this.engines.clear(); this.failed.clear(); this.wrong.clear();
    await this.ensure();
    this._fresh = false;
    UI.toast(this.status().replace(/\n/g, ' · '), 5000);
  },
};
