'use strict';
/* Menüs, Farbwähler, Dialoge, Meldungen */

const THEME_COLORS = ['#FFFFFF', '#000000', '#E7E6E6', '#44546A', '#4472C4', '#ED7D31', '#A5A5A5', '#FFC000', '#5B9BD5', '#70AD47'];
const STANDARD_COLORS = ['#C00000', '#FF0000', '#FFC000', '#FFFF00', '#92D050', '#00B050', '#00B0F0', '#0070C0', '#002060', '#7030A0'];
const HIGHLIGHT_COLORS = ['#FFFF00', '#00FF00', '#00FFFF', '#FF00FF', '#0000FF', '#FF0000', '#000080', '#008080', '#008000', '#800080', '#800000', '#808000', '#808080', '#C0C0C0', '#FFE699'];

function shade(hex, f) { // f>0 aufhellen, f<0 abdunkeln
  const n = parseInt(hex.slice(1), 16);
  let r = n >> 16, g = (n >> 8) & 255, b = n & 255;
  if (f >= 0) { r += (255 - r) * f; g += (255 - g) * f; b += (255 - b) * f; }
  else { r *= 1 + f; g *= 1 + f; b *= 1 + f; }
  return '#' + [r, g, b].map(v => Math.round(v).toString(16).padStart(2, '0')).join('');
}

const UI = {
  _pop: null,

  toast(msg, ms = 2200) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('on');
    clearTimeout(this._tt);
    this._tt = setTimeout(() => t.classList.remove('on'), ms);
  },

  /* ---------------------------------------------------------- Popups */
  closePopup() {
    if (this._pop) { const p = this._pop; this._pop = null; p.el.remove(); p.onClose && p.onClose(); }
  },
  popupOpen() { return !!this._pop; },
  showPopup(content, x, y, opts = {}) {
    this.closePopup();
    const pop = el('div', { class: 'popup ' + (opts.cls || '') });
    pop.append(content);
    pop.addEventListener('mousedown', e => { if (!e.target.closest('input, textarea')) e.preventDefault(); });
    pop.addEventListener('contextmenu', e => e.preventDefault());
    document.body.append(pop);
    const r = pop.getBoundingClientRect();
    const vw = innerWidth, vh = innerHeight;
    if (opts.anchor) {
      const a = opts.anchor.getBoundingClientRect();
      x = a.left; y = a.bottom + 2;
      if (opts.alignRight) x = a.right - r.width;
    }
    if (x + r.width > vw - 6) x = Math.max(6, vw - r.width - 6);
    if (y + r.height > vh - 6) y = Math.max(6, (opts.anchor ? opts.anchor.getBoundingClientRect().top - r.height - 2 : vh - r.height - 6));
    pop.style.left = x + 'px';
    pop.style.top = y + 'px';
    this._pop = { el: pop, onClose: opts.onClose };
    return pop;
  },

  /* items: {label, icon, key, action, disabled, danger, checked} | '-' | {head} | {colors:[...], action} */
  menu(items, x, y, opts = {}) {
    const box = el('div');
    for (const it of items) {
      if (!it) continue;
      if (it === '-') { box.append(el('div', { class: 'msep' })); continue; }
      if (it.head) { box.append(el('div', { class: 'mhead', text: it.head })); continue; }
      if (it.colors) {
        const row = el('div', { class: 'mcolors' });
        const custom = (Store.ui && Store.ui.customColors || []).filter(c => !it.colors.includes(c)).slice(0, 6);
        for (const c of [...it.colors, ...custom]) {
          const b = el('button', { class: 'sw' + (c ? '' : ' none'), title: c || 'Keine Farbe', style: { background: c || '' } });
          b.addEventListener('click', () => { this.closePopup(); it.action(c); });
          row.append(b);
        }
        if (it.wheel !== false) {
          const wb = el('button', { class: 'sw wheel', title: 'Eigene Farbe (Farbrad) …' });
          wb.addEventListener('click', () => {
            const r = (this._pop && this._pop.el.getBoundingClientRect()) || { left: 200, top: 150 };
            this.colorWheel({ x: r.left, y: r.top }, it.current || null, (c) => it.action(c));
          });
          row.append(wb);
        }
        box.append(row);
        continue;
      }
      const m = el('div', { class: 'mi' + (it.disabled ? ' dis' : '') + (it.danger ? ' danger' : '') + (it.checked ? ' checked' : '') });
      m.innerHTML = `<span class="mi-ic">${it.icon && !it.checked ? icon(it.icon, 15) : ''}</span><span class="mi-label"></span>${it.key ? `<span class="mi-key">${escapeHtml(it.key)}</span>` : ''}`;
      m.querySelector('.mi-label').textContent = it.label;
      if (it.title) m.title = it.title;
      // Kontextmenüs (Seiten, Abschnitte, Notizbücher …) warten, bis alle Seiten geladen sind (1.30, sonst sofort)
      if (!it.disabled) m.addEventListener('click', () => { this.closePopup(); it.action && Store.gate(() => it.action()); });
      box.append(m);
    }
    return this.showPopup(box, x, y, opts);
  },

  /* PowerPoint-ähnlicher Farbwähler */
  colorPicker(anchor, opts, onPick) {
    const box = el('div', { class: 'cp' });
    const pick = (c) => { this.closePopup(); onPick(c); };
    if (opts.none !== false) {
      const m = el('div', { class: 'mi' }, el('span', { class: 'mi-ic', html: '<span class="sw none" style="display:inline-block;width:14px;height:14px"></span>' }), el('span', { class: 'mi-label', text: opts.noneLabel || 'Keine Farbe' }));
      m.addEventListener('click', () => pick(null));
      box.append(m);
    }
    if (opts.highlight) {
      box.append(el('div', { class: 'mhead', text: 'Hervorhebungsfarben' }));
      const g = el('div', { class: 'cp-grid' });
      for (const c of HIGHLIGHT_COLORS) g.append(el('button', { class: 'sw', title: c, style: { background: c }, onclick: () => pick(c) }));
      box.append(g);
    } else {
      box.append(el('div', { class: 'mhead', text: 'Designfarben' }));
      const g = el('div', { class: 'cp-grid' });
      for (const c of THEME_COLORS) g.append(el('button', { class: 'sw', title: c, style: { background: c }, onclick: () => pick(c) }));
      box.append(g);
      const s = el('div', { class: 'cp-grid shades' });
      for (const f of [0.8, 0.6, 0.4, -0.25, -0.5]) {
        for (const c of THEME_COLORS) {
          const v = (c === '#FFFFFF') ? shade('#FFFFFF', -((f > 0 ? 1 - f : -f) * 0.5 + 0.05)) : (c === '#000000' ? shade('#000000', f > 0 ? f * 0.9 : 0.5 + f * -0.2) : shade(c, f));
          s.append(el('button', { class: 'sw', title: v, style: { background: v, borderRadius: 0 }, onclick: () => pick(v) }));
        }
      }
      box.append(s);
      box.append(el('div', { class: 'mhead', text: 'Standardfarben' }));
      const g2 = el('div', { class: 'cp-grid' });
      for (const c of STANDARD_COLORS) g2.append(el('button', { class: 'sw', title: c, style: { background: c }, onclick: () => pick(c) }));
      box.append(g2);
    }
    const custom = (Store.ui && Store.ui.customColors) || [];
    if (custom.length) {
      box.append(el('div', { class: 'mhead', text: 'Eigene Farben' }));
      const g3 = el('div', { class: 'cp-grid' });
      for (const c of custom) g3.append(el('button', { class: 'sw', title: c, style: { background: c }, onclick: () => pick(c) }));
      box.append(g3);
    }
    const more = el('div', { class: 'mi', style: { marginTop: '6px' } });
    more.innerHTML = `<span class="mi-ic"><span class="sw wheel" style="display:inline-block;width:15px;height:15px"></span></span><span class="mi-label">Weitere Farben (Farbrad) …</span>`;
    more.addEventListener('click', () => this.colorWheel(anchor, opts.current || custom[0] || '#3a7bd5', (c) => onPick(c)));
    box.append(more);
    this.showPopup(box, 0, 0, { anchor });
  },

  /* ---------------------------------------------------------- Farbrad (eigene Farben) */
  colorWheel(anchor, initial, onPick, opts = {}) {
    const hex2rgb = (h) => { const m = /^#?([0-9a-f]{6})$/i.exec(h || ''); const n = m ? parseInt(m[1], 16) : 0x3a7bd5; return [n >> 16, (n >> 8) & 255, n & 255]; };
    const rgb2hex = (r, g, b) => '#' + [r, g, b].map(v => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, '0')).join('');
    const rgb2hsv = (r, g, b) => {
      r /= 255; g /= 255; b /= 255;
      const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
      let h = 0;
      if (d) h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
      return [(h * 60 + 360) % 360, mx ? d / mx : 0, mx];
    };
    const hsv2rgb = (h, s, v) => {
      const c = v * s, x = c * (1 - Math.abs((h / 60) % 2 - 1)), m = v - c;
      const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
      return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
    };
    let [h, s, v] = rgb2hsv(...hex2rgb(initial));
    const S = 176, R = S / 2;
    const box = el('div', { class: 'cw' });
    const wheel = el('canvas', { width: S, height: S, class: 'cw-wheel' });
    const knob = el('div', { class: 'cw-knob' });
    const wrap = el('div', { class: 'cw-wrap' }, wheel, knob);
    const bright = el('input', { type: 'range', min: 0, max: 100, class: 'cw-bright', title: 'Helligkeit' });
    const prevOld = el('span', { class: 'cw-sw', title: 'Bisher' }), prevNew = el('span', { class: 'cw-sw', title: 'Neu' });
    const hexIn = el('input', { type: 'text', class: 'cw-hex', spellcheck: 'false', maxlength: 7 });
    const rgbIn = ['R', 'G', 'B'].map(l => el('input', { type: 'number', min: 0, max: 255, class: 'cw-num', title: l }));
    prevOld.style.background = initial || 'transparent';
    const draw = () => {
      const ctx = wheel.getContext('2d');
      const img = ctx.createImageData(S, S);
      for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
        const dx = x - R + 0.5, dy = y - R + 0.5, d = Math.hypot(dx, dy);
        const i = (y * S + x) * 4;
        if (d > R) { img.data[i + 3] = 0; continue; }
        const hh = (Math.atan2(dy, dx) * 180 / Math.PI + 360) % 360;
        const [r, g, b] = hsv2rgb(hh, Math.min(1, d / R), v);
        img.data[i] = r; img.data[i + 1] = g; img.data[i + 2] = b;
        img.data[i + 3] = d > R - 1 ? Math.round((R - d) * 255) : 255;
      }
      ctx.putImageData(img, 0, 0);
    };
    const sync = (from) => {
      const [r, g, b] = hsv2rgb(h, s, v);
      const hx = rgb2hex(r, g, b);
      prevNew.style.background = hx;
      if (from !== 'hex') hexIn.value = hx.toUpperCase();
      if (from !== 'rgb') [r, g, b].forEach((c, i) => { rgbIn[i].value = Math.round(c); });
      if (from !== 'bright') bright.value = Math.round(v * 100);
      const a = h * Math.PI / 180;
      knob.style.left = (R + Math.cos(a) * s * R) + 'px';
      knob.style.top = (R + Math.sin(a) * s * R) + 'px';
      knob.style.background = hx;
      bright.style.setProperty('--bh', rgb2hex(...hsv2rgb(h, s, 1)));
    };
    let dragging = false;
    const at = (e) => {
      const r = wheel.getBoundingClientRect();
      const dx = e.clientX - r.left - R, dy = e.clientY - r.top - R;
      h = (Math.atan2(dy, dx) * 180 / Math.PI + 360) % 360;
      s = Math.min(1, Math.hypot(dx, dy) / R);
      if (v < 0.05) { v = 1; draw(); }
      sync();
    };
    wrap.addEventListener('pointerdown', (e) => { dragging = true; wrap.setPointerCapture(e.pointerId); at(e); });
    wrap.addEventListener('pointermove', (e) => { if (dragging) at(e); });
    wrap.addEventListener('pointerup', () => { dragging = false; });
    bright.addEventListener('input', () => { v = bright.value / 100; draw(); sync('bright'); });
    hexIn.addEventListener('input', () => { const m = /^#?([0-9a-f]{6})$/i.exec(hexIn.value.trim()); if (m) { [h, s, v] = rgb2hsv(...hex2rgb('#' + m[1])); draw(); sync('hex'); } });
    rgbIn.forEach(inp => inp.addEventListener('input', () => { const c = rgbIn.map(x => clamp(+x.value || 0, 0, 255)); [h, s, v] = rgb2hsv(...c); draw(); sync('rgb'); }));
    for (const inp of [hexIn, ...rgbIn]) inp.addEventListener('keydown', (e) => {
      e.stopPropagation();
      // Enter nicht an das Textfeld weiterreichen (sonst ersetzt es den markierten Text)
      if (e.key === 'Enter') { e.preventDefault(); setTimeout(ok, 0); }
      if (e.key === 'Escape') { e.preventDefault(); this.closePopup(); }
    });
    const ok = () => {
      const hx = rgb2hex(...hsv2rgb(h, s, v));
      if (Store.ui) { Store.ui.customColors = [hx, ...(Store.ui.customColors || []).filter(c => c !== hx)].slice(0, 10); if (typeof UiState !== 'undefined') UiState.saveSoon(); }
      this.closePopup();
      onPick(hx);
    };
    const basics = el('div', { class: 'cw-basics' });
    for (const c of ['#000000', '#7f7f7f', '#ffffff', '#c00000', '#ff0000', '#ffc000', '#ffff00', '#92d050', '#00b050', '#00b0f0', '#0070c0', '#7030a0']) {
      basics.append(el('button', { class: 'sw', title: c, style: { background: c }, onclick: () => { [h, s, v] = rgb2hsv(...hex2rgb(c)); draw(); sync(); } }));
    }
    box.append(
      el('div', { class: 'mhead', text: opts.title || 'Farbe wählen' }),
      el('div', { class: 'cw-main' }, wrap, el('div', { class: 'cw-side' },
        el('div', { class: 'cw-prev' }, prevOld, prevNew),
        el('label', { class: 'cw-l' }, 'Hex', hexIn),
        el('div', { class: 'cw-rgb' }, ...rgbIn.map((x, i) => el('label', { class: 'cw-l' }, 'RGB'[i], x))))),
      el('div', { class: 'cw-brow' }, el('span', { text: 'Helligkeit' }), bright),
      basics,
      el('div', { class: 'dlg-btns', style: { marginTop: '8px' } },
        el('button', { class: 'btn', text: 'Abbrechen', onclick: () => this.closePopup() }),
        el('button', { class: 'btn primary', text: 'Übernehmen', onclick: ok })));
    draw();
    sync();
    if (anchor && anchor.nodeType) this.showPopup(box, 0, 0, { anchor });
    else this.showPopup(box, (anchor && anchor.x) || 200, (anchor && anchor.y) || 150);
    setTimeout(() => hexIn.select(), 20);
  },

  /* ---------------------------------------------------------- Dialoge */
  dialog(build, opts = {}) {
    return new Promise((resolve) => {
      const back = el('div', { class: 'dlg-back' });
      const d = el('div', { class: 'dlg' + (opts.wide ? ' wide' : '') });
      back.append(d);
      let done = false;
      const close = (v) => { if (done) return; done = true; back.remove(); resolve(v); if (opts.restore) opts.restore(); };
      build(d, close);
      back.addEventListener('mousedown', e => { if (e.target === back) close(null); });
      back.addEventListener('keydown', e => { if (e.key === 'Escape') { e.stopPropagation(); close(null); } });
      document.body.append(back);
      const f = d.querySelector('[autofocus]') || d.querySelector('input, .btn.primary');
      if (f) setTimeout(() => { f.focus(); if (f.select) f.select(); }, 20);
    });
  },
  prompt(title, value = '', opts = {}) {
    return this.dialog((d, close) => {
      d.append(el('h2', { text: title }));
      if (opts.text) d.append(el('p', { text: opts.text }));
      const inp = el('input', { type: opts.password ? 'password' : 'text', value, placeholder: opts.placeholder || '' });
      inp.value = value;
      inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); close(inp.value); } });
      d.append(inp);
      d.append(el('div', { class: 'dlg-btns' },
        el('button', { class: 'btn', text: 'Abbrechen', onclick: () => close(null) }),
        el('button', { class: 'btn primary', text: opts.ok || 'OK', onclick: () => close(inp.value) })));
    }, opts);
  },
  confirm(title, text, opts = {}) {
    return this.dialog((d, close) => {
      d.append(el('h2', { text: title }));
      if (text) d.append(el('p', { text }));
      d.append(el('div', { class: 'dlg-btns' },
        el('button', { class: 'btn', text: 'Abbrechen', onclick: () => close(false) }),
        el('button', { class: 'btn ' + (opts.danger ? 'danger' : 'primary'), text: opts.ok || 'OK', autofocus: true, onclick: () => close(true) })));
    }).then(v => !!v);
  },
  info(title, html, opts = {}) {
    return this.dialog((d, close) => {
      d.append(el('h2', { text: title }));
      d.append(el('div', { html }));
      d.append(el('div', { class: 'dlg-btns' }, el('button', { class: 'btn primary', text: 'Schliessen', onclick: () => close(true) })));
    }, opts);
  },

  lightbox(src) {
    const lb = el('div', { class: 'lightbox' }, el('img', { src }));
    lb.addEventListener('click', () => lb.remove());
    document.body.append(lb);
  },

  conflict() {
    if (Store.readOnly) return;
    Store.readOnly = true;
    const d = el('div', { class: 'conflict' }, el('div', { class: 'dlg' },
      el('h2', { text: 'In einem anderen Fenster geöffnet' }),
      el('p', { text: 'KnowledgeTree wurde in einem anderen Fenster oder Tab neu geöffnet. Damit nichts überschrieben wird, speichert dieses hier nicht mehr. Arbeite im neuen weiter – oder lade dieses neu.' }),
      el('div', { class: 'dlg-btns' }, el('button', { class: 'btn primary', text: 'Neu laden', onclick: () => location.reload() }))));
    document.body.append(d);
  },

  /* ---------------------------------------------------------- Statusanzeigen */
  saveState(s, msg) {
    const sb = $('#sb-save'), q = $('#qat-save');
    sb.classList.toggle('err', s === 'error');
    q.classList.toggle('saving', s === 'saving' || s === 'pending');
    let txt = { saved: 'Alle Änderungen gespeichert', pending: 'Änderungen …', saving: 'Speichert …', error: 'Speichern fehlgeschlagen – neuer Versuch …' }[s] || '';
    // interaktive Datei (1.25): „gespeichert“ heisst hier nur „in diesem Fenster“
    if (typeof Backend !== 'undefined' && Backend.kind === 'datei' && s !== 'error') txt = Backend.dirty || s !== 'saved' ? 'Änderungen nur in diesem Fenster – Datei speichern (Strg+S)' : 'Keine ungespeicherten Änderungen';
    sb.innerHTML = (s === 'saved' ? icon('check', 13) : s === 'error' ? icon('alert', 13) : icon('save', 13)) + '<span></span>';
    sb.querySelector('span').textContent = txt;
    sb.title = msg || txt;
    q.title = txt + ' (Strg+S)';
  },
  updateUndo() {
    $('#qat-undo').disabled = !Hist.undo.length;
    $('#qat-undo-list').disabled = !Hist.undo.length;
    $('#qat-redo').disabled = !Hist.redo.length;
    const u = Hist.undo[Hist.undo.length - 1], r = Hist.redo[Hist.redo.length - 1];
    $('#qat-undo').title = u ? `Rückgängig: ${u.label} (Strg+Z)` : 'Rückgängig (Strg+Z)';
    $('#qat-redo').title = r ? `Wiederholen: ${r.label} (Strg+Y)` : 'Wiederholen (Strg+Y)';
    Ribbon.refreshSoon();
  },
  /* Liste der letzten Aktionen wie in Office */
  historyList(anchor) {
    const box = el('div', { class: 'hist-pop list-pop' });
    const foot = el('div', { class: 'hist-foot', text: `${Hist.undo.length} von max. ${Hist.max} Schritten gespeichert` });
    const items = [];
    for (let i = Hist.undo.length - 1; i >= 0; i--) {
      const e = Hist.undo[i];
      const m = el('div', { class: 'mi' });
      const t = new Date(e.t).toLocaleTimeString('de-CH', { hour: '2-digit', minute: '2-digit' });
      m.innerHTML = `<span class="mi-ic">${icon('undo', 13)}</span><span class="mi-label"></span><span class="mi-key">${t}</span>`;
      m.querySelector('.mi-label').textContent = e.label;
      const idx = i;
      m.addEventListener('mouseenter', () => { items.forEach(x => x.el.classList.toggle('hl', x.idx >= idx)); const n = Hist.undo.length - idx; foot.textContent = `${n} Schritt${n === 1 ? '' : 'e'} rückgängig machen`; });
      m.addEventListener('click', () => { this.closePopup(); Hist.undoTo(idx); });
      items.push({ el: m, idx });
      box.append(m);
    }
    box.append(foot);
    this.showPopup(box, 0, 0, { anchor });
  },
};

/* Popups schliessen bei Klick daneben */
document.addEventListener('pointerdown', (e) => {
  UI._nativeDialog = false;
  if (UI._pop && !e.target.closest('.popup')) {
    UI._justClosed = true;
    UI.closePopup();
    setTimeout(() => { UI._justClosed = false; }, 0);
  }
}, true);
window.addEventListener('blur', () => { if (!UI._nativeDialog) UI.closePopup(); });
// nur bei geänderter Breite schliessen: auf dem Handy ändert sich die Höhe ständig (Adressleiste, Bildschirmtastatur)
let _popW = innerWidth;
window.addEventListener('resize', () => { if (innerWidth !== _popW) { _popW = innerWidth; UI.closePopup(); } });
