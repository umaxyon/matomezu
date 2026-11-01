package server

import (
	"encoding/json"
	"path/filepath"
	"strings"
	"testing"

	"github.com/umaxyon/matomezu/internal/engine"
	"github.com/umaxyon/matomezu/internal/storage"
)

// boxed は、箱 a を 1 つ置いたブック b1
const boxed = `{"type":"@matomezu/drawing:drawing","id":"b1","title":"T","pages":[{"id":"p1","title":"P","paper":"@matomezu/base:a4","orientation":"landscape","items":[{"id":"a","x":40,"y":40,"item":"@matomezu/box:shape-nest-box","w":64,"h":64,"props":{"caption":"A","rule":true,"body":"","captionAlign":"center","bodyAlign":"left"}}]}]}`

// アノテーションのアクションは、変わったアノテーションを書いて知らせ（annotations）、/api/data にも出る。ブックを消すと一緒に消える
func TestAnnotationsAreKeptApartFromTheBook(t *testing.T) {
	s := newServer(t, nil)
	send(t, "PUT", s.URL+"/api/books-for-test/b1", `{"book":`+boxed+`,"base":0}`, nil)
	a := listen(t, s.URL)
	next(t, a)
	perform := func(action, args, on string) string {
		_, got := send(t, "POST", s.URL+"/api/perform", `{"action":"@matomezu/base:`+action+`","args":`+args+on+`,"lang":"ja","ids":["c1"],"now":"2026-11-01T00:00:00.000Z"}`, nil)
		return got
	}
	if got := perform("comment-add", `{"anchors":["a"],"text":"x","ask":"reply"}`, `,"on":{"book":"b1"}`); got != `{"ok":true,"result":{"comment":"c1"}}` {
		t.Fatalf("comment-add = %s", got)
	}
	if got := next(t, a); !strings.HasPrefix(got, `annotations {"annotations":[{"id":"c1","annotation":"@matomezu/base:comment","anchors":["a"]`) || !strings.Contains(got, `"book":"b1"`) {
		t.Fatalf("event = %s", got)
	}
	if _, data := send(t, "GET", s.URL+"/api/data", "", nil); !strings.Contains(data, `"annotations":{"b1":[{"id":"c1"`) {
		t.Fatalf("data = %s", data)
	}
	perform("book-trash", `{"book":"b1"}`, "")
	perform("book-purge", `{"books":["b1"]}`, "")
	if _, data := send(t, "GET", s.URL+"/api/data", "", nil); !strings.Contains(data, `"annotations":{}`) {
		t.Fatalf("data after purge = %s", data)
	}
}

// 種類の無いアノテーションは warning の一覧に持ち、利用者がプラグインを外すと、そのプラグインが足した種類のアノテーションを消す（ほかの種類は残す）
func TestDroppingAPluginsAnnotations(t *testing.T) {
	store, err := storage.OpenSQLite(filepath.Join(t.TempDir(), "data.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { store.Close() })
	list := `[{"id":"c1","annotation":"@ex/notes:sticky","anchors":["a"],"props":{}},{"id":"c2","annotation":"@ex/notesx:sticky","anchors":["a"],"props":{}}]`
	if _, _, err := store.PutBook("b1", json.RawMessage(boxed), 0); err != nil {
		t.Fatal(err)
	}
	if err := store.PutAnnotations("b1", json.RawMessage(list)); err != nil {
		t.Fatal(err)
	}
	eng, err := engine.New()
	if err != nil {
		t.Fatal(err)
	}
	h, err := NewHub(store, eng)
	if err != nil {
		t.Fatal(err)
	}
	// 種類の無いアノテーションは、消さずに warning（W018）として一覧に持つ
	if got := strings.Join(h.Warnings(), "\n"); strings.Count(got, "W018") != 2 {
		t.Fatalf("warnings = %s", got)
	}
	if err := h.dropAnnotationsOf("@ex/notes"); err != nil {
		t.Fatal(err)
	}
	kept, err := store.Annotations()
	if err != nil {
		t.Fatal(err)
	}
	if got := string(kept["b1"]); got != `[{"id":"c2","annotation":"@ex/notesx:sticky","anchors":["a"],"props":{}}]` {
		t.Fatalf("kept = %s", got)
	}
	if err := h.dropAnnotationsOf("@ex/notesx"); err != nil {
		t.Fatal(err)
	}
	if kept, _ := store.Annotations(); len(kept) != 0 || len(h.annotations) != 0 || len(h.Warnings()) != 0 {
		t.Fatalf("after dropping all = %v %v %v", kept, h.annotations, h.Warnings())
	}
}
