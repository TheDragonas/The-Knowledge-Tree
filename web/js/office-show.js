'use strict';
/* Vorführmodus und Referentenansicht (1.62) für PowerPoint-Seiten.
 *
 * Eigene Darstellung im Vollbild (nicht die Zeichenfläche): jede Folie wird aus den Seitendaten gebaut – Hintergrund-
 * bild der Folie, Felder (gleiche CSS-Klassen wie auf der Fläche, Schriftfarbe über Canvas.applyInk), Bilder, Formen/
 * Freihand als SVG (Draw.markup) – in Folien-Grösse und dann per CSS-Transform auf den Bildschirm skaliert (Text
 * bleibt scharf). Referentenansicht: aktuelle Folie links, rechts nächste Folie, Notizen, Uhr und Zeit.
 * Tasten wie PowerPoint: → ↓ Leertaste Bild↓ Enter N = weiter, ← ↑ Bild↑ Rücktaste P = zurück, Pos1/Ende,
 * Zahl + Enter = Folie, B/. = schwarz, W/, = weiss, Esc = beenden; Klick = weiter, Rechtsklick = zurück. */
const Show = {
  on: false, i: 0, p: null, frames: [], presenter: false, t0: 0, typed: '', blank: '',
  start(from = 'begin', opts = {}) {
    clearTimeout(this._adv);
    const p = OfficePages.page('pptx');
    if (!p || this.on) return;
    const frames = OfficePpt.frames(p);
    if (!frames.length) { UI.toast('Keine Folien auf dieser Seite'); return; }
    Hist.flushPending && Hist.flushPending();
    if (Canvas.editing) Canvas.stopEditing();
    this.p = p; this.frames = frames; this.on = true; this.t0 = Date.now(); this.typed = ''; this.blank = '';
    this.presenter = !!Store.ui.showPresenter;
    const cur = opts.frame || (from === 'here' ? OfficePpt.currentFrame() : null);
    this.i = Math.max(0, cur ? frames.indexOf(cur) : 0);
    if (!cur && frames[this.i] && frames[this.i].ox.hide) { const j = frames.findIndex(f => !f.ox.hide); if (j >= 0) this.i = j; }
    const ov = this.ov = el('div', { class: 'kt-show' + (this.presenter ? ' presenter' : '') + (opts.window ? ' windowed' : ''), tabindex: '-1' });
    this.tool = null;
    ov.innerHTML = `<div class="sh-main"><div class="sh-stage"></div><canvas class="sh-ink"></canvas><div class="sh-blank"></div><i class="sh-laser" hidden></i></div>` +
      `<div class="sh-side"><div class="sh-h">Nächste Folie</div><div class="sh-next"></div><div class="sh-h">Notizen</div><div class="sh-notes"></div>` +
      `<div class="sh-clock"><b class="sh-time">0:00</b><span class="sh-now"></span></div></div>` +
      `<div class="sh-bar"><button type="button" data-a="prev" title="Zurück (←)">‹</button><span class="sh-n"></span><button type="button" data-a="next" title="Weiter (→)">›</button>` +
      `<button type="button" data-a="laser" title="Laserpointer (Strg+L)">Laser</button><button type="button" data-a="pen" title="Stift (Strg+P) – auf die Folie zeichnen">Stift</button><button type="button" data-a="erase" title="Freihand löschen (E)">Löschen</button>` +
      `<button type="button" data-a="pres" title="Referentenansicht ein/aus">Referent</button><button type="button" data-a="end" title="Beenden (Esc)">✕</button></div>`;
    document.body.append(ov);
    ov.addEventListener('click', (e) => {
      const a = e.target.closest('[data-a]');
      if (a) { e.stopPropagation(); this.act(a.dataset.a); return; }
      if (e.target.closest('.sh-side')) return;
      if (this.tool === 'pen') return;   // Stift: Klick zeichnet, blättert nicht (1.73)
      this.next();
    });
    ov.addEventListener('contextmenu', (e) => { e.preventDefault(); this.prev(); });
    let wt = 0;
    ov.addEventListener('wheel', (e) => { if (e.target.closest('.sh-notes')) return; e.preventDefault(); const now = Date.now(); if (now - wt < 350) return; wt = now; if (e.deltaY > 0) this.next(); else this.prev(); }, { passive: false });
    this.onKey = (e) => this.key(e);
    window.addEventListener('keydown', this.onKey, true);
    this.onResize = () => this.layout();
    window.addEventListener('resize', this.onResize);
    this.onFs = () => { if (!document.fullscreenElement && this.on && this._fs) this.end(); };
    document.addEventListener('fullscreenchange', this.onFs);
    this._fs = false;
    if (!opts.window) { try { const r = ov.requestFullscreen && ov.requestFullscreen(); if (r && r.then) r.then(() => { this._fs = true; }).catch(() => {}); } catch (e) { /* ohne Vollbild weiter */ } }
    this.inkInit();
    this.tick = setInterval(() => this.clock(), 1000);
    ov.focus();
    this.go(this.i, true);
  },
  end() {
    if (!this.on) return;
    this.on = false;
    clearTimeout(this._adv);
    window.removeEventListener('keydown', this.onKey, true);
    window.removeEventListener('resize', this.onResize);
    document.removeEventListener('fullscreenchange', this.onFs);
    clearInterval(this.tick);
    if (document.fullscreenElement) { try { document.exitFullscreen(); } catch (e) { /* */ } }
    this.ov && this.ov.remove();
    this.ov = null;
    // zuletzt gezeigte Folie auf der Fläche zeigen
    const f = this.frames[this.i];
    if (f && Canvas.page === this.p) Canvas.scrollToBox(f.id);
  },
  /* Laserpointer und Stift beim Vortragen (1.73, wie PowerPoint): Strg+L, Strg+P, E = löschen, Strg+A = Pfeil */
  inkInit() {
    const ov = this.ov, cv = ov.querySelector('.sh-ink'), dot = ov.querySelector('.sh-laser');
    const fit = () => { const r = ov.querySelector('.sh-main').getBoundingClientRect(); cv.width = Math.round(r.width); cv.height = Math.round(r.height); };
    fit(); this._inkFit = fit;
    let last = null;
    ov.addEventListener('pointermove', (e) => {
      if (this.tool === 'laser') { const r = ov.querySelector('.sh-main').getBoundingClientRect(); dot.hidden = false; dot.style.left = (e.clientX - r.left) + 'px'; dot.style.top = (e.clientY - r.top) + 'px'; }
      if (this.tool === 'pen' && last && e.buttons) { const r = cv.getBoundingClientRect(), g = cv.getContext('2d'); g.strokeStyle = '#e81123'; g.lineWidth = 3; g.lineCap = 'round'; g.beginPath(); g.moveTo(last.x, last.y); g.lineTo(e.clientX - r.left, e.clientY - r.top); g.stroke(); last = { x: e.clientX - r.left, y: e.clientY - r.top }; }
    });
    ov.addEventListener('pointerdown', (e) => { if (this.tool !== 'pen' || e.target.closest('.sh-bar, .sh-side')) return; const r = cv.getBoundingClientRect(); last = { x: e.clientX - r.left, y: e.clientY - r.top }; });
    ov.addEventListener('pointerup', () => { last = null; });
  },
  setTool(t) {
    this.tool = this.tool === t ? null : t;
    if (!this.ov) return;
    this.ov.classList.toggle('tool-laser', this.tool === 'laser'); this.ov.classList.toggle('tool-pen', this.tool === 'pen');
    this.ov.querySelector('.sh-laser').hidden = this.tool !== 'laser';
    for (const k of ['laser', 'pen']) { const b = this.ov.querySelector(`[data-a="${k}"]`); if (b) b.classList.toggle('on', this.tool === k); }
  },
  erase() { const cv = this.ov && this.ov.querySelector('.sh-ink'); if (cv) cv.getContext('2d').clearRect(0, 0, cv.width, cv.height); },
  act(a) {
    if (a === 'laser' || a === 'pen') { this.setTool(a); return; }
    if (a === 'erase') { this.erase(); return; }
    if (a === 'next') this.next();
    else if (a === 'prev') this.prev();
    else if (a === 'end') this.end();
    else if (a === 'pres') { this.presenter = !this.presenter; Store.ui.showPresenter = this.presenter; UiState.saveSoon(); this.ov.classList.toggle('presenter', this.presenter); this.go(this.i, true); }
  },
  key(e) {
    if (!this.on) return;
    const k = e.key;
    e.stopPropagation();
    if ((e.ctrlKey || e.metaKey) && /^[lLpPaA]$/.test(k)) { e.preventDefault(); this.setTool(/[lL]/.test(k) ? 'laser' : /[pP]/.test(k) ? 'pen' : this.tool); if (/[aA]/.test(k) && this.tool) this.setTool(this.tool); return; }
    if ((k === 'e' || k === 'E') && !e.ctrlKey) { e.preventDefault(); this.erase(); return; }
    if (k === 'Escape' && this.tool) { e.preventDefault(); this.setTool(this.tool); return; }
    if (/^\d$/.test(k)) { this.typed += k; e.preventDefault(); return; }
    const done = () => e.preventDefault();
    if (k === 'Enter' && this.typed) { this.go(+this.typed - 1); this.typed = ''; return done(); }
    this.typed = '';
    if (this.blank && !/^(Escape)$/.test(k)) { this.setBlank(''); return done(); }
    if (['ArrowRight', 'ArrowDown', 'PageDown', ' ', 'Enter', 'n', 'N'].includes(k)) { this.next(); return done(); }
    if (['ArrowLeft', 'ArrowUp', 'PageUp', 'Backspace', 'p', 'P'].includes(k)) { this.prev(); return done(); }
    if (k === 'Home') { this.go(0); return done(); }
    if (k === 'End') { this.go(this.frames.length - 1); return done(); }
    if (k === 'Escape') { this.end(); return done(); }
    if (k === 'b' || k === 'B' || k === '.') { this.setBlank('black'); return done(); }
    if (k === 'w' || k === 'W' || k === ',') { this.setBlank('white'); return done(); }
    if (k === 'F5' || k === 'F11') return done();
  },
  setBlank(c) { this.blank = c; const b = this.ov.querySelector('.sh-blank'); b.className = 'sh-blank' + (c ? ' on ' + c : ''); },
  /* weiter: nächster Animationsschritt, sonst nächste Folie (wie PowerPoint) */
  next() { if (this.step < this.steps.length) this.play(this.steps[this.step++]); else this.go(this.vis(this.i + 1, 1)); },
  prev() {
    if (this.step > (this.autoStep ? 1 : 0)) { const st = this.steps[--this.step]; for (const it of st) { const e = this.elOf(it.b); if (e) { e.getAnimations().forEach(a => a.cancel()); e.style.visibility = OfficeAnim.clsOf(it.b.anim.fx) === 'entr' ? 'hidden' : 'visible'; e.style.transform = ''; } } return; }
    const j = this.vis(this.i - 1, -1);
    if (j >= 0 && j < this.i) this.go(j, false, true);
  },
  /* nächste sichtbare Folie (ausgeblendete überspringen, 1.72); Endlosschleife: nach der letzten wieder die erste */
  vis(i, d) {
    const n = this.frames.length;
    for (let k = i; k >= 0 && k < n; k += d) if (!this.frames[k].ox.hide) return k;
    if (d > 0 && this.p && this.p.office.loop) { for (let k = 0; k < n; k++) if (!this.frames[k].ox.hide) return k; }
    return d > 0 ? n : -1;
  },
  steps: [], step: 0,
  go(i, force = false, reveal = false) {
    if (!this.on) return;
    if (i >= this.frames.length) { if (!force) { this.end(); return; } i = this.frames.length - 1; }
    i = Math.max(0, i);
    if (i === this.i && !force && this._shown) return;
    const forward = i > this.i || !this._shown;
    if (i !== this.i) this.erase();   // Freihand gehört zur Folie (1.73)
    this.i = i; this._shown = true;
    const stage = this.ov.querySelector('.sh-stage');
    const f = this.frames[i];
    const wrap = el('div', { class: 'sh-wrap' });
    const slide = this.render(f);
    wrap.append(slide);
    this.cur = slide;
    // Animationsschritte: Klick beginnt einen neuen Schritt, Mit/Nach gehören dazu (Nach = nach dem Vorherigen)
    this.steps = Show.stepsOf(f, this.p);
    this.step = 0; this.autoStep = false;
    for (const st of this.steps) for (const it of st) { const e = this.elOf(it.b); const c = OfficeAnim.clsOf(it.b.anim.fx); if (e) e.style.visibility = c === 'emph' ? 'visible' : c === 'exit' ? (reveal ? 'hidden' : 'visible') : reveal ? 'visible' : 'hidden'; }
    if (reveal) this.step = this.steps.length;
    const old = [...stage.children];
    stage.append(wrap);
    this.layout();
    const tr = (f.ox && f.ox.tr) || { type: 'none' };
    const done = () => { old.forEach(o => o.remove()); if (!reveal && this.steps.length && this.steps[0][0].b.anim.start !== 'click') { this.autoStep = true; this.next(); } this.autoAdv(f); };
    if (forward && old.length && tr.type && tr.type !== 'none' && !this._noTrans) Show.transition(wrap, old[old.length - 1], tr, done); else done();
    const nx = this.ov.querySelector('.sh-next');
    nx.innerHTML = '';
    if (this.presenter) {
      if (this.frames[i + 1]) { const w2 = el('div', { class: 'sh-wrap' }); w2.append(this.render(this.frames[i + 1])); nx.append(w2); } else nx.append(el('div', { class: 'sh-endnote', text: 'Ende der Präsentation' }));
      const nb = this.p.boxes.find(b => b.ox && b.ox.k === 'notiz' && b.ox.f === this.frames[i].id);
      const notes = this.ov.querySelector('.sh-notes');
      notes.innerHTML = nb ? nb.html : '<span class="sh-empty">Keine Notizen</span>';
      hydrateBox(notes);
    }
    this.ov.querySelector('.sh-n').textContent = `${i + 1} / ${this.frames.length}`;
    this.layout();
    this.clock();
  },
  elOf(b) { return this.cur && this.cur.querySelector(`[data-bid="${b.id}"]`); },
  /* „Nach“-Zeit des Übergangs (1.72): nach Ablauf nächster Schritt bzw. nächste Folie */
  autoAdv(f) {
    clearTimeout(this._adv);
    const t = f && f.ox.tr && f.ox.tr.adv;
    if (!t || !this.on) return;
    const i = this.i;
    this._adv = setTimeout(() => { if (this.on && this.i === i && !this.blank) { this.next(); if (this.i === i) this.autoAdv(f); } }, t);
  },
  stepsOf(f, p) {
    const items = OfficePpt.itemsOf(f, p).boxes.filter(b => b.anim && b.anim.fx && b.anim.fx !== 'none').sort((a, b) => a.anim.n - b.anim.n);
    const steps = [];
    let t = 0, prevEnd = 0;
    for (const b of items) {
      const a = b.anim, dur = Math.max(1, a.dur || 500);
      if (a.start === 'click' || !steps.length) { steps.push([]); t = 0; prevEnd = 0; }
      const delay = a.start === 'after' ? prevEnd : t;
      steps[steps.length - 1].push({ b, delay, dur });
      t = delay; prevEnd = Math.max(prevEnd, delay + dur);
    }
    return steps;
  },
  /* einen Schritt abspielen (Eingangseffekte) – auch für die Vorschau auf der Fläche */
  play(step, root) {
    for (const it of step) {
      const e = root ? root.querySelector(`[data-bid="${it.b.id}"]`) : this.elOf(it.b);
      if (!e) continue;
      Show.effect(e, it.b.anim.fx, it.dur, it.delay);
    }
  },
  effect(e, fx, dur, delay) {
    const o = { duration: Math.max(1, dur), delay, fill: 'backwards', easing: 'ease-out' };
    // Hervorheben / Beenden (1.72)
    if (/^e:/.test(fx)) {
      if (fx === 'e:spin') e.animate([{ transform: 'rotate(0)' }, { transform: 'rotate(360deg)' }], { ...o, fill: 'none' });
      else if (fx === 'e:grow') { e.animate([{ transform: 'none' }, { transform: 'scale(1.5)' }], { ...o, fill: 'forwards' }); }
      else e.animate([{ transform: 'none' }, { transform: 'scale(1.05)' }, { transform: 'none' }], { ...o, fill: 'none' });
      return;
    }
    if (/^x:/.test(fx)) {
      const h0 = (e.parentElement && e.parentElement._h) || 540;
      const fo = { ...o, fill: 'forwards' };
      if (fx === 'x:fade') e.animate([{ opacity: 1 }, { opacity: 0 }], fo);
      else if (fx === 'x:fly') e.animate([{ transform: 'none' }, { transform: `translateY(${h0 - e.offsetTop + 20}px)` }], fo);
      else if (fx === 'x:zoom') e.animate([{ transform: 'none', opacity: 1 }, { transform: 'scale(0)', opacity: 0 }], fo);
      setTimeout(() => { e.getAnimations().forEach(a => a.cancel()); e.style.visibility = 'hidden'; }, delay + (fx === 'x:disappear' ? 0 : dur));
      return;
    }
    setTimeout(() => { e.style.visibility = 'visible'; }, delay);
    const h = (e.parentElement && e.parentElement._h) || 540;
    if (fx === 'fade') e.animate([{ opacity: 0 }, { opacity: 1 }], o);
    else if (fx === 'fly') e.animate([{ transform: `translateY(${h - e.offsetTop + 20}px)` }, { transform: 'none' }], o);
    else if (fx === 'zoom') e.animate([{ transform: 'scale(0)', opacity: 0 }, { transform: 'none', opacity: 1 }], o);
    else if (fx === 'wipe') e.animate([{ clipPath: 'inset(100% 0 0 0)' }, { clipPath: 'inset(0 0 0 0)' }], o);
  },
  /* Folienübergang: neue Folie (wrap) über die alte */
  transition(wrap, old, tr, done) {
    const o = { duration: Math.max(150, tr.dur || 700), easing: 'ease-in-out', fill: 'both' };
    let a;
    // Richtung (1.72): l = nach links (neue Folie kommt von rechts), r, u, d
    const dir = tr.dir || (OfficeAnim.DIRS[tr.type] ? OfficeAnim.DIRS[tr.type][0][0] : 'l');
    const from = { l: 'translateX(100%)', r: 'translateX(-100%)', u: 'translateY(100%)', d: 'translateY(-100%)' }, away = { l: 'translateX(-100%)', r: 'translateX(100%)', u: 'translateY(-100%)', d: 'translateY(100%)' };
    const wipe = { r: 'inset(0 100% 0 0)', l: 'inset(0 0 0 100%)', d: 'inset(0 0 100% 0)', u: 'inset(100% 0 0 0)' };
    const bars = (vert, n) => { const st = []; for (let k = 0; k <= n; k++) st.push({ clipPath: vert ? `inset(0 ${100 - (k / n) * 100}% 0 0)` : `inset(0 0 ${100 - (k / n) * 100}% 0)` }); return st; };
    if (tr.type === 'fade') a = wrap.animate([{ opacity: 0 }, { opacity: 1 }], o);
    else if (tr.type === 'push') { a = wrap.animate([{ transform: from[dir] || from.l }, { transform: 'none' }], o); old.animate([{ transform: 'none' }, { transform: away[dir] || away.l }], o); }
    else if (tr.type === 'wipe') a = wrap.animate([{ clipPath: wipe[dir] || wipe.r }, { clipPath: 'inset(0 0 0 0)' }], o);
    else if (tr.type === 'split') { const [or, io] = String(dir).split('-'); const c0 = or === 'horz' ? 'inset(50% 0 50% 0)' : 'inset(0 50% 0 50%)'; a = io === 'in' ? (old.style.zIndex = 2, old.animate([{ clipPath: 'inset(0 0 0 0)' }, { clipPath: c0 }], o)) : wrap.animate([{ clipPath: c0 }, { clipPath: 'inset(0 0 0 0)' }], o); }
    else if (tr.type === 'cover') a = wrap.animate([{ transform: from[dir] || from.l }, { transform: 'none' }], o);
    else if (tr.type === 'pull') { old.style.zIndex = 2; a = old.animate([{ transform: 'none' }, { transform: away[dir] || away.l }], o); }   // alte Folie gleitet weg, die neue liegt darunter
    else if (tr.type === 'wheel') a = wrap.animate([{ transform: 'rotate(-90deg) scale(.4)', opacity: 0 }, { transform: 'none', opacity: 1 }], o);
    else if (tr.type === 'randomBar' || tr.type === 'blinds' || tr.type === 'strips') a = wrap.animate(bars(dir === 'vert', 8), { ...o, easing: 'steps(8, end)' });
    else if (tr.type === 'checker') a = wrap.animate([{ opacity: 0 }, { opacity: 1 }], { ...o, easing: 'steps(6, end)' });
    else if (tr.type === 'plus') a = wrap.animate([{ clipPath: 'polygon(45% 0,55% 0,55% 45%,100% 45%,100% 55%,55% 55%,55% 100%,45% 100%,45% 55%,0 55%,0 45%,45% 45%)' }, { clipPath: 'polygon(0 0,100% 0,100% 0,100% 0,100% 100%,100% 100%,100% 100%,0 100%,0 100%,0 100%,0 0,0 0)' }], o);
    else if (tr.type === 'diamond') a = wrap.animate([{ clipPath: 'polygon(50% 50%,50% 50%,50% 50%,50% 50%)' }, { clipPath: 'polygon(50% -50%,150% 50%,50% 150%,-50% 50%)' }], o);
    else if (tr.type === 'wedge') a = wrap.animate([{ clipPath: 'polygon(50% 50%,50% 0,50% 0)' }, { clipPath: 'polygon(50% 50%,-100% 0,200% 0,200% 200%,-100% 200%,-100% 0)' }], o);
    else if (tr.type === 'newsflash') a = wrap.animate([{ transform: 'rotate(720deg) scale(0)' }, { transform: 'none' }], o);
    else if (tr.type === 'circle') a = wrap.animate([{ clipPath: 'circle(0% at 50% 50%)' }, { clipPath: 'circle(75% at 50% 50%)' }], o);
    else if (tr.type === 'dissolve') a = wrap.animate([{ opacity: 0 }, { opacity: 1 }], { ...o, easing: 'steps(9, end)' });
    else if (tr.type === 'zoom') a = wrap.animate([{ transform: 'scale(.25)', opacity: 0 }, { transform: 'none', opacity: 1 }], o);
    if (!a) { done(); return; }
    a.onfinish = () => { wrap.getAnimations().forEach(x => x.cancel()); if (tr.type === 'pull') old.style.visibility = 'hidden'; done(); };
  },
  /* Vorschau auf der Fläche (Register Übergänge/Animationen): Folie an ihrer Stelle abspielen */
  previewAt(f, p, what = 'all') {
    const r = Canvas.rects.get(f.id);
    if (!r || !Canvas.vp) return;
    const sz = OfficePpt.size(p), z = Canvas.view.z, vr = Canvas.vp.getBoundingClientRect();
    const host = el('div', { class: 'sh-preview' });
    Object.assign(host.style, { left: (vr.left + Canvas.view.x + (f.x + 11) * z) + 'px', top: (vr.top + Canvas.view.y + (f.y + 13) * z) + 'px', width: sz.w * z + 'px', height: sz.h * z + 'px' });
    const wrap = el('div', { class: 'sh-wrap' });
    const slide = this.render(f, p);
    slide.style.transform = `scale(${z})`;
    wrap.append(slide); host.append(wrap);
    document.body.append(host);
    const steps = this.stepsOf(f, p);
    if (what !== 'trans') for (const st of steps) for (const it of st) { const e = slide.querySelector(`[data-bid="${it.b.id}"]`); if (e) e.style.visibility = 'hidden'; }
    const tr = (f.ox && f.ox.tr) || { type: 'none' };
    let t = 0;
    const runSteps = () => {
      if (what === 'trans') { setTimeout(() => host.remove(), 300); return; }
      for (const st of steps) { setTimeout(() => this.play(st, slide), t); t += Math.max(...st.map(x => x.delay + x.dur)) + 250; }
      setTimeout(() => host.remove(), t + 400);
    };
    if (what !== 'anim' && tr.type !== 'none') { const ghost = el('div', { class: 'sh-wrap sh-ghost' }); host.prepend(ghost); this.transition(wrap, ghost, tr, runSteps); } else runSteps();
  },
  layout() {
    if (!this.on) return;
    if (this._inkFit) this._inkFit();
    const fit = (host) => {
      for (const st of host.querySelectorAll('.sh-slide')) {
        if (!st._w) continue;
        const W = host.clientWidth, H = host.clientHeight;
        const k = Math.min(W / st._w, H / st._h);
        st.style.transform = `translate(${(W - st._w * k) / 2}px,${(H - st._h * k) / 2}px) scale(${k})`;
      }
    };
    fit(this.ov.querySelector('.sh-stage'));
    if (this.presenter) fit(this.ov.querySelector('.sh-next'));
  },
  clock() {
    if (!this.on) return;
    const s = Math.floor((Date.now() - this.t0) / 1000);
    this.ov.querySelector('.sh-time').textContent = `${Math.floor(s / 3600) ? Math.floor(s / 3600) + ':' : ''}${String(Math.floor(s / 60) % 60).padStart(Math.floor(s / 3600) ? 2 : 1, '0')}:${String(s % 60).padStart(2, '0')}`;
    this.ov.querySelector('.sh-now').textContent = new Date().toLocaleTimeString('de-CH', { hour: '2-digit', minute: '2-digit' });
  },
  /* eine Folie als Element in Folien-Grösse (px der Seite) */
  render(f, page) {
    const p = page || this.p, sz = OfficePpt.size(p);
    const w = Math.round(sz.w), h = Math.round(sz.h);
    const st = el('div', { class: 'sh-slide' });
    st._w = w; st._h = h;
    st.style.width = w + 'px'; st.style.height = h + 'px';
    st._h = h;
    const ox = f.x + 11, oy = f.y + 13;   // Inhalts-Ursprung der Folie
    const bgImg = f.images[0];
    if (bgImg) { const im = el('img', { class: 'sh-bg', alt: '' }); Backend.setImg(im, bgImg.src); st.append(im); }
    const it = OfficePpt.itemsOf(f, p);
    // Formen und Freihand unter den Feldern (Ebene „unten“) bzw. darüber
    const draws = p.drawings.filter(d => { const b = typeof DG !== 'undefined' ? DG.bbox(d) : null; return b && b.x >= f.x && b.y >= f.y && b.x < f.x + sz.w + 22 && b.y < f.y + sz.h + 13; });
    const svg = (list, cls) => { if (!list.length) return; const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); s.setAttribute('class', 'sh-draw ' + cls); s.setAttribute('viewBox', `${ox} ${oy} ${w} ${h}`); s.setAttribute('width', w); s.setAttribute('height', h); s.innerHTML = list.map(d => `<g>${Draw.markup(d)}</g>`).join(''); st.append(s); };
    svg(draws.filter(d => d.layer === 'unten'), 'under');
    // Ebenen wie auf der Fläche: Hintergrund-Felder < Bilder < Zeichnungen „unten“ < Textfelder < Zeichnungen < „vorne“
    const layer = (b) => b.bg ? 1 : b.front ? 6 : Canvas.isPictureBox(b) ? 2 : 4;
    const boxes = it.boxes.filter(b => b !== f && !(b.ox && /^(label|notiz)$/.test(b.ox.k)) && b.office !== 'label').sort((a, b) => layer(a) - layer(b) || a.z - b.z);
    for (const b of boxes) {
      const e = el('div', { class: 'box sh-box' + ((b.style || {}).bg === 'transparent' || b.bg ? ' plain' : ''), dataset: { bid: b.id } });
      e.style.zIndex = layer(b);
      // Feld relativ zum Inhalts-Ursprung der Folie (sein eigener Inhalt beginnt wieder +11/+13 → Folien-Versatz)
      e.style.left = (b.x - ox) + 'px'; e.style.top = (b.y - oy) + 'px'; e.style.width = b.w + 'px';
      const sty = b.style || {};
      if (sty.bg && sty.bg !== 'transparent') e.style.background = sty.bg;
      e.innerHTML = '<div class="box-bar"></div><div class="box-body"><div class="box-text"></div></div>';
      const t = e.querySelector('.box-text');
      t.innerHTML = b.html;
      hydrateBox(t);
      for (const im of b.images) { const i2 = el('img', { class: 'sh-img', alt: '' }); i2.style.left = (11 + im.x) + 'px'; i2.style.top = (13 + im.y) + 'px'; i2.style.width = im.w + 'px'; i2.style.height = im.h + 'px'; Backend.setImg(i2, im.src); e.append(i2); if (isEmptyHtml(b.html)) t.style.minHeight = (im.y + im.h) + 'px'; }
      st.append(e);
      try { Canvas.applyInk(b, e); } catch (x) { /* Farbe wie gespeichert */ }
    }
    svg(draws.filter(d => d.layer !== 'unten'), 'over');
    return st;
  },
};
if (typeof module !== 'undefined') module.exports = { Show };
