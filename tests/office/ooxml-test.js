'use strict';
/* OOXML-Kern (1.60) im Browser prüfen: node tests/office/ooxml-test.js [url]
 *  1. unverändert öffnen + speichern = Original Byte für Byte (docx/pptx/xlsx)
 *  2. einen Text ändern: nur dieser Teil (+ nichts sonst) ist anders; Python-Bibliotheken und LibreOffice öffnen die Datei
 *  3. neue leere Pakete (docx/xlsx/pptx) öffnen sich in Python und LibreOffice
 * Microsoft Office selbst ist hier nicht verfügbar (ungetestet). Ausgabe nach /tmp/kt-ooxml/ */
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const { chromium } = require('playwright');
const url = process.argv[2] || 'http://127.0.0.1:8800/index.html';
const OUT = '/tmp/kt-ooxml';
fs.mkdirSync(OUT, { recursive: true });
const FIX = path.join(__dirname, 'fixtures');
const py = (f, cmp) => JSON.parse(execFileSync('python3', [path.join(__dirname, 'check.py'), f, ...(cmp ? ['--vergleich', cmp] : [])], { encoding: 'utf8', timeout: 240000 }).trim().split('\n').pop());
(async () => {
  const br = await chromium.launch();
  const pg = await br.newPage();
  const errs = [];
  pg.on('pageerror', e => errs.push(e.message));
  await pg.goto(url);
  await pg.waitForFunction(() => typeof Ooxml !== 'undefined', null, { timeout: 20000 });
  let ok = 0, bad = 0;
  const check = (n, c, info) => { if (c) ok++; else { bad++; console.log('FALSCH', n, info || ''); } };
  const run = (fn, arg) => pg.evaluate(fn, arg);
  const b64 = (f) => fs.readFileSync(f).toString('base64');
  for (const f of ['test.docx', 'test.pptx', 'test.xlsx']) {
    const src = path.join(FIX, f);
    const r = await run(async ({ data, f }) => {
      const u8 = Uint8Array.from(atob(data), c => c.charCodeAt(0));
      const pkg = await Ooxml.open(u8);
      const same = new Uint8Array(await (await pkg.save()).arrayBuffer());
      let eq = same.length === u8.length; for (let i = 0; eq && i < u8.length; i++) if (same[i] !== u8[i]) eq = false;
      // gezielte Änderung: ein Wort im Hauptteil bzw. in Folie 1 bzw. in den gemeinsamen Zeichenketten
      const part = pkg.kind === 'docx' ? pkg.main : pkg.kind === 'pptx' ? 'ppt/slides/slide1.xml' : pkg.has('xl/sharedStrings.xml') ? 'xl/sharedStrings.xml' : 'xl/worksheets/sheet1.xml';
      const doc = await pkg.xml(part);
      const ts = [...doc.getElementsByTagNameNS('*', 't')];
      const t = ts.find(x => /Round-Trip|Artikel/.test(x.textContent));
      if (t) t.textContent = t.textContent.replace(/Round-Trip|Artikel/, 'Geändert-in-KT');
      pkg.setXml(part, doc);
      const out = await pkg.save();
      const ab = new Uint8Array(await out.arrayBuffer());
      let s = ''; for (let i = 0; i < ab.length; i += 0x8000) s += String.fromCharCode.apply(null, ab.subarray(i, i + 0x8000));
      return { kind: pkg.kind, main: pkg.main, eq, part, found: !!t, out: btoa(s), paths: pkg.paths().length };
    }, { data: b64(src), f });
    check(`${f}: Format erkannt (${r.kind}, ${r.main})`, r.kind === f.split('.')[1] && !!r.main);
    check(`${f}: unverändert = Original Byte für Byte`, r.eq);
    const o = path.join(OUT, 'geaendert-' + f);
    fs.writeFileSync(o, Buffer.from(r.out, 'base64'));
    const c = py(o, src);
    check(`${f}: Änderung gefunden`, r.found);
    check(`${f}: nur der geänderte Teil ist anders (${c.vergleich.geaendert.join(', ')})`, c.vergleich.geaendert.length === 1 && c.vergleich.geaendert[0] === r.part && !c.vergleich.neu.length && !c.vergleich.nur_original.length && c.vergleich.reihenfolge_gleich, JSON.stringify(c.vergleich));
    check(`${f}: geändert – Python-Bibliothek öffnet`, c.bibliothek.ok, JSON.stringify(c.bibliothek));
    check(`${f}: geändert – LibreOffice öffnet (${c.libreoffice.seiten} Seiten)`, c.libreoffice.ok && c.libreoffice.seiten > 0, JSON.stringify(c.libreoffice));
    check(`${f}: ZIP gültig`, c.zip === 'ok', c.zip);
    const txt = execFileSync('pdftotext', [c.libreoffice.pdf, '-'], { encoding: 'utf8' });
    check(`${f}: geänderter Text erscheint im PDF`, /Geändert-/.test(txt), txt.slice(0, 120));
  }
  for (const k of ['docx', 'xlsx', 'pptx']) {
    const r = await run(async (k) => {
      const b = await Ooxml.blank(k); const pkg = await Ooxml.open(b);
      const ab = new Uint8Array(await b.arrayBuffer()); let s = ''; for (let i = 0; i < ab.length; i += 0x8000) s += String.fromCharCode.apply(null, ab.subarray(i, i + 0x8000));
      return { kind: pkg.kind, out: btoa(s) };
    }, k);
    const o = path.join(OUT, 'leer.' + k);
    fs.writeFileSync(o, Buffer.from(r.out, 'base64'));
    const c = py(o);
    check(`leeres ${k}: erkannt, Python öffnet, LibreOffice öffnet`, r.kind === k && c.bibliothek.ok && c.libreoffice.ok && c.zip === 'ok', JSON.stringify(c));
  }
  check('keine Fehler im Browser', !errs.length, errs.join(' | '));
  console.log(`${ok} von ${ok + bad} Prüfungen bestanden (OOXML-Kern) – Microsoft Office selbst: ungetestet`);
  await br.close();
  process.exitCode = bad ? 1 : 0;
})();
