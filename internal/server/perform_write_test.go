package server

import (
	"encoding/json"
	"errors"
	"path/filepath"
	"strings"
	"testing"

	"github.com/umaxyon/matomezu/internal/engine"
	"github.com/umaxyon/matomezu/internal/storage"
)

// refusing は、fail の間、まとまりの書き込み（Apply）を断る置き場所
type refusing struct {
	storage.Storage
	fail bool
}

func (r *refusing) Apply(b storage.Batch) error {
	if r.fail {
		return errors.New("refused")
	}
	return r.Storage.Apply(b)
}

// 置き場所が書けなかった Perform は、エラーを返して何も変えない（メモリも窓への知らせも）。同じ番号（Key）で行い直すと、行われる
func TestPerformChangesNothingWhenTheWriteFails(t *testing.T) {
	store, err := storage.OpenSQLite(filepath.Join(t.TempDir(), "data.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { store.Close() })
	putBook(t, store, drawing)
	eng, err := engine.New()
	if err != nil {
		t.Fatal(err)
	}
	r := &refusing{Storage: store, fail: true}
	hub, err := NewHub(r, eng)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(hub.CloseAll)
	c := hub.Join()
	defer hub.Leave(c)
	<-c.ch // hello

	do := func() (Performed, error) {
		return hub.Perform(Perform{Action: "@matomezu/base:page-add", Args: json.RawMessage(`{"type":"@matomezu/drawing:drawing","title":"追加"}`), On: &engine.On{Book: "b1"}, Client: c.id, Seq: 1, Key: "k1"})
	}
	if _, err := do(); err == nil || !strings.Contains(err.Error(), "refused") {
		t.Fatalf("perform = %v; want the refused error", err)
	}
	entries := func() int {
		got, err := store.Entries()
		if err != nil {
			t.Fatal(err)
		}
		return len(got)
	}
	pages, folders := hub.Tables()
	if len(pages) != 1 || pages[0].Version != 1 || len(folders) != 1 || folders[0].Version != 1 || strings.Contains(string(folders[0].Body), "追加") || entries() != 1 {
		t.Fatalf("the book changed: %+v %+v", pages, folders)
	}
	if book := hub.Book("b1"); book == nil || book.Version != 1 || strings.Contains(string(book.Body), "追加") {
		t.Fatalf("the assembled book changed: %+v", book)
	}
	select {
	case ev := <-c.ch:
		t.Fatalf("a window was told something: %s", ev.name)
	default:
	}
	r.fail = false
	done, err := do()
	if err != nil || !done.OK {
		t.Fatalf("perform again = %+v, %v", done, err)
	}
	pages, folders = hub.Tables()
	if len(pages) != 2 || len(folders) != 1 || folders[0].Version != 2 || entries() != 2 {
		t.Fatalf("the book did not change: %+v %+v", pages, folders)
	}
	if book := hub.Book("b1"); book == nil || book.Version != 2 || !strings.Contains(string(book.Body), "追加") {
		t.Fatalf("the assembled book did not change: %+v", book)
	}
	if ev := <-c.ch; ev.name != "changed" {
		t.Fatalf("the window was told %s; want changed", ev.name)
	}
}
