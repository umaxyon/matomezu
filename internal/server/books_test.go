package server

import (
	"bufio"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
	"testing/fstest"
	"time"
)

// 状態のフォルダ（store）を持つ Hub。マスター用のファイルはそのフォルダに置く
func setupStoreHub(t *testing.T) (*Hub, *httptest.Server, string) {
	t.Helper()
	ctx, cancel := context.WithCancel(context.Background())
	t.Cleanup(cancel)
	state := filepath.Join(t.TempDir(), "state")
	hub := NewHub(ctx, fstest.MapFS{"index.html": {Data: []byte("<html>")}}, WithInterval(20*time.Millisecond),
		WithControl("secret", "v1", func() {}), WithStore(filepath.Join(state, "docs.json")))
	ts := httptest.NewServer(hub.Handler())
	t.Cleanup(ts.Close)
	return hub, ts, state
}

func getBooks(t *testing.T, url string) (books []BookInfo, total int) {
	t.Helper()
	res := do(t, "GET", url, "", nil)
	var out struct {
		Books []BookInfo `json:"books"`
		Total int        `json:"total"`
	}
	if res.StatusCode != http.StatusOK || json.NewDecoder(res.Body).Decode(&out) != nil {
		t.Fatalf("status = %d", res.StatusCode)
	}
	return out.Books, out.Total
}

// 一覧は最終更新の新しい順。題名・作った人・最初のページのパターンはファイルから読み、フルパスは返さない。from と limit で分けて取れる
func TestBooksNewestFirst(t *testing.T) {
	hub, ts, _ := setupStoreHub(t)
	dir := t.TempDir()
	files := map[string]string{
		"old.json": `{"world":{"title":"古い"},"nodes":[]}`,
		"new.json": `{"world":{"title":"新しい","madeBy":"user","childView":"flow"},"nodes":[]}`,
		"mid.json": `{"nodes":[]}`,
	}
	base := time.Now().Add(-time.Hour)
	for i, name := range []string{"old.json", "mid.json", "new.json"} {
		p := filepath.Join(dir, name)
		if err := os.WriteFile(p, []byte(files[name]), 0o644); err != nil {
			t.Fatal(err)
		}
		os.Chtimes(p, base.Add(time.Duration(i)*time.Minute), base.Add(time.Duration(i)*time.Minute))
	}
	// 開いた順（recent）とは違う順にしておく
	for _, name := range []string{"new.json", "old.json", "mid.json"} {
		if _, err := hub.Open(filepath.Join(dir, name)); err != nil {
			t.Fatal(err)
		}
	}
	books, total := getBooks(t, ts.URL+"/api/books")
	if total != 3 || len(books) != 3 {
		t.Fatalf("books = %+v total = %d", books, total)
	}
	got := []string{books[0].Name, books[1].Name, books[2].Name}
	if got[0] != "new.json" || got[1] != "mid.json" || got[2] != "old.json" {
		t.Fatalf("order = %v", got)
	}
	if b := books[0]; b.Title != "新しい" || b.MadeBy != "user" || b.Pattern != "flow" || b.ID != docID(filepath.Join(dir, "new.json")) {
		t.Fatalf("new = %+v", b)
	}
	if b := books[1]; b.Title != "" || b.MadeBy != "" || b.Pattern != "nest" {
		t.Fatalf("mid = %+v", b)
	}
	rest, total := getBooks(t, ts.URL+"/api/books?from=1&limit=1")
	if total != 3 || len(rest) != 1 || rest[0].Name != "mid.json" {
		t.Fatalf("page = %+v", rest)
	}
}

// マスター用のファイルは状態のフォルダに作って登録し、一覧にも覚えている図にも入れない。2 回目は作り直さない
func TestMasterFile(t *testing.T) {
	hub, ts, state := setupStoreHub(t)
	res := do(t, "GET", ts.URL+"/api/master", "", nil)
	var out map[string]string
	if res.StatusCode != http.StatusOK || json.NewDecoder(res.Body).Decode(&out) != nil {
		t.Fatalf("status = %d", res.StatusCode)
	}
	p := filepath.Join(state, masterName)
	if out["id"] != docID(p) {
		t.Fatalf("id = %q", out["id"])
	}
	b, err := os.ReadFile(p)
	if err != nil || string(b) != masterBody {
		t.Fatalf("file = %q %v", b, err)
	}
	if res := do(t, "GET", ts.URL+"/d/"+out["id"]+"/api/data", "", nil); res.StatusCode != http.StatusOK {
		t.Fatalf("not registered: %d", res.StatusCode)
	}
	os.WriteFile(p, []byte(`{"world":{"childView":"master"},"nodes":[{"id":1,"book":"x"}]}`), 0o644)
	do(t, "GET", ts.URL+"/api/master", "", nil)
	if b, _ := os.ReadFile(p); string(b) == masterBody {
		t.Fatal("作り直した")
	}
	if books, total := getBooks(t, ts.URL+"/api/books"); total != 0 || len(books) != 0 {
		t.Fatalf("books = %+v", books)
	}
	if len(hub.recent) != 0 {
		t.Fatalf("recent = %v", hub.recent)
	}
}

// 状態のフォルダが無ければ（store なし）マスターは使えない
func TestMasterNeedsStore(t *testing.T) {
	_, ts, _ := setupHub(t)
	if res := do(t, "GET", ts.URL+"/api/master", "", nil); res.StatusCode != http.StatusNotFound {
		t.Fatalf("status = %d", res.StatusCode)
	}
}

// 画面の「新しい図」で作ったブックには madeBy: "user" を書く
func TestNewBookMadeByUser(t *testing.T) {
	_, ts, _ := setupHub(t)
	dir := t.TempDir()
	_, a := openVia(t, ts, "secret", filepath.Join(dir, "a.json"))
	_, got := postNew(t, ts.URL, `{"near":"`+a.ID+`","title":"メモ","world":{}}`, nil)
	var data struct {
		World map[string]any `json:"world"`
	}
	b, _ := os.ReadFile(got["path"])
	if json.Unmarshal(b, &data) != nil || data.World["madeBy"] != "user" {
		t.Fatalf("file = %s", b)
	}
}

// 郵便箱: 届けると古い順に並び、読んだことにでき、1 件ずつ取り除ける。状態のフォルダの mail/<id>.json に置き、SSE で知らせる
func TestMailbox(t *testing.T) {
	hub, ts, state := setupStoreHub(t)
	dir := t.TempDir()
	res, err := hub.Open(filepath.Join(dir, "a.json"))
	if err != nil {
		t.Fatal(err)
	}
	base := ts.URL + "/d/" + res.ID + "/api/mail"
	list := func() []MailItem {
		var out struct {
			Items []MailItem `json:"items"`
		}
		r := do(t, "GET", base, "", nil)
		if r.StatusCode != http.StatusOK || json.NewDecoder(r.Body).Decode(&out) != nil {
			t.Fatalf("status = %d", r.StatusCode)
		}
		return out.Items
	}
	if got := list(); len(got) != 0 {
		t.Fatalf("items = %+v", got)
	}
	for _, body := range []string{`{"kind":"book","book":"x"}`, `{"kind":"box","copy":{}}`} {
		if r := do(t, "POST", base, body, nil); r.StatusCode != http.StatusOK {
			t.Fatalf("post = %d", r.StatusCode)
		}
	}
	items := list()
	if len(items) != 2 || items[0].Read || string(items[0].Body) != `{"kind":"book","book":"x"}` {
		t.Fatalf("items = %+v", items)
	}
	if _, err := os.Stat(filepath.Join(state, "mail", res.ID+".json")); err != nil {
		t.Fatal(err)
	}
	// 1 件だけ読んだことにする（通知の中身を見た）
	do(t, "POST", base+"/"+items[1].ID+"/read", "{}", nil)
	if items := list(); items[0].Read || !items[1].Read {
		t.Fatalf("read one = %+v", items)
	}
	// 全部を読んだことにする口は無い（郵便箱を開いただけでは読んだことにしない。decision-mailbox-read）
	if r := do(t, "POST", base+"/read", "{}", nil); r.StatusCode == http.StatusNoContent {
		t.Fatalf("read all = %d", r.StatusCode)
	}
	if items := list(); items[0].Read || !items[1].Read {
		t.Fatalf("after read all = %+v", items)
	}
	do(t, "DELETE", base+"/"+items[0].ID, "{}", nil)
	if got := list(); len(got) != 1 || got[0].ID != items[1].ID {
		t.Fatalf("after delete = %+v", got)
	}
	// オブジェクトでない本文は断り、ほかのサイトからの書き込みも断る
	if r := do(t, "POST", base, `[1]`, nil); r.StatusCode != http.StatusBadRequest {
		t.Fatalf("array = %d", r.StatusCode)
	}
	if r := do(t, "POST", base, `{"kind":"book"}`, map[string]string{"Origin": "https://evil.example"}); r.StatusCode != http.StatusForbidden {
		t.Fatalf("cross site = %d", r.StatusCode)
	}
	if r := do(t, "GET", ts.URL+"/d/nope/api/mail", "", nil); r.StatusCode != http.StatusNotFound {
		t.Fatalf("unknown = %d", r.StatusCode)
	}
}

// ブックの一覧が変わったら books イベントで知らせる: 登録したとき。マスターを開いている画面があれば、登録した図のファイルが変わった・消えたときも。
// マスターを開いていない画面しか無ければ、ファイルの変化では知らせない
func TestBooksEvent(t *testing.T) {
	hub, ts, _ := setupStoreHub(t)
	dir := t.TempDir()
	pa := filepath.Join(dir, "a.json")
	if _, err := hub.Open(pa); err != nil {
		t.Fatal(err)
	}
	r := bufio.NewReader(do(t, "GET", ts.URL+"/api/events", "", nil).Body)
	var hello struct{ Client string }
	json.Unmarshal([]byte(nextEvent(t, r, "hello")), &hello)
	watch := func(ids ...string) {
		b, _ := json.Marshal(map[string]any{"client": hello.Client, "docs": ids})
		if res := do(t, "POST", ts.URL+"/api/watch", string(b), nil); res.StatusCode != http.StatusNoContent {
			t.Fatalf("watch: %d", res.StatusCode)
		}
	}
	// 登録すると知らせる
	if _, err := hub.Open(filepath.Join(dir, "b.json")); err != nil {
		t.Fatal(err)
	}
	nextEvent(t, r, "books")
	// マスターを開いていなければ、ファイルを消しても知らせない（次に来るのは、マスターを開いてから消した c の分）
	watch(docID(pa))
	time.Sleep(60 * time.Millisecond)
	os.Remove(pa)
	time.Sleep(100 * time.Millisecond)
	var m struct{ ID string }
	json.NewDecoder(do(t, "GET", ts.URL+"/api/master", "", nil).Body).Decode(&m)
	watch(m.ID)
	time.Sleep(100 * time.Millisecond) // 最初の様子を覚えるまで
	if err := os.WriteFile(filepath.Join(dir, "b.json"), []byte(`{"world":{"title":"変えた"},"nodes":[]}`), 0o644); err != nil {
		t.Fatal(err)
	}
	nextEvent(t, r, "books")
}
