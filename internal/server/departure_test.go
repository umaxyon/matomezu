package server

import (
	"encoding/json"
	"net/url"
	"strings"
	"testing"

	"github.com/umaxyon/matomezu/internal/aiwire"
)

// joinedWith は、セッション session を join で運ぶ参加者を作り、ワークルーム room（id）に受け入れる（occupant がいれば外して入れる）。参加者の id を返す
func joinedWith(t *testing.T, srv, link, session, room, occupant string) string {
	t.Helper()
	got, _ := call(t, "POST", srv+"/api/ai/join", `{"ai":"claude","model":"opus","env":"wsl-linux","link":"`+link+`","sessionId":"`+session+`"}`, nil)
	var joined Joined
	if json.Unmarshal([]byte(got), &joined) != nil || !joined.OK {
		t.Fatalf("join = %s", got)
	}
	args := `{"workroom":"` + room + `"}`
	if occupant != "" {
		args = `{"workroom":"` + room + `","occupant":"` + occupant + `"}`
	}
	if _, out := postPerform(t, srv, `{"action":"@matomezu/base:participant-accept","args":`+args+`,"on":{"record":"`+joined.Participant+`"},"lang":"ja","now":"2026-11-08T01:00:00.000Z"}`); !strings.Contains(out, `"ok":true`) {
		t.Fatalf("accept = %s", out)
	}
	return joined.Participant
}

// newRoom は、ワークルーム name を作り、その id を返す
func newRoom(t *testing.T, srv, name string) string {
	t.Helper()
	_, made := postPerform(t, srv, `{"action":"@matomezu/base:workroom-add","args":{"name":"`+name+`","bird":"inko"},"lang":"ja","now":"2026-11-08T00:59:00.000Z"}`)
	var out struct{ Result struct{ Workroom string } }
	if json.Unmarshal([]byte(made), &out) != nil || out.Result.Workroom == "" {
		t.Fatalf("workroom-add = %s", made)
	}
	return out.Result.Workroom
}

// sessionNotice は、参加の id を持たずにセッション id session を運ぶ呼び出し（MCP が起動し直した会話）の返事の知らせ
func sessionNotice(t *testing.T, srv, session string) string {
	t.Helper()
	_, h := call(t, "GET", srv+"/api/ai/books", "", map[string]string{aiwire.HostSessionHeader: session})
	text, _ := url.QueryUnescape(h.Get(aiwire.NoticeHeader))
	return text
}

// 受け入れで別の会話に替えられた会話には、常駐を起動し直したあとでも、次のターンの始まりのフックで 1 度だけ「別の会話が入った」と伝わり、
// 外れたと分かるセッション名（作業名ではない）も 1 度だけ渡る。同じセッションの呼び出しの返事では重ねて伝えない
func TestTakenOverSessionIsToldOnceAtItsNextTurn(t *testing.T) {
	t.Parallel()
	store := joinStore(t)
	s, _ := joinWorld(t, store)
	room := newRoom(t, s.URL, "ひよこ")
	first := joinedWith(t, s.URL, "L1", "SA", room, "")
	joinedWith(t, s.URL, "L2", "SB", room, first)

	s2, _ := joinWorld(t, store) // 常駐を起動し直す（置き場所から読み直す）
	out := talkedAs(t, s2.URL, `{"sessionId":"SA","host":"100"}`)
	if !strings.Contains(out.ForAI, "another conversation into your workroom ひよこ") || out.LeftTitle != "ひよこ (left)" || out.WorkTitle != "" {
		t.Fatalf("talked = %+v", out)
	}
	if again := talkedAs(t, s2.URL, `{"sessionId":"SA","host":"100"}`); again.ForAI != "" || again.LeftTitle != "" {
		t.Fatalf("told twice: %+v", again)
	}
	if text := sessionNotice(t, s2.URL, "SA"); text != "" {
		t.Fatalf("told again on a call: %q", text)
	}
}

// 呼び出しの返事が先に伝えても、外れたと分かるセッション名は次のターンの始まりのフックで渡る（伝える文は重ねない）
func TestTakenOverSessionToldOnACallStillGetsItsTitle(t *testing.T) {
	t.Parallel()
	s, _ := joinWorld(t, joinStore(t))
	room := newRoom(t, s.URL, "ひよこ")
	first := joinedWith(t, s.URL, "L1", "SA", room, "")
	joinedWith(t, s.URL, "L2", "SB", room, first)

	if text := sessionNotice(t, s.URL, "SA"); !strings.Contains(text, "another conversation") {
		t.Fatalf("notice = %q", text)
	}
	if text := sessionNotice(t, s.URL, "SA"); text != "" {
		t.Fatalf("told twice: %q", text)
	}
	out := talkedAs(t, s.URL, `{"sessionId":"SA","host":"100"}`)
	if out.ForAI != "" || out.LeftTitle != "ひよこ (left)" {
		t.Fatalf("talked = %+v", out)
	}
}

// 自分のセッションで同じワークルームに入り直した会話（前の自分を外して入った）には、何も残さない
func TestRejoinInTheSameSessionLeavesNoDeparture(t *testing.T) {
	t.Parallel()
	s, hub := joinWorld(t, joinStore(t))
	room := newRoom(t, s.URL, "ひよこ")
	first := joinedWith(t, s.URL, "L1", "SA", room, "")
	joinedWith(t, s.URL, "L2", "SA", room, first)

	hub.mu.Lock()
	left := len(hub.departures)
	hub.mu.Unlock()
	if left != 0 {
		t.Fatalf("departures = %+v", hub.departures)
	}
	if out := talkedAs(t, s.URL, `{"sessionId":"SA","host":"100"}`); strings.Contains(out.ForAI, "no longer") || out.LeftTitle != "" {
		t.Fatalf("talked = %+v", out)
	}
}

// 外れた訳はデータから決まる: 常駐がセッションが終わったと見て外した受け入れ済みの参加者は ended、要求中の参加者は残さない、キャンセルは cancelled
func TestDepartureReasons(t *testing.T) {
	t.Parallel()
	s, hub := joinWorld(t, joinStore(t))
	room := newRoom(t, s.URL, "ひよこ")
	ended := joinedWith(t, s.URL, "L1", "SA", room, "")
	if err := hub.leaveEnded(ended); err != nil {
		t.Fatal(err)
	}
	asked := func(link, session string) string {
		got, _ := call(t, "POST", s.URL+"/api/ai/join", `{"ai":"claude","model":"opus","env":"wsl-linux","link":"`+link+`","sessionId":"`+session+`"}`, nil)
		var joined Joined
		_ = json.Unmarshal([]byte(got), &joined)
		return joined.Participant
	}
	quiet := asked("L2", "SB")
	if err := hub.leaveEnded(quiet); err != nil {
		t.Fatal(err)
	}
	cancelled := asked("L3", "SC")
	if _, out := postPerform(t, s.URL, `{"action":"@matomezu/base:participant-cancel","args":{},"on":{"record":"`+cancelled+`"},"lang":"ja","now":"2026-11-08T01:00:00.000Z"}`); !strings.Contains(out, `"ok":true`) {
		t.Fatalf("cancel = %s", out)
	}

	hub.mu.Lock()
	got := map[string]string{}
	for _, d := range hub.departures {
		got[d.Participant] = d.Why
	}
	hub.mu.Unlock()
	if len(got) != 2 || got[ended] != departEnded || got[cancelled] != departCancelled {
		t.Fatalf("departures = %v", got)
	}
}
