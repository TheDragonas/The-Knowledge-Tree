'use strict';
/* KnowledgeTree-Datei (seit 1.24, web/js/ktfile.js): schreiben → lesen ergibt dieselben Seiten, Gruppen und Bilder;
 * das ZIP ist gültig (Python zipfile prüft jede Prüfsumme) und hat die Form des Saves-Ordners; Namen wie store.go;
 * alte JSON-Sicherungen und ZIPs ohne Beschreibung (EXE-Backups bis 1.23) werden weiter gelesen.
 * Aufruf: node tests/backup/ktfile-test.js   (braucht Python 3 für die ZIP-Prüfung, sonst übersprungen) */
global.document = { createElement: () => ({ content: {}, innerHTML: '' }) };
const fs = require('fs'), os = require('os'), path = require('path'), { execFileSync } = require('child_process');
const U = require('../../web/js/util.js');
global.readJsonStream = U.readJsonStream;
global.uid = (p = '') => p + Math.random().toString(36).slice(2, 10);
global.clamp = (v, a, b) => Math.max(a, Math.min(b, v));
global.blobToDataURL = async (b) => `data:${b.type || 'application/octet-stream'};base64,` + Buffer.from(await b.arrayBuffer()).toString('base64');
const FP = require('../../web/js/filepages.js');
global.openZip = FP.openZip;
const { KtFile } = require('../../web/js/ktfile.js');

let ok = 0, fail = 0;
const check = (label, cond, info = '') => { if (cond) ok++; else { fail++; console.log('  FEHLER:', label, info); } };
const A = 'a'.repeat(40) + '.png', B = 'b'.repeat(40) + '.pdf', C = 'c'.repeat(40) + '.svg';
const imgA = new Uint8Array(200000).map((_, i) => (i * 7919) & 255);
const assets = { [A]: new Blob([imgA], { type: 'image/png' }), [B]: new Blob(['%PDF-1.4 test'], { type: 'application/pdf' }), [C]: new Blob(['<svg xmlns="http://www.w3.org/2000/svg">' + '<g/>'.repeat(500) + '</svg>'], { type: 'image/svg+xml' }) };
const stored = {};
global.Export = { assetBlob: async (n) => assets[n] || null };
global.Backend = {
  kind: 'browser',
  hasAssets: async (names) => new Set(names.filter(n => stored[n])),
  putAsset: async (n, b) => { stored[n] = new Uint8Array(await b.arrayBuffer()); return n; },
};
global.serPage = (p) => JSON.stringify(p);
const page = (id, title, extra = {}) => ({ typ: 'KnowledgeTree-Seite', version: 1, id, title, created: 1, modified: 2, level: 0, bg: 'punkte', color: null, boxes: [], pkgs: [], links: [], drawings: [], ...extra });
global.Store = {
  info: { version: 'test' },
  pages: {
    p1: page('p1', 'Erste: Seite?', { boxes: [{ id: 'b1', html: `<img data-kt-img="${A}"> Text äöü “–” 😀`, images: [{ id: 'i1', src: A, x: 1, y: 2, w: 3, h: 4 }] }] }),
    p2: page('p2', 'Erste: Seite?', { boxes: [{ id: 'b2', html: `<span class="kt-file" data-name="${B}">x</span>`, images: [] }], drawings: [{ id: 'd1', type: 'ink', pts: Array.from({ length: 3000 }, (_, i) => i % 97) }] }),
    p3: page('p3', 'CON', { level: 1 }),
    p4: page('p4', '_geheim.', { boxes: [{ id: 'b4', html: C, images: [] }] }),
    p5: page('p5', 'Fehlt', { boxes: [{ id: 'b5', html: 'd'.repeat(40) + '.jpg', images: [] }] }),
  },
};
const groups = [
  { id: 'gq', name: 'Schnellnotizen', color: '#7a7574', kind: 'quick', groups: [], pages: ['p5'] },
  { id: 'g1', name: 'Mathe / Physik', color: '#d13438', kind: 'notebook', closed: true, pages: [], groups: [
    { id: 'g2', name: 'Algebra', color: '#0078d4', kind: 'section', groups: [], pages: ['p1', 'p2', 'p3'] },
    { id: 'g3', name: 'algebra', color: '', kind: 'section', groups: [], pages: ['p4'] },
  ] },
];

(async () => {
  // Namen wie store.go
  check('safeName ersetzt Zeichen', KtFile.safeName('a/b:c*?') === 'a_b_c__');
  check('safeName reservierte Namen', KtFile.safeName('CON') === 'CON-' && KtFile.safeName('com1.txt') === 'com1.txt-');
  check('safeName führender Unterstrich/Punkt', KtFile.safeName('_x') === '-x' && KtFile.safeName('.y') === '-y');
  check('safeName leer/Punkte', KtFile.safeName(' ... ') === 'Unbenannt' && KtFile.safeName('Ende. ') === 'Ende');
  check('safeName 80 Zeichen', [...KtFile.safeName('ü'.repeat(100))].length === 80);
  const used = new Set();
  check('uniqueName', KtFile.uniqueName('A', '.s', used) === 'A.s' && KtFile.uniqueName('a', '.s', used) === 'a (2).s');

  // schreiben
  const r = await KtFile.write({ groups, art: 'backup', name: 'Test' });
  check('Zählung', r.pages === 5 && r.images === 3 && r.missing === 1, JSON.stringify({ p: r.pages, i: r.images, m: r.missing }));
  const buf = Buffer.from(await r.blob.arrayBuffer());
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kt-ktfile-'));
  const zipPath = path.join(tmp, 'test.zip');
  fs.writeFileSync(zipPath, buf);
  let py = null;
  try {
    py = JSON.parse(execFileSync('python3', ['-c', `
import zipfile, json, sys
z = zipfile.ZipFile(sys.argv[1])
bad = z.testzip()
print(json.dumps({'bad': bad, 'names': z.namelist(), 'methods': {i.filename: i.compress_type for i in z.infolist()}, 'utf8': all(i.flag_bits & 0x800 for i in z.infolist())}))
`, zipPath]).toString());
  } catch (e) { console.log('  (Python-Prüfung übersprungen:', e.message.split('\n')[0], ')'); }
  if (py) {
    check('ZIP gültig (alle Prüfsummen)', py.bad === null, py.bad);
    check('UTF-8-Namen gekennzeichnet', py.utf8);
    const n = new Set(py.names);
    for (const want of ['KnowledgeTree.json', 'Saves/_struktur.json', 'Saves/Schnellnotizen/_gruppe.json', 'Saves/Mathe _ Physik/_gruppe.json',
      'Saves/Mathe _ Physik/Algebra/Erste_ Seite_.seite.json', 'Saves/Mathe _ Physik/Algebra/Erste_ Seite_ (2).seite.json', 'Saves/Mathe _ Physik/Algebra/CON-.seite.json',
      'Saves/Mathe _ Physik/algebra (2)/-geheim.seite.json', `Saves/_Bilder/${A}`, `Saves/_Bilder/${B}`, `Saves/_Bilder/${C}`]) check('Eintrag ' + want, n.has(want), [...n].join(' | '));
    check('PNG/PDF unverändert (Store), SVG/Seiten gepackt', py.methods[`Saves/_Bilder/${A}`] === 0 && py.methods[`Saves/_Bilder/${B}`] === 0 && py.methods[`Saves/_Bilder/${C}`] === 8 && py.methods['Saves/Mathe _ Physik/Algebra/Erste_ Seite_ (2).seite.json'] === 8, JSON.stringify(py.methods));
  }

  // lesen (als File, wie aus dem Dateidialog)
  const file = new File([buf], 'KnowledgeTree-Backup_2026-11-02_10-00.zip');
  const d = await KtFile.read(file);
  check('Format/Art', d.format === 'zip' && d.art === 'backup' && d.name === 'Test');
  check('alle Seiten', Object.keys(d.seiten).sort().join() === 'p1,p2,p3,p4,p5');
  check('Seiten byte-genau', ['p1', 'p2', 'p3', 'p4', 'p5'].every(id => JSON.stringify(d.seiten[id]) === JSON.stringify(Store.pages[id])));
  const strip = (l) => l.map(g => ({ id: g.id, name: g.name, color: g.color || '', kind: g.kind, closed: !!g.closed, pages: g.pages, groups: strip(g.groups) }));
  check('Baum gleich (Reihenfolge, Namen, Farben, Art, geschlossen)', JSON.stringify(strip(d.gruppen)) === JSON.stringify(strip(groups)), JSON.stringify(strip(d.gruppen)));
  check('Bilder gelistet, fehlendes erkannt', d.bilder.map(b => b.name).sort().join() === [A, B, C].sort().join() && d.fehlend.join() === 'd'.repeat(40) + '.jpg');
  const st = await KtFile.storeAssets(d, null);
  check('Bilder gespeichert', st.stored === 3 && stored[A] && Buffer.compare(Buffer.from(stored[A]), Buffer.from(imgA)) === 0 && new TextDecoder().decode(stored[B]) === '%PDF-1.4 test');
  const st2 = await KtFile.storeAssets(await KtFile.read(file), null);
  check('vorhandene Bilder übersprungen', st2.stored === 0 && st2.existing === 3);

  // EXE-Backup bis 1.23: ZIP ohne Beschreibung und ohne Bilder, Seiten eingerückt, Gruppen ohne _struktur.json-Reihenfolge
  const zw = KtFile.zipWriter();
  await zw.add('Saves/_struktur.json', JSON.stringify({ typ: 'KnowledgeTree-Saves', version: 1, reihenfolgeGruppen: ['gB', 'gA'] }));
  await zw.add('Saves/A/_gruppe.json', JSON.stringify({ typ: 'KnowledgeTree-Gruppe', id: 'gA', name: 'A', farbe: '', art: 'notebook', reihenfolgeGruppen: [], reihenfolgeSeiten: ['y', 'x'] }));
  await zw.add('Saves/A/x.seite.json', JSON.stringify(page('x', 'X'), null, 2), { pack: true });
  await zw.add('Saves/A/y.seite.json', JSON.stringify(page('y', 'Y', { boxes: [{ id: 'q', html: A, images: [] }] }), null, 2), { pack: true });
  await zw.add('Saves/B/_gruppe.json', JSON.stringify({ typ: 'KnowledgeTree-Gruppe', id: 'gB', name: 'B', farbe: '#fff', art: 'notebook', reihenfolgeGruppen: [], reihenfolgeSeiten: [] }));
  await zw.add('Saves/B/ohne-id.seite.json', JSON.stringify({ boxes: [] }));
  await zw.add('Saves/lose.seite.json', JSON.stringify(page('x', 'doppelt')));
  const old = await KtFile.read(new File([zw.finish()], 'Saves_2026-10-01_08-30-00.zip'));
  check('altes EXE-Backup: Reihenfolge Gruppen', old.gruppen.map(g => g.name).join() === 'B,A,Unsortiert', old.gruppen.map(g => g.name).join());
  check('altes EXE-Backup: Reihenfolge Seiten', old.gruppen[1].pages.join() === 'y,x');
  check('altes EXE-Backup: Seite ohne ID/Titel', old.gruppen[0].pages.length === 1 && old.seiten[old.gruppen[0].pages[0]].title === 'ohne-id');
  check('altes EXE-Backup: doppelte ID neu vergeben', old.gruppen[2].pages.length === 1 && old.gruppen[2].pages[0] !== 'x');
  check('altes EXE-Backup: ohne Bilder erkannt, Datum aus dem Namen', old.ohneBilder && new Date(old.erstellt).getHours() === 8 && old.quelle === 'exe');

  // gezippter Notizbuch-Ordner ohne Saves/_struktur.json
  const z2 = KtFile.zipWriter();
  await z2.add('Mathe/_gruppe.json', JSON.stringify({ id: 'gm', name: 'Mathe', art: 'notebook', reihenfolgeGruppen: [], reihenfolgeSeiten: [] }));
  await z2.add('Mathe/Analysis/_gruppe.json', JSON.stringify({ id: 'gn', name: 'Analysis', art: 'section', reihenfolgeGruppen: [], reihenfolgeSeiten: [] }));
  await z2.add('Mathe/Analysis/s.seite.json', JSON.stringify(page('s1', 'S')));
  const nbz = await KtFile.read(new File([z2.finish()], 'Mathe.zip'));
  check('Notizbuch-Ordner als ZIP', nbz.gruppen.length === 1 && nbz.gruppen[0].name === 'Mathe' && nbz.gruppen[0].groups[0].pages.join() === 's1');

  // keine KT-Daten
  const z3 = KtFile.zipWriter(); await z3.add('foto.jpg', 'x');
  let err = null; try { await KtFile.read(new File([z3.finish()], 'fotos.zip')); } catch (e) { err = e; }
  check('fremdes ZIP → Fehler', !!err && /KnowledgeTree/.test(err.message));

  // JSON-Sicherung bis 1.23
  const j = JSON.stringify({ typ: 'KnowledgeTree-Backup', version: 2, erstellt: '2026-10-20T12:00:00Z', name: 'Alt', gruppen: groups, seiten: Store.pages, bilder: { [A]: 'data:image/png;base64,' + Buffer.from(imgA).toString('base64') } });
  for (const k of Object.keys(stored)) delete stored[k];
  const dj = await KtFile.read(new File([j], 'Alt.knowledgetree.json'));
  check('JSON bis 1.23: Seiten und Bild', dj.format === 'json' && Object.keys(dj.seiten).length === 5 && stored[A] && stored[A].length === imgA.length);

  // ZIP64-Kennzeichen erzwingen: viele Einträge (über 65535) sprengen die normale Zählung
  const z4 = KtFile.zipWriter();
  for (let i = 0; i < 65540; i++) await z4.add(`Saves/G/_${i}.txt`, '');
  await z4.add('Saves/G/s.seite.json', JSON.stringify(page('z', 'Z')));
  const zb = z4.finish();
  const e4 = await openZip(zb);
  check('ZIP64 (über 65535 Einträge) lesbar', e4.length === 65541 && e4[65540].name === 'Saves/G/s.seite.json');

  // ---- 1.25: leere Bilder brechen nichts ab („kein Bild“ im Programm)
  const E = 'e'.repeat(40) + '.png';
  assets[E] = new Blob([], { type: 'image/png' });
  Store.pages.p6 = page('p6', 'Leeres Bild', { boxes: [{ id: 'b6', html: E, images: [] }] });
  groups[1].groups[0].pages.push('p6');
  const r2 = await KtFile.write({ groups, art: 'backup', name: 'Test' });
  const e2 = await openZip(r2.blob);
  check('leeres Bild wird nicht geschrieben (zählt als fehlend)', !e2.some(e => e.name.endsWith(E)) && r2.missing === 2);
  const zx = KtFile.zipWriter();   // fremde Datei mit leerem Bild-Eintrag
  await zx.add('Saves/_struktur.json', '{}'); await zx.add('Saves/G/_gruppe.json', JSON.stringify({ id: 'gx', name: 'G', art: 'section' }));
  await zx.add('Saves/G/s.seite.json', JSON.stringify(page('sx', 'S', { boxes: [{ id: 'q', html: E + ' ' + A, images: [] }] })));
  await zx.add('Saves/_Bilder/' + E, new Uint8Array(0)); await zx.add('Saves/_Bilder/' + A, imgA);
  for (const k of Object.keys(stored)) delete stored[k];
  const dx = await KtFile.read(new File([zx.finish()], 'x.zip'));
  let thrown = null, sx = null;
  const realPut = Backend.putAsset;
  Backend.putAsset = async (n, b) => { if (!b.size) throw new Error('kein Bild'); return realPut(n, b); };
  try { sx = await KtFile.storeAssets(dx, null); } catch (e) { thrown = e; }
  Backend.putAsset = realPut;
  check('leeres Bild beim Laden: weiter statt Abbruch', !thrown && sx.stored === 1 && sx.failed === 1 && dx.fehlend.includes(E), thrown ? thrown.message : JSON.stringify(sx));

  // ---- 1.25: .json wie bis 1.23
  const rj = await KtFile.writeJson({ groups, name: 'JSON' });
  for (const k of Object.keys(stored)) delete stored[k];
  const dj2 = await KtFile.read(new File([rj.blob], 'J.knowledgetree.json'));
  check('JSON-Export: wieder lesbar, Bilder gespeichert', dj2.format === 'json' && Object.keys(dj2.seiten).length === 6 && !!stored[A] && !stored[E] && rj.missing === 2);

  // ---- 1.25: interaktive Datei (Vorlage vom „Server“, wie im Programm)
  const TPL = '<!doctype html><html lang="de"><head><meta charset="utf-8">' + '<!-' + '-kt-datei-->' + '<title>KnowledgeTree</title></head><body><p>App</p></body></html>';
  const oldKind = Backend.kind; Backend.kind = 'server';
  global.fetch = async (u) => ({ ok: u === 'kt-app.html', text: async () => TPL });
  const rh = await KtFile.writeHtml({ groups, name: 'Prüfung "A&B" <x>' });
  Backend.kind = oldKind;
  const htmlText = await rh.blob.text();
  check('interaktiv: Daten im Kopf, Titel, App dahinter', /<meta charset="utf-8"><script type="application\/x-knowledgetree" id="kt-datei" data-bytes="\d+" data-enc="b122" data-groesse="\d+" data-name="Prüfung &quot;A&amp;B&quot; &lt;x&gt;"/.test(htmlText) && htmlText.includes('<title>Prüfung &quot;A&amp;B&quot; &lt;x&gt; – KnowledgeTree</title>') && htmlText.endsWith('<p>App</p></body></html>'));
  const dh = await KtFile.read(new File([rh.blob], 'P.knowledgetree.html'));
  check('interaktiv: wieder lesbar (Seiten byte-genau, Name)', dh.format === 'html' && dh.name === 'Prüfung "A&B" <x>' && ['p1', 'p2', 'p6'].every(id => JSON.stringify(dh.seiten[id]) === JSON.stringify(Store.pages[id])));
  const blk = htmlText.slice(htmlText.indexOf('">', htmlText.indexOf('id="kt-datei"')) + 2, htmlText.indexOf('</script>'));
  const z2b = KtFile.b122Decode(blk, rh.zip.size);
  check('interaktiv: Datenblock (Base-122) = die ZIP-Datei', Buffer.compare(Buffer.from(z2b), Buffer.from(await rh.zip.arrayBuffer())) === 0);
  check('interaktiv: kleiner als mit Base64', rh.blob.size < TPL.length + rh.zip.size * 1.2, [rh.blob.size, rh.zip.size]);
  // Datei aus 1.25 (Base64) bleibt lesbar
  const b64old = Buffer.from(await rh.zip.arrayBuffer()).toString('base64');
  const old125 = TPL.replace('<!-' + '-kt-datei-->', `<script type="application/x-knowledgetree" id="kt-datei" data-bytes="${b64old.length}" data-name="Alt">${b64old}</script>`);
  const dOld = await KtFile.read(new File([old125], 'Alt.knowledgetree.html'));
  check('interaktive Datei aus 1.25 (Base64) lesbar', Object.keys(dOld.seiten).length === Object.keys(dh.seiten).length, [dOld.name, Object.keys(dOld.seiten).length]);
  let werr = null; try { await KtFile.read(new File(['<!doctype html><html><head><meta name="generator" content="KnowledgeTree"></head></html>'], 'w.html')); } catch (e) { werr = e; }
  check('Webseite zum Ansehen → verständlicher Hinweis', !!werr && /Interaktiv/.test(werr.message));

  // ---- 1.25: Sicherung wie bei OneNote (Ordner je Notizbuch, Datei je Abschnitt)
  delete assets[E];
  Store.pages.p4.boxes[0].html += ' ' + A;   // A in zwei Abschnitten → einmal in _Bilder/
  const rf = await KtFile.writeFolder({ groups, name: 'KnowledgeTree' });
  const paths = rf.files.map(f => f.path).sort();
  check('Backup-Ordner: Aufbau', JSON.stringify(paths) === JSON.stringify(['KnowledgeTree.json', 'Mathe _ Physik/_gruppe.json', 'Mathe _ Physik/Algebra.knowledgetree.zip', 'Mathe _ Physik/algebra (2).knowledgetree.zip', 'Schnellnotizen.knowledgetree.zip', '_Bilder/' + A].sort()), paths.join(' | '));
  const algebra = await openZip(rf.files.find(f => f.path.endsWith('/Algebra.knowledgetree.zip')).blob);
  check('geteiltes Bild nicht doppelt', !algebra.some(e => e.name.endsWith(A)) && algebra.some(e => e.name.endsWith(B)));
  check('Backup-Ordner: Zählung', rf.sections === 3 && rf.pages === 6 && rf.images === 3);
  const entries = rf.files.map(f => ({ name: 'KnowledgeTree-Backup_X/' + f.path, size: f.blob.size, blob: async () => f.blob, read: async () => new Uint8Array(await f.blob.arrayBuffer()) }));
  const df = await KtFile.read({ name: 'KnowledgeTree-Backup_X', entries });
  check('Backup-Ordner: Baum gleich', JSON.stringify(strip(df.gruppen)) === JSON.stringify(strip(groups)), JSON.stringify(strip(df.gruppen)));
  check('Backup-Ordner: Seiten byte-genau', Object.keys(df.seiten).length === 6 && Object.keys(Store.pages).every(id => JSON.stringify(df.seiten[id]) === JSON.stringify(Store.pages[id])));
  check('Backup-Ordner: Bilder', df.format === 'ordner' && df.bilder.map(b => b.name).sort().join() === [A, B, C].sort().join());
  const zf = await KtFile.zipFiles(rf.files);
  const dz = await KtFile.read(new File([zf], 'KnowledgeTree-Backup_X.zip'));
  check('Backup-Ordner als ZIP: gleich', JSON.stringify(strip(dz.gruppen)) === JSON.stringify(strip(groups)) && Object.keys(dz.seiten).length === 6);
  const secFile = rf.files.find(f => f.path.endsWith('Algebra.knowledgetree.zip'));
  const pm = await KtFile.peekMeta(new File([secFile.blob], 'Algebra.knowledgetree.zip'));
  check('Abschnitt-Datei erkennbar', pm && pm.art === 'abschnitt' && pm.name === 'Algebra' && pm.seiten === 4);
  // Ordner nur mit Abschnitt-Dateien (ohne KnowledgeTree.json): oberster Ordner = Notizbuch
  const loose = rf.files.filter(f => f.path.startsWith('Mathe')).map(f => ({ name: 'Mein Ordner/' + f.path.replace('Mathe _ Physik/', ''), size: f.blob.size, blob: async () => f.blob, read: async () => new Uint8Array(await f.blob.arrayBuffer()) }));
  const dl = await KtFile.read({ name: 'Mein Ordner', entries: loose });
  check('loser Ordner mit Abschnitten → Notizbuch', dl.gruppen.length === 1 && dl.gruppen[0].name === 'Mathe / Physik' && dl.gruppen[0].groups.length === 2, JSON.stringify(strip(dl.gruppen)));

  // Base-122 (1.26, interaktive Datei): verlustfrei für alle Bytes und Grössen, gültiges UTF-8, nie \0 \n \r " & \ <
  {
    let seed = 3; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const sizes = [0, 1, 2, 6, 7, 8, 13, 14, 15, 63, 64, 100, 1000, 4097, (3 << 20) + 5];
    let all = true, utf = true, clean = true, viaText = true, ratio = 0;
    for (const n of sizes) {
      for (const kind of ['zufall', 'verboten', 'null']) {
        const u = new Uint8Array(n);
        for (let i = 0; i < n; i++) u[i] = kind === 'zufall' ? (rnd() * 256) | 0 : kind === 'verboten' ? [0, 10, 13, 34, 38, 92, 60, 255, 1][i % 9] : 0;
        const enc = await KtFile.b122Parts(new Blob([u]));
        const bytes = Buffer.concat(enc.parts.map(p => Buffer.from(p)));
        if (bytes.length !== enc.bytes) all = false;
        for (const b of bytes) if (b === 0 || b === 10 || b === 13 || b === 34 || b === 38 || b === 92 || b === 60) { clean = false; break; }
        let text = null;
        try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch (e) { utf = false; }
        const back = KtFile.b122Decode(new Uint8Array(bytes), n);
        if (Buffer.compare(Buffer.from(back), Buffer.from(u)) !== 0) { all = false; console.log('  Base-122 Bytes', kind, n); }
        if (text != null) { const b2 = KtFile.b122Decode(text, n); if (Buffer.compare(Buffer.from(b2), Buffer.from(u)) !== 0) { viaText = false; console.log('  Base-122 Text', kind, n); } }
        if (kind === 'zufall' && n > 1e6) ratio = bytes.length / n;
      }
    }
    check('Base-122 verlustfrei (alle Grössen, auch über 3-MB-Stücke)', all);
    check('Base-122 gültiges UTF-8', utf);
    check('Base-122 ohne Zeichen, die im HTML stören', clean);
    check('Base-122 aus dem Text der Seite lesbar', viaText);
    check('Base-122 Aufschlag ~14 % (Base64: 33 %)', ratio > 1.13 && ratio < 1.16, ratio);
    let err = null; try { KtFile.b122Decode(new Uint8Array([65, 66]), 10); } catch (e) { err = e; }
    check('Base-122 unvollständig → Fehler', err && /unvollständig/.test(err.message));
  }

  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(`${ok} von ${ok + fail} Prüfungen bestanden (KnowledgeTree-Datei schreiben/lesen)`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
