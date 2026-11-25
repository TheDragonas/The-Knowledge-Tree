package main

// Wörterbücher für die Rechtschreibprüfung (seit 1.38): Hunspell-Dateien von LibreOffice (de_CH_frami, de_DE_frami,
// en_US, en_GB). Beim ersten Gebrauch lädt das Programm sie einmal aus dem Netz und legt sie in Cache/Woerterbuch ab –
// danach geht die Prüfung ohne Internet. KT_DICT_BASE (nur für Tests) ersetzt die Quellen durch einen eigenen Server.

import (
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"sync"
	"time"
)

var dictSources = map[string][2]string{ // Sprache → LibreOffice-Pfad, npm-Paket (Ersatz)
	"de-CH": {"de/de_CH_frami", "dictionary-de-ch@3"},
	"de-DE": {"de/de_DE_frami", "dictionary-de@3"},
	"en-US": {"en/en_US", "dictionary-en@4"},
	"en-GB": {"en/en_GB", "dictionary-en-gb@3"},
	"fr-FR": {"fr_FR/fr", "dictionary-fr@3"}, // 1.42
	"la":    {"la/la", "dictionary-la@3"},    // 1.42
}

var dictMu sync.Mutex

func dictURLs(lang, ext string) []string {
	if b := os.Getenv("KT_DICT_BASE"); b != "" {
		return []string{fmt.Sprintf("%s/%s.%s", b, lang, ext)}
	}
	s := dictSources[lang]
	return []string{
		"https://cdn.jsdelivr.net/gh/LibreOffice/dictionaries@master/" + s[0] + "." + ext,
		"https://raw.githubusercontent.com/LibreOffice/dictionaries/master/" + s[0] + "." + ext,
		"https://cdn.jsdelivr.net/npm/" + s[1] + "/index." + ext,
	}
}

// dictFile liefert den Pfad der Datei in Cache/Woerterbuch – lädt sie bei Bedarf (fresh: neu laden)
func dictFile(lang, ext string, fresh bool) (string, error) {
	if _, ok := dictSources[lang]; !ok || (ext != "aff" && ext != "dic") {
		return "", errors.New("unbekanntes Wörterbuch")
	}
	dir := filepath.Join(cacheDir, "Woerterbuch")
	dst := filepath.Join(dir, lang+"."+ext)
	dictMu.Lock()
	defer dictMu.Unlock()
	if !fresh && exists(dst) {
		return dst, nil
	}
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return "", err
	}
	client := &http.Client{Timeout: 120 * time.Second}
	var last error
	for _, u := range dictURLs(lang, ext) {
		resp, err := client.Get(u)
		if err != nil {
			last = err
			continue
		}
		data, err := io.ReadAll(io.LimitReader(resp.Body, 40<<20))
		resp.Body.Close()
		if err != nil || resp.StatusCode != http.StatusOK || len(data) < 500 {
			last = fmt.Errorf("%s: %s", u, resp.Status)
			continue
		}
		tmp := dst + ".tmp"
		if err := os.WriteFile(tmp, data, 0o644); err != nil {
			return "", err
		}
		if err := os.Rename(tmp, dst); err != nil {
			return "", err
		}
		logf("Wörterbuch geladen: %s.%s (%d Bytes) von %s", lang, ext, len(data), u)
		return dst, nil
	}
	if exists(dst) { // neu laden misslungen: das alte behalten
		return dst, nil
	}
	if last == nil {
		last = errors.New("keine Quelle erreichbar")
	}
	return "", last
}

func handleDict(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	p, err := dictFile(q.Get("l"), q.Get("f"), q.Get("neu") == "1")
	if err != nil {
		http.Error(w, "Wörterbuch nicht verfügbar: "+err.Error(), http.StatusBadGateway)
		return
	}
	w.Header().Set("Content-Type", "application/octet-stream")
	w.Header().Set("Cache-Control", "no-store")
	http.ServeFile(w, r, p)
}
