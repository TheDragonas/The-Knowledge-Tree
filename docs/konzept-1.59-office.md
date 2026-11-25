# Konzept 1.59 ff. – Geteilte Ansicht, Office-Dateien als Seiten, Präsentation

Grundsatz: Bestehendes bleibt (Freiform-Seiten, Rechentabellen und Diagramme auf der Fläche, OneNote-Import/-Export).
Office-Dateien kommen **wie in Obsidian** dazu: die Datei liegt verlustfrei als Datei im Notizbuch (eigenes Asset,
Original-Bytes), KnowledgeTree zeigt und bearbeitet sie als Seite – und bleibt unabhängig (kein Office nötig, keine
Fremd-Bibliothek). Jede Seite lässt sich als Office-Datei **und** als eigenständige KnowledgeTree-Seite importieren und
exportieren.

## Pakete
1. **1.59 Geteilte Ansicht** (`panes.js`): Mausrad/Strg+Rad (gab es), **Fläche ziehen** (mittlere Maustaste oder
   Leertaste+Ziehen) in der Vorschau ohne Wechsel; erster Klick wirkt (gab es für Drücken) – jetzt auch **Klick**
   (Links, Checkliste, Anhang, Video); Tastatur geht an den zuletzt angeklickten Bereich (aktiver Bereich); Menüband
   zeigt immer den aktiven Bereich (eine Zeichenfläche); **dezenter Rahmen** am aktiven Bereich, sobald geteilt ist.
   Dazu: **Bilder verlustfrei verkleinern** (siehe unten).
2. **1.60 `ooxml.js` + Seitentypen**: Paket lesen/schreiben (nur berührte Teile neu, sonst Original-Bytes), XML ohne
   Verlust, Beziehungen, Content-Types, EMU ↔ px. `page.type` ('folie' | 'dok' | 'tab', fehlt = Freiform),
   `page.office = { asset, fmt, name, map }`. Auswahl beim Erstellen, Darstellung je Typ, Export-Weiche
   (Office-Datei | KnowledgeTree-Seite .kt | OneNote).
3. **1.61–1.62 PowerPoint**: Abschnitt „Präsentation“ (`section.type = 'praes'`), Folien-Miniaturen, Import (Formen,
   Text, Bilder, Hintergründe, Master/Layouts lesen, Notizen), Register „Präsentation“, Vorführmodus/Referentenansicht,
   Export (verlustfrei, nur geänderte Formen ersetzt).
4. **1.63 Word**, **1.64 Excel** (Arbeitsmappe auf dem Sheet-Kern).

## Speicher: Bilder und Videos
- Assets sind schon nach Inhalt benannt (SHA-1) → Doppeltes wird nur einmal gespeichert.
- Neu (1.59): **PNG/BMP/GIF-Standbilder → verlustfreies WebP**, nur wenn **jedes Pixel gleich bleibt** (zurücklesen und
  vergleichen) und die Datei mindestens 10 % kleiner wird; im Leerlauf (requestIdleCallback), nie beim Öffnen – also
  keine Ladezeit. Metadaten von JPEG/PNG (EXIF-Vorschaubild, Textblöcke) werden nicht angefasst (Bildinhalt bleibt
  sowieso gleich, Ersparnis klein). JPEG und Videos sind schon verlustbehaftet gepackt – erneut verlustfrei packen
  bringt im Browser nichts Messbares (ohne grosse Zusatzbibliothek) → bleiben, wie sie sind.
- **Office-Pakete bleiben byteweise unverändert** (sonst wäre der Round-Trip nicht verlustfrei). Export nach Office/
  OneNote wandelt WebP wieder in PNG (verlustfrei).

## Prüfen
Automatisch: Round-Trip Teil für Teil byte-gleich, LibreOffice headless (öffnen → PDF), python-docx/-pptx/openpyxl,
Bildvergleich. **Nicht prüfbar: Microsoft Office selbst** (Reparaturmeldung, Aussehen) – wird jeweils als ungetestet
gekennzeichnet.
