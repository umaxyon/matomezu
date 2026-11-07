package server

import (
	"strings"
	"testing"
)

// AI が参加を要求すると、参加者の表に 1 人だけ足され、知らせ（participants）と画面の読む口（/api/data）に出る。
// 同じ link の要求は何も変えず、利用者の受け入れで表が変わってまた知らせる。AI は受け入れられない
func TestParticipantsAreKeptAndTold(t *testing.T) {
	s := newServer(t, nil)
	ai := map[string]string{"Authorization": "Bearer secret"}
	screen := listen(t, s.URL)
	next(t, screen)
	request := `{"action":"@matomezu/base:participant-request","args":{"ai":"claude","model":"opus","env":"wsl","link":"L1"}}`
	_, got := send(t, "POST", s.URL+"/api/ai/perform", request, ai)
	const head = `{"ok":true,"result":{"participant":"`
	if !strings.HasPrefix(got, head) {
		t.Fatalf("participant-request = %s", got)
	}
	id := strings.TrimSuffix(strings.TrimPrefix(got, head), `"}}`)
	if got := next(t, screen); !strings.HasPrefix(got, "participants ") || !strings.Contains(got, `"participants":[{"id":"`+id+`","state":"requested","ai":"claude"`) {
		t.Fatalf("event = %s", got)
	}
	if _, again := send(t, "POST", s.URL+"/api/ai/perform", request, ai); again != got {
		t.Fatalf("the same link = %s; want %s", again, got)
	}
	_, data := send(t, "GET", s.URL+"/api/data", "", nil)
	if strings.Count(data, `"link":"L1"`) != 1 {
		t.Fatalf("data = %s", data)
	}
	accept := `{"action":"@matomezu/base:participant-accept","args":{"participant":"` + id + `","workroom":"A","bird":"inko"},"lang":"ja","now":"2026-11-08T01:00:00.000Z"}`
	if _, got := send(t, "POST", s.URL+"/api/ai/perform", accept, ai); strings.Contains(got, `"ok":true`) {
		t.Fatalf("the AI accepted: %s", got)
	}
	send(t, "POST", s.URL+"/api/perform", accept, nil)
	if got := next(t, screen); !strings.Contains(got, `"state":"joined"`) || !strings.Contains(got, `"workroom":"A"`) || !strings.Contains(got, `"joinedAt":"2026-11-08T01:00:00.000Z"`) {
		t.Fatalf("event after accept = %s", got)
	}
}
