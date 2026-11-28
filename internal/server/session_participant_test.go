package server

import (
	"encoding/json"
	"strings"
	"testing"

	"github.com/umaxyon/matomezu/internal/aiwire"
)

// sendWith は、ヘッダ header の呼び出しとして AI 間メッセージを送り、返事を返す
func sendWith(t *testing.T, srv string, header map[string]string, to string) MessageSent {
	t.Helper()
	got, _ := call(t, "POST", srv+"/api/ai/message", `{"to":"`+to+`","text":"hi"}`, header)
	var sent MessageSent
	if err := json.Unmarshal([]byte(got), &sent); err != nil {
		t.Fatalf("message = %s", got)
	}
	return sent
}

// 参加の id のヘッダが無い呼び出しは、セッション id のヘッダに結ばれた参加者がちょうど 1 人のときだけ、その参加者になる（MCP が起動し直されて参加の id を失ったとき）
func TestCallWithoutParticipantIsTheParticipantOfItsSession(t *testing.T) {
	t.Parallel()
	s, _ := joinWorld(t, joinStore(t))
	a := joinedIn(t, s.URL, "LA", "100", "SA", "ひよこ")
	b := joinedIn(t, s.URL, "LB", "200", "SB", "すずめ")
	joinedIn(t, s.URL, "LC", "300", "SC", "からす")
	joinedIn(t, s.URL, "LD", "400", "SC", "かもめ")
	got, _ := call(t, "POST", s.URL+"/api/ai/join", `{"ai":"codex","model":"gpt","env":"wsl-linux","link":"LE","sessionId":"SE"}`, nil)
	if !strings.Contains(got, `"participant"`) {
		t.Fatalf("join = %s", got)
	}
	for _, c := range []struct {
		name   string
		header map[string]string
		to     string
		reason string
	}{
		{"bound", map[string]string{aiwire.HostSessionHeader: "SA"}, "すずめ", ""},
		{"bound, to itself", map[string]string{aiwire.HostSessionHeader: "SA"}, "ひよこ", "to-self"},
		{"not bound", map[string]string{aiwire.HostSessionHeader: "SX"}, "すずめ", "not-joined"},
		{"bound to a requested participant", map[string]string{aiwire.HostSessionHeader: "SE"}, "すずめ", "not-joined"},
		{"bound to two", map[string]string{aiwire.HostSessionHeader: "SC"}, "すずめ", "not-joined"},
		{"the participant header comes first", map[string]string{aiwire.ParticipantHeader: b, aiwire.HostSessionHeader: "SA"}, "ひよこ", ""},
	} {
		sent := sendWith(t, s.URL, c.header, c.to)
		if sent.OK != (c.reason == "") || sent.Reason != c.reason {
			t.Fatalf("%s: %+v", c.name, sent)
		}
	}
	if _, out := postPerform(t, s.URL, `{"action":"@matomezu/base:participant-remove","args":{},"on":{"record":"`+a+`"},"lang":"ja","now":"2026-11-08T02:00:00.000Z"}`); !strings.Contains(out, `"ok":true`) {
		t.Fatalf("remove = %s", out)
	}
	if sent := sendWith(t, s.URL, map[string]string{aiwire.HostSessionHeader: "SA"}, "すずめ"); sent.Reason != "not-joined" {
		t.Fatalf("removed: %+v", sent)
	}
}

// セッション id で参加者になった呼び出しは、起こす知らせの宛て先を、その呼び出しの AI のプログラムのプロセス id に書き直す（起動し直すとプロセス id が変わる）
func TestSessionParticipantMovesItsWakeTarget(t *testing.T) {
	t.Parallel()
	s, hub := joinWorld(t, joinStore(t))
	a := joinedIn(t, s.URL, "LA", "100", "SA", "ひよこ")
	joinedIn(t, s.URL, "LB", "200", "SB", "すずめ")
	call(t, "GET", s.URL+"/api/ai/settings", "", map[string]string{aiwire.HostSessionHeader: "SB", aiwire.HostHeader: "201"})
	sendMessage(t, s.URL, a, "すずめ", "hello")
	if got := wakes(hub, hub.OpenWakesWith("201", "", WakeLimits{})); len(got) != 1 || !strings.Contains(got[0], `"hello"`) {
		t.Fatalf("wakes = %q", got)
	}
}

// 今届く通り道がある参加者は、セッション id で参加者になった呼び出しでも、起こす知らせの宛て先を書き直さない
// （Claude Code で /clear のあとに MCP を立て直すと、MCP は新しいセッション id を添えるが、monitor は立てたときのセッション id を名乗り続ける）
func TestSessionParticipantKeepsAWakeTargetThatALineReaches(t *testing.T) {
	t.Parallel()
	s, hub := joinWorld(t, joinStore(t))
	a := joinedIn(t, s.URL, "LA", "100", "SA", "ひよこ")
	claudeIn(t, s.URL, "LB", "200", "SB", "すずめ")
	line := hub.OpenWakesWith("200", "SB", WakeLimits{})
	wakes(hub, line)
	talkedAs(t, s.URL, `{"sessionId":"SB2","host":"200"}`)
	call(t, "GET", s.URL+"/api/ai/settings", "", map[string]string{aiwire.HostSessionHeader: "SB2", aiwire.HostHeader: "200"})
	sendMessage(t, s.URL, a, "すずめ", "hello")
	if got := wakes(hub, line); len(got) != 1 || !strings.Contains(got[0], `"hello"`) {
		t.Fatalf("wakes = %q", got)
	}
}

// MCP が起動し直されたあと（参加の id を持たない）の join は、セッション id に結ばれた参加者のまま答える
func TestJoinAfterTheMCPRestartedAnswersWithTheSessionParticipant(t *testing.T) {
	t.Parallel()
	s, _ := joinWorld(t, joinStore(t))
	a := joinedIn(t, s.URL, "LA", "100", "SA", "ひよこ")
	got, _ := call(t, "POST", s.URL+"/api/ai/join", `{"ai":"claude","model":"opus","env":"wsl-linux","link":"LZ"}`, map[string]string{aiwire.HostSessionHeader: "SA", aiwire.HostHeader: "101"})
	var joined Joined
	if json.Unmarshal([]byte(got), &joined) != nil || joined.Participant != a {
		t.Fatalf("join = %s, want %s", got, a)
	}
}

// MCP を立てたあとに会話のセッションが変わり、フックが参加者をプロセス id で新しいセッションに移したあとも、古いセッション id の呼び出しは、プロセス id でその参加者になる
// （再開した Claude Code で /clear したとき。MCP は参加の id を持たず、立てたときのセッション id を添え続ける）。ほかのプロセス id では参加者にならない
func TestCallFromTheOldSessionIsTheParticipantOfItsHost(t *testing.T) {
	t.Parallel()
	s, _ := joinWorld(t, joinStore(t))
	claudeIn(t, s.URL, "LA", "100", "SA", "ひよこ")
	claudeIn(t, s.URL, "LB", "200", "SB", "すずめ")
	talkedAs(t, s.URL, `{"sessionId":"SA2","host":"100"}`)
	if sent := sendWith(t, s.URL, map[string]string{aiwire.HostSessionHeader: "SA", aiwire.HostHeader: "100"}, "すずめ"); !sent.OK {
		t.Fatalf("old session, same host: %+v", sent)
	}
	if sent := sendWith(t, s.URL, map[string]string{aiwire.HostSessionHeader: "SA", aiwire.HostHeader: "999"}, "すずめ"); sent.Reason != "not-joined" {
		t.Fatalf("old session, other host: %+v", sent)
	}
}
