package server

import (
	"net"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/umaxyon/matomezu/internal/peer"
)

func init() {
	// 張り直すまでの間を、テストの待ち（waitFor の 5 秒）に収まるよう縮める
	reverseRetryFirst, reverseRetryMax = 20*time.Millisecond, 200*time.Millisecond
}

// closedPort は、いま誰も待っていないポート
func closedPort(t *testing.T) int {
	t.Helper()
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	port := ln.Addr().(*net.TCPAddr).Port
	ln.Close()
	return port
}

// natWorlds は、ペアリングした 2 つの常駐。a は NAT の後ろの形: a が名乗る待っている所は誰も待っていないポートで、b から a へは直に届かない
func natWorlds(t *testing.T) (as, bs *httptest.Server, a, b *Hub) {
	t.Helper()
	as, a = joinWorld(t, joinStore(t))
	bs, b = joinWorld(t, joinStore(t))
	var bStatus HostStatus
	for _, w := range []struct {
		h    *Hub
		name string
	}{{a, "a"}, {b, "b"}} {
		saved := 0
		testHost(t, w.h, 0, &saved)
		setHostSettings(t, w.h, `{"@matomezu/network:connect-hosts":true,"@matomezu/network:host-name":"`+w.name+`"}`)
		s := waitHost(t, w.h, func(s HostStatus) bool { return s.Open })
		if w.h == b {
			bStatus = s
		}
	}
	e := a.entrance.Load()
	e.mu.Lock()
	e.status.Port = closedPort(t)
	e.mu.Unlock()
	_ = a.StartPairing(addrOf(bStatus), true)
	waitFor(t, "the request on B", func() bool { return len(requestsOf(b)) == 1 })
	userDoes(t, b, "@matomezu/network:pairing-accept", requestsOf(b)[0].ID)
	defer func() {
		if t.Failed() {
			t.Logf("A: %+v", a.HostPeers().Paired)
			t.Logf("B: %+v", b.HostPeers().Paired)
		}
	}()
	waitFor(t, "both connected, B over A's reverse connection", func() bool {
		pa, pb := a.HostPeers().Paired, b.HostPeers().Paired
		return len(pa) == 1 && pa[0].State == PeerConnected && !pa[0].ReverseOnly &&
			len(pb) == 1 && pb[0].State == PeerConnected && pb[0].ReverseOnly
	})
	return as, bs, a, b
}

// a へ直に届かない b も、a が張ったリバース接続で、a のワークルームの一覧を取り、a へ送り、ペアリングを解いたと知らせられる
func TestAHostBehindNATIsReachedOverItsReverseConnection(t *testing.T) {
	serial(t, "閉じたポートを誰も取らないことを当てにする（natWorlds の直に届かない番地）")
	as, bs, a, b := natWorlds(t)
	joinedIn(t, as.URL, "LA", "100", "SA", "s1")
	s2 := joinedIn(t, bs.URL, "LB", "200", "SB", "s2")
	waitFor(t, "B has A's workrooms", func() bool {
		pb := b.HostPeers().Paired
		return len(pb) == 1 && len(pb[0].Workrooms) == 1 && pb[0].Workrooms[0].Name == "s1"
	})
	if sent := sendTo(t, bs.URL, s2, "a", "s1", "やあ"); !sent.OK {
		t.Fatalf("sent = %+v", sent)
	}
	if got := wakes(a, a.OpenWakesWith("100", "", "", WakeLimits{})); len(got) != 1 || got[0] != `matomezu from AI "s2" on host "b": "やあ"` {
		t.Fatalf("wakes = %q", got)
	}
	userDoes(t, b, "@matomezu/network:paired-host-remove", b.pairedHostRecords()[0].ID)
	waitFor(t, "A unpairs too", func() bool { return len(a.pairedHostRecords()) == 0 })
}

// 預かったリバース接続が切れたら、張った側が張り直し、つながりが戻る。入口を閉じた側は、張るのをやめ、預かった接続も閉じる
func TestAReverseConnectionComesBackAndClosesWithTheEntrance(t *testing.T) {
	serial(t, "閉じたポートを誰も取らないことを当てにする（natWorlds の直に届かない番地）")
	_, _, a, b := natWorlds(t)
	ps := b.entrance.Load().peers
	ps.mu.Lock()
	var first *http.Client
	for _, c := range ps.reverseIn {
		first = c
	}
	ps.mu.Unlock()
	peer.CloseReverse(first)
	waitFor(t, "a new reverse connection", func() bool {
		ps.mu.Lock()
		defer ps.mu.Unlock()
		for _, c := range ps.reverseIn {
			return c != first && peer.ReverseOpen(c)
		}
		return false
	})
	waitFor(t, "connected again", func() bool {
		pb := b.HostPeers().Paired
		return len(pb) == 1 && pb[0].State == PeerConnected && pb[0].ReverseOnly
	})
	setHostSettings(t, b, `{"@matomezu/network:connect-hosts":false}`)
	waitHost(t, b, func(s HostStatus) bool { return !s.Open })
	ps.mu.Lock()
	in, out := len(ps.reverseIn), len(ps.reverseOut)
	ps.mu.Unlock()
	if in != 0 || out != 0 {
		t.Fatalf("B still keeps %d taken and %d dialing", in, out)
	}
	waitFor(t, "A sees B gone", func() bool {
		pa := a.HostPeers().Paired
		return len(pa) == 1 && pa[0].State != PeerConnected
	})
}
