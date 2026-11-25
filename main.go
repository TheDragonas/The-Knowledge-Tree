package main

// KnowledgeTree – ein einfaches Brainstorming-Programm.
// Das Programm speichert alles in Ordnern neben der ausführbaren Datei:
//   Saves/  – deine Gruppen (als Ordner) und Seiten (als Dateien), Bilder je Abschnitt in <Abschnitt>/_Bilder
//   Cache/  – Undo/Redo-Verlauf, Fensterzustand, Papierkorb, Backups, Log

import (
	"context"
	"crypto/sha1"
	"embed"
	"encoding/hex"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"io/fs"
	"log"
	"net"
	"net/http"
	"os"
	"path"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"time"
)

const (
	appName    = "KnowledgeTree"
	appVersion = "1.76"
	appAuthor  = "TheDragonas"
)

// Die KI-Vorlage beginnt mit „_“ (im Add-Ins-Ordner nicht laden) – solche Dateien nimmt go:embed bei einem Ordner
// nicht mit, darum ausdrücklich nennen (1.70)
//
//go:embed web web/addins/_Add-In-Vorlage_KI.js
var webFS embed.FS

// Die Webseiten-Fassung (dist/index.html, von build_web.py) – Vorlage für „KnowledgeTree-Datei → Interaktiv“:
// das Programm schreibt die Daten hinein, und die Datei läuft danach in jedem Browser (seit 1.25)
//
//go:embed dist/index.html
var appHTML []byte

var (
	baseDir, savesDir, cacheDir, bilderDir, trashDir, backupDir string

	mu        sync.Mutex // schützt alle Dateioperationen im Saves-Ordner
	logMu     sync.Mutex
	logFile   *os.File
	token     string
	sessionID string
	listenURL string
	warning   string

	lastBeat   atomic.Int64
	quitOnce   sync.Once
	quitCh     = make(chan struct{})
	loadedOnce atomic.Bool
	forceEdge  bool
)

func logf(format string, args ...any) {
	logMu.Lock()
	defer logMu.Unlock()
	line := time.Now().Format("2006-01-02 15:04:05") + "  " + fmt.Sprintf(format, args...) + "\n"
	if logFile != nil {
		_, _ = logFile.WriteString(line)
	}
	if !isWindowsGUI {
		fmt.Print(line)
	}
}

func requestQuit() { quitOnce.Do(func() { close(quitCh) }) }

func main() {
	flagBrowser := flag.Bool("browser", false, "im Standardbrowser statt im eigenen Fenster öffnen")
	flagPort := flag.Int("port", 0, "fester Port (nur für Tests)")
	flagNoWin := flag.Bool("nowindow", false, "nur Server starten (nur für Tests)")
	flagDir := flag.String("dir", "", "anderer Programmordner (nur für Tests)")
	flagToken := flag.String("token", "", "fester Zugriffsschlüssel (nur für Tests)")
	flagEdge := flag.Bool("edge", false, "Edge/Chrome-Fenster statt WebView2 verwenden")
	flag.Parse()
	forceEdge = *flagEdge

	exe, _ := os.Executable()
	if resolved, err := filepath.EvalSymlinks(exe); err == nil {
		exe = resolved
	}
	baseDir = filepath.Dir(exe)
	if *flagDir != "" {
		baseDir, _ = filepath.Abs(*flagDir)
	}
	savesDir = filepath.Join(baseDir, "Saves")
	cacheDir = filepath.Join(baseDir, "Cache")
	bilderDir = filepath.Join(savesDir, bilderFolder)
	trashDir = filepath.Join(cacheDir, "Papierkorb")
	backupDir = filepath.Join(cacheDir, "Backups")

	for _, d := range []string{savesDir, bilderDir, cacheDir, trashDir, backupDir} {
		if err := os.MkdirAll(d, 0o755); err != nil {
			fatalBox("KnowledgeTree kann in diesem Ordner nicht speichern:\n" + baseDir +
				"\n\nBitte den Programmordner an einen Ort verschieben, an dem du schreiben darfst (z.B. Dokumente).")
			return
		}
	}
	openLog()
	writeInfoFiles()
	ensureAddinsDir() // Add-Ins-Ordner mit KI-Vorlage (1.69, addins.go)
	logf("=== %s %s gestartet (Ordner: %s)", appName, appVersion, baseDir)

	low := strings.ToLower(baseDir)
	if strings.Contains(low, `\appdata\local\temp`) || strings.Contains(low, `.zip`) {
		warning = "Achtung: Das Programm läuft aus einem temporären Ordner (vermutlich direkt aus der ZIP-Datei). " +
			"Bitte die ZIP-Datei zuerst entpacken, sonst gehen deine Saves verloren!"
	}

	// Optimiert das zuletzt geschlossene Programm noch? Dann unterbrechen (1.39, optimize.go)
	requestOptimizerStop()

	// Läuft das Programm aus diesem Ordner schon? Dann nur das vorhandene Fenster nach vorne holen.
	if !*flagNoWin && focusExistingInstance() {
		return
	}

	token = *flagToken
	if token == "" {
		token = randHex(16)
	}

	// Beim Start: Backup nach den Einstellungen (Standard seit 1.42: wöchentlich, 2 Backups, nur bei Änderungen), alte
	// Papierkorb-Einträge endgültig löschen (Standard seit 1.42: nach 30 Tagen). Bilder den Abschnitten zuordnen und
	// unbenutzte in den Papierkorb: nach dem ersten Einlesen im Hintergrund (assets.go)
	autoBackup(true)
	cleanTrash(loadSettings().papierkorbTage)

	ln, err := net.Listen("tcp", "127.0.0.1:"+strconv.Itoa(*flagPort))
	if err != nil {
		fatalBox("Der interne Server konnte nicht gestartet werden: " + err.Error())
		return
	}
	port := ln.Addr().(*net.TCPAddr).Port
	listenURL = fmt.Sprintf("http://127.0.0.1:%d/?t=%s", port, token)
	writeLock(port)
	defer removeLock()

	srv := &http.Server{Handler: routes(port), ReadHeaderTimeout: 10 * time.Second}
	go func() {
		if err := srv.Serve(ln); err != nil && !errors.Is(err, http.ErrServerClosed) {
			logf("Server-Fehler: %v", err)
		}
	}()
	logf("Server läuft auf %s", strings.Split(listenURL, "?")[0])
	// täglich/wöchentlich/monatlich: auch während das Programm offen bleibt (stündlich prüfen)
	go func() {
		t := time.NewTicker(time.Hour)
		defer t.Stop()
		for {
			select {
			case <-quitCh:
				return
			case <-t.C:
				mu.Lock()
				autoBackup(false)
				mu.Unlock()
			}
		}
	}()

	switch {
	case *flagNoWin:
		fmt.Println("URL:", listenURL)
		<-quitCh
	case *flagBrowser:
		openInBrowser(listenURL)
		waitHeartbeat()
	default:
		runAppWindow(listenURL) // blockiert, bis das Fenster geschlossen ist
	}

	ctx, cancel := context.WithTimeout(context.Background(), 4*time.Second)
	defer cancel()
	_ = srv.Shutdown(ctx)
	// Speicher optimieren (1.39, optimize.go): Fenster ist zu, niemand schreibt mehr – sortieren, Doppeltes verknüpfen
	if loadSettings().optimieren {
		optimizeStorage("beenden", 45*time.Second)
	}
	logf("Programm beendet")
}

// Im Browser-Modus: beenden, wenn das Browserfenster länger nicht mehr "lebt".
func waitHeartbeat() {
	t := time.NewTicker(5 * time.Second)
	defer t.Stop()
	start := time.Now()
	for {
		select {
		case <-quitCh:
			return
		case <-t.C:
			lb := lastBeat.Load()
			if lb == 0 {
				if time.Since(start) > 10*time.Minute {
					return
				}
				continue
			}
			if time.Since(time.UnixMilli(lb)) > 3*time.Minute {
				logf("Kein Lebenszeichen vom Browser – beende")
				return
			}
		}
	}
}

func openLog() {
	p := filepath.Join(cacheDir, "log.txt")
	if st, err := os.Stat(p); err == nil && st.Size() > 1<<20 {
		_ = os.Rename(p, filepath.Join(cacheDir, "log_alt.txt"))
	}
	logFile, _ = os.OpenFile(p, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0o644)
	if logFile != nil {
		log.SetOutput(logFile)
	}
}

func writeInfoFiles() {
	write := func(p, text string) {
		if !exists(p) {
			_ = os.WriteFile(p, []byte(strings.ReplaceAll(text, "\n", "\r\n")), 0o644)
		}
	}
	write(filepath.Join(baseDir, "LIESMICH.txt"), readmeText)
	write(filepath.Join(savesDir, "_INFO.txt"), `SAVES – hier liegen deine Daten
================================

Jede Gruppe ist ein Ordner, jede Untergruppe ein Unterordner.
Jede Seite ist eine Datei "<Seitenname>.seite.json".

  _gruppe.json    Name, Farbe und Reihenfolge der Gruppe
  _struktur.json  Reihenfolge der obersten Gruppen
  _Bilder         in jedem Abschnitt-Ordner: die Bilder und Anhänge seiner Seiten
                  (oben im Saves-Ordner nur frisch eingefügte, bis sie zugeordnet sind)

Tipp: Diesen Ordner kannst du einfach kopieren, um alles zu sichern. Auch ein
einzelner Abschnitt-Ordner ist vollständig (samt Bildern) – zum Weitergeben
einfach kopieren; beim Empfänger in dessen Saves-Ordner legen.
Bitte nichts umbenennen, während KnowledgeTree geöffnet ist.
`)
	write(filepath.Join(cacheDir, "_INFO.txt"), `CACHE – Zwischenspeicher des Programms
=====================================

  verlauf.json   die letzten 100 Aktionen (Rückgängig / Wiederholen)
  zustand.json   zuletzt geöffnete Seite, Zoom, aufgeklappte Gruppen
  Papierkorb     gelöschte Seiten und Gruppen (zum Wiederherstellen einfach
                 zurück in den Saves-Ordner kopieren); nach 30 Tagen endgültig
                 gelöscht (Datei → Einstellungen → Speicher)
  Backups        Sicherungen wie bei OneNote: je Backup ein Ordner mit einem
                 Unterordner je Notizbuch und einer Datei je Abschnitt
                 (.knowledgetree.zip, mit Bildern) – gleiches Format wie in der
                 Browser-Version (Datei → Backup laden / Importieren).
                 Wann und wie viele: Datei → Einstellungen → Sicherung
  WebView2       interne Dateien des Programmfensters
  log.txt        Protokoll (hilft bei Fehlern)

Den Cache-Ordner kannst du jederzeit löschen – deine Daten liegen in "Saves".
`)
}

const readmeText = `KnowledgeTree ` + appVersion + ` – by ` + appAuthor + `
==========================================

Starten:  Doppelklick auf "KnowledgeTree.exe"

Ordner:
  KnowledgeTree.exe   das Programm
  Saves\              DEINE DATEN: Gruppen = Ordner, Seiten = .seite.json-Dateien,
                      Bilder im Ordner _Bilder des jeweiligen Abschnitts
  Cache\              Verlauf (Undo/Redo), Zustand, Papierkorb, Backups, Log
  Add-Ins\            Erweiterungen (*.js) – im Programm unter dem Register
                      "Add-Ins" mit einem Häkchen ein- und ausschalten.
                      "_Add-In-Vorlage_KI.js" = Anleitung + Gerüst in einer
                      Datei: einer KI geben, das fertige Add-In hier ablegen
                      (Dateien mit "_" am Anfang werden nicht geladen).

Alles wird automatisch laufend gespeichert. Zum Mitnehmen oder Sichern
einfach den ganzen Ordner kopieren – oder unter Datei → Backup erstellen eine
Sicherung anlegen (Cache\Backups: ein Ordner je Backup, darin ein Ordner je
Notizbuch und eine Datei je Abschnitt – wie bei OneNote). Backups und
exportierte KnowledgeTree-Dateien (.knowledgetree.html/.zip/.json) lassen sich
im Programm und in der Browser-Version mit "Backup laden" oder "Importieren"
einlesen; eine .knowledgetree.html öffnet sich auch direkt im Browser.

Einen Abschnitt weitergeben: seinen Ordner in Saves\ kopieren – die Bilder
liegen darin (_Bilder). Beim Empfänger den Ordner in dessen Saves-Ordner legen
(KnowledgeTree dabei geschlossen) – er erscheint beim nächsten Start.

Falls sich kein Fenster öffnet:
  "KnowledgeTree im Browser starten.bat" verwenden – dann läuft das Programm
  in deinem normalen Browser (Edge/Chrome/Firefox).

Bedienung (Kurzfassung):
  Klick auf freie Fläche ......... neues Textfeld an dieser Stelle
  Leiste oben am Feld ziehen ..... Feld verschieben
  Rechte Kante ziehen ............ Breite ändern
  Rechtsklick halten + ziehen .... Felder/Pakete verbinden (Knowledge Tree)
  Strg + Rechtsklick ziehen ...... Verbindungen durchschneiden
  Strg + G / Strg + Umschalt + G . gruppieren / Gruppierung aufheben
  Strg + Z / Strg + Y ............ rückgängig / wiederholen (100 Schritte)
  Mausrad / Strg + Mausrad ....... scrollen / zoomen
  Mittlere Maustaste / Leertaste . Fläche verschieben
`

// ---------------------------------------------------------------- Einzelinstanz

type lockInfo struct {
	Port int    `json:"port"`
	PID  int    `json:"pid"`
	Dir  string `json:"dir"`
}

func lockPath() string { return filepath.Join(cacheDir, "laeuft.json") }

func writeLock(port int) {
	b, _ := json.Marshal(lockInfo{Port: port, PID: os.Getpid(), Dir: baseDir})
	_ = os.WriteFile(lockPath(), b, 0o644)
}

func removeLock() { _ = os.Remove(lockPath()) }

func focusExistingInstance() bool {
	var li lockInfo
	if !readJSON(lockPath(), &li) || li.Port == 0 {
		return false
	}
	c := &http.Client{Timeout: 800 * time.Millisecond}
	resp, err := c.Post(fmt.Sprintf("http://127.0.0.1:%d/api/fokus", li.Port), "application/json", nil)
	if err != nil {
		return false
	}
	defer resp.Body.Close()
	var r struct {
		App string `json:"app"`
		Dir string `json:"dir"`
	}
	_ = json.NewDecoder(resp.Body).Decode(&r)
	if r.App == appName && strings.EqualFold(r.Dir, baseDir) {
		logf("Programm läuft bereits – vorhandenes Fenster wird angezeigt")
		return true
	}
	return false
}

// ---------------------------------------------------------------- HTTP

func routes(port int) http.Handler {
	hostOK := map[string]bool{fmt.Sprintf("127.0.0.1:%d", port): true, fmt.Sprintf("localhost:%d", port): true}
	var sub fs.FS
	if d := os.Getenv("KT_WEB_DIR"); d != "" {
		sub = os.DirFS(d) // nur für die Entwicklung
	} else {
		sub, _ = fs.Sub(webFS, "web")
	}
	mux := http.NewServeMux()

	api := func(pattern string, h func(w http.ResponseWriter, r *http.Request)) {
		mux.HandleFunc(pattern, func(w http.ResponseWriter, r *http.Request) {
			if r.Header.Get("X-Token") != token {
				http.Error(w, "kein Zugriff", http.StatusForbidden)
				return
			}
			h(w, r)
		})
	}

	mux.HandleFunc("/api/fokus", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "nur POST", http.StatusMethodNotAllowed)
			return
		}
		go bringWindowToFront()
		writeJSON(w, map[string]any{"app": appName, "dir": baseDir})
	})

	api("/api/laden", func(w http.ResponseWriter, r *http.Request) {
		mu.Lock()
		tree, pages := scanAll()
		sessionID = randHex(8)
		sid := sessionID
		mu.Unlock()
		loadedOnce.Store(true)
		startAssetMaintenance() // Bilder je Abschnitt (seit 1.33), im Hintergrund
		windowLoaded()
		zustand := readRaw(filepath.Join(cacheDir, "zustand.json"))
		verlauf := readRaw(filepath.Join(cacheDir, "verlauf.json"))
		info := map[string]any{
			"version": appVersion, "author": appAuthor, "basis": baseDir,
			"saves": savesDir, "cache": cacheDir, "warnung": warning,
			"backups": backupDir, "papierkorb": trashDir, "bilder": bilderDir, // Speicherort in den Einstellungen (1.36)
		}
		// Laden in Stufen (seit 1.30): erst Baum, Einstellungen, Kennungen und Titel – die Inhalte holt das Programm
		// danach über /api/seiten in kleinen Stücken (die gewünschte Seite zuerst). Bis dahin bleiben sie hier liegen.
		if r.URL.Query().Get("stufen") == "1" {
			// Kopfangaben (Titel, Ebene, Datum) für die Navigation; der Verlauf kommt später (/api/verlauf-laden)
			ids := make([]string, 0, len(pages))
			mu.Lock()
			meta := make(map[string]pageHead, len(pages))
			for id := range pages {
				ids = append(ids, id)
				meta[id] = lastMetas[id]
			}
			stagedPages = pages
			mu.Unlock()
			writeJSON(w, map[string]any{"session": sid, "groups": tree, "pageIds": ids, "meta": meta, "zustand": zustand, "info": info})
			return
		}
		writeJSON(w, map[string]any{
			"session": sid,
			"groups":  tree,
			"pages":   pages,
			"zustand": zustand,
			"verlauf": verlauf,
			"info":    info,
		})
	})

	// Seiteninhalte nach Kennung (Laden in Stufen): aus dem Zwischenspeicher von /api/laden (danach freigegeben),
	// sonst von der Platte
	api("/api/seiten", func(w http.ResponseWriter, r *http.Request) {
		var req struct {
			IDs []string `json:"ids"`
		}
		if err := json.NewDecoder(io.LimitReader(r.Body, 8<<20)).Decode(&req); err != nil {
			http.Error(w, "ungültige Daten", http.StatusBadRequest)
			return
		}
		out := map[string]json.RawMessage{}
		mu.Lock()
		for _, id := range req.IDs {
			if raw, ok := stagedPages[id]; ok {
				delete(stagedPages, id)
				if json.Valid(raw) { // der Schnellweg beim Einlesen prüfte nur den Kopf
					out[id] = raw
				}
			} else if rel, ok := pagePath[id]; ok {
				if raw, err := os.ReadFile(absSaves(rel)); err == nil && json.Valid(raw) {
					out[id] = raw
				}
			}
		}
		mu.Unlock()
		writeJSON(w, map[string]any{"pages": out})
	})

	// Verlauf (Rückgängig) beim Laden in Stufen getrennt: er kann gross sein und wird erst nach der ersten Seite gebraucht
	api("/api/verlauf-laden", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write(readRaw(filepath.Join(cacheDir, "verlauf.json")))
	})

	api("/api/sync", func(w http.ResponseWriter, r *http.Request) {
		savesChanged.Store(true) // Schnellprüfung beim Optimieren (1.39)
		if r.Header.Get("X-Sitzung") != currentSession() {
			http.Error(w, "andere Sitzung aktiv", http.StatusConflict)
			return
		}
		var req SyncReq
		if err := json.NewDecoder(io.LimitReader(r.Body, 200<<20)).Decode(&req); err != nil {
			http.Error(w, "ungültige Daten", http.StatusBadRequest)
			return
		}
		mu.Lock()
		err := reconcile(&req)
		mu.Unlock()
		if err != nil {
			logf("Speichern fehlgeschlagen: %v", err)
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		writeJSON(w, map[string]any{"ok": true})
	})

	cacheWriter := func(name string) func(w http.ResponseWriter, r *http.Request) {
		return func(w http.ResponseWriter, r *http.Request) {
			if r.Header.Get("X-Sitzung") != currentSession() {
				http.Error(w, "andere Sitzung aktiv", http.StatusConflict)
				return
			}
			b, err := io.ReadAll(io.LimitReader(r.Body, 300<<20))
			if err != nil || !json.Valid(b) {
				http.Error(w, "ungültige Daten", http.StatusBadRequest)
				return
			}
			if err := atomicWrite(filepath.Join(cacheDir, name), b); err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
			writeJSON(w, map[string]any{"ok": true})
		}
	}
	api("/api/zustand", cacheWriter("zustand.json"))
	api("/api/verlauf", cacheWriter("verlauf.json"))

	api("/api/bild", func(w http.ResponseWriter, r *http.Request) {
		savesChanged.Store(true) // Schnellprüfung beim Optimieren (1.39)
		b, err := io.ReadAll(io.LimitReader(r.Body, 60<<20))
		if err != nil || len(b) == 0 {
			http.Error(w, "kein Bild", http.StatusBadRequest)
			return
		}
		ext := map[string]string{"image/png": "png", "image/jpeg": "jpg", "image/jpg": "jpg", "image/gif": "gif",
			"image/webp": "webp", "image/svg+xml": "svg", "image/bmp": "bmp"}[strings.ToLower(strings.Split(r.Header.Get("Content-Type"), ";")[0])]
		if ext == "" {
			ext = sniffImage(b)
		}
		if ext == "" {
			http.Error(w, "unbekanntes Bildformat", http.StatusBadRequest)
			return
		}
		sum := sha1.Sum(b)
		name := hex.EncodeToString(sum[:]) + "." + ext
		p := filepath.Join(bilderDir, name)
		if !exists(p) {
			if err := atomicWrite(p, b); err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
		}
		writeJSON(w, map[string]any{"name": name})
	})

	// beliebige Datei (Anhang, z.B. aus OneNote) – wie Bilder: zuerst im Eingang, beim Speichern im Abschnitt
	api("/api/datei", func(w http.ResponseWriter, r *http.Request) {
		savesChanged.Store(true) // Schnellprüfung beim Optimieren (1.39)
		b, err := io.ReadAll(io.LimitReader(r.Body, 110<<20))
		if err != nil || len(b) == 0 {
			http.Error(w, "keine Datei", http.StatusBadRequest)
			return
		}
		ext := sniffImage(b)
		if ext == "" {
			ext = strings.Map(func(c rune) rune {
				if (c >= 'a' && c <= 'z') || (c >= '0' && c <= '9') {
					return c
				}
				return -1
			}, strings.ToLower(r.URL.Query().Get("ext")))
			if len(ext) > 8 {
				ext = ext[:8]
			}
			if ext == "" {
				ext = "bin"
			}
		}
		sum := sha1.Sum(b)
		name := hex.EncodeToString(sum[:]) + "." + ext
		p := filepath.Join(bilderDir, name)
		if !exists(p) {
			if err := atomicWrite(p, b); err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
		}
		writeJSON(w, map[string]any{"name": name})
	})

	api("/api/woerterbuch", handleDict) // Rechtschreibprüfung (1.38, dict.go)
	api("/api/addins", handleAddins)    // Add-Ins-Ordner (1.69, addins.go)

	api("/api/ordner", func(w http.ResponseWriter, r *http.Request) {
		target := map[string]string{"saves": savesDir, "cache": cacheDir, "papierkorb": trashDir,
			"backups": backupDir, "programm": baseDir, "addins": addinsDir}[r.URL.Query().Get("w")]
		if target == "" {
			http.Error(w, "unbekannt", http.StatusBadRequest)
			return
		}
		openFolder(target)
		writeJSON(w, map[string]any{"ok": true})
	})

	api("/api/link", func(w http.ResponseWriter, r *http.Request) {
		var req struct {
			URL string `json:"url"`
		}
		_ = json.NewDecoder(io.LimitReader(r.Body, 1<<16)).Decode(&req)
		u := strings.TrimSpace(req.URL)
		lu := strings.ToLower(u)
		if !(strings.HasPrefix(lu, "http://") || strings.HasPrefix(lu, "https://") || strings.HasPrefix(lu, "mailto:")) {
			http.Error(w, "nicht erlaubt", http.StatusBadRequest)
			return
		}
		openInBrowser(u)
		writeJSON(w, map[string]any{"ok": true})
	})

	// Backup jetzt (?immer=1: auch ohne Änderung) – Ergebnis: Name und Grösse
	api("/api/backup", func(w http.ResponseWriter, r *http.Request) {
		mu.Lock()
		name, size, err := makeBackup(r.URL.Query().Get("immer") == "1")
		mu.Unlock()
		if err != nil {
			logf("Backup fehlgeschlagen: %v", err)
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		if name != "" {
			logf("Backup erstellt: %s (%.1f MB)", name, float64(size)/1e6)
		}
		writeJSON(w, map[string]any{"name": name, "groesse": size})
	})

	// vorhandene Backups (für „Backup laden“ und die Einstellungen)
	api("/api/backups", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, map[string]any{"liste": listBackups()})
	})
	// Inhalt eines Backup-Ordners (Dateiliste) bzw. eine Datei daraus / ein älteres ZIP-Backup
	api("/api/backup-dateien", func(w http.ResponseWriter, r *http.Request) {
		p, ok := backupPath(r.URL.Query().Get("name"), "")
		if !ok || !backupDirRe.MatchString(r.URL.Query().Get("name")) || !exists(p) {
			http.Error(w, "unbekanntes Backup", http.StatusBadRequest)
			return
		}
		writeJSON(w, map[string]any{"dateien": backupFiles(p)})
	})
	api("/api/backup-datei", func(w http.ResponseWriter, r *http.Request) {
		p, ok := backupPath(r.URL.Query().Get("name"), r.URL.Query().Get("pfad"))
		if st, err := os.Stat(p); !ok || err != nil || st.IsDir() {
			http.Error(w, "unbekanntes Backup", http.StatusBadRequest)
			return
		}
		w.Header().Set("Content-Type", "application/octet-stream")
		w.Header().Set("Cache-Control", "no-store")
		http.ServeFile(w, r, p)
	})

	// welche Bilder/Anhänge schon da sind (Backup laden/Importieren überspringt sie)
	api("/api/vorhanden", func(w http.ResponseWriter, r *http.Request) {
		var req struct {
			Namen []string `json:"namen"`
		}
		if err := json.NewDecoder(io.LimitReader(r.Body, 8<<20)).Decode(&req); err != nil {
			http.Error(w, "ungültige Daten", http.StatusBadRequest)
			return
		}
		out := []string{}
		mu.Lock()
		for _, n := range req.Namen {
			if restoreAsset(n) {
				out = append(out, n)
			}
		}
		mu.Unlock()
		writeJSON(w, map[string]any{"vorhanden": out})
	})

	// Belegung (Einstellungen → Speicher)
	api("/api/speicher", func(w http.ResponseWriter, r *http.Request) {
		var opt any
		readJSON(optStatsPath(), &opt)
		writeJSON(w, map[string]any{"saves": dirSize(savesDir), "bilder": imagesSize(), "papierkorb": dirSize(trashDir),
			"backups": dirSize(backupDir), "cache": dirSize(cacheDir), "optimiert": opt})
	})

	// Speicher jetzt optimieren (Einstellungen → Speicher, 1.39) – sonst beim Beenden
	api("/api/optimieren", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, optimizeStorage("knopf", 60*time.Second))
	})

	api("/api/ping", func(w http.ResponseWriter, r *http.Request) {
		lastBeat.Store(time.Now().UnixMilli())
		writeJSON(w, map[string]any{"ok": true, "session": currentSession()})
	})

	api("/api/beenden", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, map[string]any{"ok": true})
		go func() {
			time.Sleep(150 * time.Millisecond)
			closeAppWindow()
			requestQuit()
		}()
	})

	mux.HandleFunc("/bilder/", func(w http.ResponseWriter, r *http.Request) {
		name := path.Base(r.URL.Path)
		if !imgNameExact.MatchString(name) {
			http.NotFound(w, r)
			return
		}
		p := findAsset(name) // Abschnitt (Index), Eingang, Papierkorb (evtl. schon aufgeräumt -> trotzdem anzeigen)
		if p == "" {
			http.NotFound(w, r)
			return
		}
		w.Header().Set("Content-Type", contentType(name))
		w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
		w.Header().Set("Content-Security-Policy", "sandbox")
		http.ServeFile(w, r, p)
	})

	mux.HandleFunc("/kt-app.html", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		w.Header().Set("Cache-Control", "no-cache")
		_, _ = w.Write(appHTML)
	})

	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		p := strings.TrimPrefix(path.Clean(r.URL.Path), "/")
		if p == "" {
			p = "index.html"
		}
		b, err := fs.ReadFile(sub, p)
		if err != nil {
			http.NotFound(w, r)
			return
		}
		w.Header().Set("Content-Type", contentType(p))
		w.Header().Set("Cache-Control", "no-cache")
		_, _ = w.Write(b)
	})

	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !hostOK[r.Host] { // Schutz gegen fremde Webseiten (DNS-Rebinding)
			http.Error(w, "kein Zugriff", http.StatusForbidden)
			return
		}
		mux.ServeHTTP(w, r)
	})
}

func currentSession() string {
	mu.Lock()
	defer mu.Unlock()
	return sessionID
}

func writeJSON(w http.ResponseWriter, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	_ = json.NewEncoder(w).Encode(v)
}

func readRaw(p string) json.RawMessage {
	b, err := os.ReadFile(p)
	if err != nil || !json.Valid(b) {
		return json.RawMessage("null")
	}
	return json.RawMessage(b)
}

func contentType(name string) string {
	switch strings.ToLower(filepath.Ext(name)) {
	case ".html":
		return "text/html; charset=utf-8"
	case ".js":
		return "text/javascript; charset=utf-8"
	case ".css":
		return "text/css; charset=utf-8"
	case ".svg":
		return "image/svg+xml"
	case ".png":
		return "image/png"
	case ".jpg", ".jpeg":
		return "image/jpeg"
	case ".gif":
		return "image/gif"
	case ".webp":
		return "image/webp"
	case ".bmp":
		return "image/bmp"
	case ".ico":
		return "image/x-icon"
	case ".json":
		return "application/json"
	}
	return "application/octet-stream"
}

func sniffImage(b []byte) string {
	ct := http.DetectContentType(b)
	switch ct {
	case "image/png":
		return "png"
	case "image/jpeg":
		return "jpg"
	case "image/gif":
		return "gif"
	case "image/webp":
		return "webp"
	case "image/bmp":
		return "bmp"
	}
	return ""
}
