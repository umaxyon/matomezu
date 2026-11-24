package mcp

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"slices"
	"strings"
	"testing"
)

// fakeAPI は常駐の代わり。posts に送られたものを覚え、perform には answer を返す
type fakeAPI struct {
	posts   []string
	gets    []string // 読む口に頼んだ道筋（問い合わせを含む）
	answer  string
	answers []string      // あれば、post ごとに先頭から 1 つずつ answer の代わりに返す
	sent    []string      // 呼び出しごとに添えた参加の id
	headers []http.Header // 呼び出しごとに添えたヘッダ
	replied http.Header   // 返事に付けるヘッダ
}

const aiCatalogJSON = `{"actions":[
 {"id":"@matomezu/paper:item-place","target":"book","args":{"$schema":"x","type":"object","properties":{"page":{"type":"string"}},"required":["page"],"additionalProperties":false}},
 {"id":"@matomezu/base:book-create","target":"library","args":{"type":"object","properties":{"title":{"type":"string"}},"required":["title"]}},
 {"id":"@matomezu/base:settings-set","target":"settings","args":{"type":"object"}}],
 "items":[{"id":"@matomezu/box:shape-box","title":"Box","size":{"w":160,"h":96},"props":{"properties":{"caption":{"type":"string"}}}}]}`

func (f *fakeAPI) Get(path string, header http.Header) (json.RawMessage, http.Header, error) {
	f.sent = append(f.sent, header.Get("X-Matomezu-Participant"))
	f.headers = append(f.headers, header)
	f.gets = append(f.gets, path)
	if strings.HasPrefix(path, "api/ai/search?") {
		return json.RawMessage(`{"total":3,"unlisted":2,"hits":[{"kind":"k","id":"t1","part":"title","brief":"1 first [todo]","snippet":"…first…","of":{"kind":"p","id":"p1"}},{"kind":"h","id":"h1","part":"body","brief":"status: ok","snippet":"ok"}],"more":1,"next":2}`), f.replied, nil
	}
	switch path {
	case "api/ai/books":
		return json.RawMessage(`{"ok":true}`), f.replied, nil
	case "api/ai/catalog":
		return json.RawMessage(aiCatalogJSON), f.replied, nil
	case "api/ai/catalog?ids=%40matomezu%2Fpaper%3Aitem-place", "api/ai/catalog?ids=a&ids=b":
		return json.RawMessage(aiCatalogJSON), f.replied, nil
	case "api/ai/books/b1?outline=1", "api/ai/pages/p1?item=x1", "api/ai/pages/p1?outline=1":
		return json.RawMessage(`{"ok":true}`), f.replied, nil
	case "api/ai/folder", "api/ai/folder?folder=d+1":
		return json.RawMessage(`{"id":"library-home"}`), f.replied, nil
	case "api/ai/pages/small":
		return json.RawMessage(`{"page":"small"}`), f.replied, nil
	case "api/ai/pages/p1":
		return json.RawMessage(`{"page":"` + strings.Repeat("あ", maxAnswer) + `"}`), f.replied, nil
	case "api/ai/join-rules":
		return json.RawMessage(`{"rules":"Request to join from this conversation."}`), f.replied, nil
	case "api/ai/view":
		return json.RawMessage(`{"entry":{"kind":"book","id":"b1"},"page":"p1","selection":[]}`), f.replied, nil
	}
	return nil, nil, errors.New("404 " + path)
}

func (f *fakeAPI) Post(path string, body any, header http.Header) (json.RawMessage, http.Header, error) {
	f.sent = append(f.sent, header.Get("X-Matomezu-Participant"))
	f.headers = append(f.headers, header)
	b, _ := json.Marshal(body)
	f.posts = append(f.posts, path+" "+string(b))
	if len(f.answers) > 0 {
		a := f.answers[0]
		f.answers = f.answers[1:]
		return json.RawMessage(a), f.replied, nil
	}
	return json.RawMessage(f.answer), f.replied, nil
}

// talk は頼みを 1 行ずつ送り、答えを返す（ブランチは無く、AI のプログラムのプロセス id は 4242）
func talk(t *testing.T, api API, lines ...string) []map[string]any {
	t.Helper()
	return talkOn(t, api, func() string { return "" }, lines...)
}

// testMeta は、テストの MCP が _meta を読む置き場所（AI のプログラムの部品が渡す物の代わり。鍵の / は ~1 で書く）
var testMeta = Meta{Session: []string{"/x.ai~1session"}, Model: "/x-turn/model"}

// talkOn は、git のブランチを branch で読む MCP に、頼みを 1 行ずつ送り、答えを返す
func talkOn(t *testing.T, api API, branch func() string, lines ...string) []map[string]any {
	t.Helper()
	return talkAt(t, api, branch, nil, lines...)
}

// talkAt は、talkOn に、join のときに ADE のワークスペースの名前を adeWorkspace で読む MCP で
func talkAt(t *testing.T, api API, branch, adeWorkspace func() string, lines ...string) []map[string]any {
	t.Helper()
	var out bytes.Buffer
	if err := Serve(strings.NewReader(strings.Join(lines, "\n")+"\n"), &out, api, "v1", "wsl-linux", branch, adeWorkspace, "4242", "HS1", "", "", testMeta, ""); err != nil {
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

// note は、AI に渡す説明の後ろに足す（空なら説明だけ）
func TestInitializeAddsTheNoteToTheInstructions(t *testing.T) {
	for _, note := range []string{"", "Not the development server."} {
		var out bytes.Buffer
		if err := Serve(strings.NewReader(`{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}`+"\n"), &out, &fakeAPI{}, "v1", "wsl-linux", func() string { return "" }, nil, "4242", "", "", "", testMeta, note); err != nil {
			t.Fatal(err)
		}
		var a struct {
			Result struct {
				Instructions string `json:"instructions"`
			} `json:"result"`
		}
		if err := json.Unmarshal(out.Bytes(), &a); err != nil {
			t.Fatal(err)
		}
		if want := strings.TrimSpace(instructions + " " + note); a.Result.Instructions != want {
			t.Errorf("note %q: instructions = %q", note, a.Result.Instructions)
		}
	}
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
	if strings.Join(names, ",") != "view,list_books,read_folder,read_book,read_page,read_records,search,read_settings,actions,show,perform,join_rules,join,send_message,list_workrooms" {
		t.Fatalf("tools = %v", names)
	}
}

func TestJoinRulesAndRequest(t *testing.T) {
	api := &fakeAPI{answer: `{"ok":true,"participant":"p7"}`}
	// ADE のワークスペースの名前は AI が渡さず、MCP が読んで添える
	got := talkAt(t, api, func() string { return "" }, func() string { return "5.M-0167 作業" },
		`{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"join_rules","arguments":{}}}`,
		`{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"join","arguments":{"model":"unknown","link":"L1"},"_meta":{"sessionId":"S1","x-turn":{"model":"gpt-6"}}}}`,
	)
	if textOf(got[0]) != `{"rules":"Request to join from this conversation."}` || !ReadOnly("join_rules") {
		t.Fatalf("join_rules = %v", got[0])
	}
	if !slices.Equal(api.gets, []string{"api/ai/join-rules"}) || api.sent[0] != "" {
		t.Fatalf("join_rules calls = %v, participants = %v", api.gets, api.sent)
	}
	want := `api/ai/join {"adeWorkspace":"5.M-0167 作業","ai":"unknown","env":"wsl-linux","link":"L1","model":"gpt-6","sessionId":"S1","sessionName":""}`
	if !slices.Equal(api.posts, []string{want}) || textOf(got[1]) != `{"participant":"p7"}` {
		t.Fatalf("join = %v, posts = %v", got[1], api.posts)
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
	got := talk(t, api, `{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"perform","arguments":{"action":"@matomezu/paper:item-place","args":{},"on":{"page":"p1"}}}}`)
	r := got[0]["result"].(map[string]any)
	if r["isError"] != false || r["content"].([]any)[0].(map[string]any)["text"] != `{"item":"k1"}` {
		t.Fatalf("call = %v", r)
	}
	if api.posts[0] != `api/ai/perform {"action":"@matomezu/paper:item-place","args":{},"on":{"page":"p1"}}` {
		t.Fatalf("posted = %v", api.posts)
	}
	for answer, want := range map[string]string{`{"ok":false,"reason":"no-book"}`: "no-book:", `{"ok":false,"reason":"unknown"}`: "unknown:", `{"ok":false,"reason":"denied","permission":"@matomezu/base:lock","detail":"by @matomezu/base:lock: it is locked"}`: "denied: by @matomezu/base:lock: it is locked", `{"ok":false,"reason":"not-allowed","detail":"the control center keeps the setting x fixed"}`: "not-allowed: the control center keeps the setting x fixed", `{"ok":false,"reason":"refused","detail":"the action's rules refuse it"}`: "refused: the action's rules refuse it", `{"ok":false,"reason":"not-allowed"}`: "not-allowed: it could not be done here"} {
		api.answer = answer
		got = talk(t, api, `{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"perform","arguments":{"action":"x.y","args":{}}}}`)
		r = got[0]["result"].(map[string]any)
		if r["isError"] != false || !strings.HasPrefix(r["content"].([]any)[0].(map[string]any)["text"].(string), want) {
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
	if r := got[0]["result"].(map[string]any); r["isError"] != false || !strings.HasPrefix(textOf(got[0]), "bad-args: action is needed\nthe arguments of perform (JSON Schema): ") {
		t.Fatalf("perform without action = %v", r)
	}
}

// 読めないページの read_page は、理由の番号だけの 1 行で断る
func TestReadTools(t *testing.T) {
	got := talk(t, &fakeAPI{}, `{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"view","arguments":{}}}`)
	r := got[0]["result"].(map[string]any)
	if r["content"].([]any)[0].(map[string]any)["text"] != `{"entry":{"kind":"book","id":"b1"},"page":"p1","selection":[]}` {
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
	if got, failed := text(api); !strings.Contains(got, "open http://127.0.0.1:7230/") || failed {
		t.Fatalf("show without a window = %s %v", got, failed)
	}
	api.answer = `{"ok":false,"reason":"no-book"}`
	if got, failed := text(api); !strings.HasPrefix(got, "no-book: there is no book with that id") || failed {
		t.Fatalf("show without the book = %s %v", got, failed)
	}
	for reason, want := range map[string]string{"no-page": "no-page: no such page, or not a page of that book", "no-print-preview": "no-print-preview: only a book has a print preview"} {
		api.answer = `{"ok":false,"reason":"` + reason + `"}`
		if got, failed := text(api); got != want || failed {
			t.Fatalf("show refused with %s = %s %v", reason, got, failed)
		}
	}
}

func textOf(a map[string]any) string {
	return a["result"].(map[string]any)["content"].([]any)[0].(map[string]any)["text"].(string)
}

// 参加の id か、AI のプログラムが MCP を立てたときのセッション id（常駐がそれに結ばれた参加者を引く）を添える呼び出しには、呼び出しのたびに読んだブランチ（URL エンコード。空でも）を添え、
// その呼び出しの _meta の、渡された置き場所にモデルがあれば、モデルも添える（URL エンコード）。どちらも無ければ、どちらも添えない。
// AI のプログラムのプロセス id とセッション id は、join も含めていつも添える（起こす知らせの宛て先）
func TestBranchAndModelGoWithTheParticipantOrSessionAndHostAlways(t *testing.T) {
	api := &fakeAPI{answer: `{"ok":true,"participant":"p7"}`}
	branches := []string{"feat/d110", "", ""}
	read := 0
	talkOn(t, api, func() string { b := branches[read]; read++; return b },
		`{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"join","arguments":{"model":"m","link":"L1"},"_meta":{"x-turn":{"model":"gpt-6"}}}}`,
		`{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"view","arguments":{}}}`,
		`{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"view","arguments":{},"_meta":{"sessionId":"S1","x-turn":{"model":"gpt 6/luna"}}}}`,
	)
	if len(api.headers) != 3 {
		t.Fatalf("calls = %d", len(api.headers))
	}
	if h := api.headers[0]; h.Get("X-Matomezu-Participant") != "" || h.Get("X-Matomezu-Host-Session") != "HS1" {
		t.Fatalf("join without a participant = %v", h)
	}
	for i, want := range []struct{ branch, model string }{{"feat%2Fd110", "gpt-6"}, {"", ""}, {"", "gpt+6%2Fluna"}} {
		h := api.headers[i]
		if v, ok := h["X-Matomezu-Branch"]; !ok || v[0] != want.branch || h.Get("X-Matomezu-Host") != "4242" || h.Get("X-Matomezu-Model") != want.model {
			t.Fatalf("call %d = %v", i, h)
		}
	}
	bare := &fakeAPI{answer: `{"ok":true}`}
	var out bytes.Buffer
	if err := Serve(strings.NewReader(`{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"view","arguments":{}}}`+"\n"), &out, bare, "v1", "wsl-linux", func() string { return "main" }, nil, "4242", "", "", "", testMeta, ""); err != nil {
		t.Fatal(err)
	}
	if h := bare.headers[0]; len(h) != 1 || h.Get("X-Matomezu-Host") != "4242" {
		t.Fatalf("a call with neither = %v", h)
	}
}

// _meta のセッション id は sessionId（無ければ threadId、無ければ渡された置き場所を順に）、モデルは渡された置き場所から読む
func TestFromMeta(t *testing.T) {
	keys := testMeta
	for _, c := range []struct{ meta, session, model string }{
		{``, "", ""},
		{`{}`, "", ""},
		{`{"sessionId":"S1","threadId":"T1"}`, "S1", ""},
		{`{"threadId":"T1"}`, "T1", ""},
		{`{"x.ai/session":"O1"}`, "O1", ""},
		{`{"sessionId":"S1","x.ai/session":"O1"}`, "S1", ""},
		{`{"sessionId":"S1","x-turn":{"model":"gpt-6-luna","session_id":"S1"}}`, "S1", "gpt-6-luna"},
		{`{"x-turn":{"model":7}}`, "", ""},
		{`"broken"`, "", ""},
	} {
		if s, m := fromMeta(json.RawMessage(c.meta), keys); s != c.session || m != c.model {
			t.Errorf("fromMeta(%s) = %q, %q", c.meta, s, m)
		}
	}
	// 置き場所を渡さなければ、AI のプログラムごとの置き場所は読まない
	if s, m := fromMeta(json.RawMessage(`{"x.ai/session":"O1","x-turn":{"model":"m"}}`), Meta{}); s != "" || m != "" {
		t.Errorf("fromMeta without keys = %q, %q", s, m)
	}
}

// join は AI の名前（clientInfo の名前と版）・環境・_meta のセッション id を MCP が埋めて頼み、返った参加の id を以後の呼び出し全部に添える
func TestJoinFillsWhoAndAttachesTheParticipantToLaterCalls(t *testing.T) {
	api := &fakeAPI{answer: `{"ok":true,"participant":"p7"}`}
	got := talk(t, api,
		`{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"clientInfo":{"name":"codex","version":"0.5"}}}`,
		`{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"join","arguments":{"model":"gpt-5","link":"L1","sessionName":"s"},"_meta":{"sessionId":"S1"}}}`,
		`{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"view","arguments":{}}}`,
		`{"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"perform","arguments":{"action":"a.b","args":{}}}}`,
	)
	if api.posts[0] != `api/ai/join {"ai":"codex 0.5","env":"wsl-linux","link":"L1","model":"gpt-5","sessionId":"S1","sessionName":"s"}` {
		t.Fatalf("posted = %v", api.posts)
	}
	if textOf(got[1]) != `{"participant":"p7"}` {
		t.Fatalf("join = %v", got[1])
	}
	if strings.Join(api.sent, ",") != ",p7,p7" { // join のときはまだ無く、以後は全部に付く
		t.Fatalf("sent = %q", api.sent)
	}
	// 弾かれたら理由を返し、参加の id は持たない
	api = &fakeAPI{answer: `{"ok":false,"reason":"already-participating","detail":"participant p1 is already joined"}`}
	got = talk(t, api, `{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"join","arguments":{"model":"m","link":"L"}}}`)
	if r := got[0]["result"].(map[string]any); r["isError"] != false || textOf(got[0]) != "already-participating: participant p1 is already joined" {
		t.Fatalf("refused join = %v", got[0])
	}
}

// 1 つの MCP のプロセスをいくつものセッションが使い回す AI のプログラム: 参加の id は join したセッションの呼び出しにだけ付き、
// ほかのセッションの呼び出しには付かない。セッションごとに join すれば、それぞれの参加の id が付く
func TestTheParticipantGoesOnlyWithTheSessionThatJoined(t *testing.T) {
	api := &fakeAPI{answers: []string{`{"ok":true,"participant":"p1"}`, `{"ok":true,"participant":"p2"}`}}
	call := func(id int, session string) string {
		return fmt.Sprintf(`{"jsonrpc":"2.0","id":%d,"method":"tools/call","params":{"name":"view","arguments":{},"_meta":{"x.ai/session":"%s"}}}`, id, session)
	}
	join := func(id int, session string) string {
		return fmt.Sprintf(`{"jsonrpc":"2.0","id":%d,"method":"tools/call","params":{"name":"join","arguments":{"model":"m","link":"L-%s"},"_meta":{"x.ai/session":"%s"}}}`, id, session, session)
	}
	talk(t, api, join(1, "ses_A"), call(2, "ses_A"), call(3, "ses_B"), join(4, "ses_B"), call(5, "ses_B"), call(6, "ses_A"),
		`{"jsonrpc":"2.0","id":7,"method":"tools/call","params":{"name":"view","arguments":{}}}`)
	// join のときはそのセッションの参加者はまだ無い。セッション id の無い呼び出しには、参加者が 2 人なので付けない
	if strings.Join(api.sent, ",") != ",p1,,,p2,p1," {
		t.Fatalf("sent = %q", api.sent)
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
	if textOf(got[0]) != `{"entry":{"kind":"book","id":"b1"},"page":"p1","selection":[]}`+notice || textOf(got[1]) != `{"item":"k1"}`+notice {
		t.Fatalf("answers = %v", got)
	}
}

// read_records は、渡された取り方だけを常駐への問い合わせにする（値・数・値が無いという条件・件数・続き・何件かの id・載せない物の扱い）
func TestReadRecordsQueries(t *testing.T) {
	api := &fakeAPI{}
	talk(t, api,
		`{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"read_records","arguments":{"kind":"k"}}}`,
		`{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"read_records","arguments":{"kind":"k","where":{"to":"b1","order":3,"seenAt":{"is":"absent"}},"limit":5,"before":"m9"}}}`,
		`{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"read_records","arguments":{"kind":"k","ids":["m1","m2"]}}}`,
		`{"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"read_records","arguments":{"kind":"k","unlisted":"only"}}}`,
	)
	want := "api/ai/records?kind=k api/ai/records?before=m9&is.seenAt=absent&kind=k&limit=5&where.order=3&where.to=b1 api/ai/records?ids=m1&ids=m2&kind=k api/ai/records?kind=k&unlisted=only"
	if strings.Join(api.gets, " ") != want {
		t.Fatalf("gets = %v", api.gets)
	}
}

// list_workrooms は、渡された host・name・offset（整数に直す）だけを常駐への問い合わせにする
func TestListWorkroomsQueries(t *testing.T) {
	api := &fakeAPI{}
	talk(t, api,
		`{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"list_workrooms","arguments":{}}}`,
		`{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"list_workrooms","arguments":{"name":"win_note"}}}`,
		`{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"list_workrooms","arguments":{"host":"b","offset":50}}}`,
	)
	want := "api/ai/workrooms api/ai/workrooms?name=win_note api/ai/workrooms?host=b&offset=50"
	if strings.Join(api.gets, " ") != want {
		t.Fatalf("gets = %v", api.gets)
	}
}

// join の workroom は常駐にそのまま渡す。生きている参加者の名前は、断った理由をそのまま返す
func TestJoinPassesTheWorkroom(t *testing.T) {
	api := &fakeAPI{answer: `{"ok":true,"participant":"p8"}`}
	got := talk(t, api,
		`{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"join","arguments":{"model":"m","link":"L","workroom":"ひよこ"}}}`)
	if !strings.Contains(api.posts[0], `"workroom":"ひよこ"`) || textOf(got[0]) != `{"participant":"p8"}` {
		t.Fatalf("posted = %v, answered = %v", api.posts, got[0])
	}
	api = &fakeAPI{answer: `{"ok":false,"reason":"workroom-in-use","detail":"workroom ひよこ already has a participant who is alive"}`}
	got = talk(t, api,
		`{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"join","arguments":{"model":"m","link":"L","workroom":"ひよこ"}}}`)
	if r := got[0]["result"].(map[string]any); r["isError"] != false || !strings.HasPrefix(textOf(got[0]), "workroom-in-use: ") {
		t.Fatalf("refused = %v", got[0])
	}
}

// send_message は宛て先と本文を常駐に渡し、預かったら queued を、断られたら理由を返す。本文の上限は inputSchema が決める
func TestSendMessagePassesToAndText(t *testing.T) {
	api := &fakeAPI{answer: `{"ok":true,"queued":true}`}
	got := talk(t, api, `{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"send_message","arguments":{"to":"すずめ","text":"hi"}}}`)
	if len(api.posts) != 1 || !strings.Contains(api.posts[0], `"to":"すずめ"`) || !strings.Contains(api.posts[0], `"text":"hi"`) || textOf(got[0]) != `{"ok":true,"queued":true}` {
		t.Fatalf("posted = %v, answered = %v", api.posts, got[0])
	}
	api = &fakeAPI{answer: `{"ok":false,"reason":"unknown-recipient","detail":"no AI is in a workroom named x; you can send to: すずめ"}`}
	got = talk(t, api, `{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"send_message","arguments":{"to":"x","text":"hi"}}}`)
	if r := got[0]["result"].(map[string]any); r["isError"] != false || !strings.HasPrefix(textOf(got[0]), "unknown-recipient: ") {
		t.Fatalf("refused = %v", got[0])
	}
	api = &fakeAPI{}
	got = talk(t, api, `{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"send_message","arguments":{"to":"x","text":"`+strings.Repeat("a", 4001)+`"}}}`)
	if r := got[0]["result"].(map[string]any); r["isError"] != false || len(api.posts) != 0 {
		t.Fatalf("too long = %v", got[0])
	}
}

func TestActionsTakesIDsAndAsksForThoseEntries(t *testing.T) {
	api := &fakeAPI{}
	talk(t, api, `{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"actions","arguments":{"ids":["a","b"]}}}`)
	if len(api.gets) != 1 || api.gets[0] != "api/ai/catalog?ids=a&ids=b" {
		t.Fatalf("gets = %v", api.gets)
	}
}

func TestABadArgsRefusalCarriesTheActionsArgsSchema(t *testing.T) {
	api := &fakeAPI{answer: `{"ok":false,"reason":"bad-args"}`}
	got := talk(t, api, `{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"perform","arguments":{"action":"@matomezu/paper:item-place","args":{}}}}`)
	r := got[0]["result"].(map[string]any)
	text := r["content"].([]any)[0].(map[string]any)["text"].(string)
	if r["isError"] != false || !strings.HasPrefix(text, "bad-args: the args do not fit the action\nthe args of @matomezu/paper:item-place (JSON Schema): ") {
		t.Fatalf("call = %v", r)
	}
}

func TestReadBookAsksForTheOutlineAndReadPageForAnItem(t *testing.T) {
	api := &fakeAPI{}
	talk(t, api,
		`{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"read_book","arguments":{"book":"b1"}}}`,
		`{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"read_page","arguments":{"page":"p1","item":"x1"}}}`,
		`{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"read_page","arguments":{"page":"p1","outline":true}}}`,
	)
	if strings.Join(api.gets, " ") != "api/ai/books/b1?outline=1 api/ai/pages/p1?item=x1 api/ai/pages/p1?outline=1" {
		t.Fatalf("gets = %v", api.gets)
	}
}

// read_folder は、folder が無ければ書庫ホームを、あればそのフォルダを常駐に聞く（書庫ホームの id は常駐が決める）
func TestReadFolderAsksForTheLibraryHomeOrAFolder(t *testing.T) {
	api := &fakeAPI{}
	got := talk(t, api,
		`{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"read_folder","arguments":{}}}`,
		`{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"read_folder","arguments":{"folder":"d 1"}}}`,
		`{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"read_folder","arguments":{"book":"b1"}}}`,
	)
	if strings.Join(api.gets, " ") != "api/ai/folder api/ai/folder?folder=d+1" {
		t.Fatalf("gets = %v", api.gets)
	}
	if r := got[0]["result"].(map[string]any); r["isError"] != false || textOf(got[0]) != `{"id":"library-home"}` {
		t.Fatalf("read_folder = %v", r)
	}
	if r := got[2]["result"].(map[string]any); r["isError"] != false || !strings.HasPrefix(textOf(got[2]), "bad-args: ") {
		t.Fatalf("read_folder with an argument it does not take = %v", r)
	}
	if !ReadOnly("read_folder") {
		t.Fatal("read_folder is not a tool that only reads")
	}
}

func TestAPageOverTheLimitIsRefusedWithHowToNarrowIt(t *testing.T) {
	got := talk(t, &fakeAPI{},
		`{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"read_page","arguments":{"page":"p1"}}}`,
		`{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"read_page","arguments":{"page":"small"}}}`,
	)
	big := got[0]["result"].(map[string]any)
	text := big["content"].([]any)[0].(map[string]any)["text"].(string)
	if big["isError"] != false || !strings.HasPrefix(text, "too-large: ") || !strings.Contains(text, "read_page with outline") || strings.Contains(text, "あ") {
		t.Fatalf("big = %v", big)
	}
	small := got[1]["result"].(map[string]any)
	if small["isError"] != false || small["content"].([]any)[0].(map[string]any)["text"] != `{"page":"small"}` {
		t.Fatalf("small = %v", small)
	}
}

// search は言葉（OR）・種類の絞り・件数・続きを常駐に渡し、横断検索の当たり 1 つを 1 行にして、先頭に総数、切れたら残りの数と続きの offset を返す
func TestSearchAnswersOneLinePerMatch(t *testing.T) {
	api := &fakeAPI{}
	got := talk(t, api,
		`{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"search","arguments":{"terms":["a b","c"],"kinds":[{"kind":"k","where":{"lane":"todo"}}],"limit":2,"offset":1,"unlisted":"hide"}}}`,
		`{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"search","arguments":{"terms":[]}}}`,
	)
	want := "api/ai/search?kinds=%5B%7B%22kind%22%3A%22k%22%2C%22where%22%3A%7B%22lane%22%3A%22todo%22%7D%7D%5D&limit=2&offset=1&term=a+b&term=c&unlisted=hide"
	if len(api.gets) != 1 || api.gets[0] != want {
		t.Fatalf("gets = %v", api.gets)
	}
	lines := "total: 3, unlisted: 2\nk t1 | 1 first [todo] | title: …first… → p p1\nh h1 | status: ok | body: ok\n1 more. offset=2 to go on"
	if textOf(got[0]) != lines {
		t.Fatalf("answer = %q", textOf(got[0]))
	}
	if r := got[1]["result"].(map[string]any); r["isError"] != false {
		t.Fatalf("no terms = %v", got[1])
	}
}

// MCP 公開ツールの引数は inputSchema で確かめ、合わなければ常駐を呼ばずに、合わない所と受ける名前、その MCP 公開ツールの inputSchema（description を外した物）を返す
func TestArgumentsThatDoNotFitTheToolAreRefusedWithoutCallingTheHost(t *testing.T) {
	api := &fakeAPI{}
	got := talk(t, api, `{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"actions","arguments":{"id":"x"}}}`)
	want := "bad-args: actions does not take id (it takes ids)\nthe arguments of actions (JSON Schema): " + schemaText(actionsSchema)
	if r := got[0]["result"].(map[string]any); r["isError"] != false || textOf(got[0]) != want {
		t.Fatalf("actions with id = %q", textOf(got[0]))
	}
	if strings.Contains(textOf(got[0]), "description") || len(api.gets)+len(api.posts) != 0 {
		t.Fatalf("text = %q, gets = %v, posts = %v", textOf(got[0]), api.gets, api.posts)
	}
}

// checkArguments が確かめるキーワードごとに、通る値と断る値
func TestCheckArgumentsByKeyword(t *testing.T) {
	is := map[string]any{"type": "object", "properties": map[string]any{"is": map[string]any{"type": "string", "enum": []string{"absent", "present"}}}, "required": []string{"is"}, "additionalProperties": false}
	schema := map[string]any{
		"type": "object",
		"properties": map[string]any{
			"s":   map[string]any{"type": "string", "minLength": 1},
			"b":   map[string]any{"type": "boolean"},
			"n":   map[string]any{"type": "number"},
			"i":   map[string]any{"type": "integer", "minimum": 1, "maximum": 3},
			"e":   map[string]any{"type": "string", "enum": []string{"x", "y"}},
			"a":   map[string]any{"type": "array", "items": map[string]any{"type": "string"}, "minItems": 1, "maxItems": 2},
			"o":   map[string]any{"type": "object", "properties": map[string]any{"k": map[string]any{"type": "string"}}, "additionalProperties": false},
			"w":   map[string]any{"type": "object", "additionalProperties": map[string]any{"anyOf": []any{map[string]any{"type": "string"}, map[string]any{"type": "number"}, is}}},
			"any": map[string]any{"type": "object"},
		},
		"required":             []string{"s"},
		"additionalProperties": false,
	}
	for _, c := range []struct{ args, want string }{
		{`{"s":"v","b":true,"n":1.5,"i":2,"e":"x","a":["p"],"o":{"k":"v"},"w":{"k1":"v","k2":3,"k3":{"is":"absent"}},"any":{"free":1}}`, ""},
		{`{}`, "s is needed"},
		{`{"s":""}`, "s must not be empty"},
		{`{"s":1}`, "s must be a string"},
		{`{"s":"v","b":"yes"}`, "b must be true or false"},
		{`{"s":"v","n":"1"}`, "n must be a number"},
		{`{"s":"v","i":1.5}`, "i must be an integer"},
		{`{"s":"v","i":0}`, "i must be at least 1"},
		{`{"s":"v","i":4}`, "i must be at most 3"},
		{`{"s":"v","e":"z"}`, "e must be one of x, y"},
		{`{"s":"v","a":[]}`, "a must have at least 1 items"},
		{`{"s":"v","a":["p","q","r"]}`, "a must have at most 2 items"},
		{`{"s":"v","a":[1]}`, "a[0] must be a string"},
		{`{"s":"v","o":{"z":1}}`, "o does not take z (it takes k)"},
		{`{"s":"v","w":{"k":true}}`, `w.k must be a string, a number or {"is": "absent"|"present"}`},
		{`{"s":"v","zz":1}`, "t does not take zz (it takes a, any, b, e, i, n, o, s, w)"},
		{`{"zz":1}`, "s is needed; t does not take zz (it takes a, any, b, e, i, n, o, s, w)"},
	} {
		var args map[string]any
		if err := json.Unmarshal([]byte(c.args), &args); err != nil {
			t.Fatal(err)
		}
		if got := strings.Join(checkArguments("t", schema, args), "; "); got != c.want {
			t.Errorf("%s: got %q, want %q", c.args, got, c.want)
		}
	}
}

// MCP 公開ツールの inputSchema は、checkArguments が確かめるキーワードだけで書く（ほかを書くと確かめられずに通ってしまう）
func TestToolSchemasUseOnlyTheCheckedKeywords(t *testing.T) {
	var walk func(at string, schema map[string]any)
	walk = func(at string, schema map[string]any) {
		for k, v := range schema {
			if !slices.Contains(schemaKeywords, k) {
				t.Errorf("%s: %s is not checked by checkArguments", at, k)
			}
			switch k {
			case "properties":
				for name, prop := range v.(map[string]any) {
					walk(at+"."+name, prop.(map[string]any))
				}
			case "items":
				walk(at+"[]", v.(map[string]any))
			case "additionalProperties":
				if sub, ok := v.(map[string]any); ok {
					walk(at+".*", sub)
				}
			case "anyOf":
				for _, alt := range v.([]any) {
					walk(at+"|", alt.(map[string]any))
				}
			}
		}
	}
	for _, tl := range tools {
		walk(tl.name, tl.schema)
	}
}

// セッションのプロセスを名乗った MCP（Serve に pid を渡す）は、いつも（join も）その pid と範囲の印を添える。名乗らなければ添えない
func TestTheSessionPidAndSpaceGoWhenSaid(t *testing.T) {
	line := `{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"join","arguments":{"model":"m","link":"L1"}}}`
	cases := []struct {
		name, pid, space string
	}{
		{"said", "5151", "space-1"},
		{"not said", "", ""},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			api := &fakeAPI{answer: `{"ok":true,"participant":"p7"}`}
			var out bytes.Buffer
			if err := Serve(strings.NewReader(line+"\n"), &out, api, "v1", "wsl-linux", func() string { return "" }, nil, "4242", "HS1", c.pid, c.space, Meta{}, ""); err != nil {
				t.Fatal(err)
			}
			if h := api.headers[0]; h.Get("X-Matomezu-Session-Pid") != c.pid || h.Get("X-Matomezu-Session-Pid-Space") != c.space || h.Get("X-Matomezu-Host") != "4242" {
				t.Fatalf("headers = %v", h)
			}
		})
	}
}

// errAPI は、どの呼び出しにも err で答える常駐（answer があれば答えの代わりに返す）
type errAPI struct {
	err    error
	answer string
}

func (e *errAPI) Get(string, http.Header) (json.RawMessage, http.Header, error) {
	if e.err != nil {
		return nil, nil, e.err
	}
	return json.RawMessage(e.answer), nil, nil
}

func (e *errAPI) Post(path string, _ any, h http.Header) (json.RawMessage, http.Header, error) {
	return e.Get(path, h)
}

// 断り（常駐の 400・404 も）は isError にせず、常駐の文だけを返す（方法・パス・状態の行を出さない）。isError は matomezu の側の失敗（常駐のほかの状態・つながらない・答えが読めない）だけ
func TestARefusalIsNotAnErrorAndOnlyAFaultOfMatomezuIs(t *testing.T) {
	host := func(code int, status string) error {
		return &HostError{Method: "GET", Path: "api/ai/records?kind=x", Status: status, Code: code, Text: "there is no such kind or record: x"}
	}
	for _, c := range []struct {
		name  string
		api   *errAPI
		call  string
		text  string
		isErr bool
	}{
		{"host 404", &errAPI{err: host(404, "404 Not Found")}, `"read_records","arguments":{"kind":"x"}`, "there is no such kind or record: x", false},
		{"host 400", &errAPI{err: host(400, "400 Bad Request")}, `"perform","arguments":{"action":"x.y","args":{}}`, "there is no such kind or record: x", false},
		{"host 403", &errAPI{err: host(403, "403 Forbidden")}, `"read_records","arguments":{"kind":"x"}`, "GET api/ai/records?kind=x: 403 Forbidden there is no such kind or record: x", true},
		{"host 500", &errAPI{err: host(500, "500 Internal Server Error")}, `"show","arguments":{"book":"b1"}`, "GET api/ai/records?kind=x: 500 Internal Server Error there is no such kind or record: x", true},
		{"no answer", &errAPI{err: errors.New("the matomezu server did not answer")}, `"view","arguments":{}`, "the matomezu server did not answer", true},
		{"unreadable answer", &errAPI{answer: "not json"}, `"perform","arguments":{"action":"x.y","args":{}}`, "not json", true},
		{"bad args", &errAPI{}, `"read_records","arguments":{}`, "", false},
		{"unknown tool", &errAPI{}, `"nothing","arguments":{}`, "unknown tool: nothing", false},
	} {
		got := talk(t, c.api, `{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":`+c.call+`}}`)
		r := got[0]["result"].(map[string]any)
		if r["isError"] != c.isErr || (c.text != "" && textOf(got[0]) != c.text) {
			t.Fatalf("%s = %v", c.name, r)
		}
	}
}

// 常駐の答えが {"refused": 1 行} なら、その 1 行を返す（isError にしない）。ほかの答えは断りでない
func TestRefusedLineAnswersTheRefusal(t *testing.T) {
	if text, ok := refusedLine(json.RawMessage(`{"refused":"visitor: no workdesk"}`)); !ok || text != "visitor: no workdesk" {
		t.Fatalf("refused = %q %v", text, ok)
	}
	if _, ok := refusedLine(json.RawMessage(`{"id":"home","lineup":[]}`)); ok {
		t.Fatal("a folder was taken for a refusal")
	}
}
