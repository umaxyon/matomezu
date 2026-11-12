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
	got, _ := call(t, "POST", url+"/api/ai/join", `{"ai":"claude","model":"opus","env":"wsl-linux","link":"`+link+`"}`, map[string]string{HostHeader: host})
	var joined Joined
	if json.Unmarshal([]byte(got), &joined) != nil || joined.Participant == "" {
		t.Fatalf("join = %s", got)
	}
	return joined.Participant
}

// wakes は、通り道 w に届いた知らせの文（待っても来なければそこまで）
func wakes(w *watcher, wait time.Duration) []string {
	var out []string
	for {
		select {
		case ev := <-w.ch:
			var wake struct{ Text string }
			_ = json.Unmarshal(ev.data, &wake)
			out = append(out, wake.Text)
		case <-time.After(wait):
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
	mine, other := hub.Watch("100"), hub.Watch("200")
	participant := joinFrom(t, s.URL, "L1", "100")
	room := makeRoom(t, s.URL, "ひよこ")
	if out := windowPerform(t, s.URL, "@matomezu/base:participant-accept", `{"workroom":"`+room+`"}`, participant); !strings.Contains(out, `"ok":true`) {
		t.Fatalf("accept = %s", out)
	}
	got := wakes(mine, 200*time.Millisecond)
	if len(got) != 1 || !strings.Contains(got[0], "accepted") || !strings.Contains(got[0], "ひよこ") {
		t.Fatalf("wakes = %q", got)
	}
	if got := wakes(other, 50*time.Millisecond); len(got) != 0 {
		t.Fatalf("another process woke: %q", got)
	}
}

// 窓で断ると「断られた」が届く。AI と常駐（利用者として行う物）が行ったアクションでは起こさない
func TestDecliningWakesAndOnlyWindowActionsWake(t *testing.T) {
	s, hub := joinWorld(t, joinStore(t))
	w := hub.Watch("100")
	first := joinFrom(t, s.URL, "L1", "100") // join の中の、AI と常駐が行うアクション（参加者を作る・郵便を送る）では起こさない
	room := makeRoom(t, s.URL, "ひよこ")
	acceptIn(t, s.URL, first, room) // 窓の印の無い（常駐が行う）受け入れでは起こさない
	if got := wakes(w, 100*time.Millisecond); len(got) != 0 {
		t.Fatalf("woke without a window: %q", got)
	}
	second := joinFrom(t, s.URL, "L2", "100")
	if out := windowPerform(t, s.URL, "@matomezu/base:participant-decline", `{}`, second); !strings.Contains(out, `"ok":true`) {
		t.Fatalf("decline = %s", out)
	}
	got := wakes(w, 200*time.Millisecond)
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
