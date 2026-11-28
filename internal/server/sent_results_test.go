package server

import (
	"encoding/json"
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
