package server

import (
	"encoding/json"
	"strings"
	"testing"

	"github.com/umaxyon/matomezu/internal/aiwire"
)

// 利用者が AI のワークルームを担当にしてチケットを足すと、その AI に常駐メッセージ（カレントチケットが変わった）が届く。
// AI が自分を担当にしたときは、自分には届かない
func TestHostMessageWakesTheAssignedAI(t *testing.T) {
	s, hub := joinWorld(t, joinStore(t))
	a := joinedIn(t, s.URL, "LA", "100", "SA", "ひよこ")
	joinedIn(t, s.URL, "LB", "200", "SB", "すずめ")
	noticeOf(t, s.URL, a)
	var project string
	for id := range recordsOf(t, s.URL, "@matomezu/taskboard:project") {
		project = id
	}
	if code, got := postPerform(t, s.URL, `{"action":"@matomezu/taskboard:ticket-add","args":{"project":"`+project+`","name":"x","assignees":["すずめ"]}}`); code != 200 || !strings.Contains(got, `"ok":true`) {
		t.Fatalf("ticket-add = %d %s", code, got)
	}
	woke := wakes(hub, hub.OpenWakesWith("200", "", WakeLimits{}))
	if len(woke) != 1 || !strings.HasPrefix(woke[0], `matomezu: "Your current ticket is now`) {
		t.Fatalf("wakes of すずめ = %q", woke)
	}
	got, _ := call(t, "POST", s.URL+"/api/ai/perform", `{"action":"@matomezu/taskboard:ticket-add","args":{"project":"`+project+`","name":"y","assignees":["ひよこ"]}}`, map[string]string{aiwire.ParticipantHeader: a})
	if !strings.HasPrefix(got, `{"ok":true`) {
		t.Fatalf("ticket-add by AI = %s", got)
	}
	if woke := wakes(hub, hub.OpenWakesWith("100", "", WakeLimits{})); len(woke) != 0 {
		t.Fatalf("wakes of ひよこ = %q", woke)
	}
}

// 部屋を消すと、エンジンに渡していなかったワークルーム自身のブックの行を常駐が足して行い直し、そのブックを完全に消す
func TestRemovingAWorkroomPurgesItsBook(t *testing.T) {
	s, hub := joinWorld(t, joinStore(t))
	a := joinedIn(t, s.URL, "LA", "100", "SA", "ひよこ")
	noticeOf(t, s.URL, a)
	got, _ := call(t, "POST", s.URL+"/api/ai/perform", `{"action":"@matomezu/base:worker-page-add","args":{"type":"@matomezu/markdown:markdown","title":"memo"}}`, map[string]string{aiwire.ParticipantHeader: a})
	var added struct {
		OK     bool
		Result struct{ Book string }
	}
	if json.Unmarshal([]byte(got), &added) != nil || !added.OK || added.Result.Book == "" {
		t.Fatalf("worker-page-add = %s", got)
	}
	var room, occupant string
	for id, r := range recordsOf(t, s.URL, "@matomezu/base:participant") {
		occupant, room = id, r["workroom"].(string)
	}
	hub.mu.Lock()
	had := hub.hasBook(added.Result.Book)
	hub.mu.Unlock()
	if !had {
		t.Fatal("the worker book is not there")
	}
	if code, out := postPerform(t, s.URL, `{"action":"@matomezu/base:workroom-remove","args":{"occupant":"`+occupant+`"},"on":{"record":"`+room+`"}}`); code != 200 || !strings.Contains(out, `"ok":true`) {
		t.Fatalf("workroom-remove = %d %s", code, out)
	}
	hub.mu.Lock()
	defer hub.mu.Unlock()
	if hub.hasBook(added.Result.Book) {
		t.Fatal("the worker book is still there")
	}
}
