package server

import (
	"encoding/json"
	"maps"
	"slices"
	"strings"
	"testing"

	"github.com/umaxyon/matomezu/internal/engine"
	"github.com/umaxyon/matomezu/internal/storage"
)

// drawingPage は、図のタイプのページの行（id と名前だけが違う）
func drawingPage(id, title string) storage.RowWrite {
	return storage.RowWrite{ID: id, Body: json.RawMessage(`{"kind":"page","id":"` + id + `","type":"@matomezu/drawing:drawing","title":"` + title + `","paper":"@matomezu/base:a4","orientation":"landscape"}`)}
}

// slidePage は、バインダに入れるスライドのタイプのページの行（id と名前だけが違う）
func slidePage(id, title string) storage.RowWrite {
	return storage.RowWrite{ID: id, Body: json.RawMessage(`{"kind":"page","id":"` + id + `","type":"@matomezu/slide-page:slide","title":"` + title + `","paper":"@matomezu/base:a4","orientation":"landscape"}`)}
}

// entriesStore は、libraryStore の nested の置き場所（書庫ホーム > d1 > ブック b1 とフォルダ d2 > ブック b2）に、ブックに入っていないページとバインダを足した置き場所:
//   - 書庫ホームの直下: フォルダ d1、ページ h1
//   - d1 の直下: ブック b1、フォルダ d2、バインダ n1（ページ n1a・n1b）
//   - d2 の直下: ブック b2、ページ g1
//   - ゴミ箱の直下: ページ t1、バインダ tn（ページ tn1）、フォルダ dt（ページ dt1）
//
// アノテーションは、h1・n1b・g1・t1 に 1 つずつ
func entriesStore(t *testing.T) storage.Storage {
	t.Helper()
	store := libraryStore(t, true)
	v := versionsOf(t, store)
	ref := func(kind, id string) string { return string(storage.RefOf(kind, id)) }
	trashed := func(kind, id string) string {
		return `{"kind":"` + kind + `","id":"` + id + `","trashed":"2026-11-18T00:00:00.000Z","from":["library-home"]}`
	}
	binder := func(id, title string, pages ...string) storage.RowWrite {
		refs := ""
		for i, p := range pages {
			if i > 0 {
				refs += ","
			}
			refs += ref("page", p)
		}
		return storage.RowWrite{ID: id, Body: json.RawMessage(`{"folderRole":"binder","id":"` + id + `","title":"` + title + `","pageType":"@matomezu/slide-page:slide","lineup":[` + refs + `]}`)}
	}
	if err := store.Apply(storage.Batch{
		Pages: []storage.RowWrite{
			drawingPage("h1", "H1"), slidePage("n1a", "A"), slidePage("n1b", "B"), drawingPage("g1", "G1"),
			drawingPage("t1", "T1"), slidePage("tn1", "TN1"), drawingPage("dt1", "DT1"),
		},
		Folders: []storage.RowWrite{
			{ID: storage.HomeID, Base: v[storage.HomeID], Body: storage.HomeBody([]json.RawMessage{storage.RefOf("folder", "d1"), storage.RefOf("page", "h1")})},
			{ID: "d1", Base: v["d1"], Body: json.RawMessage(`{"folderRole":"folder","id":"d1","title":"D1","lineup":[` + ref("book", "b1") + `,` + ref("folder", "d2") + `,` + ref("binder", "n1") + `]}`)},
			{ID: "d2", Base: v["d2"], Body: json.RawMessage(`{"folderRole":"folder","id":"d2","title":"D2","lineup":[` + ref("book", "b2") + `,` + ref("page", "g1") + `]}`)},
			binder("n1", "N1", "n1a", "n1b"),
			binder("tn", "TN", "tn1"),
			{ID: "dt", Body: json.RawMessage(`{"folderRole":"folder","id":"dt","title":"DT","lineup":[` + ref("page", "dt1") + `]}`)},
			{ID: storage.TrashID, Base: v[storage.TrashID], Body: json.RawMessage(`{"folderRole":"trash","id":"library-trash","lineup":[` +
				trashed("page", "t1") + `,` + trashed("binder", "tn") + `,` + trashed("folder", "dt") + `]}`)},
		},
		Entries: []storage.EntryPut{
			{ID: "h1", Folder: storage.HomeID}, {ID: "n1", Folder: "d1"}, {ID: "n1a", Folder: "n1"}, {ID: "n1b", Folder: "n1"}, {ID: "g1", Folder: "d2"},
			{ID: "t1", Folder: storage.TrashID}, {ID: "tn", Folder: storage.TrashID}, {ID: "tn1", Folder: "tn"}, {ID: "dt", Folder: storage.TrashID}, {ID: "dt1", Folder: "dt"},
		},
	}); err != nil {
		t.Fatal(err)
	}
	for _, page := range []string{"h1", "n1b", "g1", "t1"} {
		if err := store.Apply(storage.Batch{Annotations: []storage.PageBody{{Page: page, Body: json.RawMessage(`[{"id":"c-` + page + `","annotation":"@matomezu/note:note","anchors":[],"props":{}}]`)}}}); err != nil {
			t.Fatal(err)
		}
	}
	return store
}

// idsOf は、行の並び rows の id
func idsOf(rows []json.RawMessage) []string {
	ids := []string{}
	for _, r := range rows {
		ids = append(ids, pageID(r))
	}
	return ids
}

// ブックに入っていないページとバインダの行も、エンジンへ渡る。宛先がそのページなら、そのページ（バインダの中なら、バインダと中のページの全部）と、
// そのアノテーションと、書庫ホームまでのフォルダ。ゴミ箱の中のページが宛先なら、何も渡らない。一覧のアクションなら、ゴミ箱の中の物も含めて全部
func TestRowsNotInBooksGoToTheEngine(t *testing.T) {
	_, hub := newServerOn(t, Options{}, entriesStore(t))
	hub.mu.Lock()
	defer hub.mu.Unlock()
	if hub.libraryWarning != "" {
		t.Fatalf("library warning %q", hub.libraryWarning)
	}
	for page, want := range map[string]string{"h1": "h1", "g1": "g1", "n1a": "n1", "n1b": "n1", "p1": "", "s1": "", "t1": "", "tn1": "", "dt1": "", "none": "", "n1": ""} {
		if got := hub.entryNotInBook(page); got != want {
			t.Fatalf("the entry of %s = %q; want %q", page, got, want)
		}
	}
	inputs := func(steps ...engine.BulkAction) (pages, folders, annotated []string) {
		t.Helper()
		in := engine.Input{Actions: steps}
		if err := hub.performInputs(&in); err != nil {
			t.Fatal(err)
		}
		// 用意に無いシステムフォルダ（機能台帳に合わせて足した物）の行は数えない
		folders = slices.DeleteFunc(idsOf(in.Folders), func(id string) bool {
			return strings.Contains(string(hub.folders[id].body), `"systemFolder"`)
		})
		return idsOf(in.Pages), folders, slices.Sorted(maps.Keys(in.Annotations))
	}
	update := func(page string) engine.BulkAction {
		return step("@matomezu/base:page-update", `{"title":"x"}`, &engine.On{Page: page})
	}
	same := func(name string, got, want []string) {
		t.Helper()
		if !slices.Equal(got, want) {
			t.Fatalf("%s = %v; want %v", name, got, want)
		}
	}
	pages, folders, annotated := inputs(update("h1"))
	same("pages for h1", pages, []string{"h1"})
	// 同じ書庫ホームに直に入っている隣のフォルダ d1 の行も渡る（名前の重なりを確かめるため。d1 の中は渡らない）
	same("folders for h1", folders, []string{storage.HomeID, "d1"})
	same("annotations for h1", annotated, []string{"h1"})

	pages, folders, annotated = inputs(update("n1a"))
	same("pages for n1a", pages, []string{"n1a", "n1b"})
	same("folders for n1a", folders, []string{"n1", "d1", storage.HomeID, "b1", "d2"})
	same("annotations for n1a", annotated, []string{"n1b"})

	// ブックのページと並べても、同じ行は 1 度だけ渡る
	pages, folders, annotated = inputs(update("g1"), update("p1"), update("n1b"), update("n1a"), update("g1"))
	same("pages for g1, p1 and n1", pages, []string{"p1", "g1", "n1a", "n1b"})
	same("folders for g1, p1 and n1", folders, []string{"b1", "n1", "d1", storage.HomeID, "d2", "b2"})
	same("annotations for g1, p1 and n1", annotated, []string{"g1", "n1b"})

	for _, page := range []string{"t1", "tn1", "dt1"} {
		pages, folders, annotated = inputs(update(page))
		if len(pages)+len(folders)+len(annotated) != 0 {
			t.Fatalf("for %s in the trash: pages %v, folders %v, annotations %v", page, pages, folders, annotated)
		}
	}

	pages, folders, annotated = inputs(step("@matomezu/base:book-create", `{"title":"N"}`, nil))
	same("pages for a list action", pages, []string{"p1", "s1", "h1", "t1", "tn1", "n1a", "n1b", "g1", "dt1"})
	same("folders for a list action", folders, []string{"b1", "b2", "f1", "tn", "n1", storage.HomeID, storage.TrashID, "d1", "d2", "dt", ticketsHistoryYard})
	same("annotations for a list action", annotated, []string{"g1", "h1", "n1b", "t1"})
}

// AI は、書庫ホームとフォルダを 1 段ずつ読める（read_folder）: 書庫ホームからの道筋と、直下のフォルダ・ブック・ページ・バインダ。読めないブックは読めない物のフォルダへ移り、出ない。
// ブックの外のバインダは、その id で中のページを読める。
// ゴミ箱・ゴミ箱の中のフォルダとバインダ・フォルダでない物（ブック・ブックの中のバインダ・ページ）・無い id は、どれも同じ 404
func TestTheAIReadsAFolderOneLevelDeep(t *testing.T) {
	store := entriesStore(t)
	v := versionsOf(t, store)
	if err := store.Apply(storage.Batch{
		Folders: []storage.RowWrite{
			{ID: "bx", Body: json.RawMessage(`{"folderRole":"book","id":"bx","title":"X","lineup":"bad"}`)},
			{ID: storage.HomeID, Base: v[storage.HomeID], Body: storage.HomeBody([]json.RawMessage{storage.RefOf("folder", "d1"), storage.RefOf("page", "h1"), storage.RefOf("book", "bx")})},
		},
		Entries: []storage.EntryPut{{ID: "bx", Folder: storage.HomeID}},
	}); err != nil {
		t.Fatal(err)
	}
	s, hub := newServerOn(t, Options{}, store)
	hub.mu.Lock()
	moved, docs, rooms := hub.inUnreadable("bx"), hub.folders[storage.HomeID].entries[0], hub.folders[storage.HomeID].entries[1]
	hub.mu.Unlock()
	if !moved {
		t.Fatal("the unreadable book bx is not in the unreadable folder")
	}
	home := `{"id":"library-home","kind":"home","path":[{"id":"library-home"}],"lineup":[` +
		`{"kind":"folder","id":"` + docs + `","title":"Documents","systemFolder":"@matomezu/base:documents"},` +
		`{"kind":"folder","id":"` + rooms + `","title":"Workrooms","systemFolder":"@matomezu/base:workrooms"},` +
		`{"kind":"folder","id":"d1","title":"D1"},{"kind":"page","id":"h1","title":"H1","type":"@matomezu/drawing:drawing"}]}`
	for path, want := range map[string]string{
		"/api/ai/folder": home,
		"/api/ai/folder?folder=" + storage.HomeID: home,
		"/api/ai/folder?folder=d1": `{"id":"d1","kind":"folder","title":"D1","path":[{"id":"library-home"},{"id":"d1","title":"D1"}],"lineup":[` +
			`{"kind":"book","id":"b1","title":"T"},{"kind":"folder","id":"d2","title":"D2"},{"kind":"binder","id":"n1","title":"N1","pageType":"@matomezu/slide-page:slide"}]}`,
		"/api/ai/folder?folder=d2": `{"id":"d2","kind":"folder","title":"D2","path":[{"id":"library-home"},{"id":"d1","title":"D1"},{"id":"d2","title":"D2"}],"lineup":[` +
			`{"kind":"book","id":"b2","title":"S"},{"kind":"page","id":"g1","title":"G1","type":"@matomezu/drawing:drawing"}]}`,
		"/api/ai/folder?folder=n1": `{"id":"n1","kind":"binder","title":"N1","pageType":"@matomezu/slide-page:slide","path":[{"id":"library-home"},{"id":"d1","title":"D1"},{"id":"n1","title":"N1"}],"lineup":[` +
			`{"kind":"page","id":"n1a","title":"A","type":"@matomezu/slide-page:slide"},{"kind":"page","id":"n1b","title":"B","type":"@matomezu/slide-page:slide"}]}`,
	} {
		if code, body := send(t, "GET", s.URL+path, "", ai); code != 200 || body != want {
			t.Fatalf("%s = %d %s; want %s", path, code, body, want)
		}
	}
	for _, id := range []string{storage.TrashID, storage.UnreadableID, "bx", "dt", "b1", "f1", "tn", "h1", "t1", "none"} {
		if code, body := send(t, "GET", s.URL+"/api/ai/folder?folder="+id, "", ai); code != 404 || body != "no such folder" {
			t.Fatalf("folder %s = %d %q", id, code, body)
		}
	}
	if code, _ := send(t, "GET", s.URL+"/api/ai/folder", "", nil); code == 200 {
		t.Fatal("the folder is answered without the token")
	}
}

// read_page は、ページが入っているフォルダ（ブックの直下ならブック、バインダの中ならバインダ）も答える（全文・目次・物 1 つのどれでも）。ゴミ箱の中のページは無い物として断る
func TestReadPageTellsTheFolderOfThePage(t *testing.T) {
	s, _ := newServerOn(t, Options{}, entriesStore(t))
	for path, want := range map[string]string{
		"/api/ai/pages/p1":           `{"annotations":[],"entry":{"kind":"book","id":"b1"},"folder":"b1",`,
		"/api/ai/pages/p1?outline=1": `{"annotations":[],"entry":{"kind":"book","id":"b1"},"folder":"b1",`,
		"/api/ai/pages/s1":           `{"annotations":[],"entry":{"kind":"book","id":"b2"},"folder":"f1",`,
	} {
		if code, body := send(t, "GET", s.URL+path, "", ai); code != 200 || !strings.HasPrefix(body, want) {
			t.Fatalf("%s = %d %s; want it to begin with %s", path, code, body, want)
		}
	}
	for _, page := range []string{"t1", "tn1", "dt1"} {
		if code, body := send(t, "GET", s.URL+"/api/ai/pages/"+page, "", ai); code != 404 {
			t.Fatalf("page %s in the trash = %d %s", page, code, body)
		}
	}
}

// 常駐を通して、ページをブックと書庫ホームの間で動かせる（entry-move）: 書庫ホームのページ h1 をブック b1 へ入れると、read_book の b1 に入り、
// read_folder の書庫ホームの行から消える。ブックのページ p1 を書庫ホームへ出すと、その逆
func TestAPageMovesBetweenABookAndTheHome(t *testing.T) {
	s, _ := newServerOn(t, Options{}, entriesStore(t))
	writer := writerAI(t, s.URL)
	move := func(entry, into string) {
		t.Helper()
		_, got := send(t, "POST", s.URL+"/api/ai/perform", `{"action":"@matomezu/base:entry-move","args":{"entry":"`+entry+`","into":"`+into+`"}}`, writer)
		if got != `{"ok":true,"result":{}}` {
			t.Fatalf("entry-move %s into %s = %s", entry, into, got)
		}
	}
	has := func(path, id string) bool {
		t.Helper()
		code, body := send(t, "GET", s.URL+path, "", ai)
		if code != 200 {
			t.Fatalf("%s = %d %s", path, code, body)
		}
		return strings.Contains(body, `"id":"`+id+`"`)
	}
	move("h1", "b1")
	if !has("/api/ai/books/b1", "h1") || has("/api/ai/folder", "h1") {
		t.Fatal("h1 is not in b1 after moving it out of the home")
	}
	move("p1", storage.HomeID)
	if has("/api/ai/books/b1", "p1") || !has("/api/ai/folder", "p1") {
		t.Fatal("p1 is not in the home after moving it out of b1")
	}
}

// 常駐を通して、スライドをバインダでない所へ動かして作ったバインダの行と、ページが出て空になって消えたバインダの行が、常駐に残る（entry-move）:
// d1 の外のバインダ n1 のスライド n1a を書庫ホームへ動かすと、result のバインダの行が read_folder の書庫ホームに出て、n1 には n1b だけが残る。
// 続けて n1b をそのバインダへ動かすと、空になった n1 の行が常駐から消え、d1 の並びからも外れる
func TestASlideMovedOutOfItsBinderMakesABinder(t *testing.T) {
	s, hub := newServerOn(t, Options{}, entriesStore(t))
	writer := writerAI(t, s.URL)
	move := func(entry, into string) map[string]any {
		t.Helper()
		_, got := send(t, "POST", s.URL+"/api/ai/perform", `{"action":"@matomezu/base:entry-move","args":{"entry":"`+entry+`","into":"`+into+`"}}`, writer)
		var done struct {
			OK     bool           `json:"ok"`
			Result map[string]any `json:"result"`
		}
		if err := json.Unmarshal([]byte(got), &done); err != nil || !done.OK {
			t.Fatalf("entry-move %s into %s = %s", entry, into, got)
		}
		return done.Result
	}
	folder := func(id string) string {
		t.Helper()
		code, body := send(t, "GET", s.URL+"/api/ai/folder?folder="+id, "", ai)
		if code != 200 {
			t.Fatalf("read_folder %s = %d %s", id, code, body)
		}
		return body
	}
	made := move("n1a", storage.HomeID)
	binder, _ := made["binder"].(string)
	title, _ := made["title"].(string)
	if binder == "" || title == "" {
		t.Fatalf("result = %v", made)
	}
	if row := `{"kind":"binder","id":"` + binder + `","title":"` + title + `","pageType":"@matomezu/slide-page:slide"}`; !strings.Contains(folder(storage.HomeID), row) {
		t.Fatalf("the home has no row %s: %s", row, folder(storage.HomeID))
	}
	hub.mu.Lock()
	left := hub.folders["n1"].entries
	hub.mu.Unlock()
	if len(left) != 1 || left[0] != "n1b" {
		t.Fatalf("n1 holds %v; want [n1b]", left)
	}
	if got := move("n1b", binder); len(got) != 0 {
		t.Fatalf("moving n1b into %s = %v", binder, got)
	}
	hub.mu.Lock()
	_, kept := hub.folders["n1"]
	into := hub.folders[binder].entries
	hub.mu.Unlock()
	if kept || strings.Contains(folder("d1"), `"id":"n1"`) {
		t.Fatal("n1 is still kept after it was left empty")
	}
	if len(into) != 2 || into[0] != "n1a" || into[1] != "n1b" {
		t.Fatalf("%s holds %v; want [n1a n1b]", binder, into)
	}
}

// 常駐は、バインダ・ブック・ページの行のほかのフィールド（settings）を落とさない: ブックの中のバインダを並びのエントリに組んでも、ブックの行も、
// ブックの外のバインダとページの行をエンジンへ渡すときも、本文のまま（エンジンが行を読めるかに依らないよう、書庫を整えずに表だけ読む）
func TestRowsKeepTheirSettings(t *testing.T) {
	const settings = `"settings":{"@matomezu/base:print-preview-flow":"row"}`
	store := entriesStore(t)
	v := versionsOf(t, store)
	folders, err := store.Folders()
	if err != nil {
		t.Fatal(err)
	}
	with := func(body json.RawMessage) json.RawMessage {
		return json.RawMessage(strings.TrimSuffix(string(body), "}") + "," + settings + "}")
	}
	batch := storage.Batch{Pages: []storage.RowWrite{{ID: "h1", Base: storedPage(t, store, "h1").Version, Body: with(drawingPage("h1", "H1").Body)}}}
	for _, f := range folders {
		if f.ID == "b1" || f.ID == "f1" || f.ID == "n1" {
			batch.Folders = append(batch.Folders, storage.RowWrite{ID: f.ID, Base: v[f.ID], Body: with(f.Body)})
		}
	}
	if err := store.Apply(batch); err != nil {
		t.Fatal(err)
	}
	eng, err := engine.New()
	if err != nil {
		t.Fatal(err)
	}
	annotations, err := store.Annotations()
	if err != nil {
		t.Fatal(err)
	}
	hub := &Hub{store: store, engine: eng, annotations: annotations}
	if err := hub.loadTables(); err != nil {
		t.Fatal(err)
	}
	b1, b2 := string(hub.books["b1"].body), string(hub.books["b2"].body)
	if !strings.HasPrefix(b1, `{"id":"b1",`) || strings.Count(b1, settings) != 1 {
		t.Fatalf("book b1 = %s; want its settings", b1)
	}
	if !strings.Contains(b2, `{"id":"f1","kind":"binder","lineup":[`) || !strings.Contains(b2, `],"pageType":"@matomezu/slide-page:slide",`+settings+`,"title":"スライド"}`) {
		t.Fatalf("book b2 = %s; want the binder f1 with its settings", b2)
	}
	in := engine.Input{Actions: []engine.BulkAction{step("@matomezu/base:book-create", `{"title":"N"}`, nil)}}
	if err := hub.performInputs(&in); err != nil {
		t.Fatal(err)
	}
	rows := map[string]string{}
	for _, list := range [][]json.RawMessage{in.Pages, in.Folders} {
		for i, id := range idsOf(list) {
			rows[id] = string(list[i])
		}
	}
	for _, id := range []string{"h1", "n1", "b1", "f1"} {
		body := hub.pages[id].body
		if f, ok := hub.folders[id]; ok {
			body = f.body
		}
		if rows[id] != string(body) || !strings.Contains(rows[id], settings) {
			t.Fatalf("the row %s to the engine = %s; want it with its settings", id, rows[id])
		}
	}
}
