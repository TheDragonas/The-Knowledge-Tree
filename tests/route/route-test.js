'use strict';
/* Verbindungs-Routing prüfen: node tests/route/route-test.js */
const { Route } = require('../../web/js/route.js');
let ok = 0, bad = 0;
const check = (name, cond) => { if (cond) ok++; else { bad++; console.log('FALSCH', name); } };
const A = { x: 0, y: 0, w: 100, h: 60 }, B = { x: 500, y: 0, w: 100, h: 60 }, O = { x: 230, y: -40, w: 120, h: 140 };
const p1 = { x: 100, y: 30 }, p2 = { x: 500, y: 30 };
const clear = (pts, obs) => !Route.polyBlocked(pts, obs.map(r => Route.grow(r, 2)));
for (const st of ['gerade', 'kurve', 'winkel']) {
  const t0 = Date.now();
  const r = Route.route(st, p1, { x: 1, y: 0 }, p2, { x: -1, y: 0 }, [O], [A, B]);
  check(st + ' gefunden', !!r);
  if (!r) continue;
  check(st + ' frei', clear(r, [O]));
  check(st + ' Anfang/Ende', r[0] === p1 && r[r.length - 1] === p2);
  if (st === 'winkel') check('winkel rechtwinklig', r.every((q, i) => !i || Math.abs(q.x - r[i - 1].x) < 0.01 || Math.abs(q.y - r[i - 1].y) < 0.01));
  console.log(st, (Date.now() - t0) + 'ms', r.map(q => `${Math.round(q.x)},${Math.round(q.y)}`).join(' '));
}
// frei: gerade Linie bleibt gerade
const free = Route.anyAngle(p1, p2, []);
check('frei = gerade', free.length === 2);
// viele Hindernisse: Laufzeit
const many = [];
for (let i = 0; i < 40; i++) many.push({ x: 120 + (i % 8) * 45, y: -200 + Math.floor(i / 8) * 90, w: 30, h: 60 });
for (const st of ['gerade', 'kurve', 'winkel']) {
  const t0 = Date.now();
  const r = Route.route(st, p1, { x: 1, y: 0 }, p2, { x: -1, y: 0 }, many, [A, B]);
  const ms = Date.now() - t0;
  check(st + ' viele: Weg', !!r);
  if (r) check(st + ' viele: frei', clear(r, many));
  check(st + ' viele: schnell (' + ms + 'ms)', ms < 150);
  console.log(st, 'viele', ms + 'ms', r && r.length);
}
// eigene Felder: Ansatz rechts an A, Ziel links unten → Weg darf nicht zurück durch A, Pfeil kommt von aussen (letztes Stück senkrecht)
{
  const A2 = { x: 560, y: 40, w: 160, h: 60 }, B2 = { x: 380, y: 190, w: 140, h: 60 };
  const q1 = { x: 720, y: 70 }, q2 = { x: 520, y: 220 };   // A rechts, B rechts
  for (const st of ['gerade', 'kurve', 'winkel']) {
    const r = Route.route(st, q1, { x: 1, y: 0 }, q2, { x: 1, y: 0 }, [], [A2, B2]);
    check(st + ' eigene Felder: Weg', !!r);
    if (!r) continue;
    check(st + ' nicht durch A/B', !Route.polyBlocked(r, [A2, B2]));
    const a = r[r.length - 2], b = r[r.length - 1];
    check(st + ' Pfeil von aussen', a.x > b.x && Math.abs(a.y - b.y) < 0.01);
    check(st + ' Abstand in der Mitte', !Route.polyBlocked(Route.trim(r, 22), [Route.grow(A2, 6), Route.grow(B2, 6)]));
  }
}
// gewohnte Form zu nah an einem Feld → shapeBad; mit Abstand → ok
{
  const O = { x: 200, y: 40, w: 100, h: 50 };
  check('zu nah', Route.shapeBad([{ x: 100, y: 95 }, { x: 400, y: 95 }], { x: 100, y: 95 }, { x: 400, y: 95 }, [O], []));
  check('genug Abstand', !Route.shapeBad([{ x: 100, y: 110 }, { x: 400, y: 110 }], { x: 100, y: 110 }, { x: 400, y: 110 }, [O], []));
  // zurück durchs eigene Feld
  const A = { x: 0, y: 0, w: 100, h: 60 };
  check('durchs eigene Feld', Route.shapeBad([{ x: 100, y: 30 }, { x: 50, y: 30 }, { x: 50, y: 200 }], { x: 100, y: 30 }, { x: 50, y: 200 }, [], [A, { x: 0, y: 200, w: 100, h: 50 }]));
}
// enge Lücke (18 px) zwischen den eigenen Feldern: Weg läuft in der Mitte der Lücke statt aussen herum
{
  const A1 = { x: 40, y: 40, w: 160, h: 60 }, B1 = { x: 160, y: 118, w: 160, h: 60 };
  const r = Route.route('winkel', { x: 120, y: 100 }, { x: 0, y: 1 }, { x: 240, y: 118 }, { x: 0, y: -1 }, [], [A1, B1]);
  const L = r ? r.reduce((s, q, i) => i ? s + Math.hypot(q.x - r[i - 1].x, q.y - r[i - 1].y) : 0, 0) : Infinity;
  check('enge Lücke: kurzer Weg (' + Math.round(L) + ')', L < 160);
}
console.log(`${ok} von ${ok + bad} Tests bestanden`);
process.exitCode = bad ? 1 : 0;
