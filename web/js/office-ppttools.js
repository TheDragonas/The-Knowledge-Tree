'use strict';
/* PowerPoint-Seiten: weitere Funktionen wie in PowerPoint (1.72) – ergänzt office-ppt.js, office-anim.js, office-show.js.
 *
 *   Bildschirmpräsentation: Folie ausblenden (show="0", beim Vorführen übersprungen), Einrichten (Endlosschleife bis Esc,
 *                           presProps.xml showPr loop)
 *   Einfügen:               Kopf- und Fusszeile (Datum, Foliennummer, Fusszeile; nicht auf der Titelfolie; für alle)
 *   Ansicht:                Foliensortierung – alle Folien als Raster, ziehen = verschieben, Doppelklick = öffnen
 * Felder der Kopf-/Fusszeile sind Textfelder mit b.pf = 'date' | 'num' | 'ftr' (Foliennummern folgen der Reihenfolge). */
const OfficePX = {
  page() { return OfficePages.page('pptx'); },
  /* ---------------------------------------------------------------- Folie ausblenden */
  hideSlide() {
    const p = this.page(), f = OfficePpt.currentFrame();
    if (!p || !f || Store.readOnly) return;
    f.ox.hide = !f.ox.hide;
    if (!f.ox.hide) delete f.ox.hide;
    Hist.touchPage(p.id); Hist.commit(f.ox.hide ? 'Folie ausgeblendet' : 'Folie eingeblendet');
    OfficeView.sync(true); Ribbon.refresh();
    UI.toast(f.ox.hide ? 'Folie ausgeblendet – beim Vorführen übersprungen' : 'Folie wieder eingeblendet');
  },
  hidden() { const f = OfficePpt.currentFrame(); return !!(f && f.ox.hide); },
  /* ---------------------------------------------------------------- Bildschirmpräsentation einrichten */
  async setup() {
    const p = this.page(); if (!p || Store.readOnly) return;
    const res = await UI.dialog((dlg, close) => {
      dlg.classList.add('kt-saveas');
      dlg.append(el('h2', { text: 'Bildschirmpräsentation einrichten' }));
      const loop = el('input', { type: 'checkbox' }); loop.checked = !!p.office.loop;
      const pres = el('input', { type: 'checkbox' }); pres.checked = !!Store.ui.showPresenter;
      dlg.append(el('label', { class: 'ex-opt' }, loop, 'Wiederholen, bis „Esc“ gedrückt wird (Endlosschleife)'), el('label', { class: 'ex-opt' }, pres, 'Referentenansicht verwenden'),
        el('p', { class: 'bs-note', text: 'Ausgeblendete Folien werden übersprungen. Folien mit „Nach“-Zeit (Register Übergänge) wechseln von selbst – zusammen mit der Endlosschleife ergibt das eine Präsentation, die von allein läuft (z.B. am Messestand).' }),
        el('div', { class: 'dlg-btns' }, el('button', { class: 'btn', type: 'button', text: 'Abbrechen', onclick: () => close(null) }), el('button', { class: 'btn primary', type: 'button', text: 'OK', onclick: () => close({ loop: loop.checked, pres: pres.checked }) })));
    });
    if (!res) return;
    if (res.loop) p.office.loop = true; else delete p.office.loop;
    Store.ui.showPresenter = res.pres; UiState.saveSoon();
    Hist.touchPage(p.id); Hist.commit('Bildschirmpräsentation einrichten');
  },
  /* ---------------------------------------------------------------- Kopf- und Fusszeile */
  fields(f, p) { return OfficePpt.itemsOf(f, p).boxes.filter(b => b.pf); },
  async hfDialog() {
    const p = this.page(), f0 = OfficePpt.currentFrame();
    if (!p || !f0 || Store.readOnly) return;
    if (Canvas.editing) Canvas.stopEditing();
    const cur = this.fields(f0, p), has = (k) => cur.find(b => b.pf === k);
    const txt = (b) => b ? OfficeWord.textOf(b.html).trim() : '';
    const res = await UI.dialog((dlg, close) => {
      dlg.classList.add('kt-saveas');
      dlg.append(el('h2', { text: 'Kopf- und Fusszeile' }));
      const ck = (on, l) => { const i = el('input', { type: 'checkbox' }); i.checked = on; return [i, el('label', { class: 'ex-opt' }, i, l)]; };
      const [dI, dL] = ck(!!has('date'), 'Datum und Uhrzeit');
      const dAuto = el('select', {}, el('option', { value: 'auto', text: 'Heutiges Datum (beim Einfügen)' }), el('option', { value: 'fix', text: 'Fest:' }));
      const dFix = el('input', { type: 'text', class: 'sa-name', value: txt(has('date')) || new Date().toLocaleDateString('de-CH') });
      const [nI, nL] = ck(!!has('num'), 'Foliennummer');
      const [fI, fL] = ck(!!has('ftr'), 'Fusszeile');
      const fT = el('input', { type: 'text', class: 'sa-name', value: txt(has('ftr')) });
      const [tI, tL] = ck(!!p.office.pfNoTitle, 'Auf Titelfolie nicht anzeigen');
      const go = (all) => close({ all, date: dI.checked ? (dAuto.value === 'fix' ? dFix.value : new Date().toLocaleDateString('de-CH')) : null, num: nI.checked, ftr: fI.checked ? fT.value : null, noTitle: tI.checked });
      dlg.append(dL, el('div', { class: 'xt-flags', style: { marginLeft: '24px' } }, dAuto, dFix), nL, fL, el('div', { style: { marginLeft: '24px' } }, fT), tL,
        el('div', { class: 'dlg-btns' }, el('button', { class: 'btn', type: 'button', text: 'Abbrechen', onclick: () => close(null) }), el('button', { class: 'btn', type: 'button', text: 'Übernehmen', onclick: () => go(false) }), el('button', { class: 'btn primary', type: 'button', text: 'Für alle übernehmen', onclick: () => go(true) })));
    });
    if (!res) return;
    this.applyHF(p, res.all ? OfficePpt.frames(p) : [f0], res);
  },
  applyHF(p, frames, o) {
    const all = OfficePpt.frames(p), sz = OfficePpt.size(p), k = sz.w / 960;
    p.office.pfNoTitle = !!o.noTitle;
    for (const f of frames) {
      for (const b of this.fields(f, p)) p.boxes.splice(p.boxes.indexOf(b), 1);
      const n = all.indexOf(f) + 1;
      if (o.noTitle && n === 1) continue;
      const y = f.y + 13 + sz.h - 40 * k, st = (al) => `<div style="font-size:${Math.round(14 * k)}px;color:#808080;text-align:${al}">`;
      const mk = (pf, x, w, html) => { const b = OfficePages.addBox(x, y, w + 22, html, { locked: false, office: null, style: { bg: 'transparent', under: f.ox.bg || '#ffffff' }, raw: true }); b.pf = pf; };
      if (o.date) mk('date', f.x + 11 + 30 * k, 220 * k, st('left') + escapeHtml(o.date) + '</div>');
      if (o.ftr) mk('ftr', f.x + 11 + sz.w / 2 - 200 * k, 400 * k, st('center') + escapeHtml(o.ftr) + '</div>');
      if (o.num) mk('num', f.x + 11 + sz.w - 130 * k, 100 * k, st('right') + n + '</div>');
    }
    Canvas.render(); Hist.touchPage(p.id); Hist.commit('Kopf- und Fusszeile');
  },
  /* Foliennummern nach dem Verschieben/Löschen nachführen (office-ppt.js relabel) */
  renumber(p) {
    OfficePpt.frames(p).forEach((f, i) => {
      for (const b of this.fields(f, p)) if (b.pf === 'num') { const h = b.html.replace(/>\d+</, '>' + (i + 1) + '<'); if (h !== b.html) b.html = h; }
    });
  },
  /* ---------------------------------------------------------------- Foliensortierung */
  move(p, from, to) {
    if (from === to) return;
    while (from !== to) {
      const fr = OfficePpt.frames(p), j = from < to ? from + 1 : from - 1;
      const a = OfficePpt.itemsOf(fr[from], p), b = OfficePpt.itemsOf(fr[j], p);
      const dy = fr[j].y - fr[from].y;
      OfficePpt.shiftItems(a, dy); OfficePpt.shiftItems(b, -dy);
      from = j;
    }
    OfficePpt.relabel(p);
    if (typeof Sheet !== 'undefined' && Sheet.bump) Sheet.bump();
    Canvas.render(); Hist.touchPage(p.id); Hist.commit('Folie verschoben');
  },
  sorterOn() { return !!this._sorter; },
  sorter() {
    const p = this.page(); if (!p) return;
    if (this._sorter) { this.closeSorter(); return; }
    if (Canvas.editing) Canvas.stopEditing();
    const host = OfficeView.host();
    const ov = el('div', { class: 'px-sort', tabindex: '-1' });
    const bar = el('div', { class: 'px-sbar' }, el('b', { text: 'Foliensortierung' }), el('span', { class: 'bs-note', text: 'Ziehen = verschieben · Doppelklick = öffnen · Rechtsklick = Menü' }), el('button', { class: 'btn', type: 'button', text: 'Normal', onclick: () => this.closeSorter() }));
    const grid = el('div', { class: 'px-grid' });
    ov.append(bar, grid);
    for (const ev of ['pointerdown', 'mousedown', 'click', 'dblclick', 'wheel', 'contextmenu', 'keydown']) ov.addEventListener(ev, (e) => { e.stopPropagation(); if (ev === 'keydown' && e.key === 'Escape') this.closeSorter(); }, { passive: ev !== 'contextmenu' && ev !== 'wheel' });
    host.append(ov);
    this._sorter = { ov, grid, p };
    this.fillSorter();
    ov.focus();
    Ribbon.refresh();
  },
  fillSorter() {
    const S = this._sorter; if (!S) return;
    const p = S.p, fr = OfficePpt.frames(p), sz = OfficePpt.size(p), W = 220, k = W / sz.w, cur = OfficePpt.currentFrame();
    S.grid.innerHTML = '';
    let drag = null;
    fr.forEach((f, i) => {
      const card = el('div', { class: 'px-card' + (f === cur ? ' on' : '') + (f.ox.hide ? ' hid' : ''), draggable: 'true', dataset: { i } });
      const th = el('div', { class: 'px-th' }); th.style.width = W + 'px'; th.style.height = Math.round(sz.h * k) + 'px';
      try { const s = Show.render(f, p); s.style.transform = `scale(${k})`; th.append(s); } catch (e) { /* Miniatur fehlt */ }
      const tr = f.ox.tr && f.ox.tr.type && f.ox.tr.type !== 'none';
      card.append(th, el('div', { class: 'px-cap' }, el('span', { class: 'px-n', text: String(i + 1) }), tr ? el('span', { class: 'px-tr', title: 'Übergang', html: icon('play', 12) }) : '', f.ox.tr && f.ox.tr.adv ? el('span', { class: 'px-tm', text: (f.ox.tr.adv / 1000).toLocaleString('de-CH') + ' s' }) : ''));
      card.addEventListener('click', () => { OfficePpt.focusSlide(f.id, false); for (const c of S.grid.children) c.classList.toggle('on', c === card); Ribbon.refresh(); });
      card.addEventListener('dblclick', () => { this.closeSorter(); OfficePpt.focusSlide(f.id, true); });
      card.addEventListener('dragstart', (e) => { drag = i; e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', 'folie'); } catch (x) { /* */ } card.classList.add('drag'); });
      card.addEventListener('dragend', () => card.classList.remove('drag'));
      card.addEventListener('dragover', (e) => { if (drag == null) return; e.preventDefault(); card.classList.add('over'); });
      card.addEventListener('dragleave', () => card.classList.remove('over'));
      card.addEventListener('drop', (e) => { e.preventDefault(); card.classList.remove('over'); if (drag == null || drag === i) return; this.move(p, drag, i); drag = null; this.fillSorter(); });
      card.addEventListener('contextmenu', (e) => { e.preventDefault(); OfficePpt.focusSlide(f.id, false); UI.menu([{ head: 'Folie ' + (i + 1) },
        { label: f.ox.hide ? 'Folie einblenden' : 'Folie ausblenden', icon: 'eye', action: () => { this.hideSlide(); this.fillSorter(); } },
        { label: 'Folie duplizieren', icon: 'duplicate', action: async () => { await OfficePpt.cmd('dup'); this.fillSorter(); } },
        { label: 'Folie löschen', icon: 'trash', danger: true, disabled: fr.length < 2, action: async () => { await OfficePpt.cmd('del'); this.fillSorter(); } }, '-',
        { label: 'Ab hier vorführen', icon: 'play', action: () => { this.closeSorter(); Show.start('here'); } }], e.clientX, e.clientY); });
      S.grid.append(card);
    });
  },
  closeSorter() { const S = this._sorter; this._sorter = null; if (S) S.ov.remove(); OfficeView.sync(true); Ribbon.refresh(); },

  /* ---------------------------------------------------------------- Datei: Endlosschleife (presProps.xml) */
  async read(pkg, p) {
    const r = (await pkg.rels(pkg.main)).find(x => /\/presProps$/.test(x.type) && pkg.has(x.path));
    if (!r) return;
    const d = await pkg.xml(r.path), sp = OfficePages.q(d, Ooxml.NS.p, 'showPr')[0];
    if (sp && /^(1|true)$/.test(sp.getAttribute('loop') || '')) p.office.loop = p.office.loop0 = true;
  },
  async write(pkg, p) {
    const o = p.office;
    if (!!o.loop === !!o.loop0) return;
    const P = Ooxml.NS.p, X = OfficePages;
    let r = (await pkg.rels(pkg.main)).find(x => /\/presProps$/.test(x.type) && pkg.has(x.path));
    if (!r) {
      if (!o.loop) return;
      const path = pkg.freeName('ppt/presProps%.xml');
      await pkg.addPart(path, `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n<p:presentationPr xmlns:a="${Ooxml.NS.a}" xmlns:r="${Ooxml.NS.r}" xmlns:p="${P}"/>`, 'application/vnd.openxmlformats-officedocument.presentationml.presProps+xml');
      await pkg.addRel(pkg.main, 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/presProps', path.replace(/^ppt\//, ''));
      r = { path };
    }
    const d = await pkg.xml(r.path), root = d.documentElement;
    let sp = X.kid(root, P, 'showPr');
    if (!sp) { [sp] = X.xml(d, P, '<p:showPr showNarration="1"><p:present/><p:sldAll/></p:showPr>'); const after = ['clrMru', 'extLst'].map(n => X.kid(root, P, n)).find(Boolean); if (after) after.before(sp); else root.append(sp); }
    if (o.loop) sp.setAttribute('loop', '1'); else sp.removeAttribute('loop');
    pkg.setXml(r.path, d);
  },
};
if (typeof module !== 'undefined') module.exports = { OfficePX };
