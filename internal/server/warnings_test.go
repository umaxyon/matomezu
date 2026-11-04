package server

import (
	"encoding/json"
	"path/filepath"
	"strings"
	"testing"

	"github.com/umaxyon/matomezu/internal/engine"
	"github.com/umaxyon/matomezu/internal/storage"
)

// 知らせが貯まりきって切った窓は、その窓が知らせた warning も一覧から消える
func TestAWindowCutForAFullBufferTakesItsWarnings(t *testing.T) {
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
	c := h.Join()
	if ok, err := h.SetWindowWarnings(c.id, json.RawMessage(`[{"code":"W011","plugin":"acme","params":{"reason":"E301"}}]`)); !ok || err != nil {
		t.Fatalf("set = %v %v", ok, err)
	}
	if got := strings.Join(h.Warnings(), "\n"); !strings.Contains(got, "W011 acme") {
		t.Fatalf("warnings before = %s", got)
	}
	h.mu.Lock()
	for range clientBuffer { // hello と合わせて 1 つあふれる
		h.send(c, "ping", nil)
	}
	h.mu.Unlock()
	if got := strings.Join(h.Warnings(), "\n"); strings.Contains(got, "W011") {
		t.Fatalf("warnings after the window was cut = %s", got)
	}
}
