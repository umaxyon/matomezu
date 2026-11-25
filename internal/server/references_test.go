package server

import (
	"encoding/json"
	"path/filepath"
	"strings"
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

// 常駐の道（Go が選んで渡す行だけで行う）でも、ほかのブックのページを参照でき、指す先のページを消すと、同じ書き込みで参照を置いたブックからも消える
func TestReferencesThroughTheHost(t *testing.T) {
	other := `{"id":"b2","title":"U","lineup":[{"kind":"page","id":"q1","type":"@matomezu/drawing:drawing","title":"Q","paper":"@matomezu/base:a4","orientation":"landscape"}]}`
	hub, store, c := bulkHub(t, other)
	added, err := hub.Perform(Perform{Actions: []engine.BulkAction{
		step("@matomezu/base:reference-add", `{"of":{"kind":"page","id":"p1"}}`, &engine.On{Book: "b2"}, "r1"),
	}, Client: c.id, Seq: 1})
	if err != nil || !added.OK {
		t.Fatalf("reference-add = %+v, %v", added, err)
	}
	if lineup := lineupOf(hub.Book("b2").Body); len(lineup) != 2 || kindOf(lineup[1]) != storage.KindReference {
		t.Fatalf("b2 = %s", hub.Book("b2").Body)
	}
	drained(c)
	store.applied = 0
	removed, err := hub.Perform(Perform{Actions: []engine.BulkAction{
		step("@matomezu/base:page-remove", `{"page":"p1"}`, &engine.On{Book: "b1"}),
	}, Client: c.id, Seq: 2})
	if err != nil || !removed.OK {
		t.Fatalf("page-remove = %+v, %v", removed, err)
	}
	if store.applied != 1 {
		t.Fatalf("writes = %d; want 1", store.applied)
	}
	if lineup := lineupOf(hub.Book("b2").Body); len(lineup) != 1 {
		t.Fatalf("b2 after the target went = %s", hub.Book("b2").Body)
	}
	got := drained(c)
	if len(got) == 0 || got[0].name != "changed" || !strings.Contains(string(got[0].data), `"b2"`) {
		t.Fatalf("events = %v", got)
	}
}

// 指す先のブックをゴミ箱に入れても参照は残り、ゴミ箱から完全に消すと、同じ書き込みで消える（常駐の道）
func TestReferencesGoWithAPurgedBook(t *testing.T) {
	other := `{"id":"b2","title":"U","lineup":[{"kind":"page","id":"q1","type":"@matomezu/drawing:drawing","title":"Q","paper":"@matomezu/base:a4","orientation":"landscape"}]}`
	hub, _, c := bulkHub(t, other)
	run := func(seq int64, action, args string, on *engine.On) {
		t.Helper()
		done, err := hub.Perform(Perform{Actions: []engine.BulkAction{step(action, args, on, "r1")}, Client: c.id, Seq: seq})
		if err != nil || !done.OK {
			t.Fatalf("%s = %+v, %v", action, done, err)
		}
	}
	run(1, "@matomezu/base:reference-add", `{"of":{"kind":"page","id":"p1"}}`, &engine.On{Book: "b2"})
	run(2, "@matomezu/base:entry-trash", `{"entry":"b1"}`, nil)
	if lineup := lineupOf(hub.Book("b2").Body); len(lineup) != 2 {
		t.Fatalf("b2 with the target in the trash = %s", hub.Book("b2").Body)
	}
	run(3, "@matomezu/base:entry-purge", `{"entries":["b1"]}`, nil)
	if lineup := lineupOf(hub.Book("b2").Body); len(lineup) != 1 {
		t.Fatalf("b2 after the purge = %s", hub.Book("b2").Body)
	}
}
