'use strict';
/* PowerPoint-Seiten (1.61) – .pptx lesen, als Folien auf der Seite bearbeiten, Änderungen verlustfrei zurückschreiben.
 *
 * Darstellung: jede Folie ist ein Hintergrund-Feld (b.bg, Bild = Folienhintergrund bzw. Farbe) mit
 * b.ox = { k:'folie', part }, darüber Textfelder (k:'sp'), Bilder (k:'pic'), Tabellen (k:'tbl'), gesperrte
 * Platzhalter für Diagramme/SmartArt/OLE (k:'obj'), Formen-Geometrie als Zeichnungen (d.office='form', nur Anzeige),
 * Notizen rechts daneben (k:'notiz'). Lage: Feld-Ursprung = Folien-Feld-Ursprung + Versatz × Massstab
 * (p.office.scale) – gleiche Innenabstände heben sich auf; Zeichnungen liegen am Inhalts-Ursprung (+11/+13).
 * Textformat: Grösse, Farbe, Schrift, fett/kursiv werden über die Vererbung Lauf → Absatz → Form-lstStyle →
 * Layout-/Master-Platzhalter → Master-txStyles → Präsentation aufgelöst (props). Der Export vergleicht das neue HTML
 * mit genau diesen Werten und schreibt nur Abweichungen (Attribut b/i/u/sz, Füllung, Schrift), sonst bleibt der
 * Original-Lauf (rPr geklont). Unveränderte Felder/Folien → Teil wird gar nicht angefasst. */
const OfficePpt = {
  get P() { return Ooxml.NS.p; }, get A() { return Ooxml.NS.a; }, get R() { return Ooxml.NS.r; },
  GAP: 220,   // viel Platz zwischen den Folien (Lernansicht, 1.67; vorher 80)
  get X() { return OfficePages; },

  /* ---------------------------------------------------------------- Farben, Design */
  async theme(pkg, masterPath) {
    const X = this.X, A = this.A, P = this.P;
    const th = { scheme: {}, map: { bg1: 'lt1', tx1: 'dk1', bg2: 'lt2', tx2: 'dk2' }, major: '', minor: '', bgFill: [] };
    if (!masterPath) return th;
    const md = await pkg.xml(masterPath);
    const cm = X.q(md, P, 'clrMap')[0];
    if (cm) for (const a of cm.attributes) th.map[a.name] = a.value;
    const tr = (await pkg.rels(masterPath)).find(r => /\/theme$/.test(r.type));
    if (tr && pkg.has(tr.path)) {
      const td = await pkg.xml(tr.path);
      const cs = X.q(td, A, 'clrScheme')[0];
      if (cs) for (const c of [...cs.children]) { const v = this.color(c, th); if (v) th.scheme[c.localName] = v; }
      const mj = X.q(td, A, 'majorFont')[0], mn = X.q(td, A, 'minorFont')[0];
      th.major = mj && X.kid(mj, A, 'latin') ? X.kid(mj, A, 'latin').getAttribute('typeface') : '';
      th.minor = mn && X.kid(mn, A, 'latin') ? X.kid(mn, A, 'latin').getAttribute('typeface') : '';
      const bfl = X.q(td, A, 'bgFillStyleLst')[0];
      th.bgFill = bfl ? [...bfl.children] : [];
    }
    return th;
  },
  /* Farbe aus einem Element, das ein Farb-Kind hat (solidFill, clrScheme-Eintrag, …) → '#rrggbb' */
  color(el, th, ph) {
    if (!el) return null;
    const c = [...el.children].find(k => /^(srgbClr|schemeClr|sysClr|prstClr|scrgbClr|hslClr)$/.test(k.localName));
    if (!c) return null;
    let hex = null;
    const v = c.getAttribute('val');
    if (c.localName === 'srgbClr') hex = v;
    else if (c.localName === 'sysClr') hex = c.getAttribute('lastClr') || (v === 'window' ? 'FFFFFF' : '000000');
    else if (c.localName === 'prstClr') hex = { white: 'FFFFFF', black: '000000', red: 'FF0000', green: '008000', blue: '0000FF', yellow: 'FFFF00', gray: '808080', grey: '808080' }[v] || '000000';
    else if (c.localName === 'scrgbClr') hex = ['r', 'g', 'b'].map(k => Math.round(Math.min(1, (+c.getAttribute(k) || 0) / 100000) * 255).toString(16).padStart(2, '0')).join('');
    else if (c.localName === 'schemeClr') {
      if (v === 'phClr') hex = ph ? ph.slice(1) : null;
      else { const k = (th && th.map[v]) || v; const s = th && th.scheme[k]; hex = s ? s.slice(1) : null; }
    }
    if (!hex || !/^[0-9a-f]{6}$/i.test(hex)) return null;
    let [r, g, b] = [0, 2, 4].map(i => parseInt(hex.slice(i, i + 2), 16));
    for (const m of c.children) {
      const x = (+m.getAttribute('val') || 0) / 100000;
      if (m.localName === 'tint') { r = 255 - (255 - r) * x; g = 255 - (255 - g) * x; b = 255 - (255 - b) * x; }
      else if (m.localName === 'shade') { r *= x; g *= x; b *= x; }
      else if (m.localName === 'lumMod' || m.localName === 'lumOff') {
        const hsl = this.hsl(r, g, b);
        hsl[2] = m.localName === 'lumMod' ? hsl[2] * x : Math.min(1, hsl[2] + x);
        [r, g, b] = this.rgb(...hsl);
      }
    }
    return '#' + [r, g, b].map(n => Math.round(Math.max(0, Math.min(255, n))).toString(16).padStart(2, '0')).join('');
  },
  hsl(r, g, b) { r /= 255; g /= 255; b /= 255; const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2; if (mx === mn) return [0, 0, l]; const d = mx - mn, s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn); const h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; return [h / 6, s, l]; },
  rgb(h, s, l) { if (!s) return [l * 255, l * 255, l * 255]; const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q; const f = (t) => { t = (t + 1) % 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; }; return [f(h + 1 / 3) * 255, f(h) * 255, f(h - 1 / 3) * 255]; },
  fillOf(spPr, th) {
    if (!spPr) return null;
    const X = this.X, A = this.A;
    if (X.kid(spPr, A, 'noFill')) return 'none';
    const sf = X.kid(spPr, A, 'solidFill');
    if (sf) return this.color(sf, th);
    const gf = X.kid(spPr, A, 'gradFill');
    if (gf) { const gs = X.q(gf, A, 'gs')[0]; return gs ? this.color(gs, th) : null; }
    return null;
  },

  /* ---------------------------------------------------------------- Text-Vererbung */
  phOf(sp) { const ph = this.X.q(sp, this.P, 'ph')[0]; return ph ? { type: ph.getAttribute('type') || 'body', idx: ph.getAttribute('idx') || '' } : null; },
  isTitle(ph) { return !!ph && /^(title|ctrTitle)$/.test(ph.type); },
  findPh(doc, ph, byType) {
    if (!doc || !ph) return null;
    const sps = this.X.q(doc, this.P, 'sp');
    if (!byType && ph.idx) { const m = sps.find(sp => { const q = this.phOf(sp); return q && q.idx === ph.idx; }); if (m) return m; }
    const want = this.isTitle(ph) ? ['title', 'ctrTitle'] : [ph.type];
    return sps.find(sp => { const q = this.phOf(sp); return q && (want.includes(q.type) || (this.isTitle(ph) && this.isTitle(q))); }) ||
      (byType && !this.isTitle(ph) ? sps.find(sp => { const q = this.phOf(sp); return q && q.type === 'body'; }) : null);
  },
  /* Liste der lstStyle-artigen Elemente (spezifischste zuerst) für eine Form */
  styleChain(sp, ctx) {
    const X = this.X, A = this.A, P = this.P;
    const out = [];
    const ls = (s) => { const tb = s && (X.kid(s, P, 'txBody') || X.kid(s, A, 'txBody')); const l = tb && X.kid(tb, A, 'lstStyle'); if (l) out.push(l); };
    ls(sp);
    const ph = this.phOf(sp);
    if (ph) {
      ls(this.findPh(ctx.layout, ph));
      ls(this.findPh(ctx.master, ph, true));
      const tx = ctx.master && X.q(ctx.master, P, 'txStyles')[0];
      const st = tx && X.kid(tx, P, this.isTitle(ph) ? 'titleStyle' : 'bodyStyle');
      if (st) out.push(st);
    } else if (!ctx.notes) {
      const tx = ctx.master && X.q(ctx.master, P, 'txStyles')[0];
      const st = tx && X.kid(tx, P, 'otherStyle');
      if (st) out.push(st);
    }
    if (ctx.defText) out.push(ctx.defText);
    return out;
  },
  lvlOf(list, lvl) { return list.map(l => this.X.kid(l, this.A, `lvl${lvl + 1}pPr`)).filter(Boolean); },
  /* Absatz-Eigenschaften: Ausrichtung, Aufzählung */
  paraProps(p, chain) {
    const X = this.X, A = this.A;
    const pPr = X.kid(p, A, 'pPr');
    const lvl = +(pPr && pPr.getAttribute('lvl') || 0);
    const lv = [pPr, ...this.lvlOf(chain, lvl)].filter(Boolean);
    let algn = '', bullet = false;
    for (const e of lv) if (e.getAttribute('algn')) { algn = e.getAttribute('algn'); break; }
    for (const e of lv) { if (X.kid(e, A, 'buNone')) { bullet = false; break; } if (X.kid(e, A, 'buChar') || X.kid(e, A, 'buAutoNum')) { bullet = X.kid(e, A, 'buAutoNum') ? 'ol' : 'ul'; break; } }
    return { lvl, algn: { ctr: 'center', r: 'right', just: 'justify', dist: 'justify' }[algn] || '', bullet, lv };
  },
  /* Lauf-Eigenschaften (pt, Farbe, Schrift, b/i/u/s) aus rPr + Vererbung */
  runProps(rPr, pp, ctx) {
    const X = this.X, A = this.A;
    const list = [rPr, ...pp.lv.map(e => X.kid(e, A, 'defRPr'))].filter(Boolean);
    const first = (f) => { for (const e of list) { const v = f(e); if (v != null) return v; } return null; };
    const bool = (k) => first(e => e.hasAttribute(k) ? /^(1|true)$/.test(e.getAttribute(k)) : null);
    const pt = (first(e => e.getAttribute('sz') ? +e.getAttribute('sz') / 100 : null) || 18) * (ctx.fontScale || 1);
    let color = first(e => { if (X.kid(e, A, 'noFill')) return null; const sf = X.kid(e, A, 'solidFill'); return sf ? this.color(sf, ctx.th) || null : null; });
    if (!color) color = ctx.inkDefault || null;
    let font = first(e => { const l = X.kid(e, A, 'latin'); return l ? l.getAttribute('typeface') : null; }) || '';
    if (font === '+mj-lt') font = ctx.th.major; else if (font === '+mn-lt') font = ctx.th.minor;
    if (/^\+/.test(font)) font = '';
    return { pt, color, font, b: !!bool('b'), i: !!bool('i'), u: !!first(e => e.hasAttribute('u') ? e.getAttribute('u') !== 'none' : null), s: !!first(e => e.hasAttribute('strike') ? e.getAttribute('strike') !== 'noStrike' : null), base: first(e => e.hasAttribute('baseline') ? +e.getAttribute('baseline') : null) || 0 };
  },
  pxOf(props, scale) { return Math.round(Ooxml.pt2px(props.pt) * scale * 10) / 10; },
  runHtml(text, r, scale) {
    let t = escapeHtml(text);
    const st = `font-size:${this.pxOf(r, scale)}px;` + (r.color ? `color:${r.color};` : '') + (r.font ? `font-family:${r.font.replace(/[;"<>]/g, '')};` : '');
    t = `<span style="${st}">${t}</span>`;
    if (r.base > 0) t = `<sup>${t}</sup>`; else if (r.base < 0) t = `<sub>${t}</sub>`;
    if (r.s) t = `<s>${t}</s>`; if (r.u) t = `<u>${t}</u>`; if (r.i) t = `<i>${t}</i>`; if (r.b) t = `<b>${t}</b>`;
    return t;
  },
  /* txBody → HTML (Absätze als div bzw. Aufzählung als ul/li) */
  textHtml(txBody, chain, ctx, scale) {
    const X = this.X, A = this.A;
    if (!txBody) return '';
    const bp = X.kid(txBody, A, 'bodyPr'), na = bp && X.kid(bp, A, 'normAutofit');
    const c2 = { ...ctx, fontScale: na && na.getAttribute('fontScale') ? +na.getAttribute('fontScale') / 100000 : 1 };
    let out = '', depth = 0;
    const setDepth = (d) => { while (depth < d) { out += '<ul>'; depth++; } while (depth > d) { out += '</ul>'; depth--; } };
    for (const p of X.kids(txBody, A, 'p')) {
      const pp = this.paraProps(p, chain);
      let line = '';
      for (const r of [...p.childNodes].filter(n => n.nodeType === 1)) {
        if (r.localName === 'br') { line += '<br>'; continue; }
        if (r.localName !== 'r' && r.localName !== 'fld') continue;
        const t = X.kids(r, A, 't').map(x => x.textContent).join('');
        if (!t) continue;
        line += this.runHtml(t, this.runProps(X.kid(r, A, 'rPr'), pp, c2), scale);
      }
      const al = pp.algn ? ` style="text-align:${pp.algn}"` : '';
      if (pp.bullet && line) { setDepth(pp.lvl + 1); out += `<li${al}>${line}</li>`; }
      else { setDepth(0); out += `<div${al}>${line || '<br>'}</div>`; }
    }
    setDepth(0);
    // nur leere Absätze → kein Text
    return /<span/.test(out) ? out : '';
  },

  /* ---------------------------------------------------------------- Lage */
  xfrmOf(sp) {
    const X = this.X, A = this.A, P = this.P;
    const spPr = X.kid(sp, P, 'spPr') || X.kid(sp, P, 'grpSpPr');
    let x = spPr ? X.kid(spPr, A, 'xfrm') : null;
    if (!x && sp.localName === 'graphicFrame') x = X.kid(sp, P, 'xfrm');
    if (!x) return null;
    const off = X.kid(x, A, 'off'), ext = X.kid(x, A, 'ext');
    return off && ext ? { x: +off.getAttribute('x'), y: +off.getAttribute('y'), w: +ext.getAttribute('cx'), h: +ext.getAttribute('cy'), rot: +(x.getAttribute('rot') || 0) } : null;
  },
  inheritedXfrm(sp, ctx) {
    const ph = this.phOf(sp);
    if (!ph) return null;
    for (const [d, bt] of [[ctx.layout, false], [ctx.master, true]]) { const m = this.findPh(d, ph, bt); const x = m && this.xfrmOf(m); if (x) return x; }
    return null;
  },
  /* Hintergrund (Folie → Layout → Master): { color } oder { img: Pfad } */
  async bgOf(pkg, docs, th) {
    const X = this.X, A = this.A, P = this.P;
    for (const [part, d] of docs) {
      const bg = d && X.q(d, P, 'bg')[0];
      if (!bg) continue;
      const pr = X.kid(bg, P, 'bgPr');
      if (pr) {
        const bf = X.kid(pr, A, 'blipFill'), bl = bf && X.kid(bf, A, 'blip');
        if (bl) {
          const r = (await pkg.rels(part)).find(x => x.id === X.at(bl, this.R, 'embed'));
          const du = X.kid(bl, A, 'duotone');
          const duo = du ? [...du.children].map(c => { const w = pkg.docs ? null : null; void w; const tmp = c.ownerDocument.createElementNS(A, 'x'); tmp.append(c.cloneNode(true)); return this.color(tmp, th); }) : null;
          if (r && r.path) return { img: r.path, color: null, duo: duo && duo.length === 2 && duo.every(Boolean) ? duo : null };
        }
        const c = this.fillOf(pr, th);
        if (c && c !== 'none') return { color: c };
      }
      const ref = X.kid(bg, P, 'bgRef');
      if (ref) {
        const ph = this.color(ref, th);
        const idx = +ref.getAttribute('idx');
        const st = th.bgFill[idx >= 1001 ? idx - 1001 : idx - 1];
        const c = st && st.localName === 'solidFill' ? this.color(st, th, ph) : ph;
        if (c) return { color: c };
      }
      return { color: '#ffffff' };
    }
    return { color: '#ffffff' };
  },

  /* Hintergrundbild: { name, mean } – mit Duoton als umgefärbte Kopie (JPEG, nur Anzeige; Original bleibt in der Datei) */
  async bgImage(pkg, path, duo) {
    try {
      const m = duo ? null : await this.X.media(pkg, path);
      const u8 = await pkg.bytes(path);
      const ext = path.split('.').pop().toLowerCase();
      const bm = await createImageBitmap(new Blob([u8], { type: ext === 'png' ? 'image/png' : 'image/jpeg' }));
      const meanOf = (src, w, h) => { const c = document.createElement('canvas'); c.width = 24; c.height = 14; const g = c.getContext('2d'); g.drawImage(src, 0, 0, w, h, 0, 0, 24, 14); const d = g.getImageData(0, 0, 24, 14).data; let r = 0, gg = 0, b = 0; for (let i = 0; i < d.length; i += 4) { r += d[i]; gg += d[i + 1]; b += d[i + 2]; } const n = d.length / 4; return '#' + [r, gg, b].map(v => Math.round(v / n).toString(16).padStart(2, '0')).join(''); };
      if (!duo) { const mean = meanOf(bm, bm.width, bm.height); bm.close && bm.close(); return m ? { name: m.name, mean } : null; }
      const k = Math.min(1, 1920 / bm.width);
      const c = document.createElement('canvas'); c.width = Math.round(bm.width * k); c.height = Math.round(bm.height * k);
      const g = c.getContext('2d'); g.drawImage(bm, 0, 0, c.width, c.height); bm.close && bm.close();
      const id = g.getImageData(0, 0, c.width, c.height), d = id.data;
      const [a, b] = duo.map(h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16)));
      for (let i = 0; i < d.length; i += 4) { const L = (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) / 255; d[i] = a[0] + (b[0] - a[0]) * L; d[i + 1] = a[1] + (b[1] - a[1]) * L; d[i + 2] = a[2] + (b[2] - a[2]) * L; }
      g.putImageData(id, 0, 0);
      const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.9));
      return { name: await Backend.saveImage(blob), mean: meanOf(c, c.width, c.height) };
    } catch (e) { return null; }
  },

  /* ---------------------------------------------------------------- Import */
  async read(pkg, p, y0) {
    const X = this.X, P = this.P, A = this.A, R = this.R;
    const pres = await pkg.xml(pkg.main);
    const prels = await pkg.rels(pkg.main);
    const sz = X.q(pres, P, 'sldSz')[0];
    const cx = +(sz ? sz.getAttribute('cx') : 9144000), cy = +(sz ? sz.getAttribute('cy') : 6858000);
    const SW = Ooxml.emu2px(cx), SH = Ooxml.emu2px(cy);
    const scale = Math.min(1, 900 / SW);
    const o = p.office;
    Object.assign(o, { cx, cy, scale, slides: [] });
    const defText = X.q(pres, P, 'defaultTextStyle')[0] || null;
    let y = y0 + 34, n = 0;   // Platz für die Beschriftung „Folie n“
    for (const sid of X.q(pres, P, 'sldId')) {
      const r = prels.find(x => x.id === X.at(sid, R, 'id'));
      if (!r || !pkg.has(r.path)) continue;
      n++;
      const f = await this.readSlide(pkg, p, r.path, OfficeSlides.FX, y, n, defText);
      y = f.y + SH * scale + 13 + this.GAP;
    }
    if (!n) await this.addSlide(p, null, { x: OfficeSlides.FX, y });   // leere Präsentation: eine leere Folie
    o.lay = 2;   // Anordnung 1.67: Notizen links, viel Platz
    if (typeof OfficePX !== 'undefined') await OfficePX.read(pkg, p);   // Endlosschleife (1.72)
  },
  async ctxOf(pkg, part, defText) {
    const X = this.X;
    const srels = await pkg.rels(part);
    const lr = srels.find(r => /slideLayout$/.test(r.type));
    const layout = lr && pkg.has(lr.path) ? await pkg.xml(lr.path) : null;
    const mr = lr ? (await pkg.rels(lr.path)).find(r => /slideMaster$/.test(r.type)) : null;
    const master = mr && pkg.has(mr.path) ? await pkg.xml(mr.path) : null;
    const th = await this.theme(pkg, mr && mr.path);
    // Farbschema-Überschreibung der Folie (themeOverride)
    const to = srels.find(r => /themeOverride$/.test(r.type));
    if (to && pkg.has(to.path)) { try { const td = await pkg.xml(to.path); const cs = X.q(td, Ooxml.NS.a, 'clrScheme')[0]; if (cs) { th.scheme = { ...th.scheme }; for (const c of [...cs.children]) { const v = this.color(c, th); if (v) th.scheme[c.localName] = v; } } } catch (e) { /* */ } }
    const om = layout && X.q(layout, this.P, 'clrMapOvr')[0];
    const ov = om && X.kid(om, Ooxml.NS.a, 'overrideClrMapping');
    if (ov) { th.map = { ...th.map }; for (const a of ov.attributes) th.map[a.name] = a.value; }
    return { srels, layout, layoutPath: lr && lr.path, master, masterPath: mr && mr.path, th, defText };
  },
  async readSlide(pkg, p, part, fx, fy, n, defText) {
    const X = this.X, P = this.P, A = this.A, R = this.R;
    const o = p.office, scale = o.scale;
    const SW = Ooxml.emu2px(o.cx), SH = Ooxml.emu2px(o.cy);
    const sd = await pkg.xml(part);
    const ctx = await this.ctxOf(pkg, part, defText);
    const bg = await this.bgOf(pkg, [[part, sd], [ctx.layoutPath, ctx.layout], [ctx.masterPath, ctx.master]], ctx.th);
    ctx.inkDefault = ctx.th.scheme[ctx.th.map.tx1 || 'dk1'] || null;
    // Folie = Hintergrund-Feld mit Bild (Hintergrundbild oder Farbfläche); Bild: mittlere Farbe für Kontrast und
    // Formen „wie Hintergrund“ (useBgFill); Duoton (Umfärben in zwei Farben) wird für die Anzeige nachgebildet
    const bi = bg.img ? await this.bgImage(pkg, bg.img, bg.duo) : null;
    const bgColor = (bi && bi.mean) || bg.color || '#ffffff';
    ctx.bgColor = bgColor;
    const src = bi ? bi.name : await X.solid(bgColor);
    const frame = X.addBox(fx, fy, SW * scale + 22, '', { bg: true, images: [{ id: uid('i'), src, x: 0, y: 0, w: Math.round(SW * scale), h: Math.round(SH * scale) }], ox: { k: 'folie', part, n, bg: bgColor }, office: 'folie', style: { border: '#b9b9c6' } });
    X.addBox(fx, fy - 40, 200, `<div style="color:#888;font-size:12px">Folie ${n}</div>`, { office: 'label', style: { bg: 'transparent' }, ox: { k: 'label', f: frame.id } });
    const info = { part, ids: [], f: frame.id };
    p.office.slides.push(info);
    const tree = X.q(sd, P, 'spTree')[0];
    const ox0 = fx, oy0 = fy;   // Feld-Ursprung der Folie
    const place = async (sp, off) => {
      const tag = sp.localName;
      const idEl = X.q(sp, P, 'cNvPr')[0], id = idEl ? idEl.getAttribute('id') : null;
      if (tag === 'grpSp') {
        const gx = X.q(sp, A, 'xfrm')[0];
        const o2 = gx && X.kid(gx, A, 'off'), e = gx && X.kid(gx, A, 'ext'), co = gx && X.kid(gx, A, 'chOff'), ce = gx && X.kid(gx, A, 'chExt');
        const sx = e && ce && +ce.getAttribute('cx') ? +e.getAttribute('cx') / +ce.getAttribute('cx') : 1, sy = e && ce && +ce.getAttribute('cy') ? +e.getAttribute('cy') / +ce.getAttribute('cy') : 1;
        const inner = { under: off.under, x: off.x + (o2 ? +o2.getAttribute('x') : 0) * off.sx - (co ? +co.getAttribute('x') : 0) * sx * off.sx, y: off.y + (o2 ? +o2.getAttribute('y') : 0) * off.sy - (co ? +co.getAttribute('y') : 0) * sy * off.sy, sx: sx * off.sx, sy: sy * off.sy, g: true };
        for (const c of [...sp.children].filter(c => /^(sp|pic|grpSp|graphicFrame|cxnSp)$/.test(c.localName))) await place(c, inner);
        return;
      }
      const own = this.xfrmOf(sp);
      const xf = own || this.inheritedXfrm(sp, ctx);
      if (!xf) return;
      const ex = off.x + xf.x * off.sx, ey = off.y + xf.y * off.sy, ew = xf.w * off.sx, eh = xf.h * off.sy;
      const X0 = ox0 + Ooxml.emu2px(ex) * scale, Y0 = oy0 + Ooxml.emu2px(ey) * scale;
      const Wd = Math.max(20, Ooxml.emu2px(ew) * scale), Hd = Math.max(4, Ooxml.emu2px(eh) * scale);
      const base = { part, id, x0: Math.round(X0), y0: Math.round(Y0), g: !!off.g, eh: own ? null : Math.round(eh), ew: own ? null : Math.round(ew) };
      if (tag === 'sp' || tag === 'cxnSp') {
        const spPr = X.kid(sp, P, 'spPr');
        const fill = sp.getAttribute('useBgFill') === '1' ? ctx.bgColor : this.fillOf(spPr, ctx.th);
        const ln = spPr && X.kid(spPr, A, 'ln');
        const lnc = ln && !X.kid(ln, A, 'noFill') ? (this.fillOf(ln, ctx.th) || null) : null;
        const geo = spPr && X.kid(spPr, A, 'prstGeom') ? X.kid(spPr, A, 'prstGeom').getAttribute('prst') : spPr && X.kid(spPr, A, 'custGeom') ? 'cust' : '';
        // Formen-Geometrie (nur Anzeige): Fläche bzw. Linie als Zeichnung
        const shape = tag === 'cxnSp' || /^(line|straightConnector1)$/.test(geo) ? 'line' : /ellipse|oval/.test(geo) ? 'ellipse' : /triangle/.test(geo) ? 'triangle' : /diamond/.test(geo) ? 'diamond' : /rect|Rect|snip|round|flowChartProcess|plaque|cust/.test(geo) ? 'rect' : null;
        const txBody = X.kid(sp, P, 'txBody');
        const html = txBody ? this.textHtml(txBody, this.styleChain(sp, ctx), ctx, scale) : '';
        const hasFill = fill && fill !== 'none';
        if (shape === 'rect' && hasFill && !html && off.under && !xf.rot) {
          // Fläche unter späteren Bildern (z.B. ganzflächiges Rechteck): als Hintergrund-Feld, sonst läge sie über den Bildern
          X.addBox(X0, Y0, Wd + 22, '', { bg: true, images: [{ id: uid('i'), src: await X.solid(fill), x: 0, y: 0, w: Math.round(Wd), h: Math.round(Hd) }], office: 'form', ox: { k: 'form', f: null }, style: { border: 'transparent' } });
        } else if (shape && (hasFill || lnc) && !(html && shape === 'rect' && !lnc)) {
          let x1 = X0 + 11, y1 = Y0 + 13;
          let Wd2 = Wd, Hd2 = Hd;
          if (Math.round(xf.rot / 5400000) % 2 === 1 && shape !== 'line') { x1 += (Wd - Hd) / 2; y1 += (Hd - Wd) / 2; Wd2 = Hd; Hd2 = Wd; }
          Canvas.page.drawings.push({ id: uid('d'), type: 'shape', shape, x1, y1: shape === 'line' && xf.rot ? y1 + Hd2 : y1, x2: x1 + Wd2, y2: y1 + Hd2, color: lnc || fill, w: Math.max(1, (ln && +ln.getAttribute('w') ? Ooxml.emu2px(+ln.getAttribute('w')) : 1) * scale), fill: hasFill && shape !== 'line' ? fill : null, t0: Date.now(), layer: 'unten', office: 'form' });
        }
        if (!html) return;
        const style = hasFill && (shape === 'rect' || !shape) ? { bg: fill, border: fill } : { bg: 'transparent', under: bgColor };
        const b = X.addBox(X0, Y0, Wd + 22, html, { locked: false, office: null, style, ox: { ...base, k: 'sp', w0: Math.round(Wd + 22), h: '' } });
        b.ox.h = b.html;
        info.ids.push(id);
      } else if (tag === 'pic') {
        const blip = X.q(sp, A, 'blip')[0], rel = blip && ctx.srels.find(x => x.id === X.at(blip, R, 'embed'));
        // 1.75: Zuschnitt, Drehung, Spiegeln und EXIF wie PowerPoint (OfficeWI.picture brennt sie ins Bild)
        const pxf = X.q(sp, A, 'xfrm')[0], src = X.q(sp, A, 'srcRect')[0];
        const f = { w: Wd, h: Hd, rot: (xf.rot || 0) / 60000, flipH: !!pxf && pxf.getAttribute('flipH') === '1', flipV: !!pxf && pxf.getAttribute('flipV') === '1', crop: src ? { l: (+src.getAttribute('l') || 0) / 1e5, t: (+src.getAttribute('t') || 0) / 1e5, r: (+src.getAttribute('r') || 0) / 1e5, b: (+src.getAttribute('b') || 0) / 1e5 } : null };
        const mm = rel && rel.path ? (typeof OfficeWI !== 'undefined' ? await OfficeWI.picture(pkg, rel.path, f) : await X.media(pkg, rel.path)) : null;
        if (mm) {
          const bw = mm.w && typeof OfficeWI !== 'undefined' ? mm.w : Wd, bh = mm.h && typeof OfficeWI !== 'undefined' ? mm.h : Hd;
          const bx = X0 - (bw - Wd) / 2, by = Y0 - (bh - Hd) / 2, r90 = Math.round(((f.rot % 180) + 180) % 180 / 90) === 1;
          const b = X.addBox(bx, by, bw + 22, '', { locked: false, office: null, images: [{ id: uid('i'), src: mm.name, x: 0, y: 0, w: Math.round(bw), h: Math.round(bh) }], style: { bg: 'transparent', under: bgColor }, ox: { ...base, x0: Math.round(bx), y0: Math.round(by), k: 'pic', w0: Math.round(bw + 22), iw: Math.round(bw), ih: Math.round(bh), ...(r90 ? { r90: true } : {}) } });
          void b;
        } else X.addBox(X0, Y0, Math.max(120, Wd + 22), `<div style="color:#777">🔒 Bild (${escapeHtml((rel && rel.path || '').split('.').pop() || '?')}) – nur in PowerPoint sichtbar</div>`, { ox: { ...base, k: 'obj' }, style: { bg: 'transparent', under: bgColor } });
        info.ids.push(id);
      } else if (tag === 'graphicFrame') {
        const tbl = X.q(sp, A, 'tbl')[0];
        if (tbl) {
          let s = '<table style="border-collapse:collapse">';
          for (const tr of X.kids(tbl, A, 'tr')) s += '<tr>' + X.kids(tr, A, 'tc').filter(tc => !tc.getAttribute('hMerge') && !tc.getAttribute('vMerge')).map(tc => `<td${+tc.getAttribute('gridSpan') > 1 ? ` colspan="${tc.getAttribute('gridSpan')}"` : ''}>${escapeHtml(X.kids(X.kid(tc, A, 'txBody'), A, 'p').map(pp => X.q(pp, A, 't').map(t => t.textContent).join('')).join('\n')).replace(/\n/g, '<br>') || '<br>'}</td>`).join('') + '</tr>';
          const b = X.addBox(X0, Y0, Wd + 22, s + '</table>', { locked: false, office: null, style: { bg: '#ffffff', border: '#ffffff' }, ox: { ...base, k: 'tbl', w0: Math.round(Wd + 22) } });
          b.ox.h = b.html;
        } else {
          const gd = X.q(sp, A, 'graphicData')[0], uri = (gd || { getAttribute: () => '' }).getAttribute('uri') || '';
          const what = /chart/.test(uri) ? 'Diagramm' : /diagram/.test(uri) ? 'SmartArt' : /ole/.test(uri) ? 'Eingebettetes Objekt' : 'Objekt';
          let done = false;
          // Diagramm (1.75): als KnowledgeTree-Diagramm mit den Werten aus der Datei
          if (/chart/.test(uri) && typeof OfficeObj !== 'undefined') {
            const ce = X.q(gd, OfficeObj.C, 'chart')[0], cr = ce && ctx.srels.find(x => x.id === X.at(ce, R, 'id'));
            const spec = cr && cr.path && pkg.has(cr.path) ? await OfficeObj.chart(pkg, cr.path) : null;
            if (spec) { OfficeObj.chartBox(spec, X0, Y0, Math.max(140, Wd - 14), Math.max(120, Hd - 22), { ox: { ...base, k: 'obj' } }); done = true; }
          }
          // SmartArt (1.75): die gespeicherte Zeichnung (Formen mit Text)
          if (!done && /diagram/.test(uri) && typeof OfficeObj !== 'undefined') {
            const html = await OfficeObj.smartArtHtml(pkg, gd, ctx.srels, Wd, Hd);
            if (html) { X.addBox(X0, Y0, Wd + 22, html, { raw: true, ox: { ...base, k: 'obj' }, style: { bg: 'transparent', under: bgColor } }); done = true; }
          }
          if (!done) X.addBox(X0, Y0, Wd + 22, `<div style="color:#777">🔒 ${what} – nur in PowerPoint bearbeitbar (bleibt in der Datei erhalten)</div>`, { ox: { ...base, k: 'obj' }, style: { bg: '#f3f3f3', border: '#dddddd' } });
        }
        info.ids.push(id);
      }
    };
    if (tree) {
      const top = [...tree.children].filter(c => /^(sp|pic|grpSp|graphicFrame|cxnSp)$/.test(c.localName));
      let lastPic = -1;
      top.forEach((c, i) => { if (c.localName === 'pic' || X.q(c, P, 'pic').length) lastPic = i; });
      for (let i = 0; i < top.length; i++) await place(top[i], { x: 0, y: 0, sx: 1, sy: 1, g: false, under: i < lastPic });
    }
    // Übergang und Animationen (1.66)
    if (typeof OfficeAnim !== 'undefined') OfficeAnim.read(sd, frame, new Map(p.boxes.filter(b => b.ox && b.ox.part === part && b.ox.id).map(b => [b.ox.id, b])));
    // Notizen
    const nr = ctx.srels.find(x => /notesSlide$/.test(x.type));
    if (nr && pkg.has(nr.path)) {
      try {
        const nd = await pkg.xml(nr.path);
        const body = X.q(nd, P, 'sp').find(sp => { const ph = this.phOf(sp); return ph && ph.type === 'body'; });
        const html = body ? this.textHtml(X.kid(body, P, 'txBody'), [], { th: ctx.th, notes: true, inkDefault: '#1f1f1f' }, 0.75) : '';
        if (html) { const b = X.addBox(fx - OfficeSlides.NOTEW - 60, fy + 13, OfficeSlides.NOTEW, html, { locked: false, office: 'notiz', style: { bg: '#fffbe6', border: '#e8dca0' }, ox: { k: 'notiz', part: nr.path, f: frame.id, h: '' } }); b.ox.h = b.html; }
      } catch (e) { /* Notizen nicht lesbar: bleiben in der Datei */ }
    }
    frame.y = fy;
    return frame;
  },

  /* ---------------------------------------------------------------- Folien auf der Seite */
  frames(p = Canvas.page) { return p ? p.boxes.filter(b => b.ox && b.ox.k === 'folie').sort((a, b) => a.y - b.y) : []; },
  size(p) { const o = p.office; return { w: Ooxml.emu2px(o.cx) * o.scale, h: Ooxml.emu2px(o.cy) * o.scale }; },
  /* liegt das Feld (Ursprung) auf der Folie? */
  inFrame(b, f, p) { const s = this.size(p); return b.x >= f.x - 2 && b.y >= f.y - 2 && b.x < f.x + s.w && b.y < f.y + s.h; },
  frameOf(b, p = Canvas.page) { return this.frames(p).find(f => this.inFrame(b, f, p)) || null; },
  /* Folie in der Mitte des Sichtbereichs */
  currentFrame() {
    const p = OfficePages.page('pptx');
    if (!p) return null;
    const fr = this.frames(p);
    if (!fr.length) return null;
    if (Canvas.sel && Canvas.sel.size) { const b = Canvas.box([...Canvas.sel][0]); const f = b && (b.ox && b.ox.k === 'folie' ? b : this.frameOf(b, p) || (b.ox && b.ox.f && Canvas.box(b.ox.f))); if (f) return f; }
    const c = Canvas.viewCenter(), s = this.size(p);
    const last = p.office.curSlide && fr.find(f => f.id === p.office.curSlide);
    if (last && c.y >= last.y - 40 && c.y <= last.y + s.h + 60) return last;
    // zuletzt gezeigte Folie noch (zur Hälfte) im Bild – z.B. oben ausgerichtet in der Lernansicht (1.68)
    if (last && Canvas.vp) { const z = Canvas.view.z, t = -Canvas.view.y / z, b = t + Canvas.vp.clientHeight / z, vis = Math.min(b, last.y + s.h) - Math.max(t, last.y); if (vis > s.h * 0.5) return last; }
    let best = fr[0], bd = Infinity;
    for (const f of fr) { const d = Math.abs(f.y + s.h / 2 - c.y); if (d < bd) { bd = d; best = f; } }
    return best;
  },
  /* alles, was zu einer Folie gehört: Felder auf der Folie, Beschriftung, Notizen, Formen */
  itemsOf(f, p) {
    const s = this.size(p);
    const boxes = p.boxes.filter(b => b === f || (b.ox && b.ox.f === f.id) || ((!b.bg || b.office === 'form') && b.office !== 'karte' && this.inFrame(b, f, p)));
    const draws = p.drawings.filter(d => { const x = Math.min(d.x1 ?? 0, d.x2 ?? 0), y = Math.min(d.y1 ?? 0, d.y2 ?? 0); return d.type === 'shape' && x >= f.x && y >= f.y && x < f.x + s.w + 22 && y < f.y + s.h + 13; });
    return { boxes, draws };
  },
  shiftItems(it, dy) { for (const b of it.boxes) { b.y += dy; if (b.ox && b.ox.y0 != null) b.ox.y0 += dy; } for (const d of it.draws) { d.y1 += dy; d.y2 += dy; if (d.pts) for (let i = 1; i < d.pts.length; i += 3) d.pts[i] += dy; } },
  /* mehrere Folien verschieben: erst alles einsammeln, dann schieben (sonst zählt ein verschobenes Feld doppelt) */
  shiftMany(p, frames, dy) {
    const boxes = new Set(), draws = new Set();
    for (const f of frames) { const it = this.itemsOf(f, p); it.boxes.forEach(b => boxes.add(b)); it.draws.forEach(d => draws.add(d)); }
    this.shiftItems({ boxes: [...boxes], draws: [...draws] }, dy);
  },
  step(p) { return this.size(p).h + 13 + this.GAP; },
  relabel(p) { if (typeof OfficePX !== 'undefined') OfficePX.renumber(p); this.frames(p).forEach((f, i) => { f.ox.n = i + 1; const l = p.boxes.find(b => b.ox && b.ox.k === 'label' && b.ox.f === f.id); if (l) l.html = sanitizeHtml(`<div style="color:#888;font-size:12px">Folie ${i + 1}</div>`); }); },
  /* neue leere Folie nach `after` (Feld) bzw. an `at` */
  async addSlide(p, after, at = null) {
    const fr = this.frames(p), s = this.size(p), st = this.step(p);
    let x = OfficeSlides.FX, y;
    if (at) { x = at.x; y = at.y; }
    else if (after) { x = after.x; y = after.y + st; this.shiftMany(p, fr.filter(f => f.y > after.y), st); }
    else { const last = fr[fr.length - 1]; y = last ? last.y + st : 120; if (last) x = last.x; }
    const color = '#ffffff';
    const src = await OfficePages.solid(color);
    const f = OfficePages.addBox(x, y, s.w + 22, '', { bg: true, images: [{ id: uid('i'), src, x: 0, y: 0, w: Math.round(s.w), h: Math.round(s.h) }], ox: { k: 'folie', part: null, n: 0 }, office: 'folie', style: { border: '#b9b9c6' } });
    OfficePages.addBox(x, y - 40, 200, '', { office: 'label', style: { bg: 'transparent' }, ox: { k: 'label', f: f.id } });
    this.relabel(p);
    return f;
  },

  /* Folie im Sichtbereich zeigen (wie die Normalansicht von PowerPoint: Folie passt rechts neben die Übersicht) */
  focusSlide(id, zoomToFit = true) {
    const p = OfficePages.page('pptx');
    const f = p && Canvas.box(id);
    if (!f) return;
    // Auswahl auf einer anderen Folie aufheben (sonst bliebe sie die „aktuelle“ Folie)
    if (Canvas.sel.size) { const b = Canvas.box([...Canvas.sel][0]); const fb = b && (b.ox && b.ox.k === 'folie' ? b : this.frameOf(b, p) || (b.ox && b.ox.f && Canvas.box(b.ox.f))); if (fb && fb.id !== f.id) { if (Canvas.editing) Canvas.stopEditing(); Canvas.select([]); } }
    // Lernansicht: Notizen + Folie + Animationsbereich; Normal: nur die Folie (office-slides.js, 1.67)
    const keepZ = Canvas.view.z;
    const v = OfficeSlides.fit(p, f);
    if (!zoomToFit && OfficeSlides.view(p) !== 'normal') { const k = keepZ / v.z; const cx = Canvas.vp.clientWidth / 2, cy = Canvas.vp.clientHeight / 2; v.x = cx - (cx - v.x) * k; v.y = cy - (cy - v.y) * k; v.z = keepZ; }
    Object.assign(Canvas.view, v);
    p.office.curSlide = f.id;
    Canvas.applyView();
    if (typeof Canvas.updateZoomUi === 'function') Canvas.updateZoomUi();
    Canvas.updateStatus();
  },
  /* Entwurf → Hintergrund formatieren: Folienhintergrund als Farbe (eine oder alle Folien) */
  async setBg(color, all = false) {
    const p = OfficePages.page('pptx');
    if (!p || Store.readOnly || !color) return;
    const fr = all ? this.frames(p) : [this.currentFrame()].filter(Boolean);
    const src = await OfficePages.solid(color);
    for (const f of fr) {
      f.images = [{ ...f.images[0], id: uid('i'), src }];
      f.ox.bg = color; f.ox.bgNew = color;
      for (const b of this.itemsOf(f, p).boxes) if (b.style && b.style.under) b.style.under = color;
    }
    Canvas.render(true);
    Hist.touchPage(p.id); Hist.commit('Folienhintergrund');
  },
  /* Entwurf → Foliengrösse: Standard (4:3) oder Breitbild (16:9); Inhalte waagrecht angepasst */
  setSize(kind) {
    const p = OfficePages.page('pptx');
    if (!p || Store.readOnly) return;
    const o = p.office, ncx = kind === '4:3' ? 9144000 : 12192000, ncy = 6858000;
    if (o.cx === ncx && o.cy === ncy) return;
    const sx = ncx / o.cx, sy = ncy / o.cy;
    const old = this.size(p);
    const fr = this.frames(p);
    const items = fr.map(f => ({ f, it: this.itemsOf(f, p) }));
    o.cx = ncx; o.cy = ncy;
    const nw = this.size(p);
    for (const { f, it } of items) {
      for (const b of it.boxes) {
        if (b === f) continue;
        if (b.ox && b.ox.k === 'notiz') continue;   // Notizen stehen links der Folie (1.67)
        if (b.ox && b.ox.k === 'label') continue;
        b.x = Math.round(f.x + (b.x - f.x) * sx); b.y = Math.round(f.y + (b.y - f.y) * sy);
        if (Canvas.isPictureBox(b)) { const im = b.images[0], k = Math.min(sx, sy); im.w = Math.round(im.w * k); im.h = Math.round(im.h * k); b.w = im.w + 22; }
        else b.w = Math.round((b.w - 22) * sx + 22);
      }
      for (const d of it.draws) { d.x1 = f.x + 11 + (d.x1 - f.x - 11) * sx; d.x2 = f.x + 11 + (d.x2 - f.x - 11) * sx; d.y1 = f.y + 13 + (d.y1 - f.y - 13) * sy; d.y2 = f.y + 13 + (d.y2 - f.y - 13) * sy; }
      f.w = Math.round(nw.w + 22);
      f.images[0].w = Math.round(nw.w); f.images[0].h = Math.round(nw.h);
    }
    Canvas.render(true);
    Hist.touchPage(p.id); Hist.commit('Foliengrösse');
    const cur = this.currentFrame(); if (cur) this.focusSlide(cur.id);
  },
  /* Befehle des Registers „Präsentation“ */
  async cmd(kind) {
    const p = OfficePages.page('pptx');
    if (!p || Store.readOnly) return;
    if (Canvas.editing) Canvas.stopEditing();
    Hist.flushPending && Hist.flushPending();
    const f = this.currentFrame();
    const fr = this.frames(p), st = this.step(p);
    let target = f, label = '';
    if (kind === 'new') { target = await this.addSlide(p, f); label = 'Neue Folie'; }
    else if (kind === 'dup' && f) {
      const it = this.itemsOf(f, p);
      const nf = await this.addSlide(p, f);
      nf.images = f.images.map(im => ({ ...im, id: uid('i') }));
      if (f.ox.part) Object.assign(nf.ox, { copyOf: f.ox.part, ids: ((p.office.slides || []).find(s => s.part === f.ox.part) || { ids: [] }).ids.slice() });
      for (const k of ['tr', 'tr0', 'animOther']) if (f.ox[k] != null) nf.ox[k] = JSON.parse(JSON.stringify(f.ox[k]));
      if (f.ox.animDirty || !f.ox.part) nf.ox.animDirty = true;
      for (const b of it.boxes) {
        if (b === f || (b.ox && b.ox.k === 'label')) continue;
        const c = JSON.parse(JSON.stringify(b));
        c.id = uid('b'); c.y += st; c.z = Canvas.maxZ() + 1;
        c.images = (c.images || []).map(im => ({ ...im, id: uid('i') }));
        if (c.ox && c.ox.k === 'notiz') c.ox = { k: 'notiz', part: null, f: nf.id, h: '' };
        else if (c.ox && f.ox.part && c.ox.part === f.ox.part) { c.ox.part = 'dup:' + nf.id; c.ox.y0 += st; }
        else if (c.ox) delete c.ox;
        p.boxes.push(c);
      }
      for (const d of it.draws) { const c = JSON.parse(JSON.stringify(d)); c.id = uid('d'); c.y1 += st; c.y2 += st; p.drawings.push(c); }
      target = nf; label = 'Folie dupliziert';
    } else if (kind === 'del' && f && fr.length > 1) {
      const it = this.itemsOf(f, p);
      const ids = new Set(it.boxes.map(b => b.id)), dids = new Set(it.draws.map(d => d.id));
      p.boxes = p.boxes.filter(b => !ids.has(b.id));
      p.drawings = p.drawings.filter(d => !dids.has(d.id));
      this.shiftMany(p, fr.filter(g => g.y > f.y), -st);
      this.relabel(p);
      target = this.frames(p).find(g => g.y >= f.y) || this.frames(p).slice(-1)[0]; label = 'Folie gelöscht';
    } else if ((kind === 'up' || kind === 'down') && f) {
      const i = fr.indexOf(f), j = kind === 'up' ? i - 1 : i + 1;
      if (j < 0 || j >= fr.length) return;
      const a = this.itemsOf(f, p), b = this.itemsOf(fr[j], p);
      const dy = fr[j].y - f.y;
      this.shiftItems(a, dy); this.shiftItems(b, -dy);
      this.relabel(p);
      label = 'Folie verschoben';
    } else if (kind === 'notes' && f) {
      // Notizen links neben der Folie (Lernansicht) bzw. in der Notizspalte (Normal) – 1.67
      if (OfficeSlides.view(p) === 'normal') { const ed = OfficeView.el && OfficeView.el.querySelector('.ofv-ncol .ofv-ned'); if (ed) { ed.focus(); return; } }
      const had = !!OfficeSlides.notesBox(f, p);
      OfficeSlides.addNotes(f, p);
      if (!had) { Hist.touchPage(p.id); Hist.commit('Notizen'); }
      return;
    } else return;
    if (Sheet && Sheet.bump) Sheet.bump();
    Canvas.render();
    Hist.touchPage(p.id);
    Hist.commit(label);
    if (target) { Canvas.select([]); Canvas.render(); p.office.curSlide = target.id; this.focusSlide(target.id, OfficeSlides.view(p) === 'normal'); }
    Ribbon.refresh();
  },

  /* ---------------------------------------------------------------- Export: Änderungen ins Paket */
  async write(pkg, p) {
    const X = this.X, P = this.P, A = this.A, R = this.R;
    const o = p.office, scale = o.scale;
    const pres = await pkg.xml(pkg.main);
    const prels = await pkg.rels(pkg.main);
    const frames = this.frames(p);
    const live = new Set(frames.map(f => f.ox.part).filter(Boolean));
    let presChanged = false;
    const lst = X.q(pres, P, 'sldIdLst')[0];
    const sldIds = () => X.kids(lst, P, 'sldId');
    const partOfSld = (e) => { const r = prels.find(x => x.id === X.at(e, R, 'id')); return r ? r.path : null; };
    // 1) gelöschte Folien
    for (const e of sldIds()) {
      const part = partOfSld(e);
      if (!part || live.has(part)) continue;
      const rid = X.at(e, R, 'id'), sid = e.getAttribute('id');
      e.remove(); presChanged = true;
      for (const x of [...pres.getElementsByTagName('*')]) if (x.localName === 'sldId' && x.namespaceURI !== P && x.getAttribute('id') === sid) x.remove();   // Abschnitte (p14)
      await pkg.removeRel(pkg.main, rid);
      const nr = (await pkg.rels(part)).find(x => /notesSlide$/.test(x.type));
      if (nr) await pkg.removePart(nr.path);
      await pkg.removePart(part);
    }
    // 2) neue Folien anlegen
    const defText = X.q(pres, P, 'defaultTextStyle')[0] || null;
    const parts = new Map();   // Rahmen-ID → Teil
    let maxId = Math.max(255, ...sldIds().map(e => +e.getAttribute('id') || 0));
    for (const f of frames) {
      if (f.ox.part && pkg.has(f.ox.part)) { parts.set(f.id, f.ox.part); continue; }
      const part = pkg.freeName('ppt/slides/slide%.xml');
      if (f.ox.copyOf && pkg.has(f.ox.copyOf)) {
        // duplizierte Folie: Original-Folie samt Beziehungen kopieren (ohne Notizen)
        await pkg.addPart(part, await pkg.bytes(f.ox.copyOf), 'application/vnd.openxmlformats-officedocument.presentationml.slide+xml');
        const rp = pkg.relsPath(f.ox.copyOf);
        if (pkg.has(rp)) pkg.setText(pkg.relsPath(part), (await pkg.text(rp)).replace(/<Relationship\b[^>]*notesSlide"[^>]*\/>/g, ''));
        const rid = await pkg.addRel(pkg.main, Ooxml.REL.slide, part.replace(/^ppt\//, ''));
        lst.append(X.mk(pres, P, 'sldId', { id: String(++maxId), 'r:id': rid }));
        presChanged = true;
        parts.set(f.id, part);
        continue;
      }
      const layout = await this.blankLayout(pkg, prels);
      await pkg.addPart(part, '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr></p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>', 'application/vnd.openxmlformats-officedocument.presentationml.slide+xml');
      if (layout) await pkg.addRel(part, Ooxml.REL.layout, '../' + layout.replace(/^ppt\//, ''));
      const rid = await pkg.addRel(pkg.main, Ooxml.REL.slide, part.replace(/^ppt\//, ''));
      const e = X.mk(pres, P, 'sldId', { id: String(++maxId), 'r:id': rid });
      lst.append(e);
      presChanged = true;
      parts.set(f.id, part);
    }
    // 3) Reihenfolge wie auf der Seite
    const prels2 = await pkg.rels(pkg.main);
    const order = frames.map(f => parts.get(f.id));
    const cur = sldIds().map(e => { const r = prels2.find(x => x.id === X.at(e, R, 'id')); return r ? r.path : null; });
    if (cur.join('|') !== order.join('|')) {
      const byPart = new Map(sldIds().map(e => { const r = prels2.find(x => x.id === X.at(e, R, 'id')); return [r && r.path, e]; }));
      for (const part of order) { const e = byPart.get(part); if (e) lst.append(e); }
      presChanged = true;
    }
    // neue Folien in Abschnitte (p14:sectionLst) aufnehmen, sonst „repariert“ PowerPoint
    const secs = [...pres.getElementsByTagName('*')].filter(x => x.localName === 'section' && x.namespaceURI !== P);
    if (secs.length) {
      const inSec = new Set([...pres.getElementsByTagName('*')].filter(x => x.localName === 'sldId' && x.namespaceURI !== P).map(x => x.getAttribute('id')));
      for (const e of sldIds()) {
        const id = e.getAttribute('id');
        if (inSec.has(id)) continue;
        const sl = [...secs[secs.length - 1].children].find(k => k.localName === 'sldIdLst');
        if (sl) { const ne = pres.createElementNS(sl.namespaceURI, (sl.prefix ? sl.prefix + ':' : '') + 'sldId'); ne.setAttribute('id', id); sl.append(ne); presChanged = true; }
      }
    }
    const sz = X.q(pres, P, 'sldSz')[0];
    if (sz && (+sz.getAttribute('cx') !== o.cx || +sz.getAttribute('cy') !== o.cy)) {
      sz.setAttribute('cx', String(o.cx)); sz.setAttribute('cy', String(o.cy));
      if (o.cx === 9144000 && o.cy === 6858000) sz.setAttribute('type', 'screen4x3'); else sz.removeAttribute('type');
      presChanged = true;
    }
    if (presChanged) pkg.setXml(pkg.main, pres);
    // 4) Inhalte je Folie
    let changedSlides = 0;
    for (const f of frames) {
      const part = parts.get(f.id);
      if (await this.writeSlide(pkg, p, f, part, scale, defText)) changedSlides++;
    }
    if (typeof OfficePX !== 'undefined') await OfficePX.write(pkg, p);   // Endlosschleife (1.72)
    return { slides: frames.length, changedSlides };
  },
  async blankLayout(pkg, prels) {
    const X = this.X, P = this.P;
    const mr = prels.find(r => /slideMaster$/.test(r.type));
    if (!mr) return null;
    const lays = (await pkg.rels(mr.path)).filter(r => /slideLayout$/.test(r.type) && pkg.has(r.path));
    for (const l of lays) { const d = await pkg.xml(l.path); if (d.documentElement.getAttribute('type') === 'blank') return l.path; }
    for (const l of lays) { const d = await pkg.xml(l.path); if (!X.q(d, P, 'ph').length) return l.path; }
    return lays.length ? lays[lays.length - 1].path : null;
  },
  /* eine Folie: Lage/Text/Bilder geänderter Felder, gelöschte Formen, neue Felder → true wenn geändert */
  async writeSlide(pkg, p, f, part, scale, defText) {
    const X = this.X, P = this.P, A = this.A, R = this.R;
    const sd = await pkg.xml(part);
    const tree = X.q(sd, P, 'spTree')[0];
    if (!tree) return false;
    const key = f.ox.part === part ? part : 'dup:' + f.id;   // Felder einer duplizierten Folie
    const info = f.ox.part === part ? ((p.office.slides || []).find(s => s.part === part) || { ids: [] }) : { ids: f.ox.ids || [] };
    const ctx = await this.ctxOf(pkg, part, defText);
    ctx.inkDefault = ctx.th.scheme[ctx.th.map.tx1 || 'dk1'] || null;
    const bgc = (f.ox.bg || '#ffffff').slice(1), lum = (0.299 * parseInt(bgc.slice(0, 2), 16) + 0.587 * parseInt(bgc.slice(2, 4), 16) + 0.114 * parseInt(bgc.slice(4, 6), 16)) / 255;
    ctx.freshInk = lum < 0.5 ? '#ffffff' : '#1f1f1f';
    let changed = false;
    if (f.ox.bgNew) {
      const cs = X.q(sd, P, 'cSld')[0];
      const ob = X.kid(cs, P, 'bg'); if (ob) ob.remove();
      const [nb] = X.xml(sd, P, `<p:bg><p:bgPr><a:solidFill><a:srgbClr val="${f.ox.bgNew.slice(1).toUpperCase()}"/></a:solidFill><a:effectLst/></p:bgPr></p:bg>`);
      cs.prepend(nb);
      changed = true;
    }
    const shapeById = new Map();
    for (const c of X.q(tree, P, 'cNvPr')) { const sh = c.parentNode && c.parentNode.parentNode; if (sh && sh !== tree) shapeById.set(c.getAttribute('id'), sh); }
    const mine = p.boxes.filter(b => b.ox && b.ox.part === key && /^(sp|pic|tbl|obj)$/.test(b.ox.k));
    const have = new Set(mine.map(b => b.ox.id));
    // gelöschte Formen
    for (const id of info.ids) if (!have.has(id) && shapeById.get(id)) { shapeById.get(id).remove(); changed = true; }
    const E = (px) => Math.round(px / scale * 9525);
    for (const b of mine) {
      const sh = shapeById.get(b.ox.id);
      if (!sh) continue;
      const o = b.ox;
      const im = b.images[0];
      const moved = Math.abs(b.x - o.x0) > 0.5 || Math.abs(b.y - o.y0) > 0.5;
      const sized = o.k === 'pic' ? (im && (Math.abs(im.w - o.iw) > 0.5 || Math.abs(im.h - o.ih) > 0.5)) : Math.abs(b.w - o.w0) > 0.5;
      if ((moved || sized) && !o.g) {
        // um die Verschiebung ändern (nicht neu aus gerundeten px berechnen → keine Rundungsfehler)
        const own = this.xfrmOf(sh);
        const cur = own || { x: Math.round((o.x0 - f.x) / scale * 9525), y: Math.round((o.y0 - f.y) / scale * 9525), w: o.ew || 0, h: o.eh || 0 };
        const nx = moved ? cur.x + E(b.x - o.x0) : cur.x, ny = moved ? cur.y + E(b.y - o.y0) : cur.y;
        // gedrehte Bilder (1.75): angezeigt wird das umschliessende Rechteck – bei 90°/270° sind Breite und Höhe vertauscht
        const dw = o.r90 ? im.h - o.ih : (im ? im.w - o.iw : 0), dh = o.r90 ? im.w - o.iw : (im ? im.h - o.ih : 0);
        const nw = sized ? (o.k === 'pic' ? cur.w + E(dw) : cur.w + E(b.w - o.w0)) : cur.w;
        const nh = sized && o.k === 'pic' ? cur.h + E(dh) : cur.h;
        this.setXfrm(sd, sh, nx, ny, nw, nh);
        changed = true;
      }
      if (o.k === 'pic' && !im) { sh.remove(); changed = true; continue; }
      if (o.k === 'sp' && b.html !== o.h) { this.setText(sd, sh, b.html, ctx, scale); changed = true; }
      if (o.k === 'tbl' && b.html !== o.h) { this.setTable(sd, sh, b.html); changed = true; }
    }
    // neue Felder auf dieser Folie (ohne Herkunft)
    const newIds = new Map();
    let nextId = Math.max(1, ...X.q(tree, P, 'cNvPr').map(c => +c.getAttribute('id') || 0)) + 1;
    for (const b of p.boxes) {
      if (b.ox || b.office || b.bg || b.sheet || b.chart || !this.inFrame(b, f, p)) continue;
      if (Canvas.isPictureBox(b)) {
        const img = await OfficePages.imageForOffice(b.images[0].src);
        if (!img) continue;
        const mp = pkg.freeName('ppt/media/ktbild%.' + img.ext);
        await pkg.addPart(mp, img.u8, img.type);
        const rid = await pkg.addRel(part, Ooxml.REL.img, '../media/' + mp.split('/').pop());
        const im = b.images[0], id = nextId++;
        newIds.set(b.id, String(id));
        tree.append(...X.xml(sd, P, `<p:pic><p:nvPicPr><p:cNvPr id="${id}" name="Bild ${id}"/><p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr/></p:nvPicPr><p:blipFill><a:blip r:embed="${rid}"/><a:stretch><a:fillRect/></a:stretch></p:blipFill><p:spPr><a:xfrm><a:off x="${E(b.x - f.x + im.x)}" y="${E(b.y - f.y + im.y)}"/><a:ext cx="${E(im.w)}" cy="${E(im.h)}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic>`));
        changed = true;
      } else if (!isEmptyHtml(b.html) && !(b.ph && !OfficeWord.textOf(b.html).trim())) {   // leerer Platzhalter (1.67): nicht in die Datei
        const id = nextId++;
        newIds.set(b.id, String(id));
        const r = Canvas.rects && Canvas.rects.get(b.id);
        const h = r ? Math.max(20, r.h - 21) : 40;
        const [sh] = X.xml(sd, P, `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="Textfeld ${id}"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="${E(b.x - f.x)}" y="${E(b.y - f.y)}"/><a:ext cx="${E(b.w - 22)}" cy="${E(h)}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/></p:spPr><p:txBody><a:bodyPr wrap="square" rtlCol="0"><a:spAutoFit/></a:bodyPr><a:lstStyle/><a:p><a:endParaRPr lang="de-DE"/></a:p></p:txBody></p:sp>`);
        tree.append(sh);
        this.setText(sd, sh, b.html, ctx, scale, true);
        changed = true;
      }
    }
    // Übergang und Animationen (nur bei Änderung)
    if (typeof OfficeAnim !== 'undefined') {
      const all = p.boxes.filter(b => !b.bg && (mine.includes(b) || newIds.has(b.id)));
      if (OfficeAnim.write(sd, f, all, (b) => newIds.get(b.id) || (b.ox && b.ox.part === key ? b.ox.id : null))) changed = true;
    }
    if (changed) pkg.setXml(part, sd);
    // Notizen
    for (const nb of p.boxes.filter(b => b.ox && b.ox.k === 'notiz' && b.ox.f === f.id && b.ox.part && b.html !== b.ox.h && pkg.has(b.ox.part))) {
      const nd = await pkg.xml(nb.ox.part);
      const body = X.q(nd, P, 'sp').find(sp => { const ph = this.phOf(sp); return ph && ph.type === 'body'; });
      if (body) { this.setText(nd, body, nb.html, { th: ctx.th, notes: true, inkDefault: '#1f1f1f' }, 0.75, false, []); pkg.setXml(nb.ox.part, nd); changed = true; }
    }
    // neue Notizen (Notizbereich unter der Folie, 1.66): Notizenseite anlegen – samt Notizenmaster, falls die Datei keinen hat
    const fresh = p.boxes.find(b => b.ox && b.ox.k === 'notiz' && b.ox.f === f.id && !(b.ox.part && pkg.has(b.ox.part)) && (b.html || '').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim());
    if (fresh && !(await pkg.rels(part)).some(x => /notesSlide$/.test(x.type))) {
      const nm = await this.ensureNotesMaster(pkg);
      const np = pkg.freeName('ppt/notesSlides/notesSlide%.xml');
      await pkg.addPart(np, this.NOTES_XML, 'application/vnd.openxmlformats-officedocument.presentationml.notesSlide+xml');
      await pkg.addRel(np, Ooxml.REL.notesMaster, '../' + nm.replace(/^ppt\//, ''));
      await pkg.addRel(np, Ooxml.REL.slide, '../' + part.replace(/^ppt\//, ''));
      await pkg.addRel(part, Ooxml.REL.notes, '../' + np.replace(/^ppt\//, ''));
      const nd = await pkg.xml(np);
      const body = X.q(nd, P, 'sp').find(sp => { const ph = this.phOf(sp); return ph && ph.type === 'body'; });
      this.setText(nd, body, fresh.html, { th: ctx.th, notes: true, inkDefault: '#1f1f1f' }, 0.75, true, []);
      pkg.setXml(np, nd);
      changed = true;
    }
    return changed;
  },
  /* Notizenmaster (mit eigenem Design = Kopie des Folienmaster-Designs) – nur wenn die Datei keinen hat */
  async ensureNotesMaster(pkg) {
    const X = this.X, P = this.P;
    const prels = await pkg.rels(pkg.main);
    const have = prels.find(r => /notesMaster$/.test(r.type) && pkg.has(r.path));
    if (have) return have.path;
    const nm = pkg.freeName('ppt/notesMasters/notesMaster%.xml');
    await pkg.addPart(nm, this.NOTES_MASTER_XML, 'application/vnd.openxmlformats-officedocument.presentationml.notesMaster+xml');
    const mr = prels.find(r => /slideMaster$/.test(r.type));
    const tr = mr && (await pkg.rels(mr.path)).find(r => /theme$/.test(r.type) && pkg.has(r.path));
    if (tr) {
      const th = pkg.freeName('ppt/theme/theme%.xml');
      await pkg.addPart(th, await pkg.bytes(tr.path), 'application/vnd.openxmlformats-officedocument.theme+xml');
      await pkg.addRel(nm, Ooxml.REL.theme, '../' + th.replace(/^ppt\//, ''));
    }
    const rid = await pkg.addRel(pkg.main, Ooxml.REL.notesMaster, nm.replace(/^ppt\//, ''));
    const pres = await pkg.xml(pkg.main);
    let lst = X.q(pres, P, 'notesMasterIdLst')[0];
    if (!lst) {
      lst = X.mk(pres, P, 'notesMasterIdLst');
      const after = X.q(pres, P, 'sldMasterIdLst')[0];
      after ? after.after(lst) : pres.documentElement.prepend(lst);
    }
    lst.append(X.mk(pres, P, 'notesMasterId', { 'r:id': rid }));
    pkg.setXml(pkg.main, pres);
    return nm;
  },
  NOTES_XML: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n<p:notes xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr><p:sp><p:nvSpPr><p:cNvPr id="2" name="Folienbildplatzhalter 1"/><p:cNvSpPr><a:spLocks noGrp="1" noRot="1" noChangeAspect="1"/></p:cNvSpPr><p:nvPr><p:ph type="sldImg"/></p:nvPr></p:nvSpPr><p:spPr/></p:sp><p:sp><p:nvSpPr><p:cNvPr id="3" name="Notizenplatzhalter 2"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph type="body" idx="1"/></p:nvPr></p:nvSpPr><p:spPr/><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:endParaRPr lang="de-CH"/></a:p></p:txBody></p:sp></p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:notes>',
  NOTES_MASTER_XML: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n<p:notesMaster xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:bg><p:bgRef idx="1001"><a:schemeClr val="bg1"/></p:bgRef></p:bg><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr><p:sp><p:nvSpPr><p:cNvPr id="2" name="Folienbildplatzhalter 1"/><p:cNvSpPr><a:spLocks noGrp="1" noRot="1" noChangeAspect="1"/></p:cNvSpPr><p:nvPr><p:ph type="sldImg" idx="2"/></p:nvPr></p:nvSpPr><p:spPr><a:xfrm><a:off x="685800" y="1143000"/><a:ext cx="5486400" cy="3086100"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/><a:ln w="12700"><a:solidFill><a:prstClr val="black"/></a:solidFill></a:ln></p:spPr></p:sp><p:sp><p:nvSpPr><p:cNvPr id="3" name="Notizenplatzhalter 2"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph type="body" sz="quarter" idx="3"/></p:nvPr></p:nvSpPr><p:spPr><a:xfrm><a:off x="685800" y="4400550"/><a:ext cx="5486400" cy="3600450"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr><p:txBody><a:bodyPr vert="horz" lIns="91440" tIns="45720" rIns="91440" bIns="45720" rtlCol="0"/><a:lstStyle/><a:p><a:pPr lvl="0"/><a:r><a:rPr lang="de-CH"/><a:t>Textmasterformat bearbeiten</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld><p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/><p:notesStyle><a:lvl1pPr marL="0" algn="l" defTabSz="914400" rtl="0" eaLnBrk="1" latinLnBrk="0" hangingPunct="1"><a:defRPr sz="1200" kern="1200"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:latin typeface="+mn-lt"/><a:ea typeface="+mn-ea"/><a:cs typeface="+mn-cs"/></a:defRPr></a:lvl1pPr></p:notesStyle></p:notesMaster>',
  setXfrm(doc, sh, x, y, w, h) {
    const X = this.X, P = this.P, A = this.A;
    let xf;
    if (sh.localName === 'graphicFrame') xf = X.kid(sh, P, 'xfrm');
    else {
      let spPr = X.kid(sh, P, 'spPr');
      if (!spPr) { spPr = X.mk(doc, P, 'spPr'); const nv = sh.firstElementChild; nv ? nv.after(spPr) : sh.prepend(spPr); }
      xf = X.kid(spPr, A, 'xfrm');
      if (!xf) { xf = X.mk(doc, A, 'xfrm'); spPr.prepend(xf); }
    }
    if (!xf) return;
    let off = X.kid(xf, A, 'off'), ext = X.kid(xf, A, 'ext');
    if (!off) { off = X.mk(doc, A, 'off'); xf.prepend(off); }
    if (!ext) { ext = X.mk(doc, A, 'ext'); off.after(ext); }
    off.setAttribute('x', String(x)); off.setAttribute('y', String(y));
    ext.setAttribute('cx', String(Math.max(0, w))); ext.setAttribute('cy', String(Math.max(0, h)));
  },
  /* HTML → Absätze/Läufe der Form; Formatierung nur dort geschrieben, wo sie vom Original (aufgelöst) abweicht */
  setText(doc, sh, html, ctx, scale, fresh = false, chainOverride = null) {
    const X = this.X, P = this.P, A = this.A;
    let tx = X.kid(sh, P, 'txBody');
    if (!tx) { tx = X.mk(doc, P, 'txBody'); tx.append(X.mk(doc, A, 'bodyPr'), X.mk(doc, A, 'lstStyle')); sh.append(tx); }
    const chain = chainOverride || this.styleChain(sh, ctx);
    const bp = X.kid(tx, A, 'bodyPr'), na = bp && X.kid(bp, A, 'normAutofit');
    const c2 = { ...ctx, fontScale: na && na.getAttribute('fontScale') ? +na.getAttribute('fontScale') / 100000 : 1 };
    const orig = X.kids(tx, A, 'p');
    const blocks = OfficeHtml.blocks(html).filter(b => b.tag !== 'table');
    for (const p of orig) p.remove();
    const tmplP = orig[orig.length - 1] || null;
    blocks.forEach((blk, k) => {
      const op = orig[k] || tmplP;
      const np = X.mk(doc, A, 'p');
      const opp = op ? this.paraProps(op, chain) : { lvl: 0, algn: '', bullet: false, lv: this.lvlOf(chain, 0) };
      const pPr0 = op && X.kid(op, A, 'pPr');
      let pPr = pPr0 ? pPr0.cloneNode(true) : null;
      const want = { left: '', center: 'ctr', right: 'r', justify: 'just' };
      if ((blk.align || '') !== (opp.algn || '') && !(blk.align === 'left' && !opp.algn)) { pPr = pPr || X.mk(doc, A, 'pPr'); pPr.setAttribute('algn', want[blk.align] || 'l'); }
      if (blk.tag === 'li' && blk.lvl !== opp.lvl) { pPr = pPr || X.mk(doc, A, 'pPr'); if (blk.lvl) pPr.setAttribute('lvl', String(blk.lvl)); else pPr.removeAttribute('lvl'); }
      if (fresh && blk.tag === 'li') { pPr = pPr || X.mk(doc, A, 'pPr'); if (!X.kid(pPr, A, 'buChar')) { pPr.setAttribute('marL', String(285750 * (blk.lvl + 1))); pPr.setAttribute('indent', '-285750'); pPr.append(...X.xml(doc, A, '<a:buFont typeface="Arial"/><a:buChar char="•"/>')); } }
      if (pPr) np.append(pPr);
      const pp = this.paraProps(np, chain);
      const oRuns = op ? X.kids(op, A, 'r').map(r => ({ el: r, text: X.kids(r, A, 't').map(t => t.textContent).join(''), props: this.runProps(X.kid(r, A, 'rPr'), opp, c2) })) : [];
      const endP = op && X.kid(op, A, 'endParaRPr');
      const used = new Set();
      blk.runs.forEach((run0, i) => {
        let run = run0;
        if (run.br) { const br = X.mk(doc, A, 'br'); const rp = oRuns[0] && X.kid(oRuns[0].el, A, 'rPr'); if (rp) br.append(rp.cloneNode(true)); np.append(br); return; }
        const text = run.tab ? '\t' : run.text;
        let src = oRuns.find((o, j) => !used.has(j) && o.text === text);
        if (src) used.add(oRuns.indexOf(src)); else src = oRuns[Math.min(i, oRuns.length - 1)];
        let base = src ? src.props : this.runProps(endP ? this.asRPr(doc, endP) : null, pp, c2);
        if (fresh) {
          // neues Textfeld: so schreiben, wie es auf der Fläche aussieht (Grösse je Absatzart, lesbare Farbe zur Folie)
          const defPt = { h1: 20, h2: 15, h3: 12.5 }[blk.tag] || 11;
          run = { ...run, px: run.px || defPt * 4 / 3, b: run.b || /^h\d$/.test(blk.tag), color: run.color || ctx.freshInk || null };
          base = { pt: -1, b: false, i: false, u: false, s: false, color: null, font: '', base: 0 };
        }
        let rPr = src && X.kid(src.el, A, 'rPr') ? X.kid(src.el, A, 'rPr').cloneNode(true) : endP ? this.asRPr(doc, endP) : X.mk(doc, A, 'rPr', { lang: 'de-DE' });
        rPr.removeAttribute('dirty'); rPr.removeAttribute('err');
        this.diffRun(doc, rPr, run, base, scale, c2.fontScale || 1);
        const r = X.mk(doc, A, 'r');
        const t = X.mk(doc, A, 't'); t.textContent = text;
        r.append(rPr, t);
        np.append(r);
      });
      if (endP) np.append(endP.cloneNode(true));
      tx.append(np);
    });
    if (!blocks.length) { const np = X.mk(doc, A, 'p'); const endP = tmplP && X.kid(tmplP, A, 'endParaRPr'); if (endP) np.append(endP.cloneNode(true)); tx.append(np); }
  },
  asRPr(doc, e) { const r = X_rename(doc, e, 'rPr'); return r; },
  RPR_ORDER: ['ln', 'noFill', 'solidFill', 'gradFill', 'blipFill', 'pattFill', 'grpFill', 'effectLst', 'effectDag', 'highlight', 'uLnTx', 'uLn', 'uFillTx', 'uFill', 'latin', 'ea', 'cs', 'sym', 'hlinkClick', 'hlinkMouseOver', 'rtl', 'extLst'],
  putChild(doc, parent, el) {
    const order = this.RPR_ORDER, k = order.indexOf(el.localName);
    const after = [...parent.children].find(c => order.indexOf(c.localName) > k);
    if (after) after.before(el); else parent.append(el);
  },
  diffRun(doc, rPr, run, base, scale, fontScale) {
    const X = this.X, A = this.A;
    const flag = (k, attr, on, off) => { if (!!run[k] !== !!base[k]) rPr.setAttribute(attr, run[k] ? on : off); };
    flag('b', 'b', '1', '0'); flag('i', 'i', '1', '0'); flag('u', 'u', 'sng', 'none'); flag('s', 'strike', 'sngStrike', 'noStrike');
    const bpx = this.pxOf(base, scale);
    if (run.px && Math.abs(run.px - bpx) > 0.6) rPr.setAttribute('sz', String(Math.max(100, Math.round(run.px / scale * 0.75 / fontScale) * 100)));
    const sup = run.sup ? 30000 : run.sub ? -25000 : 0;
    if (Math.sign(sup) !== Math.sign(base.base || 0)) { if (sup) rPr.setAttribute('baseline', String(sup)); else rPr.removeAttribute('baseline'); }
    if (run.color && run.color !== base.color) {
      for (const c of [...rPr.children]) if (/^(noFill|solidFill|gradFill|blipFill|pattFill|grpFill)$/.test(c.localName)) c.remove();
      const sf = X.mk(doc, A, 'solidFill'); sf.append(X.mk(doc, A, 'srgbClr', { val: run.color.slice(1).toUpperCase() }));
      this.putChild(doc, rPr, sf);
    }
    if (run.font && run.font !== base.font) {
      const l = X.kid(rPr, A, 'latin');
      if (l) l.setAttribute('typeface', run.font); else this.putChild(doc, rPr, X.mk(doc, A, 'latin', { typeface: run.font }));
    }
  },
  setTable(doc, sh, html) {
    const X = this.X, A = this.A;
    const tbl = X.q(sh, A, 'tbl')[0];
    const blk = OfficeHtml.blocks(html).find(b => b.tag === 'table');
    if (!tbl || !blk) return;
    X.kids(tbl, A, 'tr').forEach((tr, ri) => {
      const cells = X.kids(tr, A, 'tc').filter(tc => !tc.getAttribute('hMerge') && !tc.getAttribute('vMerge'));
      cells.forEach((tc, ci) => {
        const nc = blk.rows[ri] && blk.rows[ri][ci];
        if (!nc) return;
        const want = nc.runs.map(r => r.text || (r.br ? '\n' : '')).join('');
        const tb = X.kid(tc, A, 'txBody');
        const cur = tb ? X.kids(tb, A, 'p').map(pp => X.q(pp, A, 't').map(t => t.textContent).join('')).join('\n') : '';
        if (cur === want || !tb) return;
        const ps = X.kids(tb, A, 'p'), p0 = ps[0];
        const r0 = p0 && X.q(p0, A, 'r')[0], rPr = r0 && X.kid(r0, A, 'rPr'), pPr = p0 && X.kid(p0, A, 'pPr'), endP = p0 && X.kid(p0, A, 'endParaRPr');
        for (const pp of ps) pp.remove();
        for (const line of want.split('\n')) {
          const np = X.mk(doc, A, 'p');
          if (pPr) np.append(pPr.cloneNode(true));
          if (line) { const r = X.mk(doc, A, 'r'); r.append(rPr ? rPr.cloneNode(true) : X.mk(doc, A, 'rPr', { lang: 'de-DE' })); const t = X.mk(doc, A, 't'); t.textContent = line; r.append(t); np.append(r); }
          if (endP) np.append(endP.cloneNode(true));
          tb.append(np);
        }
      });
    });
  },
};
/* endParaRPr/defRPr als a:rPr kopieren (gleiche Attribute und Kinder) */
function X_rename(doc, e, tag) {
  const n = OfficePages.mk(doc, Ooxml.NS.a, tag);
  for (const a of e.attributes) n.setAttribute(a.name, a.value);
  for (const c of e.childNodes) n.append(c.cloneNode(true));
  return n;
}
if (typeof module !== 'undefined') module.exports = { OfficePpt };
