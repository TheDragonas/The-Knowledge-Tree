"""Prüft die von tests/browser/office-164.js bearbeiteten Office-Dateien mit python-docx/-pptx, openpyxl und LibreOffice.
Aufruf: python3 tests/office/check-edit.py <ordner>  → JSON { name: { ok, info } } auf stdout"""
import json, os, subprocess, sys, zipfile

D = sys.argv[1]
out = {}


def lo(path):
    """LibreOffice headless: öffnen und als PDF speichern → Seitenzahl (0 = ging nicht)"""
    od = os.path.join(D, 'pdf')
    os.makedirs(od, exist_ok=True)
    subprocess.run(['soffice', '--headless', '--convert-to', 'pdf', '--outdir', od, path], capture_output=True, timeout=180)
    pdf = os.path.join(od, os.path.splitext(os.path.basename(path))[0] + '.pdf')
    if not os.path.exists(pdf):
        return 0, ''
    info = subprocess.run(['pdfinfo', pdf], capture_output=True, text=True).stdout
    pages = int(next((l.split()[-1] for l in info.splitlines() if l.startswith('Pages:')), '0'))
    text = subprocess.run(['pdftotext', pdf, '-'], capture_output=True, text=True).stdout
    return pages, text


def zipdiff(a, b):
    A, B = zipfile.ZipFile(a), zipfile.ZipFile(b)
    an = {i.filename: A.read(i.filename) for i in A.infolist()}
    bn = {i.filename: B.read(i.filename) for i in B.infolist()}
    return sorted(n for n in an if n in bn and an[n] != bn[n]), sorted(n for n in bn if n not in an), sorted(n for n in an if n not in bn)


def chk(name, fn):
    try:
        ok, info = fn()
    except Exception as e:  # noqa
        ok, info = False, repr(e)
    out[name] = {'ok': bool(ok), 'info': info}


# ---------------------------------------------------------------- PowerPoint
def ppt():
    from pptx import Presentation
    p = Presentation(os.path.join(D, 'hello-ed.pptx'))
    s = [[(sh.shape_id, sh.name, sh.text_frame.text if sh.has_text_frame else None, sh.left, sh.top) for sh in sl.shapes] for sl in p.slides]
    t0 = [x for x in s[0] if x[0] == 2][0]
    cat0 = [x for x in s[0] if x[0] == 4][0]
    ok = (len(s) == 4 and t0[2] == 'Hallo Welt' and not any(x[0] == 3 for x in s[0])   # Untertitel gelöscht
          and cat0[3] == 205378 + round(30 / (900 / 1280) * 9525) and s[1][2][2] == 'Hallo Welt'   # Duplikat
          and any(x[2] and 'Neu aus KnowledgeTree' in x[2] for x in s[2]) and any(x[2] and 'Dritte Folie' in x[2] for x in s[3]))
    run = [r for r in p.slides[0].shapes[2].text_frame.paragraphs[0].runs]
    ok = ok and [(r.text, r.font.bold) for r in run] == [('Hallo ', None), ('Welt', True)]
    ch, new, gone = zipdiff(os.path.join(D, 'hello.pptx'), os.path.join(D, 'hello-ed.pptx'))
    pages, text = lo(os.path.join(D, 'hello-ed.pptx'))
    ok = ok and pages == 4 and 'Dritte Folie' in text and not gone and 'ppt/media/image1.jpeg' not in ch
    return ok, {'slides': [[x[1:3] for x in sl] for sl in s], 'changed': ch, 'new': new, 'pages': pages}


def ppt_fx():
    from pptx import Presentation
    p = Presentation(os.path.join(D, 'test-ed.pptx'))
    texts = [[sh.text_frame.text for sh in sl.shapes if sh.has_text_frame] for sl in p.slides]
    notes = p.slides[0].notes_slide.notes_text_frame.text
    charts = sum(1 for sl in p.slides for sh in sl.shapes if sh.has_chart)
    pages, _ = lo(os.path.join(D, 'test-ed.pptx'))
    return (texts[0][0] == 'Neuer Titel' and 'Notiz geändert' in notes and charts == 1 and pages == 2), {'texts': texts, 'notes': notes, 'charts': charts, 'pages': pages}


# ---------------------------------------------------------------- Word
def doc():
    import docx
    d = docx.Document(os.path.join(D, 'hello-ed.docx'))
    ps = [(x.style.name, x.text) for x in d.paragraphs]
    nums = [x._p.pPr is not None and x._p.pPr.numPr is not None for x in d.paragraphs]
    pages, text = lo(os.path.join(D, 'hello-ed.docx'))
    ok = (ps[:5] == [('Normal', 'Hallo Welt – geändert'), ('Heading 1', 'Neue Überschrift'), ('List Paragraph', 'Erster Punkt'), ('List Paragraph', 'Zweiter Punkt'), ('Normal', 'Zentriert')]
          and nums[2] and nums[3] and len(d.tables) == 1 and len(d.inline_shapes) == 1 and pages >= 1 and 'Neue Überschrift' in text)
    return ok, {'paras': ps, 'tables': len(d.tables), 'images': len(d.inline_shapes), 'pages': pages}


def doc_fx():
    import docx
    d = docx.Document(os.path.join(D, 'test-ed.docx'))
    ps = [x.text for x in d.paragraphs]
    hdr = d.sections[0].header.paragraphs[0].text
    ok = 'Zweiter Punkt (geändert)' in ps and 'Dritter Punkt' not in ps and 'Letzter Absatz.' in ps and hdr == 'Kopfzeile KnowledgeTree-Test' and len(d.inline_shapes) == 1 and len(d.tables) == 1
    # Original-Absätze unverändert übernommen (gleiche paraId/Lauf-Struktur): erster Absatz fett/kursiv
    p1 = d.paragraphs[1]
    ok = ok and [(r.text, r.bold, r.italic) for r in p1.runs][:4] == [('Ein Absatz mit ', None, None), ('fett', True, None), (' und ', None, None), ('kursiv', None, True)]
    pages, _ = lo(os.path.join(D, 'test-ed.docx'))
    return ok and pages >= 1, {'paras': ps, 'pages': pages}


# ---------------------------------------------------------------- Excel
def xl():
    import openpyxl
    w = openpyxl.load_workbook(os.path.join(D, 'hello-ed.xlsx'))
    ws = w.active
    names = zipfile.ZipFile(os.path.join(D, 'hello-ed.xlsx')).namelist()
    od = os.path.join(D, 'csv'); os.makedirs(od, exist_ok=True)
    subprocess.run(['soffice', '--headless', '--convert-to', 'csv', '--outdir', od, os.path.join(D, 'hello-ed.xlsx')], capture_output=True, timeout=120)
    rows = open(os.path.join(od, 'hello-ed.csv'), encoding='utf-8', errors='replace').read().splitlines()
    ok = (ws['A1'].value == 'Neu aus KT' and ws['A2'].value == '=SUM(G22,H22)' and ws['G22'].value == 100 and ws['I23'].value == '=I22-J22'
          and 'xl/calcChain.xml' not in names and 'xl/drawings/drawing1.xml' in names and rows[1].startswith('188') and rows[22].split(',')[6:10] == ['12', '11', '11', '66'])
    return ok, {'A1': ws['A1'].value, 'A2': ws['A2'].value, 'row23': rows[22] if len(rows) > 22 else rows}


def xl_fx():
    import openpyxl
    w = openpyxl.load_workbook(os.path.join(D, 'test-ed.xlsx'))
    ws = w['Daten']
    ok = ws['B2'].value == 10 and ws['D6'].value == '=SUM(D2:D4)' and ws['C2'].number_format == '0.00' and ws['A1'].font.b and 'A8:D8' in [str(r) for r in ws.merged_cells.ranges] and len(ws._charts) == 1 and w['Zweites Blatt']['B1'].value == '=Daten!D6'
    return ok, {'B2': ws['B2'].value, 'fmt': ws['C2'].number_format, 'merged': [str(r) for r in ws.merged_cells.ranges]}


# ---------------------------------------------------------------- neue Seiten
def neu():
    from pptx import Presentation
    import docx, openpyxl
    p = Presentation(os.path.join(D, 'neu.pptx'))
    d = docx.Document(os.path.join(D, 'neu.docx'))
    w = openpyxl.load_workbook(os.path.join(D, 'neu.xlsx'))
    t = [[sh.text_frame.text for sh in sl.shapes if sh.has_text_frame] for sl in p.slides]
    ps = [(x.style.name, x.text) for x in d.paragraphs]
    v = [[c.value for c in r] for r in w.active.iter_rows()]
    pp = [lo(os.path.join(D, 'neu.' + e))[0] for e in ('pptx', 'docx', 'xlsx')]
    ok = len(t) == 2 and t[0] == ['Meine Präsentation\nUntertitel'] and ps[0] == ('Heading 1', 'Bericht') and ('List Paragraph', 'b') in ps and v == [['Zahl'], [5], [7], ['=SUM(A2:A3)']] and all(pp)
    return ok, {'pptx': t, 'docx': ps, 'xlsx': v, 'pages': pp}


for n, f in [('PowerPoint bearbeitet (Hello World)', ppt), ('PowerPoint bearbeitet (Testdatei: Titel, Notizen, Diagramm bleibt)', ppt_fx),
             ('Word bearbeitet (Hello World)', doc), ('Word bearbeitet (Testdatei: Absatz geändert/gelöscht, Rest unverändert)', doc_fx),
             ('Excel bearbeitet (Hello World, geteilte Formeln)', xl), ('Excel bearbeitet (Testdatei: Format, Verbund, Diagramm bleiben)', xl_fx),
             ('neue Seiten Präsentation/Dokument/Tabelle', neu)]:
    if 'Hello' in n and not os.path.exists(os.path.join(D, 'hello.pptx')):
        continue   # Hello-World-Dateien des Users nur, wenn mitgegeben (nicht im Projekt)
    chk(n, f)
print(json.dumps(out, ensure_ascii=False))
