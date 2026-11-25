'use strict';
/* Word-Seiten: weitere Funktionen wie in Word (1.72) – ergänzt office-doc.js, office-word.js und office-view.js.
 *
 *   Einfügen:  Kopfzeile, Fusszeile, Seitenzahl (oben/unten, links/Mitte/rechts, „Seite X von Y“) – auf jedem Blatt
 *              angezeigt (Doppelklick = bearbeiten), in die Datei als Kopf-/Fusszeilen-Teil mit Feldern PAGE/NUMPAGES/DATE
 *   Entwurf:   Wasserzeichen (VERTRAULICH, ENTWURF, MUSTER … oder eigener Text) – in der Kopfzeile wie Word (VML)
 *   Layout:    Silbentrennung (automatisch / keine) – settings.xml
 *   Start:     Absätze sortieren (A → Z / Z → A)
 *   Überall:   Symbol einfügen (OfficeSym, auch Excel und PowerPoint)
 *
 * Modell: p.office.hf = { h: { t, al }, f: { t, al } } (Text mit {Seite} {Seiten} {Datum}), hf0 = Stand der Datei,
 * hfp = { h, f } (Teile), wm / wm0 (Wasserzeichen-Text), hyph / hyph0. Blätter: Felder ox.k 'hfp' (Kopf/Fuss je Blatt,
 * gesperrt) und 'wmp' (Wasserzeichen-Bild je Blatt) – reine Anzeige, werden in office-view.js flow() angelegt. */
const OfficeWX = {
  get W() { return Ooxml.NS.w; }, get R() { return Ooxml.NS.r; },
  TOK: { PAGE: '{Seite}', NUMPAGES: '{Seiten}', DATE: '{Datum}', SECTIONPAGES: '{Seiten}' },
  page() { return OfficePages.page('docx'); },

  /* ---------------------------------------------------------------- lesen */
  paraText(p) {
    const X = OfficePages, W = this.W;
    let out = '', fld = null;
    const walk = (n) => {
      for (const c of X.kids(n, W)) {
        if (c.localName === 'fldSimple') { const m = /^\s*(\w+)/.exec(c.getAttributeNS(W, 'instr') || c.getAttribute('w:instr') || ''); const t = m && this.TOK[m[1].toUpperCase()]; if (t) out += t; else walk(c); continue; }
        if (c.localName === 'r') {
          for (const x of X.kids(c, W)) {
            if (x.localName === 'fldChar') { const tp = x.getAttributeNS(W, 'fldCharType') || x.getAttribute('w:fldCharType'); if (tp === 'begin') fld = { code: '', res: false }; else if (tp === 'separate' && fld) { fld.res = true; const m = /^\s*(\w+)/.exec(fld.code); fld.tok = m && this.TOK[m[1].toUpperCase()]; if (fld.tok) out += fld.tok; } else if (tp === 'end') fld = null; continue; }
            if (x.localName === 'instrText' && fld) { fld.code += x.textContent; continue; }
            if (fld && fld.res && fld.tok) continue;   // Ergebnis eines bekannten Felds: steht als {…}
            if (fld && !fld.res) continue;
            if (x.localName === 't') out += x.textContent;
            else if (x.localName === 'tab') out += '\t';
            else if (x.localName === 'br') out += '\n';
          }
          continue;
        }
        if (/^(hyperlink|smartTag|ins|sdt|sdtContent|customXml)$/.test(c.localName)) walk(c);
      }
    };
    walk(p);
    return out;
  },
  async readHF(pkg, p, body) {
    const X = OfficePages, W = this.W, R = this.R;
    const sect = body && X.kid(body, W, 'sectPr');
    const rels = await pkg.rels(pkg.main);
    const hf = { h: { t: '', al: 'c' }, f: { t: '', al: 'c' } }, hfp = {};
    let wm = null;
    for (const [k, tag] of [['h', 'headerReference'], ['f', 'footerReference']]) {
      const ref = sect && X.kids(sect, W, tag).find(e => (e.getAttributeNS(W, 'type') || e.getAttribute('w:type') || 'default') === 'default');
      const r = ref && rels.find(x => x.id === X.at(ref, R, 'id'));
      if (!r || !pkg.has(r.path)) continue;
      hfp[k] = r.path;
      const d = await pkg.xml(r.path);
      const lines = [];
      let al = null, imgs = null;
      for (const p0 of X.kids(d.documentElement, W, 'p')) {
        if (/PowerPlusWaterMarkObject/.test(new XMLSerializer().serializeToString(p0))) continue;
        const t = this.paraText(p0);
        const pr = X.kid(p0, W, 'pPr'), jc = pr && X.kid(pr, W, 'jc');
        if (t.trim() && al == null) al = { center: 'c', right: 'r', end: 'r' }[jc && (jc.getAttributeNS(W, 'val') || jc.getAttribute('w:val'))] || 'l';
        lines.push(t);
        // Bilder in Kopf-/Fusszeile (1.75, z. B. Logo): nur Anzeige
        if (typeof OfficeWI !== 'undefined') for (const o of OfficeWI.objects(p0)) {
          if (o.kind !== 'pic' || !o.rid) continue;
          const hr = (await pkg.rels(r.path)).find(x => x.id === o.rid);
          const im = hr && hr.path && pkg.has(hr.path) ? await OfficeWI.picture(pkg, hr.path, o) : null;
          if (im) (imgs || (imgs = [])).push({ name: im.name, w: Math.round(Math.min(im.w, 600)), h: Math.round(im.h * Math.min(im.w, 600) / im.w), al: { center: 'c', right: 'r', end: 'r' }[jc && (jc.getAttributeNS(W, 'val') || jc.getAttribute('w:val'))] || 'l' });
        }
      }
      while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
      while (lines.length && !lines[0].trim()) lines.shift();
      hf[k] = { t: lines.join('\n'), al: al || 'c', ...(imgs ? { img: imgs } : {}) };
      if (k === 'h') { const m = /PowerPlusWaterMarkObject[\s\S]*?string="([^"]*)"/.exec(new XMLSerializer().serializeToString(d)); if (m) wm = m[1].replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>'); }
    }
    p.office.hf = hf; p.office.hf0 = JSON.stringify(hf); p.office.hfp = hfp;
    p.office.wm = p.office.wm0 = wm;
    if (wm) p.office.wmImg = await this.wmImage(wm);
    p.office.titlePg = !!(sect && X.kid(sect, W, 'titlePg'));
    // Silbentrennung
    const sr = rels.find(r => /\/settings$/.test(r.type) && pkg.has(r.path));
    const sd = sr ? await pkg.xml(sr.path) : null, ah = sd && X.kid(sd.documentElement, W, 'autoHyphenation');
    p.office.hyph = p.office.hyph0 = !!ah && !/^(0|false)$/.test(ah.getAttributeNS(W, 'val') || ah.getAttribute('w:val') || '');
  },

  /* ---------------------------------------------------------------- Anzeige auf jedem Blatt (office-view.js flow) */
  fill(t, i, n) { return String(t || '').replace(/\{Seite\}/g, String(i + 1)).replace(/\{Seiten\}/g, String(n)).replace(/\{Datum\}/g, new Date().toLocaleDateString('de-CH')); },
  hfHtml(part, i, n) {
    const al = { l: 'left', c: 'center', r: 'right' }[part.al] || 'center';
    const im = (part.img || []).map(x => `<div style="text-align:${{ l: 'left', c: 'center', r: 'right' }[x.al] || 'left'};line-height:0"><img data-kt-src="${escapeHtml(x.name)}" alt="" style="width:${x.w}px;height:${x.h}px"></div>`).join('');
    if (!part.t.trim()) return im;
    return im + part.t.split('\n').map(l => `<div style="text-align:${al};font-size:12px;color:#595959">${escapeHtml(this.fill(l, i, n)).replace(/\t/g, '&emsp;&emsp;') || '<br>'}</div>`).join('');
  },
  flow(p, need, P, x, w, set) {
    const o = p.office;
    if (!o.hf) return false;
    let moved = false;
    const want = new Map();
    for (let i = 0; i < need; i++) {
      for (const k of ['h', 'f']) if (o.hf[k] && (o.hf[k].t.trim() || (o.hf[k].img || []).length) && !(i === 0 && o.titlePg)) want.set(k + i, { k, i });
      if (o.wm && o.wmImg) want.set('w' + i, { k: 'w', i });
    }
    // überzählige entfernen
    for (const b of p.boxes.filter(b => b.ox && (b.ox.k === 'hfp' || b.ox.k === 'wmp'))) { const key = (b.ox.k === 'wmp' ? 'w' : b.ox.pos) + b.ox.i; if (!want.has(key)) { p.boxes.splice(p.boxes.indexOf(b), 1); moved = true; } }
    for (const [key, { k, i }] of want) {
      let b = p.boxes.find(q => q.ox && (k === 'w' ? q.ox.k === 'wmp' : q.ox.k === 'hfp' && q.ox.pos === k) && q.ox.i === i);
      const top = OfficeView.pageTop(p, i);
      if (k === 'w') {
        const iw = Math.round(P.W * 0.8), ih = Math.round(iw * 0.6);
        if (!b) { b = { id: uid('b'), x: 0, y: 0, w: 0, html: '', images: [{ id: uid('i'), src: o.wmImg, x: 0, y: 0, w: iw, h: ih }], z: 1, style: { bg: 'transparent', border: 'transparent' }, locked: true, pkg: null, bg: true, office: 'blatt', ox: { k: 'wmp', i } }; p.boxes.unshift(b); moved = true; }
        if (b.images[0].src !== o.wmImg) { b.images[0].src = o.wmImg; moved = true; }
        set(b, 'x', Math.round(OfficeView.PX + (P.W - iw) / 2)); set(b, 'y', Math.round(top + (P.H - ih) / 2)); set(b, 'w', iw + 22);
        continue;
      }
      const html = this.hfHtml(o.hf[k], i, need);
      if (!b) { b = { id: uid('b'), x, y: 0, w, html, images: [], z: 2, style: { bg: 'transparent', under: o.pageColor || '#ffffff', border: 'transparent' }, locked: true, pkg: null, office: null, ox: { k: 'hfp', pos: k, i } }; p.boxes.push(b); moved = true; }
      if (b.html !== html) { b.html = html; moved = true; }
      set(b, 'x', x); set(b, 'w', w);
      set(b, 'y', Math.round(k === 'f' ? top + P.H - P.b + 6 : top + Math.max(6, P.t / 2 - 18)));
    }
    return moved;
  },
  /* Wasserzeichen als Bild (schräg, hellgrau) */
  async wmImage(text) {
    const c = document.createElement('canvas'); c.width = 1200; c.height = 720;
    const g = c.getContext('2d');
    g.translate(600, 360); g.rotate(-Math.PI / 4.6);
    let fs = 220; g.font = `600 ${fs}px Calibri, Carlito, Arial, sans-serif`;
    while (g.measureText(text).width > 1250 && fs > 30) { fs -= 10; g.font = `600 ${fs}px Calibri, Carlito, Arial, sans-serif`; }
    g.fillStyle = 'rgba(160,160,160,.42)'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(text, 0, 0);
    const blob = await new Promise(r => c.toBlob(r, 'image/png'));
    return Backend.saveImage(blob);
  },

  /* ---------------------------------------------------------------- Befehle */
  edited(p, label) { Canvas.render(true); Hist.touchPage(p.id); Hist.commit(label); Ribbon.refresh(); },
  async hfDialog(focus = 'h') {
    const p = this.page(); if (!p || Store.readOnly) return;
    if (!p.office.hf) p.office.hf = { h: { t: '', al: 'c' }, f: { t: '', al: 'c' } };
    if (Canvas.editing) Canvas.stopEditing();
    const hf = JSON.parse(JSON.stringify(p.office.hf));
    const res = await UI.dialog((dlg, close) => {
      dlg.classList.add('kt-saveas', 'wx-hf');
      dlg.append(el('h2', { text: 'Kopf- und Fusszeile' }), el('p', { class: 'bs-note', text: 'Erscheint auf jedem Blatt. Felder: {Seite} = Seitenzahl, {Seiten} = Anzahl Seiten, {Datum} = heutiges Datum.' }));
      const part = (k, label) => {
        const ta = el('textarea', { class: 'xt-note', rows: 2 }); ta.value = hf[k].t;
        const al = el('select', {}, el('option', { value: 'l', text: 'Linksbündig' }), el('option', { value: 'c', text: 'Zentriert' }), el('option', { value: 'r', text: 'Rechtsbündig' })); al.value = hf[k].al || 'c';
        const ins = (t) => { const s = ta.selectionStart ?? ta.value.length; ta.value = ta.value.slice(0, s) + t + ta.value.slice(ta.selectionEnd ?? s); ta.focus(); ta.setSelectionRange(s + t.length, s + t.length); };
        const b = (l, t) => el('button', { class: 'btn small', type: 'button', text: l, onclick: () => ins(t) });
        if (k === focus) setTimeout(() => ta.focus(), 40);
        return [el('div', { class: 'oio-sub', text: label }), ta, el('div', { class: 'xt-flags' }, al, b('Seitenzahl', '{Seite}'), b('Anzahl Seiten', '{Seiten}'), b('Datum', '{Datum}'), b('Seite X von Y', 'Seite {Seite} von {Seiten}')), { ta, al }];
      };
      const H = part('h', 'Kopfzeile'), F = part('f', 'Fusszeile');
      dlg.append(...H.slice(0, 3), ...F.slice(0, 3), p.office.titlePg ? el('p', { class: 'bs-note', text: 'Hinweis: Das Dokument hat eine andere erste Seite – dort zeigt Word die Kopf-/Fusszeile der ersten Seite.' }) : '',
        el('div', { class: 'dlg-btns' }, el('button', { class: 'btn', type: 'button', text: 'Entfernen', onclick: () => close({ h: { t: '', al: 'c' }, f: { t: '', al: 'c' } }) }), el('button', { class: 'btn', type: 'button', text: 'Abbrechen', onclick: () => close(null) }),
          el('button', { class: 'btn primary', type: 'button', text: 'OK', onclick: () => close({ h: { t: H[3].ta.value.replace(/\s+$/, ''), al: H[3].al.value }, f: { t: F[3].ta.value.replace(/\s+$/, ''), al: F[3].al.value } }) })));
    }, { wide: true });
    if (!res) return;
    p.office.hf = res;
    this.edited(p, 'Kopf- und Fusszeile');
  },
  pageNumber(pos) {
    const p = this.page(); if (!p || Store.readOnly) return;
    if (!p.office.hf) p.office.hf = { h: { t: '', al: 'c' }, f: { t: '', al: 'c' } };
    const hf = p.office.hf;
    const strip = (t) => t.replace(/(Seite\s*)?\{Seite\}(\s*von\s*\{Seiten\})?/g, '').replace(/\n{2,}/g, '\n').trim();
    if (pos === 'off') { hf.h.t = strip(hf.h.t); hf.f.t = strip(hf.f.t); return this.edited(p, 'Seitenzahlen entfernt'); }
    const [k, al, xy] = pos.split('-');
    const tok = xy === 'xy' ? 'Seite {Seite} von {Seiten}' : '{Seite}';
    hf.h.t = strip(hf.h.t); hf.f.t = strip(hf.f.t);
    hf[k].t = hf[k].t ? hf[k].t + '\n' + tok : tok;
    hf[k].al = al;
    this.edited(p, 'Seitenzahl');
  },
  pageNumberMenu(anchor) {
    UI.menu([{ head: 'Seitenzahl' }, { label: 'Seitenanfang – links', action: () => this.pageNumber('h-l') }, { label: 'Seitenanfang – zentriert', action: () => this.pageNumber('h-c') }, { label: 'Seitenanfang – rechts', action: () => this.pageNumber('h-r') },
      '-', { label: 'Seitenende – links', action: () => this.pageNumber('f-l') }, { label: 'Seitenende – zentriert', action: () => this.pageNumber('f-c') }, { label: 'Seitenende – rechts', action: () => this.pageNumber('f-r') },
      { label: 'Seitenende – „Seite X von Y“', action: () => this.pageNumber('f-c-xy') }, '-', { label: 'Seitenzahlen entfernen', icon: 'x', action: () => this.pageNumber('off') }], 0, 0, { anchor });
  },
  WM: ['VERTRAULICH', 'ENTWURF', 'MUSTER', 'NICHT KOPIEREN', 'DRINGEND', 'KOPIE'],
  async watermark(t) {
    const p = this.page(); if (!p || Store.readOnly) return;
    if (t === '?') { t = await UI.prompt('Benutzerdefiniertes Wasserzeichen', p.office.wm || '', { text: 'Text, der schräg und hellgrau hinter jedem Blatt steht' }); if (t == null) return; t = t.trim(); }
    p.office.wm = t || null;
    p.office.wmImg = t ? await this.wmImage(t) : null;
    this.edited(p, t ? 'Wasserzeichen' : 'Wasserzeichen entfernt');
  },
  watermarkMenu(anchor) {
    const cur = (this.page() || { office: {} }).office.wm;
    UI.menu([{ head: 'Wasserzeichen' }, ...this.WM.map(t => ({ label: t, checked: cur === t, action: () => this.watermark(t) })), '-', { label: 'Benutzerdefiniert …', icon: 'pencil', action: () => this.watermark('?') }, { label: 'Wasserzeichen entfernen', icon: 'x', disabled: !cur, action: () => this.watermark('') }], 0, 0, { anchor });
  },
  hyph(on) {
    const p = this.page(); if (!p || Store.readOnly) return;
    p.office.hyph = !!on;
    this.applyHyph(p);
    this.edited(p, on ? 'Silbentrennung automatisch' : 'Keine Silbentrennung');
  },
  applyHyph(p) { document.body.classList.toggle('w-hyph', !!(p && p.type === 'dok' && p.office && p.office.hyph)); },
  /* Start → Sortieren: markierte Absätze (bzw. alle des Felds) alphabetisch */
  sort(desc) {
    const p = this.page(); if (!p || Store.readOnly) return;
    if (!OfficeDoc.ensureEdit()) return;
    const t = Canvas.textEl(Canvas.editing);
    if (!t) return;
    const s = getSelection();
    const blocks = (root) => [...root.children].filter(c => /^(DIV|P|H[1-6]|LI|BLOCKQUOTE|PRE)$/.test(c.tagName));
    let parent = t, list = blocks(t);
    if (s.rangeCount) {
      const r = s.getRangeAt(0);
      const host = (n) => { while (n && n !== t && !(n.parentNode && (n.parentNode === t || /^(UL|OL)$/.test(n.parentNode.tagName)) && n.nodeType === 1)) n = n.parentNode; return n && n !== t ? n : null; };
      const a = host(r.startContainer), b = host(r.endContainer);
      if (a && b && a.parentNode === b.parentNode && a !== b) { parent = a.parentNode; const all = blocks(parent); list = all.slice(all.indexOf(a), all.indexOf(b) + 1); }
      else if (a && /^(UL|OL)$/.test(a.parentNode.tagName)) { parent = a.parentNode; list = blocks(parent); }
    }
    if (list.length < 2) { UI.toast('Mindestens zwei Absätze markieren'); return; }
    const anchor = list[list.length - 1].nextSibling;
    const sorted = list.slice().sort((x, y) => x.textContent.trim().localeCompare(y.textContent.trim(), 'de', { numeric: true, sensitivity: 'base' }) * (desc ? -1 : 1));
    for (const n of sorted) parent.insertBefore(n, anchor);
    t.dispatchEvent(new Event('input', { bubbles: true }));
    UI.toast(`${list.length} Absätze sortiert`);
  },

  /* ---------------------------------------------------------------- schreiben (office-doc.js write) → true = document.xml geändert */
  async write(pkg, doc, body, p) {
    const o = p.office, X = OfficePages, W = this.W;
    let docChanged = false;
    // Silbentrennung
    if (o.hyph0 != null && !!o.hyph !== !!o.hyph0) await this.writeHyph(pkg, !!o.hyph);
    if (!o.hf) return false;
    const hf0 = JSON.parse(o.hf0 || '{"h":{"t":"","al":"c"},"f":{"t":"","al":"c"}}');
    const wmChanged = (o.wm || null) !== (o.wm0 || null);
    for (const k of ['h', 'f']) {
      const changed = JSON.stringify(o.hf[k]) !== JSON.stringify(hf0[k]) || (k === 'h' && wmChanged);
      if (!changed) continue;
      let path = (o.hfp || {})[k];
      if (!path || !pkg.has(path)) {
        if (!o.hf[k].t.trim() && !(k === 'h' && o.wm)) continue;
        const dir = pkg.main.replace(/[^/]+$/, '');
        path = pkg.freeName(dir + (k === 'h' ? 'header%.xml' : 'footer%.xml'));
        await pkg.addPart(path, `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n<w:${k === 'h' ? 'hdr' : 'ftr'} xmlns:w="${W}" xmlns:r="${this.R}"><w:p/></w:${k === 'h' ? 'hdr' : 'ftr'}>`, `application/vnd.openxmlformats-officedocument.wordprocessingml.${k === 'h' ? 'header' : 'footer'}+xml`);
        const rid = await pkg.addRel(pkg.main, `http://schemas.openxmlformats.org/officeDocument/2006/relationships/${k === 'h' ? 'header' : 'footer'}`, path.slice(dir.length));
        let sect = X.kid(body, W, 'sectPr');
        if (!sect) { sect = X.mk(doc, W, 'sectPr'); body.append(sect); }
        const ref = X.mk(doc, W, k === 'h' ? 'headerReference' : 'footerReference', { 'w:type': 'default', 'r:id': rid });
        // Reihenfolge: alle Kopf-/Fusszeilen-Bezüge vorne im Abschnitt
        const refs = X.kids(sect, W).filter(e => /^(headerReference|footerReference)$/.test(e.localName));
        if (refs.length) refs[refs.length - 1].after(ref); else sect.prepend(ref);
        o.hfp = { ...(o.hfp || {}), [k]: path };
        docChanged = true;
      }
      const d = await pkg.xml(path), root = d.documentElement;
      // Textabsätze ersetzen; Absätze mit Bildern/Formen (Logo …) bleiben, das alte Wasserzeichen fällt weg
      for (const p0 of X.kids(root, W, 'p')) { const s = new XMLSerializer().serializeToString(p0); if (/PowerPlusWaterMarkObject/.test(s) || !/<(\w+:)?(drawing|pict|object)\b/.test(s)) p0.remove(); }
      const jc = { l: 'left', c: 'center', r: 'right' }[o.hf[k].al] || 'center';
      const runs = (line) => line.split(/(\{Seite\}|\{Seiten\}|\{Datum\}|\t)/).filter(Boolean).map(t => {
        if (t === '\t') return '<w:r><w:tab/></w:r>';
        const f = { '{Seite}': ' PAGE ', '{Seiten}': ' NUMPAGES ', '{Datum}': ' DATE \\@ "dd.MM.yyyy" ' }[t];
        if (f) return `<w:fldSimple w:instr="${Ooxml.esc(f)}"><w:r><w:t>${t === '{Datum}' ? Ooxml.esc(new Date().toLocaleDateString('de-CH')) : '1'}</w:t></w:r></w:fldSimple>`;
        return `<w:r><w:t xml:space="preserve">${Ooxml.esc(t)}</w:t></w:r>`;
      }).join('');
      const lines = o.hf[k].t ? o.hf[k].t.split('\n') : [];
      const snippet = lines.map(l => `<w:p><w:pPr><w:jc w:val="${jc}"/></w:pPr>${runs(l)}</w:p>`).join('');
      const first = X.kids(root, W)[0] || null;
      for (const n of snippet ? X.xml(d, W, snippet) : []) root.insertBefore(n, first);
      if (k === 'h' && o.wm) root.insertBefore(this.wmPara(d, o.wm), X.kids(root, W)[0] || null);
      if (!X.kids(root, W).some(e => /^(p|tbl|sdt)$/.test(e.localName))) root.append(X.mk(d, W, 'p'));
      pkg.setXml(path, d);
    }
    return docChanged;
  },
  /* Wasserzeichen wie Word: VML-Textpfad hinter dem Text, mitten auf dem Blatt */
  wmPara(d, text) {
    const s = `<w:p xmlns:w="${this.W}" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w10="urn:schemas-microsoft-com:office:word"><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:noProof/></w:rPr><w:pict>` +
      '<v:shapetype id="_x0000_t136" coordsize="21600,21600" o:spt="136" adj="10800" path="m@7,l@8,m@5,21600l@6,21600e"><v:formulas><v:f eqn="sum #0 0 10800"/><v:f eqn="prod #0 2 1"/><v:f eqn="sum 21600 0 @1"/><v:f eqn="sum 0 0 @2"/><v:f eqn="sum 21600 0 @3"/><v:f eqn="if @0 @3 0"/><v:f eqn="if @0 21600 @1"/><v:f eqn="if @0 0 @2"/><v:f eqn="if @0 @4 21600"/><v:f eqn="mid @5 @6"/><v:f eqn="mid @8 @5"/><v:f eqn="mid @7 @8"/><v:f eqn="mid @6 @7"/><v:f eqn="sum @6 0 @5"/></v:formulas><v:path textpathok="t" o:connecttype="custom" o:connectlocs="@9,0;@10,10800;@11,21600;@12,10800" o:connectangles="270,180,90,0"/><v:textpath on="t" fitshape="t"/><o:lock v:ext="edit" text="t" shapetype="t"/></v:shapetype>' +
      `<v:shape id="PowerPlusWaterMarkObject" o:spid="_x0000_s2049" type="#_x0000_t136" style="position:absolute;margin-left:0;margin-top:0;width:468pt;height:117pt;rotation:315;z-index:-251657216;mso-position-horizontal:center;mso-position-horizontal-relative:margin;mso-position-vertical:center;mso-position-vertical-relative:margin" o:allowincell="f" fillcolor="silver" stroked="f"><v:fill opacity=".5"/><v:textpath style="font-family:&quot;Calibri&quot;;font-size:1pt" string="${Ooxml.esc(text)}"/><w10:wrap anchorx="margin" anchory="margin"/></v:shape></w:pict></w:r></w:p>`;
    const x = new DOMParser().parseFromString(s, 'application/xml');
    return d.importNode(x.documentElement, true);
  },
  AFTER_HYPH: ['consecutiveHyphenLimit', 'hyphenationZone', 'doNotHyphenateCaps', 'showEnvelope', 'summaryLength', 'clickAndTypeStyle', 'defaultTableStyle', 'evenAndOddHeaders', 'bookFoldRevPrinting', 'bookFoldPrinting', 'bookFoldPrintingSheets', 'drawingGridHorizontalSpacing', 'drawingGridVerticalSpacing', 'displayHorizontalDrawingGridEvery', 'displayVerticalDrawingGridEvery', 'doNotUseMarginsForDrawingGridOrigin', 'drawingGridHorizontalOrigin', 'drawingGridVerticalOrigin', 'doNotShadeFormData', 'noPunctuationKerning', 'characterSpacingControl', 'printTwoOnOne', 'strictFirstAndLastChars', 'noLineBreaksAfter', 'noLineBreaksBefore', 'savePreviewPicture', 'doNotValidateAgainstSchema', 'saveInvalidXml', 'ignoreMixedContent', 'alwaysShowPlaceholderText', 'doNotDemarcateInvalidXml', 'saveXmlDataOnly', 'useXSLTWhenSaving', 'saveThroughXslt', 'showXMLTags', 'alwaysMergeEmptyNamespace', 'updateFields', 'hdrShapeDefaults', 'footnotePr', 'endnotePr', 'compat', 'docVars', 'rsids', 'mathPr', 'attachedSchema', 'themeFontLang', 'clrSchemeMapping', 'doNotIncludeSubdocsInStats', 'doNotAutoCompressPictures', 'forceUpgrade', 'captions', 'readModeInkLockDown', 'smartTagType', 'schemaLibrary', 'shapeDefaults', 'doNotEmbedSmartTags', 'decimalSymbol', 'listSeparator'],
  async writeHyph(pkg, on) {
    const X = OfficePages, W = this.W;
    let sr = (await pkg.rels(pkg.main)).find(r => /\/settings$/.test(r.type) && pkg.has(r.path));
    if (!sr) {
      if (!on) return;
      const sp = 'word/settings.xml';
      await pkg.addPart(sp, `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n<w:settings xmlns:w="${W}"/>`, 'application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml');
      await pkg.addRel(pkg.main, 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings', 'settings.xml');
      sr = { path: sp };
    }
    const sd = await pkg.xml(sr.path), root = sd.documentElement;
    const old = X.kid(root, W, 'autoHyphenation'); if (old) old.remove();
    if (on) { const e = X.mk(sd, W, 'autoHyphenation'); const after = this.AFTER_HYPH.map(n => X.kid(root, W, n)).find(Boolean); if (after) after.before(e); else root.append(e); }
    pkg.setXml(sr.path, sd);
  },
};

/* ==================================================================== Symbol einfügen (Word, Excel, PowerPoint) */
const OfficeSym = {
  SETS: [
    ['Häufig', '€ £ ¥ © ® ™ § ¶ † • … – — ‰ ° ± × ÷ ≈ ≠ ≤ ≥ ∞ √ ∑ π µ Ω ← → ↑ ↓ ⇒ ✓ ✗ ★ ½ ¼ ¾ ² ³ « » „ “ ” ‚ ‘ ’'],
    ['Griechisch', 'Α Β Γ Δ Ε Ζ Η Θ Ι Κ Λ Μ Ν Ξ Ο Π Ρ Σ Τ Υ Φ Χ Ψ Ω α β γ δ ε ζ η θ ι κ λ μ ν ξ ο π ρ σ ς τ υ φ χ ψ ω ϑ ϕ ϵ'],
    ['Mathematik', '± ∓ × ÷ · ∙ √ ∛ ∜ ∞ ∝ ∂ ∇ ∆ ∑ ∏ ∫ ∬ ∮ ≈ ≠ ≡ ≅ ∼ ≤ ≥ ≪ ≫ ∀ ∃ ∄ ∈ ∉ ∋ ∩ ∪ ⊂ ⊃ ⊆ ⊇ ∅ ∧ ∨ ¬ ⊥ ∥ ∠ ⌀ ℕ ℤ ℚ ℝ ℂ ℵ ‰ ′ ″ °'],
    ['Pfeile', '← → ↑ ↓ ↔ ↕ ↖ ↗ ↘ ↙ ⇐ ⇒ ⇑ ⇓ ⇔ ⇕ ⇌ ⇋ ↺ ↻ ➔ ➜ ➤ ⟶ ⟵ ⟷ ⟹ ⟸ ⟺'],
    ['Währung', '€ $ ¢ £ ¥ ₣ ₤ ₹ ₽ ₩ ₺ ₪ ₫ ₱ ₴ ₸ ₿ ¤'],
    ['Hoch/tief', '⁰ ¹ ² ³ ⁴ ⁵ ⁶ ⁷ ⁸ ⁹ ⁺ ⁻ ⁼ ⁽ ⁾ ⁿ ₀ ₁ ₂ ₃ ₄ ₅ ₆ ₇ ₈ ₉ ₊ ₋ ₌ ₍ ₎'],
    ['Satzzeichen', '„ “ ” ‚ ‘ ’ « » ‹ › – — … · • ¡ ¿ § ¶ † ‡ ※ ‽ ⁂ ° ′ ″ ‰'],
    ['Formen', '■ □ ▪ ▫ ▲ △ ▼ ▽ ◆ ◇ ● ○ ◉ ◎ ★ ☆ ✓ ✔ ✗ ✘ ☐ ☑ ☒ ♠ ♣ ♥ ♦ ☺ ☹ ☀ ☁ ☂ ☎ ✉ ✂ ✎ ⚠ ⚡'],
    ['Buchstaben', 'À Á Â Ã Ä Å Æ Ç È É Ê Ë Ì Í Î Ï Ñ Ò Ó Ô Õ Ö Ø Œ Ù Ú Û Ü Ý ß à á â ã ä å æ ç è é ê ë ì í î ï ñ ò ó ô õ ö ø œ ù ú û ü ý ÿ'],
  ],
  /* Ziel merken (Schreibmarke im Text bzw. Excel-Zelle), Fenster zeigen, Zeichen einfügen */
  async show() {
    if (Store.readOnly) return;
    const sel = getSelection(), range = sel.rangeCount ? sel.getRangeAt(0).cloneRange() : null;
    const editing = Canvas.editing, xl = typeof Sheet !== 'undefined' && Sheet.active ? { ...Sheet.active } : null, xed = typeof Sheet !== 'undefined' && Sheet.edit ? Sheet.edit : null;
    const t0 = xed ? (xed.inBar ? Sheet.barIn : Sheet.ed) : null, tpos = t0 ? [t0.selectionStart, t0.selectionEnd] : null;
    if (!editing && !xl && typeof OfficeWord !== 'undefined' && OfficeWord.on()) { if (!OfficeDoc.ensureEdit()) return; }
    const insert = (ch) => {
      const rec = [ch, ...(Store.ui.symRecent || []).filter(x => x !== ch)].slice(0, 16); Store.ui.symRecent = rec; UiState.saveSoon();
      if (t0 && Sheet.edit) { const s = tpos[0] ?? t0.value.length; t0.value = t0.value.slice(0, s) + ch + t0.value.slice(tpos[1] ?? s); tpos[0] = tpos[1] = s + ch.length; t0.dispatchEvent(new Event('input', { bubbles: true })); return; }
      if (xl && !Canvas.editing) { const d = Sheet.data(xl.id); if (!d || Sheet.locked(xl.id, xl.c, xl.r)) return; Sheet.setCells(xl.id, [[xl.c, xl.r, Sheet.raw(d, xl.c, xl.r) + ch]], 'Symbol'); return; }
      const id = Canvas.editing || editing; const t = id && Canvas.textEl(id);
      if (!t) { UI.toast('Zuerst in den Text klicken'); return; }
      t.focus();
      const s2 = getSelection();
      if (range && t.contains(range.startContainer)) { s2.removeAllRanges(); s2.addRange(range); }
      document.execCommand('insertText', false, ch);
      if (s2.rangeCount) { const r = s2.getRangeAt(0); range && range.setStart(r.endContainer, r.endOffset); range && range.collapse(true); }
    };
    await UI.dialog((dlg, close) => {
      dlg.classList.add('kt-saveas', 'sym-dlg');
      dlg.append(el('h2', { text: 'Symbol' }));
      const tabs = el('div', { class: 'xt-tabs' }), grid = el('div', { class: 'sym-grid' }), info = el('div', { class: 'sym-info' });
      const code = el('input', { type: 'text', class: 'sa-name', placeholder: 'Zeichencode, z.B. 2211 oder U+2211' });
      const draw = (chars) => { grid.innerHTML = ''; for (const ch of chars) { const b = el('button', { type: 'button', class: 'sym-c', text: ch, title: 'U+' + ch.codePointAt(0).toString(16).toUpperCase().padStart(4, '0') }); b.addEventListener('mouseenter', () => { info.textContent = b.title + '  ' + ch; }); b.addEventListener('click', () => insert(ch)); b.addEventListener('dblclick', () => close(true)); grid.append(b); } };
      const sets = [...((Store.ui.symRecent || []).length ? [['Zuletzt verwendet', Store.ui.symRecent.join(' ')]] : []), ...this.SETS];
      sets.forEach(([n, s], i) => { const b = el('button', { type: 'button', class: 'xt-tab' + (i ? '' : ' on'), text: n }); b.addEventListener('click', () => { for (const x of tabs.children) x.classList.toggle('on', x === b); draw(s.split(' ').filter(Boolean)); }); tabs.append(b); });
      draw(sets[0][1].split(' ').filter(Boolean));
      code.addEventListener('keydown', (e) => { if (e.key !== 'Enter') return; e.preventDefault(); const h = code.value.trim().replace(/^u\+/i, ''); const n = parseInt(h, 16); if (n > 31 && n < 0x110000) insert(String.fromCodePoint(n)); });
      dlg.append(tabs, grid, info, el('label', { class: 'sa-row' }, el('span', { text: 'Zeichencode' }), code), el('div', { class: 'dlg-btns' }, el('button', { class: 'btn primary', type: 'button', text: 'Schliessen', onclick: () => close(true) })));
    }, { wide: true });
  },
};
if (typeof module !== 'undefined') module.exports = { OfficeWX, OfficeSym };
