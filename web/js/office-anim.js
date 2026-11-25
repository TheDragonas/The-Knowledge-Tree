'use strict';
/* PowerPoint: Übergänge und Animationen (1.66) – Register „Übergänge“ und „Animationen“ wie in PowerPoint.
 *
 * Übergang je Folie: f.ox.tr = { type, dur } (type: none | fade | push | wipe | split | cover | zoom), f.ox.tr0 = wie
 *   importiert (p:transition, auch in mc:AlternateContent mit p14:dur). Export nur bei Änderung: <p:transition>.
 * Animation je Feld (Eingangseffekte): b.anim = { fx, start, dur, n } – fx: appear | fade | fly | zoom | wipe,
 *   start: click | with | after, n = Reihenfolge auf der Folie. Import aus p:timing (presetClass="entr");
 *   geändert → f.ox.animDirty → beim Export wird p:timing der Folie neu geschrieben (Hauptsequenz mit Klick-,
 *   Mit-/Nach-Gruppen wie PowerPoint, p:bldLst für Textfelder). Andere Effekte (Hervorhebung, Ausgang, Pfade) einer
 *   so geänderten Folie gehen dabei verloren – darauf wird hingewiesen; unberührte Folien bleiben Byte für Byte.
 * Wiedergabe im Vorführmodus (office-show.js: Show.steps/play, Übergänge mit der Web-Animations-Schnittstelle). */
const OfficeAnim = {
  TRANS: [['none', 'Ohne', 'x'], ['cut', 'Schnitt', 'cut'], ['fade', 'Verblassen', 'contrast'], ['push', 'Schieben', 'arrowLeft'], ['wipe', 'Wischen', 'alignLeft'], ['split', 'Teilen', 'splitH'], ['pull', 'Aufdecken', 'back'], ['cover', 'Bedecken', 'front'], ['circle', 'Form', 'shEllipse'], ['dissolve', 'Auflösen', 'grid'], ['zoom', 'Zoom', 'zoomIn'],
    // 1.72: weitere Übergänge wie PowerPoint
    ['wheel', 'Rad', 'restore'], ['randomBar', 'Zufällige Balken', 'banded'], ['blinds', 'Jalousie', 'alignJustify'], ['checker', 'Schachbrett', 'grid'], ['plus', 'Plus', 'plus'], ['diamond', 'Raute', 'shDiamond'], ['strips', 'Streifen', 'arrowRight'], ['wedge', 'Keil', 'shTriangle'], ['newsflash', 'Wirbel', 'sparkle']],
  /* Effektoptionen (Richtung) je Übergang – OOXML dir/orient */
  DIRS: { push: [['l', 'Von rechts'], ['r', 'Von links'], ['u', 'Von unten'], ['d', 'Von oben']], cover: [['l', 'Von rechts'], ['r', 'Von links'], ['u', 'Von unten'], ['d', 'Von oben']], pull: [['l', 'Nach links'], ['r', 'Nach rechts'], ['u', 'Nach oben'], ['d', 'Nach unten']],
    wipe: [['r', 'Von links'], ['l', 'Von rechts'], ['d', 'Von oben'], ['u', 'Von unten']], split: [['vert-out', 'Vertikal nach aussen'], ['vert-in', 'Vertikal nach innen'], ['horz-out', 'Horizontal nach aussen'], ['horz-in', 'Horizontal nach innen']],
    blinds: [['horz', 'Horizontal'], ['vert', 'Vertikal']], randomBar: [['horz', 'Horizontal'], ['vert', 'Vertikal']], checker: [['horz', 'Horizontal'], ['vert', 'Vertikal']], strips: [['ru', 'Nach rechts oben'], ['rd', 'Nach rechts unten'], ['lu', 'Nach links oben'], ['ld', 'Nach links unten']] },
  FX: [['none', 'Keine', 'x'], ['appear', 'Erscheinen', 'sparkle'], ['fade', 'Verblassen', 'contrast'], ['fly', 'Hineinfliegen', 'arrowUp'], ['zoom', 'Zoom', 'zoomIn'], ['wipe', 'Wischen', 'alignJustify'],
    // 1.72: Hervorheben (e:) und Beenden (x:) wie PowerPoint
    ['e:pulse', 'Pulsieren', 'sparkle'], ['e:spin', 'Drehen', 'restore'], ['e:grow', 'Vergrössern', 'zoomIn'],
    ['x:disappear', 'Verschwinden', 'x'], ['x:fade', 'Ausblenden', 'contrast'], ['x:fly', 'Hinausfliegen', 'arrowDown'], ['x:zoom', 'Verkleinern', 'zoomOut']],
  CLASS: { e: ['emph', 'Hervorheben'], x: ['exit', 'Beenden'] },
  clsOf(fx) { return /^e:/.test(fx || '') ? 'emph' : /^x:/.test(fx || '') ? 'exit' : 'entr'; },
  START: [['click', 'Beim Klicken'], ['with', 'Mit Vorherigem'], ['after', 'Nach Vorherigem']],
  PRESET: { appear: 1, fly: 2, fade: 10, wipe: 22, zoom: 53, 'e:pulse': 26, 'e:spin': 8, 'e:grow': 6, 'x:disappear': 1, 'x:fade': 10, 'x:fly': 2, 'x:zoom': 53 },
  get X() { return OfficePages; }, get P() { return Ooxml.NS.p; },

  /* ---------------------------------------------------------------- Import */
  read(sd, frame, boxesById) {
    const X = this.X, P = this.P;
    const tr = [...sd.documentElement.getElementsByTagNameNS(P, 'transition')][0];
    if (tr) {
      const k = [...tr.children][0];
      const name = k ? k.localName : 'none';
      const known = new Set(['fade', 'push', 'wipe', 'split', 'cover', 'pull', 'circle', 'dissolve', 'zoom', 'cut', 'wheel', 'randomBar', 'blinds', 'checker', 'plus', 'diamond', 'strips', 'wedge', 'newsflash']);
      const type = known.has(name) ? name : (k ? 'fade' : 'none');
      const dur = +(tr.getAttributeNS('http://schemas.microsoft.com/office/powerpoint/2010/main', 'dur') || 0) || { fast: 500, med: 750, slow: 1000 }[tr.getAttribute('spd') || 'fast'] || 500;
      const t = { type, dur };
      // 1.72: Richtung, „Nach“-Zeit, bei Mausklick
      if (k && this.DIRS[type]) { const dv = type === 'split' ? (k.getAttribute('orient') || 'horz') + '-' + (k.getAttribute('dir') || 'out') : k.getAttribute('dir'); if (dv && this.DIRS[type].some(x => x[0] === dv) && dv !== this.DIRS[type][0][0]) t.dir = dv; }
      if (+tr.getAttribute('advTm')) t.adv = +tr.getAttribute('advTm');
      if (tr.getAttribute('advClick') === '0') t.click = false;
      frame.ox.tr = t; frame.ox.tr0 = { ...t };
    }
    // ausgeblendete Folie (1.72)
    if (sd.documentElement.getAttribute('show') === '0' || sd.documentElement.getAttribute('show') === 'false') { frame.ox.hide = true; frame.ox.hide0 = true; }
    const tm = X.kid(sd.documentElement, P, 'timing');
    if (!tm) return;
    let n = 0, other = false;
    for (const c of [...tm.getElementsByTagNameNS(P, 'cTn')]) {
      const cls = c.getAttribute('presetClass');
      if (!cls) continue;
      if (cls !== 'entr' && cls !== 'emph' && cls !== 'exit') { other = true; continue; }
      const tg = c.getElementsByTagNameNS(P, 'spTgt')[0];
      const b = tg && boxesById.get(tg.getAttribute('spid'));
      if (!b) { other = true; continue; }
      const pid = +c.getAttribute('presetID');
      let fx;
      if (cls === 'emph') { fx = { 26: 'e:pulse', 8: 'e:spin', 6: 'e:grow' }[pid]; if (!fx) { other = true; fx = 'e:pulse'; } }
      else if (cls === 'exit') fx = { 1: 'x:disappear', 10: 'x:fade', 2: 'x:fly', 53: 'x:zoom', 23: 'x:zoom' }[pid] || 'x:fade';
      else fx = { 1: 'appear', 10: 'fade', 2: 'fly', 22: 'wipe', 23: 'zoom', 53: 'zoom', 21: 'wipe', 12: 'wipe' }[pid] || 'fade';
      const start = { clickEffect: 'click', withEffect: 'with', afterEffect: 'after' }[c.getAttribute('nodeType')] || 'click';
      const durs = [...c.getElementsByTagNameNS(P, 'cTn')].map(x => +x.getAttribute('dur')).filter(x => x > 1);
      b.anim = { fx, start, dur: durs.length ? Math.max(...durs) : 500, n: ++n };
    }
    if (other) frame.ox.animOther = true;
  },

  /* ---------------------------------------------------------------- Export (von OfficePpt.writeSlide) */
  write(sd, f, boxes, idOf) {
    const X = this.X, P = this.P;
    let changed = false;
    const root = sd.documentElement;
    const tr = f.ox.tr || { type: 'none', dur: 500 }, tr0 = f.ox.tr0 || { type: 'none', dur: 500 };
    // ausgeblendete Folie (1.72)
    if (!!f.ox.hide !== !!f.ox.hide0) { if (f.ox.hide) root.setAttribute('show', '0'); else root.removeAttribute('show'); changed = true; }
    if (f.ox.trDirty || JSON.stringify(tr) !== JSON.stringify(tr0)) {
      for (const e of [...root.children]) if (e.localName === 'transition' || (e.localName === 'AlternateContent' && e.getElementsByTagNameNS(P, 'transition').length)) e.remove();
      if (tr.type !== 'none' || tr.adv || tr.click === false) {
        const spd = tr.dur <= 600 ? 'fast' : tr.dur <= 900 ? 'med' : 'slow';
        const dir = tr.dir || (this.DIRS[tr.type] ? this.DIRS[tr.type][0][0] : '');
        const da = tr.type === 'split' ? ` orient="${dir.split('-')[0]}" dir="${dir.split('-')[1]}"` : /^(blinds|randomBar|checker)$/.test(tr.type) ? ` dir="${dir}"` : dir ? ` dir="${dir}"` : '';
        const inner = tr.type === 'none' ? '' : { circle: '<p:circle/>', dissolve: '<p:dissolve/>', cut: '<p:cut/>', zoom: '<p:zoom/>', fade: '<p:fade/>', plus: '<p:plus/>', diamond: '<p:diamond/>', newsflash: '<p:newsflash/>', wedge: '<p:wedge/>', wheel: '<p:wheel spokes="4"/>' }[tr.type] || `<p:${tr.type}${da}/>`;
        const [e] = X.xml(sd, P, `<p:transition spd="${spd}"${tr.click === false ? ' advClick="0"' : ''}${tr.adv ? ` advTm="${Math.round(tr.adv)}"` : ''}>${inner}</p:transition>`);
        const after = X.kid(root, P, 'clrMapOvr') || X.kid(root, P, 'cSld');
        after.after(e);
      }
      changed = true;
    }
    if (f.ox.animDirty) {
      const old = X.kid(root, P, 'timing'); if (old) old.remove();
      const items = boxes.filter(b => b.anim && b.anim.fx && b.anim.fx !== 'none' && idOf(b)).sort((a, b) => a.anim.n - b.anim.n);
      if (items.length) {
        const [e] = X.xml(sd, P, this.timingXml(items.map(b => ({ spid: idOf(b), fx: b.anim.fx, start: b.anim.start || 'click', dur: b.anim.dur || 500, text: !Canvas.isPictureBox(b) && this.clsOf(b.anim.fx) === 'entr' }))));
        const after = [...root.children].reverse().find(x => /^(transition|clrMapOvr|cSld|AlternateContent)$/.test(x.localName));
        after.after(e);
      }
      changed = true;
    }
    return changed;
  },
  /* Hauptsequenz wie PowerPoint: Klick-Gruppen → Zeit-Gruppen (Mit/Nach) → Effekte */
  timingXml(items) {
    let id = 2;
    const nid = () => ++id;
    const clicks = [];
    for (const it of items) {
      if (it.start === 'click' || !clicks.length) clicks.push({ groups: [{ delay: 0, fx: [] }], t: 0 });
      const c = clicks[clicks.length - 1];
      let g = c.groups[c.groups.length - 1];
      if (it.start === 'after' && g.fx.length) { const end = g.delay + Math.max(...g.fx.map(x => x.dur)); g = { delay: end, fx: [] }; c.groups.push(g); }
      g.fx.push(it);
    }
    const set = (spid) => `<p:set><p:cBhvr><p:cTn id="${nid()}" dur="1" fill="hold"><p:stCondLst><p:cond delay="0"/></p:stCondLst></p:cTn><p:tgtEl><p:spTgt spid="${spid}"/></p:tgtEl><p:attrNameLst><p:attrName>style.visibility</p:attrName></p:attrNameLst></p:cBhvr><p:to><p:strVal val="visible"/></p:to></p:set>`;
    const anim = (spid, dur, attr, from, to) => `<p:anim calcmode="lin" valueType="num"><p:cBhvr additive="base"><p:cTn id="${nid()}" dur="${dur}" fill="hold"/><p:tgtEl><p:spTgt spid="${spid}"/></p:tgtEl><p:attrNameLst><p:attrName>${attr}</p:attrName></p:attrNameLst></p:cBhvr><p:tavLst><p:tav tm="0"><p:val><p:strVal val="${from}"/></p:val></p:tav><p:tav tm="100000"><p:val><p:strVal val="${to}"/></p:val></p:tav></p:tavLst></p:anim>`;
    const eff = (spid, dur, filter, out) => `<p:animEffect transition="${out ? 'out' : 'in'}" filter="${filter}"><p:cBhvr><p:cTn id="${nid()}" dur="${dur}"/><p:tgtEl><p:spTgt spid="${spid}"/></p:tgtEl></p:cBhvr></p:animEffect>`;
    const fxXml = (it, first) => {
      const node = first ? (it.start === 'click' ? 'clickEffect' : it.start === 'after' ? 'afterEffect' : 'withEffect') : (it.start === 'after' ? 'afterEffect' : 'withEffect');
      const pre = this.PRESET[it.fx] || 10, sub = it.fx === 'fly' || it.fx === 'x:fly' ? 4 : it.fx === 'wipe' ? 4 : 0;
      const cls = this.clsOf(it.fx);
      const cid = nid();
      const hide = (spid, at) => `<p:set><p:cBhvr><p:cTn id="${nid()}" dur="1" fill="hold"><p:stCondLst><p:cond delay="${Math.max(0, at - 1)}"/></p:stCondLst></p:cTn><p:tgtEl><p:spTgt spid="${spid}"/></p:tgtEl><p:attrNameLst><p:attrName>style.visibility</p:attrName></p:attrNameLst></p:cBhvr><p:to><p:strVal val="hidden"/></p:to></p:set>`;
      let body = cls === 'entr' ? set(it.spid) : '';
      if (cls === 'emph') {
        if (it.fx === 'e:spin') body += `<p:animRot by="21600000"><p:cBhvr><p:cTn id="${nid()}" dur="${it.dur}" fill="hold"/><p:tgtEl><p:spTgt spid="${it.spid}"/></p:tgtEl><p:attrNameLst><p:attrName>r</p:attrName></p:attrNameLst></p:cBhvr></p:animRot>`;
        else body += `<p:animScale><p:cBhvr><p:cTn id="${nid()}" dur="${it.fx === 'e:pulse' ? Math.round(it.dur / 2) : it.dur}"${it.fx === 'e:pulse' ? ' autoRev="1"' : ''} fill="hold"/><p:tgtEl><p:spTgt spid="${it.spid}"/></p:tgtEl></p:cBhvr><p:by x="${it.fx === 'e:pulse' ? 105000 : 150000}" y="${it.fx === 'e:pulse' ? 105000 : 150000}"/></p:animScale>`;
      } else if (cls === 'exit') {
        if (it.fx === 'x:fade') body += eff(it.spid, it.dur, 'fade', true);
        else if (it.fx === 'x:fly') body += anim(it.spid, it.dur, 'ppt_x', '#ppt_x', '#ppt_x') + anim(it.spid, it.dur, 'ppt_y', '#ppt_y', '1+#ppt_h/2');
        else if (it.fx === 'x:zoom') body += anim(it.spid, it.dur, 'ppt_w', '#ppt_w', '0') + anim(it.spid, it.dur, 'ppt_h', '#ppt_h', '0') + eff(it.spid, it.dur, 'fade', true);
        body += hide(it.spid, it.fx === 'x:disappear' ? 1 : it.dur);
      }
      else if (it.fx === 'fade') body += eff(it.spid, it.dur, 'fade');
      else if (it.fx === 'wipe') body += eff(it.spid, it.dur, 'wipe(up)');
      else if (it.fx === 'fly') body += anim(it.spid, it.dur, 'ppt_x', '#ppt_x', '#ppt_x') + anim(it.spid, it.dur, 'ppt_y', '1+#ppt_h/2', '#ppt_y');
      else if (it.fx === 'zoom') body += anim(it.spid, it.dur, 'ppt_w', '0', '#ppt_w') + anim(it.spid, it.dur, 'ppt_h', '0', '#ppt_h') + eff(it.spid, it.dur, 'fade');
      return `<p:par><p:cTn id="${cid}" presetID="${pre}" presetClass="${cls}" presetSubtype="${sub}" fill="hold"${it.text ? ' grpId="0"' : ''} nodeType="${node}"><p:stCondLst><p:cond delay="0"/></p:stCondLst><p:childTnLst>${body}</p:childTnLst></p:cTn></p:par>`;
    };
    let seq = '';
    clicks.forEach((c) => {
      const cId = nid();
      let groups = '';
      c.groups.forEach((g, gi) => {
        const gId = nid();
        groups += `<p:par><p:cTn id="${gId}" fill="hold"><p:stCondLst><p:cond delay="${g.delay}"/></p:stCondLst><p:childTnLst>${g.fx.map((it, k) => fxXml(it, gi === 0 && k === 0)).join('')}</p:childTnLst></p:cTn></p:par>`;
      });
      seq += `<p:par><p:cTn id="${cId}" fill="hold"><p:stCondLst><p:cond delay="indefinite"/></p:stCondLst><p:childTnLst>${groups}</p:childTnLst></p:cTn></p:par>`;
    });
    const bld = [...new Set(items.filter(i => i.text).map(i => i.spid))].map(s => `<p:bldP spid="${s}" grpId="0"/>`).join('');
    return `<p:timing><p:tnLst><p:par><p:cTn id="1" dur="indefinite" restart="never" nodeType="tmRoot"><p:childTnLst><p:seq concurrent="1" nextAc="seek"><p:cTn id="2" dur="indefinite" nodeType="mainSeq"><p:childTnLst>${seq}</p:childTnLst></p:cTn><p:prevCondLst><p:cond evt="onPrev" delay="0"><p:tgtEl><p:sldTgt/></p:tgtEl></p:cond></p:prevCondLst><p:nextCondLst><p:cond evt="onNext" delay="0"><p:tgtEl><p:sldTgt/></p:tgtEl></p:cond></p:nextCondLst></p:seq></p:childTnLst></p:cTn></p:par></p:tnLst>${bld ? `<p:bldLst>${bld}</p:bldLst>` : ''}</p:timing>`;
  },

  /* ---------------------------------------------------------------- Befehle (Register) */
  frame() { return OfficePpt.currentFrame(); },
  setTransition(type, all = false) {
    const p = OfficePages.page('pptx'); if (!p || Store.readOnly) return;
    const fr = all ? OfficePpt.frames(p) : [this.frame()].filter(Boolean);
    for (const f of fr) { const o = f.ox.tr || {}; f.ox.tr = { ...o, type, dur: o.dur || (type === 'zoom' ? 1000 : 700) }; if (o.type !== type) delete f.ox.tr.dir; f.ox.trDirty = true; }
    Hist.touchPage(p.id); Hist.commit('Übergang'); Ribbon.show(Ribbon.tab);
    if (!all && fr[0] && type !== 'none') this.preview(fr[0], 'trans');
  },
  setTransDur(ms) {
    const p = OfficePages.page('pptx'), f = this.frame(); if (!p || !f) return;
    f.ox.tr = { type: (f.ox.tr && f.ox.tr.type) || 'fade', dur: ms }; f.ox.trDirty = true;
    Hist.touchPage(p.id); Hist.commit('Übergang'); Ribbon.show(Ribbon.tab);
  },
  transAll() { const f = this.frame(); if (!f) return; const p = OfficePages.page('pptx'); for (const g of OfficePpt.frames(p)) { g.ox.tr = { ...(f.ox.tr || { type: 'none', dur: 700 }) }; g.ox.trDirty = true; } Hist.touchPage(p.id); Hist.commit('Übergang für alle'); UI.toast('Übergang auf alle Folien angewendet'); },
  /* ausgewählte Felder der aktuellen Folie */
  selected() {
    const p = OfficePages.page('pptx'); if (!p) return [];
    return [...Canvas.sel].map(id => Canvas.box(id)).filter(b => b && !b.bg && b.office !== 'label' && OfficePpt.frameOf(b, p));
  },
  slideBoxes(f, p) { return OfficePpt.itemsOf(f, p).boxes.filter(b => b.anim && b.anim.fx && b.anim.fx !== 'none'); },
  renumber(f, p) { this.slideBoxes(f, p).sort((a, b) => a.anim.n - b.anim.n).forEach((b, i) => { b.anim.n = i + 1; }); },
  warnOther(f) { if (f && f.ox.animOther && !f.ox.animWarned) { f.ox.animWarned = true; UI.toast('Diese Folie hat weitere PowerPoint-Effekte (z.B. Animationspfade): beim Speichern bleiben Eingang, Hervorheben und Beenden erhalten.', 7000); } },
  /* Übergang: Richtung, „Nach“-Zeit, bei Mausklick (1.72) */
  setTransOpt(k, v) {
    const p = OfficePages.page('pptx'), f = this.frame(); if (!p || !f || Store.readOnly) return;
    const t = { ...(f.ox.tr || { type: 'none', dur: 700 }) };
    if (v == null || v === '' || (k === 'click' && v === true) || (k === 'adv' && !+v)) delete t[k]; else t[k] = k === 'adv' ? +v : v;
    f.ox.tr = t; f.ox.trDirty = true;
    Hist.touchPage(p.id); Hist.commit('Übergang'); Ribbon.show(Ribbon.tab);
    if (k === 'dir' && t.type !== 'none') this.preview(f, 'trans');
  },
  setAnim(fx) {
    const p = OfficePages.page('pptx'); const bs = this.selected();
    if (!p || Store.readOnly) return;
    if (!bs.length) { UI.toast('Zuerst ein Textfeld oder Bild auf der Folie auswählen'); return; }
    const f = OfficePpt.frameOf(bs[0], p);
    this.warnOther(f);
    let n = Math.max(0, ...this.slideBoxes(f, p).map(b => b.anim.n));
    for (const b of bs) {
      if (fx === 'none') delete b.anim;
      else b.anim = b.anim ? { ...b.anim, fx } : { fx, start: 'click', dur: fx === 'appear' || fx === 'x:disappear' ? 1 : fx === 'e:spin' ? 2000 : 500, n: ++n };
    }
    f.ox.animDirty = true;
    this.renumber(f, p);
    Canvas.render(true); Hist.touchPage(p.id); Hist.commit('Animation'); Ribbon.show(Ribbon.tab);
    if (fx !== 'none') setTimeout(() => this.preview(f, 'anim'), 50);
  },
  setAnimOpt(k, v) {
    const p = OfficePages.page('pptx'); const bs = this.selected().filter(b => b.anim);
    if (!bs.length) { UI.toast('Zuerst ein animiertes Feld auswählen'); return; }
    for (const b of bs) b.anim[k] = v;
    const f = OfficePpt.frameOf(bs[0], p); f.ox.animDirty = true;
    Hist.touchPage(p.id); Hist.commit('Animation'); Ribbon.show(Ribbon.tab);
  },
  move(d) {
    const p = OfficePages.page('pptx'); const b = this.selected().find(x => x.anim);
    if (!b) return;
    const f = OfficePpt.frameOf(b, p), list = this.slideBoxes(f, p).sort((a, c) => a.anim.n - c.anim.n);
    const i = list.indexOf(b), j = i + d;
    if (j < 0 || j >= list.length) return;
    [list[i].anim.n, list[j].anim.n] = [list[j].anim.n, list[i].anim.n];
    f.ox.animDirty = true; Canvas.render(true); Hist.touchPage(p.id); Hist.commit('Animationsreihenfolge');
  },
  current(k) { const b = this.selected().find(x => x.anim); return b ? b.anim[k] : null; },
  /* Vorschau: diese Folie im Vorführmodus ab hier (mit Übergang und Animationen) */
  preview(f, what = 'trans') { if (typeof Show !== 'undefined' && f) Show.previewAt(f, Canvas.page, what); },
};
if (typeof module !== 'undefined') module.exports = { OfficeAnim };
