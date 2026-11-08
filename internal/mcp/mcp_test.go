package mcp

import (
	"bytes"
	"encoding/json"
	"errors"
	"net/http"
	"net/url"
	"strings"
	"testing"
)

// fakeAPI は常駐の代わり。posts に送られたものを覚え、perform には answer を返す
type fakeAPI struct {
	posts   []string
	gets    []string // 読む口に頼んだ道筋（問い合わせを含む）
	answer  string
	sent    []string    // 呼び出しごとに添えた参加の id
	replied http.Header // 返事に付けるヘッダ
}

const aiCatalogJSON = `{"actions":[
 {"id":"@matomezu/paper:item-place","target":"book","args":{"$schema":"x","type":"object","properties":{"page":{"type":"string"}},"required":["page"],"additionalProperties":false}},
 {"id":"@matomezu/base:book-create","target":"library","args":{"type":"object","properties":{"title":{"type":"string"}},"required":["title"]}},
 {"id":"@matomezu/base:settings-set","target":"settings","args":{"type":"object"}}],
 "items":[{"id":"@matomezu/box:shape-box","title":"Box","size":{"w":160,"h":96},"props":{"properties":{"caption":{"type":"string"}}}}]}`

func (f *fakeAPI) Get(path string, header http.Header) (json.RawMessage, http.Header, error) {
	f.sent = append(f.sent, header.Get("X-Matomezu-Participant"))
	f.gets = append(f.gets, path)
	switch path {
	case "api/ai/books?projects=default&projects=work", "api/ai/mail?projects=default":
		return json.RawMessage(`{"ok":true}`), f.replied, nil
	case "api/ai/catalog":
		return json.RawMessage(aiCatalogJSON), f.replied, nil
	case "api/ai/view":
		return json.RawMessage(`{"book":"b1","page":"p1","selection":[]}`), f.replied, nil
	}
	return nil, nil, errors.New("404 " + path)
}

func (f *fakeAPI) Post(path string, body any, header http.Header) (json.RawMessage, http.Header, error) {
	f.sent = append(f.sent, header.Get("X-Matomezu-Participant"))
	b, _ := json.Marshal(body)
	f.posts = append(f.posts, path+" "+string(b))
	return json.RawMessage(f.answer), f.replied, nil
}

// talk は頼みを 1 行ずつ送り、答えを返す
func talk(t *testing.T, api API, lines ...string) []map[string]any {
	t.Helper()
	var out bytes.Buffer
	if err := Serve(strings.NewReader(strings.Join(lines, "\n")+"\n"), &out, api, "v1", "wsl-linux"); err != nil {
		t.Fatal(err)
	}
	var answers []map[string]any
	dec := json.NewDecoder(&out)
	for dec.More() {
		var a map[string]any
		if err := dec.Decode(&a); err != nil {
			t.Fatal(err)
		}
		answers = append(answers, a)
	}
	return answers
}

func TestInitializeAnswersTheAskedVersionAndIgnoresNotifications(t *testing.T) {
	got := talk(t, &fakeAPI{},
		`{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26"}}`,
		`{"jsonrpc":"2.0","method":"notifications/initialized"}`,
		`{"jsonrpc":"2.0","id":2,"method":"nope"}`,
	)
	if len(got) != 2 {
		t.Fatalf("answers = %v", got)
	}
	r := got[0]["result"].(map[string]any)
	if r["protocolVersion"] != "2025-03-26" || r["serverInfo"].(map[string]any)["name"] != "matomezu" {
		t.Fatalf("initialize = %v", r)
	}
	if got[1]["error"].(map[string]any)["code"].(float64) != -32601 {
		t.Fatalf("unknown method = %v", got[1])
	}
}

func TestToolsDoNotDependOnTheCatalog(t *testing.T) {
	got := talk(t, &fakeAPI{}, `{"jsonrpc":"2.0","id":1,"method":"tools/list"}`)
	names := []string{}
	for _, x := range got[0]["result"].(map[string]any)["tools"].([]any) {
		names = append(names, x.(map[string]any)["name"].(string))
	}
	if strings.Join(names, ",") != "view,list_books,read_book,read_page,read_settings,read_mail,actions,show,perform,join" {
		t.Fatalf("tools = %v", names)
	}
}

func TestActionsReturnsTheAICatalog(t *testing.T) {
	got := talk(t, &fakeAPI{}, `{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"actions","arguments":{}}}`)
	if text := got[0]["result"].(map[string]any)["content"].([]any)[0].(map[string]any)["text"]; text != aiCatalogJSON {
		t.Fatalf("actions = %v", text)
	}
}

func TestPerformingAnAction(t *testing.T) {
	api := &fakeAPI{answer: `{"ok":true,"result":{"item":"k1"}}`}
	got := talk(t, api, `{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"perform","arguments":{"action":"@matomezu/paper:item-place","args":{"page":"p1"},"on":{"book":"b1"}}}}`)
	r := got[0]["result"].(map[string]any)
	if r["isError"] != false || r["content"].([]any)[0].(map[string]any)["text"] != `{"item":"k1"}` {
		t.Fatalf("call = %v", r)
	}
	if api.posts[0] != `api/ai/perform {"action":"@matomezu/paper:item-place","args":{"page":"p1"},"on":{"book":"b1"}}` {
		t.Fatalf("posted = %v", api.posts)
	}
	for answer, want := range map[string]string{`{"ok":false,"reason":"no-book"}`: "no-book:", `{"ok":false,"reason":"unknown"}`: "unknown:", `{"ok":false,"reason":"unreadable","detail":"W004 x"}`: "unreadable: the book cannot be read now (W004 x)", `{"ok":false,"reason":"denied","permission":"@matomezu/base:lock","detail":"by @matomezu/base:lock: it is locked"}`: "denied: by @matomezu/base:lock: it is locked", `{"ok":false,"reason":"not-allowed","detail":"the control center keeps the setting x fixed"}`: "not-allowed: the control center keeps the setting x fixed", `{"ok":false,"reason":"refused","detail":"the action's rules refuse it"}`: "refused: the action's rules refuse it", `{"ok":false,"reason":"not-allowed"}`: "not-allowed: it could not be done here"} {
		api.answer = answer
		got = talk(t, api, `{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"perform","arguments":{"action":"x.y","args":{}}}}`)
		r = got[0]["result"].(map[string]any)
		if r["isError"] != true || !strings.HasPrefix(r["content"].([]any)[0].(map[string]any)["text"].(string), want) {
			t.Fatalf("refused call = %v", r)
		}
	}
	// AI への知らせは、結果の次の行に添える
	api.answer = `{"ok":true,"result":{"item":"k2"},"notice":"The contents of a variable page were shifted"}`
	got = talk(t, api, `{"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"perform","arguments":{"action":"x.y","args":{}}}}`)
	if r := got[0]["result"].(map[string]any); r["isError"] != false || r["content"].([]any)[0].(map[string]any)["text"] != "{\"item\":\"k2\"}\nThe contents of a variable page were shifted" {
		t.Fatalf("call with a notice = %v", r)
	}
	got = talk(t, api, `{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"perform","arguments":{"args":{}}}}`)
	if r := got[0]["result"].(map[string]any); r["isError"] != true {
		t.Fatalf("perform without action = %v", r)
	}
}

func TestReadTools(t *testing.T) {
	got := talk(t, &fakeAPI{}, `{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"view","arguments":{}}}`)
	r := got[0]["result"].(map[string]any)
	if r["content"].([]any)[0].(map[string]any)["text"] != `{"book":"b1","page":"p1","selection":[]}` {
		t.Fatalf("view = %v", r)
	}
}

func TestShowTool(t *testing.T) {
	text := func(api *fakeAPI) (string, bool) {
		got := talk(t, api, `{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"show","arguments":{"book":"b1","split":true}}}`)
		r := got[0]["result"].(map[string]any)
		return r["content"].([]any)[0].(map[string]any)["text"].(string), r["isError"].(bool)
	}
	api := &fakeAPI{answer: `{"ok":true,"opened":false}`}
	if got, failed := text(api); got != "shown" || failed {
		t.Fatalf("show = %s %v", got, failed)
	}
	if api.posts[0] != `api/ai/show {"book":"b1","split":true}` {
		t.Fatalf("posted = %v", api.posts)
	}
	api.answer = `{"ok":false,"reason":"no-window","url":"http://127.0.0.1:7230/"}`
	if got, failed := text(api); !strings.Contains(got, "open http://127.0.0.1:7230/") || !failed {
		t.Fatalf("show without a window = %s %v", got, failed)
	}
	api.answer = `{"ok":false,"reason":"no-book"}`
	if got, failed := text(api); !strings.HasPrefix(got, "no-book: there is no book with that id") || !failed {
		t.Fatalf("show without the book = %s %v", got, failed)
	}
}

func textOf(a map[string]any) string {
	return a["result"].(map[string]any)["content"].([]any)[0].(map[string]any)["text"].(string)
}

// join は AI の名前（clientInfo の名前と版）・環境・_meta のセッション id を MCP が埋めて頼み、返った参加の id を以後の呼び出し全部に添える
func TestJoinFillsWhoAndAttachesTheParticipantToLaterCalls(t *testing.T) {
	api := &fakeAPI{answer: `{"ok":true,"participant":"p7","projects":["default"]}`}
	got := talk(t, api,
		`{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"clientInfo":{"name":"codex","version":"0.5"}}}`,
		`{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"join","arguments":{"model":"gpt-5","link":"L1","sessionName":"s","projects":["default"]},"_meta":{"sessionId":"S1"}}}`,
		`{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"view","arguments":{}}}`,
		`{"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"perform","arguments":{"action":"a.b","args":{}}}}`,
	)
	if api.posts[0] != `api/ai/join {"ai":"codex 0.5","env":"wsl-linux","link":"L1","model":"gpt-5","projects":["default"],"sessionId":"S1","sessionName":"s"}` {
		t.Fatalf("posted = %v", api.posts)
	}
	if textOf(got[1]) != `{"participant":"p7","projects":["default"]}` {
		t.Fatalf("join = %v", got[1])
	}
	if strings.Join(api.sent, ",") != ",p7,p7" { // join のときはまだ無く、以後は全部に付く
		t.Fatalf("sent = %q", api.sent)
	}
	// 弾かれたら理由を返し、参加の id は持たない
	api = &fakeAPI{answer: `{"ok":false,"reason":"already-participating","detail":"participant p1 is already joined"}`}
	got = talk(t, api, `{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"join","arguments":{"model":"m","link":"L","projects":["default"]}}}`)
	if r := got[0]["result"].(map[string]any); r["isError"] != true || textOf(got[0]) != "already-participating: participant p1 is already joined" {
		t.Fatalf("refused join = %v", got[0])
	}
}

// 返事のヘッダの知らせは、読むツールにも perform にも、本文の末尾に足す
func TestNoticeHeaderIsAddedToEveryTool(t *testing.T) {
	api := &fakeAPI{answer: `{"ok":true,"result":{"item":"k1"}}`, replied: http.Header{"X-Matomezu-Notice": {url.QueryEscape("You joined matomezu. Workroom name: ひよこ")}}}
	got := talk(t, api,
		`{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"view","arguments":{}}}`,
		`{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"perform","arguments":{"action":"a.b","args":{}}}}`,
	)
	const notice = "\nYou joined matomezu. Workroom name: ひよこ"
	if textOf(got[0]) != `{"book":"b1","page":"p1","selection":[]}`+notice || textOf(got[1]) != `{"item":"k1"}`+notice {
		t.Fatalf("answers = %v", got)
	}
}

// join は projects を必ず受ける（空は常駐に頼まず断る）
func TestJoinNeedsProjects(t *testing.T) {
	api := &fakeAPI{}
	got := talk(t, api,
		`{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"join","arguments":{"model":"m","link":"L"}}}`,
		`{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"join","arguments":{"model":"m","link":"L","projects":[]}}}`,
	)
	for _, g := range got {
		if g["result"].(map[string]any)["isError"] != true || !strings.HasPrefix(textOf(g), "join needs projects") {
			t.Fatalf("join without projects = %v", g)
		}
	}
	if len(api.posts) != 0 {
		t.Fatalf("posted = %v", api.posts)
	}
}

// list_books と read_mail は、読むプロジェクトを問い合わせにして常駐に頼む（足りなければ常駐が断る）
func TestListBooksAndReadMailAskForProjects(t *testing.T) {
	api := &fakeAPI{}
	talk(t, api,
		`{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"list_books","arguments":{"projects":["default","work"]}}}`,
		`{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"read_mail","arguments":{"projects":["default"]}}}`,
	)
	if strings.Join(api.gets, " ") != "api/ai/books?projects=default&projects=work api/ai/mail?projects=default" {
		t.Fatalf("gets = %v", api.gets)
	}
	api = &fakeAPI{}
	got := talk(t, api, `{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"list_books","arguments":{}}}`)
	if api.gets[0] != "api/ai/books?" || got[0]["result"].(map[string]any)["isError"] != true {
		t.Fatalf("without projects: gets = %v, %v", api.gets, got[0])
	}
}

// join の workroom は常駐にそのまま渡し、引き継ぎの要求を出したら takeover を返事に添える。生きている参加者の名前は、断った理由をそのまま返す
func TestJoinPassesTheWorkroomAndAnswersTakeover(t *testing.T) {
	api := &fakeAPI{answer: `{"ok":true,"participant":"p8","projects":["default"],"takeover":"ひよこ"}`}
	got := talk(t, api,
		`{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"join","arguments":{"model":"m","link":"L","workroom":"ひよこ","projects":["default"]}}}`)
	if !strings.Contains(api.posts[0], `"workroom":"ひよこ"`) || textOf(got[0]) != `{"participant":"p8","projects":["default"],"takeover":"ひよこ"}` {
		t.Fatalf("posted = %v, answered = %v", api.posts, got[0])
	}
	api = &fakeAPI{answer: `{"ok":false,"reason":"workroom-in-use","detail":"workroom ひよこ already has a participant who is alive"}`}
	got = talk(t, api,
		`{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"join","arguments":{"model":"m","link":"L","workroom":"ひよこ","projects":["default"]}}}`)
	if r := got[0]["result"].(map[string]any); r["isError"] != true || !strings.HasPrefix(textOf(got[0]), "workroom-in-use: ") {
		t.Fatalf("refused = %v", got[0])
	}
}
