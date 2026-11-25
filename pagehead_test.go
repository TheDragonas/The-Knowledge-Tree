package main

import "testing"

// Kopfangaben einer Seite (Laden in Stufen, 1.32)
func TestReadPageHead(t *testing.T) {
	h, ok := readPageHead([]byte(`{"typ":"KnowledgeTree-Seite","version":1,"id":"p1","title":"Ä \"x\"","created":5,"modified":7,"level":2,"boxes":[{"html":"\"id\":\"falsch\""}]}`))
	if !ok || h.ID != "p1" || h.Title != "Ä \"x\"" || h.Level != 2 || h.Created != 5 || h.Modified != 7 {
		t.Fatalf("falsch gelesen: %+v %v", h, ok)
	}
	h, ok = readPageHead([]byte(`{"boxes":[{"a":[1,2,{"b":"}"}]}],"drawings":[],"title":"Hinten","id":"p2","level":null}`))
	if !ok || h.ID != "p2" || h.Title != "Hinten" || h.Level != 0 {
		t.Fatalf("hinten: %+v %v", h, ok)
	}
	if _, ok := readPageHead([]byte(`[1,2]`)); ok {
		t.Fatal("kein Objekt sollte scheitern")
	}
}
