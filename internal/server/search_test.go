package server

import (
	"encoding/json"
	"fmt"
	"net/url"
	"path/filepath"
	"slices"
	"strings"
	"testing"

	"github.com/umaxyon/matomezu/internal/engine"
	"github.com/umaxyon/matomezu/internal/storage"
)

type searchAnswer struct {
	Total    int
	Unlisted int
	Hits     []struct{ Kind, ID, Part, Brief, Snippet string }
	More     int
	Next     int
}

// AI は、チケットを横断検索で探せる: 総数・題に当たった物が上・種類の絞り・上限で切れたら残りの数と続きの offset
func TestAISearchesTickets(t *testing.T) {
	s := newServer(t, nil)
	ai := map[string]string{"Authorization": "Bearer secret"}
	const project, ticket = "@matomezu/taskboard:project", "@matomezu/taskboard:ticket"
	_, got := send(t, "GET", s.URL+"/api/ai/records?kind="+project, "", ai)
	var list struct{ Records []struct{ ID string } }
	if err := json.Unmarshal([]byte(got), &list); err != nil {
		t.Fatal(err)
	}
	p := list.Records[0].ID
	for i, name := range []string{"login page", "logout button", "other"} {
		body := fmt.Sprintf(`{"action":"@matomezu/taskboard:ticket-add","args":{"project":%q,"name":%q,"body":"the user taps %s"},"lang":"ja","ids":["t%d"],"now":"2026-11-12T00:00:00.000Z"}`, p, name, strings.ToUpper(name[:3]), i+1)
		if _, got := postPerform(t, s.URL, body); !strings.Contains(got, `"ok":true`) {
			t.Fatalf("ticket-add = %s", got)
		}
	}
	find := func(query string) searchAnswer {
		t.Helper()
		code, got := send(t, "GET", s.URL+"/api/ai/search?"+query, "", ai)
		var a searchAnswer
		if code != 200 || json.Unmarshal([]byte(got), &a) != nil {
			t.Fatalf("%s = %d %s", query, code, got)
		}
		return a
	}
	a := find("term=LOG")
	if a.Total != 2 {
		t.Fatalf("LOG = %+v", a)
	}
	a = find("term=login&term=logout")
	if a.Total != 2 || a.More != 0 || a.Hits[0].Kind != ticket || a.Hits[0].Part != "title" || !strings.Contains(a.Hits[0].Brief, "log") {
		t.Fatalf("OR = %+v", a)
	}
	// 上限で切れたら、残りの数と続きの offset
	a = find("term=login&term=logout&limit=1")
	if a.Total != 2 || len(a.Hits) != 1 || a.More != 1 || a.Next != 1 {
		t.Fatalf("limit 1 = %+v", a)
	}
	b := find("term=login&term=logout&limit=1&offset=1")
	if len(b.Hits) != 1 || b.More != 0 || b.Hits[0].ID == a.Hits[0].ID {
		t.Fatalf("offset 1 = %+v", b)
	}
	// 種類の絞り（索引キー）
	kinds := url.QueryEscape(fmt.Sprintf(`[{"kind":%q,"where":{"project":"nothing"}}]`, ticket))
	if a = find("term=login&kinds=" + kinds); a.Total != 0 {
		t.Fatalf("where nothing = %+v", a)
	}
	for _, q := range []string{"", "term=x&limit=51", "term=x&kinds=" + url.QueryEscape(`[{"kind":"nothing"}]`), "term=x&kinds=" + url.QueryEscape(fmt.Sprintf(`[{"kind":%q,"where":{"nope":"x"}}]`, ticket))} {
		if code, _ := send(t, "GET", s.URL+"/api/ai/search?"+q, "", ai); code != 400 {
			t.Fatalf("%q = %d", q, code)
		}
	}
	if code, _ := send(t, "GET", s.URL+"/api/ai/search?term=x", "", nil); code != 401 {
		t.Fatalf("no token = %d", code)
	}
}

// 起動のたびに、置いてあるレコードの探す文字を入れ直す（探す文字の無い状態から、横断検索で当たるようになる）。チケット履歴の行は本文で横断検索の当たり、親のチケットを of で指す
func TestStartingRebuildsTheSearchTexts(t *testing.T) {
	store, err := storage.OpenSQLite(filepath.Join(t.TempDir(), "data.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { store.Close() })
	const ticket, history = "@matomezu/taskboard:ticket", "@matomezu/taskboard:ticket-history"
	if err := store.Apply(storage.Batch{Records: []storage.RecordWrite{
		{Subject: ticket, ID: "t1", Body: json.RawMessage(`{"id":"t1","project":"p1","number":3,"name":"Printer","body":"toner is empty","lane":"todo","tags":[],"priority":"medium","assignees":[],"createdAt":"2026-11-12T00:00:00.000Z","createdBy":{"kind":"user"},"updatedAt":"2026-11-12T00:00:00.000Z"}`)},
		{Subject: history, ID: "h1", Body: json.RawMessage(`{"id":"h1","ticket":"t1","topic":"topic-status","text":"ordered a new cartridge","at":"2026-11-12T00:00:00.000Z","by":{"kind":"user"}}`)},
	}}); err != nil {
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
	t.Cleanup(hub.CloseAll)
	a, refusal, err := hub.Search(SearchQuery{Terms: []string{"cartridge", "toner"}})
	if err != nil || refusal != "" || a.Total != 2 {
		t.Fatalf("search = %+v, %q, %v", a, refusal, err)
	}
	byKind := map[string]string{}
	for _, h := range a.Hits {
		byKind[h.Kind] = h.ID
		if h.Kind == ticket && h.Of != nil { // 親のプロジェクトは探せる種類でないので付けない
			t.Fatalf("ticket hit has of: %+v", h)
		}
		if h.Kind == history && (h.Part != "body" || h.Of == nil || h.Of.Kind != ticket || h.Of.ID != "t1" || !strings.Contains(h.Brief, "topic-status")) {
			t.Fatalf("history hit = %+v", h)
		}
	}
	if byKind[ticket] != "t1" || byKind[history] != "h1" {
		t.Fatalf("hits = %+v", a.Hits)
	}
	for _, h := range a.Hits {
		if h.Label != "" {
			t.Fatalf("the AI side has a label: %+v", h)
		}
	}
	// 画面の口は、何に当たったかの名前を付ける（チケットは題、チケット履歴の横断検索の当たりは親のチケットの題）
	screen, _, err := hub.Search(SearchQuery{Terms: []string{"cartridge", "toner"}, Screen: true})
	if err != nil || screen.Total != 2 {
		t.Fatalf("screen = %+v, %v", screen, err)
	}
	for _, h := range screen.Hits {
		if h.Label != "3 Printer" {
			t.Fatalf("label = %+v", h)
		}
	}
	// 3 字までの数字は題の一部（番号）に当たる
	if a, _, _ := hub.Search(SearchQuery{Terms: []string{"3"}}); a.Total != 1 || a.Hits[0].Part != "title" {
		t.Fatalf("the number = %+v", a)
	}
}

// 検索は一覧と同じ考えで、完了のチケットを既定で除き、除いた数を添える（unlisted の include は含め、only は除いた物だけ）。
// チケット履歴の行は、自分は載せる載せないを決めないので、親のチケットが完了しても除かれない。画面の口は既定で含め、件数の上限が大きい
func TestSearchLeavesOutCompletedTicketsAndTheirHistory(t *testing.T) {
	s := newServer(t, nil)
	ai := map[string]string{"Authorization": "Bearer secret"}
	_, got := send(t, "GET", s.URL+"/api/ai/records?kind=@matomezu/taskboard:project", "", ai)
	var list struct{ Records []struct{ ID string } }
	if err := json.Unmarshal([]byte(got), &list); err != nil || len(list.Records) != 1 {
		t.Fatalf("projects = %s", got)
	}
	p := list.Records[0].ID
	perform := func(body string) {
		t.Helper()
		if _, got := postPerform(t, s.URL, body); !strings.Contains(got, `"ok":true`) {
			t.Fatalf("%s = %s", body, got)
		}
	}
	for i, name := range []string{"first widget", "second widget"} {
		perform(fmt.Sprintf(`{"action":"@matomezu/taskboard:ticket-add","args":{"project":%q,"name":%q},"lang":"ja","ids":["t%d"],"now":"2026-11-12T00:00:00.000Z"}`, p, name, i+1))
		perform(fmt.Sprintf(`{"action":"@matomezu/taskboard:ticket-history-add","args":{"ticket":"t%d","topic":"@matomezu/taskboard:topic-status","text":"widget note %d"},"lang":"ja","ids":["h%d"],"now":"2026-11-12T00:00:00.000Z"}`, i+1, i+1, i+1))
	}
	perform(`{"action":"@matomezu/taskboard:ticket-complete","args":{},"on":{"record":"t1"},"lang":"ja","ids":["h9"],"now":"2026-11-12T00:00:00.000Z"}`)
	find := func(path, query string) searchAnswer {
		t.Helper()
		code, got := send(t, "GET", s.URL+path+"?term=widget&"+query, "", ai)
		var a searchAnswer
		if code != 200 || json.Unmarshal([]byte(got), &a) != nil {
			t.Fatalf("%s %s = %d %s", path, query, code, got)
		}
		return a
	}
	ids := func(a searchAnswer) string {
		out := []string{}
		for _, h := range a.Hits {
			out = append(out, h.ID)
		}
		slices.Sort(out)
		return strings.Join(out, ",")
	}
	a := find("/api/ai/search", "")
	if a.Total != 3 || a.Unlisted != 1 || ids(a) != "h1,h2,t2" {
		t.Fatalf("default = %+v", a)
	}
	a = find("/api/ai/search", "unlisted=include")
	if a.Total != 4 || a.Unlisted != 0 {
		t.Fatalf("include = %+v", a)
	}
	a = find("/api/ai/search", "unlisted=only")
	if a.Total != 1 || a.Unlisted != 0 || ids(a) != "t1" {
		t.Fatalf("only = %+v", a)
	}
	if code, _ := send(t, "GET", s.URL+"/api/ai/search?term=widget&unlisted=nothing", "", ai); code != 400 {
		t.Fatalf("bad unlisted = %d", code)
	}
	if code, _ := send(t, "GET", s.URL+"/api/ai/search?term=widget&limit=51", "", ai); code != 400 {
		t.Fatalf("ai limit 51 = %d", code)
	}
	// 画面の口: 既定で含め、上限は 1000
	for query, total := range map[string]int{"term=widget": 4, "term=widget&unlisted=hide": 3, "term=widget&limit=1000": 4} {
		code, got := send(t, "GET", s.URL+"/api/search?"+query, "", nil)
		var a searchAnswer
		if code != 200 || json.Unmarshal([]byte(got), &a) != nil || a.Total != total {
			t.Fatalf("screen %s = %d %s", query, code, got)
		}
	}
	if code, _ := send(t, "GET", s.URL+"/api/search?term=widget&limit=1001", "", nil); code != 400 {
		t.Fatalf("screen limit 1001 = %d", code)
	}
}
