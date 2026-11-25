/* ==========================================================================================================
   KnowledgeTree – Add-In-Vorlage für KI   (Add-In-Schnittstelle 2, KnowledgeTree ab 1.69)
   ==========================================================================================================

   EINE Datei für alles: Diese Datei ist gleichzeitig die ANLEITUNG (dieser Kommentar) und das GERÜST eines
   lauffähigen Add-Ins (der Code ganz unten).

   So benutzt du sie:
     1. Diese ganze Datei einer KI geben (z.B. Claude oder ChatGPT) und darunter beschreiben, was dein Add-In
        können soll – z.B. „Ein Knopf, der die markierte Zahl von Grad in Radiant umrechnet“.
     2. Die KI schreibt eine NEUE .js-Datei im Aufbau des Gerüsts unten.
     3. Die Datei in den Ordner „Add-Ins“ neben KnowledgeTree.exe legen (Browser: Register Add-Ins → Add-In
        hinzufügen) und im Register „Add-Ins“ das Häkchen setzen.

   In Wirklichkeit sieht ein fertiges Add-In anders aus als diese Datei: Es besteht nur aus einem kurzen Kopfkommentar
   und dem register-Aufruf (wie unten im Gerüst) – den langen Anleitungs-Kommentar braucht es NICHT. Er ist nur hier,
   damit die KI weiss, was erlaubt und möglich ist.

   Diese Vorlage selbst wird nie als Add-In geladen: Dateien, deren Name mit „_“ beginnt, überspringt KnowledgeTree
   im Ordner „Add-Ins“. Sie wird bei jedem Programmstart auf den Stand des Programms gebracht – eigene Änderungen
   darum in einer Kopie mit anderem Namen machen.

   Der Text unten ist Markdown (Überschriften mit #, Code in ```js … ```), damit Mensch und KI ihn gut lesen können.

   ----------------------------------------------------------------------------------------------------------

## 1. Auftrag an die KI

Du schreibst ein **Add-In für KnowledgeTree**, ein Notizprogramm (wie OneNote) mit Freiform-Seiten, Word-, Excel- und PowerPoint-Seiten, Zeichnen, Tabellen, Diagrammen und Chem-Draw. Liefere **genau eine JavaScript-Datei** (`name.js`, Name ohne `_` am Anfang) im Aufbau des Gerüsts am Ende dieser Datei – **ohne** diesen langen Anleitungs-Kommentar, nur mit einem kurzen Kopfkommentar –, die die Regeln unten einhält. Erkläre danach in 2–3 Sätzen auf Deutsch, was das Add-In macht und wo man es findet.

**Muss-Regeln**

1. Die Datei ruft **genau einmal** `KnowledgeTree.register({ … })` auf (mehrere Add-Ins in einer Datei sind erlaubt, dann je ein Aufruf). Sonst nichts auf oberster Ebene ausführen – alles gehört in `setup(api)`.
2. `id`: eindeutig, nur Kleinbuchstaben, Ziffern und `-` (z.B. `einheiten-rechner`). Nicht `chemdraw` verwenden (eingebaut).
3. **Nur über `api` anmelden** (Befehle, Knöpfe, Gruppen, Register, Menüs, Tasten, Stile, Ereignisse). Was über `api` angemeldet wird, entfernt KnowledgeTree beim Ausschalten automatisch. Wer trotzdem selbst etwas ins DOM hängt, Timer startet oder `addEventListener` benutzt, **muss** es in der Funktion aufräumen, die `setup` zurückgibt (oder in `teardown(api)`).
4. **Kein Internet, keine fremden Bibliotheken**, kein `import`/`require`, kein `eval` von Fremdcode. Reines JavaScript (ES2020), läuft im Browser bzw. im Programmfenster (WebView2/Chromium).
5. **Oberfläche auf Deutsch mit Schweizer Schreibweise** („ss“ statt „ß“: „gross“, „schliessen“), Anführungszeichen „…“. Kurze, klare Beschriftungen; Erklärung in `title` (Tooltip).
6. Fehler nicht verschlucken: lieber `api.ui.toast('…')` mit verständlichem Text. Ausnahmen in `run` fängt KnowledgeTree ab und zeigt sie als Hinweis an.
7. Änderungen an der Seite danach mit `api.commit('Beschreibung')` speichern (ein Schritt für Rückgängig).
8. Eigene Einstellungen nur über `api.store.get/set` (bleiben gespeichert). Kein `localStorage`.
9. `requires: '1.69'` angeben, wenn die Schnittstelle 2 gebraucht wird.
10. Kommentare im Code auf Deutsch.

**Sicherheit:** Add-Ins laufen mit allen Rechten von KnowledgeTree. Nichts heimlich verschicken, löschen oder verändern; nichts tun, was der Benutzer nicht ausgelöst hat.

---

## 2. Aufbau einer Add-In-Datei

Ganz unten in dieser Datei steht das **Gerüst** (nach dem Ende dieses Kommentars) – genau so sieht ein echtes Add-In aus:
ein kurzer Kopfkommentar und ein Aufruf `KnowledgeTree.register({ id, name, version, requires, desc, setup(api) { … } })`.
Was das Add-In tut, steht in `setup(api)`. Gibt `setup` eine Funktion zurück, ruft KnowledgeTree sie beim Ausschalten
auf (eigenes Aufräumen); alternativ `teardown(api)` neben `setup`.

`KnowledgeTree.version` = Programmversion (z.B. `'1.70'`), `KnowledgeTree.api` = Schnittstellen-Version (`2`).

---

## 3. Schnittstelle `api`

| Aufruf | Wirkung |
|---|---|
| `api.addCommand(name, { run(arg), enabled(), active(arg) })` | Befehl anmelden. Aufruf überall mit `Cmd.run(name, arg)`. `enabled` → Knopf grau, `active` → Knopf hervorgehoben / Häkchen. Gibt es den Namen schon, wird er überschrieben und beim Ausschalten wiederhergestellt. |
| `api.addButton({ tab, mode, group, label, icon, title, big, small, check, cmd, arg, run, menu, enabled, active })` | Knopf im Menüband. Standard: `tab: 'addins'`, `mode: '*'`, `group: name des Add-Ins`, gross. `small: true` = klein (je 3 untereinander), `check: true` = Häkchen-Knopf (angehakt wenn `active`). Entweder `cmd` (+`arg`) oder `run`. `menu: [{ label, icon, run, checked, disabled }, '-', { head: 'Titel' }]` (oder Funktion, die so eine Liste liefert) = Knopf mit Aufklappmenü. Gibt den Befehlsnamen zurück. |
| `api.addGroup({ tab, mode, label, before, after, build(R) })` | Ganze Gruppe selbst bauen. `build` bekommt die Bausteine `R` (siehe 4.) und liefert ein Element oder eine Liste. `before`/`after`: Beschriftung einer vorhandenen Gruppe im Register (z.B. `before: 'Hilfsmittel'`), sonst ans Ende. |
| `api.addTab({ id, label, modes, after })` | Eigenes Register. `modes: '*'` oder Liste aus `'frei'`, `'dok'`, `'tab'`, `'folie'`. `after`: id eines Registers, sonst vor „Add-Ins“. Inhalt mit `addButton`/`addGroup` und `tab: id`. |
| `api.addIcon(name, svg)` | Eigenes Symbol: Inhalt eines SVG mit `viewBox="0 0 24 24"`, Linien (`stroke="currentColor"` ist voreingestellt, `fill="none"`). Danach als `icon: name` verwendbar. |
| `api.addMenuItem({ where, label, icon, key, when(ctx), disabled(ctx), run(ctx) })` | Rechtsklick-Menü. `where: 'box'` (Textfeld/Bild/Tabelle; `ctx = { box, image, locked, page }` – `image` = markiertes Bild oder Bild eines Bild-Felds) oder `'canvas'` (freie Fläche; `ctx = { at: {x, y}, page }`). |
| `api.addShortcut('Strg+Umschalt+K', fn, beschreibung)` | Tastenkürzel (Strg, Alt, Umschalt + Taste; auch `F8`). `fn(e)` – Rückgabe `false` = nicht verbraucht. Wirkt nicht in Dialogen. Bestehende Kürzel von KnowledgeTree nicht überdecken (siehe 6.). |
| `api.addStyle(css)` | CSS einfügen. Eigene Klassen mit Präfix der id, z.B. `.mein-addin-…`. Farben über die Variablen `var(--accent)`, `var(--ink)`, `var(--ink-2)`, `var(--line)`, `var(--box-bg)`, `var(--chrome)` – dann passt es zu Hell und Dunkel. |
| `api.addWords(liste \| () => liste)` | Wörter für die Rechtschreibprüfung (Fachwörter). |
| `api.addHelp(titel, [['Taste/Geste', 'Wirkung'], …])` | Abschnitt in „Tastenkürzel & Bedienung“ (F1). |
| `api.addFunction('NAME', fn, { min, max, sig, desc })` | Tabellenfunktion `=NAME(…)` für Excel-Seiten und Tabellen. Zahlen kommen als Zahl, Bereiche als `[[…], […]]`, leere Argumente als `undefined`. Rückgabe: Zahl, Text, Wahrheitswert oder Matrix `[[…]]`. Fehler → `#WERT!`. Name: Grossbuchstaben, Ziffern, `_`, `.`. |
| `api.on(ereignis, fn)` | Ereignisse, siehe 5. |
| `api.ui.toast(text, ms)` | Kurzer Hinweis unten. |
| `api.ui.info(titel, html)` | Meldung mit HTML (Text mit `api.h.escapeHtml` sichern). |
| `await api.ui.prompt(titel, vorgabe)` | Eingabe → Text oder `null`. |
| `await api.ui.confirm(titel, text)` | Rückfrage → `true`/`false`. |
| `await api.ui.dialog((dlg, close) => { … }, { wide })` | Eigener Dialog. In `dlg` Elemente einfügen (`h2` als Titel, Knöpfe mit Klasse `btn` bzw. `btn primary` in einem `div.dlg-btns`), `close(wert)` schliesst. |
| `api.ui.menu(items, ankerElement \| { x, y })` | Menü öffnen (Einträge wie bei `addButton.menu`). |
| `api.ui.download(dateiname, text \| Blob, typ)` | Datei speichern/herunterladen. |
| `api.store.get(k)` / `api.store.set(k, v)` | Eigene Einstellungen (JSON-fähig), bleiben gespeichert. |
| `api.canvas.page()` / `pageId()` | Aktuelle Seite (siehe 7.) bzw. ihre id (`null` = keine Seite offen). |
| `api.canvas.box(id)` / `selection()` / `select([ids])` | Objekt der Seite, ids der Auswahl, Auswahl setzen. |
| `api.canvas.center()` | Mitte des sichtbaren Bereichs `{ x, y }` (Seitenkoordinaten). |
| `api.canvas.insertText(html, { x, y })` | Neues Textfeld (gibt das Feld zurück, speichert selbst). |
| `await api.canvas.insertImage(blob, { at, box, data, label })` | Bild einfügen (PNG/JPEG/SVG als Blob). `data`: eigene Angaben am Bild, z.B. `{ 'mein-addin': { … } }` – später in `imageRender`/`imageOpen` wiedererkennen. Gibt `{ box, image }` zurück. |
| `api.canvas.render()` | Seite neu zeichnen (nach direkten Änderungen an Objekten). |
| `api.commit(beschreibung)` | Änderung speichern + ein Schritt für Rückgängig. |
| `api.sheet` | Tabellen wie in Makros: `get('B2')`, `set('B2', 5)`, `range('A1:C3')` → `[[…]]`, `setRange('A1', [[1, 2]])`, `sheet('Name')`, `sheets()`, `selection()`, `select('A1:B2')`, `msg(text)`, `await input(frage)`, `recalc()`. Bezüge auch `'Daten!B2'`. Nur auf Seiten mit Tabellen. |
| `api.run(befehl, arg)` | Beliebigen Befehl ausführen (siehe 6.). |
| `api.h.el(tag, { class, text, html, title, style, dataset, onclick, … }, ...kinder)` | Element bauen. |
| `api.h.icon(name, grösse)` | Symbol als SVG-Text. `api.h.escapeHtml(text)`. |
| `api.id`, `api.version`, `api.apiVersion` | id des Add-Ins, Programmversion, Schnittstellenversion. |

---

## 4. Menüband

**Register-ids** (`tab`):

| Seitentyp (`mode`) | Register |
|---|---|
| alle | `start`, `einfuegen`, `zeichnen`, `ueberpruefen`, `ansicht`, `addins` |
| `frei` (Freiform-Seite) | zusätzlich `anordnen`, `verbindungen`; Kontext: `tabelle` (Zelle aktiv), `diagramm` (Diagramm markiert) |
| `dok` (Word) | `w-design` (Entwurf), `w-layout` (Layout), `w-ref` (Referenzen) |
| `tab` (Excel) | `x-formeln` (Formeln), `x-daten` (Daten), `x-dev` (Entwicklertools), `diagramm` |
| `folie` (PowerPoint) | `p-entwurf`, `p-trans` (Übergänge), `p-anim` (Animationen), `p-show` (Bildschirmpräsentation) |

`mode: '*'` = auf allen Seitentypen (Standard), sonst `'frei'`, `'dok'`, `'tab'`, `'folie'` oder eine Liste davon. Ein Knopf in einem Register, das es im Seitentyp nicht gibt, erscheint dort einfach nicht.

Gruppen im Register **Zeichnen** (für `before`/`after`): „Werkzeuge“, „Stifte“, „Formen“, „Chemie“, „Reaktion“ (vom Add-In Chem-Draw), „Hilfsmittel“, „Umwandeln“, „Ebene“.

**Bausteine `R`** (in `addGroup.build`):

- `R.big(cmd, label, icon, title, arg)` – grosser Knopf (Beschriftung mit `­` = Trennstelle für zwei Zeilen)
- `R.small(cmd, label, icon, title, arg)` – kleiner Knopf
- `R.check(cmd, label, title, arg)` – Häkchen (angehakt, wenn `active(arg)` wahr ist)
- `R.ico(cmd, icon, title, arg)` – nur Symbol
- `R.col(...knöpfe)` – untereinander (max. 3 kleine), `R.row(...)` – nebeneinander
- `R.gallery([{ cmd, arg, html, label, title, cls }], spalten)` – Raster (z.B. Symbole)
- `R.dropBtn('big' | 'small', api.h.icon(name, 28 | 16), label, title, (anker) => api.ui.menu([...], anker))` – Knopf mit Menü

**Symbole** (`icon`): `puzzle sparkle plus x check pencil trash copy paste cut search replace download export import folder folderPlus file filePdf image textbox table chart chartCol chartLine chartPie calendar clock calc sigma fx percent currency formula chem chemFormula pse omega bolt book bookPlus tag tree link globe help info alert settings play slides notes page pagePlus palette brush pen marker highlighter eraser ruler protractor wand shapes shRect shEllipse shArrow lock unlock sort sortAsc sortDesc zoomIn zoomOut fit grid lines dots magnet layout robot keyboard history print restore up down arrowLeft arrowRight arrowUp arrowDown chevDown chevRight` – oder eigene mit `api.addIcon`.

---

## 5. Ereignisse (`api.on`)

| Ereignis | Daten | Hinweis |
|---|---|---|
| `ready` | `{}` | Alle Add-Ins sind geladen (beim Start). |
| `pageOpen` | `{ page, title, type }` | Seite geöffnet (`type`: `frei`/`dok`/`tab`/`folie`, `null` = keine Seite). |
| `selectionChange` | `{ ids, page }` | Auswahl auf der Seite geändert. |
| `cellChange` | `{ sheet, ref, raw, value, page }` | Zelle geändert (`ref` z.B. `'B2'`, `raw` = Eingabe, `value` = Ergebnis). |
| `imageRender` | `{ box, image, el }` | Bild wird gezeichnet – z.B. `el.classList.add(…)`, `el.title = …` für eigene Bilder. |
| `imageOpen` | `{ box, image, locked }` | Doppelklick auf ein Bild. `true` zurückgeben = erledigt (sonst Grossansicht). Nur reagieren, wenn es das eigene Bild ist! |
| `keydown` | `KeyboardEvent` | Jede Taste ausserhalb von Dialogen. `true` = verbraucht. Sparsam verwenden, lieber `addShortcut`. |

---

## 6. Nützliche vorhandene Befehle (`api.run` / `cmd`)

`newBox` (Textfeld), `insertImage`, `insertTable`, `insertDate`, `undo`, `redo`, `copy`, `paste`, `zoom100`, `zoomIn`, `zoomOut`, `fit`, `chemDraw`, `chemPse`, `chemFormula` (nur wenn Chem-Draw eingeschaltet), `addins` (Add-Ins-Dialog).
Belegte Tastenkürzel (nicht überdecken), u.a.: Strg + Z/Y/C/X/V/D/A/S/P/F/H/E/G/B/I/U/K, Strg+Umschalt+G, Alt+=, Alt+M, Alt+N, Alt+Umschalt+D/T/F, F1, F2, F5, F7, F9, Entf, Esc. Frei sind z.B. Strg+Alt+Buchstabe (ausser N) und Strg+Umschalt+Buchstabe (ausser G).

---

## 7. Datenmodell (lesen; ändern nur mit `api.commit`)

- **Seite** `page`: `{ id, title, type, boxes: [Feld], links: [Verbindung], drawings: [Zeichnung], pkgs: [Paket], bg }`
- **Feld** `box`: `{ id, x, y, w, html, images: [Bild], style, locked, sheet?, chart? }` – `html` ist der Text (HTML), `x/y/w` in Seitenpixeln.
- **Bild** `image`: `{ id, src, x, y, w, h, …eigene Angaben }` – eigene Angaben unter dem Schlüssel der Add-In-id ablegen.
- Tabellen (`box.sheet`) nur über `api.sheet` ändern, nicht direkt.
- Office-Seiten (`type` `dok`/`tab`/`folie`) haben `page.office` – dort nichts direkt ändern.

---

## 8. Beispiel 1 – klein (Knopf, Befehl, Tabellenfunktion)

```js
// Einheiten-Helfer: Knopf rechnet einen Wert um, Tabellenfunktion =KMH(ms)
KnowledgeTree.register({
  id: 'einheiten',
  name: 'Einheiten-Helfer',
  version: '1.0',
  requires: '1.69',
  desc: 'Rechnet m/s in km/h um (Knopf und Tabellenfunktion)',
  setup(api) {
    api.addCommand('einheitenUmrechnen', {
      enabled: () => !!api.canvas.page(),
      async run() {
        const t = await api.ui.prompt('Geschwindigkeit in m/s', '10');
        if (t == null) return;
        const v = parseFloat(String(t).replace(',', '.'));
        if (!isFinite(v)) { api.ui.toast('Bitte eine Zahl eingeben'); return; }
        api.canvas.insertText(`${v} m/s = <b>${(v * 3.6).toLocaleString('de-CH')} km/h</b>`);
      },
    });
    api.addButton({ group: 'Einheiten', label: 'm/s → km/h', icon: 'calc', title: 'Geschwindigkeit umrechnen und als Textfeld einfügen', cmd: 'einheitenUmrechnen' });
    api.addFunction('KMH', (ms) => ms * 3.6, { min: 1, max: 1, sig: 'm/s', desc: 'Meter pro Sekunde in km/h' });
  },
});
```

## 9. Beispiel 2 – gross (eigenes Register, Einstellung, Häkchen, Bilder, Menü, Stil)

```js
// Stempel: setzt SVG-Stempel („Erledigt“, „Wichtig“ …) als Bild auf die Seite; Doppelklick auf einen Stempel = Text ändern
KnowledgeTree.register({
  id: 'stempel',
  name: 'Stempel',
  version: '1.0',
  requires: '1.69',
  desc: 'Farbige Stempel als Bild einfügen',
  setup(api) {
    const FARBEN = { gruen: '#2e7d32', rot: '#c62828', blau: '#1565c0' };
    const farbe = () => api.store.get('farbe') || 'gruen';
    const svg = (text, f) => new Blob([`<svg xmlns="http://www.w3.org/2000/svg" width="220" height="70"><rect x="4" y="4" width="212" height="62" rx="10" fill="none" stroke="${FARBEN[f]}" stroke-width="5"/><text x="110" y="46" font-family="Segoe UI, Arial" font-size="28" font-weight="700" text-anchor="middle" fill="${FARBEN[f]}">${api.h.escapeHtml(text)}</text></svg>`], { type: 'image/svg+xml' });
    const setzen = async (text) => {
      if (!api.canvas.page()) { api.ui.toast('Zuerst eine Seite öffnen'); return; }
      await api.canvas.insertImage(svg(text, farbe()), { data: { stempel: { text, farbe: farbe() } }, label: 'Stempel eingefügt' });
    };

    api.addIcon('stempel', '<rect x="4" y="13" width="16" height="6" rx="1.5"/><path d="M9 13V9a3 3 0 1 1 6 0v4M6 21h12"/>');
    api.addTab({ id: 'stempel', label: 'Stempel' });
    for (const t of ['Erledigt', 'Wichtig', 'Prüfung']) api.addButton({ tab: 'stempel', group: 'Einfügen', label: t, icon: 'stempel', title: `Stempel „${t}“ einfügen`, run: () => setzen(t) });
    api.addButton({ tab: 'stempel', group: 'Einfügen', label: 'Eigener …', icon: 'pencil', small: true, run: async () => { const t = await api.ui.prompt('Text des Stempels', ''); if (t) setzen(t); } });

    // Farbe als Häkchen (eine aktiv) – Cmd.run frischt das Menüband danach selbst auf
    api.addCommand('stempelFarbe', { run: (f) => api.store.set('farbe', f), active: (f) => farbe() === f });
    api.addGroup({ tab: 'stempel', label: 'Farbe', build: (R) => R.col(R.check('stempelFarbe', 'Grün', 'Grüne Stempel', 'gruen'), R.check('stempelFarbe', 'Rot', 'Rote Stempel', 'rot'), R.check('stempelFarbe', 'Blau', 'Blaue Stempel', 'blau')) });

    // Text eines Stempels ändern: neues Bild an derselben Stelle, altes weg
    const aendern = async (box, image) => {
      const t = await api.ui.prompt('Text des Stempels', image.stempel.text);
      if (!t) return;
      const neu = await api.canvas.insertImage(svg(t, image.stempel.farbe), { box: box.id, data: { stempel: { text: t, farbe: image.stempel.farbe } } });
      box.images = box.images.filter(i => i.id !== image.id);
      if (neu) { neu.image.x = image.x; neu.image.y = image.y; }
      api.canvas.render();
      api.commit('Stempel geändert');
    };

    // eigene Bilder erkennen
    api.addStyle('.fimg.stempel-bild { outline: 1px dashed var(--accent); outline-offset: 2px; }');
    api.on('imageRender', ({ image, el }) => { if (image.stempel) { el.classList.add('stempel-bild'); el.title = 'Stempel – Doppelklick = Text ändern'; } });
    api.on('imageOpen', ({ box, image, locked }) => {
      if (!image.stempel) return false;           // nicht unser Bild: KnowledgeTree macht weiter (Grossansicht)
      if (!locked) aendern(box, image);
      return true;
    });
    api.addMenuItem({ where: 'box', label: 'Stempel-Text ändern …', icon: 'pencil', when: (c) => !!(c.image && c.image.stempel), disabled: (c) => c.locked, run: (c) => aendern(c.box, c.image) });
    api.addShortcut('Strg+Alt+E', () => setzen('Erledigt'), 'Stempel „Erledigt“');
    api.addHelp('Stempel (Add-In)', [['Strg + Alt + E', 'Stempel „Erledigt“ einfügen'], ['Doppelklick auf einen Stempel', 'Text ändern']]);
  },
});
```

Das grösste Beispiel ist das eingebaute Add-In **Chem-Draw** (`js/addon-chemdraw.js` im Quellcode): Befehle, zwei Gruppen im Register Zeichnen vor „Hilfsmittel“, `imageRender`/`imageOpen`/`addMenuItem` für Strukturformeln, `addWords` und `addHelp`.

---

## 10. Prüfliste vor dem Abgeben

- [ ] Genau ein `KnowledgeTree.register` je Add-In, eindeutige `id`, `name`, `version`, `desc`, `requires: '1.69'`.
- [ ] Alles über `api` angemeldet; eigenes DOM/Timer/Listener in der Rückgabe von `setup` aufgeräumt.
- [ ] Ausschalten (Häkchen weg) entfernt alles, Einschalten bringt alles zurück, ohne doppelte Knöpfe.
- [ ] Kein Internet, keine Bibliotheken, kein `localStorage`; Texte deutsch mit „ss“.
- [ ] Seitenänderungen mit `api.commit(…)`; Funktionen ohne offene Seite melden statt abstürzen (`enabled: () => !!api.canvas.page()`).
- [ ] `imageOpen`/`addMenuItem` reagieren nur auf die eigenen Bilder (eigener Schlüssel am Bild).
- [ ] Stile mit Präfix der id und Farb-Variablen (Hell/Dunkel).

## 11. Installieren und testen

- **Programm (Windows):** die fertige Datei (z.B. `einheiten.js`, Name **ohne** `_` am Anfang) in den Ordner `Add-Ins`
  neben `KnowledgeTree.exe` legen → Register **Add-Ins → Neu laden** (oder neu starten). Neue Add-Ins sind sofort eingeschaltet.
- **Browser-Fassung:** Register **Add-Ins → Add-In hinzufügen** und die `.js`-Datei wählen.
- Ein-/ausschalten: Register **Add-Ins** → Häkchen. **Verwalten** zeigt Herkunft, Funktionen, Knöpfe und Fehler.
- Fehlersuche: Fehler erscheinen als Hinweis und in „Verwalten“ (rot beim betroffenen Add-In); Details in der
  Entwicklerkonsole (F12, nur Browser). Dann die Fehlermeldung der KI geben und um eine korrigierte Datei bitten.

*/

// ==========================================================================================================
// GERÜST – so sieht ein echtes Add-In aus. Die KI ersetzt id, name, desc und den Inhalt von setup(api).
// (Dieses Gerüst ist lauffähig: es legt im Register „Add-Ins“ einen Knopf „Hallo“ an.)
// ==========================================================================================================
/* Mein Add-In für KnowledgeTree – was es macht, in einem Satz (Kommentare auf Deutsch) */
KnowledgeTree.register({
  id: 'mein-addin',             // eindeutig: Kleinbuchstaben, Ziffern, -
  name: 'Mein Add-In',          // erscheint im Register „Add-Ins“ mit Häkchen
  version: '1.0',
  requires: '1.69',             // mindestens diese KnowledgeTree-Version
  desc: 'Was es macht, in einem Satz',
  setup(api) {
    // Befehl + Knopf (Register „Add-Ins“, alle Seitentypen)
    api.addCommand('meinAddinHallo', { run: () => api.ui.toast('Hallo aus meinem Add-In!') });
    api.addButton({ group: 'Mein Add-In', label: 'Hallo', icon: 'sparkle', title: 'Zeigt eine kurze Meldung', cmd: 'meinAddinHallo' });
    // optional: Funktion zurückgeben = eigenes Aufräumen beim Ausschalten (Timer, eigene DOM-Elemente …)
    return () => {};
  },
});
