'use strict';
/* Excel-Seiten wie Excel (1.67) – ergänzt office-xl.js (Datei) und sheet.js (Rechentabelle).
 *
 *  - Unendliches Raster: das Blatt wächst beim Scrollen und beim Weitergehen mit den Pfeiltasten (bis 10’000 Zeilen,
 *    200 Spalten); Spalten- und Zeilenköpfe bleiben oben bzw. links stehen (CSS-Variablen --hx/--hy am Blatt);
 *    links/oben endet die Fläche am Blatt (wie Excel: A1 oben links).
 *  - Die Tabelle ist auf diesem Seitentyp fest: nicht löschbar, nicht verschiebbar; Textfelder liegen darüber.
 *  - Fenster fixieren (oberste Zeile, erste Spalte, bei der Zelle) → <pane state="frozen">.
 *  - Bedingte Formatierung (grösser/kleiner/zwischen/gleich, Text enthält, doppelte Werte, obere/untere 10,
 *    Farbskalen, Datenbalken) → <conditionalFormatting> + dxf.
 *  - Rahmenlinien, Duplikate entfernen, Text in Spalten.
 *  - Zellformate (fett, kursiv, unterstrichen, durchgestrichen, Farben, Grösse, Ausrichtung, Zahlenformat, Rahmen)
 *    werden aus styles.xml gelesen und geänderte als neue Zellformate (cellXfs) zurückgeschrieben. */
const OfficeGrid = {
  MAXR: 10000, MAXC: 200,
  page() { const p = Canvas.page; return p && p.type === 'tab' && p.office && p.office.asset ? p : null; },
  endless(id) { const p = this.page(), b = p && Canvas.box(id); return !!(b && b.sheet && b.ox && b.ox.k === 'xl'); },
  /* feste Teile einer Office-Seite: Excel-Blatt, Word-Schreibbereich/Blätter/Kopfzeile, Folie */
  isFixed(b) {
    const p = Canvas.page;
    if (!p || !p.office || !p.office.asset || !b || !b.ox) return false;
    return (p.type === 'tab' && !!b.sheet && b.ox.k === 'xl') || (p.type === 'dok' && /^(w|hf|blatt)$/.test(b.ox.k)) || b.ox.k === 'folie';
  },
  cur() { const p = this.page(), id = p && OfficeView.curSheet(p), b = id && Canvas.box(id); return b ? { p, b, e: Canvas.els.get(b.id) } : null; },

  /* ---------------------------------------------------------------- Ansicht: Grenzen, Köpfe, Wachsen */
  /* vor jedem Zeichnen (Canvas.applyView): nicht über A1 hinaus nach links/oben, Köpfe mitführen */
  clamp(v) {
    const c = this.cur();
    if (!c) return;
    v.z = Math.max(0.3, v.z);
    const X0 = c.b.x - 35, Y0 = c.b.y - 7;
    v.x = Math.min(v.x, -X0 * v.z); v.y = Math.min(v.y, -Y0 * v.z);
    if (c.e) {
      const hx = Math.max(0, -v.x / v.z - X0), hy = Math.max(0, -v.y / v.z - Y0);
      c.e.style.setProperty('--hx', hx.toFixed(2) + 'px'); c.e.style.setProperty('--hy', hy.toFixed(2) + 'px');
      const moved = Math.abs((c.e._hx || 0) - hx) > 0.01 || Math.abs((c.e._hy || 0) - hy) > 0.01;
      c.e._hx = hx; c.e._hy = hy;
      // fixierte Bereiche (1.71): Auswahl dort mitführen
      if (moved && c.b.sheet.freeze && Sheet.active && Sheet.active.id === c.b.id) Sheet.overlay(c.b, c.e);
    }
  },
  /* nach dem Zeichnen: fehlen Zeilen/Spalten bis zum Fensterrand, wächst das Blatt */
  onView() {
    const c = this.cur();
    if (!c || !c.e || Store.readOnly) return;
    const v = Canvas.view, z = v.z, R = c.e._rows || [], C = c.e._cols || [];
    if (!R.length || !C.length) return;
    const bottomW = (Canvas.vp.clientHeight - v.y) / z, rightW = (Canvas.vp.clientWidth - v.x) / z;
    const gBottom = c.b.y + 13 + R[R.length - 1][0] + R[R.length - 1][1], gRight = c.b.x + 1 + C[C.length - 1][0] + C[C.length - 1][1];
    const dr = gBottom < bottomW + 120 ? Math.min(400, Math.ceil((bottomW + 500 - gBottom) / 25)) : 0;
    const dc = gRight < rightW + 80 ? Math.min(40, Math.ceil((rightW + 300 - gRight) / 96)) : 0;
    if (dr || dc) this.grow(c.b.id, dr, dc);
  },
  grow(id, dr, dc) {
    const b = Canvas.box(id), d = b && b.sheet;
    if (!d) return false;
    const nr = Math.min(this.MAXR, d.nrows + Math.max(0, dr | 0)), nc = Math.min(this.MAXC, d.ncols + Math.max(0, dc | 0));
    if (nr === d.nrows && nc === d.ncols) return false;
    const n0 = d.cols.length;
    d.nrows = nr; d.ncols = nc;
    XL.normSheet(d);
    if (d.xl && d.xl.cw) for (let i = n0; i < d.cols.length; i++) d.cols[i] = d.xl.cw;   // Standardbreite der Mappe (1.71)
    Canvas.render();
    Save.dirty.add(Canvas.pageId); Save.schedule();
    return true;
  },

  /* ---------------------------------------------------------------- Fenster fixieren */
  freeze(kind) {
    const a = Sheet.active, b = a && Canvas.box(a.id), d = b && b.sheet;
    if (!d || Store.readOnly) return;
    if (kind === 'off') delete d.freeze;
    else if (kind === 'row') d.freeze = { r: 1, c: 0 };
    else if (kind === 'col') d.freeze = { r: 0, c: 1 };
    else d.freeze = { r: a.r, c: a.c };
    if (d.freeze && !d.freeze.r && !d.freeze.c) delete d.freeze;
    Sheet.bump(); Canvas.render(true);
    Hist.touchPage(Canvas.pageId); Hist.commit(kind === 'off' ? 'Fixierung aufgehoben' : 'Fenster fixiert');
    Ribbon.refresh();
  },
  /* Klassen einer Zelle für fixierte Zeilen/Spalten */
  fzClass(d, c, r) {
    const f = d.freeze;
    if (!f) return '';
    let s = '';
    if (r < f.r) s += ' xl-fzr' + (r === f.r - 1 ? ' xl-fzrl' : '');
    if (c < f.c) s += ' xl-fzc' + (c === f.c - 1 ? ' xl-fzcl' : '');
    return s;
  },

  /* ---------------------------------------------------------------- Rahmenlinien */
  BORDERS: [['b', 'Rahmenlinie unten', 'alBottom'], ['t', 'Rahmenlinie oben', 'alTop'], ['l', 'Rahmenlinie links', 'alLeft'], ['r', 'Rahmenlinie rechts', 'alRight'], '-',
    ['none', 'Kein Rahmen', 'x'], ['all', 'Alle Rahmenlinien', 'border'], ['out', 'Rahmenlinien aussen', 'shRect'], ['thick', 'Dicke Rahmenlinie aussen', 'shRect'], ['B', 'Doppelte/dicke Linie unten', 'alBottom']],
  setBorder(kind) {
    const s = Sheet.sel();
    if (!s) return;
    Sheet.formatSel((f, c, r) => {
      let bd = f.bd || '';
      const add = (ch) => { if (!bd.includes(ch)) bd += ch; };
      if (kind === 'none') bd = '';
      else if (kind === 'all') { bd = bd.replace(/[tlbrTLBR]/g, ''); bd += 'tlbr'; }
      else if (kind === 'out' || kind === 'thick') {
        const T = kind === 'thick';
        if (r === s.r1) add(T ? 'T' : 't'); if (r === s.r2) add(T ? 'B' : 'b'); if (c === s.c1) add(T ? 'L' : 'l'); if (c === s.c2) add(T ? 'R' : 'r');
      } else if (kind === 'B') { if (r === s.r2) { bd = bd.replace('b', ''); add('B'); } }
      else if (kind === 'b') { if (r === s.r2) add('b'); } else if (kind === 't') { if (r === s.r1) add('t'); }
      else if (kind === 'l') { if (c === s.c1) add('l'); } else if (kind === 'r') { if (c === s.c2) add('r'); }
      f.bd = [...new Set(bd)].join('') || null;
    }, 'Rahmenlinien');
  },
  borderCss(bd) {
    if (!bd) return '';
    let s = '';
    for (const [k, side] of [['t', 'top'], ['b', 'bottom'], ['l', 'left'], ['r', 'right']]) {
      if (bd.includes(k.toUpperCase())) s += `border-${side}:2.5px solid var(--auto-ink, #000);`;
      else if (bd.includes(k)) s += `border-${side}:1px solid var(--auto-ink, #000);`;
    }
    return s;
  },

  /* ---------------------------------------------------------------- Bedingte Formatierung */
  STYLES: { rot: ['#FFC7CE', '#9C0006', 'Hellrote Füllung mit dunkelrotem Text'], gelb: ['#FFEB9C', '#9C5700', 'Gelbe Füllung mit dunkelgelbem Text'], gruen: ['#C6EFCE', '#006100', 'Grüne Füllung mit dunkelgrünem Text'], rotT: [null, '#C00000', 'Roter Text'], rotF: ['#FF9999', null, 'Hellrote Füllung'] },
  SCALES: { gyr: ['Grün – Gelb – Rot', '#63BE7B', '#FFEB84', '#F8696B'], ryg: ['Rot – Gelb – Grün', '#F8696B', '#FFEB84', '#63BE7B'], wb: ['Weiss – Blau', '#FFFFFF', null, '#5A8AC6'], wr: ['Weiss – Rot', '#FFFFFF', null, '#F8696B'] },
  BARS: { blau: ['Blau', '#638EC6'], gruen: ['Grün', '#63BE7B'], rot: ['Rot', '#FF555A'], orange: ['Orange', '#FFB628'] },
  RULES: [['gt', 'Grösser als …'], ['lt', 'Kleiner als …'], ['between', 'Zwischen …'], ['eq', 'Gleich …'], ['text', 'Textinhalt …'], ['dup', 'Doppelte Werte …'], ['top', 'Obere 10 Elemente …'], ['bottom', 'Untere 10 Elemente …']],
  cfMenu(anchor) {
    const a = Sheet.active;
    if (!a) { UI.toast('Zuerst Zellen markieren'); return; }
    UI.menu([{ head: 'Regeln zum Hervorheben von Zellen' }, ...this.RULES.map(([t, l]) => ({ label: l, action: () => this.cfDialog(t) })),
      '-', { head: 'Farbskalen' }, ...Object.entries(this.SCALES).map(([k, s]) => ({ label: s[0], action: () => this.cfAdd({ t: 'scale', s: k }) })),
      '-', { head: 'Datenbalken' }, ...Object.entries(this.BARS).map(([k, s]) => ({ label: s[0], action: () => this.cfAdd({ t: 'bar', s: k }) })),
      '-', { label: 'Regeln aus markierten Zellen löschen', icon: 'eraser', action: () => this.cfClear(false) }, { label: 'Regeln aus dem ganzen Blatt löschen', icon: 'trash', action: () => this.cfClear(true) },
      { label: 'Regeln verwalten …', icon: 'settings', action: () => this.cfManage() }], 0, 0, { anchor });
  },
  cfDialog(t) {
    const label = (this.RULES.find(x => x[0] === t) || [0, ''])[1].replace(' …', '');
    UI.dialog((dlg, close) => {
      dlg.append(el('h2', { text: label }));
      const hint = { gt: 'Zellen formatieren, die GRÖSSER SIND ALS:', lt: 'Zellen formatieren, die KLEINER SIND ALS:', between: 'Zellen formatieren, die ZWISCHEN diesen Werten liegen:', eq: 'Zellen formatieren, die GLEICH sind wie:', text: 'Zellen formatieren, die diesen TEXT ENTHALTEN:', dup: 'Zellen formatieren, die doppelte Werte enthalten.', top: 'Die obersten Elemente formatieren (Anzahl):', bottom: 'Die untersten Elemente formatieren (Anzahl):' }[t];
      dlg.append(el('p', { text: hint }));
      const a = el('input', { type: 'text', class: 'cf-in', value: t === 'top' || t === 'bottom' ? '10' : '' });
      const b = el('input', { type: 'text', class: 'cf-in', value: '' });
      const row = el('div', { class: 'cf-row' });
      if (t !== 'dup') row.append(a);
      if (t === 'between') row.append(el('span', { text: ' und ' }), b);
      const sel = el('select', { class: 'cf-sel' }, ...Object.entries(this.STYLES).map(([k, s]) => el('option', { value: k, text: s[2] })));
      row.append(el('span', { text: ' mit ' }), sel);
      dlg.append(row);
      const ok = el('button', { class: 'btn primary', type: 'button', text: 'OK' });
      ok.addEventListener('click', () => {
        const r = { t, a: a.value.trim(), b: b.value.trim(), st: sel.value };
        if (t !== 'dup' && !r.a) { a.focus(); return; }
        if (t === 'between' && !r.b) { b.focus(); return; }
        close(); this.cfAdd(r);
      });
      dlg.append(el('div', { class: 'dlg-btns' }, el('button', { class: 'btn', type: 'button', text: 'Abbrechen', onclick: () => close() }), ok));
      setTimeout(() => (t === 'dup' ? sel : a).focus(), 30);
    });
  },
  cfAdd(rule) {
    const a = Sheet.active, b = a && Canvas.box(a.id), d = b && b.sheet;
    if (!d || Store.readOnly) return;
    const s = Sheet.sel();
    rule.ref = XL.rangeText(s.c1, s.r1, s.c2, s.r2);
    (d.cf || (d.cf = [])).push(rule);
    Sheet.bump(); Canvas.render(true); Sheet.refreshUi();
    Hist.touchPage(Canvas.pageId); Hist.commit('Bedingte Formatierung');
  },
  cfClear(all) {
    const a = Sheet.active, b = a && Canvas.box(a.id), d = b && b.sheet;
    if (!d || !d.cf) return;
    const s = Sheet.sel();
    d.cf = all ? [] : d.cf.filter(r => { const g = XL.parseRange(r.ref); return !g || g.c2 < s.c1 || g.c1 > s.c2 || g.r2 < s.r1 || g.r1 > s.r2; });
    if (!d.cf.length) delete d.cf;
    Sheet.bump(); Canvas.render(true);
    Hist.touchPage(Canvas.pageId); Hist.commit('Regeln gelöscht');
  },
  cfName(r) {
    const v = (x) => x;
    switch (r.t) {
      case 'gt': return 'Zellwert > ' + v(r.a); case 'lt': return 'Zellwert < ' + v(r.a); case 'eq': return 'Zellwert = ' + v(r.a);
      case 'between': return `Zellwert zwischen ${r.a} und ${r.b}`; case 'text': return `Text enthält „${r.a}“`; case 'dup': return 'Doppelte Werte';
      case 'top': return `Obere ${r.a}`; case 'bottom': return `Untere ${r.a}`;
      case 'scale': return 'Farbskala ' + (this.SCALES[r.s] || [''])[0]; case 'bar': return 'Datenbalken ' + (this.BARS[r.s] || [''])[0];
    }
    return r.t;
  },
  cfManage() {
    const a = Sheet.active, b = a && Canvas.box(a.id), d = b && b.sheet;
    if (!d) return;
    UI.dialog((dlg, close) => {
      dlg.append(el('h2', { text: 'Regeln der bedingten Formatierung' }));
      const list = el('div', { class: 'ai-list' });
      const draw = () => {
        list.innerHTML = '';
        if (!(d.cf || []).length) list.append(el('p', { class: 'ai-empty', text: 'Keine Regeln in diesem Blatt.' }));
        (d.cf || []).forEach((r, i) => {
          const del = el('button', { class: 'btn small', type: 'button', text: 'Löschen' });
          del.addEventListener('click', () => { d.cf.splice(i, 1); if (!d.cf.length) delete d.cf; Sheet.bump(); Canvas.render(true); Hist.touchPage(Canvas.pageId); Hist.commit('Regel gelöscht'); draw(); });
          const st = this.STYLES[r.st];
          const sw = el('span', { class: 'cf-sw', text: 'AaBbCc' }); if (st) { sw.style.background = st[0] || ''; sw.style.color = st[1] || ''; }
          list.append(el('div', { class: 'ai-row' }, el('div', { class: 'ai-t' }, el('b', { text: this.cfName(r) }), el('small', { text: 'Gilt für ' + r.ref })), st ? sw : el('span'), del));
        });
      };
      draw();
      dlg.append(list, el('div', { class: 'dlg-btns' }, el('button', { class: 'btn', type: 'button', text: 'Schliessen', onclick: () => close() })));
    }, { wide: true });
  },
  /* Anzeige: einmal je Zeichnen vorbereiten (Min/Max, Duplikate, Rangfolge), dann je Zelle → CSS */
  cfPrep(d, val) {
    const rules = (d.cf || []).map(r => ({ r, g: XL.parseRange(r.ref) })).filter(x => x.g);
    if (!rules.length) return null;
    const num = (s) => { const p = XL.parseInput(String(s)); return typeof p.v === 'number' ? p.v : s; };
    for (const x of rules) {
      const { g, r } = x;
      if (/^(scale|bar|dup|top|bottom)$/.test(r.t)) {
        const vals = [];
        for (let rr = g.r1; rr <= Math.min(g.r2, d.nrows - 1); rr++) for (let cc = g.c1; cc <= Math.min(g.c2, d.ncols - 1); cc++) { const v = val(cc, rr); if (v !== null && v !== '' && v !== undefined) vals.push(v); }
        const nums = vals.filter(v => typeof v === 'number');
        x.min = nums.length ? Math.min(...nums) : 0; x.max = nums.length ? Math.max(...nums) : 0;
        if (r.t === 'dup') { const cnt = new Map(); for (const v of vals) { const k = typeof v === 'string' ? v.toLowerCase() : String(v); cnt.set(k, (cnt.get(k) || 0) + 1); } x.cnt = cnt; }
        if (r.t === 'top' || r.t === 'bottom') { const n = Math.max(1, +r.a || 10); const sorted = nums.slice().sort((p, q) => r.t === 'top' ? q - p : p - q); x.lim = sorted[Math.min(n, sorted.length) - 1]; }
      }
      x.a = num(r.a); x.b = num(r.b);
    }
    const mix = (c1, c2, t) => { const a = Contrast.rgb(c1), b = Contrast.rgb(c2); return `rgb(${[0, 1, 2].map(i => Math.round(a[i] + (b[i] - a[i]) * t)).join(',')})`; };
    return (c, r, v) => {
      let css = '';
      for (const x of rules) {
        const { g, r: rule } = x;
        if (c < g.c1 || c > g.c2 || r < g.r1 || r > g.r2 || v === null || v === undefined || v === '') continue;
        let hit = false;
        switch (rule.t) {
          case 'gt': hit = typeof v === 'number' && typeof x.a === 'number' ? v > x.a : String(v) > String(x.a); break;
          case 'lt': hit = typeof v === 'number' && typeof x.a === 'number' ? v < x.a : String(v) < String(x.a); break;
          case 'eq': hit = typeof v === 'number' ? v === x.a : String(v).toLowerCase() === String(x.a).toLowerCase(); break;
          case 'between': { const lo = Math.min(x.a, x.b), hi = Math.max(x.a, x.b); hit = typeof v === 'number' && v >= lo && v <= hi; break; }
          case 'text': hit = String(v).toLowerCase().includes(String(rule.a).toLowerCase()); break;
          case 'dup': hit = (x.cnt.get(typeof v === 'string' ? v.toLowerCase() : String(v)) || 0) > 1; break;
          case 'top': hit = typeof v === 'number' && x.lim != null && v >= x.lim; break;
          case 'bottom': hit = typeof v === 'number' && x.lim != null && v <= x.lim; break;
          case 'scale': {
            if (typeof v !== 'number') break;
            const s = this.SCALES[rule.s] || this.SCALES.gyr, t = x.max > x.min ? (v - x.min) / (x.max - x.min) : 0.5;
            const col = s[2] ? (t < 0.5 ? mix(s[3], s[2], t * 2) : mix(s[2], s[1], (t - 0.5) * 2)) : mix(s[1], s[3], t);
            css += `background:${col};color:#000;`; continue;
          }
          case 'bar': {
            if (typeof v !== 'number') break;
            const s = this.BARS[rule.s] || this.BARS.blau, lo = Math.min(0, x.min), t = x.max > lo ? (v - lo) / (x.max - lo) : 1;
            css += `background:linear-gradient(90deg, ${s[1]}cc 0, ${s[1]}55 ${Math.round(t * 100)}%, transparent ${Math.round(t * 100)}%);`; continue;
          }
        }
        if (hit) { const st = this.STYLES[rule.st] || this.STYLES.rot; if (st[0]) css += `background:${st[0]};`; if (st[1]) css += `color:${st[1]};`; }
      }
      return css;
    };
  },

  /* ---------------------------------------------------------------- Daten: Duplikate entfernen, Text in Spalten */
  region() {
    const a = Sheet.active;
    if (!a) return null;
    let s = Sheet.sel();
    if (s.c1 === s.c2 && s.r1 === s.r2 && Sheet.region) { const g = Sheet.region(a.id, a.c, a.r); if (g) s = g; }
    return s;
  },
  async removeDuplicates() {
    const a = Sheet.active, b = a && Canvas.box(a.id), d = b && b.sheet;
    if (!d || Store.readOnly) return;
    const s = this.region();
    if (!s) return;
    const raw = (c, r) => Sheet.raw(d, c, r);
    const head = d.head || ([...Array(s.c2 - s.c1 + 1).keys()].every(i => { const v = raw(s.c1 + i, s.r1); return v && typeof XL.parseInput(v).v === 'string'; }) && s.r2 > s.r1 && [...Array(s.c2 - s.c1 + 1).keys()].some(i => typeof XL.parseInput(raw(s.c1 + i, s.r1 + 1)).v === 'number'));
    const r0 = head ? s.r1 + 1 : s.r1;
    const seen = new Set(), keep = [];
    for (let r = r0; r <= s.r2; r++) {
      const row = []; for (let c = s.c1; c <= s.c2; c++) row.push(raw(c, r));
      const k = row.map(x => x.toLowerCase()).join('\u0001');
      if (row.every(x => x === '')) continue;
      if (seen.has(k)) continue;
      seen.add(k); keep.push(row);
    }
    const total = s.r2 - r0 + 1 - [...Array(s.r2 - r0 + 1).keys()].filter(i => { for (let c = s.c1; c <= s.c2; c++) if (raw(c, r0 + i) !== '') return false; return true; }).length;
    const removed = total - keep.length;
    if (!removed) { UI.info('Duplikate entfernen', '<p>Es wurden keine doppelten Werte gefunden.</p>'); return; }
    const list = [];
    for (let r = r0; r <= s.r2; r++) { const row = keep[r - r0]; for (let c = s.c1; c <= s.c2; c++) list.push([c, r, row ? row[c - s.c1] : '']); }
    Sheet.setCells(a.id, list, 'Duplikate entfernt');
    UI.info('Duplikate entfernen', `<p>${removed} doppelte Werte gefunden und entfernt; ${keep.length} eindeutige Werte bleiben.${head ? ' (Erste Zeile als Überschrift behandelt.)' : ''}</p>`);
  },
  async textToColumns() {
    const a = Sheet.active, b = a && Canvas.box(a.id), d = b && b.sheet;
    if (!d || Store.readOnly) return;
    const s = Sheet.sel();
    if (s.c1 !== s.c2) { UI.toast('Bitte nur eine Spalte markieren'); return; }
    const sep = await UI.prompt('Trennzeichen (z.B. ;  ,  |  – Leerzeichen = Leer, Tabulator = Tab)', ';');
    if (sep == null || sep === '') return;
    const SEP = /^leer$/i.test(sep.trim()) ? ' ' : /^tab$/i.test(sep.trim()) ? '\t' : sep;
    const list = [];
    let maxN = 1;
    for (let r = s.r1; r <= s.r2; r++) {
      const parts = Sheet.raw(d, s.c1, r).split(SEP);
      maxN = Math.max(maxN, parts.length);
      parts.forEach((x, i) => list.push([s.c1 + i, r, SEP === ' ' ? x : x.trim()]));
    }
    if (maxN < 2) { UI.toast('Kein Trennzeichen gefunden'); return; }
    if (s.c1 + maxN > d.ncols) { d.ncols = Math.min(this.MAXC, s.c1 + maxN + 2); XL.normSheet(d); }
    Sheet.setCells(a.id, list, 'Text in Spalten');
    UI.toast(`In ${maxN} Spalten aufgeteilt`);
  },

  /* ---------------------------------------------------------------- Zellformate ↔ styles.xml */
  S: 'http://schemas.openxmlformats.org/spreadsheetml/2006/main',
  BUILTIN_FMT: { 0: 'General', 1: '0', 2: '0.00', 3: '#,##0', 4: '#,##0.00', 9: '0%', 10: '0.00%', 11: '0.00E+00', 12: '# ?/?', 13: '# ??/??', 14: 'dd.mm.yyyy', 15: 'd-mmm-yy', 16: 'd-mmm', 17: 'mmm-yy', 18: 'h:mm AM/PM', 19: 'h:mm:ss AM/PM', 20: 'h:mm', 21: 'h:mm:ss', 22: 'dd.mm.yyyy h:mm', 49: '@' },
  argb(e) { const v = e && e.getAttribute('rgb'); return v && /^[0-9A-Fa-f]{8}$/.test(v) ? '#' + v.slice(2).toLowerCase() : v && /^[0-9A-Fa-f]{6}$/.test(v) ? '#' + v.toLowerCase() : null; },
  /* Standard-Palette der indizierten Farben (0–63, wie Excel/BIFF8; 64 = Systemschrift, 65 = Systemhintergrund) */
  PALETTE: ['000000', 'FFFFFF', 'FF0000', '00FF00', '0000FF', 'FFFF00', 'FF00FF', '00FFFF', '000000', 'FFFFFF', 'FF0000', '00FF00', '0000FF', 'FFFF00', 'FF00FF', '00FFFF',
    '800000', '008000', '000080', '808000', '800080', '008080', 'C0C0C0', '808080', '9999FF', '993366', 'FFFFCC', 'CCFFFF', '660066', 'FF8080', '0066CC', 'CCCCFF',
    '000080', 'FF00FF', 'FFFF00', '00FFFF', '800080', '800000', '008080', '0000FF', '00CCFF', 'CCFFFF', 'CCFFCC', 'FFFF99', '99CCFF', 'FF99CC', 'CC99FF', 'FFCC99',
    '3366FF', '33CCCC', '99CC00', 'FFCC00', 'FF9900', 'FF6600', '666699', '969696', '003366', '339966', '003300', '333300', '993300', '993366', '333399', '333333'],
  /* Designfarben der Mappe (theme1.xml) in Excel-Reihenfolge: 0 = lt1, 1 = dk1, 2 = lt2, 3 = dk2, 4–9 = accent1–6, 10/11 = Links */
  async themeColors(pkg) {
    const X = OfficePages, A = Ooxml.NS.a;
    const r = (await pkg.rels(pkg.main)).find(x => /\/theme$/.test(x.type) && pkg.has(x.path));
    const out = ['FFFFFF', '000000', 'E7E6E6', '44546A', '4472C4', 'ED7D31', 'A5A5A5', 'FFC000', '5B9BD5', '70AD47', '0563C1', '954F72'];
    if (!r) return out;
    try {
      const d = await pkg.xml(r.path), cs = X.q(d, A, 'clrScheme')[0];
      if (!cs) return out;
      ['lt1', 'dk1', 'lt2', 'dk2', 'accent1', 'accent2', 'accent3', 'accent4', 'accent5', 'accent6', 'hlink', 'folHlink'].forEach((n, i) => {
        const e = X.kid(cs, A, n), c = e && e.firstElementChild;
        const v = c && (c.getAttribute('lastClr') || c.getAttribute('val'));
        if (v && /^[0-9A-Fa-f]{6}$/.test(v)) out[i] = v.toUpperCase();
      });
    } catch (e) { /* Standardfarben */ }
    return out;
  },
  /* Helligkeit verändern wie Excel (tint −1…1 auf die Luminanz im HLS-Modell) */
  tint(hex, t) {
    if (!t) return '#' + hex.toLowerCase();
    let r = parseInt(hex.slice(0, 2), 16) / 255, g = parseInt(hex.slice(2, 4), 16) / 255, b = parseInt(hex.slice(4, 6), 16) / 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    let h = 0, s = 0, l = (mx + mn) / 2;
    if (mx !== mn) {
      const d = mx - mn;
      s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
      h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
      h /= 6;
    }
    l = t < 0 ? l * (1 + t) : l * (1 - t) + t;
    const f = (p, q, x) => { if (x < 0) x += 1; if (x > 1) x -= 1; return x < 1 / 6 ? p + (q - p) * 6 * x : x < 1 / 2 ? q : x < 2 / 3 ? p + (q - p) * (2 / 3 - x) * 6 : p; };
    if (!s) r = g = b = l;
    else { const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q; r = f(p, q, h + 1 / 3); g = f(p, q, h); b = f(p, q, h - 1 / 3); }
    return '#' + [r, g, b].map(v => Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16).padStart(2, '0')).join('');
  },
  /* Farb-Element (rgb, theme + tint, indexed, auto) → '#rrggbb' oder null; ctx = { theme, palette } */
  colorOf(e, ctx) {
    if (!e || e.getAttribute('auto') === '1') return null;
    const t = +(e.getAttribute('tint') || 0);
    const rgb = e.getAttribute('rgb');
    if (rgb && /^[0-9A-Fa-f]{6,8}$/.test(rgb)) return this.tint(rgb.slice(-6).toUpperCase(), t);
    const th = e.getAttribute('theme');
    if (th != null && ctx && ctx.theme && ctx.theme[+th]) return this.tint(ctx.theme[+th], t);
    const ix = e.getAttribute('indexed');
    if (ix != null) { const i = +ix; if (i === 64) return null; if (i === 65) return null; const pal = (ctx && ctx.palette) || this.PALETTE; return pal[i] ? this.tint(pal[i], t) : null; }
    return null;
  },
  /* styles.xml lesen → Funktion xfIndex → Format-Objekt (f) wie KnowledgeTree es speichert (1.71: Designfarben,
     indizierte Farben, vertikale Ausrichtung, Zeilenumbruch, Schriftart, Einzug); fn.font = Standardschrift der Mappe */
  async readStyles(pkg) {
    const X = OfficePages, S = this.S;
    const r = (await pkg.rels(pkg.main)).find(x => /\/styles$/.test(x.type) && pkg.has(x.path));
    if (!r) { const fn = () => ({}); fn.font = { n: 'Calibri', s: 11 }; return fn; }
    const sd = await pkg.xml(r.path);
    const ctx = { theme: await this.themeColors(pkg), palette: null };
    const ic = X.q(sd, S, 'indexedColors')[0];
    if (ic) { const pal = this.PALETTE.slice(); X.kids(ic, S, 'rgbColor').forEach((e, i) => { const v = e.getAttribute('rgb'); if (v && /^[0-9A-Fa-f]{6,8}$/.test(v)) pal[i] = v.slice(-6).toUpperCase(); }); ctx.palette = pal; }
    const fmts = new Map(X.q(sd, S, 'numFmt').map(n => [+n.getAttribute('numFmtId'), n.getAttribute('formatCode') || '']));
    const fonts = X.kids(X.q(sd, S, 'fonts')[0] || sd.documentElement, S, 'font');
    const fills = X.kids(X.q(sd, S, 'fills')[0] || sd.documentElement, S, 'fill');
    const borders = X.kids(X.q(sd, S, 'borders')[0] || sd.documentElement, S, 'border');
    const xfs = X.kids(X.q(sd, S, 'cellXfs')[0] || sd.documentElement, S, 'xf');
    const val = (p, n) => { const e = p && X.kid(p, S, n); return e ? e.getAttribute('val') : null; };
    const sz0 = +(val(fonts[0], 'sz') || 11), name0 = val(fonts[0], 'name') || 'Calibri';
    const cache = new Map();
    const fn = (i) => {
      i = +i || 0;
      if (cache.has(i)) return cache.get(i);
      const f = {}, xf = xfs[i];
      if (xf) {
        const font = fonts[+xf.getAttribute('fontId') || 0];
        if (font) {
          const on = (n) => { const e = X.kid(font, S, n); return !!e && !/^(0|false)$/.test(e.getAttribute('val') || ''); };
          if (on('b')) f.b = true; if (on('i')) f.i = true; if (X.kid(font, S, 'u') && (X.kid(font, S, 'u').getAttribute('val') || 'single') !== 'none') f.u = true; if (on('strike')) f.s = true;
          const col = this.colorOf(X.kid(font, S, 'color'), ctx); if (col && col !== '#000000') f.c = col;
          const sz = +(val(font, 'sz') || sz0); if (sz !== sz0) f.fs = sz;
          const nm = val(font, 'name'); if (nm && nm !== name0) f.fn = nm;
        }
        const fill = fills[+xf.getAttribute('fillId') || 0], pf = fill && X.kid(fill, S, 'patternFill');
        const pt = pf && (pf.getAttribute('patternType') || (X.kid(pf, S, 'fgColor') ? 'solid' : 'none'));
        if (pt && pt !== 'none' && pt !== 'gray125') {
          // einfarbig: Vordergrundfarbe; Muster: Mischung aus Vorder- und Hintergrund (Excel zeichnet ein Raster)
          const fg = this.colorOf(X.kid(pf, S, 'fgColor'), ctx) || (pt === 'solid' ? null : '#000000');
          if (fg) f.bg = fg;
        }
        const gf = fill && X.kid(fill, S, 'gradientFill');
        if (gf) { const st = X.q(gf, S, 'stop'); const c = st.length && this.colorOf(X.kid(st[0], S, 'color'), ctx); if (c) f.bg = c; }
        const al = X.kid(xf, S, 'alignment'), h = al && al.getAttribute('horizontal');
        if (h === 'left' || h === 'center' || h === 'right') f.al = h[0];
        else if (h === 'centerContinuous') f.al = 'c';
        else if (h === 'justify' || h === 'distributed' || h === 'fill') f.al = 'l';
        const v = al && al.getAttribute('vertical');
        if (v === 'top') f.va = 't'; else if (v === 'center' || v === 'justify' || v === 'distributed') f.va = 'm';
        if (al && /^(1|true)$/.test(al.getAttribute('wrapText') || '')) f.wr = true;
        const ind = al && +(al.getAttribute('indent') || 0); if (ind) f.in = ind;
        const prt = X.kid(xf, S, 'protection'); if (prt && /^(0|false)$/.test(prt.getAttribute('locked') || '')) f.ul = true;   // entsperrt (1.72)
        const bd = borders[+xf.getAttribute('borderId') || 0];
        if (bd) { let s = ''; for (const [k, n] of [['t', 'top'], ['b', 'bottom'], ['l', 'left'], ['r', 'right']]) { const e = X.kid(bd, S, n), st = e && e.getAttribute('style'); if (st && st !== 'none') s += /medium|thick|double/.test(st) ? k.toUpperCase() : k; } if (s) f.bd = s; }
        const id = +xf.getAttribute('numFmtId') || 0;
        Object.assign(f, this.nfOf(fmts.get(id) ?? this.BUILTIN_FMT[id] ?? 'General', id));
      }
      cache.set(i, f);
      return f;
    };
    fn.font = { n: name0, s: sz0 };
    fn.ctx = ctx;
    return fn;
  },
  /* Excel-Zahlenformat → { nf, d, cur, ts } */
  nfOf(code, id) {
    const c = String(code || 'General').split(';')[0].replace(/"[^"]*"|\\.|\[[^\]]*\]/g, (m) => /CHF|€|\$|£/.test(m) ? m : '');
    if (!code || code === 'General') return {};
    if (code === '@') return { nf: 'text' };
    const dec = (/0\.(0+)/.exec(c) || [0, ''])[1].length;
    if (/[dmy]/i.test(c) && !/[0#]/.test(c)) { if (/h|s/i.test(c)) return /[dy]/i.test(c) ? { nf: 'dt' } : { nf: 'time', ...(/s/i.test(c) ? { secs: true } : {}) }; return /mmmm|dddd/i.test(c) ? { nf: 'datel' } : { nf: 'date' }; }
    if (/h|:s/i.test(c) && !/[0#]/.test(c)) return { nf: 'time' };
    if (/%/.test(c)) return { nf: 'pct', d: dec };
    if (/E\+/i.test(c)) return { nf: 'sci', d: dec };
    if (/\?\/\?/.test(c)) return { nf: 'frac' };
    const cur = /CHF/.test(code) ? 'CHF' : /€/.test(code) ? '€' : /\$/.test(code) ? '$' : /£/.test(code) ? '£' : null;
    if (cur) return { nf: 'cur', d: dec, cur };
    if (/#,##0|#'##0/.test(c)) return { nf: 'num', d: dec };
    if (/0/.test(c)) return { d: dec };
    void id;
    return {};
  },
  /* Format-Objekt → Excel-Zahlenformat (null = Standard) */
  codeOf(f) {
    const d = f.d == null ? null : f.d, z = (n) => n > 0 ? '.' + '0'.repeat(n) : '';
    switch (f.nf) {
      case 'num': return '#,##0' + z(d ?? 2);
      case 'cur': { const n = '#,##0' + z(d ?? 2); return f.cur === '€' ? n + ' "€"' : f.cur === '$' ? '"$"\\ ' + n : f.cur === '£' ? '"£"\\ ' + n : '"CHF"\\ ' + n; }
      case 'pct': return '0' + z(d ?? 0) + '%';
      case 'sci': return '0' + z(d ?? 2) + 'E+00';
      case 'frac': return '# ?/?';
      case 'date': return 'dd.mm.yyyy';
      case 'datel': return 'd. mmmm yyyy';
      case 'time': return f.secs ? 'hh:mm:ss' : 'hh:mm';
      case 'dt': return 'dd.mm.yyyy hh:mm';
      case 'text': return '@';
    }
    return d != null ? '0' + z(d) : null;
  },
  /* Schreiber für styles.xml: neues Zellformat aus altem (Index) + Format-Objekt → Index; dxf für bedingte Formate */
  async styleWriter(pkg) {
    const X = OfficePages, S = this.S;
    const r = (await pkg.rels(pkg.main)).find(x => /\/styles$/.test(x.type) && pkg.has(x.path));
    if (!r) return null;
    const sd = await pkg.xml(r.path), root = sd.documentElement;
    const ORDER = ['numFmts', 'fonts', 'fills', 'borders', 'cellStyleXfs', 'cellXfs', 'cellStyles', 'dxfs', 'tableStyles', 'colors', 'extLst'];
    const list = (name) => {
      let e = X.kid(root, S, name);
      if (!e) { e = X.mk(sd, S, name, { count: '0' }); const after = ORDER.slice(ORDER.indexOf(name) + 1).map(n => X.kid(root, S, n)).find(Boolean); if (after) after.before(e); else root.append(e); }
      return e;
    };
    const push = (lst, node) => { lst.append(node); const n = lst.children.length; lst.setAttribute('count', String(n)); return n - 1; };
    const rgb = (c) => 'FF' + c.replace('#', '').toUpperCase();
    const xml = (s) => X.xml(sd, S, s)[0];
    const fontsEl = list('fonts'), fillsEl = list('fills'), bordersEl = list('borders'), xfsEl = list('cellXfs');
    const fonts = X.kids(fontsEl, S, 'font'), xfs = X.kids(xfsEl, S, 'xf');
    const cache = new Map();
    let changed = false;
    let nextFmt = Math.max(163, ...X.q(sd, S, 'numFmt').map(n => +n.getAttribute('numFmtId') || 0)) + 1;
    const fmtIds = new Map(X.q(sd, S, 'numFmt').map(n => [n.getAttribute('formatCode'), +n.getAttribute('numFmtId')]));
    const builtinId = (code) => { for (const [id, c] of Object.entries(this.BUILTIN_FMT)) if (c === code && ![14, 22].includes(+id)) return +id; return null; };
    const self = this;
    return {
      get changed() { return changed; },
      xf(base, f) {
        const key = base + '|' + JSON.stringify(f);
        if (cache.has(key)) return cache.get(key);
        const old = xfs[base] || xfs[0];
        const nx = old ? old.cloneNode(true) : xml('<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>');
        // Schrift
        const f0 = fonts[+(old && old.getAttribute('fontId')) || 0];
        const font = f0 ? f0.cloneNode(true) : xml('<font><sz val="11"/><name val="Calibri"/></font>');
        for (const n of ['b', 'i', 'u', 'strike', 'color']) { const e = X.kid(font, S, n); if (e) e.remove(); }
        const first = font.firstElementChild;
        const ins = (s) => { const e = xml(s); if (first) first.before(e); else font.append(e); };
        if (f.b) ins('<b/>'); if (f.i) ins('<i/>'); if (f.s) ins('<strike/>');
        if (f.u) { const e = xml('<u/>'); const sz = X.kid(font, S, 'sz'); if (sz) sz.before(e); else font.append(e); }
        if (f.c) { const e = xml(`<color rgb="${rgb(f.c)}"/>`); const nm = X.kid(font, S, 'name'); if (nm) nm.before(e); else font.append(e); }
        if (f.fs) { let sz = X.kid(font, S, 'sz'); if (!sz) { sz = xml('<sz val="11"/>'); font.prepend(sz); } sz.setAttribute('val', String(f.fs)); }
        if (f.fn) { let nm = X.kid(font, S, 'name'); if (!nm) { nm = xml('<name val=""/>'); const fam = X.kid(font, S, 'family') || X.kid(font, S, 'charset') || X.kid(font, S, 'scheme'); if (fam) fam.before(nm); else font.append(nm); } nm.setAttribute('val', f.fn); const sc = X.kid(font, S, 'scheme'); if (sc) sc.remove(); }   // Schriftart (1.72)
        nx.setAttribute('fontId', String(push(fontsEl, font))); nx.setAttribute('applyFont', '1');
        // Füllung
        if (f.bg) { nx.setAttribute('fillId', String(push(fillsEl, xml(`<fill><patternFill patternType="solid"><fgColor rgb="${rgb(f.bg)}"/><bgColor indexed="64"/></patternFill></fill>`)))); nx.setAttribute('applyFill', '1'); }
        else if (old && +old.getAttribute('fillId') > 1) { nx.setAttribute('fillId', '0'); }
        // Rahmen
        if (f.bd) {
          const side = (k, n) => f.bd.includes(k.toUpperCase()) ? `<${n} style="medium"><color auto="1"/></${n}>` : f.bd.includes(k) ? `<${n} style="thin"><color auto="1"/></${n}>` : `<${n}/>`;
          nx.setAttribute('borderId', String(push(bordersEl, xml(`<border>${side('l', 'left')}${side('r', 'right')}${side('t', 'top')}${side('b', 'bottom')}<diagonal/></border>`)))); nx.setAttribute('applyBorder', '1');
        } else if (old && +old.getAttribute('borderId') > 0) nx.setAttribute('borderId', '0');
        // Zahlenformat
        const code = self.codeOf(f);
        let id = 0;
        if (code) { id = builtinId(code); if (id == null) { id = fmtIds.get(code); if (id == null) { id = nextFmt++; push(list('numFmts'), xml(`<numFmt numFmtId="${id}" formatCode="${Ooxml.esc(code)}"/>`)); fmtIds.set(code, id); } } }
        nx.setAttribute('numFmtId', String(id)); nx.setAttribute('applyNumberFormat', '1');
        // Ausrichtung
        let al = X.kid(nx, S, 'alignment');
        const needAl = f.al || f.va || f.wr || f.in;
        if (needAl && !al) { al = xml('<alignment/>'); nx.prepend(al); }
        if (al) {
          if (f.al) al.setAttribute('horizontal', { l: 'left', c: 'center', r: 'right' }[f.al]); else al.removeAttribute('horizontal');
          if (f.va) al.setAttribute('vertical', f.va === 't' ? 'top' : 'center'); else al.removeAttribute('vertical');   // fehlt = unten (Standard)
          if (f.wr) al.setAttribute('wrapText', '1'); else al.removeAttribute('wrapText');
          if (f.in) al.setAttribute('indent', String(f.in)); else al.removeAttribute('indent');
          if (needAl) nx.setAttribute('applyAlignment', '1');
        }
        // Zellschutz (1.72): entsperrt = protection locked="0" (nach alignment)
        let pr = X.kid(nx, S, 'protection');
        if (f.ul) { if (!pr) { pr = xml('<protection/>'); const a2 = X.kid(nx, S, 'alignment'); if (a2) a2.after(pr); else nx.prepend(pr); } pr.setAttribute('locked', '0'); nx.setAttribute('applyProtection', '1'); }
        else if (pr) { pr.removeAttribute('locked'); if (!pr.attributes.length) pr.remove(); }
        const idx = push(xfsEl, nx);
        changed = true;
        cache.set(key, idx);
        return idx;
      },
      dxf(st) {
        const s = self.STYLES[st] || self.STYLES.rot;
        const lst = list('dxfs');
        changed = true;
        return push(lst, xml(`<dxf>${s[1] ? `<font><color rgb="${rgb(s[1])}"/></font>` : ''}${s[0] ? `<fill><patternFill><bgColor rgb="${rgb(s[0])}"/></patternFill></fill>` : ''}</dxf>`));
      },
      save() { if (changed) pkg.setXml(r.path, sd); },
    };
  },
  /* bedingte Formate eines Blatts schreiben (eigene Regeln ersetzen die früher von KnowledgeTree geschriebenen) */
  writeCf(doc, d, sw) {
    const X = OfficePages, S = this.S;
    // alle Regeln, die KnowledgeTree gelesen hat (und darstellt), werden aus d.cf neu geschrieben; andere bleiben
    for (const e of X.q(doc, S, 'conditionalFormatting')) if (X.kids(e, S, 'cfRule').every(r => this.readable(r))) e.remove();
    if (!d.cf || !d.cf.length) return;
    const root = doc.documentElement;
    let prio = Math.max(0, ...X.q(doc, S, 'cfRule').map(r => +r.getAttribute('priority') || 0));
    const q = (v) => { const p = XL.parseInput(String(v)); return typeof p.v === 'number' ? String(p.v) : '"' + String(v).replace(/"/g, '""') + '"'; };
    const rgb = (c) => 'FF' + c.replace('#', '').toUpperCase();
    const before = ['dataValidations', 'hyperlinks', 'printOptions', 'pageMargins', 'pageSetup', 'headerFooter', 'rowBreaks', 'colBreaks', 'customProperties', 'cellWatches', 'ignoredErrors', 'smartTags', 'drawing', 'legacyDrawing', 'legacyDrawingHF', 'picture', 'oleObjects', 'controls', 'webPublishItems', 'tableParts', 'extLst'].map(n => X.kid(root, S, n)).find(Boolean);
    for (const r of d.cf) {
      const g = XL.parseRange(r.ref);
      if (!g) continue;
      const tl = XL.key(g.c1, g.r1);
      let rule;
      const P = ++prio;
      const op = { gt: 'greaterThan', lt: 'lessThan', eq: 'equal', between: 'between' }[r.t];
      if (op) rule = `<cfRule type="cellIs" dxfId="${sw.dxf(r.st)}" priority="${P}" operator="${op}"><formula>${Ooxml.esc(q(r.a))}</formula>${r.t === 'between' ? `<formula>${Ooxml.esc(q(r.b))}</formula>` : ''}</cfRule>`;
      else if (r.t === 'text') rule = `<cfRule type="containsText" dxfId="${sw.dxf(r.st)}" priority="${P}" operator="containsText" text="${Ooxml.esc(r.a)}"><formula>${Ooxml.esc(`NOT(ISERROR(SEARCH(${q(r.a)},${tl})))`)}</formula></cfRule>`;
      else if (r.t === 'dup') rule = `<cfRule type="duplicateValues" dxfId="${sw.dxf(r.st)}" priority="${P}"/>`;
      else if (r.t === 'top' || r.t === 'bottom') rule = `<cfRule type="top10" dxfId="${sw.dxf(r.st)}" priority="${P}" rank="${Math.max(1, +r.a || 10)}"${r.t === 'bottom' ? ' bottom="1"' : ''}/>`;
      else if (r.t === 'scale') { const s = this.SCALES[r.s] || this.SCALES.gyr; rule = s[2] ? `<cfRule type="colorScale" priority="${P}"><colorScale><cfvo type="min"/><cfvo type="percentile" val="50"/><cfvo type="max"/><color rgb="${rgb(s[3])}"/><color rgb="${rgb(s[2])}"/><color rgb="${rgb(s[1])}"/></colorScale></cfRule>` : `<cfRule type="colorScale" priority="${P}"><colorScale><cfvo type="min"/><cfvo type="max"/><color rgb="${rgb(s[1])}"/><color rgb="${rgb(s[3])}"/></colorScale></cfRule>`; }
      else if (r.t === 'bar') { const s = this.BARS[r.s] || this.BARS.blau; rule = `<cfRule type="dataBar" priority="${P}"><dataBar><cfvo type="min"/><cfvo type="max"/><color rgb="${rgb(s[1])}"/></dataBar></cfRule>`; }
      if (!rule) continue;
      const [e] = X.xml(doc, S, `<conditionalFormatting sqref="${Ooxml.esc(r.ref.replace(/\$/g, ''))}">${rule}</conditionalFormatting>`);
      if (before) before.before(e); else root.append(e);
    }
  },
  readable(r) {
    const t = r.getAttribute('type');
    return (t === 'cellIs' && /^(greaterThan|lessThan|equal|between)$/.test(r.getAttribute('operator') || '')) || /^(containsText|duplicateValues|top10|colorScale|dataBar)$/.test(t || '');
  },
  /* fixierte Zeilen/Spalten, Gitternetzlinien, Überschriften → sheetView */
  writeView(doc, d) {
    const X = OfficePages, S = this.S, root = doc.documentElement;
    let svs = X.kid(root, S, 'sheetViews');
    if (!svs) { svs = X.mk(doc, S, 'sheetViews'); const after = X.kid(root, S, 'sheetFormatPr') || X.kid(root, S, 'cols') || X.kid(root, S, 'sheetData'); if (after) after.before(svs); else root.prepend(svs); }
    let sv = X.kid(svs, S, 'sheetView');
    if (!sv) { sv = X.mk(doc, S, 'sheetView', { workbookViewId: '0' }); svs.append(sv); }
    if (d.grid === false) sv.setAttribute('showGridLines', '0'); else sv.removeAttribute('showGridLines');
    if (d.heads === false) sv.setAttribute('showRowColHeaders', '0'); else sv.removeAttribute('showRowColHeaders');
    if (d.showF) sv.setAttribute('showFormulas', '1'); else sv.removeAttribute('showFormulas');   // Formeln anzeigen (1.72)
    const old = X.kid(sv, S, 'pane'); if (old) old.remove();
    for (const s of X.kids(sv, S, 'selection')) if (s.getAttribute('pane')) s.remove();
    const f = d.freeze;
    if (f && (f.r || f.c)) {
      const ap = f.r && f.c ? 'bottomRight' : f.r ? 'bottomLeft' : 'topRight';
      const [e] = X.xml(doc, S, `<pane${f.c ? ` xSplit="${f.c}"` : ''}${f.r ? ` ySplit="${f.r}"` : ''} topLeftCell="${XL.key(f.c, f.r)}" activePane="${ap}" state="frozen"/>`);
      sv.prepend(e);
    }
  },
  readView(doc, d) {
    const X = OfficePages, S = this.S;
    const sv = X.q(doc, S, 'sheetView')[0];
    if (!sv) return;
    if (sv.getAttribute('showGridLines') === '0') d.grid = false;
    if (sv.getAttribute('showRowColHeaders') === '0') d.heads = false;
    const pane = X.kid(sv, S, 'pane');
    if (pane && /frozen/.test(pane.getAttribute('state') || '')) { const r = Math.round(+pane.getAttribute('ySplit') || 0), c = Math.round(+pane.getAttribute('xSplit') || 0); if (r || c) d.freeze = { r, c }; }
  },
  /* bedingte Formate lesen, soweit KnowledgeTree sie darstellen kann (andere bleiben unverändert in der Datei) */
  readCf(doc, stylesDoc) {
    const X = OfficePages, S = this.S;
    const dxfs = stylesDoc ? X.kids(X.q(stylesDoc, S, 'dxfs')[0] || stylesDoc.documentElement, S, 'dxf') : [];
    const styleOf = (id) => {
      const x = dxfs[+id]; if (!x) return 'rot';
      const bg = this.argb(X.q(x, S, 'bgColor')[0]) || this.argb(X.q(x, S, 'fgColor')[0]);
      const best = Object.entries(this.STYLES).find(([, s]) => s[0] && bg && s[0].toLowerCase() === bg.toLowerCase());
      return best ? best[0] : bg && /c6efce/i.test(bg) ? 'gruen' : bg && /ffeb9c/i.test(bg) ? 'gelb' : 'rot';
    };
    const out = [];
    for (const cf of X.q(doc, S, 'conditionalFormatting')) {
      const ref = (cf.getAttribute('sqref') || '').split(' ')[0];
      if (!XL.parseRange(ref)) continue;
      for (const r of X.kids(cf, S, 'cfRule')) {
        const t = r.getAttribute('type'), fs = X.kids(r, S, 'formula').map(f => f.textContent.replace(/^"|"$/g, ''));
        const op = { greaterThan: 'gt', lessThan: 'lt', equal: 'eq', between: 'between' }[r.getAttribute('operator')];
        if (!this.readable(r)) continue;
        if (t === 'cellIs' && op) out.push({ t: op, a: fs[0] || '', b: fs[1] || '', st: styleOf(r.getAttribute('dxfId')), ref, orig: true });
        else if (t === 'containsText') out.push({ t: 'text', a: r.getAttribute('text') || '', st: styleOf(r.getAttribute('dxfId')), ref, orig: true });
        else if (t === 'duplicateValues') out.push({ t: 'dup', st: styleOf(r.getAttribute('dxfId')), ref, orig: true });
        else if (t === 'top10') out.push({ t: r.getAttribute('bottom') === '1' ? 'bottom' : 'top', a: r.getAttribute('rank') || '10', st: styleOf(r.getAttribute('dxfId')), ref, orig: true });
        else if (t === 'colorScale') { const cols = X.q(r, S, 'color').map(c => (this.argb(c) || '').toLowerCase()); out.push({ t: 'scale', s: cols[0] === '#f8696b' ? 'gyr' : cols[0] === '#63be7b' ? 'ryg' : cols[cols.length - 1] === '#5a8ac6' ? 'wb' : 'wr', ref, orig: true }); }
        else if (t === 'dataBar') { const col = (this.argb(X.q(r, S, 'color')[0]) || '').toLowerCase(); out.push({ t: 'bar', s: Object.keys(this.BARS).find(k => this.BARS[k][1].toLowerCase() === col) || 'blau', ref, orig: true }); }
      }
    }
    return out;
  },
};
if (typeof module !== 'undefined') module.exports = { OfficeGrid };
