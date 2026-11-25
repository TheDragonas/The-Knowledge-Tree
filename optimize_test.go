package main

// Speicher optimieren (1.39): doppelte Bilder werden harte Verknüpfungen, Abschnitt-Ordner bleiben einzeln
// vollständig, Löschen einer Verknüpfung lässt die anderen heil, Backups verknüpfen unveränderte Abschnitte

import (
	"bytes"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestOptimizeStorage(t *testing.T) {
	setupDirs(t)
	big := bytes.Repeat([]byte("Bildinhalt-"), 2000) // > 1 KB
	other := bytes.Repeat([]byte("anderes Bild"), 2000)
	A, B := img("a"), img("b")
	nb := filepath.Join(savesDir, "Notizbuch")
	writeFile(t, filepath.Join(nb, groupMetaFn), []byte(`{"typ":"KnowledgeTree-Gruppe","id":"gnb","name":"Notizbuch","art":"notebook"}`))
	for _, s := range []string{"Eins", "Zwei", "Drei"} {
		writeFile(t, filepath.Join(nb, s, groupMetaFn), []byte(`{"typ":"KnowledgeTree-Gruppe","id":"g`+s+`","name":"`+s+`","art":"section"}`))
		writeFile(t, filepath.Join(nb, s, "P"+pageSuffix), page("p"+s, "P"+s, A))
		writeFile(t, filepath.Join(nb, s, bilderFolder, A), big) // dreimal dieselbe Datei als Kopie
	}
	writeFile(t, filepath.Join(nb, "Drei", "Q"+pageSuffix), page("q", "Q", B))
	writeFile(t, filepath.Join(bilderDir, B), other) // noch im Eingang: wird beim Optimieren einsortiert (die 1-Byte-Zwischendatei unten wird entfernt)
	old := filepath.Join(nb, "Eins", "halb.seite.json.tmp")
	writeFile(t, old, []byte("x"))
	_ = os.Chtimes(old, time.Now().Add(-2*time.Hour), time.Now().Add(-2*time.Hour))
	scanAll()
	before := dirSize(savesDir)

	st := optimizeStorage("test", time.Minute)
	if st.Verknuepft != 2 || st.Gespart != int64(2*len(big)) {
		t.Fatalf("erwartet 2 Verknüpfungen: %+v", st)
	}
	if !exists(filepath.Join(nb, "Drei", bilderFolder, B)) || exists(filepath.Join(bilderDir, B)) {
		t.Fatal("Bild aus dem Eingang nicht in seinen Abschnitt sortiert")
	}
	if exists(old) || st.Aufgeraeumt != 1 {
		t.Fatal("alte Zwischendatei nicht entfernt")
	}
	i1, _ := os.Stat(filepath.Join(nb, "Eins", bilderFolder, A))
	i3, _ := os.Stat(filepath.Join(nb, "Drei", bilderFolder, A))
	if !os.SameFile(i1, i3) {
		t.Fatal("keine harte Verknüpfung")
	}
	if after := dirSize(savesDir); after != before-int64(2*len(big))-1 {
		t.Fatalf("Belegung zählt Verknüpfungen doppelt: vorher %d, nachher %d", before, after)
	}

	// Schnellprüfung: zweiter Lauf ohne Änderung öffnet nichts
	if st2 := optimizeStorage("test", time.Minute); st2.Neu != 0 || st2.Verknuepft != 0 || st2.Zugeordnet != 0 {
		t.Fatalf("zweiter Lauf hätte nichts tun dürfen: %+v", st2)
	}
	// neue Kopien (Abschnitt Zwei, Papierkorb) → nur sie sind neu und werden verknüpft
	writeFile(t, filepath.Join(nb, "Zwei", bilderFolder, B), other) // Kopie von Hand hineinkopiert
	writeFile(t, filepath.Join(trashDir, bilderFolder, A), big)
	if st3 := optimizeStorage("test", time.Minute); st3.Neu != 2 || st3.Verknuepft != 2 {
		t.Fatalf("neue Dateien: erwartet 2 neu/2 verknüpft: %+v", st3)
	}
	// Unterbrechen: Stopp-Bitte liegt vor → nichts verknüpft, beim nächsten Lauf nachgeholt
	writeFile(t, filepath.Join(trashDir, bilderFolder, B), other)
	savesChanged.Store(true)
	maintStop = nil
	stop := func() { writeFile(t, optStopPath(), []byte("x")) }
	stopped := make(chan optStats)
	go func() {
		// wie ein neu gestartetes Programm: Stopp-Bitte, sobald das Optimieren läuft
		for !exists(optRunPath()) {
			time.Sleep(time.Millisecond)
		}
		stop()
	}()
	_ = stop
	go func() {
		stopped <- optimizeStorageAfter("test", time.Minute, func() { time.Sleep(20 * time.Millisecond) })
	}()
	if s4 := <-stopped; !s4.Unterbrochen || s4.Verknuepft != 0 {
		t.Fatalf("nicht unterbrochen: %+v", s4)
	}
	_ = os.Remove(optStopPath())
	if s5 := optimizeStorage("test", time.Minute); s5.Unterbrochen || s5.Verknuepft != 1 {
		t.Fatalf("nach Unterbrechung nicht weitergemacht: %+v", s5)
	}
	// Neustart-Seite: läuft ein Optimieren, bittet requestOptimizerStop um Stopp und wartet, bis es aufhört
	writeFile(t, optRunPath(), []byte("x"))
	go func() {
		for !exists(optStopPath()) {
			time.Sleep(time.Millisecond)
		}
		_ = os.Remove(optRunPath())
	}()
	t1 := time.Now()
	requestOptimizerStop()
	if time.Since(t1) > 5*time.Second || exists(optStopPath()) {
		t.Fatal("Neustart: Stopp-Bitte nicht richtig behandelt")
	}

	// eine Verknüpfung löschen: die anderen bleiben vollständig
	if err := os.Remove(filepath.Join(nb, "Eins", bilderFolder, A)); err != nil {
		t.Fatal(err)
	}
	if b, err := os.ReadFile(filepath.Join(nb, "Zwei", bilderFolder, A)); err != nil || !bytes.Equal(b, big) {
		t.Fatal("nach dem Löschen einer Verknüpfung fehlt der Inhalt in der anderen")
	}
	// Abschnitt herauskopieren: vollständig, die Kopie ist unabhängig
	out := filepath.Join(t.TempDir(), "Kopie")
	if err := copyDir(filepath.Join(nb, "Drei"), out); err != nil {
		t.Fatal(err)
	}
	if b, _ := os.ReadFile(filepath.Join(out, bilderFolder, A)); !bytes.Equal(b, big) {
		t.Fatal("herauskopierter Abschnitt unvollständig")
	}
	if b, _ := os.ReadFile(filepath.Join(out, bilderFolder, B)); !bytes.Equal(b, other) {
		t.Fatal("herauskopierter Abschnitt: einsortiertes Bild fehlt")
	}

	// Backups: zweites Backup ohne Änderung → Abschnitt-Dateien sind Verknüpfungen des ersten
	writeFile(t, filepath.Join(cacheDir, "zustand.json"), []byte(`{"sicherung":{"nurAenderung":false}}`))
	n1, _, err := makeBackup(true)
	if err != nil {
		t.Fatal(err)
	}
	time.Sleep(1100 * time.Millisecond) // anderer Ordnername
	writeFile(t, filepath.Join(nb, "Zwei", "P"+pageSuffix), page("pZwei", "P geändert", A))
	n2, _, err := makeBackup(true)
	if err != nil {
		t.Fatal(err)
	}
	same := func(sec string) bool {
		a, e1 := os.Stat(filepath.Join(backupDir, n1, "Notizbuch", sec+sectionSuffix))
		b, e2 := os.Stat(filepath.Join(backupDir, n2, "Notizbuch", sec+sectionSuffix))
		if e1 != nil || e2 != nil {
			t.Fatalf("Abschnitt-Datei fehlt: %v %v", e1, e2)
		}
		return os.SameFile(a, b)
	}
	if !same("Eins") || !same("Drei") || same("Zwei") {
		t.Fatalf("Backup-Verknüpfung falsch: Eins %v Drei %v Zwei(geändert) %v", same("Eins"), same("Drei"), same("Zwei"))
	}
	// erstes Backup löschen: das zweite bleibt vollständig
	if err := os.RemoveAll(filepath.Join(backupDir, n1)); err != nil {
		t.Fatal(err)
	}
	if info, err := os.Stat(filepath.Join(backupDir, n2, "Notizbuch", "Eins"+sectionSuffix)); err != nil || info.Size() < 1000 {
		t.Fatal("zweites Backup nach Löschen des ersten unvollständig")
	}
}
