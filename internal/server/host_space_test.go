package server

import (
	"encoding/json"
	"testing"

	"github.com/umaxyon/matomezu/internal/aiwire"
)

// /clear で同じプロセス id の参加者を新しい会話に移すとき、範囲の印が食い違う（WSL と Windows の同じプロセス id）参加者は移さない。
// どちらかの印が分からなければ、これまでどおりプロセス id だけで移す
func TestRebindingByHostLooksAtTheSpace(t *testing.T) {
	t.Parallel()
	s, hub := joinWorld(t, joinStore(t))
	id := joinedID(t, s.URL, `{"ai":"claude","model":"opus","env":"linux","link":"L2"}`)
	acceptRoom(t, s.URL, id, "すずめ")
	call(t, "POST", s.URL+"/api/ai/talked", `{"sessionId":"C1","host":"100","hostSpace":"WSL","candidates":["L2"]}`, nil)
	if n := noteOf(hub, id); n.SessionID != "C1" || n.HostSpace != "WSL" {
		t.Fatalf("not bound with the space: %+v", n)
	}
	call(t, "POST", s.URL+"/api/ai/talked", `{"sessionId":"C2","host":"100","hostSpace":"Windows"}`, nil)
	if n := noteOf(hub, id); n.SessionID != "C1" {
		t.Fatalf("moved by a program of another space: %+v", n)
	}
	call(t, "POST", s.URL+"/api/ai/talked", `{"sessionId":"C3","host":"100"}`, nil)
	if n := noteOf(hub, id); n.SessionID != "C3" {
		t.Fatalf("not moved by a hook without the space: %+v", n)
	}
}

// join と呼び出しのヘッダの範囲の印は、プロセス id と一緒に参加者の記録に書く。送り先エッジの印が食い違う通り道には届かない
func TestJoinWritesTheHostSpace(t *testing.T) {
	t.Parallel()
	s, hub := joinWorld(t, joinStore(t))
	got, _ := call(t, "POST", s.URL+"/api/ai/join", `{"ai":"claude","model":"opus","env":"wsl-linux","link":"L1"}`, map[string]string{aiwire.HostHeader: "100", aiwire.HostSpaceHeader: "WSL", aiwire.HostSessionHeader: "S1"})
	var joined Joined
	if json.Unmarshal([]byte(got), &joined) != nil || joined.Participant == "" {
		t.Fatalf("join = %s", got)
	}
	n := noteOf(hub, joined.Participant)
	if n.WakeHost != "100" || n.WakeHostSpace != "WSL" {
		t.Fatalf("wake target = %+v", n)
	}
	for _, c := range []struct {
		name  string
		space string
		want  bool
	}{
		{"the same space", "WSL", true},
		{"a line without the space", "", true},
		{"another space", "Windows", false},
	} {
		l := &wakeLine{host: "100", hostSpace: c.space, session: "S1"}
		if got := l.reaches(n); got != c.want {
			t.Errorf("%s: reaches = %v, want %v", c.name, got, c.want)
		}
	}
	acceptRoom(t, s.URL, joined.Participant, "すずめ")
	call(t, "POST", s.URL+"/api/ai/talked", `{"sessionId":"C1","candidates":["L1"]}`, nil)
	call(t, "GET", s.URL+"/api/ai/books", "", map[string]string{aiwire.ParticipantHeader: joined.Participant, aiwire.HostHeader: "200", aiwire.HostSpaceHeader: "Windows"})
	if n := noteOf(hub, joined.Participant); n.Host != "200" || n.HostSpace != "Windows" {
		t.Fatalf("the call did not write the host with its space: %+v", n)
	}
}
