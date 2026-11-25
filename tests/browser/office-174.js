'use strict';
/* Browser-Test 1.74: Word-Import wie Word und Seitenansicht („PDF-Reader“)
 *   node tests/browser/office-174.js [url] [ordner]   (Testdatei: python3 tests/browser/word-fixtures.py <ordner>)
 *  - Inhaltsverzeichnis mit Verknüpfungen: Einträge, Füllpunkte, Seitenzahlen aus der Ansicht, Klick springt
 *  - Formatvorlagen: Schriftgrad, Farbe, Hervorhebung, Schriftart, Einzüge, Zeilenabstand, Blocksatz
 *  - Bilder: gedreht, zugeschnitten, EXIF, verankert (Umfliessen, hinter dem Text), VML-Grösse
 *  - Textfelder: eigenes Feld mit Rahmen/Füllung, Text nicht doppelt
 *  - Seitenumbrüche: Seitenumbruch oberhalb, Umbruch am Absatzende, Abschnittswechsel; Absätze über die Seitengrenze
 *  - Tabellen: verbundene Zellen (rowspan/colspan), Schattierung
 *  - verlustfrei: unverändert = byte-gleich; geändert = Verzeichnis, Textfeld, Bilder bleiben
 *  - Seitenansicht: 1/2/mehrere Seiten, Zoom, Suche, Verweise, Miniaturen, Esc; Webseite mit derselben Ansicht */
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const { chromium } = require('playwright');
const url = process.argv[2] || 'http://127.0.0.1:8800/index.html';
const DIR = process.argv[3] || '/tmp/kt-word';
const OUT = fs.mkdtempSync('/tmp/kt174-');
(async () => {
  const FX = path.join(DIR, 'word174.docx');
  if (!fs.existsSync(FX) || !fs.existsSync(path.join(DIR, 'word174-feld.docx'))) execFileSync('python3', [path.join(__dirname, 'word-fixtures.py'), DIR]);
  const br = await chromium.launch();
  let ok = 0, bad = 0;
  const check = (n, c, info) => { if (c) ok++; else { bad++; console.log('FALSCH', n, info === undefined ? '' : typeof info === 'string' ? info : JSON.stringify(info)); } };
  const pg = await br.newPage({ viewport: { width: 1400, height: 950 } });
  const errs = [];
  pg.on('pageerror', e => errs.push(e.message));
  pg.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push(m.text()); });
  await pg.goto(url);
  await pg.waitForFunction(() => typeof OfficeReader !== 'undefined' && typeof OfficeWI !== 'undefined' && Store.loaded && Canvas.page, null, { timeout: 20000 });
  await pg.waitForTimeout(800);
  const orig = fs.readFileSync(FX);
  const pid = await pg.evaluate(async ([b, name]) => {
    const s = atob(b), u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i);
    window.__orig = u;
    window.__eq = async (blob, u2) => { const a = new Uint8Array(await blob.arrayBuffer()); if (a.length !== u2.length) return false; for (let i = 0; i < a.length; i++) if (a[i] !== u2[i]) return false; return true; };
    const p = await OfficePages.importOne(new File([u], name)); await new Promise(r => setTimeout(r, 1500));
    document.querySelectorAll('.toast').forEach(t => t.remove());
    return p.id;
  }, [orig.toString('base64'), 'word174.docx']);
  await pg.waitForTimeout(500);
  const py = (code, ...args) => { try { return JSON.parse(execFileSync('python3', ['-c', code, ...args], { encoding: 'utf8' })); } catch (e) { return { err: String(e.stderr || e.message).slice(-600) }; } };
  const save = async (name) => {
    const b64 = await pg.evaluate(async () => { const blob = (await OfficePages.current(Canvas.page)).blob; const u = new Uint8Array(await blob.arrayBuffer()); let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(s); });
    const f = path.join(OUT, name); fs.writeFileSync(f, Buffer.from(b64, 'base64')); return f;
  };

  /* ============================================================ Aufbau, Seiten */
  const info = await pg.evaluate(() => {
    const p = Canvas.page, o = p.office, P = OfficeView.paper(p);
    const pageOf = (y) => Math.floor((y - o.paperY) / (P.H + OfficeView.GAP)) + 1;
    const cTop = (i) => OfficeView.pageTop(p, i - 1) + P.t;
    const where = (re) => {
      for (const b of p.boxes) {
        const t = Canvas.textEl(b.id); if (!t) continue;
        for (const c of OfficeWI.kids(t)) if (re.test(c.textContent)) { const y = b.y + (c.getBoundingClientRect().top - Canvas.els.get(b.id).getBoundingClientRect().top) / Canvas.view.z - 13; return { page: pageOf(y), atTop: Math.abs(y - cTop(pageOf(y))) < 3, d: y - cTop(pageOf(y)) }; }
      }
      return null;
    };
    return {
      pages: o.pages, kinds: o.map.map(m => { const b = m.box && p.boxes.find(q => q.id === m.box); return b ? b.ox.k : '-'; }),
      toc: [...document.querySelectorAll('#world .kt-toc-e')].map(e => [e.querySelector('.kt-toc-t').textContent, e.querySelector('.kt-toc-p').textContent, !!e.querySelector('.kt-toc-d'), (e.querySelector('a') || {}).getAttribute ? e.querySelector('a').getAttribute('href') : '']),
      tocHead: (document.querySelector('#world .kt-toc-h') || {}).textContent,
      einl: where(/^1 Einleitung$/), bilder: where(/^2 Bilder$/), nach: where(/^Nach dem Umbruch/), abs2: where(/^Abschnitt 2/),
      gaps: document.querySelectorAll('#world .pg-fl .pg-gap').length,
      split: (() => { const b = p.boxes.find(q => q.ox && q.ox.k === 'w' && /Absatz 3/.test(q.html)); const e = b && Canvas.els.get(b.id); return !!e && e.querySelectorAll('.pg-gap').length >= 2; })(),
    };
  });
  check('8 Seiten wie in Word/LibreOffice', info.pages === 8, info.pages);
  check('Verzeichnis als eigenes Feld (wtoc), Textfeld/Bild-Felder vorhanden', info.kinds.includes('wtoc') && info.kinds.filter(k => k === 'wimg').length >= 6 && info.kinds.includes('wfl'), info.kinds);
  check('Inhaltsverzeichnis: Überschrift „Inhalt“ und 5 Einträge mit Füllpunkten und Verweis', info.tocHead === 'Inhalt' && info.toc.length === 5 && info.toc.every(e => e[2] && /^#_Toc100\d$/.test(e[3])), info.toc);
  check('Inhaltsverzeichnis: Seitenzahlen aus der Ansicht (2, 2, 5, 6, 6)', info.toc.map(e => e[1]).join(',') === '2,2,5,6,6', info.toc.map(e => e[1]));
  check('Seitenumbruch oberhalb: „1 Einleitung“ oben auf Seite 2, „2 Bilder“ oben auf Seite 5', info.einl && info.einl.page === 2 && info.einl.atTop && info.bilder && info.bilder.page === 5 && info.bilder.atTop, [info.einl, info.bilder]);
  check('Umbruch am Absatzende und Abschnittswechsel: neue Seiten 7 und 8', info.nach && info.nach.page === 7 && info.nach.atTop && info.abs2 && info.abs2.page === 8 && info.abs2.atTop, [info.nach, info.abs2]);
  check('Absätze gehen über die Seitengrenze weiter (Lücken-Floats)', info.split && info.gaps >= 2, info);

  /* ============================================================ Formatierung */
  const fm = await pg.evaluate(() => {
    const p = Canvas.page, all = p.boxes.map(b => b.html).join('\n');
    const d = document.createElement('div'); d.innerHTML = all;
    const red = [...d.querySelectorAll('span')].find(s => /grosser roter/.test(s.textContent));
    const hl = [...d.querySelectorAll('span')].find(s => /Gelb markiert/.test(s.textContent));
    const ind = [...d.querySelectorAll('div')].find(s => /^Eingerückt/.test(s.textContent));
    const h1 = [...d.querySelectorAll('h1')].find(s => /1 Einleitung/.test(s.textContent));
    const h2 = [...d.querySelectorAll('h2')].find(s => /1.1 Hintergrund/.test(s.textContent));
    const link = [...d.querySelectorAll('a')].find(a => /siehe Bilder/.test(a.textContent));
    return {
      red: red && [red.style.color, red.style.fontSize], hl: hl && [hl.style.backgroundColor, hl.style.fontFamily],
      ind: ind && [ind.style.paddingLeft, ind.style.textIndent, ind.style.textAlign, ind.style.lineHeight, ind.style.paddingBottom],
      h1: h1 && [h1.style.color, h1.style.fontSize, h1.style.fontWeight, h1.style.breakBefore, h1.style.paddingTop], h2: h2 && [h2.style.fontSize],
      link: link && link.getAttribute('href'),
      base: getComputedStyle(Canvas.vp).getPropertyValue('--kt-wbase'),
    };
  });
  check('Lauf: rot 14 pt', fm.red && fm.red[0] === 'rgb(192, 0, 0)' && fm.red[1] === '14pt', fm.red);
  check('Lauf: gelb hervorgehoben, Times New Roman', fm.hl && fm.hl[0] === 'rgb(255, 255, 0)' && /Times New Roman/.test(fm.hl[1]), fm.hl);
  check('Absatz: Einzug links 36 pt, erste Zeile 18 pt, Blocksatz, 1,5-zeilig, 12 pt danach', fm.ind && fm.ind[0] === '36pt' && fm.ind[1] === '18pt' && fm.ind[2] === 'justify' && Math.abs(parseFloat(fm.ind[3]) - 1.5 * 1.22) < 0.01 && fm.ind[4] === '12pt', fm.ind);
  check('Überschrift 1 aus der Formatvorlage: Farbe, 16 pt, nicht fett, Seitenumbruch oberhalb, 12 pt davor', fm.h1 && fm.h1[0] === 'rgb(47, 84, 150)' && fm.h1[1] === '16pt' && fm.h1[2] === 'normal' && fm.h1[3] === 'page' && fm.h1[4] === '12pt', fm.h1);
  check('Überschrift 2: 13 pt', fm.h2 && fm.h2[0] === '13pt', fm.h2);
  check('Verweis im Text auf die Textmarke', fm.link === '#_Toc1003', fm.link);
  check('Grundschrift des Dokuments (Calibri) als Variable', /Calibri/.test(fm.base), fm.base);

  /* ============================================================ Bilder */
  const im = await pg.evaluate(async () => {
    const p = Canvas.page;
    const px = async (src, fx, fy) => { const u = await Backend.imgURL(src); const i = new Image(); i.src = u; await i.decode(); const c = document.createElement('canvas'); c.width = i.naturalWidth; c.height = i.naturalHeight; const g = c.getContext('2d'); g.drawImage(i, 0, 0); const d = g.getImageData(Math.floor(fx * (c.width - 1)), Math.floor(fy * (c.height - 1)), 1, 1).data; return [d[0], d[1], d[2]]; };
    const box = (re) => p.boxes.find(b => b.ox && b.ox.k === 'wimg' && re.test(b.html));
    const rot = box(/Gedreht/), cr = box(/Zugeschnitten/), ex = box(/EXIF/), an = box(/Verankert/), vm = box(/VML-Bild/), bh = box(/Hinter dem Text/);
    const r = rot.images[0], c = cr.images[0], e = ex.images[0], a = an.images[0], v = vm.images[0];
    const behind = p.boxes.find(b => b.ox && b.ox.k === 'wfl' && b.ox.of === bh.id);
    const ae = Canvas.els.get(an.id).querySelector('.fimg');
    return {
      rot: [r.w, r.h, await px(r.src, 0.5, 0.1), await px(r.src, 0.5, 0.9)],
      crop: [c.w, c.h, await px(c.src, 0.02, 0.5), await px(c.src, 0.98, 0.5)],
      exif: [e.w, e.h, await px(e.src, 0.5, 0.1), await px(e.src, 0.5, 0.9)],
      anchor: [a.x, a.w, ae && ae.style.float, (an.html.match(/Verankert/g) || []).length],
      vml: [v.w, v.h],
      behind: behind && [behind.z, behind.images.length, !!behind.front, behind.images[0] && behind.images[0].w],
    };
  });
  const near = (c, t) => c && Math.abs(c[0] - t[0]) < 40 && Math.abs(c[1] - t[1]) < 40 && Math.abs(c[2] - t[2]) < 40;
  check('Bild gedreht (90°): hochkant 100×200, rot oben, blau unten', im.rot[0] === 100 && im.rot[1] === 200 && near(im.rot[2], [220, 30, 30]) && near(im.rot[3], [30, 60, 220]), im.rot);
  check('Bild zugeschnitten: nur der gelbe Teil, 120×120', im.crop[0] === 120 && im.crop[1] === 120 && near(im.crop[2], [250, 200, 0]) && near(im.crop[3], [250, 200, 0]), im.crop);
  check('Foto mit EXIF-Ausrichtung passend zum Rahmen (hochkant, rot oben)', im.exif[0] === 100 && im.exif[1] === 200 && near(im.exif[2], [220, 30, 30]) && near(im.exif[3], [30, 60, 220]), im.exif);
  check('Verankertes Bild mit Umfliessen: rechts an seiner Stelle (x 440), Text daneben', im.anchor[0] === 440 && im.anchor[1] === 160 && im.anchor[2] === 'right', im.anchor);
  check('VML-Bild: Grösse aus dem Stil (150 × 75 pt)', im.vml[0] === 200 && im.vml[1] === 100, im.vml);
  check('Bild hinter dem Text: eigenes Feld (z unten), nicht im Fluss', im.behind && im.behind[0] === 1 && im.behind[1] === 1 && !im.behind[2] && im.behind[3] === 300, im.behind);

  /* ============================================================ Textfeld, Tabelle */
  const tb = await pg.evaluate(() => {
    const p = Canvas.page;
    const t = p.boxes.find(b => b.ox && b.ox.k === 'wfl' && /Text im Textfeld/.test(b.html));
    const anch = t && p.boxes.find(b => b.id === t.ox.of);
    const n = p.boxes.map(b => (b.html.match(/Text im Textfeld/g) || []).length).reduce((a, b) => a + b, 0);
    const e = t && Canvas.els.get(t.id), a = anch && Canvas.els.get(anch.id);
    const tr = e && e.getBoundingClientRect(), ar = a && a.querySelector('.box-text').getBoundingClientRect();
    const d = document.createElement('div'); d.innerHTML = p.boxes.map(b => b.html).join('');
    const rs = [...d.querySelectorAll('td')].find(x => x.textContent === 'Verbunden'), y = [...d.querySelectorAll('td')].find(x => x.textContent === 'Kopf B'), cs = [...d.querySelectorAll('td')].find(x => /Über drei/.test(x.textContent));
    return { has: !!t, n, bold: t && /<b>(<span[^>]*>)?Text im Textfeld/.test(t.html), style: t && [t.style.bg, t.style.border], ghost: anch && anch.images.some(i => i.w === 220), right: tr && ar && tr.left > ar.left + 300 * Canvas.view.z, rows: rs && rs.rowSpan, yel: y && y.style.backgroundColor, cols: cs && cs.colSpan };
  });
  check('Textfeld: eigenes Feld, fett, Füllung und Rahmen aus Word', tb.has && tb.bold && tb.style[0] === '#deebf7' && tb.style[1] === '#2f5597', tb);
  check('Textfeld: Text nur einmal (kein Fallback-Doppel), steht rechts neben dem Absatz, Platzhalter zum Umfliessen', tb.n === 1 && tb.right && tb.ghost, tb);
  check('Tabelle: verbundene Zellen (rowspan 2, colspan 3) und Schattierung', tb.rows === 2 && tb.cols === 3 && tb.yel === 'rgb(255, 255, 0)', tb);

  /* ============================================================ Sprünge */
  const jp = await pg.evaluate(async () => {
    const p = Canvas.page;
    Canvas.view.y = 0; Canvas.applyView();
    const a = document.querySelector('#world .kt-toc-e:nth-child(4) a');
    a.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    await new Promise(r => setTimeout(r, 200));
    const h = [...document.querySelectorAll('#world h1')].find(x => x.textContent === '2 Bilder');
    const r = h.getBoundingClientRect(), v = Canvas.vp.getBoundingClientRect();
    return { visible: r.top >= v.top && r.top < v.top + 200, page: OfficeWI.pageAt(p, OfficeWI.bmY(p, '_Toc1003')) };
  });
  check('Klick im Inhaltsverzeichnis springt zur Überschrift', jp.visible && jp.page === 5, jp);

  /* ============================================================ verlustfrei */
  const same = await pg.evaluate(async () => { const r = await OfficePages.current(Canvas.page); return window.__eq(r.blob, window.__orig); });
  check('Unverändert gespeichert: byte-gleich', same);
  await pg.evaluate(() => {
    const p = Canvas.page, b = p.boxes.find(x => x.ox && x.ox.k === 'w' && /grosser roter/.test(x.html));
    b.html = b.html.replace('Ein Absatz mit grosser roter Schrift.', 'Ein Absatz mit GEÄNDERTER roter Schrift.');
    Canvas.render(true);
  });
  const f1 = await save('geaendert.docx');
  const chk = py(`
import sys, zipfile, re, json
z = zipfile.ZipFile(sys.argv[1]); d = z.read('word/document.xml').decode('utf8')
import docx
doc = docx.Document(sys.argv[1])
ps = [p.text for p in doc.paragraphs]
red = [p for p in doc.paragraphs if 'GEÄNDERTER' in p.text]
sz = red[0].runs[0].font.size.pt if red and red[0].runs and red[0].runs[0].font.size else None
print(json.dumps({ 'edit': bool(red), 'sz': sz, 'toc': 'Table of Contents' in d and d.count('PAGEREF') == 5, 'tb': d.count('<mc:AlternateContent') == 1 and 'Text im Textfeld' in d, 'pics': d.count('r:embed=') , 'vml': 'v:imagedata' in d, 'pbb': d.count('<w:pageBreakBefore/>'), 'sect': d.count('<w:sectPr') }))`, f1);
  check('Geändert gespeichert: Text neu, Schriftgrad bleibt (14 pt)', chk.edit && chk.sz === 14, chk);
  check('Geändert gespeichert: Verzeichnis, Textfeld, Bilder, Seitenumbrüche, Abschnitte bleiben', chk.toc && chk.tb && chk.pics === 5 && chk.vml && chk.pbb === 2 && chk.sect === 2, chk);

  /* ============================================================ Seitenansicht */
  await pg.evaluate(() => { document.querySelectorAll('.toast').forEach(t => t.remove()); Cmd.run('wPages'); });
  await pg.waitForTimeout(600);
  const rows = () => pg.evaluate(() => { const ps = [...document.querySelectorAll('.kt-rd-ov .kt-rd-pages > .kt-rd-pg')]; const t0 = ps[0].offsetTop; return ps.filter(p => p.offsetTop === t0).length; });
  const st0 = await pg.evaluate(() => OfficeReader._ov.state());
  check('Seitenansicht: 8 Seiten, Seitenbreite, nur sichtbare Seiten gezeichnet', st0.n === 8 && st0.fit === 'width' && st0.rendered >= 1 && st0.rendered < 8, st0);
  check('Seitenansicht: Ribbon Ansicht → Seitenansicht und Statusleiste', await pg.evaluate(() => Ribbon.show('ansicht') || true) && await pg.evaluate(() => !!document.querySelector('#sb-views [title^="Seitenansicht"]')));
  const r1 = await rows();
  await pg.click('.kt-rd-ov [data-a=m2]'); await pg.waitForTimeout(300);
  const r2 = await rows();
  await pg.click('.kt-rd-ov [data-a=mn]'); await pg.waitForTimeout(300);
  const rn = await rows();
  check('Eine Seite / zwei Seiten / mehrere Seiten nebeneinander', r1 === 1 && r2 === 2 && rn >= 3, [r1, r2, rn]);
  const z0 = await pg.evaluate(() => OfficeReader._ov.state().z);
  await pg.click('.kt-rd-ov [data-a=in]'); await pg.waitForTimeout(200);
  const z1 = await pg.evaluate(() => OfficeReader._ov.state().z);
  check('Zoom +', Math.abs(z1 / z0 - 1.2) < 0.01, [z0, z1]);
  await pg.click('.kt-rd-ov [data-a=m1]'); await pg.waitForTimeout(300);
  // Seitenansicht = Ausschnitte der Fläche: Seite 2 beginnt mit „1 Einleitung“, Lage wie im Dokument
  const s2 = await pg.evaluate(async () => { OfficeReader._ov.go(1); await new Promise(r => setTimeout(r, 300)); const pg2 = document.querySelector('.kt-rd-ov .kt-rd-pages > .kt-rd-pg[data-i="1"]'); const h = [...pg2.querySelectorAll('h1')].find(x => x.textContent === '1 Einleitung'); if (!h) return null; const r = h.getBoundingClientRect(), pr = pg2.getBoundingClientRect(), z = OfficeReader._ov.state().z; const P = OfficeView.paper(Canvas.page); return { dy: (r.top - pr.top) / z, want: P.t }; });
  check('Seite 2 zeigt „1 Einleitung“ oben im Satzspiegel (wie auf dem Papier)', s2 && Math.abs(s2.dy - s2.want) < 16, s2);
  await pg.evaluate(() => OfficeReader._ov.go(0)); await pg.waitForTimeout(200);
  await pg.click('.kt-rd-ov .kt-rd-pages > .kt-rd-pg[data-i="0"] .kt-toc-e:nth-child(5) a'); await pg.waitForTimeout(300);
  check('Seitenansicht: Verweis im Inhaltsverzeichnis → Seite 6', (await pg.evaluate(() => OfficeReader._ov.state().cur)) === 5);
  await pg.fill('.kt-rd-ov .kt-rd-q', 'Textfeld'); await pg.press('.kt-rd-ov .kt-rd-q', 'Enter'); await pg.waitForTimeout(400);
  const sq = await pg.evaluate(() => ({ st: OfficeReader._ov.state(), cur: document.querySelectorAll('.kt-rd-ov mark.kt-hit.cur').length, n: document.querySelector('.kt-rd-ov .kt-rd-qn').textContent }));
  check('Suche: Treffer gezählt und markiert', sq.st.hits >= 4 && sq.cur === 1 && /^1 \/ \d+$/.test(sq.n), sq);
  await pg.click('.kt-rd-ov [data-a=side]'); await pg.waitForTimeout(400);
  check('Seitenminiaturen', await pg.evaluate(() => document.querySelector('.kt-rd-ov').classList.contains('side') && document.querySelectorAll('.kt-rd-ov .kt-rd-th .kt-world').length >= 2));
  await pg.click('.kt-rd-ov .kt-rd-th[data-i="6"]'); await pg.waitForTimeout(300);
  check('Klick auf Miniatur → Seite 7', (await pg.evaluate(() => OfficeReader._ov.state().cur)) === 6);
  await pg.keyboard.press('Home'); await pg.waitForTimeout(200);
  check('Pos1 → Seite 1, Tasten gehen nicht an die Seite darunter', (await pg.evaluate(() => OfficeReader._ov.state().cur)) === 0);
  await pg.evaluate(() => document.activeElement && document.activeElement.blur());
  await pg.keyboard.press('Escape'); await pg.keyboard.press('Escape'); await pg.waitForTimeout(200);
  check('Esc schliesst die Seitenansicht', await pg.evaluate(() => !document.querySelector('.kt-rd-ov')));
  const mn = await pg.evaluate(() => { Cmd.run('wPages', 'n'); const s = OfficeReader._ov.state(); OfficeReader._ov.close(); return s.mode; });
  check('Ansicht → Mehrere Seiten öffnet die Seitenansicht mit mehreren Seiten', mn === 'n', mn);

  /* ============================================================ Webseite */
  const html = await pg.evaluate(async (id) => {
    window.__dl = []; Export.download = (name, blob) => { window.__dl.push({ name, blob }); };
    Export.sel = new Set([id]);
    await Export.run('html', { head: true });
    return window.__dl[0] ? await window.__dl[0].blob.text() : '';
  }, pid);
  const sa = await pg.evaluate(async () => { const r = await OfficeSaveAs.build(Canvas.page, 'html'); const f = await OfficeSaveAs.build(Canvas.page, 'htm'); return { h: await r.blob.text(), f: await f.blob.text(), ext: f.ext }; });
  fs.writeFileSync(path.join(OUT, 'export.html'), html); fs.writeFileSync(path.join(OUT, 'speichern.html'), sa.h);
  check('Exportieren → Webseite: Word-Seite mit Seitenansicht', /class="kt-rd kt-rd-exp"/.test(html) && /function ktReader/.test(html) && !/window\.ktFit/.test(html), html.length);
  check('Speichern unter → Webseite: Seitenansicht; „Webseite, gefiltert“: nur Text', /kt-rd-exp/.test(sa.h) && !/kt-rd-exp/.test(sa.f) && /GEÄNDERTER/.test(sa.f) && sa.ext === 'htm');
  const p2 = await br.newPage({ viewport: { width: 1300, height: 900 } });
  const e2 = []; p2.on('pageerror', e => e2.push(e.message));
  for (const f of ['export.html', 'speichern.html']) {
    await p2.goto('file://' + path.join(OUT, f)); await p2.waitForTimeout(700);
    const a = await p2.evaluate(() => ({ n: document.querySelectorAll('.kt-rd-pages > .kt-rd-pg').length, pn: (document.querySelector('.kt-rd-pn') || {}).textContent, toc: document.querySelectorAll('.kt-rd-pages .kt-toc-e').length }));
    await p2.fill('.kt-rd-pi', '5'); await p2.press('.kt-rd-pi', 'Enter'); await p2.waitForTimeout(500);
    const imgs = await p2.evaluate(() => [...document.querySelectorAll('.kt-rd-pages > .kt-rd-pg[data-i="4"] img')].filter(i => i.complete && i.naturalWidth > 10).length);
    await p2.click('[data-a=m2]'); await p2.waitForTimeout(300);
    const two = await p2.evaluate(() => { const ps = [...document.querySelectorAll('.kt-rd-pages > .kt-rd-pg')]; return ps.filter(p => p.offsetTop === ps[0].offsetTop).length; });
    await p2.evaluate(() => { const i = document.querySelector('.kt-rd-q'); i.value = 'Lorem'; i.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); });
    await p2.waitForTimeout(300);
    const q = await p2.evaluate(() => document.querySelector('.kt-rd-qn').textContent);
    check(`${f}: 8 Seiten, Verzeichnis, Bilder eingebettet, 2 Seiten nebeneinander, Suche`, a.n === 8 && a.pn === 'von 8' && a.toc === 5 && imgs >= 5 && two === 2 && /^1 \/ \d{2,}$/.test(q), { a, imgs, two, q });
  }
  check('Webseite ohne Fehler', !e2.length, e2);
  // ältere Word-Dateien: Verzeichnis als TOC-Feld über mehrere Absätze
  const fe = await pg.evaluate(async (b) => {
    const s = atob(b), u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i);
    const p = await OfficePages.importOne(new File([u], 'word174-feld.docx')); await new Promise(r => setTimeout(r, 1500));
    const t = p.boxes.find(x => x.ox && x.ox.k === 'wtoc');
    const same = await window.__eq((await OfficePages.current(p)).blob, u);
    return { toc: t && [t.ox.i1 - t.ox.i0, [...Canvas.els.get(t.id).querySelectorAll('.kt-toc-p')].map(x => x.textContent).join(',')], same };
  }, fs.readFileSync(path.join(DIR, 'word174-feld.docx')).toString('base64'));
  check('TOC-Feld ohne Inhaltssteuerelement: ein Verzeichnis über die 5 Feld-Absätze, Seitenzahlen, byte-gleich', fe.toc && fe.toc[0] === 5 && fe.toc[1] === '2,2,5,6,6' && fe.same, fe);
  check('Keine Fehler in der Konsole', !errs.length, errs);
  console.log(`office-174: ${ok} richtig, ${bad} falsch`);
  await br.close();
  process.exit(bad ? 1 : 0);
})();
