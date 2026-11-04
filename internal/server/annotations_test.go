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
	if got := perform("note-add", `{"anchors":["a"],"text":"x"}`, `,"on":{"book":"b1"}`); got != `{"ok":true,"result":{"note":"c1"}}` {
		t.Fatalf("note-add = %s", got)
	}
	if got := next(t, a); !strings.HasPrefix(got, `annotations {"annotations":[{"id":"c1","annotation":"@matomezu/base:note","anchors":["a"]`) || !strings.Contains(got, `"book":"b1"`) {
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

// AI の読む口: read_book・read_page はアノテーションを、立つ物のページと AI の応えを待っているかを添えて返し、
// list_books は待つ数を、awaiting は待つ物の全部を返す。AI が既読にすると待たなくなる
func TestAIReadsAnnotations(t *testing.T) {
	s := newServer(t, nil)
	send(t, "PUT", s.URL+"/api/books-for-test/b1", `{"book":`+boxed+`,"base":0}`, nil)
	ai := map[string]string{"Authorization": "Bearer secret"}
	send(t, "POST", s.URL+"/api/perform", `{"action":"@matomezu/base:note-add","args":{"anchors":["a"],"text":"x"},"on":{"book":"b1"},"lang":"ja","ids":["c1"],"now":"2026-11-02T00:00:00.000Z"}`, nil)
	const waiting = `{"id":"c1","annotation":"@matomezu/base:note","anchors":["a"],"props":{"text":"x","bubble":true,"removeOnRead":true},"page":"p1","awaits":true}`
	if _, got := send(t, "GET", s.URL+"/api/ai/books/b1", "", ai); !strings.Contains(got, `"annotations":[`+waiting+`]`) {
		t.Fatalf("read_book = %s", got)
	}
	if _, got := send(t, "GET", s.URL+"/api/ai/books/b1/pages/p1", "", ai); !strings.HasPrefix(got, `{"annotations":[`+waiting+`],"id":"b1","page":{"id":"p1"`) {
		t.Fatalf("read_page = %s", got)
	}
	if code, _ := send(t, "GET", s.URL+"/api/ai/books/b1/pages/nothing", "", ai); code != 404 {
		t.Fatalf("read_page of no page = %d", code)
	}
	if _, got := send(t, "GET", s.URL+"/api/ai/books", "", ai); !strings.Contains(got, `"version":1,"awaiting":1}`) {
		t.Fatalf("list_books = %s", got)
	}
	if _, got := send(t, "GET", s.URL+"/api/ai/awaiting", "", ai); got != `{"awaiting":[{"book":"b1","title":"T","annotation":`+waiting+`}]}` {
		t.Fatalf("awaiting = %s", got)
	}
	send(t, "POST", s.URL+"/api/ai/perform", `{"action":"@matomezu/base:note-read","args":{"note":"c1"},"on":{"book":"b1"}}`, ai)
	if _, got := send(t, "GET", s.URL+"/api/ai/awaiting", "", ai); got != `{"awaiting":[]}` {
		t.Fatalf("awaiting after read = %s", got)
	}
}

// 利用者が窓で開いて直している伝言は、AI が読んだと知らせても変わらず（being-edited）、付いた物を消しても伝言ごと残る。閉じたら読める
func TestAICannotReadANoteTheUserIsEditing(t *testing.T) {
	s := newServer(t, nil)
	send(t, "PUT", s.URL+"/api/books-for-test/b1", `{"book":`+boxed+`,"base":0}`, nil)
	ai := map[string]string{"Authorization": "Bearer secret"}
	a := listen(t, s.URL)
	next(t, a)
	send(t, "POST", s.URL+"/api/perform", `{"action":"@matomezu/base:note-add","args":{"anchors":["a"],"text":"x"},"on":{"book":"b1"},"lang":"ja","ids":["c1"],"now":"2026-11-02T00:00:00.000Z"}`, nil)
	send(t, "POST", s.URL+"/api/view", `{"client":"c1","view":`+window+`,"locks":{"b1":["c1"]},"seq":1}`, nil)
	read := `{"action":"@matomezu/base:note-read","args":{"note":"c1"},"on":{"book":"b1"}}`
	if _, got := send(t, "POST", s.URL+"/api/ai/perform", read, ai); got != `{"ok":false,"reason":"being-edited"}` {
		t.Fatalf("note-read while editing = %s", got)
	}
	remove := `{"action":"@matomezu/paper:item-remove","args":{"page":"p1","items":["a"]},"on":{"book":"b1"}}`
	if _, got := send(t, "POST", s.URL+"/api/ai/perform", remove, ai); got != `{"ok":false,"reason":"being-edited"}` {
		t.Fatalf("removing the noted thing while editing = %s", got)
	}
	send(t, "POST", s.URL+"/api/view", `{"client":"c1","view":`+window+`,"seq":2}`, nil)
	if _, got := send(t, "POST", s.URL+"/api/ai/perform", read, ai); !strings.HasPrefix(got, `{"ok":true`) {
		t.Fatalf("note-read after closing = %s", got)
	}
}
