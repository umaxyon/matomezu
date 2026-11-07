package server

import (
	"encoding/json"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"

	"github.com/umaxyon/matomezu/internal/engine"
	"github.com/umaxyon/matomezu/internal/storage"
)

// hubAt は、置き場所 path の常駐（起動し直しを確かめるために、同じ置き場所で作り直せる）
func hubAt(t *testing.T, path string) (*Hub, *httptest.Server) {
	store, err := storage.OpenSQLite(path)
	if err != nil {
		t.Fatal(err)
	}
	eng, err := engine.New()
	if err != nil {
		t.Fatal(err)
	}
	hub, err := NewHub(store, eng)
	if err != nil {
		t.Fatal(err)
	}
	o := Options{Token: "secret", Version: "v1", Hub: hub}
	s := httptest.NewServer(withRoutesForTest(Handler(o), o))
	t.Cleanup(func() {
		s.Close()
		hub.CloseAll()
		store.Close()
	})
	return hub, s
}

// acts は、ブック b1 の AI 編集チケットの act の並び
func acts(h *Hub) []string {
	h.mu.Lock()
	defer h.mu.Unlock()
	out := []string{}
	for _, c := range h.aiEditTickets["b1"] {
		out = append(out, c.Act)
	}
	return out
}

// AI 編集チケット: AI のアクションが変えたブックに 1 つ残り、窓が見たら消え、見られる前に消えたら AI のフックに渡り、次に話しかけたら消える。
// 常駐を起動し直しても残り、起動し直したあとの act は前の物と重ならない
func TestAIEditTicketsUndoneBeforeSeen(t *testing.T) {
	path := filepath.Join(t.TempDir(), "data.db")
	hub, s := hubAt(t, path)
	send(t, "PUT", s.URL+"/api/books-for-test/b1", `{"book":`+boxed+`,"base":0}`, nil)
	ai := map[string]string{"Authorization": "Bearer secret"}
	rename := func(s *httptest.Server, title string) {
		send(t, "POST", s.URL+"/api/ai/perform", `{"action":"@matomezu/base:book-update","args":{"title":"`+title+`"},"on":{"book":"b1"}}`, ai)
	}
	rename(s, "AI1")
	rename(s, "AI2")
	got := func(s *httptest.Server) string {
		_, out := send(t, "GET", s.URL+"/api/ai/awaiting", "", ai)
		return out
	}
	a := acts(hub)
	if len(a) != 2 {
		t.Fatalf("acts = %v", a)
	}
	settle := func(s *httptest.Server, act, outcome string) {
		body, _ := json.Marshal(map[string]any{"book": "b1", "act": act, "outcome": outcome, "lost": []any{map[string]any{"at": "title", "value": "AI"}}})
		send(t, "POST", s.URL+"/api/ai-edit-tickets", string(body), nil)
	}
	// 1 つめは見えた、2 つめは見られる前に戻された。見えた物には、あとから消えたと知らされても変えない
	settle(s, a[0], "seen")
	settle(s, a[1], "lost")
	settle(s, a[0], "lost")
	g := got(s)
	if !strings.Contains(g, `"undone":[{"book":"b1","title":"AI2","at":"`) || strings.Count(g, `"lost":`) != 1 {
		t.Fatalf("awaiting after = %s", g)
	}
	// 起動し直しても残り、新しい AI の変更の act は前の物と重ならない
	hub2, s2 := hubAt(t, path)
	if g2 := got(s2); !strings.Contains(g2, `"title":"AI2"`) || strings.Count(g2, `"lost":`) != 1 {
		t.Fatalf("awaiting after restart = %s", g2)
	}
	rename(s2, "AI3")
	if b := acts(hub2); len(b) != 2 || b[1] == a[1] || b[1] == a[0] {
		t.Fatalf("acts after restart = %v (before %v)", b, a)
	}
	// 渡した物は、話しかけたら消える
	send(t, "POST", s2.URL+"/api/ai/talked", `{}`, ai)
	if g := got(s2); !strings.HasSuffix(g, `"undone":[]}`) {
		t.Fatalf("awaiting after talked = %s", g)
	}
	if code, _ := send(t, "POST", s2.URL+"/api/ai-edit-tickets", `{"book":"b1","act":"x","outcome":"other"}`, nil); code != 400 {
		t.Fatalf("bad outcome = %d", code)
	}
}
