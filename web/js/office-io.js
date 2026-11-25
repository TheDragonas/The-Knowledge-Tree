'use strict';
/* Office-Dateien öffnen und speichern (1.72) – einfacher und übersichtlicher:
 *
 *   Öffnen:      ein Fenster mit Auswahlliste „Dateityp“ (wie im Öffnen-Dialog von Word/Excel/PowerPoint: alle Office-Dateien,
 *                alle Word-/Excel-/PowerPoint-Dateien oder ein einzelnes Format), Ablagefläche zum Hineinziehen, „Durchsuchen …“
 *                und „Neu erstellen“ (leeres Dokument / Tabelle / Präsentation). Die Liste filtert die Dateiauswahl.
 *   Speichern:   in „Datei → Informationen“ direkt Dateiname + Dateityp (Gruppen: neuestes Format, Varianten, ältere/andere
 *                Programme, Text/Web, PDF) + Speichern – ohne weiteres Fenster.
 *   Exportieren: im Export-Fenster (Format „Office-Datei“) je Programm eine Auswahlliste – voreingestellt das neueste Format. */
const OfficeIO = {
  /* [Schlüssel, Beschriftung, Endungen] – Gruppen wie im Öffnen-Dialog der Programme */
  OPEN: [
    [null, [['all', 'Alle Office-Dateien']]],
    ['Word', [['word', 'Alle Word-Dateien', '.docx,.docm,.dotx,.dotm,.doc,.dot,.rtf,.odt,.ott,.txt,.md'], ['docx', 'Word-Dokument (*.docx; *.docm)', '.docx,.docm'], ['dotx', 'Word-Vorlage (*.dotx; *.dotm)', '.dotx,.dotm'],
      ['doc', 'Word 97–2003 (*.doc; *.dot)', '.doc,.dot'], ['rtf', 'Rich Text Format (*.rtf)', '.rtf'], ['odt', 'OpenDocument-Text (*.odt; *.ott)', '.odt,.ott'], ['txt', 'Nur Text (*.txt)', '.txt'], ['md', 'Markdown (*.md)', '.md']]],
    ['Excel', [['excel', 'Alle Excel-Dateien', '.xlsx,.xlsm,.xltx,.xltm,.xls,.xlt,.ods,.ots,.csv,.tsv,.tab'], ['xlsx', 'Excel-Arbeitsmappe (*.xlsx; *.xlsm)', '.xlsx,.xlsm'], ['xltx', 'Excel-Vorlage (*.xltx; *.xltm)', '.xltx,.xltm'],
      ['xls', 'Excel 97–2003 (*.xls; *.xlt)', '.xls,.xlt'], ['ods', 'OpenDocument-Tabelle (*.ods; *.ots)', '.ods,.ots'], ['csv', 'CSV (Trennzeichen-getrennt) (*.csv)', '.csv'], ['tsv', 'Text (Tabstopp-getrennt) (*.tsv; *.tab)', '.tsv,.tab']]],
    ['PowerPoint', [['ppt', 'Alle PowerPoint-Dateien', '.pptx,.pptm,.ppsx,.ppsm,.potx,.potm,.ppt,.pps,.pot,.odp,.otp'], ['pptx', 'PowerPoint-Präsentation (*.pptx; *.pptm)', '.pptx,.pptm'], ['ppsx', 'Bildschirmpräsentation (*.ppsx; *.ppsm)', '.ppsx,.ppsm'],
      ['potx', 'PowerPoint-Vorlage (*.potx; *.potm)', '.potx,.potm'], ['ppt97', 'PowerPoint 97–2003 (*.ppt; *.pps; *.pot)', '.ppt,.pps,.pot'], ['odp', 'OpenDocument-Präsentation (*.odp; *.otp)', '.odp,.otp']]],
  ],
  openItem(k) { for (const [, items] of this.OPEN) { const it = items.find(x => x[0] === k); if (it) return it; } return this.OPEN[0][1][0]; },
  acceptOf(k) { return this.openItem(k)[2] || OfficePages.ACCEPT; },
  openHint(k) {
    const acc = this.acceptOf(k).split(',');
    const native = acc.filter(e => Ooxml.kindOfName('x' + e)), conv = acc.filter(e => !Ooxml.kindOfName('x' + e));
    if (!conv.length) return 'Wird direkt geöffnet – Änderungen werden verlustfrei in die Datei geschrieben.';
    if (!native.length) return 'Wird beim Öffnen in das neueste Format umgewandelt (' + [...new Set(conv.map(e => '.' + OfficeConvert.KIND[e.slice(1)]))].join(', ') + ') – das Original bleibt unverändert im Notizbuch.';
    return '.docx/.xlsx/.pptx werden direkt geöffnet, ältere und andere Formate in das neueste umgewandelt – das Original bleibt im Notizbuch.';
  },
  /* Auswahlliste „Dateityp“ zum Öffnen */
  openSelect(value) {
    const sel = el('select', { class: 'oio-type' });
    for (const [g, items] of this.OPEN) {
      const host = g ? el('optgroup', { label: g }) : sel;
      for (const [k, l] of items) host.append(el('option', { value: k, text: l }));
      if (g) sel.append(host);
    }
    sel.value = value && [...sel.options].some(o => o.value === value) ? value : 'all';
    return sel;
  },
  pick(accept) {
    return new Promise((res) => {
      const inp = el('input', { type: 'file', multiple: true, accept, style: { display: 'none' } });
      inp.addEventListener('change', () => { res([...inp.files]); inp.remove(); });
      document.body.append(inp);
      inp.click();
    });
  },
  /* Öffnen-Bereich (im Fenster und in „Datei → Öffnen“): Dateityp, Durchsuchen, Ablagefläche, Neu */
  openPanel(done = () => {}) {
    const box = el('div', { class: 'oio-open' });
    const sel = this.openSelect(Store.ui.officeOpenType);
    const hint = el('p', { class: 'bs-note oio-hint' });
    const upd = () => { hint.textContent = this.openHint(sel.value); };
    sel.addEventListener('change', () => { Store.ui.officeOpenType = sel.value; UiState.saveSoon(); upd(); });
    upd();
    const run = async (files) => {
      const ok = files.filter(f => OfficePages.isOffice(f.name)), bad = files.length - ok.length;
      if (bad) UI.toast(`${bad} Datei(en) übersprungen – keine Word-, Excel- oder PowerPoint-Datei`, 4000);
      if (!ok.length) return;
      done();
      await OfficePages.importFiles(ok);
    };
    const browse = el('button', { class: 'btn primary oio-browse', type: 'button', html: icon('folder', 16) + '<span>Durchsuchen …</span>' });
    browse.addEventListener('click', async () => run(await this.pick(this.acceptOf(sel.value))));
    const drop = el('div', { class: 'oio-drop', html: icon('import', 30) + '<b>Datei hierher ziehen</b><small>oder „Durchsuchen …“ – mehrere Dateien auf einmal gehen auch</small>' });
    drop.addEventListener('dragover', (e) => { e.preventDefault(); e.stopPropagation(); drop.classList.add('over'); });
    drop.addEventListener('dragleave', () => drop.classList.remove('over'));
    drop.addEventListener('drop', (e) => { e.preventDefault(); e.stopPropagation(); drop.classList.remove('over'); run([...(e.dataTransfer.files || [])]); });
    drop.addEventListener('click', () => browse.click());
    const mk = (fmt, ic, label) => { const b = el('button', { class: 'oio-new', type: 'button', html: icon(ic, 22) + `<span>${label}</span>` }); b.addEventListener('click', () => { done(); Cmd.run('newTypedPage', fmt); }); if (Store.readOnly) b.disabled = true; return b; };
    box.append(el('label', { class: 'sa-row' }, el('span', { text: 'Dateityp' }), sel), drop, el('div', { class: 'oio-row' }, browse, hint),
      el('div', { class: 'oio-sub', text: 'Oder neu erstellen' }), el('div', { class: 'oio-news' }, mk('docx', 'officeDoc', 'Word-Dokument'), mk('xlsx', 'table', 'Excel-Arbeitsmappe'), mk('pptx', 'slides', 'PowerPoint-Präsentation')));
    if (Store.readOnly) { browse.disabled = true; sel.disabled = true; }
    return box;
  },
  async openDialog() {
    if (Store.readOnly) return;
    await UI.dialog((d, close) => {
      d.classList.add('kt-saveas', 'oio-dlg');
      d.append(el('h2', { text: 'Office-Datei öffnen' }), this.openPanel(() => close(true)), el('div', { class: 'dlg-btns' }, el('button', { class: 'btn', type: 'button', text: 'Schliessen', onclick: () => close(null) })));
    });
  },

  /* Speichern unter direkt in „Datei → Informationen“ */
  savePanel(p) {
    const fmt = p.office.fmt;
    const box = el('div', { class: 'oio-save' });
    const name = el('input', { type: 'text', class: 'sa-name', value: (p.title || 'Datei').replace(/[<>:"/\\|?*\u0000-\u001f]+/g, '_').trim() });
    const sel = OfficeSaveAs.typeSelect(fmt, (Store.ui.officeSaveType || {})[fmt]);
    const hint = el('p', { class: 'bs-note sa-hint' });
    const upd = () => { hint.textContent = OfficeSaveAs.hintOf(fmt, sel.value); go.querySelector('span').textContent = sel.value === 'pdf' ? 'Drucken / PDF …' : 'Speichern'; };
    const go = el('button', { class: 'btn primary', type: 'button', html: icon('download', 16) + '<span>Speichern</span>' });
    sel.addEventListener('change', upd);
    go.addEventListener('click', async () => {
      Store.ui.officeSaveType = { ...(Store.ui.officeSaveType || {}), [fmt]: sel.value }; UiState.saveSoon();
      await Save.flushAll();
      if (sel.value === 'pdf') Backstage.close();
      try { await OfficeSaveAs.save(p, sel.value, name.value.trim() || 'Datei'); }
      catch (e) { console.error(e); UI.info('Speichern unter', `<p>Konnte nicht als ${escapeHtml(sel.value)} gespeichert werden:</p><p><code>${escapeHtml(e.message)}</code></p>`); }
    });
    name.addEventListener('keydown', (e) => { if (e.key === 'Enter') go.click(); });
    upd();
    box.append(el('label', { class: 'sa-row' }, el('span', { text: 'Dateiname' }), name), el('label', { class: 'sa-row' }, el('span', { text: 'Dateityp' }), sel), el('div', { class: 'oio-row' }, go, hint));
    return box;
  },

  /* Export-Fenster, Format „Office-Datei“: je Programm ein Dateityp (voreingestellt das neueste) */
  exportOpts(o) {
    o.officeTypes = { docx: 'docx', xlsx: 'xlsx', pptx: 'pptx', ...(Store.ui.exportOfficeTypes || {}) };
    const wrap = el('div', { class: 'oio-ex' });
    for (const [fmt, label] of [['docx', 'Word-Seiten als'], ['xlsx', 'Excel-Seiten als'], ['pptx', 'PowerPoint-Seiten als']]) {
      const sel = OfficeSaveAs.typeSelect(fmt, o.officeTypes[fmt], { noPdf: true, original: true });
      sel.dataset.fmt = fmt;
      sel.addEventListener('change', () => { o.officeTypes[fmt] = sel.value; });
      o.officeTypes[fmt] = sel.value;
      wrap.append(el('label', { class: 'ex-opt oio-exrow' }, el('span', { text: label }), sel));
    }
    return wrap;
  },
  /* eine Seite im gewünschten Dateityp → { name, blob } */
  async fileAs(pid, type) {
    const p = Store.pages[pid];
    if (!p || !p.office || !p.office.asset) return null;
    const fmt = p.office.fmt;
    if (!type || type === 'orig') return OfficePages.fileOf(pid, true);
    if (type === fmt && (p.office.name || '').toLowerCase().endsWith('.' + fmt)) return OfficePages.fileOf(pid, false);
    // Excel: Werte stammen aus der offenen Seite (Rechenwerk) – dafür kurz öffnen
    if (fmt === 'xlsx' && !OfficeSaveAs.MAIN[type] && Canvas.pageId !== pid) { App.openPage(pid); await new Promise(r => setTimeout(r, 120)); }
    const r = await OfficeSaveAs.build(Store.pages[pid], type);
    const base = (p.title || p.office.name.replace(/\.[^.]+$/, '') || 'Datei');
    return { name: base + '.' + r.ext, blob: r.blob };
  },
};
if (typeof module !== 'undefined') module.exports = { OfficeIO };
