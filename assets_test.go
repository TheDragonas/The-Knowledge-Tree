package main

// Bilder je Abschnitt (seit 1.33): Altbestand zuordnen, Speichern, Verschieben, Löschen + Rückgängig, Backup,
// Abschnitt-Ordner weitergeben

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
)

func setupDirs(t *testing.T) {
	t.Helper()
	base := t.TempDir()
	savesDir = filepath.Join(base, "Saves")
	cacheDir = filepath.Join(base, "Cache")
	bilderDir = filepath.Join(savesDir, bilderFolder)
	trashDir = filepath.Join(cacheDir, "Papierkorb")
	backupDir = filepath.Join(cacheDir, "Backups")
	for _, d := range []string{savesDir, bilderDir, cacheDir, trashDir, backupDir} {
		if err := os.MkdirAll(d, 0o755); err != nil {
			t.Fatal(err)
		}
	}
	maintOnce = sync.Once{}
}

func img(c string) string { return strings.Repeat(c, 40) + ".png" }

func writeFile(t *testing.T, p string, b []byte) {
	t.Helper()
	_ = os.MkdirAll(filepath.Dir(p), 0o755)
	if err := os.WriteFile(p, b, 0o644); err != nil {
		t.Fatal(err)
	}
}

func page(id, title string, imgs ...string) json.RawMessage {
	boxes := []map[string]any{}
	for i, n := range imgs {
		boxes = append(boxes, map[string]any{"id": "b" + string(rune('0'+i)), "html": "", "images": []map[string]any{{"src": n}}})
	}
	b, _ := json.Marshal(map[string]any{"typ": "KnowledgeTree-Seite", "id": id, "title": title, "boxes": boxes})
	return b
}

func has(rel, n string) bool { return exists(filepath.Join(secImgDir(rel), n)) }

func TestAssetsPerSection(t *testing.T) {
	setupDirs(t)
	A, B, C := img("a"), img("b"), img("c")
	// Altbestand bis 1.32: alle Bilder im gemeinsamen Ordner, zwei Abschnitte
	for _, n := range []string{A, B, C} {
		writeFile(t, filepath.Join(bilderDir, n), []byte("bild "+n))
	}
	nb := filepath.Join(savesDir, "Notizbuch")
	writeFile(t, filepath.Join(nb, groupMetaFn), []byte(`{"typ":"KnowledgeTree-Gruppe","id":"gnb","name":"Notizbuch","art":"notebook","reihenfolgeGruppen":["gs1","gs2"]}`))
	writeFile(t, filepath.Join(nb, "Eins", groupMetaFn), []byte(`{"typ":"KnowledgeTree-Gruppe","id":"gs1","name":"Eins","art":"section"}`))
	writeFile(t, filepath.Join(nb, "Zwei", groupMetaFn), []byte(`{"typ":"KnowledgeTree-Gruppe","id":"gs2","name":"Zwei","art":"section"}`))
	writeFile(t, filepath.Join(nb, "Eins", "P1"+pageSuffix), page("p1", "P1", A, B))
	writeFile(t, filepath.Join(nb, "Zwei", "P2"+pageSuffix), page("p2", "P2", B))
	tree, _ := scanAll()
	assetMaintenance()
	s1, s2 := groupPath["gs1"], groupPath["gs2"]
	if !has(s1, A) || !has(s1, B) || !has(s2, B) || has(s2, A) {
		t.Fatalf("Altbestand nicht richtig zugeordnet: %v", assetLoc)
	}
	if exists(filepath.Join(bilderDir, A)) || exists(filepath.Join(bilderDir, B)) {
		t.Fatal("zugeordnete Bilder liegen noch im Eingang")
	}
	if !exists(filepath.Join(bilderDir, C)) {
		t.Fatal("ungebrauchtes Bild sollte (jung) noch im Eingang liegen")
	}
	if p := findAsset(B); p == "" {
		t.Fatal("findAsset findet B nicht")
	}

	// neues Bild eingefügt (Eingang) und Seite gespeichert → im Abschnitt
	D := img("d")
	writeFile(t, filepath.Join(bilderDir, D), []byte("neu"))
	req := &SyncReq{Groups: tree, Titles: map[string]string{"p1": "P1", "p2": "P2"}, Pages: map[string]json.RawMessage{"p2": page("p2", "P2", B, D)}}
	if err := reconcile(req); err != nil {
		t.Fatal(err)
	}
	if !has(s2, D) || exists(filepath.Join(bilderDir, D)) {
		t.Fatal("gespeichertes Bild nicht im Abschnitt Zwei")
	}

	// Seite P1 nach Zwei verschieben (ohne Inhalt) → A kommt mit
	sec1, sec2 := tree[0].Groups[0], tree[0].Groups[1]
	sec1.Pages, sec2.Pages = []string{}, []string{"p2", "p1"}
	if err := reconcile(&SyncReq{Groups: tree, Titles: map[string]string{"p1": "P1", "p2": "P2"}}); err != nil {
		t.Fatal(err)
	}
	if !has(s2, A) {
		t.Fatal("beim Verschieben fehlt A im neuen Abschnitt")
	}
	assetMaintenance2(t)
	if has(s1, A) || has(s1, B) {
		t.Fatal("Abschnitt Eins hat noch Bilder, die er nicht mehr braucht")
	}

	// Abschnitt Zwei löschen → Bilder in den Papierkorb; Rückgängig (Seite in Eins neu gespeichert) holt sie zurück
	tree[0].Groups = []*TreeGroup{sec1}
	if err := reconcile(&SyncReq{Groups: tree, Titles: map[string]string{}}); err != nil {
		t.Fatal(err)
	}
	if !exists(filepath.Join(trashDir, bilderFolder, A)) || !exists(filepath.Join(trashDir, bilderFolder, D)) {
		t.Fatal("Bilder des gelöschten Abschnitts nicht im Papierkorb")
	}
	sec1.Pages = []string{"p1"}
	if err := reconcile(&SyncReq{Groups: tree, Titles: map[string]string{"p1": "P1"}, Pages: map[string]json.RawMessage{"p1": page("p1", "P1", A, B)}}); err != nil {
		t.Fatal(err)
	}
	if !has(s1, A) || !has(s1, B) {
		t.Fatalf("Rückgängig: Bilder nicht zurück (A %v, B %v)", has(s1, A), has(s1, B))
	}

	// Backup: Abschnitt-Datei enthält die Bilder
	dst := filepath.Join(backupDir, "KnowledgeTree-Backup_test")
	if err := writeBackupFolder(dst, true); err != nil {
		t.Fatal(err)
	}
	var meta map[string]any
	b, _ := os.ReadFile(filepath.Join(dst, "KnowledgeTree.json"))
	_ = json.Unmarshal(b, &meta)
	if meta["bilder"].(float64) < 2 {
		t.Fatalf("Backup ohne Bilder: %v", meta)
	}

	// Abschnitt-Ordner an jemanden weitergeben: in einen frischen Saves-Ordner kopieren → Bilder werden gefunden
	src := absSaves(s1)
	setupDirs(t)
	if err := copyDir(src, filepath.Join(savesDir, "Geschenkt")); err != nil {
		t.Fatal(err)
	}
	scanAll()
	if findAsset(A) == "" || findAsset(B) == "" {
		t.Fatal("weitergegebener Abschnitt: Bilder nicht gefunden")
	}
}

// zweiter Durchgang der Pflege (sonst nur einmal je Programmstart)
func assetMaintenance2(t *testing.T) {
	t.Helper()
	assetMaintenance()
}

func copyDir(src, dst string) error {
	return filepath.Walk(src, func(p string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}
		rel, _ := filepath.Rel(src, p)
		target := filepath.Join(dst, rel)
		if info.IsDir() {
			return os.MkdirAll(target, 0o755)
		}
		return copyFile(p, target)
	})
}
