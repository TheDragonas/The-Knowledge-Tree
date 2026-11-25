'use strict';
/* Browser-Test 1.68: Office-Seiten dynamisch, Tabs, Handy, Menüband – node tests/browser/office-168.js [url]
 *  - Formelleiste gehört zur Seite (verschwindet beim Verlassen der Excel-Seite, auch über Tabs/geteilte Bereiche)
 *  - geteilte Bereiche: Ansicht passt sich der Bereichsgrösse an, gespeicherte Ansichten werden nicht vertauscht
 *  - verstellbare Leisten (Folienübersicht, Notizspalte, Animationsbereich, Navigationsbereich), gespeichert
 *  - Seitenverhältnisse: breit, Hochformat (kompakt: Animationen/Notizen als Einblendung), schmal (Übersicht unten)
 *  - Handy (iPhone-Emulation): Word antippen = Schreibmarke, Lineale aus, Navigation als Einblendung;
 *    PowerPoint Normal: Notizen-Knopf, Wischen = Folie; Excel: Formelleiste und Blattregister
 *  - Menüband: in allen Registern aller Seitentypen keine Gruppe höher als das Band, Namen nicht verdeckt,
 *    beim Bildlauf Platz für den Balken unter den Gruppennamen, keine doppelten Gruppen */
const fs = require('fs'), path = require('path');
const { chromium, devices } = require('playwright');
const url = process.argv[2] || 'http://127.0.0.1:8800/index.html';
const HW = process.argv[3] || '';
(async () => {
  const br = await chromium.launch();
  let ok = 0, bad = 0;
  const check = (n, c, info) => { if (c) ok++; else { bad++; console.log('FALSCH', n, info === undefined ? '' : typeof info === 'string' ? info : JSON.stringify(info)); } };
  const errs = [];
  const open = async (opts) => {
    const ctx = await br.newContext(opts); const pg = await ctx.newPage();
    pg.on('pageerror', e => errs.push(e.message));
    pg.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push(m.text()); });
    await pg.goto(url);
    await pg.waitForFunction(() => typeof OfficeSlides !== 'undefined' && Store.loaded && Canvas.page, null, { timeout: 20000 });
    await pg.waitForTimeout(800);
    return { ctx, pg };
  };
  const pptx = HW && fs.existsSync(path.join(HW, 'hello.pptx')) ? fs.readFileSync(path.join(HW, 'hello.pptx')).toString('base64') : null;
  const newPpt = (pg) => pg.evaluate(async (b) => {
    let p;
    if (b) { const s = atob(b), u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); p = await OfficePages.importOne(new File([u], 'hello.pptx')); }
    else { p = await OfficePages.newTyped('pptx'); await OfficeSlides.newSlide('content'); }
    await new Promise(r => setTimeout(r, 900)); document.activeElement && document.activeElement.blur(); return p.id;
  }, pptx);

  // ================================================================ 1) Desktop 1440×900
  let { ctx, pg } = await open({ viewport: { width: 1440, height: 900 } });
  const first = await pg.evaluate(() => Canvas.pageId);
  const xl = await pg.evaluate(async () => { const p = await OfficePages.newTyped('xlsx'); await new Promise(r => setTimeout(r, 800)); return p.id; });
  check('Excel-Seite: Formelleiste sichtbar', await pg.evaluate(() => !document.querySelector('#xl-bar').hidden));
  await pg.evaluate((id) => App.openPage(id), first); await pg.waitForTimeout(500);
  check('Excel-Seite verlassen: Formelleiste weg', await pg.evaluate(() => document.querySelector('#xl-bar').hidden));
  await pg.evaluate((id) => App.openPage(id), xl); await pg.waitForTimeout(500);
  check('zurück: Formelleiste wieder da', await pg.evaluate(() => !document.querySelector('#xl-bar').hidden));
  const pp = await newPpt(pg);
  check('PowerPoint-Seite: keine Formelleiste', await pg.evaluate(() => document.querySelector('#xl-bar').hidden));
  // geteilte Bereiche
  await pg.evaluate((id) => App.openPage(id), xl); await pg.waitForTimeout(500);
  const sp = await pg.evaluate(async (ids) => {
    const vx = Store.ui.views[ids.xl] && { ...Store.ui.views[ids.xl] };
    Panes.split('h', ids.pp); await new Promise(r => setTimeout(r, 1300));
    const right = { narrow: OfficeView.el.classList.contains('narrow'), w: Canvas.vp.clientWidth, strip: getComputedStyle(document.querySelector('.ofv-slides')).height, bar: document.querySelector('#xl-bar').hidden };
    const f = OfficePpt.currentFrame(), r = Canvas.els.get(f.id).querySelector('.fimg').getBoundingClientRect(), v = Canvas.vp.getBoundingClientRect();
    right.inside = r.left >= v.left - 1 && r.right <= v.right + 1;
    Panes.activate(Panes.treeLeaves()[0].id); await new Promise(r => setTimeout(r, 1300));
    const left = { page: Canvas.pageId === ids.xl, bar: !document.querySelector('#xl-bar').hidden, z: Canvas.view.z, vx, now: Store.ui.views[ids.xl] };
    return { right, left };
  }, { xl, pp });
  check('geteilt: PowerPoint im schmalen Bereich = schmale Darstellung, Folie passt', sp.right.narrow && sp.right.inside && sp.right.bar, sp.right);
  check('geteilt: Excel-Bereich behält seine Ansicht (Zoom 100 %) und Formelleiste', sp.left.page && sp.left.bar && Math.abs(sp.left.z - 1) < 0.01, sp.left);
  await pg.evaluate(() => { const ls = Panes.treeLeaves(); Panes.activate(ls[1].id); }); await pg.waitForTimeout(600);
  await pg.evaluate(() => { if (Panes.close) Panes.close(Panes.treeLeaves()[1].id); else if (Panes.closePane) Panes.closePane(Panes.treeLeaves()[1].id); }); await pg.waitForTimeout(800);
  await pg.evaluate((id) => App.openPage(id), pp); await pg.waitForTimeout(800);
  const dk = await pg.evaluate(() => ({ narrow: OfficeView.narrow(), compact: OfficeView.compact(), ap: document.querySelectorAll('.ofv-ap:not(.pop)').length, w: Canvas.vp.clientWidth }));
  check('breit: Animationsbereich neben der Folie', !dk.narrow && !dk.compact && dk.ap >= 1, dk);
  // Ziehgriffe
  const drag = async (sel, dx) => { const r = await pg.evaluate((s) => { const hit = (x) => { const q = x.getBoundingClientRect(); if (!q.width) return false; const h = document.elementFromPoint(q.left + q.width / 2, q.top + Math.min(q.height / 2, 50)); return h === x || x.contains(h); }; const e = [...document.querySelectorAll(s)].find(hit); if (!e) return null; const q = e.getBoundingClientRect(); return { x: q.left + q.width / 2, y: q.top + Math.min(q.height / 2, 50) }; }, sel); if (!r) return false; await pg.mouse.move(r.x, r.y); await pg.mouse.down(); await pg.mouse.move(r.x + dx, r.y, { steps: 5 }); await pg.mouse.up(); await pg.waitForTimeout(400); return true; };
  const vis = "[...document.querySelectorAll('.ofv-ap')].find(x => { const g = x.querySelector('.ofv-rs'), q = g && g.getBoundingClientRect(); if (!q || !q.width) return false; const h = document.elementFromPoint(q.left + q.width / 2, q.top + Math.min(q.height / 2, 50)); return h === g; })";
  const a0 = await pg.evaluate((v) => eval(v).getBoundingClientRect().width, vis);
  await drag('.ofv-ap > .ofv-rs', 70);
  const a1 = await pg.evaluate((v) => ({ w: eval(v).getBoundingClientRect().width, st: (Store.ui.ofvW || {}).ap }), vis);
  check('Animationsbereich: Breite ziehen und speichern', a1.w > a0 + 50 && a1.st === Math.round(a1.w), [a0, a1]);
  const s0 = await pg.evaluate(() => document.querySelector('.ofv-slides').getBoundingClientRect().width);
  await drag('.ofv > .g-strip', 60);
  const s1 = await pg.evaluate(() => ({ w: document.querySelector('.ofv-slides').getBoundingClientRect().width, th: document.querySelector('.ofv-thb').getBoundingClientRect().width }));
  check('Folienübersicht: breiter ziehen, Miniaturen wachsen mit', s1.w > s0 + 40 && s1.th > s0 - 44 + 30, [s0, s1]);
  await pg.evaluate(() => OfficeSlides.setView('normal')); await pg.waitForTimeout(500);
  const n0 = await pg.evaluate(() => document.querySelector('.ofv-ncol.open').getBoundingClientRect());
  await drag('.ofv-ncol > .ofv-rs', 90);
  const n1 = await pg.evaluate(() => ({ r: document.querySelector('.ofv-ncol.open').getBoundingClientRect(), f: Canvas.els.get(OfficePpt.currentFrame().id).querySelector('.fimg').getBoundingClientRect().left }));
  check('Notizspalte: breiter ziehen, Folie rückt nach rechts', n1.r.width > n0.width + 70 && n1.f > n1.r.right, [n0.width, n1]);
  await pg.evaluate(() => { const g = document.querySelector('.ofv-ncol > .ofv-rs'); g.dispatchEvent(new MouseEvent('dblclick', { bubbles: true })); }); await pg.waitForTimeout(300);
  check('Doppelklick auf den Griff = Standardbreite', await pg.evaluate(() => Math.round(document.querySelector('.ofv-ncol.open').getBoundingClientRect().width) === 250 && !(Store.ui.ofvW || {}).ncol));
  // Grössenänderung des Fensters: Folie wird neu eingepasst
  await pg.setViewportSize({ width: 1900, height: 1000 }); await pg.waitForTimeout(700);
  const rs = await pg.evaluate(() => { const r = Canvas.els.get(OfficePpt.currentFrame().id).querySelector('.fimg').getBoundingClientRect(), v = Canvas.vp.getBoundingClientRect(), n = document.querySelector('.ofv-ncol.open').getBoundingClientRect(); return { inside: r.left > n.right && r.right <= v.right + 1, w: r.width, vw: v.width }; });
  check('Fenster grösser: Folie füllt den neuen Platz', rs.inside && rs.w > rs.vw * 0.45, rs);
  // Word: Navigationsbereich ziehen
  const wd = await pg.evaluate(async () => { const p = await OfficePages.newTyped('docx'); await new Promise(r => setTimeout(r, 800)); document.activeElement && document.activeElement.blur(); const w = p.boxes.find(b => b.ox && b.ox.k === 'w'); w.html = '<h1>Eins</h1><p>Text</p><h2>Zwei</h2>'; Canvas.render(); Cmd.run('wNav'); await new Promise(r => setTimeout(r, 500)); return p.id; });
  const nv0 = await pg.evaluate(() => document.querySelector('.ofv-nav').getBoundingClientRect().width);
  await drag('.ofv-nav > .ofv-rs', 80);
  const nv1 = await pg.evaluate(() => ({ w: document.querySelector('.ofv-nav').getBoundingClientRect().width, ruler: document.querySelector('.ofv-ruler').getBoundingClientRect().left - Canvas.vp.getBoundingClientRect().left }));
  check('Word-Navigationsbereich: breiter ziehen, Lineal rückt mit', nv1.w > nv0 + 60 && Math.abs(nv1.ruler - nv1.w) < 2, [nv0, nv1]);
  await pg.evaluate(() => Cmd.run('wNav'));
  void wd;
  // Hochformat (kompakt)
  await pg.setViewportSize({ width: 820, height: 1180 }); await pg.waitForTimeout(400);
  await pg.evaluate((id) => App.openPage(id), pp); await pg.waitForTimeout(800);
  await pg.evaluate(() => OfficeSlides.setView('lern')); await pg.waitForTimeout(500);
  const pt = await pg.evaluate(() => ({ vw: Canvas.vp.clientWidth, vh: Canvas.vp.clientHeight, iw: innerWidth, compact: OfficeView.compact(), narrow: OfficeView.narrow(), chips: document.querySelectorAll('.ofv-chips').length, ap: document.querySelectorAll('.ofv-ap:not(.pop)').length }));
  check('Hochformat: kompakt – Animationen als Knopf über der Folie', pt.compact && !pt.narrow && pt.chips >= 1 && pt.ap === 0, pt);
  await pg.evaluate(() => document.querySelector('.ofv-chip.a').click()); await pg.waitForTimeout(300);
  check('Knopf „Animationen“ blendet die Liste ein', await pg.evaluate(() => !!document.querySelector('.ofv-ap.pop')));
  await pg.evaluate(() => OfficeSlides.setView('normal')); await pg.waitForTimeout(500);
  const pn = await pg.evaluate(() => ({ tog: !!document.querySelector('.ofv-ntog'), col: !!document.querySelector('.ofv-ncol.open') }));
  check('Hochformat Normal: Notizen per Knopf, Folie über die ganze Breite', pn.tog && !pn.col, pn);
  await pg.evaluate(() => OfficeSlides.setView('lern'));
  // Menüband
  await pg.setViewportSize({ width: 1100, height: 800 }); await pg.waitForTimeout(400);
  const ids = await pg.evaluate(async () => { const o = { frei: Object.values(Store.pages).find(p => !p.office).id }; for (const t of ['docx', 'xlsx', 'pptx']) o[t] = Object.values(Store.pages).find(p => p.office && p.office.fmt === t).id; return o; });
  const rb = [];
  for (const pid of Object.values(ids)) {
    await pg.evaluate((id) => App.openPage(id), pid); await pg.waitForTimeout(500);
    const tabs = await pg.evaluate(() => Ribbon.TABS.filter(t => t.id !== 'datei' && (!t.ctx || t.ctx())).map(t => t.id));
    for (const t of tabs) {
      await pg.evaluate((t) => Ribbon.show(t), t); await pg.waitForTimeout(120);
      rb.push(await pg.evaluate((t) => {
        const panel = document.querySelector('#panel'), pr = panel.getBoundingClientRect(), out = [];
        const labels = [...panel.querySelectorAll('.rg-label')].map(l => l.textContent);
        if (new Set(labels).size !== labels.length) out.push('doppelte Gruppe');
        for (const g of panel.querySelectorAll('.rgroup')) { const b = g.querySelector('.rg-body'); if (b.scrollHeight > b.clientHeight + 1 && !g.querySelector('.pen-btn')) out.push('zu hoch: ' + g.querySelector('.rg-label').textContent); }
        for (const l of panel.querySelectorAll('.rg-label')) if (l.getBoundingClientRect().bottom > pr.top + panel.clientHeight + 0.5) out.push('Name abgeschnitten: ' + l.textContent);
        const ovf = panel.scrollWidth > panel.clientWidth + 2;
        if (ovf && !panel.classList.contains('ovf')) out.push('Bildlauf ohne Platz für den Balken');
        if (ovf) { const lb = Math.max(...[...panel.querySelectorAll('.rg-label')].map(l => l.getBoundingClientRect().bottom)); if (pr.bottom - lb < 10) out.push('Balken zu nah an den Namen ' + Math.round(pr.bottom - lb)); }
        return Ribbon.mode + '/' + t + (out.length ? ': ' + out.join(', ') : '');
      }, t));
    }
  }
  const rbBad = rb.filter(x => x.includes(':'));
  check(`Menüband: ${rb.length} Register geprüft, keine Überschneidungen`, rb.length > 25 && !rbBad.length, rbBad);
  await ctx.close();

  // ================================================================ 2) Handy (iPhone 13)
  ({ ctx, pg } = await open({ ...devices['iPhone 13'] }));
  const ph = await pg.evaluate(async () => {
    if (typeof Layout !== 'undefined' && Layout.toggleNav) Layout.toggleNav(false);
    const p = await OfficePages.newTyped('docx'); await new Promise(r => setTimeout(r, 900)); document.activeElement && document.activeElement.blur();
    const w = p.boxes.find(b => b.ox && b.ox.k === 'w'); w.html = '<h1>Titel</h1><p>Erster Absatz.</p><p>Zweiter Absatz mit Text.</p>'; Canvas.render(); await new Promise(r => setTimeout(r, 500));
    const t = Canvas.textEl(w.id).querySelectorAll('p')[1].getBoundingClientRect(), pr = Canvas.els.get(p.boxes.find(b => b.ox && b.ox.k === 'blatt').id).querySelector('.fimg').getBoundingClientRect(), v = Canvas.vp.getBoundingClientRect();
    return { y: t.top + t.height / 2, x: Math.min(t.right + 8, pr.right - 4), ruler: !!document.querySelector('.ofv-ruler, .ofv-vruler'), fits: pr.left >= v.left - 1 && pr.right <= v.right + 1, n: p.boxes.length };
  });
  check('Handy Word: Blatt passt in die Breite, keine Lineale', ph.fits && !ph.ruler, ph);
  await pg.touchscreen.tap(ph.x, ph.y); await pg.waitForTimeout(400);
  const tp = await pg.evaluate(() => { const s = getSelection(); return { ed: !!Canvas.editing, node: s.anchorNode && s.anchorNode.textContent, off: s.anchorOffset, n: Canvas.page.boxes.length }; });
  check('Handy Word: Antippen neben dem Text = Schreibmarke am Zeilenende, kein neues Feld', tp.ed && /^Zweiter Absatz/.test(tp.node) && tp.off === tp.node.length && tp.n === ph.n, tp);
  await pg.evaluate(() => Cmd.run('wNav')); await pg.waitForTimeout(300);
  const nvp = await pg.evaluate(() => { const n = document.querySelector('.ofv-nav').getBoundingClientRect(); return { w: n.width, vw: Canvas.vp.clientWidth, grip: !!document.querySelector('.ofv-nav > .ofv-rs') }; });
  check('Handy Word: Navigation als Einblendung (ohne Griff)', nvp.w < nvp.vw && nvp.w > nvp.vw * 0.5 && !nvp.grip, nvp);
  await pg.evaluate(() => document.querySelector('.ofv-nav .on-it').click()); await pg.waitForTimeout(300);
  check('Handy Word: Sprung schliesst die Navigation', await pg.evaluate(() => !document.querySelector('.ofv-nav')));
  await newPpt(pg);
  const pl = await pg.evaluate(() => ({ narrow: OfficeView.narrow(), strip: getComputedStyle(document.querySelector('.ofv-slides')).flexDirection, sh: document.querySelector('.ofv-slides').getBoundingClientRect().height, chips: document.querySelectorAll('.ofv-chip.n').length }));
  check('Handy PowerPoint: Übersicht unten, Knöpfe Notizen/Animationen', pl.narrow && pl.sh < 100 && pl.chips >= 1, pl);
  await pg.evaluate(() => OfficeSlides.setView('normal')); await pg.waitForTimeout(500);
  await pg.evaluate(() => document.querySelector('.ofv-ntog').click()); await pg.waitForTimeout(300);
  const no = await pg.evaluate(() => ({ open: !!document.querySelector('.ofv-ncol.open'), focus: document.activeElement && document.activeElement.classList.contains('ofv-ned') }));
  check('Handy PowerPoint Normal: Notizen-Knopf öffnet die Notizen', no.open, no);
  await pg.keyboard.type('Handynotiz'); await pg.waitForTimeout(1300);
  await pg.evaluate(() => OfficeSlides.closeNotes());
  check('… Notiz gespeichert', await pg.evaluate(() => Canvas.page.boxes.some(b => b.ox && b.ox.k === 'notiz' && /Handynotiz/.test(b.html))));
  const nfr = await pg.evaluate(() => OfficePpt.frames(Canvas.page).length);
  if (nfr > 1) {
    await pg.evaluate(() => OfficePpt.focusSlide(OfficePpt.frames(Canvas.page)[0].id)); await pg.waitForTimeout(300);
    const i0 = await pg.evaluate(() => OfficePpt.frames(Canvas.page).indexOf(OfficePpt.currentFrame()));
    await pg.evaluate(() => OfficeSlides.swipe(-120, 5, true)); await pg.waitForTimeout(400);
    const i1 = await pg.evaluate(() => OfficePpt.frames(Canvas.page).indexOf(OfficePpt.currentFrame()));
    check('Handy PowerPoint Normal: nach links wischen = nächste Folie', i1 === i0 + 1, [i0, i1]);
  }
  const xp = await pg.evaluate(async () => { await OfficePages.newTyped('xlsx'); await new Promise(r => setTimeout(r, 900)); const v = Canvas.vp.getBoundingClientRect(), bar = document.querySelector('#xl-bar'), st = document.querySelector('.ofv-sheets').getBoundingClientRect(); return { bar: !bar.hidden && bar.getBoundingClientRect().width <= innerWidth + 1, st: st.bottom <= v.bottom + 1 && st.height > 20 }; });
  check('Handy Excel: Formelleiste und Blattregister sichtbar', xp.bar && xp.st, xp);
  await ctx.close();

  check('keine Skriptfehler', errs.length === 0, errs.join(' | '));
  await br.close();
  console.log(`${ok} von ${ok + bad} Prüfungen bestanden (Office-Seiten 1.68: seitengebundene Formelleiste, Tabs, verstellbare Leisten, Seitenverhältnisse, Handy, Menüband)`);
  process.exit(bad ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
