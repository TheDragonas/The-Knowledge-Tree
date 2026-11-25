'use strict';
/* Eigene Schriftarten (1.66) – .ttf/.otf/.woff/.woff2 hinzufügen, wie „Schriftart installieren“.
 *
 * Die Datei liegt als Asset im Speicher (Browser: IndexedDB, Programm: Saves), die Liste in Store.ui.fonts
 * ([{ name, asset }]). Beim Start werden sie per FontFace geladen und erscheinen in der Schriftart-Auswahl (FONTS).
 * Der Name kommt aus der Schriftdatei selbst (OpenType-Tabelle „name“, Familie), sonst aus dem Dateinamen.
 * In Word/PowerPoint/Excel-Dateien steht nur der Name (wie in Office: auf anderen Rechnern muss die Schrift dort
 * installiert sein); im PDF-Export wird sie mitgedruckt. */
const Fonts = {
  loaded: new Set(),
  list() { return Array.isArray(Store.ui.fonts) ? Store.ui.fonts.filter(f => f && f.name && f.asset) : []; },
  async init() {
    for (const f of this.list()) await this.activate(f).catch(() => { });
  },
  async activate(f) {
    if (this.loaded.has(f.name)) return;
    const url = await Backend.imgURL(f.asset);
    if (!url) throw new Error('Schriftdatei fehlt');
    const ff = new FontFace(f.name, `url(${url})`);
    await ff.load();
    document.fonts.add(ff);
    this.loaded.add(f.name);
    if (!FONTS.includes(f.name)) FONTS.push(f.name);
  },
  async add() {
    const files = await new Promise((res) => { const inp = el('input', { type: 'file', multiple: true, accept: '.ttf,.otf,.woff,.woff2,font/*', style: { display: 'none' } }); inp.addEventListener('change', () => { res([...inp.files]); inp.remove(); }); document.body.append(inp); inp.click(); });
    const done = [];
    for (const file of files) {
      try {
        const u8 = new Uint8Array(await file.arrayBuffer());
        const name = (await this.familyName(u8)) || file.name.replace(/\.[^.]+$/, '').replace(/[-_](Regular|Bold|Italic|Light|Medium)$/i, '').replace(/[_-]+/g, ' ');
        const ext = (file.name.split('.').pop() || 'ttf').toLowerCase();
        const type = { ttf: 'font/ttf', otf: 'font/otf', woff: 'font/woff', woff2: 'font/woff2' }[ext] || 'application/octet-stream';
        const asset = await Backend.saveFile(new Blob([u8], { type }), ext);
        const f = { name, asset };
        await this.activate(f);
        Store.ui.fonts = [...this.list().filter(x => x.name !== name), f];
        done.push(name);
      } catch (e) { UI.toast(`${file.name}: ${e.message}`, 5000); }
    }
    if (done.length) { UiState.saveSoon(); UI.toast(`Schriftart ${done.map(n => '„' + n + '“').join(', ')} hinzugefügt – jetzt in der Schriftart-Auswahl`, 4500); Ribbon.refresh(); }
  },
  remove(name) {
    Store.ui.fonts = this.list().filter(f => f.name !== name);
    const i = FONTS.indexOf(name); if (i >= 0 && !this.BUILTIN.includes(name)) FONTS.splice(i, 1);
    UiState.saveSoon();
  },
  BUILTIN: [],
  manage() {
    const own = this.list();
    UI.menu([{ head: 'Eigene Schriftarten' },
      ...own.map(f => ({ label: f.name, icon: 'trash', action: () => { this.remove(f.name); UI.toast(`„${f.name}“ entfernt (bereits formatierter Text behält den Namen)`); } })),
      own.length ? '-' : null,
      { label: 'Schriftart hinzufügen … (.ttf, .otf, .woff, .woff2)', icon: 'plus', action: () => this.add() }].filter(Boolean), 0, 0, { anchor: document.querySelector('[data-combo="font"]') || undefined });
  },
  /* OpenType/TrueType (auch WOFF 1): Familienname aus der „name“-Tabelle */
  async familyName(u8) {
    try {
      const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
      const tag = String.fromCharCode(u8[0], u8[1], u8[2], u8[3]);
      let name = null;
      if (tag === 'wOFF') {
        const n = dv.getUint16(12);
        for (let i = 0; i < n; i++) {
          const o = 44 + i * 20;
          if (String.fromCharCode(u8[o], u8[o + 1], u8[o + 2], u8[o + 3]) !== 'name') continue;
          const off = dv.getUint32(o + 4), comp = dv.getUint32(o + 8), orig = dv.getUint32(o + 12);
          let t = u8.subarray(off, off + comp);
          if (comp < orig) t = new Uint8Array(await new Response(new Blob([t]).stream().pipeThrough(new DecompressionStream('deflate'))).arrayBuffer());
          name = t;
        }
      } else if (tag === '\u0000\u0001\u0000\u0000' || tag === 'OTTO' || tag === 'true') {
        const n = dv.getUint16(4);
        for (let i = 0; i < n; i++) {
          const o = 12 + i * 16;
          if (String.fromCharCode(u8[o], u8[o + 1], u8[o + 2], u8[o + 3]) !== 'name') continue;
          name = u8.subarray(dv.getUint32(o + 8), dv.getUint32(o + 8) + dv.getUint32(o + 12));
        }
      }
      if (!name) return null;
      const nd = new DataView(name.buffer, name.byteOffset, name.byteLength);
      const count = nd.getUint16(2), str = nd.getUint16(4);
      let best = null, score = -1;
      for (let i = 0; i < count; i++) {
        const r = 6 + i * 12;
        const pid = nd.getUint16(r), lang = nd.getUint16(r + 4), nid = nd.getUint16(r + 6), len = nd.getUint16(r + 8), off = nd.getUint16(r + 10);
        if (nid !== 16 && nid !== 1) continue;
        const raw = name.subarray(str + off, str + off + len);
        let s = '';
        if (pid === 3 || pid === 0) for (let k = 0; k + 1 < raw.length; k += 2) s += String.fromCharCode(raw[k] << 8 | raw[k + 1]);
        else s = String.fromCharCode(...raw);
        const sc = (nid === 16 ? 2 : 1) + (pid === 3 && (lang === 0x409 || lang === 0x407) ? 1 : 0);
        if (s.trim() && sc > score) { best = s.trim(); score = sc; }
      }
      return best;
    } catch (e) { return null; }
  },
};
Fonts.BUILTIN = FONTS.slice();
if (typeof module !== 'undefined') module.exports = { Fonts };
