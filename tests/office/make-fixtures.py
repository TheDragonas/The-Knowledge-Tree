"""Testdateien für den Office-Round-Trip (1.60) erzeugen: python3 tests/office/make-fixtures.py
Bewusst mit Teilen, die KnowledgeTree nicht bearbeitet (Diagramm, Bild, Kopf-/Fusszeile, verbundene Zellen, Notizen),
damit der Round-Trip zeigt, dass sie unangetastet bleiben."""
import io, os, struct, zlib
from docx import Document
from docx.shared import Pt, Cm
from pptx import Presentation
from pptx.util import Inches, Pt as PPt
from pptx.chart.data import CategoryChartData
from pptx.enum.chart import XL_CHART_TYPE
from openpyxl import Workbook
from openpyxl.chart import BarChart, Reference
from openpyxl.styles import Font, PatternFill

D = os.path.join(os.path.dirname(__file__), 'fixtures')

def png(w=120, h=80):
    raw = b''.join(b'\x00' + b''.join(bytes((x * 2 % 256, y * 3 % 256, 160)) for x in range(w)) for y in range(h))
    def chunk(t, d): return struct.pack('>I', len(d)) + t + d + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)
    return b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 2, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b'')

img = io.BytesIO(png())

# Word: Überschriften, Liste, Tabelle, Bild, Kopf-/Fusszeile
d = Document()
d.sections[0].header.paragraphs[0].text = 'Kopfzeile KnowledgeTree-Test'
d.sections[0].footer.paragraphs[0].text = 'Fusszeile – Seite'
d.add_heading('Round-Trip-Dokument', 1)
p = d.add_paragraph('Ein Absatz mit ')
p.add_run('fett').bold = True
p.add_run(' und ')
p.add_run('kursiv').italic = True
p.add_run(' – Umlaute äöü ß « » €.')
d.add_heading('Liste', 2)
for t in ['Erster Punkt', 'Zweiter Punkt', 'Dritter Punkt']:
    d.add_paragraph(t, style='List Bullet')
t = d.add_table(rows=3, cols=3)
t.style = 'Table Grid'
for r in range(3):
    for c in range(3):
        t.cell(r, c).text = f'Z{r + 1}S{c + 1}'
d.add_picture(io.BytesIO(png()), width=Cm(5))
d.add_paragraph('Letzter Absatz.')
d.save(os.path.join(D, 'test.docx'))

# PowerPoint: Titel, Text, Bild, Diagramm (nicht bearbeitbar), Notizen
pr = Presentation()
s = pr.slides.add_slide(pr.slide_layouts[0])
s.shapes.title.text = 'Round-Trip-Präsentation'
s.placeholders[1].text = 'Untertitel mit Umlauten äöü'
s.notes_slide.notes_text_frame.text = 'Sprechernotiz zu Folie 1'
s2 = pr.slides.add_slide(pr.slide_layouts[5])
s2.shapes.title.text = 'Diagramm und Bild'
cd = CategoryChartData(); cd.categories = ['A', 'B', 'C']; cd.add_series('Reihe 1', (3, 5, 2))
s2.shapes.add_chart(XL_CHART_TYPE.COLUMN_CLUSTERED, Inches(0.5), Inches(1.5), Inches(5), Inches(3.5), cd)
s2.shapes.add_picture(io.BytesIO(png()), Inches(6), Inches(2), Inches(2.5))
tb = s2.shapes.add_textbox(Inches(6), Inches(4.5), Inches(3), Inches(1)); tb.text_frame.text = 'Freies Textfeld'
pr.save(os.path.join(D, 'test.pptx'))

# Excel: zwei Blätter, Formeln, Zahlenformat, verbundene Zellen, Diagramm
wb = Workbook()
ws = wb.active; ws.title = 'Daten'
ws['A1'] = 'Artikel'; ws['B1'] = 'Menge'; ws['C1'] = 'Preis'; ws['D1'] = 'Summe'
for c in 'ABCD': ws[c + '1'].font = Font(bold=True); ws[c + '1'].fill = PatternFill('solid', fgColor='DDDDFF')
for i, (a, m, p) in enumerate([('Äpfel', 3, 1.2), ('Birnen', 5, 0.8), ('Kiwi', 2, 2.5)], start=2):
    ws[f'A{i}'] = a; ws[f'B{i}'] = m; ws[f'C{i}'] = p; ws[f'D{i}'] = f'=B{i}*C{i}'; ws[f'C{i}'].number_format = '0.00'
ws['A6'] = 'Total'; ws['D6'] = '=SUM(D2:D4)'
ws.merge_cells('A8:D8'); ws['A8'] = 'Verbundene Zelle'
ch = BarChart(); ch.add_data(Reference(ws, min_col=2, min_row=1, max_row=4), titles_from_data=True); ws.add_chart(ch, 'F2')
ws2 = wb.create_sheet('Zweites Blatt'); ws2['A1'] = 'Bezug'; ws2['B1'] = '=Daten!D6'
wb.save(os.path.join(D, 'test.xlsx'))
print('Testdateien erzeugt:', sorted(os.listdir(D)))
