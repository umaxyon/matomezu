package server

import (
	"encoding/json"
	"net"
	"net/http"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/umaxyon/matomezu/internal/peer"
)

// testHost は、ホストどうしの入口を hub に用意する（127.0.0.1 だけで待つ）。覚えたポートは *saved に入る
func testHost(t *testing.T, h *Hub, port int, saved *int) *peer.Identity {
	t.Helper()
	id, err := peer.LoadOrCreate(filepath.Join(t.TempDir(), "host.key"))
	if err != nil {
		t.Fatal(err)
	}
	h.SetHostEntrance(HostConfig{
		Identity:   id,
		Port:       port,
		SavePort:   func(p int) error { *saved = p; return nil },
		OSHostName: "desk",
		Loopback:   true,
	})
	t.Cleanup(h.CloseHostEntrance)
	return id
}

func setHostSettings(t *testing.T, h *Hub, values string) {
	t.Helper()
	if out, err := h.Perform(performOne("@matomezu/base:settings-set", json.RawMessage(`{"values":`+values+`}`), nil)); err != nil || !out.OK {
		t.Fatalf("settings-set = %+v, %v", out, err)
	}
}

// waitHost は、入口の様子が ok になるまで待つ（開け閉めは h.mu の外で、あとから行う）
func waitHost(t *testing.T, h *Hub, ok func(HostStatus) bool) HostStatus {
	t.Helper()
	deadline := time.Now().Add(5 * time.Second)
	for {
		s := h.HostStatus()
		if ok(s) {
			return s
		}
		if time.Now().After(deadline) {
			t.Fatalf("host status = %+v", s)
		}
		time.Sleep(10 * time.Millisecond)
	}
}

func askPairing(t *testing.T, s HostStatus) map[string]any {
	t.Helper()
	other, err := peer.LoadOrCreate(filepath.Join(t.TempDir(), "other.key"))
	if err != nil {
		t.Fatal(err)
	}
	commit := `{"step":"commit","name":"other","userName":"","port":1,"commit":"` + peer.CommitOf(peer.NewNonce()) + `"}`
	res, err := peer.Client(other, s.HostID, peer.Protocol, 5*time.Second).Post("https://"+net.JoinHostPort("127.0.0.1", strconv.Itoa(s.Port))+peer.PairingPath, "application/json", strings.NewReader(commit))
	if err != nil {
		t.Fatal(err)
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		t.Fatalf("pairing = %d", res.StatusCode)
	}
	var body map[string]any
	if err := json.NewDecoder(res.Body).Decode(&body); err != nil {
		t.Fatal(err)
	}
	return body
}

// 「ほかのホストとつなぐ」が入なら入口を開き、ペアリングの頼みに名前とホスト id を答える。切なら閉じる。取ったポートは覚え、開き直しても同じ番号で待つ
func TestTheHostEntranceFollowsTheSetting(t *testing.T) {
	h := emptyHub(t)
	saved := 0
	id := testHost(t, h, 0, &saved)
	if s := waitHost(t, h, func(s HostStatus) bool { return s.HostID != "" }); s.Open || s.Name != "desk" {
		t.Fatalf("before = %+v", s)
	}
	w := h.Join()
	<-w.ch // hello

	setHostSettings(t, h, `{"@matomezu/network:connect-hosts":true,"@matomezu/network:host-name":"Masa の Mac"}`)
	s := waitHost(t, h, func(s HostStatus) bool { return s.Open })
	if s.Port == 0 || saved != s.Port || s.Name != "Masa の Mac" || s.HostID != id.HostID {
		t.Fatalf("open = %+v (saved %d)", s, saved)
	}
	body := askPairing(t, s)
	if body["hostId"] != id.HostID || body["name"] != "Masa の Mac" || body["nonce"] == "" {
		t.Fatalf("pairing body = %v", body)
	}
	told := false
	for !told {
		select {
		case e := <-w.ch:
			told = e.name == "host-status"
		case <-time.After(5 * time.Second):
			t.Fatal("the windows were not told")
		}
	}

	port := s.Port
	setHostSettings(t, h, `{"@matomezu/network:connect-hosts":false}`)
	s = waitHost(t, h, func(s HostStatus) bool { return !s.Open })
	if s.Port != 0 || s.Addrs != nil {
		t.Fatalf("closed = %+v", s)
	}
	if c, err := net.DialTimeout("tcp", net.JoinHostPort("127.0.0.1", strconv.Itoa(port)), time.Second); err == nil {
		c.Close()
		t.Fatal("the entrance still listens after it was turned off")
	}

	setHostSettings(t, h, `{"@matomezu/network:connect-hosts":true}`)
	if s = waitHost(t, h, func(s HostStatus) bool { return s.Open }); s.Port != port {
		t.Fatalf("reopened on %d, kept %d", s.Port, port)
	}
}

// 覚えたポートがほかに使われていれば、取り直さずに開かず、そのポートと port-in-use を見せる。空けば、入れ直して同じ番号で開く
func TestTheHostEntranceDoesNotTakeAnotherPortWhenTheKeptOneIsTaken(t *testing.T) {
	taken, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	kept := taken.Addr().(*net.TCPAddr).Port
	h := emptyHub(t)
	saved := 0
	testHost(t, h, kept, &saved)
	setHostSettings(t, h, `{"@matomezu/network:connect-hosts":true}`)
	s := waitHost(t, h, func(s HostStatus) bool { return s.Failed != "" })
	if s.Open || s.Failed != HostPortInUse || s.Port != kept || saved != 0 {
		t.Fatalf("taken = %+v, saved %d", s, saved)
	}
	taken.Close()
	setHostSettings(t, h, `{"@matomezu/network:connect-hosts":false}`)
	waitHost(t, h, func(s HostStatus) bool { return s.Failed == "" })
	setHostSettings(t, h, `{"@matomezu/network:connect-hosts":true}`)
	if s = waitHost(t, h, func(s HostStatus) bool { return s.Open }); s.Port != kept {
		t.Fatalf("reopened = %+v, kept %d", s, kept)
	}
}

// 入口が自分で止まれば（閉じたのでなく）、開いていない様子（listen）にして窓に知らせる
func TestTheHostEntranceTellsWhenItStops(t *testing.T) {
	h := emptyHub(t)
	saved := 0
	testHost(t, h, 0, &saved)
	setHostSettings(t, h, `{"@matomezu/network:connect-hosts":true}`)
	waitHost(t, h, func(s HostStatus) bool { return s.Open })
	w := h.Join()
	<-w.ch // hello
	e := h.entrance.Load()
	e.mu.Lock()
	e.ln.Close()
	e.mu.Unlock()
	if s := waitHost(t, h, func(s HostStatus) bool { return !s.Open }); s.Failed != HostListen {
		t.Fatalf("stopped = %+v", s)
	}
	for {
		select {
		case ev := <-w.ch:
			if ev.name == "host-status" {
				return
			}
		case <-time.After(5 * time.Second):
			t.Fatal("the windows were not told")
		}
	}
}

// AI は「ほかのホストとつなぐ」を変えられない（利用者だけが変える項目）
func TestAICannotTurnOnTheHostEntrance(t *testing.T) {
	h := emptyHub(t)
	saved := 0
	testHost(t, h, 0, &saved)
	ai, err := h.joinedAIForTest()
	if err != nil {
		t.Fatal(err)
	}
	p := performOne("@matomezu/base:settings-set", json.RawMessage(`{"values":{"@matomezu/network:connect-hosts":true}}`), nil)
	p.By, p.Participant = "ai", ai
	if out, err := h.Perform(p); err != nil || out.OK || !strings.Contains(out.Detail, "only by the user") {
		t.Fatalf("the AI's settings-set = %+v, %v", out, err)
	}
	time.Sleep(50 * time.Millisecond)
	if h.HostStatus().Open {
		t.Fatal("the entrance opened")
	}
}

// 常駐が止まるとき（CloseHostEntrance）のあとは、設定が入のままでも開き直さない
func TestTheHostEntranceStaysClosedAfterCloseHostEntrance(t *testing.T) {
	h := emptyHub(t)
	saved := 0
	testHost(t, h, 0, &saved)
	setHostSettings(t, h, `{"@matomezu/network:connect-hosts":true}`)
	port := waitHost(t, h, func(s HostStatus) bool { return s.Open }).Port
	h.CloseHostEntrance()
	setHostSettings(t, h, `{"@matomezu/network:host-name":"again"}`)
	time.Sleep(50 * time.Millisecond)
	if c, err := net.DialTimeout("tcp", net.JoinHostPort("127.0.0.1", strconv.Itoa(port)), time.Second); err == nil {
		c.Close()
		t.Fatal("the entrance opened again after CloseHostEntrance")
	}
}

// 覚えたポートが使われているとき、利用者が選び直すと、空いている番号で開いてその番号を覚える。使われていなければ断る
func TestRepickingTheHostPortOpensOnAFreeOne(t *testing.T) {
	taken, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer taken.Close()
	kept := taken.Addr().(*net.TCPAddr).Port
	h := emptyHub(t)
	saved := 0
	testHost(t, h, kept, &saved)
	setHostSettings(t, h, `{"@matomezu/network:connect-hosts":true}`)
	waitHost(t, h, func(s HostStatus) bool { return s.Failed == HostPortInUse })
	if err := h.RepickHostPort(); err != nil {
		t.Fatal(err)
	}
	s := waitHost(t, h, func(s HostStatus) bool { return s.Open })
	if s.Port == kept || saved != s.Port || s.Failed != "" {
		t.Fatalf("repicked = %+v, saved %d, kept %d", s, saved, kept)
	}
	if err := h.RepickHostPort(); err == nil {
		t.Fatal("repicked an open entrance")
	}
}
