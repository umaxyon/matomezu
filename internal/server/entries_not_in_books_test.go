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
		return storage.RowWrite{ID: id, Body: json.RawMessage(`{"folderRole":"binder","id":"` + id + `","title":"` + title + `","pageType":"@matomezu/drawing:drawing","lineup":[` + refs + `]}`)}
	}
	if err := store.Apply(storage.Batch{
		Pages: []storage.RowWrite{
			drawingPage("h1", "H1"), drawingPage("n1a", "A"), drawingPage("n1b", "B"), drawingPage("g1", "G1"),
			drawingPage("t1", "T1"), drawingPage("tn1", "TN1"), drawingPage("dt1", "DT1"),
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
		if err := store.PutAnnotations(page, json.RawMessage(`[{"id":"c-`+page+`","annotation":"@matomezu/note:note","anchors":[],"props":{}}]`)); err != nil {
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
		return idsOf(in.Pages), idsOf(in.Folders), slices.Sorted(maps.Keys(in.Annotations))
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
	same("folders for a list action", folders, []string{"b1", "b2", "f1", "tn", "n1", storage.HomeID, storage.TrashID, "d1", "d2", "dt"})
	same("annotations for a list action", annotated, []string{"g1", "h1", "n1b", "t1"})
}

// AI は、書庫ホームとフォルダを 1 段ずつ読める（read_folder）: 書庫ホームからの道筋と、直下のフォルダ・ブック・ページ・バインダ。読めないブックには理由が付く。
// ゴミ箱・ゴミ箱の中のフォルダ・フォルダでない物（ブック・バインダ・ページ）・無い id は、どれも同じ 404
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
	problem := hub.BookWarnings()["bx"]
	if !problem.Unreadable || problem.Warning == "" {
		t.Fatalf("the warning of bx = %+v", problem)
	}
	quoted, _ := json.Marshal(problem.Warning)
	for path, want := range map[string]string{
		"/api/ai/folder": `{"id":"library-home","kind":"home","path":[{"id":"library-home"}],"lineup":[` +
			`{"kind":"folder","id":"d1","title":"D1"},{"kind":"page","id":"h1","title":"H1","type":"@matomezu/drawing:drawing"},{"kind":"book","id":"bx","title":"X","problem":` + string(quoted) + `}]}`,
		"/api/ai/folder?folder=" + storage.HomeID: `{"id":"library-home","kind":"home","path":[{"id":"library-home"}],"lineup":[` +
			`{"kind":"folder","id":"d1","title":"D1"},{"kind":"page","id":"h1","title":"H1","type":"@matomezu/drawing:drawing"},{"kind":"book","id":"bx","title":"X","problem":` + string(quoted) + `}]}`,
		"/api/ai/folder?folder=d1": `{"id":"d1","kind":"folder","title":"D1","path":[{"id":"library-home"},{"id":"d1","title":"D1"}],"lineup":[` +
			`{"kind":"book","id":"b1","title":"T"},{"kind":"folder","id":"d2","title":"D2"},{"kind":"binder","id":"n1","title":"N1","pageType":"@matomezu/drawing:drawing"}]}`,
		"/api/ai/folder?folder=d2": `{"id":"d2","kind":"folder","title":"D2","path":[{"id":"library-home"},{"id":"d1","title":"D1"},{"id":"d2","title":"D2"}],"lineup":[` +
			`{"kind":"book","id":"b2","title":"S"},{"kind":"page","id":"g1","title":"G1","type":"@matomezu/drawing:drawing"}]}`,
	} {
		if code, body := send(t, "GET", s.URL+path, "", ai); code != 200 || body != want {
			t.Fatalf("%s = %d %s; want %s", path, code, body, want)
		}
	}
	for _, id := range []string{storage.TrashID, "dt", "b1", "f1", "n1", "tn", "h1", "t1", "none"} {
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
		"/api/ai/pages/p1":           `{"annotations":[],"book":"b1","folder":"b1",`,
		"/api/ai/pages/p1?outline=1": `{"annotations":[],"book":"b1","folder":"b1",`,
		"/api/ai/pages/s1":           `{"annotations":[],"book":"b2","folder":"f1",`,
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
