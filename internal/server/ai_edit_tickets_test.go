package server

import (
	"encoding/json"
	"fmt"
	"net/http/httptest"
	"path/filepath"
	"slices"
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

// acts は、AI 編集チケットの act の並び
func acts(h *Hub) []string {
	out := []string{}
	for _, c := range tickets(h) {
		out = append(out, c.Act)
	}
	return out
}

// tickets は、AI 編集チケットの全部
func tickets(h *Hub) []AIEditTicket {
	h.mu.Lock()
	defer h.mu.Unlock()
	return slices.Clone(h.aiEditTickets)
}

// AI 編集チケット: AI のアクションごとに 1 つ残り（変えたページとフォルダを持つ）、窓が見たら消え、見られる前に消えたら AI のフックに渡り、次の利用者トリガートークで消える。
// 常駐を起動し直しても残り、起動し直したあとの act は前の物と重ならない
func TestAIEditTicketsUndoneBeforeSeen(t *testing.T) {
	path := filepath.Join(t.TempDir(), "data.db")
	hub, s := hubAt(t, path)
	send(t, "PUT", s.URL+"/api/books-for-test/b1", `{"book":`+boxed+`,"base":0}`, nil)
	ai := map[string]string{"Authorization": "Bearer secret"}
	rename := func(s *httptest.Server, title string) {
		send(t, "POST", s.URL+"/api/ai/perform", `{"action":"@matomezu/base:book-update","args":{"title":"`+title+`"},"on":{"book":"b1"}}`, writerAI(t, s.URL))
	}
	rename(s, "AI1")
	rename(s, "AI2")
	got := func(s *httptest.Server) string {
		_, out := send(t, "GET", s.URL+"/api/ai/awaiting", "", ai)
		return out
	}
	a := acts(hub)
	if list := tickets(hub); len(list) != 2 || !slices.Equal(list[0].Unseen, []string{"b1"}) || !slices.Equal(list[1].Unseen, []string{"b1"}) {
		t.Fatalf("tickets = %+v; want 2, each with the book's folder unseen", list)
	}
	settle := func(s *httptest.Server, act, outcome string) {
		body, _ := json.Marshal(map[string]any{"entry": "b1", "act": act, "places": []string{"b1"}, "outcome": outcome, "lost": []any{map[string]any{"entry": "b1", "at": "title", "value": "AI"}}})
		send(t, "POST", s.URL+"/api/ai-edit-tickets", string(body), nil)
	}
	// 1 つめは見えた、2 つめは見られる前に戻された。見えた物には、あとから消えたと知らされても変えない
	settle(s, a[0], "seen")
	settle(s, a[1], "lost")
	settle(s, a[0], "lost")
	g := got(s)
	if !strings.Contains(g, `"undone":[{"entry":"b1","title":"AI2","at":"`) || strings.Count(g, `"lost":`) != 1 {
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
	if code, _ := send(t, "POST", s2.URL+"/api/ai-edit-tickets", `{"entry":"b1","act":"x","outcome":"other"}`, nil); code != 400 {
		t.Fatalf("bad outcome = %d", code)
	}
	// 消えたの知らせは、消えた物のステージエントリが要る
	if code, _ := send(t, "POST", s2.URL+"/api/ai-edit-tickets", `{"act":"x","places":["b1"],"outcome":"lost","lost":[{"at":"title","value":"AI"}]}`, nil); code != 400 {
		t.Fatalf("lost without an entry = %d", code)
	}
	// 消えた所と値が空でも受ける（消えたのがブックの外のフォルダだけで、その AI の変更を段ごと捨てたとき）
	if code, body := send(t, "POST", s2.URL+"/api/ai-edit-tickets", `{"entry":"b1","act":"x","places":["b1"],"outcome":"lost","lost":[]}`, nil); code >= 300 {
		t.Fatalf("lost with no values = %d %s", code, body)
	}
}

// 1 回のアクションが 2 冊を変えた AI 編集チケットは、1 冊が見えても残り、もう 1 冊が見られる前に消えたら AI に渡る。
// 1 枚のページを変えたアクションは、そのページだけを持つ
func TestATicketStaysUntilAllItChangedIsSettled(t *testing.T) {
	hub, s := hubAt(t, filepath.Join(t.TempDir(), "data.db"))
	send(t, "PUT", s.URL+"/api/books-for-test/b1", `{"book":`+boxed+`,"base":0}`, nil)
	send(t, "PUT", s.URL+"/api/books-for-test/b2", `{"book":{"id":"b2","title":"U","lineup":[]},"base":0}`, nil)
	ai := map[string]string{"Authorization": "Bearer secret"}
	if _, got := send(t, "POST", s.URL+"/api/ai/perform", `{"action":"@matomezu/paper:item-update","args":{"item":"a","props":{"caption":"AI"}},"on":{"page":"p1"}}`, writerAI(t, s.URL)); !strings.HasPrefix(got, `{"ok":true`) {
		t.Fatalf("item-update = %s", got)
	}
	if list := tickets(hub); len(list) != 1 || !slices.Equal(list[0].Unseen, []string{"p1"}) {
		t.Fatalf("tickets after changing a page = %+v; want one with only the page unseen", list)
	}
	hub.mu.Lock()
	err := hub.putTickets([]AIEditTicket{{Act: "two", Unseen: []string{"b1", "p1", "b2"}, At: "t"}})
	hub.mu.Unlock()
	if err != nil {
		t.Fatal(err)
	}
	settle := func(book, outcome string, places ...string) {
		body, _ := json.Marshal(map[string]any{"entry": book, "act": "two", "places": places, "outcome": outcome, "lost": []any{map[string]any{"entry": "b1", "at": "title", "value": "AI"}}})
		send(t, "POST", s.URL+"/api/ai-edit-tickets", string(body), nil)
	}
	// 見えたの知らせは、ステージエントリを言わなくてよい（書庫の画面で見えた物も、同じ知らせで閉じる）
	settle("", "seen", "b1", "p1")
	if list := tickets(hub); len(list) != 1 || !slices.Equal(list[0].Unseen, []string{"b2"}) {
		t.Fatalf("tickets after one book was seen = %+v; want the other book still unseen", list)
	}
	// 見えた物には、あとから消えたと知らされても変えない
	settle("b1", "lost", "b1")
	if _, got := send(t, "GET", s.URL+"/api/ai/awaiting", "", ai); !strings.Contains(got, `"undone":[]`) {
		t.Fatalf("awaiting after a late lost = %s", got)
	}
	settle("b2", "lost", "b2")
	if _, got := send(t, "GET", s.URL+"/api/ai/awaiting", "", ai); !strings.Contains(got, `"undone":[{"entry":"b2","title":"U","at":"t","lost":[`) {
		t.Fatalf("awaiting = %s", got)
	}
	send(t, "POST", s.URL+"/api/ai/talked", `{}`, ai)
	if list := tickets(hub); len(list) != 0 {
		t.Fatalf("tickets after talked = %+v", list)
	}
}

// ブックを消すと、そのブックの AI 編集チケットも消える（ほかのブックの分は残る）。世界を空にしたときも消え、起動し直しても戻らない
func TestTicketsGoWithTheirBook(t *testing.T) {
	path := filepath.Join(t.TempDir(), "data.db")
	hub, s := hubAt(t, path)
	send(t, "PUT", s.URL+"/api/books-for-test/b1", `{"book":`+boxed+`,"base":0}`, nil)
	send(t, "PUT", s.URL+"/api/books-for-test/b2", `{"book":{"id":"b2","title":"U","lineup":[]},"base":0}`, nil)
	hub.mu.Lock()
	err := hub.putTickets([]AIEditTicket{
		{Act: "one", Unseen: []string{"p1"}, At: "t"},
		{Act: "two", Unseen: []string{"b1", "b2"}, Lost: []LostIn{{Entry: "b1", Lost: json.RawMessage(`[]`)}}, At: "t"},
		{Key: "m1", Book: "b1", At: "t"},
		{Key: "m2", Book: "b2", At: "t"},
	})
	hub.mu.Unlock()
	if err != nil {
		t.Fatal(err)
	}
	for _, do := range [][2]string{{"entry-trash", `{"entry":"b1"}`}, {"entry-purge", `{"entries":["b1"]}`}} {
		if _, got := postPerform(t, s.URL, `{"action":"@matomezu/base:`+do[0]+`","args":`+do[1]+`,"lang":"ja"}`); !strings.HasPrefix(got, `{"ok":true`) {
			t.Fatalf("%s = %s", do[0], got)
		}
	}
	want := `[{"act":"two","unseen":["b2"],"at":"t"},{"key":"m2","book":"b2","at":"t"}]`
	if got, _ := json.Marshal(tickets(hub)); string(got) != want {
		t.Fatalf("tickets after purging b1 = %s; want %s", got, want)
	}
	hub2, s2 := hubAt(t, path)
	if got, _ := json.Marshal(tickets(hub2)); string(got) != want {
		t.Fatalf("tickets after restart = %s; want %s", got, want)
	}
	if code, got := send(t, "POST", s2.URL+"/api/reset-for-test", `{"books":[]}`, nil); code != 200 {
		t.Fatalf("reset = %d %s", code, got)
	}
	if hub3, _ := hubAt(t, path); len(tickets(hub3)) != 0 {
		t.Fatalf("tickets after emptying the world and a restart = %+v", tickets(hub3))
	}
}

// 上限（aiEditTicketsMax）を超えても、key で見分ける AI 編集チケットは捨てず、key の無い物の古い方から捨てる
func TestTicketsWithAKeyAreNotDroppedAtTheLimit(t *testing.T) {
	list := []AIEditTicket{{Key: "proposal", At: "t"}}
	for i := range aiEditTicketsMax {
		list = recordedTickets(list, fmt.Sprintf("a%d", i), "t", []string{"p"})
	}
	if len(list) != aiEditTicketsMax || list[0].Key != "proposal" || list[1].Act != "a1" {
		t.Fatalf("list = %d, first %+v, second %+v", len(list), list[0], list[1])
	}
	// key で見分ける物だけで上限を超えていれば、それは捨てず、足した key の無い物を捨てる
	keyed := []AIEditTicket{}
	for i := range aiEditTicketsMax + 1 {
		keyed = append(keyed, AIEditTicket{Key: fmt.Sprintf("k%d", i)})
	}
	if got := recordedTickets(keyed, "a", "t", []string{"p"}); len(got) != aiEditTicketsMax+1 || got[0].Key != "k0" || got[len(got)-1].Key != "k100" {
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
	putBook(t, store, boxed)
	if err := store.Apply(storage.Batch{
		Counters:      []storage.Counter{{Subject: mailKind, Scope: "mail", Next: 2}},
		Records:       []storage.RecordWrite{{Subject: mailKind, ID: "m1", Body: json.RawMessage(`{"id":"m1","mail":"@matomezu/base:proposal","from":"a","sentAt":"t","props":{"title":"提案","body":"","book":"b1","changes":[{"action":"x","args":{}}],"snapshot":{}},"order":1}`)}},
		AIEditTickets: json.RawMessage(`[{"key":"m1","subject":"` + mailKind + `","book":"b1","at":"t"}]`),
	}); err != nil {
		t.Fatal(err)
	}
	store.Close()
	_, s := hubAt(t, path)
	ai := map[string]string{"Authorization": "Bearer secret"}
	if _, got := postPerform(t, s.URL, `{"action":"@matomezu/base:mail-remove","args":{},"on":{"record":"m1"},"lang":"ja"}`); !strings.HasPrefix(got, `{"ok":true`) {
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

// ブックの外のページの、見られる前に消えた AI の変更は、そのページの名前で AI に渡る。そのページを完全に消すと、その分（まだ見られていない物と、消えた分）も消える
func TestLostOfAPageOutsideBooksIsToldByThePage(t *testing.T) {
	s, hub := newServerOn(t, Options{Token: "secret"}, entriesStore(t))
	ai := map[string]string{"Authorization": "Bearer secret"}
	hub.mu.Lock()
	err := hub.putTickets([]AIEditTicket{{Act: "x", Unseen: []string{"h1", "g1"}, At: "t"}})
	hub.mu.Unlock()
	if err != nil {
		t.Fatal(err)
	}
	send(t, "POST", s.URL+"/api/ai-edit-tickets", `{"entry":"h1","act":"x","places":["h1"],"outcome":"lost","lost":[{"entry":"h1","at":"title","value":"AI"}]}`, nil)
	want := `"undone":[{"entry":"h1","title":"H1","at":"t","lost":[{"entry":"h1","at":"title","value":"AI"}]}]`
	if _, got := send(t, "GET", s.URL+"/api/ai/awaiting", "", ai); !strings.Contains(got, want) {
		t.Fatalf("awaiting = %s; want %s", got, want)
	}
	purge := func(page string) {
		for _, do := range [][2]string{{"entry-trash", `{"entry":"` + page + `"}`}, {"entry-purge", `{"entries":["` + page + `"]}`}} {
			if _, got := postPerform(t, s.URL, `{"action":"@matomezu/base:`+do[0]+`","args":`+do[1]+`,"lang":"ja"}`); !strings.HasPrefix(got, `{"ok":true`) {
				t.Fatalf("%s %s = %s", do[0], page, got)
			}
		}
	}
	hub.mu.Lock()
	err = hub.putTickets([]AIEditTicket{{Act: "y", Unseen: []string{"h1", "g1"}, Lost: []LostIn{{Entry: "h1", Lost: json.RawMessage(`[]`)}}, At: "t"}})
	hub.mu.Unlock()
	if err != nil {
		t.Fatal(err)
	}
	purge("h1")
	if got, _ := json.Marshal(tickets(hub)); string(got) != `[{"act":"y","unseen":["g1"],"at":"t"}]` {
		t.Fatalf("tickets after purging h1 = %s; want only g1 unseen", got)
	}
	purge("g1")
	if list := tickets(hub); len(list) != 0 {
		t.Fatalf("tickets after purging g1 = %+v; want none", list)
	}
	// ブックの外のバインダも、ステージエントリ: その名前で渡り、バインダを完全に消すと、バインダと中のページの分も消える
	hub.mu.Lock()
	err = hub.putTickets([]AIEditTicket{{Act: "z", Unseen: []string{"n1", "n1a"}, Lost: []LostIn{{Entry: "n1", Lost: json.RawMessage(`[]`)}}, At: "t"}})
	hub.mu.Unlock()
	if err != nil {
		t.Fatal(err)
	}
	if _, got := send(t, "GET", s.URL+"/api/ai/awaiting", "", ai); !strings.Contains(got, `"undone":[{"entry":"n1","title":"N1","at":"t","lost":[]}]`) {
		t.Fatalf("awaiting of a binder outside books = %s", got)
	}
	purge("n1")
	if list := tickets(hub); len(list) != 0 {
		t.Fatalf("tickets after purging the binder n1 = %+v; want none", list)
	}
	// 消えたと記したあとで、そのページがブックの中に在っても（移されても）、そのページの名前で渡る
	hub.mu.Lock()
	err = hub.putTickets([]AIEditTicket{{Act: "w", Lost: []LostIn{{Entry: "p1", Lost: json.RawMessage(`[]`)}}, At: "t"}})
	hub.mu.Unlock()
	if err != nil {
		t.Fatal(err)
	}
	if _, got := send(t, "GET", s.URL+"/api/ai/awaiting", "", ai); !strings.Contains(got, `"undone":[{"entry":"p1","title":"`) {
		t.Fatalf("awaiting of a page now inside a book = %s", got)
	}
}
