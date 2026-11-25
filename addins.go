package main

// Add-Ins-Ordner (1.69): "Add-Ins" neben KnowledgeTree.exe
//
//   *.js                    Add-Ins – werden beim Start geladen (ein/aus: Register „Add-Ins“ im Programm);
//                           Dateien mit „_“ am Anfang werden übersprungen
//   _Add-In-Vorlage_KI.js   EINE Datei (1.70): Anleitung für eine KI (Kommentar) + lauffähiges Gerüst – wird bei jedem
//                           Start auf den Stand des Programms gebracht (bis 1.69: getrennte .md-Datei, wird entfernt)
//   _entfernt\              im Programm entfernte Add-Ins (zum Wiederherstellen zurückverschieben)

import (
	"encoding/json"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"
)

const (
	addinsFolder  = "Add-Ins"
	addinTemplate = "_Add-In-Vorlage_KI.js"
	addinOldMD    = "Add-In-Vorlage_KI-Kontext.md" // 1.69 – ersetzt durch die eine .js-Vorlage
	addinMaxSize  = 4 << 20
)

var addinsDir string

// Vorlage aus dem Programm (web/addins/…), Zeilenenden wie unter Windows
func addinTemplateText() []byte {
	b, err := webFS.ReadFile("web/addins/" + addinTemplate)
	if err != nil {
		return nil
	}
	return []byte(strings.ReplaceAll(strings.ReplaceAll(string(b), "\r\n", "\n"), "\n", "\r\n"))
}

// Ordner anlegen und die Vorlage bereitstellen (fehlt sie oder ist sie veraltet: neu schreiben)
func ensureAddinsDir() {
	addinsDir = filepath.Join(baseDir, addinsFolder)
	if err := os.MkdirAll(addinsDir, 0o755); err != nil {
		logf("Add-Ins-Ordner: %v", err)
		return
	}
	t := addinTemplateText()
	if t == nil {
		return
	}
	// alte Vorlage (1.69, vom Programm erzeugt) entfernen – nur wenn sie noch unsere ist
	if old, err := os.ReadFile(filepath.Join(addinsDir, addinOldMD)); err == nil && strings.HasPrefix(string(old), "# KnowledgeTree – Add-In-Vorlage") {
		_ = os.Remove(filepath.Join(addinsDir, addinOldMD))
	}
	p := filepath.Join(addinsDir, addinTemplate)
	if old, err := os.ReadFile(p); err != nil || string(old) != string(t) {
		if err := atomicWrite(p, t); err != nil {
			logf("Add-In-Vorlage: %v", err)
		}
	}
}

// Dateiname eines Add-Ins prüfen: nur Name.js direkt im Ordner
func addinPath(name string) (string, bool) {
	n := strings.TrimSpace(name)
	if n == "." || n == "" || !strings.EqualFold(filepath.Ext(n), ".js") || strings.ContainsAny(n, `<>:"/\|?*`) || strings.HasPrefix(n, ".") || strings.HasPrefix(n, "_") {
		return "", false
	}
	return filepath.Join(addinsDir, n), true
}

type addinFile struct {
	Datei string `json:"datei"`
	Code  string `json:"code"`
	Zeit  int64  `json:"zeit"`
}

// POST /api/addins  { a: "liste" | "speichern" | "entfernen" | "vorlage", datei, code }
func handleAddins(w http.ResponseWriter, r *http.Request) {
	var req struct {
		A     string `json:"a"`
		Datei string `json:"datei"`
		Code  string `json:"code"`
	}
	if err := json.NewDecoder(io.LimitReader(r.Body, addinMaxSize+(1<<16))).Decode(&req); err != nil && err != io.EOF {
		http.Error(w, "ungültige Anfrage", http.StatusBadRequest)
		return
	}
	if addinsDir == "" {
		ensureAddinsDir()
	}
	switch req.A {
	case "liste":
		out := []addinFile{}
		ents, _ := os.ReadDir(addinsDir)
		for _, e := range ents {
			if e.IsDir() || !strings.EqualFold(filepath.Ext(e.Name()), ".js") || strings.HasPrefix(e.Name(), ".") || strings.HasPrefix(e.Name(), "_") {
				continue
			}
			info, err := e.Info()
			if err != nil || info.Size() > addinMaxSize {
				continue
			}
			b, err := os.ReadFile(filepath.Join(addinsDir, e.Name()))
			if err != nil {
				continue
			}
			out = append(out, addinFile{Datei: e.Name(), Code: string(b), Zeit: info.ModTime().UnixMilli()})
		}
		sort.Slice(out, func(i, j int) bool { return strings.ToLower(out[i].Datei) < strings.ToLower(out[j].Datei) })
		writeJSON(w, map[string]any{"liste": out, "ordner": addinsDir})
	case "speichern":
		p, ok := addinPath(req.Datei)
		if !ok || len(req.Code) > addinMaxSize {
			http.Error(w, "ungültiger Dateiname (nur Name.js, ohne _ am Anfang)", http.StatusBadRequest)
			return
		}
		if err := atomicWrite(p, []byte(req.Code)); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		logf("Add-In gespeichert: %s", filepath.Base(p))
		writeJSON(w, map[string]any{"datei": filepath.Base(p)})
	case "entfernen":
		p, ok := addinPath(req.Datei)
		if !ok || !exists(p) {
			http.Error(w, "nicht gefunden", http.StatusNotFound)
			return
		}
		bin := filepath.Join(addinsDir, "_entfernt")
		_ = os.MkdirAll(bin, 0o755)
		dst := filepath.Join(bin, filepath.Base(p))
		if exists(dst) {
			dst = filepath.Join(bin, strings.TrimSuffix(filepath.Base(p), filepath.Ext(p))+" "+time.Now().Format("2006-01-02 150405")+".js")
		}
		if err := os.Rename(p, dst); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		logf("Add-In entfernt: %s → _entfernt", filepath.Base(p))
		writeJSON(w, map[string]any{"ok": true})
	case "vorlage":
		w.Header().Set("Content-Type", "text/javascript; charset=utf-8")
		_, _ = w.Write(addinTemplateText())
	default:
		http.Error(w, "unbekannt", http.StatusBadRequest)
	}
}
