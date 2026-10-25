package mcp

import (
	"bytes"
	"encoding/json"
	"errors"
	"strings"
	"testing"
)

// fakeAPI は常駐の代わり。posts に送られたものを覚え、perform には answer を返す
type fakeAPI struct {
	posts  []string
	answer string
}

const aiCatalogJSON = `{"actions":[
 {"id":"item.place","target":"book","args":{"$schema":"x","type":"object","properties":{"page":{"type":"string"}},"required":["page"],"additionalProperties":false}},
 {"id":"book.create","target":"library","args":{"type":"object","properties":{"title":{"type":"string"}},"required":["title"]}},
 {"id":"settings.lang","target":"settings","args":{"type":"object"}}],
 "items":[{"id":"shape.box","title":"Box","size":{"w":160,"h":96},"props":{"properties":{"caption":{"type":"string"}}}}]}`

func (f *fakeAPI) Get(path string) (json.RawMessage, error) {
	switch path {
	case "api/ai/catalog":
		return json.RawMessage(aiCatalogJSON), nil
	case "api/ai/view":
		return json.RawMessage(`{"book":"b1","page":"p1","selection":[]}`), nil
	}
	return nil, errors.New("404 " + path)
}

func (f *fakeAPI) Post(path string, body any) (json.RawMessage, error) {
	b, _ := json.Marshal(body)
	f.posts = append(f.posts, path+" "+string(b))
	return json.RawMessage(f.answer), nil
}

// talk は頼みを 1 行ずつ送り、答えを返す
func talk(t *testing.T, api API, lines ...string) []map[string]any {
	t.Helper()
	var out bytes.Buffer
	if err := Serve(strings.NewReader(strings.Join(lines, "\n")+"\n"), &out, api, "v1"); err != nil {
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

func TestToolsAreTheListedActionsWithBookAdded(t *testing.T) {
	got := talk(t, &fakeAPI{}, `{"jsonrpc":"2.0","id":1,"method":"tools/list"}`)
	tools := got[0]["result"].(map[string]any)["tools"].([]any)
	names := []string{}
	var place map[string]any
	for _, x := range tools {
		tool := x.(map[string]any)
		names = append(names, tool["name"].(string))
		if tool["name"] == "place_item" {
			place = tool
		}
	}
	if strings.Join(names, ",") != "view,list_books,read_book,show,create_book,place_item" {
		t.Fatalf("tools = %v (settings.lang is not listed, actions missing from the ai catalog are left out)", names)
	}
	schema := place["inputSchema"].(map[string]any)
	if _, ok := schema["$schema"]; ok {
		t.Fatal("$schema is left in")
	}
	if req := schema["required"].([]any); req[0] != "book" || req[1] != "page" {
		t.Fatalf("required = %v", req)
	}
	if !strings.Contains(place["description"].(string), `shape.box (Box, default size {"h":96,"w":160}) props {"caption"`) {
		t.Fatalf("description = %s", place["description"])
	}
}

func TestCallingAnActionTool(t *testing.T) {
	api := &fakeAPI{answer: `{"ok":true,"result":{"item":"k1"}}`}
	got := talk(t, api, `{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"place_item","arguments":{"book":"b1","page":"p1"}}}`)
	r := got[0]["result"].(map[string]any)
	if r["isError"] != false || r["content"].([]any)[0].(map[string]any)["text"] != `{"item":"k1"}` {
		t.Fatalf("call = %v", r)
	}
	if api.posts[0] != `api/ai/perform {"action":"item.place","args":{"page":"p1"},"on":{"book":"b1"}}` {
		t.Fatalf("posted = %v", api.posts)
	}
	api.answer = `{"ok":false,"reason":"no-book"}`
	got = talk(t, api, `{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"place_item","arguments":{"book":"b9","page":"p1"}}}`)
	r = got[0]["result"].(map[string]any)
	if r["isError"] != true || !strings.HasPrefix(r["content"].([]any)[0].(map[string]any)["text"].(string), "no-book:") {
		t.Fatalf("refused call = %v", r)
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
}
