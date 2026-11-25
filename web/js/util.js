'use strict';
/* Hilfsfunktionen */

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

function uid(prefix = '') {
  return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function el(tag, props, ...kids) {
  const e = document.createElement(tag);
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v == null || v === false) continue;
      if (k === 'class') e.className = v;
      else if (k === 'style' && typeof v === 'object') { for (const [sk, sv] of Object.entries(v)) { if (sk.startsWith('--')) e.style.setProperty(sk, sv); else e.style[sk] = sv; } }
      else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2), v);
      else if (k === 'html') e.innerHTML = v;
      else if (k === 'text') e.textContent = v;
      else if (k === 'dataset') Object.assign(e.dataset, v);
      else e.setAttribute(k, v === true ? '' : v);
    }
  }
  for (const c of kids.flat()) {
    if (c == null || c === false) continue;
    e.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
  return e;
}

function debounce(fn, ms) {
  let t = null, pending = null;
  const d = (...args) => {
    pending = args;
    clearTimeout(t);
    t = setTimeout(() => { const a = pending; pending = null; t = null; fn(...a); }, ms);
  };
  d.flush = () => { if (pending) { clearTimeout(t); const a = pending; pending = null; t = null; fn(...a); } };
  d.cancel = () => { clearTimeout(t); pending = null; t = null; };
  d.pending = () => !!pending;
  return d;
}

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

const _tpl = document.createElement('template');
function htmlToText(html) {
  _tpl.innerHTML = html || '';
  const c = _tpl.content;
  c.querySelectorAll('br').forEach(b => b.replaceWith('\n'));
  c.querySelectorAll('div,p,li,h1,h2,h3,blockquote,pre,tr').forEach(b => b.append('\n'));
  return c.textContent.replace(/\u200B/g, '').replace(/\n{3,}/g, '\n\n').trim();
}

/* Datumsformate einmal anlegen (1.30): toLocaleDateString baut sonst bei jedem Aufruf einen neuen Formatierer –
   bei Seitenlisten mit hunderten Einträgen spürbar. Ausgabe unverändert. */
const DF = typeof Intl !== 'undefined' ? {
  long: new Intl.DateTimeFormat('de-CH', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }),
  time: new Intl.DateTimeFormat('de-CH', { hour: '2-digit', minute: '2-digit' }),
  short: new Intl.DateTimeFormat('de-CH', { day: '2-digit', month: '2-digit', year: 'numeric' }),
} : null;
function fmtDate(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  if (DF) return DF.long.format(d) + '  ' + DF.time.format(d);
  return d.toLocaleDateString('de-CH', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) +
    '  ' + d.toLocaleTimeString('de-CH', { hour: '2-digit', minute: '2-digit' });
}
function fmtShortDate(ts) {
  if (!ts) return '';
  return DF ? DF.short.format(new Date(ts)) : new Date(ts).toLocaleDateString('de-CH', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

/* HTML aus der Zwischenablage bereinigen (nur harmlose Formatierung behalten) */
const SAFE_TAGS = new Set(['B', 'STRONG', 'I', 'EM', 'U', 'S', 'STRIKE', 'DEL', 'SUB', 'SUP', 'SPAN', 'FONT', 'P', 'DIV', 'BR',
  'UL', 'OL', 'LI', 'A', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'BLOCKQUOTE', 'PRE', 'CODE', 'TABLE', 'THEAD', 'TBODY', 'TR', 'TD', 'TH', 'HR', 'MARK']);
const DROP_TAGS = new Set(['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'META', 'LINK', 'TITLE', 'HEAD', 'SVG', 'MATH',
  'NOSCRIPT', 'TEMPLATE', 'FORM', 'INPUT', 'BUTTON', 'SELECT', 'TEXTAREA', 'VIDEO', 'AUDIO', 'CANVAS', 'IMG', 'PICTURE', 'SOURCE', 'XML']);
const SAFE_STYLES = ['color', 'background-color', 'font-weight', 'font-style', 'text-decoration', 'text-decoration-line',
  'font-size', 'font-family', 'text-align', 'line-height', 'list-style-type', 'vertical-align',
  // Word-Absätze (1.74): Abstand vor/nach, Einzüge, Seitenumbruch oberhalb
  'padding-top', 'padding-bottom', 'padding-left', 'padding-right', 'text-indent', 'break-before'];

function sanitizeHtml(html) {
  const doc = new DOMParser().parseFromString(html || '', 'text/html');
  const walk = (node) => {
    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType === 8) { child.remove(); continue; }
      if (child.nodeType !== 1) continue;
      const tag = child.tagName.toUpperCase();
      if (tag === 'SPAN' && child.classList.contains('kt-math') && child.hasAttribute('data-tex') && typeof Formula !== 'undefined') {
        const tmp = doc.createElement('div');
        tmp.innerHTML = Formula.spanHtml(child.getAttribute('data-tex'), child.getAttribute('data-display') === '1');
        child.replaceWith(tmp.firstChild);
        continue;
      }
      if (DROP_TAGS.has(tag)) { child.remove(); continue; }
      walk(child);
      if (!SAFE_TAGS.has(tag)) {
        child.replaceWith(...child.childNodes);
        continue;
      }
      const keep = {};
      if (tag === 'A') {
        const href = (child.getAttribute('href') || '').trim();
        if (/^(https?:|mailto:)/i.test(href) || /^#[\w.:-]+$/.test(href)) keep.href = href;   // #Textmarke (Word-Verweise, 1.74)
      }
      if (tag === 'TD' || tag === 'TH') {
        for (const a of ['colspan', 'rowspan']) if (child.getAttribute(a)) keep[a] = child.getAttribute(a);
      }
      if (tag === 'FONT') {
        if (child.getAttribute('color')) keep.color = child.getAttribute('color');
        if (child.getAttribute('face')) keep.face = child.getAttribute('face');
      }
      if (tag === 'UL' && child.classList.contains('checklist')) keep.class = 'checklist';
      if (tag === 'LI' && child.classList.contains('done')) keep.class = 'done';
      let style = '';
      if (child.style) {
        for (const p of SAFE_STYLES) {
          const v = child.style.getPropertyValue(p);
          if (v && !/expression|url\(/i.test(v)) style += `${p}:${v};`;
        }
        // Tabellen aus Word (1.74): Breiten
        if ((tag === 'TABLE' || tag === 'TD' || tag === 'TH') && /^[\d.]+(pt|px|%)$/.test(child.style.width || '')) style += `width:${child.style.width};`;
      }
      for (const a of Array.from(child.attributes)) child.removeAttribute(a.name);
      for (const [k, v] of Object.entries(keep)) child.setAttribute(k, v);
      if (style) child.setAttribute('style', style);
    }
  };
  walk(doc.body);
  return doc.body.innerHTML;
}

/* Leer = kein sichtbarer Inhalt. Bilder, Anhänge, Formeln, Videos usw. sind Inhalt, auch ohne Text: bis 1.21 galt
   ein Textfeld, das nur ein eingebettetes Bild enthielt (z.B. ein Bild in einer OneNote-Gliederung), als leer –
   beim Speichern (cleanPage) und beim Laden fiel es weg, die Bilder waren nach dem Neuladen verschwunden. */
function isEmptyHtml(html) {
  if (!html) return true;
  if (/<(hr|table|li|img|svg|video|audio|iframe|object|embed|canvas|math)\b/i.test(html)) return false;
  if (/\bdata-kt-|\bkt-(file|math|missing|video|chem|eq)\b/i.test(html)) return false;
  return htmlToText(html).replace(/\s+/g, '') === '';
}

function loadImageSize(src) {
  return new Promise((res) => {
    const i = new Image();
    i.onload = () => res({ w: i.naturalWidth || 200, h: i.naturalHeight || 150 });
    i.onerror = () => res({ w: 200, h: 150 });
    i.src = src;
  });
}

function blobToDataURL(blob) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result);
    r.onerror = rej;
    r.readAsDataURL(blob);
  });
}

function nextFrame() { return new Promise(r => requestAnimationFrame(() => r())); }

/* JSON-Datei als Strom lesen (seit 1.18, für grosse KnowledgeTree-Sicherungen): das oberste Objekt wird Schlüssel
 * für Schlüssel gelesen. Für Schlüssel in `maps` (z.B. "bilder") wird jeder Eintrag "name":"data:typ;base64,…"
 * stückweise entschlüsselt und als Blob an maps[key](name, typ, blob) gegeben – nie als ganzer Text im Speicher.
 * Alle anderen Werte werden normal geparst. Ergebnis: das Objekt ohne die gestreamten Schlüssel (dort {}). */
async function readJsonStream(file, maps = {}) {
  const reader = file.stream().pipeThrough(new TextDecoderStream()).getReader();
  let buf = '', pos = 0;
  const more = async () => { const r = await reader.read(); if (r.done) return false; buf = buf.slice(pos) + r.value; pos = 0; return true; };
  const peek = async () => { while (pos >= buf.length) if (!await more()) return null; return buf[pos]; };
  const ws = async () => { for (;;) { const c = await peek(); if (c === null) return null; if (c === ' ' || c === '\n' || c === '\r' || c === '\t' || c === '\uFEFF') pos++; else return c; } };
  const expect = async (ch) => { const c = await ws(); if (c !== ch) throw new Error('Das ist keine gültige Sicherungsdatei (erwartet „' + ch + '“).'); pos++; };
  // einen beliebigen JSON-Wert roh einlesen und parsen. Seit 1.30 springt die Suche mit regulären Ausdrücken von einem
  // Strukturzeichen zum nächsten statt Zeichen für Zeichen (Seiten bestehen grösstenteils aus Zahlenlisten der
  // Freihand): 81 MB lasen sich vorher in 14 s, danach in unter 2 s.
  const TOP_RE = /["{}[\],]/g, DEEP_RE = /["{}[\]]/g, IN_RE = /["\\]/g;   // innen zählen Kommas nicht
  const value = async () => {
    await ws();
    const out = [];
    let depth = 0, inStr = false, esc = false, s0 = pos;
    for (;;) {
      if (pos >= buf.length) { out.push(buf.slice(s0)); if (!await more()) break; s0 = 0; if (esc) { esc = false; pos = 1; } continue; }
      if (inStr) {
        IN_RE.lastIndex = pos;
        const m = IN_RE.exec(buf);
        if (!m) { pos = buf.length; continue; }
        if (buf[m.index] === '\\') { pos = m.index + 2; if (pos > buf.length) { pos = buf.length; esc = true; } continue; }
        pos = m.index + 1; inStr = false;
        if (depth === 0) break;
        continue;
      }
      const re = depth ? DEEP_RE : TOP_RE;
      re.lastIndex = pos;
      const m = re.exec(buf);
      if (!m) { pos = buf.length; continue; }
      pos = m.index;
      const ch = buf[pos];
      if (ch === '"') { inStr = true; pos++; }
      else if (ch === '{' || ch === '[') { depth++; pos++; }
      else if (ch === '}' || ch === ']') { if (depth === 0) break; depth--; pos++; if (depth === 0) break; }
      else { if (depth === 0) break; pos++; }   // Komma
    }
    out.push(buf.slice(s0, pos));
    return JSON.parse(out.join(''));
  };
  // Zeichenkette "data:typ;base64,…" stückweise entschlüsseln
  const dataUrl = async () => {
    await expect('"');
    let head = '';
    for (;;) {   // bis zum Komma nach "base64"
      if (pos >= buf.length && !await more()) throw new Error('Sicherung endet unerwartet');
      const ch = buf[pos++];
      if (ch === ',') break;
      if (ch === '"') return { type: '', blob: null };
      head += ch;
      if (head.length > 200) throw new Error('Unerwarteter Bildeintrag in der Sicherung');
    }
    const m = /^data:([^;]*)(;base64)?$/.exec(head);
    const chunks = [];
    let rest = '';
    const flush = (all) => {
      const n = all ? rest.length : rest.length - (rest.length % 4);
      if (!n) return;
      const bin = atob(rest.slice(0, n));
      const u = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
      chunks.push(u);
      rest = rest.slice(n);
    };
    for (;;) {
      if (pos >= buf.length && !await more()) throw new Error('Sicherung endet unerwartet');
      const q = buf.indexOf('"', pos);
      const end = q < 0 ? buf.length : q;
      rest += buf.slice(pos, end).replace(/\\\//g, '/');
      pos = end;
      if (rest.length > 1 << 20) flush(false);
      if (q >= 0) { pos++; break; }
    }
    flush(true);
    return { type: m ? m[1] : '', blob: m && m[2] ? new Blob(chunks) : null };
  };
  const data = {};
  await expect('{');
  for (;;) {
    const c = await ws();
    if (c === null) throw new Error('Sicherung endet unerwartet');
    if (c === '}') { pos++; break; }
    if (c === ',') { pos++; continue; }
    const key = await value();
    await expect(':');
    if (maps[key]) {
      data[key] = {};
      await expect('{');
      for (;;) {
        const d = await ws();
        if (d === '}') { pos++; break; }
        if (d === ',') { pos++; continue; }
        const name = await value();
        await expect(':');
        if (await ws() !== '"') { await value(); continue; }
        const { type, blob } = await dataUrl();
        if (blob) await maps[key](name, type, blob);
      }
    } else data[key] = await value();
  }
  try { reader.cancel(); } catch (e) { /* */ }
  return data;
}
if (typeof module !== 'undefined') module.exports = Object.assign(module.exports || {}, { readJsonStream });
