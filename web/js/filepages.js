'use strict';
/* Dateien als Seiten-Bilder aufklappen (seit 1.11) – wie „Dateiausdruck“ in OneNote.
 *
 * Man hängt eine Datei an (ziehen, Einfügen → Datei, Strg+V) – sie erscheint als 📎-Anhang.
 * Rechtsklick (Finger: lange drücken) auf den Anhang → „Seiten als Bilder aufklappen“:
 *   - PDF:            jede Seite wird als Bild gerendert (PDF.js, bei Bedarf aus dem Internet geladen – wie bei „Freihand → Text“)
 *   - Bild:           wird einfach als Bild eingefügt
 *   - Word/PowerPoint/Excel (.docx/.pptx/.xlsx): die enthaltenen Bilder werden herausgezogen (Office-Dateien
 *     sind ZIP-Archive; für seitengenaue Darstellung in Word „Speichern als PDF“ und das PDF aufklappen)
 *
 * Wir umgehen keinen Schutz: ein PDF mit Druck-/Kopier-Einschränkungen wird ganz normal gerendert (diese Marken
 * sind keine Zugriffssperre). Ist ein PDF mit Passwort verschlüsselt, wird nach dem Passwort gefragt (nicht geknackt).
 * Die gerenderten Seiten sind normale KnowledgeTree-Bilder und gehen deshalb in beide Richtungen mit OneNote. */

const FilePages = {
  // feste Version, erst bei Bedarf geladen (klassisches UMD-Bündel, setzt window.pdfjsLib)
  PDFJS: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js',
  PDFJS_WORKER: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js',
  DISPLAY_W: 560,          // Anzeigebreite einer Seite auf der Fläche
  MAX_PAGES: 150,          // Schutz gegen sehr grosse PDFs
  RENDER_W: 1500,          // Pixelbreite beim Rendern (Schärfe vs. Grösse)

  kindOf(name) {
    const e = (name || '').toLowerCase().split('.').pop();
    if (e === 'pdf') return 'pdf';
    if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg'].includes(e)) return 'image';
    if (['docx', 'pptx', 'xlsx', 'docm', 'pptm', 'xlsm'].includes(e)) return 'office';
    return 'other';
  },
  /* steht „Aufklappen“ für diese Datei zur Verfügung? (Beschriftung fürs Menü) */
  expandLabel(name) {
    const k = this.kindOf(name);
    if (k === 'pdf') return 'Seiten als Bilder aufklappen';
    if (k === 'image') return 'Als Bild einfügen';
    if (k === 'office') return 'Bilder aus der Datei einfügen';
    return null;
  },

  async loadPdf() {
    if (!window.pdfjsLib) await Draw.loadScript(this.PDFJS);
    const lib = window.pdfjsLib;
    if (!lib) throw new Error('PDF-Modul konnte nicht geladen werden');
    try { lib.GlobalWorkerOptions.workerSrc = this.PDFJS_WORKER; } catch (e) { /* */ }
    return lib;
  },

  async bytesOf(src) {
    const url = await Backend.imgURL(src);
    if (!url) throw new Error('Datei nicht gefunden');
    const buf = await (await fetch(url)).arrayBuffer();
    return new Uint8Array(buf);
  },

  /* Hauptaufgabe: Anhang aufklappen. boxId = Feld mit dem 📎-Anhang (als Anker für die Lage). */
  async expand(boxId, src, name) {
    if (!Canvas.page) return;
    const kind = this.kindOf(name);
    if (kind === 'other') {
      UI.toast('Diese Datei lässt sich nicht als Seiten darstellen. Tipp: in Word/PowerPoint „Speichern als PDF“ und das PDF aufklappen.', 6000);
      return;
    }
    const anchor = boxId && Canvas.box(boxId);
    let pages;
    try {
      const buf = await this.bytesOf(src);
      if (kind === 'pdf') pages = await this.renderPdf(buf, name);
      else if (kind === 'image') pages = [{ blob: new Blob([buf], { type: this.mimeOf(name) }), w: 0, h: 0 }];
      else pages = await this.officeImages(buf, name);
    } catch (e) {
      if (e && e.message === 'abgebrochen') return;
      UI.toast('Konnte nicht aufgeklappt werden: ' + (e && e.message || e), 6000);
      return;
    }
    if (!pages || !pages.length) {
      UI.toast(kind === 'office' ? 'In dieser Datei stecken keine (anzeigbaren) Bilder. Für seitengenaue Darstellung in Word „Speichern als PDF“ und das PDF aufklappen.' : 'Keine Seiten gefunden', 6000);
      return;
    }
    await this.placeColumn(anchor, pages, name);
  },

  mimeOf(name) {
    const e = (name || '').toLowerCase().split('.').pop();
    return ({ png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp', svg: 'image/svg+xml' })[e] || 'image/png';
  },

  /* ---------------------------------------------------------- PDF → Seitenbilder */
  async renderPdf(buf, name) {
    const lib = await this.loadPdf();
    let pdf, password;
    for (;;) {
      try { pdf = await lib.getDocument({ data: buf.slice(), password }).promise; break; }
      catch (e) {
        const code = e && (e.name || e.code);
        if (code === 'PasswordException' || code === 1 || code === 2) {
          const pw = await UI.prompt('Dieses PDF ist mit einem Passwort verschlüsselt. Passwort eingeben:', '', { password: true });
          if (pw == null) throw new Error('abgebrochen');
          password = pw;
          continue;
        }
        throw new Error('PDF konnte nicht gelesen werden (ist es eine gültige PDF-Datei?)');
      }
    }
    const total = Math.min(pdf.numPages, this.MAX_PAGES);
    const out = [];
    for (let n = 1; n <= total; n++) {
      UI.toast(`Seite ${n} von ${pdf.numPages} wird gerendert …`, 60000);
      const page = await pdf.getPage(n);
      const vp0 = page.getViewport({ scale: 1 });
      const scale = Math.min(this.RENDER_W / vp0.width, 3);
      const vp = page.getViewport({ scale });
      const cv = el('canvas'); cv.width = Math.ceil(vp.width); cv.height = Math.ceil(vp.height);
      const ctx = cv.getContext('2d');
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cv.width, cv.height);
      await page.render({ canvasContext: ctx, viewport: vp }).promise;
      const blob = await new Promise(r => cv.toBlob(r, 'image/png'));
      out.push({ blob, w: cv.width, h: cv.height });
      if (page.cleanup) try { page.cleanup(); } catch (e) { /* */ }
    }
    if (pdf.numPages > total) UI.toast(`Nur die ersten ${total} von ${pdf.numPages} Seiten aufgeklappt.`, 5000);
    try { pdf.destroy(); } catch (e) { /* */ }
    return out;
  },

  /* ---------------------------------------------------------- Office-Datei (ZIP) → enthaltene Bilder */
  async officeImages(buf) {
    const files = await unzip(buf);
    const names = [...files.keys()].filter(n => /\/media\/[^/]+\.(png|jpe?g|gif|bmp|webp)$/i.test(n))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    const out = [];
    for (const n of names) {
      const data = await files.get(n)();
      if (data && data.length) out.push({ blob: new Blob([data], { type: this.mimeOf(n) }), w: 0, h: 0 });
    }
    return out;
  },

  /* ---------------------------------------------------------- Seiten als Spalte unter den Anhang legen */
  async placeColumn(anchor, pages, name) {
    const p = Canvas.page;
    const x0 = anchor ? anchor.x : (Canvas.viewCenter().x - this.DISPLAY_W / 2);
    let y = anchor ? anchor.y + (Canvas.els.get(anchor.id)?.offsetHeight || 60) + 16 : Canvas.viewCenter().y;
    let z = Canvas.maxZ();
    const made = [];
    const dw = this.DISPLAY_W;
    Canvas.stopEditing();
    for (let i = 0; i < pages.length; i++) {
      const pg = pages[i];
      UI.toast(`Seite ${i + 1} von ${pages.length} wird eingefügt …`, 60000);
      let src, dim;
      try { src = await Backend.saveImage(pg.blob); dim = await loadImageSize(await Backend.imgURL(src)); }
      catch (e) { continue; }
      const w = dw, h = Math.round(dim.h * dw / dim.w);
      const b = {
        id: uid('b'), x: Math.round(x0), y: Math.round(y), w: w + 2 * (PADX + BORDER),
        html: '', images: [{ id: uid('i'), src, x: 0, y: 0, w, h }], z: ++z,
        style: {}, locked: false, pkg: null,
      };
      p.boxes.push(b);
      made.push(b.id);
      y += h + 2 * (BAR + BORDER) + 14;
    }
    Canvas.render();
    if (made.length) { Canvas.select(made); Hist.touchPage(Canvas.pageId); Hist.commit(pages.length === 1 ? 'Datei als Bild eingefügt' : `${made.length} Seiten als Bilder aufgeklappt`); }
    UI.toast(made.length === 1 ? 'Als Bild eingefügt' : `${made.length} Seite${made.length === 1 ? '' : 'n'} als Bilder aufgeklappt – liegen untereinander unter dem Anhang`, 4000);
  },
};

/* --------------------------------------------------------------------------- winziger ZIP-Leser
 * Office-Dateien (.docx/.pptx/.xlsx) sind ZIP-Archive. Wir lesen das zentrale Verzeichnis und packen
 * die gewünschten Einträge mit DecompressionStream('deflate-raw') aus – ohne Fremd-Bibliothek. */
async function inflateRaw(u8) {
  if (typeof DecompressionStream === 'undefined') throw new Error('Dieser Browser kann die Datei nicht entpacken');
  const ds = new DecompressionStream('deflate-raw');
  const w = ds.writable.getWriter();
  w.write(u8); w.close();
  const ab = await new Response(ds.readable).arrayBuffer();
  return new Uint8Array(ab);
}
/* ZIP direkt aus einer Datei lesen (seit 1.18): nur das Inhaltsverzeichnis wird geladen, jeder Eintrag erst beim
 * Zugriff (Blob.slice + DecompressionStream) – ein 2-GB-Archiv braucht so nicht 2 GB Speicher. Mit ZIP64 und
 * Windows-Dateinamen (CP437, wie der Explorer sie ohne UTF-8-Kennzeichen schreibt).
 * openZip(blob) → [{ name, size, csize, read: async () => Uint8Array }] */
const CP437_HI = 'ÇüéâäàåçêëèïîìÄÅÉæÆôöòûùÿÖÜ¢£¥₧ƒáíóúñÑªº¿⌐¬½¼¡«»░▒▓│┤╡╢╖╕╣║╗╝╜╛┐└┴┬├─┼╞╟╚╔╩╦╠═╬╧╨╤╥╙╘╒╓╫╪┘┌█▄▌▐▀αßΓπΣσµτΦΘΩδ∞φε∩≡±≥≤⌠⌡÷≈°∙·√ⁿ²■ ';
function zipName(b, utf8) {
  if (utf8) return new TextDecoder('utf-8').decode(b);
  if (!b.some(x => x >= 0x80)) return String.fromCharCode(...b);
  try { return new TextDecoder('utf-8', { fatal: true }).decode(b); } catch (e) { /* kein UTF-8 → CP437 */ }
  let s = '';
  for (const x of b) s += x < 0x80 ? String.fromCharCode(x) : CP437_HI[x - 0x80];
  return s;
}
async function openZip(blob) {
  const size = blob.size;
  const tailLen = Math.min(size, 65557 + 20);
  const tail = new Uint8Array(await blob.slice(size - tailLen).arrayBuffer());
  const tv = new DataView(tail.buffer);
  let e = -1;
  for (let i = tail.length - 22; i >= 0; i--) if (tv.getUint32(i, true) === 0x06054b50) { e = i; break; }
  if (e < 0) throw new Error('Keine gültige ZIP-Datei');
  let count = tv.getUint16(e + 10, true), cdSize = tv.getUint32(e + 12, true), cdOff = tv.getUint32(e + 16, true);
  if (count === 0xFFFF || cdSize === 0xFFFFFFFF || cdOff === 0xFFFFFFFF) {   // ZIP64
    const loc = e - 20;
    if (loc >= 0 && tv.getUint32(loc, true) === 0x07064b50) {
      const z64 = Number(tv.getBigUint64(loc + 8, true));
      const z = new DataView(await blob.slice(z64, z64 + 56).arrayBuffer());
      if (z.getUint32(0, true) === 0x06064b50) { count = Number(z.getBigUint64(32, true)); cdSize = Number(z.getBigUint64(40, true)); cdOff = Number(z.getBigUint64(48, true)); }
    }
  }
  const cd = new Uint8Array(await blob.slice(cdOff, cdOff + cdSize).arrayBuffer());
  const c = new DataView(cd.buffer);
  const out = [];
  let p = 0;
  for (let i = 0; i < count && p + 46 <= cd.length; i++) {
    if (c.getUint32(p, true) !== 0x02014b50) break;
    const flags = c.getUint16(p + 8, true), method = c.getUint16(p + 10, true);
    let csize = c.getUint32(p + 20, true), usize = c.getUint32(p + 24, true), loff = c.getUint32(p + 42, true);
    const nlen = c.getUint16(p + 28, true), xlen = c.getUint16(p + 30, true), clen = c.getUint16(p + 32, true);
    let name = zipName(cd.subarray(p + 46, p + 46 + nlen), flags & 0x800);
    let q = p + 46 + nlen;
    const xend = q + xlen;
    while (q + 4 <= xend) {
      const id = c.getUint16(q, true), sz = c.getUint16(q + 2, true);
      if (id === 0x0001) {   // ZIP64: nur die Felder, die im Kopf 0xFFFFFFFF sind, in dieser Reihenfolge
        let r = q + 4;
        if (usize === 0xFFFFFFFF) { usize = Number(c.getBigUint64(r, true)); r += 8; }
        if (csize === 0xFFFFFFFF) { csize = Number(c.getBigUint64(r, true)); r += 8; }
        if (loff === 0xFFFFFFFF) { loff = Number(c.getBigUint64(r, true)); r += 8; }
      } else if (id === 0x7075 && sz > 5) name = new TextDecoder('utf-8').decode(cd.subarray(q + 9, q + 4 + sz));   // Info-ZIP-Unicode-Pfad
      q += 4 + sz;
    }
    p = xend + clen;
    if (name.endsWith('/')) continue;
    const enc = !!(flags & 1);
    out.push({
      name, size: usize, csize, method,
      /* als Blob (grosse Einträge: der Browser lagert Blobs bei Bedarf auf die Platte aus) */
      async blob() {
        if (enc) throw new Error(`„${name}“ ist verschlüsselt (Passwort-ZIP wird nicht unterstützt)`);
        const lh = new DataView(await blob.slice(loff, loff + 30).arrayBuffer());
        const start = loff + 30 + lh.getUint16(26, true) + lh.getUint16(28, true);
        const part = blob.slice(start, start + csize);
        if (method === 0) return part;
        return await new Response(part.stream().pipeThrough(new DecompressionStream('deflate-raw'))).blob();
      },
      async read() {
        if (enc) throw new Error(`„${name}“ ist verschlüsselt (Passwort-ZIP wird nicht unterstützt)`);
        const lh = new DataView(await blob.slice(loff, loff + 30).arrayBuffer());
        if (lh.getUint32(0, true) !== 0x04034b50) throw new Error(`ZIP-Eintrag „${name}“ beschädigt`);
        const start = loff + 30 + lh.getUint16(26, true) + lh.getUint16(28, true);
        const part = blob.slice(start, start + csize);
        if (method === 0) return new Uint8Array(await part.arrayBuffer());
        if (method !== 8) throw new Error(`„${name}“: Packverfahren ${method} wird nicht unterstützt`);
        if (typeof DecompressionStream === 'undefined') throw new Error('Dieser Browser kann ZIP-Dateien nicht entpacken');
        return new Uint8Array(await new Response(part.stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer());
      },
    });
  }
  return out;
}
async function unzip(u8) {
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  // End-of-Central-Directory suchen (Signatur 0x06054b50), von hinten
  let eocd = -1;
  for (let i = u8.length - 22; i >= 0 && i >= u8.length - 22 - 65536; i--) {
    if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('Keine gültige Office-/ZIP-Datei');
  const count = dv.getUint16(eocd + 10, true);
  let cdOff = dv.getUint32(eocd + 16, true);
  const dec = new TextDecoder('utf-8');
  const entries = new Map();
  let p = cdOff;
  for (let i = 0; i < count && p + 46 <= u8.length; i++) {
    if (dv.getUint32(p, true) !== 0x02014b50) break;
    const method = dv.getUint16(p + 10, true);
    const compSize = dv.getUint32(p + 20, true);
    const nameLen = dv.getUint16(p + 28, true);
    const extraLen = dv.getUint16(p + 30, true);
    const commentLen = dv.getUint16(p + 32, true);
    const lho = dv.getUint32(p + 42, true);
    const nm = dec.decode(u8.subarray(p + 46, p + 46 + nameLen));
    p += 46 + nameLen + extraLen + commentLen;
    // Eintrag als Funktion, die erst beim Zugriff auspackt
    entries.set(nm, async () => {
      if (dv.getUint32(lho, true) !== 0x04034b50) return null;
      const lnameLen = dv.getUint16(lho + 26, true);
      const lextraLen = dv.getUint16(lho + 28, true);
      const start = lho + 30 + lnameLen + lextraLen;
      const comp = u8.subarray(start, start + compSize);
      if (method === 0) return comp.slice();
      if (method === 8) return inflateRaw(comp);
      return null;   // andere Verfahren (selten) überspringen
    });
  }
  return entries;
}

if (typeof module !== 'undefined') module.exports = { FilePages, unzip, inflateRaw, openZip, zipName };
