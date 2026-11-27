package server

import (
	"encoding/json"
	"fmt"
	"strings"
	"testing"

	"github.com/umaxyon/matomezu/internal/aiwire"
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
	project, doing := workingLane(t, s.URL)
	workroom := workroomOf(t, hub, p)
	add := fmt.Sprintf(`{"action":"@matomezu/taskboard:ticket-add","args":{"project":%q,"name":"一","lane":%q,"assignees":[%q]},"lang":"ja","ids":["t1"],"now":"2026-11-27T00:00:00.000Z"}`, project, doing, workroom)
	if _, got := postPerform(t, s.URL, add); !strings.Contains(got, `"ok":true`) {
		t.Fatalf("ticket-add = %s", got)
	}
	ask := workShiftAs(t, s.URL, "S1")
	if ask == nil || !strings.Contains(ask.Question, "T-0001") || len(ask.Choices) != 4 || !strings.Contains(ask.Read, "my-workdesk") || !strings.Contains(ask.Answered, ask.Question) {
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

// workingLane は、タスクボードの最初のプロジェクトの id と、その完了でない作業中のレーンの id
func workingLane(t *testing.T, srv string) (project, lane string) {
	t.Helper()
	got, _ := call(t, "GET", srv+"/api/ai/records?kind=@matomezu/taskboard:project", "", nil)
	var list struct{ Records []struct{ ID string } }
	if err := json.Unmarshal([]byte(got), &list); err != nil || len(list.Records) == 0 {
		t.Fatalf("projects = %s", got)
	}
	got, _ = call(t, "GET", srv+"/api/ai/records?kind=@matomezu/taskboard:project&id="+list.Records[0].ID, "", nil)
	var one struct {
		Record struct {
			Lanes []struct {
				ID      string
				Kind    string
				Working bool
			}
			DoneLane string
		}
	}
	if err := json.Unmarshal([]byte(got), &one); err != nil {
		t.Fatalf("project = %s", got)
	}
	for _, l := range one.Record.Lanes {
		if l.Kind == "lane" && l.Working && l.ID != one.Record.DoneLane {
			return list.Records[0].ID, l.ID
		}
	}
	t.Fatalf("no working lane: %s", got)
	return "", ""
}

// workroomOf は、参加者 participant の入っているワークルームの id
func workroomOf(t *testing.T, hub *Hub, participant string) string {
	t.Helper()
	records, err := hub.records()
	if err != nil {
		t.Fatal(err)
	}
	for _, r := range records {
		if r.ID == participant {
			return r.Workroom
		}
	}
	t.Fatalf("no participant %s", participant)
	return ""
}

// aiPerformAs は、参加者 participant の AI としてアクション body を行い、成り立てば結果
func aiPerformAs(t *testing.T, srv, participant, body string) json.RawMessage {
	t.Helper()
	got, _ := call(t, "POST", srv+"/api/ai/perform", body, map[string]string{aiwire.ParticipantHeader: participant})
	var out struct {
		OK     bool
		Result json.RawMessage
	}
	if json.Unmarshal([]byte(got), &out) != nil || !out.OK {
		t.Fatalf("perform %s = %s", body, got)
	}
	return out.Result
}

// AI が自分のアクションで今の作業を替えた（自分を担当にした・閉じた）ときは、ターンの終わりに聞かない。
// 利用者かほかの AI が替えたときは聞く。同じターンでほかが替えたあとに AI が自分で替え直したら、最後の作業は AI が選んだ物なので聞かない
func TestWorkShiftDoesNotAskWhenTheAIChangedItsOwnWork(t *testing.T) {
	store := joinStore(t)
	s, hub := joinWorld(t, store)
	p := claudeIn(t, s.URL, "LB", "200", "S1", "すずめ")
	q := claudeIn(t, s.URL, "LC", "201", "S2", "つばめ")
	workroom := workroomOf(t, hub, p)
	project, doing := workingLane(t, s.URL)
	if ask := workShiftAs(t, s.URL, "S1"); ask != nil {
		t.Fatalf("asked at the first turn end: %+v", ask)
	}
	added := func(as string) string {
		result := aiPerformAs(t, s.URL, as, fmt.Sprintf(`{"action":"@matomezu/taskboard:ticket-add","args":{"project":%q,"name":"一","lane":%q,"assignees":[%q]}}`, project, doing, workroom))
		var made struct{ Ticket string }
		if json.Unmarshal(result, &made) != nil || made.Ticket == "" {
			t.Fatalf("ticket-add = %s", result)
		}
		return made.Ticket
	}
	complete := func(as, id string) {
		aiPerformAs(t, s.URL, as, `{"action":"@matomezu/taskboard:ticket-complete","args":{},"on":{"record":"`+id+`"}}`)
	}
	// AI が自分を担当にした・閉じた
	t1 := added(p)
	if ask := workShiftAs(t, s.URL, "S1"); ask != nil {
		t.Fatalf("asked after the AI took a ticket: %+v", ask)
	}
	complete(p, t1)
	if ask := workShiftAs(t, s.URL, "S1"); ask != nil {
		t.Fatalf("asked after the AI closed its ticket: %+v", ask)
	}
	// ほかの AI が担当にした
	t2 := added(q)
	if ask := workShiftAs(t, s.URL, "S1"); ask == nil || len(ask.Choices) != 4 {
		t.Fatalf("another AI gave a ticket = %+v", ask)
	}
	// AI が自分で替えたあとに、ほかの AI が閉じた
	complete(p, t2)
	t3 := added(p)
	complete(q, t3)
	if ask := workShiftAs(t, s.URL, "S1"); ask == nil || len(ask.Choices) != 2 {
		t.Fatalf("another AI closed it after the AI took it = %+v", ask)
	}
	// ほかの AI が担当にしたあとに、AI が自分で閉じた
	t4 := added(q)
	complete(p, t4)
	if ask := workShiftAs(t, s.URL, "S1"); ask != nil {
		t.Fatalf("asked after the AI closed what another AI gave: %+v", ask)
	}
}
