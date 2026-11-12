package server

import (
	"encoding/json"
	"strings"
	"testing"
)

// AI が参加を要求すると、参加者のレコードが 1 件だけ足され、知らせ（record）と画面の読む口（/api/data）に出る。
// 同じ link の要求は断られて何も変えず、利用者が部屋を作って受け入れるとレコードが変わってまた知らせる。AI は受け入れられない
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
	if ev := next(t, screen); !strings.HasPrefix(ev, "record ") || !strings.Contains(ev, `"subject":"@matomezu/base:participant"`) || !strings.Contains(ev, `"state":"requested"`) {
		t.Fatalf("event = %s", ev)
	}
	if _, again := send(t, "POST", s.URL+"/api/ai/perform", request, ai); !strings.Contains(again, `"ok":false`) {
		t.Fatalf("the same link = %s", again)
	}
	_, data := send(t, "GET", s.URL+"/api/data", "", nil)
	if strings.Count(data, `"link":"L1"`) != 1 {
		t.Fatalf("data = %s", data)
	}
	_, made := send(t, "POST", s.URL+"/api/perform", `{"action":"@matomezu/base:workroom-add","args":{"name":"A","bird":"inko"},"lang":"ja","now":"2026-11-08T00:59:00.000Z"}`, nil)
	var room struct{ Result struct{ Workroom string } }
	if json.Unmarshal([]byte(made), &room) != nil || room.Result.Workroom == "" {
		t.Fatalf("workroom-add = %s", made)
	}
	next(t, screen) // workroom の record
	accept := `{"action":"@matomezu/base:participant-accept","args":{"workroom":"` + room.Result.Workroom + `"},"on":{"record":"` + id + `"},"lang":"ja","now":"2026-11-08T01:00:00.000Z"}`
	if _, got := send(t, "POST", s.URL+"/api/ai/perform", accept, ai); strings.Contains(got, `"ok":true`) {
		t.Fatalf("the AI accepted: %s", got)
	}
	send(t, "POST", s.URL+"/api/perform", accept, nil)
	if ev := next(t, screen); !strings.Contains(ev, `"state":"joined"`) || !strings.Contains(ev, `"workroom":"`+room.Result.Workroom+`"`) || !strings.Contains(ev, `"joinedAt":"2026-11-08T01:00:00.000Z"`) {
		t.Fatalf("event after accept = %s", ev)
	}
}
