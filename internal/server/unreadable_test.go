package server

import (
	"bytes"
	"encoding/json"
	"net/http/httptest"
	"path/filepath"
	"slices"
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

// unreadableRefs は、常駐が持つ読めない物のフォルダの並びの、中の物の id と理由の番号
func unreadableRefs(t *testing.T, h *Hub) [][2]string {
	t.Helper()
	var folder struct {
		Lineup []struct {
			Entry struct {
				ID string `json:"id"`
			} `json:"entry"`
			Code string `json:"code"`
		} `json:"lineup"`
	}
	if err := json.Unmarshal(rowOf(h, storage.UnreadableID), &folder); err != nil {
		t.Fatal(err)
	}
	out := [][2]string{}
	for _, r := range folder.Lineup {
		out = append(out, [2]string{r.Entry.ID, r.Code})
	}
	return out
}

// 起動すると、読めない物は在った所から読めない物のフォルダへ 1 回の書き込みで移り、行の中身は 1 バイトも変わらない。書庫からも AI からも消え（名指すと無い物として断る）、
// warning は件数の W032 だけ。起動し直しても同じで、ふつうの書き込みのあとには移さない
func TestUnreadableThingsMoveToTheUnreadableFolderAtStart(t *testing.T) {
	path := filepath.Join(t.TempDir(), "data.db")
	store, err := storage.OpenSQLite(path)
	if err != nil {
		t.Fatal(err)
	}
	putBook(t, store, withUnreadable)
	stored := map[string]string{}
	pages, _ := store.Pages()
	for _, p := range pages {
		stored[p.ID] = string(p.Body)
	}
	store.Close()
	s, h := serveStore(t, path)
	if got := unreadableRefs(t, h); !slices.Equal(got, [][2]string{{"p1", "W027"}, {"q1", "W028"}}) {
		t.Fatalf("the unreadable folder = %v", got)
	}
	for _, id := range []string{"p1", "q1"} {
		if string(rowOf(h, id)) != stored[id] {
			t.Fatalf("the row of %s changed: %s", id, rowOf(h, id))
		}
	}
	h.mu.Lock()
	inside := h.inUnreadable("p1") && h.inUnreadable("q1") && !h.inUnreadable("p2")
	book, binder := slices.Clone(h.folders["f1"].entries), slices.Clone(h.folders["d1"].entries)
	h.mu.Unlock()
	if !inside || !slices.Equal(book, []string{"p2", "d1", "p3"}) || !slices.Equal(binder, []string{"q2"}) {
		t.Fatalf("in the unreadable folder %v, f1 %v, d1 %v", inside, book, binder)
	}
	if code, _ := get(t, s.URL+"/api/ai/pages/p1", "secret"); code != 404 {
		t.Fatalf("read_page p1 = %d", code)
	}
	if _, body := get(t, s.URL+"/api/ai/books/f1", "secret"); strings.Contains(body, `"p1"`) || strings.Contains(body, `"q1"`) || strings.Contains(body, "unreadable") {
		t.Fatalf("read_book f1 = %s", body)
	}
	lock := func(page string) string {
		_, got := send(t, "POST", s.URL+"/api/ai/perform", `{"action":"@matomezu/base:page-lock","args":{},"on":{"page":"`+page+`"}}`, writerAI(t, s.URL))
		return got
	}
	if got := lock("p1"); !strings.Contains(got, `"reason":"no-page"`) {
		t.Fatalf("perform on a moved page = %s", got)
	}
	warnings := h.Warnings()
	if !slices.ContainsFunc(warnings, func(w string) bool { return strings.Contains(w, "W032") && strings.Contains(w, "(W027 x 1, W028 x 1)") }) ||
		slices.ContainsFunc(warnings, func(w string) bool { return strings.HasPrefix(w, "W027") || strings.HasPrefix(w, "W028") }) {
		t.Fatalf("warnings = %v", warnings)
	}
	before := rowOf(h, storage.UnreadableID)
	// ふつうの書き込み（ほかのページへのアクション）のあとには移さない。テストの用意の入口でなく置いた読めないページも、そのまま
	h.mu.Lock()
	if _, _, err := h.replaceBookQuietlyForTest("f2", json.RawMessage(`{"id":"f2","title":"F2","lineup":[{"kind":"page","id":"x1","type":"@foo/stamps:board","title":"X","paper":"@matomezu/base:a4","orientation":"landscape"}]}`), 0); err != nil {
		h.mu.Unlock()
		t.Fatal(err)
	}
	h.mu.Unlock()
	if got := lock("p2"); !strings.HasPrefix(got, `{"ok":true`) {
		t.Fatalf("perform on p2 = %s", got)
	}
	if !bytes.Equal(rowOf(h, storage.UnreadableID), before) {
		t.Fatalf("the unreadable folder changed by a plain write: %s", rowOf(h, storage.UnreadableID))
	}
	// 起動し直すと、まだ在った読めない物（x1）だけが移り、移っていた物はそのまま
	s.Close()
	h.CloseAll()
	_, again := serveStore(t, path)
	if got := unreadableRefs(t, again); !slices.Equal(got, [][2]string{{"p1", "W027"}, {"q1", "W028"}, {"x1", "W027"}}) {
		t.Fatalf("the unreadable folder after starting again = %v", got)
	}
}

// 先のブックと id が重なるブック（W006）は、ブックごと移る。完全に消すと、そのブックと中の物の行は置き場所から無くなり（ほかのブックと分け合うページの行は残る）、起動し直しても戻らない
func TestAPurgedUnreadableBookDoesNotComeBack(t *testing.T) {
	path := filepath.Join(t.TempDir(), "data.db")
	store, err := storage.OpenSQLite(path)
	if err != nil {
		t.Fatal(err)
	}
	page := func(id, title string) string {
		return `{"kind":"page","id":"` + id + `","type":"@matomezu/drawing:drawing","title":"` + title + `","paper":"@matomezu/base:a4","orientation":"landscape","items":[]}`
	}
	putBook(t, store, `{"id":"b1","title":"B1","lineup":[`+page("p1", "P1")+`]}`)
	// b2 は b1 のページ p1 も持つ（同じ名前のページ 2 枚とバインダ）
	v := versionsOf(t, store)
	if err := store.Apply(storage.Batch{
		Pages: []storage.RowWrite{{ID: "p2", Body: json.RawMessage(page("p2", "P1"))}, {ID: "q1", Body: json.RawMessage(`{"kind":"page","id":"q1","type":"@matomezu/slide-book:slide","title":"Q","paper":"@matomezu/base:a4","orientation":"landscape","items":[]}`)}},
		Folders: []storage.RowWrite{
			{ID: "b2", Body: json.RawMessage(`{"folderRole":"book","id":"b2","title":"B2","lineup":[{"kind":"page","id":"p1"},{"kind":"page","id":"p2"},{"kind":"binder","id":"d1"}]}`)},
			{ID: "d1", Body: json.RawMessage(`{"folderRole":"binder","id":"d1","title":"D","pageType":"@matomezu/slide-book:slide","lineup":[{"kind":"page","id":"q1"}]}`)},
			{ID: storage.HomeID, Base: v[storage.HomeID], Body: storage.HomeBody([]json.RawMessage{storage.RefOf("book", "b1"), storage.RefOf("book", "b2")})},
		},
		Entries: []storage.EntryPut{{ID: "b2", Folder: storage.HomeID}, {ID: "p2", Folder: "b2"}, {ID: "d1", Folder: "b2"}, {ID: "q1", Folder: "d1"}},
	}); err != nil {
		t.Fatal(err)
	}
	store.Close()
	s, h := serveStore(t, path)
	if got := unreadableRefs(t, h); !slices.Equal(got, [][2]string{{"b2", "W006"}}) {
		t.Fatalf("the unreadable folder = %v", got)
	}
	if _, body := get(t, s.URL+"/api/ai/books", "secret"); strings.Contains(body, `"b2"`) {
		t.Fatalf("list_books = %s", body)
	}
	h.mu.Lock()
	done, err := h.purgeUnreadable("b2")
	notThere, _ := h.purgeUnreadable("b1")
	h.mu.Unlock()
	if err != nil || !done || notThere {
		t.Fatalf("purge = %v %v, purge b1 = %v", done, err, notThere)
	}
	for _, id := range []string{"b2", "p2", "d1", "q1"} {
		if rowOf(h, id) != nil {
			t.Fatalf("the row of %s is still there", id)
		}
	}
	if rowOf(h, "p1") == nil || len(unreadableRefs(t, h)) != 0 || slices.ContainsFunc(h.Warnings(), func(w string) bool { return strings.Contains(w, "W032") }) {
		t.Fatalf("after purging: p1 %s, unreadable %v, warnings %v", rowOf(h, "p1"), unreadableRefs(t, h), h.Warnings())
	}
	s.Close()
	h.CloseAll()
	s2, again := serveStore(t, path)
	for _, id := range []string{"b2", "p2", "d1", "q1"} {
		if rowOf(again, id) != nil {
			t.Fatalf("the row of %s came back", id)
		}
	}
	if _, body := get(t, s2.URL+"/api/ai/books/b1", "secret"); !strings.Contains(body, `"p1"`) {
		t.Fatalf("read_book b1 after starting again = %s", body)
	}
}

// 読めない物のフォルダに移ったブックと id を分け合う読めるブックを、利用者がゴミ箱から消しても、分け合うページの行は消えない（移ったブックが持ち続ける）
func TestPurgingAReadableBookKeepsThePagesAMovedBookShares(t *testing.T) {
	path := filepath.Join(t.TempDir(), "data.db")
	store, err := storage.OpenSQLite(path)
	if err != nil {
		t.Fatal(err)
	}
	page := `{"kind":"page","id":"p1","type":"@matomezu/drawing:drawing","title":"P1","paper":"@matomezu/base:a4","orientation":"landscape","items":[]}`
	putBook(t, store, `{"id":"b1","title":"B1","lineup":[`+page+`]}`)
	v := versionsOf(t, store)
	if err := store.Apply(storage.Batch{
		Folders: []storage.RowWrite{
			{ID: "b2", Body: json.RawMessage(`{"folderRole":"book","id":"b2","title":"B2","lineup":[{"kind":"page","id":"p1"}]}`)},
			{ID: storage.HomeID, Base: v[storage.HomeID], Body: storage.HomeBody([]json.RawMessage{storage.RefOf("book", "b1"), storage.RefOf("book", "b2")})},
		},
		Entries: []storage.EntryPut{{ID: "b2", Folder: storage.HomeID}},
	}); err != nil {
		t.Fatal(err)
	}
	store.Close()
	s, h := serveStore(t, path)
	if got := unreadableRefs(t, h); !slices.Equal(got, [][2]string{{"b2", "W006"}}) {
		t.Fatalf("the unreadable folder = %v", got)
	}
	// 移ったブックが分け合う行を持っていても、書庫の木の決まりは破れない（読めない物のフォルダの中の物が持つ行は数えない）
	if slices.ContainsFunc(h.Warnings(), func(l string) bool { return strings.HasPrefix(l, "W030") }) {
		t.Fatalf("the warnings have W030: %v", h.Warnings())
	}
	perform := func(action, args string) string {
		_, got := postPerform(t, s.URL, `{"action":"@matomezu/base:`+action+`","args":`+args+`,"lang":"ja","now":"2026-10-29T00:00:00.000Z"}`)
		return got
	}
	if got := perform("entry-trash", `{"entry":"b1"}`); got != `{"ok":true,"result":{}}` {
		t.Fatalf("trash = %s", got)
	}
	if got := perform("trash-empty", `{}`); got != `{"ok":true,"result":{}}` {
		t.Fatalf("empty = %s", got)
	}
	h.mu.Lock()
	place := h.places["p1"]
	h.mu.Unlock()
	if rowOf(h, "b1") != nil || rowOf(h, "p1") == nil || place != "b2" {
		t.Fatalf("after emptying the trash: b1 %s, p1 %s in %q", rowOf(h, "b1"), rowOf(h, "p1"), place)
	}
}

// アクションは、読めない物のフォルダの行と、その中の物の行を変えられない（エンジンの後ろの守り）
func TestAWriteThatTouchesTheUnreadableFolderIsRefused(t *testing.T) {
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
	for _, out := range []engine.Output{
		{Pages: []engine.RowChange{{ID: "p1", Row: json.RawMessage(`{"kind":"page","id":"p1"}`)}}},
		{Pages: []engine.RowChange{{ID: "q1", Removed: true}}},
		{Folders: []engine.RowChange{{ID: storage.UnreadableID, Row: storage.UnreadableBody(nil)}}},
	} {
		if !h.touchesUnreadable(out) {
			t.Fatalf("not refused: %+v", out)
		}
	}
	if h.touchesUnreadable(engine.Output{Pages: []engine.RowChange{{ID: "p2", Row: json.RawMessage(`{"kind":"page","id":"p2"}`)}}}) {
		t.Fatal("changing a readable page was refused")
	}
}

// 追加プラグインを外すと、そのタイプのページは読めない物のフォルダへ移り、行は 1 バイトも変わらない。足し直せば、同じ行のまま元の位置に戻る
func TestAPageComesBackWhenItsPluginIsAddedAgain(t *testing.T) {
	path := filepath.Join(t.TempDir(), "data.db")
	store, err := storage.OpenSQLite(path)
	if err != nil {
		t.Fatal(err)
	}
	if err := store.Apply(storage.Batch{Settings: &storage.UserBody{User: user, Body: json.RawMessage(`{"` + enabledPluginsSetting + `":["ex2"]}`)}}); err != nil {
		t.Fatal(err)
	}
	putBook(t, store, `{"id":"f1","title":"Flow","lineup":[`+
		`{"kind":"page","id":"p0","type":"@matomezu/drawing:drawing","title":"P0","paper":"@matomezu/base:a4","orientation":"landscape","items":[]},`+
		`{"kind":"page","id":"p1","type":"ex2:flow","title":"P1","paper":"@matomezu/base:a4","orientation":"portrait"},`+
		`{"kind":"page","id":"p2","type":"@matomezu/drawing:drawing","title":"P2","paper":"@matomezu/base:a4","orientation":"landscape","items":[]}]}`)
	store.Close()
	s, h := serveStore(t, path)
	flow := "../../test/added-plugins/ex2"
	if got := link(t, s, flow); got != `{"id":"ex2","ok":true}` {
		t.Fatalf("link = %s", got)
	}
	lineup := func() []string {
		h.mu.Lock()
		defer h.mu.Unlock()
		return slices.Clone(h.folders["f1"].entries)
	}
	if _, body := get(t, s.URL+"/api/ai/pages/p1", "secret"); !strings.Contains(body, `"book":"f1"`) || !slices.Equal(lineup(), []string{"p0", "p1", "p2"}) {
		t.Fatalf("read_page p1 = %s, f1 %v", body, lineup())
	}
	original := rowOf(h, "p1")

	if _, got := send(t, "POST", s.URL+"/api/plugins/remove", `{"id":"ex2"}`, ai); got != `{"ok":true}` {
		t.Fatalf("remove = %s", got)
	}
	if got := unreadableRefs(t, h); !slices.Equal(got, [][2]string{{"p1", "W027"}}) || !slices.Equal(lineup(), []string{"p0", "p2"}) {
		t.Fatalf("after removing ex2: unreadable %v, f1 %v", got, lineup())
	}
	if _, got := send(t, "POST", s.URL+"/api/ai/perform", `{"action":"@matomezu/base:page-lock","args":{},"on":{"page":"p2"}}`, writerAI(t, s.URL)); !strings.HasPrefix(got, `{"ok":true`) {
		t.Fatalf("page-lock on p2 = %s", got)
	}
	if !bytes.Equal(rowOf(h, "p1"), original) {
		t.Fatalf("the row of p1 changed: %s", rowOf(h, "p1"))
	}

	if got := link(t, s, flow); got != `{"id":"ex2","ok":true}` {
		t.Fatalf("link again = %s", got)
	}
	if got := unreadableRefs(t, h); len(got) != 0 || !slices.Equal(lineup(), []string{"p0", "p1", "p2"}) || !bytes.Equal(rowOf(h, "p1"), original) {
		t.Fatalf("after adding ex2 again: unreadable %v, f1 %v, p1 %s", got, lineup(), rowOf(h, "p1"))
	}
	if _, body := get(t, s.URL+"/api/ai/pages/p1", "secret"); !strings.Contains(body, `"book":"f1"`) {
		t.Fatalf("read_page p1 after adding ex2 again = %s", body)
	}
}

// 確かめる関数が開けないとしたブック（読めない物のフォルダへ移らずに書庫に残った物。ここでは、どのフォルダにも入っていないので移らない f1）は、AI に見せない:
// list_books と read_folder に出ず、read_book と read_page は無い物とし、名指したアクションは無い（no-book・no-page）で断る。warning は actions に残る
func TestAnUnreadableBookLeftInTheLibraryIsHiddenFromAI(t *testing.T) {
	store, err := storage.OpenSQLite(filepath.Join(t.TempDir(), "data.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { store.Close() })
	putBook(t, store, strings.Replace(boxed, `"p1"`, `"p9"`, 1))
	putBook(t, store, withUnreadable)
	folders, err := store.Folders()
	if err != nil {
		t.Fatal(err)
	}
	var base int64
	for _, f := range folders {
		if f.ID == storage.HomeID {
			base = f.Version
		}
	}
	alone := storage.Batch{Folders: []storage.RowWrite{{ID: storage.HomeID, Base: base, Body: storage.HomeBody([]json.RawMessage{storage.RefOf("book", "b1")})}}}
	if err := store.Apply(alone); err != nil {
		t.Fatal(err)
	}
	s, h := newServerOn(t, Options{}, store)
	if got := unreadableRefs(t, h); len(got) != 0 {
		t.Fatalf("the unreadable folder = %v", got)
	}
	if _, body := get(t, s.URL+"/api/ai/books", "secret"); strings.Contains(body, `"f1"`) || !strings.Contains(body, `"b1"`) {
		t.Fatalf("list_books = %s", body)
	}
	if code, _ := get(t, s.URL+"/api/ai/books/f1", "secret"); code != 404 {
		t.Fatalf("read_book f1 = %d", code)
	}
	if code, _ := get(t, s.URL+"/api/ai/pages/p2", "secret"); code != 404 {
		t.Fatalf("read_page p2 = %d", code)
	}
	ai := writerAI(t, s.URL)
	if _, got := send(t, "POST", s.URL+"/api/ai/perform", `{"action":"@matomezu/base:book-lock","args":{},"on":{"book":"f1"}}`, ai); !strings.Contains(got, `"reason":"no-book"`) {
		t.Fatalf("book-lock f1 = %s", got)
	}
	if _, got := send(t, "POST", s.URL+"/api/ai/perform", `{"action":"@matomezu/base:page-lock","args":{},"on":{"page":"p2"}}`, ai); !strings.Contains(got, `"reason":"no-page"`) {
		t.Fatalf("page-lock p2 = %s", got)
	}
	if !slices.ContainsFunc(h.Warnings(), func(l string) bool { return strings.HasPrefix(l, "W027") && strings.Contains(l, "f1") }) {
		t.Fatalf("the warnings = %v", h.Warnings())
	}
}

// 書庫を整えるのに失敗している間（ここでは、読めない物のフォルダの行が形に合わない）は、warning W033 を 1 つ持ち、actions に出す。整えられたら消える
func TestAFailedSettleIsAWarningUntilItSucceeds(t *testing.T) {
	store, err := storage.OpenSQLite(filepath.Join(t.TempDir(), "data.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { store.Close() })
	putBook(t, store, boxed)
	folders, err := store.Folders()
	if err != nil {
		t.Fatal(err)
	}
	var base int64
	for _, f := range folders {
		if f.ID == storage.UnreadableID {
			base = f.Version
		}
	}
	broken := json.RawMessage(`{"folderRole":"unreadable","id":"` + storage.UnreadableID + `","lineup":"bad"}`)
	if err := store.Apply(storage.Batch{Folders: []storage.RowWrite{{ID: storage.UnreadableID, Base: base, Body: broken}}}); err != nil {
		t.Fatal(err)
	}
	s, h := newServerOn(t, Options{}, store)
	failed := func() []string {
		return slices.DeleteFunc(h.Warnings(), func(l string) bool { return !strings.HasPrefix(l, "W033") })
	}
	if got := failed(); len(got) != 1 || !strings.Contains(got[0], "the unreadable folder does not fit its shape") {
		t.Fatalf("the warnings = %v", h.Warnings())
	}
	if _, body := get(t, s.URL+"/api/ai/catalog", "secret"); !strings.Contains(body, "W033") {
		t.Fatalf("actions = %s", body)
	}
	// 読めない物が書庫に残っていなければ、失敗している間も書庫が対象のアクションは通る
	if _, got := send(t, "POST", s.URL+"/api/ai/perform", `{"action":"@matomezu/base:folder-create","args":{"title":"失敗の間の所"}}`, writerAI(t, s.URL)); !strings.Contains(got, `"ok":true`) {
		t.Fatalf("folder-create while the settle fails = %s", got)
	}
	h.mu.Lock()
	whole := storage.UnreadableBody(nil)
	version := h.folders[storage.UnreadableID].version
	err = store.Apply(storage.Batch{Folders: []storage.RowWrite{{ID: storage.UnreadableID, Base: version, Body: whole}}})
	h.folders[storage.UnreadableID] = newFolderRow(whole, version+1)
	h.settleLibrary(true)
	h.mu.Unlock()
	if err != nil {
		t.Fatal(err)
	}
	if got := failed(); len(got) != 0 {
		t.Fatalf("the warning stays after the settle succeeds: %v", got)
	}
}

// 書庫を整えるのに失敗していて、読めないブック（f1）が書庫に残っている間は、書庫が対象のアクションは断られ、そのブックを名指したアクションは無い（no-book）で断る。
// warning W033 が出ている
func TestAFailedSettleWithAnUnreadableBookLeftRefusesActionsOnTheLibrary(t *testing.T) {
	store, err := storage.OpenSQLite(filepath.Join(t.TempDir(), "data.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { store.Close() })
	putBook(t, store, withUnreadable)
	v := versionsOf(t, store)
	broken := json.RawMessage(`{"folderRole":"unreadable","id":"` + storage.UnreadableID + `","lineup":"bad"}`)
	if err := store.Apply(storage.Batch{Folders: []storage.RowWrite{{ID: storage.UnreadableID, Base: v[storage.UnreadableID], Body: broken}}}); err != nil {
		t.Fatal(err)
	}
	s, h := newServerOn(t, Options{}, store)
	if !slices.ContainsFunc(h.Warnings(), func(l string) bool { return strings.HasPrefix(l, "W033") }) {
		t.Fatalf("the warnings = %v", h.Warnings())
	}
	ai := writerAI(t, s.URL)
	if _, got := send(t, "POST", s.URL+"/api/ai/perform", `{"action":"@matomezu/base:folder-create","args":{"title":"失敗の間の所"}}`, ai); !strings.Contains(got, `"reason":"refused"`) {
		t.Fatalf("folder-create = %s", got)
	}
	if _, got := send(t, "POST", s.URL+"/api/ai/perform", `{"action":"@matomezu/base:book-lock","args":{},"on":{"book":"f1"}}`, ai); !strings.Contains(got, `"reason":"no-book"`) {
		t.Fatalf("book-lock f1 = %s", got)
	}
}

// 止めた窓の［外して開く］が呼ぶ口: 画面 cookie の無い頼みは断り、ある頼みは追加プラグインを並びの順に外す（POST /api/plugins/remove と同じに、そのタイプのページは読めない物のフォルダへ移る）。
// もう足していない id は飛ばして成功にする（ほかの窓や AI が先に外していても開ける）
func TestTheScreenRemovesThePluginsItCouldNotAdd(t *testing.T) {
	path := filepath.Join(t.TempDir(), "data.db")
	store, err := storage.OpenSQLite(path)
	if err != nil {
		t.Fatal(err)
	}
	if err := store.Apply(storage.Batch{Settings: &storage.UserBody{User: user, Body: json.RawMessage(`{"` + enabledPluginsSetting + `":["ex2"]}`)}}); err != nil {
		t.Fatal(err)
	}
	putBook(t, store, `{"id":"f1","title":"Flow","lineup":[`+
		`{"kind":"page","id":"p0","type":"@matomezu/drawing:drawing","title":"P0","paper":"@matomezu/base:a4","orientation":"landscape","items":[]},`+
		`{"kind":"page","id":"p1","type":"ex2:flow","title":"P1","paper":"@matomezu/base:a4","orientation":"portrait"}]}`)
	store.Close()
	s, h := serveStore(t, path)
	if got := link(t, s, "../../test/added-plugins/ex2"); got != `{"id":"ex2","ok":true}` {
		t.Fatalf("link = %s", got)
	}
	if code, _ := send(t, "POST", s.URL+"/api/screen-plugins/remove", `{"ids":["ex2"]}`, map[string]string{"Cookie": ""}); code < 400 {
		t.Fatalf("remove without the screen cookie = %d", code)
	}
	if got := unreadableRefs(t, h); len(got) != 0 {
		t.Fatalf("the unreadable folder before removing = %v", got)
	}
	if _, got := send(t, "POST", s.URL+"/api/screen-plugins/remove", `{"ids":["ex2"]}`, nil); got != `{"ok":true}` {
		t.Fatalf("remove = %s", got)
	}
	if got := unreadableRefs(t, h); !slices.Equal(got, [][2]string{{"p1", "W027"}}) {
		t.Fatalf("after removing ex2: unreadable %v", got)
	}
	// もう足していない id は飛ばして成功にする（ほかの窓や AI が先に外した）。AI の口は今のまま断る
	if _, got := send(t, "POST", s.URL+"/api/screen-plugins/remove", `{"ids":["ex2"]}`, nil); got != `{"ok":true}` {
		t.Fatalf("remove a plugin that is not there from a screen = %s", got)
	}
	if _, got := send(t, "POST", s.URL+"/api/plugins/remove", `{"id":"ex2"}`, writerAI(t, s.URL)); !strings.Contains(got, `no plugin \"ex2\"`) {
		t.Fatalf("remove a plugin that is not there by the AI = %s", got)
	}
}

// 画面の口 if-off: 追加プラグインを無効にしたら移る物を、書かずに答える。答えた物は、そのあと設定で無効にしたときに本当に移る物と同じ
func TestTheMovesIfAPluginIsOffAreTheMovesWhenItIsTurnedOff(t *testing.T) {
	path := filepath.Join(t.TempDir(), "data.db")
	store, err := storage.OpenSQLite(path)
	if err != nil {
		t.Fatal(err)
	}
	if err := store.Apply(storage.Batch{Settings: &storage.UserBody{User: user, Body: json.RawMessage(`{"` + enabledPluginsSetting + `":["ex2"]}`)}}); err != nil {
		t.Fatal(err)
	}
	putBook(t, store, `{"id":"f1","title":"Flow","lineup":[`+
		`{"kind":"page","id":"p0","type":"@matomezu/drawing:drawing","title":"P0","paper":"@matomezu/base:a4","orientation":"landscape","items":[]},`+
		`{"kind":"page","id":"p1","type":"ex2:flow","title":"P1","paper":"@matomezu/base:a4","orientation":"portrait"},`+
		`{"kind":"page","id":"p2","type":"ex2:flow","title":"P2","paper":"@matomezu/base:a4","orientation":"portrait"}]}`)
	store.Close()
	s, h := serveStore(t, path)
	if got := link(t, s, "../../test/added-plugins/ex2"); got != `{"id":"ex2","ok":true}` {
		t.Fatalf("link = %s", got)
	}
	if code, _ := send(t, "POST", s.URL+"/api/unreadable/if-off", `{"ids":["ex2"]}`, map[string]string{"Cookie": ""}); code < 400 {
		t.Fatalf("if-off without the screen cookie = %d", code)
	}
	_, got := send(t, "POST", s.URL+"/api/unreadable/if-off", `{"ids":["ex2"]}`, nil)
	var answer struct {
		OK    bool               `json:"ok"`
		Moved []engine.MovedUnit `json:"moved"`
	}
	if err := json.Unmarshal([]byte(got), &answer); err != nil || !answer.OK {
		t.Fatalf("if-off = %s", got)
	}
	if got := unreadableRefs(t, h); len(got) != 0 {
		t.Fatalf("if-off wrote: unreadable %v", got)
	}
	postPerform(t, s.URL, `{"action":"@matomezu/base:settings-set","args":{"values":{"`+enabledPluginsSetting+`":[]}},"lang":"ja","client":"c1","seq":1}`)
	moved := unreadableRefs(t, h)
	told := make([][2]string, len(answer.Moved))
	for i, m := range answer.Moved {
		told[i] = [2]string{m.ID, m.Code}
		if m.Kind != "page" || m.Holder != "f1" || m.Type != "ex2:flow" {
			t.Fatalf("if-off told %+v", m)
		}
	}
	if len(moved) != 2 || !slices.Equal(told, moved) {
		t.Fatalf("if-off told %v, but turning ex2 off moved %v", told, moved)
	}
	// 無効になっている物は、もとから無効として数える（もう移った物は移らない）
	if _, got := send(t, "POST", s.URL+"/api/unreadable/if-off", `{"ids":["ex2"]}`, nil); got != `{"moved":[],"ok":true}` {
		t.Fatalf("if-off after turning it off = %s", got)
	}
}

// 画面の口 purge: 読めない物のフォルダの直下の物を完全に消す。直下に無い id は ok: false で、何も書かない
func TestTheScreenPurgesWhatIsRightInsideTheUnreadableFolder(t *testing.T) {
	path := filepath.Join(t.TempDir(), "data.db")
	store, err := storage.OpenSQLite(path)
	if err != nil {
		t.Fatal(err)
	}
	putBook(t, store, `{"id":"f1","title":"Flow","lineup":[`+
		`{"kind":"page","id":"p0","type":"@matomezu/drawing:drawing","title":"P0","paper":"@matomezu/base:a4","orientation":"landscape","items":[]},`+
		`{"kind":"page","id":"p1","type":"ex2:flow","title":"P1","paper":"@matomezu/base:a4","orientation":"portrait"}]}`)
	store.Close()
	s, h := serveStore(t, path)
	if got := unreadableRefs(t, h); !slices.Equal(got, [][2]string{{"p1", "W027"}}) {
		t.Fatalf("the unreadable folder = %v", got)
	}
	if code, _ := send(t, "POST", s.URL+"/api/unreadable/purge", `{"id":"p1"}`, map[string]string{"Cookie": ""}); code < 400 {
		t.Fatalf("purge without the screen cookie = %d", code)
	}
	if _, got := send(t, "POST", s.URL+"/api/unreadable/purge", `{"id":"p0"}`, nil); got != `{"ok":false,"reason":"not-inside"}` || rowOf(h, "p0") == nil {
		t.Fatalf("purge a page outside = %s, p0 %s", got, rowOf(h, "p0"))
	}
	if _, got := send(t, "POST", s.URL+"/api/unreadable/purge", `{"id":"p1"}`, nil); got != `{"ok":true}` {
		t.Fatalf("purge = %s", got)
	}
	if got := unreadableRefs(t, h); len(got) != 0 || rowOf(h, "p1") != nil {
		t.Fatalf("after purging: unreadable %v, p1 %s", got, rowOf(h, "p1"))
	}
	if _, got := send(t, "POST", s.URL+"/api/unreadable/purge", `{"id":"p1"}`, nil); got != `{"ok":false,"reason":"not-inside"}` {
		t.Fatalf("purge again = %s", got)
	}
}

// 機能台帳が変わって読めない物が移る・戻るとき、知らせ plugins に、移した物の訳ごとの数と戻した物の数と、設定の変更でそうした窓 by を添える（窓は読み直したあとに知らせる）
func TestThePluginsNoticeTellsWhatMovedAndWhatCameBack(t *testing.T) {
	path := filepath.Join(t.TempDir(), "data.db")
	store, err := storage.OpenSQLite(path)
	if err != nil {
		t.Fatal(err)
	}
	if err := store.Apply(storage.Batch{Settings: &storage.UserBody{User: user, Body: json.RawMessage(`{"` + enabledPluginsSetting + `":["ex2"]}`)}}); err != nil {
		t.Fatal(err)
	}
	putBook(t, store, `{"id":"f1","title":"Flow","lineup":[`+
		`{"kind":"page","id":"p0","type":"@matomezu/drawing:drawing","title":"P0","paper":"@matomezu/base:a4","orientation":"landscape","items":[]},`+
		`{"kind":"page","id":"p1","type":"ex2:flow","title":"P1","paper":"@matomezu/base:a4","orientation":"portrait"},`+
		`{"kind":"page","id":"p2","type":"ex2:flow","title":"P2","paper":"@matomezu/base:a4","orientation":"portrait"}]}`)
	store.Close()
	s, _ := serveStore(t, path)
	screen := listen(t, s.URL)
	next(t, screen) // hello
	// 起動のときは読めない物が移ったが、足すと戻る（設定の変更でないので by は無い）
	link(t, s, "../../test/added-plugins/ex2")
	if got := next(t, screen); got != `plugins {"returned":2,"version":1}` {
		t.Fatalf("event after adding = %s", got)
	}
	set := func(ids string, seq string) {
		postPerform(t, s.URL, `{"action":"@matomezu/base:settings-set","args":{"values":{"`+enabledPluginsSetting+`":`+ids+`}},"lang":"ja","client":"c1","seq":`+seq+`}`)
	}
	set(`[]`, "1")
	next(t, screen) // settings
	if got := next(t, screen); got != `plugins {"by":"c1","moved":[{"code":"W027","type":"ex2:flow","count":2}],"version":2}` {
		t.Fatalf("event after turning it off = %s", got)
	}
}
