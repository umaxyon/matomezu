package server

import (
	"encoding/json"
	"testing"

	"github.com/umaxyon/matomezu/internal/aiwire"
)

// /clear で同じプロセス id の参加者を新しい会話に移すとき、範囲の印が食い違う（WSL と Windows の同じプロセス id）参加者は移さない。
// どちらかの印が分からなければ、プロセス id だけで見て移す
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

// 同じプログラムは、プロセス id が分かって等しく、範囲の印が食い違わない物（どちらかの印が分からなければ食い違わない）
func TestProgramIsTheSameProcessInASpaceThatDoesNotDiffer(t *testing.T) {
	t.Parallel()
	for _, c := range []struct {
		name string
		p, q aiProgram
		want bool
	}{
		{"the same space", aiProgram{"100", "WSL"}, aiProgram{"100", "WSL"}, true},
		{"one space not known", aiProgram{"100", "WSL"}, aiProgram{"100", ""}, true},
		{"no space known", aiProgram{"100", ""}, aiProgram{"100", ""}, true},
		{"another space", aiProgram{"100", "WSL"}, aiProgram{"100", "Windows"}, false},
		{"another process", aiProgram{"100", "WSL"}, aiProgram{"200", "WSL"}, false},
		{"no process id", aiProgram{"", "WSL"}, aiProgram{"", "WSL"}, false},
	} {
		if got := c.p.is(c.q); got != c.want {
			t.Errorf("%s: is = %v, want %v", c.name, got, c.want)
		}
	}
}

// join と呼び出しのヘッダの範囲の印は、プロセス id と一緒に参加者の記録に書く。同じプロセス id で印を添えない呼び出しは、分かっている印を消さない
func TestJoinAndCallsWriteTheHostSpace(t *testing.T) {
	t.Parallel()
	s, hub := joinWorld(t, joinStore(t))
	got, _ := call(t, "POST", s.URL+"/api/ai/join", `{"ai":"claude","model":"opus","env":"wsl-linux","link":"L1"}`, map[string]string{aiwire.HostHeader: "100", aiwire.HostSpaceHeader: "WSL", aiwire.HostSessionHeader: "S1"})
	var joined Joined
	if json.Unmarshal([]byte(got), &joined) != nil || joined.Participant == "" {
		t.Fatalf("join = %s", got)
	}
	if n := noteOf(hub, joined.Participant); n.WakeHost != "100" || n.WakeHostSpace != "WSL" {
		t.Fatalf("wake target = %+v", n)
	}
	acceptRoom(t, s.URL, joined.Participant, "すずめ")
	call(t, "POST", s.URL+"/api/ai/talked", `{"sessionId":"C1","candidates":["L1"]}`, nil)
	books := func(headers map[string]string) participantNote {
		headers[aiwire.ParticipantHeader] = joined.Participant
		call(t, "GET", s.URL+"/api/ai/books", "", headers)
		return noteOf(hub, joined.Participant)
	}
	if n := books(map[string]string{aiwire.HostHeader: "100", aiwire.HostSpaceHeader: "WSL"}); n.Host != "100" || n.HostSpace != "WSL" {
		t.Fatalf("the call did not write the host with its space: %+v", n)
	}
	if n := books(map[string]string{aiwire.HostHeader: "100"}); n.HostSpace != "WSL" {
		t.Fatalf("a call without the space dropped it: %+v", n)
	}
	if n := books(map[string]string{aiwire.HostHeader: "200"}); n.Host != "200" || n.HostSpace != "" {
		t.Fatalf("a call from another process kept the old space: %+v", n)
	}
}

// 参加の id を失った呼び出しを、セッション id が当たらずプロセス id で引くとき、範囲の印が食い違う参加者は引かない
func TestTheParticipantOfACallByHostLooksAtTheSpace(t *testing.T) {
	t.Parallel()
	s, hub := joinWorld(t, joinStore(t))
	id := joinedID(t, s.URL, `{"ai":"claude","model":"opus","env":"linux","link":"L2"}`)
	acceptRoom(t, s.URL, id, "すずめ")
	call(t, "POST", s.URL+"/api/ai/talked", `{"sessionId":"C1","host":"100","hostSpace":"WSL","candidates":["L2"]}`, nil)
	if got := hub.SessionParticipant("X", aiProgram{"100", "Windows"}); got != "" {
		t.Fatalf("found a participant of another space: %q", got)
	}
	if got := hub.SessionParticipant("X", aiProgram{"100", "WSL"}); got != id {
		t.Fatalf("participant = %q, want %q", got, id)
	}
}

// 結ばれた会話のフックが、同じプロセス id でも範囲の違うプログラムから来たら、送り先エッジをそのプログラムに移す。同じプログラムなら、記録に無かった印だけ書き足す
func TestFollowingTheHostLooksAtTheSpace(t *testing.T) {
	t.Parallel()
	s, hub := joinWorld(t, joinStore(t))
	id := joinFrom(t, s.URL, "L2", "100")
	acceptRoom(t, s.URL, id, "すずめ")
	call(t, "POST", s.URL+"/api/ai/talked", `{"sessionId":"C1","host":"100","candidates":["L2"]}`, nil)
	call(t, "POST", s.URL+"/api/ai/model", `{"sessionId":"C1","model":"opus","host":"100","hostSpace":"WSL"}`, nil)
	if n := noteOf(hub, id); n.WakeHost != "100" || n.WakeHostSpace != "WSL" {
		t.Fatalf("the space was not added: %+v", n)
	}
	call(t, "POST", s.URL+"/api/ai/model", `{"sessionId":"C1","model":"opus","host":"100","hostSpace":"Windows"}`, nil)
	if n := noteOf(hub, id); n.WakeHost != "100" || n.WakeHostSpace != "Windows" {
		t.Fatalf("not followed to the program of another space: %+v", n)
	}
}
