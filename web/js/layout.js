'use strict';
/* Dynamisches Layout (seit 1.10): die Oberfläche passt sich jeder Fenstergrösse an – vom Handy (hoch und quer) über
 * das Tablet bis zum grossen Bildschirm. Klassen am <body>:
 *  - lay-drawer (schmaler als 900 px): Notizbücher und Seiten als ausziehbare Schublade (☰ oben links),
 *    die Seite nutzt die ganze Breite
 *  - lay-phone (schmaler als 700 px oder niedriger als 500 px): kompakte Titelleiste (Suche als Knopf),
 *    kleines Menüband ohne Gruppennamen, schmale Statusleiste, Dialoge über die ganze Breite
 *  - lay-short (niedriger als 560 px): Menüband eingeklappt – Register antippen klappt es herunter, bis die Maus es
 *    verlässt (1.41); dauerhaft aufklappen mit dem Pfeilchen rechts
 *  - touch (Finger ist der Hauptzeiger): grössere Griffe und Knöpfe
 *  - rb-min / rb-peek: Menüband eingeklappt / gerade eingeblendet
 *  - nav-open: Schublade offen
 * Die nutzbare Höhe kommt aus visualViewport (die Bildschirmtastatur verkleinert sie) und steht in --app-h. */
const Layout = {
  mode: 'wide',
  init() {
    this.coarse = matchMedia('(pointer: coarse)');
    // Knöpfe in der Titelleiste: Navigation (☰) und Suche (nur auf schmalen Bildschirmen sichtbar)
    const left = $('.tb-left');
    const nav = el('button', { class: 'qat lay-only-drawer', id: 'qat-nav', title: 'Notizbücher und Seiten', type: 'button', html: icon('menu', 18) });
    nav.addEventListener('click', () => this.toggleNav());
    left.prepend(nav);
    const find = el('button', { class: 'qat lay-only-phone', id: 'qat-find', title: 'Suchen', type: 'button', html: icon('search', 17) });
    find.addEventListener('click', () => this.openSearch());
    $('.tb-right').prepend(find);
    for (const b of [nav, find]) b.addEventListener('mousedown', e => e.preventDefault());
    const ts = $('#tb-search');
    ts.addEventListener('blur', () => setTimeout(() => document.body.classList.remove('search-open'), 120));
    // Hintergrund der Schublade – im selben Stapelkontext wie die Schublade (#app ist position: fixed)
    const back = el('div', { id: 'nav-back' });
    back.addEventListener('pointerdown', (e) => { e.preventDefault(); this.toggleNav(false); });
    $('#app').append(back);
    // Schublade mit dem Finger nach links wischen → zu
    let sw = null;
    for (const col of $$('.navcol')) {
      col.addEventListener('pointerdown', (e) => { sw = e.pointerType === 'touch' && document.body.classList.contains('nav-open') ? { x: e.clientX, y: e.clientY, id: e.pointerId } : null; });
      col.addEventListener('pointermove', (e) => {
        if (!sw || e.pointerId !== sw.id) return;
        const dx = e.clientX - sw.x, dy = e.clientY - sw.y;
        if (Math.abs(dy) > 40) sw = null;
        else if (dx < -70) { sw = null; this.toggleNav(false); }
      });
      col.addEventListener('pointerup', () => { sw = null; });
      col.addEventListener('pointercancel', () => { sw = null; });
    }
    // Seite in der Liste gewählt → Schublade zu
    $('#page-list').addEventListener('click', (e) => { if (e.target.closest('.p-row') && !e.target.closest('.p-caret, input')) this.navPicked(); });
    $('#add-page').addEventListener('click', () => this.navPicked());
    addEventListener('keydown', (e) => { if (e.key === 'Escape' && document.body.classList.contains('nav-open')) { e.stopPropagation(); this.toggleNav(false); } }, true);
    // eingeblendetes Menüband schliesst sich beim Tippen daneben
    addEventListener('pointerdown', (e) => {
      if (!document.body.classList.contains('rb-peek')) return;
      if (e.target.closest && e.target.closest('#ribbon, .popup, .dlg-back')) return;
      this.peek(false);
      // Tippen auf die Seite schliesst nur das Menüband (kein neues Textfeld)
      if (e.target.closest && e.target.closest('#viewport')) { e.stopPropagation(); e.preventDefault(); }
    }, true);
    // vorübergehend heruntergeklappt: Maus verlässt das Menüband → wieder einklappen; kommt sie zurück → offen lassen
    const rib = $('#ribbon');
    rib.addEventListener('pointerleave', (e) => { if (e.pointerType !== 'touch') this.peekLeaveSoon(); });
    rib.addEventListener('pointerenter', () => { clearTimeout(this._peekT); this._peekT = null; });
    this.initLongPress();
    // Menüband zu breit: waagrecht scrollen (Finger, Mausrad) und am Rand ausblenden, damit man sieht, dass es weitergeht
    const panel = $('#panel');
    this.fadePanel = () => {
      const max = panel.scrollWidth - panel.clientWidth;
      panel.classList.toggle('more-r', max > 2 && panel.scrollLeft < max - 2);
      panel.classList.toggle('more-l', max > 2 && panel.scrollLeft > 2);
      panel.classList.toggle('ovf', max > 2);   // Platz für den Bildlaufbalken (1.68)
    };
    panel.addEventListener('scroll', this.fadePanel, { passive: true });
    new MutationObserver(() => requestAnimationFrame(this.fadePanel)).observe(panel, { childList: true });
    panel.addEventListener('wheel', (e) => {
      if (e.ctrlKey || Math.abs(e.deltaX) > Math.abs(e.deltaY) || panel.scrollWidth <= panel.clientWidth + 2) return;
      if (e.target.closest && e.target.closest('.gallery, .pen-gallery, select')) return;
      panel.scrollLeft += e.deltaY; e.preventDefault();
    }, { passive: false });
    const upd = () => this.updateSoon();
    addEventListener('resize', upd);
    addEventListener('orientationchange', upd);
    addEventListener('focusout', () => setTimeout(upd, 60));
    if (window.visualViewport) { visualViewport.addEventListener('resize', upd); visualViewport.addEventListener('scroll', upd); }
    this.coarse.addEventListener && this.coarse.addEventListener('change', upd);
    this.update();
  },
  /* Langes Drücken = Kontextmenü (Notizbücher, Seiten, Register …) auch dort, wo der Browser keines meldet (iPhone/iPad).
   * Die Seite selbst regelt das in canvas.js. Meldet der Browser selbst ein Kontextmenü, wird nichts nachgebaut. */
  initLongPress() {
    let lp = null, swallowUntil = 0;
    const cancel = () => { if (lp) { clearTimeout(lp.t); lp = null; } };
    addEventListener('pointerdown', (e) => {
      cancel();
      if (e.pointerType !== 'touch' || !e.isPrimary) return;
      const t = e.target;
      if (!t.closest || t.closest('#viewport, input, textarea, select, [contenteditable="true"], .calc, .popup, .dlg-back:not(:has(.chem-dlg))')) return;
      const x = e.clientX, y = e.clientY;
      lp = { x, y, t: setTimeout(() => {
        lp = null;
        const tgt = document.elementFromPoint(x, y);
        if (!tgt) return;
        swallowUntil = performance.now() + 1500;
        if (navigator.vibrate) try { navigator.vibrate(12); } catch (er) { /* */ }
        tgt.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 2, buttons: 2, view: window }));
      }, 560) };
    }, true);
    addEventListener('pointermove', (e) => { if (lp && Math.hypot(e.clientX - lp.x, e.clientY - lp.y) > 10) cancel(); }, true);
    addEventListener('pointerup', () => { cancel(); if (swallowUntil) swallowUntil = Math.min(swallowUntil, performance.now() + 400); }, true);
    addEventListener('pointercancel', cancel, true);
    addEventListener('contextmenu', (e) => { if (e.isTrusted) cancel(); }, true);
    // das Loslassen nach dem Kontextmenü löst keinen Klick aus (sonst würde z.B. die Seite gewechselt)
    addEventListener('click', (e) => { if (performance.now() < swallowUntil) { swallowUntil = 0; e.preventDefault(); e.stopPropagation(); } }, true);
  },
  updateSoon() {
    if (this._raf) return;
    this._raf = requestAnimationFrame(() => { this._raf = null; this.update(); });
  },
  update() {
    const vv = window.visualViewport;
    const w = innerWidth, h = Math.round(vv ? vv.height : innerHeight);
    // Höhe deutlich kleiner bei gleicher Breite, während ein Eingabefeld aktiv ist: Bildschirmtastatur ist offen.
    // Dann bleibt die Anordnung wie vorher (kein Umspringen des Menübands), nur die nutzbare Höhe schrumpft.
    const ae = document.activeElement;
    const typing = !!(ae && ae !== document.body && (ae.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(ae.tagName)));
    const kb = !!(this._h && typing && h < this._h - 120 && w === this._w);
    if (!kb) this._h = h;
    this._w = w;
    const hl = kb ? this._h : h;
    const phone = w < 700 || (hl < 500 && w < 1100);
    const drawer = phone || w < 900;
    const short = hl < 560;
    const B = document.body.classList;
    B.toggle('lay-phone', phone);
    B.toggle('lay-drawer', drawer);
    B.toggle('lay-short', short);
    B.toggle('lay-narrow', w < 600);
    B.toggle('lay-wide', !drawer);
    B.toggle('touch', !!this.coarse.matches);
    if (!drawer) B.remove('nav-open');
    this.mode = phone ? 'phone' : drawer ? 'drawer' : 'wide';
    // Höhe und Lage des sichtbaren Bereichs (Bildschirmtastatur, iOS verschiebt den Bereich beim Tippen)
    const root = document.documentElement.style;
    root.setProperty('--app-h', h + 'px');
    root.setProperty('--app-top', Math.round(vv ? vv.offsetTop : 0) + 'px');
    this.applyRibbon();
    B.toggle('kb-open', kb);
    if (typeof Canvas !== 'undefined' && Canvas.vp) {
      Canvas.scrollSoon && Canvas.scrollSoon();
      if (kb) setTimeout(() => this.keepCaretVisible(), 60);
    }
    if (typeof Calc !== 'undefined' && Calc.win && !Calc.win.hidden) { Calc.applyScale(); Calc.place(); }
    this.fadePanel && this.fadePanel();
  },
  /* ---------------------------------------------------------- Schublade */
  toggleNav(on) {
    const B = document.body.classList;
    const open = on === undefined ? !B.contains('nav-open') : !!on;
    if (open && !B.contains('lay-drawer')) return;
    B.toggle('nav-open', open);
    if (open) {
      if (typeof Canvas !== 'undefined') Canvas.stopEditing && Canvas.stopEditing();
      const sel = $('#page-list .p-row.sel');
      if (sel) sel.scrollIntoView({ block: 'nearest' });
    }
  },
  navPicked() {
    if (document.body.classList.contains('lay-drawer')) setTimeout(() => this.toggleNav(false), 60);
  },
  /* ---------------------------------------------------------- Suche (Handy: Knopf öffnet das Suchfeld über der Titelleiste) */
  openSearch() {
    document.body.classList.add('search-open');
    const ts = $('#tb-search');
    setTimeout(() => ts.focus(), 30);
  },
  /* ---------------------------------------------------------- Menüband ein-/ausklappen */
  ribbonMin() {
    const v = Store.ui && Store.ui.ribbonMin;
    return v === true || v === false ? v : document.body.classList.contains('lay-short');   // nicht festgelegt: auf niedrigen Bildschirmen eingeklappt
  },
  applyRibbon() {
    const min = this.ribbonMin();
    document.body.classList.toggle('rb-min', min);
    if (!min) document.body.classList.remove('rb-peek');
    const b = $('#rb-pin');
    const fs = document.body.classList.contains('fullscreen');
    if (b) { b.innerHTML = icon(min && !fs ? 'chevDown' : 'chevUp', 12); b.title = fs ? 'Menüband ausblenden (wieder einblenden mit dem Pfeilchen oben)' : min ? 'Menüband aufklappen (Strg+F1)' : 'Menüband einklappen (Strg+F1) – ein Register anklicken klappt es kurz herunter, dieses Pfeilchen wieder dauerhaft auf'; }
  },
  toggleRibbon() {
    Store.ui.ribbonMin = !this.ribbonMin();
    UiState.saveSoon();
    this.applyRibbon();
    if (typeof Canvas !== 'undefined') Canvas.scrollSoon && Canvas.scrollSoon();
  },
  peek(on) {
    clearTimeout(this._peekT); this._peekT = null;
    document.body.classList.toggle('rb-peek', !!on && this.ribbonMin());
    if (on && this.fadePanel) requestAnimationFrame(this.fadePanel);
  },
  /* vorübergehend heruntergeklapptes Menüband (1.41): verlässt der Mauszeiger Register + Befehle, klappt es nach kurzer
   * Zeit wieder ein – nicht, solange ein Menü daraus offen ist oder ein Feld darin (Schriftgrösse …) den Fokus hat */
  peekLeaveSoon() {
    if (this._peekT || !document.body.classList.contains('rb-peek')) return;
    this._peekT = setTimeout(() => {
      this._peekT = null;
      const rib = $('#ribbon');
      if (!document.body.classList.contains('rb-peek')) return;
      if ((UI.popupOpen && UI.popupOpen()) || (rib && rib.contains(document.activeElement) && document.activeElement.matches('input, select, textarea'))) { this.peekLeaveSoon(); return; }
      if (rib && rib.matches(':hover')) return;
      this.peek(false);
    }, 400);
  },
  /* ---------------------------------------------------------- Bildschirmtastatur: Schreibmarke sichtbar halten */
  keepCaretVisible() {
    if (typeof Canvas === 'undefined' || !Canvas.editing) return;
    const s = getSelection();
    if (!s.rangeCount) return;
    let r = s.getRangeAt(0).getBoundingClientRect();
    if (!r.height) { const e = Canvas.els.get(Canvas.editing); if (!e) return; r = e.getBoundingClientRect(); }
    const vr = Canvas.vp.getBoundingClientRect();
    const pad = 24;
    let dy = 0, dx = 0;
    if (r.bottom > vr.bottom - pad) dy = vr.bottom - pad - r.bottom;
    else if (r.top < vr.top + pad) dy = vr.top + pad - r.top;
    if (r.right > vr.right - pad) dx = vr.right - pad - r.right;
    else if (r.left < vr.left + pad) dx = vr.left + pad - r.left;
    if (dx || dy) { Canvas.view.x += dx; Canvas.view.y += dy; Canvas.applyView(); }
  },
};
