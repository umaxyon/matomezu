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

// 窓が先に行わずに送った書庫が対象のアクションも、送った窓への changed に、書庫の履歴に入る分の前と後（常駐が書く前の行の全部）が載る（窓は、それを書庫の履歴の段にする）
func TestSentLibraryActionTellsTheSenderBeforeAndAfter(t *testing.T) {
	t.Parallel()
	hub, _, c := bulkHub(t)
	done, err := hub.Perform(Perform{Actions: []engine.BulkAction{
		step("@matomezu/base:entry-trash", `{"entry":"b1"}`, nil),
	}, Client: c.id, Seq: 1})
	if err != nil || !done.OK {
		t.Fatalf("perform = %+v, %v", done, err)
	}
	type sides struct {
		Before json.RawMessage `json:"before"`
		After  json.RawMessage `json:"after"`
	}
	var changed struct {
		Client  string `json:"client"`
		Library struct {
			Folders map[string]sides `json:"folders"`
		} `json:"library"`
	}
	for _, ev := range drained(c) {
		if ev.name == "changed" {
			if err := json.Unmarshal(ev.data, &changed); err != nil {
				t.Fatal(err)
			}
		}
	}
	// 書庫ホームの並びから b1 が抜け、ゴミ箱の並びに入る（前は、常駐が書く前の書庫ホームの行の全部）
	home, trash := changed.Library.Folders["library-home"], changed.Library.Folders["library-trash"]
	if changed.Client != c.id || home.Before == nil || trash.After == nil {
		t.Fatalf("changed = %+v", changed)
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
	if !holds(home.Before, "home") || holds(home.After, "home") || holds(trash.Before, "trash") || !holds(trash.After, "trash") {
		t.Fatalf("library = %+v", changed.Library)
	}
}
