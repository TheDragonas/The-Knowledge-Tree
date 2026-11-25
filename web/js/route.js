'use strict';
/* Verbindungen um Hindernisse herumführen (seit 1.9, überarbeitet)
 * Felder, Bilder, Strukturformeln, Tabellen, Diagramme und Pakete sind Hindernisse – auch die beiden eigenen Felder: eine Linie
 * verlässt ihr Feld immer senkrecht nach aussen und läuft nie zurück hinter ein Feld; der Pfeil kommt immer von aussen an.
 * Eine Verbindung behält ihre gewohnte Form (gerade, Kurve, Winkel), solange sie frei ist und Abstand hält (CLEAR).
 * Sonst wird ein Weg mit Abstand GAP gesucht:
 *  - gerade / Kurve: kürzester Weg über die Ecken der (mit Abstand vergrösserten) Hindernisse (Sichtbarkeitsgraph + A*),
 *    bei der Kurve mit runden Bögen an den Knicken;
 *  - Winkel: rechtwinkliger Weg auf einem dünnen Raster aus den Hinderniskanten (A* mit Strafe für jeden Knick).
 * Reine Geometrie ohne DOM (in Node testbar). */
const Route = {
  GAP: 14,      // Abstand eines gesuchten Weges zu Hindernissen (Kurve: mehr, weil die Bögen die Ecken abschneiden)
  CLEAR: 10,    // so viel Abstand muss die gewohnte Form halten, sonst wird ausgewichen
  gapFor(style) { return style === 'kurve' ? 24 : this.GAP; },
  /* kürzester Abstand Punkt – Rechteck (0 auf dem Rand oder innen) */
  distToRect(p, r) { const dx = Math.max(r.x - p.x, 0, p.x - (r.x + r.w)), dy = Math.max(r.y - p.y, 0, p.y - (r.y + r.h)); return Math.hypot(dx, dy); },
  /* Abstand entlang der Richtung n von p bis zum Rechteck r (Infinity, wenn der Strahl es nicht trifft) */
  rayDist(p, n, r) {
    if (n.x) { if (p.y <= r.y || p.y >= r.y + r.h) return Infinity; const d = n.x > 0 ? r.x - p.x : p.x - (r.x + r.w); return d >= -0.5 ? Math.max(0, d) : Infinity; }
    if (p.x <= r.x || p.x >= r.x + r.w) return Infinity;
    const d = n.y > 0 ? r.y - p.y : p.y - (r.y + r.h);
    return d >= -0.5 ? Math.max(0, d) : Infinity;
  },
  /* Abstand zwischen zwei Rechtecken (0, wenn sie sich berühren oder überlappen) */
  rectDist(a, b) { return Math.hypot(Math.max(0, b.x - (a.x + a.w), a.x - (b.x + b.w)), Math.max(0, b.y - (a.y + a.h), a.y - (b.y + b.h))); },
  /* senkrechtes Anfangs-/Endstück: so lang wie möglich, aber höchstens bis zur Hälfte des Abstands zum nächsten Feld davor.
   * near: das andere eigene Feld – zählt schon, wenn es nur schräg davor steht (die Linie soll in der Mitte der Lücke laufen) */
  stubPt(p, n, len, gap, obs, near) {
    let t = len;
    for (const r of obs) { const d = this.rayDist(p, n, r); if (d < t + gap) t = Math.min(t, d / 2); }
    if (near) {
      const d = n.x > 0 ? near.x - p.x : n.x < 0 ? p.x - (near.x + near.w) : n.y > 0 ? near.y - p.y : p.y - (near.y + near.h);
      const side = n.x ? Math.max(0, near.y - p.y, p.y - (near.y + near.h)) : Math.max(0, near.x - p.x, p.x - (near.x + near.w));
      if (d >= 0 && d < t + gap && side < 3 * len) t = Math.min(t, d / 2);
    }
    return t < 3 ? { x: p.x, y: p.y } : { x: p.x + n.x * t, y: p.y + n.y * t };
  },
  /* Polylinie ohne die ersten/letzten k Längeneinheiten */
  trim(pts, k) {
    const cut = (arr) => {
      let rest = k;
      for (let i = 1; i < arr.length; i++) {
        const L = Math.hypot(arr[i].x - arr[i - 1].x, arr[i].y - arr[i - 1].y);
        if (L >= rest) { const f = L ? rest / L : 0; return [{ x: arr[i - 1].x + (arr[i].x - arr[i - 1].x) * f, y: arr[i - 1].y + (arr[i].y - arr[i - 1].y) * f }, ...arr.slice(i)]; }
        rest -= L;
      }
      return [];
    };
    const a = cut(pts);
    return a.length ? cut(a.slice().reverse()).reverse() : [];
  },
  /* Hält die gewohnte Form Abstand? (fremde Felder: CLEAR; eigene Felder: nie hindurch, in der Mitte der Linie 6 px Abstand) */
  shapeBad(pts, p1, p2, raw, own) {
    if (this.polyBlocked(pts, this.prepare(raw, [p1, p2], this.CLEAR))) return true;
    if (this.polyBlocked(pts, own)) return true;
    // Abstand zu den eigenen Feldern – stehen sie sehr nah beieinander, reicht die Mitte der Lücke
    const m = Math.min(6, own.length === 2 ? this.rectDist(own[0], own[1]) / 2 - 1 : 6);
    const mid = this.trim(pts, 22);
    return m > 0 && mid.length >= 2 && this.polyBlocked(mid, own.map(r => this.grow(r, m)));
  },

  /* schneidet die Strecke a–b das Innere des Rechtecks r (Rand zählt nicht)? – Liang-Barsky */
  hits(a, b, r, eps = 0.5) {
    const x1 = r.x + eps, y1 = r.y + eps, x2 = r.x + r.w - eps, y2 = r.y + r.h - eps;
    if (x2 <= x1 || y2 <= y1) return false;
    const dx = b.x - a.x, dy = b.y - a.y;
    let t0 = 0, t1 = 1;
    const p = [-dx, dx, -dy, dy], q = [a.x - x1, x2 - a.x, a.y - y1, y2 - a.y];
    for (let i = 0; i < 4; i++) {
      if (p[i] === 0) { if (q[i] <= 0) return false; continue; }
      const t = q[i] / p[i];
      if (p[i] < 0) { if (t > t1) return false; if (t > t0) t0 = t; }
      else { if (t < t0) return false; if (t < t1) t1 = t; }
    }
    return t1 - t0 > 1e-6;
  },
  inside(p, r, eps = 0.5) { return p.x > r.x + eps && p.x < r.x + r.w - eps && p.y > r.y + eps && p.y < r.y + r.h - eps; },
  grow(r, m) { return { x: r.x - m, y: r.y - m, w: r.w + 2 * m, h: r.h + 2 * m, id: r.id }; },
  polyBlocked(pts, obs) {
    for (let i = 1; i < pts.length; i++) for (const r of obs) if (this.hits(pts[i - 1], pts[i], r)) return true;
    return false;
  },
  /* Hindernisse für eine Verbindung vorbereiten: vergrössern; Hindernisse, in denen ein Endpunkt liegt, nur knapp oder gar nicht.
   * Eigene Felder (own) werden so weit vergrössert, wie es die Anfangs-/Endstücke erlauben (die Endpunkte bleiben draussen). */
  prepare(raw, ends, gap = this.GAP, own = []) {
    const out = [];
    for (const r of raw) {
      if (ends.some(p => this.inside(p, r, -1))) continue;           // Endpunkt liegt im Hindernis selbst
      const g = this.grow(r, gap);
      out.push(ends.some(p => this.inside(p, g)) ? this.grow(r, 2) : g);
    }
    const between = own.length === 2 ? this.rectDist(own[0], own[1]) / 2 - 1 : gap;   // Lücke zwischen den eigenen Feldern offen lassen
    for (const r of own) {
      if (ends.some(p => this.inside(p, r, 0.5))) continue;
      const m = Math.min(gap, between, ...ends.map(p => this.distToRect(p, r) - 1));
      out.push(this.grow(r, Math.max(0, m)));
    }
    return out;
  },

  /* kürzester Weg s → e um die Rechtecke herum (beliebige Winkel) */
  anyAngle(s, e, obs) {
    const blocked = (a, b) => { for (const r of obs) if (this.hits(a, b, r)) return true; return false; };
    if (!blocked(s, e)) return [s, e];
    const V = [s, e];
    for (const r of obs) {
      for (const c of [{ x: r.x, y: r.y }, { x: r.x + r.w, y: r.y }, { x: r.x, y: r.y + r.h }, { x: r.x + r.w, y: r.y + r.h }]) {
        if (!obs.some(o => o !== r && this.inside(c, o))) V.push(c);
      }
    }
    const n = V.length, g = new Float64Array(n).fill(Infinity), prev = new Int32Array(n).fill(-1), done = new Uint8Array(n);
    const h = (i) => Math.hypot(V[i].x - e.x, V[i].y - e.y);
    g[0] = 0;
    for (let it = 0; it < n; it++) {
      let u = -1, best = Infinity;
      for (let i = 0; i < n; i++) if (!done[i] && g[i] + h(i) < best) { best = g[i] + h(i); u = i; }
      if (u < 0) break;
      if (u === 1) break;
      done[u] = 1;
      for (let v = 0; v < n; v++) {
        if (done[v] || v === u) continue;
        const d = Math.hypot(V[v].x - V[u].x, V[v].y - V[u].y);
        if (g[u] + d >= g[v]) continue;
        if (blocked(V[u], V[v])) continue;
        g[v] = g[u] + d; prev[v] = u;
      }
    }
    if (prev[1] < 0) return null;
    const path = [];
    for (let i = 1; i >= 0; i = prev[i]) { path.push(V[i]); if (i === 0) break; }
    return path.reverse();
  },

  /* rechtwinkliger Weg s → e; sd/ed: Richtung beim Verlassen von s bzw. beim Ankommen in e ({x,y} Einheitsvektor) */
  ortho(s, sd, e, ed, obs) {
    const uniq = (a) => [...new Set(a.map(v => Math.round(v * 10) / 10))].sort((p, q) => p - q);
    const xs = uniq([s.x, e.x, (s.x + e.x) / 2, ...obs.flatMap(r => [r.x, r.x + r.w])]);
    const ys = uniq([s.y, e.y, (s.y + e.y) / 2, ...obs.flatMap(r => [r.y, r.y + r.h])]);
    const X = xs.length, Y = ys.length;
    const ix = (v) => xs.indexOf(Math.round(v * 10) / 10), iy = (v) => ys.indexOf(Math.round(v * 10) / 10);
    const free = new Uint8Array(X * Y);
    for (let i = 0; i < X; i++) for (let j = 0; j < Y; j++) { const p = { x: xs[i], y: ys[j] }; free[i * Y + j] = obs.some(r => this.inside(p, r)) ? 0 : 1; }
    const segFree = (i1, j1, i2, j2) => { const m = { x: (xs[i1] + xs[i2]) / 2, y: (ys[j1] + ys[j2]) / 2 }; return !obs.some(r => this.inside(m, r)); };
    const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    const dirIdx = (d) => d.x > 0.5 ? 0 : d.x < -0.5 ? 1 : d.y > 0.5 ? 2 : 3;
    const si = ix(s.x), sj = iy(s.y), ei = ix(e.x), ej = iy(e.y);
    if (si < 0 || sj < 0 || ei < 0 || ej < 0) return null;
    const BEND = 40;
    const N = X * Y * 4, g = new Float64Array(N).fill(Infinity), prev = new Int32Array(N).fill(-1), closed = new Uint8Array(N);
    const key = (i, j, d) => (i * Y + j) * 4 + d;
    const heap = [];
    const push = (k, f) => { heap.push([f, k]); let c = heap.length - 1; while (c > 0) { const p = (c - 1) >> 1; if (heap[p][0] <= heap[c][0]) break; [heap[p], heap[c]] = [heap[c], heap[p]]; c = p; } };
    const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let c = 0; for (;;) { const l = 2 * c + 1, r = l + 1; let m = c; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === c) break; [heap[m], heap[c]] = [heap[c], heap[m]]; c = m; } } return top; };
    const hEst = (i, j) => Math.abs(xs[i] - xs[ei]) + Math.abs(ys[j] - ys[ej]);
    const d0 = dirIdx(sd), dEnd = dirIdx(ed);
    const k0 = key(si, sj, d0);
    g[k0] = 0; push(k0, hEst(si, sj));
    let goal = -1;
    while (heap.length) {
      const [, k] = pop();
      if (closed[k]) continue;
      closed[k] = 1;
      const d = k % 4, cell = (k - d) / 4, i = Math.floor(cell / Y), j = cell % Y;
      if (i === ei && j === ej) { goal = k; break; }
      for (let nd = 0; nd < 4; nd++) {
        if ((nd ^ 1) === d) continue;          // nicht umkehren
        const ni = i + DIRS[nd][0], nj = j + DIRS[nd][1];
        if (ni < 0 || nj < 0 || ni >= X || nj >= Y || !free[ni * Y + nj] || !segFree(i, j, ni, nj)) continue;
        let c = g[k] + Math.abs(xs[ni] - xs[i]) + Math.abs(ys[nj] - ys[j]) + (nd !== d ? BEND : 0);
        if (ni === ei && nj === ej && nd !== dEnd) c += BEND;
        const nk = key(ni, nj, nd);
        if (c < g[nk]) { g[nk] = c; prev[nk] = k; push(nk, c + hEst(ni, nj)); }
      }
    }
    if (goal < 0) return null;
    const pts = [];
    for (let k = goal; k >= 0; k = prev[k]) { const d = k % 4, cell = (k - d) / 4; pts.push({ x: xs[Math.floor(cell / Y)], y: ys[cell % Y] }); if (k === k0) break; }
    return this.simplify(pts.reverse());
  },
  /* gerade Zwischenpunkte entfernen */
  simplify(pts) {
    const out = [];
    for (const p of pts) {
      if (out.length && Math.abs(out[out.length - 1].x - p.x) < 0.01 && Math.abs(out[out.length - 1].y - p.y) < 0.01) continue;
      while (out.length >= 2) {
        const a = out[out.length - 2], b = out[out.length - 1];
        const cr = (b.x - a.x) * (p.y - b.y) - (b.y - a.y) * (p.x - b.x);
        const dot = (b.x - a.x) * (p.x - b.x) + (b.y - a.y) * (p.y - b.y);
        if (Math.abs(cr) < 0.01 && dot >= 0) out.pop(); else break;
      }
      out.push(p);
    }
    return out;
  },
  /* Polylinie als SVG-Pfad; r > 0: runde Bögen an den Knicken (Kurve) */
  pathD(pts, r) {
    const P = (q) => `${Math.round(q.x * 10) / 10},${Math.round(q.y * 10) / 10}`;
    if (pts.length < 2) return '';
    let d = 'M' + P(pts[0]);
    for (let i = 1; i < pts.length - 1; i++) {
      const a = pts[i - 1], v = pts[i], b = pts[i + 1];
      const la = Math.hypot(v.x - a.x, v.y - a.y), lb = Math.hypot(b.x - v.x, b.y - v.y);
      const k = Math.min(r, la / 2, lb / 2);
      if (k < 1) { d += 'L' + P(v); continue; }
      const A = { x: v.x - (v.x - a.x) / la * k, y: v.y - (v.y - a.y) / la * k }, B = { x: v.x + (b.x - v.x) / lb * k, y: v.y + (b.y - v.y) / lb * k };
      d += 'L' + P(A) + 'Q' + P(v) + ' ' + P(B);
    }
    return d + 'L' + P(pts[pts.length - 1]);
  },
  /* Punkt nach halber Länge */
  midPoint(pts) {
    let L = 0;
    for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    let h = L / 2;
    for (let i = 1; i < pts.length; i++) {
      const s = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
      if (h <= s && s > 0) return { x: pts[i - 1].x + (pts[i].x - pts[i - 1].x) * h / s, y: pts[i - 1].y + (pts[i].y - pts[i - 1].y) * h / s };
      h -= s;
    }
    return pts[pts.length - 1];
  },
  /* Weg für eine Verbindung: style 'gerade' | 'kurve' | 'winkel'; n1/n2: Aussenrichtung der Seiten; raw: Hindernisse (ohne die eigenen Felder);
   * own: die beiden eigenen Felder (für Kurve/Winkel, damit die Linie nicht zurück durchs eigene Feld läuft). Ergebnis: Polylinie oder null */
  route(style, p1, n1, p2, n2, raw, own = []) {
    // grösster Abstand, der in die Lücken passt (stehen Felder eng, lieber etwas weniger Abstand als ein Weg an der Kante)
    const gaps = style === 'kurve' ? [this.gapFor(style), this.GAP, 8] : [this.GAP, 8];
    for (let k = 0; k < gaps.length; k++) {
      const gap = gaps[k], len = gap + 8;
      // senkrecht aus dem Feld heraus und senkrecht ins Ziel hinein – kürzer, wenn gleich davor ein anderes Feld steht
      const s = this.stubPt(p1, n1, len, gap, [...raw, ...own.filter((r, i) => i !== 0)], own[1]);
      const e = this.stubPt(p2, n2, len, gap, [...raw, ...own.filter((r, i) => i !== 1)], own[0]);
      const tight = raw.some(r => { const g = this.grow(r, gap); return this.inside(s, g) || this.inside(e, g); });
      if (tight && k + 1 < gaps.length) continue;
      const obs = this.prepare(raw, [s, e], gap, own);
      const mid = style === 'winkel' ? this.ortho(s, n1, e, { x: -n2.x, y: -n2.y }, obs) : this.anyAngle(s, e, obs);
      if (!mid) { if (k + 1 < gaps.length) continue; return null; }
      const out = this.simplify([p1, ...mid, p2]);
      out.gap = gap;
      return out;
    }
    return null;
  },
};

if (typeof module !== 'undefined') module.exports = { Route };
