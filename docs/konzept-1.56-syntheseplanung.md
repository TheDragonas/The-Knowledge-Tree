# Konzept 1.56 – Chem-Draw: Planen-Modus, Syntheseplanung, Gruppen, MS-Fragmente

Grundsatz: Die Zeichen-Bedienung bleibt, wie sie ist. Neues kommt als **eigener Modus** und als **eigene Datei**
(`web/js/chem-rxn.js`, ohne DOM, in Node testbar) dazu. Kleine Pakete, je getestet, am Schluss Gesamtprüfung.

## 1. Bedienung (so wenig Änderung wie möglich)
- **Umschalter „Zeichnen | Planen“** oben in der rechten Seitenleiste des Registers „Struktur zeichnen“.
  - *Zeichnen*: genau wie bisher.
  - *Planen*: Zeichenfläche und alle Werkzeuge bleiben (man kann weiterzeichnen); die Seitenleiste wird breiter und
    zeigt den **Planungsbereich**. Der Modus wird gemerkt (`opts.mode`).
- Planungsbereich erkennt die Aufgabe selbst:
  - **Zielmolekül**: das ausgewählte bzw. einzige Molekül → „Synthesewege vorschlagen“.
  - **Edukt → Produkt**: Steht ein Reaktionspfeil zwischen zwei Molekülen, ist links das Edukt, rechts das Produkt →
    „Weg vom Edukt zum Produkt“. Man kann mit einem Schalter zwischen beiden Aufgaben wechseln.
- Einstellungen (einklappbar, gemerkt): **Stufen höchstens** (1–4), **nur empfohlene Bedingungen**,
  **Ansatzgrösse** (mmol; 0,1 mmol … 10 mol).
- **Ergebnisliste**: Routen als Karten (Zahl der Stufen, Bewertung, Marken: „mild“, „Katalysator“, „Vorsicht“).
- **Routen-Ansicht** (Klick auf eine Karte): Stufen von oben (Ausgangsstoffe) nach unten (Ziel). Je Stufe:
  - Bilder: Edukt(e) → Produkt, Name der Reaktion, Reagenzien und Bedingungen (Lösungsmittel, Temperatur, Zeit)
    – **direkt editierbar**;
  - **„Reaktion ändern“** (Auswahlfeld mit den anderen möglichen Reaktionen zum selben Produkt);
  - je Edukt: **„weiter zerlegen“** (eine Stufe davor erzeugen) oder **„als Ausgangsstoff“** (Stufe davor entfernen);
  - **Mengen-Tabelle** (Äquivalente → mmol → g bzw. mL) für die Ansatzgrösse;
  - Hinweise (Sicherheit, Aufarbeitung, warum (nicht) empfohlen).
- Aktionen: **„Schema in die Zeichnung“** (Moleküle mit Pfeilen und Bedingungen rechts neben die Zeichnung),
  **„In Reaxys suchen“** (öffnet Reaxys im Browser, SMILES liegt in der Zwischenablage – Zugang über Uni/Firma),
  **„Als Text einfügen“** (Versuchsvorschrift-Gerüst).

## 2. Reaktions-Engine (`chem-rxn.js`)
- Arbeitet auf dem Molekülformat der Zeichnung (Atome/Bindungen, H implizit; explizite H werden entfernt).
  Wahrnehmung (aromatisch, Ringe, Gruppen) über `ChemProps.graph`; Vergleich über `ChemMatch.key`.
- **Regeln = Retro-Transformationen** als kleine Funktionen: `find(ctx)` → Treffer, `apply(treffer)` →
  `{ precursors: [Moleküle], reagents: [{name, smi?, eq}], cond: {solv, T, t}, notes, flags }`.
  - flags: `metal` (Metall-Katalysator, z. B. Pd, Cu, Os) · `extreme` (< −20 °C, > 150 °C, Druck) · `toxic`
    (sehr giftig: NaCN, Cr(VI), OsO₄ …) · `pyro` (pyrophor/heftig mit Wasser: n-BuLi, LiAlH₄, NaH).
  - **empfohlen** = keines davon. Sonst „vorgeschlagen“ mit Grund. (Wunsch: Katalysatoren vorschlagen, nicht empfehlen.)
- Regel-Bibliothek (Startumfang ~40): Ester (Fischer, Steglich, Säurechlorid), Amide (Säurechlorid, EDC/HOBt, HATU),
  Carbamate (Boc, Fmoc, Cbz), Ether (Williamson), Alkohole (NaBH₄, Grignard, LiAlH₄), Aldehyde/Ketone (DMP-, PCC-,
  Swern-Oxidation, Friedel–Crafts-Acylierung, Aldol/Claisen–Schmidt), Säuren (Esterverseifung, Oxidation,
  Nitril-Hydrolyse, Grignard + CO₂, Seitenketten-Oxidation), Amine (reduktive Aminierung, N-Alkylierung,
  Nitro-Reduktion, Amid-Reduktion), Alkene (Wittig, HWE, Dehydratisierung, Heck), Biaryle (Suzuki), Aryl-Alkine
  (Sonogashira), Aromaten (Nitrierung, Bromierung, Chlorierung, Sulfonierung), Halogenalkane (PBr₃, SOCl₂),
  Nitrile (SN2 mit NaCN), Diels–Alder, Epoxid (mCPBA), Diol, Acetal, Imin, Hydrierung.
- **Bewertung** einer Stufe: Zuverlässigkeit der Regel × (empfohlen ? 1 : 0,55) × Selektivitäts-Malus (mehrere
  gleichartige Gruppen); **Ausgangsstoff** = in der Vorlagen-Datenbank, sehr klein/einfach oder typisches Reagenz.
  Route = Produkt der Stufen, kleiner Abzug je Stufe, Malus für nicht käufliche Blätter.
- **Suche**: Tiefensuche mit Strahl (je Knoten die besten 6 Zerlegungen, Tiefe ≤ Stufen), Duplikate über Schlüssel,
  Ergebnis: beste 8 Routen (Baum; Anzeige in Reihenfolge der Ausführung).
- **Edukt → Produkt**: gleiche Suche vom Produkt aus, aber Ziel = Edukt erreicht (exakter Schlüssel); Bonus dafür.
  Ohne Treffer: nächstliegende Route (Ähnlichkeit über einfachen Fingerabdruck) mit klarem Hinweis.
- **Mengen**: molare Massen aus der Formel; Dichten für flüssige Standard-Reagenzien (Tabelle) → mL.
- Grenzen offen sagen: Regelwerk, keine Literaturdatenbank; Ausbeuten sind typische Spannen.

## 3. Gruppen
- Auswahl → **Strg+G „Gruppieren“**, **Strg+Umschalt+G „Gruppierung aufheben“** (auch Kontextmenü und Knopf).
- Atome/Objekte tragen `grp`. Klick mit „Auswählen“ auf ein Gruppenmitglied wählt die ganze Gruppe; Ziehen bewegt sie.
- **Übereinanderlegen ohne Verkleben**: Trefferprüfung bevorzugt das bereits Ausgewählte (zuoberst), beim Ziehen
  wird nie verschmolzen, wenn mehr als ein Atom bewegt wird (wie bisher) – und auch nicht, wenn das gezogene Atom zu
  einer Gruppe gehört. Alt+Klick wählt das darunterliegende Molekül.

## 4. MS-Fragmente
- Statt Karten: **Auswahlfeld** „Fragment“ mit Namen (z. B. „m/z 105 · Benzoyl-Kation C₇H₅O⁺“), darunter kompakt
  Vorschau (Molekül mit Bruchstelle | Ion) und Abbruchfolge. Knopf **„In die Zeichnung“**: Ion mit Ladung (q) und
  Radikal (rad) und richtiger H-Zahl (hd) rechts neben die Zeichnung, ausgewählt. Kern-Auswahl nur im NMR-Reiter.

## 5. Pakete
1. Kern-Auswahl + MS-Auswahlfeld/Einfügen · 2. Gruppen · 3. Engine + Node-Tests · 4. Planen-UI + Browser-Test ·
5. Gesamtprüfung (Konzept gegen Umsetzung), Doku, Version 1.56, Lieferung.
