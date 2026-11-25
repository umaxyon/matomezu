package server

import (
	"encoding/json"
	"path/filepath"
	"testing"

	"github.com/umaxyon/matomezu/internal/engine"
	"github.com/umaxyon/matomezu/internal/storage"
)

// ブックの並びの参照エントリ（ほかのブックのページを id で指す）は、置き場所に書いて読み直しても、中身ごとそのまま並びに残り、ブックは読める
func TestReferencesSurviveStorage(t *testing.T) {
	store, err := storage.OpenSQLite(filepath.Join(t.TempDir(), "data.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { store.Close() })
	page := func(id string) string {
		return `{"kind":"page","id":"` + id + `","type":"@matomezu/drawing:drawing","title":"` + id + `","paper":"@matomezu/base:a4","orientation":"landscape"}`
	}
	putBook(t, store, `{"id":"A","title":"A","lineup":[`+page("a1")+`]}`)
	ref := `{"kind":"reference","id":"r1","of":{"kind":"page","id":"a1"}}`
	putBook(t, store, `{"id":"B","title":"B","lineup":[`+page("b1")+`,`+ref+`]}`)
	eng, err := engine.New()
	if err != nil {
		t.Fatal(err)
	}
	h, err := NewHub(store, eng)
	if err != nil {
		t.Fatal(err)
	}
	b := h.Book("B")
	if b == nil {
		t.Fatalf("book B is not readable: %v", h.Warnings())
	}
	lineup := lineupOf(b.Body)
	if len(lineup) != 2 {
		t.Fatalf("lineup = %s", b.Body)
	}
	var got, want any
	_ = json.Unmarshal(lineup[1], &got)
	_ = json.Unmarshal([]byte(ref), &want)
	g, _ := json.Marshal(got)
	w, _ := json.Marshal(want)
	if string(g) != string(w) {
		t.Fatalf("reference = %s", lineup[1])
	}
	if ids := pageIDs(b.Body); len(ids) != 1 || ids[0] != "b1" {
		t.Fatalf("pages = %v", ids)
	}
	// AI の目次は、参照エントリに指す先の名前・タイプと見えるかを添える
	outlined := lineupOf(outlineBook(b.Body, h.PageVersion, h.Referred))
	var row map[string]any
	_ = json.Unmarshal(outlined[1], &row)
	if row["title"] != "a1" || row["type"] != "@matomezu/drawing:drawing" || row["visible"] != true {
		t.Fatalf("outlined reference = %s", outlined[1])
	}
	if _, ok := h.Referred("page", "none"); ok {
		t.Fatal("a missing target is referred")
	}
}
