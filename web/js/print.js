'use strict';
/* Drucken (seit 1.26, Datei → Drucken, Strg+P) – aufgebaut wie in Word, OneNote und Excel: links die Einstellungen,
 * rechts die Vorschau (Blätter mit Rändern), „Drucken“ öffnet dann den Druckdialog des Systems (Drucker, Exemplare,
 * „Als PDF speichern“).
 *
 *   Drucken:    aktuelle Seite · ausgewählte Seiten · Abschnitt · Notizbuch · Auswahl auf der Seite ·
 *               Tabelle (ganz oder markierter Bereich, wie Excel: Kopfzeile auf jedem Blatt wiederholt)
 *   Papier:     A4, A3, A5, Letter, Legal · Hoch-/Querformat · Ränder normal, schmal, breit
 *   Skalierung: an Blattbreite anpassen (wie OneNote) · ganze Seite auf ein Blatt · Originalgrösse · eigene %;
 *               was breiter ist als das Blatt, kommt auf weitere Blätter (Reihenfolge „zuerst nach unten“ wie Excel).
 *               Seit 1.30 mit Schieber „Massstab“ (10–400 %, zeigt auch den Massstab der Anpassen-Arten)
 *   Bereich:    seit 1.30 die Kanten des Druckbereichs selbst verschieben – unabhängig von Papier und Rändern: in der
 *               Vorschau an den Kanten ziehen oder oben/unten/links/rechts in cm eingeben (minus = mehr Weissraum)
 *   Kopf/Fuss:  Titel und Datum oben · „Seite x von y“ unten · Seitenhintergrund und Linien
 *
 * Vorgaben: Store.ui.drucken (Einstellungen → Drucken); der Dialog merkt sich die letzte Wahl.
 * Gedruckt wird wie beim PDF-Export (export.js): jede Seite wird hell dargestellt, kopiert und in Blätter geschnitten
 * (Export.snapshot) – Bilder kommen als Objekt-URLs, je Bild einmal. Viele Seiten: mehrere Druckaufträge (Export.pdfParts). */

const Print = {
  PAPER: { A4: [210, 297], A3: [297, 420], A5: [148, 210], Letter: [216, 279], Legal: [216, 356] },
  MARGINS: { normal: 15, schmal: 7, breit: 25 },
  defaults() { return { papier: 'A4', ausrichtung: 'hoch', raender: 'normal', skalierung: 'breite', prozent: 100, kopf: true, fuss: true, hintergrund: false, gitter: true }; },
  opts() { const u = Store.ui.drucken; return { ...this.defaults(), ...(u && typeof u === 'object' ? u : {}) }; },
  /* Blatt in mm und CSS-px (bedruckbarer Bereich; etwas Luft, damit der Browser ein Blatt nie auf zwei verteilt) */
  geom(o) {
    let [w, h] = this.PAPER[o.papier] || this.PAPER.A4;
    if (o.ausrichtung === 'quer') [w, h] = [h, w];
    const m = this.MARGINS[o.raender] ?? 15, PX = 96 / 25.4;
    return { w, h, m, PX, availW: Math.floor((w - 2 * m) * PX) - 2, fullH: Math.floor((h - 2 * m) * PX) - 6, HEAD: 60, FOOT: o.fuss ? 22 : 0 };
  },
  /* Blätter einer Seite der Grösse W×H: Massstab z, Ausschnitte ys (oben→unten) und xs (links→rechts), in Seiten-px */
  layout(W, H, o, g) {
    const head = o.kopf ? g.HEAD : 0, body = g.fullH - g.FOOT;
    let z = 1;
    if (o.skalierung === 'breite') z = Math.min(1, g.availW / W);
    else if (o.skalierung === 'blatt') z = Math.min(1, g.availW / W, (body - head) / H);
    else if (o.skalierung === 'prozent') z = clamp((+o.prozent || 100) / 100, 0.1, 4);
    const ys = [];
    for (let y = 0, k = 0; y < H - 0.5 || !ys.length; k++) { const h = (k ? body : body - head) / z; ys.push([y, Math.min(H, y + h)]); y += h; }
    const xs = [], tw = g.availW / z;
    for (let x = 0; x < W - 0.5 || !xs.length; x += tw) xs.push([x, Math.min(W, x + tw)]);
    return { z, ys, xs };
  },

  /* Druckbereich (1.30): o.crop = { l, t, r, b } in Seiten-px, nach innen positiv. Liefert den Ausschnitt einer Seite
   * mit Inhaltsrahmen x1/y1/W/H: verschoben und verkleinert (bzw. vergrössert), nie kleiner als 20 px. */
  cropBox(x1, y1, W, H, c) {
    if (!c) return { x1, y1, W, H };
    const l = +c.l || 0, t = +c.t || 0, r = +c.r || 0, b = +c.b || 0;
    return { x1: x1 + l, y1: y1 + t, W: Math.max(20, W - l - r), H: Math.max(20, H - t - b) };
  },
  hasCrop(c) { return !!c && !!(c.l || c.t || c.r || c.b); },

  /* ---------------------------------------------------------- Was drucken? */
  choices() {
    const out = [], pid = Canvas.pageId, page = pid && Store.pages[pid];
    if (page) out.push({ id: 'seite', label: `Aktuelle Seite („${page.title || 'Unbenannte Seite'}“)`, pages: [pid], name: page.title });
    const sel = [...(Sidebar.pageSel || [])].filter(id => Store.pages[id]);
    if (sel.length > 1) out.push({ id: 'seiten', label: `Ausgewählte Seiten (${sel.length})`, pages: sel, name: page ? page.title : 'Seiten' });
    const sec = Tree.groupOfPage(pid);
    if (sec && sec.pages.length > 1) out.push({ id: 'abschnitt', label: `Abschnitt „${sec.name}“ (${sec.pages.length} Seiten)`, pages: [...sec.pages], name: sec.name });
    const nb = sec && Tree.notebookOf(sec.id);
    if (nb && nb !== sec) { const ps = Tree.pagesDeep(nb); if (ps.length > (sec ? sec.pages.length : 0)) out.push({ id: 'notizbuch', label: `Notizbuch „${nb.name}“ (${ps.length} Seiten)`, pages: ps, name: nb.name }); }
    // Auswahl auf der Seite (Felder, Gruppen mit Inhalt)
    const only = new Set();
    for (const id of Canvas.sel) { only.add(id); if (Canvas.pkg(id)) for (const m of Canvas.members(id)) only.add(m.id); }
    if (page && only.size) out.push({ id: 'auswahl', label: `Auswahl auf der Seite (${Canvas.sel.size} Objekt${Canvas.sel.size === 1 ? '' : 'e'})`, pages: [pid], only, name: page.title });
    // Tabelle: aktive oder einzeln ausgewählte
    const a = Sheet.active, tb = a ? Sheet.box(a.id) : Canvas.sel.size === 1 ? Canvas.box([...Canvas.sel][0]) : null;
    if (tb && tb.sheet) {
      const d = tb.sheet, s = a && a.id === tb.id ? Sheet.sel() : null;
      // Excel-Seite (1.72): Druckbereich bzw. benutzter Bereich, Seite einrichten aus dem Blatt
      const xl = typeof OfficeXT !== 'undefined' && OfficeXT.on(tb.id);
      const rg = xl ? OfficeXT.printRange(tb) : { c1: 0, r1: 0, c2: d.ncols - 1, r2: d.nrows - 1 };
      out.push({ id: 'tabelle', label: xl ? `Blatt „${d.name}“ (${d.ps && d.ps.pa ? 'Druckbereich ' : ''}${XL.rangeText(rg.c1, rg.r1, rg.c2, rg.r2)})` : `Tabelle „${d.name}“ (wie Excel)`, table: { id: tb.id, ...rg }, name: d.name, xl });
      if (s && (s.c1 !== s.c2 || s.r1 !== s.r2)) out.push({ id: 'bereich', label: `Markierter Bereich ${XL.rangeText(s.c1, s.r1, s.c2, s.r2)}`, table: { id: tb.id, ...s }, name: d.name });
    }
    return out;
  },

  /* ---------------------------------------------------------- Dialog */
  async show(pre) {
    if (!Store.complete) return Store.gate(() => this.show(pre));   // alle Seiten nötig (Laden in Stufen, 1.30)
    if (!Canvas.page && !Store.groups.length) return;
    Hist.flushPending();
    const choices = this.choices();
    if (!choices.length) { UI.toast('Nichts zu drucken'); return; }
    const o = this.opts();
    o.crop = { l: 0, t: 0, r: 0, b: 0 };   // Druckbereich gilt nur für diesen Druck (nicht als Vorgabe gespeichert)
    const CM = 96 / 2.54, cropEls = {};
    let what = choices.find(c => c.id === (pre || (typeof OfficeGrid !== 'undefined' && OfficeGrid.page() ? 'tabelle' : ''))) || choices[0];
    // Excel-Seite: Papier, Ausrichtung, Ränder, Anpassen, Gitternetz wie unter „Seitenlayout“ (gilt für diesen Druck)
    const keep = what.xl ? { ...o } : null;
    if (what.xl) {
      const ps = (Sheet.box(what.table.id).sheet.ps) || {};
      o.papier = { 9: 'A4', 8: 'A3', 11: 'A5', 1: 'Letter', 5: 'Legal' }[ps.paper || 9] || 'A4';
      o.ausrichtung = ps.or === 'landscape' ? 'quer' : 'hoch';
      o.gitter = !!ps.pg;
      if (ps.m) o.raender = ps.m[0] <= 0.3 ? 'schmal' : ps.m[0] >= 1 ? 'breit' : 'normal';
      if (ps.fit) o.skalierung = ps.fit.w && ps.fit.h ? 'blatt' : 'breite';
      else if (ps.scale) { o.skalierung = 'prozent'; o.prozent = ps.scale; } else { o.skalierung = 'prozent'; o.prozent = 100; }
    }
    const urls = new Map(), snaps = new Map();
    let idx = 0, busy = 0, timer = null;
    const sel = (key, list) => {
      const s = el('select', { class: 'pr-sel' });
      for (const [v, l] of list) s.append(el('option', { value: v, text: l }));
      s.value = o[key];
      s.addEventListener('change', () => { o[key] = s.value; refresh(); });
      return s;
    };
    const chk = (key, label) => {
      const c = el('input', { type: 'checkbox' });
      c.checked = !!o[key];
      c.addEventListener('change', () => { o[key] = c.checked; refresh(); });
      return el('label', { class: 'opt-check' }, c, el('span', { text: label }));
    };
    const row = (label, ctl) => el('label', { class: 'pr-row' }, el('span', { text: label }), ctl);
    let frame, info, nav, pct, slider, scaleSel, gridRow, cropSec, prevBtn, nextBtn, whatSel, lastL = null;
    const saveable = () => { const x = { ...(keep || o) }; delete x.crop; return x; };
    // Massstab: Schieber und Zahl; wer daran dreht, wählt „Eigene Grösse“ (wie der Zoom in Word/Excel)
    const setPct = (v) => { o.prozent = clamp(Math.round(+v || 100), 10, 400); o.skalierung = 'prozent'; scaleSel.value = 'prozent'; slider.value = pct.value = o.prozent; refresh(); };
    const cropIn = (k, label) => {
      const i = el('input', { type: 'number', class: 'opt-num', step: 0.5, value: 0, title: label + ': cm nach innen, minus = mehr Rand' });
      i.addEventListener('change', () => { o.crop[k] = Math.round((+i.value || 0) * CM * 10) / 10; refresh(); });
      cropEls[k] = i;
      return el('label', { class: 'pr-cf' }, el('span', { text: label }), i);
    };
    const showCrop = () => { for (const k of ['l', 't', 'r', 'b']) cropEls[k].value = String(Math.round(o.crop[k] / CM * 10) / 10); };
    const go = await UI.dialog((d, close) => {
      d.classList.add('pr-dlg');
      whatSel = el('select', { class: 'pr-sel' });
      for (const c of choices) whatSel.append(el('option', { value: c.id, text: c.label }));
      whatSel.value = what.id;
      whatSel.addEventListener('change', () => { what = choices.find(c => c.id === whatSel.value); idx = 0; refresh(); });
      pct = el('input', { type: 'number', class: 'opt-num', min: 10, max: 400, step: 5, value: o.prozent, title: 'Massstab in Prozent' });
      pct.addEventListener('change', () => setPct(pct.value));
      slider = el('input', { type: 'range', class: 'pr-range', min: 10, max: 400, step: 1, value: o.prozent, title: 'Massstab: Grösse des Druckbereichs auf dem Papier' });
      slider.addEventListener('input', () => setPct(slider.value));
      scaleSel = sel('skalierung', [['breite', 'An Blattbreite anpassen'], ['blatt', 'Ganze Seite auf ein Blatt'], ['original', 'Originalgrösse (100 %)'], ['prozent', 'Eigene Grösse (Massstab)']]);
      gridRow = chk('gitter', 'Gitternetzlinien der Tabelle');
      cropSec = el('div', { class: 'pr-crop' },
        el('h3', { text: 'Druckbereich' }),
        el('div', { class: 'pr-cgrid' }, cropIn('t', 'Oben'), cropIn('b', 'Unten'), cropIn('l', 'Links'), cropIn('r', 'Rechts')),
        el('div', { class: 'pr-hint', text: 'cm nach innen (minus = mehr Weissraum) – oder in der Vorschau an den blauen Kanten ziehen. Unabhängig von Papier und Rändern.' }),
        el('button', { class: 'btn', text: 'Bereich zurücksetzen', onclick: () => { o.crop = { l: 0, t: 0, r: 0, b: 0 }; showCrop(); refresh(); } }));
      const left = el('div', { class: 'pr-opts' },
        el('h3', { text: 'Drucken' }), row('Was', whatSel),
        el('h3', { text: 'Seite einrichten' }),
        row('Papier', sel('papier', Object.keys(this.PAPER).map(k => [k, `${k} (${this.PAPER[k][0]} × ${this.PAPER[k][1]} mm)`]))),
        row('Ausrichtung', sel('ausrichtung', [['hoch', 'Hochformat'], ['quer', 'Querformat']])),
        row('Ränder', sel('raender', [['normal', 'Normal (15 mm)'], ['schmal', 'Schmal (7 mm)'], ['breit', 'Breit (25 mm)']])),
        row('Skalierung', scaleSel), el('div', { class: 'pr-pct' }, slider, pct, el('span', { text: '%' })),
        cropSec,
        el('h3', { text: 'Kopf- und Fusszeile' }),
        chk('kopf', 'Titel und Datum oben'), chk('fuss', 'Seitenzahl unten („Seite 1 von 3“)'),
        el('h3', { text: 'Mitdrucken' }),
        chk('hintergrund', 'Seitenfarbe und Linien/Raster'), gridRow);
      frame = el('iframe', { class: 'pr-frame', title: 'Druckvorschau' });
      prevBtn = el('button', { class: 'btn', text: '◀', title: 'Vorherige Seite', onclick: () => { if (idx > 0) { idx--; refresh(true); } } });
      nextBtn = el('button', { class: 'btn', text: '▶', title: 'Nächste Seite', onclick: () => { if (what.pages && idx < what.pages.length - 1) { idx++; refresh(true); } } });
      info = el('span', { class: 'pr-info', text: '…' });
      nav = el('div', { class: 'pr-nav' }, prevBtn, info, nextBtn);
      const right = el('div', { class: 'pr-prev' }, frame, nav);
      d.append(el('h2', { text: 'Drucken' }), el('div', { class: 'pr-body' }, left, right),
        el('div', { class: 'dlg-btns' },
          el('button', { class: 'btn', text: 'Als Standard speichern', title: 'Diese Einstellungen als Vorgabe merken (Einstellungen → Drucken)', onclick: () => { Store.ui.drucken = saveable(); UiState.save(); UI.toast('Druckeinstellungen gespeichert', 2000); } }),
          el('span', { class: 'grow' }),
          el('button', { class: 'btn', text: 'Abbrechen', onclick: () => close(false) }),
          el('button', { class: 'btn primary', text: 'Drucken …', autofocus: true, onclick: () => close(true) })));
      setTimeout(() => refresh(true), 0);
    }, { wide: true });
    clearTimeout(timer);
    const cleanup = () => { for (const u of urls.values()) if (u) URL.revokeObjectURL(u); };
    if (!go) { setTimeout(cleanup, 500); return; }
    Store.ui.drucken = saveable();   // letzte Wahl merken (wie Word/Excel innerhalb einer Sitzung)
    UiState.save();
    try { await this.run(what, o); } finally { setTimeout(cleanup, 2000); }

    // Vorschau: eine Seite (bzw. die Tabelle), auf echte Blattgrösse gerechnet und verkleinert angezeigt
    async function refresh(now) {
      clearTimeout(timer);
      gridRow.hidden = !what.table;
      cropSec.hidden = !!what.table;
      prevBtn.disabled = !what.pages || idx <= 0;
      nextBtn.disabled = !what.pages || idx >= what.pages.length - 1;
      timer = setTimeout(() => draw(), now ? 0 : 120);
    }
    function cropHandles(doc, f, L) { Print.cropHandles(doc, f, L, o.crop, () => { showCrop(); refresh(true); }); }
    async function draw() {
      const my = ++busy;
      const g = Print.geom(o);
      let html, sheets = 0;
      if (what.table) { html = Print.tableDoc(what.table, o, g, true); sheets = null; }
      else {
        const pid = what.pages[idx];
        const key = pid + (what.only ? ':sel' : '');
        if (!snaps.has(key)) {
          info.textContent = 'Vorschau wird erstellt …';
          let snap = null;
          await Export.renderEach([{ pid }], { set() { } }, async (page) => { snap = await Export.snapshot(page, null, { urls, attachments: false, only: what.only }); snap.page = page; });
          snaps.set(key, snap);
        }
        if (my !== busy) return;
        const s = snaps.get(key);
        if (!s) return;
        const r = Print.pageSheets(s, null, o, g, 0);
        sheets = r.n; lastL = r;
        // Anpassen-Arten: tatsächlichen Massstab am Schieber zeigen (ohne die eigene Grösse zu ändern)
        if (o.skalierung !== 'prozent') { pct.value = String(Math.round(r.z * 100)); slider.value = String(clamp(Math.round(r.z * 100), 10, 400)); }
        html = Print.doc(r.html.replace(/\u0000T\u0000/g, String(r.n)), o, g, what.name, true, await Export.appCss());
      }
      if (my !== busy) return;
      frame.srcdoc = html;
      frame.onload = () => {
        // auf die Breite der Vorschau verkleinern
        const b = frame.contentDocument && frame.contentDocument.body;
        if (!b) return;
        const f = Math.min(1, (frame.clientWidth - 24) / (g.w * g.PX + 2));
        b.style.zoom = String(f);
        if (!what.table && lastL) cropHandles(frame.contentDocument, f, lastL);
      };
      const p = what.pages ? `Seite ${idx + 1} von ${what.pages.length}` : 'Tabelle';
      if (!what.table && lastL && Print.hasCrop(o.crop)) info.title = 'Druckbereich angepasst';
      info.textContent = sheets == null ? `${p} · Kopfzeile wird auf jedem Blatt wiederholt` : `${p} · ${sheets} ${sheets === 1 ? 'Blatt' : 'Blätter'} · ${o.papier} ${o.ausrichtung === 'quer' ? 'quer' : 'hoch'}`;
    }
  },

  /* ---------------------------------------------------------- Drucken */
  /* Griffe an den Kanten des Druckbereichs in der Vorschau (1.30): oben am ersten Blatt, unten am letzten der ersten
   * Spalte, links an der ersten, rechts an der letzten Spalte. Ziehen verschiebt die Kante (in Seiten-px: Weg auf dem
   * Bildschirm / Vorschau-Zoom / Druckmassstab); losgelassen wird die Vorschau neu aufgebaut. */
  cropHandles(doc, f, L, crop, done) {
    const sheets = [...doc.querySelectorAll('.pr-sheet')];
    if (!sheets.length) return;
    const st = doc.createElement('style');
    st.textContent = '.kt-slice{outline:1px dashed #2f6fd0;outline-offset:0}.pr-h{position:absolute;z-index:9;touch-action:none;background:rgba(47,111,208,.0)}' +
      '.pr-h::after{content:"";position:absolute;background:#2f6fd0;border-radius:3px;opacity:.85}' +
      '.pr-h.t,.pr-h.b{left:0;right:0;height:14px;cursor:ns-resize}.pr-h.t{top:0}.pr-h.b{bottom:0}' +
      '.pr-h.l,.pr-h.r{top:0;bottom:0;width:14px;cursor:ew-resize}.pr-h.l{left:0}.pr-h.r{right:0}' +
      '.pr-h.t::after{top:0}.pr-h.b::after{bottom:0}.pr-h.l::after{left:0}.pr-h.r::after{right:0}' +
      '.pr-h.t::after,.pr-h.b::after{left:50%;width:56px;height:5px;margin-left:-28px}' +
      '.pr-h.l::after,.pr-h.r::after{top:50%;height:56px;width:5px;margin-top:-28px}' +
      '.pr-h.on{background:rgba(47,111,208,.18)}' +
      '@media (pointer:coarse){.pr-h.t,.pr-h.b{height:28px}.pr-h.l,.pr-h.r{width:28px}}';   // Finger: breitere Griffe
    doc.head.append(st);
    const at = (i) => sheets[i] && sheets[i].querySelector('.kt-slice');
    const spots = [['t', at(0)], ['l', at(0)], ['b', at(L.ny - 1)], ['r', at((L.nx - 1) * L.ny)]];
    for (const [k, slice] of spots) {
      if (!slice) continue;
      const h = doc.createElement('div');
      h.className = 'pr-h ' + k;
      h.title = { t: 'Obere Kante des Druckbereichs ziehen', b: 'Untere Kante ziehen', l: 'Linke Kante ziehen', r: 'Rechte Kante ziehen' }[k];
      slice.append(h);
      h.addEventListener('pointerdown', (ev) => {
        ev.preventDefault();
        h.setPointerCapture(ev.pointerId);
        h.classList.add('on');
        const x0 = ev.clientX, y0 = ev.clientY, vert = k === 't' || k === 'b';
        const mv = (e) => { const d = vert ? e.clientY - y0 : e.clientX - x0; h.style.transform = vert ? `translateY(${d / f}px)` : `translateX(${d / f}px)`; };
        const up = (e) => {
          h.removeEventListener('pointermove', mv); h.removeEventListener('pointerup', up); h.removeEventListener('pointercancel', up);
          const d = (vert ? e.clientY - y0 : e.clientX - x0) / f / L.z;
          if (Math.abs(d) < 0.5) { h.style.transform = ''; h.classList.remove('on'); return; }
          crop[k] = Math.round((crop[k] + (k === 't' || k === 'l' ? d : -d)) * 10) / 10;
          done();
        };
        h.addEventListener('pointermove', mv); h.addEventListener('pointerup', up); h.addEventListener('pointercancel', up);
      });
    }
  },
  async run(what, o) {
    const g = this.geom(o);
    if (what.table) { await Export.printHtml(this.tableDoc(what.table, o, g, false), what.name || 'Tabelle'); return; }
    await Save.flushAll();
    const list = what.pages.filter(pid => Store.pages[pid]).map(pid => ({ pid }));
    if (!list.length) return;
    const prog = Export.progress('Drucken …');
    try {
      const css = await Export.appCss();
      const parts = await Export.pdfParts(list);
      for (let k = 0; k < parts.length; k++) {
        if (k > 0) {
          prog.hide(true);
          const goOn = await UI.confirm(`Teil ${k} von ${parts.length} ist gedruckt`, `Weiter mit Teil ${k + 1} von ${parts.length}? (Viele Seiten kommen in mehrere Druckaufträge, damit nicht alle Bilder auf einmal geladen werden.)`, { ok: 'Weiter' });
          prog.hide(false);
          if (!goOn) break;
        }
        const urls = new Map(), body = [];
        let n = 0;
        try {
          await Export.renderEach(parts[k], { set: (t, f) => prog.set((parts.length > 1 ? `Teil ${k + 1} von ${parts.length}: ` : '') + t, f) }, async (page) => {
            let L = null;
            const slices = (W, H) => { L = this.layout(W, H, o, g); return L.ys; };
            const s = await Export.snapshot(page, null, { slices, urls, attachments: false, only: what.only, crop: o.crop });
            s.page = page;
            const r = this.pageSheets(s, L, o, g, n);
            n += r.n;
            body.push(r.html);
          });
          prog.set('Druckansicht wird vorbereitet …', 1);
          const name = parts.length > 1 ? `${what.name} (Teil ${k + 1} von ${parts.length})` : what.name;
          await Export.printHtml(this.doc(body.join('\n').replace(/\u0000T\u0000/g, String(n)), o, g, name, false, css), name || 'Drucken');
          body.length = 0;
        } finally { setTimeout(() => { for (const u of urls.values()) if (u) URL.revokeObjectURL(u); }, 2000); }
      }
    } catch (e) {
      if (e && e.cancelled) UI.toast('Drucken abgebrochen', 3000);
      else { console.error(e); UI.toast('Drucken fehlgeschlagen: ' + e.message, 5000); }
    } finally { prog.close(); Export.cancelled = false; }
  },

  /* Blätter einer Seite. s: Export.snapshot (mit parts = je y-Ausschnitt ein Stück, oder html = ganze Seite für die
   * Vorschau). Seitenzahl „von“ als Platzhalter \0T\0 (erst am Ende bekannt). */
  pageSheets(s, L, o, g, n0) {
    const p = s.page;
    // Vorschau: ganzer Schnappschuss, der Druckbereich wird erst hier ausgeschnitten (Ziehen an den Kanten ohne neuen
    // Schnappschuss); Drucken: schon in Export.snapshot geschnitten (s.parts)
    const c = !s.parts && this.hasCrop(o.crop) ? this.cropBox(s.x1, s.y1, s.W, s.H, o.crop) : { x1: s.x1, y1: s.y1, W: s.W, H: s.H };
    const dx = s.x1 - c.x1, dy = s.y1 - c.y1;
    L = L || this.layout(c.W, c.H, o, g);
    const { z, ys, xs } = L;
    const title = escapeHtml(p.title || 'Unbenannte Seite');
    const head = o.kopf ? `<header class="pr-head"><h1>${title}</h1><div class="kt-meta">${escapeHtml(fmtDate(p.created))}</div></header>` : '';
    let html = '', n = n0;
    for (const [xa, xb] of xs) {
      ys.forEach(([a, b], k) => {
        n++;
        const bg = o.hintergrund ? Export.pageBg(p, { x1: c.x1, y1: c.y1 + a }, true) : 'background-color:#fff';
        // Vorschau: ganze Seite, je Blatt verschoben (ohne Zerschneiden); Drucken: je Blatt nur, was hineinragt
        const inner = s.parts ? s.parts[k] : `<div style="position:absolute;left:${dx.toFixed(2)}px;top:${(dy - a).toFixed(2)}px">${s.html}</div>`;
        html += `<div class="pr-sheet">${k === 0 ? head : o.kopf ? '<div class="pr-headsp"></div>' : ''}` +
          `<div class="kt-slice" style="width:${((xb - xa) * z).toFixed(2)}px;height:${((b - a) * z).toFixed(2)}px">` +
          `<div class="kt-wrap" style="width:${c.W}px;height:${(b - a).toFixed(2)}px;transform:translate(${(-xa * z).toFixed(2)}px,0) scale(${z.toFixed(5)});${bg}">${inner}</div></div>` +
          (o.fuss ? `<footer class="pr-foot"><span>${title}</span><span>Seite ${n} von \u0000T\u0000</span></footer>` : '') + '</div>';
      });
    }
    return { html, n: n - n0, z, nx: xs.length, ny: ys.length };
  },
  /* Druckdokument; preview = Blätter als Papier auf grauem Grund */
  doc(body, o, g, name, preview, css) {
    return `<!doctype html><html lang="de"><head><meta charset="utf-8"><title>${escapeHtml(name || 'Drucken')}</title><style>${css}${Export.EXPORT_CSS}${this.css(o, g, preview)}</style></head>` +
      `<body class="kt-export${preview ? ' pr-preview' : ''}" data-theme="hell">${body}</body></html>`;
  },
  css(o, g, preview) {
    return `
@page{size:${g.w}mm ${g.h}mm;margin:${g.m}mm}
body.kt-export{-webkit-print-color-adjust:exact;print-color-adjust:exact}
.pr-sheet{position:relative;width:${g.availW}px;height:${g.fullH}px;overflow:hidden;break-after:page;contain:strict;background:#fff}
.pr-sheet:last-child{break-after:auto}
.pr-head{height:${g.HEAD}px;box-sizing:border-box;overflow:hidden;padding:0}.pr-head h1{font:300 22px var(--font-ui);margin:0 0 4px;color:#201f1e}
.pr-headsp{height:${g.HEAD}px}
.kt-slice{position:relative;overflow:hidden}
.kt-slice>.kt-wrap{position:absolute;left:0;top:0;transform-origin:0 0}
.kt-world .box{box-shadow:none}
.pr-foot{position:absolute;left:0;right:0;bottom:0;height:${g.FOOT - 4}px;display:flex;justify-content:space-between;align-items:flex-end;gap:12px;font:10.5px var(--font-ui);color:#605e5c;border-top:1px solid #e1dfdd}
.pr-foot span:first-child{overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
${preview ? `body.pr-preview{background:#e8e6e4;padding:12px 0;margin:0}
body.pr-preview .pr-sheet{box-sizing:content-box;padding:${(g.m * g.PX).toFixed(1)}px;margin:0 auto 14px;box-shadow:0 1px 5px rgba(0,0,0,.28)}
body.pr-preview .pr-xlwrap{box-sizing:content-box;width:${g.availW}px;min-height:${g.fullH}px;padding:${(g.m * g.PX).toFixed(1)}px;margin:0 auto;background:#fff;box-shadow:0 1px 5px rgba(0,0,0,.28)}` : ''}`;
  },

  /* Tabelle wie Excel drucken: als HTML-Tabelle (der Browser teilt sie auf Blätter auf, die Kopfzeile kommt als
   * <thead> auf jedes Blatt), Titel/Seitenzahlen über die Seitenränder (@page). Breite: an das Blatt anpassen. */
  tableDoc(t, o, g, preview) {
    const b = Sheet.box(t.id) || (Canvas.page && Canvas.page.boxes.find(x => x.id === t.id));
    if (!b || !b.sheet) return '<!doctype html><p>Tabelle nicht gefunden</p>';
    const d = b.sheet;
    const bd = o.gitter ? 'border:1px solid #bfbdbb;' : '';
    const td = (c, r, hd, tag) => {
      const cell = d.cells[XL.key(c, r)], f = (cell && cell.f) || {};
      const disp = Sheet.display(t.id, c, r);
      const al = f.al || disp.al;
      const band = !hd && d.band && r % 2 === (d.head ? 0 : 1);
      return `<${tag} style="${bd}padding:2px 6px;${al === 'r' ? 'text-align:right;' : al === 'c' ? 'text-align:center;' : 'text-align:left;'}${hd ? `background:${d.color || '#2f6fd0'};color:#fff;` : band ? 'background:#eef3fb;' : ''}${Sheet.cellStyle(f, hd, band, true)}">${escapeHtml(disp.t)}</${tag}>`;
    };
    const cols = [];
    // ausgeblendete Zeilen/Spalten (auch vom Filter) werden nicht gedruckt (1.72)
    const hc = new Set(d.hideC || []), hr = new Set([...(d.hideR || []), ...(d.hideF || [])]);
    for (let c = t.c1; c <= t.c2; c++) if (!hc.has(c)) cols.push(`<col style="width:${d.cols[c] || 96}px">`);
    const W = cols.length ? d.cols.slice(t.c1, t.c2 + 1).reduce((a, w, i) => a + (hc.has(t.c1 + i) ? 0 : (w || 96)), 0) : 100;
    // verbundene Zellen: colspan/rowspan (nur sichtbare Zeilen/Spalten zählen)
    const span = new Map(), cover = new Set();
    for (const m of d.merges || []) { const g = XL.parseRange(m); if (!g) continue; let cs = 0, rs = 0; for (let c = g.c1; c <= g.c2; c++) if (!hc.has(c)) cs++; for (let r = g.r1; r <= g.r2; r++) if (!hr.has(r)) rs++; span.set(XL.key(g.c1, g.r1), [cs, rs]); for (let r = g.r1; r <= g.r2; r++) for (let c = g.c1; c <= g.c2; c++) if (r !== g.r1 || c !== g.c1) cover.add(XL.key(c, r)); }
    const tr = (r, hd, tag) => { let s = `<tr${d.rowh && d.rowh[r] ? ` style="height:${d.rowh[r]}px"` : ''}>`; for (let c = t.c1; c <= t.c2; c++) { if (hc.has(c) || cover.has(XL.key(c, r))) continue; const sp = span.get(XL.key(c, r)); let x = td(c, r, hd, tag); if (sp) x = x.replace(/^<(td|th)/, `<$1${sp[0] > 1 ? ` colspan="${sp[0]}"` : ''}${sp[1] > 1 ? ` rowspan="${sp[1]}"` : ''}`); s += x; } return s + '</tr>'; };
    let head = '';
    let r0 = d.head ? 0 : -1;
    const pt = d.ps && d.ps.pt && /^(\d+):(\d+)$/.exec(d.ps.pt);   // Drucktitel: Zeilen oben auf jedem Blatt
    if (pt && +pt[1] - 1 >= t.r1) { head = '<thead>'; for (let r = +pt[1] - 1; r <= +pt[2] - 1; r++) head += tr(r, false, 'td'); head += '</thead>'; r0 = +pt[2] - 1; }
    else if (d.head) { head = '<thead><tr>'; for (let c = t.c1; c <= t.c2; c++) if (!hc.has(c)) head += td(c, 0, true, 'th'); head += '</tr></thead>'; }
    let rows = '';
    for (let r = Math.max(t.r1, r0 + 1); r <= t.r2; r++) { if (!hr.has(r)) rows += tr(r, false, 'td'); }
    const page = Canvas.page;
    const raw = `${d.name}${page && page.title ? ' – ' + page.title : ''}`;
    const title = escapeHtml(raw);
    const cssStr = (t) => '"' + String(t).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/[\r\n]+/g, ' ').replace(/</g, '\\3c ') + '"';
    let z = 1;
    if (o.skalierung === 'breite' || o.skalierung === 'blatt') z = Math.min(1, g.availW / W);
    else if (o.skalierung === 'prozent') z = clamp((+o.prozent || 100) / 100, 0.1, 4);
    // ganze Tabelle auf ein Blatt: Höhe erst im Dokument bekannt
    const fit = o.skalierung === 'blatt' ? `<script>(function(){var t=document.querySelector('.pr-xl');var h=t.getBoundingClientRect().height/${z};var z=Math.min(${z},${g.fullH - 40}/h);t.style.zoom=z;})();<\/script>` : '';
    const css = `
@page{size:${g.w}mm ${g.h}mm;margin:${g.m}mm;${o.kopf ? `@top-left{content:${cssStr(raw)};font:10.5px sans-serif;color:#605e5c}@top-right{content:${cssStr(fmtShortDate(Date.now()))};font:10.5px sans-serif;color:#605e5c}` : ''}${o.fuss ? '@bottom-right{content:"Seite " counter(page) " von " counter(pages);font:10.5px sans-serif;color:#605e5c}' : ''}}
body{margin:0;font:13px "Segoe UI",system-ui,sans-serif;color:#201f1e;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.pr-xl{border-collapse:collapse;table-layout:fixed;zoom:${z.toFixed(4)}}
.pr-xl td,.pr-xl th{overflow:hidden;white-space:nowrap;text-overflow:ellipsis;font-weight:inherit}
.pr-xl thead{display:table-header-group}.pr-xl tr{break-inside:avoid}
${preview ? `body{background:#e8e6e4;padding:12px 0}.pr-xlwrap{box-sizing:content-box;width:${g.availW}px;min-height:${g.fullH}px;padding:${(g.m * g.PX).toFixed(1)}px;margin:0 auto;background:#fff;box-shadow:0 1px 5px rgba(0,0,0,.28)}.pr-cap{font-size:11px;color:#605e5c;margin-bottom:6px}` : ''}`;
    const cap = preview && o.kopf ? `<div class="pr-cap">${title}</div>` : '';
    return `<!doctype html><html lang="de"><head><meta charset="utf-8"><title>${escapeHtml(d.name)}</title><style>${css}</style></head>` +
      `<body><div class="pr-xlwrap">${cap}<table class="pr-xl"><colgroup>${cols.join('')}</colgroup>${head}<tbody>${rows}</tbody></table></div>${fit}</body></html>`;
  },
};
