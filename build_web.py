#!/usr/bin/env python3
"""Baut die Webseiten-Version von KnowledgeTree als EINE Datei: dist/index.html

Alles (HTML, CSS, JavaScript, Icon) wird eingebettet. Gespeichert wird im Browser
(IndexedDB) über js/backend-browser.js statt über den lokalen Server.

Seit 1.25 trägt die Datei ihr eigenes Gerüst in sich (#kt-shell: das HTML ohne Code, als JSON) und eine Marke
<!--kt-datei--> im Kopf: daraus setzt sie beim Export „KnowledgeTree-Datei → Interaktiv“ eine Kopie von sich
selbst mit den Daten zusammen (web/js/ktfile.js → appTemplate/writeHtml). Jedes Skript hat dazu data-kt="js/…".

Seit 1.23 wird die Datei dabei verkleinert: Kommentare, Einrückung, Leerzeilen und unnötige Leerzeichen
fallen weg (eigener kleiner Zerleger, keine Zusatzprogramme). Zeilenumbrüche bleiben, wo der Code welche hat –
so ändert sich am Programm nichts (automatische Semikolons). Lesbare Fassung wie früher:
    python build_web.py --lesbar
"""
import json
import re
import sys
import urllib.parse
from pathlib import Path

ROOT = Path(__file__).parent
WEB = ROOT / 'web'
OUT = ROOT / 'dist' / 'index.html'
READABLE = '--lesbar' in sys.argv

# ---------------------------------------------------------------- JavaScript verkleinern
# Vor einem „/“ nach diesen Wörtern beginnt ein regulärer Ausdruck (sonst ist es eine Division)
_RX_KEYWORDS = {'return', 'typeof', 'instanceof', 'in', 'of', 'new', 'delete', 'void', 'throw', 'case', 'do', 'else',
                'yield', 'await'}
_PUNCT = sorted(['>>>=', '...', '===', '!==', '**=', '<<=', '>>=', '>>>', '&&=', '||=', '??=', '=>', '==', '!=', '<=',
                 '>=', '&&', '||', '??', '?.', '++', '--', '+=', '-=', '*=', '/=', '%=', '&=', '|=', '^=', '<<', '>>',
                 '**', '{', '}', '(', ')', '[', ']', ';', ',', '<', '>', '+', '-', '*', '/', '%', '&', '|', '^', '!',
                 '~', '?', ':', '=', '.', '@', '#'], key=len, reverse=True)
_WORD = re.compile(r'[A-Za-z0-9_$\u0080-￿\\]')


def _js_tokens(src):
    """Zerlegt JavaScript in (Art, Text). Arten: ws, nl, com (Kommentar), str, tpl, rx, num, word, p (Satzzeichen)."""
    i, n = 0, len(src)
    out = []
    stack = []          # offene Vorlagen-Ausdrücke `…${ … }…`: Anzahl offener { je Ebene
    prev = None         # letztes bedeutsames Element (für / = Division oder regulärer Ausdruck)

    def template(j):
        # ab j (nach ` oder }) bis zum Ende der Vorlage oder bis ${ – gibt (Ende, offen) zurück
        while j < n:
            c = src[j]
            if c == '\\':
                j += 2
                continue
            if c == '`':
                return j + 1, False
            if c == '$' and j + 1 < n and src[j + 1] == '{':
                return j + 2, True
            j += 1
        raise ValueError('Vorlage ohne Ende')

    while i < n:
        c = src[i]
        if c == '\n':
            out.append(('nl', c)); i += 1; continue
        if c in ' \t\r\f\v ﻿':
            j = i + 1
            while j < n and src[j] in ' \t\r\f\v ﻿':
                j += 1
            out.append(('ws', src[i:j])); i = j; continue
        if c == '/' and src.startswith('//', i):
            j = src.find('\n', i)
            j = n if j < 0 else j
            out.append(('com', src[i:j])); i = j; continue
        if c == '/' and src.startswith('/*', i):
            j = src.find('*/', i + 2)
            if j < 0:
                raise ValueError('Kommentar ohne Ende')
            out.append(('com', src[i:j + 2])); i = j + 2; continue
        if c in '"\'':
            j = i + 1
            while j < n and src[j] != c:
                if src[j] == '\\':
                    j += 1
                elif src[j] == '\n':
                    raise ValueError('Zeilenumbruch in Zeichenkette')
                j += 1
            out.append(('str', src[i:j + 1])); i = j + 1; prev = ('str', ''); continue
        if c == '`':
            j, open_ = template(i + 1)
            out.append(('tpl', src[i:j])); i = j
            if open_:
                stack.append(0)
            prev = ('tpl', ''); continue
        if c == '}' and stack and stack[-1] == 0:
            stack.pop()
            j, open_ = template(i + 1)
            out.append(('tpl', src[i:j])); i = j
            if open_:
                stack.append(0)
            prev = ('tpl', ''); continue
        if c == '/':
            pk, pt = prev if prev else (None, None)
            is_rx = prev is None or (pk == 'p' and pt not in (')', ']', '}')) or (pk == 'word' and pt in _RX_KEYWORDS)
            if is_rx:
                j, cls = i + 1, False
                while j < n:
                    d = src[j]
                    if d == '\\':
                        j += 2
                        continue
                    if d == '\n':
                        raise ValueError('Zeilenumbruch in regulärem Ausdruck')
                    if d == '[':
                        cls = True
                    elif d == ']':
                        cls = False
                    elif d == '/' and not cls:
                        break
                    j += 1
                j += 1
                while j < n and _WORD.match(src[j]):
                    j += 1
                out.append(('rx', src[i:j])); i = j; prev = ('rx', ''); continue
        if c.isdigit() or (c == '.' and i + 1 < n and src[i + 1].isdigit()):
            m = re.compile(r'0[xX][0-9a-fA-F_]+n?|0[bB][01_]+n?|0[oO][0-7_]+n?|(?:\d[\d_]*\.?[\d_]*|\.\d[\d_]*)(?:[eE][+-]?\d[\d_]*)?n?').match(src, i)
            out.append(('num', m.group())); i = m.end(); prev = ('num', ''); continue
        if _WORD.match(c):
            j = i + 1
            while j < n and _WORD.match(src[j]):
                j += 1
            w = src[i:j]
            out.append(('word', w)); i = j; prev = ('word', w); continue
        for p in _PUNCT:
            if src.startswith(p, i):
                if stack:
                    if p == '{':
                        stack[-1] += 1
                    elif p == '}':
                        stack[-1] -= 1
                out.append(('p', p)); i += len(p); prev = ('p', p)
                break
        else:
            raise ValueError(f'unbekanntes Zeichen {c!r}')
    return out


def _needs_space(a, b):
    """Muss zwischen den Elementen a und b (Art, Text) ein Leerzeichen bleiben?"""
    (ka, ta), (kb, tb) = a, b
    wordish = ('word', 'num')
    if ka in wordish and kb in wordish:
        return True
    if ka == 'rx' and kb in wordish:          # sonst würden Wörter zu Flags
        return True
    if ka == 'num' and tb.startswith('.'):    # 1 .toString()
        return True
    pair = ta[-1:] + tb[:1]
    return pair in ('++', '--', '+-', '-+', '//', '/*', '<!', '->', '..')


def compact_js(src):
    toks = _js_tokens(src)
    lines, cur, last = [], [], None
    for k, t in toks:
        if k == 'com':
            if t.startswith('/*') and '\n' in t:  # mehrzeiliger Kommentar zählt als Zeilenumbruch (Semikolon-Regel)
                if cur:
                    lines.append(''.join(cur)); cur = []; last = None
            continue
        if k == 'ws':
            continue
        if k == 'nl':
            if cur:
                lines.append(''.join(cur)); cur = []; last = None
            continue
        if k == 'tpl' and '\n' in t:
            # Vorlagen mit Zeilenumbrüchen unverändert übernehmen (der Inhalt zählt)
            if last and _needs_space(last, (k, t)):
                cur.append(' ')
            cur.append(t); last = (k, t)
            continue
        if last and _needs_space(last, (k, t)):
            cur.append(' ')
        cur.append(t); last = (k, t)
    if cur:
        lines.append(''.join(cur))
    return '\n'.join(lines)


# ---------------------------------------------------------------- CSS verkleinern
def compact_css(src):
    # Zeichenketten bleiben unverändert; ausserhalb: Kommentare raus, Zeilen trimmen, um { } ; : zusammenziehen
    parts, buf, i, n = [], [], 0, len(src)
    while i < n:
        c = src[i]
        if c in '"\'':
            j = i + 1
            while j < n and src[j] != c:
                j += 2 if src[j] == '\\' else 1
            parts.append(('code', ''.join(buf))); buf = []
            parts.append(('str', src[i:j + 1])); i = j + 1; continue
        if src.startswith('/*', i):
            j = src.find('*/', i + 2)
            i = n if j < 0 else j + 2
            buf.append(' ')
            continue
        buf.append(c); i += 1
    parts.append(('code', ''.join(buf)))

    def squeeze(t):
        t = re.sub(r'[ \t]*\n[ \t]*', '\n', t)   # Einrückung und Zeilenende-Leerzeichen (nicht vor/nach Zeichenketten)
        t = re.sub(r'\n{2,}', '\n', t)
        t = re.sub(r'[ \t]*\{[ \t\n]*', '{', t)
        t = re.sub(r'[ \t\n]*;?[ \t\n]*\}', '}', t)
        t = re.sub(r';[ \t]+', ';', t)
        t = re.sub(r'(?<=[\w-])[ \t]*:[ \t]+(?=[^{};\n]*(?:[;}]|$))', ':', t)   # „eigenschaft: wert“ → „eigenschaft:wert“
        t = re.sub(r'\n*([{};,>])\n*', r'\1', t)   # Zeilenumbrüche an Satzzeichen sind überflüssig
        return t
    out = ''.join(squeeze(t) if k == 'code' else t for k, t in parts)
    return out.strip()


def compact_html(src):
    # Einrückung vor Tags weg (der Zeilenumbruch bleibt – Leerraum zwischen Elementen bleibt also gleich)
    keep = re.split(r'(<textarea[\s\S]*?</textarea>|<pre[\s\S]*?</pre>)', src)
    for k in range(0, len(keep), 2):
        keep[k] = '\n'.join(line.strip() for line in keep[k].split('\n') if line.strip())
    return ''.join(keep)


# ---------------------------------------------------------------- Zusammenbauen
html = (WEB / 'index.html').read_text(encoding='utf-8')
css = (WEB / 'app.css').read_text(encoding='utf-8')
icon = (WEB / 'icon.svg').read_text(encoding='utf-8').strip()
icon_uri = 'data:image/svg+xml,' + urllib.parse.quote(icon, safe=' =:/-.,')

if not READABLE:
    html = compact_html(html)
    css = compact_css(css)
css = css.replace('url(icon.svg)', f"url('{icon_uri}')")
html = html.replace('<link rel="icon" href="icon.svg" type="image/svg+xml">', f'<link rel="icon" href="{icon_uri}" type="image/svg+xml">')
html = html.replace('<link rel="stylesheet" href="app.css">', f'<style id="kt-css">\n{css}\n</style>')
html = html.replace('<meta charset="utf-8">', '<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n'
                    '<meta name="description" content="KnowledgeTree – einfaches Brainstorming mit Gruppen, Seiten, Textfeldern und Verbindungen. Speichert alles im Browser.">')


def inline(m):
    name = m.group(1)
    if name == 'js/backend-server.js':
        name = 'js/backend-browser.js'
    code = (WEB / name).read_text(encoding='utf-8')
    if name == 'js/plugins.js':
        # KI-Vorlage für Add-Ins (1.69, seit 1.70 eine .js-Datei) als Text einsetzen – das Programm liest sie aus web/addins/
        md = (WEB / 'addins' / '_Add-In-Vorlage_KI.js').read_text(encoding='utf-8')
        assert "'%%KT_ADDIN_VORLAGE%%'" in code
        code = code.replace("'%%KT_ADDIN_VORLAGE%%'", json.dumps(md, ensure_ascii=False).replace('<!--', '<\\u0021--'), 1)
    if not READABLE:
        code = compact_js(code)
    code = code.replace('</script', '<\\/script')
    # ein „<!--“ im Code könnte den HTML-Leser in den Kommentar-Zustand der Skriptdaten bringen (dann beendet
    # </script> das Skript nicht mehr) – darum gar nicht erst zulassen
    assert '<!--' not in code, f'{name}: „<!--“ im Code (bitte z.B. als "<!-" + "-" schreiben)'
    return f'<script data-kt="{name}">\n/* ---- {name} ---- */\n{code}\n</script>'


SCRIPTS = len(re.findall(r'<script src="([^"]+)"></script>', html))
html = re.sub(r'<script src="([^"]+)"></script>', inline, html)
assert 'src="js/' not in html and 'href="app.css"' not in html

# Gerüst für die interaktive Datei (1.25): Platz für die Daten im Kopf, das HTML ohne Code als JSON (ohne „<“)
html = html.replace('<meta charset="utf-8">', '<meta charset="utf-8"><!--kt-datei-->', 1)
SHELL_EMPTY = '<script type="application/json" id="kt-shell"></script>'
pre, sep, post = html.rpartition('</body>')   # das letzte </body> – im Code (Export-Vorlagen) stehen weitere
assert sep
html = pre + SHELL_EMPTY + '\n' + sep + post
shell = re.sub(r'(<script data-kt="[^"]+">)[\s\S]*?(</script>)', r'\1\2', html)
shell = re.sub(r'(<style id="kt-css">)[\s\S]*?(</style>)', r'\1\2', shell)
assert shell.count('<script data-kt="js/') == len(re.findall(r'<script data-kt="js/', html)) == SCRIPTS and '<!--kt-datei-->' in shell
assert html.count(SHELL_EMPTY) == 1
html = html.replace(SHELL_EMPTY, '<script type="application/json" id="kt-shell">' + json.dumps(shell, ensure_ascii=False).replace('<', '\\u003c') + '</script>', 1)
OUT.parent.mkdir(exist_ok=True)
OUT.write_text(html, encoding='utf-8')
print(f'{OUT}  ({OUT.stat().st_size // 1024} KB{", lesbar" if READABLE else ""})')
