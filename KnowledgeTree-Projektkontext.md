# KnowledgeTree – Projektkontext

Stand: 24. November 2026 · Version 1.76 · Autor/Besitzer: **TheDragonas**

Diese Datei beschreibt das Programm „KnowledgeTree" vollständig, damit Claude in einem
neuen Chat sofort weiss, worum es geht, ohne dass alles neu erklärt werden muss.

---

## 0. Für Claude: das Wichtigste zuerst

- **Was es ist:** ein Brainstorming-Programm und digitales Freiform-Notizbuch (ähnlich
  Obsidian, aber einfacher; wird schrittweise zu einem OneNote-Nachbau ohne KI, ohne
  Office-Anbindung und ohne Sync ausgebaut). Layout wie das klassische OneNote (links der Baum
  mit Notizbüchern/Abschnitten, daneben die Seitenliste mit Unterseiten), Bedienoberfläche wie PowerPoint. Es gibt es als **Windows-Programm** und als
  **Webseite** (eine einzige HTML-Datei, läuft auf GitHub Pages).
- **Sprache:** Die ganze Oberfläche, alle Texte, Kommentare im Code und Dateinamen sind
  **auf Deutsch**. Bitte so weiterführen (Schweizer Schreibweise: „ss" statt „ß").
- **Namensnennung:** Im Info-Dialog steht „by TheDragonas". Das bitte beibehalten.
- **Technik-Grundsatz:** kein Framework, kein npm, kein Build-Tool. Nur reines
  HTML/CSS/JavaScript plus ein kleines Go-Programm für die Desktop-Version. Bitte dabei
  bleiben – das Programm soll eine einzelne Datei bzw. ein einzelner Ordner ohne Installation
  bleiben. **Einzige Ausnahme (vom User so entschieden):** schwere Zusatz-Bibliotheken für
  Texterkennung, Handschrift oder Sprache werden **erst bei Bedarf** aus dem Internet
  nachgeladen (aktuell nur Tesseract.js für „Freihand → Text“, Version fest angegeben).
  Lesen **und Schreiben** von OneNote-Dateien (inkl. LZX/MSZIP, CAB), Formeln (eigener
  LaTeX-Parser → MathML), PDF/HTML-Export, das Farbrad, Chem-Draw, die Tabellenkalkulation
  (Formel-Engine), Diagramme, der Taschenrechner, die Handschrift-Erkennung (Fotomath) und das
  Ausweichen der Verbindungen sind dagegen **selbst geschrieben** und brauchen nichts aus dem Internet.
- **Hauptplattform ist die Webseite** (GitHub Pages). Die Desktop-EXE teilt denselben
  Client-Code, wird aber nur bei Bedarf neu gebaut.

**Wenn Code geändert werden soll, braucht Claude den Quellcode im Chat:**

| Was geändert werden soll | Diese Datei(en) anhängen |
|---|---|
| Irgendetwas an der Oberfläche oder Bedienung (gilt für beide Versionen) | `index.html` (die Webseiten-Datei – sie enthält den kompletten Client-Code) |
| Speichern in Ordner, Fenster, Backups, EXE | zusätzlich `main.go`, `store.go`, `window_windows.go` aus `KnowledgeTree-Quellcode.zip` |

**Neuer Chat – so geht es ohne Informationsverlust weiter (Stand 1.76):** diese Datei und `KnowledgeTree-Quellcode.zip`
anhängen (die ZIP enthält das Git-Repository-Abbild, die Datei hier ist die vollständige Beschreibung). Claude entpackt
die ZIP, baut mit `python3 build_web.py`, testet und liefert zurück. Neueste Wünsche: Abschnitt 1, Punkte 80–83;
Neuerungen je Version: die Abschnitte „Office …“/„Word …“/„Suche oben …“ in Abschnitt 3; Fallstricke: Abschnitt 8
(fortlaufend nummeriert, zuletzt 231); Testnotizen: Abschnitt 9 („Für 1.xx: …“, neueste zuerst); Grenzen: Abschnitt 10.

**Ablauf bei jeder neuen Version (immer gleich):**
1. Version an vier Stellen erhöhen: `main.go` (`appVersion`), `web/js/backend-browser.js` (2×), `build/kt.rc`
   (`1,xx,0,0` / `"1.xx.0.0"` / `"1.xx"`), `web/js/plugins.js` Zeile 44 (Fallback `'1.xx'`); danach
   `cd build && llvm-windres --target=pe-x86-64 -i kt.rc -o ../rsrc_windows_amd64.syso`.
2. Diese Datei nachführen: „Stand“-Zeile, Wunsch des Users wörtlich als nächster Punkt in Abschnitt 1, neuer Abschnitt
   in Abschnitt 3, neue Fallstricke (Abschnitt 8), „Für 1.xx“-Testnotiz (Abschnitt 9, vor der vorigen), Dateiliste
   (Abschnitt 5), Globale Objekte, Datenmodell/`Store.ui` (Abschnitt 6), Bekannte Grenzen (Abschnitt 10).
3. `python3 build_web.py`, Tests im Browser (Playwright gegen `dist/` mit `python3 -m http.server 8800`) **und** gegen
   den Programm-Server (`go build -o /tmp/kt-linux . && /tmp/kt-linux --nowindow --dir /tmp/kt-srv --port 8795 --token
   srvtest`, URL `http://127.0.0.1:8795/?t=srvtest`); bei Office-Änderungen alle `tests/browser/office-1xx.js`,
   `formate-171.js`, `addins-*.js` und die Knoten-Tests (`tests/sheet`, `tests/office`, `tests/build`, `tests/store`).
   Testdateien: `tests/browser/formate-fixtures.py`, `word-fixtures.py` (1.74), `office175-fixtures.py` (1.75) –
   Testdateien des Users nie ins Repository.
4. Windows-EXE (`GOOS=windows GOARCH=amd64 CGO_ENABLED=0 go build -trimpath -ldflags "-H windowsgui"`, `dist/index.html`
   muss vorher gebaut sein), Paket-Ordner mit EXE, `LIESMICH.txt`, `Add-Ins` (erzeugt das Programm beim ersten Start),
   `KnowledgeTree im Browser starten.bat` → `KnowledgeTree-1.xx-Windows.zip`.
5. Commit (Nachricht „1.xx: …“ auf Deutsch), `git archive` → `KnowledgeTree-Quellcode.zip`; ausgeliefert werden
   Windows-ZIP, `index.html`, Quellcode-ZIP und diese Datei. Zum Schluss eine kurze deutsche Zusammenfassung, klar
   getrennt: was getestet ist, was nicht (**Microsoft Office selbst und Windows selbst sind nie getestet**).

**Feste Abmachungen:** Oberfläche/Kommentare Deutsch mit „ss“; kein Framework/npm; GESTIS nur verlinken, nie Daten
kopieren; den Syntheseplaner nicht weiter ausbauen; Add-Ins und Makros laufen mit vollen Rechten (so gewollt, Hinweis
bleibt); Office-Dateien verlustfrei – unverändert gespeichert = byte-gleich; der User wünscht bei Layout-Änderungen oft
„wie zu Beginn“ – vorher nachfragen bzw. klein ändern (1.76: ein grösserer Umbau wurde wieder verworfen).

Wichtig: `index.html` ist die **zusammengebaute** Fassung. Im Quellcode liegen dieselben
Teile als einzelne Dateien unter `web/` (siehe Abschnitt 5). Änderungen gehören in die
Einzeldateien, danach erzeugt `build_web.py` die `index.html` neu. Wenn nur `index.html`
vorliegt, kann Claude auch direkt darin arbeiten – dann ist sie die neue Quelle.

---

## 1. Die ursprünglichen Anforderungen

1. Brainstorming-Programm ähnlich Obsidian, aber einfacher.
2. Aufbau wie OneNote: **Gruppen**, beliebig tiefe **Untergruppen**, darin **Seiten**.
3. Eine Seite ist eine freie Fläche: **Klick auf die Fläche erstellt sofort ein Textfeld**,
   in das man direkt tippen kann.
4. Textfelder können mit **Bildern** ergänzt werden. Bilder lassen sich im Feld frei
   verschieben, **der Text fliesst um das Bild herum**.
5. Felder lassen sich **sperren** und zu einem **Paket gruppieren** („merged").
6. Pakete und Felder lassen sich **mit gedrückter rechter Maustaste verbinden**, wie
   Shader-Nodes in Blender → daraus entsteht ein „KnowledgeTree".
7. Einfache Bedienung, oben ein **Menüband (Ribbon) wie in PowerPoint**; die Registerkarte
   „Start" entspricht der Formatierung von PowerPoint.
8. **Laufendes automatisches Speichern**, beim Öffnen wird alles wieder geladen.
9. **Rückgängig/Wiederholen über 100 Schritte.**
10. Programm liegt in einem Ordner; daneben klar benannte Ordner **`Saves`** (Gruppenlayout
    als Ordner) und **`Cache`**.
11. (Später) Eine **HTML-Version für GitHub Pages**, die alles **im Browser** speichert.
12. (Später) Verbindungen: **mehrere pro Feld**, auch **mehrere zwischen denselben zwei
    Feldern** (z.B. ein Pfeil hin und einer zurück), und die Linie soll **am Feld** und
    **frei im Raum** verschiebbar sein.
13. (Oktober 2026) Konzept **„Digitales Freiform-Notizbuch“** (OneNote-Nachbau, eigener Text
    des Users mit den Abschnitten 1–17, darunter 8.5 „ChemDraw“: ein Knopf, der im Hintergrund
    das Zeichnen von Molekülen ermöglicht und eine Bildschirmtastatur mit dem Periodensystem
    ausklappt). Entscheid des Users: **KnowledgeTree ausbauen**, **Webseite zuerst**,
    Zusatz-Bibliotheken **bei Bedarf nachladen**, erste Etappe = **„Struktur und Seiten“ +
    „Zeichnen und Formen“**.

14. (Oktober 2026) **OneNote-Dateien importieren und exportieren, möglichst ohne Verlust.**
    Ehrliche Einordnung, mit dem User besprochen: 100 % verlustfrei geht in keiner Richtung,
    weil beide Programme Dinge haben, die das andere nicht kennt (KnowledgeTree: Verbindungen,
    Pakete, Feldfarben, Textumfluss; OneNote: Audio, Formeln, Tags, Anhänge …). Gewählter Weg:
    **direkt mit Dateien (.one/.onepkg) in der Webseite**, zuerst Import, dann Export.
    Benutztes OneNote beim User: **OneNote (Microsoft 365) auf Windows**.
    **Import fertig (1.3), Export als Beta (1.4).** Seit 1.4 legt der Import alles
    **positionsgenau** ab (gleiche Koordinaten, Zeilenhöhe und Schriften wie OneNote).
15. (Oktober 2026, Version 1.4) Wünsche des Users: **Layout wieder wie zu Beginn** (alle
    Notizbücher/Abschnitte links als Baum, einzeln einklappbar, Seitenliste daneben, keine
    Register oben), **OneNote-Import positionsgenau**, **Einfügen → Formel** (wie Office),
    **Farbrad** bei jeder Farbauswahl, **Export mit gezielter Auswahl** von Seiten, Abschnitten
    und Notizbüchern als **PDF, Webseite (HTML), KnowledgeTree-Datei und OneNote**.
16. (Oktober 2026, Version 1.5) Rückmeldung mit echter OneNote-Seite (Ausdrucke mit
    Handschrift, Diagramm, YouTube-Video): **Link/Video funktionieren**, **Grössen und Lagen
    wie in OneNote**, **Bilder auswählen und mit Pfeiltasten verschieben** ohne dass sich die
    Formatierung ändert, **Objekte gezielt aus-/abwählen** (z.B. Schrift vor einem Bild),
    **Handschrift vollständig**, **Seitenliste/Notizbücher einklappbar** zu einem Streifen.
17. (Oktober 2026, Version 1.6) **Doppelklick** auf die Seitenspalten klappt sie ein/aus;
    in der **freien Fläche des Notizbuch-Baums** (unten und per Rechtsklick) lassen sich wie
    oben Abschnitte und Abschnittsgruppen hinzufügen; **„Chem-Draw“** unter Zeichnen
    (angelehnt an ChemDraw): Moleküle zeichnen, Summenformeln schreiben, **Molare Masse** und
    **chirale C-Atome automatisch markiert** (ChemDraw-Funktion aus Konzept 8.5, inkl.
    Periodensystem-Tastatur).
18. (Oktober 2026, Version 1.7) Chem-Draw: **Molare Massen mit 3 Nachkommastellen**,
    **Raster-System überarbeitet** (schönere Moleküle), **IUPAC-Name automatisch** erzeugen
    und bearbeiten (auch für den ausgewählten Bereich), **Trivialnamen-Datenbank** mit
    Strukturbildern, die sich als Vorlage einfügen lassen.
19. (Oktober 2026, Version 1.8) Wünsche des Users (sinngemäss): Objekte auf der Seite
    **„verankern“ wie OneNote/Excel** – zwei **dynamische Bildlaufleisten** unten und rechts, der
    Bereich ist grundsätzlich nur dort, wo Objekte sind, man kann sich aber frei bewegen und der
    Bereich wächst; **Ankerpunkte = Ecken des Rechtecks um alle Objekte**. **Grundlegende
    Excel-Funktionen** (Tabellen erstellen, Prozesse automatisieren), **Grafiken aus Rohdaten**
    erstellen und **die Daten auslesen**, beides angelehnt an Excel. **Wissenschaftlicher
    Taschenrechner** (angelehnt an den **TI-30X Plus**) per Knopf, im Fenster frei verschiebbar
    und minimierbar, **Rechenverlauf gezeichnet/angezeigt, Werte per Klick wieder einfügen**.
    **OneNote-Kompatibilität in beide Richtungen bleibt** – bei Tabellen/Diagrammen keine
    Datenverluste: die Informationen für den Rückimport **versteckt im Hintergrund**, die
    sichtbaren Werte in OneNote **gleich dargestellt wie in KnowledgeTree**. Vorher alles prüfen
    und recherchieren.
20. (Oktober 2026, Version 1.9) Wünsche des Users (sinngemäss, mit Bild der Vorlage
    „TI-30X Plus MathPrint“, **Europa-Ausführung**): **Tasten nochmals überarbeiten** genau nach
    der Vorlage; mit einem Knopfdruck zwischen **normalem Taschenrechner** und wissenschaftlichem
    wechseln (wie Handy/Windows „Standard ↔ Wissenschaftlich“); **Grösse des Rechners veränderbar**;
    bei **2nd tauschen die Tastenbeschriftungen**; die **Bruch-Funktion** (Bruch von Hand eingeben)
    ging nicht. Neben dem Rechner im Register einen **„Fotomath“**: Auswahlwerkzeug, das von Hand
    geschriebene Rechnungen **erkennt, schön darstellt und ausrechnet**. **Excel-Funktionen
    überarbeiten**: beim Tippen einer Formel **Textvorschläge zu Funktionen**, dafür (wie für die
    Diagramme) eine **Erste-Schritte-Seite**; Tabellen und Diagramme sollen sich **bei Änderungen
    aktualisieren – ressourcenschonend**. **Verbindungen**: die Linie soll **nicht durch Bilder,
    Textfelder oder Chem-Zeichnungen** gehen.
    Nachträge zu 1.9: Doppelklick auf den oberen Rand des Rechners = Standardgrösse, Grösse an
    **allen vier Ecken** ziehbar; Verbindungen halten immer **etwas Abstand** zu Objekten, gehen
    nie hinter Objekten durch, gehen immer nur von **einem** Objekt weg, der Pfeil versteckt sich
    nie hinter einem Objekt (v.a. Linienform „Winkel“).
21. (Oktober 2026, Version 1.10) Wunsch des Users: die ganze Webseite **vollständig
    handykompatibel** machen, bzw. ein **dynamisches Layout, das bei so gut wie allen
    Fenstergrössen vollständig funktioniert**.
    Nachträge zu 1.10: auf dem Handy liess sich der Rechner kaum schliessen → **Schliessen-Knopf
    grösser**, Anfasser oben rechts kleiner. **Wie OneNote „Bild als Hintergrund festlegen“**: so
    markierte Objekte werden vom **Lasso und vom Auswahlrahmen ausgenommen**, lassen sich aber
    **einzeln anklicken und auswählen**; zu finden **per Rechtsklick** wie in OneNote.
22. (Oktober 2026, Version 1.11) Wunsch des Users: Beim Import von Word/PDF-„Seiten“ (wie
    OneNote-Dateiausdrucke) werden die **Bilder nicht geladen**. Gewünscht: eine **Datei anhängen**
    und **per Rechtsklick die Seiten als Bilder aufklappen** können (wenn nicht exakt möglich, einen
    **Workaround** finden). Hintergrund des Problems: der User hat ein Skript als Word/PDF, dessen
    Seiten in OneNote als Ausdruck sichtbar sind; beim Import nach KnowledgeTree fehlen die Bilder.
    Wichtig: **in beide Richtungen mit OneNote kompatibel** bleiben.
    Hinweis zum „Schutz umgehen“: KnowledgeTree **umgeht keinen Kopierschutz/keine Verschlüsselung**.
    Für den eigentlichen Zweck ist das auch nicht nötig – ein PDF mit Druck-/Kopier-Einschränkungen
    (keine Zugriffssperre) wird **ganz normal gerendert**; ein passwortverschlüsseltes PDF fragt nach
    dem Passwort (nicht geknackt). Das „fehlende Bild“ beim OneNote-Import ist **kein Schutz**.
    **Korrektur (1.13):** Die damalige Annahme „Bilddaten liegen ausserhalb der .one-Datei“ stimmte für
    Ausdrucke **nicht** – die Seitenbilder stecken in der Datei, der Leser nahm aber das XPS-Druckdokument
    statt des PNG-Seitenbilds (siehe Punkt 24). Ausserhalb liegende Daten (OneDrive) gibt es zwar auch,
    sind aber der seltenere Fall.
23. (Oktober 2026, Version 1.12) Wunsch des Users: Beim Import **.zip- und .rar-Dateien** hochladen
    können, sodass daraus **neue Notizbücher mit der Ordnerstruktur** entstehen. Klarstellung des Users:
    in den ZIP/RAR-Dateien liegen **OneNote- oder KnowledgeTree-Dateien** – es geht darum, dass
    **Sicherungen von OneNote direkt eingefügt** werden können (nicht um beliebige PDFs/Bilder).
24. (Oktober 2026, Version 1.13) Auftrag des Users: das bestehende Problem beim **verlustfreien
    Importieren/Exportieren in beide Richtungen** prüfen und beheben, nach seinem Konzept
    „Verlustfreier OneNote-.one-Import (Bilder-Fix)“ (an einer echten Datei „Wohnen“ geprüft; die dort
    erwähnte Referenz `one-import.js` und die Datei selbst lagen nicht bei). Kernpunkte des Konzepts:
    (1) Bilddaten liegen im FileDataStore (`<ifndf>{GUID}`); (2) bei **Ausdrucken** zeigt
    `PictureContainer` (0x20001C3F) auf das **XPS-Druckdokument**, das sichtbare Seitenbild (PNG) hängt an
    **0x200034C8** – zuerst 0x200034C8, dann 0x20001C3F, Magic Bytes entscheiden, kein Bild → Anhang;
    (3) der Seitentitel hängt an `StructureElementChildNodes` (zweite Kinderliste), Titel/Datum/Uhrzeit
    nicht überlappen lassen; **nicht zugeordnete FileDataStore-Einträge auf einer Sammelseite „Nicht
    zugeordnete Inhalte“**, unauflösbare Bilder als Platzhalter, OCR-Text der Bilder als Suchtext.
    Akzeptanztest „Wohnen“: 2 Seiten, 8 + 5 PNG-Seitenbilder 1191×1684 + je ein .docx, keine XPS als Bild,
    Titel/Datum lesbar; nicht zugeordnet nur 2 XPS + 1 Anhang-Symbol (64×64).
25. (Oktober 2026, Version 1.14) Wunsch des Users: Die **Schriftfarbe standardmässig dem Kontrast des
    Hintergrunds anpassen** – im dunklen Design tendenziell weiss, im hellen tendenziell schwarz, aber
    **nicht ganz weiss oder schwarz**, sondern eine hellere bzw. dunklere Tönung der Hintergrundfarbe,
    sodass es immer gut erkennbar bleibt.
26. (Oktober 2026, Version 1.15) Meldung des Users (Handy-Screenshot, Seite „Merck interaktives PSE“ aus
    einer OneNote-**Sicherung**, Abschnitt „Tabellen 2“): beim Importieren werden **Bilder, Dateien oder aus
    Dateien geladene Bilder nicht immer geladen**; im Seitentitel standen zwei Kästchen. Die betroffene Datei
    lag nicht bei – umgesetzt wurde, was die Datei-Struktur zulässt (siehe „Fehlende Bilder/Anhänge“).
27. (Oktober 2026, Version 1.16) Der User schickt die echte Datei **„65_Potentiometrie.one“** (15.5 MB) mit
    Screenshots (OneNote vs. KnowledgeTree): Ausdrucke erschienen nur als XPS-Chips, ein PDF-Anhang und ein
    Ausdruck als „ungültig“ – „entweder nicht in der Datei oder nicht richtig ausgelesen“. **Ursache: falsch
    gelesen.** Das Transaktions-Log der Datei besteht aus 4 Fragmenten (249 Speichervorgänge); KnowledgeTree
    las den Verweis auf das nächste Fragment an der falschen Stelle und blieb nach 131 Vorgängen stehen →
    alle Dateiknoten-Listen wurden auf diesem alten Stand abgeschnitten (5 statt 11 Seiten, 70 statt 152
    Dateien, ältere `<invfdo>`-Deklarationen statt der späteren mit Daten). Behoben (siehe Fallstrick 52).
28. (Oktober 2026, Version 1.17) Wunsch des Users: **alle Import-Funktionen zu einem Knopf zusammenfassen**,
    der völlig selbständig anhand der Datei entscheidet, wie importiert wird. Ausdrücklich **nicht** dazu
    gehört das Laden von Backups – das bleibt ein eigener, getrennter Knopf („Backup laden“ bzw. Desktop
    „KT-Datei laden“).
29. (Oktober 2026, Version 1.18) Meldung des Users: beim Importieren **grösserer Dateien „out of memory“** –
    die Webseite ist abgestürzt. Wunsch: Import **und** Export effizienter aufbauen und **in Teile
    gliedern**, damit nicht alles auf einmal erzeugt bzw. eingelesen wird. Ursache: Archive, .onepkg und
    Sicherungen wurden vollständig entpackt bzw. als ein Text/JSON in den Speicher geladen, alle Abschnitte
    gleichzeitig zerlegt, und Exporte als ein grosser String/Puffer zusammengesetzt (siehe „Grosse Dateien“).
30. (Oktober 2026, Version 1.19) Meldung des Users (Screenshot „Oh nein! … Fehlercode: Out of Memory“): Import eines
    **1.7 GB grossen RAR-Archivs** stürzt ab, „vor Version 1.15 hatte ich diesen Fehler bei dieser Datei nicht“; Wunsch:
    Ursache finden (recherchieren, ältere Versionen analysieren) und beheben. Ergebnis der Analyse (Datei lag nicht
    bei, nachgebaut als echtes RAR5 mit 150 Abschnitten): Der RAR-Weg war in 1.12–1.17 **unverändert** – das ganze
    Archiv wurde gelesen und **kopiert** (2 × 1.7 GB), dann **alles auf einmal** entpackt (jede Datei zweimal im
    Speicher) und alle Abschnitte gleichzeitig zerlegt; im Test mit 6 GB Grenze stürzten 1.14 und 1.17 ebenso ab
    (Renderer ~6 GB). 1.18 brach jeden Entpack-Durchlauf nach dem Treffer ab: node-unrar-js gibt das C++-Objekt
    nur frei, wenn der Durchlauf **bis zum Ende** läuft – je Datei blieb ein Wörterbuch-Fenster (32 MB) im
    WASM-Speicher (bis 2 GB), alle entpackten Dateien blieben festgehalten, und mehr als die Hälfte der Abschnitte scheiterte
    („File read error“/„File is not RAR archive“, weil das nicht geschlossene Archiv an der alten Stelle weiterlas).
    Spitze 4.8 GB. Behoben in 1.19 (siehe „Grosse Dateien“ → RAR, Fallstrick 54). Dass es vor 1.15 klappte, lässt
    sich am Code nicht festmachen (RAR-Teil identisch); vermutlich reichte damals der freie Arbeitsspeicher knapp.
31. (Oktober 2026, Version 1.20) Der User meldet mit 1.19 wieder „Out of Memory“ beim selben RAR und vermutet, dass
    Reste fehlgeschlagener Importe den neuen Import verhindern. Wunsch: **bei fehlgeschlagenem Import und beim Löschen
    die Daten restlos entfernen** (oder nur noch im Strg+Z-Verlauf behalten). Rückfragen beantwortet: Löschen =
    **„Restlos + Strg+Z“** (kein Papierkorb mehr für Gelöschtes); Info zeigte **1.19**. Befund (Nachbau mit den echten
    OneNote-Dateien des Users, 1.8 GB, 1342 Seiten mit Freihand): 1.19 importiert das in einem frischen Browser
    (Renderer ~0.8 GB) – aber jede abgestürzte Teil-Sicherung blieb als Notizbuch liegen (Seiten alle 40 gespeichert),
    gelöschte Teile wanderten mit allen Seiten in den Papierkorb (60 Tage, samt Bildern), und beim Start wurden
    Seiten, Papierkorb und Versionen **auf einmal** geladen; dazu hielt der Verlauf von **jeder** Seite eine zweite
    Kopie als Text – zweibytig (V8), also doppelt so gross wie nötig. Jeder Fehlversuch erhöhte so den Grundbedarf.
    Umgesetzt in 1.20: siehe „Löschen, Absturz und Aufräumen“.
32. (Oktober 2026, Version 1.21) Der User exportiert die Abschnittsgruppe **„AM (Mathe)“** (226 Seiten, 278 Bilder) als
    .onepkg; **OneNote (Microsoft 365, Windows)** zeigt das Notizbuch, aber **jeder Abschnitt** meldet „Wir können
    diesen Abschnitt leider nicht öffnen, weil wir ein Problem mit seinem Inhalt gefunden haben“. Wunsch: Code
    überarbeiten, funktionierende Lösung. Befund (Paket, KT-Sicherung und HTML lagen bei; alle 87 Dateien mit einem
    neuen strengen Prüfer gegen die Spezifikation und echte OneNote-Dateien verglichen): der eigene Leser nahm alles
    hin, OneNote nicht. Verstösse gegen **MUST-Regeln**: (1) in **jedem Dateiknoten** fehlte das Reserved-Bit 31
    ([MS-ONESTORE] 2.4.3), (2) **Transaktions-Log-CRC** falsch – über das Log **inklusive** Abschlusseintrag statt
    davor, beim Inhaltsverzeichnis (.onetoc2) zudem das falsche Verfahren (dort MsoCrc32, [MS-OSHARED] 2.4.3.2),
    (3) **ObjectInfoDependencyOverrides (0x084)** fehlte nach jeder Objektgruppe, (4) Bilder ohne `LanguageID`,
    Anhänge ohne Symbolbild/`LanguageID`/Text, Spaltenbreiten unter 1.0, Versionsverlauf-Kontext nicht der
    vorgeschriebene, Absatztext mit Zeilenvorschub, leere Seitenreihe bei leeren Abschnitten, Füllnullen zwischen
    Listenfragmenten. Umgesetzt in 1.21: siehe Fallstrick 22 und 56. Der Inhalt der Dateien bleibt gleich
    (78 Abschnitte verglichen) – das Paket muss **neu exportiert** werden.
33. (Oktober 2026, Version 1.22) Rückmeldung zu 1.21 mit drei Screenshots: (a) OneNote öffnet das Notizbuch und die
    Abschnitte, aber **jede Seite** meldet „OneNote kann diese Seite aufgrund von Problemen mit dem Inhalt nicht
    öffnen“; (b) OneNote-Dateien sind fast verlustfrei importierbar, aber **nicht verlustfrei zurück**
    exportierbar; (c) **importierte Bilder fehlen nach dem Neuladen** der Webseite (meistens); (d) im **PDF** sind
    Text, Bilder und Freihand gegeneinander verschoben; (e) der Export lässt sich nicht abbrechen – „Abbrechen“
    beim PDF fängt wieder von vorne an. Rückfragen: alle Seiten betroffen; Bilder aus .one/.onepkg; im PDF ist
    alles gegeneinander verschoben. Befunde und Lösungen (1.22):
    (a) Im **PageManifestNode** jeder Seite (Verweis auf den Versionsverlauf über einen Kontext) fehlte im
    Kopf des OID-Stroms das Bit **ExtendedStreamsPresent** (MUSS, [MS-ONESTORE] 2.6.2), und
    `fHasOsidReferences` war 0 – OneNote las die Wurzel jeder Seite falsch. Behoben, Prüfer erweitert.
    (b) Ausdrucke: das Druckdokument (.xps) und die **Quelldatei** (PDF, über 0x200035C1 → Dateiobjekt 0x80060)
    landeten auf „Nicht zugeordnete Inhalte“. Jetzt am Seitenbild (`im.print`) und beim Export zurückgeschrieben.
    (c) **Ursache:** Textfelder, die nur ein eingebettetes Bild enthalten (Bild in einer OneNote-Gliederung),
    galten als „leer“ (`isEmptyHtml` zählte nur Text) und fielen beim Speichern (`cleanPage`) und beim Laden weg.
    Nachgestellt (4 Bilder → nach dem Neuladen 1) und behoben – schon verlorene Bilder kommen nur durch erneuten
    Import der OneNote-Datei zurück. (d) Chrome teilt eine lange Seite beim Drucken selbst auf Blätter auf und
    schiebt dabei Bilder und Textzeilen über den Blattrand, die Freihand-Ebene (ein SVG) aber nicht → jetzt
    schneidet KnowledgeTree die Seite selbst in Blätter. (e) „Abbrechen“ im Fortschritt; zwischen PDF-Teilen
    eine Rückfrage (vorher öffnete sich nach „Abbrechen“ im Druckdialog sofort der Druckdialog des nächsten Teils).
34. (November 2026, Version 1.23) Wunsch: die aktuelle Version **optimieren, den Code überarbeiten und unnötige Zeilen
    entfernen – keine Funktionen entfernen**. Rückfragen beantwortet: **beides** (Quellcode aufräumen und die
    ausgelieferte index.html verkleinern), **Kommentare im Quellcode behalten**. Umgesetzt: siehe Fallstrick 59 und
    „Bauen und Testen“. Ergebnis: Quellcode ~150 Zeilen weniger (tote Hilfsfunktionen, nie gelesene Variablen,
    doppelte Logik), index.html 1659 → 1252 KB (−25 %), Programm unverändert (Syntaxbaum je Datei gleich).
35. (November 2026, Version 1.24) Wunsch: Browser und EXE **gleich gestalten** – im Register „Datei“ **vier Funktionen**
    (Backup erstellen, Backup laden, Exportieren, Importieren), Backups und KT-Export-Dateien **zwischen Browser und
    EXE austauschbar** (bisher liess sich der Browser-Export in der EXE nicht importieren: „Importieren“ verwies nur
    auf „KT-Datei laden“), **die Form der EXE-Backups behalten**, Dateien **möglichst klein**, ein **Einstellungen-
    Knopf** im Register „Datei“ (wie die OneNote-Optionen), u.a. für die Backups (wie oft: jede Woche/jeden Monat,
    nur bei Änderungen, wie viele), alles **performant und speicherschonend**, vorher alles planen. Umgesetzt: siehe
    „Sicherung, Export und Einstellungen (seit 1.24)“ in Abschnitt 3 und Abschnitt 7. Ergebnis mit der echten Datei
    „AM (Mathe)“: 81 MB JSON → 47,5 MB ZIP; Seiten im Saves-Ordner 64 → 27 MB; Programmstart bei 190 MB Seiten
    9 s → 0,2 s für das Bilder-Prüfen.
36. (November 2026, Version 1.25) Meldung: beim Laden eines Browser-Backups in der EXE kam „Bilder konnten nicht
    übernommen werden: kein Bild“ (ein leeres Bild in der Sicherung brach alles ab), und eine exportierte HTML liess
    sich nicht wieder importieren (das war die Webseite zum Ansehen). Wünsche: beim Export „KnowledgeTree-Datei“
    ein Kästchen **Interaktiv oder .json** – interaktiv = eine **HTML-Datei mit vollständigem KnowledgeTree und
    nur dem ausgewählten Inhalt**, die wieder importiert werden kann; **Backups wie bei OneNote** (jeder Abschnitt
    eine eigene KnowledgeTree-Datei), die sich als **Ordner-Konstrukt** wieder importieren lassen. Rückfragen
    beantwortet: Abschnitt-Datei = **kompakte KT-Datei** (.knowledgetree.zip), Formate beim Export **HTML + ZIP +
    JSON**, interaktive Datei **ansehen und bearbeiten** (Speichern = neue Datei herunterladen). Umgesetzt: siehe
    „Sicherung, Export und Einstellungen“ (Abschnitt 3) und Fallstricke 66–69.
37. (November 2026, Version 1.26) Wünsche: im Rechtsklick-Menü von **Abschnitten und Gruppen „Kopieren“ und
    „Einfügen“**; die Tabellen so gestalten, dass man **auf Zellen verschiedener Tabellen zugreifen** kann (Zahlen
    dynamisch übernehmen), **performant und wie Excel**, auch beim Aktualisieren von Zellen und Diagrammen; unter den
    Einstellungen eine **Druckfunktion** (orientiert an Excel, OneNote, Word); prüfen, dass **Backups und Exporte
    möglichst speicherschonend** sind. Ziel des Users: KnowledgeTree **als Planer für Satisfactory** nutzen können –
    **ohne Satisfactory-eigene Elemente**, nur indem das Werkzeug universell genug ist. Umgesetzt: siehe „Tabellen
    wie Excel“ (Bezüge über Seiten, Neuberechnung), „Kopieren und Einfügen im Navigationsbaum“, „Drucken“ in
    Abschnitt 3 und Fallstricke 70–75. Ergebnis mit „AM (Mathe)“: interaktive Datei 64,6 → 55,6 MB (Base-122),
    Webseite 246 → 76 MB (Bilder einmal, Freihand-Pfade halb so lang), ZIP/Backup unverändert klein (47,4 MB).
38. (November 2026, Version 1.27) Wünsche: die **Wiedergabe** (Zeichnen → Umwandeln) ist nicht nötig → entfernt;
    **Lineal und Winkelmesser in der Grösse verstellbar**, standardmässig **so gross wie der Bildschirm** und dabei
    **ungefähr in echten Zentimetern – bezogen auf die Druckgrösse eines Blattes der Seite**; ein **einfacher Klick auf
    eine Abschnittsgruppe klappt sie auf und zu** (nicht nur der Pfeil), **Doppelklick benennt weiterhin um**;
    **Fotomath: nach einer Unbekannten auflösen**. Umgesetzt: siehe „Zeichnen“, „Fotomath“ und Navigation in
    Abschnitt 3, Fallstricke 76–78.
39. (November 2026, Version 1.28) Wünsche: im **Vollbild** soll das **Menüband herunterklappen, wenn die Maus an den
    oberen Rand geht**, und wieder verschwinden, wenn sie sich entfernt; in Chem-Draw **verschiedene Atommodelle**:
    Keil/Strich, **Lewis**, **Bohr**, die **Orbitale** der Elektronen und eine **3D-Darstellung mit
    Elektronenverteilung**. Rückfragen beantwortet: Bohr/Orbitale **für jedes Atom der Struktur**, Orbitale als
    **Kästchen + Formen**, 3D = **Molekül drehbar + Elektronenwolke**. Umgesetzt: siehe „Chem-Draw → Darstellungen“
    und Navigation in Abschnitt 3, Fallstricke 79–81.
40. (November 2026, Version 1.29) Wünsche: den **Zoom von 15–400 % auf 1–1000 %** erweitern, und in der exportierten
    **Webseite (HTML, nur zum Ansehen) frei hinein und hinaus zoomen**. Umgesetzt: `ZOOM_MIN/ZOOM_MAX` in canvas.js
    (Mausrad, Strg+Plus/Minus, Zwei-Finger-Zoom, gespeicherte Ansicht), Regler in der Statusleiste logarithmisch
    (rastet bei 100 % ein), Hintergrundraster wird bei kleinem Zoom gröber (Fallstrick 82); Webseite: Zoom-Leiste
    unten rechts (−, Prozent = 100 %, +, an die Breite anpassen), Strg+Mausrad/Touchpad um den Mauszeiger,
    Strg+Plus/Minus/0, Zwei Finger auf dem Handy, ebenfalls 1–1000 % (`Export.ZOOM_CSS/ZOOM_JS`, Fallstrick 83).
41. (November 2026, Version 1.30) Wünsche: beim **Drucken einen „Scale“ (Massstab)** einstellen und so die Grösse des
    Druckbereichs selbst bestimmen; die **Kanten des Druckbereichs selbst verschieben**, unabhängig von Papier und
    Rändern; **viele Abschnitte, Bilder und Elemente schneller laden** (kein Stottern in den ersten Sekunden), Laden
    und **Importieren von Dateien** optimieren, Code effizienter/aufgeteilter und kürzer (ohne Funktionen zu ändern);
    **alles handytauglich**, auch die **exportierte Webseite (nur zum Ansehen)**. Umgesetzt: Drucken → Massstab-
    Schieber und Druckbereich (Abschnitt 3 „Drucken“); Leistung: Freihand nur im Sichtbereich im DOM, Verlaufs-
    Schnappschüsse im Leerlauf in Stücken, schnelleres Einlesen von Sicherungen (14 s → 2 s), Datumsformate
    zwischengespeichert, Bilder asynchron entschlüsselt (Fallstricke 84–88); Handy: Druckdialog mit Vorschau oben,
    Webseite mit Schublade (☰) und Zoom, der auf die Breite passt (Abschnitt 3 „Dynamisches Layout“).
42. (November 2026, Version 1.31) Wunsch: beim Start der Webseite und der EXE **zuerst die Einstellungen** (z.B.
    Dunkelmodus), **dann die Notizbücher nach und nach** laden, damit sich nichts aufhängt – **zuerst die Abschnitte,
    dann der Inhalt**, man kann schon navigieren, und **was man auswählt, wird vorgezogen**; möglichst nahtlos.
    Umgesetzt: „Laden in Stufen“ (Abschnitt 3 „Start“, `Lazy` in store.js, Fallstricke 89–91).
43. (November 2026, Version 1.32) Wunsch: noch schneller – **Abschnitte mit 500 Seiten oder 50 Abschnitte** sollen von
    der **Struktur sofort** da sein, der Inhalt im Hintergrund; **Einstellungen (Dunkelmodus usw.) und das Register
    direkt**, so dass man sofort damit arbeiten kann; auch sehr grosse Elemente und mehrere Notizbücher. Umgesetzt:
    Kopfangaben je Seite (Titel, Ebene, Datum) für die Seitenlisten, früher Stand der Einstellungen aus dem Browser,
    Verlauf nach dem ersten Bild, schnellere Seitenliste, Programm liest beim Start nur die Köpfe der Seiten
    (Abschnitt 3 „Start“, Fallstricke 92–94).
44. (November 2026, Version 1.33) Wunsch fürs Programm (EXE): die **Bilder im selben Bereich wie die Abschnitte**
    speichern – **jeder Abschnitt mit eigenem Bilder-Ordner**, so dass man einen Ordner aus Saves einfach kopieren und
    jemandem schicken kann; auch die **Backups** sollen die Bilder **beim Abschnitt** enthalten. Umgesetzt:
    `Saves/<…>/<Abschnitt>/_Bilder/` (assets.go), Backup-Abschnittsdateien mit allen ihren Bilder (Abschnitt 7
    „Desktop“, Fallstricke 95–97).
45. (November 2026, Version 1.34) Wünsche: das **Datei-Fenster vom Layout wie bei OneNote** gestalten (alle Funktionen
    behalten, höchstens sinnvoller verteilen); der Hinweis **„Vollbild beenden (F11)“** oben rechts soll das Vollbild
    auch **beim Anklicken** beenden. Umgesetzt: `backstage.js` (Abschnitt 4 „Datei“), Klick auf den Hinweis
    (Fallstrick 98).
46. (November 2026, Version 1.35) Wünsche: das **Violett etwas dunkler**; das **Menüband uniformer wie in den
    Office-Programmen** (Formgebung der Knöpfe und Gruppen); **mehrere Tabs in einem Programm öffnen, analog zu
    Obsidian** (Foto: Seiten nebeneinander und untereinander, je mit eigener Kopfzeile); Layout, Interaktionen und
    Funktionen für **dynamische Fenstergrössen und das Handy**, mit passenden Hitboxen. Umgesetzt: `panes.js`
    (Abschnitt 3 „Tabs und geteilte Bereiche“), einheitliches Raster im Menüband (Abschnitt 4), Akzent `#5b3fa6`
    (dunkel `#866ee0`), Fallstricke 99–103.
47. (November 2026, Version 1.36) Wünsche: die **Tableiste einklappbar** wie das Menüband – fast unsichtbar, nur
    Pfeilchen und ein Strich, kommt die Maus in die Nähe, klappt sie aus (auch fürs Handy); der **Seitentitel muss
    nicht über der Seite stehen**, es genügt der Tab; **Linksklick auf +** = neuer Tab mit dem jetzigen Tab,
    **Rechtsklick auf +** = die bisherige Auswahl; die **Erste-Schritte-Seiten überarbeiten** und auf alle Funktionen
    erweitern (kurze, einfache Anleitungen und Beispiele, die zeigen, was möglich ist und wozu das Programm gedacht
    ist); in den **Einstellungen unter Speicher den Speicherort** anzeigen. Umgesetzt: Abschnitt 3 „Tabs und geteilte
    Bereiche“ (1.36), „Erste Schritte“, Einstellungen „Speicherort“, Fallstricke 104–107.
48. (November 2026, Version 1.37) Wunsch: das **Vollbild überarbeiten** – beim Betreten sollen **alle offenen Tabs im
    Vollbild** zu sehen sein; **oben rechts an jedem Tab ein Pfeil**, der ihn **einzeln als Vollbild** öffnet.
    Umgesetzt: Abschnitt 3 „Tabs und geteilte Bereiche“ (Vollbild mit allen Tabs), Fallstricke 108–109.
49. (November 2026, Version 1.38) Wünsche: eine **Rechtschreibkorrektur wie in OneNote, Deutsch und Englisch**, auch
    für **wissenschaftliche Begriffe und Fachsprachen**; **Fotomath an der App Photomath orientieren**, auch bei der
    Erkennung von Rechnungen/Text intelligenter: **Rechenweg mit Rechenschritten** anzeigen oder **bloss das
    Resultat** – beides **als Text einfügbar** (mit allen Symbolen), mit einem **Häkchen vor dem Einfügen**, dass es in
    **normalen Tastatursymbolen** geschrieben wird. Umgesetzt: Abschnitt 3 „Rechtschreibung“ und „Fotomath“ (1.38),
    Fallstricke 110–115.
50. (November 2026, Version 1.39) Wunsch: beim **Schliessen des Programms die Dateien optimieren und sortieren** –
    doppelte identische Bilder/Dokumente nur **einmal** speichern, als **harte Verknüpfungen** (problemlos kopier- und
    löschbar); jeder Ordner (Abschnitt, auch mit Unterordnern) aus Saves oder Cache soll sich **herauskopieren** lassen,
    ohne dass Daten fehlen oder kaputtgehen. Umgesetzt: Abschnitt 3 „Speicher optimieren“, Fallstricke 116–118.
    Nachtrag (1.39): Optimieren **unterbrechen**, wenn das Programm wieder gestartet wird, und erst beim nächsten
    Schliessen weitermachen; nur **geänderte/frisch eingefügte Dateien** optimieren (Schnellprüfung); alles nochmals
    für Programm, Webseite und Handy prüfen; in der Webseite unter Speicherort angeben, **wo der Browser die Daten
    lokal ablegt**. Umgesetzt: Abschnitt 3 „Speicher optimieren“ und „Sicherung, Export und Einstellungen“.
51. (November 2026, Version 1.40) Wunsch: die eingeklappte **Tableiste** und das eingeklappte **Menüband** sollen sich
    **nur noch über das Pfeilchen** wieder aufklappen lassen (kein Ausfahren mehr bei Maus in der Nähe bzw. beim
    Antippen eines Registers); die **Pfeilchen auch im Vollbild** zeigen, um Menüband und Tabs ein- und auszublenden.
    Umgesetzt: Abschnitt 3 „Tabs und geteilte Bereiche“, Fallstrick 119.
52. (November 2026, Version 1.41) Wunsch: beim eingeklappten **normalen Menüband** soll ein Klick auf ein **Register**
    es wieder **herunterklappen, bis der Mauszeiger das Menüband verlässt**. Umgesetzt: Abschnitt 3 „Tabs und geteilte
    Bereiche“ (Nachtrag 1.41).
53. (November 2026, Version 1.42) Wünsche: neue **Standardwerte** – Sicherung **wöchentlich, 2 Backups**; Papierkorb
    **nach 30 Tagen** endgültig löschen; Design **Dunkel**; Wörterbücher zusätzlich **Französisch und Latein**.
    Umgesetzt: siehe Abschnitt „Rechtschreibung“ und „Sicherung, Export und Einstellungen“ (Nachtrag 1.42).
    Gespeicherte Einstellungen bleiben, wie sie sind – die neuen Werte gelten, wo noch nichts festgelegt ist.
54. (November 2026, Version 1.43) Wunsch: ein Bild **im Hintergrund** soll **verankert** sein – nicht mehr verschiebbar,
    nur per **Rechtsklick aus dem Hintergrund lösen**, danach wieder verschiebbar. Umgesetzt: Abschnitt 3
    „Hintergrund“, Fallstrick 120.
55. (November 2026, Version 1.45) Wunsch: nach **Strg+A** soll „Bild als Hintergrund festlegen“ für **alle markierten**
    Objekte gelten – auch für **Schrift** (Textfelder): im Hintergrund nicht mehr verschieben oder löschen, erst wieder,
    wenn sie nicht mehr im Hintergrund sind. Umgesetzt: Abschnitt „Hintergrund“ (Nachtrag 1.45), Fallstrick 122.
56. (November 2026, Version 1.46) Wunsch: **Bilder immer hinter den Zeichnungen**; Bilder wie Schrift per **Rechtsklick
    zwischen den Ebenen (Hintergrund/Vordergrund) verschieben**. Umgesetzt: Abschnitt „Zeichnen“ → Ebenen (1.46).
57. (November 2026, Version 1.47) Wunsch: Objekte im Hintergrund (Schrift, Zeichnungen, Bilder) bleiben **auswählbar**
    (und abwählbar) – nach „als Hintergrund“ sind sie **sofort nicht mehr verschiebbar**, aber weiter markiert.
    Umgesetzt: Abschnitt „Hintergrund“ (Nachtrag 1.47).
58. (November 2026, Version 1.48) Wunsch: im Rechtsklick-Menü getrennt **Bild als Hintergrund**, **Zeichnung als
    Hintergrund** und **Text als Hintergrund**, damit man genauer wählt, was in den Hintergrund kommt. Umgesetzt:
    Abschnitt „Hintergrund“ (Nachtrag 1.48).
59. (November 2026, Version 1.49) Wünsche: Tauschen im **Abschnittsbereich** einfacher (grössere Trefferflächen,
    Toleranz); **Darkmode lesbarer** – Schwarz wird ein Grau, lesbar auf dunklem Hintergrund UND auf weissen Bildern
    (importierte PDF-Seiten); fester **Knopf rechts in der Registerzeile**, auf allen Registern, **Stift ↔ Auswählen**;
    **Chem-Draw 3D realistisch** (Cyclohexan als Sessel); **mehr chemische Regeln** und **Lewis bearbeitbar**
    (an C gebundene H als interaktive Elemente); **Tabs lösen** und frei anordnen wie Fenster auf dem Desktop,
    **beliebig viele**, **auch im Vollbild frei verschiebbar**. Umgesetzt: Abschnitt 3 (Nachträge 1.49), Fallstricke 123–126.
60. (November 2026, Version 1.50) Wünsche: gelöste Fenster wieder **eingliedern** und frei anordnen, z. B. als
    **geteilter Bildschirm horizontal/vertikal**; den **Stift-Knopf grösser** machen. Umgesetzt: Abschnitt „Tabs und
    geteilte Bereiche“ (Nachtrag 1.50), Fallstrick 127.
61. (November 2026, Version 1.51) Wünsche: die **Textmarker-Farbe** wird im dunklen Design nicht angezeigt (auf weissen
    PDF-Seiten unsichtbar); bei einer Auswahl aus verschiedenen Stiftarten soll ein Klick auf einen Stift **nur die
    Striche dieser Stiftart** umfärben (z. B. Schrift + Markierungen ausgewählt, Kugelschreiber geklickt → nur die
    Schrift; ebenso Textmarker). Umgesetzt: Abschnitt „Dunkles Design“ und „Zeichnen“ (Nachträge 1.51), Fallstrick 128.
62. (November 2026, Version 1.52) Wünsche: **Chem-Draw ausbauen** mit **MolView** und **ChemDraw** als Vorbild, Webseiten
    wie das **NIST WebBook** als Anregung, als **Quelle** aber (wenn überhaupt) die **GESTIS-Stoffdatenbank**;
    **Fotomath** soll **schlechtere/unleserliche Handschrift** besser erkennen und weitere Funktionen bekommen, mit
    **Derive** und **Photomath** als Vorbild. Umgesetzt: Abschnitte „Fotomath“ und „Chem-Draw → Analyse & Spektren“
    (Nachträge 1.52), Fallstricke 129–134. GESTIS: laut IFA ist Verlinken erwünscht (Startseite oder Stoffblatt über
    die ZVG-Nummer), Daten werden nicht übernommen – Chem-Draw verlinkt deshalb nur.
63. (November 2026, Version 1.53) Chem-Draw: Spektren unter „Analyse & Spektren“ **zoomen** (IR/MS/NMR genauer
    ansehen); **GESTIS zum jeweiligen Molekül verlinken**; beim **Entfernen eines H** (z. B. in Lewis) eine **Ladung**
    setzen – spätestens beim Wechsel nach Keil/Strich, sonst geht die Information verloren; bei den Spektren **ein
    Reiter „NMR“ mit Auswahlfeld** (H, C, F, P …; Standard ¹H, Auswahl bleibt beim erneuten Öffnen, gut sichtbar gross);
    Spektren als **Bild exportierbar**; Datenbank um **Aminosäuren(-Derivate), Oligonukleotide und Derivate,
    Carbodiimide und ihre Harnstoffe, TFA/DCA, Oxyma, HOBt, DMAP** u. a. erweitern. Umgesetzt: Abschnitt
    „Chem-Draw → Analyse & Spektren“ (Nachtrag 1.53), Fallstricke 135–138.
64. (November 2026, Version 1.54) Tabelle: **Zeilen/Spalten wie in Excel auswählen und verschieben**; steht in einer
    Zelle „=“ und man klickt eine andere Zelle an, soll die **Formel auf dieses Feld zeigen** (wie Excel). Umgesetzt:
    Abschnitt „Tabellen wie Excel“ (Nachtrag 1.54), Fallstricke 139–140.
65. (November 2026, Version 1.54) Chem-Draw: **mehrere Moleküle** zeichnen wie in ChemDraw, **Name und Infos nur für
    das ausgewählte Molekül** (Orientierung an OneNote/ChemDraw); **ganze Reaktionsmechanismen stufenweise** zeichnen
    (Laborplanung) mit **Reaktionspfeilen und Symbolen auch unter „Zeichnen“** (Chem-Draw wie in OneNote);
    **Moleküle kopieren und einfügen**; NMR mit **Regel 1. Ordnung**, chemisch gleichen und einzigartigen Signalen,
    **hoher Auflösung**, chemischer Verschiebung und **Dacheffekt**; **IR-Fingerprint und MS verbessern**. Umgesetzt:
    Abschnitt „Chem-Draw → Analyse & Spektren“ (Nachträge 1.54: Reaktionen/mehrere Moleküle, Spektren), Fallstricke 141–145.
66. (November 2026, Version 1.55) Spektren: beim NMR die **grüne Integral-Linie standardmässig ausblenden**; die
    **Beschriftung der H-Signale** überschnitt sich stark – neu ordnen; **Striche von der Beschriftung zum Peak**
    (Standard an, umschaltbar); beim MS die **Fragmente als Moleküle darstellen**, um Abbruchfolgen zu vergleichen;
    **IR, NMR und MS überarbeiten – effizienter, präziser, realitätsnäher**, mit allen auffindbaren Quellen (auch
    Internet); Bedienung einfach und übersichtlich halten; **Trivialnamen-/Molekül-Datenbank erweitern**. Umgesetzt:
    Abschnitt „Chem-Draw → Analyse & Spektren“ (Nachtrag 1.55), Fallstricke 146–151.
67. (November 2026, Version 1.56) Chem-Draw: Kern-Auswahl nur im Reiter NMR; MS-Fragmente per **Auswahlfeld mit Namen**,
    Klick zeichnet das Ion **mit Ladungen** in Chem-Draw; Moleküle **gruppierbar** und übereinanderlegbar, ohne dass sie
    sich nicht mehr trennen lassen; **„Reaxys“-artige Syntheseplanung**: Zielmolekül zeichnen → Synthesevorschläge mit
    Bedingungen für den Labormassstab (bis 10 mol), **keine extremen Bedingungen/Katalysatoren empfehlen** (aber
    vorschlagen); **Edukt → Pfeil → Produkt** ergibt einen Syntheseweg, dessen Stufen man ändern kann (Edukte,
    Bedingungen); modular und übersichtlich, Vorschlag Umschalter **Zeichnen/Planen**; bisherige Bedienung möglichst
    wenig ändern; zuerst Konzept, in kleinen Paketen bauen, am Ende prüfen. Umgesetzt: Abschnitt „Chem-Draw → Planen
    (Syntheseplanung)“, Konzept `docs/konzept-1.56-syntheseplanung.md`, Fallstricke 152–157. Reaxys selbst ist eine
    Bezahl-Datenbank ohne freie Schnittstelle – eingebaut ist ein eigenes Regelwerk (offline) plus Knopf „In Reaxys
    suchen“ (öffnet Reaxys, SMILES in der Zwischenablage).
68. (November 2026, Version 1.57) Planer: einfachere, weniger giftige Wege bevorzugen (Toxikologie/Ökologie – z. B.
    Fischer-Veresterung statt Carbodiimid-Kupplung); Chem-Draw-Fenster **in der Grösse verstellbar**, als **geteilter
    Bildschirm** neben der Seite; bei geteilten Tabs soll **der erste Klick im anderen Bereich direkt wirken**.
    Umgesetzt: Abschnitte „Chem-Draw → Planen“ (Nachtrag 1.57), „Chem-Draw-Fenster“ und „Tabs und geteilte Bereiche“
    (Nachtrag 1.57), Fallstricke 158–160. Gewünscht war auch, Regelwerk und Suchtiefe des Planers stark auszubauen
    (mehr Stufen, viele weitere Reaktionen) – das wurde **nicht** umgesetzt; der Planer bleibt beim Umfang von 1.56.
69. (November 2026, Version 1.58) Chem-Draw: **Werkzeugleiste links und Seitenleiste rechts in der Breite
    verstellbar und zuklappbar**; Fenster **dynamisch für alle Bildschirmgrössen** (auch Handy); Datenbank soll
    **Abkömmlinge erkennen**. Umgesetzt: Abschnitt „Chem-Draw-Fenster“ (Nachtrag 1.58), Datenbank-Abkömmlinge,
    Fallstricke 161–163. Wieder gewünscht: Planer mit bis zu 10 Stufen und Organikum-Standardreaktionen – **nicht**
    umgesetzt (Planer unverändert wie 1.56/1.57).
70. (November 2026, ab Version 1.59) **Office-Kompatibilität und geteilte Ansicht** – Konzept
    `docs/konzept-1.59-office.md` (vom User freigegeben): (1) geteilte Ansicht – im inaktiven Bereich direkt arbeiten
    (Rad, Zoom, Fläche ziehen ohne Klick; erster Klick wirkt; Tastatur an den zuletzt angeklickten Bereich; Menüband
    des aktiven Bereichs; aktiver Bereich dezent markiert); (2) Seitentypen Freiform/Dokument/Tabelle/Folie mit
    verlustfreiem Office-Round-Trip (Original-Paket behalten, nur Geändertes neu schreiben, Unbekanntes als gesperrter
    Platzhalter); (3) Abschnittstyp „Präsentation“ mit Folien, Register „Präsentation“, Vorführmodus, .pptx-Export.
    Zusätze des Users: die bisherigen **Rechentabellen und Diagramme bleiben** als eigene Funktionen; Office-Dateien
    **wie in Obsidian** als Datei im Notizbuch (verlustfrei, unabhängig von Office); Import/Export je Seite **als
    Office-Datei und als KnowledgeTree-Seite**; **OneNote-Kompatibilität bleibt**; Bilder/Videos **verlustfrei so klein
    wie möglich**, ohne Ladezeiten. Reihenfolge: 1.59 geteilte Ansicht (+ Bilder), 1.60 OOXML-Modul + Seitentypen,
    1.61–1.62 PowerPoint, 1.63 Word, 1.64 Excel.
    **Stand 1.60:** Office-Dateien als Seiten (Word/Excel/PowerPoint, auch Vorlagen und Makro-Dateien) – Original
    byte-gleich im Notizbuch, gesperrte Vorschau, Export „Office-Datei“ byte-gleich; Bearbeiten der Datei selbst folgt
    je Format (1.61–1.64). Videos: verlustfrei neu packen ist im Browser nicht möglich (nur Doppeltes einmal speichern).
71. (November 2026, Versionen 1.61–1.64, mit drei echten Office-Dateien „Hello World“ des Users zum Testen)
    **„Fahre mit den nächsten Schritten fort“**: 1.60-Rest (Seitentyp beim Erstellen, Darstellung je Typ,
    Export-Weiche), 1.61–1.62 PowerPoint (Import, Folien bearbeiten, Register „Präsentation“, Vorführmodus, Export),
    1.63 Word, 1.64 Excel. **Stand 1.64:** alles umgesetzt, Office-Seiten sind bearbeitbar und werden verlustfrei
    zurückgeschrieben (nur Geändertes). Bewusste Abweichung vom Konzept: Folien bleiben auf **einer Seite** (eine
    Seite = eine Datei, wie Import/Export je Seite und OneNote es verlangen) statt eines Abschnittstyps „Präsentation“ –
    Folienliste/Reihenfolge über das Register „Präsentation“. Grenzen siehe Abschnitt „Office-Seiten bearbeiten“.
72. (November 2026, Version 1.65) **„Die Grundidee ist, dass man Pages als Ganzes als Datei formatiert, so dass eine
    ganze Page einem Excel-File entspricht, dasselbe mit Word- und PowerPoint-File.“** Rechtsklick auf den Reiter =
    Seite erstellen, draufklicken = Seite erstellen, **länger darüber halten = Auswahl „Word“, „Excel“, „PowerPoint“**.
    Menüband: auf einer solchen Seite (auch in einem Tab) **Register mit den relevanten Optionen, voll am Original
    orientiert (Funktionen und Layout)**, einfach und übersichtlich. Umgesetzt: Abschnitt „Office-Seiten wie die
    Programme (1.65)“. „Reiter“ = das **+ der Tableiste** und der **Neue-Seite-Knopf** im Kopf der Seitenliste
    (die farbigen Abschnittsregister über der Seite sind seit 1.4 ausgeschaltet); zusätzlich Abschnitts-Rechtsklick
    und Datei → Neu.
73. (November 2026, Version 1.66) **„Füge bei den Registern noch weitere programmbezogene Funktionen hinzu, z.B. bei
    PowerPoint die Animationen und Übergänge. Überarbeite diese Pages so, dass sie vom Auge kaum einen Unterschied zur
    Bedienung zu den genannten Programmen aufweisen und dessen in nichts nachstehen. Baue das Excel-Tool so, dass auch
    später die Möglichkeit bestehen kann, Makros und Plugins hinzuzufügen. Auch, dass man im Generellen eigene
    Schriftarten und Sprachen (Wörterbücher zur Rechtschreibung) hinzufügen könnte (wenn möglich auch eine Form von
    Grammatik-‚Korrektur‘, welche einfach Fehler hervorhebt). Überarbeite nochmals die Formatierung der Seiten und die
    Registerkarten.“** (ein einzelnes „Q“ in der Nachricht = Tippfehler.) Umgesetzt: Abschnitt „Office-Seiten 1.66“.
    Makros sind **JavaScript** in der Arbeitsmappe (VBA in .xlsm bleibt erhalten, läuft aber nicht); Add-Ins sind
    JavaScript-Dateien mit allen Rechten – das sagt die Oberfläche auch so.
74. (November 2026, Version 1.67) **„Überarbeite bitte die Excel-, Word- und PowerPoint-Pages nochmals.“** Word: **beim
    Klicken auf das Blatt direkt zum nächsten schreibbaren Punkt springen wie bei Word**; weitere Funktionen, „allein
    zum Designen der Seiten und Visualisieren der verwendeten Zeichen, oder das Seiten-Lineal / Wörter- und
    Zeichenangabe“. Excel: **„auch unendlich, wie bei Excel“**, weitere Funktionen; **ein hinzugefügtes Textfeld darf
    die Tabelle nicht ersetzen, und man darf sie nicht löschen können – sie ist bei diesem Seitentyp fixiert und kann
    höchstens formatiert und verändert werden.** PowerPoint: weitere Funktionen, „vor allem wenn es um das Gestalten von
    Folien geht und das Einfügen von Textfeldern“; **Ansicht änderbar: „Standard“** (wie bisher, gut zum Lernen und
    parallel Notizen, viel Platz zwischen den Folien zum Designen, **Animationsliste mit Reihenfolge und Trigger wie bei
    PowerPoint**) und der andere Modus „wie bisher, Bereich pro Folie nur die Folie“; beide dürfen sich nicht in die
    Quere kommen; **Notizen links der jeweiligen Folie**, nicht unten fixiert. Rückfragen: Notizen in „Normal“ = Spalte
    links neben der Folie; Ansicht **je Seite gespeichert**, Standard = Lernansicht. Umgesetzt: Abschnitt
    „Office-Seiten 1.67“.
75. (November 2026, Version 1.68) **„Überprüfe die neuen Office-Pages nochmals“** – die Formelleiste der Tabellen-Seite
    blieb nach dem Verlassen der Seite stehen → **seitengebunden**. In den Tabs dynamisch kompatibel; Textfenster bzw.
    bei der Präsentation **Notiz- und Animationsliste in der Grösse verstellbar**; **voll dynamisch**, kompatibel mit
    **sämtlichen Seitenverhältnissen**; **Handy-Kompatibilität** prüfen und umsetzen; das **ganze Menüband** prüfen, vor
    allem die neuen Register; den **Bildlaufbalken des Menübands etwas nach unten** (überschnitt die Schrift); Layout
    gegebenenfalls anpassen. Umgesetzt: Abschnitt „Office-Seiten 1.68“.
76. (November 2026, Version 1.69) **„Vollständige Plugin- und Addon-Kompatibilität, ChemDraw als Addon umbauen und
    standardmässig hardcode einbauen, so dass man via einem Häkchen im Register das Addon aktivieren kann. Addons
    bekommen einen eigenen Ordner bei der EXE und dazu gibt es ein Template-File, welches standardmässig immer in dem
    Ordner vorhanden ist und einen Kontext enthält, den man einer AI geben kann, damit diese dann immer ein kompatibles
    Addon erschaffen kann.“** Umgesetzt: Abschnitt „Add-Ins 1.69“ (Schnittstelle 2, Register „Add-Ins“ mit Häkchen,
    Chem-Draw als eingebautes Add-In, Ordner `Add-Ins` mit `Add-In-Vorlage_KI-Kontext.md`).
77. (November 2026, Version 1.70) **„Mache es so, dass die Add-ins alle links aufgelistet werden können, dass sich das
    Layout automatisch erweitert, wenn der Platz an Add-ins zu klein wird, also nach 4 Add-ins eine zweite Reihe auf der
    rechten Seite erstellt. Dazu ist das Layout nicht übereinstimmend mit der Schrift. Überarbeite die komplette
    Add-in-Funktion (was hat es mit dem .md- und .js-File an sich, warum sind dies zwei Dateien? Wäre es nicht möglich,
    beide in einer Datei zusammenzufassen und dann dies einfach in den Dateien im Kontext zu erläutern, dass es in
    Realität anders wäre.) (Evtl. auch ein Info-Button auf der Add-in-Seite, der einem sagt, wie man Add-ins
    erstellt.)“** Umgesetzt: Abschnitt „Add-Ins 1.70“ (Häkchen-Raster 4 je Spalte, EINE Vorlage `_Add-In-Vorlage_KI.js`,
    Anleitung, Verwalten neu, Knopftexte ohne Umbruch).
78. (November 2026, Version 1.71) **„Bau mir bitte das Excel nochmals um. Ich kann keine .csv-Dateien importieren, nur
    Excel-Dateien. Ich möchte alle Arten davon importieren können (dasselbe für PowerPoint und Word). Mache ein Dropdown,
    wo man den Dateityp dann auswählen kann, lasse aber standardmässig die aktuellste Version als Preset. Bei Excel
    verzieht sich das Layout und die Zellen, wenn man hineinzoomt. Dazu werden farbige Zellen oder
    Schriftformatierungen nicht übernommen. Überarbeite dies und behebe allerlei Probleme, nutze das Web und diese Datei
    zum Testen dafür.“** (Datei: „34_OLED-Monitore_digitec – Ranking.xlsx“ – nur zum Testen, nicht im Repository.)
    Umgesetzt: Abschnitt „Excel und Dateiformate 1.71“.
79. (November 2026, Version 1.72) **„Bitte überprüfe im Detail die Office-‚Importe‘, dass Word, PowerPoint wie auch
    Excel über alle Funktionen verfügen wie das Inspirationsprogramm (alles ausser die KI- und Cloud-Features).
    Überdenke es und füge die Funktionen hinzu, und überarbeite die alten. Dazu bitte den Import und Export dieser
    Dateien einfacher, übersichtlicher und auch die Möglichkeit, verschiedene Dateitypen auszuwählen, einbauen (als
    Dropdown beim Export).“** Umgesetzt: Abschnitt „Office wie die Programme 1.72“ (Abgleich aller Register mit
    Word/Excel/PowerPoint, die wichtigsten fehlenden Funktionen mit Rückschreiben in die Datei; Öffnen/Speichern/
    Exportieren mit Dateityp-Listen). Was bewusst fehlt: „Bekannte Grenzen → Office 1.72“.
80. (November 2026, Version 1.73) **„Bitte verinnerliche dieses Konzept bezüglich der Office-Programme und überdenke
    und/oder überarbeite die bisherige Implementation, falls diese verbessert werden könnte und übersichtlicher und
    einfacher gestaltet werden kann, aber gleichzeitig mehr oder gleich viele Funktionen bietet.“** Mit dem PDF
    „Microsoft Office – Word, Excel, OneNote, PowerPoint: Funktionen & Struktur“ (vom User, 24.11.2026): gemeinsame
    Oberfläche (Menüband → Gruppen → Befehle, Kontextregister, Backstage mit Informationen/Schützen/Prüfen,
    Schnellzugriff, Statusleiste mit Ansichten, Designs für alle drei), Hierarchie je Programm, Ansichten. Umgesetzt:
    Abschnitt „Office-Konzept 1.73“.
81. (November 2026, Version 1.74) **„Import von Word-Inhaltsverzeichnissen funktioniert nicht. Inhaltsverzeichnis mit
    Verknüpfungen. Import von Bildern auch nicht, die Bilder sind gedreht, zu gross oder zu klein. Falsch formatiert und
    verschieben sämtliche Seiten. Auch die Textfelder werden nicht korrekt übernommen. Als Webseite HTML exportieren hat
    dasselbe Problem. Möglichkeit, mehrere Pages anzeigen zu lassen, wie bei Word selbst – baue mehr oder weniger einen
    eigenen „PDF“-Reader daraus.“** Umgesetzt: Abschnitt „Word-Import wie Word und Seitenansicht 1.74“.
82. (November 2026, Version 1.75) **„Baue alles ein, was noch fehlt. Untersuche auch die anderen Programme auf
    Funktionen und füge diese hinzu (auch die Suchleiste oben bei den ‚Programmen‘, auch bei OneNote hinzufügen, um nach
    Einstellungen zu suchen).“** Umgesetzt: Abschnitt „Suche oben und Office-Objekte 1.75“ (Suche wie in Office für
    alle Programme und KnowledgeTree selbst; Diagramme, Gruppen, SmartArt, Fuss-/Endnoten, Bilder in Tabellen und
    Kopfzeilen in Word; Diagramme/SmartArt/Bildzuschnitt in PowerPoint; Bilder/Diagramme/Formen in Excel).
83. (November 2026, Version 1.76) **„Ich möchte wieder hellere Trennlinien zwischen den Abschnitten und den Pages, wie bei
    den ganz alten Versionen.“** (Ein erster Versuch 1.76 mit breiteren Spalten/grösserer Schrift wurde auf Wunsch
    verworfen – Layout bleibt wie 1.75.) Umgesetzt: Trennlinien zwischen Notizbücher-Spalte, Seitenliste und Fläche in
    `--line-2` (heller als `--line`), auch zwischen Abschnitten und Seiten, wenn die Seitenliste links steht.

Punkte 1–12 sind umgesetzt. Von Punkt 13 ist die **erste Etappe fertig (Version 1.2)**:
Notizbücher/Abschnittsgruppen/Abschnitte/Schnellnotizen, Unterseiten, Seitenversionen,
Navigation, Seitenfarbe/Linien, Zeichnen mit Stiften, Formen, Lineal, Winkelmesser,
Formerkennung, Freihand → Form/Text (die Wiedergabe gab es bis 1.26). Die ChemDraw-Funktion (8.5) ist seit 1.6
da. **Noch offen** (spätere Etappen, erst nach Rückfrage beim User): u.a. Tags/Markierungen,
Links zwischen Seiten, Tabellen-Werkzeuge, Texterkennung in Bildern, Audio/Sprache.

---

## 2. Die zwei Versionen

| | **Desktop (Windows)** | **Webseite / GitHub Pages** |
|---|---|---|
| Datei | `KnowledgeTree.exe` im Ordner `KnowledgeTree\` | eine einzige `index.html` |
| Oberfläche | identisch | identisch |
| Fenster | eigenes Fenster über Microsoft WebView2 | der Browser-Tab |
| Speicher | Ordner `Saves\` und `Cache\` neben der EXE | im Browser (IndexedDB) |
| Sicherung | Backup-Ordner wie bei OneNote (Ordner je Notizbuch, Datei je Abschnitt) in `Cache\Backups`, automatisch nach den Einstellungen; Papierkorb als Ordner (nach 60 Tagen geleert) | derselbe Backup-Ordner im Sicherungsordner (Chrome/Edge) oder als ZIP-Download, Erinnerung nach den Einstellungen; Papierkorb-Dialog |
| Dateiformat Backup/Export | **gleich**: KnowledgeTree-Datei = ZIP im Format des Saves-Ordners (seit 1.24), interaktiv als .html oder als .json (seit 1.25) | **gleich** |
| Datei-Fenster (seit 1.34 wie OneNote) | Backup erstellen/laden, Exportieren/Importieren, Optionen, Ordner öffnen, Beenden | Backup erstellen/laden, Exportieren/Importieren, Optionen, Papierkorb |
| Neue Seite | Strg+N (und Alt+N) | **Alt+N** (Strg+N gehört dem Browser) |
| Seitenversionen | – (noch nicht) | ja (IndexedDB-Bereich `versionen`) |
| Exportieren (Dialog mit Auswahl) | ja, alle vier Formate | ja, alle vier Formate |
| OneNote-Import | ja | ja |
| Was der User hat | `KnowledgeTree.zip` (Stand 1.0) | `index.html` (Stand 1.10), `KnowledgeTree-Quellcode.zip` (Stand 1.10) |

**Versionsstand:** Seit 1.23 wird die EXE hier mitgebaut (Go-Module über `GOPROXY=direct` und einen
GitHub-Spiegel für `golang.org/x/sys`, siehe „Bauen und Testen“) und zusammen mit index.html ausgeliefert –
Client-Code und Version sind für beide gleich (1.25).

---

## 3. Bedienung (das Verhalten, das der Code umsetzt)

### Struktur wie OneNote (seit 1.2)
- **Notizbuch** (oberste Ebene, Buch-Symbol) → **Abschnittsgruppen** (Ordner, beliebig tief)
  → **Abschnitte** (farbiges Quadrat) → **Seiten**. Nur Abschnitte enthalten Seiten.
- **Schnellnotizen**: ein fester Abschnitt ganz oben in der Liste (Alt+Umschalt+N).
- **Layout wie zu Beginn (seit 1.4, Wunsch des Users):** ganz links der **Baum** mit allen
  Notizbüchern, Abschnittsgruppen und Abschnitten, **jeder Knoten einzeln einklappbar** (Abschnittsgruppen seit
  1.27 auch mit einfachem Klick auf den Namen; Doppelklick = umbenennen, das Klappen des ersten Klicks wird dabei
  zurückgenommen)
  (Rechtsklick auf leere Baumfläche → „Alle ein-/ausklappen“, der Weg zum aktuellen Abschnitt
  bleibt offen); **direkt daneben die Seitenliste**; **keine Register über der Seite**
  (`Store.ui.showTabs = false`, CSS `#section-tabs.show` nur, wenn eingeschaltet). „+“ über dem
  Baum = Menü Abschnitt/Abschnittsgruppe/Notizbuch. Seitenliste rechts ist weiterhin
  umschaltbar (Ansicht → Seiten rechts). Ältere Zustände werden beim Start einmalig über
  `Store.ui.layoutV = 2` umgestellt.
- **Spalten einklappen (seit 1.5):** Knopf « im Kopf der Notizbuch- bzw. Seitenspalte (oder
  Ansicht → „Notizbücher/Seitenliste eingeklappt“) → die Spalte wird zu einem 28 px breiten
  Streifen mit senkrechter Beschriftung („Seiten · Abschnittsname“); Klick auf den Streifen
  klappt sie wieder auf. Zustand in `Store.ui.navFold = {groups, pages}`.
  **Seit 1.6 auch per Doppelklick** auf den Kopf, den Streifen oder die freie Fläche der
  Spalte (nicht auf Zeilen – dort bleibt Doppelklick = umbenennen). Ein Doppelklick auf den
  Streifen klappt nur auf: der erste Klick öffnet schon, darum merkt sich `Sidebar` beim
  ersten `mousedown` (`_downStrip`), ob er auf dem Streifen war, und ignoriert dann das
  `dblclick`.
- **Unten in der Notizbuch-Spalte (seit 1.6):** Leiste „Abschnitt“ / „Gruppe“
  (`#nav-groups-foot`) – legt im aktuellen Notizbuch bzw. der aktuellen Abschnittsgruppe
  (`Ops.currentContainer()`) einen Abschnitt bzw. eine Abschnittsgruppe an. Rechtsklick auf
  die freie Fläche des Baums bietet dasselbe (mit dem Namen des Ziels als Überschrift) plus
  Neues Notizbuch, Öffnen, Alle aus-/einklappen.
- Der Seitenrahmen hat oben die Farbe des Abschnitts.
- Notizbücher lassen sich **schliessen** (ausblenden, bleiben gespeichert) und über
  Datei → Notizbuch → Öffnen wieder anzeigen; **exportieren** über den Export-Dialog
  (siehe „Exportieren“).
- Alte Daten (1.1, nur „Gruppen“) werden beim ersten Start automatisch übernommen:
  oberste Gruppen → Notizbücher, Untergruppen → Abschnitte bzw. Abschnittsgruppen, Seiten
  direkt in einem Container → neuer Abschnitt „Allgemein“. Der alte Rückgängig-Verlauf wird
  dabei verworfen (passt nicht zur neuen Struktur).

### Seiten (seit 1.2)
- **Unterseiten** über `page.level` (0–2): Seite in der Liste nach rechts ziehen,
  Strg+Alt+] / Strg+Alt+[ (ein-/ausrücken), Strg+Alt+N (neue Unterseite). Eine Seite mit
  Unterseiten hat einen Pfeil zum Ein-/Ausklappen; beim Verschieben wandern Unterseiten mit.
- **Mehrfachauswahl** in der Seitenliste (Strg/Umschalt + Klick) → ziehen, löschen,
  „Verschieben nach …“ (Dialog mit allen Abschnitten), ein-/ausrücken.
- **Sortieren** nach Erstelldatum, Änderungsdatum oder Titel (Unterseiten bleiben bei ihrer
  Hauptseite).
- **Datum der Seite ändern:** Klick auf das Datum unter dem Titel.
- **Seitenversionen** (nur Webseite): beim Speichern wird höchstens alle 10 Minuten der
  vorherige Stand einer Seite als Version abgelegt (max. 50 pro Seite). Rechtsklick auf
  Seite → „Seitenversionen …“ zeigt sie schreibgeschützt (gelbe Leiste oben, Fläche mit
  Streifen-Glas); „Wiederherstellen“ (rückgängig machbar) oder „Als Kopie“.
- **Zurück/Vor** (Alt+← / Alt+→, Pfeile in der Titelleiste), **Zuletzt verwendet**
  (Uhr-Symbol, 15 Seiten), **Vollbild** (F11; seit 1.28 klappt das Menüband herunter, wenn die Maus an den oberen
  Rand geht, und verschwindet wieder, wenn sie sich mehr als 30 px davon entfernt – nicht, solange ein Menü daraus
  offen ist oder ein Feld darin den Fokus hat; `App.initFsPeek`, Klasse `fs-peek`).
- **Seitenfarbe** (Pastelltöne; im dunklen Design abgedunkelt) und **Linien**: Punkte,
  Karos klein/mittel/gross, Linien schmal/mittel/weit, keine.

### Importieren: ein Knopf für alles (seit 1.17)
- Datei → **Importieren** (`importAuto` → `OneImport.pick()` → `OneImport.auto(liste, {pt, box})`). Der Pfeil
  unten am Knopf öffnet „Dateien wählen …“ / **„Ordner wählen …“** (Browser brauchen für Ordner einen eigenen
  Dialog). Hineinziehen auf die Fläche oder das übrige Fenster läuft über denselben Weg (`Canvas.onDrop`,
  Dokument-`drop` in main.js; Ordner über `readDropDirs`).
- `OneImport.kindOf(datei, pfad)` entscheidet nach der **Signatur**, nicht nur der Endung: OneNote-Kopf-GUID
  (`ON.FT_ONE`/`FT_TOC`) → Abschnitt/Inhaltsverzeichnis, `MSCF` → .onepkg, `Rar!`/7z → Archiv, `PK` → ZIP-Archiv,
  **ausser** Office/OpenDocument (Endung .docx/.xlsx/.pptx/… oder `[Content_Types].xml`/`mimetype` im ZIP) →
  Datei; `…_onefiles/` oder .onebin → Begleitdatei; JSON mit `"typ":"KnowledgeTree-Backup|Seite"` → Sicherung;
  Bild / CSV / sonst.
- Ablauf in `auto()`: Dateien mit Ordnerpfad → je oberstem Ordner ein Notizbuch (nur OneNote-/KT-Dateien, Fotos
  usw. im Ordner werden übersprungen); Archive entpacken (`addEntrySet`); .onepkg → Notizbuch; lose .one →
  Abschnitte (mit allen mitgewählten Dateien als Begleitdateien für `<file>`-Verweise). Alles zusammen ergibt
  **einen Plan, eine Rückfrage, einen Bericht**: gefragt wird nur, wohin **lose Abschnitte** kommen;
  Notizbücher (aus .onepkg, Archiv, Ordner) werden ohne Rückfrage neu angelegt (Strg+Z macht alles rückgängig).
- **KnowledgeTree-Dateien und Backups** werden seit 1.24 **direkt importiert** (als zusätzliche Notizbücher, neue
  IDs): ZIP mit Saves-Struktur (`KtFile.isKtZip`: `_struktur.json`, `KnowledgeTree.json` oder `.seite.json` darin),
  JSON bis 1.23 (`"typ":"KnowledgeTree-Backup"`) und ein gewählter **Saves- oder Notizbuch-Ordner** des Windows-
  Programms (samt `_Bilder/`). Bis 1.23 kam hier nur ein Hinweis auf „Backup laden“/„KT-Datei laden“ – deshalb
  liess sich der Browser-Export in der EXE nicht „importieren“. KT-Dateien **in** einem ZIP/RAR werden wie bisher
  als zusätzliches Notizbuch übernommen. Ersetzen geht nur über „Backup laden“.
- **Nichts Importierbares dabei** (Bilder, PDF, Word/Excel, CSV …): kommt auf die aktuelle Seite wie beim
  Hineinziehen (`Canvas.insertFiles`: Bild, Tabelle aus CSV, sonst 📎-Anhang – in die Mitte der Ansicht bzw. an
  die Stelle, wo losgelassen wurde). Zusammen mit OneNote-Dateien gewählt, dienen solche Dateien nur als
  Begleitdateien und landen nicht auf der Seite.
- Die früheren Befehle `oneImport`, `importArchive`, `importFolder` bleiben (führen alle über `auto()`);
  `fromFiles`/`fromArchives`/`fromFolder` ebenso (Tests, ältere Aufrufer).

### Start: Laden in Stufen (seit 1.31, Webseite und Programm; 1.32 schneller)
1. **Design vor dem ersten Bild:** ein kleines Skript direkt nach `<body>` setzt das zuletzt benutzte Design aus
   `localStorage['kt-theme']` (geschrieben von `App.applyTheme`) – kein heller Blitz im Dunkelmodus.
   **Früher Stand (1.32):** `App.earlyUi` setzt Design, Register des Menübands, Breiten, Stifte aus
   `localStorage['kt-ui']` (geschrieben bei jedem Speichern des Zustands, `App.rememberUi`) – das Menüband ist bedienbar,
   bevor der Speicher antwortet; danach gilt der gespeicherte Zustand (neu gezeichnet nur, was sich unterscheidet).
2. **Einstellungen und Baum:** `Backend.load({ stufen: true })` liefert Baum, `zustand` (Einstellungen), die Kennungen
   aller Seiten und ihre **Kopfangaben** (`{t, l, c, m}` = Titel, Ebene, erstellt, geändert; seit 1.32), aber
   **keine Inhalte** und (seit 1.32) **keinen Verlauf** – der kommt nach dem ersten Bild (`Backend.loadVerlauf`,
   `Hist.load(v, true)` stellt die alten Schritte vor die neuen; bis dahin wird der Verlauf nicht gespeichert).
   Notizbücher, Abschnitte und **alle Seitenlisten stehen sofort** (`Store.meta(id)` = Seite oder Kopfangaben).
   Kopfangaben: Browser im Bereich `cache` unter `meta:<id>` (bei jedem Speichern mitgeschrieben, beim Löschen
   entfernt, fehlende/veraltete nach dem vollständigen Laden nachgetragen – `Backend.writeHeads`); Programm: beim
   Einlesen nur der Kopf jeder Datei (`readPageHead`).
3. **Nur die offene Seite** wird vor der Anzeige geladen (seit 1.32; vorher ihr ganzer Abschnitt), danach ihr
   Abschnitt, das Notizbuch, der Rest.
4. **Der Rest im Hintergrund** (`Lazy.loop`): aktuelles Notizbuch zuerst, dann die übrigen in Baumreihenfolge, in
   kleinen Stücken (Stückgrösse passt sich an, ~12 ms je Stück), dazwischen bleibt alles bedienbar.
5. **Vorziehen:** wählt man einen Abschnitt oder eine Seite, die noch fehlt, kommt sie als nächstes (`App.openPage`
   wartet nur auf diese Seite, `Lazy.prefer` holt danach ihren Abschnitt). Fehlen Kopfangaben (Daten von vor 1.32,
   nur beim ersten Start), zeigt die Seitenliste „Seiten werden geladen …“ und ergänzt sich. Einrücken, Sortieren,
   Verschieben und Umbenennen von Seiten, deren Abschnitt noch lädt, laden ihn zuerst (`Lazy.ready/need`).
6. **Was alle Seiten braucht, wartet kurz** (`Store.gate`, Hinweis „Notizbücher werden noch geladen …“ nach 250 ms):
   Suchen/Ersetzen, Exportieren, Drucken, Einstellungen, Importieren, Rückgängig/Wiederholen, Kontextmenüs,
   Abschnitt löschen, Notizbuch exportieren/schliessen, Backup, Seiten verschieben, Link einfügen, Aufräumen,
   automatisches Backup. Bearbeiten der offenen Seite und Navigieren gehen sofort.
- Gemessen (Sicherung „AM (Mathe)“, 234 Seiten, Browser): Einstellungen nach ~0,19 s, Seite und Navigation nach
  ~0,35 s (vorher ~0,8 s mit einem Hänger von ~0,45 s), alles geladen nach ~0,9 s, keine Aufgabe über 65 ms.
  Programm (EXE, gleiche Daten): bedienbar nach ~1 s, alles nach ~2 s (1.31). **1.32** mit 4 Notizbüchern,
  138 Abschnitten, 2483 Seiten (~120 MB), offen ein Abschnitt mit 500 Seiten: Einstellungen/Register nach ~0,16 s,
  Seite und alle 500 Einträge nach ~0,30 s (1.31: ~0,55 s, weil 400 Seiten vorab geladen wurden), alles nach ~2,5 s,
  dazwischen bedienbar. Programm (AM Mathe): bedienbar nach ~0,25 s (1.31: ~1 s), alles nach ~1,2 s.
- Seitenliste als ein HTML-Text aufgebaut (500 Einträge ~9 statt ~22 ms), der Hinweis mit den Daten entsteht erst
  beim Darüberfahren.
- Die interaktive KnowledgeTree-Datei lädt wie bisher alles auf einmal (liegt schon im Arbeitsspeicher).

### Tabs und geteilte Bereiche (seit 1.35, wie Obsidian, `web/js/panes.js`)
web/js/imgpack.js          75 Z. Bilder verlustfrei verkleinern (1.59): PNG/BMP → verlustfreies WebP mit Pixelvergleich
web/js/ooxml.js           ~330 Z. OOXML-Kern (1.60): eigener ZIP-Leser/-Schreiber (Original-Bytes je Teil), XML, Beziehungen, Content-Types, EMU↔px, leere Pakete
web/js/office.js          ~380 Z. Office-Seiten (1.60/1.61): Import, neue Seiten je Typ, Datei-Karte, aktuelle Fassung/Export, Neu einlesen, OfficeHtml (HTML ↔ Absätze/Läufe)
web/js/office-ppt.js      ~790 Z. PowerPoint (1.61): Folien lesen (Farbschema, Vererbung, Hintergrund/Duoton), Folien-Befehle, zurückschreiben
web/js/office-show.js     ~170 Z. Vorführmodus und Referentenansicht (1.62)
web/js/office-doc.js      ~600 Z. Word (1.63): Körper in Abschnitte, Absätze per LCS zurückschreiben, Listen/Tabellen erzeugen; 1.74: Lesen mit Formatvorlagen, Verzeichnis, Objekt-Absätze, Seitenumbrüche
web/js/office-wordimport.js ~680 Z. Word-Import wie Word (1.74): Formatvorlagen (docDefaults → Vorlagenkette → direkt), Inhaltsverzeichnis mit Sprüngen und Seitenzahlen aus der Ansicht, Textmarken, Bilder einbrennen (Drehen/Spiegeln/Zuschnitt/EXIF), verankerte Bilder und Textfelder, Tabellen (vMerge, Schattierung, Breiten)
web/js/office-objects.js  ~230 Z. Office-Objekte (1.75): Diagramme (chartN.xml → KnowledgeTree-Diagramm, Excel mit Bezug), Gruppen/Zeichenbereiche/SmartArt als Formen mit Text und Bildern (rohes HTML)
web/js/tellme.js          ~240 Z. Suche oben wie in Office (1.75, Alt+Q): Befehle und Menüeinträge aller Register, Datei-Bereiche, Einstellungen, Seiten
web/js/office-reader.js   ~420 Z. Seitenansicht „wie ein PDF-Reader“ (1.74): 1/2/mehrere Seiten, Zoom, Miniaturen, Suche, Verweise, Drucken; dieselbe Ansicht (ktReader, ohne Abhängigkeiten) in der exportierten Webseite
web/js/office-xl.js       ~300 Z. Excel (1.64/1.65): Blätter als Rechentabellen, Blätter einfügen/löschen/umbenennen, geänderte Zellen zurückschreiben, Formeln → Excel
web/js/office-view.js     ~460 Z. Office-Seiten wie die Programme (1.65/1.66): Word-Papier/Fluss/Blätter mit Abstand (1.74: Absätze über die Seitengrenze, Umbrüche, Überlagerungen), Lineal, Excel-Blattregister, PowerPoint-Folienübersicht + Notizbereich, Statusleiste
web/js/office-anim.js     ~180 Z. PowerPoint-Übergänge und -Animationen (1.66): p:transition/p:timing lesen und schreiben, Register-Befehle, Vorschau
web/js/grammar.js         ~130 Z. Grammatik (1.66): einfache Regeln Deutsch/Englisch, blau doppelt unterstrichen (CSS Highlight), Kontextmenü
web/js/fonts.js           ~100 Z. Eigene Schriftarten (1.66): .ttf/.otf/.woff/.woff2 als Asset, FontFace, Name aus der „name“-Tabelle
web/js/plugins.js         ~560 Z. Add-Ins und Makros (1.66, Schnittstelle 2 seit 1.69): eingebaut/Ordner/Notizbuch, ein/aus, api (Befehle, Knöpfe, Gruppen, Register, Menüs, Tasten, Stile, Ereignisse …), Aufräumen, Verwalten, KI-Vorlage; Makros (kt-API, Aufzeichnen, Editor)
web/js/addon-chemdraw.js   ~90 Z. Eingebautes Add-In Chem-Draw (1.69): Befehle, Gruppen Chemie/Reaktion im Register Zeichnen, Strukturformeln in der Seite, Fachwörter, Hilfe
web/addins/_Add-In-Vorlage_KI.js   KI-Vorlage für Add-Ins (1.70: EINE Datei – Anleitung als Kommentar + lauffähiges Gerüst; „_“ = im Ordner nicht geladen) – liegt im Programm im Ordner Add-Ins
web/js/office-word.js     ~400 Z. Word-Seiten (1.67): Klick aufs Blatt = Schreibmarke, ¶, Statusleiste Wörter/Zeichen, Lineale + Ränder ziehen, Navigationsbereich, Entwurf (Absatzabstand, Schriftart, Seitenränder)
web/js/office-grid.js     ~540 Z. Excel-Seiten (1.67): unendliches Raster, stehende Köpfe, feste Tabelle, Fenster fixieren, Rahmen, bedingte Formatierung, Duplikate, Text in Spalten, Zellformate ↔ styles.xml
web/js/office-slides.js   ~320 Z. PowerPoint-Seiten (1.67): Lernansicht/Normal, Notizen links, Animationsbereich, Folienlayouts, Textfeld aufziehen, Ausrichten, Führungslinien/Raster
web/js/office-convert.js ~1080 Z. Import anderer Formate (1.71): Compound File, CSV, .xls (BIFF8/5), .ods, .doc, .rtf, .odt, .md/.txt, .ppt, .odp → .xlsx/.docx/.pptx (Bauer)
web/js/office-saveas.js   ~880 Z. Speichern unter mit Dateityp (1.71): OOXML-Varianten, .xls (BIFF8-Schreiber), .ods, .csv/.txt, Word → .rtf/.odt/.html/.md/.txt; 1.72: Gruppen der Liste, PDF, Excel → .html, PowerPoint → .odp/.rtf (Gliederung)/.html/.txt (`deckOf`)
web/js/office-io.js       ~190 Z. Office öffnen/speichern (1.72): Öffnen mit Dateityp-Liste + Ablagefläche + Neu, „Speichern unter“ direkt in Datei → Informationen, Dateityp je Programm im Export-Fenster
web/js/office-xltools.js ~1000 Z. Excel wie Excel (1.72): verbinden, Format (Höhe/Breite/aus-/einblenden/sperren), Zellenformatvorlagen, Als Tabelle, Zellen formatieren, Suchen/Ersetzen, Seitenlayout, Formelüberwachung, Filter, Sortieren, Datenüberprüfung, Zielwertsuche, Notizen (Kommentar + VML), Blattschutz (SHA-512) – lesen und schreiben
web/js/office-wordtools.js ~330 Z. Word wie Word (1.72): Kopf-/Fusszeile mit Feldern auf jedem Blatt, Seitenzahl, Wasserzeichen (VML), Silbentrennung, Absätze sortieren; `OfficeSym` (Symbol für alle drei)
web/js/office-ui.js       ~480 Z. Office-Konzept (1.73): Schnellzugriff (Rechtsklick im Menüband), Ansichten in der Statusleiste, Kontextregister „Tabellenlayout“, Word-Lesemodus, PowerPoint-Gliederung, Eigenschaften (core.xml), Designs (theme), Datei → Informationen (Schützen, Dokument prüfen, Kompatibilität)
web/js/office-ppttools.js ~200 Z. PowerPoint wie PowerPoint (1.72): Folie ausblenden, Kopf-/Fusszeile für alle Folien, Foliensortierung, Bildschirmpräsentation einrichten (Endlosschleife, presProps)
- **Schwebende Fenster (1.49):** `Store.ui.panes.floats = [{ pane, x, y, w, h }]` (Anteile 0…1 der Fläche `#panes`,
  zuletzt in der Liste = zuoberst). Lösen: Tab auf die **Mitte** einer Seite ziehen (Rand rechts/unten = teilen wie
  bisher; in einen anderen Bereich verschieben = auf dessen Tableiste ziehen), Rechtsklick Tab/⋮ → „Als Fenster lösen“
  (`Panes.detach`). Fenster: Tableiste = Titelleiste (leere Stelle oder einziger Tab ziehen = verschieben,
  `floatDrag`; über einer Tableiste losgelassen = andocken), Ränder rechts/links/unten und Ecken = Grösse
  (`floatResize`), Knöpfe + · Maximieren · Andocken (`dock`) · Schliessen. Ein Fenster ist ein normaler Bereich
  (`leaves()` ohne Argument = Baum + Fenster; `treeLeaves()` = nur Baum): Vorschau, Zeichenfläche wandert hinein,
  wenn aktiv. Beliebig viele; der Hauptbereich behält mindestens einen Tab. Teilen aus einem Fenster heraus teilt den
  zuletzt benutzten Bereich im Baum. Schmal/Handy: das aktive Fenster füllt die Fläche. **Vollbild:** eine Kachel an
  ihrer Kopfzeile wegziehen = Fenster (`fsTileDrag`, in `this._fs.floats`, beim Verlassen zurück in die echten Tabs);
  oben ein 20-px-Streifen für die Pfeilchen (Menüband, Stift), damit die Kopfzeilen frei greifbar sind.
- **Eingliedern und geteilter Bildschirm (1.50, `dockTarget`/`showDock`/`dockFloat`/`tabToEdge`/`wrapRoot`):**
  Beim Ziehen zeigt eine Fläche, wo es landet, mit Hinweis („Links daneben“, „Darunter“, „Rechte Hälfte“, „Als Tab
  hinzufügen“, „Als Fenster lösen“).
  - **Fenster ziehen:** in der Mitte des Bereichs unter der Maus erscheint ein **Kompass** (5 Felder): Mitte = als Tab
    hinein, Pfeile = links/rechts daneben bzw. darüber/darunter (geteilt). Auf eine Tableiste = als Tab an dieser
    Stelle. An den **Rand der ganzen Fläche** (26 px) = ganze Hälfte (links/rechts/oben/unten). Sonst bleibt es frei
    schwebend (darum Kompass statt ganzer Fläche – sonst liesse sich ein Fenster nie frei absetzen).
  - **Tab ziehen:** Tableiste = umsortieren/verschieben; Rand eines Bereichs (28 %) = links/rechts/oben/unten teilen
    (bis 1.49 nur rechts/unten); Rand der ganzen Fläche = ganze Hälfte; Mitte = als Fenster lösen.
  - Im Kachel-Vollbild ebenso (Kompass an den Kacheln, Andocken ins Raster).
- **Stift ↔ Auswählen (1.49, seit 1.50 grösser: 32 px hoch, Symbol 20 px, fett; Handy 36 px, Finger 38 px):** `#rb-draw` fest rechts in der Registerzeile (vor dem Menüband-Pfeilchen), auf allen
  Registern; im Vollbild ohne Menüband `#fs-draw` oben links. `Draw.toggleSelect()` wechselt zwischen „Auswählen“ und
  dem zuletzt benutzten Werkzeug (`Draw._lastTool`, Standard Stift); Beschriftung = was der Klick tut, Rahmen in der
  Stiftfarbe, solange gezeichnet wird.
- **Seit 1.40 nur mit dem Pfeilchen aufklappen:** eingeklappte Tableiste: das Pfeilchen am Strich klappt sie wieder
  auf (`toggleMin(false)`; Maus in der Nähe tut nichts mehr, `onHover` entfernt; das kurze Aufklappen `peek` gibt es
  nur noch beim Umbenennen). Eingeklapptes Menüband: ein Register antippen wählt nur aus, aufklappen mit dem Pfeilchen
  rechts (`#rb-pin`) oder Strg+F1; Doppelklick auf ein Register klappt nur ein. **Vollbild:** Menüband standardmässig
  weg, Pfeilchen oben links (`#fs-rb`) blendet es ein (im Fluss über der Seite, mit Befehlen, auch wenn es sonst
  eingeklappt ist), sein Pfeilchen ⌃ blendet es wieder aus (`App.fsRibbon`, `Store.ui.fsRibbon`, Klasse `fs-ribbon`);
  Strg+F1 ebenso; Maus am oberen Rand blendet nichts mehr ein. Kacheln im Vollbild: ⌃ zum Einklappen vor ⤢
  (⤢ bleibt ganz rechts), eingeklappt je Kachel der Strich mit Pfeilchen.
- **1.41 – Menüband vorübergehend:** eingeklappt klappt ein Klick auf ein Register das Menüband herunter (`rb-peek`,
  über der Seite), bis die Maus Register + Befehle verlässt (`pointerleave` auf `#ribbon`, 400 ms, kommt sie zurück,
  bleibt es offen; nicht, solange ein Menü daraus offen ist oder ein Eingabefeld darin den Fokus hat –
  `Layout.peekLeaveSoon`). Dasselbe Register nochmals = zu. Finger: zu beim Tippen daneben. Dauerhaft auf: Pfeilchen
  bzw. Strg+F1. Im Vollbild gilt weiterhin das Pfeilchen oben links. Die Tableiste bleibt bei „nur mit dem Pfeilchen“.

- Über der Seite steht eine **Tableiste** (je Bereich): Punkt in der Abschnittsfarbe, Titel, **×**; rechts **+**
  (Neue Seite in neuem Tab, Diese Seite in neuem Tab, Zuletzt geöffnet) und **⋮** (Rechts teilen, Unten teilen, Tab
  schliessen, Andere Tabs schliessen, Bereich schliessen, Alle Bereiche gleich gross, Nur diesen Bereich behalten).
  Der aktive Tab des aktiven Bereichs hat oben einen Strich in der Akzentfarbe.
- Eine Seite in der Liste wählen ersetzt den **aktuellen Tab** (ist sie in diesem Bereich schon offen: dorthin
  wechseln). **Mittelklick** auf eine Seite in der Liste = neuer Tab; Rechtsklick → **In neuem Tab öffnen**,
  **Rechts daneben öffnen**, **Unten öffnen**. Ansicht → Tabs: Neuer Tab ▾, Rechts teilen, Unten teilen, Tab
  schliessen.
- Tabs: Klick = zeigen, Mittelklick/× = schliessen, **Ziehen** (Maus) in eine Tableiste = umsortieren/in einen
  anderen Bereich, auf den **rechten bzw. unteren Rand** eines Bereichs = dort teilen (Markierung zeigt wohin);
  Rechtsklick/langes Drücken → Schliessen, Rechts daneben/Unten öffnen, Kopie in neuem Tab, Nach links/rechts, In
  anderen Bereich verschieben (die Finger-Variante des Ziehens).
- Die **Trennlinie** zwischen Bereichen ziehen = Grösse (mind. 120 px); Doppelklick = gleich gross. Mit dem Finger
  ist der Griff 24 px breit und trägt eine Markierung.
- Nur **ein Bereich ist aktiv** (die echte Zeichenfläche); die anderen zeigen ihre Seite als **Vorschau**. Klick/
  Tippen darauf macht ihn aktiv. **Mausrad** über einer Vorschau verschiebt sie (Strg = Zoom), ohne zu wechseln –
  die Ansicht gilt beim nächsten Öffnen. Ändert sich eine Seite, die auch in einer Vorschau steht (dieselbe Seite
  zweimal, Rückgängig …), wird die Vorschau nach einer Pause nachgeführt; ebenso nach dem Wechsel Hell/Dunkel.
- **Vollbild mit allen Tabs (seit 1.37):** F11 (Ansicht → Vollbild) zeigt **jeden offenen Tab aller Bereiche als
  Kachel** in einem Raster (Spalten so, dass die Kacheln etwa 4:3 werden; leere Felder kosten etwas – 4 Tabs = 2 × 2).
  Jede Kachel hat eine schmale Kopfzeile mit dem Titel und **oben rechts den Pfeil ⤢ = nur diesen Tab im Vollbild**;
  dort zeigt die Kopfzeile die Tabs aller Kacheln zum Umschalten und **⤡ führt zurück** zur Übersicht. Klick in eine
  Kachel = dort arbeiten (aktive Kachel mit Rahmen in der Akzentfarbe), Mausrad über einer Kachel verschiebt deren
  Vorschau. Teilen, Tabs schliessen/ziehen sind im Vollbild gesperrt (Hinweis). Beim Verlassen kommen die Bereiche
  zurück wie vorher; eine im Vollbild in einer Kachel geöffnete Seite steht danach in deren Tab, der zuletzt aktive
  Tab ist aktiv. Nur ein Tab offen: Vollbild wie bisher (Seite mit Titel, ohne Kopfzeile). Auch auf dem Handy
  (Pfeile 42 × 39 px).
- **Handy und schmale Fenster** (unter 520 px Platz, Handy-Layout) sowie **Vollbild mit nur einem Tab**: nur der aktive Bereich ist
  zu sehen, seine Tableiste zeigt die Tabs **aller** Bereiche (durch Striche getrennt); antippen wechselt Bereich
  und Tab. Auf dem Handy erscheint die Tableiste erst, wenn es mehr als einen Tab gibt (Platz für die Seite). Ziele
  mit dem Finger: Tab 39 px hoch, × 32 × 32, + und ⋮ 42 × 39.
- Tabs und Bereiche stehen in `Store.ui.panes` und sind beim nächsten Start wieder da; Tabs gelöschter Seiten
  verschwinden, ein leerer Bereich schliesst sich.
- **Seit 1.36: Titel nur im Tab.** Solange eine Tableiste da ist, fällt der grosse Titel samt Datum über der Seite
  weg (`#page-head`; zurück mit Einstellungen → Allgemein → „Seitentitel und Datum über der Seite“ =
  `Store.ui.pageHead`, Klasse `show-head`). Ohne Tableiste (Handy mit nur einem Tab, Vollbild) steht er wie bisher
  da. **Doppelklick auf den Tab** (auch zweimal kurz antippen) = umbenennen direkt im Tab (Enter übernimmt, Esc
  bricht ab); neue Seiten und F2 bearbeiten den Titel ebenso im Tab (`App.focusTitle`). Datum: Rechtsklick auf den
  Tab → Datum ändern; der Tooltip zeigt es.
- **Seit 1.36: + und Rechtsklick** (seit 1.65: Klick = neue Seite in neuem Tab, darüber halten = Word/Excel/PowerPoint – siehe „Office-Seiten wie die Programme“; früher:) Linksklick auf **+** = neuer Tab mit derselben Seite (Kopie des aktuellen Tabs),
  **Rechtsklick/langes Drücken auf +** = die Auswahl (neue Seite in neuem Tab, diese Seite, zuletzt geöffnete).
  Ansicht → Tabs: „Neuer Tab“ ist ein geteilter Knopf (oben = Kopie, Pfeil = Auswahl).
- **Seit 1.36: Tableiste einklappen** wie das Menüband: **⌃** rechts in der Tableiste (Doppelklick auf ihre freie Fläche, ⋮, Ansicht → Tabs →
  Tableiste einklappen, Einstellungen → Allgemein) = `Store.ui.tabsMin`. Übrig bleibt ein 6-px-Strich mit einem
  Pfeilchen rechts. **Maus in die obersten 14 px** eines Bereichs = die Tabs fahren **über der Seite** aus (die Seite
  bleibt stehen); verlässt die Maus die Leiste um mehr als 22 px, klappt sie nach 350 ms wieder ein (nicht, solange
  ein Menü daraus offen ist oder ein Tab umbenannt wird). **Finger/Klick:** Pfeilchen antippen (Treffer 48 × 18 px
  plus Rand) = ausfahren, Tippen daneben = einfahren. ⌄ in der ausgefahrenen Leiste heftet sie wieder an.

### Sicherung, Export und Einstellungen (seit 1.24, Browser und Programm gleich; 1.25 wie bei OneNote)
- **Standardwerte seit 1.42:** Sicherung wöchentlich, 2 Backups behalten (Programm `loadSettings`, Browser/Programm
  `Settings.backupDefaults`); Papierkorb nach 30 Tagen (Programm einstellbar; Webseite fest 30 statt 60 Tage in
  `cleanup`); Design Dunkel (`Store.ui.theme` Standard `'dunkel'`, `index.html` startet dunkel und wechselt nur bei
  gemerktem `kt-theme = 'hell'`). Wer schon etwas gewählt hat, behält es.
- **Datei-Fenster** (seit 1.34 wie in OneNote, siehe Abschnitt 4 „Datei“): Speichern & Sichern (Backup erstellen,
  Backup laden; in einer interaktiven Datei „Datei speichern“), Öffnen (Importieren, geschlossene Notizbücher),
  Exportieren (inkl. **Als Datei** = Notizbuch als KT-Datei), Informationen (Notizbücher, Speicher, Desktop:
  Ordner), Hilfe, **Optionen** = Einstellungen, Desktop: Beenden. Bis 1.33 war „Datei“ ein Menüband-Register.
- **KnowledgeTree-Datei (Grundformat)** (`web/js/ktfile.js` → `write`, `store.go` → `writeSectionFile`): ZIP mit
  genau dem Saves-Ordner der EXE: `KnowledgeTree.json` (Beschreibung: `typ 'KnowledgeTree-Datei'`, `version 3`,
  `art 'backup'|'export'|'abschnitt'`, name, erstellt, programm, quelle, seiten, bilder, evtl. `ohneBilder`,
  `fehlend`, `geteilteBilder`), `Saves/_struktur.json`, `Saves/<Gruppe>/_gruppe.json`,
  `Saves/<Gruppe>/<Seite>.seite.json` (kompaktes JSON, gepackt), `Saves/_Bilder/<sha1>.<ext>` (nur benutzte;
  PNG/JPEG/PDF/Office unverändert „gespeichert“, SVG/BMP/Text gepackt; **leere Bilder werden nie geschrieben**).
  Ordner- und Dateinamen nach denselben Regeln wie `store.go` (`KtFile.safeName/uniqueName` =
  `sanitizeName/uniqueName`).
- **Exportieren → KnowledgeTree-Datei** mit Kästchen „Speichern als“ (`Store.ui.exportKt`, Standard 'html'):
  **Interaktiv (.knowledgetree.html)** – das ganze Programm (Webseiten-Fassung) mit nur der Auswahl;
  **Kompakt (.knowledgetree.zip)** – das Grundformat; **JSON (.knowledgetree.json)** – wie bis 1.23 (`writeJson`,
  Bilder als Daten-URL, auch für ältere Versionen). Alle drei lassen sich mit „Importieren“ (neue Notizbücher)
  oder „Backup laden“ einlesen. Grössen bei „AM (Mathe)“: HTML 55,6 MB (bis 1.25: 64,6) · ZIP 47,4 MB · JSON 81,4 MB.
- **Interaktive Datei** (`KtFile.writeHtml/readHtml`, Gerüst aus `build_web.py`): Vorlage = die Webseite selbst –
  im Programm vom Server (`/kt-app.html` = eingebettete `dist/index.html`), im Browser aus der laufenden Seite
  zusammengesetzt (`#kt-shell` = HTML ohne Code als JSON; Code aus `<script data-kt="js/…">`, CSS aus `#kt-css`).
  Die Daten (Grundformat, seit 1.26 als **Base-122** mit ~14 % Aufschlag statt Base64 mit 33 %, in 3-MB-Stücken)
  stehen gleich nach `<meta charset>` an der Marke `<!--kt-datei-->` in `<script type="application/x-knowledgetree"
  id="kt-datei" data-bytes data-enc="b122" data-groesse data-name data-erstellt>` (`data-bytes` = Länge des Blocks
  in Bytes, `data-groesse` = Grösse des ZIP; ohne `data-enc` = Base64 wie in 1.25, wird weiter gelesen); Lesen
  sucht nur im ersten 64 KB nach dem Block und dekodiert genau `data-bytes` Bytes. **Geöffnet** (Doppelklick, auch `file://`) erkennt `backend-browser.js` den Block und nimmt
  `ktFileBackend` (`Backend.kind 'datei'`): alles im Arbeitsspeicher, **nie IndexedDB** (vom Datenträger
  geöffnet sähe die Datei sonst die Datenbank des echten KnowledgeTree), Import-Journal mit eigenem Schlüssel;
  Bearbeiten wie gewohnt, Statusleiste „Änderungen nur in diesem Fenster“, Hinweisleiste oben, Warnung beim
  Schliessen mit ungespeicherten Änderungen; **Datei speichern / Strg+S** lädt eine neue interaktive Datei herunter.
  Einstellungen dort nur „Allgemein“ und „Seite“. Die Webseite zum Ansehen (Export „Webseite (HTML)“) enthält
  keine Daten – beim Importieren kommt ein erklärender Hinweis (`ktweb`, Erkennung über `meta generator`).
- **Backup wie bei OneNote** (seit 1.25; `KtFile.writeFolder/readFolder`, `store.go` → `writeBackupFolder`): ein
  Ordner `KnowledgeTree-Backup_<Datum>` mit `KnowledgeTree.json` (`typ 'KnowledgeTree-Sicherung'`, `version 4`,
  `reihenfolgeGruppen` der Notizbücher – wie „Open Notebook.onetoc2“), je Notizbuch/Abschnittsgruppe ein Ordner
  mit `_gruppe.json` (Name, Farbe, Art, Reihenfolge) und je Abschnitt eine Datei `<Abschnitt>.knowledgetree.zip`
  (Grundformat, `art 'abschnitt'`, nur dieser Abschnitt). Bilder, die mehrere Abschnitte brauchen, liegen einmal
  in `_Bilder/` oben (bei „AM (Mathe)“ 175 von 278 Bildern – ohne das 70 statt 48 MB). Programm: Ordner in
  `Cache/Backups` (erst als `….tmp` geschrieben, dann umbenannt); Browser: in den Sicherungsordner oder als
  **ZIP dieses Ordners** (Download, Abschnitt-Dateien darin unverändert). Eingelesen wird als Ordner („Backup
  laden → Ordner wählen“, „Importieren → Ordner wählen“) oder als ZIP; ein Ordner nur mit Abschnitt-Dateien (ohne
  `KnowledgeTree.json`) geht auch (oberste Ordner = Notizbücher). Eine **einzelne Abschnitt-Datei** wird beim
  Importieren wie ein OneNote-Abschnitt behandelt: Ziel wählen (`KtFile.peekMeta` → `art 'abschnitt'` →
  `plan.sections` mit `kt: true` → `OneImport.importKtSection`). Bis 1.24 waren Backups `Saves_<Datum>.zip`
  (ganzer Saves-Ordner) bzw. `KnowledgeTree-Backup_<Datum>.zip` – beide werden weiter gelistet, geladen und beim
  Aufbewahren mitgezählt.
- **Lesen** (`KtFile.read`): ZIP (nur das Inhaltsverzeichnis, dann Seite für Seite; Wurzel = Ordner mit
  `_struktur.json`, sonst `…/Saves/`, sonst gemeinsamer Anfang → auch ein gezippter Notizbuch-Ordner), JSON bis
  1.23 (`readJsonStream`, Bilder werden dabei wie früher gleich gespeichert), EXE-Backups bis 1.23 (ohne Bilder:
  Hinweis im Dialog, vorhandene Bilder werden weiter verwendet). Bilder aus dem ZIP übernimmt `storeAssets`
  erst nach der Bestätigung und nur, wenn sie fehlen (`Backend.hasAssets`; Desktop holt dabei Bilder aus
  `Cache/Papierkorb/_Bilder` zurück); `Backend.putAsset(name, blob)` (Browser: unter dem Namen, Desktop: der
  Server bildet den Namen neu – abweichende Namen werden in den Seiten ersetzt).
- **Backup laden** (`App.restoreBackup`): Dialog mit der Liste aus `Cache/Backups` (Desktop: `/api/backups`,
  Ordner über `/api/backup-dateien` + `/api/backup-datei?name=&pfad=`, jede Datei erst beim Lesen geholt) bzw. aus
  dem Sicherungsordner (Browser), dazu **Datei wählen …** und **Ordner wählen …**. Einzelne kaputte oder leere
  Bilder brechen seit 1.25 nichts mehr ab: sie werden übersprungen und in der Meldung gezählt.
  Dann „Zusätzlich hinzufügen“ (neue IDs, `Tree.fromBackup`) oder „Alles ersetzen“ (IDs bleiben) – **jetzt auch im
  Programm**; Häkchen „Vor dem Ersetzen … sichern“ (Standard an) macht vorher ein Backup (Desktop: in
  Cache/Backups; Browser: Download bzw. Sicherungsordner).
- **Backup erstellen** (`App.createBackup`): Desktop → `/api/backup?immer=1` (der Server schreibt den
  Backup-Ordner direkt aus dem Saves-Ordner, Seiten mit `json.Compact`, Deflate-Stufe 4); Browser →
  `KtFile.writeFolder` aus `Store.pages` mit Fortschritt und Abbrechen → Sicherungsordner oder ZIP-Download;
  interaktive Datei → `Backend.backup` = Datei speichern.
- **Grössen** (echte Datei „AM (Mathe)“, 234 Seiten, 278 Bilder): JSON 1.23 81 MB → ZIP 47,5 MB (Seiten ~6 MB
  gepackt, Bilder 41 MB ohne Base64). Seiten im Saves-Ordner seit 1.24 mit `pageJSON` (oberste Felder und
  Einträge der obersten Listen je eine Zeile, Rest kompakt): 64 → 27 MB.
- **Einstellungen** (`web/js/settings.js`, `Settings.show(kategorie)`), aufgebaut wie die OneNote-Optionen
  (links Kategorien, OK/Abbrechen): **Allgemein** (Design, lesbare Farben, Navigation, Seitenliste links/rechts; 1.36: Tabs –
  Seitentitel über der Seite, Tableiste eingeklappt),
  **Seite** (Raster, Verbindungen weichen aus, Bildlaufleisten, Ankerpunkte – übernommen über die vorhandenen
  Befehle), **Sicherung** (Wann: aus / bei jedem Start / täglich / wöchentlich / monatlich; nur bei Änderungen;
  Aufbewahren 1–100; Desktop: Bilder mitsichern; Browser: Sicherungsordner wählen; „Backup jetzt erstellen“,
  „Backup laden …“, letzte Sicherung/Belegung; Desktop seit 1.36: Speicherort der Backups), **Speicher** (seit 1.36
  zuoberst **Speicherort**: Programm = Pfade von Saves, Cache, Backups, Papierkorb, Programmordner je mit „Kopieren“
  und „Öffnen“ – `Store.info` liefert sie seit 1.36 vollständig; Browser = Browser, IndexedDB „KnowledgeTree“ und die
  Adresse der Seite (eigener Speicher je Adresse/Browser) + wohin Backups gehen; interaktive Datei: unter Allgemein
  der Dateiname; Desktop: Papierkorb nach x Tagen leeren (0 = nie),
  Belegung über `/api/speicher`; Browser: Seitenversionen Abstand/Anzahl, Belegung, Papierkorb & Aufräumen).
  Gespeichert in `Store.ui.sicherung` (Browser `{intervall:'woche', nurAenderung, anzahl:10}`, Desktop
  `{intervall:'start', nurAenderung, anzahl:10, bilder:true, papierkorbTage:60}`), `Store.ui.versionen`
  (`{abstand:10, max:50}`, liest `backend-browser.js` in `sync`) und `Store.ui.sicherungStand` (Browser: Zeit und
  Datenstand des letzten Backups). Nach OK wird der Zustand sofort gespeichert (`UiState.save`), weil das
  Programm `sicherung` aus `Cache/zustand.json` liest.
- **Automatisch – Programm** (`store.go` → `autoBackup`, beim Start und stündlich): fällig nach Intervall seit
  dem letzten Backup (`Cache/Backups/_stand.json`); „nur bei Änderungen“ vergleicht eine Kennung aus Namen,
  Grössen und Zeiten der Saves-Dateien (ohne `_Bilder`). Aufbewahren: ältere Backups (Ordner und alte ZIPs)
  werden gelöscht.
  Beim Start ausserdem `collectUnusedImages` (holt benutzte Bilder aus dem Papierkorb zurück) und `cleanTrash`.
- **Automatisch – Browser** (`AutoBackup`, 15 s nach dem Start, dann alle 30 Minuten): mit Sicherungsordner
  (File System Access, Chrome/Edge; der Ordner-Handle liegt in IndexedDB `cache/sicherungsordner`) und erteilter
  Erlaubnis wird still als Backup-Ordner gespeichert und auf „Aufbewahren“ gekürzt; sonst erscheint unten die Erinnerung „Backup
  fällig“ mit **Jetzt sichern** (Download bzw. Erlaubnis nachfragen), **Später** (4 Stunden Ruhe) und Zahnrad.
  Ganz neue Benutzer (Willkommensseiten) werden nicht gleich erinnert.


### Speicher optimieren (seit 1.39, Programm; `optimize.go`, Einstellungen → Speicher)
- **Beim Beenden** (Fenster zu, Server schon gestoppt, niemand schreibt mehr; abschaltbar unter Einstellungen →
  Speicher, `Store.ui.sicherung.optimieren`, Standard an), höchstens 45 s, Rest beim nächsten Mal:
  1. **Sortieren:** alle Bilder/Anhänge in den `_Bilder`-Ordner ihres Abschnitts (`assetMaintenance`, wie beim Start),
     Eingang `Saves/_Bilder` leeren, halbe Zwischendateien (`*.tmp`, älter als 1 h) entfernen. Danach ist jeder
     Abschnitt-Ordner vollständig – herauskopieren genügt, auch ein Notizbuch mit allen Unterordnern.
  2. **Doppeltes zusammenlegen:** gleiche Dateien in Saves, `Cache/Papierkorb` und `Cache/Backups` werden **harte
     Verknüpfungen** derselben Datei (Inhalt nur einmal auf der Festplatte). Kandidaten nach Grösse + Prüfsumme im
     Namen, dann Byte für Byte verglichen; ersetzt wird über `<datei>.kt-link.tmp` + Umbenennen (nie halb). Nur
     Dateien, die sich nie ändern: Bilder/Anhänge (Name = SHA1) und Abschnitt-Dateien der Backups.
- **Backups:** ein seit dem letzten Backup unveränderter Abschnitt (Fingerabdruck über Seiten, `_gruppe.json`, Name,
  Bilder, Programmversion; `Cache/Backups/_abschnitte.json`) wird als harte Verknüpfung der vorherigen
  `.knowledgetree.zip` angelegt – zehn Backups brauchen kaum mehr Platz als eines; jedes bleibt für sich vollständig.
- **Papierkorb:** ein gelöschter Abschnitt behält seine Bilder (harte Verknüpfung nach `Papierkorb/_Bilder`, statt sie
  zu verschieben) – auch ein Ordner aus dem Papierkorb ist herauskopiert vollständig.
- Einstellungen → Speicher: „Beim Beenden Speicher optimieren“, „Jetzt optimieren“ (`/api/optimieren`), Ergebnis des
  letzten Laufs (`Cache/optimiert.json`). Belegung zählt verknüpfte Dateien nur einmal (`diskSize`, `os.SameFile`).
- Kein Dateisystem mit harten Verknüpfungen (FAT32-Stick, manche Netzlaufwerke): alles bleibt, wie es ist.
- **Unterbrechen:** ein gleich wieder gestartetes Programm legt `Cache/optimiert.stopp` an (nur wenn
  `Cache/optimiert.lauf` jünger als 5 min ist), das Optimieren hört nach der aktuellen Datei bzw. dem aktuellen
  Abschnitt auf (gemessen: ~50 ms) und macht beim nächsten Schliessen dort weiter (`requestOptimizerStop`, `maintStop`).
- **Schnellprüfung:** `Cache/optimiert-stand.json` merkt sich je Datei Grösse+Datum (aus dem Ordnerverzeichnis, ohne
  sie zu öffnen). Verglichen wird nur in Gruppen mit einer neuen/geänderten Datei; Sortieren nur, wenn seit dem Start
  gespeichert/eingefügt wurde (`savesChanged`), der Eingang nicht leer ist oder es noch aussteht. Gemessen: 1000
  Bilder (1,9 GB, 25 Abschnitte) erster Lauf 2 s → 77 MB; danach 9 ms.
- **Webseite (Einstellungen → Speicher → Speicherort):** zeigt den Ordner, in dem der Browser die IndexedDB dieser
  Adresse ablegt (Chrome/Edge/Brave/Opera unter Windows, macOS, Linux mit Ordnername `https_<host>_<port>`; Firefox
  `<Profil>/storage/default/…/idb`; Safari; iPhone/Android: im App-Speicher, nicht erreichbar) und was darin liegt
  (Stores `saves_struktur`, `saves_seiten`, `saves_bilder`, `versionen`, `papierkorb`, `cache`, Datenbank
  `KnowledgeTree-Woerterbuch`).

### Kopieren und Einfügen im Navigationsbaum (seit 1.26, wie OneNote)
- Rechtsklick auf **Abschnitt, Abschnittsgruppe, Notizbuch** (auch Register oben, Schnellnotizen) → **Kopieren**;
  Rechtsklick auf das Ziel → **Einfügen (… „Name“)**. Seitenliste: **Kopieren** (eine oder mehrere Seiten) und
  **Einfügen** (nach der Seite). `Ops.copyNode/copyPages` halten den Stand beim Kopieren (Seiten als Text, ohne
  Bilder – die bleiben geteilt), `Ops.pasteInfo(ziel)` sagt, was Einfügen dort täte.
- Regeln: Abschnitt/Gruppe auf einen Abschnitt → direkt danach; auf ein Notizbuch/eine Gruppe → hinein (ans Ende);
  Notizbuch auf ein Notizbuch → neues Notizbuch danach, sonst als Abschnittsgruppe; Seiten auf einen Abschnitt →
  ans Ende, auf eine Seite → danach (mit Unterseiten-Ebenen). Gleicher Name unter den Geschwistern → „(Kopie)“,
  „(Kopie 2)“ … Alles bekommt neue IDs (`Ops.clonePage`: Seite, Felder, Gruppen, Verbindungen, Zeichnungen;
  Diagramme zeigen auf die mitkopierte Tabelle). Ein Rückgängig-Schritt.
- Bezüge `[Seite]…` in einem kopierten Abschnitt zeigen auf die Seiten der Kopie (gleicher Abschnitt zuerst) –
  ein kopierter „Fabrik“-Abschnitt rechnet also mit seinen eigenen Rezept-Seiten.

### Drucken (seit 1.26, Datei → Drucken, Strg+P; Einstellungen → Drucken)
- Dialog wie Word/OneNote (`web/js/print.js`): links **Was** (aktuelle Seite, ausgewählte Seiten, Abschnitt,
  Notizbuch, Auswahl auf der Seite, Tabelle ganz, markierter Bereich), **Papier** (A4, A3, A5, Letter, Legal),
  **Ausrichtung**, **Ränder** (normal 15 mm, schmal 7 mm, breit 25 mm), **Skalierung** (an Blattbreite anpassen wie
  OneNote, ganze Seite auf ein Blatt wie Excel, Originalgrösse, eigene %), **Kopf-/Fusszeile** (Titel und Datum
  oben, „Seite x von y“ unten), **Seitenfarbe und Linien**, **Gitternetzlinien** (Tabelle); rechts die
  **Vorschau** (echte Blattgrösse, verkleinert; ◀ ▶ blättert durch die Seiten), „Als Standard speichern“,
  „Drucken …“ öffnet den Druckdialog des Systems (Drucker, Exemplare, „Als PDF speichern“).
- Seiten: wie der PDF-Export hell dargestellt, kopiert (`Export.snapshot`, `opts.only` für die Auswahl) und in
  Blätter geschnitten (`Print.layout`: Massstab, Ausschnitte nach unten und – bei Originalgrösse/eigener Grösse –
  nach rechts, Reihenfolge „zuerst nach unten“ wie Excel); jedes Blatt hat genau die bedruckbare Höhe, Fusszeile
  darin (Gesamtzahl erst am Ende eingesetzt). Viele Seiten: mehrere Druckaufträge (`Export.pdfParts`).
- Tabelle: als HTML-Tabelle mit `<thead>` (Kopfzeile auf jedem Blatt), Titel/Seitenzahlen über die Seitenränder
  (`@page`-Randfelder), Breite ans Blatt angepasst, „ganze Tabelle auf ein Blatt“ misst die Höhe im Dokument.
- Vorgaben in `Store.ui.drucken` (Einstellungen → Drucken); der Dialog merkt sich die letzte Wahl.
- **Massstab (seit 1.30):** Schieber 10–400 % plus Zahl unter „Skalierung“; wer daran dreht, wählt „Eigene Grösse
  (Massstab)“. Bei „An Blattbreite anpassen“/„Ganze Seite auf ein Blatt“ zeigt er den tatsächlichen Massstab.
- **Druckbereich (seit 1.30):** Oben/Unten/Links/Rechts in cm (Seiten-cm, positiv = nach innen abschneiden, negativ =
  mehr Weissraum) oder in der Vorschau an den blauen Griffen der gestrichelten Kanten ziehen (Maus und Finger);
  „Bereich zurücksetzen“. Unabhängig von Papier und Rändern: der Bereich verschiebt den Inhaltsrahmen der Seite
  (`Print.cropBox`), Massstab und Blätter werden danach berechnet. Gilt für alle Seiten dieses Drucks, wird nicht als
  Vorgabe gespeichert (`o.crop` ist nicht in `Store.ui.drucken`). Vorschau: ganzer Schnappschuss, ausgeschnitten erst
  in `Print.pageSheets` (Ziehen ohne neuen Schnappschuss); Drucken: `Export.snapshot(…, { crop })`.
- Handy: Vorschau oben (bleibt beim Blättern durch die Einstellungen stehen), Griffe für Finger breiter.
### Grosse Dateien: stückweise importieren und exportieren (seit 1.18)
Grundsatz: **nie die ganze Datei, das ganze Archiv oder das ganze Ergebnis auf einmal im Speicher.**
- **Import, Plan statt Inhalt:** `auto()` legt nur noch einen Plan mit **faulen Einträgen** an
  (`{ name, size, read(), blob() }`) – gelesen wird eine Datei erst, wenn sie an der Reihe ist.
  - **ZIP** (`FilePages.openZip(blob)`): liest nur das Inhaltsverzeichnis (EOCD, ZIP64, UTF-8-Flag/CP437,
    Unicode-Pfad 0x7075) und entpackt jeden Eintrag einzeln aus `Blob.slice()` mit `DecompressionStream`.
  - **.onepkg/CAB** (`ON.openCab(blob)`): Kopf und Dateiliste aus einem kleinen Ausschnitt, dann
    `iterate()` Datei für Datei; Datenblöcke werden in 8-MB-Stücken nachgelesen. LZX läuft als Generator
    (`ON.lzxStream`) mit Ringpuffer (2 × Fenster, ≥ 128 KB) und gibt 32-KB-Frames aus (E8-Umsetzung je
    Frame), MSZIP blockweise mit 32 KB Vorgeschichte – das entpackte Paket liegt nie ganz im Speicher.
  - **RAR (seit 1.19):** node-unrar-js läuft in einem **Modul-Worker** (`rarWorkerMain`, als Blob-URL; lädt das
    Modul selbst von jsDelivr). Ein eigener `Extractor` (Unterklasse von `mod.Extractor`) liest die Archivdatei mit
    **`FileReaderSync`** in 4-MB-Stücken – das Archiv kommt **nie ganz** in den Speicher (auch > 2 GB möglich).
    Entpackt wird in **einem Durchgang** (Archiv-Reihenfolge, auch „solid“) nur, was gebraucht wird
    (`wanted()`: .one/.onetoc2/.onepkg/.onebin/…_onefiles/JSON); jede Datei geht als `Blob` (in 16-MB-Teilen
    gebaut) an das Hauptfenster. **Rückstau:** der Worker läuft dem Import höchstens ~192 MB voraus (`ack` beim
    Abholen, `go` wenn jemand auf eine noch nicht entpackte Datei wartet – sonst Verklemmung bei anderer
    Reihenfolge). Eine kaputte/verschlüsselte Datei wird gemeldet, der Rest weiter entpackt (neuer Durchgang ohne
    sie). Abschnitte werden nach dem Lesen freigegeben (`job.forget`), nach dem Import `closeArchives()` (Worker
    beenden) – auch bei Abbruch/Fehler (`auto()` → `finally`). **Ohne Worker** (kein `Worker`/`FileReaderSync`,
    Modul im Worker nicht ladbar, Zeitüberschreitung 30 s): Hauptfenster, Archiv **einmal** im Speicher (ohne
    Kopie), ebenfalls ein Durchgang bis zum Ende, entpackte Daten sofort als Blob abgegeben und aus
    `ExtractorData.dataFiles` gelöscht. Gemeinsamer Ablauf: `rarJob()` (getestet in `tests/rar/rarjob-test.js`).
    Fortschritt „RAR wird entpackt … x %“ in der Import-Anzeige, solange auf das Entpacken gewartet wird.
  - **Ordner/lose Dateien:** `fileEntry(file, pfad)` – nur der `File`-Verweis.
  - **Abschnitt Seite für Seite:** `Model.sectionStart(name)` liefert die Seiten-Verweise, `readPage(ref)`
    liest eine Seite, `sectionEnd()` die Reste/fehlenden Daten; danach `store.release(osid)` → die Objekte der
    fertigen Seite werden freigegeben. Bilder/Dateien gehen als `Blob` direkt in IndexedDB (keine zweite Kopie,
    keine Objekt-URL beim Speichern).
  - **Fortschritt mit „Abbrechen“** (`progressUI`), `breathe()` gibt alle ≤ 40 ms der Oberfläche Luft,
    **alle 40 Seiten wird gespeichert** (`Save.flush`) – bei einem Absturz ist das Bisherige da.
  - **Speicher voll** (`QuotaExceededError`, `isQuota`): Import hält sauber an, Bericht „Der Speicher dieses
    Browsers ist voll (x von y MB belegt) …“ statt vieler „Seiten mit Fehlern“.
  - KT-Dateien in Archiven: `readKt(blob)` liest als Strom und speichert Bilder dabei (umbenannt, falls der
    Name schon vergeben ist – das behebt nebenbei fehlende Bilder bei KT-Dateien in Archiven).
- **Sicherung laden:** `readJsonStream(file, { bilder: … })` (util.js) liest die Sicherung als Strom: oberste
  Ebene Stück für Stück, jedes Bild wird beim Lesen als `Blob` gespeichert (Base64 in 1-MB-Stücken), der
  Rest wie bisher. Auch „Backup laden“ (Browser) und das Hineinziehen einer Sicherung nutzen das.
- **Export, Teile statt String:** Ergebnisse sind `Blob`s aus vielen Teilen (`new Blob(parts)`), nie ein
  einziger String/Puffer:
  - **Sicherung** (`Backend.backup`): jede Seite und jedes Bild ein eigener Teil, Bilder einzeln geholt.
  - **KT-Datei/HTML:** Seite für Seite gerendert (`renderEach`), Bilder einzeln (`ktImages`, `assetBlob`
    über `Backend.imgBlob`).
  - **PDF:** wird ab **40 Seiten oder ~60 MB Bilddaten in mehrere Dateien geteilt** („Name (Teil k von n).pdf“,
    `pdfParts`, `PDF_PART_PAGES`/`PDF_PART_BYTES`).
  - **OneNote (.one/.onepkg):** `SegOut` sammelt grosse Segmente als eigene Teile (keine Kopie), Dateidaten
    werden aus dem gespeicherten `Blob` übernommen; `exportTree` baut Abschnitt für Abschnitt und gibt den
    fertigen Abschnitt frei; die CAB nimmt die Blöcke als `Blob.slice`. Grenze: 65 535 CAB-Blöcke (≈ 2 GB).
- **Aufräumen:** `Backend.trimURLs(behalten, 120)` gibt beim Seitenwechsel Objekt-URLs nicht sichtbarer Bilder
  frei; der Verlauf (Strg+Z) speichert Schritte über **8 Mio. Zeichen** nicht dauerhaft (`Hist.persistLimit`
  – ein Riesen-Import bleibt in der Sitzung rückgängig, landet aber nicht im gespeicherten Verlauf).

### Löschen, Absturz und Aufräumen (seit 1.20, Webseite)
- **Löschen ist restlos** (Wunsch des Users): `Backend.sync` legt verschwundene Seiten nicht mehr in den Papierkorb,
  sondern löscht sie samt ihren Versionen. Zurückholen geht mit **Strg+Z** (der Verlauf hält die Seiten als Text;
  kleine Schritte überstehen auch ein Neuladen). Bilder/Anhänge entfernt `Backend.cleanup()`, sobald weder eine
  Seite noch der Verlauf (Undo **und** Redo) sie braucht: 20 s nach einem Löschen (`App.cleanupSoon`), 8 s nach dem
  Start und über „Speicher aufräumen“. Die Desktop-Version behält ihren Papierkorb-Ordner (Hinweistext je Version:
  `Ops.deleteNote()`).
- **Alter Papierkorb** (Einträge bis 1.19): Datei → Papierkorb heisst jetzt „Papierkorb & Speicher“ – listet nur Titel
  (Cursor; die Seite wird erst beim Wiederherstellen geladen, `trashGet`), zeigt den belegten Speicher, „Papierkorb
  leeren“ (samt Bildern) und „Speicher aufräumen“ (meldet entfernte Bilder/MB). Nach 60 Tagen fallen Einträge weg.
- **Import-Journal** (`ImportJournal`, localStorage `kt-import-journal`): beim Start eines Imports die IDs aller
  vorhandenen Gruppen, Dateiname(n); Lebenszeichen alle 5 s und je Seite (Abschnitt, Datei, Seite i/n,
  JS-Speicher, RAR-Weg). Fertig → gelöscht. Findet `App.boot` ein Journal **ohne Lebenszeichen seit 30 s**, ist
  die Seite mitten im Import abgestürzt: `OneImport.removeCreated(before)` nimmt alle Gruppen, die es vorher nicht
  gab, samt Seiten heraus, danach `cleanup({ grace: 0 })` – Dialog „Import nicht fertig geworden“ mit dem, was
  entfernt wurde, und den letzten Angaben (für die Fehlersuche).
- **Fehlgeschlagener Import in der Sitzung** (Ausnahme oder Speicher voll): sofort `removeCreated` vor dem
  Verlaufsschritt (es entsteht keiner), die dabei **neu** gespeicherten Bilder (`Backend.trackStart/Stop`) werden
  gelöscht, sofern nichts anderes sie braucht. Bericht „… fehlgeschlagen – restlos wieder entfernt“. **Abbrechen**
  durch den User behält das bisher Importierte (Strg+Z nimmt es zurück).
- **Weniger Grundbedarf:** Verlaufs-Schnappschüsse (`snapPage`/`oneByte`) als Ein-Byte-Strings (1350 Seiten:
  Start 503 → 388 MB JS-Speicher); `cleanup` geht Papierkorb und Versionen mit Cursor durch statt alles mit
  `getAll` zu laden und nimmt die Namen aus dem Speicher (`refsInMemory`, ohne Freihand-Punkte zu durchsuchen);
  `Hist.load` wirft übergrosse gespeicherte Schritte (aus Versionen bis 1.17: ganze Importe) gleich weg und
  speichert den Verlauf neu; nach dem Start werden die geladenen Rohdaten nicht festgehalten.
- **RAR:** Der Notweg im Hauptfenster (ganzes Archiv im Speicher) nur noch bis 400 MB (`RAR_INLINE_MAX`), sonst
  klare Meldung mit dem Grund, warum der Hintergrund-Entpacker nicht ging. Der OneNote-Papierkorb im Archiv
  (`OneNote_RecycleBin`) wird gar nicht erst entpackt/gelesen.

### OneNote importieren (seit 1.3)
- über **Importieren** (siehe oben), oder .one/.onepkg-Dateien einfach auf das Fenster ziehen
  (mehrere auf einmal möglich).
- **.onepkg** (Notizbuch) → neues Notizbuch mit Abschnittsgruppen, Abschnitten,
  Reihenfolge und Farben aus dem Inhaltsverzeichnis (`Open Notebook.onetoc2`). Der
  OneNote-Papierkorb wird übersprungen. **.one** (Abschnitt) → Ziel wählbar (bestehendes
  Notizbuch/Gruppe oder neues Notizbuch „OneNote-Import“).
- Übernommen werden: Seiten mit Titel, Erstell-/Änderungsdatum, Unterseiten-Ebene;
  Textblöcke an ihrer Position (als rahmenlose Textfelder), Text mit Formatierung
  (fett, kursiv, unterstrichen, durchgestrichen, hoch/tief, Schrift, Grösse, Farbe,
  Hervorhebung, Links), Überschriften/Zitat/Code, Aufzählungen und Nummerierungen
  (verschachtelt), Aufgaben-Tags als Checkliste, andere Tags als Symbol, Tabellen (Breiten,
  Zellfarben), Bilder im Text und frei auf der Seite, Dateianhänge (als 📎-Knopf zum
  Herunterladen), **Freihand mit Farbe, Stärke, Druck und Textmarker**, OneNote-Formen
  (Linien, Pfeile, Rechtecke, Kreise, Dreiecke …) mit scharfen Ecken.
- Ersatz statt Verlust: Formeln als Text, WMF/EMF-Bilder als Anhang, unbekannte Elemente
  werden im Abschlussbericht gezählt. Passwortgeschützte Abschnitte werden mit klarer
  Meldung übersprungen. Strg+Z macht den ganzen Import rückgängig.
- **Archiv importieren (ZIP/RAR, seit 1.12):** Datei → **Importieren** (seit 1.17; vorher eigener Knopf) oder
  ZIP/RAR auf das Fenster ziehen. Ein Archiv ist meist eine **OneNote-Sicherung** (Ordnerbaum aus `.one`-Abschnitten
  und `.onetoc2` für die Reihenfolge) oder eine **KnowledgeTree-Sicherung** (`.knowledgetree.json`).
  Daraus werden **neue Notizbücher mit derselben Ordnerstruktur** (Ordner → Abschnittsgruppen, `.one`
  → Abschnitte). Erkannt werden `.one`, `.onepkg` und `.knowledgetree.json`; alles andere wird
  übersprungen und im Bericht gezählt. **ZIP** entpackt KnowledgeTree selbst (eingebauter ZIP-Leser aus
  `filepages.js`, offline; ZIP wird auch an der Signatur „PK“ erkannt, nicht nur an der Endung). **RAR**
  (auch RAR5, Signatur `Rar!\x1a\x07\x01\x00`) wird mit **`node-unrar-js`** (WASM) entpackt – bewusst
  zuerst im Hauptfenster geladen (`loadUnrar`: dynamischer `import()` von jsDelivr + `fetch` der `.wasm` als Bytes);
  seit 1.19 entpackt dann ein **eigener Modul-Worker aus einer Blob-URL** (kein Cross-Origin-Worker – der wurde
  bei der ersten libarchive.js-Variante abgelehnt: „Refused to cross-origin redirects of the top-level worker
  script“; der Blob-Worker lädt das Modul per `import()`, das ist erlaubt), sonst das Hauptfenster (siehe „Grosse
  Dateien“). Klappt das Laden nicht, kommt der Hinweis „als ZIP speichern
  (F12 für Details)“; der echte Fehler steht per `console.error` in der Konsole. **7z/TAR** gehen nicht –
  klare Meldung „als ZIP speichern“. Die Baum-Logik ist dieselbe wie beim `.onepkg`
  (`notebookFromEntries`, aus `readPackage` herausgelöst). Seit 1.19 ist das RAR-Entpacken mit dem **echten
  unrar-Code** getestet (Nachbau von node-unrar-js, `tests/rar/unrar-wasm-bauen.sh`, im Browser-Test per
  Playwright-Route statt jsDelivr).
- **Verlustfrei (seit 1.13):**
  - **Ausdrucke** („Als Ausdruck einfügen“): ein ImageNode hat zwei Quellen – `WebPictureContainer14`
    (0x200034C8 → PictureContainer14, das **PNG der Seite**) und `PictureContainer` (0x20001C3F → das
    **XPS-Druckdokument**, für alle Seiten des Ausdrucks gleich). `Model.image()` prüft zuerst 0x200034C8,
    dann 0x20001C3F, und entscheidet nach den **Magic Bytes**: browsertaugliche Bilder vor WMF/EMF, bei
    Gleichstand die grössere Fassung. Ist keine Quelle ein Bild (nur Daten, z.B. nur ein XPS), wird das
    Element als **Anhang** geführt (`asFile` → `kind:'file'`). Seitenbilder liegen untereinander wie in
    OneNote (Positionen aus `OffsetFromParent…`, ×48 px).
  - **Ausdrucke verlustfrei (1.22):** `Model.printout()` liefert zum Seitenbild das Druckdokument (`xps`), die
    Quelldatei (`src`, über 0x200035C1 → 0x80060, meist PDF), Seitennummer, Index und Kennung; der Import speichert
    sie (je Datei einmal, `printInfo`) und vermerkt sie am Bild als `im.print = { xps, src, srcExt, page, idx,
    group, flag }` (Bilder im Text: `data-kt-print`). Der OneNote-Export schreibt alles zurück. Echte Datei
    „65_Potentiometrie“: 138 Seitenbilder, 130 mit PDF, 8 mit XPS – keine Sammelseite mehr (vorher 9 Dateien).
  - **Absicherung:** `Model.used` merkt sich jeden verwendeten FileDataStore-Eintrag (alle Bild-Fassungen,
    Anhänge samt Symbolbild, Ausdruck-Dateien). Was übrig bleibt (`section().orphans`), landet im Abschnitt auf der Seite **„Nicht zugeordnete Inhalte“** (Bilder als Bild, sonst
    📎-Anhang; Endung aus der Objekt-Deklaration, `store.fileExt`). Nichts geht verloren. Normale Dateien
    (z.B. die echte Seite „22_11_15“) haben keine Reste → keine Sammelseite.
  - **Bildtext (OCR):** OneNote speichert den erkannten Text eines Bildes in `RichEditTextUnicode`
    (0x1C001C22) am ImageNode → `im.ocr` (freie Bilder) bzw. `data-ocr` (Bilder im Text); die **Suche**
    findet ihn; beim Export wird er zurückgeschrieben.
  - **Titel:** beide Kinderlisten der Seite (`StructureElementChildNodes` + `ElementChildNodes`, ohne
    Doppelte); Datum/Uhrzeit-Gliederungen werden übersprungen (KnowledgeTree zeigt das Datum selbst im
    Seitenkopf) → keine Überlappung. Ersatz, falls kein TitleNode: `CachedTitleString` aus PageMetaData.
    Seit 1.15 über `cleanTitle`: OneNote speichert dort den Seitenanfang mit **weichen Zeilenumbrüchen
    (U+000B)**, die im Browser als Kästchen erscheinen → wie OneNote die **erste nicht leere Zeile**, ohne
    Steuerzeichen. Bereits importierte Titel werden beim Laden (`normPage`) genauso bereinigt.
- **Fehlende Bilder/Anhänge (seit 1.15):** Jedes Datei-Objekt hat einen Verweis ([MS-ONESTORE] 2.5.27):
  `<ifndf>{GUID}` = im FileDataStore der Datei; `<file>Name` = in einer eigenen Datei im **Begleitordner
  „Abschnitt_onefiles“** neben der .one-Datei; `<invfdo>` = **OneNote hat keine Daten** (ungültig).
  `OneStore.fileBytes()` liefert jetzt immer einen Grund (`missing: 'invfdo'|'extern'|'fds'|'unbekannt'|…`),
  liest GUIDs tolerant (klein geschrieben, ohne Klammern, Null-Zeichen am Ende; `normGuid`), schneidet
  abgeschnittene Einträge nicht mehr ab (liest, was da ist) und sucht ein Datei-Objekt, das nicht in der
  Revision der Seite steht, in allen Revisionen (`anyObject`, Notnagel). `<file>`-Verweise werden über
  `store.external(name, ext)` aufgelöst: `OneImport.companions(liste)` sucht zuerst in
  `<Ordner>/<Abschnitt>_onefiles/`, dann in jedem `…_onefiles`-Ordner, dann irgendwo nach dem Dateinamen
  (mit/ohne Endung, `.onebin`, ohne Klammern); eine Begleitdatei mit FDSO-Kopf wird ausgepackt.
  Begleitdateien kommen aus dem **.onepkg** (CAB), aus **ZIP/RAR**, aus einem **gewählten bzw. hineingezogenen
  Ordner** (neu: **Datei → Ordner importieren**, `importFolder`/`fromFolder`, Ziehen eines Ordners auf das
  Fenster: `readDropDirs`) oder werden in der Dateiauswahl mitgewählt (`.onebin`). Was trotzdem fehlt, wird
  nicht mehr still weggelassen (vorher verschwanden fehlende Anhänge auf der Seitenebene ganz): an seiner
  Stelle steht ein kurzer Platzhalter `.kt-missing` mit `data-why` (Mindesthöhe = Bildhöhe), der
  Import-Bericht listet die fehlenden Inhalte **nach Grund mit den betroffenen Seiten** und der Abhilfe
  (Begleitordner mit importieren bzw. in OneNote **Datei → Exportieren**). `section().missing` = Liste
  `{ kind: 'Bild'|'Anhang', why, detail, external, guid, page }`.
- **Positionsgenau (seit 1.4):** Alle Elemente behalten ihre OneNote-Koordinaten (1 px =
  1/96 Zoll); nur der Titelbereich oben (56 px, `ON_TITLE_SPACE`) wird abgezogen, weil der
  Titel bei KnowledgeTree über der Fläche steht. Textfelder aus OneNote bekommen
  `style.on = 1` und `style.lh = 'normal'` → CSS-Klasse `.box.onote`: Zeilenhöhe wie OneNote
  (Schriftmetrik), keine eigenen Abstände für Überschriften/Listen/Code. Absatzformat =
  OneNote-Standardvorlage (`ON_STYLES`: Überschrift 1 = Calibri Light 16 pt #1E4E79 …),
  überschrieben durch die Werte in der Datei (auch „automatische Farbe“); Abstände vor/nach
  (`ParagraphSpaceBefore/After`, Punkte) und genauer Zeilenabstand
  (`ParagraphLineSpacingExact`) werden übernommen. Bilder im Text mit genauer Breite **und**
  Höhe. Einzüge kumulativ aus `RgOutlineIndentDistance` (Ersatz 36 px je Ebene).
- **Mit echten Dateien des Users geprüft:** Struktur, Reihenfolge, Farben, Titel, Daten,
  Tinte, Textmarker, Formen. **Nur mit nachgebauten Daten geprüft:** formatierter Text,
  Listen, Tabellen, Bilder, Tags, Anhänge (die Beispieldateien enthielten das nicht).
  **Mit der echten Seite „22_11_15“ des Users geprüft (1.5):** zwei Ausdrucke (Bilder),
  Diagramm, 275 Handschrift-Striche, YouTube-Video mit Link – die Handschrift liegt genau auf
  den Lücken der Arbeitsblätter, das Diagramm genau im Achsenkreuz.
- **Bildgrösse = Layout-Grösse** (`LayoutMaxWidth/Height`), nicht `PictureWidth/Height` (das
  ist bei Ausdrucken nur 3/4 davon, z.B. 595 statt 794 px). Ausnahme Video: sichtbar ist das
  Vorschaubild in `PictureWidth/Height` (die Layout-Grösse ist die des Players).
- **Tinte:** `0x08003411` ist **nicht** „Textmarker“ (steht auch bei normalen Stiften, vermutlich
  FitToCurve), `0x08003410` vermutlich IgnorePressure. Textmarker = Raster-Op `0x0C003413` = 9.
  **Weisse Tinte = automatische Farbe** → wird schwarz übernommen (OneNote zeigt sie auf
  hellem Grund schwarz). Importierte Striche bekommen `fit: 1` (jeder Punkt genau, keine
  Glättung/Verjüngung) und ohne Druck-Kanal `np: 1` (gleich breite Linie).

### Auswählen und Verschieben (seit 1.5)
- **Klick auf einen Link öffnet ihn** (wie OneNote); Strg+Klick setzt nur den Cursor hinein.
- **Bild-Objekte:** Ein Feld, das nur aus einem Bild besteht (`Canvas.isPictureBox`, z.B. alle
  freien Bilder aus OneNote), verhält sich wie ein Objekt: Bild ziehen = ganzes Feld verschieben,
  Pfeiltasten = 1 px (Umschalt = 10 px), Ecke = Grösse (das Feld wächst mit). Bilder **im Text**
  (z.B. Ausdrucke in einer OneNote-Gliederung) wählen per Klick das Feld aus (kein Ziehen
  innerhalb des Textes mehr). Ein ausgewähltes Bild in einem Textfeld lässt sich mit den
  Pfeiltasten verschieben (Text fliesst weiter herum).
- **Alt+Klick** wählt der Reihe nach alle Objekte an dieser Stelle (oberstes zuerst: Zeichnung →
  Textfeld/Bild → Paket → Zeichnung „hinter dem Text“); Hinweis in der Statusleiste
  „2 von 3 an dieser Stelle“. Alt+Ziehen verschiebt das gerade gewählte Objekt.
- **Tab / Umschalt+Tab** (Fokus auf der Fläche): alle Objekte der Seite in Leserichtung, holt
  das Objekt in den sichtbaren Bereich.
- Umschalt/Strg+Klick fügt Objekte (auch Zeichnungen) hinzu bzw. entfernt sie.
- Handschrift **vor einem Bild** wird beim Klick vor dem Bild getroffen (`Draw.selectDown`).

### Videos (seit 1.5)
- Online-Videos aus OneNote kommen als Vorschaubild mit **Abspielknopf**; Klick darauf (oder
  Doppelklick aufs Bild) öffnet einen Player (YouTube über `youtube-nocookie.com/embed`,
  Vimeo) mit „Im Browser öffnen“. Andere Adressen öffnen direkt im Browser.
- Daten: freies Bild `images[i].video = url`, `images[i].title`; im Text
  `<span class="kt-video" data-video="…" data-title="…"><img …><i class="kt-play"></i></span>`.
- Export: HTML/PDF → Vorschaubild ist ein Link; OneNote → wieder ein OneNote-Video.

### Exportieren (seit 1.4, Datei → Exportieren oder Rechtsklick auf Seite/Abschnitt/Notizbuch)
- Dialog mit **Format** (PDF · Webseite (HTML) · KnowledgeTree-Datei · OneNote) und **Auswahl**
  als Baum mit Kästchen (dreistufig; Seite mit Unterseiten wählt diese mit; Schnellwahl
  „Diese Seite / Dieser Abschnitt / Dieses Notizbuch / Alles / Nichts“). Letzte Einstellungen
  bleiben in `Store.ui.exportFormat/exportPaper/exportFit/exportHead/exportBg`.
- **PDF:** Seiten werden wie auf dem Bildschirm dargestellt (hell) und in einer unsichtbaren
  `iframe` gedruckt → Druckdialog „Als PDF speichern“. Papier A4/A3/Letter hoch/quer;
  Grösse „an Blattbreite anpassen“, „ganze Seite auf ein Blatt“ oder 100 %;
  Titel/Datum und Punkte/Linien wählbar. Jede KnowledgeTree-Seite beginnt auf einem neuen Blatt.
  Seit 1.22 **schneidet KnowledgeTree die Seite selbst in Blätter** (`snapshot(…, { slices })` → `sliceWorld`,
  `pdfPageHtml`): je Blatt ein Ausschnitt (`.kt-slice`, `overflow:hidden; contain:strict`, skaliert mit
  `transform: scale` statt `zoom`), darin nur die Textfelder/Striche, die hineinragen; Bilder über Objekt-URLs
  (einmal je Bild, nach dem Drucken freigegeben), Anhänge ohne Daten. Vor dem Drucken wird gewartet, bis alle
  Bilder geladen und entschlüsselt sind (bis 2 Min., vorher nur 3 s).
- **Abbrechen (1.22):** Der Fortschritt hat „Abbrechen“ (`Export.cancelled`, `checkCancel()` in `renderEach`,
  `ktImages`); abgebrochen wird ohne Download mit Meldung „Export abgebrochen“. Bei PDF in Teilen fragt
  KnowledgeTree nach jedem Teil „Weiter mit Teil k von n?“.
- **Webseite:** eine einzige HTML-Datei mit Inhaltsverzeichnis links (Notizbücher/Abschnitte/
  Seiten), Bilder und Anhänge als Daten-URL eingebettet, App-CSS eingebettet.
- **KnowledgeTree-Datei** (`*.knowledgetree.zip`, seit 1.24; bis 1.23 `*.knowledgetree.json`): dasselbe Format wie
  ein Backup (ZIP im Format des Saves-Ordners, `ktfile.js`), nur mit dem beschnittenen Baum der Auswahl; alle
  Bilder **und Anhänge** → verlustfrei. In Browser und Programm mit „Importieren“ (neue Notizbücher) oder „Backup
  laden“ (hinzufügen/ersetzen) einlesbar. Fehlende Bilder werden gezählt und gemeldet.
- **OneNote (Beta):** ein Abschnitt → `.one`, mehrere → `.onepkg` je Notizbuch (CAB ohne
  Kompression mit `Open Notebook.onetoc2` je Ordner, Abschnittsgruppen als Unterordner,
  Farben und Reihenfolge). Positionen wie in KnowledgeTree (+56 px Titelbereich). Übernommen:
  Text mit Schrift/Grösse/Farbe/fett/kursiv/unterstrichen/durchgestrichen/hoch/tief/
  Hervorhebung/Links, Überschriften, Ausrichtung, **Zeilenabstand und Absatzabstände wie in
  KnowledgeTree** (damit Tinte über dem Text passt), Listen (als • / 1. / ☐ ☑ mit Einrückung),
  Bilder (im Text und frei), Freihand mit Druck und Textmarker, Formen, **Tabellen als echte
  OneNote-Tabellen** (seit 1.8; Spaltenbreiten fest, Zellfarben, formatierte Absätze). Ersatz:
  Verbindungen, Pakete und Feldrahmen → Tinte; Formeln → LaTeX-Text (Cambria Math).
  **Anhänge seit 1.13 verlustfrei:** ein 📎-Anhang im Text wird ein echter OneNote-**Dateianhang**
  (`EmbeddedFileNode` 0x00060035 mit `EmbeddedFileContainer` 0x20001D9B → 0x00080036, Bytes im
  FileDataStore, `EmbeddedFileName`/`SourceFilepath`) als eigener Gliederungsabsatz; nur in
  Tabellenzellen bleibt „📎 Name“ als Text. Der **Bildtext (OCR)** eines Bildes geht als
  `RichEditTextUnicode` an den ImageNode zurück.
- **Rechentabellen und Diagramme (seit 1.8) ohne Datenverlust:** Eine Tabelle wird eine echte
  OneNote-Tabelle mit genau den **angezeigten Werten** (gleicher Text wie in KnowledgeTree, z.B.
  „CHF 1’234.50“, Ausrichtung, fett/kursiv, Schrift-/Füllfarbe, Kopfzeile/Bänder als Zellfarbe).
  Im selben Gliederungsblock steht danach ein **1×1-Pixel-Bild (transparent)**, dessen
  **Alternativtext** alles für den Rückimport enthält: „KnowledgeTree-Tabelle „Name“ – Formeln und
  Formate …“ + Zeile `KTDATA:{json}` mit `{kt:'sheet', v, id, dx, dy, w, style, sheet, vals}`
  (vals = angezeigte Texte). Ein Diagramm wird ein **PNG-Bild** (doppelte Auflösung, hell) mit dem
  Alternativtext „KnowledgeTree-Diagramm: Titel (Reihen)“ + `KTDATA:{kt:'chart', …, chart}`.
  Der Alternativtext ist eine dokumentierte OneNote-Eigenschaft (`ImageAltText`), unsichtbar auf der
  Seite (Bild → Alternativtext) und bleibt beim Speichern in OneNote erhalten.
- **Rückimport:** findet der Import in einer Gliederung eine Tabelle plus Träger-Bild bzw. ein
  Bild mit `KTDATA:`, entsteht wieder die Rechentabelle (Formeln, Formate, Name, Spaltenbreiten,
  Lage) bzw. das verknüpfte Diagramm (Quelle über Namen/ID wieder verbunden). **Integrität:** jede
  Zelle wird mit dem Text in OneNote verglichen; **in OneNote geänderte Zellen** werden als Wert
  übernommen (Format bleibt), in OneNote angefügte Zeilen/Spalten kommen dazu, gelöschte fallen weg
  – der Abschlussbericht zählt das („In OneNote geänderte Tabellenzellen …“). Wurde das Träger-Bild
  in OneNote gelöscht, kommt die Tabelle als normale Tabelle (Werte) im Textfeld; per Rechtsklick
  „In Rechentabelle umwandeln“ wird sie wieder rechenbar. **Rücktest:** exportierte Dateien lassen sich wieder
  importieren und sehen praktisch gleich aus. **Nicht in echtem OneNote getestet** (keine
  Möglichkeit hier) → der User soll es prüfen.

### Formeln (seit 1.4, Einfügen → Formel oder Alt+=)
- Galerie mit Vorlagen (Pythagoras, Mitternachtsformel, Binom, Ableitung, Integral, Taylor,
  Matrix, Fallunterscheidung …) und „Neue Formel einfügen …“.
- Editor wie Office: Registerkarten **Strukturen** (Bruch, hoch/tief, Wurzel, n-te Wurzel,
  Summe, Produkt, Integral, Grenzwert, Klammern, Betrag, Matrix, Vektor, Querstrich, Dach,
  Text, Fälle, Binomialkoeffizient, sin/cos/log/ln), **Griechisch**, **Operatoren**,
  **Mengen & Logik**, **Pfeile**, **Weitere**, **Vorlagen**; Eingabe als LaTeX-Teilmenge mit
  **Live-Vorschau**; □ = Platzhalter (Tab springt zum nächsten); „Eigene Zeile (zentriert)“;
  Strg+Enter fügt ein.
- Im Text als `<span class="kt-math" contenteditable="false" data-tex="…">` mit MathML;
  **Doppelklick** bearbeitet (auch „Formel entfernen“). Das MathML wird beim Darstellen
  immer aus `data-tex` neu erzeugt (`hydrateBox`), beim Einfügen aus der Zwischenablage bleibt
  die Formel erhalten (`sanitizeHtml` baut sie aus `data-tex` neu).

### Chem-Draw (seit 1.6, Zeichnen → Chemie; 1.7: Raster, Namen, Vorlagen)
Seit 1.69 ein **eingebautes Add-In** (`addon-chemdraw.js`, Register „Add-Ins“ → Häkchen „Chem-Draw“, standardmässig an);
der Editor selbst bleibt in `chem*.js` (siehe „Add-Ins 1.69“).

Eigener, selbst geschriebener Struktur-Editor (`web/js/chem.js`, `chem-layout.js`,
`chem-name.js`, `chem-db.js`; keine Bibliothek), angelehnt an ChemDraw. Dialog mit vier
Registern: Struktur zeichnen, Vorlagen & Trivialnamen, Summenformel, Periodensystem.
- **Struktur zeichnen:** Werkzeugleiste links (Auswählen, Radierer; Einfach-, Doppel-,
  Dreifachbindung, Keil, Strichkeil, Wellenlinie, Kette; Ringe 3–8 und Benzol; Ladung +/−;
  Beschriftung „A“; Atome C H N O S P F Cl Br I + Periodensystem für jedes andere Element).
  Oben Rückgängig/Wiederholen, Drehen ±15°, Spiegeln, **Aufräumen** (Zauberstab), **Raster
  anzeigen**, **Am Raster ausrichten** (Magnet), Einpassen, Vorlagen, Alles löschen; unten
  rechts Zoom (auch Mausrad), Verschieben mit mittlerer Maustaste oder Leertaste + Ziehen.
  - **Raster (seit 1.7):** Sechseck-/Dreiecksgitter mit Punkten im Abstand einer Bindung
    (Punkte bei (k·√3, m) und ((k+½)·√3, m+½) Bindungslängen, `ChemLayout.snapPt`). Darauf
    liegen alle Ecken regelmässiger Sechsringe und Zickzackketten. Mit Magnet an: neue Atome
    auf leerer Fläche, Ringmitten, Kettenstart und verschobene Atome rasten ein; Bindungen
    beim Ziehen nur in den 6 Rasterrichtungen (30°, 90°, 150° …), Ketten in 60°-Schritten;
    **Alt** = frei (ohne Magnet: 15°-Schritte). Einstellungen in `localStorage` `kt-chem-grid`.
  - **Aufräumen (seit 1.7):** `ChemLayout.relayout` ordnet die Auswahl (bzw. die ganzen
    Fragmente darin, ohne Auswahl alles) neu an wie bei den Vorlagen und setzt sie wieder an
    die alte Stelle (auf dem Raster). (R)/(S) und (E)/(Z) bleiben: vorher bestimmt, danach
    Keile neu gesetzt (`wedgeFromRS`) bzw. Seiten gespiegelt (`fixDouble`).
  - Klick auf ein Atom hängt eine Bindung in 120°-Geometrie an (Zickzack), Ziehen bestimmt
    die Richtung (Rasterrichtungen bzw. 15°, Alt = frei, auf ein Atom ziehen = verbinden), Klick auf leere
    Fläche = neue Bindung. Klick auf eine Bindung: Einfach-Werkzeug erhöht die Ordnung,
    Doppel-Werkzeug wechselt die Lage (auto/links/rechts/zentriert), Keil kehrt um.
  - Ringe: auf leere Fläche, an ein Atom (Spiro/Anhängen) oder an eine Bindung (anelliert,
    auf der freien Seite); Benzol verteilt die Doppelbindungen passend.
  - **Maus über Atom + Taste** wie ChemDraw: C N O S P F, L = Cl, B = Br, I, H; + / −
    Ladung; Enter = beschriften; Entf löscht. Über Bindung: 1/2/3, W (Keil), H (Strichkeil),
    Y (Welle), D (Lage). Rechtsklick = Menü.
  - **Doppelklick auf ein Atom** = Beschriftung: Element mit Ladung (`Na+`, `O-`, `Fe2+`) oder
    **Kurzschreibweise** (OH, SH, NH2, NHMe, NMe2, NO2, CN, COOH, CO2H, COO-, CHO, CONH2,
    COOMe, COCl, Me, Et, Pr, iPr, Bu, tBu, Ph, Bn, Ac, OMe, OEt, OAc, OPh, CF3, CCl3, SO3H,
    NH3+, Ts, OTs, Boc, TMS, Vinyl …). Kommt die Bindung von rechts, wird gespiegelt
    geschrieben (HO, H₂N, HOOC). Die Kurzschreibweisen werden für die Berechnung über ein
    Mini-SMILES (`CHEM_ABBR`) in echte Atome aufgelöst.
  - Doppelklick-Erkennung selbst gebaut (`Chem.onDown`, 450 ms / 6 px): das native
    `dblclick` fällt aus, weil der erste Klick die Grafik neu aufbaut; was der erste Klick
    angehängt hat, wird beim Doppelklick wieder entfernt.
- **Name (seit 1.7), oben in der Seitenleiste:** IUPAC-Name, automatisch erzeugt (Deutsch oder
  Englisch umschaltbar), in einem Textfeld **änderbar** (gilt dann als eigener Name der
  Struktur, „↺ automatisch“ nimmt wieder den erzeugten); sind Atome markiert, steht dort der
  **Name des markierten Teils** (abgeschnittene Bindungen = H). Darunter der **Trivialname**,
  wenn die Struktur in der Datenbank steht (mit passender Stereo-Form, sonst Grundname; bei
  Spiegelbild L↔D). „Als Text einfügen“ schreibt den Namen in die Seite; Option „Name unter
  die Struktur“ setzt ihn ins Bild (umbrochen). Steht in der Datenbank ein IUPAC-Name, hat er
  Vorrang (deutsch). Mehrere Teile werden einzeln benannt („Natriumethanoat“ bei Salzen).
- **Automatisch rechts in der Seitenleiste:** Summenformel (Hill-Schreibweise, mit Ladung,
  bei Salzen auch die Teile), **Molare Masse** (seit 1.7 überall mit 3 Nachkommastellen;
  Atommassen mit 3 Stellen wie im Schul-PSE, z.B. Cl 35.453, S 32.065), exakte (monoisotopische) Masse,
  Elementaranalyse (Massenprozente), **chirale C-Atome** (Anzahl, max. 2ⁿ Stereoisomere,
  (R)/(S) sobald am Zentrum ein Keil/Strichkeil beginnt), **E/Z** an Doppelbindungen,
  Warnung bei zu vielen Bindungen (rot gestrichelt). Anzeige-Optionen: * markieren, (R)/(S),
  (E)/(Z), Atome farbig, C-Atome beschriften, Formel & Masse unter die Struktur
  (gespeichert in `localStorage` `kt-chem-opts`, pro Struktur in `im.chem.opts`).
- **Vorlagen & Trivialnamen (seit 1.7):** `CHEM_DB` mit rund 250 Molekülen in 13 Kategorien
  (Kohlenwasserstoffe, Halogenverbindungen, Alkohole & Ether, Carbonylverbindungen, Säuren &
  Derivate, Stickstoffverbindungen, Heterocyclen, alle 20 Aminosäuren (L), Kohlenhydrate,
  Naturstoffe & Biomoleküle, Arzneistoffe, Farbstoffe & Indikatoren, Anorganisch & Ionen) als
  SMILES (mit Stereo), dazu Stichworte und wo nötig der IUPAC-Name. Suche über Name, Stichwort
  und IUPAC-Name, Kategorie-Chips, Karten mit Strukturbild (erst beim Sichtbarwerden gezeichnet),
  Summenformel und Molarer Masse. Klick fügt die Vorlage rechts neben die bestehende Zeichnung
  ein (ausgewählt, zum Verschieben). Erkennung gezeichneter Strukturen über
  `ChemMatch.key` (Farbverfeinerung wie Weisfeiler-Lehman, Konstitution) plus Stereo-Signatur
  (Anzahl R/S und E/Z).
- **Summenformel:** Eingabe wie `C6H12O6`, `Ca(OH)2`, `CuSO4·5H2O`, `[Fe(CN)6]4-`, `SO4^2-`,
  `NH4+`, `Fe3+`, auch Unicode (C₆H₁₂O₆, SO₄²⁻) und Deuterium `D`; Vorschau, Molare Masse,
  exakte Masse, Hill-Form, Massenanteile; Periodensystem-Tastatur + Klammer/Ziffern-Knöpfe.
  Reaktionsgleichungen (`2 H2 + O2 -> 2 H2O`, `<=>`, Zustände `(aq)`) werden formatiert.
  „Formel einfügen“ schreibt formatierten Text (mit `<sub>`/`<sup>`, optional „(M = … g/mol)“)
  an die Schreibmarke bzw. in ein neues Feld.
- **Periodensystem:** alle 118 Elemente (deutsche Namen, Atommasse, Kategorie-Farben,
  Elektronegativität wo gut belegt), Details per Klick, „Als Atom zeichnen“, „In
  Summenformel“, „Symbol einfügen“.
- **Menüband Zeichnen → Chemie:** „Chem-Draw“ (gross), „Summenformel“ (formatiert markierten
  Text direkt, z.B. eine ganze Reaktionsgleichung; ohne Markierung öffnet sich der Rechner),
  „Periodensystem“.
- **In der Seite:** die Struktur wird ein **SVG-Bild** (`Backend.saveImage`, Bondlänge 30 px)
  in einem eng anliegenden Feld (oder als Bild im gerade bearbeiteten Textfeld). Die Struktur
  selbst liegt im Bild-Objekt: `im.chem = {v, mol: {a: [[id, el, x, y, q, ab]], b: [[id, a, b,
  o, s, ds]]}, opts, nw, nh, f (Formel), m (Masse), n (Name im Bild), name (von Hand geändert)}`. **Doppelklick** auf das Bild (oder
  Rechtsklick → „Struktur bearbeiten“) öffnet den Editor wieder; „Übernehmen“ ersetzt das
  Bild und behält den Massstab (`im.w / nw`). Im dunklen Design wird das Bild invertiert
  (`.fimg.is-chem`). Für den OneNote-Export wird das SVG als PNG (doppelte Auflösung, weiss
  hinterlegt) gerastert.
- **Chemie-Logik (`ChemMol`):** implizite H nach Standardvalenzen inkl. Ladung; Stereozentren
  = sp³-C mit vier konstitutionell verschiedenen Substituenten (Vergleich über „abgewickelte“
  Bäume ohne Rückschritt, Kennungen werden interniert → exakt, keine Hash-Kollisionen);
  (R)/(S) über CIP-Regel 1a (hierarchischer Digraph mit Duplikat-Atomen, Sphäre für Sphäre)
  und Vorzeichen der Determinante aus den 2D-Lagen + Keil-Richtung (implizites H gegenüber).
  Geprüft u.a. an Cholesterin (8), Testosteron (6), Glucopyranose (5), Glucose offen (4),
  Menthol (3), Penicillin-Kern (3), Campher (2), 1,2-/1,4-Dimethylcyclohexan (2/0),
  Pentan-3-ol (0); (R)/(S) an 2-Butanol, Alanin, Glycerinaldehyd und allen 20 Aminosäuren
  (SMILES → Keile → CIP: alle S, Cystein R, Threonin 2S,3R, Isoleucin 2S,3S) sowie Glucose,
  Menthol. Grenzen: nur Regel 1a (Isotope, Regeln 3–5 nicht), keine Ring-cis/trans-
  Stereogenität (z.B. Inosit).
- **SMILES und 2D-Anordnung (`chem-layout.js`, seit 1.7):** `ChemSmiles.parse` (Atome,
  Klammeratome mit H/Ladung/@/@@, aromatisch, Ringschlüsse %nn, /\ für E/Z, Punkt-Trennung),
  `kekulize` (Doppelbindungen in aromatischen Ringen per Rückverfolgung), `toMol` (+ explizite
  H nur, wo die Klammer mehr H angibt als die Standardvalenz). `ChemRings.sssr` = kleinster
  Ringsatz (Horton-Kandidaten + Gauss-Elimination über GF(2)), `systems` = Ringsysteme.
  `ChemLayout.place`: grösstes Ringsystem als regelmässige Vielecke (anelliert über die
  gemeinsame Kante, Spiro nach aussen, mehrere gemeinsame Atome als Bogen; verbrückt: zuerst
  der grosse Umfangsring, Brücke quer), sonst längste Kette als Zickzack; dann
  Breitensuche (120°-Geometrie, Zickzack „anti“, sp linear, quartäre C als Kreuz, Ringlücken
  meiden), Ringsysteme an Substituenten werden passend gedreht/gespiegelt angehängt;
  Überlappungen durch Spiegeln von Ästen an Einfachbindungen (`untangle`); Lage in
  60°-Schritten (bleibt auf dem Raster), möglichst breit. Keile: `wedgeFromParity` ('@' ⇔
  Determinante < 0 in SMILES-Nachbarreihenfolge), bei Ringverknüpfungen mit implizitem H wird
  ein H-Atom mit Keil angelegt (Steroide).
- **IUPAC-Namen (`chem-name.js`, seit 1.7):** `ChemName.of(mol, {lang, ids})`, Klasse
  `ChemNamer`. Substitutive Nomenklatur nach den Regeln 2013: Hauptgruppe (Rang: -oat-Anion,
  -aminium, Säure, Sulfonsäure, Ester, Säurehalogenid, Amid, Nitril, Aldehyd, Keton,
  Alkohol, Thiol, Amin), Stammsystem (meiste Hauptgruppen; Ring vor Kette; N-Heterocyclus,
  Heterocyclus, mehr Ringe, mehr Atome; Kette: länger, mehr Mehrfach-, mehr Doppelbindungen),
  Nummerierung (Lokantenregeln: angezeigter H, Hauptgruppe, Hydro/en/in, alle Präfixe,
  alphabetisch erster Präfix), Präfixe alphabetisch mit di/tri bzw. bis/tris, Klammern
  ( ) [ ] { } verschachtelt, Lokanten weglassen bei Methan/Ethan/symmetrischen Ringen mit
  einem Substituenten bzw. bei voller Substitution. Säuren an Ringen/Ketten als
  „-carbonsäure“, Ester „Methylethanoat“, Amide/Amine mit N-Präfixen, Ionen, Salze.
  Retained: Benzol, Phenol, Anilin, Benzoesäure, Benzaldehyd, Benzonitril, Benzamid, Acetyl,
  Benzoyl, tert-Butyl, Benzyl, Anilino, Acetamido; Alkoxy-Kurzformen. Ringsysteme mit fester
  Nummerierung (`CHEM_RING_TPL`: Naphthalin, Inden, Azulen, Fluoren, Anthracen, Phenanthren,
  Pyridin, Pyrrol, Furan, Thiophen, Imidazol, Pyrazol, Oxazole, Thiazole, Pyrimidin, Pyrazin,
  Pyridazin, Triazin, Pyran, Indol, Isoindol, Benzofuran, Benzothiophen, Benzimidazol, Chinolin,
  Isochinolin, Chinoxalin, Chinazolin, Chromen, Purin, Carbazol, Acridin; gesättigt:
  Pyrrolidin, Piperidin, Piperazin, Morpholin, Imidazolidin, Oxolan, Oxan, Thiolan, Thian,
  Oxiran, Aziridin, Oxetan, Azetidin, 1,4-Dioxan, 1,3-Dioxolan, Azepan) über
  Graph-Isomorphie; angezeigter Wasserstoff (1H-Inden), Hydro-Präfixe (2,3-Dihydro-1H-indol)
  und hinzugefügter Wasserstoff (Pyrimidin-2,4(1H,3H)-dion, 3,4-Dihydronaphthalin-1(2H)-on).
  Deutsch: erster Buchstabe gross (kursive Vorsilben, Lokanten, „1H-“ übersprungen), Endungen
  -an/-en/-in, -säure, -carbonsäure, Chlor/Brom/Iod; Englisch: e-Elision, „ethanoic acid“,
  „ethyl ethanoate“. **Nicht unterstützt** (dann Meldung, ggf. Trivialname aus der Datenbank):
  andere kondensierte/verbrückte Ringsysteme (Steroide, Pyren), Harnstoff-/Kohlensäure-
  derivate, Anhydride, Azo-, Sulfoxid-, Nitrat-Gruppen, Elemente ausser C H N O S Hal.
  Testlisten in `tests/chem/` (deutsch, englisch, Ringe; ~285 Moleküle, alle richtig):
  `node tests/chem/namen-test.js tests/chem/namen-de-1.txt` (Englisch: zusätzlich `en`).

### Chem-Draw → Darstellungen (seit 1.28, `web/js/chem-models.js`)
- **1.49 – realistische 3D-Konformationen** (`embed`): Ringe (`rings`, kleinste bis 8 Atome); gesättigte gerade
  Ringe starten als **Sessel** (Ringatome abwechselnd ±0,25 Å, zweifarbig über alle Ringbindungen – Decalin = zwei
  Sessel), ungerade als Briefumschlag; an Ring-sp³-Atomen ein H **axial**, alles andere **äquatorial** (grosse Reste
  äquatorial); sp²-/Aromatenringe werden jede Runde in die beste Ebene projiziert (Newell); 1-4-Mindestabstände an
  sp³–sp³-Einfachbindungen ⇒ **gestaffelt**. Ergebnis: Cyclohexan-Torsionen ±61°, Benzol 0°, Cyclopentan-Umschlag,
  Methyl äquatorial, Butan gestaffelt. Startansicht bei gefalteten Ringen: von der Seite (Achse C1–C4 waagrecht, 16°
  von oben, 18° gedreht), damit man den Sessel sieht.
- **1.49 – Lewis bearbeitbar:** die H sind eigene Elemente (`lewis()` liefert `hpos`, im Editor `E.hpos`, Treffer
  `{ t: 'h' }`): Maus darüber = Markierung + Hinweis; Radierer/Entf = **H entfernen** (Atom-Eigenschaft `hd` = Anzahl
  entfernter H → Radikal bzw. Elektronenmangel); Element-Werkzeug/Taste (Cl, O, N …) = **H ersetzen** (neues Atom in
  Richtung dieses H); Bindung/Kette vom H aus ziehen/klicken = von seinem Atom aus in diese Richtung; Rechtsklick =
  entfernen, ersetzen durch Cl/Br/F/I/OH/NH₂/CH₃, „Entfernte H wiederherstellen“.
- **1.49 – Regeln** (`ChemModels.rules`, Seitenleiste): Oktettregel (2. Periode, > 8 Elektronen) mit Vorschlag der
  Formalladung (N mit 4 Bindungen → N⁺), Radikale, Elektronenmangel (Sextett), Hückel (4n+2 π = aromatisch, 4n =
  antiaromatisch; freie Paare von N/O im Ring zählen 2, exocyclische Doppelbindung 0).
- Rechts oben in der Zeichenfläche: **Keil/Strich · Lewis · Bohr · Orbitale · 3D** (`Chem.opts.model`, wird mit dem
  Bild gespeichert und beim Öffnen wiederhergestellt; neue Strukturen beginnen in einer bearbeitbaren Darstellung).
  Keil/Strich und Lewis lassen sich bearbeiten, Bohr und Orbitale nur ansehen (Ziehen = verschieben), 3D wird mit der
  Maus gedreht (`opts.rot3d`, Drehmatrix). Werkzeuge sind dann ausgegraut, unten steht ein Hinweis.
  `ChemRender.draw` leitet an `ChemModels.draw` weiter – Editor, Einpassen und das Bild für die Seite nutzen dieselbe
  Zeichnung; die Bildunterschrift (Name, Summenformel, Molare Masse) kommt aus `ChemRender.caption`.
- Grundlage `ChemModels.full(m)`: alle Atome (Kurzschreibweisen wie COOH aufgelöst und angeordnet) und alle H
  (in den freien Richtungen); je Atom Valenzelektronen (äusserste Schale aus der Konfiguration, mit Ladung),
  Bindungen, **freie Paare = (Valenz − Bindungen)/2**, Radikal, π-Bindungen, **Hybridisierung** aus der sterischen
  Zahl (σ-Nachbarn + freie Paare: 4 sp³, 3 sp², 2 sp). `config(el, q)`: Aufbau-Regel mit Ausnahmen (Cr, Cu, Mo, Ag,
  Au, Pd, La …), Kationen geben die äussersten Elektronen ab, Anionen füllen auf; `configText` („[He] 2s² 2p⁴“),
  `shells` (K, L, M …).
- **Lewis:** alle Atome beschriftet, Bindungsstriche (Doppel/Dreifach parallel), freie Paare als Striche (Option:
  Punkte), Radikale als Punkt, Ladungen umkreist.
- **Bohr:** jedes Atom mit Kern (Symbol, Ladung) und Schalen; innere Schalen gleichmässig besetzt, aussen die
  freien Elektronen (paarweise) in den freien Richtungen, **gemeinsame Elektronenpaare in der Überlappung** der
  äussersten Schalen (Farbe violett, eigene blau, Legende). Der Abstand wird so vergrössert, dass gebundene Atome
  sich mit der äussersten Schale überlappen.
- **Orbitale:** Hybridorbitale als Keulen entlang der σ-Bindungen (mit kleiner Gegenkeule), s-Orbitale der H, freie
  Paare als eigene Keulen mit ↑↓, p-Orbitale der π-Bindungen oben/unten (zweites π quer), gestrichelt die
  π-Überlappung; Hybridisierung klein am Atom. Darunter (abschaltbar) die **Kästchenschreibweise** je Element
  (Hund: erst einzeln ↑, dann ↓; lange Konfigurationen nur die Valenzschale) und die **Orbitalformen** der besetzten
  Typen (s, pₓ, pᵧ, p_z, d). Die Seitenleiste zeigt dazu die Konfiguration jedes Elements.
- **3D:** `embed`: Startwerte aus der Zeichnung (1 Bindung = 1,5 Å), Keil +z, Strichkeil −z, H am Stereozentrum auf
  die Gegenseite, kleine Auslenkung nur bei sp³; dann 600 Schritte „Federn“ (positionsbasiert): Bindungslängen aus
  Kovalenzradien (Doppel −0,2, Dreifach −0,34 Å), Winkel über 1-3-Abstände (109,5/120/180°), Abstossung nicht
  benachbarter Atome, sp²-Zentren in die Ebene ihrer Nachbarn. Darstellung als SVG (Perspektive, Kugeln mit
  Glanz, nach Tiefe sortiert): **Kugel-Stab**, **Kalotten** (van-der-Waals-Radien), **Elektronenwolke**
  (durchscheinende Kugeln, rot = viele Elektronen δ−, blau = wenige δ+; Partialladungen vereinfacht aus der
  Elektronegativität der Partner + Formalladung, Legende). Auf der Seite landet die aktuelle Ansicht als Bild.
- **3D seit 1.52 (wie MolView):** weitere Stile **Stäbe** und **Draht**; **Messen** (Knopf, dann Atome im Modell
  anklicken – Ziehen dreht weiter): 2 Atome = Abstand in Å, 3 = Bindungswinkel, 4 = Diederwinkel, orange markiert
  und angeschrieben (`opts.meas3d`, `ChemProps.measure`, Trefferpunkte `pts3` aus `three`); **Drehen** (Animation),
  **Bild speichern** (PNG, dreifache Auflösung).

### Chem-Draw → Analyse & Spektren (seit 1.52, `web/js/chem-props.js`, Register „Analyse & Spektren“)
Vorbilder: ChemDraw (Analysis, Chemical Properties, Predict NMR), MolView (Informationen, Spektren, 3D), die
Spektren-Darstellung des NIST WebBook. **Alles wird lokal aus der Zeichnung berechnet** – keine Daten aus fremden
Datenbanken.
- **Kennzahlen:** exakte Masse, Doppelbindungsäquivalente, Ringe/aromatisch, H-Brücken-Donoren (H an N/O) und
  -Akzeptoren (N, O), drehbare Bindungen (nicht im Ring, nicht an C≡, keine Amidbindung), **TPSA** nach Ertl
  (Beiträge der N/O-Typen), **logP-Schätzung** mit einem eigenen Atombeitrags-Modell (angepasst an 73 bekannte
  Messwerte, `tests/chem/logp-anpassen.js`, mittlerer Fehler 0,27), **Lipinski-Regel**.
- **Funktionelle Gruppen** (Chips): Alkohol prim./sek./tert., Phenol, Enol, Ether, Aldehyd, Keton, Carbonsäure,
  Carboxylat, Ester, Anhydrid, Amid, Säurehalogenid, Amine prim./sek./tert., aromatisches Amin, Ammonium, Imin,
  Nitril, Nitro, Halogenalkan/-aromat, Thiol, Thioether, Sulfon(säure), Alken, Alkin, Aromat, Heteroaromat.
- **Spektren (Schätzungen für den Unterricht):** **IR** – typische Banden der Gruppen als Kurve (Lorentz-Senken,
  4000–400 cm⁻¹) mit Tabelle; **Massenspektrum** – Molekül-Ion mit **Isotopenmuster exakt** aus den natürlichen
  Isotopenhäufigkeiten (CH₂Cl₂ 84:86:88 = 100:64:10, Brombenzol 156/158 ≈ 1:1) und gestrichelt typische
  EI-Bruchstücke (−CH₃, −H₂O, 77, 91, 105, 43 …); **¹H-NMR** – chemisch gleichwertige H (Morgan-Klassen, Aromat-
  Bindungen gleichwertig), Verschiebung nach Inkrementen, Aufspaltung n+1 (gleichwertige Nachbarn koppeln nicht),
  Höhe ~ Anzahl H, OH/NH breit; **¹³C-NMR** – ein Signal je Gruppe gleichwertiger C, Tabellenwerte und Grant-Paul.
  „Spektrum als Bild einfügen“.
- **Austausch:** SMILES (Kekulé, ohne Stereo) anzeigen/kopieren, **Molfile (MDL V2000)** speichern/kopieren und
  **laden** (Text oder .mol-Datei, ebenso SMILES) – ersetzt die Zeichnung, Strg+Z holt sie zurück. „Kennzahlen als
  Text einfügen“. Einfügen der Struktur geht auch aus diesem Register.
- **Sicherheitsdaten: GESTIS-Stoffdatenbank (IFA/DGUV)** – Knopf „In GESTIS öffnen“ (auch in der Seitenleiste
  „GESTIS (Sicherheit)“). Nur **verlinkt**, keine Daten übernommen (IFA: Verlinken erwünscht über die Startseite
  `https://www.dguv.de/ifa/stoffdatenbank/` oder das Stoffblatt `https://gestis.dguv.de/data?name=<ZVG, 6-stellig>`,
  englisch `gestis-database.dguv.de`). Einen Such-Link gibt es nicht: ohne ZVG-Nummer öffnet die Startseite und der
  Name liegt in der Zwischenablage; trägt man die ZVG-Nummer ein, merkt sie sich das Programm je Stoffname
  (`Store.ui.gestisZvg`) und verlinkt künftig direkt.
- **Nachtrag 1.53:**
  - **Spektren zoomen:** Mausrad (um den Zeiger), Bereich mit der Maus ziehen, zwei Finger, Knöpfe − + ◀ ▶ „↺ ganzes
    Spektrum“, Umschalt+Mausrad verschiebt, Doppelklick = alles; **Höhe ×1 … ×20** (kleine Isotopenpeaks). Die
    SVG-Diagramme bekommen einen Ausschnitt `{x0, x1}` und tragen `data-x0/x1/l/r/w` zum Umrechnen. ¹H mit J = 7 Hz bei
    400 MHz – hineinzoomen zeigt die einzelnen Linien eines Multipletts (Beschriftung dann mit δ). MS eng gezoomt: exakte
    Masse und % je Peak.
  - **Reiter IR | Massenspektrum | NMR**, daneben grosses Auswahlfeld **Kern** (¹H, ¹³C, ¹⁹F, ³¹P, ¹⁵N; Kerne, die im
    Molekül fehlen, sind markiert). Gewählter Reiter und Kern werden gemerkt (`Chem.opts.specKind`, `opts.nmrNuc`,
    Standard ¹H). Neue Schätzungen `ChemProps.nmrX`: ¹⁹F (Bezug CFCl₃: CF₃–C=O −76,5, Ar–F −113, Ar–CF₃ −63, PF₆⁻ −72,
    BF₄⁻ −151 …), ³¹P (85 % H₃PO₄: Phosphat 0, Diester −1, ATP α/γ −10 und β −21, Phosphoramidit 149,
    Chlorphosphoramidit 180, Phosphit 140, PPh₃ −6, R₃P=O 30, Phosphonium 23, PyBOP 44, PF₆⁻ −144, PCl₃ 219 …),
    ¹⁵N (flüssiges NH₃: Amine 25–35, Anilin 55, Amid 120, Harnstoff 80, Carbamat 85, Nitril 240, Pyridin 310, Nitro 370 …).
  - **Export:** „PNG speichern“ (doppelte Auflösung), „SVG speichern“, „In die Seite einfügen“ – immer der aktuelle
    Ausschnitt, weisser Grund, Titel „Stoff – Spektrum (berechnet)“ (`ChemProps.standalone`).
  - **GESTIS je Molekül:** Stoffliste der DGUV (ZVG/CAS/Name, Excel – vom IFA zum Verlinken angeboten) mit
    „1. Stoffliste herunterladen“ holen und mit „2. Liste laden …“ einlesen (eigener XLSX-Leser: `unzip` + XML; Kopfzeile
    mit „ZVG“ und „CAS“/„Name“). Gespeichert wird nur Name/CAS → ZVG im Browser-Speicher (`kt-gestis-list`). Danach
    öffnet der Knopf direkt das Stoffblatt `https://gestis.dguv.de/data?name=<ZVG>`; gesucht wird über Trivialname,
    weitere Namen und IUPAC-Namen („Dimethylformamid“ findet „N,N-Dimethylformamid“). Selbst eingetragene ZVG-Nummer
    hat Vorrang. Die Liste selbst liefert das Programm nicht mit (Fallstrick 134).
  - **H entfernen setzt eine Ladung** (`Chem.removeH(a, mode)`): Klick/Entf/Menü „H⁺ abspalten (Proton)“ → Atom wird
    negativ (R–OH → R–O⁻, CH₄ → CH₃⁻), „H⁻ abspalten (Hydrid)“ → positiv (CH₄ → CH₃⁺), „H· abspalten (Radikal)“ →
    Radikal-Punkt • (auch in Keil/Strich gezeichnet). Geht es als Ion nicht (H-Zahl würde nicht kleiner), wird es ein
    Radikal. „Wiederherstellen“ nimmt die Ladung zurück (`a.hq`). Ältere Zeichnungen mit entfernten H ohne Ladung
    werden beim Öffnen bzw. beim Wechsel der Darstellung umgestellt (`chargeOldH`). Entfernte H/Radikale werden jetzt
    auch im Bild-Objekt gespeichert (7. Feld in `pack`).
  - **Datenbank +68 Vorlagen**, zwei neue Kategorien: *Peptid- & Oligosynthese* (DCC/DCU, DIC/DIU, EDC/EDC·HCl/EDU,
    CDI, HOBt, HOAt, Oxyma, NHS, HBTU, TBTU, HATU, PyBOP, Tetramethylharnstoff, DMAP, DIPEA, NMM, NMP, TFA, DCA, TCA,
    TIS, EDT, Fmoc-Cl, Boc₂O, DMT-Cl, Chlorphosphoramidit, Tetrazol, ETT) und *Nukleoside & Nukleotide* (A, G, C, U, I,
    dA, dG, dC, dT, AMP, ATP, cAMP, dTMP, d(TpT), 5′-DMT-dT, DMT-dT-Phosphoramidit, Bz-dA, 2′-O-Me-U, 5-Methylcytosin);
    Aminosäuren ergänzt (β-Alanin, Sarcosin, Ornithin, Citrullin, Hydroxyprolin, Selenocystein, Taurin, Gly-Gly,
    Glutathion, Aspartam, H-Gly-OMe, Boc-/Fmoc-/Z-geschützte Gly/Ala, Ac-Gly). Summenformeln und R/S der Zucker geprüft
    (`tests/chem/datenbank-test.js`). Hypervalente Anionen (PF₆⁻, SiF₆²⁻) gelten nicht mehr als Valenzfehler.
- **Nachtrag 1.54 – Reaktionen und mehrere Moleküle (`chem.js`):**
  - **Mehrere Moleküle** auf einer Zeichnung: jedes zusammenhängende Stück ist ein Molekül (`ChemRender.fragments`).
    Name, Formel, Masse, Analyse und GESTIS gelten nur für das **ausgewählte** Molekül (`Chem.focus()`: Auswahl, sonst
    das einzige Molekül; Klick auf ein Atom/eine Bindung wählt das Molekül wie in OneNote/ChemDraw). Seitenleiste:
    Liste aller Moleküle (anklickbar), Beschriftung (Name/Formel unter dem Molekül) **je Molekül** ein-/ausschaltbar
    (Flags `cn`/`ci` am Atom mit der kleinsten id, in `pack` als Zusatzfeld), eigener Name je Molekül (`nm`).
  - **Reaktionsschema-Objekte** (`E.mol.objs`, gespeichert als `o`): Pfeile (→, ⇌ Gleichgewicht, ⇒ Retrosynthese,
    ↔ Mesomerie, ✕ keine Reaktion) mit Text darüber/darunter (Reagenzien, Bedingungen – Doppelklick), **Elektronen-
    Pfeile** (gebogen, Elektronenpaar ↷ und Einzelelektron ⇀ halbe Spitze; Anfang/Ende hängen an Atom oder Bindung und
    wandern mit), „+“, freier Text, Übergangszustand ‡, freie Elektronenpaare, Radikal, δ+/δ−. Werkzeuge im Abschnitt
    „Reaktion“/„Elektronen“ der Werkzeugleiste und im Menüband **Zeichnen → Reaktion** (`chemTool`), Knöpfe „Stufe →“
    (Pfeil rechts vom Schema, Dialog für Reagenzien) und „+“. Auswählen, Verschieben, Rechteck-Auswahl, Löschen,
    Rückgängig gelten auch für Objekte.
  - **Kopieren/Einfügen:** Strg+C/X/V/D (auch Kontextmenü) – intern mit Objekten (`kt-chem-clip`), nach aussen als
    SMILES; Einfügen nimmt auch SMILES oder Molfile aus der Zwischenablage. Eingefügtes wird versetzt und ausgewählt.
- **Nachtrag 1.55 – Spektren genauer und übersichtlicher** (Quellen: Pretsch/Silverstein-Tabellen, Curphy–Morrison,
  wiredchemist.com (¹³C-Benzol-Inkremente), Uni Boulder und Cengage (IR-Tabellen), Reusch/organicchemistrydata.org
  (EI-Fragmentierung und Beispielspektren); Messwerte in CDCl₃ wie SDBS):
  - **NMR-Darstellung:** jedes Signal bekommt einen **Buchstaben** (a = höchste Verschiebung); Beschriftung oben in
    eigener Zeile, **ohne Überlappung verteilt** (`ChemProps.spreadLabels`, bei Platzmangel zwei Zeilen), Zeile 1
    „a · 2H“, Zeile 2 „4.12 q“ (gezoomt mit J). **Zuordnungs-Striche** Beschriftung → Peak (Standard an, Schalter
    „Striche“, `opts.nmrLead`), **Integral** standardmässig aus (Schalter „Integral“, `opts.nmrInt`) – beide gemerkt.
    Tabelle mit Buchstaben, daneben das **Strukturbild mit den Buchstaben an den Atomen** (`ChemProps.assignSvg`).
    ¹³C: quartäre C kleiner (kein NOE).
  - **¹H genauer:** sp³-H aus Basiswerten CH₃/CH₂/CH 0,88/1,25/1,55 + α-Inkrementen je Nachbar-Typ (`xType`:
    Aryl, Alken, C=O-Arten, OH, OR, OAr, O–C=O, N-Arten, NO₂, Halogene, S …, Tabellen `ALPHA_H`/`BETA_H`), mehrere
    α-Substituenten abnehmend (1 / 0,8 / 0,45; Acetal 0,55), Ringgrösse; Formyl-H nach Art (DMF 8,05, Benzaldehyd
    9,97), Alkin-H nach Konjugation; Aromaten-Inkremente ergänzt (C≡C, CF₃, COCl, N⁺). **Amid-Rotation:** zwei gleiche
    Reste am Amid-N (DMF) geben zwei Signale. **Kopplungen:** Heteroaromaten (Pyridin 4,9/7,7, Furan 1,8/3,4,
    Thiophen 4,9/3,5 …), CHO–CH₂ 1,8 / CHO–CH₃ 2,9, **¹H–¹⁹F** (geminal 47, vicinal 22, Aromat ortho 8,8/meta 5,5) und
    **¹H–³¹P** (²J 13, ³J POCH 7) ohne Dacheffekt. Mittlerer Fehler gegen 52 Stoffe: **0,07 ppm** (vorher 0,16).
  - **¹³C neu** (`nmrC`): sp³-C nach Grant–Paul über Abstände (α/β/γ/δ), Heteroatome und Gruppen-C mit eigenen
    Beiträgen (`C13_X`), Verzweigungs- und Ringkorrekturen; Aromaten mit vollständiger ipso/ortho/meta/para-Tabelle
    (`C13_ARO`), Naphthalin/Pyridin/Furan/Thiophen/Pyrrol-Grundwerte; Alkene mit α/β/γ- und Gruppen-Inkrementen
    (`C13_ENE`); C=O nach Art, Konjugation und α-Verzweigung (`c13Carbonyl`). Mittlerer Fehler gegen 55 Stoffe:
    **0,65 ppm** (vorher 3,9) – geprüft mit `tests/chem/nmr-referenz.js` (inkl. nicht angepasster Kontrollstoffe).
  - **IR neu** (`ir`): jede Carbonylgruppe einzeln (Art, Ringgrösse, Konjugation, Aryl-/Vinylester, α-Halogen,
    Formamid), C–H getrennt nach CH₃/CH₂, Aldehyd-Fermi-Dublett, Alkene nach Substitution (Vinyl 990/910,
    1,1-disubst. 890, trans 965, cis 700) und Enolether, Alkine (terminal/intern), Nitrile (konjugiert 2228),
    Fingerprint-Kennbanden (C–O nach Alkohol-/Ether-/Ester-Art, C–N, NO₂, SO₂, S=O, P=O, C–F/CF₃, C–Cl/Br/I, Si–CH₃,
    gem-Dimethyl, (CH₂)ₙ 720) und das **Substitutionsmuster des Benzols** aus den benachbarten Ring-H (mono 750+700,
    ortho 750, meta 780+690, para 820, isoliert 880). Die Tabellenbanden gelten jetzt auch im Fingerprint; die
    berechneten Normalschwingungen liefern dort mit halbem Gewicht die Feinstruktur. Beschriftung ohne Überdeckung,
    höchstens 9 Kennbanden. 17 Carbonyl-Lagen und weitere Banden in `analyse-test.js` (±15 cm⁻¹).
  - **MS neu** (`msSim`): jedes Ion trägt seine Struktur (Atome, gebrochene Bindungen, Ladungsort, H-Verschiebungen,
    Bindungsordnungen, Vorläufer, Neutralverlust). Neue Wege: Acylium vom Benzoyl-Typ, Formyl-Kation schwach,
    Halogenalkan −HX, Ester-Alkoholteil −Alken, Phenole −CO, Aryl-methylether −CH₂O, Nitroaromaten −NO₂/−NO,
    **Retro-Diels-Alder**, gesättigte Ringe −C₂H₄, Folgezerfälle (Acylium −CO, Iminium/Oxonium −Alken, Alkyl −H₂,
    Phenyl −C₂H₂). **Bruchstücke als Strukturen:** Karten mit dem ganzen Molekül (Bruchstück orange hinterlegt,
    Bruchstelle rot gezackt) und dem Ion in eckigen Klammern mit ⁺ bzw. ⁺·; Klick auf Karte oder Peak zeigt die
    **Abbruchfolge** M⁺· → … → Ion mit den abgespaltenen Teilen (`ChemProps.msChain`, `Chem.msFragView`).
- **Nachtrag 1.58 – Abkömmlinge erkennen** (`ChemDB.derivative`): findet die Datenbank keinen genauen Treffer, werden
  bis zu zwei kleine Reste an O/N abgelöst (Methyl … tert-Butyl, Benzyl, Acetyl, Benzoyl, Formyl, Boc, Z, Fmoc) bzw.
  Salz-Gegenionen und Ladungen entfernt, bis ein Eintrag passt. Name aus dem Grundstoff: „Salicylsäure-ethylester“,
  „Boc-Alanin-methylester“, „N-Methyl-4-Aminophenol“, „N-Acetyl-Phenylalanin“, „Anilin (Hydrochlorid)“,
  „Benzoesäure (Natriumsalz)“. `ChemDB.find(m, { exact: true })` nur genaue Treffer (z. B. „käuflich“ im Planer).
- **Nachtrag 1.55 – Datenbank:** rund 300 weitere Vorlagen (618 statt 317): Kohlenwasserstoffe (Adamantan, Decalin,
  Stilben, Pinen …), Halogenverbindungen (Benzylbromid, Per, Lindan …), Lösungsmittel (DME, 2-Me-THF, THP, HFIP,
  Sulfolan, DMAc …), Carbonyle (Campher, Benzil, Chalkon, Anthrachinon, Ninhydrin …), Säuren/Ester/Amide/Anhydride/
  Sulfonsäuren (TsOH, MsCl, TfOH, NBS …), Amine/Nitrile/Basen (DABCO, DBU, TMEDA, AIBN …), Heterocyclen, Zuckeralkohole,
  Naturstoffe (Carvon, Curcumin, Chinin, Morphin, β-Carotin, Vitamine B3/B6/B7 …), Arzneistoffe (Ketoprofen,
  Ciprofloxacin, Omeprazol, Warfarin, Nifedipin …), Farbstoffe (Fluorescein, Kristallviolett, Methylrot …),
  Anorganika (Soda, Natron, Ozon, Lachgas, PCl₅ …). Jede Summenformel geprüft, keine doppelte Struktur.
- **Nachtrag 1.54 – Spektren:**
  - **¹H-NMR 1. Ordnung, hochaufgelöst:** Protonensätze nach Symmetrie (chemisch äquivalent = ein Signal);
    **einzigartige** H: diastereotope CH₂ neben einem Stereozentrum, die zwei H einer =CH₂ (cis/trans aus der
    2D-Lage). Verschiebung nach Inkrementen (Shoolery, Aromaten-Substituenten ortho/meta/para, Alkene nach Pascual).
    Kopplung je Nachbargruppe mit eigenem J (vicinal 7, cis 10,5, trans 17, geminal 1,5/14, Aryl ortho 7,8/meta 1,8,
    Aldehyd 2,8, allylisch 6,5 Hz; J innerhalb ±1 Hz zusammengefasst) → dd, dt, ddd …; Linien aus `lines(s, MHz)` mit
    **Dacheffekt** (Faktor 1 ± J/√(Δν² + J²), Linien zum Partner hin höher). Kurve aus Lorentz-Linien (0,8 Hz, breit
    15 Hz), grünes Integral, Spektrometer-Frequenz wählbar (60–900 MHz, Standard 600, `opts.nmrMHz`); Tabelle mit J und
    „einzigartig“ / „n chemisch äquivalente H“.
  - **IR-Fingerprint berechnet** (`ChemProps.irModes`): Normalschwingungen des 3D-Modells mit einfachem Valenzkraftfeld
    (Streck-, Biege-, oop- und Torsionskonstanten), numerische B-Matrix, massengewichtete Hesse-Matrix, Jacobi-
    Eigenwerte, ν = 1302,8·√λ; Intensität aus Bindungsdipolen (EN-Differenz), Zuordnung nach Energieanteilen. Über
    1500 cm⁻¹ bleiben die Tabellenbanden, darunter die berechneten Moden (`irHybrid`, Übergang 1450–1550); bis 70 Atome.
  - **Massenspektrum simuliert** (`ChemProps.msSim`): EI-Bruchstücke aus allen Einfachbindungen ausserhalb von Ringen,
    Ladung beim stabileren Kation (α-Spaltung O/N → Oxonium/Iminium, Acylium, benzylisch → Tropylium 91, allylisch,
    tertiär; Vinyl-/Heteroatom-Kationen und CH₃·-Verlust ungünstig, grösserer Rest geht bevorzugt), Umlagerungen
    (McLafferty, H₂O, α-H·, Keten −42 bei Aryl-Acetaten/Acetaniliden, ortho-Effekt −18, Acylium −CO, Phenyl 77). Höhe
    = e^Stabilität, Basispeak 100 %, jedes Ion mit eigenem Isotopenmuster. Molekül-Ion blau, Bruchstücke orange, Tabelle
    mit Formel und Erklärung. Prüfwerte: Ethanol 31, Toluol 91, Propylamin 30, 2-Pentanon 43/58, Ethylacetat 43,
    Paracetamol 109, Aspirin 120/138, tert-Butanol 59 (M⁺ fehlt). Die alte Hinweisliste (`fragments`) ist Rückfall.

### Chem-Draw → Planen (Syntheseplanung, seit 1.56; `chem-rxn.js` Regeln/Suche, `chem-plan.js` Oberfläche)
- **Umschalter „Zeichnen | Planen“** oben in der Seitenleiste von „Struktur zeichnen“ (`opts.mode`, gemerkt). Planen
  macht die Seitenleiste breiter (440 px) und zeigt die Planung; Zeichenfläche und Werkzeuge bleiben unverändert.
- **Aufgabe wird erkannt** (`ChemPlan.task`): Reaktionspfeil (→) mit Molekül links und rechts → „Weg: Edukt → Produkt“
  (ausgewählter Pfeil zuerst); sonst ausgewähltes bzw. einziges Molekül → „Synthesewege zum Ziel“.
- **Einstellungen** (gemerkt): Stufen 1–4, „nur empfohlene“, Zielmenge in mmol/mol (höchstens 10 mol).
- **Ergebnis**: Wege als Karten (Stufenzahl, ★-Bewertung, „mild“/„mit Vorbehalt“, Ausgangsstoffe, „✓ Edukt“ bzw.
  Ähnlichkeit). Ein Weg geöffnet: je Stufe Bild Edukte → Produkt, Abzeichen (empfohlen / Katalysator / sehr giftig /
  extreme Bedingungen / pyrophor), Auswahlfeld **Reaktion** (andere Zerlegungen desselben Produkts), Felder
  **Lösungsmittel / Temperatur / Zeit** (editierbar), **Mengen-Tabelle** (Äq., mmol, g bzw. mL – von der Zielmenge
  rückwärts über typische Ausbeuten), je Edukt **weiter zerlegen / als Ausgangsstoff / aus Zeichnung** (ausgewähltes
  Molekül übernehmen, Stufe wird „von Hand geändert“), Aufarbeitung und Hinweise. Knöpfe **Schema in die Zeichnung**
  (A + B → C → … mit Pfeiltexten Reagenzien / Lösungsmittel, Temperatur), **Als Text einfügen** (Vorschrift-Gerüst je
  Stufe mit Mengen), **In Reaxys suchen**, **SMILES kopieren**.
- **Regelwerk** (`ChemRxn.RULES`, ~45 Retro-Regeln als kleine Funktionen `find(ctx)` / `apply(ctx, Treffer)` →
  Edukte, Reagenzien mit Äq. und Rolle, Bedingungen, Hinweise, flags): Ester (Säurechlorid, Steglich, Fischer,
  Alkylierung), Acetylierung mit Ac₂O, Amide (Säurechlorid, EDC/HOBt, HATU), Säurechlorid aus Säure, Schutzgruppen
  Boc/Cbz/Fmoc, Williamson, Alkohole (NaBH₄, Grignard, LiAlH₄), Oxidationen (DMP, PCC, Swern, Pinnick, Jones, KMnO₄),
  Friedel–Crafts, Claisen–Schmidt, Säuren (Verseifung, Grignard + CO₂, Nitril-Hydrolyse), Amine (reduktive Aminierung,
  N-Alkylierung, Gabriel, Nitro-Reduktion, Amid-Reduktion), Sulfonamide, Alkene (HWE, Wittig, Dehydratisierung, Heck),
  Suzuki, Sonogashira, Nitrierung, Halogenierung, Halogenalkane, Nitrile, Diels–Alder, Epoxid, Diol, Acetal, Imin,
  Hydrierung. flags: metal, toxic, extreme, pyro → „vorgeschlagen, nicht empfohlen“ (Bewertung × 0,55).
- **Bewertung/Suche**: Stufe = Zuverlässigkeit × Empfehlung × Verträglichkeit (z. B. Grignard neben OH/C=O) ×
  Ausgewogenheit; Ausgangsstoff = Vorlagen-Datenbank oder klein/einfach (`startInfo`). Strahlsuche (Breite 10, je
  Knoten 7 Zerlegungen, Zeitbudget 2,5 s). Weg A → B: Suche vom Produkt, das Edukt-ähnlichste Edukt wird weiter
  zerlegt, auch wenn es käuflich wäre; Treffer = Edukt-Schlüssel erreicht (`ChemMatch.key`).
- **Gruppen (1.56)**: Strg+G / Strg+Umschalt+G (auch Knopf in der Molekülliste); `grp` an Atomen/Objekten; Klick
  wählt die Gruppe, Ziehen bewegt sie; übereinanderliegende Moleküle: das Ausgewählte liegt oben, Alt+Klick wählt das
  darunter; beim Ziehen verschmilzt nichts.
- **Analyse (1.56)**: Kern/MHz nur im Reiter NMR; MS-Bruchstücke im Auswahlfeld mit Namen („m/z 105 · Benzoyl-Kation
  · C₇H₅O⁺“), Vorschau (Molekül mit Bruchstelle | Ion) und Abbruchfolge; **„In die Zeichnung“** zeichnet das Ion mit
  Ladung (q), Radikal (rad) und richtiger H-Zahl (hd) rechts neben die Struktur.

- **Nachtrag 1.57 – Toxikologie/Ökologie:** jede Stufe bekommt eine grobe Gefahren-Einstufung (`ChemRxn.hazard`):
  Reagenzien aus `RXN_HAZ` ([Gesundheit, Umwelt, Hinweis] 0–3 nach GHS-H-Sätzen, gewichtet nach Äquivalenten,
  katalytische Mengen gering) und Lösungsmittel nach dem CHEM21-Leitfaden (`RXN_SOLV`; bei „A oder B“ zählt die
  günstigere Wahl). green = e^(−0,15·Summe) fliesst in die Bewertung ein (× 0,55 + 0,45·green) – so steht z. B. bei
  Ethylacetat die Fischer-Veresterung vor DCC/DMAP. Abzeichen „Tox/Öko: grün / mittel / bedenklich“ mit Begründung
  im Tooltip. Nur zum Vergleichen, keine Sicherheitsbewertung.

### Chem-Draw-Fenster (seit 1.57)
- Grösse an rechtem/unterem Rand oder der Ecke ziehen (das Fenster bleibt mittig), Knopf **⛶ gross/normal**, Knopf
  **◧ neben der Seite**: Chem-Draw wird rechts angedockt (volle Höhe), `#app` wird um die Breite schmaler
  (`body.chem-docked`, CSS-Variable `--chem-dock-w`), die Seite bleibt daneben voll bedienbar (kein Abdunkeln).
  Breite am linken Rand ziehen (420 px … 85 %). Alles gemerkt in `localStorage` `kt-chem-win` (nicht in den
  Bild-Optionen). Schmale Zeichenfläche: Darstellungs-Umschalter rutscht nach unten (Container-Abfrage). Handy: aus.

- **Nachtrag 1.58 – Leisten und Bildschirmgrössen:** zwischen Werkzeugen, Zeichenfläche und Seitenleiste je ein
  Trennstrich (`.chem-sash`): ziehen = Breite (Werkzeuge 52–300 px, Spalten passen sich an; Seitenleiste 180 px bis
  55 % der Fensterbreite, im Planen-Modus eigene Breite), Pfeil-Knopf oder Doppelklick = zu-/aufklappen; ganz
  zusammengeschoben klappt die Werkzeugleiste zu. Gemerkt in `kt-chem-win` (tl, sr, sp, sh, tc, sc). Handy hochkant:
  Werkzeuge oben, Seitenleiste unten – Trennstriche waagrecht (Höhe der Seitenleiste ziehen). Fenster-Mindestgrösse
  nie grösser als der Bildschirm; bei jeder Fenstergrösse werden Fenster und Leisten neu angepasst; Register-Leiste
  scrollt statt umzubrechen. Geprüft auf 1400×900, 760×520, Tablet 1024×768, iPhone hoch und quer.

### Tabs und geteilte Bereiche – Nachtrag 1.59: im inaktiven Bereich direkt arbeiten
- **Fläche ziehen** in der Vorschau mit mittlerer Maustaste oder Leertaste + Ziehen (`Panes.previewPan`) – ohne
  Bereichswechsel, wie Mausrad/Strg+Rad (gab es schon). Sichtbereich wird gemerkt, verlässt man den aufgenommenen
  Bereich, wird die Vorschau neu aufgenommen.
- **Klick durchreichen auch für „click“**: nach dem durchgereichten Drücken schickt der Browser selbst keinen Klick
  (das gedrückte Element war die ersetzte Vorschau) – ohne Bewegung (≤ 5 px) wird beim Loslassen ein Klick an das
  Element unter dem Zeiger geschickt (Links, Checkliste, Anhang, Video). Kommt doch ein echter Klick, entfällt er.
- **Aktiver Bereich dezent markiert**, sobald geteilt ist (`#panes.pn-multi`): 2 px Akzentlinie oben, feiner Rahmen.
- Tastatur und Menüband gehören automatisch zum aktiven (zuletzt angeklickten) Bereich – es gibt nur eine Zeichenfläche.

### Bilder verlustfrei verkleinern (1.59, `imgpack.js`)
- Beim Einfügen (nie beim Laden): PNG/BMP → verlustfreies WebP, nur wenn ≥ 10 % kleiner und **Pixel für Pixel gleich**
  (zurücklesen und vergleichen). Ausgeschlossen: Transparenz (vormultipliziertes Alpha der Zeichenfläche), 16 Bit,
  Farbprofile/Gamma (iCCP, gAMA, cHRM, cICP, sBIT), APNG, > 16 MP. JPEG/GIF/SVG/Videos bleiben, Office-Pakete nie
  angefasst. Gleiche Dateien liegen ohnehin nur einmal (SHA-1-Namen). OneNote-Export wandelt WebP wieder in PNG.

### Office-Dateien als Seiten (1.60, `ooxml.js` + `office.js`) – „wie in Obsidian“
- **Seite = Datei:** `page.type` = 'dok' | 'tab' | 'folie' (fehlt = Freiform), `page.office = { asset, fmt, name, size,
  at, tpl }`. Die Datei liegt **unverändert** (Byte für Byte) als Asset (SHA-1-Name) im Notizbuch → geht mit Backup,
  KnowledgeTree-Datei, HTML-Export und als 📎-Anhang auch nach OneNote mit. Rechentabellen und Diagramme bleiben
  eigene Funktionen (Excel-Blätter werden zusätzlich als Rechentabellen gezeigt).
- **Wie kommt eine Office-Seite zustande:** „Datei → Importieren“ bzw. Datei in die **Navigation** ziehen → neue Seite
  im aktuellen Abschnitt (Titel = Dateiname). Auf die **Seite** gezogen bleibt es ein 📎-Anhang wie bisher;
  Rechtsklick auf den Anhang → **„Als Office-Seite öffnen“**. Zusammen mit OneNote-Dateien gewählt bleiben es
  Begleitdateien.
- **Seiteninhalt (alles gesperrt, Vorschau):** oben die Datei-Karte (Format, 📎-Link = Original speichern, Grösse).
  Word: Absätze, Überschriften (h1–h3), fett/kursiv/unterstrichen/Farbe, Listen, Tabellen (colspan), Links, Bilder in
  der Reihenfolge des Textes, Kopf-/Fusszeile als Hinweis. Excel: jedes Blatt eine Rechentabelle (Werte, Text,
  Formeln als „=…“, rechnen auch blattübergreifend; Kopfzeile erkannt), Hinweis auf Diagramme/verbundene Zellen.
  PowerPoint: je Folie ein Rahmen (Form, Ebene „unten“, Hintergrundfarbe aus Folie → Layout → Master), Textfelder an
  ihrer Lage (Platzhalter ohne eigene Lage aus Layout/Master; Gruppen umgerechnet; Standardgrössen 44/40/28/24/18 pt),
  Bilder (als „vor die Zeichnungen“), Tabellen, Diagramm/SmartArt/OLE als 🔒-Platzhalter, Notizen rechts daneben.
  Bilder der Vorschau sind eigene KT-Bilder (verlustfrei verkleinert); die Datei selbst bleibt unberührt.
  Daneben ist es eine normale Seite (eigene Notizen, Verbindungen, Freihand, Suche, Seitenlinks). Navigation zeigt
  📄/📊/📽 vor dem Titel.
- **Export:** neues Format **„Office-Datei“**: eine Seite → ihre Datei (byte-gleich), mehrere → ZIP (gespeichert,
  nicht neu gepackt); Seiten ohne Datei werden übersprungen (Hinweis). Als eigenständige KnowledgeTree-Seite: Format
  „KnowledgeTree-Datei“ (enthält das Original mit). OneNote/HTML/PDF wie jede Seite.
- **Ungetestet:** Microsoft Office selbst (geprüft mit python-docx/-pptx, openpyxl, LibreOffice headless).

### Office-Seiten wie die Programme (1.65) – `office-view.js`, Register in `ribbon.js`
- **Die Seite ist die Datei.** Oben nur noch eine schmale Zeile „📄 Word-Dokument · Original: 📎 name · Grösse“
  (die 📎-Verknüpfung bleibt für OneNote/HTML), Seitenhintergrund ruhig (`p.bg = 'keiner'`, Grau bzw. Dunkelgrau).
- **Word:** Papier im Format der Datei (`p.office.pg` in Twips aus `w:sectPr`, `pg0` = Original), weisse Blätter als
  Hintergrund-Felder (`ox.k='blatt'`, gemeinsames weisses Bild `p.office.white`), so viele wie der Text braucht.
  Der Text **fliesst** in Dokumentreihenfolge (`p.office.map`): `OfficeView.flow` setzt in `Canvas.layout` (nach dem
  Messen) x/Breite auf den Satzspiegel und y untereinander; ändert sich etwas, zeichnet die Fläche einmal neu.
  Kopf-/Fusszeile grau im Rand (`ox.k='hf'`). Felder ohne Rahmen (`style.under = #fff`). Seitenumbruch = `<hr>` im
  Text ↔ `<w:br w:type="page"/>`; Strg+Enter. Bilder im Text (b.images eines Textfelds) → Bild-Absätze dahinter.
  Seite einrichten schreibt `w:pgSz`/`w:pgMar` (Querformat: `w:orient`). Statusleiste „Seite x von n · Wörter“.
- **Excel:** alle Blätter an derselben Stelle, nur `p.office.cur` sichtbar (`.box.off` über `OfficeView.hidden` in
  `updateBox`), Raster mindestens 40 Zeilen × 12 Spalten, Name im Feldkopf ausgeblendet. **Blattregister unten**
  (`.ofv-sheets`): Klick = Blatt (+ Zelle A1 aktiv), Doppelklick = umbenennen, + = neues Blatt (Umsch+F11),
  Rechtsklick = Einfügen/Umbenennen/Löschen. Export (`syncSheets`): neue Blätter → worksheet-Teil + `<sheet>`,
  gelöschte → entfernt (nicht, wenn die Mappe blattbezogene Namen hat), Namen und Reihenfolge wie die Register,
  calcChain dann entfernt.
- **PowerPoint:** links die **Folienübersicht** (`.ofv-slides`, Miniaturen über `Show.render(f, p)`, neu nur wenn sich
  eine Signatur der Folien ändert), Klick = Folie passend zeigen (`OfficePpt.focusSlide`), Rechtsklick = Folien-Menü,
  „+ Neue Folie“; aktuelle Folie markiert (über `Canvas.applyView` → `OfficeView.onView`). Entwurf → Hintergrund
  formatieren (`f.ox.bgNew` → `<p:bg>`), Foliengrösse 4:3/16:9 (Inhalte waagrecht angepasst, `p:sldSz`).
  Strg+M = neue Folie. Statusleiste „Folie x von n“.
- **Menüband je Seitentyp** (`Ribbon.mode` = 'frei' | 'dok' | 'tab' | 'folie', `TABS_MODE`, Registerleiste wird beim
  Wechsel neu gebaut, Akzentfarbe Word blau / Excel grün / PowerPoint orange):
  Word: Datei · Start · Einfügen · Zeichnen · **Layout** · Überprüfen · Ansicht; Excel: Datei · Start · Einfügen ·
  Zeichnen · **Formeln** · **Daten** · Überprüfen · Ansicht (+ Diagramm); PowerPoint: Datei · Start · Einfügen · Zeichnen ·
  **Entwurf** · **Bildschirmpräsentation** · Überprüfen · Ansicht. Gruppen heissen wie im Original (Zwischenablage,
  Schriftart, Absatz, Formatvorlagen, Bearbeiten; Seiten/Tabellen/Illustrationen/Links/Text/Symbole; Seite einrichten;
  Funktionsbibliothek; Sortieren und Filtern; Folien; Zeichnung; Anpassen; Monitore …). Bestehende Gruppen werden
  über `Ribbon.baseGroups(id, [[alt, neu]])` aus den Freiform-Registern übernommen (gleiche Befehle).
  Datei-Fenster: „Speichern unter …“, „Original speichern“, „Drucken / PDF“, „Neu einlesen“, „Vorführen“; Datei → Neu
  mit Word/Excel/PowerPoint.
- **Neue Seite als Word/Excel/PowerPoint:** + der Tableiste (Klick = neue leere Seite in neuem Tab – bis 1.64 war es
  die Kopie des Tabs –, 450 ms darüber halten = Auswahl, Rechtsklick = Auswahl + bisherige Tab-Einträge), gleiches
  Verhalten am Neue-Seite-Knopf der Seitenliste (`OfficePages.attachTypeMenu`), Abschnitt-Rechtsklick „Neue Seite als …“.

### Suche oben und Office-Objekte 1.75 (`tellme.js`, `office-objects.js`)
- **Suche oben wie in Office/OneNote** („Was möchten Sie tun?“, Titelleiste, **Alt+Q**; in allen Programmen –
  KnowledgeTree/Freiform, Word, Excel, PowerPoint – und mit den Registern der Add-Ins). Beim Tippen eine Liste:
  **Aktionen** (jeder Knopf des Menübands mit Register › Gruppe; auch die **Einträge der Menüs ▾**, z. B. „Zielwertsuche“
  unter Daten › Was-wäre-wenn), **Datei** (Informationen, Öffnen, Speichern, Exportieren, Drucken, Hilfe, Optionen),
  **Einstellungen** (jede Zeile/jedes Häkchen der Einstellungen – öffnet die Einstellungen auf der Seite, die Zeile ist
  hervorgehoben), **Seiten** (Titel), zuletzt „… im Notizbuch suchen“. Pfeiltasten + Enter, Klick, Esc; Enter ohne
  Auswahl sucht wie bisher im Inhalt. Nicht mögliche Befehle sind grau. Index: die Register werden je Programm einmal
  ohne Anzeige aufgebaut, Menüs „trocken“ geöffnet (`UI.menu/showPopup/dialog/prompt/info` nur mitgeschrieben – siehe
  Fallstrick 229); Einstellungen über `Settings.index()` (`Settings.show(null, { collect })` baut die Seiten ohne
  Fenster; `Settings.show(cat, { find })` hebt hervor).
- **Diagramme** (`OfficeObj.chart`): Säulen/Balken (gruppiert/gestapelt), Linie, Fläche, Kreis, Ring, Punkte; Titel,
  Achsentitel, Legende, Datenbeschriftungen, Werte aus dem Cache der Datei → KnowledgeTree-Diagramm (`Chart`, immer hell
  auf Office-Seiten). **Word** (in der Zeile → nach dem Absatz, verankert → an seiner Stelle), **PowerPoint** (statt
  Platzhalter), **Excel** (an der Zelle; mit **Bezug auf das Blatt**, wenn die Reihen einen Block bilden – dann live wie
  ein eigenes Diagramm: Zelle ändern → Diagramm ändert sich; geprüft, dass der Bereich dieselben Reihen ergibt).
- **Gruppen, Zeichenbereiche, SmartArt** (`OfficeObj.groupHtml/smartArtHtml`): Formen an ihrer Stelle mit Füllung
  (auch Designfarben mit Helligkeit), Rahmen, abgerundet/Ellipse, Drehung, Text (Word-Textfelder formatiert) und Bildern
  (eingebrannt wie 1.74); SmartArt aus der von Office gespeicherten Zeichnung (`diagrams/drawingN.xml` über
  `dsp:dataModelExt`), sonst als Liste der Texte. Word und PowerPoint; Excel-Formen mit Text und Gruppen ebenso.
- **Word**: Bilder in **Tabellenzellen** (Tabelle als gesperrtes Feld mit `<img data-kt-src>`), **Fuss- und Endnoten**
  (Nummer im Text 1, 2 … bzw. i, ii … als Verweis, Notentext am Ende des Dokuments unter „Fussnoten“/„Endnoten“, Klick
  springt hin), **Bilder in Kopf-/Fusszeile** (Logo, auf jedem Blatt), **Textfelder in der Höhe aus Word**.
- **PowerPoint**: Bilder mit **Zuschnitt, Drehung, Spiegeln, EXIF** (wie Word 1.74); Verschieben/Grösse ändern
  schreibt weiter in die Datei (bei 90° gedrehten Bildern Breite/Höhe getauscht).
- **Excel**: **Bilder** (gedreht/zugeschnitten), **Diagramme**, **Formen mit Text** aus der Zeichnung des Blatts an ihrer
  Zelle (`twoCellAnchor`/`oneCellAnchor`/`absoluteAnchor`), Grösse folgt den Spaltenbreiten (`OfficeView.flowXl`), nur
  auf ihrem Blatt sichtbar; Blatt löschen löscht sie mit. Die Datei behält alles unverändert (Anzeige).

### Word-Import wie Word und Seitenansicht 1.74 (`office-wordimport.js`, `office-reader.js`)
Ausgangslage (Meldung des Users): Inhaltsverzeichnisse kamen als graue, gesperrte Zeile ohne Verknüpfungen; Bilder
gedreht, zu gross (Breite bis 680 px statt Textbreite ~605 px) oder zu klein (VML: natürliche Pixel), Formatierung
(Grösse, Schrift, Abstände) fehlte, alle Seiten verschoben (ganze Absätze rückten auf die nächste Seite, Abstände
fehlten, Seitenumbrüche im Absatz wurden ignoriert); Textfelder fehlten oder kamen doppelt (Choice + Fallback); die
Webseite war eine lange Fläche.
- **Formatvorlagen** (`OfficeWI.styles/para/run`): docDefaults → Kette der Absatzvorlage (`basedOn`) → direkte
  Formatierung; Läufe zusätzlich Zeichenvorlage (`rStyle`). Designschriften aus `theme1.xml` (major/minor). Als Inline-Stil:
  Absatz `font-size`, `font-family` (nur wenn ≠ Grundschrift, Ersatzschriften Carlito/Liberation), Farbe, fett/kursiv,
  `padding-top/bottom` (Abstand vor/nach – Padding, weil Word die Abstände addiert und CSS-Ränder zusammenfallen),
  `line-height` (automatisch: Faktor × 1,22 bei Calibri/Aptos, sonst 1,15; genau/mindestens in pt), `padding-left` +
  `text-indent` (Einzug, erste Zeile/hängend), `text-align`, Schattierung, `break-before:page`. Läufe nur Abweichungen
  vom Absatz (Grösse, Schrift, Farbe, Hervorhebung, hoch/tief, durch/unter/kursiv/fett), ausgeblendeter Text fehlt,
  Feldbefehle fehlen (nur das Ergebnis). Überschriften h1–h6 (Titel = h1) ohne eigene CSS-Abstände (`.box.owb`).
  Nummerierte Listen als `<ol>` (numFmt aus numbering.xml). Grundschrift als `--kt-wbase` (`applyDesign`).
  `SAFE_STYLES` (util.js) kennt dafür jetzt `padding-*`, `text-indent`, `break-before`; Tabellen/Zellen `width`;
  Links `#Textmarke`.
- **Inhaltsverzeichnis** (`ox.k = 'wtoc'`): erkannt als Inhaltssteuerelement (`docPartGallery` „Table of Contents“ bzw.
  TOC-Feld darin) oder als TOC-Feld über mehrere Absätze (bis zum passenden `fldChar end`). Einträge: Ebene aus
  „toc N“/„Verzeichnis N“, Text vor dem letzten Tabulator, Ziel aus `w:hyperlink w:anchor` bzw. `PAGEREF`. Darstellung:
  Text · Füllpunkte (Flex) · Seitenzahl; die Seitenzahl rechnet die Ansicht nach jedem Fluss neu (`tocPages`, aus
  `office.bm` → Absatz → Lage). Klick (auch Verweise `#…` im Text, `Canvas` Link-Klick) → `OfficeWI.jump`. Das XML
  bleibt unverändert (Word aktualisiert seine Felder selbst).
- **Bilder** (`OfficeWI.picture`): Grösse aus `wp:extent` bzw. VML-Stil (pt/in/cm), höchstens Textbreite. Drehung
  (`a:xfrm rot`), Spiegeln, Zuschnitt (`a:srcRect`, VML `crop*`) werden in ein neues Bild gezeichnet (Auflösung des
  Originals, bis 4096 px); EXIF: `createImageBitmap` mit und ohne Ausrichtung – es gilt die, deren Seitenverhältnis zum
  Rahmen passt. Ohne Änderung bleibt das Original (wie bisher). EMF/WMF: Platzhalter in der Grösse.
  Lage: in der Zeile → Float links/Mitte/rechts nach der Absatzausrichtung; verankert mit Umfliessen (`wrapSquare/
  Tight/Through`) → Float an `positionH` (Spalte/Rand/Seite, Ausrichtung) und `positionV` (Absatz); oben/unten →
  Float über die ganze Breite (`im.blk`, `renderFloats`); ohne Umbruch (vor/hinter dem Text) → eigenes Feld `wfl`
  (z = 1 bzw. `front`), am Absatz bzw. am Blatt ausgerichtet (`OfficeView.flow`). Der Absatztext bleibt beim Bild.
- **Textfelder** (`wps:txbx`, VML `v:textbox`; `mc:Fallback` und Inhalte von Textfeldern werden übersprungen): eigenes
  gesperrtes Feld mit Füllung/Rahmen aus `spPr` bzw. VML, Inhalt formatiert; verankert → `wfl` an der Stelle aus
  Word plus unsichtbarer Platzhalter-Float (`im.ghost`, damit der Absatztext es umfliesst); in der Zeile → `wfb` nach
  dem Absatz. Formen ohne Text: Rechteck mit Füllung/Rahmen; Diagramme/SmartArt/Gruppen: Platzhalter mit Hinweis.
- **Tabellen**: `vMerge` → `rowspan`, `gridSpan` → `colspan`, Zellschattierung, Breiten aus `tblW`/`tcW`/Raster (pt).
- **Seitenumbrüche und Fluss** (`OfficeView.flow/paginate`): Seitenumbruch oberhalb (`pageBreakBefore`, auch aus der
  Vorlage), Umbruch am Absatzende (`w:br type=page` nach dem Text) und Abschnittswechsel (`sectPr` im Absatz, ausser
  „fortlaufend“) → `break-before:page` am nächsten Absatz bzw. `ox.brk` am nächsten Feld. **Absätze werden wie in
  Word über die Seitengrenze geteilt:** in jedem Textfeld liegen unsichtbare, volle Breite einnehmende Floats
  (`.pg-fl > .pg-gap`) genau über der Lücke zwischen zwei Blättern (Rand unten + Abstand + Rand oben) – die Zeilen
  weichen aus. Tabellen rücken ganz weiter, Tabellen länger als ein Blatt bekommen keine Lücke. Überschriften am
  Seitenende gehen mit dem nächsten Absatz (auch über Feldgrenzen). Bild-Absätze rücken als Ganzes. Felder schliessen
  ohne Zwischenraum an (`y = b.y + h − 22`: Kopfleiste 13 px + Innenabstand unten 9 px). Ergebnis Testdatei: 8 Seiten
  wie LibreOffice, Seitenzahlen im Verzeichnis gleich.
- **Seitenansicht** (`OfficeReader`, Ansicht → Seitenansicht / „Mehrere Seiten“, Statusleiste): jede Seite ist ein
  Ausschnitt der fertig umbrochenen Fläche (Kopie von `#world` ohne Blätter; Felder mit `data-y0/y1`, Absätze mit
  `data-pg`, Textmarken `data-kbm`) – deshalb exakt dieselben Zeilen und Umbrüche. Eine Seite / zwei Seiten / mehrere
  (so viele wie in die Breite passen), Zoom (Breite, ganze Seite, ±, Strg+Mausrad), Seite x von n, Miniaturen, Suche
  (Treffer x/n, markiert), Verweise und Inhaltsverzeichnis springen, Drucken (jede Seite ein Blatt in Papiergrösse),
  Tasten Bild↑/↓, Pos1/Ende, ←/→ (2/mehrere), Strg+F/P/+/−/0, Esc. Nur Seiten in der Nähe werden gezeichnet
  (IntersectionObserver), entfernte geleert. `Store.ui.wordPages`.
- **Webseite**: Exportieren → Webseite zeigt Word-Seiten mit derselben Seitenansicht (`ktReader` als Text in der Datei,
  Bilder eingebettet bzw. geteilt über `KTI`); „Speichern unter → Webseite (*.html)“ einer Word-Seite ebenso
  (`Export.docHtml`), „Webseite, gefiltert (*.htm)“ = der bisherige Text-Export.

### Office-Konzept 1.73 (`office-ui.js`; Grundlage: PDF des Users „Office – Funktionen & Struktur“)
Leitidee aus dem Konzept: alle drei Programme teilen **eine Bedienlogik** (Menüband → Gruppen → Befehle,
Kontextregister nur bei passender Markierung, Backstage, Schnellzugriff, Statusleiste mit Ansichten, gemeinsame
Designs) und unterscheiden sich in der **Grundeinheit** (Word: Absatz im Fluss, Excel: Zelle, PowerPoint: Objekt auf
der Folie). Umgesetzt – übersichtlicher und mit mehr Funktionen:
- **Excel-Start wie Excel** (bisher eine Mischung aus Freiform-Tabelle und Excel): Zwischenablage · **Schriftart**
  (Schriftart- und Schriftgrad-Feld für die Zellen, grösser/kleiner in Excel-Schritten, F K U abc, Rahmen ▾ mit
  „Weitere Rahmen …“, Füllfarbe, Schriftfarbe) · **Ausrichtung** (oben/Mitte/unten, links/zentriert/rechts, Einzug −/+,
  Zeilenumbruch, Verbinden und zentrieren ▾, Zellen formatieren) · Zahl · **Formatvorlagen** (nur noch Bedingte
  Formatierung, Als Tabelle formatieren, Zellenformatvorlagen) · **Zellen** (Einfügen ▾, Löschen ▾, Format ▾ statt sechs
  kleiner Knöpfe) · **Bearbeiten** (AutoSumme ▾, Füllbereich ▾ unten/rechts, Löschen ▾, Sortieren und Filtern ▾,
  Suchen und Auswählen ▾). **Entfernt**, weil sie nie in die .xlsx gingen und nur verwirrten: Kopfzeile, Gebänderte
  Zeilen, Tabellenfarbe (Freiform-Tabellen haben sie weiter; „Als Tabelle formatieren“ ersetzt sie), doppelte
  „Löschen“, „Umbenennen“ (steht unter Format ▾ und am Blattregister), „Funktion“ (Register Formeln, AutoSumme ▾).
  Schrift: `OfficeXT.cellFont/grow` (Befehle `font/size/grow/shrink` wirken auf Excel-Zellen; `fn` wird jetzt auch
  geschrieben), Einzug `xlIndent`.
- **Kontextregister „Tabellenlayout“** (Word, PowerPoint, Freiform – erscheint, wenn die Schreibmarke in einer Tabelle im
  Text steht, `OfficeUI.inTable`): darüber/darunter/links/rechts einfügen, Zeile/Spalte/Tabelle löschen, mit rechter
  Zelle verbinden, teilen, Kopfzeile (th), Zeilen nach der Spalte sortieren. Word Einfügen → „Text in Tabelle“.
- **Schnellzugriff** (wie Office): Rechtsklick auf einen Knopf im Menüband → „Zur Symbolleiste für den Schnellzugriff
  hinzufügen“; erscheint oben links neben Speichern/Rückgängig, Rechtsklick → entfernen; ▾ daneben = häufige Befehle zum
  Ankreuzen (Neue Seite, Office-Datei öffnen, Drucken, Rechtschreibung, Symbol, Sortieren, Vorführen, Makros).
  `Store.ui.qat = [{ cmd, arg, title, svg }]` (SVG des Knopfs, gesäubert: nur Zeichen-Elemente, keine on…/href).
- **Ansichten in der Statusleiste** (unten rechts, `OfficeUI.views`): Word Lesemodus · Drucklayout; Excel Normal ·
  Umbruchvorschau; PowerPoint Lernansicht · Normal · Foliensortierung · Leseansicht · Bildschirmpräsentation.
- **Ansichten**: Word **Lesemodus** (eine ruhige Spalte, Spaltenbreite, Seitenfarbe Sepia/invertiert, Schrift ±, Esc;
  `Store.ui.wordRead`), Word **Drucklayout**; PowerPoint **Gliederung** (Text aller Folien aus `OfficeSaveAs.deckOf`,
  Klick = Folie), **Leseansicht** (Vorführen im Fenster, `Show.start(…, { window: true })`).
- **Vortragen**: Laserpointer (Strg+L), Stift (Strg+P, Klick blättert dann nicht), Löschen (E), Esc = Werkzeug aus;
  Knöpfe in der Leiste unten. Freihand gehört zur Folie (wird beim Wechsel gelöscht).
- **Designs** für alle drei (wie im Konzept „Farb-, Schrift- und Effektschema, das Word, Excel und PowerPoint gemeinsam
  nutzen“): Word Entwurf, Excel Seitenlayout, PowerPoint Entwurf → **Farben** (Office, Office 2023, Blau, Grün,
  Rot-Orange, Violett, Graustufen, Papier) und **Schriftarten** (Office, Office 2023, Arial, Segoe UI, Georgia, Cambria,
  Times New Roman, Verdana). Geschrieben in alle Theme-Teile (`clrScheme` dk1…folHlink als srgbClr, `fontScheme`
  major/minor latin), danach wird die Seite neu eingelesen (Designfarben in Zellen/Folien ändern sich mit).
  `p.office.theme` (gewählt) / `themeName` (aus der Datei).
- **Datei → Informationen** einer Office-Seite (wie Office): **Eigenschaften** (Titel, Thema, Autor, Stichwörter,
  Kategorie, Kommentare, zuletzt geändert von; erstellt/geändert; Statistik Seiten/Wörter, Blätter/Zellen, Folien) →
  `docProps/core.xml` (`p.office.props/props0`, wird angelegt, falls es fehlt); **Arbeitsmappe schützen** (Blatt
  schützen, **Arbeitsmappenstruktur schützen**: keine Blätter einfügen/löschen/umbenennen/aus-/einblenden,
  `workbookProtection lockStructure` mit SHA-512, `OfficeXT.protectBook/wbGuard`, `p.office.wbProt`); **prüfen** –
  **Dokument prüfen** (Eigenschaften/persönliche Angaben, Excel: Notizen, ausgeblendete Blätter/Zeilen/Spalten,
  Kopf-/Fusszeilen; Word: Kopf-/Fusszeilen, Wasserzeichen; PowerPoint: Referentennotizen, ausgeblendete Folien,
  Kopf-/Fusszeilen → entfernen bzw. einblenden, Strg+Z geht) und **Kompatibilität prüfen** (je Zielformat: was bleibt,
  was vereinfacht wird, was verloren geht).
- `OfficePages.rebuild` deaktiviert jetzt zuerst die aktive Excel-Zelle (sonst Fehler in der Statusleiste) und löscht
  die Datei-Stände der 1.72/1.73-Felder (kommen neu aus der Datei).

### Office wie die Programme 1.72 (`office-io.js`, `office-xltools.js`, `office-wordtools.js`, `office-ppttools.js`)
Abgleich: alle Register der drei Office-Seiten wurden mit Word/Excel/PowerPoint verglichen (Skript, das jedes Register und
jeden Knopf auflistet). Ergänzt wurde, was man im Alltag braucht und was sich verlustfrei in die Datei schreiben lässt;
KI- und Cloud-Funktionen bewusst nicht (Wunsch des Users). Was fehlt: „Bekannte Grenzen → Office 1.72“.
- **Öffnen** (`OfficeIO.openPanel`, Datei → Öffnen und Befehl `officeOpen`): Auswahlliste **Dateityp** wie im
  Öffnen-Dialog der Programme (Alle Office-Dateien; Gruppen Word/Excel/PowerPoint mit „Alle …-Dateien“ und jedem Format
  einzeln) – filtert die Dateiauswahl (`accept`) und erklärt, ob direkt geöffnet oder umgewandelt wird; Ablagefläche zum
  Hineinziehen; „Oder neu erstellen“ (Word/Excel/PowerPoint). Gewählter Typ in `Store.ui.officeOpenType`.
- **Speichern unter** direkt in Datei → Informationen (`OfficeIO.savePanel`): Dateiname, **Dateityp** (gruppierte Liste
  `OfficeSaveAs.typeSelect`: Neuestes Format (empfohlen) · Varianten · Ältere Versionen und andere Programme · Text und
  Web · Drucken), Hinweis je Typ, Knopf Speichern (bei PDF „Drucken / PDF …“). Letzte Wahl je Programm:
  `Store.ui.officeSaveType`. Neue Typen: **PDF** (alle drei, Druckdialog mit Vorschau), Excel **.html**, PowerPoint
  **.odp** (Folien mit Textrahmen, Listen, Bildern, Hintergrundfarbe, Grösse; `odfZip` nimmt jetzt Bilder mit),
  **Gliederung/RTF**, **.html** (Folien untereinander), **.txt**. Grundlage für PowerPoint: `OfficeSaveAs.deckOf` liest die
  aktuelle Datei (Platzhalter-Lage aus Layout/Master, Gruppen, Tabellen als Text).
- **Exportieren** (Export-Fenster, Format „Office-Datei“): je Programm eine Auswahlliste (voreingestellt das neueste
  Format, auch „Original (unverändert)“; kein PDF, weil mehrere Dateien ein ZIP werden) → `OfficePages.exportPages(pids,
  name, false, types)` → `OfficeIO.fileAs`. Merkt sich `Store.ui.exportOfficeTypes`. Datei → Exportieren hat jetzt auch
  „Office-Datei“ (auf einer Office-Seite vorgewählt).
- **Excel** (`OfficeXT`, Befehle `xl…` in commands.js, Register in `ribbon.js buildOffice`):
  - Start: **Verbinden und zentrieren** (Klick; nochmals = aufheben; Pfeil: verbinden über, verbinden, aufheben – fragt,
    wenn Werte verloren gehen), **Zellen formatieren** (Strg+1: Zahl, Ausrichtung, Schrift, Rahmen, Ausfüllen, Schutz,
    Vorschau; ändert nur, was man anfasst), **Als Tabelle formatieren** (Kopfzeile, gebänderte Zeilen, Filter),
    **Zellenformatvorlagen** (Gut, Schlecht, Neutral, Berechnung, Eingabe, Ausgabe, Notiz, Warntext, Titel,
    Überschrift 1–4, Ergebnis, Akzent 1–6, Prozent, Währung, Komma), **Format** (Zeilenhöhe in pt, Spaltenbreite in
    Zeichen, automatisch, Standardbreite, Zeilen/Spalten aus- und einblenden – Strg+9/Strg+0 –, Blatt aus-/umbenennen,
    Blatt schützen, Zelle sperren), **Suchen und Auswählen** (Suchen, Ersetzen inkl. Alle ersetzen in Blatt oder Mappe,
    Gehe zu F5, Notizen, Fehler), **Löschen** (alles, Formate, Inhalte, Notizen).
  - Einfügen: Notiz, Kopf- und Fusszeile, Symbol.
  - **Seitenlayout** (neues Register): Seitenränder (Normal/Breit/Schmal in Zoll), Ausrichtung, Format (A4/A3/A5/Letter/
    Legal), Druckbereich festlegen/aufheben, Drucktitel (Wiederholungszeilen), Kopf-/Fusszeile (&P &N &D &A &F, links/
    Mitte/rechts), An Seite anpassen (Breite/Höhe in Seiten, Skalierung), Gitternetz/Überschriften anzeigen und drucken,
    Seitenumbrüche gestrichelt (`Store.ui.xlBreaks`, `OfficeXT.breaks`). **Drucken** nimmt das: Auswahl „Blatt …
    (Druckbereich)“ vorgewählt, Papier/Ausrichtung/Ränder/Anpassen/Gitternetz aus dem Blatt (nur für diesen Druck),
    ausgeblendete und gefilterte Zeilen fehlen, Drucktitel als `<thead>` auf jedem Blatt, verbundene Zellen als
    colspan/rowspan.
  - Formeln: **Formelüberwachung** – Spur zum Vorgänger/Nachfolger (blau markiert, `OfficeXT._trace`), Pfeile entfernen,
    **Formeln anzeigen** (Strg+`, `d.showF`, wird als `showFormulas` geschrieben), Fehlerüberprüfung (springt zum
    nächsten #-Fehler).
  - Daten: **Sortieren** (mehrere Ebenen, Überschriften), **Filtern** (Strg+Umsch+L; Knöpfe in der Kopfzeile, Fenster mit
    A→Z/Z→A, Suchen, Werteliste mit „(Alle auswählen)“, Textfilter „enthält“; `d.af = { ref, f: { Spalte: { vals } |
    { has } } }`, ausgeblendete Zeilen in `d.hideF`), Löschen, Erneut anwenden; **Datenüberprüfung** (Liste, ganze
    Zahl, Dezimal, Datum, Textlänge mit Operator, eigene Meldung; Eingaben werden beim Bestätigen geprüft,
    `OfficeXT.validate` aus `Sheet.commit`); **Was-wäre-wenn → Zielwertsuche** (Sekantenverfahren, `OfficeXT.solve`;
    Ergebnis erst nach „Übernehmen“).
  - Überprüfen: **Notizen** (neu/bearbeiten Umsch+F2, löschen, vorherige/nächste, alle anzeigen; rotes Dreieck, Kästchen
    an der aktiven Zelle; `d.notes = { A1: { t, a } }`), **Blatt schützen** (optional Kennwort, gespeichert als SHA-512
    mit Salz und 100 000 Runden wie Excel; Aufheben prüft auch das alte 16-Bit-Kennwort; gesperrte Zellen nicht änderbar,
    entsperrte `f.ul` schon – `Sheet.locked(id, c, r)`).
  - Ansicht: Umbruchvorschau, Formeln, Notizen.
  - Kontextmenü der Zellen/Köpfe: Notiz, Zellen formatieren, Zeilenhöhe/Spaltenbreite, Aus-/Einblenden, Verbinden.
  - **Datei**: gelesen und nur bei Änderung geschrieben (`OfficeXT.layoutKeys` je Teil: Spalten, Zeilen, verbunden,
    Datenüberprüfung, Filter, Notizen, Seite, Schutz; `b.ox.lk0` = Stand der Datei): `<cols>` (Bereiche je Spalte
    aufgelöst, nur geänderte Spalten neu, Stil-Attribute bleiben), `<row ht customHeight hidden>`, `<mergeCells>`,
    `<dataValidations>` (unveränderte Regeln als Original-XML), `<autoFilter>` + `_xlnm._FilterDatabase`, Kommentar-Teil +
    VML-Zeichnung (`legacyDrawing`; andere VML-Formen bleiben; verknüpfte Excel-365-Kommentare werden zu Notizen),
    `pageMargins/pageSetup/printOptions/headerFooter`, `sheetPr/pageSetUpPr fitToPage`, `_xlnm.Print_Area/
    Print_Titles` (`localSheetId` = Stelle in `<sheets>`), `sheetProtection`, Zellschutz `protection locked="0"`,
    Schriftart der Zelle (`fn`, war bisher nur gelesen). Zeilen/Spalten einfügen/löschen verschiebt alles mit
    (`OfficeXT.shift`: verbunden, aus-/eingeblendet, Höhen, Überprüfung, Filter, Notizen, bedingte Formate,
    Druckbereich). Pfeiltasten überspringen ausgeblendete Zeilen/Spalten.
- **Word** (`OfficeWX`): **Kopfzeile/Fusszeile** (Einfügen; Doppelklick in die Kopf-/Fusszeile auf dem Blatt =
  bearbeiten; Felder {Seite} {Seiten} {Datum}; links/zentriert/rechts) – auf **jedem Blatt** angezeigt (gesperrte Felder
  `ox.k = 'hfp'`, in `OfficeView.flow` je Blatt angelegt), geschrieben als Kopf-/Fusszeilen-Teil mit `fldSimple PAGE/
  NUMPAGES/DATE` (neue Teile + `headerReference/footerReference` im letzten Abschnitt; Absätze mit Bildern/Logos
  bleiben). **Seitenzahl** (oben/unten × links/Mitte/rechts, „Seite X von Y“, entfernen). **Wasserzeichen** (Entwurf:
  VERTRAULICH, ENTWURF, MUSTER, NICHT KOPIEREN, DRINGEND, KOPIE, eigener Text) – Anzeige als schräges Bild je Blatt
  (`ox.k = 'wmp'`), in der Datei wie Word als VML-Textpfad `PowerPlusWaterMarkObject` in der Kopfzeile.
  **Silbentrennung** (Layout; `autoHyphenation` in settings.xml, Anzeige `hyphens: auto`). **Sortieren** (Start →
  Absatz: markierte Absätze/Listenpunkte A→Z/Z→A). **Symbol** (Einfügen, `OfficeSym`: Häufig, Griechisch, Mathematik,
  Pfeile, Währung, Hoch/tief, Satzzeichen, Formen, Buchstaben, Zeichencode, zuletzt verwendet – auch in Excel und
  PowerPoint). Gelesen: `p.office.hf/hf0/hfp`, `wm/wm0/wmImg`, `hyph/hyph0`, `titlePg`.
- **PowerPoint** (`OfficePX`, `OfficeAnim`, `Show`): **Folie ausblenden** (`show="0"`, beim Vorführen übersprungen,
  in Übersicht und Foliensortierung blass/durchgestrichen), **Bildschirmpräsentation einrichten** (Endlosschleife →
  `presProps.xml showPr loop`), **Übergänge**: 9 weitere (Rad, Zufällige Balken, Jalousie, Schachbrett, Plus, Raute,
  Streifen, Keil, Wirbel), **Effektoptionen** (Richtung je Übergang, `tr.dir`), **Nächste Folie: Bei Mausklick / Nach
  x s** (`advClick`, `advTm`; Vorführen wechselt von selbst), Katalog als Reihe mit Pfeil für alle (`Ribbon.fxGal`).
  **Animationen**: Hervorheben (Pulsieren, Drehen, Vergrössern) und Beenden (Verschwinden, Ausblenden, Hinausfliegen,
  Verkleinern) – gelesen und geschrieben (`presetClass emph/exit`, `animRot/animScale`, Ausblenden am Ende).
  **Kopf- und Fusszeile** (Einfügen: Datum fest/heute, Foliennummer, Fusszeile, nicht auf der Titelfolie, für diese
  oder alle Folien; Felder `b.pf`, Foliennummern folgen beim Verschieben). **Foliensortierung** (Ansicht: Raster aller
  Folien, ziehen = verschieben, Doppelklick = öffnen, Rechtsklick = ausblenden/duplizieren/löschen/vorführen).

### Excel und Dateiformate 1.71 (`office-convert.js`, `office-saveas.js`, Darstellung in `sheet.js`/`office-grid.js`)
- **Zoomen/Fixieren:** Fixierte Zeilen/Spalten wurden mit `transform` an den Rand geschoben, ihre Köpfe aber nicht – beim
  Zoomen (die Ansicht verschiebt sich) standen Buchstaben/Nummern über falschen Zellen, Gitterlinien der Tabelle blieben
  stehen. Jetzt: Köpfe fixierter Spalten/Zeilen (`.xl-ch.fz`, `.xl-rh.fz`) stehen mit, fixierte Zellen zeichnen ihre
  Linien selbst (`box-shadow`), `OfficeGrid.clamp` merkt `e._hx/_hy`, `Sheet.rectOf` (Auswahl, Bearbeiten) und
  `Sheet.cellAt` (Klick) rechnen fixierte Bereiche um, `.xl-ov` liegt über fixierten Zellen. **Spaltenbreite:** die
  Tabelle hat jetzt eine feste Breite (Summe der Spalten) – ohne sie galt `table-layout: fixed` nicht, und einzeilige
  Texte verbreiterten Spalten.
- **Formate aus der Datei:** Designfarben (`theme` + `tint`, Excel-Reihenfolge lt1/dk1/lt2/dk2/Akzente aus theme1.xml,
  Helligkeit im HLS-Modell wie Excel: tint < 0 → L·(1+t), > 0 → L·(1−t)+t), indizierte Farben (Standardpalette 0–63,
  eigene `indexedColors`), Muster-/Verlaufsfüllungen (Vordergrund bzw. erste Farbe), vertikale Ausrichtung (`va`:
  t/m, fehlt = unten), Zeilenumbruch (`wr`), Schriftart der Zelle (`fn`), Einzug (`in`). Zellformat 0 der Mappe gilt
  für Zellen ohne eigenes (`d.xl.f0`, z.B. „oben“ für alle). Bisher wurden nur rgb-Farben gelesen – Designfarben (der
  Normalfall in Excel) fehlten, und die vertikale Ausrichtung fehlte immer.
- **Wie Excel aussehen** (`d.xl = { fn, fs, rh, cw, f0 }`, Klasse `.xlx` am Blatt): Schrift und Grösse der Mappe,
  Standard-Zeilenhöhe (`defaultRowHeight`), Standardbreite (`defaultColWidth`/`baseColWidth`, auch beim Wachsen),
  einzeilig ohne Umbruch, linksbündiger Text läuft in leere Nachbarzellen (`.xl-of`), Umbruch nur mit `wr`.
  Zeilenhöhen (`customHeight` → `d.rowh`), ausgeblendete Zeilen/Spalten (`d.hideR/hideC`, `visibility: collapse`),
  verbundene Zellen (`d.merges`, Fläche je Bereich in `.xl-mgl` über dem Raster; Klick wählt die Zelle oben links; Text
  steht nur in der Fläche), Auswahllisten der Datenüberprüfung (`d.dv`, Pfeil rechts an der Zelle, Alt+↓; Werte aus
  "a,b,c" oder einem Bezug, auch auf ein ausgeblendetes Blatt), ausgeblendete Blätter (`b.ox.hid`, nicht im Register,
  Rechtsklick → Ausblenden/Einblenden, `state` wird zurückgeschrieben), aktives Blatt aus `activeTab`. Neu im Register
  Start (Excel): Gruppe **Ausrichtung** (oben/Mitte/unten, Zeilenumbruch; `xlVa`, `xlWrap`, werden mit `styleWriter`
  zurückgeschrieben).
- **Import aller Formate:** `OfficeConvert.convert(file)` wandelt in das neueste Format (eigene Bauer `buildXlsx`,
  `buildDocx` aus `Ooxml.blankParts`, `buildPptx`), danach der normale Import. Das Original bleibt als zweite Datei
  (`p.office.src = { asset, name, from }`), die Datei-Karte nennt es, „Original speichern“ gibt es unverändert zurück.
  Leser: CSV/TSV (Trennzeichen automatisch, Anführungszeichen, Kodierung UTF-8/UTF-16/Windows-1252, Dezimalkomma bei
  „;“, Prozent), **.xls** (Compound File + BIFF8/BIFF5: Werte, gemeinsame Zeichenketten über CONTINUE, Formeln in
  Excel-Schreibweise inkl. geteilter Formeln und Blattbezügen – sonst der gespeicherte Wert –, Schriften, Füllungen aus
  der Palette, Ausrichtung, Rahmen, Zahlenformate, Spaltenbreiten, Zeilenhöhen, verbundene Zellen, fixiert,
  ausgeblendet), **.ods** (Werte/Datum/Zeit/Prozent/Währung, OpenFormula → Excel, automatische Formatvorlagen,
  Spaltenbreiten, verbundene Zellen, ausgeblendet), **.doc** (Text über die Stückliste CLX, Felder → Ergebnis,
  Tabellenzellen → Tabstopp), **.rtf** (Läufe fett/kursiv/unterstrichen/Farbe/Grösse, Überschriften über die
  Formatvorlagen, Listen, Tabellen, Unicode), **.odt** (Überschriften, Listen mit Punkt/Nummer, Tabellen, Läufe),
  **.md**/**.txt**, **.ppt** (Persist-Verzeichnis → Folien in richtiger Reihenfolge, Texte der Formen mit Lage, sonst
  Titel/Text aus der Folienliste), **.odp** (Rahmen mit Lage, Text, Bildern, Notizen gelesen). Formate: `OfficePages.ACCEPT`,
  „Datei → Neu → Office-Datei öffnen …“ (`officeOpen`), „Importieren“ und „Als Office-Seite öffnen“ nehmen alle.
- **Speichern unter mit Dateityp** (`OfficeSaveAs.dialog`, Befehl `officeSave`): Auswahlliste, voreingestellt das neueste
  Format, Hinweis je Typ. OOXML-Varianten (.xlsm .xltx .docm .dotx .pptm .ppsx .potx .ppsm .potm) = dieselbe verlustfreie
  Datei mit anderem Inhaltstyp des Hauptteils (ohne Makro-Format wird `vbaProject` entfernt). Excel aus der Seite
  (`bookOf`): **.xls** (BIFF8 in einer Verbunddatei, `cfbWrite`; Werte, Schriften, Palette mit eigenen Farben,
  Zahlenformate, Ausrichtung, Rahmen, Breiten, Höhen, verbunden, fixiert, ausgeblendet; Formeln als Ergebnis, Hinweis),
  **.ods** (Formeln als OpenFormula, Formate, Breiten, verbunden, ausgeblendet), **.csv** (;), **.csv UTF-8** (,),
  **.txt** (Tab) – nur das aktuelle Blatt. Word aus der Datei (`docOf`: Überschriften über Formatvorlagen, Listen auch
  über Listen-Formatvorlagen, Tabellen, Läufe): **.rtf**, **.odt**, **.html**, **.md**, **.txt**.
- **Web** (wie gewünscht): Excel-Palette (openpyxl COLOR_INDEX) und Helligkeitsformel (SheetJS/ECMA-376) nachgeschlagen.

### Add-Ins 1.70 – überarbeitet: Häkchen-Raster, EINE Vorlage, Anleitung
- **Häkchen links, automatisch mehrspaltig:** Gruppe „Ein / aus“ ist ein CSS-Raster `.ai-checks` (`grid-auto-flow:
  column`, `grid-template-rows: repeat(4, 1fr)`, Höhe = Band `--bh`): je 4 Add-Ins untereinander, das 5. beginnt oben
  eine neue Spalte rechts usw. Die Häkchen sind dafür niedriger (max. 22 px, Schrift 12 px, Kästchen und Text auf einer
  Linie); fehlerhafte Add-Ins rot. Fehlerhafte Dateien (nicht ladbar) stehen nur in „Verwalten“.
- **EINE Vorlage statt .md + .js:** `web/addins/_Add-In-Vorlage_KI.js` ist Anleitung (ein grosser Kommentar, Markdown
  darin) **und** lauffähiges Gerüst (`KnowledgeTree.register` „Mein Add-In“ mit Knopf „Hallo“) in einer Datei. Der Kopf
  erklärt: einer KI geben, sie liefert eine neue, kurze Datei im Aufbau des Gerüsts – „in Wirklichkeit“ hat ein fertiges
  Add-In den langen Kommentar nicht. Dateien mit `_` am Anfang lädt das Programm im Ordner nicht (`/api/addins` liste),
  darum ist die Vorlage nie selbst aktiv; speichern mit `_` wird abgelehnt (`addCode` entfernt ein `_` am Anfang des
  Namens). `ensureAddinsDir` schreibt die Vorlage bei jedem Start (CRLF) und löscht die alte `Add-In-Vorlage_KI-Kontext.md`
  von 1.69, wenn sie noch mit unserem Titel beginnt. `go:embed` nennt die Datei ausdrücklich (`_`-Dateien fehlen sonst).
  Wird die Vorlage selbst „hinzugefügt“, erklärt `Plugins.addCode` das („Das ist die Vorlage“) statt sie zu laden.
  Das alte JS-Beispiel (`Plugins.TEMPLATE`, „Beispiel (.js)“, `addinExample`) ist entfallen; das 1.66-Beispiel liegt
  als Testdatei `tests/browser/addin-166-beispiel.js`.
- **Anleitung (Info):** Register Add-Ins → **Anleitung** (`addinGuide` → `Plugins.guide()`, auch Knopf „Anleitung“ im
  Verwalten-Dialog und in Entwicklertools): was ein Add-In ist, 5 Schritte (Vorlage holen, einer KI geben, Antwort als
  Datei speichern, einbinden, Häkchen), Beispiel-Auftrag zum Kopieren (`EXAMPLE_ASK`), warum nur eine Datei, Sicherheit;
  Knöpfe KI-Vorlage speichern, Ordner öffnen (Programm), Add-In hinzufügen.
- **Verwalten neu:** Zeile je Add-In mit eigenem Häkchen (`.ai-cb`, gleiche Optik wie im Menüband), Name, Version,
  Herkunft als Plakette (eingebaut / Add-Ins-Ordner / im Speicher), Beschreibung, Inhalt (`Plugins.parts`: Register,
  Gruppen, Funktionen, Menüeinträge, Tasten), Datei, Fehler rot (`Plugins.failed`: Fehler im setup, je id; nicht
  ladbare Ordner-Dateien als eigene Einträge `broken`). Knopfzeile bricht als Ganzes um, nie im Knopftext
  (`white-space: nowrap`) – vorher standen „KI-Vorlage speichern“, „Neu laden“, „Add-In hinzufügen … (.js)“ zweizeilig.

### Add-Ins 1.69 – Schnittstelle 2, Register „Add-Ins“, Chem-Draw als Add-In, Ordner mit KI-Vorlage
- **Woher Add-Ins kommen** (`plugins.js`, alle im Register **Add-Ins** mit einem Häkchen):
  **eingebaut** (`Plugins.builtin(def)` beim Laden der Skripte, z.B. `addon-chemdraw.js`; `defaultOn`), **Ordner**
  (Programm: `Add-Ins\*.js` neben der EXE, beim Start über `/api/addins` gelesen; neue Dateien werden eingeschaltet,
  mit Hinweis „Neues Add-In im Ordner“) und **Notizbuch** (Browser: „Add-In hinzufügen“ legt die Datei als Asset ab,
  `Store.ui.plugins` wie 1.66). Ein/aus in `Store.ui.addins = { id: true|false }` (eingebaut, Ordner; auch im frühen
  Stand `kt-ui`, damit das Menüband beim Start gleich stimmt), Notizbuch-Add-Ins weiter mit `on`. Gleiche id: Ordner
  vor Notizbuch vor eingebaut (zuletzt angemeldetes gewinnt).
- **Ablauf:** `Plugins.parse(code)` führt die Datei mit einem Objekt `KnowledgeTree { version, api: 2, register }` aus
  und sammelt die Anmeldungen (ohne `setup`) – so ist die id bekannt, ohne ein ausgeschaltetes Add-In zu starten.
  `register(def)` prüft `requires` (Programmversion aus `Store.info.version`), ruft `setup(api)`; ein Fehler darin
  räumt alles Angemeldete wieder weg (`activate` meldet ihn: Hinweis, `Plugins.errors`, „Nicht geladen“ im Dialog).
  `syncBuiltins()` läuft am Anfang von `App.boot` (vor `Ribbon.build`), nach `earlyUi` und nach dem Laden des Zustands;
  `Plugins.init()` (nach `Spell.init`) lädt Notizbuch- und Ordner-Add-Ins und meldet `ready`.
- **Schnittstelle 2** (vollständig in der KI-Vorlage): `addCommand` (überschreibt einen vorhandenen Befehl und stellt
  ihn beim Ausschalten wieder her), `addButton` (Standard jetzt Register `addins`, alle Seitentypen; `small`, `check`,
  `cmd`+`arg` oder `run`, `menu`), `addGroup({ tab, mode, label, before|after, build(R) })`, `addTab({ id, label,
  modes, after })`, `addIcon`, `addMenuItem({ where: 'box'|'canvas', when, disabled, run })`, `addShortcut('Strg+Alt+K',
  fn)`, `addStyle(css)`, `addWords`, `addHelp`, `addFunction`, `on('ready'|'pageOpen'|'selectionChange'|'cellChange'|
  'imageRender'|'imageOpen'|'keydown')`, `ui { toast, info, prompt, confirm, dialog, menu, download }`, `store`,
  `canvas { page, pageId, box, selection, select, center, insertText, insertImage, render }`, `commit`, `sheet`, `run`,
  `h { el, icon, escapeHtml }`. Jede Anmeldung trägt die id des Add-Ins; `unregister` entfernt alles (Knöpfe, Gruppen,
  Register, Menüs, Tasten, Hilfe, Wörter, Ereignisse, Funktionen, Stile, Symbole, Befehle) und ruft die Rückgabe von
  `setup` bzw. `teardown`. Danach `Plugins.changed()`: Registerleiste und Register neu, Bilder neu gezeichnet
  (`imageRender`), Fachwörter neu.
- **Haken im Kern:** `Canvas.renderFloats` → `imageRender`, `Canvas.onDbl` → `Plugins.handle('imageOpen')` (true =
  erledigt, sonst Grossansicht), Kontextmenü von Feld und Bild → `menuFor('box', { box, image, locked })`, freie
  Fläche → `menuFor('canvas')`, `Canvas.load` → `pageOpen`, `Canvas.refreshSel` → `selectionChange`, `App.initKeys` →
  `Plugins.onKey` (vor allen Kürzeln, nicht in Dialogen; Buchstaben über `e.code`), `Spell.fachSet` →
  `Plugins.allWords()`, „Tastenkürzel & Bedienung“ → `Plugins.helpRows()`, `Ribbon.buildTab` setzt Add-In-Gruppen an
  ihre Stelle (`before`/`after` = Beschriftung einer Gruppe), `Ribbon.TABS` fügt eigene Register ein (nach `after`,
  sonst vor „Add-Ins“). `Canvas.insertImage` gibt jetzt `{ box, image }` zurück.
- **Chem-Draw als Add-In** (`addon-chemdraw.js`, id `chemdraw`, standardmässig an): Befehle `chemDraw/chemTool/
  chemFormula/chemPse` (Namen wie bisher), Gruppen „Chemie“ und „Reaktion“ im Register Zeichnen aller Seitentypen vor
  „Hilfsmittel“, Kennzeichnung/Doppelklick/Rechtsklick für Bilder mit `im.chem`, Element- und Molekülnamen für die
  Rechtschreibung, Hilfe-Abschnitt. Der Editor (`chem*.js`) bleibt im Programm. Ausgeschaltet: nichts davon da,
  vorhandene Strukturformeln sind normale Bilder (Doppelklick = Grossansicht), nach dem Einschalten wieder bearbeitbar.
  Aus Kern-Dateien entfernt: Chem-Gruppen in `ribbon.js`, Befehle in `commands.js`, Bild-Sonderfälle in `canvas.js`,
  CHEM_DB-Wörter in `spell.js`, Hilfe-Zeilen in `main.js`.
- **Register „Add-Ins“** in allen vier Seitentypen (frei, Word, Excel, PowerPoint): Gruppe „Ein / aus“ mit einem
  Häkchen je Add-In (`Ribbon.check`, Befehl `addinToggle`; seit 1.70 je 4 untereinander, siehe oben), „Verwalten“ (Add-In hinzufügen,
  Verwalten-Dialog mit Herkunft/Funktionen/Knöpfen/Entfernen, Ordner öffnen – nur Programm –, Neu laden), „Eigene
  Add-Ins“ (1.69: KI-Vorlage speichern, Beispiel .js; seit 1.70: Anleitung, KI-Vorlage). Entwicklertools (Excel) behält die Gruppe Add-Ins.
- **Ordner im Programm** (`addins.go`): `ensureAddinsDir()` beim Start legt `Add-Ins` an und schreibt
  die KI-Vorlage (aus `web/addins/`, eingebettet, CRLF; seit 1.70 `_Add-In-Vorlage_KI.js`), wenn sie fehlt oder abweicht. `/api/addins`
  `{ a: liste | speichern | entfernen | vorlage }` – nur `Name.js` direkt im Ordner (keine Pfade), Entfernen verschiebt
  nach `Add-Ins\_entfernt`. `/api/ordner?w=addins` öffnet ihn. „Add-In hinzufügen“ kopiert im Programm in den Ordner.
  LIESMICH erwähnt den Ordner.
- **KI-Vorlage** (1.69 als `.md`, seit 1.70 als Kommentar in `web/addins/_Add-In-Vorlage_KI.js`): Auftrag und Muss-Regeln für die KI (eine Datei, nur über
  `api`, aufräumen, kein Internet/keine Bibliotheken, Deutsch mit „ss“, `commit`, `store`, `requires`), Gerüst,
  vollständige Schnittstelle, Register-ids je Seitentyp, Gruppen, Bausteine `R`, Symbolnamen, Ereignisse, vorhandene
  Befehle und belegte Tasten, Datenmodell, zwei lauffähige Beispiele (klein: Befehl/Knopf/Funktion; gross: eigenes
  Register, Häkchen, Bilder mit eigenen Angaben, imageOpen, Menü, Taste, Stil, Hilfe), Prüfliste, Installieren. In der
  Webseiten-Fassung setzt `build_web.py` sie als Text in `Plugins.TEMPLATE_TEXT` ein; im Programm holt
  `Plugins.templateText()` sie über `addins/_Add-In-Vorlage_KI.js` (webFS). Der Test lädt beide Beispiele aus der Vorlage selbst.

### Office-Seiten 1.68 – dynamisch, Tabs, Handy, Menüband
- **Formelleiste gehört zur Seite:** `Sheet.barSync()` (sichtbar bei aktiver Tabelle oder auf einer Excel-Seite) läuft bei
  jedem Seitenwechsel (`Canvas.load`, ohne Ansicht zu verschieben) und in `OfficeView.sync`. Vorher blieb sie nach dem
  Verlassen der Excel-Seite stehen; ausserdem setzte `barSync` in `Canvas.load` die Ansicht der alten Seite unter der
  neuen Seiten-ID in `Store.ui.views` (Zoom 50 % auf der Excel-Seite nach dem Tabwechsel) – behoben (`barSync(true)`).
- **Grösse dynamisch:** `OfficeView` beobachtet `#viewport` (ResizeObserver → `onResize`): PowerPoint passt die aktuelle
  Folie neu ein, Word zentriert neu (und passt die Breite an, wenn das Blatt nicht mehr passt oder auf Seitenbreite
  eingepasst war, `OfficeWord.refit(true)`, `_fitW`), Excel zeichnet die Köpfe neu. Kommt eine Office-Seite in einen
  Bereich (Tabwechsel, Teilen), wird ebenso eingepasst.
- **Stufen nach Grösse des Bereichs:** breit; **kompakt** (`OfficeView.compact()`: unter 900 px oder Hochformat bis
  1300 px) – PowerPoint-Animationsbereich als Knopf „Animationen“ über der Folie (Einblendung), Normalansicht:
  Notizen per Knopf (Einblendung links), Folie über die ganze Breite; **schmal** (`narrow()`: unter 700 px, Handy oder
  schmaler geteilter Bereich) – Folienübersicht waagrecht unten (`STRIPH` 88 px), Knöpfe „Notizen“/„Animationen“ je
  Folie, Word ohne Lineale, Navigationsbereich als Einblendung (schliesst nach dem Sprung). Klassen `.ofv.compact`,
  `.ofv.narrow`, `body.ofv-narrow`.
- **Verstellbare Leisten:** Folienübersicht, Notizspalte (Normal), Animationsbereich (Lernansicht) und Word-
  Navigationsbereich haben einen Ziehgriff (`OfficeView.grip`, `.ofv-rs`; Doppelklick = Standard); Breiten in
  `Store.ui.ofvW = { strip, ncol, ap, nav }` (Grenzen `WMIN/WMAX`, höchstens ~40 % des Bereichs), als CSS-Variablen
  `--ofv-*` am `.ofv`. Die Folie wird beim Loslassen neu eingepasst, die Miniaturen neu gezeichnet. Notiz-Felder der
  Lernansicht und Textfelder sind wie bisher über ihre rechte Kante verstellbar. Der Animationsbereich bleibt oben
  sichtbar, solange seine Folie zu sehen ist.
- **Handy/Finger:** Word: kurz antippen = Schreibmarke an der nächsten Textstelle (Ziehen verschiebt die Seite), kein
  neues Textfeld beim Antippen (`noCreate` auf Word-Seiten); PowerPoint Normal: Wischen (über der Abdeckung oder die
  Folie mit dem Finger verschoben) = vorige/nächste Folie, sonst zurück an den Platz (`OfficeSlides.swipe`, Haken in
  `Canvas.onUp`); Ziehgriffe für Finger breiter.
- **Menüband:** Pfeile der grossen Knöpfe waren 28 px hoch (Klasse `ic`) und ragten unter die Gruppennamen → 10 px;
  zweizeilige Beschriftungen tragen den Pfeil am Ende der letzten Zeile (wie Office, letztes Wort + Pfeil umbrechen
  nicht). Beim waagrechten Bildlauf (`#panel.ovf`, gesetzt in `Layout.fadePanel`) ist das Band 14 px höher, der Balken
  liegt unter den Gruppennamen (dünner, abgerundeter Balken); Handy-Layout ohne Zusatzhöhe. Word Entwurf: Seitenfarbe
  und Seitenränder in einer Gruppe „Seitenhintergrund“; Excel Ansicht: „Fenster fixieren“ in der Gruppe „Fenster“
  (vorher zwei Gruppen „Fenster“). Geprüft: alle Register aller vier Seitentypen bei 900, 1100 und 1280 px.

### Office-Seiten 1.67 – Word, Excel und PowerPoint überarbeitet (`office-word.js`, `office-grid.js`, `office-slides.js`)
- **Word – Klick aufs Blatt** (`OfficeWord.down`, Haken in `Canvas.onDown` vor allem anderen): Klick auf das Blatt, den
  Rand, die graue Fläche oder in den Rand des Schreibbereichs setzt die Schreibmarke an die nächste Textstelle
  (`caretAt`: Schreibbereich mit der kleinsten Höhendistanz, x in die Zeile geklemmt → `caretRangeFromPoint`; rechts =
  Zeilenende, links = Zeilenanfang, unter dem Text = Ende, Lücke = nächster Absatz); Ziehen markiert (eigene
  Zeigerverfolgung, `setBaseAndExtent`), Umschalt+Klick erweitert. Kein neues Textfeld, auch nicht per Doppelklick
  (`onDbl`); eigene Textfelder gibt es über Einfügen → Textfeld.
- **Word – Anzeige:** Formatierungszeichen ¶ (Start → Absatz, Ansicht, Strg+Umsch+8 bzw. Strg+*): Absatzmarke per CSS
  `::after`, Leerzeichen/Tabulatoren per CSS Highlight `kt-marks`, Seitenumbruch beschriftet. **Seitenumbruch** (`<hr>`)
  lässt den nächsten Absatz oben auf der nächsten Seite beginnen (`OfficeView.flow`). Statusleiste: „Seite x von n“
  an der Schreibmarke, Wörter (bei Markierung „12 von 530 Wörtern“), Zeichen; Klick = Wörter zählen (Zählung je Feld
  zwischengespeichert). **Lineale** oben und links (Ränder grau, Zahlen ab dem Rand); die Randgrenzen sind ziehbar
  (`dragMargin`, Linie + cm-Anzeige, auf 0,05 cm → `OfficeDoc.setPage('margin')` → `w:pgMar`). **Navigationsbereich**
  (Ansicht): Überschriften 1–3, aktuelle markiert, Klick springt hin. Ansicht → Lineal ein/aus.
- **Word – Entwurf:** Absatzabstand (Kein … Doppelt) → `docDefaults/pPrDefault` + Standard-Formatvorlage
  (`w:spacing after/line`), Schriftarten → `rPrDefault`/Standard (`w:rFonts`, Design-Schriften entfernt), Seitenränder
  (Linie, dick, doppelt, punktiert, Schatten, Farbe) → `w:pgBorders offsetFrom="page" space="24"` im letzten
  `w:sectPr` (vorhandene werden gelesen). Anzeige über Variablen am `#viewport` (`data-wsp`, `data-wfont`, `data-pgb`).
- **Excel – unendlich:** `OfficeGrid.clamp` (in `Canvas.applyView`, vor dem Zeichnen) hält die Ansicht bei A1 (Köpfe am
  oberen/linken Rand) und setzt `--hx/--hy` am Blatt: Spalten-/Zeilenköpfe und fixierte Zeilen/Spalten bleiben stehen
  (CSS-Transform). `OfficeGrid.onView` lässt das Blatt wachsen, wenn das Raster vor dem Fensterrand endet (bis 10’000
  Zeilen, 200 Spalten), ebenso Pfeiltasten über den Rand (`Sheet.move`). Zoom mindestens 30 %. Bearbeitungsleiste
  bleibt sichtbar. Hinweise zum Blatt stehen im Tooltip des Blattregisters (ⓘ).
- **Excel – feste Tabelle:** `OfficeGrid.isFixed` (Excel-Blatt, Word-Schreibbereich/Blätter/Kopfzeile, Folie): nicht
  löschbar (`deleteSelection` → Hinweis), nicht verschiebbar (`startMove`). Das Blatt liegt mit z-index 1 unter allen
  Textfeldern – ein neues Textfeld liegt darüber wie in Excel (vorher verdeckte das aktive Blatt mit z-index 99990
  neue Felder).
- **Excel – Funktionen:** Rahmenlinien (unten/oben/links/rechts, alle, aussen, dick aussen, dick unten; `f.bd`),
  **bedingte Formatierung** (grösser/kleiner/zwischen/gleich, Text enthält, doppelte Werte, obere/untere n mit
  Formatvorlage hellrot/gelb/grün …; Farbskalen; Datenbalken; Regeln löschen/verwalten; `d.cf`, Anzeige in
  `Sheet.renderGrid` über `cfPrep`), **Fenster fixieren** (bei Zelle, oberste Zeile, erste Spalte; `d.freeze`),
  Überschriften ein/aus (`d.heads`), Daten → **Duplikate entfernen**, **Text in Spalten**.
- **Excel – Formate in der Datei:** beim Einlesen werden Zellformate aus `styles.xml` übernommen (fett, kursiv,
  unterstrichen, durchgestrichen, Schriftfarbe, Grösse, Füllung, Ausrichtung, Rahmen, Zahlenformat → `nf/d/cur`) – Ausgang
  `ox.f0`; beim Speichern bekommen nur geänderte Zellen ein neues `xf` (Kopie des bisherigen + Änderungen; neue
  `font/fill/border/numFmt` angehängt, `OfficeGrid.styleWriter`). Bedingte Formate, die KnowledgeTree darstellen kann,
  werden gelesen (`readCf`) und bei Änderung alle neu geschrieben (andere – Symbolsätze, Formeln – bleiben), mit `dxf`.
  Fixierung/Gitternetz/Überschriften ↔ `sheetView/pane`. Keine eigene Kopfzeilen-Farbe mehr für Excel-Dateien
  (`head: false`, wie Excel). Unverändert = byte-gleich.
- **PowerPoint – zwei Ansichten** (je Seite in `Store.ui.pptView`, ohne Eintrag = Lernansicht; Ansicht → Präsentations-
  ansichten und Knöpfe in der Statusleiste): **Lernansicht** = alle Folien untereinander, 220 px Abstand
  (`OfficePpt.GAP`), Folien bei x = 400; links jeder Folie ihr **Notiz-Feld** (gelb, x = 40, Breite 300) bzw. „Notizen zur
  Folie hinzufügen“; rechts der **Animationsbereich** (Bildschirm-Leiste je sichtbarer Folie: Klickschritt-Nummer,
  Auslöser-Symbol mit Menü Beim Klicken/Mit Vorherigem/Nach Vorherigem, Effekt, Feld, Früher/Später/Entfernen,
  Wiedergeben, Übergang); Nummern an den Feldern; Mausrad scrollt frei. **Normal** = nur die aktuelle Folie (Abdeckung
  `.ofv-mask` ringsum, fängt Klicks ab, Rad = Folie), links Folienübersicht und **Notizspalte** der aktuellen Folie;
  Notiz-Felder, Beschriftungen und Animationsbereich ausgeblendet. Beide Ansichten zeigen dieselben Daten; nur
  `OfficeSlides.fit` (Zoom/Lage) unterscheidet sich. Wechsel der Folie hebt eine Auswahl auf einer anderen Folie auf.
  Seiten vor 1.67 werden beim Öffnen einmal umgestellt (`relayout`, `p.office.lay = 2`, ein Verlaufsschritt). Der
  Notizbereich unten (1.66) entfällt.
- **PowerPoint – gestalten:** Neue Folie ▾ mit **Layouts** (Titelfolie, Titel und Inhalt, Abschnittsüberschrift, Zwei
  Inhalte, Nur Titel, Leer): Platzhalter-Felder `b.ph = { t, fs, al }` zeigen „Titel hinzufügen“ … (CSS `data-ph`),
  bleiben leer stehen (`isEmptyBox`) und kommen leer **nicht** in die Datei. Einfügen → **Textfeld aufziehen**
  (`startTextbox`, Klicken und Ziehen, Esc = abbrechen); neue Felder auf Folien ohne Rahmen/Füllung, 18 pt.
  Start → Anordnen: **an der Folie ausrichten** (links/zentriert/rechts/oben/mitte/unten), Vorder-/Hintergrund.
  Einfügen → Foliennummer, Datum. Ansicht → Animationsbereich, **Führungslinien** (Mittellinien), **Gitternetzlinien**
  (Leisten `.ofv-guide` über den Folien).

### Office-Seiten 1.66 – näher an Word/Excel/PowerPoint, Erweiterungen (`office-anim.js`, `grammar.js`, `fonts.js`, `plugins.js`)
- **Ruhiger, wie die Programme:** die Infozeile „📄 Word-Dokument · Original …“ ist auf Office-Seiten ausgeblendet
  (`OfficeView.hidden`, bleibt in den Daten/Exporten), ebenso Folien-Beschriftungen und Notiz-Felder neben den Folien.
  Keine Ansatzpunkte/Feldleisten. **Word:** Schreibbereich ohne Rahmen/Griff auch beim Schreiben (`.box.ow`), Blätter
  mit **26 px Abstand** (`OfficeView.GAP`, `pageTop(p, i)`), Schatten am Blatt selbst (`.box.oblatt .fimg`, das Feld
  ist durchsichtig – sonst war das Papier 22 px breiter als das Lineal). Absätze, die über ein Seitenende ragen,
  rücken auf die nächste Seite: nur in der Anzeige über `data-kt-pm` + CSS-Variable `--kt-pm` (margin-top), `boxHtml`
  entfernt beides vor dem Speichern. **Lineal** oben (`.ofv-ruler`): Ränder grau, Zählung ab dem linken Rand (links
  davon rückwärts), Zahlen statt Strich auf ganzen cm, Einzugsmarken; folgt Zoom/Verschiebung (`OfficeView.onView`).
  **PowerPoint:** Folie ohne weissen Feldrand, nur Schatten; Mausrad = vorige/nächste Folie (`OfficeView.wheel`,
  Strg+Rad zoomt); **Notizbereich** unter der Folie („Klicken Sie, um Notizen hinzuzufügen“, `.ofv-notes`) – Tippen legt
  das Notiz-Feld der Folie an. **Excel:** Blatt ohne Feldrahmen/Ziehleiste (`.box.ofc-sheet`), Statusleiste „Bereit ·
  Blatt x von n · Excel-Arbeitsmappe“ (beim Aufzeichnen „● Makro wird aufgezeichnet“), rechts Mittelwert/Anzahl/Summe.
  Die Leisten (Lineal, Notizen) werden nur für die noch offene Seite gezeichnet (`onView` prüft `this.p === Canvas.page`).
- **Neue Register:** Word **Entwurf** (Seitenfarbe → `w:background` + `w:displayBackgroundShape` in settings.xml, legt
  settings.xml an, wenn sie fehlt; Dokumentformatierung = Formatvorlagen) und **Referenzen** (Inhaltsverzeichnis aus
  Überschrift 1–3 mit Füllpunkten bis zur Seitenzahl – mit der Schrift des Textes ausgemessen –, Datum, Wörter zählen).
  PowerPoint **Übergänge** (Ohne, Schnitt, Verblassen, Schieben, Wischen, Teilen, Aufdecken = `p:pull`, Bedecken =
  `p:cover`, Form = `p:circle`, Auflösen, Zoom; Dauer; Für alle übernehmen; Klick spielt die Vorschau an Ort und Stelle,
  `Show.previewAt`) und **Animationen** (Eintritt: Erscheinen, Verblassen, Hineinfliegen, Zoom, Wischen; Start beim
  Klicken / mit / nach Vorherigem; Dauer; Früher/Später; Nummern an den Feldern nur in diesem Register,
  `body.show-anim .box[data-anim]::before`). Excel **Entwicklertools** (Makros, Makro aufzeichnen, Neues Makro,
  Funktionen, Add-Ins, Vorlage speichern + Knöpfe der Add-Ins). Überprüfen überall: Grammatik ein/aus, Wörterbuch
  hinzufügen, Schriftart hinzufügen. Schriftart-Liste im Register Start: „＋ Schriftart hinzufügen …“.
- **Übergänge/Animationen in der Datei** (`OfficeAnim.read/write`): gelesen aus `p:transition` (auch
  `mc:AlternateContent`/`p14:dur`) und den Eintrittseffekten in `p:timing` (presetClass entr; andere Effekte →
  `animOther`, bleiben unverändert, Hinweis beim Ändern). Geschrieben nur bei Änderung (`f.ox.trDirty`, `animDirty`):
  `<p:transition spd>` nach `p:clrMapOvr`; `p:timing` wird aus den Feldern der Folie neu erzeugt (presetID appear 1,
  fly 2, fade 10, wipe 22, zoom 53; Klick-Gruppen als `clickEffect`, mit/nach als `withEffect`/`afterEffect`; `bldLst`
  mit `bldP` für Textformen). Feld-Angabe `b.anim = { fx, start, dur, n }`. Neue Felder bekommen ihre spid aus
  `writeSlide` (`newIds`).
- **Vorführen in Schritten** (`office-show.js`): `Show.stepsOf(f, p)` gruppiert die Effekte (Klick = neuer Schritt),
  animierte Felder sind beim Folienwechsel unsichtbar, Weiter/Klick spielt den nächsten Schritt (Web Animations API),
  erst danach kommt die nächste Folie; Zurück zeigt die vorige Folie fertig aufgebaut. Übergang zwischen Folien in
  `.sh-wrap` (alte Folie bleibt darunter bis zum Ende). Die Folien-Darstellung (`.sh-slide`) ist überall gleich:
  Vorführen, Miniaturen, Vorschau.
- **Notizen neu anlegen** (`OfficePpt.ensureNotesMaster`): hat eine Folie noch keine Notizenseite, entsteht
  `ppt/notesSlides/notesSlideN.xml` (Platzhalter Folienbild + Text), Beziehungen Folie ↔ Notizen ↔ Notizenmaster; fehlt
  der Notizenmaster (leere Vorlage), wird einer angelegt – mit Kopie des Folienmaster-Designs als eigenem theme-Teil,
  `p:notesMasterIdLst` in presentation.xml. Die Seite selbst ändert sich dabei nicht (`ox.part` bleibt leer, jede
  Fassung wird aus dem Original neu erzeugt).
- **Grammatik** (`grammar.js`, ein/aus unter Überprüfen, `Store.ui.grammar`): läuft mit der Rechtschreibung
  (`Spell.scanBox` → `Grammar.scanBox`, auch wenn kein Wörterbuch geladen ist), markiert mit dem CSS Custom Highlight
  `kt-grammar` (blau doppelt unterstrichen, ändert das HTML nicht). Regeln: doppeltes Wort (nicht „die die“, „das das“,
  „that that“ …), mehrere Leerzeichen, Leerzeichen vor Satzzeichen, fehlendes Leerzeichen nach Satzzeichen/Punkt
  (Punkt + Grossbuchstabe oder + häufiges Wort wie „der“/„und“/„the“ – „datei.txt“ bleibt), Satzanfang klein (nicht
  nach Abkürzungen), Klammern unvollständig; Deutsch: Komma vor dass/weil/obwohl/damit/… (nicht nach „so“, „als“,
  „ohne“ …), seid/seit, Genitiv-Apostroph; Englisch: a/an, „i“, could/should of, alot, their is, its a. Sprache je
  Feld nach häufigen Wörtern. Rechtsklick: Vorschlag übernehmen / Ignorieren / Grammatikprüfung ausschalten.
- **Eigene Wörterbücher** (`Spell.addDictionary`): .aff + .dic (Hunspell, z.B. aus LibreOffice) oder eine
  LibreOffice-Erweiterung .oxt/.zip (darin gesucht). Name abfragen, Code `x-<name>`, Dateien als Assets
  (`Backend.saveFile`), `Store.ui.spellCustom`; erscheinen unter Sprachen (an/aus, entfernen) und werden sofort
  eingeschaltet. Gleicher Prüfer wie die eingebauten (`spell-engine.js`).
- **Eigene Schriftarten** (`fonts.js`): .ttf/.otf/.woff/.woff2 → Asset, beim Start per `FontFace` geladen, in `FONTS`
  (Schriftart-Auswahl). Familienname aus der OpenType-Tabelle „name“ (ID 16, sonst 1; WOFF 1 entpackt), sonst
  Dateiname. In Office-Dateien steht nur der Name (wie in Office: der andere Rechner braucht die Schrift).
- **Add-Ins** (`plugins.js`): eine JavaScript-Datei ruft `KnowledgeTree.register({ id, name, version, desc,
  setup(api) })`. `api.addFunction('NAME', fn, { min, max, sig, desc })` → eigene Tabellenfunktion in Kategorie
  „Add-Ins“ (Bereiche kommen als `[[…]]`, Rückgabe ein Wert; Fehler → #WERT!), `api.addButton({ tab, mode, group,
  label, icon, run })` → Knopf im Menüband (Standard bis 1.68: Excel → Entwicklertools; seit 1.69 Register „Add-Ins“, siehe „Add-Ins 1.69“), `api.addCommand`, `api.on('cellChange'
  | 'pageOpen', fn)`, `api.sheet` (wie `kt`), `api.ui`, `api.store` (bleibt gespeichert). Verwaltung: Entwicklertools →
  Add-Ins (hinzufügen, ein/aus, entfernen, „Vorlage speichern“ = Beispiel mit =BRUTTO und =MITTELOHNENULL). Gespeichert
  in `Store.ui.plugins`, geladen in `Plugins.init` (nach `Spell.init`).
- **Makros** (`Macros`): JavaScript je Arbeitsmappe in `p.office.macros = [{ name, code }]` (bei Freiform-Seiten mit
  Tabellen `p.macros`), ausgeführt als `AsyncFunction('kt', code)` mit `kt.get/raw/set/range/setRange/sheet/sheets/
  selection/select/msg/toast/input/recalc` (Bezüge auch „Blatt!A1“), danach ein Rückgängig-Schritt. **Makro
  aufzeichnen** schreibt jede Zelländerung (`Sheet.setCells` → `Plugins.cellsChanged`) als `kt.set(…)`; Editor mit
  Hilfe-Zeile. VBA aus .xlsm bleibt in der Datei, wird aber nicht ausgeführt (Hinweis im Makro-Fenster).

### Office-Seiten bearbeiten (1.61–1.64) – `office-ppt.js`, `office-doc.js`, `office-xl.js`, `office-show.js`
- **Seitentyp beim Erstellen:** Start → **Neue Seite ▾** (Pfeil): Freiform-Seite, Dokument (Word), Tabelle (Excel),
  Präsentation (PowerPoint). Typisierte Seiten entstehen aus einem leeren, gültigen Paket (`Ooxml.blank`) und sind
  danach Office-Seiten wie importierte. Eingefügt nach der aktuellen Seite samt Unterseiten.
- **Grundprinzip:** jedes Feld kennt seine Herkunft `b.ox` (Teil + Form-ID / Knotenbereich / Zellen). Export
  (`OfficePages.current(p)`) öffnet das Original, lässt das Modul NUR Geändertes ins XML schreiben, `pkg.save()` packt
  nur berührte Teile neu → nichts geändert = Originaldatei Byte für Byte. Felder ohne Herkunft sind eigene Notizen
  (Ausnahme PowerPoint: neue Felder **auf** einer Folie werden neue Textfelder/Bilder der Folie).
- **Register „Präsentation“** (nur auf PowerPoint-Seiten): Neue Folie, Duplizieren, Löschen, Notizen, Nach oben/unten;
  Vorführen „Von Beginn an“ (F5), „Ab aktueller Folie“ (Umsch+F5), Referentenansicht ein/aus; Als PowerPoint
  speichern, Original speichern, Neu einlesen. **Register „Office-Datei“** (Word/Excel): Speichern, Original, Neu
  einlesen, Neue Seite ▾. „Aktuelle Folie“ = ausgewähltes Feld bzw. Folie in der Mitte des Sichtbereichs.
- **PowerPoint lesen:** Folie = Hintergrund-Feld (b.bg, `ox.k='folie'`, Bild = Hintergrundbild bzw. Farbfläche;
  Duoton wird für die Anzeige nachgerechnet, mittlere Farbe = `style.under` der durchsichtigen Felder für die
  Kontrastfarbe), Beschriftung „Folie n“ (`ox.k='label'`), Textfelder (`sp`), Bilder (`pic`), Tabellen (`tbl`),
  🔒 Diagramme/SmartArt/OLE (`obj`), Notizen rechts (`notiz`), Formen-Geometrie als Zeichnung (`office:'form'`, nur
  Anzeige; ganzflächige Flächen unter späteren Bildern als Hintergrund-Feld). Text: Grösse/Farbe/Schrift/fett über
  Lauf → Absatz → lstStyle der Form → Layout-/Master-Platzhalter → txStyles → defaultTextStyle; Farbschema mit
  clrMap, Folien-themeOverride, lumMod/lumOff/tint/shade; Aufzählung (buChar/buAutoNum) als Liste; normAutofit.
- **PowerPoint schreiben:** gelöschte Folien (sldId, Beziehung, Teil, Notizen, p14-Abschnitte), neue Folien (Layout
  „Leer“), duplizierte Folien (Teil + Beziehungen kopiert, Felder `ox.part='dup:<Folie>'`), Reihenfolge wie auf der
  Seite, neue Folien in den letzten Abschnitt; je Folie: verschobene/grössere Felder → xfrm um die Differenz (keine
  Rundung), geänderter Text → Absätze neu mit geklontem pPr/rPr des Originals und nur abweichenden Attributen
  (b/i/u/strike/sz/Farbe/Schrift), gelöschte Felder → Form entfernt, neue Textfelder/Bilder (WebP → PNG), geänderte
  Tabellenzellen, Notizen (nur wo eine Notizenseite existiert).
- **Vorführmodus (`Show`)**: eigene Vollbild-Darstellung aus den Seitendaten (nicht die Zeichenfläche), Folie in
  Folien-Grösse gebaut und per transform skaliert; Ebenen wie auf der Fläche. Tasten wie PowerPoint (→/←/Leertaste/
  Bild↑↓/Pos1/Ende/Zahl+Enter/B/W/Esc), Klick = weiter, Rechtsklick = zurück, Rad. Referentenansicht: nächste Folie,
  Notizen, Laufzeit, Uhr (Einstellung `Store.ui.showPresenter`).
- **Word:** Körper → Abschnitte (`p.office.map = [{i0,i1,box}]`): Absätze/Tabellen am Stück = ein Textfeld
  (`ox.k='w'`, `ox.hs` = Vergleichsschlüssel je Original-Knoten), Bild-Absätze = Bildfeld (`wimg`), Lesezeichen/
  Inhaltssteuerelemente gesperrt bzw. unberührt. Schreiben: geändertes Feld → LCS alter/neuer Absätze; gleiche
  bleiben die Original-Knoten (Felder, Kommentare, rsid …), neue/geänderte bekommen pPr/rPr eines gleichartigen
  Nachbarn; Überschrift → Formatvorlage „heading N“, Liste → vorhandene Nummerierung (sonst numbering.xml aus der
  leeren Vorlage ergänzt), Tabelle mit tblPr der Original-Tabelle. Leeres Feld = Inhalt gelöscht (Feld bleibt,
  `isEmptyBox` behält Office-Felder). Kopf-/Fusszeilen: nur Hinweis, bleiben unverändert.
- **Excel:** jedes Blatt eine Rechentabelle (`ox.k='xl'`, `ox.c0` = Rohwerte beim Import); geteilte Formeln werden
  beim Lesen verschoben; Schreiben: nur geänderte Zellen (Text als inlineStr, Zahl/Wahrheitswert, Formel in
  Excel-Schreibweise: englische Namen, Komma, `_xlfn.` für neuere Funktionen), Zellformat `s` bleibt; geteilte
  Formel betroffen → ganze Gruppe ausgeschrieben; Ergebnisse der Formeln des Blatts verworfen, `fullCalcOnLoad`,
  calcChain entfernt. Nur die ersten 60 Spalten / 3000 Zeilen werden gezeigt (Rest bleibt). Zahlenformate,
  Spaltenbreiten, Diagramme, bedingte Formate: bleiben in der Datei, sind in KnowledgeTree nicht bearbeitbar.
- **Neu einlesen:** Seiten aus 1.60 (nur Vorschau) werden bearbeitbar; sonst wird die aktuelle Fassung zur Datei der
  Seite und die Felder neu aufgebaut (eigene Notizen bleiben; neue Felder auf Folien nicht doppelt).
- **Grenzen (bewusst):** Text wird nicht vertikal verankert (oben statt Mitte/unten), Drehung nur bei Formen
  (90°), Gruppen-Felder nicht verschiebbar (nur Text), Hyperlinks in geändertem Text als Text, neue Notizen nur
  im Notizbuch, wenn die Folie keine Notizenseite hat. **Microsoft Office selbst ist ungetestet** (geprüft mit
  python-docx/-pptx, openpyxl, LibreOffice).

### Tabs und geteilte Bereiche – Nachtrag 1.57: Klick wirkt sofort
- Der erste Klick (Maus/Stift) in einen anderen Bereich macht ihn aktiv **und** wird an die Zeichenfläche
  weitergereicht (`Panes.clickThrough`: nach `activate()` liegt die echte Zeichenfläche mit gleichem Sichtbereich
  dort; derselbe pointerdown geht an das Element unter dem Zeiger) – Textfeld wählen/bearbeiten, ziehen, Rahmen
  aufziehen geht direkt. Mausrad über der Vorschau verschiebt sie weiterhin ohne Wechsel. Finger: wie bisher (erst
  aktivieren). Abschaltbar über `Store.ui.paneClickThrough = false`.

### Seite: Bildlaufleisten und Ankerpunkte (seit 1.8, wie OneNote/Excel)
- Unten und rechts je eine **schmale Bildlaufleiste** (wird beim Darüberfahren breiter). Der
  Bereich zum Scrollen ist das **Rechteck um alle Objekte** (Felder, Tabellen, Diagramme, Pakete,
  Zeichnungen, Verbindungen) plus etwas Rand (oben/links 40/30 px, unten/rechts 40 % der Fläche).
  Die vier Ecken dieses Rechtecks sind die **Ankerpunkte**.
- **Frei bewegen bleibt möglich** (Mausrad, Ziehen, mittlere Maustaste): schiebt man die Ansicht
  über den Bereich hinaus, wächst der Bereich mit (Schieber wird kleiner); zurück schrumpft er
  wieder auf die Objekte. Beim Ziehen des Schiebers bleibt der Bereich fest (keine Rückkopplung).
- Beim Scrollen leuchten die **Ankerpunkte** (L-förmige Ecken + gestricheltes Rechteck) kurz auf;
  Ansicht → „Ankerpunkte“ zeigt sie immer, „Bildlaufleisten“ schaltet die Leisten aus.
- **Pos1 / Strg+Pos1** = Ecke oben links (Anker) oben links anzeigen, **Ende / Strg+Ende** = Ecke
  unten rechts; das kleine Quadrat in der Ecke unten rechts = zum Anfang (Doppelklick = alles).
- Eine Seite, die noch nie geöffnet wurde, wird so gezeigt, dass der Anker oben links bei (40, 30)
  liegt (vorher fest (40, 30) im Weltkoordinatensystem – Inhalte mit negativen Koordinaten waren
  dann unsichtbar).

### Tabellen wie Excel (seit 1.8, Einfügen → Tabelle)
- Eigenes Objekt auf der Seite (Feld mit `b.sheet`), kein Text-HTML. Einfügen: Raster wie in
  Office (Grösse wählen), CSV importieren (auch Datei auf die Seite ziehen), **aus Excel kopierte
  Bereiche** (HTML mit `office:excel` oder mehrzeiliger Text mit Tabulatoren) werden beim
  Einfügen auf die Fläche automatisch eine Tabelle, einfache Tabellen in Textfeldern lassen sich
  per Rechtsklick „In Rechentabelle umwandeln“.
- Bedienung wie Excel: Klick = Zelle wählen (Tabelle wird aktiv: Spaltenköpfe A B C …,
  Zeilennummern, Bearbeitungsleiste über der Seite mit Namenfeld und fx), Ziehen = Bereich,
  Umschalt+Klick/Pfeile = erweitern, tippen = eingeben, F2/Doppelklick = bearbeiten, Enter/Tab =
  weiter (Tab … Tab, Enter springt zurück in die Anfangsspalte; am Ende wächst die Tabelle wie in
  OneNote), Strg+Pfeil = an den Datenrand, Esc = Tabelle verlassen (erst die Kopier-Markierung).
  Leiste oben am Feld = verschieben, Alt+Ziehen ebenso; die aktive Tabelle liegt immer oben.
- **Formeln** mit `=`: Operatoren + − * / ^ & = <> < > <= >= %, Vorrang wie Excel (−2^2 = 4,
  ^ links-assoziativ), Bezüge A1, $A$1, Bereiche A1:B5, ganze Spalten/Zeilen A:A, 1:3,
  **andere Tabellen derselben Seite** `Tabelle2!B3` bzw. `'Mein Name'!A1:A5`, **Tabellen anderer Seiten (1.26,
  wie Excel zwischen Mappen)** `[Seite]Tabelle1!B3`, `'[Fabrik A]Tabelle 1'!B2:B9`, bei gleichen Seitentiteln
  `[Abschnitt/Seite]…` bzw. `[Notizbuch/…/Abschnitt/Seite]…`, Matrixkonstanten
  {1,2;3,4}. Rund 170 Funktionen, **deutsche und englische Namen** (SUMME/SUM, WENN/IF,
  SVERWEIS/VLOOKUP, XVERWEIS, INDEX/VERGLEICH, SUMMEWENN(S), ZÄHLENWENN(S), MITTELWERTWENN,
  RUNDEN/VRUNDEN, Statistik inkl. STABW, QUANTIL, KORREL, STEIGUNG, PROGNOSE, NORM.VERT,
  BINOM.VERT; Text, Datum (Seriennummer wie Excel ab 30.12.1899), Finanzen RMZ/ZW/BW/ZINS/IKV …).
  Fehlerwerte deutsch (#DIV/0!, #WERT!, #BEZUG!, #NAME?, #ZAHL!, #NV, #ZIRKEL! bei Zirkelbezug).
  Argumente mit `;` oder `,` (Dezimalpunkt wie in der Schweiz).
- **Zeigen-Modus** wie Excel: beim Tippen einer Formel fügt Klick/Ziehen auf Zellen (auch in einer
  anderen Tabelle) den Bezug ein, Pfeiltasten ebenso; Bezüge werden farbig markiert; **F4**
  schaltet $; fehlende Klammern werden ergänzt; Syntaxfehler lassen die Bearbeitung offen.
  „fx“ = Dialog **Funktion einfügen** (Suche, Kategorien, Beschreibung).
- **Vorschläge beim Tippen (1.9 überarbeitet, in der Zelle und in der Bearbeitungsleiste):** nur
  „=“ getippt → Schnellwahl der häufigsten Funktionen als Chips neben der Zelle (Zellen darunter
  bleiben anklickbar); beim Tippen eines Namens **grauer Textvorschlag** direkt hinter der
  Schreibmarke (Rest des Namens + „(“) und eine Liste (häufige zuerst, auch englische Namen,
  ab 3 Buchstaben Wortteile wie „wert“ → MITTELWERT, Tabellennamen der Seite für `Name!`), jede
  Zeile mit Beschreibung, unten Signatur + Kategorie. **Tab, Enter oder →** übernimmt, ↑ ↓ wählt,
  Klick geht auch, Esc schliesst. In der Klammer: Signatur mit unterstrichenem aktuellem Argument.
- **Eingaben** werden erkannt: 3,5 und 1’234.5, 12%, CHF 5 / 5 €, 13.10.2026 bzw. 13.10.
  (Datum), 14:30, WAHR/FALSCH; das Zahlenformat wird dabei gesetzt. Text mit ' am Anfang bleibt Text.
- **Formate**: Fett/Kursiv/Unterstrichen/Durchgestrichen, Schriftfarbe, Füllfarbe, Ausrichtung,
  Schriftgrad (auch über das Register Start, solange eine Tabelle aktiv ist), Zahlenformate
  Standard/Zahl/Währung (CHF, €, $, £)/Prozent/Wissenschaftlich/Bruch/Datum kurz+lang/Uhrzeit/Text,
  Dezimalstellen ±, Tausendertrennzeichen ’ (de-CH). Formeln übernehmen das Format des ersten
  Bezugs (bei Summen) bzw. Datum bei Datumsfunktionen – wie Excel. Tabellenformat: Kopfzeile,
  gebänderte Zeilen, Gitternetz, Farbe. Text bricht in der Zelle um, Zahlen nicht.
- **Automatisieren**: Ausfüllkästchen (Reihen 1, 2, 3 · lineare Trends · Datum (Tage/Monate) ·
  Mo, Di · Januar · Q1 · „Woche 1“; Formeln mit relativen Bezügen; über den Rand → Tabelle wächst),
  Strg+D/Strg+R, Strg+Enter (in alle markierten Zellen), AutoSumme (Alt+=; Summe, Mittelwert,
  Anzahl, Max, Min), Sortieren (Kopfzeile wird erkannt, Formeln wandern relativ mit), Zeilen/Spalten
  einfügen/löschen **mit Anpassung aller Bezüge auf der Seite** (auch Diagrammbereiche),
  Spaltenbreite ziehen/Doppelklick = automatisch, Kopieren/Einfügen (intern mit Formeln,
  extern als Text+HTML – auch nach/aus Excel), CSV speichern, Werte an den Rechner (Listen L1–L3).
- **Statusleiste** zeigt für markierte Bereiche Mittelwert, Anzahl, Summe (wie Excel).
- **Aktualisieren (1.9, ressourcenschonend):** eine Änderung rechnet nur die betroffene Tabelle neu,
  dazu alle Tabellen, die (auch über Umwege) mit `Name!A1` darauf verweisen, und Tabellen mit
  HEUTE/ZUFALLSZAHL/INDIREKT; nur deren Diagramme werden neu gezeichnet – und nur, wenn sich ihre
  Werte wirklich geändert haben. In der Tabelle werden nur die Zellen angefasst, deren Anzeige sich
  ändert. Formeln werden einmal geparst und gemerkt.
- **Bezüge über Seiten und Neuberechnung wie Excel (seit 1.26):** eine Arbeitsmappe über **alle Seiten**
  (`Sheet.book()`, Tabellen-ID `Seite/Feld`). Die Mappe merkt sich je Formelzelle, welche Bereiche sie gelesen hat
  (`prec`, umgekehrt `rdep`); eine Änderung (`Sheet.markDirty(id, Zellen)`) vergisst nur die geänderten Zellen und
  alle Formeln, die – auch über andere Seiten und Umwege – davon lesen, plus die flüchtigen (HEUTE, JETZT,
  ZUFALLSZAHL, INDIREKT, BEREICH.VERSCHIEBEN). Gerechnet wird erst beim Anzeigen (andere Seiten erst beim Öffnen);
  neu gezeichnet werden nur Tabellen der offenen Seite mit betroffenen Zellen und Diagramme, deren Bereich etwas
  davon zeigt. Seitenwechsel, Rückgängig, Neu laden: nur Tabellen mit neuem Inhalt werden vergessen; Aufbau
  geändert (Tabelle/Seite neu, gelöscht, umbenannt, verschoben): alles neu (billig, weil erst beim Anzeigen
  gerechnet wird). **Berechnung manuell** (Register Tabelle → Bezüge → Berechnung, Einstellungen → Formeln):
  nur die geänderten Zellen, Statusleiste „Berechnen (F9)“, **F9** rechnet Ausstehendes, **Strg+Alt+F9** alles.
  Gleichnamige Seiten: zuerst die mit dieser Tabelle, dann im selben Abschnitt, im selben Notizbuch, sonst die
  erste im Baum (`Sheet.resolvePage`). Seiten, Abschnitte und Tabellen **umbenennen, Seiten/Abschnitte
  verschieben** passt `[…]`-Bezüge an (`Sheet.keepRefs`: vorher auflösen, danach den kürzesten eindeutigen Pfad
  schreiben); Zeilen/Spalten einfügen/löschen verschiebt Bezüge **auf allen Seiten**; alle betroffenen Seiten
  kommen in denselben Rückgängig-Schritt. Rechtsklick **Verknüpfung einfügen** (wie Excel „Verknüpfen“: kopierte
  Zellen als Formeln, eine Zelle absolut, ein Bereich Zelle für Zelle – auch von einer anderen Seite) und
  **Bezug kopieren** (`[Seite]Tabelle1!B2:B9` als Text); Formeln von einer anderen Seite eingefügt bekommen für
  Bezüge auf andere Tabellen der Quellseite deren Seite davor. Nach `[` schlägt die Formel Seiten und Tabellen
  vor; das Namenfeld springt mit `[Seite]Tabelle1!A1` zur Zelle; eine Formel mit Seitenbezug übernimmt das
  Zahlenformat der Quelle.
- **Nachtrag 1.54 – Verschieben und Zeigen wie Excel:** markierte Zellen am **Rand ziehen** verschiebt sie (Strg =
  kopieren; grüne Vorschau), markierte **Zeilen-/Spaltenköpfe ziehen** verschiebt ganze Zeilen/Spalten (Einfügelinie);
  **Alt+Umschalt+Pfeile** und Kontextmenü „Zeilen nach oben/unten, Spalten nach links/rechts“. Formeln auf allen Seiten
  wandern mit (`moveBlock`, `moveRows`, `moveCols`, `permRefs`/`moveRefs`); ein Bereich, der den ganzen Block enthält,
  bleibt. **Zeigen:** sobald eine Zelle mit „=“ beginnt (auch nur „=“) oder nach einem Operator, setzt ein Klick auf
  eine andere Zelle deren Bezug ein, Ziehen einen Bereich, Klick auf einen Spalten-/Zeilenkopf `A:A` bzw. `3:3`.
- Tabellen lassen sich umbenennen (Doppelklick auf den Namen in der Leiste, Register Tabelle):
  Formeln in anderen Tabellen werden mit umbenannt (seit 1.26 auch `[Seite]Name!` auf anderen Seiten). Namen sind
  pro Seite eindeutig.
- Suchen findet Text in Tabellenzellen (Rohwerte).

### Diagramme (seit 1.8, Einfügen → Diagramm bzw. Register Tabelle → Diagramm)
- Typen **Säulen, Balken, Linie, Fläche, Punkte (XY), Kreis, Ring**; aus der Auswahl (eine Zelle
  = zusammenhängender Bereich wie Excel) oder – ohne Tabelle – mit Beispieldaten samt Tabelle.
  Kopfzeile/Kategorien/x-Werte werden wie in Excel erkannt (Text oder Datum in der ersten Spalte
  = Kategorien; bei XY erste Spalte = x), Reihen in Spalten oder Zeilen umschaltbar.
- **Bereich wächst mit den Daten (1.9, wie eine Excel-Tabelle):** Diagramme aus einer einzelnen
  Zelle/der ganzen Tabelle merken „automatisch“ (`src.auto`); neue Zeilen oder Spalten, die direkt
  anschliessen, kommen sofort dazu (Dialog: „Bereich wächst mit den Daten“; ein von Hand getippter
  Bereich schaltet das aus).
- **Live verknüpft**: ändern sich die Zellen, ändert sich das Diagramm; die letzten Werte stehen
  zusätzlich im Diagramm (`chart.cache`), es bleibt also lesbar, wenn die Tabelle gelöscht wird
  (rot gestrichelter Rand = Quelle fehlt).
- Optionen (Register **Diagramm** oder Doppelklick → Dialog mit Vorschau): Titel, Achsentitel,
  Legende, Gitternetz, Datenbeschriftung, Punkte, geglättet, gestapelt, 5 Farbschemata, Höhe;
  **Trendlinie** linear/exponentiell/logarithmisch/Polynom 2./Potenz mit **Gleichung und R²**.
  Achsen mit „schönen“ Teilungen, Achsenbeschriftung im Zahlenformat der Quelle (z.B. CHF).
- **Daten auslesen**: Zeiger auf einen Punkt/Balken/Sektor = Tooltip mit Reihe, Kategorie, Wert;
  bei Linie/Punkte/Fläche **zwischen den Punkten** interpolierte Werte aller Reihen, Trendwert und
  (XY) die Koordinaten unter dem Zeiger mit Hilfslinie; **Klick auf einen Datenpunkt** wählt die
  Quellzelle in der Tabelle; „Werte anzeigen“ = Liste aller Werte (kopierbar, inkl. Gleichung);
  „Als Tabelle“ = Werte als neue Tabelle; „Daten markieren“ = Quellbereich zeigen.
- Grösse: rechte Kante (Breite) oder Ecke unten rechts (Breite und Höhe). Im dunklen Design
  dunkel gezeichnet.

### Taschenrechner (seit 1.8, 1.9 neu aufgebaut · Knopf in der Titelleiste, Einfügen → Rechner, Alt+R)
- Schwebendes Fenster: Titelleiste ziehen = verschieben, „–“ = minimieren (kleine Pille mit dem
  letzten Ergebnis, verschiebbar, Klick = öffnen), „×“ = schliessen. **Grösse**: an **jeder der vier
  Ecken** ziehen (die gegenüberliegende Ecke bleibt stehen; unten rechts sichtbar, die anderen zeigen
  sich beim Darüberfahren) oder Strg+Mausrad (60–220 %). **Doppelklick auf den oberen Rand** (oder auf
  eine Ecke) = Standardgrösse 100 %, die Ecke oben links bleibt stehen. Lage, Grösse, Art, Modus,
  Speicher, Verlauf und Listen bleiben gespeichert (`Store.ui.calc`).
- **Zwei Arten, Knopf oben** (wie Handy/Windows): **⇄ Standard** = einfacher Taschenrechner wie
  Windows „Standard“ (MC MR M+ M−, %, CE, C, ⌫, ¹⁄ₓ, x², √x, ÷ × − +, +/−, =, Vorschau „= …“
  unter der Eingabe, = nochmals wiederholt die letzte Operation, Ergebnisse immer dezimal; 50 + 10 %
  = 55, 50 × 10 % = 5) und **⇄ Wissenschaftlich** = TI-30X Plus MathPrint.
- **Tastenfeld genau nach der Vorlage (Europa)**, 2nd-Beschriftung blau über der Taste:
  `2nd · mode/quit · delete/insert · Pfeilfeld` · `ln log · math · data/stat-reg/distr` ·
  `e□10□ · EE · ! nCr nPr/random · table/expr-eval · clear` · `π e i/complex · sin sin⁻¹ · cos cos⁻¹ ·
  tan tan⁻¹ · ÷/%` · `x□/ⁿ√ · n/d / 1/□ · (/constants · )/op · ×/set op` · `x²/√ · 7/U n/d · 8/convert ·
  9/base n · −/◄◐` · `x yzt abcd/clear var · 4/D · 5/E · 6/F · +/◐►` · `sto→/recall · 1/A · 2/B · 3/C ·
  ◄►≈/f◄►d` · `on/off · 0/reset · ./, · (−)/answer · enter`. **Mehrfachtasten** wie im TI-Handbuch:
  ln → log → logBASE, e^□ → 10^□, π → e → i, ! → nCr → nPr, sin → sin⁻¹ → sinh → sinh⁻¹,
  x → y → z → t → a → b → c → d. **2nd gedrückt: die Beschriftungen tauschen** (Zweitfunktion gross auf
  der Taste, blau; Tasten ohne Zweitfunktion werden blass).
- **Brüche (1.9 repariert)**: n/d ohne Zahl davor = leere Vorlage, Schreibmarke im Zähler; ▼ = Nenner,
  ▲ = Zähler, ► = aus dem Bruch heraus. Mit Zahl davor wird sie der Zähler (wie TI). 2nd 7 = gemischte
  Zahl, 2nd n/d = Kehrwert 1/□. Tastatur: `/` = Bruch, `:` = geteilt.
- **Exakte Ergebnisse** wie MathPrint (Brüche, Wurzeln, π-Vielfache), ◄►≈ schaltet exakt ↔ dezimal,
  2nd ◄►≈ = Bruch ↔ Dezimal (auch 0.75 → 3/4). Modus: DEG/RAD/GRAD, FLOAT/FIX, NORM/SCI/ENG,
  Ergebnis AUTO/DEZIMAL, n/d oder U n/d, REAL/a+bi/r∠θ (komplexe Zahlen), Kontrast (2nd − / 2nd +).
- Menüs: **math** (n/d◂▸Un/d, lcm, gcd, ▸Pfactor, **sum( Σ und prod( ∏ über x** als Vorlage,
  logBASE, ˣ√, |x|; Register NUM, DMS, R◂▸P, HYP), **constants** (20 Konstanten wie im TI-Handbuch,
  NIST), **convert** (Einheiten), **base n** (▸Hex/Bin/Oct/Dec, ʰ ᵇ ᵒ ᵈ, and/or/xor/xnor/not),
  **complex**, **random**, **recall**, **op / set op** (Operation speichern und wiederholt anwenden, mit
  Zähler), **expr-eval** (Ausdruck mit Variablen, fragt die Werte ab), **data** (Listen L1–L3, auch aus
  der markierten Tabelle) und **stat-reg/distr** (1-/2-Var-Statistik, LinReg, QuadReg, ExpReg, LnReg,
  PwrReg, Verteilungen), **table** (Wertetabelle f(x)).
- **Rechenverlauf** im Anzeigefeld (Rechnung als Schulbuch-Formel, Ergebnis rechts): Klick auf eine
  Rechnung übernimmt sie, Klick auf ein Ergebnis fügt den Wert ein (exakte Form als Vorlage);
  ▲ ▼ + enter wie beim TI. Knöpfe oben: Ergebnis in die Seite (Schreibmarke, aktive Tabellenzelle oder
  Textfeld) und ganzen Verlauf als Textfeld.
- Tastatur bei fokussiertem Rechner: Ziffern, + − * / : ^ ( ) . , ! %, Enter/= rechnen, Rücktaste,
  Esc, Pfeile, x y z t a b c d, p = π, r = √, i = komplex, Strg+C kopiert das Ergebnis.

### Abschnittsbereich: Ziehen & Ablegen (1.49, `Sidebar.initDnD`)
- Ziel nach **Koordinaten**: die nächste Zeile zählt, auch in den Lücken, links/rechts daneben und bis 28 px über/unter
  der Liste (`document`-weites `dragover`); unter der letzten Zeile = ans Ende der obersten Ebene. Zwischen Geschwistern
  breitere Tausch-Zonen (davor/danach je 36 %, nur das mittlere Drittel = hinein). Deutliche Einfüge-Linie mit Punkt.
- **Finger/Stift:** 0,3 s halten, dann ziehen (schwebende Vorschau `.nav-ghost`, Scrollen gesperrt, `touchmove`
  preventDefault); funktioniert für Notizbuch-Baum, Abschnitt-Register und Seitenliste. Langes Halten ohne Bewegung
  bleibt das Kontextmenü.

### Dunkles Design: Schwarz lesbar (1.49)
- Schwarze/graue **Tinte** im dunklen Design: Mittelgrau **#8e8e8e** (Kontrast 5,3:1 auf #1b1b1b und 3,3:1 auf Weiss –
  lesbar auf dem Hintergrund und auf weissen Bildern/PDF-Seiten; bis 1.48 fast weiss #e6e6e6). Farbige dunkle Tinte
  (Dunkelblau …) wird in ihrem Farbton aufgehellt (`inkDarkShown`, als `--kd` am Strich, CSS `.kbf/.kbs`).
- **Textmarker (1.51):** im dunklen Design normal halbdurchsichtig (Deckkraft 0,46) statt `mix-blend-mode: screen` –
  sichtbar auf dem dunklen Hintergrund und auf weissen Bildern/PDF-Seiten (hell: weiterhin `multiply`, 0,5).
- Fest **schwarzer Text** (`Contrast.readable`): ebenfalls Mittelgrau (heller bis Kontrast 4,5 auf dem Untergrund)
  statt fast weiss; automatische Schrift (keine Farbe gewählt) bleibt hell.

### Rechtschreibung (seit 1.38, wie OneNote; `spell-engine.js`, `spell.js`, `spell-fach.js`, `dict.go`)
- **1.42:** zusätzlich **Französisch** (`fr-FR`, LibreOffice `fr_FR/fr`, npm `dictionary-fr@3`) und **Latein** (`la`,
  `la/la`, npm `dictionary-la@3`) – in `SPELL_LANGS` und `dictSources`. Französische Elision (l'homme, d'accord,
  qu'il, jusqu'à …): ist das ganze Wort unbekannt, zählt das Wort nach dem Apostroph. Fachwörter nur DE/EN.
- **Rote Wellenlinie** unter unbekannten Wörtern in Textfeldern, während man schreibt – das Wort an der Schreibmarke
  erst, wenn man es verlässt. Nicht geprüft: Formeln, Code, Links, Anhänge, Tabellen, Abkürzungen in Grossbuchstaben
  (DNA, CHF), Wörter mit Grossbuchstaben im Inneren (pH, mRNA), Zahlen-Wort-Mischungen (CO2, H2O), Adressen/Pfade.
- **Rechtsklick** (Finger: lange drücken) auf ein unterwelltes Wort: bis 6 **Vorschläge** zuoberst, **Ignorieren**
  (diese Stelle), **Alle ignorieren** (diese Sitzung), **Zum Wörterbuch hinzufügen**, Rechtschreibprüfung … Ersetzen
  ändert nur den Text des Wortes (Formatierung bleibt), Strg+Z macht es rückgängig.
- **F7** bzw. **Überprüfen → Rechtschreibung**: Fenster wie in OneNote, geht die Seite Wort für Wort durch (Felder
  von oben nach unten): Wort im Satz, Vorschläge (Doppelklick = ändern), eigenes Feld, **Ändern**, **Alle ändern**
  (ganze Seite, ein Schritt), **Ignorieren**, **Alle ignorieren**, **Hinzufügen**; das aktuelle Wort ist gelb
  markiert und wird ins Bild geholt. Handy: Fenster unten, Knöpfe fingergross.
- **Sprachen:** Deutsch (Schweiz) und Englisch (USA) voreingestellt, dazu Deutsch (Deutschland) und Englisch (GB) –
  mehrere gleichzeitig: ein Wort ist richtig, wenn es eine der gewählten Sprachen kennt (gemischte Texte, englische
  Fachbegriffe). **Fachwörter** (an/aus): rund 900 Begriffe aus Chemie, Physik, Biologie, Medizin, Mathematik,
  Informatik (DE/EN) plus alle Element- und Molekülnamen aus Chem-Draw; übliche Endungen gelten mit. **Eigenes
  Wörterbuch** (`Store.ui.spell.user`): Überprüfen → Eigenes Wörterbuch … (ein Wort pro Zeile).
- Register **Überprüfen** (neu): Rechtschreibung (F7) · Fehler anzeigen · Sprachen ▾ · Fachwörter · Eigenes
  Wörterbuch … · Wörterbücher neu laden · Fotomath. Einstellungen → **Sprache**: dasselbe plus Zustand der
  Wörterbücher.
- **Wörterbücher:** die Hunspell-Dateien von LibreOffice (`de_CH_frami`, `de_DE_frami`, `en_US`, `en_GB`), beim
  ersten Gebrauch einmal geladen (jsDelivr → GitHub → npm-Paket `dictionary-*` als Ersatz). Webseite: danach in
  einer eigenen IndexedDB `KnowledgeTree-Woerterbuch`; Programm: `/api/woerterbuch?l=de-CH&f=dic` lädt sie einmal
  und legt sie in **Cache/Woerterbuch** ab (danach ohne Internet; `neu=1` lädt neu, misslingt das, bleibt das alte).
  Ohne Netz und noch nie geladen: Hinweis, und die **Rechtschreibprüfung des Browsers** springt ein (spellcheck an
  den Textfeldern); sobald die eigene arbeitet, ist die des Browsers aus (keine doppelten Wellen).
- **Prüfung** (`SpellEngine`, eigener kleiner Hunspell-Leser, keine fremde Bibliothek): SET (UTF-8/ISO8859-1),
  FLAG char/long/num/UTF-8, AF-Aliase, PFX/SFX mit Bedingung und Fortsetzungsklassen (zweistufige Endungen,
  Vorsilbe + Endung), NEEDAFFIX, ONLYINCOMPOUND, FORBIDDENWORD, KEEPCASE, COMPOUND-Flags, REP, TRY, ICONV, KEY.
  Grossschreibung am Satzanfang erlaubt. Für Deutsch zusätzlich zusammengesetzte Wörter aus 2–3 bekannten Teilen
  mit Fugen (s, es, n, en, e, er, ns, auch ohne End-e: Schul|haus). Vorschläge: Gross/klein, REP-Tabelle, Umlaute,
  ein Fehler (löschen, vertauschen, ersetzen mit Tastatur-Nähe, einfügen), in zwei Wörter teilen, bei wenigen
  Treffern zwei Fehler.
- **Anzeige** über die CSS Custom Highlight API (`::highlight(kt-spell)`, `kt-spell-cur`) – nichts davon landet im
  gespeicherten HTML. Geprüft wird nach Änderungen (MutationObserver auf den Textebenen) in Häppchen von ~12 ms.

### Fotomath (seit 1.9, Einfügen → Fotomath, Zeichnen → Umwandeln, Überprüfen → Fotomath, Alt+M)
- **Rahmen um eine handgeschriebene Rechnung ziehen** (oder vorher Striche mit dem Lasso auswählen,
  dann Fotomath bzw. Rechtsklick „Fotomath: Rechnung erkennen“). Erkannt werden Ziffern, + − × · ÷ :
  = ( ) . π x y, **Brüche** (Bruchstrich mit Zähler und Nenner, auch verschachtelt), **Hochzahlen**,
  **Wurzeln** (auch mit separatem Dach), Dezimalpunkt vs. Malpunkt (nach Höhe), kleines x zwischen
  Zahlen = mal. Unterstreichungen werden ignoriert.
- Über jedem erkannten Zeichen steht ein kleines **Etikett** (rot = unsicher „?“); **Klick** = Liste
  der Alternativen, „Ignorieren“ nimmt Striche heraus. Korrekturen werden als **eigene Vorlagen**
  gespeichert (`Store.ui.inkTpl`, höchstens 160) – Fotomath lernt so die eigene Handschrift.
- Fenster: Rechnung schön gesetzt (MathML), darunter **als Text korrigierbar** (Enter = übernehmen),
  Ergebnis **exakt und dezimal**; mit „=“ ohne rechte Seite → Wert; Gleichung ohne x → ✓/✗ (stimmt?);
  **Gleichung mit x → gelöst** (linear/quadratisch exakt, sonst numerisch). **Seit 1.27 nach jeder Unbekannten
  auflösen:** jeder Buchstabe ist eine Unbekannte (im Text getippt; die Handschrift kennt x und y), über dem
  Ergebnis stehen Knöpfe „Auflösen nach x y a …“. Nur eine Unbekannte → wie bisher als Zahl; mehrere → die Formel
  wird umgestellt (`MathInk.solveFor`): Polynom bis Grad 2 in der Unbekannten → Terme sammeln, linear bzw.
  Lösungsformel (mit ±); sonst, wenn sie genau einmal vorkommt, Schritt für Schritt umkehren (Wurzel ↔ Quadrat mit
  ±, a^x ↔ Logarithmus, ln ↔ e^, sin ↔ arcsin …). Vereinfacht mit Brüchen, gleichen Termen, gekürzten Faktoren,
  Doppelbrüchen (1/f = 1/b + 1/g nach g → g = f·b/(b − f)). Knöpfe: **= Ergebnis
  daneben** (Formel rechts neben die Handschrift), **Als Formel** (ganze Rechnung darunter),
  **Ersetzen** (Handschrift → Formel, Strg+Z), **Im Rechner**, **Kopieren**.
- **Rechenweg (seit 1.38, wie die App Photomath, `mathsteps.js`):** unter dem Ergebnis „Rechenweg ▾ (n Schritte)“ –
  jede Zeile mit Erklärung. Rechnungen: Klammer zuerst („In der Klammer: …“), Potenzen und Wurzeln (√9 = 3, denn
  3² = 9; √12 = 2√3), Punkt vor Strich, Brüche (auf den gemeinsamen Nenner bringen mit kgV, Zähler zusammenfassen,
  Kürzen, Zähler mal Zähler, durch einen Bruch teilen = mit dem Kehrwert malnehmen), Dezimalzahlen bleiben dezimal,
  Division durch 0 wird erklärt; am Ende andere Formen (gemischte Zahl, Dezimalzahl, Näherung bei Wurzeln und π).
  Gleichungen: Klammern auflösen/zusammenfassen und ordnen, Seiten tauschen (Unbekannte nur rechts oder rechts mehr
  davon), Umformungen auf beiden Seiten mit Angabe „| −3“, „| +5“, „| :2“, „| ·(−1)“; quadratisch: nach x² auflösen
  und Wurzel ziehen (±), x ausklammern oder Mitternachtsformel mit a, b, c und Diskriminante; Formeln mit Buchstaben
  (U = R·I nach I: Seiten tauschen, | :R).
- **Als Text einfügen (1.38):** „Ergebnis“ (eine Zeile: 3/4 + 1/2 = 5/4 = 1 1/4 = 1.25) oder „Mit Rechenweg“ (Zeile
  für Zeile, Erklärungen grau dahinter) als Textfeld unter die Handschrift; mit mathematischen Zeichen (· − ² ³ √ π ±
  ≈ ⇒ ₁ ₂) oder mit Häkchen **„nur Tastaturzeichen“** (* - ^ sqrt() pi +- ~ =>). „Kopieren“ nimmt dieselbe Form
  (mit Rechenweg, wenn er aufgeklappt ist). Gemerkt in `Store.ui.fotomath {steps, ascii}`.
- **Erkennung mit Zusammenhang (1.38):** ergibt die beste Lesart keine gültige Rechnung (zwei Rechenzeichen
  hintereinander, Klammer ohne Partner, „?“, Punkt ohne Ziffer …), probiert Fotomath die nächstbesten Lesarten der
  unsicheren Zeichen – eine, dann zwei gleichzeitig – und nimmt die gültige mit dem kleinsten Abstand. So
  korrigierte Zeichen haben ein **blaues Etikett** („aus dem Zusammenhang“). Bild-Test: 151 → 155 von 168 richtig.
  Getippte Rechnungen werden toleranter gelesen: ² ³ ⁻¹ und **, ½ ¼ ¾ ⅓ ⅔, Dezimalkomma, 3x4 = 3 × 4 (ohne
  Gleichung), ÷ : /, sqrt, pi.
- **Bilder (Beta):** liegt im Rahmen keine Tinte, aber ein Bild (Scan, Foto), wird der Ausschnitt in
  Graustufen gelesen (Schatten ausgeglichen, Häuschenpapier-Linien entfernt), in Striche verwandelt
  und gleich erkannt. Klappt am besten mit dunkler Schrift auf hellem Papier und Zeichen, die sich
  nicht berühren. Getippte Rechnungen in Textfeldern im Rahmen werden auch gerechnet.
- **Unleserliche Handschrift (1.52, `mathink.js`):** zusätzlich zur Punktwolken-Erkennung ein zweiter Erkenner nach
  **Strichrichtungen** (5×5-Raster × 4 Richtungen + Tintendichte, geglättet; k-nächste Nachbarn über alle Vorlagen
  und 24 zufällig verzerrte Abwandlungen je Vorlage: Schräglage, Stauchung, Zittern, abgesetzte Striche,
  Überschwinger). Beide Urteile werden verrechnet (`KW = 1.6`), bei Bildern (Scan) nur der alte Erkenner. Regeln für
  Klammern (Wendung im Fenster statt Einzelwinkel) und für + / x (zwei sich kreuzende Striche). **Zerlegen nach
  Erkennung:** eine Gruppe aus mehreren Strichen, die sich schlecht als ein Zeichen lesen lässt, wird probeweise in
  Teile geteilt (nicht bei sich berührenden Strichen, Teile mindestens halb so hoch – ausser einem Minus), wenn die
  Teile zusammen deutlich besser passen (Faktor 1,18). Messung `tests/mathink/schlampig-test.js` (künstlich
  verwackelt, Stufen 0,6 / 1 / 1,35): Zeichen 73,5 → 98,5 %, 57,7 → 96,7 %, 45,5 → 89 %; ganze Rechnungen bei
  Stufe 1: 15,8 → 72,5 %. Bekannte Grenzen: sich berührende Ziffern („56“ → 4), ein Minus, das an der Ziffer klebt.
- **Werkzeuge wie Derive/Photomath (1.52, `mathcas.js`):** über dem Ergebnis Knöpfe je nach Rechnung –
  bei einem Ausdruck mit Unbekannten **Ableiten** (Summen-, Faktor-, Potenz-, Produkt-, Quotienten-, Kettenregel;
  e^x, ln, log, sin, cos, tan, √, mit Rechenweg u/w, u′/w′), **∫ Integrieren** (Grundintegrale, lineare Substitution,
  f′/f → ln|f|, partielle Integration für xⁿ·e^(ax), xⁿ·sin/cos, xⁿ·ln x; immer Probe durch Ableiten; mit Grenzen
  „von … bis …“ = Fläche, exakt und mit Simpson-Regel kontrolliert, Polstelle im Intervall wird gemeldet, ohne
  Stammfunktion numerisch), **Faktorisieren** (ausklammern mit ggT und gemeinsamen Buchstaben, 1.–3. binomische
  Formel, Nullstellen raten (Teiler) + Polynomdivision, Vielfachheit; irrationale/komplexe Reste werden erklärt),
  **Ausmultiplizieren**, **Kurvendiskussion** (Ableitungen, Definitionsbereich/Polstellen, Symmetrie, periodisch →
  eine Periode, Nullstellen exakt (√3 statt 1,73…) oder genähert, y-Achsenabschnitt, Hoch-/Tief-/Sattelpunkte mit f″,
  Wendepunkte mit Vorzeichenwechsel, Verhalten im Unendlichen) mit **Graph** (SVG, besondere Punkte markiert,
  „Graph einfügen“ = PNG-Bild unter die Rechnung), **Taylor** (Grad und x₀ wählbar, Graph Funktion/Näherung).
  Bei einer Gleichung mit einer Unbekannten: **Graph** beider Seiten (Lösung bleibt stehen); bei einer ganzen Zahl:
  **Primfaktoren**. „f(x) = …“ (Buchstabe(Unbekannte) = …) ist eine Funktion → gleich Kurvendiskussion.
  **Lineare Gleichungssysteme:** mehrere Zeilen Handschrift untereinander, jede mit „=“ (`Fotomath.rows` – grosse
  senkrechte Lücke = neue Zeile, Schreibreihenfolge innerhalb der Zeile bleibt), oder getippt mit „;“ → Gauss wie in
  der Schule (ganzzahlig: „2·II − I“, gekürzt), Widerspruch / unendlich viele Lösungen mit freier Unbekannten, Probe.
  **Ungleichungen** (getippt < > ≤ ≥ <= >=): linear mit „Zeichen dreht sich“ beim Teilen durch Negatives, sonst
  Nullstellen + Polstellen + Vorzeichen je Bereich → Lösungsmenge in Intervallschreibweise (]−∞; −2[ ∪ ]2; ∞[).
  **ggT/kgV** über Primfaktoren. **Befehle wie in Derive** im Textfeld: `d/dx …`, `∫ … dx`, `∫[0;2] … dx`,
  `faktor(…)`, `ausmultiplizieren(…)`, `ggT(12; 18)`, `kgV(4; 6)`. Alle Werkzeuge mit Rechenweg, „Als Text
  einfügen“ (auch Tastaturzeichen), „Ergebnis daneben“, „Als Formel“, „Kopieren“. Das Fenster scrollt und bleibt im
  Bildschirm. Behoben nebenbei: bei einer reinen Rechnung überschrieb „Keine Rechnung erkannt“ das Ergebnis in der
  Anzeige (Rechenweg war richtig); `MathInk.sym.expand` lief bei (a + b)² endlos (Fallstrick 129).

### Erste Schritte (seit 1.9; seit 1.36 für alle Funktionen, `web/js/guide.js`)
- **13 Seiten** im Abschnitt „Erste Schritte“ (`Guide.ORDER`): **Willkommen** (wozu KnowledgeTree da ist: Notizbuch
  wie OneNote + Wissensnetz wie Obsidian + Werkzeuge zum Lernen und Rechnen; Bedienung, Paket, Verbindungen,
  Checkliste, **Wegweiser** zu allen Seiten), darunter als Unterseiten: Zeichnen & Formen, Seiten/Abschnitte/
  Notizbücher, Tabellen & Formeln, Diagramme, Rechner & Fotomath (die ersten sechs in derselben Reihenfolge und mit
  denselben ersten Feldern wie bis 1.35), neu **Text & Formatieren** (Formatvorlagen, Feldstile, Listen, Checkliste,
  Link als Beispiel), **Knowledge Tree** (lebende Mindmap: Thema, Zweige, Paket, beschriftete/gestrichelte/eckige
  Linien), **Formeln & Chemie** (gesetzte Formeln über `Formula.spanHtml`, Chemie im Text, Chem-Draw/Periodensystem),
  **Bilder, Dateien & Videos**, **Tabs, Ansicht & Handy**, **Speichern, Import & Export** (wo alles liegt, je nach
  Programm/Browser), **Die wichtigsten Tasten** (als Tabelle zum Sortieren/Suchen).
- Jede Seite: Titel mit dem Zweck, blau **„So geht’s“** (kurze Schritte), grün **„Probier es aus“** (Checkliste mit
  Aufgaben an den Beispielen der Seite), dazu echte Beispiele.
- Seiten tragen `guide` (Schlüssel) und `guideV` (Inhaltsstand, `Guide.V`; 1.36 = 2, 1.37 = 3, 1.38 = 4). Datei → Hilfe → **Alle
  Erste-Schritte-Seiten** (`Guide.openAll`): fehlende werden an ihrem Platz ergänzt, **unveränderte** ältere
  (nie bearbeitet: `modified ≈ created`, auch die Willkommens-Seiten bis 1.35 ohne `guide`, erkannt am Titel)
  bekommen den neuen Inhalt, **bearbeitete bleiben** – ein Schritt für Strg+Z. Einzelne Kacheln = `Guide.open(k)`.
- Neue Benutzer bekommen alle im Willkommens-Notizbuch (`App.createWelcome` baut sie über `Guide.makePage`).

### Dynamisches Layout: Handy, Tablet, jede Fenstergrösse (seit 1.10)
- `Layout` (layout.js) misst bei jeder Grössenänderung (auch `visualViewport`: Bildschirmtastatur,
  Adressleiste) und setzt Klassen am `<body>`; das CSS (Abschnitt „1.10: dynamisches Layout“ am
  Ende von app.css) richtet sich nur nach diesen Klassen:

  | Klasse | wann | was passiert |
  |---|---|---|
  | `lay-wide` | ≥ 900 px breit | wie bisher (Baum + Seitenliste fest daneben) |
  | `lay-drawer` | < 900 px breit | Notizbücher und Seiten als **Schublade** (☰ oben links), Hintergrund antippen / Esc / nach links wischen / Seite wählen = zu; die Seite nutzt die ganze Breite |
  | `lay-narrow` | < 600 px breit | Schublade: Notizbücher oben (42 %), Seiten darunter |
  | `lay-phone` | < 700 px breit **oder** < 500 px hoch (bis 1100 px breit) | Titelleiste 44 px (ohne Logo, Speichern, Verlauf, ←/→; Suche als 🔍-Knopf, öffnet das Suchfeld über der Leiste), Menüband ohne Gruppennamen, kleinere grosse Knöpfe, schmale Statusleiste (ohne Hinweis/Zoom-Regler), **Dialoge als Blatt von unten** über die ganze Breite, Chem-Draw als Vollbild (hoch: Werkzeuge als Leiste oben, Angaben unten; quer: Werkzeuge links, Angaben rechts) |
  | `lay-short` | < 560 px hoch | Menüband **eingeklappt** (nur Register), Seitentitel kleiner; mit `lay-phone` auch keine Statusleiste |
  | `touch` | Finger ist der Hauptzeiger (`pointer: coarse`) | grössere Knöpfe, Menüeinträge 40 px, grössere Anfasser (Sockel, Kante, Leiste, Rechner-Ecken) |
  | `kb-open` | Bildschirmtastatur offen (Höhe ≥ 120 px kleiner bei gleicher Breite, während ein Eingabefeld aktiv ist) | Anordnung bleibt wie vorher (kein Umspringen), Statusleiste weg, Schreibmarke wird sichtbar gehalten |
  | `rb-min` / `rb-peek` | Menüband eingeklappt / gerade eingeblendet | Register antippen blendet das Menüband **über** der Seite ein; daneben tippen schliesst es (dieser Tipp erzeugt kein Textfeld) |
  | `nav-open` | Schublade offen | |

- **Menüband ein-/ausklappen:** Knopf ⌄/⌃ rechts neben den Registern, **Strg+F1** oder Doppelklick auf
  ein Register; wird in `Store.ui.ribbonMin` gemerkt (nicht gesetzt = automatisch nach Höhe). Zu breites
  Menüband: waagrecht wischen/Mausrad, am Rand ausgeblendet (`more-l`/`more-r`); das gewählte Register
  (z.B. „Tabelle“ ganz rechts) wird in den sichtbaren Bereich gescrollt.
- **Finger auf der Seite** (canvas.js): antippen auf freie Fläche = Textfeld (war etwas ausgewählt oder in
  Bearbeitung: nur Auswahl aufheben); **ein Finger ziehen = Seite verschieben** (auch auf Text, solange er
  nicht bearbeitet wird); zwei Finger = zoomen/verschieben (wie bisher `Draw.touchDown`); **lange drücken
  (520 ms) = Kontextmenü** wie Rechtsklick (auch auf Zeichnungen); Feld verschieben an der Leiste oben;
  Kontextmenü → **„Verbinden mit … (Ziel antippen)“** ersetzt das Rechtsklick-Ziehen. Neue Felder auf
  schmalen Fenstern nur so breit, dass sie nicht über den Rand ragen (160–280).
- **Lange drücken ausserhalb der Seite** (Notizbücher, Seiten, Register, Chem-Draw): erzeugt ein
  `contextmenu`-Ereignis, falls der Browser keines meldet (iPhone/iPad); der Klick beim Loslassen wird
  geschluckt.
- Nie geöffnete Seiten starten auf schmalen Fenstern so gezoomt, dass der Inhalt in die Breite passt
  (45–100 %); „Willkommen“ wird auf dem Handy nicht eingepasst.
- **Rechner** wird nie grösser als das Fenster (`Calc.applyScale` → `fitScale`), auf dem Handy ganz
  sichtbar, beim ersten Öffnen unten in der Mitte. Mit dem Finger sind **× und – immer mindestens
  ~34 px gross** (auch wenn der Rechner verkleinert ist: CSS-Variable `--cz` = aktueller Zoom, Grösse
  `calc(34px / var(--cz))`), das × hat eine erweiterte Trefferfläche und liegt über dem Ecken-Anfasser;
  die Ecke oben rechts ist dafür klein (16 px) und ragt halb über den Rand. **Fotomath-Leiste** auf dem Handy unten.
  **Popups** (Menüs) passen in jedes Fenster und schliessen nur, wenn sich die **Breite** ändert.
  Dialoge scrollen; auf dem Handy/niedrigen Fenstern bleiben die Knöpfe unten sichtbar (sticky).
- Meta-Viewport mit `viewport-fit=cover` + `interactive-widget=resizes-content`, Ränder per
  `env(safe-area-inset-*)` (Notch, Home-Leiste). Hilfe → Tastenkürzel zeigt auf Touch-Geräten zuerst den
  Abschnitt „Handy & Tablet (Finger)“.
- **Seit 1.30:** Druckdialog auf dem Handy mit der Vorschau oben (bleibt beim Blättern stehen), Massstab-Schieber
  und Druckbereich-Felder fingergross, Griffe in der Vorschau breiter; Einstellungen: das gewählte Register wird in
  der waagrecht scrollbaren Leiste ins Bild geholt. **Exportierte Webseite (nur zum Ansehen):** bis 760 px Breite
  oben eine Kopfzeile mit ☰ und dem Seitentitel, die Navigation als Schublade (Seite wählen oder daneben tippen =
  zu), die Seite scrollt in voller Breite; breite Seiten werden beim Öffnen an die Breite angepasst (frei zoombar
  mit zwei Fingern oder der Leiste, auf Touch-Geräten mit grösseren Knöpfen).

### Farben (seit 1.4)
- Jede Farbauswahl hat zusätzlich ein **Farbrad** (`UI.colorWheel`): HSV-Rad, Helligkeit,
  alt/neu-Vorschau, Hex und RGB, Grundfarben; die letzten 10 eigenen Farben stehen unter
  „Eigene Farben“ (`Store.ui.customColors`). In `UI.menu`-Farbzeilen ist es der bunte Knopf am
  Ende, im Office-Farbwähler „Weitere Farben (Farbrad) …“, im Stift-Menü ebenfalls.

### Schriftfarbe passend zum Hintergrund (seit 1.14, `contrast.js`)
- **Automatisch** (Schriftfarbe „Automatisch“ = keine Farbe gewählt): die Schrift ist eine **Tönung der
  Hintergrundfarbe** – 84–86 % Richtung Schwarz bzw. Weiss, bei mittleren Farben weiter bis mindestens
  4.5 : 1 Kontrast, **höchstens 94 %** (nie reines Weiss/Schwarz). Standardfeld hell `#292929` auf Weiss,
  dunkel `#e1e1e1` auf `#2a2a2a`; auf Gelb ein dunkles Oliv, auf Dunkelblau ein bläuliches Hellgrau.
- **Tendenz nach Design:** dunkles Design → helle Schrift, helles → dunkle. Die Gegenseite nur, wenn die
  bevorzugte unter 4.5 : 1 bliebe (z.B. hellgelbes Feld im dunklen Design → dunkle Schrift).
- **Welcher Hintergrund:** Fülleffekt des Feldes; bei unsichtbaren Feldern und Tabellen die **Seite**
  (Seitenfarbe, im dunklen Design wie angezeigt abgedunkelt: 16 % Seitenfarbe + `#1f1f1f`); sonst die
  Feldfarbe des Designs (`--box-bg`). Texthervorhebungen (eigener `background-color`) bekommen ihre
  eigene automatische Schrift (gelb hervorgehoben im dunklen Design → dunkle Schrift).
- **Fest gewählte Farben** bleiben gespeichert wie gewählt. Sind sie auf ihrem Hintergrund kaum zu
  erkennen (**unter 3 : 1**), zeigt KnowledgeTree **dieselbe Farbe heller bzw. dunkler** (Farbton bleibt,
  nur die Helligkeit ändert sich, bis 4.5 : 1). Schwarz/Weiss (und fast) wird wie automatische Schrift
  behandelt – z.B. schwarzer Text aus Word/OneNote im dunklen Design. Beispiele im dunklen Design:
  OneNote-Überschrift `#1e4e79` → `#5296d4`, Zitat `#595959` → `#919191`, Rot `#C00000` → `#ff5a5a`.
  Im hellen Design wird z.B. gelbe Schrift auf Weiss zu Oliv (`#7a7a00`).
- **Ansicht → Design → „Lesbare Farben“** (Standard: an, `Store.ui.inkFix`): schaltet nur die Korrektur
  der fest gewählten Farben aus. Die automatische Schrift passt sich immer an.
- **Tabellen:** Zellen mit Füllfarbe bekommen automatische Schrift, feste Zellfarben werden wie oben
  geprüft (auch gegen Kopfzeile/gebänderte Zeilen); die Kopfzeile ist eher hell (wie früher Weiss),
  solange 3 : 1 erreicht wird, sonst dunkel (z.B. dunkles Design: dunkle Schrift auf `#6d9ae6`).
  Links: `--auto-link` (das Blau wird auf dunklen/hellen Feldern nötigenfalls angepasst).
- Fülleffekt und Schnellformatvorlagen setzen **keine** feste Schriftfarbe mehr (früher `#252423` /
  `#F3F3F3` nach Helligkeit). Solche alten Werte gelten bei gefüllten Feldern als „automatisch“
  (`Contrast.boxColor`), die Daten werden nicht umgeschrieben.
- **Export** (PDF, Webseite, OneNote) zeigt bzw. schreibt die **gespeicherten Originalfarben**
  (`Contrast.raw` während `Export.renderEach`); die automatische Feldschrift bleibt (im hellen Design).

### Zeichnen (seit 1.2, Registerkarte „Zeichnen“)
- Werkzeuge: **Auswählen** (Esc), **Lasso** (fängt Striche, Formen und Textfelder ein),
  **Radierer** (Strich = ganze Striche, Punkt = nur die Stelle, Grösse wählbar). Der
  Radierer am Stift-Ende wirkt immer.
- **Stifte** (8 Plätze, frei einstellbar: nochmals anklicken oder Rechtsklick → Art, Farbe,
  Stärke): Kugelschreiber (druckempfindlich), Bleistift (Struktur-Filter), Textmarker
  (multipliziert über Text – echter Leuchtstift-Effekt), Regenbogen, Glitzer.
- **Formen**: Linie, Pfeil, Doppelpfeil, Rechteck, Ellipse, Dreieck, Raute,
  Koordinatenachsen; Umschalt = 45°-Schritte bzw. Quadrat/Kreis; Füllfarbe wählbar.
- **Lineal** (mit cm-Skala; Mausrad/Knopf dreht, Doppelklick = 0°): Striche, die an der
  oberen Kante beginnen, werden schnurgerade. **Winkelmesser** (nur zum Ablesen, mit cm-Teilung auf der
  Grundlinie). **Seit 1.27 in der Grösse verstellbar:** Griff am Ende (Lineal unten rechts: Länge in ganzen cm, das
  linke Ende bleibt; Winkelmesser unten links: Radius in halben cm), zweimal schnell drücken = wieder an den
  Bildschirm anpassen. Standard beim Einblenden: das Lineal füllt ~86 % der sichtbaren Breite, der Winkelmesser
  passt ganz hinein (`Draw.fitTool`, `Store.ui.ruler.len`/`protractor.r` in cm, `fix` = von Hand). Die
  **Zentimeter gelten für das gedruckte Blatt** (`Draw.cmPx`: mit den Druck-Vorgaben `Print.opts()` und der Breite
  des Seiteninhalts → `Print.layout(…).z`): passt die Seite ohne Verkleinern aufs Blatt, ist 1 cm = 37,8 Seiten-px
  (bei 100 % Zoom ≈ 1 cm am Bildschirm); wird sie beim Drucken verkleinert, werden die Zentimeter grösser und das
  Lineal zeigt „cm · Druck A4 xx %“.
- **Formerkennung** (Schalter): gezeichnete Linien, Rechtecke, Rauten, Dreiecke/Vielecke und
  Kreise/Ellipsen werden beim Loslassen sauber. **Freihand → Form** macht das nachträglich
  für ausgewählte Striche.
- **Freihand → Text (Beta):** lädt beim ersten Mal Tesseract.js (Sprache Deutsch), erkennt
  die ausgewählte Handschrift, zeigt den Text zum Korrigieren und fügt ihn als Textfeld ein.
- Ausgewählte Zeichnungen: Rahmen ziehen = verschieben (zusammen mit ausgewählten
  Textfeldern), Ecken = skalieren (Umschalt = frei), Pfeiltasten, Strg+C/X/V/D, Entf,
  Rechtsklick (Farbe, Füllung, vor/hinter den Text, umwandeln).
- **Ebene:** Zeichnungen liegen standardmässig über den Textfeldern; „Hinter den Text“
  legt sie darunter.
- **Stift auf die Auswahl (1.51, `Draw.applyPen`):** sind Striche ausgewählt, färbt ein Klick auf einen Stift der
  Galerie nur die ausgewählten Striche **derselben Stiftart** (Kugelschreiber, Bleistift, Textmarker, Regenbogen,
  Glitzer) in seiner Farbe – Auswahl und Werkzeug bleiben (Hinweis mit Anzahl). Ebenso eine Farbe im Stift-Menü.
  Farbe aus der Palette (Register Zeichnen) bei gemischter Auswahl: nur die Art des aktiven Stifts; Rechtsklick →
  Farbe färbt weiterhin alles Ausgewählte. Ohne passende Striche wählt der Klick wie bisher das Werkzeug.
- **Ebenen seit 1.46** (von unten nach oben): Hintergrund (`#layer-bg`, verankert) · Pakete · **Bilder**
  (`#layer-pics`: Felder, die nur aus einem Bild bestehen – liegen immer unter ALLEN Zeichnungen, auch unter „Hinter
  den Text“) · Zeichnungen „hinter dem Text“ · Verbindungen · Text (`#layer-boxes`) · Textmarker · Zeichnungen „vor
  dem Text“ · **vor den Zeichnungen** (`#layer-front`, `b.front`). Rechtsklick auf Bild oder Feld (auch mehrere):
  **„Vor die Zeichnungen“** bzw. **„Hinter die Zeichnungen“**; „In den Hintergrund“ nimmt `front` ebenfalls weg,
  „… als Hintergrund festlegen“ hat Vorrang. `Canvas.layerOf(b)`, `boxLayers()`, `setFront()`; `objectsAt` (Alt+Klick)
  und das Anklicken (`Draw.selectDown`: in `#layer-front` keine Zeichnung, in `#layer-pics` auch Zeichnungen hinter
  dem Text) folgen derselben Reihenfolge. Während ein Feld bearbeitet wird, wechselt es die Ebene nicht (Fokus).
- Touch: zwei Finger = zoomen/verschieben; „Nur mit Stift“ = Finger zeichnen nie.
- Sehr dunkle Tinte wird im dunklen Design hell dargestellt (wie OneNote).

### Hintergrund (seit 1.10, wie OneNote „Bild als Hintergrund festlegen“)
- **Rechtsklick** (Finger: lange drücken) auf ein Bild → **„Bild als Hintergrund festlegen“** (Häkchen,
  nochmals = wieder normal). Geht auch für Textfelder, Diagramme und Zeichnungen („Als Hintergrund
  festlegen“), nicht für Tabellen und ganze Pakete; mehrere ausgewählte auf einmal.
- Ein Hintergrund-Objekt liegt **ganz unten** (eigene Ebene `#layer-bg` unter Paketen, Verbindungen
  und allen Zeichnungen; Hintergrund-Zeichnungen zuunterst in der unteren Zeichenebene) und gehört zu
  keinem Paket (wird beim Festlegen aus dem Paket gelöst).
- **Auswahlrahmen, Lasso und Strg+A übersprangen es bis 1.46** (seit 1.47 nicht mehr, s. u.); ein Auswahlrahmen darf **auf** dem Hintergrund
  beginnen (ziehen = Rahmen, Finger: Seite verschieben). **Einzeln anklicken = nur dieses auswählen**
  (Umschalt/Strg+Klick = dazu). **Seit 1.43 verankert:** auch ausgewählt lässt es sich nicht verschieben (ziehen,
  Leiste, Pfeiltasten), nicht in der Grösse ändern, nicht bearbeiten und nicht mit Entf löschen (`Canvas.isLocked`
  gilt für `b.bg` wie für `b.locked`; Schloss-Symbol in der Leiste). Lösen nur mit Rechtsklick → „… als Hintergrund
  festlegen“ (Häkchen weg); Sperren/Entsperren fehlt dann im Menü. Hintergrund-Zeichnungen bleiben verschiebbar (bis 1.44; seit 1.45 ebenfalls verankert). **Doppelklick** auf ein
  Hintergrund-Bild/-Diagramm = neues Textfeld darauf (wie Klick auf die freie Fläche). Alt+Klick und Tab
  erreichen es (zuunterst).
- **1.45 – alle markierten:** der Rechtsklick-Eintrag „… als Hintergrund festlegen (n)“ gilt für die ganze Auswahl:
  Felder, Bilder, Inhalte markierter Pakete (Paket wird aufgelöst) und Zeichnungen – egal ob man auf ein Bild, ein
  Feld oder eine Zeichnung klickt (Rechtsklick auf ein Bild in einer Mehrfachauswahl zeigt das Menü der Auswahl).
  Ebenso lösen (Häkchen weg). Tabellen bleiben aussen vor. Seit 1.45 sind auch **Hintergrund-Zeichnungen verankert**
  (ziehen, Pfeiltasten, Entf ohne Wirkung) und **Entf löscht keine Hintergrund-Felder** mehr (Hinweis statt Löschen).
- **1.48 – getrennt nach Art:** `Canvas.bgMenuItems(boxes, draws)` liefert für die Auswahl je vorhandener Art einen
  Eintrag mit Häkchen und Anzahl: „Bild(er) als Hintergrund“, „Text(e) als Hintergrund“ (Felder mit Text, auch
  Diagramme), „Zeichnung(en) als Hintergrund“, bei gemischter Auswahl zusätzlich „Alles als Hintergrund (n)“. Im
  Menü der Felder und der Zeichnungen gleich; ein einzelnes Bild zeigt nur „Bild als Hintergrund“.
- **1.47 – auswählbar:** Strg+A, Auswahlrahmen und Lasso nehmen Hintergrund-Objekte (Felder, Bilder, Zeichnungen)
  mit; nach „… als Hintergrund festlegen“ bleiben dieselben Objekte markiert (Pakete aufgelöst) und sind sofort
  verankert. Einzeln anklicken wie bisher; ziehen auf einem nicht markierten Hintergrund-Objekt = Auswahlrahmen.
- Kein Hindernis für Verbindungen (sonst müssten alle Linien um ein ganzseitiges Bild herum), der
  Radierer erfasst Hintergrund-Zeichnungen nicht. „In den Vordergrund“ (bzw. bei Zeichnungen „Vor den
  Text“) hebt „Hintergrund“ auf.
- **OneNote:** Import setzt `bg` für Bilder mit `IsBackground` (früher: gesperrt + zuunterst), Export
  schreibt `IsBackground` für Hintergrund-Bilder (Rücktest: bleibt Hintergrund).

### Fläche und Textfelder
- Klick auf freie Fläche → neues Textfeld an dieser Stelle, Cursor sofort drin.
- Leere Felder werden nie gespeichert; sie verschwinden, sobald man woanders hinklickt.
- Verschieben: an der schmalen Leiste oben am Feld ziehen (oder Alt + ziehen).
- Breite: rechte Kante ziehen. Höhe wächst automatisch mit dem Inhalt.
- Mehrfachauswahl: Umschalt/Strg + Klick oder Auswahlrahmen auf der Fläche ziehen.
- Verschieben der Fläche: mittlere Maustaste, Leertaste + ziehen, Rechtsklick auf leere
  Fläche + ziehen, Mausrad. Zoom: Strg + Mausrad, Zoom-Regler unten rechts (seit 1.29 von 1 % bis 1000 %, Regler
  logarithmisch: 0…1000 ↔ 1 %…1000 %, 100 % bei 2/3 und eingerastet).
- Linien/Hintergrund pro Seite (siehe „Seiten“). Optional „am Raster ausrichten“
  (Raster 10 px).

### Bilder
- Hineinziehen, mit Strg+V einfügen oder über Einfügen → Bild. Strukturformeln aus Chem-Draw
  sind ebenfalls Bilder (SVG), aber mit `im.chem` (Doppelklick = bearbeiten statt gross anzeigen).
- Im Feld frei verschiebbar; **der Text fliesst herum** (Umsetzung: CSS-Floats mit
  unsichtbaren Abstandshaltern, siehe Abschnitt 8).
- Ecke ziehen = Grösse, Doppelklick = gross anzeigen, Entf = entfernen.

### Dateien anhängen und als Seiten-Bilder aufklappen (seit 1.11, wie OneNote „Dateiausdruck“)
- **Anhängen:** Datei hineinziehen, **Einfügen → Datei**, oder Strg+V. Jede Datei wird gespeichert
  (`Backend.saveFile`) und erscheint als **📎-Anhang** (`.kt-file`-Chip im Text, wie bisher bei
  OneNote-Anhängen). Ein Anhang in einem ausgewählten Feld wird dort angehängt, sonst entsteht ein
  neues Feld. Linksklick = herunterladen/öffnen (wie bisher).
- **Aufklappen:** **Rechtsklick** (Finger: lange drücken) auf den Anhang → **„Seiten als Bilder
  aufklappen“**. Die Seiten werden als normale Bilder **untereinander** unter den Anhang gelegt
  (je ein Bild-Feld, 560 px breit) – dadurch gehen sie **in beide Richtungen mit OneNote** (Export =
  Bilder, Re-Import = Bilder).
  - **PDF:** jede Seite wird mit **PDF.js** gerendert (erst bei Bedarf aus dem Internet geladen,
    feste Version – wie Tesseract bei „Freihand → Text“). Bis `MAX_PAGES` (150), Renderbreite 1500 px.
  - **Bild:** wird einfach eingefügt.
  - **Word/PowerPoint/Excel (.docx/.pptx/.xlsx):** das sind ZIP-Archive – die **enthaltenen Bilder**
    (`*/media/*`) werden herausgezogen (eigener winziger ZIP-Leser + `DecompressionStream('deflate-raw')`,
    keine Fremd-Bibliothek). Für **seitengenaue** Darstellung von Word gibt es keinen zuverlässigen
    Weg im Browser → Hinweis „in Word Speichern als PDF, dann das PDF aufklappen“.
- **Kein Schutz wird umgangen:** PDFs mit Druck-/Kopier-Einschränkungen rendern normal (diese Marken
  sind keine Zugriffssperre); ein **passwortverschlüsseltes** PDF fragt nach dem Passwort (`UI.prompt`
  mit `password:true`), es wird **nicht geknackt**.
- **OneNote-Import, fehlende Bilder:** Bilder, deren Daten **nicht in der .one-Datei** stecken
  (`fileBytes` liefert `{external}` statt Daten, z.B. in OneDrive ausgelagert), wurden früher
  **stillschweigend weggelassen**. Jetzt steht an ihrer Stelle ein **sichtbarer Hinweis**
  (`.kt-missing`); die Import-Zusammenfassung zählt sie (`stats.missingImages`). **Ausdrucke** gehören
  seit 1.13 **nicht** mehr dazu – deren Seitenbilder werden richtig gelesen (siehe „OneNote importieren“).

### Pakete (Gruppieren)
- Mehrere Felder auswählen + Strg+G → ein Paket mit Titelleiste, das alle umschliesst.
- Strg+Umschalt+G hebt es auf. Paket verschieben = Titelleiste ziehen.
- Klick in die freie Fläche **innerhalb** eines Pakets erzeugt ein Feld, das zum Paket gehört.
- Sperren (Strg+Umschalt+L): nicht mehr verschiebbar und nicht mehr bearbeitbar.

### Verbindungen („KnowledgeTree")
- **Rechte Maustaste gedrückt halten und auf ein anderes Feld/Paket ziehen** = verbinden.
  Alternativ die kleinen Punkte links/rechts am Feld ziehen.
- Beliebig viele Verbindungen pro Feld; auch **mehrere zwischen denselben zwei Feldern**
  (hin und zurück). Parallele Linien werden automatisch nebeneinander gezeichnet.
- Startet man das Ziehen nahe am Rand eines Feldes, beginnt die Linie genau dort.
- **Linie anklicken** → drei Punkte erscheinen:
  - Endpunkt ziehen = Ansatzpunkt wandert am Rand entlang; auf einem anderen Feld loslassen
    = Verbindung wird dorthin umgehängt.
  - Mittelpunkt oder die Linie selbst ziehen = Linie frei im Raum biegen/verschieben.
  - Doppelklick auf einen Punkt = zurücksetzen (wieder automatisch).
- Strg + Rechtsklick ziehen = Verbindungen durchschneiden (wie das Messer in Blender).
- Doppelklick auf die Linie = Beschriftung. Form (Kurve/Gerade/Winkel), Pfeile, Farbe,
  Stärke, gestrichelt im Menüband unter „Verbindungen".
- **Ausweichen (seit 1.9, Verbindungen → Linienform → Ausweichen, standardmässig an):** Linien gehen
  nicht durch Textfelder, Bilder, Strukturformeln, Tabellen, Diagramme oder fremde Pakete und halten
  **immer etwas Abstand**. Auch die **beiden eigenen Felder** zählen: die Linie verlässt ihr Feld immer
  senkrecht **nach aussen**, läuft nie zurück hinter ein Feld, und der **Pfeil kommt immer von aussen**
  an (auch bei festen Ansatzpunkten auf der abgewandten Seite). Die gewohnte Form bleibt nur, wenn sie
  mindestens 10 px Abstand hält; sonst wird ein Weg gesucht – **gerade** = kürzester Weg mit Knicken,
  **Kurve** = derselbe Weg mit runden Bögen (24 px Abstand), **Winkel** = rechtwinklig mit möglichst wenig
  Knicken (14 px). In engen Durchgängen wird der Abstand stufenweise kleiner (bis 8 px).
  Stehen zwei verbundene Felder eng (Lücke unter 30 px) und schräg versetzt, geht die Linie **über Eck**
  (z.B. rechts aus A, oben in B; Winkel = L-Form); sonst läuft sie in der Mitte der Lücke und der Pfeil
  wird kürzer. Von Hand gebogene Linien bleiben, wie sie sind.
- „Als Baum anordnen" ordnet verbundene Elemente automatisch von links nach rechts an.

### Text
Formatierung wie in PowerPoint: Schriftart, Grösse, Fett/Kursiv/Unterstrichen/Durchgestrichen,
Hoch-/Tiefgestellt, Gross-/Kleinschreibung, Schriftfarbe, Hervorhebung, Aufzählungen,
Nummerierung, Einzüge, Ausrichtung, Zeilenabstand, Checklisten, Formatvorlagen
(Überschriften, Zitat, Code), Format übertragen (Pinsel), Tabellen, Links (Strg+Klick
öffnet sie), Symbole/Emojis, Datum, Trennlinie.
Formatierung wirkt auf die Textauswahl – oder, wenn nichts markiert ist, auf alle
ausgewählten Textfelder.

### Suchen, Verlauf, Seiten
- Strg+F sucht über **alle** Seiten (ausserhalb von Text auch Strg+E), Strg+H ersetzt.
  Im Text bleibt Strg+E „zentrieren“ wie in PowerPoint.
- Strg+Z / Strg+Y über 100 Schritte; der Pfeil neben „Rückgängig" zeigt die Liste der
  letzten Aktionen, man kann mehrere auf einmal zurücknehmen.
- Navigation: siehe „Struktur“. Alles per Ziehen verschiebbar (Knoten im Baum, Seiten in
  der Liste, Seiten auf einen Abschnitt im Baum).
  Umbenennen per Doppelklick, Farben und alles weitere im Rechtsklickmenü.
- Seitentitel oben gross; F2 springt hinein. Datum/Uhrzeit einfügen: Alt+Umschalt+D/T/F.

---

## 4. Aufbau der Oberfläche

```
┌─ Titelleiste: Logo · Speichern · Rückgängig ▾ · Wiederholen | ← → 🕑 · Titel · Suche ┐
├─ Registerkarten: Datei | Start | Einfügen | Zeichnen | Anordnen | Verbindungen | Ansicht
├─ Menüband (Gruppen mit Knöpfen, wie PowerPoint)                                       │
├──────────────┬───────────────┬────────────────────────────────────────────────────────┤
│ Notizbücher  │ Seiten        │ ═══ Rahmen in der Abschnittsfarbe ═══════════════════  │
│ (Baum: Notiz-│ (Liste mit    │ (gelbe Leiste nur in der Versionsansicht)              │
│ bücher, Grup-│ Unterseiten,  │ Seitentitel                                  Datum     │
│ pen, Ab-     │ sortierbar)   │ Zeichenfläche (Felder, Pakete, Verbindungen,           │
│ schnitte,    │               │ Zeichnungen)                                           │
│ einklappbar) │               │                                                        │
├──────────────┴───────────────┴────────────────────────────────────────────────────────┤
└─ Statusleiste: Pfad + Anzahl · Hinweistext · Speicherstatus · Zoom ───────────────────┘
```

Registerkarten im Detail:

- **Datei** (seit 1.34 kein Register mehr, sondern ein **eigenes Fenster wie die Backstage-Ansicht von OneNote**,
  `web/js/backstage.js`): ein Klick auf „Datei“ legt es über alles unter der Titelleiste; links eine Leiste in der
  Akzentfarbe mit **Zurück-Pfeil** (auch Esc) und den Bereichen, rechts der gewählte Bereich mit grossem Titel:
  - **Informationen** („Notizbuchinformationen“): alle Notizbücher mit Abschnitten/Seiten (aktuelles hervorgehoben,
    geschlossene markiert), je **Einstellungen ▾** = Schliessen/Öffnen, Als KnowledgeTree-Datei speichern,
    Exportieren; Speicherort (Saves-Ordner, Browser, interaktive Datei); **Aktuelle Seite** (Titel, Daten,
    Umbenennen, Duplizieren, Verschieben nach …, Seitenversionen, Löschen); **Speicher** (Info & Speicher,
    Desktop: Saves-/Cache-Ordner, Papierkorb öffnen; Browser: Papierkorb).
  - **Neu:** Notizbuch, Abschnitt, Abschnittsgruppe, Seite, Unterseite, Schnellnotiz.
  - **Öffnen:** geschlossene Notizbücher (Öffnen), Importieren (Dateien wählen …, Ordner wählen …), Backup laden.
  - **Speichern & Sichern:** Jetzt speichern (interaktive Datei: Datei speichern), Backup erstellen/laden, Desktop:
    Backups öffnen, Automatische Sicherung (→ Optionen → Sicherung).
  - **Exportieren** in zwei Schritten wie in OneNote: 1. was (Seite, Abschnitt, Notizbuch), 2. Format (PDF, Webseite,
    KnowledgeTree-Datei, OneNote) → „Exportieren …“ öffnet den Export-Dialog mit diesen Vorgaben; dazu „Aktuelles
    Notizbuch als Datei“.
  - **Drucken:** Drucken … (Dialog mit Vorschau), Druckeinstellungen (→ Optionen → Drucken).
  - **Hilfe:** Erste Schritte (Tabellen & Formeln, Diagramme, Rechner & Fotomath), Tastenkürzel, Über KnowledgeTree.
  - unten **Optionen** (= Einstellungen) und im Programm **Beenden**.
  Kacheln führen den Befehl über `Cmd.run` aus (gleiche Prüfungen wie im Menüband) und schliessen das Fenster vorher.
  `Ribbon.show('datei')` öffnet es; das Register darunter bleibt (ein gemerktes „datei“ gilt beim Start als „Start“).
  Handy/schmal: Leiste oben, waagrecht scrollbar, Kacheln einspaltig.
- **Start:** Zwischenablage · Seiten · Schriftart · Absatz · Formatvorlagen · Zeichnung
  (Schnellformatvorlagen für Felder, Füllfarbe, Rahmenfarbe) · Bearbeiten.
- **Einfügen:** Seiten · Elemente (Textfeld, Bild) · **Rechnen (Tabelle mit Grössenraster/CSV/
  einfache Tabelle im Text, Diagramm, Rechner, Fotomath)** · Text (Link, Checkliste, Datum,
  Trennlinie) · **Formeln** · Symbole.
- **Zeichnen:** Werkzeuge (Auswählen, Lasso, Radierer Strich/Punkt/Grösse) · Stifte
  (8 Plätze, Anpassen, Farbe) · Formen (8 Formen, Füllung) · Hilfsmittel (Lineal,
  Winkelmesser, Nur mit Stift) · Umwandeln (Formerkennung, Fotomath, Freihand → Form/Text) · Ebene (vor/hinter
  den Text).
- **Anordnen:** Paket (Gruppieren, aufheben, umbenennen, Farbe) · Schutz (Sperren) ·
  Reihenfolge · Ausrichten/Verteilen.
- **Verbindungen:** Verbinden/Trennen · Linienform (+ Ausweichen) · Pfeile · Aussehen (Farbe, Stärke,
  gestrichelt, Beschriftung, Linie zurücksetzen) · Knowledge Tree (Als Baum anordnen).
- **Ansicht:** Zoom · Seite (Seitenfarbe, Linien) · Fenster (Vollbild, Navigation
  ein/aus, Seitenliste links/rechts) · **Tabs** (seit 1.35: Neuer Tab (1.36 geteilt: Kopie | ▾ Auswahl), Rechts
  teilen, Unten teilen, Tab schliessen, 1.36: Tableiste einklappen) · Hilfen (am Raster ausrichten, Bildlaufleisten,
  Ankerpunkte, zum Anfang/Ende) · Design (Hell/Dunkel).
- **Kontextregister (seit 1.8, blau):** **Tabelle** (sichtbar, solange eine Tabelle aktiv ist:
  Zellen einfügen/löschen · Schrift · Zahl · Bearbeiten mit AutoSumme/Füllen/Sortieren/Funktion/
  Löschen/Umbenennen · Tabellenformat · Diagramm · Daten) und **Diagramm** (sichtbar, solange ein
  Diagramm ausgewählt ist: Typ · Beschriftung · Darstellung · Analyse/Trendlinie · Daten); beide
  mit Gruppe Hilfe → Erste Schritte.
  Wird das Objekt verlassen, springt das Menüband zurück. Titelleiste: Knopf **Rechner**.

**Menüband-Raster (seit 1.35, wie Office):** drei Zeilen kleiner Knöpfe, Höhe `--rh` (24 px, Finger 30 px) mit
Abstand `--rgap` (3 px); grosse Knöpfe, Stifte und Galerien sind genau `--bh` = 3 Zeilen hoch, die Gruppennamen
stehen auf einer Linie. Überfahren = nur Fläche (kein Rahmen mehr), eingeschaltet = Akzent-hell mit Rahmen; alle
Knöpfe 4 px rund. Combos, Galerie-Kästchen und Formen haben die Zeilenhöhe. Die Variablen hängen an `#ribbon`.

**Über der Seite (seit 1.35): Tableiste** je Bereich, Bereiche nebeneinander/untereinander (Abschnitt 3 „Tabs und
geteilte Bereiche“). `#panes` umschliesst `#page-frame`; der Rahmen in der Abschnittsfarbe sitzt darunter.

**Seit 1.10 passt sich die Oberfläche jeder Fenstergrösse an** (Abschnitt 3, „Dynamisches Layout“):
unter 900 px Breite werden Baum und Seitenliste zur Schublade (☰), auf dem Handy wird die Titelleiste
kompakt (☰ · ↶ · ↷ · Rechner · Titel · 🔍), das Menüband verliert die Gruppennamen und klappt auf
niedrigen Fenstern ein (⌄ rechts neben den Registern), Dialoge kommen als Blatt von unten.

---

## 5. Dateien und Architektur

### Quellcode-Ordner

```
main.go                688 Z.  Start, interner Webserver, Einzelinstanz, Log, /api/datei (Anhänge), Backup-/Speicher-API (1.24)
store.go              1154 Z.  Abgleich Baum/Seiten <-> Ordner im "Saves"-Ordner (auch in Teilen), Seiten platzsparend schreiben,
                               Backups (KnowledgeTree-Datei), Zeitplan, Papierkorb leeren, Bilder aufräumen (1.24)
store_test.go           93 Z.  go test ./...: Namenssuche ohne regexp, Seitenformat (KT_SAVES=… prüft echte Daten)
window_windows.go      288 Z.  Programmfenster (WebView2) + Fallbacks, DPI, Schliessen abfangen
window_other.go         33 Z.  Ersatz für Linux/Mac (nur zum Testen)
build_web.py           290 Z.  baut aus web/ die einzelne dist/index.html, verkleinert JS/CSS/HTML (seit 1.23; `--lesbar` = ohne), legt das Gerüst #kt-shell und die Marke für interaktive Dateien an (1.25)
build/kt.manifest, kt.ico      Manifest (DPI) und Programmsymbol für die EXE
rsrc_windows_amd64.syso        daraus erzeugte Ressourcendatei (Icon + Manifest + Versionsangaben, aus build/kt.rc)
build/kt.rc                    Ressourcen-Skript (1.44): Icon, Manifest, VERSIONINFO (Firma TheDragonas, Produkt, Version)
tests/chem/, tests/sheet/       Testlisten Chem-Namen, Formel-Engine (node tests/sheet/xl-test.js)
tests/onenote/onecheck.js      strenger Prüfer für .one/.onetoc2 (MS-ONESTORE + Inhaltsregeln MS-ONE), seit 1.21
tests/backup/ktfile-test.js    KnowledgeTree-Datei schreiben/lesen, ZIP-Prüfung mit Python, alte Formate (seit 1.24)

web/index.html         155 Z.  Grundgerüst (Desktop-Fassung, lädt die js-Dateien), SVG-Defs für Stifte, Bearbeitungsleiste, Bildlaufleisten
web/app.css           1303 Z.  komplettes Aussehen inkl. Hell/Dunkel, Formeln, Export-Dialog, Farbrad, Chem-Draw/Periodensystem, Tabellen, Diagramme, Rechner, Fotomath; am Ende das dynamische Layout (1.10)
web/icon.svg                   Logo
web/js/util.js         152 Z.  Hilfsfunktionen, HTML-Bereinigung beim Einfügen (behält Formeln)
web/js/sheet-calc.js  1446 Z.  Formel-Engine (XL, ohne DOM): Parser, ~170 Funktionen DE/EN, Zahlenformate de-CH, Bezüge umschreiben, Reihen
web/js/icons.js        198 Z.  alle Symbole als SVG-Pfade (selbst gezeichnet)
web/js/backend-server.js 95 Z. Speicher-Anbindung Desktop (ruft den lokalen Server; Speichern in Teilen ≤ 16 MB, Backups, Bilder prüfen)
web/js/backend-browser.js ~440 Z. Speicher-Anbindung Browser (IndexedDB, Backup-Ordner/ZIP, alter Papierkorb, Versionen, `cleanup` seit 1.20) und `ktFileBackend` für interaktive Dateien (1.25)
web/js/store.js        435 Z.  Daten, Baum (Notizbücher/Abschnitte, Migration), Verlauf (Undo), Autosave
web/js/ui.js           354 Z.  Menüs, Farbwähler + Farbrad, Dialoge, Meldungen
web/js/layout.js       206 Z.  dynamisches Layout (seit 1.10): Klassen lay-*/touch/kb-open am <body>, Schublade, Menüband ein-/ausklappen, langes Drücken = Kontextmenü, Schreibmarke über der Tastatur
web/js/sidebar.js      958 Z.  Navigation (Baum, Seitenliste, Register optional, Spalten per Doppelklick einklappen, Leiste „Abschnitt/Gruppe“) + alle Struktur-/Seiten-Befehle (Ops)
web/js/route.js        196 Z.  Verbindungen um Hindernisse führen (Route, ohne DOM): Sichtbarkeitsgraph + A*, rechtwinklig auf Raster, Bögen
web/js/canvas.js      2352 Z.  Zeichenfläche: Felder, Bilder (inkl. Strukturformeln), Pakete, Verbindungen (mit Ausweichen), Video-Player, Alt+Klick/Tab-Auswahl, Bildlaufleisten + Ankerpunkte, Finger (langes Drücken, Verschieben, Verbinden per Antippen)
web/js/draw.js        1280 Z.  Zeichnen: Stifte, Radierer, Lasso, Formen, Lineal/Winkelmesser (verstellbar, cm wie gedruckt), Formerkennung, OCR
web/js/sheet.js       2073 Z.  Tabellen wie Excel (Sheet): Arbeitsmappe über alle Seiten ([Seite]Tabelle!A1, seit 1.26), Darstellung, Auswahl, Bearbeiten, Zeigen-Modus, Vorschläge, Formate, Füllen, Sortieren, Zwischenablage, Verknüpfung einfügen, CSV, gezielte Neuberechnung (auch manuell/F9)
web/js/chart.js        724 Z.  Diagramme (Chart): Daten aus Bereichen, SVG, Trendlinien, Werte ablesen, Dialog
web/js/calc.js        1736 Z.  Taschenrechner (CalcEngine + Calc): TI-30X Plus MathPrint (EU) und Standard, Vorlagen, exakte Ergebnisse, Verlauf, Menüs, Statistik, Tabelle, Grösse
web/js/mathink.js      869 Z.  Fotomath-Erkennung (MathInk, ohne DOM): Striche → Zeichen ($P + Regeln), 2D-Aufbau, Bild → Striche (fromBitmap), Text → Baum, LaTeX
web/js/fotomath.js     536 Z.  Fotomath-Oberfläche: Rahmen ziehen, Etiketten/Korrektur/Lernen, Rechnen/Lösen, Rechenweg, Einfügen (Formel/Text)
web/js/mathsteps.js    460 Z.  Rechenweg (1.38): Schritte für Rechnungen und Gleichungen, Text (Zeichen/Tastatur) und LaTeX
web/js/mathcas.js    1080 Z.  Fotomath-Werkzeuge (1.52, wie Derive): Ableiten, Integrieren, Faktorisieren, LGS (Gauss), Ungleichungen, Kurvendiskussion, Taylor, Primfaktoren/ggT/kgV – mit Rechenweg; ohne DOM
web/js/spell-engine.js 315 Z.  Rechtschreibung (1.38): eigener Hunspell-Leser (aff/dic), Prüfen, Zusammensetzungen, Vorschläge
web/js/spell.js        519 Z.  Rechtschreibung: Wörterbücher laden, Wellenlinien (Highlight API), Rechtsklick, F7-Fenster, Einstellungen
web/js/spell-fach.js    92 Z.  Fachwörter DE/EN (Naturwissenschaften, Mathematik, Medizin, Informatik)
dict.go                       Wörterbücher fürs Programm: einmal laden, in Cache/Woerterbuch ablegen (/api/woerterbuch)
addins.go                     Add-Ins-Ordner (1.69): Ordner + KI-Vorlage beim Start, /api/addins (liste, speichern, entfernen → _entfernt, vorlage)
optimize.go                   Speicher optimieren beim Beenden (1.39): sortieren, Doppeltes als harte Verknüpfung, Backups
optimize_test.go              go test: Verknüpfen, Löschen/Herauskopieren bleibt vollständig, Backup-Verknüpfung
web/js/filepages.js    ~230 Z. Dateien anhängen + als Seiten-Bilder aufklappen (PDF via PDF.js, Office-Bilder via eingebautem ZIP-Leser)
web/js/ktfile.js      ~700 Z.  KnowledgeTree-Datei (seit 1.24): ZIP schreiben (CRC-32, deflate-raw, ZIP64) und lesen im Format des Saves-Ordners, alte JSON-/EXE-Backups, Bilder übernehmen; seit 1.25 interaktive .html, .json, Backup-Ordner wie OneNote
web/js/guide.js        228 Z.  Erste-Schritte-Seiten (Guide): Tabellen, Diagramme, Rechner & Fotomath
web/js/contrast.js    ~200 Z.  Schriftfarbe passend zum Hintergrund: automatische Tönung, Korrektur kaum lesbarer Farben (nur Anzeige)
web/js/commands.js     784 Z.  alle Menüband-Befehle, Textformatierung, Suchen, Einzelseiten-HTML; Start-Befehle wirken bei aktiver Tabelle auf Zellen
web/js/formula.js      382 Z.  Formeln: LaTeX-Teilmenge → MathML, Editor, Galerie, Einfügen/Bearbeiten
web/js/chem.js        3890 Z.  Chem-Draw (1.54: mehrere Moleküle, Reaktionsschema-Objekte, Kopieren/Einfügen; 1.56 Gruppen, Umschalter Zeichnen|Planen, MS-Ion einfügen): Elementdaten, Summenformel-Parser, Molekülmodell (H, Ringe, Stereo/CIP), SVG, Editor, Periodensystem
web/js/chem-layout.js      880 Z. SMILES lesen, Kekulé, Ringe (SSSR), 2D-Anordnung, Keile aus Stereo, Aufräumen, Struktur-Vergleich
web/js/chem-name.js        1262 Z. IUPAC-Namen (deutsch/englisch) inkl. Ringsysteme mit fester Nummerierung
web/js/chem-db.js          727 Z. Trivialnamen-Datenbank (626 Vorlagen) und Suche/Erkennung
web/js/chem-models.js      590 Z. Darstellungen (1.28): Elektronenkonfiguration, Lewis, Bohr, Orbitale (Kästchen, Formen), 3D (Einbettung, Kugel-Stab, Kalotten, Elektronenwolke; 1.52 Stäbe, Draht, Messen)
web/js/chem-props.js     1975 Z. Analyse (1.52; 1.53 ¹⁹F/³¹P/¹⁵N, Zoom; 1.54 NMR 1. Ordnung/Dacheffekt, IR-Normalschwingungen, EI-MS-Simulation; 1.55 Inkrement-Tabellen ¹H/¹³C, IR je Gruppe, MS mit Ionen-Strukturen): SMILES/Molfile, Kennzahlen (TPSA, logP, Lipinski), funktionelle Gruppen, IR/MS/¹H/¹³C-NMR (Schätzungen), 3D-Messen; ohne DOM
web/js/chem-rxn.js        489 Z. Syntheseplanung (1.56): Retro-Regeln mit Bedingungen/Reagenzien/Flags, Bewertung, Strahlsuche, Weg Edukt → Produkt, Mengen, Vorschrift; ohne DOM
web/js/chem-plan.js       242 Z. Planen-Modus (1.56): Seitenleiste – Aufgabe erkennen, Wege, Stufen bearbeiten, Mengen, Schema in die Zeichnung
web/js/print.js        306 Z.  Drucken (seit 1.26): Dialog mit Vorschau wie Word/OneNote, Papier/Ränder/Skalierung/Kopf- und Fusszeile, Blätter schneiden, Tabelle wie Excel
web/js/export.js       636 Z.  Export-Dialog mit Auswahl; PDF (Seite in Blätter geschnitten, seit 1.22), Webseite, KnowledgeTree-Datei; Seiten rendern (ohne Bedienelemente); Abbrechen
web/js/onenote.js    ~1300 Z.  OneNote lesen: Inflate/MSZIP, LZX, CAB (.onepkg), OneStore [MS-ONESTORE], Inhalt [MS-ONE], Tinte; Ausdrucke (0x200034C8), nicht zugeordnete Dateien, OCR-Bildtext
web/js/onenote-import.js ~1400 Z. OneNote → KnowledgeTree: Dialog, positionsgenaue Umwandlung, Bericht, Rückimport von Tabellen/Diagrammen (KTDATA); seit 1.12 auch ZIP/RAR-Archive (OneNote-/KT-Sicherung) → Notizbücher mit Ordnerstruktur; seit 1.17 ein Knopf für alles (`auto`), seit 1.18 stückweise, seit 1.19 RAR im Worker (`rarWorkerMain`, `rarJob`)
web/js/onenote-write.js ~1400 Z. OneNote schreiben (Beta): OneStore-Datei, Seiten/Abschnitt/Inhaltsverzeichnis, CAB; KT-Seite → OneNote inkl. echter Tabellen und Träger-Bild, echte Dateianhänge (EmbeddedFileNode mit Symbolbild), Ausdrucke (XPS + Quell-PDF), OCR-Bildtext, Versionsverlauf je Seite; seit 1.21 nach den MUST-Regeln von MS-ONESTORE/MS-ONE (geprüft mit tests/onenote/onecheck.js)
web/js/settings.js     277 Z.  Einstellungen-Dialog (wie OneNote-Optionen) und automatisches Backup/Erinnerung im Browser (AutoBackup), seit 1.24
web/js/ribbon.js       460 Z.  Menüband (Aufbau + Zustand der Knöpfe, Kontextregister Tabelle/Diagramm, Tabellenraster, Ein-/Ausklappen)
web/js/panes.js        790 Z.  Tabs und geteilte Bereiche (1.35): Baum in Store.ui.panes, Tableisten, Teilen/Ziehen, Vorschau im Shadow-Root
web/js/main.js         988 Z.  Start, Tastenkürzel (u.a. Alt+=, Alt+R, Alt+M, Pos1/Ende), Navigation, Versionen, Dialoge, Backup erstellen/laden, Notizbuch als Datei, Willkommen
```

Reihenfolge der Skripte ist wichtig (util → sheet-calc → icons → backend → store → ui → sidebar → layout →
route → canvas → draw → sheet → chart → calc → mathink → mathsteps → mathcas → fotomath → filepages → ktfile → guide → commands → formula → chem → chem-layout → chem-name → chem-db → chem-models → chem-props → export → print → onenote → onenote-import → onenote-write →
settings → ribbon → main). `ktfile.js` lässt sich mit util.js/filepages.js in Node testen (`tests/backup/ktfile-test.js`). `sheet-calc.js` (XL), `calc.js` (CalcEngine), `mathink.js` (MathInk) und `route.js` (Route) lassen sich in Node laden. `onenote.js` und der Binärteil von `onenote-write.js` haben keine
DOM-Abhängigkeit und lassen sich in Node testen (`module.exports = ON` bzw. `OneWrite`). Alles sind klassische Skripte mit globalen
Objekten, keine Module.

### Globale Objekte (alles im Browser)

| Objekt | Zuständig für |
|---|---|
| `Backend` | Laden/Speichern. Zwei Fassungen mit gleicher Schnittstelle: `load, sync, beacon, saveVerlauf, saveZustand, saveImage, saveFile, putAsset, hasAssets, imgURL, setImg, openLink, ping, backup` (+ Browser: `backup({folder, keep, prog, check})`, `cacheGet/cachePut`, `trashList, trashRemove, storageInfo, aboutHtml, versionList, versionGet, versionDelete, cleanup`; + Desktop: `listBackups, backupBlob, storage, quit, openFolder`, `SYNC_PART`). `Backend.kind` ist `'server'` oder `'browser'`. Fehlt `versionList`, werden Versionen in der Oberfläche ausgeblendet. |
| `Store` | `groups` (Baum), `pages` (alle Seiten), `ui` (Ansichtszustand), `readOnly` |
| `Tree` | Baum: `find, group, groupOfPage, all, path, parentOf, notebookOf, isSection, isContainer, quick, firstSection, sections, isDescendant, pagesDeep, norm (inkl. Migration), ensureQuick`; Unterseiten: `pageLevel, block, hasChildren, normLevels` |
| `Hist` | Rückgängig/Wiederholen: `touchPage, touchTree, commit, commitSoon, undoStep, redoStep, undoTo` |
| `Save` | Autosave: sammelt geänderte Seiten, schickt sie gebündelt ans Backend (Desktop: in Teilen, seit 1.24) |
| `KtFile` | KnowledgeTree-Datei (seit 1.24): `write({groups, art, name, prog, check, images, skip})`, `writeJson`, `writeHtml`, `writeAs(fmt, o)`, `writeFolder`, `zipFiles`, `read(datei | {name, entries})`, `readZip`, `readHtml`, `readFolder`, `isKtZip`, `isKtFolder`, `peekMeta`, `storeAssets`, `appTemplate`, `fromBase64`, `zipWriter`, `safeName`, `backupName`, `exportName(name, fmt)`, `size` |
| `Settings` / `AutoBackup` | Einstellungen-Dialog (`show(kategorie)`, `init`, `apply`); Browser: automatisches Backup/Erinnerung (`check, folder, setFolder, folderList, done`) |
| `UiState` | speichert den Ansichtszustand (Zoom, letzte Seite, aufgeklappte Gruppen) |
| `Layout` | dynamisches Layout (seit 1.10): `mode` ('wide' / 'drawer' / 'phone'), `update()`, `toggleNav(on)`, `toggleRibbon()`, `peek(on)`, `ribbonMin()`, `keepCaretVisible()` |
| `Canvas` | die Zeichenfläche: Darstellung, Maus, Finger, Auswahl, Felder, Bilder, Pakete, Verbindungen |
| `Sidebar` / `Ops` | Navigation (Baum, Register, Seitenliste, Ziehen & Ablegen, Mehrfachauswahl `pageSel`); `Ops` enthält alle Befehle für Notizbücher, Abschnitte und Seiten |
| `Draw` | Zeichnen: Werkzeug (`tool`, `setTool`), Auswahl `sel` (getrennt von `Canvas.sel`), Darstellung in drei SVG-Ebenen, Lineal/Winkelmesser, Umwandeln. `Canvas.onDown/onMove/onUp` fragen zuerst `Draw` |
| `FilePages` | Datei-Anhänge aufklappen: `expand(boxId, src, name)`, `renderPdf` (PDF.js), `officeImages` (ZIP → Bilder), `placeColumn` (Seiten untereinander), `kindOf`/`expandLabel`; Helfer `unzip`/`inflateRaw` |
| `DG` / `Recog` | Geometrie der Zeichnungen (Linienzüge, Treffer, Rahmen, Umrechnen) / Formerkennung |
| `ON` | OneNote-Leser: `readCab`, `OneStore` (Dateiknoten, Räume, Revisionen, `props(obj)`, `fileBytes`), `Model` (`section(name)` → Seiten mit Elementen), `readToc`, Konstanten `P` (Eigenschaften), `J` (Objekttypen), `INK` |
| `OneImport` | Import-Ablauf: **`pick(ordner)` → `auto(liste, {pt, box})`** (ein Weg für Knopf und Hineinziehen), `kindOf` (Signatur), `newPlan`, `addEntrySet`; Altnamen `start`/`importFolder`/`importArchive`/`fromFiles`/`fromArchives`/`fromFolder` → `auto`, `readPackage`/`notebookFromEntries`, `readSection(u8, name, plan, external)`, `companions` (Begleitordner „…_onefiles“), `askTarget`, `apply`, `convertPage`, `blocksHtml`, `paraHtml`, `missingHtml`/`missingReport` |
| `OneWrite` | OneNote schreiben: `buildSection(seiten)` → .one, `buildToc(einträge, farbe)` → .onetoc2, `buildCab(dateien)` → .onepkg, `exportTree(baum, name, fortschritt)`; intern `FileBuilder`, `Space`, `propSetBytes`, `pageModel` (gerenderte KT-Seite → Zwischenformat), `htmlParas` (Textfeld → Absätze mit Läufen aus berechneten Stilen) |
| `Export` | Export-Dialog `show({pages}` oder `{group})`, `run(format, optionen)`, `renderEach` (jede Seite hell im Canvas darstellen und danach alles zurück), `snapshot` (Fläche klonen, Bilder einbetten), `toKt/toHtml/toPdf/toOneNote`, `printHtml` |
| `Formula` | Formeln: `toMathML(tex, block)`, `spanHtml`, `open(span oder null, vorlage)`, `gallery(anker)` |
| `Contrast` | Schriftfarbe zum Hintergrund: `rgb/hex/lum/ratio/mix/over`, `auto(bg, dunkel, min)` (Tönung), `readable(farbe, bg, dunkel)` (null = lesbar, sonst gleiche Farbe heller/dunkler), `adapt(textEl, {bg, declared, shown})` (setzt `--kt-ink`), `strip(html)`, `boxColor(style)`, `declared(el)`, `themeColor('--box-bg')`, `raw` (Export), `fixOn()` |
| `ChemSmiles` / `ChemRings` / `ChemLayout` / `ChemMatch` / `ChemName` / `ChemDB` | SMILES, Ringe, 2D-Anordnung (`layout`, `relayout`, `snapPt`), Strukturschlüssel, IUPAC-Namen (`of`), Vorlagen (`entries`, `mol`, `find`, `search`) |
| `ChemFormula` / `ChemMol` / `ChemRender` / `Chem` | Chemie: Summenformel lesen/Hill/Massen/`formatText`; Molekül (`analyze` → Formel, Masse, Teile, Valenzfehler, `centers` mit R/S, `ez`; `expand` löst Kurzschreibweisen auf); SVG (`draw`, `toSVG`, Bondlänge `BL` = 30); Editor `Chem.open(ziel, register)`, `editImage(feld, bild)`, `formatSelection()`, `pseGrid` |
| `XL` | Formel-Engine: `parse`, `check`, `Book` (Arbeitsmappe = alle Tabellen einer Seite, `val(sheet, c, r)` mit Merker und Zirkel-Erkennung), `format`/`parseInput` (Zahlenformate de-CH), `shiftFormula`, `adjustRefs`, `renameSheetRefs`, `normalize`, `refsIn`, `toggleAbs`, `wantsRef`, `series`, `FN_INFO`, `normSheet` |
| `Sheet` | Tabellen auf der Seite: `create`, `make/update/renderGrid/overlay`, `active` {id, c, r, c2, r2}, `edit`, `activate/deactivate/syncActive`, `onDown/onDragMove/onDragUp`, `onKey/onEditKey`, `commit`, `setCells/formatSel/toggle/setNumFmt/decimals/clear`, `insertRows/deleteRows/insertCols/deleteCols` (+`adjustAll`), `fill/fillDir/sort/autoSum`, `onCopy/onPaste/pasteGrid`, `functionDialog`, `exportCsv/importCsv/fromGrid/fromHtmlTable`, `book()` (Arbeitsmappe, neu bei `Sheet.ver`-Wechsel) |
| `Chart` | Diagramme: `norm`, `fromRange` (Excel-Logik für Kopfzeile/Kategorien/XY), `data` (live oder `cache`), `svg` (Zeichnen), `trendFit`, `make/update`, `hover/onClick` (Werte ablesen, Zelle zeigen), `create/insert/insertFromSheet`, `set`, `editDialog`, `showData`, `toSheet`, `adjustSrc`, `svgFor` |
| `Calc` / `CalcEngine` | Taschenrechner: Fenster (`toggle/show/minimize`, `scale/applyScale`, `setKind('sci'|'simple')`), Tasten `CALC_KEYS.sci/simple` = [id, Beschriftung, 2nd-Beschriftung, Klasse, Tooltip], `renderKeys` (2nd tauscht), Vorlagenbaum `line` + Schreibmarke `cur` (`CALC_SLOTS`, inkl. sum/prod), `press(taste)`/`pressSimple`, `enter`, `forms` (Bruch/Wurzel/π/Dezimal), `ser` (Baum → Text fürs Rechenwerk), `exprText`, Verlauf `hist`, Menüs `CALC_MENUS`, `computeStats`, `tableFn`, `loadExpression`; `CalcEngine.evaluate(text, env)`, `frac`, `surd`, `piForm` |
| `MathInk` | Fotomath-Erkennung: `recognize(striche, overrides)` → `{ left, right, syms, H }` (Bäume im Format des Rechners), `fromBitmap(grau, w, h)` → `{ strokes, comp }`, `fromText`, `toTex`, `learnCloud`, `setUserTemplates`, Vorlagen `RAW` (gezeichnet) und `HAND` (echte Handschrift) |
| `Fotomath` | Oberfläche: `start` (Auswahl oder Rahmen), `run(inks)`, `runImage(bilder, rahmen)`, `runText`, `recognize`, `compute` (Wert/Prüfen/Lösen), `solve`, `show/drawLabels/pick/override/learn`, `act('next'|'formula'|'replace'|'calc'|'copy')` |
| `Route` | Ausweichen: `route(stil, p1, n1, p2, n2, hindernisse, eigene)`, `anyAngle`, Rechtwinkel-Suche, `pathD` (Bögen), `hits` (Strecke ∩ Rechteck); `Canvas.renderLinks` merkt Wege in `routeCache` |
| `Guide` | Erste Schritte: `open(k)`, `makePage(k)` (k = tabellen, diagramme, rechner) |
| `OfficeAnim` | PowerPoint-Übergänge/-Animationen (1.66): `read/write` (p:transition, p:timing), `setTransition`, `setAnim`, `setAnimOpt`, `move`, `preview` |
| `Grammar` | Grammatik (1.66): `check(text)` → `[{ s, e, msg, fix }]`, `scanBox`, `menuFor`, `apply`, `toggle` |
| `Fonts` | eigene Schriftarten (1.66): `add`, `remove`, `manage`, `activate`, `familyName(u8)` |
| `OfficeWord` | Word-Seiten (1.67): `down` (Klick aufs Blatt), `caretAt`, `toggleMarks`, `status`, `rulers`, `dragMargin`, `nav`, `setDesign`, `writeDefaults/writeBorders` |
| `OfficeGrid` | Excel-Seiten (1.67): `clamp/onView/grow` (unendlich, Köpfe), `isFixed`, `freeze`, `setBorder`, `cfMenu/cfAdd/cfPrep`, `removeDuplicates`, `textToColumns`, `readStyles/styleWriter`, `readCf/writeCf`, `readView/writeView` |
| `OfficeConvert` | Import anderer Formate (1.71): `kindOf`, `convert(file)`, `cfb`, `readCsv/readXls/readOds/readDoc/readRtf/readOdt/readMd/readTxt/readPpt/readOdp`, `xlsFormula`, `buildXlsx/buildDocx/buildPptx` |
| `OfficeSaveAs` | Speichern unter (1.71): `TYPES`, `dialog`, `build(p, typ)`, `ooxmlAs`, `bookOf`, `xls`/`cfbWrite`, `ods`, `delimited`, `docOf`, `rtf/odt/html/md/txt`; 1.72: `GROUP`, `groupOf`, `typeSelect`, `hintOf`, `pdf`, `bookHtml`, `deckOf`, `outline`, `deckHtml`, `odp` |
| `OfficeIO` | Office öffnen/speichern (1.72): `OPEN`, `openSelect`, `acceptOf`, `openHint`, `openPanel`, `openDialog`, `savePanel(p)`, `exportOpts(o)`, `fileAs(pid, typ)` |
| `OfficeXT` | Excel wie Excel (1.72): `merge`, `formatMenu`, `rowHeight/colWidth/hide`, `cellStyle/stylesMenu`, `asTable`, `formatDialog`, `findDialog`, `goTo`, `showFormulas`, `trace`, `errorCheck`, `filterToggle/filterMenu/applyFilter`, `sortDialog/sortRange`, `dvDialog/validate`, `goalSeek/solve`, `noteEdit/noteStep/notesAll`, `protect/checkPw/protLocked`, `psSet/psGet`, `printArea/printTitles/headerFooter`, `breaks/printRange`, `decor/overlayHtml/ctxItems/key`, `shift`, `layoutKeys`, `read/write/writeNotes/writeNames` |
| `OfficeWX` / `OfficeSym` | Word wie Word (1.72): `readHF`, `flow`, `hfDialog`, `pageNumber(Menu)`, `watermark(Menu)`, `wmImage`, `hyph/applyHyph`, `sort`, `write/wmPara/writeHyph`; Symbol: `SETS`, `show()` |
| `OfficeWI` | Word-Import wie Word (1.74): `styles/chain/mergeP/mergeR/para/run/base`, `fontCss/pCss/wrapRun/runs`, `tocRange/tocEntries/tocHtml`, `bookmarks/bmTarget/bmY/effY/pageAt/tocPages/jump`, `objects/dml/vml/hx/vy`, `picture` (einbrennen), `objPara`, `tbStyle/boxHtml/blockHtml/tag/tableHtml` |
| `OfficeObj` | Office-Objekte (1.75): `chart(pkg, pfad)`, `chartBox`, `srcOf` (Excel-Bezug), `color/look/frame/txHtml`, `groupHtml(root, W, H, ctx)`, `smartArtHtml` |
| `TellMe` | Suche oben (1.75): `init`, `actions` (Index der Knöpfe + Menüeinträge, „trocken“ geöffnet), `labelOf`, `fileItems`, `score`, `results`, `run`, `update/hint/close`, `warm`, `reset` |
| `OfficeReader` | Seitenansicht (1.74): `isDoc`, `geo`, `annotate/cleanup`, `prep`, `open(start)`, `print`, `slice`, `section/script` (Webseite), `core` (= `ktReader`, eigenständig), `CSS` |
| `OfficeUI` | Office-Konzept (1.73): `qat/qatAdd/qatRemove/qatMenu/panelMenu/cleanSvg`, `views/refreshViews`, `cell/inTable/tbl(op)/textToTable`, `readMode`, `outline`, `readProps/writeProps/setProps`, `COLORS/FONTS/themes/writeTheme/setTheme/themeMenu`, `infoSections`, `stats`, `findings/fix/inspect`, `compatRows/compat` |
| `OfficePX` | PowerPoint wie PowerPoint (1.72): `hideSlide`, `setup`, `hfDialog/applyHF/renumber`, `sorter/fillSorter/move/closeSorter`, `read/write` (presProps) |
| `OfficeSlides` | PowerPoint-Seiten (1.67): `view/setView` (lern/normal), `sync/place` (Abdeckung, Animationsbereich, Notizen), `fit`, `relayout`, `newSlide(layout)`, `startTextbox`, `align`, `insertField` |
| `Plugins` / `Macros` | Add-Ins (1.66, 1.69 Schnittstelle 2): `builtin`, `syncBuiltins`, `init`, `loadFolder`, `parse`, `register/unregister`, `api`, `isOn/setOn/toggle`, `all`, `changed`, `emit/handle`, `menuFor`, `onKey`, `allWords`, `helpRows`, `tabsFor/groupsFor`, `addFile`, `reload`, `remove`, `manage`, `templateText/saveTemplate`, `TEMPLATE_TEXT` (KI-Vorlage, seit 1.70 eine .js-Datei), `addCode`, `guide`, `parts`, `failed`; Makros (`api` = kt, `run`, `record/stop`, `dialog`, `editor`) |
| `Ribbon.check` / `Ribbon.buildAddins` | Häkchen-Knopf (1.69) und Register „Add-Ins“ |
| `Ribbon` | baut das Menüband aus Bausteinen (`big, small, ico, split, colorSplit, combo, gallery`); Register mit `ctx()` sind Kontextregister |
| `Cmd` / `COMMANDS` | Befehlsliste: jeder Knopf ruft `Cmd.run('name', arg)`; `enabled`/`active` steuern grau/aktiv |
| `Fmt` | Textformatierung (document.execCommand + Nacharbeit), Format-Pinsel |
| `Find` | Suchen/Ersetzen über alle Seiten |
| `Video` | Online-Videos: `embed(url)` (YouTube/Vimeo → Player-Adresse), `wrapHtml`, `play(url, titel)` |
| `UI` | Menüs, Farbwähler, **Farbrad** (`colorWheel(anker, farbe, onPick, {title})`), Dialoge, Toasts, Konflikt-Overlay, Verlaufsliste |
| `App` | Start, Tastenkürzel, Seitenwechsel (`openPage`, `nav` zurück/vor, `recent`), Vollbild, Seitenversionen (`showVersions`, `preview`), Backup/KT-Datei laden (`restoreBackup`, `readBackupGeneric` für den Desktop), Info/Tastenkürzel/Papierkorb-Dialoge, Willkommens-Notizbuch |

---

## 6. Datenmodell

### Eine Seite (so liegt sie als `.seite.json` bzw. in IndexedDB)

```json
{
  "typ": "KnowledgeTree-Seite", "version": 1,
  "id": "p…", "title": "Erste Schritte", "created": 1757620000000, "modified": 1757620500000,
  "level": 0,
  "bg": "punkte | raster-s | raster | raster-l | linien-s | linien | linien-l | keiner",
  "color": "#E3F0FB oder null",
  "boxes": [{
    "id": "b…", "x": 0, "y": 0, "w": 420,
    "html": "<h1>…</h1><div>…</div>",
    "images": [{ "id": "i…", "src": "<sha1>.png", "x": 140, "y": 50, "w": 116, "h": 73,
                 "chem": "nur bei Strukturformeln: { v, mol, opts, nw, nh, f, m }",
                 "ocr": "nur aus OneNote: erkannter Bildtext (Suche, wird zurückexportiert)" }],
    "z": 1,
    "style": { "bg": "#FFF4C2", "border": "#E8C547", "color": "nur bei fester Feld-Schriftfarbe (sonst automatisch)", "lh": "1.5", "on": 1 },
    "locked": false,
    "pkg": "k… oder null",
    "bg": "true = Hintergrund (seit 1.10; sonst weggelassen, nie zusammen mit pkg/sheet)"
  }],
  "pkgs": [{ "id": "k…", "title": "Paket: Ideen", "color": "#ca5010", "locked": false }],
  "links": [{
    "id": "l…", "a": "<id Feld/Paket>", "b": "<id Feld/Paket>",
    "style": "kurve|gerade|winkel", "arrow": "ende|beide|keiner",
    "w": 2, "color": null, "dash": false, "label": "führt zu",
    "aAnchor": { "side": "l|r|t|b", "t": 0.42 },
    "bAnchor": { "side": "t", "t": 0.8 },
    "bend": { "x": -160, "y": 60 }
  }],
  "drawings": [
    { "id": "d…", "type": "ink", "kind": "pen|pencil|marker|rainbow|glitter", "color": "#2f5fd0", "w": 2.2,
      "pts": [x, y, druck, x, y, druck, …], "t0": 1757…, "dur": 900, "layer": "oben|unten", "fit": 1, "np": 1, "bg": true },
    { "id": "d…", "type": "shape", "shape": "line|arrow|darrow|rect|ellipse|triangle|diamond|axes",
      "x1": 0, "y1": 0, "x2": 120, "y2": 80, "color": "#1f1f1f", "w": 2.2, "fill": null, "t0": 1757…, "layer": "oben" },
    { "id": "d…", "type": "shape", "shape": "poly", "pts": [x, y, x, y, …], "…": "sonst wie oben" }
  ]
}
```

- `style.on = 1` markiert Felder aus dem OneNote-Import (OneNote-Zeilenhöhe, Klasse `.box.onote`).
- **Tabelle (seit 1.8):** Feld mit `html: ''` und
  `sheet: { v: 1, name: 'Tabelle1', cells: { 'A1': { v: 'Rohtext oder =Formel', f: { b, i, u, s, al: 'l|c|r', c, bg, fs, nf: 'num|cur|pct|sci|frac|date|datel|time|dt|text', d, cur, ts, secs } } }, nrows, ncols, cols: [Breiten px], head, band, grid, color }`.
  Seit 1.71 zusätzlich im Format: `va: 't'|'m'`, `wr`, `fn` (Schriftart), `in` (Einzug); am Excel-Blatt `xl: { fn, fs, rh, cw, f0 }`,
  `rowh: { Zeile: px }`, `hideR/hideC: [..]`, `merges: ['A1:C1']`, `dv: [{ ref, src, drop }]`; am Feld `ox.hid` (ausgeblendet);
  an der Seite `office.src = { asset, name, from, size }` (Original vor dem Umwandeln).
  Seit 1.72 am Excel-Blatt: `af: { ref, f: { Spalte: { vals: [..] } | { has } | { raw } } }` (Filter), `afx` (Original-XML),
  `hideF` (vom Filter ausgeblendete Zeilen), `dv: [{ ref, t: 'list|whole|decimal|date|textLength', op, a, b, src, drop, err, x, n }]`,
  `notes: { A1: { t, a } }`, `ps: { or, paper, m: [l, r, t, b, h, f], fit: { w, h }, scale, pa, pt, pg, ph, hf: { h: { l, c, r }, f } }`,
  `prot: { on, alg, hash, salt, spin, legacy, raw }`, `showF`; im Format `ul` (Zelle entsperrt); am Feld `ox.lk0`
  (Schlüssel der Teile beim Lesen). Word-Seite: `office.hf/hf0/hfp`, `wm/wm0/wmImg`, `hyph/hyph0`, `titlePg`; Felder
  `ox.k = 'hfp' | 'wmp'` (Anzeige je Blatt). PowerPoint: Rahmen `ox.hide/hide0`, `ox.tr = { type, dur, dir, adv, click }`,
  Animation `fx` auch `e:pulse|e:spin|e:grow|x:disappear|x:fade|x:fly|x:zoom`, Feld `b.pf = 'date'|'num'|'ftr'`,
  Seite `office.loop/loop0`, `pfNoTitle`. Seit 1.73 an jeder Office-Seite `office.props/props0` (core.xml),
  `theme { c, f }` (gewähltes Design), `themeName { c, f }`; Excel `office.wbProt/wbProt0` (Arbeitsmappenschutz).
  Seit 1.74 Word-Seite: `office.wbase { font, sz }` (Grundschrift der Formatvorlage Standard), `office.bm { Textmarke:
  Knotenindex }`, `office.clear` (durchsichtiges Bild für Platzhalter); Felder `ox.k = 'wtoc'` (Inhaltsverzeichnis,
  gesperrt, rohes HTML), `'wfl'` (vor/hinter dem Text: `ox.of` Absatzfeld, `rx/ry` Lage, `pg` relativ zum Blatt,
  `pic`), `'wfb'` (Textfeld in der Zeile, nach dem Absatz), `ox.brk` (Seitenumbruch oberhalb); `office.map` darf
  Abschnitte ohne Knoten haben (`i0 === i1`, `fl: true` = nicht im Fluss); Bilder `im.blk` (oben/unten: ganze Breite),
  `im.ghost` (Platzhalter fürs Umfliessen eines Textfelds), `im.miss` (Bild fehlt/EMF).
  Seit 1.75: Word `ox.k = 'wfn'` (Fuss-/Endnoten am Ende, rohes HTML), Textmarken `_ktfn<id>`/`_kten<id>` in
  `office.bm`; `office.hf.h/f.img [{ name, w, h, al }]` (Bilder der Kopf-/Fusszeile); Diagramm-Felder (`b.chart`) auf
  Word-/PowerPoint-/Excel-Seiten mit `ox` (Word `wfb`/`wfl`, PowerPoint `obj`); Excel `ox.k = 'xlo'` (Bild/Diagramm/Form:
  `sh` Blatt-Feld, `a`/`b` Anker { c, r, dx, dy }, Bilder `iw/ih/fw/fh`, Diagramm `chart: true`); PowerPoint-Bild
  `ox.r90` (um 90°/270° gedreht).
  Werte werden nie gespeichert, immer berechnet. `b.w` = Summe der Spalten + Rand (abgeleitet).
- **Diagramm (seit 1.8):** Feld mit `chart: { v: 1, type: 'col|bar|line|area|scatter|pie|doughnut', src: { id, name, range: 'A1:C6' } | null, byRow, title, xTitle, yTitle, legend: 'r|b|t|none', grid, labels, markers, smooth, stacked, trend: ''|'lin'|'exp'|'log'|'poly2'|'pow', eq, pal, h, cache: { cats, series: [{ name, vals, xs? }], xy, fmt, xfmt } }`.
  Seit 1.9 kann `src.auto: true` sein (Bereich wächst mit den Daten).
- Formeln stehen im `html` als `<span class="kt-math" contenteditable="false" data-tex="…" [data-display="1"]>`.
- `level` = Unterseiten-Ebene (0–2) innerhalb der Seitenreihenfolge des Abschnitts; eine
  Seite ist höchstens eine Ebene tiefer als die vorherige (`Tree.normLevels`).
- `modified` setzt `Hist.commit` bei jeder Änderung; `created` kann der User ändern.
- `drawings` liegen in Weltkoordinaten wie die Felder; Reihenfolge = Zeichenreihenfolge,
  `t0` = Entstehungszeit (bis 1.26 für die Wiedergabe; bleibt gespeichert, auch für den OneNote-Export).

- `aAnchor`/`bAnchor` fehlen, solange der Ansatzpunkt automatisch gewählt wird;
  `t` ist der Anteil (0–1) entlang dieser Seite.
- `bend` fehlt, solange die Linie nicht von Hand gebogen wurde; es ist die Verschiebung
  gegenüber der Mitte zwischen den beiden Endpunkten.
- Verbindungen zeigen auf **Knoten**: ein Feld ohne Paket oder ein Paket. Ist ein Feld in
  einem Paket, wird beim Zeichnen automatisch das Paket als Endpunkt benutzt
  (`Canvas.nodeOf`).

### Gruppenbaum (`Store.groups`)

```json
[{ "id": "g…", "name": "Schnellnotizen", "color": "#7a7574", "kind": "quick", "groups": [], "pages": ["p…"] },
 { "id": "g…", "name": "Mein Notizbuch", "color": "#6b4fbb", "kind": "notebook", "closed": false,
   "groups": [
     { "id": "g…", "name": "Erste Schritte", "color": "#6b4fbb", "kind": "section", "groups": [], "pages": ["p…", "p…"] },
     { "id": "g…", "name": "Archiv", "color": "", "kind": "group",
       "groups": [ { "…": "Abschnitte / weitere Abschnittsgruppen" } ], "pages": [] } ],
   "pages": [] }]
```

`kind`: `notebook` (nur oberste Ebene), `group` (Abschnittsgruppe), `section` (Abschnitt,
nur dieser hat Seiten), `quick` (Schnellnotizen, genau einer, immer zuoberst).
`Tree.norm` repariert/migriert jeden geladenen Baum (auch Backups).

### Ansichtszustand (`Store.ui`, Datei `zustand.json` bzw. IndexedDB `cache`)

`currentGroup` (= aktueller **Abschnitt**), `currentContainer` (geöffnetes Notizbuch/Gruppe
ohne Abschnitt), `currentPage, collapsed{}, collapsedPages{}, lastPage{Abschnitt:Seite},
lastSection{Notizbuch:Abschnitt}, recent[], views{Seite:{x,y,z}}, groupsW, pagesW,
pageListSide ('links' Standard | 'rechts'), showTabs (false), layoutV (2), customColors[≤10],
exportFormat, exportPaper, exportFit, exportHead, exportBg, navFold{groups,pages}, snap, theme, sidebar, tab, boxDefault{},
linkDefault{style,arrow,w}`, `ribbonMin` (Menüband eingeklappt; nicht gesetzt = automatisch auf niedrigen Fenstern), `scrollbars` (true), `showAnchors` (false), `linkRoute` (true = Ausweichen), `inkFix` (true = kaum lesbare feste Schriftfarben heller/dunkler anzeigen), `inkTpl` (Fotomath: gelernte Zeichen `[{cls, n, c:[[x,y]…]}]`), `calc{x,y,px,py,open,min,kind:'sci'|'simple',scale,mode,vars,hist,lists,ans,mem,opDef,tbl,ev}`, Zeichnen: `pens[8]{kind,color,w}, activePen, eraserMode,
eraserSize, shapeFill, recognize, penOnly, ruler{visible,x,y,angle}, protractor{…}`, seit 1.24: `sicherung{intervall,
nurAenderung, anzahl, (Desktop) bilder, papierkorbTage}`, `versionen{abstand, max}` (Browser), `sicherungStand{zeit, stand}` (Browser), seit 1.35:
`panes{root, active}` – Baum aus `{t:'pane', id, tabs:[Seiten-ID|null], cur}` und `{t:'split', dir:'h'|'v', kids[],
sizes[]}` (Gewichte), `active` = ID des Bereichs mit der Zeichenfläche (`Panes.norm` repariert/ergänzt beim Start),
seit 1.36: `pageHead` (Titel über der Seite, sonst nur im Tab), `tabsMin` (Tableiste eingeklappt) – beide auch im
frühen Stand (`kt-ui`), seit 1.38: `spell{on, langs['de-CH','en-US'], fach, user[]}` (Rechtschreibung),
`fotomath{steps, ascii}` (Rechenweg aufgeklappt, nur Tastaturzeichen), seit 1.66: `grammar` (false = Grammatik aus),
`spellCustom[{code:'x-…', label, aff, dic}]` (eigene Wörterbücher, Dateien als Assets), `fonts[{name, asset}]` (eigene
Schriftarten), `plugins[{id, name, version, asset, on}]` (Add-Ins), `pluginData{id:{…}}` (`api.store` der Add-Ins),
seit 1.74: `wordPages{mode: '1'|'2'|'n', fit: 'width'|'page'|null, z, side}` (Seitenansicht),
seit 1.73: `qat[{cmd, arg, title, svg}]` (Schnellzugriff), `wordRead{w, bg, fs}` (Lesemodus),
seit 1.72: `officeOpenType` (Dateityp im Öffnen-Bereich), `officeSaveType{docx,xlsx,pptx}` (letzter Dateityp beim
Speichern unter), `exportOfficeTypes{docx,xlsx,pptx}` (Export-Fenster), `xlBreaks` (Excel-Seitenumbrüche), `xlNotesAll`
(alle Notizen zeigen), `symRecent[]` (zuletzt verwendete Symbole),
seit 1.67: `wordMarks` (¶), `wordRuler` (false = keine Lineale), `wordNav` (Navigationsbereich), `pptView{Seiten-ID:
'normal'}` (PowerPoint-Ansicht je Seite, fehlt = Lernansicht), `pptAnimPane` (false = ohne Animationsbereich),
`pptGuides`, `pptGrid`, seit 1.68: `ofvW{strip, ncol, ap, nav}` (Breiten der Office-Leisten in px), seit 1.69:
`addins{id: true|false}` (Häkchen der eingebauten und Ordner-Add-Ins, fehlt = Standard; auch im frühen Stand `kt-ui`)

### Verlauf (`verlauf.json` bzw. IndexedDB `cache`)

```json
{ "v": 1,
  "undo": [{ "label": "Verschieben", "page": "p…", "t": 1757…,
             "patches": [{ "k": "p", "id": "p…", "b": "<JSON vorher>", "a": "<JSON nachher>" },
                         { "k": "t", "b": "<Baum vorher>", "a": "<Baum nachher>" }] }],
  "redo": [] }
```

---

## 7. Speicherung

### Desktop: Ordner neben der EXE

```
KnowledgeTree\
  KnowledgeTree.exe
  KnowledgeTree im Browser starten.bat     Notfall-Start ohne eigenes Fenster
  LIESMICH.txt
  Saves\                 ← die Daten des Users
    _struktur.json       Reihenfolge der obersten Gruppen
    _INFO.txt
    _Bilder\             Eingang: frisch eingefügte Bilder/Anhänge, bis sie beim Speichern ihrem Abschnitt
                         zugeordnet sind (bis 1.32 lagen hier alle; Name = SHA1-Prüfsumme)
    <Gruppe>\
      _gruppe.json       { typ, id, name, farbe, art, geschlossen, reihenfolgeGruppen, reihenfolgeSeiten }
      <Seite>.seite.json
      _Bilder\           (seit 1.33) Bilder und Anhänge, die die Seiten DIESES Abschnitts brauchen
      <Untergruppe>\ …
  Cache\
    verlauf.json         Undo/Redo (100 Schritte)
    zustand.json         Zoom, letzte Seite, aufgeklappte Gruppen
    Papierkorb\          gelöschte Seiten/Gruppen (mit Zeitstempel im Namen), _Bilder\ (unbenutzte Bilder);
                         nach 60 Tagen endgültig gelöscht (Einstellungen → Speicher)
    Backups\             KnowledgeTree-Backup_<Datum>\ = Backup wie bei OneNote (Ordner je Notizbuch, Datei je
                         Abschnitt mit allen seinen Bildern – bis 1.32 lagen geteilte Bilder in _Bilder\ oben;
                         Zeitplan/Anzahl: Einstellungen → Sicherung,
                         Standard: bei jedem Start, nur bei Änderungen, 10 Stück), _stand.json (letztes Backup);
                         ältere Saves_….zip (bis 1.24) bleiben lesbar
    WebView2\            interne Dateien des Programmfensters
    laeuft.json, log.txt, fenster-test.txt
```

Der Go-Teil ist nur ein Vermittler: der Client schickt den kompletten Baum, der Server
**gleicht den Ordner daran an** (`store.go`, Funktion `reconcile`): Ordner umbenennen,
verschieben, Seiten schreiben, Verschwundenes in den Papierkorb. Dateinamen werden aus
Gruppen-/Seitennamen gebildet (ungültige Windows-Zeichen ersetzt, Namen eindeutig gemacht,
reservierte Namen wie `CON` abgefangen). Der echte Name steht zusätzlich in der JSON-Datei,
die ID ebenfalls – deshalb überlebt alles auch ein Umbenennen im Explorer.

**Bilder je Abschnitt (seit 1.33, `assets.go`):** jeder Abschnitt-Ordner hat einen eigenen `_Bilder`-Ordner mit allen
Bildern und Anhängen seiner Seiten – ein Abschnitt-Ordner ist damit vollständig und kann kopiert und weitergegeben
werden (beim Empfänger in Saves legen; ganz oben abgelegt erscheint er in einem Notizbuch). Neue Bilder kommen über
`/api/bild` bzw. `/api/datei` zuerst in den Eingang `Saves/_Bilder`; `reconcile` legt beim Speichern einer Seite ihre
Bilder in ihren Abschnitt (`placePageAssets`), beim Verschieben einer Seite in einen anderen Abschnitt aus deren Datei.
Braucht ein zweiter Abschnitt dasselbe Bild, liegt es dort ebenfalls – als harte Verknüpfung (kein doppelter Platz,
NTFS kann das), sonst als Kopie. Ein Index (`assetLoc`: Name → Abschnitt-Ordner) beantwortet `/bilder/<name>`
(`findAsset`: Abschnitte, Eingang, Papierkorb); er wird beim Einlesen aus den `_Bilder`-Ordnern gebaut und bei
Umbenennungen mitgeführt. Einmal nach dem ersten Einlesen räumt `assetMaintenance` im Hintergrund auf (Abschnitt für
Abschnitt unter der Sperre): ordnet den Altbestand zu (Umstellung von 1.32: 278 Bilder → 483 Ablagen in 87 ms),
holt Fehlendes, nimmt nicht mehr Gebrauchtes aus den Abschnitten (liegt es nirgends sonst: in den Eingang) und räumt
den Eingang auf (`collectUnusedImages`: was schon in einem Abschnitt liegt, weg; was keine Seite und der Verlauf nicht
braucht, nach 10 Minuten in den Papierkorb). Wird ein Abschnitt gelöscht, kommen seine Bilder nach
`Cache/Papierkorb/_Bilder` (`trashGroupAssets`) – Rückgängig speichert die Seiten neu und holt sie von dort zurück.

API des internen Servers (nur 127.0.0.1, Zugriffsschlüssel `?t=…` als Header `X-Token`,
Sitzungsnummer `X-Sitzung` gegen zwei gleichzeitige Fenster):
`/api/laden, /api/sync, /api/verlauf, /api/zustand, /api/bild, /bilder/<name>,
/api/datei?ext=…, /api/ordner, /api/link, /api/backup[?immer=1], /api/ping, /api/beenden, /api/fokus`, seit 1.24
`/api/backups` (Liste, `ordner: true` für Backup-Ordner), `/api/backup-dateien?name=` (Dateien eines
Backup-Ordners), `/api/backup-datei?name=[&pfad=]` (ein altes ZIP-Backup bzw. eine Datei daraus), `/kt-app.html`
(die eingebettete Webseiten-Fassung als Vorlage für interaktive Dateien, seit 1.25), seit 1.31 `/api/laden?stufen=1`
(ohne Inhalte: `pageIds`, `titles`; die gelesenen Seiten bleiben in `stagedPages`) und `/api/seiten` (`{ids}` →
`{pages}`, aus `stagedPages`, danach freigegeben, sonst von der Platte; seit 1.32 dort mit `json.Valid` geprüft),
seit 1.32 statt `titles` die Kopfangaben `meta` (`{t, l, c, m}`) und ohne Verlauf, dafür `/api/verlauf-laden`,
`/api/vorhanden` (welche Bilder da sind,
holt sie aus dem Papierkorb zurück), `/api/speicher` (Belegung). `/api/sync` mit `"teil": true` = nicht der
letzte Teil: nur anlegen/schreiben, keine leeren Seiten vormerken, nichts in den Papierkorb.

Seiten (`.seite.json`) schreibt `pageJSON` seit 1.24 platzsparend (oberste Felder und Einträge der obersten Listen
je auf einer Zeile, darin kompakt; Feldreihenfolge wie vom Programm); unveränderte Seiten und `_gruppe.json`
werden nicht neu geschrieben (Dateizeit bleibt → „Backup nur bei Änderungen“ funktioniert).

### Browser: IndexedDB

Datenbank `KnowledgeTree` (**Version 2**) mit den Bereichen
`saves_struktur` (Baum), `saves_seiten` (alle Seiten), `saves_bilder` (Bilder als
Blob), `cache` (verlauf, zustand), `papierkorb` (nur noch alte Einträge bis 1.19, 60 Tage – seit 1.20 wird
Gelöschtes restlos entfernt) und
`versionen` (keyPath `id`, Index `seite` = `[page, saved]`; Eintrag
`{id, page, saved, t, title, data}`). Versionen entstehen in `sync`: vor dem Überschreiben
einer Seite wird der alte Stand abgelegt, wenn die letzte Version dieser Seite älter als
10 Minuten ist; mehr als 50 → die ältesten fliegen raus.

- Backup = seit 1.24 eine KnowledgeTree-Datei (ZIP, siehe Abschnitt 3 „Sicherung, Export und Einstellungen“) als
  Download oder in den Sicherungsordner (Handle in `cache/sicherungsordner`); bis 1.23 eine `.json`-Datei mit
  Bildern als Daten-URL (wird weiter gelesen). Laden wahlweise „alles ersetzen" oder „zusätzlich hinzufügen"
  (dabei werden IDs neu vergeben).
- `navigator.storage.persist()` wird beim Start angefragt; der Info-Dialog zeigt den
  belegten Platz und warnt vor dem Löschen der Browserdaten.
- Zwei Tabs: der neuere meldet sich über `BroadcastChannel`, der ältere wird
  schreibgeschützt (gleiches Overlay wie beim Desktop-Konflikt).
- Unbenutzte Bilder räumt `cleanup()` auf (seit 1.20; vorher `collectGarbage`): 8 s nach dem Start, 20 s nach einem
  Löschen und auf Knopfdruck; gebraucht wird, was Seiten oder Verlauf im Speicher, alte Papierkorb-Einträge oder
  Versionen nennen; sonst frühestens 10 Minuten alt (beim Aufräumen nach Absturz/Knopf sofort). Versionen
  gelöschter Seiten verschwinden mit der Seite.
- JSON-Backup-Format bis 1.23: `version: 2` (mit `name` beim Notizbuch-Export); alte Backups ohne `kind`
  werden beim Hinzufügen als eigenes Notizbuch „Wiederhergestellt“ eingelesen. Seitenversionen: Abstand und
  Anzahl seit 1.24 aus `Store.ui.versionen` (Einstellungen → Speicher).

---

## 8. Wichtige Technik-Entscheide und Fallstricke

Diese Punkte sind absichtlich so gelöst – bitte beim Ändern nicht kaputt machen:

1. **Textumfluss um Bilder:** Bilder liegen als CSS-`float` in einer eigenen Ebene (`.fl`)
   **vor** dem bearbeitbaren Text. Für die freie Position sorgt pro Bild ein unsichtbarer
   Abstandshalter (`width:0`, Höhe = Abstand von oben) plus `margin-left/right` für links/rechts.
   Dadurch fliesst der Text echt um das Bild, ohne eigene Layout-Engine. Die Seite (links
   oder rechts) ergibt sich daraus, in welcher Hälfte das Bild liegt.
2. **Leere Textfelder** werden nie gespeichert (`isEmptyBox`), weder in die Datei noch in den
   Verlauf. Deshalb darf man beliebig auf die Fläche klicken, ohne Müll zu erzeugen.
3. **Undo = Schnappschuss-Vergleich.** `Hist.touchPage/touchTree` merken nur „hier hat sich
   was geändert", `Hist.commit(label)` vergleicht den JSON-Stand mit dem letzten Stand und
   schreibt daraus einen Schritt. Tippen wird über `commitSoon` (0,9 s Pause) zu einem
   Schritt zusammengefasst; vor jedem anderen Befehl wird mit `flushPending()` abgeschlossen.
4. **Das Menüband darf den Textcursor nicht stehlen:** auf allen Knöpfen `mousedown` →
   `preventDefault()`. Für Eingabefelder (Schriftart/Grösse) merkt sich `Canvas.lastRange`
   die Markierung, `Canvas.restoreRange()` stellt sie wieder her. Nach jedem
   Formatierungsbefehl wird `lastRange` neu gesetzt (sonst zeigt sie auf gelöschte Knoten).
5. **Pointer-Capture:** Beim Ziehen fängt `#viewport` die Maus ein. Dadurch zeigt `ev.target`
   bei `click`/`dblclick` nicht mehr auf das eigentliche Element – `onDbl` ermittelt es
   deshalb über `document.elementFromPoint()`.
6. **Ebenen (z-index) auf der Fläche:** Pakete 0 → Zeichnungen „unten“ 1 → Verbindungen 1
   → Textfelder 2 → Textmarker 3 (eigene SVG-Ebene mit `mix-blend-mode: multiply`, im
   dunklen Design `screen`) → Zeichnungen „oben“ 3 → Lineal/Winkelmesser/Auswahlrahmen 4 →
   Anfasser der Verbindungen 5 → Vorschau beim Ziehen 100000.
7. **SVG-Grössen:** Die Verbindungs-Ebene bekommt bei jedem Zeichnen die Bounding-Box aller
   Linien als Position/Grösse (statt einer riesigen Fläche), damit Klicks auf Linien zuverlässig
   funktionieren.
8. **Zwei Speicher-Anbindungen, eine Oberfläche:** `backend-server.js` und
   `backend-browser.js` haben dieselbe Schnittstelle; `build_web.py` tauscht beim Bauen die
   eine gegen die andere. Neue Funktionen bitte immer über `Backend.*` führen, nie direkt
   `fetch('/api/…')` im Oberflächen-Code.
9. **Eingefügtes HTML wird bereinigt** (`sanitizeHtml`): nur harmlose Tags und ein paar
   Stil-Eigenschaften bleiben; Skripte, Bilder-Tags, Positionierungen fliegen raus.
10. **Dateien, die auf die Oberfläche gezogen werden**, werden ausserhalb der Zeichenfläche
    immer abgefangen (`preventDefault`), sonst navigiert das Programmfenster zur Datei.
    Links werden nie im Fenster geöffnet (`a[href]:not([download])`), sondern per
    Strg+Klick über `Backend.openLink` im Standardbrowser. Die Ausnahme `:not([download])`
    ist wichtig, sonst funktioniert der HTML-Export nicht mehr.
11. **Schmales Fenster:** Menüband-Gruppen mit der Klasse `compactable` zeigen unter 1420 px
    nur noch Symbole; das Menüband kann waagrecht scrollen.
12. **Der Browser-Speicher darf keine Objekte mit der laufenden Oberfläche teilen** (früher `lastGroups` für den
    Papierkorb-Pfad; seit 1.20 entfällt das, weil Gelöschtes restlos entfernt wird).
13. **Fenster schliessen (Desktop):** Die WM_CLOSE-Nachricht wird abgefangen, die Seite
    speichert alles fertig und meldet sich über `/api/beenden` zurück; nach spätestens
    5 Sekunden wird trotzdem geschlossen.
14. **Wenn WebView2 fehlt oder abstürzt**, startet das Programm beim nächsten Mal von selbst
    ein Edge/Chrome-Fenster im App-Modus (Markierungsdatei `Cache\fenster-test.txt`),
    ersatzweise den Standardbrowser.
15. **Zeichnen vor allem anderen:** `Canvas.onDown/onMove/onUp` rufen zuerst
    `Draw.onDown/onMove/onUp`; gibt `Draw` `true` zurück, ist das Ereignis erledigt. Im
    Auswahl-Werkzeug trifft `Draw` nur, wenn wirklich eine Zeichnung unter dem Zeiger liegt
    (Textmarker über Text werden dabei übergangen, damit man den Text noch bearbeiten kann).
    `Canvas.onClick/onDbl` tun in Zeichen-Werkzeugen nichts (sonst entstünden Textfelder).
16. **Striche als gefüllte Umrisse:** Kugelschreiber, Bleistift, Regenbogen und Glitzer
    werden als Fläche (Umriss mit variabler Breite) gezeichnet, nicht als `stroke`. Grund:
    Verläufe/Filter mit `objectBoundingBox` verschwinden bei waagrechten Linien (Höhe 0).
    Nur der Textmarker ist ein `stroke`. Die Darstellung wird pro Zeichnung im `Draw.cache`
    gehalten (Schlüssel `Draw.sig`).
17. **Dunkle Tinte im dunklen Design:** Elemente mit sehr dunkler Farbe bekommen die Klassen
    `kbf`/`kbs`; CSS färbt sie im dunklen Design hell. Gespeichert wird die echte Farbe.
18. **Zwei Auswahlen:** `Canvas.sel` (Felder/Pakete) und `Draw.sel` (Zeichnungen) sind
    getrennt, werden aber gemeinsam gelöscht, kopiert (`clip.drawings`), verschoben und
    abgewählt. `Canvas.select(…)` ohne „zusätzlich“ leert `Draw.sel`.
19. **Seitenversionen-Vorschau** zeigt ein Seitenobjekt über `Canvas.showPage(page)`, ohne
    `Store.pages` anzufassen; `#preview-glass` fängt alle Klicks ab (nur verschieben/zoomen),
    das Menüband ist gesperrt, `hasPage()` ist dann `false`.
20. **Fokus nach „Neue Seite“** muss sofort (nicht nur per `setTimeout`) auf den Titel gehen,
    sonst landen schnell getippte Zeichen im Leeren.
21. **OneNote-Dateiformat – was sich an echten Dateien bestätigt hat:**
    - Längen (OffsetFromParent…, LayoutMaxWidth, PictureWidth, Seitenränder) sind in
      **halben Zoll** → ×48 = Pixel. Tinte ist in **HIMETRIC** (1000 pro cm, siehe
      Metrik-Tabelle) → ×96/2540 = Pixel. Beide liegen im selben Seiten-Koordinatensystem.
    - Der Titel hängt an `StructureElementChildNodes` der Seite (nicht an ElementChildNodes);
      Datum/Uhrzeit unter dem Titel (`IsTitleDate`/`IsTitleTime`) werden übersprungen.
    - Seiten-Metadaten (`CachedTitleString`, `PageLevel` 1–3, `TopologyCreationTimeStamp`)
      stehen im Seitenraum als Wurzel mit Rolle 2 und/oder im Abschnitt unter
      `MetaDataObjectsAboveGraphSpace`. `LastModifiedTime` = Sekunden seit 1.1.1980.
    - Titel-Text oft als `TextExtendedAscii` (Windows-1252), sonst `RichEditTextUnicode`.
    - Gültige Knotenzahl jeder Dateiknoten-Liste kommt aus dem **Transaktions-Log** – nie
      einfach bis zum Fragmentende lesen.
    - Tinte (in [MS-ONE] nicht beschrieben): Container `0x00060014` (Eigenschaft
      `0x14001D4E`: 1 = Freihand, 3/4/5 = Form), → `0x20003415` InkData `0x0002003B` →
      `0x24003416` Striche `0x00020047` mit Pfad `0x1C00340B` (ISF-Mehrbyte-Zahlen mit
      Vorzeichen: erste Zahl = Anzahl, dann je Kanal alle Werte, **Delta-kodiert**),
      Zeit `0x1C00341D`, Eigenschaften `0x20003409` → `0x00120048` mit Metrik-Tabelle
      `0x1C00340A` (32-Byte-Einträge: GUID, min, max, Einheit, Auflösung; X/Y/Druck),
      Breite `0x1400340C`, Farbe `0x1400340F` (COLORREF), Textmarker `0x08003411` bzw.
      Raster-Op `0x0C003413` = 9, Transparenz `0x0C003414`.
    - Inhaltsverzeichnis (.onetoc2): Wurzel `0x00020001`, Kinder `0x24001CF6` mit Dateiname
      `0x1C001D6B`, Reihenfolge `0x14001CB9`, Farbe `0x14001CBE` (auch Notizbuchfarbe an
      der Wurzel).
    - OneNote packt .onepkg mit **LZX** (Fenster 2^18) – `lzxDecompress` folgt libmspack
      (Rahmen à 32 KB, Neuausrichtung nach jedem Rahmen, E8-Rückübersetzung).
    - **Seitenursprung:** `PageMarginOriginX/Y` (1,0 bzw. 0,4 halbe Zoll) – Titel liegt bei
      (0,0), Inhalte darunter; Tinte hat Container-Offset 0 und absolute Strich-Koordinaten.
22. **OneNote schreiben (Beta, `onenote-write.js`) – so ist die Datei aufgebaut:**
    - Kopf wie OneNote 365 (ffv 0x2A; Inhaltsverzeichnis 0x1B), `cTransactionsInLog = 1`,
      kein Hashed-Chunk-/Free-Chunk-List (fcrNil). Dateiknoten mit Verweis immer im Format
      StpFormat 1 / CbFormat 0 (je 4 Byte). **Jeder Knotenkopf mit Bit 31 = 1** (Reserved, MUSS; fehlte bis
      1.20), CbFormat 0 bei BaseType 0. Listen-IDs ab 0x10; Listen werden in Fragmente ≤ 48 KB geteilt
      (`nextFragment`, `nFragmentSequence`), ein nicht letztes Fragment endet mit **ChunkTerminatorFND (0x0FF)**
      – sonst liest OneNote die Füllnullen als Knoten; der Terminator zählt nicht im Transaktions-Log.
    - **Transaktions-Log-CRC** über **alle Einträge vor dem Abschlusseintrag** (ohne ihn), für .one CRC-32
      (RFC 3309), für .onetoc2 **MsoCrc32** (Polynom 0xAF, nicht gespiegelt, Start 0, ohne Abschluss-XOR).
      Beides an echten Dateien nachgerechnet. Eine Transaktion mit allen Listen.
    - Pro Objektraum eine Revision (`RevisionManifestStart6`, Rolle 1) mit **einer** Objektgruppe
      (eigene Global-ID-Tabelle mit allen benutzten GUIDs, `DataSignatureGroupDefinition`,
      Deklarationen), danach **immer `ObjectInfoDependencyOverridesFND` (0x084)** (MUSS nach jeder 0x0B0):
      Verweis fcrNil, Daten im Knoten (`cRef` 0, Prüfsumme über die `cRef`-Werte der Gruppe als u32 – CRC-32 bzw.
      im Inhaltsverzeichnis MsoCrc32). Dazu je Seite der **Versionsverlauf** wie bei OneNote: zweite Revision
      `RevisionManifestStart7` im Kontext **{7111497F-1B6B-4209-9491-C98B04CF4C5A}:1** (fest, [MS-ONE] 2.1.18)
      mit leerem `0x6003C` + Metadaten `0x20046`, die Seite verweist über `VersionHistoryGraphSpaceContextNodes`.
      Inhaltsverzeichnis: alte Knoten (`RevisionManifestStart4`, `GlobalIdTableStart` 0x021,
      `ObjectDeclarationWithRefCount` 0x02D, `RootObjectReference2`, 0x084 nach den Deklarationen).
    - CompactID = Index·256 + n → **n höchstens 255**: nach 250 Objekten neue GUID (`Space.nextOid`).
    - Schreibgeschützte Typen (JCID-Bit 0x00100000: Absatz-/Lauf-Format `0x0012004D`, Autor
      `0x00120001`, Strich-Eigenschaften `0x00120048`) brauchen
      `ReadOnlyObjectDeclaration2RefCount` mit MD5. **Offen:** OneNotes MD5 liess sich aus den
      Rohdaten nicht nachrechnen (auch nicht mit JCID, Kopf, ohne Füllung …) – gleiche Daten haben in echten
      Dateien sogar verschiedene Hashes, OneNote prüft ihn also nicht gegen die Daten. Wir schreiben MD5 der
      Objektdaten und legen gleiche schreibgeschützte Objekte nur einmal an (wie OneNote: nie zwei gleiche
      in einer Revision).
    - Abschnitt: SectionNode (Rolle 1) + SectionMetaData (Rolle 2), PageSeriesNode mit
      `ChildGraphSpaceElementNodes` = Seitenräume (Reihenfolge = Seitenreihenfolge). Seite:
      PageManifest (Rolle 1), PageMetaData (Rolle 2, `PageLevel` = Ebene+1), RevisionMetaData
      (Rolle 4), PageNode mit Titel (TitleNode → Titel-Outline + Datum/Zeit-Outline) und
      Inhalten. Eigenschaften und Werte wie in den Dateien des Users (auch unbenannte IDs).
    - Text: `TextExtendedAscii` (Windows-1252) wenn möglich, sonst `RichEditTextUnicode`;
      Läufe über `TextRunIndex` + `TextRunFormatting`; Links als Feld `\uFDDFHYPERLINK "url"`.
    - Bilder: `PictureContainer14` (0x00080039) über `ObjectDeclarationFileData3RefCount`
      mit `<ifndf>{GUID}` + FileDataStore im Wurzel-Knoten (nicht unterstützte Formate → PNG; erlaubt sind nur
      DIB/EMF/JPEG/PNG/TIFF/WMF). **Pflicht nach [MS-ONE]:** jedes Bild mit `LanguageID` und Bilddaten (ohne
      Daten → kleiner grauer Platzhalter), `OffsetFromParent…` nur direkt auf der Seite, `IsBackground` nur dort.
      Anhänge (`EmbeddedFileNode`) brauchen ein **Symbolbild** (`PictureContainer`, 64 × 64 PNG wie OneNote –
      eigene Zeichnung `fileIcon()`, Farbband je Dateityp, ohne Canvas über `pngImage()`), `LanguageID` und
      `RichEditTextUnicode` (Dateiname, ohne CR/LF). Gleiche Symbolbilder liegen nur einmal im FileDataStore
      (`shared()`); der Leser zählt das Symbolbild eines Anhangs als zugeordnet.
    - Tabellen: 1–255 Spalten, mindestens eine Zeile, jede Zeile genau so viele Zellen wie Spalten (fehlende
      werden leer ergänzt), Spaltenbreite ≥ 1.0 halbe Zoll (48 px). Absatztext ohne LF: Umbruch im Absatz =
      U+000B (wie OneNote). Leerer Abschnitt = `SectionNode` ohne Seitenreihe. Abschnittsfarbe zusätzlich in
      `SectionMetaData` (NotebookColor).
    - Tinte: ISF-Pfad (Anzahl, dann X-, Y-, Druck-Kanal, Delta, Zickzack-Vorzeichen),
      Metrik-Tabelle wie OneNote (HIMETRIC, Druck 0–32767).
    - **Strom-Köpfe** der Objektdaten (`ObjectSpaceObjectPropSet`, [MS-ONESTORE] 2.6.1–2.6.5): OID-Kopf mit
      `OsidStreamNotPresent`, wenn weder OSIDs noch Kontexte folgen; **`ExtendedStreamsPresent` im OID- UND im
      OSID-Kopf**, sobald Kontexte folgen (fehlte bis 1.21 im OID-Kopf → OneNote öffnete keine Seite);
      `fHasOsidReferences` in der Deklaration = OSID-Strom vorhanden (auch bei nur Kontexten, wie OneNote).
      Gruppen-ID (`ObjectGroupListReference`/`ObjectGroupStart`) mit n = 0 wie bei OneNote.
    - **Ausdrucke (1.22):** Seitenbild mit `DisplayedPageNumber`, 0x14001DF9 (Seitenindex), 0x1C001D84
      (16 Byte Kennung des Ausdrucks), 0x08001D85 = true, 0x200035C1 → Dateiobjekt **0x80060** (Quelldatei,
      z.B. PDF); mit Druckdokument: `PictureContainer` → **0x8003A** (.xps) und `WebPictureContainer14` → PNG.
      Jede Datei je Abschnitt nur einmal im FileDataStore (`fileGuid(key)` über den KnowledgeTree-Namen) – eine PDF
      für 13 Seitenbilder liegt einmal darin.
    - Prüfen ohne OneNote: **`node tests/onenote/onecheck.js datei.one …`** (strenger Prüfer, siehe Fallstrick 56),
      `node tests/onenote/export-check-test.js`, und im Browser exportieren → wieder importieren → vergleichen.
23. **Export rendert jede Seite im echten Canvas** (`Export.renderEach`): helles Design
    erzwingen, `Canvas.showPage(seite)`, warten bis Bilder geladen, `layout()`; danach Design,
    Ansicht (`Store.ui.views`) und aktuelle Seite wiederherstellen. Textfelder werden über
    **berechnete Stile** (`getComputedStyle`) in OneNote-Läufe umgesetzt – so stimmen
    Schrift, Grösse und Zeilenabstand mit der Anzeige überein.
24. **Enter in Eingabefeldern von Popups/Dialogen** muss `preventDefault()` aufrufen, wenn
    danach der Textcursor ins Textfeld zurückkehrt – sonst ersetzt der nachfolgende
    Tastendruck den markierten Text (betraf Farbrad und Link-Dialog).
25. **Playwright-Falle:** `page.evaluate("… = (u) => …")` gibt eine Funktion zurück, die
    Playwright dann aufruft – in Tests Zuweisungen mit `; 0` abschliessen.
26. **Doppelklick in SVG, das bei jedem Klick neu gezeichnet wird:** Chrome schickt kein
    `dblclick`, wenn der erste Klick die Elemente unter der Maus ersetzt hat, und
    `pointerdown.detail` ist immer 0 → Doppelklick selbst über Zeit/Abstand erkennen
    (Chem-Draw).
27. **Popups über Dialogen:** `.popup` hat z-index 1000, `.dlg-back` 2000. Regel
    `.dlg-back ~ .popup { z-index: 2100 }` hebt Menüs, die aus einem Dialog heraus geöffnet
    werden (später im DOM), darüber. Tastatur in eigenen Dialogen: den Dialog selbst
    fokussierbar machen (`tabindex=-1`), sonst landen die Tasten bei `body` und die globalen
    Kürzel (Strg+Z der Seite) greifen.
28. **Eingabefelder in `.dlg`:** `.dlg input[type=text]` (Breite 100 %) ist spezifischer als
    eine einfache Klasse → eigene Felder als `.dlg input.klasse` gestalten; Fokus mit
    `preventScroll`, sonst scrollt ein `overflow: hidden`-Bereich mit.
29. **SVG-Bilder rastern:** `createImageBitmap` kann in Chrome keine SVG-Blobs → über ein
    `<img>` laden und in ein Canvas zeichnen (OneNote-Export).
30. **Chem-Namen testen:** in Node lassen sich `chem.js`, `chem-layout.js`, `chem-name.js`,
    `chem-db.js` zusammen per `new Function(...)` laden (kein DOM nötig ausser für Textbreiten
    im Renderer). Testlisten „SMILES => erwarteter Name“; nach jeder Änderung am Namensgenerator
    alle Listen laufen lassen (Regeln greifen ineinander).
31. **Zeichnungs-Stereo ist die Wahrheit:** Doppelbindungen ohne /\ in SMILES bekommen beim
    Anordnen eine Lage (Zickzack = E) – der Name enthält dann „(2E)“, wie in ChemDraw.
32. **Bearbeitungsleiste ohne Sprung:** Sie liegt im Layout über der Fläche; beim Ein-/Ausblenden
    verschiebt `Sheet.refreshUi` die Ansicht um genau die Höhe zurück (sonst trifft der zweite
    Klick eine Zeile daneben).
33. **Tastatur in Tabellen:** ein unsichtbares `textarea.xl-kb` im aktiven Feld hat den Fokus
    (Tasten, copy/cut/paste-Ereignisse, IME). Beim Verlassen der Tabelle muss es den Fokus abgeben
    (`Sheet.deactivate`), sonst greifen globale Kürzel wie Strg+Z nicht (main.js sieht ein
    Eingabefeld). Behandelte Tasten: `preventDefault` + `stopPropagation`.
34. **Klick unter Pointer-Capture:** `click.target` ist die Fläche → Diagramm-Klick und
    Doppelklicks über `elementFromPoint` bzw. eigene Zeitmessung (`pointerdown.detail` ist 0).
35. **Neu rechnen (seit 1.26):** `Sheet.ver` steuert nur das Neuzeichnen (`e._xlVer`); die Mappe bleibt bestehen.
    `Sheet.bump()` = neu einlesen (Seitenwechsel, Rückgängig: Inhalt geänderter Tabellen vergessen), `Sheet.reset()`
    = alles vergessen, `Sheet.markDirty(id, Zellen|Bereich)` + `refresh()` = gezielt (siehe Fallstrick 70).
    Diagramme legen dabei `chart.cache` neu ab (abgeleitet).
36. **Aktive Tabelle liegt oben** (`.box.xl.xl-on { z-index: 99990 !important }`), sonst
    verdecken Nachbarn das Ausfüllkästchen.
37. **Exportieren ohne Bedienelemente:** alles Bedienzeug von Tabellen/Diagrammen hat die Klasse
    `ui-only` und wird in PDF/HTML-Export entfernt.
38. **OneNote-Träger:** Rückimport-Daten nur im Alternativtext (dokumentiert, bleibt in OneNote);
    keine undokumentierten Eigenschaften schreiben. Integrität über den Vergleich der sichtbaren
    Texte mit `vals`.
39. **Hochgestelltes in Flex-Containern wirkt nicht:** `<sup>` direkt in einem `display:flex`
    Element ignoriert `vertical-align`. Tastenbeschriftungen stehen deshalb in `.ck-m`
    (inline-block), Σ-Inhalt in `.csum-a`. Klassennamen im Rechner nicht mit anderen kollidieren
    lassen (`.cp` gehört dem Farbwähler → Hochzahl im Rechner heisst `.cpw`).
40. **Gezielte Neuberechnung:** `Sheet.markDirty(id)` + `Sheet.changed()` rechnet nur betroffene
    Tabellen (`dependents`) und deren Diagramme; Strukturänderungen setzen `Sheet._full = true`
    (dann wie früher `bump` + `Canvas.render`). `XL.Book.invalidate(ids)` vergisst nur die Werte
    dieser Tabellen; geparste Formeln liegen in einem Merker (`AST_CACHE`, Text → Baum).
41. **Ausweichen kostet Rechenzeit:** Wege werden pro Verbindung im `routeCache` gemerkt (Schlüssel
    = Endpunkte, eigene Felder + Lage der Hindernisse in der Nähe). Pro Bild höchstens ~10 ms rechnen,
    der Rest folgt im nächsten Bild (requestAnimationFrame; bis dahin bleibt der letzte Weg stehen).
    Beim Ziehen einer Linie wird nicht ausgewichen. `Route.shapeBad` prüft die gewohnte Form (fremde
    Felder: 10 px, eigene Felder: nie hindurch, Mitte 6 px bzw. halbe Lücke), `Route.route` sucht mit
    senkrechten Anfangs-/Endstücken (`stubPt`, höchstens bis zur halben Lücke) und behandelt die eigenen
    Felder als Hindernisse. Führt ein Umweg aus dem Suchfenster (±260 px) heraus, werden die dort
    getroffenen Felder dazugenommen und nochmals gesucht. Messung im Test: 67 Verbindungen zwischen
    48 Feldern, keine näher als 6 px an einem Feld; Feld ziehen ≈ 14 ms pro Bild.
42. **Fotomath ist reine Geometrie:** Reihenfolge der Striche zählt (nacheinander geschrieben und
    überlappend = ein Zeichen). Aus Bildern kommen Striche je Komponente; `comp` hält zusammen, was
    zusammenhängt (nur übereinander liegende Teile). Zhang-Suen löscht kleine Kleckse ganz → Punkt
    in der Mitte behalten; Douglas-Peucker braucht für geschlossene Schleifen (0) den Abstand zum
    Anfangspunkt. Gelernte Vorlagen klein halten (2 Nachkommastellen, max. 160), sie liegen im
    Ansichtszustand.
43. **`#app` ist `position: fixed`** (Höhe = `--app-h` aus `visualViewport`, damit die Tastatur nichts
    verdeckt) und bildet damit einen eigenen Stapelkontext: was über der Schublade (z-index 1600) liegen
    oder sie abdunkeln soll, muss **in `#app`** hängen (der Schubladen-Hintergrund `#nav-back` hängt
    deshalb in `#app`, nicht in `<body>`). Popups, Dialoge und der Rechner hängen in `<body>` und liegen
    damit über allem.
44. **Chrome „rückt“ Finger-Ziele:** bei Berührung meldet `pointerdown` oft den bearbeitbaren Text neben
    einem schmalen Anfasser (12-px-Leiste). `Canvas.onDown` nimmt bei Fingern deshalb
    `document.elementFromPoint` und bevorzugt Anfasser (`.box-bar`, `.pkg-head`, `.box-rs`, `.sock`,
    `.link-handle`, `.fimg-rs`).
45. **Auf dem Handy ändert sich die Fensterhöhe ständig** (Adressleiste, Tastatur): Popups schliessen nur
    bei geänderter **Breite**; `Layout` erkennt die Tastatur nur, wenn ein Eingabefeld aktiv ist, und
    behält dann die Anordnung (sonst würde beim Tippen das Menüband einklappen).
46. **Zwischen Fingergesten unterscheiden:** Wischen in der Schublade braucht `touch-action: pan-y` auf
    der Spalte **und** der scrollenden Liste (sonst bricht der Browser die Zeigerereignisse ab);
    die Seite selbst hat `touch-action: none`, der Rest `manipulation` (kein Doppeltipp-Zoom, aber
    Doppelklick-Ereignisse). Langes Drücken: beim Loslassen den folgenden Klick schlucken.
47. **Hintergrund = eigene Ebene:** Felder mit `bg` hängen in `#layer-bg` (z-index 0, vor `#layer-pkgs`),
    `Canvas.render` hängt das Element bei Bedarf um; die Text-Ereignisse (input, focusin/out, keydown …)
    hängen deshalb an **beiden** Ebenen. `z` zählt jeweils innerhalb der Ebene (`setBackground` zählt neu:
    die geänderten Objekte nach unten). Nicht ausgewählt hat ein Hintergrund-Feld `pointer-events: none`
    auf allen Kindern → das Ziel ist immer das `.box`-Element selbst (kein Textcursor, kein Bild-Anfasser);
    `Canvas.onDown` behandelt es dann wie die freie Fläche (`bgDown`, `drag.bgPick`), `onUp` wählt es bei
    einem Klick aus. `Draw.hitAt(w, unter, ohneMarker, mitHintergrund)` trifft Hintergrund-Zeichnungen nur
    mit dem 4. Argument oder wenn sie ausgewählt sind; `Draw.hitBg(w)` für den Klick auf die Fläche.
48. **Datei-Anhänge & Aufklappen (`filepages.js`):** Der 📎-Anhang ist ein `.kt-file`-Chip
    (`contenteditable=false`) im Text; das Rechtsklick-Ziel wird in `onDown` (rdown) und
    `fireLongPress` als `d.fileSrc`/`d.fileName` mitgegeben, `Canvas.contextMenu` zeigt dann das
    Anhang-Menü. `startLongPress` lässt `.kt-file/.kt-video/.kt-math` auch **im Bearbeiten-Modus**
    ein Menü öffnen. PDF.js wird mit `Draw.loadScript` (klassisches UMD, setzt `window.pdfjsLib`)
    nachgeladen, Worker-URL gesetzt. Aufgeklappte Seiten sind **normale Bild-Felder** (ein Bild,
    leeres `html` → `isPictureBox`), untereinander unter dem Anhang; deshalb Export/Re-Import mit
    OneNote wie bei jedem Bild. Office-Dateien werden mit dem eingebauten `unzip`/`inflateRaw`
    (`DecompressionStream('deflate-raw')`) gelesen – nur `*/media/*`-Bilder, keine echte Seitenansicht.
49. **OneNote-Bilder: nie „die“ Bildquelle annehmen.** Ein ImageNode kann mehrere Datei-Objekte tragen
    (0x200034C8 und 0x20001C3F). Früher las der Leser nur 0x20001C3F – bei Ausdrucken das XPS →
    `application/octet-stream` → alle Seitenbilder fehlten (genau der gemeldete Fehler). Immer nach
    **Magic Bytes** entscheiden (`sniff`), nicht nach Endung oder JCID. `fileBytes()` gibt jetzt auch die
    `guid` zurück, `fileDataBytes(guid)` liest einen Eintrag direkt (für die Sammelseite). Test:
    `node tests/onenote/printout-test.js` baut eine Ausdruck-Datei wie OneNote (mit dem eigenen Schreiber
    + nachträglich eingesetztem 0x200034C8) und prüft den Akzeptanztest „Wohnen“; gegen den alten Leser
    schlägt er fehl (alle 13 Seitenbilder als XPS).
50. **Schrift-Kontrast nur in der Anzeige (`contrast.js`):** Die Korrektur steht als CSS-Variable
    `--kt-ink` im `style`-Attribut des Elements (`.box-text [style*="--kt-ink"] { color: var(--kt-ink)
    !important }`) und wird von `boxHtml()` über `Contrast.strip()` beim Speichern entfernt – im
    gespeicherten HTML darf **nie** `--kt-ink` stehen. Die automatische Feldschrift ist `--auto-ink` am
    `.box` (`.box-text { color: var(--auto-ink, var(--ink)) }`), ebenfalls nicht im HTML. `Canvas.applyInk`
    rechnet nur neu, wenn sich Design/Hintergrund/Feldfarbe oder `b.html` ändern (`e._inkKey`,
    `e._inkHtml`); nach `execCommand` (`syncEditing`), `bulkEdit` und Tippen (`onInput`) wird neu geprüft,
    nach Seitenfarbe/Design über `applyView` → `refreshInk`. Wer Farben aus dem DOM liest, muss die
    **gespeicherte** Farbe nehmen: Format übertragen nutzt `Contrast.declared(el)` (nicht
    `getComputedStyle().color`), der OneNote-Export läuft mit `Contrast.raw = true` (keine `--kt-ink`), und
    `sheetItem` gibt Zellen mit Füllfarbe ohne feste Schrift **keine** Farbe mit (automatisch).
    `Sheet.cellStyle(f, hd, band, orig)`: `orig` = gespeicherte Farben (Kopieren nach Word/Excel).
52. **Transaktions-Log ([MS-ONESTORE] 2.3.3):** Ein `TransactionLogFragment` = Einträge (je 8 Byte:
    `srcID`, `TransactionEntrySwitch`) und **direkt danach** `nextFragment` (12 Byte); der Rest des
    Fragments ist Füllung (OneNote: 1024-Byte-Fragmente, (1024 − 12) / 8 = 126,5 → 126 Einträge + 4 Byte).
    Also `nextFragment` bei `stp + n·8` lesen, **nicht** bei `cb − 12`. Ein Eintrag gibt die **Gesamtzahl**
    der Knoten einer Liste nach der Transaktion an (`srcID` 1 = Ende der Transaktion); gezählt wird bis
    `cTransactionsInLog`. Bricht die Kette vorher ab, werden die Listen ohne Begrenzung gelesen (Warnung),
    statt auf einem alten Stand stehen zu bleiben. Kleine Dateien (ein Fragment) waren nie betroffen – darum
    fiel der Fehler erst bei oft gespeicherten Abschnitten auf. Test: `tests/onenote/txlog-test.js`.
51. **Fehlende OneNote-Daten nie still verwerfen:** `fileBytes()` gibt bei fehlenden Daten ein Objekt mit
    `missing` zurück (nicht `null`) – Aufrufer prüfen `b.data`, nicht die Wahrheit von `b`. Der Grund muss bis
    in den Platzhalter (`data-why`) und den Bericht durchgereicht werden, sonst ist ein Fehlerbild beim User
    (Screenshot) nicht zu deuten. Ordner aus `dataTransfer.items` müssen **vor dem ersten `await`** mit
    `webkitGetAsEntry()` geholt werden (danach ist die Liste leer); gelesen wird nur, was `OneImport.wanted()`
    braucht (.one/.onetoc2/.onepkg/.onebin/…_onefiles/KT-JSON).
53. **Grosse Dateien (1.18): nichts „mal schnell“ ganz lesen.** Kein `file.arrayBuffer()`/`text()` auf
    Archiven, Paketen oder Sicherungen, kein `JSON.parse` einer ganzen Sicherung, kein `JSON.stringify` eines
    ganzen Exports, keine `Uint8Array`-Verkettung (`concat`) für Ergebnisse – stattdessen faule Einträge
    (`read()`/`blob()`), `Blob.slice`, Generatoren und `new Blob(parts)`. Ein einzelner `.one`-Abschnitt wird
    weiter als Ganzes gelesen (das Format braucht wahlfreien Zugriff), seine Seiten aber einzeln zerlegt und
    danach mit `store.release()` freigegeben. Beim Export **Live-Bilder vor `cloneNode` ohne `src`** klonen
    (sonst lädt der Klon jede Data-URL erneut → Renderer-Speicher verdoppelt) und Bilder über Platzhalter
    `data-kt-emb` erst im fertigen `outerHTML` einsetzen. Nach jedem Speichern eines Bildes **keine**
    Objekt-URL anlegen; `URL.revokeObjectURL` über `trimURLs`. Tests: `tests/onenote/stream-test.js`,
    `tests/backup/json-stream-test.js` (braucht einen `document`-Stub, weil util.js im Browser läuft).
54. **node-unrar-js (RAR, 1.19):** Die Generatoren `getFileList().fileHeaders` und `extract().files` **immer bis
    zum Ende** durchlaufen (kein `break`/`return` in der Schleife) – nur dann ruft node-unrar-js `closeArc()` und
    gibt das C++-`RarArchive` samt Unpack-Fenster frei (steht so im README). Sonst: WASM-Speicher wächst je Datei um
    das Wörterbuch (meist 32 MB, bis 2 GB), und `ExtractorData.open()` gibt beim nächsten Öffnen denselben
    Dateizeiger **ohne Zurücksetzen** zurück → „File read error“/„File is not RAR archive“. `ExtractorData` hält
    **jede** entpackte Datei in `dataFiles` fest (Schlüssel `*Extracted*/<Name>`) – nach dem Abholen löschen.
    Das Modul ist ein **Singleton** (`unrar.extractor` = zuletzt erzeugter Extractor): mehrere Archive im
    Hauptfenster nie verschränkt entpacken (`OneImport._rarLock`), vor jedem Durchgang `ex.unrar.extractor = ex`.
    Eigener Extractor: `open/create/read/write/tell/seek/closeFile` wie `ExtractorFile` (POSIX: `read` gibt
    Teil-Längen, 0 am Ende; `seek` mit 'SET'/'CUR'/'END'), `this.unrar` = das Emscripten-Modul (`HEAPU8` bei
    jedem Zugriff neu holen – es wächst). Datei-Lesefehler nicht als Ausnahme durch das WASM werfen, sondern -1
    zurückgeben (`ioError` merken). `rarWorkerMain` wird mit `toString()` in den Worker gegeben → darf **nichts**
    von aussen benutzen (Test prüft das). Fehlercodes (`e.reason`) → deutscher Text in `rarFileError`/`rarError`.
55. **Speicher mit vielen Seiten (1.20):** Was **pro Seite** dauerhaft im Speicher liegt, vervielfacht sich mit der
    Zahl der Seiten (Freihand-Seiten aus OneNote: bis ~1 MB JSON je Seite). `JSON.stringify` liefert in V8 oft
    **zweibytige** Strings (2 Byte je Zeichen, auch bei reinem Latin-1) – darum Verlaufs-Schnappschüsse über
    `oneByte()` (Zeichen > U+00FF als `\uXXXX`, dann UTF-8-Umweg TextEncoder/TextDecoder → echter Ein-Byte-String).
    Nie `getAll()` über Seiten/Papierkorb/Versionen für Nebenaufgaben (Aufräumen, Listen) – Cursor (`each`).
    Beim Aufräumen die Namen aus dem **Speicher** nehmen (`refsInMemory`: Seiten + Undo/Redo), nicht aus der DB –
    sonst fehlen ungespeicherte Änderungen bzw. was Strg+Z noch braucht; `grace` schützt gerade eingefügte Bilder,
    während eines Imports (`OneImport.busy`) läuft kein Aufräumen. Das Import-Journal steht im localStorage
    (synchron, übersteht den Absturz), nicht in IndexedDB; „abgestürzt“ erst ohne Lebenszeichen seit 30 s (ein
    zweiter Tab könnte gerade importieren). Ein Import legt nur **neue** Gruppen an – darum genügt zum Zurücknehmen
    die Liste der Gruppen-IDs von vorher. Playwright: `evaluate("x = function…")` ruft die Funktion auf – Zuweisungen
    in `(() => { … })()` packen.
56. **Geschriebene OneNote-Dateien nie nur mit dem eigenen Leser prüfen (1.21).** Der Leser ist absichtlich
    tolerant (echte Dateien sind oft unsauber) – darum fielen fehlendes Reserved-Bit, falsche CRCs und fehlende
    Pflichtknoten bis 1.20 nicht auf, OneNote lehnte aber jeden Abschnitt ab. `tests/onenote/onecheck.js` prüft
    **streng**: Kopf, Transaktions-Log (Prüfsumme je Dateityp), Listen/Fragmente/Fussmarken, Knotenköpfe,
    Revisionsaufbau (erlaubte Knoten, 0x084 nach jeder Gruppe samt Prüfsumme, GUID-Tabelle, Deklarationen,
    Wurzeln, Verweise, FileDataStore) und für .one die **Inhaltsregeln aus [MS-ONE] 2.1/2.2** (MUST → Fehler,
    SHOULD → Hinweis): Wurzeln je Objektraum, Seitenreihe, Titel, Gliederungen, Tabellen, Bilder, Anhänge,
    Formate, Versionsverlauf. Gegenprobe: echte OneNote-Dateien ergeben **keine Fehler** (Ausnahmen, die OneNote
    selbst nicht einhält, sind Hinweise: `NotebookColor`, `LanguageID` bei Anhängen, zweite Bildablage 0x8003A).
    Neue Teile des Schreibers immer zuerst gegen echte OneNote-Dateien vergleichen (Eigenschaften, Reihenfolge,
    Kontexte) und mit `onecheck` prüfen. Die Spezifikation ist auf learn.microsoft.com (MS-ONESTORE, MS-ONE).
    Auch die **Bytes** vergleichen (`raw.js`-Art: Deklaration + Daten je JCID): so fiel 1.22 das fehlende
    `ExtendedStreamsPresent` auf, das weder der eigene Leser noch die Inhaltsregeln bemerkten.
59. **Verkleinern beim Bauen (1.23):** `build_web.py` zerlegt JavaScript selbst (`_js_tokens`: Zeichenketten,
    Vorlagen mit `${…}`, reguläre Ausdrücke, Kommentare) und gibt die Elemente ohne Kommentare/Einrückung wieder aus;
    ein Leerzeichen bleibt nur zwischen Wörtern/Zahlen, nach einem regulären Ausdruck vor einem Wort (Flags!), vor
    `.` nach einer Zahl und bei Paaren wie `+ +`, `- -`, `/ /`. **Zeilenumbrüche bleiben** (automatische Semikolons);
    ein mehrzeiliger Block-Kommentar wird zum Zeilenumbruch. Ein `/` ist ein regulärer Ausdruck am Anfang, nach
    einem Satzzeichen ausser `)` `]` `}` und nach Schlüsselwörtern wie `return`/`typeof`/`case` – Code wie
    `if (x) /re/.test(s)` oder `}` + regulärer Ausdruck am Zeilenanfang vermeiden (Klammern setzen). CSS: Kommentare,
    Einrückung, Leerraum um `{ } ; , >` und nach `eigenschaft:` – Zeichenketten bleiben unverändert (eigene
    CSS-Variablen geben ihren Text roh weiter, darum auch dort kein Leerzeichen verändern). HTML: nur Einrückung.
    **Nach jeder Änderung am Verkleinerer** `node tests/build/kompakt-test.js` (Syntaxbaum je Datei gleich) und im
    Browser die CSS-Regeln vergleichen (`cssRules[i].cssText` original vs. verkleinert, 1208 Regeln gleich).
    Aufräumen ohne Risiko: unbenutzte Variablen mit `tsc --allowJs --checkJs --noUnusedLocals` finden (nur TS6133
    beachten), `void x;` war ein Zeichen für Überbleibsel; Methoden nur entfernen, wenn sie nirgends als `.name`,
    Text (`this['build_' + k]`, Befehlsnamen) oder in Tests vorkommen.
57. **„Leer“ heisst ohne sichtbaren Inhalt, nicht ohne Text (1.22).** `isEmptyHtml` zählt Bilder (`<img>`),
    SVG, Video, Anhänge (`kt-file`), Formeln (`kt-math`), Platzhalter und alles mit `data-kt-…` als Inhalt.
    Vorher fielen Textfelder mit nur einem eingebetteten Bild beim Speichern (`cleanPage`) und Laden weg – im
    Speicher waren sie noch da, darum fiel es erst nach dem Neuladen auf. Neue Inhaltsarten dort eintragen.
58. **Drucken langer Seiten (1.22):** Chrome fragmentiert absolut positionierte Inhalte beim Drucken selbst –
    Bilder und Textzeilen über einem Blattrand rutschen aufs nächste Blatt, ein grosses SVG nicht. Auch
    `overflow:hidden` hilft nicht (Chrome teilt es trotzdem); erst `contain:strict` mit fester Grösse macht ein
    Blatt unteilbar. Gedruckt wird darum Blatt für Blatt als eigener Ausschnitt. Prüfen: Druck-HTML abfangen
    (`Export.printHtml` ersetzen), in Chromium `page.pdf()`, mit `pdftoppm` rastern, mit dem Canvas vergleichen.
60. **Ein Dateiformat, zwei Schreiber (1.24):** Browser (`KtFile.write`) und Programm (`writeBackupZip`) erzeugen
    dieselbe KnowledgeTree-Datei. Wer am Format etwas ändert, ändert **beide** und `KtFile.readZip` und prüft mit
    `node tests/backup/ktfile-test.js` und einer Rundreise Browser ↔ Programm (Seiten-Kennung vergleichen). Namen
    nach `store.go`-Regeln; Leser verlassen sich nicht darauf (Struktur kommt aus `_gruppe.json`/Ordnern).
61. **Grosse Speicherungen in Teilen (1.24):** `reconcile` erwartet immer den ganzen Baum. Teile tragen darum den
    ganzen Baum, aber nur einen Teil der Seiten, und `"teil": true` – sonst würde der Server für noch nicht
    geschickte Seiten leere Platzhalter anlegen bzw. (ohne „teil“) aufräumen. Erst der letzte Teil räumt auf.
62. **„Nur bei Änderungen“ braucht stabile Dateizeiten (1.24):** nach dem Einlesen ist `metaWritten` leer; ohne
    Vergleich mit der Datei schrieb der erste Abgleich jede `_gruppe.json` neu → neue Zeiten → jedes Backup sah
    eine Änderung. Gleiches gilt für Seiten (`sameFile`).
63. **Reguläre Ausdrücke über hunderte MB sind langsam (Go):** `[0-9a-f]{40}\.[a-z0-9]{1,8}` über 190 MB Seiten
    brauchte 7,6 s (Programmstart 9 s); `assetNames` sucht von jedem Punkt aus rückwärts 40 Hex-Zeichen (0,2 s,
    gleiche Treffer, `go test`). Deflate-Stufe 6 von Go ist bei Freihand-JSON ~5× langsamer als Stufe 4 bei nur
    ~8 % kleineren Dateien – Backups nutzen Stufe 4. Im Browser ist `CompressionStream` (zlib) schnell genug.
64. **Sicherungsordner im Browser:** `showDirectoryPicker` gibt einen Handle, der in IndexedDB gespeichert werden
    kann; die Schreib-Erlaubnis muss in einer neuen Sitzung aber oft erst wieder erteilt werden
    (`requestPermission` nur nach einem Klick) – darum still sichern nur mit `queryPermission === 'granted'`, sonst
    die Erinnerung mit „Jetzt sichern“. Testen lässt sich das mit einem OPFS-Ordner
    (`navigator.storage.getDirectory()`), der dieselbe Schnittstelle hat.
65. **Testfallen 1.24:** der Linux-Testserver mit `--browser` beendet sich 3 Minuten nach dem letzten Lebenszeichen
    (vor jedem Test neu starten); `pkill -f …` mit einem Muster, das im eigenen Befehl steht, beendet die eigene
    Shell (in einem eigenen Aufruf stoppen); riesige Ergebnisse aus `page.evaluate` (200 MB JSON) bringen den
    Playwright-Treiber zum Absturz – im Browser eine Prüfsumme bilden und nur die vergleichen.

66. **Ein `<!--` im eingebetteten Code ist gefährlich (1.25):** steht in einem `<script>` ein `<!--` und danach
    `<script`, gerät der HTML-Leser in den „doppelt maskierten“ Zustand und das nächste `</script>` beendet das
    Skript nicht mehr – der Rest der Seite wird zu Code. `build_web.py` bricht darum ab, wenn Code `<!--` enthält
    (Marke im Code als `'<!-' + '-kt-datei-->'`), schreibt das Gerüst-JSON ohne `<` (`\u003c`) und hängt es vor
    das **letzte** `</body>` (Export-Vorlagen im Code enthalten weitere `</body>`).
67. **Interaktive Datei nie mit IndexedDB:** alle `file://`-Seiten teilen in Chrome einen Ursprung – eine
    geöffnete Datei würde sonst die Notizen eines von der Festplatte geöffneten index.html überschreiben. Darum
    `ktFileBackend` ganz im Speicher, eigener Schlüssel fürs Import-Journal, „nicht gespeichert“ erst nach dem Start
    (`App.booted`; beim Start ergänzte Schnellnotizen zählen nicht).
68. **Leere Bilder (1.25):** ein 0-Byte-Bild im Speicher (z.B. aus einem alten, fehlerhaften Import) landete im
    Backup, und der Server antwortete beim Laden „kein Bild“ – das brach das ganze Laden ab. Jetzt: nie leere
    Einträge schreiben (Browser und Go), beim Laden jedes Bild einzeln versuchen und Fehler nur zählen.
69. **Geteilte Bilder im Backup:** dieselben Bilder stecken oft in mehreren Abschnitten (kopierte Seiten,
    „Nicht zugeordnete Inhalte“ aus OneNote). Je Abschnitt eine vollständige Datei hätte das Backup um 50 %
    vergrössert – darum liegen solche Bilder einmal in `_Bilder/` oben im Backup-Ordner (Programm und Browser
    gleich); eine einzeln importierte Abschnitt-Datei nimmt fehlende geteilte Bilder aus dem vorhandenen Speicher.
70. **Abhängigkeiten werden beim Rechnen gelernt (1.26, `XL.Book`):** `val()` legt die Formelzelle auf einen Stapel,
    jeder gelesene Bereich (`track`, auch ganze Spalten mit Infinity) wird ihr zugeordnet. `changed()` geht davon
    aus rückwärts (`rdep`) – nur gerechnete Formeln hängen an etwas; nie gerechnete werden beim Anzeigen frisch
    gerechnet. Ein Bezug, der ins Leere zeigt (#BEZUG!), trägt keine Abhängigkeit ein: darum lösen neue/gelöschte
    Tabellen und neue Titel ein `reset` aus (Fingerabdruck in `Sheet.rescan`). `Hist.commit` ruft `Sheet.touch()`
    (Seite gelöscht/verschoben → beim nächsten Rechnen neu einlesen, offene Seite neu zeichnen, wenn nötig).
71. **Tabellen-IDs in der Mappe sind „Seite/Feld“:** Feld-IDs wiederholen sich in importierten Seiten. Alles, was
    eine Tabelle der offenen Seite sucht, geht über `Sheet.sh(id)`/`Sheet.sid(id)` – nie `book.byId.get(b.id)`.
72. **Seitentitel umbenennen = tippen:** der Titel ändert sich bei jedem Tastendruck (und wird zwischendurch
    gespeichert). Die Bezüge passt erst das Verlassen des Titelfelds an: dafür wird der alte Titel beim Fokus gemerkt,
    kurz zurückgesetzt (`keepRefs` löst mit dem alten Verzeichnis auf) und dann wieder gesetzt.
73. **Base-122 im HTML:** verboten sind `\0 \n \r " & \` (Original) **und `<`** (sonst könnte `</script` im Block
    stehen). Die Zwei-Byte-Zeichen liegen in U+0080…U+07FF (immer gültiges UTF-8, nie „zu lang“ kodiert). Der Block
    wird im HTML nie verändert (Skript-Rohtext, kein Entity-Dekodieren); gelesen wird aus der Datei als Bytes, aus
    der geöffneten Seite als Text (`b122Decode` kann beides).
74. **Freihand-Pfade relativ schreiben ohne Drift:** alle Punkte werden zuerst auf Zehntel gerundet, die relativen
    Schritte sind Differenzen der gerundeten Werte (ganze Zehntel) – so entsteht genau dieselbe Form wie mit den
    absoluten Pfaden bis 1.25 (`tests/draw/pfad-test.js` vergleicht mit `pfad-alt.js`).
75. **Drucken braucht feste Blatthöhen:** jedes `.pr-sheet` ist genau so hoch wie der bedruckbare Bereich (minus
    6 px Luft), sonst verteilt der Browser ein Blatt auf zwei. Die Vorschau zeigt dieselben Blätter mit Rand
    (`body.pr-preview`, `zoom`), aber ohne Zerschneiden (ganze Seite je Blatt verschoben) – so bleibt sie schnell.

76. **Doppelklick auf Lineal-Griffe kommt nicht an:** beim Drücken nimmt `Draw` die Zeiger-Erfassung (`Canvas.capture`),
    danach geht `dblclick` an die Fläche. Darum zählt `Draw.onDown` zwei schnelle Drücke auf `.kt-size` selbst.
77. **Zentimeter wie gedruckt** hängen vom Seiteninhalt ab: `Draw.cmPx` wird nur beim Einblenden, beim Seitenwechsel
    und bei geänderten Druck-Vorgaben neu bestimmt (Schlüssel Seite + Vorgaben) – sonst würde das Lineal beim
    Zeichnen über den Blattrand plötzlich die Grösse ändern.
78. **„Auflösen nach“-Knöpfe beim Drücken auswerten:** ein Klick nach dem Tippen im Textfeld löst erst `change`
    aus, das die Ergebnis-Anzeige neu baut – der Knopf unter der Maus wäre dann ein anderer und der Klick käme nie
    an. Darum `pointerdown` mit `preventDefault`.

79. **Keine globalen Hilfsnamen in neuen Skripten:** alle Dateien teilen sich einen Namensraum – eine zweite
    `function shade` in chem-models.js hätte die gleichnamige in ui.js überschrieben. Darum `cmShade`, `cmMix`, `cmF2`.
80. **Darstellungen ohne Bearbeiten:** in Bohr/Orbitale/3D liegen die Atome an anderen Stellen als im Modell –
    `Chem.renderOverlay`, Hover und Tasten sind dort abgeschaltet (`Chem.editable()`), sonst lägen Markierungen
    und Klicks daneben.
81. **3D-Ebene für aromatische Ringe:** eine Zufallsauslenkung in z bei sp²-Atomen liess Benzol leicht gewellt;
    darum nur sp³-Atome auslenken und bei der Ebenen-Korrektur auch die drei Nachbarn ein Stück mitnehmen.

82. **Hintergrund bei sehr kleinem Zoom:** Punkte/Raster/Linien sind ein CSS-Hintergrund mit Kachelgrösse
    Abstand × Zoom – bei 1 % wären das 0,2 px grosse Kacheln (Millionen je Bild, grauer Brei, langsam). Darum wird die
    Kachel so lange vervierfacht, bis sie mindestens 8 px gross ist (nur jede 4., 16. … Linie).
83. **Zoom in der Webseite mit CSS `zoom` auf `.kt-sheet`** (nicht `transform`): so wachsen die Bildlaufleisten mit,
    Titel und Navigation bleiben gleich gross; Strg+Mausrad wird abgefangen (`passive: false`), damit nicht der
    Browser die ganze Seite zoomt; die Stelle unter dem Mauszeiger bleibt stehen (Bildlauf × Faktor). Beim Drucken
    gilt `zoom: 1 !important`, die Leiste ist ausgeblendet.
84. **Freihand nur im Sichtbereich ins DOM (1.30, `Draw.render`, `CULL_MIN` = 300):** Chrome rechnet bei jeder
    Änderung der Zeichen-Ebene alle gemalten Striche gegeneinander durch („Layerize“, quadratisch): 2700 Striche
    ≈ 200 ms je Bild – beim Start, beim Zeichnen, beim Auswählen. Jetzt liegen auf grossen Seiten nur die Striche im
    Bild plus ein Bildschirm ringsum im DOM; `Draw.onView` lädt nach, bevor der Rand sichtbar wird, und verkleinert
    nach starkem Hineinzoomen. Ausgewählte bleiben immer drin; Export/Druck rufen `Draw.render(true)` (alles). Rahmen
    je Zeichnung zwischengespeichert (`DG.bbox`, Schlüssel `Draw.sig`). **Nicht** mit `will-change: transform` lösen:
    das gibt der Ebene einen unendlichen Zeichenbereich – dann ist es überall langsam (gemessen).
85. **Verlaufs-Schnappschüsse im Leerlauf (1.30, `Hist.idleSnaps`):** beim Start nicht mehr alle Seiten auf einmal
    (eine halbe Sekunde Stillstand), sondern höchstens 12 ms je Leerlauf; grosse Seiten in Stücken (`snapSteps`, je
    150 Striche, Ergebnis Zeichen für Zeichen gleich `snapPage`). Vor der ersten Eingabe (Fang-Phase am window:
    pointerdown/keydown/drop/paste/cut/beforeinput) wird der Rest sofort gemacht – noch bevor ein Handler ändert.
    `touchPage` verwirft einen halben Schnappschuss dieser Seite. `commit` ersetzt nur noch `"modified":…` im Text
    statt die Seite zweimal zu schreiben (in Texten stehen Anführungszeichen als `\"`, also kommt es nur einmal vor).
86. **Sicherung als Strom lesen (1.30, `readJsonStream`):** die Suche springt mit regulären Ausdrücken von einem
    Strukturzeichen zum nächsten (innen ohne Kommas) statt Zeichen für Zeichen – Seiten sind vor allem Zahlenlisten
    der Freihand. 81 MB: 14 s → 2 s im Browser, Ergebnis gleich `JSON.parse` (geprüft an der echten Sicherung).
87. **Datumsformate einmal anlegen (1.30, `DF` in util.js):** `toLocaleDateString` mit Optionen baut jedes Mal einen
    neuen `Intl.DateTimeFormat` – bei Seitenlisten mit hunderten Einträgen spürbar. Ausgabe unverändert.
88. **Webseite auf dem Handy (1.30):** `EXPORT_CSS` setzt `html, body { height: auto !important; overflow: visible
    !important }` – die Handy-Regeln (Schublade, Kopfzeile, `.kt-main` scrollt) brauchen darum selbst `!important`.
    Der Zoom misst am Element, das wirklich scrollt (`.kt-main` oder das Dokument); auf schmalen Bildschirmen passt
    er breite Seiten beim Öffnen und beim Seitenwechsel an die Breite an (`ktFit`).
89. **Laden in Stufen – Sicherheit (1.31):** solange Seiten fehlen, darf nichts sie als „gelöscht“ ansehen.
    `Tree.norm` prüft `Store.has(id)` (geladen oder unterwegs), nicht `Store.pages[id]`. Das Programm benennt Dateien
    nach `titles` aus `/api/sync` – für fehlende Seiten kommen die Titel aus dem Laden (`Lazy.titles`), sonst würden
    Dateien umbenannt. Aufräumen der Bilder (`cleanupStorage`) wartet auf alles (sonst fehlten die Bilder der noch
    nicht geladenen Seiten in der Liste). `Lazy.accept` überschreibt nie eine schon vorhandene Seite (neu angelegt,
    zurückgeholt) und übernimmt keine, die inzwischen aus dem Baum gelöscht wurde.
90. **Rückgängig erst, wenn alles da ist:** ein gespeicherter Verlaufsschritt kann Seiten betreffen, die noch laden
    (z.B. ein Import) – `Hist.undoStep/redoStep/undoTo` warten (`Store.gate`). Nachgeladene Seiten bekommen ihren
    Schnappschuss im Leerlauf (`Hist.addPages`).
91. **Ebenen und Tabellen nach dem Laden:** `Tree.normLevels` nur für Abschnitte ohne fehlende Seiten, die übrigen in
    `App.allArrived`; dort auch `Sheet.touch()` (Bezüge auf Tabellen anderer Seiten) und ein Speichern, falls beim
    Laden eine kaputte/fehlende Seite aus dem Baum fiel. Erster Start/Umzug (`firstRun`/`migrated`) speichert erst,
    wenn alles geladen ist.
92. **Schlüssel lesen ist nicht billig (1.32):** `getAllKeys()` auf `saves_seiten` kostet bei 2500 grossen Seiten ~45 ms
    (IndexedDB läuft dabei über die Einträge). In Stufen kommen die Kennungen darum aus dem Baum plus den
    Kopfangaben; eine Seite im Baum ohne Daten fällt beim Nachladen heraus (wie früher bei `Tree.norm`).
93. **Programm: Kopf statt ganze Seite (1.32, `readPageHead`):** `json.Unmarshal` jeder Seite in eine Map war der
    grösste Teil der Startzeit des Programms. Jetzt liest ein `json.Decoder` nur die obersten Schlüssel, bis id,
    title, level, created, modified da sind (stehen vorne), und überspringt anderes. Kaputte Dateien fallen erst beim
    Ausliefern auf (`json.Valid` in `/api/seiten`) – dann fehlt die Seite wie früher. Fehlt id/Titel oder ist die id
    doppelt, gilt der alte, vollständige Weg (mit Reparatur der Datei).
94. **Stückgrösse beim Nachladen nach der eigenen Arbeit messen,** nicht nach der Wartezeit auf Platte/Server –
    sonst schrumpft sie bei langsamer Platte auf 1 Seite je Stück und das Laden dauert ein Vielfaches.
95. **Harte Verknüpfungen statt Kopien (1.33):** gleiche Bildnamen sind gleiche Inhalte (Prüfsumme), Bilder werden nie
    verändert – darum darf dasselbe Bild in mehreren `_Bilder`-Ordnern als harte Verknüpfung liegen (Platz einmal).
    Kopiert man einen Ordner im Explorer, entstehen echte Dateien. Geht `os.Link` nicht (anderes Laufwerk, FAT), wird
    über eine `.tmp`-Datei kopiert. Die Saves-Grösse blieb bei der Umstellung gleich (67 MB).
96. **Erst eintragen, dann verschieben (`placeAsset`):** während ein Bild aus dem Eingang in den Abschnitt wandert, kann
    das Fenster es gerade anzeigen. Der Index bekommt den neuen Ort vor dem Umbenennen – vorher findet `findAsset` es im
    Eingang, danach im Abschnitt (Umbenennen ist ein Schritt).
97. **Backups seit 1.33 ohne gemeinsames `_Bilder`:** jede Abschnitt-Datei enthält alle ihre Bilder (wie der Saves-
    Ordner), dafür grösser (AM Mathe: 70 statt 48 MB). Backups von 1.25–1.32 mit `_Bilder` oben bleiben lesbar.
    Gemerkt beim Testen: speichert der erste Start/Umzug erst nach `Store.whenComplete()`, galt eine geöffnete
    interaktive Datei sofort als geändert (`Backend.dirty`) – jetzt sofort, wenn schon alles geladen ist.

98. **Knöpfe auf der Seitenfläche brauchen eigene Zeiger-Ereignisse:** der Vollbild-Hinweis `#fs-exit` liegt im
    `#viewport`; dessen pointerdown (Textfeld anlegen, Verschieben, Zeigerfang) schluckte den Klick – bis 1.33
    beendete Anklicken das Vollbild nicht. Jetzt stoppt der Knopf pointerdown/mousedown/touchstart/dblclick selbst.
99. **Nur eine Zeichenfläche (1.35):** Canvas, Draw, Sheet hängen an festen IDs (`#viewport`, `#world` …) und an
    `$()`-Aufrufen überall. Die Vorschauen der anderen Bereiche sind darum **Kopien im Shadow-Root** (gleiche IDs
    stören dort nicht, `document.querySelector` findet sie nicht). Die App-Styles kommen als ein gemeinsames
    `CSSStyleSheet` hinein; `body`, `html`, `:root` werden dabei zu `.pv-root`, das Klassen und `data-theme` von
    `<body>` spiegelt (MutationObserver). Nie Kopien mit diesen IDs ins normale DOM hängen.
100. **Vorschau einer anderen Seite = kurzer Tausch:** `Panes.swapShot` lädt die Seite mit `Canvas.showPage` in die
    Zeichenfläche, kopiert und zeigt sofort wieder die eigene – alles synchron, also ohne Bild dazwischen. Nur in
    Ruhe (`Panes.quiet`: nichts in Bearbeitung/ausgewählt, kein Zeiger gedrückt, kein Export, keine Versionsansicht),
    je Durchgang eine Seite. `applyView` schreibt dabei kurz die fremde Ansicht unter die eigene Seite in
    `Store.ui.views` – darum wird sie danach zurückgeschrieben.
101. **Kopien nur mit dem Sichtbereich:** auf Seiten mit vielen Strichen (1.30) liegen nur die sichtbaren Zeichnungen
    (plus ein Bildschirm ringsum) im DOM. Die Kopie bekommt genau diese, aber vollständig (`Draw.render('view')`:
    Sichtbereich ohne das 1200er-Budget); verschiebt das Mausrad die Vorschau darüber hinaus, wird sie neu
    aufgenommen. Alle 2700 Striche einer OneNote-Seite zu kopieren kostete ~350 ms je Vorschau. Ebenso teuer war
    `trimURLs` bei jedem `showPage` (JSON der ganzen Seite für die Liste der Bilder) – die Liste entsteht seit 1.35
    erst, wenn wirklich aufgeräumt wird (Funktion statt Set). Mit drei grossen Seiten in drei Bereichen ist die
    längste Blockade nach dem Start ~90 ms (ohne Bereiche ~60 ms). Lesbare Schriftfarben (`Contrast`) stehen in der Kopie fest → nach
    Hell/Dunkel neu aufnehmen. Bilder ohne `src` (Webseite: Objekt-URL kommt später) lädt die Kopie selbst
    (`data-kt-img`/`data-kt-src`); `trimURLs` behält die Bilder der Vorschau-Seiten (`Panes.keepNames`), nach dem
    Export (gibt alle frei) werden die Vorschauen neu aufgenommen.
102. **Flex-Gewichte unter 1:** Teilungen geben ihren Kindern `flex: <Anteil> 1 0`. Ist nur noch ein Kind sichtbar
    (Handy) oder wird ein Bereich zur Wurzel („Nur diesen Bereich behalten“), nähme es mit Gewicht 0.5 nur die halbe
    Fläche – darum `#panes.one … { flex: 1 1 0 !important }` und die Wurzel ohne Gewicht.
103. **`page.evaluate` wartet auf zurückgegebene Promises:** `Ops.deletePages` wartet auf die Rückfrage – im Test mit
    `void …` aufrufen, sonst hängt er. Ebenso `Settings.show` (wartet auf OK).
104. **Umbenennen im Tab nutzt den versteckten Titel (1.36):** die Logik (Verlauf, Bezüge in Tabellen anderer Seiten
    beim Umbenennen) hängt an den Ereignissen von `#page-title`. `Panes.rename` schickt ihm `focus`, je Taste `input`
    und am Ende `blur` – eine zweite Kopie dieser Logik gibt es nicht. Solange umbenannt wird, baut `renderStrips`
    die Leiste dieses Bereichs nicht neu (sonst verlöre das Feld den Fokus).
105. **Doppelklick auf Tabs:** der erste Klick kann die Leiste neu bauen (anderer Tab) – der zweite trifft dann ein
    neues Element, und der Browser meldet keinen `dblclick`. Darum zählt `onClick` selbst (gleicher Tab innert
    450 ms) und `activate` baut die Leiste nicht neu, wenn sich nichts geändert hat.
106. **Eingeklappte Leiste ausfahren ohne Ruck:** ausgefahren liegt sie `position: absolute` über der Seite; an ihrer
    Stelle hält `.pane.peek::before` die 6 px des Strichs frei – sonst springt die Seite um diese Höhe.
107. **Erste Schritte nicht überschreiben, was der User geändert hat:** `openAll` ersetzt nur Seiten, deren
    `modified` noch beim `created` liegt; neue Seiten kommen vor die nächste vorhandene in `Guide.ORDER`. Die
    ersten sechs Seiten und die ersten sechs Felder der Willkommens-Seite bleiben in der alten Reihenfolge – ältere
    Abläufe/Tests verlassen sich darauf.
108. **Das Vollbild-Raster ist ein eigener Baum (1.37):** `Panes.S` liefert im Vollbild `Panes._fs` statt
    `Store.ui.panes` – alles (Darstellung, Vorschau, Aktivieren) läuft unverändert darüber, gespeichert wird es nie.
    Jede Kachel merkt sich `from {pane, i}`; `exitFs` schreibt ihre Seiten von hinten nach vorn in die echten Tabs
    zurück (sonst verschieben sich die Indizes) und rechnet den aktiven Tab nach. Vorhandene Vorschauen werden für die
    Kacheln kopiert (`cloneNode`), die übrigen in Ruhepausen aufgenommen.
109. **„Nur dieser Tab“ und Umschalten:** wird im einzelnen Vollbild oben ein anderer Tab gewählt, wird er der
    einzelne (`_fsSolo` folgt `activate`) – sonst zeigte die Kopfzeile ⤢ statt ⤡ und der Weg zurück bräuchte zwei
    Klicks.
110. **Rechtschreibung ohne Spans:** Markierungen im contenteditable-Text (Spans) landeten im gespeicherten HTML, in
    Kopien, Exporten und im Verlauf. Die Highlight API zeichnet nur Ranges; nach jeder Änderung an einem Feld
    (MutationObserver) werden dessen Ranges neu gebaut (alte zeigen auf entfernte Knoten). Wörter über Formatgrenzen
    hinweg (<b>Hau</b>s) funktionieren, weil der Text eines Felds samt Zuordnung zu den Textknoten gelesen wird.
111. **Wort an der Schreibmarke:** sonst wäre jedes halb getippte Wort rot. Es wird ausgelassen und nach
    `selectionchange` (Schreibmarke woanders) neu geprüft.
112. **Wörterbücher nicht mitliefern, aber nur einmal laden:** de_CH_frami ist mehrere MB gross und steht unter
    GPL/LGPL – darum kein Teil der Webseite/EXE. Einmal geladen bleiben sie (Browser: eigene IndexedDB; Programm:
    Cache/Woerterbuch). Quellen-Reihenfolge jsDelivr (GitHub-Spiegel) → raw.githubusercontent → npm; Dateien unter
    500 Bytes gelten als Fehlerseite. Der Leser liest grosse .dic in Häppchen (20 000 Zeilen, dann `setTimeout 0`).
113. **Deutsch: zusammengesetzte Wörter lieber annehmen:** die Hunspell-Regeln für Zusammensetzungen (COMPOUND…) sind
    in frami umfangreich; was der eigene Leser davon nicht abdeckt, fängt die Fugen-Regel auf. Folge: fehlende
    Fugen-s („Arbeitweg“) werden nicht angestrichen – bewusst, ein falsch angestrichenes richtiges Wort stört mehr.
114. **Rechenweg rechnet selbst, exakt:** eigener Rechenbaum, in dem der Bruchstrich (frac) vom Geteilt-Zeichen (div)
    getrennt bleibt und Dezimalzahlen als solche markiert sind – sonst wäre aus 3/4 : 1/2 kein „Kehrwert“-Schritt und
    aus 1.5 ein Bruch geworden. Brüche in Summen werden ungekürzt verglichen (2/4 statt 1/2), sonst dreht sich „auf den
    gemeinsamen Nenner bringen“ im Kreis. Gleichungen nutzen die Algebra von MathInk (`MathInk.sym`), angezeigt wird
    aber geordnet (a·x² + b·x + c) und ohne erneutes Vereinfachen, das anders sortieren würde.
115. **Erkennung mit Zusammenhang ändert nur bei ungültiger Rechnung:** eine gültige beste Lesart bleibt, auch wenn eine
    andere „schöner“ wäre; bewusst gesetzte Korrekturen (Etikett angeklickt) werden nie geändert.
116. **Harte Verknüpfungen nur für unveränderliche Dateien:** zwei Verknüpfungen SIND dieselbe Datei – wer eine an Ort
    und Stelle ändert, ändert alle. Darum nur Bilder/Anhänge (Inhalt = Name) und fertige Backup-Abschnitte; alles
    andere schreibt das Programm ohnehin über Zwischendatei + Umbenennen (trennt die Verknüpfung sauber). Datum und
    Rechte teilen sich Verknüpfungen auch (Chtimes im Papierkorb ändert das Datum der Saves-Verknüpfung – harmlos).
117. **Belegung nicht doppelt zählen:** `filepath.WalkDir` sieht jede Verknüpfung als eigene Datei. `diskSize` gruppiert
    nach Grösse und prüft `os.SameFile` (Windows: Datei-Index, Linux: Inode).
118. **Optimieren erst nach dem Schliessen des Servers:** sonst könnte eine Speicherung zwischen Vergleichen und Ersetzen
    kommen. Ein Neustart in dieser Zeit fände den alten Server nicht mehr und würde parallel einlesen – darum wartet er
    auf `optimiert.lauf`.
119. **Körperklasse ≠ Element-Klasse:** `fs-rb` war zuerst Klasse am Knopf UND am `<body>` – `.fs-rb { display: none }`
    blendete dann den ganzen body aus. Darum Knopf `#fs-rb`, Zustand `body.fs-ribbon`.
120. **Entf auf einem Bild in einem gesperrten Feld:** `removeImage` prüfte die Sperre nicht (nur der Menüeintrag war
    grau) – ein ausgewähltes Bild in einem gesperrten Feld liess sich mit Entf löschen. Seit 1.43 geprüft.
121. **Windows Defender meldet „Virus oder unerwünschte Software“ (1.43):** ein Fehlalarm der maschinellen Erkennung
    (…!ml) – 1.43 änderte nur JavaScript und die Versionsnummer. Unsignierte Go-Programme ohne Versionsangaben und mit
    entfernten Symbolen (`-s -w`) trifft das öfter. Seit 1.44: VERSIONINFO (Firma, Produkt, Beschreibung, Copyright)
    und ohne `-s -w`. Sicher verhindern liesse es sich nur mit einer Code-Signatur (Zertifikat) bzw. mit einer Meldung
    der Datei als Fehlalarm bei Microsoft (microsoft.com/wdsi/filesubmission).
122. **Entf und verankerte Felder:** `deleteSelection` löschte markierte Felder ohne Blick auf `bg` (bei Bildern ging
    es nur über `removeImage`, das die Sperre prüfte). Seit 1.45 bleiben Hintergrund-Felder und Pakete mit einem
    Hintergrund-Feld stehen; Zeichnungen: `removeSelected`, `nudge` und das Ziehen (`orig`) lassen `d.bg` aus.
123. **Zielsuche beim Ziehen nach Koordinaten:** `dragover` nur auf den Zeilen liess Lücken und Ränder „tot“; das
    Ziel kommt jetzt aus der nächsten Zeile zur Mausposition (`document`-weit) – und auf Touch gibt es HTML-Ziehen
    kaum, darum eigene Zeiger-Logik mit Halten (0,3 s), sonst würde jedes Wischen in der Liste etwas verschieben.
124. **`leaves()` und die Fenster:** fast alles (Vorschauen, aktiver Bereich, Tabs zählen, Sync) muss die Fenster
    kennen, Baum-Operationen (teilen, `parentOf`, `only`) nicht. Darum `leaves()` ohne Argument = alle, mit Knoten =
    Teilbaum; `norm()` prüft den aktiven Bereich gegen Baum UND Fenster (sonst landete beim Neuladen die Seite des
    aktiven Fensters zusätzlich im Hauptbereich – doppelter Tab).
125. **Vollbild-Pfeilchen und Kachel-Kopfzeilen:** `#fs-rb` (Trefferfläche grösser als der Knopf) lag über dem ersten
    Tab der ersten Kachel – Wegziehen ging dort nicht. Seit 1.49 ein 20-px-Streifen oben im Kachel-Vollbild.
126. **Sessel braucht eine gute Startkonformation:** die Federn finden aus der flachen Zeichnung mit zufälliger Höhe oft
    eine Twist-/Wannenform (lokales Minimum). Darum Startwerte je Ring (abwechselnd ±0,25 Å) und axiale/äquatoriale
    Startlagen – danach entspannt die Rechnung nur noch.
127. **Eingegliedertes Fenster behält seine Fenster-Klasse:** `paneEl` gibt das zwischengespeicherte Element zurück –
    nach dem Andocken als geteilter Bereich hatte es noch `pfloat`, Lage/Grösse und die Griffe (lag schwebend über
    allem). `render()` räumt das jetzt für Bereiche im Baum ab.
128. **Textmarker und `screen`:** im dunklen Design blendete `screen` den Marker hell auf – auf Weiss bleibt Weiss,
    der Marker war auf importierten PDF-Seiten unsichtbar. Normales Überlagern mit Deckkraft funktioniert auf beiden.
129. **`expand` und `simp` (1.52):** `expand((a+b)²)` baute `a·a…` als Produkt und rief `simp` – das fasst gleiche
    Faktoren wieder zu `(a+b)²` zusammen → Endlosschleife. Jetzt multipliziert `mulOut` die Faktoren direkt aus und
    fasst nach jedem Faktor zusammen. `symText` klammert Produkte in Hochzahlen (`e^(3·x)`, vorher `e^3·x`).
130. **Erkennung hängt an der Schreibreihenfolge:** `MathInk.recognize` gruppiert Striche zeitlich – wer Striche
    umsortiert (Zeilen nach Höhe), muss innerhalb der Zeile die ursprüngliche Reihenfolge wiederherstellen.
131. **kNN nur für Stift-Tinte:** der Richtungs-Erkenner verschlechterte Bilder (Scan-Striche haben `comp`) von 155
    auf 141 – für Bilder bleibt er aus. Klammer-Regeln mit geglätteten Winkeln fingen 3/7/1/2 als „)“ – Wendung im
    Fenster und Mindesthöhe nötig. Zerlegen nur ohne Berührung und ohne zu kleine Teile (sonst „x“ → „)(“, „1“ → „11“).
132. **Symmetrie mit Kekulé-Bindungen:** Morgan-Klassen über Bindungsordnungen trennen in Toluol gleichwertige
    Ring-C (7 statt 5 Signale) – im Aromaten gelten alle Bindungen als „a“. Und gleichwertige H koppeln nicht
    (Benzol: Singulett, nicht Triplett).
133. **Fotomath-Anzeige:** der alte `else`-Zweig nach „Auflösen nach“ setzte bei jeder anderen Art „Keine Rechnung
    erkannt“ – jetzt nur, wenn noch nichts angezeigt wird. Knöpfe der Werkzeuge reagieren auf `pointerdown` (wie
    „Auflösen nach“), sonst baut das Verlassen des Textfelds die Knöpfe neu, bevor der Klick ankommt.
134. **GESTIS:** Nutzungsbedingungen beachten – nur verlinken, nichts kopieren oder zwischenspeichern (auch keine
    Liste mit ZVG-/CAS-Nummern ausliefern); die ZVG-Nummer trägt der Nutzer selbst ein.
135. **Spektren-Zoom und Seitenverhältnis:** das SVG muss die volle Breite behalten (`width: 100%; height: auto`, kein
    `max-height`) – sonst wird es mit Rändern eingepasst und die Umrechnung Mausposition → Wert stimmt nicht mehr.
136. **Kopfzeile der Stoffliste:** eine Titelzeile mit „ZVG/CAS“ darüber sah wie die Kopfzeile aus – gesucht wird die
    erste Zeile mit „ZVG“ UND „CAS“/„Name“.
137. **Entfernte H gingen beim Speichern verloren:** `pack` kannte `hd` nicht – jetzt optionales 7. Feld
    `{hd, rad, hq}`; ältere Dateien ohne Feld bleiben lesbar.
138. **Download-Namen im Test:** headless Chromium meldet bei Umlauten/Gedankenstrich im Dateinamen „download“ – der
    Test prüft den Inhalt; die Dateinamen ersetzen hochgestellte Ziffern (¹⁹F → 19F) und „–“ durch „-“.
139. **Zeigen-Modus nach „=“:** `isFormula` verlangt mehr als ein Zeichen – `pointable()` muss „=“ allein erlauben, und
    das Vorschlags-Fenster darf die Nachbarzellen nicht verdecken (ausserhalb der Tabelle, `pointer-events: none`).
140. **Zeilen verschieben und Bereiche:** `permRefs` lässt einen Bereich, der den ganzen verschobenen Block enthält,
    unverändert (=SUMME(A1:A4) bleibt), einzelne Bezüge wandern mit.
141. **IR-Torsion um Dreifachbindungen** ergab Frequenzen in Millionen cm⁻¹ – Torsionen nur um Doppel-/Aromaten-
    bindungen, Moden über 4000 cm⁻¹ verwerfen; C=O-Konstanten tiefer, weil die Kopplung mit C–C die Bande anhebt.
142. **Mehrere Moleküle:** Beschriftungs-Flags hängen am Atom mit der kleinsten id – nach Löschen/Einfügen springt das
    Flag auf das nächste; ein Molekül ohne Flag zeigt keine Beschriftung.
143. **MS-Heuristik:** ohne Strafe für CH₃·-Verlust/Vinyl-Kationen werden M−15 und C₃H₅ zu gross; ohne Grössenbonus
    sind Alkan-Spektren vom M⁺ beherrscht. Neue Regeln immer gegen `analyse-test.js` (Basispeaks) prüfen.
144. **Spektrum unter dem Rand im Test:** MHz-Auswahl und längere Tabellen schieben das Diagramm nach unten – der
    Browser-Test scrollt es vor dem Mausrad ins Bild (`scrollIntoView`), sonst trifft das Rad die Fusszeile.
145. **Elektronenpfeil-Anker** (`{at}`/`{bd}`) müssen beim Löschen der Atome/Bindungen mitgelöscht werden, sonst zeigt
    der Pfeil ins Leere – `deleteSel` entfernt solche Objekte.
146. **NMR-Beschriftung:** gleiche y-Zeile für alle Signale überdeckte sich – Breite je Beschriftung schätzen und
    verteilen (`spreadLabels`), Striche führen zurück zum Peak; die Spitzenhöhe je Signal aus der Kurve nehmen.
147. **Prüfwerte ohne Überanpassung:** Inkrement-Tabellen nur an Literaturwerten einstellen und mit Kontrollstoffen
    (nicht zum Einstellen benutzt) gegenprüfen – `nmr-referenz.js` enthält beide.
148. **Grant–Paul durch Heteroatome:** Atome hinter einem O/N weiter zählen (Ether, Ester-O–C=O als „normales“ C),
    Gruppen-C (Aryl, C=O, Nitril, Alken) aber nicht weiter verfolgen, sonst wird ihr Inkrement doppelt gezählt.
149. **DMF zeigt zwei N-CH₃-Signale**, obwohl die Atome nach der Symmetrie gleichwertig sind – eigener Schlüssel
    'Z'/'E' (`amideRot`) für ¹H und ¹³C.
150. **MS-Strukturbilder:** das Ion wird aus den Original-Koordinaten gezeichnet; damit die H-Zahl stimmt, bekommt
    jedes Atom `hd` (entfernte H) und der Ladungsort `q = +1` (gerade Elektronenzahl). Ionen mit fester Formel
    (Phenol −CO, Phenyl −C₂H₂ …) sind nur schematisch – die Karte sagt das.
151. **Strukturbilder im dunklen Design:** ChemRender zeichnet schwarze Linien – Karten und Zuordnungsbild bekommen
    weissen Grund.
152. **Weg A → B blieb stecken**, weil die Suche käufliche Edukte nicht weiter zerlegt – mit Ziel-Edukt wird das
    ähnlichste Edukt immer weiter zerlegt, bis der Schlüssel des Edukts erreicht ist.
153. **Acetal-Regel verlor das Keton** (Filter „mehr als 4 Atome“ traf auch Aceton) – Teile über das Ring-C wählen,
    nicht über die Grösse.
154. **Kern-Feld nur im NMR-Reiter**: Tests müssen zuerst den Reiter NMR öffnen, sonst ist das Feld unsichtbar.
155. **Planen-Seitenleiste** wird bei jeder Auswahländerung neu aufgebaut – Ergebnisse und Namen liegen deshalb in
    `ChemPlan.st` (Cache), gerechnet wird nur auf Knopfdruck (setTimeout, „rechnet …“).
156. **Bewertung einteiliger Zerlegungen** (Acetylierung, Oxidation) ist wegen des Ausgewogenheits-Faktors kleiner –
    sehr verlässliche Laborwege bekommen daher rel > 1 (Ac₂O 1,06), damit sie vorne stehen.
157. **Ausgangsstoff-Erkennung**: die Gruppe „Aromat“ zählt nicht als funktionelle Gruppe (sonst gilt 4-Aminophenol
    als „selbst herstellen“); häufige Bausteine zusätzlich in der Datenbank.
158. **Gefahren-Gewichtung:** Lösungsmittel-Angaben wie „DMF oder DCM“ sind Alternativen – es zählt die günstigere;
    Gemische „THF/H₂O“ zählen das ungünstigere. Katalytische Reagenzien (< 0,2 Äq.) nur zu 35 %.
159. **Klick durchreichen:** nur wenn die Seite des Bereichs schon geladen ist (sonst würde der Klick ins Leere bzw. an
    die falsche Seite gehen); synthetischer pointerdown mit derselben pointerId, damit Ziehen weiterläuft.
160. **Angedocktes Chem-Draw:** `#app` ist `position: fixed; right: 0` – angedockt `right: var(--chem-dock-w)`; nach jeder
    Änderung ein `resize`-Ereignis, damit Zeichenfläche und Bildlaufleisten neu messen. Beim Schliessen zurücksetzen.
161. **Trennstrich hinter dem Grössen-Griff:** der rechte Fenster-Rand (`.chem-rs-e`) lag über dem Pfeil der
    zugeklappten Seitenleiste – Trennstriche haben z-index 6 und zugeklappt etwas Abstand zum Rand.
162. **Fenstergrösse auf kleinen Bildschirmen:** `clamp(w, 560, innerWidth − 12)` ergab auf dem Handy 560 px (breiter als
    der Bildschirm) – Untergrenze ist jetzt min(560, Bildschirm − 12).
163. **Abkömmlinge und „käuflich“:** der Planer darf Abkömmlinge nicht als bekannt/käuflich werten – dort
    `find(…, { exact: true })`.
---
164. **Bildfelder liegen unter allen Zeichnungen (seit 1.46, `#layer-pics`):** auf einer importierten Folie
    verschwand das Bild unter dem weissen Folienrahmen (Form, Ebene „unten“) – `elementFromPoint` fand es trotzdem,
    weil Zeichen-Ebenen `pointer-events: none` haben. Folienbilder bekommen `front: true` (#layer-front).
165. **Text auf Folien im dunklen Design:** durchsichtige Felder nehmen für die automatische Schriftfarbe den dunklen
    Seitenhintergrund → hellgraue Schrift auf weisser Folie. Folien-Textfelder bekommen die Folienfarbe als
    Hintergrund (`style.bg`/`border`), dann wählt Contrast dunkle Schrift; `.box.ofc` ohne Schatten.
166. **Office-Original nie umpacken:** Export und ZIP schreiben die Asset-Bytes unverändert (zipWriter ohne `pack`);
    ImgPack/WebP gilt nur für die Vorschau-Bilder. Asset holen über `OfficePages.assetBlob` (Browser `imgBlob`,
    Windows-Programm über `bilder/<name>`).
167. **Folien verschieben = erst einsammeln, dann schieben:** beim Einfügen/Löschen einer Folie wanderte ein Feld der
    einen Folie in den Bereich der nächsten und wurde dort ein zweites Mal verschoben (`shiftMany`).
168. **Lage zurückschreiben als Differenz:** neu aus gerundeten px berechnet ergab ±7000 EMU Abweichung (und das
    Duplikat eine andere als das Original) → `neu = alt + (px − px0) / Massstab × 9525`.
169. **Bildfelder liegen unter „unten“-Zeichnungen:** ein ganzflächiges Rechteck vor den Bildern (spTree-Reihenfolge)
    verdeckte sie als Zeichnung → als Hintergrund-Feld (`office:'form'`); Bilder/Felder ohne Rahmen (`plain`).
170. **themeOverride und dunkle Hintergründe:** ohne die Farbschema-Überschreibung der Folie und ohne die mittlere
    Farbe des (umgefärbten) Hintergrundbilds wurde helle Titelschrift von Contrast „lesbar“ dunkel gemacht.
171. **Datei-Karte nicht bereinigen:** `sanitizeHtml` entfernt `contenteditable`/`data-kt-file` am 📎-Link →
    `addBox(…, { raw: true })` für die Karte.
172. **Leere Word-Vorlage:** der leere Absatz `<w:p/>` gehört zum Schreibfeld (sonst bleibt er vor dem Text stehen);
    Nummerierung nur ergänzen, wenn wirklich eine Liste geschrieben wird (sonst wäre jede Datei „geändert“).
173. **LibreOffice rechnet .xlsx beim Öffnen nicht neu:** zwischengespeicherte `<v>` der Formeln des geänderten
    Blatts entfernen (Excel rechnet mit `fullCalcOnLoad` sowieso neu).
174. **Word-Fluss nur nach dem Messen:** Höhen gibt es erst in `Canvas.layout`; `OfficeView.flow` ändert Lage/Breite
    und zeichnet höchstens einmal neu (`_ofFlow`), sonst Endlosschleife über ResizeObserver.
175. **Leisten über der Fläche fangen Ereignisse ab:** `.ofv` liegt im Bereich neben `#viewport`; alle Zeiger-/Rad-/
    Kontext-Ereignisse werden gestoppt, sonst entsteht beim Klick auf eine Miniatur ein Textfeld.
176. **Neue Seite im neuen Tab bei asynchroner Erstellung:** `Panes._forceNew` muss bis nach `await
    OfficePages.newTyped` gelten (`Panes.newTyped`), `inNewTab` setzt es nur synchron.
177. **Excel-Startgruppen aus dem Register „Tabelle“:** brauchen `Sheet.active` – beim Öffnen einer Excel-Seite und beim
    Blattwechsel wird das Blatt aktiviert (Zelle A1).
178. **Vorschau statt Vorführen:** ein Klick auf einen Übergang darf nicht `Show.start` aufrufen (öffnet den Vollbild-
    Modus) – `Show.previewAt` spielt die Folie in einem festen Element genau über der Folie auf der Fläche.
179. **Leisten nach dem Seitenwechsel:** `OfficeView.onView` zeichnet im nächsten Bild; ohne Prüfung `this.p ===
    Canvas.page` landete das Lineal auf einer Excel-Seite und der Notizbereich auf einer Word-Seite.
180. **Papier = Bild, nicht Feld:** das Blatt-Feld ist 22 px breiter (Innenabstand) als das Papierbild; Schatten und
    Hintergrund gehören an `.fimg`, das Feld bleibt durchsichtig – sonst stimmen Lineal und Papier nicht überein.
181. **Seitenumbruch nur in der Anzeige:** der Abstand für Absätze am Seitenende steht als `data-kt-pm`/`--kt-pm` im
    DOM und muss in `boxHtml` entfernt werden, sonst wandert er ins HTML und in die .docx.
182. **Grammatik ohne Wörterbuch:** `Spell.scanBox` muss Map/Cursor zuerst berechnen und `Grammar.scanBox` aufrufen,
    bevor es bei fehlendem Wörterbuch (offline) abbricht – sonst gibt es offline keine Grammatik.
183. **Add-In-Funktionen geben einen Wert zurück:** die Tabellen haben kein „Überlaufen“ (Spill); eine Matrix zeigt nur
    ihren ersten Wert – deshalb ist das Beispiel MITTELOHNENULL statt einer Zeilensummen-Matrix.
184. **Notizen für Folien ohne Notizenseite:** nicht `ox.part` setzen (die Seite bleibt unverändert); bei jedem Speichern
    entsteht die Notizenseite aus dem Original-Paket neu. Ohne Notizenmaster öffnet PowerPoint die Notizen nicht –
    `ensureNotesMaster` legt ihn samt Design an.
185. **Word-Seitenfarbe braucht settings.xml:** ohne `w:displayBackgroundShape` zeigt Word die Farbe nicht; leere
    Vorlagen haben keine settings.xml → anlegen und verknüpfen (Reihenfolge laut Schema nach `w:zoom` …).
186. **XML-Bausteine mit Standard-Namensraum (Excel):** `OfficePages.xml` muss `xmlns="…spreadsheetml…"` setzen, sonst
    hängen `<pane>`/`<conditionalFormatting>` mit `xmlns=""` im Blatt (openpyxl/Excel lesen sie nicht).
187. **Excel-Ansicht vor dem Zeichnen begrenzen:** die Grenze bei A1 und die Köpfe (`--hx/--hy`) gehören in
    `Canvas.applyView` (synchron), nicht in `onView` (nächstes Bild) – sonst springt die Ansicht und die Köpfe zittern;
    beim ersten Öffnen nach `OfficeView.sync` einmal `applyView` (sonst bleibt view.y = 0 mit Lücke über den Köpfen).
188. **Aktives Excel-Blatt verdeckte Textfelder:** `.box.xl.xl-on { z-index: 99990 }` – auf Excel-Seiten z-index 1, damit
    Textfelder darüber liegen.
189. **Aktuelle Folie und Auswahl:** `currentFrame` nimmt zuerst die Folie des ausgewählten Felds – beim Folienwechsel
    (Rad, Übersicht) die Auswahl auf einer anderen Folie aufheben, sonst bleibt die alte Folie „aktuell“.
190. **Abdeckung fängt das Rad:** `.ofv` stoppt alle Ereignisse; die Abdeckung der Normalansicht leitet das Rad an
    `OfficeView.wheel` weiter, sonst wechselt die Folie nur über der Folie selbst.
191. **Leere Listen-Platzhalter:** `isEmptyHtml` hält `<li>` für Inhalt – leere Platzhalter (`b.ph`) über den Text
    (`OfficeWord.textOf`) prüfen, sonst landet ein leeres Textfeld mit Zeilenumbruch in der .pptx.
192. **Word-Klick vor allem anderen:** `OfficeWord.down` muss in `Canvas.onDown` vor der Hintergrund-Behandlung kommen,
    sonst wählt der Klick das Blatt (Hintergrund-Feld) aus statt die Schreibmarke zu setzen; `preventDefault` auf
    pointerdown unterdrückt den mousedown, damit der Fokus im Text bleibt.
194. **Formelleiste beim Seitenwechsel:** `Sheet.barSync` verschiebt die Ansicht um die Höhe der Leiste – in
    `Canvas.load` vor dem Laden der neuen Ansicht ohne Verschieben aufrufen (`barSync(true)`), sonst landet die alte
    Ansicht unter der neuen Seiten-ID in `Store.ui.views`.
195. **Ziehgriff nicht neu aufbauen:** `fillPane` leert den Animationsbereich – den Griff aufheben und wieder anhängen,
    sonst geht die Zeiger-Erfassung mitten im Ziehen verloren. Griff der Folienübersicht ausserhalb der Liste (die
    scrollt und schneidet ihn ab): `.ofv > .g-strip` an `--ofv-strip`.
196. **Aktuelle Folie bei oben ausgerichteter Lernansicht:** die Mitte des Bildes liegt unter der Folie →
    `currentFrame` nimmt die zuletzt gezeigte Folie, solange sie zur Hälfte sichtbar ist.
197. **Add-Ins zuerst lesen, dann starten:** `Plugins.parse` sammelt nur die Anmeldungen; `setup` läuft erst in
    `register` und nur, wenn das Add-In eingeschaltet ist – sonst würde ein ausgeschaltetes Ordner-Add-In beim Start
    trotzdem Knöpfe anlegen.
198. **Eingebaute Add-Ins vor dem Menüband:** `Ribbon.build()` steht am Anfang von `App.boot` – `Plugins.syncBuiltins()`
    muss davor laufen (und nach `earlyUi`/Zustand nochmals, mit `Ribbon.buildStrip`), sonst fehlt „Chemie“ im ersten
    Bild bzw. erscheint trotz Häkchen aus. `addins` steht darum auch in `EARLY_KEYS`.
199. **Häkchen-Knopf und `.on`:** `.rb.on` färbt den Knopf; beim Häkchen (`.rb.chk.on`) nur das Kästchen füllen,
    Hintergrund normal lassen. `addinToggle.active` = eingeschaltet **und** geladen (ein fehlerhaftes Add-In bleibt leer).
200. **`APP_VERSION` gibt es nicht:** die Programmversion für `requires` kommt aus `Store.info.version` (Server bzw.
    Browser-Speicher), Fallback in `Plugins.appVersion()` bei jeder Version nachführen.
201. **Bild-Kontextmenü ist ein eigener Zweig:** Rechtsklick direkt auf ein Bild öffnet das Bild-Menü (`d.imgId`), nicht
    das Feld-Menü – Add-In-Einträge (`menuFor('box')`) müssen in beide.
202. **Dateinamen im Add-Ins-Ordner:** `filepath.Base` macht aus `../x.js` stillschweigend `x.js` – Namen mit `/` oder
    `\` darum ablehnen statt kürzen; nur `.js`, kein führender Punkt (seit 1.70 auch kein `_`).
203. **`go:embed` und „_“:** Bei `//go:embed web` fehlen Dateien, die mit `_` oder `.` beginnen – die Vorlage
    `_Add-In-Vorlage_KI.js` muss darum zusätzlich ausdrücklich genannt werden (sonst fehlt sie im Programm still).
204. **Kommentar in der Vorlage:** Die Anleitung steht in EINEM Block-Kommentar – darin darf kein `*/` vorkommen
    (Beispiele mit `//`-Kopfkommentar). Der Test prüft, dass die ganze Vorlage gültiges JavaScript ist und ihr Gerüst läuft.
205. **Häkchen-Raster und Bandhöhe:** 4 Zeilen à `--rh` (24 px) passen nicht in `--bh` (78 px) – `.ai-checks` teilt die
    Höhe in 4 Zeilen (`1fr`), die Häkchen dort höchstens 22 px.
206. **ODF-Namensraum `fo`:** in OpenDocument ist `fo` = `urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0`
    (nicht der W3C-Namensraum) – sonst übernimmt LibreOffice keine Farben/Fettschrift, und beim Lesen fehlen sie.
207. **`table-layout: fixed` braucht eine Breite:** ohne `width` am `<table>` gilt das automatische Layout; seit Excel-
    Blätter einzeilig zeichnen (`white-space: pre`), machten lange Texte ihre Spalte breit. Breite = Summe der Spalten.
208. **Fixierte Zellen und `border-collapse`:** die Linien zeichnet die Tabelle – sie verschieben sich mit `transform`
    nicht mit. Fixierte Zellen zeichnen ihre Linien mit `box-shadow`, Köpfe fixierter Spalten/Zeilen werden mitgeschoben.
209. **BIFF8-Zeichenketten:** „komprimiert“ heisst Latin-1 (unteres Byte von UTF-16), unabhängig von CODEPAGE (LibreOffice
    schreibt 1200 = UTF-16) – sonst wird aus „Daten“ chinesisch wirkender Text. Geteilte Formeln: `ptgExp` → SHRFMLA mit
    relativen `ptgRefN/AreaN` (Zeile 16 Bit, Spalte 8 Bit mit Vorzeichen).
210. **Designfarben in Excel:** `theme="0"` ist **lt1** (Hintergrund), `1` dk1, `2` lt2, `3` dk2 – vertauscht gegenüber der
    Reihenfolge in theme1.xml.
211. **Word-Listen über Formatvorlagen:** „List Bullet“ (python-docx, Word) setzt `numPr` in der Formatvorlage, nicht im
    Absatz – `docOf` liest beide.
212. **RTF:** das Leerzeichen nach einem Steuerwort gehört dazu; ohne Steuerwort davor ist es Text. `\colortbl` beginnt mit
    dem leeren Eintrag 0 (automatisch).
213. **Excel-Raster wächst beim Scrollen:** `d.cols` wird länger (neue Spalten mit Standardbreite) – ein Vergleich aller
    Breiten hätte jede unveränderte Datei „geändert“. `layoutKeys.cols` nimmt nur Breiten, die von der Standardbreite
    abweichen (Test „unverändert = Original“ in office-160/167 fing das).
214. **Druckbereich/Drucktitel sind Namen der Mappe** mit `localSheetId` = Stelle des Blatts in `<sheets>` (nicht die
    sheetId) – beim Lesen `si` aus der Schleife, beim Schreiben `idxOf` nach `syncSheets`. `Print_Titles` steht als
    `'Blatt'!$1:$1` (mit `$` vor beiden Zahlen).
215. **Notizen brauchen VML:** Excel zeigt Kommentare nur mit einer `legacyDrawing`-Form (`ObjectType="Note"`, Anker,
    Zeile/Spalte). VML ist oft kein sauberes XML – nur als Text bearbeiten (Formen mit Note per RegExp ersetzen, andere
    behalten). Leere Zelle mit nur Zellschutz (`f.ul`) muss als Format gelesen werden, sonst wird sie gesperrt.
216. **Datenüberprüfung ist mehr als Listen:** 1.71 las nur `type="list"`; alle anderen Arten gingen beim Schreiben
    verloren, sobald eine Regel geändert wurde. Jetzt werden alle gelesen, unveränderte als Original-XML zurückgeschrieben
    (mehrere Bereiche in einer Regel: nur wenn alle Teile noch da sind). `Sheet.dvAt` (Dropdown) nimmt nur Listen.
217. **Blattschutz und `Sheet.locked`:** ohne Zelle (`locked(id)`) heisst geschützt = gesperrt (Formatieren, Zeilen
    einfügen …); mit Zelle (`locked(id, c, r)`) sind entsperrte Zellen frei. `setCells` lässt eine Liste nur durch, wenn
    alle Zellen frei sind. SHA-512 mit 100 000 Runden dauert im Browser etwa eine Sekunde (Hinweis „wird geprüft“).
218. **Word-Felder im Text:** `sanitizeHtml` entfernt Attribute – Seitenzahlen stehen deshalb als `{Seite}`/`{Seiten}`/
    `{Datum}` im Modell und werden nur in den Anzeige-Feldern je Blatt ersetzt; beim Schreiben werden sie `fldSimple`.
    Beim Lesen: `fldSimple` und zusammengesetzte Felder (`fldChar begin/separate/end` + `instrText`) → Platzhalter.
219. **Wasserzeichen-Bild mit Transparenz:** ein Hintergrund-Feld ohne `style.bg = 'transparent'` malt in Dunkel die
    Feldfarbe unter das PNG.
220. **PowerPoint-Übergänge in mc:AlternateContent:** zuerst steht die p14-Variante (`Choice`); unbekannte Kinder → „Verblassen“.
    `dir` steht am Kind-Element, `advTm`/`advClick` am `p:transition` – auch ohne Effekt (`<p:transition advTm="3000"/>`).
221. **Zwei Wege für Schrift in Tabellen:** `commands.js` umhüllt `size/grow/shrink` für aktive Tabellen (Freiform: ±1 pt).
    Auf Excel-Seiten müssen sie zu `OfficeXT` (Excel-Schritte, `fn`/`fs` relativ zur Mappenschrift) – die Hülle fragt
    deshalb `xlPage()` zuerst; sonst ergab „grösser“ von 14 pt 15 statt 16.
222. **Neu einlesen mit aktiver Excel-Zelle:** `Sheet.active` zeigte auf ein gelöschtes Blatt-Feld → `Sheet.status` warf
    beim Zeichnen. Vor dem Neuaufbau `Sheet.deactivate()`.
223. **Schnellzugriff speichert SVG:** nur über `OfficeUI.cleanSvg` (DOMParser image/svg+xml, Liste erlaubter Elemente,
    keine on…/href) – `Store.ui` ist Benutzerdaten und kann aus einer importierten Datei kommen.
224. **Schriftnamen im style-Attribut:** `fontCss` setzt einfache Anführungszeichen – doppelte beendeten `style="…"`
    und alle folgenden Eigenschaften (Farbe, Abstände, Umbruch) fielen weg.
225. **Lage im Feld immer ab der Feld-Oberkante (+13):** der erste Absatz mit Rand (`--kt-pm`) verschiebt den
    Textbereich mit (Randverschmelzung) – gemessen relativ zu `.box-text` war er dann „oben“ und rückte nie weiter.
    `paginate`, `bmTarget`, `annotate` messen ab `e.getBoundingClientRect().top` − 13. Feld-y = Inhaltsbeginn der
    Seite (`cTop`), der Text steht 13 px tiefer wie das Papier unter dem Blatt-Kopf.
226. **Lücken-Floats nur in Feldern ohne Bilder:** Float-Regel „nicht höher als ein früherer Float“ – Bild-Floats nach
    den Lücken landeten unten. Felder mit Bildern (`wimg`, Bilder im Text) rücken absatzweise wie bis 1.73. Lücken nur
    bis zum Textende (sonst wächst das Feld mit jeder Runde); höchstens 8 Runden je Fluss.
227. **Textfeld doppelt:** Word schreibt Textfelder zweimal (`mc:Choice` wps und `mc:Fallback` VML) – überall
    `mc:Fallback` und Inhalte von `txbxContent` überspringen (`OfficeWI.objects`, `runs`).
228. **Seitenansicht in der App:** Ebenen der Kopie haben keine id (sonst doppelte `#layer-…`), z-Index wird aus der
    lebenden Fläche übernommen (`prep`); CSS, das nur unter `#viewport` gilt (hr, Absatzabstand-Entwurf, Schrift),
    gibt es zusätzlich für `.kt-rd`. Tasten: an der Ansicht und – wenn der Fokus verloren ging (gezeichnete Seite
    geleert) – per Capture am Dokument, nie an die Seite darunter. `.kt-rd-pages` braucht `box-sizing: content-box`
    (sonst passt die zweite Seite nicht neben die erste).
229. **Menüs „trocken“ öffnen (Suche oben):** beim Aufbau des Index werden `UI.menu/showPopup/dialog/prompt/info`
    ersetzt und erst nach einem Tick (asynchrone Menüs) zurückgesetzt – zwei gleichzeitige Aufbauten hätten die Ersatz-
    funktionen als „Original“ gemerkt; deshalb läuft immer nur einer (`_p`). Beschriftung eines Knopfs = letzter Text-
    Span (`labelOf`): bei Knöpfen mit Zeichen-Symbol (Wasserzeichen „A“) war der erste Span das Symbol.
230. **Diagramme auf Office-Seiten immer hell:** `Chart.update` zeichnete im dunklen Design dunkel – auf weissem Papier
    unlesbar. Diagramm-Felder in Word bekommen keinen weissen Hintergrund (die Kopfleiste des Feldes überdeckte sonst die
    letzte Zeile des Absatzes davor, Felder schliessen seit 1.74 ohne Abstand an).
231. **Excel-Diagramm mit Bezug nur, wenn er dasselbe ergibt:** `Chart.fromRange` liest Kopfzeile/erste Spalte – der aus
    den `c:f`-Bezügen gebildete Block wird geprüft (gleiche Zahl Reihen/Werte), sonst bleiben die Werte aus dem Cache.
    openpyxl schreibt keinen Cache – dann zählt nur die Zahl der Reihen.
193. **Leisten nur innerhalb der Fläche:** `.ofv { overflow: hidden }` – Animationsbereiche von Folien oberhalb des
    Sichtbereichs ragten sonst über das Menüband.

## 9. Bauen und Testen

```bash
# Webseiten-Version (erzeugt dist/index.html, ~1.25 MB, verkleinert)
python3 build_web.py
# … lesbar wie bis 1.22 (mit Kommentaren und Einrückung, ~1.65 MB) – zum Nachsehen/Fehlersuchen im Browser
python3 build_web.py --lesbar
# prüfen, dass das Verkleinern nichts am Programm ändert (braucht das npm-Paket acorn, sonst übersprungen)
node tests/build/kompakt-test.js
# KnowledgeTree-Datei (1.24/1.25): schreiben/lesen (ZIP, .html, .json, Backup-Ordner), ZIP-Prüfsummen (Python),
# alte Formate, leere Bilder; Go-Teil
node tests/backup/ktfile-test.js
go test ./...            # mit KT_SAVES=<Saves-Ordner> zusätzlich gegen echte Daten
# Tabellen (1.26): Formel-Engine, Bezüge über Seiten und gezieltes Neurechnen; kompakte Freihand-Pfade
node tests/sheet/xl-test.js && node tests/sheet/verweise-test.js
node tests/draw/pfad-test.js
node tests/mathink/aufloesen-test.js   # Fotomath: nach einer Unbekannten auflösen (1.27)
node tests/mathink/rechenweg-test.js   # Fotomath: Rechenweg, Text mit Zeichen/Tastatur, getippte Rechnungen (1.38)
node tests/spell/spell-test.js         # Rechtschreibung: Hunspell-Leser (en_US, kleines deutsches Testwörterbuch) (1.38)
node tests/chem/modelle-test.js        # Chem-Draw: Lewis, Bohr, Orbitale, 3D (1.28)

# Windows-EXE (von Linux aus; Go 1.22+) – ZUERST build_web.py: die EXE bettet dist/index.html ein (Vorlage für
# interaktive Dateien, /kt-app.html)
GOOS=windows GOARCH=amd64 CGO_ENABLED=0 go build -trimpath \
  -ldflags "-H windowsgui" -o build/KnowledgeTree.exe .

# Im Sandbox ohne Go-Proxy (proxy.golang.org gesperrt, GitHub erreichbar): in einer KOPIE des Projekts
#   printf '\nreplace golang.org/x/sys => github.com/golang/sys v0.30.0\n' >> go.mod
#   GOPROXY=direct GOSUMDB=off GOFLAGS=-mod=mod GOOS=windows GOARCH=amd64 CGO_ENABLED=0 go build …
# go.sum prüft go-webview2/go-winloader; x/sys von GitHub ergibt denselben Modul-Hash wie das Original
# (h1:QjkSwP/36a20jFYWkSue1YwXzLmsV5Gfq7Eiy72C1uc=). Paket: KnowledgeTree.exe + LIESMICH.txt +
# build/"KnowledgeTree im Browser starten.bat" in einen Ordner „KnowledgeTree“ (Saves/Cache legt die EXE an).
# Die EXE bettet web/ ein (unverkleinert, Server-Backend) – dist/index.html ist nur die Webseite.

# Icon, Manifest und Versionsangaben einbetten (seit 1.44 aus build/kt.rc; Version dort mitändern)
cd build && llvm-windres --target=pe-x86-64 -i kt.rc -o ../rsrc_windows_amd64.syso && cd ..
# (bis 1.43: rsrc -manifest build/kt.manifest -ico build/kt.ico -arch amd64 -o rsrc_windows_amd64.syso – ohne Versionsangaben)
# Seit 1.44 OHNE -s -w bauen: -ldflags "-H windowsgui" (Symboltabellen bleiben drin, siehe Fallstrick 121)

# Zum Testen unter Linux: Server ohne Fenster starten
go build -o /tmp/kt-linux . && /tmp/kt-linux --nowindow --port 8765 --dir /tmp/kttest --token test
# Oberfläche dann unter http://127.0.0.1:8765/?t=test
# Mit KT_WEB_DIR=…/web werden die Dateien von der Platte statt aus der EXE geladen
# (dann muss man für Oberflächen-Änderungen nicht neu bauen).

# Webseiten-Version testen
cd dist && python3 -m http.server 8800 --bind 127.0.0.1
```

Kommandozeilen-Schalter der EXE: `--browser` (Standardbrowser statt Fenster), `--edge`
(Edge/Chrome-Fenster erzwingen), `--nowindow`, `--port`, `--dir`, `--token`.

Getestet wurde bisher automatisch mit Playwright/Chromium (Textfelder, Speichern im Ordner
und im Browser, Undo, Bilder mit Textumfluss, Pakete, Verbindungen inkl. der neuen
Anfasser, Suchen, Backup/Wiederherstellen, Papierkorb, zwei Fenster/Tabs, Export).
Für 1.2 zusätzlich: Übernahme von 1.1-Daten, Notizbücher/Abschnitte/Register,
Unterseiten (Tasten und Ziehen), Mehrfachauswahl, Verschieben nach, Sortieren,
zurück/vor, Schnellnotizen, Notizbuch schliessen/öffnen/exportieren, Seitenversionen
(anzeigen, wiederherstellen, als Kopie), Seitenfarbe/Linien, Vollbild, alle
Zeichenwerkzeuge, Formerkennung, Lineal, Kopieren/Skalieren von Zeichnungen,
Punkt-Radierer, Zwei-Finger-Zoom (simuliert), dunkles Design, Neuladen.
Für 1.4 zusätzlich: Layout (Baum + Seitenliste, ein-/ausklappen), Farbrad (Seitenfarbe,
Schriftfarbe, Stift), Formeln (Alt+=, Bausteine, Galerie, Doppelklick, Rückgängig,
Einfügen aus der Zwischenablage), positionsgenauer Import (gemessene Koordinaten = Datei),
Export in alle vier Formate (Browser und Desktop), KT-Datei wieder laden (beide Versionen),
OneNote-Export → Re-Import (Rücktest mit Text, Listen, Bildern, Tinte, Formen).
Für 1.5 zusätzlich: Import der echten Seite des Users (Grössen, Lagen, Handschrift, Video),
Link per Klick, Video-Player, Bild-Objekt ziehen/Pfeiltasten, Alt+Klick-Reihenfolge,
Tab-Auswahl, Handschrift vor Bild anklicken, Spalten ein-/ausklappen (auch nach Neuladen).
Für 1.6 zusätzlich: Doppelklick auf Kopf/Streifen/freie Fläche beider Spalten, Abschnitt
über die Leiste unten anlegen, Rechtsklick-Menü der freien Fläche; Chem-Draw: Bindungen
per Klick/Ziehen, Kette, Ringe (frei, an Atom, an Bindung), Element-Tasten, Ladung,
Radierer, Rechteck-Auswahl, Kontextmenü über dem Dialog, Rückgängig, Esc mit Rückfrage,
Beschriften per Doppelklick (COOH), Keil → (R)/(S), Einfügen in die Seite (Browser und
Desktop), Doppelklick → wieder bearbeiten, Summenformel-Register, Periodensystem,
markierte Reaktionsgleichung formatieren, OneNote-Export mit Strukturbild (PNG),
dunkles Design; Chemie-Logik in Node (Formel-Parser, Stereozentren, R/S, E/Z).
Für 1.9 zusätzlich: Rechenwerk des Rechners `node tests/calc/calc-test.js` (69), Fotomath-Erkennung
`node tests/mathink/mathink-test.js` (künstliche Handschrift mit Verzerrung: 72/72 Ausdrücke, Ziffern
einzeln ~98 %) und `node tests/mathink/bitmap-test.js` (dieselben Rechnungen als Bild mit dünnem/dickem
Stift, Rauschen, Schatten, Häuschenpapier: ~90 %), Ausweichen `node tests/route/route-test.js` (36: frei, viele Hindernisse, eigene Felder, Pfeil von
aussen, Abstand, enge Lücke).
Im Browser: alle Tasten und 2nd-Funktionen des Rechners (op/set op, complex, base n, convert, Σ/∏,
expr-eval, Kontrast, insert), Brüche von Hand (n/d, ▼, ►, gemischt, Kehrwert), Standard-Rechner
(%, =, √, Speicher), Grösse ziehen, Beschriftungstausch bei 2nd (Bild geprüft), Fotomath auf
künstlicher und auf der **echten Handschrift des Users** (aus seiner OneNote-Datei: „6.67428·10⁻⁹“,
„2x+3=11“ → x = 4) und auf Bildern davon, Etikett-Korrektur + Lernen, Ergebnis daneben/als Formel,
Funktionsvorschläge (Chips bei „=“, grauer Vorschlag, Liste, Signatur), gezielte Aktualisierung
(Diagramm wächst mit neuer Zeile, Bezug über zwei Tabellen), Ausweichen aller drei Linienformen um
Textfelder und Bilder/Strukturformeln, Erste-Schritte-Seiten, dunkles Design, Desktop-Server.
Für 1.8 zusätzlich: Formel-Engine in Node (`node tests/sheet/xl-test.js`, 176 Prüfungen:
Vorrang, Funktionen, Fehler, Zirkel, Formate, Eingaben, Bezüge umschreiben, Reihen), Rechenwerk
des Rechners in Node; im Browser: Tabelle eintippen (Tab/Enter, Formeln, Zeigen-Modus mit Maus,
Autovervollständigen, Signatur-Hilfe, Funktionsdialog, Syntaxfehler), Bereich ziehen + Statusleiste,
Ausfüllkästchen, Kopieren/Einfügen (intern + aus Excel), Spaltenbreite, Sortieren, Rückgängig,
Kontextmenü, dunkles Design, Diagramm aus Auswahl (Säulen/Linie/XY mit Trend), Werte ablesen
(Tooltip, interpoliert), Klick → Zelle, Diagrammdialog, Bildlaufleisten (Schieber ziehen, Wachsen,
Anker, Strg+Pos1/Ende), Rechner (Vorlagen, exakte Ergebnisse, Mehrfachtasten, Verlauf-Klick,
▲/enter, Umschalten, Statistik/Regression, minimieren, verschieben, in Seite einfügen), Speichern
und Neuladen (Browser und Desktop-Server), **OneNote-Rücktest** (Tabelle mit Formeln/Formaten
und Diagramm exakt zurück, Lage gleich; in OneNote geänderte Zellen werden erkannt; Text-Tabellen
als echte OneNote-Tabellen), Import der echten Seite „22_11_15“ unverändert (275 Striche),
Grundfunktionen (Textfelder, Verbinden, Verschieben, Zeichnen, Pakete, Rückgängig, Chem-Draw).
Für 1.7 zusätzlich: alle ~250 Vorlagen (Formel, Masse, Bindungslängen, Abstände, Name,
Wiedererkennung inkl. Fumar-/Maleinsäure, α/β-Glucose), Galerie-Bilder aller Vorlagen
angesehen, ~285 Namen (deutsch/englisch/Ringe), Raster/Einrasten, Aufräumen, Vorlage
einfügen, Name der Auswahl, Name von Hand ändern, Name im Bild, das Beispielmolekül des Users
(2-Amino-2-(1H-inden-2-yl)ethansäure, M = 189.214 g/mol).
Für 1.10 zusätzlich (Playwright mit Touch-Emulation, `is_mobile`/`has_touch`, Finger über CDP
`Input.dispatchTouchEvent`): Grössen 280×653, 320×568, 360×740, 390×844, 844×390 (quer), 768×1024,
1180×820, 640×480, 1024×700, 1100×600, 1366×768, 1920×1080 – nirgends waagrechtes Scrollen der Seite;
Schublade (☰, Hintergrund, Esc, Wischen, Seite wählen), Menüband einblenden/schliessen, Suche,
antippen = Textfeld, Seite mit einem Finger verschieben, Zwei-Finger-Zoom, langes Drücken auf Feld/
Seitenliste, Feld an der Leiste verschieben, „Verbinden mit …“, mit dem Finger zeichnen, Tabelle
antippen + tippen, Tastatur (Höhe verkleinert: Anordnung bleibt, Schreibmarke sichtbar), Rechner/
Fotomath/Diagramm-/Export-/Formel-/Funktions-/Tastenkürzel-Dialog und Chem-Draw auf Handy hoch/quer;
alle bisherigen Tests (Node und Browser) erneut. Hintergrund: Rechtsklick → festlegen (Ebene, Auswahl
weg), Auswahlrahmen auf dem Bild beginnend, Strg+A, Lasso (Bild und Hintergrund-Zeichnung nicht dabei),
Klick wählt aus (auch die Zeichnung über dem Bild), ausgewählt verschieben + Rückgängig, Doppelklick =
Textfeld, Radierer, Rechtsklick → Häkchen → wieder normal + Rückgängig, Neuladen, Finger (antippen =
auswählen, ziehen = Seite verschieben, lange drücken = Menü), Verbindung ohne Umweg, Text eines
Hintergrund-Felds bearbeiten (2. Klick), HTML-Export, OneNote-Rücktest (`IsBackground`).
Für 1.11 zusätzlich: Datei anhängen (`attachFile` → 📎-Chip, auch an bestehendes Feld unter Erhalt des
Texts), Rechtsklick **und** langes Drücken auf den Anhang → Menü (auch im Bearbeiten-Modus), Office
aufklappen mit **echter .docx-Datei** (eigener ZIP-Leser/`inflate`: Bilder aus `word/media`, deflate
**und** stored), PDF aufklappen und Passwort-Abfrage **gegen einen originalgetreuen PDF.js-Stub**
(getDocument/promise, getPage, getViewport({scale}), render().promise, PasswordException, destroy) –
weil die Testumgebung **nicht an cdnjs** kommt, konnte das echte PDF.js-Bündel hier nicht geladen und
damit nicht live getestet werden, nur die Integration darum herum; die gerenderten Seiten als
Bild-Felder untereinander, OneNote-Export (Seiten als Bilder), Speichern+Neuladen (Chip + Bilder
bleiben), sowie der **Hinweis-Platzhalter** beim Import fehlender (ausgelagerter) Bilder.
Für 1.12 zusätzlich: Archiv-Import mit einer **echten ZIP** (Ordnerbaum aus echten `.one`-Dateien des
Users + ein `.knowledgetree.json` + eine zu überspringende `.png` + macOS-`__MACOSX`-Beiwerk):
richtige Notizbuch-/Abschnittsgruppen-/Abschnitt-Struktur („Mein Backup“ mit Gruppe A → Physik und
Abschnitt Mathe), das KT-Backup als eigenes Notizbuch, die Fremd-Datei übersprungen und gezählt,
korrekte Pluralisierung, Speichern + Neuladen (alles bleibt), und eine **RAR ohne Netz** → freundlicher
Hinweis statt Absturz. Das echte **RAR-Entpacken** (node-unrar-js, WASM, ohne Worker) konnte im Sandbox nicht
getestet werden (kein cdnjs/jsdelivr).
Für 1.13 zusätzlich: `node tests/onenote/printout-test.js` (23 Prüfungen): nachgebaute „Wohnen“-Datei
(2 Seiten, 8 + 5 Ausdruck-Seitenbilder 1191×1684 mit gemeinsamem XPS je Ausdruck, je ein .docx, ein
unbenutztes 64×64-Symbol, OCR-Text) → Titel ohne Datum/Uhrzeit, alle Bilder PNG, keines fehlt, Abstand
1140 px, A4-Grösse, .docx byte-genau, nicht zugeordnet genau 2 XPS + 1 Symbol; Bild mit EMF + PNG →
PNG. Im Browser die ganze Runde: Import (Bericht, 3 Seiten inkl. Sammelseite), Bilder werden mit
1191×1684 dargestellt, Suche findet den OCR-Text, Neuladen, **Export nach OneNote → zurückgelesen**
(Anhänge als echte Dateianhänge mit identischen Bytes – .docx und beide XPS –, OCR zurückgeschrieben,
keine Reste mehr) → erneuter Import mit gleichem Ergebnis. Die echte Seite „22_11_15“ des Users liest
unverändert (4 von 4 Dateien zugeordnet, keine Sammelseite). Alle bisherigen Tests erneut.
Für 1.14 zusätzlich: `node tests/contrast/contrast-test.js` (83 Prüfungen: Farben lesen inkl.
`color(srgb …)`, Tönung nie rein weiss/schwarz, Tendenz je Design, Gegenseite nur wenn nötig, alle
Seitenfarben hell/dunkel ≥ 7 : 1, mittlere Farben ≥ 4.5 : 1, feste Farben: lesbare bleiben, kaum lesbare
gleiche Farbe heller/dunkler ≥ 4.5 : 1 mit gleichem Farbton, Altwerte `#252423`/`#F3F3F3`, `strip`).
Im Browser (hell + dunkel + Seitenfarbe): Standardfeld, gefüllte Felder, Altfeld, unsichtbares Feld,
OneNote-Farben, Schwarz, Grau, Rot, Gelb, Hervorhebungen, Link – überall ≥ 4.5 : 1 (nur mit „Lesbare
Farben“ aus bleiben feste Farben wie gewählt); gespeichertes HTML ohne `--kt-ink` (auch nach Tippen
und neuer Hervorhebung), Pinsel nimmt die gespeicherte Farbe, nach Neuladen gleich; Tabellen (Füllfarben,
feste Farbe, Kopfzeile, gebändert) hell/dunkel; OneNote-Export aus dem dunklen Design schreibt die
Originalfarben (nur die Kopfzeilen-Schrift ist jetzt eine helle Tönung statt `#ffffff`), HTML-Export ohne
`--kt-ink`. Alle bisherigen Tests erneut.
Für 1.15 zusätzlich: `node tests/onenote/missing-test.js` (17 Prüfungen): Abschnitt mit 6 Bildern + 1
Anhang – normal, GUID klein + Null-Zeichen, `<file>{GUID}` (roh als `.onebin`), `<file>Bild 4.png` (mit
FDSO-Kopf, dazu eine gleichnamige Datei in einem fremden `_onefiles`-Ordner, die nicht gewinnen darf),
`<invfdo>`, unbekannte GUID, Anhang `<invfdo>` → Gründe extern/invfdo/fehlt, Liste `missing`, keine Reste;
mit Begleitordner werden beide `<file>`-Bilder gefunden; `cleanTitle`/`normGuid`. Mit `KT_OUT=…` schreibt
der Test einen Notizbuch-Ordner samt `Tabellen 2_onefiles` zum Ausprobieren. Im Browser: nur die .one
(Platzhalter mit Gründen, Bericht nach Grund mit Seiten), ZIP mit Begleitordner, Ordner (`fromFolder` und
echte Ordnerwahl über den Knopf), .one + Begleitdateien in der Dateiauswahl → jeweils 4 Bilder dargestellt;
alter Titel mit U+000B nach Neuladen „Merck interaktives PSE:“. Alle bisherigen Tests erneut.
**Nicht getestet:** die echte Datei des Users mit den fehlenden Bildern (lag nicht bei – ob dort `<invfdo>`,
`<file>` oder etwas anderes steht, zeigt jetzt der Platzhalter bzw. der Bericht), das Hineinziehen eines
Ordners (Playwright kann keine Ordner ziehen; die Ordnerwahl über den Knopf ist getestet), Ordnerwahl auf
dem Handy (Android-Chrome unterstützt sie evtl. nicht – dann ZIP).
Für 1.16 zusätzlich: `node tests/onenote/txlog-test.js` (8 Prüfungen): Datei mit Transaktions-Log in zwei
Fragmenten mit Füllung (1. Fragment = alter Stand mit nur 1 Wurzel-Knoten, 2. = aktueller Stand) → alle 3
Seiten mit Bildern; gegen den Leser von 1.15 schlägt er fehl. Die **echte Datei „65_Potentiometrie.one“**
des Users (nicht im Repository): vorher 5 Seiten / 70 Dateien, jetzt 11 Seiten / 152 Dateien, 138 Bilder,
nichts fehlt, keine Warnungen; im Browser importiert: alle Ausdruck-Seitenbilder (8 bzw. 12) werden mit den
Freihand-Notizen an der richtigen Stelle angezeigt (wie in OneNote), PDF-Anhang „LM QV 2011.pdf“ als 📎;
Export nach OneNote und zurückgelesen: 11 Seiten mit allen Bildern. Alle bisherigen Tests erneut.
Für 1.17 zusätzlich (Browser, echte Dateiauswahl über den Knopf): .one → Zielfrage → Bericht; .onepkg + ZIP
mit falscher Endung (.dat) zusammen → ohne Rückfrage 3 Notizbücher, **ein** Bericht; KT-Sicherung → nur Hinweis,
nichts angelegt; Bild + Word-Datei mit Endung .bin + CSV → Bild, 📎 „bericht.bin“ (als Office erkannt, nicht
als Archiv) und Tabelle auf der Seite; Pfeil → „Ordner wählen …“ → Notizbuch mit Begleitordner (4 Bilder);
Hineinziehen: ZIP auf die Fläche → 2 Notizbücher, Bild auf die Fläche und neben die Fläche → auf die Seite.
Handy: Knopf mit Pfeilfläche 63 × 18 px. Alle bisherigen Tests erneut.
Für 1.18 zusätzlich: `node tests/onenote/stream-test.js` (32 Prüfungen: LZX als Strom mit eigenem Encoder im
Test – Ringpuffer-Überlauf, E8 über Frame-Grenzen, Raw-Blöcke –, CAB ohne/mit MSZIP/LZX aus Bytes und aus
`Blob`, echte .onepkg, ZIP mit CP437/UTF-8/0x7075/ZIP64) und `node tests/backup/json-stream-test.js`
(10 Prüfungen: Sicherung als Strom, Bilder einzeln, Escapes inkl. `\/`, Stücke über Puffergrenzen).
Im Browser mit Speichermessung (Chromium, CDP `Performance.getMetrics` + Renderer-RSS), alt (1.17) gegen neu:
ZIP mit **1.15 GB** (riesig.zip) – JS-Speicher Spitze 2316 → **93 MB**, Renderer 1360 → **252 MB**, danach
1165 → 34 MB; .onepkg 273 MB – 554 → **121 MB** (RSS 634 → 264 MB); Exporte (KT, HTML, PDF, OneNote, Sicherung)
733–1461 → **≤ 77 MB**; Sicherung laden 1100 → **79 MB**; grosse PDF in 5 Teile aufgeteilt. Abbrechen,
Speicher voll (kleines Kontingent) → klarer Bericht, Bisheriges gespeichert. Alle bisherigen Tests erneut
(Import ZIP/RAR-Hinweis/.onepkg/Ordner/Hineinziehen, Begleitordner, Ausdrucke, „65_Potentiometrie.one“
11 Seiten mit allen Bildern, OneNote-Runde, Hintergrund, Kontrast, Handy-Dialoge).
**Nicht getestet (1.18):** ein echter Absturz-Fall auf dem Gerät des Users (Datei lag nicht bei – nachgebaut
mit 273 MB bzw. 1.15 GB), Firefox/Safari (`DecompressionStream` ab Firefox 113 / Safari 16.4).
Für 1.19 zusätzlich: `node tests/rar/rarjob-test.js` (23 Prüfungen: ein Durchgang über die gebrauchten Dateien,
Zugriff in anderer Reihenfolge, `need`/`ack`, kaputte Datei mit deutschem Grund, Nachzügler-Durchgang, Freigeben
und erneut holen, Schliessen lehnt Wartende ab, Worker-Quelltext eigenständig; erkennt auch Hänger). **Browser mit
echtem unrar 6.1.7** (selbst gebaut mit `tests/rar/unrar-wasm-bauen.sh`: emscripten 3.1.50 + LLVM 18 + binaryen
115, gleiche Schalter wie node-unrar-js; per Playwright-Route statt jsDelivr). Test-RARs mit `tests/rar/rar5.js`
(RAR5 „gespeichert“ und „komprimiert“ – nur Literale, aber echter Unpack-Weg mit 32-MB-Wörterbuch, auch solid;
mit dem nativen unrar 6.12 geprüft: „All OK“). **1.7 GB RAR** (150 Abschnitte, 900 Seiten mit Bildern): 1.14 und
1.17 → Renderer bei ~6 GB vom System beendet (wie „Out of Memory“), 1.18 → Spitze 4.8 GB und nur 63 von 150
Abschnitten importiert (Rest „nicht lesbar“), **1.19 → alle 150 Abschnitte/900 Bilder, Renderer 348 MB, alle Chromium-Prozesse
754 MB, 44 s**; ohne Worker (Rückfallweg) 2.0 GB, ebenfalls vollständig. Gemischtes RAR (Ordnerstruktur,
`_onefiles`-Begleitordner → 4 Bilder, .onepkg im RAR, KT-Datei im RAR, Foto übersprungen, `__MACOSX`) normal,
solid, gespeichert, mit kaputter Datei (nur diese fehlt, Grund im Bericht) – jeweils mit und ohne Worker; Passwort
(Kopf verschlüsselt) → klare Meldung; Abbrechen während 1.7 GB → Bericht, Worker beendet; Worker-Modul nicht
ladbar → Hauptfenster; Neuladen. Alle bisherigen Tests erneut.
Für 1.20 zusätzlich: `node tests/store/verlauf-test.js` (15 Prüfungen: Ein-Byte-Schnappschuss gleiche Daten/nur Latin-1/
Emoji, riesiger Altschritt fällt beim Laden weg, Namen aus Seiten + Undo ohne Freihand-Punkte, Schnappschuss =
Commit-Form). **Browser:** Nachbau-RAR aus den echten OneNote-Dateien des Users (65_Potentiometrie.one × 110 +
22_11_15.one, 1.8 GB, 1342 Seiten, 15488 Bilder, 1320 Anhänge, Freihand) – Import bei 500 Seiten abgeschossen
(wie „Out of Memory“) → Neustart: Dialog „Import nicht fertig geworden“ (Datei, Abschnitt, Seite 11 von 11,
Speicher 150/187 MB, RAR im Worker), 488 Seiten + 150 Bilder restlos entfernt, Datenbank wieder wie vorher → erneuter
Import vollständig (Renderer 868 MB). 1.19 im gleichen Ablauf: Teil-Notizbuch blieb, Löschen → 488 Seiten im
Papierkorb, JS-Speicher nach dem Start mit 8 Seiten 126 MB (das alte Aufräumen lud den ganzen Papierkorb). Start mit 1350 Seiten: 503 → 388 MB. In der Sitzung:
Ausnahme mitten im Import und „Speicher voll“ → restlos zurück (keine Seiten/Bilder/kein Verlaufsschritt/kein
Journal); Notizbuch löschen → Seiten weg aus der DB, Papierkorb leer, Bilder bleiben für Strg+Z (4/4 lesbar nach
Strg+Z), nach geleertem Verlauf aufgeräumt; alter Papierkorb-Eintrag anzeigen/wiederherstellen/leeren; gespeicherter
Riesenschritt fällt beim Start weg (Verlauf neu gespeichert); RAR ohne Worker über der Grenze → klare Meldung; das
echte `Test.rar` des Users (WinRAR, -m3, 32 MB Wörterbuch) entpackt im Worker. Alle bisherigen Tests erneut.
Für 1.21 zusätzlich: `node tests/onenote/export-check-test.js` (21 Prüfungen: Abschnitt mit allem, was der Export
schreibt – Formate, Link, Umbruch im Absatz, Unicode, Bild/Anhang/Tabelle im Text, zu kurze Tabellenzeile, leere
Tabelle, freie Bilder, Hintergrund, Bild ohne Daten, Video, Anhänge mit/ohne Endung, Freihand mit Druck/Textmarker;
62 Seiten mit 1500 Absätzen und 6000 Strichen → Listen in Fragmenten; leerer Abschnitt; Inhaltsverzeichnis – alles
`onecheck` ohne Fehler, Rücklesen gleich, Symbolbilder nicht „nicht zugeordnet“). `onecheck` an allen echten
OneNote-Dateien (65_Potentiometrie, 22_11_15, Test Page/Section, Test.onepkg): keine Fehler. **Das Paket des Users
neu exportiert** (Sicherung „AM (Mathe)“ geladen, 234 Seiten, Export im Browser): alle 87 Dateien `onecheck` ohne
Fehler und ohne Hinweis (vorher: jede Datei mit Fehlern), Inhalt beim Rücklesen gleich wie vorher (78 Abschnitte).
Alle bisherigen Tests erneut.
Für 1.22 zusätzlich: `tests/onenote/onecheck.js` prüft die Strom-Köpfe (OID/OSID/Kontext) und
`fHasOsidReferences` gegen den OSID-Strom – der Export von 1.21 fällt durch, echte OneNote-Dateien nicht.
`node tests/onenote/export-check-test.js` (23 Prüfungen, neu: Ausdruck mit XPS + PDF, beides nur einmal im
FileDataStore), `node tests/onenote/printout-test.js` (Druckdokument jetzt am Seitenbild statt „nicht
zugeordnet“), `node tests/store/verlauf-test.js` (18, neu: Textfelder mit Bild/Anhang/Formel/SVG bleiben beim
Speichern). **Browser:** OneNote-Datei mit Bildern in Gliederungen importiert → neu geladen: 1.21 4 → 1 Bild,
1.22 4 → 4; echte Datei „65_Potentiometrie“ importiert (keine Sammelseite mehr) → als OneNote exportiert →
`onecheck` ohne Fehler → zurückgelesen 138 Ausdrucke (130 PDF, 8 XPS) → erneut importiert, gleich; das Paket des
Users neu exportiert: alle 87 Dateien ohne Fehler. **PDF:** Sicherung des Users, Seiten „23_06_27“ (1046 Striche,
11 eingebettete Ausdrucke), „QV 2018“, „STAO 2020“ als PDF (Chromium `page.pdf`, `pdftoppm`): Freihand liegt
auf jedem Blatt wie im Canvas (vorher von Blatt zu Blatt weiter verschoben). **Abbrechen** bei PDF/OneNote/KT/HTML
(kein Druck, kein Download), Rückfrage zwischen PDF-Teilen (Abbrechen → 1 von 3 Teilen, Weiter → 3). Alle
bisherigen Tests erneut.
Für 1.43 (Browser, 14, `t143.py`): Hintergrund-Bild verankert – ziehen, Leiste, Pfeiltasten, Entf, Bildecke, rechte
Kante ohne Wirkung; Doppelklick = Textfeld darauf; Rechtsklick mit Häkchen, ohne Sperren; gelöst wieder verschiebbar.
`bg/bg1.py` angepasst (kein Rückgängig nach dem nicht mehr möglichen Verschieben).
Für 1.76 (nur Trennlinien der Navigation, `app.css`): Bildschirmfoto geprüft; `office-168`, `tabs-durchklick`,
`geteilt-159` erneut bestanden.
Für 1.75: Browser **`office-175.js`** 34/34 (`python3 tests/browser/office175-fixtures.py /tmp/kt-word`, dann `node
tests/browser/office-175.js <url> /tmp/kt-word`): Suche oben (Alt+Q, Hinweis, Aktionen/Einstellungen/Datei/Seiten, Pfeil +
Enter → Einstellung hervorgehoben, Klick führt „Neue Seite“ aus, Enter ohne Auswahl = Inhaltssuche, Word-/PowerPoint-/
Excel-Befehle, Menüeintrag Zielwertsuche öffnet ihr Fenster), Word (Diagramm mit Werten, Gruppe, SmartArt, Bild in Tabelle,
Fuss-/Endnoten, Logo in der Kopfzeile, Textfeldhöhe, byte-gleich, Seitenansicht), PowerPoint (gedreht rot oben, Zuschnitt
gelb, Diagramm, byte-gleich), Excel (byte-gleich, Bild an E2 120×60, Diagramm A1:C4 live, Zelle ändern, nur auf seinem
Blatt) – Browser und Programm-Server. Angepasst: `office-160` (Diagramme werden jetzt angezeigt).
Für 1.74: Browser **`office-174.js`** 46/46 (`python3 tests/browser/word-fixtures.py /tmp/kt-word`, dann `node
tests/browser/office-174.js <url> /tmp/kt-word`; Testdatei roh als Word-XML: Verzeichnis als Inhaltssteuerelement und
als Feld, gedrehtes/zugeschnittenes/EXIF-/verankertes/VML-Bild, Textfeld mit Fallback, Formatvorlagen, verbundene
Zellen, Seitenumbrüche): 8 Seiten wie LibreOffice, Verzeichnis 2/2/5/6/6, Sprünge, Formatierung, Bildpixel (rot oben),
Textfeld einmal, byte-gleich unverändert, geändert mit python-docx (14 pt bleibt, Verzeichnis/Textfeld/Bilder/
Umbrüche bleiben), Seitenansicht (1/2/mehrere, Zoom, Seite 2 wie Papier, Verweis, Suche, Miniaturen, Tasten, Esc),
Webseite und Speichern unter (geöffnet: 8 Seiten, Bilder, 2 Seiten, Suche) – Browser und Programm-Server. Angepasst:
`office-160/164` (Überschriften/Listen mit Stil), `office-173` (Statusleiste + Seitenansicht), `formate-171` (.htm).
Zusätzlich angesehen: Hello-World-Datei des Users und eine von LibreOffice gespeicherte Fassung der Testdatei.
Für 1.73: Browser **`office-173.js`** 27/27 (`node tests/browser/office-173.js <url> <ordner>`): Excel-Start-Gruppen wie
Excel, keine Tabellen-Optionen ohne Wirkung in der Datei, Schriftart/Schriftgrad/grösser/Einzug für Zellen, Menüs
Einfügen/Sortieren, Statusleiste (Normal/Umbruchvorschau), Arbeitsmappenschutz (kein neues Blatt), Eigenschaften, .xlsx mit
openpyxl (Schutz, Titel/Thema/Stichwörter, Schrift/Grösse/Einzug), Designs Grün/Georgia (neu eingelesen, Schutz und Titel
bleiben; Theme-XML), Dokument prüfen (finden, entfernen), Kompatibilität .xls, Informationen (Abschnitte), Schnellzugriff
(Rechtsklick → oben links mit Symbol, entfernen, SVG gesäubert), Word: Statusleiste, Kontextregister Tabellenlayout,
Kopfzeile/sortieren/Zeile/Spalte/verbinden, .docx mit python-docx, Lesemodus (Esc); PowerPoint: fünf Ansichten,
Gliederung (Titel), Leseansicht im Fenster, Stift (Klick blättert nicht), Laser. Alle 1.72-Tests weiter grün.
**Microsoft Office selbst: ungetestet.**
Für 1.72: Browser **`office-172.js`** 58/58 (gleiche Testdateien wie 1.71: `node tests/browser/office-172.js <url>
<ordner>`; prüft die geschriebenen Dateien mit openpyxl, python-docx, python-pptx und LibreOffice): Excel – verbinden und
zentrieren (Schalter), Zeilenhöhe/Spaltenbreite, Spalte ausblenden, Formatvorlagen Gut/Überschrift 1, Zellen formatieren
(Register, Vorschau, Währung), Filter (Bereich, Knöpfe, Werte, ausgeblendete Zeilen, Fenster), Datenüberprüfung (ganze
Zahl, Liste), Zielwertsuche, Notiz (Dreieck, Kästchen), Seite einrichten, Umbruchvorschau, Drucken (Druckbereich,
Titelzeile, gefilterte Zeilen fehlen), Formeln anzeigen, Alle ersetzen, Zeile einfügen verschiebt alles, Blattschutz
(SHA-512, entsperrte Zelle, Kennwort richtig/falsch, altes 16-Bit-Kennwort), .xlsx mit openpyxl (verbunden, Höhe/Breite,
ausgeblendet, AutoFilter, Überprüfung, Notiz, Schutz, Seite, Druckbereich/-titel, Kopf-/Fusszeile, Formatvorlagen),
LibreOffice liest, Rundlauf (alles wieder gelesen; unverändert = Original); Öffnen-Liste (Gruppen, Filter, Hinweis),
Speichern unter in Datei → Informationen (Gruppen, .xlsx voreingestellt), Excel als .html, Export-Fenster (Typ je
Programm, ohne PDF), PowerPoint → .odp (LibreOffice zeigt Titel/Punkte) und Gliederung/RTF; Word – Absätze sortieren,
Symbol €, Kopf-/Fusszeile „Seite 1 von 1“ auf dem Blatt, Wasserzeichen, Silbentrennung, .docx (PAGE/NUMPAGES, VML,
autoHyphenation; LibreOffice druckt „Seite 1 von 1“), Rundlauf; PowerPoint – ausgeblendete Folie (Übersicht,
Vorführen überspringt, Schleife), Foliennummern, Foliensortierung (verschieben), .pptx (show="0", push dir="u",
advTm/advClick, emph/exit, Kopf-/Fusszeile, loop), Rundlauf. Angepasst: `office-165.js` (Register Seitenlayout,
Speichern unter jetzt direkt im Datei-Fenster). **Microsoft Office selbst: ungetestet** (nur LibreOffice/openpyxl/
python-docx/python-pptx).
Für 1.71: Browser **`formate-171.js`** 44/44 (`python3 tests/browser/formate-fixtures.py <ordner>` erzeugt die
Testdateien mit openpyxl/python-docx/python-pptx und LibreOffice; dann `node tests/browser/formate-171.js <url> <ordner>
[eigene.xlsx]`): Helligkeit wie Excel (Akzent 1 +40 % ≈ #8EA9DB), Designfarbe, Füllung/Schrift, oben+Umbruch, Überlauf
in leere Zellen, Schrift der Mappe, ausgeblendetes Blatt, verbundene Zellen (Fläche, Klick → oben links), fixiert,
Auswahlliste (Werte, setzen), Zoom 100/175/250 % mit Scrollen (fixierte Köpfe über ihren Zellen, Klick in die fixierte
Zeile trifft), Einblenden; Import .csv (; Dezimalkomma) .xls (Formeln, geteilte Formeln, Formate, verbunden,
ausgeblendet) .ods .doc .odt .rtf .md .txt .ppt .odp; „Original speichern“ = die .csv; Speichern unter: Liste mit .xlsx
voreingestellt, .xls/.ods zurückgelesen (Werte, Formate, Formeln, verbunden, fixiert, Breite), .csv/.csv UTF-8/.txt,
.xlsm/.xltx/.docm/.dotx/.pptm/.ppsx/.potx Inhaltstyp, .rtf/.odt zurückgelesen (Überschriften, Listen, fett, Farbe,
Tabelle), .md/.txt/.html; mit der Datei des Users (Füllungen, Ausrichtung). Im Browser und gegen den Server des
Programms. Zusätzlich mit LibreOffice geprüft: erzeugte .xls/.ods/.rtf/.odt/.xlsm/.xltx/.docm/.dotx/.pptm/.ppsx/.potx
öffnen sich (→ PDF/xlsx/docx), Farben/Fett/Formeln/verbundene Zellen/ausgeblendete Blätter kommen an. `office-160.js`
erwartet jetzt die verbundenen Zellen statt des Hinweises. Alle Office-, Add-In- und Chem-Tests laufen weiter.
Für 1.70: Browser **`addins-170.js`** 22/22 (`node tests/browser/addins-170.js <url>`): Häkchen-Raster (1 → 7 → 10
Add-Ins: 4 je Spalte, neue Spalte oben rechts, alles im Band, Kästchen und Text auf einer Linie, kein Umbruch), Gruppen
und Knöpfe Anleitung/KI-Vorlage; Vorlage ist EINE .js mit „_“, Kommentar mit „EINE Datei“, „_“-Regel und „In
Wirklichkeit“, gültiges JavaScript, Gerüst läuft; Vorlage hinzufügen = Erklärung statt Laden; echtes und fehlerhaftes
Add-In hinzufügen; Verwalten (Herkunft, Gruppen, Fehler rot, Knopftexte einzeilig auch bei 560 px), Anleitung über
Dialog und Register – im Browser und gegen den Server. **`addins-ordner.js`** (vorher `addins-ordner-169.js`) 17/17:
zusätzlich alte .md entfernt, `_privat.js` und Vorlage nicht geladen, kaputte Datei als Eintrag, `_versteckt.js`
abgelehnt. `addins-169.js` 60/60 (Beispiel .js entfällt, Vorlage mit 2 Beispielen).
Für 1.69: Browser **`addins-169.js`** 61/61 (`node tests/browser/addins-169.js <url>`): Register „Add-Ins“ und
Chemie/Reaktion vor „Hilfsmittel“ in allen vier Seitentypen; Strukturformel einfügen, gekennzeichnet, Doppelklick =
Editor, Rechtsklick-Eintrag, Fachwörter, Hilfe; Häkchen per Klick aus → Befehle/Gruppen/Kennzeichnung/Menü/Wörter/
Hilfe weg, Doppelklick = Grossansicht, gespeichert und nach Neuladen weiter aus; wieder an → alles zurück. Schnittstelle
2 mit einem Test-Add-In (eigenes Register nach Einfügen, Gruppe vor „Formen“, nur-Word-Gruppe, Häkchen, Menü, Symbol,
Taste Strg+Alt+Q, Stil, Wörter, Hilfe, Funktion, insertText/insertImage, imageRender/imageOpen, pageOpen,
selectionChange, Rechtsklick Fläche, überschriebener Befehl) und Ausschalten räumt alles weg; Fehler im setup, zu neue
`requires`, Datei ohne register; beide Beispiele **aus der KI-Vorlage selbst** und das Beispiel .js laufen; Add-In im
Stil von 1.66 (`tests/browser/addin-166-beispiel.js`, auch in `office-166.js`). Programm: **`addins-ordner-169.js`**
15/15 (`node tests/browser/addins-ordner-169.js <kt-linux>`): Ordner + Vorlage (CRLF), LIESMICH, Ordner-Add-In beim
Start geladen mit Hinweis, kaputte Datei gemeldet, Register mit Ordner öffnen, Vorlage abrufbar, aus → nach Neustart
aus, veränderte Vorlage erneuert, hinzufügen/neu laden/entfernen (→ `_entfernt`), ungültige Namen abgelehnt. Alle
Office-Tests 1.60–1.68 (165/166: Register-Listen um „Add-Ins“ ergänzt) und Chem-Tests laufen weiter.
Für 1.68: Browser **`office-168.js`** 27/27 (`node tests/browser/office-168.js <url> [ordner mit hello.pptx]`, ohne
Ordner mit einer neuen Präsentation): Formelleiste weg/da beim Seitenwechsel, geteilte Bereiche (PowerPoint schmal und
eingepasst, Excel behält Zoom und Leiste), Animationsbereich/Folienübersicht/Notizspalte/Word-Navigation ziehen
(gespeichert, Doppelklick = Standard), Fenster grösser → Folie füllt, Hochformat 820×1180 (kompakt: Knöpfe,
Einblendung), Menüband 32 Register bei 1100 px (keine zu hohe Gruppe, Namen sichtbar, Platz für den Balken, keine
doppelten Gruppen), iPhone 13: Word antippen = Schreibmarke, keine Lineale, Navigation als Einblendung, PowerPoint
Übersicht unten, Notizen-Knopf, Notiz gespeichert, Wischen = nächste Folie, Excel Formelleiste und Blattregister – im
Browser und gegen den Server des Programms. Alle Office-Tests 1.60–1.67 laufen weiter.
Für 1.67: Browser **`office-167.js`** 52/52: Word-Klick (rechter/linker Rand, weiterschreiben, Ziehen markiert,
Doppelklick ohne neues Feld), Seitenumbruch → Seite 2, ¶/Leerzeichen/Seitenumbruch-Beschriftung, Statusleiste „x von y
Wörtern · Zeichen“, Lineale + Rand ziehen → w:pgMar, Navigationsbereich springt, Entwurf (Abstand, Schriftart,
Seitenrand doppelt) in Anzeige und Datei, python-docx, LibreOffice 2 Seiten; Excel wächst beim Scrollen/mit Pfeiltaste,
Köpfe stehen, A1-Grenze, Textfeld über der Tabelle, Tabelle nicht löschbar, Bearbeitungsleiste bleibt, Formate/Rahmen/
bedingte Formate/Fixierung → openpyxl, Datei mit Formaten/Regel/Fixierung einlesen (unverändert byte-gleich),
Duplikate, Text in Spalten; PowerPoint Lernansicht Standard, Layouts mit Platzhaltern, Animationsbereich (Reihenfolge,
Früher, Auslöser), Notizen links, Normal (Abdeckung, Notizspalte, Rad), Ansicht je Seite nach Neuladen, Textfeld
aufziehen, an Folie ausrichten, Führungslinien/Raster, leere Platzhalter nicht in der Datei (python-pptx), Umstellung
älterer Seiten. `office-166.js` (Notizen jetzt in der Normalansicht-Spalte, Rad über der Folie) und `office-164.js`
(geänderte Seiten mit `Hist.touchPage` speichern – vorher hing der Test an zufälligen Speichervorgängen) angepasst.
Für 1.66: Browser **`office-166.js`** 35/35: Register Übergänge/Animationen/Entwurf/Referenzen/Entwicklertools,
Übergang Schieben + Verblassen/Hineinfliegen → `p:transition`, `p:timing` mit presetID 10/2 und `bldLst` (LibreOffice
erkennt ooo-entrance-fade/fly-in und den Übergang), Vorführen in Schritten, Mausrad blättert, Notizbereich → neue
Notizenseite + Notizenmaster (python-pptx liest die Notiz), Word-Blätter mit Abstand, Lineal ab Rand und genau über dem
Blatt, Schreibbereich ohne Rahmen, keine PowerPoint-/Word-Leisten nach dem Seitenwechsel, Inhaltsverzeichnis mit
Füllpunkten (python-docx), Seitenfarbe + settings.xml, Add-In-Vorlage (=BRUTTO, =MITTELOHNENULL, Knopf), Makro
ausführen/aufzeichnen, Statusleiste Excel, Grammatik (Hervorhebung, Menü, Korrektur), Schriftart (DejaVu Serif aus der
Datei benannt), Wörterbuch .aff/.dic (Testisch: katzen ✓, hunden ✗) – im Browser und gegen den Server des Programms.
`office-165.js` (neue Register) angepasst, `office-160/164/165` laufen weiter. Microsoft Office: ungetestet.
Für 1.65: Browser **`office-165.js`** 32/32: Register je Seitentyp und zurück, + (darüber halten / Klick / Rechtsklick),
Neue-Seite-Knopf, Abschnitt-Menü, Word-Papier/Ränder/Fluss/Blätter wachsen, Statusleiste, Querformat + schmale Ränder,
Strg+Enter → Seitenumbruch, Bild im Text → Bild-Absatz (python-docx + LibreOffice ≥ 2 Seiten), Excel ein Blatt sichtbar/
Register/Raster/Formel über Blätter/neues Blatt mit Namen (openpyxl)/Blatt löschen, PowerPoint Übersicht/Miniatur-Klick/
Hintergrund/16:9 (Inhalte angepasst)/neue Folie, Datei-Fenster – im Browser und gegen den Server des Programms. `office-164.js` 42/42 und `office-160.js` 35/35 angepasst.
Für 1.61–1.64: Browser **`office-164.js`** 42/42 mit den Hello-World-Dateien des Users (`node tests/browser/office-164.js
<url> <ordner mit hello.pptx/.docx/.xlsx>`, die Dateien liegen nicht im Projekt; ohne Ordner 19 Prüfungen):
unverändert = Original (6 Dateien), Zuordnungen, Folien neu/löschen/duplizieren/verschieben, Feld bleibt auf seiner
Folie, Register, F5/Tasten/Zahl+Enter/B/Referentenansicht/Esc, Neu einlesen, geteilte Formel rechnet, neue Seiten je
Typ, Export-ZIP, nach Neuladen gleich – im Browser **und** gegen den Server des Programms; danach **`tests/office/check-edit.py`** (python-docx/-pptx, openpyxl,
LibreOffice → PDF/CSV): Texte/Läufe/Lage (genau +30 px), Duplikat, neue Folien, Notizen, Diagramm bleibt, Word-Absätze
und Original-Läufe, Listen mit Nummerierung, Tabelle, Bild, Kopfzeile, Excel-Werte/-Formeln (SUMME → SUM, ; → ,),
LibreOffice rechnet 188 und 12, Zahlenformat/Verbund/Diagramm bleiben, calcChain entfernt. `office-160.js` 35/35 an das
neue Modell angepasst. OneNote-/HTML-/KT-Export einer Seite mit allen drei Typen läuft. **Microsoft Office: ungetestet.**
Für 1.60: Node **`tests/office/ooxml-test.js`** 28/28 (unverändert speichern = byte-gleich, ein Teil geändert = nur
dieser anders, Reihenfolge bleibt, python-docx/-pptx/openpyxl und LibreOffice öffnen die Dateien, leere Pakete gültig;
Testdateien `tests/office/make-fixtures.py`, Prüfer `check.py`); Browser **`office-160.js`** 35/35 (drei Seiten über den
Import, Typen, Asset, gesperrt, Datei-Karte, Word-Überschrift/Formate/Liste/Tabelle/Bild/Kopfzeile/Reihenfolge, Excel
zwei Blätter, SUM = 12.6 auch blattübergreifend, Umlaute, PowerPoint Rahmen/Titel/Textfeld-Lage/4:3/Bild/
Diagramm-Platzhalter/Notizen, Export einzeln und als ZIP byte-gleich, Hinweis ohne Office-Seite, Anhang bleibt Anhang,
„Als Office-Seite öffnen“, Symbol in der Navigation, nach Neuladen alles da) – im Browser **und** gegen den Server des
Programms (`kt-linux --nowindow`, URL mit Token als Argument). **Microsoft Office: ungetestet.**
Für 1.59: Browser **`geteilt-159.js`** 13/13 (Markierung, Vorschau ziehen mit mittlerer Taste ohne Wechsel, Mausrad
ohne Wechsel, erster Klick hakt Checkliste ab und aktiviert, kein Doppelauslösen, Tastatur am aktiven Bereich; WebP
kleiner und unabhängig dekodiert Pixel-gleich, transparentes PNG bleibt, Einfügen speichert WebP).
Für 1.58: `datenbank-test.js` 2656/2656 (8 Abkömmlinge, genaue Suche, Unbekanntes bleibt unbekannt); Browser
**`chem-leisten.js`** 25/25 (Breiten ziehen, zuklappen, gemerkt, Doppelklick, Planen-Breite; Fenster passt und
Zeichenfläche nutzbar auf 760×520, Tablet, Handy hoch/quer) und alle bisherigen Browser-Tests.
Für 1.57: `tests/chem/synthese-test.js` 43/43 (Fischer vor DCC, Gefahren-Einstufung); Browser **`chem-fenster.js`**
10/10 (Ecke ziehen, gemerkt, gross, angedockt mit Seite daneben bedienbar, linker Rand, zeichnen, Schliessen gibt
Breite zurück), **`tabs-durchklick.js`** 6/6 (ein Klick in den anderen Bereich wählt dort sofort das Textfeld;
gegengeprüft: ohne Durchklick schlägt die Prüfung fehl) und alle bisherigen Browser-Tests.
Für 1.56: Node **`tests/chem/synthese-test.js`** 41/41 (jede Regel an einem Beispiel, Flags/„nur empfohlene“,
Grignard-Warnung, Paracetamol-Wege, Toluol → Ethylbenzoat, Benzaldehyd → 1-Phenylethanol, Mengen, Vorschrift,
Valenz aller Edukte), `datenbank-test.js` 2646/2646 (626 Vorlagen); Browser **`chem-planen.js`** 14/14 (Umschalter,
Ziel, Wege, Reaktion ändern, Mengen 2 mol, Schema einfügen, Edukt → Produkt erkannt und gefunden, zurück zu Zeichnen),
**`chem-gruppen.js`** 14/14, `chem-spektren-155.js` 18/18 (Kern nur im NMR-Reiter, MS-Auswahlfeld, Ion einfügen) und
alle bisherigen Browser-Tests (chem-analyse angepasst: erst Reiter NMR).
Für 1.55: Node `tests/chem/analyse-test.js` 137/137 (NMR-Beschriftung/Striche/Integral, IR-Carbonyl-Lagen und
Kennbanden, MS-Wege und Abbruchfolgen), **`tests/chem/nmr-referenz.js`** (¹H Ø 0,07 ppm über 176 Signale, ¹³C Ø 0,65 ppm
über 179 Signale, Signalzahl stimmt), `datenbank-test.js` 2606/2606 (618 Vorlagen); Browser
**`tests/browser/chem-spektren-155.js`** 15/15 (Schalter gemerkt, Strukturbild mit Buchstaben, MS-Karten, Abbruchfolge,
Klick auf Peak, IR-Tabelle) und alle bisherigen Browser-Tests.
Für 1.54: Node `tests/chem/analyse-test.js` 101/101 (dazu NMR 1. Ordnung/Dacheffekt, IR-Moden, MS-Basispeaks),
`datenbank-test.js` 1101/1101, `modelle-test.js` 84/84, Namen 119/75/41/50, `sheet/xl-test.js` 176/176,
`verweise-test.js` 32/32; Browser `tests/browser/tabelle-verschieben.js` 20/20 (Zeilen/Spalten ziehen, Strg = kopieren,
Alt+Umschalt+Pfeile, Formel zeigt auf angeklickte Zelle/ganze Spalte, Bereiche bleiben), `chem-reaktion.js` 17/17
(zwei Moleküle, Fokus, Pfeile/Elektronenpfeile/+/Text, Stufe, Kopieren/Einfügen, Menüband), `chem-spektren.js` 26/26,
`chem-analyse.js` 20/20, `fotomath-werkzeuge.js` 18/18.
Für 1.53: Node `tests/chem/analyse-test.js` 73/73 (dazu ¹⁹F/³¹P/¹⁵N, Ausschnitte, eigenständiges Bild),
`tests/chem/datenbank-test.js` 1101/1101 (317 Vorlagen: lesbar, keine Valenzfehler, neue Formeln, R/S, wiedererkannt);
Browser `tests/browser/chem-spektren.js` 26/26 (Mausrad, Doppelklick, Bereich ziehen, Knöpfe, ¹³C/¹⁹F wählen und nach
erneutem Öffnen gemerkt, PNG/SVG-Download, in die Seite, Test-Stoffliste laden → ZVG-Link, DMF über N,N-Name, H⁺ in
Lewis → O⁻ und in Keil/Strich sichtbar, pack/unpack, Radikal-Punkt, Wiederherstellen, alte Zeichnung → Ladung, neue
Vorlagen/Kategorien), `chem-analyse.js` 20/20 und `fotomath-werkzeuge.js` 18/18; alle Node-Tests wie bei 1.52.
Für 1.52 (Neuaufbau aus dem Quellcode-ZIP – die alten Browser-Testskripte v1xx/ waren nicht mehr da; neue liegen
jetzt im Projekt unter `tests/browser/`): Node `tests/mathink/schlampig-test.js` (Ziel erreicht: Stufe 0,6 98,5 %,
Stufe 1 96,7 % Zeichen / 72,5 % Rechnungen), `werkzeuge-test.js` 295/295, `mathink-test.js` 400/400 + 72/72,
`bitmap-test.js` 155/168 (wie vorher), `aufloesen-test.js` 40/40, `rechenweg-test.js` 27/27,
`tests/chem/analyse-test.js` 60/60, `logp-anpassen.js --pruefen` (Fehler 0,27), `modelle-test.js` 84/84, Namen
119/75/41/50; Browser `tests/browser/fotomath-werkzeuge.js` 18/18 (Werkzeuge, Ableiten mit Rechenweg und Graph,
Kurvendiskussion, Fläche 0..2 von x³ − 3x = −2, LGS getippt und als zwei Zeilen Handschrift, Ungleichung, ggT,
d/dx- und ∫-Befehle, f(x) = …, Graph zur Gleichung, Primfaktoren, Ergebnis/Graph einfügen, Rechenweg als Text) und
`tests/browser/chem-analyse.js` 20/20 (SMILES laden, Kennzahlen, Gruppen, vier Spektren, GESTIS-Links, 3D-Stile,
Messen per Klick, Drehen, Molfile laden, Einfügen); `go test` ok. `tests/contrast` 82/1 wie bei 1.51.
Für 1.51 (`v151/t151.py`, 9): dunkles Design – grüner Marker auf weissem Bild sichtbar (Pixel), Ebene `normal`;
Kugelschreiber-Klick bei gemischter Auswahl färbt nur Schrift, Auswahl bleibt; Textmarker-Klick nur Markierungen;
Stift-Menü-Farbe nur diese Art; Rückgängig; ohne Auswahl wie bisher.
Für 1.50 (`v150/dock.py`, 16): Fenster links (Kompass) = links daneben, unten = darunter, Mitte = als Tab, an den
rechten Rand = rechte Hälfte; Tab an den oberen Rand = darüber, an den unteren Rand der Fläche = untere Hälfte, Mitte =
Fenster; neben dem Kompass losgelassen = bleibt schwebend; Kompass mit 5 Feldern; keine Tabs verloren; Vollbild:
Kachel lösen und rechts an eine Kachel andocken; Stift-Knopf ≥ 110 × 32 px.
Für 1.49 (`v149/`: `dnd.py` 5 – Maus mit Ziel am Rand, Toleranz Lücke/neben der Liste, Finger halten + ziehen;
`btn.py` 16 – Knopf auf allen Registern rechts, Stift/Auswählen/letztes Werkzeug, Vollbild, Handy; `float.py` 16 –
Tab auf die Mitte = Fenster, beliebig viele, Hauptbereich behält einen, verschieben, Grösse, Klick aktiviert, Neuladen,
Andocken per Knopf und per Ziehen auf die Tableiste, Vollbild-Kachel wegziehen, Tabs danach vollständig, Handy füllt;
`chem.py` 11 – Lewis-H anklicken/entfernen/ersetzen/ziehen/Menü, Hückel; `dark.py` 4; Node `modelle-test.js` 84 mit
Sessel/Decalin/Benzol/Umschlag/äquatorial/gestaffelt/Regeln/hd). `t135.py` prüft das Violett jetzt im hellen Design.
Für 1.48 (Browser, 10, `v146/t148.py`): Strg+A + Rechtsklick auf Bild/Text/Zeichnung → vier Einträge; nur Text, dann
Zeichnung, dann Bild in den Hintergrund, Häkchen je Art, „Alles“ löst alles, einzelnes Bild nur „Bild als
Hintergrund“; `t145.py` und `bg/bg1.py` auf die neuen Bezeichnungen angepasst.
Für 1.47 (Browser, 9, `v146/t147.py`): Strg+A alles, als Hintergrund → bleibt markiert, ziehen/Pfeiltasten ohne
Wirkung (Bild, Text, Zeichnung), Strg+A wählt Hintergrund, Esc abwählen, einzeln anklickbar, Auswahlrahmen wählt sie.
Für 1.46 (Browser, 12, `t146.py`): Bild in `#layer-pics`, Text in `#layer-boxes`, Ebenen-Reihenfolge; Zeichnung
„hinter dem Text“ über dem Bild anklickbar; Rechtsklick Bild → „Vor die Zeichnungen“ (liegt oben, Klick wählt das
Bild); Text vor/hinter die Zeichnungen; Strg+Z; nach Neuladen gleich.
Für 1.45 (Browser, 14, `t145.py`): Strg+A + Rechtsklick auf Bild/Feld/Zeichnung → Eintrag „(7)“, alle im
Hintergrund (auch Paket-Inhalte und Zeichnungen); ein Bild allein → nur dieses; Häkchen weg → alle gelöst; Schrift im
Hintergrund: ziehen, Pfeiltasten, Entf ohne Wirkung; alles markiert + Entf/verschieben ohne Wirkung; gelöst → löschbar.
Für 1.42 (Browser, `t142.py` 5 + `t142b.py`): neu dunkel, wöchentlich/2 Backups, Sprachen Französisch/Latein,
Hell bleibt nach Neuladen; Elision mit kleinem Testwörterbuch (l'homme, d’accord, qu'homme richtig, l'hommx falsch).
Für 1.41 (Browser, 13, `t141.py`, Desktop + Pixel 7): Register anklicken klappt herunter, bleibt offen mit der Maus darauf,
kurz weg und zurück bleibt offen, Maus weg → zu, gleiches Register nochmals → zu, Handy daneben tippen → zu, Pfeilchen
dauerhaft; `t140.py` angepasst.
Für 1.40 (Browser, 32, `t140.py`, Desktop + Pixel 7): Menüband eingeklappt, Register wählt nur aus, Doppelklick klappt
nicht auf, Pfeilchen klappt auf; Tableiste eingeklappt, Maus in der Nähe ohne Wirkung, Pfeilchen klappt auf; Vollbild:
Pfeilchen oben sichtbar, Maus am Rand ohne Wirkung, Einblenden/Ausblenden, normales Menüband bleibt aufgeklappt, Kacheln
mit ⌃/Strich, ⤢ ganz rechts, Strg+F1; `t136.py` an das neue Verhalten angepasst.
Für 1.39 (Go `TestOptimizeStorage`: drei Kopien → zwei Verknüpfungen, Eingang einsortiert, alte .tmp weg, Belegung
einmal gezählt, eine Verknüpfung gelöscht → andere heil, Abschnitt herauskopiert vollständig, zweites Backup verknüpft
unveränderte Abschnitte, geänderten nicht, erstes Backup gelöscht → zweites vollständig; Programm (Linux-Build):
/api/beenden → `optimiert.json`, Bilder mit Linkzahl 2; Einstellungen → Speicher: Jetzt optimieren, Ergebnis-Zeile;
Nachtrag: zweiter Lauf ohne Änderung tut nichts, nur neue Kopien werden verglichen, Stopp-Bitte → unterbrochen und
danach nachgeholt; Programm: Schliessen + sofort neu starten → nach 50 ms unterbrochen, neues Programm lädt normal,
nächstes Schliessen macht fertig; Webseite Desktop + iPhone: Speicherort-Angaben).
Für 1.38 (Browser, 22, `t138.py`; Node: `spell-test.js` 38, `rechenweg-test.js` 27, Bild-Test 155/168 statt 151; Go:
`TestDictDownloadAndCache`): Wörterbücher (Test: echtes en_US + kleines deutsches Testwörterbuch über abgefangene
Netzadressen) geladen, Browser-Prüfung aus; Fehler unterwellt, nicht angestrichen: richtige Wörter, CO2, pH, Adressen,
Code, Links, Fachwörter, HTML unverändert; Rechtsklick → Vorschlag zuoberst, übernommen, Strg+Z; Zum Wörterbuch
hinzufügen; Wort an der Schreibmarke erst danach; F7: erster Fehler markiert, Vorschläge, Ändern → nächster, Alle
ignorieren / Ignorieren → abgeschlossen; Register Überprüfen; Einstellungen → Sprache (Englisch abwählen → englische
Wörter angestrichen); Fotomath 2x+3=11 mit Rechenweg (| −3, | :2), „Mit Rechenweg“ als Text, „Ergebnis“ mit
Tastaturzeichen, Häkchen gemerkt; ohne Netz → Browser-Prüfung, Zustand nennt den Grund. Programm (Linux-Build,
KT_DICT_BASE auf einen lokalen Server): Wörterbücher über /api/woerterbuch geladen und in Cache/Woerterbuch abgelegt,
Fehler angestrichen.
Für 1.37 (Browser, 16, `t137.py`): ein Tab → Vollbild wie bisher; vier Tabs in zwei Bereichen → F11 zeigt vier
Kacheln (2 × 2) mit Titel und ⤢ oben rechts, alle mit ihrer Seite, gespeicherte Tabs unverändert; Klick in eine
Kachel = dort arbeiten; ⤢ = nur dieser Tab, oben die übrigen wählbar, anderer Tab bleibt einzeln, ⤡ = zurück;
Teilen gesperrt mit Hinweis; F11 beendet: zwei Bereiche, vier Tabs, die im Vollbild geöffnete Seite in ihrem Tab.
iPhone 13: drei Kacheln, Pfeile ≥ 38 px, ⤢/⤡ antippen. `t135.py` auf das neue Vollbild umgestellt.
Für 1.36 (Browser, 32, `t136.py`): Titel nur im Tab; + = Kopie des Tabs, Rechtsklick auf + = Auswahl; neue Seite →
Titel im Tab tippen, Enter (Tab und Seitenliste); Doppelklick auf anderen Tab wechselt und bearbeitet, Esc bricht ab;
Tab-Menü Umbenennen/Datum; Einklappen (Strich ≤ 6 px, Pfeilchen, Seite rückt hoch); Maus in die Nähe → fährt über
der Seite aus, Seite bleibt stehen, bleibt offen auf den Tabs, Maus weg → zu; Pfeilchen-Klick; ⌄ heftet an; bleibt
nach Neuladen; Menüband zeigt den Zustand; Einstellungen → Speicher: Speicherort mit Adresse und Backup-Ort;
„Seitentitel über der Seite“ holt ihn zurück; 13 Erste-Schritte-Seiten in fester Reihenfolge, alle mit Inhalt,
Formeln gesetzt; „Alle Erste-Schritte-Seiten“ frischt Unverändertes auf, lässt Bearbeitetes, ergänzt Fehlendes
(Strg+Z); Datei → Hilfe mit Kachel je Seite. iPhone 13: ein Tab → Titel über der Seite; zwei Tabs → nur im Tab;
eingeklappt: Pfeilchen ≥ 48 × 18, Antippen (auch knapp daneben) fährt aus, Tab antippen, Tippen auf die Seite fährt
ein. Programm (Linux-Build): Speicherort zeigt die Pfade von Saves/Cache/Backups/Papierkorb/Programm.
Für 1.35 (Browser, 28, `t135.py`): ein Bereich/ein Tab beim Start; Violett `#5b3fa6`; Mittelklick in der Liste =
neuer Tab; Tab anklicken; Seite wählen ersetzt den Tab; „Rechts daneben öffnen“ → zwei gleich breite Bereiche,
Vorschau mit allen Textfeldern; Klick in die Vorschau wechselt den Bereich; dieselbe Seite in zwei Bereichen: Getipptes
erscheint in der Vorschau, Verlauf unberührt; Trennlinie ziehen; Tab an den unteren Rand ziehen → unten geteilt;
gelöschte Seite verschwindet aus den Tabs; Mausrad über Vorschau; Vollbild nur aktiver Bereich; nach Neuladen gleiche
Bereiche, Vorschauen aufgebaut; ⋮ → Bereich schliessen / Nur diesen behalten; + → Neue Seite in neuem Tab; Menüband
aller Register: grosse Knöpfe = 3 Zeilen, Zeilen 24 px, Gruppennamen auf einer Linie. iPhone 13 (Touch): Tableiste
erst ab zwei Tabs, nur aktiver Bereich, Tabs aller Bereiche, Ziele ≥ 32/38 px, Tab eines anderen Bereichs antippen,
× antippen, Menüband einheitlich mit Zeilen ≥ 30 px. Alle bisherigen Tests erneut (gleich wie 1.34).
Für 1.34 (Browser, 13): Datei öffnet das Fenster (Informationen), Register darunter bleibt; Esc und Zurück-Pfeil
schliessen; Neu → Unterseite; Exportieren mit Abschnitt + Webseite → Export-Dialog mit Format Webseite und allen
Seiten des Abschnitts; Optionen → Einstellungen; Notizbuch über „Einstellungen“ schliessen und unter „Öffnen“ wieder
öffnen; alle Funktionen des alten Registers erreichbar; Handy (Leiste oben, kein Überlaufen); Klick auf den
Vollbild-Hinweis beendet das Vollbild, ohne ein Textfeld anzulegen. Alte Tests auf das Datei-Fenster umgestellt
(auto/auto.py, auto/phone.py, miss/m2.py – Letzterer lief seit dem Umbau des Import-Knopfs nicht mehr).
Für 1.33: `go test` (neu `TestAssetsPerSection`: Altbestand den Abschnitten zugeordnet, Eingang leer, Speichern
legt neues Bild in den Abschnitt, Verschieben einer Seite nimmt ihre Bilder mit, Pflege nimmt Ungebrauchtes heraus,
Abschnitt löschen → Bilder im Papierkorb, Rückgängig holt sie zurück, Backup mit Bildern, kopierter Abschnitt-Ordner
in frischem Saves: Bilder gefunden). Programm (Linux-Build) mit der Sicherung „AM (Mathe)“ im Format bis 1.32:
nach dem Start 0 Bilder im Eingang, 44 Abschnitt-Ordner mit 483 Bildern, jede Seite findet alle ihre Bilder im
eigenen Abschnitt (483/483), alle 278 über den Server abrufbar, neu eingefügtes Bild landet nach dem Speichern im
Abschnitt der Seite; Backup: 484 Bilder, keine geteilten; einen Abschnitt-Ordner in ein leeres Saves kopiert → das
Programm zeigt ihn mit Bildern. 1.25-Programmtest (Backup laden/erstellen/ersetzen, interaktive Datei, altes ZIP,
Aufbewahren) wie bisher.
Für 1.32: `go test` (neu `TestReadPageHead`: Kopf vorne/hinten, Text mit "id" darin, kein Objekt),
`node tests/store/verlauf-test.js` (21, neu: nachgeladener Verlauf alt vor neu). Browser mit erzeugten Daten
(4 Notizbücher, 138 Abschnitte, 2483 Seiten, ~120 MB, `tests/perf/gen-grosse-daten.py`, 8): mit verlangsamtem Nachladen alle
500 Einträge der Seitenliste da, obwohl erst 1 Seite geladen ist; Register „Zeichnen“ und dunkles Design schon vor der
Antwort des Speichers; Seite 500 angeklickt → sofort offen; Hinweis mit Datum beim Darüberfahren; Einrücken einer
Seite, deren Abschnitt noch lädt; Verlauf nachgeladen (alter Schritt vor dem neuen); alle Seiten gleich wie auf
einmal geladen; Kopfangaben für alle gespeichert. 1.31-Test (8) mit Daten ohne Kopfangaben: Seitenliste ergänzt sich
vor dem Ende. Programm: bedienbar nach ~0,25 s, Änderung während des Ladens gespeichert, Dateinamen unverändert.
Für 1.31 (Laden in Stufen, Browser 7): mit verlangsamtem Nachladen bedienbar, bevor alles da ist (Baum, Seitenliste,
offene Seite; 220 von 234 noch unterwegs), Abschnitt eines anderen Notizbuchs gewählt → vorgezogen und offen,
Suchen wartet und öffnet danach, alle 234 Seiten gleich wie auf einmal geladen, Strg+Z gleich nach dem Neuladen
wartet und nimmt den gespeicherten Schritt zurück, dunkles Design schon beim ersten Bild. Programm (EXE-Server mit
der Sicherung „AM (Mathe)“, 328 Dateien): bedienbar nach ~1 s, alles nach ~2 s, Änderung während des Ladens
gespeichert, alle Dateinamen unverändert. Alle bisherigen Tests wie bei 1.30.
Für 1.30: `node tests/store/verlauf-test.js` (20, neu: Schnappschuss in Stücken = snapPage, commit mit neuem Datum
= snapPage). Browser Drucken (9): Massstab zeigt den Anpassen-Massstab, Schieber setzt „Eigene Grösse“ 50 %, Links
5 cm → Bereich 189 px schmaler, obere Kante in der Vorschau nach oben ziehen → −3,1 cm, Druckdokument gleich der
Vorschau, PDF (Chromium) ohne das abgeschnittene Feld, gemerkt wird der Massstab, nicht der Bereich. Sichtbereich
(11): 1500 Striche → 120 im DOM, nach dem Scrollen alle sichtbaren da, bei 5 % alle, hineingezoomt wieder wenige,
Auswahl aller, Export/Druck mit allen 1500, Strich zeichnen + rückgängig. Leistung mit der echten Sicherung „AM
(Mathe)“ (234 Seiten, Seite mit 2709 Strichen): Start-Aufgaben über 50 ms nach dem Laden 5 × 200–400 ms → keine
(nur noch das Einlesen aus IndexedDB vor der Anzeige); Seitenwechsel höchstens 249 → 145 ms; Import der Sicherung
15 s → 2,3 s, interaktive Datei/ZIP 4 s. Handy (iPhone 13 simuliert): alle Dialoge ohne waagrechtes Überlaufen,
Druckdialog, Webseite: Schublade auf/zu, Seite wählen schliesst sie, Zoom passt auf die Breite (42 %), + = 53 %,
Hauptbereich scrollt. Alle bisherigen Browser-Tests wie bei 1.29.
Für 1.29 Webseite (20, eine und mehrere Seiten): Zoom-Leiste, + zweimal = 156 %, Strg+Mausrad bis 1 % und bis
1000 % (Browser-Zoom bleibt 1), Strg+0/Minus, an die Breite anpassen, Drucken mit 100 % ohne Leiste.
Für 1.29 zusätzlich im Browser (10): Strg+Minus bis 1 %, Strg+Plus bis 1000 %, Strg+Mausrad unter 15 %, Regler
0/333/667/1000 → 1/10/100/1000 %, Hintergrundraster bei 1 % mind. 8 px, Ansicht 2 % bleibt nach dem Neuladen.
Für 1.28 zusätzlich: `node tests/chem/modelle-test.js` (70: Konfigurationen inkl. Ausnahmen und Ionen, Schalen,
Valenz, freie Paare/Hybridisierung (Wasser, Ammoniak, Ethen, CO₂, NH₄⁺), Elektronenbilanz, alle Darstellungen für
fünf Strukturen als gültiges SVG, Bohr zählt 10 bzw. 18 Elektronen, Kästchen nach Hund, 3D: Methan 1,07 Å und
Tetraeder, Wasser gewinkelt, Benzol eben, Cyclohexan gefaltet). Im Browser (14): Vollbild (Menüband am Rand ein,
darauf bleibt es, weg davon verschwindet es), Chem-Draw alle fünf Darstellungen, 3D drehen, Klick zeichnet nicht,
Kalotten/Elektronenwolke, auf die Seite und wieder öffnen. Alle bisherigen Browser-Tests wie bei 1.27.
Für 1.27 zusätzlich: `node tests/mathink/aufloesen-test.js` (40: 25 Formeln umstellen – U = R·I, Linsengleichung,
Mitternachtsformel, Potenz/Logarithmus, Wurzel, (x + a)² = b … – jede Lösung mit Zufallswerten in die Gleichung
eingesetzt; TeX, keine reelle Lösung, Unbekannte fehlt). Im Browser (20): Wiedergabe weg, Lineal füllt den
Bildschirm, 1 cm = 37,8 px bzw. grösser bei verkleinertem Druck, Griff ziehen/zweimal drücken, Winkelmesser,
Abschnittsgruppe per Klick auf/zu und Doppelklick umbenennen, Fotomath „Auflösen nach“ (Knöpfe, U = R·I nach I,
2x + 3y = 12 nach y, nur y, quadratisch, Mitternachtsformel als Formel einfügen). Alle bisherigen Browser-Tests wie
bei 1.26.
Für 1.26 zusätzlich: `node tests/sheet/verweise-test.js` (32: `[Seite]Tabelle!A1`, Abschnitt/Seite, gleichnamige
Seiten, nur Abhängiges neu – auch über Seiten und Umwege –, flüchtige, manuell, ganze Spalten, Kreisbezug über
Seiten, Umschreiben), `node tests/draw/pfad-test.js` (3201: kompakte Pfade = dieselbe Form wie bis 1.25, halb so
lang), `node tests/backup/ktfile-test.js` (61, neu Base-122: alle Grössen/Bytes, gültiges UTF-8, ohne störende
Zeichen, Dateien aus 1.25 lesbar). Im Browser (Playwright): Tabellen über Seiten (27: Werte, nur 2 Formeln neu
gerechnet nach einer Änderung, Umbenennen von Seite/Tabelle, Zeile einfügen, Rückgängig, Verknüpfung einfügen,
Vorschläge nach `[`, manuell + F9, Diagramm nur bei Änderung im Bereich, Kette über 60 Seiten), Drucken + Kopieren/
Einfügen (30: Blätter = PDF-Seiten, A4 hoch/quer, ganze Seite auf ein Blatt, breite Seite auf mehrere Blätter,
Abschnitt mit durchgehenden Seitenzahlen, Tabelle mit wiederholter Kopfzeile, Bereich, Auswahl; Abschnitt/Gruppe/
Notizbuch/Seiten kopieren und einfügen, Namen, Rückgängig, Bezüge in der Kopie), echte Daten „AM (Mathe)“
(interaktive Datei öffnen und Inhalt gleich, Webseite: jedes Bild einmal, alle Bilder sichtbar). Alle bisherigen
Browser-Tests wie bei 1.24. **Nicht getestet (1.26):** Drucken auf einem echten Drucker (geprüft mit Chromiums
PDF-Ausgabe, derselben Druck-Engine), die EXE auf echtem Windows (WebView2 druckt über denselben Weg).
Für 1.23 zusätzlich: `node tests/build/kompakt-test.js` (32 Dateien: gleicher Syntaxbaum nach dem Verkleinern);
Ende-zu-Ende die Skripte aus der gebauten index.html gegen die Quellen verglichen (31 Skripte gleich); CSSOM des
verkleinerten CSS gleich dem Original (1208 Regeln); alle Node-Tests und alle Browser-Tests gegen die verkleinerte
Datei (wie bei 1.22 scheitern nur die 15 veralteten Skripte, die auch mit 1.20 scheitern); Ladezeit gemessen.
**Nicht getestet (1.22):** das Öffnen in **echtem OneNote** (wieder nicht verfügbar) – die Ursache von „Seite kann
nicht geöffnet werden“ ist ein klarer MUSS-Verstoss, die Seiten gleichen jetzt Byte für Byte im Aufbau den echten.
Das Drucken über den echten Druckdialog (getestet mit Chromiums PDF-Ausgabe, derselben Druck-Engine).
**Nicht getestet (1.21):** das Öffnen in **echtem OneNote** (gibt es in der Testumgebung nicht) – geprüft ist gegen
die Spezifikation und gegen echte OneNote-Dateien. Falls OneNote einen Abschnitt weiterhin ablehnt: die Datei mit
`onecheck` prüfen und mit einer in OneNote gespeicherten Kopie vergleichen.
**Nicht getestet (1.20):** der Absturz auf dem Gerät des Users selbst (Datei lag nicht bei) – der Dialog nach dem
nächsten Absturz zeigt jetzt, wo es war; die Desktop-Version (unverändert mit Papierkorb-Ordner).
**Nicht getestet (1.19):** die echte 1.7-GB-Datei des Users, ein mit WinRAR **wirklich komprimiertes** grosses
Archiv (kein RAR-Packer im Sandbox – der Entpack-Weg ist derselbe, nur die Daten sind anders), node-unrar-js direkt
von jsDelivr (im Sandbox gesperrt; der Nachbau ist aus denselben Quellen), Firefox/Safari (Modul-Worker ab
Firefox 114 / Safari 15).
**Nicht getestet (frühere Versionen):** die echte Datei **„Wohnen“** (lag nicht bei – nachgebaut), ob **echtes OneNote** die
neu geschriebenen **Dateianhänge** (ohne Symbolbild) annimmt, **das echte PDF.js-Rendern** und das **RAR-Entpacken** (node-unrar-js) – beide
laden aus dem Internet, das im Sandbox gesperrt ist; auf dem Rechner des Users mit Internet sollten sie
laufen (bitte ausprobieren). ZIP-Archive und das ganze Drumherum sind getestet. **OneNote-Export in echtem OneNote** (auch nicht die neuen Tabellen und ob
OneNote den Alternativtext des 1×1-Bildes unverändert lässt), das Abspielen von YouTube (kein Internet in der Testumgebung), die EXE auf einem echten Windows, Firefox und Safari (auch iPhone/iPad-Safari), echte Stifte
(Druck, Radierer-Taste) und **echte Handys/Tablets** (nur emuliert; Bildschirmtastatur nur über
kleinere Fensterhöhe nachgestellt), sowie „Freihand → Text“ end-to-end (die
Testumgebung kommt nicht an cdn.jsdelivr.net).

---

## 10. Bekannte Grenzen

- **Office 1.75:** Fussnoten stehen am Ende des Dokuments (nicht unten auf jeder Seite); Textspalten (`w:cols`) werden
  einspaltig gezeigt; Diagramme/SmartArt/Gruppen/Excel-Bilder sind Anzeige (nicht bearbeitbar, die Datei behält sie;
  Diagrammtypen Radar/Kurs/Blase vereinfacht, 3D flach); SmartArt ohne gespeicherte Zeichnung nur als Textliste;
  Kopfzeilen-Bilder nur Anzeige (Kopfzeile bearbeiten schreibt den Text wie bisher). Die Suche oben findet keine
  Galerie-Einträge (Formatvorlagen-/Farbkataloge) und keine Inhalte von Fenstern. Weiter offen (Excel/PowerPoint,
  „Bekannte Grenzen → Office 1.72“): PivotTable, Sparklines, Teilergebnis, Namensmanager, Folienmaster, Abschnitte,
  Kommentare, Animationspfade. **Microsoft Office selbst: ungetestet.**
- **Word 1.74:** Seitenumbruch und Zeilenfall sind sehr nah an Word, aber nicht identisch (andere Schriften, wenn
  Calibri/Aptos fehlen; keine Silbentrennung wie Word; Witwen-/Waisenkontrolle nur für Überschriften; Abstand vor am
  Seitenanfang bleibt). Seit 1.75 da: Bilder in Tabellenzellen, Kopf-/Fusszeilen-Bilder, Gruppen/Diagramme/SmartArt,
  Fussnoten (am Ende), Textfeldhöhe. Verankerte Bilder relativ zur Seite mit Umfliessen stehen oben am Absatz. Bearbeitete Absätze verlieren Verweise
  (wie bisher Links). Inhaltsverzeichnis: Einträge nicht bearbeitbar (Word aktualisiert sie). Seitenansicht nur
  lesen. **Microsoft Office selbst: ungetestet.**
- **Office 1.73:** Designs schreiben nur Farb- und Schriftschema (keine Effekte, keine Varianten/Hintergrundstile);
  Word zeigt Designschriften in KnowledgeTree nicht überall (Text mit festen Schriften). Lesemodus ohne Bearbeiten,
  Gliederungsansicht nur lesen. Schnellzugriff nur für Knöpfe mit Befehl (nicht für Menüs/Kataloge). Kontextregister
  „Bildformat“/„Formformat“ gibt es nicht (Bilder: Rahmen/Grösse wie bisher direkt am Bild).
- **Office 1.72 – bewusst (noch) nicht:** Word: Fussnoten/Endnoten, Kommentare, Änderungen nachverfolgen, Vergleichen,
  Spalten, Abstand vor/nach je Absatz einstellen (seit 1.74 aus der Datei angezeigt), Überschrift 4–6 im Menüband, Zeilennummern, Deckblatt, Querverweise, Beschriftungen,
  Literatur, Index, WordArt/SmartArt; Kopf-/Fusszeile nur die Standard-Kopfzeile des letzten Abschnitts (erste Seite/
  gerade Seiten abweichend: Hinweis), als Text mit Ausrichtung (Bilder darin bleiben, Tabellen/Tabstopps vereinfacht).
  Excel: PivotTable, Sparklines, echte Tabellen (`tableParts`; „Als Tabelle formatieren“ setzt Formate + Filter),
  Gruppieren/Gliederung, Teilergebnis, Konsolidieren, Blitzvorschau, Namensmanager, Szenarien, verknüpfte (365-)Kommentare
  (werden beim Ändern von Notizen zu Notizen), Arbeitsmappe schützen, Farb-/Top-10-Filter (bleiben, nur nicht
  bearbeitbar). Drucken: Kopf-/Fusszeile des Blatts nicht in der Vorschau. PowerPoint: Tabellen/Diagramme/SmartArt/
  Video einfügen, Designs/Varianten, Folienmaster, Abschnitte, Kommentare, Animationspfade, Trigger, Probelauf;
  Kopf-/Fusszeile als Textfelder (nicht als Platzhalter). Alle Übergänge sehen in KnowledgeTree ähnlich, nicht
  gleich aus. **Microsoft Office selbst: ungetestet** – geprüft mit LibreOffice, openpyxl, python-docx, python-pptx.
- **Excel/Formate 1.71:** Gespeichert als .xls (Excel 97–2003) werden Formeln zu Ergebnissen (Hinweis); bedingte Formate,
  Auswahllisten und Diagramme gehen nicht in .xls/.ods. Import .doc nur Text/Absätze (ohne Formatierung und Bilder),
  .ppt nur Texte je Folie (ohne Bilder/Formen), .rtf ohne Bilder, .odp ohne Formen. Verschlüsselte .xls/.doc werden
  abgelehnt. Verbundene Zellen: Bearbeiten/Einfügen von Zeilen verschiebt die Bereiche nicht (die Datei behält sie).
  Ausgeblendete Zeilen/Spalten lassen sich noch nicht über das Menü einblenden. Microsoft Office selbst ist ungetestet
  (geprüft mit LibreOffice und mit dem eigenen Leser).
- **Add-Ins 1.70:** Sehr viele Add-Ins machen die Gruppe „Ein / aus“ breit (je 4 pro Spalte, das Band scrollt
  waagrecht). Die Vorlage im Ordner wird bei jedem Start überschrieben (gewollt).
- **Add-Ins 1.69:** Add-Ins laufen ohne Sandkasten mit allen Rechten von KnowledgeTree (Hinweis im Dialog und in der
  KI-Vorlage). Was ein Add-In am Schnittstellen-Objekt vorbei direkt ins DOM hängt, muss es selbst aufräumen. Ordner-
  Add-Ins werden beim Start und mit „Neu laden“ gelesen, nicht laufend beobachtet. Eine KI-Antwort ist nicht
  automatisch richtig – die Prüfliste in der Vorlage und „Verwalten“ (Fehler) helfen. Chem-Draw-Editor (`chem*.js`)
  bleibt fest im Programm; nur seine Einbindung ist ein Add-In. Tastenkürzel der Add-Ins wirken nicht in Dialogen.

- **Office-Seiten 1.68:** Ziehgriffe ändern Breiten, nicht Höhen (die Leisten nutzen die ganze Höhe). Die Stufen
  „kompakt/schmal“ richten sich nach der Breite des Bereichs, nicht nach dem Gerät. Wischen gibt es nur in der
  PowerPoint-Normalansicht; Lernansicht und Word scrollen mit dem Finger frei.

- **Office-Seiten 1.67:** Excel-Raster bis 10’000 Zeilen × 200 Spalten (darüber hinaus bleibt die Datei unverändert);
  sehr grosse Blätter zeichnen alle Zellen (kein virtuelles Scrollen). Bedingte Formate: nur die genannten Regeln,
  Farbskalen/Datenbalken mit festen Farben (beim Ändern werden gelesene Regeln mit den nächsten Vorlagen-Farben neu
  geschrieben). Zellformate: Design-Farben (theme) werden nicht gelesen. Word: Entwurf-Schriftart ändert nur den
  Standard-Text (nicht Überschriften), Seitenränder immer 24 pt vom Papierrand; Einzüge im Lineal nur angezeigt.
  PowerPoint: Folienlayouts sind Textfelder (keine echten Platzhalter des Folienmasters). Microsoft Office selbst ist
  ungetestet.

- **Office-Seiten 1.66:** Animationen nur als **Eintrittseffekte** (Hervorheben/Beenden/Pfade aus der Datei bleiben
  erhalten, werden aber nicht abgespielt und beim Ändern der Animationen einer Folie verworfen – Hinweis); Übergänge
  ohne Richtungswahl. Grammatik = einfache Regeln, kein Ersatz für eine Grammatikprüfung wie in Word. Makros sind
  JavaScript (kein VBA), Add-Ins haben alle Rechte der Seite. Eigene Schriftarten werden nicht in Office-Dateien
  eingebettet. Word-Seitenumbrüche entsprechen der Anzeige in KnowledgeTree, nicht zwingend Word (andere
  Schriftmetrik). **Microsoft Office selbst ist ungetestet** (geprüft mit python-docx/-pptx, openpyxl, LibreOffice).

- **Löschen (1.20, Webseite):** kein Papierkorb mehr für neu Gelöschtes – nur Strg+Z (grosse Schritte über 8 Mio.
  Zeichen nur bis zum Neuladen). Wer länger etwas aufbewahren will: Backup. Seitenversionen gelöschter Seiten
  verschwinden mit. Desktop unverändert (Papierkorb-Ordner).
- **Grosse Dateien (1.18):** Ein **einzelner** `.one`-Abschnitt muss ganz in den Speicher passen (das Format
  braucht wahlfreien Zugriff) – bei einem Abschnitt über ~1 GB kann der Browser trotzdem aussteigen. RAR-Archive
  werden seit 1.19 stückweise gelesen; nur im Rückfallweg ohne Worker kommt das Archiv einmal ganz in den Speicher
  (dann sind etwa 2 GB nötig, über 2 GB lehnt der Browser ab → Hinweis „als ZIP speichern“). Der Platz in IndexedDB ist vom Browser begrenzt (meist ein Teil des
  freien Speichers): wird er voll, hält der Import mit Meldung an. Grosse PDFs kommen in Teilen. Ein abgebrochener
  oder vor 1.18 abgestürzter Import ist unvollständig – Teil-Notizbuch löschen und neu importieren. Sehr grosse
  Import-Schritte sind nur in der laufenden Sitzung rückgängig zu machen (nicht nach Neuladen). Chromium behält
  nach einem Export einen Teil des Renderer-Speichers als Zwischenspeicher, gibt ihn aber bei Bedarf frei.
- **Bereits importierte Abschnitte (vor 1.16)** aus oft gespeicherten OneNote-Dateien sind auf einem alten
  Stand importiert (fehlende Seiten, XPS-Chips statt Ausdrucken, „ungültige“ Anhänge) – sie werden nicht
  von selbst ergänzt: alten Abschnitt löschen und neu importieren.
- **Fehlende OneNote-Daten (1.15):** Steht in der Datei `<invfdo>` oder eine GUID ohne Eintrag, sind die
  Bild-/Dateidaten **wirklich nicht in der Datei** – KnowledgeTree kann sie nicht herzaubern (Abhilfe:
  in OneNote öffnen und **Datei → Exportieren**). Bereits importierte Seiten mit Platzhaltern werden nicht
  nachträglich ergänzt; dafür neu importieren. Wie OneNote die Dateien im Begleitordner `…_onefiles` genau
  benennt, ist nicht dokumentiert – gesucht wird grosszügig (Name, mit Endung, `.onebin`, ohne Klammern).
- **Schrift-Kontrast (1.14):** geprüft wird gegen die Feld-, Seiten- und Hervorhebungsfarbe – **nicht**
  gegen Bilder oder Zeichnungen, die unter einem unsichtbaren Feld liegen. Im hellen Design werden auch
  feste Farben unter 3 : 1 nachgedunkelt (z.B. Orange `#ED7D31` auf Weiss) – wer das nicht möchte:
  „Lesbare Farben“ ausschalten. Verbindet man im Text zwei Absätze mit unterschiedlicher fester Farbe,
  kann Chrome die gerade **angezeigte** (korrigierte) Farbe als feste Farbe übernehmen (seltener
  Browser-Effekt beim Zusammenführen).
- **OneNote verlustfrei (1.13):** Beim Export bekommen Dateianhänge **kein Symbolbild** (OneNote legt
  eines in der Datei ab; ob es ohne auskommt, ist ungeprüft). Ein Ausdruck wird nach dem Import zu
  einzelnen Seitenbildern + XPS auf der Sammelseite – beim Export also **Bilder + Anhang**, nicht wieder
  ein „Ausdruck“ (Inhalt vollständig, Struktur nicht). Von einem Bild mit mehreren Fassungen (z.B. EMF +
  PNG) wird nur die darstellbare übernommen. Die Sammelseite kann auch Dateien gelöschter Elemente
  zeigen, solange OneNote sie noch nicht aus der Datei entfernt hat.
- **Archiv importieren (1.12):** Erkannt werden nur **OneNote-/KnowledgeTree-Dateien** im Archiv
  (`.one`, `.onepkg`, `.knowledgetree.json`) – andere Dateien werden übersprungen. **ZIP** geht offline;
  **RAR** braucht beim ersten Mal **Internet** (node-unrar-js-WASM; seit 1.19 im Worker), 7z/TAR gehen nicht – sonst Hinweis „als ZIP
  speichern“. Sehr grosse ZIPs (ZIP64, >4 GB oder >65535 Dateien) werden nicht unterstützt. Mehrere
  Notizbücher in **einem** Archiv landen als Abschnittsgruppen unter einem Notizbuch (nach dem
  Archivnamen).
- **Seiten als Bilder aufklappen (1.11):** PDF braucht beim ersten Mal **Internet** (PDF.js-Download,
  danach im Browser-Cache). **Word/PowerPoint/Excel** lassen sich im Browser **nicht seitengenau**
  rendern – es werden nur die **enthaltenen Bilder** herausgezogen; für exakte Seiten in Word
  „Speichern als PDF“ und das PDF aufklappen. Passwortgeschützte PDFs brauchen das Passwort
  (kein Knacken). Datei-**Anhänge** gehen beim OneNote-Export noch als **Text-Chip** (nur die
  aufgeklappten Seiten gehen als Bilder mit; echte OneNote-Dateianhänge schreiben wäre ein Ausbau).
- Die Daten der Webseiten-Version liegen nur im jeweiligen Browser auf dem jeweiligen Gerät.
  Kein Abgleich zwischen Geräten – dafür sind die Backups da.
- Keine gleichzeitige Bearbeitung durch mehrere Personen; zwei Fenster/Tabs → das ältere wird
  schreibgeschützt.
- Seit 1.10 auch fürs Handy/Tablet eingerichtet (Abschnitt 3). Grenzen: Seiten/Abschnitte per Ziehen
  umordnen geht mit dem Finger nicht überall (Browser-abhängig) – dafür gibt es „Verschieben nach …“
  im Kontextmenü; Tastenkürzel brauchen eine Tastatur; der Rechner ist auf dem Handy quer sehr klein
  (hochkant verwenden); Feld-Breite mit dem Finger an der rechten Kante (24-px-Anfasser).
- Seitenversionen gibt es nur in der Webseiten-Version.
- „Freihand → Text“ braucht Internet (beim ersten Mal ein paar MB) und erkennt Handschrift
  nur mässig – deshalb „Beta“ und immer mit Korrektur-Dialog.
- Verbindungen gelten innerhalb einer Seite; es gibt keine Verknüpfung zwischen Seiten
  (wäre eine mögliche Erweiterung).
- Einfache Tabellen **im Text** lassen sich nicht komfortabel umbauen (keine Knöpfe für
  Zeile/Spalte einfügen) – dafür gibt es seit 1.8 die Rechentabellen (Rechtsklick → umwandeln).
- Die EXE ist nicht signiert → Windows zeigt beim ersten Start „Der Computer wurde durch
  Windows geschützt" („Weitere Informationen" → „Trotzdem ausführen").

**OneNote-Export (Beta):** funktioniert im Rücktest mit dem eigenen Leser, ist aber nicht in
echtem OneNote geprüft. Wenn OneNote eine Datei ablehnt: zuerst MD5 der schreibgeschützten
Objekte, dann fehlende Pflicht-Eigenschaften (Vergleich mit einer echten Datei per
Diagnose-Skript, das alle Objekte mit Eigenschaften ausgibt), dann die fehlenden
`ObjectInfoDependencyOverrides`/Versionsverlauf-Kontext prüfen. Nicht übertragen: echte
OneNote-Tabellen, Anhänge als Datei, Tags, OneNote-Formeln (jeweils Ersatz, siehe Abschnitt 3).

Fotomath (1.9): erkennt nur Ziffern, + − × · ÷ : = ( ) . π x y, Brüche, Hochzahlen und Wurzeln –
keine Buchstabenfolgen wie sin/log, keine Indizes, keine mehrzeiligen Rechnungen (eine Zeile pro
Rahmen). Bilder sind Beta: sich berührende Zeichen (z.B. eng geschriebenes „10“) werden oft zu einem
Zeichen; Fotos mit starkem Schatten/Glanz oder farbigem Papier gehen schlechter. Erkennung ist
Vorlagenvergleich, kein neuronales Netz – Korrigieren + Lernen ist Teil des Konzepts.
Rechner (1.9): convert = Längen-/Flächen-/Volumen-/Massen-/Temperatur-/Energie-Einheiten, Σ/∏
höchstens 100 000 Glieder, Variable immer x.
Ausweichen (1.9): Freihand-Zeichnungen sind keine Hindernisse; bei sehr vielen Verbindungen werden
Wege über mehrere Bilder verteilt berechnet (kurz sichtbar gerade Linien möglich).

Tabellen (1.8): keine verbundenen Zellen (OneNote kennt sie auch nicht), keine bedingte
Formatierung, keine Filter, keine dynamischen Arrays (Matrixformeln liefern den ersten Wert),
keine Zeilenhöhen von Hand (automatisch), kein .xlsx-Import/-Export (CSV ja), keine Bezüge auf
Tabellen anderer Seiten, flüchtige Funktionen (HEUTE, ZUFALLSZAHL) rechnen bei jeder Änderung neu.
Diagramme: keine Verbund-/Sekundärachsen, keine Fehlerbalken. Rechner: Ergebnisse 13 Stellen
intern, 10 angezeigt (komplexe Zahlen, base n, convert, op/set op und Σ/∏ gibt es seit 1.9).

Chem-Draw: IUPAC-Namen nur für die oben genannten Strukturklassen (Steroide, Penicilline,
Benzodiazepine u.ä. nur über die Datenbank), keine Reaktionspfeile/Mechanismen im Editor
(Reaktionsgleichungen nur als formatierter Text), CIP nur Regel 1a, verbrückte Ringsysteme
werden nur behelfsmässig angeordnet.

Mögliche nächste Schritte (aus dem Konzept, Reihenfolge mit dem User absprechen):
Tags/Markierungen, Links zwischen Seiten, Chem-Draw-Ausbau (Vorlagen
wie Aminosäuren/Zucker, Reaktionspfeile, Namen), Texterkennung in Bildern, Audio-Notizen, Vorlagen für Seiten,
OneNote-Export mit echten Tabellen/Anhängen (nach Rückmeldung des Users), EXE neu bauen.

---

## 11. Konventionen für Änderungen

- Oberflächentexte, Kommentare und Namen auf Deutsch; „ss" statt „ß".
- Keine neuen Abhängigkeiten, kein Framework, kein Build-Schritt für den Client ausser
  `build_web.py`.
- Neue Befehle immer in `COMMANDS` eintragen (mit `enabled`/`active`) und im Menüband
  verlinken – nicht direkt im HTML verdrahten.
- Nach Änderungen an `web/`: `python3 build_web.py` ausführen (verkleinert; `--lesbar` für die lesbare Fassung), damit `dist/index.html`
  aktuell ist, und bei Desktop-Relevanz die EXE neu bauen.
- Versionsnummer steht an zwei Stellen: `appVersion` in `main.go` und `version` in
  `backend-browser.js` (beide aktuell 1.23).
- Neue Felder in Seiten/Baum/`Store.ui` immer in `normPage`, `Tree.norm` bzw. `UI_DEFAULTS`
  mit Standardwert absichern, damit ältere Daten weiter laden.
- Alles, was der User verliert, wenn etwas schiefgeht, hat eine zweite Sicherung: Verlauf (Strg+Z), Backups,
  Seitenversionen (Desktop zusätzlich Papierkorb-Ordner). Seit 1.20 auf Wunsch des Users kein Papierkorb mehr in
  der Webseite – Gelöschtes wird restlos entfernt, sobald Strg+Z es nicht mehr braucht.
