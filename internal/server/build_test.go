package server

import (
	"path/filepath"
	"testing"
	"testing/fstest"

	"github.com/umaxyon/matomezu/internal/engine"
	"github.com/umaxyon/matomezu/internal/storage"
)

// emptyHub は、空の置き場所の Hub
func emptyHub(t *testing.T) *Hub {
	t.Helper()
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
	return h
}

func TestHelloTellsTheBuild(t *testing.T) {
	h := emptyHub(t)
	if e := <-h.Join().ch; e.name != "hello" || string(e.data) != `{"client":"c1"}` {
		t.Fatalf("before SetBuild: %s %s", e.name, e.data)
	}
	h.SetBuild(Build{Version: "1.2.3", DataVersion: 7})
	if e := <-h.Join().ch; string(e.data) != `{"build":{"version":"1.2.3","dataVersion":7},"client":"c2"}` {
		t.Fatalf("after SetBuild: %s", e.data)
	}
}

func TestHelloTellsTheWebPrint(t *testing.T) {
	h := emptyHub(t)
	h.SetBuild(Build{Version: "dev", DataVersion: 7, Web: "abc"})
	if e := <-h.Join().ch; string(e.data) != `{"build":{"version":"dev","dataVersion":7,"web":"abc"},"client":"c1"}` {
		t.Fatalf("hello: %s", e.data)
	}
}

func TestWebPrintFollowsIndexHTML(t *testing.T) {
	if p := WebPrint(fstest.MapFS{}); p != "" {
		t.Fatalf("no index.html: %q", p)
	}
	one := WebPrint(fstest.MapFS{"index.html": {Data: []byte(`<script src="./index-a.js"></script>`)}})
	two := WebPrint(fstest.MapFS{"index.html": {Data: []byte(`<script src="./index-b.js"></script>`)}})
	if len(one) != 12 || one == two {
		t.Fatalf("prints: %q %q", one, two)
	}
}
