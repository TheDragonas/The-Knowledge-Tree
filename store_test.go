package main

// go test ./...  – Prüfungen für den Saves-Teil (seit 1.24)

import (
	"encoding/json"
	"io/fs"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"testing"
	"time"
)

// assetNames muss genau dasselbe finden wie der frühere reguläre Ausdruck
func TestAssetNames(t *testing.T) {
	re := regexp.MustCompile(`[0-9a-f]{40}\.[a-z0-9]{1,8}`)
	h := strings.Repeat("ab12", 10)
	cases := []string{
		h + ".png", "x" + h + ".jpeg", "1" + h + ".pngABC", h + ".abcdefghij", h + ".", h[:39] + ".png", "f" + h + ".pdf",
		`{"src":"` + h + `.png","pts":[1.5,2.25,` + h + `.svg]}`, strings.Repeat("0", 80) + ".bin", h + ".x" + h + ".y",
	}
	for _, c := range cases {
		var got []string
		assetNames([]byte(c), func(n string) { got = append(got, n) })
		want := re.FindAllString(c, -1)
		if strings.Join(got, "|") != strings.Join(want, "|") {
			t.Errorf("%q: %v statt %v", c, got, want)
		}
	}
}

// pageJSON: gleicher Inhalt, nur oberste Ebenen auf eigenen Zeilen
func TestPageJSON(t *testing.T) {
	in := `{"id":"p1","title":"a \"b\" {c}, [d]","boxes":[{"id":"b1","html":"x:y,z"},{"id":"b2"}],"drawings":[],"links":[{"a":1}],"pkgs":{},"n":-1.5e3}`
	out, err := pageJSON([]byte(in))
	if err != nil {
		t.Fatal(err)
	}
	var a, b any
	_ = json.Unmarshal([]byte(in), &a)
	if err := json.Unmarshal(out, &b); err != nil {
		t.Fatalf("ungültig: %v\n%s", err, out)
	}
	ja, _ := json.Marshal(a)
	jb, _ := json.Marshal(b)
	if string(ja) != string(jb) {
		t.Fatalf("Inhalt verändert:\n%s", out)
	}
	want := "{\n  \"id\": \"p1\",\n  \"title\": \"a \\\"b\\\" {c}, [d]\",\n  \"boxes\": [\n    {\"id\":\"b1\",\"html\":\"x:y,z\"},\n    {\"id\":\"b2\"}\n  ],\n  \"drawings\": [],\n  \"links\": [\n    {\"a\":1}\n  ],\n  \"pkgs\": {},\n  \"n\": -1.5e3\n}"
	if string(out) != want {
		t.Fatalf("Form:\n%s\nerwartet:\n%s", out, want)
	}
}

// mit echten Daten (nur wenn KT_SAVES gesetzt ist): gleiche Namen wie der reguläre Ausdruck
func TestAssetNamesSaves(t *testing.T) {
	dir := os.Getenv("KT_SAVES")
	if dir == "" {
		t.Skip("KT_SAVES nicht gesetzt")
	}
	re := regexp.MustCompile(`[0-9a-f]{40}\.[a-z0-9]{1,8}`)
	var all [][]byte
	_ = filepath.WalkDir(dir, func(p string, d fs.DirEntry, err error) error {
		if err == nil && !d.IsDir() && strings.HasSuffix(p, pageSuffix) {
			b, _ := os.ReadFile(p)
			all = append(all, b)
		}
		return nil
	})
	t0 := time.Now()
	a := map[string]bool{}
	for _, b := range all {
		assetNames(b, func(n string) { a[n] = true })
	}
	t1 := time.Now()
	r := map[string]bool{}
	for _, b := range all {
		for _, m := range re.FindAll(b, -1) {
			r[string(m)] = true
		}
	}
	t.Logf("%d Seiten: assetNames %v, regexp %v, %d Namen", len(all), t1.Sub(t0), time.Since(t1), len(a))
	if len(a) != len(r) {
		t.Fatalf("%d statt %d Namen", len(a), len(r))
	}
	for n := range r {
		if !a[n] {
			t.Fatalf("fehlt: %s", n)
		}
	}
}
