package server

import (
	"encoding/json"
	"slices"
	"testing"

	"github.com/umaxyon/matomezu/internal/engine"
	"github.com/umaxyon/matomezu/internal/storage"
)

// versionsOf は、置き場所のフォルダの版（id → 版）
func versionsOf(t *testing.T, store storage.Storage) map[string]int64 {
	t.Helper()
	folders, err := store.Folders()
	if err != nil {
		t.Fatal(err)
	}
	out := map[string]int64{}
	for _, f := range folders {
		out[f.ID] = f.Version
	}
	return out
}

// trashedFolderStore は、libraryStore の nested の置き場所から、フォルダ d2（中にブック b2）をゴミ箱に入れた置き場所
func trashedFolderStore(t *testing.T) storage.Storage {
	t.Helper()
	store := libraryStore(t, true)
	v := versionsOf(t, store)
	if err := store.Apply(storage.Batch{
		Folders: []storage.RowWrite{
			{ID: "d1", Base: v["d1"], Body: json.RawMessage(`{"folderRole":"folder","id":"d1","title":"D1","lineup":[{"kind":"book","id":"b1"}]}`)},
			{ID: storage.TrashID, Base: v[storage.TrashID], Body: json.RawMessage(`{"folderRole":"trash","id":"library-trash","lineup":[` +
				`{"kind":"folder","id":"d2","trashed":"2026-11-18T00:00:00.000Z","from":["d1","library-home"]}]}`)},
		},
		Entries: []storage.EntryPut{{ID: "d2", Folder: storage.TrashID}},
	}); err != nil {
		t.Fatal(err)
	}
	return store
}

// ゴミ箱の行はブックでない。ゴミ箱の中かは、上へたどってゴミ箱に着くかで決まり、フォルダごと入れたなら、その中のブックとページも中
func TestTheTrashHoldsWhatIsBelowIt(t *testing.T) {
	_, hub := newServerOn(t, Options{}, trashedFolderStore(t))
	hub.mu.Lock()
	defer hub.mu.Unlock()
	if !slices.Equal(hub.order, []string{"b1", "b2"}) || len(hub.books) != 2 || hub.libraryWarning != "" {
		t.Fatalf("order = %v, books %d, library warning %q", hub.order, len(hub.books), hub.libraryWarning)
	}
	for id, want := range map[string]bool{"d2": true, "b2": true, "f1": true, "s1": true, "d1": false, "b1": false, "p1": false, storage.TrashID: false, storage.HomeID: false} {
		if got := hub.inTrash(id); got != want {
			t.Fatalf("in the trash %s = %v; want %v", id, got, want)
		}
	}
	if hub.places["d2"] != storage.TrashID || hub.bookOfPage("s1") != "" || hub.bookOfPage("p1") != "b1" {
		t.Fatalf("places %v, book of s1 %q, book of p1 %q", hub.places, hub.bookOfPage("s1"), hub.bookOfPage("p1"))
	}
	// ゴミ箱の中のブックが対象なら、エンジンへ渡すフォルダはゴミ箱まで
	in := engine.Input{Actions: []engine.BulkAction{step("@matomezu/base:book-rename", `{"title":"x"}`, &engine.On{Book: "b2"})}}
	if err := hub.performInputs(&in); err != nil {
		t.Fatal(err)
	}
	ids := []string{}
	for _, f := range in.Folders {
		var head struct{ ID string }
		_ = json.Unmarshal(f, &head)
		ids = append(ids, head.ID)
	}
	if !slices.Equal(ids, []string{"b2", "f1", "d2", storage.TrashID}) {
		t.Fatalf("folders to the engine = %v", ids)
	}
}

// フォルダごとゴミ箱に入れたブックは、AI の MCP 公開ツールに出ない
func TestBooksInATrashedFolderAreHiddenFromTheAI(t *testing.T) {
	s, hub := newServerOn(t, Options{}, trashedFolderStore(t))
	if got := hub.AIBooks(); len(got) != 1 || got[0].ID != "b1" {
		t.Fatalf("AI books = %+v", got)
	}
	if hub.Book("b2") != nil || hub.Book(storage.TrashID) != nil || hub.Show(Show{Book: "b2"}) != ErrNoBook {
		t.Fatal("a book in the trash or the trash is shown")
	}
	for path, want := range map[string]int{"/api/ai/books/b1": 200, "/api/ai/books/b2": 404, "/api/ai/pages/p1": 200, "/api/ai/pages/s1": 404, "/api/ai/books/" + storage.TrashID: 404} {
		if code, body := send(t, "GET", s.URL+path, "", ai); code != want {
			t.Fatalf("%s = %d %s; want %d", path, code, body, want)
		}
	}
}

// ゴミ箱の並びのエントリ（trashed と from も持つ）は、エントリの入っているフォルダ（places と表 entries）に入る。
// ゴミ箱の行の変わりは、AI 編集チケットに入らない
func TestTrashLineupPlacesItsEntries(t *testing.T) {
	store := libraryStore(t, false)
	_, hub := newServerOn(t, Options{}, store)
	hub.mu.Lock()
	defer hub.mu.Unlock()
	write := func(home, trash string) {
		t.Helper()
		out := engine.Output{OK: true, Folders: []engine.RowChange{
			{ID: storage.HomeID, Row: json.RawMessage(`{"folderRole":"home","id":"library-home","lineup":[` + home + `]}`)},
			{ID: storage.TrashID, Row: json.RawMessage(`{"folderRole":"trash","id":"library-trash","lineup":[` + trash + `]}`)},
		}}
		plan, err := hub.planWrites(out, "ai", "a1", stamp())
		if err != nil || plan == nil {
			t.Fatalf("plan = %v, %v", plan, err)
		}
		if err := store.Apply(plan.batch); err != nil {
			t.Fatal(err)
		}
		hub.applyWrites(plan, out, Perform{}, "ai", "a1")
	}
	write(documentsRef(t, hub)+`{"kind":"book","id":"b2"}`, `{"kind":"book","id":"b1","trashed":"2026-11-18T00:00:00.000Z","from":["library-home"]}`)
	entries, err := store.Entries()
	if err != nil {
		t.Fatal(err)
	}
	if entries["b1"] != storage.TrashID || hub.places["b1"] != storage.TrashID || !hub.inTrash("b1") || hub.inTrash("b2") || hub.libraryWarning != "" {
		t.Fatalf("entries %v, places %v, library warning %q", entries, hub.places, hub.libraryWarning)
	}
	for _, ticket := range hub.aiEditTickets {
		if slices.Contains(ticket.Unseen, storage.TrashID) || slices.Contains(ticket.Unseen, storage.HomeID) {
			t.Fatalf("an AI edit ticket has the trash or the library home: %+v", ticket)
		}
	}
	write(`{"kind":"book","id":"b2"},{"kind":"book","id":"b1"}`, ``)
	if entries, _ := store.Entries(); entries["b1"] != storage.HomeID || hub.places["b1"] != storage.HomeID || hub.inTrash("b1") {
		t.Fatalf("after restoring: entries %v, places %v", entries, hub.places)
	}
}

// バックヤードの中のブックは、AI の一覧（list_books）に出ない。木の決まりは守り、ブックとしては読める
func TestBooksInABackyardAreNotListedForTheAI(t *testing.T) {
	store := libraryStore(t, false)
	v := versionsOf(t, store)
	yard := "library-backyard-@matomezu/base:tickets-history"
	if err := store.Apply(storage.Batch{
		Folders: []storage.RowWrite{
			{ID: storage.HomeID, Base: v[storage.HomeID], Body: storage.HomeBody([]json.RawMessage{storage.RefOf("book", "b1")})},
			{ID: yard, Body: json.RawMessage(`{"folderRole":"backyard","id":"` + yard + `","backyard":"@matomezu/base:tickets-history","lineup":[{"kind":"book","id":"b2","workKey":{"subject":"s","id":"k"}}]}`)},
		},
		Entries: []storage.EntryPut{{ID: "b2", Folder: yard}},
	}); err != nil {
		t.Fatal(err)
	}
	_, hub := newServerOn(t, Options{}, store)
	if got := hub.AIBooks(); len(got) != 1 || got[0].ID != "b1" {
		t.Fatalf("AI books = %+v", got)
	}
	hub.mu.Lock()
	warning := hub.libraryWarning
	hub.mu.Unlock()
	if warning != "" || hub.Book("b2") == nil {
		t.Fatalf("library warning %q, book b2 %v", warning, hub.Book("b2"))
	}
}
