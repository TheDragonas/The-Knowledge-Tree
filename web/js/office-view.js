'use strict';
/* Office-Seiten wie die Programme (1.65): die ganze Seite IST die Datei.
 *
 *  Word ('dok'):   weisses Papier im Seitenformat der Datei (A4 …, Ränder aus w:sectPr), Text fliesst in Dokument-
 *                  reihenfolge von oben nach unten (Felder rücken nach, wenn ein Absatz wächst), so viele Blätter wie
 *                  nötig; Kopf-/Fusszeile im Rand. Statusleiste: „Seite x von n · Wörter“.
 *  Excel ('tab'):  alle Blätter an derselben Stelle, nur das gewählte ist sichtbar; unten Blattregister wie Excel
 *                  (Klick = Blatt, Doppelklick = umbenennen, + = neues Blatt, Rechtsklick = Einfügen/Löschen/Umbenennen).
 *  PowerPoint:     links die Folienübersicht (Miniaturen wie PowerPoint, Klick = Folie zeigen, Rechtsklick = Menü),
 *                  aktuelle Folie hervorgehoben; Statusleiste „Folie x von n“.
 * Hängt an Canvas.layout (Fluss/Seiten: braucht die gemessenen Höhen) und Canvas.applyView (Hervorhebung). */
const OfficeView = {
  PX: 40,
  STRIP: 168,
  /* ---------------------------------------------------------------- Word: Papier und Fluss */
  pg(p) { return p.office.pg || (p.office.pg = { w: 11906, h: 16838, t: 1417, b: 1134, l: 1417, r: 1417 }); },
  px(tw) { return (+tw || 0) / 15; },
  paper(p) { const g = this.pg(p); return { W: this.px(g.w), H: this.px(g.h), t: this.px(g.t), b: this.px(g.b), l: this.px(g.l), r: this.px(g.r) }; },
  GAP: 26,       // Abstand zwischen den Blättern (grau wie in Word)
  pageTop(p, i) { const P = this.paper(p); return p.office.paperY + i * (P.H + this.GAP); },
  /* in Canvas.layout nach dem Messen: Felder fliessen lassen, an Seitengrenzen umbrechen, Blätter anpassen
     → true wenn etwas bewegt wurde. Ein Absatz, der über das Seitenende ragen würde, rückt auf die nächste Seite
     (Abstand nur in der Anzeige: --kt-pm am Element, beim Speichern entfernt, boxHtml). */
  flow(p, rects) {
    if (p && p.office && p.type === 'tab') return this.flowXl(p);
    if (!p || !p.office || p.type !== 'dok' || !p.office.map || p.office.paperY == null) return false;
    const P = this.paper(p), G = this.GAP;
    const top0 = p.office.paperY;
    const x = this.PX + P.l, w = Math.round(P.W - P.l - P.r + 22);
    const pageOf = (y) => Math.max(0, Math.floor((y - top0) / (P.H + G)));
    const cTop = (i) => this.pageTop(p, i) + P.t, cBot = (i) => this.pageTop(p, i) + P.H - P.b;
    // Stelle y im Inhaltsbereich? sonst Beginn des nächsten Inhaltsbereichs
    const fit = (y, h = 0) => { const k = pageOf(y); if (y < cTop(k)) return cTop(k); if (y + Math.min(h, cBot(k) - cTop(k)) > cBot(k) + 0.5) return cTop(k + 1); return y; };
    let y = cTop(0);
    let moved = false;
    const set = (b, k, v) => { if (Math.abs(b[k] - v) > 0.5) { b[k] = v; moved = true; } };
    const z = Canvas.view.z || 1;
    const over = [];
    const g = { pageOf, cTop, cBot, z };
    let prev = null;
    for (const m of p.office.map) {
      if (!m.box) continue;
      const b = p.boxes.find(q => q.id === m.box);
      if (!b) continue;
      if (b.ox && b.ox.k === 'wfl') { over.push(b); continue; }   // vor/hinter dem Text (1.74): an Absatz bzw. Blatt, unten
      const e = Canvas.els.get(b.id);
      const r = rects.get(b.id);
      const h0 = r ? r.h : 40;
      const pic = Canvas.isPictureBox(b);
      const t = e && e.querySelector('.box-text');
      // Bild-/Textfeld-Absätze (wimg): als Ganzes auf das nächste Blatt, wenn sie nicht mehr passen (Bilder und
      // Textfelder bleiben bei ihrem Absatz); Überschrift am Ende des vorigen Feldes geht mit (Absätze nicht trennen)
      const y0 = y;
      y = fit(y, pic || (b.ox && b.ox.k === 'wimg') ? Math.max(30, h0 - 22) : 30);
      if (prev && pageOf(y) > pageOf(y0)) {
        const last = prev.t.lastElementChild;
        if (last && /^H[1-6]$/.test(last.tagName)) {
          const er = prev.e.getBoundingClientRect(), cr = last.getBoundingClientRect();
          const yTop = prev.b.y + (cr.top - er.top) / z - 13, hh = cr.height / z;
          if (pageOf(yTop) === pageOf(y0) && hh < (cBot(0) - cTop(0)) / 3) {
            const target = cTop(pageOf(y));
            last.setAttribute('data-kt-pm', '1');
            last.style.setProperty('--kt-pm', (target - yTop + (parseFloat(getComputedStyle(last).marginTop) || 0)).toFixed(1) + 'px');
            const nh = prev.e.offsetHeight;
            if (prev.r) prev.r.h = nh;
            y = prev.b.y + Math.max(1, nh - 22);
          }
        }
      }
      // Seitenumbruch oberhalb des Feldes (Umbruch am Ende des vorigen Absatzes, „Seitenumbruch oberhalb“, Abschnittswechsel)
      const f0 = t && !pic ? t.firstElementChild : null;
      const brk0 = !!(b.ox && b.ox.brk) || !!(f0 && f0.style && f0.style.breakBefore === 'page');
      if (brk0 && y > cTop(pageOf(y)) + 1) y = cTop(pageOf(y) + 1);
      set(b, 'x', x); set(b, 'y', Math.round(y));
      if (b.ox && /^(w|wlock|wimg|wtoc|wfn)$/.test(b.ox.k) && !pic) set(b, 'w', w);
      let h = h0;
      if (t && !pic) { h = this.paginate(b, e, t, { ...g, skipFirst: brk0 }) || h0; if (r) r.h = h; }
      prev = t && !pic ? { b, e, t, r } : null;
      // nächstes Feld schliesst direkt an (1.74): Kopfleiste (13 px) und Innenabstand unten (9 px) des Feldes sind unsichtbar
      y = b.y + Math.max(1, h - 22);
    }
    for (const b of over) {
      const a = p.boxes.find(q => q.id === b.ox.of);
      if (!a) continue;
      const base = b.ox.pg ? this.pageTop(p, pageOf(a.y + 13)) : a.y;
      set(b, 'x', Math.round(x + 11 + (b.ox.rx || 0)));
      set(b, 'y', Math.round(base + 13 + (b.ox.ry || 0)));
    }
    // Kopf-/Fusszeile im Rand jeder … (erstes Blatt; Word wiederholt sie – Anzeige auf allen Blättern folgt unten)
    for (const b of p.boxes.filter(b => b.ox && b.ox.k === 'hf')) { set(b, 'x', x); set(b, 'w', w); set(b, 'y', Math.round(b.ox.pos === 'f' ? top0 + P.H - P.b + 6 : top0 + Math.max(6, P.t / 2 - 18))); }
    // Blätter: so viele wie der Text braucht, mit Abstand
    const need = Math.max(1, pageOf(y - 1) + 1);
    let sheets = p.boxes.filter(b => b.ox && b.ox.k === 'blatt').sort((a, b) => a.ox.i - b.ox.i);
    while (sheets.length > need) { const s2 = sheets.pop(); p.boxes.splice(p.boxes.indexOf(s2), 1); moved = true; }
    while (sheets.length < need && p.office.white) {
      const s2 = { id: uid('b'), x: this.PX, y: 0, w: 0, html: '', images: [{ id: uid('i'), src: p.office.white, x: 0, y: 0, w: 1, h: 1 }], z: 0, style: { border: 'transparent' }, locked: true, pkg: null, bg: true, office: 'blatt', ox: { k: 'blatt', i: sheets.length } };
      p.boxes.unshift(s2); sheets.push(s2); moved = true;
    }
    sheets.forEach((s2, i) => {
      set(s2, 'x', this.PX); set(s2, 'y', Math.round(this.pageTop(p, i))); set(s2, 'w', Math.round(P.W + 22));
      const im = s2.images[0];
      if (im && (Math.abs(im.w - P.W) > 0.5 || Math.abs(im.h - P.H) > 0.5)) { im.w = Math.round(P.W); im.h = Math.round(P.H); moved = true; }
      if (p.office.white && im && im.src !== p.office.white) { im.src = p.office.white; moved = true; }
      if (s2.style.border !== 'transparent') { s2.style.border = 'transparent'; moved = true; }
    });
    p.office.pages = need;
    // Kopf-/Fusszeile und Wasserzeichen auf jedem Blatt (1.72)
    if (typeof OfficeWX !== 'undefined' && OfficeWX.flow(p, need, P, x, w, set)) moved = true;
    if (typeof OfficeWI !== 'undefined') OfficeWI.tocPages(p);   // Seitenzahlen im Inhaltsverzeichnis (1.74)
    return moved;
  },
  /* Excel (1.75): Bilder/Diagramme/Formen an ihrer Zelle – Lage aus dem gemessenen Raster (Sheet.rectOf) */
  flowXl(p) {
    let moved = false;
    const set = (b, k, v) => { if (Math.abs(b[k] - v) > 0.5) { b[k] = v; moved = true; } };
    for (const b of p.boxes) {
      if (!b.ox || b.ox.k !== 'xlo') continue;
      const sb = p.boxes.find(q => q.id === b.ox.sh), e = sb && Canvas.els.get(sb.id);
      if (!e || !e.querySelector('.xl-grid')) continue;
      if (!e._cols || !e._rows) Sheet.measure(e);
      const r = Sheet.rectOf(e, b.ox.a.c, b.ox.a.r);
      if (!r) continue;
      const pic = Canvas.isPictureBox(b);
      set(b, 'x', Math.round(sb.x + r.x + b.ox.a.dx - (pic ? 11 : 0)));
      set(b, 'y', Math.round(sb.y + r.y + b.ox.a.dy - (pic ? 13 : 0)));
      // bis zur End-Zelle (Spaltenbreiten wie angezeigt)
      if (b.ox.b && pic) {
        const r2 = Sheet.rectOf(e, b.ox.b.c, b.ox.b.r);
        if (r2) {
          const w = r2.x + b.ox.b.dx - r.x - b.ox.a.dx, h = r2.y + b.ox.b.dy - r.y - b.ox.a.dy, im = b.images[0];
          if (w > 4 && h > 4 && im && b.ox.fw) { const k = w / b.ox.fw, kh = h / b.ox.fh; const nw = Math.round(b.ox.iw * k), nh = Math.round(b.ox.ih * kh); if (Math.abs(im.w - nw) > 1 || Math.abs(im.h - nh) > 1) { im.w = nw; im.h = nh; set(b, 'w', nw + 22); moved = true; } }
        }
      }
    }
    return moved;
  },
  /* Absätze eines Feldes auf die Blätter verteilen (1.74):
     – Zeilen über die Seitengrenze: unsichtbare, volle Breite einnehmende Floats (.pg-fl) genau über der Lücke zwischen
       zwei Blättern – die Zeilen weichen aus und gehen oben auf dem nächsten Blatt weiter (wie Word, Absatz wird geteilt);
       Tabellen, die nicht neben den Float passen, rücken ganz auf das nächste Blatt; Tabellen länger als ein Blatt
       bekommen keine Lücke (laufen weiter)
     – Seitenumbruch (<hr>, break-before) und Überschriften am Seitenende: Abstand oberhalb (--kt-pm, nur Anzeige)
     – Felder mit Bildern (Floats der Bilder): ganze Absätze rücken auf das nächste Blatt (wie bis 1.73). */
  paginate(b, e, t, g) {
    const { pageOf, cTop, cBot, z } = g;
    const body = e.querySelector('.box-body');
    const gaps = !b.images.length && !!body;
    let gl = body && body.querySelector(':scope > .pg-fl');
    if (!gaps && gl) { gl.remove(); gl = null; }
    // Lage im Feld wie b.y (Feld oben = Inhaltsbeginn der Seite, Text 13 px tiefer wie das Papier unter dem Blatt-Kopf)
    const top = b.y, contentH = cBot(0) - cTop(0);
    let sig = gl ? gl.dataset.sig || '' : '';
    const skipT = new Set();
    for (let it = 0; it < 8; it++) {
      for (const c of t.querySelectorAll('[data-kt-pm]')) { c.style.removeProperty('--kt-pm'); c.removeAttribute('data-kt-pm'); }
      const kids = [];
      for (const c of t.children) { if (/^(UL|OL)$/.test(c.tagName)) kids.push(...c.querySelectorAll(':scope > li')); else kids.push(c); }
      let brk = -1, first = true;
      for (const c of kids) {
        // Bezug: Oberkante des Feldes (+13) – nicht des Textbereichs, dessen Oberkante sich mit dem Abstand des ersten Absatzes verschiebt
        const er = e.getBoundingClientRect(), cr = c.getBoundingClientRect();
        const yTop = top + (cr.top - er.top) / z - 13, hh = cr.height / z;
        if (c.tagName === 'HR') { brk = pageOf(yTop); first = false; continue; }
        if (!cr.height) { first = false; continue; }
        const k = pageOf(yTop);
        const eff = gaps && yTop > cBot(k) + 0.5 ? cTop(k + 1) : yTop, ke = pageOf(eff);
        let target = null;
        if (brk >= 0) { if (eff < cTop(brk + 1) - 0.5) target = cTop(brk + 1); brk = -1; }
        else if (!(first && g.skipFirst) && c.style && c.style.breakBefore === 'page') { if (eff > cTop(ke) + 1) target = cTop(ke + 1); }
        else if (gaps) { if (/^H[1-6]$/.test(c.tagName) && eff < cBot(ke) && eff + hh + 24 > cBot(ke) && hh < contentH / 3) target = cTop(ke + 1); }
        else if (yTop < cTop(k) - 0.5) target = cTop(k);
        else if (yTop + hh > cBot(k) + 0.5 && hh < cBot(k) - cTop(k)) target = cTop(k + 1);
        else if (yTop > cBot(k)) target = cTop(k + 1);
        first = false;
        if (target != null && target - yTop > 0.5) { c.setAttribute('data-kt-pm', '1'); c.style.setProperty('--kt-pm', (target - yTop + (parseFloat(getComputedStyle(c).marginTop) || 0)).toFixed(1) + 'px'); }
      }
      if (!gaps) break;
      const tr = t.getBoundingClientRect(), er = e.getBoundingClientRect();
      const H = (tr.bottom - er.top) / z - 13;
      let tch = false;
      for (const tb of t.querySelectorAll(':scope > table')) {
        const rr = tb.getBoundingClientRect();
        if (rr.height / z <= contentH - 4) continue;
        const a0 = top + (rr.top - er.top) / z - 13, a1 = a0 + rr.height / z;
        for (let k = pageOf(a0); cBot(k) < a1 && k < 5000; k++) if (!skipT.has(k)) { skipT.add(k); tch = true; }
      }
      const want = [];
      for (let k = pageOf(top); want.length < 5000; k++) {
        const gt = cBot(k) - top;
        if (gt >= H - 0.5) break;
        if (gt < 0 || skipT.has(k)) continue;
        want.push([gt, cTop(k + 1) - cBot(k), k]);
      }
      const s2 = want.map(q => q[2] + ':' + q[0].toFixed(1)).join(',');
      if (s2 === sig && !tch) break;
      sig = s2;
      if (!gl) { gl = document.createElement('div'); gl.className = 'pg-fl'; body.prepend(gl); }
      gl.dataset.sig = sig;
      let html = '', prev = 0;
      for (const [gt, gh] of want) { html += `<div class="pg-sp" style="height:${(gt - prev).toFixed(2)}px"></div><div class="pg-gap" style="height:${gh.toFixed(2)}px"></div>`; prev = gt + gh; }
      gl.innerHTML = html;
    }
    return e.offsetHeight;
  },
  /* Lineale (wie Word) – seit 1.67 in office-word.js (oben und links, Ränder ziehbar) */
  ruler(p) { if (this.el) OfficeWord.rulers(p, this.el); },
  /* ---------------------------------------------------------------- Excel: ein Blatt sichtbar */
  hidden(p, b) {
    if (!p || !p.office || !p.office.asset) return false;
    if (b.office === 'karte') return true;   // die Seite ist die Datei: Infozeile nur im Datei-Fenster (📎 bleibt in den Daten)
    if (p.type === 'folie') return !!(b.ox && (b.ox.k === 'label' || b.ox.k === 'notiz')) && OfficeSlides.view(p) === 'normal';   // Normal: Notizen in der Spalte links; Lernansicht: neben der Folie (1.67)
    if (p.type !== 'tab') return false;
    const cur = this.curSheet(p);
    if (b.sheet && b.ox && b.ox.k === 'xl') return b.id !== cur;
    if (b.ox && b.ox.k === 'label' && b.ox.f) return true;
    if (b.ox && b.ox.k === 'xlo') return b.ox.sh !== cur;   // Bilder/Diagramme eines anderen Blatts (1.75)   // Hinweise zum Blatt: im Blattregister (Tooltip), nicht über dem Raster (1.67)
    return false;
  },
  sheets(p) { const o = p.office.sheets || []; return p.boxes.filter(b => b.sheet && b.ox && b.ox.k === 'xl').sort((a, b) => (o.indexOf(a.id) + 1 || 1e9) - (o.indexOf(b.id) + 1 || 1e9)); },
  curSheet(p) {
    const list = this.sheets(p);
    if (!list.length) return null;
    if (!list.some(b => b.id === p.office.cur && !b.ox.hid)) p.office.cur = (list.find(b => !b.ox.hid) || list[0]).id;
    return p.office.cur;
  },
  showSheet(id) {
    const p = Canvas.page;
    if (!p || p.type !== 'tab') return;
    if (Sheet.edit) Sheet.commitEdit && Sheet.commitEdit();
    p.office.cur = id;
    Canvas.render(true);
    const b = Canvas.box(id);
    if (b) { Canvas.select([id]); Sheet.activate(id, 0, 0); }
    this.sync(true);
    Ribbon.refresh();
  },

  /* ---------------------------------------------------------------- Grössen (1.68): Leisten verstellbar, schmal = Handy
     Breiten in Store.ui.ofvW (Bildschirm-px), höchstens ~40 % des Bereichs; unter 700 px Breite („schmal“, Handy oder
     geteilter Bereich): Folienübersicht waagrecht unten, Lineale aus, Notizen/Animationen als Einblendung. */
  W: { strip: 168, ncol: 250, ap: 260, nav: 236 },
  WMIN: { strip: 96, ncol: 150, ap: 200, nav: 150 },
  WMAX: { strip: 360, ncol: 600, ap: 560, nav: 460 },
  STRIPH: 88,
  narrow() { const vp = Canvas.vp; return !!vp && vp.clientWidth > 0 && vp.clientWidth < 700; },
  w(k) {
    if (k === 'strip' && this.narrow()) return 0;
    const vw = (Canvas.vp && Canvas.vp.clientWidth) || 1200;
    const v = +((Store.ui.ofvW || {})[k]) || this.W[k];
    return Math.round(clamp(v, this.WMIN[k], Math.max(this.WMIN[k], Math.min(this.WMAX[k], vw * (k === 'ap' ? 0.34 : 0.4)))));
  },
  /* kompakt: schmal, oder unter ~900 px bzw. Hochformat – Notizen/Animationen als Einblendung, damit die Folie Platz hat */
  compact() { const vp = Canvas.vp; if (!vp || !vp.clientWidth) return false; const w = vp.clientWidth, h = vp.clientHeight; return w < 900 || (h > w && w < 1300); },
  stripH() { return this.narrow() && this.kind === 'folie' ? this.STRIPH : 0; },
  get STRIP() { return this.w('strip'); },
  applyW() {
    if (!this.el) return;
    for (const k of Object.keys(this.W)) this.el.style.setProperty('--ofv-' + k, this.w(k) + 'px');
    this.el.style.setProperty('--ofv-striph', this.stripH() + 'px');
    this.el.classList.toggle('narrow', this.narrow());
    this.el.classList.toggle('compact', this.compact());
    document.body.classList.toggle('ofv-narrow', this.narrow() && !!this.kind);
  },
  /* Ziehgriff an der Kante einer Leiste (side 'r' = rechte Kante, 'l' = linke); Doppelklick = Standardbreite */
  grip(host, k, side = 'r', cls = '') {
    if (!host || host.querySelector(':scope > .ofv-rs' + (cls ? '.' + cls : ''))) return;
    const g = el('div', { class: 'ofv-rs ' + side + (cls ? ' ' + cls : ''), title: 'Breite ändern: ziehen · Doppelklick = Standard' });
    g.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      e.preventDefault(); e.stopPropagation();
      const x0 = e.clientX, w0 = this.w(k);
      try { g.setPointerCapture(e.pointerId); } catch (er) { /* */ }
      document.body.classList.add('ofv-resizing');
      const mv = (ev) => { const u = Store.ui.ofvW || (Store.ui.ofvW = {}); u[k] = w0 + (side === 'r' ? ev.clientX - x0 : x0 - ev.clientX); this.applyW(); this.afterResize(k, false); };
      const up = () => { g.removeEventListener('pointermove', mv); g.removeEventListener('pointerup', up); g.removeEventListener('pointercancel', up); document.body.classList.remove('ofv-resizing'); (Store.ui.ofvW || (Store.ui.ofvW = {}))[k] = this.w(k); UiState.saveSoon(); this.afterResize(k, true); };
      g.addEventListener('pointermove', mv); g.addEventListener('pointerup', up); g.addEventListener('pointercancel', up);
    });
    g.addEventListener('dblclick', (e) => { e.stopPropagation(); if (Store.ui.ofvW) delete Store.ui.ofvW[k]; UiState.saveSoon(); this.applyW(); this.afterResize(k, true); });
    host.append(g);
  },
  afterResize(k, done) {
    const p = this.p;
    if (!p || p !== Canvas.page) return;
    if (this.kind === 'folie') {
      if (k === 'strip' && done) this.thumbs(p, true);
      OfficeSlides.place(p, this.el);
      if (done) { const f = OfficePpt.currentFrame(); if (f) OfficePpt.focusSlide(f.id); }
    } else if (this.kind === 'dok') { OfficeWord.rulers(p, this.el, true); if (done) OfficeWord.refit(true); }
  },
  /* der Bereich ändert die Grösse (Fenster, Tabs teilen, Handy drehen): Leisten und Ansicht anpassen */
  onResize() {
    const vp = Canvas.vp;
    if (!vp || !this.kind || !this.p || this.p !== Canvas.page || !vp.clientWidth) return;
    const sz = vp.clientWidth + 'x' + vp.clientHeight;
    if (sz === this._sz) return;
    const first = !this._sz;
    this._sz = sz;
    const was = this.el.classList.contains('narrow') + ':' + this.el.classList.contains('compact');
    this.applyW();
    if (first) return;
    if (was !== this.narrow() + ':' + this.compact()) this.sync(true);
    if (this.kind === 'folie') { const f = OfficePpt.currentFrame(); if (f) OfficePpt.focusSlide(f.id); }
    else if (this.kind === 'dok') OfficeWord.refit(true);
    else Canvas.applyView();
  },

  /* ---------------------------------------------------------------- Leisten über der Fläche */
  host() { const vp = Canvas.vp; return vp && vp.parentElement; },
  sync(force = false) {
    const p = Canvas.page;
    const kind = p && p.office && p.office.asset ? p.type : '';
    const host = this.host();
    if (!host) return;
    if (typeof Sheet !== 'undefined' && Sheet.barSync) Sheet.barSync();   // Formelleiste gehört zur Seite (1.68)
    if (typeof OfficeWX !== 'undefined') OfficeWX.applyHyph(p);   // Silbentrennung der Word-Seite (1.72)
    if (!this.el || this.el.parentElement !== host) {
      if (this.el) this.el.remove();
      this.el = el('div', { class: 'ofv' });
      for (const ev of ['pointerdown', 'mousedown', 'click', 'dblclick', 'wheel', 'contextmenu', 'touchstart']) this.el.addEventListener(ev, (e) => e.stopPropagation(), { passive: ev !== 'contextmenu' && ev !== 'wheel' });
      host.append(this.el);
      force = true;
      if (!this._ro && typeof ResizeObserver !== 'undefined') { this._ro = new ResizeObserver(() => { cancelAnimationFrame(this._rf); this._rf = requestAnimationFrame(() => this.onResize()); }); this._ro.observe(Canvas.vp); }
    }
    const changed = kind !== this.kind || p !== this.p;
    if (changed) { force = true; this.kind = kind; this.p = p; this.sig = null; this.el.innerHTML = ''; this._sz = null; }
    this.el.className = 'ofv' + (kind ? ' ofv-' + kind : '');
    this.applyW();
    if (!this._sz && Canvas.vp && Canvas.vp.clientWidth) this._sz = Canvas.vp.clientWidth + 'x' + Canvas.vp.clientHeight;
    document.body.classList.toggle('office-mode', !!kind);
    for (const k of ['dok', 'tab', 'folie']) document.body.classList.toggle('office-' + k, kind === k);
    if (kind !== 'dok') { OfficeWord.applyDesign(null); OfficeWord.applyMarks(); }
    if (kind !== 'folie') OfficeSlides.clearBody();
    if (typeof OfficeUI !== 'undefined') OfficeUI.views(kind ? p : null);   // Ansichten unten rechts (1.73)
    if (!kind) { this.el.innerHTML = ''; return; }
    if (kind === 'tab') { this.sheetBar(p, force); if (force) Canvas.applyView(); }   // Excel: Ansicht an A1 ausrichten (1.67)
    else if (kind === 'folie') { this.thumbs(p, force); OfficeSlides.sync(p, this.el, force); }
    else { if (force) this.el.innerHTML = ''; OfficeWord.sync(p, this.el, force); }
    // Seite neu im Bereich (Tab gewechselt, Bereich geteilt …): Ansicht an die aktuelle Grösse anpassen (1.68)
    if (changed) requestAnimationFrame(() => {
      if (Canvas.page !== p || this.p !== p) return;
      if (kind === 'folie') { const f = OfficePpt.currentFrame(); if (f) OfficePpt.focusSlide(f.id); }
      else if (kind === 'dok') OfficeWord.refit(true);
    });
  },
  syncSoon() { if (this._t) return; this._t = setTimeout(() => { this._t = null; this.sync(); }, 250); },
  /* Excel: Blattregister unten */
  sheetBar(p, force) {
    const list = this.sheets(p), cur = this.curSheet(p);
    const sig = list.map(b => b.id + ':' + b.sheet.name + (b.ox.hid ? ':h' : '')).join('|') + '#' + cur;
    if (!force && sig === this.sig) return;
    this.sig = sig;
    const bar = el('div', { class: 'ofv-sheets' });
    for (const b of list) {
      if (b.ox.hid) continue;   // ausgeblendete Blätter (1.71): Rechtsklick → Einblenden
      const note = p.boxes.find(x => x.ox && x.ox.k === 'label' && x.ox.f === b.id);
      const t = el('button', { class: 'ofv-st' + (b.id === cur ? ' on' : '') + (note ? ' note' : ''), type: 'button', text: b.sheet.name, title: 'Blatt „' + b.sheet.name + '“ · Doppelklick = umbenennen · Rechtsklick = mehr' + (note ? '\n\n' + OfficeWord.textOf(note.html).trim() : '') });
      t.addEventListener('click', () => this.showSheet(b.id));
      t.addEventListener('dblclick', () => { this.showSheet(b.id); if (typeof OfficeXT !== 'undefined' && !OfficeXT.wbGuard()) return; Sheet.rename(b.id); });
      t.addEventListener('contextmenu', (e) => { e.preventDefault(); this.sheetMenu(b, e.clientX, e.clientY); });
      bar.append(t);
    }
    const add = el('button', { class: 'ofv-st add', type: 'button', html: icon('plus', 14), title: 'Neues Blatt (Umsch+F11)' });
    add.addEventListener('click', () => OfficeXl.addSheet());
    bar.append(add);
    this.el.innerHTML = '';
    this.el.append(bar);
  },
  sheetMenu(b, x, y) {
    const all = this.sheets(Canvas.page), n = all.length, vis = all.filter(s => !s.ox.hid), hid = all.filter(s => s.ox.hid);
    UI.menu([{ head: b.sheet.name },
      { label: 'Einfügen …', icon: 'plus', action: () => OfficeXl.addSheet() },
      { label: 'Umbenennen', icon: 'pencil', action: () => { this.showSheet(b.id); if (typeof OfficeXT !== 'undefined' && !OfficeXT.wbGuard()) return; Sheet.rename(b.id); } },
      { label: 'Löschen', icon: 'trash', danger: true, disabled: n < 2 || Store.readOnly, action: () => OfficeXl.deleteSheet(b.id) },
      '-',
      { label: 'Ausblenden', icon: 'eyeOff', disabled: vis.length < 2 || Store.readOnly, action: () => this.hideSheet(b.id, true) },
      ...(hid.length ? [{ head: 'Einblenden' }, ...hid.map(h => ({ label: h.sheet.name, icon: 'table', disabled: Store.readOnly, action: () => this.hideSheet(h.id, false) }))] : [])], x, y);
  },
  /* Blatt aus-/einblenden (1.71, wie Excel; in der Datei state="hidden") */
  hideSheet(id, hide) {
    const p = Canvas.page, b = Canvas.box(id);
    if (!p || !b || !b.ox || (typeof OfficeXT !== 'undefined' && !OfficeXT.wbGuard())) return;
    if (hide) { b.ox.hid = 'hidden'; if (p.office.cur === id) p.office.cur = (this.sheets(p).find(s => !s.ox.hid) || {}).id || id; }
    else { delete b.ox.hid; p.office.cur = id; }
    Hist.touchPage(p.id); Hist.commit(hide ? 'Blatt ausgeblendet' : 'Blatt eingeblendet');
    Canvas.render(true);
    this.sync(true);
    if (!hide) this.showSheet(id);
  },
  /* PowerPoint: Folienübersicht links */
  thumbs(p, force) {
    const fr = OfficePpt.frames(p);
    const sig = fr.map(f => { const it = OfficePpt.itemsOf(f, p); return f.id + (f.ox.hide ? 'h' : '') + '@' + Math.round(f.y) + ':' + f.images.map(i => i.src).join(',') + ':' + it.boxes.map(b => b.id + Math.round(b.x - f.x) + ',' + Math.round(b.y - f.y) + ',' + b.w + ',' + (b.html || '').length + (b.images[0] ? b.images[0].w : '')).join(';') + it.draws.length; }).join('|');
    if (!force && sig === this.sig) { this.mark(); return; }
    this.sig = sig;
    const strip = el('div', { class: 'ofv-slides' });
    const sz = OfficePpt.size(p);
    const W = this.narrow() ? Math.round((this.STRIPH - 30) * sz.w / sz.h) : this.w('strip') - 44, k = W / sz.w;
    fr.forEach((f, i) => {
      const t = el('div', { class: 'ofv-th' + (f.ox.hide ? ' hid' : ''), dataset: { id: f.id }, title: 'Folie ' + (i + 1) + (f.ox.hide ? ' (ausgeblendet)' : '') + ' · Klick = zeigen · Rechtsklick = Folien-Menü' });
      const box = el('div', { class: 'ofv-thb' });
      box.style.width = W + 'px'; box.style.height = Math.round(sz.h * k) + 'px';
      try { const s = Show.render(f, p); s.style.transform = `scale(${k})`; box.append(s); } catch (e) { /* Miniatur fehlt */ }
      t.append(el('span', { class: 'ofv-n', text: String(i + 1) }), box);
      t.addEventListener('click', () => OfficePpt.focusSlide(f.id));
      t.addEventListener('dblclick', () => OfficePpt.focusSlide(f.id, true));
      t.addEventListener('contextmenu', (e) => { e.preventDefault(); OfficePpt.focusSlide(f.id); UI.menu([{ head: 'Folie ' + (i + 1) },
        { label: 'Neue Folie', icon: 'slidePlus', action: () => Cmd.run('slideNew') }, { label: 'Folie duplizieren', icon: 'duplicate', action: () => Cmd.run('slideDup') },
        { label: 'Folie löschen', icon: 'trash', danger: true, disabled: fr.length < 2, action: () => Cmd.run('slideDel') }, '-',
        { label: 'Nach oben', icon: 'arrowUp', disabled: i === 0, action: () => Cmd.run('slideUp') }, { label: 'Nach unten', icon: 'arrowDown', disabled: i === fr.length - 1, action: () => Cmd.run('slideDown') }, '-',
        { label: f.ox.hide ? 'Folie einblenden' : 'Folie ausblenden', icon: 'eye', action: () => OfficePX.hideSlide() },
        { label: 'Ab hier vorführen', icon: 'play', action: () => Show.start('here') }], e.clientX, e.clientY); });
      strip.append(t);
    });
    const add = el('button', { class: 'ofv-addslide', type: 'button', html: icon('plus', 14) + '<span>Neue Folie</span>' });
    add.addEventListener('click', () => Cmd.run('slideNew'));
    strip.append(add);
    const keep = this.el.querySelector('.ofv-slides');
    const st = keep ? keep.scrollTop : 0, sl = keep ? keep.scrollLeft : 0;
    if (keep) keep.replaceWith(strip); else this.el.prepend(strip);
    strip.scrollTop = st; strip.scrollLeft = sl;
    const sg = this.el.querySelector(':scope > .g-strip');
    if (!this.narrow()) this.grip(this.el, 'strip', 'r', 'g-strip'); else if (sg) sg.remove();
    this.mark();
  },
  /* aktuelle Folie in der Übersicht markieren */
  mark() {
    if (this.kind !== 'folie' || !this.el) return;
    const f = OfficePpt.currentFrame();
    for (const t of this.el.querySelectorAll('.ofv-th')) {
      const on = !!f && t.dataset.id === f.id;
      if (on !== t.classList.contains('on')) { t.classList.toggle('on', on); if (on) t.scrollIntoView({ block: 'nearest', inline: 'nearest' }); }
    }
  },
  clamp(v) { if (OfficeGrid.page()) OfficeGrid.clamp(v); },
  onView() {
    if (!this.kind || !this.p || this._mv) return;
    // erst im nächsten Bild – und nur, wenn noch dieselbe Seite offen ist (sonst landet z.B. das Lineal auf einer Excel-Seite)
    this._mv = requestAnimationFrame(() => {
      this._mv = null;
      if (!this.p || this.p !== Canvas.page) return;
      if (this.kind === 'folie') { this.mark(); OfficeSlides.onView(this.p, this.el); }
      else if (this.kind === 'dok') OfficeWord.onView(this.p, this.el);
      else if (this.kind === 'tab') OfficeGrid.onView();
      Canvas.updateStatus();
    });
  },
  /* PowerPoint: Notizen der Folie aus der Notizspalte (Normalansicht, office-slides.js) */
  notesInput(ed) {
    const p = Canvas.page, f = p && Canvas.box(ed._f);
    if (!f) return;
    let nb = p.boxes.find(b => b.ox && b.ox.k === 'notiz' && b.ox.f === f.id);
    if (!nb) nb = OfficeSlides.addNotes(f, p, false);
    nb.html = sanitizeHtml(ed.innerHTML);
    Hist.touchPage(p.id);
    clearTimeout(this._nT);
    this._nT = setTimeout(() => { this._nT = null; Hist.commit('Notizen'); }, 1200);
  },
  /* PowerPoint: Mausrad blättert Folien (wie die Normalansicht), Strg+Rad zoomt weiter */
  wheel(ev) {
    if (this.kind !== 'folie' || !OfficeSlides.wheelSlides(this.p) || ev.ctrlKey || ev.metaKey || ev.shiftKey || Math.abs(ev.deltaY) < Math.abs(ev.deltaX)) return false;
    const now = Date.now();
    if (now - (this._wt || 0) < 280) return true;
    this._wt = now;
    const fr = OfficePpt.frames(Canvas.page), f = OfficePpt.currentFrame();
    const i = Math.max(0, Math.min(fr.length - 1, fr.indexOf(f) + (ev.deltaY > 0 ? 1 : -1)));
    if (fr[i] && fr[i] !== f) OfficePpt.focusSlide(fr[i].id, false);
    return true;
  },

  /* ---------------------------------------------------------------- Statusleiste wie Word/PowerPoint */
  status(p) {
    if (!p || !p.office || !p.office.asset) return null;
    if (p.type === 'dok') return OfficeWord.status(p);
    if (p.type === 'folie') {
      const fr = OfficePpt.frames(p), f = OfficePpt.currentFrame();
      return `Folie ${f ? fr.indexOf(f) + 1 : 1} von ${fr.length}  ·  ${OfficePages.LABEL.pptx}: ${p.office.name}`;
    }
    if (p.type === 'tab') {
      const list = this.sheets(p), cur = this.curSheet(p);
      const rec = typeof Macros !== 'undefined' && Macros.rec ? '●  Makro wird aufgezeichnet  ·  ' : 'Bereit  ·  ';
      return `${rec}Blatt ${Math.max(1, list.findIndex(b => b.id === cur) + 1)} von ${list.length || 1}  ·  ${OfficePages.LABEL.xlsx}: ${p.office.name}`;
    }
    return null;
  },
  words(p) {
    let n = 0;
    for (const b of p.boxes) if (b.ox && (b.ox.k === 'w' || b.ox.k === 'wimg')) { const t = (b.html || '').replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;/g, ' '); n += (t.match(/[\p{L}\p{N}][\p{L}\p{N}'’.-]*/gu) || []).length; }
    return n;
  },
};
if (typeof module !== 'undefined') module.exports = { OfficeView };
