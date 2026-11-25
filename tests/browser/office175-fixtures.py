#!/usr/bin/env python3
"""Testdateien 1.75: Word (Kopfzeile mit Logo, Fuss-/Endnoten, Tabelle mit Bild, Diagramm, Gruppe, SmartArt, Textfeld
mit fester Höhe), PowerPoint (zugeschnittenes/gedrehtes Bild, Diagramm), Excel (Bild an Zelle, Diagramm mit Bezug).

Aufruf: python3 office175-fixtures.py <Ordner>  →  word175.docx, p175.pptx, x175.xlsx
"""
import io
import sys
import zipfile
from pathlib import Path

from PIL import Image

EMU = 9525


def png(w, h, a, b=None):
    im = Image.new('RGB', (w, h), a)
    if b:
        for x in range(w // 2, w):
            for y in range(h):
                im.putpixel((x, y), b)
    buf = io.BytesIO()
    im.save(buf, 'PNG')
    return buf.getvalue()


W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"'
NS = ('xmlns:wpc="http://schemas.microsoft.com/office/word/2010/wordprocessingCanvas" '
      'xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006" '
      'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" '
      'xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" '
      'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" '
      'xmlns:wps="http://schemas.microsoft.com/office/word/2010/wordprocessingShape" '
      'xmlns:wpg="http://schemas.microsoft.com/office/word/2010/wordprocessingGroup" '
      'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" '
      'xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture" '
      'xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" '
      'xmlns:dgm="http://schemas.openxmlformats.org/drawingml/2006/diagram"')


def pic(rid, w, h, pid):
    cx, cy = w * EMU, h * EMU
    return (f'<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="{pid}" name="B{pid}"/><pic:cNvPicPr/></pic:nvPicPr>'
            f'<pic:blipFill><a:blip r:embed="{rid}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="{cx}" cy="{cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic>')


def inline(inner, w, h, pid):
    return (f'<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="{w * EMU}" cy="{h * EMU}"/><wp:effectExtent l="0" t="0" r="0" b="0"/>'
            f'<wp:docPr id="{pid}" name="O{pid}"/>{inner}</wp:inline></w:drawing></w:r>')


def p(t='', extra='', ppr=''):
    return f'<w:p>{"<w:pPr>" + ppr + "</w:pPr>" if ppr else ""}{f"<w:r><w:t xml:space=\"preserve\">{t}</w:t></w:r>" if t else ""}{extra}</w:p>'


CHART = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">'
         '<c:chart><c:title><c:tx><c:rich><a:bodyPr/><a:p><a:r><a:t>Umsatz je Quartal</a:t></a:r></a:p></c:rich></c:tx></c:title><c:autoTitleDeleted val="0"/><c:plotArea>'
         '<c:barChart><c:barDir val="col"/><c:grouping val="clustered"/>'
         + ''.join(f'<c:ser><c:idx val="{i}"/><c:order val="{i}"/><c:tx><c:strRef><c:f>Tabelle1!${"BC"[i]}$1</c:f><c:strCache><c:ptCount val="1"/><c:pt idx="0"><c:v>{n}</c:v></c:pt></c:strCache></c:strRef></c:tx>'
                   f'<c:cat><c:strRef><c:f>Tabelle1!$A$2:$A$4</c:f><c:strCache><c:ptCount val="3"/><c:pt idx="0"><c:v>Q1</c:v></c:pt><c:pt idx="1"><c:v>Q2</c:v></c:pt><c:pt idx="2"><c:v>Q3</c:v></c:pt></c:strCache></c:strRef></c:cat>'
                   f'<c:val><c:numRef><c:f>Tabelle1!${"BC"[i]}$2:${"BC"[i]}$4</c:f><c:numCache><c:formatCode>General</c:formatCode><c:ptCount val="3"/>' + ''.join(f'<c:pt idx="{k}"><c:v>{v}</c:v></c:pt>' for k, v in enumerate(vals)) + '</c:numCache></c:numRef></c:val></c:ser>'
                   for i, (n, vals) in enumerate([('2025', [4, 6, 5]), ('2026', [5, 7, 9])]))
         + '<c:axId val="1"/><c:axId val="2"/></c:barChart><c:catAx><c:axId val="1"/><c:crossAx val="2"/></c:catAx><c:valAx><c:axId val="2"/><c:crossAx val="1"/></c:valAx></c:plotArea>'
         '<c:legend><c:legendPos val="b"/></c:legend></c:chart></c:chartSpace>')

DATA = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<dgm:dataModel xmlns:dgm="http://schemas.openxmlformats.org/drawingml/2006/diagram" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:dsp="http://schemas.microsoft.com/office/drawing/2008/diagram">'
        '<dgm:ptLst><dgm:pt modelId="1"><dgm:t><a:bodyPr/><a:p><a:r><a:t>Planen</a:t></a:r></a:p></dgm:t></dgm:pt><dgm:pt modelId="2"><dgm:t><a:bodyPr/><a:p><a:r><a:t>Umsetzen</a:t></a:r></a:p></dgm:t></dgm:pt></dgm:ptLst>'
        '<dgm:extLst><a:ext uri="http://schemas.microsoft.com/office/drawing/2008/diagram"><dsp:dataModelExt relId="rIdDsp" minVer="http://schemas.openxmlformats.org/drawingml/2006/diagram"/></a:ext></dgm:extLst></dgm:dataModel>')


def dsp_shape(i, x, txt, col):
    return (f'<dsp:sp modelId="{{S{i}}}"><dsp:nvSpPr><dsp:cNvPr id="0" name=""/><dsp:cNvSpPr/></dsp:nvSpPr><dsp:spPr><a:xfrm><a:off x="{x * EMU}" y="{10 * EMU}"/><a:ext cx="{150 * EMU}" cy="{60 * EMU}"/></a:xfrm>'
            f'<a:prstGeom prst="roundRect"><a:avLst/></a:prstGeom><a:solidFill><a:srgbClr val="{col}"/></a:solidFill></dsp:spPr>'
            f'<dsp:txBody><a:bodyPr/><a:p><a:pPr algn="ctr"/><a:r><a:rPr sz="1400"><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill></a:rPr><a:t>{txt}</a:t></a:r></a:p></dsp:txBody></dsp:sp>')


DSP = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<dsp:drawing xmlns:dsp="http://schemas.microsoft.com/office/drawing/2008/diagram" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">'
       '<dsp:spTree><dsp:nvGrpSpPr><dsp:cNvPr id="0" name=""/><dsp:cNvGrpSpPr/></dsp:nvGrpSpPr><dsp:grpSpPr/>' + dsp_shape(1, 10, 'Planen', '4472C4') + dsp_shape(2, 220, 'Umsetzen', 'ED7D31') + '</dsp:spTree></dsp:drawing>')


def word(out):
    logo, cellimg, gimg = png(120, 40, (0, 120, 200)), png(60, 60, (200, 40, 40)), png(80, 50, (40, 160, 90))
    group = ('<a:graphic><a:graphicData uri="http://schemas.microsoft.com/office/word/2010/wordprocessingGroup"><wpg:wgp><wpg:cNvGrpSpPr/><wpg:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="' + str(300 * EMU) + '" cy="' + str(120 * EMU) + '"/>'
             '<a:chOff x="0" y="0"/><a:chExt cx="' + str(300 * EMU) + '" cy="' + str(120 * EMU) + '"/></a:xfrm></wpg:grpSpPr>'
             '<wps:wsp><wps:cNvSpPr/><wps:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="' + str(180 * EMU) + '" cy="' + str(100 * EMU) + '"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:solidFill><a:srgbClr val="FFF2CC"/></a:solidFill><a:ln><a:solidFill><a:srgbClr val="BF9000"/></a:solidFill></a:ln></wps:spPr>'
             '<wps:txbx><w:txbxContent><w:p><w:r><w:t>Text in der Gruppe</w:t></w:r></w:p></w:txbxContent></wps:txbx><wps:bodyPr/></wps:wsp>'
             '<pic:pic><pic:nvPicPr><pic:cNvPr id="31" name="G"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="rIdG"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="' + str(200 * EMU) + '" y="' + str(20 * EMU) + '"/><a:ext cx="' + str(80 * EMU) + '" cy="' + str(50 * EMU) + '"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic>'
             '</wpg:wgp></a:graphicData></a:graphic>')
    chart = '<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart"><c:chart r:id="rIdC"/></a:graphicData></a:graphic>'
    smart = '<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/diagram"><dgm:relIds r:dm="rIdDm" r:lo="rIdLo" r:qs="rIdQs" r:cs="rIdCs"/></a:graphicData></a:graphic>'
    tbx = ('<w:r><w:drawing><wp:anchor distT="0" distB="0" distL="0" distR="0" simplePos="0" relativeHeight="3" behindDoc="0" locked="0" layoutInCell="1" allowOverlap="1"><wp:simplePos x="0" y="0"/>'
           '<wp:positionH relativeFrom="column"><wp:posOffset>' + str(400 * EMU) + '</wp:posOffset></wp:positionH><wp:positionV relativeFrom="paragraph"><wp:posOffset>0</wp:posOffset></wp:positionV>'
           '<wp:extent cx="' + str(180 * EMU) + '" cy="' + str(160 * EMU) + '"/><wp:effectExtent l="0" t="0" r="0" b="0"/><wp:wrapNone/><wp:docPr id="41" name="T"/>'
           '<a:graphic><a:graphicData uri="http://schemas.microsoft.com/office/word/2010/wordprocessingShape"><wps:wsp><wps:cNvSpPr txBox="1"/><wps:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="' + str(180 * EMU) + '" cy="' + str(160 * EMU) + '"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom>'
           '<a:solidFill><a:srgbClr val="E2F0D9"/></a:solidFill><a:ln><a:solidFill><a:srgbClr val="548235"/></a:solidFill></a:ln></wps:spPr><wps:txbx><w:txbxContent><w:p><w:r><w:t>Hohes Textfeld</w:t></w:r></w:p></w:txbxContent></wps:txbx><wps:bodyPr/></wps:wsp></a:graphicData></a:graphic></wp:anchor></w:drawing></w:r>')
    body = [
        p('Dokument 1.75'),
        p('Text mit Fussnote', '<w:r><w:rPr><w:vertAlign w:val="superscript"/></w:rPr><w:footnoteReference w:id="1"/></w:r><w:r><w:t xml:space="preserve"> und Endnote</w:t></w:r><w:r><w:rPr><w:vertAlign w:val="superscript"/></w:rPr><w:endnoteReference w:id="1"/></w:r>'),
        '<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/></w:tblPr><w:tblGrid><w:gridCol w:w="3000"/><w:gridCol w:w="3000"/></w:tblGrid><w:tr>'
        '<w:tc><w:tcPr><w:tcW w:w="3000" w:type="dxa"/></w:tcPr><w:p><w:r><w:t>Bild in der Zelle:</w:t></w:r></w:p></w:tc>'
        '<w:tc><w:tcPr><w:tcW w:w="3000" w:type="dxa"/></w:tcPr><w:p>' + inline(pic('rIdCell', 60, 60, 21), 60, 60, 21) + '</w:p></w:tc></w:tr></w:tbl>',
        p('Diagramm:', inline(chart, 400, 240, 22)),
        p('Gruppe:', inline(group, 300, 120, 23)),
        p('SmartArt:', inline(smart, 400, 80, 24)),
        p('Absatz mit hohem Textfeld.', tbx),
        p('Ende.'),
    ]
    sect = ('<w:sectPr><w:headerReference w:type="default" r:id="rIdH"/><w:pgSz w:w="11906" w:h="16838"/>'
            '<w:pgMar w:top="1417" w:right="1417" w:bottom="1134" w:left="1417" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr>')
    doc = f'<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<w:document {NS}><w:body>{"".join(body)}{sect}</w:body></w:document>'
    header = (f'<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<w:hdr {NS}><w:p><w:pPr><w:jc w:val="right"/></w:pPr>' + inline(pic('rIdLogo', 120, 40, 51), 120, 40, 51) +
              '</w:p><w:p><w:r><w:t>Kopfzeile mit Logo</w:t></w:r></w:p></w:hdr>')
    notes = lambda tag, ref: (f'<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<w:{tag}s {W}><w:{tag} w:type="separator" w:id="-1"><w:p/></w:{tag}><w:{tag} w:type="continuationSeparator" w:id="0"><w:p/></w:{tag}>'
                              f'<w:{tag} w:id="1"><w:p><w:r><w:rPr><w:vertAlign w:val="superscript"/></w:rPr><w:{ref}/></w:r><w:r><w:t xml:space="preserve"> {"Text der Fussnote" if tag == "footnote" else "Text der Endnote"}.</w:t></w:r></w:p></w:{tag}></w:{tag}s>')
    R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/'
    rels = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
            f'<Relationship Id="rIdH" Type="{R}header" Target="header1.xml"/><Relationship Id="rIdFn" Type="{R}footnotes" Target="footnotes.xml"/><Relationship Id="rIdEn" Type="{R}endnotes" Target="endnotes.xml"/>'
            f'<Relationship Id="rIdCell" Type="{R}image" Target="media/cell.png"/><Relationship Id="rIdG" Type="{R}image" Target="media/g.png"/><Relationship Id="rIdC" Type="{R}chart" Target="charts/chart1.xml"/>'
            f'<Relationship Id="rIdDm" Type="{R}diagramData" Target="diagrams/data1.xml"/><Relationship Id="rIdLo" Type="{R}diagramLayout" Target="diagrams/layout1.xml"/>'
            f'<Relationship Id="rIdQs" Type="{R}diagramQuickStyle" Target="diagrams/quickStyle1.xml"/><Relationship Id="rIdCs" Type="{R}diagramColors" Target="diagrams/colors1.xml"/>'
            '<Relationship Id="rIdDsp" Type="http://schemas.microsoft.com/office/2007/relationships/diagramDrawing" Target="diagrams/drawing1.xml"/></Relationships>')
    hrels = f'<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdLogo" Type="{R}image" Target="media/logo.png"/></Relationships>'
    ct = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
          '<Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/>'
          '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>'
          '<Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/>'
          '<Override PartName="/word/footnotes.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footnotes+xml"/>'
          '<Override PartName="/word/endnotes.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.endnotes+xml"/>'
          '<Override PartName="/word/charts/chart1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/>'
          '<Override PartName="/word/diagrams/data1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawingml.diagramData+xml"/>'
          '<Override PartName="/word/diagrams/layout1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawingml.diagramLayout+xml"/>'
          '<Override PartName="/word/diagrams/quickStyle1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawingml.diagramStyle+xml"/>'
          '<Override PartName="/word/diagrams/colors1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawingml.diagramColors+xml"/>'
          '<Override PartName="/word/diagrams/drawing1.xml" ContentType="application/vnd.ms-office.drawingml.diagramDrawing+xml"/></Types>')
    root = f'<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="{R}officeDocument" Target="word/document.xml"/></Relationships>'
    empty = lambda tag, ns: f'<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<dgm:{tag} xmlns:dgm="{ns}"/>'
    D = 'http://schemas.openxmlformats.org/drawingml/2006/diagram'
    with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED) as z:
        for n, d in [('[Content_Types].xml', ct), ('_rels/.rels', root), ('word/document.xml', doc), ('word/_rels/document.xml.rels', rels), ('word/header1.xml', header),
                     ('word/_rels/header1.xml.rels', hrels), ('word/footnotes.xml', notes('footnote', 'footnoteRef')), ('word/endnotes.xml', notes('endnote', 'endnoteRef')),
                     ('word/charts/chart1.xml', CHART), ('word/diagrams/data1.xml', DATA), ('word/diagrams/drawing1.xml', DSP),
                     ('word/diagrams/layout1.xml', empty('layoutDef', D)), ('word/diagrams/quickStyle1.xml', empty('styleDef', D)), ('word/diagrams/colors1.xml', empty('colorsDef', D)),
                     ('word/media/logo.png', logo), ('word/media/cell.png', cellimg), ('word/media/g.png', gimg)]:
            z.writestr(n, d)


def ppt(out):
    from pptx import Presentation
    from pptx.chart.data import CategoryChartData
    from pptx.enum.chart import XL_CHART_TYPE
    from pptx.util import Inches
    prs = Presentation()
    s = prs.slides.add_slide(prs.slide_layouts[6])
    src = io.BytesIO(png(200, 100, (220, 30, 30), (30, 60, 220)))
    pc = s.shapes.add_picture(src, Inches(0.5), Inches(0.5), Inches(2), Inches(1))
    pc.rotation = 90
    src2 = io.BytesIO(png(200, 100, (0, 160, 0), (250, 200, 0)))
    pc2 = s.shapes.add_picture(src2, Inches(3), Inches(0.5), Inches(1), Inches(1))
    pc2.crop_left = 0.5   # nur die gelbe Hälfte
    cd = CategoryChartData()
    cd.categories = ['Q1', 'Q2', 'Q3']
    cd.add_series('2025', (4, 6, 5))
    cd.add_series('2026', (5, 7, 9))
    s.shapes.add_chart(XL_CHART_TYPE.COLUMN_CLUSTERED, Inches(5), Inches(2), Inches(4.5), Inches(3), cd)
    prs.save(out)


def xl(out):
    from openpyxl import Workbook
    from openpyxl.chart import BarChart, Reference
    from openpyxl.drawing.image import Image as XImg
    wb = Workbook()
    ws = wb.active
    ws.title = 'Tabelle1'
    for row in [('Quartal', '2025', '2026'), ('Q1', 4, 5), ('Q2', 6, 7), ('Q3', 5, 9)]:
        ws.append(row)
    img = XImg(io.BytesIO(png(120, 60, (0, 120, 200))))
    ws.add_image(img, 'E2')
    ch = BarChart()
    ch.title = 'Umsatz'
    ch.add_data(Reference(ws, min_col=2, min_row=1, max_col=3, max_row=4), titles_from_data=True)
    ch.set_categories(Reference(ws, min_col=1, min_row=2, max_row=4))
    ws.add_chart(ch, 'A8')
    wb.save(out)


if __name__ == '__main__':
    d = Path(sys.argv[1] if len(sys.argv) > 1 else '/tmp/kt-word')
    d.mkdir(parents=True, exist_ok=True)
    word(d / 'word175.docx')
    ppt(d / 'p175.pptx')
    xl(d / 'x175.xlsx')
    print(d)
