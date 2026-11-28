package server

import (
	"encoding/json"
	"slices"
	"testing"

	"github.com/umaxyon/matomezu/internal/engine"
)

// 窓が先に行わずに送った（id を渡さない）アクションも、常駐が id を振って行い、changed と ack にアクションごとの結果（バルクの順）が載る
func TestSentActionsGetTheirResults(t *testing.T) {
	t.Parallel()
	hub, _, c := bulkHub(t)
	done, err := hub.Perform(Perform{Actions: []engine.BulkAction{
		step("@matomezu/base:settings-set", `{"values":{"@matomezu/base:skin":"@matomezu/base:dark"}}`, nil),
		step("@matomezu/paper:item-place", `{"item":"@matomezu/box:shape-nest-box","at":{"x":1,"y":2}}`, &engine.On{Page: "p1"}),
	}, Client: c.id, Seq: 1})
	if err != nil || !done.OK {
		t.Fatalf("perform = %+v, %v", done, err)
	}
	type told struct {
		Results []json.RawMessage `json:"results"`
	}
	seen := map[string]told{}
	for _, ev := range drained(c) {
		var got told
		if err := json.Unmarshal(ev.data, &got); err != nil {
			t.Fatal(err)
		}
		seen[ev.name] = got
	}
	for _, name := range []string{"changed", "ack"} {
		got, ok := seen[name]
		if !ok || len(got.Results) != 2 {
			t.Fatalf("%s = %+v", name, got)
		}
		var placed struct {
			Item string `json:"item"`
		}
		if err := json.Unmarshal(got.Results[1], &placed); err != nil || placed.Item == "" {
			t.Fatalf("%s results[1] = %s", name, got.Results[1])
		}
	}
}

// 窓が先に行わずに送った書庫が対象のアクションも、送った窓への changed と ack に、書庫の履歴に入る分の前と後（常駐が書く前の行の全部）が載る
// （窓は、それを書庫の履歴の段にする）。同じ番号の送り直し（changed が来ない）の ack にも載る
func TestSentLibraryActionTellsTheSenderBeforeAndAfter(t *testing.T) {
	t.Parallel()
	hub, _, c := bulkHub(t)
	trash := Perform{Actions: []engine.BulkAction{step("@matomezu/base:entry-trash", `{"entry":"b1"}`, nil)}, Client: c.id, Seq: 1, Key: "k1"}
	if done, err := hub.Perform(trash); err != nil || !done.OK {
		t.Fatalf("perform = %+v, %v", done, err)
	}
	type sides struct {
		Before json.RawMessage `json:"before"`
		After  json.RawMessage `json:"after"`
	}
	type told struct {
		Client  string `json:"client"`
		Library struct {
			Folders map[string]sides `json:"folders"`
		} `json:"library"`
	}
	type row struct {
		FolderRole string `json:"folderRole"`
		Lineup     []struct {
			ID string `json:"id"`
		} `json:"lineup"`
	}
	holds := func(raw json.RawMessage, role string) bool {
		var r row
		if err := json.Unmarshal(raw, &r); err != nil || r.FolderRole != role {
			t.Fatalf("%s row = %s", role, raw)
		}
		return slices.ContainsFunc(r.Lineup, func(e struct {
			ID string `json:"id"`
		}) bool {
			return e.ID == "b1"
		})
	}
	// 書庫ホームの並びから b1 が抜け、ゴミ箱の並びに入る（前は、常駐が書く前の書庫ホームの行の全部）
	check := func(name string, got told) {
		home, bin := got.Library.Folders["library-home"], got.Library.Folders["library-trash"]
		if home.Before == nil || bin.After == nil {
			t.Fatalf("%s = %+v", name, got)
		}
		if !holds(home.Before, "home") || holds(home.After, "home") || holds(bin.Before, "trash") || !holds(bin.After, "trash") {
			t.Fatalf("%s library = %+v", name, got.Library)
		}
	}
	seen := map[string]told{}
	for _, ev := range drained(c) {
		var got told
		if err := json.Unmarshal(ev.data, &got); err != nil {
			t.Fatal(err)
		}
		seen[ev.name] = got
	}
	if seen["changed"].Client != c.id {
		t.Fatalf("changed = %+v", seen["changed"])
	}
	check("changed", seen["changed"])
	check("ack", seen["ack"])
	if done, err := hub.Perform(trash); err != nil || !done.OK {
		t.Fatalf("again = %+v, %v", done, err)
	}
	again := drained(c)
	if len(again) != 1 || again[0].name != "ack" {
		t.Fatalf("again = %v", again)
	}
	var got told
	if err := json.Unmarshal(again[0].data, &got); err != nil {
		t.Fatal(err)
	}
	check("ack again", got)
}

// 窓が送ったアクションバルクを断ったら、ack に断りの種類（kind）を添える（窓が、置き直しても変わらない戻すを、ぶつかった物と分ける）
func TestRefusedAckTellsTheKind(t *testing.T) {
	t.Parallel()
	hub, _, c := bulkHub(t)
	done, err := hub.Perform(Perform{Actions: []engine.BulkAction{
		step("@matomezu/base:library-revert", `{"pages":{},"folders":{"b1":{"fields":{"title":{"set":"T"}}}}}`, nil),
	}, Client: c.id, Seq: 1})
	if err != nil || done.OK || done.Kind == "" {
		t.Fatalf("perform = %+v, %v", done, err)
	}
	var ack struct {
		OK   bool   `json:"ok"`
		Kind string `json:"kind"`
	}
	for _, ev := range drained(c) {
		if ev.name == "ack" {
			if err := json.Unmarshal(ev.data, &ack); err != nil {
				t.Fatal(err)
			}
		}
	}
	if ack.OK || ack.Kind != done.Kind {
		t.Fatalf("ack = %+v, done.Kind %q", ack, done.Kind)
	}
}
