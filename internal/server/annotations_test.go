package server

import (
	"encoding/json"
	"path/filepath"
	"slices"
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
		_, got := postPerform(t, s.URL, `{"action":"@matomezu/base:`+action+`","args":`+args+on+`,"lang":"ja","ids":["c1"],"now":"2026-11-01T00:00:00.000Z"}`)
		return got
	}
	if got := perform("note-add", `{"anchors":["a"],"text":"x"}`, `,"on":{"page":"p1"}`); got != `{"ok":true,"result":{"note":"c1"}}` {
		t.Fatalf("note-add = %s", got)
	}
	if got := next(t, a); !strings.HasPrefix(got, `changed {`) || !strings.Contains(got, `"annotations":{"p1":[{"id":"c1","annotation":"@matomezu/base:note","anchors":["a"]`) {
		t.Fatalf("event = %s", got)
	}
	if _, data := send(t, "GET", s.URL+"/api/data", "", nil); !strings.Contains(data, `"annotations":{"p1":[{"id":"c1"`) {
		t.Fatalf("data = %s", data)
	}
	perform("entry-trash", `{"entry":"b1"}`, "")
	// ゴミ箱のブックのページは、AI に見せない（ページの id だけで読んでも）
	if code, _ := send(t, "GET", s.URL+"/api/ai/pages/p1", "", map[string]string{"Authorization": "Bearer secret"}); code != 404 {
		t.Fatalf("read_page of a page in the trash = %d", code)
	}
	perform("entry-purge", `{"entries":["b1"]}`, "")
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
	if err := store.Apply(storage.Batch{Annotations: []storage.PageBody{{Page: "p1", Body: json.RawMessage(list)}}}); err != nil {
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
	postPerform(t, s.URL, `{"action":"@matomezu/base:note-add","args":{"anchors":["a"],"text":"x"},"on":{"page":"p1"},"lang":"ja","ids":["c1"],"now":"2026-11-02T00:00:00.000Z"}`)
	const waiting = `{"id":"c1","annotation":"@matomezu/base:note","anchors":["a"],"props":{"text":"x","bubble":true,"addedAt":"2026-11-02T00:00:00.000Z"},"page":"p1","awaits":true}`
	if _, got := send(t, "GET", s.URL+"/api/ai/books/b1", "", ai); !strings.Contains(got, `"annotations":[`+waiting+`]`) {
		t.Fatalf("read_book = %s", got)
	}
	// read_folder は、応えを待つ物の在るブックの行に、その数を添える
	if _, got := send(t, "GET", s.URL+"/api/ai/folder", "", ai); !strings.Contains(got, `{"kind":"book","id":"b1","title":"T","awaiting":1}`) {
		t.Fatalf("read_folder = %s", got)
	}
	if _, got := send(t, "GET", s.URL+"/api/ai/pages/p1", "", ai); !strings.HasPrefix(got, `{"annotations":[`+waiting+`],"entry":{"kind":"book","id":"b1"},"folder":"b1","page":{"kind":"page","id":"p1"`) {
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
	if _, got := send(t, "GET", s.URL+"/api/ai/awaiting", "", ai); got != `{"awaiting":[{"entry":{"kind":"book","id":"b1"},"title":"T","annotation":`+waiting+`,"brief":"x"}],"failed":[],"removed":[],"undone":[]}` {
		t.Fatalf("awaiting = %s", got)
	}
	send(t, "POST", s.URL+"/api/ai/perform", `{"action":"@matomezu/base:note-read","args":{"note":"c1"},"on":{"page":"p1"}}`, writerAI(t, s.URL))
	if _, got := send(t, "GET", s.URL+"/api/ai/awaiting", "", ai); got != `{"awaiting":[],"failed":[],"removed":[],"undone":[]}` {
		t.Fatalf("awaiting after read = %s", got)
	}
}

// 利用者が窓で開いて直している伝言は、AI が読んだと知らせても変わらず（being-edited）、付いた物を消しても伝言ごと残る。閉じたら読める
func TestAICannotReadANoteTheUserIsEditing(t *testing.T) {
	s := newServer(t, nil)
	send(t, "PUT", s.URL+"/api/books-for-test/b1", `{"book":`+boxed+`,"base":0}`, nil)
	ai := writerAI(t, s.URL)
	a := listen(t, s.URL)
	next(t, a)
	postPerform(t, s.URL, `{"action":"@matomezu/base:note-add","args":{"anchors":["a"],"text":"x"},"on":{"page":"p1"},"lang":"ja","ids":["c1"],"now":"2026-11-02T00:00:00.000Z"}`)
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
func TestTrashingABookTakesItsAnnotationWarnings(t *testing.T) {
	store, err := storage.OpenSQLite(filepath.Join(t.TempDir(), "data.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { store.Close() })
	putBook(t, store, boxed)
	if err := store.Apply(storage.Batch{Annotations: []storage.PageBody{{Page: "p1", Body: json.RawMessage(`[{"id":"c1","annotation":"@ex/notes:sticky","anchors":["a"],"props":{}}]`)}}}); err != nil {
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
	// ゴミ箱に入れた時点で、そのブックのページのアノテーションは消え、warning も外れる
	if done, err := h.Perform(Perform{Actions: []engine.BulkAction{{Action: "@matomezu/base:entry-trash", Args: json.RawMessage(`{"entry":"b1"}`)}}}); err != nil || !done.OK {
		t.Fatalf("entry-trash = %+v, %v", done, err)
	}
	if got := strings.Join(h.Warnings(), "\n"); strings.Contains(got, "W018") {
		t.Fatalf("warnings after the trash = %s", got)
	}
	if kept, _ := store.Annotations(); len(kept) != 0 {
		t.Fatalf("annotations after the trash = %v", kept)
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
	if err := store.Apply(storage.Batch{Annotations: []storage.PageBody{{Page: "p1", Body: json.RawMessage(list)}}}); err != nil {
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
	ai := writerAI(t, s.URL)
	_, got := send(t, "POST", s.URL+"/api/ai/perform", `{"action":"@matomezu/base:book-update","args":{"title":"x"},"on":{"book":"b1"},"timeoutSec":61}`, ai)
	if !strings.Contains(got, `"reason":"bad-args"`) || !strings.Contains(got, "timeoutSec must be 1 to 60") {
		t.Fatalf("timeoutSec 61 = %s", got)
	}
}

// ブックの外のページの効かないアノテーションも warning になり（文の主語はページ）、そのページをゴミ箱に入れるとアノテーションごと消えて warning も外れる
func TestAnnotationWarningsOfAPageOutsideBooks(t *testing.T) {
	store := outsidePageStore(t)
	eng, err := engine.New()
	if err != nil {
		t.Fatal(err)
	}
	h, err := NewHub(store, eng)
	if err != nil {
		t.Fatal(err)
	}
	const line = "W018 @matomezu/note: page g1: annotation c-g1 is a @matomezu/note:note, which is not in the catalog (kept as it is, not used)"
	if got := h.Warnings(); !slices.Contains(got, line) {
		t.Fatalf("warnings = %s; want %s", strings.Join(got, "\n"), line)
	}
	if done, err := h.Perform(Perform{Actions: []engine.BulkAction{{Action: "@matomezu/base:entry-trash", Args: json.RawMessage(`{"entry":"g1"}`)}}}); err != nil || !done.OK {
		t.Fatalf("entry-trash = %+v, %v", done, err)
	}
	if got := h.Warnings(); slices.Contains(got, line) {
		t.Fatalf("warnings after the trash = %s", strings.Join(got, "\n"))
	}
	if kept := storedAnnotations(t, store, "g1"); kept != "" && kept != "[]" {
		t.Fatalf("annotations of g1 after the trash = %s", kept)
	}
}

// 読めるが機能台帳に無い物を持つブックの外のページは、ページごとに warning（W007）になり、read_folder のその行に付く（ブックの外のバインダの中のページも、バインダを読んだ行に）。
// 名前を変えると行が直り、ゴミ箱に入れると外れ、戻すとまた出る
func TestAPageOutsideBooksWithMissingThingsIsWarned(t *testing.T) {
	store := entriesStore(t)
	strange := strings.Replace(outsideH1, `"items":[`, `"items":[{"id":"z","item":"@foo/stars:star","x":0,"y":0,"w":10,"h":10},`, 1)
	if strange == outsideH1 {
		t.Fatal("outsideH1 has no items to add to")
	}
	slide := `{"kind":"page","id":"n1a","type":"@matomezu/slide-page:slide","title":"A","paper":"@matomezu/base:a4","orientation":"landscape","items":[{"id":"z","item":"@foo/stars:star","x":0,"y":0,"w":10,"h":10}]}`
	if err := store.Apply(storage.Batch{Pages: []storage.RowWrite{
		{ID: "h1", Base: storedPage(t, store, "h1").Version, Body: json.RawMessage(strange)},
		{ID: "n1a", Base: storedPage(t, store, "n1a").Version, Body: json.RawMessage(slide)},
	}}); err != nil {
		t.Fatal(err)
	}
	s, hub := newServerOn(t, Options{}, store)
	line := func(title string) string {
		return "W007 @foo/stars: page h1 (" + title + "): it has @foo/stars:star, not in the catalog (kept as they are)"
	}
	const inBinder = "W007 @foo/stars: page n1a (A): it has @foo/stars:star, not in the catalog (kept as they are)"
	if got := hub.Warnings(); !slices.Contains(got, line("H1")) || !slices.Contains(got, inBinder) {
		t.Fatalf("warnings = %s", strings.Join(got, "\n"))
	}
	if _, got := send(t, "GET", s.URL+"/api/ai/folder?folder=n1", "", ai); !strings.Contains(got, `"id":"n1a","title":"A","type":"@matomezu/slide-page:slide","warning":"`+inBinder+`"`) {
		t.Fatalf("read_folder n1 = %s", got)
	}
	if _, got := send(t, "GET", s.URL+"/api/ai/folder", "", ai); !strings.Contains(got, `"id":"h1","title":"H1","type":"@matomezu/drawing:drawing","warning":"`+line("H1")+`"`) {
		t.Fatalf("read_folder = %s", got)
	}
	do := func(action, args string) {
		t.Helper()
		if done, err := hub.Perform(Perform{Actions: []engine.BulkAction{{Action: action, Args: json.RawMessage(args)}}}); err != nil || !done.OK {
			t.Fatalf("%s = %+v, %v", action, done, err)
		}
	}
	do("@matomezu/base:entry-rename", `{"entry":"h1","title":"改"}`)
	if got := hub.Warnings(); !slices.Contains(got, line("改")) || slices.Contains(got, line("H1")) {
		t.Fatalf("warnings after the rename = %s", strings.Join(got, "\n"))
	}
	do("@matomezu/base:entry-trash", `{"entry":"h1"}`)
	if got := strings.Join(hub.Warnings(), "\n"); strings.Contains(got, "page h1") {
		t.Fatalf("warnings after the trash = %s", got)
	}
	do("@matomezu/base:entry-restore", `{"entry":"h1"}`)
	if got := hub.Warnings(); !slices.Contains(got, line("改")) {
		t.Fatalf("warnings after the restore = %s", strings.Join(got, "\n"))
	}
}

// ゴミ箱から戻した物の中のページは、戻した時点で確かめる: フォルダの中のブックの外のページの W007 と、ゴミ箱の中に残っていた効かないアノテーションの W018
func TestRestoredPagesAreChecked(t *testing.T) {
	store := entriesStore(t)
	strange := `{"kind":"page","id":"dt1","type":"@matomezu/drawing:drawing","title":"DT1","paper":"@matomezu/base:a4","orientation":"landscape","items":[{"id":"z","item":"@foo/stars:star","x":0,"y":0,"w":10,"h":10}]}`
	if err := store.Apply(storage.Batch{Pages: []storage.RowWrite{{ID: "dt1", Base: storedPage(t, store, "dt1").Version, Body: json.RawMessage(strange)}}}); err != nil {
		t.Fatal(err)
	}
	_, hub := newServerOn(t, Options{}, store)
	if got := strings.Join(hub.Warnings(), "\n"); strings.Contains(got, "page dt1") || strings.Contains(got, "page t1") {
		t.Fatalf("warnings in the trash = %s", got)
	}
	for _, entry := range []string{"dt", "t1"} {
		if done, err := hub.Perform(Perform{Actions: []engine.BulkAction{{Action: "@matomezu/base:entry-restore", Args: json.RawMessage(`{"entry":"` + entry + `"}`)}}}); err != nil || !done.OK {
			t.Fatalf("entry-restore %s = %+v, %v", entry, done, err)
		}
	}
	got := hub.Warnings()
	for _, want := range []string{
		"W007 @foo/stars: page dt1 (DT1): it has @foo/stars:star, not in the catalog (kept as they are)",
		"W018 @matomezu/note: page t1: annotation c-t1 is a @matomezu/note:note, which is not in the catalog (kept as it is, not used)",
	} {
		if !slices.Contains(got, want) {
			t.Fatalf("warnings after the restore = %s; want %s", strings.Join(got, "\n"), want)
		}
	}
}

// 効かないアノテーションが消え、ほかのアノテーションが残ったページの warning は、その時点で外れる
func TestAnnotationWarningGoesWithTheAnnotation(t *testing.T) {
	store := entriesStore(t)
	two := strings.Replace(outsideH1, `"items":[`, `"items":[{"id":"b","x":140,"y":40,"item":"@matomezu/box:shape-nest-box","w":64,"h":64,"props":{"caption":"B","rule":true,"body":"","captionAlign":"center","bodyAlign":"left"}},`, 1)
	list := `[{"id":"c1","annotation":"@ex/notes:sticky","anchors":["b"],"props":{}},` + outsideH1Note + `]`
	if err := store.Apply(storage.Batch{
		Pages:       []storage.RowWrite{{ID: "h1", Base: storedPage(t, store, "h1").Version, Body: json.RawMessage(two)}},
		Annotations: []storage.PageBody{{Page: "h1", Body: json.RawMessage(list)}},
	}); err != nil {
		t.Fatal(err)
	}
	_, hub := newServerOn(t, Options{}, store)
	if got := strings.Join(hub.Warnings(), "\n"); !strings.Contains(got, "page h1: annotation c1") {
		t.Fatalf("warnings before = %s", got)
	}
	remove := engine.BulkAction{Action: "@matomezu/paper:item-remove", Args: json.RawMessage(`{"items":["b"]}`), On: &engine.On{Page: "h1"}}
	if done, err := hub.Perform(Perform{Actions: []engine.BulkAction{remove}}); err != nil || !done.OK {
		t.Fatalf("item-remove = %+v, %v", done, err)
	}
	if got := strings.Join(hub.Warnings(), "\n"); strings.Contains(got, "page h1: annotation") {
		t.Fatalf("warnings after the item went = %s", got)
	}
	if kept := storedAnnotations(t, store, "h1"); !strings.Contains(kept, `"c-h1"`) || strings.Contains(kept, `"c1"`) {
		t.Fatalf("annotations of h1 = %s", kept)
	}
}

// ゴミ箱の中のブックの warning は出さず、戻すとまた出る
func TestWarningsOfABookInTheTrashAreNotTold(t *testing.T) {
	store, err := storage.OpenSQLite(filepath.Join(t.TempDir(), "data.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { store.Close() })
	strange := strings.Replace(boxed, `"items":[`, `"items":[{"id":"z","item":"@foo/stars:star","x":0,"y":0,"w":10,"h":10},`, 1)
	if strange == boxed {
		t.Fatal("boxed has no items to add to")
	}
	putBook(t, store, strange)
	eng, err := engine.New()
	if err != nil {
		t.Fatal(err)
	}
	h, err := NewHub(store, eng)
	if err != nil {
		t.Fatal(err)
	}
	const line = "W007 @foo/stars: book b1 (T): it has @foo/stars:star, not in the catalog (kept as they are)"
	for _, step := range []struct {
		action string
		want   bool
	}{{"", true}, {"@matomezu/base:entry-trash", false}, {"@matomezu/base:entry-restore", true}} {
		if step.action != "" {
			if done, err := h.Perform(Perform{Actions: []engine.BulkAction{{Action: step.action, Args: json.RawMessage(`{"entry":"b1"}`)}}}); err != nil || !done.OK {
				t.Fatalf("%s = %+v, %v", step.action, done, err)
			}
		}
		if got := h.Warnings(); slices.Contains(got, line) != step.want {
			t.Fatalf("warnings after %q = %s", step.action, strings.Join(got, "\n"))
		}
	}
}

// フォルダの中のブックの warning は read_folder のその行に付き、フォルダごとゴミ箱に入れると出なくなり、戻すとまた出る
func TestWarningOfABookInAFolder(t *testing.T) {
	store := entriesStore(t)
	strange := `{"kind":"page","id":"p1","type":"@matomezu/drawing:drawing","title":"P","paper":"@matomezu/base:a4","orientation":"landscape","items":[{"id":"z","item":"@foo/stars:star","x":0,"y":0,"w":10,"h":10}]}`
	if err := store.Apply(storage.Batch{Pages: []storage.RowWrite{{ID: "p1", Base: storedPage(t, store, "p1").Version, Body: json.RawMessage(strange)}}}); err != nil {
		t.Fatal(err)
	}
	s, hub := newServerOn(t, Options{}, store)
	const line = "W007 @foo/stars: book b1 (T): it has @foo/stars:star, not in the catalog (kept as they are)"
	if _, got := send(t, "GET", s.URL+"/api/ai/folder?folder=d1", "", ai); !strings.Contains(got, `"warning":"`+line+`"`) {
		t.Fatalf("read_folder = %s", got)
	}
	for _, step := range []struct {
		action string
		want   bool
	}{{"", true}, {"@matomezu/base:entry-trash", false}, {"@matomezu/base:entry-restore", true}} {
		if step.action != "" {
			if done, err := hub.Perform(Perform{Actions: []engine.BulkAction{{Action: step.action, Args: json.RawMessage(`{"entry":"d1"}`)}}}); err != nil || !done.OK {
				t.Fatalf("%s = %+v, %v", step.action, done, err)
			}
		}
		if got := hub.Warnings(); slices.Contains(got, line) != step.want {
			t.Fatalf("warnings after %q = %s", step.action, strings.Join(got, "\n"))
		}
	}
}
