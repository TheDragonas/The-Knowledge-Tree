#!/usr/bin/env python3
"""Testdateien für formate-171.js erzeugen: python3 tests/browser/formate-fixtures.py <ordner>
Braucht openpyxl, python-docx, python-pptx und LibreOffice (soffice) für .xls/.ods/.doc/.odt/.rtf/.ppt/.odp."""
import os, subprocess, sys
import openpyxl, docx, pptx
from openpyxl.styles import Font, PatternFill, Alignment
from openpyxl.styles.colors import Color
from openpyxl.worksheet.datavalidation import DataValidation
from docx.shared import RGBColor

d = sys.argv[1] if len(sys.argv) > 1 else '/tmp/kt-formate'
os.makedirs(d, exist_ok=True)
os.chdir(d)
wb = openpyxl.Workbook(); ws = wb.active; ws.title = 'Daten'
for c, t in zip('ABCD', ['Artikel', 'Menge', 'Preis', 'Summe']):
    ws[c + '1'] = t; ws[c + '1'].font = Font(bold=True, color='FFFFFF'); ws[c + '1'].fill = PatternFill('solid', fgColor='2F5597')
for i, (a, b, c) in enumerate([('Äpfel', 3, 1.5), ('Birnen', 5, 2.25), ('Kirschen', 10, 0.4)], start=2):
    ws[f'A{i}'] = a; ws[f'B{i}'] = b; ws[f'C{i}'] = c; ws[f'D{i}'] = f'=B{i}*C{i}'
ws['D5'] = '=SUM(D2:D4)'; ws['C5'] = 'Total'; ws['C5'].font = Font(italic=True, color='C00000')
ws['E2'] = '=IF(D2>4,"gross","klein")'
ws.merge_cells('A7:C7'); ws['A7'] = 'Verbunden zentriert'; ws['A7'].alignment = Alignment(horizontal='center')
ws['A9'] = 'Design 40 % heller'; ws['A9'].fill = PatternFill('solid', fgColor=Color(theme=4, tint=0.3999755851924192))
ws['B9'] = 'oben, Umbruch und ein langer Text'; ws['B9'].alignment = Alignment(vertical='top', wrap_text=True)
ws['A10'] = 'Langer Text, der in die leeren Zellen rechts daneben hineinläuft'
ws['F2'] = 'rot'; dv = DataValidation(type='list', formula1='"rot,grün,blau"', allow_blank=True); ws.add_data_validation(dv); dv.add('F2:F6')
ws.column_dimensions['A'].width = 18; ws.freeze_panes = 'B2'
w2 = wb.create_sheet('Zweites'); w2['A1'] = '=Daten!D5*2'
w3 = wb.create_sheet('Versteckt'); w3['A1'] = 'geheim'; w3.sheet_state = 'hidden'
wb.save('f.xlsx')
doc = docx.Document()
doc.add_heading('Testdokument Überschrift', 1)
p = doc.add_paragraph('Normaler Text mit '); r = p.add_run('fett'); r.bold = True; p.add_run(' und '); r = p.add_run('kursiv rot'); r.italic = True; r.font.color.rgb = RGBColor(0xC0, 0, 0)
doc.add_heading('Zweite Ebene', 2)
doc.add_paragraph('Punkt eins', style='List Bullet'); doc.add_paragraph('Punkt zwei', style='List Bullet')
doc.add_paragraph('Erster', style='List Number'); doc.add_paragraph('Zweiter', style='List Number')
t = doc.add_table(rows=2, cols=3); t.style = 'Table Grid'
for i in range(2):
    for j in range(3): t.cell(i, j).text = f'Z{i}S{j}'
doc.add_paragraph('Grüsse aus der Schweiz – «Anführungszeichen» äöü')
doc.save('test.docx')
pr = pptx.Presentation()
s = pr.slides.add_slide(pr.slide_layouts[1]); s.shapes.title.text = 'Erste Folie'; s.placeholders[1].text = 'Punkt A\nPunkt B'
s = pr.slides.add_slide(pr.slide_layouts[1]); s.shapes.title.text = 'Zweite Folie'; s.placeholders[1].text = 'Inhalt zwei'
pr.save('test.pptx')
for src, fmts in [('f.xlsx', ['xls', 'ods']), ('test.docx', ['doc', 'odt', 'rtf']), ('test.pptx', ['ppt', 'odp'])]:
    for f in fmts:
        subprocess.run(['soffice', '--headless', '--convert-to', f, src], capture_output=True)
open('de.csv', 'wb').write('Name;Betrag;Anteil\nMüller;1.234,50;12%\nMeier;99,90;5%\n"Text; mit Semikolon";0,5;\n'.encode('cp1252'))
open('notiz.md', 'w', encoding='utf-8').write('# Titel\n\nText mit **fett** und *kursiv*.\n\n- eins\n- zwei\n  - zwei a\n1. erst\n2. dann\n\n| A | B |\n|---|---|\n| 1 | 2 |\n')
open('notiz.txt', 'w', encoding='utf-8').write('Zeile eins\nZeile zwei äöü\n')
print('Testdateien in', d, sorted(os.listdir(d)))
