'use strict';
/* Zoom-Bereich (seit 1.29: 1 % bis 1000 %, vorher 15–400 %). Der Regler in der Statusleiste ist logarithmisch
 * (0…1000 ↔ 1 %…1000 %), damit kleine und grosse Werte gleich gut einstellbar sind; 100 % liegt bei 2/3. */
const ZOOM_MIN = 0.01, ZOOM_MAX = 10;
const zoomToSlider = (z) => Math.round(1000 * Math.log(clamp(z, ZOOM_MIN, ZOOM_MAX) / ZOOM_MIN) / Math.log(ZOOM_MAX / ZOOM_MIN));
const sliderToZoom = (v) => ZOOM_MIN * Math.pow(ZOOM_MAX / ZOOM_MIN, clamp(+v, 0, 1000) / 1000);
/* Zeichenfläche einer Seite: Textfelder, Bilder, Pakete und Verbindungen */

const BAR = 12, PADX = 10, BORDER = 1, PKG_PAD = 16, PKG_HEAD = 28, SNAP = 10, IMG_GAP = 10;
const NORM = { l: { x: -1, y: 0 }, r: { x: 1, y: 0 }, t: { x: 0, y: -1 }, b: { x: 0, y: 1 } };

function rectCenter(r) { return { x: r.x + r.w / 2, y: r.y + r.h / 2 }; }
/* Seiten für eine Verbindung A → B. Weit genug auseinander: zugewandte Seiten. Stehen die Felder eng (Lücke < 30 px)
 * und schräg versetzt, geht die Linie über Eck (z.B. unten aus A, links in B) statt durch die schmale Lücke. */
function pickSides(ra, rb) {
  const gR = rb.x - (ra.x + ra.w), gL = ra.x - (rb.x + rb.w), gB = rb.y - (ra.y + ra.h), gT = ra.y - (rb.y + rb.h);
  const ca = rectCenter(ra), cb = rectCenter(rb), FAR = 30;
  if (gR >= FAR) return ['r', 'l'];
  if (gL >= FAR) return ['l', 'r'];
  if (gB >= FAR) return ['b', 't'];
  if (gT >= FAR) return ['t', 'b'];
  if (gR >= 0 || gL >= 0) {                     // eng nebeneinander
    const right = gR >= 0, tx = right ? rb.x : rb.x + rb.w;
    if (cb.y > ra.y + ra.h + 8 && (right ? ca.x < tx - 8 : ca.x > tx + 8)) return ['b', right ? 'l' : 'r'];
    if (cb.y < ra.y - 8 && (right ? ca.x < tx - 8 : ca.x > tx + 8)) return ['t', right ? 'l' : 'r'];
  }
  if (gB >= 0 || gT >= 0) {                     // eng übereinander
    const below = gB >= 0, ty = below ? rb.y : rb.y + rb.h;
    if (cb.x > ra.x + ra.w + 8 && (below ? ca.y < ty - 8 : ca.y > ty + 8)) return ['r', below ? 't' : 'b'];
    if (cb.x < ra.x - 8 && (below ? ca.y < ty - 8 : ca.y > ty + 8)) return ['l', below ? 't' : 'b'];
  }
  if (gR >= 12) return ['r', 'l'];
  if (gL >= 12) return ['l', 'r'];
  if (gB >= 0) return ['b', 't'];
  if (gT >= 0) return ['t', 'b'];
  return cb.x >= ca.x ? ['r', 'l'] : ['l', 'r'];
}
function sidePoint(r, side, f, spread = 0.7) {
  const t = 0.5 + (f - 0.5) * spread;
  if (side === 'l') return { x: r.x, y: r.y + r.h * t };
  if (side === 'r') return { x: r.x + r.w, y: r.y + r.h * t };
  if (side === 't') return { x: r.x + r.w * t, y: r.y };
  return { x: r.x + r.w * t, y: r.y + r.h };
}
function anchorPoint(r, side, t) {
  t = clamp(+t || 0.5, 0, 1);
  if (side === 'l') return { x: r.x, y: r.y + r.h * t };
  if (side === 'r') return { x: r.x + r.w, y: r.y + r.h * t };
  if (side === 't') return { x: r.x + r.w * t, y: r.y };
  return { x: r.x + r.w * t, y: r.y + r.h };
}
function sideDistances(r, p) {
  const cy = clamp(p.y, r.y, r.y + r.h), cx = clamp(p.x, r.x, r.x + r.w);
  return {
    l: Math.hypot(p.x - r.x, p.y - cy), r: Math.hypot(p.x - (r.x + r.w), p.y - cy),
    t: Math.hypot(p.x - cx, p.y - r.y), b: Math.hypot(p.x - cx, p.y - (r.y + r.h)),
  };
}
function distToBorder(r, p) { const d = sideDistances(r, p); return Math.min(d.l, d.r, d.t, d.b); }
/* nächster Punkt auf dem Rand eines Feldes -> {side, t} */
function nearestAnchor(r, p) {
  const d = sideDistances(r, p);
  const side = Object.keys(d).reduce((a, b) => d[a] <= d[b] ? a : b);
  const t = side === 'l' || side === 'r' ? (p.y - r.y) / (r.h || 1) : (p.x - r.x) / (r.w || 1);
  return { side, t: Math.round(clamp(t, 0.03, 0.97) * 1000) / 1000 };
}
function segIntersect(p1, p2, p3, p4) {
  const d = (p2.x - p1.x) * (p4.y - p3.y) - (p2.y - p1.y) * (p4.x - p3.x);
  if (Math.abs(d) < 1e-9) return false;
  const u = ((p3.x - p1.x) * (p4.y - p3.y) - (p3.y - p1.y) * (p4.x - p3.x)) / d;
  const v = ((p3.x - p1.x) * (p2.y - p1.y) - (p3.y - p1.y) * (p2.x - p1.x)) / d;
  return u >= 0 && u <= 1 && v >= 0 && v <= 1;
}
const f1 = (n) => Math.round(n * 10) / 10;

/* Online-Videos (z.B. aus OneNote): Vorschaubild mit Abspielknopf, Wiedergabe im Fenster */
const Video = {
  embed(url) {
    const u = String(url || '');
    let m = /(?:youtube(?:-nocookie)?\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([\w-]{6,})/i.exec(u);
    if (m) {
      const t = /[?&#](?:t|start)=(\d+)/.exec(u);
      return `https://www.youtube-nocookie.com/embed/${m[1]}?autoplay=1&rel=0${t ? '&start=' + t[1] : ''}`;
    }
    m = /vimeo\.com\/(?:video\/)?(\d+)/i.exec(u);
    if (m) return `https://player.vimeo.com/video/${m[1]}?autoplay=1`;
    return null;
  },
  wrapHtml(imgHtml, url, title) {
    return `<span class="kt-video" contenteditable="false" data-video="${escapeHtml(url)}"${title ? ` data-title="${escapeHtml(title)}"` : ''}>${imgHtml}<i class="kt-play"></i></span>`;
  },
  play(url, title) {
    const src = this.embed(url);
    if (!src) { Backend.openLink(url); return; }
    const box = el('div', { class: 'vid-box' });
    const frame = el('iframe', { src, allow: 'autoplay; encrypted-media; picture-in-picture; fullscreen', allowfullscreen: true, referrerpolicy: 'strict-origin-when-cross-origin', title: title || 'Video' });
    const bar = el('div', { class: 'vid-bar' },
      el('span', { class: 'vid-title', text: title || url }),
      el('button', { class: 'btn small', text: 'Im Browser öffnen', onclick: () => Backend.openLink(url) }),
      el('button', { class: 'btn small', text: 'Schliessen', onclick: () => close() }));
    box.append(bar, el('div', { class: 'vid-frame' }, frame));
    const lb = el('div', { class: 'lightbox vid' }, box);
    const close = () => { lb.remove(); document.removeEventListener('keydown', onKey, true); };
    const onKey = (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); } };
    document.addEventListener('keydown', onKey, true);
    lb.addEventListener('click', (e) => { if (e.target === lb) close(); });
    document.body.append(lb);
  },
};

/* Bilder und Anhänge im Text (z.B. aus OneNote): Quelle wird aus dem Speicher nachgeladen */
async function downloadAttachment(name, fileName) {
  try {
    const u = await Backend.imgURL(name);
    if (!u) { UI.toast('Anhang nicht gefunden'); return; }
    const a = el('a', { href: u, download: fileName || name });
    document.body.append(a);
    a.click();
    setTimeout(() => a.remove(), 1000);
  } catch (e) { UI.toast('Anhang konnte nicht geöffnet werden'); }
}
function hydrateBox(t) {
  for (const im of t.querySelectorAll('img[data-kt-src]')) { im.decoding = 'async'; Backend.setImg(im, im.dataset.ktSrc); }
  // Formeln immer aus dem gespeicherten Quelltext neu aufbauen
  if (typeof Formula !== 'undefined') for (const m of t.querySelectorAll('.kt-math[data-tex]')) m.innerHTML = Formula.toMathML(m.dataset.tex, m.dataset.display === '1');
}
/* hineingezogene Ordner rekursiv lesen → [{ file, path }] (nur, was der Import braucht) */
async function readDropDirs(dirs) {
  const out = [];
  const all = (reader) => new Promise((res) => { const acc = []; const step = () => reader.readEntries((es) => { if (!es.length) res(acc); else { acc.push(...es); step(); } }, () => res(acc)); step(); });
  const walk = async (en, path) => {
    if (en.isFile) {
      if (!OneImport.wanted(path)) return;
      const f = await new Promise((res) => en.file(res, () => res(null)));
      if (f) out.push({ file: f, path });
    } else if (en.isDirectory) {
      for (const c of await all(en.createReader())) await walk(c, path + '/' + c.name);
    }
  };
  for (const d of dirs) await walk(d, d.name);
  return out;
}
/* HTML eines Textfelds ohne sitzungsgebundene Bildadressen */
function boxHtml(t) {
  let h = t.innerHTML;
  // Seitenumbruch-Abstände der Word-Ansicht (1.66) sind nur Anzeige
  if (h.indexOf('data-kt-pm') >= 0) h = h.replace(/ data-kt-pm="[^"]*"/g, '').replace(/\s*--kt-pm:\s*[^;"]*;?/g, '').replace(/\sstyle="\s*"/g, '');
  return Contrast.strip(h).replace(/(<img\b[^>]*?\bdata-kt-src="[^"]*"[^>]*?)\ssrc="(?:blob:|bilder\/)[^"]*"/g, '$1').replace(/(<img\b[^>]*?)\ssrc="(?:blob:|bilder\/)[^"]*"([^>]*\bdata-kt-src=)/g, '$1$2');
}

/* Darstellung der Ansicht v von Seite p: Verschiebung/Zoom der Welt und Hintergrund (Punkte, Karos, Linien,
 * Seitenfarbe). Die Zeichenfläche und die Vorschau anderer Bereiche (Panes, 1.35) nutzen dieselbe Rechnung. */
function viewStyle(p, v) {
  const bg = (p && p.bg) || 'keiner';
  const [kind, size] = bg.split('-');
  const step = { punkte: 20, raster: { s: 12, m: 20, l: 32 }[size || 'm'], linien: { s: 16, m: 24, l: 36 }[size || 'm'] }[kind] || 20;
  // sehr klein gezoomt (seit 1.29 bis 1 %): nur jede 4./16./… Linie, sonst wird der Hintergrund zu dicht und langsam
  let s = step * v.z;
  while (s < 8) s *= 4;
  const o = { transform: `translate(${f1(v.x)}px, ${f1(v.y)}px) scale(${v.z})`, bgPos: `${v.x}px ${v.y}px`, bgImage: 'none', bgSize: '', bgColor: '' };
  if (kind === 'punkte') {
    const r = Math.max(0.7, 1.15 * Math.min(v.z, 1.6));
    o.bgImage = `radial-gradient(circle at ${s / 2}px ${s / 2}px, var(--dot) ${r}px, transparent ${r + 0.6}px)`;
    o.bgSize = `${s}px ${s}px`;
  } else if (kind === 'raster') {
    o.bgImage = 'linear-gradient(to right, var(--gridline) 1px, transparent 1px), linear-gradient(to bottom, var(--gridline) 1px, transparent 1px)';
    o.bgSize = `${s}px ${s}px`;
  } else if (kind === 'linien') {
    o.bgImage = 'linear-gradient(to bottom, var(--gridline) 1px, transparent 1px)';
    o.bgSize = `100% ${s}px`;
  }
  const pc = p && p.color;
  o.bgColor = !pc ? '' : document.body.dataset.theme === 'dunkel' ? `color-mix(in srgb, ${pc} 16%, #1f1f1f)` : pc;
  return o;
}

const Canvas = {
  pageId: null, page: null,
  view: { x: 40, y: 30, z: 1 },
  sel: new Set(), selLink: null, selImg: null, editing: null,
  els: new Map(), pkgEls: new Map(), rects: new Map(), linkGeo: new Map(), linkInfo: new Map(), linkDrag: null,
  drag: null, bulk: false, lastRange: null, lastRangeBox: null,
  clip: null, clipText: '', mouse: null, spaceDown: false, connTarget: null,

  init() {
    this.vp = $('#viewport'); this.world = $('#world');
    this.lp = $('#layer-pkgs'); this.lb = $('#layer-boxes'); this.lbg = $('#layer-bg'); this.lpic = $('#layer-pics'); this.lfr = $('#layer-front');
    this.svg = $('#layer-links'); this.lg = $('#links-g'); this.ov = $('#layer-overlay'); this.hs = $('#layer-handles');
    this.ro = new ResizeObserver(() => this.layoutSoon());
    const vp = this.vp;
    this.initScroll();
    new ResizeObserver(() => this.scrollSoon()).observe(vp);
    vp.addEventListener('pointerdown', e => this.onDown(e));
    vp.addEventListener('pointermove', e => this.onMove(e));
    vp.addEventListener('pointerup', e => this.onUp(e));
    vp.addEventListener('pointercancel', e => this.onUp(e, true));
    vp.addEventListener('wheel', e => this.onWheel(e), { passive: false });
    vp.addEventListener('contextmenu', e => { if (!(e.shiftKey && e.target.closest('.box-text'))) e.preventDefault(); });
    vp.addEventListener('dblclick', e => this.onDbl(e));
    vp.addEventListener('click', e => this.onClick(e));
    vp.addEventListener('dragover', e => { if ([...e.dataTransfer.types].includes('Files')) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; } });
    vp.addEventListener('drop', e => this.onDrop(e));
    vp.addEventListener('scroll', () => {
      const dx = vp.scrollLeft, dy = vp.scrollTop;
      if (!dx && !dy) return;
      vp.scrollLeft = 0; vp.scrollTop = 0;
      if (this.editing && !this.bulk) { this.view.x -= dx; this.view.y -= dy; this.applyView(); }
    });
    for (const layer of this.boxLayers()) {   // Felder: Hintergrund, Bilder, normale Ebene, vor den Zeichnungen (1.46)
      layer.addEventListener('input', e => this.onInput(e));
      layer.addEventListener('focusin', e => this.onFocus(e));
      layer.addEventListener('focusout', e => this.onBlur(e));
      // Bilder im Text nicht per Ziehen innerhalb des Textes verschieben (das verändert die Formatierung)
      layer.addEventListener('dragstart', e => { if (e.target.closest && e.target.closest('.box-text img, .box-text .kt-video')) e.preventDefault(); });
      layer.addEventListener('keydown', e => this.onTextKey(e));
      layer.addEventListener('mouseup', e => { if (Fmt.painter) setTimeout(() => Fmt.applyPainter(), 0); });
    }
    document.addEventListener('selectionchange', () => this.onSelChange());

    const title = $('#page-title');
    title.addEventListener('input', () => {
      if (!this.page) return;
      this.page.title = title.value;
      Hist.pendingLabel = 'Seitentitel geändert';
      Hist.touchPage(this.pageId);
      Hist.commitSoon();
      this.renderPagesSoon();
      App.updateTitle();
    });
    title.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === 'Escape') { e.preventDefault(); title.blur(); } });
    // Titel merken: Bezüge anderer Seiten ([Alter Titel]Tabelle1!A1) gehen beim Umbenennen mit (1.26)
    title.addEventListener('focus', () => { this._titleWas = this.page ? { pid: this.pageId, t: this.page.title } : null; });
    title.addEventListener('blur', () => {
      const w = this._titleWas, p = w && Store.pages[w.pid];
      this._titleWas = null;
      if (p && p.title !== w.t && typeof Sheet !== 'undefined') {
        const nt = p.title;
        p.title = w.t;
        const touched = Sheet.keepRefs(() => { p.title = nt; });
        if (touched.size) { Hist.touchPage(w.pid); Hist.commit('Seitentitel geändert'); }
        else if (this.page && this.pageId === w.pid) Sheet.redrawAll();
      }
      Hist.flushPending(); Sidebar.renderPages();
    });
  },

  renderPagesSoon: debounce(() => Sidebar.renderPages(), 300),

  /* ---------------------------------------------------------- Laden */
  load(pageId) {
    if (this.editing) this.stopEditing();
    if (typeof Sheet !== 'undefined') { if (Sheet.active) Sheet.deactivate(); Sheet.bump(); }
    Hist.flushPending();
    this.pageId = pageId && Store.pages[pageId] ? pageId : null;
    this.page = this.pageId ? Store.pages[this.pageId] : null;
    this.sel.clear(); this.selLink = null; this.selImg = null; this.editing = null;
    if (typeof Sheet !== 'undefined' && Sheet.barSync) Sheet.barSync(true);   // Formelleiste gehört zur Seite (1.68) – Ansicht der neuen Seite kommt gleich
    Draw.sel.clear();
    for (const e of this.els.values()) { this.ro.unobserve(e); e.remove(); }
    this.els.clear();
    for (const e of this.pkgEls.values()) e.remove();
    this.pkgEls.clear();
    this.rects.clear();
    const v = this.pageId && Store.ui.views[this.pageId];
    this.view = v ? { x: +v.x || 0, y: +v.y || 0, z: clamp(+v.z || 1, ZOOM_MIN, ZOOM_MAX) } : { x: 40, y: 30, z: 1 };
    this.render(true);
    if (typeof Plugins !== 'undefined' && Plugins.has('pageOpen')) Plugins.emit('pageOpen', { page: this.pageId, title: this.page ? this.page.title || '' : '', type: this.page ? this.page.type || 'frei' : null });   // Add-Ins (1.69)
    // noch nie geöffnet: Ecke oben links aller Objekte (Ankerpunkt) oben links anzeigen – wie OneNote
    if (!v && this.page) {
      const C = this.contentRect();
      if (C) {
        // schmales Fenster (Handy): etwas verkleinern, damit die erste Spalte ganz sichtbar ist
        const W = this.vp.clientWidth, narrow = W < 640;
        const z = narrow ? clamp((W - 24) / Math.min(C.w || W, 560), 0.45, 1) : 1, m = narrow ? 12 : 40;
        this.view = { z, x: m - C.x * z, y: (narrow ? 12 : 30) - C.y * z };
      }
    }
    this.applyView();
    this.updateHeader();
    const es = $('#empty-state');
    es.hidden = !!this.page;
    if (!this.page) {
      es.innerHTML = '';
      const g = Tree.group(Store.ui.currentGroup);
      const c = !g && Tree.group(Store.ui.currentContainer);
      es.append(el('div', { html: icon(g ? 'page' : 'book', 44) }),
        el('div', { text: g ? 'Dieser Abschnitt hat noch keine Seiten.' : c ? `„${c.name}“ hat noch keine Abschnitte.` : 'Erstelle zuerst ein Notizbuch.' }),
        el('button', { class: 'btn primary', text: g ? '+ Neue Seite' : c ? '+ Neuer Abschnitt' : '+ Neues Notizbuch', onclick: () => g ? Ops.newPage(g.id) : c ? Ops.newSection(c.id) : Ops.newNotebook() }));
    }
    Ribbon.refreshSoon();
  },
  /* beliebiges Seitenobjekt anzeigen (Seitenversionen), Ansicht bleibt */
  showPage(page) {
    if (this.editing) this.stopEditing();
    if (typeof Sheet !== 'undefined') { if (Sheet.active) Sheet.deactivate(); Sheet.bump(); }
    this.page = page;
    this.sel.clear(); this.selLink = null; this.selImg = null;
    Draw.sel.clear();
    for (const e of this.els.values()) { this.ro.unobserve(e); e.remove(); }
    this.els.clear();
    for (const e of this.pkgEls.values()) e.remove();
    this.pkgEls.clear();
    this.rects.clear();
    // Objekt-URLs der Bilder begrenzen (1.18): nur die dieser Seite behalten – sonst hält jede je angesehene
    // (oder exportierte) Seite ihre Bilder für immer im Speicher
    // Bilder dieser Seite und der Vorschauen anderer Bereiche (1.35) behalten – die Liste erst bauen, wenn wirklich
    // aufgeräumt wird (JSON einer Seite mit tausenden Strichen kostet sonst bei jedem Aufruf ~60 ms)
    if (page && Backend.trimURLs) Backend.trimURLs(() => new Set([...(JSON.stringify([page.boxes, page.drawings]).match(/[0-9a-f]{40}\.[a-z0-9]{1,8}/g) || []), ...(typeof Panes !== 'undefined' ? Panes.keepNames() : [])]));
    this.render(true);
    this.applyView();
    this.updateHeader();
  },
  reload() {
    if (typeof Sheet !== 'undefined') Sheet.bump();
    this.page = this.pageId ? Store.pages[this.pageId] : null;
    if (!this.page) { this.load(null); return; }
    const ids = new Set([...this.page.boxes.map(b => b.id), ...this.page.pkgs.map(k => k.id)]);
    this.sel = new Set([...this.sel].filter(id => ids.has(id)));
    if (this.selLink && !this.page.links.some(l => l.id === this.selLink)) this.selLink = null;
    this.selImg = null;
    this.render(true);
    this.applyView();
    this.updateHeader();
  },
  updateHeader() {
    const t = $('#page-title');
    t.disabled = !this.page || !!App.preview;
    if (document.activeElement !== t) t.value = this.page ? this.page.title : '';
    $('#page-meta').textContent = this.page ? fmtDate(this.page.created) : '';
  },

  box(id) { return this.page ? this.page.boxes.find(b => b.id === id) : null; },
  pkg(id) { return this.page ? this.page.pkgs.find(k => k.id === id) : null; },
  members(pid) { return this.page.boxes.filter(b => b.pkg === pid); },
  // Hintergrund ist verankert (1.43): nicht verschieben, nicht in der Grösse ändern, nicht bearbeiten – lösen nur mit
  // Rechtsklick → „… als Hintergrund“ (Häkchen weg)
  /* Ebenen der Felder (1.46): Hintergrund (bg) · Bilder (immer unter allen Zeichnungen) · Text (zwischen den
   * Zeichnungen „hinter“ und „vor dem Text“) · vor den Zeichnungen (b.front, ganz oben). Bild = Feld nur mit einem Bild. */
  boxLayers() { return [this.lbg, this.lpic, this.lb, this.lfr].filter(Boolean); },
  layerOf(b) { return b.bg ? this.lbg : b.front ? this.lfr : this.isPictureBox(b) ? this.lpic : this.lb; },
  setFront(on, boxes) {
    boxes = boxes || this.selectedBoxes();
    if (!boxes.length) return;
    for (const b of boxes) { if (on) { b.front = true; delete b.bg; } else delete b.front; }
    this.render(true); this.refreshSel();
    Hist.touchPage(this.pageId);
    Hist.commit(on ? 'Vor die Zeichnungen' : 'Hinter die Zeichnungen');
  },
  /* Rechtsklick (1.48): „als Hintergrund“ getrennt nach Art – Bild, Text, Zeichnung (je Häkchen, Anzahl), bei
   * gemischter Auswahl zusätzlich „Alles als Hintergrund“. Text = Felder mit Text (auch Diagramme), Bild = Feld nur
   * mit einem Bild. */
  bgMenuItems(boxes, draws) {
    const pics = boxes.filter(b => this.isPictureBox(b)), texts = boxes.filter(b => !this.isPictureBox(b));
    const it = (list, one, many, bx, dr) => {
      if (!list.length) return null;
      const on = list.every(x => x.bg), n = list.length;
      return { label: (n > 1 ? many : one) + ' als Hintergrund' + (n > 1 ? ` (${n})` : ''), icon: 'bgImage', checked: on, action: () => this.setBackground(!on, bx, dr) };
    };
    const out = [
      it(pics, 'Bild', 'Bilder', pics, []),
      it(texts, 'Text', 'Texte', texts, []),
      it(draws, 'Zeichnung', 'Zeichnungen', [], draws),
    ].filter(Boolean);
    if (out.length > 1) { const all = [...boxes, ...draws], on = all.every(x => x.bg); out.push({ label: `Alles als Hintergrund (${all.length})`, icon: 'bgImage', checked: on, action: () => this.setBackground(!on, boxes, draws) }); }
    return out;
  },
  isLocked(b) { if (!b) return true; if (b.locked || b.bg) return true; const k = b.pkg && this.pkg(b.pkg); return !!(k && k.locked); },
  nodeOf(id) { const b = this.box(id); if (b) return b.pkg || b.id; return this.pkg(id) ? id : null; },
  maxZ() { return this.page && this.page.boxes.length ? Math.max(...this.page.boxes.map(b => b.z)) : 0; },
  contentW(b) { return b.w - 2 * BORDER - 2 * PADX; },
  textEl(id) { const e = this.els.get(id); return e ? e.querySelector('.box-text') : null; },

  /* ---------------------------------------------------------- Zeichnen */
  render(force) {
    const p = this.page;
    if (!p) { this.lg.innerHTML = ''; this.updateStatus(); Draw.render(); return; }
    const seen = new Set();
    for (const b of p.boxes) {
      seen.add(b.id);
      let e = this.els.get(b.id);
      // während der Bearbeitung nicht umhängen (der Fokus ginge verloren) – z. B. erstes Zeichen in einem Bild-Feld
      const layer = e && this.editing === b.id && e.parentNode ? e.parentNode : this.layerOf(b);
      if (!e) { e = this.makeBox(b); this.els.set(b.id, e); layer.append(e); this.ro.observe(e); }
      else if (e.parentNode !== layer) layer.append(e);
      this.updateBox(b, e, force);
    }
    for (const [id, e] of this.els) if (!seen.has(id)) { this.ro.unobserve(e); e.remove(); this.els.delete(id); }
    this.layout();
    Draw.render();
  },
  makeBox(b) {
    if (b.sheet) return Sheet.make(b);
    if (b.chart) return Chart.make(b);
    const e = el('div', { class: 'box', dataset: { id: b.id } });
    e.innerHTML = `<div class="box-bar" title="Ziehen zum Verschieben"><span class="box-grip"></span><span class="box-lock">${icon('lock', 10)}</span></div>` +
      `<div class="box-body"><div class="fl"></div><div class="box-text" spellcheck="true"></div></div>` +
      `<div class="box-rs" title="Breite ändern"></div><div class="sock l" title="Ziehen zum Verbinden"></div><div class="sock r" title="Ziehen zum Verbinden"></div>`;
    return e;
  },
  updateBox(b, e, force) {
    e.style.left = b.x + 'px';
    e.style.top = b.y + 'px';
    e.style.width = b.w + 'px';
    e.style.zIndex = b.z;
    e.classList.toggle('bg', !!b.bg);
    e.classList.toggle('off', typeof OfficeView !== 'undefined' && OfficeView.hidden(this.page, b));   // Excel: nur das gewählte Blatt
    if (b.anim && b.anim.fx && b.anim.fx !== 'none') e.dataset.anim = b.anim.n || 1; else if (e.dataset.anim) delete e.dataset.anim;   // PowerPoint-Animation (1.66)
    const locked = this.isLocked(b);
    e.classList.toggle('locked', locked);
    e.classList.toggle('sel', this.sel.has(b.id));
    const st = b.style || {};
    e.classList.toggle('plain', st.bg === 'transparent');
    e.classList.toggle('onote', !!st.on);
    e.classList.toggle('ofc', !!b.ox && !!st.border && st.bg !== 'transparent');   // Office-Seite: Feld wie in der Datei (1.60)
    e.classList.toggle('ow', !!b.ox && (b.ox.k === 'w' || b.ox.k === 'hf'));   // Word: Schreibbereich ohne Rahmen (1.66)
    e.classList.toggle('owb', !!b.ox && /^(w|wimg|wlock|wtoc|wfl|wfb|wfn|hf|hfp)$/.test(b.ox.k));   // alle Felder einer Word-Seite (1.74): Grundschrift, Überschriften ohne eigene Abstände
    e.classList.toggle('ofc-sheet', !!b.sheet && !!b.ox && b.ox.k === 'xl');   // Excel: Blatt ohne Rahmen (1.66)
    e.classList.toggle('oblatt', !!b.ox && (b.ox.k === 'blatt' || b.ox.k === 'folie'));
    e.classList.toggle('ofolie', !!b.ox && b.ox.k === 'folie');   // Word-Blatt / PowerPoint-Folie: Schatten am Blatt, nicht am Feld
    e.style.background = st.bg && st.bg !== 'transparent' ? st.bg : '';
    e.style.borderColor = st.border || '';
    if (b.sheet) { this.applyInk(b, e); Sheet.update(b, e, force); return; }
    if (b.chart) { Chart.update(b, e, force); return; }
    const t = e.querySelector('.box-text');
    t.style.lineHeight = st.lh || '';
    if (b.ph) { if (t.dataset.ph !== b.ph.t) t.dataset.ph = b.ph.t; t.style.setProperty('--ph-fs', (b.ph.fs || 18) + 'px'); t.style.setProperty('--ph-al', b.ph.al === 'c' ? 'center' : 'left'); }   // Platzhalter (1.67)
    else if (t.dataset.ph) { delete t.dataset.ph; t.style.removeProperty('--ph-fs'); t.style.removeProperty('--ph-al'); }
    const ce = locked ? 'false' : 'true';
    if (t.getAttribute('contenteditable') !== ce) t.setAttribute('contenteditable', ce);
    if (e._html !== b.html && (force || this.editing !== b.id)) { t.innerHTML = b.html; e._html = b.html; e._inkHtml = null; hydrateBox(t); }
    this.applyInk(b, e);
    const key = JSON.stringify(b.images) + '|' + b.w + '|' + (this.selImg && this.selImg.box === b.id ? this.selImg.img : '');
    if (e._fl !== key) { this.renderFloats(b, e); e._fl = key; }
  },
  /* ---------------------------------------------------------- Schriftfarbe passend zum Hintergrund (seit 1.14) */
  /* Hintergrund der Seite, wie er angezeigt wird (Seitenfarbe im dunklen Design abgedunkelt, siehe applyView) */
  pageBg() {
    const pc = this.page && this.page.color && Contrast.rgb(this.page.color);
    if (!pc) return Contrast.themeColor('--canvas');
    return Contrast.dark() ? Contrast.mix([31, 31, 31, 255], pc, 0.16) : pc;
  },
  /* Hintergrund hinter dem Text eines Feldes: Fülleffekt, sonst Seite (unsichtbares Feld, Tabelle) bzw. Feldfarbe des Designs */
  inkBg(b) {
    const st = b.style || {};
    if (st.bg && st.bg !== 'transparent') {
      const c = Contrast.rgb(st.bg);
      if (c && c[3] >= 250) return c;
      if (c && c[3] > 0) return Contrast.over(c, Contrast.themeColor('--box-bg'));
    }
    if (st.under) { const c = Contrast.rgb(st.under); if (c) return c; }   // Office-Folie: Hintergrund der Folie (1.61)
    if (st.bg === 'transparent' || b.sheet) return this.pageBg();
    return Contrast.themeColor('--box-bg');
  },
  /* automatische Schriftfarbe setzen und fest gewählte Farben prüfen (nur Anzeige, gespeichert wird das Original) */
  applyInk(b, e) {
    if (!b || !e || b.chart) return;
    const bg = this.inkBg(b), dark = Contrast.dark();
    const own = Contrast.boxColor(b.style);
    const key = Contrast.key() + '|' + Contrast.hex(bg) + '|' + (own || '');
    if (e._inkKey === key && e._inkHtml === b.html) return;
    e._inkKey = key; e._inkHtml = b.html;
    const auto = Contrast.auto(bg, dark);
    e.style.setProperty('--auto-ink', auto);
    const link = Contrast.fixOn() ? Contrast.readable(dark ? '#7fb0ff' : '#2f6fd0', bg, dark) : null;
    if (link) e.style.setProperty('--auto-link', link); else e.style.removeProperty('--auto-link');
    const t = !b.sheet && e.querySelector('.box-text');
    if (!t) return;
    const fix = own && Contrast.fixOn() ? Contrast.readable(own, bg, dark) : null;
    t.style.color = fix || own || '';
    Contrast.adapt(t, { bg, declared: own, shown: fix || (own && Contrast.hex(own)) || auto });
  },
  /* nach Wechsel von Design, Seitenfarbe oder Einstellung */
  refreshInk() {
    if (!this.page) return;
    for (const b of this.page.boxes) {
      const e = this.els.get(b.id);
      if (!e) continue;
      if (b.sheet) Sheet.update(b, e);
      this.applyInk(b, e);
    }
  },
  /* Bilder als "Floats": der Text fliesst automatisch um das Bild herum */
  renderFloats(b, e) {
    const fl = e.querySelector('.fl');
    fl.innerHTML = '';
    if (!b.images.length) return;
    const cw = this.contentW(b);
    const imgs = [...b.images].sort((a, c) => a.y - c.y);
    const bottom = { left: 0, right: 0 };
    let lastTop = 0;
    for (const im of imgs) {
      const w = Math.max(16, Math.min(im.w, cw));
      const h = Math.max(12, Math.round(im.h * w / im.w));
      const x = clamp(im.x, 0, Math.max(0, cw - w));
      const side = (x + w / 2) <= cw / 2 ? 'left' : 'right';
      const T = Math.max(bottom[side], lastTop);
      const sp = Math.max(0, im.y - T);
      const spacer = el('div', { class: 'fl-sp', style: { float: side, clear: side, width: '0px', height: sp + 'px' } });
      const wrap = el('div', { class: 'fimg' + (this.selImg && this.selImg.img === im.id ? ' sel' : ''), dataset: { img: im.id }, style: { float: side, clear: side, width: w + 'px', height: h + 'px' } });
      if (side === 'left') { wrap.style.marginLeft = x + 'px'; wrap.style.marginRight = IMG_GAP + 'px'; }
      else { wrap.style.marginRight = (cw - x - w) + 'px'; wrap.style.marginLeft = IMG_GAP + 'px'; }
      const img = el('img', { alt: '', draggable: 'false', decoding: 'async', dataset: { ktImg: im.src } });   // entschlüsseln ohne die Seite anzuhalten; Name für Vorschau-Kopien (1.35)
      Backend.setImg(img, im.src);
      wrap.append(img);
      if (typeof Plugins !== 'undefined' && Plugins.has('imageRender')) Plugins.emit('imageRender', { box: b, image: im, el: wrap });   // z.B. Chem-Draw: Struktur kennzeichnen (1.69)
      if (im.video) { wrap.classList.add('is-video'); wrap.append(el('button', { class: 'fimg-play', type: 'button', title: 'Video abspielen' + (im.title ? ': ' + im.title : '') })); }
      wrap.append(el('div', { class: 'fimg-rs', title: 'Grösse ändern' }));
      fl.append(spacer, wrap);
      const top = T + sp;
      bottom[side] = top + h + 4;
      lastTop = top;
    }
  },

  layoutSoon() {
    if (this._lraf) return;
    this._lraf = requestAnimationFrame(() => { this._lraf = null; this.layout(); });
  },
  layout() {
    const p = this.page;
    if (!p) return;
    this.rects.clear();
    for (const b of p.boxes) {
      const e = this.els.get(b.id);
      if (e) this.rects.set(b.id, { x: b.x, y: b.y, w: b.w, h: e.offsetHeight || 40 });
    }
    // Office-Seiten (1.65): Word-Text fliesst auf dem Papier, Blätter wachsen mit → danach neu zeichnen
    if (p.office && typeof OfficeView !== 'undefined') {
      if (OfficeView.flow(p, this.rects) && !this._ofFlow) { this._ofFlow = true; requestAnimationFrame(() => { this._ofFlow = false; this.render(); }); }
      OfficeView.syncSoon();
    } else if (typeof OfficeView !== 'undefined' && OfficeView.kind) OfficeView.syncSoon();
    const seen = new Set();
    for (const k of p.pkgs) {
      const mem = p.boxes.filter(b => b.pkg === k.id);
      if (!mem.length) continue;
      let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity, zmin = Infinity;
      for (const m of mem) {
        const r = this.rects.get(m.id);
        if (!r) continue;
        x1 = Math.min(x1, r.x); y1 = Math.min(y1, r.y); x2 = Math.max(x2, r.x + r.w); y2 = Math.max(y2, r.y + r.h); zmin = Math.min(zmin, m.z);
      }
      if (x1 === Infinity) continue;
      const r = { x: x1 - PKG_PAD, y: y1 - PKG_PAD - PKG_HEAD, w: x2 - x1 + 2 * PKG_PAD, h: y2 - y1 + 2 * PKG_PAD + PKG_HEAD };
      this.rects.set(k.id, r);
      seen.add(k.id);
      let e = this.pkgEls.get(k.id);
      if (!e) {
        e = el('div', { class: 'pkg', dataset: { id: k.id } });
        e.innerHTML = `<div class="pkg-head" title="Ziehen zum Verschieben · Doppelklick zum Umbenennen"><span class="pkg-lock">${icon('lock', 12)}</span><span class="pkg-title"></span></div><div class="sock l" title="Ziehen zum Verbinden"></div><div class="sock r" title="Ziehen zum Verbinden"></div>`;
        this.lp.append(e);
        this.pkgEls.set(k.id, e);
      }
      Object.assign(e.style, { left: r.x + 'px', top: r.y + 'px', width: r.w + 'px', height: r.h + 'px', zIndex: zmin });
      e.style.setProperty('--pc', k.color || PKG_COLORS[0]);
      e.querySelector('.pkg-title').textContent = k.title || 'Paket';
      e.classList.toggle('sel', this.sel.has(k.id));
      e.classList.toggle('locked', !!k.locked);
    }
    for (const [id, e] of this.pkgEls) if (!seen.has(id)) { e.remove(); this.pkgEls.delete(id); }
    this.renderLinks();
    this.updateStatus();
    this.scrollSoon();
  },

  renderLinks() {
    const p = this.page;
    this.linkGeo.clear();
    this.linkInfo.clear();
    const drag = this.linkDrag;
    const items = [];
    for (const l of p.links) {
      let a = this.nodeOf(l.a), b = this.nodeOf(l.b);
      if (!a || !b) continue;
      if (a === b) { a = l.a; b = l.b; if (a === b) continue; }
      const ra = this.rects.get(a), rb = this.rects.get(b);
      if (!ra || !rb) continue;
      const [sa, sb] = pickSides(ra, rb);
      const it = { l, a, b, ra, rb, sa, sb, fixa: false, fixb: false };
      if (l.aAnchor) { it.sa = l.aAnchor.side; it.pa = anchorPoint(ra, it.sa, l.aAnchor.t); it.fixa = true; }
      if (l.bAnchor) { it.sb = l.bAnchor.side; it.pb = anchorPoint(rb, it.sb, l.bAnchor.t); it.fixb = true; }
      if (drag && drag.id === l.id) {
        const e = drag.end;
        if (drag.anchor) { it['s' + e] = drag.anchor.side; it['p' + e] = anchorPoint(drag.rect, drag.anchor.side, drag.anchor.t); }
        else if (drag.pt) it['p' + e] = drag.pt;
        it['fix' + e] = true;
      }
      items.push(it);
    }
    // automatische Ansatzpunkte gleichmässig auf die Seite verteilen
    const groups = new Map();
    const add = (node, side, it, end, other) => {
      const k = node + '|' + side;
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push({ it, end, other });
    };
    for (const it of items) {
      if (!it.fixa) add(it.a, it.sa, it, 'a', rectCenter(it.rb));
      if (!it.fixb) add(it.b, it.sb, it, 'b', rectCenter(it.ra));
    }
    for (const [k, arr] of groups) {
      const side = k.split('|').pop();
      const horiz = side === 'l' || side === 'r';
      arr.sort((u, v) => horiz ? u.other.y - v.other.y : u.other.x - v.other.x);
      const spread = Math.min(0.9, 0.5 + 0.1 * arr.length);
      arr.forEach((o, i) => {
        const r = o.end === 'a' ? o.it.ra : o.it.rb;
        o.it['p' + o.end] = sidePoint(r, side, (i + 1) / (arr.length + 1), spread);
      });
    }
    // mehrere Verbindungen zwischen denselben Feldern: automatisch auseinanderbiegen
    const pairs = new Map();
    for (const it of items) {
      const k = it.a < it.b ? it.a + '|' + it.b : it.b + '|' + it.a;
      if (!pairs.has(k)) pairs.set(k, []);
      pairs.get(k).push(it);
    }
    for (const arr of pairs.values()) {
      const free = arr.filter(it => !it.fixa && !it.fixb && !it.l.bend);
      if (arr.length < 2 || !free.length) continue;
      // gemeinsame Querrichtung für alle Linien dieses Paares, Reihenfolge nach Lage der Ansatzpunkte
      const [ra, rb] = arr[0].a < arr[0].b ? [arr[0].ra, arr[0].rb] : [arr[0].rb, arr[0].ra];
      const c1 = rectCenter(ra), c2 = rectCenter(rb);
      const len = Math.hypot(c2.x - c1.x, c2.y - c1.y) || 1;
      const perp = { x: -(c2.y - c1.y) / len, y: (c2.x - c1.x) / len };
      for (const it of arr) it.dev = ((it.pa.x + it.pb.x) / 2) * perp.x + ((it.pa.y + it.pb.y) / 2) * perp.y;
      arr.sort((u, v) => u.dev - v.dev);
      arr.forEach((it, i) => { it.parOff = (i - (arr.length - 1) / 2) * 30; it.perp = perp; });
    }

    let bx1 = Infinity, by1 = Infinity, bx2 = -Infinity, by2 = -Infinity;
    let out = '';
    // Hindernisse (1.9): Linien führen um Felder, Bilder, Strukturformeln, Tabellen, Diagramme und Pakete herum
    const route = Store.ui.linkRoute !== false && typeof Route !== 'undefined';
    const obsAll = route ? this.obstacles() : [];
    const t0 = performance.now();
    let more = false;
    if (!this.routeCache || this.routeCache.page !== p.id) { this.routeCache = new Map(); this.routeCache.page = p.id; }
    for (const it of items) {
      const mid0 = { x: (it.pa.x + it.pb.x) / 2, y: (it.pa.y + it.pb.y) / 2 };
      let M = null;
      if (it.l.bend) M = { x: mid0.x + it.l.bend.x, y: mid0.y + it.l.bend.y };
      else if (it.parOff && !it.fixa && !it.fixb) M = { x: mid0.x + it.perp.x * it.parOff, y: mid0.y + it.perp.y * it.parOff };
      let g = null;
      // Ausweichen: auch die eigenen Felder zählen (nie zurück hinter das eigene Feld, Pfeil immer von aussen)
      if (route && !it.l.bend && !(drag && drag.id === it.l.id && drag.pt)) {
        let raw = this.linkObstacles(it, obsAll);
        const rr = (r) => `${f1(r.x)},${f1(r.y)},${f1(r.w)},${f1(r.h)}`;
        const key = [it.l.style, it.l.arrow, it.l.w, f1(it.pa.x), f1(it.pa.y), f1(it.pb.x), f1(it.pb.y), it.sa, it.sb, M ? f1(M.x) + ',' + f1(M.y) : '', rr(it.ra), rr(it.rb), ...raw.map(r => `${r.id}:${rr(r)}`)].join('|');
        const c = this.routeCache.get(it.l.id);
        if (c && c.key === key) g = c.g;
        else if (performance.now() - t0 < 10) {
          const own = [it.ra, it.rb];
          g = this.linkShape(it.pa, it.sa, it.pb, it.sb, it.l, M, { raw, own });
          // ein Umweg kann über das Suchfenster hinausgehen: dort getroffene Felder dazunehmen und nochmals suchen
          for (let k = 0; k < 2 && g.routed; k++) {
            const extra = this.linkObstacles(it, obsAll, true).filter(o => !raw.includes(o) && Route.polyBlocked(g.pts, [Route.grow(o, 6)]));
            if (!extra.length) break;
            raw = raw.concat(extra);
            g = this.linkShape(it.pa, it.sa, it.pb, it.sb, it.l, M, { raw, own });
          }
          this.routeCache.set(it.l.id, { key, g });
        } else { more = true; if (c) g = c.g; }   // Rechenzeit für dieses Bild aufgebraucht: bis zum nächsten Bild den letzten Weg zeigen
      }
      if (!g) g = this.linkShape(it.pa, it.sa, it.pb, it.sb, it.l, M);
      this.linkGeo.set(it.l.id, g.pts);
      this.linkInfo.set(it.l.id, { mid0, M: g.bendPt, handle: g.handle, pa: it.pa, pb: it.pb });
      for (const q of g.bounds) { bx1 = Math.min(bx1, q.x); by1 = Math.min(by1, q.y); bx2 = Math.max(bx2, q.x); by2 = Math.max(by2, q.y); }
      const col = it.l.color || 'var(--link)';
      const sel = this.selLink === it.l.id;
      const w = (it.l.w || 2) + (sel ? 1 : 0);
      out += `<path class="link${sel ? ' sel' : ''}" d="${g.d}" stroke="${col}" stroke-width="${w}"${it.l.dash ? ' stroke-dasharray="7 6"' : ''}/>`;
      for (const a of g.arrows) out += `<path class="link-arrow" d="${a}" fill="${col}"/>`;
      for (const s of g.socks) out += `<circle class="link-sock" cx="${f1(s.x)}" cy="${f1(s.y)}" r="${sel ? 5 : 4.2}" fill="${col}"/>`;
      out += `<path class="link-hit" data-link="${it.l.id}" d="${g.d}"/>`;
      if (it.l.label) out += `<text class="link-label" data-link="${it.l.id}" x="${f1(g.mid.x)}" y="${f1(g.mid.y)}" text-anchor="middle" dominant-baseline="middle">${escapeHtml(it.l.label)}</text>`;
    }
    if (bx1 === Infinity) {
      this.svg.style.width = '0px'; this.svg.style.height = '0px'; this.lg.innerHTML = '';
    } else {
      const m = 60;
      bx1 -= m; by1 -= m; bx2 += m; by2 += m;
      Object.assign(this.svg.style, { left: bx1 + 'px', top: by1 + 'px', width: (bx2 - bx1) + 'px', height: (by2 - by1) + 'px' });
      this.lg.setAttribute('transform', `translate(${f1(-bx1)},${f1(-by1)})`);
      this.lg.innerHTML = out;
    }
    this.renderHandles();
    this.updateStatus();
    if (more && !this._routeRaf) this._routeRaf = requestAnimationFrame(() => { this._routeRaf = null; if (this.page === p) this.renderLinks(); });
  },
  /* Hindernisse für Verbindungen: Felder (Mitglieder eines Pakets zählen über das Paket) und Pakete */
  obstacles() {
    const p = this.page, out = [];
    for (const b of p.boxes) {
      if (b.bg) continue;   // Hintergrund (oft ein ganzseitiges Bild) ist kein Hindernis
      const r = this.rects.get(b.id);
      if (r) out.push({ id: b.id, pkg: b.pkg && this.rects.has(b.pkg) ? b.pkg : null, x: r.x, y: r.y, w: r.w, h: r.h });
    }
    for (const k of p.pkgs) { const r = this.rects.get(k.id); if (r) out.push({ id: k.id, isPkg: true, x: r.x, y: r.y, w: r.w, h: r.h }); }
    return out;
  },
  linkObstacles(it, all, everywhere) {
    const m = everywhere ? 1e7 : 260;
    const x1 = Math.min(it.pa.x, it.pb.x) - m, y1 = Math.min(it.pa.y, it.pb.y) - m, x2 = Math.max(it.pa.x, it.pb.x) + m, y2 = Math.max(it.pa.y, it.pb.y) + m;
    // Verbindung innerhalb eines Pakets: dessen übrige Mitglieder sind Hindernisse, das Paket selbst nicht
    const inner = new Set();
    for (const id of [it.a, it.b]) { const o = all.find(q => q.id === id); if (o && o.pkg) inner.add(o.pkg); }
    return all.filter(o => {
      if (o.id === it.a || o.id === it.b) return false;
      if (o.pkg && !inner.has(o.pkg)) return false;
      if (o.isPkg && inner.has(o.id)) return false;
      return o.x < x2 && o.x + o.w > x1 && o.y < y2 && o.y + o.h > y1;
    });
  },
  /* Anfasser der ausgewählten Verbindung: beide Enden + Mitte */
  renderHandles() {
    const hs = this.hs;
    const info = this.selLink && !this.linkDrag && this.linkInfo.get(this.selLink);
    const l = info && this.page.links.find(x => x.id === this.selLink);
    if (!info || !l) { hs.style.display = 'none'; hs.innerHTML = ''; return; }
    const z = this.view.z, r = clamp(6.5 / z, 4, 30), sw = clamp(2 / z, 1, 8);
    const pts = [['a', info.pa], ['b', info.pb], ['m', info.handle]];
    const x1 = Math.min(...pts.map(q => q[1].x)) - 40 / z, y1 = Math.min(...pts.map(q => q[1].y)) - 40 / z;
    const x2 = Math.max(...pts.map(q => q[1].x)) + 40 / z, y2 = Math.max(...pts.map(q => q[1].y)) + 40 / z;
    Object.assign(hs.style, { display: 'block', left: x1 + 'px', top: y1 + 'px', width: (x2 - x1) + 'px', height: (y2 - y1) + 'px' });
    const tip = { a: 'Anfang: ziehen = Ansatzpunkt verschieben oder an ein anderes Feld hängen · Doppelklick = automatisch', b: 'Ende: ziehen = Ansatzpunkt verschieben oder an ein anderes Feld hängen · Doppelklick = automatisch', m: 'Mitte: ziehen = Linie im Raum verschieben/biegen · Doppelklick = gerade zurück' };
    const fixed = { a: !!l.aAnchor, b: !!l.bAnchor, m: !!l.bend };
    hs.innerHTML = `<g transform="translate(${f1(-x1)},${f1(-y1)})">` + pts.map(([h, q]) =>
      `<circle class="link-handle ${h === 'm' ? 'mid' : 'end'}${fixed[h] ? ' fixed' : ''}" data-link="${l.id}" data-h="${h}" cx="${f1(q.x)}" cy="${f1(q.y)}" r="${f1(r)}" stroke-width="${f1(sw)}"><title>${tip[h]}</title></circle>`).join('') + '</g>';
  },
  linkShape(p1, s1, p2, s2, l, M, avoid) {
    const style = l.style || 'kurve', arrow = l.arrow || 'ende';
    // Pfeil kürzer, wenn die Felder sehr nah beieinander stehen (sonst ragt er ins andere Feld)
    let AL = Math.min(9 + (l.w || 2), Math.max(5, Math.hypot(p2.x - p1.x, p2.y - p1.y) * 0.4));
    // Winkel zwischen zugewandten Seiten: Pfeil höchstens halb so lang wie die Lücke (die Linie läuft in der Mitte der Lücke)
    if ((style || 'kurve') === 'winkel' && NORM[s1] && NORM[s2] && NORM[s1].x === -NORM[s2].x && NORM[s1].y === -NORM[s2].y) {
      const gapAx = NORM[s1].x ? (p2.x - p1.x) * NORM[s1].x : (p2.y - p1.y) * NORM[s1].y;
      if (gapAx > 0) AL = Math.min(AL, Math.max(4, gapAx * 0.5));
    }
    const n1 = NORM[s1], n2 = NORM[s2];
    const endA = arrow === 'beide', endB = arrow === 'ende' || arrow === 'beide';
    const arrows = [], socks = [];
    const unit = (a, b) => { const len = Math.hypot(b.x - a.x, b.y - a.y) || 1; return { x: (b.x - a.x) / len, y: (b.y - a.y) / len }; };
    const P = (q) => `${f1(q.x)},${f1(q.y)}`;
    const cubic = (a, c1, c2, b, n, out) => {
      for (let i = 0; i <= n; i++) {
        const t = i / n, mt = 1 - t;
        out.push({
          x: mt * mt * mt * a.x + 3 * mt * mt * t * c1.x + 3 * mt * t * t * c2.x + t * t * t * b.x,
          y: mt * mt * mt * a.y + 3 * mt * mt * t * c1.y + 3 * mt * t * t * c2.y + t * t * t * b.y,
        });
      }
    };
    let d, pts, mid, bounds, dirA, dirB, handle, bendPt = M;
    if (style === 'gerade') {
      const u1 = unit(p1, M || p2), u2 = unit(M || p1, p2);
      const q1 = endA ? { x: p1.x + u1.x * AL, y: p1.y + u1.y * AL } : p1;
      const q2 = endB ? { x: p2.x - u2.x * AL, y: p2.y - u2.y * AL } : p2;
      if (M) { d = `M${P(q1)}L${P(M)}L${P(q2)}`; pts = [p1, M, p2]; mid = M; }
      else { d = `M${P(q1)}L${P(q2)}`; pts = [p1, p2]; mid = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 }; }
      bounds = pts; dirB = u2; dirA = { x: -u1.x, y: -u1.y }; handle = mid;
    } else {
      const q1 = endA ? { x: p1.x + n1.x * AL, y: p1.y + n1.y * AL } : p1;
      const q2 = endB ? { x: p2.x + n2.x * AL, y: p2.y + n2.y * AL } : p2;
      dirB = { x: -n2.x, y: -n2.y }; dirA = { x: -n1.x, y: -n1.y };
      const perp = !!n1.x !== !!n2.x;   // eine Seite waagrecht, die andere senkrecht: über Eck
      if (style === 'winkel' && perp && !M) {
        const c = n1.x ? { x: q2.x, y: q1.y } : { x: q1.x, y: q2.y };
        d = `M${P(q1)}L${P(c)}L${P(q2)}`;
        pts = [p1, c, p2];
        mid = c; bounds = pts; handle = c;
      } else if (style === 'winkel') {
        const horiz = s1 === 'l' || s1 === 'r';
        // Knick in der Mitte der Lücke zwischen den Feldern (nicht der Pfeilspitzen), damit beide Seiten gleich viel Abstand haben
        const facing = n1.x === -n2.x && n1.y === -n2.y;
        if (horiz) {
          const mx = M ? M.x : facing ? (p1.x + p2.x) / 2 : (q1.x + q2.x) / 2;
          d = `M${P(q1)}H${f1(mx)}V${f1(q2.y)}H${f1(q2.x)}`;
          pts = [p1, { x: mx, y: q1.y }, { x: mx, y: q2.y }, p2];
          mid = { x: mx, y: (q1.y + q2.y) / 2 };
        } else {
          const my = M ? M.y : facing ? (p1.y + p2.y) / 2 : (q1.y + q2.y) / 2;
          d = `M${P(q1)}V${f1(my)}H${f1(q2.x)}V${f1(q2.y)}`;
          pts = [p1, { x: q1.x, y: my }, { x: q2.x, y: my }, p2];
          mid = { x: (q1.x + q2.x) / 2, y: my };
        }
        bounds = pts; handle = mid;
      } else if (!M) {
        const dd = clamp(Math.hypot(q2.x - q1.x, q2.y - q1.y) * 0.5, 40, 220);
        const c1 = { x: q1.x + n1.x * dd, y: q1.y + n1.y * dd }, c2 = { x: q2.x + n2.x * dd, y: q2.y + n2.y * dd };
        d = `M${P(q1)}C${P(c1)} ${P(c2)} ${P(q2)}`;
        pts = [];
        cubic(q1, c1, c2, q2, 24, pts);
        mid = pts[12]; handle = mid;
        bounds = [p1, p2, c1, c2];
      } else {
        // Kurve durch den verschobenen Punkt M (zwei weiche Bögen)
        const d1 = clamp(Math.hypot(M.x - q1.x, M.y - q1.y) * 0.55, 30, 200), d2 = clamp(Math.hypot(q2.x - M.x, q2.y - M.y) * 0.55, 30, 200);
        const c1 = { x: q1.x + n1.x * d1, y: q1.y + n1.y * d1 }, c4 = { x: q2.x + n2.x * d2, y: q2.y + n2.y * d2 };
        const tg = unit(c1, c4);
        const k1 = Math.hypot(M.x - q1.x, M.y - q1.y) * 0.35, k2 = Math.hypot(q2.x - M.x, q2.y - M.y) * 0.35;
        const c2 = { x: M.x - tg.x * k1, y: M.y - tg.y * k1 }, c3 = { x: M.x + tg.x * k2, y: M.y + tg.y * k2 };
        d = `M${P(q1)}C${P(c1)} ${P(c2)} ${P(M)}C${P(c3)} ${P(c4)} ${P(q2)}`;
        pts = [];
        cubic(q1, c1, c2, M, 14, pts);
        cubic(M, c3, c4, q2, 14, pts);
        mid = M; handle = M;
        bounds = [p1, p2, c1, c2, c3, c4, M];
      }
    }
    // Hindernisse im Weg, zu nah dran oder zurück durchs eigene Feld? Dann herumführen (Form bleibt: gerade = Knicke,
    // Kurve = Bögen, Winkel = rechtwinklig). M ist hier nur der automatische Versatz paralleler Linien.
    let routed = false;
    if (avoid && Route.shapeBad(pts, p1, p2, avoid.raw, avoid.own)) {
      const rp = Route.route(style, p1, n1, p2, n2, avoid.raw, avoid.own);
      if (rp && rp.length >= 2) {
        const u1 = unit(rp[0], rp[1]), u2 = unit(rp[rp.length - 2], rp[rp.length - 1]);
        const line = rp.slice();
        if (endA && Math.hypot(rp[1].x - rp[0].x, rp[1].y - rp[0].y) > AL) line[0] = { x: p1.x + u1.x * AL, y: p1.y + u1.y * AL };
        if (endB && Math.hypot(rp[rp.length - 1].x - rp[rp.length - 2].x, rp[rp.length - 1].y - rp[rp.length - 2].y) > AL) line[line.length - 1] = { x: p2.x - u2.x * AL, y: p2.y - u2.y * AL };
        d = Route.pathD(line, style === 'kurve' ? Math.round((rp.gap || 14) * 0.8) : 0);
        pts = rp; mid = Route.midPoint(rp); handle = mid; bounds = rp; bendPt = null;
        dirB = u2; dirA = { x: -u1.x, y: -u1.y };
        routed = true;
      }
    }
    const head = (tip, dir) => {
      const bx = tip.x - dir.x * AL, by = tip.y - dir.y * AL, px = -dir.y * (AL * 0.55), py = dir.x * (AL * 0.55);
      return `M${f1(tip.x)},${f1(tip.y)}L${f1(bx + px)},${f1(by + py)}L${f1(bx - px)},${f1(by - py)}Z`;
    };
    if (endB) arrows.push(head(p2, dirB)); else socks.push(p2);
    if (endA) arrows.push(head(p1, dirA)); else socks.push(p1);
    return { d, pts, mid, bounds, arrows, socks, handle, bendPt, routed };
  },

  /* ---------------------------------------------------------- Ansicht */
  applyView() {
    const v = this.view, vp = this.vp;
    if (typeof OfficeView !== 'undefined' && OfficeView.clamp) OfficeView.clamp(v);   // Excel: nicht über A1 hinaus, Köpfe bleiben stehen (1.67)
    const st = viewStyle(this.page, v);
    this.world.style.transform = st.transform;
    vp.style.backgroundPosition = st.bgPos;
    vp.style.backgroundImage = st.bgImage;
    vp.style.backgroundSize = st.bgSize;
    if (typeof OfficeView !== 'undefined') OfficeView.onView();
    vp.style.backgroundColor = st.bgColor;
    const pc = this.page && this.page.color;
    if (this._inkPage !== (pc || '') + Contrast.key()) { this._inkPage = (pc || '') + Contrast.key(); this.refreshInk(); }
    if (typeof Draw !== 'undefined') Draw.onView();
    const pct = Math.round(v.z * 100);
    $('#sb-zoom').value = zoomToSlider(v.z);
    $('#sb-zoom-val').textContent = pct + ' %';
    if (this.pageId) { Store.ui.views[this.pageId] = { x: Math.round(v.x), y: Math.round(v.y), z: v.z }; UiState.saveSoon(); }
    if (this.selLink && this.page) this.renderHandles();
    this.scrollSoon();
  },
  toWorld(cx, cy) {
    const r = this.vp.getBoundingClientRect();
    return { x: (cx - r.left - this.view.x) / this.view.z, y: (cy - r.top - this.view.y) / this.view.z };
  },
  viewCenter() {
    const r = this.vp.getBoundingClientRect();
    return this.toWorld(r.left + r.width / 2, r.top + r.height / 2);
  },
  zoomAt(cx, cy, factor) {
    if (typeof OfficeWord !== 'undefined') OfficeWord._fitW = false;   // eigener Zoom: bei Grössenänderung nicht mehr einpassen
    const r = this.vp.getBoundingClientRect();
    const w = this.toWorld(cx, cy);
    const z = clamp(this.view.z * factor, ZOOM_MIN, ZOOM_MAX);
    this.view.z = z;
    this.view.x = cx - r.left - w.x * z;
    this.view.y = cy - r.top - w.y * z;
    this.applyView();
  },
  setZoom(z) {
    const r = this.vp.getBoundingClientRect();
    this.zoomAt(r.left + r.width / 2, r.top + r.height / 2, z / this.view.z);
  },
  fit() {
    const rs = [...this.rects.values(), ...(this.page ? this.page.drawings.map(d => DG.bbox(d)) : [])];
    if (!this.page || !rs.length) { this.view = { x: 40, y: 30, z: 1 }; this.applyView(); return; }
    let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
    for (const r of rs) { x1 = Math.min(x1, r.x); y1 = Math.min(y1, r.y); x2 = Math.max(x2, r.x + r.w); y2 = Math.max(y2, r.y + r.h); }
    const W = this.vp.clientWidth, H = this.vp.clientHeight;
    const z = clamp(Math.min((W - 80) / (x2 - x1 || 1), (H - 80) / (y2 - y1 || 1)), ZOOM_MIN, 1.5);
    this.view = { z, x: (W - (x2 - x1) * z) / 2 - x1 * z, y: (H - (y2 - y1) * z) / 2 - y1 * z };
    this.applyView();
  },
  /* nur verschieben, wenn das Objekt nicht schon ganz sichtbar ist */
  revealBox(id) {
    const r = this.rects.get(id);
    if (!r) return;
    const z = this.view.z, W = this.vp.clientWidth, H = this.vp.clientHeight;
    const sx = r.x * z + this.view.x, sy = r.y * z + this.view.y;
    if (sx >= 0 && sy >= 0 && sx + r.w * z <= W && sy + r.h * z <= H) return;
    this.scrollToBox(id);
  },
  scrollToBox(id) {
    const r = this.rects.get(id);
    if (!r) return;
    const W = this.vp.clientWidth, H = this.vp.clientHeight, z = this.view.z;
    this.view.x = W / 2 - (r.x + r.w / 2) * z;
    this.view.y = Math.min(H / 2 - (r.y + r.h / 2) * z, 40 - r.y * z);
    this.applyView();
    const e = this.els.get(id) || this.pkgEls.get(id);
    if (e) { e.classList.remove('flash'); void e.offsetWidth; e.classList.add('flash'); }
  },
  snapV(v) { return Store.ui.snap ? Math.round(v / SNAP) * SNAP : Math.round(v); },

  /* ---------------------------------------------------------- Bildlaufleisten und Ankerpunkte (wie OneNote/Excel)
   * Der Bereich zum Scrollen ist das Rechteck um alle Objekte (seine Ecken = Ankerpunkte) plus etwas Rand;
   * schiebt man die Ansicht darüber hinaus, wächst der Bereich mit (freie Bewegung bleibt möglich). */
  contentRect() {
    const p = this.page;
    if (!p) return null;
    let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
    const add = (r) => { if (!r || !isFinite(r.x)) return; x1 = Math.min(x1, r.x); y1 = Math.min(y1, r.y); x2 = Math.max(x2, r.x + r.w); y2 = Math.max(y2, r.y + r.h); };
    for (const b of p.boxes) { if (isEmptyBox(p, b) && this.editing !== b.id) continue; add(this.rects.get(b.id) || { x: b.x, y: b.y, w: b.w, h: 40 }); }
    for (const k of p.pkgs) add(this.rects.get(k.id));
    for (const d of p.drawings) { const r = DG.bbox(d); add({ x: r.x - d.w / 2, y: r.y - d.w / 2, w: r.w + d.w, h: r.h + d.w }); }
    for (const pts of this.linkGeo.values()) for (const q of pts || []) add({ x: q.x, y: q.y, w: 0, h: 0 });
    return x1 === Infinity ? null : { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
  },
  scrollRange() {
    const z = this.view.z, W = this.vp.clientWidth, H = this.vp.clientHeight;
    const V = { x1: -this.view.x / z, y1: -this.view.y / z, x2: (W - this.view.x) / z, y2: (H - this.view.y) / z };
    const C = this.contentRect();
    if (!C) return { V, S: { ...V }, C: null };
    const E = { x1: C.x - 40 / z, y1: C.y - 30 / z, x2: C.x + C.w + W * 0.4 / z, y2: C.y + C.h + H * 0.4 / z };
    return { V, C, S: { x1: Math.min(E.x1, V.x1), y1: Math.min(E.y1, V.y1), x2: Math.max(E.x2, V.x2), y2: Math.max(E.y2, V.y2) } };
  },
  scrollSoon() {
    if (this._sraf) return;
    this._sraf = requestAnimationFrame(() => { this._sraf = null; this.updateScroll(); });
  },
  initScroll() {
    this.hs2 = $('#hscroll'); this.vs2 = $('#vscroll'); this.anc = $('#anchors');
    for (const [bar, axis] of [[this.hs2, 'x'], [this.vs2, 'y']]) {
      bar.addEventListener('pointerdown', (ev) => this.onScrollDown(ev, axis));
      bar.addEventListener('wheel', (ev) => { ev.preventDefault(); ev.stopPropagation(); const unit = ev.deltaMode === 1 ? 16 : ev.deltaMode === 2 ? 400 : 1; if (axis === 'x') this.view.x -= (ev.deltaY || ev.deltaX) * unit; else this.view.y -= ev.deltaY * unit; this.applyView(); this.flashAnchors(); }, { passive: false });
    }
    const corner = $('#scroll-corner');
    corner.addEventListener('pointerdown', (ev) => ev.stopPropagation());
    corner.addEventListener('click', () => this.goAnchor('tl'));
    corner.addEventListener('dblclick', () => this.fit());
    window.addEventListener('resize', () => this.scrollSoon());
  },
  updateScroll() {
    if (!this.hs2) return;
    const show = !!this.page && Store.ui.scrollbars !== false;
    const r = show ? this.scrollRange() : null;
    const needX = show && r.C && r.S.x2 - r.S.x1 > r.V.x2 - r.V.x1 + 1;
    const needY = show && r.C && r.S.y2 - r.S.y1 > r.V.y2 - r.V.y1 + 1;
    this.hs2.hidden = !needX; this.vs2.hidden = !needY;
    $('#scroll-corner').hidden = !(needX || needY);
    this.vp.classList.toggle('has-hs', !!needX); this.vp.classList.toggle('has-vs', !!needY);
    const place = (bar, a1, a2, s1, s2, horiz) => {
      const L = horiz ? bar.clientWidth : bar.clientHeight;
      const span = s2 - s1;
      const len = Math.max(28, L * (a2 - a1) / span);
      const pos = (a1 - s1) / (span - (a2 - a1) || 1) * (L - len);
      const th = bar.firstElementChild;
      if (horiz) { th.style.width = len + 'px'; th.style.left = clamp(pos, 0, L - len) + 'px'; }
      else { th.style.height = len + 'px'; th.style.top = clamp(pos, 0, L - len) + 'px'; }
    };
    if (needX) place(this.hs2, r.V.x1, r.V.x2, r.S.x1, r.S.x2, true);
    if (needY) place(this.vs2, r.V.y1, r.V.y2, r.S.y1, r.S.y2, false);
    this._scr = r;
    this.drawAnchors();
  },
  onScrollDown(ev, axis) {
    ev.stopPropagation(); ev.preventDefault();
    if (ev.button !== 0 || !this._scr) return;
    const bar = axis === 'x' ? this.hs2 : this.vs2, th = bar.firstElementChild;
    const r = this._scr, z = this.view.z;
    const L = axis === 'x' ? bar.clientWidth : bar.clientHeight;
    const thLen = axis === 'x' ? th.offsetWidth : th.offsetHeight;
    const S = { ...r.S }, vlen = axis === 'x' ? r.V.x2 - r.V.x1 : r.V.y2 - r.V.y1;
    const span = (axis === 'x' ? S.x2 - S.x1 : S.y2 - S.y1) - vlen;
    if (ev.target === th) {
      this.drag = { type: 'scroll', axis, sx: ev.clientX, sy: ev.clientY, moved: true, v0: axis === 'x' ? this.view.x : this.view.y, S, span, L, thLen, vlen };
      this.scrollEl = bar; bar.classList.add('drag');
      try { bar.setPointerCapture(ev.pointerId); } catch (e) { /* */ }
      bar.onpointermove = (e2) => this.onScrollDrag(e2, this.drag);
      bar.onpointerup = bar.onpointercancel = (e2) => { bar.classList.remove('drag'); bar.onpointermove = bar.onpointerup = bar.onpointercancel = null; try { bar.releasePointerCapture(e2.pointerId); } catch (e) { /* */ } this.drag = null; this.scrollSoon(); };
      return;
    }
    // Klick neben den Schieber: eine Bildschirmseite weiter
    const thr = th.getBoundingClientRect();
    const before = axis === 'x' ? ev.clientX < thr.left : ev.clientY < thr.top;
    const page = vlen * 0.9 * z * (before ? 1 : -1);
    if (axis === 'x') this.view.x += page; else this.view.y += page;
    this.applyView();
    this.flashAnchors();
  },
  onScrollDrag(ev, d) {
    if (!d || d.type !== 'scroll') return;
    const z = this.view.z;
    const dp = (d.axis === 'x' ? ev.clientX - d.sx : ev.clientY - d.sy);
    const dw = dp / Math.max(1, d.L - d.thLen) * d.span;
    const lo = d.axis === 'x' ? d.S.x1 : d.S.y1;
    let w0 = -d.v0 / z + dw;
    w0 = clamp(w0, lo, lo + d.span);
    if (d.axis === 'x') this.view.x = -w0 * z; else this.view.y = -w0 * z;
    this.applyView();
    this.flashAnchors();
  },
  /* Ecken des Rechtecks um alle Objekte (Ankerpunkte) kurz einblenden */
  flashAnchors() {
    if (!this.anc) return;
    this.anc.classList.add('on');
    clearTimeout(this._ancT);
    this._ancT = setTimeout(() => this.anc.classList.remove('on'), 1100);
  },
  drawAnchors() {
    const svg = this.anc;
    if (!svg) return;
    const r = this._scr;
    const C = r && r.C;
    svg.classList.toggle('always', !!Store.ui.showAnchors);
    if (!C || !this.page) { svg.innerHTML = ''; return; }
    const z = this.view.z, X = (x) => x * z + this.view.x, Y = (y) => y * z + this.view.y;
    const x1 = X(C.x) - 6, y1 = Y(C.y) - 6, x2 = X(C.x + C.w) + 6, y2 = Y(C.y + C.h) + 6, a = 14;
    const L = (x, y, dx, dy) => `<path d="M${(x + dx * a).toFixed(1)},${y.toFixed(1)}H${x.toFixed(1)}V${(y + dy * a).toFixed(1)}"/><circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="2.6"/>`;
    svg.innerHTML = L(x1, y1, 1, 1) + L(x2, y1, -1, 1) + L(x1, y2, 1, -1) + L(x2, y2, -1, -1) +
      `<rect x="${x1.toFixed(1)}" y="${y1.toFixed(1)}" width="${(x2 - x1).toFixed(1)}" height="${(y2 - y1).toFixed(1)}" class="anc-r"/>`;
  },
  /* zu einem Ankerpunkt springen: tl = oben links (Strg+Pos1), br = unten rechts (Strg+Ende) */
  goAnchor(which) {
    const C = this.contentRect();
    if (!C) { this.view.x = 40; this.view.y = 30; this.applyView(); return; }
    const z = this.view.z, W = this.vp.clientWidth, H = this.vp.clientHeight;
    if (which === 'br') { this.view.x = Math.min(40 - C.x * z, W - 40 - (C.x + C.w) * z); this.view.y = Math.min(30 - C.y * z, H - 40 - (C.y + C.h) * z); }
    else { this.view.x = 40 - C.x * z; this.view.y = 30 - C.y * z; }
    this.applyView();
    this.flashAnchors();
  },

  /* ---------------------------------------------------------- Auswahl */
  select(ids, additive = false) {
    if (!additive) { this.sel.clear(); Draw.clearSel(true); }
    for (const id of ids) this.sel.add(id);
    this.selLink = null;
    this.selImg = null;
    this.refreshSel();
  },
  toggleSel(id) {
    if (this.sel.has(id)) this.sel.delete(id); else this.sel.add(id);
    this.selLink = null; this.selImg = null;
    this.refreshSel();
  },
  clearSel() {
    Draw.clearSel();
    this.sel.clear(); this.selLink = null;
    const hadImg = this.selImg; this.selImg = null;
    if (hadImg) this.render(); else this.refreshSel();
  },
  refreshSel() {
    if (typeof Plugins !== 'undefined' && Plugins.has('selectionChange')) { const k = [...this.sel].join(); if (k !== this._selKey) { this._selKey = k; Plugins.emit('selectionChange', { ids: [...this.sel], page: this.pageId }); } }
    if (typeof Sheet !== 'undefined') Sheet.syncActive();
    for (const [id, e] of this.els) e.classList.toggle('sel', this.sel.has(id));
    for (const [id, e] of this.pkgEls) e.classList.toggle('sel', this.sel.has(id));
    this.renderLinks();
    this.updateStatus();
    Ribbon.refreshSoon();
  },
  selectedBoxes() {
    const out = new Map();
    for (const id of this.sel) {
      const b = this.box(id);
      if (b) out.set(b.id, b);
      else if (this.pkg(id)) for (const m of this.members(id)) out.set(m.id, m);
    }
    return [...out.values()];
  },
  selectedNodes() { // oberste Ebene: Pakete und freie Textfelder
    const out = new Set();
    for (const id of this.sel) { const n = this.nodeOf(id); if (n) out.add(n); }
    return [...out];
  },
  hasSelection() { return this.sel.size > 0 || !!this.selLink || !!this.selImg || Draw.sel.size > 0; },

  /* ---------------------------------------------------------- Textbearbeitung */
  onFocus(e) {
    const t = e.target.closest && e.target.closest('.box-text');
    if (!t || this.bulk) return;
    const id = t.closest('.box').dataset.id;
    if (this.editing && this.editing !== id) this.endEdit(this.editing);
    this.editing = id;
    this.els.get(id)?.classList.add('editing');
    if (!(this.sel.size === 1 && this.sel.has(id))) { this.sel = new Set([id]); this.selLink = null; this.selImg = null; this.refreshSel(); }
    try { document.execCommand('styleWithCSS', false, true); } catch (err) { /* */ }
    Ribbon.refreshSoon();
  },
  onBlur(e) {
    const t = e.target.closest && e.target.closest('.box-text');
    if (!t || this.bulk) return;
    const rt = e.relatedTarget;
    if (rt && rt.closest && rt.closest('#ribbon, .popup, .dlg-back, #findpanel')) return;
    this.endEdit(t.closest('.box').dataset.id);
  },
  endEdit(id) {
    this.els.get(id)?.classList.remove('editing');
    if (this.editing === id) this.editing = null;
    Hist.flushPending();
    const b = this.box(id);
    if (b && isEmptyBox(this.page, b)) this.removeBoxEl(id);
    Ribbon.refreshSoon();
  },
  stopEditing() {
    if (!this.editing) return;
    const id = this.editing;
    const t = this.textEl(id);
    if (t && document.activeElement === t) t.blur();
    if (this.editing === id) this.endEdit(id);
  },
  removeBoxEl(id) {
    const p = this.page;
    p.boxes = p.boxes.filter(b => b.id !== id);
    const e = this.els.get(id);
    if (e) { this.ro.unobserve(e); e.remove(); this.els.delete(id); }
    this.sel.delete(id);
    this.layout();
  },
  onInput(e) {
    const t = e.target.closest && e.target.closest('.box-text');
    if (!t) return;
    const id = t.closest('.box').dataset.id;
    const b = this.box(id);
    if (!b) return;
    b.html = boxHtml(t);
    this.els.get(id)._html = b.html;
    this.applyInk(b, this.els.get(id));
    Hist.pendingLabel = 'Text bearbeiten';
    Hist.touchPage(this.pageId);
    Hist.commitSoon();
    this.layoutSoon();
  },
  /* nach execCommand-Befehlen: HTML ins Datenmodell übernehmen */
  syncEditing() {
    if (!this.editing) return;
    const b = this.box(this.editing), t = this.textEl(this.editing);
    if (!b || !t) return;
    b.html = boxHtml(t);
    this.els.get(b.id)._html = b.html;
    this.applyInk(b, this.els.get(b.id));
    Hist.touchPage(this.pageId);
    this.layoutSoon();
  },
  onSelChange() {
    const s = getSelection();
    if (!s.rangeCount) return;
    const n = s.anchorNode;
    const elx = n && (n.nodeType === 1 ? n : n.parentElement);
    const t = elx && elx.closest && elx.closest('.box-text');
    if (t && !this.bulk) {
      this.lastRange = s.getRangeAt(0).cloneRange();
      this.lastRangeBox = t.closest('.box').dataset.id;
      Ribbon.refreshSoon();
    }
  },
  restoreRange() {
    if (!this.editing) return false;
    const t = this.textEl(this.editing);
    if (!t) return false;
    if (document.activeElement !== t) { this.bulk = true; t.focus({ preventScroll: true }); this.bulk = false; }
    const r = this.lastRange;
    if (r && this.lastRangeBox === this.editing && t.contains(r.startContainer)) {
      const s = getSelection();
      s.removeAllRanges();
      s.addRange(r);
    }
    return true;
  },
  /* Befehl auf den gesamten Text mehrerer ausgewählter Felder anwenden */
  bulkEdit(boxes, fn) {
    this.bulk = true;
    try {
      for (const b of boxes) {
        if (this.isLocked(b)) continue;
        const t = this.textEl(b.id);
        if (!t) continue;
        t.focus({ preventScroll: true });
        const r = document.createRange();
        r.selectNodeContents(t);
        const s = getSelection();
        s.removeAllRanges(); s.addRange(r);
        fn(t);
        b.html = boxHtml(t);
        this.els.get(b.id)._html = b.html;
        this.applyInk(b, this.els.get(b.id));
        t.blur();
      }
      getSelection().removeAllRanges();
    } finally { this.bulk = false; }
    Hist.touchPage(this.pageId);
    this.layoutSoon();
  },
  focusText(id, atEnd = true) {
    const t = this.textEl(id);
    if (!t) return;
    t.focus({ preventScroll: true });
    const r = document.createRange();
    r.selectNodeContents(t);
    r.collapse(!atEnd);
    const s = getSelection();
    s.removeAllRanges(); s.addRange(r);
  },
  onTextKey(e) {
    const t = e.target.closest && e.target.closest('.box-text');
    if (!t) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      const id = t.closest('.box').dataset.id;
      t.blur();
      if (this.box(id)) this.select([id]);
      return;
    }
    if (e.key === 'Tab') {
      e.preventDefault();
      const s = getSelection();
      const inList = s.anchorNode && (s.anchorNode.nodeType === 1 ? s.anchorNode : s.anchorNode.parentElement).closest('li');
      if (inList) document.execCommand(e.shiftKey ? 'outdent' : 'indent');
      else if (!e.shiftKey) document.execCommand('insertText', false, ' ');
    }
  },
  onClick(e) {
    if (Draw.tool !== 'select') return;
    if (Chart.onClick(e)) return;
    // Checkliste abhaken
    const li = e.target.closest && e.target.closest('.box-text ul.checklist > li');
    if (li) {
      const r = li.getBoundingClientRect();
      if (e.clientX - r.left < 20 * this.view.z) {
        const box = li.closest('.box');
        const b = this.box(box.dataset.id);
        if (b && !this.isLocked(b)) {
          li.classList.toggle('done');
          b.html = boxHtml(li.closest('.box-text'));
          this.els.get(b.id)._html = b.html;
          Hist.touchPage(this.pageId);
          Hist.commit(li.classList.contains('done') ? 'Aufgabe erledigt' : 'Aufgabe offen');
        }
      }
    }
    // Anhang herunterladen
    const att = e.target.closest && e.target.closest('.box-text .kt-file');
    if (att) { e.preventDefault(); downloadAttachment(att.dataset.ktFile, att.dataset.name || att.textContent.replace(/^\W+/, '').trim()); return; }
    // Video im Text
    const vid = e.target.closest && e.target.closest('.box-text .kt-video');
    if (vid) { e.preventDefault(); Video.play(vid.dataset.video, vid.dataset.title); return; }
    // Links öffnen sich mit einfachem Klick (wie in OneNote); Strg+Klick setzt nur den Cursor
    const a = e.target.closest && e.target.closest('.box-text a[href]');
    if (a && !e.altKey && !e.ctrlKey && !e.metaKey) {
      const s = getSelection();
      if (s && !s.isCollapsed && a.contains(s.anchorNode)) return; // Text im Link wird markiert
      e.preventDefault();
      const href = a.getAttribute('href');
      if (href.startsWith('#')) { if (typeof OfficeWI !== 'undefined') OfficeWI.jump(decodeURIComponent(href.slice(1))); return; }   // Verweis im Word-Dokument (1.74)
      Backend.openLink(href);
    }
  },

  /* ---------------------------------------------------------- Maus */
  onDown(ev) {
    let t = ev.target;
    // Finger: der Browser „rückt“ das Ziel gern auf den (bearbeitbaren) Text daneben – Griffe am genauen Punkt haben Vorrang
    if (ev.pointerType === 'touch') {
      const p = document.elementFromPoint(ev.clientX, ev.clientY);
      if (p && p !== t && p.closest && p.closest('.box-bar, .pkg-head, .box-rs, .sock, .link-handle, .fimg-rs')) t = p;
    }
    const menuWasOpen = UI._justClosed;
    this.mouse = { x: ev.clientX, y: ev.clientY };
    if (t.closest('#empty-state .btn')) return;
    if (!this.page) return;
    // „Verbinden mit …“ (Kontextmenü): nächstes angetipptes Feld/Paket ist das Ziel
    if (this.connectPick) { this.finishConnectPick(ev); return; }
    if (Draw.onDown(ev)) return;
    if (typeof OfficeWord !== 'undefined' && OfficeWord.down(ev, t)) return;   // Word: Klick aufs Blatt = Schreibmarke (1.67)
    if (typeof OfficeSlides !== 'undefined' && OfficeSlides.down(ev, t)) return;   // PowerPoint: Textfeld aufziehen (1.67)
    const touch = ev.pointerType === 'touch';
    if (touch) this.startLongPress(ev);
    const boxEl = t.closest('.box'), pkgEl = t.closest('.pkg');
    const linkId = t.closest('[data-link]')?.dataset.link || null;
    const boxId = boxEl ? boxEl.dataset.id : null;
    const node = boxId ? this.nodeOf(boxId) : pkgEl ? pkgEl.dataset.id : null;
    const base = { sx: ev.clientX, sy: ev.clientY, moved: false, pid: ev.pointerId };

    // mittlere Maustaste oder Leertaste: verschieben
    if (ev.button === 1 || (ev.button === 0 && this.spaceDown)) {
      ev.preventDefault();
      this.drag = { ...base, type: 'pan', vx: this.view.x, vy: this.view.y };
      this.capture(ev); this.vp.classList.add('panning');
      return;
    }
    // Hintergrund (wie OneNote „Bild als Hintergrund festlegen“): solange es nicht ausgewählt ist, verhält es sich
    // wie die freie Fläche – ziehen = Auswahlrahmen (Finger: Seite verschieben), einfach klicken = nur dieses Objekt auswählen
    const bgB = boxId && ev.button === 0 && !ev.altKey ? this.box(boxId) : null;
    if (bgB && bgB.bg && !this.sel.has(bgB.id)) {
      const bgd = Draw.hitBg(this.toWorld(ev.clientX, ev.clientY));   // eine Hintergrund-Zeichnung liegt über dem Hintergrund-Bild
      this.bgDown(ev, base, bgd ? { kind: 'd', id: bgd.id } : { kind: 'b', id: bgB.id }, touch);
      return;
    }
    if (!(Fmt.painter && Fmt.painter.kind === 'box') && (Sheet.onDown(ev) || Chart.onDown(ev))) return;
    if (ev.button === 2) {
      if (ev.shiftKey && t.closest('.box-text')) return; // Browser-Kontextmenü (z.B. Rechtschreibung)
      ev.preventDefault();
      if (ev.ctrlKey) {
        this.drag = { ...base, type: 'knife', pts: [this.toWorld(ev.clientX, ev.clientY)] };
        this.capture(ev); this.vp.classList.add('knife');
        return;
      }
      this.drag = { ...base, type: 'rdown', node, boxId, linkId: t.closest('.link-handle') ? null : linkId, imgId: t.closest('.fimg')?.dataset.img || null, fileSrc: t.closest('.kt-file')?.dataset.ktFile || null, fileName: t.closest('.kt-file')?.dataset.name || null, inText: !!t.closest('.box-text'), vx: this.view.x, vy: this.view.y, wpt: this.toWorld(ev.clientX, ev.clientY) };
      this.capture(ev);
      return;
    }
    if (ev.button !== 0) return;
    if (Fmt.painter && Fmt.painter.kind === 'box' && boxId) { ev.preventDefault(); Fmt.applyBoxPainter(boxId); return; }
    if (Fmt.painter && t.closest('.box-text')) return;

    if (t.closest('.sock') && node) {
      ev.preventDefault();
      this.stopEditing();
      this.drag = { ...base, type: 'connect', from: node, moved: true };
      this.capture(ev); this.vp.classList.add('connecting'); document.body.classList.add('connecting-now');
      return;
    }
    const handle = t.closest('.link-handle');
    if (handle) {
      ev.preventDefault();
      this.stopEditing();
      const l = this.page.links.find(x => x.id === handle.dataset.link);
      if (!l) return;
      if (handle.dataset.h === 'm') this.startBend(ev, l);
      else { this.drag = { ...base, type: 'linkEnd', l, end: handle.dataset.h }; this.capture(ev); }
      return;
    }
    if (linkId) {
      ev.preventDefault();
      this.stopEditing();
      if (this.selLink !== linkId || this.sel.size || this.selImg) {
        this.sel.clear(); this.selImg = null; this.selLink = linkId;
        this.refreshSel(); this.render();
      }
      const l = this.page.links.find(x => x.id === linkId);
      if (l) this.startBend(ev, l);
      return;
    }
    const imgEl = t.closest('.fimg');
    if (imgEl && boxId) {
      ev.preventDefault();
      const b = this.box(boxId);
      const im = b.images.find(i => i.id === imgEl.dataset.img);
      if (!im) return;
      if (t.closest('.fimg-play')) { Video.play(im.video, im.title); return; }
      if (this.editing && this.editing !== boxId) this.stopEditing();
      // Feld nur mit einem Bild (z.B. aus OneNote): das Bild ist das Objekt -> ganzes Feld verschieben
      if (this.isPictureBox(b) && !t.closest('.fimg-rs')) {
        if (ev.shiftKey || ev.ctrlKey) { this.toggleSel(boxId); this.selImg = null; this.startMove(ev, [...this.sel]); return; }
        if (!this.sel.has(boxId) || this.sel.size !== 1) this.select([boxId]);
        this.selImg = { box: boxId, img: im.id };
        this.refreshSel(); this.render();
        this.startMove(ev, [...this.sel]);
        return;
      }
      this.sel = new Set([boxId]); this.selLink = null;
      this.selImg = { box: boxId, img: im.id };
      this.refreshSel(); this.render();
      if (this.isLocked(b)) return;
      const r = imgEl.getBoundingClientRect();
      this.drag = { ...base, type: 'img', mode: t.closest('.fimg-rs') ? 'size' : 'move', b, im, x: clamp(im.x, 0, Math.max(0, this.contentW(b) - Math.min(im.w, this.contentW(b)))), y: im.y, w: r.width / this.view.z, h: r.height / this.view.z };
      this.capture(ev);
      return;
    }
    if (pkgEl && !boxEl) {
      const pid = pkgEl.dataset.id;
      if (t.closest('.pkg-head')) {
        ev.preventDefault();
        this.stopEditing();
        if (ev.shiftKey || ev.ctrlKey) this.toggleSel(pid);
        else if (!this.sel.has(pid)) this.select([pid]);
        this.startMove(ev, [...this.sel]);
        return;
      }
      // Klick in die Paketfläche: wie leere Fläche (neues Textfeld), damit man Pakete erweitern kann
    }
    if (boxEl) {
      const b = this.box(boxId);
      if (t.closest('.box-rs')) {
        ev.preventDefault();
        this.stopEditing();
        if (!this.isLocked(b)) { this.drag = { ...base, type: 'resize', b, w: b.w }; this.capture(ev); }
        return;
      }
      const inText = t.closest('.box-text');
      const onInlineImg = inText && t.closest('.box-text img[data-kt-src], .box-text .kt-video') && this.editing !== boxId;
      if (!inText || onInlineImg || ev.altKey || this.isLocked(b)) {
        ev.preventDefault();
        if (this.editing) this.stopEditing();
        if (ev.shiftKey || ev.ctrlKey) this.toggleSel(boxId);
        else if (!this.sel.has(boxId)) this.select([boxId]);
        else if (this.selImg) { this.selImg = null; this.render(); }
        this.startMove(ev, [...this.sel]);
        return;
      }
      // Klick in Text: normale Textbearbeitung. Mit dem Finger: ziehen = Seite verschieben, tippen = bearbeiten
      if (touch && this.editing !== boxId) this.drag = { ...base, type: 'tpan', vx: this.view.x, vy: this.view.y, touch: true };
      return;
    }
    // leere Fläche
    ev.preventDefault();
    const wasEditing = !!this.editing || document.activeElement === $('#page-title');
    this.stopEditing();
    if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
    this.vp.focus({ preventScroll: true });
    const inPkg = pkgEl && !boxEl ? pkgEl.dataset.id : null;
    this.drag = { ...base, type: 'empty', inPkg, shift: ev.shiftKey || ev.ctrlKey, noCreate: menuWasOpen || ev.shiftKey || ev.ctrlKey || (typeof OfficeWord !== 'undefined' && !!OfficeWord.on()), wasEditing, hadSel: this.hasSelection(), touch, vx: this.view.x, vy: this.view.y };
    this.capture(ev);
  },
  bgDown(ev, base, obj, touch) {
    ev.preventDefault();
    const wasEditing = !!this.editing || document.activeElement === $('#page-title');
    this.stopEditing();
    if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
    this.vp.focus({ preventScroll: true });
    this.drag = { ...base, type: 'empty', inPkg: null, shift: ev.shiftKey || ev.ctrlKey, noCreate: true, bgPick: obj, wasEditing, hadSel: this.hasSelection(), touch, vx: this.view.x, vy: this.view.y };
    this.capture(ev);
  },
  /* ---------------------------------------------------------- Finger (seit 1.10)
   * Ein Finger auf der Fläche oder auf Text: Seite verschieben; zwei Finger: zoomen und verschieben (Draw.touchDown);
   * langes Drücken (½ s still halten) = Kontextmenü wie Rechtsklick; tippen = Textfeld / bearbeiten. */
  startLongPress(ev) {
    this.cancelLongPress();
    const t = ev.target, boxEl = t.closest && t.closest('.box');
    if (boxEl && this.editing === boxEl.dataset.id && t.closest('.box-text') && !t.closest('.kt-file, .kt-video, .kt-math')) return;   // im bearbeiteten Text wählt langes Drücken Wörter aus (aber Anhang/Video/Formel haben ein Menü)
    if (t.closest && t.closest('.xl-grid, .xl-kb, .sock, .link-handle, .kt-scroll')) return;
    this._lpInfo = { sx: ev.clientX, sy: ev.clientY, pid: ev.pointerId };
    this._lp = setTimeout(() => this.fireLongPress(), 520);
  },
  cancelLongPress() { clearTimeout(this._lp); this._lp = null; this._lpInfo = null; },
  fireLongPress() {
    const info = this._lpInfo;
    this._lp = null; this._lpInfo = null;
    if (!info || !this.page || (Draw.touches && Draw.touches.size > 1)) return;
    if (this.drag && this.drag.moved) return;
    const t = document.elementFromPoint(info.sx, info.sy);
    if (!t || !this.vp.contains(t)) return;
    const boxEl = t.closest('.box'), pkgEl = t.closest('.pkg');
    const boxId = boxEl ? boxEl.dataset.id : null;
    const node = boxId ? this.nodeOf(boxId) : pkgEl ? pkgEl.dataset.id : null;
    const d = { node, boxId, linkId: t.closest('.link-handle') ? null : (t.closest('[data-link]')?.dataset.link || null), imgId: t.closest('.fimg')?.dataset.img || null, fileSrc: t.closest('.kt-file')?.dataset.ktFile || null, fileName: t.closest('.kt-file')?.dataset.name || null, inText: !!t.closest('.box-text'), wpt: this.toWorld(info.sx, info.sy) };
    // laufende Aktion abbrechen, das folgende Loslassen/Antippen schlucken
    this.drag = null;
    if (Draw.drag && Draw.drag.pid === info.pid) Draw.drag = null;
    $('#marquee').hidden = true;
    this.vp.classList.remove('panning');
    this._lpFired = info.pid;
    addEventListener('touchend', (e) => { if (e.cancelable) e.preventDefault(); }, { once: true, capture: true, passive: false });
    if (navigator.vibrate) try { navigator.vibrate(12); } catch (e) { /* */ }
    const ev = { clientX: info.sx, clientY: info.sy };
    if ((!d.node || (d.boxId && this.box(d.boxId) && this.box(d.boxId).bg)) && !d.linkId) {
      const hit = Draw.hitAt(d.wpt, true, false, true);
      if (hit) { if (!Draw.sel.has(hit.id)) { this.sel.clear(); this.selLink = null; this.refreshSel(); Draw.select([hit.id]); } Draw.contextMenu(info.sx, info.sy); return; }
    }
    this.contextMenu(ev, d);
  },
  /* Verbinden ohne Rechtsklick: Ziel antippen */
  startConnectPick(from) {
    this.connectPick = from;
    this.vp.classList.add('connecting');
    UI.toast('Verbinden: jetzt das Ziel antippen (Feld oder Paket) · daneben = abbrechen', 4000);
  },
  finishConnectPick(ev) {
    ev.preventDefault();
    const from = this.connectPick;
    this.connectPick = null;
    this.vp.classList.remove('connecting');
    const t = document.elementFromPoint(ev.clientX, ev.clientY) || ev.target;
    const boxEl = t.closest && t.closest('.box'), pkgEl = t.closest && t.closest('.pkg');
    const target = boxEl ? this.nodeOf(boxEl.dataset.id) : pkgEl ? pkgEl.dataset.id : null;
    if (target && target !== from) { this.addLink(from, target, {}); UI.toast('Verbunden', 1200); }
    else UI.toast('Verbinden abgebrochen', 1600);
  },
  capture(ev) { try { this.vp.setPointerCapture(ev.pointerId); } catch (e) { /* */ } },
  startBend(ev, l) {
    const info = this.linkInfo.get(l.id);
    const off = info && info.M ? { x: info.M.x - info.mid0.x, y: info.M.y - info.mid0.y } : { x: 0, y: 0 };
    this.drag = { sx: ev.clientX, sy: ev.clientY, moved: false, type: 'linkBend', l, off };
    this.capture(ev);
  },

  startMove(ev, ids) {
    const boxes = new Map();
    for (const id of ids) {
      const k = this.pkg(id);
      if (k) { if (!k.locked) for (const m of this.members(id)) if (!m.locked) boxes.set(m.id, m); }
      else { const b = this.box(id); if (b && !this.isLocked(b) && !(typeof OfficeGrid !== 'undefined' && OfficeGrid.isFixed(b))) boxes.set(b.id, b); }
    }
    this.drag = { sx: ev.clientX, sy: ev.clientY, moved: false, type: 'move', items: [...boxes.values()].map(b => ({ b, x: b.x, y: b.y })) };
    this.capture(ev);
  },

  onMove(ev) {
    this.mouse = { x: ev.clientX, y: ev.clientY };
    if (this._lpInfo && this._lpInfo.pid === ev.pointerId && Math.hypot(ev.clientX - this._lpInfo.sx, ev.clientY - this._lpInfo.sy) > 9) this.cancelLongPress();
    if (Draw.onMove(ev)) return;
    const d = this.drag;
    if (!d) { Chart.hover(ev); return; }
    if (d.type === 'sheet') { Sheet.onDragMove(ev, d); return; }
    if (d.type === 'chart') { Chart.onDragMove(ev, d); return; }
    if (d.type === 'scroll') { this.onScrollDrag(ev, d); return; }
    const dxs = ev.clientX - d.sx, dys = ev.clientY - d.sy;
    if (!d.moved) {
      if (Math.hypot(dxs, dys) < (ev.pointerType === 'touch' ? 9 : 4)) return;
      d.moved = true;
      this.cancelLongPress();
      // Finger auf leerer Fläche oder Text: Seite verschieben statt Auswahlrahmen
      if ((d.type === 'empty' && d.touch) || d.type === 'tpan') { d.type = 'pan'; this.vp.classList.add('panning'); if (!d.vx && d.vx !== 0) { d.vx = this.view.x; d.vy = this.view.y; } }
      if (d.type === 'rdown') {
        if (d.node) {
          d.type = 'connect'; d.from = d.node;
          const r0 = this.rects.get(d.node);
          if (r0 && distToBorder(r0, d.wpt) <= 16 / this.view.z) d.fromAnchor = nearestAnchor(r0, d.wpt);
          this.stopEditing(); this.vp.classList.add('connecting'); document.body.classList.add('connecting-now');
        }
        else { d.type = 'pan'; this.vp.classList.add('panning'); }
      }
    }
    const z = this.view.z, dx = dxs / z, dy = dys / z;
    switch (d.type) {
      case 'pan':
        this.view.x = d.vx + dxs; this.view.y = d.vy + dys;
        this.applyView();
        this.flashAnchors();
        break;
      case 'empty': {
        const r = this.vp.getBoundingClientRect(), m = $('#marquee');
        m.hidden = false;
        Object.assign(m.style, {
          left: (Math.min(d.sx, ev.clientX) - r.left) + 'px', top: (Math.min(d.sy, ev.clientY) - r.top) + 'px',
          width: Math.abs(dxs) + 'px', height: Math.abs(dys) + 'px',
        });
        break;
      }
      case 'move': {
        if (!d.items.length) break;
        const f = d.items[0];
        const ox = this.snapV(f.x + dx) - f.x, oy = this.snapV(f.y + dy) - f.y;
        for (const it of d.items) {
          it.b.x = it.x + ox; it.b.y = it.y + oy;
          const e = this.els.get(it.b.id);
          if (e) { e.style.left = it.b.x + 'px'; e.style.top = it.b.y + 'px'; }
        }
        this.layout();
        break;
      }
      case 'resize':
        d.b.w = Math.max(80, this.snapV(d.w + dx));
        this.updateBox(d.b, this.els.get(d.b.id));
        this.layout();
        break;
      case 'img': {
        const cw = this.contentW(d.b);
        if (d.mode === 'move') {
          d.im.x = Math.round(clamp(d.x + dx, 0, Math.max(0, cw - Math.min(d.im.w, cw))));
          d.im.y = Math.round(Math.max(0, d.y + dy));
        } else {
          const solo = this.isPictureBox(d.b);
          const nw = solo ? Math.max(24, d.w + dx) : clamp(d.w + dx, 24, cw);
          d.im.w = Math.round(nw);
          d.im.h = Math.round(d.h * nw / d.w);
          if (solo) d.b.w = d.im.w + 2 * (PADX + BORDER);
        }
        this.updateBox(d.b, this.els.get(d.b.id));
        this.layout();
        break;
      }
      case 'connect': {
        const ra = this.rects.get(d.from);
        if (!ra) break;
        const w = this.toWorld(ev.clientX, ev.clientY);
        const sa = d.fromAnchor ? d.fromAnchor.side : pickSides(ra, { x: w.x - 1, y: w.y - 1, w: 2, h: 2 })[0];
        const p1 = d.fromAnchor ? anchorPoint(ra, sa, d.fromAnchor.t) : sidePoint(ra, sa, 0.5), n1 = NORM[sa];
        const dd = clamp(Math.hypot(w.x - p1.x, w.y - p1.y) * 0.5, 30, 200);
        const c1 = { x: p1.x + n1.x * dd, y: p1.y + n1.y * dd };
        this.ov.innerHTML = `<path class="tmp-link" d="M${f1(p1.x)},${f1(p1.y)}C${f1(c1.x)},${f1(c1.y)} ${f1(w.x)},${f1(w.y)} ${f1(w.x)},${f1(w.y)}"/><circle cx="${f1(p1.x)}" cy="${f1(p1.y)}" r="5" fill="var(--accent)"/>`;
        const tn = this.nodeAtPoint(ev.clientX, ev.clientY);
        const target = tn && tn !== d.from ? tn : null;
        if (target !== this.connTarget) {
          this.markConnTarget(target);
        }
        break;
      }
      case 'linkBend':
        d.l.bend = { x: Math.round(d.off.x + dx), y: Math.round(d.off.y + dy) };
        this.renderLinks();
        break;
      case 'linkEnd': {
        const w = this.toWorld(ev.clientX, ev.clientY);
        const own = this.nodeOf(d.l[d.end]);
        const other = this.nodeOf(d.l[d.end === 'a' ? 'b' : 'a']);
        let target = this.nodeAtPoint(ev.clientX, ev.clientY);
        if (target === other) target = null;
        if (!target) { const r = this.rects.get(own); if (r && distToBorder(r, w) < 40 / z) target = own; }
        if (target) { const r = this.rects.get(target); this.linkDrag = { id: d.l.id, end: d.end, rect: r, node: target, anchor: nearestAnchor(r, w) }; }
        else this.linkDrag = { id: d.l.id, end: d.end, pt: w };
        this.markConnTarget(target && target !== own ? target : null);
        this.renderLinks();
        break;
      }
      case 'knife': {
        const w = this.toWorld(ev.clientX, ev.clientY);
        const last = d.pts[d.pts.length - 1];
        if (Math.hypot(w.x - last.x, w.y - last.y) > 3 / z) d.pts.push(w);
        this.ov.innerHTML = `<polyline class="knife-line" points="${d.pts.map(p => f1(p.x) + ',' + f1(p.y)).join(' ')}"/>`;
        break;
      }
    }
  },
  nodeAtPoint(cx, cy) {
    const hit = document.elementFromPoint(cx, cy);
    if (!hit) return null;
    const b = hit.closest('.box');
    if (b && this.box(b.dataset.id)) return this.nodeOf(b.dataset.id);
    const k = hit.closest('.pkg');
    return k ? k.dataset.id : null;
  },
  markConnTarget(id) {
    $$('.conn-target').forEach(x => x.classList.remove('conn-target'));
    this.connTarget = id;
    if (!id) return;
    (this.pkgEls.get(id) || this.els.get(id))?.classList.add('conn-target');
  },

  onUp(ev, cancel) {
    this.cancelLongPress();
    const lp = this._lpFired === ev.pointerId;
    if (lp) this._lpFired = null;
    if (Draw.onUp(ev, cancel)) return;
    if (lp) { this.drag = null; return; }   // langes Drücken hat das Kontextmenü geöffnet
    const d = this.drag;
    if (!d) return;
    this.drag = null;
    try { this.vp.releasePointerCapture(ev.pointerId); } catch (e) { /* */ }
    this.vp.classList.remove('panning', 'connecting', 'knife');
    document.body.classList.remove('connecting-now');
    this.ov.innerHTML = '';
    $('#marquee').hidden = true;
    if (cancel) { this.markConnTarget(null); if (this.linkDrag) { this.linkDrag = null; this.renderLinks(); } if (d.type === 'sheet') Sheet.fillPrev = null; return; }
    // PowerPoint-Normalansicht: Folie mit dem Finger verschoben = wischen (vorige/nächste Folie bzw. zurück an ihren Platz, 1.68)
    if (d.type === 'pan' && d.touch && typeof OfficeSlides !== 'undefined' && OfficeSlides.swipe(ev.clientX - d.sx, ev.clientY - d.sy, false)) return;
    switch (d.type) {
      case 'sheet': Sheet.onDragUp(ev, d); break;
      case 'chart': Chart.onDragUp(ev, d); break;
      case 'scroll': this.scrollEl.classList.remove('drag'); break;
      case 'empty':
        if (d.moved) {
          const a = this.toWorld(d.sx, d.sy), b = this.toWorld(ev.clientX, ev.clientY);
          this.marqueeSelect({ x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y) }, d.shift);
        } else {
          // Klick auf ein Hintergrund-Objekt (Feld/Bild oder Zeichnung): nur dieses auswählen
          const bgd = !d.bgPick && Draw.hitBg(this.toWorld(ev.clientX, ev.clientY));
          const pick = d.bgPick || (bgd ? { kind: 'd', id: bgd.id } : null);
          if (pick) { this.pickObj(pick, d.shift); this.updateStatus(); break; }
          this.clearSel();
          // Finger: erstes Antippen nach Bearbeiten/Auswahl hebt nur auf (sonst entstünden leicht leere Felder)
          if (!d.noCreate && !(d.touch && (d.wasEditing || d.hadSel))) this.createBoxAt(this.toWorld(ev.clientX, ev.clientY), { pkg: d.inPkg && this.pkg(d.inPkg) && !this.pkg(d.inPkg).locked ? d.inPkg : null });
        }
        break;
      case 'move':
        if (d.moved) { Hist.touchPage(this.pageId); Hist.commit('Verschieben'); }
        break;
      case 'resize':
        if (d.moved) { Hist.touchPage(this.pageId); Hist.commit('Breite geändert'); }
        break;
      case 'img':
        if (d.moved) { Hist.touchPage(this.pageId); Hist.commit(d.mode === 'move' ? 'Bild verschoben' : 'Bildgrösse geändert'); }
        break;
      case 'connect': {
        const target = this.connTarget || this.nodeAtPoint(ev.clientX, ev.clientY);
        this.markConnTarget(null);
        if (target && target !== d.from) {
          const w = this.toWorld(ev.clientX, ev.clientY), rb = this.rects.get(target);
          const bAnchor = rb && distToBorder(rb, w) <= 16 / this.view.z ? nearestAnchor(rb, w) : null;
          this.addLink(d.from, target, { aAnchor: d.fromAnchor || null, bAnchor });
        }
        break;
      }
      case 'linkBend':
        if (d.moved) { Hist.touchPage(this.pageId); Hist.commit('Linie verschoben'); }
        break;
      case 'linkEnd': {
        const ld = this.linkDrag;
        this.linkDrag = null;
        this.markConnTarget(null);
        if (d.moved && ld && ld.node) {
          const l = d.l, own = this.nodeOf(l[d.end]);
          if (ld.node !== own) l[d.end] = ld.node;
          l[d.end + 'Anchor'] = ld.anchor;
          Hist.touchPage(this.pageId);
          Hist.commit(ld.node !== own ? 'Verbindung umgehängt' : 'Ansatzpunkt verschoben');
        } else if (d.moved) UI.toast('Das Ende muss auf einem Feld oder Paket abgelegt werden');
        this.renderLinks();
        break;
      }
      case 'knife':
        this.cutLinks(d.pts);
        break;
      case 'rdown': {
        const onBg = d.boxId && this.box(d.boxId) && this.box(d.boxId).bg;   // Zeichnungen liegen immer über dem Hintergrund
        if ((!d.node || onBg) && !d.linkId) {
          const hit = Draw.hitAt(d.wpt, true, false, true);
          if (hit) { if (!Draw.sel.has(hit.id)) { this.sel.clear(); this.selLink = null; this.refreshSel(); Draw.select([hit.id]); } Draw.contextMenu(ev.clientX, ev.clientY); break; }
          const sb = Draw.sel.size && Draw.selBox;
          if (sb && d.wpt.x >= sb.x && d.wpt.x <= sb.x + sb.w && d.wpt.y >= sb.y && d.wpt.y <= sb.y + sb.h) { Draw.contextMenu(ev.clientX, ev.clientY); break; }
        }
        this.contextMenu(ev, d);
        break;
      }
    }
  },

  marqueeSelect(r, additive) {
    const hit = (q) => q && q.x < r.x + r.w && q.x + q.w > r.x && q.y < r.y + r.h && q.y + q.h > r.y;
    const ids = [];
    for (const k of this.page.pkgs) if (hit(this.rects.get(k.id))) ids.push(k.id);
    for (const b of this.page.boxes) if (!b.pkg && hit(this.rects.get(b.id))) ids.push(b.id);   // seit 1.47 auch Hintergrund (auswählbar, nur nicht verschiebbar)
    this.select(ids, additive);
    Draw.selectInRect(r);
  },

  onWheel(ev) {
    ev.preventDefault();
    if (!this.page) return;
    if (typeof OfficeView !== 'undefined' && OfficeView.wheel(ev)) return;   // PowerPoint: Rad = nächste/vorige Folie (1.66)
    const unit = ev.deltaMode === 1 ? 16 : ev.deltaMode === 2 ? 400 : 1;
    if (ev.ctrlKey || ev.metaKey) {
      this.zoomAt(ev.clientX, ev.clientY, Math.exp(-ev.deltaY * unit * 0.0016));
      return;
    }
    if (ev.shiftKey && !ev.deltaX) this.view.x -= ev.deltaY * unit;
    else { this.view.x -= ev.deltaX * unit; this.view.y -= ev.deltaY * unit; }
    this.applyView();
    this.flashAnchors();
  },

  onDbl(ev) {
    if (Draw.tool !== 'select' || !this.page) return;
    // wegen Pointer-Capture zeigt ev.target evtl. auf die Fläche -> Element unter der Maus nehmen
    const t = document.elementFromPoint(ev.clientX, ev.clientY) || ev.target;
    if (typeof OfficeWord !== 'undefined' && OfficeWord.on() && !(t.closest && t.closest('.box-text'))) return;   // Word: kein neues Textfeld auf dem Blatt
    // Doppelklick auf ein Hintergrund-Bild (oder -Diagramm): Textfeld darauf schreiben – wie Klicken auf die freie Fläche
    const bgEl = t.closest && t.closest('.box.bg');
    if (bgEl && !t.closest('.box-bar, .box-rs, .sock, .fimg-rs, .fimg-play')) {
      const b = this.box(bgEl.dataset.id);
      if (b && (b.chart || this.isPictureBox(b) || isEmptyHtml(b.html))) {
        ev.preventDefault();
        this.clearSel();
        this.createBoxAt(this.toWorld(ev.clientX, ev.clientY));
        return;
      }
    }
    const handle = t.closest('.link-handle');
    if (handle) {
      const l = this.page.links.find(x => x.id === handle.dataset.link);
      if (!l) return;
      if (handle.dataset.h === 'm') delete l.bend; else delete l[handle.dataset.h + 'Anchor'];
      this.renderLinks();
      Hist.touchPage(this.pageId);
      Hist.commit(handle.dataset.h === 'm' ? 'Linie zurückgesetzt' : 'Ansatzpunkt automatisch');
      return;
    }
    const fx = t.closest('.box-text .kt-math');
    if (fx) {
      const fb = this.box(fx.closest('.box').dataset.id);
      if (fb && !this.isLocked(fb)) { ev.preventDefault(); Formula.open(fx); }
      return;
    }
    const linkId = t.closest('[data-link]')?.dataset.link;
    if (linkId) { this.editLinkLabel(linkId); return; }
    if (t.closest('.pkg-head')) { this.renamePkg(t.closest('.pkg').dataset.id); return; }
    const chEl = t.closest('.box.ch');
    if (chEl && !t.closest('.box-bar, .box-rs, .ch-rs, .sock')) { const cb = this.box(chEl.dataset.id); if (cb) { this.select([cb.id]); Chart.editDialog(cb); } return; }
    if (t.closest('.box.xl')) { const xb = t.closest('.box.xl'); if (t.closest('.box-bar') && !this.isLocked(this.box(xb.dataset.id))) Sheet.rename(xb.dataset.id); return; }
    const img = t.closest('.fimg');
    if (img && !t.closest('.fimg-rs')) {
      const b = this.box(img.closest('.box').dataset.id);
      const im = b && b.images.find(i => i.id === img.dataset.img);
      if (im && im.video) Video.play(im.video, im.title);
      else if (im && typeof Plugins !== 'undefined' && Plugins.handle('imageOpen', { box: b, image: im, locked: this.isLocked(b) })) { /* Add-In (z.B. Chem-Draw) */ }
      else if (im) Backend.imgURL(im.src).then(u => UI.lightbox(u));
    }
  },

  async onDrop(ev) {
    if (![...ev.dataTransfer.types].includes('Files')) return;
    ev.preventDefault();
    // alles über den gemeinsamen Import – er entscheidet selbst (OneNote, ZIP/RAR, Ordner, sonst auf die Seite).
    // Ordner-Einträge sofort holen: nach dem ersten await ist die Liste leer
    const dirs = [...(ev.dataTransfer.items || [])].map(it => it.webkitGetAsEntry && it.webkitGetAsEntry()).filter(en => en && en.isDirectory);
    const files = [...ev.dataTransfer.files];
    const boxEl = ev.target.closest && ev.target.closest('.box');
    const opts = { pt: this.toWorld(ev.clientX, ev.clientY), box: boxEl ? boxEl.dataset.id : null };
    const list = dirs.length ? [...await readDropDirs(dirs), ...files.filter(f => f.size || f.type).map(f => ({ file: f, path: f.name }))] : files;
    await OneImport.auto(list, opts);
  },
  /* Bilder, CSV und andere Dateien auf die aktuelle Seite (Bild / Tabelle / 📎-Anhang) */
  async insertFiles(list, pt, boxId) {
    if (!list.length) return;
    if (!this.page) { UI.toast('Bitte zuerst eine Seite öffnen'); return; }
    pt = pt || this.viewCenter();
    let target = boxId ? this.box(boxId) : null;
    if (target && (this.isLocked(target) || target.sheet || target.chart)) target = null;
    let off = 0;
    const csv = list.filter(f => /\.(csv|tsv)$/i.test(f.name) || f.type === 'text/csv');
    for (const f of csv) { await Sheet.importCsv(f, { x: pt.x + off, y: pt.y + off }); off += 30; }
    const imgs = list.filter(f => !csv.includes(f) && ((f.type || '').startsWith('image/') || /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(f.name)));
    for (const f of imgs) { await this.insertImage(target ? target.id : null, f, { x: pt.x + off, y: pt.y + off }); off += 24; }
    // alles andere (PDF, Word, …) als Anhang – Rechtsklick darauf: Seiten als Bilder aufklappen
    for (const f of list.filter(f => !csv.includes(f) && !imgs.includes(f))) { await this.attachFile(f, { x: pt.x + off, y: pt.y + off }, target ? target.id : null); off += 20; }
  },

  /* Datei anhängen (📎) – wie in OneNote; Rechtsklick auf den Anhang klappt die Seiten als Bilder auf */
  async attachFile(file, worldPt, boxId) {
    if (!this.page) return null;
    let src;
    try { src = await Backend.saveFile(file, (file.name.split('.').pop() || 'bin')); }
    catch (e) { UI.toast('Datei konnte nicht gespeichert werden: ' + e.message); return null; }
    const chip = `<div><a class="kt-file" contenteditable="false" data-kt-file="${escapeHtml(src)}" data-name="${escapeHtml(file.name)}">📎 ${escapeHtml(file.name)}</a></div>`;
    let b = boxId && this.box(boxId);
    if (b && !this.isLocked(b)) {
      b.html = (isEmptyHtml(b.html) ? '' : b.html) + chip;
      const e = this.els.get(b.id); if (e) e._html = null;
      this.render(); Hist.touchPage(this.pageId); Hist.commit('Datei angehängt');
    } else {
      b = this.createBoxAt(worldPt || this.viewCenter(), { html: chip, noFocus: true, w: 320, label: 'Datei angehängt' });
      if (b) this.select([b.id]);
    }
    const lab = typeof FilePages !== 'undefined' && FilePages.expandLabel(file.name);
    UI.toast(lab ? `Angehängt. Rechtsklick auf den Anhang → „${lab}“` : 'Datei angehängt', 5000);
    return b;
  },
  removeFileChip(boxId, src) {
    const b = this.box(boxId);
    if (!b) return;
    const holder = el('div'); holder.innerHTML = b.html;
    for (const a of holder.querySelectorAll('.kt-file')) {
      if (a.dataset.ktFile !== src) continue;
      const wrap = a.closest('div');
      (wrap && wrap !== holder ? wrap : a).remove();
    }
    b.html = holder.innerHTML;
    const e = this.els.get(b.id); if (e) e._html = null;
    this.render(); Hist.touchPage(this.pageId); Hist.commit('Anhang entfernt');
  },

  /* ---------------------------------------------------------- Textfelder */
  createBoxAt(pt, opts = {}) {
    if (!this.page) return null;
    const def = Store.ui.boxDefault || {};
    const b = {
      id: uid('b'), x: this.snapV(pt.x - PADX - BORDER), y: this.snapV(pt.y - BAR - BORDER - 11),
      w: opts.w || 280, html: opts.html || '', images: opts.images || [], z: this.maxZ() + 1,
      style: { ...def }, locked: false, pkg: opts.pkg || null,
    };
    if (typeof OfficeSlides !== 'undefined') OfficeSlides.newBoxStyle(b, pt);   // auf einer Folie: ohne Rahmen/Füllung (1.67)
    // schmales Fenster (Handy): neues Feld nicht über den rechten Rand hinaus anlegen
    const VW = this.vp.clientWidth;
    if (!opts.w && VW < 700) {
      const avail = (VW - 8 - (b.x * this.view.z + this.view.x)) / this.view.z;
      b.w = Math.round(clamp(avail, 160, 280));
    }
    this.page.boxes.push(b);
    this.render();
    if (!opts.noFocus) this.focusText(b.id);
    if (opts.html || (opts.images && opts.images.length)) { Hist.touchPage(this.pageId); Hist.commit(opts.label || 'Textfeld erstellt'); }
    return b;
  },

  async insertImage(boxId, blob, worldPt, extra = null, opt = {}) {
    if (!this.page) return;
    let name;
    // 1.59: PNG/BMP verlustfrei als WebP, wenn kleiner und Pixel für Pixel gleich (nur beim Einfügen, nie beim Laden)
    if (typeof ImgPack !== 'undefined' && !opt.raw) blob = await ImgPack.lossless(blob);
    try { name = await Backend.saveImage(blob); }
    catch (e) { UI.toast('Bild konnte nicht gespeichert werden: ' + e.message); return; }
    const dim = await loadImageSize(await Backend.imgURL(name));
    let b = boxId && this.box(boxId);
    const created = !b;
    let caretY = null;
    if (!created && this.editing === b.id) {
      const s = getSelection();
      if (s.rangeCount) {
        const rr = s.getRangeAt(0).getBoundingClientRect();
        if (rr.top || rr.bottom) caretY = (rr.top - this.vp.getBoundingClientRect().top - this.view.y) / this.view.z - (b.y + BORDER + BAR);
      }
    }
    // tight: Feld genau so breit wie das Bild (Strukturformeln)
    if (created) b = this.createBoxAt(worldPt || this.viewCenter(), { noFocus: true, w: opt.tight ? clamp(dim.w + 2 * (PADX + BORDER), 60, 660) : clamp(dim.w + 2 * PADX + 2, 180, 420) });
    const cw = this.contentW(b);
    const hasText = !isEmptyHtml(b.html);
    const w = Math.round(Math.min(dim.w, created || !hasText ? cw : Math.max(80, cw * 0.45), opt.tight ? 640 : 380));
    const h = Math.round(dim.h * w / dim.w);
    let x = 0, y = 0;
    if (worldPt && !created) { x = worldPt.x - (b.x + BORDER + PADX) - w / 2; y = worldPt.y - (b.y + BORDER + BAR) - h / 2; }
    else if (caretY != null) y = caretY;
    x = Math.round(clamp(x, 0, Math.max(0, cw - w)));
    y = Math.round(Math.max(0, y));
    const im = { id: uid('i'), src: name, x, y, w, h, ...(extra || {}) };
    b.images.push(im);
    this.render();
    Hist.touchPage(this.pageId);
    Hist.commit(opt.label || 'Bild eingefügt');
    if (!this.editing) this.select([b.id]);
    return { box: b, image: im };   // für Add-Ins (1.69)
  },
  removeImage(boxId, imgId) {
    const b = this.box(boxId);
    if (!b || this.isLocked(b)) return;   // gesperrt oder verankerter Hintergrund (1.43): Entf entfernt das Bild nicht
    b.images = b.images.filter(i => i.id !== imgId);
    this.selImg = null;
    this.render();
    Hist.touchPage(this.pageId);
    Hist.commit('Bild entfernt');
  },

  deleteSelection() {
    if (!this.page) return;
    if (this.selImg) { this.removeImage(this.selImg.box, this.selImg.img); return; }
    if (this.selLink) { this.removeLinks([this.selLink]); return; }
    const drew = Draw.removeSelected();
    if (!this.sel.size) { if (drew) { Hist.touchPage(this.pageId); Hist.commit(drew === 1 ? 'Zeichnung gelöscht' : 'Zeichnungen gelöscht'); } return; }
    const p = this.page;
    const kill = new Set();
    // im Hintergrund verankert (1.45): bleibt stehen – erst lösen (Rechtsklick → Häkchen weg)
    let kept = 0, fixed = 0;
    for (const id of this.sel) {
      if (typeof OfficeGrid !== 'undefined' && OfficeGrid.isFixed(this.box(id))) { fixed++; continue; }   // Office-Seite: Tabelle/Schreibbereich/Folie bleiben (1.67)
      if (this.pkg(id)) { const ms = this.members(id); if (ms.some(m => m.bg)) { kept += ms.length; continue; } kill.add(id); for (const m of ms) kill.add(m.id); }
      else if (this.box(id) && this.box(id).bg) kept++;
      else kill.add(id);
    }
    if (!kill.size && fixed) { UI.toast(this.page.type === 'tab' ? 'Die Tabelle gehört zur Arbeitsmappe und bleibt – Zellen leeren mit Entf, ganze Blätter löschen über das Blattregister unten (Rechtsklick)' : 'Gehört zur Office-Datei und bleibt stehen', 5000); return; }
    if (!kill.size) { if (drew) { Hist.touchPage(this.pageId); Hist.commit('Zeichnung gelöscht'); } if (kept) UI.toast('Im Hintergrund verankert – zum Löschen zuerst lösen (Rechtsklick → „… als Hintergrund“)', 3500); return; }
    if (p.boxes.some(b => b.sheet && kill.has(b.id)) && typeof Sheet !== 'undefined') Sheet.bump();   // Bezüge darauf → #BEZUG!
    p.boxes = p.boxes.filter(b => !kill.has(b.id));
    p.pkgs = p.pkgs.filter(k => !kill.has(k.id) && p.boxes.some(b => b.pkg === k.id));
    p.links = p.links.filter(l => !kill.has(l.a) && !kill.has(l.b));
    this.sel.clear();
    this.render();
    Hist.touchPage(this.pageId);
    Hist.commit('Gelöscht');
    if (kept) UI.toast(`${kept} verankerte${kept === 1 ? 's Objekt' : ' Objekte'} im Hintergrund – nicht gelöscht`, 3000);
  },

  /* Feld, das nur aus einem Bild besteht (kein Text) */
  isPictureBox(b) { return !!b && b.images.length === 1 && isEmptyHtml(b.html); },

  /* ---------------------------------------------------------- Gezielt auswählen (Alt+Klick, Tab) */
  objLabel(o) {
    if (o.kind === 'd') { const d = Canvas.page.drawings.find(x => x.id === o.id); return d && d.type === 'ink' ? (d.kind === 'marker' ? 'Textmarker' : 'Freihand') : 'Form'; }
    if (o.kind === 'k') return 'Paket';
    const b = this.box(o.id);
    if (b && b.sheet) return 'Tabelle „' + b.sheet.name + '“';
    if (b && b.chart) return 'Diagramm';
    return b && this.isPictureBox(b) ? (b.images[0].video ? 'Video' : 'Bild') : 'Textfeld';
  },
  /* alle Objekte unter einem Punkt, das oberste zuerst */
  objectsAt(w) {
    const p = this.page, out = [];
    if (!p) return out;
    const tol = 6 / this.view.z;
    const inR = (r) => r && w.x >= r.x && w.x <= r.x + r.w && w.y >= r.y && w.y <= r.y + r.h;
    const boxes = [...p.boxes].sort((a, c) => c.z - a.z);
    // Reihenfolge wie die Ebenen (1.46): vor den Zeichnungen · Zeichnungen · Text · hinter dem Text · Bilder · Pakete
    const pic = (b) => !b.front && this.isPictureBox(b);
    for (const b of boxes) if (b.front && !b.bg && inR(this.rects.get(b.id))) out.push({ kind: 'b', id: b.id });
    for (let i = p.drawings.length - 1; i >= 0; i--) { const d = p.drawings[i]; if (d.layer !== 'unten' && !d.bg && DG.hit(d, w, tol)) out.push({ kind: 'd', id: d.id }); }
    for (const b of boxes) if (!b.bg && !b.front && !pic(b) && inR(this.rects.get(b.id))) out.push({ kind: 'b', id: b.id });
    for (let i = p.drawings.length - 1; i >= 0; i--) { const d = p.drawings[i]; if (d.layer === 'unten' && !d.bg && DG.hit(d, w, tol)) out.push({ kind: 'd', id: d.id }); }
    for (const b of boxes) if (!b.bg && pic(b) && inR(this.rects.get(b.id))) out.push({ kind: 'b', id: b.id });
    for (const k of p.pkgs) if (inR(this.rects.get(k.id))) out.push({ kind: 'k', id: k.id });
    // Hintergrund ganz unten: zuerst Zeichnungen, dann Felder/Bilder
    for (let i = p.drawings.length - 1; i >= 0; i--) { const d = p.drawings[i]; if (d.bg && DG.hit(d, w, tol)) out.push({ kind: 'd', id: d.id }); }
    for (const b of boxes) if (b.bg && inR(this.rects.get(b.id))) out.push({ kind: 'b', id: b.id });
    return out;
  },
  currentObj() {
    if (Draw.sel.size === 1 && !this.sel.size) return [...Draw.sel][0];
    if (this.sel.size === 1 && !Draw.sel.size) return [...this.sel][0];
    return null;
  },
  pickObj(o, additive) {
    if (o.kind === 'd') {
      if (!additive) { this.sel.clear(); this.selLink = null; this.selImg = null; this.refreshSel(); }
      if (additive && Draw.sel.has(o.id)) { Draw.sel.delete(o.id); Draw.render(); } else Draw.select([o.id], additive);
    } else {
      if (!additive) Draw.clearSel(true);
      if (additive) this.toggleSel(o.id); else this.select([o.id]);
      const b = o.kind === 'b' && this.box(o.id);
      if (b && this.isPictureBox(b) && this.sel.has(b.id) && this.sel.size === 1) { this.selImg = { box: b.id, img: b.images[0].id }; this.render(); }
    }
    Ribbon.refreshSoon();
  },
  /* Alt+Klick: der Reihe nach das nächste Objekt unter dem Zeiger (z.B. die Schrift vor einem Bild) */
  cycleAt(ev, base, w) {
    const stack = this.objectsAt(w);
    if (!stack.length) return false;
    ev.preventDefault();
    this.stopEditing();
    const i = stack.findIndex(o => o.id === this.currentObj());
    const k = (i + 1) % stack.length;
    const o = stack[k];
    this.pickObj(o, false);
    $('#sb-hint').textContent = `Alt+Klick: ${this.objLabel(o)} ausgewählt (${k + 1} von ${stack.length} an dieser Stelle) · nochmals Alt+Klick = das nächste darunter`;
    if (o.kind === 'd') {
      const orig = new Map(Draw.selected().map(x => [x.id, JSON.parse(JSON.stringify(x))]));
      Draw.drag = { ...base, type: 'move', orig, boxes: [] };
    } else this.startMove(ev, [o.id]);
    this.capture(ev);
    return true;
  },
  /* Tab / Umschalt+Tab: alle Objekte der Seite in Leserichtung durchgehen */
  cycleAll(dir) {
    const p = this.page;
    if (!p) return;
    const list = [];
    for (const b of p.boxes) if (!isEmptyBox(p, b) && this.rects.get(b.id)) list.push({ kind: 'b', id: b.id, r: this.rects.get(b.id) });
    for (const k of p.pkgs) if (this.rects.get(k.id)) list.push({ kind: 'k', id: k.id, r: this.rects.get(k.id) });
    for (const d of p.drawings) list.push({ kind: 'd', id: d.id, r: DG.bbox(d) });
    if (!list.length) return;
    list.sort((a, c) => (Math.abs(a.r.y - c.r.y) > 12 ? a.r.y - c.r.y : a.r.x - c.r.x));
    const i = list.findIndex(o => o.id === this.currentObj());
    const k = i < 0 ? (dir > 0 ? 0 : list.length - 1) : (i + dir + list.length) % list.length;
    const o = list[k];
    this.stopEditing();
    this.pickObj(o, false);
    // sichtbar machen
    const vr = this.vp.getBoundingClientRect(), z = this.view.z;
    const sx = o.r.x * z + this.view.x, sy = o.r.y * z + this.view.y;
    if (sx < 0 || sy < 0 || sx + o.r.w * z > vr.width || sy + o.r.h * z > vr.height) {
      this.view.x = vr.width / 2 - (o.r.x + o.r.w / 2) * z;
      this.view.y = vr.height / 2 - (o.r.y + o.r.h / 2) * z;
      this.applyView();
    }
    $('#sb-hint').textContent = `${this.objLabel(o)} ausgewählt (${k + 1} von ${list.length}) · Tab = nächstes · Umschalt+Tab = voriges · Pfeiltasten = verschieben`;
  },
  nudge(dx, dy) {
    // ausgewähltes Bild in einem Textfeld: nur das Bild verschieben
    if (this.selImg) {
      const b = this.box(this.selImg.box), im = b && b.images.find(i => i.id === this.selImg.img);
      if (b && im && !this.isPictureBox(b) && !this.isLocked(b)) {
        const cw = this.contentW(b);
        im.x = Math.round(clamp(im.x + dx, 0, Math.max(0, cw - Math.min(im.w, cw))));
        im.y = Math.round(Math.max(0, im.y + dy));
        this.updateBox(b, this.els.get(b.id));
        this.layout();
        Hist.touchPage(this.pageId);
        Hist.pendingLabel = 'Bild verschoben';
        Hist.commitSoon();
        return;
      }
    }
    const items = this.selectedBoxes().filter(b => !this.isLocked(b));
    if (Draw.sel.size) Draw.nudge(dx, dy);
    if (!items.length && !Draw.sel.size) return;
    for (const b of items) { b.x += dx; b.y += dy; }
    this.render();
    Hist.touchPage(this.pageId);
    Hist.pendingLabel = 'Verschieben';
    Hist.commitSoon();
  },

  selectAll() {
    if (!this.page) return;
    this.select([...this.page.pkgs.map(k => k.id), ...this.page.boxes.filter(b => !b.pkg).map(b => b.id)]);   // Strg+A: seit 1.47 auch Hintergrund
    Draw.selectAll();
  },

  /* Kopieren / Einfügen von ganzen Feldern */
  buildClip() {
    const boxes = this.selectedBoxes();
    const drawings = Draw.selected().map(d => JSON.parse(JSON.stringify(d)));
    if (!boxes.length && !drawings.length) return null;
    const pkgIds = new Set([...this.sel].filter(id => this.pkg(id)));
    const all = new Set([...boxes.map(b => b.id), ...pkgIds]);
    return {
      boxes: boxes.map(b => ({ ...JSON.parse(JSON.stringify(b)), pkg: pkgIds.has(b.pkg) ? b.pkg : null })),
      pkgs: this.page.pkgs.filter(k => pkgIds.has(k.id)).map(k => ({ ...k })),
      links: this.page.links.filter(l => all.has(l.a) && all.has(l.b)).map(l => ({ ...l })),
      drawings,
    };
  },
  copySelection(cut) {
    const data = this.buildClip();
    if (!data) return false;
    this.clip = data;
    this.clipText = data.boxes.map(b => htmlToText(b.html)).join('\n\n') || ' ';
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(this.clipText).catch(() => { this.clipText = ''; });
    if (cut) { this.deleteSelection(); UI.toast('Ausgeschnitten'); }
    else { const n = data.boxes.length + data.drawings.length; UI.toast(`${n} Element${n === 1 ? '' : 'e'} kopiert`); }
    return true;
  },
  pasteClip(pt) {
    if (!this.clip) return;
    this.pasteData(this.clip, pt);
    if (!pt) { for (const b of this.clip.boxes) { b.x += 30; b.y += 30; } for (const d of this.clip.drawings || []) DG.map(d, (x, y) => ({ x: x + 30, y: y + 30 })); }
  },
  duplicate() {
    const data = this.buildClip();
    if (data) this.pasteData(data, null, 'Dupliziert');
  },
  pasteData(c, pt, label) {
    if (!c || !this.page) return;
    let x1 = Infinity, y1 = Infinity;
    for (const b of c.boxes) { x1 = Math.min(x1, b.x); y1 = Math.min(y1, b.y); }
    for (const d of c.drawings || []) { const r = DG.bbox(d); x1 = Math.min(x1, r.x); y1 = Math.min(y1, r.y); }
    const off = pt ? { x: pt.x - x1, y: pt.y - y1 } : { x: 30, y: 30 };
    const map = {};
    for (const k of c.pkgs) map[k.id] = uid('k');
    for (const b of c.boxes) map[b.id] = uid('b');
    let z = this.maxZ();
    const newBoxes = c.boxes.map(b => ({ ...JSON.parse(JSON.stringify(b)), id: map[b.id], pkg: b.pkg ? map[b.pkg] : null, x: Math.round(b.x + off.x), y: Math.round(b.y + off.y), z: ++z, locked: false }));
    // Tabellen: Namen eindeutig; Diagramme zeigen auf die mitkopierte Tabelle
    const named = [];
    for (const b of newBoxes) if (b.sheet) { b.sheet.name = Sheet.uniqueName(b.sheet.name, { boxes: [...this.page.boxes, ...named] }, b.id); named.push(b); }
    for (const b of newBoxes) {
      if (b.chart && b.chart.src) { const nid = map[b.chart.src.id]; if (nid) { b.chart.src.id = nid; const sb = newBoxes.find(x => x.id === nid); if (sb) b.chart.src.name = sb.sheet.name; } }
    }
    this.page.boxes.push(...newBoxes);
    if (newBoxes.some(b => b.sheet)) Sheet.bump();
    this.page.pkgs.push(...c.pkgs.map(k => ({ ...k, id: map[k.id], locked: false })));
    this.page.links.push(...c.links.map(l => ({ ...l, id: uid('l'), a: map[l.a], b: map[l.b] })));
    const newDr = (c.drawings || []).map(d => { const n = JSON.parse(JSON.stringify(d)); n.id = uid('d'); n.t0 = Date.now(); DG.map(n, (x, y) => ({ x: x + off.x, y: y + off.y })); return n; });
    this.page.drawings.push(...newDr);
    this.render();
    Hist.touchPage(this.pageId);
    Hist.commit(label || 'Eingefügt');
    this.select([...c.pkgs.map(k => map[k.id]), ...newBoxes.filter(b => !b.pkg).map(b => b.id)]);
    if (newDr.length) Draw.select(newDr.map(d => d.id), true);
  },

  async pasteToCanvas(dt) {
    if (!this.page) return;
    const pt = this.mouse ? this.toWorld(this.mouse.x, this.mouse.y) : this.viewCenter();
    const inView = (() => { const r = this.vp.getBoundingClientRect(); return this.mouse && this.mouse.x > r.left && this.mouse.x < r.right && this.mouse.y > r.top && this.mouse.y < r.bottom; })();
    const at = inView ? pt : this.viewCenter();
    const files = [...(dt.files || [])].filter(f => f.type.startsWith('image/'));
    if (files.length) { for (const f of files) await this.insertImage(null, f, at); return; }
    const text = dt.getData('text/plain');
    if (this.clip && (text === this.clipText || (!text && !dt.getData('text/html')))) { this.pasteClip(at); return; }
    const html = dt.getData('text/html');
    if (!html && !text) return;
    // Tabellendaten (z.B. aus Excel kopiert): als Tabelle mit Formeln/Zahlen einfügen
    const lines = (text || '').replace(/\r\n?/g, '\n').replace(/\n$/, '').split('\n');
    if (text && (/office:excel|ProgId.*Excel/i.test(html || '') || (lines.length >= 2 && lines.filter(l => l.includes('\t')).length >= 2))) {
      const grid = Sheet.parseTsv(text).filter(r => r.some(x => x !== ''));
      if (grid.length) { Sheet.fromGrid(grid, at, 'Tabelle1'); UI.toast('Als Tabelle eingefügt (Strg+Z = rückgängig)'); return; }
    }
    const content = html ? sanitizeHtml(html) : escapeHtml(text).replace(/\r?\n/g, '<br>');
    const b = this.createBoxAt(at, { html: content, noFocus: true, label: 'Eingefügt' });
    if (b) this.select([b.id]);
  },

  /* ---------------------------------------------------------- Pakete */
  group() {
    const boxes = this.selectedBoxes();
    if (boxes.length < 2) { UI.toast('Mindestens zwei Textfelder oder Pakete auswählen (Umschalt + Klick)'); return; }
    const p = this.page;
    const oldPkgs = [...this.sel].filter(id => this.pkg(id));
    const first = oldPkgs.length ? this.pkg(oldPkgs[0]) : null;
    const k = { id: uid('k'), title: first ? first.title : 'Paket', color: first ? first.color : PKG_COLORS[p.pkgs.length % PKG_COLORS.length], locked: false };
    for (const b of boxes) b.pkg = k.id;
    for (const l of p.links) {
      if (oldPkgs.includes(l.a)) l.a = k.id;
      if (oldPkgs.includes(l.b)) l.b = k.id;
    }
    p.pkgs.push(k);
    p.pkgs = p.pkgs.filter(x => p.boxes.some(b => b.pkg === x.id));
    p.links = p.links.filter(l => l.a !== l.b);
    this.sel = new Set([k.id]);
    this.render();
    Hist.touchPage(this.pageId);
    Hist.commit('Gruppiert');
    UI.toast('Zu einem Paket gruppiert – Doppelklick auf den Titel zum Umbenennen');
  },
  ungroup() {
    const p = this.page;
    const pids = new Set();
    for (const id of this.sel) { if (this.pkg(id)) pids.add(id); else { const b = this.box(id); if (b && b.pkg) pids.add(b.pkg); } }
    if (!pids.size) { UI.toast('Kein Paket ausgewählt'); return; }
    const newSel = [];
    for (const pid of pids) {
      const mem = this.members(pid);
      for (const l of p.links) {
        for (const end of ['a', 'b']) {
          if (l[end] !== pid) continue;
          const otherId = end === 'a' ? l.b : l.a;
          const or = this.rects.get(this.nodeOf(otherId)) || this.rects.get(otherId);
          let best = mem[0], bd = Infinity;
          if (or) for (const m of mem) { const r = this.rects.get(m.id); if (!r) continue; const dd = Math.hypot(rectCenter(r).x - rectCenter(or).x, rectCenter(r).y - rectCenter(or).y); if (dd < bd) { bd = dd; best = m; } }
          l[end] = best.id;
        }
      }
      for (const m of mem) { m.pkg = null; newSel.push(m.id); }
    }
    p.pkgs = p.pkgs.filter(k => !pids.has(k.id));
    this.sel = new Set(newSel);
    this.render();
    Hist.touchPage(this.pageId);
    Hist.commit('Gruppierung aufgehoben');
  },
  async renamePkg(pid) {
    const k = this.pkg(pid);
    if (!k) return;
    const v = await UI.prompt('Paket umbenennen', k.title);
    if (v == null) return;
    k.title = v.trim() || 'Paket';
    this.layout();
    Hist.touchPage(this.pageId);
    Hist.commit('Paket umbenannt');
  },
  selectedPkgIds() {
    const out = new Set();
    for (const id of this.sel) { if (this.pkg(id)) out.add(id); else { const b = this.box(id); if (b && b.pkg) out.add(b.pkg); } }
    return [...out];
  },
  setPkgColor(color) {
    const ids = this.selectedPkgIds();
    if (!ids.length) { UI.toast('Kein Paket ausgewählt'); return; }
    for (const id of ids) this.pkg(id).color = color || PKG_COLORS[0];
    this.layout();
    Hist.touchPage(this.pageId);
    Hist.commit('Paketfarbe');
  },
  setLock(lock) {
    let n = 0;
    for (const id of this.sel) {
      const k = this.pkg(id);
      if (k) { k.locked = lock; n++; continue; }
      const b = this.box(id);
      if (b) { b.locked = lock; n++; }
    }
    if (!n) { UI.toast('Zuerst ein Textfeld oder Paket auswählen'); return; }
    if (lock) this.stopEditing();
    this.render(true);
    Hist.touchPage(this.pageId);
    Hist.commit(lock ? 'Gesperrt' : 'Entsperrt');
    UI.toast(lock ? 'Gesperrt – kann nicht mehr verschoben oder bearbeitet werden' : 'Entsperrt');
  },
  toggleLock() {
    const items = [...this.sel].map(id => this.pkg(id) || this.box(id)).filter(Boolean);
    if (!items.length) { UI.toast('Zuerst ein Textfeld oder Paket auswählen'); return; }
    this.setLock(!items.every(x => x.locked));
  },
  selectionLocked() {
    const items = [...this.sel].map(id => this.pkg(id) || this.box(id)).filter(Boolean);
    return items.length > 0 && items.every(x => x.locked);
  },

  /* Hintergrund (seit 1.10, wie OneNote „Bild als Hintergrund festlegen“): liegt ganz unten (eigene Ebene, unter
   * Paketen, Verbindungen und Zeichnungen), wird von Auswahlrahmen, Lasso und Strg+A übersprungen, ist kein Hindernis
   * für Verbindungen und wird vom Radierer nicht erfasst. Einzeln anklicken wählt es aus; Rechtsklick → nochmals = normal. */
  setBackground(on, boxes, draws) {
    const p = this.page;
    if (!p || (!boxes.length && !draws.length)) return;
    this.stopEditing();
    // Reihenfolge innerhalb der Ebene neu zählen: die geänderten Objekte kommen nach unten
    const restack = (list, first) => { let z = 0; for (const b of first) b.z = ++z; for (const b of list.filter(x => !first.includes(x)).sort((a, c) => a.z - c.z)) b.z = ++z; };
    for (const b of boxes) {
      if (on) { b.bg = true; b.pkg = null; delete b.front; }   // ein Hintergrund gehört zu keinem Paket
      else delete b.bg;
    }
    p.pkgs = p.pkgs.filter(k => p.boxes.some(b => b.pkg === k.id));
    p.links = p.links.filter(l => (this.box(l.a) || this.pkg(l.a)) && (this.box(l.b) || this.pkg(l.b)));
    if (boxes.length) restack(p.boxes.filter(b => !!b.bg === on), boxes);
    for (const d of draws) { if (on) d.bg = true; else delete d.bg; }
    // Auswahl bleibt (1.47): dieselben Objekte bleiben markiert – nur sofort nicht mehr verschiebbar (Pakete sind aufgelöst)
    if (on) { this.sel = new Set(boxes.map(b => b.id)); this.selImg = null; this.selLink = null; Draw.sel = new Set(draws.map(d => d.id)); Draw.render(); }
    this.render(true);
    this.refreshSel();
    Hist.touchPage(this.pageId);
    const n = boxes.length + draws.length;
    Hist.commit(on ? 'Als Hintergrund festgelegt' : 'Hintergrund aufgehoben');
    UI.toast(on ? `${n === 1 ? 'Liegt' : `${n} Objekte liegen`} jetzt im Hintergrund und ${n === 1 ? 'ist' : 'sind'} verankert (nicht verschiebbar) – lösen: Rechtsklick → nochmals „… als Hintergrund“`
      : 'Wieder ein normales Objekt', on ? 5000 : 2200);
  },

  order(front) {
    if (Draw.sel.size) Draw.order(front);
    const boxes = this.selectedBoxes();
    if (!boxes.length) return;
    const p = this.page;
    if (front) for (const b of boxes) delete b.bg;   // „In den Vordergrund“ holt ein Hintergrund-Objekt wieder nach vorne
    else for (const b of boxes) delete b.front;    // „In den Hintergrund“ (1.46): auch wieder hinter die Zeichnungen
    boxes.sort((a, b) => a.z - b.z);
    if (front) { let z = this.maxZ(); for (const b of boxes) b.z = ++z; }
    else {
      const others = p.boxes.filter(b => !boxes.includes(b)).sort((a, b) => a.z - b.z);
      let z = 0;
      for (const b of boxes) b.z = ++z;
      for (const b of others) b.z = ++z;
    }
    this.render();
    Hist.touchPage(this.pageId);
    Hist.commit(front ? 'In den Vordergrund' : 'In den Hintergrund');
  },

  moveNode(id, dx, dy) {
    const k = this.pkg(id);
    const list = k ? this.members(id) : [this.box(id)].filter(Boolean);
    for (const b of list) { b.x = Math.round(b.x + dx); b.y = Math.round(b.y + dy); }
  },
  align(mode) {
    const nodes = this.selectedNodes();
    if (nodes.length < 2) { UI.toast('Mindestens zwei Elemente auswählen'); return; }
    const rs = nodes.map(id => ({ id, r: this.rects.get(id) })).filter(x => x.r);
    const x1 = Math.min(...rs.map(x => x.r.x)), x2 = Math.max(...rs.map(x => x.r.x + x.r.w));
    const y1 = Math.min(...rs.map(x => x.r.y)), y2 = Math.max(...rs.map(x => x.r.y + x.r.h));
    if (mode === 'distH' || mode === 'distV') {
      if (rs.length < 3) { UI.toast('Zum Verteilen mindestens drei Elemente auswählen'); return; }
      const h = mode === 'distH';
      rs.sort((a, b) => h ? a.r.x - b.r.x : a.r.y - b.r.y);
      const total = rs.reduce((s, x) => s + (h ? x.r.w : x.r.h), 0);
      const gap = ((h ? x2 - x1 : y2 - y1) - total) / (rs.length - 1);
      let pos = h ? x1 : y1;
      for (const x of rs) { this.moveNode(x.id, h ? pos - x.r.x : 0, h ? 0 : pos - x.r.y); pos += (h ? x.r.w : x.r.h) + gap; }
    } else {
      for (const { id, r } of rs) {
        const dx = mode === 'left' ? x1 - r.x : mode === 'center' ? (x1 + x2) / 2 - (r.x + r.w / 2) : mode === 'right' ? x2 - (r.x + r.w) : 0;
        const dy = mode === 'top' ? y1 - r.y : mode === 'middle' ? (y1 + y2) / 2 - (r.y + r.h / 2) : mode === 'bottom' ? y2 - (r.y + r.h) : 0;
        this.moveNode(id, dx, dy);
      }
    }
    this.render();
    Hist.touchPage(this.pageId);
    Hist.commit('Ausrichten');
  },
  sameWidth() {
    const boxes = this.selectedBoxes().filter(b => !this.isLocked(b));
    if (boxes.length < 2) { UI.toast('Mindestens zwei Textfelder auswählen'); return; }
    const w = Math.max(...boxes.map(b => b.w));
    for (const b of boxes) b.w = w;
    this.render();
    Hist.touchPage(this.pageId);
    Hist.commit('Gleiche Breite');
  },
  setBoxStyle(patch, label) {
    const boxes = this.selectedBoxes();
    if (!boxes.length) { Store.ui.boxDefault = { ...Store.ui.boxDefault, ...patch }; UiState.saveSoon(); UI.toast('Gilt ab jetzt für neue Textfelder'); return; }
    for (const b of boxes) {
      b.style = { ...b.style, ...patch };
      for (const k of Object.keys(b.style)) if (b.style[k] == null || b.style[k] === '') delete b.style[k];
    }
    this.render();
    Hist.touchPage(this.pageId);
    Hist.commit(label || 'Formatvorlage');
  },

  /* ---------------------------------------------------------- Verbindungen */
  addLink(a, b, opts = {}) {
    const p = this.page;
    const def = Store.ui.linkDefault || {};
    const l = { id: uid('l'), a, b, style: def.style || 'kurve', arrow: def.arrow || 'ende', w: def.w || 2, color: def.color || null, dash: !!def.dash, label: '' };
    if (opts.aAnchor) l.aAnchor = opts.aAnchor;
    if (opts.bAnchor) l.bAnchor = opts.bAnchor;
    const n = p.links.filter(x => (x.a === a && x.b === b) || (x.a === b && x.b === a)).length;
    if (n) UI.toast(`${n + 1}. Verbindung zwischen diesen beiden – sie werden automatisch nebeneinander gezeichnet`);
    p.links.push(l);
    this.renderLinks();
    Hist.touchPage(this.pageId);
    Hist.commit('Verbunden');
    return l;
  },
  removeLinks(ids) {
    const s = new Set(ids);
    if (!s.size) return;
    this.page.links = this.page.links.filter(l => !s.has(l.id));
    if (s.has(this.selLink)) this.selLink = null;
    this.renderLinks();
    Hist.touchPage(this.pageId);
    Hist.commit(s.size === 1 ? 'Verbindung entfernt' : 'Verbindungen entfernt');
  },
  linksOfSelection() {
    if (this.selLink) return this.page.links.filter(l => l.id === this.selLink);
    const ids = new Set();
    for (const id of this.sel) { ids.add(id); for (const m of (this.pkg(id) ? this.members(id) : [])) ids.add(m.id); }
    return this.page.links.filter(l => ids.has(l.a) || ids.has(l.b));
  },
  setLinkProps(patch, label) {
    const links = this.page ? this.linksOfSelection() : [];
    Store.ui.linkDefault = { ...Store.ui.linkDefault, ...patch };
    UiState.saveSoon();
    if (!links.length) { UI.toast('Gilt ab jetzt für neue Verbindungen'); Ribbon.refreshSoon(); return; }
    for (const l of links) Object.assign(l, patch);
    this.renderLinks();
    Hist.touchPage(this.pageId);
    Hist.commit(label || 'Verbindung geändert');
  },
  resetLinks(list) {
    const links = list || this.linksOfSelection();
    const changed = links.filter(l => l.aAnchor || l.bAnchor || l.bend);
    if (!changed.length) { UI.toast('Keine verschobenen Linien ausgewählt'); return; }
    for (const l of changed) { delete l.aAnchor; delete l.bAnchor; delete l.bend; }
    this.renderLinks();
    Hist.touchPage(this.pageId);
    Hist.commit('Linie zurückgesetzt');
  },
  reverseLinks() {
    const links = this.linksOfSelection();
    if (!links.length) { UI.toast('Zuerst eine Verbindung auswählen'); return; }
    for (const l of links) { const t = l.a; l.a = l.b; l.b = t; const ta = l.aAnchor; l.aAnchor = l.bAnchor; l.bAnchor = ta; if (!l.aAnchor) delete l.aAnchor; if (!l.bAnchor) delete l.bAnchor; }
    this.renderLinks();
    Hist.touchPage(this.pageId);
    Hist.commit('Richtung umgekehrt');
  },
  async editLinkLabel(id) {
    const l = this.page.links.find(x => x.id === id) || (this.selLink && this.page.links.find(x => x.id === this.selLink));
    if (!l) { UI.toast('Zuerst eine Verbindung anklicken'); return; }
    const v = await UI.prompt('Beschriftung der Verbindung', l.label || '', { placeholder: 'z.B. „führt zu“, „gehört zu“ …' });
    if (v == null) return;
    l.label = v.trim();
    this.renderLinks();
    Hist.touchPage(this.pageId);
    Hist.commit('Beschriftung');
  },
  connectSelected() {
    const nodes = [...this.sel].map(id => this.nodeOf(id)).filter((v, i, a) => v && a.indexOf(v) === i);
    if (nodes.length < 2) { UI.toast('Mindestens zwei Elemente auswählen – oder mit gedrückter rechter Maustaste ziehen'); return; }
    const p = this.page, def = Store.ui.linkDefault || {};
    let n = 0;
    for (let i = 0; i < nodes.length - 1; i++) {
      const a = nodes[i], b = nodes[i + 1];
      if (p.links.some(l => (l.a === a && l.b === b) || (l.a === b && l.b === a))) continue;
      p.links.push({ id: uid('l'), a, b, style: def.style || 'kurve', arrow: def.arrow || 'ende', w: def.w || 2, color: def.color || null, dash: !!def.dash, label: '' });
      n++;
    }
    this.renderLinks();
    Hist.touchPage(this.pageId);
    Hist.commit('Verbunden');
    UI.toast(n ? `${n} Verbindung${n === 1 ? '' : 'en'} erstellt` : 'Schon verbunden');
  },
  disconnectSelected() {
    if (this.selLink) { this.removeLinks([this.selLink]); return; }
    const ids = new Set();
    for (const id of this.sel) { ids.add(id); for (const m of (this.pkg(id) ? this.members(id) : [])) ids.add(m.id); }
    const nodes = new Set([...this.sel].map(id => this.nodeOf(id)));
    const between = this.page.links.filter(l => nodes.has(this.nodeOf(l.a)) && nodes.has(this.nodeOf(l.b)) && this.sel.size > 1);
    const list = between.length ? between : this.page.links.filter(l => ids.has(l.a) || ids.has(l.b));
    if (!list.length) { UI.toast('Keine Verbindungen gefunden'); return; }
    this.removeLinks(list.map(l => l.id));
  },
  cutLinks(knife) {
    if (knife.length < 2) return;
    const cut = [];
    for (const [id, pts] of this.linkGeo) {
      let hit = false;
      for (let i = 0; i < knife.length - 1 && !hit; i++)
        for (let j = 0; j < pts.length - 1 && !hit; j++)
          if (segIntersect(knife[i], knife[i + 1], pts[j], pts[j + 1])) hit = true;
      if (hit) cut.push(id);
    }
    if (cut.length) { this.removeLinks(cut); UI.toast(`${cut.length} Verbindung${cut.length === 1 ? '' : 'en'} durchgeschnitten`); }
  },

  /* Knowledge Tree automatisch als Baum anordnen (von links nach rechts) */
  treeLayout() {
    const p = this.page;
    if (!p) return;
    let nodes = this.selectedNodes();
    const linked = new Set();
    const edges = [];
    for (const l of p.links) {
      const a = this.nodeOf(l.a), b = this.nodeOf(l.b);
      if (a && b && a !== b) { edges.push([a, b]); linked.add(a); linked.add(b); }
    }
    if (nodes.length < 2) nodes = [...linked];
    const set = new Set(nodes.filter(n => this.rects.has(n)));
    if (set.size < 2) { UI.toast('Keine verbundenen Elemente zum Anordnen gefunden'); return; }
    const out = new Map(), indeg = new Map();
    for (const n of set) { out.set(n, []); indeg.set(n, 0); }
    for (const [a, b] of edges) if (set.has(a) && set.has(b)) { out.get(a).push(b); indeg.set(b, indeg.get(b) + 1); }
    for (const list of out.values()) list.sort((u, v) => this.rects.get(u).y - this.rects.get(v).y);
    const byPos = [...set].sort((u, v) => this.rects.get(u).y - this.rects.get(v).y);
    let roots = byPos.filter(n => indeg.get(n) === 0);
    const depth = new Map(), children = new Map();
    const visit = (rootList) => {
      const q = [];
      for (const r of rootList) if (!depth.has(r)) { depth.set(r, 0); q.push(r); }
      while (q.length) {
        const n = q.shift();
        children.set(n, children.get(n) || []);
        for (const c of out.get(n)) if (!depth.has(c)) { depth.set(c, depth.get(n) + 1); children.get(n).push(c); q.push(c); }
      }
    };
    visit(roots);
    for (const n of byPos) if (!depth.has(n)) { roots.push(n); visit([n]); }
    const maxW = [];
    for (const [n, d] of depth) maxW[d] = Math.max(maxW[d] || 0, this.rects.get(n).w);
    const colX = [0];
    for (let d = 1; d < maxW.length; d++) colX[d] = colX[d - 1] + maxW[d - 1] + 110;
    const pos = new Map();
    let cursor = 0;
    const VG = 36;
    const place = (n) => {
      const r = this.rects.get(n), kids = children.get(n) || [];
      if (!kids.length) { pos.set(n, cursor); cursor += r.h + VG; return [pos.get(n), pos.get(n) + r.h]; }
      let top = Infinity, bot = -Infinity;
      for (const k of kids) { const [t, b] = place(k); top = Math.min(top, t); bot = Math.max(bot, b); }
      const y = (top + bot) / 2 - r.h / 2;
      pos.set(n, y);
      cursor = Math.max(cursor, y + r.h + VG);
      return [Math.min(top, y), Math.max(bot, y + r.h)];
    };
    for (const r of roots) { place(r); cursor += 30; }
    const r0 = this.rects.get(roots[0]);
    const ox = Math.min(...[...set].map(n => this.rects.get(n).x));
    const oy = r0.y - pos.get(roots[0]);
    for (const n of set) {
      const r = this.rects.get(n);
      this.moveNode(n, ox + colX[depth.get(n)] - r.x, oy + pos.get(n) - r.y);
    }
    for (const l of p.links) if (set.has(this.nodeOf(l.a)) && set.has(this.nodeOf(l.b))) delete l.bend;
    this.render();
    Hist.touchPage(this.pageId);
    Hist.commit('Als Baum angeordnet');
    UI.toast('Knowledge Tree angeordnet');
  },

  /* ---------------------------------------------------------- Kontextmenüs */
  contextMenu(ev, d) {
    const x = ev.clientX, y = ev.clientY;
    // Rechtschreibung (1.38): Rechtsklick auf ein angestrichenes Wort = Vorschläge zuoberst
    const spell = d.inText && d.boxId && typeof Spell !== 'undefined' ? Spell.menuFor(x, y, d.boxId) : null;
    const w = this.toWorld(x, y);
    // Rechtsklick / langes Drücken auf einen 📎-Anhang: Seiten als Bilder aufklappen (wie OneNote „Dateiausdruck“)
    if (d.fileSrc && typeof FilePages !== 'undefined') {
      if (d.boxId && !this.sel.has(d.boxId)) this.select([d.boxId]);
      const lab = FilePages.expandLabel(d.fileName);
      UI.menu([
        { head: d.fileName || 'Datei' },
        lab
          ? { label: lab, icon: 'filePages', action: () => FilePages.expand(d.boxId, d.fileSrc, d.fileName) }
          : { label: 'Als Seiten nicht möglich – in Word „Speichern als PDF“', icon: 'filePages', disabled: true },
        { label: 'Öffnen / Herunterladen', icon: 'download', action: () => downloadAttachment(d.fileSrc, d.fileName) },
        ...(typeof OfficePages !== 'undefined' && OfficePages.isOffice(d.fileName) ? [{ label: 'Als Office-Seite öffnen', icon: 'page', disabled: Store.readOnly, action: () => OfficePages.fromAttachment(d.fileSrc, d.fileName).catch(e => UI.toast(e.message, 4000)) }] : []),
        '-',
        { label: 'Anhang entfernen', icon: 'trash', danger: true, action: () => this.removeFileChip(d.boxId, d.fileSrc) },
      ], x, y);
      return;
    }
    if (d.linkId) {
      const l = this.page.links.find(q => q.id === d.linkId);
      if (!l) return;
      this.sel.clear(); this.selLink = l.id; this.refreshSel();
      UI.menu([
        { label: 'Beschriftung …', icon: 'tag', action: () => this.editLinkLabel(l.id) },
        { head: 'Farbe' },
        { colors: [null, '#6b4fbb', '#0078d4', '#038387', '#498205', '#e8a302', '#ca5010', '#d13438', '#c239b3', '#605e5c'], action: c => this.setLinkProps({ color: c }, 'Linienfarbe') },
        '-',
        { label: 'Kurve', icon: 'curve', checked: (l.style || 'kurve') === 'kurve', action: () => this.setLinkProps({ style: 'kurve' }, 'Linienform') },
        { label: 'Gerade', icon: 'straight', checked: l.style === 'gerade', action: () => this.setLinkProps({ style: 'gerade' }, 'Linienform') },
        { label: 'Winkel', icon: 'angled', checked: l.style === 'winkel', action: () => this.setLinkProps({ style: 'winkel' }, 'Linienform') },
        '-',
        { label: 'Pfeil am Ende', icon: 'arrowEnd', checked: (l.arrow || 'ende') === 'ende', action: () => this.setLinkProps({ arrow: 'ende' }, 'Pfeil') },
        { label: 'Pfeile an beiden Enden', icon: 'arrowBoth', checked: l.arrow === 'beide', action: () => this.setLinkProps({ arrow: 'beide' }, 'Pfeil') },
        { label: 'Ohne Pfeil', icon: 'arrowNone', checked: l.arrow === 'keiner', action: () => this.setLinkProps({ arrow: 'keiner' }, 'Pfeil') },
        { label: 'Richtung umkehren', icon: 'swap', action: () => this.reverseLinks() },
        { label: 'Gestrichelt', icon: 'dashed', checked: !!l.dash, action: () => this.setLinkProps({ dash: !l.dash }, 'Linienart') },
        { label: 'Weitere Verbindung zurück', icon: 'swap', action: () => this.addLink(this.nodeOf(l.b) || l.b, this.nodeOf(l.a) || l.a) },
        { label: 'Linie zurücksetzen (automatisch)', icon: 'undo', disabled: !(l.aAnchor || l.bAnchor || l.bend), action: () => this.resetLinks([l]) },
        '-',
        { label: 'Verbindung löschen', icon: 'trash', danger: true, key: 'Entf', action: () => this.removeLinks([l.id]) },
      ], x, y);
      return;
    }
    // Rechtsklick auf ein Bild, das Teil einer grösseren Auswahl ist (z. B. nach Strg+A): das Menü der ganzen Auswahl,
    // damit „… als Hintergrund“ usw. für alle markierten Objekte gilt (1.45)
    if (d.imgId && d.boxId) {
      const bx = this.box(d.boxId);
      if (bx && (this.sel.has(bx.id) || (bx.pkg && this.sel.has(bx.pkg))) && this.sel.size + Draw.sel.size > 1) d = { ...d, imgId: null };
    }
    if (d.imgId && d.boxId) {
      const b = this.box(d.boxId);
      const im = b && b.images.find(i => i.id === d.imgId);
      if (!im) return;
      this.sel = new Set([b.id]); this.selImg = { box: b.id, img: im.id }; this.refreshSel(); this.render();
      const extra = typeof Plugins !== 'undefined' ? Plugins.menuFor('box', { box: b, image: im, locked: this.isLocked(b), page: this.page }) : [];   // Add-Ins (1.69), z.B. Chem-Draw
      UI.menu([
        ...(extra.length ? [...extra, '-'] : []),
        { label: 'Bild gross anzeigen', icon: 'image', action: () => Backend.imgURL(im.src).then(u => UI.lightbox(u)) },
        { label: 'Volle Breite', icon: 'sameWidth', disabled: this.isLocked(b), action: () => { const cw = this.contentW(b); im.h = Math.round(im.h * cw / im.w); im.w = cw; im.x = 0; this.render(); Hist.touchPage(this.pageId); Hist.commit('Bildgrösse geändert'); } },
        this.isPictureBox(b) ? { label: 'Bild als Hintergrund', icon: 'bgImage', checked: !!b.bg, action: () => this.setBackground(!b.bg, [b], []) } : null,
        // Ebene (1.46): Bilder liegen unter allen Zeichnungen – „Vor die Zeichnungen“ holt das Feld ganz nach oben
        b.bg ? null : { label: b.front ? 'Hinter die Zeichnungen' : 'Vor die Zeichnungen', icon: b.front ? 'layerDown' : 'layerUp', action: () => this.setFront(!b.front, [b]) },
        '-',
        { label: 'Bild entfernen', icon: 'trash', danger: true, key: 'Entf', disabled: this.isLocked(b), action: () => this.removeImage(b.id, im.id) },
      ], x, y);
      return;
    }
    if (d.node) {
      const target = d.boxId || d.node;
      if (!this.sel.has(target) && !(d.boxId && this.sel.has(d.node))) { this.select([target]); }
      const b = d.boxId && this.box(d.boxId);
      const k = this.pkg(d.node);
      const multi = this.selectedBoxes().length > 1;
      const locked = this.selectionLocked();
      const items = spell ? [...spell] : [];
      if (d.inText && this.editing === d.boxId) {
        items.push(
          { label: 'Ausschneiden', icon: 'cut', key: 'Strg+X', action: () => Cmd.run('cut') },
          { label: 'Kopieren', icon: 'copy', key: 'Strg+C', action: () => Cmd.run('copy') },
          { label: 'Einfügen', icon: 'paste', key: 'Strg+V', action: () => Cmd.run('paste') },
          '-');
      } else {
        items.push(
          { label: 'Ausschneiden', icon: 'cut', key: 'Strg+X', action: () => this.copySelection(true) },
          { label: 'Kopieren', icon: 'copy', key: 'Strg+C', action: () => this.copySelection(false) },
          { label: 'Duplizieren', icon: 'duplicate', key: 'Strg+D', action: () => this.duplicate() },
          '-');
      }
      // Einträge der Add-Ins (1.69, z.B. Chem-Draw: „Struktur bearbeiten“); image = markiertes Bild bzw. Bild eines Bild-Felds
      if (b && typeof Plugins !== 'undefined') {
        const image = b.images.find(i => this.selImg && this.selImg.box === b.id && this.selImg.img === i.id) || (this.isPictureBox(b) ? b.images[0] : null);
        const extra = Plugins.menuFor('box', { box: b, image, locked: this.isLocked(b), page: this.page });
        if (extra.length) items.push(...extra, '-');
      }
      if (b && b.sheet) items.push({ label: 'Tabelle umbenennen …', icon: 'pencil', disabled: this.isLocked(b), action: () => Sheet.rename(b.id) }, { label: 'Diagramm aus der Tabelle', icon: 'chart', disabled: this.isLocked(b), action: () => { this.select([b.id]); Chart.insert(); } }, { label: 'Als CSV speichern', icon: 'csv', action: () => { Sheet.activate(b.id, 0, 0); Sheet.exportCsv(); } }, '-');
      else if (b && b.chart) items.push({ label: 'Diagramm bearbeiten …', icon: 'pencil', disabled: this.isLocked(b), action: () => Chart.editDialog(b) }, { label: 'Werte anzeigen', icon: 'readout', action: () => Chart.showData(b) }, { label: 'Werte als Tabelle einfügen', icon: 'table', action: () => Chart.toSheet(b) }, '-');
      else if (b) items.push({ label: 'Bild einfügen …', icon: 'image', disabled: this.isLocked(b), action: () => Cmd.run('insertImage', { boxId: b.id }) });
      if (b && !b.sheet && /<table/i.test(b.html)) items.push({ label: 'In Rechentabelle umwandeln (wie Excel)', icon: 'table', disabled: this.isLocked(b), action: () => Sheet.fromHtmlTable(b.id) });
      // Als Hintergrund festlegen – seit 1.45 für ALLE markierten Objekte: Felder/Bilder (auch in markierten Paketen,
      // die dabei aufgelöst werden) und markierte Zeichnungen. Tabellen bleiben aussen vor.
      const bgList = this.selectedBoxes().filter(x => !x.sheet);
      const bgDraws = Draw.selected();
      items.push(...this.bgMenuItems(bgList, bgDraws));
      items.push(
        // verankerter Hintergrund (1.43): lösen nur über „… als Hintergrund“ – Sperren/Entsperren hier weglassen
        bgList.length && bgList.every(x => x.bg) && !k ? null : { label: locked ? 'Entsperren' : 'Sperren', icon: locked ? 'unlock' : 'lock', key: 'Strg+Umsch+L', action: () => this.setLock(!locked) },
        multi ? { label: 'Gruppieren (Paket)', icon: 'group', key: 'Strg+G', action: () => this.group() } : null,
        (k || (b && b.pkg)) ? { label: 'Gruppierung aufheben', icon: 'ungroup', key: 'Strg+Umsch+G', action: () => this.ungroup() } : null,
        k && !d.boxId ? { label: 'Paket umbenennen …', icon: 'pencil', action: () => this.renamePkg(k.id) } : null,
        '-',
        { label: 'In den Vordergrund', icon: 'front', action: () => this.order(true) },
        { label: 'In den Hintergrund', icon: 'back', action: () => this.order(false) },
        // Ebene gegenüber den Zeichnungen (1.46): vor = über allen Zeichnungen; sonst Text zwischen den Zeichnungen,
        // Bilder unter allen Zeichnungen
        (() => { const L = this.selectedBoxes(), on = L.length > 0 && L.every(x => x.front); return L.length ? { label: on ? 'Hinter die Zeichnungen' : 'Vor die Zeichnungen', icon: on ? 'layerDown' : 'layerUp', action: () => this.setFront(!on, L) } : null; })(),
        { head: k && !d.boxId ? 'Paketfarbe' : 'Füllfarbe' },
        k && !d.boxId
          ? { colors: PKG_COLORS, action: c => this.setPkgColor(c) }
          : { colors: [null, '#FFF4C2', '#DCEBFF', '#DDF3E0', '#FDE0E0', '#EDE3FA', '#FFE8D1', 'transparent'], action: c => this.setBoxStyle({ bg: c, color: c && c !== 'transparent' ? '#252423' : null }, 'Füllfarbe') },
        '-',
        !multi ? { label: 'Verbinden mit … (Ziel antippen)', icon: 'connect', action: () => this.startConnectPick(d.node) } : null,
        { label: 'Verbindungen lösen', icon: 'disconnect', action: () => this.disconnectSelected() },
        { label: 'Löschen', icon: 'trash', danger: true, key: 'Entf', action: () => this.deleteSelection() },
      );
      UI.menu(items, x, y);
      return;
    }
    UI.menu([
      { label: 'Textfeld hier erstellen', icon: 'textbox', action: () => this.createBoxAt(w) },
      { label: 'Einfügen', icon: 'paste', key: 'Strg+V', disabled: !this.clip, action: () => this.pasteClip(w) },
      { label: 'Bild einfügen …', icon: 'image', action: () => Cmd.run('insertImage', { at: w }) },
      '-',
      { label: 'Alles auswählen', icon: 'selectAll', key: 'Strg+A', action: () => this.selectAll() },
      { label: 'Alles anzeigen', icon: 'fit', action: () => this.fit() },
      { label: 'Als Baum anordnen', icon: 'tree', action: () => this.treeLayout() },
      ...(typeof Plugins !== 'undefined' ? ((m) => m.length ? ['-', ...m] : [])(Plugins.menuFor('canvas', { at: w, page: this.page })) : []),   // Add-Ins (1.69)
      { head: 'Hintergrund' },
      ...BG_KINDS.filter(k => ['punkte', 'raster', 'linien', 'keiner'].includes(k[0])).map(([v, l, ic]) => ({ label: l, icon: ic, checked: this.page.bg === v, action: () => Cmd.run('bg', v) })),
    ], x, y);
  },

  /* ---------------------------------------------------------- Status */
  updateStatus() {
    const p = this.page;
    const left = $('#sb-left'), hint = $('#sb-hint');
    if (!p) { left.textContent = ''; hint.textContent = ''; return; }
    if (typeof Sheet !== 'undefined' && Sheet.active) { const os = typeof OfficeView !== 'undefined' && OfficeView.status(p); if (os) left.textContent = os; Sheet.status(); return; }
    const g = Tree.groupOfPage(this.pageId);
    const path = g ? Tree.path(g.id).map(x => x.name).join(' › ') : '';
    const nT = p.boxes.filter(b => b.sheet).length, nC = p.boxes.filter(b => b.chart).length, nB = p.boxes.length - nT - nC;
    left.textContent = `${path}  ·  ${nB} Textfeld${nB === 1 ? '' : 'er'}${nT ? ` · ${nT} Tabelle${nT === 1 ? '' : 'n'}` : ''}${nC ? ` · ${nC} Diagramm${nC === 1 ? '' : 'e'}` : ''} · ${p.pkgs.length} Paket${p.pkgs.length === 1 ? '' : 'e'} · ${p.links.length} Verbindung${p.links.length === 1 ? '' : 'en'}${p.drawings.length ? ` · ${p.drawings.length} Zeichnung${p.drawings.length === 1 ? '' : 'en'}` : ''}`;
    const os = typeof OfficeView !== 'undefined' && OfficeView.status(p);   // Word/PowerPoint: „Seite x von n“
    if (os) left.textContent = os;
    let h;
    if (this.selLink) h = 'Verbindung: Linie oder Mittelpunkt ziehen = biegen · Endpunkte ziehen = Ansatz verschieben / an anderes Feld hängen · Doppelklick Punkt = zurücksetzen · Entf = löschen';
    else if (this.sel.size === 1 && this.box([...this.sel][0]) && this.box([...this.sel][0]).bg) h = 'Hintergrund ausgewählt – verankert (nicht verschiebbar) · Doppelklick = Textfeld darauf schreiben · Rechtsklick → „… als Hintergrund“ = lösen, danach verschiebbar';
    else if (this.selImg) h = 'Bild ausgewählt · ziehen = verschieben (Text fliesst herum) · Ecke = Grösse · Entf = entfernen';
    else if (this.sel.size > 1) h = 'Mehrere ausgewählt · Strg+G = zu Paket gruppieren · Rechtsklick ziehen = verbinden';
    else if (this.sel.size === 1 && this.box([...this.sel][0]) && this.box([...this.sel][0]).chart) h = 'Diagramm: Doppelklick = bearbeiten · Zeiger auf die Kurve = Werte ablesen · Klick auf einen Punkt = Zelle in der Tabelle · Ecke = Grösse';
    else if (this.sel.size === 1 && this.box([...this.sel][0]) && this.box([...this.sel][0]).sheet) h = 'Tabelle: Klick in eine Zelle = bearbeiten · Leiste oben = verschieben · Enter = erste Zelle';
    else if (this.sel.size === 1) h = 'Rechtsklick gedrückt halten und auf ein anderes Feld ziehen = verbinden · Strg+Rechtsklick ziehen = schneiden';
    else h = 'Klick auf die Fläche = neues Textfeld · Ziehen = Auswahlrahmen · Mausrad = scrollen · Strg+Mausrad = zoomen';
    hint.textContent = h;
  },
};
