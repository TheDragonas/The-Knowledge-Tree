'use strict';
/* Browser-Test Chem-Draw 1.54: node tests/browser/chem-reaktion.js [url]
 * Mehrere Moleküle (Infos nur für das ausgewählte, Unterschrift je Molekül), Reaktionspfeil mit Reagenzien,
 * Elektronenpfeil, Plus, Text, Klammern, freie Paare/δ, Kopieren/Einfügen (auch als SMILES), nächste Stufe,
 * Speichern auf der Seite und wieder öffnen, Register Zeichnen → Reaktion. Bildschirmfotos /tmp/kt-rx-*.png */
const { chromium } = require('playwright');
const url = process.argv[2] || 'http://127.0.0.1:8800/index.html';
(async () => {
  const br = await chromium.launch();
  const ctx = await br.newContext({ viewport: { width: 1400, height: 950 }, permissions: ['clipboard-read', 'clipboard-write'] });
  const pg = await ctx.newPage();
  const errs = [];
  pg.on('pageerror', e => errs.push(e.message));
  pg.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push(m.text()); });
  await pg.goto(url);
  await pg.waitForFunction(() => typeof Chem !== 'undefined' && Canvas.page, null, { timeout: 20000 });
  await pg.waitForTimeout(1200);
  let ok = 0, bad = 0;
  const check = (n, c, info) => { if (c) ok++; else { bad++; console.log('FALSCH', n, info || ''); } };
  await pg.evaluate(() => { try { localStorage.removeItem('kt-chem-clip'); } catch (e) { } Chem.open(null); });
  await pg.waitForTimeout(300);
  // zwei Moleküle: Ethanol und Essigsäure
  await pg.evaluate(() => { const m = ChemSmiles.toMol('CCO.CC(=O)O'); Chem.change(() => { Chem.E.mol = m; }); Chem.fit(); Chem.applyView(); });
  let side = await pg.evaluate(() => Chem.E.side.innerText);
  check('Liste: 2 Moleküle, ohne Auswahl keine Summenformel', /2 Moleküle/i.test(side) && /Ein Molekül anklicken/.test(side) && !/Elementaranalyse/.test(side), side.slice(0, 300));
  // erstes Molekül in der Liste wählen
  await pg.click('.chem-fitem >> nth=0');
  side = await pg.evaluate(() => Chem.E.side.innerText);
  check('ausgewählt: Name und Formel nur dieses Moleküls', /Ethanol/.test(side) && /C2H6O|C₂H₆O/.test(side.replace(/\s/g, '')) && /46[.,]0/.test(side), side.slice(0, 400));
  // Doppelklick (Auswahl-Werkzeug) auf ein Atom des zweiten Moleküls
  const pt = await pg.evaluate(() => { const E = Chem.E; const fr = ChemRender.fragments(E.mol)[1]; const a = fr.atoms[0]; const r = E.svg.getBoundingClientRect(); return { x: r.left + E.view.ox + a.x * E.view.s, y: r.top + E.view.oy + a.y * E.view.s }; });
  await pg.evaluate(() => Chem.setTool('select'));
  await pg.mouse.dblclick(pt.x, pt.y);
  await pg.waitForTimeout(100);
  side = await pg.evaluate(() => Chem.E.side.innerText);
  check('Doppelklick wählt Essigsäure', /Essigsäure|Ethansäure/.test(side) && /60[.,]0/.test(side), side.slice(0, 300));
  // Unterschrift nur für dieses Molekül
  await pg.click('.chem-chk:has-text("Name unter dieses Molekül") input');
  check('Name unter dem ausgewählten Molekül (Vorschau)', await pg.evaluate(() => /Essigsäure|Ethansäure/.test(Chem.E.molG.textContent) && !/Ethanol/.test(Chem.E.molG.textContent)));
  // Reaktionspfeil zwischen die Moleküle ziehen
  const geo = await pg.evaluate(() => { const E = Chem.E, r = E.svg.getBoundingClientRect(); const fr = ChemRender.fragments(E.mol); const xs = fr.map(f => Math.max(...f.atoms.map(a => a.x))); const x1 = Math.max(...fr[0].atoms.map(a => a.x)), x2 = Math.min(...fr[1].atoms.map(a => a.x)); const y = fr[0].atoms[0].y; const W = (x, y2) => ({ x: r.left + E.view.ox + x * E.view.s, y: r.top + E.view.oy + y2 * E.view.s }); return { a: W(x1 + 8, y), b: W(x2 - 8, y), xs }; });
  await pg.evaluate(() => Chem.setTool('arr_r'));
  if (geo.b.x - geo.a.x < 40) { await pg.evaluate(() => { const E = Chem.E; const f = ChemRender.fragments(E.mol)[1]; Chem.change(() => { for (const a of f.atoms) a.x += 150; }); Chem.fit(); Chem.applyView(); }); }
  const g2 = await pg.evaluate(() => { const E = Chem.E, r = E.svg.getBoundingClientRect(); const fr = ChemRender.fragments(E.mol); const x1 = Math.max(...fr[0].atoms.map(a => a.x)), x2 = Math.min(...fr[1].atoms.map(a => a.x)); const y = fr[0].atoms[0].y; const W = (x, y2) => ({ x: r.left + E.view.ox + x * E.view.s, y: r.top + E.view.oy + y2 * E.view.s }); return { a: W(x1 + 12, y + 1), b: W(x2 - 12, y + 4) }; });
  await pg.mouse.move(g2.a.x, g2.a.y); await pg.mouse.down(); await pg.mouse.move(g2.b.x, g2.b.y, { steps: 6 }); await pg.mouse.up();
  const arr = await pg.evaluate(() => (Chem.E.mol.objs || []).filter(o => o.t === 'arrow'));
  check('Reaktionspfeil gezeichnet (waagrecht eingerastet)', arr.length === 1 && Math.abs(arr[0].y1 - arr[0].y2) < 0.5, JSON.stringify(arr));
  await pg.evaluate(() => { const o = Chem.E.mol.objs[0]; Chem.change(() => { o.up = 'KMnO4, H2SO4'; o.dn = 'RT, 2 h'; }); });
  check('Reagenzien mit tiefgestellten Zahlen', await pg.evaluate(() => { const t = Chem.E.molG.innerHTML; return /KMnO/.test(t) && /SO/.test(t) && /RT, 2 h/.test(Chem.E.molG.textContent); }));
  // Elektronenpfeil vom O zum C=O
  const ep = await pg.evaluate(() => { const E = Chem.E, r = E.svg.getBoundingClientRect(); const O = E.mol.atoms.find(a => a.el === 'O'); const b = E.mol.bonds.find(x => x.o === 2); const A = E.mol.atoms.find(a => a.id === b.a), B = E.mol.atoms.find(a => a.id === b.b); const W = (x, y) => ({ x: r.left + E.view.ox + x * E.view.s, y: r.top + E.view.oy + y * E.view.s }); return { a: W(O.x, O.y), b: W((A.x + B.x) / 2, (A.y + B.y) / 2), oid: O.id, bid: b.id }; });
  await pg.evaluate(() => Chem.setTool('e2'));
  await pg.mouse.move(ep.a.x, ep.a.y); await pg.mouse.down(); await pg.mouse.move(ep.b.x, ep.b.y, { steps: 8 }); await pg.mouse.up();
  const cv = await pg.evaluate(() => (Chem.E.mol.objs || []).find(o => o.t === 'curve'));
  check('Elektronenpfeil an Atom und Bindung verankert', cv && cv.a.at === ep.oid && cv.b.bd === ep.bid, JSON.stringify(cv));
  // Plus, Klammer, freie Paare, δ
  await pg.evaluate(() => { const E = Chem.E; Chem.change(() => { Chem.addObj({ t: 'plus', x: 0, y: 60 }); Chem.addObj({ t: 'brk', x1: -20, y1: -20, x2: 40, y2: 40, s: '‡' }); const O = E.mol.atoms.find(a => a.el === 'O'); O.lpv = 2; O.pc = '-'; }); });
  check('Plus, Klammer ‡, freie Paare und δ− gezeichnet', await pg.evaluate(() => { const t = Chem.E.molG.innerHTML; return /‡/.test(t) && />\+</.test(t) && /δ−/.test(t) && (t.match(/r="1.35"/g) || []).length >= 4; }));
  await pg.screenshot({ path: '/tmp/kt-rx-editor.png' });
  // Kopieren / Einfügen
  const n0 = await pg.evaluate(() => Chem.E.mol.atoms.length);
  await pg.evaluate(() => { const fr = ChemRender.fragments(Chem.E.mol)[0]; Chem.selectFrag(fr); });
  await pg.keyboard.press('Control+c');
  await pg.waitForTimeout(100);
  const clipTxt = await pg.evaluate(() => navigator.clipboard.readText());
  check('als SMILES in der Zwischenablage', clipTxt === 'CCO' || clipTxt === 'OCC', clipTxt);
  await pg.keyboard.press('Control+v'); await pg.waitForTimeout(250);
  check('Einfügen: Molekül doppelt', (await pg.evaluate(() => Chem.E.mol.atoms.length)) === n0 + 3);
  // SMILES von aussen einfügen
  await pg.evaluate(() => navigator.clipboard.writeText('c1ccccc1'));
  await pg.keyboard.press('Control+v'); await pg.waitForTimeout(250);
  check('SMILES aus der Zwischenablage eingefügt (Benzol)', (await pg.evaluate(() => Chem.E.mol.atoms.length)) === n0 + 9);
  // nächste Stufe
  const no = await pg.evaluate(() => Chem.E.mol.objs.length);
  await pg.evaluate(() => Chem.addStep());
  await pg.waitForTimeout(200);
  await pg.keyboard.type('NaBH4'); await pg.keyboard.press('Control+Enter'); await pg.waitForTimeout(150);
  check('nächste Stufe: Pfeil rechts mit Reagenz', await pg.evaluate((no) => { const o = Chem.E.mol.objs[no]; return o && o.t === 'arrow' && o.up === 'NaBH4'; }, no));
  // auf die Seite und wieder öffnen
  const nb = await pg.evaluate(() => Canvas.page.boxes.length);
  await pg.evaluate(() => Chem.ok()); await pg.waitForTimeout(900);
  const saved = await pg.evaluate(() => { const b = Canvas.page.boxes[Canvas.page.boxes.length - 1]; const im = b.images.find(i => i.chem); return { boxes: Canvas.page.boxes.length, id: b.id, img: im && im.id, o: im && im.chem.mol.o && im.chem.mol.o.length }; });
  check('auf der Seite mit Reaktionsschema gespeichert', saved.boxes === nb + 1 && saved.o >= 5, JSON.stringify(saved));
  await pg.evaluate(([b, i]) => Chem.editImage(b, i), [saved.id, saved.img]); await pg.waitForTimeout(400);
  check('wieder geöffnet: Pfeile, freie Paare, Name-Schalter erhalten', await pg.evaluate(() => Chem.E.mol.objs.length >= 5 && Chem.E.mol.atoms.some(a => a.lpv === 2 && a.pc === '-') && Chem.E.mol.atoms.some(a => a.cn === 1)));
  await pg.evaluate(() => Chem.close());
  // Register Zeichnen → Reaktion
  await pg.evaluate(() => Ribbon.show('zeichnen')); await pg.waitForTimeout(200);
  check('Register Zeichnen: Reaktionssymbole', (await pg.$$('.gal-item[data-cmd="chemTool"]')).length >= 10);
  await pg.click('.gal-item[data-cmd="chemTool"][data-arg="\\"arr_eq\\""]');
  await pg.waitForTimeout(300);
  check('Klick öffnet Chem-Draw mit Gleichgewichtspfeil', await pg.evaluate(() => !!Chem.E && Chem.E.tool === 'arr_eq'));
  await pg.screenshot({ path: '/tmp/kt-rx-ribbon.png' });
  await pg.evaluate(() => Chem.close());
  check('keine Fehler in der Konsole', !errs.length, errs.slice(0, 5).join(' | '));
  console.log(`${ok} von ${ok + bad} Browser-Prüfungen bestanden (Chem-Draw Reaktionen)`);
  await br.close();
  process.exitCode = bad ? 1 : 0;
})();
