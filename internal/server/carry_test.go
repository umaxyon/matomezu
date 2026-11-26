package server

import (
	"encoding/json"
	"strings"
	"testing"

	"github.com/umaxyon/matomezu/internal/aiwire"
	"github.com/umaxyon/matomezu/internal/engine"
)

// claudeIn は、プロセス id host のプログラムが会話 session で MCP を立てた AI（Claude Code の形: join はセッション id を運ばず、フックが link で結ぶ）として参加を頼み、
// 名前 room のワークルームに受け入れ、フックで参加を伝え終えた参加の id を返す（フックはチャットスレッドの id "TH-"+link を添える）
func claudeIn(t *testing.T, srv, link, host, session, room string) string {
	t.Helper()
	got, _ := call(t, "POST", srv+"/api/ai/join", `{"ai":"claude","model":"opus","env":"windows","link":"`+link+`"}`,
		map[string]string{aiwire.HostHeader: host, aiwire.HostSessionHeader: session, aiwire.SessionPidHeader: host, aiwire.SessionPidSpaceHeader: ProcessSpace()})
	var joined Joined
	if json.Unmarshal([]byte(got), &joined) != nil || joined.Participant == "" {
		t.Fatalf("join = %s", got)
	}
	if out := acceptIn(t, srv, joined.Participant, makeRoom(t, srv, room)); !strings.Contains(out, `"ok":true`) {
		t.Fatalf("accept = %s", out)
	}
	if out := talkedAs(t, srv, `{"sessionId":"`+session+`","host":"`+host+`","candidates":["`+link+`"],"chatThread":"TH-`+link+`"}`); len(out.Welcomes) != 1 {
		t.Fatalf("not told: %+v", out)
	}
	return joined.Participant
}

// talkedAs は、ターンの始まりのフックとして body を送った答え
func talkedAs(t *testing.T, srv, body string) SessionTalk {
	t.Helper()
	got, _ := call(t, "POST", srv+"/api/ai/talked", body, nil)
	var out SessionTalk
	if err := json.Unmarshal([]byte(got), &out); err != nil {
		t.Fatalf("talked = %s", got)
	}
	return out
}

// Desktop の /clear（CLI ごと替わる）: 新しい会話のフックが同じチャットスレッドの id を添えると、その参加者が新しい会話に移り、起こす知らせの宛て先も新しい CLI に移る
// （古い CLI の退室の見張りの印は消える）。溜まっていた知らせは新しい CLI の通り道に流れ、移したことは AI にだけ 1 度伝わる（利用者に見せる文は無い）
func TestClearCarriesTheParticipantToANewProgram(t *testing.T) {
	s, hub := joinWorld(t, joinStore(t))
	a := joinedIn(t, s.URL, "LA", "100", "SA", "ひよこ")
	b := claudeIn(t, s.URL, "LB", "200", "S1", "すずめ")
	noticeOf(t, s.URL, a)
	if sent, _ := sendMessage(t, s.URL, a, "すずめ", "起きて"); !sent.OK {
		t.Fatalf("sent = %+v", sent)
	}
	out := talkedAs(t, s.URL, `{"sessionId":"S2","host":"300","chatThread":"TH-LB"}`)
	n := noteOf(hub, b)
	if n.SessionID != "S2" || n.Host != "300" || n.WakeHost != "300" || n.WakeSession != "S2" || n.SessionPid != "" || n.Carried {
		t.Fatalf("carried = %+v", n)
	}
	if !strings.HasPrefix(out.ForAI, carriedText) || !strings.Contains(out.ForAI, "Workroom name: すずめ") || len(out.Welcomes) != 0 {
		t.Fatalf("talked = %+v", out)
	}
	if again := talkedAs(t, s.URL, `{"sessionId":"S2","host":"300","chatThread":"TH-LB"}`); again.ForAI != "" {
		t.Fatalf("told twice: %+v", again)
	}
	if got := wakes(hub, hub.OpenWakesWith("300", "S2", WakeLimits{})); len(got) != 1 || !strings.Contains(got[0], "起きて") {
		t.Fatalf("wakes = %q", got)
	}
	if n := noteOf(hub, a); n.SessionID != "SA" {
		t.Fatalf("the sender moved: %+v", n)
	}
}

// 端末の /clear（同じプロセスのまま）: プロセス id で移り、AI にだけ伝わる。通り道は AI のプログラムを立てたときのセッション id で開いているので、宛て先は変えずに届き続ける
func TestClearInTheSameProgramKeepsTheWakeTarget(t *testing.T) {
	s, hub := joinWorld(t, joinStore(t))
	b := claudeIn(t, s.URL, "LB", "200", "S1", "すずめ")
	line := hub.OpenWakesWith("200", "S1", WakeLimits{})
	defer hub.CloseWakes(line)
	out := talkedAs(t, s.URL, `{"sessionId":"S2","host":"200"}`)
	n := noteOf(hub, b)
	if n.SessionID != "S2" || n.WakeHost != "200" || n.WakeSession != "S1" || n.SessionPid != "200" {
		t.Fatalf("carried = %+v", n)
	}
	if !strings.HasPrefix(out.ForAI, carriedText) {
		t.Fatalf("talked = %+v", out)
	}
	hub.mu.Lock()
	reach := hub.wakeReachLocked(b)
	hub.mu.Unlock()
	if reach != engine.WakeReaches {
		t.Fatalf("the line stopped reaching: %s", reach)
	}
}

// 移さない・移すとき: 新しい会話に誰かが結ばれていれば移さない。チャットスレッドが違う・添えないなら移さない。join でセッション id を運んだ参加者は移さない。
// 前の参加者に今も届く通り道があれば（前の会話がまだ動いている）移さない。同じチャットスレッドの参加者は、要求中の者も含めて全員移る
func TestClearCarriesOnlyFromTheSameChatThread(t *testing.T) {
	s, hub := joinWorld(t, joinStore(t))
	codex := joinedIn(t, s.URL, "LC", "100", "SC", "ひよこ")
	talkedAs(t, s.URL, `{"sessionId":"SC","host":"100","chatThread":"TH-C"}`)
	b := claudeIn(t, s.URL, "LB", "200", "S1", "すずめ")
	other := claudeIn(t, s.URL, "LO", "400", "S9", "つばめ")
	if out := talkedAs(t, s.URL, `{"sessionId":"S9","host":"500","chatThread":"TH-LB"}`); out.ForAI != "" || noteOf(hub, b).SessionID != "S1" {
		t.Fatalf("moved into a bound session: %+v, %+v", out, noteOf(hub, b))
	}
	talkedAs(t, s.URL, `{"sessionId":"S9","host":"400","chatThread":"TH-LO"}`) // 添えた id を覚え直す
	for _, body := range []string{`{"sessionId":"S2","host":"501","chatThread":"TH-X"}`, `{"sessionId":"S2","host":"501"}`} {
		if out := talkedAs(t, s.URL, body); out.ForAI != "" || noteOf(hub, b).SessionID != "S1" {
			t.Fatalf("moved by %s: %+v", body, out)
		}
	}
	talkedAs(t, s.URL, `{"sessionId":"S3","host":"502","chatThread":"TH-C"}`)
	if n := noteOf(hub, codex); n.SessionID != "SC" {
		t.Fatalf("the participant whose join carried the session moved: %+v", n)
	}
	line := hub.OpenWakesWith("200", "S1", WakeLimits{})
	if talkedAs(t, s.URL, `{"sessionId":"S5","host":"503","chatThread":"TH-LB"}`); noteOf(hub, b).SessionID != "S1" {
		t.Fatalf("moved while the line reaches it: %+v", noteOf(hub, b))
	}
	hub.CloseWakes(line)
	// 要求中（受け入れ前）の参加者も、同じチャットスレッドの会話に結ばれていれば一緒に移る
	got, _ := call(t, "POST", s.URL+"/api/ai/join", `{"ai":"claude","model":"opus","env":"windows","link":"LR"}`, nil)
	var asked Joined
	_ = json.Unmarshal([]byte(got), &asked)
	talkedAs(t, s.URL, `{"sessionId":"S1","host":"200","candidates":["LR"],"chatThread":"TH-LB"}`)
	talkedAs(t, s.URL, `{"sessionId":"S4","host":"600","chatThread":"TH-LB"}`)
	if noteOf(hub, b).SessionID != "S4" || noteOf(hub, asked.Participant).SessionID != "S4" || noteOf(hub, other).SessionID != "S9" {
		t.Fatalf("b = %+v, asked = %+v, other = %+v", noteOf(hub, b), noteOf(hub, asked.Participant), noteOf(hub, other))
	}
}

// Desktop の --resume（同じ会話を別の CLI で起動し直す）: 届く通り道が無ければ宛て先が新しい CLI に移り、退室の見張りの印は消える。届く通り道があれば変えない
func TestResumeFollowsTheNewProgram(t *testing.T) {
	s, hub := joinWorld(t, joinStore(t))
	b := claudeIn(t, s.URL, "LB", "200", "S1", "すずめ")
	kept := claudeIn(t, s.URL, "LK", "700", "S7", "つばめ")
	line := hub.OpenWakesWith("700", "S7", WakeLimits{})
	defer hub.CloseWakes(line)
	if out := talkedAs(t, s.URL, `{"sessionId":"S1","host":"300"}`); out.ForAI != "" {
		t.Fatalf("a resumed conversation was told: %+v", out)
	}
	if n := noteOf(hub, b); n.WakeHost != "300" || n.WakeSession != "S1" || n.SessionPid != "" || n.SessionID != "S1" {
		t.Fatalf("resumed = %+v", n)
	}
	call(t, "POST", s.URL+"/api/ai/model", `{"sessionId":"S7","host":"800","model":"opus"}`, nil)
	if n := noteOf(hub, kept); n.WakeHost != "700" || n.SessionPid != "700" {
		t.Fatalf("moved while a line reaches: %+v", n)
	}
}

// 同じセッション名の受け入れ済みの参加者がいても、その会話が終わっていれば退室させて新しい要求を受ける（already-participating のまま止めない）
func TestJoinBySessionNameOfAnEndedSessionAsksAgain(t *testing.T) {
	s, _ := joinWorld(t, joinStore(t))
	ended := map[string]string{aiwire.SessionPidHeader: "999999999", aiwire.SessionPidSpaceHeader: ProcessSpace()}
	got, _ := call(t, "POST", s.URL+"/api/ai/join", joinBody("L1", "work"), ended)
	var first Joined
	_ = json.Unmarshal([]byte(got), &first)
	acceptRoom(t, s.URL, first.Participant, "ひよこ")
	got, _ = call(t, "POST", s.URL+"/api/ai/join", `{"ai":"claude","model":"opus","env":"wsl-linux","sessionName":"work","link":"L2"}`, nil)
	var again Joined
	if json.Unmarshal([]byte(got), &again) != nil || !again.OK || again.Participant == first.Participant {
		t.Fatalf("join again = %s", got)
	}
	for _, row := range table(t, s.URL) {
		if row.ID == first.Participant && row.State != "" {
			t.Fatalf("the ended participant stayed: %+v", row)
		}
	}
}
