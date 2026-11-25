'use strict';
/* Erste Schritte (seit 1.9, seit 1.36 für alle Funktionen): Beispielseiten mit kurzen Anleitungen und echten, lebenden
 * Beispielen – Tabellen rechnen, Diagramme reagieren, Verbindungen und Pakete lassen sich verschieben, Handschrift
 * lässt sich ausrechnen. Jede Seite: Titel mit dem Zweck, „So geht’s“ (blau), „Probier es aus“ (grün), Beispiele.
 *
 * Guide.open(kind) legt die Seite im Abschnitt „Erste Schritte“ des aktuellen Notizbuchs an (oder öffnet sie).
 * Guide.openAll() ergänzt alle fehlenden und frischt unveränderte Seiten älterer Versionen auf (p.guide/p.guideV;
 * „unverändert“ = seit dem Anlegen nie bearbeitet). Für neue Notizbücher baut main.js (createWelcome) sie gleich ein. */
const Guide = {
  V: 7,   // Inhaltsstand der Seiten (1.36) – ältere, unveränderte Seiten werden bei openAll ersetzt
  // Reihenfolge im Abschnitt: die ersten sechs wie bis 1.35, danach die neuen
  ORDER: ['willkommen', 'zeichnen', 'struktur', 'tabellen', 'diagramme', 'rechner', 'text', 'tree', 'formeln', 'medien', 'tabs', 'sichern', 'tasten'],
  TITLES: {
    willkommen: 'Willkommen', zeichnen: 'Zeichnen & Formen', struktur: 'Seiten, Abschnitte & Notizbücher', tabellen: 'Tabellen & Formeln',
    diagramme: 'Diagramme', rechner: 'Rechner & Fotomath', text: 'Text & Formatieren', tree: 'Knowledge Tree: verbinden & gruppieren',
    formeln: 'Formeln & Chemie', medien: 'Bilder, Dateien & Videos', tabs: 'Tabs, Ansicht & Handy', sichern: 'Speichern, Import & Export',
    tasten: 'Die wichtigsten Tasten',
  },
  ICONS: { willkommen: 'sparkle', zeichnen: 'pen', struktur: 'book', tabellen: 'table', diagramme: 'chartCol', rechner: 'calc', text: 'textbox', tree: 'tree', formeln: 'formula', medien: 'image', tabs: 'splitH', sichern: 'save', tasten: 'keyboard' },
  INFO: {
    willkommen: 'Was KnowledgeTree ist und wie alles zusammenhängt', zeichnen: 'Stifte, Formen, Lineal, Formerkennung', struktur: 'Notizbücher, Abschnitte, Seiten, Suchen, Versionen',
    tabellen: 'Rechnen wie in Excel', diagramme: 'Grafiken, die mit den Daten mitgehen', rechner: 'Taschenrechner und Handschrift ausrechnen',
    text: 'Schreiben, Formatvorlagen, Listen, Links', tree: 'Ideen mit Linien verbinden, Pakete bilden', formeln: 'Mathe-Formeln, Strukturformeln, Periodensystem',
    medien: 'Bilder, Anhänge, PDF als Seiten, Videos', tabs: 'Mehrere Seiten, Teilen, Vollbild, Handy', sichern: 'Wo alles liegt, Backups, OneNote, PDF, Drucken',
    tasten: 'Die Abkürzungen auf einen Blick',
  },

  section(nb) {
    const all = (g, out = []) => { for (const x of g.groups || []) { if (x.kind === 'section') out.push(x); all(x, out); } return out; };
    return all(nb).find(s => s.name === 'Erste Schritte') || Ops.makeNode('section', 'Erste Schritte', nb);
  },
  notebook() {
    const cur = Tree.group(Store.ui.currentGroup);
    return (cur && Tree.notebookOf(cur.id)) || Store.groups.find(g => g.kind === 'notebook' && !g.closed) || Ops.makeNode('notebook', 'Mein Notizbuch', null);
  },
  find(sec, kind) {
    return sec.pages.find(id => Store.pages[id] && Store.pages[id].guide === kind) || sec.pages.find(id => Store.pages[id] && Store.pages[id].title === this.TITLES[kind]);
  },
  open(kind) {
    if (!this.TITLES[kind]) kind = 'willkommen';
    Hist.flushPending();
    const sec = this.section(this.notebook());
    let pid = this.find(sec, kind);
    if (!pid) {
      const p = this.makePage(kind);
      Store.pages[p.id] = p;
      // an ihren Platz in der Reihenfolge (nach der letzten vorhandenen Erste-Schritte-Seite davor)
      const k = this.ORDER.indexOf(kind);
      let at = sec.pages.length;
      for (let j = k + 1; j < this.ORDER.length; j++) { const q = this.find(sec, this.ORDER[j]); if (q) { at = sec.pages.indexOf(q); break; } }
      if (kind !== 'willkommen') p.level = sec.pages.length ? 1 : 0;
      sec.pages.splice(at, 0, p.id);
      Tree.normLevels(sec);
      Hist.touchPage(p.id);
      Hist.touchTree();
      Hist.commit('Erste Schritte: ' + this.TITLES[kind]);
      pid = p.id;
      if (typeof Sidebar !== 'undefined' && Sidebar.render) Sidebar.render();
    }
    App.openPage(pid);
  },
  /* alle Erste-Schritte-Seiten: fehlende ergänzen, unveränderte ältere auffrischen (ein Schritt für Strg+Z) */
  openAll() {
    Hist.flushPending();
    const sec = this.section(this.notebook());
    let added = 0, fresh = 0;
    for (const kind of this.ORDER) {
      const pid = this.find(sec, kind);
      if (!pid) {
        const p = this.makePage(kind);
        if (kind !== 'willkommen') p.level = 1;
        Store.pages[p.id] = p;
        const k = this.ORDER.indexOf(kind);
        let at = sec.pages.length;
        for (let j = k + 1; j < this.ORDER.length; j++) { const q = this.find(sec, this.ORDER[j]); if (q) { at = sec.pages.indexOf(q); break; } }
        sec.pages.splice(at, 0, p.id);
        Hist.touchPage(p.id);
        added++;
        continue;
      }
      const old = Store.pages[pid];
      if (!old || (old.guideV || 0) >= this.V || Math.abs((old.modified || 0) - (old.created || 0)) > 2000) continue;   // bearbeitet: nicht anrühren
      const n = this.makePage(kind);
      Object.assign(old, { boxes: n.boxes, pkgs: n.pkgs, links: n.links, drawings: n.drawings, bg: n.bg, guide: kind, guideV: this.V, title: n.title });
      old.modified = old.created;
      Hist.touchPage(pid);
      fresh++;
    }
    Tree.normLevels(sec);
    Hist.touchTree();
    Hist.commit('Erste Schritte ergänzt');
    if (typeof Sidebar !== 'undefined' && Sidebar.render) Sidebar.render();
    App.openPage(this.find(sec, 'willkommen'));
    UI.toast(added || fresh ? `Erste Schritte: ${added} neu, ${fresh} aufgefrischt – bearbeitete Seiten bleiben, wie sie sind` : 'Erste Schritte sind schon vollständig', 4000);
  },
  makePage(kind) {
    const p = newPage(this.TITLES[kind]);
    p.bg = 'punkte';
    p.guide = kind; p.guideV = this.V;
    this['build_' + kind](p);
    return p;
  },
  /* Kopf jeder Seite: grosser Titel + wozu */
  title(p, h, txt, w = 600) { p.boxes.push(this.box(0, 0, w, `<h1>${h}</h1><div>${txt}</div>`, { style: { bg: 'transparent' } })); },

  /* ---------------------------------------------------------- Bausteine */
  z: 1,
  box(x, y, w, html, extra = {}) { return { id: uid('b'), x, y, w, html, images: [], z: this.z++, style: {}, locked: false, pkg: null, ...extra }; },
  note(x, y, w, html, color) {
    const st = { gelb: { bg: '#FFF4C2', border: '#E8C547', color: '#252423' }, blau: { bg: '#DCEBFF', border: '#6AA3E8', color: '#252423' }, gruen: { bg: '#DDF3E0', border: '#5DB36A', color: '#252423' },
      rot: { bg: '#FDE0E0', border: '#E06666', color: '#252423' }, lila: { bg: '#EDE3FA', border: '#9B7AD6', color: '#252423' }, dunkel: { bg: '#2B2F36', border: '#2B2F36', color: '#F5F5F5' } }[color] || {};
    return this.box(x, y, w, html, { style: st });
  },
  sheet(x, y, name, rows, opts = {}) {
    const cells = {};
    rows.forEach((row, r) => row.forEach((v, c) => {
      if (v === null || v === undefined || v === '') return;
      if (typeof v === 'object') cells[XL.key(c, r)] = { v: String(v.v), ...(v.f ? { f: v.f } : {}) };
      else cells[XL.key(c, r)] = { v: String(v) };
    }));
    const ncols = Math.max(...rows.map(r => r.length));
    const d = XL.normSheet({ name, cells, nrows: rows.length + (opts.extraRows || 0), ncols, cols: opts.cols || Array(ncols).fill(92), head: opts.head !== false, band: !!opts.band, grid: true, color: opts.color || null });
    const b = this.box(x, y, 0, '', { style: { bg: 'transparent' }, sheet: d });
    b.w = d.cols.reduce((s, w) => s + w, 0) + 1 + 2 * BORDER;
    return b;
  },
  chart(x, y, w, src, range, opts = {}) {
    const c = Chart.norm({ type: opts.type || 'col', src: { id: src.id, name: src.sheet.name, range, auto: true }, title: opts.title || '', h: opts.h || 260, trend: opts.trend || '', eq: true, xTitle: opts.xTitle || '', yTitle: opts.yTitle || '' });
    return this.box(x, y, w, '', { chart: c });
  },
  /* Handschrift zum Ausprobieren: Zeichen aus den Vorlagen der Erkennung, mit leichter natürlicher Unruhe */
  ink(items, x0, y0, h = 34, color = '#1f3fa0') {
    let seed = 11;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
    const out = [];
    let t = 1;
    const push = (pts) => { const flat = []; for (const q of pts) flat.push(Math.round(q.x * 10) / 10, Math.round(q.y * 10) / 10, 0.55); out.push({ id: uid('d'), type: 'ink', kind: 'pen', color, w: 2.4, pts: flat, t0: t++, dur: 260, layer: 'oben' }); };
    const glyph = (cls, x, y, hh, v = 0) => {
      const tpl = MathInk.RAW[cls][v];
      const all = tpl.flat();
      const x1 = Math.min(...all.map(p => p[0])), y1 = Math.min(...all.map(p => p[1])), y2 = Math.max(...all.map(p => p[1]));
      const bh = Math.max(y2 - y1, 0.01), sl = 0.12;
      let maxX = x;
      for (const st of tpl) {
        const pts = [];
        for (let k = 0; k < st.length; k++) {
          const seg = k + 1 < st.length ? 4 : 1;
          for (let s = 0; s < seg; s++) {
            const a = st[k], b = st[Math.min(k + 1, st.length - 1)];
            const px = a[0] + (b[0] - a[0]) * s / seg, py = a[1] + (b[1] - a[1]) * s / seg;
            const ny = (py - y1) / bh;
            const q = { x: x + ((px - x1) / bh + (1 - ny) * sl) * hh + (rnd() - 0.5) * 0.6, y: y + ny * hh + (rnd() - 0.5) * 0.6 };
            pts.push(q); maxX = Math.max(maxX, q.x);
          }
        }
        push(pts);
      }
      return maxX;
    };
    const line = (xa, ya, xb, yb) => { const pts = []; for (let i = 0; i <= 12; i++) pts.push({ x: xa + (xb - xa) * i / 12, y: ya + (yb - ya) * i / 12 + Math.sin(i) * 0.4 }); push(pts); };
    const dot = (xx, yy) => push([{ x: xx, y: yy }, { x: xx + 0.9, y: yy + 0.7 }]);
    const write = (seq, x, y, hh) => {
      for (const it of seq) {
        if (typeof it === 'string') {
          for (const ch of it) {
            if (ch === ' ') { x += hh * 0.35; continue; }
            if (ch === '+') { glyph('+', x, y + hh * 0.22, hh * 0.56); x += hh * 0.85; continue; }
            if (ch === '-') { line(x, y + hh * 0.52, x + hh * 0.5, y + hh * 0.5); x += hh * 0.8; continue; }
            if (ch === '=') { line(x, y + hh * 0.36, x + hh * 0.55, y + hh * 0.36); line(x, y + hh * 0.64, x + hh * 0.55, y + hh * 0.64); x += hh * 0.9; continue; }
            if (ch === '.') { dot(x + 1, y + hh * 0.96); x += hh * 0.3; continue; }
            if (ch === '*') { dot(x + 2, y + hh * 0.5); x += hh * 0.45; continue; }
            const isX = ch === 'x';
            const mx = glyph(ch, x, y + (isX ? hh * 0.32 : 0), isX ? hh * 0.68 : hh, ch === 'x' ? 1 : 0);
            x = mx + hh * 0.26;
          }
        } else if (it.frac) {
          const wa = this.measure(it.frac[0], hh), wb = this.measure(it.frac[1], hh), W = Math.max(wa, wb) + hh * 0.5;
          write([it.frac[0]], x + (W - wa) / 2, y - hh * 0.78, hh);
          line(x, y + hh * 0.5, x + W, y + hh * 0.5);
          write([it.frac[1]], x + (W - wb) / 2, y + hh * 0.78, hh);
          x += W + hh * 0.4;
        } else if (it.pow) {
          x = write([it.pow], x - hh * 0.05, y - hh * 0.48, hh * 0.6) + hh * 0.15;
        }
      }
      return x;
    };
    write(items, x0, y0, h);
    return out;
  },
  link(a, b, extra = {}) { return { id: uid('l'), a, b, style: 'kurve', arrow: 'ende', w: 2, color: null, dash: false, label: '', ...extra }; },
  steps(items) { return '<h3>So geht’s</h3>' + this.list(items); },
  tryit(items) { return '<h3>Probier es aus</h3>' + this.check(items); },
  measure(txt, h) { return [...txt].reduce((w, ch) => w + (ch === ' ' ? 0.35 : ch === '+' ? 0.85 : ch === '-' ? 0.8 : ch === '=' ? 0.9 : ch === '.' ? 0.3 : ch === '1' ? 0.55 : 0.85) * h, 0); },
  list(items) { return '<ul>' + items.map(i => `<li>${i}</li>`).join('') + '</ul>'; },
  check(items) { return '<ul class="checklist">' + items.map(i => `<li>${i}</li>`).join('') + '</ul>'; },

  /* ---------------------------------------------------------- Tabellen & Formeln */
  build_tabellen(p) {
    this.z = 1;
    const B = [];
    B.push(this.box(0, 0, 560, '<h1>Tabellen &amp; Formeln</h1><div>Rechnen wie in Excel – direkt auf der Seite. Alles auf dieser Seite ist echt: <b>ändere die Zahlen</b> und schau, wie alles mitrechnet.</div>', { style: { bg: 'transparent' } }));
    const chf = { nf: 'cur', d: 2, cur: 'CHF' };
    const t1 = this.sheet(0, 150, 'Haushalt', [
      ['Posten', 'Januar', 'Februar', 'Summe', 'Anteil'],
      ['Miete', { v: '1450', f: chf }, { v: '1450', f: chf }, { v: '=SUMME(B2:C2)', f: chf }, { v: '=D2/D$6', f: { nf: 'pct', d: 0 } }],
      ['Essen', { v: '620', f: chf }, { v: '580', f: chf }, { v: '=SUMME(B3:C3)', f: chf }, { v: '=D3/D$6', f: { nf: 'pct', d: 0 } }],
      ['Freizeit', { v: '210', f: chf }, { v: '340', f: chf }, { v: '=SUMME(B4:C4)', f: chf }, { v: '=D4/D$6', f: { nf: 'pct', d: 0 } }],
      ['Velo & ÖV', { v: '85', f: chf }, { v: '85', f: chf }, { v: '=SUMME(B5:C5)', f: chf }, { v: '=D5/D$6', f: { nf: 'pct', d: 0 } }],
      [{ v: 'Total', f: { b: true } }, { v: '=SUMME(B2:B5)', f: { ...chf, b: true } }, { v: '=SUMME(C2:C5)', f: { ...chf, b: true } }, { v: '=SUMME(D2:D5)', f: { ...chf, b: true } }, { v: '=SUMME(E2:E5)', f: { nf: 'pct', d: 0, b: true } }],
    ], { band: true, cols: [96, 96, 96, 104, 72] });
    B.push(t1);
    const t2 = this.sheet(0, 400, 'Auswertung', [
      ['Frage', 'Antwort'],
      ['Höchste Ausgabe', { v: '=MAX(Haushalt!B2:C5)', f: chf }],
      ['Durchschnitt pro Monat', { v: '=MITTELWERT(Haushalt!B6:C6)', f: chf }],
      ['Februar teurer?', '=WENN(Haushalt!C6>Haushalt!B6;"ja";"nein")'],
      ['Posten über CHF 500', '=ZÄHLENWENN(Haushalt!D2:D5;">500")'],
    ], { cols: [170, 120], color: '#038387' });
    B.push(t2);
    B.push(this.note(620, 0, 380, '<h3>So geht’s</h3>' + this.list([
      '<b>Einfügen → Tabelle</b>: Grösse wählen. Oder aus Excel kopieren und mit <b>Strg+V</b> auf die Seite einfügen, CSV-Datei hineinziehen.',
      '<b>Zelle anklicken und tippen</b> · Enter = nach unten · Tab = nach rechts · F2 = bearbeiten · Esc = Tabelle verlassen.',
      '<b>Formeln</b> beginnen mit <b>=</b>. Schon beim Tippen erscheinen <b>Vorschläge</b>: grauer Text direkt in der Zelle und eine Liste mit Erklärung – <b>Tab</b> übernimmt.',
      'Während der Formel <b>Zellen anklicken</b> (oder Pfeiltasten) fügt Bezüge ein, <b>F4</b> wechselt zu $A$1.',
      'Andere Tabellen derselben Seite: <code>=SUMME(Haushalt!B2:B5)</code>',
      '<b>Ausfüllkästchen</b> (Punkt unten rechts an der Auswahl) ziehen: Formeln und Reihen (1, 2, 3 · Jan, Feb · Mo, Di) weiterführen.',
      'Register <b>Tabelle</b>: AutoSumme, Sortieren, Zahlenformate (CHF, %, Datum), Farben, Diagramm.',
    ]), 'blau'));
    B.push(this.note(620, 420, 380, '<h3>Probier es aus</h3>' + this.check([
      'In „Haushalt“ eine Zahl ändern – Summe, Anteil und „Auswertung“ rechnen sofort neu',
      'In F2 tippen: <b>=mit</b> → der Vorschlag MITTELWERT erscheint, mit Tab übernehmen, dann B2:C2 markieren, Enter',
      'Das Ausfüllkästchen von F2 bis F5 ziehen',
      'B2:C5 markieren – unten in der Statusleiste stehen Summe, Mittelwert und Anzahl',
      'Rechtsklick in eine Zelle: Zeilen einfügen, sortieren, Format …',
    ]), 'gruen'));
    B.push(this.note(0, 590, 560, '<h3>Häufige Funktionen</h3><div><b>SUMME</b>, <b>MITTELWERT</b>, <b>ANZAHL</b>, <b>MIN</b>/<b>MAX</b>, <b>RUNDEN</b>(Zahl; Stellen), <b>WENN</b>(Prüfung; dann; sonst), <b>SUMMEWENN</b>, <b>ZÄHLENWENN</b>, <b>SVERWEIS</b>/<b>XVERWEIS</b>, <b>HEUTE</b>(), <b>TEXT</b> … – rund 170 Funktionen, deutsch oder englisch (SUM, IF, VLOOKUP). Alle mit Beschreibung unter Register Tabelle → <b>Funktion</b> (fx).</div>', 'gelb'));
    p.boxes.push(...B);
  },

  /* ---------------------------------------------------------- Diagramme */
  build_diagramme(p) {
    this.z = 1;
    const B = [];
    B.push(this.box(0, 0, 560, '<h1>Diagramme</h1><div>Grafiken aus Tabellendaten – <b>immer verknüpft</b>: ändert sich eine Zahl, ändert sich das Diagramm. Kommen Zeilen dazu, wächst es mit.</div>', { style: { bg: 'transparent' } }));
    const t1 = this.sheet(0, 140, 'Verkauf', [['Monat', 'Äpfel', 'Birnen'], ['Jan', 120, 80], ['Feb', 135, 92], ['Mär', 150, 101], ['Apr', 142, 110], ['Mai', 171, 124], ['Jun', 188, 131]], { cols: [80, 80, 80], extraRows: 2 });
    B.push(t1);
    B.push(this.chart(300, 120, 470, t1, 'A1:C7', { type: 'col', title: 'Verkauf pro Monat', h: 270 }));
    const t2 = this.sheet(0, 480, 'Messung', [['Zeit (s)', 'Weg (m)'], [0, 0.1], [1, 2.1], [2, 3.9], [3, 6.2], [4, 7.8], [5, 10.1]], { cols: [86, 86], color: '#ca5010', extraRows: 1 });
    B.push(t2);
    B.push(this.chart(230, 460, 420, t2, 'A1:B7', { type: 'scatter', title: 'Weg-Zeit-Diagramm', trend: 'lin', h: 250, xTitle: 'Zeit (s)', yTitle: 'Weg (m)' }));
    B.push(this.note(820, 0, 360, '<h3>So geht’s</h3>' + this.list([
      'In der Tabelle <b>eine Zelle</b> der Daten anklicken (oder einen Bereich markieren) → Register <b>Tabelle → Diagramm</b> oder <b>Einfügen → Diagramm</b>.',
      'Kopfzeile und Kategorien (Text, Datum) werden erkannt wie in Excel. Erste Spalte mit Zahlen + Typ <b>Punkte</b> = x-Werte.',
      '<b>Werte ablesen</b>: mit der Maus über Balken und Punkte fahren – auch zwischen den Punkten (gestrichelte Hilfslinie).',
      '<b>Klick auf einen Punkt</b> zeigt die Zelle in der Tabelle.',
      '<b>Doppelklick</b> aufs Diagramm: Typ, Titel, Achsen, Farben, <b>Trendlinie</b> mit Gleichung und R².',
      'Register <b>Diagramm</b>: „Werte anzeigen“, „Als Tabelle“, „Daten markieren“.',
    ]), 'blau'));
    B.push(this.note(820, 420, 360, '<h3>Probier es aus</h3>' + this.check([
      'In „Verkauf“ den Wert für Mai auf 250 ändern – der Balken wächst sofort',
      'In Zeile 8 schreiben: <b>Jul · 205 · 140</b> – das Diagramm nimmt die neue Zeile automatisch dazu',
      'Im Weg-Zeit-Diagramm über die Linie fahren und Werte ablesen',
      'Doppelklick auf ein Diagramm und den Typ auf Linie oder Fläche wechseln',
    ]), 'gruen'));
    p.boxes.push(...B);
  },

  /* ---------------------------------------------------------- Rechner & Fotomath */
  build_rechner(p) {
    this.z = 1;
    const B = [];
    B.push(this.box(0, 0, 600, '<h1>Rechner &amp; Fotomath</h1><div>Ein Taschenrechner, der neben der Seite schwebt, und Fotomath, das <b>deine Handschrift ausrechnet</b> – beides ohne Internet.</div>', { style: { bg: 'transparent' } }));
    B.push(this.note(0, 120, 400, '<h3>Taschenrechner (Alt+R)</h3>' + this.list([
      'Knopf <b>Rechner</b> oben in der Titelleiste oder Einfügen → Rechner.',
      '<b>⇄ Standard / Wissenschaftlich</b>: einfacher Rechner wie auf dem Handy oder der TI-30X Plus mit allen Funktionen.',
      '<b>2nd</b> drückt die blaue Zweitfunktion – die Beschriftungen tauschen, damit man sie gut sieht.',
      '<b>Brüche</b>: n/d-Taste oder auf der Tastatur <b>/</b> (die Zahl davor wird der Zähler, ▼ = Nenner). Teilen mit <b>:</b> oder ÷.',
      'Im <b>Verlauf</b> Rechnung oder Ergebnis anklicken = wieder einfügen.',
      'Eine <b>Ecke ziehen</b> = Grösse ändern (auch Strg+Mausrad), <b>Doppelklick auf den oberen Rand</b> = Standardgrösse, „–“ = minimieren.',
    ]), 'blau'));
    B.push(this.note(0, 470, 400, '<h3>Fotomath (Alt+M)</h3>' + this.list([
      'Mit einem Stift (Register <b>Zeichnen</b>) eine Rechnung schreiben.',
      '<b>Einfügen → Fotomath</b> und einen <b>Rahmen</b> um die Rechnung ziehen.',
      'Über jedem Zeichen steht, was erkannt wurde – <b>Klick</b> darauf = korrigieren. Fotomath merkt sich das und lernt deine Schrift.',
      'Ergebnis <b>daneben einfügen</b>, als <b>Formel</b> setzen, Handschrift <b>ersetzen</b> oder im Rechner weiterrechnen.',
      '<b>Rechenweg</b> wie in der App: jeder Schritt mit Erklärung (Punkt vor Strich, gemeinsamer Nenner, „| −3“, Mitternachtsformel …).',
      '<b>Als Text einfügen</b>: nur das Ergebnis oder der ganze Rechenweg – mit mathematischen Zeichen (·, ², √) oder mit Häkchen nur Tastaturzeichen (*, ^, sqrt).',
      'Gleichungen mit <b>x</b> werden gelöst, Brüche, Hochzahlen und Wurzeln erkannt.',
      '<b>Bilder</b> (Scan, Foto einer Rechnung) gehen auch (Beta): dunkle Schrift auf hellem Papier, Zeichen nicht zusammengeschrieben.',
    ]), 'gelb'));
    B.push(this.note(480, 120, 420, '<h3>Probier es aus</h3>' + this.check([
      'Fotomath öffnen (Alt+M) und einen Rahmen um die Rechnung unten ziehen',
      'Mit „= Ergebnis daneben“ das Resultat hinschreiben lassen',
      'Die Gleichung darunter lösen lassen und den Rechenweg aufklappen',
      '„Mit Rechenweg“ als Text einfügen',
      'Selbst etwas schreiben, z.B. 5² − √16 =',
    ]), 'gruen'));
    p.drawings.push(...this.ink([{ frac: ['3', '4'] }, '+', { frac: ['1', '2'] }, '='], 500, 470, 34));
    p.drawings.push(...this.ink(['2x+3=11'], 500, 640, 34, '#a0301f'));
    p.boxes.push(...B);
  },

  /* ---------------------------------------------------------- Willkommen (Startseite des Notizbuchs) */
  build_willkommen(p) {
    this.z = 1;
    const browser = Backend.kind === 'browser';
    const yellow = { bg: '#FFF4C2', border: '#E8C547', color: '#252423' }, blue = { bg: '#DCEBFF', border: '#6AA3E8', color: '#252423' }, green = { bg: '#DDF3E0', border: '#5DB36A', color: '#252423' };
    // die ersten sechs Felder wie bis 1.35 (Reihenfolge zählt für ältere Abläufe)
    const intro = this.box(0, 0, 440, '<h1>Willkommen in KnowledgeTree</h1><div>Dein <b>Notizbuch wie OneNote</b> und dein <b>Wissensnetz wie Obsidian</b> in einem – zum Lernen, Planen und Brainstormen, ganz ohne Internet.</div><div><br></div><div>Klicke irgendwo auf die freie Fläche – dort entsteht sofort ein Textfeld und du kannst lostippen.</div><div><br></div><div><b>Links</b> deine Notizbücher mit Abschnitten, <b>daneben</b> die Seiten mit Unterseiten, <b>oben</b> die Tabs der offenen Seiten.</div>' + (browser ? '<div><br></div><div>Alles wird automatisch <b>in diesem Browser</b> gespeichert. Mach ab und zu unter <b>Datei → Backup erstellen</b> eine Sicherung.</div>' : ''), { style: { bg: 'transparent' } });
    const how = this.box(0, browser ? 330 : 270, 380, '<h3>Bedienung</h3>' + this.list(['<b>Leiste oben</b> am Feld ziehen = verschieben', '<b>Rechte Kante</b> ziehen = Breite', 'Bilder <b>hineinziehen</b> oder mit <b>Strg+V</b> einfügen', '<b>Strg+Z</b> = rückgängig (100 Schritte)', '<b>Alt+←</b> = zur vorherigen Seite', '<b>Mittelklick</b> auf eine Seite = neuer Tab · <b>Doppelklick</b> auf den Tab = umbenennen']));
    const idea1 = this.box(520, 60, 230, '<b>Idee A</b><div>Mehrere Felder mit Umschalt+Klick wählen und <b>Strg+G</b> drücken → ein Paket.</div>', { style: yellow });
    const idea2 = this.box(520, 190, 230, '<b>Idee B</b><div>Gehört zum selben Paket – zieh am Paket, und beide wandern mit.</div>', { style: yellow });
    const node = this.box(860, 120, 250, '<b>Knowledge Tree</b><div><b>Rechtsklick gedrückt halten</b> und auf ein anderes Feld ziehen = verbinden (wie Shader-Nodes in Blender).</div><div>Strg + Rechtsklick ziehen = Verbindung durchschneiden.</div>', { style: blue });
    const todo = this.box(860, 360, 250, '<ul class="checklist"><li class="done">Programm geöffnet</li><li>Eigenen Abschnitt erstellen</li><li>Ideen verbinden</li><li>Etwas zeichnen</li><li>Eine Tabelle rechnen lassen</li></ul>', { style: green });
    const k = { id: uid('k'), title: 'Paket: Ideen', color: '#ca5010', locked: false };
    idea1.pkg = k.id; idea2.pkg = k.id;
    const map = this.note(520, 560, 600, '<h3>Wegweiser durch die Erste-Schritte-Seiten</h3>' + this.list(this.ORDER.filter(x => x !== 'willkommen').map(x => `<b>${escapeHtml(this.TITLES[x])}</b> – ${escapeHtml(this.INFO[x])}`)) + '<div>Jede Seite: kurz <b>So geht’s</b>, dann <b>Probier es aus</b> mit echten Beispielen. Ändern ist erlaubt – mit Strg+Z kommt alles zurück. Fehlt eine Seite: <b>Datei → Hilfe → Alle Erste-Schritte-Seiten</b>.</div>', 'lila');
    const why = this.note(0, browser ? 560 : 500, 440, '<h3>Wozu KnowledgeTree?</h3>' + this.list(['<b>Mitschreiben</b> wie auf Papier: Text, Handschrift, Bilder, frei auf der Seite verteilt', '<b>Verstehen</b>: Ideen als Felder, mit Pfeilen verbunden, zu Paketen gruppiert – ein Wissensbaum', '<b>Rechnen & Lernen</b>: Tabellen wie Excel, Diagramme, Formeln, Chemie, Taschenrechner, Fotomath', '<b>Behalten</b>: alles automatisch gespeichert, Backups, Import aus OneNote, Export als PDF']), 'gelb');
    p.boxes.push(intro, how, idea1, idea2, node, todo, map, why);
    p.pkgs.push(k);
    p.links.push(this.link(k.id, node.id, { label: 'führt zu' }), this.link(node.id, todo.id, { color: '#498205' }));
  },

  /* ---------------------------------------------------------- Zeichnen & Formen */
  build_zeichnen(p) {
    this.z = 1;
    p.boxes.push(this.box(0, 0, 420, '<h2>Zeichnen</h2><div>Im Register <b>Zeichnen</b> findest du Stifte, Textmarker, Radierer, Lasso und Formen. Nochmals auf einen Stift klicken = Farbe, Stärke und Art ändern.</div><div><br></div><div><b>Esc</b> bringt dich zurück zum Auswählen und Schreiben.</div><div><br></div><div>Mit <b>Formerkennung</b> werden gezeichnete Kreise, Rechtecke und Linien automatisch sauber. Das <b>Lineal</b> hilft bei geraden Linien.</div>'));
    p.boxes.push(this.note(860, 0, 400, this.steps([
      '<b>Stifte</b>: 8 Plätze (Kugelschreiber, Bleistift, Textmarker, Regenbogen, Glitzer …) – einer gewählt = zeichnen; mit dem Grafikstift geht es druckempfindlich.',
      '<b>Radierer</b>: ganze Striche oder punktgenau (Strich / Punkt / Grösse). Die Radiertaste am Stift radiert direkt.',
      '<b>Lasso</b>: Striche einkreisen → verschieben, kopieren, löschen, Farbe ändern.',
      '<b>Formen</b>: Linie, Pfeil, Rechteck, Ellipse, Dreieck, Raute, Achsenkreuz – mit <b>Umschalt</b> gerade bzw. Quadrat/Kreis; Füllfarbe daneben.',
      '<b>Lineal</b> und <b>Winkelmesser</b>: mit dem Mausrad drehen, am Griff länger ziehen – die Zentimeter stimmen auf dem gedruckten Blatt.',
      '<b>Nur mit Stift</b>: der Finger verschiebt die Seite, nur der Stift zeichnet (Tablet).',
      '<b>Umwandeln</b>: Freihand → Form oder → Text (Handschrift wird getippter Text).',
      '<b>Ebene</b>: Zeichnungen vor oder hinter den Text legen.',
    ]), 'blau'));
    p.boxes.push(this.note(860, 470, 400, this.tryit([
      'Einen Stift wählen und unter die Welle einen eigenen Strich ziehen',
      'Mit dem Lasso die rote Ellipse einkreisen und verschieben',
      '„Formerkennung“ einschalten und einen Kreis von Hand zeichnen',
      'Das Lineal einblenden, drehen und daran entlang zeichnen',
      'Esc – und wieder Text schreiben',
    ]), 'gruen'));
    const wave = [];
    for (let i = 0; i <= 40; i++) { const x = 20 + i * 9; wave.push(x, Math.round((300 + Math.sin(i / 4) * 26) * 10) / 10, 0.5); }
    const hl = [];
    for (let i = 0; i <= 20; i++) hl.push(14 + i * 12, 54, 0.5);
    p.drawings.push(
      { id: uid('d'), type: 'ink', kind: 'marker', color: '#FFE600', w: 16, pts: hl, t0: 1, dur: 500, layer: 'oben' },
      { id: uid('d'), type: 'ink', kind: 'pen', color: '#2f5fd0', w: 2.6, pts: wave, t0: 2, dur: 900, layer: 'oben' },
      { id: uid('d'), type: 'shape', shape: 'ellipse', x1: 480, y1: 40, x2: 600, y2: 140, color: '#d13438', w: 2.5, fill: null, t0: 3, layer: 'oben' },
      { id: uid('d'), type: 'shape', shape: 'arrow', x1: 470, y1: 230, x2: 600, y2: 170, color: '#1f1f1f', w: 2.2, fill: null, t0: 4, layer: 'oben' },
      { id: uid('d'), type: 'shape', shape: 'rect', x1: 640, y1: 60, x2: 780, y2: 150, color: '#038387', w: 2.2, fill: '#DDF3E0', t0: 5, layer: 'unten' },
    );
  },

  /* ---------------------------------------------------------- Struktur */
  build_struktur(p) {
    this.z = 1;
    p.boxes.push(this.box(0, 0, 460, '<h2>So ist alles geordnet</h2><ul><li><b>Notizbuch</b> → <b>Abschnittsgruppen</b> → <b>Abschnitte</b> (farbige Register) → <b>Seiten</b></li><li>Unterseiten: Seite in der Liste nach rechts ziehen oder <b>Strg+Alt+]</b></li><li>Mehrere Seiten: <b>Strg</b>/<b>Umschalt</b> + Klick, dann ziehen oder Rechtsklick → <i>Verschieben nach …</i></li><li><b>Schnellnotizen</b> (Alt+Umsch+N) für schnelle Gedanken</li><li><b>Seitenversionen</b>: Rechtsklick auf eine Seite</li><li>Rechtsklick auf den Tab → <i>Datum ändern</i></li></ul>'));
    p.boxes.push(this.note(540, 0, 420, this.steps([
      '<b>Neu</b>: unten links „+ Abschnitt“/„+ Gruppe“, oben in der Seitenliste „+“ (Alt+N) – oder Rechtsklick in eine Liste.',
      '<b>Umbenennen</b>: Doppelklick (Seiten: auch Doppelklick auf den Tab oder F2).',
      '<b>Farbe</b> eines Abschnitts: Rechtsklick → Farbe. Sie färbt Register, Tab-Punkt und den Rahmen der Seite.',
      '<b>Ordnen</b>: Abschnitte und Seiten mit der Maus ziehen; Seiten sortieren mit dem Knopf über der Liste.',
      '<b>Kopieren & Einfügen</b> von Seiten, Abschnitten, ganzen Notizbüchern: Rechtsklick → Kopieren, beim Ziel → Einfügen.',
      '<b>Notizbuch schliessen</b>: Datei → Informationen → Einstellungen ▾. Unter „Öffnen“ wieder öffnen.',
      '<b>Suchen</b> in allen Seiten: Strg+F (Ersetzen: Strg+H), oben rechts das Suchfeld.',
    ]), 'blau'));
    p.boxes.push(this.note(540, 470, 420, this.tryit([
      'Einen neuen Abschnitt „Test“ anlegen und ihm eine Farbe geben',
      'Diese Seite mit Strg+Alt+[ ausrücken und mit Strg+Alt+] wieder einrücken',
      'Mit Strg+F nach „Paket“ suchen',
      'Rechtsklick auf eine Seite → Seitenversionen ansehen',
    ]), 'gruen'));
  },

  /* ---------------------------------------------------------- Text & Formatieren */
  build_text(p) {
    this.z = 1;
    this.title(p, 'Text &amp; Formatieren', 'Jedes Textfeld ist ein kleines Word: Überschriften, Listen, Farben, Links – und es steht genau dort auf der Seite, wo du es willst.');
    p.boxes.push(this.note(0, 130, 400, this.steps([
      '<b>Klick auf die freie Fläche</b> = neues Textfeld. <b>Esc</b> beendet das Schreiben.',
      'Register <b>Start</b>: Schriftart, Grösse, <b>F</b>/<i>K</i>/<u>U</u>, Farbe, Textmarker, Ausrichtung, Listen, Einzug.',
      '<b>Formatvorlagen</b>: Überschrift 1–3, Zitat, Code – ein Klick formatiert den ganzen Absatz.',
      '<b>Zeichnung</b> (Start): fertige Feldstile (Idee, Info, Erledigt, Wichtig …), Füll- und Rahmenfarbe.',
      '<b>Format übertragen</b> (Pinsel): Format kopieren und auf anderen Text „malen“.',
      'Register <b>Einfügen</b>: Link (Strg+K), Checkliste, Datum (Alt+Umsch+D), Trennlinie, Symbol.',
      '<b>Lesbare Farben</b>: Schrift passt sich dem Hintergrund an (auch im dunklen Design).',
      '<b>Rechtschreibung</b> wie in OneNote: unbekannte Wörter rot unterwellt, <b>Rechtsklick</b> = Vorschläge, <b>F7</b> geht die Seite Wort für Wort durch. Deutsch und Englisch gleichzeitig, mit Fachwörtern (Register <b>Überprüfen</b>).',
    ]), 'blau'));
    p.boxes.push(this.box(460, 130, 300, '<h2>Überschrift 2</h2><div>Normaler Text mit <b>fett</b>, <i>kursiv</i>, <u>unterstrichen</u>, <span style="background-color: rgb(255, 255, 0);">Textmarker</span> und <span style="color: rgb(192, 0, 0);">roter Schrift</span>.</div><ol><li>Nummerierte Liste</li><li>Tab = Einzug<ol><li>zweite Ebene</li></ol></li></ol><ul class="checklist"><li class="done">Checkliste – Klick aufs Kästchen</li><li>noch offen</li></ul><div>Link: <a href="https://de.wikipedia.org/wiki/Mindmap">Mindmap (Wikipedia)</a></div>'));
    const st = [['Idee', '#FFF4C2', '#E8C547'], ['Info', '#DCEBFF', '#6AA3E8'], ['Erledigt', '#DDF3E0', '#5DB36A'], ['Wichtig', '#FDE0E0', '#E06666'], ['Frage', '#EDE3FA', '#9B7AD6']];
    st.forEach(([n, bg, bd], i) => p.boxes.push(this.box(800 + (i % 2) * 150, 130 + Math.floor(i / 2) * 80, 136, `<b>${n}</b><div>Feldstil „${n}“</div>`, { style: { bg, border: bd, color: '#252423' } })));
    p.boxes.push(this.note(460, 470, 420, this.tryit([
      'Ein Wort im Feld oben markieren und fett machen (Strg+B)',
      'Einen Absatz mit „Überschrift 1“ formatieren',
      'Mit dem Pinsel das Format der roten Schrift auf ein anderes Wort übertragen',
      'Ein neues Feld anlegen und ihm den Stil „Wichtig“ geben',
      'Das zweite Kästchen der Checkliste abhaken',
      'Ein Wort absichtlich falsch schreiben, z.B. „Rechtschreibunk“ – Rechtsklick darauf und den Vorschlag wählen',
    ]), 'gruen'));
  },

  /* ---------------------------------------------------------- Knowledge Tree */
  build_tree(p) {
    this.z = 1;
    this.title(p, 'Knowledge Tree', 'Das Herz von KnowledgeTree: Gedanken als Felder, mit Pfeilen verbunden, zu Paketen gruppiert. So wird aus Notizen ein Wissensbaum – ideal zum Brainstormen, für Zusammenfassungen und Lernpläne.', 700);
    const c = { bg: '#2B2F36', border: '#2B2F36', color: '#F5F5F5' }, y = { bg: '#FFF4C2', border: '#E8C547', color: '#252423' }, b = { bg: '#DCEBFF', border: '#6AA3E8', color: '#252423' }, g = { bg: '#DDF3E0', border: '#5DB36A', color: '#252423' };
    const root = this.box(330, 330, 180, '<b>Prüfung Chemie</b><div>Thema in der Mitte</div>', { style: c });
    const a1 = this.box(20, 200, 190, '<b>Stöchiometrie</b><div>Molmasse, Stoffmenge</div>', { style: y });
    const a2 = this.box(20, 440, 190, '<b>Gasgesetz</b><div>p·V = n·R·T</div>', { style: y });
    const b1 = this.box(640, 190, 200, '<b>Übungen</b><ul class="checklist"><li class="done">Blatt 1</li><li>Blatt 2</li></ul>', { style: b });
    const b2 = this.box(640, 330, 200, '<b>Fragen an den Lehrer</b><div>Wann gilt das ideale Gas?</div>', { style: b });
    const g1 = this.box(640, 500, 200, '<b>Lernplan</b><div>Mo: Theorie · Mi: Übungen · Fr: Probe</div>', { style: g });
    const k = { id: uid('k'), title: 'Paket: Praxis', color: '#0078d4', locked: false };
    b1.pkg = k.id; b2.pkg = k.id;
    p.boxes.push(root, a1, a2, b1, b2, g1);
    p.pkgs.push(k);
    p.links.push(this.link(a1.id, root.id, { label: 'Grundlage' }), this.link(a2.id, root.id), this.link(root.id, k.id, { label: 'üben', color: '#0078d4' }),
      this.link(root.id, g1.id, { style: 'winkel', color: '#498205', dash: true }));
    p.boxes.push(this.note(900, 120, 400, this.steps([
      '<b>Verbinden</b>: Rechtsklick auf ein Feld gedrückt halten und auf ein anderes ziehen – oder den Punkt am Rand ziehen. Finger: lange drücken → „Verbinden mit …“.',
      '<b>Schneiden</b>: Strg + Rechtsklick quer über Linien ziehen.',
      '<b>Linie anklicken</b>: Punkte ziehen = biegen oder Ansatzpunkt versetzen; Doppelklick = Beschriftung.',
      'Register <b>Verbindungen</b>: Kurve, gerade, eckig, Ausweichen, Pfeile, Farbe, Stärke, gestrichelt.',
      '<b>Pakete</b>: Felder wählen (Umschalt+Klick oder Rahmen ziehen) → <b>Strg+G</b>. Ein Paket hat Titel und Farbe und lässt sich selbst verbinden.',
      '<b>Als Baum anordnen</b> (Verbindungen): alles automatisch von links nach rechts sortieren.',
      '<b>Sperren</b> (Anordnen, Strg+Umsch+L): Felder bleiben, wo sie sind.',
    ]), 'blau'));
    p.boxes.push(this.note(900, 560, 400, this.tryit([
      'Das Feld „Prüfung Chemie“ verschieben – die Linien gehen mit',
      'Ein neues Feld anlegen und mit „Gasgesetz“ verbinden',
      'Die Linie „Grundlage“ anklicken und biegen',
      'Doppelklick auf eine Linie und eine Beschriftung schreiben',
      'Verbindungen → „Als Baum anordnen“ ausprobieren (Strg+Z macht es rückgängig)',
    ]), 'gruen'));
  },

  /* ---------------------------------------------------------- Formeln & Chemie */
  build_formeln(p) {
    this.z = 1;
    this.title(p, 'Formeln &amp; Chemie', 'Mathematik und Chemie sauber gesetzt – direkt im Text, ohne Zusatzprogramm.');
    const F = (t, d) => (typeof Formula !== 'undefined' ? Formula.spanHtml(t, d) : t);
    p.boxes.push(this.box(0, 120, 430, '<h3>Formeln (Alt+=)</h3><div>Pythagoras: ' + F('a^2+b^2=c^2') + '</div><div><br></div><div>Mitternachtsformel:</div>' + F('x=\\frac{-b\\pm\\sqrt{b^2-4ac}}{2a}', true) + '<div>Energie: ' + F('E=m\\cdot c^2') + ' · Summe: ' + F('\\sum_{i=1}^{n} i=\\frac{n(n+1)}{2}') + '</div>'));
    p.boxes.push(this.box(0, 400, 430, '<h3>Chemie im Text</h3><div>Wasser H<sub>2</sub>O · Schwefelsäure H<sub>2</sub>SO<sub>4</sub> · Ion SO<sub>4</sub><sup>2−</sup></div><div>2 H<sub>2</sub> + O<sub>2</sub> → 2 H<sub>2</sub>O</div>'));
    p.boxes.push(this.note(480, 120, 420, this.steps([
      '<b>Einfügen → Formel</b> oder <b>Alt+=</b>: Vorlagen (Bruch, Wurzel, Summe, Matrix …) oder direkt tippen wie <code>\\frac{a}{b}</code>.',
      '<b>Doppelklick</b> auf eine Formel = bearbeiten.',
      '<b>Zeichnen → Chem-Draw</b>: Strukturformeln zeichnen – Atom anklicken = Bindung anhängen, Buchstabe tippen = Element, Vorlagen und rund 250 Moleküle zum Suchen.',
      'Chem-Draw benennt das Molekül (IUPAC) und zeigt Lewis-, Bohr-, Orbital- und 3D-Modelle. Es ist ein eingebautes <b>Add-In</b>: im Register <b>Add-Ins</b> mit dem Häkchen ein- und ausschalten.',
      '<b>Periodensystem</b>: Element anklicken = Eigenschaften; ins Dokument übernehmen.',
      '<b>Summenformel</b>: tippt H2SO4 tiefgestellt ein.',
    ]), 'blau'));
    p.boxes.push(this.note(480, 470, 420, this.tryit([
      'Doppelklick auf die Mitternachtsformel und ein Zeichen ändern',
      'Mit Alt+= eine eigene Formel einfügen, z.B. \\sqrt{2}',
      'Zeichnen → Chem-Draw öffnen und in den Vorlagen „Ethanol“ suchen',
      'Das Periodensystem öffnen und Eisen (Fe) anklicken',
    ]), 'gruen'));
  },

  /* ---------------------------------------------------------- Bilder, Dateien & Videos */
  build_medien(p) {
    this.z = 1;
    this.title(p, 'Bilder, Dateien &amp; Videos', 'Arbeitsblätter, Fotos von der Wandtafel, PDFs und Videos gehören direkt zu deinen Notizen – und du schreibst darauf.');
    p.boxes.push(this.note(0, 120, 430, this.steps([
      '<b>Bild</b>: hineinziehen, Strg+V oder Einfügen → Bild. Ecke ziehen = Grösse, im Text verschieben wie in Word.',
      '<b>Datei anhängen</b>: hineinziehen oder Einfügen → Datei – erscheint als 📎. Klick = öffnen.',
      '<b>PDF als Seiten</b>: Rechtsklick auf den Anhang → <i>Seiten als Bilder aufklappen</i> – dann darauf schreiben und zeichnen (auch Word/PowerPoint-Bilder).',
      '<b>Als Hintergrund</b>: Rechtsklick → <i>Bild / Text / Zeichnung als Hintergrund</i> (bei gemischter Auswahl auch <i>Alles als Hintergrund</i>) – liegt hinten, bleibt auswählbar, ist aber verankert.',
      '<b>Videos</b> (z.B. aus OneNote): Vorschaubild mit ▶ – Klick spielt es ab.',
      'Im Programm (EXE) liegen die Bilder im Ordner <b>_Bilder</b> ihres Abschnitts.',
    ]), 'blau'));
    p.boxes.push(this.note(480, 120, 400, this.tryit([
      'Ein Bild vom Desktop auf diese Seite ziehen',
      'Ein PDF hineinziehen und die Seiten aufklappen',
      'Mit dem Textmarker etwas auf dem Bild markieren',
      'Das Bild als Hintergrund festlegen und ein Textfeld darauf schreiben',
    ]), 'gruen'));
    p.boxes.push(this.note(480, 420, 400, '<b>Tipp</b><div>Arbeitsblatt fotografieren → hineinziehen → als Hintergrund festlegen → mit dem Stift ausfüllen. Mit Fotomath lässt sich die Handschrift sogar ausrechnen.</div>', 'gelb'));
  },

  /* ---------------------------------------------------------- Tabs, Ansicht & Handy */
  build_tabs(p) {
    this.z = 1;
    this.title(p, 'Tabs, Ansicht &amp; Handy', 'Mehrere Seiten gleichzeitig offen – nebeneinander wie in Obsidian. Und alles geht auch auf dem Handy und Tablet.');
    p.boxes.push(this.note(0, 120, 430, this.steps([
      '<b>Neue Seite</b>: <b>+</b> in der Tableiste (öffnet sie in einem neuen Tab). Kurz darüber halten = <b>Word, Excel oder PowerPoint</b>. Rechtsklick auf <b>+</b> = Seitentypen, diese Seite in neuem Tab, zuletzt geöffnete. <b>Neuer Tab</b> mit einer Seite: Mittelklick auf die Seite in der Liste.',
      '<b>Doppelklick</b> auf den Tab = Seite umbenennen. Mittelklick oder × = schliessen.',
      '<b>Teilen</b>: ⋮ → Rechts teilen / Unten teilen, oder einen Tab an den rechten bzw. unteren Rand ziehen.',
      '<b>Als Fenster lösen</b>: einen Tab auf die Mitte der Seite ziehen (oder Rechtsklick → Als Fenster lösen) – ein frei verschiebbares Fenster wie auf dem Desktop; an der Titelleiste ziehen, an Rand/Ecke grösser machen, auf eine Tableiste ziehen oder der Knopf „Andocken“ = zurück in die Tableiste. Im Vollbild eine Kachel an ihrer Kopfzeile wegziehen.',
      'Die <b>Trennlinie</b> ziehen = Grösse; Doppelklick = gleich gross. Klick in einen anderen Bereich = dort arbeiten.',
      '<b>Einklappen</b>: ⌃ rechts in der Tableiste – es bleibt ein Strich; wieder aufklappen nur mit dem Pfeilchen am Strich. Im Vollbild: Pfeilchen oben links = Menüband ein-/ausblenden.',
      '<b>Vollbild</b> (F11): alle offenen Tabs als Kacheln – der Pfeil ⤢ oben rechts zeigt einen allein, ⤡ wieder alle.',
      '<b>Stift ↔ Auswählen</b>: der Knopf rechts in der Registerzeile (im Vollbild oben links) wechselt jederzeit zwischen Auswählen und dem zuletzt benutzten Stift.',
      'Register <b>Ansicht</b>: Zoom, Seitenfarbe, Linien/Karos, Vollbild (F11), Hell/Dunkel, Navigation ein/aus.',
    ]), 'blau'));
    p.boxes.push(this.note(480, 120, 400, '<h3>Handy &amp; Tablet</h3>' + this.list([
      '☰ oben links: Notizbücher und Seiten',
      'Ein Finger = Seite verschieben, zwei Finger = zoomen',
      'Lange drücken = Kontextmenü (wie Rechtsklick)',
      'Antippen auf die freie Fläche = Textfeld',
      'Auf dem Handy siehst du einen Bereich – die Tabs aller Bereiche stehen oben',
      'Menüband: Register antippen; ⌄ hält es offen',
    ]), 'gelb'));
    p.boxes.push(this.note(480, 470, 400, this.tryit([
      'Mittelklick auf „Diagramme“ in der Seitenliste',
      'Den neuen Tab an den rechten Rand dieser Seite ziehen – zwei Seiten nebeneinander',
      'In der Tableiste auf ⌃ klicken und dann mit der Maus an den Strich fahren',
      'F11 drücken: alle Tabs als Kacheln – mit ⤢ einen davon allein zeigen, F11 beendet',
    ]), 'gruen'));
  },

  /* ---------------------------------------------------------- Speichern, Import & Export */
  build_sichern(p) {
    this.z = 1;
    const browser = Backend.kind === 'browser';
    this.title(p, 'Speichern, Import &amp; Export', 'Du musst nie speichern – KnowledgeTree speichert jede Änderung sofort. Hier steht, wo alles liegt und wie es sicher bleibt.');
    p.boxes.push(this.note(0, 120, 430, '<h3>Wo liegen meine Notizen?</h3>' + this.list(browser
      ? ['Auf der Webseite: <b>in diesem Browser</b> auf diesem Gerät (IndexedDB).', 'Genauer Ort: <b>Datei → Optionen → Speicher → Speicherort</b>.', 'Browserdaten löschen löscht auch die Notizen – darum <b>Backups</b>!']
      : ['Im Programm: im Ordner <b>Saves</b> neben der EXE – je Abschnitt ein Ordner, je Seite eine Datei, Bilder in <b>_Bilder</b>.', 'Genauer Ort: <b>Datei → Optionen → Speicher → Speicherort</b> (mit „Öffnen“).', 'Einen Abschnitt weitergeben: seinen Ordner kopieren.']), 'gelb'));
    p.boxes.push(this.note(0, 400, 430, this.steps([
      '<b>Backup</b>: Datei → Speichern & Sichern → Backup erstellen. Automatisch: Optionen → Sicherung.',
      '<b>Importieren</b>: Datei → Öffnen → Dateien wählen – OneNote (.one, .onepkg), KnowledgeTree-Dateien, ZIP, ganze Ordner.',
      '<b>Exportieren</b>: Datei → Exportieren – Seite, Abschnitt oder Notizbuch als PDF, Webseite, KnowledgeTree-Datei oder OneNote.',
      '<b>Drucken</b> (Strg+P): mit Vorschau, Massstab, Rändern und Kopfzeile.',
      '<b>Seitenversionen</b>: Rechtsklick auf eine Seite – frühere Stände ansehen und zurückholen.',
      '<b>Papierkorb</b>: gelöschte Seiten zurückholen (Datei → Informationen).',
    ]), 'blau'));
    p.boxes.push(this.note(480, 120, 400, this.tryit([
      'Datei → Optionen → Speicher: nachsehen, wo deine Notizen liegen',
      'Ein Backup erstellen',
      'Diese Seite als PDF exportieren (Rechtsklick auf die Seite → Exportieren)',
      'Strg+P und die Druckvorschau ansehen',
    ]), 'gruen'));
  },

  /* ---------------------------------------------------------- Tasten */
  build_tasten(p) {
    this.z = 1;
    this.title(p, 'Die wichtigsten Tasten', 'Alles geht auch mit der Maus – mit den Tasten geht es schneller. Die vollständige Liste: Datei → Hilfe → Tastenkürzel.');
    const rows = [['Taste', 'Wirkung'],
      ['Klick auf freie Fläche', 'neues Textfeld'], ['Esc', 'Schreiben bzw. Zeichnen beenden'], ['Strg+Z / Strg+Y', 'rückgängig / wiederholen'],
      ['Strg+C / X / V / D', 'kopieren / ausschneiden / einfügen / duplizieren'], ['Strg+B / I / U', 'fett / kursiv / unterstrichen'],
      ['Strg+K', 'Link'], ['Alt+=', 'Formel'], ['Strg+G', 'Paket bilden'], ['Rechtsklick halten + ziehen', 'verbinden'],
      ['Strg+F / Strg+H', 'suchen / ersetzen'], ['Alt+N / Strg+Alt+N', 'neue Seite / Unterseite'], ['Alt+Umsch+N', 'Schnellnotiz'],
      ['F2 / Doppelklick auf den Tab', 'Seite umbenennen'], ['Mittelklick auf eine Seite', 'in neuem Tab öffnen'], ['Alt+← / Alt+→', 'zurück / vor'],
      ['Strg+Mausrad', 'zoomen'], ['Leertaste + ziehen', 'Seite verschieben'], ['F11', 'Vollbild'], ['Strg+F1', 'Menüband ein-/ausklappen'],
      ['Alt+R / Alt+M', 'Rechner / Fotomath'], ['Strg+P', 'drucken']];
    p.boxes.push(this.sheet(0, 120, 'Tasten', rows, { cols: [210, 290], band: true }));
    p.boxes.push(this.note(560, 120, 360, this.tryit(['Ein Wort in der Tabelle suchen: Strg+F', 'Diese Tabelle nach Taste sortieren (Register Tabelle → A → Z)', 'Eine eigene Zeile mit deiner Lieblingstaste ergänzen']), 'gruen'));
  },
};
