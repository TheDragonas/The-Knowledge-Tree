'use strict';
/* Seitenansicht für Word-Seiten (1.74) – „wie ein PDF-Reader“: die Seiten genau so, wie sie auf dem Papier stehen
 * (Ausschnitte der fertig umbrochenen Fläche, deshalb gleiche Zeilen, Bilder und Seitenumbrüche), wahlweise eine Seite,
 * zwei Seiten nebeneinander oder mehrere (so viele, wie in die Breite passen – wie Word „Mehrere Seiten“). Zoom (Breite,
 * ganze Seite, 5–400 %), Seitenminiaturen, Seite x von n, Suche mit Treffern, Verweise (Inhaltsverzeichnis) springen
 * zur Seite, Drucken (jede Seite ein Blatt in Papiergrösse).
 *
 *  In KnowledgeTree:  Ansicht → Seitenansicht (bzw. „Mehrere Seiten“, Statusleiste) – Ebene über der Seite, Esc schliesst.
 *  Webseite:          Exportieren → Webseite und „Speichern unter → Webseite“ einer Word-Seite – dieselbe Ansicht in
 *                     der HTML-Datei (ktReader wird als Text in die Datei geschrieben, braucht nichts von aussen).
 *
 * Die Seiten werden erst gezeichnet, wenn sie in die Nähe des sichtbaren Bereichs kommen (IntersectionObserver), und
 * weiter entfernte wieder geleert – auch lange Dokumente bleiben flüssig. Quelle: eine Kopie der Fläche (#world) mit
 * data-y0/y1 je Feld, data-pg (Seite) je Absatz und data-kbm (Textmarken) – annotate() vor dem Kopieren. */
const OfficeReader = {
  isDoc(p) { return !!(p && p.type === 'dok' && p.office && p.office.map && p.office.paperY != null && typeof OfficeView !== 'undefined'); },
  geo(p) {
    const P = OfficeView.paper(p), n = p.office.pages || 1, v = Canvas.vp;
    const vars = {};
    if (v) for (const k of ['--kt-wbase', '--kt-wfont', '--kt-pa', '--kt-lh']) { const x = v.style.getPropertyValue(k); if (x) vars[k] = x; }
    return {
      W: Math.round(P.W), H: Math.round(P.H), n, left: OfficeView.PX + 11,
      tops: Array.from({ length: n }, (_, i) => Math.round(OfficeView.pageTop(p, i) + 13)),
      bg: p.office.pageColor || '#ffffff', title: p.title || p.office.name || 'Dokument', vars,
      wsp: v && v.dataset.wsp || '', wfont: v && v.dataset.wfont || '',
    };
  },
  /* Lage der Felder und Absätze an der lebenden Fläche vermerken (vor dem Kopieren, danach cleanup) */
  annotate(p) {
    const z = Canvas.view.z || 1;
    const pg = (y) => OfficeWI.pageAt(p, OfficeWI.effY(p, y)) - 1;
    for (const b of p.boxes) {
      const e = Canvas.els.get(b.id);
      if (!e) continue;
      const r = Canvas.rects.get(b.id);
      e.setAttribute('data-y0', String(Math.floor(b.y)));
      e.setAttribute('data-y1', String(Math.ceil(b.y + (r ? r.h : e.offsetHeight || 40))));
      const t = e.querySelector('.box-text');
      if (!t || !b.ox || !/^(w|wimg|wlock|wtoc|wfl|wfb|wfn)$/.test(b.ox.k)) continue;
      const er = e.getBoundingClientRect(), ks = b.ox.k === 'w' ? OfficeWI.kids(t) : [];
      if (ks.length) for (const c of ks) c.setAttribute('data-pg', String(pg(b.y + (c.getBoundingClientRect().top - er.top) / z - 13)));
      else t.setAttribute('data-pg', String(pg(b.y)));
    }
    for (const nm of Object.keys(p.office.bm || {})) {
      const tg = OfficeWI.bmTarget(p, nm);
      if (!tg || !tg.el) continue;
      tg.el.setAttribute('data-kbm', ((tg.el.getAttribute('data-kbm') || '') + ' ' + nm).trim());
      if (!tg.el.hasAttribute('data-pg')) tg.el.setAttribute('data-pg', String(pg(tg.y)));
    }
  },
  cleanup(p) {
    for (const b of p.boxes) {
      const e = Canvas.els.get(b.id);
      if (!e) continue;
      e.removeAttribute('data-y0'); e.removeAttribute('data-y1');
      for (const x of e.querySelectorAll('[data-pg], [data-kbm]')) { x.removeAttribute('data-pg'); x.removeAttribute('data-kbm'); }
    }
  },
  /* Kopie der Fläche für die Ansicht: ohne Blätter (die Ansicht zeichnet das Papier), Ebenen ohne id, z-Reihenfolge fest */
  prep(w, live) {
    w.removeAttribute('id');
    w.className = 'kt-world';
    w.style.transform = '';
    for (const L of [...w.children]) {
      const src = L.id && document.getElementById(L.id);
      const zi = src ? getComputedStyle(src).zIndex : '';
      if (/^(layer-tools|layer-handles|layer-overlay)$/.test(L.id)) { L.remove(); continue; }
      L.style.position = 'absolute'; L.style.left = '0'; L.style.top = '0'; L.style.overflow = 'visible';
      if (zi && zi !== 'auto') L.style.zIndex = zi;
      L.removeAttribute('id');
    }
    w.querySelectorAll('.box.oblatt, .sock, .box-rs, .fimg-rs, .link-hit, .box-lock, .pkg-lock, .ui-only, [id^="layer-"]').forEach(x => { if (x.classList.contains('box') || !x.id) x.remove(); else x.removeAttribute('id'); });
    w.querySelectorAll('[contenteditable]').forEach(x => x.removeAttribute('contenteditable'));
    w.querySelectorAll('[spellcheck]').forEach(x => x.removeAttribute('spellcheck'));
    w.querySelectorAll('.sel, .editing').forEach(x => x.classList.remove('sel', 'editing'));
    void live;
    return w;
  },
  /* aktuelle Seite (Mitte der Ansicht) */
  curPage(p) {
    const P = OfficeView.paper(p), c = Canvas.viewCenter();
    return Math.max(0, Math.min((p.office.pages || 1) - 1, Math.floor((c.y - p.office.paperY) / (P.H + OfficeView.GAP))));
  },
  css() {
    if (document.getElementById('kt-rd-css')) return;
    const s = document.createElement('style');
    s.id = 'kt-rd-css';
    s.textContent = this.CSS;
    document.head.append(s);
  },
  /* ---------------------------------------------------------------- in KnowledgeTree öffnen */
  open(start) {
    const p = Canvas.page;
    if (!this.isDoc(p)) { UI.toast('Die Seitenansicht gibt es für Word-Seiten'); return null; }
    if (Canvas.editing) Canvas.stopEditing();
    if (this._ov) this._ov.close();
    Canvas.layout();
    this.css();
    const geo = this.geo(p);
    const live = $('#world');
    let w;
    try { this.annotate(p); w = live.cloneNode(true); } finally { this.cleanup(p); }
    this.prep(w, live);
    const st = Store.ui.wordPages || (Store.ui.wordPages = { mode: '1', fit: 'width', z: 1, side: false });
    if (start && start.mode) { st.mode = start.mode; st.fit = start.mode === 'n' ? null : 'width'; }
    const ov = el('div', { class: 'kt-rd-ov', role: 'dialog', 'aria-label': 'Seitenansicht' });
    document.body.append(ov);
    const prevFocus = document.activeElement;
    const api = this.core(ov, w, geo, {
      state: st, page: this.curPage(p), app: true,
      close: () => { api.destroy(); ov.remove(); this._ov = null; if (prevFocus && prevFocus.focus) try { prevFocus.focus(); } catch (e) { /* */ } },
      openLink: (h) => Backend.openLink(h),
      print: () => this.print(p, w, geo),
      onState: () => { if (typeof UiState !== 'undefined') UiState.saveSoon(); },
    });
    this._ov = api;
    return api;
  },
  /* Drucken: jede Seite ein Blatt in Papiergrösse */
  async print(p, w, geo) {
    const css = await Export.appCss();
    const pages = geo.tops.map((top, i) => {
      const c = this.slice(w, geo, i);
      return `<div class="kt-rd kt-rd-pp" style="width:${geo.W}px;height:${geo.H}px;background:${geo.bg}">${c.outerHTML}</div>`;
    }).join('');
    const html = `<!doctype html><html lang="de"><head><meta charset="utf-8"><title>${escapeHtml(geo.title)}</title><style>${css}${Export.EXPORT_CSS}${this.CSS}
@page{size:${geo.W}px ${geo.H}px;margin:0}html,body{margin:0;padding:0;background:#fff}.kt-rd-pp{position:relative;overflow:hidden;break-after:page;display:block}</style></head><body class="kt-export" data-theme="hell">${pages}</body></html>`;
    await Export.printHtml(html, geo.title);
  },
  /* Ausschnitt einer Seite (wie ktReader) – für den Druck */
  slice(src, geo, i) {
    const top = geo.tops[i], y0 = top - 60, y1 = top + geo.H + 60;
    const w = src.cloneNode(false);
    for (const L of src.children) {
      const l2 = L.cloneNode(false);
      for (const c of L.children) { const a = c.getAttribute && c.getAttribute('data-y0'); if (a != null && (+c.getAttribute('data-y1') < y0 || +a > y1)) continue; l2.append(c.cloneNode(true)); }
      w.append(l2);
    }
    w.style.transform = `translate(${-geo.left}px, ${-top}px)`;
    return w;
  },
  /* ---------------------------------------------------------------- Webseite */
  section(geo, worldHtml) {
    const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/'/g, '&#39;').replace(/</g, '&lt;');
    const vars = Object.entries(geo.vars || {}).map(([k, v]) => `${k}:${v}`).join(';').replace(/"/g, '&quot;');
    return `<div class="kt-rd kt-rd-exp" data-geo='${esc(JSON.stringify(geo))}'${geo.wsp ? ` data-wsp="${esc(geo.wsp)}"` : ''}${geo.wfont ? ' data-wfont="1"' : ''} style="${vars}"><div class="kt-rd-src" hidden>${worldHtml}</div></div>`;
  },
  script() {
    return `${this.core.toString()}\n[].forEach.call(document.querySelectorAll('.kt-rd-exp'),function(r){var s=r.querySelector('.kt-rd-src');var w=s&&s.firstElementChild;if(w)ktReader(r,w,JSON.parse(r.getAttribute('data-geo')),{});if(s)s.remove();});`;
  },

  /* ================================================================ Die Ansicht selbst (ohne Abhängigkeiten – auch in der HTML-Datei) */
  core: function ktReader(root, src, geo, opt) {
    opt = opt || {};
    var W = geo.W, H = geo.H, N = geo.n, GAP = 16;
    var st = opt.state || { mode: '1', fit: 'width', z: 1, side: false };
    if (!st.mode) st.mode = '1';
    var mk = function (tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
    var esc = function (s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;'); };
    root.classList.add('kt-rd');
    root.style.setProperty('--pw', W + 'px'); root.style.setProperty('--ph', H + 'px'); root.style.setProperty('--kt-rd-bg', geo.bg || '#fff');
    if (geo.vars) Object.keys(geo.vars).forEach(function (k) { root.style.setProperty(k, geo.vars[k]); });
    if (geo.wsp) root.setAttribute('data-wsp', geo.wsp);
    if (geo.wfont) root.setAttribute('data-wfont', '1');
    root.tabIndex = -1;
    var bar = mk('div', 'kt-rd-bar');
    bar.innerHTML = '<button type="button" data-a="side" title="Seitenminiaturen ein/aus">&#9776;</button>' +
      '<span class="kt-rd-t" title="' + esc(geo.title) + '">' + esc(geo.title) + '</span><span class="kt-rd-sep"></span>' +
      '<button type="button" data-a="prev" title="Vorherige Seite (Bild auf)">&#8249;</button><input class="kt-rd-pi" value="1" aria-label="Seite" title="Seite (Eingabe + Enter)"><span class="kt-rd-pn">von ' + N + '</span><button type="button" data-a="next" title="Nächste Seite (Bild ab)">&#8250;</button>' +
      '<span class="kt-rd-sep"></span><button type="button" data-a="m1" title="Eine Seite">1 Seite</button><button type="button" data-a="m2" title="Zwei Seiten nebeneinander">2 Seiten</button><button type="button" data-a="mn" title="Mehrere Seiten – so viele, wie in die Breite passen">Mehrere</button>' +
      '<span class="kt-rd-sep"></span><button type="button" data-a="out" title="Verkleinern (Strg + Minus)">&#8722;</button><button type="button" data-a="zv" class="kt-rd-zv" title="100 %">100 %</button><button type="button" data-a="in" title="Vergrössern (Strg + Plus, Strg + Mausrad)">+</button>' +
      '<button type="button" data-a="fw" class="kt-rd-wide" title="Seitenbreite">&#8596;</button><button type="button" data-a="fp" class="kt-rd-wide" title="Ganze Seite">&#9707;</button>' +
      '<span class="kt-rd-sep"></span><input class="kt-rd-q" type="search" placeholder="Suchen …" aria-label="Suchen" title="Suchen (Strg + F), Enter = nächster Treffer"><span class="kt-rd-qn"></span><button type="button" data-a="qp" title="Vorheriger Treffer">&#9650;</button><button type="button" data-a="qn" title="Nächster Treffer">&#9660;</button>' +
      '<span class="kt-rd-fill"></span><button type="button" data-a="print" title="Drucken (Strg + P) – jede Seite ein Blatt">Drucken</button>' +
      (opt.close ? '<button type="button" data-a="close" class="kt-rd-x" title="Schliessen (Esc)">&#10005;</button>' : '');
    var body = mk('div', 'kt-rd-body'), side = mk('div', 'kt-rd-side'), main = mk('div', 'kt-rd-main'), wrap = mk('div', 'kt-rd-pages');
    main.appendChild(wrap); body.appendChild(side); body.appendChild(main);
    root.appendChild(bar); root.appendChild(body);
    var $ = function (s) { return bar.querySelector(s); };
    var pi = $('.kt-rd-pi'), zv = $('.kt-rd-zv'), qi = $('.kt-rd-q'), qn = $('.kt-rd-qn');
    // Seite i aus der Quelle: nur die Felder, die hineinragen, an die Stelle des Blatts verschoben
    var slice = function (i) {
      var top = geo.tops[i], y0 = top - 60, y1 = top + H + 60;
      var w = src.cloneNode(false);
      for (var L = src.firstElementChild; L; L = L.nextElementSibling) {
        var l2 = L.cloneNode(false);
        for (var c = L.firstElementChild; c; c = c.nextElementSibling) {
          var a = c.getAttribute('data-y0');
          if (a != null && (+c.getAttribute('data-y1') < y0 || +a > y1)) continue;
          l2.appendChild(c.cloneNode(true));
        }
        w.appendChild(l2);
      }
      w.style.transform = 'translate(' + (-geo.left) + 'px,' + (-top) + 'px)';
      return w;
    };
    var mkPage = function (i, cls) {
      var e = mk('div', 'kt-rd-pg' + (cls || '')), inner = mk('div', 'kt-rd-in');
      e.setAttribute('data-i', i); e.appendChild(inner);
      return { el: e, inner: inner, on: false };
    };
    var pages = [], thumbs = [];
    for (var i = 0; i < N; i++) { var pg = mkPage(i); wrap.appendChild(pg.el); pages.push(pg); }
    var TZ = 130 / W;
    for (var j = 0; j < N; j++) {
      var th = mk('div', 'kt-rd-th'), tp = mkPage(j);
      tp.el.style.width = Math.round(W * TZ) + 'px'; tp.el.style.height = Math.round(H * TZ) + 'px'; tp.inner.style.transform = 'scale(' + TZ + ')';
      th.appendChild(tp.el); th.appendChild(mk('div', 'kt-rd-thn', String(j + 1)));
      th.setAttribute('data-i', j);
      side.appendChild(th); thumbs.push(tp);
    }
    var q = '', hits = [], hi = -1;
    var markIn = function (box) {
      if (!q) return;
      var ql = q.toLowerCase(), tw = document.createTreeWalker(box, NodeFilter.SHOW_TEXT, null), list = [], n;
      while ((n = tw.nextNode())) if (n.nodeValue.toLowerCase().indexOf(ql) >= 0 && n.parentNode && n.parentNode.closest('.box-text')) list.push(n);
      list.forEach(function (t) {
        var s = t.nodeValue, low = s.toLowerCase(), k = 0, f = document.createDocumentFragment(), p;
        while ((p = low.indexOf(ql, k)) >= 0) {
          if (p > k) f.appendChild(document.createTextNode(s.slice(k, p)));
          var m = document.createElement('mark'); m.className = 'kt-hit'; m.textContent = s.slice(p, p + q.length); f.appendChild(m);
          k = p + q.length;
        }
        if (k < s.length) f.appendChild(document.createTextNode(s.slice(k)));
        t.parentNode.replaceChild(f, t);
      });
    };
    var render = function (pg, i) { if (pg.on) return; pg.inner.appendChild(slice(i)); pg.on = true; markIn(pg.inner); };
    var unrender = function (pg) { if (!pg.on) return; pg.inner.innerHTML = ''; pg.on = false; };
    var io = 'IntersectionObserver' in window ? new IntersectionObserver(function (es) {
      es.forEach(function (e) { var i = +e.target.getAttribute('data-i'); if (e.isIntersecting) render(pages[i], i); else unrender(pages[i]); });
    }, { root: main, rootMargin: '100% 50%' }) : null;
    var tio = 'IntersectionObserver' in window ? new IntersectionObserver(function (es) {
      es.forEach(function (e) { var i = +e.target.getAttribute('data-i'); if (e.isIntersecting) render(thumbs[i], i); else unrender(thumbs[i]); });
    }, { root: side, rootMargin: '100% 0px' }) : null;
    pages.forEach(function (pg, i) { if (io) io.observe(pg.el); else render(pg, i); });
    thumbs.forEach(function (pg, i) { if (tio) tio.observe(pg.el); else render(pg, i); });
    var cols = function () { return st.mode === '2' ? 2 : 1; };
    var fitZ = function (fit) {
      var aw = Math.max(100, main.clientWidth - 52), ah = Math.max(100, main.clientHeight - 32), c = cols();
      var zw = (aw - (c - 1) * GAP) / (c * W);
      return fit === 'page' ? Math.min(zw, ah / H) : zw;
    };
    var Z = 1, cur = 0;
    var layout = function (keep) {
      var anchor = keep ? cur : null, frac = 0;
      if (anchor != null) { var r0 = pages[anchor].el; frac = (main.scrollTop - r0.offsetTop) / Math.max(1, r0.offsetHeight); }
      root.classList.toggle('side', !!st.side);
      if (st.fit) Z = fitZ(st.fit); else Z = Math.max(0.05, Math.min(4, +st.z || 1));
      if (!(Z > 0)) Z = 1;
      st.z = Z;
      var c = cols();
      wrap.setAttribute('data-mode', st.mode);
      wrap.style.maxWidth = st.mode === 'n' ? 'none' : Math.ceil(c * W * Z + (c - 1) * GAP + 1) + 'px';
      pages.forEach(function (pg) { pg.el.style.width = (W * Z).toFixed(1) + 'px'; pg.el.style.height = (H * Z).toFixed(1) + 'px'; pg.inner.style.transform = 'scale(' + Z + ')'; });
      zv.textContent = Math.round(Z * 100) + ' %';
      ['m1', 'm2', 'mn'].forEach(function (k) { $('[data-a=' + k + ']').classList.toggle('on', st.mode === k.slice(1)); });
      $('[data-a=fw]').classList.toggle('on', st.fit === 'width'); $('[data-a=fp]').classList.toggle('on', st.fit === 'page');
      $('[data-a=side]').classList.toggle('on', !!st.side);
      root.classList.toggle('side', !!st.side);
      if (anchor != null) main.scrollTop = pages[anchor].el.offsetTop + frac * pages[anchor].el.offsetHeight;
      if (opt.onState) opt.onState(st);
    };
    var go = function (i, smooth) {
      i = Math.max(0, Math.min(N - 1, i | 0));
      var e = pages[i].el;
      main.scrollTo({ top: Math.max(0, e.offsetTop - 12), left: st.mode === 'n' ? Math.max(0, e.offsetLeft - 20) : main.scrollLeft, behavior: smooth ? 'smooth' : 'auto' });
      setCur(i);
    };
    var setCur = function (i) {
      cur = i;
      if (document.activeElement !== pi) pi.value = String(i + 1);
      thumbs.forEach(function (t, k) { t.el.parentNode.classList.toggle('on', k === i); });
      var th = thumbs[i] && thumbs[i].el.parentNode;
      if (th && st.side) { var sr = side.getBoundingClientRect(), r = th.getBoundingClientRect(); if (r.top < sr.top || r.bottom > sr.bottom) side.scrollTop += r.top - sr.top - 20; }
    };
    var track = function () {
      var mr = main.getBoundingClientRect(), y = mr.top + Math.min(mr.height * 0.35, 200), best = cur, bd = 1e9;
      pages.forEach(function (pg, i) { var r = pg.el.getBoundingClientRect(); var d = r.top <= y && r.bottom >= y ? 0 : Math.min(Math.abs(r.top - y), Math.abs(r.bottom - y)); if (r.right < mr.left || r.left > mr.right) d += 1e6; if (d < bd) { bd = d; best = i; } });
      if (best !== cur) setCur(best);
    };
    var raf = 0;
    main.addEventListener('scroll', function () { if (!raf) raf = requestAnimationFrame(function () { raf = 0; track(); }); }, { passive: true });
    var zoom = function (z, cx, cy) {
      var mr = main.getBoundingClientRect();
      if (cx == null) { cx = mr.left + main.clientWidth / 2; cy = mr.top + main.clientHeight / 2; }
      var px = main.scrollLeft + cx - mr.left, py = main.scrollTop + cy - mr.top, z0 = Z;
      st.fit = null; st.z = Math.max(0.05, Math.min(4, z));
      layout(false);
      var k = Z / z0;
      main.scrollLeft = px * k - (cx - mr.left); main.scrollTop = py * k - (cy - mr.top);
    };
    var setMode = function (m) {
      st.mode = m;
      if (m === 'n') { st.fit = null; st.z = Math.min(Z, Math.max(0.12, 0.97 * (main.clientWidth - 52 - 2 * GAP) / (3 * W))); }
      else if (!st.fit) st.fit = 'width';
      layout(false); go(cur);
    };
    // Suche
    var countIn = function (e, ql) { var t = (e.textContent || '').toLowerCase(), n = 0, k = t.indexOf(ql); while (k >= 0) { n++; k = t.indexOf(ql, k + ql.length); } return n; };
    var find = function (s) {
      q = String(s || '').trim(); hits = []; hi = -1;
      pages.concat(thumbs).forEach(function (pg) { if (pg.on) { var i = +pg.el.getAttribute('data-i'); unrender(pg); if (pg === pages[i]) render(pg, i); } });
      if (!q) { qn.textContent = ''; return; }
      var ql = q.toLowerCase();
      [].forEach.call(src.querySelectorAll('[data-pg]'), function (e) { if (e.querySelector('[data-pg]')) return; var n = countIn(e, ql), p = +e.getAttribute('data-pg'); for (var k = 0; k < n; k++) hits.push(p); });
      qn.textContent = hits.length ? '0 / ' + hits.length : 'keine Treffer';
      if (hits.length) step(1);
    };
    var step = function (d) {
      if (!hits.length) return;
      hi = (hi + d + hits.length) % hits.length;
      var p = hits[hi], before = 0;
      for (var k = 0; k < hi; k++) if (hits[k] === p) before++;
      go(p);
      render(pages[p], p);
      var pr = pages[p].el.getBoundingClientRect();
      var ms = [].filter.call(pages[p].inner.querySelectorAll('mark.kt-hit'), function (m) { var r = m.getBoundingClientRect(); return r.bottom > pr.top && r.top < pr.bottom && r.right > pr.left && r.left < pr.right; });
      [].forEach.call(root.querySelectorAll('mark.kt-hit.cur'), function (m) { m.classList.remove('cur'); });
      var m = ms[Math.min(before, ms.length - 1)];
      if (m) { m.classList.add('cur'); var r = m.getBoundingClientRect(), mr = main.getBoundingClientRect(); main.scrollTop += r.top - mr.top - main.clientHeight / 3; }
      qn.textContent = (hi + 1) + ' / ' + hits.length;
    };
    var target = function (name) { var e = null; try { e = src.querySelector('[data-kbm~="' + name.replace(/["\\]/g, '') + '"]'); } catch (x) { e = null; } while (e && !e.hasAttribute('data-pg')) e = e.parentElement; return e ? +e.getAttribute('data-pg') : null; };
    var print = function () { if (opt.print) { opt.print(); return; } pages.forEach(function (pg, i) { render(pg, i); }); window.print(); };
    bar.addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b) return;
      var a = b.getAttribute('data-a');
      if (a === 'side') { st.side = !st.side; layout(true); setCur(cur); }
      else if (a === 'prev') go(cur - (st.mode === '2' ? 2 : 1));
      else if (a === 'next') go(cur + (st.mode === '2' ? 2 : 1));
      else if (a === 'm1' || a === 'm2' || a === 'mn') setMode(a.slice(1));
      else if (a === 'in') zoom(Z * 1.2); else if (a === 'out') zoom(Z / 1.2); else if (a === 'zv') zoom(1);
      else if (a === 'fw' || a === 'fp') { st.fit = a === 'fw' ? 'width' : 'page'; if (st.mode === 'n') st.mode = '1'; layout(false); go(cur); }
      else if (a === 'qn') step(1); else if (a === 'qp') step(-1);
      else if (a === 'print') print();
      else if (a === 'close' && opt.close) opt.close();
    });
    pi.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); go((parseInt(pi.value, 10) || 1) - 1); pi.blur(); } });
    pi.addEventListener('blur', function () { pi.value = String(cur + 1); });
    qi.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); if (qi.value.trim() !== q) find(qi.value); else step(e.shiftKey ? -1 : 1); } else if (e.key === 'Escape' && qi.value) { e.stopPropagation(); qi.value = ''; find(''); } });
    side.addEventListener('click', function (e) { var t = e.target.closest('.kt-rd-th'); if (t) go(+t.getAttribute('data-i')); });
    main.addEventListener('click', function (e) {
      var a = e.target.closest('a[href]'); if (!a) return;
      var h = a.getAttribute('href'); e.preventDefault();
      if (h.charAt(0) === '#') { var p = target(decodeURIComponent(h.slice(1))); if (p != null) go(p); return; }
      if (a.hasAttribute('download')) { var x = document.createElement('a'); x.href = h; x.download = a.getAttribute('download'); x.click(); return; }
      if (opt.openLink) opt.openLink(h); else window.open(h, '_blank', 'noopener');
    });
    main.addEventListener('wheel', function (e) { if (!e.ctrlKey && !e.metaKey) return; e.preventDefault(); e.stopPropagation(); zoom(Z * Math.exp(-e.deltaY * (e.deltaMode ? 0.05 : 0.002)), e.clientX, e.clientY); }, { passive: false });
    var onKey = function (e) {
      if (!root.isConnected || !root.offsetParent && getComputedStyle(root).position !== 'fixed') return;
      var inInput = e.target && /^(INPUT|TEXTAREA)$/.test(e.target.tagName);
      var k = e.key, ctl = e.ctrlKey || e.metaKey, hit = true;
      if (ctl && (k === 'f' || k === 'F')) { qi.focus(); qi.select(); }
      else if (ctl && (k === 'p' || k === 'P')) print();
      else if (ctl && (k === '+' || k === '=')) zoom(Z * 1.2);
      else if (ctl && k === '-') zoom(Z / 1.2);
      else if (ctl && k === '0') zoom(1);
      else if (k === 'Escape' && opt.close && !inInput) opt.close();
      else if (inInput) hit = false;
      else if (k === 'PageDown' || (k === 'ArrowRight' && st.mode !== '1')) go(cur + (st.mode === '2' ? 2 : 1));
      else if (k === 'PageUp' || (k === 'ArrowLeft' && st.mode !== '1')) go(cur - (st.mode === '2' ? 2 : 1));
      else if (k === 'Home' && !ctl) go(0);
      else if (k === 'End' && !ctl) go(N - 1);
      else hit = false;
      if (hit) { e.preventDefault(); e.stopPropagation(); }
      else if (opt.app) e.stopPropagation();
    };
    // in KnowledgeTree: Tasten innerhalb der Ansicht an der Ansicht, ausserhalb (Fokus verloren) ebenfalls hierher – nie an die Seite darunter
    var docKey = function (e) { if (root.contains(e.target)) return; onKey(e); if (opt.app) e.stopPropagation(); };
    if (opt.app) root.addEventListener('keydown', onKey);
    document.addEventListener('keydown', opt.app ? docKey : onKey, true);
    var ro = 'ResizeObserver' in window ? new ResizeObserver(function () { if (main.clientWidth && st.fit) layout(true); }) : null;
    if (ro) ro.observe(main);
    window.addEventListener('beforeprint', function () { pages.forEach(function (pg, i) { render(pg, i); }); });
    layout(false);
    if (opt.page) setTimeout(function () { go(opt.page); }, 0); else setCur(0);
    if (opt.app) root.focus();
    return {
      go: go, mode: setMode, zoom: function (z) { zoom(z); }, fit: function (f) { st.fit = f; layout(false); }, find: function (s) { qi.value = s; find(s); }, next: function () { step(1); },
      state: function () { return { mode: st.mode, z: Z, fit: st.fit, cur: cur, n: N, hits: hits.length, hi: hi, rendered: pages.filter(function (p) { return p.on; }).length }; },
      close: function () { if (opt.close) opt.close(); },
      destroy: function () { document.removeEventListener('keydown', opt.app ? docKey : onKey, true); if (io) io.disconnect(); if (tio) tio.disconnect(); if (ro) ro.disconnect(); },
    };
  },

  CSS: `
.kt-rd{position:relative;display:flex;flex-direction:column;background:#e6e6ea;color:#201f1e;font:13px "Segoe UI",system-ui,sans-serif;min-height:0;outline:none}
.kt-rd-ov{position:fixed;inset:0;z-index:9000}
.kt-rd-exp{height:100vh;height:100dvh}
.kt-rd-bar{display:flex;align-items:center;gap:3px;flex-wrap:wrap;padding:5px 10px;background:#fff;border-bottom:1px solid #d2d0ce;flex:none;z-index:2;box-shadow:0 1px 4px rgba(0,0,0,.06)}
.kt-rd-bar button{height:28px;min-width:28px;padding:0 8px;border:1px solid transparent;border-radius:5px;background:transparent;color:#323130;font:inherit;cursor:pointer;white-space:nowrap}
.kt-rd-bar button:hover{background:#edebe9}
.kt-rd-bar button.on{background:#dbe8f7;border-color:#9ec1ea;color:#0f4a8a}
.kt-rd-bar input{height:26px;box-sizing:border-box;border:1px solid #c8c6c4;border-radius:5px;padding:0 6px;font:inherit;background:#fff;color:#201f1e}
.kt-rd-pi{width:46px;text-align:center}.kt-rd-pn{color:#605e5c;margin:0 2px}
.kt-rd-q{width:170px}.kt-rd-qn{color:#605e5c;min-width:4ch;font-size:12px}
.kt-rd-zv{min-width:58px!important}
.kt-rd-sep{width:1px;height:20px;background:#d2d0ce;margin:0 5px}
.kt-rd-t{font-weight:600;margin:0 4px;max-width:24ch;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.kt-rd-fill{flex:1}
.kt-rd-x{font-size:15px}
.kt-rd-body{flex:1;display:flex;min-height:0}
.kt-rd-side{width:170px;flex:none;overflow:auto;background:#f3f2f1;border-right:1px solid #d2d0ce;padding:12px 0;display:none}
.kt-rd.side .kt-rd-side{display:block}
.kt-rd-th{margin:0 auto 12px;width:max-content;cursor:pointer;text-align:center;font-size:11px;color:#605e5c}
.kt-rd-th .kt-rd-pg{margin:0 auto 3px}
.kt-rd-th.on .kt-rd-pg{outline:3px solid #2f6fd0;outline-offset:1px}
.kt-rd-th.on .kt-rd-thn{color:#0f4a8a;font-weight:600}
.kt-rd-main{flex:1;overflow:auto;overflow-y:scroll;position:relative;min-width:0}
.kt-rd-pages{display:flex;flex-wrap:wrap;justify-content:center;align-content:flex-start;gap:16px;margin:0 auto;padding:16px 24px 48px;box-sizing:content-box}
.kt-rd-pg{position:relative;overflow:hidden;background:var(--kt-rd-bg,#fff);box-shadow:0 1px 3px rgba(0,0,0,.25),0 4px 14px rgba(0,0,0,.1);flex:none}
.kt-rd-in{position:absolute;left:0;top:0;width:var(--pw);height:var(--ph);transform-origin:0 0;overflow:hidden}
.kt-rd .kt-world{position:absolute;left:0;top:0;transform-origin:0 0}
.kt-rd .kt-world>*{position:absolute;left:0;top:0}
.kt-rd .box{box-shadow:none!important;outline:none!important}
.kt-rd .box.plain,.kt-rd .box.ow,.kt-rd .box.owb:not([style*="border-color: rgb"]){border-color:transparent}
.kt-rd .box.ow,.kt-rd .box.plain{background:transparent}
.kt-rd .box-bar,.kt-rd .box-grip,.kt-rd .box-rs,.kt-rd .fimg-rs,.kt-rd .box-lock,.kt-rd .fimg-play{visibility:hidden!important}
.kt-rd .box-text,.kt-rd .fimg{cursor:auto}
.kt-rd .box-text a{cursor:pointer}
.kt-rd .fimg{box-shadow:none;outline:none}
.kt-rd mark.kt-hit{background:#ffe066;color:inherit;border-radius:2px}
.kt-rd mark.kt-hit.cur{background:#ff9632}
.kt-rd-pp .kt-world{position:absolute;left:0;top:0}
.kt-rd-pp .kt-world>*{position:absolute;left:0;top:0}
@media (max-width:760px){.kt-rd-q{width:96px}.kt-rd-bar .kt-rd-wide,.kt-rd-t,.kt-rd-bar [data-a=m2]{display:none}.kt-rd-pages{padding:10px 8px 40px}}
@media print{html,body{height:auto!important;overflow:visible!important}.kt-rd-bar,.kt-rd-side,.kt-nav,.kt-top,.kt-zoom{display:none!important}.kt-rd,.kt-rd-exp{height:auto;display:block;background:#fff}.kt-rd-body,.kt-rd-main{display:block;overflow:visible}.kt-rd-pages{display:block;padding:0;max-width:none!important}.kt-rd-pg{width:var(--pw)!important;height:var(--ph)!important;box-shadow:none;margin:0;break-after:page}.kt-rd-in{transform:none!important}}`,
};
if (typeof module !== 'undefined') module.exports = { OfficeReader };
