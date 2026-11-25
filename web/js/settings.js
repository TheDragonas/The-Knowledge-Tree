'use strict';
/* Einstellungen (seit 1.24, Datei → Einstellungen) – aufgebaut wie die Optionen von OneNote: links die Kategorien,
 * rechts die Einstellungen, unten OK/Abbrechen (übernommen wird erst mit OK).
 *
 *   Allgemein    Design, lesbare Farben, Navigation, Seitenliste links/rechts
 *   Seite        Raster, Bildlaufleisten, Ankerpunkte, Verbindungen weichen aus
 *   Sicherung    automatisches Backup (aus / bei jedem Start / täglich / wöchentlich / monatlich), nur wenn sich
 *                etwas geändert hat, Anzahl aufbewahrter Backups; Programm: Bilder mitsichern; Browser: Sicherungsordner
 *   Speicher     Programm: Papierkorb nach x Tagen leeren, Belegung; Browser: Seitenversionen, Belegung, Aufräumen
 *   Formeln      Berechnung automatisch/manuell (wie Excel, F9), Bezüge auf Tabellen anderer Seiten (seit 1.26)
 *   Drucken      Vorgaben für Datei → Drucken: Papier, Ausrichtung, Ränder, Skalierung, Kopf-/Fusszeile (seit 1.26)
 *
 * Gespeichert wird alles im Ansichtszustand (Store.ui → Cache/zustand.json bzw. IndexedDB): Store.ui.sicherung,
 * Store.ui.versionen. Das Windows-Programm liest Store.ui.sicherung beim Start und stündlich aus zustand.json und
 * macht die automatischen Backups selbst (store.go); im Browser erledigt das AutoBackup unten. */

const Settings = {
  backupDefaults() {
    return Backend.kind === 'browser'
      ? { intervall: 'woche', nurAenderung: true, anzahl: 2 }   // Standard seit 1.42: wöchentlich, 2 Backups
      : { intervall: 'woche', nurAenderung: true, anzahl: 2, bilder: true, papierkorbTage: 30, optimieren: true };
  },
  /* beim Start: fehlende Werte ergänzen (ältere zustand.json kennen sie nicht) */
  init() {
    const s = Store.ui.sicherung && typeof Store.ui.sicherung === 'object' ? Store.ui.sicherung : {};
    Store.ui.sicherung = { ...this.backupDefaults(), ...s };
    Store.ui.versionen = { abstand: 10, max: 50, ...(Store.ui.versionen && typeof Store.ui.versionen === 'object' ? Store.ui.versionen : {}) };
  },
  INTERVALLE: [['aus', 'Aus (nur von Hand)'], ['start', 'Bei jedem Start'], ['tag', 'Täglich'], ['woche', 'Wöchentlich'], ['monat', 'Monatlich']],
  CATS: [['allgemein', 'Allgemein', 'sun'], ['sprache', 'Sprache', 'spellcheck'], ['seite', 'Seite', 'pageColor'], ['formeln', 'Formeln', 'fx'], ['drucken', 'Drucken', 'print'], ['sicherung', 'Sicherung', 'archive'], ['speicher', 'Speicher', 'save']],
  FILE_CATS: ['allgemein', 'sprache', 'seite', 'formeln', 'drucken'],   // interaktive Datei: keine Sicherung/Speicher

  /* Suche oben (1.75): alle Einstellungen als Liste [{ cat, catLabel, label, hint }] – die Seiten der Einstellungen
     werden ohne Fenster aufgebaut und nur ihre Beschriftungen gelesen */
  async index() {
    if (this._index) return this._index;
    const out = [];
    try { await this.show(null, { collect: out }); } catch (e) { /* */ }
    this._index = out;
    return out;
  },
  async show(cat, opts = {}) {
    if (!opts.collect && !Store.complete) return Store.gate(() => this.show(cat, opts));   // alle Seiten nötig (Laden in Stufen, 1.30)
    if (Store.readOnly && !opts.collect) return;
    const u = Store.ui;
    // Entwurf: erst mit OK übernehmen
    const v = {
      theme: u.theme === 'hell' ? 'hell' : 'dunkel', inkFix: u.inkFix !== false, sidebar: u.sidebar !== false, pageListSide: u.pageListSide || 'links',
      pageHead: !!u.pageHead, tabsMin: !!u.tabsMin,
      snap: !!u.snap, scrollbars: u.scrollbars !== false, showAnchors: !!u.showAnchors, linkRoute: u.linkRoute !== false,
      sicherung: { ...u.sicherung }, versionen: { ...u.versionen },
      berechnung: u.berechnung === 'manuell' ? 'manuell' : 'auto', drucken: Print.opts(),
      spell: { ...Spell.opts(), langs: Spell.opts().langs.slice() },
    };
    let folder = Backend.kind === 'browser' && !opts.collect ? await AutoBackup.folder(false, true) : null;
    const builder = (d, close) => {
      const nav = el('div', { class: 'opt-nav' }), pane = el('div', { class: 'opt-pane' });
      const row = (label, ctl, hint) => el('div', { class: 'opt-row' }, el('div', { class: 'opt-l' }, el('span', { text: label }), hint ? el('small', { text: hint }) : null), el('div', { class: 'opt-c' }, ctl));
      const check = (obj, key, label, hint) => {
        const c = el('input', { type: 'checkbox' });
        c.checked = !!obj[key];
        c.addEventListener('change', () => { obj[key] = c.checked; });
        return el('label', { class: 'opt-check' }, c, el('span', {}, el('span', { text: label }), hint ? el('small', { text: hint }) : null));
      };
      const radios = (obj, key, opts, col) => {
        const name = uid('r');
        return el('div', { class: 'opt-radios' + (col ? ' col' : '') }, ...opts.map(([val, label]) => {
          const r = el('input', { type: 'radio', name, value: val });
          r.checked = obj[key] === val;
          r.addEventListener('change', () => { if (r.checked) { obj[key] = val; refreshDeps(); } });
          return el('label', {}, r, el('span', { text: label }));
        }));
      };
      const num = (obj, key, min, max, unit) => {
        const i = el('input', { type: 'number', min, max, step: 1, class: 'opt-num' });
        i.value = obj[key];
        i.addEventListener('change', () => { const n = clamp(Math.round(+i.value || min), min, max); obj[key] = n; i.value = n; });
        return el('span', { class: 'opt-numw' }, i, unit ? el('span', { text: unit }) : null);
      };
      const head = (t, sub) => [el('h3', { text: t }), sub ? el('p', { class: 'opt-sub', text: sub }) : null];
      const info = (id) => el('p', { class: 'opt-info', id, text: '…' });
      let refreshDeps = () => { };

      const build = {
        allgemein: () => [
          ...head('Design'),
          row('Farben', radios(v, 'theme', [['hell', 'Hell'], ['dunkel', 'Dunkel']])),
          check(v, 'inkFix', 'Lesbare Farben', 'Kaum lesbare Schriftfarben auf dem Hintergrund heller bzw. dunkler anzeigen (gespeichert bleibt die gewählte Farbe)'),
          ...head('Navigation'),
          check(v, 'sidebar', 'Notizbücher und Seitenliste anzeigen'),
          row('Seitenliste', radios(v, 'pageListSide', [['links', 'Links neben der Seite'], ['rechts', 'Rechts (wie OneNote)']])),
          ...head('Tabs'),
          check(v, 'pageHead', 'Seitentitel und Datum über der Seite', 'Sonst stehen sie nur im Tab (Doppelklick auf den Tab = umbenennen, Rechtsklick = Datum ändern)'),
          check(v, 'tabsMin', 'Tableiste eingeklappt', 'Nur ein Strich mit Pfeilchen – das Pfeilchen klappt die Tabs wieder auf'),
          Backend.kind === 'datei' ? [...head('Speicherort'), ...this.whereRows()] : null,
        ].flat(),
        sprache: () => {
          // Rechtschreibung (1.38): Sprachen, Fachwörter, eigenes Wörterbuch, Zustand der Wörterbücher
          const sp = v.spell;
          const langBox = el('div', { class: 'opt-radios col' }, ...Object.entries(SPELL_LANGS).map(([k, L]) => {
            const c = el('input', { type: 'checkbox' });
            c.checked = sp.langs.includes(k);
            c.addEventListener('change', () => { sp.langs = c.checked ? [...new Set([...sp.langs, k])] : sp.langs.filter(x => x !== k); if (!sp.langs.length) { sp.langs = [k]; c.checked = true; } });
            return el('label', {}, c, el('span', { text: L.label }));
          }));
          return [
            ...head('Rechtschreibung', 'Wie in OneNote: unbekannte Wörter werden rot unterwellt, Rechtsklick zeigt Vorschläge, F7 (Überprüfen → Rechtschreibung) geht die Seite Wort für Wort durch.'),
            check(sp, 'on', 'Rechtschreibung prüfen', 'Fehler beim Schreiben rot unterwellen'),
            row('Prüfen in', langBox, 'Ein Wort gilt als richtig, wenn es eine der gewählten Sprachen kennt – gut für gemischte Texte und englische Fachbegriffe'),
            check(sp, 'fach', 'Fachwörter', 'Naturwissenschaften (Chemie, Physik, Biologie), Mathematik, Medizin, Informatik, Element- und Molekülnamen'),
            ...head('Eigenes Wörterbuch', `${sp.user.length} Wörter – „Zum Wörterbuch hinzufügen“ im Rechtsklick-Menü ergänzt es`),
            el('div', { class: 'opt-btns' }, el('button', { class: 'btn', text: 'Bearbeiten …', onclick: () => { close(false); Spell.userDialog(); } })),
            ...head('Wörterbücher', 'LibreOffice-Wörterbücher (Hunspell) – beim ersten Gebrauch einmal aus dem Internet geladen, danach ' + (Backend.kind === 'server' ? 'im Ordner Cache/Woerterbuch.' : 'im Browser gespeichert.')),
            el('pre', { class: 'opt-info opt-pre', text: Spell.status() }),
            el('div', { class: 'opt-btns' }, el('button', { class: 'btn', text: 'Neu laden', onclick: () => { close(false); Spell.reload(); } })),
          ];
        },
        seite: () => [
          ...head('Bearbeiten'),
          check(v, 'snap', 'Am Raster ausrichten', 'Felder rasten beim Verschieben an den Punkten/Linien der Seite ein'),
          check(v, 'linkRoute', 'Verbindungen weichen aus', 'Verbindungslinien führen um Felder herum statt quer darüber'),
          ...head('Anzeige'),
          check(v, 'scrollbars', 'Bildlaufleisten', 'Unten und rechts; der Bereich ist das Rechteck um alle Objekte'),
          check(v, 'showAnchors', 'Ankerpunkte immer anzeigen', 'Ecken des Rechtecks um alle Objekte (sonst nur beim Scrollen)'),
        ],
        formeln: () => [
          ...head('Berechnung', 'Wie Excel: Tabellen rechnen nur neu, was von einer Änderung abhängt – auch über Seiten hinweg. Diagramme werden nur neu gezeichnet, wenn sich ihr Bereich ändert.'),
          row('Arbeitsmappe berechnen', radios(v, 'berechnung', [['auto', 'Automatisch'], ['manuell', 'Manuell – mit F9 berechnen (Strg+Alt+F9 = alles neu)']], true), 'Manuell lohnt sich bei sehr grossen Plänen mit vielen Formeln'),
          ...head('Bezüge auf andere Seiten'),
          el('p', { class: 'opt-sub', text: 'In einer Formel liest =[Seite]Tabelle1!A1 eine Zelle der Tabelle „Tabelle1“ auf der Seite „Seite“ (wie in Excel eine andere Arbeitsmappe). Mit Leerzeichen: =\'[Fabrik A]Tabelle 1\'!B2. Gibt es mehrere Seiten mit dem Titel, wählt [Abschnitt/Seite] die richtige; sonst gilt die im selben Abschnitt.' }),
          el('p', { class: 'opt-sub', text: 'Tipp: Zellen kopieren, auf der anderen Seite Rechtsklick → „Verknüpfung einfügen“. Nach [ schlägt die Formel Seiten und Tabellen vor. Umbenennen von Seiten, Abschnitten und Tabellen passt die Bezüge an.' }),
        ],
        drucken: () => {
          const pr = v.drucken;
          const sel = (key, list) => { const x = el('select', { class: 'pr-sel' }); for (const [val, l] of list) x.append(el('option', { value: val, text: l })); x.value = pr[key]; x.addEventListener('change', () => { pr[key] = x.value; }); return x; };
          return [
            ...head('Seite einrichten', 'Vorgaben für Datei → Drucken (Strg+P). Im Druckdialog lässt sich alles für den einzelnen Ausdruck ändern; Drucker und Exemplare wählst du danach im Druckfenster des Systems.'),
            row('Papier', sel('papier', Object.keys(Print.PAPER).map(k => [k, `${k} (${Print.PAPER[k][0]} × ${Print.PAPER[k][1]} mm)`]))),
            row('Ausrichtung', sel('ausrichtung', [['hoch', 'Hochformat'], ['quer', 'Querformat']])),
            row('Ränder', sel('raender', [['normal', 'Normal (15 mm)'], ['schmal', 'Schmal (7 mm)'], ['breit', 'Breit (25 mm)']])),
            row('Skalierung', sel('skalierung', [['breite', 'An Blattbreite anpassen'], ['blatt', 'Ganze Seite auf ein Blatt'], ['original', 'Originalgrösse (100 %)'], ['prozent', 'Eigene Grösse']])),
            row('Eigene Grösse', num(pr, 'prozent', 10, 400, '%')),
            ...head('Kopf- und Fusszeile'),
            check(pr, 'kopf', 'Titel und Datum oben'), check(pr, 'fuss', 'Seitenzahl unten („Seite 1 von 3“)'),
            ...head('Mitdrucken'),
            check(pr, 'hintergrund', 'Seitenfarbe und Linien/Raster'), check(pr, 'gitter', 'Gitternetzlinien von Tabellen (Tabelle drucken)'),
            el('div', { class: 'opt-btns' }, el('button', { class: 'btn primary', text: 'Drucken …', onclick: () => { Store.ui.drucken = { ...pr }; close(false); setTimeout(() => Print.show(), 0); } })),
          ];
        },
        sicherung: () => {
          const s = v.sicherung, browser = Backend.kind === 'browser';
          const keepRow = row('Aufbewahren', num(s, 'anzahl', 1, 100, 'neueste Backups'), browser ? 'gilt für den Sicherungsordner – ältere werden dort gelöscht' : 'ältere Backups in Cache/Backups werden gelöscht');
          const onlyChg = check(s, 'nurAenderung', 'Nur wenn sich seit dem letzten Backup etwas geändert hat');
          refreshDeps = () => { const off = s.intervall === 'aus'; onlyChg.classList.toggle('dis', off); };
          const out = [
            ...head('Automatisches Backup', browser
              ? 'Die Webseite speichert alles nur in diesem Browser. Backups schützen vor dem Löschen der Browserdaten und bringen deine Notizen auf einen anderen Computer – auch ins Windows-Programm.'
              : 'Backups sind ZIP-Dateien des Saves-Ordners in Cache/Backups – im selben Format wie im Browser (dort mit „Backup laden“ oder „Importieren“ einlesen).'),
            row('Wann', radios(s, 'intervall', this.INTERVALLE, true)), onlyChg, keepRow,
          ];
          if (!browser) out.push(check(s, 'bilder', 'Bilder und Anhänge mitsichern', 'Empfohlen – dann ist jedes Backup vollständig. Ohne Bilder sind Backups viel kleiner, brauchen aber die Bilder im Saves-Ordner.'));
          if (browser) {
            const fname = el('b', { text: folder ? folder.name : 'keiner – Backups werden heruntergeladen' });
            const pickBtn = el('button', { class: 'btn', text: folder ? 'Anderen Ordner …' : 'Ordner wählen …' });
            const clearBtn = el('button', { class: 'btn', text: 'Keinen Ordner', hidden: !folder });
            pickBtn.addEventListener('click', async () => {
              try {
                const h = await window.showDirectoryPicker({ id: 'kt-backup', mode: 'readwrite', startIn: 'documents' });
                await AutoBackup.setFolder(h); folder = h;
                fname.textContent = h.name; pickBtn.textContent = 'Anderen Ordner …'; clearBtn.hidden = false;
              } catch (e) { if (e && e.name !== 'AbortError') UI.toast('Ordner konnte nicht gewählt werden: ' + e.message, 4000); }
            });
            clearBtn.addEventListener('click', async () => { await AutoBackup.setFolder(null); folder = null; fname.textContent = 'keiner – Backups werden heruntergeladen'; pickBtn.textContent = 'Ordner wählen …'; clearBtn.hidden = true; });
            out.push(...head('Sicherungsordner'),
              window.showDirectoryPicker
                ? el('div', {}, el('p', { class: 'opt-sub', text: 'Mit einem Sicherungsordner (z. B. in OneDrive oder auf einem USB-Stick) speichert KnowledgeTree die automatischen Backups selbst. Ohne Ordner erinnert es dich und lädt das Backup auf Knopfdruck herunter.' }),
                  el('div', { class: 'opt-folder' }, el('span', { text: 'Ordner: ' }), fname), el('div', { class: 'opt-btns' }, pickBtn, clearBtn))
                : el('p', { class: 'opt-sub', text: 'Dieser Browser kann nicht selbst in einen Ordner speichern (geht in Chrome und Edge). KnowledgeTree erinnert dich, wenn ein Backup fällig ist, und lädt es auf Knopfdruck herunter.' }));
          }
          if (!browser) out.push(...head('Speicherort der Backups'), this.pathRow('Backups', Store.info.backups, 'backups', 'Jede Sicherung ist ein Ordner mit einer KnowledgeTree-Datei je Abschnitt'));
          out.push(...head('Jetzt'), info('opt-bk-info'),
            el('div', { class: 'opt-btns' },
              el('button', { class: 'btn primary', text: 'Backup jetzt erstellen', onclick: async () => { Store.ui.sicherung = { ...v.sicherung }; await App.createBackup(); this.fillInfo(); } }),
              el('button', { class: 'btn', text: 'Backup laden …', onclick: () => { close(false); App.restoreBackup(); } }),
              browser ? null : el('button', { class: 'btn', text: 'Ordner öffnen', onclick: () => Backend.openFolder('backups') })));
          setTimeout(refreshDeps, 0);
          return out;
        },
        speicher: () => {
          if (Backend.kind === 'browser') {
            return [
              ...head('Speicherort'), ...this.whereRows(),
              ...head('Seitenversionen', 'Frühere Stände einer Seite (Datei → Informationen → Seitenversionen oder Rechtsklick auf die Seite). Mehr Versionen brauchen mehr Speicher.'),
              row('Höchstens alle', num(v.versionen, 'abstand', 1, 1440, 'Minuten eine Version')),
              row('Pro Seite', num(v.versionen, 'max', 1, 500, 'Versionen behalten')),
              ...head('Speicher'), info('opt-st-info'),
              el('div', { class: 'opt-btns' }, el('button', { class: 'btn', text: 'Papierkorb & Aufräumen …', onclick: () => { close(false); App.showTrash(); } })),
            ];
          }
          return [
            ...head('Speicherort', 'Hier liegen deine Notizen – ein Abschnitt ist ein Ordner mit einer Datei je Seite und seinen Bildern (_Bilder). Einen Abschnitt-Ordner kannst du einfach kopieren und weitergeben.'), ...this.whereRows(),
            ...head('Papierkorb', 'Gelöschte Seiten und Gruppen liegen in Cache/Papierkorb (zum Zurückholen zurück in den Saves-Ordner kopieren).'),
            row('Endgültig löschen nach', num(v.sicherung, 'papierkorbTage', 0, 3650, 'Tagen (0 = nie)'), 'geprüft beim Start des Programms'),
            // Speicher optimieren (1.39, optimize.go): beim Beenden sortieren und doppelte Dateien zusammenlegen
            ...head('Speicher optimieren', 'Nach dem Schliessen sortiert KnowledgeTree die Bilder und Anhänge in die Ordner ihrer Abschnitte und legt gleiche Dateien (in mehreren Abschnitten, im Papierkorb, in Backups) zu harten Verknüpfungen zusammen: der Inhalt liegt nur einmal auf der Festplatte. Jede Verknüpfung ist eine vollwertige Datei – Ordner lassen sich weiterhin einfach herauskopieren, weitergeben oder löschen, ohne dass anderswo etwas fehlt.'),
            check(v.sicherung, 'optimieren', 'Beim Beenden Speicher optimieren', 'nur neue und geänderte Dateien (Schnellprüfung) – startest du das Programm vorher wieder, wird unterbrochen und beim nächsten Schliessen weitergemacht'),
            info('opt-opt-info'),
            el('div', { class: 'opt-btns' }, el('button', { class: 'btn', text: 'Jetzt optimieren', onclick: async (e) => {
              const b = e.currentTarget, t = document.getElementById('opt-opt-info');
              b.disabled = true; if (t) t.textContent = 'Optimiere …';
              try { const r = await Backend.optimize(); UI.toast(this.optText(r), 4000); } catch (err) { UI.toast('Optimieren nicht möglich: ' + (err.message || err)); }
              b.disabled = false; this.fillInfo();
            } })),
            ...head('Speicher'), info('opt-st-info'),
          ];
        },
      };
      const showCat = (id) => {
        for (const b of nav.children) b.classList.toggle('on', b.dataset.cat === id);
        // Handy: Register waagrecht scrollbar – das gewählte ins Bild holen (1.30)
        setTimeout(() => { const on = nav.querySelector('.on'); if (on && nav.scrollWidth > nav.clientWidth) on.scrollIntoView({ block: 'nearest', inline: 'center' }); }, 0);
        pane.innerHTML = '';
        pane.append(...build[id]().filter(Boolean));
        setTimeout(() => this.fillInfo(), 0);   // erst wenn der Dialog im Dokument steht
        this._cat = id;
      };
      for (const [id, label, ic] of this.CATS.filter(c => Backend.kind !== 'datei' || this.FILE_CATS.includes(c[0]))) nav.append(el('button', { class: 'opt-cat', dataset: { cat: id }, html: icon(ic, 18) + `<span>${label}</span>`, onclick: () => showCat(id) }));
      d.append(el('h2', { text: 'Einstellungen' }), el('div', { class: 'opt-body' }, nav, pane),
        el('div', { class: 'dlg-btns' }, el('button', { class: 'btn', text: 'Abbrechen', onclick: () => close(false) }), el('button', { class: 'btn primary', text: 'OK', autofocus: true, onclick: () => close(true) })));
      d.classList.add('opt-dlg');
      const cats = [...nav.children].map(b => b.dataset.cat);
      if (opts.collect) {
        // nur lesen: Beschriftungen jeder Seite (Zeilen, Häkchen, Überschriften)
        for (const id of cats) {
          const catLabel = (this.CATS.find(c => c[0] === id) || [])[1] || id;
          const tmp = el('div');
          try { tmp.append(...build[id]().filter(Boolean)); } catch (e) { continue; }
          const seen = new Set();
          const add = (label, hint) => { label = String(label || '').trim(); if (!label || seen.has(label)) return; seen.add(label); opts.collect.push({ cat: id, catLabel, label, hint: String(hint || '').trim() }); };
          for (const r of tmp.querySelectorAll('.opt-row')) { const l = r.querySelector('.opt-l > span'), h = r.querySelector('.opt-l > small'); add(l && l.textContent, (h ? h.textContent + ' ' : '') + [...r.querySelectorAll('.opt-c label, .opt-c option')].map(x => x.textContent).join(' · ')); }
          for (const c of tmp.querySelectorAll('.opt-check')) { const sp = c.querySelector(':scope > span > span'), h = c.querySelector('small'); add(sp && sp.textContent, h && h.textContent); }
          for (const h of tmp.querySelectorAll('h3, .opt-h')) add(h.textContent, '');
        }
        return;
      }
      showCat(cats.includes(cat) ? cat : cats.includes(this._cat) ? this._cat : 'allgemein');
      // Suche oben: die gesuchte Einstellung hervorheben
      if (opts.find) setTimeout(() => {
        const want = String(opts.find).trim();
        const hit = [...pane.querySelectorAll('.opt-row, .opt-check, h3, .opt-h')].find(x => { const l = x.querySelector('.opt-l > span, :scope > span > span'); return (l ? l.textContent : x.textContent).trim() === want; });
        if (hit) { hit.classList.add('opt-hit'); hit.scrollIntoView({ block: 'center' }); setTimeout(() => hit.classList.remove('opt-hit'), 2400); }
      }, 40);
    };
    if (opts.collect) { builder(el('div'), () => {}); return; }
    const ok = await UI.dialog(builder, { wide: true });
    if (ok) this.apply(v);
  },

  /* Speicherort (1.36): wo die Notizen liegen – Pfad zum Markieren/Kopieren, im Programm mit „Öffnen“ */
  pathRow(label, path, open, hint) {
    const p = el('code', { class: 'opt-path', text: path || '–', title: path || '' });
    const btns = el('span', { class: 'opt-pbtns' },
      path && navigator.clipboard ? el('button', { class: 'btn', type: 'button', text: 'Kopieren', title: 'Pfad in die Zwischenablage', onclick: () => navigator.clipboard.writeText(path).then(() => UI.toast('Pfad kopiert', 1500), () => UI.toast('Kopieren nicht möglich')) }) : null,
      open && Backend.openFolder ? el('button', { class: 'btn', type: 'button', text: 'Öffnen', title: 'Ordner im Explorer öffnen', onclick: () => Backend.openFolder(open) }) : null);
    return el('div', { class: 'opt-where' }, el('div', { class: 'opt-wl' }, el('b', { text: label }), hint ? el('small', { text: hint }) : null), el('div', { class: 'opt-wp' }, p, btns));
  },
  /* Ordner, in dem der Browser die IndexedDB dieser Adresse ablegt (1.39) – je nach Browser und Betriebssystem */
  browserDisk(br) {
    const u = navigator.userAgent, plat = (navigator.userAgentData && navigator.userAgentData.platform) || navigator.platform || '';
    const os = /Android/i.test(u) ? 'android' : /iPhone|iPad|iPod/i.test(u) || (/Mac/i.test(plat) && navigator.maxTouchPoints > 1) ? 'ios' : /Win/i.test(plat) || /Windows/i.test(u) ? 'win' : /Mac/i.test(plat) ? 'mac' : 'linux';
    const ff = /Firefox/i.test(br), safari = /Safari/i.test(br) && !/Chrome|Chromium|Edg/i.test(u);
    // Chromium-Ordnername der Adresse: Schema_Host_Port (0 = Standardport), z. B. https_example.com_0
    const L = location, key = L.protocol === 'file:' ? 'file__0' : `${L.protocol.replace(':', '')}_${L.hostname}_${L.port || 0}`;
    const chromium = {
      win: { Edge: '%LOCALAPPDATA%\\Microsoft\\Edge\\User Data\\Default\\IndexedDB', Opera: '%APPDATA%\\Opera Software\\Opera Stable\\IndexedDB', Brave: '%LOCALAPPDATA%\\BraveSoftware\\Brave-Browser\\User Data\\Default\\IndexedDB', _: '%LOCALAPPDATA%\\Google\\Chrome\\User Data\\Default\\IndexedDB' },
      mac: { Edge: '~/Library/Application Support/Microsoft Edge/Default/IndexedDB', Brave: '~/Library/Application Support/BraveSoftware/Brave-Browser/Default/IndexedDB', _: '~/Library/Application Support/Google/Chrome/Default/IndexedDB' },
      linux: { Edge: '~/.config/microsoft-edge/Default/IndexedDB', Brave: '~/.config/BraveSoftware/Brave-Browser/Default/IndexedDB', _: '~/.config/google-chrome/Default/IndexedDB' },
    };
    const sep = os === 'win' ? '\\' : '/';
    if (os === 'ios') return { path: `${br} auf iPhone/iPad – im Speicher der App, nicht als Ordner erreichbar`, hint: 'Einstellungen → Safari → Erweitert → Website-Daten zeigt den Eintrag dieser Adresse. Sichern/übertragen: Datei → Speichern → Backup erstellen (lädt eine Datei herunter, „Dateien“-App).' };
    if (os === 'android') return { path: `${br} auf Android – im geschützten App-Speicher, nicht als Ordner erreichbar`, hint: 'Browser-Einstellungen → Website-Einstellungen → Speicher zeigt den Eintrag dieser Adresse. Sichern/übertragen: Datei → Speichern → Backup erstellen (Ordner „Downloads“).' };
    if (ff) return { path: (os === 'win' ? '%APPDATA%\\Mozilla\\Firefox\\Profiles\\<Profil>\\storage\\default\\' : os === 'mac' ? '~/Library/Application Support/Firefox/Profiles/<Profil>/storage/default/' : '~/.mozilla/firefox/<Profil>/storage/default/') + `${L.protocol === 'file:' ? 'file++++…' : L.protocol.replace(':', '') + '+++' + L.hostname + (L.port ? '+' + L.port : '')}${sep}idb`, hint: 'Firefox: das Profil steht unter about:profiles (Stammordner). Die Dateien sind im Format des Browsers – lesbar sichern geht über Datei → Speichern → Backup erstellen.' };
    if (safari) return { path: '~/Library/Safari/Databases/___IndexedDB/ (neuere macOS: ~/Library/WebKit/WebsiteData/IndexedDB/)', hint: 'Safari: je Adresse ein Unterordner. Die Dateien sind im Format des Browsers – lesbar sichern geht über Datei → Speichern → Backup erstellen.' };
    const tbl = chromium[os] || chromium.win, base = Object.keys(tbl).find(k => k !== '_' && br.includes(k)) ? tbl[Object.keys(tbl).find(k => k !== '_' && br.includes(k))] : tbl._;
    return { path: `${base}${sep}${key}.indexeddb.leveldb  (Bilder: ${key}.indexeddb.blob)`, hint: `${br}: „Default“ ist das erste Profil, sonst „Profile 1“, „Profile 2“ … (chrome://version → Profilpfad). Die Dateien sind im Format des Browsers – lesbar sichern geht über Datei → Speichern → Backup erstellen.` };
  },
  whereRows() {
    const i = Store.info || {};
    if (Backend.kind === 'server') return [
      this.pathRow('Notizen (Saves)', i.saves, 'saves', 'Notizbücher, Abschnittsgruppen und Abschnitte als Ordner, je Seite eine Datei; Bilder im Ordner _Bilder des Abschnitts'),
      this.pathRow('Cache', i.cache, 'cache', 'Einstellungen (zustand.json), Verlauf für Strg+Z, Protokoll'),
      this.pathRow('Backups', i.backups, 'backups'),
      this.pathRow('Papierkorb', i.papierkorb, 'papierkorb'),
      this.pathRow('Programm', i.basis, 'programm', 'Ordner mit KnowledgeTree.exe – Saves und Cache liegen daneben'),
    ];
    if (Backend.kind === 'datei') return [
      this.pathRow('Interaktive Datei', Backend.fileName || (i.datei && i.datei.name) || 'KnowledgeTree-Datei', null, 'Änderungen bleiben in diesem Fenster, bis du die Datei speicherst (Datei → Speichern) – sie wird dann neu heruntergeladen'),
    ];
    const br = (() => { const b = navigator.userAgentData && navigator.userAgentData.brands ? navigator.userAgentData.brands.map(x => x.brand).find(x => !/Not.?A.?Brand|Chromium/i.test(x)) : null; if (b) return b; const u = navigator.userAgent; return /Edg\//.test(u) ? 'Edge' : /Firefox\//.test(u) ? 'Firefox' : /Chrome\//.test(u) ? 'Chrome' : /Safari\//.test(u) ? 'Safari' : 'Browser'; })();
    const disk = this.browserDisk(br);
    return [
      this.pathRow('Notizen', `${br} · IndexedDB „KnowledgeTree“ · ${location.origin}${location.pathname}`, null, 'Nur in diesem Browser auf diesem Gerät. Eine andere Adresse, ein anderer Browser oder ein privates Fenster haben einen eigenen, leeren Speicher. Browserdaten löschen löscht auch die Notizen – darum Backups machen.'),
      // Wo der Browser das auf der Festplatte ablegt (1.39) – zum Nachschauen; die Dateien sind ein Format des Browsers,
      // keine lesbaren Seiten: weitergeben/sichern geht über Datei → Backup bzw. Exportieren
      this.pathRow('Ordner auf dem Gerät', disk.path, null, disk.hint),
      el('div', { class: 'opt-where' }, el('div', { class: 'opt-wl' }, el('b', { text: 'Was darin liegt' }), el('small', { text: 'Datenbank „KnowledgeTree“ (IndexedDB) dieser Adresse' })),
        el('ul', { class: 'opt-list' },
          el('li', { text: 'saves_struktur – Notizbücher, Abschnitte, Reihenfolge' }),
          el('li', { text: 'saves_seiten – eine Eintragung je Seite (Text, Zeichnungen, Tabellen …)' }),
          el('li', { text: 'saves_bilder – Bilder und Anhänge (jedes gleiche Bild nur einmal)' }),
          el('li', { text: 'versionen – frühere Stände der Seiten · papierkorb – Gelöschtes' }),
          el('li', { text: 'cache – Einstellungen, Verlauf für Strg+Z' }),
          el('li', { text: 'Datenbank „KnowledgeTree-Woerterbuch“ – Wörterbücher der Rechtschreibprüfung' }))),
      el('p', { class: 'opt-info', id: 'opt-bkdir-info', text: 'Backups: …' }),
    ];
  },

  /* Entwurf übernehmen: Ansicht über die vorhandenen Befehle (gleiche Wirkung wie im Menüband), Rest direkt */
  apply(v) {
    const u = Store.ui;
    if (v.theme !== (u.theme === 'hell' ? 'hell' : 'dunkel')) Cmd.run('theme', v.theme);
    if (v.pageListSide !== (u.pageListSide || 'links')) Cmd.run('pageListSide', v.pageListSide);
    const toggles = [['inkFix', u.inkFix !== false], ['sidebar', u.sidebar !== false], ['scrollbars', u.scrollbars !== false], ['showAnchors', !!u.showAnchors], ['linkRoute', u.linkRoute !== false]];
    for (const [k, cur] of toggles) if (v[k] !== cur) Cmd.run(k);
    if (v.snap !== !!u.snap) { u.snap = v.snap; }
    if (v.pageHead !== !!u.pageHead) { u.pageHead = v.pageHead; App.applyTheme(); Panes.renderStrips(); }
    if (v.tabsMin !== !!u.tabsMin) Panes.toggleMin(v.tabsMin);
    { const o = Spell.opts(), n = v.spell; if (n.on !== o.on || n.fach !== o.fach || n.langs.join() !== o.langs.join()) Spell.setOpts({ on: n.on, fach: n.fach, langs: n.langs }); }
    u.sicherung = { ...v.sicherung };
    u.versionen = { ...v.versionen };
    u.drucken = { ...v.drucken };
    if (v.berechnung !== (u.berechnung === 'manuell' ? 'manuell' : 'auto')) Cmd.run('xlCalcMode', v.berechnung);
    UiState.save();   // sofort: das Programm liest die Sicherungs-Einstellungen aus zustand.json
    AutoBackup.check();
    Ribbon.refresh();
    UI.toast('Einstellungen gespeichert', 2000);
  },

  /* Ergebnis des Optimierens in Worten (1.39) */
  optText(r) {
    if (!r) return '';
    const p = [];
    p.push(r.verknuepft ? `${r.verknuepft} doppelte Datei${r.verknuepft === 1 ? '' : 'en'} zusammengelegt, ${KtFile.size(r.gespart)} frei` : 'keine doppelten Dateien');
    if (r.zugeordnet) p.push(`${r.zugeordnet} Bild${r.zugeordnet === 1 ? '' : 'er'} einsortiert`);
    if (r.aufgeraeumt) p.push(`${r.aufgeraeumt} Zwischendatei${r.aufgeraeumt === 1 ? '' : 'en'} entfernt`);
    if (r.unterbrochen) p.push('unterbrochen (neu gestartet) – weiter beim nächsten Schliessen');
    else if (r.abgebrochen) p.push('Rest beim nächsten Mal');
    if (r.fehler) p.push(r.fehler);
    return p.join(' · ');
  },

  /* Belegung und letztes Backup anzeigen (wird nachgeladen) */
  async fillInfo() {
    const bk = document.getElementById('opt-bk-info'), st = document.getElementById('opt-st-info');
    const ago = (t) => { if (!t) return 'noch nie'; const d = (Date.now() - t) / 864e5; return new Date(t).toLocaleString('de-CH', { dateStyle: 'medium', timeStyle: 'short' }) + (d >= 1 ? ` (vor ${Math.floor(d)} Tag${Math.floor(d) === 1 ? '' : 'en'})` : ''); };
    try {
      if (Backend.kind === 'browser') {
        const bd = document.getElementById('opt-bkdir-info');
        if (bd) { const f = await AutoBackup.folder(false, true); bd.textContent = 'Backups: ' + (f ? `Sicherungsordner „${f.name}“ (Einstellungen → Sicherung)` : 'werden heruntergeladen (Ordner „Downloads“) – unter Sicherung lässt sich ein Ordner wählen'); }
        if (bk) bk.textContent = 'Letztes Backup: ' + ago((Store.ui.sicherungStand || {}).zeit);
        if (st && Backend.storageInfo) {
          const i = await Backend.storageInfo();
          st.textContent = i ? `Belegt: ${KtFile.size(i.usage)} von ca. ${KtFile.size(i.quota)} · ${i.persisted ? 'dauerhaft gespeichert' : 'der Browser darf bei Platzmangel aufräumen – Backups machen!'}` : '';
        }
        return;
      }
      const [list, sp] = await Promise.all([bk ? Backend.listBackups() : null, st || bk ? Backend.storage() : null]);
      if (bk && list) bk.textContent = `Letztes Backup: ${ago(list.length ? list[0].zeit : 0)} · ${list.length} Backup(s) in Cache/Backups, zusammen ${KtFile.size(sp ? sp.backups : list.reduce((a, b) => a + b.groesse, 0))}`;
      const oi = document.getElementById('opt-opt-info');
      if (oi && sp) oi.textContent = sp.optimiert ? `Zuletzt: ${ago(Date.parse(sp.optimiert.zeit))} – ${this.optText(sp.optimiert)}` : 'Zuletzt: noch nie';
      if (st && sp) st.textContent = `Saves: ${KtFile.size(sp.saves)} (davon Bilder ${KtFile.size(sp.bilder)}) · Papierkorb: ${KtFile.size(sp.papierkorb)} · Backups: ${KtFile.size(sp.backups)} · Cache gesamt: ${KtFile.size(sp.cache)}`;
    } catch (e) { if (bk) bk.textContent = ''; if (st) st.textContent = ''; }
  },
};

/* ---------------------------------------------------------------- automatisches Backup im Browser
 * Fällig nach Store.ui.sicherung.intervall (seit dem letzten Backup) und – wenn gewünscht – nur bei Änderungen.
 * Mit Sicherungsordner (und erteilter Erlaubnis) wird still dorthin gespeichert; sonst erscheint eine Erinnerung
 * mit „Jetzt sichern“ (Download). Geprüft 15 s nach dem Start und danach alle 30 Minuten. Das Windows-Programm
 * macht seine Backups selbst. */
const AutoBackup = {
  _handle: undefined, _startDone: false, _snooze: 0, busy: false,
  init(firstRun) {
    if (Backend.kind !== 'browser') return;
    if (!Store.ui.sicherungStand && firstRun) Store.ui.sicherungStand = { zeit: Date.now(), stand: this.stand() };   // ganz neu: nicht gleich erinnern
    setTimeout(() => this.check(), 15000);
    setInterval(() => this.check(), 30 * 60000);
  },
  /* gespeicherter Sicherungsordner (Handle in IndexedDB) – nur wenn die Erlaubnis da ist (ask: nachfragen; any: auch ohne) */
  async folder(ask, any) {
    if (Backend.kind !== 'browser' || !Backend.cacheGet || typeof window.showDirectoryPicker !== 'function') return null;
    if (this._handle === undefined) { try { this._handle = (await Backend.cacheGet('sicherungsordner')) || null; } catch (e) { this._handle = null; } }
    const h = this._handle;
    if (!h) return null;
    if (any) return h;
    try {
      let p = await h.queryPermission({ mode: 'readwrite' });
      if (p !== 'granted' && ask) p = await h.requestPermission({ mode: 'readwrite' });
      return p === 'granted' ? h : null;
    } catch (e) { return null; }
  },
  async setFolder(h) { this._handle = h || null; await Backend.cachePut('sicherungsordner', h || undefined); },
  /* Backups im Sicherungsordner (für „Backup laden“): Backup-Ordner (1.25) und ZIP-Dateien (1.24) */
  async folderList() {
    const h = await this.folder(false);
    if (!h) return [];
    const out = [];
    for await (const [n, fh] of h.entries()) {
      const m = /^KnowledgeTree-Backup_(\d{4}-\d\d-\d\d)_(\d\d)-(\d\d)/.exec(n);
      if (!m) continue;
      try {
        if (fh.kind === 'directory') {
          const entries = await ktDirEntries(fh);
          out.push({ name: n, ordner: true, groesse: entries.reduce((a, e) => a + e.size, 0), zeit: new Date(`${m[1]}T${m[2]}:${m[3]}:00`).getTime(), get: async () => ({ name: n, entries }) });
        } else if (/\.zip$/i.test(n)) { const f = await fh.getFile(); out.push({ name: n, groesse: f.size, zeit: f.lastModified, get: async () => f }); }
      } catch (e) { /* nicht lesbar → auslassen */ }
    }
    return out.sort((a, b) => b.zeit - a.zeit);
  },
  /* Kennung des Datenstands: Anzahl Seiten, letzte Änderung, Baum */
  stand() {
    let m = 0, n = 0;
    for (const p of Object.values(Store.pages)) { n++; if ((p.modified || 0) > m) m = p.modified || 0; }
    const t = JSON.stringify(Store.groups);
    let h = 0;
    for (let i = 0; i < t.length; i++) h = (h * 31 + t.charCodeAt(i)) | 0;
    return `${n}:${m}:${h}`;
  },
  done() { Store.ui.sicherungStand = { zeit: Date.now(), stand: this.stand() }; UiState.saveSoon(); this.hideReminder(); },
  due() {
    const c = Store.ui.sicherung || {}, last = Store.ui.sicherungStand || {};
    if (!c.intervall || c.intervall === 'aus') return false;
    if (c.intervall === 'start') { if (this._startDone) return false; }
    else if (Date.now() - (last.zeit || 0) < { tag: 864e5, woche: 7 * 864e5, monat: 30 * 864e5 }[c.intervall]) return false;
    if (c.nurAenderung && last.stand && last.stand === this.stand()) return false;
    return true;
  },
  async check() {
    if (Backend.kind !== 'browser' || !Store.loaded || Store.readOnly || this.busy || !Store.complete) return;
    if (typeof OneImport !== 'undefined' && OneImport.busy) return;
    if (!this.due()) { this._startDone = true; return; }
    this._startDone = true;
    const h = await this.folder(false);
    if (!h) { if (Date.now() > this._snooze) this.remind(); return; }
    this.busy = true;
    try {
      const msg = await Backend.backup({ folder: h, keep: Store.ui.sicherung.anzahl });
      this.done();
      UI.toast('Automatisches ' + msg, 4000);
    } catch (e) { console.warn('[KnowledgeTree] automatisches Backup:', e); this.remind(); }
    finally { this.busy = false; }
  },
  remind() {
    if (document.querySelector('.kt-remind')) return;
    const t = (Store.ui.sicherungStand || {}).zeit;
    const days = t ? Math.floor((Date.now() - t) / 864e5) : null;
    const bar = el('div', { class: 'kt-remind', role: 'status' },
      el('span', { class: 'kt-remind-ic', html: icon('archive', 18) }),
      el('span', { class: 'kt-remind-t', text: `Backup fällig – ${days == null ? 'noch kein Backup' : days < 1 ? 'letztes heute' : `letztes vor ${days} Tag${days === 1 ? '' : 'en'}`}. Deine Notizen sind nur in diesem Browser gespeichert.` }),
      el('button', { class: 'btn primary', text: 'Jetzt sichern', onclick: async () => { this.hideReminder(); await App.createBackup(); } }),
      el('button', { class: 'btn', text: 'Später', onclick: () => { this._snooze = Date.now() + 4 * 3600e3; this.hideReminder(); } }),
      el('button', { class: 'btn ico', title: 'Einstellungen', html: icon('settings', 16), onclick: () => { this.hideReminder(); Settings.show('sicherung'); } }));
    document.body.append(bar);
  },
  hideReminder() { const b = document.querySelector('.kt-remind'); if (b) b.remove(); },
};
