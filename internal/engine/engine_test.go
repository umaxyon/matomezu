package engine

import (
	"encoding/json"
	"fmt"
	"regexp"
	"strings"
	"testing"

	"github.com/umaxyon/matomezu/internal/plugin"
)

const book = `{"type":"@matomezu/drawing:drawing","id":"b1","title":"T","pages":[{"id":"p1","title":"P","paper":"@matomezu/base:a4","orientation":"landscape"}]}`

func newEngine(t *testing.T) *Engine {
	t.Helper()
	e, err := New()
	if err != nil {
		t.Fatal(err)
	}
	return e
}

func place(ids ...string) Input {
	return Input{
		Action: "@matomezu/paper:item-place",
		Args:   json.RawMessage(`{"page":"p1","item":"@matomezu/box:shape-box","at":{"x":10,"y":20},"props":{"caption":"c"}}`),
		On:     &On{Book: "b1"},
		Lang:   "ja",
		IDs:    ids,
		Books:  []json.RawMessage{json.RawMessage(book)},
	}
}

func TestPerformsTheSameActionAsTheScreen(t *testing.T) {
	e := newEngine(t)
	out, err := e.Perform(place("abc-123"))
	if err != nil || !out.OK {
		t.Fatalf("Perform = %+v, %v", out, err)
	}
	if string(out.Result) != `{"item":"abc123"}` || len(out.Books) != 1 || !strings.Contains(string(out.Books[0]), `"id":"abc123","x":10,"y":20,"item":"@matomezu/box:shape-box"`) {
		t.Fatalf("out = %s %s", out.Result, out.Books)
	}
	again, _ := e.Perform(place("abc-123"))
	if string(again.Books[0]) != string(out.Books[0]) {
		t.Fatalf("the same input gave another book:\n%s\n%s", again.Books[0], out.Books[0])
	}
}

func TestMakesIdsWhenNoneAreGiven(t *testing.T) {
	out, err := newEngine(t).Perform(place())
	if err != nil || !out.OK || !regexp.MustCompile(`^\{"item":"[0-9a-f]{10}"\}$`).Match(out.Result) {
		t.Fatalf("Perform = %+v, %v", out, err)
	}
}

func TestRefusals(t *testing.T) {
	e := newEngine(t)
	cases := map[string]Input{
		"unknown":  {Action: "nope", Lang: "ja"},
		"no-book":  {Action: "@matomezu/paper:item-place", Args: place().Args, On: &On{Book: "b9"}, Lang: "ja", Books: place().Books},
		"bad-args": {Action: "@matomezu/paper:item-place", Args: json.RawMessage(`{}`), On: &On{Book: "b1"}, Lang: "ja", Books: place().Books},
	}
	for want, in := range cases {
		out, err := e.Perform(in)
		if err != nil || out.OK || out.Reason != want {
			t.Errorf("%s: %+v, %v", want, out, err)
		}
	}
}

func TestLibraryAndSettingsActions(t *testing.T) {
	e := newEngine(t)
	out, err := e.Perform(Input{
		Action: "@matomezu/base:book-create",
		Args:   json.RawMessage(`{"title":"New","type":"@matomezu/drawing:drawing"}`),
		Lang:   "ja",
		IDs:    []string{"nb"},
		Books:  []json.RawMessage{json.RawMessage(book)},
	})
	if err != nil || !out.OK || len(out.Books) != 1 || string(out.Books[0]) != `{"type":"@matomezu/drawing:drawing","id":"nb","title":"New","pages":[]}` {
		t.Fatalf("@matomezu/base:book-create = %+v %s, %v", out, out.Books, err)
	}
	out, err = e.Perform(Input{Action: "@matomezu/base:settings-lang", Args: json.RawMessage(`{"lang":"en"}`), Lang: "ja", Settings: json.RawMessage(`{"lang":"ja"}`)})
	if err != nil || !out.OK || !strings.Contains(string(out.Settings), `"lang":"en"`) {
		t.Fatalf("@matomezu/base:settings-lang = %+v %s, %v", out, out.Settings, err)
	}
}

func TestAICatalogDescribesActionsAndItems(t *testing.T) {
	var c struct {
		Actions []struct {
			ID          string          `json:"id"`
			Target      string          `json:"target"`
			Description string          `json:"description"`
			Args        json.RawMessage `json:"args"`
		} `json:"actions"`
		Items []struct {
			ID    string          `json:"id"`
			Props json.RawMessage `json:"props"`
		} `json:"items"`
		Languages []string `json:"languages"`
		Skins     []string `json:"skins"`
	}
	if err := json.Unmarshal(newEngine(t).AICatalog(), &c); err != nil {
		t.Fatal(err)
	}
	found := false
	for _, a := range c.Actions {
		if a.Description == "" {
			t.Errorf("%s has no description for the AI", a.ID)
		}
		if a.ID == "@matomezu/paper:item-place" {
			found = a.Target == "book" && strings.Contains(string(a.Args), `"page"`) && strings.Contains(string(a.Args), `"required"`)
		}
	}
	if !found || len(c.Items) == 0 || !strings.Contains(string(c.Items[0].Props), `"caption"`) ||
		strings.Join(c.Languages, ",") != "en,ja" || strings.Join(c.Skins, ",") != "@matomezu/base:dark,@matomezu/base:light" {
		t.Fatalf("ai catalog = %s", newEngine(t).AICatalog())
	}
}

func TestAICatalogDescribesBookTypesAndItemKinds(t *testing.T) {
	var c struct {
		BookTypes []struct {
			ID        string   `json:"id"`
			Creatable bool     `json:"creatable"`
			Pages     bool     `json:"pages"`
			Items     []string `json:"items"`
		} `json:"bookTypes"`
		Items []struct {
			ID   string `json:"id"`
			Kind string `json:"kind"`
		} `json:"items"`
	}
	if err := json.Unmarshal(newEngine(t).AICatalog(), &c); err != nil {
		t.Fatal(err)
	}
	types := map[string]string{}
	for _, b := range c.BookTypes {
		types[b.ID] = fmt.Sprint(b.Creatable, " ", b.Pages, " ", strings.Join(b.Items, ","))
	}
	kinds := map[string]string{}
	for _, i := range c.Items {
		kinds[i.ID] = i.Kind
	}
	if !strings.HasPrefix(types["@matomezu/drawing:drawing"], "true true ") || !strings.Contains(types["@matomezu/drawing:drawing"], "@matomezu/box:shape-box") ||
		!strings.HasPrefix(types["@matomezu/master:master"], "false ") || kinds["@matomezu/box:shape-box"] != "shape" || kinds["@matomezu/line:connector-line"] != "connector" {
		t.Fatalf("book types = %v, item kinds = %v", types, kinds)
	}
}

func TestAICatalogDescribesListRows(t *testing.T) {
	var c struct {
		Actions []struct {
			ID   string          `json:"id"`
			Args json.RawMessage `json:"args"`
		} `json:"actions"`
	}
	if err := json.Unmarshal(newEngine(t).AICatalog(), &c); err != nil {
		t.Fatal(err)
	}
	args := map[string]string{}
	for _, a := range c.Actions {
		args[a.ID] = string(a.Args)
	}
	for _, id := range []string{"@matomezu/list:row-add", "@matomezu/list:row-update", "@matomezu/list:row-remove", "@matomezu/list:row-check", "@matomezu/list:row-lines"} {
		if args[id] == "" {
			t.Fatalf("%s is not in the ai catalog", id)
		}
	}
	for _, field := range []string{`"caption"`, `"rule"`, `"bodyAlign"`} {
		if !strings.Contains(args["@matomezu/list:row-add"], field) || !strings.Contains(args["@matomezu/list:row-update"], field) {
			t.Fatalf("row props lack %s: %s", field, args["@matomezu/list:row-add"])
		}
	}
}

// 線の道筋の計算（route）を通るアクションも、画面と同じに行える: つないだ箱が近ければどけ、手で直した区間が引けるかを確かめる
func TestConnectsItemsWithALine(t *testing.T) {
	e := newEngine(t)
	two := `{"type":"@matomezu/drawing:drawing","id":"b1","title":"T","pages":[{"id":"p1","title":"P","paper":"@matomezu/base:a4","orientation":"landscape","items":[` +
		`{"id":"a","x":100,"y":100,"item":"@matomezu/box:shape-box","w":100,"h":64,"props":{}},` +
		`{"id":"b","x":400,"y":300,"item":"@matomezu/box:shape-box","w":100,"h":64,"props":{}}]}]}`
	out, err := e.Perform(Input{
		Action: "@matomezu/line:line-connect",
		Args:   json.RawMessage(`{"page":"p1","from":"a","to":"b","props":{"exitAt":0.4024,"enterAt":0.9024,"via":[300]}}`),
		On:     &On{Book: "b1"},
		Lang:   "ja",
		IDs:    []string{"l1"},
		Books:  []json.RawMessage{json.RawMessage(two)},
	})
	if err != nil || !out.OK || string(out.Result) != `{"line":"l1"}` {
		t.Fatalf("Perform = %+v, %v", out, err)
	}
	if !strings.Contains(string(out.Books[0]), `{"id":"l1","item":"@matomezu/line:connector-line","from":"a","to":"b","props":{"exitAt":0.4024,"enterAt":0.9024,"via":[300]}}`) {
		t.Fatalf("book = %s", out.Books[0])
	}
}

func usePlugin(t *testing.T, e *Engine, dir string) []string {
	t.Helper()
	b, err := plugin.Build(dir, e.Modules())
	if err != nil {
		t.Fatal(err)
	}
	ids, err := e.Use([]*plugin.Bundle{b})
	if err != nil {
		t.Fatal(err)
	}
	return ids
}

func TestUsesAnAddedPlugin(t *testing.T) {
	e := newEngine(t)
	if ids := usePlugin(t, e, "../../test/added-plugins/ex2"); len(ids) != 1 || ids[0] != "ex2" {
		t.Fatalf("ids = %v", ids)
	}
	if c := string(e.AICatalog()); !strings.Contains(c, `"id":"ex2:diamond"`) || !strings.Contains(c, `"ex2:flow"`) {
		t.Fatalf("the AI catalog lacks the added plugin: %s", c)
	}
	out, err := e.Perform(Input{
		Action: "@matomezu/base:book-create",
		Args:   json.RawMessage(`{"title":"Flow","type":"ex2:flow"}`),
		Lang:   "ja",
		IDs:    []string{"fb", "fp"},
	})
	if err != nil || !out.OK || len(out.Books) != 1 || !strings.Contains(string(out.Books[0]), `"type":"ex2:flow","id":"fb"`) {
		t.Fatalf("@matomezu/base:book-create = %+v %s, %v", out, out.Books, err)
	}
}

func TestKeepsTheCatalogWhenAnAddedPluginDoesNotAssemble(t *testing.T) {
	e := newEngine(t)
	b := &plugin.Bundle{Dir: "bad", Manifest: plugin.Manifest{ID: "bad", Engine: "index.ts"}, Engine: `module.exports.default = { id: "bad", items: [{ id: "@matomezu/box:shape-box" }] }`}
	if _, err := e.Use([]*plugin.Bundle{b}); err == nil || !strings.Contains(err.Error(), "E301") {
		t.Fatalf("err = %v", err)
	}
	none := &plugin.Bundle{Dir: "none", Manifest: plugin.Manifest{ID: "none", Engine: "index.ts"}, Engine: `module.exports.x = 1`}
	if _, err := e.Use([]*plugin.Bundle{none}); err == nil || !strings.Contains(err.Error(), "export the plugin as default") {
		t.Fatalf("err = %v", err)
	}
	other := &plugin.Bundle{Dir: "other", Manifest: plugin.Manifest{ID: "other", Engine: "index.ts"}, Engine: `module.exports.default = { id: "another" }`}
	if _, err := e.Use([]*plugin.Bundle{other}); err == nil || !strings.Contains(err.Error(), `the id in matomezu.json is "other", but index.ts exports "another"`) {
		t.Fatalf("err = %v", err)
	}
	if out, err := e.Perform(place("p")); err != nil || !out.OK {
		t.Fatalf("Perform after a refused plugin = %+v, %v", out, err)
	}
}

// 新しい組で MCP 公開ツールの actions が返す物を作る所（アクションの describeArgs）が投げたら、組み直しは失敗し、定義も機能台帳も前のまま
func TestKeepsTheCatalogWhenTheAICatalogCannotBeMade(t *testing.T) {
	e := newEngine(t)
	before := string(e.AICatalog())
	b := &plugin.Bundle{Dir: "thrower", Manifest: plugin.Manifest{ID: "thrower", Engine: "index.ts"}, Engine: `
var m = globalThis.__matomezuModules["matomezu"];
module.exports.default = {
  id: "thrower",
  messages: { id: "thrower:messages", messages: { "thrower:throw": { en: "Throw" } } },
  actions: [{
    id: "thrower:boom", title: "thrower:throw", aiDescription: "", target: "book", attach: { books: true },
    args: m.z.strictObject({}),
    describeArgs: function () { throw new Error("boom") },
    run: function (b) { return { next: b, result: {} } }
  }]
}`}
	if _, err := e.Use([]*plugin.Bundle{b}); err == nil || !strings.Contains(err.Error(), "boom") {
		t.Fatalf("err = %v", err)
	}
	if got := string(e.AICatalog()); got != before {
		t.Fatalf("the AI catalog changed: %s", got)
	}
	out, err := e.Perform(Input{Action: "thrower:boom", Args: json.RawMessage(`{}`), On: &On{Book: "b1"}, Lang: "en"})
	if err != nil || out.OK || out.Reason != "unknown" {
		t.Fatalf("the failed plugin's action = %+v, %v; want unknown", out, err)
	}
}

func TestWarningLinesUseTheTable(t *testing.T) {
	e, err := New()
	if err != nil {
		t.Fatal(err)
	}
	lines, err := e.WarningLines(json.RawMessage(`[
		{"code":"W011","plugin":"acme","params":{"reason":"E301"}},
		{"code":"W999","plugin":"x","params":{}},
		{"code":"W010","plugin":"acme","params":{"layout":"default","kind":"widget","id":"acme:w"}},
		"broken"
	]`))
	if err != nil {
		t.Fatal(err)
	}
	if len(lines) != 2 || !strings.HasPrefix(lines[0], "W011 acme: the screen did not add it (E301)") ||
		lines[1] != "W010 acme: layout default: widget acme:w is skipped, as its plugin is not there" {
		t.Fatalf("lines = %q", lines)
	}
}
