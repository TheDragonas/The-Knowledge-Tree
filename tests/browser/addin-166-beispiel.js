/* Vorlage für ein KnowledgeTree-Add-In (ab Version 1.66)
 * Laden: Excel-Seite → Register „Entwicklertools“ → Add-Ins → „Add-In hinzufügen“. */
KnowledgeTree.register({
  id: 'beispiel',
  name: 'Beispiel-Add-In',
  version: '1.0',
  desc: 'Zeigt, was ein Add-In kann',
  setup(api) {
    // 1) eigene Tabellenfunktionen: =BRUTTO(100) → 108.1 · =MITTELOHNENULL(A1:B5) (Bereiche kommen als [[…]] an, Rückgabe: ein Wert)
    api.addFunction('BRUTTO', (netto, satz) => netto * (1 + (satz ?? 0.081)), { min: 1, max: 2, sig: 'Netto; [Satz]', desc: 'Betrag mit Mehrwertsteuer' });
    api.addFunction('MITTELOHNENULL', (bereich) => { const w = bereich.flat().filter(v => typeof v === 'number' && v !== 0); return w.length ? w.reduce((s, v) => s + v, 0) / w.length : 0; }, { min: 1, max: 1, sig: 'Bereich', desc: 'Mittelwert ohne leere Zellen und Nullen' });
    // 2) Knopf im Menüband (Excel: Register „Entwicklertools“)
    api.addButton({ tab: 'x-dev', group: 'Beispiel', label: 'Kopfzeile', icon: 'sparkle', title: 'Schreibt Überschriften in Zeile 1', run() {
      api.sheet.setRange('A1', [['Artikel', 'Menge', 'Preis', 'Summe']]);
      api.ui.toast('Kopfzeile geschrieben');
    } });
    // 3) auf Änderungen reagieren
    api.on('cellChange', (e) => { if (e.ref === 'A1') console.log('A1 geändert:', e.raw); });
  },
});
