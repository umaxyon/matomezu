package server

import (
	"encoding/json"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/umaxyon/matomezu/internal/engine"
	"github.com/umaxyon/matomezu/internal/storage"
)

// boxed は、箱 a を 1 つ置いたブック b1
const boxed = `{"id":"b1","title":"T","lineup":[{"kind":"page","id":"p1","type":"@matomezu/drawing:drawing","title":"P","paper":"@matomezu/base:a4","orientation":"landscape","items":[{"id":"a","x":40,"y":40,"item":"@matomezu/box:shape-nest-box","w":64,"h":64,"props":{"caption":"A","rule":true,"body":"","captionAlign":"center","bodyAlign":"left"}}]}]}`

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
	if got := perform("note-add", `{"anchors":["a"],"text":"x"}`, `,"on":{"page":"p1"}`); got != `{"ok":true,"result":{"note":"c1"}}` {
		t.Fatalf("note-add = %s", got)
	}
	if got := next(t, a); !strings.HasPrefix(got, `annotations {"annotations":[{"id":"c1","annotation":"@matomezu/base:note","anchors":["a"]`) || !strings.Contains(got, `"page":"p1"`) {
		t.Fatalf("event = %s", got)
	}
	if _, data := send(t, "GET", s.URL+"/api/data", "", nil); !strings.Contains(data, `"annotations":{"p1":[{"id":"c1"`) {
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
	putBook(t, store, boxed)
	if err := store.PutAnnotations("p1", json.RawMessage(list)); err != nil {
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
	if got := string(kept["p1"]); got != `[{"id":"c2","annotation":"@ex/notesx:sticky","anchors":["a"],"props":{}}]` {
		t.Fatalf("kept = %s", got)
	}
	if err := h.dropAnnotationsOf("@ex/notesx"); err != nil {
		t.Fatal(err)
	}
	if kept, _ := store.Annotations(); len(kept) != 0 || len(h.annotations) != 0 || len(h.Warnings()) != 0 {
		t.Fatalf("after dropping all = %v %v %v", kept, h.annotations, h.Warnings())
	}
}

// AI の読む口: read_book・read_page は形の描いた位置と大きさ（placed）と、アノテーションを、立つ物のページと AI の応えを待っているかを添えて返し、
// list_books は待つ数を、awaiting は待つ物の全部を返す。AI が既読にすると待たなくなる
func TestAIReadsAnnotations(t *testing.T) {
	s := newServer(t, nil)
	send(t, "PUT", s.URL+"/api/books-for-test/b1", `{"book":`+boxed+`,"base":0}`, nil)
	ai := map[string]string{"Authorization": "Bearer secret"}
	send(t, "POST", s.URL+"/api/perform", `{"action":"@matomezu/base:note-add","args":{"anchors":["a"],"text":"x"},"on":{"page":"p1"},"lang":"ja","ids":["c1"],"now":"2026-11-02T00:00:00.000Z"}`, nil)
	const waiting = `{"id":"c1","annotation":"@matomezu/base:note","anchors":["a"],"props":{"text":"x","bubble":true,"addedAt":"2026-11-02T00:00:00.000Z"},"page":"p1","awaits":true}`
	if _, got := send(t, "GET", s.URL+"/api/ai/books/b1", "", ai); !strings.Contains(got, `"annotations":[`+waiting+`]`) {
		t.Fatalf("read_book = %s", got)
	}
	if _, got := send(t, "GET", s.URL+"/api/ai/pages/p1", "", ai); !strings.HasPrefix(got, `{"annotations":[`+waiting+`],"id":"b1","page":{"kind":"page","id":"p1"`) {
		t.Fatalf("read_page = %s", got)
	}
	// 形の描いた位置と大きさ（placed）も添える
	if _, got := send(t, "GET", s.URL+"/api/ai/books/b1", "", ai); !strings.Contains(got, `"placed":{"p1":[{"id":"a","x":40,"y":40,"w":64,"h":64}]}`) {
		t.Fatalf("read_book placed = %s", got)
	}
	if _, got := send(t, "GET", s.URL+"/api/ai/pages/p1", "", ai); !strings.HasSuffix(got, `"placed":[{"id":"a","x":40,"y":40,"w":64,"h":64}],"version":1}`) {
		t.Fatalf("read_page placed = %s", got)
	}
	if code, _ := send(t, "GET", s.URL+"/api/ai/pages/nothing", "", ai); code != 404 {
		t.Fatalf("read_page of no page = %d", code)
	}
	if _, got := send(t, "GET", s.URL+"/api/ai/books", "", ai); !strings.Contains(got, `"version":1,"awaiting":1}`) {
		t.Fatalf("list_books = %s", got)
	}
	if _, got := send(t, "GET", s.URL+"/api/ai/awaiting", "", ai); got != `{"awaiting":[{"book":"b1","title":"T","annotation":`+waiting+`,"brief":"x"}],"failed":[],"removed":[],"undone":[]}` {
		t.Fatalf("awaiting = %s", got)
	}
	send(t, "POST", s.URL+"/api/ai/perform", `{"action":"@matomezu/base:note-read","args":{"note":"c1"},"on":{"page":"p1"}}`, ai)
	if _, got := send(t, "GET", s.URL+"/api/ai/awaiting", "", ai); got != `{"awaiting":[],"failed":[],"removed":[],"undone":[]}` {
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
	send(t, "POST", s.URL+"/api/perform", `{"action":"@matomezu/base:note-add","args":{"anchors":["a"],"text":"x"},"on":{"page":"p1"},"lang":"ja","ids":["c1"],"now":"2026-11-02T00:00:00.000Z"}`, nil)
	send(t, "POST", s.URL+"/api/view", `{"client":"c1","view":`+window+`,"editLocks":{"p1":["c1"]},"seq":1}`, nil)
	read := `{"action":"@matomezu/base:note-read","args":{"note":"c1"},"on":{"page":"p1"}}`
	if _, got := send(t, "POST", s.URL+"/api/ai/perform", read, ai); got != `{"ok":false,"reason":"being-edited"}` {
		t.Fatalf("note-read while editing = %s", got)
	}
	remove := `{"action":"@matomezu/paper:item-remove","args":{"items":["a"]},"on":{"page":"p1"}}`
	if _, got := send(t, "POST", s.URL+"/api/ai/perform", remove, ai); got != `{"ok":false,"reason":"being-edited"}` {
		t.Fatalf("removing the noted thing while editing = %s", got)
	}
	send(t, "POST", s.URL+"/api/view", `{"client":"c1","view":`+window+`,"seq":2}`, nil)
	if _, got := send(t, "POST", s.URL+"/api/ai/perform", read, ai); !strings.HasPrefix(got, `{"ok":true`) {
		t.Fatalf("note-read after closing = %s", got)
	}
}

// ブックを消すと、そのブックの効かないアノテーションの warning も一覧から外れる
func TestRemovingABookTakesItsAnnotationWarnings(t *testing.T) {
	store, err := storage.OpenSQLite(filepath.Join(t.TempDir(), "data.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { store.Close() })
	putBook(t, store, boxed)
	if err := store.PutAnnotations("p1", json.RawMessage(`[{"id":"c1","annotation":"@ex/notes:sticky","anchors":["a"],"props":{}}]`)); err != nil {
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
	if got := strings.Join(h.Warnings(), "\n"); !strings.Contains(got, "W018") {
		t.Fatalf("warnings before = %s", got)
	}
	for _, do := range [][2]string{{"@matomezu/base:book-trash", `{"book":"b1"}`}, {"@matomezu/base:book-purge", `{"books":["b1"]}`}} {
		if done, err := h.Perform(Perform{Action: do[0], Args: json.RawMessage(do[1])}); err != nil || !done.OK {
			t.Fatalf("%s = %+v, %v", do[0], done, err)
		}
	}
	if got := strings.Join(h.Warnings(), "\n"); strings.Contains(got, "W018") {
		t.Fatalf("warnings after removing the book = %s", got)
	}
}

// 利用者トリガートークがあると（Talked）、読まれた伝言に会話の時点が付き、期限が過ぎたら時間で消え（Expire）、保存からも消える。
// 窓で利用者が直している伝言は、期限が過ぎても消さない（期限の境目は core の unexpired のテストが見る）
func TestTalkStartsNoteExpiry(t *testing.T) {
	store, err := storage.OpenSQLite(filepath.Join(t.TempDir(), "data.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { store.Close() })
	putBook(t, store, boxed)
	const list = `[{"id":"c1","annotation":"@matomezu/base:note","anchors":["a"],"props":{"text":"x","bubble":true,"addedAt":"2026-11-05T00:00:00.000Z","readAt":"2026-11-05T00:01:00.000Z"}},` +
		`{"id":"c2","annotation":"@matomezu/base:note","anchors":["a"],"props":{"text":"y","bubble":true,"addedAt":"2026-11-05T00:00:00.000Z"}}]`
	if err := store.PutAnnotations("p1", json.RawMessage(list)); err != nil {
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
	talked := time.Date(2026, 11, 5, 1, 0, 0, 0, time.UTC)
	if err := h.Talked(talked); err != nil {
		t.Fatal(err)
	}
	ids := func() string {
		var got []struct {
			ID    string `json:"id"`
			Props struct {
				TalkedAt string `json:"talkedAt"`
			} `json:"props"`
		}
		_ = json.Unmarshal(h.annotations["p1"], &got)
		out := []string{}
		for _, a := range got {
			out = append(out, a.ID+":"+a.Props.TalkedAt)
		}
		return strings.Join(out, " ")
	}
	if got := ids(); got != "c1:2026-11-05T01:00:00.000Z c2:" {
		t.Fatalf("after talking = %s", got)
	}
	// 窓で直している間は消さない
	c := h.Join()
	h.SetView(c.id, json.RawMessage(`{}`), map[string][]string{"p1": {"c1"}}, nil, true, 1)
	if err := h.Expire(talked.Add(3 * time.Hour)); err != nil {
		t.Fatal(err)
	}
	if got := ids(); got != "c1:2026-11-05T01:00:00.000Z c2:" {
		t.Fatalf("while editing = %s", got)
	}
	h.Leave(c)
	if err := h.Expire(talked.Add(3 * time.Hour)); err != nil {
		t.Fatal(err)
	}
	if got := ids(); got != "c2:" {
		t.Fatalf("after the expiry = %s", got)
	}
	if kept, _ := store.Annotations(); strings.Contains(string(kept["p1"]), `"c1"`) {
		t.Fatalf("stored = %s", kept["p1"])
	}
}

// perform の待つ秒数（timeoutSec）は 1 から 60 まで。範囲の外はエンジンで断る
func TestAIPerformRefusesATimeoutOutOfRange(t *testing.T) {
	s := newServer(t, nil)
	send(t, "PUT", s.URL+"/api/books-for-test/b1", `{"book":`+boxed+`,"base":0}`, nil)
	ai := map[string]string{"Authorization": "Bearer secret"}
	_, got := send(t, "POST", s.URL+"/api/ai/perform", `{"action":"@matomezu/base:book-update","args":{"title":"x"},"on":{"book":"b1"},"timeoutSec":61}`, ai)
	if !strings.Contains(got, `"reason":"bad-args"`) || !strings.Contains(got, "timeoutSec must be 1 to 60") {
		t.Fatalf("timeoutSec 61 = %s", got)
	}
}
