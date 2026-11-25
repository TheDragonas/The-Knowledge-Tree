'use strict';
/* KnowledgeTree-Sicherung als Strom lesen (seit 1.18, readJsonStream in util.js): das oberste Objekt Schlüssel für
 * Schlüssel, "bilder" Eintrag für Eintrag und jedes Bild stückweise aus Base64 – auch wenn die Stückgrenzen mitten
 * in Zeichenketten, Escape-Folgen oder im Base64 liegen.  Aufruf: node tests/backup/json-stream-test.js */
global.document = { createElement: () => ({ content: {}, innerHTML: '' }) };
const U = require('../../web/js/util.js');
let ok = 0, fail = 0;
const check = (label, cond, info = '') => { if (cond) ok++; else { fail++; console.log('  FEHLER:', label, info); } };
(async () => {
  const img = new Uint8Array(3000001).map((_, i) => (i * 7919) & 255);
  const obj = {
    typ: 'KnowledgeTree-Backup', version: 2, erstellt: '2026-10-20T12:00:00Z', name: 'Prüfung "Zitat" \\ ü 😀',
    gruppen: [{ id: 'g1', name: 'A{b}[c],:', pages: ['p1', 'p2'] }],
    seiten: { p1: { title: 'Ti\\tel "x"  ', boxes: [{ html: '<div>{}[],:"</div>', images: [{ src: 'a'.repeat(40) + '.png' }] }], n: -1.5e3, t: true, z: null }, p2: { title: '', boxes: [] } },
    bilder: { ['a'.repeat(40) + '.png']: 'data:image/png;base64,' + Buffer.from(img).toString('base64'), ['b'.repeat(40) + '.jpg']: 'data:image/jpeg;base64,' + Buffer.from([1, 2, 3]).toString('base64'), ['c'.repeat(40) + '.svg']: 'data:image/svg+xml;base64,' + Buffer.from('<svg/>').toString('base64') },
    nachher: [1, { x: 'y' }],
  };
  const text = JSON.stringify(obj);
  for (const step of [1 << 16, 777, 13]) {
    const parts = []; for (let i = 0; i < text.length; i += step) parts.push(text.slice(i, i + step));
    const got = {};
    const data = await U.readJsonStream(new Blob(parts), { bilder: async (n, t, b) => { got[n] = { t, b: new Uint8Array(await b.arrayBuffer()) }; } });
    const exp = JSON.parse(text); exp.bilder = {};
    check(`Stücke à ${step}: Objekt ohne Bilder gleich`, JSON.stringify(data) === JSON.stringify(exp));
    const a = got['a'.repeat(40) + '.png'];
    check(`Stücke à ${step}: grosses Bild byte-genau`, a && a.t === 'image/png' && a.b.length === img.length && Buffer.compare(Buffer.from(a.b), Buffer.from(img)) === 0);
    check(`Stücke à ${step}: kleine Bilder`, got['b'.repeat(40) + '.jpg'] && [...got['b'.repeat(40) + '.jpg'].b].join() === '1,2,3' && new TextDecoder().decode(got['c'.repeat(40) + '.svg'].b) === '<svg/>');
  }
  // keine Sicherung
  let err = null; try { await U.readJsonStream(new Blob(['[1,2]'])); } catch (e) { err = e; }
  check('kein Objekt → Fehler', !!err);
  console.log(`${ok} von ${ok + fail} Prüfungen bestanden (Sicherung als Strom lesen)`);
  process.exit(fail ? 1 : 0);
})();
