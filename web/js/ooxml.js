'use strict';
/* Office Open XML (1.60) – gemeinsamer Kern für Word (.docx), Excel (.xlsx) und PowerPoint (.pptx).
 *
 * Grundsatz „verlustfrei“: Das Original-Paket (ZIP) bleibt erhalten. Beim Speichern werden nur die Teile neu
 * geschrieben, die tatsächlich geändert wurden; alle anderen Einträge werden mit ihren gepackten Original-Bytes
 * (gleiche Prüfsumme) übernommen. Ist gar nichts geändert, ist das Ergebnis die Original-Datei, Byte für Byte.
 * Unbekannte Teile (Makros, SmartArt, Diagramme, Medien, Animationen …) fasst dieses Modul nie an.
 *
 *   const pkg = await Ooxml.open(blob)       // Paket lesen (nur das Verzeichnis; Inhalte bei Bedarf entpacken)
 *   pkg.kind                                 // 'docx' | 'xlsx' | 'pptx' (auch Vorlagen/Makro-Varianten) | ''
 *   await pkg.text(path) / pkg.xml(path)     // Teil als Text bzw. XML-Dokument (DOMParser)
 *   pkg.setXml(path, doc) / setText / setBytes / remove(path)   // ändern (nur diese Teile werden neu gepackt)
 *   await pkg.rels(path)                     // Beziehungen eines Teils [{ id, type, target, mode, path }]
 *   pkg.addPart(path, data, contentType)     // neuer Teil inkl. Content-Type-Eintrag
 *   await pkg.save()                         // → Blob (unverändert: das Original)
 *   Ooxml.blank('docx' | 'xlsx' | 'pptx')    // minimales, gültiges neues Paket
 * Ohne DOM nur lesen/schreiben von Bytes und Text; XML braucht DOMParser/XMLSerializer (Browser). */
const Ooxml = {
  EMU_PX: 9525,                         // 914400 EMU je Zoll / 96 px je Zoll
  emu2px(v) { return (+v || 0) / 9525; },
  px2emu(v) { return Math.round((+v || 0) * 9525); },
  pt2px(v) { return (+v || 0) * 96 / 72; },
  px2pt(v) { return (+v || 0) * 72 / 96; },
  twip2px(v) { return (+v || 0) / 15; },          // Word: 1/20 pt
  px2twip(v) { return Math.round((+v || 0) * 15); },
  NS: {
    r: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
    pr: 'http://schemas.openxmlformats.org/package/2006/relationships',
    ct: 'http://schemas.openxmlformats.org/package/2006/content-types',
    w: 'http://schemas.openxmlformats.org/wordprocessingml/2006/main',
    a: 'http://schemas.openxmlformats.org/drawingml/2006/main',
    p: 'http://schemas.openxmlformats.org/presentationml/2006/main',
    s: 'http://schemas.openxmlformats.org/spreadsheetml/2006/main',
  },
  REL: {
    doc: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument',
    img: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/image',
    slide: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide',
    notes: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/notesSlide',
    notesMaster: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/notesMaster',
    layout: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout',
    master: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster',
    theme: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme',
    sheet: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet',
    styles: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles',
    sst: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings',
  },
  // Hauptteil → Format (inkl. Vorlagen .dotx/.xltx/.potx und Makro-Varianten)
  MAIN: [
    [/wordprocessingml\.(document|template)\.main\+xml|ms-word\.(document|template)\.macroEnabled/, 'docx'],
    [/spreadsheetml\.(sheet|template)\.main\+xml|ms-excel\.(sheet|template)\.macroEnabled/, 'xlsx'],
    [/presentationml\.(presentation|template|slideshow)\.main\+xml|ms-powerpoint\.(presentation|template|slideshow)\.macroEnabled/, 'pptx'],
  ],
  EXT: { docx: 'docx', docm: 'docx', dotx: 'docx', dotm: 'docx', xlsx: 'xlsx', xlsm: 'xlsx', xltx: 'xlsx', xltm: 'xlsx', pptx: 'pptx', pptm: 'pptx', potx: 'pptx', potm: 'pptx', ppsx: 'pptx' },
  MIME: { docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' },
  kindOfName(name) { return this.EXT[String(name || '').toLowerCase().split('.').pop()] || ''; },
  isTemplate(name) { return /\.(dotx|dotm|xltx|xltm|potx|potm)$/i.test(name || ''); },

  /* ---------------------------------------------------------------- ZIP */
  _crcT: null,
  crc32(u8) {
    let T = this._crcT;
    if (!T) { T = this._crcT = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; T[n] = c >>> 0; } }
    let c = 0xFFFFFFFF;
    for (let i = 0; i < u8.length; i++) c = T[(c ^ u8[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  },
  async inflate(u8) { return new Uint8Array(await new Response(new Blob([u8]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer()); },
  async deflate(u8) { return new Uint8Array(await new Response(new Blob([u8]).stream().pipeThrough(new CompressionStream('deflate-raw'))).arrayBuffer()); },
  // zentrales Verzeichnis lesen → Einträge in Original-Reihenfolge (gepackte Bytes bleiben unangetastet)
  readZip(u8) {
    const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    let eocd = -1;
    for (let i = u8.length - 22; i >= Math.max(0, u8.length - 65557); i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    if (eocd < 0) throw new Error('Keine ZIP-Datei (Office-Datei beschädigt?)');
    let n = dv.getUint16(eocd + 10, true), cdOff = dv.getUint32(eocd + 16, true);
    if (cdOff === 0xFFFFFFFF || n === 0xFFFF) {   // ZIP64
      const loc = eocd - 20;
      if (loc >= 0 && dv.getUint32(loc, true) === 0x07064b50) { const e64 = Number(dv.getBigUint64(loc + 8, true)); n = Number(dv.getBigUint64(e64 + 32, true)); cdOff = Number(dv.getBigUint64(e64 + 48, true)); }
    }
    const dec = new TextDecoder();
    const out = [];
    let p = cdOff;
    for (let k = 0; k < n; k++) {
      if (dv.getUint32(p, true) !== 0x02014b50) throw new Error('ZIP-Verzeichnis beschädigt');
      const flags = dv.getUint16(p + 8, true), method = dv.getUint16(p + 10, true), time = dv.getUint16(p + 12, true), date = dv.getUint16(p + 14, true);
      const crc = dv.getUint32(p + 16, true);
      let csize = dv.getUint32(p + 20, true), usize = dv.getUint32(p + 24, true);
      const nl = dv.getUint16(p + 28, true), xl = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true);
      let off = dv.getUint32(p + 42, true);
      const name = dec.decode(u8.subarray(p + 46, p + 46 + nl));
      if (csize === 0xFFFFFFFF || usize === 0xFFFFFFFF || off === 0xFFFFFFFF) {
        let x = p + 46 + nl; const end = x + xl;
        while (x + 4 <= end) {
          const id = dv.getUint16(x, true), sz = dv.getUint16(x + 2, true);
          if (id === 1) { let y = x + 4; if (usize === 0xFFFFFFFF) { usize = Number(dv.getBigUint64(y, true)); y += 8; } if (csize === 0xFFFFFFFF) { csize = Number(dv.getBigUint64(y, true)); y += 8; } if (off === 0xFFFFFFFF) off = Number(dv.getBigUint64(y, true)); }
          x += 4 + sz;
        }
      }
      const lnl = dv.getUint16(off + 26, true), lxl = dv.getUint16(off + 28, true);
      const data = off + 30 + lnl + lxl;
      out.push({ name, flags, method, time, date, crc, csize, usize, raw: u8.subarray(data, data + csize) });
      p += 46 + nl + xl + cl;
    }
    return out;
  },
  // Einträge schreiben: { name, method, crc, csize, usize, raw, time, date } (raw = gepackte Bytes)
  writeZip(entries) {
    const enc = new TextEncoder();
    const parts = [], central = [];
    let off = 0;
    for (const e of entries) {
      const nm = enc.encode(e.name), utf = /[^\x00-\x7f]/.test(e.name) ? 0x0800 : 0;
      const lh = new DataView(new ArrayBuffer(30 + nm.length));
      lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, utf, true); lh.setUint16(8, e.method, true);
      lh.setUint16(10, e.time || 0, true); lh.setUint16(12, e.date || 0x21, true); lh.setUint32(14, e.crc, true);
      lh.setUint32(18, e.csize, true); lh.setUint32(22, e.usize, true); lh.setUint16(26, nm.length, true); lh.setUint16(28, 0, true);
      new Uint8Array(lh.buffer).set(nm, 30);
      parts.push(new Uint8Array(lh.buffer), e.raw);
      central.push({ e, nm, utf, off });
      off += 30 + nm.length + e.csize;
    }
    const cdStart = off;
    for (const { e, nm, utf, off: o } of central) {
      const c = new DataView(new ArrayBuffer(46 + nm.length));
      c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, utf, true); c.setUint16(10, e.method, true);
      c.setUint16(12, e.time || 0, true); c.setUint16(14, e.date || 0x21, true); c.setUint32(16, e.crc, true); c.setUint32(20, e.csize, true); c.setUint32(24, e.usize, true);
      c.setUint16(28, nm.length, true); c.setUint32(42, o, true);
      new Uint8Array(c.buffer).set(nm, 46);
      parts.push(new Uint8Array(c.buffer));
      off += 46 + nm.length;
    }
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true); end.setUint16(8, entries.length, true); end.setUint16(10, entries.length, true);
    end.setUint32(12, off - cdStart, true); end.setUint32(16, cdStart, true);
    parts.push(new Uint8Array(end.buffer));
    return new Blob(parts);
  },

  /* ---------------------------------------------------------------- Paket */
  async open(src) {
    const u8 = src instanceof Uint8Array ? src : new Uint8Array(await src.arrayBuffer());
    const pkg = new OoxmlPkg(u8, this.readZip(u8));
    await pkg.init();
    return pkg;
  },
  /* XML ohne Verlust schreiben: Kopfzeile (<?xml … standalone="yes"?>) des Originals behalten */
  serialize(doc, head) {
    let s = new XMLSerializer().serializeToString(doc);
    s = s.replace(/^<\?xml[^>]*\?>\s*/, '');
    return (head || '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n') + s;
  },
  esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); },

  /* ---------------------------------------------------------------- leere Pakete (gültig für Office, LibreOffice) */
  blankParts(kind) {
    const X = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n';
    const ct = (over) => X + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Default Extension="jpeg" ContentType="image/jpeg"/>' +
      over.map(([p, t]) => `<Override PartName="/${p}" ContentType="${t}"/>`).join('') + '</Types>';
    const rels = (list) => X + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' + list.map(([id, t, tg]) => `<Relationship Id="${id}" Type="${t}" Target="${tg}"/>`).join('') + '</Relationships>';
    const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/';
    const OFF = 'application/vnd.openxmlformats-officedocument.';
    const core = X + '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:creator>KnowledgeTree</dc:creator></cp:coreProperties>';
    const theme = X + '<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="KnowledgeTree"><a:themeElements><a:clrScheme name="KnowledgeTree"><a:dk1><a:sysClr val="windowText" lastClr="000000"/></a:dk1><a:lt1><a:sysClr val="window" lastClr="FFFFFF"/></a:lt1><a:dk2><a:srgbClr val="1F2937"/></a:dk2><a:lt2><a:srgbClr val="F3F4F6"/></a:lt2><a:accent1><a:srgbClr val="7048E8"/></a:accent1><a:accent2><a:srgbClr val="2F6FD6"/></a:accent2><a:accent3><a:srgbClr val="2B8A3E"/></a:accent3><a:accent4><a:srgbClr val="E8590C"/></a:accent4><a:accent5><a:srgbClr val="C2185B"/></a:accent5><a:accent6><a:srgbClr val="0B7285"/></a:accent6><a:hlink><a:srgbClr val="2F6FD6"/></a:hlink><a:folHlink><a:srgbClr val="7048E8"/></a:folHlink></a:clrScheme><a:fontScheme name="KnowledgeTree"><a:majorFont><a:latin typeface="Calibri Light"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont><a:minorFont><a:latin typeface="Calibri"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont></a:fontScheme><a:fmtScheme name="KnowledgeTree"><a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:fillStyleLst><a:lnStyleLst><a:ln w="6350"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln><a:ln w="12700"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln><a:ln w="19050"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln></a:lnStyleLst><a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst><a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:bgFillStyleLst></a:fmtScheme></a:themeElements></a:theme>';
    if (kind === 'docx') {
      const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
      const hs = [1, 2, 3].map(n => `<w:style w:type="paragraph" w:styleId="Heading${n}"><w:name w:val="heading ${n}"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="${[360, 240, 200][n - 1]}" w:after="80"/><w:outlineLvl w:val="${n - 1}"/></w:pPr><w:rPr><w:rFonts w:asciiTheme="majorHAnsi" w:hAnsiTheme="majorHAnsi"/><w:b/><w:color w:val="${['2F2F7F', '3F3F8F', '4F4F9F'][n - 1]}"/><w:sz w:val="${[36, 30, 26][n - 1]}"/></w:rPr></w:style>`).join('');
      return {
        '[Content_Types].xml': ct([['word/document.xml', OFF + 'wordprocessingml.document.main+xml'], ['word/styles.xml', OFF + 'wordprocessingml.styles+xml'], ['word/numbering.xml', OFF + 'wordprocessingml.numbering+xml'], ['word/theme/theme1.xml', OFF + 'theme+xml'], ['docProps/core.xml', 'application/vnd.openxmlformats-package.core-properties+xml']]),
        '_rels/.rels': rels([['rId1', R + 'officeDocument', 'word/document.xml'], ['rId2', 'http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties', 'docProps/core.xml']]),
        'word/_rels/document.xml.rels': rels([['rId1', R + 'styles', 'styles.xml'], ['rId2', R + 'numbering', 'numbering.xml'], ['rId3', R + 'theme', 'theme/theme1.xml']]),
        'word/document.xml': X + `<w:document ${W}><w:body><w:p/><w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1417" w:right="1417" w:bottom="1134" w:left="1417" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr></w:body></w:document>`,
        'word/styles.xml': X + `<w:styles ${W}><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:asciiTheme="minorHAnsi" w:hAnsiTheme="minorHAnsi" w:eastAsiaTheme="minorHAnsi" w:cstheme="minorBidi"/><w:sz w:val="22"/><w:szCs w:val="22"/><w:lang w:val="de-CH"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="120" w:line="264" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>${hs}<w:style w:type="paragraph" w:styleId="ListParagraph"><w:name w:val="List Paragraph"/><w:basedOn w:val="Normal"/><w:pPr><w:ind w:left="720"/></w:pPr></w:style><w:style w:type="table" w:default="1" w:styleId="TableNormal"><w:name w:val="Normal Table"/><w:tblPr><w:tblInd w:w="0" w:type="dxa"/><w:tblCellMar><w:top w:w="0" w:type="dxa"/><w:left w:w="108" w:type="dxa"/><w:bottom w:w="0" w:type="dxa"/><w:right w:w="108" w:type="dxa"/></w:tblCellMar></w:tblPr></w:style><w:style w:type="table" w:styleId="TableGrid"><w:name w:val="Table Grid"/><w:basedOn w:val="TableNormal"/><w:tblPr><w:tblBorders><w:top w:val="single" w:sz="4" w:space="0" w:color="auto"/><w:left w:val="single" w:sz="4" w:space="0" w:color="auto"/><w:bottom w:val="single" w:sz="4" w:space="0" w:color="auto"/><w:right w:val="single" w:sz="4" w:space="0" w:color="auto"/><w:insideH w:val="single" w:sz="4" w:space="0" w:color="auto"/><w:insideV w:val="single" w:sz="4" w:space="0" w:color="auto"/></w:tblBorders></w:tblPr></w:style></w:styles>`,
        'word/numbering.xml': X + `<w:numbering ${W}><w:abstractNum w:abstractNumId="0"><w:multiLevelType w:val="hybridMultilevel"/>${[0, 1, 2].map(l => `<w:lvl w:ilvl="${l}"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="${['•', '◦', '▪'][l]}"/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="${720 + 360 * l}" w:hanging="360"/></w:pPr></w:lvl>`).join('')}</w:abstractNum><w:abstractNum w:abstractNumId="1"><w:multiLevelType w:val="hybridMultilevel"/>${[0, 1, 2].map(l => `<w:lvl w:ilvl="${l}"><w:start w:val="1"/><w:numFmt w:val="${['decimal', 'lowerLetter', 'lowerRoman'][l]}"/><w:lvlText w:val="%${l + 1}."/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="${720 + 360 * l}" w:hanging="360"/></w:pPr></w:lvl>`).join('')}</w:abstractNum><w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num><w:num w:numId="2"><w:abstractNumId w:val="1"/></w:num></w:numbering>`,
        'word/theme/theme1.xml': theme,
        'docProps/core.xml': core,
      };
    }
    if (kind === 'xlsx') {
      const S = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
      return {
        '[Content_Types].xml': ct([['xl/workbook.xml', OFF + 'spreadsheetml.sheet.main+xml'], ['xl/worksheets/sheet1.xml', OFF + 'spreadsheetml.worksheet+xml'], ['xl/styles.xml', OFF + 'spreadsheetml.styles+xml'], ['xl/theme/theme1.xml', OFF + 'theme+xml'], ['docProps/core.xml', 'application/vnd.openxmlformats-package.core-properties+xml']]),
        '_rels/.rels': rels([['rId1', R + 'officeDocument', 'xl/workbook.xml'], ['rId2', 'http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties', 'docProps/core.xml']]),
        'xl/_rels/workbook.xml.rels': rels([['rId1', R + 'worksheet', 'worksheets/sheet1.xml'], ['rId2', R + 'styles', 'styles.xml'], ['rId3', R + 'theme', 'theme/theme1.xml']]),
        'xl/workbook.xml': X + `<workbook ${S}><sheets><sheet name="Tabelle1" sheetId="1" r:id="rId1"/></sheets></workbook>`,
        'xl/worksheets/sheet1.xml': X + `<worksheet ${S}><sheetData/></worksheet>`,
        'xl/styles.xml': X + `<styleSheet ${S}><fonts count="2"><font><sz val="11"/><name val="Calibri"/><family val="2"/></font><font><b/><sz val="11"/><name val="Calibri"/><family val="2"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs><cellStyles count="1"><cellStyle name="Standard" xfId="0" builtinId="0"/></cellStyles></styleSheet>`,
        'xl/theme/theme1.xml': theme,
        'docProps/core.xml': core,
      };
    }
    if (kind === 'pptx') {
      const P = 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"';
      const tree = (inner = '') => `<p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>${inner}</p:spTree></p:cSld>`;
      const map = '<p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/>';
      return {
        '[Content_Types].xml': ct([['ppt/presentation.xml', OFF + 'presentationml.presentation.main+xml'], ['ppt/slideMasters/slideMaster1.xml', OFF + 'presentationml.slideMaster+xml'], ['ppt/slideLayouts/slideLayout1.xml', OFF + 'presentationml.slideLayout+xml'], ['ppt/slides/slide1.xml', OFF + 'presentationml.slide+xml'], ['ppt/theme/theme1.xml', OFF + 'theme+xml'], ['docProps/core.xml', 'application/vnd.openxmlformats-package.core-properties+xml']]),
        '_rels/.rels': rels([['rId1', R + 'officeDocument', 'ppt/presentation.xml'], ['rId2', 'http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties', 'docProps/core.xml']]),
        'ppt/_rels/presentation.xml.rels': rels([['rId1', R + 'slideMaster', 'slideMasters/slideMaster1.xml'], ['rId2', R + 'slide', 'slides/slide1.xml'], ['rId3', R + 'theme', 'theme/theme1.xml']]),
        'ppt/presentation.xml': X + `<p:presentation ${P} saveSubsetFonts="1"><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst><p:sldIdLst><p:sldId id="256" r:id="rId2"/></p:sldIdLst><p:sldSz cx="12192000" cy="6858000"/><p:notesSz cx="6858000" cy="9144000"/></p:presentation>`,
        'ppt/slideMasters/_rels/slideMaster1.xml.rels': rels([['rId1', R + 'slideLayout', '../slideLayouts/slideLayout1.xml'], ['rId2', R + 'theme', '../theme/theme1.xml']]),
        'ppt/slideMasters/slideMaster1.xml': X + `<p:sldMaster ${P}>${tree()}${map}<p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst><p:txStyles><p:titleStyle><a:lvl1pPr><a:defRPr sz="4000"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:latin typeface="+mj-lt"/></a:defRPr></a:lvl1pPr></p:titleStyle><p:bodyStyle><a:lvl1pPr><a:defRPr sz="2400"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:latin typeface="+mn-lt"/></a:defRPr></a:lvl1pPr></p:bodyStyle><p:otherStyle><a:lvl1pPr><a:defRPr sz="1800"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill></a:defRPr></a:lvl1pPr></p:otherStyle></p:txStyles></p:sldMaster>`,
        'ppt/slideLayouts/_rels/slideLayout1.xml.rels': rels([['rId1', R + 'slideMaster', '../slideMasters/slideMaster1.xml']]),
        'ppt/slideLayouts/slideLayout1.xml': X + `<p:sldLayout ${P} type="blank" preserve="1"><p:cSld name="Leer"><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr></p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>`,
        'ppt/slides/_rels/slide1.xml.rels': rels([['rId1', R + 'slideLayout', '../slideLayouts/slideLayout1.xml']]),
        'ppt/slides/slide1.xml': X + `<p:sld ${P}>${tree()}<p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`,
        'ppt/theme/theme1.xml': theme,
        'docProps/core.xml': core,
      };
    }
    throw new Error('Unbekanntes Office-Format: ' + kind);
  },
  // neues Paket als Datei (Blob) – gepackt, [Content_Types].xml zuerst
  async blank(kind) {
    const parts = this.blankParts(kind);
    const enc = new TextEncoder(), entries = [];
    for (const [name, text] of Object.entries(parts)) entries.push(await this.entry(name, enc.encode(text)));
    return this.writeZip(entries);
  },
  async entry(name, u8, prev) {
    const z = await this.deflate(u8);
    return { name, method: 8, crc: this.crc32(u8), csize: z.length, usize: u8.length, raw: z, time: prev ? prev.time : 0, date: prev ? prev.date : 0x21 };
  },
};

/* Ein geöffnetes Paket. Inhalte werden erst beim Lesen entpackt; Änderungen merkt sich `changed`. */
class OoxmlPkg {
  constructor(src, entries) {
    this.src = src;                       // Original-Bytes (für den unveränderten Export)
    this.entries = entries;               // Original-Reihenfolge
    this.byName = new Map(entries.map(e => [e.name, e]));
    this.cache = new Map();               // Pfad → Uint8Array (entpackt)
    this.docs = new Map();                // Pfad → { doc, head }
    this.changed = new Map();             // Pfad → Uint8Array | null (null = entfernt)
    this.added = [];                      // neue Pfade in Reihenfolge
    this.kind = '';
  }
  async init() {
    const ct = await this.text('[Content_Types].xml');
    const main = (/PartName="\/?([^"]+)"\s+ContentType="([^"]+(main\+xml|macroEnabled[^"]*))"/.exec(ct) || []);
    for (const [re, k] of Ooxml.MAIN) if (re.test(ct)) { this.kind = k; break; }
    this.main = main[1] || '';
    this.mainType = main[2] || '';
    if (!this.main) {   // über _rels/.rels
      const r = (await this.rels('')).find(x => x.type === Ooxml.REL.doc);
      if (r) this.main = r.path;
    }
  }
  paths() { return [...this.entries.map(e => e.name).filter(n => !(this.changed.has(n) && this.changed.get(n) === null)), ...this.added]; }
  has(path) { return this.changed.has(path) ? this.changed.get(path) !== null : this.byName.has(path); }
  async bytes(path) {
    if (this.changed.has(path)) { const v = this.changed.get(path); if (v === null) throw new Error('Teil entfernt: ' + path); return v; }
    if (this.cache.has(path)) return this.cache.get(path);
    const e = this.byName.get(path);
    if (!e) throw new Error('Teil fehlt: ' + path);
    const u8 = e.method === 0 ? e.raw : e.method === 8 ? await Ooxml.inflate(e.raw) : (() => { throw new Error('Packverfahren ' + e.method + ' nicht unterstützt'); })();
    this.cache.set(path, u8);
    return u8;
  }
  async text(path) { return new TextDecoder().decode(await this.bytes(path)); }
  async xml(path) {
    if (this.docs.has(path)) return this.docs.get(path).doc;
    const t = await this.text(path);
    const head = (/^﻿?<\?xml[^>]*\?>\s*/.exec(t) || [''])[0];
    const doc = new DOMParser().parseFromString(t, 'application/xml');
    if (doc.getElementsByTagName('parsererror').length) throw new Error('XML fehlerhaft: ' + path);
    this.docs.set(path, { doc, head: head ? head.replace(/^﻿/, '') : '' });
    return doc;
  }
  /* geändertes XML zurückschreiben (nur dieser Teil wird neu gepackt) */
  setXml(path, doc) { const h = this.docs.get(path); this.setText(path, Ooxml.serialize(doc || h.doc, h && h.head)); if (h && doc) h.doc = doc; }
  setText(path, s) { this.setBytes(path, new TextEncoder().encode(s)); }
  setBytes(path, u8) { if (!this.byName.has(path) && !this.added.includes(path)) this.added.push(path); this.changed.set(path, u8); this.cache.delete(path); }
  remove(path) { if (this.byName.has(path)) this.changed.set(path, null); this.added = this.added.filter(p => p !== path); this.docs.delete(path); }
  get dirty() { return this.changed.size > 0; }
  /* Beziehungen eines Teils ('' = Paket) → [{ id, type, target, mode, path }] */
  relsPath(part) { if (!part) return '_rels/.rels'; const i = part.lastIndexOf('/'); return part.slice(0, i + 1) + '_rels/' + part.slice(i + 1) + '.rels'; }
  async rels(part) {
    const rp = this.relsPath(part);
    if (!this.has(rp)) return [];
    const t = await this.text(rp), out = [];
    const base = part ? part.slice(0, part.lastIndexOf('/') + 1) : '';
    for (const m of t.matchAll(/<Relationship\b([^>]*)\/?>/g)) {
      const at = (k) => { const x = new RegExp('\\b' + k + '="([^"]*)"').exec(m[1]); return x ? x[1].replace(/&amp;/g, '&') : ''; };
      const target = at('Target'), mode = at('TargetMode');
      out.push({ id: at('Id'), type: at('Type'), target, mode, path: mode === 'External' ? '' : this.resolve(base, target) });
    }
    return out;
  }
  resolve(base, target) {
    if (target.startsWith('/')) return target.slice(1);
    const parts = (base + target).split('/'), out = [];
    for (const p of parts) { if (p === '..') out.pop(); else if (p !== '.' && p !== '') out.push(p); }
    return out.join('/');
  }
  /* Beziehung ergänzen → neue rId */
  async addRel(part, type, target) {
    const rp = this.relsPath(part);
    let t = this.has(rp) ? await this.text(rp) : '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>';
    let n = 1; while (new RegExp('Id="rId' + n + '"').test(t)) n++;
    const id = 'rId' + n;
    t = t.replace('</Relationships>', `<Relationship Id="${id}" Type="${type}" Target="${Ooxml.esc(target)}"/></Relationships>`);
    this.setText(rp, t);
    return id;
  }
  /* Beziehung entfernen */
  async removeRel(part, id) {
    const rp = this.relsPath(part);
    if (!this.has(rp)) return;
    const t = await this.text(rp);
    const n = t.replace(new RegExp('<Relationship\\b[^>]*\\bId="' + id + '"[^>]*/>'), '');
    if (n !== t) this.setText(rp, n);
  }
  /* Teil samt eigener Beziehungen und Content-Type-Eintrag entfernen */
  async removePart(path) {
    if (!this.has(path)) return;
    this.remove(path);
    const rp = this.relsPath(path);
    if (this.has(rp)) this.remove(rp);
    const t = await this.text('[Content_Types].xml');
    const n = t.replace(new RegExp('<Override\\s+PartName="/' + path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '"[^>]*/>'), '');
    if (n !== t) this.setText('[Content_Types].xml', n);
  }
  /* freier Teilname: ppt/slides/slide%.xml → ppt/slides/slide7.xml */
  freeName(pattern) { let n = 1; while (this.has(pattern.replace('%', n))) n++; return pattern.replace('%', n); }
  async contentType(path) {
    const t = await this.text('[Content_Types].xml');
    const o = new RegExp('PartName="/' + path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '"\\s+ContentType="([^"]+)"').exec(t);
    if (o) return o[1];
    const ext = path.split('.').pop().toLowerCase();
    const d = new RegExp('Extension="' + ext + '"\\s+ContentType="([^"]+)"', 'i').exec(t);
    return d ? d[1] : '';
  }
  async addPart(path, data, contentType) {
    this.setBytes(path, typeof data === 'string' ? new TextEncoder().encode(data) : data);
    if (!contentType) return;
    let t = await this.text('[Content_Types].xml');
    const ext = path.split('.').pop().toLowerCase();
    if (/^(png|jpe?g|gif|bmp|webp|svg|emf|wmf|tiff?)$/.test(ext)) {
      if (!new RegExp('Extension="' + ext + '"', 'i').test(t)) t = t.replace('</Types>', `<Default Extension="${ext}" ContentType="${contentType}"/></Types>`);
    } else if (!t.includes(`PartName="/${path}"`)) t = t.replace('</Types>', `<Override PartName="/${path}" ContentType="${contentType}"/></Types>`);
    this.setText('[Content_Types].xml', t);
  }
  /* Speichern: unverändert = Original; sonst Original-Reihenfolge, nur Geändertes neu gepackt, Neues hinten */
  async save() {
    const mime = Ooxml.MIME[this.kind] || 'application/zip';
    if (!this.dirty) return new Blob([this.src], { type: mime });
    const out = [];
    for (const e of this.entries) {
      if (!this.changed.has(e.name)) { out.push(e); continue; }
      const v = this.changed.get(e.name);
      if (v === null) continue;
      out.push(await Ooxml.entry(e.name, v, e));
    }
    for (const p of this.added) if (this.changed.get(p)) out.push(await Ooxml.entry(p, this.changed.get(p)));
    const b = Ooxml.writeZip(out);
    return new Blob([b], { type: mime });
  }
}
if (typeof module !== 'undefined') module.exports = { Ooxml, OoxmlPkg };
