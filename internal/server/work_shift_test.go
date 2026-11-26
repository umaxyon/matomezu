package server

import (
	"encoding/json"
	"fmt"
	"strings"
	"testing"

	"github.com/umaxyon/matomezu/internal/engine"
)

// workShiftAs は、ターンの終わりの部品として、セッション session の今の作業が替わったかを訊いた答え（聞かないなら nil）
func workShiftAs(t *testing.T, srv, session string) *engine.WorkShiftAsk {
	t.Helper()
	got, _ := call(t, "POST", srv+"/api/ai/work-shift", `{"sessionId":"`+session+`"}`, nil)
	var out struct {
		Ask *engine.WorkShiftAsk `json:"ask"`
	}
	if err := json.Unmarshal([]byte(got), &out); err != nil {
		t.Fatalf("work-shift = %s", got)
	}
	return out.Ask
}

// 今の作業が替わったか: 初めてのターンの終わりは覚えるだけ。今の作業が替わったら 1 度だけ聞き、覚えた印は常駐を起動し直しても残る。
// 参加者でなくなったら聞かない。セッションに結ばれた参加者がいなければ聞かない
func TestWorkShiftAsksOnceWhenTheCurrentWorkChanges(t *testing.T) {
	store := joinStore(t)
	s, hub := joinWorld(t, store)
	room := "すずめ"
	p := claudeIn(t, s.URL, "LB", "200", "S1", room)
	if ask := workShiftAs(t, s.URL, "S1"); ask != nil {
		t.Fatalf("asked at the first turn end: %+v", ask)
	}
	if ask := workShiftAs(t, s.URL, "S1"); ask != nil {
		t.Fatalf("asked with no change: %+v", ask)
	}
	// 作業中のレーンで担当にすると、今の作業になる
	got, _ := call(t, "GET", s.URL+"/api/ai/records?kind=@matomezu/taskboard:project", "", nil)
	var list struct{ Records []struct{ ID string } }
	if err := json.Unmarshal([]byte(got), &list); err != nil || len(list.Records) == 0 {
		t.Fatalf("projects = %s", got)
	}
	got, _ = call(t, "GET", s.URL+"/api/ai/records?kind=@matomezu/taskboard:project&id="+list.Records[0].ID, "", nil)
	var project struct {
		Record struct {
			Lanes []struct {
				ID      string
				Kind    string
				Working bool
			}
			DoneLane string
		}
	}
	if err := json.Unmarshal([]byte(got), &project); err != nil {
		t.Fatalf("project = %s", got)
	}
	doing := ""
	for _, l := range project.Record.Lanes {
		if l.Kind == "lane" && l.Working && l.ID != project.Record.DoneLane {
			doing = l.ID
			break
		}
	}
	workroom := ""
	records, err := hub.records()
	if err != nil {
		t.Fatal(err)
	}
	for _, r := range records {
		if r.ID == p {
			workroom = r.Workroom
		}
	}
	add := fmt.Sprintf(`{"action":"@matomezu/taskboard:ticket-add","args":{"project":%q,"name":"一","lane":%q,"assignees":[%q]},"lang":"ja","ids":["t1"],"now":"2026-11-27T00:00:00.000Z"}`, list.Records[0].ID, doing, workroom)
	if _, got := postPerform(t, s.URL, add); !strings.Contains(got, `"ok":true`) {
		t.Fatalf("ticket-add = %s", got)
	}
	ask := workShiftAs(t, s.URL, "S1")
	if ask == nil || !strings.Contains(ask.Question, "T-0001") || len(ask.Choices) != 4 || !strings.Contains(ask.Read, "my-workdesk") {
		t.Fatalf("started = %+v", ask)
	}
	if again := workShiftAs(t, s.URL, "S1"); again != nil {
		t.Fatalf("asked twice: %+v", again)
	}
	// 覚えた印は置き場所に残る（常駐を起動し直しても、同じ替わりで聞き直さない）
	s2, _ := joinWorld(t, store)
	if again := workShiftAs(t, s2.URL, "S1"); again != nil {
		t.Fatalf("asked again after a restart: %+v", again)
	}
	done := `{"action":"@matomezu/taskboard:ticket-complete","args":{},"on":{"record":"t1"},"lang":"ja","ids":["h1"],"now":"2026-11-27T00:00:00.000Z"}`
	if _, got := postPerform(t, s2.URL, done); !strings.Contains(got, `"ok":true`) {
		t.Fatalf("ticket-complete = %s", got)
	}
	if ended := workShiftAs(t, s2.URL, "S1"); ended == nil || len(ended.Choices) != 2 || !ended.Choices[0].Clear {
		t.Fatalf("ended = %+v", ended)
	}
	if ask := workShiftAs(t, s2.URL, "S9"); ask != nil {
		t.Fatalf("asked a session nobody is bound to: %+v", ask)
	}
}
