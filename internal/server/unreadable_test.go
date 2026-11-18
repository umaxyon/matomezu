package server

import (
	"bytes"
	"encoding/json"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"
	"testing/fstest"

	"github.com/umaxyon/matomezu/internal/engine"
	"github.com/umaxyon/matomezu/internal/storage"
)

// withUnreadable は、読めないページを 2 枚持つブック f1: 先頭の p1 はタイプが機能台帳に無く（W027）、バインダ d1 の中の q1 はタイプの形に合わない（W028）
const withUnreadable = `{"id":"f1","title":"Flow","lineup":[` +
	`{"kind":"page","id":"p1","type":"@foo/stamps:board","title":"Stamps","paper":"@matomezu/base:a4","orientation":"landscape","stamps":[1,2]},` +
	`{"kind":"page","id":"p2","type":"@matomezu/drawing:drawing","title":"P2","paper":"@matomezu/base:a4","orientation":"landscape","items":[]},` +
	`{"kind":"binder","id":"d1","title":"D","pageType":"@matomezu/slide-book:slide","lineup":[` +
	`{"kind":"page","id":"q1","type":"@matomezu/slide-book:slide","title":"Q1","paper":"@matomezu/base:a4","orientation":"landscape","items":"bad"},` +
	`{"kind":"page","id":"q2","type":"@matomezu/slide-book:slide","title":"Q2","paper":"@matomezu/base:a4","orientation":"landscape","items":[]}]},` +
	`{"kind":"page","id":"p3","type":"@matomezu/drawing:drawing","title":"P3","paper":"@matomezu/base:a4","orientation":"landscape","items":[]}]}`

// serveStore は、置き場所 path を開いた常駐（起動し直しを確かめるために、同じ path で何度でも立てられる）
func serveStore(t *testing.T, path string) (*httptest.Server, *Hub) {
	t.Helper()
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
	o := Options{Web: fstest.MapFS{"index.html": {Data: []byte("top")}}, Token: "secret", Version: "v1", Hub: hub, Cookies: NewScreenCookies(nil, nil)}
	s := httptest.NewServer(withRoutesForTest(Handler(o), o))
	cookieTestBrowser(t, s, o.Cookies)
	t.Cleanup(func() {
		s.Close()
		hub.CloseAll()
		store.Close()
	})
	return s, hub
}

// rowOf は、常駐が持つページかフォルダの行の本文（無ければ nil）
func rowOf(h *Hub, id string) json.RawMessage {
	pages, folders := h.Tables()
	for _, p := range pages {
		if p.ID == id {
			return p.Body
		}
	}
	for _, f := range folders {
		if f.ID == id {
			return f.Body
		}
	}
	return nil
}

// 読めないページは読めるブックの中にそのまま残る: 一覧では warning、目次では同じ位置に kind unreadable と番号、読む・アクションは番号だけで断る。
// ほかのページへのアクションは効き、読めないページの行は 1 バイトも変わらず、並びの位置も変わらない。起動し直しても同じで、ブックごと消せば行も消える
func TestUnreadablePagesStayInAReadableBook(t *testing.T) {
	path := filepath.Join(t.TempDir(), "data.db")
	store, err := storage.OpenSQLite(path)
	if err != nil {
		t.Fatal(err)
	}
	putBook(t, store, withUnreadable)
	store.Close()
	s, h := serveStore(t, path)
	p1, q1 := rowOf(h, "p1"), rowOf(h, "q1")
	if p1 == nil || q1 == nil {
		t.Fatal("the rows of the unreadable pages are not there")
	}

	check := func(s *httptest.Server) {
		t.Helper()
		_, body := get(t, s.URL+"/api/ai/books", "secret")
		if !strings.Contains(body, `"id":"f1","title":"Flow","version":`) || !strings.Contains(body, `1 page(s) are of type `) || !strings.Contains(body, `; W028 : book f1 (Flow): 1 page(s) do not fit the shape of their type`) || strings.Contains(body, `"problem"`) {
			t.Fatalf("list_books = %s", body)
		}
		_, body = get(t, s.URL+"/api/ai/books/f1?outline=1", "secret")
		var got struct {
			Book struct {
				Lineup []json.RawMessage `json:"lineup"`
			} `json:"book"`
		}
		if err := json.Unmarshal([]byte(body), &got); err != nil || len(got.Book.Lineup) < 1 {
			t.Fatalf("read_book = %s", body)
		}
		if first := string(got.Book.Lineup[0]); first != `{"kind":"unreadable","id":"p1","title":"Stamps","code":"W027","type":"@foo/stamps:board"}` {
			t.Fatalf("read_book's first entry = %s", first)
		}
		if !strings.Contains(body, `"lineup":[{"kind":"unreadable","id":"q1","title":"Q1","code":"W028","type":"@matomezu/slide-book:slide"},{"kind":"page","id":"q2"`) {
			t.Fatalf("read_book's binder = %s", body)
		}
		if strings.Contains(body, `"stamps"`) || strings.Contains(body, "bad") {
			t.Fatalf("read_book shows the contents of an unreadable page: %s", body)
		}
		for page, code := range map[string]string{"p1": "W027", "q1": "W028"} {
			if _, body := get(t, s.URL+"/api/ai/pages/"+page, "secret"); strings.TrimSpace(body) != `{"code":"`+code+`","ok":false,"reason":"unreadable"}` {
				t.Fatalf("read_page %s = %s", page, body)
			}
		}
		// 目次でない読み方でも、読めないページは中身を見せない
		if _, body := get(t, s.URL+"/api/ai/books/f1", "secret"); !strings.Contains(body, `{"kind":"unreadable","id":"p1","title":"Stamps","code":"W027","type":"@foo/stamps:board"}`) ||
			!strings.Contains(body, `{"kind":"unreadable","id":"q1","title":"Q1","code":"W028","type":"@matomezu/slide-book:slide"}`) || strings.Contains(body, `"stamps"`) || strings.Contains(body, "bad") {
			t.Fatalf("read_book without outline = %s", body)
		}
		if _, body := get(t, s.URL+"/api/ai/pages/p2", "secret"); !strings.Contains(body, `"book":"f1"`) {
			t.Fatalf("read_page p2 = %s", body)
		}
	}
	check(s)

	perform := func(body string) string {
		t.Helper()
		_, got := send(t, "POST", s.URL+"/api/ai/perform", body, ai)
		return got
	}
	// 読めないページを宛先にするアクションは、エンジンが断り、番号だけを返す。読めないページを動かすアクションも、エンジンが断る
	if got := perform(`{"action":"@matomezu/base:page-lock","args":{},"on":{"page":"p1"}}`); got != `{"code":"W027","ok":false,"reason":"unreadable"}` {
		t.Fatalf("page-lock on p1 = %s", got)
	}
	if got := perform(`{"action":"@matomezu/base:page-move","args":{"page":"p1","index":2},"on":{"book":"f1"}}`); got != `{"code":"W027","ok":false,"reason":"unreadable"}` {
		t.Fatalf("page-move of p1 = %s", got)
	}
	// 読めないページを持つバインダを消すアクションは、エンジンが unreadable で断り、その読めないページの番号を返す
	if got := perform(`{"action":"@matomezu/base:binder-remove","args":{"binder":"d1"},"on":{"book":"f1"}}`); got != `{"code":"W028","ok":false,"reason":"unreadable"}` {
		t.Fatalf("binder-remove of d1 = %s", got)
	}
	// ほかのページへのアクション・ページを足す・入れ替えるは効く
	for _, body := range []string{
		`{"action":"@matomezu/base:page-lock","args":{},"on":{"page":"p2"}}`,
		`{"action":"@matomezu/base:page-add","args":{"type":"@matomezu/drawing:drawing","title":"P4"},"on":{"book":"f1"}}`,
		`{"action":"@matomezu/base:page-move","args":{"page":"p3","index":1},"on":{"book":"f1"}}`,
	} {
		if got := perform(body); !strings.HasPrefix(got, `{"ok":true`) {
			t.Fatalf("%s = %s", body, got)
		}
	}
	if !bytes.Equal(rowOf(h, "p1"), p1) || !bytes.Equal(rowOf(h, "q1"), q1) {
		t.Fatalf("the rows of the unreadable pages changed: %s / %s", rowOf(h, "p1"), rowOf(h, "q1"))
	}
	// 並びの要素の id（id だけのエントリでなければ空）
	ids := func(folder string) []string {
		out := []string{}
		for _, e := range lineupOf(rowOf(h, folder)) {
			_, id, _ := entryRef("", e)
			out = append(out, id)
		}
		return out
	}
	if got := ids("f1"); len(got) != 5 || got[0] != "p1" || got[1] != "p3" || got[2] != "p2" || got[3] != "d1" {
		t.Fatalf("the lineup of f1 = %s", rowOf(h, "f1"))
	}
	if got := ids("d1"); len(got) != 2 || got[0] != "q1" || got[1] != "q2" {
		t.Fatalf("the lineup of d1 = %s", rowOf(h, "d1"))
	}
	check(s)

	// 起動し直しても同じ（同じ置き場所から読み直す）
	s2, h2 := serveStore(t, path)
	check(s2)
	if !bytes.Equal(rowOf(h2, "p1"), p1) || !bytes.Equal(rowOf(h2, "q1"), q1) {
		t.Fatal("the rows of the unreadable pages changed after the restart")
	}

	// ブックごと消せば、読めないページの行も消える（鍵は利用者だけが外せるので、画面の口から外してから）
	for _, body := range []string{
		`{"action":"@matomezu/base:page-unlock","args":{},"on":{"page":"p2"},"lang":"ja","now":"2026-11-01T00:00:00.000Z"}`,
		`{"action":"@matomezu/base:entry-trash","args":{"entry":"f1"},"lang":"ja","now":"2026-11-01T00:00:00.000Z"}`,
		`{"action":"@matomezu/base:entry-purge","args":{"entries":["f1"]},"lang":"ja","now":"2026-11-01T00:00:00.000Z"}`,
	} {
		if _, got := postPerform(t, s2.URL, body); !strings.HasPrefix(got, `{"ok":true`) {
			t.Fatalf("%s = %s", body, got)
		}
	}
	if rowOf(h2, "p1") != nil || rowOf(h2, "q1") != nil || rowOf(h2, "f1") != nil {
		t.Fatal("the rows of the purged book are still there")
	}
	if len(h2.PageWarnings()) != 0 {
		t.Fatalf("page warnings after the purge = %v", h2.PageWarnings())
	}
}

// 読めないページの行を書き換える出力と、読めないページの行をそれを持つブックごとでなく消す出力は、エンジンが返しても書かない（読めないページの行はそのまま残す決まりの、後ろの守り）
func TestAWriteThatChangesAnUnreadablePageIsRefused(t *testing.T) {
	path := filepath.Join(t.TempDir(), "data.db")
	store, err := storage.OpenSQLite(path)
	if err != nil {
		t.Fatal(err)
	}
	putBook(t, store, withUnreadable)
	store.Close()
	_, h := serveStore(t, path)
	h.mu.Lock()
	defer h.mu.Unlock()
	removed := func(ids ...string) []engine.RowChange {
		out := []engine.RowChange{}
		for _, id := range ids {
			out = append(out, engine.RowChange{ID: id, Removed: true})
		}
		return out
	}
	for _, out := range []engine.Output{
		{Pages: []engine.RowChange{{ID: "p1", Row: json.RawMessage(`{"kind":"page","id":"p1"}`)}}},
		{Pages: []engine.RowChange{{ID: "p2", Row: json.RawMessage(`{"kind":"unreadable","id":"p2","title":"","code":"W027"}`)}}},
		{Folders: []engine.RowChange{{ID: "f1", Row: json.RawMessage(`{"id":"f1","lineup":[{"kind":"unreadable","id":"p1","title":"","code":"W027"}]}`)}}},
		// ブックを消さずに、読めないページを消す・読めないページを持つバインダごと消す
		{Pages: removed("p1")},
		{Pages: removed("q1", "q2"), Folders: removed("d1")},
	} {
		if !h.unreadableWrite(out) {
			t.Fatalf("not refused: %+v", out)
		}
	}
	whole := engine.Output{Pages: removed("p1", "p2", "q1", "q2", "p3"), Folders: removed("d1", "f1")}
	if h.unreadableWrite(whole) {
		t.Fatal("removing a whole book with unreadable pages was refused")
	}
	if h.unreadableWrite(engine.Output{Pages: []engine.RowChange{{ID: "p2", Row: json.RawMessage(`{"kind":"page","id":"p2"}`)}}}) {
		t.Fatal("changing a readable page was refused")
	}
}

// 追加プラグインを外すと、そのタイプのページは読めないページ（W027）になり、行は 1 バイトも変わらない。同じブックのほかのページに書いても変わらず、
// プラグインを足し直せば、同じ行のまま読めるページに戻る
func TestAPageComesBackWhenItsPluginIsAddedAgain(t *testing.T) {
	path := filepath.Join(t.TempDir(), "data.db")
	store, err := storage.OpenSQLite(path)
	if err != nil {
		t.Fatal(err)
	}
	if err := store.PutSettings(user, json.RawMessage(`{"`+enabledPluginsSetting+`":["ex2"]}`)); err != nil {
		t.Fatal(err)
	}
	putBook(t, store, `{"id":"f1","title":"Flow","lineup":[`+
		`{"kind":"page","id":"p1","type":"ex2:flow","title":"P1","paper":"@matomezu/base:a4","orientation":"portrait"},`+
		`{"kind":"page","id":"p2","type":"@matomezu/drawing:drawing","title":"P2","paper":"@matomezu/base:a4","orientation":"landscape","items":[]}]}`)
	store.Close()
	s, h := serveStore(t, path)
	flow := "../../test/added-plugins/ex2"
	if got := link(t, s, flow); got != `{"id":"ex2","ok":true}` {
		t.Fatalf("link = %s", got)
	}
	readable := func() {
		t.Helper()
		if code, ok := h.UnreadablePage("p1"); ok {
			t.Fatalf("p1 is unreadable (%s)", code)
		}
		if _, body := get(t, s.URL+"/api/ai/pages/p1", "secret"); !strings.Contains(body, `"book":"f1"`) {
			t.Fatalf("read_page p1 = %s", body)
		}
	}
	readable()
	original := rowOf(h, "p1")
	if original == nil {
		t.Fatal("the row of p1 is not there")
	}

	if _, got := send(t, "POST", s.URL+"/api/plugins/remove", `{"id":"ex2"}`, ai); got != `{"ok":true}` {
		t.Fatalf("remove = %s", got)
	}
	if code, ok := h.UnreadablePage("p1"); !ok || code != "W027" {
		t.Fatalf("p1 after removing ex2 = %q %v", code, ok)
	}
	if !bytes.Equal(rowOf(h, "p1"), original) {
		t.Fatalf("the row of p1 changed when ex2 was removed: %s", rowOf(h, "p1"))
	}
	if _, got := send(t, "POST", s.URL+"/api/ai/perform", `{"action":"@matomezu/base:page-lock","args":{},"on":{"page":"p2"}}`, ai); !strings.HasPrefix(got, `{"ok":true`) {
		t.Fatalf("page-lock on p2 = %s", got)
	}
	if !bytes.Equal(rowOf(h, "p1"), original) {
		t.Fatalf("the row of p1 changed by a write on p2: %s", rowOf(h, "p1"))
	}

	if got := link(t, s, flow); got != `{"id":"ex2","ok":true}` {
		t.Fatalf("link again = %s", got)
	}
	readable()
	if len(h.PageWarnings()) != 0 {
		t.Fatalf("page warnings after adding ex2 again = %v", h.PageWarnings())
	}
	if !bytes.Equal(rowOf(h, "p1"), original) {
		t.Fatalf("the row of p1 changed when ex2 was added again: %s", rowOf(h, "p1"))
	}
}
