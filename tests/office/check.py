"""Office-Datei prüfen (1.60): python3 tests/office/check.py DATEI [--vergleich ORIGINAL] [--png AUSGABE.png]
- öffnet mit python-docx / python-pptx / openpyxl (strenges Lesen des Pakets)
- LibreOffice (headless) wandelt in PDF um → Datei muss sich öffnen lassen; Seitenzahl wird gemeldet
- --vergleich: welche Einträge des ZIP-Pakets unterscheiden sich vom Original (Inhalt entpackt verglichen)
Ausgabe: eine Zeile JSON. Microsoft Office selbst kann hier NICHT geprüft werden."""
import json, os, subprocess, sys, tempfile, zipfile

def lib_open(path):
    ext = path.rsplit('.', 1)[-1].lower()
    try:
        if ext in ('docx', 'dotx', 'docm'):
            from docx import Document; d = Document(path); return {'ok': True, 'absaetze': len(d.paragraphs), 'tabellen': len(d.tables)}
        if ext in ('pptx', 'potx', 'pptm'):
            from pptx import Presentation; p = Presentation(path); return {'ok': True, 'folien': len(p.slides)}
        if ext in ('xlsx', 'xltx', 'xlsm'):
            from openpyxl import load_workbook; w = load_workbook(path); return {'ok': True, 'blaetter': w.sheetnames}
    except Exception as e:
        return {'ok': False, 'fehler': str(e)[:200]}
    return {'ok': False, 'fehler': 'unbekannt'}

def lo_pdf(path, png=None):
    out = tempfile.mkdtemp()
    r = subprocess.run(['soffice', '--headless', '--convert-to', 'pdf', '--outdir', out, path], capture_output=True, text=True, timeout=180)
    pdf = os.path.join(out, os.path.basename(path).rsplit('.', 1)[0] + '.pdf')
    if not os.path.exists(pdf):
        return {'ok': False, 'fehler': (r.stderr or r.stdout)[:200]}
    pages = 0
    try:
        info = subprocess.run(['pdfinfo', pdf], capture_output=True, text=True).stdout
        pages = int([l for l in info.splitlines() if l.startswith('Pages:')][0].split()[1])
    except Exception:
        pages = -1
    res = {'ok': True, 'seiten': pages, 'pdf': pdf}
    if png:
        subprocess.run(['pdftoppm', '-png', '-r', '60', '-f', '1', '-l', '1', pdf, png.rsplit('.', 1)[0]], capture_output=True)
    return res

def diff(a, b):
    za, zb = zipfile.ZipFile(a), zipfile.ZipFile(b)
    na, nb = za.namelist(), zb.namelist()
    changed = [n for n in na if n in nb and za.read(n) != zb.read(n)]
    return {'nur_original': [n for n in na if n not in nb], 'neu': [n for n in nb if n not in na], 'geaendert': changed, 'reihenfolge_gleich': [n for n in na if n in nb] == [n for n in nb if n in na]}

if __name__ == '__main__':
    path = sys.argv[1]
    res = {'datei': os.path.basename(path), 'bibliothek': lib_open(path), 'libreoffice': lo_pdf(path, sys.argv[sys.argv.index('--png') + 1] if '--png' in sys.argv else None)}
    if '--vergleich' in sys.argv:
        res['vergleich'] = diff(sys.argv[sys.argv.index('--vergleich') + 1], path)
    try:
        zipfile.ZipFile(path).testzip(); res['zip'] = 'ok'
    except Exception as e:
        res['zip'] = str(e)
    print(json.dumps(res, ensure_ascii=False))
