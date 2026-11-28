package server

import (
	"encoding/json"
	"testing"

	"github.com/umaxyon/matomezu/internal/engine"
)

const keptOther = `{"id":"b2","title":"U","lineup":[{"kind":"page","id":"q1","type":"@matomezu/drawing:drawing","title":"Q","paper":"@matomezu/base:a4","orientation":"landscape"}]}`

// changedPages は、窓 c に届いた最後の changed の pages（id → 行）
func changedPages(t *testing.T, c *client) map[string]map[string]json.RawMessage {
	t.Helper()
	var got map[string]map[string]json.RawMessage
	for _, ev := range drained(c) {
		if ev.name != "changed" {
			continue
		}
		var change struct {
			Pages []struct {
				ID   string                     `json:"id"`
				Page map[string]json.RawMessage `json:"page"`
			} `json:"pages"`
		}
		if err := json.Unmarshal(ev.data, &change); err != nil {
			t.Fatal(err)
		}
		got = map[string]map[string]json.RawMessage{}
		for _, p := range change.Pages {
			got[p.ID] = p.Page
		}
	}
	if got == nil {
		t.Fatal("no changed")
	}
	return got
}

// 2 冊のページに形を置くバルクを行う
func placeOnBoth(t *testing.T, hub *Hub) {
	t.Helper()
	done, err := hub.Perform(Perform{Actions: []engine.BulkAction{
		step("@matomezu/paper:item-place", `{"item":"@matomezu/box:shape-nest-box","at":{"x":1,"y":2}}`, &engine.On{Page: "p1"}, "k1"),
		step("@matomezu/paper:item-place", `{"item":"@matomezu/box:shape-nest-box","at":{"x":1,"y":2}}`, &engine.On{Page: "q1"}, "k2"),
	}})
	if err != nil || !done.OK {
		t.Fatalf("perform = %+v, %v", done, err)
	}
}

// 中身を持つ物を名乗った窓には、その中のページだけを中身ごと、ほかのページはページメタだけ（unheld）で知らせる。名乗っていない窓には全部を中身ごと
func TestChangedSendsPageMetaToAWindowThatDoesNotKeepThePage(t *testing.T) {
	t.Parallel()
	hub, _, c := bulkHub(t, keptOther)
	other := hub.Join()
	cleanup(t, func() { hub.Leave(other) })
	<-other.ch // hello
	pages, ok := hub.Keep(c.id, []string{"b1"})
	if !ok || len(pages) != 1 || pages[0]["id"] != "p1" {
		t.Fatalf("keep = %v, %v", pages, ok)
	}
	placeOnBoth(t, hub)
	got := changedPages(t, c)
	if _, held := got["p1"]["items"]; !held || got["p1"]["unheld"] != nil {
		t.Fatalf("p1 = %s; want the whole page", got["p1"])
	}
	if _, items := got["q1"]["items"]; items || string(got["q1"]["unheld"]) != "true" || string(got["q1"]["title"]) != `"Q"` {
		t.Fatalf("q1 = %v; want the page meta", got["q1"])
	}
	all := changedPages(t, other)
	if _, held := all["q1"]["items"]; !held {
		t.Fatalf("q1 to a window that named nothing = %v", all["q1"])
	}
}

// 名乗り直したら、名乗った後の知らせから、新しく持つ物のページを中身ごと知らせる。知らない窓の名乗りは断る
func TestKeepAgainChangesWhatIsSentWhole(t *testing.T) {
	t.Parallel()
	hub, _, c := bulkHub(t, keptOther)
	hub.Keep(c.id, []string{"b1"})
	pages, _ := hub.Keep(c.id, []string{"b2"})
	if len(pages) != 1 || pages[0]["id"] != "q1" {
		t.Fatalf("keep = %v", pages)
	}
	placeOnBoth(t, hub)
	got := changedPages(t, c)
	if string(got["p1"]["unheld"]) != "true" || got["q1"]["unheld"] != nil {
		t.Fatalf("pages = %v", got)
	}
	if _, ok := hub.Keep("nobody", nil); ok {
		t.Fatal("keep by an unknown window was taken")
	}
}
