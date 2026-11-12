package server

import (
	"encoding/json"
	"fmt"
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
	o := Options{Token: "secret", Version: "v1", Hub: hub, Cookies: NewScreenCookies(nil, nil)}
	s := httptest.NewServer(withRoutesForTest(Handler(o), o))
	cookieTestBrowser(t, s, o.Cookies)
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

// AI 編集チケット: AI のアクションが変えたブックに 1 つ残り、窓が見たら消え、見られる前に消えたら AI のフックに渡り、次の利用者トリガートークで消える。
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
	// 裏の知らせで始まったターン（woken）は利用者トリガートークではないので消えない。渡した物は、利用者トリガートークがあったら消える
	send(t, "POST", s2.URL+"/api/ai/talked", `{"woken":true}`, ai)
	if g := got(s2); strings.Count(g, `"lost":`) != 1 {
		t.Fatalf("awaiting after a woken turn = %s", g)
	}
	send(t, "POST", s2.URL+"/api/ai/talked", `{}`, ai)
	if g := got(s2); !strings.HasSuffix(g, `"undone":[]}`) {
		t.Fatalf("awaiting after talked = %s", g)
	}
	if code, _ := send(t, "POST", s2.URL+"/api/ai-edit-tickets", `{"book":"b1","act":"x","outcome":"other"}`, nil); code != 400 {
		t.Fatalf("bad outcome = %d", code)
	}
}

// 上限（aiEditTicketsMax）を超えても、key で見分ける AI 編集チケットは捨てず、key の無い物の古い方から捨てる
func TestTicketsWithAKeyAreNotDroppedAtTheLimit(t *testing.T) {
	list := []AIEditTicket{{Key: "proposal", At: "t", Version: 1}}
	for i := range aiEditTicketsMax {
		list = recordedTickets(list, fmt.Sprintf("a%d", i), int64(i+2), "t")
	}
	if len(list) != aiEditTicketsMax || list[0].Key != "proposal" || list[1].Act != "a1" {
		t.Fatalf("list = %d, first %+v, second %+v", len(list), list[0], list[1])
	}
	// key で見分ける物だけで上限を超えていれば、それは捨てず、足した key の無い物を捨てる
	keyed := []AIEditTicket{}
	for i := range aiEditTicketsMax + 1 {
		keyed = append(keyed, AIEditTicket{Key: fmt.Sprintf("k%d", i)})
	}
	if got := recordedTickets(keyed, "a", 1, "t"); len(got) != aiEditTicketsMax+1 || got[0].Key != "k0" || got[len(got)-1].Key != "k100" {
		t.Fatalf("keyed = %d", len(got))
	}
}

// 利用者が反映していない変更提案郵便を消すと、その AI 編集チケットは消えたことになり（cause user）、AI のフックに removed で渡り、次の利用者トリガートークで消える
func TestRemovedProposalIsToldAndForgotten(t *testing.T) {
	path := filepath.Join(t.TempDir(), "data.db")
	store, err := storage.OpenSQLite(path)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := store.Apply(storage.Batch{
		Books:         []storage.BookWrite{{ID: "b1", Body: json.RawMessage(boxed)}},
		Counters:      []storage.Counter{{Subject: mailKind, Scope: "mail", Next: 2}},
		Records:       []storage.RecordWrite{{Subject: mailKind, ID: "m1", Body: json.RawMessage(`{"id":"m1","mail":"@matomezu/base:proposal","from":"a","sentAt":"t","props":{"title":"提案","body":"","book":"b1","changes":[{"action":"x","args":{}}],"snapshot":{}},"order":1}`)}},
		AIEditTickets: []storage.BookBody{{Book: "b1", Body: json.RawMessage(`[{"key":"m1","subject":"` + mailKind + `","at":"t","version":1}]`)}},
	}); err != nil {
		t.Fatal(err)
	}
	store.Close()
	_, s := hubAt(t, path)
	ai := map[string]string{"Authorization": "Bearer secret"}
	if _, got := send(t, "POST", s.URL+"/api/perform", `{"action":"@matomezu/base:mail-remove","args":{},"on":{"record":"m1"},"lang":"ja"}`, nil); !strings.HasPrefix(got, `{"ok":true`) {
		t.Fatalf("mail-remove = %s", got)
	}
	want := `"removed":[{"book":"b1","title":"T","key":"m1","cause":"user"}]`
	if _, got := send(t, "GET", s.URL+"/api/ai/awaiting", "", ai); !strings.Contains(got, want) || !strings.Contains(got, `"failed":[]`) {
		t.Fatalf("awaiting = %s", got)
	}
	send(t, "POST", s.URL+"/api/ai/talked", `{}`, ai)
	if _, got := send(t, "GET", s.URL+"/api/ai/awaiting", "", ai); !strings.Contains(got, `"removed":[]`) {
		t.Fatalf("awaiting after talked = %s", got)
	}
}
