package engine

import (
	"encoding/json"
	"regexp"
	"strings"
	"testing"
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

func TestCatalogDescribesActionsAndItems(t *testing.T) {
	var c struct {
		Actions []struct {
			ID     string          `json:"id"`
			Target string          `json:"target"`
			Args   json.RawMessage `json:"args"`
		} `json:"actions"`
		Items []struct {
			ID    string          `json:"id"`
			Props json.RawMessage `json:"props"`
		} `json:"items"`
	}
	if err := json.Unmarshal(newEngine(t).Catalog(), &c); err != nil {
		t.Fatal(err)
	}
	found := false
	for _, a := range c.Actions {
		if a.ID == "item.place" {
			found = a.Target == "book" && strings.Contains(string(a.Args), `"page"`) && strings.Contains(string(a.Args), `"required"`)
		}
	}
	if !found || len(c.Items) == 0 || !strings.Contains(string(c.Items[0].Props), `"caption"`) {
		t.Fatalf("catalog = %s", newEngine(t).Catalog())
	}
}
