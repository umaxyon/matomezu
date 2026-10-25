package engine

import (
	"encoding/json"
	"regexp"
	"strings"
	"testing"

	"github.com/umaxyon/matomezu/internal/plugin"
)

const book = `{"type":"drawing","id":"b1","title":"T","pages":[{"id":"p1","title":"P","paper":"a4","orientation":"landscape"}]}`

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
		Action: "item.place",
		Args:   json.RawMessage(`{"page":"p1","item":"shape.box","at":{"x":10,"y":20},"props":{"caption":"c"}}`),
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
	if string(out.Result) != `{"item":"abc123"}` || len(out.Books) != 1 || !strings.Contains(string(out.Books[0]), `"id":"abc123","x":10,"y":20,"item":"shape.box"`) {
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
		"no-book":  {Action: "item.place", Args: place().Args, On: &On{Book: "b9"}, Lang: "ja", Books: place().Books},
		"bad-args": {Action: "item.place", Args: json.RawMessage(`{}`), On: &On{Book: "b1"}, Lang: "ja", Books: place().Books},
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
		Action: "book.create",
		Args:   json.RawMessage(`{"title":"New","type":"drawing"}`),
		Lang:   "ja",
		IDs:    []string{"nb"},
		Books:  []json.RawMessage{json.RawMessage(book)},
	})
	if err != nil || !out.OK || len(out.Books) != 1 || string(out.Books[0]) != `{"type":"drawing","id":"nb","title":"New","pages":[]}` {
		t.Fatalf("book.create = %+v %s, %v", out, out.Books, err)
	}
	out, err = e.Perform(Input{Action: "settings.lang", Args: json.RawMessage(`{"lang":"en"}`), Lang: "ja", Settings: json.RawMessage(`{"lang":"ja"}`)})
	if err != nil || !out.OK || !strings.Contains(string(out.Settings), `"lang":"en"`) {
		t.Fatalf("settings.lang = %+v %s, %v", out, out.Settings, err)
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
		if a.ID == "item.place" {
			found = a.Target == "book" && strings.Contains(string(a.Args), `"page"`) && strings.Contains(string(a.Args), `"required"`)
		}
	}
	if !found || len(c.Items) == 0 || !strings.Contains(string(c.Items[0].Props), `"caption"`) ||
		strings.Join(c.Languages, ",") != "en,ja" || strings.Join(c.Skins, ",") != "dark,light" {
		t.Fatalf("ai catalog = %s", newEngine(t).AICatalog())
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
	for _, id := range []string{"row.add", "row.update", "row.remove", "row.check", "row.lines"} {
		if args[id] == "" {
			t.Fatalf("%s is not in the ai catalog", id)
		}
	}
	for _, field := range []string{`"caption"`, `"rule"`, `"bodyAlign"`} {
		if !strings.Contains(args["row.add"], field) || !strings.Contains(args["row.update"], field) {
			t.Fatalf("row props lack %s: %s", field, args["row.add"])
		}
	}
}

// 線の道筋の計算（route）を通るアクションも、画面と同じに行える: つないだ箱が近ければどけ、手で直した区間が引けるかを確かめる
func TestConnectsItemsWithALine(t *testing.T) {
	e := newEngine(t)
	two := `{"type":"drawing","id":"b1","title":"T","pages":[{"id":"p1","title":"P","paper":"a4","orientation":"landscape","items":[` +
		`{"id":"a","x":100,"y":100,"item":"shape.box","w":100,"h":64,"props":{}},` +
		`{"id":"b","x":400,"y":300,"item":"shape.box","w":100,"h":64,"props":{}}]}]}`
	out, err := e.Perform(Input{
		Action: "line.connect",
		Args:   json.RawMessage(`{"page":"p1","from":"a","to":"b","props":{"exitAt":0.4024,"enterAt":0.9024,"via":[300]}}`),
		On:     &On{Book: "b1"},
		Lang:   "ja",
		IDs:    []string{"l1"},
		Books:  []json.RawMessage{json.RawMessage(two)},
	})
	if err != nil || !out.OK || string(out.Result) != `{"line":"l1"}` {
		t.Fatalf("Perform = %+v, %v", out, err)
	}
	if !strings.Contains(string(out.Books[0]), `{"id":"l1","item":"connector.line","from":"a","to":"b","props":{"exitAt":0.4024,"enterAt":0.9024,"via":[300]}}`) {
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
	if ids := usePlugin(t, e, "../../test/examples/plugins/hoge-flow"); len(ids) != 1 || ids[0] != "hoge-flow" {
		t.Fatalf("ids = %v", ids)
	}
	if c := string(e.AICatalog()); !strings.Contains(c, `"id":"hoge-flow/diamond"`) || !strings.Contains(c, `"hoge-flow/flow"`) {
		t.Fatalf("the AI catalog lacks the added plugin: %s", c)
	}
	out, err := e.Perform(Input{
		Action: "book.create",
		Args:   json.RawMessage(`{"title":"Flow","type":"hoge-flow/flow"}`),
		Lang:   "ja",
		IDs:    []string{"fb", "fp"},
	})
	if err != nil || !out.OK || len(out.Books) != 1 || !strings.Contains(string(out.Books[0]), `"type":"hoge-flow/flow","id":"fb"`) {
		t.Fatalf("book.create = %+v %s, %v", out, out.Books, err)
	}
}

func TestKeepsTheCatalogWhenAnAddedPluginDoesNotAssemble(t *testing.T) {
	e := newEngine(t)
	b := &plugin.Bundle{Dir: "bad", Manifest: plugin.Manifest{ID: "bad", Engine: "index.ts"}, Engine: `module.exports.default = { id: "bad", items: [{ id: "shape.box" }] }`}
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
