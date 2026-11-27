package server

import (
	"encoding/json"
	"strings"
	"testing"

	"github.com/umaxyon/matomezu/internal/aiwire"
)

// AI がリフレッシュリクエストを受けさせると、常駐は、話しかけのフックが会話を空にできると名乗った参加者のときだけ引継ぎページを書いて覚え、
// AI のプログラムの部品が訊いたら matomezu: で始まる文を 1 度だけ渡す。渡した文で始まるターンは、利用者の話に数えない
func TestRefreshRequestIsKeptOnlyForARefreshableAI(t *testing.T) {
	s, hub := joinWorld(t, joinStore(t))
	a := joinedIn(t, s.URL, "LA", "100", "SA", "ひよこ")
	noticeOf(t, s.URL, a)
	var project string
	for id := range recordsOf(t, s.URL, "@matomezu/taskboard:project") {
		project = id
	}
	for _, name := range []string{"x", "y"} {
		if code, got := postPerform(t, s.URL, `{"action":"@matomezu/taskboard:ticket-add","args":{"project":"`+project+`","name":"`+name+`","assignees":["ひよこ"]}}`); code != 200 || !strings.Contains(got, `"ok":true`) {
			t.Fatalf("ticket-add %s = %d %s", name, code, got)
		}
	}
	var y string
	for id, r := range recordsOf(t, s.URL, "@matomezu/taskboard:ticket") {
		if r["name"] == "y" {
			y = id
		}
	}
	as := map[string]string{aiwire.ParticipantHeader: a}
	if got, _ := call(t, "POST", s.URL+"/api/ai/perform", `{"action":"@matomezu/taskboard:ticket-start","args":{},"on":{"record":"`+y+`"}}`, as); !strings.HasPrefix(got, `{"ok":true`) {
		t.Fatalf("ticket-start = %s", got)
	}
	refresh := `{"action":"@matomezu/base:refresh-request","args":{"type":"@matomezu/markdown:markdown","title":"handoff"}}`
	if got, _ := call(t, "POST", s.URL+"/api/ai/perform", refresh, as); !strings.Contains(got, "has not told matomezu") {
		t.Fatalf("refresh-request before the announcement = %s", got)
	}
	if got, _ := call(t, "POST", s.URL+"/api/ai/talked", `{"sessionId":"SA","refreshable":true}`, nil); got == "" {
		t.Fatal("talked answered nothing")
	}
	got, _ := call(t, "POST", s.URL+"/api/ai/perform", refresh, as)
	var done struct {
		OK     bool
		Result struct{ Page, Book string }
	}
	if json.Unmarshal([]byte(got), &done) != nil || !done.OK || done.Result.Page == "" {
		t.Fatalf("refresh-request = %s", got)
	}
	var due struct{ Text string }
	out, _ := call(t, "POST", s.URL+"/api/ai/refresh-due", `{"sessionId":"SA"}`, nil)
	if json.Unmarshal([]byte(out), &due) != nil || !strings.HasPrefix(due.Text, "matomezu: Your conversation was refreshed") || !strings.Contains(due.Text, done.Result.Page) {
		t.Fatalf("refresh-due = %s", out)
	}
	if !hub.WokenBy(due.Text) {
		t.Fatal("the turn started by the refresh text counts as the user's")
	}
	if again, _ := call(t, "POST", s.URL+"/api/ai/refresh-due", `{"sessionId":"SA"}`, nil); !strings.Contains(again, `"text":""`) {
		t.Fatalf("refresh-due again = %s", again)
	}
}
