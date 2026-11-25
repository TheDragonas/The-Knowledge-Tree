package main

// optimize.go – Speicher optimieren beim Beenden (seit 1.39).
//
// Nach dem Schliessen des Fensters (der Server ist dann schon zu, niemand schreibt mehr) räumt das Programm auf:
//
//  1. Sortieren: alle Bilder und Anhänge in den _Bilder-Ordner ihres Abschnitts (assetMaintenance, wie beim Start),
//     den Eingang Saves/_Bilder leeren, liegengebliebene Zwischendateien (*.tmp, älter als eine Stunde) entfernen.
//     Danach ist jeder Abschnitt-Ordner vollständig – herauskopieren genügt, auch ganze Notizbücher mit Unterordnern.
//  2. Doppelte Dateien zusammenlegen: gleiche Bilder/Dokumente (gleicher Inhalt) in mehreren Abschnitten, im
//     Papierkorb oder in Backup-Ordnern werden zu HARTEN Verknüpfungen derselben Datei – der Inhalt liegt nur einmal
//     auf der Festplatte. Harte Verknüpfungen sind keine Verweise: jede ist eine vollwertige Datei. Kopieren kopiert
//     den Inhalt, Löschen einer Verknüpfung lässt die anderen unberührt, ein herauskopierter Ordner ist vollständig.
//     Nur Dateien, die nie mehr verändert werden: Bilder/Anhänge (Name = Prüfsumme des Inhalts) und die
//     Abschnitt-Dateien der Backups. Seiten (*.seite.json) werden immer ganz neu geschrieben (atomicWrite) – auch sie
//     wären sicher, sind aber fast nie gleich und bleiben deshalb aussen vor.
//  3. Backups: ein Abschnitt, der sich seit dem letzten Backup nicht geändert hat, wird im neuen Backup als harte
//     Verknüpfung der vorherigen Abschnitt-Datei angelegt (Fingerabdruck in Cache/Backups/_abschnitte.json) – so
//     brauchen zehn Backups kaum mehr Platz als eines.
//
// Wo das Dateisystem keine harten Verknüpfungen kann (FAT32-USB-Stick, manche Netzlaufwerke), bleibt alles wie es ist.
// Jeder Schritt ist für sich sicher: erst neben der Datei verknüpfen, dann darüber umbenennen. Wird das Programm
// mittendrin beendet, sind die Dateien entweder alt oder neu, nie halb. Ein neu gestartetes Programm unterbricht das
// Optimieren (Cache/optimiert.stopp) – es geht beim nächsten Schliessen weiter. Nur Neues/Geändertes wird geprüft.

import (
	"bytes"
	"crypto/sha1"
	"encoding/hex"
	"encoding/json"
	"io"
	"io/fs"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"sync/atomic"
	"time"
)

type optStats struct {
	Zeit         string `json:"zeit"`
	Anlass       string `json:"anlass"`      // beenden | knopf
	Zugeordnet   int    `json:"zugeordnet"`  // Bilder in ihren Abschnitt gelegt / herausgenommen
	Verknuepft   int    `json:"verknuepft"`  // Dateien, die jetzt harte Verknüpfungen sind
	Gespart      int64  `json:"gespart"`     // dadurch frei gewordene Bytes
	Geprueft     int    `json:"geprueft"`    // betrachtete Dateien
	Aufgeraeumt  int    `json:"aufgeraeumt"` // entfernte Zwischendateien
	Dauer        string `json:"dauer"`
	Abgebrochen  bool   `json:"abgebrochen,omitempty"`  // Zeit abgelaufen – der Rest folgt beim nächsten Mal
	Unterbrochen bool   `json:"unterbrochen,omitempty"` // Programm neu gestartet – weiter beim nächsten Schliessen
	Neu          int    `json:"neu"`                    // davon neu/verändert seit dem letzten Lauf
	Fehler       string `json:"fehler,omitempty"`
}

var optMu sync.Mutex // nur ein Optimieren gleichzeitig (Beenden, Knopf)

func optStatsPath() string { return filepath.Join(cacheDir, "optimiert.json") }
func optRunPath() string   { return filepath.Join(cacheDir, "optimiert.lauf") }

func optStopPath() string  { return filepath.Join(cacheDir, "optimiert.stopp") }
func optStatePath() string { return filepath.Join(cacheDir, "optimiert-stand.json") }

// Unterbrechen (1.39): ein neu gestartetes Programm legt optimiert.stopp an – das Optimieren hört nach der
// aktuellen Datei auf (jeder Schritt ist für sich fertig) und macht beim nächsten Schliessen dort weiter.
func optStopped() bool { return exists(optStopPath()) }

// Was seit dem letzten Lauf geändert wurde (Schnellprüfung statt alles neu): Speicherungen, neue Bilder/Anhänge
// setzen savesChanged; die Liste der schon betrachteten Dateien (Pfad → Grösse+Datum) liegt in
// Cache/optimiert-stand.json. Unveränderte Dateien werden nicht mehr geöffnet oder verglichen.
var savesChanged atomic.Bool

type optState struct {
	Sortieren bool              `json:"sortieren"` // Sortieren steht noch aus (unterbrochen)
	Dateien   map[string]string `json:"dateien"`   // Pfad (relativ zum Programmordner, mit /) → Grösse:Datum
}

func fileSig(info os.FileInfo) string {
	return sizeKey(info.Size()) + ":" + sizeKey(info.ModTime().UnixNano())
}

func relBase(p string) string {
	r, err := filepath.Rel(baseDir, p)
	if err != nil {
		return p
	}
	return filepath.ToSlash(r)
}

// optimizeStorage: alles oben Beschriebene, höchstens budget lang. Aufrufer hält mu NICHT.
func optimizeStorage(anlass string, budget time.Duration) optStats {
	return optimizeStorageAfter(anlass, budget, nil)
}

// optimizeStorageAfter: wie optimizeStorage; pause (nur Tests) läuft nach dem Start, bevor gearbeitet wird
func optimizeStorageAfter(anlass string, budget time.Duration, pause func()) optStats {
	optMu.Lock()
	defer optMu.Unlock()
	t0 := time.Now()
	deadline := t0.Add(budget)
	st := optStats{Anlass: anlass}
	_ = os.Remove(optStopPath()) // alte Bitte (Absturz) gilt nicht
	_ = os.WriteFile(optRunPath(), []byte(time.Now().Format(time.RFC3339)), 0o644)
	defer os.Remove(optRunPath())
	if pause != nil {
		pause()
	}
	var state optState
	readJSON(optStatePath(), &state)
	if state.Dateien == nil {
		state.Dateien = map[string]string{}
	}
	defer func() {
		if r := recover(); r != nil {
			st.Fehler = "abgebrochen: " + strings.TrimSpace(strings.Split(sprint(r), "\n")[0])
			logf("Speicher optimieren: %v", r)
		}
		sb, _ := json.Marshal(state)
		_ = atomicWrite(optStatePath(), sb)
		st.Zeit = time.Now().Format(time.RFC3339)
		st.Dauer = time.Since(t0).Round(time.Millisecond).String()
		b, _ := json.MarshalIndent(st, "", "  ")
		_ = atomicWrite(optStatsPath(), b)
		rest := ""
		if st.Unterbrochen {
			rest = " – unterbrochen (Programm neu gestartet), weiter beim nächsten Schliessen"
		} else if st.Abgebrochen {
			rest = " – Zeit abgelaufen, Rest beim nächsten Mal"
		}
		logf("Speicher optimiert (%s): %d Bilder zugeordnet, %d Dateien verknüpft (%s gespart), %d neue/geänderte von %d Dateien geprüft, %d Zwischendateien entfernt, %s%s",
			anlass, st.Zugeordnet, st.Verknuepft, humanBytes(st.Gespart), st.Neu, st.Geprueft, st.Aufgeraeumt, st.Dauer, rest)
	}()

	// 1. sortieren – nur wenn seit dem Start gespeichert/eingefügt wurde, im Eingang etwas liegt oder es noch aussteht
	//    (Schnellprüfung; beim Start ordnet das Programm ohnehin einmal alles zu)
	mu.Lock()
	loaded := len(groupPath) > 0
	mu.Unlock()
	inbox, _ := os.ReadDir(bilderDir)
	if loaded && (savesChanged.Load() || state.Sortieren || len(inbox) > 0 || anlass == "knopf") {
		state.Sortieren = true
		maintStop = optStopped
		st.Zugeordnet = assetMaintenance()
		maintStop = nil
		if optStopped() {
			st.Unterbrochen = true
			return st
		}
		state.Sortieren = false
		savesChanged.Store(false)
	}
	st.Aufgeraeumt = removeStaleTmp(savesDir)

	// 2. doppelte Dateien zusammenlegen (nur Gruppen mit neuen/geänderten Dateien)
	mu.Lock()
	defer mu.Unlock()
	dedupe(&st, &state, deadline)
	return st
}

func sprint(v any) string {
	if e, ok := v.(error); ok {
		return e.Error()
	}
	if s, ok := v.(string); ok {
		return s
	}
	b, _ := json.Marshal(v)
	return string(b)
}

// removeStaleTmp: halbe Zwischendateien (Absturz beim Schreiben) – nur ältere als eine Stunde
func removeStaleTmp(root string) int {
	n := 0
	_ = filepath.WalkDir(root, func(p string, d fs.DirEntry, err error) error {
		if err != nil || d.IsDir() || !strings.HasSuffix(d.Name(), ".tmp") {
			return nil
		}
		if info, err := d.Info(); err == nil && time.Since(info.ModTime()) > time.Hour && os.Remove(p) == nil {
			n++
		}
		return nil
	})
	return n
}

// immutableFile: Dateien, deren Inhalt sich nie ändert (nur diese werden verknüpft)
func immutableFile(p string, d fs.DirEntry) bool {
	n := d.Name()
	if imgNameExact.MatchString(n) && filepath.Base(filepath.Dir(p)) == bilderFolder {
		return true // Bild/Anhang: Name = Prüfsumme des Inhalts
	}
	return strings.HasSuffix(n, sectionSuffix) && hasPrefixFold(p, backupDir+string(os.PathSeparator))
}

type dupFile struct {
	path string
	info os.FileInfo
	sig  string
	neu  bool // seit dem letzten Lauf neu oder verändert
}

// dedupe: gleiche Dateien in Saves, Papierkorb und Backups zu harten Verknüpfungen machen. Schnellprüfung: nur
// Gruppen, in denen eine Datei neu oder verändert ist (Grösse/Datum aus dem Ordnerverzeichnis, ohne sie zu öffnen).
func dedupe(st *optStats, state *optState, deadline time.Time) {
	groups := map[string][]*dupFile{} // Schlüssel: Grösse + (bei Bildern) Prüfsumme aus dem Namen
	next := map[string]string{}       // neuer Stand: nur Dateien, die betrachtet sind
	for _, root := range []string{savesDir, trashDir, backupDir} {
		_ = filepath.WalkDir(root, func(p string, d fs.DirEntry, err error) error {
			if err != nil {
				return nil
			}
			if d.IsDir() {
				if strings.HasSuffix(d.Name(), ".tmp") {
					return filepath.SkipDir // Backup, das gerade entsteht
				}
				return nil
			}
			if !d.Type().IsRegular() || !immutableFile(p, d) {
				return nil
			}
			info, err := d.Info()
			if err != nil || info.Size() < 1024 { // winzige Dateien: lohnt nicht
				return nil
			}
			key := sizeKey(info.Size())
			if imgNameExact.MatchString(d.Name()) {
				key += ":" + d.Name()[:40]
			}
			f := &dupFile{path: p, info: info, sig: fileSig(info)}
			f.neu = state.Dateien[relBase(p)] != f.sig
			if !f.neu {
				next[relBase(p)] = f.sig
			} else {
				st.Neu++
			}
			groups[key] = append(groups[key], f)
			st.Geprueft++
			return nil
		})
	}
	keys := make([]string, 0, len(groups))
	for k, g := range groups {
		fresh := false
		for _, f := range g {
			fresh = fresh || f.neu
		}
		if !fresh {
			continue
		}
		if len(g) == 1 { // allein: nichts zu verknüpfen, nur merken
			next[relBase(g[0].path)] = g[0].sig
			continue
		}
		keys = append(keys, k)
	}
	sort.Strings(keys)
	defer func() { state.Dateien = next }()
	for _, k := range keys {
		if optStopped() {
			st.Unterbrochen = true
			return
		}
		if time.Now().After(deadline) {
			st.Abgebrochen = true
			return
		}
		g := groups[k]
		// die Datei in Saves zuerst: sie bleibt das „Original“ (gleich wichtig, aber so ist ihr Datum massgebend)
		sort.SliceStable(g, func(i, j int) bool { return rootRank(g[i].path) < rootRank(g[j].path) })
		var reps []*dupFile // verschiedene Dateien (Inhalte bzw. schon verknüpfte Gruppen)
		for _, f := range g {
			if info, err := os.Stat(f.path); err == nil { // Stat: auf Windows mit Datei-Index für SameFile
				f.info = info
			}
		}
	nextFile:
		for _, f := range g {
			for _, r := range reps {
				if os.SameFile(r.info, f.info) {
					continue nextFile // schon dieselbe Datei
				}
			}
			for _, r := range reps {
				if sameContent(r.path, f.path) {
					if relink(r.path, f.path) {
						st.Verknuepft++
						st.Gespart += f.info.Size()
					}
					continue nextFile
				}
			}
			reps = append(reps, f)
		}
		for _, f := range g { // Stand nach dem Verknüpfen (Datum der Verknüpfung = Datum des Originals)
			if info, err := os.Stat(f.path); err == nil {
				next[relBase(f.path)] = fileSig(info)
			}
		}
	}
}

// requestOptimizerStop: beim Start – optimiert das zuletzt geschlossene Programm noch, wird es unterbrochen
// (höchstens 15 s warten; eine Markierung älter als 5 Minuten stammt von einem Absturz und gilt nicht)
func requestOptimizerStop() {
	info, err := os.Stat(optRunPath())
	if err != nil || time.Since(info.ModTime()) > 5*time.Minute {
		_ = os.Remove(optStopPath())
		return
	}
	_ = os.WriteFile(optStopPath(), []byte(time.Now().Format(time.RFC3339)), 0o644)
	t0 := time.Now()
	for exists(optRunPath()) && time.Since(t0) < 15*time.Second {
		time.Sleep(50 * time.Millisecond)
	}
	_ = os.Remove(optStopPath())
	logf("Speicher optimieren des zuletzt geschlossenen Programms unterbrochen (%s) – weiter beim nächsten Schliessen", time.Since(t0).Round(time.Millisecond))
}

func sizeKey(n int64) string {
	return strings.TrimLeft(hex.EncodeToString([]byte{byte(n >> 56), byte(n >> 48), byte(n >> 40), byte(n >> 32), byte(n >> 24), byte(n >> 16), byte(n >> 8), byte(n)}), "0")
}

func rootRank(p string) int {
	switch {
	case hasPrefixFold(p, savesDir+string(os.PathSeparator)):
		return 0
	case hasPrefixFold(p, backupDir+string(os.PathSeparator)):
		return 1
	}
	return 2
}

// sameContent vergleicht Byte für Byte (gleicher Name heisst fast sicher, aber nicht garantiert gleicher Inhalt)
func sameContent(a, b string) bool {
	fa, err := os.Open(a)
	if err != nil {
		return false
	}
	defer fa.Close()
	fb, err := os.Open(b)
	if err != nil {
		return false
	}
	defer fb.Close()
	ba, bb := make([]byte, 256<<10), make([]byte, 256<<10)
	for {
		na, ea := io.ReadFull(fa, ba)
		nb, eb := io.ReadFull(fb, bb)
		if na != nb || !bytes.Equal(ba[:na], bb[:nb]) {
			return false
		}
		if ea != nil || eb != nil {
			return (ea == io.EOF || ea == io.ErrUnexpectedEOF) && (eb == io.EOF || eb == io.ErrUnexpectedEOF)
		}
	}
}

// relink ersetzt dst durch eine harte Verknüpfung von src: erst daneben anlegen, dann darüber umbenennen
func relink(src, dst string) bool {
	tmp := dst + ".kt-link.tmp"
	_ = os.Remove(tmp)
	if err := os.Link(src, tmp); err != nil {
		return false // Dateisystem kann es nicht (oder anderes Laufwerk) – Datei bleibt, wie sie ist
	}
	if err := renameRetry(tmp, dst); err != nil {
		_ = os.Remove(tmp)
		return false
	}
	return true
}

// diskSize: Belegung eines Ordners, jede Datei nur einmal gezählt (harte Verknüpfungen teilen sich den Platz)
type diskCounter struct{ seen map[int64][]os.FileInfo }

func (c *diskCounter) add(p string) int64 {
	info, err := os.Stat(p)
	if err != nil || !info.Mode().IsRegular() {
		return 0
	}
	if c.seen == nil {
		c.seen = map[int64][]os.FileInfo{}
	}
	for _, o := range c.seen[info.Size()] {
		if os.SameFile(o, info) {
			return 0
		}
	}
	c.seen[info.Size()] = append(c.seen[info.Size()], info)
	return info.Size()
}

func diskSize(dir string, c *diskCounter, keep func(p string) bool) int64 {
	if c == nil {
		c = &diskCounter{}
	}
	var n int64
	_ = filepath.WalkDir(dir, func(p string, d fs.DirEntry, err error) error {
		if err == nil && !d.IsDir() && (keep == nil || keep(p)) {
			n += c.add(p)
		}
		return nil
	})
	return n
}

func humanBytes(n int64) string {
	switch {
	case n >= 1<<30:
		return strings.Replace(trimFloat(float64(n)/(1<<30)), ".", ",", 1) + " GB"
	case n >= 1<<20:
		return strings.Replace(trimFloat(float64(n)/(1<<20)), ".", ",", 1) + " MB"
	case n >= 1<<10:
		return strings.Replace(trimFloat(float64(n)/(1<<10)), ".", ",", 1) + " KB"
	}
	return sprint(n) + " Bytes"
}

func trimFloat(f float64) string {
	b, _ := json.Marshal(float64(int64(f*10+0.5)) / 10)
	return string(b)
}

// ---------------------------------------------------------------- Backups: unveränderte Abschnitte verknüpfen

type sectionIndex map[string]string // Fingerabdruck -> Abschnitt-Datei (relativ zu Cache/Backups)

func sectionIndexPath() string { return filepath.Join(backupDir, "_abschnitte.json") }

// sectionPrint: Fingerabdruck eines Abschnitts, so wie er ins Backup käme (Seiten, _gruppe.json, Name, Bilder)
func sectionPrint(rel, name string, withImages bool, find func(rel, n string) string) string {
	h := sha1.New()
	io.WriteString(h, "kt-abschnitt-1\x00"+filepath.Base(rel)+"\x00"+name+"\x00"+appVersion+"\x00")
	if withImages {
		io.WriteString(h, "bilder\x00")
	}
	entries, _ := os.ReadDir(absSaves(rel))
	used := map[string]bool{}
	for _, e := range entries { // ReadDir ist nach Namen sortiert
		n := e.Name()
		if e.IsDir() || strings.HasSuffix(n, ".tmp") || (n != groupMetaFn && !strings.HasSuffix(strings.ToLower(n), pageSuffix)) {
			continue
		}
		b, err := os.ReadFile(filepath.Join(absSaves(rel), n))
		if err != nil {
			return "" // nicht lesbar: lieber neu schreiben
		}
		if n != groupMetaFn {
			assetNames(b, func(x string) { used[x] = true })
		}
		sum := sha1.Sum(b)
		io.WriteString(h, n+"\x00"+hex.EncodeToString(sum[:])+"\x00")
	}
	if withImages {
		names := make([]string, 0, len(used))
		for n := range used {
			names = append(names, n)
		}
		sort.Strings(names)
		for _, n := range names {
			var size int64 = -1
			if info, err := os.Stat(find(rel, n)); err == nil {
				size = info.Size()
			}
			io.WriteString(h, n+"\x00"+sizeKey(size)+"\x00")
		}
	}
	return hex.EncodeToString(h.Sum(nil))
}
