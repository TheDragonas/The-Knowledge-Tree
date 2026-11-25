'use strict';
/* Chem-Draw: Planen-Modus (1.56) – Bedienoberfläche der Syntheseplanung in der rechten Seitenleiste von
 * „Struktur zeichnen“. Rechnen macht ChemRxn (chem-rxn.js); hier nur Anzeige, Bearbeiten der Stufen, Mengen und das
 * Übertragen des Schemas in die Zeichnung. Die Zeichenfläche bleibt dabei voll bedienbar.
 *
 * Aufgabe wird erkannt: Steht ein Reaktionspfeil zwischen zwei Molekülen → „Weg Edukt → Produkt“, sonst
 * „Synthesewege zum Zielmolekül“ (ausgewähltes bzw. einziges Molekül). Ergebnisse bleiben erhalten, bis neu
 * gerechnet wird; ändert sich die Zeichnung, erscheint ein Hinweis. */
const ChemPlan = {
  st: { res: null, sig: '', open: -1, busy: false, task: null, names: new Map(), alts: new Map() },
  /* ---------------------------------------------------------------- Aufgabe aus der Zeichnung */
  task(C) {
    const E = C.E, m = E.mol;
    if (!m.atoms.length) return null;
    const frs = ChemRender.fragments(m);
    const molOf = (f) => ChemRender.subMol(m, f);
    const box = (f) => { const xs = f.atoms.map(a => a.x), ys = f.atoms.map(a => a.y); return { x0: Math.min(...xs), x1: Math.max(...xs), y: (Math.min(...ys) + Math.max(...ys)) / 2 }; };
    // Pfeil: ausgewählter oder erster Reaktionspfeil (→) mit Molekül links und rechts
    const arrows = (m.objs || []).filter(o => o.t === 'arrow' && (o.k || 'r') === 'r');
    const selA = arrows.find(o => E.sel.has('o:' + o.id));
    for (const a of selA ? [selA, ...arrows] : arrows) {
      const L = Math.min(a.x1, a.x2), R = Math.max(a.x1, a.x2), y = (a.y1 + a.y2) / 2;
      const near = (side) => frs.map(f => ({ f, b: box(f) })).filter(({ b }) => side < 0 ? b.x1 <= L + 4 : b.x0 >= R - 4)
        .map(({ f, b }) => ({ f, d: (side < 0 ? L - b.x1 : b.x0 - R) + Math.abs(b.y - y) * 0.7 })).sort((p, q) => p.d - q.d)[0];
      const l = near(-1), r = near(1);
      if (l && r) {
        const F = C.focus();
        const target = F && F.frags.length === 1 && F.frags[0] !== r.f && F.frags[0] !== l.f ? molOf(F.frags[0]) : null;
        return { kind: 'route', edukt: molOf(l.f), produkt: molOf(r.f), target: target || molOf(r.f) };
      }
    }
    const F = C.focus();
    if (F && F.frags.length === 1) return { kind: 'target', target: molOf(F.frags[0]) };
    if (frs.length === 1) return { kind: 'target', target: molOf(frs[0]) };
    return { kind: 'none' };
  },
  sigOf(t) { if (!t || t.kind === 'none') return ''; return t.kind + '|' + ChemRxn.key(t.target) + '|' + (t.edukt ? ChemRxn.key(t.edukt) : ''); },
  name(m) { const k = ChemRxn.key(m); if (!this.st.names.has(k)) this.st.names.set(k, ChemRxn.name(m)); return this.st.names.get(k); },
  svg(m, maxH = 70) {
    try { const r = ChemRender.toSVG(ChemRxn.layout(m), { caption: false, stars: false, nameCap: false, carbons: false }); return r.svg.replace('<svg ', `<svg style="max-height:${maxH}px;max-width:100%" `); } catch (e) { return ''; }
  },
  alts(n, rec) { const k = n.key + '|' + (rec ? 1 : 0); if (!this.st.alts.has(k)) this.st.alts.set(k, ChemRxn.retro(n.mol, { recOnly: rec }).slice(0, 14)); return this.st.alts.get(k); },
  BADGE: { metal: 'Katalysator', toxic: 'sehr giftig', extreme: 'extreme Bedingungen', pyro: 'pyrophor / heftig mit Wasser' },
  badges(opt) {
    const b = el('span', { class: 'chem-pbadges' });
    if (opt.rec) b.append(el('span', { class: 'chem-pbadge ok', text: 'empfohlen' }));
    for (const [k, t] of Object.entries(this.BADGE)) if (opt.flags && opt.flags[k]) b.append(el('span', { class: 'chem-pbadge warn', text: t, title: 'vorgeschlagen, aber nicht empfohlen' }));
    // Toxikologie/Ökologie (1.57): Reagenzien und Lösungsmittel grob eingestuft
    if (opt.hz) b.append(el('span', { class: 'chem-pbadge ' + (opt.hz.cls === 'grün' ? 'ok' : opt.hz.cls === 'mittel' ? '' : 'warn'), text: 'Tox/Öko: ' + opt.hz.cls, title: (opt.hz.why.length ? opt.hz.why.join(' · ') : 'keine stark bedenklichen Reagenzien oder Lösungsmittel') + ' – grobe Einstufung nach GHS, keine Sicherheitsbewertung' }));
    return b;
  },
  yieldMid(s) { const m = /(\d+)\s*[–-]\s*(\d+)/.exec(s || ''); return m ? (+m[1] + +m[2]) / 200 : 0.8; },
  /* ---------------------------------------------------------------- Seitenleiste */
  render(C, side) {
    const st = this.st, o = C.opts;
    const t = this.task(C), sig = this.sigOf(t);
    st.task = t;
    const sec = (txt) => side.append(el('div', { class: 'chem-sh', text: txt }));
    if (!t || t.kind === 'none') {
      sec('Syntheseplanung');
      side.append(el('div', { class: 'chem-muted', text: 'Zielmolekül zeichnen (oder anklicken) – dann schlägt Planen Synthesewege vor. Für einen Weg von A nach B: Edukt links, Reaktionspfeil, Produkt rechts zeichnen.' }));
      return;
    }
    // Aufgabe
    sec(t.kind === 'route' ? 'Weg: Edukt → Produkt' : 'Synthesewege zum Ziel');
    const pic = el('div', { class: 'chem-ptask' });
    if (t.kind === 'route') pic.innerHTML = `<div>${this.svg(t.edukt, 56)}<small>${chemEsc(this.name(t.edukt))}</small></div><b>→</b><div>${this.svg(t.produkt, 56)}<small>${chemEsc(this.name(t.produkt))}</small></div>`;
    else pic.innerHTML = `<div>${this.svg(t.target, 70)}<small>${chemEsc(this.name(t.target))}</small></div>`;
    side.append(pic);
    // Einstellungen (gemerkt)
    const set = el('div', { class: 'chem-pset' });
    const stepsSel = el('select', { title: 'Höchstens so viele Stufen' });
    for (const k of [1, 2, 3, 4]) stepsSel.append(el('option', { value: String(k), text: k + (k === 1 ? ' Stufe' : ' Stufen') }));
    stepsSel.value = String(o.planSteps || 3);
    stepsSel.addEventListener('change', () => { o.planSteps = +stepsSel.value; C.saveOpts(); });
    const rec = el('input', { type: 'checkbox' }); rec.checked = !!o.planRec;
    rec.addEventListener('change', () => { o.planRec = rec.checked; C.saveOpts(); });
    const amt = el('input', { type: 'number', min: '0.01', step: 'any', value: String(o.planAmt || 10), class: 'chem-pamt', title: 'Gewünschte Menge Endprodukt' });
    const unit = el('select', { class: 'chem-punit' }); for (const u of ['mmol', 'mol']) unit.append(el('option', { value: u, text: u })); unit.value = o.planUnit || 'mmol';
    const upd = () => { let v = Math.max(0.01, +amt.value || 10); if (unit.value === 'mol' && v > 10) { v = 10; amt.value = '10'; } o.planAmt = v; o.planUnit = unit.value; C.saveOpts(); if (st.open >= 0) C.renderSide(); };
    for (const x of [amt, unit, stepsSel]) x.addEventListener('keydown', e => e.stopPropagation());
    amt.addEventListener('change', upd); unit.addEventListener('change', upd);
    set.append(el('label', {}, el('span', { text: 'Stufen' }), stepsSel), el('label', { title: 'Nur Reaktionen ohne Metall-Katalysator, ohne sehr giftige oder pyrophore Reagenzien und ohne extreme Temperaturen' }, rec, el('span', { text: 'nur empfohlene' })),
      el('label', { title: 'Zielmenge (bis 10 mol) – daraus die Mengen jeder Stufe über typische Ausbeuten' }, el('span', { text: 'Ziel' }), amt, unit));
    side.append(set);
    const go = el('button', { class: 'btn primary chem-pgo', text: st.busy ? 'rechnet …' : t.kind === 'route' ? 'Weg suchen' : 'Synthesewege vorschlagen', disabled: st.busy });
    go.addEventListener('click', () => this.run(C));
    side.append(go);
    if (st.res && st.sig !== sig) side.append(el('div', { class: 'chem-muted chem-pwarn', text: 'Die Zeichnung hat sich geändert – „' + go.textContent + '“ rechnet neu.' }));
    if (!st.res) { side.append(el('div', { class: 'chem-muted', text: 'Regelwerk mit ' + ChemRxn.RULES.length + ' Reaktionen (offline, keine Literaturdatenbank). Katalysatoren, sehr giftige Reagenzien und extreme Bedingungen werden vorgeschlagen, aber nicht empfohlen.' })); this.links(C, side, t); return; }
    if (st.open >= 0 && st.res.routes[st.open]) this.renderRoute(C, side, st.res.routes[st.open]);
    else this.renderList(C, side);
    this.links(C, side, t);
  },
  run(C) {
    const st = this.st, t = st.task, o = C.opts;
    if (!t || t.kind === 'none' || st.busy) return;
    st.busy = true; C.renderSide();
    setTimeout(() => {
      try {
        const opt = { maxSteps: o.planSteps || 3, recOnly: !!o.planRec };
        if (t.kind === 'route') { const r = ChemRxn.route(t.edukt, t.produkt, opt); st.res = { kind: 'route', found: r.found, routes: r.routes }; }
        else st.res = { kind: 'target', routes: ChemRxn.plan(t.target, opt) };
      } catch (e) { console.warn('Planung', e); st.res = { kind: t.kind, routes: [], err: e.message }; }
      st.sig = this.sigOf(t); st.open = -1; st.busy = false;
      C.renderSide();
    }, 30);
  },
  renderList(C, side) {
    const st = this.st, rs = st.res.routes;
    if (st.res.kind === 'route') side.append(el('div', { class: 'chem-muted' + (st.res.found ? '' : ' chem-pwarn'), text: st.res.found ? `${rs.length} Weg(e) gefunden.` : 'Kein vollständiger Weg im Regelwerk – hier die Wege, deren Ausgangsstoffe dem Edukt am ähnlichsten sind.' }));
    if (!rs.length) { side.append(el('div', { class: 'chem-muted', text: st.res.err ? 'Fehler: ' + st.res.err : 'Keine passende Reaktion gefunden.' })); return; }
    const best = rs[0].score || 1;
    const list = el('div', { class: 'chem-plist' });
    rs.forEach((r, i) => {
      const steps = ChemRxn.steps(r.root), leaves = ChemRxn.leaves(r.root);
      const allRec = steps.every(n => n.step.opt.rec);
      const stars = '★★★'.slice(0, Math.max(1, Math.round(3 * Math.min(1, r.score / best)))) + '☆☆☆'.slice(Math.max(1, Math.round(3 * Math.min(1, r.score / best))));
      const card = el('button', { class: 'chem-pcard', type: 'button', title: 'Weg öffnen – Stufen ansehen und ändern' },
        el('div', { class: 'chem-pcard-h' }, el('b', { text: `Weg ${i + 1}` }), el('span', { text: ` · ${steps.length} ${steps.length === 1 ? 'Stufe' : 'Stufen'} · ${stars}` }), el('span', { class: 'chem-pbadge ' + (allRec ? 'ok' : 'warn'), text: allRec ? 'mild' : 'mit Vorbehalt' })),
        el('div', { class: 'chem-pcard-r', text: steps.map(n => n.step.opt.name).join(' → ') }),
        el('div', { class: 'chem-muted', text: 'Ausgangsstoffe: ' + leaves.map(l => this.name(l.mol)).join(', ') + (r.goal ? ' ✓ Edukt' : r.sim != null ? ` (Ähnlichkeit ${Math.round(r.sim * 100)} %)` : '') }));
      card.addEventListener('click', () => { st.open = i; C.renderSide(); });
      list.append(card);
    });
    side.append(list);
  },
  /* ---------------------------------------------------------------- ein Weg: Stufen ansehen und bearbeiten */
  renderRoute(C, side, r) {
    const st = this.st, o = C.opts;
    const nav = el('div', { class: 'chem-row' },
      el('button', { class: 'chem-mini', text: '← alle Wege', onclick: () => { st.open = -1; C.renderSide(); } }),
      el('button', { class: 'chem-mini primary', text: 'Schema in die Zeichnung', title: 'Moleküle, Pfeile und Bedingungen rechts neben die Zeichnung', onclick: () => this.draw(C, r.root) }),
      el('button', { class: 'chem-mini', text: 'Als Text einfügen', title: 'Versuchsvorschriften (Gerüst) als Text in die Seite', onclick: () => this.asText(C, r.root) }));
    side.append(nav);
    const nT = (o.planAmt || 10) * ((o.planUnit || 'mmol') === 'mol' ? 1000 : 1);
    // benötigte Mengen von hinten (Ziel) nach vorne über typische Ausbeuten
    const need = new Map([[r.root, nT]]);
    const walk = (n) => { if (!n.step) return; const y = this.yieldMid(n.step.opt.yld), nE = need.get(n) / y; n.step.kids.forEach((k, j) => need.set(k, j === n.step.opt.main ? nE : nE * 1.1)); n.step.kids.forEach(walk); };
    walk(r.root);
    const steps = ChemRxn.steps(r.root);
    steps.forEach((n, si) => {
      const opt = n.step.opt, box = el('section', { class: 'chem-pstep' });
      const cond = { ...opt.cond, ...(n.step.edit || {}) };
      box.append(el('div', { class: 'chem-pstep-h' }, el('b', { text: `Stufe ${si + 1}: ` }), el('span', { text: opt.name }), this.badges(opt)));
      // Bild: Edukte → Produkt
      const fig = el('div', { class: 'chem-pfig' });
      fig.innerHTML = n.step.kids.map(k => `<div>${this.svg(k.mol, 54)}<small>${chemEsc(this.name(k.mol))}</small></div>`).join('<b>+</b>') + `<b>→</b><div>${this.svg(n.mol, 54)}<small>${chemEsc(this.name(n.mol))}</small></div>`;
      box.append(fig);
      // Reaktion ändern
      const sel = el('select', { class: 'chem-psel', title: 'Andere Reaktion zum selben Produkt' });
      const alts = this.alts(n, !!o.planRec);
      if (!alts.some(a => a.id === opt.id && a.keys.join() === opt.keys.join())) alts.unshift(opt);
      alts.forEach((a, k) => sel.append(el('option', { value: String(k), text: `${a.name}${a.rec ? '' : ' (Vorbehalt)'} – aus ${a.pre.map(p => this.name(p)).join(' + ')}` })));
      sel.value = String(alts.findIndex(a => a.id === opt.id && a.keys.join() === opt.keys.join()));
      sel.addEventListener('change', () => { ChemRxn.setStep(n, alts[+sel.value]); C.renderSide(); });
      sel.addEventListener('keydown', e => e.stopPropagation());
      box.append(el('label', { class: 'chem-plab' }, el('span', { text: 'Reaktion' }), sel));
      // Bedingungen (editierbar)
      const cg = el('div', { class: 'chem-pcond' });
      for (const [k, lab] of [['solv', 'Lösungsmittel'], ['T', 'Temperatur'], ['t', 'Zeit']]) {
        const inp = el('input', { value: cond[k] || '', title: lab });
        inp.addEventListener('keydown', e => e.stopPropagation());
        inp.addEventListener('change', () => { n.step.edit = { ...(n.step.edit || {}), [k]: inp.value }; });
        cg.append(el('label', {}, el('span', { text: lab }), inp));
      }
      box.append(cg);
      // Mengen
      const am = ChemRxn.amounts({ ...opt, cond }, need.get(n) / this.yieldMid(opt.yld), n.step.kids.map(k => ({ label: this.name(k.mol) })));
      const tb = el('table', { class: 'chem-ptab' });
      tb.append(el('tr', {}, ...['Stoff', 'Äq.', 'mmol', 'Menge'].map(h => el('th', { text: h }))));
      const fm = (x) => x == null ? '–' : x < 1 ? (x * 1000).toFixed(x < 0.01 ? 1 : 0) + ' mg' : x < 1000 ? x.toFixed(2) + ' g' : (x / 1000).toFixed(2) + ' kg';
      const fv = (v) => v == null ? '' : ' · ' + (v < 1 ? (v * 1000).toFixed(0) + ' µL' : v < 1000 ? v.toFixed(1) + ' mL' : (v / 1000).toFixed(2) + ' L');
      for (const a of am) tb.append(el('tr', {}, el('td', { text: a.name, title: a.role }), el('td', { text: a.eq ? String(+a.eq.toFixed(2)) : '' }), el('td', { text: a.n < 10 ? a.n.toFixed(2) : a.n.toFixed(0) }), el('td', { text: fm(a.m) + fv(a.V) })));
      box.append(tb);
      // Edukte: weiter zerlegen / als Ausgangsstoff / aus Zeichnung
      for (const k of n.step.kids) {
        const si2 = ChemRxn.startInfo(k.mol);
        const row = el('div', { class: 'chem-pkid' }, el('span', { text: this.name(k.mol) + (k.step ? ' (wird hergestellt)' : ' – ' + si2.why) }));
        if (!k.step) row.append(el('button', { class: 'chem-mini', text: 'weiter zerlegen', title: 'Eine Stufe davor vorschlagen', onclick: () => { const a = this.alts(k, !!o.planRec)[0]; if (a) { ChemRxn.setStep(k, a); C.renderSide(); } else UI.toast('Keine passende Reaktion im Regelwerk'); } }));
        else row.append(el('button', { class: 'chem-mini', text: 'als Ausgangsstoff', title: 'Stufe davor entfernen', onclick: () => { k.step = null; C.renderSide(); } }));
        row.append(el('button', { class: 'chem-mini', text: 'aus Zeichnung', title: 'Dieses Edukt durch das in der Zeichnung ausgewählte Molekül ersetzen', onclick: () => {
          const F = C.focus();
          if (!F || F.frags.length !== 1) { UI.toast('Zuerst ein Molekül in der Zeichnung anklicken'); return; }
          k.mol = ChemRxn.clean(ChemRender.subMol(C.E.mol, F.frags[0])); k.key = ChemRxn.key(k.mol); k.step = null; n.step.manual = true; C.renderSide();
        } }));
        box.append(row);
      }
      const notes = [cond.work ? 'Aufarbeitung: ' + cond.work : '', opt.note, opt.yld ? 'Typische Ausbeute ' + opt.yld + '.' : '', n.step.manual ? 'Edukt von Hand geändert – Reaktion bitte selbst prüfen.' : ''].filter(Boolean).join(' ');
      box.append(el('div', { class: 'chem-muted', text: notes }));
      side.append(box);
    });
  },
  links(C, side, t) {
    const smi = ChemRxn.smiles(t.target);
    side.append(el('div', { class: 'chem-row chem-plinks' },
      el('button', { class: 'chem-mini', text: 'In Reaxys suchen', title: 'Reaxys (Elsevier, Zugang über Hochschule/Firma) im Browser öffnen – SMILES liegt in der Zwischenablage zum Einfügen in die Struktursuche', onclick: () => { navigator.clipboard?.writeText(smi).catch(() => {}); window.open('https://www.reaxys.com/', '_blank', 'noopener'); UI.toast('SMILES kopiert – in Reaxys bei „Structure“ einfügen'); } }),
      el('button', { class: 'chem-mini', text: 'SMILES kopieren', onclick: () => navigator.clipboard?.writeText(smi).then(() => UI.toast('SMILES kopiert'), () => {}) })));
  },
  /* ---------------------------------------------------------------- Schema in die Zeichnung: A (+ B) → C (+ D) → … */
  draw(C, root) {
    const steps = ChemRxn.steps(root);
    if (!steps.length) return;
    const clip = { atoms: [], bonds: [], objs: [] };
    let nid = 1, x = 0;
    const put = (m0) => {
      const m = ChemRxn.layout(m0);
      const xs = m.atoms.map(a => a.x), ys = m.atoms.map(a => a.y);
      const x0 = Math.min(...xs), x1 = Math.max(...xs), cy = (Math.min(...ys) + Math.max(...ys)) / 2;
      const map = new Map();
      for (const a of m.atoms) { const id = nid++; map.set(a.id, id); clip.atoms.push({ ...a, id, x: a.x - x0 + x + BL * 0.4, y: a.y - cy }); }
      for (const b of m.bonds) clip.bonds.push({ ...b, id: nid++, a: map.get(b.a), b: map.get(b.b) });
      x += x1 - x0 + BL * 1.2;
    };
    const plus = () => { clip.objs.push({ t: 'plus', x: x + BL * 0.1, y: 0 }); x += BL * 0.9; };
    let prev = null;
    steps.forEach((n, i) => {
      const opt = n.step.opt, cond = { ...opt.cond, ...(n.step.edit || {}) };
      const kids = n.step.kids.filter(k => k !== prev);
      if (i === 0 || !prev) kids.forEach((k, j) => { if (j) plus(); put(k.mol); });
      else kids.forEach((k) => { plus(); put(k.mol); });
      const up = opt.reag.filter(r => !/Kat|Additiv|Trocken/.test(r.role || '')).slice(0, 2).map(r => r.n).join(', ') || opt.name;
      const dn = [cond.solv, cond.T].filter(Boolean).join(', ');
      clip.objs.push({ t: 'arrow', k: 'r', x1: x, y1: 0, x2: x + BL * 4, y2: 0, up, dn });
      x += BL * 4.6;
      put(n.mol);
      prev = n;
    });
    C.insertClip(clip);
    C.renderSide();
    UI.toast('Syntheseschema eingefügt – Pfeiltexte per Doppelklick ändern');
  },
  asText(C, root) {
    const o = C.opts, nT = (o.planAmt || 10) * ((o.planUnit || 'mmol') === 'mol' ? 1000 : 1);
    const steps = ChemRxn.steps(root);
    let n = nT;
    const need = new Map([[root, nT]]);
    const walk = (x) => { if (!x.step) return; const nE = need.get(x) / this.yieldMid(x.step.opt.yld); x.step.kids.forEach((k, j) => need.set(k, j === x.step.opt.main ? nE : nE * 1.1)); x.step.kids.forEach(walk); };
    walk(root); void n;
    const html = steps.map((x, i) => `<b>Stufe ${i + 1}:</b> ` + chemEsc(ChemRxn.procedure({ ...x.step.opt, cond: { ...x.step.opt.cond, ...(x.step.edit || {}) } }, need.get(x) / this.yieldMid(x.step.opt.yld), this.name(x.mol)))).join('<br>');
    C.insertText(html + '<br><i>Vorschlag aus Regelwerk (KnowledgeTree) – Bedingungen vor dem Versuch prüfen.</i>');
  },
};
if (typeof module !== 'undefined') module.exports = { ChemPlan };
