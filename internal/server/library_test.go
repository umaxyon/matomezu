package server

import (
	"encoding/json"
	"maps"
	"path/filepath"
	"slices"
	"strings"
	"testing"

	"github.com/umaxyon/matomezu/internal/engine"
	"github.com/umaxyon/matomezu/internal/storage"
)

// slides は、スライドのバインダを持つブック
const slides = `{"id":"b2","title":"S","lineup":[{"kind":"binder","id":"f1","title":"スライド","pageType":"@matomezu/slide-page:slide","lineup":[` +
	`{"kind":"page","id":"s1","type":"@matomezu/slide-page:slide","title":"1","paper":"@matomezu/base:a4","orientation":"landscape"}]}]}`

// libraryStore は、ブック drawing（b1）と slides（b2）を置いた置き場所。nested なら、b1 を書庫ホームの中のフォルダ d1 の中に、
// b2 を d1 の中のフォルダ d2 の中に入れる（そうでなければ、どちらも書庫ホームの直下）
func libraryStore(t *testing.T, nested bool) storage.Storage {
	t.Helper()
	store, err := storage.OpenSQLite(filepath.Join(t.TempDir(), "data.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { store.Close() })
	putBook(t, store, drawing)
	putBook(t, store, slides)
	if nested {
		ref := storage.RefOf
		if err := store.Apply(storage.Batch{
			Folders: []storage.RowWrite{
				{ID: storage.HomeID, Base: 3, Body: storage.HomeBody([]json.RawMessage{ref("folder", "d1")})},
				{ID: "d1", Body: json.RawMessage(`{"folderRole":"folder","id":"d1","title":"D1","lineup":[` + string(ref("book", "b1")) + `,` + string(ref("folder", "d2")) + `]}`)},
				{ID: "d2", Body: json.RawMessage(`{"folderRole":"folder","id":"d2","title":"D2","lineup":[` + string(ref("book", "b2")) + `]}`)},
			},
			Entries: []storage.EntryPut{{ID: "b1", Folder: "d1"}, {ID: "d1", Folder: storage.HomeID}, {ID: "d2", Folder: "d1"}, {ID: "b2", Folder: "d2"}},
		}); err != nil {
			t.Fatal(err)
		}
	}
	return store
}

// ブックが書庫ホームの直下に在っても、フォルダの下に在っても、AI に見せる答え（list_books・read_book・read_page・view）は同じで、
// 書庫ホームとフォルダはブックに数えない
func TestBooksInFoldersLookTheSameToTheAI(t *testing.T) {
	answers := func(nested bool) []string {
		s, hub := newServerOn(t, Options{}, libraryStore(t, nested))
		screen := listen(t, s.URL)
		next(t, screen) // hello
		if got := hub.AIBooks(); len(got) != 2 || got[0].ID != "b1" || got[1].ID != "b2" {
			t.Fatalf("nested %v: AI books = %+v", nested, got)
		}
		if hub.Book(storage.HomeID) != nil || hub.Book("d1") != nil {
			t.Fatalf("nested %v: the library home or a folder is a book", nested)
		}
		send(t, "POST", s.URL+"/api/view", `{"client":"c1","view":{"current":"book-screen","entry":{"kind":"book","id":"b2"},"page":"s1","stage":"s1","stages":[{"id":"s1","entry":{"kind":"book","id":"b2"}}]},"focused":true}`, nil)
		out := []string{}
		for _, path := range []string{"/api/ai/books", "/api/ai/books/b1", "/api/ai/books/b2", "/api/ai/pages/p1", "/api/ai/pages/s1", "/api/ai/view", "/api/ai/books/" + storage.HomeID, "/api/ai/books/d1"} {
			code, body := send(t, "GET", s.URL+path, "", ai)
			out = append(out, path+" "+string(rune('0'+code/100))+" "+body)
		}
		return out
	}
	flat, nested := answers(false), answers(true)
	if !slices.Equal(flat, nested) {
		t.Fatalf("the answers differ:\n%s\n---\n%s", strings.Join(flat, "\n"), strings.Join(nested, "\n"))
	}
	if !strings.Contains(flat[0], `"id":"b1"`) || !strings.Contains(flat[0], `"id":"b2"`) || strings.Contains(flat[0], storage.HomeID) ||
		!strings.Contains(flat[4], `"entry":{"kind":"book","id":"b2"}`) || !strings.Contains(flat[5], `"entry":{"kind":"book","id":"b2"}`) || !strings.Contains(flat[5], `"page":"s1"`) || !strings.HasPrefix(flat[6], "/api/ai/books/"+storage.HomeID+" 4") {
		t.Fatalf("answers = %s", strings.Join(flat, "\n"))
	}
}

// 書庫ホームとフォルダの下のブックも、ページの持ち主・触れた時刻・エンジンへ渡す行は、ブックの物として決まる
func TestBooksInFoldersAreBooksOfTheHub(t *testing.T) {
	_, hub := newServerOn(t, Options{}, libraryStore(t, true))
	hub.mu.Lock()
	defer hub.mu.Unlock()
	if !slices.Equal(hub.order, []string{"b1", "b2"}) || len(hub.books) != 2 {
		t.Fatalf("order = %v, books %v", hub.order, slices.Sorted(maps.Keys(hub.books)))
	}
	for page, book := range map[string]string{"p1": "b1", "s1": "b2", "f1": "b2", "b1": "", "d2": ""} {
		if got := hub.bookOfEntry(page); got != book {
			t.Fatalf("book of %s = %q; want %q", page, got, book)
		}
	}
	if got := slices.Sorted(maps.Keys(hub.touched)); !slices.Equal(got, []string{"b1", "b2"}) {
		t.Fatalf("touched = %v", hub.touched)
	}
	folders := func(steps ...engine.BulkAction) []string {
		t.Helper()
		in := engine.Input{Actions: steps}
		if err := hub.performInputs(&in); err != nil {
			t.Fatal(err)
		}
		ids := []string{}
		for _, f := range in.Folders {
			var head struct{ ID string }
			_ = json.Unmarshal(f, &head)
			ids = append(ids, head.ID)
		}
		return ids
	}
	update := func(page string) engine.BulkAction {
		return step("@matomezu/base:page-update", `{"title":"x"}`, &engine.On{Page: page})
	}
	// ブックが対象なら、そのブックの行と、ブックから書庫ホームまでのフォルダ（ブックごとに近い順。重ねない）
	if got := folders(update("s1"), update("p1")); !slices.Equal(got, []string{"b2", "f1", "b1", "d2", "d1", storage.HomeID}) {
		t.Fatalf("pages in two books = %v", got)
	}
	// 一覧が対象なら、全部のブックと、書庫ホーム・ゴミ箱を先にした、書庫ホーム・ゴミ箱・フォルダの全部（起動したときに足したドキュメントも）
	if got := folders(step("@matomezu/base:book-create", `{"title":"N"}`, nil)); len(got) < 5 || !slices.Equal(got[:5], []string{"b1", "b2", "f1", storage.HomeID, storage.TrashID}) ||
		!slices.Equal(slices.Sorted(slices.Values(got[5:])), slices.Sorted(slices.Values(append([]string{"d1", "d2"}, documentsOf(t, hub)...)))) {
		t.Fatalf("a list action = %v", got)
	}
}

// 上へたどるフォルダが輪になっていても、通ったフォルダで止まる
func TestFoldersAboveStopOnALoop(t *testing.T) {
	_, hub := newServerOn(t, Options{}, libraryStore(t, true))
	hub.mu.Lock()
	defer hub.mu.Unlock()
	hub.places["d1"] = "d2"
	if got := hub.foldersAbove("b2"); !slices.Equal(got, []string{"d2", "d1"}) {
		t.Fatalf("folders above b2 = %v", got)
	}
	if got := hub.bookOfEntry("b2"); got != "" {
		t.Fatalf("book of b2 = %q", got)
	}
}

// テストの用意の入口: 新しいブックは書庫ホームの並びの末尾に入り、置き直したブックは入っているフォルダのまま。
// 世界を空にすると、書庫ホームだけが空の並びで残る
func TestWholeBooksGoIntoTheLibraryHome(t *testing.T) {
	_, hub := newServerOn(t, Options{}, libraryStore(t, true))
	hub.mu.Lock()
	defer hub.mu.Unlock()
	home := func() string {
		folders, err := hub.store.Folders()
		if err != nil {
			t.Fatal(err)
		}
		for _, f := range folders {
			if f.ID == storage.HomeID {
				return string(f.Body)
			}
		}
		return ""
	}
	entries := func() map[string]string {
		got, err := hub.store.Entries()
		if err != nil {
			t.Fatal(err)
		}
		return got
	}
	if _, _, err := hub.replaceBookForTest("b3", json.RawMessage(`{"id":"b3","title":"N","lineup":[]}`), 0); err != nil {
		t.Fatal(err)
	}
	if want := `{"folderRole":"home","id":"library-home","lineup":[` + documentsRef(t, hub) + `{"id":"d1","kind":"folder"},{"id":"b3","kind":"book"}]}`; home() != want ||
		entries()["b3"] != storage.HomeID || hub.places["b3"] != storage.HomeID || !slices.Contains(hub.order, "b3") {
		t.Fatalf("home after a new book = %s, entries %v", home(), entries())
	}
	if _, _, err := hub.replaceBookForTest("b1", json.RawMessage(`{"id":"b1","title":"T2","lineup":[]}`), 1); err != nil {
		t.Fatal(err)
	}
	if entries()["b1"] != "d1" || strings.Contains(home(), `"b1"`) || hub.places["p1"] != "" {
		t.Fatalf("after putting b1 again: home %s, entries %v", home(), entries())
	}
	if err := hub.clearBooksForTest(); err != nil {
		t.Fatal(err)
	}
	stored, _ := hub.store.Folders()
	if folders := slices.Sorted(maps.Keys(hub.folders)); len(hub.pages) != 0 || !slices.Equal(folders, []string{storage.HomeID, storage.TrashID, storage.UnreadableID}) || len(stored) != 3 ||
		home() != `{"folderRole":"home","id":"library-home","lineup":[]}` || string(hub.folders[storage.TrashID].body) != `{"folderRole":"trash","id":"library-trash","lineup":[]}` ||
		len(entries()) != 0 || len(hub.order) != 0 {
		t.Fatalf("after clearing: pages %v, folders %v, stored %+v, entries %v", hub.pages, folders, stored, entries())
	}
	// 空にした後も、新しいブックは書庫ホームに入る
	if _, _, err := hub.replaceBookForTest("b1", json.RawMessage(drawing), 0); err != nil {
		t.Fatal(err)
	}
	if home() != `{"folderRole":"home","id":"library-home","lineup":[{"id":"b1","kind":"book"}]}` || entries()["b1"] != storage.HomeID {
		t.Fatalf("after clearing and putting: home %s, entries %v", home(), entries())
	}
}

// AI のアクションの AI 編集チケットと、変わったブックの知らせには、書庫ホームとフォルダの id を入れない
func TestAIEditTicketsLeaveOutTheLibrary(t *testing.T) {
	s, hub := newServerOn(t, Options{}, libraryStore(t, true))
	header := joinedAI(t, s)
	screen := listen(t, s.URL)
	next(t, screen) // hello
	if _, got := send(t, "POST", s.URL+"/api/ai/perform", `{"action":"@matomezu/base:book-create","args":{"title":"N","into":"`+storage.HomeID+`"}}`, header); !strings.HasPrefix(got, `{"ok":true`) {
		t.Fatalf("book-create = %s", got)
	}
	var changed string
	for changed == "" {
		if got := next(t, screen); strings.HasPrefix(got, "changed ") {
			changed = got
		}
	}
	if !strings.Contains(changed, `"id":"`+storage.HomeID+`"`) || strings.Contains(between(changed, `"books":`, `]`), storage.HomeID) {
		t.Fatalf("changed = %s", changed)
	}
	hub.mu.Lock()
	defer hub.mu.Unlock()
	last := hub.aiEditTickets[len(hub.aiEditTickets)-1]
	if len(last.Unseen) == 0 || slices.Contains(last.Unseen, storage.HomeID) {
		t.Fatalf("tickets = %+v", hub.aiEditTickets)
	}
	if slices.Contains(hub.order, storage.HomeID) || len(hub.order) != 3 {
		t.Fatalf("order = %v", hub.order)
	}
	if _, ok := hub.touched[storage.HomeID]; ok {
		t.Fatalf("touched = %v", hub.touched)
	}
}

// 読み込みの時点で書庫の木の決まりが破れている（ブック b2 がどのフォルダにも入っていない）と、warning（W030）が一覧に出て、
// 書庫が対象のアクションは断られる。ブックは読めるまま。木が直ると、warning は消える
func TestABrokenLibraryTreeIsAWarning(t *testing.T) {
	store := libraryStore(t, false)
	ref := storage.RefOf
	alone := storage.Batch{Folders: []storage.RowWrite{{ID: storage.HomeID, Base: 3, Body: storage.HomeBody([]json.RawMessage{ref("book", "b1")})}}}
	if err := store.Apply(alone); err != nil {
		t.Fatal(err)
	}
	s, hub := newServerOn(t, Options{}, store)
	has := func() bool {
		return slices.ContainsFunc(hub.Warnings(), func(l string) bool { return strings.HasPrefix(l, "W030") })
	}
	if !has() {
		t.Fatalf("the warnings have no W030: %v", hub.Warnings())
	}
	if _, list := send(t, "GET", s.URL+"/api/data", "", nil); !strings.Contains(list, `"id":"b1"`) || !strings.Contains(list, `"id":"b2"`) {
		t.Fatalf("the books are not both readable: %s", list)
	}
	_, got := postPerform(t, s.URL, `{"action":"@matomezu/base:book-create","args":{"title":"U"},"lang":"ja","ids":["b3"]}`)
	if !strings.HasPrefix(got, `{"ok":false,"reason":"refused"`) {
		t.Fatalf("book-create on a broken tree = %s", got)
	}
	hub.mu.Lock()
	home, err := hub.homeWithForTest(func(lineup []json.RawMessage) []json.RawMessage { return append(lineup, ref("book", "b2")) })
	version := hub.folders[storage.HomeID].version
	hub.mu.Unlock()
	if err != nil {
		t.Fatal(err)
	}
	if err := store.Apply(storage.Batch{Folders: []storage.RowWrite{{ID: storage.HomeID, Base: version, Body: home}}, Entries: []storage.EntryPut{{ID: "b2", Folder: storage.HomeID}}}); err != nil {
		t.Fatal(err)
	}
	hub.mu.Lock()
	hub.folders[storage.HomeID] = newFolderRow(home, version+1)
	hub.checkLibrary()
	hub.mu.Unlock()
	if has() {
		t.Fatalf("the warning stays after the tree is whole: %v", hub.Warnings())
	}
	// ブックを足す書き込みのあとにも、確かめ直す
	hub.mu.Lock()
	hub.libraryWarning = "W030 stale"
	hub.mu.Unlock()
	send(t, "PUT", s.URL+"/api/books-for-test/b9", `{"book":`+strings.Replace(strings.Replace(boxed, `"b1"`, `"b9"`, 1), `"p1"`, `"p9"`, 1)+`,"base":0}`, nil)
	if has() {
		t.Fatalf("the library is not checked after a write that adds a book: %v", hub.Warnings())
	}
}

// between は、s の中の、from から次の to まで（無ければ空）
func between(s, from, to string) string {
	i := strings.Index(s, from)
	if i < 0 {
		return ""
	}
	rest := s[i:]
	if j := strings.Index(rest, to); j >= 0 {
		return rest[:j+1]
	}
	return rest
}
