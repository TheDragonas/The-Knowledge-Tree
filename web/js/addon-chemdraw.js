'use strict';
/* Eingebautes Add-In „Chem-Draw“ (1.69) – bis 1.68 fest im Programm, jetzt ein Add-In wie jedes andere.
 *
 * Der Editor selbst (chem*.js: Chem, ChemMol, ChemRender, CHEM_DB …) bleibt im Programm mitgeliefert; dieses Add-In hängt
 * ihn ein: Befehle, die Gruppen „Chemie“ und „Reaktion“ im Register Zeichnen (alle Seitentypen, vor „Hilfsmittel“),
 * Doppelklick und Rechtsklick auf eine Strukturformel, Fachwörter für die Rechtschreibung und den Abschnitt in der Hilfe.
 * Ein-/ausschalten: Register „Add-Ins“ → Häkchen „Chem-Draw“ (standardmässig an). Ausgeschaltet bleiben vorhandene
 * Strukturformeln ganz normale Bilder (Doppelklick = Grossansicht) und lassen sich nach dem Einschalten wieder bearbeiten.
 * Gleichzeitig das grosse Beispiel für die Add-In-Schnittstelle (siehe web/addins/_Add-In-Vorlage_KI.js). */
Plugins.builtin({
  id: 'chemdraw',
  name: 'Chem-Draw',
  version: '1.69',
  desc: 'Strukturformeln zeichnen, Summenformeln, Periodensystem, Reaktionen und Mechanismen',
  defaultOn: true,
  setup(api) {
    if (typeof Chem === 'undefined') throw new Error('Chem-Draw-Editor fehlt');
    const hasPage = () => !!Canvas.page && !App.preview;
    const isChem = (im) => !!(im && im.chem);

    // Befehle (Namen wie bis 1.68 – Knöpfe, Tastenkürzel und eigene Add-Ins können sie weiter aufrufen)
    api.addCommand('chemDraw', { run: () => Chem.open(null), enabled: hasPage });
    api.addCommand('chemTool', { run: (k) => Chem.openTool(k), enabled: hasPage });   // Reaktionssymbole (1.54)
    api.addCommand('chemFormula', { run: () => Chem.formatSelection(), enabled: hasPage });
    api.addCommand('chemPse', { run: () => Chem.open(null, 'pse') });

    // Menüband: Zeichnen → Chemie, Reaktion (vor „Hilfsmittel“, auch auf Word-, Excel- und PowerPoint-Seiten)
    api.addGroup({ tab: 'zeichnen', label: 'Chemie', before: 'Hilfsmittel', build: (R) => [
      R.big('chemDraw', 'Chem-Draw', 'chem', 'Chem-Draw: Strukturformeln zeichnen (wie ChemDraw). Summenformel, Molare Masse und chirale C-Atome werden automatisch bestimmt.'),
      R.col(R.small('chemFormula', 'Summenformel', 'chemFormula', 'Markierten Text als Summenformel oder Reaktionsgleichung formatieren (H2O → H₂O) – ohne Markierung: Formel-Rechner mit Molarer Masse'),
        R.small('chemPse', 'Periodensystem', 'pse', 'Periodensystem der Elemente')),
    ] });
    // Reaktionen und Mechanismen (1.54): öffnet Chem-Draw (bzw. die ausgewählte Struktur) mit diesem Werkzeug
    api.addGroup({ tab: 'zeichnen', label: 'Reaktion', before: 'Hilfsmittel', build: (R) => R.gallery([
      ['arr_r', 'Reaktionspfeil →'], ['arr_eq', 'Gleichgewichtspfeil ⇌'], ['arr_retro', 'Retrosynthese ⇒'], ['arr_res', 'Mesomeriepfeil ↔'],
      ['e2', 'Elektronenpaar-Pfeil (Mechanismus)'], ['e1', 'Ein-Elektron-Pfeil (radikalisch)'], ['plus', 'Plus +'], ['brk', 'Klammern ‡ (Übergangszustand)'],
      ['lp', 'Freie Elektronenpaare'], ['rad', 'Radikal •'], ['dp', 'Partialladung δ+'], ['step', 'Nächste Stufe anfügen'],
    ].map(([k, t]) => ({ cmd: 'chemTool', arg: k, html: chemIc(k, 18), title: t + ' – in Chem-Draw (ausgewählte Struktur oder neu)', cls: 'shape-item' })), 4) });

    // Strukturformeln in der Seite: kennzeichnen, Doppelklick = bearbeiten, Rechtsklick-Eintrag
    api.on('imageRender', ({ image, el }) => { if (isChem(image)) { el.classList.add('is-chem'); el.title = 'Strukturformel – Doppelklick zum Bearbeiten (Chem-Draw)'; } });
    api.on('imageOpen', ({ box, image, locked }) => {
      if (!isChem(image)) return false;
      if (!locked) Chem.editImage(box.id, image.id);
      return true;
    });
    api.addMenuItem({ where: 'box', label: 'Struktur bearbeiten (Chem-Draw) …', icon: 'chem', when: (c) => isChem(c.image), disabled: (c) => c.locked, run: (c) => Chem.editImage(c.box.id, c.image.id) });

    // Rechtschreibung: Element- und Molekülnamen
    api.addWords(() => {
      const out = [];
      if (typeof CHEM_DB !== 'undefined') for (const m of CHEM_DB) { out.push(m[0]); if (m[3] && m[3].alias) out.push(m[3].alias); }
      if (typeof CHEM_ELEMENTS !== 'undefined') for (const e of Object.values(CHEM_ELEMENTS)) if (e) out.push(e.name || e.n || e[1] || '');
      return out;
    });

    // Tastenkürzel & Bedienung (F1)
    api.addHelp('Chem-Draw (Zeichnen → Chemie, Add-In)', [
      ['Klick auf Atom / Ziehen', 'Bindung anhängen (120°) / in Richtung ziehen'],
      ['Klick auf Bindung', 'Ordnung erhöhen (Doppel-Werkzeug: Lage wechseln, Keil: umdrehen)'],
      ['Maus über Atom + C N O S P F L(Cl) B(Br) I H', 'Element setzen'],
      ['Maus über Atom + + / −', 'Ladung'],
      ['Maus über Bindung + 1 / 2 / 3 / W / H / Y', 'Einfach / Doppel / Dreifach / Keil / Strichkeil / Wellenlinie'],
      ['Doppelklick auf Atom', 'beschriften: Element (Na+) oder Kurzschreibweise (OH, NH2, COOH, Ph …)'],
      ['Doppelklick auf eine Struktur in der Seite', 'wieder bearbeiten'],
      ['Sechseck-Raster / Magnet', 'Raster anzeigen / Atome am Raster ausrichten (Alt beim Ziehen = frei)'],
      ['Zauberstab „Aufräumen“', 'Struktur (oder Auswahl) neu und regelmässig anordnen, Stereochemie bleibt'],
      ['Register „Vorlagen & Trivialnamen“', 'rund 250 Moleküle suchen und als Vorlage einfügen'],
      ['Name (IUPAC) in der Seitenleiste', 'wird automatisch erzeugt (DE/EN), lässt sich ändern; mit Auswahl: Name des markierten Teils'],
      ['Register „Add-Ins“ → Häkchen „Chem-Draw“', 'Chem-Draw aus- und wieder einschalten'],
    ]);

    // beim Ausschalten: offenen Editor schliessen (ohne zu übernehmen)
    return () => { if (Chem.E) Chem.close(); };
  },
});
