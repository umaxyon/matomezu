package server

import (
	"encoding/json"
	"slices"
	"strings"
	"testing"

	"github.com/umaxyon/matomezu/internal/storage"
)

// storedPage は、置き場所から読み直したページ id の行（無ければ空）
func storedPage(t *testing.T, store storage.Storage, id string) storage.Page {
	t.Helper()
	pages, err := store.Pages()
	if err != nil {
		t.Fatal(err)
	}
	for _, p := range pages {
		if p.ID == id {
			return p
		}
	}
	return storage.Page{}
}

// storedAnnotations は、置き場所から読み直したページ id のアノテーション
func storedAnnotations(t *testing.T, store storage.Storage, id string) string {
	t.Helper()
	all, err := store.Annotations()
	if err != nil {
		t.Fatal(err)
	}
	return string(all[id])
}

// nextChanged は、窓への次の changed の知らせ（ほかの知らせは飛ばす）
func nextChanged(t *testing.T, lines <-chan string) string {
	t.Helper()
	for range 8 {
		if l := next(t, lines); strings.HasPrefix(l, "changed ") {
			return l
		}
	}
	t.Fatal("no changed")
	return ""
}

// AI は、ブックの外のページ（書庫ホームに直に在る h1）にも、page を宛先にするアクションとアノテーションのアクションを行える:
// 行が書かれ、版が進み、AI 編集チケットがそのページで開き、窓に changed が届く。利用者がそのページを直している間は being-edited で断られ、何も変わらない
// 書庫ホームの直下のページ h1 に箱 a を置いた物と、a に付けた読まれていない伝言 c-h1
const (
	outsideH1 = `{"kind":"page","id":"h1","type":"@matomezu/drawing:drawing","title":"H1","paper":"@matomezu/base:a4","orientation":"landscape","items":[` +
		`{"id":"a","x":40,"y":40,"item":"@matomezu/box:shape-nest-box","w":64,"h":64,"props":{"caption":"A","rule":true,"body":"","captionAlign":"center","bodyAlign":"left"}}]}`
	outsideH1Note = `{"id":"c-h1","annotation":"@matomezu/base:note","anchors":["a"],"props":{"text":"x","bubble":true,"addedAt":"2026-11-02T00:00:00.000Z"}}`
)

// outsidePageStore は、entriesStore の h1 を outsideH1 にし、伝言 outsideH1Note を付けた置き場所
func outsidePageStore(t *testing.T) storage.Storage {
	t.Helper()
	store := entriesStore(t)
	if err := store.Apply(storage.Batch{
		Pages:       []storage.RowWrite{{ID: "h1", Base: storedPage(t, store, "h1").Version, Body: json.RawMessage(outsideH1)}},
		Annotations: []storage.PageBody{{Page: "h1", Body: json.RawMessage(`[` + outsideH1Note + `]`)}},
	}); err != nil {
		t.Fatal(err)
	}
	return store
}

// AI の読む口は、ブックの外のページも読める: read_page はそのページをステージエントリとして、入っている書庫のフォルダ・アノテーション・形の描いた位置と大きさを答え（目次・物 1 つも）、
// AI の応えを待つ物の一覧（フック）はブックの後ろにそのページの分を並べる。バインダの中のページ・ゴミ箱の中のページは無い物として断る
func TestTheAIReadsAPageOutsideBooks(t *testing.T) {
	s, _ := newServerOn(t, Options{}, outsidePageStore(t))
	const waiting = `{"id":"c-h1","annotation":"@matomezu/base:note","anchors":["a"],"props":{"text":"x","bubble":true,"addedAt":"2026-11-02T00:00:00.000Z"},"page":"h1","awaits":true}`
	const head = `{"annotations":[` + waiting + `],"entry":{"kind":"page","id":"h1"},"folder":"library-home",`
	for path, want := range map[string]string{
		"/api/ai/pages/h1":           head + `"page":` + outsideH1 + `,"placed":[{"id":"a","x":40,"y":40,"w":64,"h":64}],"version":2}`,
		"/api/ai/pages/h1?outline=1": head + `"page":{`,
		"/api/ai/pages/h1?item=a":    head + `"item":{"id":"a",`,
		"/api/ai/pages/g1":           `{"annotations":[{"id":"c-g1","annotation":"@matomezu/note:note","anchors":[],"props":{},"page":"g1","awaits":false}],"entry":{"kind":"page","id":"g1"},"folder":"d2",`,
	} {
		if code, body := send(t, "GET", s.URL+path, "", ai); code != 200 || !strings.HasPrefix(body, want) {
			t.Fatalf("%s = %d %s; want it to begin with %s", path, code, body, want)
		}
	}
	for _, page := range []string{"n1a", "t1", "tn1", "dt1", "none"} {
		if code, body := send(t, "GET", s.URL+"/api/ai/pages/"+page, "", ai); code != 404 {
			t.Fatalf("page %s = %d %s; want 404", page, code, body)
		}
	}
	// read_folder は、応えを待つ物の在るページとブックの行に、その数を添える
	if _, got := send(t, "GET", s.URL+"/api/ai/folder", "", ai); !strings.Contains(got, `{"kind":"page","id":"h1","title":"H1","type":"@matomezu/drawing:drawing","awaiting":1}`) {
		t.Fatalf("read_folder = %s", got)
	}
	want := `{"awaiting":[{"entry":{"kind":"page","id":"h1"},"title":"H1","annotation":` + waiting + `,"brief":"x"}],`
	if _, got := send(t, "GET", s.URL+"/api/ai/awaiting", "", ai); !strings.HasPrefix(got, want) {
		t.Fatalf("awaiting = %s; want it to begin with %s", got, want)
	}
}

func TestTheAIPerformsOnAPageOutsideBooks(t *testing.T) {
	for _, c := range []struct {
		name    string
		lock    string // 窓が知らせる編集ロック（無ければ空）
		request string
		want    string // 答えの頭
		check   func(t *testing.T, store storage.Storage, hub *Hub, version int64)
	}{
		{
			name:    "page-update",
			request: `{"action":"@matomezu/base:page-update","args":{"title":"AI"},"on":{"page":"h1"}}`,
			want:    `{"ok":true`,
			check: func(t *testing.T, store storage.Storage, hub *Hub, version int64) {
				row := storedPage(t, store, "h1")
				if !strings.Contains(string(row.Body), `"title":"AI"`) || row.Version <= version || hub.PageVersion("h1") != row.Version {
					t.Fatalf("h1 = %s (version %d, hub %d); was version %d", row.Body, row.Version, hub.PageVersion("h1"), version)
				}
				if list := tickets(hub); len(list) != 1 || !slices.Equal(list[0].Unseen, []string{"h1"}) {
					t.Fatalf("tickets = %+v; want one with h1 unseen", list)
				}
			},
		},
		{
			name:    "note-read",
			request: `{"action":"@matomezu/base:note-read","args":{"note":"c-h1"},"on":{"page":"h1"}}`,
			want:    `{"ok":true`,
			check: func(t *testing.T, store storage.Storage, _ *Hub, _ int64) {
				if got := storedAnnotations(t, store, "h1"); !strings.Contains(got, `"id":"c-h1"`) || !strings.Contains(got, `"readAt":"`) {
					t.Fatalf("annotations of h1 = %s; want c-h1 read", got)
				}
			},
		},
		{
			name:    "page-update while the user edits the page",
			lock:    `{"h1":["h1"]}`,
			request: `{"action":"@matomezu/base:page-update","args":{"title":"AI"},"on":{"page":"h1"}}`,
			want:    `{"ok":false,"reason":"being-edited"}`,
			check: func(t *testing.T, store storage.Storage, hub *Hub, version int64) {
				row := storedPage(t, store, "h1")
				if !strings.Contains(string(row.Body), `"title":"H1"`) || row.Version != version || hub.PageVersion("h1") != version {
					t.Fatalf("h1 = %s (version %d, hub %d); want it unchanged at version %d", row.Body, row.Version, hub.PageVersion("h1"), version)
				}
				if list := tickets(hub); len(list) != 0 {
					t.Fatalf("tickets = %+v; want none", list)
				}
			},
		},
	} {
		t.Run(c.name, func(t *testing.T) {
			store := outsidePageStore(t)
			s, hub := newServerOn(t, Options{}, store)
			writer := writerAI(t, s.URL)
			a := listen(t, s.URL)
			next(t, a)
			if c.lock != "" {
				send(t, "POST", s.URL+"/api/view", `{"client":"c1","view":`+window+`,"editLocks":`+c.lock+`,"seq":1}`, nil)
			}
			version := hub.PageVersion("h1")
			_, got := send(t, "POST", s.URL+"/api/ai/perform", c.request, writer)
			if !strings.HasPrefix(got, c.want) {
				t.Fatalf("perform = %s; want it to begin with %s", got, c.want)
			}
			c.check(t, store, hub, version)
			if c.lock == "" {
				if l := nextChanged(t, a); !strings.Contains(l, `"h1"`) {
					t.Fatalf("changed = %s; want it to tell h1", l)
				}
			}
		})
	}
}

// AI は、どこかの窓に出ているブックの外のページをゴミ箱に入れられない（open-on-screen。隠れているブックスクリーンが開いている物も、それを中に持つフォルダごとも）。出ていなければ入れられる
func TestAICannotTrashAPageOutsideBooksOnAScreen(t *testing.T) {
	s, _ := newServerOn(t, Options{}, entriesStore(t))
	writer := writerAI(t, s.URL)
	a := listen(t, s.URL)
	next(t, a)
	on := func(page string) string {
		return `{"entry":{"kind":"page","id":"` + page + `"},"page":"` + page + `","selection":[],"stage":"s1","stages":[{"id":"s1","entry":{"kind":"page","id":"` + page + `"},"page":"` + page + `"}],"canSplit":true}`
	}
	trash := func(entry string) string {
		_, got := send(t, "POST", s.URL+"/api/ai/perform", `{"action":"@matomezu/base:entry-trash","args":{"entry":"`+entry+`"}}`, writer)
		return got
	}
	const refused = `{"ok":false,"reason":"open-on-screen"}`
	for i, c := range []struct{ view, entry string }{
		{on("h1"), "h1"},
		{`{"current":"plain-screen","hidden":` + on("h1") + `}`, "h1"},
		{on("g1"), "d2"},
	} {
		send(t, "POST", s.URL+"/api/view", `{"client":"c1","view":`+c.view+`,"focused":true,"seq":`+string(rune('1'+i))+`}`, nil)
		if got := trash(c.entry); got != refused {
			t.Fatalf("ai trash of %s under the view %s = %s; want %s", c.entry, c.view, got, refused)
		}
	}
	send(t, "POST", s.URL+"/api/view", `{"client":"c1","view":{"stage":"s1","stages":[{"id":"s1"}],"canSplit":true},"focused":true,"seq":9}`, nil)
	for _, entry := range []string{"h1", "d2"} {
		if got := trash(entry); !strings.HasPrefix(got, `{"ok":true`) {
			t.Fatalf("ai trash of %s off the screen = %s", entry, got)
		}
	}
}

// show は、ページだけの頼みを読み分ける: ブックの中のページなら、そのページを持っているブックをそのページで、ブックの外のページならそのページを出す。
// 言ったブックのページでない・無いページ・バインダの中やゴミ箱の中のページは no-page、ブックの外のページの印刷プレビューは no-print-preview、何も言わなければ no-book
func TestShowReadsAPageAlone(t *testing.T) {
	s, _ := newServerOn(t, Options{}, entriesStore(t))
	auth := writerAI(t, s.URL)
	a := listen(t, s.URL)
	next(t, a)
	send(t, "POST", s.URL+"/api/view", `{"client":"c1","view":{"stage":"s1","stages":[{"id":"s1"}],"canSplit":true},"focused":true}`, nil)
	for _, c := range []struct{ body, want string }{
		{`{"page":"h1"}`, `show {"to":"page","page":"h1"}`},
		{`{"page":"g1","stage":"s1"}`, `show {"to":"page","page":"g1","stage":"s1"}`},
		{`{"page":"h1","split":true,"mode":"edit"}`, `show {"to":"page","page":"h1","split":true}`},
		{`{"page":"p1"}`, `show {"to":"book","book":"b1","page":"p1"}`},
		{`{"page":"s1","mode":"print-preview"}`, `show {"to":"book","book":"b2","page":"s1","mode":"print-preview"}`},
		{`{"book":"b1","page":"p1"}`, `show {"to":"book","book":"b1","page":"p1"}`},
		{`{"book":"b1"}`, `show {"to":"book","book":"b1"}`},
	} {
		if _, got := send(t, "POST", s.URL+"/api/ai/show", c.body, auth); got != `{"ok":true,"opened":false}` {
			t.Fatalf("show %s = %s", c.body, got)
		}
		if got := next(t, a); got != c.want {
			t.Fatalf("show %s sent %s; want %s", c.body, got, c.want)
		}
	}
	for body, reason := range map[string]string{
		`{}`:                                   "no-book",
		`{"stage":"s1"}`:                       "no-book",
		`{"book":"b1","page":"s1"}`:            "no-page",
		`{"book":"b1","page":"h1"}`:            "no-page",
		`{"page":"none"}`:                      "no-page",
		`{"page":"n1a"}`:                       "no-page",
		`{"page":"t1"}`:                        "no-page",
		`{"page":"h1","mode":"print-preview"}`: "no-print-preview",
		`{"page":"h1","stage":"s9"}`:           "no-stage",
	} {
		if _, got := send(t, "POST", s.URL+"/api/ai/show", body, auth); !strings.Contains(got, `"reason":"`+reason+`"`) {
			t.Errorf("show %s = %s; want %s", body, got, reason)
		}
	}
}
