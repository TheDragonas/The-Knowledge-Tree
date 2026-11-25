package main

// store.go – bildet die Gruppen/Seiten-Struktur 1:1 als Ordner im "Saves"-Ordner ab.
//
//   Saves/
//     _struktur.json              Reihenfolge der obersten Gruppen
//     _Bilder/                    Eingang: frisch eingefügte Bilder, bis sie ihrem Abschnitt zugeordnet sind
//     <Gruppe>/<Abschnitt>/_Bilder/  Bilder und Anhänge der Seiten dieses Abschnitts (seit 1.33, assets.go)
//     <Gruppe>/
//       _gruppe.json              ID, Name, Farbe, Reihenfolge
//       <Seite>.seite.json        Inhalt einer Seite
//       <Untergruppe>/ ...

import (
	"archive/zip"
	"bufio"
	"bytes"
	"compress/flate"
	"crypto/rand"
	"crypto/sha1"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"io/fs"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"time"
	"unicode/utf8"
)

const (
	pageSuffix   = ".seite.json"
	groupMetaFn  = "_gruppe.json"
	rootMetaFn   = "_struktur.json"
	bilderFolder = "_Bilder"
)

type TreeGroup struct {
	ID     string       `json:"id"`
	Name   string       `json:"name"`
	Color  string       `json:"color"`
	Kind   string       `json:"kind,omitempty"`
	Closed bool         `json:"closed,omitempty"`
	Groups []*TreeGroup `json:"groups"`
	Pages  []string     `json:"pages"`
}

type groupMeta struct {
	Typ     string   `json:"typ"`
	ID      string   `json:"id"`
	Name    string   `json:"name"`
	Farbe   string   `json:"farbe"`
	Art     string   `json:"art,omitempty"`
	Zu      bool     `json:"geschlossen,omitempty"`
	Gruppen []string `json:"reihenfolgeGruppen"`
	Seiten  []string `json:"reihenfolgeSeiten"`
}

type rootMeta struct {
	Typ     string   `json:"typ"`
	Version int      `json:"version"`
	Gruppen []string `json:"reihenfolgeGruppen"`
}

type SyncReq struct {
	Groups []*TreeGroup               `json:"groups"`
	Titles map[string]string          `json:"titles"`
	Pages  map[string]json.RawMessage `json:"pages"`
	// Teil (seit 1.24): grosse Speicherungen kommen in mehreren Anfragen. Bei allen ausser der letzten ist "teil"
	// gesetzt – dann wird nur angelegt und geschrieben, nichts gelöscht und keine leere Seite vorgemerkt.
	Partial bool `json:"teil"`
}

var (
	groupPath   = map[string]string{}          // Gruppen-ID -> Ordner (relativ zu Saves)
	pagePath    = map[string]string{}          // Seiten-ID  -> Datei  (relativ zu Saves)
	stagedPages = map[string]json.RawMessage{} // Laden in Stufen: noch nicht abgeholte Seiten (seit 1.30)
	metaWritten = map[string]string{}          // absoluter Pfad -> zuletzt geschriebener Inhalt
)

func newID(prefix string) string {
	b := make([]byte, 6)
	_, _ = rand.Read(b)
	return prefix + fmt.Sprintf("%x", time.Now().UnixMilli()) + hex.EncodeToString(b)
}

func randHex(n int) string {
	b := make([]byte, n)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}

func absSaves(rel string) string { return filepath.Join(savesDir, rel) }

func exists(p string) bool {
	_, err := os.Stat(p)
	return err == nil
}

// ---------------------------------------------------------------- Namen

var reservedNames = map[string]bool{"CON": true, "PRN": true, "AUX": true, "NUL": true,
	"COM1": true, "COM2": true, "COM3": true, "COM4": true, "COM5": true, "COM6": true, "COM7": true, "COM8": true, "COM9": true,
	"LPT1": true, "LPT2": true, "LPT3": true, "LPT4": true, "LPT5": true, "LPT6": true, "LPT7": true, "LPT8": true, "LPT9": true}

func sanitizeName(s string) string {
	var b strings.Builder
	for _, r := range strings.TrimSpace(s) {
		switch {
		case r < 32 || r == 127:
			continue
		case strings.ContainsRune(`<>:"/\|?*`, r):
			b.WriteRune('_')
		default:
			b.WriteRune(r)
		}
	}
	out := strings.TrimRight(b.String(), ". ")
	out = strings.TrimSpace(out)
	if utf8.RuneCountInString(out) > 80 {
		out = strings.TrimRight(string([]rune(out)[:80]), ". ")
	}
	for strings.HasPrefix(out, "_") || strings.HasPrefix(out, ".") {
		out = "-" + out[1:]
	}
	if out == "" {
		out = "Unbenannt"
	}
	base := strings.ToUpper(strings.SplitN(out, ".", 2)[0])
	if reservedNames[base] {
		out = out + "-"
	}
	return out
}

func uniqueName(base, suffix string, used map[string]bool) string {
	name := base + suffix
	for i := 2; used[strings.ToLower(name)]; i++ {
		name = fmt.Sprintf("%s (%d)%s", base, i, suffix)
	}
	used[strings.ToLower(name)] = true
	return name
}

// ---------------------------------------------------------------- Dateien

func atomicWrite(path string, data []byte) error {
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}
	tmp := path + ".tmp"
	if err := os.WriteFile(tmp, data, 0o644); err != nil {
		return err
	}
	var err error
	for i := 0; i < 8; i++ { // Virenscanner/Indexer sperren Dateien unter Windows kurz
		if err = os.Rename(tmp, path); err == nil {
			return nil
		}
		time.Sleep(60 * time.Millisecond)
	}
	return err
}

func renameRetry(from, to string) error {
	var err error
	for i := 0; i < 8; i++ {
		if err = os.Rename(from, to); err == nil {
			return nil
		}
		time.Sleep(60 * time.Millisecond)
	}
	return err
}

func readJSON(path string, v any) bool {
	b, err := os.ReadFile(path)
	if err != nil {
		return false
	}
	return json.Unmarshal(b, v) == nil
}

func writeJSONIfChanged(path string, v any) {
	b, _ := json.MarshalIndent(v, "", "  ")
	s := string(b)
	if metaWritten[path] == s && exists(path) {
		return
	}
	// nach dem Einlesen ist metaWritten leer: gleichen Inhalt nicht neu schreiben (sonst änderte jeder Start die
	// Dateizeiten, und „Backup nur bei Änderungen“ sähe immer eine Änderung)
	if _, known := metaWritten[path]; !known {
		if old, err := os.ReadFile(path); err == nil && bytes.Equal(old, b) {
			metaWritten[path] = s
			return
		}
	}
	if err := atomicWrite(path, b); err != nil {
		logf("Fehler beim Schreiben %s: %v", path, err)
		return
	}
	metaWritten[path] = s
}

// ---------------------------------------------------------------- Einlesen

// pageHead: Kopfangaben einer Seite für die Navigation (Laden in Stufen, 1.32) – Titel, Ebene, Datum
type pageHead struct {
	ID       string  `json:"-"`
	Title    string  `json:"t"`
	Level    float64 `json:"l"`
	Created  float64 `json:"c"`
	Modified float64 `json:"m"`
}

var lastMetas = map[string]pageHead{}

// readPageHead liest id, title, level, created und modified aus dem obersten Objekt und hört auf, sobald alle da
// sind (sie stehen in KnowledgeTree-Seiten ganz vorne). Andere Werte davor werden übersprungen.
func readPageHead(raw []byte) (pageHead, bool) {
	var h pageHead
	dec := json.NewDecoder(bytes.NewReader(raw))
	if t, err := dec.Token(); err != nil || t != json.Delim('{') {
		return h, false
	}
	need := 5
	for need > 0 && dec.More() {
		t, err := dec.Token()
		if err != nil {
			return h, false
		}
		k, _ := t.(string)
		var err2 error
		switch k {
		case "id":
			err2 = dec.Decode(&h.ID)
		case "title":
			err2 = dec.Decode(&h.Title)
		case "level":
			err2 = dec.Decode(&h.Level)
		case "created":
			err2 = dec.Decode(&h.Created)
		case "modified":
			err2 = dec.Decode(&h.Modified)
		default:
			var skip json.RawMessage
			err2 = dec.Decode(&skip)
			need++
		}
		if err2 != nil {
			if k == "level" || k == "created" || k == "modified" { // null oder Text: nicht schlimm
				continue
			}
			return h, false
		}
		need--
	}
	return h, true
}

// scanAll liest den kompletten Saves-Ordner ein und baut den Index neu auf.
func scanAll() ([]*TreeGroup, map[string]json.RawMessage) {
	lastMetas = map[string]pageHead{}
	idxReset()
	pageGroupOf = map[string]string{}
	groupPath = map[string]string{}
	pagePath = map[string]string{}
	metaWritten = map[string]string{}
	seen := map[string]bool{}
	pages := map[string]json.RawMessage{}

	var rm rootMeta
	readJSON(filepath.Join(savesDir, rootMetaFn), &rm)

	var readPage func(rel string) string
	readPage = func(rel string) string {
		abs := absSaves(rel)
		raw, err := os.ReadFile(abs)
		if err != nil {
			return ""
		}
		// Schnellweg (1.32): nur die Kopfangaben lesen (stehen vorne in der Datei), nicht die ganze Seite zerlegen –
		// bei grossen Saves-Ordnern war das der grösste Teil der Startzeit. Gültig ist eine Seite trotzdem nur, wenn
		// sie ganz gültiges JSON ist (geprüft beim Ausliefern in /api/seiten).
		if h, ok := readPageHead(raw); ok && h.ID != "" && !seen[h.ID] && h.Title != "" {
			seen[h.ID] = true
			pagePath[h.ID] = rel
			pages[h.ID] = raw
			lastMetas[h.ID] = h
			return h.ID
		}
		var m map[string]any
		if json.Unmarshal(raw, &m) != nil || m == nil {
			logf("Seite nicht lesbar (übersprungen): %s", rel)
			return ""
		}
		changed := false
		id, _ := m["id"].(string)
		if id == "" || seen[id] {
			id = newID("p")
			m["id"] = id
			changed = true
		}
		if t, _ := m["title"].(string); t == "" {
			m["title"] = strings.TrimSuffix(filepath.Base(rel), pageSuffix)
			changed = true
		}
		seen[id] = true
		if changed {
			raw, _ = json.Marshal(m)
			if out, err := pageJSON(raw); err == nil {
				raw = out
			}
			_ = atomicWrite(abs, raw)
		}
		pagePath[id] = rel
		pages[id] = raw
		h, _ := readPageHead(raw)
		lastMetas[id] = h
		return id
	}

	var scanGroup func(rel string) *TreeGroup
	scanGroup = func(rel string) *TreeGroup {
		abs := absSaves(rel)
		var m groupMeta
		readJSON(filepath.Join(abs, groupMetaFn), &m)
		changed := false
		if m.ID == "" || seen[m.ID] {
			m.ID = newID("g")
			changed = true
		}
		seen[m.ID] = true
		if strings.TrimSpace(m.Name) == "" {
			m.Name = filepath.Base(rel)
			changed = true
		}
		g := &TreeGroup{ID: m.ID, Name: m.Name, Color: m.Farbe, Kind: m.Art, Closed: m.Zu, Groups: []*TreeGroup{}, Pages: []string{}}
		groupPath[m.ID] = rel
		entries, _ := os.ReadDir(abs)
		var subs []*TreeGroup
		var pids []string
		for _, e := range entries {
			n := e.Name()
			if e.IsDir() {
				if strings.HasPrefix(n, "_") || strings.HasPrefix(n, ".") {
					continue
				}
				subs = append(subs, scanGroup(filepath.Join(rel, n)))
			} else if strings.HasSuffix(strings.ToLower(n), pageSuffix) {
				if id := readPage(filepath.Join(rel, n)); id != "" {
					pids = append(pids, id)
				}
			}
		}
		g.Groups = orderGroups(subs, m.Gruppen)
		g.Pages = orderIDs(pids, m.Seiten)
		for _, pid := range pids {
			pageGroupOf[pid] = m.ID
		}
		idxScanDir(rel) // Bilder dieses Abschnitts (seit 1.33)
		if changed {
			m.Typ = "KnowledgeTree-Gruppe"
			m.Gruppen = groupIDs(g.Groups)
			m.Seiten = g.Pages
			writeJSONIfChanged(filepath.Join(abs, groupMetaFn), m)
		}
		return g
	}

	entries, _ := os.ReadDir(savesDir)
	var roots []*TreeGroup
	var loosePages []string
	for _, e := range entries {
		n := e.Name()
		if e.IsDir() {
			if strings.HasPrefix(n, "_") || strings.HasPrefix(n, ".") {
				continue
			}
			roots = append(roots, scanGroup(n))
		} else if strings.HasSuffix(strings.ToLower(n), pageSuffix) {
			if id := readPage(n); id != "" {
				loosePages = append(loosePages, id)
			}
		}
	}
	roots = orderGroups(roots, rm.Gruppen)
	if len(loosePages) > 0 { // Seiten direkt in Saves -> in Gruppe "Unsortiert" anzeigen
		roots = append(roots, &TreeGroup{ID: newID("g"), Name: "Unsortiert", Groups: []*TreeGroup{}, Pages: loosePages})
	}
	if roots == nil {
		roots = []*TreeGroup{}
	}
	return roots, pages
}

func groupIDs(list []*TreeGroup) []string {
	out := make([]string, 0, len(list))
	for _, g := range list {
		out = append(out, g.ID)
	}
	return out
}

func orderGroups(list []*TreeGroup, order []string) []*TreeGroup {
	pos := map[string]int{}
	for i, id := range order {
		pos[id] = i
	}
	sort.SliceStable(list, func(a, b int) bool {
		pa, oka := pos[list[a].ID]
		pb, okb := pos[list[b].ID]
		if oka && okb {
			return pa < pb
		}
		return oka && !okb
	})
	if list == nil {
		return []*TreeGroup{}
	}
	return list
}

func orderIDs(list []string, order []string) []string {
	pos := map[string]int{}
	for i, id := range order {
		pos[id] = i
	}
	sort.SliceStable(list, func(a, b int) bool {
		pa, oka := pos[list[a]]
		pb, okb := pos[list[b]]
		if oka && okb {
			return pa < pb
		}
		return oka && !okb
	})
	if list == nil {
		return []string{}
	}
	return list
}

// ---------------------------------------------------------------- Abgleich

func hasPrefixFold(p, prefix string) bool {
	return len(p) >= len(prefix) && strings.EqualFold(p[:len(prefix)], prefix)
}

// Pfade im Index nachführen, nachdem ein Ordner/eine Datei umbenannt wurde.
func updatePrefix(oldRel, newRel string) {
	sep := string(os.PathSeparator)
	fix := func(m map[string]string) {
		for id, p := range m {
			if strings.EqualFold(p, oldRel) {
				m[id] = newRel
			} else if hasPrefixFold(p, oldRel+sep) {
				m[id] = newRel + p[len(oldRel):]
			}
		}
	}
	fix(groupPath)
	fix(pagePath)
	idxRename(oldRel, newRel)
}

func moveAside(rel string) {
	tmp := rel + "__alt_" + randHex(3)
	if err := renameRetry(absSaves(rel), absSaves(tmp)); err != nil {
		logf("Konnte %s nicht verschieben: %v", rel, err)
		return
	}
	updatePrefix(rel, tmp)
}

func ensureGroupDir(id, desired string) {
	cur, ok := groupPath[id]
	if ok && cur == desired {
		if !exists(absSaves(desired)) {
			_ = os.MkdirAll(absSaves(desired), 0o755)
		}
		return
	}
	if ok && !exists(absSaves(cur)) {
		ok = false
	}
	if exists(absSaves(desired)) && !(ok && strings.EqualFold(cur, desired)) {
		moveAside(desired)
		cur, ok = groupPath[id]
		if ok && !exists(absSaves(cur)) {
			ok = false
		}
	}
	_ = os.MkdirAll(filepath.Dir(absSaves(desired)), 0o755)
	if ok {
		if err := renameRetry(absSaves(cur), absSaves(desired)); err != nil {
			logf("Umbenennen fehlgeschlagen %s -> %s: %v", cur, desired, err)
			groupPath[id] = cur
			return
		}
		updatePrefix(cur, desired)
	} else {
		_ = os.MkdirAll(absSaves(desired), 0o755)
	}
	groupPath[id] = desired
}

func ensurePage(id, title, desired string, content json.RawMessage) {
	cur, ok := pagePath[id]
	if ok && !exists(absSaves(cur)) {
		ok = false
	}
	if !(ok && cur == desired) {
		if exists(absSaves(desired)) && !(ok && strings.EqualFold(cur, desired)) {
			moveAside(desired)
			cur, ok = pagePath[id]
			if ok && !exists(absSaves(cur)) {
				ok = false
			}
		}
		if ok {
			if err := renameRetry(absSaves(cur), absSaves(desired)); err != nil {
				logf("Umbenennen fehlgeschlagen %s -> %s: %v", cur, desired, err)
				desired = cur
			}
		}
	}
	pagePath[id] = desired
	abs := absSaves(desired)
	if len(content) > 0 && string(content) != "null" {
		out, err := pageJSON(content)
		if err != nil {
			out = content
		}
		if sameFile(abs, out) { // unverändert: nicht neu schreiben (schont die Platte, Dateizeit bleibt)
			return
		}
		if err := atomicWrite(abs, out); err != nil {
			logf("Seite speichern fehlgeschlagen %s: %v", desired, err)
		}
	} else if !exists(abs) {
		b, _ := json.MarshalIndent(map[string]any{"typ": "KnowledgeTree-Seite", "id": id, "title": title}, "", "  ")
		_ = atomicWrite(abs, b)
	}
}

// pageJSON schreibt eine Seite platzsparend, aber lesbar (seit 1.24): jedes oberste Feld und jeder Eintrag der
// obersten Listen (Textfelder, Zeichnungen, Verbindungen …) auf einer eigenen Zeile, alles darin kompakt. Bis 1.23
// war alles eingerückt – bei Freihand stand jede Koordinate auf einer Zeile (64 statt 27 MB bei 234 Seiten).
// Die Reihenfolge der Felder bleibt, wie sie vom Programm kommt.
func pageJSON(raw []byte) ([]byte, error) {
	var buf bytes.Buffer
	if err := json.Compact(&buf, raw); err != nil {
		return nil, err
	}
	src := buf.Bytes()
	out := make([]byte, 0, len(src)+len(src)/40+64)
	depth, inStr, esc := 0, false, false
	nl := func(d int) {
		out = append(out, '\n')
		for i := 0; i < d; i++ {
			out = append(out, ' ', ' ')
		}
	}
	for i, c := range src {
		if inStr {
			out = append(out, c)
			if esc {
				esc = false
			} else if c == '\\' {
				esc = true
			} else if c == '"' {
				inStr = false
			}
			continue
		}
		switch c {
		case '"':
			inStr = true
			out = append(out, c)
		case '{', '[':
			out = append(out, c)
			depth++
			if depth <= 2 && i+1 < len(src) && src[i+1] != '}' && src[i+1] != ']' {
				nl(depth)
			}
		case '}', ']':
			if depth <= 2 && i > 0 && src[i-1] != '{' && src[i-1] != '[' {
				nl(depth - 1)
			}
			depth--
			out = append(out, c)
		case ',':
			out = append(out, c)
			if depth <= 2 {
				nl(depth)
			}
		case ':':
			out = append(out, c)
			if depth <= 1 {
				out = append(out, ' ')
			}
		default:
			out = append(out, c)
		}
	}
	return out, nil
}

// sameFile: liegt genau dieser Inhalt schon in der Datei?
func sameFile(path string, b []byte) bool {
	st, err := os.Stat(path)
	if err != nil || st.Size() != int64(len(b)) {
		return false
	}
	old, err := os.ReadFile(path)
	return err == nil && bytes.Equal(old, b)
}

// reconcile sorgt dafür, dass der Saves-Ordner exakt dem Baum aus dem Programm entspricht.
func reconcile(req *SyncReq) error {
	if req.Titles == nil {
		req.Titles = map[string]string{}
	}
	keepG := map[string]bool{}
	keepP := map[string]bool{}

	var walk func(list []*TreeGroup, parentRel string)
	walk = func(list []*TreeGroup, parentRel string) {
		used := map[string]bool{}
		var done []*TreeGroup
		for _, g := range list {
			if g == nil || g.ID == "" || keepG[g.ID] {
				continue
			}
			keepG[g.ID] = true
			desired := filepath.Join(parentRel, uniqueName(sanitizeName(g.Name), "", used))
			ensureGroupDir(g.ID, desired)
			usedP := map[string]bool{}
			var pids []string
			for _, pid := range g.Pages {
				if pid == "" || keepP[pid] {
					continue
				}
				keepP[pid] = true
				pids = append(pids, pid)
				title := req.Titles[pid]
				fn := uniqueName(sanitizeName(title), pageSuffix, usedP)
				if _, known := pagePath[pid]; req.Partial && !known && len(req.Pages[pid]) == 0 {
					continue // neue Seite, deren Inhalt mit einem späteren Teil kommt
				}
				ensurePage(pid, title, filepath.Join(groupPath[g.ID], fn), req.Pages[pid])
				// Bilder dieser Seite in den Abschnitt (seit 1.33): beim Speichern aus dem Inhalt, beim Verschieben
				// in einen anderen Abschnitt aus der Datei
				if c := req.Pages[pid]; len(c) > 0 && string(c) != "null" {
					placePageAssets(c, groupPath[g.ID])
				} else if prev, ok := pageGroupOf[pid]; ok && prev != g.ID {
					if b, err := os.ReadFile(absSaves(pagePath[pid])); err == nil {
						placePageAssets(b, groupPath[g.ID])
					}
				}
				pageGroupOf[pid] = g.ID
			}
			if pids == nil {
				pids = []string{}
			}
			var sub []string
			for _, s := range g.Groups {
				if s != nil {
					sub = append(sub, s.ID)
				}
			}
			if sub == nil {
				sub = []string{}
			}
			writeJSONIfChanged(filepath.Join(absSaves(groupPath[g.ID]), groupMetaFn), groupMeta{
				Typ: "KnowledgeTree-Gruppe", ID: g.ID, Name: g.Name, Farbe: g.Color, Art: g.Kind, Zu: g.Closed, Gruppen: sub, Seiten: pids,
			})
			done = append(done, g)
		}
		for _, g := range done {
			walk(g.Groups, groupPath[g.ID])
		}
	}
	walk(req.Groups, "")

	writeJSONIfChanged(filepath.Join(savesDir, rootMetaFn), rootMeta{Typ: "KnowledgeTree-Saves", Version: 1, Gruppen: groupIDs(nonNil(req.Groups))})
	if req.Partial {
		return nil // aufgeräumt wird erst mit dem letzten Teil
	}

	// Gelöschte Seiten und Gruppen -> Cache/Papierkorb
	stamp := time.Now().Format("2006-01-02_15-04-05")
	for id, p := range pagePath {
		if !keepP[id] {
			if exists(absSaves(p)) {
				moveToTrash(absSaves(p), stamp)
			}
			delete(pagePath, id)
			delete(pageGroupOf, id)
		}
	}
	type gp struct{ id, p string }
	var gone []gp
	for id, p := range groupPath {
		if !keepG[id] {
			gone = append(gone, gp{id, p})
		}
	}
	sort.Slice(gone, func(a, b int) bool { return len(gone[a].p) > len(gone[b].p) })
	for _, g := range gone {
		trashGroupAssets(g.p) // Bilder getrennt in den Papierkorb (Rückgängig findet sie dort)
		if exists(absSaves(g.p)) {
			moveToTrash(absSaves(g.p), stamp)
		}
		delete(groupPath, g.id)
	}
	return nil
}

func nonNil(list []*TreeGroup) []*TreeGroup {
	var out []*TreeGroup
	for _, g := range list {
		if g != nil {
			out = append(out, g)
		}
	}
	return out
}

func moveToTrash(abs, stamp string) {
	_ = os.MkdirAll(trashDir, 0o755)
	base := stamp + "_" + filepath.Base(abs)
	dst := filepath.Join(trashDir, base)
	for i := 2; exists(dst); i++ {
		dst = filepath.Join(trashDir, fmt.Sprintf("%s (%d)", base, i))
	}
	if err := renameRetry(abs, dst); err != nil {
		logf("Papierkorb: %s konnte nicht verschoben werden: %v", abs, err)
		return
	}
	delete(metaWritten, filepath.Join(abs, groupMetaFn))
	logf("In den Papierkorb verschoben: %s", abs)
}

// ---------------------------------------------------------------- Backups (seit 1.25: wie bei OneNote)
//
// Ein Backup ist ein Ordner Cache/Backups/KnowledgeTree-Backup_<Datum>/ – dasselbe Format wie im Browser
// (web/js/ktfile.js → writeFolder), aufgebaut wie die Backups von OneNote (Notizbuch = Ordner, Abschnitt = Datei):
//   KnowledgeTree.json                          Beschreibung: typ "KnowledgeTree-Sicherung", version 4, Reihenfolge
//   <Notizbuch>/_gruppe.json                    Name, Farbe, Reihenfolge (wie „Open Notebook.onetoc2“)
//   <Notizbuch>/<Abschnitt>.knowledgetree.zip   eine KnowledgeTree-Datei je Abschnitt (wie eine .one-Datei):
//        KnowledgeTree.json (art "abschnitt"), Saves/_struktur.json, Saves/<Abschnitt>/_gruppe.json + Seiten
//        (kompakt, gepackt), Saves/_Bilder/… (nur die Bilder dieses Abschnitts, unverändert; abschaltbar)
//   <Notizbuch>/<Abschnittsgruppe>/…            Unterordner
//   (bis 1.32: _Bilder/ oben mit Bildern, die mehrere Abschnitte brauchen – seit 1.33 hat jede Abschnitt-Datei
//    alle ihre Bilder, die Backups von 1.25–1.32 lassen sich weiter laden)
// Bis 1.24 war ein Backup Saves_<Datum>.zip (der ganze Saves-Ordner) – diese werden weiter gelistet, geladen und
// beim Aufbewahren mitgezählt. Wann gesichert wird und wie viele Backups bleiben, steht in den Einstellungen
// (Store.ui.sicherung → Cache/zustand.json).

const sectionSuffix = ".knowledgetree.zip"

type settings struct {
	intervall      string // aus | start | tag | woche | monat
	nurAenderung   bool
	anzahl         int
	bilder         bool
	papierkorbTage int
	optimieren     bool // beim Beenden Speicher optimieren (1.39, optimize.go)
}

func loadSettings() settings {
	s := settings{intervall: "woche", nurAenderung: true, anzahl: 2, bilder: true, papierkorbTage: 30, optimieren: true} // Standard seit 1.42
	var z struct {
		Sicherung *struct {
			Intervall      string `json:"intervall"`
			NurAenderung   *bool  `json:"nurAenderung"`
			Anzahl         int    `json:"anzahl"`
			Bilder         *bool  `json:"bilder"`
			PapierkorbTage *int   `json:"papierkorbTage"`
			Optimieren     *bool  `json:"optimieren"`
		} `json:"sicherung"`
	}
	if readJSON(filepath.Join(cacheDir, "zustand.json"), &z) && z.Sicherung != nil {
		c := z.Sicherung
		switch c.Intervall {
		case "aus", "start", "tag", "woche", "monat":
			s.intervall = c.Intervall
		}
		if c.NurAenderung != nil {
			s.nurAenderung = *c.NurAenderung
		}
		if c.Anzahl > 0 {
			s.anzahl = min(c.Anzahl, 100)
		}
		if c.Bilder != nil {
			s.bilder = *c.Bilder
		}
		if c.PapierkorbTage != nil && *c.PapierkorbTage >= 0 {
			s.papierkorbTage = *c.PapierkorbTage
		}
		if c.Optimieren != nil {
			s.optimieren = *c.Optimieren
		}
	}
	return s
}

type backupStand struct {
	Stand string `json:"stand"`
	Zeit  string `json:"zeit"`
	Datei string `json:"datei"`
}

func standPath() string { return filepath.Join(backupDir, "_stand.json") }

// savesStand: Kennung des Saves-Ordners aus Namen, Grössen und Zeiten (ohne Bilder – die ändern sich nur mit den
// Seiten). Zweiter Wert: gibt es überhaupt Seiten?
func savesStand() (string, bool) {
	h := sha1.New()
	has := false
	_ = filepath.WalkDir(savesDir, func(p string, d fs.DirEntry, err error) error {
		if err != nil {
			return nil
		}
		rel, _ := filepath.Rel(savesDir, p)
		if d.IsDir() {
			if rel == bilderFolder {
				return filepath.SkipDir
			}
			return nil
		}
		if strings.HasSuffix(p, ".tmp") {
			return nil
		}
		info, err := d.Info()
		if err != nil {
			return nil
		}
		if strings.HasSuffix(strings.ToLower(p), pageSuffix) {
			has = true
		}
		fmt.Fprintf(h, "%s|%d|%d\n", rel, info.Size(), info.ModTime().UnixNano())
		return nil
	})
	return hex.EncodeToString(h.Sum(nil)), has
}

var (
	backupZipRe = regexp.MustCompile(`^Saves_(\d{4}-\d\d-\d\d_\d\d-\d\d-\d\d)(?:_\d+)?\.zip$`)           // bis 1.24
	backupDirRe = regexp.MustCompile(`^KnowledgeTree-Backup_(\d{4}-\d\d-\d\d_\d\d-\d\d-\d\d)(?:_\d+)?$`) // seit 1.25
)

type backupInfo struct {
	Name    string `json:"name"`
	Groesse int64  `json:"groesse"`
	Zeit    int64  `json:"zeit"` // ms seit 1970
	Ordner  bool   `json:"ordner,omitempty"`
}

// listBackups: Backups in Cache/Backups (Ordner und ältere ZIPs), neueste zuerst
func listBackups() []backupInfo {
	entries, _ := os.ReadDir(backupDir)
	out := []backupInfo{}
	for _, e := range entries {
		var m []string
		if e.IsDir() {
			m = backupDirRe.FindStringSubmatch(e.Name())
		} else {
			m = backupZipRe.FindStringSubmatch(e.Name())
		}
		if m == nil {
			continue
		}
		info, err := e.Info()
		if err != nil {
			continue
		}
		t, err := time.ParseInLocation("2006-01-02_15-04-05", m[1], time.Local)
		if err != nil {
			t = info.ModTime()
		}
		b := backupInfo{Name: e.Name(), Groesse: info.Size(), Zeit: t.UnixMilli(), Ordner: e.IsDir()}
		if e.IsDir() {
			b.Groesse = dirSize(filepath.Join(backupDir, e.Name()))
		}
		out = append(out, b)
	}
	sort.Slice(out, func(a, b int) bool {
		return out[a].Zeit > out[b].Zeit || (out[a].Zeit == out[b].Zeit && out[a].Name > out[b].Name)
	})
	return out
}

func lastBackupTime() time.Time {
	var st backupStand
	if readJSON(standPath(), &st) {
		if t, err := time.Parse(time.RFC3339, st.Zeit); err == nil {
			return t
		}
	}
	if l := listBackups(); len(l) > 0 {
		return time.UnixMilli(l[0].Zeit)
	}
	return time.Time{}
}

// makeBackup legt ein Backup an. force: auch wenn sich nichts geändert hat (Knopf „Backup erstellen“, vor dem
// Ersetzen). Ergebnis: Ordnername ("" = nichts gesichert) und Grösse. Aufrufer hält mu.
func makeBackup(force bool) (string, int64, error) {
	cfg := loadSettings()
	stand, has := savesStand()
	if !has {
		return "", 0, nil
	}
	var last backupStand
	readJSON(standPath(), &last)
	if !force && cfg.nurAenderung && last.Stand == stand && last.Datei != "" && exists(filepath.Join(backupDir, last.Datei)) {
		return "", 0, nil // seit dem letzten Backup unverändert
	}
	if err := os.MkdirAll(backupDir, 0o755); err != nil {
		return "", 0, err
	}
	now := time.Now()
	name := "KnowledgeTree-Backup_" + now.Format("2006-01-02_15-04-05")
	for i := 2; exists(filepath.Join(backupDir, name)); i++ {
		name = fmt.Sprintf("KnowledgeTree-Backup_%s_%d", now.Format("2006-01-02_15-04-05"), i)
	}
	dst := filepath.Join(backupDir, name)
	tmp := dst + ".tmp" // erst fertig schreiben, dann umbenennen – ein halbes Backup sieht nie wie ein ganzes aus
	_ = os.RemoveAll(tmp)
	if err := writeBackupFolderLinked(tmp, name, cfg.bilder); err != nil {
		_ = os.RemoveAll(tmp)
		return "", 0, err
	}
	if err := renameRetry(tmp, dst); err != nil {
		_ = os.RemoveAll(tmp)
		return "", 0, err
	}
	b, _ := json.MarshalIndent(backupStand{Stand: stand, Zeit: now.Format(time.RFC3339), Datei: name}, "", "  ")
	_ = atomicWrite(standPath(), b)
	rotateBackups(cfg.anzahl)
	return name, dirSize(dst), nil
}

// diese Formate sind ungepackt – alles andere (PNG, JPEG, PDF, Office …) wird unverändert abgelegt
var packExt = regexp.MustCompile(`^(svg|bmp|txt|csv|tsv|json|xml|html?|rtf|md|tex|log|ini|wmf|emf|tiff?|ico|ps|eps|ttf|otf|wav)$`)

// ktZip schreibt eine KnowledgeTree-Datei (ZIP)
type ktZip struct {
	f  *os.File
	bw *bufio.Writer
	zw *zip.Writer
}

func newKtZip(path string) (*ktZip, error) {
	f, err := os.Create(path)
	if err != nil {
		return nil, err
	}
	k := &ktZip{f: f, bw: bufio.NewWriterSize(f, 1<<20)}
	k.zw = zip.NewWriter(k.bw)
	// Stufe 4 statt 6: bei Seiten mit viel Freihand rund fünfmal schneller, nur ~8 % grösser (gemessen: 186 MB
	// Seiten → 44 MB in 3,6 s statt 40,5 MB in 17,6 s) – das Backup beim Start soll nicht bremsen
	k.zw.RegisterCompressor(zip.Deflate, func(out io.Writer) (io.WriteCloser, error) { return flate.NewWriter(out, 4) })
	return k, nil
}

func (k *ktZip) add(name string, mod time.Time, method uint16, data []byte, src string) error {
	w, err := k.zw.CreateHeader(&zip.FileHeader{Name: name, Method: method, Modified: mod})
	if err != nil {
		return err
	}
	if data != nil || src == "" {
		_, err = w.Write(data)
		return err
	}
	in, err := os.Open(src)
	if err != nil {
		return err
	}
	defer in.Close()
	_, err = io.Copy(w, in)
	return err
}

func (k *ktZip) close() error {
	err := k.zw.Close()
	if e := k.bw.Flush(); err == nil {
		err = e
	}
	if e := k.f.Close(); err == nil {
		err = e
	}
	return err
}

// isSectionDir: ein Abschnitt (wird eine Datei) – sonst Notizbuch/Abschnittsgruppe (wird ein Ordner)
func isSectionDir(rel string, gm groupMeta) bool {
	if gm.Art == "section" || gm.Art == "quick" {
		return true
	}
	if gm.Art != "" {
		return false
	}
	entries, _ := os.ReadDir(absSaves(rel))
	pages, subs := false, false
	for _, e := range entries {
		if e.IsDir() && !strings.HasPrefix(e.Name(), "_") && !strings.HasPrefix(e.Name(), ".") {
			subs = true
		} else if strings.HasSuffix(strings.ToLower(e.Name()), pageSuffix) {
			pages = true
		}
	}
	return pages && !subs
}

// writeSectionFile: ein Abschnitt (Ordner rel im Saves-Ordner) als KnowledgeTree-Datei
func writeSectionFile(path, rel string, gm groupMeta, name string, withImages bool, skip map[string]bool, find func(rel, n string) string) (int, int, error) {
	k, err := newKtZip(path)
	if err != nil {
		return 0, 0, err
	}
	now := time.Now()
	used := map[string]bool{}
	pages, images := 0, 0
	inner := "Saves/" + filepath.Base(rel) + "/"
	st, _ := json.MarshalIndent(rootMeta{Typ: "KnowledgeTree-Saves", Version: 1, Gruppen: []string{gm.ID}}, "", "  ")
	err = k.add("Saves/"+rootMetaFn, now, zip.Deflate, st, "")
	entries, _ := os.ReadDir(absSaves(rel))
	for _, e := range entries {
		if err != nil {
			break
		}
		n := e.Name()
		if e.IsDir() || strings.HasSuffix(n, ".tmp") {
			continue
		}
		p := filepath.Join(absSaves(rel), n)
		info, ierr := e.Info()
		if ierr != nil {
			continue
		}
		if strings.HasSuffix(strings.ToLower(n), pageSuffix) {
			raw, rerr := os.ReadFile(p)
			if rerr != nil {
				continue
			}
			assetNames(raw, func(x string) { used[x] = true })
			var c bytes.Buffer
			if json.Compact(&c, raw) == nil {
				raw = c.Bytes()
			}
			pages++
			err = k.add(inner+n, info.ModTime(), zip.Deflate, raw, "")
		} else if n == groupMetaFn {
			err = k.add(inner+n, info.ModTime(), zip.Deflate, nil, p)
		}
	}
	if err == nil && withImages {
		names := make([]string, 0, len(used))
		for n := range used {
			names = append(names, n)
		}
		sort.Strings(names)
		for _, n := range names {
			if skip[n] {
				continue // liegt im gemeinsamen _Bilder-Ordner des Backups
			}
			src := find(rel, n) // zuerst im _Bilder-Ordner des Abschnitts (seit 1.33)
			info, serr := os.Stat(src)
			if serr != nil || info.Size() == 0 { // fehlend oder leer: nie einen leeren Eintrag schreiben
				continue
			}
			method := zip.Store
			if packExt.MatchString(strings.TrimPrefix(filepath.Ext(n), ".")) {
				method = zip.Deflate
			}
			if err = k.add("Saves/"+bilderFolder+"/"+n, info.ModTime(), method, nil, src); err != nil {
				break
			}
			images++
		}
	}
	if err == nil {
		meta := map[string]any{"typ": "KnowledgeTree-Datei", "version": 3, "art": "abschnitt", "name": name,
			"erstellt": now.UTC().Format(time.RFC3339), "programm": appName + " " + appVersion, "quelle": "programm",
			"seiten": pages, "bilder": images}
		if !withImages {
			meta["ohneBilder"] = true
		}
		b, _ := json.MarshalIndent(meta, "", "  ")
		err = k.add("KnowledgeTree.json", now, zip.Deflate, b, "")
	}
	if cerr := k.close(); err == nil {
		err = cerr
	}
	return pages, images, err
}

// copyFile kopiert stückweise (Anhänge können gross sein)
func copyFile(src, dst string) error {
	in, err := os.Open(src)
	if err != nil {
		return err
	}
	defer in.Close()
	out, err := os.Create(dst)
	if err != nil {
		return err
	}
	if _, err = io.Copy(out, in); err != nil {
		out.Close()
		return err
	}
	return out.Close()
}

// writeBackupFolder schreibt den ganzen Saves-Ordner als Backup-Ordner (siehe oben), jeder Abschnitt mit seinen
// Bildern.
func writeBackupFolder(dst string, withImages bool) error {
	return writeBackupFolderLinked(dst, "", withImages)
}

// writeBackupFolderLinked: final = Name des Backup-Ordners in Cache/Backups (dst ist seine Zwischenablage .tmp) –
// dann werden unveränderte Abschnitte als harte Verknüpfung des letzten Backups angelegt (1.39, optimize.go)
func writeBackupFolderLinked(dst, final string, withImages bool) error {
	if err := os.MkdirAll(dst, 0o755); err != nil {
		return err
	}
	var rm rootMeta
	readJSON(filepath.Join(savesDir, rootMetaFn), &rm)
	type step struct {
		section bool
		rel     string // Ordner im Saves-Ordner
		out     string // Ziel (Datei bzw. Ordner)
		gm      groupMeta
		name    string
	}
	var plan []step
	var walk func(rel, out string)
	walk = func(rel, out string) {
		entries, _ := os.ReadDir(absSaves(rel))
		used := map[string]bool{}
		for _, e := range entries {
			n := e.Name()
			if !e.IsDir() || strings.HasPrefix(n, "_") || strings.HasPrefix(n, ".") {
				continue
			}
			sub := filepath.Join(rel, n)
			var gm groupMeta
			readJSON(filepath.Join(absSaves(sub), groupMetaFn), &gm)
			name := gm.Name
			if strings.TrimSpace(name) == "" {
				name = n
			}
			if isSectionDir(sub, gm) {
				plan = append(plan, step{true, sub, filepath.Join(out, uniqueName(sanitizeName(name), sectionSuffix, used)), gm, name})
				continue
			}
			dir := filepath.Join(out, uniqueName(sanitizeName(name), "", used))
			plan = append(plan, step{false, sub, dir, gm, name})
			walk(sub, dir)
		}
	}
	walk("", dst)
	find := assetFinder()
	// seit 1.33 enthält jede Abschnitt-Datei alle ihre Bilder (auch solche, die andere Abschnitte ebenfalls
	// brauchen) – wie im Saves-Ordner ist jeder Abschnitt für sich vollständig und einzeln weiterzugeben
	shared := map[string]bool{}
	pages, images, sections, linked := 0, 0, 0, 0
	type secRef struct {
		Datei  string `json:"datei"`
		Seiten int    `json:"seiten"`
		Bilder int    `json:"bilder"`
	}
	idx := map[string]secRef{}
	newIdx := map[string]secRef{}
	if final != "" {
		readJSON(sectionIndexPath(), &idx)
	}
	for _, st := range plan {
		if st.section {
			fp := ""
			if final != "" {
				fp = sectionPrint(st.rel, st.name, withImages, find)
			}
			if old, ok := idx[fp]; ok && fp != "" {
				src := filepath.Join(backupDir, filepath.FromSlash(old.Datei))
				if err := os.MkdirAll(filepath.Dir(st.out), 0o755); err == nil && os.Link(src, st.out) == nil {
					pages += old.Seiten
					images += old.Bilder
					sections++
					linked++
					rel, _ := filepath.Rel(dst, st.out)
					newIdx[fp] = secRef{filepath.ToSlash(filepath.Join(final, rel)), old.Seiten, old.Bilder}
					continue
				}
			}
			p, i, err := writeSectionFile(st.out, st.rel, st.gm, st.name, withImages, shared, find)
			if err != nil {
				return err
			}
			if fp != "" {
				rel, _ := filepath.Rel(dst, st.out)
				newIdx[fp] = secRef{filepath.ToSlash(filepath.Join(final, rel)), p, i}
			}
			pages += p
			images += i
			sections++
			continue
		}
		if err := os.MkdirAll(st.out, 0o755); err != nil {
			return err
		}
		if b, err := os.ReadFile(filepath.Join(absSaves(st.rel), groupMetaFn)); err == nil {
			if err := os.WriteFile(filepath.Join(st.out, groupMetaFn), b, 0o644); err != nil {
				return err
			}
		}
	}
	order := rm.Gruppen
	if order == nil {
		order = []string{}
	}
	meta := map[string]any{"typ": "KnowledgeTree-Sicherung", "version": 4, "art": "backup", "name": "KnowledgeTree",
		"erstellt": time.Now().UTC().Format(time.RFC3339), "programm": appName + " " + appVersion, "quelle": "programm",
		"seiten": pages, "bilder": images, "abschnitte": sections, "geteilteBilder": len(shared), "reihenfolgeGruppen": order}
	if !withImages {
		meta["ohneBilder"] = true
	}
	b, _ := json.MarshalIndent(meta, "", "  ")
	if err := os.WriteFile(filepath.Join(dst, "KnowledgeTree.json"), b, 0o644); err != nil {
		return err
	}
	if final != "" {
		// Verzeichnis: nur das neueste Backup je Abschnitt (ältere werden weggeräumt, ihre Verknüpfungen bleiben gültig)
		ib, _ := json.MarshalIndent(newIdx, "", "  ")
		_ = atomicWrite(sectionIndexPath(), ib)
		if linked > 0 {
			logf("Backup: %d von %d Abschnitten unverändert – als harte Verknüpfung abgelegt", linked, sections)
		}
	}
	return nil
}

// backupPath: Datei in einem Backup (ZIP oder Datei in einem Backup-Ordner) – nur innerhalb von Cache/Backups
func backupPath(name, rel string) (string, bool) {
	if backupZipRe.MatchString(name) && rel == "" {
		return filepath.Join(backupDir, name), true
	}
	if !backupDirRe.MatchString(name) {
		return "", false
	}
	base := filepath.Join(backupDir, name)
	if rel == "" {
		return base, true
	}
	clean := filepath.Clean(filepath.FromSlash(rel))
	if filepath.IsAbs(clean) || clean == ".." || strings.HasPrefix(clean, ".."+string(os.PathSeparator)) {
		return "", false
	}
	return filepath.Join(base, clean), true
}

// backupFiles: alle Dateien eines Backup-Ordners (Pfade mit /)
func backupFiles(dir string) []map[string]any {
	out := []map[string]any{}
	_ = filepath.WalkDir(dir, func(p string, d fs.DirEntry, err error) error {
		if err != nil || d.IsDir() {
			return nil
		}
		info, err := d.Info()
		if err != nil {
			return nil
		}
		rel, _ := filepath.Rel(dir, p)
		out = append(out, map[string]any{"pfad": filepath.ToSlash(rel), "groesse": info.Size()})
		return nil
	})
	return out
}

// nur die neuesten keep Backups behalten (Ordner und ältere ZIPs zusammen) und halbe Reste entfernen
func rotateBackups(keep int) {
	list := listBackups()
	for i := max(keep, 1); i < len(list); i++ {
		if err := os.RemoveAll(filepath.Join(backupDir, list[i].Name)); err == nil {
			logf("Altes Backup entfernt: %s", list[i].Name)
		}
	}
	entries, _ := os.ReadDir(backupDir)
	for _, e := range entries {
		if info, err := e.Info(); err == nil && strings.HasSuffix(e.Name(), ".tmp") && time.Since(info.ModTime()) > time.Hour {
			_ = os.RemoveAll(filepath.Join(backupDir, e.Name()))
		}
	}
}

// autoBackup: nach den Einstellungen sichern, wenn fällig (beim Start und danach stündlich). Aufrufer hält mu.
func autoBackup(atStart bool) {
	cfg := loadSettings()
	due := false
	switch cfg.intervall {
	case "start":
		due = atStart
	case "tag", "woche", "monat":
		d := map[string]time.Duration{"tag": 24 * time.Hour, "woche": 7 * 24 * time.Hour, "monat": 30 * 24 * time.Hour}[cfg.intervall]
		due = time.Since(lastBackupTime()) >= d
	}
	if !due {
		return
	}
	start := time.Now()
	name, size, err := makeBackup(false)
	switch {
	case err != nil:
		logf("Backup fehlgeschlagen: %v", err)
	case name != "":
		logf("Backup erstellt: %s (%.1f MB, %d ms)", name, float64(size)/1e6, time.Since(start).Milliseconds())
	}
}

// ---------------------------------------------------------------- Aufräumen

var imgNameExact = regexp.MustCompile(`^[0-9a-f]{40}\.[a-z0-9]{1,8}$`)

// assetNames findet Bild-/Datei-Namen (40 Hex-Zeichen + Endung, wie [0-9a-f]{40}\.[a-z0-9]{1,8}) – ohne regexp:
// bei hunderten MB Seiten (Freihand) war der reguläre Ausdruck der grösste Teil der Startzeit (9 s bei 190 MB).
func assetNames(b []byte, add func(string)) {
	isHex := func(c byte) bool { return c >= '0' && c <= '9' || c >= 'a' && c <= 'f' }
	next := 0 // wie der reguläre Ausdruck: Treffer überlappen nicht
	for i := 40; i < len(b)-1; i++ {
		if b[i] != '.' || i-40 < next {
			continue
		}
		k := i - 1
		for k >= i-40 && isHex(b[k]) {
			k--
		}
		if k >= i-40 {
			continue
		}
		e := i + 1
		for e < len(b) && e-i <= 8 && (b[e] >= 'a' && b[e] <= 'z' || b[e] >= '0' && b[e] <= '9') {
			e++
		}
		if e > i+1 {
			add(string(b[i-40 : e]))
			next = e
		}
	}
}

// collectUnusedImages räumt den Eingang Saves/_Bilder auf (seit 1.33, nach dem Zuordnen zu den Abschnitten):
// was schon in einem Abschnitt liegt, ist hier überflüssig; was keine Seite und auch der Verlauf (Rückgängig) nicht
// mehr braucht, kommt nach 10 Minuten in den Papierkorb. used: Namen, die Seiten brauchen.
func collectUnusedImages(used map[string]bool) {
	if b, err := os.ReadFile(filepath.Join(cacheDir, "verlauf.json")); err == nil {
		assetNames(b, func(n string) { used[n] = true })
	}
	trashImg := filepath.Join(trashDir, bilderFolder)
	entries, _ := os.ReadDir(bilderDir)
	now := time.Now()
	for _, e := range entries {
		n := e.Name()
		if e.IsDir() || !imgNameExact.MatchString(n) {
			continue
		}
		idxMu.RLock()
		inSection := len(assetLoc[n]) > 0
		idxMu.RUnlock()
		if inSection && findAsset(n) != filepath.Join(bilderDir, n) {
			_ = os.Remove(filepath.Join(bilderDir, n))
			continue
		}
		if used[n] {
			continue
		}
		info, err := e.Info()
		if err != nil || time.Since(info.ModTime()) < 10*time.Minute {
			continue
		}
		_ = os.MkdirAll(trashImg, 0o755)
		dst := filepath.Join(trashImg, n)
		if renameRetry(filepath.Join(bilderDir, n), dst) == nil {
			_ = os.Chtimes(dst, now, now) // Zeit = in den Papierkorb gelegt (für das Leeren nach x Tagen)
		}
	}
}

// restoreAsset: Bild/Anhang vorhanden (in einem Abschnitt oder im Eingang)? Liegt es im Papierkorb, kommt es zurück
// in den Eingang Saves/_Bilder (beim nächsten Speichern der Seite dann in ihren Abschnitt).
func restoreAsset(name string) bool {
	if !imgNameExact.MatchString(name) {
		return false
	}
	p := findAsset(name)
	if p == "" {
		return false
	}
	t := filepath.Join(trashDir, bilderFolder, name)
	if p == t {
		return renameRetry(t, filepath.Join(bilderDir, name)) == nil
	}
	return true
}

// cleanTrash: Papierkorb-Einträge älter als days Tage endgültig löschen (0 = nie). Bilder im Papierkorb gehen
// erst, wenn auch keine Seite im Papierkorb sie mehr nennt.
func cleanTrash(days int) {
	if days <= 0 {
		return
	}
	limit := time.Now().AddDate(0, 0, -days)
	entries, _ := os.ReadDir(trashDir)
	removed := 0
	for _, e := range entries {
		if e.Name() == bilderFolder {
			continue
		}
		t := time.Time{}
		if len(e.Name()) >= 19 {
			t, _ = time.ParseInLocation("2006-01-02_15-04-05", e.Name()[:19], time.Local)
		}
		if t.IsZero() {
			if info, err := e.Info(); err == nil {
				t = info.ModTime()
			}
		}
		if !t.IsZero() && t.Before(limit) && os.RemoveAll(filepath.Join(trashDir, e.Name())) == nil {
			removed++
		}
	}
	used := map[string]bool{}
	_ = filepath.WalkDir(trashDir, func(p string, d fs.DirEntry, err error) error {
		if err != nil {
			return nil
		}
		if d.IsDir() && d.Name() == bilderFolder {
			return filepath.SkipDir
		}
		if !d.IsDir() && strings.HasSuffix(strings.ToLower(p), pageSuffix) {
			if b, err := os.ReadFile(p); err == nil {
				assetNames(b, func(n string) { used[n] = true })
			}
		}
		return nil
	})
	imgs, _ := os.ReadDir(filepath.Join(trashDir, bilderFolder))
	for _, e := range imgs {
		info, err := e.Info()
		if err != nil || e.IsDir() || used[e.Name()] || !info.ModTime().Before(limit) {
			continue
		}
		if os.Remove(filepath.Join(trashDir, bilderFolder, e.Name())) == nil {
			removed++
		}
	}
	if removed > 0 {
		logf("Papierkorb: %d Einträge älter als %d Tage endgültig gelöscht", removed, days)
	}
}

// dirSize: Grösse eines Ordners samt Unterordnern
// dirSize: belegter Platz – seit 1.39 jede Datei nur einmal, auch wenn sie als harte Verknüpfung mehrfach vorkommt
func dirSize(dir string) int64 { return diskSize(dir, nil, nil) }
