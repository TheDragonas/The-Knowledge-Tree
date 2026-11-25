#!/usr/bin/env python3
"""Word-Testdatei wie aus Word (1.74): Inhaltsverzeichnis mit Verknüpfungen, gedrehte/zugeschnittene/EXIF-Bilder,
verankerte Bilder, VML-Bild, Textfelder (mc:AlternateContent + VML), Formatvorlagen, verbundene Tabellenzellen,
Seitenumbrüche (pageBreakBefore, Umbruch am Absatzende, Abschnittswechsel).

Aufruf: python3 word-fixtures.py <Ordner>  →  <Ordner>/word174.docx
"""
import io
import sys
import zipfile
from pathlib import Path

from PIL import Image

EMU = 9525  # 1 px (96 dpi)


def png_halves(w=200, h=100, a=(220, 30, 30), b=(30, 60, 220)):
    im = Image.new('RGB', (w, h), a)
    for x in range(w // 2, w):
        for y in range(h):
            im.putpixel((x, y), b)
    buf = io.BytesIO()
    im.save(buf, 'PNG')
    return buf.getvalue(), im


def jpeg_exif6():
    # Pixel quer (200×100, links rot, rechts blau), EXIF-Ausrichtung 6 = um 90° im Uhrzeigersinn zu drehen
    _, im = png_halves()
    ex = im.getexif()
    ex[0x0112] = 6
    buf = io.BytesIO()
    im.save(buf, 'JPEG', quality=92, exif=ex)
    return buf.getvalue()


def grid_png(w=240, h=120):
    im = Image.new('RGB', (w, h), (255, 255, 255))
    for x in range(w):
        for y in range(h):
            if x < w // 4:
                im.putpixel((x, y), (0, 160, 0))        # wird weggeschnitten
            elif x >= w * 3 // 4:
                im.putpixel((x, y), (0, 0, 0))          # wird weggeschnitten
            else:
                im.putpixel((x, y), (250, 200, 0))      # bleibt (gelb)
    buf = io.BytesIO()
    im.save(buf, 'PNG')
    return buf.getvalue()


NS = ('xmlns:wpc="http://schemas.microsoft.com/office/word/2010/wordprocessingCanvas" '
      'xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006" '
      'xmlns:o="urn:schemas-microsoft-com:office:office" '
      'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" '
      'xmlns:v="urn:schemas-microsoft-com:vml" '
      'xmlns:w10="urn:schemas-microsoft-com:office:word" '
      'xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" '
      'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" '
      'xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml" '
      'xmlns:wps="http://schemas.microsoft.com/office/word/2010/wordprocessingShape" '
      'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" '
      'xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture" '
      'mc:Ignorable="w14"')

LOREM = ('Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore '
         'magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo '
         'consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. '
         'Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.')


def p(text='', style=None, ppr='', rpr='', extra=''):
    pp = (f'<w:pStyle w:val="{style}"/>' if style else '') + ppr
    run = f'<w:r>{"<w:rPr>" + rpr + "</w:rPr>" if rpr else ""}<w:t xml:space="preserve">{text}</w:t></w:r>' if text else ''
    return f'<w:p>{"<w:pPr>" + pp + "</w:pPr>" if pp else ""}{run}{extra}</w:p>'


def heading(level, text, bm, bid, ppr=''):
    return (f'<w:p><w:pPr><w:pStyle w:val="berschrift{level}"/>{ppr}</w:pPr><w:bookmarkStart w:id="{bid}" w:name="{bm}"/>'
            f'<w:r><w:t>{text}</w:t></w:r><w:bookmarkEnd w:id="{bid}"/></w:p>')


def toc_entry(level, text, bm, page, first=False, last=False):
    begin = ('<w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve"> TOC \\o "1-3" \\h \\z \\u </w:instrText></w:r>'
             '<w:r><w:fldChar w:fldCharType="separate"/></w:r>') if first else ''
    end = '<w:r><w:fldChar w:fldCharType="end"/></w:r>' if last else ''
    return (f'<w:p><w:pPr><w:pStyle w:val="Verzeichnis{level}"/><w:tabs><w:tab w:val="right" w:leader="dot" w:pos="9062"/></w:tabs></w:pPr>{begin}'
            f'<w:hyperlink w:anchor="{bm}" w:history="1"><w:r><w:rPr><w:rStyle w:val="Hyperlink"/><w:noProof/></w:rPr><w:t>{text}</w:t></w:r>'
            f'<w:r><w:rPr><w:noProof/><w:webHidden/></w:rPr><w:tab/></w:r>'
            f'<w:r><w:rPr><w:noProof/><w:webHidden/></w:rPr><w:fldChar w:fldCharType="begin"/></w:r>'
            f'<w:r><w:rPr><w:noProof/><w:webHidden/></w:rPr><w:instrText xml:space="preserve"> PAGEREF {bm} \\h </w:instrText></w:r>'
            f'<w:r><w:rPr><w:noProof/><w:webHidden/></w:rPr></w:r><w:r><w:rPr><w:noProof/><w:webHidden/></w:rPr><w:fldChar w:fldCharType="separate"/></w:r>'
            f'<w:r><w:rPr><w:noProof/><w:webHidden/></w:rPr><w:t>{page}</w:t></w:r>'
            f'<w:r><w:rPr><w:noProof/><w:webHidden/></w:rPr><w:fldChar w:fldCharType="end"/></w:r></w:hyperlink>{end}</w:p>')


def pic_graphic(rid, cx, cy, pid, rot=0, flip='', crop=''):
    rot_a = f' rot="{rot}"' if rot else ''
    return (f'<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic>'
            f'<pic:nvPicPr><pic:cNvPr id="{pid}" name="Bild {pid}"/><pic:cNvPicPr/></pic:nvPicPr>'
            f'<pic:blipFill><a:blip r:embed="{rid}"/>{crop}<a:stretch><a:fillRect/></a:stretch></pic:blipFill>'
            f'<pic:spPr><a:xfrm{rot_a}{flip}><a:off x="0" y="0"/><a:ext cx="{cx}" cy="{cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>'
            f'</pic:pic></a:graphicData></a:graphic>')


def inline(rid, wpx, hpx, pid, rot=0, crop='', eff=''):
    cx, cy = wpx * EMU, hpx * EMU
    return (f'<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="{cx}" cy="{cy}"/>'
            f'{eff or "<wp:effectExtent l=\"0\" t=\"0\" r=\"0\" b=\"0\"/>"}<wp:docPr id="{pid}" name="Bild {pid}"/>'
            f'{pic_graphic(rid, cx, cy, pid, rot, "", crop)}</wp:inline></w:drawing></w:r>')


def anchor(rid, wpx, hpx, pid, wrap, xoff, yoff, relh='column', relv='paragraph', behind=0):
    cx, cy = wpx * EMU, hpx * EMU
    return (f'<w:r><w:drawing><wp:anchor distT="0" distB="0" distL="114300" distR="114300" simplePos="0" relativeHeight="25" behindDoc="{behind}" locked="0" layoutInCell="1" allowOverlap="1">'
            f'<wp:simplePos x="0" y="0"/><wp:positionH relativeFrom="{relh}"><wp:posOffset>{xoff * EMU}</wp:posOffset></wp:positionH>'
            f'<wp:positionV relativeFrom="{relv}"><wp:posOffset>{yoff * EMU}</wp:posOffset></wp:positionV><wp:extent cx="{cx}" cy="{cy}"/>'
            f'<wp:effectExtent l="0" t="0" r="0" b="0"/>{wrap}<wp:docPr id="{pid}" name="Bild {pid}"/>'
            f'{pic_graphic(rid, cx, cy, pid)}</wp:anchor></w:drawing></w:r>')


def textbox(pid, wpx, hpx, xoff, yoff, text):
    cx, cy = wpx * EMU, hpx * EMU
    inner = (f'<w:txbxContent><w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:b/><w:color w:val="1F3864"/></w:rPr><w:t>{text}</w:t></w:r></w:p>'
             f'<w:p><w:r><w:t>Zweite Zeile im Textfeld</w:t></w:r></w:p></w:txbxContent>')
    choice = (f'<w:drawing><wp:anchor distT="45720" distB="45720" distL="114300" distR="114300" simplePos="0" relativeHeight="251659264" behindDoc="0" locked="0" layoutInCell="1" allowOverlap="1">'
              f'<wp:simplePos x="0" y="0"/><wp:positionH relativeFrom="column"><wp:posOffset>{xoff * EMU}</wp:posOffset></wp:positionH>'
              f'<wp:positionV relativeFrom="paragraph"><wp:posOffset>{yoff * EMU}</wp:posOffset></wp:positionV><wp:extent cx="{cx}" cy="{cy}"/>'
              f'<wp:effectExtent l="0" t="0" r="0" b="0"/><wp:wrapSquare wrapText="bothSides"/><wp:docPr id="{pid}" name="Textfeld {pid}"/>'
              f'<a:graphic><a:graphicData uri="http://schemas.microsoft.com/office/word/2010/wordprocessingShape"><wps:wsp><wps:cNvSpPr txBox="1"/>'
              f'<wps:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="{cx}" cy="{cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom>'
              f'<a:solidFill><a:srgbClr val="DEEBF7"/></a:solidFill><a:ln w="9525"><a:solidFill><a:srgbClr val="2F5597"/></a:solidFill></a:ln></wps:spPr>'
              f'<wps:txbx>{inner}</wps:txbx><wps:bodyPr rot="0" vert="horz" wrap="square" lIns="91440" tIns="45720" rIns="91440" bIns="45720"/></wps:wsp></a:graphicData></a:graphic></wp:anchor></w:drawing>')
    fallback = (f'<w:pict><v:shapetype id="_x0000_t202" coordsize="21600,21600" o:spt="202" path="m,l,21600r21600,l21600,xe"/>'
                f'<v:shape id="Textfeld {pid}" o:spid="_x0000_s{pid}" type="#_x0000_t202" style="position:absolute;margin-left:{xoff * 0.75}pt;margin-top:{yoff * 0.75}pt;width:{wpx * 0.75}pt;height:{hpx * 0.75}pt;z-index:251659264" fillcolor="#deebf7" strokecolor="#2f5597">'
                f'<v:textbox>{inner}</v:textbox><w10:wrap type="square"/></v:shape></w:pict>')
    return f'<w:r><mc:AlternateContent><mc:Choice Requires="wps">{choice}</mc:Choice><mc:Fallback>{fallback}</mc:Fallback></mc:AlternateContent></w:r>'


def build(out):
    rot_png, _ = png_halves()
    exif_jpg = jpeg_exif6()
    crop_png = grid_png()
    anc_png, _ = png_halves(160, 120, (40, 160, 90), (40, 160, 90))
    bg_png, _ = png_halves(300, 60, (230, 230, 250), (230, 230, 250))
    vml_png, _ = png_halves(80, 40, (120, 0, 120), (120, 0, 120))

    body = []
    body.append(p('Testdokument 1.74', 'Titel'))
    # Inhaltsverzeichnis (Inhaltssteuerelement wie Word)
    toc = [(1, '1 Einleitung', '_Toc1001', 2), (2, '1.1 Hintergrund', '_Toc1002', 2), (1, '2 Bilder', '_Toc1003', 4),
           (1, '3 Textfelder', '_Toc1004', 5), (1, '4 Tabellen', '_Toc1005', 5)]
    entries = ''.join(toc_entry(l, t, b, pg, i == 0, i == len(toc) - 1) for i, (l, t, b, pg) in enumerate(toc))
    body.append('<w:sdt><w:sdtPr><w:id w:val="-1"/><w:docPartObj><w:docPartGallery w:val="Table of Contents"/><w:docPartUnique/></w:docPartObj></w:sdtPr>'
                f'<w:sdtContent>{p("Inhalt", "Inhaltsverzeichnisberschrift")}{entries}</w:sdtContent></w:sdt>')
    # 1 Einleitung – beginnt auf neuer Seite (pageBreakBefore)
    body.append(heading(1, '1 Einleitung', '_Toc1001', 1, '<w:pageBreakBefore/>'))
    body.append(p('Ein Absatz mit grosser roter Schrift.', rpr='<w:color w:val="C00000"/><w:sz w:val="28"/>'))
    body.append(p('Gelb markiert in Times New Roman.', rpr='<w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:highlight w:val="yellow"/>'))
    body.append(p('Eingerückt, Blocksatz, 1,5-zeilig, 12 pt danach. ' + LOREM,
                  ppr='<w:spacing w:after="240" w:line="360" w:lineRule="auto"/><w:ind w:left="720" w:firstLine="360"/><w:jc w:val="both"/>'))
    body.append('<w:p><w:r><w:t xml:space="preserve">Verweis im Text: </w:t></w:r><w:hyperlink w:anchor="_Toc1003"><w:r><w:rPr><w:rStyle w:val="Hyperlink"/></w:rPr><w:t>siehe Bilder</w:t></w:r></w:hyperlink></w:p>')
    body.append(heading(2, '1.1 Hintergrund', '_Toc1002', 2))
    for k in range(9):
        body.append(p(f'Absatz {k + 1}. ' + LOREM + ' ' + LOREM))
    # 2 Bilder
    body.append(heading(1, '2 Bilder', '_Toc1003', 3, '<w:pageBreakBefore/>'))
    body.append(p('Gedreht (90°):', extra=inline('rIdImg1', 200, 100, 11, rot=5400000, eff='<wp:effectExtent l="47625" t="-47625" r="47625" b="-47625"/>')))
    body.append(p('Zugeschnitten (links/rechts je 25 %):', extra=inline('rIdImg3', 120, 120, 12, crop='<a:srcRect l="25000" r="25000"/>')))
    body.append(p('EXIF-Ausrichtung 6:', extra=inline('rIdImg2', 100, 200, 13)))
    body.append(p('Verankert, Text umfliesst das Bild rechts. ' + LOREM,
                  extra=anchor('rIdImg4', 160, 120, 14, '<wp:wrapSquare wrapText="bothSides"/>', 440, 0)))
    body.append(p('Hinter dem Text (ohne Umbruch).', extra=anchor('rIdImg5', 300, 60, 15, '<wp:wrapNone/>', 0, 0, 'column', 'paragraph', 1)))
    body.append('<w:p><w:r><w:t xml:space="preserve">VML-Bild: </w:t></w:r><w:r><w:pict><v:shape id="vml1" type="#_x0000_t75" style="width:150pt;height:75pt"><v:imagedata r:id="rIdImg6" o:title=""/></v:shape></w:pict></w:r></w:p>')
    # 3 Textfelder
    body.append(heading(1, '3 Textfelder', '_Toc1004', 4))
    body.append(p('Absatz mit Textfeld. ' + LOREM, extra=textbox(21, 220, 90, 380, 0, 'Text im Textfeld')))
    body.append(p('Nach dem Textfeld.'))
    # 4 Tabellen
    body.append(heading(1, '4 Tabellen', '_Toc1005', 5))
    cell = lambda t, pr='': f'<w:tc><w:tcPr><w:tcW w:w="3000" w:type="dxa"/>{pr}</w:tcPr><w:p><w:r><w:t>{t}</w:t></w:r></w:p></w:tc>'
    body.append('<w:tbl><w:tblPr><w:tblStyle w:val="Tabellenraster"/><w:tblW w:w="0" w:type="auto"/></w:tblPr><w:tblGrid><w:gridCol w:w="3000"/><w:gridCol w:w="3000"/><w:gridCol w:w="3000"/></w:tblGrid>'
                f'<w:tr>{cell("Verbunden", "<w:vMerge w:val=\"restart\"/>")}{cell("Kopf B", "<w:shd w:val=\"clear\" w:color=\"auto\" w:fill=\"FFFF00\"/>")}{cell("Kopf C")}</w:tr>'
                f'<w:tr>{cell("", "<w:vMerge/>")}{cell("B2")}{cell("C2")}</w:tr>'
                f'<w:tr><w:tc><w:tcPr><w:tcW w:w="9000" w:type="dxa"/><w:gridSpan w:val="3"/></w:tcPr><w:p><w:r><w:t>Über drei Spalten</w:t></w:r></w:p></w:tc></w:tr></w:tbl>')
    body.append(p('Text vor dem Umbruch', extra='<w:r><w:br w:type="page"/></w:r>'))
    body.append(p('Nach dem Umbruch (neue Seite).'))
    body.append('<w:p><w:pPr><w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1417" w:right="1417" w:bottom="1134" w:left="1417" w:header="708" w:footer="708" w:gutter="0"/><w:cols w:space="708"/></w:sectPr></w:pPr><w:r><w:t>Ende Abschnitt 1</w:t></w:r></w:p>')
    body.append(p('Abschnitt 2 auf neuer Seite.'))
    sect = '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1417" w:right="1417" w:bottom="1134" w:left="1417" w:header="708" w:footer="708" w:gutter="0"/><w:cols w:space="708"/></w:sectPr>'
    document = f'<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<w:document {NS}><w:body>{"".join(body)}{sect}</w:body></w:document>'

    W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"'
    styles = (f'<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<w:styles {W}>'
              '<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/><w:sz w:val="22"/><w:szCs w:val="22"/><w:lang w:val="de-CH"/></w:rPr></w:rPrDefault>'
              '<w:pPrDefault><w:pPr><w:spacing w:after="160" w:line="259" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>'
              '<w:style w:type="paragraph" w:default="1" w:styleId="Standard"><w:name w:val="Normal"/><w:qFormat/></w:style>'
              '<w:style w:type="paragraph" w:styleId="berschrift1"><w:name w:val="heading 1"/><w:basedOn w:val="Standard"/><w:next w:val="Standard"/><w:qFormat/>'
              '<w:pPr><w:keepNext/><w:keepLines/><w:spacing w:before="240" w:after="0"/><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:rFonts w:ascii="Calibri Light" w:hAnsi="Calibri Light"/><w:color w:val="2F5496"/><w:sz w:val="32"/></w:rPr></w:style>'
              '<w:style w:type="paragraph" w:styleId="berschrift2"><w:name w:val="heading 2"/><w:basedOn w:val="Standard"/><w:next w:val="Standard"/><w:qFormat/>'
              '<w:pPr><w:keepNext/><w:spacing w:before="40" w:after="0"/><w:outlineLvl w:val="1"/></w:pPr><w:rPr><w:color w:val="2F5496"/><w:sz w:val="26"/></w:rPr></w:style>'
              '<w:style w:type="paragraph" w:styleId="Titel"><w:name w:val="Title"/><w:basedOn w:val="Standard"/><w:qFormat/><w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr><w:rPr><w:sz w:val="56"/><w:spacing w:val="-10"/></w:rPr></w:style>'
              '<w:style w:type="paragraph" w:styleId="Inhaltsverzeichnisberschrift"><w:name w:val="TOC Heading"/><w:basedOn w:val="berschrift1"/><w:next w:val="Standard"/><w:pPr><w:outlineLvl w:val="9"/></w:pPr></w:style>'
              '<w:style w:type="paragraph" w:styleId="Verzeichnis1"><w:name w:val="toc 1"/><w:basedOn w:val="Standard"/><w:next w:val="Standard"/><w:pPr><w:spacing w:after="100"/></w:pPr></w:style>'
              '<w:style w:type="paragraph" w:styleId="Verzeichnis2"><w:name w:val="toc 2"/><w:basedOn w:val="Standard"/><w:next w:val="Standard"/><w:pPr><w:spacing w:after="100"/><w:ind w:left="220"/></w:pPr></w:style>'
              '<w:style w:type="character" w:styleId="Hyperlink"><w:name w:val="Hyperlink"/><w:rPr><w:color w:val="0563C1"/><w:u w:val="single"/></w:rPr></w:style>'
              '<w:style w:type="table" w:styleId="Tabellenraster"><w:name w:val="Table Grid"/><w:tblPr><w:tblBorders><w:top w:val="single" w:sz="4" w:space="0" w:color="auto"/><w:left w:val="single" w:sz="4" w:space="0" w:color="auto"/><w:bottom w:val="single" w:sz="4" w:space="0" w:color="auto"/><w:right w:val="single" w:sz="4" w:space="0" w:color="auto"/><w:insideH w:val="single" w:sz="4" w:space="0" w:color="auto"/><w:insideV w:val="single" w:sz="4" w:space="0" w:color="auto"/></w:tblBorders></w:tblPr></w:style>'
              '</w:styles>')
    rels = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
            '<Relationship Id="rIdSt" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>'
            '<Relationship Id="rIdImg1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/image1.png"/>'
            '<Relationship Id="rIdImg2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/image2.jpeg"/>'
            '<Relationship Id="rIdImg3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/image3.png"/>'
            '<Relationship Id="rIdImg4" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/image4.png"/>'
            '<Relationship Id="rIdImg5" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/image5.png"/>'
            '<Relationship Id="rIdImg6" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/image6.png"/>'
            '</Relationships>')
    ct = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
          '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>'
          '<Default Extension="png" ContentType="image/png"/><Default Extension="jpeg" ContentType="image/jpeg"/>'
          '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>'
          '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>')
    root = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
            '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>')
    out.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED) as z:
        z.writestr('[Content_Types].xml', ct)
        z.writestr('_rels/.rels', root)
        z.writestr('word/document.xml', document)
        z.writestr('word/styles.xml', styles)
        z.writestr('word/_rels/document.xml.rels', rels)
        z.writestr('word/media/image1.png', rot_png)
        z.writestr('word/media/image2.jpeg', exif_jpg)
        z.writestr('word/media/image3.png', crop_png)
        z.writestr('word/media/image4.png', anc_png)
        z.writestr('word/media/image5.png', bg_png)
        z.writestr('word/media/image6.png', vml_png)


def unwrap_toc(src, out):
    # ältere Word-Dateien: Verzeichnis nur als TOC-Feld über mehrere Absätze (ohne Inhaltssteuerelement)
    import re
    zin = zipfile.ZipFile(src)
    with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED) as z:
        for it in zin.infolist():
            b = zin.read(it.filename)
            if it.filename == 'word/document.xml':
                t = b.decode('utf8')
                t = re.sub(r'<w:sdt><w:sdtPr>.*?</w:sdtPr><w:sdtContent>(.*?)</w:sdtContent></w:sdt>', r'\1', t, count=1, flags=re.S)
                b = t.encode('utf8')
            z.writestr(it, b)


if __name__ == '__main__':
    d = Path(sys.argv[1] if len(sys.argv) > 1 else '/tmp/kt-word')
    build(d / 'word174.docx')
    unwrap_toc(d / 'word174.docx', d / 'word174-feld.docx')
    print(d / 'word174.docx')
