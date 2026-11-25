'use strict';
/* Fotomath (seit 1.9): handgeschriebene Rechnungen erkennen, schön darstellen und ausrechnen – ohne Internet.
 * MathInk = Erkennung (ohne DOM, in Node testbar):
 *  1. Striche → Zeichen: Striche, die nacheinander geschrieben wurden und sich überlappen, bilden ein Zeichen;
 *     Sonderfälle =, ÷, :, Wurzelzeichen und lange Bruchstriche.
 *  2. Zeichen erkennen: Regeln für Punkte und Linien, sonst Punktwolken-Vergleich ($P-Erkenner, Vatavu/Anthony/Wobbrock 2012)
 *     mit eingebauten Vorlagen (mehrere Schreibweisen je Ziffer, z.B. 1 mit Aufstrich, offene 4, 7 mit Querstrich).
 *  3. Aufbau in 2D: Bruchstriche (Zähler/Nenner), Wurzeln, Hochzahlen, Dezimalpunkt vs. Malpunkt (Höhe), × vs. x.
 *  4. Ergebnis als Vorlagenbaum des Taschenrechners (Bruch, Wurzel, Hochzahl …) – darstellbar, rechenbar, als LaTeX.
 * Jedes Zeichen behält seine Alternativen, damit man Fehlerkennungen mit einem Klick korrigieren kann. */
const MathInk = (() => {
  /* ---------------------------------------------------------- Vorlagen (x 0..1, y 0..1, y nach unten) */
  const arc = (cx, cy, rx, ry, a0, a1, n = 18) => { const o = []; for (let i = 0; i <= n; i++) { const a = (a0 + (a1 - a0) * i / n) * Math.PI / 180; o.push([cx + rx * Math.cos(a), cy + ry * Math.sin(a)]); } return o; };
  const cat = (...parts) => parts.flat();
  const RAW = {
    '0': [[arc(.3, .5, .28, .5, -90, 270)], [arc(.3, .5, .28, .5, -90, -450)], [arc(.3, .5, .3, .5, -60, 280)], [arc(.32, .5, .3, .48, -100, -440)]],
    '1': [[[[.3, 0], [.3, 1]]], [[[.06, .3], [.32, 0], [.32, 1]]], [[[0, .5], [.36, 0], [.36, 1]]], [[[.1, .25], [.3, 0], [.3, 1]], [[.08, 1], [.52, 1]]], [[[.12, .35], [.34, 0]], [[.34, 0], [.34, 1]]]],
    '2': [[cat(arc(.3, .28, .27, .27, -170, 30), [[.02, 1], [.62, 1]])], [cat(arc(.3, .3, .28, .3, -160, 10), [[.05, .95], [0, 1], [.6, .98]])], [cat(arc(.3, .3, .28, .3, -175, 20), [[.0, 1]], arc(.12, .93, .5, .1, 180, 360, 6))]],
    '3': [[cat(arc(.28, .26, .26, .24, -160, 90), arc(.28, .74, .28, .26, -90, 160))], [cat([[0, .02], [.55, .02], [.2, .42]], arc(.28, .7, .28, .28, -80, 160))], [cat(arc(.3, .26, .24, .24, -150, 80), arc(.3, .74, .3, .26, -100, 150))]],
    '4': [[[[.45, 0], [0, .68], [.65, .68]], [[.48, .3], [.48, 1]]], [[[.05, 0], [0, .6], [.62, .6]], [[.48, 0], [.48, 1]]], [[[.48, 1], [.48, 0], [0, .68], [.65, .68]]], [[[.05, 0], [0, .6], [.62, .6]], [[.5, .05], [.5, 1]]], [[[.05, 0], [0, .62]], [[0, .62], [.65, .6]], [[.48, .1], [.48, 1]]]],
    '5': [[cat([[.08, 0], [.04, .45]], arc(.28, .68, .28, .3, -140, 150)), [[.08, 0], [.6, 0]]], [cat([[.6, 0], [.08, 0], [.04, .45]], arc(.28, .68, .28, .3, -140, 150))], [cat([[.08, .02], [.05, .42]], arc(.25, .7, .3, .28, -130, 160)), [[.1, .02], [.62, .0]]]],
    '6': [[cat(arc(.34, .5, .32, .5, -80, -270), arc(.32, .72, .28, .27, 90, -200))], [cat([[.55, 0]], arc(.3, .68, .3, .32, -120, -450))], [cat(arc(.36, .52, .34, .48, -70, -270), arc(.3, .74, .28, .25, 90, -170))]],
    '7': [[[[0, 0], [.62, 0], [.22, 1]]], [[[0, 0], [.62, 0], [.22, 1]], [[.12, .5], [.56, .5]]], [[[0, .15], [0, 0], [.62, 0], [.25, 1]]], [[[0, .02], [.62, 0]], [[.62, 0], [.24, 1]]]],
    '8': [[cat(arc(.3, .25, .22, .24, -20, -270), arc(.3, .74, .28, .25, -90, 270), arc(.3, .25, .22, .24, 90, 340))], [arc(.3, .25, .22, .24, -90, 270), arc(.3, .74, .28, .25, -90, 270)], [cat(arc(.3, .25, .22, .24, -160, 90), arc(.3, .74, .28, .25, -90, -450), arc(.3, .25, .22, .24, 90, 200))]],
    '9': [[cat(arc(.3, .27, .27, .27, 0, -360), [[.57, .27], [.5, 1]])], [cat(arc(.3, .27, .27, .27, 0, -360), [[.57, .27], [.56, .8]], arc(.36, .8, .2, .18, 0, 150))], [arc(.3, .27, .27, .27, 0, -360), [[.57, .15], [.55, 1]]], [cat(arc(.3, .28, .27, .27, -10, -370), [[.56, .3], [.3, 1]])]],
    '+': [[[[0, .5], [1, .5]], [[.5, 0], [.5, 1]]], [[[.5, 0], [.5, 1]], [[0, .5], [1, .5]]]],
    'x': [[[[0, 0], [1, 1]], [[1, 0], [0, 1]]], [arc(0, .5, .5, .55, -60, 60), arc(1, .5, .5, .55, 240, 120)], [[[0, 0], [1, 1]], [[0, 1], [1, 0]]]],
    '(': [[arc(.9, .5, .85, .55, -125, -235)], [arc(1.2, .5, 1.1, .52, -150, -210)]],
    ')': [[arc(-.5, .5, .85, .55, -55, 55)], [arc(-.8, .5, 1.1, .52, -30, 30)]],
    'π': [[[[0, .12], [1, .08]], [[.3, .1], [.25, 1]], [[.7, .1], [.75, 1]]], [[[.3, 1], [.32, .1]], [[0, .15], [1, .1]], [[.7, .1], [.78, 1]]], [cat([[.3, 1], [.3, .1]], [[.85, .08]], [[.75, 1]])]],
    'y': [[[[0, 0], [.5, .55]], [[1, 0], [.2, 1.4]]], [cat([[0, 0], [.1, .5], [.5, .55], [.9, 0]]), [[.9, 0], [.85, 1.2], [.4, 1.4]]], [cat([[0, 0], [.08, .45], [.45, .5], [.85, 0], [.82, 1.25], [.35, 1.4], [.1, 1.2]])]],
  };
  /* echte Handschrift-Beispiele (Ziffern aus handschriftlichen Notizen: 1 mit langem Aufstrich, 6 mit hohem Bogen, offene 4, 7 mit Querstrich …) */
  const HAND = {"0":[[[[0.78,0.81],[0.64,0.94],[0.47,1],[0.28,1],[0.12,0.91],[0,0.76],[0,0.58],[0.07,0.41],[0.18,0.25],[0.31,0.12],[0.48,0.04],[0.66,0],[0.84,0.03],[0.94,0.18],[0.95,0.37],[0.92,0.55],[0.87,0.73],[0.76,0.88]]],[[[0.5,0.84],[0.37,0.93],[0.23,0.99],[0.09,0.97],[0,0.85],[0.01,0.69],[0.04,0.54],[0.09,0.39],[0.17,0.26],[0.27,0.14],[0.39,0.05],[0.54,0],[0.65,0.09],[0.7,0.23],[0.7,0.39],[0.69,0.54],[0.65,0.69],[0.58,0.83]]],[[[0.38,0.92],[0.25,1],[0.11,0.97],[0.01,0.86],[0.01,0.71],[0.05,0.57],[0.14,0.45],[0.25,0.34],[0.34,0.22],[0.4,0.09],[0.53,0.01],[0.64,0.05],[0.67,0.2],[0.73,0.33],[0.72,0.48],[0.68,0.63],[0.62,0.77],[0.53,0.89]]]],"1":[[[[0,0.5],[0.18,0.38],[0.36,0.25],[0.55,0.15],[0.74,0.02],[0.77,0.18],[0.73,0.4],[0.66,0.61],[0.57,0.81],[0.46,1]]],[[[0.01,0.79],[0.1,0.77],[0.24,0.71],[0.37,0.64],[0.5,0.57],[0.61,0.47],[0.71,0.36],[0.82,0.25],[0.93,0.15],[1.05,0.06],[1.18,0],[1.22,0.11],[1.18,0.26],[1.15,0.41],[1.13,0.55],[1.12,0.7],[1.1,0.85],[1.08,1]]],[[[0,0.67],[0.11,0.63],[0.23,0.56],[0.35,0.49],[0.48,0.44],[0.61,0.4],[0.73,0.33],[0.85,0.25],[0.93,0.15],[0.98,0.02],[1,0.06],[0.97,0.2],[0.94,0.33],[0.9,0.47],[0.86,0.6],[0.81,0.73],[0.77,0.86],[0.75,1]]],[[[0.02,0.27],[0.04,0.32],[0.14,0.29],[0.24,0.25],[0.34,0.21],[0.43,0.16],[0.52,0.09],[0.6,0.03],[0.6,0.06],[0.6,0.17],[0.6,0.27],[0.58,0.38],[0.58,0.48],[0.56,0.59],[0.54,0.69],[0.52,0.8],[0.49,0.9],[-1.26,1.55]]]],"2":[[[[0.05,0.36],[0.01,0.22],[0.12,0.11],[0.27,0.04],[0.43,0],[0.57,0.04],[0.62,0.19],[0.57,0.34],[0.51,0.49],[0.42,0.63],[0.32,0.75],[0.21,0.87],[0.19,1],[0.35,0.99],[0.5,0.94],[0.66,0.89],[0.81,0.83],[0.97,0.8]]],[[[0.02,0.22],[0.13,0.16],[0.28,0.1],[0.44,0.06],[0.61,0.02],[0.78,0],[0.83,0.14],[0.78,0.29],[0.7,0.43],[0.6,0.57],[0.48,0.68],[0.38,0.81],[0.38,0.95],[0.55,0.98],[0.71,1],[0.88,1],[1.05,1],[1.22,1]]]],"4":[[[[0.21,0.04],[0.23,0.02],[0.17,0.08],[0.12,0.15],[0.08,0.23],[0.05,0.32],[0.02,0.4],[0,0.48],[0.03,0.56],[0.11,0.58],[0.2,0.57],[0.29,0.55],[0.37,0.53],[0.46,0.51],[0.55,0.5],[0.63,0.48],[0.72,0.47],[0.81,0.46]],[[0.66,0.2],[0.58,0.23],[0.52,0.32],[0.47,0.41],[0.43,0.5],[0.4,0.6],[0.37,0.7],[0.34,0.8],[0.32,0.9],[0.31,1]]],[[[0.11,0.05],[0.12,0.1],[0.09,0.25],[0.03,0.39],[0,0.54],[0.03,0.68],[0.15,0.75],[0.29,0.73],[0.44,0.67],[0.57,0.61]],[[0.54,0.2],[0.57,0.15],[0.56,0.26],[0.54,0.37],[0.53,0.48],[0.5,0.58],[0.48,0.69],[0.44,0.79],[0.42,0.9],[0.39,1]]],[[[0.17,0],[0.13,0.1],[0.08,0.2],[0.04,0.3],[0.01,0.41],[0,0.52],[0.05,0.61],[0.16,0.62],[0.28,0.6],[0.39,0.58]],[[0.48,0.17],[0.44,0.24],[0.43,0.33],[0.41,0.43],[0.38,0.52],[0.36,0.62],[0.35,0.71],[0.33,0.81],[0.32,0.9],[0.31,1]]]],"6":[[[[0.24,0],[0.2,0.12],[0.15,0.23],[0.09,0.34],[0.06,0.45],[0.03,0.57],[0.01,0.7],[0,0.82],[0.02,0.94],[0.11,1],[0.23,0.95],[0.29,0.84],[0.34,0.73],[0.37,0.61],[0.32,0.53],[0.22,0.59],[0.12,0.67],[0.04,0.76]]],[[[0.19,0.12],[0.24,0.01],[0.21,0.11],[0.15,0.23],[0.11,0.36],[0.07,0.48],[0.04,0.62],[0.01,0.75],[0,0.88],[0.04,1],[0.17,0.96],[0.28,0.89],[0.34,0.77],[0.37,0.64],[0.36,0.51],[0.23,0.54],[0.12,0.62],[0.03,0.71]]],[[[0.09,0.15],[0.13,0.05],[0.16,0.04],[0.12,0.15],[0.08,0.26],[0.05,0.37],[0.03,0.48],[0.01,0.59],[0,0.7],[0,0.81],[0.01,0.93],[0.08,1],[0.18,0.94],[0.26,0.87],[0.31,0.77],[0.25,0.71],[0.14,0.72],[0.05,0.77]]],[[[0.17,0.02],[0.17,0.09],[0.14,0.19],[0.11,0.29],[0.09,0.4],[0.06,0.5],[0.03,0.6],[0.02,0.71],[0,0.81],[0.01,0.92],[0.08,1],[0.17,0.96],[0.23,0.87],[0.31,0.79],[0.35,0.7],[0.27,0.66],[0.18,0.71],[0.15,0.81]]],[[[0.12,0],[0.1,0.11],[0.05,0.23],[0.03,0.36],[0,0.48],[0,0.61],[0,0.74],[0.05,0.86],[0.13,0.96],[0.24,0.99],[0.36,0.95],[0.45,0.85],[0.53,0.76],[0.5,0.65],[0.4,0.57],[0.3,0.53],[0.18,0.58],[0.1,0.68]]]],"7":[[[[0.11,0.04],[0.01,0.02],[0.09,0.05],[0.2,0.05],[0.31,0.04],[0.42,0.02],[0.53,0],[0.64,0],[0.67,0.05],[0.66,0.16],[0.65,0.27],[0.62,0.38],[0.59,0.49],[0.56,0.59],[0.53,0.7],[0.49,0.81],[0.46,0.91],[0.4,1]],[[0.36,0.72],[0.4,0.71],[0.45,0.7],[0.49,0.68],[0.54,0.67],[0.58,0.67],[0.63,0.67],[0.67,0.66],[0.72,0.65],[0.76,0.64]]],[[[0.03,0.01],[0.07,0.01],[0.2,0.02],[0.34,0.02],[0.47,0.02],[0.61,0.02],[0.74,0.03],[0.87,0.03],[1.01,0.02],[1.01,0.13],[0.97,0.25],[0.94,0.38],[0.9,0.5],[0.83,0.62],[0.74,0.72],[0.65,0.82],[0.55,0.91],[0.46,1]],[[0.39,0.63],[0.43,0.64],[0.5,0.63],[0.57,0.62],[0.64,0.61],[0.71,0.6],[0.77,0.59],[0.84,0.58],[0.91,0.57],[0.98,0.56]]],[[[0.12,0],[0.02,0.07],[0.1,0.06],[0.11,0.08],[0.19,0.12],[0.32,0.12],[0.45,0.12],[0.57,0.11],[0.7,0.1],[0.83,0.1],[0.79,0.19],[0.72,0.3],[0.67,0.42],[0.62,0.54],[0.57,0.66],[0.52,0.77],[0.47,0.89],[0.43,0.99]],[[0.36,0.66],[0.37,0.65],[0.42,0.63],[0.48,0.62],[0.53,0.62],[0.59,0.61],[0.64,0.61],[0.7,0.61],[0.75,0.61],[0.81,0.61]]]],"8":[[[[0.16,0.32],[0.41,0.23],[0.65,0.13],[0.72,0.01],[0.46,0.06],[0.25,0.21],[0.25,0.45],[0.44,0.63],[0.44,0.86],[0.22,0.99],[0.01,0.9],[0.09,0.66],[0.26,0.45],[0.48,0.32],[0.71,0.18],[0.94,0.06],[0.95,0.02],[0.69,0.06]]],[[[0.42,0.22],[0.45,0.05],[0.3,0.1],[0.26,0.27],[0.36,0.42],[0.41,0.58],[0.37,0.75],[0.26,0.9],[0.1,0.98],[0.01,0.92],[0.08,0.75],[0.2,0.62],[0.34,0.51],[0.48,0.39],[0.6,0.26],[0.7,0.11],[0.57,0],[0.41,0.06]]]],"9":[[[[0.37,0.05],[0.3,0.01],[0.18,0.12],[0.16,0.25],[0.32,0.3],[0.49,0.26],[0.65,0.2],[0.79,0.13],[0.67,0.24],[0.63,0.4],[0.6,0.57],[0.57,0.74],[0.47,0.89],[0.34,0.98],[0.16,0.99],[0.01,0.92],[0.07,0.77],[0.22,0.69]],[[0.54,0.27],[0.58,0.27],[0.61,0.26],[0.64,0.25],[0.67,0.23],[0.69,0.2],[0.71,0.17],[0.71,0.14],[0.69,0.11],[0.66,0.09],[0.63,0.08],[0.59,0.07],[0.56,0.05],[0.52,0.05],[0.48,0.03],[0.45,0.03],[0.41,0.03],[0.37,0.03]]],[[[0.68,0.19],[0.86,0.14],[0.78,0.02],[0.6,0],[0.41,0.02],[0.25,0.11],[0.09,0.21],[0.06,0.36],[0.23,0.42],[0.4,0.35],[0.56,0.26],[0.54,0.34],[0.57,0.53],[0.53,0.71],[0.41,0.86],[0.27,0.97],[0.08,1],[0,0.87]]]],"(":[[[[0.08,0.01],[0.05,0.09],[0.02,0.2],[0,0.32],[0,0.44],[0,0.56],[0.02,0.68],[0.06,0.79],[0.11,0.9],[0.17,1]]]],")":[[[[0,0],[0.06,0.09],[0.09,0.2],[0.11,0.31],[0.11,0.43],[0.11,0.55],[0.1,0.66],[0.09,0.78],[0.06,0.89],[0.03,1]]]]};
  /* Vorwissen: Ziffern und Rechenzeichen sind häufiger als Buchstaben */
  const PRIOR = { 'π': 1.18, 'y': 1.2, 'x': 1.04, '(': 1.06, ')': 1.06 };
  /* ---------------------------------------------------------- $P Punktwolken-Erkenner */
  const NP = 32;
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  function resample(strokes, n = NP) {
    const pts = [];
    strokes.forEach((s, id) => s.forEach(p => pts.push({ x: p.x, y: p.y, id })));
    if (!pts.length) return [];
    let L = 0;
    for (let i = 1; i < pts.length; i++) if (pts[i].id === pts[i - 1].id) L += dist(pts[i - 1], pts[i]);
    if (L === 0) return Array.from({ length: n }, () => ({ ...pts[0] }));
    const I = L / (n - 1);
    const out = [{ ...pts[0] }];
    let D = 0;
    for (let i = 1; i < pts.length; i++) {
      if (pts[i].id !== pts[i - 1].id) continue;
      const d = dist(pts[i - 1], pts[i]);
      if (d > 0 && D + d >= I) {
        const t = (I - D) / d;
        const q = { x: pts[i - 1].x + t * (pts[i].x - pts[i - 1].x), y: pts[i - 1].y + t * (pts[i].y - pts[i - 1].y), id: pts[i].id };
        out.push(q); pts.splice(i, 0, q); D = 0;
      } else D += d;
    }
    while (out.length < n) out.push({ ...pts[pts.length - 1] });
    return out.slice(0, n);
  }
  function normalize(pts) {
    let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
    for (const p of pts) { x1 = Math.min(x1, p.x); y1 = Math.min(y1, p.y); x2 = Math.max(x2, p.x); y2 = Math.max(y2, p.y); }
    const s = Math.max(x2 - x1, y2 - y1) || 1;
    let cx = 0, cy = 0;
    const q = pts.map(p => ({ x: (p.x - x1) / s, y: (p.y - y1) / s, id: p.id }));
    for (const p of q) { cx += p.x; cy += p.y; }
    cx /= q.length; cy /= q.length;
    return q.map(p => ({ x: p.x - cx, y: p.y - cy, id: p.id }));
  }
  function cloudDistance(A, B, start, minSoFar) {
    const n = A.length, matched = new Uint8Array(n);
    let sum = 0, i = start;
    do {
      let min = Infinity, idx = -1;
      for (let j = 0; j < n; j++) if (!matched[j]) { const d = (A[i].x - B[j].x) ** 2 + (A[i].y - B[j].y) ** 2; if (d < min) { min = d; idx = j; } }
      matched[idx] = 1;
      const w = 1 - ((i - start + n) % n) / n;
      sum += w * Math.sqrt(min);
      if (sum >= minSoFar) return sum;
      i = (i + 1) % n;
    } while (i !== start);
    return sum;
  }
  function greedyMatch(P, T, minSoFar = Infinity) {
    const n = P.length, step = Math.floor(Math.sqrt(n));
    let min = minSoFar;
    for (let i = 0; i < n; i += step) {
      min = Math.min(min, cloudDistance(P, T, i, min), cloudDistance(T, P, i, min));
    }
    return min;
  }
  let TPL = null, USER = [];
  const toPts = (stroke) => stroke.map(([x, y]) => ({ x, y }));
  function templates() {
    if (TPL) return TPL;
    TPL = [];
    for (const src of [RAW, HAND]) for (const [cls, vars] of Object.entries(src)) for (const v of vars) TPL.push({ cls, n: v.length, cloud: normalize(resample(v.map(toPts))) });
    return TPL;
  }
  /* eigene Handschrift: korrigierte Zeichen werden als zusätzliche Vorlagen gemerkt (lernt mit) */
  function setUserTemplates(list) {
    USER = (list || []).filter(t => t && t.cls && Array.isArray(t.c) && t.c.length === NP).map(t => ({ cls: t.cls, n: t.n || 1, user: true, cloud: t.c.map(([x, y]) => ({ x, y })) }));
    // eigene Schrift auch für den zweiten Erkenner (Punktwolke als ein Strich – reicht für die Richtungen)
    UPROTO = USER.map(t => ({ cls: t.cls, user: true, f: features([t.cloud]) })).filter(t => t.f);
  }
  function learnCloud(sym) {
    const c = normalize(resample(sym.strokes.map(s => s.pts)));
    return { cls: sym.cls, n: sym.strokes.length, c: c.map(p => [Math.round(p.x * 100) / 100, Math.round(p.y * 100) / 100]) };
  }

  /* ---------------------------------------------------------- Zweiter Erkenner (1.52): Richtungs-Zonen-Merkmale
   * Für unleserliche Schrift (schief, zittrig, gestaucht, abgesetzte Striche): jedes Zeichen wird geglättet und
   * auf ein 5×5-Raster gelegt; je Feld zählen die Richtungen der Linie (4 Richtungen, ohne Schreibrichtung – ob eine
   * 0 links- oder rechtsherum geschrieben wird, spielt keine Rolle) und die Tintenmenge, dazu Seitenverhältnis,
   * Strichzahl und ob die Form geschlossen ist. Verglichen wird mit vielen künstlich verzerrten Varianten jeder
   * Vorlage (k nächste Nachbarn). Das Ergebnis gewichtet die Punktwolken-Abstände ($P) um – beide zusammen sind
   * deutlich robuster als jeder allein (gemessen mit tests/mathink/schlampig-test.js). */
  const G = 5, NB = 4;
  function smooth(pts) {
    if (pts.length < 5) return pts;
    const o = [pts[0]];
    for (let i = 1; i < pts.length - 1; i++) {
      const a = pts[Math.max(0, i - 2)], b = pts[i - 1], c = pts[i], d = pts[i + 1], e = pts[Math.min(pts.length - 1, i + 2)];
      o.push({ x: (a.x + 2 * b.x + 3 * c.x + 2 * d.x + e.x) / 9, y: (a.y + 2 * b.y + 3 * c.y + 2 * d.y + e.y) / 9 });
    }
    o.push(pts[pts.length - 1]);
    return o;
  }
  function features(strokes) {
    const S = strokes.map(st => smooth(st)).filter(st => st.length);
    const all = S.flat();
    if (!all.length) return null;
    let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
    for (const p of all) { x1 = Math.min(x1, p.x); y1 = Math.min(y1, p.y); x2 = Math.max(x2, p.x); y2 = Math.max(y2, p.y); }
    const w = x2 - x1, h = y2 - y1, sc = Math.max(w, h) || 1;
    // in ein Quadrat einpassen, Seitenverhältnis bleibt (mittig)
    const ox = x1 - (sc - w) / 2, oy = y1 - (sc - h) / 2;
    const F = new Float32Array(G * G * NB + G * G + 6);
    let L = 0;
    for (const st of S) for (let i = 1; i < st.length; i++) L += Math.hypot(st[i].x - st[i - 1].x, st[i].y - st[i - 1].y);
    const step = Math.max(L / 80, sc / 200);
    for (const st of S) {
      for (let i = 1; i < st.length; i++) {
        const a = st[i - 1], b = st[i], d = Math.hypot(b.x - a.x, b.y - a.y);
        if (!d) continue;
        let ang = Math.atan2(b.y - a.y, b.x - a.x); if (ang < 0) ang += Math.PI;
        const fb = ang / Math.PI * NB, b0 = Math.floor(fb) % NB, b1 = (b0 + 1) % NB, wb = fb - Math.floor(fb);
        const k = Math.max(1, Math.round(d / step));
        for (let t = 0; t < k; t++) {
          const px = (a.x + (b.x - a.x) * (t + 0.5) / k - ox) / sc * G - 0.5, py = (a.y + (b.y - a.y) * (t + 0.5) / k - oy) / sc * G - 0.5;
          const gx = Math.floor(px), gy = Math.floor(py), fx = px - gx, fy = py - gy;
          for (const [cx, cy, wc] of [[gx, gy, (1 - fx) * (1 - fy)], [gx + 1, gy, fx * (1 - fy)], [gx, gy + 1, (1 - fx) * fy], [gx + 1, gy + 1, fx * fy]]) {
            if (cx < 0 || cy < 0 || cx >= G || cy >= G || wc <= 0) continue;
            const z = (cy * G + cx);
            F[z * NB + b0] += wc * (1 - wb) * d / k; F[z * NB + b1] += wc * wb * d / k;
            F[G * G * NB + z] += wc * d / k;
          }
        }
      }
    }
    let n2 = 0;
    for (let i = 0; i < G * G * (NB + 1); i++) n2 += F[i] * F[i];
    n2 = Math.sqrt(n2) || 1;
    for (let i = 0; i < G * G * (NB + 1); i++) F[i] /= n2;
    const o = G * G * (NB + 1);
    F[o] = 0.35 * Math.log((w + 0.05 * sc) / (h + 0.05 * sc));                 // Seitenverhältnis
    F[o + 1] = 0.12 * Math.min(3, S.length);                                   // Strichzahl
    const s0 = S[0][0], e0 = S[S.length - 1][S[S.length - 1].length - 1];
    F[o + 2] = 0.3 * Math.min(1, Math.hypot(e0.x - s0.x, e0.y - s0.y) / sc);  // geschlossen?
    // Mittelpunkt der Tinte (oben/unten, links/rechts lastig: 6 gegen 9, 7 gegen 1)
    let mx = 0, my = 0; for (const p of all) { mx += p.x; my += p.y; }
    F[o + 3] = 0.6 * ((mx / all.length - ox) / sc - 0.5); F[o + 4] = 0.6 * ((my / all.length - oy) / sc - 0.5);
    F[o + 5] = 0;
    return F;
  }
  let PROTO = null;
  /* künstlich verzerrte Varianten der Vorlagen (eigener Zufall, unabhängig von den Tests) */
  function distort(strokes, r) {
    const sx = r(0.7, 1.3), sy = r(0.9, 1.1), sh = r(-0.35, 0.3), rot = r(-0.14, 0.14), wob = r(0, 0.04), wf = r(3, 9), wp = r(0, 6.3), jit = r(0, 0.02);
    const out = strokes.map(st => {
      const pts = [];
      let t = 0;
      for (let k = 0; k < st.length; k++) {
        const p = st[k], q = st[k + 1];
        for (let s2 = 0; s2 < (q ? 3 : 1); s2++) {
          const x = q ? p[0] + (q[0] - p[0]) * s2 / 3 : p[0], y = q ? p[1] + (q[1] - p[1]) * s2 / 3 : p[1];
          const X = x * sx + y * sh, Y = y * sy, w2 = wob * Math.sin(t * wf + wp);
          pts.push({ x: X * Math.cos(rot) - Y * Math.sin(rot) + w2 + r(-jit, jit), y: X * Math.sin(rot) + Y * Math.cos(rot) + w2 * 0.6 + r(-jit, jit) });
          t += 0.06;
        }
      }
      return pts;
    });
    return out;
  }
  function protos() {
    if (PROTO) return PROTO;
    let sd = 99173;
    const r = (a, b) => { sd = (sd * 48271) % 2147483647; return a + (b - a) * ((sd - 1) / 2147483646); };
    PROTO = [];
    for (const src of [RAW, HAND]) for (const [cls, vars] of Object.entries(src)) for (const v of vars) {
      PROTO.push({ cls, f: features(v.map(toPts)) });
      for (let k = 0; k < 24; k++) PROTO.push({ cls, f: features(distort(v, r)) });
    }
    return PROTO;
  }
  let UPROTO = [];
  function knn(strokes) {
    const f = features(strokes);
    if (!f) return new Map();
    const list = [...UPROTO, ...protos()], K = 9, best = [];
    for (const p of list) {
      let d = 0;
      const a = p.f;
      for (let i = 0; i < f.length; i++) { const e = f[i] - a[i]; d += e * e; }
      if (best.length < K || d < best[best.length - 1].d) {
        best.push({ cls: p.cls, d: p.user ? d * 0.8 : d });
        best.sort((x, y) => x.d - y.d);
        if (best.length > K) best.pop();
      }
    }
    const vote = new Map();
    let tot = 0;
    for (const b of best) { const w = 1 / (0.02 + b.d); vote.set(b.cls, (vote.get(b.cls) || 0) + w); tot += w; }
    for (const [k, v] of vote) vote.set(k, v / tot);
    return vote;
  }

  /* ---------------------------------------------------------- Striche vorbereiten */
  const box = (pts) => { let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity; for (const p of pts) { x1 = Math.min(x1, p.x); y1 = Math.min(y1, p.y); x2 = Math.max(x2, p.x); y2 = Math.max(y2, p.y); } return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 }; };
  const union = (a, b) => { const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y); return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y }; };
  const pathLen = (pts) => { let L = 0; for (let i = 1; i < pts.length; i++) L += dist(pts[i - 1], pts[i]); return L; };
  function prepStroke(pts, i) {
    const clean = [];
    for (const p of pts) if (!clean.length || dist(clean[clean.length - 1], p) > 0.3) clean.push({ x: p.x, y: p.y });
    if (!clean.length && pts.length) clean.push({ x: pts[0].x, y: pts[0].y });
    const b = box(clean);
    const L = pathLen(clean);
    const straight = L > 0 ? dist(clean[0], clean[clean.length - 1]) / L : 1;
    return { i, pts: clean, box: b, len: L, straight };
  }
  /* typische Zeichenhöhe: Median der Strichhöhen (Linien und Punkte zählen nicht) */
  function charHeight(strokes) {
    const hs = strokes.map(s => s.box.h).filter(h => h > 0).sort((a, b) => a - b);
    if (!hs.length) return 20;
    const max = hs[hs.length - 1];
    const tall = hs.filter(h => h > max * 0.3);
    return Math.max(6, tall[Math.floor(tall.length * 0.7)] || max);   // eher die grossen Zeichen (Hochzahlen sind kleiner)
  }
  const isHLine = (s, H) => s.box.h < 0.3 * Math.max(s.box.w, 1) && s.box.w > 0.22 * H && (s.box.h < 0.3 * H || s.box.h < 0.12 * s.box.w) && (s.straight > 0.8 || s.len < 1.4 * s.box.w);
  const isDot = (s, H) => Math.max(s.box.w, s.box.h) < 0.22 * H && s.len < 0.6 * H;
  /* Wurzelzeichen: kurz runter, lang hoch, dann waagrecht nach rechts (Dach über dem Radikanden) */
  function isRadical(s, H) {
    const p = s.pts;
    if (p.length < 4 || s.box.w < 0.9 * H || s.box.h < 0.6 * H) return false;
    let top = 0, low = 0;
    for (let i = 0; i < p.length; i++) { if (p[i].y < p[top].y - 0.5 || (Math.abs(p[i].y - p[top].y) <= 0.5 && i < top)) top = i; }
    for (let i = 0; i <= top; i++) if (p[i].y > p[low].y) low = i;
    const end = p[p.length - 1], st = p[0];
    const bar = end.x - p[top].x;
    return top > 1 && low > 0 && low < top && p[low].y - p[top].y > 0.55 * s.box.h && bar > 0.6 * H && Math.abs(end.y - p[top].y) < 0.3 * s.box.h && st.x < p[low].x + 0.2 * H && p[low].x < p[top].x;
  }
  const ovX = (a, b) => Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const ovY = (a, b) => Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);

  /* ---------------------------------------------------------- Striche → Zeichen */
  function group(strokes, H) {
    const groups = [];
    for (const s of strokes) {
      s.kind = isRadical(s, H) ? 'sqrt' : isDot(s, H) ? 'dot' : isHLine(s, H) ? 'hline' : '';
      const g = groups[groups.length - 1];
      if (g && canMerge(g, s, H)) { g.strokes.push(s); g.box = union(g.box, s.box); g.kind = ''; continue; }
      groups.push({ strokes: [s], box: { ...s.box }, kind: s.kind });
    }
    // Wurzel ohne Dach + anschliessender Strich als Dach
    for (let i = 0; i + 1 < groups.length; i++) {
      const g = groups[i], n = groups[i + 1];
      if (g.strokes.length === 1 && n.kind === 'hline' && !g.kind) {
        const p = g.strokes[0].pts, end = p[p.length - 1];
        const left = n.strokes[0].pts.reduce((a, q) => q.x < a.x ? q : a);
        if (end.y < g.box.y + 0.25 * g.box.h && dist(end, left) < 0.4 * H && n.box.w > 0.6 * H && p[0].y < end.y + 0.3 * g.box.h) {
          g.strokes.push(...n.strokes); g.box = union(g.box, n.box); g.kind = 'sqrt'; groups.splice(i + 1, 1);
        }
      }
    }
    // = aus zwei kurzen waagrechten Linien übereinander
    for (let i = 0; i < groups.length; i++) {
      const a = groups[i];
      if (a.kind !== 'hline') continue;
      let best = -1, bd = Infinity;
      for (let j = 0; j < groups.length; j++) {
        const b = groups[j];
        if (j === i || b.kind !== 'hline') continue;
        const ox = ovX(a.box, b.box), minW = Math.min(a.box.w, b.box.w), maxW = Math.max(a.box.w, b.box.w);
        const dy = Math.abs((b.box.y + b.box.h / 2) - (a.box.y + a.box.h / 2));
        if (ox < 0.5 * minW || maxW > 2.2 * minW || dy < 0.08 * H || dy > Math.max(0.75 * maxW, 0.7 * H)) continue;
        const between = groups.some((g, k) => k !== i && k !== j && ovX(g.box, { x: Math.min(a.box.x, b.box.x), y: 0, w: maxW, h: 0 }) > 0 && g.box.y + g.box.h / 2 > Math.min(a.box.y, b.box.y) && g.box.y + g.box.h / 2 < Math.max(a.box.y + a.box.h, b.box.y + b.box.h));
        if (!between && dy < bd) { bd = dy; best = j; }
      }
      if (best >= 0) {
        const b = groups[best];
        a.strokes.push(...b.strokes); a.box = union(a.box, b.box); a.kind = 'eq';
        groups.splice(best, 1);
        if (best < i) i--;
      }
    }
    // ÷ (Linie mit Punkt darüber und darunter) und : (zwei Punkte übereinander)
    for (let i = 0; i < groups.length; i++) {
      const a = groups[i];
      if (a.kind === 'hline' && a.box.w < 1.6 * H) {
        const dots = groups.filter(g => g.kind === 'dot' && g.box.x + g.box.w / 2 > a.box.x && g.box.x + g.box.w / 2 < a.box.x + a.box.w && Math.abs(g.box.y - a.box.y) < 0.9 * H);
        const up = dots.find(g => g.box.y < a.box.y), dn = dots.find(g => g.box.y > a.box.y);
        if (up && dn) { for (const g of [up, dn]) { a.strokes.push(...g.strokes); a.box = union(a.box, g.box); groups.splice(groups.indexOf(g), 1); } a.kind = 'div'; i = -1; continue; }
      }
    }
    for (let i = 0; i < groups.length; i++) {
      const a = groups[i];
      if (a.kind !== 'dot') continue;
      const b = groups.find(g => g !== a && g.kind === 'dot' && Math.abs((g.box.x + g.box.w / 2) - (a.box.x + a.box.w / 2)) < 0.3 * H && Math.abs(g.box.y - a.box.y) > 0.18 * H && Math.abs(g.box.y - a.box.y) < 0.9 * H);
      if (b) { a.strokes.push(...b.strokes); a.box = union(a.box, b.box); a.kind = 'colon'; groups.splice(groups.indexOf(b), 1); i = -1; }
    }
    return groups;
  }
  /* kleinster Abstand zwischen zwei Strichen (berühren sie sich?) */
  function gap(a, b) {
    let m = Infinity;
    const sa = a.pts.length > 40 ? a.pts.filter((_, i) => i % 2 === 0) : a.pts, sb = b.pts.length > 40 ? b.pts.filter((_, i) => i % 2 === 0) : b.pts;
    for (const p of sa) for (const q of sb) { const d = (p.x - q.x) ** 2 + (p.y - q.y) ** 2; if (d < m) m = d; }
    return Math.sqrt(m);
  }
  function canMerge(g, s, H) {
    if (g.kind === 'sqrt' || s.kind === 'sqrt') return false;
    // aus einem Bild: zusammenhängende Tinte ist ein Zeichen (das Skelett zerfällt an Kreuzungen in mehrere Striche)
    if (s.comp != null && g.strokes.some(t => t.comp === s.comp)) {
      // Teile, die übereinander liegen, gehören zusammen; nebeneinander = zwei Zeichen, die sich berühren
      const sx = s.box.x + s.box.w / 2, gx = g.box.x + g.box.w / 2;
      const inside = (sx >= g.box.x - 0.05 * H && sx <= g.box.x + g.box.w + 0.05 * H) || (gx >= s.box.x - 0.05 * H && gx <= s.box.x + s.box.w + 0.05 * H);
      const ov = ovX(g.box, s.box) / Math.max(0.15 * H, Math.min(g.box.w, s.box.w));
      return (inside || ov > 0.3 || Math.max(s.box.w, s.box.h) < 0.3 * H) && g.strokes.length < 6;
    }
    if (g.strokes.length >= 4) return false;
    const touch = g.strokes.some(t => gap(t, s) < 0.07 * H);
    // Punkte nur, wenn sie das Zeichen berühren (z.B. Aufstrich der 1), sonst Dezimal- oder Malpunkt
    if (g.kind === 'dot' || s.kind === 'dot') return touch && g.strokes.length < 3;
    const longLine = (k, b) => k === 'hline' && b.w > 1.5 * H;
    if (longLine(s.kind, s.box) || longLine(g.kind, g.box)) return false;
    const tol = 0.15 * H;
    const gb = { x: g.box.x - tol, y: g.box.y - tol, w: g.box.w + 2 * tol, h: g.box.h + 2 * tol };
    if (ovX(gb, s.box) < 0 || ovY(gb, s.box) < 0) return false;
    // kleines, hoch rechts angesetztes Zeichen ist eine Hochzahl (z.B. ²) – nicht Teil des Zeichens davor
    const sup = (a, b, ka) => a.h < 0.7 * b.h && a.y + a.h < b.y + 0.6 * b.h && a.y < b.y + 0.25 * b.h && a.x > b.x + 0.55 * b.w && ka !== 'hline';
    if (sup(s.box, g.box, s.kind) || (g.strokes.length === 1 && sup(g.box, s.box, g.kind))) return false;
    const r = (ovX(g.box, s.box) + 0.08 * H) / Math.max(0.15 * H, Math.min(g.box.w, s.box.w));
    if (r < 0.45 && !(touch && r >= 0.2)) return false;
    // zwei waagrechte Linien übereinander sind ein = (wird später erkannt), nicht ein Zeichen
    if (g.kind === 'hline' && s.kind === 'hline') return false;
    return true;
  }

  /* ---------------------------------------------------------- Zeichen erkennen */
  function classify(g, H) {
    const b = g.box, n = g.strokes.length;
    if (g.kind === 'sqrt') return [['√', 0]];
    if (g.kind === 'eq') return [['=', 0], ['−', 2]];
    if (g.kind === 'div') return [['÷', 0]];
    if (g.kind === 'colon') return [[':', 0], ['÷', 1]];
    if (g.kind === 'dot') return [['.', 0], ['·', 0.5]];
    if (g.kind === 'hline') return [['−', 0], ['=', 2]];
    // zwei gerade Striche, die sich kreuzen (1.52): waagrecht + senkrecht = „+“, zwei Schräge = „x“ – auch
    // wenn sie schief, zittrig oder nicht mittig sind (sonst oft als offene 4 gelesen)
    if (n === 2) {
      const sm = g.strokes.map(s => smooth(s.pts));
      const info = sm.map(p => { const a = p[0], e = p[p.length - 1], L = pathLen(p) || 1; return { a, e, st: dist(a, e) / L, ang: Math.atan2(Math.abs(e.y - a.y), Math.abs(e.x - a.x)) * 180 / Math.PI, L }; });
      if (info.every(i => i.st > 0.86) && Math.min(info[0].L, info[1].L) > 0.35 * Math.max(info[0].L, info[1].L)) {
        const [A, B] = info;
        const den = (A.e.x - A.a.x) * (B.e.y - B.a.y) - (A.e.y - A.a.y) * (B.e.x - B.a.x);
        if (Math.abs(den) > 1e-6) {
          const t = ((B.a.x - A.a.x) * (B.e.y - B.a.y) - (B.a.y - A.a.y) * (B.e.x - B.a.x)) / den;
          const u = ((B.a.x - A.a.x) * (A.e.y - A.a.y) - (B.a.y - A.a.y) * (A.e.x - A.a.x)) / den;
          const inner = (v) => v > 0.12 && v < 0.88;
          const hv = (A.ang < 32 && B.ang > 58) || (B.ang < 32 && A.ang > 58);
          const dd = A.ang > 25 && A.ang < 70 && B.ang > 25 && B.ang < 70;
          if (inner(t) && inner(u) && hv) return [['+', 0], ['x', 1.5], ['4', 2]];
          if (inner(t) && inner(u) && dd) return [['x', 0], ['+', 1.5], ['×', 1.6]];
        }
      }
    }
    if (n === 1) {
      const s = g.strokes[0];
      // hoher, glatter Bogen ohne Knick = Klammer (Ausbuchtung links = „(“); seit 1.52 auf der geglätteten Linie,
      // damit zittrige Klammern nicht als 1 gelten
      if (b.h > 0.8 * H && b.w < 0.5 * b.h && s.pts.length > 4) {
        // gleichmässig neu abtasten, leicht glätten (Zittern weg), Knick über ein Fenster messen (Ecken der 7, Spitze
        // der 3 bleiben erhalten, kleine Wellen nicht)
        const q = smooth(resample([s.pts], 24));
        let maxTurn = 0;
        for (let k = 0; k + 6 < q.length; k++) {
          const a1 = Math.atan2(q[k + 3].y - q[k].y, q[k + 3].x - q[k].x), a2 = Math.atan2(q[k + 6].y - q[k + 3].y, q[k + 6].x - q[k + 3].x);
          let d = Math.abs(a2 - a1); if (d > Math.PI) d = 2 * Math.PI - d;
          maxTurn = Math.max(maxTurn, d);
        }
        const p0 = s.pts[0], p1 = s.pts[s.pts.length - 1];
        // Ausbuchtung: mittlere Abweichung der Mitte (Punkte 4–7 von 12) von der Sehne
        let cross = 0;
        for (const m of q.slice(9, 15)) cross += ((p1.x - p0.x) * (m.y - p0.y) - (p1.y - p0.y) * (m.x - p0.x)) / Math.max(1, dist(p0, p1)) / 6;
        const dirDown = p1.y > p0.y;
        const bulge = dirDown ? cross : -cross;   // > 0: Ausbuchtung nach links (bei Strich von oben nach unten)
        if (maxTurn < 0.9 && Math.abs(bulge) > 0.07 * b.h && dist(p0, p1) > 0.75 * b.h) return bulge > 0 ? [['(', 0], [')', 2], ['1', 2.5]] : [[')', 0], ['(', 2], ['1', 2.5]];
      }
      if (s.straight > 0.9) {
        const p0 = s.pts[0], p1 = s.pts[s.pts.length - 1];
        const ang = Math.atan2(Math.abs(p1.y - p0.y), Math.abs(p1.x - p0.x)) * 180 / Math.PI;
        const rising = (p1.x - p0.x) * (p1.y - p0.y) < 0;   // von links unten nach rechts oben
        if (ang > 72) return [['1', 0], ['/', 1.2], ['(', 1.5], [')', 1.6]];
        if (ang > 40 && rising) return b.h > 1.05 * H ? [['/', 0], ['1', 0.8]] : [['1', 0], ['/', 0.6]];
      }
    }
    const P = normalize(resample(g.strokes.map(s => s.pts)));
    const best = new Map();
    for (const t of [...USER, ...templates()]) {
      let d = greedyMatch(P, t.cloud, best.has(t.cls) ? best.get(t.cls) * 1.3 : Infinity);
      if (Math.abs(t.n - n) > 1) d *= 1.25;
      if (t.user) d *= 0.9;                       // eigene Handschrift zählt etwas mehr
      d *= PRIOR[t.cls] || 1;
      if (!best.has(t.cls) || d < best.get(t.cls)) best.set(t.cls, d);
    }
    // zweiter Erkenner (1.52): Stimmen der nächsten Nachbarn senken den Abstand der gewählten Klassen
    // (nur für geschriebene Striche – aus Bildern gewonnene Skelette passen nicht zu den Vorlagen, dort bleibt $P allein)
    const fromImg = g.strokes.some(s => s.comp != null);
    const vote = fromImg ? new Map() : knn(g.strokes.map(s => s.pts));
    const KW = 1.6;
    for (const [cls, d] of best) best.set(cls, d * Math.exp(-KW * (vote.get(cls) || 0)));
    // Form-Hinweise: schmale Zeichen sind eher 1 ( ), breite eher + x π
    const asp = b.w / Math.max(1, b.h);
    const adj = (cls, d) => {
      if ((cls === '(' || cls === ')' || cls === '1') && asp > 0.75) d *= 1.4;
      if ((cls === '+' || cls === 'x' || cls === 'π') && asp < 0.45) d *= 1.4;
      if (cls === '+' && n === 1) d *= 1.6;
      if (cls === 'π' && n === 1) d *= 1.3;
      return d;
    };
    const out = [...best].map(([cls, d]) => [cls, adj(cls, d)]).sort((x, y) => x[1] - y[1]).slice(0, 5);
    // 3 mit flachem Dach (ʒ) gegen 5: die 5 hat links oben einen senkrechten Strich, die ʒ dort nichts
    const i3 = out.findIndex(o => o[0] === '3'), i5 = out.findIndex(o => o[0] === '5');
    if (i3 >= 0 && i5 >= 0 && Math.min(i3, i5) === 0 && out[Math.max(i3, i5)][1] < 1.4 * out[0][1]) {
      const raw = resample(g.strokes.map(s => s.pts), 40);
      const zone = raw.filter(q => q.x < b.x + 0.28 * b.w && q.y > b.y + 0.14 * b.h && q.y < b.y + 0.42 * b.h).length;
      const want = zone >= 3 ? '5' : '3';
      if (out[0][0] !== want) { const k = out.findIndex(o => o[0] === want); const [o] = out.splice(k, 1); out.unshift([o[0], out[0][1] * 0.98]); }
    }
    // passt nichts gut (z.B. Buchstaben von Einheiten): unbekannt, Alternativen bleiben zur Auswahl
    if (out.length && out[0][1] > UNKNOWN) out.unshift(['?', out[0][1]]);
    return out;
  }
  const UNKNOWN = 2.3;

  /* ---------------------------------------------------------- Aufbau in 2D */
  const cx = (s) => s.box.x + s.box.w / 2, cy = (s) => s.box.y + s.box.h / 2;
  const OPS = new Set(['+', '−', '=', '·', '×', '÷', ':', '/']);
  /* Bruchstriche und Wurzeln von aussen nach innen auflösen, Rest von links nach rechts mit Hochzahlen */
  function layout(syms, H) {
    syms = syms.slice();
    for (;;) {
      // grösste Struktur zuerst
      let best = null, bw = 0;
      for (const s of syms) {
        if (s.node) continue;
        if (s.cls === '√' && s.box.w > bw) { best = s; bw = s.box.w; }
        if ((s.cls === '−' || s.kind === 'hline') && s.strokes && s.strokes.length === 1 && s.box.w > bw) {
          const { up, dn } = fracParts(s, syms, H);
          if (up.length && dn.length) { best = s; bw = s.box.w; }
        }
      }
      if (!best) break;
      let node;
      if (best.cls === '√') {
        const inner = syms.filter(o => o !== best && cx(o) > best.box.x + 0.25 * Math.min(best.box.w, H) && cx(o) < best.box.x + best.box.w + 0.15 * H && cy(o) > best.box.y && cy(o) < best.box.y + best.box.h + 0.2 * H);
        node = { node: 'sqrt', a: layout(inner, H), box: inner.reduce((bx, o) => union(bx, o.box), best.box), parts: [best, ...inner] };
        syms = syms.filter(o => o !== best && !inner.includes(o));
      } else {
        const { up, dn } = fracParts(best, syms, H);
        node = { node: 'frac', a: layout(up, H), b: layout(dn, H), box: [...up, ...dn].reduce((bx, o) => union(bx, o.box), best.box), parts: [best, ...up, ...dn] };
        syms = syms.filter(o => o !== best && !up.includes(o) && !dn.includes(o));
      }
      node.cls = node.node;
      syms.push(node);
    }
    return linear(syms, H);
  }
  function fracParts(bar, syms, H) {
    const x1 = bar.box.x - 0.1 * bar.box.w, x2 = bar.box.x + bar.box.w * 1.1, y = cy(bar);
    const inX = (o) => cx(o) > x1 && cx(o) < x2 && o.box.w < bar.box.w * 1.15;
    let up = syms.filter(o => o !== bar && inX(o) && o.box.y + o.box.h < y + 0.15 * H && y - (o.box.y + o.box.h) < 1.1 * H);
    let dn = syms.filter(o => o !== bar && inX(o) && o.box.y > y - 0.15 * H && o.box.y - y < 1.1 * H);
    // weitere Zeichen, die zur Zeile von Zähler/Nenner gehören (z.B. Hochzahlen)
    const grow = (arr, above) => {
      if (!arr.length) return arr;
      let b = arr.reduce((bx, o) => union(bx, o.box), arr[0].box);
      for (const o of syms) {
        if (o === bar || arr.includes(o) || !inX(o)) continue;
        if (above ? (cy(o) < y && o.box.y + o.box.h > b.y - 0.4 * H) : (cy(o) > y && o.box.y < b.y + b.h + 0.4 * H)) { arr.push(o); b = union(b, o.box); }
      }
      return arr;
    };
    up = grow(up, true); dn = grow(dn, false);
    // nur Linien darunter (z.B. doppelt unterstrichenes Ergebnis) sind kein Nenner
    const real = (arr) => arr.some(o => o.node || !(o.kind === 'hline' || o.cls === '−' || o.cls === '=' || o.kind === 'eq'));
    if (!real(up) || !real(dn)) return { up: [], dn: [] };
    return { up, dn };
  }
  /* Zeile von links nach rechts: Hochzahlen (kleiner und höher), Punkte (Dezimal- oder Malpunkt), x oder × */
  function linear(syms, H) {
    syms = syms.slice().sort((a, b) => cx(a) - cx(b));
    // Linien weit unter oder über der Zeile sind Unterstreichungen, keine Minuszeichen
    {
      const big = syms.filter(s => s.node || (/^[0-9xyπ(]$/.test(s.cls) && s.box.h >= 0.7 * H)).map(s => cy(s)).sort((a, b) => a - b);
      const m0 = big.length ? big[Math.floor(big.length / 2)] : null;
      if (m0 !== null) syms = syms.filter(s => !((s.kind === 'hline' || s.kind === 'eq') && Math.abs(cy(s) - m0) > 0.9 * H));
    }
    const out = [];
    const isOperand = (s) => s && (s.node || /^[0-9xyπ)]$/.test(s.cls));
    let base = null, i = 0;
    const mainLine = () => {
      // Mittellinie der Zeile: nur normal grosse Zeichen (Hochzahlen sind kleiner) – Median der Mitten
      const ops = syms.filter(s => s.node || /^[0-9xyπ(]$/.test(s.cls));
      const big = ops.filter(s => s.box.h >= 0.7 * H);
      const ys = (big.length ? big : ops).map(s => cy(s)).sort((a, b) => a - b);
      return ys.length ? ys[Math.floor(ys.length / 2)] : null;
    };
    const ml = mainLine();
    while (i < syms.length) {
      const s = syms[i];
      // Hochzahl: deutlich höher und kleiner als das Zeichen davor
      if (base && (!OPS.has(s.cls) || (s.cls === '−' && s.box.w < 0.6 * H))) {
        const raised = (o) => o.box.y + o.box.h < cy(base) + 0.1 * base.box.h && (o.box.h < 0.85 * Math.max(base.box.h, H) || o.cls === '−' || o.cls === '.') && (ml === null || cy(o) < ml - 0.25 * H);
        if (raised(s)) {
          const grp = [];
          const goOn = (o) => o.box.h < 0.9 * H && (ml === null ? raised(o) : cy(o) < ml - 0.15 * H && o.box.y + o.box.h < ml + 0.2 * H);
          while (i < syms.length && (grp.length ? goOn(syms[i]) : raised(syms[i]))) grp.push(syms[i++]);
          if (grp.length) { out.push({ t: 'pow', a: linear(grp, Math.max(4, H * 0.6)), parts: grp }); base = null; continue; }
        }
      }
      if (s.node === 'frac') out.push({ t: 'frac', a: s.a, b: s.b, parts: s.parts });
      else if (s.node === 'sqrt') out.push({ t: 'sqrt', a: s.a, parts: s.parts });
      else {
        let c = s.cls;
        // kleines Zeichen unten in der Zeile zwischen Ziffern = Dezimalkomma
        if (!s.node && c !== '.' && c !== '·' && !(s.kind === 'hline' && s.box.w > 0.25 * H) && ml !== null && Math.max(s.box.w, s.box.h) < 0.45 * H && s.box.y > ml && syms[i - 1] && /^[0-9]$/.test(syms[i - 1].cls) && syms[i + 1] && /^[0-9]$/.test(syms[i + 1].cls)) c = '.';
        if (c === '.' || c === '·') {
          // Höhe im Verhältnis zur Zeile: unten = Dezimalpunkt, Mitte = Malpunkt
          const prev = syms[i - 1], next = syms[i + 1];
          const nb = [prev, next].filter(o => o && !o.node && /^[0-9xyπ()]$/.test(o.cls));
          if (nb.length) {
            const top = Math.min(...nb.map(o => o.box.y)), bot = Math.max(...nb.map(o => o.box.y + o.box.h));
            const t = (cy(s) - top) / Math.max(1, bot - top);
            const digits = prev && next && /^[0-9]$/.test(prev.cls) && /^[0-9]$/.test(next.cls);
            c = t > 0.66 && digits ? '.' : t > 0.66 && prev && /^[0-9]$/.test(prev.cls) && !next ? '.' : '·';
            if (s.box.h > s.box.w * 1.6 && t > 0.6) c = '.';   // Komma
          } else c = '·';
        }
        if (c === '.') {
          // eine Zahl hat höchstens einen Dezimalpunkt – ein zweiter ist ein Malpunkt
          for (let k = out.length - 1; k >= 0 && out[k].t === 'sym' && /^[0-9.]$/.test(out[k].c); k--) if (out[k].c === '.') { c = '·'; break; }
        }
        out.push({ t: 'sym', c, s });
      }
      base = isOperand(s) ? s : null;
      i++;
    }
    return out;
  }

  /* ---------------------------------------------------------- Ergebnis als Vorlagenbaum (Taschenrechner) */
  function toTree(seq, eqAllowed) {
    const left = [];
    let right = null, cur = left;
    seq.forEach((e, k) => {
      if (e.t === 'frac') { cur.push({ t: 'frac', a: toTree(e.a).left, b: toTree(e.b).left }); return; }
      if (e.t === 'sqrt') { cur.push({ t: 'sqrt', a: toTree(e.a).left }); return; }
      if (e.t === 'pow') { cur.push({ t: 'pow', a: toTree(e.a).left }); return; }
      const c = e.c;
      if (c === '=' && eqAllowed && cur === left) { right = []; cur = right; return; }
      if (/^[0-9.]$/.test(c) || c === '(' || c === ')' || c === 'π' || c === '+') { cur.push(c); return; }
      if (c === '−') { cur.push('−'); return; }
      if (c === '·' || c === '×') { cur.push('×'); return; }
      if (c === '÷' || c === ':' || c === '/') { cur.push('÷'); return; }
      if (c === 'x' || c === 'y') {
        // × oder Variable: ohne Gleichung ist ein x zwischen Zahlen ein Malzeichen
        const prev = seq[k - 1], next = seq[k + 1];
        // Malzeichen nur zwischen zwei Zahlen (3x4), sonst Variable (2x+3)
        const between = prev && next && (prev.t !== 'sym' || /^[0-9)π]$/.test(prev.c)) && (next.t !== 'sym' || /^[0-9(π]$/.test(next.c));
        if (c === 'x' && between) cur.push('×'); else cur.push(c);
        return;
      }
      cur.push('?');
    });
    return { left, right };
  }

  /* ---------------------------------------------------------- Hauptfunktion */
  /* strokes: [{ pts: [{x,y}], id? }] in Schreibreihenfolge; overrides: Map(Zeichenschlüssel → Klasse) */
  /* Schräglage der Schrift schätzen (Kursivschrift) und gerade richten */
  function deskew(list) {
    let sx = 0, sy = 0;
    for (const pts of list) for (let i = 1; i < pts.length; i++) {
      let dx = pts[i].x - pts[i - 1].x, dy = pts[i].y - pts[i - 1].y;
      if (Math.abs(dy) < 2 * Math.abs(dx) || Math.abs(dy) < 0.3) continue;   // nur steile Stücke
      if (dy < 0) { dx = -dx; dy = -dy; }
      sx += dx; sy += dy;
    }
    const t = sy > 0 ? clampN(sx / sy, -0.5, 0.5) : 0;
    if (Math.abs(t) < 0.05) return list;
    let ym = 0, n = 0;
    for (const pts of list) for (const p of pts) { ym += p.y; n++; }
    ym /= n || 1;
    return list.map(pts => pts.map(p => ({ x: p.x - (p.y - ym) * t, y: p.y })));
  }
  const clampN = (v, a, b) => Math.max(a, Math.min(b, v));
  function recognize(strokesIn, overrides) {
    const straight = deskew(strokesIn.map(s => s.pts));
    const strokes = strokesIn.map((s, i) => Object.assign(prepStroke(straight[i], i), { id: s.id, comp: s.comp }));
    // Bild: Umriss jeder zusammenhängenden Tinte (für die Gruppierung)
    const cb = new Map();
    for (const s of strokes) if (s.comp != null) cb.set(s.comp, cb.has(s.comp) ? union(cb.get(s.comp), s.box) : { ...s.box });
    for (const s of strokes) if (s.comp != null) s.cbox = cb.get(s.comp);
    if (!strokes.length) return null;
    const H = charHeight(strokes);
    const groups = group(strokes, H);
    // nachträglich ergänzte Teile (z.B. später geschlossene Schleife der 9): kleines Stück, das ein Zeichen berührt und darin liegt
    for (let i = 0; i < groups.length; i++) {
      const g = groups[i];
      if (g.kind || g.strokes.length > 1 || Math.max(g.box.w, g.box.h) > 0.6 * H) continue;
      const host = groups.find(o => o !== g && !o.kind && o.strokes.length < 4 && ovX(o.box, g.box) > 0.6 * g.box.w && ovY(o.box, g.box) > 0.6 * g.box.h && o.strokes.some(t => gap(t, g.strokes[0]) < 0.08 * H));
      if (host) { host.strokes.push(...g.strokes); host.box = union(host.box, g.box); groups.splice(i, 1); i--; }
    }
    // Trennen nach Erkennung (1.52): eng geschriebene Zeichen landen leicht in einer Gruppe (z. B. „10“ als 4, „90“ als
    // x). Für jede Gruppe aus mehreren Strichen (keine Sonderformen, nicht aus Bildern) wird jede Teilung in der
    // Schreibreihenfolge geprüft: liegen die Teile nebeneinander und werden beide klar besser erkannt als das Ganze,
    // gilt die Teilung.
    const cache = new Map();
    const cls1 = (gr) => { const k = gr.strokes.map(t => t.i).join(','); if (!cache.has(k)) cache.set(k, classify(gr, H)); return cache.get(k); };
    const mk = (st) => { let bx = { ...st[0].box }; for (const t of st.slice(1)) bx = union(bx, t.box); return { strokes: st, box: bx, kind: st.length === 1 && (st[0].kind === 'hline' || st[0].kind === 'dot') ? st[0].kind : '' }; };
    for (let i = 0; i < groups.length; i++) {
      const g = groups[i];
      if (g.kind || g.strokes.length < 2 || g.strokes.some(t => t.comp != null)) continue;
      const whole = cls1(g)[0];
      if (!whole || whole[1] === 0) continue;   // eine sichere Regel (+, x, Klammer …) bleibt ganz
      let best = null;
      for (let k = 1; k < g.strokes.length; k++) {
        const A = mk(g.strokes.slice(0, k)), B = mk(g.strokes.slice(k));
        const ox = ovX(A.box, B.box) / Math.max(1, Math.min(A.box.w, B.box.w));
        if (ox > 0.35) continue;   // übereinander geschrieben: eher ein Zeichen
        const lone = (P) => P.strokes.length === 1 && P.strokes[0].kind === 'hline';   // Minus neben einer Ziffer
        if (Math.min(A.box.h, B.box.h) < 0.45 * H && !lone(A) && !lone(B)) continue;   // kleiner Teil (Fuss der 1, Querstrich der 7): kein eigenes Zeichen
        if (g.strokes.slice(0, k).some(t => g.strokes.slice(k).some(u => gap(t, u) < 0.04 * H))) continue;   // berühren sich: ein Zeichen (x aus zwei Bögen)
        const a = cls1(A)[0], c = cls1(B)[0];
        if (!a || !c || a[0] === '?' || c[0] === '?') continue;
        const sc = Math.max(a[1], c[1]);
        if (sc * 1.18 < whole[1] && (!best || sc < best.sc)) best = { sc, A, B };
      }
      if (best) { groups.splice(i, 1, best.A, best.B); i++; }
    }
    const syms = groups.map(g => {
      const alts = cls1(g);
      const key = g.strokes.map(s => s.id != null ? s.id : s.i).join('|');
      const forced = overrides && overrides.get(key);
      const cls = forced || (alts[0] ? alts[0][0] : '?');
      return { cls, alts: alts.map(a => a[0]), sc: alts, score: alts[0] ? alts[0][1] : 1, box: g.box, kind: g.kind, strokes: g.strokes, key, forced: !!forced };
    });
    // kleine x zwischen Zahlen sind Malzeichen (×), grosse eher die Variable x
    const digitH = syms.filter(s => /^[0-9]$/.test(s.cls)).map(s => s.box.h).sort((a, b) => a - b);
    const dh = digitH.length ? digitH[Math.floor(digitH.length / 2)] : H;
    const markSmall = (q) => { for (const e of q) { if (e.t === 'sym' && e.c === 'x' && e.s.box.h < 0.72 * dh) e.small = true; if (e.a) markSmall(e.a); if (e.b) markSmall(e.b); } };
    const build = () => { const seq = layout(syms, H); markSmall(seq); return { ...toTree(seq, true), seq }; };
    let res = build();
    // Zusammenhang (seit 1.38, wie Photomath): ergibt die beste Erkennung keine gültige Rechnung (z.B. „3 + + 4“,
    // Klammer ohne Partner, „?“), werden die nächstbesten Lesarten unsicherer Zeichen durchprobiert – erst eine, dann
    // zwei gleichzeitig, die mit dem kleinsten Abstand zur besten Erkennung gewinnt. Geänderte Zeichen: s.auto.
    if (!validTree(res.left, res.right)) {
      const amb = [];
      syms.forEach((sy) => {
        if (sy.forced || !sy.sc || sy.sc.length < 2) return;
        const real = sy.sc.filter(a => a[0] !== '?');
        const base = sy.cls === '?' ? (real[0] ? real[0][1] : 1) : sy.sc[0][1];
        const opts = real.filter(a => a[0] !== sy.cls).slice(0, 3).map(a => ({ cls: a[0], cost: (a[1] - base) / Math.max(base, 0.3) + (sy.cls === '?' ? 0 : 0.05) })).filter(o => o.cost < 8);
        if (opts.length) amb.push({ sy, opts, best: Math.min(...opts.map(o => o.cost)) });
      });
      amb.sort((a, b) => a.best - b.best);
      const A = amb.slice(0, 10), cand = [];
      A.forEach((x, i) => { for (const o of x.opts) { cand.push({ cost: o.cost, ch: [[x.sy, o.cls]] }); for (let j = i + 1; j < A.length; j++) for (const o2 of A[j].opts) cand.push({ cost: o.cost + o2.cost, ch: [[x.sy, o.cls], [A[j].sy, o2.cls]] }); } });
      cand.sort((a, b) => a.cost - b.cost);
      for (const c of cand.slice(0, 400)) {
        const old = c.ch.map(([sy]) => sy.cls);
        for (const [sy, cl] of c.ch) sy.cls = cl;
        const r = build();
        if (validTree(r.left, r.right)) { for (const [sy] of c.ch) sy.auto = true; res = r; break; }
        c.ch.forEach(([sy], k) => { sy.cls = old[k]; });
      }
    }
    return { left: res.left, right: res.right, syms, H, seq: res.seq };
  }
  /* gültige Rechnung? Operanden und Rechenzeichen im Wechsel, Klammern paarweise, nichts Unbekanntes */
  function okSeq(T, allowEmpty) {
    if (!T || !T.length) return !!allowEmpty;
    let need = true, depth = 0;
    for (let i = 0; i < T.length; i++) {
      const t = T[i];
      if (t && typeof t === 'object') {
        if (t.t === 'pow') { if (need || !okSeq(t.a)) return false; continue; }
        if (t.t === 'frac') { if (!okSeq(t.a) || !okSeq(t.b)) return false; need = false; continue; }
        if (t.t === 'sqrt') { if (!okSeq(t.a)) return false; need = false; continue; }
        need = false; continue;
      }
      if (t === '?' || t == null) return false;
      if (/^[0-9]$/.test(t) || /^[A-Za-zπ]$/.test(t)) { need = false; continue; }
      if (t === '.') { if (!/^[0-9]$/.test(T[i + 1] || '')) return false; continue; }
      if (t === '(') { depth++; need = true; continue; }
      if (t === ')') { if (need || !depth) return false; depth--; continue; }
      if (t === '−' || t === '+') { need = true; continue; }
      if (t === '×' || t === '÷') { if (need) return false; need = true; continue; }
      return false;
    }
    return !need && !depth;
  }
  const validTree = (L, R) => okSeq(L, R !== null && R !== undefined) && (R === null || R === undefined || okSeq(R, true));

  /* ---------------------------------------------------------- Text (z.B. korrigierte Eingabe) → Vorlagenbaum */
  function fromText(src) {
    // getippte Rechnung (seit 1.38 toleranter): Hochzahlen ²³⁴, ** und ^, ½ ¼ ¾, Dezimalkomma, × als x zwischen
    // Zahlen (3x4), ÷ : /, Wurzel als √ oder sqrt, pi
    src = String(src || '').replace(/\*\*/g, '^').replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹⁻]+/g, (m) => '^(' + [...m].map(c => c === '⁻' ? '-' : '⁰¹²³⁴⁵⁶⁷⁸⁹'.indexOf(c)).join('') + ')')
      .replace(/½/g, '(1/2)').replace(/¼/g, '(1/4)').replace(/¾/g, '(3/4)').replace(/⅓/g, '(1/3)').replace(/⅔/g, '(2/3)').replace(/÷/g, ':');
    if (!/=\s*\S/.test(src) && !/[a-wyzA-Z]/.test(src.replace(/sqrt|pi|sin|cos|tan|ln|log/gi, ''))) src = src.replace(/(\d)\s*[xX]\s*(?=[\d(])/g, '$1×');
    const s = String(src || '').replace(/\*/g, '×').replace(/·/g, '×').replace(/:/g, '÷').replace(/−|–/g, '−').replace(/-/g, '−').replace(/,/g, '.').replace(/\bpi\b/gi, 'π').replace(/sqrt/gi, '√').replace(/\s+/g, '');
    let i = 0;
    const peek = () => s[i];
    const eat = (c) => { if (s[i] === c) { i++; return true; } return false; };
    // Ausdruck → AST
    const sum = () => { let a = prod(); for (;;) { const c = peek(); if (c === '+' || c === '−') { i++; a = { k: 'bin', op: c, a, b: prod() }; } else break; } return a; };
    const prod = () => {
      let a = unary();
      for (;;) {
        const c = peek();
        if (c === '×' || c === '÷') { i++; a = { k: 'bin', op: c, a, b: unary() }; }
        else if (c && /[0-9.A-Za-zπ(√]/.test(c) && a) { a = { k: 'bin', op: '·', a, b: unary() }; }
        else break;
      }
      return a;
    };
    const unary = () => { if (eat('−')) return { k: 'neg', a: unary() }; if (eat('+')) return unary(); return frac(); };
    const frac = () => { let a = power(); while (peek() === '/') { i++; a = { k: 'frac', a, b: power() }; } return a; };
    const power = () => {
      let a = atom();
      for (;;) {
        if (eat('^')) { const neg = eat('−'); let e = atom(); if (neg) e = { k: 'neg', a: e }; a = { k: 'pow', a, b: e }; }
        else if (eat('²')) a = { k: 'pow', a, b: { k: 'num', v: '2' } };
        else if (eat('³')) a = { k: 'pow', a, b: { k: 'num', v: '3' } };
        else break;
      }
      return a;
    };
    const atom = () => {
      const c = peek();
      if (c === undefined) return { k: 'num', v: '' };
      if (/[0-9.]/.test(c)) { let v = ''; while (/[0-9.]/.test(peek() || '')) v += s[i++]; return { k: 'num', v }; }
      if (c === '(') { i++; const a = sum(); eat(')'); return { k: 'par', a }; }
      if (c === '√') { i++; return { k: 'sqrt', a: peek() === '(' ? (i++, (() => { const a = sum(); eat(')'); return a; })()) : power() }; }
      const m = /^(sin|cos|tan|ln|log)\(/.exec(s.slice(i));
      if (m) { i += m[0].length; const a = sum(); eat(')'); return { k: 'fn', f: m[1], a }; }
      if (/[A-Za-zπ]/.test(c)) { i++; return { k: 'sym', v: c }; }   // seit 1.27 jeder Buchstabe (Unbekannte); e = Eulersche Zahl
      i++;
      return { k: 'sym', v: '?' };
    };
    const strip = (n) => n && n.k === 'par' ? n.a : n;
    const tree = (n) => {
      if (!n) return [];
      switch (n.k) {
        case 'num': return n.v.split('');
        case 'sym': return [n.v];
        case 'par': return ['(', ...tree(n.a), ')'];
        case 'neg': return ['−', ...tree(n.a)];
        case 'bin': return [...tree(n.a), n.op === '·' ? null : n.op, ...tree(n.b)].filter(Boolean);
        case 'frac': return [{ t: 'frac', a: tree(strip(n.a)), b: tree(strip(n.b)) }];
        case 'pow': return [...tree(n.a), { t: 'pow', a: tree(strip(n.b)) }];
        case 'sqrt': return [{ t: 'sqrt', a: tree(strip(n.a)) }];
        case 'fn': return [n.f + '(', ...tree(n.a), ')'];
      }
      return [];
    };
    i = 0;
    const L = sum();
    let R = null;
    if (eat('=')) R = i < s.length ? sum() : { k: 'empty' };
    return { left: tree(L), right: R ? (R.k === 'empty' ? [] : tree(R)) : null };
  }

  /* ---------------------------------------------------------- Vorlagenbaum → LaTeX (für die Formel-Darstellung) */
  function toTex(tree) {
    let s = '';
    const open = [];
    for (const t of tree || []) {
      if (typeof t === 'string') {
        if (t === '(') { open.push(1); s += '\\left('; continue; }
        if (t === ')') { s += open.length ? (open.pop(), '\\right)') : ')'; continue; }
        s += ({ '×': ' \\cdot ', '÷': ' : ', '−': '-', '(−)': '-', 'π': '\\pi ', '?': '\\square ', 'Ans': '\\mathrm{Ans}' })[t] ?? (t.endsWith('(') ? '\\' + t.slice(0, -1).replace('⁻¹', '^{-1}') + '\\left(' : t);
        if (t.endsWith('(') && t.length > 1) open.push(1);
        continue;
      }
      switch (t.t) {
        case 'frac': s += `\\frac{${toTex(t.a)}}{${toTex(t.b)}}`; break;
        case 'mixed': s += `${toTex(t.w)}\\frac{${toTex(t.a)}}{${toTex(t.b)}}`; break;
        case 'sqrt': s += `\\sqrt{${toTex(t.a)}}`; break;
        case 'root': s += `\\sqrt[${toTex(t.n)}]{${toTex(t.a)}}`; break;
        case 'pow': s += `^{${toTex(t.a)}}`; break;
        case 'exp': s += `e^{${toTex(t.a)}}`; break;
        case 'ten': s += `10^{${toTex(t.a)}}`; break;
        case 'abs': s += `\\left|${toTex(t.a)}\\right|`; break;
        case 'logb': s += `\\log_{${toTex(t.b)}}\\left(${toTex(t.a)}\\right)`; break;
      }
    }
    while (open.length) { open.pop(); s += '\\right.'; }
    return s.replace(/\s+/g, ' ').trim();
  }
  const hasVar = (tree, v = /^[xy]$/) => (tree || []).some(t => typeof t === 'string' ? v.test(t) : Object.values(t).some(x => Array.isArray(x) && hasVar(x, v)));
  const hasUnknown = (tree) => (tree || []).some(t => typeof t === 'string' ? t === '?' : Object.values(t).some(x => Array.isArray(x) && hasUnknown(x)));

  /* ---------------------------------------------------------- Bilder (seit 1.9, Beta): Pixel → Striche
   * Für eingescannte oder fotografierte Handschrift. Graustufen → Tinte (Otsu und Sauvola zusammen, damit Schatten nicht
   * schwarz werden), durchgehende Rasterlinien (Häuschenpapier) entfernen, Zusammenhangskomponenten, Skelett (Zhang-Suen),
   * kurze Ästchen abschneiden und das Skelett in Striche zerlegen (an Kreuzungen geradeaus weiter, wie ein Stift).
   * Ergebnis: Striche in Pixelkoordinaten, links nach rechts; danach geht es weiter wie bei echter Tinte. */
  function fromBitmap(gray, w, h) {
    const N = w * h;
    if (!N) return { strokes: [], width: 0 };
    let sum = 0;
    for (let i = 0; i < N; i++) sum += gray[i];
    const inv = sum / N < 110;                       // helle Schrift auf dunklem Grund
    const g0 = new Float32Array(N), g = new Float32Array(N);
    for (let i = 0; i < N; i++) g0[i] = inv ? 255 - gray[i] : gray[i];
    // leicht weichzeichnen (1-2-1 in beide Richtungen): Rauschen und Papierstruktur weg, Striche bleiben
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = y * w + x; g[i] = (2 * g0[i] + g0[x > 0 ? i - 1 : i] + g0[x < w - 1 ? i + 1 : i]) / 4; }
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = y * w + x; g0[i] = (2 * g[i] + g[y > 0 ? i - w : i] + g[y < h - 1 ? i + w : i]) / 4; }
    g.set(g0);
    // Otsu: Schwelle zwischen Papier und Tinte
    const hist = new Float64Array(256);
    for (let i = 0; i < N; i++) hist[Math.max(0, Math.min(255, g[i] | 0))]++;
    let all = 0;
    for (let t = 0; t < 256; t++) all += t * hist[t];
    let wB = 0, sB = 0, best = -1, otsu = 128, mInk = 0, mPaper = 255;
    for (let t = 0; t < 256; t++) {
      wB += hist[t]; if (!wB) continue;
      const wF = N - wB; if (!wF) break;
      sB += t * hist[t];
      const mB = sB / wB, mF = (all - sB) / wF, v = wB * wF * (mB - mF) * (mB - mF);
      if (v > best) { best = v; otsu = t; mInk = mB; mPaper = mF; }
    }
    if (mPaper - mInk < 25) return { strokes: [], width: 0 };   // kein Kontrast → keine Schrift
    // Sauvola (örtliche Schwelle) über Summenbilder
    const W1 = w + 1, S1 = new Float64Array(W1 * (h + 1)), S2 = new Float64Array(W1 * (h + 1));
    for (let y = 0; y < h; y++) {
      let a = 0, b = 0;
      for (let x = 0; x < w; x++) { const v = g[y * w + x]; a += v; b += v * v; S1[(y + 1) * W1 + x + 1] = S1[y * W1 + x + 1] + a; S2[(y + 1) * W1 + x + 1] = S2[y * W1 + x + 1] + b; }
    }
    const R = Math.max(6, Math.round(Math.min(w, h) / 7));
    const ink = new Uint8Array(N);
    const lim = Math.min(otsu + 4, (mInk + mPaper) / 2 + 20);
    for (let y = 0; y < h; y++) {
      const y0 = Math.max(0, y - R), y1 = Math.min(h, y + R + 1);
      for (let x = 0; x < w; x++) {
        const v = g[y * w + x];
        if (v > lim) continue;
        const x0 = Math.max(0, x - R), x1 = Math.min(w, x + R + 1), n = (y1 - y0) * (x1 - x0);
        const s1 = S1[y1 * W1 + x1] - S1[y0 * W1 + x1] - S1[y1 * W1 + x0] + S1[y0 * W1 + x0];
        const s2 = S2[y1 * W1 + x1] - S2[y0 * W1 + x1] - S2[y1 * W1 + x0] + S2[y0 * W1 + x0];
        const m = s1 / n, sd = Math.sqrt(Math.max(0, s2 / n - m * m));
        if (v < m * (1 + 0.2 * (sd / 128 - 1)) && v < m - 6) ink[y * w + x] = 1;
      }
    }
    // Rasterlinien: Zeilen/Spalten, die von Rand zu Rand fast ganz Tinte sind (dünn) – nur dort löschen, wo kein Strich kreuzt
    const dropLines = (horiz) => {
      const L = horiz ? h : w, M = horiz ? w : h;
      const at = (i, j) => horiz ? ink[i * w + j] : ink[j * w + i];
      const clr = (i, j) => { if (horiz) ink[i * w + j] = 0; else ink[j * w + i] = 0; };
      const full = new Uint8Array(L);
      for (let i = 0; i < L; i++) { let n = 0; for (let j = 0; j < M; j++) n += at(i, j); full[i] = n > 0.85 * M && at(i, 0) | at(i, 1) && at(i, M - 1) | at(i, M - 2) ? 1 : 0; }
      for (let i = 0; i < L; i++) {
        if (!full[i]) continue;
        let k = i;
        while (k + 1 < L && full[k + 1]) k++;
        if (k - i <= 5) for (let j = 0; j < M; j++) {
          const above = i > 0 && at(i - 1, j), below = k + 1 < L && at(k + 1, j);
          if (!(above && below)) for (let q = i; q <= k; q++) clr(q, j);
        }
        i = k;
      }
    };
    dropLines(true); dropLines(false);
    // Zusammenhangskomponenten (8er-Nachbarschaft)
    const lab = new Int32Array(N);
    const label = () => {
      lab.fill(-1);
      const out = [], stack = [];
      for (let i = 0; i < N; i++) {
        if (!ink[i] || lab[i] >= 0) continue;
        const c = { px: [], x1: w, y1: h, x2: 0, y2: 0, id: out.length };
        lab[i] = c.id; stack.push(i);
        while (stack.length) {
          const p = stack.pop(), x = p % w, y = (p - x) / w;
          c.px.push(p);
          if (x < c.x1) c.x1 = x; if (x > c.x2) c.x2 = x; if (y < c.y1) c.y1 = y; if (y > c.y2) c.y2 = y;
          for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
            const xx = x + dx, yy = y + dy;
            if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
            const q = yy * w + xx;
            if (ink[q] && lab[q] < 0) { lab[q] = c.id; stack.push(q); }
          }
        }
        out.push(c);
      }
      return out;
    };
    let comps = label();
    // Strichbreite: Median der waagrechten Tintenläufe
    const runs = [];
    for (let y = 0; y < h; y++) { let n = 0; for (let x = 0; x <= w; x++) { if (x < w && ink[y * w + x]) n++; else if (n) { runs.push(n); n = 0; } } }
    runs.sort((a, b) => a - b);
    const sw = runs.length ? runs[runs.length >> 1] : 2;
    // sich berührende Ziffern (z.B. „10“) an der dünnsten Stelle trennen – nicht bei Dächern (π, Wurzel): die liegen ganz oben
    {
      const hs = comps.map(c => c.y2 - c.y1 + 1).sort((a, b) => a - b);
      const Hc0 = hs.length ? hs[Math.floor(hs.length * 0.7)] : 10;
      let cut = false;
      for (const c of comps) {
        const cw = c.x2 - c.x1 + 1, ch = c.y2 - c.y1 + 1;
        if (cw < 1.2 * ch || ch < 0.45 * Hc0 || cw < 4 * sw) continue;
        const proj = new Int32Array(cw), top = new Int32Array(cw).fill(h), bot = new Int32Array(cw).fill(-1);
        for (const p of c.px) { const x = p % w, y = (p - x) / w, k = x - c.x1; proj[k]++; if (y < top[k]) top[k] = y; if (y > bot[k]) bot[k] = y; }
        let best = -1;
        for (let k = Math.floor(0.2 * cw); k <= Math.ceil(0.8 * cw); k++) if (best < 0 || proj[k] < proj[best]) best = k;
        if (best < 0 || proj[best] > 1.6 * sw) continue;
        let a = best, b = best;
        while (a > 0 && proj[a - 1] <= 1.6 * sw) a--;
        while (b < cw - 1 && proj[b + 1] <= 1.6 * sw) b++;
        if (b - a + 1 > 2.2 * sw) continue;                                  // langes dünnes Stück = Dach/Strich, kein Berührpunkt
        if (bot[best] < c.y1 + 0.15 * ch) continue;                          // ganz oben: Dach von π oder Wurzel
        for (const p of c.px) if (p % w === c.x1 + best) ink[p] = 0;
        cut = true;
      }
      if (cut) comps = label();
    }
    // Skelett je Komponente
    const skel = [];
    let area = 0, sk = 0;
    for (const c of comps) {
      const cw = c.x2 - c.x1 + 3, ch = c.y2 - c.y1 + 3;
      const m = new Uint8Array(cw * ch);
      for (const p of c.px) { const x = p % w, y = (p - x) / w; m[(y - c.y1 + 1) * cw + (x - c.x1 + 1)] = 1; }
      thin(m, cw, ch);
      let n = 0;
      for (let i = 0; i < m.length; i++) n += m[i];
      if (!n) { m[(((c.y1 + c.y2) >> 1) - c.y1 + 1) * cw + (((c.x1 + c.x2) >> 1) - c.x1 + 1)] = 1; n = 1; }   // Punkt: Verdünnung löscht kleine Kleckse ganz
      c.m = m; c.cw = cw; c.ch = ch; c.sk = Math.max(1, n);
      area += c.px.length; sk += c.sk;
      skel.push(c);
    }
    const width = sk ? Math.max(1, area / sk) : 1;     // mittlere Strichbreite
    const keep = skel.filter(c => {
      const big = Math.max(c.x2 - c.x1 + 1, c.y2 - c.y1 + 1);
      if (c.px.length < Math.max(3, 0.45 * width * width) || big < Math.max(2, 0.7 * width)) return false;   // Staub
      if ((c.x1 <= 1 && c.x2 >= w - 2 && c.y2 - c.y1 < 0.2 * h) || (c.y1 <= 1 && c.y2 >= h - 2 && c.x2 - c.x1 < 0.2 * w)) return false;   // Linie am Rand
      return true;
    }).sort((a, b) => a.x1 - b.x1 || a.y1 - b.y1);
    const strokes = [], comp = [];
    const Hc = keep.length ? keep.map(c => c.y2 - c.y1 + 1).sort((a, b) => a - b)[Math.floor(keep.length * 0.7)] : 10;
    keep.forEach((c, k) => { for (const s of trace(c, Math.max(2, Math.min(0.15 * Hc, 3 * width)))) { strokes.push(s.map(q => ({ x: q.x + c.x1 - 1, y: q.y + c.y1 - 1 }))); comp.push(k); } });
    return { strokes, comp, width };
  }
  /* Zhang-Suen-Verdünnung (in place, 1 = Tinte) */
  function thin(m, w, h) {
    const del = [];
    let changed = true;
    while (changed) {
      changed = false;
      for (let step = 0; step < 2; step++) {
        del.length = 0;
        for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
          const i = y * w + x;
          if (!m[i]) continue;
          const p2 = m[i - w], p3 = m[i - w + 1], p4 = m[i + 1], p5 = m[i + w + 1], p6 = m[i + w], p7 = m[i + w - 1], p8 = m[i - 1], p9 = m[i - w - 1];
          const B = p2 + p3 + p4 + p5 + p6 + p7 + p8 + p9;
          if (B < 2 || B > 6) continue;
          const A = (!p2 && p3) + (!p3 && p4) + (!p4 && p5) + (!p5 && p6) + (!p6 && p7) + (!p7 && p8) + (!p8 && p9) + (!p9 && p2);
          if (A !== 1) continue;
          if (step === 0 ? (p2 * p4 * p6 || p4 * p6 * p8) : (p2 * p4 * p8 || p2 * p6 * p8)) continue;
          del.push(i);
        }
        if (del.length) { changed = true; for (const i of del) m[i] = 0; }
      }
    }
  }
  /* Skelett → Striche. Nachbarn ohne „Treppen-Dreiecke“: diagonal nur, wenn kein gemeinsamer gerader Nachbar da ist */
  function trace(c, spur) {
    const { m, cw: w, ch: h } = c;
    const D8 = [[1, 0], [0, 1], [-1, 0], [0, -1], [1, 1], [-1, 1], [-1, -1], [1, -1]];
    const nbs = (i) => {
      const x = i % w, y = (i - x) / w, out = [];
      for (const [dx, dy] of D8) {
        const xx = x + dx, yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= w || yy >= h || !m[yy * w + xx]) continue;
        if (dx && dy && (m[y * w + xx] || m[yy * w + x])) continue;
        out.push(yy * w + xx);
      }
      return out;
    };
    const deg = (i) => nbs(i).length;
    // kurze Ästchen (Verdünnungsfehler) abschneiden
    for (let pass = 0; pass < 2; pass++) {
      for (let i = 0; i < m.length; i++) {
        if (!m[i] || deg(i) !== 1) continue;
        const path = [i];
        let prev = -1, cur = i, ok = false;
        while (path.length <= spur) {
          const nx = nbs(cur).filter(q => q !== prev);
          if (nx.length !== 1) { ok = nx.length > 1; break; }
          prev = cur; cur = nx[0];
          if (deg(cur) >= 3) { ok = true; break; }
          path.push(cur);
        }
        if (ok && path.length <= spur) for (const q of path) m[q] = 0;
      }
    }
    const used = new Set();
    const ek = (a, b) => a < b ? a * 1e7 + b : b * 1e7 + a;
    const P = (i) => ({ x: i % w, y: Math.floor(i / w) });
    const walk = (start) => {
      const pts = [start];
      let cur = start, dx = 0, dy = 0;
      for (;;) {
        const opts = nbs(cur).filter(q => !used.has(ek(cur, q)));
        if (!opts.length) break;
        let best = opts[0], bs = -Infinity;
        if (dx || dy) for (const q of opts) {
          // Richtung über ein paar Pixel voraus (einzelne Pixel sind zu grob)
          const a = P(q);
          const b = P(cur), ux = a.x - b.x, uy = a.y - b.y;
          const sc = (ux * dx + uy * dy) / (Math.hypot(ux, uy) * Math.hypot(dx, dy) || 1);
          if (sc > bs) { bs = sc; best = q; }
        }
        // an einer Kreuzung nur geradeaus weiter (wie ein Stift); scharfe Abzweigung = neuer Strich
        if (pts.length > 2 && nbs(cur).length >= 3 && bs < -0.2) break;
        used.add(ek(cur, best));
        // Richtung über die letzten Schritte gemittelt (Treppen glätten)
        const k = pts.length >= 4 ? pts[pts.length - 4] : pts[0];
        const a = P(best), b = P(k);
        dx = a.x - b.x; dy = a.y - b.y;
        pts.push(best);
        cur = best;
      }
      return pts;
    };
    const strokes = [];
    const ends = [];
    for (let i = 0; i < m.length; i++) if (m[i] && deg(i) === 1) ends.push(i);
    ends.sort((a, b) => (a % w) - (b % w) || a - b);
    for (const e of ends) { if (nbs(e).every(q => used.has(ek(e, q)))) continue; strokes.push(walk(e)); }
    for (let i = 0; i < m.length; i++) {
      if (!m[i]) continue;
      const nb = nbs(i);
      if (!nb.length) { if (!strokes.some(s => s.includes(i))) strokes.push([i]); continue; }   // einzelner Punkt
      if (nb.some(q => !used.has(ek(i, q)))) strokes.push(walk(i));                             // Schleifen (0, 8 …)
    }
    // vereinfachen (Douglas-Peucker) und in Punkte umwandeln
    return strokes.filter(s => s.length).map(s => rdp(s.map(P), 0.75));
  }
  function rdp(pts, eps) {
    if (pts.length < 3) return pts;
    const keep = new Uint8Array(pts.length);
    keep[0] = keep[pts.length - 1] = 1;
    const st = [[0, pts.length - 1]];
    while (st.length) {
      const [a, b] = st.pop();
      let md = 0, mi = -1;
      const A = pts[a], B = pts[b], L = Math.hypot(B.x - A.x, B.y - A.y);
      // geschlossene Schleife (Anfang = Ende, z.B. 0): Abstand zum Anfangspunkt statt zur Geraden
      for (let i = a + 1; i < b; i++) { const d = L < 1 ? Math.hypot(pts[i].x - A.x, pts[i].y - A.y) : Math.abs((B.x - A.x) * (A.y - pts[i].y) - (A.x - pts[i].x) * (B.y - A.y)) / L; if (d > md) { md = d; mi = i; } }
      if (md > eps && mi > 0) { keep[mi] = 1; st.push([a, mi], [mi, b]); }
    }
    return pts.filter((_, i) => keep[i]);
  }

  /* ---------------------------------------------------------- Nach einer Unbekannten auflösen (seit 1.27)
   * Formel umstellen wie von Hand: U = R·I nach I → I = U/R, 2x + 3y = 12 nach y → y = (12 − 2x)/3,
   * a·x² + b·x + c = 0 nach x → Lösungsformel. Weg: (1) ist die Gleichung in der Unbekannten ein Polynom bis Grad 2
   * (Koeffizienten dürfen andere Buchstaben enthalten), Terme sammeln und linear bzw. mit der Mitternachtsformel lösen;
   * (2) sonst, wenn die Unbekannte genau einmal vorkommt, Schritt für Schritt umkehren (+ ↔ −, · ↔ :, Potenz ↔ Wurzel,
   * Wurzel ↔ Quadrat, a^x ↔ Logarithmus, ln ↔ e^, sin ↔ arcsin …). Ergebnis vereinfacht (Zahlen als Brüche, gleiche
   * Terme zusammen, Faktoren gekürzt). Ohne DOM – geprüft mit tests/mathink/aufloesen-test.js. */
  const SymErr = (m) => Object.assign(new Error(m), { sym: true });
  const gcd = (a, b) => { a = Math.abs(a); b = Math.abs(b); while (b) [a, b] = [b, a % b]; return a || 1; };
  const N = (p, q = 1) => {
    if (q < 0) { p = -p; q = -q; }
    if (!Number.isInteger(p) || !Number.isInteger(q) || Math.abs(p) > 1e12 || q > 1e12) return { k: 'n', p: p / q, q: 1 };
    const g = gcd(p, q); return { k: 'n', p: p / g, q: q / g };
  };
  const isN = (n, p) => n.k === 'n' && (p === undefined || (n.p === p && n.q === 1));
  const V = (n) => ({ k: 'v', n });
  function symParse(T) {
    T = T || [];
    let i = 0;
    const FN = /^(sin|cos|tan|ln|log)\($/;
    const starts = (t) => t != null && (typeof t === 'object' ? ['frac', 'sqrt', 'root'].includes(t.t) : /^[0-9.]$|^[A-Za-zπ]$|^\($/.test(t) || FN.test(t));
    const expr = () => {
      const terms = [term()];
      while (T[i] === '+' || T[i] === '−' || T[i] === '-') { const op = T[i++]; const t = term(); terms.push(op === '+' ? t : { k: 'neg', a: t }); }
      return terms.length === 1 ? terms[0] : { k: '+', a: terms };
    };
    const term = () => {
      let f = [unary()];
      for (;;) {
        const t = T[i];
        if (t === '×' || t === '·' || t === '*') { i++; f.push(unary()); }
        else if (t === '÷' || t === '/' || t === ':') { i++; const d = unary(); f = [{ k: '/', a: f.length === 1 ? f[0] : { k: '*', a: f }, b: d }]; }
        else if (starts(t)) f.push(postfix());
        else break;
      }
      return f.length === 1 ? f[0] : { k: '*', a: f };
    };
    const unary = () => { if (T[i] === '−' || T[i] === '-') { i++; return { k: 'neg', a: unary() }; } if (T[i] === '+') { i++; return unary(); } return postfix(); };
    const postfix = () => { let a = primary(); while (T[i] && typeof T[i] === 'object' && T[i].t === 'pow') a = { k: '^', a, b: symParse(T[i++].a) }; return a; };
    const primary = () => {
      const t = T[i];
      if (t == null) throw SymErr('Die Gleichung ist unvollständig');
      if (typeof t === 'object') {
        i++;
        if (t.t === 'frac') return { k: '/', a: symParse(t.a), b: symParse(t.b) };
        if (t.t === 'sqrt') return { k: 'fn', f: 'sqrt', a: symParse(t.a) };
        if (t.t === 'root') return { k: '^', a: symParse(t.a), b: { k: '/', a: N(1), b: symParse(t.n) } };
        throw SymErr('Dieser Teil lässt sich nicht umstellen');
      }
      if (/^[0-9.]$/.test(t)) {
        let s = '';
        while (/^[0-9.]$/.test(T[i] || '')) s += T[i++];
        const [w, f = ''] = s.split('.');
        if (s.split('.').length > 2) throw SymErr('Zahl „' + s + '“ nicht verstanden');
        return N(+((w || '0') + f), Math.pow(10, f.length));
      }
      if (t === '(') { i++; const a = expr(); if (T[i] === ')') i++; return a; }
      const m = FN.exec(t);
      if (m) { i++; const a = expr(); if (T[i] === ')') i++; return { k: 'fn', f: m[1], a }; }
      if (t === 'π' || t === 'e') { i++; return { k: 'c', n: t }; }
      if (/^[A-Za-z]$/.test(t)) { i++; return V(t); }
      throw SymErr('Zeichen „' + t + '“ nicht verstanden');
    };
    if (!T.length) return N(0);
    const r = expr();
    if (i < T.length) throw SymErr('Zeichen „' + (typeof T[i] === 'string' ? T[i] : '…') + '“ an dieser Stelle nicht verstanden');
    return r;
  }
  const has = (n, v) => n.k === 'v' ? n.n === v : n.k === '+' || n.k === '*' ? n.a.some(x => has(x, v)) : n.k === '/' || n.k === '^' || n.k === '±' ? has(n.a, v) || has(n.b, v) : n.k === 'neg' || n.k === 'fn' ? has(n.a, v) : false;
  const count = (n, v) => n.k === 'v' ? +(n.n === v) : n.k === '+' || n.k === '*' ? n.a.reduce((s, x) => s + count(x, v), 0) : n.k === '/' || n.k === '^' || n.k === '±' ? count(n.a, v) + count(n.b, v) : n.k === 'neg' || n.k === 'fn' ? count(n.a, v) : 0;
  const lettersOf = (n, out = new Set()) => { if (n.k === 'v') out.add(n.n); for (const x of n.k === '+' || n.k === '*' ? n.a : [n.a, n.b]) if (x && typeof x === 'object') lettersOf(x, out); return out; };
  /* Schlüssel zum Vergleichen (gleiche Terme/Faktoren erkennen) */
  const key = (n) => symText(n);

  /* ---- Vereinfachen */
  const add = (...a) => simp({ k: '+', a });
  const mul = (...a) => simp({ k: '*', a });
  const div = (a, b) => simp({ k: '/', a, b });
  const pow = (a, b) => simp({ k: '^', a, b });
  const neg = (a) => simp({ k: 'neg', a });
  const fn = (f, a) => simp({ k: 'fn', f, a });
  const nAdd = (x, y) => N(x.p * y.q + y.p * x.q, x.q * y.q);
  const nMul = (x, y) => N(x.p * y.p, x.q * y.q);
  /* Term → [Zahlfaktor, Rest-Faktoren] */
  const coefOf = (t) => {
    if (t.k === 'n') return [t, []];
    if (t.k === 'neg') { const [c, r] = coefOf(t.a); return [N(-c.p, c.q), r]; }
    if (t.k === '*') { let c = N(1); const r = []; for (const f of t.a) { if (f.k === 'n') c = nMul(c, f); else r.push(f); } return [c, r]; }
    return [N(1), [t]];
  };
  const fromCoef = (c, r) => {
    if (c.p === 0) return N(0);
    const rest = r.length === 0 ? null : r.length === 1 ? r[0] : { k: '*', a: r };
    if (!rest) return c;
    if (c.p === 1 && c.q === 1) return rest;
    if (c.p === -1 && c.q === 1) return { k: 'neg', a: rest };
    if (c.q !== 1 && rest) { const top = Math.abs(c.p) === 1 ? rest : { k: '*', a: [N(Math.abs(c.p)), ...(rest.k === '*' ? rest.a : [rest])] }; const q = { k: '/', a: top, b: N(c.q) }; return c.p < 0 ? { k: 'neg', a: q } : q; }
    if (c.p < 0) return { k: 'neg', a: { k: '*', a: [N(-c.p), ...(rest.k === '*' ? rest.a : [rest])] } };
    return { k: '*', a: [c, ...(rest.k === '*' ? rest.a : [rest])] };
  };
  /* Faktor → [Basis, Hochzahl (Zahl)] */
  const baseExp = (f) => f.k === '^' && f.b.k === 'n' ? [f.a, f.b] : [f, N(1)];
  function simp(n) {
    switch (n.k) {
      case 'n': case 'v': case 'c': return n;
      case 'neg': {
        const a = simp(n.a);
        if (a.k === 'n') return N(-a.p, a.q);
        if (a.k === 'neg') return a.a;
        if (a.k === '+') return simp({ k: '+', a: a.a.map(t => ({ k: 'neg', a: t })) });
        if (a.k === '±') return { k: '±', a: simp({ k: 'neg', a: a.a }), b: a.b };   // −(p ± q) = −p ± q
        const [c, r] = coefOf(a);
        return fromCoef(N(-c.p, c.q), r);
      }
      case '+': {
        const terms = [];
        for (const t0 of n.a) { const t = simp(t0); if (t.k === '+') terms.push(...t.a); else terms.push(t); }
        let c = N(0);
        const groups = new Map();
        for (const t of terms) {
          if (t.k === 'n') { c = nAdd(c, t); continue; }
          const [k0, r] = coefOf(t);
          const kk = r.map(key).join('·');
          const g = groups.get(kk);
          if (g) g.c = nAdd(g.c, k0); else groups.set(kk, { c: k0, r });
        }
        const out = [];
        for (const g of groups.values()) { if (g.c.p !== 0) out.push(fromCoef(g.c, g.r)); }
        if (c.p !== 0) out.push(c);
        if (!out.length) return N(0);
        // wie von Hand: positive Glieder zuerst (12 − 3y statt −3y + 12)
        const pos = out.filter(t => coefOf(t)[0].p > 0), negs = out.filter(t => coefOf(t)[0].p <= 0);
        const all = [...pos, ...negs];
        return all.length === 1 ? all[0] : { k: '+', a: all };
      }
      case '*': {
        let fs = [];
        for (const f0 of n.a) { const f = simp(f0); if (f.k === '*') fs.push(...f.a); else fs.push(f); }
        // Brüche zusammenfassen: a · (b / c) = (a·b) / c
        const dens = [];
        fs = fs.map(f => { if (f.k === '/') { dens.push(f.b); return f.a; } return f; }).flatMap(f => f.k === '*' ? f.a : [f]);
        if (dens.length) return div(mul(...fs), mul(...dens));
        let c = N(1), sign = 1;
        const bases = new Map();
        for (let f of fs) {
          if (f.k === 'neg') { sign = -sign; f = f.a; if (f.k === '*') { for (const g of f.a) fs.push(g); continue; } }
          if (f.k === 'n') { c = nMul(c, f); continue; }
          const [b, e] = baseExp(f);
          const kb = key(b), g = bases.get(kb);
          if (g) g.e = nAdd(g.e, e); else bases.set(kb, { b, e });
        }
        if (c.p === 0) return N(0);
        const r = [];
        for (const { b, e } of bases.values()) { if (e.p === 0) continue; r.push(e.p === 1 && e.q === 1 ? b : simp({ k: '^', a: b, b: e })); }
        r.sort((x, y) => rank(x) - rank(y));
        return fromCoef(N(sign * c.p, c.q), r);
      }
      case '/': {
        let a = simp(n.a), b = simp(n.b);
        if (isN(b, 0)) throw SymErr('Division durch 0');
        if (isN(a, 0)) return N(0);
        // Summen mit Brüchen auf einen Bruch bringen (nur in Doppelbrüchen): 1/(1/f − 1/b) = f·b/(b − f)
        const oneFrac = (x) => {
          if (x.k !== '+' || !x.a.some(t => t.k === '/' || (t.k === 'neg' && t.a.k === '/'))) return x;
          const parts = x.a.map(t => t.k === '/' ? [t.a, t.b] : t.k === 'neg' && t.a.k === '/' ? [{ k: 'neg', a: t.a.a }, t.a.b] : [t, N(1)]);
          const den = mul(...parts.map(q => q[1]));
          const num = add(...parts.map((q, i) => mul(q[0], ...parts.filter((_, j) => j !== i).map(r => r[1]))));
          return { k: '/', a: expand(num), b: den };
        };
        a = oneFrac(a); b = oneFrac(b);
        if (a.k === '/') return div(a.a, mul(a.b, b));
        if (b.k === '/') return div(mul(a, b.b), b.a);
        if (a.k === 'n' && b.k === 'n') return N(a.p * b.q, a.q * b.p);
        // Zahlfaktoren kürzen, gleiche Faktoren kürzen
        const [ca, ra] = coefOf(a), [cb, rb] = coefOf(b);
        const c = N(ca.p * cb.q, ca.q * cb.p);
        const num = new Map(), den = new Map();
        for (const f of ra) { const [x, e] = baseExp(f); const k = key(x); const g = num.get(k); if (g) g.e = nAdd(g.e, e); else num.set(k, { b: x, e }); }
        for (const f of rb) {
          const [x, e] = baseExp(f), k = key(x), g = num.get(k);
          if (g) { const d = nAdd(g.e, N(-e.p, e.q)); if (d.p >= 0) { g.e = d; continue; } g.e = N(0); den.set(k, { b: x, e: N(-d.p, d.q) }); continue; }
          const h = den.get(k); if (h) h.e = nAdd(h.e, e); else den.set(k, { b: x, e });
        }
        const lst = (m) => [...m.values()].filter(g => g.e.p !== 0).map(g => g.e.p === 1 && g.e.q === 1 ? g.b : simp({ k: '^', a: g.b, b: g.e }));
        const nr = lst(num), dr = lst(den);
        let sign = c.p < 0 ? -1 : 1;
        const top = N(Math.abs(c.p)), bot = N(c.q);
        let T = fromCoef(top, nr);
        const B = fromCoef(bot, dr);
        if (sign < 0 && (T.k === '+' || T.k === '±')) { T = simp({ k: 'neg', a: T }); sign = 1; }   // −(q − y)/m → (y − q)/m
        // (4y − 6)/2 = 2y − 3: durch eine Zahl teilen, wenn alle Glieder ganz bleiben
        if (B.k === 'n' && B.p > 1 && (T.k === '+' || T.k === '±')) {
          const parts = T.k === '+' ? T.a : [T.a, T.b];
          const q = parts.map(t => { const [c, r] = coefOf(t); return [N(c.p, c.q * B.p), r]; });
          if (q.every(([c]) => c.q === 1)) {
            const ts = q.map(([c, r]) => fromCoef(c, r));
            const res = T.k === '+' ? simp({ k: '+', a: ts }) : { k: '±', a: simp(ts[0]), b: simp(ts[1]) };
            return sign < 0 ? simp({ k: 'neg', a: res }) : res;
          }
        }
        let q = isN(B, 1) ? T : { k: '/', a: T, b: B };
        return sign < 0 ? simp({ k: 'neg', a: q }) : q;
      }
      case '^': {
        const a = simp(n.a), b = simp(n.b);
        if (isN(b, 1)) return a;
        if (isN(b, 0)) return N(1);
        if (isN(a, 1)) return N(1);
        if (a.k === 'n' && b.k === 'n' && b.q === 1 && Math.abs(b.p) <= 64) { const p = Math.pow(a.p, Math.abs(b.p)), q = Math.pow(a.q, Math.abs(b.p)); return b.p > 0 ? N(p, q) : N(q, p); }
        if (b.k === 'n' && b.p === 1 && b.q === 2) return simp({ k: 'fn', f: 'sqrt', a });
        if (a.k === '^' && a.b.k === 'n' && b.k === 'n') return simp({ k: '^', a: a.a, b: nMul(a.b, b) });
        if (a.k === 'fn' && a.f === 'sqrt' && b.k === 'n' && b.q === 1 && b.p % 2 === 0) return simp({ k: '^', a: a.a, b: N(b.p / 2) });
        if (a.k === 'neg' && b.k === 'n' && b.q === 1) return b.p % 2 ? neg(pow(a.a, b)) : pow(a.a, b);
        if (a.k === '*' && b.k === 'n') return mul(...a.a.map(f => pow(f, b)));   // (2a)² = 4a²
        if (a.k === '/' && b.k === 'n') return div(pow(a.a, b), pow(a.b, b));
        if (b.k === 'n' && b.p < 0) return div(N(1), pow(a, N(-b.p, b.q)));
        return { k: '^', a, b };
      }
      case 'fn': {
        const a = simp(n.a);
        if (n.f === 'sqrt') {
          if (a.k === 'n' && a.p >= 0) { const r = Math.round(Math.sqrt(a.p)), s = Math.round(Math.sqrt(a.q)); if (r * r === a.p && s * s === a.q) return N(r, s); }
          if (a.k === '^' && a.b.k === 'n' && a.b.q === 1 && a.b.p === 2) return { k: 'fn', f: 'abs', a: a.a };
          // √(4b) = 2√b: Quadratzahl aus dem Zahlfaktor ziehen
          const [c, r] = coefOf(a);
          if (r.length && c.q === 1 && c.p > 1) {
            let o = 1, rest = c.p;
            for (let k = Math.floor(Math.sqrt(c.p)); k > 1; k--) if (rest % (k * k) === 0) { o = k; rest /= k * k; break; }
            if (o > 1) return simp({ k: '*', a: [N(o), { k: 'fn', f: 'sqrt', a: fromCoef(N(rest), r) }] });
          }
        }
        if ((n.f === 'ln' && a.k === 'c' && a.n === 'e') || (n.f === 'log' && isN(a, 10))) return N(1);
        if ((n.f === 'ln' || n.f === 'log') && isN(a, 1)) return N(0);
        return { k: 'fn', f: n.f, a };
      }
      case '±': return { k: '±', a: simp(n.a), b: simp(n.b) };
    }
    return n;
  }
  const rank = (f) => f.k === 'c' ? 0 : f.k === 'v' ? 1 : f.k === '^' ? 2 : f.k === 'fn' ? 3 : 4;

  /* ---- Ausgabe: LaTeX und Text */
  function symTex(n, ctx = 0) {
    const par = (s, need) => need ? `\\left(${s}\\right)` : s;
    switch (n.k) {
      case 'n': { const s = n.q === 1 ? String(+n.p.toPrecision(12)) : `\\frac{${Math.abs(n.p)}}{${n.q}}`; return n.q !== 1 && n.p < 0 ? par('-' + s, ctx >= 2) : n.p < 0 ? par(s, ctx >= 2) : s; }
      case 'v': return n.n;
      case 'c': return n.n === 'π' ? '\\pi' : 'e';
      case '+': {
        let s = '';
        n.a.forEach((t, i) => {
          const [c, r] = coefOf(t);
          if (i && c.p < 0) s += ' - ' + symTex(fromCoef(N(-c.p, c.q), r), 1);
          else s += (i ? ' + ' : '') + symTex(t, 1);
        });
        return par(s, ctx >= 2);
      }
      case '*': {
        let s = '', prev = null;
        for (const f of n.a) {
          const t = symTex(f, 2);
          if (prev && (/^[0-9]/.test(t) || (prev.k === 'n' && f.k === 'n'))) s += ' \\cdot ';
          else if (prev) s += ' ';
          s += t; prev = f;
        }
        return s;
      }
      case '/': return `\\frac{${symTex(n.a, 0)}}{${symTex(n.b, 0)}}`;
      case '^': return `${symTex(n.a, 3)}^{${symTex(n.b, 0)}}`.replace(/^(\\frac.*)\^/, (m, x) => `\\left(${x}\\right)^`);
      case 'neg': return par('-' + symTex(n.a, 2), ctx >= 2);
      case 'fn': {
        if (n.f === 'sqrt') return `\\sqrt{${symTex(n.a, 0)}}`;
        if (n.f === 'abs') return `\\left|${symTex(n.a, 0)}\\right|`;
        return `\\${n.f}\\left(${symTex(n.a, 0)}\\right)`;
      }
      case '±': return par((isN(n.a, 0) ? '' : symTex(n.a, 1) + ' ') + '\\pm ' + symTex(n.b, 2), ctx >= 2);
    }
    return '';
  }
  // Exponent/Basis klammern, wenn nötig (Text)
  function symText(n, ctx = 0) {
    const par = (s, need) => need ? `(${s})` : s;
    switch (n.k) {
      case 'n': { const s = n.q === 1 ? String(+n.p.toPrecision(12)) : `${n.p}/${n.q}`; return par(s, (n.q !== 1 && ctx >= 2) || (n.p < 0 && ctx >= 2)); }
      case 'v': return n.n;
      case 'c': return n.n;
      case '+': {
        let s = '';
        n.a.forEach((t, i) => { const [c, r] = coefOf(t); if (i && c.p < 0) s += ' − ' + symText(fromCoef(N(-c.p, c.q), r), 1); else s += (i ? ' + ' : '') + symText(t, 1); });
        return par(s, ctx >= 2);
      }
      case '*': return par(n.a.map(f => symText(f, 2)).join('·'), ctx >= 3);   // e^(3·x) (seit 1.52 geklammert)
      case '/': return par(`${symText(n.a, 2)}/${symText(n.b, 3)}`, ctx >= 2);
      case '^': return `${symText(n.a, 3)}^${symText(n.b, 3)}`;
      case 'neg': return par('−' + symText(n.a, n.a.k === '/' ? 1 : 2), ctx >= 2);
      case 'fn': return n.f === 'sqrt' ? `√(${symText(n.a)})` : n.f === 'abs' ? `|${symText(n.a)}|` : `${n.f}(${symText(n.a)})`;
      case '±': return par((isN(n.a, 0) ? '' : symText(n.a, 1) + ' ') + '± ' + symText(n.b, 2), ctx >= 2);
    }
    return '';
  }

  /* Ausmultiplizieren (Summen in Produkten, kleine ganze Potenzen von Summen), danach vereinfachen */
  function expand(n) {
    n = simp(n);
    if (n.k === '+') return simp({ k: '+', a: n.a.map(expand) });
    if (n.k === 'neg') return simp({ k: 'neg', a: expand(n.a) });
    if (n.k === '/') return simp({ k: '/', a: expand(n.a), b: n.b });
    // (a + b)ⁿ: Faktoren direkt ausmultiplizieren (seit 1.52 – simp würde a·a sonst wieder zu a² zusammenfassen → Endlosschleife)
    if (n.k === '^' && n.a.k === '+' && n.b.k === 'n' && n.b.q === 1 && n.b.p >= 2 && n.b.p <= 6) return mulOut(Array(n.b.p).fill(n.a), n);
    if (n.k === '*') return mulOut(n.a, n);
    return n;
  }
  function mulOut(factors, n) {
    {
      let terms = [N(1)];
      for (const f0 of factors) {
        const f = expand(f0), fs = f.k === '+' ? f.a : [f];
        const next = [];
        for (const t of terms) for (const g of fs) next.push(simp({ k: '*', a: [t, g] }));
        if (next.length > 400) return n;
        const sm = simp({ k: '+', a: next });   // gleich zusammenfassen – bleibt klein
        terms = sm.k === '+' ? sm.a : [sm];
        if (terms.length > 64) return n;
      }
      return simp({ k: '+', a: terms });
    }
  }
  /* ---- Polynom in v (Koeffizienten [c0, c1, c2]) oder null */
  function poly(n, v) {
    if (!has(n, v)) return [n];
    switch (n.k) {
      case 'v': return [N(0), N(1)];
      case 'neg': { const p = poly(n.a, v); return p && p.map(c => ({ k: 'neg', a: c })); }
      case '+': {
        const out = [];
        for (const t of n.a) { const p = poly(t, v); if (!p) return null; p.forEach((c, i) => { out[i] = out[i] ? { k: '+', a: [out[i], c] } : c; }); }
        return out.map(c => c || N(0));
      }
      case '*': {
        let acc = [N(1)];
        for (const f of n.a) {
          const p = poly(f, v);
          if (!p) return null;
          const out = [];
          acc.forEach((x, i) => p.forEach((y, j) => { const k = i + j; const t = { k: '*', a: [x, y] }; out[k] = out[k] ? { k: '+', a: [out[k], t] } : t; }));
          if (out.length > 3 && out.slice(3).some(c => !isN(simp(c), 0))) return null;
          acc = out.slice(0, 3);
        }
        return acc;
      }
      case '/': { if (has(n.b, v)) return null; const p = poly(n.a, v); return p && p.map(c => ({ k: '/', a: c, b: n.b })); }
      case '^': {
        if (has(n.b, v)) return null;
        const e = simp(n.b);
        if (e.k !== 'n' || e.q !== 1 || e.p < 0 || e.p > 2) return null;
        return poly({ k: '*', a: Array(e.p).fill(n.a).concat(e.p ? [] : [N(1)]) }, v);
      }
    }
    return null;
  }
  /* eine Lösung → { tex, text } */
  const out1 = (v, n) => ({ tex: `${v} = ${symTex(n)}`, text: `${v} = ${symText(n)}`, node: n });
  function solveFor(left, right, v) {
    try {
      const L = symParse(left), R = symParse(right || []);
      if (!has(L, v) && !has(R, v)) return { error: `„${v}“ kommt in der Gleichung nicht vor` };
      // (1) Polynom bis Grad 2
      const P = poly({ k: '+', a: [L, { k: 'neg', a: R }] }, v);
      if (P) {
        let [c0, c1, c2] = [0, 1, 2].map(i => simp(expand(P[i] || N(0))));
        const lead = !isN(c2, 0) ? c2 : c1;
        if (coefOf(lead)[0].p < 0) [c0, c1, c2] = [c0, c1, c2].map(c => neg(c));   // −m·x … → m·x …
        if (isN(c2, 0)) {
          if (isN(c1, 0)) return { error: `„${v}“ fällt beim Umstellen weg` };
          return { sols: [out1(v, div(neg(c0), c1))], how: 'linear' };
        }
        if (isN(c1, 0)) {
          const r = div(neg(c0), c2);
          if (r.k === 'n' && r.p < 0) return { sols: [], how: 'quadratisch' };
          if (isN(r, 0)) return { sols: [out1(v, N(0))], how: 'quadratisch' };
          return { sols: [out1(v, simp({ k: '±', a: N(0), b: fn('sqrt', r) }))], how: 'quadratisch' };
        }
        const D = simp(expand(add(pow(c1, N(2)), mul(N(-4), c2, c0))));
        if (D.k === 'n' && D.p < 0) return { sols: [], how: 'quadratisch' };
        if (isN(D, 0)) return { sols: [out1(v, div(neg(c1), mul(N(2), c2)))], how: 'quadratisch' };
        return { sols: [out1(v, div({ k: '±', a: neg(c1), b: fn('sqrt', D) }, mul(N(2), c2)))], how: 'quadratisch' };
      }
      // (2) genau einmal: Schritt für Schritt umkehren
      if (count(L, v) + count(R, v) !== 1) return { error: `„${v}“ kommt mehrmals vor und lässt sich so nicht umstellen` };
      let l = has(L, v) ? L : R, rs = [has(L, v) ? R : L];
      const map = (f) => { rs = rs.map(f); };
      for (let guard = 0; !(l.k === 'v' && l.n === v); guard++) {
        if (guard > 200) throw SymErr('zu verschachtelt');
        if (l.k === '+') { const i = l.a.findIndex(t => has(t, v)); const rest = l.a.filter((_, j) => j !== i); map(r => add(r, neg({ k: '+', a: rest }))); l = l.a[i]; }
        else if (l.k === '*') { const i = l.a.findIndex(t => has(t, v)); const rest = l.a.filter((_, j) => j !== i); map(r => div(r, mul(...rest))); l = l.a[i]; }
        else if (l.k === '/') { if (has(l.a, v)) { const b = l.b; map(r => mul(r, b)); l = l.a; } else { const a = l.a; map(r => div(a, r)); l = l.b; } }
        else if (l.k === 'neg') { map(r => neg(r)); l = l.a; }
        else if (l.k === '^') {
          if (has(l.a, v)) {
            const e = simp(l.b);
            if (e.k === 'n' && e.q === 1 && e.p % 2 === 0) rs = rs.flatMap(r => { const w = pow(r, div(N(1), e)); return [w, neg(w)]; });
            else { const ee = e; map(r => pow(r, div(N(1), ee))); }
            l = l.a;
          } else { const a = simp(l.a); map(r => a.k === 'c' && a.n === 'e' ? fn('ln', r) : isN(a, 10) ? fn('log', r) : div(fn('ln', r), fn('ln', a))); l = l.b; }
        }
        else if (l.k === 'fn') {
          const inv = { sqrt: (r) => pow(r, N(2)), ln: (r) => pow({ k: 'c', n: 'e' }, r), log: (r) => pow(N(10), r), sin: (r) => fn('arcsin', r), cos: (r) => fn('arccos', r), tan: (r) => fn('arctan', r) }[l.f];
          if (!inv) throw SymErr('„' + l.f + '“ lässt sich nicht umkehren');
          map(inv); l = l.a;
        } else throw SymErr('Dieser Teil lässt sich nicht umstellen');
      }
      // ±: zwei Lösungen, die sich nur im Vorzeichen unterscheiden, zusammen schreiben
      if (rs.length === 2 && key(simp(neg(rs[0]))) === key(rs[1])) return { sols: [out1(v, { k: '±', a: N(0), b: rs[0] })], how: 'umgekehrt' };
      const seen = new Set();
      return { sols: rs.filter(r => { const k = key(r); if (seen.has(k)) return false; seen.add(k); return true; }).map(r => out1(v, r)), how: 'umgekehrt' };
    } catch (e) {
      if (e.sym) return { error: e.message };
      throw e;
    }
  }
  /* Buchstaben (Unbekannte) in einer Rechnung, x und y zuerst */
  function varsIn(left, right) {
    const set = new Set();
    const walk = (tree) => { for (const t of tree || []) { if (typeof t === 'string') { if (/^[A-Za-z]$/.test(t) && t !== 'e') set.add(t); } else for (const x of Object.values(t)) if (Array.isArray(x)) walk(x); } };
    walk(left); walk(right);
    return [...set].sort((a, b) => (a === 'x' ? -2 : a === 'y' ? -1 : 0) - (b === 'x' ? -2 : b === 'y' ? -1 : 0) || a.localeCompare(b));
  }
  /* Wert eines Ausdrucks mit Belegung (zum Prüfen der Lösungen) */
  function symEval(n, env, sgn = 1) {
    const E = (x) => symEval(x, env, sgn);
    switch (n.k) {
      case 'n': return n.p / n.q;
      case 'v': if (!(n.n in env)) throw SymErr('kein Wert für ' + n.n); return env[n.n];
      case 'c': return n.n === 'π' ? Math.PI : Math.E;
      case '+': return n.a.reduce((s, x) => s + E(x), 0);
      case '*': return n.a.reduce((s, x) => s * E(x), 1);
      case '/': return E(n.a) / E(n.b);
      case '^': return Math.pow(E(n.a), E(n.b));
      case 'neg': return -E(n.a);
      case '±': return E(n.a) + sgn * E(n.b);
      case 'fn': { const a = E(n.a); return { sqrt: Math.sqrt, abs: Math.abs, ln: Math.log, log: Math.log10, sin: Math.sin, cos: Math.cos, tan: Math.tan, arcsin: Math.asin, arccos: Math.acos, arctan: Math.atan }[n.f](a); }
    }
    return NaN;
  }
  return { recognize, fromText, toTex, hasVar, hasUnknown, RAW, HAND, normalize, resample, greedyMatch, templates, classify, prepStroke, setUserTemplates, learnCloud, NP, fromBitmap,
    solveFor, varsIn, symParse, symEval, symTex, symText,
    // Rechenweg (mathsteps.js, 1.38): Bausteine der Algebra
    sym: { simp, expand, poly, N, has, symText, symTex, symParse, symEval } };
})();

if (typeof module !== 'undefined') module.exports = { MathInk };
