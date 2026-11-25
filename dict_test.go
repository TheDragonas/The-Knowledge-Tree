package main

// Wörterbücher (1.38): beim ersten Mal aus dem Netz, danach aus Cache/Woerterbuch; unbekannte abgelehnt

import (
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"sync/atomic"
	"testing"
)

func TestDictDownloadAndCache(t *testing.T) {
	setupDirs(t)
	var hits int32
	body := strings.Repeat("Wort/S\n", 200)
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		atomic.AddInt32(&hits, 1)
		if strings.HasSuffix(r.URL.Path, "/de-CH.dic") {
			_, _ = w.Write([]byte(body))
			return
		}
		http.NotFound(w, r)
	}))
	defer srv.Close()
	t.Setenv("KT_DICT_BASE", srv.URL)
	p, err := dictFile("de-CH", "dic", false)
	if err != nil {
		t.Fatal(err)
	}
	if b, _ := os.ReadFile(p); string(b) != body {
		t.Fatal("Inhalt falsch")
	}
	if _, err := dictFile("de-CH", "dic", false); err != nil || atomic.LoadInt32(&hits) != 1 {
		t.Fatalf("zweites Mal sollte aus dem Cache kommen (Abrufe %d, %v)", hits, err)
	}
	if _, err := dictFile("de-CH", "aff", false); err == nil {
		t.Fatal("fehlende Datei sollte einen Fehler geben")
	}
	if _, err := dictFile("xx", "dic", false); err == nil {
		t.Fatal("unbekannte Sprache sollte abgelehnt werden")
	}
	if _, err := dictFile("de-CH", "../x", false); err == nil {
		t.Fatal("unbekannte Endung sollte abgelehnt werden")
	}
	// neu laden misslungen → alte Datei bleibt
	srv.Close()
	if p2, err := dictFile("de-CH", "dic", true); err != nil || p2 != p {
		t.Fatalf("altes Wörterbuch sollte bleiben: %v", err)
	}
}
