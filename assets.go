package main

// assets.go – Bilder und Anhänge je Abschnitt (seit 1.33).
//
//   Saves/<Notizbuch>/<Abschnitt>/_Bilder/   Bilder und Anhänge, die die Seiten DIESES Abschnitts brauchen
//   Saves/_Bilder/                           Eingang: frisch eingefügte Bilder, bis sie beim Speichern ihrem
//                                            Abschnitt zugeordnet sind (und Altbestand bis 1.32)
//   Cache/Papierkorb/_Bilder/                nicht mehr gebrauchte Bilder (wie bisher)
//
// So ist jeder Abschnitt-Ordner vollständig: kopieren und weitergeben genügt, die Bilder sind dabei. Braucht eine
// Seite in einem anderen Abschnitt dasselbe Bild (kopierte Seite), liegt es dort ebenfalls – als harte Verknüpfung
// (kein doppelter Platz), wenn das Dateisystem es kann, sonst als Kopie. Der Name ist die Prüfsumme des Inhalts,
// gleiche Namen sind also immer gleiche Dateien.
//
// Wann wird zugeordnet?
//   - beim Speichern einer Seite (alle ihre Bilder kommen in den _Bilder-Ordner ihres Abschnitts),
//   - wenn eine Seite in einen anderen Abschnitt wandert (ihre Datei wird dafür gelesen),
//   - einmal nach dem Start im Hintergrund (assetMaintenance): ordnet den Altbestand zu, holt Fehlendes, räumt
//     nicht mehr gebrauchte Bilder aus den Abschnitten (in den Eingang, von dort wie bisher in den Papierkorb).
// Wird ein Abschnitt gelöscht, kommen seine Bilder nach Cache/Papierkorb/_Bilder (Rückgängig holt sie zurück).

import (
	"io/fs"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"
)

var (
	idxMu       sync.RWMutex
	assetLoc    = map[string][]string{} // Name -> Ordner (relativ zu Saves) der Abschnitte, in deren _Bilder er liegt
	pageGroupOf = map[string]string{}   // Seite -> Gruppe, in der sie zuletzt gespeichert wurde
	maintOnce   sync.Once
	maintMu     sync.Mutex  // Zuordnen beim Start und beim Beenden (1.39) nicht gleichzeitig
	maintStop   func() bool // beim Beenden: unterbrechen, wenn das Programm neu gestartet wird (optimize.go)
)

func secImgDir(rel string) string { return filepath.Join(absSaves(rel), bilderFolder) }

func idxAdd(n, rel string) {
	idxMu.Lock()
	defer idxMu.Unlock()
	for _, r := range assetLoc[n] {
		if strings.EqualFold(r, rel) {
			return
		}
	}
	assetLoc[n] = append(assetLoc[n], rel)
}

func idxDel(n, rel string) {
	idxMu.Lock()
	defer idxMu.Unlock()
	list := assetLoc[n][:0]
	for _, r := range assetLoc[n] {
		if !strings.EqualFold(r, rel) {
			list = append(list, r)
		}
	}
	if len(list) == 0 {
		delete(assetLoc, n)
	} else {
		assetLoc[n] = list
	}
}

// idxRename: ein Ordner wurde umbenannt/verschoben (updatePrefix)
func idxRename(oldRel, newRel string) {
	idxMu.Lock()
	defer idxMu.Unlock()
	sep := string(os.PathSeparator)
	for n, list := range assetLoc {
		for i, r := range list {
			if strings.EqualFold(r, oldRel) {
				list[i] = newRel
			} else if hasPrefixFold(r, oldRel+sep) {
				list[i] = newRel + r[len(oldRel):]
			}
		}
		assetLoc[n] = list
	}
}

// idxScanDir: _Bilder-Ordner eines Abschnitts in den Index aufnehmen (beim Einlesen)
func idxScanDir(rel string) {
	entries, err := os.ReadDir(secImgDir(rel))
	if err != nil {
		return
	}
	for _, e := range entries {
		if !e.IsDir() && imgNameExact.MatchString(e.Name()) {
			idxAdd(e.Name(), rel)
		}
	}
}

func idxReset() {
	idxMu.Lock()
	assetLoc = map[string][]string{}
	idxMu.Unlock()
}

// findAsset: wo liegt dieses Bild? Abschnitte (Index), Eingang, Papierkorb – "" wenn nirgends
func findAsset(n string) string {
	if !imgNameExact.MatchString(n) {
		return ""
	}
	idxMu.RLock()
	list := append([]string(nil), assetLoc[n]...)
	idxMu.RUnlock()
	for _, rel := range list {
		if p := filepath.Join(secImgDir(rel), n); exists(p) {
			return p
		}
	}
	if p := filepath.Join(bilderDir, n); exists(p) {
		return p
	}
	if p := filepath.Join(trashDir, bilderFolder, n); exists(p) {
		return p
	}
	return ""
}

// linkOrCopy: harte Verknüpfung (gleicher Inhalt, kein Platz), sonst Kopie über eine Zwischendatei
func linkOrCopy(src, dst string) error {
	if err := os.Link(src, dst); err == nil {
		return nil
	}
	tmp := dst + ".tmp"
	if err := copyFile(src, tmp); err != nil {
		_ = os.Remove(tmp)
		return err
	}
	return renameRetry(tmp, dst)
}

// placeAsset sorgt dafür, dass das Bild im _Bilder-Ordner des Abschnitts rel liegt. Kam es aus dem Eingang oder dem
// Papierkorb, liegt es danach nur noch im Abschnitt.
func placeAsset(n, rel string) bool {
	dir := secImgDir(rel)
	dst := filepath.Join(dir, n)
	if exists(dst) {
		idxAdd(n, rel)
		return true
	}
	src := findAsset(n)
	if src == "" {
		return false
	}
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return false
	}
	inbox := filepath.Dir(src) == bilderDir || filepath.Dir(src) == filepath.Join(trashDir, bilderFolder)
	idxAdd(n, rel) // zuerst eintragen: wer das Bild gerade anzeigt, findet es vorher am alten, danach am neuen Ort
	var err error
	if inbox {
		err = renameRetry(src, dst) // aus Eingang/Papierkorb: verschieben
		if err != nil {
			err = linkOrCopy(src, dst)
		}
	} else {
		err = linkOrCopy(src, dst)
	}
	if err != nil {
		idxDel(n, rel)
		logf("Bild %s konnte nicht in %s abgelegt werden: %v", n, rel, err)
		return false
	}
	return true
}

// placePageAssets: alle Bilder/Anhänge einer Seite in ihren Abschnitt
func placePageAssets(raw []byte, rel string) {
	seen := map[string]bool{}
	assetNames(raw, func(n string) {
		if !seen[n] {
			seen[n] = true
			placeAsset(n, rel)
		}
	})
}

// trashGroupAssets: ein Abschnitt wird gelöscht – seine Bilder in den Papierkorb-Bilderordner (dort findet sie
// Rückgängig wieder), bevor der Ordner selbst in den Papierkorb wandert. Seit 1.39 als harte Verknüpfung: die Bilder
// bleiben AUCH im Abschnitt-Ordner im Papierkorb – herauskopiert ist er vollständig (kein doppelter Platz). Kann das
// Dateisystem keine Verknüpfungen, werden sie wie bisher verschoben.
func trashGroupAssets(rel string) {
	dir := secImgDir(rel)
	entries, err := os.ReadDir(dir)
	if err != nil {
		return
	}
	tb := filepath.Join(trashDir, bilderFolder)
	_ = os.MkdirAll(tb, 0o755)
	now := time.Now()
	for _, e := range entries {
		n := e.Name()
		if e.IsDir() || !imgNameExact.MatchString(n) {
			continue
		}
		idxDel(n, rel)
		if t := filepath.Join(tb, n); !exists(t) {
			if os.Link(filepath.Join(dir, n), t) == nil || renameRetry(filepath.Join(dir, n), t) == nil {
				_ = os.Chtimes(t, now, now)
			}
		}
	}
	// auch Unterordner (Abschnitte in einer gelöschten Abschnittsgruppe) aus dem Index nehmen
	idxMu.Lock()
	sep := string(os.PathSeparator)
	for n, list := range assetLoc {
		keep := list[:0]
		for _, r := range list {
			if !strings.EqualFold(r, rel) && !hasPrefixFold(r, rel+sep) {
				keep = append(keep, r)
			}
		}
		if len(keep) == 0 {
			delete(assetLoc, n)
		} else {
			assetLoc[n] = keep
		}
	}
	idxMu.Unlock()
}

// sectionNeeds: Bilder, auf die die Seiten eines Abschnitt-Ordners verweisen (nur dieser Ordner, ohne Unterordner)
func sectionNeeds(rel string) (map[string]bool, bool) {
	used := map[string]bool{}
	entries, err := os.ReadDir(absSaves(rel))
	if err != nil {
		return used, false
	}
	for _, e := range entries {
		if !e.IsDir() && strings.HasSuffix(strings.ToLower(e.Name()), pageSuffix) {
			if b, err := os.ReadFile(filepath.Join(absSaves(rel), e.Name())); err == nil {
				assetNames(b, func(n string) { used[n] = true })
			}
		}
	}
	return used, true
}

// startAssetMaintenance: einmal nach dem ersten Einlesen, im Hintergrund
func startAssetMaintenance() {
	maintOnce.Do(func() { go assetMaintenance() })
}

// assetMaintenance ordnet alle Bilder ihren Abschnitten zu (auch den Altbestand aus Saves/_Bilder bis 1.32), nimmt
// nicht mehr gebrauchte aus den Abschnitten und räumt den Eingang auf. Abschnitt für Abschnitt unter der Sperre,
// damit Speichern dazwischen weiterläuft. Ergebnis: Anzahl zugeordneter + herausgenommener Bilder.
func assetMaintenance() (moved int) {
	maintMu.Lock()
	defer maintMu.Unlock()
	defer func() {
		if r := recover(); r != nil {
			logf("Bilder zuordnen: %v", r)
		}
	}()
	t0 := time.Now()
	mu.Lock()
	ids := make([]string, 0, len(groupPath))
	for id := range groupPath {
		ids = append(ids, id)
	}
	mu.Unlock()
	used := map[string]bool{}
	placed, removed := 0, 0
	for _, id := range ids {
		if maintStop != nil && maintStop() {
			return 0 // unterbrochen – das Optimieren macht beim nächsten Schliessen weiter
		}
		mu.Lock()
		rel, ok := groupPath[id]
		if ok {
			need, readable := sectionNeeds(rel)
			if readable {
				for n := range need {
					used[n] = true
					if !exists(filepath.Join(secImgDir(rel), n)) && placeAsset(n, rel) {
						placed++
					}
				}
				// nicht mehr gebraucht: liegt es noch anderswo, hier weg; sonst in den Eingang (von dort später in den
				// Papierkorb, falls auch der Verlauf es nicht mehr braucht)
				if entries, err := os.ReadDir(secImgDir(rel)); err == nil {
					for _, e := range entries {
						n := e.Name()
						if e.IsDir() || need[n] || !imgNameExact.MatchString(n) {
							continue
						}
						idxDel(n, rel)
						p := filepath.Join(secImgDir(rel), n)
						if findAsset(n) != "" || exists(filepath.Join(bilderDir, n)) {
							_ = os.Remove(p)
						} else {
							_ = renameRetry(p, filepath.Join(bilderDir, n))
						}
						removed++
					}
					if left, _ := os.ReadDir(secImgDir(rel)); len(left) == 0 {
						_ = os.Remove(secImgDir(rel))
					}
				}
			}
		}
		mu.Unlock()
	}
	// Eingang: was schon in einem Abschnitt liegt, weg; Ungebrauchtes (auch nicht im Verlauf) in den Papierkorb
	mu.Lock()
	collectUnusedImages(used)
	mu.Unlock()
	moved = placed + removed
	if placed+removed > 0 {
		logf("Bilder je Abschnitt: %d zugeordnet, %d aus Abschnitten genommen (%s)", placed, removed, time.Since(t0).Round(time.Millisecond))
	}
	return moved
}

// assetFinder für Backups (laufen auch vor dem ersten Einlesen, also ohne Index): sucht im Abschnitt selbst, dann
// in allen _Bilder-Ordnern des Saves-Ordners (einmal durchsucht), im Eingang und im Papierkorb
func assetFinder() func(rel, n string) string {
	var all map[string]string
	return func(rel, n string) string {
		if rel != "" {
			if p := filepath.Join(secImgDir(rel), n); exists(p) {
				return p
			}
		}
		if p := findAsset(n); p != "" {
			return p
		}
		if all == nil {
			all = map[string]string{}
			_ = filepath.WalkDir(savesDir, func(p string, d fs.DirEntry, err error) error {
				if err == nil && !d.IsDir() && filepath.Base(filepath.Dir(p)) == bilderFolder {
					if _, ok := all[d.Name()]; !ok {
						all[d.Name()] = p
					}
				}
				return nil
			})
		}
		return all[n]
	}
}

// imagesSize: alle Bilder (Eingang und _Bilder-Ordner der Abschnitte) – für Einstellungen → Speicher; harte
// Verknüpfungen (1.39) zählen nur einmal
func imagesSize() int64 {
	return diskSize(savesDir, nil, func(p string) bool { return filepath.Base(filepath.Dir(p)) == bilderFolder })
}
