'use strict';
/* Bilder verlustfrei verkleinern (1.59) – ohne Fremd-Bibliothek, nur mit dem Bild-Kodierer des Browsers.
 *
 * PNG/BMP-Standbilder werden als verlustfreies WebP gespeichert, aber NUR wenn
 *   - jedes Pixel exakt gleich bleibt (WebP zurücklesen und Pixel für Pixel vergleichen),
 *   - die Datei mindestens 10 % kleiner wird,
 *   - nichts verloren gehen kann: keine Transparenz (die Zeichenfläche des Browsers rechnet mit vormultipliziertem
 *     Alpha und verliert die Farbe unsichtbarer Pixel),
 *     keine 16-Bit-Kanäle, keine Farbprofile/Gamma-Angaben (iCCP, gAMA, cHRM, cICP), keine Animation (APNG).
 * Sonst bleibt das Original. JPEG, GIF, SVG und Videos bleiben wie sie sind (schon gepackt bzw. verlustbehaftet –
 * erneut verlustfrei packen bringt im Browser nichts). Office-Dateien werden nie angefasst (Round-Trip byte-gleich).
 * Läuft nur beim Einfügen (einmal), nie beim Öffnen – also keine zusätzliche Ladezeit. WebP zeigen alle heutigen
 * Browser und WebView2 an; Export nach OneNote/Office wandelt es wieder in PNG. */
const ImgPack = {
  MIN: 4096,                // kleine Bilder lohnen nicht
  MAX_PX: 16e6,             // sehr grosse Bilder: zu viel Rechenzeit beim Einfügen
  _webp: null,
  webpOk() {
    if (this._webp == null) {
      try { const c = document.createElement('canvas'); c.width = c.height = 1; this._webp = c.toDataURL('image/webp').startsWith('data:image/webp'); } catch (e) { this._webp = false; }
    }
    return this._webp;
  },
  /* PNG-Kopf prüfen: 16 Bit, Farbprofil/Gamma oder Animation → nicht umwandeln */
  pngSafe(u8) {
    if (u8.length < 33 || u8[0] !== 0x89 || u8[1] !== 0x50) return false;
    if (u8[24] === 16) return false;   // Bittiefe
    let p = 8;
    while (p + 8 <= u8.length) {
      const len = (u8[p] << 24 | u8[p + 1] << 16 | u8[p + 2] << 8 | u8[p + 3]) >>> 0;
      const type = String.fromCharCode(u8[p + 4], u8[p + 5], u8[p + 6], u8[p + 7]);
      if (/^(iCCP|gAMA|cHRM|cICP|acTL|sBIT)$/.test(type)) return false;
      if (type === 'IDAT' || type === 'IEND') return true;
      p += 12 + len;
    }
    return true;
  },
  pixels(bm) {
    const c = document.createElement('canvas');
    c.width = bm.width; c.height = bm.height;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(bm, 0, 0);
    return { c, data: g.getImageData(0, 0, c.width, c.height).data };
  },
  /* → das kleinere, garantiert gleiche Bild (WebP) oder das Original */
  async lossless(blob) {
    try {
      if (!blob || !blob.size || blob.size < this.MIN || blob.size > 60e6) return blob;
      const type = (blob.type || '').toLowerCase();
      if (!/^image\/(png|bmp|x-ms-bmp)$/.test(type) || typeof createImageBitmap !== 'function' || !this.webpOk()) return blob;
      const head = new Uint8Array(await blob.slice(0, Math.min(blob.size, 1 << 16)).arrayBuffer());
      if (type === 'image/png' && !this.pngSafe(head)) return blob;
      const opt = { colorSpaceConversion: 'none', premultiplyAlpha: 'none' };
      const bm = await createImageBitmap(blob, opt);
      if (bm.width * bm.height > this.MAX_PX) { bm.close && bm.close(); return blob; }
      const A = this.pixels(bm);
      bm.close && bm.close();
      for (let i = 3; i < A.data.length; i += 4) if (A.data[i] !== 255) return blob;
      const webp = await new Promise(res => A.c.toBlob(res, 'image/webp', 1));
      if (!webp || webp.type !== 'image/webp' || webp.size > blob.size * 0.9) return blob;
      const bm2 = await createImageBitmap(webp, opt);
      if (bm2.width !== A.c.width || bm2.height !== A.c.height) return blob;
      const B = this.pixels(bm2).data;
      bm2.close && bm2.close();
      const a = A.data;
      for (let i = 0; i < a.length; i += 4) {
        if (a[i] !== B[i] || a[i + 1] !== B[i + 1] || a[i + 2] !== B[i + 2] || B[i + 3] !== 255) return blob;
      }
      return webp;
    } catch (e) { return blob; }
  },
};
if (typeof module !== 'undefined') module.exports = { ImgPack };
