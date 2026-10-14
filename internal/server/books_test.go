package server

import (
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
		if _, err := hub.Open(filepath.Join(dir, name), false, ""); err != nil {
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
