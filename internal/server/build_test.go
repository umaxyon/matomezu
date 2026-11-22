package server

import (
	"path/filepath"
	"testing"

	"github.com/umaxyon/matomezu/internal/engine"
	"github.com/umaxyon/matomezu/internal/storage"
)

func TestHelloTellsTheBuild(t *testing.T) {
	store, err := storage.OpenSQLite(filepath.Join(t.TempDir(), "data.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { store.Close() })
	eng, err := engine.New()
	if err != nil {
		t.Fatal(err)
	}
	h, err := NewHub(store, eng)
	if err != nil {
		t.Fatal(err)
	}
	if e := <-h.Join().ch; e.name != "hello" || string(e.data) != `{"client":"c1"}` {
		t.Fatalf("before SetBuild: %s %s", e.name, e.data)
	}
	h.SetBuild(Build{Version: "1.2.3", Form: 7})
	if e := <-h.Join().ch; string(e.data) != `{"build":{"version":"1.2.3","form":7},"client":"c2"}` {
		t.Fatalf("after SetBuild: %s", e.data)
	}
}
