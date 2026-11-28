package server

import (
	"bufio"
	"encoding/json"
	"io"
	"net"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/umaxyon/matomezu/internal/peer"
)

// fakeWSLProxy は、WSLプロキシの代わり: 最初の行を start に渡し、answer の行を返して（end なら、または最初の行が JSON でなければそこで終わる）、
// 標準入力が閉じるか f.end が閉じるまで待つ。answer の n は、立てた回数（1 から）。流すのはテストが LAN の相手の代わりに行う（forward）
type fakeWSLProxy struct {
	answer  func(n int) (lines []string, end bool)
	end     chan struct{}
	start   chan peer.WSLProxyStart
	stopped chan struct{}
	mu      sync.Mutex
	n       int
}

func newFakeWSLProxy(firstLine string, more ...string) *fakeWSLProxy {
	return scriptedWSLProxy(func(int) ([]string, bool) {
		return append([]string{firstLine}, more...), !strings.HasPrefix(firstLine, "{") // 立たない matomezu は、何か言って終わる
	})
}

func scriptedWSLProxy(answer func(n int) ([]string, bool)) *fakeWSLProxy {
	return &fakeWSLProxy{answer: answer, end: make(chan struct{}), start: make(chan peer.WSLProxyStart, 8), stopped: make(chan struct{}, 8)}
}

func (f *fakeWSLProxy) launch() (peer.WSLProxyProcess, error) {
	f.mu.Lock()
	f.n++
	lines, end := f.answer(f.n)
	f.mu.Unlock()
	inR, inW := io.Pipe()
	outR, outW := io.Pipe()
	go func() {
		sc := bufio.NewScanner(inR)
		if sc.Scan() {
			var s peer.WSLProxyStart
			_ = json.Unmarshal(sc.Bytes(), &s)
			f.start <- s
			for _, l := range lines {
				_, _ = io.WriteString(outW, l+"\n")
			}
			if end {
				_ = outW.Close()
			}
			go func() {
				<-f.end
				_ = outW.Close()
			}()
		}
		for sc.Scan() {
		}
		_ = outW.Close()
		f.stopped <- struct{}{}
	}()
	return peer.WSLProxyProcess{Stdin: inW, Stdout: outR}, nil
}

// started は、WSLプロキシが立てられるのを待つ（5 秒で来なければ落とす）
func (f *fakeWSLProxy) started(t *testing.T) peer.WSLProxyStart {
	t.Helper()
	select {
	case s := <-f.start:
		return s
	case <-time.After(5 * time.Second):
		t.Fatal("the WSL proxy was not started")
		return peer.WSLProxyStart{}
	}
}

// quickRestarts は、WSLプロキシの立て直しの間を waits にする（テストのあいだだけ）
func quickRestarts(t *testing.T, waits ...time.Duration) {
	t.Helper()
	old := wslRestartWaits
	wslRestartWaits = waits
	t.Cleanup(func() { wslRestartWaits = old })
}

// openWSLHost は、WSLプロキシを立てる WSL のホストを組む
func openWSLHost(t *testing.T, f *fakeWSLProxy) (*Hub, HostStatus, peer.WSLProxyStart) {
	t.Helper()
	h := emptyHub(t)
	id, err := peer.LoadOrCreate(filepath.Join(t.TempDir(), "host.key"))
	if err != nil {
		t.Fatal(err)
	}
	h.SetHostEntrance(HostConfig{Identity: id, OSHostName: "wsl", Loopback: true, WSL: true, WSLProxy: f.launch})
	t.Cleanup(h.CloseHostEntrance)
	setHostSettings(t, h, `{"@matomezu/network:connect-hosts":true,"@matomezu/network:host-name":"wsl","@matomezu/base:user-name":"wsl-user"}`)
	s := waitHost(t, h, func(s HostStatus) bool { return s.Open })
	return h, s, <-f.start
}

// forwardAs は、LAN の相手の代わりに WSLプロキシの流しをする口を開く: 来た接続を、頭の行（元の相手の番地 from）を付けて WSL の受け口へ流す
func forwardAs(t *testing.T, start peer.WSLProxyStart, from string) string {
	t.Helper()
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { ln.Close() })
	target := start.Targets[len(start.Targets)-1]
	go func() {
		for {
			c, err := ln.Accept()
			if err != nil {
				return
			}
			go func() {
				defer c.Close()
				u, err := net.Dial("tcp", target)
				if err != nil {
					return
				}
				defer u.Close()
				_, _ = io.WriteString(u, "MZWP "+start.Secret+" "+from+"\n")
				go func() { _, _ = io.Copy(u, c) }()
				_, _ = io.Copy(c, u)
			}()
		}
	}()
	return ln.Addr().String()
}

// WSLプロキシは WSL の入口と同じポートで待つよう頼まれ、名乗る中身は WSL のホストの物。様子は窓に見せ、入口を閉じると WSLプロキシも終わる
func TestTheWSLProxyStartsWithTheEntrance(t *testing.T) {
	f := newFakeWSLProxy(`{"v":1,"ready":true,"addrs":["192.168.1.20"]}`)
	h, s, start := openWSLHost(t, f)
	if start.Port != s.Port || start.Advert.HostID != s.HostID || start.Advert.Port != s.Port || start.Advert.Name != "wsl" || start.Secret == "" {
		t.Fatalf("start = %+v, status = %+v", start, s)
	}
	s = waitHost(t, h, func(s HostStatus) bool { return s.WSLProxy == peer.WSLProxyRunning })
	if strings.Join(s.WSLProxyAddrs, ",") != "192.168.1.20" {
		t.Fatalf("WSL proxy addrs = %v", s.WSLProxyAddrs)
	}
	setHostSettings(t, h, `{"@matomezu/network:connect-hosts":false}`)
	s = waitHost(t, h, func(s HostStatus) bool { return !s.Open })
	if s.WSLProxy != "" || s.WSLProxyAddrs != nil {
		t.Fatalf("closed status = %+v", s)
	}
	<-f.stopped
}

func TestTheWSLProxyTellsWhenItCannotStart(t *testing.T) {
	f := newFakeWSLProxy(`'matomezu' is not recognized as an internal or external command`)
	h, _, _ := openWSLHost(t, f)
	s := waitHost(t, h, func(s HostStatus) bool { return s.WSLProxy == peer.WSLProxyUnavailable })
	if !s.Open {
		t.Fatalf("the entrance closed: %+v", s)
	}
}

// ほかのホストが WSLプロキシごしに頼むと、WSL は頭の行の番地を頼みの来た番地にする（ペアリングの頼みに載る番地）。ペアリングしたあとの hello もそのまま通る
func TestARequestThroughTheWSLProxyComesFromTheHeaderAddress(t *testing.T) {
	f := newFakeWSLProxy(`{"v":1,"ready":true}`)
	w, ws, start := openWSLHost(t, f)
	m, ms := openHost(t, "mac")
	via := forwardAs(t, start, "192.0.2.7:5555")
	if err := m.StartPairing(via, true); err != nil {
		t.Fatal(err)
	}
	waitFor(t, "the request on WSL", func() bool { return len(requestsOf(w)) == 1 })
	r := requestsOf(w)[0]
	if r.HostID != ms.HostID || !strings.HasPrefix(r.Addr, "192.0.2.7:") {
		t.Fatalf("request %+v", r)
	}
	userDoes(t, w, "@matomezu/network:pairing-accept", r.ID)
	waitFor(t, "accepted", func() bool { return pairingPhase(m) == "accepted" })
	m.CheckPeers()
	waitFor(t, "Mac sees WSL connected", func() bool {
		l := m.HostPeers().Paired
		return len(l) == 1 && l[0].HostID == ws.HostID && l[0].State == PeerConnected
	})
}

// running のあとで WSLプロキシが終わると、様子は stopped になり、入口は開いたまま、WSLプロキシの見つけたホストは消えて窓に知らせる
func TestTheWSLProxyEndingDropsItsSightings(t *testing.T) {
	seen, _ := json.Marshal(map[string]any{"sighting": map[string]any{"HostID": "mac", "Protocol": peer.Protocol, "Name": "mac", "Addr": "192.0.2.9", "Port": 7300, "life": 120}})
	quickRestarts(t)
	f := newFakeWSLProxy(`{"v":1,"ready":true}`, string(seen))
	h, _, _ := openWSLHost(t, f)
	waitFor(t, "the sighting through the WSL proxy", func() bool { return len(h.HostPeers().Found) == 1 })
	c := h.Join()
	t.Cleanup(func() { h.Leave(c) })
	close(f.end)
	told := false
	for deadline := time.After(5 * time.Second); !told; {
		select {
		case ev := <-c.ch:
			var p HostPeers
			told = ev.name == "host-peers" && json.Unmarshal(ev.data, &p) == nil && len(p.Found) == 0
		case <-deadline:
			t.Fatal("the window was not told the host list without the sighting")
		}
	}
	s := waitHost(t, h, func(s HostStatus) bool { return s.WSLProxy == peer.WSLProxyStopped })
	if !s.Open {
		t.Fatalf("the entrance closed: %+v", s)
	}
	if found := h.HostPeers().Found; len(found) != 0 {
		t.Fatalf("found = %+v", found)
	}
}

// 待ち始めたあとで終わった WSLプロキシは、間を置いて立て直す（そのあいだは starting）。使い切ったら stopped で止まり、［立て直す］でまた立つ。
// ［立て直す］のあとと、入口を開き直したあとは、立て直しの数を数え直す
func TestTheWSLProxyIsStartedAgainAfterItEnds(t *testing.T) {
	quickRestarts(t, 20*time.Millisecond, 20*time.Millisecond)
	f := scriptedWSLProxy(func(n int) ([]string, bool) { return []string{`{"v":1,"ready":true}`}, n != 8 })
	h, _, _ := openWSLHost(t, f)
	stopsAfter := func(starts int) {
		t.Helper()
		for range starts {
			f.started(t)
		}
		s := waitHost(t, h, func(s HostStatus) bool { return s.WSLProxy == peer.WSLProxyStopped })
		if !s.Open || len(f.start) != 0 {
			t.Fatalf("status %+v, starts left %d", s, len(f.start))
		}
	}
	stopsAfter(2) // 1 回目は openWSLHost が受けた。2・3 回目が立て直し
	if err := h.RestartWSLProxy(); err != nil {
		t.Fatal(err)
	}
	stopsAfter(3) // 4 回目が［立て直す］、5・6 回目が立て直し
	setHostSettings(t, h, `{"@matomezu/network:connect-hosts":false}`)
	waitHost(t, h, func(s HostStatus) bool { return !s.Open })
	setHostSettings(t, h, `{"@matomezu/network:connect-hosts":true}`)
	for range 2 { // 7 回目は開き直した入口で立てた物、8 回目がその立て直し
		f.started(t)
	}
	waitHost(t, h, func(s HostStatus) bool { return s.WSLProxy == peer.WSLProxyRunning })
	if err := h.RestartWSLProxy(); err == nil {
		t.Fatal("a running WSL proxy was started again")
	}
}

// Windows でポートが使われていたら、［別のポートにする］で WSL の入口ごと別の番号で開き直し、WSLプロキシもその番号で立て直す
func TestRepickingThePortForTheWSLProxy(t *testing.T) {
	f := scriptedWSLProxy(func(n int) ([]string, bool) {
		if n == 1 {
			return []string{`{"v":1,"failed":"port-in-use"}`}, false
		}
		return []string{`{"v":1,"ready":true}`}, false
	})
	h, s, _ := openWSLHost(t, f)
	waitHost(t, h, func(s HostStatus) bool { return s.WSLProxy == peer.WSLProxyPortInUse })
	if err := h.RepickHostPort(); err != nil {
		t.Fatal(err)
	}
	again := f.started(t)
	now := waitHost(t, h, func(s HostStatus) bool { return s.WSLProxy == peer.WSLProxyRunning })
	if !now.Open || now.Port == s.Port || again.Port != now.Port {
		t.Fatalf("before %d, now %+v, the WSL proxy asked for %d", s.Port, now, again.Port)
	}
}
