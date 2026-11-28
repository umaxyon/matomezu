package server

import (
	"bufio"
	"encoding/json"
	"net/http"
	"net/url"
	"strings"
	"testing"
	"time"

	"github.com/umaxyon/matomezu/internal/aiwire"
)

// windowPerform は、窓 c1 からアクションを行う（窓のアクションだけが AI を起こす）
func windowPerform(t *testing.T, url, action, args, record string) string {
	t.Helper()
	_, got := postPerform(t, url, `{"action":"`+action+`","args":`+args+`,"on":{"record":"`+record+`"},"lang":"ja","now":"2026-11-08T01:00:00.000Z","client":"c1"}`)
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
	got, _ := call(t, "POST", url+"/api/ai/join", `{"ai":"claude","model":"opus","env":"wsl-linux","link":"`+link+`"}`, map[string]string{aiwire.HostHeader: host, aiwire.HostSessionHeader: session})
	var joined Joined
	if json.Unmarshal([]byte(got), &joined) != nil || joined.Participant == "" {
		t.Fatalf("join = %s", got)
	}
	return joined.Participant
}

// wakes は、通り道 l に流れる知らせの文の全部（流すたびに「渡せた」を返す。知らせはアクションの返事より前に入るので、待たない）
func wakes(hub *Hub, l *wakeLine) []string {
	var out []string
	for {
		it, ok := hub.nextWake(l, time.Now())
		if !ok {
			return out
		}
		out = append(out, it.Text)
		hub.AckWake(l.id, it.ID, WakeDelivered, time.Now())
	}
}

func makeRoom(t *testing.T, url, name string) string {
	t.Helper()
	_, made := postPerform(t, url, `{"action":"@matomezu/base:workroom-add","args":{"name":"`+name+`","bird":"inko"},"lang":"ja","now":"2026-11-08T00:59:00.000Z"}`)
	var out struct{ Result struct{ Workroom string } }
	if json.Unmarshal([]byte(made), &out) != nil || out.Result.Workroom == "" {
		t.Fatalf("workroom-add = %s", made)
	}
	return out.Result.Workroom
}

// 窓で受け入れると、その参加者が join したプロセス id の通り道にだけ、ワークルーム名つきの 1 行が届く
func TestAcceptingWakesOnlyTheJoinedProcess(t *testing.T) {
	t.Parallel()
	s, hub := joinWorld(t, joinStore(t))
	mine, other := hub.OpenWakesWith("100", "", "", WakeLimits{}), hub.OpenWakesWith("200", "", "", WakeLimits{})
	participant := joinFrom(t, s.URL, "L1", "100")
	room := makeRoom(t, s.URL, "ひよこ")
	if out := windowPerform(t, s.URL, "@matomezu/base:participant-accept", `{"workroom":"`+room+`"}`, participant); !strings.Contains(out, `"ok":true`) {
		t.Fatalf("accept = %s", out)
	}
	got := wakes(hub, mine)
	if len(got) != 1 || !strings.Contains(got[0], "joined as") || !strings.Contains(got[0], "ひよこ") {
		t.Fatalf("wakes = %q", got)
	}
	if got := wakes(hub, other); len(got) != 0 {
		t.Fatalf("another process woke: %q", got)
	}
}

// 窓で断ると「断られた」が届く。AI と常駐（利用者として行う物）が行ったアクションでは起こさない
func TestDecliningWakesAndOnlyWindowActionsWake(t *testing.T) {
	t.Parallel()
	s, hub := joinWorld(t, joinStore(t))
	w := hub.OpenWakesWith("100", "", "", WakeLimits{})
	first := joinFrom(t, s.URL, "L1", "100") // join の中の、AI と常駐が行うアクション（参加者を作る・郵便を送る）では起こさない
	room := makeRoom(t, s.URL, "ひよこ")
	acceptIn(t, s.URL, first, room) // 窓の印の無い（常駐が行う）受け入れでは起こさない
	if got := wakes(hub, w); len(got) != 0 {
		t.Fatalf("woke without a window: %q", got)
	}
	second := joinFrom(t, s.URL, "L2", "100")
	if out := windowPerform(t, s.URL, "@matomezu/base:participant-decline", `{}`, second); !strings.Contains(out, `"ok":true`) {
		t.Fatalf("decline = %s", out)
	}
	got := wakes(hub, w)
	if len(got) != 1 || !strings.Contains(got[0], "declined") {
		t.Fatalf("wakes = %q", got)
	}
}

// 窓でキャンセルすると、断りでなく「キャンセルされた」が届き、次の呼び出しにも同じ文を 1 度だけ返す
func TestCancellingWakesAsCancelled(t *testing.T) {
	t.Parallel()
	s, hub := joinWorld(t, joinStore(t))
	w := hub.OpenWakesWith("100", "", "", WakeLimits{})
	participant := joinFrom(t, s.URL, "L1", "100")
	if out := windowPerform(t, s.URL, "@matomezu/base:participant-cancel", `{}`, participant); !strings.Contains(out, `"ok":true`) {
		t.Fatalf("cancel = %s", out)
	}
	got := wakes(hub, w)
	if len(got) != 1 || !strings.Contains(got[0], "join cancelled") || strings.Contains(got[0], "declined") {
		t.Fatalf("wakes = %q", got)
	}
	id := map[string]string{aiwire.ParticipantHeader: participant}
	_, h := call(t, "GET", s.URL+"/api/ai/books", "", id)
	if text, _ := url.QueryUnescape(h.Get(aiwire.NoticeHeader)); !strings.Contains(text, "cancelled your request") {
		t.Fatalf("notice = %q", text)
	}
	if _, h := call(t, "GET", s.URL+"/api/ai/books", "", id); h.Get(aiwire.NoticeHeader) != "" {
		t.Fatalf("told twice: %q", h.Get(aiwire.NoticeHeader))
	}
	// キャンセルのあとは、同じ link で頼み直せる（新しい要求）
	again := joinFrom(t, s.URL, "L1", "100")
	if again == participant {
		t.Fatalf("asking again returned the cancelled id")
	}
}

// GET /api/ai/watch は合言葉で通し、host が無ければ断り、届いた知らせを SSE の wake で流す
func TestWatchStreamsWakes(t *testing.T) {
	t.Parallel()
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
	t.Parallel()
	s, hub := joinWorld(t, joinStore(t))
	line := hub.OpenWakesWith("100", "", "", WakeLimits{})
	participant := joinFrom(t, s.URL, "6f1c2a3e-1111-4222-8333-444455556666", "100")
	room := makeRoom(t, s.URL, "ひよこ")
	windowPerform(t, s.URL, "@matomezu/base:participant-accept", `{"workroom":"`+room+`"}`, participant)
	if got := wakes(hub, line); len(got) != 1 {
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

// MCP と通り道の両方が立てたときのセッション id を添えていれば、それも合う通り道だけに届く（プロセス id が使い回された別の AI のプログラムには届かない）。どちらかが無ければプロセス id だけで決める。届くのは 1 度だけ
func TestWakeNeedsTheSameHostSessionWhenBothAreKnown(t *testing.T) {
	t.Parallel()
	s, hub := joinWorld(t, joinStore(t))
	same, reused, unknown := hub.OpenWakesWith("100", "", "HS1", WakeLimits{}), hub.OpenWakesWith("100", "", "HS2", WakeLimits{}), hub.OpenWakesWith("100", "", "", WakeLimits{})
	participant := joinFromSession(t, s.URL, "L1", "100", "HS1")
	windowPerform(t, s.URL, "@matomezu/base:participant-decline", `{}`, participant)
	if len(wakes(hub, reused)) != 0 {
		t.Fatal("a line of another session got the wake")
	}
	// 合う通り道が 2 本あっても、先に取った方が行列から外すので、届くのは 1 度だけ
	if n := len(wakes(hub, same)) + len(wakes(hub, unknown)); n != 1 {
		t.Fatalf("wakes = %d, want 1", n)
	}
}

// AI のプログラムまでたどれない通り道（Windows の Claude Code の monitor）と MCP は、立てたときのセッション id だけでも合う。
// 片方にしか無い id は比べず、両方に無ければ合わない
func TestWakeReachesBySessionWhenTheHostIsUnknown(t *testing.T) {
	t.Parallel()
	for _, c := range []struct {
		name                  string
		lineHost, lineSession string
		wakeHost, wakeSession string
		want                  bool
	}{
		{"host and session", "100", "S1", "100", "S1", true},
		{"host only", "100", "", "100", "S1", true},
		{"session only on the line", "", "S1", "100", "S1", true},
		{"session only on the join", "100", "S1", "", "S1", true},
		{"session differs", "", "S2", "100", "S1", false},
		{"host differs", "200", "S1", "100", "S1", false},
		{"nothing in common", "100", "", "", "S1", false},
		{"nothing known", "", "", "", "", false},
		{"a later session of the host", "100", "S0", "100", "S2", true},
		{"a later session, but the host differs", "200", "S0", "100", "S2", false},
	} {
		l := &wakeLine{program: aiProgram{Host: c.lineHost}, session: c.lineSession, laterSessions: map[string]bool{"S2": true}}
		if got := l.reaches(participantNote{WakeHost: c.wakeHost, WakeSession: c.wakeSession}); got != c.want {
			t.Errorf("%s: reaches = %v, want %v", c.name, got, c.want)
		}
	}
}

// /clear のあとに立て直した MCP が新しい会話の id で join しても、フック（ターンの始まり・モデル・コンテキストの量のどれでも）がその会話を知らせていれば、
// 立てたときの id のままの通り道に受け入れの知らせが届く
func TestAcceptingAfterClearWakesTheLineOfTheFirstSession(t *testing.T) {
	t.Parallel()
	for _, c := range []struct{ path, body string }{
		{"/api/ai/talked", `{"sessionId":"S2","host":"100","hostSpace":"WSL"}`},
		{"/api/ai/model", `{"sessionId":"S2","model":"opus","host":"100","hostSpace":"WSL"}`},
		{"/api/ai/context-use", `{"sessionId":"S2","host":"100","hostSpace":"WSL","contextUse":"unknown"}`},
	} {
		s, hub := joinWorld(t, joinStore(t))
		line := hub.OpenWakesWith("100", "WSL", "S0", WakeLimits{})
		call(t, "POST", s.URL+c.path, c.body, nil)
		participant := joinFromSession(t, s.URL, "L1", "100", "S2")
		room := makeRoom(t, s.URL, "ひよこ")
		windowPerform(t, s.URL, "@matomezu/base:participant-accept", `{"workroom":"`+room+`"}`, participant)
		if got := wakes(hub, line); len(got) != 1 || !strings.Contains(got[0], "ひよこ") {
			t.Fatalf("%s: wakes = %q", c.path, got)
		}
	}
}

// 受け入れの知らせが先に溜まっていても、あとからフックがその会話を知らせれば流れる。通り道が切れてつなぎ直しても、覚えた会話は残る
func TestLaterSessionReachesQueuedWakesAndReconnectedLines(t *testing.T) {
	t.Parallel()
	s, hub := joinWorld(t, joinStore(t))
	hub.CloseWakes(hub.OpenWakesWith("100", "WSL", "S0", WakeLimits{}))
	participant := joinFromSession(t, s.URL, "L1", "100", "S2")
	room := makeRoom(t, s.URL, "ひよこ")
	windowPerform(t, s.URL, "@matomezu/base:participant-accept", `{"workroom":"`+room+`"}`, participant)
	line := hub.OpenWakesWith("100", "WSL", "S0", WakeLimits{})
	if got := wakes(hub, line); len(got) != 0 {
		t.Fatalf("woke before the hook: %q", got)
	}
	hub.NoteLaterSession("S2", aiProgram{"100", "WSL"})
	hub.CloseWakes(line)
	again := hub.OpenWakesWith("100", "WSL", "S0", WakeLimits{})
	if got := wakes(hub, again); len(got) != 1 || !strings.Contains(got[0], "ひよこ") {
		t.Fatalf("wakes = %q", got)
	}
}

// 後の会話を覚えるのは、フックの AI のプログラムと同じプロセス id・同じ範囲の印のプログラムだけ
// （ほかのプロセス・WSL と Windows のように範囲の違うプロセス・使い回されたプロセス id のほかのプログラムは覚えない。範囲の印を添えない watch の通り道は覚える）
func TestLaterSessionsStayWithTheProgram(t *testing.T) {
	t.Parallel()
	_, hub := joinWorld(t, joinStore(t))
	note := participantNote{WakeHost: "100", WakeSession: "S2"}
	other := hub.OpenWakesWith("200", "WSL", "S0", WakeLimits{})
	unmarked := hub.OpenWakesWith("100", "", "S1", WakeLimits{})
	windows := hub.OpenWakesWith("100", "Windows", "S0", WakeLimits{})
	learned := hub.OpenWakesWith("100", "WSL", "S0", WakeLimits{})
	hub.NoteLaterSession("S2", aiProgram{"100", "WSL"})
	reused := hub.OpenWakesWith("100", "WSL", "S9", WakeLimits{})
	hub.mu.Lock()
	defer hub.mu.Unlock()
	for _, c := range []struct {
		name string
		line *wakeLine
		note participantNote
		want bool
	}{
		{"the line of the program", learned, note, true},
		{"a line of the program that sends no space", unmarked, note, true},
		{"a line of another process", other, participantNote{WakeHost: "200", WakeSession: "S2"}, false},
		{"a line of the same process id in another space", windows, note, false},
		{"a line of another program at a reused process id", reused, note, false},
	} {
		if got := c.line.reaches(c.note); got != c.want {
			t.Errorf("%s: reaches = %v, want %v", c.name, got, c.want)
		}
	}
}

// MCP が AI のプログラムを名乗れなくても、セッション id を添えていれば、その通り道に知らせが届く
func TestWakeWithoutHostReachesTheSession(t *testing.T) {
	t.Parallel()
	s, hub := joinWorld(t, joinStore(t))
	line := hub.OpenWakesWith("", "", "HS1", WakeLimits{})
	participant := joinFromSession(t, s.URL, "L1", "", "HS1")
	windowPerform(t, s.URL, "@matomezu/base:participant-decline", `{}`, participant)
	if len(wakes(hub, line)) != 1 {
		t.Fatal("the line of the session did not get the wake")
	}
}
