package server

import (
	"bufio"
	"encoding/json"
	"net/http"
	"strings"
	"testing"
	"time"
)

// windowPerform は、窓 c1 からアクションを行う（窓のアクションだけが AI を起こす）
func windowPerform(t *testing.T, url, action, args, record string) string {
	t.Helper()
	got, _ := call(t, "POST", url+"/api/perform", `{"action":"`+action+`","args":`+args+`,"on":{"record":"`+record+`"},"lang":"ja","now":"2026-11-08T01:00:00.000Z","client":"c1"}`, nil)
	return got
}

// joinFrom は、プロセス id host の AI として参加を頼み、参加の id を返す
func joinFrom(t *testing.T, url, link, host string) string {
	t.Helper()
	return joinFromSession(t, url, link, host, "")
}

// joinFromSession は、プロセス id host・立てたときのセッション id session の AI として参加を頼み、参加の id を返す
func joinFromSession(t *testing.T, url, link, host, session string) string {
	t.Helper()
	got, _ := call(t, "POST", url+"/api/ai/join", `{"ai":"claude","model":"opus","env":"wsl-linux","link":"`+link+`"}`, map[string]string{HostHeader: host, HostSessionHeader: session})
	var joined Joined
	if json.Unmarshal([]byte(got), &joined) != nil || joined.Participant == "" {
		t.Fatalf("join = %s", got)
	}
	return joined.Participant
}

// wakes は、通り道 l に届いている知らせの文（知らせはアクションの返事より前に入るので、待たない）
func wakes(l *wakeLine) []string {
	var out []string
	for {
		select {
		case ev := <-l.ch:
			var wake struct{ Text string }
			_ = json.Unmarshal(ev.data, &wake)
			out = append(out, wake.Text)
		default:
			return out
		}
	}
}

func makeRoom(t *testing.T, url, name string) string {
	t.Helper()
	made, _ := call(t, "POST", url+"/api/perform", `{"action":"@matomezu/base:workroom-add","args":{"name":"`+name+`","bird":"inko"},"lang":"ja","now":"2026-11-08T00:59:00.000Z"}`, nil)
	var out struct{ Result struct{ Workroom string } }
	if json.Unmarshal([]byte(made), &out) != nil || out.Result.Workroom == "" {
		t.Fatalf("workroom-add = %s", made)
	}
	return out.Result.Workroom
}

// 窓で受け入れると、その参加者が join したプロセス id の通り道にだけ、ワークルーム名つきの 1 行が届く
func TestAcceptingWakesOnlyTheJoinedProcess(t *testing.T) {
	s, hub := joinWorld(t, joinStore(t))
	mine, other := hub.OpenWakes("100", ""), hub.OpenWakes("200", "")
	participant := joinFrom(t, s.URL, "L1", "100")
	room := makeRoom(t, s.URL, "ひよこ")
	if out := windowPerform(t, s.URL, "@matomezu/base:participant-accept", `{"workroom":"`+room+`"}`, participant); !strings.Contains(out, `"ok":true`) {
		t.Fatalf("accept = %s", out)
	}
	got := wakes(mine)
	if len(got) != 1 || !strings.Contains(got[0], "accepted") || !strings.Contains(got[0], "ひよこ") {
		t.Fatalf("wakes = %q", got)
	}
	if got := wakes(other); len(got) != 0 {
		t.Fatalf("another process woke: %q", got)
	}
}

// 窓で断ると「断られた」が届く。AI と常駐（利用者として行う物）が行ったアクションでは起こさない
func TestDecliningWakesAndOnlyWindowActionsWake(t *testing.T) {
	s, hub := joinWorld(t, joinStore(t))
	w := hub.OpenWakes("100", "")
	first := joinFrom(t, s.URL, "L1", "100") // join の中の、AI と常駐が行うアクション（参加者を作る・郵便を送る）では起こさない
	room := makeRoom(t, s.URL, "ひよこ")
	acceptIn(t, s.URL, first, room) // 窓の印の無い（常駐が行う）受け入れでは起こさない
	if got := wakes(w); len(got) != 0 {
		t.Fatalf("woke without a window: %q", got)
	}
	second := joinFrom(t, s.URL, "L2", "100")
	if out := windowPerform(t, s.URL, "@matomezu/base:participant-decline", `{}`, second); !strings.Contains(out, `"ok":true`) {
		t.Fatalf("decline = %s", out)
	}
	got := wakes(w)
	if len(got) != 1 || !strings.Contains(got[0], "declined") {
		t.Fatalf("wakes = %q", got)
	}
}

// GET /api/ai/watch は合言葉で通し、host が無ければ断り、届いた知らせを SSE の wake で流す
func TestWatchStreamsWakes(t *testing.T) {
	s, _ := joinWorld(t, joinStore(t))
	if got, _ := call(t, "GET", s.URL+"/api/ai/watch", "", nil); !strings.Contains(got, "host") {
		t.Fatalf("without host = %s", got)
	}
	req, _ := http.NewRequest("GET", s.URL+"/api/ai/watch?host=100", nil)
	req.Header.Set("Authorization", "Bearer secret")
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer res.Body.Close()
	participant := joinFrom(t, s.URL, "L1", "100")
	windowPerform(t, s.URL, "@matomezu/base:participant-decline", `{}`, participant)
	lines := make(chan string)
	go func() {
		scan := bufio.NewScanner(res.Body)
		for scan.Scan() {
			lines <- scan.Text()
		}
	}()
	deadline := time.After(2 * time.Second)
	for event := ""; ; {
		select {
		case line := <-lines:
			if line == "event: wake" {
				event = "wake"
			} else if event == "wake" && strings.HasPrefix(line, "data: ") {
				if !strings.Contains(line, "declined") {
					t.Fatalf("data = %s", line)
				}
				return
			}
		case <-deadline:
			t.Fatal("no wake came")
		}
	}
}

// 起こされたターン（woken）のフックは、利用者トリガートークのときのアクションを行わず、プロセス id が合うだけでは結ばない。会話の記録の link で結び、「参加しました」を 1 度だけ返す
func TestWokenTurnBindsByLinkAndWelcomesOnce(t *testing.T) {
	s, hub := joinWorld(t, joinStore(t))
	line := hub.OpenWakes("100", "")
	participant := joinFrom(t, s.URL, "6f1c2a3e-1111-4222-8333-444455556666", "100")
	room := makeRoom(t, s.URL, "ひよこ")
	windowPerform(t, s.URL, "@matomezu/base:participant-accept", `{"workroom":"`+room+`"}`, participant)
	if got := wakes(line); len(got) != 1 {
		t.Fatalf("wakes = %q", got)
	}
	// プロセス id が合うだけでは結ばない（記録を調べる値打ちがあると返す）
	out, _ := call(t, "POST", s.URL+"/api/ai/talked", `{"sessionId":"S9","host":"100","woken":true}`, nil)
	if !strings.Contains(out, `"welcomes":[]`) || !strings.Contains(out, `"unbound":true`) {
		t.Fatalf("woken talk = %s", out)
	}
	out, _ = call(t, "POST", s.URL+"/api/ai/talked", `{"sessionId":"S9","host":"100","woken":true,"candidates":["6f1c2a3e-1111-4222-8333-444455556666"]}`, nil)
	if !strings.Contains(out, "ひよこ") {
		t.Fatalf("bound by link = %s", out)
	}
	if out, _ := call(t, "POST", s.URL+"/api/ai/talked", `{"sessionId":"S9","host":"100","woken":true}`, nil); !strings.Contains(out, `"welcomes":[]`) {
		t.Fatalf("welcomed twice = %s", out)
	}
}

// MCP と通り道の両方が立てたときのセッション id を添えていれば、それも合う通り道だけに届く（プロセス id が使い回された別の AI のプログラムには届かない）。どちらかが無ければプロセス id だけで決める
func TestWakeNeedsTheSameHostSessionWhenBothAreKnown(t *testing.T) {
	s, hub := joinWorld(t, joinStore(t))
	same, reused, unknown := hub.OpenWakes("100", "HS1"), hub.OpenWakes("100", "HS2"), hub.OpenWakes("100", "")
	participant := joinFromSession(t, s.URL, "L1", "100", "HS1")
	windowPerform(t, s.URL, "@matomezu/base:participant-decline", `{}`, participant)
	if len(wakes(same)) != 1 || len(wakes(reused)) != 0 || len(wakes(unknown)) != 1 {
		t.Fatal("wakes went to the wrong lines")
	}
}
